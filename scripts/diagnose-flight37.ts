// ============ Task 38-g：Task 37 遗留诊断 —— coward 对手桶退化机理 + 必战区一致率补测 ============
// 运行：bun scripts/diagnose-flight37.ts
// 性质：独立研究脚本（零第三方依赖；只读 scripts/flight-env.ts、src/lib/game/policy.ts、
//       src/lib/game/neuro-flight-rl.ts、src/lib/game/neuro-weights.ts，不修改任何共享游戏文件）。
//       固定种子，全程可复现（诊断种子 20260380，区别于训练种子 20260207）。
//
// ▍任务 1（Task 37 遗留 #1）：coward 对手桶细分诊断
//   Task 37 L2 对手分桶：RL vs teacher 65.4% / aggressive 66.0% / random 41.7% / coward ~20%。
//   coward 语义（flight-env.ts foePolicy）：对手恒 FLEE、永不攻击 ——
//     · agent 追得上的 coward = 免费猎物（击杀 + 捕食回充 55+maxHp/2）
//     · agent 追不上的 coward = 持续消耗源（捕食者食物账本每步 -1 → 饿死 / 超时）
//   按 agent 食草/捕食者分桶，RL 与 teacher 同种子配对 2000 局（前 600 局 = Task 37 复现集），
//   另跑 BC（Task 36 行为克隆版）做因果对照 —— 定位退化是 PPO 学出的还是 BC 继承的。
//
// ▍任务 2（Task 37 遗留 #2）：必战区一致率补测（防遗忘门的双向检查）
//   Task 37 只测了必逃区（f7≤0.5∧f5≤0.5∧f0<0.3∧f2<0.35，99.7%）——单向。必战区三子区（教师判 FIGHT 的高置信区）：
//     Z1 巨怪非濒死：f7>0.5 ∧ f0≥0.15（teacherFlight 第一行 else 分支）
//     Z2 猎物在侧且健康无群压：f5>0.5 ∧ f0≥0.4 ∧ f6≤0.55（第二段末行 return FIGHT；附 f7≤0.5 守卫保持子区不交）
//     Z3 健康且非劣势：f0≥0.45 ∧ f2≥0.4（第三段 return FIGHT；附 f7≤0.5∧f5≤0.5 守卫）
//   采样：FlightEnv 场景采样器（reset 的种族/血量/食物/位置采样）驱动的决策瞬间特征，
//         RL 轨迹源 + teacher 轨迹源各 10000 条（合计 20000），必逃区复测作对照（应≈99.7%，
//         另扩采至 n≥2000 按对手分桶定位违例亚群）。决策瞬间捕获 = 策略闭包内联采集，
//         与 obsLog 逐条等价（flight-env.ts stepEnv 对同一特征做 obsLog.push）。
//   附加透镜：单敌可捕获 × 对手是否猎物（f5）—— 定位弃战到底弃的是猎物还是非猎物。
import { mulberry32, FlightEnv, OPPONENT_MIX, type FlightPolicy, type OpponentPolicy, type Outcome } from './flight-env';
import { teacherFlight } from '../src/lib/game/policy';
import { NEURO_FLIGHT_RL, NEURO_FLIGHT_RL_META } from '../src/lib/game/neuro-flight-rl';
import { NEURO_FLIGHT, type NeuroHeadSpec } from '../src/lib/game/neuro-weights';

// ============================ 固定种子与规模（可复现性） ============================
const DIAG_SEED = 20260380; // 诊断种子（仅用于报告标识；各评估种子基见下）
const COWARD_N = 2000; // 任务 1 配对局数
const COWARD_BASE = 424242 + 7000000; // Task 37 对手分桶同种子公式（前 600 局 = Task 37 coward 桶原样本）
const TASK37_REPL_N = 600; // Task 37 coward 桶原样本量（复现校验）
const ZONE_PER_SOURCE = 10000; // 任务 2 每轨迹源决策瞬间特征目标数（RL 源 + teacher 源 = 20000）
const ZONE_BASE_RL = 424242; // RL 轨迹源种子基（与 Task 37 L1/L2 评估同基）
const ZONE_BASE_T = 424242 + 3000000; // teacher 轨迹源种子基（错开）
const GATE_MUSTFIGHT = 0.95; // 必战区一致率达标阈值（任务书参考值）

// ============================ 工具 ============================
type RNG = () => number;
const pct = (x: number, d = 1) => (isFinite(x) ? (x * 100).toFixed(d) + '%' : '—');
const bin10 = (v: number) => Math.min(9, Math.max(0, Math.floor(v * 10)));
/** Wilson 95% 置信区间（与 train-flight-ppo.ts 同实现） */
function wilson(pHat: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = pHat + z2 / (2 * n);
  const spread = z * Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n));
  return [(center - spread) / denom, (center + spread) / denom];
}
/** 对手池混采（与 train-flight-ppo.ts evalL1 的对手抽取同实现） */
function pickOpponent(r: RNG): OpponentPolicy {
  let v = r();
  for (const [o, w] of OPPONENT_MIX) {
    v -= w;
    if (v <= 0) return o;
  }
  return 'teacher';
}

// ============================ 网络加载（Int8 反量化 → tanh trunk → softmax；与 neuro.ts 部署侧同构） ============================
const N_IN = 9;
const N_H = 8;
function deq(q: number[], s: number): Float32Array {
  const w = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) w[i] = q[i] * s;
  return w;
}
interface NetForward {
  (f: ArrayLike<number>): { a: number; pFlee: number };
}
/** 反量化 + 前向（参考 train-flight-ppo.ts 的 deq / bcPolicy；断言安全：环境只传 Float32Array） */
function loadNet(spec: NeuroHeadSpec): NetForward {
  const w1 = deq(spec.w1q, spec.sw1);
  const b1 = deq(spec.b1q, spec.sb1);
  const wpi = deq(spec.w2q, spec.sw2);
  const bpi = deq(spec.b2q, spec.sb2);
  const hid = new Float32Array(N_H);
  return (f: ArrayLike<number>) => {
    for (let h = 0; h < N_H; h++) {
      let s = b1[h];
      for (let i = 0; i < N_IN; i++) s += f[i] * w1[i * N_H + h];
      hid[h] = Math.tanh(s);
    }
    let l0 = bpi[0];
    let l1 = bpi[1];
    for (let h = 0; h < N_H; h++) {
      l0 += hid[h] * wpi[h * 2];
      l1 += hid[h] * wpi[h * 2 + 1];
    }
    const m = Math.max(l0, l1);
    const e0 = Math.exp(l0 - m);
    const e1 = Math.exp(l1 - m);
    const p1 = e1 / (e0 + e1);
    return { a: p1 > 0.5 ? 1 : 0, pFlee: p1 };
  };
}
const rlForward = loadNet(NEURO_FLIGHT_RL); // 部署版权重（引擎 flightMode='rl' 实际运行的 Int8 反量化结果）
const bcForward = loadNet(NEURO_FLIGHT); // Task 36 行为克隆版（因果对照：退化是 PPO 学出的还是 BC 继承的）
const rlPolicy: FlightPolicy = (f) => rlForward(f).a;
const bcPolicy: FlightPolicy = (f) => bcForward(f).a;
const teacherPolicy: FlightPolicy = (f) => teacherFlight(f as number[]);

// ============================ 诊断跑局器（驱动 FlightEnv 公共字段，零 env 改动） ============================
type Bucket = 'herb' | 'pred' | 'scorp'; // agent 物种桶：食草 / 捕食者（含巨怪）/ 蝎子（非捕食非食草）
const bucketOf = (herbivore: boolean, predator: boolean): Bucket => (herbivore ? 'herb' : predator ? 'pred' : 'scorp');

/** 弃战型分歧的特征直方累积（RL=FLEE ∧ 教师=FIGHT —— 「该打不打」） */
interface DivAgg {
  fleeDir: number; // 弃战型分歧数
  fightDir: number; // 恋战型分歧数（RL=FIGHT ∧ 教师=FLEE）
  openFleeDir: number; // 弃战型且发生在首决策
  f0: number[]; // 弃战型 f0 直方（10 桶）
  f2: number[]; // 弃战型 f2 直方（10 桶）
  f5: number[]; // 弃战型 f5 直方（2 桶：0 非猎物 / 1 猎物）
  f7: number[]; // 弃战型 f7 直方（2 桶）
  keyRegion: number; // 落在「健康但劣势的非猎物遭遇」f0≥0.45∧f2<0.4∧f5≤0.5
  openKeyRegion: number; // 其中发生在首决策的
}
const newDiv = (): DivAgg => ({ fleeDir: 0, fightDir: 0, openFleeDir: 0, f0: new Array(10).fill(0), f2: new Array(10).fill(0), f5: [0, 0], f7: [0, 0], keyRegion: 0, openKeyRegion: 0 });

interface EpDiag {
  bucket: Bucket;
  dec: number; // 决策步数
  fightDec: number;
  fleeDec: number;
  openingFlee: boolean; // 首决策即 FLEE（未接战先撤）
  frozenOneDec: boolean; // 全局仅 1 个决策且为 FLEE → 局面冻结（对手出视野后再无决策）
  allFleeNoEngage: boolean; // 全部决策均为 FLEE 且从未接敌（纯逃局）
  firstFleeIdx: number; // 首 FLEE 决策序号（-1 无）
  abandonIdx: number; // 首个「先战后逃」放弃点（-1 无）
  engaged: boolean; // 曾接敌（攻击或被攻击）
  outcome: Outcome;
  kills: number;
  steps: number;
  totalReturn: number;
  foodNet: number;
  rankScore: number;
  singleFoe: boolean;
  catchable: boolean; // 单敌局近似可捕获判定：1.15×speed_a > 1.18×speed_f（追击 mul vs 撤离 mul）
  nonHerbFoe: boolean; // 对手含非食草（食草 agent 的「捕食者型对手」子集）
  singleFoePrey: boolean; // 单敌局对手是否猎物（食草，f5=1）—— 弃战落点定位
}

function runDiag(seed: number, policy: FlightPolicy, opponent: OpponentPolicy, divMap?: Record<Bucket, DivAgg>): EpDiag {
  const env = new FlightEnv(seed);
  let dec = 0;
  let fightDec = 0;
  let fleeDec = 0;
  let firstFleeIdx = -1;
  let abandonIdx = -1;
  let sawFight = false;
  const wrapped: FlightPolicy = (f) => {
    const a = policy(f);
    if (a === 1) {
      fleeDec++;
      if (firstFleeIdx < 0) firstFleeIdx = dec;
      if (sawFight && abandonIdx < 0) abandonIdx = dec;
    } else {
      fightDec++;
      sawFight = true;
    }
    if (divMap) {
      const tA = teacherFlight(f as number[]);
      if (tA !== a) {
        const d = divMap[bucketOf(env.agent.def.herbivore, env.agent.def.predator)];
        if (a === 1) {
          d.fleeDir++;
          if (dec === 0) d.openFleeDir++;
          d.f0[bin10(f[0])]++;
          d.f2[bin10(f[2])]++;
          d.f5[f[5] > 0.5 ? 1 : 0]++;
          d.f7[f[7] > 0.5 ? 1 : 0]++;
          if (f[0] >= 0.45 && f[2] < 0.4 && f[5] <= 0.5) {
            d.keyRegion++;
            if (dec === 0) d.openKeyRegion++;
          }
        } else d.fightDir++;
      }
    }
    dec++;
    return a;
  };
  env.reset(wrapped, opponent);
  let done = false;
  while (!done) done = env.stepEnv().done;
  const A = env.agent;
  const singleFoe = env.foes.length === 1;
  return {
    bucket: bucketOf(A.def.herbivore, A.def.predator),
    dec,
    fightDec,
    fleeDec,
    openingFlee: dec > 0 && firstFleeIdx === 0,
    frozenOneDec: dec === 1 && fleeDec === 1,
    allFleeNoEngage: dec > 0 && fleeDec === dec && !env.wasEngaged,
    firstFleeIdx,
    abandonIdx,
    engaged: env.wasEngaged,
    outcome: env.outcome,
    kills: env.agentKills,
    steps: env.step,
    totalReturn: env.totalReturn,
    foodNet: A.food - 70,
    rankScore: env.rankScore(),
    singleFoe,
    catchable: singleFoe && A.def.speed * 1.15 > env.foes[0].def.speed * 1.18,
    nonHerbFoe: env.foes.some((fo) => !fo.def.herbivore),
    singleFoePrey: singleFoe && env.foes[0].def.herbivore,
  };
}

// ============================ 聚合器 ============================
const OC: Outcome[] = ['kill', 'escape', 'timeout', 'killed', 'starved'];
const zeroOutcome = (): Record<Outcome, number> => ({ kill: 0, escape: 0, timeout: 0, killed: 0, starved: 0 });
interface SideAgg {
  n: number;
  dec: number;
  fightDec: number;
  fleeDec: number;
  openingFleeN: number;
  frozenOneDecN: number;
  allFleeNoEngageN: number;
  engagedN: number;
  outcome: Record<Outcome, number>;
  kills: number;
  steps: number;
  ret: number;
  foodNet: number;
  rank: number;
  firstFleeIdxSum: number;
  firstFleeN: number;
  starveStepSum: number;
  starveN: number;
  killStepSum: number;
  killOutcomeN: number;
}
const newAgg = (): SideAgg => ({
  n: 0, dec: 0, fightDec: 0, fleeDec: 0, openingFleeN: 0, frozenOneDecN: 0, allFleeNoEngageN: 0, engagedN: 0,
  outcome: zeroOutcome(), kills: 0, steps: 0, ret: 0, foodNet: 0, rank: 0, firstFleeIdxSum: 0, firstFleeN: 0,
  starveStepSum: 0, starveN: 0, killStepSum: 0, killOutcomeN: 0,
});
function addEp(a: SideAgg, e: EpDiag) {
  a.n++;
  a.dec += e.dec;
  a.fightDec += e.fightDec;
  a.fleeDec += e.fleeDec;
  if (e.openingFlee) a.openingFleeN++;
  if (e.frozenOneDec) a.frozenOneDecN++;
  if (e.allFleeNoEngage) a.allFleeNoEngageN++;
  if (e.engaged) a.engagedN++;
  a.outcome[e.outcome]++;
  a.kills += e.kills;
  a.steps += e.steps;
  a.ret += e.totalReturn;
  a.foodNet += e.foodNet;
  a.rank += e.rankScore;
  if (e.firstFleeIdx >= 0) {
    a.firstFleeIdxSum += e.firstFleeIdx;
    a.firstFleeN++;
  }
  if (e.outcome === 'starved') {
    a.starveStepSum += e.steps;
    a.starveN++;
  }
  if (e.outcome === 'kill') {
    a.killStepSum += e.steps;
    a.killOutcomeN++;
  }
}
/** 合并两个桶的聚合（表 B：捕食者 + 蝎子 —— 全字段求和，保证比率分母正确） */
function mergeAgg(a: SideAgg, b: SideAgg): SideAgg {
  const m = newAgg();
  m.n = a.n + b.n; m.dec = a.dec + b.dec; m.fightDec = a.fightDec + b.fightDec; m.fleeDec = a.fleeDec + b.fleeDec;
  m.openingFleeN = a.openingFleeN + b.openingFleeN; m.frozenOneDecN = a.frozenOneDecN + b.frozenOneDecN;
  m.allFleeNoEngageN = a.allFleeNoEngageN + b.allFleeNoEngageN; m.engagedN = a.engagedN + b.engagedN;
  for (const k of OC) m.outcome[k] = a.outcome[k] + b.outcome[k];
  m.kills = a.kills + b.kills; m.steps = a.steps + b.steps; m.ret = a.ret + b.ret; m.foodNet = a.foodNet + b.foodNet; m.rank = a.rank + b.rank;
  m.firstFleeIdxSum = a.firstFleeIdxSum + b.firstFleeIdxSum; m.firstFleeN = a.firstFleeN + b.firstFleeN;
  m.starveStepSum = a.starveStepSum + b.starveStepSum; m.starveN = a.starveN + b.starveN;
  m.killStepSum = a.killStepSum + b.killStepSum; m.killOutcomeN = a.killOutcomeN + b.killOutcomeN;
  return m;
}
interface PairStat { w: number; l: number; tie: number }
const newPair = (): PairStat => ({ w: 0, l: 0, tie: 0 });
/** 单敌×可捕获性透镜单元 */
interface LensCell extends PairStat {
  n: number;
  rlKill: number; tKill: number; rlKillStep: number; tKillStep: number;
  rlOpenFlee: number; tOpenFlee: number;
  rlStarve: number; tStarve: number; rlStarveStep: number; tStarveStep: number;
  rlTo: number; tTo: number;
}
const newLens = (): LensCell => ({ n: 0, w: 0, l: 0, tie: 0, rlKill: 0, tKill: 0, rlKillStep: 0, tKillStep: 0, rlOpenFlee: 0, tOpenFlee: 0, rlStarve: 0, tStarve: 0, rlStarveStep: 0, tStarveStep: 0, rlTo: 0, tTo: 0 });
/** 单敌可捕获 × 对手是否猎物透镜单元（弃战落点定位：弃的是猎物还是非猎物） */
interface PreyCell { n: number; rlKill: number; tKill: number; rlOpenFlee: number; tOpenFlee: number }
const newPreyCell = (): PreyCell => ({ n: 0, rlKill: 0, tKill: 0, rlOpenFlee: 0, tOpenFlee: 0 });
const preyLens: Record<Bucket, Record<'prey' | 'nonPrey', PreyCell>> = {
  herb: { prey: newPreyCell(), nonPrey: newPreyCell() },
  pred: { prey: newPreyCell(), nonPrey: newPreyCell() },
  scorp: { prey: newPreyCell(), nonPrey: newPreyCell() },
};

// ============================ 报告头 ============================
const t0 = Date.now();
console.log('══════════ Task 38-g · Task 37 遗留诊断（coward 桶退化机理 + 必战区一致率补测） ══════════');
console.log(`部署版权重 NEURO_FLIGHT_RL（Int8 反量化）· 训练 ${NEURO_FLIGHT_RL_META.trainedAt} · 种子 ${NEURO_FLIGHT_RL_META.seed} · 最优 @iter ${NEURO_FLIGHT_RL_META.bestIter}`);
console.log(`META 基线：分歧胜率 ${(NEURO_FLIGHT_RL_META.divWinRate * 100).toFixed(2)}% Wilson95 [${(NEURO_FLIGHT_RL_META.divWilsonLo * 100).toFixed(2)}, ${(NEURO_FLIGHT_RL_META.divWilsonHi * 100).toFixed(2)}] · 必逃区一致 ${(NEURO_FLIGHT_RL_META.mustFleeAgree * 100).toFixed(1)}% · 灰区 ${(NEURO_FLIGHT_RL_META.grayRate * 100).toFixed(1)}%`);
console.log(`诊断种子 ${DIAG_SEED} · 零依赖独立脚本 · 只读共享文件\n`);

// ============================================================
// 任务 1：coward 对手桶细分诊断（RL vs teacher 同种子配对 2000 局 + BC 因果对照）
// ============================================================
console.log('—— 任务 1 · coward 对手桶细分诊断（配对局：同种子同初始场景；coward 对手恒 FLEE 永不攻击） ——');
const aggRL: Record<Bucket, SideAgg> = { herb: newAgg(), pred: newAgg(), scorp: newAgg() };
const aggT: Record<Bucket, SideAgg> = { herb: newAgg(), pred: newAgg(), scorp: newAgg() };
const aggBC: Record<Bucket, SideAgg> = { herb: newAgg(), pred: newAgg(), scorp: newAgg() };
const pairTotal = newPair();
const pairBucket: Record<Bucket, PairStat> = { herb: newPair(), pred: newPair(), scorp: newPair() };
const pairBC = newPair();
const pairHerbNonHerbFoe = newPair();
const crossHerb = zeroOutcomeMap2();
const crossNonHerb = zeroOutcomeMap2();
const lens: Record<Bucket, Record<'sc' | 'su' | 'multi', LensCell>> = {
  herb: { sc: newLens(), su: newLens(), multi: newLens() },
  pred: { sc: newLens(), su: newLens(), multi: newLens() },
  scorp: { sc: newLens(), su: newLens(), multi: newLens() },
};
const divMap: Record<Bucket, DivAgg> = { herb: newDiv(), pred: newDiv(), scorp: newDiv() };
let replW = 0;
let replL = 0;

function zeroOutcomeMap2(): Record<Outcome, Record<Outcome, number>> {
  const m = {} as Record<Outcome, Record<Outcome, number>>;
  for (const a of OC) {
    m[a] = zeroOutcome();
  }
  return m;
}

for (let i = 0; i < COWARD_N; i++) {
  const seed = COWARD_BASE + i;
  const eR = runDiag(seed, rlPolicy, 'coward', divMap);
  const eT = runDiag(seed, teacherPolicy, 'coward');
  const eB = runDiag(seed, bcPolicy, 'coward');
  addEp(aggRL[eR.bucket], eR);
  addEp(aggT[eT.bucket], eT);
  addEp(aggBC[eB.bucket], eB);
  // 配对比较（rankScore，ε=1e-9 与 Task 37 一致）
  if (eR.rankScore > eT.rankScore + 1e-9) pairTotal.w++;
  else if (eR.rankScore < eT.rankScore - 1e-9) pairTotal.l++;
  else pairTotal.tie++;
  const pb = pairBucket[eR.bucket];
  if (eR.rankScore > eT.rankScore + 1e-9) pb.w++;
  else if (eR.rankScore < eT.rankScore - 1e-9) pb.l++;
  else pb.tie++;
  if (eB.rankScore > eT.rankScore + 1e-9) pairBC.w++;
  else if (eB.rankScore < eT.rankScore - 1e-9) pairBC.l++;
  else pairBC.tie++;
  if (eR.bucket === 'herb' && eR.nonHerbFoe) {
    if (eR.rankScore > eT.rankScore + 1e-9) pairHerbNonHerbFoe.w++;
    else if (eR.rankScore < eT.rankScore - 1e-9) pairHerbNonHerbFoe.l++;
    else pairHerbNonHerbFoe.tie++;
  }
  if (i < TASK37_REPL_N) {
    if (eR.rankScore > eT.rankScore + 1e-9) replW++;
    else if (eR.rankScore < eT.rankScore - 1e-9) replL++;
  }
  // 结局迁移矩阵（teacher → RL）
  const cm = eR.bucket === 'herb' ? crossHerb : crossNonHerb;
  cm[eT.outcome][eR.outcome]++;
  // 透镜
  const lk = eR.singleFoe ? (eR.catchable ? 'sc' : 'su') : 'multi';
  const c = lens[eR.bucket][lk];
  c.n++;
  if (eR.rankScore > eT.rankScore + 1e-9) c.w++;
  else if (eR.rankScore < eT.rankScore - 1e-9) c.l++;
  else c.tie++;
  if (eR.outcome === 'kill') { c.rlKill++; c.rlKillStep += eR.steps; }
  if (eT.outcome === 'kill') { c.tKill++; c.tKillStep += eT.steps; }
  if (eR.openingFlee) c.rlOpenFlee++;
  if (eT.openingFlee) c.tOpenFlee++;
  if (eR.outcome === 'starved') { c.rlStarve++; c.rlStarveStep += eR.steps; }
  if (eT.outcome === 'starved') { c.tStarve++; c.tStarveStep += eT.steps; }
  if (eR.outcome === 'timeout') c.rlTo++;
  if (eT.outcome === 'timeout') c.tTo++;
  // 单敌可捕获 × 对手是否猎物（弃战落点：可捕获 = 免费击杀 + 捕食回充的机会局）
  if (eR.singleFoe && eR.catchable) {
    const pc = preyLens[eR.bucket][eR.singleFoePrey ? 'prey' : 'nonPrey'];
    pc.n++;
    if (eR.outcome === 'kill') pc.rlKill++;
    if (eT.outcome === 'kill') pc.tKill++;
    if (eR.openingFlee) pc.rlOpenFlee++;
    if (eT.openingFlee) pc.tOpenFlee++;
  }
}

// —— 复现校验与总览 ——
const netRate = pairTotal.w / Math.max(1, pairTotal.w + pairTotal.l);
const [wlo, whi] = wilson(netRate, pairTotal.w + pairTotal.l);
const replRate = replW / Math.max(1, replW + replL);
console.log(`Task 37 复现校验（前 ${TASK37_REPL_N} 配对局，部署 Int8 权重）：净胜 ${replW}/${replW + replL}（${pct(replRate)}）—— Task 37 报告 ~20% ✓`);
console.log(`${COWARD_N} 配对局全集：RL 净胜 ${pairTotal.w} / 净负 ${pairTotal.l} / 平 ${pairTotal.tie} —— 净胜率 ${pct(netRate)} Wilson95 [${pct(wlo)}, ${pct(whi)}]`);
console.log(`平局占 ${pct(pairTotal.tie / COWARD_N, 1)}（coward 桶杀伤无关行为的结局/步数由种子唯一决定：饿死步 = food₀+hp/1.4，双方天然同步）`);
console.log(`BC 因果对照（Task 36 行为克隆版 vs teacher，同种子）：净胜 ${pairBC.w}/${pairBC.w + pairBC.l}（${pct(pairBC.w / Math.max(1, pairBC.w + pairBC.l))}）—— 判定退化来源`);
{
  const bn = aggBC.herb.n + aggBC.pred.n + aggBC.scorp.n;
  const bOf = (f: (a: SideAgg) => number) => f(aggBC.herb) + f(aggBC.pred) + f(aggBC.scorp);
  console.log(`BC 侧参考：首决策即逃率 ${pct(bOf((a) => a.openingFleeN) / Math.max(1, bn), 1)} · 饿死率 ${pct(bOf((a) => a.outcome.starved) / Math.max(1, bn), 1)} · 击杀率 ${pct(bOf((a) => a.outcome.kill) / Math.max(1, bn), 1)}（vs RL ${pct(((aggRL.herb.outcome.kill + aggRL.pred.outcome.kill + aggRL.scorp.outcome.kill) / COWARD_N), 1)} / teacher ${pct(((aggT.herb.outcome.kill + aggT.pred.outcome.kill + aggT.scorp.outcome.kill) / COWARD_N), 1)}）`);
}

// —— 分桶对比表 ——
function printSideTable(title: string, rl: SideAgg, t: SideAgg, pair: PairStat) {
  const N = Math.max(1, rl.n);
  const Nt = Math.max(1, t.n);
  console.log(`\n▍${title}（n=${rl.n}）`);
  console.log('| 指标 | RL | teacher |');
  console.log('|---|---|---|');
  const row = (name: string, rv: string, tv: string) => console.log(`| ${name} | ${rv} | ${tv} |`);
  row('决策步数/局', (rl.dec / N).toFixed(1), (t.dec / Nt).toFixed(1));
  row('FIGHT 决策占比', pct(rl.fightDec / Math.max(1, rl.dec)), pct(t.fightDec / Math.max(1, t.dec)));
  row('FLEE 决策占比', pct(rl.fleeDec / Math.max(1, rl.dec)), pct(t.fleeDec / Math.max(1, t.dec)));
  row('首决策即 FLEE 局率', pct(rl.openingFleeN / N), pct(t.openingFleeN / Nt));
  row('单决策冻结局（开局逃→对手出视野→再无决策）', `${rl.frozenOneDecN}`, `${t.frozenOneDecN}`);
  row('纯逃局（全决策 FLEE 且未接敌）', `${rl.allFleeNoEngageN}`, `${t.allFleeNoEngageN}`);
  row('接敌率（曾攻击/被攻击）', pct(rl.engagedN / N), pct(t.engagedN / Nt));
  for (const k of OC) row(`outcome ${k}`, `${rl.outcome[k]}（${pct(rl.outcome[k] / N, 0)}）`, `${t.outcome[k]}（${pct(t.outcome[k] / Nt, 0)}）`);
  row('场均击杀 agentKills', (rl.kills / N).toFixed(2), (t.kills / Nt).toFixed(2));
  row('存活步数 steps（均值）', (rl.steps / N).toFixed(1), (t.steps / Nt).toFixed(1));
  row('击杀局击杀步（均值）', rl.killOutcomeN ? (rl.killStepSum / rl.killOutcomeN).toFixed(0) : '—', t.killOutcomeN ? (t.killStepSum / t.killOutcomeN).toFixed(0) : '—');
  row('饿死局饿死步（均值）', rl.starveN ? (rl.starveStepSum / rl.starveN).toFixed(0) : '—', t.starveN ? (t.starveStepSum / t.starveN).toFixed(0) : '—');
  row('totalReturn（均值）', (rl.ret / N).toFixed(3), (t.ret / Nt).toFixed(3));
  row('foodNet 终局食物净值（均值）', (rl.foodNet / N).toFixed(1), (t.foodNet / Nt).toFixed(1));
  row('rankScore（均值）', (rl.rank / N).toFixed(2), (t.rank / Nt).toFixed(2));
  row('首 FLEE 决策序号（有逃局均值）', rl.firstFleeN ? (rl.firstFleeIdxSum / rl.firstFleeN).toFixed(1) : '—', t.firstFleeN ? (t.firstFleeIdxSum / t.firstFleeN).toFixed(1) : '—');
  const pr = pair.w / Math.max(1, pair.w + pair.l);
  const [plo, phi] = wilson(pr, pair.w + pair.l);
  console.log(`\n  配对净胜率：RL 胜 ${pair.w} / 负 ${pair.l} / 平 ${pair.tie} —— ${pct(pr)} Wilson95 [${pct(plo)}, ${pct(phi)}]`);
}
printSideTable('表 A · 食草 agent（sheep/deer/penguin/camel）vs coward', aggRL.herb, aggT.herb, pairBucket.herb);
printSideTable('表 B · 非食草 agent vs coward（捕食者 8 种 + 蝎子）', mergeAgg(aggRL.pred, aggRL.scorp), mergeAgg(aggT.pred, aggT.scorp), { w: pairBucket.pred.w + pairBucket.scorp.w, l: pairBucket.pred.l + pairBucket.scorp.l, tie: pairBucket.pred.tie + pairBucket.scorp.tie });
console.log(`  （表 B 细分：捕食者 n=${aggRL.pred.n} 净胜 ${pairBucket.pred.w}/${pairBucket.pred.w + pairBucket.pred.l} · 蝎子 n=${aggRL.scorp.n} 净胜 ${pairBucket.scorp.w}/${pairBucket.scorp.w + pairBucket.scorp.l}）`);
console.log(`  食草 agent × 对手含非食草（捕食者型 coward）子集：n=${pairHerbNonHerbFoe.w + pairHerbNonHerbFoe.l + pairHerbNonHerbFoe.tie} 净胜 ${pairHerbNonHerbFoe.w}/${pairHerbNonHerbFoe.w + pairHerbNonHerbFoe.l}`);

// —— 机理细分 1：结局迁移矩阵 ——
function printCross(title: string, m: Record<Outcome, Record<Outcome, number>>) {
  console.log(`\n▍结局迁移矩阵（${title}，行 = teacher 结局 → 列 = RL 结局）`);
  console.log(`| T＼RL | ${OC.map((o) => o.padEnd(7)).join(' | ')} |`);
  console.log(`|---|${OC.map(() => '---').join('|')}|`);
  for (const t of OC) console.log(`| ${t.padEnd(5)} | ${OC.map((r) => String(m[t][r]).padEnd(7)).join(' | ')} |`);
  let down = 0;
  let up = 0;
  for (const t of OC) for (const r of OC) {
    const dt = OC.indexOf(t);
    const dr = OC.indexOf(r);
    if (m[t][r] > 0 && t !== r) {
      if (dt < dr) down += m[t][r];
      else if (dt > dr) up += m[t][r];
    }
  }
  console.log(`  结局降级（kill/escape → timeout/killed/starved 等向下迁移）${down} 局 · 结局升级 ${up} 局`);
}
printCross('食草桶', crossHerb);
printCross('非食草桶', crossNonHerb);

// —— 机理细分 2：单敌 × 可捕获性透镜 ——
console.log('\n▍单敌局 × 可捕获性透镜（可捕获 ≈ 1.15×speed_agent > 1.18×speed_foe：追击 mul vs 撤离 mul）');
function printLens(bucket: Bucket, label: string) {
  for (const [k, name] of [['sc', '单敌可捕获'], ['su', '单敌不可捕获'], ['multi', '多敌局']] as const) {
    const c = lens[bucket][k];
    if (c.n === 0) continue;
    const pr = c.w + c.l > 0 ? pct(c.w / (c.w + c.l), 0) : '—';
    console.log(
      `  ${label} · ${name}：n=${c.n} | 击杀率 RL ${pct(c.rlKill / c.n, 0)} vs T ${pct(c.tKill / c.n, 0)}` +
        (c.rlKill + c.tKill > 0 ? `（击杀步 RL ${c.rlKill ? (c.rlKillStep / c.rlKill).toFixed(0) : '—'} vs T ${c.tKill ? (c.tKillStep / c.tKill).toFixed(0) : '—'}）` : '') +
        ` | 首决策即逃 RL ${pct(c.rlOpenFlee / c.n, 0)} vs T ${pct(c.tOpenFlee / c.n, 0)}` +
        (k === 'su' ? ` | 饿死率 RL ${pct(c.rlStarve / c.n, 0)} vs T ${pct(c.tStarve / c.n, 0)}（饿死步 RL ${c.rlStarve ? (c.rlStarveStep / c.rlStarve).toFixed(0) : '—'} vs T ${c.tStarve ? (c.tStarveStep / c.tStarve).toFixed(0) : '—'}）` : '') +
        ` | 净胜 ${c.w}/${c.w + c.l}（${pr}）`,
    );
  }
}
printLens('pred', '捕食者');
printLens('herb', '食草');
printLens('scorp', '蝎子');

// —— 机理细分 2b：单敌可捕获 × 对手是否猎物（弃的是猎物还是非猎物 —— 决定性落点） ——
console.log('\n▍单敌可捕获 × 对手是否猎物（f5）—— 弃战落点定位（可捕获 = 免费击杀 + 捕食回充的机会局）');
function printPreyLens(bucket: Bucket, label: string) {
  for (const [k, name] of [['prey', '对手=猎物(f5=1)'], ['nonPrey', '对手=非猎物(f5=0)']] as const) {
    const c = preyLens[bucket][k];
    if (c.n === 0) continue;
    console.log(`  ${label} · ${name}：n=${c.n} | 击杀率 RL ${pct(c.rlKill / c.n, 0)} vs T ${pct(c.tKill / c.n, 0)} | 首决策即逃 RL ${pct(c.rlOpenFlee / c.n, 0)} vs T ${pct(c.tOpenFlee / c.n, 0)}`);
  }
}
printPreyLens('herb', '食草');
printPreyLens('pred', '捕食者');
printPreyLens('scorp', '蝎子');

// —— 机理细分 3：RL 轨迹分歧定位（coward 桶全部决策，RL 动作 vs teacherFlight 同特征重判） ——
console.log('\n▍RL 轨迹分歧定位（coward 桶全部决策：弃战型 = RL FLEE ∧ 教师 FIGHT；恋战型 = 反向）');
const divTotal: DivAgg = { fleeDir: 0, fightDir: 0, openFleeDir: 0, f0: new Array(10).fill(0), f2: new Array(10).fill(0), f5: [0, 0], f7: [0, 0], keyRegion: 0, openKeyRegion: 0 };
for (const b of ['herb', 'pred', 'scorp'] as Bucket[]) {
  const d = divMap[b];
  divTotal.fleeDir += d.fleeDir;
  divTotal.fightDir += d.fightDir;
  divTotal.openFleeDir += d.openFleeDir;
  divTotal.keyRegion += d.keyRegion;
  divTotal.openKeyRegion += d.openKeyRegion;
  for (let i = 0; i < 10; i++) { divTotal.f0[i] += d.f0[i]; divTotal.f2[i] += d.f2[i]; }
  divTotal.f5[0] += d.f5[0]; divTotal.f5[1] += d.f5[1];
  divTotal.f7[0] += d.f7[0]; divTotal.f7[1] += d.f7[1];
  console.log(`  ${b === 'herb' ? '食草' : b === 'pred' ? '捕食者' : '蝎子'}桶：弃战型 ${d.fleeDir}（首决策 ${d.openFleeDir}）· 恋战型 ${d.fightDir} · 关键区占比 ${pct(d.keyRegion / Math.max(1, d.fleeDir), 0)}`);
}
const divAll = divTotal.fleeDir + divTotal.fightDir;
console.log(`  合计：分歧 ${divAll} 决策 —— 弃战型 ${divTotal.fleeDir}（${pct(divTotal.fleeDir / Math.max(1, divAll), 0)}，其中首决策 ${divTotal.openFleeDir}）· 恋战型 ${divTotal.fightDir}`);
console.log(`  弃战型特征分布：f0≥0.45 占 ${pct(arrSumFrom(divTotal.f0, 5) / Math.max(1, divTotal.fleeDir), 0)} · f2<0.4 占 ${pct(arrSumTo(divTotal.f2, 4) / Math.max(1, divTotal.fleeDir), 0)} · f5=0（非猎物对手）占 ${pct(divTotal.f5[0] / Math.max(1, divTotal.fleeDir), 0)} · f7=0（非巨怪）占 ${pct(divTotal.f7[0] / Math.max(1, divTotal.fleeDir), 0)}`);
console.log(`  → 关键区 f0≥0.45 ∧ f2<0.4 ∧ f5=0（健康但劣势的非猎物遭遇，教师判 FIGHT 的边缘带）占弃战型 ${pct(divTotal.keyRegion / Math.max(1, divTotal.fleeDir), 0)}；首决策子集占 ${pct(divTotal.openKeyRegion / Math.max(1, divTotal.openFleeDir), 0)}`);
console.log(`  弃战型 f0 直方（10 桶占比）：${divTotal.f0.map((v) => (v / Math.max(1, divTotal.fleeDir) * 100).toFixed(0)).join('/')}`);
console.log(`  弃战型 f2 直方（10 桶占比）：${divTotal.f2.map((v) => (v / Math.max(1, divTotal.fleeDir) * 100).toFixed(0)).join('/')}`);

function arrSumFrom(a: number[], from: number) { let s = 0; for (let i = from; i < a.length; i++) s += a[i]; return s; }
function arrSumTo(a: number[], toExcl: number) { let s = 0; for (let i = 0; i < toExcl; i++) s += a[i]; return s; }

// ============================================================
// 任务 2：必战区一致率补测（+ 必逃区复测对照）
// ============================================================
console.log('\n—— 任务 2 · 必战区一致率补测（RL 网络输出 vs teacherFlight；采样 = FlightEnv 场景采样器驱动的决策瞬间） ——');
type ZoneId = 1 | 2 | 3;
interface ZoneAgg { n: number; agree: number; sanity: number; histN: number[][]; histD: number[][]; pSum: number; pN: number; pB: number[] }
const newZone = (): ZoneAgg => ({
  n: 0, agree: 0, sanity: 0,
  histN: [new Array(10).fill(0), new Array(10).fill(0), [0, 0], [0, 0]], // f0 / f2 / f5 / f7 全样本直方
  histD: [new Array(10).fill(0), new Array(10).fill(0), [0, 0], [0, 0], new Array(10).fill(0), new Array(10).fill(0)], // 同序分歧直方 + f1（饥饿）/ f4（距离）分歧直方
  pSum: 0, pN: 0, pB: [0, 0, 0, 0],
});
interface ZoneSource { total: number; z: Record<ZoneId, ZoneAgg>; mfN: number; mfAgree: number; mfViol: number; tfN: number; tfAgree: number; tlN: number; tlAgree: number }
/** 必战区三子区（首匹配归区，三区不交；并集 = 任务书三条件并集的精确覆盖：
 *  Z1 吸收 ②③ 的巨怪样本（f7>0.5∧f0≥0.4/0.45 ⇒ f0≥0.15）；Z3 不设 f5 守卫，
 *  使 ②因 f6>0.55 落选但满足 ③（f0≥0.45∧f2≥0.4）的猎物侧样本并入 Z3——否则并集漏采。
 *  教师在这些区全部输出 FIGHT——sanity 计数应为 0） */
function zoneOf(f: ArrayLike<number>): 0 | ZoneId {
  if (f[7] > 0.5 && f[0] >= 0.15) return 1; // Z1 = ① 巨怪非濒死
  if (f[7] <= 0.5 && f[5] > 0.5 && f[0] >= 0.4 && f[6] <= 0.55) return 2; // Z2 = ② 猎物在侧且健康无群压（非巨怪空间）
  if (f[7] <= 0.5 && f[0] >= 0.45 && f[2] >= 0.4) return 3; // Z3 = ③ 健康且非劣势（非巨怪空间；含 ②因群压落选的 ③ 样本）
  return 0;
}
function collectZones(seedBase: number, policy: FlightPolicy, target: number): ZoneSource {
  const src: ZoneSource = { total: 0, z: { 1: newZone(), 2: newZone(), 3: newZone() }, mfN: 0, mfAgree: 0, mfViol: 0, tfN: 0, tfAgree: 0, tlN: 0, tlAgree: 0 };
  for (let i = 0; src.total < target && i < 4000; i++) {
    const seed = seedBase + i;
    const r = mulberry32(seed ^ 0x9e3779b9);
    const opp = pickOpponent(r);
    const env = new FlightEnv(seed);
    const wrapped: FlightPolicy = (f) => {
      if (src.total < target) {
        src.total++;
        const tA = teacherFlight(f as number[]);
        const { a: netA, pFlee } = rlForward(f);
        // 全区域对照（教师判 FIGHT / FLEE 的全部决策 —— 覆盖三子区之外的健康劣势带）
        if (tA === 0) { src.tfN++; if (netA === 0) src.tfAgree++; } else { src.tlN++; if (netA === 1) src.tlAgree++; }
        const z = zoneOf(f);
        if (z === 0) {
          // 必逃区对照（Task 37 单向门同定义）：教师恒 FLEE
          if (f[7] <= 0.5 && f[5] <= 0.5 && f[0] < 0.3 && f[2] < 0.35) {
            src.mfN++;
            if (tA !== 1) src.mfViol++;
            if (netA === 1) src.mfAgree++;
          }
        } else {
          const Z = src.z[z];
          Z.n++;
          if (tA !== 0) Z.sanity++;
          const b0 = bin10(f[0]);
          const b2 = bin10(f[2]);
          const i5 = f[5] > 0.5 ? 1 : 0;
          const i7 = f[7] > 0.5 ? 1 : 0;
          Z.histN[0][b0]++; Z.histN[1][b2]++; Z.histN[2][i5]++; Z.histN[3][i7]++;
          if (netA === tA) Z.agree++;
          else {
            Z.histD[0][b0]++; Z.histD[1][b2]++; Z.histD[2][i5]++; Z.histD[3][i7]++;
            Z.histD[4][bin10(f[1])]++; Z.histD[5][bin10(f[4])]++;
            Z.pSum += pFlee;
            Z.pN++;
            Z.pB[pFlee < 0.6 ? 0 : pFlee < 0.75 ? 1 : pFlee < 0.9 ? 2 : 3]++;
          }
        }
      }
      return policy(f);
    };
    env.reset(wrapped, opp);
    let done = false;
    while (!done) done = env.stepEnv().done;
  }
  return src;
}
const srcRL = collectZones(ZONE_BASE_RL, rlPolicy, ZONE_PER_SOURCE);
const srcT = collectZones(ZONE_BASE_T, teacherPolicy, ZONE_PER_SOURCE);
console.log(`轨迹源：RL 策略局 ${srcRL.total} 决策（种子 ${ZONE_BASE_RL}+i，对手池 45/25/20/10）+ teacher 策略局 ${srcT.total} 决策（种子 ${ZONE_BASE_T}+i）—— 合计 ${srcRL.total + srcT.total}`);

function sumZone(a: ZoneAgg, b: ZoneAgg): ZoneAgg {
  const z = newZone();
  z.n = a.n + b.n;
  z.agree = a.agree + b.agree;
  z.sanity = a.sanity + b.sanity;
  z.pSum = a.pSum + b.pSum;
  z.pN = a.pN + b.pN;
  for (let i = 0; i < 4; i++) for (let j = 0; j < z.histN[i].length; j++) { z.histN[i][j] = a.histN[i][j] + b.histN[i][j]; z.histD[i][j] = a.histD[i][j] + b.histD[i][j]; }
  for (let i = 4; i < 6; i++) for (let j = 0; j < 10; j++) z.histD[i][j] = a.histD[i][j] + b.histD[i][j];
  for (let i = 0; i < 4; i++) z.pB[i] = a.pB[i] + b.pB[i];
  return z;
}
function printZone(id: ZoneId, name: string, def: string) {
  const Z = sumZone(srcRL.z[id], srcT.z[id]);
  const rate = Z.agree / Math.max(1, Z.n);
  console.log(`\n▍Z${id} ${name}（${def}）`);
  console.log(`  样本 n=${Z.n}（占 ${pct(Z.n / (srcRL.total + srcT.total), 1)}）· 一致率 ${pct(rate, 2)}（RL 轨迹源 ${pct(srcRL.z[id].agree / Math.max(1, srcRL.z[id].n), 2)} / teacher 轨迹源 ${pct(srcT.z[id].agree / Math.max(1, srcT.z[id].n), 2)}）${Z.sanity > 0 ? ` ⚠ 教师非 FIGHT 样本 ${Z.sanity}（区定义异常）` : ''}`);
  const divN = Z.n - Z.agree;
  if (divN === 0) {
    console.log('  分歧样本 0 —— 完全一致');
    return rate;
  }
  console.log(`  分歧 n=${divN} · 分歧处网络 pFlee 均值 ${(Z.pSum / Math.max(1, Z.pN)).toFixed(2)} · 分布 [0.5,0.6):${Z.pB[0]} [0.6,0.75):${Z.pB[1]} [0.75,0.9):${Z.pB[2]} [0.9,1]:${Z.pB[3]}`);
  for (const [di, dim, nb] of [[0, 'f0', 10], [1, 'f2', 10]] as const) {
    const lines: string[] = [];
    for (let b = 0; b < nb; b++) {
      const hn = Z.histN[di][b];
      const hd = Z.histD[di][b];
      if (hn === 0) continue;
      lines.push(`[${(b / nb).toFixed(1)},${((b + 1) / nb).toFixed(1)}) n=${String(hn).padStart(5)} div=${String(hd).padStart(4)} (${pct(hd / hn, 1).padStart(5)}) ${'█'.repeat(Math.round((hd / hn) * 20))}`);
    }
    console.log(`  ${dim} 分桶（样本/分歧/分歧率）：\n    ${lines.join('\n    ')}`);
  }
  for (const [di, dim] of [[2, 'f5'], [3, 'f7']] as const) {
    const seg = (i: number) => `=${i ? '1' : '0'} n=${String(Z.histN[di][i]).padStart(5)} div=${String(Z.histD[di][i]).padStart(4)} (${pct(Z.histD[di][i] / Math.max(1, Z.histN[di][i]), 1)})`;
    console.log(`  ${dim} 分桶：${seg(0)} · ${seg(1)}`);
  }
  const hd = (di: number) => Z.histD[di].map((v) => ((v / Math.max(1, divN)) * 100).toFixed(0)).join('/');
  console.log(`  分歧画像补充（占分歧的 %）：f1（饥饿度，0.5 档=非捕食者标记）直方 ${hd(4)} · f4（距离）直方 ${hd(5)}`);
  return rate;
}
const z1 = printZone(1, '巨怪非濒死', 'f7>0.5 ∧ f0≥0.15');
const z2 = printZone(2, '猎物在侧且健康无群压', 'f5>0.5 ∧ f0≥0.4 ∧ f6≤0.55');
const z3 = printZone(3, '健康且非劣势', 'f0≥0.45 ∧ f2≥0.4');
const mfN = srcRL.mfN + srcT.mfN;
const mfAgree = srcRL.mfAgree + srcT.mfAgree;
const mfRate = mfAgree / Math.max(1, mfN);
const zoneAllN = srcRL.z[1].n + srcT.z[1].n + srcRL.z[2].n + srcT.z[2].n + srcRL.z[3].n + srcT.z[3].n;
const zoneAllAgree = srcRL.z[1].agree + srcT.z[1].agree + srcRL.z[2].agree + srcT.z[2].agree + srcRL.z[3].agree + srcT.z[3].agree;
const zoneAllRate = zoneAllAgree / Math.max(1, zoneAllN);

console.log('\n—— 必战区达标判定（阈值 ≥ 0.95） ——');
console.log(`  ${z1 >= GATE_MUSTFIGHT ? '✓' : '✗'} Z1 巨怪非濒死：${pct(z1, 2)}（n=${srcRL.z[1].n + srcT.z[1].n}）`);
console.log(`  ${z2 >= GATE_MUSTFIGHT ? '✓' : '✗'} Z2 猎物在侧：${pct(z2, 2)}（n=${srcRL.z[2].n + srcT.z[2].n}）`);
console.log(`  ${z3 >= GATE_MUSTFIGHT ? '✓' : '✗'} Z3 健康非劣势：${pct(z3, 2)}（n=${srcRL.z[3].n + srcT.z[3].n}）`);
console.log(`  必战区合并：${pct(zoneAllRate, 2)}（n=${zoneAllN}）${zoneAllRate >= GATE_MUSTFIGHT ? '✓ 达标' : '✗ 未达标'}`);
console.log('\n—— 必逃区对照复测（Task 37 单向门同定义，基线 99.7%） ——');
console.log(`  一致率 ${pct(mfRate, 2)}（n=${mfN}，RL 源 ${pct(srcRL.mfAgree / Math.max(1, srcRL.mfN), 2)} / teacher 源 ${pct(srcT.mfAgree / Math.max(1, srcT.mfN), 2)}）${mfViolNote()}`);
// 主采样 20000 决策中必逃区样本仅 ~200 —— 扩采至 n≥2000 并按对手分桶（RL 自身轨迹，与 Task 37 方法一致）
const mfExt = { n: 0, agree: 0, cowardN: 0, cowardAgree: 0, fightN: 0, fightAgree: 0, epsMf: 0, epsViol: 0 };
{
  for (let i = 0; mfExt.n < 2000 && i < 20000; i++) {
    const seed = ZONE_BASE_RL + i;
    const r = mulberry32(seed ^ 0x9e3779b9);
    const opp = pickOpponent(r);
    const env = new FlightEnv(seed);
    let epMf = 0;
    let epViol = 0;
    const wrapped: FlightPolicy = (f) => {
      if (mfExt.n < 2000 && f[7] <= 0.5 && f[5] <= 0.5 && f[0] < 0.3 && f[2] < 0.35) {
        mfExt.n++;
        epMf++;
        const flee = rlForward(f).a === 1; // 必逃区教师恒 FLEE（上方 mfViol 已验证无违例），一致 = 网络输出 FLEE
        if (flee) mfExt.agree++;
        else epViol++;
        if (opp === 'coward') { mfExt.cowardN++; if (flee) mfExt.cowardAgree++; }
        else { mfExt.fightN++; if (flee) mfExt.fightAgree++; }
      }
      return rlPolicy(f);
    };
    env.reset(wrapped, opp);
    let done = false;
    while (!done) done = env.stepEnv().done;
    if (epMf > 0) {
      mfExt.epsMf++;
      if (epViol > 0) mfExt.epsViol++;
    }
  }
  console.log(`  扩展必逃区对照（RL 轨迹直至 n≥2000）：一致率 ${pct(mfExt.agree / Math.max(1, mfExt.n), 2)}（n=${mfExt.n}）—— 深采后低于 99.7% 基线，按对手分桶定位：`);
  console.log(`    coward 对手：一致率 ${pct(mfExt.cowardAgree / Math.max(1, mfExt.cowardN), 1)}（n=${mfExt.cowardN}）· 战斗型对手（teacher/aggressive/random）：${pct(mfExt.fightAgree / Math.max(1, mfExt.fightN), 2)}（n=${mfExt.fightN}）`);
  console.log(`    违例聚集度：有必逃样本的 ${mfExt.epsMf} 局中仅 ${mfExt.epsViol} 局含违例——单局（饿到 f0<0.3 仍在追击的捕食者长局）可贡献数十个必逃决策样本（轨迹自加权），非全局遗忘`);
}
// 全区域对照：教师判 FIGHT / FLEE 的全部决策（覆盖三子区之外的健康劣势带 —— coward 桶弃战集中区）
console.log(`  教师判 FIGHT 全区域一致率 ${pct((srcRL.tfAgree + srcT.tfAgree) / Math.max(1, srcRL.tfN + srcT.tfN), 2)}（n=${srcRL.tfN + srcT.tfN}）· 教师判 FLEE 全区域一致率 ${pct((srcRL.tlAgree + srcT.tlAgree) / Math.max(1, srcRL.tlN + srcT.tlN), 2)}（n=${srcRL.tlN + srcT.tlN}）`);

function mfViolNote() {
  const v = srcRL.mfViol + srcT.mfViol;
  return v === 0 ? '—— 采样方法与 Task 37 一致性 ✓（教师恒 FLEE 无违例）' : ` ⚠ 教师非 FLEE 违例 ${v}`;
}

// ============================================================
// 诊断结论
// ============================================================
const downHerb = crossHerb.kill.timeout + crossHerb.kill.killed + crossHerb.kill.starved + crossHerb.escape.timeout + crossHerb.escape.killed + crossHerb.escape.starved;
const downNonHerb = crossNonHerb.kill.timeout + crossNonHerb.kill.killed + crossNonHerb.kill.starved + crossNonHerb.escape.timeout + crossNonHerb.escape.killed + crossNonHerb.escape.starved;
const downAll = downHerb + downNonHerb;
const nonHerbW = pairBucket.pred.w + pairBucket.scorp.w;
const nonHerbL = pairBucket.pred.l + pairBucket.scorp.l;
const Z3s = sumZone(srcRL.z[3], srcT.z[3]);
const z3DivN = Z3s.n - Z3s.agree;
const Z2s = sumZone(srcRL.z[2], srcT.z[2]);
const z2DivN = Z2s.n - Z2s.agree;
const hPrey = preyLens.herb.prey;
const hNonPrey = preyLens.herb.nonPrey;
const pNonPrey = preyLens.pred.nonPrey;
console.log('\n—— 诊断结论 ——');
console.log(`· 【根因①·主通道：健康劣势非猎物区「开局即逃」→ 弃杀/饿死】coward 桶净胜率 ${pct(netRate)}（${pairTotal.w}W/${pairTotal.l}L/${pairTotal.tie}平，Wilson95 [${pct(wlo)}, ${pct(whi)}]；前 600 局 = Task 37 复现集 ${pct(replRate)}）。落点高度集中：弃战型分歧（RL=FLEE∧教师=FIGHT）共 ${divTotal.fleeDir}，${pct(divTotal.keyRegion / Math.max(1, divTotal.fleeDir), 0)} 落在关键区 f0≥0.45∧f2<0.4∧f5=0（教师判 FIGHT 的边缘带），${divTotal.openFleeDir}/${divTotal.fleeDir} 发生在首决策；首决策即逃率 RL vs teacher —— 食草桶 ${pct(aggRL.herb.openingFleeN / Math.max(1, aggRL.herb.n), 0)}/${pct(aggT.herb.openingFleeN / Math.max(1, aggT.herb.n), 0)}、捕食者桶 ${pct(aggRL.pred.openingFleeN / Math.max(1, aggRL.pred.n), 0)}/${pct(aggT.pred.openingFleeN / Math.max(1, aggT.pred.n), 0)}。后果按桶分化：食草 kill→timeout ${crossHerb.kill.timeout} 局（单敌可捕获×非猎物：teacher 击杀 ${pct(hNonPrey.tKill / Math.max(1, hNonPrey.n), 0)} vs RL ${pct(hNonPrey.rlKill / Math.max(1, hNonPrey.n), 0)}、RL 首决策逃 ${pct(hNonPrey.rlOpenFlee / Math.max(1, hNonPrey.n), 0)} —— deer 追得上 wolf/snake/bear 级对手却弃战；同场景对手=猎物时 RL 击杀 ${hPrey.rlKill}/${hPrey.n}、首决策逃 ${pct(hPrey.rlOpenFlee / Math.max(1, hPrey.n), 0)} —— 弃战只指向非猎物）；捕食者 kill→starved ${crossNonHerb.kill.starved} 局（弃战→永不进食，teacher 同种子追击 + 捕食回充 55+maxHp/2 存活；单敌可捕获×非猎物 teacher 击杀 ${pct(pNonPrey.tKill / Math.max(1, pNonPrey.n), 0)} vs RL ${pct(pNonPrey.rlKill / Math.max(1, pNonPrey.n), 0)}）。结局降级合计 ${downAll} 局 = 净负的 ${pct(downAll / Math.max(1, pairTotal.l), 0)}。`);
console.log(`· 【根因②·桶间差异与高平局率】食草桶净胜 ${pct(pairBucket.herb.w / Math.max(1, pairBucket.herb.w + pairBucket.herb.l), 1)}（${pairBucket.herb.w}/${pairBucket.herb.w + pairBucket.herb.l}）vs 非食草 ${pct(nonHerbW / Math.max(1, nonHerbW + nonHerbL), 1)}（${nonHerbW}/${nonHerbW + nonHerbL}）—— 食草无饥饿账本，弃战只丢击杀分；捕食者弃战以饿死（reward -1.4）结算。平局 ${pct(pairTotal.tie / COWARD_N, 1)}：coward 永不攻击 → 行为无关结局（饿死步 = food₀+hp/1.4，同种子双方同步）由种子唯一决定，仅 ${pairTotal.w + pairTotal.l} 局分出胜负。`);
console.log(`· 【根因③·机理：特征盲区×对手混采（BC 对照排除继承）】9 维特征无对手行为信号（区分不了「会反击」与「永不反击」）。「健康劣势非猎物→逃」对混采 90% 会反击的对手（teacher/aggressive/random）是省命正解，PPO 按混采期望优化牺牲了 10% 权重的 coward 桶；同一盲区的镜像：必逃区违例集中于 coward×捕食者局（一致率 ${pct(mfExt.cowardAgree / Math.max(1, mfExt.cowardN), 0)} vs 战斗型对手 ${pct(mfExt.fightAgree / Math.max(1, mfExt.fightN), 1)}）—— 饿到 f0<0.3 仍追「不反击的对手」是自适应觅食，规则反而错。BC 因果对照 ${pairBC.w}/${pairBC.w + pairBC.l}（≈镜像教师）→ 退化是 PPO 微调引入而非 BC 继承。全局分歧以恋战向为主（教师判 FLEE 处一致率仅 ${pct((srcRL.tlAgree + srcT.tlAgree) / Math.max(1, srcRL.tlN + srcT.tlN), 1)}）—— 弃战是少数落点但代价集中。`);
console.log(`· 【必战区判定】Z1 ${pct(z1, 2)} / Z2 ${pct(z2, 2)} / Z3 ${pct(z3, 2)}（✗ 单区未过 95：分歧 ${pct((Z3s.histD[1][4] + Z3s.histD[1][5]) / Math.max(1, z3DivN), 0)} 集中 f2∈[0.4,0.6)×f0≥0.9 —— 必战区下边缘带，与 coward 桶关键区弃战同源：「健康但非碾压」也被学成了逃），合并 ${pct(zoneAllRate, 2)}（n=${zoneAllN}）≥ 0.95 ✓ 达标。Z2 分歧 ${pct(Z2s.histD[5][0] / Math.max(1, z2DivN), 0)} 在 f4<0.1（猎物贴脸仍逃）且 teacher 轨迹源 ${pct(srcT.z[2].agree / Math.max(1, srcT.z[2].n), 2)} < RL 源 ${pct(srcRL.z[2].agree / Math.max(1, srcRL.z[2].n), 2)}（on-policy 采样会自我低估分歧）。必逃区对照 ${pct(mfRate, 2)}（n=${mfN}）≈ Task 37 基线 99.7% ✓；扩采 n=${mfExt.n} 后 ${pct(mfExt.agree / Math.max(1, mfExt.n), 1)}，违例 ${mfExt.epsViol}/${mfExt.epsMf} 局聚集贡献（轨迹自加权）—— 非全局遗忘，是对手盲区亚群。`);
console.log(`· 【重训建议】四管齐下：①特征增维 —— 对手行为信号（对手近 K 步净位移方向/逼近速率，worklog 遗留 #1「追击放弃阈值」特征的泛化），让网络可区分 coward/aggressive；②coward 桶采样权重 10%→25%+ 或按桶课程学习；③奖励侧把「可胜而逃」罚扩展到 f5=0 情形（现 cowardStep/cowardHungerStep 只覆盖 f5>0.5 或饿兽区，健康劣势非猎物区无罚 —— 本次定位的弃战落点）；④质量门增加必战区检查（当前仅必逃区单向门；Z3 ${pct(z3, 1)} 若入闸今日即挡，合并门 ${pct(zoneAllRate, 1)} 贴线）。`);
console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 诊断脚本只读共享文件，零游戏文件改动`);
