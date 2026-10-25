// ============ FlightEnv：战或逃微环境（引擎战斗子系统的忠实复刻） ============
// Task 37 路径B（BC 初始化 → PPO 强化微调）的训练/评估环境。
// 设计原则：不 import 引擎（引擎带 DOM/世界态副作用），而是把 engine.ts 中
// 战斗动力学的每一条公式**逐行移植**并在注释中标注引擎源码行号 —— 微环境与
// 引擎的可审计等价性靠对照表保证；「微环境≈引擎」的残余差距由 L3 长程
// 引擎内 A/B 评估兜底。
//
// 动力学锚点（engine.ts ↔ 本文件）：
//   移动步长      step = speed * 2 * mul                [engine L4027]
//     战斗追击 mul = 1.15                                [engine L2178/L2618]
//     撤离冷却 mul = 1.18                                [engine L2187]
//     触发脱离 mul = 1.20                                [engine L2211]
//   攻击节奏      cd = 14 / wspeed, 每 updateUnit cd-=2  [engine L2286/L2073]（动物无装备 wspeed=1）
//   命中概率      0.86 + min(0.1, kills*0.005), 钳制[0.35,0.97]   [engine L2328-2338 = teacherAcc]
//   伤害浮动      dmg = baseDmg * (0.8 + rng()*0.4)      [engine L2348]
//   捕食回充      food = min(160, food + 55 + round(victimMaxHp*0.5))  [engine L2415]
//   饥饿账本      predator 每 updateUnit food-=1；food<=0 → hp-=1.4   [engine L2128-2130]
//   脱离冷却      fleeT = 40, 每 updateUnit fleeT-=2      [engine L2207/L2077]
//   索敌半径      7 格（bestD 初始 7）                     [engine L2152]
//   挥击触及      reach = 0.9（默认种族）                  [engine L2282]
//   特征构造      F_FLIGHT 9 维                            [engine L2195-2205]
import { teacherFlight } from '../src/lib/game/policy';

// —— 可复现 RNG（与 scripts/train-neuro.ts 同源） ——
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type RNG = () => number;
const U = (r: RNG, a: number, b: number) => a + r() * (b - a);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ============================ 种族常量表（照抄 types.ts RACES，删无关字段） ============================
// herbivore = engine.isHerbivoreRace；monster = GameEngine.MONSTER_LOOT [engine L5103]
export interface SimRaceDef {
  hp: number;
  dmg: number;
  speed: number;
  predator: boolean;
  herbivore: boolean;
  monster: boolean;
  reach: number;
}
const D = (hp: number, dmg: number, speed: number, predator: boolean, herbivore: boolean, monster = false, reach = 0.9): SimRaceDef => ({ hp, dmg, speed, predator, herbivore, monster, reach });
export const SIM_RACES: Record<string, SimRaceDef> = {
  wolf: D(34, 10, 0.093, true, false), // types.ts L132
  snowwolf: D(38, 11, 0.088, true, false), // L140
  bear: D(95, 19, 0.06, true, false), // L133
  snake: D(20, 6, 0.08, true, false), // L139
  dragon: D(900, 48, 0.11, true, false, true), // L134
  troll: D(380, 26, 0.06, true, false, true), // L147
  ogre: D(300, 34, 0.052, true, false, true), // L148
  basilisk: D(90, 14, 0.11, true, false, true, 1.4), // L154
  scorpion: D(14, 5, 0.055, false, false), // L138
  sheep: D(16, 1, 0.038, false, true), // L131
  deer: D(24, 1, 0.115, false, true), // L135
  penguin: D(22, 1, 0.045, false, true), // L136
  camel: D(30, 2, 0.05, false, true), // L137
};
/** 场景采样权重 v3：捕食者 70% / 食草 15% / 蝎子 15% —— 真实引擎中吃饱的捕食者不索敌（food>70 不猎杀），
 *  食草动物的遭遇战多数不触发决策；策略空间集中在捕食者侧（v1 食草 26 份 → tie 无效局泛滥） */
const RACE_POOL: [string, number][] = [
  ['wolf', 24], ['snowwolf', 12], ['bear', 12], ['snake', 9], ['dragon', 4], ['troll', 3], ['ogre', 3], ['basilisk', 3],
  ['sheep', 5], ['deer', 4], ['penguin', 3], ['camel', 3], ['scorpion', 15],
];

// ============================ 对手池 ============================
export type OpponentPolicy = 'teacher' | 'aggressive' | 'coward' | 'random';
/** 训练期对手混采（防过拟合教师：近半压力来自非教师对手） */
export const OPPONENT_MIX: [OpponentPolicy, number][] = [
  ['teacher', 0.45],
  ['aggressive', 0.25],
  ['random', 0.20],
  ['coward', 0.10],
];

// ============================ 奖励（Task 37 §1 终版数值 v2 —— 物种差异化） ============================
// 核心洞察：战或逃的物种语义不同 —— 食草动物逃=生存胜利；捕食者逃=放弃进食机会。
// v1 教训：无差别存活奖励让网络过度保守（饿死率 22%→27.6%，分歧胜率 31.5% 被质量门拒绝）。
export const REWARD = {
  /** 每存活步（400 步满 = +0.6；比 v1 的 0.8 降 —— 苟活保底太厚会压倒进取心） */
  aliveStep: 0.0015,
  /** 击杀：基础 + 按牺牲者体量（狼杀羊≈+0.56 / 杀熊≈+0.88 —— 对应食物回充 55+maxHp/2） */
  killBase: 0.5,
  killPerMaxHp: 0.004,
  /** 被杀（一次性） */
  death: -1.0,
  /** 饿死（比被杀更失败：捕食者的核心职责就是觅食；v1 -1.2 → v2 加重） */
  starve: -1.4,
  /** 成功脱离 v3：食草 +0.45（纯赢 —— 生存胜利）；捕食者 +0.15（止损 —— 逃出比偠持到超时略优）
   *  v2 教训：捕食者 escape=0 → 「逃出提前终局」比「苟到 timeout 拿满存活分」还差 → 网络学会吊着不逃 */
  escapeHerbivore: 0.45,
  escapePredator: 0.15,
  /** 超时无所作为（曾接敌却既没杀也没逃出：消耗了时间没结果） */
  timeoutPenalty: -0.1,
  /** 反摸鱼①：选 FLEE 且打得赢的猎物在手边（f2>0.60 且 f0>0.7 且 f5>0.5）→ 每步 -0.05
   *  v2→v3：f2 阈 0.65→0.60（狼对蛇 f2=0.62 —— 互咬稳赢的对局必须罚弃战） */
  cowardStep: -0.05,
  /** 反摸鱼②：饿兽弃战（f1>0.65 且 f2>0.62 且 f0>0.6 时选 FLEE）→ 每步 -0.02
   *  （v1 盲区：饿狼面对打得赢的非食草对手（如蝎子）也选择逃 —— 饥饿压力必须内化到每步） */
  cowardHungerStep: -0.02,
  /** 反送死：选 FIGHT 且残血绝对劣势（f0<0.18 且 f2<0.25）→ 每步 -0.02（边际提醒；主惩罚已由死亡承担） */
  suicidalStep: -0.02,
} as const;

// ============================ 模拟单位 ============================
export interface SimUnit {
  race: string;
  def: SimRaceDef;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  cd: number;
  fleeT: number;
  kills: number;
  food: number; // 捕食者饥饿账本
}

// ============================ 环境 ============================
export type Outcome = 'kill' | 'escape' | 'timeout' | 'killed' | 'starved';
export const OUTCOME_SCORE: Record<Outcome, number> = { kill: 4, escape: 3, timeout: 2, killed: 0, starved: 0 };

/** 策略函数：9 维特征 → 0 死战 / 1 脱离（与 neuroFlight / teacherFlight 同签名） */
export type FlightPolicy = (f: ArrayLike<number>) => number;

const MAX_STEPS = 400; // 400 updateUnit ≈ 引擎 27 秒 @15tps 的遭遇战窗口
const SIGHT = 7; // 索敌半径 [engine L2152]
const ESCAPE_DIST = 12; // 脱离判定距离（=特征 f4 的满格）
const FOE_CAP = 160;

export interface StepRecord {
  f: Float32Array; // 决策瞬间的 9 维特征快照（分歧复盘用）
  a: number; // 采取的动作
}

export class FlightEnv {
  rng: RNG;
  agent!: SimUnit;
  foes: SimUnit[] = [];
  opponent: OpponentPolicy = 'teacher';
  agentPolicy: FlightPolicy | null = null; // 由 runEpisode 注入
  step = 0;
  terminated = false;
  outcome: Outcome = 'timeout';
  reward = 0; // 当前步奖励（step() 返回值）
  totalReturn = 0;
  // 统计
  agentKills = 0;
  wasEngaged = false; // 曾接敌（攻击或被攻击）
  lastHurtStep = -999; // 最近一次被击中的步（区分死因）
  obsLog: StepRecord[] = []; // 决策步快照（≤400 条 × 9 float，训练轨迹级分配可接受）

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  /** 场景采样：覆盖教师决策空间全部关键区（巨怪/饿兽/伤兽/多敌/猎物在侧） */
  reset(agentPolicy: FlightPolicy, opponent: OpponentPolicy) {
    this.agentPolicy = agentPolicy;
    this.opponent = opponent;
    this.step = 0;
    this.terminated = false;
    this.outcome = 'timeout';
    this.totalReturn = 0;
    this.agentKills = 0;
    this.wasEngaged = false;
    this.lastHurtStep = -999;
    this.obsLog = [];
    const r = this.rng;
    const pickRace = () => {
      let tot = 0;
      for (const [, w] of RACE_POOL) tot += w;
      let v = r() * tot;
      for (const [name, w] of RACE_POOL) {
        v -= w;
        if (v <= 0) return name;
      }
      return 'wolf';
    };
    const mk = (race: string, x: number, y: number): SimUnit => {
      const def = SIM_RACES[race];
      return { race, def, hp: def.hp, maxHp: def.hp, x, y, cd: 0, fleeT: 0, kills: 0, food: 70 };
    };
    // agent：位置原点；hp 三段混合（60% 健康 / 25% 中伤 / 15% 重伤）
    this.agent = mk(pickRace(), 0, 0);
    const hpP = r();
    const hpN = hpP < 0.6 ? U(r, 0.85, 1) : hpP < 0.85 ? U(r, 0.35, 0.85) : U(r, 0.05, 0.35);
    this.agent.hp = this.agent.def.hp * hpN;
    this.agent.food = U(r, 5, 130); // 覆盖饿兽区（food<32 → f1>0.8）
    this.agent.kills = r() < 0.2 ? Math.floor(U(r, 1, 21)) : 0;
    // 敌人：1-3 个（60/30/10%），随机方向、初始距离 1.5..6.5（< 索敌半径 7 → 开局即接敌）
    const n = r() < 0.6 ? 1 : r() < 0.75 ? 2 : 3;
    this.foes = [];
    for (let i = 0; i < n; i++) {
      const f = mk(pickRace(), 0, 0);
      const eHpP = r();
      const eHpN = eHpP < 0.7 ? U(r, 0.85, 1) : U(r, 0.3, 1);
      f.hp = f.def.hp * eHpN;
      const ang = r() * Math.PI * 2;
      const d = U(r, 1.5, 6.5);
      f.x = Math.cos(ang) * d;
      f.y = Math.sin(ang) * d;
      this.foes.push(f);
    }
  }

  /** 活着的最近敌（索敌半径内） */
  private nearestFoe(u: SimUnit): { foe: SimUnit | null; dist: number; count: number } {
    let best: SimUnit | null = null;
    let bestD = SIGHT;
    let count = 0;
    for (const f of this.foes) {
      if (f.hp <= 0) continue;
      const d = Math.hypot(f.x - u.x, f.y - u.y);
      if (d < SIGHT) {
        count++;
        if (d < bestD) {
          bestD = d;
          best = f;
        }
    }
    }
    return { foe: best, dist: best ? bestD : Infinity, count };
  }

  /** 构造 9 维战或逃特征（与 engine.ts L2195-2205 逐项对齐） */
  private features(u: SimUnit, foe: SimUnit, dist: number, foeCount: number): Float32Array {
    const myPow = u.def.dmg + u.hp / 8;
    const foePow = foe.def.dmg + foe.hp / 8;
    const f = new Float32Array(9);
    f[0] = clamp01(u.hp / u.maxHp);
    f[1] = u.def.predator ? clamp01(1 - u.food / FOE_CAP) : 0.5;
    f[2] = myPow / (myPow + foePow);
    f[3] = clamp01(foe.hp / foe.maxHp);
    f[4] = Math.min(12, dist) / 12;
    f[5] = foe.def.herbivore ? 1 : 0;
    f[6] = Math.min(3, Math.max(0, foeCount - 1)) / 3;
    f[7] = u.def.monster ? 1 : 0;
    f[8] = Math.min(20, u.kills) / 20;
    return f;
  }

  /** 单位攻击结算（engine L2282-2358 动物路径：命中链 + 伤害浮动 + 捕食回充） */
  private tryAttack(a: SimUnit, b: SimUnit, isAgentAttacker: boolean) {
    if (a.cd > 0 || Math.hypot(b.x - a.x, b.y - a.y) >= a.def.reach) return;
    a.cd = 14; // [engine L2286] 动物无装备 wspeed=1
    const acc = Math.max(0.35, Math.min(0.97, 0.86 + Math.min(0.1, Math.min(20, a.kills) * 0.005)));
    if (this.rng() > acc) return; // 挥空
    const dmg = a.def.dmg * (0.8 + this.rng() * 0.4); // [engine L2348]
    b.hp -= dmg;
    this.wasEngaged = true;
    if (!isAgentAttacker) this.lastHurtStep = this.step;
    if (b.hp <= 0) {
      a.kills++;
      if (a.def.predator) a.food = Math.min(FOE_CAP, a.food + 55 + Math.round(b.maxHp * 0.5)); // [engine L2415]
      if (isAgentAttacker) this.agentKills++;
    }
  }

  /** 通用移动：朝/离目标点走一步（speed*2*mul [engine L4027]；无限开阔平原） */
  private moveToward(u: SimUnit, tx: number, ty: number, mul: number) {
    const dx = tx - u.x;
    const dy = ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-4) return;
    const step = u.def.speed * 2 * mul;
    u.x += (dx / d) * step;
    u.y += (dy / d) * step;
  }

  /** 对手单位的战或逃策略（对手池） */
  private foePolicy(f: SimUnit, feats: Float32Array): number {
    switch (this.opponent) {
      case 'aggressive': return 0;
      case 'coward': return 1;
      case 'random': return this.rng() < 0.5 ? 0 : 1;
      case 'teacher': return teacherFlight(feats);
    }
  }

  /** 环境一步。决策步由 env.agentPolicy 闭包现场询问（训练期闭包内完成采样与记录）。
   * 返回 (reward, done, decided)：decided=1 表示本步发生了战或逃决策（PPO 的 mask）。 */
  stepEnv(): { r: number; done: boolean; decided: number } {
    const A = this.agent;
    this.reward = 0;
    this.step++;
    let decided = 0;
    // —— 通用结算（每 updateUnit：cd/fleeT 递减、饥饿账本）[engine L2073-2130] ——
    if (A.cd > 0) A.cd -= 2;
    if (A.fleeT > 0) A.fleeT -= 2;
    if (A.def.predator) {
      A.food -= 1;
      if (A.food <= 0) A.hp -= 1.4;
    }
    // —— agent 行为 ——
    const near = this.nearestFoe(A);
    const enemy = near.foe;
    if (A.fleeT > 0) {
      // 撤离冷却：持续拉开距离 [engine L2183-2189]
      if (enemy) this.moveToward(A, A.x * 2 - enemy.x, A.y * 2 - enemy.y, 1.18);
    } else if (enemy) {
      // 决策步：构造特征 → 策略动作（agentPolicy 闭包内完成采样与 buffer 记录）
      const f = this.features(A, enemy, near.dist, near.count);
      const a = this.agentPolicy ? this.agentPolicy(f) : 0;
      decided = 1;
      this.obsLog.push({ f, a });
      // 奖励塑形：反摸鱼×2 / 反送死（只在决策步计 —— 逃跑冷却期不重复罚）
      if (a === 1 && f[2] > 0.6 && f[0] > 0.7 && f[5] > 0.5) this.reward += REWARD.cowardStep;
      if (a === 1 && f[1] > 0.65 && f[2] > 0.62 && f[0] > 0.6) this.reward += REWARD.cowardHungerStep;
      if (a === 0 && f[0] < 0.18 && f[2] < 0.25) this.reward += REWARD.suicidalStep;
      if (a === 1) {
        A.fleeT = 40; // [engine L2207]
        this.moveToward(A, A.x * 2 - enemy.x, A.y * 2 - enemy.y, 1.2); // [engine L2211]
      } else {
        this.moveToward(A, enemy.x, enemy.y, 1.15); // 追击 [engine L2178]
        this.tryAttack(A, enemy, true);
      }
    }
    // —— 敌人行为（对称动力学，对手池策略） ——
    for (const f of this.foes) {
      if (f.hp <= 0) continue;
      if (f.cd > 0) f.cd -= 2;
      if (f.fleeT > 0) f.fleeT -= 2;
      const fnear = this.nearestFoeTo(f, A);
      if (f.fleeT > 0) {
        if (fnear !== null) this.moveToward(f, f.x * 2 - A.x, f.y * 2 - A.y, 1.18);
      } else if (fnear !== null) {
        const ff = this.features(f, A, fnear, 1);
        const a = this.foePolicy(f, ff);
        if (a === 1) {
          f.fleeT = 40;
          this.moveToward(f, f.x * 2 - A.x, f.y * 2 - A.y, 1.2);
        } else {
          this.moveToward(f, A.x, A.y, 1.15);
          this.tryAttack(f, A, false);
        }
      }
    }
    // —— 终局判定 ——
    if (A.hp <= 0) {
      // 死因区分：最近 30 步内被击中 → 被杀；否则 → 饿死
      this.outcome = this.step - this.lastHurtStep <= 30 ? 'killed' : 'starved';
      this.reward += this.outcome === 'killed' ? REWARD.death : REWARD.starve;
      this.terminated = true;
    } else if (this.foes.every((f) => f.hp <= 0)) {
      this.outcome = 'kill';
      this.terminated = true;
    } else {
      const nearestD = Math.min(...this.foes.filter((f) => f.hp > 0).map((f) => Math.hypot(f.x - A.x, f.y - A.y)));
      if (this.wasEngaged && A.fleeT <= 0 && nearestD > ESCAPE_DIST) {
        this.outcome = 'escape';
        this.reward += A.def.herbivore ? REWARD.escapeHerbivore : REWARD.escapePredator; // 物种差异化：食草纯赢 / 捕食者止损
        this.terminated = true;
      } else if (this.step >= MAX_STEPS) {
        this.outcome = 'timeout';
        if (this.wasEngaged) this.reward += REWARD.timeoutPenalty; // 曾接敌却无结果的时间浪费
        this.terminated = true;
      }
    }
    // 存活奖励（活过本步）
    if (A.hp > 0) this.reward += REWARD.aliveStep;
    this.totalReturn += this.reward;
    return { r: this.reward, done: this.terminated, decided };
  }

  /** 敌人 f 到 agent 的距离（agent 存活时敌人索敌 agent） */
  private nearestFoeTo(f: SimUnit, A: SimUnit): number | null {
    if (A.hp <= 0) return null;
    const d = Math.hypot(A.x - f.x, A.y - f.y);
    return d < SIGHT ? d : null;
  }

  /** 局末胜过对照的排序键 v3：outcome 等级 + 击杀 + hp + 生存时长 + 食物 tie-break
   *  （生存时长 0.3×steps/400：同 killed 结局时活得久=多积累存活价值 —— 破解 killed-killed 型 tie） */
  rankScore(): number {
    const A = this.agent;
    return OUTCOME_SCORE[this.outcome] * 10 + this.agentKills * 0.25 + clamp01(A.hp / A.maxHp) + (Math.min(this.step, 400) / 400) * 0.3 + clamp01((A.food + 30) / 190) * 0.15;
  }
}

// ============================ 跑局器 ============================
export interface EpisodeResult {
  outcome: Outcome;
  totalReturn: number;
  steps: number;
  kills: number;
  foodNet: number;
  hpN: number;
  rankScore: number;
  obsLog: StepRecord[];
}

/** 用给定策略跑一整局（评估期：策略在决策点被环境闭包式询问） */
export function runEpisode(seed: number, policy: FlightPolicy, opponent: OpponentPolicy): EpisodeResult {
  const env = new FlightEnv(seed);
  env.reset(policy, opponent);
  let done = false;
  while (!done) {
    const { done: d } = env.stepEnv();
    done = d;
  }
  return {
    outcome: env.outcome,
    totalReturn: env.totalReturn,
    steps: env.step,
    kills: env.agentKills,
    foodNet: env.agent.food - 70,
    hpN: clamp01(env.agent.hp / env.agent.maxHp),
    rankScore: env.rankScore(),
    obsLog: env.obsLog,
  };
}
