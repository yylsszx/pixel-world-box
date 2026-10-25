// ============ 教师策略（Teacher Policies）：神经决策核心的蒸馏源 ============
// 纯函数层（零引擎依赖）：三类热路径判定的「专家规则」——
//   ① acc    近战命中概率（引擎原 12 分支命中链的精确移植）
//   ② stance 战斗姿态（追击接敌/原地坚守/且战且退/伤重脱离 —— 原硬编码阈值链的策略化）
//   ③ flight 战或逃（野生动物/敌对种的重伤脱离 —— 原默认死战到底的策略化）
// 引擎与训练脚本（scripts/train-neuro.ts）共用本模块：
//   - 训练时作为标注器（行为克隆蒸馏）
//   - 运行时作为神经核心关闭时的回退路径 + 一致率审计基准
// 特征向量全部归一化到 [0,1]，与 neuro.ts 的网络输入一一对应。

// —— 姿态类别（与网络输出位对应）——
export const STANCE_ADVANCE = 0; // 追击接敌（贴身挥击/逼近射程）
export const STANCE_HOLD = 1; // 原地坚守（射程内站桩输出）
export const STANCE_KITE = 2; // 且战且退（拉开距离放风筝）
export const STANCE_WITHDRAW = 3; // 伤重脱离（散兵劣势撤整，军团成员军令如山不撤）
export const STANCE_NAMES = ['追击接敌', '原地坚守', '且战且退', '伤重脱离'] as const;

// —— 战或逃类别 ——
export const FLIGHT_FIGHT = 0;
export const FLIGHT_FLEE = 1;

// ======================= ① 近战命中概率（教师） =======================
// 特征（10 维）：
//  f0 expN      = min(kills,20)/20          百战老兵更稳
//  f1 speedDiffN= min(0.5, max(0,(tSpd-mSpd)*7))*2  目标敏捷差（归一化到 0.5 满格）
//  f2 tTiny     目标侏儒（难命中）
//  f3 tSwift    目标迅捷（难命中）
//  f4 tGiant    目标巨型（好命中）
//  f5 mTiny     攻击者侏儒（贴得更近）
//  f6 bless     祝福（神准）
//  f7 curse     诅咒（失准）
//  f8 forest    目标处于森林（掩护）
//  f9 mountain  目标处于山地（高下差）
// 输出：命中概率（0.35..0.97 钳制）——与引擎原命中链逐项等价
export function teacherAcc(f: number[] | Float32Array): number {
  let acc = 0.86 + Math.min(0.1, f[0] * 20 * 0.005);
  acc -= f[1] * 0.5;
  if (f[2] > 0.5) acc -= 0.16;
  if (f[3] > 0.5) acc -= 0.08;
  if (f[4] > 0.5) acc += 0.08;
  if (f[5] > 0.5) acc += 0.04;
  if (f[6] > 0.5) acc += 0.06;
  if (f[7] > 0.5) acc -= 0.06;
  if (f[8] > 0.5) acc -= 0.07;
  if (f[9] > 0.5) acc -= 0.04;
  return Math.max(0.35, Math.min(0.97, acc));
}

// ======================= ② 战斗姿态（教师） =======================
// 特征（12 维）：
//  f0 distN    = min(dist,12)/12   与敌距离
//  f1 hpN      自身血量比
//  f2 ehpN     敌方血量比
//  f3 hasRange 具备远程能力（法术/弓/火器）
//  f4 rangeN   = min(有效射程,8)/8
//  f5 reachN   = min(触及,2)/2
//  f6 isMage   法系（风筝带更宽）
//  f7 powRatio 战力占比（我/(我+敌)；战力 = dmg + hp/8）
//  f8 allyN    = min(邻近友军,4)/4
//  f9 inArmy   军团成员（军令如山）
//  f10 isCiv   文明单位
//  f11 expN    = min(kills,20)/20
// 输出：姿态类别（见 STANCE_*）
//   贴身 → 追击（引擎近战分支处理挥击）
//   射程窗口内 → 近距风筝 / 远距坚守（法系 0.7×射程、弓火器 0.45×射程）
//   射程外 → 伤重劣势的文明散兵脱离；否则压上
export function teacherStance(f: number[] | Float32Array): number {
  const dist = f[0] * 12;
  const reach = f[5] * 2;
  const range = f[4] * 8;
  if (dist <= reach + 0.05) return STANCE_ADVANCE;
  if (f[3] > 0.5 && dist <= range) {
    const band = f[6] > 0.5 ? 0.7 : 0.45;
    if (dist < band * range || dist < 1.5) return STANCE_KITE;
    return STANCE_HOLD;
  }
  if (f[1] < 0.3 && f[7] < 0.42 && f[9] < 0.5 && f[10] > 0.5) return STANCE_WITHDRAW;
  return STANCE_ADVANCE;
}

// ======================= ③ 战或逃（教师） =======================
// 特征（9 维）：
//  f0 hpN     自身血量比
//  f1 foodN   饥饿度（捕食者 1-food/160；其余 0.5）
//  f2 powRatio 战力占比
//  f3 ehpN    敌方血量比
//  f4 distN   距离
//  f5 eIsPrey 敌方是食草猎物
//  f6 eCountN = min(邻近敌数,3)/3
//  f7 isMonster 巨怪（龙/克拉肯/巨魔… —— 仅次于亡灵的胆量）
//  f8 expN    经验
// 输出：0 战 / 1 逃
export function teacherFlight(f: number[] | Float32Array): number {
  if (f[7] > 0.5) return f[0] < 0.15 ? FLIGHT_FLEE : FLIGHT_FIGHT;
  if (f[5] > 0.5) {
    // 猎物在侧：饿兽拼命，伤兽弃猎
    if (f[1] > 0.8 && f[0] < 0.25) return FLIGHT_FIGHT;
    if (f[0] < 0.22) return FLIGHT_FLEE;
    if (f[0] < 0.4 && f[6] > 0.55) return FLIGHT_FLEE;
    return FLIGHT_FIGHT;
  }
  // 对手是威胁或旗鼓相当者
  if (f[0] < 0.45 && f[2] < 0.4) return FLIGHT_FLEE;
  if (f[0] < 0.25) return FLIGHT_FLEE;
  return FLIGHT_FIGHT;
}

/** 三头的特征维度（训练脚本与审计共用） */
export const ACC_IN = 10;
export const STANCE_IN = 12;
export const FLIGHT_IN = 9;
