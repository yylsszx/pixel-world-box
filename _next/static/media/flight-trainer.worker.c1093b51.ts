/// <reference lib="webworker" />
// ============ Flight Trainer Worker：战或逃在线局后训练（后台线程） ============
// Task 38 Online Post-training 第一步（局后训练）。主线程只推理+采集（collector.ts），
// 训练与评估全在本 Worker —— 主线程零训练开销。
//
// 流程：
//   init   ← 初始权重(98)+超参+种子 → 构建 net + production 拷贝 + 分歧胜率基线(600 局)
//   batch  ← 完整遭遇战经验包 → 缓冲累积，每 ≥256 步一次 PPO 更新（GAE→2 epoch→minibatch 256）
//            每 10 次更新 → 评估门 → postMessage 候选权重 / 拒绝（内部回滚到 production 拷贝）
//   reset  ← 上线确认（promoteAck）→ net/prod 同步为已上线权重 + 基线重算（防越训越歪）
//
// 评估门 shouldPromote（任务书四条；口径说明）：
//   ① 必逃区：不劣于生产实测 − 0.5pt，且绝对底线 ≥ 0.90（Worker 全轨迹采样口径下
//      RL v1 实测 93.1% —— Task 38-g 扩采 93.5% 同源；离线小样本口径 99.7% 的 0.99 阈
//      在部署验收侧继续有效）
//   ② 必战区：≥ 0.95 且不劣于生产实测 − 0.5pt（滚动门防一代不如一代）
//   ③ 分歧胜率 ≥ production 基线 − 0.01（固定种子配对局，同种子噪声同向抵消）
//   ④ 输出范围校验（isFinite ∧ |w|≤50）
//
// 梯度公式与离线 train-flight-ppo.ts 逐符号对齐（同一账本，禁止分叉）：
//   d_logits = ppoTerm·(δ_a − p) + β·(p − π̃) + entCoef·p·(logp + H)
//   ppoTerm = −adv·ratio·ppoActive（ppoActive = unclipped ≤ clipped ? 1 : 0）
//   KL 锚 = 对软化教师标签 π̃[a_T]=0.92 的交叉熵；d_v = v − R
//
// 超参（终版数值，禁止「适当调整」）：γ 0.995 · λ 0.95 · clip 0.2 · epochs 2 · minibatch 256
//   lr 三档（离线 2e-3 打折）：保守 1e-4/β0.20/熵0.003 · 均衡 2e-4/β0.15/熵0.005 · 激进 4e-4/β0.10/熵0.008
//   在线 β 下限 0.10 远大于离线终值 0.02 —— 在线数据分布窄（单世界单会话流），锚必须更粗
import {
  mulberry32, runEpisode, type FlightPolicy, type OpponentPolicy, OPPONENT_MIX,
} from '../../../../scripts/flight-env';
import { teacherFlight } from '../policy';
import type { EpisodePacket } from './collector';

// ============================ 协议 ============================
export interface Hyper {
  lr: number;
  beta: number;
  entCoef: number;
}
export interface EvalMetrics {
  updates: number;
  mustFlee: number;
  mustFleeN: number;
  mustFight: number;
  mustFightN: number;
  divWinRate: number;
  divWinRateProd: number;
  ret: number;
  divWin: number;
  divLose: number;
}

type ToWorker =
  | { t: 'init'; weights: Float32Array; hyper: Hyper; seed: number }
  | { t: 'batch'; episodes: EpisodePacket[] }
  | { t: 'reset'; weights: Float32Array }
  | { t: 'hyper'; hyper: Hyper };

const EVAL_PAIRS = 600; // 评估配对局数（固定种子基准集）
const EVAL_SEED0 = 99001; // 评估种子基（与训练/采集种子空间隔离）
const UPDATE_EVERY_STEPS = 256; // 每 256 条经验训一次（任务书）
const EVAL_EVERY_UPDATES = 10; // 每 10 次训练评估一次（任务书）
const TEACHER_SOFT = 0.92; // 软化教师标签（KL 锚目标，离线在线同源）
const GAMMA = 0.995;
const LAMBDA = 0.95;
const CLIP = 0.2;
const EPOCHS = 2;
const MINIBATCH = 256;
const ADAM_B1 = 0.9;
const ADAM_B2 = 0.999;
const ADAM_EPS = 1e-8;
const GRAD_CLIP = 0.5;
const GATE_MUSTFLEE_FLOOR = 0.9; // 必逃区绝对底线（Worker 全轨迹口径；防灾难性遗忘）
const GATE_MUSTFIGHT = 0.95; // 必战区绝对门（用户阈值，两口径均满足）
const GATE_ROLL_SLACK = 0.005; // 滚动门容差（不劣于生产 − 0.5pt）
const GATE_DIV_DROP = 0.01;

// ============================ 微型 ActorCritic（98 参策略 + 9 参 value，手写零依赖） ============================
const N_IN = 9;
const N_H = 8;
class Net {
  w1 = new Float32Array(N_IN * N_H);
  b1 = new Float32Array(N_H);
  w2 = new Float32Array(N_H * 2);
  b2 = new Float32Array(2);
  wv = new Float32Array(N_H); // value 头（仅训练期）
  bv = 0;
  hid = new Float32Array(N_H);
  p0 = 0.5;
  p1 = 0.5;
  v = 0;
  // 梯度累加器
  gw1 = new Float32Array(N_IN * N_H);
  gb1 = new Float32Array(N_H);
  gw2 = new Float32Array(N_H * 2);
  gb2 = new Float32Array(2);
  gwv = new Float32Array(N_H);
  gbv = 0;
  // Adam 矩
  private ps: Float32Array[] = [];
  private gs: Float32Array[] = [];
  private ms: Float32Array[] = [];
  private vs: Float32Array[] = [];
  private adamT = 0;
  private mBv = 0;
  private vBv = 0;

  constructor(flat?: Float32Array) {
    if (flat) this.loadFlat(flat);
    this.ps = [this.w1, this.b1, this.w2, this.b2, this.wv];
    this.gs = [this.gw1, this.gb1, this.gw2, this.gb2, this.gwv];
    this.ms = this.ps.map((p) => new Float32Array(p.length));
    this.vs = this.ps.map((p) => new Float32Array(p.length));
  }

  loadFlat(flat: Float32Array) {
    this.w1.set(flat.subarray(0, 72));
    this.b1.set(flat.subarray(72, 80));
    this.w2.set(flat.subarray(80, 96));
    this.b2.set(flat.subarray(96, 98));
  }

  flat(): Float32Array {
    const out = new Float32Array(98);
    out.set(this.w1, 0);
    out.set(this.b1, 72);
    out.set(this.w2, 80);
    out.set(this.b2, 96);
    return out;
  }

  copyFrom(o: Net) {
    this.w1.set(o.w1); this.b1.set(o.b1); this.w2.set(o.w2); this.b2.set(o.b2);
    this.wv.set(o.wv); this.bv = o.bv;
  }

  /** 前向：填 hid / p0 p1（softmax）/ v */
  forward(f: ArrayLike<number>) {
    const { w1, b1, hid, w2, b2 } = this;
    for (let h = 0; h < N_H; h++) {
      let s = b1[h];
      for (let i = 0; i < N_IN; i++) s += f[i] * w1[i * N_H + h];
      hid[h] = Math.tanh(s);
    }
    const l0 = b2[0] + (hid[0] * w2[0] + hid[1] * w2[2] + hid[2] * w2[4] + hid[3] * w2[6] + hid[4] * w2[8] + hid[5] * w2[10] + hid[6] * w2[12] + hid[7] * w2[14]);
    const l1 = b2[1] + (hid[0] * w2[1] + hid[1] * w2[3] + hid[2] * w2[5] + hid[3] * w2[7] + hid[4] * w2[9] + hid[5] * w2[11] + hid[6] * w2[13] + hid[7] * w2[15]);
    const mx = l0 > l1 ? l0 : l1;
    const e0 = Math.exp(l0 - mx);
    const e1 = Math.exp(l1 - mx);
    const z = e0 + e1;
    this.p0 = e0 / z;
    this.p1 = e1 / z;
    let v = this.bv;
    for (let h = 0; h < N_H; h++) v += hid[h] * this.wv[h];
    this.v = v;
  }

  /** 确定性 argmax（部署/评估） */
  argmax(f: ArrayLike<number>): number {
    this.forward(f);
    return this.p1 > this.p0 ? 1 : 0;
  }

  /** 反向累加单样本复合损失梯度（公式 = train-flight-ppo.ts L180-230 逐符号对齐） */
  accumulate(f: ArrayLike<number>, a: number, logpOld: number, adv: number, retTarget: number, beta: number, tA: number, entCoef: number) {
    this.forward(f);
    const p0 = this.p0;
    const p1 = this.p1;
    const logpNew = Math.log(Math.max(1e-9, a === 0 ? p0 : p1));
    const ratio = Math.exp(logpNew - logpOld);
    // PPO clip 激活判定（未触界才传梯度）
    const unclipped = ratio * adv;
    const clipped = Math.max(1 - CLIP, Math.min(1 + CLIP, ratio)) * adv;
    const ppoActive = unclipped <= clipped ? 1 : 0;
    const ppoTerm = -adv * ratio * ppoActive;
    // KL 锚（对软化教师分布的交叉熵）+ 熵正则
    const ent = -(p0 * Math.log(Math.max(1e-9, p0)) + p1 * Math.log(Math.max(1e-9, p1)));
    const t0 = tA === 0 ? TEACHER_SOFT : 1 - TEACHER_SOFT;
    const t1 = tA === 1 ? TEACHER_SOFT : 1 - TEACHER_SOFT;
    const d0 = ppoTerm * (a === 0 ? 1 - p0 : -p0) + beta * (p0 - t0) + entCoef * p0 * (Math.log(Math.max(1e-9, p0)) + ent);
    const d1 = ppoTerm * (a === 1 ? 1 - p1 : -p1) + beta * (p1 - t1) + entCoef * p1 * (Math.log(Math.max(1e-9, p1)) + ent);
    const dV = this.v - retTarget;
    // 输出层参数
    this.gb2[0] += d0;
    this.gb2[1] += d1;
    for (let h = 0; h < N_H; h++) {
      this.gw2[h * 2] += d0 * this.hid[h];
      this.gw2[h * 2 + 1] += d1 * this.hid[h];
    }
    this.gbv += dV;
    // 隐层（tanh'）
    for (let h = 0; h < N_H; h++) {
      const s = (d0 * this.w2[h * 2] + d1 * this.w2[h * 2 + 1] + dV * this.wv[h]) * (1 - this.hid[h] * this.hid[h]);
      if (s === 0) continue;
      this.gb1[h] += s;
      this.gwv[h] += dV * this.hid[h];
      for (let i = 0; i < N_IN; i++) this.gw1[i * N_H + h] += s * f[i];
    }
  }

  zeroGrad() {
    this.gw1.fill(0); this.gb1.fill(0); this.gw2.fill(0); this.gb2.fill(0); this.gwv.fill(0); this.gbv = 0;
  }

  /** Adam 步（梯度均值化 + 全局 L2 裁剪，对齐离线 stepAdam） */
  adamStep(lr: number, batchScale: number) {
    let sq = this.gbv * this.gbv;
    for (const g of this.gs) for (let i = 0; i < g.length; i++) sq += g[i] * g[i];
    const meanNorm = Math.sqrt(sq) / batchScale;
    const clipScale = meanNorm > GRAD_CLIP ? GRAD_CLIP / meanNorm : 1;
    this.adamT++;
    const bc1 = 1 - Math.pow(ADAM_B1, this.adamT);
    const bc2 = 1 - Math.pow(ADAM_B2, this.adamT);
    for (let k = 0; k < this.ps.length; k++) {
      const p = this.ps[k];
      const g = this.gs[k];
      const m = this.ms[k];
      const v = this.vs[k];
      for (let i = 0; i < p.length; i++) {
        const gi = (g[i] / batchScale) * clipScale;
        m[i] = ADAM_B1 * m[i] + (1 - ADAM_B1) * gi;
        v[i] = ADAM_B2 * v[i] + (1 - ADAM_B2) * gi * gi;
        p[i] -= (lr * (m[i] / bc1)) / (Math.sqrt(v[i] / bc2) + ADAM_EPS);
      }
    }
    const gi = (this.gbv / batchScale) * clipScale;
    this.mBv = ADAM_B1 * this.mBv + (1 - ADAM_B1) * gi;
    this.vBv = ADAM_B2 * this.vBv + (1 - ADAM_B2) * gi * gi;
    this.bv -= (lr * (this.mBv / bc1)) / (Math.sqrt(this.vBv / bc2) + ADAM_EPS);
  }
}

// ============================ Worker 状态 ============================
let net = new Net();
let prod = new Net(); // production 权重拷贝（评估基线 + 拒绝后回滚目标）
let hyper: Hyper = { lr: 2e-4, beta: 0.15, entCoef: 0.005 };
let updates = 0;
let episodesDone = 0;
let stepsDone = 0;
let evalSeed = 12345;
let prodDivWinRate = 0.5;
let prodMustFlee = 1; // 生产基线必逃区一致率（Worker 口径，init/reset 时实测）
let prodMustFight = 1; // 生产基线必战区一致率
// 经验缓冲（batch 到达即摊平；凑满 256 步训练）
const buf = {
  states: [] as number[],
  actions: [] as number[],
  oldLogps: [] as number[],
  rewards: [] as number[],
  dones: [] as number[],
  teacherActions: [] as number[],
};

function policyOf(n: Net): FlightPolicy {
  return (f) => n.argmax(f);
}

function pickOpponent(r: () => number): OpponentPolicy {
  let v = r();
  for (const [o, w] of OPPONENT_MIX) {
    v -= w;
    if (v <= 0) return o;
  }
  return 'teacher';
}

const teacherPolicyFn: FlightPolicy = (f) => teacherFlight(f as number[]);

// ============================ 评估（600 固定种子配对局） ============================
function evaluate(policy: FlightPolicy) {
  let divWin = 0;
  let divLose = 0;
  let mustFleeA = 0;
  let mustFleeN = 0;
  let mustFightA = 0;
  let mustFightN = 0;
  let retSum = 0;
  for (let i = 0; i < EVAL_PAIRS; i++) {
    const seed = EVAL_SEED0 + i;
    const r = mulberry32(seed ^ 0x5bf03635);
    const opp = pickOpponent(r);
    const resN = runEpisode(seed, policy, opp);
    const resT = runEpisode(seed, teacherPolicyFn, opp);
    retSum += resN.totalReturn;
    let diverged = false;
    for (const rec of resN.obsLog) {
      const f = rec.f;
      const tA = teacherFlight(f as unknown as number[]);
      if (rec.a !== tA) diverged = true;
      // ① 必逃区（教师 FLEE 高置信）
      if (f[7] <= 0.5 && f[5] <= 0.5 && f[0] < 0.3 && f[2] < 0.35) {
        mustFleeN++;
        if (tA === 1 && rec.a === 1) mustFleeA++;
      }
      // ② 必战区（教师 FIGHT 高置信，三条件并集）
      if ((f[7] > 0.5 && f[0] >= 0.15) || (f[5] > 0.5 && f[0] >= 0.4 && f[6] <= 0.55) || (f[0] >= 0.45 && f[2] >= 0.4)) {
        mustFightN++;
        if (tA === 0 && rec.a === 0) mustFightA++;
      }
    }
    if (diverged) {
      if (resN.rankScore > resT.rankScore + 1e-9) divWin++;
      else if (resN.rankScore < resT.rankScore - 1e-9) divLose++;
    }
  }
  const dn = divWin + divLose;
  return {
    mustFlee: mustFleeN > 0 ? mustFleeA / mustFleeN : 1,
    mustFleeN,
    mustFight: mustFightN > 0 ? mustFightA / mustFightN : 1,
    mustFightN,
    divWinRate: dn > 0 ? divWin / dn : 0.5,
    ret: retSum / EVAL_PAIRS,
    divWin,
    divLose,
  };
}

// ============================ 评估门 shouldPromote ============================
function evalGate(): { passed: boolean; metrics: EvalMetrics; weights?: Float32Array; reason?: string } {
  // ④ 输出范围校验（NaN/溢出）—— 坏权重直接回滚
  const flat = net.flat();
  for (let i = 0; i < 98; i++) {
    if (!Number.isFinite(flat[i]) || Math.abs(flat[i]) > 50) {
      net.copyFrom(prod);
      return { passed: false, metrics: emptyMetrics(), reason: '④ NaN/溢出' };
    }
  }
  const m = evaluate(policyOf(net));
  const metrics: EvalMetrics = {
    updates,
    mustFlee: m.mustFlee,
    mustFleeN: m.mustFleeN,
    mustFight: m.mustFight,
    mustFightN: m.mustFightN,
    divWinRate: m.divWinRate,
    divWinRateProd: prodDivWinRate,
    ret: m.ret,
    divWin: m.divWin,
    divLose: m.divLose,
  };
  if (m.mustFlee < Math.max(GATE_MUSTFLEE_FLOOR, prodMustFlee - GATE_ROLL_SLACK)) {
    net.copyFrom(prod);
    return { passed: false, metrics, reason: `① 必逃区 ${(m.mustFlee * 100).toFixed(1)}% < 生产 ${(prodMustFlee * 100).toFixed(1)}%−0.5pt` };
  }
  if (m.mustFight < Math.max(GATE_MUSTFIGHT, prodMustFight - GATE_ROLL_SLACK)) {
    net.copyFrom(prod);
    const fightGate = Math.max(GATE_MUSTFIGHT, prodMustFight - GATE_ROLL_SLACK) * 100;
    return { passed: false, metrics, reason: `② 必战区 ${(m.mustFight * 100).toFixed(1)}% < ${fightGate.toFixed(1)}%` };
  }
  if (m.divWinRate < prodDivWinRate - GATE_DIV_DROP) {
    net.copyFrom(prod);
    return { passed: false, metrics, reason: `③ 分歧胜率 ${(m.divWinRate * 100).toFixed(1)}% 倒退超 1pt` };
  }
  return { passed: true, metrics, weights: flat };
}

function emptyMetrics(): EvalMetrics {
  return { updates, mustFlee: 0, mustFleeN: 0, mustFight: 0, mustFightN: 0, divWinRate: 0, divWinRateProd: prodDivWinRate, ret: 0, divWin: 0, divLose: 0 };
}

/** 生产基线实测（init/reset 时：分歧胜率 + 必逃/必战 —— 滚动门的锚） */
function measureProdBaseline() {
  const base = evaluate(policyOf(prod));
  prodDivWinRate = base.divWinRate;
  prodMustFlee = base.mustFlee;
  prodMustFight = base.mustFight;
}

// ============================ PPO 更新 ============================
function trainIfReady(): boolean {
  // 从 buf 头部取「episode 对齐且 ≥256 步」的最短块（每 256 条经验训一次 —— 任务书；
  // episode 对齐保证 GAE 的 done 截断语义，剩余经验留在 buf 等下一轮）
  let cut = -1;
  let cnt = 0;
  for (let i = 0; i < buf.actions.length; i++) {
    cnt++;
    if (buf.dones[i] === 1 && cnt >= UPDATE_EVERY_STEPS) {
      cut = i + 1;
      break;
    }
  }
  if (cut < 0) return false;
  const n = cut;
  const states = Float32Array.from(buf.states.splice(0, n * 9));
  const actions = Uint8Array.from(buf.actions.splice(0, n));
  const oldLogps = Float32Array.from(buf.oldLogps.splice(0, n * 2));
  const rewards = Float32Array.from(buf.rewards.splice(0, n));
  const dones = Uint8Array.from(buf.dones.splice(0, n));
  const teacherActions = Uint8Array.from(buf.teacherActions.splice(0, n));
  // GAE(λ) 逆向扫描（done=1 截断 bootstrap）
  const advs = new Float32Array(n);
  const rets = new Float32Array(n);
  let nextV = 0;
  let nextAdv = 0;
  for (let i = n - 1; i >= 0; i--) {
    net.forward(states.subarray(i * 9, i * 9 + 9));
    const v = net.v;
    const nonTerm = dones[i] ? 0 : 1;
    const delta = rewards[i] + GAMMA * nextV * nonTerm - v;
    nextAdv = delta + GAMMA * LAMBDA * nextAdv * nonTerm;
    advs[i] = nextAdv;
    rets[i] = nextAdv + v;
    nextV = v;
  }
  // 优势标准化
  let mean = 0;
  for (let i = 0; i < n; i++) mean += advs[i];
  mean /= n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += (advs[i] - mean) * (advs[i] - mean);
  const std = Math.sqrt(sq / n) || 1;
  for (let i = 0; i < n; i++) advs[i] = (advs[i] - mean) / std;
  // epochs × minibatch（Fisher-Yates 洗牌索引）
  const idx = new Int32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const rng = mulberry32(evalSeed + updates * 7919);
  for (let e = 0; e < EPOCHS; e++) {
    for (let i = n - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    for (let start = 0; start + MINIBATCH <= n; start += MINIBATCH) {
      net.zeroGrad();
      for (let k = start; k < start + MINIBATCH; k++) {
        const i = idx[k];
        net.accumulate(
          states.subarray(i * 9, i * 9 + 9),
          actions[i],
          oldLogps[i * 2 + actions[i]],
          advs[i],
          rets[i],
          hyper.beta,
          teacherActions[i],
          hyper.entCoef,
        );
      }
      net.adamStep(hyper.lr, MINIBATCH);
    }
  }
  updates++;
  stepsDone += n;
  post({ t: 'progress', updates, episodes: episodesDone, steps: stepsDone });
  // 每 10 次更新 → 评估门
  if (updates % EVAL_EVERY_UPDATES === 0) {
    const g = evalGate();
    if (g.passed) {
      post({ t: 'eval', passed: true, weights: g.weights, metrics: g.metrics });
      // 候选已发主线程；主线程 confirmPromote 后回 reset 消息同步基准
    } else {
      post({ t: 'eval', passed: false, metrics: g.metrics, reason: g.reason });
    }
  }
  return true;
}

function post(msg: unknown) {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg);
}

// ============================ 消息入口 ============================
self.onmessage = (ev: MessageEvent<ToWorker>) => {
  const m = ev.data;
  switch (m.t) {
    case 'init': {
      net = new Net(m.weights);
      prod = new Net(m.weights);
      hyper = m.hyper;
      evalSeed = m.seed;
      updates = 0;
      episodesDone = 0;
      stepsDone = 0;
      measureProdBaseline();
      post({ t: 'progress', updates: 0, episodes: 0, steps: 0 });
      break;
    }
    case 'batch': {
      for (const ep of m.episodes) {
        episodesDone++;
        for (let i = 0; i < ep.n; i++) {
          for (let k = 0; k < 9; k++) buf.states.push(ep.states[i * 9 + k]);
          buf.actions.push(ep.actions[i]);
          buf.oldLogps.push(ep.oldLogps[i * 2], ep.oldLogps[i * 2 + 1]);
          buf.rewards.push(ep.rewards[i]);
          buf.dones.push(ep.dones[i]);
          buf.teacherActions.push(ep.teacherActions[i]);
        }
      }
      // 循环切片：每段 episode 对齐 ≥256 步训练一次（大 batch 逐段消化）
      let guard = 0;
      while (trainIfReady() && ++guard < 200);
      break;
    }
    case 'reset': {
      // 上线确认：net 与 prod 同步为已上线权重，基线重算（训练起点收敛到生产态）
      net = new Net(m.weights);
      prod = new Net(m.weights);
      measureProdBaseline();
      break;
    }
    case 'hyper': {
      hyper = m.hyper;
      break;
    }
  }
};
