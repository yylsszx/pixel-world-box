// ============ 神谕权限系统（Oracle OS v5 · 把整个游戏当作一台电脑） ============
// 造物主钦定标准：神谕要达到 Hermes agent / OpenClaw / Grok bot 级——
// 即「对整台机器拥有全部可调权限的 Agent」。本模块就是那套权限位：
//   · 五档权限等级（0 观察者 → 4 ROOT），存 localStorage，随时可调；
//   · 每个工具归属一个权限位阶（tier）：read / write / mech / ui / root；
//   · 每个位阶可单独要求「执行前须经造物主批准」（confirm）；
//   · ROOT 壳（run_script 直写引擎内核）默认逐次批准，须显式解锁。
// agent.ts 在每次工具执行前过闸（checkToolPerm）；gameStore 持有审批队列与审计流。

export type PermTier = 'read' | 'write' | 'mech' | 'ui' | 'root';

/** 位阶 → 最低权限等级（档位） */
export const TIER_LEVEL: Record<PermTier, number> = {
  read: 0,
  write: 1,
  mech: 2,
  ui: 3,
  root: 4,
};

export const TIER_LABEL: Record<PermTier, string> = {
  read: '读取',
  write: '世界改写',
  mech: '机制热插拔',
  ui: '界面操控',
  root: 'ROOT 根权限',
};

/** 五档权限等级（把游戏比作电脑：只读用户 → 超级用户） */
export interface PermLevelMeta {
  level: number;
  name: string;
  desc: string;
  tiers: PermTier[];
}

export const PERM_LEVELS: PermLevelMeta[] = [
  { level: 0, name: '观察者', desc: '只读权限：神谕可观尽世界一切实况（地块/单位/列国/战争/机制），不可改写任何东西', tiers: ['read'] },
  { level: 1, name: '神使', desc: '世界改写：神力天灾/生成物种/改造地形/改写单位/操纵列国与外交', tiers: ['read', 'write'] },
  { level: 2, name: '造物主', desc: '机制热插拔：书写法则/热调参数/时间控制/存档/撤销重做', tiers: ['read', 'write', 'mech'] },
  { level: 3, name: '界域之影', desc: '界面操控：面板开关/镜头/速度/覆盖层/视觉开关/全 UI 遥控', tiers: ['read', 'write', 'mech', 'ui'] },
  { level: 4, name: 'ROOT', desc: '根权限：run_script 直写引擎内核——任意机制创造、任意数据手术、游戏本体的实时再编程', tiers: ['read', 'write', 'mech', 'ui', 'root'] },
];

/** 权限设置（localStorage 持久化；默认全开 L4，唯 ROOT 壳须显式解锁） */
export interface OraclePermSettings {
  level: number;
  /** 须逐次批准的位阶（默认 ['root']：只有根壳要批准） */
  confirm: PermTier[];
  /** ROOT 解锁确认（显式勾选「我已知晓」后 root 位阶才真正放行） */
  rootAck: boolean;
}

const PERM_STORE_KEY = 'oracle-perm-v5';

export const DEFAULT_PERM_SETTINGS: OraclePermSettings = {
  level: 4,
  confirm: ['root'],
  rootAck: false,
};

export function loadPermSettings(): OraclePermSettings {
  try {
    const raw = localStorage.getItem(PERM_STORE_KEY);
    if (!raw) return { ...DEFAULT_PERM_SETTINGS };
    const s = JSON.parse(raw) as Partial<OraclePermSettings>;
    const level = typeof s.level === 'number' && s.level >= 0 && s.level <= 4 ? Math.floor(s.level) : DEFAULT_PERM_SETTINGS.level;
    const confirm = Array.isArray(s.confirm)
      ? (s.confirm.filter((t) => t === 'read' || t === 'write' || t === 'mech' || t === 'ui' || t === 'root') as PermTier[])
      : [...DEFAULT_PERM_SETTINGS.confirm];
    return { level, confirm, rootAck: s.rootAck === true };
  } catch {
    return { ...DEFAULT_PERM_SETTINGS };
  }
}

export function savePermSettings(s: OraclePermSettings): void {
  try {
    localStorage.setItem(PERM_STORE_KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式/配额：内存态仍生效 */
  }
}

// ---------------- 工具 → 位阶归属 ----------------

/** 显式位阶表（新工具族；未列出的由命名规则推导） */
const TIER_OVERRIDES: Record<string, PermTier> = {
  run_script: 'root',
  get_ui_state: 'read',
  ui_control: 'ui',
  get_audit_log: 'read',
  undo_world: 'mech',
  redo_world: 'mech',
  // 机制层（L2）：法则书写/参数热调/时间/存档——比普通世界改写更高一档
  set_law: 'mech',
  create_law: 'mech',
  update_law: 'mech',
  manage_agent_laws: 'mech',
  set_param: 'mech',
  get_params: 'read',
  get_param: 'read',
  get_laws: 'read',
  get_triggers: 'read',
  save_world: 'mech',
  time_control: 'mech',
  era_control: 'mech',
  // 界面层（L3）：镜头/特效属于 UI 遥控
  camera_control: 'ui',
  cast_fx: 'ui',
  announce: 'write',
};

/** 工具的权限位阶（推导规则：显式表 > get_/find_/search_/list_ 前缀只读 > 写操作） */
export function tierOfTool(name: string): PermTier {
  const hit = TIER_OVERRIDES[name];
  if (hit) return hit;
  if (/^(get_|find_|search_|list_)/.test(name)) return 'read';
  return 'write';
}

export interface PermCheckResult {
  tier: PermTier;
  /** 位阶所需最低等级 */
  needLevel: number;
  allowed: boolean;
  /** 允许执行，但须逐次批准 */
  needConfirm: boolean;
  /** 拒绝文案（allowed=false 时） */
  reason?: string;
}

/** 权限闸门：agent.ts 每次工具执行前调用（永不 throw） */
export function checkToolPerm(name: string, s: OraclePermSettings): PermCheckResult {
  const tier = tierOfTool(name);
  const needLevel = TIER_LEVEL[tier];
  const needConfirm = s.confirm.includes(tier);

  // ROOT 双保险：未显式解锁时，root 位阶一律拦下（即使 level=4）
  if (tier === 'root' && !s.rootAck) {
    return {
      tier,
      needLevel,
      allowed: false,
      needConfirm: false,
      reason:
        `权限不足：「${name}」属于 ROOT 根权限工具，须先解锁。` +
        `请告知造物主：在神谕面板 → 权限中心勾选「解锁 ROOT 根权限」。解锁后可直写引擎内核。`,
    };
  }

  if (s.level < needLevel) {
    const meta = PERM_LEVELS[needLevel];
    const cur = PERM_LEVELS[s.level];
    return {
      tier,
      needLevel,
      allowed: false,
      needConfirm: false,
      reason:
        `权限不足：「${name}」属于「${TIER_LABEL[tier]}」位阶，需要权限等级 L${needLevel}（${meta.name}）；` +
        `当前 L${s.level}（${cur.name}）。请建议造物主在神谕面板 → 权限中心调高权限等级。`,
    };
  }

  return { tier, needLevel, allowed: true, needConfirm };
}

/** 当前权限快照（get_introspection / get_ui_state / prompt 注入共用） */
export function permSnapshot(s: OraclePermSettings): Record<string, unknown> {
  const meta = PERM_LEVELS[s.level];
  return {
    level: s.level,
    levelName: meta.name,
    unlockedTiers: meta.tiers,
    rootUnlocked: s.rootAck,
    confirmTiers: s.confirm,
    note:
      tierOfTool('run_script') === 'root' && s.level >= 4 && s.rootAck
        ? 'ROOT 已解锁：run_script 可直写引擎内核' + (s.confirm.includes('root') ? '（每次执行前须经造物主批准）' : '')
        : 'ROOT 未解锁：机制书写请用 create_law/set_param 组合',
  };
}

/** 神谕行为审计条目（gameStore.oracleAudit 流；agent.ts 每次权限判定/执行后推入） */
export interface OracleAuditEntry {
  ts: number;
  name: string;
  tier: PermTier;
  ok: boolean;
  /** ok=执行成功 / fail=执行失败 / deny=权限拒绝 / approve=批准放行 / reject=造物主拒绝 */
  verdict: 'ok' | 'fail' | 'deny' | 'approve' | 'reject';
  brief: string;
}

/** 待批准的工具调用（权限中心审批条） */
export interface OracleApprovalRequest {
  name: string;
  tier: PermTier;
  args: Record<string, unknown>;
  at: number;
}
