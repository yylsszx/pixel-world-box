// ============ DomainModel — 零依赖张量库（微型，专供领域小模型推理/训练） ============
export type Shape = number[];

export class Tensor {
  readonly shape: Shape;
  readonly ndim: number;
  readonly size: number;
  readonly stride: number[];
  data: Float32Array;

  constructor(shape: Shape, data?: Float32Array | number[]) {
    this.shape = shape.slice();
    this.ndim = shape.length;
    this.size = shape.reduce((a, b) => a * b, 1);
    this.stride = computeStride(shape);
    this.data = data instanceof Float32Array ? data : new Float32Array(this.size);
    if (data instanceof Float32Array) this.data.set(data);
    else if (Array.isArray(data)) for (let i = 0; i < Math.min(data.length, this.size); i++) this.data[i] = data[i];
  }
  get(i: number): number { return this.data[i]; }
  set(i: number, v: number) { this.data[i] = v; }
  reshape(newShape: Shape): Tensor {
    const newSize = newShape.reduce((a, b) => a * b, 1);
    if (newSize !== this.size) throw new Error(`reshape 形状不匹配：${this.size} vs ${newSize}`);
    const t = new Tensor(newShape);
    t.data.set(this.data);
    t.stride = computeStride(newShape);
    return t;
  }
  static zeros(shape: Shape): Tensor {
    return new Tensor(shape, new Float32Array(shape.reduce((a, b) => a * b, 1)));
  }
}

function computeStride(shape: Shape): number[] {
  const stride = new Array(shape.length);
  let acc = 1;
  for (let d = shape.length - 1; d >= 0; d--) { stride[d] = acc; acc *= shape[d]; }
  return stride;
}

export function add(a: Tensor, b: Tensor | number): Tensor {
  const out = new Tensor(a.shape);
  if (typeof b === 'number') for (let i = 0; i < a.size; i++) out.data[i] = a.data[i] + b;
  else { if (a.size !== b.size) throw new Error('add 形状不匹配'); for (let i = 0; i < a.size; i++) out.data[i] = a.data[i] + b.data[i]; }
  return out;
}

export function mul(a: Tensor, b: Tensor | number): Tensor {
  const out = new Tensor(a.shape);
  if (typeof b === 'number') for (let i = 0; i < a.size; i++) out.data[i] = a.data[i] * b;
  else { if (a.size !== b.size) throw new Error('mul 形状不匹配'); for (let i = 0; i < a.size; i++) out.data[i] = a.data[i] * b.data[i]; }
  return out;
}

export function tanh(a: Tensor): Tensor {
  const out = new Tensor(a.shape);
  for (let i = 0; i < a.size; i++) out.data[i] = Math.tanh(a.data[i]);
  return out;
}

export function softmax(a: Tensor, axis = a.ndim - 1): Tensor {
  const out = new Tensor(a.shape);
  const outer = a.size / a.shape[axis];
  const inner = a.shape[axis];
  for (let o = 0; o < outer; o++) {
    const base = o * inner;
    let max = -Infinity;
    for (let j = 0; j < inner; j++) if (a.data[base + j] > max) max = a.data[base + j];
    let sum = 0;
    for (let j = 0; j < inner; j++) { out.data[base + j] = Math.exp(a.data[base + j] - max); sum += out.data[base + j]; }
    for (let j = 0; j < inner; j++) out.data[base + j] /= sum;
  }
  return out;
}

export function sigmoid(a: Tensor): Tensor {
  const out = new Tensor(a.shape);
  for (let i = 0; i < a.size; i++) out.data[i] = 1 / (1 + Math.exp(-a.data[i]));
  return out;
}

export function matmul(A: Tensor, B: Tensor): Tensor {
  if (A.ndim !== 2 || B.ndim !== 2) throw new Error('matmul 目前仅支持 2D');
  const M = A.shape[0], K = A.shape[1], N = B.shape[1];
  if (B.shape[0] !== K) throw new Error(`matmul K 不匹配：${A.shape[1]} vs ${B.shape[0]}`);
  const out = Tensor.zeros([M, N]);
  const BK = 32, BN = 32;
  for (let k0 = 0; k0 < K; k0 += BK) {
    const kEnd = Math.min(k0 + BK, K);
    for (let i = 0; i < M; i++) {
      for (let j0 = 0; j0 < N; j0 += BN) {
        const jEnd = Math.min(j0 + BN, N);
        for (let k = k0; k < kEnd; k++) {
          const aik = A.data[i * K + k];
          if (aik === 0) continue;
          const brow = k * N;
          for (let j = j0; j < jEnd; j++) out.data[i * N + j] += aik * B.data[brow + j];
        }
      }
    }
  }
  return out;
}

export function addBias(x: Tensor, b: Tensor): Tensor {
  const out = new Tensor(x.shape);
  const inner = x.shape[x.ndim - 1];
  const outer = x.size / inner;
  for (let o = 0; o < outer; o++) {
    const base = o * inner;
    for (let j = 0; j < inner; j++) out.data[base + j] = x.data[base + j] + b.data[j];
  }
  return out;
}

export function layerNorm(x: Tensor, weight: Tensor, bias: Tensor, eps = 1e-5): Tensor {
  const out = new Tensor(x.shape);
  const inner = x.shape[x.ndim - 1];
  const outer = x.size / inner;
  for (let o = 0; o < outer; o++) {
    const base = o * inner;
    let mean = 0, var_ = 0;
    for (let j = 0; j < inner; j++) mean += x.data[base + j];
    mean /= inner;
    for (let j = 0; j < inner; j++) { const d = x.data[base + j] - mean; var_ += d * d; }
    var_ /= inner;
    const inv = 1 / Math.sqrt(var_ + eps);
    for (let j = 0; j < inner; j++) out.data[base + j] = (x.data[base + j] - mean) * inv * weight.data[j] + bias.data[j];
  }
  return out;
}

export function gelu(x: Tensor): Tensor {
  const out = new Tensor(x.shape);
  for (let i = 0; i < x.size; i++) {
    const v = x.data[i];
    out.data[i] = 0.5 * v * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (v + 0.044715 * v * v * v)));
  }
  return out;
}

export function clip(x: Tensor, min: number, max: number): Tensor {
  const out = new Tensor(x.shape);
  for (let i = 0; i < x.size; i++) { let v = x.data[i]; if (v < min) v = min; else if (v > max) v = max; out.data[i] = v; }
  return out;
}

export function quantizeInt8(x: Tensor): { q: Int8Array; scale: number } {
  let maxAbs = 0;
  for (let i = 0; i < x.size; i++) { const v = Math.abs(x.data[i]); if (v > maxAbs) maxAbs = v; }
  const scale = maxAbs > 0 ? 127 / maxAbs : 1;
  const q = new Int8Array(x.size);
  for (let i = 0; i < x.size; i++) q[i] = Math.round(x.data[i] * scale);
  return { q, scale };
}

export function dequantizeInt8(q: Int8Array, scale: number, shape: Shape): Tensor {
  const inv = 1 / scale;
  const data = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) data[i] = q[i] * inv;
  return new Tensor(shape, data);
}