// ============ 撤销 / 重做（Task 45-b）：神力工具与地形笔刷的区域级快照 ============
// 设计（任务书首选方案——区域级增量）：
//   · 施放前捕获全图五层 typed array 的切片副本（terrain/owner/fire/radiate 共 ~160KB，
//     .slice() 零逻辑拷贝 <1ms）+ 单位生死/HP 轻量快照（id → {dead, hp}）；
//   · 施放完成后逐格 diff 出变动格 → 只存变动格的前值/后值（通常几十~几百格），
//     一次性 stroke（单发工具/右键菜单操作）同步 diff，长拖拽 stroke 在抬笔时 diff；
//   · 撤销 = 写回前值（terrain 走引擎公开 setTerrain 以携带全部副作用级联，
//     owner/fire/radiate 走引擎自身的「直写数组 + 同步集合 + markDirty」惯用法）；
//   · 单位尽力而为：被工具同步杀死且尚未被引擎清扫（reap）的单位可复活；
//     已被清开的单位与期间的自然死亡/繁衍不回滚（「模拟本身不可撤销」）。
// 栈上限 15 步，超限丢最旧；每步仅存变动切片，内存远小于 50MB 预算。
//
// 挂接点：GameCanvas.applyAt（工具应用）与 ContextMenu / GroupBar 的单位操作——
// 全部通过 beginStroke/endStroke 包裹，不改引擎任何文件。
import { getEngine } from '@/store/gameStore';

const MAX_ENTRIES = 15;
const TILES = 256 * 160; // 世界 256x160（与引擎 W/H 常量一致）

interface TileSnapshot {
  i: number;
  terrain: number;
  owner: number;
  fire: number;
  radiate: number;
}

interface UnitSnapshot {
  id: number;
  hp: number;
}

interface UndoEntry {
  label: string;
  /** 变动格前值（撤销写入） */
  before: TileSnapshot[];
  /** 变动格后值（重做写入；与 before 同序） */
  after: TileSnapshot[];
  /** 本次操作杀死的单位（死前 hp）——撤销时尽力复活 */
  killed: UnitSnapshot[];
  /** 本次操作生成的单位 id——撤销时处决（走引擎正常 reap 清扫） */
  spawned: number[];
}

// ---------------- stroke 捕获 ----------------

interface PreState {
  terrain: Uint8Array;
  owner: Int16Array;
  fire: Uint8Array;
  radiate: Uint8Array;
  units: Map<number, { dead: boolean; hp: number }>;
}

let pre: PreState | null = null;

/** 施放前调用：捕获快照（已在 stroke 中则幂等跳过） */
export function beginStroke(): void {
  if (pre) return;
  const eng = getEngine();
  const units = new Map<number, { dead: boolean; hp: number }>();
  for (const u of eng.units) units.set(u.id, { dead: u.dead, hp: u.hp });
  pre = {
    terrain: eng.terrain.slice(),
    owner: eng.owner.slice(),
    fire: eng.fire.slice(),
    radiate: eng.radiate.slice(),
    units,
  };
}

/**
 * 施放后调用：diff 出 UndoEntry 入栈。
 * @param trackUnits 是否追踪单位生死（单发工具/菜单操作传 true——同步 diff 零漏报；
 *                   长拖拽 stroke 传 false——期间模拟的繁衍会被误认成「工具生成」，
 *                   且工具击杀多已被引擎清扫，追了也不准，宁缺毋滥）
 * @returns 是否产生了可撤销的改动
 */
export function endStroke(label: string, trackUnits = false): boolean {
  const p = pre;
  pre = null;
  if (!p) return false;
  const eng = getEngine();
  const before: TileSnapshot[] = [];
  const after: TileSnapshot[] = [];
  const { terrain, owner, fire, radiate } = eng;
  for (let i = 0; i < TILES; i++) {
    if (
      terrain[i] !== p.terrain[i] ||
      owner[i] !== p.owner[i] ||
      fire[i] !== p.fire[i] ||
      radiate[i] !== p.radiate[i]
    ) {
      before.push({ i, terrain: p.terrain[i], owner: p.owner[i], fire: p.fire[i], radiate: p.radiate[i] });
      after.push({ i, terrain: terrain[i], owner: owner[i], fire: fire[i], radiate: radiate[i] });
    }
  }
  const killed: UnitSnapshot[] = [];
  const spawned: number[] = [];
  if (trackUnits) {
    for (const u of eng.units) {
      const was = p.units.get(u.id);
      if (!was) {
        spawned.push(u.id); // stroke 期间新出现的 id
      } else if (!was.dead && u.dead) {
        killed.push({ id: u.id, hp: was.hp }); // 同步致死且尚未被清扫
      }
    }
  }
  if (before.length === 0 && killed.length === 0 && spawned.length === 0) return false;
  undoStack.push({ label, before, after, killed, spawned });
  if (undoStack.length > MAX_ENTRIES) undoStack.shift();
  redoStack.length = 0; // 新操作清空重做分支（经典撤销栈语义）
  return true;
}

/** 放弃当前 stroke（如选点模式中断、Esc 打断） */
export function cancelStroke(): void {
  pre = null;
}

export function strokeActive(): boolean {
  return pre !== null;
}

// ---------------- 撤销 / 重做执行 ----------------

const undoStack: UndoEntry[] = [];
const redoStack: UndoEntry[] = [];

function applyEntry(entry: UndoEntry, dir: 'undo' | 'redo'): void {
  const eng = getEngine();
  const tiles = dir === 'undo' ? entry.before : entry.after;
  for (const t of tiles) {
    // terrain 走公开 setTerrain：连带 worldsim 海拔同步 / 渲染脏标 / 冻结洪水 decals /
    // 河道清理 / 火焰扑灭 / 水域领土回收等全部副作用级联（与工具施放路径同源）
    if (eng.terrain[t.i] !== t.terrain) eng.setTerrain(t.i, t.terrain);
    // owner / fire / radiate：引擎自身的「直写数组 + 集合簿记 + markDirty」惯用法
    // （healArea 等公开方法内部即如此写，此处照抄同款语义）
    eng.owner[t.i] = t.owner;
    if (t.fire > 0) {
      eng.fire[t.i] = t.fire;
      eng.fireSet.add(t.i);
    } else if (eng.fire[t.i] > 0) {
      eng.fire[t.i] = 0;
      eng.fireSet.delete(t.i);
    }
    if (t.radiate > 0) {
      eng.radiate[t.i] = t.radiate;
      eng.radSet.set(t.i, eng.tickCount + 2400); // 与引擎 nuke 路径同款过期时刻
      eng.markDirty(t.i);
    } else if (eng.radiate[t.i] > 0) {
      eng.radiate[t.i] = 0;
      eng.radSet.delete(t.i);
      eng.markDirty(t.i);
    }
    eng.markDirty(t.i);
  }
  if (dir === 'undo') {
    for (const k of entry.killed) {
      const u = eng.unitById.get(k.id);
      if (u && u.dead) {
        u.dead = false;
        u.hp = k.hp; // 恢复死前血量；桶索引每 tick 全量重建，复活即自动归队
      }
    }
    for (const id of entry.spawned) {
      const u = eng.unitById.get(id);
      if (u && !u.dead) u.dead = true; // 走引擎正常 reap（尸骸/家族/野生动物计数全套清算）
    }
  } else {
    for (const k of entry.killed) {
      const u = eng.unitById.get(k.id);
      if (u && !u.dead) u.dead = true;
    }
    // spawned 的重做无法精确复现（重放会生成不同 id 的新单位）——按「模拟不可撤销」跳过
  }
}

/** 撤销上一步；返回被撤销操作的标签（供 toast），无步可撤返回 null */
export function undo(): string | null {
  if (strokeActive()) return null; // 拖拽进行中不允许撤销（快照未落栈）
  const entry = undoStack.pop();
  if (!entry) return null;
  applyEntry(entry, 'undo');
  redoStack.push(entry);
  return entry.label;
}

/** 重做；返回被重做操作的标签，无步可重做返回 null */
export function redo(): string | null {
  if (strokeActive()) return null;
  const entry = redoStack.pop();
  if (!entry) return null;
  applyEntry(entry, 'redo');
  undoStack.push(entry);
  return entry.label;
}

export function undoDepth(): number {
  return undoStack.length;
}

export function redoDepth(): number {
  return redoStack.length;
}
