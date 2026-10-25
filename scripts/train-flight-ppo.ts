// ============ Task 37 路径B：战或逃头 PPO 强化学习微调（超越教师） ============
// 运行：bun scripts/train-flight-ppo.ts
// 产出：src/lib/game/neuro-flight-rl.ts（RL 版 flight 权重 + 评估元数据，自动生成）
//
// 流水线（一次运行全部完成，日志分段）：
//   Phase 0  baseline：teacher / bc（Task 36 行为克隆版）/ random 三策略跑分
//   Phase 1  PPO 训练：BC 权重初始化 → 80 迭代（rollout 96 局/迭代 × 4 epoch）
//             损失 = PPO_clip + 0.5·value + β·KL(π‖π̃_teacher) − 0.003·H
//             β: 0.30 × 0.93^iter 退火至下限 0.02（教师软化标签 ε=0.08）
//   Phase 2  三层评估：L1 教师对比 / L2 分歧胜率（Wilson 95% CI）/ 质量门
//   Phase 3  导出（质量门全过才写文件）
//
// 网络结构（ActorCritic，总参数 107 < 1000 硬约束）：
//   trunk  9→8  tanh（从 BC 版 NEURO_FLIGHT 反量化初始化 —— 行为克隆是初始化，不是上限）
//   policy 8→2  softmax（战/逃分布）
//   value  8→1  线性（GAE 基线，仅训练期存在，不导出）
//
// 零第三方依赖：手写 Adam / GAE(λ) / PPO clip / 梯度裁剪，风格对齐 train-neuro.ts。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { teacherFlight } from '../src/lib/game/policy';
import { NEURO_FLIGHT } from '../src/lib/game/neuro-weights';
import {
  mulberry32, runEpisode, FlightEnv, type FlightPolicy, type OpponentPolicy, type Outcome, OPPONENT_MIX,
} from './flight-env';

/** teacherFlight 适配器：策略签名参数逆变（number[]|Float32Array ← ArrayLike<number>）—— 断言安全：runEpisode 只传 Float32Array/number[] */
const teacherPolicy: FlightPolicy = (f) => teacherFlight(f as number[]);

// ============================ 超参（终版数值 —— 禁止「适当调整」） ============================
const SEED = 20260207; // 训练种子
const ITERATIONS = 240; // PPO 迭代数（v3：160 → 240；单迭代 ~40ms，全程 <15s）
const EPISODES_PER_ITER = 96; // 每迭代 rollout 局数（≈ 96 × ~120 决策步 ≈ 11.5k 决策步）
const GAMMA = 0.995; // 折扣（v2：v1 0.99 → 0.995 —— 200 步视野：击杀要在追击 47+攻击 14 步后兑现，短视野压倒长期收益）
const LAMBDA = 0.95; // GAE λ
const PPO_EPOCHS = 4; // 每批数据重用轮数
const MINIBATCH = 1024; // 决策步 minibatch
const LR = 2e-3; // Adam 学习率（v2：v1 3e-3 → 2e-3 更稳；107 参小网络仍属大 lr）
const ADAM_B1 = 0.9;
const ADAM_B2 = 0.999;
const ADAM_EPS = 1e-8;
const CLIP = 0.2; // PPO 裁剪宽度 ε
const VALUE_COEF = 0.5; // value loss 系数
const ANCHOR_BETA0 = 0.25; // KL 锚初值（对软化教师；v2：v1 0.3 → 0.25 给探索多一点空间）
const ANCHOR_DECAY = 0.97; // 每迭代 ×0.97（v2：v1 0.93 → 0.97 退火更慢）
const ANCHOR_MIN = 0.02; // β 下限（永不归零 —— 防灾难性遗忘的底线锚）
const TEACHER_SOFT = 0.92; // 教师软化标签 π̃[a_T]=0.92 / π̃[另一]=0.08
// v3 熵退火：BC 初始化的策略熵≈0（接近确定性）→ PPO 从未真正探索教师盲区。
// 前期强探索（0.015）给网络发现新策略的机会，×0.97^iter 退火至下限 0.002（后期收敛）。
const ENTROPY_COEF0 = 0.015;
const ENTROPY_DECAY = 0.97;
const ENTROPY_MIN = 0.002;
const GRAD_CLIP = 0.5; // 全局 L2 梯度裁剪
const EVAL_SEEDS = [11, 23, 37, 51, 89, 101, 137, 173, 211, 257]; // 固定评估种子集（素数 ×10）
const SCEN_PER_SEED = 300; // 每种子场景数 → 3000 配对局
const MINI_EVAL_EVERY = 8; // 每 8 迭代 mini 评估（500 配对局，跟踪分歧胜率曲线）
const MINI_EVAL_N = 500;
const BASELINE_N = 2000; // baseline 局数
// 质量门阈值
const GATE_DIV_WILSON_LO = 0.5; // ① 分歧胜率 Wilson 95% 下界 > 50%
const GATE_MUSTFLEE_AGREE = 0.9; // ② 必逃区（f0<0.3∧f2<0.35∧非巨怪∧非猎物在侧）网络一致率 ≥ 90%
const GATE_RETURN_RATIO = -0.02; // ③ L1 总 return ≥ teacher − 0.02
const GATE_COLLAPSE = 0.995; // ④ 塌缩检测：pFlee 落在灰区外的比例 < 99.5%

// ============================ RNG / 工具 ============================
type RNG = () => number;
const U = (r: RNG, a: number, b: number) => a + r() * (b - a);

function pickOpponent(r: RNG): OpponentPolicy {
  let v = r();
  for (const [o, w] of OPPONENT_MIX) {
    v -= w;
    if (v <= 0) return o;
  }
  return 'teacher';
}

/** Wilson 95% 置信区间 */
function wilson(pHat: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = pHat + z2 / (2 * n);
  const spread = z * Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n));
  return [(center - spread) / denom, (center + spread) / denom];
}

// ============================ ActorCritic（手写，107 参数） ============================
const N_IN = 9;
const N_H = 8;
class ActorCritic {
  w1 = new Float32Array(N_IN * N_H);
  b1 = new Float32Array(N_H);
  wpi = new Float32Array(N_H * 2);
  bpi = new Float32Array(2);
  wv = new Float32Array(N_H);
  bv = 0;
  // 前向 scratch
  hid = new Float32Array(N_H);
  logits = new Float32Array(2);
  p = new Float32Array(2); // softmax 战/逃分布
  v = 0;
  // 反传 scratch
  private d2 = new Float32Array(2);
  private dz = new Float32Array(N_H);
  // 梯度累加器
  gw1 = new Float32Array(N_IN * N_H);
  gb1 = new Float32Array(N_H);
  gwpi = new Float32Array(N_H * 2);
  gbpi = new Float32Array(2);
  gwv = new Float32Array(N_H);
  gbv = 0;
  // Adam 矩
  private params: Float32Array[] = [];
  private grads: Float32Array[] = [];
  private m: Float32Array[] = [];
  private vv: Float32Array[] = [];
  private adamT = 0;

  constructor(init?: { w1: Float32Array; b1: Float32Array; wpi: Float32Array; bpi: Float32Array }) {
    if (init) {
      // BC 初始化：trunk + policy 头来自行为克隆，value 头小随机
      this.w1.set(init.w1);
      this.b1.set(init.b1);
      this.wpi.set(init.wpi);
      this.bpi.set(init.bpi);
      const r = mulberry32(SEED ^ 0xac73);
      for (let i = 0; i < N_H; i++) this.wv[i] = U(r, -0.05, 0.05);
      this.bv = 0;
    } else {
      const r = mulberry32(SEED);
      const xav1 = Math.sqrt(6 / (N_IN + N_H));
      const xav2 = Math.sqrt(6 / (N_H + 2));
      for (let i = 0; i < this.w1.length; i++) this.w1[i] = U(r, -xav1, xav1);
      for (let i = 0; i < this.wpi.length; i++) this.wpi[i] = U(r, -xav2, xav2);
      for (let i = 0; i < N_H; i++) this.wv[i] = U(r, -0.05, 0.05);
    }
    this.params = [this.w1, this.b1, this.wpi, this.bpi, this.wv];
    this.grads = [this.gw1, this.gb1, this.gwpi, this.gbpi, this.gwv];
    this.m = this.params.map((p) => new Float32Array(p.length));
    this.vv = this.params.map((p) => new Float32Array(p.length));
  }

  /** 前向：填 hid / p（softmax）/ v。返回 p 供采样。 */
  forward(f: ArrayLike<number>): Float32Array {
    const { w1, b1, hid, wpi, bpi, wv } = this;
    for (let h = 0; h < N_H; h++) {
      let s = b1[h];
      for (let i = 0; i < N_IN; i++) s += f[i] * w1[i * N_H + h];
      hid[h] = Math.tanh(s);
    }
    for (let j = 0; j < 2; j++) {
      let s = bpi[j];
      for (let h = 0; h < N_H; h++) s += hid[h] * wpi[h * 2 + j];
      this.logits[j] = s;
    }
    const mx = Math.max(this.logits[0], this.logits[1]);
    const e0 = Math.exp(this.logits[0] - mx);
    const e1 = Math.exp(this.logits[1] - mx);
    this.p[0] = e0 / (e0 + e1);
    this.p[1] = e1 / (e0 + e1);
    let v = this.bv;
    for (let h = 0; h < N_H; h++) v += hid[h] * wv[h];
    this.v = v;
    return this.p;
  }

  /** 从当前分布采样（训练期探索） */
  sample(r: RNG): { a: number; logp: number } {
    const a = r() < this.p[0] ? 0 : 1;
    return { a, logp: Math.log(Math.max(1e-9, this.p[a])) };
  }

  /** 确定性 argmax（部署/评估） */
  argmax(f: ArrayLike<number>): number {
    this.forward(f);
    return this.p[1] > this.p[0] ? 1 : 0;
  }

  /** 反向累加单样本复合损失梯度：
   *  L = −min(ratio·Â, clip(ratio)·Â) + c1·(v−R)² + β·CE(π, π̃_T) − c_e·H(π)
   *  d_logits = ppoTerm·(δ_{a} − p) + β·(p − π̃) + c_e·p·(logp + H)   [ppoTerm=0 若 clip 激活]
   *  d_v      = (v − R)（c1=0.5 折进 2× 系数） */
  accumulate(
    f: ArrayLike<number>,
    a: number,
    logpOld: number,
    adv: number,
    retTarget: number,
    beta: number,
    teacherAction: number,
    entCoef: number,
  ) {
    this.forward(f); // 前向必须在 accumulate 前重跑（minibatch 复用网络）
    const p0 = this.p[0];
    const p1 = this.p[1];
    const logpNew = Math.log(Math.max(1e-9, a === 0 ? p0 : p1));
    const ratio = Math.exp(logpNew - logpOld);
    // PPO clip 激活判定
    const unclipped = ratio * adv;
    const clippedRatio = Math.max(1 - CLIP, Math.min(1 + CLIP, ratio));
    const clipped = clippedRatio * adv;
    const ppoActive = unclipped <= clipped ? 1 : 0; // 未触界才传梯度
    const ppoTerm = -adv * ratio * ppoActive;
    // KL 锚（对软化教师分布的交叉熵）：π̃[tA]=TEACHER_SOFT
    const tA = teacherAction;
    const ent = -(p0 * Math.log(Math.max(1e-9, p0)) + p1 * Math.log(Math.max(1e-9, p1)));
    this.d2[0] = ppoTerm * (a === 0 ? 1 - p0 : -p0) + beta * (p0 - (tA === 0 ? TEACHER_SOFT : 1 - TEACHER_SOFT)) + entCoef * p0 * (Math.log(Math.max(1e-9, p0)) + ent);
    this.d2[1] = ppoTerm * (a === 1 ? 1 - p1 : -p1) + beta * (p1 - (tA === 1 ? TEACHER_SOFT : 1 - TEACHER_SOFT)) + entCoef * p1 * (Math.log(Math.max(1e-9, p1)) + ent);
    const dV = this.v - retTarget; // 2 × VALUE_COEF × (v−R) = (v−R)
    // 输出层参数
    for (let j = 0; j < 2; j++) {
      const d = this.d2[j];
      this.gbpi[j] += d;
      for (let h = 0; h < N_H; h++) this.gwpi[h * 2 + j] += d * this.hid[h];
    }
    this.gbv += dV;
    for (let h = 0; h < N_H; h++) this.gwv[h] += dV * this.hid[h];
    // 隐层
    for (let h = 0; h < N_H; h++) {
      let s = this.d2[0] * this.wpi[h * 2] + this.d2[1] * this.wpi[h * 2 + 1] + dV * this.wv[h];
      s *= 1 - this.hid[h] * this.hid[h];
      this.dz[h] = s;
      if (s === 0) continue;
      this.gb1[h] += s;
      for (let i = 0; i < N_IN; i++) this.gw1[i * N_H + h] += s * f[i];
    }
    // 监控量
    return { ratio, klAnchor: p0 * Math.log(Math.max(1e-9, p0) / (tA === 0 ? TEACHER_SOFT : 1 - TEACHER_SOFT)) + p1 * Math.log(Math.max(1e-9, p1) / (tA === 1 ? TEACHER_SOFT : 1 - TEACHER_SOFT)), ent, vErr: Math.abs(dV) };
  }

  /** Adam 步（含全局 L2 梯度裁剪：grads 已是 batch 累加和，先 /batchScale 均值化再裁剪） */
  stepAdam(lr: number, batchScale: number) {
    let sq = this.gbv * this.gbv;
    for (const g of this.grads) for (let i = 0; i < g.length; i++) sq += g[i] * g[i];
    const norm = (Math.sqrt(sq) / batchScale) * batchScale; // = √Σg²（尚未均值化）
    const meanNorm = Math.sqrt(sq / (batchScale * batchScale)); // 均值梯度范数
    const clipScale = meanNorm > GRAD_CLIP ? GRAD_CLIP / meanNorm : 1;
    void norm;
    this.adamT++;
    const bc1 = 1 - Math.pow(ADAM_B1, this.adamT);
    const bc2 = 1 - Math.pow(ADAM_B2, this.adamT);
    for (let k = 0; k < this.params.length; k++) {
      const p = this.params[k];
      const g = this.grads[k];
      const m = this.m[k];
      const v = this.vv[k];
      for (let i = 0; i < p.length; i++) {
        const gi = (g[i] / batchScale) * clipScale;
        m[i] = ADAM_B1 * m[i] + (1 - ADAM_B1) * gi;
        v[i] = ADAM_B2 * v[i] + (1 - ADAM_B2) * gi * gi;
        p[i] -= (lr * (m[i] / bc1)) / (Math.sqrt(v[i] / bc2) + ADAM_EPS);
        g[i] = 0;
      }
    }
    const gi = (this.gbv / batchScale) * clipScale;
    this.mBv = ADAM_B1 * this.mBv + (1 - ADAM_B1) * gi;
    this.vBv = ADAM_B2 * this.vBv + (1 - ADAM_B2) * gi * gi;
    this.bv -= (lr * (this.mBv / bc1)) / (Math.sqrt(this.vBv / bc2) + ADAM_EPS);
    this.gbv = 0;
  }
  private mBv = 0;
  private vBv = 0;

  snapshot(): { w1: Float32Array; b1: Float32Array; wpi: Float32Array; bpi: Float32Array; wv: Float32Array; bv: number } {
    return {
      w1: new Float32Array(this.w1), b1: new Float32Array(this.b1),
      wpi: new Float32Array(this.wpi), bpi: new Float32Array(this.bpi),
      wv: new Float32Array(this.wv), bv: this.bv,
    };
  }
  restore(s: ReturnType<ActorCritic['snapshot']>) {
    this.w1.set(s.w1); this.b1.set(s.b1); this.wpi.set(s.wpi); this.bpi.set(s.bpi); this.wv.set(s.wv); this.bv = s.bv;
  }
}

// ============================ BC 权重加载（行为克隆 = 初始化） ============================
function deq(q: number[], s: number): Float32Array {
  const w = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) w[i] = q[i] * s;
  return w;
}
const BC_INIT = {
  w1: deq(NEURO_FLIGHT.w1q, NEURO_FLIGHT.sw1),
  b1: deq(NEURO_FLIGHT.b1q, NEURO_FLIGHT.sb1),
  wpi: deq(NEURO_FLIGHT.w2q, NEURO_FLIGHT.sw2),
  bpi: deq(NEURO_FLIGHT.b2q, NEURO_FLIGHT.sb2),
};
/** Task 36 行为克隆版策略（对照基线之一） */
const bcPolicy: FlightPolicy = (f) => {
  const hid = new Float32Array(N_H);
  for (let h = 0; h < N_H; h++) {
    let s = BC_INIT.b1[h];
    for (let i = 0; i < N_IN; i++) s += f[i] * BC_INIT.w1[i * N_H + h];
    hid[h] = Math.tanh(s);
  }
  const l0 = BC_INIT.bpi[0] + (hid[0] * BC_INIT.wpi[0] + hid[1] * BC_INIT.wpi[2] + hid[2] * BC_INIT.wpi[4] + hid[3] * BC_INIT.wpi[6] + hid[4] * BC_INIT.wpi[8] + hid[5] * BC_INIT.wpi[10] + hid[6] * BC_INIT.wpi[12] + hid[7] * BC_INIT.wpi[14]);
  const l1 = BC_INIT.bpi[1] + (hid[0] * BC_INIT.wpi[1] + hid[1] * BC_INIT.wpi[3] + hid[2] * BC_INIT.wpi[5] + hid[3] * BC_INIT.wpi[7] + hid[4] * BC_INIT.wpi[9] + hid[5] * BC_INIT.wpi[11] + hid[6] * BC_INIT.wpi[13] + hid[7] * BC_INIT.wpi[15]);
  return l1 > l0 ? 1 : 0;
};
const randomPolicy: FlightPolicy = () => Math.random() < 0.5 ? 0 : 1;

// ============================ 轨迹缓冲（semi-MDP：决策步序列） ============================
interface Traj {
  fs: Float32Array; // n×9 平铺
  as: Uint8Array;
  logps: Float32Array;
  vs: Float32Array;
  rs: Float32Array; // 决策 i 到下一决策间的奖励和
  dts: Uint16Array; // 决策 i 到 i+1 的环境步数
  rets: Float32Array; // GAE-λ 回报（value target）
  advs: Float32Array;
  n: number;
}
function newTraj(cap: number): Traj {
  return {
    fs: new Float32Array(cap * 9), as: new Uint8Array(cap), logps: new Float32Array(cap), vs: new Float32Array(cap),
    rs: new Float32Array(cap), dts: new Uint16Array(cap), rets: new Float32Array(cap), advs: new Float32Array(cap), n: 0,
  };
}
/** 采集一局（决策闭包内前向+采样+记录；段奖励 semi-MDP 归属） */
function collect(net: ActorCritic, seed: number, opponent: OpponentPolicy, rng: RNG, cap = 512): Traj {
  const traj = newTraj(cap);
  const env = new FlightEnv(seed);
  const policy: FlightPolicy = (f) => {
    net.forward(f);
    const { a, logp } = net.sample(rng);
    if (traj.n < cap) {
      traj.fs.set(f, traj.n * 9);
      traj.as[traj.n] = a;
      traj.logps[traj.n] = logp;
      traj.vs[traj.n] = net.v;
      traj.n++;
    }
    return a;
  };
  env.reset(policy, opponent);
  let segR = 0;
  let segSteps = 0;
  let lastIdx = -1;
  let done = false;
  while (!done) {
    const { r, done: d, decided } = env.stepEnv();
    if (decided) {
      // 新决策产生：上一段奖励归属上一决策
      if (lastIdx >= 0) {
        traj.rs[lastIdx] = segR;
        traj.dts[lastIdx] = segSteps;
      }
      segR = r;
      segSteps = 1;
      lastIdx = traj.n - 1;
    } else {
      segR += r;
      segSteps++;
    }
    if (d && lastIdx >= 0) {
      traj.rs[lastIdx] = segR;
      traj.dts[lastIdx] = segSteps;
    }
    done = d;
  }
  // GAE(λ)（semi-MDP 折扣 γ^dt）
  let adv = 0;
  for (let i = traj.n - 1; i >= 0; i--) {
    const last = i === traj.n - 1;
    const nextV = last ? 0 : traj.vs[i + 1]; // 局终 bootstrap 0
    const dt = last ? 1 : Math.max(1, traj.dts[i] || 1);
    const g = Math.pow(GAMMA, dt);
    const delta = traj.rs[i] + g * nextV - traj.vs[i];
    adv = delta + g * LAMBDA * adv;
    traj.advs[i] = adv;
    traj.rets[i] = adv + traj.vs[i];
  }
  return traj;
}

// ============================ 评估器 ============================
interface L1Stats {
  ret: number;
  killRate: number;
  escapeRate: number;
  deathRate: number;
  starveRate: number;
  timeoutRate: number;
  survivalRate: number;
  avgKills: number;
  n: number;
}
function evalL1(policy: FlightPolicy, n: number, seedBase: number): L1Stats {
  let ret = 0;
  const outc: Record<Outcome, number> = { kill: 0, escape: 0, timeout: 0, killed: 0, starved: 0 };
  let kills = 0;
  for (let i = 0; i < n; i++) {
    const seed = seedBase + i;
    const r = mulberry32(seed ^ 0x9e3779b9);
    const opp = pickOpponent(r);
    const res = runEpisode(seed, policy, opp);
    ret += res.totalReturn;
    outc[res.outcome]++;
    kills += res.kills;
  }
  return {
    ret: ret / n,
    killRate: outc.kill / n,
    escapeRate: outc.escape / n,
    deathRate: outc.killed / n,
    starveRate: outc.starved / n,
    timeoutRate: outc.timeout / n,
    survivalRate: 1 - outc.killed / n - outc.starved / n,
    avgKills: kills / n,
    n,
  };
}

interface DivStats {
  win: number;
  lose: number;
  tie: number;
  divN: number;
  divWin: number;
  divLose: number;
  divTie: number;
  divRate: number; // 分歧率（全部局中发生分歧的比例）
  winRate: number; // 分歧胜率 = divWin/(divWin+divLose)
  wilsonLo: number;
  wilsonHi: number;
  /** 必逃区一致率（灾难性遗忘检查） */
  mustFleeAgree: number;
  mustFleeN: number;
  /** 塌缩检查：灰区（pFlee∈[0.02,0.98]）占比 */
  grayRate: number;
}
/** L2 分歧胜率：配对局（同种子同对手）+ 分歧判定（网络轨迹上复盘教师动作） */
function evalDivergence(net: ActorCritic, nPairs: number, seedBase: number): DivStats {
  const netPolicy: FlightPolicy = (f) => net.argmax(f);
  const s: DivStats = { win: 0, lose: 0, tie: 0, divN: 0, divWin: 0, divLose: 0, divTie: 0, divRate: 0, winRate: 0.5, wilsonLo: 0, wilsonHi: 1, mustFleeAgree: 1, mustFleeN: 0, grayRate: 0 };
  let mustFleeAgree = 0;
  let gray = 0;
  let decisions = 0;
  for (let i = 0; i < nPairs; i++) {
    const seed = seedBase + i;
    const r = mulberry32(seed ^ 0x9e3779b9);
    const opp = pickOpponent(r);
    const resN = runEpisode(seed, netPolicy, opp);
    const resT = runEpisode(seed, teacherPolicy, opp);
    const better = resN.rankScore > resT.rankScore + 1e-9;
    const worse = resN.rankScore < resT.rankScore - 1e-9;
    if (better) s.win++;
    else if (worse) s.lose++;
    else s.tie++;
    // 分歧判定 + 必逃区/灰区统计（沿网络局轨迹）
    let diverged = false;
    for (const rec of resN.obsLog) {
      const netA = net.argmax(rec.f);
      const tA = teacherFlight(rec.f);
      if (netA !== tA) diverged = true;
      decisions++;
      net.forward(rec.f);
      const pFlee = net.p[1];
      if (pFlee >= 0.02 && pFlee <= 0.98) gray++;
      // 必逃区：非巨怪 ∧ 非猎物在侧 ∧ hp<0.3 ∧ pow<0.35（教师规则第三分支第一条件）
      if (rec.f[7] <= 0.5 && rec.f[5] <= 0.5 && rec.f[0] < 0.3 && rec.f[2] < 0.35) {
        s.mustFleeN++;
        if (tA === 1 && netA === 1) mustFleeAgree++;
      }
    }
    if (diverged) {
      s.divN++;
      if (better) s.divWin++;
      else if (worse) s.divLose++;
      else s.divTie++;
    }
  }
  s.divRate = s.divN / nPairs;
  const dn = s.divWin + s.divLose;
  s.winRate = dn > 0 ? s.divWin / dn : 0.5;
  const [lo, hi] = wilson(s.winRate, dn);
  s.wilsonLo = lo;
  s.wilsonHi = hi;
  s.mustFleeAgree = s.mustFleeN > 0 ? mustFleeAgree / s.mustFleeN : 1;
  s.grayRate = decisions > 0 ? gray / decisions : 0;
  return s;
}

// ============================ Phase 0：baseline ============================
console.log('══════════ Task 37 · 战或逃头 PPO 强化微调（路径B：超越教师） ══════════');
console.log(`种子 ${SEED} · 微环境 = engine.ts 战斗动力学忠实移植 · 网络 9→8→{2,1} 共 107 参数\n`);
const t0 = Date.now();

console.log('—— Phase 0 · baseline（2000 局/策略，对手池混采 45/25/20/10） ——');
const BASE_SEED = 777000;
const baseTeacher = evalL1(teacherPolicy, BASELINE_N, BASE_SEED);
const baseBc = evalL1(bcPolicy, BASELINE_N, BASE_SEED);
const baseRandom = evalL1(randomPolicy, BASELINE_N, BASE_SEED);
const fmtL1 = (name: string, s: L1Stats) =>
  `${name.padEnd(9)} return=${s.ret.toFixed(3)}  击杀率=${(s.killRate * 100).toFixed(1)}%  逃脱率=${(s.escapeRate * 100).toFixed(1)}%  存活率=${(s.survivalRate * 100).toFixed(1)}%  被杀=${(s.deathRate * 100).toFixed(1)}%  饿死=${(s.starveRate * 100).toFixed(1)}%  场均击杀=${s.avgKills.toFixed(2)}`;
console.log(fmtL1('teacher', baseTeacher));
console.log(fmtL1('bc', baseBc));
console.log(fmtL1('random', baseRandom));

// ============================ Phase 1：PPO 训练 ============================
console.log('\n—— Phase 1 · PPO 训练（BC 初始化 → KL 锚退火 → 分歧胜率择优） ——');
const net = new ActorCritic(BC_INIT);
const rng = mulberry32(SEED);
let beta = ANCHOR_BETA0;
let entCoef = ENTROPY_COEF0;
let bestDivLo = -1;
let bestSnap = net.snapshot();
let bestIter = -1;
const curve: { iter: number; ret: number; divWinRate: number; divN: number }[] = [];

for (let iter = 1; iter <= ITERATIONS; iter++) {
  // —— rollout ——
  const trajs: Traj[] = [];
  for (let e = 0; e < EPISODES_PER_ITER; e++) {
    const seed = (rng() * 2 ** 31) | 0;
    const opp = pickOpponent(rng);
    trajs.push(collect(net, seed, opp, rng));
  }
  // —— 优势标准化 ——
  let mu = 0;
  let cnt = 0;
  for (const t of trajs) {
    for (let i = 0; i < t.n; i++) {
      mu += t.advs[i];
      cnt++;
    }
  }
  mu /= Math.max(1, cnt);
  let sq = 0;
  for (const t of trajs) for (let i = 0; i < t.n; i++) sq += (t.advs[i] - mu) ** 2;
  const sigma = Math.sqrt(sq / Math.max(1, cnt)) + 1e-8;
  for (const t of trajs) for (let i = 0; i < t.n; i++) t.advs[i] = (t.advs[i] - mu) / sigma;
  // —— 展平索引 ——
  const flat: { t: number; i: number }[] = [];
  for (let ti = 0; ti < trajs.length; ti++) for (let i = 0; i < trajs[ti].n; i++) flat.push({ t: ti, i });
  // —— PPO epochs ——
  let klSum = 0;
  let entSum = 0;
  let vErrSum = 0;
  let clipFrac = 0;
  let samples = 0;
  for (let ep = 0; ep < PPO_EPOCHS; ep++) {
    // 洗牌
    for (let i = flat.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [flat[i], flat[j]] = [flat[j], flat[i]];
    }
    for (let b = 0; b < flat.length; b += MINIBATCH) {
      const end = Math.min(flat.length, b + MINIBATCH);
      const bs = end - b;
      for (let k = b; k < end; k++) {
        const { t: ti, i } = flat[k];
        const T = trajs[ti];
        const off = i * 9;
        const fView = T.fs.subarray(off, off + 9);
        const mon = net.accumulate(fView, T.as[i], T.logps[i], T.advs[i], T.rets[i], beta, teacherFlight(fView), entCoef);
        klSum += mon.klAnchor;
        entSum += mon.ent;
        vErrSum += mon.vErr;
        if (mon.ratio > 1 + CLIP || mon.ratio < 1 - CLIP) clipFrac++;
        samples++;
      }
      net.stepAdam(LR, bs);
    }
  }
  const retMean = trajs.reduce((a, t) => a + (t.n > 0 ? t.rets[0] : 0), 0) / trajs.length; // 首决策回报近似局回报
  // —— mini 评估（每 MINI_EVAL_EVERY 迭代） ——
  if (iter % MINI_EVAL_EVERY === 0 || iter === ITERATIONS) {
    const ds = evalDivergence(net, MINI_EVAL_N, 900000 + iter * 1000);
    curve.push({ iter, ret: retMean, divWinRate: ds.winRate, divN: ds.divWin + ds.divLose });
    console.log(
      `  iter ${String(iter).padStart(2)}/${ITERATIONS}  β=${beta.toFixed(3)}  ret≈${retMean.toFixed(2)}  KL锚=${(klSum / samples).toFixed(3)}  H=${(entSum / samples).toFixed(3)}  vErr=${(vErrSum / samples).toFixed(2)}  clip%=${((clipFrac / samples) * 100).toFixed(0)}`,
    );
    console.log(
      `    mini分歧评估: 分歧率=${(ds.divRate * 100).toFixed(0)}%  分歧胜率=${(ds.winRate * 100).toFixed(1)}% (W ${(ds.wilsonLo * 100).toFixed(1)}~${(ds.wilsonHi * 100).toFixed(1)}%, n=${ds.divWin + ds.divLose})  必逃区一致=${(ds.mustFleeAgree * 100).toFixed(0)}%  灰区=${(ds.grayRate * 100).toFixed(1)}%`,
    );
    if (ds.wilsonLo > bestDivLo) {
      bestDivLo = ds.wilsonLo;
      bestSnap = net.snapshot();
      bestIter = iter;
    }
  } else if (iter % 4 === 0) {
    console.log(`  iter ${String(iter).padStart(2)}/${ITERATIONS}  β=${beta.toFixed(3)}  ret≈${retMean.toFixed(2)}  KL锚=${(klSum / samples).toFixed(3)}  H=${(entSum / samples).toFixed(3)}  vErr=${(vErrSum / samples).toFixed(2)}  clip%=${((clipFrac / samples) * 100).toFixed(0)}`);
  }
  beta = Math.max(ANCHOR_MIN, beta * ANCHOR_DECAY);
  entCoef = Math.max(ENTROPY_MIN, entCoef * ENTROPY_DECAY);
}
console.log(`  训练完成：${ITERATIONS} 迭代 × ${EPISODES_PER_ITER} 局（${((Date.now() - t0) / 1000).toFixed(0)}s）· 最优快照 @iter ${bestIter}（mini Wilson 下界 ${(bestDivLo * 100).toFixed(1)}%）`);
net.restore(bestSnap);

// ============================ Phase 2：三层评估（固定种子集 3000 配对局） ============================
console.log('\n—— Phase 2 · 三层评估（L1 教师对比 / L2 分歧胜率 / 质量门） ——');
const EVAL_BASE = 424242;
const rlPolicy: FlightPolicy = (f) => net.argmax(f);
const l1Teacher = evalL1(teacherPolicy, SCEN_PER_SEED * EVAL_SEEDS.length, EVAL_BASE);
const l1Rl = evalL1(rlPolicy, SCEN_PER_SEED * EVAL_SEEDS.length, EVAL_BASE);
console.log(fmtL1('teacher', l1Teacher));
console.log(fmtL1('rl', l1Rl));
// 对手池分桶（过拟合检查）
for (const opp of ['teacher', 'aggressive', 'random', 'coward'] as OpponentPolicy[]) {
  let w = 0;
  let l = 0;
  for (let i = 0; i < SCEN_PER_SEED * 2; i++) {
    const seed = EVAL_BASE + 7000000 + i;
    const resN = runEpisode(seed, rlPolicy, opp);
    const resT = runEpisode(seed, teacherPolicy, opp);
    if (resN.rankScore > resT.rankScore + 1e-9) w++;
    else if (resN.rankScore < resT.rankScore - 1e-9) l++;
  }
  console.log(`  对手=${opp.padEnd(10)} 净胜=${w}/${w + l}（${((w / Math.max(1, w + l)) * 100).toFixed(1)}%）`);
}
const div = evalDivergence(net, SCEN_PER_SEED * EVAL_SEEDS.length, EVAL_BASE);
console.log(
  `  L2 分歧评估（${SCEN_PER_SEED * EVAL_SEEDS.length} 配对局）: 分歧率=${(div.divRate * 100).toFixed(1)}%  分歧局 n=${div.divN}\n` +
    `     分歧胜率 = ${(div.winRate * 100).toFixed(2)}%  Wilson95 [${(div.wilsonLo * 100).toFixed(2)}%, ${(div.wilsonHi * 100).toFixed(2)}%]  (win=${div.divWin} lose=${div.divLose} tie=${div.divTie})\n` +
    `     必逃区一致率 = ${(div.mustFleeAgree * 100).toFixed(1)}%（n=${div.mustFleeN}）  灰区占比 = ${(div.grayRate * 100).toFixed(1)}%`,
);

// —— 质量门 ——
const gates = [
  { name: `① 分歧胜率 Wilson 下界 ${(div.wilsonLo * 100).toFixed(1)}% > ${GATE_DIV_WILSON_LO * 100}%`, pass: div.wilsonLo > GATE_DIV_WILSON_LO },
  { name: `② 必逃区一致率 ${(div.mustFleeAgree * 100).toFixed(1)}% ≥ ${GATE_MUSTFLEE_AGREE * 100}%（防灾难性遗忘）`, pass: div.mustFleeAgree >= GATE_MUSTFLEE_AGREE },
  { name: `③ L1 return ${l1Rl.ret.toFixed(3)} ≥ teacher ${l1Teacher.ret.toFixed(3)} ${GATE_RETURN_RATIO}（不显著劣化）`, pass: l1Rl.ret >= l1Teacher.ret + GATE_RETURN_RATIO },
  { name: `④ 无策略塌缩（灰区 ${(div.grayRate * 100).toFixed(1)}%，${div.grayRate >= 1 - GATE_COLLAPSE ? '≥0.5%' : '<0.5% 报警'}）`, pass: div.grayRate >= 1 - GATE_COLLAPSE },
];
console.log('\n—— 质量门 ——');
for (const g of gates) console.log(`  ${g.pass ? '✓' : '✗'} ${g.name}`);
const allPass = gates.every((g) => g.pass);

if (!allPass) {
  console.error('\n✗ 质量门未全部通过 —— 拒绝导出（迭代决策树：45-55% 调参重训 / <45% 回退教师，本模型不接入引擎）');
  process.exit(1);
}
console.log('\n✓ 质量门全部通过 —— RL 权重将导出为引擎 flight 头新默认（分歧胜率证明在分歧处网络长期优于教师）');

// ============================ Phase 3：导出 ============================
function quantizeArr(w: Float32Array): { arr: number[]; s: number } {
  let mx = 0;
  for (let i = 0; i < w.length; i++) mx = Math.max(mx, Math.abs(w[i]));
  const s = mx / 127 || 1e-9;
  const arr: number[] = new Array(w.length);
  for (let i = 0; i < w.length; i++) arr[i] = Math.round(w[i] / s);
  return { arr, s };
}
// 量化复检（分歧胜率在量化后重跑 mini 版，确保 Int8 不毁掉 RL 收益）
const qw1 = quantizeArr(net.w1);
const qb1 = quantizeArr(net.b1);
const qwpi = quantizeArr(net.wpi);
const qbpi = quantizeArr(net.bpi);
// 量化复检：Int8 后分歧胜率必须仍在门内（量化不毁 RL 收益）
const qNet = new ActorCritic();
qNet.w1.set(deq(qw1.arr, qw1.s));
qNet.b1.set(deq(qb1.arr, qb1.s));
qNet.wpi.set(deq(qwpi.arr, qwpi.s));
qNet.bpi.set(deq(qbpi.arr, qbpi.s));
const qDivCheck = evalDivergence(qNet, 1500, EVAL_BASE + 5000000);
console.log(`  Int8 量化复检：分歧胜率 ${(qDivCheck.winRate * 100).toFixed(2)}% (W ${(qDivCheck.wilsonLo * 100).toFixed(1)}~${(qDivCheck.wilsonHi * 100).toFixed(1)}%)  必逃区一致 ${(qDivCheck.mustFleeAgree * 100).toFixed(0)}%`);
if (qDivCheck.wilsonLo <= 0.5) {
  console.error('✗ 量化后分歧胜率下界跌破 50% —— 拒绝导出');
  process.exit(1);
}

const f = (arr: number[]) => `[${arr.join(',')}]`;
const src = `// ══════════════════════════════════════════════════════════════════
// ⚠ AUTO-GENERATED by scripts/train-flight-ppo.ts — DO NOT EDIT BY HAND
// 战或逃头 RL 强化学习版权重（路径B：BC 初始化 → PPO 微调 → 分歧胜率验证）
// 训练：${ITERATIONS} PPO 迭代 × ${EPISODES_PER_ITER} 局/迭代 · KL 锚退火 ${ANCHOR_BETA0}→${ANCHOR_MIN} · 种子 ${SEED}
// 参数：107（trunk 9→8 + policy 8→2 + value 8→1 仅训练期；导出策略部分 98）
// 结果（${SCEN_PER_SEED * EVAL_SEEDS.length} 配对局，固定种子集）：
//   L1  return=${l1Rl.ret.toFixed(3)}（teacher ${l1Teacher.ret.toFixed(3)}）· 击杀率 ${(l1Rl.killRate * 100).toFixed(1)}%（teacher ${(l1Teacher.killRate * 100).toFixed(1)}%）· 存活率 ${(l1Rl.survivalRate * 100).toFixed(1)}%（teacher ${(l1Teacher.survivalRate * 100).toFixed(1)}%）
//   L2  分歧率 ${(div.divRate * 100).toFixed(1)}% · 分歧胜率 ${(div.winRate * 100).toFixed(2)}% · Wilson95 [${(div.wilsonLo * 100).toFixed(2)}%, ${(div.wilsonHi * 100).toFixed(2)}%]（win=${div.divWin} lose=${div.divLose}）
//   门  必逃区一致 ${(div.mustFleeAgree * 100).toFixed(1)}% · 灰区 ${(div.grayRate * 100).toFixed(1)}% · 量化复检分歧胜率 ${(qDivCheck.winRate * 100).toFixed(2)}%
// 训练时间：${new Date().toISOString()}
// ══════════════════════════════════════════════════════════════════
import type { NeuroHeadSpec } from './neuro-weights';

export const NEURO_FLIGHT_RL: NeuroHeadSpec = {
  arch: [9, 8, 2],
  w1q: ${f(qw1.arr)},
  b1q: ${f(qb1.arr)},
  w2q: ${f(qwpi.arr)},
  b2q: ${f(qbpi.arr)},
  sw1: ${qw1.s.toPrecision(6)}, sb1: ${qb1.s.toPrecision(6)}, sw2: ${qwpi.s.toPrecision(6)}, sb2: ${qbpi.s.toPrecision(6)},
};

export const NEURO_FLIGHT_RL_META = {
  trainedAt: ${JSON.stringify(new Date().toISOString())},
  seed: ${SEED},
  iterations: ${ITERATIONS},
  episodesPerIter: ${EPISODES_PER_ITER},
  paramsTotal: 107,
  paramsExported: 98,
  // L2 分歧胜率（核心超越证据）
  divWinRate: ${div.winRate.toFixed(4)},
  divWilsonLo: ${div.wilsonLo.toFixed(4)},
  divWilsonHi: ${div.wilsonHi.toFixed(4)},
  divWin: ${div.divWin},
  divLose: ${div.divLose},
  divRate: ${div.divRate.toFixed(4)},
  evalPairs: ${SCEN_PER_SEED * EVAL_SEEDS.length},
  // L1
  rlReturn: ${l1Rl.ret.toFixed(4)},
  teacherReturn: ${l1Teacher.ret.toFixed(4)},
  rlKillRate: ${l1Rl.killRate.toFixed(4)},
  teacherKillRate: ${l1Teacher.killRate.toFixed(4)},
  rlSurvival: ${l1Rl.survivalRate.toFixed(4)},
  teacherSurvival: ${l1Teacher.survivalRate.toFixed(4)},
  // 质量门
  mustFleeAgree: ${div.mustFleeAgree.toFixed(4)},
  grayRate: ${div.grayRate.toFixed(4)},
  quantDivWinRate: ${qDivCheck.winRate.toFixed(4)},
  bestIter: ${bestIter},
  curve: [${curve.map((c) => `{i:${c.iter},w:${+c.divWinRate.toFixed(3)},n:${c.divN}}`).join(',')}],
} as const;
`;
const outPath = join(process.cwd(), 'src', 'lib', 'game', 'neuro-flight-rl.ts');
writeFileSync(outPath, src);
console.log(`\n✓ RL 权重已写出：${outPath}`);
console.log(`  总耗时 ${((Date.now() - t0) / 1000).toFixed(0)}s · baseline→训练→三层评估→量化复检→导出 一条龙`);
