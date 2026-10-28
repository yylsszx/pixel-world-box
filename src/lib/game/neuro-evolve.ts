// ============ NeuroEvolution：行为神经基因组（物种大脑进化） ============
// 商业化旗舰差异化特性：物种的「性格 / 大脑」随自然选择演化。
// 基因进化（engine.speciesBase：s/d/h/r）演化「身体」；本系统演化「行为」——
// 每个物种一个 4 维大脑基因组（勇 brave / 斗 aggr / 群 social / 警觉 flee，0..1），
// 由真实生死繁衍数据驱动定向进化（数量遗传学响应 Δz = h²·S，h² = 0.35），
// 并反馈调制神经决策头（neuro.ts 三头 MLP）的输入特征，形成完整闭环：
//   生存压力（捕食 / 战争 / 饥馑 / 种群兴衰）→ 死亡 / 繁衍记账（O(1) 纯数字累加）
//   → 每 3 游戏年代际选择差分 → 大脑基因组漂移（±0.06/代钳制，值域 0.05..0.95）
//   → F_FLIGHT / F_STANCE 特征乘性调制 + 恐慌传染系数 → 行为改变 → 适应度（代际反馈）
//
// 性能纪律（与 neuro.ts 的 scratch 惯例一致）：
//   - noteDeath / noteBirth 热路径 O(1) 零分配（每物种仅数字累积器，绝不建对象数组）
//   - brainVec 模块级缓存 Map<race, Float32Array(4)>，进化 / 播种 / 反序列化时失效重建，读取零分配
//   - evolveNeuroTick 每 3 游戏年一次（批量算法允许分配）
//
// 已知边界（Rust 工具链缺失期间的 TS 侧先行）：WASM 批内核内的出生不经 JS（无亲代年龄），
// 繁衍计数用「普查增量 + 死亡」回补、繁衍者均龄用活体均龄代理；行为调制仅 JS 路径与
// bail 接力单位生效 —— 记账 / 进化 / 面板全路径无碍，Rust 镜像待工具链恢复后补齐。
import { RACES } from './types';

/** 物种大脑基因组（4 维，0..1）：勇（悍勇死战）/ 斗（好斗扩张）/ 群（合群）/ 警觉（提前避险） */
export interface BrainGenome {
  brave: number;
  aggr: number;
  social: number;
  flee: number;
}

/** 引擎宿主视图（结构化类型：engine 直接传入，模块零引擎依赖防循环导入） */
export interface NevoHost {
  yearF: number;
  units: readonly { dead: boolean; race: number; age: number }[];
  /** 生态容量（野生物种 = wildCapOf；文明种族 = -1：无生态容量概念，群性不承压） */
  ecoCapOf(race: number): number;
  /** 纪事播报（引擎 addEvent('evolve', …) 的结构化投影） */
  addEvent(kind: 'evolve', text: string, opts?: { colorHex?: string }): void;
}

/** 每物种进化档案：基因组 + 世代 + 历史快照 + 3 年窗口累积器（纯数字） */
interface NevoSp {
  genome: BrainGenome;
  gen: number;
  /** 上一代基因组（面板 ↑↓ 箭头；读档后为 null） */
  prev: BrainGenome | null;
  /** 每代 4 维快照（尾部保留 24 代） */
  hist: number[][];
  /** 上次普查种群（aggr 趋势差分的基线；-1 = 尚未普查 —— 首窗不产生趋势假信号） */
  pop: number;
  /** 上次普查活体年龄和（WASM 出生记账缺失时的繁衍者均龄代理） */
  ageSum: number;
  // —— 3 年窗口累积器（evolveNeuroTick 结算后清零）——
  /** 死亡总数 */
  dN: number;
  /** 非自然死计数（hp≤0：战斗 / 天灾 / 饥馑 —— 生存压力的直接信号） */
  cN: number;
  /** 非自然死年龄和 */
  cAge: number;
  /** 非自然死中的年轻个体（<40% 寿限 —— 未及繁衍便横死，捕食/战争压力的直接信号） */
  cYoung: number;
  /** 繁衍成功计数（JS 路径精确记账；WASM 批内出生经普查回补） */
  bN: number;
  /** 繁衍者年龄和 */
  bAge: number;
}

// —— 数量遗传学参数 ——
const H2 = 0.35;        // 遗传力 h²（响应 Δz = h²·S）
const STEP_MAX = 0.06;  // 每代漂移钳制（±）—— ~20 代产生肉眼可见的性格分化
const LO = 0.05;        // 值域下钳（极端性格保留 5% 反向余量，防性格死锁）
const HI = 0.95;        // 值域上钳
const HIST_KEEP = 24;   // 每代快照保留代数（面板 sparkline 数据源）
const GATE = 8;         // 样本门：3 年窗口死亡 ≥ 8 或繁衍 ≥ 8 才进化（小样本噪声不演化）

/** 四维键序（与 Float32Array 调制向量的下标一一对应） */
const DIMS: (keyof BrainGenome)[] = ['brave', 'aggr', 'social', 'flee'];
const DIM_NAME = ['悍勇', '好斗', '合群', '警觉'];
/** 显著漂移纪事的归因文案（up = 该维上升） */
const DIM_REASON: ((up: boolean) => string)[] = [
  (up) => (up ? '善战者寿且多嗣，勇武得到了回报' : '年轻者未及繁衍便横死，鲁莽付出了代价'),
  (up) => (up ? '种群连年扩张，锋芒与自信外露' : '种群连年衰退，收敛了好斗的天性'),
  (up) => (up ? '种群稀疏于丰饶之地，抱团以求存' : '种群逼近环境容量，散群以减压'),
  (up) => (up ? '连年捕食与战乱的压力，警觉成为生存的门票' : '威胁缓和，紧绷的神经松弛下来'),
];

// —— 模块级状态（单引擎实例约定，与 neuro.ts neuroStats 同惯例）——
const species = new Map<number, NevoSp>();
const vecCache = new Map<number, Float32Array>();
let enabled = typeof localStorage === 'undefined' ? true : localStorage.getItem('wb_nevo') !== '0';
let totalGens = 0;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

/** 懒登记物种（首次触碰时种入中性基因组 0.5 —— 调制系数恰为 ×1.0，行为与原路径一致） */
function ensureSp(race: number): NevoSp {
  let sp = species.get(race);
  if (!sp) {
    sp = {
      genome: { brave: 0.5, aggr: 0.5, social: 0.5, flee: 0.5 },
      gen: 0, prev: null, hist: [], pop: -1, ageSum: 0,
      dN: 0, cN: 0, cAge: 0, cYoung: 0, bN: 0, bAge: 0,
    };
    species.set(race, sp);
  }
  return sp;
}

// ======================= 适应度记账（热路径 O(1) 零分配） =======================

/** 死亡记账：combat = 非自然死（hp≤0：战斗 / 天灾 / 饥馑）；年轻（<40% 寿限）由种族寿限内部判定 */
export function noteDeath(race: number, age: number, combat: boolean): void {
  if (!enabled) return;
  const sp = ensureSp(race);
  sp.dN++;
  if (combat) {
    sp.cN++;
    sp.cAge += age;
    if (age < (RACES[race]?.maxAge ?? 40) * 0.4) sp.cYoung++;
  }
}

/** 繁衍记账：亲代年龄（繁衍成功 = 适应度的正信号） */
export function noteBirth(race: number, parentAge: number): void {
  if (!enabled) return;
  const sp = ensureSp(race);
  sp.bN++;
  sp.bAge += parentAge;
}

// ======================= 行为调制（引擎热路径，零分配） =======================

/** 大脑基因组调制向量 [勇, 斗, 群, 警觉]；关闭时返回 null（引擎走原特征路径）。
 *  模块级缓存：仅在进化 / 播种 / 继承 / 反序列化时失效，读取为一次 Map 命中。 */
export function brainVec(race: number): Float32Array | null {
  if (!enabled) return null;
  const v = vecCache.get(race);
  if (v !== undefined) return v;
  const sp = ensureSp(race);
  const nv = new Float32Array(4);
  nv[0] = sp.genome.brave;
  nv[1] = sp.genome.aggr;
  nv[2] = sp.genome.social;
  nv[3] = sp.genome.flee;
  vecCache.set(race, nv);
  return nv;
}

// ======================= 代际进化（每 3 游戏年；批量允许分配） =======================

/** 代际进化主入口（引擎 tick 每 120 tick = 3 游戏年调用，传入引擎宿主视图）：
 *  全域普查 → 逐物种四维选择差分（Δz = h²·S）→ 钳制 → 世代推进 + 快照 + 缓存失效 + 显著漂移纪事 */
export function evolveNeuroTick(host: NevoHost): void {
  if (!enabled) return;
  // 1) 全域普查（种群数 / 活体年龄和 —— aggr 趋势与 WASM 出生回补的底账）
  const pop = new Map<number, number>();
  const ageSum = new Map<number, number>();
  for (let i = 0; i < host.units.length; i++) {
    const u = host.units[i];
    if (u.dead) continue;
    pop.set(u.race, (pop.get(u.race) ?? 0) + 1);
    ageSum.set(u.race, (ageSum.get(u.race) ?? 0) + u.age);
  }
  // 2) 逐物种结算（累积器清零滚动至下一 3 年窗口）
  for (const [race, sp] of species) {
    const p = pop.get(race) ?? 0;
    const as = ageSum.get(race) ?? 0;
    stepSpecies(race, sp, p, as, host);
    sp.dN = 0; sp.cN = 0; sp.cAge = 0; sp.cYoung = 0; sp.bN = 0; sp.bAge = 0;
    sp.pop = p;
    sp.ageSum = as;
  }
}

/** 单物种一代的选择差分结算 */
function stepSpecies(race: number, sp: NevoSp, pop: number, ageSum: number, host: NevoHost): void {
  // 出生记账回补：WASM 批内核的出生不经过 JS —— 用普查估算窗口出生数（种群增量 + 窗口死亡）
  const prevPop = sp.pop < 0 ? 0 : sp.pop;
  const estBirths = Math.max(0, pop + sp.dN - prevPop);
  const births = Math.max(sp.bN, estBirths);
  // 样本门：3 年内死亡 ≥ 8 或繁衍 ≥ 8 才进化（濒死小种群只要压力够同样演化）
  if (sp.dN < GATE && births < GATE) return;

  const g = sp.genome;
  const prev: BrainGenome = { brave: g.brave, aggr: g.aggr, social: g.social, flee: g.flee };
  let bestDim = -1;
  let bestDz = 0;
  /** 应用一代响应（钳制 ±0.06）并记录最大漂移维（纪事归因用） */
  const apply = (dim: keyof BrainGenome, dz: number) => {
    const step = clamp(dz, -STEP_MAX, STEP_MAX);
    if (step === 0) return;
    g[dim] = clamp(g[dim] + step, LO, HI);
    if (Math.abs(step) > Math.abs(bestDz)) { bestDz = step; bestDim = DIMS.indexOf(dim); }
  };

  // —— ① brave（勇）：战斗死均龄 vs 繁衍者均龄 ——
  //    活到打过架还留了后代（战斗死均龄 ≥ 繁衍者均龄）→ 勇有回报 → brave↑；
  //    没繁衍就战死（年轻横死）→ brave↓（鲁莽被淘汰）
  if (sp.cN >= 3) {
    const combatAvg = sp.cAge / sp.cN;
    // 繁衍者均龄：JS 记账精确值优先；样本不足时用活体均龄代理（增长种群的成人年龄结构）
    const birthAvg = sp.bN >= 5 ? sp.bAge / sp.bN : pop > 0 ? ageSum / pop : 0;
    if (birthAvg > 0) {
      const S = clamp((combatAvg - birthAvg) / Math.max(4, birthAvg * 0.9), -1, 1);
      apply('brave', H2 * S * 0.16);
    }
  }

  // —— ② flee（警觉）：年轻战斗死占比（捕食 / 战争压力） ——
  //    年轻个体（<30% 寿限）非自然死占比越高 → flee↑；宽松时缓降（警觉是保命性状，升快降慢）
  if (sp.cN >= 3) {
    const youngShare = sp.cYoung / sp.cN;
    const S = (youngShare - 0.45) * 2.2;
    apply('flee', H2 * S * (S > 0 ? 0.22 : 0.07));
  }

  // —— ③ aggr（斗）：种群数量趋势（3 年窗口；首窗无基线不产生假信号） ——
  //    上行 → 扩张自信 aggr↑；下行 → 收敛锋芒 aggr↓（Lotka-Volterra 振荡追随）
  if (sp.pop > 0 || (sp.pop === 0 && pop > 0)) {
    const trend = (pop - sp.pop) / Math.max(4, sp.pop);
    const S = clamp(trend * 1.6, -1, 1);
    apply('aggr', H2 * S * 0.16);
  }

  // —— ④ social（群）：种群 vs 生态容量 ——
  //    远低于容量（<35%）→ 抱团求存 social↑；逼近容量（>75%）→ 缓降（散群减压）
  const cap = host.ecoCapOf(race);
  if (cap > 0 && pop > 0) {
    const ratio = pop / cap;
    if (ratio < 0.35) apply('social', H2 * 0.16);
    else if (ratio > 0.75) apply('social', -H2 * 0.06);
  }

  // —— 世代推进 + 快照 + 调制缓存失效 ——
  sp.gen++;
  totalGens++;
  sp.hist.push([g.brave, g.aggr, g.social, g.flee]);
  if (sp.hist.length > HIST_KEEP) sp.hist.shift();
  sp.prev = prev;
  vecCache.delete(race);

  // —— 显著漂移纪事（任一维 |Δ| ≥ 0.05 才记；每物种每 3 年至多 1 条，不刷屏）——
  if (bestDim >= 0 && Math.abs(bestDz) >= 0.05) {
    host.addEvent('evolve', `「${RACES[race]?.name ?? `物种${race}`}」第 ${sp.gen} 代神经进化：${DIM_NAME[bestDim]}性${bestDz > 0 ? '显著提升' : '显著退化'}（${DIM_REASON[bestDim](bestDz > 0)}）`, { colorHex: '#7df9ff' });
  }
}

// ======================= 物种生命周期（种化 / 融合 / 造物播种） =======================

/** 种化继承：新物种继承父种大脑基因组 ± 抖动（融合种 = 双亲均值 ± 抖动 —— 心智随血脉传承） */
export function nevoInherit(child: number, parent: number, rng: () => number, parent2?: number): void {
  const pa = species.get(parent)?.genome;
  const pb = parent2 != null && parent2 !== parent ? species.get(parent2)?.genome : undefined;
  const b: BrainGenome = pa
    ? (pb
      ? { brave: (pa.brave + pb.brave) / 2, aggr: (pa.aggr + pb.aggr) / 2, social: (pa.social + pb.social) / 2, flee: (pa.flee + pb.flee) / 2 }
      : { ...pa })
    : pb
      ? { ...pb }
      : { brave: 0.5, aggr: 0.5, social: 0.5, flee: 0.5 };
  const sp = ensureSp(child);
  sp.genome = {
    brave: clamp(b.brave + (rng() - 0.5) * 0.16, LO, HI),
    aggr: clamp(b.aggr + (rng() - 0.5) * 0.16, LO, HI),
    social: clamp(b.social + (rng() - 0.5) * 0.16, LO, HI),
    flee: clamp(b.flee + (rng() - 0.5) * 0.16, LO, HI),
  };
  sp.gen = 0;
  sp.prev = null;
  sp.hist = [];
  vecCache.delete(child);
}

/** 造物播种：显式初值（缺省中性 0.5）—— 全新造物 / 图鉴造物的初始心智 */
export function nevoSeed(race: number, init?: Partial<BrainGenome>): void {
  const sp = ensureSp(race);
  sp.genome = {
    brave: clamp(init?.brave ?? 0.5, LO, HI),
    aggr: clamp(init?.aggr ?? 0.5, LO, HI),
    social: clamp(init?.social ?? 0.5, LO, HI),
    flee: clamp(init?.flee ?? 0.5, LO, HI),
  };
  sp.gen = 0;
  sp.prev = null;
  sp.hist = [];
  vecCache.delete(race);
}

// ======================= 开关 / 重置 / 序列化 / 快照 =======================

/** 系统开关（默认开；localStorage wb_nevo 持久化 —— 关闭 = 大脑不进化、特征不调制） */
export function isNevoEnabled(): boolean {
  return enabled;
}

export function setNevoEnabled(v: boolean): void {
  enabled = v;
  if (typeof localStorage !== 'undefined') localStorage.setItem('wb_nevo', v ? '1' : '0');
}

/** 世界重置（新世界 / 读档前）：大脑基因组全清（不跨世界；enabled 是用户偏好不动） */
export function nevoReset(): void {
  species.clear();
  vecCache.clear();
  totalGens = 0;
}

/** 存档序列化：[race, brave, aggr, social, flee, gen][]（未触碰的中性物种不入档省空间） */
export function nevoSerialize(): [number, number, number, number, number, number][] {
  const out: [number, number, number, number, number, number][] = [];
  for (const [race, sp] of species) {
    if (sp.gen === 0 && sp.genome.brave === 0.5 && sp.genome.aggr === 0.5 && sp.genome.social === 0.5 && sp.genome.flee === 0.5) continue;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    out.push([race, r3(sp.genome.brave), r3(sp.genome.aggr), r3(sp.genome.social), r3(sp.genome.flee), sp.gen]);
  }
  return out;
}

/** 读档反序列化（saveSafe 哲学：缺省 / 损坏行全防御 —— 旧档无此字段 = 全默认中性，绝不崩档） */
export function nevoDeserialize(data?: unknown): void {
  nevoReset();
  if (!Array.isArray(data)) return;
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const race = Number(row[0]);
    if (!Number.isInteger(race) || race < 0) continue;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const cl = (v: unknown) => {
      const n = num(v);
      return n == null ? 0.5 : clamp(n, LO, HI);
    };
    const sp = ensureSp(race);
    sp.genome = { brave: cl(row[1]), aggr: cl(row[2]), social: cl(row[3]), flee: cl(row[4]) };
    const gn = num(row[5]);
    sp.gen = gn != null && gn > 0 ? Math.floor(gn) : 0;
    // 曲线不跨存档（speciesHist 同惯例）：从当前值回填单点，新快照自然累积
    sp.hist = [[sp.genome.brave, sp.genome.aggr, sp.genome.social, sp.genome.flee]];
    sp.prev = null;
  }
}

/** 面板快照（1s 轮询）：enabled / 物种档案（含上一代与历史尾部）/ 全局统计 */
export interface NevoSpeciesSnap {
  race: number;
  name: string;
  genome: BrainGenome;
  gen: number;
  prev: BrainGenome | null;
  hist: number[][];
  /** 最近一次普查种群（3 年窗口基线；面板用活体普查精排） */
  pop: number;
}

export interface NevoSnapshotData {
  enabled: boolean;
  /** 全物种世代推进总数（全局总代数） */
  totalGens: number;
  /** 最活跃物种（世代最深） */
  topRace: { race: number; name: string; gen: number } | null;
  species: NevoSpeciesSnap[];
}

export function nevoSnapshot(): NevoSnapshotData {
  const list: NevoSpeciesSnap[] = [];
  let top: NevoSpeciesSnap | null = null;
  for (const [race, sp] of species) {
    const s: NevoSpeciesSnap = {
      race,
      name: RACES[race]?.name ?? `物种${race}`,
      genome: { ...sp.genome },
      gen: sp.gen,
      prev: sp.prev ? { ...sp.prev } : null,
      hist: sp.hist.map((h) => [h[0], h[1], h[2], h[3]]),
      pop: sp.pop,
    };
    list.push(s);
    if (!top || s.gen > top.gen) top = s;
  }
  return {
    enabled,
    totalGens,
    topRace: top ? { race: top.race, name: top.name, gen: top.gen } : null,
    species: list,
  };
}
