// ============ DomainModel — 原生离线 AI（无外部 API 时接管战略决策） ============
// 把训练好的策略网络接入 GameEngine：每 N tick 抽取世界状态特征 → 策略网络推理 →
// 输出战略动作 → 映射到引擎 API（宣战/议和/结盟/建造/生成/施法/治疗/塑地/等待）。
// 完全离线，零外部依赖，权重内嵌（Int8 量化，≈49 KB）。
import { GameEngine } from '../engine';
import { RACES, T } from '../types';
import { W, H } from '../constants';
import { POLICY_ACTIONS, POLICY_ACTION_IDX } from './policy-net';
import { POLICY_WEIGHTS_FW } from './policy-weights-fw';

/** 新版全参数权重前向传播（32→64→32→12，纯数组实现） */
function forwardFW(x: Float32Array, w: typeof POLICY_WEIGHTS_FW): Float32Array {
  const inDim = 32, h1 = 64, h2 = 32, outDim = 12;
  const deq = (entry: { q: number[]; scale: number }) => entry.q.map(v => v / entry.scale);
  const W1 = deq(w.w1), B1 = deq(w.b1), W2 = deq(w.w2), B2 = deq(w.b2), W3 = deq(w.w3), B3 = deq(w.b3);
  const a1 = new Float32Array(h1);
  for (let j = 0; j < h1; j++) { let s = 0; for (let i = 0; i < inDim; i++) s += x[i] * W1[i * h1 + j]; a1[j] = s + B1[j]; }
  const g1 = new Float32Array(h1);
  for (let i = 0; i < h1; i++) { const z = a1[i]; const t = Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z * z * z)); g1[i] = 0.5 * z * (1 + t); }
  const a2 = new Float32Array(h2);
  for (let j = 0; j < h2; j++) { let s = 0; for (let i = 0; i < h1; i++) s += g1[i] * W2[i * h2 + j]; a2[j] = s + B2[j]; }
  const g2 = new Float32Array(h2);
  for (let i = 0; i < h2; i++) { const z = a2[i]; const t = Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z * z * z)); g2[i] = 0.5 * z * (1 + t); }
  const logits = new Float32Array(outDim);
  for (let j = 0; j < outDim; j++) { let s = 0; for (let i = 0; i < h2; i++) s += g2[i] * W3[i * outDim + j]; logits[j] = s + B3[j]; }
  // softmax
  let max = -Infinity;
  for (let j = 0; j < outDim; j++) if (logits[j] > max) max = logits[j];
  let sum = 0;
  const probs = new Float32Array(outDim);
  for (let j = 0; j < outDim; j++) { probs[j] = Math.exp(logits[j] - max); sum += probs[j]; }
  for (let j = 0; j < outDim; j++) probs[j] /= sum;
  return probs;
}

/** 离线 AI 状态 */
export interface OfflineAIState {
  enabled: boolean;
  lastAction: string | null;
  lastActionYear: number;
  calls: number;
  cooldown: number; // 剩余冷却 tick
}

/** 世界状态 → 32 维特征（与训练脚本 genCivFeatures 对齐） */
export function extractFeatures(eng: GameEngine, civIdx: number): Float32Array {
  const f = new Float32Array(32);
  const civs = eng.civs.filter((c) => c.alive);
  const c = civs[civIdx];
  if (!c) return f;

  const info = eng.getCivInfo(c.id);
  const popN = Math.min(1, c.pop / 200);
  const tilesN = Math.min(1, (info?.tiles ?? 0) / 400);
  const goldN = Math.min(1, (info?.gold ?? 0) / 10000);
  const techN = Math.min(1, (info?.techCount ?? 0) / 50);
  const stabN = (info?.stability ?? 0.5);
  const warN = Math.min(1, (info?.wars?.length ?? 0) / 5);
  const allyN = Math.min(1, (info?.allies?.length ?? 0) / 5);

  // 敌国邻近：检查是否有敌对文明在邻近领土
  let enemyNear = 0;
  for (const other of civs) {
    if (other.id === c.id) continue;
    const oinfo = eng.getCivInfo(other.id);
    if (oinfo?.wars?.includes(c.name)) { enemyNear = 1; break; }
  }

  const borderTension = Math.min(1, warN * 2 + (enemyNear * 0.5));
  const foodN = 0.5; // 简化：粮食充足
  const hpN = 0.8; // 简化：主力单位血量
  const killsN = Math.min(1, (c.kills ?? 0) / 50);
  const ageN = Math.min(1, eng.yearF / 500);
  const disasterN = Math.min(1, (eng.fireSet.size + eng.radSet.size) / 500);
  const radius = Math.min(1, tilesN * 1.5);

  f[0] = popN; f[1] = tilesN; f[2] = goldN; f[3] = techN; f[4] = stabN;
  f[5] = warN; f[6] = allyN; f[7] = enemyNear; f[8] = borderTension;
  f[9] = foodN; f[10] = hpN; f[11] = killsN; f[12] = ageN; f[13] = disasterN; f[14] = radius;
  // f15-31 保留为 0（扩展特征）
  return f;
}

/** 动作 → 引擎执行 */
export function executeOfflineAction(eng: GameEngine, actionIdx: number, civIdx: number): boolean {
  const action = POLICY_ACTIONS[actionIdx];
  const civs = eng.civs.filter((c) => c.alive);
  const c = civs[civIdx];
  if (!c) return false;

  try {
    switch (action) {
      case 'declare_war': {
        const target = civs.find((o) => o.id !== c.id && !o.alive === false);
        if (!target) return false;
        if (typeof (eng as any).declareWar === 'function') {
          (eng as any).declareWar(c.id, target.id, 'conquest');
        }
        return true;
      }
      case 'make_peace': {
        const target = civs.find((o) => o.id !== c.id);
        if (!target) return false;
        if (typeof (eng as any).makePeace === 'function') {
          (eng as any).makePeace(c.id, target.id);
        }
        return true;
      }
      case 'form_alliance': {
        const target = civs.find((o) => o.id !== c.id);
        if (!target) return false;
        if (typeof (eng as any).formAlliance === 'function') {
          (eng as any).formAlliance(c.id, target.id);
        }
        return true;
      }
      case 'issue_directive': {
        if (typeof (eng as any).issueDirective === 'function') {
          (eng as any).issueDirective(c.id, 'expand', 10);
        }
        return true;
      }
      case 'spawn': {
        const cx = c.capital >= 0 ? c.capital % W : 128;
        const cy = c.capital >= 0 ? Math.floor(c.capital / W) : 80;
        return eng.spawnUnit(0, cx, cy, { silent: true });
      }
      case 'build': {
        return true; // 建造由引擎自动处理
      }
      case 'cast': {
        return true; // 施法由玩家触发
      }
      case 'heal_land': {
        return true; // 治疗由玩家触发
      }
      case 'terraform': {
        return true; // 塑地由玩家触发
      }
      case 'wait':
      default:
        return true;
    }
  } catch (e) {
    console.warn('[OfflineAI] 动作执行失败:', action, e);
    return false;
  }
}

/** 离线 AI 代理 */
export class OfflineAI {
  readonly cfg = DEFAULT_POLICY_CONFIG;
  /** 新版全参数权重（32→64→32→12，Int8 量化） */
  readonly fwWeights: typeof POLICY_WEIGHTS_FW;
  readonly state: OfflineAIState;

  constructor(engine: GameEngine) {
    this.fwWeights = POLICY_WEIGHTS_FW;
    this.state = {
      enabled: false,
      lastAction: null,
      lastActionYear: -1,
      calls: 0,
      cooldown: 0,
    };
  }

  /** 每 tick 调用：在冷却结束后对主导文明做一次战略推理 */
  tick(eng: GameEngine): void {
    if (!this.state.enabled) return;
    if (this.state.cooldown > 0) { this.state.cooldown--; return; }

    const civs = eng.civs.filter((c) => c.alive);
    if (civs.length === 0) return;

    // 选人口最大的文明作为 AI 控制目标
    const civIdx = civs.reduce((best, c, i) => (c.pop > civs[best].pop ? i : best), 0);
    const f = extractFeatures(eng, civIdx);
    const probs = forwardFW(f, this.fwWeights);
    const actionIdx = this._sample(probs);

    const action = POLICY_ACTIONS[actionIdx];
    const ok = executeOfflineAction(eng, actionIdx, civIdx);

    this.state.lastAction = action;
    this.state.lastActionYear = Math.floor(eng.yearF);
    this.state.calls++;
    this.state.cooldown = 120; // 每 120 tick（约 8 秒@15tps）决策一次
  }

  private _sample(probs: Float32Array): number {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i];
      if (r <= acc) return i;
    }
    return probs.length - 1;
  }

  setEnabled(v: boolean) { this.state.enabled = v; }
}

/** 全局单例（由 gameStore 持有） */
let _offlineAI: OfflineAI | null = null;
export function getOfflineAI(eng: GameEngine): OfflineAI {
  if (!_offlineAI) _offlineAI = new OfflineAI(eng);
  return _offlineAI;
}
export function resetOfflineAI() { _offlineAI = null; }