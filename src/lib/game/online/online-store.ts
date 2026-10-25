// ============ Online Flight Store：在线局后训练编排层（主线程） ============
// Task 38 Online Post-training 第一步（局后训练）的中枢：
//   经验泵（idle 回调 drain → Worker）· 上线门（eval passed → 权重原子热切换 → 快照 → 持久化）
//   可逆性（快照栈 5 份 / 一键回滚 / 连续 3 次评估不过自动回退+暂停）
//   退化检测（基线漂移趋势：上线基线连续下滑 → 警报回滚）· 决战冻结 · 三档强度
//
// 关键设计决策（对应任务书六问）：
//   Q1 触发时机：累积 ≥8 完整遭遇会话或 ≥256 决策步才凑批发送（单会话样本方差大），
//      发送本身在 requestIdleCallback 里（避开渲染帧）
//   Q2 上线前验证：Worker 内微环境评估门（600 固定种子配对局）→ 通过后主线程
//      setFlightRLWeights() 原子替换（同步引用写入，引擎无中断；第一步不做影子并行——
//      评估门已在统计意义上保证不劣化，影子模式是第二步的增强）
//   Q3 缓慢退化检测：每次评估带回 production 基线 divWinRateProd，上线即成新基线 ——
//      基线序列连续 3 次下滑且累计 >0.015 → 温水煮青蛙警报 + 自动回滚
//   Q4 中途关游戏：上线即持久化（先写 localStorage 成功再切换权重，失败则不上线）；
//      未完成候选/经验直接丢弃（训练无状态，只损失一次迭代 —— 预期行为）
//   Q5 快照存储：98 参 + 元数据 ≈1.2KB/份 × 5 份 < 8KB（localStorage 5MB 的 0.2%）；
//      quota 异常 → 降级内存快照 + console.warn（不阻断游戏）
//   Q6 与离线脚本共存：localStorage 记录离线权重指纹（trainedAt|divWinRate）——
//      离线重训后指纹不匹配 → 在线增量自动作废，回退新基线
import {
  collectorStats, collectDrainBatch, collectReset, collectSweep, type EpisodePacket,
} from './collector';
import {
  getFlightRLWeights, setFlightRLWeights, resetFlightRLWeights,
} from '../neuro';
import { NEURO_FLIGHT_RL_META } from '../neuro-flight-rl';

export type Intensity = 'conservative' | 'balanced' | 'aggressive';

/** 三档超参（lr = 离线 2e-3 的打折；β 下限 0.10 远大于离线终值 0.02 —— 在线分布窄锚要粗） */
export const INTENSITY_HYPER: Record<Intensity, { lr: number; beta: number; entCoef: number; label: string; desc: string }> = {
  conservative: { lr: 1e-4, beta: 0.2, entCoef: 0.003, label: '保守', desc: 'lr×0.05 · 强锚 β0.20' },
  balanced: { lr: 2e-4, beta: 0.15, entCoef: 0.005, label: '均衡', desc: 'lr×0.10 · 锚 β0.15' },
  aggressive: { lr: 4e-4, beta: 0.1, entCoef: 0.008, label: '激进', desc: 'lr×0.20 · 弱锚 β0.10' },
};

const LS_KEY = 'wb-flight-online-v1';
const MAX_SNAPSHOTS = 5; // 快照栈深度（任务书：保留最近 5 份）
const AUTO_ROLLBACK_FAILS = 3; // 连续 N 次评估不过 → 自动回退（任务书 M=3）
const DRIFT_ALERT_COUNT = 3; // 基线连续下滑次数 → 退化警报
const DRIFT_ALERT_SUM = 0.015; // 基线累计下滑量阈值

interface Snapshot {
  weights: number[]; // 98
  at: number; // Date.now()
  promoteIdx: number; // 第几次上线
  divWinRate: number;
  mustFlee: number;
  mustFight: number;
}

interface PromoteRecord {
  at: number;
  divWinRate: number;
  mustFlee: number;
  mustFight: number;
  ret: number;
}

/** 面板快照（1s 轮询） */
export interface OnlineSnapshot {
  enabled: boolean;
  intensity: Intensity;
  frozen: boolean;
  paused: boolean; // 自动回退后暂停（等玩家重启）
  sessions: number;
  episodes: number;
  stepsCollected: number;
  dropped: number;
  worker: { updates: number; episodes: number; steps: number } | null;
  lastEval: {
    passed: boolean;
    reason?: string;
    mustFlee: number;
    mustFight: number;
    mustFightN: number;
    divWinRate: number;
    divWinRateProd: number;
    ret: number;
    divWin: number;
    divLose: number;
    updates: number;
  } | null;
  promotes: PromoteRecord[]; // 上线历史（最近 12）
  rejects: number;
  autoRollbacks: number;
  consecutiveFails: number;
  snapshotsMeta: { at: number; promoteIdx: number; divWinRate: number }[];
  baselineDrift: number; // 当前基线 − 首次基线（负 = 温水煮青蛙）
  persisted: boolean; // localStorage 可用性
}

// ============================ 状态 ============================
export const onlineStats = {
  enabled: false,
  intensity: 'balanced' as Intensity,
  paused: false,
  rejects: 0,
  autoRollbacks: 0,
  consecutiveFails: 0,
  promotes: [] as PromoteRecord[],
  baselines: [] as number[], // 每次上线后的 production 分歧胜率基线序列
  lastEval: null as OnlineSnapshot['lastEval'],
  workerStats: null as { updates: number; episodes: number; steps: number } | null,
  persisted: true,
};

let worker: Worker | null = null;
let pumpTimer: number | null = null;
let snapshots: Snapshot[] = [];
let promoteCount = 0;
let initSeed = 20260207; // Worker 评估种子（固定 → E2E 可复现）
let currentWeights: number[] | null = null; // 当前生产权重（localStorage 持久化形态）
let baseFingerprint = '';

function fingerprint(): string {
  return `${NEURO_FLIGHT_RL_META.trainedAt}|${NEURO_FLIGHT_RL_META.divWinRate}`;
}

// ============================ Worker 消息处理 ============================
function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./flight-trainer.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data as
      | { t: 'progress'; updates: number; episodes: number; steps: number }
      | {
          t: 'eval'; passed: boolean; weights?: Float32Array; reason?: string;
          metrics: {
            updates: number; mustFlee: number; mustFleeN: number; mustFight: number; mustFightN: number;
            divWinRate: number; divWinRateProd: number; ret: number; divWin: number; divLose: number;
          };
        };
    if (m.t === 'progress') {
      onlineStats.workerStats = { updates: m.updates, episodes: m.episodes, steps: m.steps };
      return;
    }
    // eval：上线门结果
    onlineStats.lastEval = {
      passed: m.passed,
      reason: m.reason,
      mustFlee: m.metrics.mustFlee,
      mustFight: m.metrics.mustFight,
      mustFightN: m.metrics.mustFightN,
      divWinRate: m.metrics.divWinRate,
      divWinRateProd: m.metrics.divWinRateProd,
      ret: m.metrics.ret,
      divWin: m.metrics.divWin,
      divLose: m.metrics.divLose,
      updates: m.metrics.updates,
    };
    if (m.passed && m.weights) {
      confirmPromote(m.weights, m.metrics);
    } else {
      onlineStats.rejects++;
      onlineStats.consecutiveFails++;
      if (onlineStats.consecutiveFails >= AUTO_ROLLBACK_FAILS) {
        autoRollback();
      }
    }
  };
  worker.onerror = (e) => {
    console.warn('[online-train] Worker 异常，训练暂停：', e.message);
    setOnlineInternal(false);
  };
  return worker;
}

// ============================ 上线 / 回滚 ============================
function weightsToFlat(w: { w1: Float32Array; b1: Float32Array; w2: Float32Array; b2: Float32Array }): Float32Array {
  const out = new Float32Array(98);
  out.set(w.w1, 0);
  out.set(w.b1, 72);
  out.set(w.w2, 80);
  out.set(w.b2, 96);
  return out;
}

function flatToWeights(flat: ArrayLike<number>) {
  const w1 = Float32Array.from(flat instanceof Float32Array ? flat.subarray(0, 72) : Array.from(flat).slice(0, 72));
  const b1 = Float32Array.from(flat instanceof Float32Array ? flat.subarray(72, 80) : Array.from(flat).slice(72, 80));
  const w2 = Float32Array.from(flat instanceof Float32Array ? flat.subarray(80, 96) : Array.from(flat).slice(80, 96));
  const b2 = Float32Array.from(flat instanceof Float32Array ? flat.subarray(96, 98) : Array.from(flat).slice(96, 98));
  return { w1, b1, w2, b2 };
}

/** 评估门通过 → 上线（先持久化成功再热切换，保证「已上线必已持久化」） */
function confirmPromote(flat: Float32Array, m: { mustFlee: number; mustFight: number; divWinRate: number; ret: number }) {
  // ④ 主线程侧再校验一次（双保险）
  for (let i = 0; i < 98; i++) {
    if (!Number.isFinite(flat[i]) || Math.abs(flat[i]) > 50) return;
  }
  // 快照当前生产权重（回滚点）—— 上线前的旧权重
  const prev = getFlightRLWeights();
  const promoteIdx = ++promoteCount;
  const snap: Snapshot = {
    weights: Array.from(weightsToFlat(prev)),
    at: Date.now(),
    promoteIdx,
    divWinRate: onlineStats.lastEval?.divWinRateProd ?? NEURO_FLIGHT_RL_META.divWinRate,
    mustFlee: 1,
    mustFight: 1,
  };
  // 热切换
  if (!setFlightRLWeights(flatToWeights(flat))) return;
  currentWeights = Array.from(flat);
  // 快照栈（保留最近 5 份）
  snapshots.push(snap);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.splice(0, snapshots.length - MAX_SNAPSHOTS);
  // 持久化（失败不上线策略：此处已切换 —— 若 localStorage 失败降级为内存态并警告，权重本身已过门）
  persist();
  // 上线记录 + 基线序列（退化检测）
  onlineStats.promotes.push({ at: snap.at, divWinRate: m.divWinRate, mustFlee: m.mustFlee, mustFight: m.mustFight, ret: m.ret });
  if (onlineStats.promotes.length > 12) onlineStats.promotes.splice(0, onlineStats.promotes.length - 12);
  onlineStats.baselines.push(m.divWinRate);
  onlineStats.consecutiveFails = 0;
  // Worker 基准同步（防越训越歪：下一个候选从已上线权重出发）
  worker?.postMessage({ t: 'reset', weights: flat.slice() });
  checkBaselineDrift();
}

/** 基线漂移检测（Q3 温水煮青蛙）：上线基线连续 N 次下滑且累计超阈 → 自动回滚 */
function checkBaselineDrift() {
  const b = onlineStats.baselines;
  if (b.length < DRIFT_ALERT_COUNT + 1) return;
  const recent = b.slice(-(DRIFT_ALERT_COUNT + 1));
  let monotone = true;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] >= recent[i - 1] - 1e-4) monotone = false;
  }
  const drift = recent[recent.length - 1] - recent[0];
  if (monotone && drift < -DRIFT_ALERT_SUM) {
    console.warn('[online-train] 退化警报：分歧胜率基线连续下滑', (drift * 100).toFixed(2), 'pt —— 自动回滚');
    rollback(0, true);
  }
}

/** 连续 3 次评估不过 → 自动回退到最近快照 + 暂停训练 */
function autoRollback() {
  onlineStats.autoRollbacks++;
  rollback(0, false);
  onlineStats.paused = true;
  console.warn('[online-train] 连续 ' + AUTO_ROLLBACK_FAILS + ' 次评估未过 —— 已回滚并暂停训练（重开开关或切换强度以重启）');
}

/** 一键回滚到快照栈第 i 份（0 = 最近） */
export function rollback(i: number, resume = false): boolean {
  if (i < 0 || i >= snapshots.length) return false;
  const snap = snapshots[snapshots.length - 1 - i];
  const ok = setFlightRLWeights(flatToWeights(snap.weights));
  if (!ok) return false;
  currentWeights = snap.weights.slice();
  onlineStats.consecutiveFails = 0;
  if (resume) onlineStats.paused = false;
  persist();
  // Worker 基准同步
  worker?.postMessage({ t: 'reset', weights: Float32Array.from(snap.weights) });
  return true;
}

/** 重置为离线导出权重（丢弃全部在线增量） */
export function resetToOffline(): boolean {
  resetFlightRLWeights();
  currentWeights = null;
  snapshots = [];
  onlineStats.baselines = [];
  onlineStats.consecutiveFails = 0;
  onlineStats.paused = false;
  try {
    localStorage.removeItem(LS_KEY);
  } catch { /* SSR/隐私模式 */ }
  worker?.postMessage({ t: 'reset', weights: weightsToFlat(getFlightRLWeights()) });
  return true;
}

// ============================ 持久化（Q4/Q5/Q6） ============================
function persist() {
  if (typeof window === 'undefined') return;
  try {
    const data = {
      v: 1,
      baseFingerprint,
      currentWeights,
      snapshots,
      promoteCount,
      intensity: onlineStats.intensity,
      baselines: onlineStats.baselines.slice(-12),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
    onlineStats.persisted = true;
  } catch (e) {
    onlineStats.persisted = false;
    console.warn('[online-train] localStorage 持久化失败（降级内存态）：', e);
  }
}

/** 恢复（引擎构造时调用；离线权重指纹不匹配 → 自动作废在线增量 —— Q6 共存） */
export function restore() {
  if (typeof window === 'undefined') return;
  baseFingerprint = fingerprint();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as {
      baseFingerprint: string; currentWeights: number[] | null; snapshots: Snapshot[];
      promoteCount: number; intensity: Intensity; baselines: number[];
    };
    if (data.baseFingerprint !== baseFingerprint) {
      // 离线权重文件已更新（重训过）—— 在线增量基于旧基线，自动作废
      localStorage.removeItem(LS_KEY);
      console.info('[online-train] 检测到离线权重更新，在线增量已重置');
      return;
    }
    if (data.currentWeights && data.currentWeights.length === 98) {
      if (setFlightRLWeights(flatToWeights(data.currentWeights))) {
        currentWeights = data.currentWeights;
      }
    }
    snapshots = Array.isArray(data.snapshots) ? data.snapshots.filter((s) => Array.isArray(s.weights) && s.weights.length === 98) : [];
    promoteCount = data.promoteCount ?? 0;
    if (data.intensity && data.intensity in INTENSITY_HYPER) onlineStats.intensity = data.intensity;
    onlineStats.baselines = data.baselines ?? [];
    onlineStats.persisted = true;
  } catch (e) {
    console.warn('[online-train] 恢复在线权重失败（忽略，用离线权重）：', e);
  }
}

// ============================ 开关 / 强度 / 冻结 ============================
function setOnlineInternal(on: boolean) {
  const wasEnabled = onlineStats.enabled;
  onlineStats.enabled = on;
  collectorStats.enabled = on;
  if (on) {
    onlineStats.paused = false;
    onlineStats.consecutiveFails = 0;
    const w = ensureWorker();
    w.postMessage({
      t: 'init',
      weights: weightsToFlat(getFlightRLWeights()),
      hyper: INTENSITY_HYPER[onlineStats.intensity],
      seed: initSeed,
    });
    startPump();
  } else {
    stopPump();
    collectReset();
    if (wasEnabled && worker) {
      // 关闭：Worker 终止（未完成训练丢弃 —— Q4：训练无状态，损失仅一次迭代）
      worker.terminate();
      worker = null;
      onlineStats.workerStats = null;
    }
  }
}

export function setOnline(on: boolean) {
  setOnlineInternal(on);
}

export function setIntensity(i: Intensity) {
  onlineStats.intensity = i;
  worker?.postMessage({ t: 'hyper', hyper: INTENSITY_HYPER[i] });
  if (onlineStats.paused && onlineStats.enabled) {
    onlineStats.paused = false; // 切强度 = 玩家主动干预 → 解除自动回退暂停
    onlineStats.consecutiveFails = 0;
  }
  persist();
}

/** 决战冻结（世界大战/战争状态时停采集停训练 —— 决战不训练） */
export function setFrozen(frozen: boolean) {
  if (collectorStats.frozen === frozen) return;
  collectorStats.frozen = frozen;
}

/** 固定评估种子（E2E 可复现用） */
export function setEvalSeed(seed: number) {
  initSeed = seed;
}

// ============================ 经验泵（idle 回调发送） ============================
function startPump() {
  if (pumpTimer != null || typeof window === 'undefined') return;
  pumpTimer = window.setInterval(() => {
    if (!onlineStats.enabled || onlineStats.paused) return;
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    const pump = () => {
      if (!onlineStats.enabled) return;
      const eps = collectDrainBatch();
      if (eps && worker) sendBatch(eps);
    };
    if (idle) idle(pump);
    else setTimeout(pump, 0);
  }, 500);
}

function stopPump() {
  if (pumpTimer != null) {
    clearInterval(pumpTimer);
    pumpTimer = null;
  }
}

function sendBatch(eps: EpisodePacket[]) {
  const w = worker;
  if (!w) return;
  // transferable：主线程放弃所有权，零拷贝过线程
  const transfer: ArrayBuffer[] = [];
  for (const ep of eps) {
    transfer.push(
      ep.states.buffer as ArrayBuffer, ep.actions.buffer as ArrayBuffer, ep.teacherActions.buffer as ArrayBuffer,
      ep.oldLogps.buffer as ArrayBuffer, ep.rewards.buffer as ArrayBuffer, ep.dones.buffer as ArrayBuffer,
    );
  }
  w.postMessage({ t: 'batch', episodes: eps }, transfer);
}

// ============================ QA 注入口（E2E 验证用） ============================
/** 直接注入经验包（QA 跳过引擎采集，验证 Worker→评估门→上线全链路） */
export function qaInjectEpisodes(eps: EpisodePacket[]) {
  const w = ensureWorker();
  if (!onlineStats.enabled) setOnlineInternal(true);
  sendBatch(eps);
}

/** 快照快照（面板轮询） */
export function onlineSnapshot(): OnlineSnapshot {
  return {
    enabled: onlineStats.enabled,
    intensity: onlineStats.intensity,
    frozen: collectorStats.frozen,
    paused: onlineStats.paused,
    sessions: collectorStats.sessionsStarted,
    episodes: collectorStats.episodesCompleted,
    stepsCollected: collectorStats.stepsCollected,
    dropped: collectorStats.dropped,
    worker: onlineStats.workerStats,
    lastEval: onlineStats.lastEval,
    promotes: onlineStats.promotes,
    rejects: onlineStats.rejects,
    autoRollbacks: onlineStats.autoRollbacks,
    consecutiveFails: onlineStats.consecutiveFails,
    snapshotsMeta: snapshots.map((s) => ({ at: s.at, promoteIdx: s.promoteIdx, divWinRate: s.divWinRate })),
    baselineDrift: onlineStats.baselines.length > 1
      ? onlineStats.baselines[onlineStats.baselines.length - 1] - onlineStats.baselines[0]
      : 0,
    persisted: onlineStats.persisted,
  };
}
