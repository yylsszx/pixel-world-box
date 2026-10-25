// ============ NeuroCore 训练器：微型决策网络（非 LLM）离线蒸馏 ============
// 运行：bun scripts/train-neuro.ts
// 产出：src/lib/game/neuro-weights.ts（Int8 量化权重 + 训练元数据，自动生成）
//
// 方法：行为克隆（Behavior Cloning）—— 以 policy.ts 的教师策略为标注器，
//       在贴近引擎真实分布的特征空间中采样，训练三个微型 MLP：
//         ① acc    10→8→1  近战命中概率（sigmoid 回归，MSE）
//         ② stance 12→10→4 战斗姿态（softmax 分类，CE）
//         ③ flight  9→8→2 战或逃（softmax 分类，CE）
//       纯手写反向传播（tanh 隐层 + SGD 动量 + 学习率衰减），零第三方依赖。
//       训练后做 Int8 量化并复检验证集精度，达标才写出权重文件。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { teacherAcc, teacherStance, teacherFlight, ACC_IN, STANCE_IN, FLIGHT_IN } from '../src/lib/game/policy';

// —— 可复现 RNG（mulberry32）——
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type RNG = () => number;
const U = (r: RNG, a: number, b: number) => a + r() * (b - a);
const B = (r: RNG, p: number) => (r() < p ? 1 : 0);
const pick = <T,>(r: RNG, arr: T[]) => arr[(r() * arr.length) | 0];

// ============================ 微型 MLP（手写反向传播） ============================
class MLP {
  nIn: number;
  nH: number;
  nOut: number;
  w1: Float32Array; // [i*nH+h]
  b1: Float32Array;
  w2: Float32Array; // [h*nOut+j]
  b2: Float32Array;
  private vw1: Float32Array;
  private vb1: Float32Array;
  private vw2: Float32Array;
  private vb2: Float32Array;
  hid: Float32Array;
  out: Float32Array;
  // 梯度累加器（批量共用）
  private gw1: Float32Array;
  private gb1: Float32Array;
  private gw2: Float32Array;
  private gb2: Float32Array;

  constructor(nIn: number, nH: number, nOut: number, rng: RNG) {
    this.nIn = nIn;
    this.nH = nH;
    this.nOut = nOut;
    const xav1 = Math.sqrt(6 / (nIn + nH));
    const xav2 = Math.sqrt(6 / (nH + nOut));
    this.w1 = new Float32Array(nIn * nH);
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = U(rng, -xav1, xav1);
    this.b1 = new Float32Array(nH);
    this.w2 = new Float32Array(nH * nOut);
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = U(rng, -xav2, xav2);
    this.b2 = new Float32Array(nOut);
    this.vw1 = new Float32Array(this.w1.length);
    this.vb1 = new Float32Array(nH);
    this.vw2 = new Float32Array(this.w2.length);
    this.vb2 = new Float32Array(nOut);
    this.hid = new Float32Array(nH);
    this.out = new Float32Array(nOut);
    this.gw1 = new Float32Array(this.w1.length);
    this.gb1 = new Float32Array(nH);
    this.gw2 = new Float32Array(this.w2.length);
    this.gb2 = new Float32Array(nOut);
  }

  /** 前向（无分配：写入复用的 hid/out） */
  forward(x: ArrayLike<number>): Float32Array {
    const { nIn, nH, nOut, w1, b1, w2, b2, hid, out } = this;
    for (let h = 0; h < nH; h++) {
      let s = b1[h];
      for (let i = 0; i < nIn; i++) s += x[i] * w1[i * nH + h];
      hid[h] = Math.tanh(s);
    }
    for (let j = 0; j < nOut; j++) {
      let s = b2[j];
      for (let h = 0; h < nH; h++) s += hid[h] * w2[h * nOut + j];
      out[j] = s;
    }
    return out;
  }

  /** 反向累加（回归：sigmoid+MSE；分类：softmax+CE） */
  backward(x: ArrayLike<number>, target: number, mode: 'reg' | 'cls') {
    const { nIn, nH, nOut, w2, hid, out, gw1, gb1, gw2, gb2 } = this;
    const d2 = new Float32Array(nOut); // 单样本临时（训练期允许小额分配）
    if (mode === 'reg') {
      // 单输出 sigmoid + MSE：dL/dz = 2(out-t)·out(1-out)
      const t = target;
      d2[0] = 2 * (out[0] - t) * out[0] * (1 - out[0]);
    } else {
      // softmax + CE：dL/dz_j = out_j - 1[j=t]
      for (let j = 0; j < nOut; j++) d2[j] = out[j] - (j === target ? 1 : 0);
    }
    for (let j = 0; j < nOut; j++) {
      const d = d2[j];
      if (d === 0) continue;
      gb2[j] += d;
      for (let h = 0; h < nH; h++) gw2[h * nOut + j] += d * hid[h];
    }
    for (let h = 0; h < nH; h++) {
      let s = 0;
      for (let j = 0; j < nOut; j++) s += d2[j] * w2[h * nOut + j];
      const d1 = s * (1 - hid[h] * hid[h]);
      if (d1 === 0) continue;
      gb1[h] += d1;
      for (let i = 0; i < nIn; i++) gw1[i * nH + h] += d1 * x[i];
    }
  }

  /** 应用批量梯度（SGD + 动量） */
  apply(lr: number, momentum: number, batch: number) {
    const upd = (w: Float32Array, g: Float32Array, v: Float32Array) => {
      for (let k = 0; k < w.length; k++) {
        v[k] = momentum * v[k] - (lr * g[k]) / batch;
        w[k] += v[k];
        g[k] = 0;
      }
    };
    upd(this.w1, this.gw1, this.vw1);
    upd(this.b1, this.gb1, this.vb1);
    upd(this.w2, this.gw2, this.vw2);
    upd(this.b2, this.gb2, this.vb2);
  }

  /** 权重快照/恢复（按验证集择优保留） */
  snapshot(): Float32Array[] {
    return [new Float32Array(this.w1), new Float32Array(this.b1), new Float32Array(this.w2), new Float32Array(this.b2)];
  }
  restore(s: Float32Array[]) {
    this.w1.set(s[0]);
    this.b1.set(s[1]);
    this.w2.set(s[2]);
    this.b2.set(s[3]);
  }
}

// ============================ 前向包装（sigmoid/softmax） ============================
function sigmoid1(z: number) {
  return 1 / (1 + Math.exp(-z));
}
function forwardReg(m: MLP, x: ArrayLike<number>): number {
  const o = m.forward(x);
  return sigmoid1(o[0]);
}
function forwardCls(m: MLP, x: ArrayLike<number>): number {
  const o = m.forward(x);
  let mx = -Infinity;
  for (let j = 0; j < o.length; j++) if (o[j] > mx) mx = o[j];
  let best = 0;
  let bestV = -Infinity;
  for (let j = 0; j < o.length; j++) {
    if (o[j] > bestV) {
      bestV = o[j];
      best = j;
    }
  }
  void mx;
  return best;
}

// ============================ 特征采样器（贴近引擎真实分布） ============================
function sampleExpN(r: RNG) {
  // 大多数单位击杀寥寥；少数百战老兵
  return r() < 0.68 ? U(r, 0, 0.15) : U(r, 0.15, 1);
}
function sampleHpN(r: RNG) {
  const p = r();
  if (p < 0.55) return U(r, 0.55, 1);
  if (p < 0.85) return U(r, 0.25, 0.55);
  return U(r, 0.05, 0.25);
}
function sampleAcc(r: RNG): number[] {
  return [
    sampleExpN(r),
    r() < 0.78 ? 0 : U(r, 0, 1), // 多数同速
    B(r, 0.08), B(r, 0.12), B(r, 0.06), B(r, 0.08), B(r, 0.04), B(r, 0.04), B(r, 0.16), B(r, 0.09),
  ];
}
function sampleStance(r: RNG): number[] {
  const dist = r() < 0.25 ? U(r, 0.2, 1.2) : r() < 0.55 ? U(r, 1.2, 3) : r() < 0.78 ? U(r, 3, 7.5) : U(r, 7.5, 12);
  const hasRange = r() < 0.4;
  const isMage = hasRange && r() < 0.15;
  const range = hasRange ? pick(r, [3.5, 4.5, 5.5, 5.5, 6.5, 7.5]) : 0;
  const reach = r() < 0.05 ? 2.4 : 0.9; // 克拉肯触手偶尔在样本中
  return [
    Math.min(12, dist) / 12,
    sampleHpN(r),
    sampleHpN(r),
    hasRange ? 1 : 0,
    Math.min(8, range) / 8,
    Math.min(2, reach) / 2,
    isMage ? 1 : 0,
    U(r, 0.15, 0.85),
    r() < 0.4 ? 0 : U(r, 0.25, 1),
    B(r, 0.25),
    B(r, 0.78),
    sampleExpN(r),
  ];
}
function sampleFlight(r: RNG): number[] {
  const predator = r() < 0.6;
  return [
    sampleHpN(r),
    predator ? (r() < 0.4 ? U(r, 0, 0.4) : U(r, 0.4, 1)) : 0.5,
    U(r, 0.1, 0.9),
    U(r, 0.2, 1),
    Math.min(12, U(r, 0.5, 10)) / 12,
    B(r, 0.55),
    r() < 0.7 ? U(r, 0, 0.33) : U(r, 0.33, 1),
    B(r, 0.12),
    sampleExpN(r),
  ];
}

// ============================ 训练循环 ============================
interface HeadResult {
  name: string;
  arch: [number, number, number];
  mlp: MLP;
  valFloat: number; // 回归=MAE，分类=一致率
  valQuant: number;
  agree02: number; // acc 专用：|Δ|≤0.02 占比（量化后）
  clsDist?: number[]; // 分类：教师类别分布
}

function trainHead(
  name: string,
  nIn: number,
  nH: number,
  nOut: number,
  mode: 'reg' | 'cls',
  sampler: (r: RNG) => number[],
  teacher: (f: number[] | Float32Array) => number,
  opts: { train: number; val: number; epochs: number; batch: number; lr: number; momentum: number; decay: number },
  rng: RNG,
): HeadResult {
  const t0 = Date.now();
  const m = new MLP(nIn, nH, nOut, rng);
  // 数据集
  const X: number[][] = [];
  const Y: number[] = [];
  const clsDist = nOut > 1 ? new Array(nOut).fill(0) : undefined;
  for (let i = 0; i < opts.train + opts.val; i++) {
    const f = sampler(rng);
    const t = teacher(f);
    X.push(f);
    Y.push(t);
    if (clsDist) clsDist[t] += 1;
  }
  const valStart = opts.train;
  const evalVal = (): { float: number; quant: number; agree02: number } => {
    let sumAbs = 0;
    let agreeF = 0;
    let agreeQ = 0;
    let a02 = 0;
    // 量化副本
    const q = quantize(m);
    for (let i = valStart; i < X.length; i++) {
      const t = Y[i];
      if (mode === 'reg') {
        const pf = sigmoid1(m.forward(X[i])[0]);
        const pq = sigmoid1(qForward(q, X[i])[0]);
        sumAbs += Math.abs(pq - t);
        if (Math.abs(pf - t) <= 0.02) agreeF++;
        if (Math.abs(pq - t) <= 0.02) { agreeQ++; a02++; }
      } else {
        const argmaxF = forwardCls(m, X[i]);
        // softmax 前需重算（forwardCls 用的是 argmax，无需 softmax 数值）
        const oq = qForward(q, X[i]);
        let bq = 0;
        for (let j = 1; j < oq.length; j++) if (oq[j] > oq[bq]) bq = j;
        if (argmaxF === t) agreeF++;
        if (bq === t) agreeQ++;
      }
    }
    const n = X.length - valStart;
    return mode === 'reg'
      ? { float: sumAbs / n, quant: sumAbs / n, agree02: a02 / n }
      : { float: agreeF / n, quant: agreeQ / n, agree02: agreeQ / n };
  };
  // 训练
  let lr = opts.lr;
  let bestScore = mode === 'reg' ? Infinity : -Infinity;
  let bestSnap = m.snapshot();
  for (let ep = 0; ep < opts.epochs; ep++) {
    // 洗牌
    const order = Array.from({ length: opts.train }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let b = 0; b < opts.train; b += opts.batch) {
      const end = Math.min(opts.train, b + opts.batch);
      for (let k = b; k < end; k++) {
        const idx = order[k];
        if (mode === 'reg') {
          const z = m.forward(X[idx]);
          z[0] = sigmoid1(z[0]); // 就地施加 sigmoid 再回传
          m.backward(X[idx], Y[idx], 'reg');
        } else {
          // softmax 就地
          const z = m.forward(X[idx]);
          let mx = -Infinity;
          for (let j = 0; j < z.length; j++) if (z[j] > mx) mx = z[j];
          let se = 0;
          for (let j = 0; j < z.length; j++) {
            z[j] = Math.exp(z[j] - mx);
            se += z[j];
          }
          for (let j = 0; j < z.length; j++) z[j] /= se;
          m.backward(X[idx], Y[idx], 'cls');
        }
      }
      m.apply(lr, opts.momentum, end - b);
    }
    lr *= opts.decay;
    const v = evalVal();
    const score = mode === 'reg' ? v.agree02 : v.quant;
    if (mode === 'reg' ? v.float < bestScore : score > bestScore) {
      bestScore = score;
      bestSnap = m.snapshot();
    }
    if (ep === opts.epochs - 1 || ep % 4 === 3) {
      console.log(
        `  [${name}] epoch ${String(ep + 1).padStart(2)}/${opts.epochs}  ` +
          (mode === 'reg' ? `MAE=${v.float.toFixed(4)}  |Δ|≤0.02=${(v.agree02 * 100).toFixed(1)}%` : `agree(float)=${(v.float * 100).toFixed(1)}%  agree(quant)=${(v.quant * 100).toFixed(1)}%`),
      );
    }
  }
  m.restore(bestSnap);
  const v = evalVal();
  console.log(
    `  [${name}] 最终：${mode === 'reg' ? `MAE=${v.float.toFixed(5)}  |Δ|≤0.02=${(v.agree02 * 100).toFixed(2)}%` : `一致率 quant=${(v.quant * 100).toFixed(2)}%`}（${((Date.now() - t0) / 1000).toFixed(1)}s）`,
  );
  return { name, arch: [nIn, nH, nOut], mlp: m, valFloat: v.float, valQuant: v.quant, agree02: v.agree02, clsDist: clsDist?.map((c) => c / opts.val) };
}

// ============================ Int8 量化 ============================
interface QuantHead {
  w1q: number[];
  b1q: number[];
  w2q: number[];
  b2q: number[];
  sw1: number;
  sb1: number;
  sw2: number;
  sb2: number;
  hid: Float32Array;
  out: Float32Array;
}
function quantize(m: MLP): QuantHead {
  const q = (w: Float32Array) => {
    let mx = 0;
    for (let i = 0; i < w.length; i++) mx = Math.max(mx, Math.abs(w[i]));
    const s = mx / 127 || 1e-9;
    const arr: number[] = new Array(w.length);
    for (let i = 0; i < w.length; i++) arr[i] = Math.round(w[i] / s);
    return { arr, s };
  };
  const a = q(m.w1);
  const b = q(m.b1);
  const c = q(m.w2);
  const d = q(m.b2);
  return { w1q: a.arr, b1q: b.arr, sw1: a.s, sb1: b.s, w2q: c.arr, b2q: d.arr, sw2: c.s, sb2: d.s, hid: new Float32Array(m.nH), out: new Float32Array(m.nOut) };
}
/** 量化头前向（复用 scratch，返回未过激活的 logits 写入 q.out） */
function qForward(q: QuantHead, x: ArrayLike<number>): Float32Array {
  const nIn = q.w1q.length / q.b1q.length;
  const nH = q.b1q.length;
  const nOut = q.b2q.length;
  for (let h = 0; h < nH; h++) {
    let s = q.b1q[h] * q.sb1;
    for (let i = 0; i < nIn; i++) s += x[i] * q.w1q[i * nH + h] * q.sw1;
    q.hid[h] = Math.tanh(s);
  }
  for (let j = 0; j < nOut; j++) {
    let s = q.b2q[j] * q.sb2;
    for (let h = 0; h < nH; h++) s += q.hid[h] * q.w2q[h * nOut + j] * q.sw2;
    q.out[j] = s;
  }
  return q.out;
}

// ============================ 推理基准（µs/次） ============================
function benchmark(name: string, nIn: number, fwd: (x: number[]) => number, rng: RNG) {
  const x = Array.from({ length: nIn }, () => rng());
  const N = 200000;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) fwd(x);
  const us = ((performance.now() - t0) * 1000) / N;
  console.log(`  [${name}] 推理基准：${us.toFixed(3)} µs/次（${N / 1000}k 次）`);
  return us;
}

// ============================ 主流程 ============================
const SEED = 20260206;
const rng = mulberry32(SEED);
console.log('══════════ NeuroCore 微型决策网络训练 ══════════');
console.log(`种子 ${SEED} · 行为克隆蒸馏（教师 = policy.ts 专家策略）\n`);

const common = { train: 60000, val: 12000, epochs: 20, batch: 16, lr: 0.08, momentum: 0.9, decay: 0.9 };

const accHead = trainHead('acc·命中判定', ACC_IN, 16, 1, 'reg', sampleAcc, teacherAcc, common, rng);
const stanceHead = trainHead('stance·战斗姿态', STANCE_IN, 10, 4, 'cls', sampleStance, teacherStance, common, rng);
const flightHead = trainHead('flight·战或逃', FLIGHT_IN, 8, 2, 'cls', sampleFlight, teacherFlight, common, rng);

// 质量门：量化后精度不达标 → 拒绝导出
const GATE_ACC_MAE = 0.008;
const GATE_ACC_A02 = 0.985;
const GATE_CLS = 0.955;
const fail: string[] = [];
if (accHead.valQuant > GATE_ACC_MAE || accHead.agree02 < GATE_ACC_A02) fail.push(`acc: MAE=${accHead.valQuant.toFixed(4)} agree02=${(accHead.agree02 * 100).toFixed(2)}%`);
if (stanceHead.valQuant < GATE_CLS) fail.push(`stance: ${(stanceHead.valQuant * 100).toFixed(2)}%`);
if (flightHead.valQuant < GATE_CLS) fail.push(`flight: ${(flightHead.valQuant * 100).toFixed(2)}%`);
if (fail.length) {
  console.error(`\n✗ 质量门未通过：${fail.join(' ; ')} —— 不导出权重（请增补样本/轮数后重训）`);
  process.exit(1);
}
console.log('\n✓ 三头全部通过质量门（MAE/一致率阈值）');

console.log('\n—— 推理基准（Float32 反量化后） ——');
const usAcc = benchmark('acc', ACC_IN, (x) => forwardReg(accHead.mlp, x), rng);
const usStance = benchmark('stance', STANCE_IN, (x) => forwardCls(stanceHead.mlp, x), rng);
const usFlight = benchmark('flight', FLIGHT_IN, (x) => forwardCls(flightHead.mlp, x), rng);

// ============================ 导出 neuro-weights.ts ============================
function emitHead(varName: string, h: HeadResult): string {
  const q = quantize(h.mlp);
  const f = (arr: number[]) => `[${arr.join(',')}]`;
  return `export const ${varName} = {\n  arch: [${h.arch.join(', ')}] as [number, number, number],\n  w1q: ${f(q.w1q)},\n  b1q: ${f(q.b1q)},\n  w2q: ${f(q.w2q)},\n  b2q: ${f(q.b2q)},\n  sw1: ${q.sw1.toPrecision(6)}, sb1: ${q.sb1.toPrecision(6)}, sw2: ${q.sw2.toPrecision(6)}, sb2: ${q.sb2.toPrecision(6)},\n};`;
}
const params = (h: HeadResult) => h.arch[0] * h.arch[1] + h.arch[1] + h.arch[1] * h.arch[2] + h.arch[2];
const total = params(accHead) + params(stanceHead) + params(flightHead);
const bytes = total * 1; // Int8 每参数 1 字节（源码文本更大，运行时内存 ~4B/参数 Float32）
const src = `// ══════════════════════════════════════════════════════════════════
// ⚠ AUTO-GENERATED by scripts/train-neuro.ts — DO NOT EDIT BY HAND
// NeuroCore 微型决策网络权重（Int8 逐张量量化；运行时反量化为 Float32）
// 训练：行为克隆蒸馏（教师 = src/lib/game/policy.ts 专家策略，种子 ${SEED}）
// 数据：每头 ${common.train} 训练 + ${common.val} 验证（贴近引擎真实分布采样）
// 训练时间：${new Date().toISOString()}
// 总参数：${total}（acc ${params(accHead)} + stance ${params(stanceHead)} + flight ${params(flightHead)}）≈ ${bytes} B 权重
// 验证（量化后）：acc MAE=${accHead.valQuant.toFixed(4)} / |Δ|≤0.02 ${(accHead.agree02 * 100).toFixed(2)}% · stance 一致率 ${(stanceHead.valQuant * 100).toFixed(2)}% · flight 一致率 ${(flightHead.valQuant * 100).toFixed(2)}%
// 推理基准：acc ${usAcc.toFixed(3)}µs · stance ${usStance.toFixed(3)}µs · flight ${usFlight.toFixed(3)}µs
// ══════════════════════════════════════════════════════════════════

export interface NeuroHeadSpec {
  arch: [number, number, number];
  w1q: number[];
  b1q: number[];
  w2q: number[];
  b2q: number[];
  sw1: number; sb1: number; sw2: number; sb2: number;
}

${emitHead('NEURO_ACC', accHead)}

${emitHead('NEURO_STANCE', stanceHead)}

${emitHead('NEURO_FLIGHT', flightHead)}

export const NEURO_META = {
  trainedAt: ${JSON.stringify(new Date().toISOString())},
  seed: ${SEED},
  samplesPerHead: ${common.train},
  valPerHead: ${common.val},
  epochs: ${common.epochs},
  totalParams: ${total},
  val: {
    acc: { mae: ${accHead.valQuant.toFixed(5)}, within002: ${accHead.agree02.toFixed(4)} },
    stance: { agree: ${stanceHead.valQuant.toFixed(4)} },
    flight: { agree: ${flightHead.valQuant.toFixed(4)} },
  },
  benchUs: { acc: ${usAcc.toFixed(3)}, stance: ${usStance.toFixed(3)}, flight: ${usFlight.toFixed(3)} },
  stanceDist: [${stanceHead.clsDist ? stanceHead.clsDist.map((c) => +c.toFixed(3)).join(',') : ''}],
  flightDist: [${flightHead.clsDist ? flightHead.clsDist.map((c) => +c.toFixed(3)).join(',') : ''}],
} as const;
`;
const outPath = join(process.cwd(), 'src', 'lib', 'game', 'neuro-weights.ts');
writeFileSync(outPath, src);
console.log(`\n✓ 权重已写出：${outPath}`);
console.log(`  总参数 ${total} · Int8 量化 · 验证指标见文件头`);
