// 高效全参数训练：小网络 32→64→12，约3K参数，30秒内可完成多轮
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../../src/lib/game/noise';
import { Tensor, matmul, addBias, gelu, softmax, quantizeInt8, dequantizeInt8 } from '../../src/lib/game/domain-model/tensor';

const SEED = 20261104;
const rng = mulberry32(SEED);
const U = (a: number, b: number) => a + rng() * (b - a);
const POLICY_ACTION_IDX: Record<string, number> = { wait:0,move:1,attack:2,declare_war:3,make_peace:4,form_alliance:5,issue_directive:6,spawn:7,build:8,cast:9,heal_land:10,terraform:11 };

function genFeatures(): Float32Array {
  const f = new Float32Array(32);
  for (let i = 0; i < 32; i++) f[i] = U(0, 1);
  return f;
}
function teacher(f: Float32Array): number {
  const [popN,tilesN,goldN,techN,stabN,warN,allyN,enemyNear,borderTension,foodN,hpN,killsN,ageN,disasterN] = f;
  if (hpN < 0.25 && stabN < 0.3 && enemyNear > 0.5) return POLICY_ACTION_IDX.make_peace;
  if (stabN < 0.2 && disasterN > 0.7) return POLICY_ACTION_IDX.heal_land;
  if (popN > 0.7 && stabN > 0.6 && enemyNear < 0.3 && borderTension > 0.5) {
    if (rng() < 0.4) return POLICY_ACTION_IDX.declare_war;
    if (rng() < 0.4) return POLICY_ACTION_IDX.build;
    return POLICY_ACTION_IDX.spawn;
  }
  if (goldN > 0.6 && techN < 0.4) return POLICY_ACTION_IDX.issue_directive;
  if (borderTension > 0.6 && allyN < 0.5 && enemyNear > 0.4) return POLICY_ACTION_IDX.form_alliance;
  if (enemyNear > 0.5 && hpN > 0.4) return rng() < 0.5 ? POLICY_ACTION_IDX.attack : POLICY_ACTION_IDX.move;
  const r = rng();
  if (r < 0.4) return POLICY_ACTION_IDX.wait;
  if (r < 0.7) return POLICY_ACTION_IDX.move;
  return POLICY_ACTION_IDX.build;
}

const NUM_TRAIN = 3000, NUM_VAL = 600, EPOCHS = 80, LR = 3e-3, BATCH = 128;
const inDim = 32, h1 = 64, h2 = 32, outDim = 12;

const trainX: Float32Array[] = [], trainY: number[] = [], valX: Float32Array[] = [], valY: number[] = [];
for (let i = 0; i < NUM_TRAIN + NUM_VAL; i++) {
  const f = genFeatures(); const y = teacher(f);
  if (i < NUM_TRAIN) { trainX.push(f); trainY.push(y); } else { valX.push(f); valY.push(y); }
}

const w1 = new Float32Array(inDim * h1), b1 = new Float32Array(h1);
const w2 = new Float32Array(h1 * h2), b2 = new Float32Array(h2);
const w3 = new Float32Array(h2 * outDim), b3 = new Float32Array(outDim);
const xav = (a: number, b: number) => Math.sqrt(6 / (a + b));
for (let i = 0; i < w1.length; i++) w1[i] = (rng() * 2 - 1) * xav(inDim, h1);
for (let i = 0; i < w2.length; i++) w2[i] = (rng() * 2 - 1) * xav(h1, h2);
for (let i = 0; i < w3.length; i++) w3[i] = (rng() * 2 - 1) * xav(h2, outDim);

const mw1 = new Float32Array(w1.length), mb1 = new Float32Array(h1);
const mw2 = new Float32Array(w2.length), mb2 = new Float32Array(h2);
const mw3 = new Float32Array(w3.length), mb3 = new Float32Array(outDim);

function geluP(z: number): number {
  const t = Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z * z * z));
  return 0.5 * (1 + t) + 0.5 * z * (1 - t * t) * Math.sqrt(2 / Math.PI) * 0.044715 * 3 * z * z;
}

function forward(x: Float32Array) {
  const a1 = new Float32Array(h1); for (let j = 0; j < h1; j++) { let s = 0; for (let i = 0; i < inDim; i++) s += x[i] * w1[i * h1 + j]; a1[j] = s + b1[j]; }
  const g1 = new Float32Array(h1); for (let i = 0; i < h1; i++) { const z = a1[i]; const t = Math.tanh(Math.sqrt(2/Math.PI) * (z + 0.044715 * z * z * z)); g1[i] = 0.5 * z * (1 + t); }
  const a2 = new Float32Array(h2); for (let j = 0; j < h2; j++) { let s = 0; for (let i = 0; i < h1; i++) s += g1[i] * w2[i * h2 + j]; a2[j] = s + b2[j]; }
  const g2 = new Float32Array(h2); for (let i = 0; i < h2; i++) { const z = a2[i]; const t = Math.tanh(Math.sqrt(2/Math.PI) * (z + 0.044715 * z * z * z)); g2[i] = 0.5 * z * (1 + t); }
  const logits = new Float32Array(outDim); for (let j = 0; j < outDim; j++) { let s = 0; for (let i = 0; i < h2; i++) s += g2[i] * w3[i * outDim + j]; logits[j] = s + b3[j]; }
  return { logits, cache: { x, g1, g2, a1, a2 } };
}

function softmax(logits: Float32Array) {
  let max = -Infinity; for (let i = 0; i < outDim; i++) if (logits[i] > max) max = logits[i];
  let sum = 0; const p = new Float32Array(outDim);
  for (let i = 0; i < outDim; i++) { p[i] = Math.exp(logits[i] - max); sum += p[i]; }
  for (let i = 0; i < outDim; i++) p[i] /= sum;
  return p;
}

function evalModel() {
  let loss = 0, correct = 0;
  for (let i = 0; i < NUM_VAL; i++) {
    const { logits } = forward(valX[i]);
    const p = softmax(logits);
    loss += -Math.log(p[valY[i]] + 1e-8);
    let best = 0; for (let j = 1; j < outDim; j++) if (p[j] > p[best]) best = j;
    if (best === valY[i]) correct++;
  }
  return { loss: loss / NUM_VAL, acc: correct / NUM_VAL };
}

console.log(`🎯 全参数快速训练：${inDim}→${h1}→${h2}→${outDim} ≈ ${(inDim*h1+h1+h1*h2+h2+h2*outDim+outDim).toLocaleString()} 参数`);
console.log(`   样本：训练 ${NUM_TRAIN} / 验证 ${NUM_VAL} / 轮数 ${EPOCHS}`);

let bestVal = Infinity;
for (let epoch = 0; epoch < EPOCHS; epoch++) {
  const perm = [...Array(NUM_TRAIN).keys()].sort(() => rng() - 0.5);
  let trainLoss = 0;
  for (let b = 0; b < NUM_TRAIN; b += BATCH) {
    const batch = perm.slice(b, b + BATCH);
    for (const idx of batch) {
      const { logits, cache } = forward(trainX[idx]);
      const p = softmax(logits);
      trainLoss += -Math.log(p[trainY[idx]] + 1e-8);
      const d3 = new Float32Array(outDim);
      for (let j = 0; j < outDim; j++) d3[j] = p[j] - (j === trainY[idx] ? 1 : 0);
      // w3, b3
      for (let i = 0; i < h2; i++) for (let j = 0; j < outDim; j++) {
        const g = cache.g2[i] * d3[j];
        mw3[i * outDim + j] = 0.9 * mw3[i * outDim + j] - LR * g;
        w3[i * outDim + j] += mw3[i * outDim + j];
      }
      for (let j = 0; j < outDim; j++) { mb3[j] = 0.9 * mb3[j] - LR * d3[j]; b3[j] += mb3[j]; }
      // d2
      const d2 = new Float32Array(h2);
      for (let i = 0; i < h2; i++) { let s = 0; for (let j = 0; j < outDim; j++) s += d3[j] * w3[i * outDim + j]; d2[i] = s * geluP(cache.a2[i]); }
      // w2, b2
      for (let i = 0; i < h1; i++) for (let j = 0; j < h2; j++) {
        const g = cache.g1[i] * d2[j];
        mw2[i * h2 + j] = 0.9 * mw2[i * h2 + j] - LR * g;
        w2[i * h2 + j] += mw2[i * h2 + j];
      }
      for (let j = 0; j < h2; j++) { mb2[j] = 0.9 * mb2[j] - LR * d2[j]; b2[j] += mb2[j]; }
      // d1
      const d1 = new Float32Array(h1);
      for (let i = 0; i < h1; i++) { let s = 0; for (let j = 0; j < h2; j++) s += d2[j] * w2[i * h2 + j]; d1[i] = s * geluP(cache.a1[i]); }
      // w1, b1
      for (let i = 0; i < inDim; i++) for (let j = 0; j < h1; j++) {
        const g = cache.x[i] * d1[j];
        mw1[i * h1 + j] = 0.9 * mw1[i * h1 + j] - LR * g;
        w1[i * h1 + j] += mw1[i * h1 + j];
      }
      for (let j = 0; j < h1; j++) { mb1[j] = 0.9 * mb1[j] - LR * d1[j]; b1[j] += mb1[j]; }
    }
    trainLoss /= batch.length;
  }
  const val = evalModel();
  if (val.loss < bestVal) bestVal = val.loss;
  if (epoch % 20 === 0 || epoch === EPOCHS - 1) {
    console.log(`   Epoch ${epoch + 1}/${EPOCHS}  trainLoss=${trainLoss.toFixed(4)} valLoss=${val.loss.toFixed(4)} valAcc=${(val.acc * 100).toFixed(1)}%`);
  }
}

// 导出 Int8 权重
const q = (arr: Float32Array) => { let max = 0; for (let i = 0; i < arr.length; i++) { const v = Math.abs(arr[i]); if (v > max) max = v; } const scale = max > 0 ? 127 / max : 1; const qi = new Int8Array(arr.length); for (let i = 0; i < arr.length; i++) qi[i] = Math.round(arr[i] * scale); return { q: Array.from(qi), scale }; };
const Q = { w1: q(w1), b1: q(b1), w2: q(w2), b2: q(b2), w3: q(w3), b3: q(b3) };
const total = Object.values(Q).reduce((a, { q }) => a + q.length, 0);

const outDir = join(process.cwd(), 'src', 'lib', 'game', 'domain-model');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const src = `// ⚠ AUTO-GENERATED by scripts/domain-model/train-full-fast.ts — DO NOT EDIT BY HAND
// 游戏领域离线战略 AI 权重（Int8 逐张量量化）
// 架构：32→64→32→12，全参数训练
// 参数：${total.toLocaleString()}（Int8 量化）
// 训练：行为克隆，${NUM_TRAIN} 训练/${NUM_VAL} 验证，${EPOCHS} 轮，全参数 SGD+动量
// 训练时间：${new Date().toISOString()}
export interface FW { q: number[]; scale: number; }
export const POLICY_WEIGHTS_FW: Record<string, FW> = ${JSON.stringify(Q, null, 2)};
export const POLICY_MODEL_META_FW = { trainedAt: ${JSON.stringify(new Date().toISOString())}, seed: ${SEED}, totalParams: ${total}, arch: [${inDim},${h1},${h2},${outDim}], bestValLoss: ${bestVal.toFixed(4)} } as const;
`;
writeFileSync(join(outDir, 'policy-weights-fw.ts'), src);
console.log(`\n💾 权重：${total.toLocaleString()} 参数 ≈ ${(total / 1024).toFixed(1)} KB，最佳 valLoss=${bestVal.toFixed(4)}`);
console.log(`✓ 已写出：${join(outDir, 'policy-weights-fw.ts')}`);
