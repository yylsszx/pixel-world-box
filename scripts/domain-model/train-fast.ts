// ============ 快速训练脚本：验证架构并生成离线权重 ============
// 用于快速验证训练管线，生成可用的 Int8 离线权重
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../../src/lib/game/noise';
import {
  initPolicyWeights, policyForward, policyParamCount, exportPolicyQuantized,
  importPolicyQuantized, DEFAULT_POLICY_CONFIG, POLICY_ACTIONS, POLICY_ACTION_IDX,
} from '../../src/lib/game/domain-model/policy-net';
import { Tensor, matmul, addBias, gelu, softmax } from '../../src/lib/game/domain-model/tensor';

const SEED = 20261102;
const rng = mulberry32(SEED);
const U = (a: number, b: number) => a + rng() * (b - a);
const pick = <T>(arr: T[]): T => arr[(rng() * arr.length) | 0];

const RACES = ['人类', '精灵', '矮人', '兽人', '蜥蜴人', '哥布林', '巨魔', '食人魔', '白行者', '吸血鬼'];
const CIV_NAMES = ['冬堡', '晨曦', '黑牙', '绿洲', '铁堡', '圣城', '港口', '风暴', '龙脊', '月湖'];

function genCivFeatures(): Float32Array {
  const f = new Float32Array(32);
  f[0] = U(0, 1); f[1] = U(0, 1); f[2] = U(0, 1); f[3] = U(0, 1); f[4] = U(0, 1);
  f[5] = U(0, 1); f[6] = U(0, 1); f[7] = rng() < 0.3 ? 1 : 0;
  f[8] = U(0, 1); f[9] = 0.5; f[10] = U(0.5, 1); f[11] = U(0, 1);
  f[12] = U(0, 1); f[13] = U(0, 1); f[14] = U(0, 1);
  for (let i = 15; i < 32; i++) f[i] = U(0, 1);
  return f;
}

function teacherAction(f: Float32Array): number {
  const [popN, tilesN, goldN, techN, stabN, warN, allyN, enemyNear, borderTension, foodN, hpN, killsN, ageN, disasterN] = f;
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

async function main() {
  const NUM_TRAIN = 3000;
  const NUM_VAL = 600;
  const EPOCHS = 50;
  const LR = 2e-3;
  const BATCH = 128;

  console.log(`🎯 快速训练：离线战略 AI`);
  console.log(`   模型：${JSON.stringify(DEFAULT_POLICY_CONFIG)}`);
  console.log(`   参数量：${policyParamCount(DEFAULT_POLICY_CONFIG).toLocaleString()}`);
  console.log(`   样本：训练 ${NUM_TRAIN} / 验证 ${NUM_VAL} / 轮数 ${EPOCHS}`);

  const trainX: Float32Array[] = []; const trainY: number[] = [];
  const valX: Float32Array[] = []; const valY: number[] = [];
  for (let i = 0; i < NUM_TRAIN + NUM_VAL; i++) {
    const f = genCivFeatures();
    const y = teacherAction(f);
    if (i < NUM_TRAIN) { trainX.push(f); trainY.push(y); }
    else { valX.push(f); valY.push(y); }
  }

  const cfg = DEFAULT_POLICY_CONFIG;
  const [h1, h2, h3] = cfg.hiddenDims;
  const w = initPolicyWeights(cfg, mulberry32(12345));
  const mom = {
    vw1: new Float32Array(cfg.inDim * h1), vb1: new Float32Array(h1),
    vw2: new Float32Array(h1 * h2), vb2: new Float32Array(h2),
    vw3: new Float32Array(h2 * h3), vb3: new Float32Array(h3),
    vw4: new Float32Array(h3 * cfg.outDim), vb4: new Float32Array(cfg.outDim),
  };

  function forwardWithCache(x: Float32Array) {
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
    return { probs: softmax(a4).data, cache: { x, g1, g2, g3, a1, a2, a3 } };
  }

  function evaluate() {
    let loss = 0, correct = 0;
    for (let i = 0; i < valX.length; i++) {
      const { probs } = forwardWithCache(valX[i]);
      loss += -Math.log(probs[valY[i]] + 1e-8);
      let best = 0; for (let j = 1; j < cfg.outDim; j++) if (probs[j] > probs[best]) best = j;
      if (best === valY[i]) correct++;
    }
    return { loss: loss / valX.length, acc: correct / valX.length };
  }

  function geluP(z: number): number {
    const t = Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z * z * z));
    return 0.5 * (1 + t) + 0.5 * z * (1 - t * t) * Math.sqrt(2 / Math.PI) * 0.044715 * 3 * z * z;
  }

  console.log(`\n🚀 开始训练...`);
  let bestVal = Infinity;
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const perm = [...Array(trainX.length).keys()].sort(() => rng() - 0.5);
    let trainLoss = 0;
    for (let b = 0; b < trainX.length; b += BATCH) {
      const batchIdx = perm.slice(b, b + BATCH);
      for (const idx of batchIdx) {
        const { probs, cache } = forwardWithCache(trainX[idx]);
        trainLoss += -Math.log(probs[trainY[idx]] + 1e-8);
        const outDim = cfg.outDim;
        const d4 = new Float32Array(outDim);
        for (let j = 0; j < outDim; j++) d4[j] = probs[j] - (j === trainY[idx] ? 1 : 0);

        const gw4 = new Float32Array(h3 * outDim);
        const d3 = new Float32Array(h3);
        for (let i = 0; i < h3; i++) {
          let s = 0;
          for (let j = 0; j < outDim; j++) {
            gw4[i * outDim + j] = cache.g3.data[i] * d4[j];
            s += d4[j] * w.w4[i * outDim + j];
          }
          d3[i] = s * geluP(cache.a3.data[i]);
        }
        const gw3 = new Float32Array(h2 * h3);
        const d2 = new Float32Array(h2);
        for (let i = 0; i < h2; i++) {
          let s = 0;
          for (let j = 0; j < h3; j++) {
            gw3[i * h3 + j] = cache.g2.data[i] * d3[j];
            s += d3[j] * w.w3[i * h3 + j];
          }
          d2[i] = s * geluP(cache.a2.data[i]);
        }
        const gw2 = new Float32Array(h1 * h2);
        const d1 = new Float32Array(h1);
        for (let i = 0; i < h1; i++) {
          let s = 0;
          for (let j = 0; j < h2; j++) {
            gw2[i * h2 + j] = cache.g1.data[i] * d2[j];
            s += d2[j] * w.w2[i * h2 + j];
          }
          d1[i] = s * geluP(cache.a1.data[i]);
        }
        const gw1 = new Float32Array(cfg.inDim * h1);
        for (let i = 0; i < cfg.inDim; i++)
          for (let j = 0; j < h1; j++)
            gw1[i * h1 + j] = trainX[idx][i] * d1[j];

        const upd = (wArr: Float32Array, g: Float32Array, v: Float32Array) => {
          for (let i = 0; i < wArr.length; i++) {
            v[i] = 0.9 * v[i] - LR * g[i];
            wArr[i] += v[i];
          }
        };
        upd(w.w4, gw4, mom.vw4);
        upd(w.b4, d4, mom.vb4);
        upd(w.w3, gw3, mom.vw3);
        upd(w.b3, d3, mom.vb3);
        upd(w.w2, gw2, mom.vw2);
        upd(w.b2, d2, mom.vb2);
        upd(w.w1, gw1, mom.vw1);
        upd(w.b1, d1, mom.vb1);
      }
      trainLoss /= batchIdx.length;
    }
    const val = evaluate();
    if (val.loss < bestVal) bestVal = val.loss;
    if (epoch % 10 === 0 || epoch === EPOCHS - 1) {
      console.log(`   Epoch ${epoch + 1}/${EPOCHS}  trainLoss=${trainLoss.toFixed(4)} valLoss=${val.loss.toFixed(4)} valAcc=${(val.acc * 100).toFixed(1)}%`);
    }
  }

  const qw = exportPolicyQuantized(w);
  const totalParams = Object.values(qw).reduce((a, { q }) => a + q.length, 0);
  console.log(`\n💾 量化权重：${totalParams.toLocaleString()} 参数 ≈ ${(totalParams / 1024).toFixed(1)} KB`);
  console.log(`✓ 最佳验证损失：${bestVal.toFixed(4)}`);

  const outDir = join(process.cwd(), 'src', 'lib', 'game', 'domain-model');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const weightSrc = `// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ AUTO-GENERATED by scripts/domain-model/train-fast.ts — DO NOT EDIT BY HAND
// 游戏领域离线战略 AI 权重（Int8 逐张量量化；运行时反量化为 Float32）
// 领域：文明战略决策（宣战/议和/结盟/建造/生成/施法/治疗/塑地/等待）
// 架构：3 层 MLP（32→256→128→64→12），GELU 激活，Softmax 输出
// 参数：${totalParams.toLocaleString()} ≈ ${(totalParams / 1e3).toFixed(1)}K（Int8 量化）
// 训练：行为克隆，${NUM_TRAIN} 训练 / ${NUM_VAL} 验证，${EPOCHS} 轮，SGD+动量
// 标注器：engine 内置教师策略启发式
// 训练时间：${new Date().toISOString()}
═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export interface PolicyWeightEntry { q: number[]; scale: number; }

export const POLICY_WEIGHTS: Record<string, PolicyWeightEntry> = ${JSON.stringify(qw, null, 2)};

export const POLICY_MODEL_META = {
  trainedAt: ${JSON.stringify(new Date().toISOString())},
  seed: ${SEED},
  trainSamples: ${NUM_TRAIN},
  valSamples: ${NUM_VAL},
  epochs: ${EPOCHS},
  totalParams: ${totalParams},
  arch: ${JSON.stringify(DEFAULT_POLICY_CONFIG)},
  bestValLoss: ${bestVal.toFixed(4)},
} as const;
`;

  writeFileSync(join(outDir, 'policy-weights.ts'), weightSrc);
  console.log(`\n✓ 离线权重已写出：${join(outDir, 'policy-weights.ts')}`);

  const w2 = importPolicyQuantized(cfg, qw);
  let correct = 0;
  for (let i = 0; i < valX.length; i++) {
    const probs = policyForward(valX[i], w2, cfg);
    let best = 0; for (let j = 1; j < cfg.outDim; j++) if (probs[j] > probs[best]) best = j;
    if (best === valY[i]) correct++;
  }
  console.log(`✓ 离线权重复检准确率：${((correct / valX.length) * 100).toFixed(1)}%`);
  console.log('\n✅ 快速训练完成。');
}

main().catch((e) => { console.error(e); process.exit(1); });
