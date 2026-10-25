// ============ 统治者议会 · L0 动作白名单 ============
// 新增动作六步之第 1 步：这里加一枚枚举（types.ts）+ 这里登记元数据。
// 必须同步：schema.ts（第 2 步）/ parse.ts 域校验自动读这里 / executor.ts（第 4 步）/ reporter.ts（第 5 步）。
// 提示词（第 6 步）由 buildPrompt() 从本文件 + schema 自动生成——不会漏登记。
import type { DangerLevel, RulerAction, RulerRole, RulerIntent } from './types';

/** 席位元数据（提示词人格 + 面板展示共用） */
export const RULER_ROLES: Record<RulerRole, { name: string; title: string; domain: string }> = {
  warlord: { name: '战争统帅', title: '铁冠元帅', domain: '战火与外交' },
  calamity: { name: '天灾使者', title: '灾厄之手', domain: '天罚与净化' },
  creator: { name: '造物主教', title: '生命熔炉', domain: '物种与生态' },
  steward: { name: '内政执政官', title: '黄金天平', domain: '王国内政' },
};

/** 动作注册表：每个白名单动作的归属席位 / 危险级 / 冷却（游戏年） */
export interface ActionMeta {
  label: string;
  roles: readonly RulerRole[];
  danger: DangerLevel;
  /** 同签名冷却（游戏年）——防 AI 每轮重复同一动作 */
  cooldownYears: number;
  /** 全局冷却键（如核弹全世界共享一条冷却）；缺省 = 按目标分键 */
  globalCooldown?: { key: string; years: number };
}

export const ACTION_META: Record<RulerAction, ActionMeta> = {
  declare_war: { label: '宣战', roles: ['warlord'], danger: 'medium', cooldownYears: 60 },
  make_peace: { label: '议和', roles: ['warlord'], danger: 'low', cooldownYears: 40 },
  form_alliance: { label: '结盟', roles: ['warlord'], danger: 'low', cooldownYears: 100 },
  issue_directive: { label: '颁旨', roles: ['warlord'], danger: 'medium', cooldownYears: 30 },
  divine_strike: { label: '天罚', roles: ['calamity'], danger: 'medium', cooldownYears: 20, globalCooldown: { key: 'nuke', years: 120 } },
  heal_land: { label: '净化', roles: ['calamity'], danger: 'low', cooldownYears: 15 },
  bless_land: { label: '祝福', roles: ['calamity'], danger: 'low', cooldownYears: 15 },
  spawn_species: { label: '造物', roles: ['creator'], danger: 'medium', cooldownYears: 50 },
  hybridize: { label: '融合', roles: ['creator'], danger: 'medium', cooldownYears: 80 },
  spawn_creatures: { label: '放生', roles: ['creator'], danger: 'low', cooldownYears: 20 },
  boost_kingdom: { label: '天赐', roles: ['steward'], danger: 'low', cooldownYears: 25 },
  terraform: { label: '塑地', roles: ['steward'], danger: 'medium', cooldownYears: 40 },
};

/** 天罚神力的危险级覆盖（divine_strike 按神力分档） */
const STRIKE_DANGER: Record<string, DangerLevel> = {
  nuke: 'high', blackhole: 'high', wrath: 'high',
  plague: 'medium', ice_age: 'medium', meteor_shower: 'medium', quake: 'medium',
  volcano: 'medium', tsunami: 'medium', typhoon: 'medium', famine: 'medium',
};

/** 计算一条意图的实际危险级（动作级 + 神力级覆盖） */
export function dangerOf(intent: RulerIntent): DangerLevel {
  const base = ACTION_META[intent.action].danger;
  if (intent.action !== 'divine_strike') return base;
  const power = String(intent.params.power ?? '');
  return STRIKE_DANGER[power] ?? base;
}

/** 意图签名（仲裁去重/冷却分键/多席同议识别共用） */
export function intentSignature(intent: RulerIntent): string {
  const p = intent.params;
  switch (intent.action) {
    case 'declare_war':
    case 'make_peace':
    case 'form_alliance':
    case 'hybridize':
      return `${intent.action}:${String(p.a ?? '')}×${String(p.b ?? '')}`;
    case 'issue_directive':
      return `${intent.action}:${String(p.kind ?? '')}@${String(p.kingdom ?? '')}`;
    case 'divine_strike':
    case 'heal_land':
    case 'bless_land':
    case 'terraform':
    case 'spawn_creatures':
      return `${intent.action}:${String(intent.params.power ?? '')}@${String(p.place ?? '')}`;
    case 'spawn_species':
      return `${intent.action}:${String(p.name ?? '')}`;
    case 'boost_kingdom':
      return `${intent.action}:${String(p.what ?? '')}@${String(p.kingdom ?? '')}`;
  }
}

/** 冷却键：全局键（核弹）或 动作@目标 */
export function cooldownKey(intent: RulerIntent): { key: string; years: number } {
  const meta = ACTION_META[intent.action];
  if (meta.globalCooldown && intent.action === 'divine_strike' && String(intent.params.power) === 'nuke') {
    return { key: meta.globalCooldown.key, years: meta.globalCooldown.years };
  }
  return { key: intentSignature(intent), years: meta.cooldownYears };
}

/** 席位可用动作（提示词自动生成用） */
export function actionsOfRole(role: RulerRole): RulerAction[] {
  return (Object.keys(ACTION_META) as RulerAction[]).filter((a) => ACTION_META[a].roles.includes(role));
}

/** 每席每次召开的动作预算 & 全会总预算 */
export const BUDGET = { perAgent: 2, total: 6 };
