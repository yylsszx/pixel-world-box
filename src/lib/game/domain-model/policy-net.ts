// ============ DomainModel — 战略策略网络（MLP，供离线 AI 决策） ============
// 纯手写多层感知机，输入游戏世界状态特征，输出战略行动类型概率分布。
// 用于：当玩家未接入外部 API（无 LLM 可用）时，作为原生离线 AI 接管文明战略决策。
// 训练：行为克隆（Behavior Cloning），标注器 = engine 内置教师策略（policy.ts 启发式）。
// 权重 Int8 量化后内嵌于游戏，零外部依赖，完全离线可用。
import { Tensor, matmul, addBias, tanh, softmax, quantizeInt8, dequantizeInt8, gelu } from './tensor';

export interface PolicyNetConfig {
  inDim: number;
  hiddenDims: number[];
  outDim: number;
}

export const DEFAULT_POLICY_CONFIG: PolicyNetConfig = {
  inDim: 32,
  hiddenDims: [256, 128, 64],
  outDim: 12,
};

export const POLICY_ACTIONS = [
  'wait', 'move', 'attack', 'declare_war', 'make_peace', 'form_alliance',
  'issue_directive', 'spawn', 'build', 'cast', 'heal_land', 'terraform',
] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];
export const POLICY_ACTION_IDX: Record<PolicyAction, number> = {
  wait: 0, move: 1, attack: 2, declare_war: 3, make_peace: 4, form_alliance: 5,
  issue_directive: 6, spawn: 7, build: 8, cast: 9, heal_land: 10, terraform: 11,
};

export interface PolicyNetWeights {
  w1: Float32Array; b1: Float32Array;
  w2: Float32Array; b2: Float32Array;
  w3: Float32Array; b3: Float32Array;
  w4: Float32Array; b4: Float32Array;
}

export function initPolicyWeights(cfg: PolicyNetConfig, rng: () => number): PolicyNetWeights {
  const xav = (fanIn: number, fanOut: number) => Math.sqrt(6 / (fanIn + fanOut));
  const [h1, h2, h3] = cfg.hiddenDims;
  return {
    w1: randArr(cfg.inDim * h1, rng, xav(cfg.inDim, h1)),
    b1: new Float32Array(h1),
    w2: randArr(h1 * h2, rng, xav(h1, h2)),
    b2: new Float32Array(h2),
    w3: randArr(h2 * h3, rng, xav(h2, h3)),
    b3: new Float32Array(h3),
    w4: randArr(h3 * cfg.outDim, rng, xav(h3, cfg.outDim)),
    b4: new Float32Array(cfg.outDim),
  };
}

function randArr(n: number, rng: () => number, scale: number): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = (rng() * 2 - 1) * scale;
  return a;
}

export function policyParamCount(cfg: PolicyNetConfig): number {
  const [h1, h2, h3] = cfg.hiddenDims;
  return cfg.inDim * h1 + h1 + h1 * h2 + h2 + h2 * h3 + h3 + h3 * cfg.outDim + cfg.outDim;
}

export function policyForward(x: Float32Array, w: PolicyNetWeights, cfg: PolicyNetConfig): Float32Array {
  const [h1, h2, h3] = cfg.hiddenDims;
  const t1 = new Tensor([1, cfg.inDim], x);
  const l1 = matmul(t1, new Tensor([cfg.inDim, h1], w.w1));
  const a1 = addBias(l1, new Tensor([1, h1], w.b1));
  const g1 = gelu(a1);

  const l2 = matmul(g1, new Tensor([h1, h2], w.w2));
  const a2 = addBias(l2, new Tensor([1, h2], w.b2));
  const g2 = gelu(a2);

  const l3 = matmul(g2, new Tensor([h2, h3], w.w3));
  const a3 = addBias(l3, new Tensor([1, h3], w.b3));
  const g3 = gelu(a3);

  const l4 = matmul(g3, new Tensor([h3, cfg.outDim], w.w4));
  const a4 = addBias(l4, new Tensor([1, cfg.outDim], w.b4));
  return softmax(a4).data;
}
// ===== Int8 量化导出/恢复 =====
export function exportPolicyQuantized(w: PolicyNetWeights): Record<string, { q: number[]; scale: number }> {
  const out: Record<string, { q: number[]; scale: number }> = {};
  const add = (name: string, arr: Float32Array) => {
    const t = new Tensor([arr.length], arr);
    const { q, scale } = quantizeInt8(t);
    out[name] = { q: Array.from(q), scale };
  };
  add('w1', w.w1); add('b1', w.b1);
  add('w2', w.w2); add('b2', w.b2);
  add('w3', w.w3); add('b3', w.b3);
  add('w4', w.w4); add('b4', w.b4);
  return out;
}

export function importPolicyQuantized(cfg: PolicyNetConfig, qw: Record<string, { q: number[]; scale: number }>): PolicyNetWeights {
  const w = initPolicyWeights(cfg, () => 0);
  const set = (name: string, arr: Float32Array) => {
    const { q, scale } = qw[name];
    const t = dequantizeInt8(Int8Array.from(q), scale, [arr.length]);
    arr.set(t.data);
  };
  set('w1', w.w1); set('b1', w.b1);
  set('w2', w.w2); set('b2', w.b2);
  set('w3', w.w3); set('b3', w.b3);
  set('w4', w.w4); set('b4', w.b4);
  return w;
}
