// ============ 统治者议会 · L3 仲裁层（纯代码） ============
// 冲突检测 / 合法性校验 / 危险拦截 / 汇总。不解析地名、不执行、不读世界详情——
// 只依据意图签名（动作+原始地名/国名字符串）做策略裁决。
// 危险协议：high 级 → 复述确认（待造物主批复）；开启「多席同议自动放行」且 ≥2 席
// 提出同一签名时才允许自动执行（仍会在汇报中标注「双席同议」）。
import type { DangerLevel, RulerIntent, RulerRole } from './types';
import { ACTION_META, BUDGET, cooldownKey, dangerOf, intentSignature } from './whitelist';

export type ArbiterDecision = 'approve' | 'pending' | 'block';

export interface ArbitrateInput {
  intents: RulerIntent[];
  /** 当前游戏年 */
  year: number;
  /** 冷却表：key → 到期年 */
  cooldowns: Map<string, number>;
  /** 危险动作多席同议自动放行开关 */
  autoConsent: boolean;
}

export interface ArbitrateVerdict {
  intent: RulerIntent;
  decision: ArbiterDecision;
  danger: DangerLevel;
  /** 同签名的其他提出席位（≥1 个 = 双席同议） */
  coSigners: RulerRole[];
  reason?: string;
}

/** 配对键（战/和/盟：国名排序后拼接，a×b 与 b×a 同键） */
function pairOf(i: RulerIntent): string {
  return [String(i.params.a ?? ''), String(i.params.b ?? '')].sort().join('×');
}
function placeOf(i: RulerIntent): string {
  return String(i.params.place ?? '').trim();
}

/** 意图的目标名集合（目标级同议判定：多席意图指向同一目标 = 对该目标的共识） */
function targetsOf(i: RulerIntent): string[] {
  const p = i.params;
  switch (i.action) {
    case 'declare_war':
    case 'make_peace':
    case 'form_alliance':
    case 'hybridize':
      return [String(p.a ?? ''), String(p.b ?? '')].filter(Boolean);
    case 'issue_directive':
      return [String(p.kingdom ?? ''), String(p.target ?? '')].filter(Boolean);
    case 'boost_kingdom':
      return [String(p.kingdom ?? '')].filter(Boolean);
    case 'spawn_species':
      return [String(p.name ?? '')].filter(Boolean);
    default:
      return [String(p.place ?? '')].filter(Boolean);
  }
}

export function arbitrate(input: ArbitrateInput): ArbitrateVerdict[] {
  const { intents, year, cooldowns, autoConsent } = input;

  // 预扫一：签名 → 提出席位集合（同名同参去重）
  const sigAgents = new Map<string, Set<string>>();
  for (const it of intents) {
    const sig = intentSignature(it);
    const set = sigAgents.get(sig) ?? new Set<string>();
    set.add(it.agent);
    sigAgents.set(sig, set);
  }
  // 预扫二：目标名 → 提出席位集合（高危「多席同议」= 不同席位指向同一目标）
  const targetAgents = new Map<string, Set<string>>();
  for (const it of intents) {
    for (const t of targetsOf(it)) {
      const set = targetAgents.get(t) ?? new Set<string>();
      set.add(it.agent);
      targetAgents.set(t, set);
    }
  }
  /** 目标级同议：其他席位是否有任一意图指向本意图的目标 */
  const coSignersOf = (it: RulerIntent): RulerRole[] => {
    const others = new Set<string>();
    for (const t of targetsOf(it)) {
      for (const a of targetAgents.get(t) ?? []) {
        if (a !== it.agent) others.add(a);
      }
    }
    return [...others] as RulerRole[];
  };

  // 冲突标记（第二轮填充）
  const blockedByConflict = new Set<number>();
  const blockedByDupPlace = new Set<number>();
  const warPairs = new Map<string, number[]>();   // pair → indices（宣战/议和互斥）
  const strikePlaces = new Map<string, number[]>(); // 地名 → indices（净化与降罚互斥/重复降罚并档）
  intents.forEach((it, idx) => {
    if (it.action === 'declare_war' || it.action === 'make_peace') {
      const k = pairOf(it);
      warPairs.set(k, [...(warPairs.get(k) ?? []), idx]);
    }
    if (it.action === 'divine_strike' || it.action === 'heal_land') {
      const p = placeOf(it);
      if (p) strikePlaces.set(p, [...(strikePlaces.get(p) ?? []), idx]);
    }
  });
  // 战和相悖：同一配对同时出现宣战与议和 → 全部驳回
  for (const [k, idxs] of warPairs) {
    const hasWar = idxs.some((i) => intents[i].action === 'declare_war');
    const hasPeace = idxs.some((i) => intents[i].action === 'make_peace');
    if (hasWar && hasPeace) idxs.forEach((i) => blockedByConflict.add(i));
    void k;
  }
  // 同地：天罚 vs 净化 → 互斥全驳；多记天罚同地 → 除首条外并档
  for (const [p, idxs] of strikePlaces) {
    const hasStrike = idxs.some((i) => intents[i].action === 'divine_strike');
    const hasHeal = idxs.some((i) => intents[i].action === 'heal_land');
    if (hasStrike && hasHeal) {
      idxs.forEach((i) => blockedByConflict.add(i));
    } else if (idxs.length > 1) {
      const strikes = idxs.filter((i) => intents[i].action === 'divine_strike');
      strikes.slice(1).forEach((i) => blockedByDupPlace.add(i));
    }
    void p;
  }

  // 顺序裁决：预算 / 冲突 / 冷却 / 去重 / 危险
  const perAgent = new Map<string, number>();
  const seenSig = new Set<string>();
  let total = 0;
  const out: ArbitrateVerdict[] = [];

  intents.forEach((intent, idx) => {
    const danger = dangerOf(intent);
    const sig = intentSignature(intent);
    const coSet = sigAgents.get(sig) ?? new Set<string>();
    const coSigners = [...coSet].filter((a) => a !== intent.agent) as ArbitrateVerdict['coSigners'];
    /** 高危同议 = 目标级共识（不同席位指向同一目标），不要求同动作 */
    const targetCo = coSignersOf(intent);

    // 1) 越权（解析层已挡，此处防御性复查）
    if (!ACTION_META[intent.action].roles.includes(intent.agent)) {
      out.push({ intent, decision: 'block', danger, coSigners, reason: '越权：动作不属于本席权柄' });
      return;
    }
    // 2) 冲突
    if (blockedByConflict.has(idx)) {
      out.push({ intent, decision: 'block', danger, coSigners, reason: '意图冲突：战和相悖或同地互斥' });
      return;
    }
    if (blockedByDupPlace.has(idx)) {
      out.push({ intent, decision: 'block', danger, coSigners, reason: '同地重复降罚，已并档' });
      return;
    }
    // 3) 重复签名（首条留，后续并档）
    if (seenSig.has(sig)) {
      out.push({ intent, decision: 'block', danger, coSigners, reason: '与他席献策重复，已并档' });
      return;
    }
    // 4) 预算
    const used = perAgent.get(intent.agent) ?? 0;
    if (used >= BUDGET.perAgent) {
      out.push({ intent, decision: 'block', danger, coSigners, reason: `超出本席预算（每次召开至多 ${BUDGET.perAgent} 项）` });
      return;
    }
    if (total >= BUDGET.total) {
      out.push({ intent, decision: 'block', danger, coSigners, reason: `超出全会预算（每次召开至多 ${BUDGET.total} 项）` });
      return;
    }
    // 5) 冷却
    const ck = cooldownKey(intent);
    const expire = cooldowns.get(ck.key);
    if (expire !== undefined && year < expire) {
      out.push({ intent, decision: 'block', danger, coSigners, reason: `冷却中（剩 ${Math.ceil(expire - year)} 年）` });
      return;
    }
    // 6) 危险拦截：高危 → 复述确认；「多席同议自动放行」开启且 ≥1 其他席位指向同一目标
    if (danger === 'high') {
      if (autoConsent && targetCo.length >= 1) {
        seenSig.add(sig);
        perAgent.set(intent.agent, used + 1);
        total++;
        out.push({ intent, decision: 'approve', danger, coSigners: targetCo, reason: `多席同议·自动放行（${targetCo.join('、')}同指此目标）` });
        return;
      }
      out.push({ intent, decision: 'pending', danger, coSigners: targetCo });
      return;
    }
    // 7) 放行
    seenSig.add(sig);
    perAgent.set(intent.agent, used + 1);
    total++;
    out.push({ intent, decision: 'approve', danger, coSigners });
  });

  return out;
}
