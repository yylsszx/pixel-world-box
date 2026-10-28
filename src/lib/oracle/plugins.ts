// ============ 神谕插件系统（Task 55 · DeepSeek harness 式动态能力包） ============
// 插件 = 神谕 Agent 的动态能力包：每个插件携带若干「脚本工具」，
// 注册后立即成为一等公民工具（进工具目录、进原生 function calling schema、可被后续轮次调用）。
// 三种来源：
//   · builtin：内置能力包（战争艺术/生态工程/奇观工坊——随代码分发，默认启用）
//   · oracle ：神谕 Agent 运行时用 register_plugin 工具自铸（LLM 写工具定义+脚本）
//   · player ：玩家从扩展中心导入（artifact JSON 文件）
// 持久化：builtin 在代码里；oracle/player 在 localStorage `wb_plugins_v1`（跨会话保留）。
// 执行沙箱：与 L7 run_script 同一纪律——new Function('eng','W','H','args')、静态拒绝死循环、
//   单脚本 ≤4000 字符、单插件 ≤6 工具、自定义插件 ≤12 个。
// 工具名必须全局唯一（与 74 个核心工具及其它插件不撞车）——注册时强校验。
import type { ToolDef, ToolArgDef } from './tools';
import { AGENT_TOOLS } from './tools';
import { filterByPacks } from './powerPacks';
import type { GameEngine } from '@/lib/game/engine';
import { runSandbox, SANDBOX_CHEATSHEET } from '@/lib/game/sandbox';

export interface PluginToolDef {
  /** 工具名（全局唯一；建议动词开头，如 nuke_rain / wildlife_census） */
  name: string;
  desc: string;
  args?: Record<string, ToolArgDef>;
  /** 沙箱脚本：形参 (eng, W, H, args)；return 值作为工具回执（自动 JSON 化） */
  script: string;
}

export type PluginAuthor = 'builtin' | 'oracle' | 'player';

export interface OraclePlugin {
  id: string;
  name: string;
  desc: string;
  version: string;
  author: PluginAuthor;
  builtin?: boolean;
  enabled: boolean;
  createdAt: number;
  tools: PluginToolDef[];
}

const STORE_KEY = 'wb_plugins_v1';
const MAX_CUSTOM_PLUGINS = 12;
const MAX_TOOLS_PER_PLUGIN = 6;
const MAX_SCRIPT_LEN = 4000;

type Listener = () => void;
const listeners = new Set<Listener>();
function emit() {
  snapshotCache = null; // 快照失效：下次读取重建
  for (const fn of listeners) fn();
}

// ============ 内置能力包（builtin · 随代码分发） ============
// 这些脚本工具演示插件架构的全部能力：组合神力 / 深度统计 / 地形工程——
// 且本身就有真实价值（核心工具做不到的复合操作）。
const BUILTIN_PACKS: OraclePlugin[] = [
  {
    id: 'plg_builtin_war',
    name: '战争艺术',
    desc: '战场级复合兵法：战场全景扫描与多弹头核打击——把多次神力/查询组合成一个工具',
    version: '1.0.0',
    author: 'builtin',
    builtin: true,
    enabled: true,
    createdAt: 0,
    tools: [
      {
        name: 'battlefield_scan',
        desc: '战场全景扫描：统计区域内敌我军团、各单位战力、燃烧与辐射污染，给出战场简报（组合查询工具）',
        args: {
          x: { type: 'number', desc: '战场中心 x', required: true },
          y: { type: 'number', desc: '战场中心 y', required: true },
          radius: { type: 'number', desc: '扫描半径 4-30（默认 12）' },
        },
        script: `const r = Math.max(4, Math.min(30, args.radius ?? 12));
const x0 = Math.max(0, Math.floor(args.x - r)), x1 = Math.min(W - 1, Math.ceil(args.x + r));
const y0 = Math.max(0, Math.floor(args.y - r)), y1 = Math.min(H - 1, Math.ceil(args.y + r));
const armies = [], sides = new Map(); let units = 0, hp = 0, burning = 0, rad = 0, corpses = 0;
for (const u of eng.units) {
  if (u.dead) { if (u.x >= x0 && u.x <= x1 && u.y >= y0 && u.y <= y1) corpses++; continue; }
  if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
  units++; hp += u.hp;
  const side = u.civ >= 0 ? (eng.civs[u.civ]?.alive ? eng.civs[u.civ].name : '残部') : '野外';
  sides.set(side, (sides.get(side) ?? 0) + 1);
}
for (const a of eng.armies) {
  if (a.state === 'dead' || a.x < x0 || a.x > x1 || a.y < y0 || a.y > y1) continue;
  armies.push({ name: a.name, civ: a.civ >= 0 ? eng.civs[a.civ]?.name ?? '?' : '?', size: a.size, x: Math.round(a.x), y: Math.round(a.y), state: a.state });
}
for (let yy = y0; yy <= y1; yy += 2) for (let xx = x0; xx <= x1; xx += 2) {
  const i = yy * W + xx;
  if (eng.fire[i] > 0) burning++;
  if (eng.radiate[i] > 0) rad++;
}
return { center: [args.x, args.y], radius: r, units, avgHp: units ? Math.round(hp / units) : 0, corpses,
  factions: [...sides.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, c]) => ({ name: n, count: c })),
  armies: armies.slice(0, 12), burningTiles: burning * 4, radiationTiles: rad * 4 };`,
      },
      {
        name: 'nuke_rain',
        desc: '多弹头核打击：在目标区域散布多颗核弹（威力 2，间隔落点形成覆盖式打击）——单次神力做不到的饱和攻击',
        args: {
          x: { type: 'number', desc: '打击中心 x', required: true },
          y: { type: 'number', desc: '打击中心 y', required: true },
          count: { type: 'number', desc: '弹头数 2-8（默认 3）' },
          spread: { type: 'number', desc: '散布半径 2-10（默认 5）' },
        },
        script: `const n = Math.max(2, Math.min(8, Math.round(args.count ?? 3)));
const sp = Math.max(2, Math.min(10, args.spread ?? 5));
let fired = 0;
for (let k = 0; k < n; k++) {
  const ang = (k / n) * Math.PI * 2 + Math.random() * 0.5;
  const rr = k === 0 ? 0 : sp * (0.4 + Math.random() * 0.6);
  const nx = Math.max(1, Math.min(W - 2, Math.round(args.x + Math.cos(ang) * rr)));
  const ny = Math.max(1, Math.min(H - 2, Math.round(args.y + Math.sin(ang) * rr)));
  eng.nuke(nx, ny, 2); fired++;
}
return { fired, at: [args.x, args.y], note: '饱和核打击已执行——检查辐射带' };`,
      },
    ],
  },
  {
    id: 'plg_builtin_eco',
    name: '生态工程',
    desc: '大尺度生态工程：快速绿化与全物种深度普查——生态师的一等公民工具箱',
    version: '1.0.0',
    author: 'builtin',
    builtin: true,
    enabled: true,
    createdAt: 0,
    tools: [
      {
        name: 'terraform_forest',
        desc: '快速绿化工程：区域内焦土/草地变森林、熄灭火灾、清除辐射（大范围修复，比单次 terrain_paint 更彻底）',
        args: {
          x: { type: 'number', desc: '中心 x', required: true },
          y: { type: 'number', desc: '中心 y', required: true },
          radius: { type: 'number', desc: '半径 3-16（默认 8）' },
        },
        script: `const T_GRASS = 3, T_FOREST = 4, T_BURNT = 9;
const r = Math.max(3, Math.min(16, Math.round(args.radius ?? 8)));
const cx = Math.round(args.x), cy = Math.round(args.y);
let planted = 0, healed = 0, cleansed = 0;
for (let yy = Math.max(0, cy - r); yy <= Math.min(H - 1, cy + r); yy++) {
  for (let xx = Math.max(0, cx - r); xx <= Math.min(W - 1, cx + r); xx++) {
    if ((xx - cx) ** 2 + (yy - cy) ** 2 > r * r) continue;
    const i = yy * W + xx;
    const t = eng.terrain[i];
    if (eng.fire[i] > 0) { eng.fire[i] = 0; healed++; }
    if (eng.radiate[i] > 0) { eng.radiate[i] = 0; cleansed++; }
    if (t === T_BURNT) { eng.setTerrain(i, T_GRASS); planted++; }
    else if (t === T_GRASS && ((xx * 7 + yy * 13) % 3 === 0)) { eng.setTerrain(i, T_FOREST); planted++; }
  }
}
return { at: [cx, cy], radius: r, greened: planted, firesOut: healed, radCleansed: cleansed };`,
      },
      {
        name: 'wildlife_census',
        desc: '全物种深度普查：每个种族（含涌现物种）的数量、均血、位置重心、生态角色——生态面板级数据一步到位',
        args: {},
        script: `const acc = new Map();
for (const u of eng.units) {
  if (u.dead) continue;
  const key = u.race;
  let a = acc.get(key);
  if (!a) { a = { count: 0, hp: 0, sx: 0, sy: 0, civ: 0 }; acc.set(key, a); }
  a.count++; a.hp += u.hp; a.sx += u.x; a.sy += u.y;
  if (u.civ >= 0) a.civ++;
}
const rows = [...acc.entries()].map(([rid, a]) => {
  const base = eng.dynRaces.get(rid);
  const eco = base?.info?.eco ?? (a.civ > 0 ? 'civ' : 'wild');
  return { race: base?.name ?? ('种族#' + rid), count: a.count, avgHp: Math.round(a.hp / a.count),
    center: [Math.round(a.sx / a.count), Math.round(a.sy / a.count)], civilians: a.civ, eco };
}).sort((p, q) => q.count - p.count);
return { totalUnits: rows.reduce((s, r2) => s + r2.count, 0), species: rows.length, top: rows.slice(0, 24) };`,
      },
    ],
  },
  {
    id: 'plg_builtin_wonder',
    name: '奇观工坊',
    desc: '地理大工程：造山脉与挖运河——跨多格的线性地形工程，单格笔刷做不到',
    version: '1.0.0',
    author: 'builtin',
    builtin: true,
    enabled: true,
    createdAt: 0,
    tools: [
      {
        name: 'raise_mountain_range',
        desc: '造山脉：从起点沿指定角度隆起一条山脉（长度/宽度可调，山脊带雪冠）',
        args: {
          x: { type: 'number', desc: '起点 x', required: true },
          y: { type: 'number', desc: '起点 y', required: true },
          length: { type: 'number', desc: '长度 5-60 格（默认 24）' },
          angle: { type: 'number', desc: '走向角度 0-360 度（默认 30）' },
          width: { type: 'number', desc: '山脊宽度 1-4（默认 2）' },
        },
        script: `const T_MOUNTAIN = 6, T_HILL = 5, T_SNOW = 7;
const len = Math.max(5, Math.min(60, Math.round(args.length ?? 24)));
const ang = (args.angle ?? 30) * Math.PI / 180;
const wid = Math.max(1, Math.min(4, Math.round(args.width ?? 2)));
let raised = 0;
for (let k = 0; k < len; k++) {
  const cx = Math.round(args.x + Math.cos(ang) * k);
  const cy = Math.round(args.y + Math.sin(ang) * k);
  if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
  for (let dy = -wid; dy <= wid; dy++) for (let dx = -wid; dx <= wid; dx++) {
    const xx = cx + dx, yy = cy + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H || dx * dx + dy * dy > wid * wid) continue;
    const i = yy * W + xx;
    const core = dx === 0 && dy === 0;
    const snow = core && k > len * 0.55;
    eng.setTerrain(i, snow ? T_SNOW : core ? T_MOUNTAIN : ((xx + yy) % 3 === 0 ? T_HILL : T_MOUNTAIN));
    raised++;
  }
}
return { raised, from: [args.x, args.y], length: len, angleDeg: args.angle ?? 30 };`,
      },
      {
        name: 'dig_river',
        desc: '挖运河：在两点之间开凿一条河（自动宽度、端点校验、沿线熄火）',
        args: {
          x: { type: 'number', desc: '起点 x', required: true },
          y: { type: 'number', desc: '起点 y', required: true },
          x2: { type: 'number', desc: '终点 x', required: true },
          y2: { type: 'number', desc: '终点 y', required: true },
          width: { type: 'number', desc: '宽度 1-3（默认 1）' },
        },
        script: `const T_WATER = 1;
const steps = Math.max(1, Math.ceil(Math.hypot(args.x2 - args.x, args.y2 - args.y)));
const wid = Math.max(1, Math.min(3, Math.round(args.width ?? 1)));
let dug = 0;
for (let k = 0; k <= steps; k++) {
  const t = k / steps;
  const cx = Math.round(args.x + (args.x2 - args.x) * t);
  const cy = Math.round(args.y + (args.y2 - args.y) * t);
  for (let dy = -(wid - 1); dy <= wid - 1; dy++) for (let dx = -(wid - 1); dx <= wid - 1; dx++) {
    const xx = cx + dx, yy = cy + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const i = yy * W + xx;
    if (eng.fire[i] > 0) eng.fire[i] = 0;
    eng.setTerrain(i, T_WATER); dug++;
  }
}
return { dug, from: [args.x, args.y], to: [args.x2, args.y2] };`,
      },
    ],
  },
];

// ============ 自定义插件存储（oracle / player 来源） ============

/** 防御式加载（坏插件跳过；工具名与核心冲突的剔除该工具） */
function loadCustom(): OraclePlugin[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: OraclePlugin[] = [];
    for (const item of arr) {
      if (typeof item !== 'object' || item === null) continue;
      const r = item as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id : '';
      const name = typeof r.name === 'string' ? r.name.slice(0, 40) : '';
      if (!id || !name) continue;
      const tools: PluginToolDef[] = [];
      if (Array.isArray(r.tools)) {
        for (const t of r.tools) {
          if (typeof t !== 'object' || t === null) continue;
          const tt = t as Record<string, unknown>;
          const tname = typeof tt.name === 'string' ? tt.name : '';
          const tdesc = typeof tt.desc === 'string' ? tt.desc : '';
          const script = typeof tt.script === 'string' ? tt.script : '';
          if (!tname || !script.trim()) continue;
          tools.push({ name: tname.slice(0, 48), desc: tdesc.slice(0, 300), args: (tt.args && typeof tt.args === 'object' ? tt.args : undefined) as Record<string, ToolArgDef> | undefined, script: script.slice(0, MAX_SCRIPT_LEN) });
          if (tools.length >= MAX_TOOLS_PER_PLUGIN) break;
        }
      }
      out.push({
        id, name,
        desc: typeof r.desc === 'string' ? r.desc.slice(0, 400) : '',
        version: typeof r.version === 'string' ? r.version.slice(0, 12) : '1.0.0',
        author: r.author === 'player' ? 'player' : 'oracle',
        enabled: r.enabled !== false,
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
        tools,
      });
      if (out.length >= MAX_CUSTOM_PLUGINS) break;
    }
    return out;
  } catch {
    return [];
  }
}

let custom: OraclePlugin[] = loadCustom();

// ———— v9：builtin 开关持久化（wb_plgbits_v1）————
const BITS_KEY = 'wb_plgbits_v1';
function applyBuiltinBits() {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(BITS_KEY);
    if (!raw) return;
    const j = JSON.parse(raw) as unknown;
    if (typeof j !== 'object' || j === null || Array.isArray(j)) return;
    for (const [id, v] of Object.entries(j as Record<string, unknown>)) {
      if (typeof v !== 'boolean') continue;
      for (const b of BUILTIN_PACKS) if (b.id === id) b.enabled = v;
    }
  } catch {
    /* 坏存档忽略 */
  }
}
function persistBuiltinBits() {
  if (typeof window === 'undefined') return;
  try {
    const bits: Record<string, boolean> = {};
    for (const b of BUILTIN_PACKS) if (!b.enabled) bits[b.id] = false;
    window.localStorage.setItem(BITS_KEY, JSON.stringify(bits));
  } catch {
    /* 配额满：内存态继续可用 */
  }
}
applyBuiltinBits();

function persistCustom() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(custom));
  } catch {
    /* 配额满/隐私模式：内存态继续可用 */
  }
  emit();
}

// ============ 公开 API ============

/** 全部插件（builtin 在前 + 自定义） */
export function listPlugins(): OraclePlugin[] {
  return [...BUILTIN_PACKS, ...custom.map(clonePlugin)];
}

// ———— useSyncExternalStore 专用快照（引用稳定：未变更期间返回同一数组对象，防 React 无限重渲染）————
let snapshotCache: OraclePlugin[] | null = null;
export function pluginsSnapshot(): OraclePlugin[] {
  if (!snapshotCache) snapshotCache = listPlugins();
  return snapshotCache;
}

function clonePlugin(p: OraclePlugin): OraclePlugin {
  return { ...p, tools: p.tools.map((t) => ({ ...t, args: t.args ? { ...t.args } : undefined })) };
}

export function subscribePlugins(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPlugin(idOrName: string): OraclePlugin | null {
  const q = idOrName.trim();
  return listPlugins().find((p) => p.id === q || p.name === q) ?? null;
}

/** 核心工具名集合（注册时防撞车） */
const CORE_NAMES = new Set(AGENT_TOOLS.map((t) => t.name));

function allEnabledToolNames(excludeId?: string): Set<string> {
  const s = new Set<string>(CORE_NAMES);
  for (const p of listPlugins()) {
    if (p.id === excludeId) continue;
    for (const t of p.tools) s.add(t.name);
  }
  return s;
}

/** 校验插件脚本（沙箱纪律） */
export function validatePluginScript(script: string): string | null {
  if (!script.trim()) return '脚本为空';
  if (script.length > MAX_SCRIPT_LEN) return `脚本过长（${script.length} > ${MAX_SCRIPT_LEN} 字符）`;
  if (/while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;;/.test(script)) return '检测到死循环模式（while(true)/for(;;)）——禁止';
  return null;
}

/** 注册/覆写插件（同名替换保 id；builtin 不可覆写——提示改名） */
export function registerPlugin(input: {
  id?: string;
  name: string;
  desc?: string;
  version?: string;
  author?: 'oracle' | 'player';
  enabled?: boolean;
  tools: PluginToolDef[];
}): { ok: true; plugin: OraclePlugin } | { ok: false; error: string } {
  const name = input.name.trim().slice(0, 40);
  if (!name) return { ok: false, error: '缺少插件名称' };
  if (!input.tools?.length) return { ok: false, error: '至少需要一个工具' };
  if (input.tools.length > MAX_TOOLS_PER_PLUGIN) return { ok: false, error: `工具过多（上限 ${MAX_TOOLS_PER_PLUGIN} 个/插件）` };
  const target = (input.id ? custom.find((p) => p.id === input.id) : undefined) ?? custom.find((p) => p.name === name) ?? null;
  if (target === null && BUILTIN_PACKS.some((p) => p.name === name)) {
    return { ok: false, error: `「${name}」是内置插件名——换一个名字` };
  }
  // 工具名校验：合法标识符 + 全局唯一（排除自身）
  const taken = allEnabledToolNames(target?.id ?? input.id);
  const seen = new Set<string>();
  const tools: PluginToolDef[] = [];
  for (const t of input.tools) {
    const tname = (t.name ?? '').trim().slice(0, 48);
    if (!/^[a-zA-Z_][\w]{1,47}$/.test(tname)) return { ok: false, error: `工具名「${tname || '(空)'}」不合法（字母开头的英文标识符，如 nuke_rain）` };
    if (taken.has(tname) || seen.has(tname)) return { ok: false, error: `工具名「${tname}」与核心工具或其它插件冲突——换一个名字` };
    const err = validatePluginScript(t.script ?? '');
    if (err) return { ok: false, error: `工具 ${tname} 的脚本问题：${err}` };
    seen.add(tname);
    tools.push({ name: tname, desc: (t.desc ?? '').slice(0, 300), args: t.args, script: t.script.slice(0, MAX_SCRIPT_LEN) });
  }
  const plugin: OraclePlugin = {
    id: target?.id ?? `plg_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    desc: (input.desc ?? '').slice(0, 400),
    version: input.version?.slice(0, 12) || '1.0.0',
    author: input.author ?? 'oracle',
    enabled: input.enabled ?? true,
    createdAt: target?.createdAt ?? Date.now(),
    tools,
  };
  if (target) custom = custom.map((p) => (p.id === target.id ? plugin : p));
  else {
    if (custom.length >= MAX_CUSTOM_PLUGINS) return { ok: false, error: `自定义插件已满（上限 ${MAX_CUSTOM_PLUGINS} 个）` };
    custom = [...custom, plugin];
  }
  persistCustom();
  return { ok: true, plugin: clonePlugin(plugin) };
}

/** 开关插件（builtin 也可以关——v9：开关状态持久化 wb_plgbits_v1，刷新不再恢复默认） */
export function togglePlugin(idOrName: string, enabled: boolean): { ok: boolean; error?: string } {
  const p = getPlugin(idOrName);
  if (!p) return { ok: false, error: `没有名为「${idOrName}」的插件（list_plugins 查看实况）` };
  if (p.builtin) {
    for (const b of BUILTIN_PACKS) if (b.id === p.id) b.enabled = enabled;
    persistBuiltinBits();
    emit();
    return { ok: true };
  }
  custom = custom.map((x) => (x.id === p.id ? { ...x, enabled } : x));
  persistCustom();
  return { ok: true }
}

/** 卸载插件（builtin 不可卸载只可关闭） */
export function uninstallPlugin(idOrName: string): { ok: boolean; error?: string } {
  const p = getPlugin(idOrName);
  if (!p) return { ok: false, error: `没有名为「${idOrName}」的插件` };
  if (p.builtin) return { ok: false, error: `「${p.name}」是内置插件——只能关闭，不能卸载` };
  custom = custom.filter((x) => x.id !== p.id);
  persistCustom();
  return { ok: true };
}

// ============ 神谕目录合成（一等公民接线） ============

/** 有效工具目录 = 启用权柄包的核心工具（「一切皆插件」：核心层也可拆装）+ 全部启用中插件的工具
 *  （进 prompt 目录 + 原生 schema + 语义路由 + 执行门四处同源） */
export function effectiveOracleTools(): ToolDef[] {
  const core = filterByPacks(AGENT_TOOLS);
  const extra: ToolDef[] = [];
  for (const p of listPlugins()) {
    if (!p.enabled) continue;
    for (const t of p.tools) extra.push({ name: t.name, desc: `[插件·${p.name}] ${t.desc}`, args: t.args ?? {} });
  }
  return [...core, ...extra];
}

/** 执行一个插件工具（bridge 兜底路由到这里；v9 共享沙箱——与 run_script/Mod 钩子同一运行时与辅助函数） */
export function runPluginTool(eng: GameEngine, name: string, args: Record<string, unknown>): { ok: true; data: unknown } | { ok: false; error: string } {
  for (const p of listPlugins()) {
    if (!p.enabled) continue;
    const t = p.tools.find((x) => x.name === name);
    if (!t) continue;
    try {
      const result = runSandbox(eng, t.script, args ?? {}, MAX_SCRIPT_LEN);
      return { ok: true, data: result === undefined ? { ok: true, note: '已执行（无 return 值）' } : result };
    } catch (e) {
      return { ok: false, error: `插件「${p.name}」工具 ${name} 执行出错：${e instanceof Error ? e.message : String(e)}。${SANDBOX_CHEATSHEET}` };
    }
  }
  return { ok: false, error: `没有名为 ${name} 的插件工具（可能所属插件已被关闭或卸载——list_plugins 查看实况）` };
}
