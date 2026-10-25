// ============ Online Flight Collector：战或逃在线经验采集（主线程） ============
// Task 38 局后训练（Online Post-training 第一步）的经验采集层。
//
// 设计原则（任务书硬约束）：
//   ① 不改热路径节奏：决策点一次属性读 + 9 float 拷贝 + 顺序写入（目标 <0.1µs/决策）
//   ② 零 GC 压力：环形缓冲预分配 Float32Array/Uint8Array；进行中会话写入缓冲区，
//      会话结束（低频事件）才拷出紧凑数组进 pending 队列
//   ③ 状态必须拷贝不能存引用：F_FLIGHT 是引擎复用的 scratch，逐元素展开拷贝
//   ④ 会话（遭遇战）结束才回填 reward —— 局后训练的「局后」语义：
//      结局（击杀/死亡/脱离/超时）在结束时才可知，Monte Carlo 式回填
//
// 会话生命周期（与微环境 flight-env 的 Outcome 对齐）：
//   collectDecision(u, enemy, f, a)  —— 野生动物战或逃决策点（engine L2194 块）
//   collectKill(u, victim)           —— agent 击杀敌人（engine 近战结算 L2412）
//   collectUnitDead(u)               —— agent 死亡（unitsTick 清理循环，被杀/饿死统一捕获）
//   collectFleeEnd(u)                —— fleeT 走完（脱离尝试结束）
//   collectEnemyGone(u)              —— 决策时发现敌人消失（走出视野/被他人击杀）
//   会话超时：decisions ≥ 400（对齐微环境 MAX_STEPS）
//
// reward 公式 = scripts/flight-env.ts REWARD 逐项对齐（离线在线同一账本）：
//   aliveStep 0.0015 · kill 0.5+0.004×maxHp · death -1.0 · starve -1.4
//   escapeHerbivore 0.45 / escapePredator 0.15 · timeout -0.1
//   cowardStep -0.05 · cowardHungerStep -0.02 · suicidalStep -0.02（决策步塑形）
import { teacherFlight } from '../policy';
import { flightLastLogp } from '../neuro';

// —— 微环境 REWARD 账本（逐项照抄 scripts/flight-env.ts，单一数值源注释锚定） ——
const R_ALIVE = 0.0015;
const R_KILL_BASE = 0.5;
const R_KILL_PER_HP = 0.004;
const R_DEATH = -1.0;
const R_STARVE = -1.4;
const R_ESCAPE_HERB = 0.45;
const R_ESCAPE_PRED = 0.15;
const R_TIMEOUT = -0.1;

export type SessionOutcome = 'kill' | 'escape' | 'killed' | 'starved' | 'timeout';

/** 已完成会话（等待发送给 Worker 的紧凑经验包） */
export interface EpisodePacket {
  n: number;
  states: Float32Array; // n×9
  actions: Uint8Array; // n
  teacherActions: Uint8Array; // n
  oldLogps: Float32Array; // n×2（生产权重 π_old(a|s)）
  rewards: Float32Array; // n（结局回填后）
  dones: Uint8Array; // n（最后一步 1）
  outcome: SessionOutcome;
}

/** 进行中会话（引用环形缓冲区间） */
interface Session {
  start: number; // 环形缓冲起始槽
  len: number; // 决策步数
  startTick: number;
  lastTick: number;
  herbivore: boolean;
  kills: number;
  killHpSum: number; // Σ victim.maxHp（击杀奖励按牺牲者体量）
  tainted: boolean; // 环形缓冲耗尽 → 丢弃
}

// —— 环形缓冲（预分配，模块级单例；CAP 8192 步 ≈ 64+ 并发会话 × 120 步） ——
const CAP = 8192;
const states = new Float32Array(CAP * 9);
const actions = new Uint8Array(CAP);
const teacherActions = new Uint8Array(CAP);
const logps = new Float32Array(CAP * 2);
let write = 0; // 写入游标（只增；耗尽即弃新不覆盖，保进行中会话完整）

/** 采集统计（面板 1s 轮询） */
export const collectorStats = {
  enabled: false,
  sessionsStarted: 0,
  episodesCompleted: 0,
  stepsCollected: 0,
  dropped: 0, // 溢出/污染丢弃
  frozen: false, // 决战冻结（世界大战/战时停采集停训练）
};

const sessions = new Map<number, Session>();
const pending: EpisodePacket[] = [];
const MAX_PENDING = 64; // Worker 消费不及时的保护上限

/** 决策点采集（engine 战或逃决策块调用；紧接 neuroFlight 之后 —— flightLastLogp 有效） */
export function collectDecision(
  unitId: number,
  tick: number,
  herbivore: boolean,
  f: ArrayLike<number>,
  a: number,
): void {
  if (!collectorStats.enabled || collectorStats.frozen) return;
  let s = sessions.get(unitId);
  if (!s) {
    s = { start: -1, len: 0, startTick: tick, lastTick: tick, herbivore, kills: 0, killHpSum: 0, tainted: false };
    sessions.set(unitId, s);
    collectorStats.sessionsStarted++;
    // 低频清扫（每 256 个新会话全表扫一次：1200 tick 无决策的僵尸会话回收）
    if ((collectorStats.sessionsStarted & 255) === 0) collectSweep(tick);
  }
  s.lastTick = tick;
  // 会话超时（对齐微环境 MAX_STEPS=400 决策步）
  if (s.len >= 400) {
    finalize(unitId, s, tick, 'timeout');
    return;
  }
  if (write >= CAP) return; // 缓冲满：弃新（不覆盖进行中会话）
  const slot = write;
  // 状态拷贝（不能存引用 —— F_FLIGHT 是复用 scratch；手动展开 9 float）
  const o = slot * 9;
  states[o] = f[0]; states[o + 1] = f[1]; states[o + 2] = f[2];
  states[o + 3] = f[3]; states[o + 4] = f[4]; states[o + 5] = f[5];
  states[o + 6] = f[6]; states[o + 7] = f[7]; states[o + 8] = f[8];
  actions[slot] = a;
  teacherActions[slot] = teacherFlight(f as number[]);
  logps[slot * 2] = flightLastLogp[0];
  logps[slot * 2 + 1] = flightLastLogp[1];
  if (s.len === 0) s.start = slot;
  s.len++;
  write++;
  collectorStats.stepsCollected++;
  if (write >= CAP) {
    // 缓冲耗尽安全阀：全部进行中会话标记污染丢弃（极端并发下的正确性优先）
    collectorStats.dropped += sessions.size;
    sessions.clear();
  }
}

/** agent 击杀敌人（奖励按牺牲者体量；会话继续 —— 连续作战，敌人耗尽由 enemyGone/超时结束） */
export function collectKill(unitId: number, victimMaxHp: number): void {
  if (!collectorStats.enabled) return;
  const s = sessions.get(unitId);
  if (!s) return;
  s.kills++;
  s.killHpSum += victimMaxHp;
}

/** agent 死亡（unitsTick 清理循环统一捕获；饿死 = 捕食者断粮，其余归被杀） */
export function collectUnitDead(unitId: number, starved: boolean): void {
  if (!collectorStats.enabled) return;
  const s = sessions.get(unitId);
  if (!s) return;
  finalize(unitId, s, s.lastTick, starved ? 'starved' : 'killed');
}

/** fleeT 走完（脱离尝试结束 —— 引擎侧不重算敌距，微环境差距由 L3 引擎内评估兜底） */
export function collectFleeEnd(unitId: number, tick: number): void {
  if (!collectorStats.enabled) return;
  const s = sessions.get(unitId);
  if (!s) return;
  finalize(unitId, s, tick, s.kills > 0 ? 'kill' : 'escape');
}

/** 决策时发现敌人消失（走出视野/被他人击杀/被玩家清除） */
export function collectEnemyGone(unitId: number, tick: number): void {
  if (!collectorStats.enabled) return;
  const s = sessions.get(unitId);
  if (!s) return;
  finalize(unitId, s, tick, s.kills > 0 ? 'kill' : 'escape');
}

/** 低频清扫（online-store 在 idle 回调里调用）：超长无更新的僵尸会话回收 */
export function collectSweep(tick: number) {
  for (const [id, s] of sessions) {
    if (tick - s.lastTick > 1200) {
      // 1200 tick 无决策：敌人早已不在 —— 按脱离结算
      finalize(id, s, s.lastTick, s.kills > 0 ? 'kill' : 'escape');
    }
  }
}

/** 重置采集（开关关闭时调用；进行中会话丢弃 —— 经验本来就该随会话结束） */
export function collectReset() {
  sessions.clear();
  write = 0;
}

/** 结算会话：reward 回填 + 拷出紧凑包进 pending */
function finalize(unitId: number, s: Session, endTick: number, outcome: SessionOutcome) {
  sessions.delete(unitId);
  if (s.tainted || s.len === 0 || pending.length >= MAX_PENDING) {
    collectorStats.dropped++;
    return;
  }
  const n = s.len;
  const pk: EpisodePacket = {
    n,
    states: states.slice(s.start * 9, (s.start + n) * 9),
    actions: actions.slice(s.start, s.start + n),
    teacherActions: teacherActions.slice(s.start, s.start + n),
    oldLogps: logps.slice(s.start * 2, (s.start + n) * 2),
    rewards: new Float32Array(n),
    dones: new Uint8Array(n),
    outcome,
  };
  // —— reward 回填（微环境 REWARD 账本逐项对齐） ——
  // 存活步：引擎 updateUnit 每 2 tick 一次（parity 机制）→ 会话 updateUnit 数 ≈ ticks/2
  const updates = Math.max(n, Math.round((endTick - s.startTick) / 2));
  const alivePerStep = (Math.min(400, updates) * R_ALIVE) / n;
  for (let i = 0; i < n; i++) {
    const f0 = pk.states[i * 9];
    const f1 = pk.states[i * 9 + 1];
    const f2 = pk.states[i * 9 + 2];
    const f5 = pk.states[i * 9 + 5];
    const a = pk.actions[i];
    let r = alivePerStep;
    // 反摸鱼×2 / 反送死（决策步塑形，公式 = flight-env L315-317）
    if (a === 1 && f2 > 0.6 && f0 > 0.7 && f5 > 0.5) r -= 0.05;
    if (a === 1 && f1 > 0.65 && f2 > 0.62 && f0 > 0.6) r -= 0.02;
    if (a === 0 && f0 < 0.18 && f2 < 0.25) r -= 0.02;
    pk.rewards[i] = r;
  }
  // 结局奖励（最后一步）
  const last = n - 1;
  switch (outcome) {
    case 'kill':
      pk.rewards[last] += R_KILL_BASE + R_KILL_PER_HP * s.killHpSum;
      break;
    case 'escape':
      pk.rewards[last] += s.herbivore ? R_ESCAPE_HERB : R_ESCAPE_PRED;
      break;
    case 'killed':
      pk.rewards[last] += R_DEATH;
      break;
    case 'starved':
      pk.rewards[last] += R_STARVE;
      break;
    case 'timeout':
      pk.rewards[last] += R_TIMEOUT;
      break;
  }
  pk.dones[last] = 1;
  pending.push(pk);
  collectorStats.episodesCompleted++;
}

/** 取走待发送经验（凑批发送：≥8 会话或 ≥256 步）；返回 null 表示未凑满 */
export function collectDrainBatch(force = false): EpisodePacket[] | null {
  if (pending.length === 0) return null;
  const steps = pending.reduce((a, p) => a + p.n, 0);
  if (!force && pending.length < 8 && steps < 256) return null;
  return pending.splice(0, pending.length);
}
