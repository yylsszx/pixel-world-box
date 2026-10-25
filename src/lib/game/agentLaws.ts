// ============ Agent 法则系统 v2（Task 41：机制热插拔引擎） ============
// 神谕 Agent 用 create_law / update_law 书写的「活机制」：
//   触发器（cron 周期 / event 事件总线 / condition 条件轮询）
//   × 条件表达式树（and/or/not × gt/lt/gte/lte/eq × 16 世界统计键 + counter:自定义计数器）
//   × 33 种动作（17 经典 + 15 神力 + 机制链 mech + 计数器 counter）。
// 设计约束：
//   1. 纯数据描述（无 eval / 无代码注入）——动作与条件都是封闭枚举，参数引擎侧硬校验；
//   2. 结算预算封顶（tick 全局 fire ≤6 / 单事件 ≤4 / LRU 24 条——防 Agent 写出性能炸弹）；
//   3. param 动作记录改前值——机制移除/停用/到期/改写时自动还原（可逆性是神谕的承诺）；
//   4. onEvent 重入保护（firing 标志）——fire 里的神力会再 addEvent，没有它就是无限递归；
//   5. 旧档兼容：v1 触发器 {everyYears,chance,season} 读档时 normalizeLaw 归一化为 cron；
//   6. 纯函数（normalizeTrigger/validateCond/evalCond/normalizeLaw）独立导出——可脱离引擎单测。
import type { GameEngine } from './engine';
import type { AgentLaw, AgentLawAction, CondExpr, MechTrigger, WorldEventKind } from './types';
import { setEngineParam, getEngineParam } from './engineParams';
import { R, RACES, T } from './types';
import { W, H, isWater } from './constants';

export type { AgentLaw, AgentLawAction, CondExpr, MechTrigger };

const ACTION_KINDS = new Set([
  'meteor', 'quake', 'volcano', 'lightning', 'tornado', 'tsunami', 'drought', 'flood', 'blizzard',
  'weather', 'spawn', 'terrain', 'bless', 'heal', 'smite', 'param', 'announce',
  // —— v2：15 种神力 + 机制链 + 计数器（17 → 33）——
  'meteor_shower', 'typhoon', 'acid_rain', 'locust', 'famine', 'ice_age', 'sinkhole', 'blackhole',
  'wrath', 'curse', 'love', 'mutate', 'teleport', 'rain_cloud', 'mech', 'counter',
  // —— v5：六新神力（33 → 39；与 divine_power 全量对齐）——
  'nuke', 'plague', 'fire', 'boom', 'river', 'oasis',
]);

/** WorldEventKind 全集注册表（编译期 exhaustive —— 新增事件类型时 tsc 会提醒同步此表） */
const EVENT_KIND_TABLE = {
  found: true, war: true, peace: true, fall: true, unify: true, dragon: true, legend: true, plague: true,
  zombie: true, nuke: true, meteor: true, battle: true, colonize: true, settle: true, shipwreck: true,
  river: true, oasis: true, rebel: true, bandit: true, demon: true, skeleton: true, trigger: true,
  siege: true, capture: true, sack: true, totalwar: true, loot: true, build: true, acidrain: true,
  volcano: true, tsunami: true, blizzard: true, locust: true, drought: true, meteorshower: true,
  whitewalker: true, vampire: true, kraken: true, sandworm: true, basilisk: true, petrify: true,
  army: true, clash: true, rout: true, cession: true, occupy: true, capital: true, decree: true,
  decreeOk: true, decreeFail: true, casus: true, collapse: true, tech: true, gov: true, riot: true,
  festival: true, fireOut: true, repair: true, rain: true, sandstorm: true, typhoon: true,
  sinkhole: true, iceage: true, famine: true, blackhole: true, wrath: true, evolve: true, eco: true,
  achieve: true, worldwar: true, superweapon: true, emerge: true, geo: true, road: true, trade: true,
  alliance: true, extinct: true, panic: true, revenge: true, lineage: true, oracle: true, king: true,
  angel: true, phoenix: true, ent: true, lich: true, hydra: true, holystorm: true, season: true,
} satisfies Record<WorldEventKind, true>;
const EVENT_KINDS: ReadonlySet<string> = new Set(Object.keys(EVENT_KIND_TABLE));

/** 法则结算结果（工具回传给 Agent 的证据） */
export interface LawFireReport {
  id: string;
  name: string;
  firedActions: string[];
  detail: string[];
}

const TERRAIN_MAP: Record<string, number> = {
  water: T.WATER, deep: T.DEEP, sand: T.SAND, grass: T.GRASS, forest: T.FOREST,
  hill: T.HILL, mountain: T.MOUNTAIN, snow: T.SNOW, burnt: T.BURNT, lava: T.LAVA, ice: T.ICE,
};

/** 数值安全夹取（非数 / NaN → 默认值） */
const clampN = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
/** 可选整数参数夹取（非法 → undefined = 用引擎缺省） */
const optI = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined;

/** 种族名 → race id（中文/英文/key 模糊匹配，如 "人族"/"羊"/"wolf"/"DRAGON"） */
export function resolveRace(name: string): number | null {
  const q = (name ?? '').trim().toLowerCase();
  if (!q) return null;
  // 1) 精确 key
  for (const k of Object.keys(R)) {
    if (k.toLowerCase() === q) return (R as Record<string, number>)[k];
  }
  // 2) 中文名 / 英文名包含
  for (const [id, d] of Object.entries(RACES)) {
    if (!d) continue;
    if (d.name === name || d.key.toLowerCase() === q || d.name.toLowerCase() === q) return Number(id);
  }
  // 3) 首个名称包含匹配（"雪狼"→"雪狼"）
  for (const [id, d] of Object.entries(RACES)) {
    if (d && (d.name.includes(q) || d.key.toLowerCase().includes(q))) return Number(id);
  }
  return null;
}

// ==================================================================
// 纯函数 DSL（无引擎依赖——冒烟测试/前端预览均可直接复用）
// ==================================================================

/** 条件树校验（递归；深度 ≤4、and/or 的 sub ≤4、stat 非空、value 有限数）。返回合法树或错误文案 */
export function validateCond(c: unknown, depth = 0): CondExpr | string {
  if (depth > 4) return '条件嵌套过深（至多 4 层）';
  if (c === null || typeof c !== 'object' || Array.isArray(c)) return '条件必须是对象 {op, ...}';
  const o = c as Record<string, unknown>;
  const op = String(o.op ?? '');
  if (op === 'and' || op === 'or') {
    if (!Array.isArray(o.sub)) return `${op} 需要 sub 数组`;
    if (o.sub.length > 4) return `${op} 的 sub 至多 4 个（化整为零或改用嵌套）`;
    const sub: CondExpr[] = [];
    for (const s of o.sub) {
      const r = validateCond(s, depth + 1);
      if (typeof r === 'string') return r;
      sub.push(r);
    }
    return { op, sub };
  }
  if (op === 'not') {
    const r = validateCond(o.sub, depth + 1);
    if (typeof r === 'string') return r;
    return { op: 'not', sub: r };
  }
  if (op === 'gt' || op === 'lt' || op === 'gte' || op === 'lte' || op === 'eq') {
    const stat = String(o.stat ?? '').trim();
    if (!stat) return '比较条件需要非空 stat（统计键，如 year/pop/wars 或 counter:名）';
    if (typeof o.value !== 'number' || !Number.isFinite(o.value)) return `条件 ${stat} 需要有限数字 value`;
    return { op, stat, value: o.value };
  }
  return `未知条件运算 ${op || '（空）'}（可用：and/or/not/gt/lt/gte/lte/eq）`;
}

/** 条件树求值（纯函数；statFn 提供统计键 → 数值）。and/or 空 sub 视为 true/false；NaN 一律判 false */
export function evalCond(c: CondExpr, stat: (key: string) => number): boolean {
  switch (c.op) {
    case 'and': return c.sub.every((s) => evalCond(s, stat));
    case 'or': return c.sub.some((s) => evalCond(s, stat));
    case 'not': return !evalCond(c.sub, stat);
    default: {
      // switch 正向分支收窄到比较分支（if-return 链对 {op:'and'|'or'} 多字面量判别式不复合收窄）
      const v = stat(c.stat);
      if (!Number.isFinite(v)) return false; // 未知统计键 → NaN → 判 false
      switch (c.op) {
        case 'gt': return v > c.value;
        case 'lt': return v < c.value;
        case 'gte': return v >= c.value;
        case 'lte': return v <= c.value;
        default: return Math.abs(v - c.value) < 1e-9; // eq：浮点安全等值
      }
    }
  }
}

/** 触发器归一化 + 校验（纯函数）：
 *  - v2 结构 {kind:'cron'|'event'|'condition', ...}；
 *  - 旧协议 {everyYears,chance,season}（无 kind）→ 归一化为 cron；
 *  - 顶层 event/cond 提示词存在时可推断 kind。返回合法触发器或错误文案。 */
export function normalizeTrigger(raw: unknown): MechTrigger | string {
  const o = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const kindRaw = o.kind === undefined ? '' : String(o.kind);
  let kind: MechTrigger['kind'];
  if (kindRaw === 'cron' || kindRaw === 'event' || kindRaw === 'condition') kind = kindRaw;
  else if (kindRaw === '') kind = o.event !== undefined ? 'event' : o.cond !== undefined ? 'condition' : 'cron';
  else return `未知触发器类型 ${kindRaw}（可用：cron/event/condition）`;
  const chance = o.chance === undefined ? 1 : clampN(o.chance, 0.01, 1, 1);
  const season = o.season === undefined || o.season === null ? null : Math.max(0, Math.min(3, Math.round(Number(o.season) || 0)));
  const everyYears = o.everyYears === undefined
    ? (kind === 'condition' ? 1 : 10)
    : Math.max(1, Math.min(100, Math.round(Number(o.everyYears) || 1)));
  if (kind === 'event') {
    const ev = String(o.event ?? '');
    if (!EVENT_KINDS.has(ev)) return `未知事件类型 ${ev}（可用 WorldEventKind，如 fall/war/plague/meteor/oracle…）`;
    const cd = o.eventCooldownYears === undefined ? 1 : Math.max(1, Math.min(100, Math.round(Number(o.eventCooldownYears) || 1)));
    return { kind: 'event', chance, event: ev, eventCooldownYears: cd };
  }
  if (kind === 'condition') {
    if (o.cond === undefined || o.cond === null) return 'condition 触发器必须带 cond 条件树';
    const c = validateCond(o.cond);
    if (typeof c === 'string') return c;
    return { kind: 'condition', everyYears, chance, season, cond: c };
  }
  return { kind: 'cron', everyYears, chance, season };
}

/** 存档行修复（applySave 用，纯函数）：v1 触发器补 kind:'cron'、缺省字段补默认、未知动作剔除——
 *  旧档读入不炸、不丢已触发统计；彻底损坏的行返回 null 丢弃。 */
export function normalizeLaw(raw: unknown): AgentLaw | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return null;
  if (!Array.isArray(o.actions)) return null;
  const actions: AgentLawAction[] = [];
  for (const a of o.actions) {
    if (a === null || typeof a !== 'object' || Array.isArray(a)) continue;
    const act = a as Record<string, unknown>;
    if (!ACTION_KINDS.has(String(act.kind ?? ''))) continue; // 未知/损坏动作剔除
    actions.push(act as AgentLawAction);
  }
  if (actions.length === 0) return null;
  const tr = normalizeTrigger(o.trigger);
  const trigger: MechTrigger = typeof tr === 'string'
    ? { kind: 'cron', everyYears: 10, chance: 1, season: null } // 触发器损坏：退化为安全默认（保留 fired 统计）
    : tr;
  const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    id: o.id,
    name: typeof o.name === 'string' && o.name ? o.name.slice(0, 24) : '无名法则',
    desc: typeof o.desc === 'string' && o.desc ? o.desc.slice(0, 120) : '（无描述）',
    enabled: o.enabled !== false,
    createdYear: Math.round(numOr(o.createdYear, 0)),
    durationYears: o.durationYears == null ? null : Math.max(1, Math.min(1000, Math.round(numOr(o.durationYears, 100)))),
    trigger,
    actions,
    fired: Math.max(0, Math.round(numOr(o.fired, 0))),
    lastYear: Math.round(numOr(o.lastYear, 0)),
    revert: {}, // 改前值账本不序列化（热参数不入档——读档即回默认基调，账本自然清零）
  };
}

/** 动作数组校验（create/update 共用；返回合法动作序列或错误文案） */
function validateActions(raw: unknown): AgentLawAction[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return '机制至少需要一个动作（actions 数组）';
  if (raw.length > 8) return '单条机制至多 8 个动作（拆成多条机制）';
  const actions: AgentLawAction[] = [];
  for (const a of raw) {
    const act = (a ?? {}) as Record<string, unknown>;
    const kind = String(act.kind ?? '');
    if (!ACTION_KINDS.has(kind)) return `未知动作类型 ${kind}（可用：${[...ACTION_KINDS].join('/')}）`;
    const num = (v: unknown, lo: number, hi: number, d: number) => clampN(v, lo, hi, d);
    const opt = (v: unknown, lo: number, hi: number) => optI(v, lo, hi);
    switch (kind) {
      case 'meteor': case 'flood':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1) });
        break;
      case 'quake':
      case 'volcano':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), power: num(act.power, 1, 3, 2) });
        break;
      case 'lightning':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), count: num(act.count, 1, 12, 4) });
        break;
      case 'tornado':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), count: num(act.count, 1, 4, 1) });
        break;
      case 'tsunami': case 'drought': case 'blizzard':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), radius: num(act.radius, 2, 16, 6) });
        break;
      case 'weather': {
        const w = String(act.weather ?? 'rain');
        if (w !== 'rain' && w !== 'sandstorm') return 'weather 只支持 rain/sandstorm';
        actions.push({ kind: 'weather', weather: w, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), radius: num(act.radius, 2, 14, 5) });
        break;
      }
      case 'spawn': {
        const race = resolveRace(String(act.race ?? ''));
        if (race === null) return `未知种族 ${String(act.race)}（用 get_world_digest 查看世界现存种族名）`;
        actions.push({ kind: 'spawn', race: String(act.race), count: num(act.count, 1, 50, 5), x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1) });
        break;
      }
      case 'terrain': {
        const t = TERRAIN_MAP[String(act.terrain ?? '')];
        if (t === undefined) return `未知地形 ${String(act.terrain)}（可用：${Object.keys(TERRAIN_MAP).join('/')}）`;
        actions.push({ kind: 'terrain', terrain: String(act.terrain), radius: num(act.radius, 1, 12, 3), x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1) });
        break;
      }
      case 'bless': case 'heal': case 'smite':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), radius: num(act.radius, 1, 14, 5) });
        break;
      case 'param': {
        const path = String(act.path ?? '');
        const cur = getEngineParam(path);
        if (!cur) return `未知参数 ${path}（先 get_params 查可用参数）`;
        actions.push({ kind: 'param', path, value: num(act.value, cur.min, cur.max, cur.value) });
        break;
      }
      case 'announce':
        actions.push({ kind: 'announce', text: String(act.text ?? '').slice(0, 120) });
        break;
      // ---------------- v2：15 种神力（radius 1-16 硬校验） ----------------
      case 'meteor_shower':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), radius: num(act.radius, 1, 16, 6), count: num(act.count, 1, 20, 6) });
        break;
      case 'typhoon': case 'acid_rain': case 'locust': case 'famine': case 'ice_age':
      case 'sinkhole': case 'blackhole': case 'wrath': case 'curse': case 'love':
      case 'mutate': case 'teleport': case 'rain_cloud':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), radius: num(act.radius, 1, 16, RADIUS_DEFAULTS[kind] ?? 5) });
        break;
      // ---------------- v2：机制链 + 计数器 ----------------
      case 'mech': {
        const op = String(act.action ?? '');
        if (op !== 'enable' && op !== 'disable') return 'mech 动作的 action 只支持 enable/disable';
        const target = String(act.target ?? '').trim();
        if (!/^L\d+$/.test(target)) return 'mech 动作的 target 必须是机制 id（L 开头，如 L3；先 list 查看现存机制）';
        actions.push({ kind: 'mech', action: op, target });
        break;
      }
      case 'counter': {
        const name = String(act.name ?? '').replace(/[:\s]+/g, '_').slice(0, 16); // sanitize：计数器名不得含冒号/空白
        if (!name) return 'counter 动作需要非空 name（≤16 字；条件里用 counter:名 读取）';
        const op = String(act.op ?? '');
        if (op !== 'add' && op !== 'set') return 'counter 动作的 op 只支持 add/set';
        if (typeof act.value !== 'number' || !Number.isFinite(act.value)) return 'counter 动作需要有限数字 value';
        actions.push({ kind: 'counter', name, op, value: clampN(act.value, -1e9, 1e9, 0) });
        break;
      }
      // ---------------- v5：六新神力（与 divine_power 对齐） ----------------
      case 'nuke':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), power: num(act.power, 1, 3, 2) });
        break;
      case 'plague': case 'fire': case 'boom':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1), radius: num(act.radius, 1, 16, 5) });
        break;
      case 'river': case 'oasis':
        actions.push({ kind, x: opt(act.x, 0, W - 1), y: opt(act.y, 0, H - 1) });
        break;
    }
  }
  return actions;
}

/** v2 神力动作的缺省半径（与引擎方法签名缺省对齐） */
const RADIUS_DEFAULTS: Record<string, number> = {
  typhoon: 6, acid_rain: 5, locust: 5, famine: 6, ice_age: 6,
  sinkhole: 4, blackhole: 8, wrath: 5, curse: 5, love: 5,
  mutate: 5, teleport: 5, rain_cloud: 5,
};

// ==================================================================
// 引擎侧的机制执行器（tick 结算 / addEvent 事件总线 / 工具直连共用）
// ==================================================================

export class AgentLawSystem {
  eng: GameEngine;
  laws: AgentLaw[] = [];
  seq = 1;
  /** v2：自定义计数器（counter 动作维护、条件 DSL 用 counter:名 读取；随存档走） */
  counters: Record<string, number> = {};
  /** v2：重入保护——fire 执行期间为 true，onEvent 见之即退（神力会再 addEvent，防无限递归） */
  private firing = false;
  /** v2：世界统计惰性快照（同一结算内复用；fire 改变世界 / 跨 tick 即作废） */
  private statsCache: Record<string, number> | null = null;
  private statsTick = -1;

  constructor(eng: GameEngine) {
    this.eng = eng;
  }

  /** 创建机制（工具入口；返回错误文案或 null=成功）。
   *  兼容三种协议：①v1 顶层 everyYears/chance/season（→cron）②v2 结构化 trigger ③顶层 event/cond。 */
  create(raw: {
    name?: string;
    desc?: string;
    everyYears?: number;
    chance?: number;
    season?: number | null;
    durationYears?: number | null;
    /** v2：结构化触发器（优先于顶层 legacy 字段） */
    trigger?: {
      kind?: string;
      everyYears?: number;
      chance?: number;
      season?: number | null;
      event?: string;
      eventCooldownYears?: number;
      cond?: unknown;
    };
    /** v2：顶层事件类型 / 条件树（与 legacy 字段可组合，推断 kind） */
    event?: string;
    cond?: unknown;
    actions?: unknown[];
  }): string | null {
    const name = (raw.name ?? '').trim().slice(0, 24);
    if (!name) return '机制必须有一个名字（name，≤24 字）';
    const durationYears = raw.durationYears == null ? null : Math.max(1, Math.min(1000, Math.round(raw.durationYears)));
    const tr = normalizeTrigger(
      raw.trigger != null
        ? raw.trigger
        : { everyYears: raw.everyYears, chance: raw.chance, season: raw.season, event: raw.event, cond: raw.cond },
    );
    if (typeof tr === 'string') return tr;
    const actions = validateActions(raw.actions);
    if (typeof actions === 'string') return actions;
    if (this.laws.length >= 24) this.remove(this.laws[0].id, false); // LRU：最多 24 条
    const law: AgentLaw = {
      id: `L${this.seq++}`,
      name,
      desc: (raw.desc ?? '').trim().slice(0, 120) || '（无描述）',
      enabled: true,
      createdYear: Math.floor(this.eng.yearF),
      durationYears,
      trigger: tr,
      actions,
      fired: 0,
      lastYear: Math.floor(this.eng.yearF),
      revert: {},
    };
    this.laws.push(law);
    this.eng.addEvent('oracle', `神谕书写了新法则「${name}」——${law.desc}`, {});
    return null;
  }

  /** 改写既有机制（v2 新增；跨代理冻结契约——bridge-ext 按此签名调用）。返回错误文案或 null=成功。
   *  保留 id/createdYear/fired；改 actions 前先还原旧 param 账本；patch.event/patch.cond=null 清除回 cron。 */
  update(id: string, patch: {
    name?: string;
    desc?: string;
    enabled?: boolean;
    everyYears?: number;
    chance?: number;
    season?: number | null;
    durationYears?: number | null;
    event?: string;
    cond?: unknown;
    actions?: unknown[];
  }): string | null {
    const law = this.laws.find((l) => l.id === id);
    if (!law) return `没有 id=${id} 的机制（先 list 查看现存机制）`;
    // —— 全字段先验后改（任一失败零副作用） ——
    const changes: string[] = [];
    let name: string | undefined;
    if (patch.name !== undefined) {
      name = String(patch.name).trim().slice(0, 24);
      if (!name) return '机制必须有一个名字（name，≤24 字）';
      if (name !== law.name) changes.push(`更名「${law.name}」→「${name}」`);
    }
    let desc: string | undefined;
    if (patch.desc !== undefined) {
      desc = String(patch.desc).trim().slice(0, 120) || '（无描述）';
      if (desc !== law.desc) changes.push('换了一套说辞');
    }
    if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') return 'enabled 必须是布尔值';
    let durationYears: number | null | undefined;
    if (patch.durationYears !== undefined) {
      durationYears = patch.durationYears == null ? null : Math.max(1, Math.min(1000, Math.round(Number(patch.durationYears) || 1)));
      if (durationYears !== law.durationYears) changes.push(durationYears === null ? '改为永久生效' : `时效改为 ${durationYears} 年`);
    }
    let everyYears: number | undefined;
    if (patch.everyYears !== undefined) everyYears = Math.max(1, Math.min(100, Math.round(Number(patch.everyYears) || 1)));
    let chance: number | undefined;
    if (patch.chance !== undefined) chance = clampN(patch.chance, 0.01, 1, 1);
    let season: number | null | undefined;
    if (patch.season !== undefined) season = patch.season == null ? null : Math.max(0, Math.min(3, Math.round(Number(patch.season))));
    let event: string | null | undefined;
    if (patch.event !== undefined) {
      if (patch.event === null) event = null; // 显式清除 → 回周期触发
      else {
        event = String(patch.event);
        if (!EVENT_KINDS.has(event)) return `未知事件类型 ${event}（可用 WorldEventKind，如 fall/war/plague/oracle…）`;
      }
    }
    let cond: CondExpr | null | undefined;
    if (patch.cond !== undefined) {
      if (patch.cond === null) cond = null; // 显式清除 → 回周期触发
      else {
        const c = validateCond(patch.cond);
        if (typeof c === 'string') return c;
        cond = c;
      }
    }
    if (event !== undefined && cond !== undefined && event !== null && cond !== null) {
      return 'event 与 cond 不能同时设定（一条机制只有一种触发方式）';
    }
    let actions: AgentLawAction[] | undefined;
    if (patch.actions !== undefined) {
      const a = validateActions(patch.actions);
      if (typeof a === 'string') return a;
      actions = a;
      changes.push(`动作重铸（${law.actions.length}→${a.length} 个）`);
    }
    // —— 校验全过：先还原 param 账本（可逆性承诺），再逐字段落盘 ——
    if (actions !== undefined) this.revertParams(law);
    if (name !== undefined) law.name = name;
    if (desc !== undefined) law.desc = desc;
    if (patch.enabled !== undefined) law.enabled = patch.enabled;
    if (durationYears !== undefined) law.durationYears = durationYears;
    const tg = law.trigger;
    if (everyYears !== undefined) {
      if (tg.kind === 'event') { tg.eventCooldownYears = everyYears; changes.push(`事件冷却 ${everyYears} 年`); }
      else { tg.everyYears = everyYears; changes.push(tg.kind === 'condition' ? `判定间隔 ${everyYears} 年` : `周期 ${everyYears} 年`); }
    }
    if (chance !== undefined) tg.chance = chance;
    if (season !== undefined) tg.season = season;
    if (event !== undefined) {
      if (event === null) { tg.kind = 'cron'; delete tg.event; delete tg.eventCooldownYears; delete tg.cond; changes.push('回到周期触发'); }
      else {
        if (tg.kind !== 'event') { tg.kind = 'event'; tg.eventCooldownYears = tg.eventCooldownYears ?? 1; delete tg.cond; tg.everyYears = undefined; }
        tg.event = event;
        changes.push(`转听「${event}」事件`);
      }
    }
    if (cond !== undefined) {
      if (cond === null) { tg.kind = 'cron'; delete tg.cond; delete tg.event; delete tg.eventCooldownYears; changes.push('回到周期触发'); }
      else {
        if (tg.kind !== 'condition') { tg.kind = 'condition'; tg.everyYears = tg.everyYears ?? 1; delete tg.event; delete tg.eventCooldownYears; }
        tg.cond = cond;
        changes.push('条件树已改写');
      }
    }
    if (actions !== undefined) law.actions = actions;
    this.eng.addEvent('oracle', `法则「${law.name}」被神谕改写——${changes.length > 0 ? changes.slice(0, 3).join('；') : '微调了细节'}`, {});
    return null;
  }

  /** 移除（还原 param 动作；announce 是否播报） */
  remove(id: string, announce = true): boolean {
    const k = this.laws.findIndex((l) => l.id === id);
    if (k < 0) return false;
    const law = this.laws[k];
    this.revertParams(law);
    this.laws.splice(k, 1);
    if (announce) this.eng.addEvent('oracle', `法则「${law.name}」被废止，世界恢复旧秩序`, {});
    return true;
  }

  toggle(id: string, enabled: boolean): boolean {
    const law = this.laws.find((l) => l.id === id);
    if (!law) return false;
    if (law.enabled && !enabled) this.revertParams(law); // 停用即还原 param 修改
    law.enabled = enabled;
    return true;
  }

  /** 还原 param 动作（改前值账本） */
  private revertParams(law: AgentLaw) {
    for (const a of law.actions) {
      if (a.kind === 'param' && law.revert[a.path] !== undefined) setEngineParam(a.path, law.revert[a.path]);
    }
    law.revert = {};
  }

  /** 每 120 tick 结算（引擎 tick 调度）：cron 年轮门槛 + condition 条件轮询；event 型在此无事可做。
   *  单次结算全局 fire 预算 ≤6（防性能雪崩）。 */
  tick() {
    if (this.laws.length === 0) return;
    const eng = this.eng;
    const year = Math.floor(eng.yearF);
    this.statsCache = null; // 新一轮结算：统计快照重建
    let budget = 6;
    for (const law of [...this.laws]) { // 快照遍历：到期移除会 splice
      if (!law.enabled) continue;
      // 到期移除
      if (law.durationYears !== null && year - law.createdYear >= law.durationYears) {
        this.remove(law.id, false);
        eng.addEvent('oracle', `法则「${law.name}」的时效已尽，悄然消散于风中`, {});
        continue;
      }
      const tg = law.trigger;
      if (tg.kind === 'event') continue; // 事件型由 addEvent 钩子驱动
      if (budget <= 0) continue;
      if (tg.kind === 'condition') {
        if (year - law.lastYear < (tg.everyYears ?? 1)) continue; // 两次触发的最小间隔
        if (tg.season !== null && tg.season !== undefined && eng.nature.season !== tg.season) continue;
        if (tg.cond === undefined || !this.evalCond(tg.cond)) continue;
        if (eng.rng() > (tg.chance ?? 1)) continue;
      } else {
        if (year - law.lastYear < (tg.everyYears ?? 10)) continue;
        if (tg.season !== null && tg.season !== undefined && eng.nature.season !== tg.season) continue;
        if (eng.rng() > (tg.chance ?? 1)) continue;
      }
      law.lastYear = year;
      law.fired++;
      budget--;
      const report = this.fire(law);
      if (report) eng.addEvent('oracle', `法则「${law.name}」降临：${report.detail.slice(0, 3).join('；')}`, {});
    }
  }

  /** v2：事件总线入口（引擎 addEvent 钩子调用）——event 型机制在此感应世界脉动。
   *  重入保护是安全命门：fire 里的神力会再 addEvent，没有它就是无限递归。
   *  未指定坐标的动作落在事件发生地（如王国覆灭处 spawn 恶魔）。单事件最多触发 4 条。 */
  onEvent(kind: WorldEventKind, x?: number, y?: number) {
    if (this.firing) return;
    if (this.laws.length === 0) return;
    const eng = this.eng;
    const year = Math.floor(eng.yearF);
    this.statsCache = null;
    let n = 0;
    for (const law of [...this.laws]) {
      if (n >= 4) break;
      if (!law.enabled) continue;
      const tg = law.trigger;
      if (tg.kind !== 'event' || tg.event !== kind) continue;
      if (year - law.lastYear < (tg.eventCooldownYears ?? 1)) continue;
      if (eng.rng() > (tg.chance ?? 1)) continue;
      law.lastYear = year;
      law.fired++;
      n++;
      const report = this.fire(law, x, y);
      if (report) eng.addEvent('oracle', `法则「${law.name}」感应世界脉动而发动：${report.detail.slice(0, 3).join('；')}`, {});
    }
  }

  /** v2：世界统计键（条件 DSL 的数据源）。16 个内置键 + counter:NAME 自定义计数器；未知键返回 NaN。 */
  statValue(key: string): number {
    if (key.startsWith('counter:')) return this.counters[key.slice(8)] ?? 0;
    if (this.statsCache === null || this.statsTick !== this.eng.tickCount) {
      this.statsCache = this.buildStats();
      this.statsTick = this.eng.tickCount;
    }
    const v = this.statsCache[key];
    return v === undefined ? NaN : v;
  }

  /** 全景统计（units 单遍历合并产出；soilAvg 与深时引擎 deepSnapshot 同口径）。 */
  private buildStats(): Record<string, number> {
    const eng = this.eng;
    let pop = 0, wildlife = 0, herbivores = 0, predators = 0, panicking = 0, feuds = 0;
    for (const u of eng.units) {
      if (u.dead) continue;
      const def = RACES[u.race];
      if (def?.isCiv) pop++;
      else wildlife++;
      if (eng.isHerbivoreRace(u.race)) herbivores++;
      if (def?.predator) predators++;
      if ((u.panic ?? 0) >= 0.5) panicking++;
      if (u.gIds?.length) feuds += u.gIds.length;
    }
    let kingdoms = 0;
    for (const c of eng.civs) if (c.alive) kingdoms++;
    const N = W * H;
    let soil = 0, land = 0;
    for (let i = 0; i < N; i++) {
      if (!isWater(eng.terrain[i])) { soil += eng.worldsim.soilF[i]; land++; }
    }
    return {
      year: Math.floor(eng.yearF),
      pop, wildlife, herbivores, predators, panicking, feuds,
      kingdoms,
      wars: eng.warData.size,
      families: eng.families.size,
      globalTemp: eng.worldsim.globalTemp,
      seaLevel: eng.worldsim.seaLevel,
      glacierArea: eng.worldsim.glacierTiles / N,
      soilAvg: land > 0 ? soil / land : 0,
      wildRaces: eng.dynRaces.size,
      fires: eng.fireSet.size,
    };
  }

  /** v2：条件树求值（类实例口径——statValue 数据源；NaN 一律判 false） */
  evalCond(c: CondExpr): boolean {
    return evalCond(c, (k) => this.statValue(k)); // 裸名 = 模块级纯函数 evalCond(c, statFn)
  }

  /** 执行一条机制的全部动作（工具「试运行」也直接调用它）。
   *  evX/evY：事件触发时的发生地坐标——动作未指定坐标时优先落到事件发生地，否则沿用随机缺省。 */
  fire(law: AgentLaw, evX?: number, evY?: number): LawFireReport | null {
    const eng = this.eng;
    const fired: string[] = [];
    const detail: string[] = [];
    const wasFiring = this.firing;
    this.firing = true; // 重入保护置位（finally 复位——嵌套调用时还原外层状态）
    try {
      for (const a of law.actions) {
        const px = 'x' in a && a.x !== undefined ? a.x : evX; // 定点横坐标：动作指定 > 事件地 > 随机
        const py = 'y' in a && a.y !== undefined ? a.y : evY;
        const x = px !== undefined ? px : 8 + Math.floor(eng.rng() * (W - 16));
        const y = py !== undefined ? py : 6 + Math.floor(eng.rng() * (H - 12));
        switch (a.kind) {
          case 'meteor':
            eng.meteor(x, y);
            fired.push('meteor'); detail.push(`陨石坠于(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'quake':
            eng.natureQuake(x, y, 4.5 + (a.power ?? 2) * 1.4);
            fired.push('quake'); detail.push(`M${(4.5 + (a.power ?? 2) * 1.4).toFixed(1)}地震震中(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'volcano':
            eng.volcano(x, y, a.power ?? 2);
            fired.push('volcano'); detail.push(`火山喷发(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'lightning':
            eng.lightning(x, y, a.count ?? 4);
            fired.push('lightning'); detail.push(`${a.count ?? 4}道天罚落点(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'tornado':
            eng.spawnTornado(x, y, a.count ?? 1);
            fired.push('tornado'); detail.push(`${a.count ?? 1}股龙卷风(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'tsunami':
            eng.tsunami(x, y, a.radius ?? 6);
            fired.push('tsunami'); detail.push(`海啸浪级${a.radius ?? 6}(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'drought':
            eng.drought(x, y, a.radius ?? 6);
            fired.push('drought'); detail.push(`干旱半径${a.radius ?? 6}(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'flood':
            eng.natureFlood(x, y);
            fired.push('flood'); detail.push(`洪水泛滥(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'blizzard':
            eng.blizzard(x, y, a.radius ?? 6);
            fired.push('blizzard'); detail.push(`暴风雪半径${a.radius ?? 6}(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'weather':
            if (a.weather === 'rain') {
              // 唤雨：区域内灭火 + 复苏（甘霖）
              eng.healArea(x, y, a.radius ?? 5);
              fired.push('rain'); detail.push(`甘霖降落(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            } else {
              eng.sandstorm(x, y, a.radius ?? 5);
              fired.push('sandstorm'); detail.push(`沙暴肆虐(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            }
            break;
          case 'spawn': {
            const rid = resolveRace(a.race);
            if (rid === null) break;
            const cnt = a.count ?? 5;
            let n = 0;
            for (let k = 0; k < cnt; k++) {
              const sx = px !== undefined ? px + (eng.rng() - 0.5) * 4 : 4 + eng.rng() * (W - 8);
              const sy = py !== undefined ? py + (eng.rng() - 0.5) * 4 : 4 + eng.rng() * (H - 8);
              eng.spawnUnit(rid, sx, sy, { silent: true });
              n++;
            }
            fired.push('spawn'); detail.push(`${RACES[rid]?.name ?? '?'}×${n}降临(${Math.round(x)},${Math.round(y)})`);
            break;
          }
          case 'terrain': {
            const t = TERRAIN_MAP[a.terrain];
            if (t === undefined) break;
            const rad = a.radius ?? 3;
            let n = 0;
            const r2 = rad * rad;
            for (let yy = Math.max(0, y - rad); yy <= Math.min(H - 1, y + rad); yy++) {
              for (let xx = Math.max(0, x - rad); xx <= Math.min(W - 1, x + rad); xx++) {
                if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
                eng.setTerrain(yy * W + xx, t);
                n++;
              }
            }
            fired.push('terrain'); detail.push(`${a.terrain}改地${n}格(${Math.round(x)},${Math.round(y)})`);
            break;
          }
          case 'bless':
            eng.blessArea(x, y, a.radius ?? 5);
            fired.push('bless'); detail.push(`神恩祝福(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'heal':
            eng.healArea(x, y, a.radius ?? 5);
            fired.push('heal'); detail.push(`治疗神力(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'smite': {
            const rad = a.radius ?? 5;
            let n = 0;
            const r2 = rad * rad;
            for (const u of eng.units) {
              if (u.dead) continue;
              if ((u.x - x) ** 2 + (u.y - y) ** 2 <= r2) { u.hp = 0; n++; }
            }
            fired.push('smite'); detail.push(`神罚诛灭${n}个生物(${Math.round(x)},${Math.round(y)})`);
            break;
          }
          case 'param': {
            if (law.revert[a.path] === undefined) {
              const cur = getEngineParam(a.path);
              if (cur) law.revert[a.path] = cur.value; // 记账改前值
            }
            setEngineParam(a.path, a.value);
            fired.push('param'); detail.push(`${a.path}→${a.value}`);
            break;
          }
          case 'announce':
            eng.addEvent('oracle', a.text, {});
            fired.push('announce'); detail.push('神谕宣告');
            break;
          // ---------------- v2：15 种神力 ----------------
          case 'meteor_shower':
            eng.meteorShower(x, y, a.radius ?? 6, a.count ?? 6);
            fired.push('meteor_shower'); detail.push(`陨石雨${a.count ?? 6}颗砸落(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'typhoon':
            eng.typhoon(x, y, a.radius ?? 6);
            fired.push('typhoon'); detail.push(`台风气旋成型(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'acid_rain':
            eng.acidRain(x, y, a.radius ?? 5);
            fired.push('acid_rain'); detail.push(`酸雨云凝聚(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'locust':
            eng.locust(x, y, a.radius ?? 5);
            fired.push('locust'); detail.push(`蝗群蔽日(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'famine':
            eng.famineCloud(x, y, a.radius ?? 6);
            fired.push('famine'); detail.push(`饥荒之云漂来(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'ice_age':
            eng.iceAge(x, y, a.radius ?? 6);
            fired.push('ice_age'); detail.push(`冰河寒潮降临(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'sinkhole':
            eng.sinkhole(x, y, a.radius ?? 4);
            fired.push('sinkhole'); detail.push(`天坑塌陷(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 4}`);
            break;
          case 'blackhole':
            eng.blackhole(x, y, a.radius ?? 8);
            fired.push('blackhole'); detail.push(`黑洞撕开时空(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'wrath':
            eng.wrathStorm(x, y, a.radius ?? 5);
            fired.push('wrath'); detail.push(`神怒之云聚拢(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'curse':
            eng.curseArea(x, y, a.radius ?? 5);
            fired.push('curse'); detail.push(`诅咒之地(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'love':
            eng.loveArea(x, y, a.radius ?? 5);
            fired.push('love'); detail.push(`爱之甘霖(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'mutate':
            eng.mutateArea(x, y, a.radius ?? 5);
            fired.push('mutate'); detail.push(`变异辐射(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'teleport':
            eng.teleportArea(x, y, a.radius ?? 5);
            fired.push('teleport'); detail.push(`空间折叠(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'rain_cloud':
            eng.rainCloud(x, y, a.radius ?? 5);
            fired.push('rain_cloud'); detail.push(`雨云蔽空(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          // ---------------- v2：机制链 + 计数器 ----------------
          case 'mech': {
            const t = this.laws.find((l) => l.id === a.target);
            if (!t) { detail.push(`目标机制 ${a.target} 已不存在`); break; }
            // disable 走 toggle：既改 enabled 又还原目标机制的 param 账本（可逆性同样适用于机制链）
            const ok = this.toggle(a.target, a.action === 'enable');
            fired.push('mech');
            detail.push(ok ? `机制「${t.name}」被${a.action === 'enable' ? '唤醒' : '冻结（param 已还原）'}` : `机制 ${a.target} 操作失败`);
            break;
          }
          case 'counter': {
            const prev = this.counters[a.name] ?? 0;
            const next = a.op === 'set' ? a.value : prev + a.value;
            this.counters[a.name] = Math.max(-1e9, Math.min(1e9, next));
            fired.push('counter'); detail.push(`计数器 ${a.name} = ${this.counters[a.name]}（${a.op === 'set' ? '设定' : '累加'} ${a.value}）`);
            break;
          }
          // ---------------- v5：六新神力 ----------------
          case 'nuke':
            eng.nuke(x, y, a.power ?? 2);
            fired.push('nuke'); detail.push(`核弹蘑菇云升起(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'plague':
            eng.plagueArea(x, y, Math.max(3, a.radius ?? 5));
            fired.push('plague'); detail.push(`瘟疫蔓延(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'fire': {
            const rad = a.radius ?? 5;
            let n = 0;
            const r2 = rad * rad;
            for (let yy = Math.max(0, y - rad); yy <= Math.min(H - 1, y + rad); yy++) {
              for (let xx = Math.max(0, x - rad); xx <= Math.min(W - 1, x + rad); xx++) {
                if ((xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
                eng.ignite(yy * W + xx);
                n++;
              }
            }
            fired.push('fire'); detail.push(`天火点燃${n}格(${Math.round(x)},${Math.round(y)})`);
            break;
          }
          case 'boom':
            eng.boom(x, y, Math.max(2, a.radius ?? 5));
            fired.push('boom'); detail.push(`爆破轰鸣(${Math.round(x)},${Math.round(y)})半径${a.radius ?? 5}`);
            break;
          case 'river':
            eng.carveRiver(x, y);
            fired.push('river'); detail.push(`新河凿成(${Math.round(x)},${Math.round(y)})`);
            break;
          case 'oasis':
            eng.createOasis(x, y);
            fired.push('oasis'); detail.push(`绿洲涌泉(${Math.round(x)},${Math.round(y)})`);
            break;
        }
      }
    } finally {
      this.firing = wasFiring;
      this.statsCache = null; // 神力已改变世界：统计快照作废
    }
    return fired.length > 0 ? { id: law.id, name: law.name, firedActions: fired, detail } : null;
  }

  /** 机制清单（工具/面板共用；v1 字段全保留——OraclePanel 正在消费）。
   *  v1 兼容口径：event 型的 everyYears 槽位回报事件冷却年（同为「两次触发的最小间隔年」）。 */
  list() {
    const ctrs = { ...this.counters };
    return this.laws.map((l) => ({
      id: l.id, name: l.name, desc: l.desc, enabled: l.enabled,
      createdYear: l.createdYear, durationYears: l.durationYears,
      everyYears: l.trigger.everyYears ?? l.trigger.eventCooldownYears ?? 1,
      chance: l.trigger.chance ?? 1,
      season: l.trigger.season ?? null,
      actions: l.actions.map((a) => a.kind), fired: l.fired,
      // —— v2 新增 ——
      triggerKind: l.trigger.kind,
      event: l.trigger.kind === 'event' ? l.trigger.event : undefined,
      cond: l.trigger.kind === 'condition' ? l.trigger.cond : undefined,
      counters: ctrs,
    }));
  }
}
