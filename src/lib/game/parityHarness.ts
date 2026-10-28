// ============ ParityHarness — JS/WASM 双路径位精确对账（Unity 对齐 S-D 前置工程，Task 128） ============
// 目的：rust-core Stage 3 覆盖扩张（更多子系统移入 WASM 批内核）前的安全网——
//   同一 seed 生成两个 GameEngine 实例串行跑 N tick：A 路径 WASM 批内核在位（WB.enabled=true）、
//   B 路径强制 JS（WB.enabled=false），全量快照（units 全字段 + 引擎标量 + civs）逐字段 Object.is 比对。
//   任何一位漂移（浮点尾数级）都会被捕获 —— 「位精确」不是口号，是可执行断言。
//
// 防假阳性：报告必须携带 wasmEngaged 证据（A 路径运行期间 WBB.stats.batches 有增量）——
//   若 WASM 资产未加载 / 批内核处于 guard 冷却，A 也会走 JS，「双 JS 平凡一致」必须如实降级为 ⚠。
//
// 镜像归还纪律：临时实例跑完后 WBB 内部镜像属于它们 —— 必须 touchMeta() 强制主引擎下 tick
//   全表重灌（generate() 的保险带语义，L776），否则主引擎增量 pack2 会读到脏镜像。
import { GameEngine } from './engine';
import { WB, WBB } from '../wasm/wbspatial';
import type { Unit } from './types';

export interface ParityMismatch {
  /** 漂移路径：units[37].x / civs[3].pop / engine.rngA */
  path: string;
  /** A 路径（WASM 批内核）值 */
  a: string;
  /** B 路径（强制 JS）值 */
  b: string;
}

export interface ParityReport {
  seed: number;
  ticks: number;
  /** A 路径真的走了 WASM 批内核（batches 增量 > 0）—— false 时一致性结论降级为「双 JS 平凡」 */
  wasmEngaged: boolean;
  /** Stage 1 空间内核资产在位 */
  wbReady: boolean;
  unitsA: number;
  unitsB: number;
  /** 实际比对的总字段数（含数组展开） */
  comparedFields: number;
  bitExact: boolean;
  /** 全量漂移计数（样本收集封顶但计数不封顶） */
  mismatchCount: number;
  /** 漂移样本（最多 8 条） */
  samples: ParityMismatch[];
  /** 仅 A（WASM）存在的单位 id（前 8 —— 出生/存活差） */
  onlyA: number[];
  /** 仅 B（JS）存在的单位 id（前 8） */
  onlyB: number[];
  /** 首个字段级漂移的单位下标（-1 = 无漂移或仅标量级漂移）——处理序定位用 */
  firstDiffIdx: number;
  /** 首个漂移单位的差异字段清单（如 x/hp/food/tx） */
  firstDiffFields: string[];
  /** 前 16 个有漂移的单位下标 + 各自差异字段名（Task 131：定位真猎手 P —— fdx 只是首个状态差，可能已是级联受益者） */
  firstDiffUnits: Array<{ idx: number; fields: string[] }>;
  msA: number;
  msB: number;
  /** 人类可读结论 */
  verdict: string;
}

const MAX_SAMPLES = 8;

/** Task 132 诊断：最近一次 runParityCheck 的双实例引用（runParityCheck 内赋值） */
let last: { A: GameEngine | null; B: GameEngine | null } = { A: null, B: null };

type Snap = Record<string, unknown>;

function snapUnit(u: Unit): Snap {
  const o: Snap = {};
  for (const k of Object.keys(u) as (keyof Unit)[]) {
    const v = u[k] as unknown;
    // undefined/null 值键剔除（JSON 语义）：writeback 会无条件设置 panic/food/wep 等键（值 undefined/null），
    // 与「键不存在」在引擎行为语义上等价（u.trait && … / u.wep ?? null 均同值同判）——
    // 不剔除会以键存在性噪音淹没真分歧样本
    if (v !== undefined && v !== null) o[k as string] = v;
  }
  return o;
}

function fmt(v: unknown): string {
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return JSON.stringify(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** 深比对（Object.is 语义：NaN 恒等 / +0≠-0）；漂移全量计数，样本封顶 8 条 */
function cmp(path: string, a: unknown, b: unknown, out: ParityMismatch[], count: { n: number; d: number }): boolean {
  count.n++;
  if (Object.is(a, b)) return true;
  if (a instanceof Array && b instanceof Array) {
    if (a.length !== b.length) {
      count.n++;
      count.d++;
      if (out.length < MAX_SAMPLES) out.push({ path: `${path}.length`, a: String(a.length), b: String(b.length) });
      return false;
    }
    let ok = true;
    for (let i = 0; i < a.length; i++) if (!cmp(`${path}[${i}]`, a[i], b[i], out, count)) ok = false;
    return ok;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object);
    const kb = new Set(Object.keys(b as object));
    let ok = true;
    for (const k of ka) {
      if (!kb.has(k)) {
        count.n++;
        count.d++;
        if (out.length < MAX_SAMPLES) out.push({ path: `${path}.${k}`, a: fmt((a as Snap)[k]), b: '<缺>' });
        ok = false;
        continue;
      }
      if (!cmp(`${path}.${k}`, (a as Snap)[k], (b as Snap)[k], out, count)) ok = false;
    }
    return ok;
  }
  count.d++;
  if (out.length < MAX_SAMPLES) out.push({ path, a: fmt(a), b: fmt(b) });
  return false;
}

/** 引擎级标量 + 结构长度 + civs 数值全比对（世界状态摘要） */
function snapScalars(e: GameEngine): Snap {
  return {
    tickCount: e.tickCount,
    rngA: e.rngA,
    yearF: e.yearF,
    units: e.units.length,
    corpses: e.corpses.length,
    items: e.items.length,
    buildings: e.buildings.length,
    families: e.families.size,
    civs: e.civs.map((c) => ({
      id: c.id,
      name: c.name,
      race: c.race,
      pop: c.pop,
      houses: c.houses,
      capital: c.capital,
      alive: c.alive,
      tiles: c.tiles.length,
      frontier: c.frontier.length,
    })),
  };
}

/**
 * 运行位精确对账：同 seed 双实例串行（A=WASM 批内核 → B=强制 JS），N tick 后全量快照比对。
 * 同步阻塞（几百单位 × 60 tick × 2 ≈ 0.5-1s）——由 DevPanel 按钮或 QA eval 触发，勿进渲染热路径。
 * opts.noRepro：诊断开关——两实例统一禁繁衍（laws.reproduction=false），用于分层排除繁衍链分歧。
 * opts.before：场景预置钩子——双引擎构造后、起跳前同函数调用（Task 134：冷血/日食/满月潮汐等
 *   天象乘数激活场景的注入点，如 (e)=>{e.nature.eclipseTTL=700;} —— 双侧同值，不破坏位精确前提）。
 */
export function runParityCheck(ticks = 60, seed = 20261026, opts?: { noRepro?: boolean; before?: (e: GameEngine) => void }): ParityReport {
  const prevEnabled = WB.enabled;
  const prevBatches = WBB.stats.batches;
  const out: ParityMismatch[] = [];
  const count = { n: 0, d: 0 };
  let snapA: { units: Snap[]; scalars: Snap };
  let snapB: { units: Snap[]; scalars: Snap };
  let unitsA = 0;
  let unitsB = 0;
  let msA = 0;
  let msB = 0;
  let wasmEngaged = false;
  try {
    // Task 132 诊断句柄：双实例引用挂 __wbParityLast（QA eval 检查死者种族/猎手身份/扫描现场）
    // 注意：原地置空而非 last={...} 重赋值——window.__wbParityLast 注册的是首次的引用，重赋值会与句柄脱钩（本轮实测踩坑）
    last.A = null;
    last.B = null;
    // —— A：WASM 批内核路径（enabled=true；资产缺失时自动降级，由 wasmEngaged 如实呈现）——
    WB.enabled = true;
    const eA = new GameEngine(seed);
    if (opts?.noRepro) eA.laws.reproduction = false;
    if (opts?.before) opts.before(eA);
    last.A = eA;
    const tA0 = performance.now();
    for (let i = 0; i < ticks; i++) eA.tick();
    msA = performance.now() - tA0;
    wasmEngaged = WBB.stats.batches > prevBatches;
    snapA = { units: eA.units.map(snapUnit), scalars: snapScalars(eA) };
    unitsA = eA.units.length;

    // —— B：强制 JS 路径（enabled=false；WB/WBB 单例开关，A 已跑完无并发）——
    WB.enabled = false;
    const eB = new GameEngine(seed);
    if (opts?.noRepro) eB.laws.reproduction = false;
    if (opts?.before) opts.before(eB);
    last.B = eB;
    const tB0 = performance.now();
    for (let i = 0; i < ticks; i++) eB.tick();
    msB = performance.now() - tB0;
    snapB = { units: eB.units.map(snapUnit), scalars: snapScalars(eB) };
    unitsB = eB.units.length;
  } finally {
    // —— 镜像归还：临时实例的 WASM 镜像作废，主引擎下 tick 全表重灌（generate 保险带同语义）——
    WB.enabled = prevEnabled;
    WBB.touchMeta();
  }

  // —— 比对：引擎标量先（rng/tick 漂移会级联到一切），units 逐个逐字段 ——
  cmp('engine', snapA.scalars, snapB.scalars, out, count);
  const n = Math.min(snapA.units.length, snapB.units.length);
  let firstDiffIdx = -1;
  const firstDiffFields: string[] = [];
  const firstDiffUnits: Array<{ idx: number; fields: string[] }> = [];
  for (let i = 0; i < n; i++) {
    const d0 = count.d;
    // 每单位独立收集（Task 131：绕过全局样本封顶 8 —— 差异字段名必须全量可见，封顶只作用于总样本区）
    const local: ParityMismatch[] = [];
    cmp(`units[${i}]`, snapA.units[i], snapB.units[i], local, count);
    if (count.d > d0) {
      const fields = local.map((m) => m.path.slice(m.path.indexOf('.') + 1));
      if (firstDiffIdx < 0) {
        firstDiffIdx = i;
        firstDiffFields.push(...fields);
      }
      if (firstDiffUnits.length < 48) firstDiffUnits.push({ idx: i, fields });
      for (const m of local) {
        if (out.length < MAX_SAMPLES) out.push(m);
      }
    }
  }
  const mismatchCount = count.d;
  // —— 单位 id 差集：定位「出生差」还是「死亡差」（前 8）——
  const idA = new Set(snapA.units.map((u) => u.id));
  const idB = new Set(snapB.units.map((u) => u.id));
  const onlyA: number[] = [];
  const onlyB: number[] = [];
  for (const id of idA) if (!idB.has(id) && onlyA.length < 8) onlyA.push(id as number);
  for (const id of idB) if (!idA.has(id) && onlyB.length < 8) onlyB.push(id as number);
  const bitExact = mismatchCount === 0;
  const verdict = !wasmEngaged
    ? '⚠ 双 JS 平凡一致（WASM 批内核未在位——资产未加载或 guard 冷却中，本轮不构成位精确证据）'
    : bitExact
      ? `✓ 位精确一致：WASM 批内核与 JS 路径 ${ticks} tick 全量状态逐位吻合（含浮点尾数）`
      : `✗ 位漂移 ${mismatchCount} 处（样本 ${out.length} 条）——WASM 与 JS 行为分歧，S-D 扩张前必须修复`;

  return {
    seed,
    ticks,
    wasmEngaged,
    wbReady: WB.ready,
    unitsA,
    unitsB,
    comparedFields: count.n,
    bitExact,
    samples: out,
    mismatchCount,
    onlyA,
    onlyB,
    firstDiffIdx,
    firstDiffFields,
    firstDiffUnits,
    msA,
    msB,
    verdict,
  };
}

// QA 句柄：agent-browser eval 可直接 __wbParity(120) 运行；__wbParityLast.A/B 读双实例现场
// __wbWasm：WB/WBB 开关暴露（阶段级 rng 追踪实验用——手动构造双路径引擎）
if (typeof window !== 'undefined') {
  const w = window as unknown as { __wbParity: typeof runParityCheck; __wbParityLast: typeof last; __wbWasm?: unknown };
  w.__wbParity = runParityCheck;
  w.__wbParityLast = last;
  w.__wbWasm = { WB, WBB };
}
