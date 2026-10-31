// ============ DomainModel — 游戏领域小模型（Transformer，~1B 参数可配） ============
import { Tensor, matmul, addBias, layerNorm, gelu, quantizeInt8, dequantizeInt8 } from './tensor';
import {
  TransformerConfig, TransformerWeights, initWeights, forwardTransformer, paramEstimate,
  greedySample, temperatureSample, DEFAULT_CONFIG,
} from './transformer';
import { DomainTokenizer, DEFAULT_TOKENIZER_CONFIG, encodeWorldState, decodeModelAction, type ModelAction, type WorldStateSnapshot } from './tokenizer';

export interface DomainModelConfig {
  transformer: TransformerConfig;
  tokenizer: typeof DEFAULT_TOKENIZER_CONFIG;
  temperature: number;
  maxGenLen: number;
}

export class DomainModel {
  readonly cfg: DomainModelConfig;
  readonly tok: DomainTokenizer;
  readonly w: TransformerWeights;
  private scratch: { attn: Float32Array; qkv: Float32Array; attnOut: Float32Array; ffn1: Float32Array; ffn2: Float32Array; ln1: Float32Array; ln2: Float32Array; hid: Float32Array };

  constructor(cfg: Partial<DomainModelConfig> = {}, weights?: TransformerWeights, rng?: () => number) {
    this.cfg = {
      transformer: { ...DEFAULT_CONFIG, ...(cfg.transformer ?? {}) },
      tokenizer: cfg.tokenizer ?? DEFAULT_TOKENIZER_CONFIG,
      temperature: cfg.temperature ?? 0.8,
      maxGenLen: cfg.maxGenLen ?? 64,
    };
    this.tok = new DomainTokenizer(this.cfg.tokenizer);
    this.w = weights ?? initWeights(this.cfg.transformer, rng ?? (() => Math.random()));

    const { hiddenSize, maxSeqLen } = this.cfg.transformer;
    this.scratch = {
      attn: new Float32Array(maxSeqLen),
      qkv: new Float32Array(hiddenSize * 3 * hiddenSize),
      attnOut: new Float32Array(maxSeqLen * hiddenSize),
      ffn1: new Float32Array(maxSeqLen * this.cfg.transformer.intermediateSize),
      ffn2: new Float32Array(maxSeqLen * hiddenSize),
      ln1: new Float32Array(hiddenSize),
      ln2: new Float32Array(hiddenSize),
      hid: new Float32Array(hiddenSize),
    };
  }

  paramCount(): number { return paramEstimate(this.cfg.transformer); }

  forward(inputIds: Int32Array): { logits: Float32Array; hidden: Float32Array } {
    return forwardTransformer(inputIds, this.w, this.cfg.transformer, this.scratch);
  }

  think(snap: WorldStateSnapshot): ModelAction {
    const inputIds = encodeWorldState(snap, this.tok);
    const { logits } = this.forward(inputIds);
    const vocab = this.cfg.transformer.vocabSize;
    const seqLen = inputIds.length;
    const lastPosLogits = new Float32Array(vocab);
    for (let i = 0; i < vocab; i++) lastPosLogits[i] = logits[(seqLen - 1) * vocab + i];

    const nextId = temperatureSample(lastPosLogits, vocab, this.cfg.temperature, Math.random);
    const genIds = [nextId];
    let curIds = new Int32Array([...inputIds, nextId]);
    for (let step = 1; step < this.cfg.maxGenLen; step++) {
      const { logits: lg } = this.forward(curIds);
      const last = new Float32Array(vocab);
      for (let i = 0; i < vocab; i++) last[i] = lg[(curIds.length - 1) * vocab + i];
      const nid = temperatureSample(last, vocab, this.cfg.temperature, Math.random);
      if (nid === this.tok.eos) break;
      genIds.push(nid);
      const next = new Int32Array(curIds.length + 1);
      next.set(curIds);
      next[curIds.length] = nid;
      curIds = next;
    }
    return decodeModelAction(genIds, this.tok);
  }

  predictNext(inputIds: Int32Array, pos: number): Float32Array {
    const { logits } = this.forward(inputIds);
    const vocab = this.cfg.transformer.vocabSize;
    const out = new Float32Array(vocab);
    for (let i = 0; i < vocab; i++) out[i] = logits[pos * vocab + i];
    return out;
  }

  exportQuantized(): { [key: string]: { q: number[]; scale: number } } {
    const out: { [key: string]: { q: number[]; scale: number } } = {};
    const add = (name: string, arr: Float32Array) => {
      const { q, scale } = quantizeInt8(new Tensor([arr.length], arr));
      out[name] = { q: Array.from(q), scale };
    };
    add('wte', this.w.wte);
    add('wpe', this.w.wpe);
    add('ln_f_w', this.w.ln_f_w);
    add('ln_f_b', this.w.ln_f_b);
    add('lm_head_w', this.w.lm_head_w);
    add('lm_head_b', this.w.lm_head_b);
    for (let l = 0; l < this.cfg.transformer.numLayers; l++) {
      add(`ln1_w_${l}`, this.w.ln1_w[l]);
      add(`ln1_b_${l}`, this.w.ln1_b[l]);
      add(`ln2_w_${l}`, this.w.ln2_w[l]);
      add(`ln2_b_${l}`, this.w.ln2_b[l]);
      add(`qkv_w_${l}`, this.w.qkv_w[l]);
      add(`qkv_b_${l}`, this.w.qkv_b[l]);
      add(`attn_out_w_${l}`, this.w.attn_out_w[l]);
      add(`attn_out_b_${l}`, this.w.attn_out_b[l]);
      add(`ffn_w1_${l}`, this.w.ffn_w1[l]);
      add(`ffn_b1_${l}`, this.w.ffn_b1[l]);
      add(`ffn_w2_${l}`, this.w.ffn_w2[l]);
      add(`ffn_b2_${l}`, this.w.ffn_b2[l]);
    }
    return out;
  }

  static fromQuantized(cfg: DomainModelConfig, qw: { [key: string]: { q: number[]; scale: number } }): DomainModel {
    const w = initWeights(cfg.transformer, () => 0);
    const set = (name: string, arr: Float32Array) => {
      const { q, scale } = qw[name];
      const dq = dequantizeInt8(Int8Array.from(q), scale, [arr.length]);
      arr.set(dq.data);
    };
    set('wte', w.wte);
    set('wpe', w.wpe);
    set('ln_f_w', w.ln_f_w);
    set('ln_f_b', w.ln_f_b);
    set('lm_head_w', w.lm_head_w);
    set('lm_head_b', w.lm_head_b);
    for (let l = 0; l < cfg.transformer.numLayers; l++) {
      set(`ln1_w_${l}`, w.ln1_w[l]);
      set(`ln1_b_${l}`, w.ln1_b[l]);
      set(`ln2_w_${l}`, w.ln2_w[l]);
      set(`ln2_b_${l}`, w.ln2_b[l]);
      set(`qkv_w_${l}`, w.qkv_w[l]);
      set(`qkv_b_${l}`, w.qkv_b[l]);
      set(`attn_out_w_${l}`, w.attn_out_w[l]);
      set(`attn_out_b_${l}`, w.attn_out_b[l]);
      set(`ffn_w1_${l}`, w.ffn_w1[l]);
      set(`ffn_b1_${l}`, w.ffn_b1[l]);
      set(`ffn_w2_${l}`, w.ffn_w2[l]);
      set(`ffn_b2_${l}`, w.ffn_b2[l]);
    }
    return new DomainModel(cfg, w);
  }
}

export const DEFAULT_SMALL_CONFIG: DomainModelConfig = {
  transformer: { ...DEFAULT_CONFIG, hiddenSize: 256, numLayers: 6, numHeads: 8, intermediateSize: 1024 },
  tokenizer: DEFAULT_TOKENIZER_CONFIG,
  temperature: 0.8,
  maxGenLen: 32,
};

export const LARGE_1B_CONFIG: DomainModelConfig = {
  transformer: { ...DEFAULT_CONFIG, hiddenSize: 2048, numLayers: 24, numHeads: 32, intermediateSize: 8192 },
  tokenizer: DEFAULT_TOKENIZER_CONFIG,
  temperature: 0.8,
  maxGenLen: 64,
};