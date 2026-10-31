// ============ 极简快速训练：只训练输出层（特征提取器固定） ============
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { mulberry32 } from '../../src/lib/game/noise';
import {
  initPolicyWeights, policyForward, policyParamCount, exportPolicyQuantized,
  importPolicyQuantized, DEFAULT_POLICY_CONFIG, POLICY_ACTIONS, POLICY_ACTION_IDX,
} from '../../src/lib/game/domain-model/policy-net';
import { Tensor, matmul, addBias, gelu, softmax } from '../../src/lib/game/domain-model/tensor';

const SEED = 20261103;
const rng = mulberry32(SEED);
const U = (a: number, b: number) => a + rng() * (b - a);

const RACES = ['人类', '精灵', '矮人', '兽人', '蜥蜴人', '哥布林', '巨魔', '食人魔', '白行者', '吸血鬼'];

function genCivFeatures(): Float32Array {
  const f = new Float32Array(32);
  for (let i = 0; i < 32; i++) f[i] = U(0, 1);
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
  const NUM_TRAIN = 5000;
  const NUM_VAL = 1000;
  const EPOCHS = 100;
  const LR = 0.1;

  console.log(`🎯 极简输出层训练：离线战略 AI`);
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

  // 预计算隐藏层特征（固定，不训练）
  function hiddenFeatures(x: Float32Array): Float32Array {
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
    return g3.data; // [h3] 隐藏特征
  }

  const trainH: Float32Array[] = trainX.map(hiddenFeatures);
  const valH: Float32Array[] = valX.map(hiddenFeatures);

  // 只训练输出层 w4 [h3, outDim], b4 [outDim]
  const outDim = cfg.outDim;
  const momW = new Float32Array(h3 * outDim);
  const momB = new Float32Array(outDim);

  console.log(`\n🚀 开始输出层训练...`);
  let bestVal = Infinity;
  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const perm = [...Array(trainX.length).keys()].sort(() => rng() - 0.5);
    let trainLoss = 0;
    for (let b = 0; b < trainX.length; b += 256) {
      const batch = perm.slice(b, b + 256);
      for (const idx of batch) {
        const h = trainH[idx];
        // 前向：logits = h @ w4 + b4
        const logits = new Float32Array(outDim);
        for (let j = 0; j < outDim; j++) {
          let s = 0;
          for (let i = 0; i < h3; i++) s += h[i] * w.w4[i * outDim + j];
          logits[j] = s + w.b4[j];
        }
        // softmax
        let max = -Infinity; for (let j = 0; j < outDim; j++) if (logits[j] > max) max = logits[j];
        let sum = 0; const probs = new Float32Array(outDim);
        for (let j = 0; j < outDim; j++) { probs[j] = Math.exp(logits[j] - max); sum += probs[j]; }
        for (let j = 0; j < outDim; j++) probs[j] /= sum;
        trainLoss += -Math.log(probs[trainY[idx]] + 1e-8);

        // 反向：d4 = probs - onehot
        const d4 = new Float32Array(outDim);
        for (let j = 0; j < outDim; j++) d4[j] = probs[j] - (j === trainY[idx] ? 1 : 0);

        // 更新 w4, b4
        for (let i = 0; i < h3; i++) {
          for (let j = 0; j < outDim; j++) {
            const g = h[i] * d4[j];
            momW[i * outDim + j] = 0.9 * momW[i * outDim + j] - LR * g;
            w.w4[i * outDim + j] += momW[i * outDim + j];
          }
        }
        for (let j = 0; j < outDim; j++) {
          momB[j] = 0.9 * momB[j] - LR * d4[j];
          w.b4[j] += momB[j];
        }
      }
      trainLoss /= batch.length;
    }
    // 验证
    let valLoss = 0, correct = 0;
    for (let i = 0; i < valX.length; i++) {
      const h = valH[i];
      const logits = new Float32Array(outDim);
      for (let j = 0; j < outDim; j++) {
        let s = 0; for (let i = 0; i < h3; i++) s += h[i] * w.w4[i * outDim + j];
        logits[j] = s + w.b4[j];
      }
      let max = -Infinity; for (let j = 0; j < outDim; j++) if (logits[j] > max) max = logits[j];
      let sum = 0; const probs = new Float32Array(outDim);
      for (let j = 0; j < outDim; j++) { probs[j] = Math.exp(logits[j] - max); sum += probs[j]; }
      for (let j = 0; j < outDim; j++) probs[j] /= sum;
      valLoss += -Math.log(probs[valY[i]] + 1e-8);
      let best = 0; for (let j = 1; j < outDim; j++) if (probs[j] > probs[best]) best = j;
      if (best === valY[i]) correct++;
    }
    valLoss /= valX.length;
    if (valLoss < bestVal) bestVal = valLoss;
    if (epoch % 20 === 0 || epoch === EPOCHS - 1) {
      console.log(`   Epoch ${epoch + 1}/${EPOCHS}  trainLoss=${trainLoss.toFixed(4)} valLoss=${valLoss.toFixed(4)} valAcc=${(correct / valX.length * 100).toFixed(1)}%`);
    }
  }

  const qw = exportPolicyQuantized(w);
  const totalParams = Object.values(qw).reduce((a, { q }) => a + q.length, 0);
  console.log(`\n💾 量化权重：${totalParams.toLocaleString()} 参数 ≈ ${(totalParams / 1024).toFixed(1)} KB`);
  console.log(`✓ 最佳验证损失：${bestVal.toFixed(4)}`);

  const outDir = join(process.cwd(), 'src', 'lib', 'game', 'domain-model');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const weightSrc = `// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ AUTO-GENERATED by scripts/domain-model/train-output-only.ts — DO NOT EDIT BY HAND
// 游戏领域离线战略 AI 权重（Int8 逐张量量化；运行时反量化为 Float32）
// 领域：文明战略决策（宣战/议和/结盟/建造/生成/施法/治疗/塑地/等待）
// 架构：3 层 MLP（32→256→128→64→12），GELU 激活，Softmax 输出（隐藏层固定，仅训练输出层）
// 参数：${totalParams.toLocaleString()} ≈ ${(totalParams / 1e3).toFixed(1)}K（Int8 量化）
// 训练：行为克隆，${NUM_TRAIN} 训练 / ${NUM_VAL} 验证，${EPOCHS} 轮，仅输出层 SGD+动量
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
  console.log('\n✅ 极简训练完成。');
}

main().catch((e) => { console.error(e); process.exit(1); });
