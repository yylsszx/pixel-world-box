// ============ DomainModel — Transformer 块（专用于游戏领域小模型，~1B 参数可配） ============
import { Tensor, matmul, add, addBias, layerNorm, gelu, softmax, quantizeInt8, dequantizeInt8 } from './tensor';

export interface TransformerConfig {
  vocabSize: number;
  hiddenSize: number;
  numLayers: number;
  numHeads: number;
  intermediateSize: number;
  maxSeqLen: number;
  padTokenId: number;
  eosTokenId: number;
}

/** 估算 Transformer 参数量 */
export function paramEstimate(config: TransformerConfig): number {
  const { vocabSize, hiddenSize, numLayers, intermediateSize } = config;
  const emb = vocabSize * hiddenSize;
  const perLayer = 4 * hiddenSize * hiddenSize + 2 * hiddenSize * intermediateSize;
  const lmHead = hiddenSize * vocabSize;
  return emb + numLayers * perLayer + lmHead;
}

export const DEFAULT_CONFIG: TransformerConfig = {
  vocabSize: 32000,
  hiddenSize: 768,
  numLayers: 12,
  numHeads: 12,
  intermediateSize: 3072,
  maxSeqLen: 2048,
  padTokenId: 0,
  eosTokenId: 1,
};

export interface TransformerWeights {
  wte: Float32Array;
  wpe: Float32Array;
  ln1_w: Float32Array[]; ln1_b: Float32Array[];
  ln2_w: Float32Array[]; ln2_b: Float32Array[];
  ln_f_w: Float32Array; ln_f_b: Float32Array;
  qkv_w: Float32Array[]; qkv_b: Float32Array[];
  attn_out_w: Float32Array[]; attn_out_b: Float32Array[];
  ffn_w1: Float32Array[]; ffn_b1: Float32Array[];
  ffn_w2: Float32Array[]; ffn_b2: Float32Array[];
  lm_head_w: Float32Array; lm_head_b: Float32Array;
}

export function initWeights(config: TransformerConfig, rng: () => number): TransformerWeights {
  const { vocabSize, hiddenSize, numLayers, intermediateSize, maxSeqLen } = config;
  const xav = (fanIn: number, fanOut: number) => Math.sqrt(6 / (fanIn + fanOut));
  const wte = new Float32Array(vocabSize * hiddenSize);
  for (let i = 0; i < wte.length; i++) wte[i] = (rng() * 2 - 1) * xav(vocabSize, hiddenSize);
  const wpe = new Float32Array(maxSeqLen * hiddenSize);
  for (let i = 0; i < wpe.length; i++) wpe[i] = (rng() * 2 - 1) * 0.02;

  const ln1_w = new Array(numLayers), ln1_b = new Array(numLayers);
  const ln2_w = new Array(numLayers), ln2_b = new Array(numLayers);
  const qkv_w = new Array(numLayers), qkv_b = new Array(numLayers);
  const attn_out_w = new Array(numLayers), attn_out_b = new Array(numLayers);
  const ffn_w1 = new Array(numLayers), ffn_b1 = new Array(numLayers);
  const ffn_w2 = new Array(numLayers), ffn_b2 = new Array(numLayers);

  for (let l = 0; l < numLayers; l++) {
    ln1_w[l] = new Float32Array(hiddenSize).fill(1);
    ln1_b[l] = new Float32Array(hiddenSize);
    ln2_w[l] = new Float32Array(hiddenSize).fill(1);
    ln2_b[l] = new Float32Array(hiddenSize);
    const qkvScale = xav(hiddenSize, 3 * hiddenSize);
    qkv_w[l] = new Float32Array(hiddenSize * 3 * hiddenSize);
    for (let i = 0; i < qkv_w[l].length; i++) qkv_w[l][i] = (rng() * 2 - 1) * qkvScale;
    qkv_b[l] = new Float32Array(3 * hiddenSize);
    const outScale = xav(hiddenSize, hiddenSize);
    attn_out_w[l] = new Float32Array(hiddenSize * hiddenSize);
    for (let i = 0; i < attn_out_w[l].length; i++) attn_out_w[l][i] = (rng() * 2 - 1) * outScale;
    attn_out_b[l] = new Float32Array(hiddenSize);
    const w1Scale = xav(hiddenSize, intermediateSize);
    ffn_w1[l] = new Float32Array(hiddenSize * intermediateSize);
    for (let i = 0; i < ffn_w1[l].length; i++) ffn_w1[l][i] = (rng() * 2 - 1) * w1Scale;
    ffn_b1[l] = new Float32Array(intermediateSize);
    const w2Scale = xav(intermediateSize, hiddenSize);
    ffn_w2[l] = new Float32Array(intermediateSize * hiddenSize);
    for (let i = 0; i < ffn_w2[l].length; i++) ffn_w2[l][i] = (rng() * 2 - 1) * w2Scale;
    ffn_b2[l] = new Float32Array(hiddenSize);
  }

  const ln_f_w = new Float32Array(hiddenSize).fill(1);
  const ln_f_b = new Float32Array(hiddenSize);
  const lmScale = xav(hiddenSize, vocabSize);
  const lm_head_w = new Float32Array(hiddenSize * vocabSize);
  for (let i = 0; i < lm_head_w.length; i++) lm_head_w[i] = (rng() * 2 - 1) * lmScale;
  const lm_head_b = new Float32Array(vocabSize);

  return { wte, wpe, ln1_w, ln1_b, ln2_w, ln2_b, ln_f_w, ln_f_b,
    qkv_w, qkv_b, attn_out_w, attn_out_b, ffn_w1, ffn_b1, ffn_w2, ffn_b2,
    lm_head_w, lm_head_b };
}

function attention(
  q: Tensor, k: Tensor, v: Tensor,
  maskCausal: boolean,
  scratch: { attn: Float32Array }
): Tensor {
  const seq = q.shape[0];
  const headDim = q.shape[1];
  const out = new Tensor([seq, headDim]);
  const scale = 1 / Math.sqrt(headDim);
  for (let i = 0; i < seq; i++) {
    let max = -Infinity;
    for (let j = 0; j <= i; j++) {
      let s = 0;
      for (let d = 0; d < headDim; d++) s += q.data[i * headDim + d] * k.data[j * headDim + d];
      scratch.attn[j] = s * scale;
      if (scratch.attn[j] > max) max = scratch.attn[j];
    }
    let sum = 0;
    for (let j = 0; j <= i; j++) { scratch.attn[j] = Math.exp(scratch.attn[j] - max); sum += scratch.attn[j]; }
    const invSum = 1 / sum;
    for (let d = 0; d < headDim; d++) {
      let acc = 0;
      for (let j = 0; j <= i; j++) acc += scratch.attn[j] * v.data[j * headDim + d];
      out.data[i * headDim + d] = acc * invSum;
    }
  }
  return out;
}

export function transformerBlock(
  x: Tensor,
  layer: number,
  w: TransformerWeights,
  cfg: TransformerConfig,
  scratch: { attn: Float32Array; qkv: Float32Array; attnOut: Float32Array; ffn1: Float32Array; ffn2: Float32Array; ln1: Float32Array; ln2: Float32Array }
): Tensor {
  const { hiddenSize, numHeads, intermediateSize } = cfg;
  const seq = x.shape[0];
  const headDim = hiddenSize / numHeads;

  const ln1 = layerNorm(x, new Tensor([hiddenSize], w.ln1_w[layer]), new Tensor([hiddenSize], w.ln1_b[layer]));
  const qkv = matmul(ln1.reshape([seq, hiddenSize]), new Tensor([hiddenSize, 3 * hiddenSize], w.qkv_w[layer]));
  const qkvBias = addBias(qkv, new Tensor([3 * hiddenSize], w.qkv_b[layer]));

  const q = new Tensor([seq, hiddenSize]); const k = new Tensor([seq, hiddenSize]); const v = new Tensor([seq, hiddenSize]);
  for (let i = 0; i < seq; i++) {
    for (let h = 0; h < numHeads; h++) {
      for (let d = 0; d < headDim; d++) {
        q.data[i * hiddenSize + h * headDim + d] = qkvBias.data[i * 3 * hiddenSize + h * headDim + d];
        k.data[i * hiddenSize + h * headDim + d] = qkvBias.data[i * 3 * hiddenSize + hiddenSize + h * headDim + d];
        v.data[i * hiddenSize + h * headDim + d] = qkvBias.data[i * 3 * hiddenSize + 2 * hiddenSize + h * headDim + d];
      }
    }
  }

  const attnOut = new Tensor([seq, hiddenSize]);
  for (let h = 0; h < numHeads; h++) {
    const qh = new Tensor([seq, headDim]);
    const kh = new Tensor([seq, headDim]);
    const vh = new Tensor([seq, headDim]);
    for (let i = 0; i < seq; i++) {
      for (let d = 0; d < headDim; d++) {
        qh.data[i * headDim + d] = q.data[i * hiddenSize + h * headDim + d];
        kh.data[i * headDim + d] = k.data[i * hiddenSize + h * headDim + d];
        vh.data[i * headDim + d] = v.data[i * hiddenSize + h * headDim + d];
      }
    }
    const oh = attention(qh, kh, vh, true, scratch);
    for (let i = 0; i < seq; i++) {
      for (let d = 0; d < headDim; d++) {
        attnOut.data[i * hiddenSize + h * headDim + d] = oh.data[i * headDim + d];
      }
    }
  }

  const attnProj = matmul(attnOut, new Tensor([hiddenSize, hiddenSize], w.attn_out_w[layer]));
  const attnProjBias = addBias(attnProj, new Tensor([hiddenSize], w.attn_out_b[layer]));
  const res1 = add(x, attnProjBias);

  const ln2 = layerNorm(res1, new Tensor([hiddenSize], w.ln2_w[layer]), new Tensor([hiddenSize], w.ln2_b[layer]));
  const ffn1 = matmul(ln2, new Tensor([hiddenSize, intermediateSize], w.ffn_w1[layer]));
  const ffn1Bias = addBias(ffn1, new Tensor([intermediateSize], w.ffn_b1[layer]));
  const ffnAct = gelu(ffn1Bias);
  const ffn2 = matmul(ffnAct, new Tensor([intermediateSize, hiddenSize], w.ffn_w2[layer]));
  const ffn2Bias = addBias(ffn2, new Tensor([hiddenSize], w.ffn_b2[layer]));
  const res2 = add(res1, ffn2Bias);
  return res2;
}

export function forwardTransformer(
  inputIds: Int32Array,
  w: TransformerWeights,
  cfg: TransformerConfig,
  scratch: { attn: Float32Array; qkv: Float32Array; attnOut: Float32Array; ffn1: Float32Array; ffn2: Float32Array; ln1: Float32Array; ln2: Float32Array; hid: Float32Array }
): { logits: Float32Array; hidden: Float32Array } {
  const { vocabSize, hiddenSize, numLayers, maxSeqLen } = cfg;
  const seq = inputIds.length;
  if (seq > maxSeqLen) throw new Error(`序列长度 ${seq} 超过最大 ${maxSeqLen}`);

  const h = new Tensor([seq, hiddenSize]);
  for (let i = 0; i < seq; i++) {
    const tid = inputIds[i];
    const embOff = tid * hiddenSize;
    const posOff = i * hiddenSize;
    for (let d = 0; d < hiddenSize; d++) h.data[i * hiddenSize + d] = w.wte[embOff + d] + w.wpe[posOff + d];
  }

  let cur = h;
  for (let l = 0; l < numLayers; l++) {
    cur = transformerBlock(cur, l, w, cfg, scratch);
  }

  const lnF = layerNorm(cur, new Tensor([hiddenSize], w.ln_f_w), new Tensor([hiddenSize], w.ln_f_b));
  const logits = matmul(lnF, new Tensor([hiddenSize, vocabSize], w.lm_head_w));
  const logitsBias = addBias(logits, new Tensor([vocabSize], w.lm_head_b));

  return { logits: logitsBias.data, hidden: lnF.data };
}

export function greedySample(logits: Float32Array, vocabSize: number): number {
  let best = 0, bestV = logits[0];
  for (let i = 1; i < vocabSize; i++) if (logits[i] > bestV) { bestV = logits[i]; best = i; }
  return best;
}

/** ===================== 反向传播（训练期用）===================== */
/** 单样本交叉熵梯度：d_logits = probs - onehot(target) */
export function xentGrad(logits: Float32Array, targetId: number, vocabSize: number): { loss: number; grad: Float32Array } {
  let max = -Infinity;
  for (let i = 0; i < vocabSize; i++) if (logits[i] > max) max = logits[i];
  let sum = 0;
  for (let i = 0; i < vocabSize; i++) { sum += Math.exp(logits[i] - max); }
  const invSum = 1 / sum;
  const probs = new Float32Array(vocabSize);
  for (let i = 0; i < vocabSize; i++) probs[i] = Math.exp(logits[i] - max) * invSum;
  const loss = -Math.log(probs[targetId] + 1e-8);
  const grad = new Float32Array(vocabSize);
  for (let i = 0; i < vocabSize; i++) grad[i] = probs[i] - (i === targetId ? 1 : 0);
  return { loss, grad };
}

export function temperatureSample(logits: Float32Array, vocabSize: number, temperature: number, rng: () => number): number {
  const t = Math.max(0.01, temperature);
  const probs = new Float32Array(vocabSize);
  let max = -Infinity;
  for (let i = 0; i < vocabSize; i++) if (logits[i] / t > max) max = logits[i] / t;
  let sum = 0;
  for (let i = 0; i < vocabSize; i++) { probs[i] = Math.exp(logits[i] / t - max); sum += probs[i]; }
  const invSum = 1 / sum;
  for (let i = 0; i < vocabSize; i++) probs[i] *= invSum;
  const r = rng();
  let acc = 0;
  for (let i = 0; i < vocabSize; i++) { acc += probs[i]; if (r <= acc) return i; }
  return vocabSize - 1;
}