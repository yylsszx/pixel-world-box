// ============ DomainModel — 游戏领域小模型（公共出口） ============
export { Tensor, add, mul, tanh, softmax, sigmoid, matmul, addBias, layerNorm, gelu, clip, quantizeInt8, dequantizeInt8, type Shape } from './tensor';
export {
  TransformerConfig, TransformerWeights, DEFAULT_CONFIG, paramEstimate, initWeights,
  attention, transformerBlock, forwardTransformer, greedySample, temperatureSample,
  type TransformerWeights as TransformerWeightsType,
} from './transformer';
export {
  DomainTokenizer, DEFAULT_TOKENIZER_CONFIG, type TokenizerConfig,
  encodeWorldState, decodeModelAction, type WorldStateSnapshot, type ModelAction,
} from './tokenizer';
export {
  DomainModel, DomainModelConfig, DEFAULT_SMALL_CONFIG, LARGE_1B_CONFIG, type ModelAction as DomainModelAction,
} from './model';
export type { DomainWeightEntry } from './model';