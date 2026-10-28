// ============ 界域 Mod 工坊（Task 57 v9 · 一切皆插件的规则层） ============
// Mod = 结构化、可开关、可分享的世界改造包：
//   · params：引擎热参数补丁（engineParams 27+ 项的子集覆写——启用即生效，卸载还原默认基调）
//   · hooks ：沙箱脚本钩子（v9 事件大扩容：tick≈每0.75年 / year≈每年 + 任意游戏事件 war/fall/nuke/battle…）
// 持久化：localStorage `wb_mods_v1`（跨世界/跨会话——与造物图鉴同级的「玩家资产」）
// 运行时纪律（与 run_script/插件工具同一共享沙箱 sandbox.ts）：
//   · 静态拒绝 while(true)/for(;;)；形参 (eng, W, H, args) + 辅助 raceId/byRace + 错误附 API 速查
//   · 单脚本 ≤2000 字符、单 Mod 钩子 ≤4 个、总数 ≤24 个
//   · 钩子连续失败 3 次自动熔断（跳过后续执行并落纪事，防止坏 Mod 卡死世界）
//   · 事件钩子自带 30 tick 冷却（防雪崩——一场大战会产生大量 battle 事件）
// 参数应用：模块加载时即对 enabled Mod 应用参数补丁（engineParams 是全局活值，无需引擎实例）；
// 钩子执行：engine.tick() 周期调用 runModHooks + engine.addEvent() 事件分发 runModEventHooks。
import type { GameEngine } from './engine';
import { setEngineParam, getEngineParam, defaultEngineParam } from './engineParams';
import { runSandbox } from './sandbox';

export type ModAuthor = 'oracle' | 'player';

/** 支持的钩子事件：tick/year 周期 + 游戏世界事件（与引擎 WorldEventKind 同名） */
export const MOD_HOOK_EVENTS = [
  'tick', 'year',
  'found', 'war', 'peace', 'fall', 'unify', 'dragon', 'legend',
  'plague', 'zombie', 'nuke', 'meteor', 'battle', 'sack', 'siege',
  'rebel', 'riot', 'tech', 'build', 'colonize', 'festival',
  'volcano', 'tsunami', 'blizzard', 'locust', 'drought', 'flood',
] as const;
export type ModHookEvent = (typeof MOD_HOOK_EVENTS)[number];

/** 沙箱脚本钩子：event 决定触发时机，everyTicks 是节流（tick 事件默认 30、year 默认 40=1 年；事件钩子用固定 30 tick 冷却） */
export interface ModHookDef {
  event: string;
  everyTicks?: number;
  script: string;
}

export interface GameMod {
  id: string;
  name: string;
  desc: string;
  author: ModAuthor;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  /** 引擎参数补丁：{ 'war.declareRate': 2.5, 'pop.reproMul': 0.4 } */
  params: Record<string, number>;
  /** 沙箱脚本钩子 */
  hooks: ModHookDef[];
}

const STORE_KEY = 'wb_mods_v1';
const MAX_MODS = 24;
const MAX_HOOKS_PER_MOD = 4;
const MAX_SCRIPT_LEN = 2000;
/** 事件钩子的固定冷却（tick 数）——一场大战会产生大量 battle 事件，防雪崩 */
const EVENT_HOOK_COOLDOWN = 30;

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  snapshotCache = null; // 快照失效：下次读取重建
  for (const fn of listeners) fn();
}

/** 防御式逐行校验加载（坏行跳过不阻断——与造物图鉴同纪律） */
function loadRaw(): GameMod[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    const out: GameMod[] = [];
    for (const item of arr) {
      if (typeof item !== 'object' || item === null) continue;
      const r = item as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id : '';
      const name = typeof r.name === 'string' ? r.name.slice(0, 40) : '';
      if (!id || !name) continue;
      const params: Record<string, number> = {};
      if (r.params && typeof r.params === 'object') {
        for (const [k, v] of Object.entries(r.params as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
        }
      }
      const hooks: ModHookDef[] = [];
      if (Array.isArray(r.hooks)) {
        for (const h of r.hooks) {
          if (typeof h !== 'object' || h === null) continue;
          const hh = h as Record<string, unknown>;
          const script = typeof hh.script === 'string' ? hh.script : '';
          const eventRaw = typeof hh.event === 'string' ? hh.event : 'tick';
          const event = (MOD_HOOK_EVENTS as readonly string[]).includes(eventRaw) ? eventRaw : 'tick';
          if (!script.trim()) continue;
          hooks.push({ event, everyTicks: typeof hh.everyTicks === 'number' ? hh.everyTicks : undefined, script: script.slice(0, MAX_SCRIPT_LEN) });
          if (hooks.length >= MAX_HOOKS_PER_MOD) break;
        }
      }
      out.push({
        id, name,
        desc: typeof r.desc === 'string' ? r.desc.slice(0, 400) : '',
        author: r.author === 'player' ? 'player' : 'oracle',
        enabled: r.enabled === true,
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
        updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
        params, hooks,
      });
      if (out.length >= MAX_MODS) break;
    }
    return out;
  } catch {
    return [];
  }
}

let mods: GameMod[] = loadRaw();

function persist() {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(mods));
  } catch {
    /* 配额满/隐私模式：内存态继续可用 */
  }
  emit();
}

export function listMods(): GameMod[] {
  return mods.map((m) => ({ ...m, params: { ...m.params }, hooks: m.hooks.map((h) => ({ ...h })) }));
}

// ———— useSyncExternalStore 专用快照（引用稳定：未变更期间返回同一数组对象，防 React 无限重渲染）————
let snapshotCache: GameMod[] | null = null;
export function modsSnapshot(): GameMod[] {
  if (!snapshotCache) snapshotCache = listMods();
  return snapshotCache;
}

export function subscribeMods(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getMod(idOrName: string): GameMod | null {
  const q = idOrName.trim();
  return mods.find((m) => m.id === q || m.name === q) ?? null;
}

/** 校验一段 mod 脚本（静态纪律：死循环模式拒绝 + 长度） */
export function validateModScript(script: string): string | null {
  if (!script.trim()) return '脚本为空';
  if (script.length > MAX_SCRIPT_LEN) return `脚本过长（${script.length} > ${MAX_SCRIPT_LEN} 字符）`;
  if (/while\s*\(\s*(true|1)\s*\)|for\s*\(\s*;;/.test(script)) return '检测到死循环模式（while(true)/for(;;)）——禁止';
  return null;
}

/** 安装/覆写一个 Mod（同名替换保 id；enabled 时立即应用参数补丁） */
export function addMod(input: {
  id?: string;
  name: string;
  desc?: string;
  author?: ModAuthor;
  enabled?: boolean;
  params?: Record<string, number>;
  hooks?: ModHookDef[];
}): { ok: true; mod: GameMod } | { ok: false; error: string } {
  const name = input.name.trim().slice(0, 40);
  if (!name) return { ok: false, error: '缺少 Mod 名称' };
  // 参数键校验：必须是已注册引擎参数
  const params: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.params ?? {})) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return { ok: false, error: `参数 ${k} 的值必须是数字` };
    if (!getEngineParam(k)) return { ok: false, error: `未知引擎参数 ${k}（用 get_params 查看全部可调参数）` };
    params[k] = v;
  }
  const hooks: ModHookDef[] = [];
  for (const h of input.hooks ?? []) {
    if (hooks.length >= MAX_HOOKS_PER_MOD) return { ok: false, error: `钩子过多（上限 ${MAX_HOOKS_PER_MOD} 个/Mod）` };
    const err = validateModScript(h.script ?? '');
    if (err) return { ok: false, error: `钩子脚本问题：${err}` };
    const eventRaw = h.event ?? 'tick';
    const event = (MOD_HOOK_EVENTS as readonly string[]).includes(eventRaw) ? eventRaw : 'tick';
    hooks.push({ event, everyTicks: h.everyTicks, script: (h.script ?? '').slice(0, MAX_SCRIPT_LEN) });
  }
  // 同名/同 id 替换（保留原 id 与创建时间）
  const target = (input.id ? mods.find((m) => m.id === input.id) : undefined) ?? mods.find((m) => m.name === name) ?? null;
  const mod: GameMod = {
    id: target?.id ?? `mod_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    desc: (input.desc ?? '').slice(0, 400),
    author: input.author ?? 'oracle',
    enabled: input.enabled ?? true,
    createdAt: target?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    params, hooks,
  };
  if (target) {
    // 替换：先还原旧参数影响，再入列
    unapplyParams(target);
    mods = mods.map((m) => (m.id === target.id ? mod : m));
    hookRuntime.delete(mod.id); // 运行时状态重置
  } else {
    if (mods.length >= MAX_MODS) return { ok: false, error: `Mod 工坊已满（上限 ${MAX_MODS} 个）` };
    mods = [...mods, mod];
  }
  if (mod.enabled) applyParams(mod);
  persist();
  return { ok: true, mod: { ...mod } };
}

/** 开关一个 Mod（开=应用参数补丁；关=其参数还原默认基调） */
export function toggleMod(idOrName: string, enabled: boolean): { ok: boolean; error?: string } {
  const mod = getMod(idOrName);
  if (!mod) return { ok: false, error: `没有名为「${idOrName}」的 Mod（list_mods 查看实况）` };
  mods = mods.map((m) => (m.id === mod.id ? { ...m, enabled, updatedAt: Date.now() } : m));
  if (enabled) applyParams(mod);
  else unapplyParams(mod);
  persist();
  return { ok: true };
}

/** 卸载：还原参数 + 移除 */
export function removeMod(idOrName: string): { ok: boolean; error?: string } {
  const mod = getMod(idOrName);
  if (!mod) return { ok: false, error: `没有名为「${idOrName}」的 Mod` };
  if (mod.enabled) unapplyParams(mod);
  mods = mods.filter((m) => m.id !== mod.id);
  hookRuntime.delete(mod.id); // 清运行时状态
  persist();
  return { ok: true };
}

// ———————— 参数应用 / 还原 ————————

function applyParams(mod: GameMod) {
  for (const [path, value] of Object.entries(mod.params)) setEngineParam(path, value);
}

/** 还原默认基调：只还原这个 Mod 声明的键，且没有其它启用中的 Mod 也声明同一键 */
function unapplyParams(mod: GameMod) {
  for (const path of Object.keys(mod.params)) {
    const claimed = mods.some((m) => m.id !== mod.id && m.enabled && m.params[path] !== undefined);
    if (claimed) continue; // 其它 Mod 仍在占用——保持现状
    if (getEngineParam(path)) setEngineParam(path, defaultEngineParam(path));
  }
}

// ———————— 钩子运行时（engine.tick / engine.addEvent 双接线） ————————

/** 每 Mod 运行时状态：钩子上次执行 tick + 连续失败计数 */
interface HookRT {
  lastRun: number[];
  fails: number[];
}
const hookRuntime = new Map<string, HookRT>();
const MAX_CONSEC_FAILS = 3;

function hookRTOf(mod: GameMod): HookRT {
  let rt = hookRuntime.get(mod.id);
  if (!rt) {
    rt = { lastRun: mod.hooks.map(() => -1e9), fails: mod.hooks.map(() => 0) };
    hookRuntime.set(mod.id, rt);
  }
  return rt;
}

/** 执行单个钩子（共享沙箱 + 熔断记账） */
function runOneHook(eng: GameEngine, mod: GameMod, i: number, payload: Record<string, unknown>, cooldown: number): void {
  const rt = hookRTOf(mod);
  const h = mod.hooks[i];
  if (rt.fails[i] >= MAX_CONSEC_FAILS) return; // 已熔断
  if (eng.tickCount - rt.lastRun[i] < cooldown) return;
  rt.lastRun[i] = eng.tickCount;
  try {
    runSandbox(eng, h.script, payload, MAX_SCRIPT_LEN);
    rt.fails[i] = 0;
  } catch (e) {
    rt.fails[i]++;
    if (rt.fails[i] >= MAX_CONSEC_FAILS) {
      try {
        eng.addEvent('oracle', `Mod「${mod.name}」的钩子连续失败 ${MAX_CONSEC_FAILS} 次已被熔断：${e instanceof Error ? e.message : String(e)}`, {});
      } catch { /* 引擎未就绪则静默 */ }
    }
  }
}

/** 引擎 tick 接线入口：event='tick'（基础节流 30 tick ≈ 0.75 年）或 'year'（每年一次）。
 *  everyTicks 是 Mod 自己的进一步节流（下限 30/40 防高频滥用）。 */
export function runModHooks(eng: GameEngine, event: 'tick' | 'year', payload?: Record<string, unknown>) {
  for (const mod of mods) {
    if (!mod.enabled || mod.hooks.length === 0) continue;
    const rt = hookRTOf(mod);
    for (let i = 0; i < mod.hooks.length; i++) {
      const h = mod.hooks[i];
      if (h.event !== event) continue;
      const base = event === 'year' ? 40 : 30;
      const every = Math.max(base, Math.round(h.everyTicks ?? base));
      if (eng.tickCount - rt.lastRun[i] < every) continue;
      runOneHook(eng, mod, i, payload ?? { tick: eng.tickCount, year: Math.floor(eng.yearF) }, every);
    }
  }
}

/** v9 游戏事件分发（engine.addEvent 接线）：war/fall/nuke/battle… 任一世界事件触发匹配钩子。
 *  事件钩子固定 30 tick 冷却（防雪崩）；payload 携带 {kind, x, y, year}——脚本里 args.kind/args.x 取用。 */
export function runModEventHooks(eng: GameEngine, kind: string, x?: number, y?: number) {
  for (const mod of mods) {
    if (!mod.enabled) continue;
    for (let i = 0; i < mod.hooks.length; i++) {
      if (mod.hooks[i].event !== kind) continue;
      runOneHook(eng, mod, i, { kind, x, y, year: Math.floor(eng.yearF), tick: eng.tickCount }, EVENT_HOOK_COOLDOWN);
    }
  }
}

/** 当前是否有启用中的钩子（engine 可据此跳过调用开销） */
export function hasActiveModHooks(): boolean {
  return mods.some((m) => m.enabled && m.hooks.length > 0);
}

/** 是否存在启用中的事件钩子（addEvent 热路径零开销保障） */
export function hasModEventHooks(): boolean {
  for (const m of mods) {
    if (!m.enabled) continue;
    for (const h of m.hooks) if (h.event !== 'tick' && h.event !== 'year') return true;
  }
  return false;
}

// ———————— 模块加载即应用（持久化的 enabled Mod 参数立即生效） ————————
for (const m of mods) {
  if (m.enabled && Object.keys(m.params).length > 0) applyParams(m);
}
