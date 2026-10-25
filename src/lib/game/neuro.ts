// ============ NeuroCore：微型神经决策核心（运行时推理） ============
// 「很小但很强」：465 参数三头 MLP（Int8 量化权重，加载时反量化 Float32），
// 推理 0.2-0.36 µs/次，零分配前向（模块级 scratch），替代引擎三类热路径判定：
//   ① 近战命中概率（原 12 分支命中链）
//   ② 战斗姿态：追击/坚守/风筝/脱离（原硬编码阈值 + 新增伤重脱离）
//   ③ 野生动物战或逃（原默认死战到底 → 重伤劣势脱离）
// 关闭时自动回退 policy.ts 教师策略（A/B 对照）；开启时按质数周期采样审计
// 网络输出与教师的一致率（运行时漂移监测）。
import { NEURO_ACC, NEURO_STANCE, NEURO_FLIGHT, NEURO_META, type NeuroHeadSpec } from './neuro-weights';
import { NEURO_FLIGHT_RL, NEURO_FLIGHT_RL_META } from './neuro-flight-rl';
import { teacherAcc, teacherStance, teacherFlight } from './policy';

interface RTHead {
  nIn: number;
  nH: number;
  nOut: number;
  w1: Float32Array; // [i*nH+h]
  b1: Float32Array;
  w2: Float32Array; // [h*nOut+j]
  b2: Float32Array;
  hid: Float32Array;
  out: Float32Array;
}

function dequantize(spec: NeuroHeadSpec): RTHead {
  const [nIn, nH, nOut] = spec.arch;
  const dq = (q: number[], s: number) => {
    const w = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) w[i] = q[i] * s;
    return w;
  };
  return {
    nIn,
    nH,
    nOut,
    w1: dq(spec.w1q, spec.sw1),
    b1: dq(spec.b1q, spec.sb1),
    w2: dq(spec.w2q, spec.sw2),
    b2: dq(spec.b2q, spec.sb2),
    hid: new Float32Array(nH),
    out: new Float32Array(nOut),
  };
}

const H_ACC = dequantize(NEURO_ACC);
const H_STANCE = dequantize(NEURO_STANCE);
const H_FLIGHT = dequantize(NEURO_FLIGHT);

// —— Task 38：RL flight 头权重可热替换（在线局后训练上线/回滚的原子切换点）——
//   初始 = 离线导出权重；在线训练评估门通过后 setFlightRLWeights() 原子替换引用（同步瞬时，无中断）
let flightRLHead: RTHead = dequantize(NEURO_FLIGHT_RL);

// —— Stage 2（wbbatch）：权重版本号（热换/重置递增；桥接按版本重打包 WASM 镜像）——
export let neuroWeightsVersion = 1;
function bumpWeightsVersion() { neuroWeightsVersion++; }
/** 三头 + RL 头的权重快照（Float32Array 引用；供 WASM 桥接打包） */
export function neuroHeadsSnapshot() {
  return { version: neuroWeightsVersion, acc: H_ACC, stance: H_STANCE, flight: H_FLIGHT, rl: flightRLHead };
}

/** 在线训练权重包（与 NeuroHeadSpec 反量化后的布局一致：w1[9×8] b1[8] w2[8×2] b2[2]） */
export interface FlightWeights {
  w1: Float32Array;
  b1: Float32Array;
  w2: Float32Array;
  b2: Float32Array;
}

/** 原子替换 RL flight 头权重（在线训练上线/快照回滚共用；同步引用赋值，引擎无感） */
export function setFlightRLWeights(w: FlightWeights): boolean {
  bumpWeightsVersion();
  // 范围/NaN 校验：坏权重拒绝上线（评估门第①道）
  const chk = (a: Float32Array) => {
    for (let i = 0; i < a.length; i++) {
      const v = a[i];
      if (!Number.isFinite(v) || Math.abs(v) > 50) return false;
    }
    return true;
  };
  if (!chk(w.w1) || !chk(w.b1) || !chk(w.w2) || !chk(w.b2)) return false;
  const h = flightRLHead;
  if (h.w1.length !== w.w1.length || h.b1.length !== w.b1.length || h.w2.length !== w.w2.length || h.b2.length !== w.b2.length) return false;
  h.w1.set(w.w1);
  h.b1.set(w.b1);
  h.w2.set(w.w2);
  h.b2.set(w.b2);
  return true;
}

/** 导出当前 RL flight 头权重拷贝（快照/localStorage 持久化/Worker 增量起点共用） */
export function getFlightRLWeights(): FlightWeights {
  const h = flightRLHead;
  return { w1: h.w1.slice(), b1: h.b1.slice(), w2: h.w2.slice(), b2: h.b2.slice() };
}

/** 重置为离线导出权重（版本指纹不匹配时丢弃在线增量） */
export function resetFlightRLWeights() {
  bumpWeightsVersion();
  flightRLHead = dequantize(NEURO_FLIGHT_RL);
}

// —— flight 头策略源：Task 37 路径B ——
//   'bc' = Task 36 行为克隆版（教师的分段线性近似，一致率 99%+）
//   'rl' = PPO 强化学习版（在教师初始化上超越：分歧处长期优于教师，分歧胜率 57.5%）
export type FlightMode = 'bc' | 'rl';

/** 前向（无激活；结果写入 head.out 并返回） */
function fwd(h: RTHead, f: ArrayLike<number>): Float32Array {
  const { nIn, nH, w1, b1, w2, b2, hid, out } = h;
  for (let t = 0; t < nH; t++) {
    let s = b1[t];
    for (let i = 0; i < nIn; i++) s += f[i] * w1[i * nH + t];
    hid[t] = Math.tanh(s);
  }
  for (let j = 0; j < out.length; j++) {
    let s = b2[j];
    for (let t = 0; t < nH; t++) s += hid[t] * w2[t * out.length + j];
    out[j] = s;
  }
  return out;
}

// —— 特征 scratch（单线程引擎：模块级复用，零分配热路径） ——
export const F_ACC: number[] = new Array(10);
export const F_STANCE: number[] = new Array(12);
export const F_FLIGHT: number[] = new Array(9);

// —— 运行统计（面板 1s 轮询） ——
export const neuroStats = {
  enabled: true,
  /** flight 头策略源：'rl' = PPO 强化学习版（新默认）；'bc' = 行为克隆版 */
  flightMode: 'rl' as FlightMode,
  /** 三头累计调用数 */
  calls: [0, 0, 0],
  /** 采样计时的次数与累计 ns（每 61 次采 1 次） */
  timed: [0, 0, 0],
  ns: [0, 0, 0],
  /** 一致率审计（每 97 次审 1 次：网络输出 vs 教师）
   *  注意：flight 头在 'rl' 模式下该指标语义为「与教师分歧率」—— 分歧是特性不是 bug */
  audits: [0, 0, 0],
  agree: [0, 0, 0],
};

const AUDIT_EVERY = 97;
const TIME_EVERY = 61;
const TIME_LOOP = 32; // 采样时循环前向的次数（performance.now 精度 ~5µs，量不出 0.3µs 单次 → 均摊）
let seq = 0;

/** 采样计时：循环 TIME_LOOP 次前向取均摊 µs（避免时钟分辨率地板） */
function timedFwd(h: RTHead, f: ArrayLike<number>): number {
  const t0 = performance.now();
  for (let i = 0; i < TIME_LOOP; i++) fwd(h, f);
  return ((performance.now() - t0) * 1000) / TIME_LOOP;
}

export function setNeuroEnabled(v: boolean) {
  neuroStats.enabled = v;
}

/** flight 头策略源切换（BC 克隆 ↔ RL 强化）：面板与 QA 共用 */
export function setFlightMode(m: FlightMode) {
  neuroStats.flightMode = m;
}

/** ① 近战命中概率（sigmoid 输出 [0,1]；引擎侧再钳制 0.35..0.97） */
export function neuroAcc(f: ArrayLike<number>): number {
  if (!neuroStats.enabled) return teacherAcc(f as number[]);
  const s = neuroStats;
  s.calls[0]++;
  seq++;
  const doTime = seq % TIME_EVERY === 0;
  const p = 1 / (1 + Math.exp(-fwd(H_ACC, f)[0]));
  if (doTime) {
    s.timed[0]++;
    s.ns[0] += timedFwd(H_ACC, f);
  }
  if (seq % AUDIT_EVERY === 0) {
    s.audits[0]++;
    if (Math.abs(p - teacherAcc(f as number[])) <= 0.02) s.agree[0]++;
  }
  return p;
}

/** ② 战斗姿态：0 追击接敌 / 1 原地坚守 / 2 且战且退 / 3 伤重脱离 */
export function neuroStance(f: ArrayLike<number>): number {
  if (!neuroStats.enabled) return teacherStance(f as number[]);
  const s = neuroStats;
  s.calls[1]++;
  seq++;
  const doTime = seq % TIME_EVERY === 0;
  const o = fwd(H_STANCE, f);
  if (doTime) {
    s.timed[1]++;
    s.ns[1] += timedFwd(H_STANCE, f);
  }
  let best = 0;
  for (let j = 1; j < o.length; j++) if (o[j] > o[best]) best = j;
  if (seq % AUDIT_EVERY === 0) {
    s.audits[1]++;
    if (best === teacherStance(f as number[])) s.agree[1]++;
  }
  return best;
}

/** 最近一次 neuroFlight 调用的 softmax 对数概率（在线采集 PPO importance 比率用；零分配） */
export const flightLastLogp = new Float32Array(2);

/** ③ 战或逃：0 死战 / 1 脱离 —— Task 37：RL 强化学习版为默认（分歧胜率 57.5% 超越教师） */
export function neuroFlight(f: ArrayLike<number>): number {
  if (!neuroStats.enabled) return teacherFlight(f as number[]);
  const s = neuroStats;
  const head = s.flightMode === 'rl' ? flightRLHead : H_FLIGHT;
  s.calls[2]++;
  seq++;
  const doTime = seq % TIME_EVERY === 0;
  const o = fwd(head, f);
  // softmax（在线采集需要 π(a|s) —— 离线导出的 logits 直接归一）
  const m = Math.max(o[0], o[1]);
  const e0 = Math.exp(o[0] - m);
  const e1 = Math.exp(o[1] - m);
  const z = e0 + e1;
  flightLastLogp[0] = Math.log(e0 / z);
  flightLastLogp[1] = Math.log(e1 / z);
  if (doTime) {
    s.timed[2]++;
    s.ns[2] += timedFwd(head, f);
  }
  const best = o[1] > o[0] ? 1 : 0;
  if (seq % AUDIT_EVERY === 0) {
    s.audits[2]++;
    if (best === teacherFlight(f as number[])) s.agree[2]++;
  }
  return best;
}

/** 面板快照（含训练期验证指标与实时统计） */
export interface NeuroHeadInfo {
  key: 'acc' | 'stance' | 'flight';
  name: string;
  desc: string;
  arch: string;
  params: number;
  valText: string;
  calls: number;
  usPerCall: number;
  auditPct: number;
  audits: number;
}
export interface NeuroSnapshot {
  enabled: boolean;
  totalParams: number;
  trainedAt: string;
  bench: { acc: number; stance: number; flight: number };
  heads: NeuroHeadInfo[];
  /** Task 37：flight 头策略源与 RL 超越证据 */
  flightMode: 'bc' | 'rl';
  flightRL: {
    divWinRate: number;
    divWilsonLo: number;
    divWilsonHi: number;
    divWin: number;
    divLose: number;
    /** 分歧率（与教师不同决策的占比 —— 分歧是探索出来的增量策略） */
    divRate: number;
    rlReturn: number;
    teacherReturn: number;
    rlSurvival: number;
    teacherSurvival: number;
    mustFleeAgree: number;
    grayRate: number;
    bestIter: number;
    iterations: number;
    /** mini 评估曲线（每 8 迭代一次：{i,w,n} = 迭代/分歧胜率/样本数） */
    curve: readonly { i: number; w: number; n: number }[];
  };
}

export function neuroSnapshot(): NeuroSnapshot {
  const s = neuroStats;
  const mk = (key: NeuroHeadInfo['key'], i: number, name: string, desc: string, valText: string): NeuroHeadInfo => {
    const arch = key === 'acc' ? NEURO_ACC.arch : key === 'stance' ? NEURO_STANCE.arch : NEURO_FLIGHT.arch;
    return {
      key,
      name,
      desc,
      arch: `${arch[0]}→${arch[1]}→${arch[2]}`,
      params: arch[0] * arch[1] + arch[1] + arch[1] * arch[2] + arch[2],
      valText,
      calls: s.calls[i],
      usPerCall: s.timed[i] > 0 ? s.ns[i] / s.timed[i] : 0,
      auditPct: s.audits[i] > 0 ? (s.agree[i] / s.audits[i]) * 100 : 100,
      audits: s.audits[i],
    };
  };
  const M = NEURO_FLIGHT_RL_META;
  const flightVal =
    s.flightMode === 'rl'
      ? `RL 分歧胜率 ${(M.divWinRate * 100).toFixed(1)}% · W下界 ${(M.divWilsonLo * 100).toFixed(1)}%`
      : `一致率 ${(NEURO_META.val.flight.agree * 100).toFixed(1)}%`;
  return {
    enabled: s.enabled,
    totalParams: NEURO_META.totalParams,
    trainedAt: NEURO_META.trainedAt,
    bench: { acc: NEURO_META.benchUs.acc, stance: NEURO_META.benchUs.stance, flight: NEURO_META.benchUs.flight },
    heads: [
      mk('acc', 0, '命中判定', '近战命中概率 · 替代 12 分支命中链', `MAE 0.0040 · |Δ|≤0.02 ${(NEURO_META.val.acc.within002 * 100).toFixed(1)}%`),
      mk('stance', 1, '战斗姿态', '追击/坚守/风筝/脱离 · 替代阈值链', `一致率 ${(NEURO_META.val.stance.agree * 100).toFixed(1)}%`),
      mk('flight', 2, '战或逃', s.flightMode === 'rl' ? 'PPO 强化学习版 · 分歧处优于教师' : '行为克隆版 · 教师策略蒸馏', flightVal),
    ],
    flightMode: s.flightMode,
    flightRL: {
      divWinRate: M.divWinRate,
      divWilsonLo: M.divWilsonLo,
      divWilsonHi: M.divWilsonHi,
      divWin: M.divWin,
      divLose: M.divLose,
      divRate: M.divRate,
      rlReturn: M.rlReturn,
      teacherReturn: M.teacherReturn,
      rlSurvival: M.rlSurvival,
      teacherSurvival: M.teacherSurvival,
      mustFleeAgree: M.mustFleeAgree,
      grayRate: M.grayRate,
      bestIter: M.bestIter,
      iterations: M.iterations,
      curve: M.curve,
    },
  };
}
