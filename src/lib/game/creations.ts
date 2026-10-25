// ============ 造物图鉴（神谕创造模式的永久图书馆） ============
// 跨世界持久的造物库：物种 / 神铸武器 / 神物三类条目，localStorage 独立槽位。
// 与放置面板深度集成：pinned 物种/神物条目自动成为底部工具栏的自定义工具（可删除）。
// 深度集成神谕：条目可唤醒神谕 AI 编辑（OraclePanel create 模式消费 pending 上下文）。
import type { ItemSlot, ItemDef } from './items';
import type { ToolDef, ToolTab } from './constants';
import { SLOT_NAMES, RARITY_META, ITEM_DEFS } from './items';

/** 图鉴条目种类 */
export type CreationKind = 'species' | 'weapon' | 'item';

/** 造物色环（与引擎涌现色点 DYN_TINTS 完全一致：面板条目 ↔ 生物头顶色点同色可对认） */
export const CRE_TINTS = ['#ff5fd2', '#5fe8ff', '#c9ff5f', '#ff9e5f', '#b45fff', '#7df9ff', '#ffb35f', '#a0ff8f'];

export interface SpeciesCreation {
  uid: string;
  kind: 'species';
  /** 展示名（≤8 字） */
  name: string;
  /** 模板种族（内置或动态 id——跨世界引用 key 化，见 baseKey） */
  baseKey: string;
  baseName: string;
  /** 野生=false 时为文明种族（可建国） */
  wild: boolean;
  hp: number;
  dmg: number;
  speed: number;
  repro: number;
  maxAge: number;
  /** 视觉基因组 13 元组（外貌永久定格） */
  visT?: number[];
  tintIdx: number;
  /** 强度倍率留档（展示用） */
  power: number;
  /** v5 全新造物元数据：体形族系（决定精灵色板与身体构造，如 wolf/bear/deer/person） */
  form?: string;
  /** 捕食者（生态角色锚：猎食其他野生动物） */
  predator?: boolean;
  /** 敌视文明（无端攻击文明种族） */
  hostile?: boolean;
  /** 野生种群上限（4-400；缺省按生态角色） */
  cap?: number;
  /** 种族原型一句话（种族面板展示） */
  archetype?: string;
  pinned: boolean;
  createdAt: number;
  createdBy: 'oracle' | 'player';
  note?: string;
}

export interface WeaponCreation {
  uid: string;
  kind: 'weapon';
  name: string;
  /** 四槽组件（装药/投送/制导/供能） */
  payload: number;
  delivery: number;
  guide: number;
  powerSlot: number;
  /** 威力倍率 */
  boost: number;
  pinned: boolean;
  createdAt: number;
  createdBy: 'oracle' | 'player';
  note?: string;
}

export interface ItemCreation {
  uid: string;
  kind: 'item';
  name: string;
  slot: ItemSlot;
  rarity: number;
  /** 图标形制（sword/axe/bow/gun…） */
  art: string;
  stats: Partial<Pick<ItemDef, 'dmg' | 'hp' | 'speedMul' | 'regen' | 'armor' | 'crit' | 'lifesteal' | 'thorns' | 'ranged'>>;
  desc: string;
  pinned: boolean;
  createdAt: number;
  createdBy: 'oracle' | 'player';
  note?: string;
}

export type CreationEntry = SpeciesCreation | WeaponCreation | ItemCreation;

// ———————————————————————— 持久化（安全读写） ————————————————————————

const CRE_KEY = 'wb_creations_v1';
const CRE_SEQ_KEY = 'wb_creations_seq';
/** 图鉴条目上限（防配额膨胀；武器模板很轻，物种带视觉基因组约 300B） */
export const CREATION_CAP = 128;

let _cache: CreationEntry[] | null = null;
let _seq = 1;

function readLibrary(): CreationEntry[] {
  try {
    const raw = localStorage.getItem(CRE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CreationEntry[];
    if (!Array.isArray(arr)) return [];
    // 防御式逐行校验：坏行丢弃（uid/kind/name 是必备三件套）
    return arr.filter((e): e is CreationEntry => !!e && typeof e.uid === 'string' && !!e.kind && typeof e.name === 'string');
  } catch {
    return [];
  }
}

function writeLibrary(list: CreationEntry[]): boolean {
  try {
    const json = JSON.stringify(list);
    localStorage.setItem(CRE_KEY, json);
    // 回读校验（存档安全惯例）
    if (localStorage.getItem(CRE_KEY) !== json) return false;
    return true;
  } catch {
    return false;
  }
}

/** 读取图鉴（内存缓存；首次访问时水合物品定义） */
export function listCreations(): CreationEntry[] {
  if (_cache === null) {
    _cache = readLibrary();
    try {
      _seq = Math.max(1, parseInt(localStorage.getItem(CRE_SEQ_KEY) ?? '1', 10) || 1);
    } catch {
      _seq = 1;
    }
    hydrateItemDefs(_cache);
  }
  return _cache;
}

/** 生成下一个稳定 uid（c1, c2, …；序号持久化防跨会话撞车） */
function nextUid(): string {
  const uid = `c${_seq}`;
  _seq++;
  try {
    localStorage.setItem(CRE_SEQ_KEY, String(_seq));
  } catch {
    /* 序号写失败：uid 仍有 createdAt 兜底唯一性判据 */
  }
  return uid;
}

/** 通知订阅方图鉴已变化（Toolbar / OraclePanel / 编辑器刷新） */
type Listener = () => void;
const listeners = new Set<Listener>();
export function subscribeCreations(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(): void {
  for (const fn of listeners) fn();
}

// ———————————————————————— 增删改（唯一写入口） ————————————————————————

/** 新增条目（uid 自动分配；同名条目替换保 uid，超上限时最旧的未固定条目让位）。
 *  泛型化：传入 Omit<SpeciesCreation,...> 则返回 SpeciesCreation | null（联合类型自动窄化） */
export function addCreation<T extends CreationEntry>(entry: Omit<T, 'uid' | 'createdAt'> & { uid?: string; createdAt?: number }): T | null {
  const list = listCreations();
  const full: T = { ...(entry as T), uid: entry.uid ?? nextUid(), createdAt: entry.createdAt ?? Date.now() } as T;
  // 同名替换（重编辑而非堆积）：保留原 uid → 放置面板引用不断裂
  const dupIdx = list.findIndex((e) => e.kind === full.kind && e.name === full.name);
  if (dupIdx >= 0) {
    full.uid = list[dupIdx].uid;
    list[dupIdx] = full;
  } else {
    if (list.length >= CREATION_CAP) {
      // 让位策略：优先淘汰最旧的未 pin 条目；全 pin 则拒绝
      const victim = list.filter((e) => !e.pinned).sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!victim) return null;
      list.splice(list.indexOf(victim), 1);
    }
    list.push(full);
  }
  if (!writeLibrary(list)) return null;
  _cache = list;
  if (full.kind === 'item') hydrateItemDefs(list);
  notify();
  return full;
}

/** 更新条目（部分字段合并；kind 不可变）。pinned/note 为三类条目共有可编辑字段 */
export function patchCreation(uid: string, patch: Partial<Omit<SpeciesCreation, 'kind'>> & Partial<Omit<WeaponCreation, 'kind'>> & Partial<Omit<ItemCreation, 'kind'>>): CreationEntry | null {
  const list = listCreations();
  const i = list.findIndex((e) => e.uid === uid);
  if (i < 0) return null;
  const { uid: _u, kind: _k, createdAt: _c, ...safe } = patch as Partial<CreationEntry>;
  const next = { ...list[i], ...safe } as CreationEntry;
  if (!next.name || typeof next.name !== 'string') return null;
  list[i] = next;
  if (!writeLibrary(list)) return null;
  _cache = list;
  if (next.kind === 'item') hydrateItemDefs(list);
  notify();
  return next;
}

/** 删除条目 */
export function removeCreation(uid: string): boolean {
  const list = listCreations();
  const i = list.findIndex((e) => e.uid === uid);
  if (i < 0) return false;
  list.splice(i, 1);
  const ok = writeLibrary(list);
  _cache = list;
  notify();
  return ok;
}

/** 按 uid / 名称检索 */
export function getCreation(uidOrName: string): CreationEntry | null {
  const list = listCreations();
  return list.find((e) => e.uid === uidOrName) ?? list.find((e) => e.name === uidOrName) ?? null;
}

// ———————————————————————— 自定义物品定义注册 ————————————————————————

/** 物品条目 → 全局 ITEM_DEFS 注册（kind = uid，跨世界稳定；
 *  地面物品存档 [id, kind, x, y] 直接引用该 kind，读档后由本函数重建定义） */
export function hydrateItemDefs(list: CreationEntry[]): void {
  // 延迟 import 规避环（items.ts 零依赖，实际无环；但保持模块纯净）
  for (const e of list) {
    if (e.kind !== 'item') continue;
    hydrateOneItem(e);
  }
}

export function hydrateOneItem(e: ItemCreation): void {
  // ITEM_DEFS 为模块级可变 Record（items.ts 零依赖，无环）：动态神物注入
  ITEM_DEFS[e.uid] = { key: e.uid, name: e.name, slot: e.slot, rank: 50 + e.rarity * 10, rarity: e.rarity, art: e.art, desc: e.desc, ...e.stats };
}

// ———————————————————————— 放置面板工具生成 ————————————————————————

/** 物种条目 → 工具 id（`cre:<uid>`；applyTool 捕获该前缀走造物放置路径） */
export function creationToolId(uid: string): string {
  return `cre:${uid}`;
}
export function parseCreationTool(toolId: string): string | null {
  return toolId.startsWith('cre:') ? toolId.slice(4) : null;
}

/** 图鉴 → 放置面板工具清单（pinned 条目；物种进对应生物页，神物进宝物页） */
export function creationTools(): ToolDef[] {
  const out: ToolDef[] = [];
  for (const e of listCreations()) {
    if (!e.pinned) continue;
    if (e.kind === 'species') {
      const tab: ToolTab = e.wild ? 'animals' : 'creatures';
      out.push({
        id: creationToolId(e.uid),
        label: e.name,
        desc: `神谕造物 · ${e.form ? `体形 ${e.form}` : `模板「${e.baseName}」`} · 生命 ${Math.round(e.hp)} / 攻击 ${e.dmg}${e.predator ? ' · 捕食者' : ''}${e.hostile ? ' · 敌视文明' : ''}${e.note ? ` · ${e.note}` : ''}`,
        tab,
        icon: '', // 图标由 Toolbar 按体形族系渲染（RaceDot 色块）
        params: [
          { key: 'count', label: '数量', min: 1, max: 40, step: 1, def: 6 },
          { key: 'radius', label: '散布', min: 1, max: 10, step: 1, def: 4 },
        ],
      });
    } else if (e.kind === 'item') {
      out.push({
        id: creationToolId(e.uid),
        label: e.name,
        desc: `神谕神物 · ${RARITY_META[e.rarity]?.name ?? ''} · ${SLOT_NAMES[e.slot] ?? e.slot} · ${e.desc}`,
        tab: 'items',
        icon: e.art,
        single: true,
        params: [{ key: 'count', label: '数量', min: 1, max: 8, step: 1, def: 1 }],
      });
    }
    // 武器条目不进放置面板（武器属于王国军备，由工坊「铸造到王国」使用）
  }
  return out;
}

/** 条目摘要（神谕编辑上下文 / 图鉴列表展示共用） */
export function describeCreation(e: CreationEntry): string {
  if (e.kind === 'species') {
    return `物种「${e.name}」（uid ${e.uid}）：${e.form ? `体形族系 ${e.form}` : `模板 ${e.baseName}`}，${e.wild ? '野生' : '文明'}形态，hp ${Math.round(e.hp)}，攻击 ${e.dmg}，速度 ${e.speed}，繁衍 ${e.repro}，寿限 ${e.maxAge} 年${e.predator != null ? `，${e.predator ? '捕食者' : '非捕食'}` : ''}${e.hostile ? '，敌视文明' : ''}${e.cap ? `，种群上限 ${e.cap}` : ''}${e.archetype ? `，「${e.archetype}」` : ''}${e.pinned ? '，已上放置面板' : ''}`;
  }
  if (e.kind === 'weapon') {
    return `武器「${e.name}」（uid ${e.uid}）：装药 ${e.payload} 投送 ${e.delivery} 制导 ${e.guide} 供能 ${e.powerSlot}，威力倍率 ${e.boost}${e.pinned ? '，已收藏' : ''}`;
  }
  const st = Object.entries(e.stats).map(([k, v]) => `${k}=${v}`).join(' ');
  return `神物「${e.name}」（uid ${e.uid}）：${SLOT_NAMES[e.slot] ?? e.slot}，稀有度 ${RARITY_META[e.rarity]?.name ?? e.rarity}${st ? `，${st}` : ''}，${e.desc}`;
}
