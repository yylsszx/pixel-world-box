// ============ 权柄包系统（Task 57 · deepseek harness「一切皆插件」改造） ============
// 神谕的 82 个核心工具不再是铁板一块——按 L0-L8 九层拆成 9 个「系统权柄包」，
// 每包可独立拆装（玩家在扩展中心「权柄」页、或神谕自己用 toggle_power_pack）：
//   · 关闭的包：工具从神谕目录 + 原生 FC schema + 语义路由中彻底消失
//     ——目录更小 = 模型注意力更集中 + 每轮注入 token 更少（直接服务「减耗提准」）；
//   · 常驻元工具（get_introspection / list_power_packs / toggle_power_pack）不受任何包开关影响
//     ——神谕被拆掉全部权柄后仍能自省并按玩家指令装回（自愈保证）。
// 持久化：localStorage `wb_packbits_v1`（跨会话保留拆装偏好）。
// 与插件系统的关系：权柄包=系统级能力层（随代码分发、工具集固定）；插件=动态能力包（LLM/玩家铸造）。
// 两者同属「一切皆插件」生态：effectiveOracleTools = 启用权柄包的核心工具 + 启用插件的工具。
import { TOOL_LAYERS, type ToolDef } from './tools';

/** 常驻元工具（不受权柄包开关影响——自省与自愈的保底通道；与 tools.ts 的定义保持同步） */
export const META_TOOL_NAMES = new Set(['get_introspection', 'list_power_packs', 'toggle_power_pack']);

/** 每包的工程描述与关闭风险（ExtensionHub 权柄页 + list_power_packs 回执共用） */
const PACK_META: Record<string, { desc: string; risk: string }> = {
  L0: { desc: '地形/区域/深时地质/纪事检索/地形改造/纪元跃迁', risk: '关闭后神谕无法读写地形与历史' },
  L1: { desc: '单位属性/传送/物种创造/演化/造物图鉴', risk: '关闭后无法创造或修改生物' },
  L2: { desc: '建国/科技/神铸武器/王国合并', risk: '关闭后无法操控文明' },
  L3: { desc: '宣战/议和/联盟/军团/世界大战', risk: '关闭后无法操控战争与外交' },
  L4: { desc: '32 种神力天灾（核弹/陨石/瘟疫/开河…）', risk: '关闭后无法直接降下神力' },
  L5: { desc: '引擎参数/世界法则/Agent 机制 DSL 热插拔', risk: '关闭后无法写机制与调参' },
  L6: { desc: '时间流速/镜头/存档', risk: '关闭后无法操控时空与存档' },
  L7: { desc: 'read_state/write_state/run_script 根权限直连', risk: '关闭后失去万能后手（批量操作与任意状态改写）' },
  L8: { desc: '插件铸造/Mod 安装的管理工具', risk: '关闭后无法自铸扩展（已装的继续运转）' },
};

export interface PowerPack {
  /** 包 id（即层级号 L0-L8） */
  id: string;
  /** 完整层名（世界内核/生命单位/…） */
  name: string;
  desc: string;
  /** 关闭后果（一句话） */
  risk: string;
  tools: string[];
  enabled: boolean;
}

const STORE_KEY = 'wb_packbits_v1';

type Listener = () => void;
const listeners = new Set<Listener>();

function loadBits(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    if (typeof j !== 'object' || j === null || Array.isArray(j)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (typeof v === 'boolean' && PACK_META[k]) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

let bits: Record<string, boolean> = loadBits();

function persist() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(bits));
  } catch {
    /* 配额满/隐私模式：内存态继续可用 */
  }
  snapshotCache = null;
  for (const fn of listeners) fn();
}

/** 九层权柄包实况（bits 未声明 = 默认启用） */
export function listPowerPacks(): PowerPack[] {
  return TOOL_LAYERS.map((l, i) => {
    const id = `L${i}`;
    const meta = PACK_META[id] ?? { desc: l.layer, risk: '' };
    return {
      id,
      name: l.layer.replace(/^L[\d.]+\s*/, ''),
      desc: meta.desc,
      risk: meta.risk,
      tools: l.tools,
      enabled: bits[id] !== false,
    };
  });
}

// ———— useSyncExternalStore 专用快照（引用稳定，防无限重渲染）————
let snapshotCache: PowerPack[] | null = null;
export function powerPacksSnapshot(): PowerPack[] {
  if (!snapshotCache) snapshotCache = listPowerPacks();
  return snapshotCache;
}

export function subscribePowerPacks(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 拆/装一个权柄包 */
export function togglePowerPack(id: string, enabled: boolean): { ok: boolean; error?: string } {
  if (!PACK_META[id]) return { ok: false, error: `没有权柄包 ${id}（list_power_packs 查看九包实况）` };
  bits = { ...bits, [id]: enabled };
  persist();
  return { ok: true };
}

/** 工具当前是否可用：元工具恒真；否则须属于某个启用中的包 */
export function isToolUnlocked(name: string): boolean {
  if (META_TOOL_NAMES.has(name)) return true;
  for (const p of listPowerPacks()) {
    if (p.enabled && p.tools.includes(name)) return true;
  }
  return false;
}

/** 「工具存在但被权柄包关闭」判定（未知工具错误的精准提示用） */
export function packedOffInfo(name: string): { id: string; pack: string } | null {
  for (const p of listPowerPacks()) {
    if (!p.enabled && p.tools.includes(name)) return { id: p.id, pack: `${p.id} ${p.name}` };
  }
  return null;
}

/** 按权柄包过滤工具目录（元工具恒保留；不属于任何包的工具防御性保留） */
export function filterByPacks(tools: ToolDef[]): ToolDef[] {
  const packs = listPowerPacks();
  const unlocked = new Set<string>(META_TOOL_NAMES);
  for (const p of packs) if (p.enabled) for (const t of p.tools) unlocked.add(t);
  return tools.filter((t) => unlocked.has(t.name) || !poolsKnows(t.name, packs));
}

/** 工具是否被任何层收录（未收录=无主工具，防御性放行） */
function poolsKnows(name: string, packs: PowerPack[]): boolean {
  return packs.some((p) => p.tools.includes(name));
}
