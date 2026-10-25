// ============ WbSpatial — Rust WASM 空间内核桥接（Task 45-a Stage 1） ============
// 位精确加速 engine.ts 的 9 桶敌我扫描（isEnemyFast 画像占 tick 的 ~20%，11M 次/tick）。
//
// 架构：raw C ABI（rust-core/ → public/wasm/wbcore.wasm）+ 单 arena TypedArray 视图直写。
//   · TS 永远是世界真态的唯一持有者；WASM 只持有扫描所需的 SoA 镜像
//   · pack（rebuildBuckets 内）→ scan（updateUnit 扫描环）→ sync（变异点回写）
//   · 位精确保证：迭代序 = JS 桶序（稳定 counting sort）；f64 逐运算对齐（Rust 侧 js_min
//     已实现 Math.min 的 NaN 传染语义）；扫描环零 RNG
//   · 任何异常 / 超限（种族≥512 / 桶格>4096 / 血仇>32 / 恐慌传染溢出）→ 回退 JS 原路径
//
// 内存布局与偏移编号必须与 rust-core/src/lib.rs 的 OFF_* 常量一一对齐。
import type { GameEngine } from '@/lib/game/engine';
import { RACES } from '@/lib/game/types';
import type { Unit } from '@/lib/game/types';

// wasm 资产地址（Task 78）：GitHub Pages 等子路径托管下必须带 basePath 前缀，
// 否则 fetch('/wasm/…') 会打到站点根而 404 → 批内核静默降级 JS 路径（性能腰斩）。
// NEXT_PUBLIC_BASE_PATH 由 next.config.ts 在静态导出时内联（dev/standalone 下为空）。
const WB_WASM_URL = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/wasm/wbcore.wasm`;

// arena 段编号（与 Rust OFF_* 一致；仅列出 TS 侧建视图需要的段）
const OFF_UX = 0;
const OFF_UY = 1;
const OFF_UPANIC = 2;
const OFF_GVALS = 3;
const OFF_UCIV = 4;
const OFF_URACE = 5;
const OFF_UID = 6;
const OFF_UCELL = 7;
const OFF_GIDS = 8;
const OFF_RACE_FLAGS = 11;
const OFF_DYN_PARENT = 12;
const OFF_ATWAR = 13;
const OFF_UDEAD = 14;
const OFF_UHASPANIC = 15;
const OFF_RESULT = 16;

const MAX_RACES = 512;
const MAX_CIVS = 64;
const GRUDGE_CAP = 32;
const RESULT_BYTES = 424; // repr(C)：40 + [u32;32]=128 → 168（8 对齐，无填充）+ [f64;32]=256

// ScanResult（#[repr(C)]）字段偏移
const R_ENEMY_I = 0; // i32 enemy_slot（溢出标志在 +4，仅 Rust 侧用）
const R_BEST_F = 8; // f64 best_d → enemy_d（连续两 f64）
const R_ALLIES_U = 24; // u32 allies → foes → panicN（连续三 u32）
const R_SLOTS_U = 40; // [u32; 32]（40+128=168，天然 8 对齐无填充）
const R_VALS_F = 168; // [f64; 32]

interface WbExports {
  memory: WebAssembly.Memory;
  wb_version(): number;
  wb_init(bw: number, bh: number, maxUnits: number): number;
  wb_reset(): void;
  wb_pack_end(n: number): void;
  wb_scan(slot: number, cx: number, cy: number, contagious: number, gLen: number): number;
  wb_sync_pos(slot: number, x: number, y: number): void;
  wb_sync_dead(slot: number, dead: number): void;
  wb_sync_panic(slot: number, has: number, val: number): void;
  wb_sync_full(slot: number, id: number, x: number, y: number, civ: number, race: number, dead: number, hasPanic: number, panic: number): void;
  wb_off(id: number): number;
  wb_arena_ptr(): number;
  wb_max_units(): number;
}

export interface ScanOut {
  enemySlot: number;
  bestD: number;
  enemyD: number;
  allies: number;
  foes: number;
  panicN: number;
  /** 传染目标（units 数组下标，与引擎 this.units[slot] 对应） */
  panicSlots: Uint32Array;
  panicVals: Float64Array;
}

/** 种族标志位（与 Rust F_* 一致） */
const F_HOSTILE = 1;
const F_CIV = 2;
const F_UNDEAD = 4;
const F_PREDATOR = 8;
const F_HERBIVORE = 16;

class WbSpatial {
  /** WASM 实例化 + 世界尺寸匹配完成 */
  ready = false;
  /** 加载失败（缺文件 / 实例化错误）→ 永久回退 JS */
  failed = false;
  /** 用户开关（wb_wasm，默认开） */
  enabled = typeof localStorage === 'undefined' ? true : localStorage.getItem('wb_wasm') !== '0';
  /** 运行统计（QA / 性能 HUD 用） */
  stats = { packMs: 0, packs: 0, scanCalls: 0, scanMs: 0, fallbacks: 0 };

  private ex: WbExports | null = null;
  private bootPromise: Promise<boolean> | null = null;
  private slots = new Map<Unit, number>();
  private bw = -1;
  private bh = -1;
  private raceCount = -1;
  private nu = 0;

  // arena 视图（worldInit 后有效）
  private vUx!: Float64Array;
  private vUy!: Float64Array;
  private vUPanic!: Float64Array;
  private vGVals!: Float64Array;
  private vUciv!: Int32Array;
  private vUrace!: Uint32Array;
  private vUid!: Uint32Array;
  private vUcell!: Uint32Array;
  private vGIds!: Int32Array;
  private vRaceFlags!: Uint8Array;
  private vDynParent!: Int32Array;
  private vAtWar!: Uint8Array;
  private vUdead!: Uint8Array;
  private vUHasPanic!: Uint8Array;
  private resI!: Int32Array;
  private resF!: Float64Array;
  private resU!: Uint32Array;
  private resSlots!: Uint32Array;
  private resVals!: Float64Array;

  /** 引擎每 tick 调用：WASM 路径是否可用 */
  active(): boolean {
    return this.enabled && this.ready && !this.failed;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (typeof localStorage !== 'undefined') localStorage.setItem('wb_wasm', v ? '1' : '0');
  }

  /** 加载（幂等；bytes 供 bun 基准直灌，浏览器走 fetch；带 bytes 可救活失败态） */
  async boot(bytes?: Uint8Array): Promise<boolean> {
    if (this.ready) return true;
    if (!bytes && (this.bootPromise !== null || this.failed)) return this.bootPromise ?? false;
    this.failed = false;
    const p = (async () => {
      try {
        const buf = bytes ?? new Uint8Array(await (await fetch(WB_WASM_URL)).arrayBuffer());
        const result = (await WebAssembly.instantiate(buf, {})) as WebAssembly.Instance | { instance: WebAssembly.Instance };
        const inst: WebAssembly.Instance = result instanceof WebAssembly.Instance ? result : result.instance;
        const ex = inst.exports as unknown as WbExports;
        if (ex.wb_version() < 1) throw new Error(`wbcore version mismatch`); // v2 向后兼容（scan ABI 不变）
        this.ex = ex;
        this.ready = true;
      } catch (e) {
        this.failed = true;
        console.warn('[wbcore] WASM 空间内核加载失败，永久回退 JS 扫描路径', e);
      }
      return this.ready;
    })();
    this.bootPromise = p;
    return p;
  }

  /** 世界重置（generate / applySave）：LUT / 父种链 / 战争位图清空，种族标志缓存重建 */
  onWorldReset(engine: GameEngine): void {
    if (!this.active() || !this.ensureWorld(engine)) return;
    this.ex!.wb_reset();
    this.raceCount = -1; // 动态种族 ID 复用 → 标志缓存必须随世界重建
  }

  /** 造物工坊：种族定义原地编辑（hostile/isCiv/undead/predator 标志位变化）后强制重建标志缓存。
   *  raceCount 缓存只在 RACES 键数变化时重建——原地改标志位不会触发，必须显式失效。 */
  invalidateRaceFlags(): void {
    this.raceCount = -1;
  }

  private ensureWorld(engine: GameEngine): boolean {
    if (!this.active() || !this.ex) return false;
    if (this.bw === engine.bw && this.bh === engine.bh && this.nu > 0) return true;
    const ex = this.ex;
    if (engine.civs.length > MAX_CIVS) {
      this.failed = true;
      return false;
    }
    if (ex.wb_init(engine.bw, engine.bh, ex.wb_max_units()) !== 1) {
      this.failed = true;
      return false;
    }
    const mem = ex.memory.buffer;
    const base = ex.wb_arena_ptr();
    const at = (id: number) => base + ex.wb_off(id);
    const NU = ex.wb_max_units();
    this.nu = NU;
    this.vUx = new Float64Array(mem, at(OFF_UX), NU);
    this.vUy = new Float64Array(mem, at(OFF_UY), NU);
    this.vUPanic = new Float64Array(mem, at(OFF_UPANIC), NU);
    this.vGVals = new Float64Array(mem, at(OFF_GVALS), GRUDGE_CAP);
    this.vUciv = new Int32Array(mem, at(OFF_UCIV), NU);
    this.vUrace = new Uint32Array(mem, at(OFF_URACE), NU);
    this.vUid = new Uint32Array(mem, at(OFF_UID), NU);
    this.vUcell = new Uint32Array(mem, at(OFF_UCELL), NU);
    this.vGIds = new Int32Array(mem, at(OFF_GIDS), GRUDGE_CAP);
    this.vRaceFlags = new Uint8Array(mem, at(OFF_RACE_FLAGS), MAX_RACES);
    this.vDynParent = new Int32Array(mem, at(OFF_DYN_PARENT), MAX_RACES);
    this.vAtWar = new Uint8Array(mem, at(OFF_ATWAR), MAX_CIVS * MAX_CIVS);
    this.vUdead = new Uint8Array(mem, at(OFF_UDEAD), NU);
    this.vUHasPanic = new Uint8Array(mem, at(OFF_UHASPANIC), NU);
    const res = at(OFF_RESULT);
    this.resI = new Int32Array(mem, res + R_ENEMY_I, 1);
    this.resF = new Float64Array(mem, res + R_BEST_F, 2);
    this.resU = new Uint32Array(mem, res + R_ALLIES_U, 3);
    this.resSlots = new Uint32Array(mem, res + R_SLOTS_U, GRUDGE_CAP);
    this.resVals = new Float64Array(mem, res + R_VALS_F, GRUDGE_CAP);
    void RESULT_BYTES;
    this.bw = engine.bw;
    this.bh = engine.bh;
    return true;
  }

  /** 每 tick 打包（rebuildBuckets 尾部调用）：单位 SoA 镜像 + 网格 counting-sort */
  pack(engine: GameEngine): void {
    if (!this.ensureWorld(engine)) return;
    const t0 = performance.now();
    const ex = this.ex!;
    const units = engine.units;
    const n = units.length;
    if (n > this.nu) {
      this.failed = true; // 单位数超 4096 上限（引擎生态上限内不会发生）
      return;
    }
    // —— 种族标志缓存（RACES 仅在种化时增长；世界重置时重建） ——
    const raceKeys = Object.keys(RACES);
    if (raceKeys.length !== this.raceCount) {
      this.vRaceFlags.fill(0);
      for (const k of raceKeys) {
        const id = Number(k);
        if (id >= MAX_RACES) continue;
        const d = (RACES as Record<number, { hostile?: boolean; isCiv?: boolean; undead?: boolean; predator?: boolean; flying?: boolean }>)[id];
        if (!d) continue;
        let f = 0;
        if (d.hostile) f |= F_HOSTILE;
        if (d.isCiv) f |= F_CIV;
        if (d.undead) f |= F_UNDEAD;
        if (d.predator) f |= F_PREDATOR;
        if (id === 6 || id === 10 || id === 11 || id === 12) f |= F_HERBIVORE; // SHEEP/DEER/PENGUIN/CAMEL
        if (d.flying) f |= 32; // 飞行位：rust 地形伤害豁免读 f1 bit32（units.rs 水伤害检查）—— 之前漏写导致巨龙/天使在批内核下被“溺水”
        this.vRaceFlags[id] = f;
      }
      this.raceCount = raceKeys.length;
    }
    // —— 动态种族父链（每 tick 重镜；种化事件罕见但写入廉价） ——
    this.vDynParent.fill(-1);
    for (const [id, d] of engine.dynRaces) {
      if (id >= 0 && id < MAX_RACES) this.vDynParent[id] = d.parent;
    }
    // —— 战争位图（rel < -20 即交战；与 atWar() 同判据） ——
    this.vAtWar.fill(0);
    for (const [k, v] of engine.rel) {
      if (v >= -20) continue;
      const dash = k.indexOf('-');
      const a = +k.slice(0, dash);
      const b = +k.slice(dash + 1);
      if (a >= 0 && a < MAX_CIVS && b >= 0 && b < MAX_CIVS) {
        this.vAtWar[a * MAX_CIVS + b] = 1;
        this.vAtWar[b * MAX_CIVS + a] = 1;
      }
    }
    // —— 单位镜像（cell 公式与 rebuildBuckets 逐字符一致：|0 截断 + 双向 clamp） ——
    const slots = this.slots;
    slots.clear();
    const bw = engine.bw;
    const maxX = bw - 1;
    const maxY = engine.bh - 1;
    const vUx = this.vUx;
    const vUy = this.vUy;
    const vUciv = this.vUciv;
    const vUrace = this.vUrace;
    const vUid = this.vUid;
    const vUcell = this.vUcell;
    const vUdead = this.vUdead;
    const vUHasPanic = this.vUHasPanic;
    const vUPanic = this.vUPanic;
    for (let i = 0; i < n; i++) {
      const u = units[i];
      slots.set(u, i);
      vUx[i] = u.x;
      vUy[i] = u.y;
      vUciv[i] = u.civ;
      const rc = u.race;
      if (rc >= MAX_RACES) {
        this.failed = true; // 种族 ID 超界（动态种化远达不到）→ 永久回退
        return;
      }
      vUrace[i] = rc;
      vUid[i] = u.id;
      vUdead[i] = u.dead ? 1 : 0;
      const p = u.panic;
      if (p != null) {
        vUHasPanic[i] = 1;
        vUPanic[i] = p;
      } else {
        vUHasPanic[i] = 0;
        vUPanic[i] = 0;
      }
      let cx = (u.x / 4) | 0;
      let cy = (u.y / 4) | 0;
      if (cx > maxX) cx = maxX;
      else if (cx < 0) cx = 0;
      if (cy > maxY) cy = maxY;
      else if (cy < 0) cy = 0;
      vUcell[i] = cy * bw + cx;
    }
    ex.wb_pack_end(n);
    const t1 = performance.now();
    this.stats.packs++;
    this.stats.packMs = this.stats.packMs * 0.9 + (t1 - t0) * 0.1;
  }

  /**
   * 9 桶扫描（updateUnit 扫描环替代）。
   * 返回 null = 本次回退 JS 原路径（超限/溢出/未打包）。
   */
  scan(engine: GameEngine, u: Unit, contagious: boolean, cx: number, cy: number): ScanOut | null {
    void engine;
    const ex = this.ex;
    if (!ex) return null;
    const slot = this.slots.get(u);
    if (slot === undefined) return null;
    // 扫描者行自刷新：前导 panic 衰减 / 任何前段变异兜底（JS 读的是活对象）
    this.vUx[slot] = u.x;
    this.vUy[slot] = u.y;
    this.vUciv[slot] = u.civ;
    this.vUrace[slot] = u.race;
    this.vUid[slot] = u.id;
    this.vUdead[slot] = u.dead ? 1 : 0;
    const p = u.panic;
    if (p != null) {
      this.vUHasPanic[slot] = 1;
      this.vUPanic[slot] = p;
    } else {
      this.vUHasPanic[slot] = 0;
      this.vUPanic[slot] = 0;
    }
    // 血仇缓冲（扫描者的 gIds/gVal 活读；-1 = null/undefined 允许视野粗筛早跳）
    const g = u.gIds;
    let gLen = -1;
    if (g != null) {
      gLen = g.length;
      if (gLen > GRUDGE_CAP) {
        this.stats.fallbacks++;
        return null;
      }
      for (let i = 0; i < gLen; i++) {
        this.vGIds[i] = g[i];
        this.vGVals[i] = u.gVal?.[i] ?? 1;
      }
    }
    const t0 = performance.now();
    const rc = ex.wb_scan(slot, cx, cy, contagious ? 1 : 0, gLen);
    const t1 = performance.now();
    this.stats.scanCalls++;
    this.stats.scanMs = this.stats.scanMs * 0.9 + (t1 - t0) * 0.1;
    if (rc !== 1) {
      this.stats.fallbacks++;
      return null; // 0 参数非法 / 2 恐慌传染溢出 → JS 环重算保位精确
    }
    return {
      enemySlot: this.resI[0],
      bestD: this.resF[0],
      enemyD: this.resF[1],
      allies: this.resU[0],
      foes: this.resU[1],
      panicN: this.resU[2],
      panicSlots: this.resSlots,
      panicVals: this.resVals,
    };
  }

  /** unitsTick 每单位更新后收口：位置 / 死亡 / 恐恐慌回写镜像 */
  syncAfterUpdate(u: Unit): void {
    if (!this.ready) return;
    const slot = this.slots.get(u);
    if (slot === undefined) return;
    this.vUx[slot] = u.x;
    this.vUy[slot] = u.y;
    this.vUdead[slot] = u.dead ? 1 : 0;
    const p = u.panic;
    if (p != null) {
      this.vUHasPanic[slot] = 1;
      this.vUPanic[slot] = p;
    } else {
      this.vUHasPanic[slot] = 0;
      this.vUPanic[slot] = 0;
    }
  }

  /** 战斗中击杀敌人（enemy.dead = true 处调用） */
  syncDead(u: Unit): void {
    if (!this.ready) return;
    const slot = this.slots.get(u);
    if (slot === undefined) return;
    this.vUdead[slot] = u.dead ? 1 : 0;
  }

  /** 恐慌外源变异（witnessDeath 目击者） */
  syncPanic(u: Unit): void {
    if (!this.ready) return;
    const slot = this.slots.get(u);
    if (slot === undefined) return;
    const p = u.panic;
    if (p != null) {
      this.vUHasPanic[slot] = 1;
      this.vUPanic[slot] = p;
    } else {
      this.vUHasPanic[slot] = 0;
      this.vUPanic[slot] = 0;
    }
  }

  /** 复合变异全行同步（zombify 原地变种族/阵营） */
  syncFull(u: Unit): void {
    if (!this.ready) return;
    const slot = this.slots.get(u);
    if (slot === undefined) return;
    this.vUx[slot] = u.x;
    this.vUy[slot] = u.y;
    this.vUciv[slot] = u.civ;
    this.vUrace[slot] = u.race;
    this.vUid[slot] = u.id;
    this.vUdead[slot] = u.dead ? 1 : 0;
    const p = u.panic;
    if (p != null) {
      this.vUHasPanic[slot] = 1;
      this.vUPanic[slot] = p;
    } else {
      this.vUHasPanic[slot] = 0;
      this.vUPanic[slot] = 0;
    }
  }
}

export const WB = new WbSpatial();

// QA 调试钩子：window.__wb.wasm 读取器의数据源（gameStore __wb 消费）
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__wbWasmCore = WB;
}

// ════════════════════════════════════════════════════════════════════
// ═══ Stage 2：unitsTick 全量批处理桥接（wbbatch 协议） ═══
// ════════════════════════════════════════════════════════════════════
// Rust 侧执行 updateUnit/moveUnit/spawnUnit/updateBoat/战斗树/职业AI/繁衍/拾取，
// 视觉与播报以动作流回放，模拟态以镜像+动作双轨同步；稀疏复杂路径 bail 给 JS 接力。
// RNG（mulberry32）状态驻留 arena —— 双向同步保证流位精确。

import { ITEM_DEFS, SLOT_ORDER } from '@/lib/game/items';
import { JOBS, TRAITS, BUILDING_DEFS } from '@/lib/game/types';
import { FIRST } from '@/lib/game/names';
import { collectDecision, collectFleeEnd, collectEnemyGone, collectKill, collectorStats } from '@/lib/game/online/collector';
import { neuroStats, neuroHeadsSnapshot } from '@/lib/game/neuro';
import { ep as getEp } from '@/lib/game/engineParams';

// —— 区域 id（与 lib.rs 对齐；仅 v2 新增）——
const OFF_UTX = 18, OFF_UTY = 19, OFF_UHP = 20, OFF_UMAXHP = 21, OFF_UDMG = 22, OFF_USPEED = 23;
const OFF_UAGE = 24, OFF_UMAXAGE = 25, OFF_UKILLS = 26, OFF_UCD = 27, OFF_UFD = 28, OFF_UBREATH = 29;
const OFF_ULX = 30, OFF_ULY = 31, OFF_USXK = 32, OFF_USYK = 33, OFF_USTK = 34, OFF_UATK = 35;
const OFF_UCHILL = 36, OFF_UFLEET = 37, OFF_UBLESS = 38, OFF_UCURSE = 39, OFF_UFERT = 40, OFF_UDETOUR = 41, OFF_UHURT = 42;
const OFF_UJOB = 43, OFF_UTRAIT = 44, OFF_UINF = 45, OFF_UFLIP = 46, OFF_UPAR = 47, OFF_UBOAT = 48;
const OFF_UBTL = 49, OFF_UCVN = 50, OFF_UARMY = 51, OFF_UGEAR = 52, OFF_UGENE = 53, OFF_UFAM = 54, OFF_UFGN = 55;
const OFF_UNAME = 56, OFF_UGLN = 57, OFF_UGIDS = 58, OFF_UGVAL = 59;
const OFF_TERR = 60, OFF_FIREG = 61, OFF_RAD = 62, OFF_ROAD = 63, OFF_BLDK = 64, OFF_OWN = 65;
const OFF_CIVN = 67, OFF_CVPOP = 68, OFF_CVHOU = 69, OFF_CVGLD = 70, OFF_CVCAP = 71, OFF_CVAL = 72, OFF_CVGOV = 73;
const OFF_CVTECH = 74, OFF_CVDIR = 75, OFF_CVPC = 76, OFF_CVMKT = 77;
const OFF_FAMN = 78, OFF_FMID = 79, OFF_FMRACE = 80, OFF_FMNUM = 81, OFF_FMSEQ = 82, OFF_FMNAME = 83;
const OFF_BLDN = 84, OFF_BLDI = 85, OFF_BLDXY = 86, OFF_BLDC = 87, OFF_BLDHP = 88, OFF_BLDDMG = 89;
const OFF_ITMN = 90, OFF_ITMK = 91, OFF_ITMXY = 92;
const OFF_NEUW = 93, OFF_NCTL = 94;
const OFF_RNGS = 95, OFF_TICK = 96, OFF_FRAME = 97, OFF_PAR = 98, OFF_USEQ = 99;
const OFF_EPS = 100, OFF_LAWS = 101, OFF_FXP = 102, OFF_FXLEN = 103, OFF_FXMIN = 104, OFF_FXMINN = 105;
const OFF_WILD = 106, OFF_GRASS = 107, OFF_DAYPH = 108, OFF_REPRM = 109, OFF_PREY = 110;
const OFF_SPB = 111, OFF_SPBH = 112, OFF_TRN = 113, OFF_TRDMG = 114, OFF_TRHP = 115, OFF_TRSPD = 116, OFF_TRREG = 117, OFF_TRFL = 118;
const OFF_CNT = 119;
const OFF_ACT = 120, OFF_ACTN = 121, OFF_BAILK = 122, OFF_BAILS = 123, OFF_BAILL = 124, OFF_BAILP = 125;
const OFF_DIRTY = 126, OFF_DLIST = 127, OFF_DLISTN = 128, OFF_BATCHR = 129;
const OFF_TBR = 130, OFF_TBF = 131, OFF_TBJ = 132, OFF_TBI = 133, OFF_TBIN = 134;
const OFF_FRSTOFF = 135, OFF_FRSTN = 136, OFF_FRSTP = 137, OFF_FAMP = 138, OFF_TBT = 139, OFF_MLOOT = 140;
const OFF_NEUCALL = 141, OFF_COLEN = 142, OFF_DMGL = 143, OFF_DMGN = 144, OFF_FIREN = 145;
const OFF_WILDCAP = 146, OFF_MONCAP = 147, OFF_MISC = 148, OFF_TBHP = 149, OFF_GUNBM = 150, OFF_BEAMBM = 151;

const TILES = 40960;
const MAX_FAM = 256, MAX_BLD = 1024, MAX_ITEMS2 = 256, MAX_TRAITS2 = 32, MAX_ITEMDEFS = 128;

// —— Task 50：pack2 分段截面位（bail 分级重打包）——
// GRIDS=6 网格 bulk 拷贝 / WAR=战争位图+dynRaces / CIV=文明表 / FAM=家族表 / BLD=建筑表+damagedSet
// ITEM=物品表 / SCAL=标量+rng+eps+laws+fx 队列+wild+prey+speciesBase / HOT=单位热行+cell / META=单位 meta 行
export const WP_GRIDS = 1, WP_WAR = 2, WP_CIV = 4, WP_FAM = 8, WP_BLD = 16, WP_ITEM = 32;
export const WP_SCAL = 64, WP_HOT = 128, WP_META = 256;
export const WP_ALL = 511;

// —— 动作 opcode（与 units.rs 一致）——
const ACT_FX = 1, ACT_FX_EVICT = 2, ACT_SND = 3, ACT_EVT = 4, ACT_TOAST = 5, ACT_TERRAIN = 6;
const ACT_IGNITE = 7, ACT_FIRE_CLEAR = 8, ACT_BHP = 9, ACT_DMG_ADD = 10, ACT_DMG_DEL = 11, ACT_CIV = 12;
const ACT_SPAWN = 13, ACT_FAM_NEW = 14, ACT_FAM_MILE = 15, ACT_FAM_ONKILL = 16, ACT_BATTLE = 17;
const ACT_WARKILL = 18, ACT_ITEM_DEL = 19, ACT_CNT = 20, ACT_TELEM = 21, ACT_CORPSE = 22, ACT_BLOOD = 23;

const FX_KINDS = ['', 'bless', 'curse', 'water', 'hammer', 'hit', 'spawn', 'skull', 'explosion', 'blood', 'dmg', 'heart', 'coin', 'dust', 'tsunami', 'fireball', 'arrow', 'bullet', 'laser'];
const TXTS = ['', '吞噬', '石化', '毒', '闪'];
const EVTS: Record<number, (p: ActReader) => void> = {};
const SNDS = ['', 'place', 'coin'];

// ep 键序（与 units.rs EP_* 一致）
const EP_KEYS = ['pop.reproMul', 'eco.regrowBase', 'eco.grazeRate', 'fire.spreadMul', 'fire.damage', 'war.declareRate', 'war.tensionDecay', 'war.milPressure', 'evo.mutationRate', 'social.panicDecay', 'social.panicRout', 'social.grudgeDecay', 'nature.quakeStress', 'nature.stormRate', 'nature.erosionRate'];

interface WbExports2 extends WbExports {
  wb_units_batch(from: number, limit: number): number;
  wb_grow(n: number): void;
}

class ActReader {
  constructor(private a: Uint8Array, private dv: DataView, private base: number, public cur: number) {}
  u8(): number { return this.a[this.cur++]; }
  i32(): number { const v = this.dv.getInt32(this.base + this.cur, true); this.cur += 4; return v; }
  u32(): number { const v = this.dv.getUint32(this.base + this.cur, true); this.cur += 4; return v; }
  f64(): number { const v = this.dv.getFloat64(this.base + this.cur, true); this.cur += 8; return v; }
  skip(n: number): void { this.cur += n; }
  bytes(n: number): Uint8Array { const out = this.a.slice(this.cur, this.cur + n); this.cur += n; return out; }
}

interface WbUnitRowViews {
  tx: Float64Array; ty: Float64Array; hp: Float64Array; maxHp: Float64Array; dmg: Float64Array; speed: Float64Array;
  age: Float64Array; maxAge: Float64Array; kills: Float64Array; cd: Float64Array; fd: Float64Array; breath: Float64Array;
  lx: Float64Array; ly: Float64Array; sxk: Float64Array; syk: Float64Array; stk: Int32Array; atk: Float64Array;
  chill: Float64Array; fleet: Float64Array; bless: Float64Array; curse: Float64Array; fert: Float64Array; detour: Float64Array; hurt: Float64Array;
  job: Int32Array; trait: Int32Array; inf: Uint8Array; flip: Uint8Array; par: Uint8Array; boat: Uint8Array;
  btl: Int32Array; cvn: Int32Array; army: Int32Array; gear: Int32Array; gene: Float64Array; fam: Int32Array; fgn: Int32Array;
  name: Uint8Array; gln: Int32Array; gids: Int32Array; gval: Float64Array;
}

export interface BatchResult {
  code: number; // 1 完成 / 2 bail / 3 动作溢出（JS 接管剩余）
  slot: number; // bail 单位下标
  kind: number; // bail 类型
  data: Float64Array; // BAILP 8×f64
}

/** Stage 2 批处理桥接（独立实例/独立内存；Stage 1 WB 保留为 JS 回退扫描） */
class WbBatch {
  ready = false;
  failed = false;
  batchReady = false; // 表格已灌 + 至少一次全量 pack 完成
  /** 【性能修复 v74】bail 风暴自动恢复：旧版 guard 触发即 failed=true 永久回退 JS 路径
   *  （实测模拟吞吐直接砍半，且无任何自愈途径 —— 长会话带海军/商队的世界几乎必然触发）。
   *  现改为「冷却后重试 + 指数退避」：600 → 1200 → 2400 → 4800 tick 封顶；
   *  连续 1800 tick 稳定批处理则清零退避。结构性失败（镜像超限/表异常）仍保持永久回退。 */
  failStreak = 0;
  retryAtTick = -1;
  goodStreak = 0;
  /** guard 触发时登记冷却（由 unitsTick 调用；不直接改 failed —— 调用方已置位） */
  scheduleRetry(nowTick: number): void {
    this.retryAtTick = nowTick + Math.min(4800, 600 * (1 << Math.min(3, this.failStreak)));
    this.failStreak++;
    this.goodStreak = 0;
  }
  /** 到期重试：重置 failed 并强制全量 meta 重灌（镜像可能与 JS 态漂移了一整个冷却期）。
   *  返回 true 表示本次 unitsTick 应重新尝试批路径（pack2 会重建镜像）。 */
  retryDue(nowTick: number): boolean {
    if (!this.failed || !this.ready || !this.enabledCheck() || this.retryAtTick < 0 || nowTick < this.retryAtTick) return false;
    this.failed = false;
    this.retryAtTick = -1;
    this.metaDirty = true; // 冷却期内 JS 路径直改对象 —— meta 列必须全量重灌
    this.rowDirtyN = 0;
    return true;
  }
  /** 一轮完整批处理无 guard 触发 → 退避计数衰减（连续稳定 1800 tick ≈ 2 分钟游戏后彻底清零） */
  noteGood(): void {
    if (this.failStreak > 0 && ++this.goodStreak >= 1800) { this.failStreak = 0; this.goodStreak = 0; }
  }
  /** Stage 3 行级分层：meta 列（id/civ/race/装备/基因/名/血仇等稀疏变异列）脏标记 —— 变异收口方法 touchMeta() 触发，下 tick 重灌 */
  metaDirty = true;
  /** Stage 3+ 行级增量：仅重灌标记行（spawn 新行 / reap 移位行）—— 避免繁衍活跃期全表重灌 */
  private rowDirty: Uint8Array | null = null;
  private rowDirtyN = 0;
  stats = { batchMs: 0, batches: 0, bails: 0, replayMs: 0, pack2Ms: 0, packs: 0, litePacks: 0, actions: 0, p2grid: 0, p2tab: 0, p2rows: 0, p2misc: 0, p2civ: 0, p2bld: 0, metaSkips: 0, metaHits: 0, sentryWarn: 0 };

  private ex: WbExports2 | null = null;
  private bootPromise: Promise<boolean> | null = null;
  private bw = -1; private bh = -1; private nu = 0;
  private tablesVersion = -1;
  private weightsVersion = -1;
  private traitsKeyCache = '';
  private firstPoolVersion = -1;

  // 注册表
  private itemIdMap = new Map<string, number>();
  private itemIds: string[] = [];
  private traitIdMap = new Map<string, number>();
  private traitKeys: string[] = [];
  private dec = new TextDecoder('utf-8', { fatal: false });

  // 视图
  private mem!: ArrayBuffer;
  private at!: (id: number) => number;
  private row!: WbUnitRowViews;
  private gTerr!: Uint8Array; private gFire!: Uint8Array; private gRad!: Uint8Array; private gRoad!: Uint8Array; private gBldk!: Uint8Array; private gOwn!: Int16Array;
  private vAct!: Uint8Array; private actDv!: DataView; private actBase = 0;
  private vBailP!: Float64Array; private vDlist!: Uint32Array; private vRng!: Uint32Array;
  private vUx!: Float64Array; private vUy!: Float64Array; private vUciv!: Int32Array; private vUrace!: Uint32Array;
  private vUid!: Uint32Array; private vUcell!: Uint32Array; private vUdead!: Uint8Array; private vUHasPanic!: Uint8Array; private vUPanic!: Float64Array;

  active(): boolean { return this.enabledCheck() && this.ready && !this.failed; }
  private enabledCheck(): boolean { return (WB as unknown as { enabled: boolean }).enabled; } // 与 Stage 1 共享开关

  async boot(bytes?: Uint8Array): Promise<boolean> {
    if (this.ready) return true;
    if (!bytes && (this.bootPromise !== null || this.failed)) return this.bootPromise ?? false;
    this.failed = false;
    const p = (async () => {
      try {
        const buf = bytes ?? new Uint8Array(await (await fetch(WB_WASM_URL)).arrayBuffer());
        const result = (await WebAssembly.instantiate(buf, {})) as WebAssembly.Instance | { instance: WebAssembly.Instance };
        const inst: WebAssembly.Instance = result instanceof WebAssembly.Instance ? result : result.instance;
        const ex = inst.exports as unknown as WbExports2;
        if (ex.wb_version() !== 2) throw new Error('wbcore v2 mismatch');
        this.ex = ex;
        this.ready = true;
      } catch (e) {
        this.failed = true;
        console.warn('[wbbatch] Stage 2 批内核加载失败，回退 JS 路径', e);
      }
      return this.ready;
    })();
    this.bootPromise = p;
    return p;
  }

  onWorldReset(engine: GameEngine): void {
    if (!this.active() || !this.ensureWorld(engine)) return;
    this.ex!.wb_reset();
    this.tablesVersion = -1; // 表格重灌
    this.weightsVersion = -1;
    this.traitsKeyCache = '';
    this.batchReady = false;
    this.metaDirty = true; // Stage 3：新世界全部行重灌
  }

  private ensureWorld(engine: GameEngine): boolean {
    if (!this.active() || !this.ex) return false;
    if (this.bw === engine.bw && this.bh === engine.bh && this.nu > 0) return true;
    const ex = this.ex;
    if (ex.wb_init(engine.bw, engine.bh, ex.wb_max_units()) !== 1) { this.failed = true; return false; }
    this.mem = ex.memory.buffer;
    const base = ex.wb_arena_ptr();
    this.at = (id: number) => base + ex.wb_off(id);
    const NU = ex.wb_max_units();
    this.nu = NU;
    const m = this.mem;
    const A = this.at;
    this.row = {
      tx: new Float64Array(m, A(OFF_UTX), NU), ty: new Float64Array(m, A(OFF_UTY), NU),
      hp: new Float64Array(m, A(OFF_UHP), NU), maxHp: new Float64Array(m, A(OFF_UMAXHP), NU),
      dmg: new Float64Array(m, A(OFF_UDMG), NU), speed: new Float64Array(m, A(OFF_USPEED), NU),
      age: new Float64Array(m, A(OFF_UAGE), NU), maxAge: new Float64Array(m, A(OFF_UMAXAGE), NU),
      kills: new Float64Array(m, A(OFF_UKILLS), NU), cd: new Float64Array(m, A(OFF_UCD), NU),
      fd: new Float64Array(m, A(OFF_UFD), NU), breath: new Float64Array(m, A(OFF_UBREATH), NU),
      lx: new Float64Array(m, A(OFF_ULX), NU), ly: new Float64Array(m, A(OFF_ULY), NU),
      sxk: new Float64Array(m, A(OFF_USXK), NU), syk: new Float64Array(m, A(OFF_USYK), NU),
      stk: new Int32Array(m, A(OFF_USTK), NU), atk: new Float64Array(m, A(OFF_UATK), NU),
      chill: new Float64Array(m, A(OFF_UCHILL), NU), fleet: new Float64Array(m, A(OFF_UFLEET), NU),
      bless: new Float64Array(m, A(OFF_UBLESS), NU), curse: new Float64Array(m, A(OFF_UCURSE), NU),
      fert: new Float64Array(m, A(OFF_UFERT), NU), detour: new Float64Array(m, A(OFF_UDETOUR), NU),
      hurt: new Float64Array(m, A(OFF_UHURT), NU),
      job: new Int32Array(m, A(OFF_UJOB), NU), trait: new Int32Array(m, A(OFF_UTRAIT), NU),
      inf: new Uint8Array(m, A(OFF_UINF), NU), flip: new Uint8Array(m, A(OFF_UFLIP), NU),
      par: new Uint8Array(m, A(OFF_UPAR), NU), boat: new Uint8Array(m, A(OFF_UBOAT), NU),
      btl: new Int32Array(m, A(OFF_UBTL), NU), cvn: new Int32Array(m, A(OFF_UCVN), NU),
      army: new Int32Array(m, A(OFF_UARMY), NU), gear: new Int32Array(m, A(OFF_UGEAR), NU * 7),
      gene: new Float64Array(m, A(OFF_UGENE), NU * 4), fam: new Int32Array(m, A(OFF_UFAM), NU),
      fgn: new Int32Array(m, A(OFF_UFGN), NU), name: new Uint8Array(m, A(OFF_UNAME), NU * 32),
      gln: new Int32Array(m, A(OFF_UGLN), NU), gids: new Int32Array(m, A(OFF_UGIDS), NU * 8),
      gval: new Float64Array(m, A(OFF_UGVAL), NU * 8),
    };
    this.gTerr = new Uint8Array(m, A(OFF_TERR), TILES);
    this.gFire = new Uint8Array(m, A(OFF_FIREG), TILES);
    this.gRad = new Uint8Array(m, A(OFF_RAD), TILES);
    this.gRoad = new Uint8Array(m, A(OFF_ROAD), TILES);
    this.gBldk = new Uint8Array(m, A(OFF_BLDK), TILES);
    this.gOwn = new Int16Array(m, A(OFF_OWN), TILES);
    if (this.virtBoat.length !== NU) this.virtBoat = new Uint8Array(NU);
    this.vAct = new Uint8Array(m, A(OFF_ACT), 262144);
    this.actDv = new DataView(m, A(OFF_ACT), 262144);
    this.actBase = A(OFF_ACT);
    this.vBailP = new Float64Array(m, A(OFF_BAILP), 8);
    this.vDlist = new Uint32Array(m, A(OFF_DLIST), 4096);
    this.vRng = new Uint32Array(m, A(OFF_RNGS), 1);
    this.vUx = new Float64Array(m, A(OFF_UX), NU);
    this.vUy = new Float64Array(m, A(OFF_UY), NU);
    this.vUciv = new Int32Array(m, A(OFF_UCIV), NU);
    this.vUrace = new Uint32Array(m, A(OFF_URACE), NU);
    this.vUid = new Uint32Array(m, A(OFF_UID), NU);
    this.vUcell = new Uint32Array(m, A(OFF_UCELL), NU);
    this.vUdead = new Uint8Array(m, A(OFF_UDEAD), NU);
    this.vUHasPanic = new Uint8Array(m, A(OFF_UHASPANIC), NU);
    this.vUPanic = new Float64Array(m, A(OFF_UPANIC), NU);
    this.bw = engine.bw; this.bh = engine.bh;
    return true;
  }

  // ══════════ 引导表（boot / 变化时重灌）══════════
  private packTables(engine: GameEngine): void {
    const ex = this.ex!;
    const m = this.mem; const A = this.at;
    // —— 物品注册表（ITEM_DEFS 静态：仅首灌）——
    if (this.itemIdMap.size === 0) {
      const keys = Object.keys(ITEM_DEFS);
      if (keys.length > MAX_ITEMDEFS) { this.failed = true; return; }
      keys.forEach((k, i) => { this.itemIdMap.set(k, i); this.itemIds[i] = k; });
      const tbi = new Float64Array(m, A(OFF_TBI), MAX_ITEMDEFS * 12);
      tbi.fill(0);
      const gunbm = new Uint32Array(m, A(OFF_GUNBM), 4);
      const beambm = new Uint32Array(m, A(OFF_BEAMBM), 4);
      keys.forEach((k, i) => {
        const d = (ITEM_DEFS as unknown as Record<string, Record<string, number>>)[k];
        tbi[i * 12 + 0] = d.armor ?? 0; tbi[i * 12 + 1] = d.crit ?? 0; tbi[i * 12 + 2] = d.lifesteal ?? 0;
        tbi[i * 12 + 3] = d.thorns ?? 0; tbi[i * 12 + 4] = d.regen ?? 0; tbi[i * 12 + 5] = d.ranged ?? 0;
        tbi[i * 12 + 6] = d.speedMul ?? 1; tbi[i * 12 + 7] = d.dmg ?? 0; tbi[i * 12 + 8] = d.hp ?? 0;
        tbi[i * 12 + 9] = d.rank ?? 0; tbi[i * 12 + 10] = d.rarity ?? 0; tbi[i * 12 + 11] = SLOT_ORDER.indexOf((d.slot ?? 'wep') as never);
        if (k === 'musket' || k === 'rifle') gunbm[i >> 5] |= 1 << (i & 31);
        if (k === 'laser_rifle') beambm[i >> 5] |= 1 << (i & 31);
      });
      new Int32Array(m, A(OFF_TBIN), 1)[0] = keys.length;
    }
    // —— FIRST 名池（静态：仅首灌；24B 定长条目 [len][bytes×23]）——
    if (this.firstPoolVersion !== 1) {
      const pool = new Uint8Array(m, A(OFF_FRSTP), 16384);
      const off = new Uint32Array(m, A(OFF_FRSTOFF), 512);
      const cnt = new Uint32Array(m, A(OFF_FRSTN), 512);
      let cur = 0;
      const enc = new TextEncoder();
      for (const k of Object.keys(FIRST)) {
        const race = Number(k);
        if (race < 0 || race >= 512) continue;
        const names = FIRST[race];
        if (!names || names.length === 0) continue;
        if (cur + names.length * 24 > 16384) continue;
        off[race] = cur; cnt[race] = names.length;
        for (const nm of names) {
          const b = enc.encode(nm).slice(0, 23);
          pool[cur] = b.length;
          pool.set(b, cur + 1);
          cur += 24;
        }
      }
      this.firstPoolVersion = 1;
    }
    // —— 家族词表（FAM_PRE/POST 静态：私有静态成员经括号访问）——
    if (this.tablesVersion !== 1) {
      const GE = engine.constructor as unknown as Record<string, string[]>;
      const pre = GE['FAM_PRE'], post = GE['FAM_POST'];
      const famp = new Uint8Array(m, A(OFF_FAMP), 1024);
      const enc = new TextEncoder();
      pre.forEach((s, i) => { const b = enc.encode(s).slice(0, 23); famp[i * 24] = b.length; famp.set(b, i * 24 + 1); });
      post.forEach((s, i) => { const b = enc.encode(s).slice(0, 23); famp[384 + i * 24] = b.length; famp.set(b, 384 + i * 24 + 1); });
      // —— 种族表 TBR/TBF ——
      const tbr = new Float64Array(m, A(OFF_TBR), 512 * 12);
      const tbf = new Uint8Array(m, A(OFF_TBF), 512 * 2);
      const rf = new Uint8Array(m, A(11), 512); // OFF_RACE_FLAGS（与 Stage 1 语义一致）
      rf.fill(0);
      for (const k of Object.keys(RACES)) {
        const id = Number(k);
        if (id < 0 || id >= 512) continue;
        const d = RACES[id];
        tbr[id * 12 + 0] = d.hp; tbr[id * 12 + 1] = d.dmg; tbr[id * 12 + 2] = d.speed;
        tbr[id * 12 + 3] = d.maxAge; tbr[id * 12 + 4] = d.repro; tbr[id * 12 + 5] = d.reach ?? 0;
        tbr[id * 12 + 6] = d.growth ?? 0.5;
        tbr[id * 12 + 7] = d.ranged?.range ?? 0; tbr[id * 12 + 8] = d.ranged?.dmg ?? 0; tbr[id * 12 + 9] = d.ranged?.cd ?? 0;
        let f1 = 0;
        if (d.hostile) f1 |= 1;
        if (d.isCiv) f1 |= 2;
        if (d.undead) f1 |= 4;
        if (d.predator) f1 |= 8;
        if (id === 6 || id === 10 || id === 11 || id === 12) f1 |= 16; // SHEEP/DEER/PENGUIN/CAMEL
        if (d.flying) f1 |= 32; // 飞行位：与 Stage-1 语义一致（rust 水伤害豁免读 f1 bit32）
        rf[id] = f1;
        let f2 = 0;
        if (d.lavaImmune) f2 |= 1;
        if (d.nightsight) f2 |= 2;
        if (d.flying) f2 |= 32;
        if (d.aquatic) f2 |= 64;
        if (d.sandswim) f2 |= 128;
        tbf[id * 2 + 1] = f2;
      }
      // —— 职业 TBJ ——
      const tbj = new Float64Array(m, A(OFF_TBJ), 7 * 5);
      JOBS.forEach((j, i) => {
        tbj[i * 5 + 0] = j.hpMul; tbj[i * 5 + 1] = j.dmgMul; tbj[i * 5 + 2] = j.speedMul;
        tbj[i * 5 + 3] = j.weight; tbj[i * 5 + 4] = j.ranged ?? 0;
      });
      // —— 地形掩码 TBT ——
      const tbt = new Uint8Array(m, A(OFF_TBT), 16);
      const TS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      for (const t of TS) {
        let bits = 0;
        const water = t === 0 || t === 1;
        if (!water && t !== 6 && t !== 8) bits |= 1; // walkable
        if (water) bits |= 2;
        if (t === 3 || t === 4) bits |= 4; // flammable
        if (t === 2 || t === 3 || t === 4 || t === 5 || t === 7 || t === 9) bits |= 8; // buildable
        tbt[t] = bits;
      }
      // —— 巨怪掉落 / 野怪上限 / 巨怪上限 / 建筑血量 ——
      const mloot = new Uint8Array(m, A(OFF_MLOOT), 512);
      const wildcap = new Uint32Array(m, A(OFF_WILDCAP), 512);
      const moncap = new Uint32Array(m, A(OFF_MONCAP), 512);
      const caps: Record<number, number> = { 6: 240, 7: 90, 10: 160, 11: 110, 12: 90, 13: 60, 14: 80, 15: 70 };
      for (const k of Object.keys(RACES)) {
        const id = Number(k);
        if (id < 0 || id >= 512) continue;
        wildcap[id] = caps[id] ?? 40;
      }
      const mcaps: Record<number, number> = { 9: 4, 17: 2, 21: 5, 22: 5, 23: 6, 24: 8, 25: 3, 26: 3, 27: 6 };
      for (const [k, v] of Object.entries(mcaps)) moncap[+k] = v;
      const ML = (engine.constructor as unknown as Record<string, Set<number>>)['MONSTER_LOOT'] ?? new Set<number>();
      for (const k of ML) mloot[k] = 1;
      const tbhp = new Float64Array(m, A(OFF_TBHP), 16);
      for (let k = 1; k <= 10; k++) tbhp[k] = BUILDING_DEFS[k]?.hp ?? 70;
      // —— MISC ——
      const misc = new Int32Array(m, A(OFF_MISC), 32);
      misc[0] = 2400; misc[1] = 900;
      this.tablesVersion = 1;
    }
    void ex;
  }

  // ══════════ 每 tick pack（Task 50：sections 截面位 —— bail 分级轻重打包）══════════
  /** full：强制 meta 全行重灌（未知爆炸面保险）；sections：WP_* 截面位掩码（默认全量）。
   *  正确性约定：轻量截面只跳过「JS 接力段证明未触碰」的段；meta 行永远由 touchMeta/touchRow
   *  漏斗 + 抽样哨兵（轻量模式下 32 行）兑底 —— 漏检自愈，位等不破。 */
  pack2(engine: GameEngine, full = false, sections = WP_ALL): void {
    if (!this.ensureWorld(engine)) return;
    const t0 = performance.now();
    const ex = this.ex!;
    const m = this.mem; const A = this.at;
    this.packTables(engine);
    if (this.failed) return;

    const units = engine.units;
    const n = units.length;
    if (n > this.nu) { this.failed = true; return; }

    // —— 网格（bulk copy）——
    const g0 = performance.now();
    if (sections & WP_GRIDS) {
      this.gTerr.set(engine.terrain);
      this.gFire.set(engine.fire);
      this.gRad.set(engine.radiate);
      this.gRoad.set(engine.road);
      this.gBldk.set(engine.building);
      this.gOwn.set(engine.owner);
    }
    const g1 = performance.now();

    // —— 战争位图（atWar: rel<-20）——
    if (sections & WP_WAR) {
      const atw = new Uint8Array(m, A(13), 64 * 64);
      atw.fill(0);
      for (const [k, v] of engine.rel) {
        if (v >= -20) continue;
        const dash = k.indexOf('-');
        const a = +k.slice(0, dash); const b = +k.slice(dash + 1);
        if (a >= 0 && a < 64 && b >= 0 && b < 64) { atw[a * 64 + b] = 1; atw[b * 64 + a] = 1; }
      }
      // dynRaces 父链
      const dpar = new Int32Array(m, A(12), 512); dpar.fill(-1);
      for (const [id, d] of engine.dynRaces) { if (id >= 0 && id < 512) dpar[id] = d.parent; }
    }

    // —— 文明 ——
    const c0 = performance.now();
    if (sections & WP_CIV) {
      const civn = Math.min(engine.civs.length, 64);
      new Int32Array(m, A(OFF_CIVN), 1)[0] = civn;
      const cvPop = new Float64Array(m, A(OFF_CVPOP), 64);
      const cvHou = new Float64Array(m, A(OFF_CVHOU), 64);
      const cvGld = new Float64Array(m, A(OFF_CVGLD), 64);
      const cvCap = new Int32Array(m, A(OFF_CVCAP), 64);
      const cvAl = new Uint8Array(m, A(OFF_CVAL), 64);
      const cvGov = new Int32Array(m, A(OFF_CVGOV), 64);
      const cvTech = new Float64Array(m, A(OFF_CVTECH), 64 * 24);
      const cvDir = new Uint8Array(m, A(OFF_CVDIR), 64);
      const cvPc = new Float64Array(m, A(OFF_CVPC), 64);
      const cvMkt = new Int32Array(m, A(OFF_CVMKT), 64);
      for (let c = 0; c < civn; c++) {
        const civ = engine.civs[c];
        cvPop[c] = civ.pop; cvHou[c] = civ.houses; cvGld[c] = civ.gold ?? 0;
        cvCap[c] = civ.capital; cvAl[c] = civ.alive ? 1 : 0; cvGov[c] = civ.gov ?? 0;
        const tm = engine.techModsOf(c);
        cvTech[c * 24 + 0] = tm.dmg; cvTech[c * 24 + 1] = tm.hp; cvTech[c * 24 + 2] = tm.bhp;
        cvTech[c * 24 + 5] = tm.repro; cvTech[c * 24 + 9] = tm.repair;
        cvTech[c * 24 + 13] = tm.archer; cvTech[c * 24 + 14] = tm.plague; cvTech[c * 24 + 15] = tm.range;
        cvTech[c * 24 + 18] = engine.ideaModsOf(c).repro ?? 0;
        cvDir[c] = engine.activeDirective(c, 'populate') ? 1 : 0;
        cvPc[c] = engine.popCapOf(civ);
        cvMkt[c] = engine.marketIdx.get(c) ?? -1;
      }
    }

    // —— 家族 ——
    if (sections & WP_FAM) {
      const fams = engine.families;
      const fn = Math.min(fams.size, MAX_FAM);
      new Int32Array(m, A(OFF_FAMN), 1)[0] = fn;
      const fmId = new Int32Array(m, A(OFF_FMID), MAX_FAM);
      const fmRace = new Int32Array(m, A(OFF_FMRACE), MAX_FAM);
      const fmNum = new Float64Array(m, A(OFF_FMNUM), MAX_FAM * 6);
      let fi = 0;
      for (const f of fams.values()) {
        if (fi >= MAX_FAM) break;
        fmId[fi] = f.id; fmRace[fi] = f.race;
        fmNum[fi * 6] = f.members; fmNum[fi * 6 + 1] = f.heroes; fmNum[fi * 6 + 2] = f.kills;
        fmNum[fi * 6 + 3] = f.peak; fmNum[fi * 6 + 4] = f.milestones; fmNum[fi * 6 + 5] = f.founded;
        fi++;
      }
      new Int32Array(m, A(OFF_FMSEQ), 1)[0] = engine.familySeq;
    }

    // —— 建筑 ——
    const c1 = performance.now();
    if (sections & WP_BLD) {
      const bl = engine.buildings;
      const bn = Math.min(bl.length, MAX_BLD);
      new Int32Array(m, A(OFF_BLDN), 1)[0] = bn;
      const blI = new Int32Array(m, A(OFF_BLDI), MAX_BLD);
      const blXY = new Int32Array(m, A(OFF_BLDXY), MAX_BLD * 2);
      const blC = new Int32Array(m, A(OFF_BLDC), MAX_BLD);
      const blHp = new Float64Array(m, A(OFF_BLDHP), MAX_BLD);
      for (let b = 0; b < bn; b++) {
        const bd = bl[b];
        blI[b] = bd.i; blXY[b * 2] = bd.x; blXY[b * 2 + 1] = bd.y; blC[b] = bd.civ;
        const def = BUILDING_DEFS[bd.kind];
        blHp[b] = engine.bHp.get(bd.i) ?? Math.round((def?.hp ?? 70) * engine.techModsOf(bd.civ).bhp);
      }
      // damagedSet 有序镜像
      const dn = Math.min(engine.damagedSet.size, MAX_BLD);
      const dml = new Int32Array(m, A(OFF_DMGL), MAX_BLD);
      let di = 0;
      for (const t of engine.damagedSet) { if (di >= dn) break; dml[di++] = t; }
      new Int32Array(m, A(OFF_DMGN), 1)[0] = dn;
    }
    const c2 = performance.now();

    // —— 物品 ——
    if (sections & WP_ITEM) {
      const its = engine.items;
      const in2 = Math.min(its.length, MAX_ITEMS2);
      new Int32Array(m, A(OFF_ITMN), 1)[0] = in2;
      const itK = new Int32Array(m, A(OFF_ITMK), MAX_ITEMS2);
      const itXY = new Float64Array(m, A(OFF_ITMXY), MAX_ITEMS2 * 2);
      for (let i = 0; i < in2; i++) {
        itK[i] = this.itemIdMap.get(its[i].kind) ?? -1;
        itXY[i * 2] = its[i].x; itXY[i * 2 + 1] = its[i].y;
      }
    }

    // —— 特质表（TRAITS 键序变化时重灌）——
    const tk = Object.keys(TRAITS);
    const tkSig = tk.join('|');
    if (tkSig !== this.traitsKeyCache) {
      if (tk.length > MAX_TRAITS2) { this.failed = true; return; }
      this.traitKeys = tk;
      this.traitIdMap.clear();
      tk.forEach((k, i) => this.traitIdMap.set(k, i));
      const trDmg = new Float64Array(m, A(OFF_TRDMG), MAX_TRAITS2);
      const trHp = new Float64Array(m, A(OFF_TRHP), MAX_TRAITS2);
      const trSpd = new Float64Array(m, A(OFF_TRSPD), MAX_TRAITS2);
      const trReg = new Float64Array(m, A(OFF_TRREG), MAX_TRAITS2);
      const trFl = new Uint8Array(m, A(OFF_TRFL), MAX_TRAITS2);
      trDmg.fill(1); trHp.fill(1); trSpd.fill(1); trReg.fill(0);
      tk.forEach((k, i) => {
        const t = (TRAITS as unknown as Record<string, Record<string, number | boolean | undefined>>)[k];
        if (!t) return;
        if (t.dmgMul != null) trDmg[i] = t.dmgMul as number;
        if (t.hpMul != null) trHp[i] = t.hpMul as number;
        if (t.speedMul != null) trSpd[i] = t.speedMul as number;
        if (t.regen != null) trReg[i] = t.regen as number;
        if (t.giant) trFl[i] |= 1;
        if (t.tiny) trFl[i] |= 2;
        if (t.immune) trFl[i] |= 4;
        if (k === 'swift') trFl[i] |= 16;
        if (k === 'berserk') trFl[i] |= 64;
      });
      new Int32Array(m, A(OFF_TRN), 1)[0] = tk.length;
      this.traitsKeyCache = tkSig;
    }

    // —— 神经权重（版本变化时重灌：ACC@0 STANCE@256 FLIGHT@576 RL@768）——
    const heads = neuroHeadsSnapshot();
    if (heads.version !== this.weightsVersion) {
      const nw = new Float64Array(m, A(OFF_NEUW), 2048);
      const put = (base: number, h: { nIn: number; nH: number; nOut: number; w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: Float32Array }) => {
        let k = 0;
        for (let i = 0; i < h.nIn * h.nH; i++) nw[base + k++] = h.w1[i];
        for (let t = 0; t < h.nH; t++) nw[base + k++] = h.b1[t];
        for (let t = 0; t < h.nH * h.nOut; t++) nw[base + k++] = h.w2[t];
        for (let j = 0; j < h.nOut; j++) nw[base + k++] = h.b2[j];
      };
      put(0, heads.acc); put(256, heads.stance); put(576, heads.flight); put(768, heads.rl);
      const ctl = new Uint8Array(m, A(OFF_NCTL), 1);
      ctl[0] = (neuroStats.enabled ? 1 : 0) | ((neuroStats.flightMode === 'rl' ? 1 : 0) << 1);
      this.weightsVersion = heads.version;
    }
    // NCTL 每次都刷（开关/模式可随时切）
    {
      const ctl = new Uint8Array(m, A(OFF_NCTL), 1);
      ctl[0] = (neuroStats.enabled ? 1 : 0) | ((neuroStats.flightMode === 'rl' ? 1 : 0) << 1);
    }

    // —— 标量（Task 50：WP_SCAL 截面 —— rng/tick/laws/fxp/fx 队列/wild/prey/speciesBase/计数）——
    if (sections & WP_SCAL) {
    this.vRng[0] = engine.rngA >>> 0;
    const i32v = (id: number, len: number, off = 0) => new Int32Array(m, A(id), len);
    i32v(OFF_TICK, 1)[0] = engine.tickCount;
    i32v(OFF_FRAME, 1)[0] = engine.frameCount;
    new Uint8Array(m, A(OFF_PAR), 1)[0] = engine.tickCount % 2;
    new Uint32Array(m, A(OFF_USEQ), 1)[0] = engine.unitSeq;
    const eps = new Float64Array(m, A(OFF_EPS), 16);
    EP_KEYS.forEach((k, i) => { eps[i] = getEp(k); });
    let laws = 0;
    const L = engine.laws;
    if (L.reproduction) laws |= 1; if (L.zombieInfect) laws |= 2; if (L.undeadRise) laws |= 4;
    new Uint8Array(m, A(OFF_LAWS), 1)[0] = laws;
    const F = engine.fxPrefs;
    let fxp = 0;
    if (F.dmgNumbers) fxp |= 1; if (F.ambience) fxp |= 2; if (F.blood) fxp |= 4; if (F.corpses) fxp |= 8;
    fxp |= (F.fxDensity ?? 1) << 4;
    new Uint8Array(m, A(OFF_FXP), 1)[0] = fxp;
    // fx 虚拟队列
    i32v(OFF_FXLEN, 1)[0] = engine.effects.length;
    {
      const fmin = new Int32Array(m, A(OFF_FXMIN), 1600);
      let k = 0;
      const MINOR = new Set(['dmg', 'hit', 'smoke', 'spawn', 'heart', 'skull', 'arrow', 'coin', 'blood', 'dust', 'bullet']);
      for (let i = 0; i < engine.effects.length && k < 1600; i++) {
        if (MINOR.has(engine.effects[i].kind)) fmin[k++] = i;
      }
      i32v(OFF_FXMINN, 1)[0] = k;
    }
    // wildCount（先清零防幽灵计数 —— JS 侧 map 删除的种族不得残留镜像）
    const wild = new Int32Array(m, A(OFF_WILD), 512);
    wild.fill(0);
    for (const [r, v] of engine.wildCount) { if (r >= 0 && r < 512) wild[r] = v; }
    const f64v = (id: number, len: number) => new Float64Array(m, A(id), len);
    f64v(OFF_GRASS, 1)[0] = engine.grassTiles;
    f64v(OFF_DAYPH, 1)[0] = engine.dayPhase();
    f64v(OFF_REPRM, 1)[0] = engine.nature.reproMul();
    const prey = new Uint16Array(m, A(OFF_PREY), 640);
    prey.set(engine.preyGrid);
    // speciesBase
    const spb = new Float64Array(m, A(OFF_SPB), 512 * 4);
    const spbh = new Uint8Array(m, A(OFF_SPBH), 512);
    for (const [r, v] of engine.speciesBase) {
      if (r < 0 || r >= 512) continue;
      spb[r * 4] = v.gene.s; spb[r * 4 + 1] = v.gene.d; spb[r * 4 + 2] = v.gene.h; spb[r * 4 + 3] = v.gene.r;
      spbh[r] = 1;
    }
    // 计数器
    const cnt = f64v(OFF_CNT, 16);
    cnt[0] = engine.firesOut; cnt[1] = engine.lastFireOutEventTick; cnt[2] = engine.repairsDone;
    cnt[3] = engine.lastRepairEventTick; cnt[4] = engine.statDragonsSlain; cnt[5] = engine.yearF;
    // 杂项
    const misc = i32v(OFF_MISC, 32);
    misc[2] = engine.dynTraits.size;
    new Uint8Array(m, A(OFF_COLEN), 1)[0] = collectorStats.enabled ? 1 : 0;
    // fireSet 计数
    i32v(OFF_FIREN, 1)[0] = engine.fireSet.size;
    } // WP_SCAL 结束
    const g2 = performance.now();

    // —— 单位行（Stage 3 分层：hot 列每 tick 全灌；meta 列仅 metaDirty/full 时灌）——
    // hot = 每 tick 高频变异（位置/生命/计时/特效散点写）；meta = 稀疏变异（职业/装备/基因/名/血仇/军团…）
    // 正确性依据：meta 列在 Rust 批内核内被写时由 writeback 回传 JS（wasm 即真相）；JS 侧写点全部
    // 收口到 touchMeta() 方法（spawnUnit/setJob/zombify/军团系/tradeTick/cast 系…），漏检由哨兵抽样自检兜底。
    const R = this.row;
    const bw = engine.bw; const maxX = bw - 1; const maxY = engine.bh - 1;
    const metaPass = full || this.metaDirty;
    // Task 50：截面门控 —— meta 段被跳过时不清 metaDirty（保留至下次全量 pack 兑现）；hot 段必含（批内核正确性依赖）
    const rowPass = (sections & WP_META) !== 0 && (metaPass || this.rowDirtyN > 0);
    if (sections & WP_HOT) {
    for (let i = 0; i < n; i++) {
      const u = units[i];
      // —— hot 列 ——
      this.vUx[i] = u.x; this.vUy[i] = u.y;
      this.vUdead[i] = u.dead ? 1 : 0;
      const p = u.panic;
      if (p != null) { this.vUHasPanic[i] = 1; this.vUPanic[i] = p; } else { this.vUHasPanic[i] = 0; this.vUPanic[i] = 0; }
      R.tx[i] = u.tx; R.ty[i] = u.ty; R.hp[i] = u.hp; R.cd[i] = u.cd; R.age[i] = u.age;
      R.fd[i] = u.food ?? NaN; R.breath[i] = u.breath;
      R.lx[i] = u.lx ?? NaN; R.ly[i] = u.ly ?? NaN;
      R.hurt[i] = u.hurt ?? 0; R.detour[i] = u.detour ?? NaN; // 瞬态列 NaN=undefined 哨兵（三态保真）
      R.inf[i] = u.infected ? 1 : 0; R.flip[i] = u.flip ? 1 : 0;
      R.chill[i] = u.chill ?? NaN;
      // cell
      let cx = (u.x / 4) | 0; let cy = (u.y / 4) | 0;
      if (cx > maxX) cx = maxX; else if (cx < 0) cx = 0;
      if (cy > maxY) cy = maxY; else if (cy < 0) cy = 0;
      this.vUcell[i] = cy * bw + cx;
    }
    } // WP_HOT 结束
    if (rowPass) {
      this.stats.metaHits++;
      const GEAR_KEYS: (keyof Unit)[] = ['wep', 'arm', 'hlm', 'shd', 'bts', 'rng', 'amu'];
      const rd = this.rowDirty;
      const rdN = this.rowDirtyN;
      for (let i = 0; i < n; i++) {
        if (!metaPass && rdN > 0 && rd![i] === 0) continue; // 行级增量：只灌脏行（spawn/移位）
        const u = units[i];
        // —— meta 列 ——
        this.vUciv[i] = u.civ; this.vUrace[i] = u.race; this.vUid[i] = u.id;
        R.maxHp[i] = u.maxHp; R.maxAge[i] = u.maxAge; R.dmg[i] = u.dmg; R.speed[i] = u.speed; R.kills[i] = u.kills;
        R.sxk[i] = u.sxk ?? NaN; R.syk[i] = u.syk ?? NaN; R.stk[i] = u.stk ?? -2147483648; // MIN=undefined 哨兵（区分真 0）
        R.atk[i] = u.atk ?? NaN; R.fleet[i] = u.fleeT ?? NaN;
        R.bless[i] = u.bless ?? NaN; R.curse[i] = u.curse ?? NaN; R.fert[i] = u.fert ?? NaN;
        R.job[i] = u.job ?? -1; R.trait[i] = u.trait != null ? (this.traitIdMap.get(u.trait) ?? -2) : -2;
        R.par[i] = u.parity;
        // Task 50：虚拟船 —— ①商队单位：cvn 列错位遗产，Rust 读不到真值，伪装 boat=1 → BAIL_BOAT → JS 全逻辑接力（位等）；
        // ②克拉肯（race 25）：Rust 倾覆分支写 12B 变体海难 EVT（与 48B 读取方错位 36 字节 → 动作流灾难性错位）——
        //   虚拟船化后克拉肯全部走 JS 参考路径，12B 写入路径彻底不可达。
        // 根因链：OFF_UCVN 列 TS i32/步长4 vs Rust f64/步长8 —— u_caravan0 读乱位垃圾 → CVMKT[垃圾] 越界读 → 每帧 WASM OOB。
        // 休眠 cvn 列（恒 0）后 u_caravan0 恒≤0/NaN→0，Rust 商队逻辑全部休眠，永不越界。
        const vb = (!u.boat && ((u.caravan ?? 0) > 0 || RACES[u.race]?.sprite === 'kraken')) ? 1 : 0;
        R.boat[i] = (u.boat || vb) ? 1 : 0; R.btl[i] = u.boatTTL ?? 0; R.cvn[i] = 0;
        this.virtBoat[i] = vb;
        R.army[i] = u.army ?? -1;
        for (let k = 0; k < 7; k++) R.gear[i * 7 + k] = (u[GEAR_KEYS[k]] as string | undefined) ? (this.itemIdMap.get(u[GEAR_KEYS[k]] as string) ?? -1) : -1;
        const g = u.gene;
        if (g) { R.gene[i * 4] = g.s; R.gene[i * 4 + 1] = g.d; R.gene[i * 4 + 2] = g.h; R.gene[i * 4 + 3] = g.r; }
        else { R.gene[i * 4] = R.gene[i * 4 + 1] = R.gene[i * 4 + 2] = R.gene[i * 4 + 3] = NaN; }
        R.fam[i] = u.fam ?? -1; R.fgn[i] = u.fgn ?? -1;
        // 名字字节（slot 级缓存：同名免重编码 —— TextEncoder 是 pack2 最大单项开销）
        const nm = u.name ?? '';
        let nb = this.nameCache[i];
        if (nb === undefined || this.nameCacheStr[i] !== nm) {
          nb = this.encBuf.encode(nm);
          this.nameCache[i] = nb;
          this.nameCacheStr[i] = nm;
        }
        const len = Math.min(nb.length, 30);
        R.name.set(nb.subarray(0, len), i * 32);
        R.name[i * 32 + 31] = len;
        // 血仇
        const gl = u.gIds;
        if (gl != null) {
          R.gln[i] = gl.length;
          for (let k = 0; k < gl.length && k < 8; k++) {
            R.gids[i * 8 + k] = gl[k];
            R.gval[i * 8 + k] = u.gVal?.[k] ?? 1;
          }
        } else R.gln[i] = -1;
      }
      this.metaDirty = false;
      if (rd !== null && rdN > 0) { rd.fill(0); this.rowDirtyN = 0; }
    } else {
      this.stats.metaSkips++;
      // —— 哨兵抽样自检（漂移 → 警告 + 下 tick 自愈重灌）—— Task 50：轻量截面下加密到 32 行 ——
      // 注意：caravan 是 0/undefined falsy 等价语义（writeback 往返 0→undefined），哨兵须按同语义归一比较
      const probe = sections === WP_ALL ? 8 : 32;
      const step = Math.max(1, (n / probe) | 0);
      for (let i = 0; i < n; i += step) {
        const u = units[i];
        // Task 50：boat 比较按虚拟船语义归一（商队 + 克拉肯）；caravan 已休眠不比（cvn 列错位遗产）
        const vb = (u.boat || (u.caravan ?? 0) > 0 || RACES[u.race]?.sprite === 'kraken') ? 1 : 0;
        if (
          R.job[i] !== (u.job ?? -1) ||
          R.fam[i] !== (u.fam ?? -1) ||
          R.army[i] !== (u.army ?? -1) ||
          R.boat[i] !== vb
        ) {
          this.metaDirty = true;
          this.stats.sentryWarn++;
          console.warn('[wbbatch] meta 哨兵检测到漂移 @slot', i, '（收口遗漏）— 下 tick 自愈重灌', {
            job: [R.job[i], u.job ?? -1], fam: [R.fam[i], u.fam ?? -1], army: [R.army[i], u.army ?? -1],
            boat: [R.boat[i], vb],
          });
          break;
        }
      }
    }
    ex.wb_pack_end(n);
    this.batchReady = true;
    const t1 = performance.now();
    this.stats.packs++;
    this.lastPackN = n; // Task 50：packSail 一致性守卫基准
    if (sections !== WP_ALL) this.stats.litePacks++; // Task 50：轻量重打包计数（E2E 验证用）
    this.stats.pack2Ms = this.stats.pack2Ms * 0.9 + (t1 - t0) * 0.1;
    this.stats.p2grid = this.stats.p2grid * 0.9 + (g1 - g0) * 0.1;
    this.stats.p2tab = this.stats.p2tab * 0.9 + (g2 - g1) * 0.1;
    this.stats.p2rows = this.stats.p2rows * 0.9 + (t1 - g2) * 0.1;
    this.stats.p2civ = this.stats.p2civ * 0.9 + (c1 - c0) * 0.1;
    this.stats.p2bld = this.stats.p2bld * 0.9 + (c2 - c1) * 0.1;
  }

  /** Task 50：虚拟船行标记（商队行镜像 boat=1 但 JS 非真船 —— 写回时不得实体化）；ensureWorld 后非空 */
  private virtBoat: Uint8Array = new Uint8Array(0);

  private encBuf = new TextEncoder();
  private nameCache: (Uint8Array | undefined)[] = [];
  private nameCacheStr: (string | undefined)[] = [];
  /** Task 50：上次 pack 时的单位数（packSail 一致性守卫 —— spawn 增行时退化到截面化 lite pack） */
  private lastPackN = -1;

  getRng(): number { return this.vRng[0]; }

  /** Task 50：纯航行 bail 专用超轻重灌 —— 单行热列 + rng + fx 队列（0.7ms → ~0.01ms）。
   *  前置条件（engine 侧 pureSail 判定已保证）：接力段只动了该船自身（updateBoat 航行路径
   *  不 spawn/不拾取/不结算/不触碰他行 meta）；writeback 已把 Rust 脏行同步回 JS（双向一致）。
   *  守卫：行数变化（spawn 增行）或 meta 漏斗待决 → 退化 WP_SCAL|WP_HOT|WP_META 截面 pack。 */
  packSail(engine: GameEngine, slot: number): void {
    const units = engine.units;
    const n = units.length;
    if (this.metaDirty || this.rowDirtyN > 0 || n !== this.lastPackN || slot < 0 || slot >= n || !this.ensureWorld(engine)) {
      this.pack2(engine, false, WP_SCAL | WP_HOT | WP_META);
      return;
    }
    const t0 = performance.now();
    const m = this.mem; const A = this.at;
    const u = units[slot];
    const R = this.row;
    const bw = engine.bw; const maxX = bw - 1; const maxY = engine.bh - 1;
    // —— 单行热列（与 pack2 hot 段逐字段一致）——
    this.vUx[slot] = u.x; this.vUy[slot] = u.y;
    this.vUdead[slot] = u.dead ? 1 : 0;
    const p = u.panic;
    if (p != null) { this.vUHasPanic[slot] = 1; this.vUPanic[slot] = p; } else { this.vUHasPanic[slot] = 0; this.vUPanic[slot] = 0; }
    R.tx[slot] = u.tx; R.ty[slot] = u.ty; R.hp[slot] = u.hp; R.cd[slot] = u.cd; R.age[slot] = u.age;
    R.fd[slot] = u.food ?? NaN; R.breath[slot] = u.breath;
    R.lx[slot] = u.lx ?? NaN; R.ly[slot] = u.ly ?? NaN;
    R.hurt[slot] = u.hurt ?? 0; R.detour[slot] = u.detour ?? NaN;
    R.inf[slot] = u.infected ? 1 : 0; R.flip[slot] = u.flip ? 1 : 0;
    R.chill[slot] = u.chill ?? NaN;
    let cx = (u.x / 4) | 0; let cy = (u.y / 4) | 0;
    if (cx > maxX) cx = maxX; else if (cx < 0) cx = 0;
    if (cy > maxY) cy = maxY; else if (cy < 0) cy = 0;
    this.vUcell[slot] = cy * bw + cx;
    // —— rng 同步（保险直写：接力段理论上不消耗）——
    this.vRng[0] = engine.rngA >>> 0;
    // —— fx 虚拟队列（回放/海难 fx 增长 —— Rust fx 预算依赖）——
    const i32v = (id: number, len: number) => new Int32Array(m, A(id), len);
    i32v(OFF_FXLEN, 1)[0] = engine.effects.length;
    {
      const fmin = new Int32Array(m, A(OFF_FXMIN), 1600);
      let k = 0;
      const MINOR = new Set(['dmg', 'hit', 'smoke', 'spawn', 'heart', 'skull', 'arrow', 'coin', 'blood', 'dust', 'bullet']);
      for (let i = 0; i < engine.effects.length && k < 1600; i++) {
        if (MINOR.has(engine.effects[i].kind)) fmin[k++] = i;
      }
      i32v(OFF_FXMINN, 1)[0] = k;
    }
    this.ex!.wb_pack_end(n);
    this.batchReady = true;
    this.stats.packs++;
    this.stats.litePacks++;
    this.stats.pack2Ms = this.stats.pack2Ms * 0.9 + (performance.now() - t0) * 0.1;
  }

  /** Stage 3：JS 侧稀疏列（meta）变异收口 —— 收口方法入口调用；下 tick pack2 重灌 meta 列 */
  touchMeta(): void {
    if (this.ready && !this.failed) this.metaDirty = true;
  }

  /** Stage 3+：行级增量 —— 仅重灌指定 slot 行（spawn 新行 / reap 移位行） */
  touchRow(i: number): void {
    if (!this.ready || this.failed || i < 0 || i >= this.nu) return;
    if (this.rowDirty === null) this.rowDirty = new Uint8Array(this.nu);
    if (this.rowDirty[i] === 0) { this.rowDirty[i] = 1; this.rowDirtyN++; }
  }

  /** Stage 3 QA：全行 meta 指纹深度校验（__wb.wbb 排障 / agent-browser 调用）—— 返回漂移行数。
   *  对比 JS 对象与 wasm 镜像的稀疏列（哨兵是抽样，这是全量）；caravan 按 falsy 等价语义归一。 */
  verifyMeta(engine: GameEngine): number {
    if (!this.active() || !this.batchReady) return -1;
    const units = engine.units;
    const n = Math.min(units.length, this.nu);
    const R = this.row;
    let drift = 0;
    for (let i = 0; i < n; i++) {
      // Task 50：跳过待重灌行（reap 换行/新 spawn 的一 tick 窗口态 —— tick 起始 pack 的行级增量会兑现，非真漂移）
      if (this.rowDirty !== null && this.rowDirtyN > 0 && this.rowDirty[i] === 1) continue;
      const u = units[i];
      const tr = u.trait != null ? (this.traitIdMap.get(u.trait) ?? -2) : -2;
      const vb = (u.boat || (u.caravan ?? 0) > 0 || RACES[u.race]?.sprite === 'kraken') ? 1 : 0; // Task 50：虚拟船语义归一（商队 + 克拉肯）
      if (
        this.vUciv[i] !== u.civ || this.vUrace[i] !== u.race || this.vUid[i] !== u.id ||
        R.maxHp[i] !== u.maxHp || R.maxAge[i] !== u.maxAge || R.dmg[i] !== u.dmg || R.speed[i] !== u.speed ||
        R.job[i] !== (u.job ?? -1) || R.trait[i] !== tr ||
        R.fam[i] !== (u.fam ?? -1) || R.army[i] !== (u.army ?? -1) ||
        R.boat[i] !== vb || R.par[i] !== u.parity ||
        R.kills[i] !== u.kills
      ) {
        drift++;
        console.warn('[wbbatch.verifyMeta] 漂移行', i, 'unit', u.name, { job: [R.job[i], u.job ?? -1], trait: [R.trait[i], tr], fam: [R.fam[i], u.fam ?? -1], army: [R.army[i], u.army ?? -1] });
      }
    }
    return drift;
  }
  getNeuroCalls(): [number, number, number] {
    const m = this.mem; const A = this.at;
    const v = new Uint32Array(m, A(OFF_NEUCALL), 3);
    return [v[0], v[1], v[2]];
  }
  getActN(): number { return new Int32Array(this.mem, this.at(OFF_ACTN), 1)[0]; }
  getDlistN(): number { return new Int32Array(this.mem, this.at(OFF_DLISTN), 1)[0]; }
  getDlist(): Uint32Array { return this.vDlist; }
  getWildCounts(): Int32Array { return new Int32Array(this.mem, this.at(OFF_WILD), 512); }
  getCounters(): Float64Array { return new Float64Array(this.mem, this.at(OFF_CNT), 16); }
  getFamilyCount(): number { return new Int32Array(this.mem, this.at(OFF_FAMN), 1)[0]; }
  getFamilySeq(): number { return new Int32Array(this.mem, this.at(OFF_FMSEQ), 1)[0]; }
  getItemCount(): number { return new Int32Array(this.mem, this.at(OFF_ITMN), 1)[0]; }
  getFireCount(): number { return new Int32Array(this.mem, this.at(OFF_FIREN), 1)[0]; }

  // ══════════ 批处理调用 ══════════
  batch(engine: GameEngine, from: number, limit = 0): BatchResult {
    const ex = this.ex!;
    const t0 = performance.now();
    const rc = ex.wb_units_batch(from, limit);
    const t1 = performance.now();
    this.stats.batches++;
    this.stats.batchMs = this.stats.batchMs * 0.9 + (t1 - t0) * 0.1;
    const out: BatchResult = { code: rc, slot: 0, kind: 0, data: this.vBailP };
    if (rc === 2) {
      const m = this.mem; const A = this.at;
      out.slot = new Uint32Array(m, A(OFF_BAILS), 1)[0];
      out.kind = new Uint32Array(m, A(OFF_BAILK), 1)[0];
      this.stats.bails++;
    }
    return out;
  }

  /** JS 接力 spawn 后通知 Rust 增长（新行已由 repackLite 写入） */
  grow(n: number): void { this.ex!.wb_grow(n); }

  // ══════════ 动作回放（显式偏移模式 —— 与 units.rs 写方布局逐字段对齐）══════════
  replayActions(engine: GameEngine): void {
    const t0 = performance.now();
    const n = this.getActN();
    const a = this.vAct;
    const dv = this.actDv;
    const base = this.actBase;
    const fxPrefs = engine.fxPrefs;
    let cur = 0;
    while (cur < n) {
      const p = cur; // 记录基
      const op = a[p];
      switch (op) {
        case ACT_FX: { // 76B: kind@1 quiet@2 textOp@3 textArg@4 src@8 ttl@16 x@24 y@32 r@40 x0@48 y0@56 dmg@64
          const kind = a[p + 1];
          const quiet = a[p + 2] !== 0;
          const textOp = a[p + 3];
          const textArg = dv.getUint32(p + 4, true);
          const srcCiv = dv.getInt32(p + 8, true);
          const ttl = dv.getFloat64(p + 16, true);
          const x = dv.getFloat64(p + 24, true);
          const y = dv.getFloat64(p + 32, true);
          const rr = dv.getFloat64(p + 40, true);
          const x0 = dv.getFloat64(p + 48, true);
          const y0 = dv.getFloat64(p + 56, true);
          const dmg = dv.getFloat64(p + 64, true);
          cur += 76;
          const hasOpts = !Number.isNaN(x0);
          const opts: Record<string, unknown> = {};
          if (hasOpts) { opts.x0 = x0; opts.y0 = y0; }
          if (rr !== 1 || hasOpts) opts.r = rr;
          if (srcCiv >= 0) opts.src = srcCiv;
          if (!Number.isNaN(dmg)) opts.dmg = dmg;
          if (quiet) opts.quiet = true;
          if (textOp === 1) opts.text = '吞噬';
          else if (textOp === 2) opts.text = '石化';
          else if (textOp === 3) opts.text = '毒';
          else if (textOp === 4) opts.text = '闪';
          else if (textOp === 5) opts.text = (textArg ? '暴' : '') + '-' + Math.round(dmg);
          else if (textOp === 6) opts.text = this.itemIds[textArg] ?? '';
          engine.effects.push({ kind: FX_KINDS[kind] as never, x, y, x0: hasOpts ? x0 : x, y0: hasOpts ? y0 : y, r: 1, age: 0, ttl, seed: 0, dir: 0, ...(opts as object) });
          break;
        }
        case ACT_FX_EVICT: { // 8B: victim@4
          const victim = dv.getInt32(p + 4, true);
          cur += 8;
          if (victim >= 0 && victim < engine.effects.length) engine.effects.splice(victim, 1);
          break;
        }
        case ACT_SND: { // 8B: kind@1
          const k = a[p + 1];
          cur += 8;
          engine.onSound?.(SNDS[k] as never);
          break;
        }
        case ACT_EVT: { // 48B: kind@1 a@4 b@8 f0@16 f1@24 x@32 y@40
          const kind = a[p + 1];
          const ea = dv.getInt32(p + 4, true);
          const eb = dv.getInt32(p + 8, true);
          const f0 = dv.getFloat64(p + 16, true);
          const x = dv.getFloat64(p + 32, true);
          const y = dv.getFloat64(p + 40, true);
          cur += 48;
          const byId = (id: number) => engine.unitById.get(id);
          const nm = (id: number) => byId(id)?.name ?? '?';
          const civN = (c: number) => engine.civs[c]?.name ?? '';
          switch (kind) {
            case 1: engine.addEvent('shipwreck', `「${nm(ea)}」的航船被克拉肯拖入了深渊`, { x, y }); break;
            case 2: engine.addEvent('petrify', `「${nm(ea)}」与蛇怪对视，化作了石像`, { x, y }); break;
            case 3: engine.addEvent('revenge', `「${nm(ea)}」手刃仇敌「${nm(eb)}」，血仇得报`, { x, y }); break;
            case 4: {
              const u = byId(ea);
              engine.addEvent('legend', `传奇武士 ${nm(ea)}（${u && u.civ >= 0 ? civN(u.civ) : '流浪'}）达成了 10 次击杀`, { x, y });
              break;
            }
            case 5: {
              const fam = engine.families.get(ea);
              const u = byId(eb);
              if (fam && u) engine.addEvent('lineage', `「${fam.name}」家族的 ${u.name} 阵斩十敌，成为家族英雄（先祖 ${fam.founder}）`, { x: u.x, y: u.y });
              break;
            }
            case 6: {
              const fam = engine.families.get(ea);
              if (fam) engine.addEvent('lineage', `${RACES[fam.race]?.name ?? ''}「${fam.name}」家族枝繁叶茂 —— 族人已达 ${Math.round(f0)} 口（先祖 ${fam.founder}）`);
              break;
            }
            case 7: engine.addEvent('fireOut', `「${civN(ea)}」的国民提桶救火，扑灭了蔓延的火势`, { colorHex: engine.civs[ea]?.colorHex, x, y }); break;
            case 8: engine.addEvent('repair', `「${civN(ea)}」的工匠修复了受损的建筑，家园重焕生机`, { colorHex: engine.civs[ea]?.colorHex, x, y }); break;
            case 9: engine.addEvent('war', `「${civN(ea)}」的一支舰队（${Math.round(f0)} 艘战船）跨海远征`, { colorHex: engine.civs[ea]?.colorHex, x, y }); break;
            case 10: engine.addEvent('skeleton', '大地传来不祥的声响——一名死者化作了骷髅', { x, y }); break;
            case 11: {
              const u = byId(ea);
              const iname = this.itemIds[eb] ?? '神秘物品';
              engine.addEvent('loot', `${nm(ea)}（${u && u.civ >= 0 ? civN(u.civ) : RACES[u?.race ?? 0]?.name ?? '?'}）获得了传说之物「${iname}」`, { x, y });
              break;
            }
          }
          break;
        }
        case ACT_TOAST: { // 16B: kind@1 a@4 b@8
          const kind = a[p + 1];
          const ta = dv.getInt32(p + 4, true);
          const tb = dv.getInt32(p + 8, true);
          cur += 16;
          if (kind === 1) engine.toast(`${engine.unitById.get(ta)?.name ?? '?'} 已斩获 10 次击杀`, 'info');
          else if (kind === 2) engine.toast(`${engine.unitById.get(ta)?.name ?? '?'} 拾取了${this.itemIds[tb] ?? ''}`, 'good');
          break;
        }
        case ACT_TERRAIN: { // 8B: i@1 t@5（写方 act_i32(p+1)+act_u8(p+5)）+ 边界护栏
          const i = dv.getInt32(p + 1, true);
          const t = a[p + 5];
          cur += 8;
          if (i >= 0 && i < 40960) engine.setTerrain(i, t);
          break;
        }
        case ACT_IGNITE: { // 8B: i@1 val@5 + 边界护栏
          const i = dv.getInt32(p + 1, true);
          const v = a[p + 5];
          cur += 8;
          if (i >= 0 && i < 40960) {
            engine.fire[i] = v;
            engine.fireSet.add(i);
          }
          break;
        }
        case ACT_FIRE_CLEAR: { // 双写方尺寸分歧（Task 50）：set_terrain/extinguish_fire 写 8B（常见）；
          // 白行者霜寒写 5B（罕见）—— 同 opcode 双尺寸，读取方以前瞻 opcode 有效性消歧（8 优先：
          // 常见路径 prior；错误选择的后果仅是流错位 3 字节，后续动作读取已有边界护栏兑底）。
          // 注：旧读取方固定按 8B 前进（与 5B 写方错位）或旧版本固定 5B（与 8B 写方错位）均为 bug。
          const i = dv.getInt32(p + 1, true);
          const T = 40960; // W*H 世界格数（与 TILES 一致）
          const validOp = (b: number) => b >= 1 && b <= 23;
          const at5 = p + 5, at8 = p + 8;
          const v5 = at5 >= n ? 2 : validOp(a[at5]) ? 1 : 0;
          const v8 = at8 >= n ? 2 : validOp(a[at8]) ? 1 : 0;
          cur += v8 > 0 ? 8 : v5 > 0 ? 5 : 8; // 双候选有效 → 8（常见写方 prior）
          if (i >= 0 && i < T) {
            engine.fire[i] = 0;
            engine.fireSet.delete(i);
          }
          break;
        }
        case ACT_BHP: { // 16B: i@1 hp@8
          const i = dv.getInt32(p + 1, true);
          const hp = dv.getFloat64(p + 8, true);
          cur += 16;
          engine.bHp.set(i, hp);
          break;
        }
        case ACT_DMG_ADD: { // 8B: i@1（Task 50 字段偏移修复：写方 act_i32(p+1) —— 旧读方读 @4 拿到陈旧字节，
          // 每次建筑受损登记都把垃圾 tile 塞进 damagedSet → Rust damaged_near 读 BLDK[垃圾] → OOB）
          const i = dv.getInt32(p + 1, true);
          cur += 8;
          if (i >= 0 && i < 40960) engine.damagedSet.add(i);
          break;
        }
        case ACT_DMG_DEL: { // 8B: i@1（与写方对齐 + 边界护栏）
          const i = dv.getInt32(p + 1, true);
          cur += 8;
          if (i >= 0 && i < 40960) engine.damagedSet.delete(i);
          break;
        }
        case ACT_CIV: { // 16B: field@1 civ@4 d@8
          const field = a[p + 1];
          const c = dv.getInt32(p + 4, true);
          const d = dv.getFloat64(p + 8, true);
          cur += 16;
          const civ = engine.civs[c];
          if (civ) {
            if (field === 0) civ.pop += d;
            else if (field === 1) civ.houses += d;
            else if (field === 2) civ.gold = (civ.gold ?? 0) + d;
          }
          break;
        }
        case ACT_SPAWN: { // 256B: id@4 race@8 civ@12 x@16 y@24 maxHp@32 dmg@40 speed@48 maxAge@56 breath@64 trait@72 job@76 flip@80 parity@81 infected@82 fam@84 fgn@88 tDmg@96 tHp@104 gene@112..136 nameLen@144 name@145
          const id = dv.getUint32(p + 4, true);
          const race = dv.getUint32(p + 8, true);
          const civ = dv.getInt32(p + 12, true);
          const x = dv.getFloat64(p + 16, true);
          const y = dv.getFloat64(p + 24, true);
          const maxHp = dv.getFloat64(p + 32, true);
          const dmg = dv.getFloat64(p + 40, true);
          const speed = dv.getFloat64(p + 48, true);
          const maxAge = dv.getFloat64(p + 56, true);
          const breath = dv.getFloat64(p + 64, true);
          const trait = dv.getInt32(p + 72, true);
          const job = dv.getInt32(p + 76, true);
          const flip = a[p + 80] !== 0;
          const parity = a[p + 81];
          const infected = a[p + 82] !== 0;
          const fam = dv.getInt32(p + 84, true);
          const fgn = dv.getInt32(p + 88, true);
          const tDmg = dv.getFloat64(p + 96, true);
          const tHp = dv.getFloat64(p + 104, true);
          const gs = dv.getFloat64(p + 112, true);
          const gd = dv.getFloat64(p + 120, true);
          const gh = dv.getFloat64(p + 128, true);
          const gr = dv.getFloat64(p + 136, true);
          const nameLen = a[p + 144];
          const nameBytes = a.slice(p + 145, p + 145 + 32);
          cur += 256;
          const u = {
            id, race, civ, x, y, lx: x, ly: y, rx: x, ry: y, tx: x, ty: y,
            hp: maxHp, maxHp, dmg, speed, tDmg, tHp, age: 0, maxAge, kills: 0, cd: 0,
            trait: trait >= 0 ? this.traitKeys[trait] : null,
            gene: { s: gs, d: gd, h: gh, r: gr },
            job: job >= 0 ? job : undefined,
            infected, flip, name: this.dec.decode(nameBytes.subarray(0, nameLen)),
            hurt: 0, breath, parity, dead: false,
          } as unknown as Unit;
          if (fam >= 0) { u.fam = fam; u.fgn = fgn >= 0 ? fgn : 1; }
          engine.units.push(u);
          engine.unitById.set(id, u);
          break;
        }
        case ACT_FAM_NEW: { // 32B: id@4 race@8 preIdx@12 postIdx@13 founded@16 founderSlot@24
          const id = dv.getInt32(p + 4, true);
          const race = dv.getInt32(p + 8, true);
          const preIdx = a[p + 12];
          const postIdx = a[p + 13];
          const founded = dv.getFloat64(p + 16, true);
          const founderSlot = dv.getInt32(p + 24, true);
          cur += 32;
          const GE = engine.constructor as unknown as Record<string, string[]>;
          const founder = engine.units[founderSlot];
          engine.families.set(id, {
            id, name: (GE['FAM_PRE'] ?? [])[preIdx] + (GE['FAM_POST'] ?? [])[postIdx],
            race, founded: Math.floor(founded), founder: founder?.name ?? '?',
            members: 1, heroes: 0, kills: 0, peak: 1, milestones: 0,
          });
          break;
        }
        case ACT_FAM_MILE: { // 16B: famId@4
          const famId = dv.getInt32(p + 4, true);
          cur += 16;
          const f = engine.families.get(famId);
          if (f) {
            f.members++;
            (engine as unknown as { familyMilestone: (f: unknown) => void }).familyMilestone(f);
          }
          break;
        }
        case ACT_FAM_ONKILL: { // 16B: famId@4 uId@8 killsNow@12
          const famId = dv.getInt32(p + 4, true);
          const uId = dv.getInt32(p + 8, true);
          const killsNow = dv.getInt32(p + 12, true);
          cur += 16;
          const f = engine.families.get(famId);
          if (f) {
            f.kills++;
            if (killsNow === 10) f.heroes++;
          }
          break;
        }
        case ACT_BATTLE: { // 16B: bi@4 exp@8
          const bi = dv.getInt32(p + 4, true);
          const exp = dv.getInt32(p + 8, true);
          cur += 16;
          engine.activeBattles.set(bi, exp);
          if (engine.activeBattles.size > 64) {
            for (const [k, e2] of engine.activeBattles) {
              if (e2 <= engine.tickCount) engine.activeBattles.delete(k);
            }
          }
          break;
        }
        case ACT_WARKILL: { // 16B: a@4 b@8
          const wa = dv.getInt32(p + 4, true);
          const wb = dv.getInt32(p + 8, true);
          cur += 16;
          const killer = engine.unitById.get(wa);
          const victim = engine.unitById.get(wb);
          if (killer && victim) (engine as unknown as { onWarKill: (a: Unit, b: Unit) => void }).onWarKill(killer, victim);
          break;
        }
        case ACT_ITEM_DEL: { // 16B: i@4
          const i = dv.getInt32(p + 4, true);
          cur += 16;
          if (i >= 0 && i < engine.items.length) engine.items.splice(i, 1);
          break;
        }
        case ACT_CNT: { // 16B: idx@1 d@8
          const idx = a[p + 1];
          const d = dv.getFloat64(p + 8, true);
          cur += 16;
          if (idx === 0) engine.firesOut += d;
          else if (idx === 4) engine.statDragonsSlain += d;
          break;
        }
        case ACT_TELEM: { // 变长
          const kind = a[p + 1];
          if (kind === 2) { // decision 104B: uId@4 tick@8 f[9]@16 act@88 logp@96
            const uId = dv.getInt32(p + 4, true);
            const tick = dv.getInt32(p + 8, true);
            const f = new Array(9);
            for (let k = 0; k < 9; k++) f[k] = dv.getFloat64(p + 16 + k * 8, true);
            const act = a[p + 88];
            cur += 104;
            collectDecision(uId, tick, false, f, act);
          } else { // 变长（Task 50 尺寸对齐）：flee_end(16B: uId@4 tick@8) / enemy_gone(12B: uId@4 tick@8 —— 写方 act_reserve(12)) / kill(16B: uId@4 maxHp@8)
            const uId = dv.getInt32(p + 4, true);
            if (kind === 1) { cur += 16; collectFleeEnd(uId, dv.getInt32(p + 8, true)); }
            else if (kind === 3) { cur += 12; collectEnemyGone(uId, dv.getInt32(p + 8, true)); }
            else if (kind === 4) { cur += 16; collectKill(uId, dv.getFloat64(p + 8, true)); }
            else cur += 16;
          }
          break;
        }
        case ACT_CORPSE: { // 20B（Task 50 尺寸对齐：Rust 写方 act_reserve(20) —— 注意写方 y@16 自溢出 4 字节，
          // 读者游标必须匹配写方游标 20 而非字段布局 24，否则每次尸体动作流错位 4 字节）: stone@4 undead@5 x@8 y@16
          const stone = a[p + 4] !== 0;
          const undead = a[p + 5] !== 0;
          const x = dv.getFloat64(p + 8, true);
          const y = dv.getFloat64(p + 16, true);
          cur += 20;
          if (fxPrefs.corpses) (engine as unknown as { addCorpse: (x: number, y: number, s: boolean, u: boolean) => void }).addCorpse(Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0, stone, undead);
          break;
        }
        case ACT_BLOOD: { // 24B: big@1 x@8 y@16
          const big = a[p + 1] !== 0;
          const x = dv.getFloat64(p + 8, true);
          const y = dv.getFloat64(p + 16, true);
          cur += 24;
          if (fxPrefs.blood) {
            const bld = (engine as unknown as { blood: { x: number; y: number; age: number; seed: number; big: boolean }[] }).blood;
            bld.push({ x, y, age: 0, seed: 0, big });
            const BM = (engine.constructor as unknown as Record<string, number>)['BLOOD_MAX'] ?? 400;
            if (bld.length > BM) bld.splice(0, bld.length - BM);
          }
          break;
        }
        default:
          cur = n; // 未知动作：防御性终止
          break;
      }
    }
    const t1 = performance.now();
    this.stats.replayMs = this.stats.replayMs * 0.9 + (t1 - t0) * 0.1;
    this.stats.actions = n;
    new Int32Array(this.mem, this.at(OFF_ACTN), 1)[0] = 0;
  }

  // ══════════ 脏行写回（Rust → JS）══════════
  writeback(engine: GameEngine): void {
    const dn = this.getDlistN();
    const R = this.row;
    const units = engine.units;
    const dlist = this.vDlist;
    const GEAR_KEYS: (keyof Unit)[] = ['wep', 'arm', 'hlm', 'shd', 'bts', 'rng', 'amu'];
    for (let k = 0; k < dn; k++) {
      const i = dlist[k];
      if (i >= units.length) continue;
      const u = units[i];
      u.x = this.vUx[i]; u.y = this.vUy[i]; u.civ = this.vUciv[i]; u.race = this.vUrace[i];
      u.dead = this.vUdead[i] !== 0;
      u.panic = this.vUHasPanic[i] ? this.vUPanic[i] : undefined;
      u.tx = R.tx[i]; u.ty = R.ty[i]; u.hp = R.hp[i]; u.maxHp = R.maxHp[i]; u.dmg = R.dmg[i];
      u.speed = R.speed[i]; u.age = R.age[i]; u.maxAge = R.maxAge[i]; u.kills = R.kills[i]; u.cd = R.cd[i];
      const fd = R.fd[i];
      u.food = Number.isNaN(fd) ? undefined : fd;
      u.breath = R.breath[i];
      const lx = R.lx[i]; u.lx = Number.isNaN(lx) ? undefined : lx;
      const ly = R.ly[i]; u.ly = Number.isNaN(ly) ? undefined : ly;
      const sxk = R.sxk[i]; u.sxk = Number.isNaN(sxk) ? undefined : sxk;
      const syk = R.syk[i]; u.syk = Number.isNaN(sykk(syk)) ? undefined : syk;
      u.stk = R.stk[i] === -2147483648 ? undefined : R.stk[i]; // MIN=undefined；真 0 保留
      u.atk = nz(R.atk[i]); u.chill = nz(R.chill[i]);
      u.fleeT = nz(R.fleet[i]); u.bless = nz(R.bless[i]);
      u.curse = nz(R.curse[i]); u.fert = nz(R.fert[i]);
      u.detour = nz(R.detour[i]); u.hurt = R.hurt[i] ?? 0;
      const job = R.job[i]; u.job = job >= 0 ? job : undefined;
      const tr = R.trait[i]; u.trait = tr >= 0 ? (this.traitKeys[tr] ?? null) : null;
      u.infected = R.inf[i] !== 0; u.flip = R.flip[i] !== 0;
      // Task 50：虚拟船感知写回 —— 商队行的镜像 boat=1 不得实体化为 JS 真船（否则接力段会误入 updateBoat）；
      // u.caravan 不再从 wasm 回写（cvn 列因步长错位已休眠 —— JS 为唯一权威）
      u.boat = (R.boat[i] && !this.virtBoat[i]) ? 1 : undefined; u.boatTTL = R.btl[i] || undefined;
      const army = R.army[i]; u.army = army >= 0 ? army : undefined;
      for (let g = 0; g < 7; g++) {
        const gi = R.gear[i * 7 + g];
        (u as unknown as Record<string, unknown>)[GEAR_KEYS[g] as string] = gi >= 0 ? this.itemIds[gi] : null;
      }
      const gs = R.gene[i * 4];
      if (!Number.isNaN(gs)) u.gene = { s: gs, d: R.gene[i * 4 + 1], h: R.gene[i * 4 + 2], r: R.gene[i * 4 + 3] };
      const fam = R.fam[i]; u.fam = fam >= 0 ? fam : undefined;
      const fgn = R.fgn[i]; u.fgn = fgn >= 0 ? fgn : undefined;
      const nl = R.name[i * 32 + 31];
      if (nl > 0) u.name = this.dec.decode(R.name.subarray(i * 32, i * 32 + nl));
      const gl = R.gln[i];
      if (gl >= 0) {
        const ids: number[] = []; const vals: number[] = [];
        for (let g = 0; g < gl && g < 8; g++) { ids.push(R.gids[i * 8 + g]); vals.push(R.gval[i * 8 + g]); }
        u.gIds = ids; u.gVal = vals;
      } else { u.gIds = undefined; u.gVal = undefined; }
      // 名缓存随行同步（Rust spawn 写入的名与 JS 对象一致化）
      if (this.nameCacheStr[i] !== u.name) this.nameCacheStr[i] = undefined;
    }
    // wildCount 重建
    const wild = this.getWildCounts();
    engine.wildCount.clear();
    for (let r = 0; r < 512; r++) if (wild[r] > 0) engine.wildCount.set(r, wild[r]);
    // 计数器回写
    const cnt = this.getCounters();
    engine.firesOut = cnt[0]; engine.lastFireOutEventTick = cnt[1];
    engine.repairsDone = cnt[2]; engine.lastRepairEventTick = cnt[3];
    engine.statDragonsSlain = cnt[4];
    // 序列号同步（Rust 侧 spawn/newFamily 递增）
    engine.unitSeq = new Uint32Array(this.mem, this.at(OFF_USEQ), 1)[0];
    engine.familySeq = new Int32Array(this.mem, this.at(OFF_FMSEQ), 1)[0];
    // 神经调用计数（面板统计）
    const nc = this.getNeuroCalls();
    neuroStats.calls[0] += nc[0]; neuroStats.calls[1] += nc[1]; neuroStats.calls[2] += nc[2];
    new Uint32Array(this.mem, this.at(OFF_NEUCALL), 3).fill(0);
  }
}

function sykk(v: number): number { return v; }
/** NaN 哨兵还原：undefined 保真（0 为合法值保留） */
function nz(v: number): number | undefined { return Number.isNaN(v) ? undefined : v; }

export const WBB = new WbBatch();

// bun 基准直灌支持（与 Stage 1 相同协议）
if (typeof window === 'undefined' && typeof globalThis !== 'undefined') {
  (globalThis as unknown as Record<string, unknown>).__wbbatchBootBytes = (bytes: Uint8Array) => WBB.boot(bytes);
}

// Stage 2 批内核 QA 钩子（必须在 WBB 声明之后 —— TDZ）
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__wbBatchCore = WBB;
}
