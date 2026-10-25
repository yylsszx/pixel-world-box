'use client';
// ============ UI store bridging React and the engine ============
import { create } from 'zustand';
import type { FxPrefs, OracleMsg, OverlayMode, SaveData, SaveDataV2, SaveSlotMeta, StatsSnapshot, ToastMsg, TriggerDef, WorldEvent, WorldEventKind, WorldLaws } from '@/lib/game/types';
import { RACES, DEFAULT_LAWS } from '@/lib/game/types';
import type { ToolTab } from '@/lib/game/constants';
import { TOOLS, TOOL_BY_ID, defaultParams } from '@/lib/game/constants';
import { creationTools } from '@/lib/game/creations';
import { TEMPLATE_BY_ID } from '@/lib/game/worldTemplates';
import { GameEngine } from '@/lib/game/engine';
import { sfx } from '@/lib/game/sfx';
import { safePersist, safePersistMeta, safeLoadSlot, safeRemoveSlot, validateSaveData } from '@/lib/game/saveSafe';
import type { CouncilAgentStatus, CouncilFeedItem, CouncilPendingItem, RulerRole } from '@/lib/ruler/types';
import { getCouncil, initialCouncilAgents } from '@/lib/ruler/council';

let _engine: GameEngine | null = null;
export function getEngine(): GameEngine {
  if (!_engine) {
    _engine = new GameEngine();
    // 成就元进度回填：localStorage 已解锁成就注入引擎（新世界不重复播报）
    const ach = readAch();
    const ids = Object.entries(ach).map(([id, year]) => ({ id, year }));
    if (ids.length) _engine.injectAch(ids);
  }
  return _engine;
}

/** 纪事事件分类过滤 */
export type EventFilter = 'all' | 'kingdom' | 'war' | 'disaster' | 'legend' | 'world';
/** 事件类型 → 分类归档 */
export const EVENT_CATEGORY: Record<WorldEventKind, Exclude<EventFilter, 'all'>> = {
  found: 'kingdom', fall: 'kingdom', unify: 'kingdom', peace: 'kingdom',
  colonize: 'kingdom', settle: 'kingdom', shipwreck: 'kingdom',
  rebel: 'kingdom', build: 'kingdom', capital: 'kingdom', cession: 'kingdom',
  war: 'war', battle: 'war', bandit: 'war',
  siege: 'war', capture: 'war', sack: 'war', totalwar: 'war', occupy: 'war',
  army: 'war', clash: 'war', rout: 'war', casus: 'war', collapse: 'war',
  dragon: 'disaster', nuke: 'disaster', meteor: 'disaster', plague: 'disaster', zombie: 'disaster', demon: 'disaster', skeleton: 'disaster', acidrain: 'disaster',
  volcano: 'disaster', tsunami: 'disaster', blizzard: 'disaster', locust: 'disaster', drought: 'disaster', meteorshower: 'disaster',
  whitewalker: 'disaster', vampire: 'disaster',
  kraken: 'disaster', sandworm: 'disaster', basilisk: 'disaster', petrify: 'disaster',
  legend: 'legend', loot: 'legend',
  decree: 'legend', decreeOk: 'legend', decreeFail: 'legend',
  // —— 科技研发与社会体系 ——
  tech: 'kingdom', gov: 'kingdom', riot: 'kingdom', festival: 'kingdom',
  fireOut: 'kingdom', repair: 'kingdom',
  // —— 神力/天灾扩充 ——
  rain: 'world', sandstorm: 'disaster', typhoon: 'disaster', sinkhole: 'disaster',
  iceage: 'disaster', famine: 'disaster', blackhole: 'disaster', wrath: 'disaster',
  // —— 生物进化与生态竞争 ——
  evolve: 'world', eco: 'world',
  river: 'world', oasis: 'world',
  trigger: 'world',
  // —— 成就系统 ——
  achieve: 'legend',
  // —— 终极世界大战 ——
  worldwar: 'war',
  // —— 超级武器（未来时代） ——
  superweapon: 'war',
  // —— 涌现纪事（程序化武器/种化新物种/阈值特质） ——
  emerge: 'world',
  // —— 自然引擎（板块地震/造山/气旋/火山冬） ——
  geo: 'world',
  // —— 深度打磨：道路修筑/国际贸易商队 ——
  road: 'kingdom', trade: 'kingdom',
  // —— 联盟系统（结盟/入盟/叛盟/解散/集体防御） ——
  alliance: 'kingdom',
  // —— 种族系统 v2（种族灭绝） ——
  extinct: 'world',
  // —— 涌现社会内核：兽群溃逃雪崩（世界）/ 血仇得报（传奇）/ 家族里程碑（王国） ——
  panic: 'world',
  revenge: 'legend',
  lineage: 'kingdom',
  // —— v40：神谕 Agent（法则书写/宣告/热改参数） ——
  oracle: 'world',
  // —— 季节 × 万物（换季宣告） ——
  season: 'world',
};

/** 手动存档槽位（3 槽）+ 独立自动存档槽 + 旧单槽只读兼容 */
export type SlotKey = 'slot0' | 'slot1' | 'slot2' | 'auto' | 'legacy';
const SLOT_DATA_KEY: Record<SlotKey, string> = {
  slot0: 'wb_save_slot_0',
  slot1: 'wb_save_slot_1',
  slot2: 'wb_save_slot_2',
  auto: 'wb_save_auto',
  legacy: 'wb_save_v1', // Task 2-5 时期的单槽存档（手动/自动共用），只读兼容
};
/** 槽位元信息索引（轻量 JSON：列槽位时不解析 600KB 存档） */
const META_KEY = 'wb_save_meta_v1';
/** 画面效果开关持久化 */
const FX_PREFS_KEY = 'wb_fx_prefs';
const OVERLAY_KEY = 'wb_overlay';
/** 世界法则持久化（玩家偏好；读档时若存档携带法则则以存档为准并同步 store） */
const LAWS_KEY = 'wb_laws';
/** 音效开关的持久化键 */
const SOUND_KEY = 'wb_sound';
/** 工具放置参数持久化（每工具 count/radius/power/duration） */
const TOOL_PARAMS_KEY = 'wb_tool_params';
/** 成就元进度持久化（跨世界：id → 解锁年份） */
const ACH_KEY = 'wb_ach';
/** 新手引导完成标记持久化（'1' = 已看完；缺省 = 首次游玩需引导） */
const ONBOARD_KEY = 'wb_onboard';
/** 性能 HUD 开关持久化（'1' = 开启；缺省 = 关闭） */
const PERFHUD_KEY = 'wb_perfhud';
/** 环境音乐开关持久化（'0' = 关；缺省 = 开 —— 音量细调走 sfx 的 wb_vol） */
const MUSIC_KEY = 'wb_music';

/** 从 localStorage 恢复成就元进度（损坏/缺失 → 空对象） */
function readAch(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(ACH_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
function writeAch(a: Record<string, number>) {
  try {
    localStorage.setItem(ACH_KEY, JSON.stringify(a));
  } catch {
    /* 隐私模式忽略 */
  }
}

function readMetas(): Partial<Record<SlotKey, SaveSlotMeta>> {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Record<SlotKey, SaveSlotMeta>>;
  } catch {
    return {};
  }
}
function writeMetas(m: Partial<Record<SlotKey, SaveSlotMeta>>) {
  safePersistMeta(m); // 安全层：写后校验 + 备份回退；meta 仅展示层，失败静默
}

/** 【性能修复 v74】自动存档异步分片组装器：把 SaveDataV2 的列式大数组 `u`（header + 每单位一行，
 *  2400 单位 ≈ 1.3MB JSON 的主体）切成 ≤5ms 的空闲片逐段 stringify，主线程零长冻结。
 *  · 快照语义：入参 data 是 serialize 的纯拷贝，与引擎后续演化完全解耦（分片期间世界照常运行）
 *  · 调度：requestIdleCallback 优先；【实测坑】重负载/无头环境 ric 会停摆 → 3s 看门狗切换
 *    setTimeout 模式（定时器在忙线程中仍会被调度）；15s 绝对时限超时直通同步收尾
 *  · 防重入：autoSaveBusy 单飞（60s 间隔下不可能重叠，纯防御）；completed 标记防双收尾
 *  · JSON 手术：rest（除 u 外全字段，含空 units:[]）一次性序列化 → 去尾括号拼 "u":[ 分片行 ]} */
let autoSaveBusy = false;
function queueAutoSave(data: SaveData) {
  if (autoSaveBusy) return;
  autoSaveBusy = true;
  try {
    const d2 = data as SaveDataV2;
    const rows = d2.u ?? [];
    const { u: _omit, ...rest } = d2;
    void _omit;
    const head = JSON.stringify(rest);
    const prefix = head.slice(0, -1) + (head.length > 2 ? ',' : '') + '"u":[';
    const deadline = performance.now() + 15000;
    let i = 0;
    let body = '';
    let completed = false;
    let useRic = typeof requestIdleCallback === 'function';
    const scheduleTimeout = (cb: () => void) => setTimeout(cb, 1);
    const schedule: (cb: () => void) => void = (cb) => {
      if (useRic) requestIdleCallback(() => cb());
      else scheduleTimeout(cb);
    };
    // ric 停摆看门狗：3s 内未完成即切换 setTimeout 模式（并立即补一拍）
    const starveWatch = setTimeout(() => {
      if (completed) return;
      if (useRic) {
        useRic = false;
        scheduleTimeout(step); // 切换后立即补拍（不等下一轮）
      }
    }, 3000);
    const finish = () => {
      if (completed) return;
      completed = true;
      clearTimeout(starveWatch);
      // 收尾（正常走完或 15s 超时直通）：拼合 + 写库 + 元数据
      try {
        const json = prefix + body + ']}';
        const r = safePersist(SLOT_DATA_KEY.auto, json);
        if (!r.ok) throw new Error(r.error);
        const metas = readMetas();
        metas.auto = metaFromData('auto', d2, 'auto');
        writeMetas(metas);
      } catch (err) {
        console.error('[WB-SAVE-AUTO]', err);
      }
      autoSaveBusy = false;
    };
    const step = () => {
      if (completed) return;
      const t0 = performance.now();
      while (i < rows.length) {
        const j = Math.min(rows.length, i + 120);
        body += (i > 0 ? ',' : '') + JSON.stringify(rows.slice(i, j)).slice(1, -1);
        i = j;
        if (performance.now() - t0 > 5) break; // 单片预算 5ms
      }
      if (i < rows.length && performance.now() < deadline) { schedule(step); return; }
      finish();
    };
    schedule(step);
  } catch (err) {
    autoSaveBusy = false;
    console.error('[WB-SAVE-AUTO]', err);
  }
}
/** 从存档提取轻量元信息（列表展示用）——兼容 v1 units 与 v2 列式 u */
function metaFromData(key: SlotKey, d: SaveData, source: SaveSlotMeta['source']): SaveSlotMeta {
  let pop = 0;
  let civs = 0;
  const isV2 = d.v === 2;
  const units: { race: number; dead?: boolean }[] =
    isV2 && Array.isArray(d.u) && d.u.length > 1
      ? (d.u.slice(1) as unknown[][]).map((row) => ({ race: row[1] as number, dead: row[22] as boolean | undefined }))
      : d.units;
  for (const u of units) if (!u.dead && RACES[u.race]?.isCiv) pop++;
  for (const c of d.civs) if (c.alive) civs++;
  return { key, savedAt: d.savedAt, source, year: Math.floor(d.yearF), pop, civs, tick: d.tickCount, seed: d.seed };
}
/** 收集当前可用槽位列表（含元数据与数据键的对账与旧档探测） */
function listSlots(): SaveSlotMeta[] {
  const metas = readMetas();
  const out: SaveSlotMeta[] = [];
  for (const key of ['slot0', 'slot1', 'slot2', 'auto'] as SlotKey[]) {
    const data = localStorage.getItem(SLOT_DATA_KEY[key]);
    const meta = metas[key];
    if (data && meta) out.push(meta);
    else if (data || meta) {
      // 对账：只有单边存在 → 清理孤儿（数据在但 meta 丢失时仅能丢弃展示信息，数据不动）
      if (!data && meta) { delete metas[key]; writeMetas(metas); }
    }
  }
  // 旧单槽存档：存在则解析一次元信息并缓存进 meta（后续不再重复 parse）
  const legacyRaw = localStorage.getItem(SLOT_DATA_KEY.legacy);
  if (legacyRaw) {
    if (metas.legacy) out.push(metas.legacy);
    else {
      try {
        const d = JSON.parse(legacyRaw) as SaveData;
        const m = metaFromData('legacy', d, 'legacy');
        metas.legacy = m;
        writeMetas(metas);
        out.push(m);
      } catch {
        // 损坏的旧存档：跳过展示（不删数据）
      }
    }
  }
  return out;
}

interface GameStore {
  tool: string;
  tab: ToolTab;
  /** 观察模式：点「查看」后底部工具网格/细分栏/笔刷滑走，只留 Tab 行；再点「查看」或任一分类恢复 */
  viewMode: boolean;
  toggleViewMode: () => void;
  /** 摄影模式（Cinema）：隐藏全部 UI（顶栏/工具栏/小地图/面板），只剩纯净世界画面 + 右下角退出按钮；快捷键 C */
  cinema: boolean;
  toggleCinema: () => void;
  brush: number;
  /** 工具放置参数（每工具：count/radius/power/duration，随选中工具在工具栏上方展示） */
  toolParams: Record<string, Record<string, number>>;
  setToolParam: (toolId: string, key: string, value: number) => void;
  resetToolParam: (toolId: string) => void;
  speed: number;
  stats: StatsSnapshot | null;
  /** 面板内联提示（替代原主界面浮层消息：只显示在触发操作的对话框/面板内部，不遮挡游戏画面） */
  uiNote: ToastMsg | null;
  /** 顶部居中事件浮层栈（引擎世界事件：巨龙/瘟疫/造物降临等；4s 自动消散，上限 4 条防刷屏） */
  toasts: ToastMsg[];
  /** 推送一条事件浮层（engine.onToast 接线；过期自动出列） */
  pushToast: (text: string, tone: ToastMsg['tone'], op?: boolean) => void;
  dismissToast: (id: number) => void;
  selUnit: number | null;
  selCiv: number | null;
  showHelp: boolean;
  showMinimap: boolean;
  follow: boolean;
  soundOn: boolean;
  /** 世界纪事事件流（与引擎 worldEvents 同步） */
  events: WorldEvent[];
  showChronicle: boolean;
  /** 纪事事件类型过滤（当前选中分类） */
  eventFilter: EventFilter;
  setEventFilter: (f: EventFilter) => void;
  setEvents: (e: WorldEvent[]) => void;
  toggleChronicle: () => void;
  jumpToEvent: (e: WorldEvent) => void;
  /** 王国排行榜面板（桌面侧边栏） */
  showKingdoms: boolean;
  toggleKingdoms: () => void;
  /** 生态面板（生物进化与生态竞争；桌面侧边栏 + 移动抽屉） */
  showEco: boolean;
  toggleEco: () => void;
  /** 成就面板（跨世界元进度；桌面侧边栏 + 移动抽屉） */
  showAch: boolean;
  toggleAch: () => void;
  /** 自然引擎面板（板块/地质/四季/大气；桌面侧边栏 + 移动抽屉） */
  showNature: boolean;
  toggleNature: () => void;
  /** 涌现进化图谱面板（五系谱系：物种/武器/科技/特质/理念；桌面侧边栏 + 移动抽屉） */
  showEvo: boolean;
  toggleEvo: () => void;
  /** 种族面板（种族名录/性格/关系矩阵/灭绝；桌面侧边栏 + 移动抽屉） */
  showRace: boolean;
  toggleRace: () => void;
  /** 神经决策核心面板（NeuroCore 微型网络：三头统计/A-B 开关；桌面侧边栏 + 移动抽屉） */
  showNeuro: boolean;
  toggleNeuro: () => void;
  /** 社会涌现面板（恐慌传染场/血仇网络/家族谱系；桌面侧边栏 + 移动抽屉） */
  showSocietal: boolean;
  toggleSocietal: () => void;
  // ---------------- 神谕 AI（专门打造的 AI 大模型融入） ----------------
  /** 神谕面板开关（桌面左侧栏 + 移动抽屉；与王国榜/生态/成就同列互斥） */
  showOracle: boolean;
  toggleOracle: () => void;
  /** 强制打开神谕面板（图鉴「唤醒神谕编辑」等入口；带左栏互斥清理） */
  openOracle: () => void;
  /** 神谕会话消息（内存级：切世界清空） */
  oracleMsgs: OracleMsg[];
  /** 追加一条神谕会话消息 */
  addOracleMsg: (msg: Omit<OracleMsg, 'id' | 'ts'>) => void;
  /** 清空神谕会话 */
  clearOracle: () => void;
  /** 神谕请求进行中（输入区禁用 + 打字指示器） */
  oracleBusy: boolean;
  setOracleBusy: (v: boolean) => void;
  /** 神谕唤醒待发指令（图鉴编辑器「唤醒神谕」等入口注入；OraclePanel 打开时自动以 create 模式发送并清除） */
  oraclePending: string | null;
  setOraclePending: (text: string | null) => void;
  // ---------------- 统治者议会（AI 决策层：AI 控制决策，代码控制确定性） ----------------
  /** 议会面板开关（桌面坞 + 移动抽屉；与其余坞面板互斥） */
  showCouncil: boolean;
  toggleCouncil: () => void;
  /** AI 统治总开关（并会驱动周期召开） */
  councilOn: boolean;
  setCouncilOn: (v: boolean) => void;
  /** 召开周期（游戏年；上一次召开后经过这些年即自动召开） */
  councilInterval: number;
  setCouncilInterval: (v: number) => void;
  /** 高危动作「双席同议自动放行」开关（默认关：一律送呈造物主批复） */
  councilAutoConsent: boolean;
  setCouncilAutoConsent: (v: boolean) => void;
  /** 召开进行中（LLM 决断 + 仲裁执行） */
  councilBusy: boolean;
  /** 四席运行态 */
  councilAgents: Record<RulerRole, CouncilAgentStatus>;
  toggleCouncilAgent: (role: RulerRole) => void;
  /** 裁决流（最近 60 条：已验证/受阻/失败/待确认/执行中） */
  councilFeed: CouncilFeedItem[];
  /** 待造物主批复的高危意图（复述确认） */
  councilPending: CouncilPendingItem[];
  /** 立即召开议会 */
  councilConveneNow: () => void;
  /** 下发造物主谕令（注入下一次召开） */
  councilDecree: (text: string) => void;
  /** 批复/否决待确认意图 */
  councilConfirm: (id: number) => void;
  councilReject: (id: number) => void;
  /** 造物图鉴面板（造物图书馆：浏览/编辑/上板/删除/唤醒神谕编辑） */
  showCodex: boolean;
  toggleCodex: () => void;
  /** 成就元进度镜像（localStorage wb_ach：id → 解锁年份；引擎快照合并写入） */
  achMeta: Record<string, number>;
  /** 文明详情面板（科技树/社会体系）：null = 关闭，否则为 civId */
  civPanelCiv: number | null;
  openCivPanel: (id: number | null) => void;
  /** 移动端底部抽屉：当前打开的面板（none=关闭） */
  mobilePanel: 'none' | 'chronicle' | 'kingdoms' | 'triggers' | 'dev' | 'civ' | 'eco' | 'ach' | 'oracle' | 'nature' | 'evo' | 'race' | 'neuro' | 'societal' | 'council';
  openMobilePanel: (p: 'none' | 'chronicle' | 'kingdoms' | 'triggers' | 'dev' | 'civ' | 'eco' | 'ach' | 'oracle' | 'nature' | 'evo' | 'race' | 'neuro' | 'societal' | 'council') => void;
  /** 镜头跳转到世界坐标（排行榜/事件跳转共用） */
  jumpTo: (x: number, y: number) => void;
  setTool: (id: string) => void;
  setTab: (t: ToolTab) => void;
  setBrush: (v: number) => void;
  setSpeed: (v: number) => void;
  togglePause: () => void;
  /** 面板内联提示（自动 3.5s 消散） */
  showNote: (text: string, tone: ToastMsg['tone']) => void;
  clearNote: () => void;
  setStats: (s: StatsSnapshot) => void;
  select: (unit: number | null, civ: number | null) => void;
  selectCiv: (id: number | null) => void;
  newWorld: () => void;
  toggleHelp: () => void;
  toggleMinimap: () => void;
  toggleFollow: () => void;
  toggleSound: () => void;
  /** 画面效果开关（纯净画面模式） */
  fxPrefs: FxPrefs;
  setFxPrefs: (prefs: FxPrefs) => void;
  /** 世界法则（WorldBox World Laws） */
  laws: WorldLaws;
  setLaw: (key: keyof WorldLaws, value: boolean) => void;
  /** 读档后把存档中的法则同步到 store（内部使用） */
  syncLaws: (laws: WorldLaws) => void;
  /** 地图覆盖模式（无/政治版图/温度/湿度） */
  overlayMode: OverlayMode;
  setOverlayMode: (mode: OverlayMode) => void;
  /** 存档对话框：none 关闭 / save 保存模式 / load 读取模式 */
  saveDialog: 'none' | 'save' | 'load';
  openSaveDialog: (mode: 'save' | 'load') => void;
  closeSaveDialog: () => void;
  /** 当前可用槽位列表（对话框打开时刷新） */
  slotMetas: SaveSlotMeta[];
  refreshSlots: () => void;
  saveToSlot: (key: SlotKey) => boolean;
  loadFromSlot: (key: SlotKey) => boolean;
  deleteSaveSlot: (key: SlotKey) => void;
  /** 导出当前世界为 JSON 文件下载（跨设备迁移） */
  exportSave: () => boolean;
  /** 从 JSON 文件导入存档并直接进入该世界（验证失败 toast 报错） */
  importSave: (file: File) => Promise<boolean>;
  /** 自动存档（60 秒一次，写独立 auto 槽，不影响手动槽） */
  saveGame: (source?: 'auto') => boolean;
  // ---------------- 事件触发器（像素级精细化事件控制） ----------------
  /** 触发器镜像（与引擎同步） */
  triggers: TriggerDef[];
  /** 触发器面板开关（桌面侧栏/移动端抽屉共用） */
  showTriggers: boolean;
  toggleTriggers: () => void;
  /** 新建触发器（引擎 addTrigger 后同步镜像） */
  addTrigger: (t: Omit<TriggerDef, 'id' | 'fired' | 'nextFireYear'>) => void;
  /** 删除触发器 */
  removeTrigger: (id: number) => void;
  /** 更新触发器（局部合并） */
  updateTrigger: (id: number, patch: Partial<TriggerDef>) => void;
  /** 手动触发（按钮） */
  manualTrigger: (id: number) => void;
  /** 同步引擎触发器列表到镜像（事件触发后引擎侧变更时同步） */
  syncTriggers: () => void;
  /** 地图选点模式：拾取坐标回填新建/编辑表单 */
  picking: null | { onPick: (x: number, y: number) => void };
  startPick: (onPick: (x: number, y: number) => void) => void;
  cancelPick: () => void;
  /** 地图选点完成（GameCanvas 拦截点击后调用） */
  pickDone: (x: number, y: number) => void;
  // ---------------- 开发者模式 ----------------
  /** 开发者模式开关（顶栏扳手按钮；性能统计/单位编辑/王国控制台） */
  devMode: boolean;
  toggleDevMode: () => void;
  /** 开发者面板可见（桌面侧栏/移动端抽屉共用；仅 devMode 开启时可打开） */
  showDev: boolean;
  toggleDevPanel: () => void;
  /** 宝物工具分类筛选（items 标签页内：全部/武器/护甲/…） */
  itemCat: 'all' | 'chest' | 'wep' | 'arm' | 'hlm' | 'shd' | 'bts' | 'rng' | 'amu';
  setItemCat: (c: 'all' | 'chest' | 'wep' | 'arm' | 'hlm' | 'shd' | 'bts' | 'rng' | 'amu') => void;
  // ---------------- 42-c 门面体验（标题屏 boot 流程 + 新手引导） ----------------
  /** 启动阶段：'title' = 标题主菜单（背后世界持续运行），'game' = 进入游戏 HUD */
  boot: 'title' | 'game';
  /** 进入当前背后运行的世界（标题屏主按钮） */
  enterWorld: () => void;
  /** 回到标题屏（保留世界运行状态，仅重新盖上主菜单覆盖层） */
  showTitle: () => void;
  /** 按世界模板重铸世界（标题屏模板面板）并进入游戏 */
  forgeWorld: (templateId: string, seed?: number) => void;
  /** 新手引导是否已完成（localStorage wb_onboard 持久化） */
  onboardingDone: boolean;
  /** 走完引导（持久化） */
  finishOnboarding: () => void;
  /** 重新观看引导（标题屏「新手教程」入口；不写 localStorage，仅置内存 false） */
  restartOnboarding: () => void;
  // ---------------- 42-e 设置中心（性能 HUD / 环境音乐） ----------------
  /** 性能 HUD 开关（localStorage wb_perfhud 持久化；PerfHud 组件自取引擎实例轮询） */
  perfHud: boolean;
  togglePerfHud: () => void;
  /** 环境音乐开关（进入世界自动起调；音量细调由 sfx 双通道负责） */
  musicOn: boolean;
  toggleMusic: () => void;
  // ---------------- 45-b UI 交互体系 2.0 ----------------
  /** 命令面板（Ctrl+K）：全屏半透明遮罩 + 居中搜索框 */
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  /** 键位速查浮层（? 键 / Shift+/） */
  keymapOpen: boolean;
  setKeymapOpen: (v: boolean) => void;
  /** 画布上下文菜单（右键 / 触屏长按）：屏幕坐标 + 对应世界坐标（上下文感知用），null = 关闭 */
  ctxMenu: { x: number; y: number; wx: number; wy: number } | null;
  openCtxMenu: (x: number, y: number, wx: number, wy: number) => void;
  closeCtxMenu: () => void;
  /** Shift 框选的群组（存活单位 id，上限 200） */
  groupSel: number[];
  setGroupSel: (ids: number[]) => void;
  clearGroupSel: () => void;
  /** 镜头跟随群组质心（群组条「跟随」开关；由 GameCanvas 主循环执行） */
  groupFollow: boolean;
  setGroupFollow: (v: boolean) => void;
  /** 群组条挂起的下一次点击动作：'teleport' = 传送群组到点击处 */
  pendingGroupAction: null | 'teleport';
  setPendingGroupAction: (v: null | 'teleport') => void;
  /** 悬停信息芯片（鼠标旁 12px；GameCanvas 50ms 节流写入） */
  hoverInfo: { x: number; y: number; text: string } | null;
  setHoverInfo: (v: { x: number; y: number; text: string } | null) => void;
  /** 交互 2.0 屏幕级轻提示（撤销/书签/群组操作反馈；自动 2.6s 消散） */
  interactNote: { id: number; text: string; tone: 'info' | 'good' | 'danger' } | null;
  showInteractNote: (text: string, tone?: 'info' | 'good' | 'danger') => void;
  // ---------------- 75 指挥模式总开关（复杂交互门控） ----------------
  /** 指挥模式：默认关闭 = 简洁模式，仅保留 拖动平移 / 滚轮·双指缩放 / 工具施放 / 点选检查器 等基础操作；
   *  开启后解锁交互 2.0 全家：Shift·触屏框选编组 / 右键·长按上下文菜单 / 长按凝视 / 悬停芯片 /
   *  命令面板 / 键位速查 / 镜头书签。关闭时自动清扫全部交互浮层（群组/菜单/面板/芯片/气泡），
   *  杜绝残留误触；高频 pointermove 热路径上的悬停拾取也随之整体停算（性能收益）。 */
  commandMode: boolean;
  toggleCommandMode: () => void;
  /** 设置中心弹层开关（TopBar 受控；命令面板可远程唤起） */
  showSettings: boolean;
  toggleSettings: () => void;
  // —— 神谕圣装（Task 70 移动端沉浸式 UI）——
  /** 神之手势盘抽屉（移动端底部：神之印记唤出的图腾抽屉） */
  divineOpen: boolean;
  setDivineOpen: (v: boolean) => void;
  /** 施法中（指针在地图上施放期间：移动端 HUD 整体隐身，停手约 1.2s 后淡入） */
  casting: boolean;
  setCasting: (v: boolean) => void;
  /** 神之视界（长按空地的透视气泡；屏幕坐标 + 预渲染文本，松手消散） */
  gaze: { x: number; y: number; text: string } | null;
  setGaze: (v: { x: number; y: number; text: string } | null) => void;
  /** 单位轻气泡（触屏点选生灵的头顶气泡；存 unit id，组件端跟随渲染） */
  unitBubble: number | null;
  setUnitBubble: (v: number | null) => void;
  /** 神界俯瞰图（右上水晶球展开的全屏地图 + 移动端控制中心） */
  godView: boolean;
  setGodView: (v: boolean) => void;
  /** 灵动岛脉冲（世界大事件：岁月沙漏泛红震动，点击开纪事；自动消散） */
  pulse: { id: number; text: string; tone: ToastMsg['tone'] } | null;
  pushPulse: (text: string, tone: ToastMsg['tone'], op?: boolean) => void;
}

/** 读档失败/成功等统一面板内联提示入口 */
function quickToast(text: string, tone: ToastMsg['tone']) {
  useGameStore.getState().showNote(text, tone);
}

// 音效开关初始值：从 localStorage 恢复（仅客户端执行；页面 ssr:false 无 SSR 风险）
const initialSound = typeof window !== 'undefined' && localStorage.getItem(SOUND_KEY) === '0' ? false : true;
// 新手引导初始值：localStorage wb_onboard === '1' 即已完成（缺省 false = 首次游玩需引导）
const initialOnboarded = typeof window !== 'undefined' && localStorage.getItem(ONBOARD_KEY) === '1';
// 性能 HUD 初始值：localStorage wb_perfhud === '1' 才默认开启（性能敏感用户缺省不受打扰）
const initialPerfHud = typeof window !== 'undefined' && localStorage.getItem(PERFHUD_KEY) === '1';
// 环境音乐初始值：localStorage wb_music === '0' 才默认关闭（缺省开启，进入世界即起调）
const initialMusicOn = !(typeof window !== 'undefined' && localStorage.getItem(MUSIC_KEY) === '0');
sfx.enabled = initialSound;

// 画面效果开关初始值：默认全开（特效密度默认标准档）
const initialFxPrefs: FxPrefs = (() => {
  const def: FxPrefs = { dmgNumbers: true, battleFlash: true, riverFlow: true, ambience: true, fxDensity: 1, blood: true, corpses: true, hpBars: true, dayNight: true };
  if (typeof window === 'undefined') return def;
  try {
    const raw = localStorage.getItem(FX_PREFS_KEY);
    if (raw) return { ...def, ...(JSON.parse(raw) as Partial<FxPrefs>) };
  } catch {
    /* 损坏则回退默认 */
  }
  return def;
})();

// 地图覆盖模式初始值：从 localStorage 恢复
const initialOverlay: OverlayMode = (() => {
  if (typeof window === 'undefined') return 'none';
  const raw = localStorage.getItem(OVERLAY_KEY);
  return raw === 'political' || raw === 'temperature' || raw === 'moisture' || raw === 'density' || raw === 'biome' ? raw : 'none';
})();

// 世界法则初始值：从 localStorage 恢复（读档时若存档带法则则同步覆盖）
const initialLaws: WorldLaws = (() => {
  if (typeof window === 'undefined') return { ...DEFAULT_LAWS };
  try {
    const raw = localStorage.getItem(LAWS_KEY);
    if (raw) return { ...DEFAULT_LAWS, ...(JSON.parse(raw) as Partial<WorldLaws>) };
  } catch {
    /* 损坏则回退默认 */
  }
  return { ...DEFAULT_LAWS };
})();

// 工具放置参数初始值：每工具取参数定义默认值 → 再用持久化偏好覆盖（仅限已知工具与合法值）
const initialToolParams: Record<string, Record<string, number>> = (() => {
  const out: Record<string, Record<string, number>> = {};
  for (const t of TOOLS) if (t.params?.length) out[t.id] = defaultParams(t.params);
  if (typeof window === 'undefined') return out;
  try {
    const raw = JSON.parse(localStorage.getItem(TOOL_PARAMS_KEY) ?? '{}') as Record<string, Record<string, number>>;
    for (const t of TOOLS) {
      const saved = raw[t.id];
      if (!t.params || !saved || typeof saved !== 'object') continue;
      for (const p of t.params) {
        const v = saved[p.key];
        if (typeof v === 'number' && Number.isFinite(v) && v >= p.min && v <= p.max) out[t.id][p.key] = v;
      }
    }
  } catch {
    /* 损坏则回退默认 */
  }
  return out;
})();

// ── 统治者议会设置持久化（wb_council_v1） ──
interface CouncilPersist {
  on: boolean;
  interval: number;
  autoConsent: boolean;
  agents: Record<string, boolean> | null;
}
const COUNCIL_KEY = 'wb_council_v1';
const initialCouncil: CouncilPersist = (() => {
  const def: CouncilPersist = { on: false, interval: 15, autoConsent: false, agents: null };
  if (typeof window === 'undefined') return def;
  try {
    const raw = JSON.parse(localStorage.getItem(COUNCIL_KEY) ?? '{}') as Partial<CouncilPersist>;
    return {
      on: raw.on === true,
      interval: typeof raw.interval === 'number' && raw.interval >= 5 && raw.interval <= 60 ? Math.round(raw.interval) : def.interval,
      autoConsent: raw.autoConsent === true,
      agents: raw.agents && typeof raw.agents === 'object' ? raw.agents : null,
    };
  } catch {
    return def;
  }
})();
function persistCouncil(patch: Partial<CouncilPersist>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.parse(localStorage.getItem(COUNCIL_KEY) ?? '{}') as Partial<CouncilPersist>;
    localStorage.setItem(COUNCIL_KEY, JSON.stringify({ ...raw, ...patch }));
  } catch {
    /* 损坏则忽略 */
  }
}
function persistCouncilAgents(agents: Record<string, { enabled: boolean }>): void {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(agents)) out[k] = v.enabled;
  persistCouncil({ agents: out });
}
/** 席位初始态（含持久化开关恢复） */
function initialCouncilAgentsMerged(): Record<RulerRole, CouncilAgentStatus> {
  const base = initialCouncilAgents();
  const saved = initialCouncil.agents;
  if (saved) {
    for (const k of Object.keys(base) as RulerRole[]) {
      if (typeof saved[k] === 'boolean') base[k].enabled = saved[k] === true;
    }
  }
  return base;
}

// ── Task 69 侧边坞互斥（集中清单，杜绝逐个 toggle 漏写兄弟面板） ──
// 坞内一次只展示一个面板：开启任一面板时收掉其余九个（关闭时也顺带清场，自愈历史脏状态）
const SU_DOCK_KEYS = [
  'showKingdoms', 'showEco', 'showNature', 'showRace', 'showEvo',
  'showSocietal', 'showNeuro', 'showOracle', 'showAch', 'showDev', 'showCouncil',
] as const;
type SuDockKey = (typeof SU_DOCK_KEYS)[number];
function dockExclusive(opening: SuDockKey, s: GameStore): Partial<GameStore> {
  const patch: Partial<Record<SuDockKey, boolean>> = { [opening]: !s[opening] };
  for (const k of SU_DOCK_KEYS) if (k !== opening) patch[k] = false;
  return patch as Partial<GameStore>;
}

export const useGameStore = create<GameStore>((set, get) => ({
  tool: 'select',
  tab: 'creatures',
  viewMode: false,
  cinema: false,
  brush: 3,
  toolParams: initialToolParams,
  speed: 1,
  stats: null,
  uiNote: null,
  toasts: [],
  selUnit: null,
  selCiv: null,
  showHelp: false,
  showMinimap: true,
  follow: false,
  soundOn: initialSound,
  events: [],
  // 面板仅在顶栏模块按钮触发时出现（主界面不再常驻折叠条）
  showChronicle: false,
  showKingdoms: false,
  showEco: false,
  showAch: false,
  showNature: false,
  showEvo: false,
  showRace: false,
  showNeuro: false,
  showSocietal: false,
  achMeta: readAch(),
  showOracle: false,
  oracleMsgs: [],
  oracleBusy: false,
  oraclePending: null,
  showCodex: false,
  civPanelCiv: null,
  mobilePanel: 'none',
  // ---------------- 统治者议会初始值 ----------------
  showCouncil: false,
  councilOn: initialCouncil.on,
  councilInterval: initialCouncil.interval,
  councilAutoConsent: initialCouncil.autoConsent,
  councilBusy: false,
  councilAgents: initialCouncilAgentsMerged(),
  councilFeed: [],
  councilPending: [],
  eventFilter: 'all',
  fxPrefs: initialFxPrefs,
  laws: initialLaws,
  overlayMode: initialOverlay,
  saveDialog: 'none',
  // —— 神谕圣装（Task 70）初始值 ——
  divineOpen: false,
  casting: false,
  gaze: null,
  unitBubble: null,
  godView: false,
  pulse: null,
  slotMetas: [],
  triggers: [],
  showTriggers: false,
  devMode: false,
  showDev: false,
  itemCat: 'chest',
  picking: null,
  // ---------------- 42-c 门面体验 ----------------
  boot: 'title',
  onboardingDone: initialOnboarded,
  // ---------------- 42-e 设置中心 ----------------
  perfHud: initialPerfHud,
  musicOn: initialMusicOn,

  // ---------------- 45-b UI 交互体系 2.0 ----------------
  paletteOpen: false,
  setPaletteOpen: (v) => {
    if (v && !get().commandMode) {
      // 75 门控：命令面板属复杂交互，需先开启指挥模式（单一闸门收拢全部唤起入口：Ctrl+K/顶栏/水晶球/智能提示）
      get().showInteractNote('命令面板需先开启「指挥模式」（右侧开关或按 X）', 'info');
      return;
    }
    sfx.ui(v ? 'open' : 'close');
    set({ paletteOpen: v });
  },
  keymapOpen: false,
  setKeymapOpen: (v) => {
    if (v && !get().commandMode) {
      get().showInteractNote('键位速查需先开启「指挥模式」（右侧开关或按 X）', 'info');
      return;
    }
    sfx.ui(v ? 'open' : 'close');
    set({ keymapOpen: v });
  },
  ctxMenu: null,
  openCtxMenu: (x, y, wx, wy) => {
    if (!get().commandMode) return; // 75 门控：简洁模式不弹上下文菜单（源头上 GameCanvas 已拦，此处双保险）
    sfx.ui('open');
    set({ ctxMenu: { x, y, wx, wy }, hoverInfo: null });
  },
  closeCtxMenu: () => {
    sfx.ui('close');
    set({ ctxMenu: null });
  },
  groupSel: [],
  setGroupSel: (ids) => {
    if (!get().commandMode) return; // 75 门控：简洁模式不可能产生框选（防御性双保险）
    sfx.ui('toggle');
    set({ groupSel: ids });
  },
  clearGroupSel: () => {
    set((s) => (s.groupSel.length ? { groupSel: [], groupFollow: false, pendingGroupAction: null } : s));
  },
  groupFollow: false,
  setGroupFollow: (v) => {
    sfx.ui('toggle');
    if (v) {
      // 群组跟随与单单位跟随互斥：开启群组跟随时解除引擎跟随
      if (_engine) _engine.followId = null;
    }
    set({ groupFollow: v });
  },
  pendingGroupAction: null,
  setPendingGroupAction: (v) => {
    sfx.ui('toggle');
    set({ pendingGroupAction: v, hoverInfo: null });
  },
  hoverInfo: null,
  setHoverInfo: (v) => {
    if (v && !get().commandMode) return; // 75 门控：简洁模式不算悬停芯片（关值永远放行，保证 onLeave 清理畅通）
    set({ hoverInfo: v });
  },
  interactNote: null,
  showInteractNote: (text, tone = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set({ interactNote: { id, text, tone } });
    setTimeout(() => {
      if (useGameStore.getState().interactNote?.id === id) set({ interactNote: null });
    }, 2600);
  },

  // ---------------- 75 指挥模式总开关 ----------------
  commandMode: false,
  toggleCommandMode: () => {
    const next = !get().commandMode;
    sfx.ui('toggle');
    if (next) {
      set({ commandMode: true });
    } else {
      // 关闭 = 清扫全部交互 2.0 浮层与挂起态（群组/跟随/传送/菜单/面板/芯片/凝视/气泡），回到纯净简洁模式
      set({
        commandMode: false,
        groupSel: [],
        groupFollow: false,
        pendingGroupAction: null,
        ctxMenu: null,
        paletteOpen: false,
        keymapOpen: false,
        hoverInfo: null,
        gaze: null,
        unitBubble: null,
      });
    }
    get().showInteractNote(
      next ? '指挥模式已开启：框选 · 右键菜单 · 长按凝视 · 命令面板已解锁' : '已回到简洁模式（仅保留拖动 · 缩放 · 施放）',
      next ? 'good' : 'info',
    );
  },
  showSettings: false,
  toggleSettings: () => {
    sfx.ui(get().showSettings ? 'close' : 'open');
    set((s) => ({ showSettings: !s.showSettings }));
  },

  setEventFilter: (f) => {
    sfx.ui('tab'); // 纪事分类过滤 = 标签切换音
    set({ eventFilter: f });
  },
  setEvents: (e) => set({ events: e }),
  toggleChronicle: () => {
    sfx.ui(get().showChronicle ? 'close' : 'open');
    set((s) => ({ showChronicle: !s.showChronicle }));
  },
  toggleKingdoms: () => {
    sfx.ui(get().showKingdoms ? 'close' : 'open');
    // 侧边坞互斥 v2（Task 69 集中清单）
    set((s) => dockExclusive('showKingdoms', s));
  },
  toggleEco: () => {
    sfx.ui(get().showEco ? 'close' : 'open');
    set((s) => dockExclusive('showEco', s));
  },
  toggleAch: () => {
    sfx.ui(get().showAch ? 'close' : 'open');
    set((s) => dockExclusive('showAch', s));
  },
  toggleNature: () => {
    sfx.ui(get().showNature ? 'close' : 'open');
    set((s) => dockExclusive('showNature', s));
  },
  // ---------------- 涌现进化图谱（五系谱系统一视图） ----------------
  toggleEvo: () => {
    sfx.ui(get().showEvo ? 'close' : 'open');
    set((s) => dockExclusive('showEvo', s));
  },
  // ---------------- 种族系统 v2（种族名录/性格/关系矩阵） ----------------
  toggleRace: () => {
    sfx.ui(get().showRace ? 'close' : 'open');
    set((s) => dockExclusive('showRace', s));
  },
  // ---------------- 神经决策核心（NeuroCore 微型网络面板） ----------------
  toggleNeuro: () => {
    sfx.ui(get().showNeuro ? 'close' : 'open');
    set((s) => dockExclusive('showNeuro', s));
  },
  // ---------------- 社会涌现（恐慌/血仇/家族三系统仪表） ----------------
  toggleSocietal: () => {
    sfx.ui(get().showSocietal ? 'close' : 'open');
    set((s) => dockExclusive('showSocietal', s));
  },
  // ---------------- 神谕 AI（专门打造的 AI 大模型） ----------------
  toggleOracle: () => {
    sfx.ui(get().showOracle ? 'close' : 'open');
    // 侧边坞互斥 v2（Task 69 集中清单：修复旧版漏收 Race/Evo/Dev 的叠加 bug）
    set((s) => dockExclusive('showOracle', s));
  },
  addOracleMsg: (msg) => {
    set((s) => ({ oracleMsgs: [...s.oracleMsgs, { ...msg, id: s.oracleMsgs.length + 1 + Math.floor(Math.random() * 1e4), ts: Date.now() }] }));
  },
  clearOracle: () => {
    sfx.click();
    set({ oracleMsgs: [] });
  },
  setOracleBusy: (v) => set({ oracleBusy: v }),
  openOracle: () => {
    if (useGameStore.getState().showOracle) return; // 已开：保持（避免重置滚动）
    sfx.ui('open');
    set((s) => ({
      showOracle: true,
      showKingdoms: false,
      showEco: false,
      showAch: false,
      showNature: false,
      showNeuro: false,
      showSocietal: false,
      showRace: false,
      showEvo: false,
    }));
  },
  setOraclePending: (text) => set({ oraclePending: text }),
  // ---------------- 统治者议会 ----------------
  toggleCouncil: () => {
    sfx.ui(useGameStore.getState().showCouncil ? 'close' : 'open');
    set((s) => dockExclusive('showCouncil', s));
  },
  setCouncilOn: (v) => {
    persistCouncil({ on: v });
    set({ councilOn: v });
  },
  setCouncilInterval: (v) => {
    const n = Math.max(5, Math.min(60, Math.round(v)));
    persistCouncil({ interval: n });
    set({ councilInterval: n });
  },
  setCouncilAutoConsent: (v) => {
    persistCouncil({ autoConsent: v });
    set({ councilAutoConsent: v });
  },
  toggleCouncilAgent: (role) => {
    set((s) => ({
      councilAgents: {
        ...s.councilAgents,
        [role]: { ...s.councilAgents[role], enabled: !s.councilAgents[role].enabled, phase: '静观' },
      },
    }));
    persistCouncilAgents(useGameStore.getState().councilAgents);
  },
  councilConveneNow: () => {
    void getCouncil().convene('manual');
  },
  councilDecree: (text) => {
    getCouncil().queueDecree(text);
    useGameStore.getState().pushToast('谕令已入议会（下次召开生效）', 'info', true);
  },
  councilConfirm: (id) => {
    getCouncil().confirmPending(id);
  },
  councilReject: (id) => {
    getCouncil().rejectPending(id);
  },
  toggleCodex: () => {
    sfx.ui(useGameStore.getState().showCodex ? 'close' : 'open');
    set((s) => ({ showCodex: !s.showCodex }));
  },
  openCivPanel: (id) => {
    sfx.ui(id != null ? 'open' : 'close');
    // Task 67 右上角互斥：打开文明面板时收起单位/文明检查器（同占右上角，避免叠压）
    set(id != null ? { civPanelCiv: id, selUnit: null, selCiv: null } : { civPanelCiv: null });
  },
  openMobilePanel: (p) => {
    sfx.ui(p !== 'none' ? 'open' : 'close');
    set({ mobilePanel: p });
  },
  jumpTo: (x, y) => {
    if (_engine) _engine.jumpTo(x, y);
    sfx.click();
  },
  jumpToEvent: (e) => {
    if (_engine && e.x != null && e.y != null) {
      _engine.jumpTo(e.x, e.y);
      sfx.click();
    }
  },

  setTool: (id) => {
    const eng = _engine;
    // v5：造物图鉴工具（cre:uid）查动态表——count/radius 参数与预览圈同步生效
    const def = TOOL_BY_ID[id] ?? (id.startsWith('cre:') ? creationTools().find((t) => t.id === id) : undefined);
    if (eng) {
      // 笔刷预览：笔刷类工具 / 带 radius 参数的工具 / 历史特殊名单
      const hasRadius = !!def?.params?.some((p) => p.key === 'radius');
      eng.brushPreview = !!def?.brush || hasRadius || id === 'plague' || id === 'river' || id === 'oasis';
      // 带 radius 参数的工具：预览圈跟随参数值；其余用通用笔刷半径
      eng.previewR = hasRadius ? (useGameStore.getState().toolParams[id]?.radius ?? def!.params!.find((p) => p.key === 'radius')!.def) : null;
    }
    // v5 修复：选中带参数工具时初始化默认参数——面板显示的 def 值必须真实生效
    // （此前 toolParams 无条目 → 面板显示「数量 6」但 applyTool 收到 undefined → 只放 1 只——显示与执行不一致）
    if (def?.params?.length && !useGameStore.getState().toolParams[id]) {
      const fresh = defaultParams(def.params);
      const next = { ...useGameStore.getState().toolParams, [id]: fresh };
      try {
        localStorage.setItem(TOOL_PARAMS_KEY, JSON.stringify(next));
      } catch {
        /* 隐私模式忽略 */
      }
      set({ toolParams: next });
    }
    sfx.click(); // 工具切换 UI 音
    set({ tool: id });
  },
  setTab: (t) => {
    sfx.ui('tab'); // 工具栏分类切换 = 标签音
    set((s) => ({ tab: t, viewMode: false }));
  },
  toggleViewMode: () => {
    sfx.click();
    set((s) => ({ viewMode: !s.viewMode }));
  },
  toggleCinema: () => {
    sfx.click();
    set((s) => {
      const on = !s.cinema;
      // 进入摄影模式时收起所有面板，退出时保持收起（用户自行重新打开）
      if (on) {
        return {
          cinema: true,
          showChronicle: false, showKingdoms: false, showEco: false, showTriggers: false, showDev: false, showAch: false, showOracle: false, showNature: false, showNeuro: false, showEvo: false, showRace: false, showSocietal: false,
          civPanelCiv: null, mobilePanel: 'none' as const, saveDialog: 'none' as const, showHelp: false,
          viewMode: true,
        };
      }
      return { cinema: false, viewMode: false };
    });
  },
  setBrush: (v) => {
    if (_engine) _engine.brush = v;
    set({ brush: v });
  },

  // ---------------- 工具放置参数（数量/半径/强度/持续） ----------------
  setToolParam: (toolId, key, value) => {
    const cur = useGameStore.getState().toolParams[toolId] ?? {};
    const next = { ...useGameStore.getState().toolParams, [toolId]: { ...cur, [key]: value } };
    try {
      localStorage.setItem(TOOL_PARAMS_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式忽略 */
    }
    // radius 参数实时同步引擎预览圈半径
    if (_engine && key === 'radius' && useGameStore.getState().tool === toolId) _engine.previewR = value;
    set({ toolParams: next });
  },
  resetToolParam: (toolId) => {
    const def = TOOL_BY_ID[toolId]?.params ?? (toolId.startsWith('cre:') ? creationTools().find((t) => t.id === toolId)?.params : undefined);
    if (!def?.length) return;
    const fresh = defaultParams(def);
    const next = { ...useGameStore.getState().toolParams, [toolId]: fresh };
    try {
      localStorage.setItem(TOOL_PARAMS_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式忽略 */
    }
    if (_engine && useGameStore.getState().tool === toolId) _engine.previewR = fresh.radius ?? null;
    sfx.click();
    set({ toolParams: next });
  },
  setSpeed: (v) => {
    sfx.click();
    // 无极调速：钳制 0–20 并保留两位小数（负数/NaN/超界一律归位；0 = 暂停）
    const safe = Number.isFinite(v) ? Math.max(0, Math.min(20, Math.round(v * 100) / 100)) : 1;
    if (_engine) _engine.speed = safe;
    set({ speed: safe });
  },
  togglePause: () => {
    const cur = get().speed;
    const next = cur === 0 ? 1 : 0;
    sfx.click();
    if (_engine) _engine.speed = next;
    set({ speed: next });
  },
  showNote: (text, tone) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    set({ uiNote: { id, text, tone } });
    setTimeout(() => {
      if (useGameStore.getState().uiNote?.id === id) set({ uiNote: null });
    }, 3500);
  },
  clearNote: () => set({ uiNote: null }),
  pushToast: (text, tone, op) => {
    const id = Date.now() + Math.floor(Math.random() * 1e4);
    // 上限 4 条：旧的最先进丢弃，防高频事件刷屏
    set((s) => ({ toasts: [...s.toasts, { id, text, tone }].slice(-4) }));
    // 大事件联动岁月沙漏脉冲（Task 70 灵动岛：war/danger/good 级事件泛红震动）
    useGameStore.getState().pushPulse(text, tone, op);
    setTimeout(() => {
      if (useGameStore.getState().toasts.some((t) => t.id === id)) {
        useGameStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }
    }, 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setDivineOpen: (v) => set({ divineOpen: v }),
  setCasting: (v) => set({ casting: v }),
  setGaze: (v) => set({ gaze: v }),
  setUnitBubble: (v) => set({ unitBubble: v }),
  setGodView: (v) => set({ godView: v }),
  pushPulse: (text, tone, op) => {
    // Task 72 结构化过滤（替代 Task 70 的 PULSE_SKIP 短语黑名单）：
    //   · op = 神力操作回执（放置失败/编辑确认等「对你的回话」）→ 不惊动岁月沙漏
    //   · info 级小事件同理；war/danger/good（战争/天灾/诞生/统一）才触发脉冲
    if (op || tone === 'info') return;
    const id = Date.now() + Math.floor(Math.random() * 1e4);
    set({ pulse: { id, text, tone } });
    setTimeout(() => {
      if (useGameStore.getState().pulse?.id === id) set({ pulse: null });
    }, 4200);
  },
  setStats: (s) => {
    set({ stats: s });
    // 成就元进度合并：引擎新解锁 → 镜像 + localStorage 持久化（跨世界）
    if (s.unlockedAch?.length) {
      const cur = useGameStore.getState().achMeta;
      let changed = false;
      const next = { ...cur };
      for (const { id, year } of s.unlockedAch) {
        if (next[id] == null) { next[id] = year; changed = true; }
      }
      if (changed) {
        writeAch(next);
        set({ achMeta: next });
      }
    }
  },
  select: (unit, civ) => {
    if (_engine) {
      _engine.selectedId = unit;
      if (!unit) _engine.followId = null;
    }
    // Task 67 右上角互斥：点选单位/文明时收起文明详情面板（两者同占右上角，避免叠压）
    set({ selUnit: unit, selCiv: civ, follow: false, ...(unit != null ? { civPanelCiv: null } : {}) });
  },
  selectCiv: (id) => {
    if (_engine) _engine.selectedId = null;
    set({ selCiv: id, selUnit: null, follow: false, ...(id != null ? { civPanelCiv: null } : {}) });
  },
  newWorld: () => {
    const eng = _engine;
    if (eng) {
      eng.regenerate();
      eng.selectedId = null;
      eng.followId = null;
      set({ events: eng.worldEvents });
    }
    getCouncil().reset();
    set({ selUnit: null, selCiv: null, follow: false, oracleMsgs: [], oracleBusy: false, councilFeed: [], councilPending: [] });
  },
  toggleHelp: () => {
    sfx.ui(get().showHelp ? 'close' : 'open');
    set((s) => ({ showHelp: !s.showHelp }));
  },
  toggleMinimap: () => {
    sfx.ui('toggle');
    set((s) => ({ showMinimap: !s.showMinimap }));
  },
  toggleFollow: () => {
    const { selUnit, follow } = get();
    if (_engine && selUnit != null) _engine.followId = follow ? null : selUnit;
    set({ follow: !follow });
  },
  toggleSound: () => {
    const next = !get().soundOn;
    sfx.enabled = next;
    // 首次开启时顺带初始化 AudioContext（按钮点击即用户手势），并播放滴声确认
    if (next) {
      sfx.ensureInit();
      sfx.click();
    }
    if (typeof window !== 'undefined') localStorage.setItem(SOUND_KEY, next ? '1' : '0');
    set({ soundOn: next });
  },

  // ---------------- 画面效果开关 ----------------
  setFxPrefs: (prefs) => {
    if (_engine) _engine.fxPrefs = { ...prefs };
    try {
      localStorage.setItem(FX_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* 隐私模式忽略 */
    }
    set({ fxPrefs: { ...prefs } });
  },

  // ---------------- 世界法则（World Laws） ----------------
  setLaw: (key, value) => {
    const eng = _engine;
    if (eng) eng.laws[key] = value;
    const next = { ...useGameStore.getState().laws, [key]: value };
    try {
      localStorage.setItem(LAWS_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式忽略 */
    }
    sfx.click();
    set({ laws: next });
  },
  syncLaws: (laws) => {
    // 读档带入的法则优先于本地偏好，但不写 localStorage（下次新世界仍用玩家偏好）
    set({ laws: { ...laws } });
  },

  // ---------------- 地图覆盖模式（无/政治/温度/湿度） ----------------
  setOverlayMode: (mode) => {
    const eng = _engine;
    if (eng) {
      eng.overlayMode = mode;
      eng.overlayDirty = true; // 立即重绘覆盖层（下一帧生效）
    }
    try {
      localStorage.setItem(OVERLAY_KEY, mode);
    } catch {
      /* 隐私模式忽略 */
    }
    sfx.click();
    set({ overlayMode: mode });
  },

  // ---------------- 世界存档（多槽位） ----------------
  openSaveDialog: (mode) => {
    sfx.ui('open');
    get().refreshSlots();
    set({ saveDialog: mode });
  },
  closeSaveDialog: () => {
    sfx.ui('close');
    set({ saveDialog: 'none' });
  },
  refreshSlots: () => set({ slotMetas: listSlots() }),
  saveToSlot: (key) => {
    const eng = _engine;
    if (!eng || key === 'legacy' || key === 'auto') return false; // 旧槽与自动槽不允许手动覆盖
    try {
      const data = eng.serialize('manual');
      const json = JSON.stringify(data);
      // 写前预检：序列化产物必须能回环解析且结构健康（防引擎异常态产出坏档覆盖好档）
      const pre = JSON.parse(json) as SaveData;
      const preErr = validateSaveData(pre);
      if (preErr) throw new Error(`序列化产物异常：${preErr}（已阻止覆盖旧档）`);
      const r = safePersist(SLOT_DATA_KEY[key], json);
      if (!r.ok) throw new Error(r.error);
      const metas = readMetas();
      metas[key] = metaFromData(key, data, 'manual');
      writeMetas(metas);
      set({ slotMetas: listSlots() });
      quickToast(`已保存到槽位 ${parseInt(key.slice(4), 10) + 1}（旧档已自动备份）`, 'good');
      return true;
    } catch (err) {
      console.error('[WB-SAVE]', err);
      quickToast(err instanceof Error ? `保存失败：${err.message}` : '保存失败：浏览器存储不可用', 'danger');
      return false;
    }
  },
  loadFromSlot: (key) => {
    const eng = _engine;
    if (!eng) return false;
    const r = safeLoadSlot(SLOT_DATA_KEY[key]);
    if (!r.ok || !r.data) {
      quickToast(r.error === '这个槽位是空的' ? '这个槽位是空的' : `读取失败：${r.error}`, 'danger');
      if (r.error && r.error !== '这个槽位是空的') set({ slotMetas: listSlots() });
      return false;
    }
    try {
      eng.applySave(r.data);
      getCouncil().reset();
      set({ selUnit: null, selCiv: null, follow: false, events: eng.worldEvents, saveDialog: 'none', councilFeed: [], councilPending: [] });
      get().syncLaws({ ...eng.laws });
      if (r.recovered) quickToast(`已从备份恢复 ${key === 'auto' ? '自动存档' : key === 'legacy' ? '旧版存档' : `槽位 ${parseInt(key.slice(4), 10) + 1}`}（主档损坏，上一份完好存档已救回，${Math.floor(eng.yearF)} 年）`, 'good');
      else quickToast(`已读取 ${key === 'auto' ? '自动存档' : key === 'legacy' ? '旧版存档' : `槽位 ${parseInt(key.slice(4), 10) + 1}`}（${Math.floor(eng.yearF)} 年的世界）`, 'good');
      return true;
    } catch (err) {
      console.error('[WB-LOAD]', err);
      quickToast(`读取失败：${err instanceof Error ? err.message : '存档数据已损坏'}`, 'danger');
      return false;
    }
  },
  deleteSaveSlot: (key) => {
    safeRemoveSlot(SLOT_DATA_KEY[key]); // 连同 __bak 备份一起清理
    const metas = readMetas();
    delete metas[key];
    writeMetas(metas);
    set({ slotMetas: listSlots() });
    sfx.click();
    quickToast('槽位已清空', 'info');
  },
  exportSave: () => {
    const eng = _engine;
    if (!eng) return false;
    try {
      const data = eng.serialize('manual');
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date();
      const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}`;
      a.href = url;
      a.download = `pixel-worldbox-${Math.floor(eng.yearF)}year-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      quickToast('存档已导出为 JSON 文件', 'good');
      return true;
    } catch (err) {
      console.error('[WB-EXPORT]', err);
      quickToast('导出失败：无法生成文件', 'danger');
      return false;
    }
  },
  importSave: async (file) => {
    const eng = _engine;
    if (!eng) return false;
    let text: string;
    try {
      text = await file.text();
    } catch {
      quickToast('导入失败：无法读取文件', 'danger');
      return false;
    }
    let data: SaveData;
    try {
      data = JSON.parse(text) as SaveData;
    } catch {
      quickToast('导入失败：不是有效的 JSON 存档文件', 'danger');
      return false;
    }
    try {
      if ((data.v !== 1 && data.v !== 2) || !Array.isArray(data.units) || !Array.isArray(data.civs) || !Array.isArray(data.buildings)) {
        throw new Error('不是有效的 Pixel World Box 存档文件');
      }
      eng.applySave(data);
      getCouncil().reset();
      set({ selUnit: null, selCiv: null, follow: false, events: eng.worldEvents, saveDialog: 'none', councilFeed: [], councilPending: [] });
      get().syncLaws({ ...eng.laws });
      quickToast(`已导入存档（${Math.floor(eng.yearF)} 年的世界），记得保存到槽位`, 'good');
      return true;
    } catch (err) {
      console.error('[WB-IMPORT]', err);
      quickToast(err instanceof Error ? `导入失败：${err.message}` : '导入失败：文件格式不正确', 'danger');
      return false;
    }
  },
  saveGame: (source = 'auto' as const) => {
    const eng = _engine;
    if (!eng) return false;
    const data = eng.serialize(source);
    if (source === 'auto') {
      // 【性能修复 v74】自动档异步分片落盘：2400 单位世界实测 serialize ≈17ms + stringify ≈60ms
      // + 回读校验 ≈4ms + localStorage 写入 ≈ 100ms 主线程冻结（每 60s 掉 5-6 帧 —— 周期性可感卡顿）。
      // serialize 产物为纯拷贝（与引擎解耦）→ 把 stringify 切成 ≤5ms 的空闲片在 requestIdleCallback
      // 中组装（后台标签页退化为 setTimeout 兜底；15s 超时直通收尾），写库与元数据亦在收尾片完成。
      // 前台同步成本从 ~100ms 降到 serialize 的 ~17ms（单帧级）；读档侧 validateSaveData 照常把关。
      queueAutoSave(data);
      return true;
    }
    try {
      const json = JSON.stringify(data);
      // 自动存档守门：序列化异常态绝不覆盖上一份自动档（防止坏世界循环覆写好档）
      const preErr = validateSaveData(JSON.parse(json) as SaveData);
      if (preErr) throw new Error(`序列化产物异常：${preErr}`);
      const r = safePersist(SLOT_DATA_KEY.auto, json); // 安全层：上一份自动档滚动备份到 __bak
      if (!r.ok) throw new Error(r.error);
      const metas = readMetas();
      metas.auto = metaFromData('auto', data, 'auto');
      writeMetas(metas);
      if (source !== 'auto') quickToast('世界已保存', 'good');
      return true;
    } catch (err) {
      // 存档写入失败（超配额/隐私模式）需要明确告知用户
      console.error('[WB-SAVE]', err);
      if (source !== 'auto') quickToast(err instanceof Error ? `保存失败：${err.message}` : '保存失败：浏览器存储不可用', 'danger');
      return false;
    }
  },

  // ---------------- 事件触发器（像素级精细化事件控制） ----------------
  toggleTriggers: () => {
    sfx.ui(get().showTriggers ? 'close' : 'open');
    set((s) => ({ showTriggers: !s.showTriggers }));
  },
  addTrigger: (t) => {
    const eng = _engine;
    if (!eng) return;
    // 触发器上限 32：大量 every + 大火力动作在 8x 下会堆叠特效，超限拒绝并提示
    if (eng.triggers.length >= 32) {
      quickToast('触发器已达上限（32 个）— 删除一些再试', 'danger');
      return;
    }
    eng.addTrigger(t);
    set({ triggers: eng.triggers.map((x) => ({ ...x })) });
    quickToast(`触发器「${t.name}」已创建`, 'good');
  },
  removeTrigger: (id) => {
    const eng = _engine;
    if (!eng) return;
    eng.removeTrigger(id);
    sfx.click();
    set({ triggers: eng.triggers.map((x) => ({ ...x })) });
  },
  updateTrigger: (id, patch) => {
    const eng = _engine;
    if (!eng) return;
    eng.updateTrigger(id, patch);
    set({ triggers: eng.triggers.map((x) => ({ ...x })) });
  },
  manualTrigger: (id) => {
    const eng = _engine;
    if (!eng) return;
    const t = eng.triggers.find((x) => x.id === id);
    if (!t) return;
    eng.manualTrigger(id);
    set({ triggers: eng.triggers.map((x) => ({ ...x })) });
  },
  syncTriggers: () => {
    const eng = _engine;
    if (!eng) return;
    set({ triggers: eng.triggers.map((x) => ({ ...x })) });
  },
  startPick: (onPick) => {
    const eng = _engine;
    if (eng) eng.pickMode = true;
    sfx.click();
    set({ picking: { onPick } });
  },
  cancelPick: () => {
    const eng = _engine;
    if (eng) eng.pickMode = false;
    set({ picking: null });
  },
  pickDone: (x, y) => {
    const eng = _engine;
    if (eng) eng.pickMode = false;
    const p = get().picking;
    set({ picking: null });
    p?.onPick(x, y);
  },

  // ---------------- 开发者模式 ----------------
  toggleDevMode: () => {
    sfx.click();
    const eng = _engine;
    const next = !get().devMode;
    if (eng) eng.devMode = next;
    // 开启即自动展开面板；关闭时收起
    set({ devMode: next, showDev: next });
  },
  toggleDevPanel: () => {
    sfx.click();
    if (!get().devMode) return;
    set((s) => dockExclusive('showDev', s));
  },
  setItemCat: (c) => {
    set({ itemCat: c });
  },

  // ---------------- 42-c 门面体验：标题屏 boot 流程 ----------------
  enterWorld: () => {
    // 首个用户手势：顺带初始化 AudioContext（此后引擎/世界音效才可能出声）
    sfx.ensureInit();
    sfx.click();
    // 环境音乐随世界入场起调（musicOn=false / music 音量为 0 时 sfx 内部自会静音）
    if (get().musicOn) sfx.startMusic();
    set({ boot: 'game' });
  },
  showTitle: () => {
    sfx.click();
    // 回标题时收起所有面板/对话框，保证主菜单是纯净体验
    set({
      boot: 'title',
      showChronicle: false, showKingdoms: false, showEco: false, showTriggers: false, showDev: false,
      showAch: false, showOracle: false, showNature: false, showNeuro: false, showEvo: false,
      showRace: false, showSocietal: false, civPanelCiv: null, mobilePanel: 'none', saveDialog: 'none',
      showHelp: false, viewMode: false,
      divineOpen: false, gaze: null, unitBubble: null, godView: false, pulse: null,
    });
  },
  forgeWorld: (templateId, seed) => {
    const eng = _engine;
    const tpl = TEMPLATE_BY_ID[templateId];
    if (eng) {
      eng.regenerate(seed ?? Math.floor(Math.random() * 1e9), tpl?.params);
      eng.selectedId = null;
      eng.followId = null;
      set({ events: eng.worldEvents, selUnit: null, selCiv: null, follow: false, oracleMsgs: [], oracleBusy: false });
    }
    // 新铸造的世界 = 新的旅程：直接进入游戏
    get().enterWorld();
  },
  finishOnboarding: () => {
    try {
      localStorage.setItem(ONBOARD_KEY, '1');
    } catch {
      /* 隐私模式忽略 */
    }
    set({ onboardingDone: true });
  },
  restartOnboarding: () => {
    // 仅重置内存标记（不抹掉持久化：本次看完 finishOnboarding 会重新写 '1'）
    set({ onboardingDone: false });
  },

  // ---------------- 42-e 设置中心：性能 HUD / 环境音乐 ----------------
  togglePerfHud: () => {
    const next = !get().perfHud;
    sfx.ui('toggle');
    try {
      localStorage.setItem(PERFHUD_KEY, next ? '1' : '0');
    } catch {
      /* 隐私模式忽略 */
    }
    set({ perfHud: next });
  },
  toggleMusic: () => {
    const next = !get().musicOn;
    if (next) {
      sfx.ensureInit(); // 从设置面板开启也是用户手势，顺手激活 AudioContext
      sfx.startMusic();
    } else {
      sfx.stopMusic();
    }
    try {
      localStorage.setItem(MUSIC_KEY, next ? '1' : '0');
    } catch {
      /* 隐私模式忽略 */
    }
    set({ musicOn: next });
  },
}));

// 每秒同步一次触发器镜像（once 触发器自动移除后 UI 及时刷新；开销极小）
if (typeof window !== 'undefined') {
  window.setInterval(() => {
    const st = useGameStore.getState();
    if (st.showTriggers || st.triggers.length > 0) {
      const eng = _engine;
      if (eng && (eng.triggers.length !== st.triggers.length || eng.triggers.some((t, i) => t.fired !== st.triggers[i]?.fired))) {
        st.syncTriggers();
      }
    }
  }, 1000);
}

// QA 调试钩子：浏览器控制台 / agent-browser 通过 window.__wb 直接访问引擎与 store
// （仅客户端；供自动化测试与玩家排障，不影响游戏逻辑）
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__wb = {
    getEngine,
    store: useGameStore,
    // Rust WASM 空间内核状态（Task 45-a QA：ready/active/扫描统计实证）
    get wasm() {
      // 延迟 require 避免循环依赖：engine.ts 已引 wbspatial，此处仅读状态
      const wb = (window as unknown as Record<string, unknown>).__wbWasmCore as
        | { ready: boolean; failed: boolean; enabled: boolean; active(): boolean; stats: Record<string, number> }
        | undefined;
      return wb ? { ready: wb.ready, failed: wb.failed, enabled: wb.enabled, active: wb.active(), stats: { ...wb.stats } } : null;
    },
    // Rust WASM 批内核状态（Stage 2 QA：batch/replay/pack2 统计实证）
    get wbb() {
      const wbb = (window as unknown as Record<string, unknown>).__wbBatchCore as
        | { ready: boolean; failed: boolean; batchReady: boolean; active(): boolean; stats: Record<string, number> }
        | undefined;
      return wbb ? { ready: wbb.ready, failed: wbb.failed, batchReady: wbb.batchReady, active: wbb.active(), stats: { ...wbb.stats } } : null;
    },
  };
}
