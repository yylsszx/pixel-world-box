// ============ WorldBox Replica — Simulation Engine ============
import type { Army, ArmyState, Building, CasusKind, Civ, Cyclone, Directive, DirectiveKind, Effect, EmergentWeapon, FxPrefs, Gene, GroundItem, ItemDef, ItemKind, BloodDecal, CorpseDecal, OverlayMode, RaceDef, RaceId, SaveData, SaveDataV1, SaveDataV2, SoundKind, SpeciesEco, StatsSnapshot, ToastMsg, TriggerCond, TriggerDef, TriggerRow, Unit, WarInfo, WeaponDefense, WeaponDoctrine, WorldEvent, WorldEventKind, WorldLaws, WorldWarState, Alliance, Family } from './types';
import { T, R, RACES, TRAITS, CIV_RACES, DEFAULT_LAWS, ITEM_DEFS, describeCond, JOBS, JOB_KEY, BUILDING_DEFS, BUILD_KINDS, CAPTURABLE, SLOT_FIELD, SLOT_ORDER, RARITY_META, BEST_BY_SLOT, CASUS_META, RACE_REL_BASE, ALLIANCE_COLORS } from './types';
import { EVO_KIND_META, applyEmTechMods, describeVis, inventIdea, inventTech, inventTrait, invalidateVisCache, mutateVis, tupleToVis, visFromGene, visToTuple } from './emergence';
import type { EmModKey, EmTech, EvoKind, EvoNode, IdeaDef, VisGenome } from './emergence';
import {
  W, H, TICK_MS, YEAR_TICKS, MAX_UNITS, MAX_DRAGONS, MAX_DEMONS, MAX_ITEMS, HOUSE_CAP, MAX_WILDLIFE, MAX_WILDLIFE_AQUATIC, MAX_TROLLS, MAX_OGRES, MAX_WHITEWALKERS, MAX_VAMPIRES, MAX_KRAKENS, MAX_SANDWORMS, MAX_BASILISKS, MAX_HYDRAS,
  CIV_COLORS, FLAMMABLE, isWater, isLand, walkable, buildable,
  TERRAIN_RGB, TOOL_BY_ID, RACE_TOOL, ITEM_TOOL, CHEST_TIERS, rollChestItem,
  WATER_TIER_RGB, DEEP_TIER_RGB, SOFT_TERRAIN,
} from './constants';
import { generateWorld, type WorldGenParams } from './worldgen';
import { mulberry32, hash2 } from './noise';
import { civName, unitName, roman, armyNameByJobs, battleFieldName } from './names';
import { TECHS, TECH_BY_KEY, GOV_DEFS, modsOfTechs, NEUTRAL_MODS, TECH_CATS } from './tech';
import type { TechMods } from './tech';
import { ACHIEVEMENTS, checkAchievements } from './achievements';
import { NatureSystem, STORM_NAME_AT, AW, AH, CELL } from './nature';
import { WorldSim } from './worldsim';
import { AgentLawSystem, normalizeLaw } from './agentLaws';
import { ep } from './engineParams';
import { neuroAcc, neuroStance, neuroFlight, F_ACC, F_STANCE, F_FLIGHT, setNeuroEnabled, setFlightMode, neuroSnapshot, flightLastLogp } from './neuro';
import {
  collectDecision, collectKill, collectUnitDead, collectFleeEnd, collectEnemyGone,
} from './online/collector';
import { WB, WBB, WP_WAR, WP_CIV, WP_FAM, WP_ITEM, WP_SCAL, WP_HOT, WP_META } from '../wasm/wbspatial';
import { getCreation, parseCreationTool, addCreation, patchCreation, type SpeciesCreation } from './creations';
import {
  onlineSnapshot, setOnline, setIntensity, setFrozen, rollback as onlineRollback, resetToOffline,
  restore as onlineRestore, setEvalSeed, qaInjectEpisodes, type Intensity, type OnlineSnapshot,
} from './online/online-store';
import * as sprites from './sprites';

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const idx = (x: number, y: number) => y * W + x;
const R2 = R.DRAGON;
const RD = R.DEMON;

/** TriggerDef → TriggerRow 紧凑存档行 */
function triggerToRow(t: TriggerDef): TriggerRow {
  return [t.id, t.name, JSON.stringify(t.cond), t.action, t.brush, t.x, t.y, t.r, t.enabled ? 1 : 0, t.once ? 1 : 0, t.fired, t.cd, t.nextFireYear];
}
/** TriggerRow → TriggerDef（字段校验，损坏行抛错） */
function rowToTrigger(row: unknown): TriggerDef {
  if (!Array.isArray(row) || row.length !== 13) throw new Error('存档触发器行损坏');
  const [id, name, condJson, action, brush, x, y, r, enabled, once, fired, cd, nextFireYear] = row as TriggerRow;
  let cond: TriggerCond;
  try {
    cond = JSON.parse(condJson) as TriggerCond;
  } catch {
    throw new Error('存档触发器条件损坏');
  }
  if (!cond || typeof cond.kind !== 'string') throw new Error('存档触发器条件损坏');
  if (!TOOL_BY_ID[action]) throw new Error(`存档触发器动作无效: ${action}`);
  return {
    id, name: String(name), cond, action, brush, x, y, r,
    enabled: !!enabled, once: !!once, fired: fired | 0, cd: cd | 0,
    nextFireYear: Number.isFinite(nextFireYear) ? nextFireYear : 0,
  };
}

/** 河道八方向编码（1-8）：索引 = dirCode - 1 */
const RIVER_DIRS: [number, number][] = [
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],
];
function encodeRiverDir(dx: number, dy: number): number {
  for (let k = 0; k < 8; k++) {
    if (RIVER_DIRS[k][0] === Math.sign(dx) && RIVER_DIRS[k][1] === Math.sign(dy)) return k + 1;
  }
  return 0;
}

// ---------- base64 编解码（分块避免 String.fromCharCode 参数上限） ----------
function bytesToB64(bytes: Uint8Array<ArrayBuffer>): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}
function b64ToBytes(b64: string, expect: number): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  if (expect > 0 && s.length !== expect) throw new Error(`存档字节数不匹配: 期望 ${expect}, 实际 ${s.length}`);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---------- RLE 游程编码（v2 存档）：地形类数组大面积同值 → (值,次数) 对交替 ----------
/** Uint8Array → RLE 对（Uint16Array）→ base64。值 0-255、次数 1-65535 全覆盖 */
function rleEncode(arr: Uint8Array): string {
  const pairs: number[] = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let run = 1;
    while (i + run < arr.length && arr[i + run] === v && run < 65535) run++;
    pairs.push(v, run);
    i += run;
  }
  const u16 = new Uint16Array(pairs);
  return bytesToB64(new Uint8Array(u16.buffer, u16.byteOffset, u16.byteLength));
}
/** RLE base64 → Uint8Array；expect 为解压后应有长度（校验总游程） */
function rleDecode(b64: string, expect: number): Uint8Array<ArrayBuffer> {
  const raw = b64ToBytes(b64, 0); // 0 = 长度未知（校验推迟到游程累计）
  const aligned = new Uint16Array(Math.floor(raw.length / 2));
  for (let k = 0; k < aligned.length; k++) aligned[k] = raw[k * 2] | (raw[k * 2 + 1] << 8);
  const out = new Uint8Array(expect);
  let pos = 0;
  for (let p = 0; p < aligned.length; p += 2) {
    const v = aligned[p];
    const run = aligned[p + 1];
    if (run === 0) throw new Error('存档 RLE 数据损坏（零游程）');
    if (v > 255) throw new Error('存档 RLE 数据损坏（值越界）');
    if (pos + run > expect) throw new Error('存档 RLE 数据损坏（游程超长）');
    out.fill(v, pos, pos + run);
    pos += run;
  }
  if (pos !== expect) throw new Error(`存档 RLE 长度不匹配: 期望 ${expect}, 实际 ${pos}`);
  return out;
}

// ---------- v2 列式单位序列化：[header 键名数组, ...行数组]（键名只存一次） ----------
  const UNIT_FIELDS = ['id', 'race', 'civ', 'x', 'y', 'tx', 'ty', 'hp', 'maxHp', 'dmg', 'speed', 'age', 'maxAge', 'kills', 'cd', 'trait', 'job', 'king', 'infected', 'flip', 'name', 'hurt', 'breath', 'parity', 'dead', 'boat', 'boatTTL', 'caravan', 'wep', 'arm', 'hlm', 'shd', 'bts', 'rng', 'amu', 'army', 'gene', 'food', 'fam', 'fgn', 'gIds', 'gVal'] as const;

function unitsToRows(units: Unit[]): unknown[][] {
  const rows: unknown[][] = [[...UNIT_FIELDS]];
  for (const u of units) {
    const row: unknown[] = [];
    for (const f of UNIT_FIELDS) {
      const v = (u as unknown as Record<string, unknown>)[f];
      row.push(v === undefined ? null : v);
    }
    rows.push(row);
  }
  return rows;
}
function rowsToUnits(rows: unknown[][]): Unit[] {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) throw new Error('存档单位数据损坏');
  const header = rows[0].map(String);
  const out: Unit[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length !== header.length) throw new Error('存档单位行损坏');
    const u = {} as Record<string, unknown>;
    for (let c = 0; c < header.length; c++) {
      const v = row[c];
      u[header[c]] = v === null ? undefined : v; // null = 字段缺省（boat 等可选字段）
    }
    out.push(u as unknown as Unit);
  }
  return out;
}

export class GameEngine {
  seed = 1;
  terrain: Uint8Array<ArrayBuffer> = new Uint8Array(W * H);
  variant: Uint8Array<ArrayBuffer> = new Uint8Array(W * H);
  owner: Int16Array<ArrayBuffer> = new Int16Array(W * H).fill(-1);
  building: Uint8Array<ArrayBuffer> = new Uint8Array(W * H);
  fire: Uint8Array<ArrayBuffer> = new Uint8Array(W * H);
  radiate: Uint8Array<ArrayBuffer> = new Uint8Array(W * H);

  fireSet = new Set<number>();
  regrow = new Map<number, number>();
  radSet = new Map<number, number>();

  units: Unit[] = [];
  unitById = new Map<number, Unit>();
  civs: Civ[] = [];
  buildings: Building[] = [];
  bIdx = new Map<number, number>();
  effects: Effect[] = [];
  rel = new Map<string, number>();
  met = new Set<string>();

  unitSeq = 1;
  civSeq = 0;
  toastSeq = 1;
  tickCount = 0;
  yearF = 0;
  speed = 1;
  shake = 0;
  frameCount = 0;
  acc = 0;
  /** 渲染插值进度 0..1（acc/TICK_MS；frame() 每帧更新，渲染层与镜头跟随使用） */
  tickAlpha = 1;
  followId: number | null = null;
  victoryCiv: number | null = null;
  multiCivSeen = false;

  /** 世界纪事事件流（最新的在最前） */
  worldEvents: WorldEvent[] = [];
  eventSeq = 1;
  /** 活跃战斗位置: tileIdx → 过期 tick（用于战争前线红闪） */
  activeBattles = new Map<number, number>();
  /** 偠尸爆发是否已播报（达到阈值后置 true，清零后重置） */
  zombieOutbreakNoted = false;

  // ---------------- 生物进化与生态竞争系统 ----------------
  /** 物种进化棘轮基线：race → { 基因基线, 世代数, 亚种命名 }（种群均值漂移超阈值时棘轮推进） */
  speciesBase = new Map<number, { gene: Gene; gen: number; sub?: string; beh?: string[] }>();
  /** 上一次生态采样的种群规模（趋势计算用） */
  lastEcoPop = new Map<number, number>();
  /** 种群历史采样（race → 近 120 个采样点，每 300 tick≈1 年一次；灭绝归零，用于生态面板曲线） */
  speciesHist = new Map<number, number[]>();

  // ---------------- 涌现社会内核（Task 39：恐慌传染场 × 血仇网络 × 家族谱系） ----------------
  /** 家族注册表：id → 家族（血脉谱系；LRU 上限 240 —— 名门史官只记两百家） */
  families = new Map<number, Family>();
  familySeq = 1;
  /** 历史最大雪崩规模（同刻 panic>0.6 的单位数峰值） */
  panicPeak = 0;
  /** 兽群雪崩事件计数 */
  panicEvents = 0;
  /** 雪崩播报冷却（tick） */
  panicNoteCd = 0;

  // ---------------- 成就系统（跨世界元进度，gameStore 持久化） ----------------
  /** 已解锁成就：id → 解锁年份（不随 generate 重置 — 跨世界元进度，由 gameStore 注入/回收） */
  achUnlocked = new Map<string, number>();
  /** 未解锁成就的进度缓存（每 600 tick 重评，面板进度条展示） */
  achProgressCache: Record<string, number> = {};
  /** 本世界统计计数器（成就条件用：战争数/灭国数/屠龙/核弹/黑洞/陨石雨） */
  statWars = 0;
  statCivsFallen = 0;
  statDragonsSlain = 0;
  statNukes = 0;
  statBlackholes = 0;
  statMeteorShowers = 0;

  // ---------------- 终极世界大战（Ultimate World War · 开发者模式引燃） ----------------
  /** 大战状态（idle 未打响 / running 战火燃烧 / ended 已终战；随存档持久化） */
  worldWar: WorldWarState = GameEngine.IDLE_WORLD_WAR();
  /** 停战协议表：pairKey → 休战截止 tick（期间不重启战端；到期自动重燃） */
  wwTruce = new Map<string, number>();
  /** 核弹发射全局冷却 tick（两次核打击至少间隔 15 年，防核弹洗地） */
  wwLastNukeTick = -600;
  /** 反物质打击全局冷却 tick（两次湮灭至少间隔 30 年） */
  wwLastAntiTick = -1200;
  /** 终局狂热播报去重（记大战 startTick：每轮大战只播报一次） */
  wwFrenzyAnnounced = -1;
  /** 生态状态：overgrass 植被富余 / balanced 平衡 / overgraze 过牧 / collapse 崩溃（播报去重） */
  ecoState: 'overgrass' | 'balanced' | 'overgraze' | 'collapse' = 'balanced';
  /** 生态状态上次播报年份 */
  ecoLastNoteYear = -999;
  /** 上次生态迁徙入境年份（自愈机制的节流：间隔 ≥ 25 年） */
  ecoRepopYear = -999;
  /** 粗粒度猎物密度场（32×20 格，每格 8×8 tile）：ecoTick 每 3 年重算 —— 饥饿捕食者的宏观导航 */
  preyGrid = new Uint16Array(32 * 20);
  /** 植被格数缓存（ecoTick 每 120 tick 重算；承载力求解用） */
  grassTiles = 1;

  /** 河道流向场：0 = 非河，1-8 = 八方向（carveRiver 时记录，驱动水流动画） */
  riverDir = new Uint8Array(W * H);
  /** 河道 tile 索引集合（与 riverDir 同步，渲染时快速迭代） */
  riverTiles = new Set<number>();

  // ---------------- 深度打磨：水深/道路/贸易 ----------------
  /** 水深分级场：WATER → 0 浅礁/1 近岸/2 开阔；DEEP → 3 陆架/4 深渊（渲染取色分层） */
  waterTier = new Uint8Array(W * H);
  /** 道路网络：>0 = 土路（建筑落成时 BFS 连向首都/路网；行军加速 + 商队循路） */
  road = new Uint8Array(W * H);
  /** 每文明首个市场 tile（贸易商队的目的地锚点；rebuildCivBuildCounts 每 5 tick 维护） */
  marketIdx = new Map<number, number>();
  /** 每文明下一次可派商队的 tick */
  tradeNext = new Map<number, number>();
  /** 画面效果开关（UI store 同步，render 读取；伤害数字关闭时引擎也不再生成特效） */
  fxPrefs: FxPrefs = { dmgNumbers: true, battleFlash: true, riverFlow: true, ambience: true, fxDensity: 1, blood: true, corpses: true, hpBars: true, dayNight: true };

  // ---------------- Task 48-A2：氛围粒子稀疏候选表 ----------------
  // drawAmbience 原为全可见窗逐格扫描（zoom 2 全图时 4 万格/帧）—— 现按地形类别维护
  // 稀疏候选集合，绘制端只遍历候选（setTerrain 增量维护，生成/读档全量重建）
  /** 飘雪候选（SNOW 格） */
  ambSnow = new Set<number>();
  /** 扬尘候选（SAND 格） */
  ambSand = new Set<number>();
  /** 岩浆气泡候选（LAVA 格） */
  ambLava = new Set<number>();
  /** 冰晶闪熠候选（ICE 格） */
  ambIce = new Set<number>();
  /** 冬季雪人瞬态场（Task 104）：村民雪地堆起的装饰 —— 不入档（装饰性瞬态，读档清零），出冬渐融 */
  snowman = new Uint8Array(W * H);
  /** 当前雪人数（增量维护，免 O(n) 重数） */
  snowmanN = 0;
  /** 贴岸浅水候选（WATER 且邻陆地格 —— 浪花/浅水波光） */
  ambShore = new Set<number>();

  /** 全量重建氛围候选表（generate/applySave 收口处调用） */
  rebuildAmbLists() {
    this.ambSnow.clear();
    this.ambSand.clear();
    this.ambLava.clear();
    this.ambIce.clear();
    this.ambShore.clear();
    for (let i = 0; i < W * H; i++) this.ambClassify(i);
  }

  /** 单格候选归属判定（含贴岸判定；幂等 —— 先删后加） */
  private ambClassify(i: number) {
    const t = this.terrain[i];
    this.ambSnow.delete(i);
    this.ambSand.delete(i);
    this.ambLava.delete(i);
    this.ambIce.delete(i);
    this.ambShore.delete(i);
    if (t === T.SNOW) this.ambSnow.add(i);
    else if (t === T.SAND) this.ambSand.add(i);
    else if (t === T.LAVA) this.ambLava.add(i);
    else if (t === T.ICE) this.ambIce.add(i);
    else if (t === T.WATER) {
      // 贴岸：4 邻存在陆地（>= SAND 且非 LAVA，与绘制端浪花判定同语义）
      const x = i % W;
      const y = (i / W) | 0;
      const land = (j: number) => this.terrain[j] >= T.SAND && this.terrain[j] !== T.LAVA;
      if ((x > 0 && land(i - 1)) || (x < W - 1 && land(i + 1)) || (y > 0 && land(i - W)) || (y < H - 1 && land(i + W))) {
        this.ambShore.add(i);
      }
    }
  }

  /** 地形变更时增量维护候选表（本格 + 4 邻：邻格的贴岸状态可能翻转） */
  private ambTouch(i: number) {
    this.ambClassify(i);
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) this.ambClassify(i - 1);
    if (x < W - 1) this.ambClassify(i + 1);
    if (y > 0) this.ambClassify(i - W);
    if (y < H - 1) this.ambClassify(i + W);
  }

  // ---------------- Task 48-B1/B2：render-only 瞬态视觉状态（不入档、不触模拟 RNG） ----------------
  /** 脚印：{x,y 世界坐标; f 朝向; age 毫秒; t 落脚地形}（雪/沙/湿地面渐消足迹） */
  footprints: { x: number; y: number; f: number; age: number; t: number }[] = [];
  /** 脚印容量上限（环形覆盖：超出即丢弃最旧） */
  static readonly FP_CAP = 420;
  /** 脚印寿命（毫秒） */
  static readonly FP_TTL = 26000;
  /** 脚印采样（tick 内调用，每 2 tick 一次；确定性条件零 RNG —— 不影响位等校验） */
  private fpTick() {
    const wet = this.wet;
    const fps = this.footprints;
    let push = 0;
    for (let k = 0; k < this.units.length; k++) {
      const u = this.units[k];
      if (u.dead || u.boat) continue;
      const def = RACES[u.race];
      if (def.aquatic || def.flying) continue;
      const dx = u.x - (u.lx ?? u.x);
      const dy = u.y - (u.ly ?? u.y);
      if (dx * dx + dy * dy < 0.018) continue; // 本 tick 没有实际位移
      const i = (u.y | 0) * W + (u.x | 0);
      const t = this.terrain[i];
      const isWet = wet.has(i);
      if (t !== T.SNOW && t !== T.SAND && t !== T.ICE && !isWet) continue;
      fps.push({ x: u.x, y: u.y, f: u.flip ? 1 : 0, age: 0, t: t === T.ICE ? T.ICE : isWet && t !== T.SNOW && t !== T.SAND ? -1 : t });
      push++;
    }
    if (push > 0 && fps.length > GameEngine.FP_CAP) fps.splice(0, fps.length - GameEngine.FP_CAP);
  }

  /** 闪电：{x,y 落点; segs 折线坐标对; age 毫秒; ttl}（强风暴上空随机落下 —— Math.random 纯视觉） */
  bolts: { x: number; y: number; segs: number[]; age: number; ttl: number }[] = [];
  /** 鸟群：{x,y 前导鸟位置; vx,vy tiles/s; n 只数; age 秒; ph 相位} */
  flocks: { x: number; y: number; vx: number; vy: number; n: number; age: number; ph: number }[] = [];
  /** 下一群鸟的倒计时（秒） */
  flockTimer = 14;
  /** 渲染视口尺寸（render 每帧回写：闪电屏闪/鸟群生成的可见性判定用） */
  viewW = 1280;
  viewH = 720;

  /** 生成一道闪电（锯齿主干 + 1-2 分叉；从云底 y-9 落到地面） */
  private spawnBolt(cx: number, cy: number) {
    const tx = cx + (Math.random() - 0.5) * 14;
    const ty = Math.max(1, Math.min(H - 1, cy + (Math.random() - 0.5) * 12));
    const segs: number[] = [];
    let px = tx + (Math.random() - 0.5) * 5;
    let py = ty - 9 - Math.random() * 3;
    const steps = 5 + ((Math.random() * 3) | 0);
    const branchAt = 1 + ((Math.random() * (steps - 2)) | 0);
    for (let s = 0; s <= steps; s++) {
      const ny = py + (ty - py) * (s / steps);
      const nx = s === steps ? tx : px + (tx - px) * (s / steps) + (Math.random() - 0.5) * 2.4;
      segs.push(nx, ny);
      if (s === branchAt) {
        // 分叉：从当前点斜出短线
        segs.push(nx, ny, nx + (Math.random() - 0.5) * 4, ny + 2 + Math.random() * 2);
      }
      px = nx;
      py = ny;
    }
    this.bolts.push({ x: tx, y: ty, segs, age: 0, ttl: 420 });
    if (this.bolts.length > 6) this.bolts.shift();
    // 雷声：走引擎统一 onSound 通道（GameCanvas 接 sfx；静音/音量由音频层自理）
    this.onSound?.('thunder');
  }

  /** 生成一群迁徙鸟（从视野边缘外切入，横越世界）
   *  候鸟季节节律（Task 102）：春秋迁徙季大群频现（雁南飞/雁北归），夏常态小群，冬雁去雪稀 */
  private spawnFlock() {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.max(this.viewW, this.viewH) / (this.cam.zoom * 2) + 14;
    const x = Math.max(-12, Math.min(W + 12, this.cam.x + Math.cos(ang) * r));
    const y = Math.max(-12, Math.min(H + 12, this.cam.y + Math.sin(ang) * r));
    const spd = 5.5 + Math.random() * 3.5;
    // 朝向镜头中心附近穿过（不精确瞄准：加随机偏角）
    const aim = Math.atan2(this.cam.y - y, this.cam.x - x) + (Math.random() - 0.5) * 0.9;
    const s = this.nature.season;
    const n = (s === 0 || s === 2) ? 6 + ((Math.random() * 5) | 0) : s === 3 ? 2 + ((Math.random() * 2) | 0) : 3 + ((Math.random() * 4) | 0);
    this.flocks.push({
      x, y,
      vx: Math.cos(aim) * spd,
      vy: Math.sin(aim) * spd,
      n,
      age: 0,
      ph: Math.random() * Math.PI * 2,
    });
    if (this.flocks.length > 3) this.flocks.shift();
  }

  /** 瞬态视觉推进（frame 调用；全部 Math.random / 纯视觉 —— 与模拟 RNG 流零交叉，位等安全） */
  private vizTick(dtMs: number) {
    // —— 脚印老化 + 惰性压实（每 120 帧一次全量过滤，平摊零分配） ——
    let fpDirty = false;
    for (let k = 0; k < this.footprints.length; k++) {
      this.footprints[k].age += dtMs;
      if (this.footprints[k].age > GameEngine.FP_TTL) fpDirty = true;
    }
    if (fpDirty) this.footprints = this.footprints.filter((f) => f.age < GameEngine.FP_TTL);

    // —— 闪电：活跃强风暴（非冰暴）上空随机落下 ——
    if (this.fxPrefs.ambience && this.speed > 0) {
      for (const st of this.nature.storms) {
        if (st.kind === 'blizzard' || st.strength < 0.45) continue;
        // 期望频率 ~ 每 2.2s 一道（强度加权），帧率无关
        if (Math.random() < 0.0075 * st.strength * (dtMs / 16.7)) this.spawnBolt(st.x, st.y);
      }
    }
    for (const b of this.bolts) b.age += dtMs;
    if (this.bolts.length > 0) this.bolts = this.bolts.filter((b) => b.age < b.ttl);

    // —— 鸟群：定时生成（候鸟季节节律：春秋迁徙频密/冬稀少） + 匀速巡航 + 出界回收 ——
    if (this.fxPrefs.ambience && this.speed > 0) {
      this.flockTimer -= dtMs / 1000;
      if (this.flockTimer <= 0) {
        this.spawnFlock();
        const s = this.nature.season;
        this.flockTimer = s === 0 || s === 2 ? 9 + Math.random() * 12 : s === 3 ? 38 + Math.random() * 30 : 16 + Math.random() * 22;
      }
      const ds = dtMs / 1000;
      for (const f of this.flocks) {
        f.x += f.vx * ds;
        f.y += f.vy * ds;
        f.age += ds;
      }
      this.flocks = this.flocks.filter((f) => f.age < 40 && f.x > -16 && f.x < W + 16 && f.y > -16 && f.y < H + 16);
    }
  }

  // ---------------- 深度打磨：野生动物计数（O(1) 预算检查） ----------------
  /** 野生动物分种族计数（增量维护：spawn/reap/变身；替代 O(N) 全表扫描） */
  wildCount = new Map<number, number>();

  // ---------------- 深度打磨：地缘摩擦（战争外交驱动） ----------------
  /** 边境摩擦（pairKey → 强度 0..80：领土接触累积、和平消化衰减，驱动战端重燃） */
  tension = new Map<string, number>();
  /** 每文明上次主动宣战 tick（节奏阀：十年内不重挑新战，防连环开战） */
  lastDeclareAt = new Map<number, number>();

  // ---------------- 动态战线（战时占领层：渐进转权 + 战时虚国界渲染） ----------------
  /** 每格占领方 civId（-1 = 无占领）。战争期间军队在敌境渗透出的"第二国界" */
  occCiv = new Int8Array(W * H).fill(-1);
  /** 每格占领强度 0-100：军事存在持续注入、离开后衰减、敌军反攻加速瓦解；≥100 正式易帜 */
  occStr = new Uint8Array(W * H);
  /** 活跃占领格索引（渲染与衰减遍历的稀疏集合） */
  occSet = new Set<number>();

  /** 摄影模式（UI 设置）：渲染层隐藏编辑器标记与战争暗角，呈现纯净世界画面 */
  cinemaMode = false;

  // ---------------- 原子级 decals（瞬态不入档） ----------------
  /** 血迹残留：受击飞溅/死亡血泊，随时间淡出 */
  blood: BloodDecal[] = [];
  /** 尸骸残留：骸骨堆/蛇怪石像 */
  corpses: CorpseDecal[] = [];
  /** 凤凰灰烬堆：陨落后的涅槃倒数（到点重生；不入档，读档后灰烬自然消失） */
  phoenixAshes: { x: number; y: number; t: number; rebirths: number }[] = [];
  /** 百兽迁徙最近一次迁入的 tick（按种族）：迁徙掷签加权依据 —— 灭绝越久权重越高，
   *  久别的客人先请进门（狐狸不再饿死在 17 选 1 的签筒底）；不入档，读档后从均匀权重重启 */
  reboundLast = new Map<number, number>();
  /** 冰面 tile 索引集合（消融管理：火/岩浆/暖气候） */
  frozen = new Set<number>();
  /** 海啸洪水退潮队列：tileIdx → 退潮 tick（到点后化回沙滩+湿沙标记） */
  flood = new Map<number, number>();
  /** 湿沙标记：tileIdx → 干透 tick（退潮后短暂深色，渲染层叠加） */
  wet = new Map<number, number>();

  /** 世界法则（WorldBox 的 World Laws）：玩家可实时切换，随存档保存 */
  laws: WorldLaws = { ...DEFAULT_LAWS };
  /** 地面物品（待拾取的宝物） */
  items: GroundItem[] = [];
  /** 物品序号（序列化用） */
  itemSeq = 1;

  /** 事件触发器（像素级精细化事件控制）：条件满足时自动执行指定工具动作 */
  triggers: TriggerDef[] = [];
  /** 触发器序号 */
  triggerSeq = 1;
  /** 地图选点模式（渲染十字准星；点击事件由 GameCanvas 拦截后回调 store） */
  pickMode = false;

  // ---------------- 深度文明系统状态 ----------------
  /** 建筑耐久：tileIdx → 剩余 hp（未入存档：读档后回满） */
  bHp = new Map<number, number>();
  /** 灭国战争标记（pairKey 集合：rel < -75 的战争不再轻易停火） */
  totalWars = new Set<string>();
  /** 攻城事件节流（上次 siege/sack 事件的 tick，防刷屏） */
  lastSiegeEventTick = 0;
  /** 各文明建筑分类计数（civsTick 每 5 tick 重建：civId → [kind 计数]） */
  civBuildCounts = new Map<number, number[]>();

  // ---------------- 军团方阵体系 ----------------
  /** 现役军团列表 */
  armies: Army[] = [];
  /** 军团序号 */
  armySeq = 1;
  /** 军团名序号（每文明独立计数，命名用 ·II/·III） */
  armyNameSeq = new Map<number, number>();
  /** 战争详情对象（pairKey → WarInfo） */
  warData = new Map<string, WarInfo>();
  /** 战败耻辱记忆（pairKey → 上次战争败方 id；复仇宣战依据） */
  warShame = new Map<string, number>();
  /** 文明旨意（文明级开发者功能：目标由文明自行达成，可能失败） */
  directives: Directive[] = [];
  /** 旨意序号 */
  dirSeq = 1;
  /** 上一次战争纪事的 pairKey 集合（宣战播报去重） */
  lastWarSet = new Set<string>();
  /** 会战事件节流 */
  lastClashEventTick = 0;
  /** 增援调度纪事节流（战术 AI 行为播报） */
  lastReinforceEventTick = 0;
  /** 齐射播报全局冷却（Task 36：大战多军团时不刷屏） */
  lastVolleyEventTick = 0;

  // ---------------- 联盟系统（阵营实体：集体防御/联军作战/阵营停战/知识扩散/经济互助） ----------------
  /** 现存联盟列表 */
  alliances: Alliance[] = [];
  /** 联盟序号 */
  allianceSeq = 1;
  /** civId → allianceId 快查表（结盟/退盟/灭国时维护；rebuild 由 allianceTick 兜底对账） */
  allianceOf = new Map<number, number>();
  /** 联盟联军协同出击冷却（allianceId → 上次联军出征 tick：防联盟把世界拖入总体战） */
  allianceWarCd = new Map<number, number>();
  /** 动态种族关系（racePairKey "a-b" → 漂移后实际值；缺省 = RACE_REL_BASE 基线）
 *  种族间王国的战争/停战/贸易/联盟都会缓慢改变整个种族对另一个种族的看法 —— 神经网络级种族互连 */
  raceRel = new Map<string, number>();
  /** 每文明种族同质性（civId → 主种族占比 0-1；多族王国稳定度惩罚用）——civsTick 重建 */
  civHomogeneity = new Map<number, number>();
  /** 最近一次大灾位置与时间（大灾不兴刀兵：外交互连 —— 受灾国短期内免遭落井下石） */
  lastCatastrophe = { x: -1, y: -1, tick: -999999 };
  /** 种族灭绝播报去重（raceKey 集合：避免重复播报同一物种消亡） */
  extinctNoted = new Set<string>();
  /** 曾经繁盛过的种族 id 集（人口 ≥25 即入；归零 → 灭绝纪事） */
  raceThrived = new Set<number>();

  // ---------------- 涌现层（Emergence Layer：武器/生物/进化突破预设天花板） ----------------
  /** 涌现武器库（id → weapon；含退役谱系）；锻造/迭代/缴获仿制均入此表 */
  emergentWeapons = new Map<number, EmergentWeapon>();
  /** 涌现武器序号 */
  weapSeq = 1;
  /** 动态物种注册表（id → { parent, bornYear, parent2?, uid?, eco?, cap? }）：种化/融合/神谕创造的全新物种（id ≥ 100）；
   *  uid = 造物图鉴链接；eco = 生态角色锚（全新造物无血统链时的捕食/食草/中立裁决）；cap = 野生种群上限覆盖 */
  dynRaces = new Map<number, { parent: number; bornYear: number; parent2?: number; uid?: string; eco?: 'pred' | 'herb' | 'neutral'; cap?: number }>();
  /** 物种融合冷却表（pairKey → 解禁 tick：同一对物种融合后 60 年内不再融合） */
  hybridCd = new Map<string, number>();
  // ---------------- 造物工坊（神谕创造模式：图鉴放置 / 生物栏全元素原地编辑） ----------------
  /** 图鉴 uid → 本世界动态种族 id（放置面板 cre: 工具的解析缓存；世界重置清空，读档由 creg 重链） */
  creationRaceIds = new Map<string, number>();
  /** 内置种族原地覆写（raceId → JSON patch；仅内置 id <100 入档——动态种编辑走 dyn.races 元组 + 图鉴同步） */
  raceMods = new Map<number, string>();
  /** 内置物品原地覆写（kind → JSON patch；随存档走——「宝物栏全元素可编辑」的持久化） */
  itemMods = new Map<string, string>();
  /** 原始种族定义快照（新世界/读档时把覆写还原成出厂值） */
  private raceOrig = new Map<number, RaceDef>();
  /** 原始物品定义快照 */
  private itemOrig = new Map<string, NonNullable<(typeof ITEM_DEFS)[string]>>();
  // ---------------- 涌现式进化 v3（Infinite Emergent Evolution） ----------------
  /** 涌现特质注册表（key → TraitDef；运行时注入 TRAITS —— 突破预设特质表） */
  dynTraits = new Map<string, typeof TRAITS[string]>();
  /** 涌现特质序号 */
  traitSeq = 1;
  /** 涌现科技注册表（key → EmTech；静态树研究完后无限发明） */
  emTechs = new Map<string, EmTech>();
  /** 涌现科技序号（key = em{seq}，全局唯一） */
  emTechSeq = 1;
  /** 涌现社会理念注册表（key → IdeaDef） */
  emIdeas = new Map<string, IdeaDef>();
  /** 理念序号 */
  ideaSeq = 1;
  /** 进化图谱节点（五系谱系：物种/武器/科技/特质/理念 —— 涌现图谱面板数据源） */
  evoNodes: EvoNode[] = [];
  /** 图谱序号 */
  evoSeq = 1;
  /** 实体 → 图谱节点索引（'sp:7'/'wp:3'/'tc:em5'/'tr:dt2'/'id:id3' → nodeId） */
  evoIndex = new Map<string, number>();
  /** 理念加成缓存（采纳时失效） */
  ideaModCache = new Map<number, { gold: number; stab: number; mil: number; know: number; repro: number; wear: number }>();
  /** 动态物种 id 序列（从 100 起，与预设 R 枚举空间隔离） */
  dynSeq = 100;
  /** 击杀归属武器 id（弹体命中结算瞬间设置，wwCountKill 读取后清空） */
  killCredit: number | null = null;
  /** 军备学说（武器架构 v2）：civId → 四轴向量（实战反馈漂移，驱动锻造选型） */
  doctrines = new Map<number, WeaponDoctrine>();
  /** 防御套件（武器架构 v2）：civId → 点防/装甲/疏散（换打长记性的对抗演化） */
  defenses = new Map<number, WeaponDefense>();

  // ---------------- 自然模拟引擎（板块/地质/四季/大气/风暴） ----------------
  /** 自然系统实例（板块由 seed 确定性重生成；应力/风暴/灰烬随存档走） */
  nature!: NatureSystem;

  // ---------------- 深时涌现引擎（Task 40：连续海拔/侵蚀/土壤/温度/洋流/冰川/海平面） ----------------
  /** 深时底质：全部场由地形+seed 重导出（刻意不入存档，与板块同一哲学——读档零存档成本） */
  worldsim!: WorldSim;

  // ---------------- v40：神谕 Agent 法则系统（机制热加载） + 热参数已下沉 engineParams ----------------
  /** Agent 法则：create_law 工具书写的活机制，每 120 tick 结算 */
  agentLaws!: AgentLawSystem;

  // ---------------- 修复与防灾体系 ----------------
  /** 受损建筑 tile 集合（建筑师维修目标检索） */
  damagedSet = new Set<number>();
  /** 国民累计灭火次数（统计/播报） */
  firesOut = 0;
  /** 国民累计修复建筑次数（统计/播报） */
  repairsDone = 0;
  /** 灭火播报节流 */
  lastFireOutEventTick = -2400;
  /** 修复播报节流 */
  lastRepairEventTick = -2400;

  // ---------------- 科技与社会体系 ----------------
  /** 科技加成缓存（civId → TechMods；科技完成时重建，避免每 tick 重算） */
  techModCache = new Map<number, TechMods>();
  /** 政体加成缓存（civId → 政体 id；社会面板与效果计算共用） */
  govCache = new Map<number, number>();
  /** 政体变革/节日/叛乱播报节流集合 */
  lastGovEventTick = new Map<number, number>();

  /** 开发者模式（性能统计/控制工具） */
  devMode = false;
  /** tick 耗时统计（开发者面板展示，EMA 平滑） */
  tickMs = 0;
  /** _lastTickAt：tick 耗时采样 */
  private _lastTickAt = 0;

  // ---------------- 性能仪表（Task 42-a：纯数据采集，供后续性能 HUD 低频轮询，不走 zustand 不入档） ----------------
  /** 引擎侧指标 EMA：simMs 单次 tick 模拟耗时 / simUps 每秒模拟 tick 数；drawMs/fps 由渲染帧循环回写 */
  perf = { simMs: 0, simUps: 0, drawMs: 0, fps: 0 };
  /** simUps 采样窗口：窗口内 tick 计数与窗口起始时刻（每 500ms 结算一次，热路径仅一次加法与比较） */
  private _perfWinT = 0;
  private _perfWinN = 0;

  /** fireTick 熄灭列表复用（热路径零分配：燃烧中的火格每 tick 都会走到） */
  private fireDone: number[] = [];

  /** 气候场（生成时量化，读档时按 seed 重算——不入存档） */
  tempMap: Uint8Array<ArrayBuffer> = new Uint8Array(W * H);
  moistMap: Uint8Array<ArrayBuffer> = new Uint8Array(W * H);
  /** 地图覆盖模式（政治/温度/湿度）与覆盖层离屏画布 */
  overlayMode: OverlayMode = 'none';
  overlayCanvas!: HTMLCanvasElement;
  overlayCtx!: CanvasRenderingContext2D;
  overlayDirty = true;
  /** 人口密度热力图的分桶计数（bw×bh，与空间分桶同粒度）；复用避免 GC */
  densityGrid = new Uint16Array(Math.ceil(W / 4) * Math.ceil(H / 4));

  cam = { x: W / 2, y: H / 2, zoom: 4.5 };
  // —— 平滑缩放动画（Task 34）：目标倍率 + 锚点（缩放过程中保持指针下的世界点不动）——
  // 修复「放到一半突然瞬间放大很多」：①wheel 幅值感知（触控板小事件不再每个 ×1.18 复利爆炸）
  // ②所有缩放走指数缓动逼近目标（时间常数 ~55ms），任何输入都是连续平滑的推拉
  zoomAnim: { target: number; sx: number; sy: number; wx: number; wy: number; cw: number; ch: number } | null = null;
  brush = 3;
  cursor = { wx: 0, wy: 0, on: false };
  selectedId: number | null = null;
  brushPreview = false;
  /** 带 radius 参数工具的预览圈半径（null = 回退通用笔刷 brush） */
  previewR: number | null = null;

  onStats?: (s: StatsSnapshot) => void;
  onToast?: (t: ToastMsg) => void;
  onEvent?: (events: WorldEvent[]) => void;
  /** 音效上报回调：由 UI 层接到 WebAudio 合成器（爆炸/雷击/放置等） */
  onSound?: (kind: SoundKind) => void;

  // offscreen layers
  terrainCanvas: HTMLCanvasElement;
  terrainCtx: CanvasRenderingContext2D;
  terrainImg!: ImageData;
  propsCanvas: HTMLCanvasElement;
  propsCtx: CanvasRenderingContext2D;
  worldCanvas: HTMLCanvasElement;
  worldCtx: CanvasRenderingContext2D;

  dirty = new Set<number>();
  propsDirty = new Set<number>();
  /** Task 71 静态层合成：flushDirty/flushProps 的脏盒（设备像素，render 消费后清零）。
   *  render 把 terrain+props 合成到单张 staticCanvas（屏幕侧少一次全幅 blit），
   *  增量同步靠这两个盒子 —— 每帧只拷贝真正变化过的区域。 */
  terrainFlushBox: { x: number; y: number; w: number; h: number } | null = null;
  propsFlushBox: { x: number; y: number; w: number; h: number } | null = null;

  // spatial buckets (4x4 tiles per cell)
  readonly bw = Math.ceil(W / 4);
  readonly bh = Math.ceil(H / 4);
  buckets: Unit[][] = [];
  /** 懒清空世代戳（Stage 3）：bucketStampArr[ci] === bucketStamp ⇒ buckets[ci] 为本世代有效数据 */
  bucketStampArr!: Int32Array;
  bucketStamp = 0;

  /** mulberry32 状态（Stage 2：批内核镜像同步点；rng 闭包读它） */
  rngA = 0;
  /** Stage 2 批模式标志：JS 恢复路径的扫描走 JS 环（Stage 1 pack 已跳过） */
  _wbBatch = false;
  rng: () => number = () => {
    const A = this.rngA = (this.rngA + 0x6d2b79f5) | 0;
    let t = Math.imul(A ^ (A >>> 15), 1 | A);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  constructor(seed?: number) {
    // —— 质感工程 v3（Task 49）：渲染目标超采样 ×2 ——
    // 旧 4px/格 → 新 8px/格：精灵吸附到整数设备像素后运动步长减半（阶梯感↓），
    // 地形/海岸线/国界的锯齿颗粒减半。合成管线同步重构：地形/道具层不再进
    // worldCanvas（直绘屏幕，合成成本与视口而非世界尺寸挂钩），详见 render.ts
    this.terrainCanvas = document.createElement('canvas');
    this.terrainCanvas.width = W * 8;
    this.terrainCanvas.height = H * 8;
    this.terrainCtx = this.terrainCanvas.getContext('2d')!;
    this.propsCanvas = document.createElement('canvas');
    this.propsCanvas.width = W * 8;
    this.propsCanvas.height = H * 8;
    this.propsCtx = this.propsCanvas.getContext('2d')!;
    // 道具层基变换：现有 drawTree 等全部按 4px/格用户坐标绘制 —— 挂 ×2 基变换后
    // 零改动升到 8px/格设备分辨率（艺术像素屏幕尺寸不变，锯齿减半）。
    // 该变换永不重置：flushProps 的 clearRect 同在用户空间下工作，覆盖范围不变。
    this.propsCtx.setTransform(2, 0, 0, 2, 0, 0);
    this.worldCanvas = document.createElement('canvas');
    this.worldCanvas.width = W * 8;
    this.worldCanvas.height = H * 8;
    this.worldCtx = this.worldCanvas.getContext('2d')!;
    // 政治版图叠层：低频重绘的数据可视化层，保持 4px/格即可（合成时按用户空间 1:1 铺满）
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.width = W * 4;
    this.overlayCanvas.height = H * 4;
    this.overlayCtx = this.overlayCanvas.getContext('2d')!;
    for (let i = 0; i < this.bw * this.bh; i++) this.buckets.push([]);
    // 懒清空世代戳（Rust 重构 Stage 3：rebuildBuckets 只清本 tick 有单位的桶，4096 全清 → 按需 ~N 清）
    this.bucketStampArr = new Int32Array(this.bw * this.bh);
    this.bucketStamp = 0;
    this.generate(seed ?? Math.floor(Math.random() * 1e9));
    // Task 38：恢复在线训练权重（localStorage；离线权重指纹不匹配时自动作废 —— Q6 共存）
    onlineRestore();
  }

  // ------------------------------------------------------------------
  generate(seed: number, params?: WorldGenParams) {
    this.seed = seed;
    this.rngA = (seed ^ 0x9e3779b9) >>> 0;
    WBB.touchMeta(); // Stage 3 保险带：新世界 / HMR 热重建时 units 全量重排 —— 强制下 tick 全表重灌（哨兵兜底前的主动防线）
    const gen = generateWorld(seed, params);
    this.terrain = gen.terrain;
    this.variant = gen.variant;
    this.tempMap = gen.temp;
    this.moistMap = gen.moist;
    this.overlayDirty = true;
    this.owner = new Int16Array(W * H).fill(-1);
    this.building = new Uint8Array(W * H);
    this.fire = new Uint8Array(W * H);
    this.radiate = new Uint8Array(W * H);
    this.fireSet.clear();
    // 原子级瞬态层重置（新世界无血迹/尸骸/冰面/洪水/湿沙）
    this.frozen.clear();
    this.flood.clear();
    this.wet.clear();
    this.blood.length = 0;
    this.corpses.length = 0;
    this.phoenixAshes.length = 0;
    this.regrow.clear();
    this.radSet.clear();
    this.riverDir = new Uint8Array(W * H);
    this.riverTiles.clear();
    this.items = [];
    this.itemSeq = 1;
    this.triggers = [];
    this.triggerSeq = 1;
    this.bHp.clear();
    this.totalWars.clear();
    this.civBuildCounts.clear();
    this.lastSiegeEventTick = 0;
    // 军团方阵 / 战争档案 / 文明旨意重置
    this.armies = [];
    this.armySeq = 1;
    this.armyNameSeq.clear();
    this.warData.clear();
    this.warShame.clear();
    // 动态战线重置（新世界无虚国界）
    this.occCiv.fill(-1);
    this.occStr.fill(0);
    this.occSet.clear();
    this.directives = [];
    this.dirSeq = 1;
    this.lastWarSet.clear();
    this.lastClashEventTick = 0;
    // 修复防灾 / 科技社会体系状态重置
    this.damagedSet.clear();
    this.firesOut = 0;
    this.repairsDone = 0;
    this.lastFireOutEventTick = -2400;
    this.lastRepairEventTick = -2400;
    this.techModCache.clear();
    this.govCache.clear();
    this.lastGovEventTick.clear();
    // 进化 / 生态状态重置（亚种基线与历史曲线不跨世界）
    this.speciesBase.clear();
    this.speciesHist.clear();
    this.lastEcoPop.clear();
    this.ecoState = 'balanced';
    this.ecoLastNoteYear = -999;
    this.ecoRepopYear = -999;
    // 涌现社会内核重置：家族谱系 / 恐慌雪崩统计归零（新世界无姓无名无恩仇）
    this.families.clear();
    this.familySeq = 1;
    this.panicPeak = 0;
    this.panicEvents = 0;
    this.panicNoteCd = 0;
    // 成就系统：achUnlocked 不重置（跨世界元进度）；世界级计数器归零
    this.statWars = 0;
    this.statCivsFallen = 0;
    this.statDragonsSlain = 0;
    this.statNukes = 0;
    this.statBlackholes = 0;
    this.statMeteorShowers = 0;
    this.achProgressCache = {};
    // 终极世界大战重置（新世界无战火）
    this.worldWar = GameEngine.IDLE_WORLD_WAR();
    this.wwTruce.clear();
    this.wwLastNukeTick = -600;
    this.wwLastAntiTick = -1200;
    this.wwFrenzyAnnounced = -1;
    // 联盟系统重置：阵营/快查表/协同冷却/种族关系/灭绝标记全部归零
    this.alliances = [];
    this.allianceSeq = 1;
    this.allianceOf.clear();
    this.allianceWarCd.clear();
    this.raceRel.clear();
    this.civHomogeneity.clear();
    this.extinctNoted.clear();
    this.raceThrived.clear();
    this.lastCatastrophe = { x: -1, y: -1, tick: -999999 };
    // 涌现层重置：撤销动态物种注册（RACES 为模块级可变对象，必须显式清理防串档）
    for (const id of this.dynRaces.keys()) delete RACES[id];
    this.dynRaces.clear();
    this.hybridCd.clear(); // 超级演化 v4：融合冷却表随世界重置
    this.enemyLut.clear(); // 动态种族 ID 将在新世界复用——野生物种对敌意缓存必须同步失效
    // 造物工坊重置：图鉴注册解除 + 内置种族/物品覆写还原（图鉴本身跨世界持久，不受影响）
    this.creationRaceIds.clear();
    this.resetMods();
    WB.onWorldReset(this);
    WBB.onWorldReset(this); // WASM 内核同步失效（LUT/父种链/标志缓存/批内核表格）
    this.dynSeq = 100;
    this.killCredit = null;
    // 涌现式进化 v3 重置：动态特质撤销（TRAITS 同为模块级可变）+ 涌现科技/理念/图谱清零 + CIV_RACES 复原
    for (const key of this.dynTraits.keys()) delete TRAITS[key];
    this.dynTraits.clear();
    this.traitSeq = 1;
    this.emTechs.clear();
    this.emTechSeq = 1;
    this.emIdeas.clear();
    this.ideaSeq = 1;
    this.evoNodes = [];
    this.evoSeq = 1;
    this.evoIndex.clear();
    this.ideaModCache.clear();
    CIV_RACES.length = 0;
    CIV_RACES.push(...GameEngine.BASE_CIV_RACES);
    invalidateVisCache();
    this.seedSpeciesRoots();
    this.units = [];
    this.unitById.clear();
    // 深度打磨缓存重置：野生动物计数 / 地缘摩擦 / 宣战节奏阀
    this.wildCount.clear();
    this.tension.clear();
    this.lastDeclareAt.clear();
    this.civs = [];
    this.buildings = [];
    this.bIdx.clear();
    this.effects = [];
    this.rel.clear();
    this.met.clear();
    // 武器架构 v2：学说与防御随新世界清零
    this.doctrines.clear();
    this.defenses.clear();
    // 自然引擎重置（板块由 seed 确定性重生成）
    this.nature = new NatureSystem(this, seed);
    this.nature.initPlates();
    this.nature.lastSeason = -1;
    // 深时涌现引擎（Task 40）：连续海拔/水力侵蚀/土壤/温度/洋流/冰川/海平面——
    // 全部场由地形+seed 重导出（刻意不入存档，与板块同一哲学）
    this.worldsim = new WorldSim(this);
    this.worldsim.initFromTerrain();
    // v40：Agent 法则系统（神谕热载机制；新世界无法则）
    this.agentLaws = new AgentLawSystem(this);
    // 序号计数器同步归零（防止二次 generate 后 civs[id] 赋值产生数组空洞）
    this.unitSeq = 1;
    this.civSeq = 0;
    this.toastSeq = 1;
    this.tickCount = 0;
    this.yearF = 0;
    this.victoryCiv = null;
    this.multiCivSeen = false;
    this.followId = null;
    this.worldEvents = [];
    this.eventSeq = 1;
    this.activeBattles.clear();
    this.zombieOutbreakNoted = false;
    this.shake = 0;
    this.cam = { x: W / 2, y: H / 2, zoom: 4.5 };
    this.zoomAnim = null;
    this.warHistory = [];

    for (const a of gen.spawnAnimals) this.spawnUnit(a.race, a.x, a.y, { silent: true });

    // 自然河网（v2）：世界诞生时就有湿润高地奔流的大河（用生成期气候场选源头；
    // 必须在状态重置之后——刻河产生的纪事/toast 才不会被随后的重置抹掉）
    this.nature.seedRivers();

    // full redraw（质感工程 v3：超采样 ×2 后的像素缓冲 2048×1280）
    this.terrainImg = this.terrainCtx.createImageData(W * 8, H * 8);
    this.propsCtx.clearRect(0, 0, W * 4, H * 4);
    // 深度打磨：重置道路/贸易状态 + 全量重算水深场（新世界的海岸纵深）
    this.road.fill(0);
    this.tradeNext.clear();
    this.marketIdx.clear();
    this.rebuildWaterTiers();
    for (let i = 0; i < W * H; i++) this.dirty.add(i);
    this.flushDirty();
    for (let i = 0; i < W * H; i++) this.propsDirty.add(i);
    this.flushProps();
    this.rebuildAmbLists();
    this.statsTick();
  }

  // ---------------- terrain bookkeeping ----------------
  markDirty(i: number) {
    this.dirty.add(i);
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) this.dirty.add(i - 1);
    if (x < W - 1) this.dirty.add(i + 1);
    if (y > 0) this.dirty.add(i - W);
    if (y < H - 1) this.dirty.add(i + W);
  }

  setTerrain(i: number, t: number) {
    const prev = this.terrain[i];
    if (prev === t) return;
    this.terrain[i] = t;
    // Task 48-A2：氛围候选表增量维护（本格 + 4 邻贴岸状态）
    this.ambTouch(i);
    // 深时引擎同步：海拔场向新类别目标值靠拢（造山=抬升 / 裂谷沉降=下探；火烧扣地力）
    if (this.worldsim) this.worldsim.onTerrainChanged(i, t);
    this.markDirty(i);
    this.propsDirty.add(i);
    this.regrow.delete(i);
    // 冰面/洪水/湿沙 decals 簿记（瞬态层，随地形变化即时失效）
    if (prev === T.ICE) this.frozen.delete(i);
    if (t === T.ICE) this.frozen.add(i);
    if (t !== T.WATER) this.flood.delete(i);
    if (t !== T.SAND) this.wet.delete(i);
    // 河道被覆写为非水地形时清除流向场（水工具画的普通水不算河，不补录）
    if (!isWater(t) && this.riverDir[i] > 0) {
      this.riverDir[i] = 0;
      this.riverTiles.delete(i);
    }
    if (this.fire[i] > 0) {
      this.fire[i] = 0;
      this.fireSet.delete(i);
    }
    if ((isWater(t) || t === T.LAVA) && this.owner[i] >= 0) {
      this.owner[i] = -1;
      this.markDirty(i);
    }
    if ((isWater(t) || t === T.LAVA) && this.building[i] > 0) {
      this.destroyBuilding(i);
    }
    // —— 深度打磨：道路不入水（被淹没/岩浆吞没的路断绝）
    if ((isWater(t) || t === T.LAVA) && this.road[i] > 0) {
      this.road[i] = 0;
    }
    // —— 深度打磨：水深场局部重算（海岸线变化 → 浅礁/陆架分级即时刷新）
    this.refreshWaterTierAround(i);
  }

  // ---------------- 水深分级（深度打磨：近岸浅礁 → 陆架 → 深渊的色彩纵深） ----------------
  /** 地形是否为「陆地」（水深计算用：冰面视作水面、岩浆视作海岸） */
  private landForDepth(t: number) {
    return t !== T.DEEP && t !== T.WATER && t !== T.ICE;
  }

  /** 计算单个水格的水深分级（WATER: 0 浅礁/1 近岸/2 开阔；DEEP: 3 陆架/4 深渊） */
  waterTierAt(i: number): number {
    const t = this.terrain[i];
    const x = i % W;
    const y = (i / W) | 0;
    if (t === T.DEEP) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (this.terrain[yy * W + xx] === T.WATER) return 3; // 邻普通水 = 陆架
        }
      }
      return 4; // 深渊
    }
    if (t !== T.WATER) return 0;
    // 普通水：切比雪夫距离 1/2/3 内有陆地 → 浅礁/近岸/开阔
    for (let r = 1; r <= 3; r++) {
      let land = false;
      for (let dy = -r; dy <= r && !land; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // 只查外环
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (this.landForDepth(this.terrain[yy * W + xx])) { land = true; break; }
        }
      }
      if (land) return r - 1;
    }
    return 2;
  }

  /** 全量重算水深场（generate 时一次性） */
  rebuildWaterTiers() {
    for (let i = 0; i < W * H; i++) this.waterTier[i] = this.waterTierAt(i);
  }

  /** 局部重算：地形变化后刷新半径 3 窗口内的水格分级并标脏（分级变了才重绘） */
  refreshWaterTierAround(i: number) {
    const x = i % W;
    const y = (i / W) | 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const tt = this.terrain[j];
        if (tt !== T.WATER && tt !== T.DEEP) continue;
        const tier = this.waterTierAt(j);
        if (this.waterTier[j] !== tier) {
          this.waterTier[j] = tier;
          this.dirty.add(j);
        }
      }
    }
  }

  ignite(i: number) {
    const t = this.terrain[i];
    if (this.fire[i] > 0) return;
    if (!FLAMMABLE.includes(t) && this.building[i] === 0) return;
    this.fire[i] = 150 + Math.floor(this.rng() * 90);
    this.fireSet.add(i);
  }

  // ---------------- units ----------------
  /** 野生动物分种族计数增量维护（spawn/reap/种族变化时调用） */
  bumpWild(race: number, d: number) {
    const n = (this.wildCount.get(race) ?? 0) + d;
    if (n > 0) this.wildCount.set(race, n);
    else this.wildCount.delete(race);
  }

  /** 当前在世野生动物总数（O(物种数) ≈ O(30)：由 wildCount 增量维护） */
  wildAlive(): number {
    let n = 0;
    for (const v of this.wildCount.values()) n += v;
    return n;
  }

  /** 当前在世纯水生野生动物总数（鱼/龟/鲨/蟹及演化后裔；与 wildAlive 同账本按旗标分账） */
  wildAliveAquatic(): number {
    let n = 0;
    for (const [race, v] of this.wildCount) {
      if (RACES[race]?.aquatic) n += v;
    }
    return n;
  }

  // ---------------- 涌现社会内核（Task 39）：家族谱系 / 血仇网络 / 恐慌传染场 ----------------

  /** 家族姓氏词库：前缀 × 后缀词法组合（16×12=192 —— 重姓本就自然，不查重） */
  private static readonly FAM_PRE = ['霜', '烬', '暴风', '血', '铁', '荆棘', '暗影', '星', '狼', '鹰', '珊瑚', '苔', '雷', '冬', '荒', '银'];
  private static readonly FAM_POST = ['牙', '羽', '痕', '鬃', '棘', '誓', '歌', '爪', '翼', '须', '蹄', '岚'];

  /** 立新家族（词法姓氏 + 初代记账） */
  newFamily(race: number, founder: Unit): Family {
    const pre = GameEngine.FAM_PRE[Math.floor(this.rng() * GameEngine.FAM_PRE.length)];
    const post = GameEngine.FAM_POST[Math.floor(this.rng() * GameEngine.FAM_POST.length)];
    const f: Family = {
      id: this.familySeq++,
      name: pre + post,
      race,
      founded: Math.floor(this.yearF),
      founder: founder.name,
      members: 1,
      heroes: 0,
      kills: 0,
      peak: 1,
      milestones: 0,
    };
    this.families.set(f.id, f);
    this.pruneFamilies();
    return f;
  }

  /** 家族 LRU：超 240 时清除已绝嗣且无战功的最老 20 家（名门史官只记两百家） */
  pruneFamilies() {
    if (this.families.size <= 240) return;
    const dead = [...this.families.values()].filter((f) => f.members <= 0 && f.kills < 10).sort((a, b) => a.id - b.id);
    for (let i = 0; i < 20 && i < dead.length; i++) this.families.delete(dead[i].id);
  }

  /** 家族里程碑：峰值更新 + 人口达 12/24/40 时「枝繁叶茂」播报（一次性） */
  private familyMilestone(f: Family) {
    if (f.members > f.peak) f.peak = f.members;
    const marks = [12, 24, 40];
    while (f.milestones < marks.length && f.members >= marks[f.milestones]) {
      const m = marks[f.milestones++];
      const raceName = RACES[f.race]?.name ?? '';
      this.addEvent('lineage', `${raceName}「${f.name}」家族枝繁叶茂 —— 族人已达 ${m} 口（先祖 ${f.founder}）`);
    }
  }

  /** 记仇：目睹同族被杀 → 对凶手记账（同种 +1.0 / 同国 +1.6 / 血亲 +2.6；≤4 条 LRU 挤最弱；弑君 ×mul） */
  private addGrudge(w: Unit, killer: Unit, victim: Unit, mul = 1) {
    let v = 1.0;
    if (victim.civ >= 0 && w.civ === victim.civ) v = 1.6;
    if (w.fam != null && w.fam === victim.fam) v = 2.6;
    v *= mul;
    const ids = (w.gIds ?? (w.gIds = []));
    const vals = (w.gVal ?? (w.gVal = []));
    const i = ids.indexOf(killer.id);
    if (i >= 0) vals[i] = Math.min(3, vals[i] + v * 0.6); // 旧仇加深（仇人见面分外眼红）
    else {
      if (ids.length >= 4) {
        let mi = 0;
        for (let k = 1; k < vals.length; k++) if (vals[k] < vals[mi]) mi = k;
        ids.splice(mi, 1);
        vals.splice(mi, 1);
      }
      ids.push(killer.id);
      vals.push(v);
    }
  }

  /** 目睹死亡广播（击杀结算处单点调用）：半径 6 内同族目击者 —— 恐慌上涌 + 血仇记账（一次遍历双产出）
   *  微观规则 → 宏观涌现：狼群袭羊 → 目击羊恐慌 → 恐慌在羊群中传染 → 雪崩式溃逃；
   *  幸存者记下狼的仇 → 复仇优先索敌 + 仇恨压倒恐惧（战或逃修正）→ 世仇网络 */
  private witnessDeath(killer: Unit, victim: Unit) {
    if (!RACES[victim.race]) return;
    // —— 弑君之仇：国仇加权（目击者血仇 ×1.8 + 两国关系重挫 + 记入战败耻辱 → 复仇战争的理由）——
    if (victim.king && victim.civ >= 0) {
      for (const w of this.units) {
        if (w.dead || w.civ !== victim.civ) continue;
        if (Math.hypot(w.x - victim.x, w.y - victim.y) > 14) continue; // 疆内闻讯（全域同悲）
        w.panic = Math.min(1, (w.panic ?? 0) + 0.5);
      }
      const kc = killer.civ >= 0 ? this.civs[killer.civ] : null;
      if (kc && kc.alive && killer.civ !== victim.civ) {
        const key = pairKey(victim.civ, killer.civ);
        this.rel.set(key, Math.max(-100, (this.rel.get(key) ?? 0) - 24));
        this.tension.set(key, Math.min(100, (this.tension.get(key) ?? 0) + 30));
        this.warShame.set(key, victim.civ); // 弑君者被记入耻辱簿（复仇宣战的种子）
      }
    }
    const cx = Math.min(this.bw - 1, Math.max(0, (victim.x / 4) | 0));
    const cy = Math.min(this.bh - 1, Math.max(0, (victim.y / 4) | 0));
    const fierce = Math.min(3, killer.kills / 6); // 凶手连杀威慑
    for (let by = cy - 2; by <= cy + 2; by++) {
      for (let bx = cx - 2; bx <= cx + 2; bx++) {
        if (bx < 0 || by < 0 || bx >= this.bw || by >= this.bh) continue;
        for (const w of this.buckets[by * this.bw + bx]) {
          if (w.dead || w === killer || w === victim) continue;
          const kin = victim.civ >= 0 ? w.civ === victim.civ : w.race === victim.race;
          if (!kin) continue;
          if (Math.hypot(w.x - victim.x, w.y - victim.y) > 6) continue;
          const wd = RACES[w.race];
          if (!wd || wd.undead) continue; // 亡灵不知恐惧，不记恩仇
          // —— 恐慌记账：基础 0.32 + 威慑 + 血亲之殇；狂暴特质/巨怪减震 ×0.35，军纪 ×0.4 ——
          let inc = 0.32 + 0.08 * fierce + (killer.kills >= 10 ? 0.12 : 0);
          if (w.fam != null && w.fam === victim.fam) inc += 0.15;
          if (w.trait === 'berserk' || GameEngine.MONSTER_LOOT.has(w.race)) inc *= 0.35;
          if (w.army != null) inc *= 0.4;
          w.panic = Math.min(1, (w.panic ?? 0) + inc);
          WB.syncPanic(w); // WASM 镜像：目击者恐慌外源变异同步
          // —— 血仇记账（血亲之死，永志不忘）——
          this.addGrudge(w, killer, victim, victim.king ? 1.8 : 1);
        }
      }
    }
  }

  /** 恐慌雪崩监测（tick 内每 60 tick 采样一次）：同刻 >0.6 的单位数 —— 峰值统计 + 雪崩事件播报 */
  private panicTick() {
    let n = 0;
    for (const u of this.units) if ((u.panic ?? 0) > 0.6) n++;
    if (n > this.panicPeak) this.panicPeak = n;
    if (n >= 12 && this.panicNoteCd <= 0) {
      this.panicEvents++;
      this.panicNoteCd = 240; // 6 年播报冷却
      this.addEvent('panic', `恐慌雪崩席卷大地 —— ${n} 只生灵夺路奔逃`);
      this.toast('恐慌在兽群中蔓延，大规模溃逃开始了', 'info');
    }
  }

  /** 涌现社会内核全景快照（SocietalPanel 数据源 + QA 验证） */
  societalInfo() {
    let panicNow = 0; // panic ≥ 0.5
    let panicHigh = 0; // panic ≥ 0.72（溃逃中）
    let grudgeActive = 0;
    let famUnits = 0;
    let maxGen = 0;
    const civGrudge = new Map<string, number>();
    for (const u of this.units) {
      const p = u.panic ?? 0;
      if (p >= 0.5) panicNow++;
      if (p >= ep('social.panicRout')) panicHigh++;
      if (u.gIds?.length) grudgeActive += u.gIds.length;
      if (u.fam != null) famUnits++;
      if ((u.fgn ?? 0) > maxGen) maxGen = u.fgn ?? 0;
      // 文明级世仇聚合：单位对异国仇人的仇恨总分
      if (u.civ >= 0 && u.gIds) {
        for (let i = 0; i < u.gIds.length; i++) {
          const t = this.unitById.get(u.gIds[i]);
          if (t && t.civ >= 0 && t.civ !== u.civ) {
            const key = u.civ < t.civ ? `${u.civ}|${t.civ}` : `${t.civ}|${u.civ}`;
            civGrudge.set(key, (civGrudge.get(key) ?? 0) + (u.gVal?.[i] ?? 1));
          }
        }
      }
    }
    const feuds = [...civGrudge.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => {
        const [a, b] = k.split('|').map(Number);
        return { a, b, aName: this.civs[a]?.name ?? '？', bName: this.civs[b]?.name ?? '？', v: Math.round(v * 10) / 10 };
      });
    const fams = [...this.families.values()]
      .sort((x, y) => y.members - x.members || y.kills - x.kills || y.peak - x.peak)
      .slice(0, 8)
      .map((f) => ({ id: f.id, name: f.name, race: f.race, raceName: RACES[f.race]?.name ?? '', founded: f.founded, founder: f.founder, members: f.members, heroes: f.heroes, kills: f.kills, peak: f.peak }));
    return {
      year: Math.floor(this.yearF),
      panicNow,
      panicHigh,
      panicPeak: this.panicPeak,
      panicEvents: this.panicEvents,
      grudgeActive,
      feuds,
      familyCount: this.families.size,
      famUnits,
      maxGen,
      families: fams,
    };
  }

  spawnUnit(race: number, x: number, y: number, opts?: { silent?: boolean; civ?: number; infected?: boolean; job?: number; trait?: string; gear?: boolean; gene?: Gene; fam?: number; fgn?: number }) {
    // Stage 3+：新行由 push 后的行级 touch 标记（不再全表 touchMeta —— 繁衍活跃期零额外重灌）
    const def = RACES[race];
    if (!def) return null;
    // 预算分轨：文明人口受 MAX_UNITS 限制；野生动物有独立的 MAX_WILDLIFE 生态预算（两项之和为绝对性能上界）。
    // （否则文明人口膨胀会挤占全部单位预算，野生动物被饿死灭绝且无法恢复 —— 700 年长时程实测发现）
    if (def.isCiv && this.units.length >= MAX_UNITS) return null;
    // 预算三轨：文明 MAX_UNITS / 陆生野生 MAX_WILDLIFE / 纯水生 MAX_WILDLIFE_AQUATIC ——
    // 水生独立配额后海洋可繁衍至自身承载（此前全球预算被羊群饱和占用，鱼被封顶 ~40、鲨鱼复兴无门）
    if (!def.isCiv) {
      if (def.aquatic) { if (this.wildAliveAquatic() >= MAX_WILDLIFE_AQUATIC) return null; }
      else if (this.wildAlive() >= MAX_WILDLIFE) return null; // 含僵尸（防刷屏无上限）
    }
    if (race === R2 && (this.wildCount.get(race) ?? 0) >= MAX_DRAGONS) return null;
    if (race === RD && (this.wildCount.get(race) ?? 0) >= MAX_DEMONS) return null;
    // 新智慧巨怪同屏上限（防止性能崩溃 + 稀缺感）
    if (race === R.TROLL && (this.wildCount.get(race) ?? 0) >= MAX_TROLLS) return null;
    if (race === R.OGRE && (this.wildCount.get(race) ?? 0) >= MAX_OGRES) return null;
    if (race === R.WHITEWALKER && (this.wildCount.get(race) ?? 0) >= MAX_WHITEWALKERS) return null;
    if (race === R.VAMPIRE && (this.wildCount.get(race) ?? 0) >= MAX_VAMPIRES) return null;
    if (race === R.KRAKEN && (this.wildCount.get(race) ?? 0) >= MAX_KRAKENS) return null;
    if (race === R.SANDWORM && (this.wildCount.get(race) ?? 0) >= MAX_SANDWORMS) return null;
    if (race === R.BASILISK && (this.wildCount.get(race) ?? 0) >= MAX_BASILISKS) return null;
    if (race === R.HYDRA && (this.wildCount.get(race) ?? 0) >= MAX_HYDRAS) return null;
    x = Math.max(0.5, Math.min(W - 0.5, x));
    y = Math.max(0.5, Math.min(H - 0.5, y));

    let civ = opts?.civ ?? -1;
    if (def.isCiv && civ < 0) {
      civ = this.findCivNear(race, x, y);
      if (civ < 0) civ = this.createCiv(race, x, y);
    }

    const trait = opts?.trait !== undefined ? (opts.trait || null) : (this.rng() < 0.15 ? this.rollTrait() : null);
    const td = trait ? TRAITS[trait] : null;
    // —— 基因（野生动物）：出生即携带母代基因（进化遗传）；人工放置的野生动物从物种基线取样 ——
    const gene = opts?.gene !== undefined ? opts.gene : this.baseGene(race); // v3：全体单位（含文明）携带基因 —— 万物皆在演化
    // 职业：文明生物加权抽取（战士/弓手/农民/建筑师/商人/贵族），可由 opts 指定（开发者/兵营）
    let job = 0;
    if (def.isCiv && civ >= 0) {
      job = opts?.job ?? this.rollJob();
    }
    const jd = def.isCiv ? JOBS[job] : null;
    // —— 科技加成：青铜/铁器/钢铁提升伤害与生命（文明的国家武备水平）——
    // tDmg/tHp：出生时的科技乘数快照（科技回溯重算的基准，见 completeTech）
    const tm = def.isCiv && civ >= 0 ? this.techModsOf(civ) : null;
    const tH = tm?.hp ?? 1;
    const tD = tm?.dmg ?? 1;
    const maxHp = Math.round(def.hp * (td?.hpMul ?? 1) * (jd?.hpMul ?? 1) * tH * (gene?.h ?? 1));
    const u: Unit = {
      id: this.unitSeq++,
      race,
      civ,
      x, y,
      lx: x, ly: y, // 渲染插值初值：新单位从原地起步（避免首帧从 (0,0) 滑入）
      rx: x, ry: y,
      tx: x, ty: y,
      hp: maxHp,
      maxHp,
      dmg: def.dmg * (td?.dmgMul ?? 1) * (jd?.dmgMul ?? 1) * tD * (this.govOf(civ) === 4 ? 1.15 : 1) * (gene?.d ?? 1),
      speed: def.speed * (td?.speedMul ?? 1) * (jd?.speedMul ?? 1) * (gene?.s ?? 1),
      tDmg: tD,
      tHp: tH,
      age: 0,
      maxAge: def.maxAge * (0.8 + this.rng() * 0.4),
      kills: 0,
      cd: 0,
      trait,
      gene,
      job: def.isCiv ? job : undefined,
      infected: opts?.infected ?? false,
      flip: this.rng() < 0.5,
      name: this.uniqueName(race),
      hurt: 0,
      breath: 120 + Math.floor(this.rng() * 160),
      parity: this.unitSeq % 2,
      dead: false,
    };
    this.units.push(u);
    WBB.touchRow(this.units.length - 1); // Stage 3+：新行 meta 列行级增量灌入
    this.unitById.set(u.id, u);
    if (civ >= 0 && this.civs[civ]) this.civs[civ].pop++;
    if (!def.isCiv) this.bumpWild(race, 1); // 野生动物分种族计数（O(1) 预算检查）
    // —— 家族谱系：繁殖路径继承血脉（fgn+1 代代相传）；白手起家者 6% 开宗立姓 ——
    if (opts?.fam !== undefined) {
      u.fam = opts.fam;
      u.fgn = opts.fgn ?? 1;
      const f = this.families.get(opts.fam);
      if (f) { f.members++; this.familyMilestone(f); }
    } else if (!def.undead && this.rng() < 0.06) {
      const f = this.newFamily(race, u);
      u.fam = f.id;
      u.fgn = 1;
    }
    // 开发者模式：出生即神装
    if (opts?.gear) this.devEquip(u);
    if (!opts?.silent && race === R2) {
      this.toast('巨龙在世界上空盘旋', 'danger');
      this.addEvent('dragon', '一头巨龙降临世界，火光将在大地蔓延', { x, y });
      this.onSound?.('dragon'); // 巨龙低吼（42-e 接线）
    }
    if (!opts?.silent && race === R.DEMON) {
      this.toast('恶魔从地狱的裂隙中爬了出来', 'danger');
      this.addEvent('demon', '地狱的裂隙开启，一头恶魔降临大地', { x, y });
      this.shake = Math.max(this.shake, 6);
    }
    if (!opts?.silent && race === R.ANGEL) {
      this.toast('一道圣光划破长空——天使降临了', 'info');
      this.addEvent('angel', '圣光自云层倾泻，一位天使振翼而降，将守望这片大地的凡间众生', { x, y });
      this.fx('spawn', x, y, 40);
      this.onSound?.('heal');
    }
    if (!opts?.silent && race === R.PHOENIX) {
      this.toast('烈焰汇聚成翼——凤凰自火中降临', 'info');
      this.addEvent('phoenix', '烈焰在空中盘旋凝成神鸟，凤凰降临世间——灰烬只是它的摇篮', { x, y });
      this.fx('spawn', x, y, 40);
      this.fx('fireball', x, y - 1, 24);
      this.onSound?.('phoenix');
    }
    if (!opts?.silent && race === R.ENT) {
      this.toast('古老的树人从林间苏醒', 'info');
      this.addEvent('ent', '一声深沉的吱吟自林间响起，古老的树人拔根而行——它走过的地方，森林将生长', { x, y });
      this.fx('spawn', x, y, 40);
      this.fx('spark', x, y - 1, 24);
      this.shake = Math.max(this.shake, 3); // 沉重的脚步
      this.onSound?.('ent'); // 树皮嗓音的苏醒吱吟
    }
    if (!opts?.silent && race === R.LICH) {
      this.toast('死灵的号角长鸣——巫妖自坟茔中升起', 'danger');
      this.addEvent('lich', '大地渗出冷雾，巫妖携着亡者的低语升起——战场的骸骨将应声而起，编入永夜的军团', { x, y });
      this.fx('spawn', x, y, 40);
      this.fx('smoke', x, y - 1, 30);
      this.fx('skull', x, y - 2, 30);
      this.shake = Math.max(this.shake, 4);
      this.onSound?.('horn');
    }
    if (!opts?.silent && race === R.HYDRA) {
      this.toast('沼泽沸腾了——九头蛇自泥泞中爬出', 'danger');
      this.addEvent('hydra', '泥浆翻涌，毒液滴落——九头巨蟒自沼泽深处爬出，每一颗头颅都在低嘶；斩下它的一颗头，它会还你两颗', { x, y });
      this.fx('spawn', x, y, 40);
      this.fx('smoke', x, y - 1, 30);
      this.shake = Math.max(this.shake, 4); // 巨蟒爬行震动
      this.onSound?.('hydra');
    }
    if (!opts?.silent && race === R.MAGE) {
      this.toast('一位神秘的法师现身了', 'info');
    }
    if (!opts?.silent && race === R.SKELETON) {
      this.fx('spawn', x, y, 30);
    }
    if (!opts?.silent && race === R.TROLL) {
      this.toast('一头巨魔从深山中苏醒', 'danger');
      this.shake = Math.max(this.shake, 5);
    }
    if (!opts?.silent && race === R.OGRE) {
      this.toast('一头饥饿的食人魔闯入了世界', 'danger');
    }
    if (!opts?.silent && race === R.WHITEWALKER) {
      this.toast('白行者自极北的寒雾中降临', 'danger');
      this.addEvent('whitewalker', '极北的寒雾凝成了白行者，冰霜将随其蔓延', { x, y });
      this.shake = Math.max(this.shake, 6);
    }
    if (!opts?.silent && race === R.VAMPIRE) {
      this.toast('一位吸血鬼在夜色中睁开了猩红双瞳', 'danger');
      this.addEvent('vampire', '永夜贵族降临，鲜血将维系它的永生', { x, y });
    }
    if (!opts?.silent && race === R.KRAKEN) {
      this.toast('克拉肯自深渊苏醒 — 海员们的噩梦', 'danger');
      this.addEvent('kraken', '深渊的巨眼睁开了：克拉肯苏醒，触手将攫取海岸与航船', { x, y });
      this.shake = Math.max(this.shake, 6);
      this.fx('tsunami', x, y, 18, { r: 4, quiet: true });
    }
    if (!opts?.silent && race === R.SANDWORM) {
      this.toast('沙虫在地底发出雷鸣般的蠕响', 'danger');
      this.addEvent('sandworm', '大地震颤 —— 沙虫在沙海之下蠕动，途经的生物将被吞噬', { x, y });
      this.shake = Math.max(this.shake, 5);
    }
    if (!opts?.silent && race === R.BASILISK) {
      this.toast('蛇怪竖起了猩红的冠翼 — 不要与它对视', 'danger');
      this.addEvent('basilisk', '蛇怪从秘境爬出，它的凝视将把猎物化为石像', { x, y });
    }
    return u;
  }

  rollTrait(): string {
    const keys = Object.keys(TRAITS);
    return keys[Math.floor(this.rng() * keys.length)];
  }

  /** 加权抽取职业（文明生物出生时） */
  rollJob(): number {
    let total = 0;
    for (const j of JOBS) total += j.weight;
    let r = this.rng() * total;
    for (let i = 0; i < JOBS.length; i++) { r -= JOBS[i].weight; if (r <= 0) return i; }
    return 0;
  }

  /** 转职：相对调整属性（保留当前生命百分比语义：按倍率同扩 maxHp 与 hp） */
  setJob(u: Unit, job: number) {
    WBB.touchMeta(); // Stage 3：job 列 JS 写点收口
    if (!RACES[u.race].isCiv || job < 0 || job >= JOBS.length) return;
    const old = JOBS[u.job ?? 0];
    const nw = JOBS[job];
    u.hp = Math.max(1, Math.round((u.hp * nw.hpMul) / old.hpMul));
    u.maxHp = Math.max(1, Math.round((u.maxHp * nw.hpMul) / old.hpMul));
    u.dmg = (u.dmg * nw.dmgMul) / old.dmgMul;
    u.speed = (u.speed * nw.speedMul) / old.speedMul;
    u.job = job;
  }

  /** 装备加成汇总（减伤/暴击/吸血/反伤/再生/射程 —— 动态计算，替换装备即时生效）
   *  空装具共享常量：七个槽位全空的单位（野生动物与绝大多数平民）直接复用，热路径零分配（调用方全部只读） */
  private static readonly GEAR_EMPTY = { armor: 0, crit: 0, lifesteal: 0, thorns: 0, regen: 0, ranged: 0, speed: 1 } as const;

  gearBonus(u: Unit): { armor: number; crit: number; lifesteal: number; thorns: number; regen: number; ranged: number; speed: number } {
    // 快路径：七槽全空 → 共享只读对象（避免每次循环七次动态属性访问 + 对象字面量分配）
    if (!u.wep && !u.arm && !u.hlm && !u.shd && !u.bts && !u.rng && !u.amu) return GameEngine.GEAR_EMPTY;
    let armor = 0, crit = 0, lifesteal = 0, thorns = 0, regen = 0, ranged = 0, speed = 1;
    for (const slot of SLOT_ORDER) {
      const k = u[SLOT_FIELD[slot]];
      if (!k) continue;
      const d = ITEM_DEFS[k as string];
      if (!d) continue;
      armor += d.armor ?? 0;
      crit += d.crit ?? 0;
      lifesteal += d.lifesteal ?? 0;
      thorns += d.thorns ?? 0;
      regen += d.regen ?? 0;
      ranged = Math.max(ranged, d.ranged ?? 0);
      speed *= d.speedMul ?? 1; // 攻速乘数（匕首快/巨斧慢 —— 深度打磨：终于接上了）
    }
    return { armor: Math.min(60, armor), crit, lifesteal, thorns, regen, ranged, speed: Math.max(0.85, Math.min(1.12, speed)) };
  }

  /**
   * 生成不与在世单位重名的名字：同名时附加罗马数字后缀（Fang II、Fang III…）。
   * 按在世单位实时统计，存档往返后编号自然延续；王国名也用同一机制。
   */
  uniqueName(race: number): string {
    const base = unitName(race as RaceId, this.rng);
    // Task 42-a：原 startsWith(base + ' ') 每个单位拼接一次临时串 → 拆为长度+首字符判定免拼接
    const bl = base.length;
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      const nm = u.name;
      if (nm === base || (nm.length > bl && nm.charCodeAt(bl) === 32 && nm.startsWith(base))) n++;
    }
    return n === 0 ? base : `${base} ${roman(n + 1)}`;
  }

  findCivNear(race: number, x: number, y: number): number {
    let best = -1;
    let bestD = 42;
    for (const c of this.civs) {
      if (!c.alive || c.race !== race) continue;
      const anchor = c.capital >= 0 ? c.capital : (c.tiles.length > 0 ? c.tiles[0] : -1);
      if (anchor < 0) continue;
      const d = Math.hypot(this.tileX(anchor) - x, this.tileY(anchor) - y);
      if (d < bestD) { bestD = d; best = c.id; }
    }
    return best;
  }

  tileX(i: number) { return i % W; }
  tileY(i: number) { return (i / W) | 0; }

  createCiv(race: number, x: number, y: number): number {
    // 王国名去重：最多重掷 8 次，仍冲突则附罗马数字后缀
    let { name, banner } = civName(this.rng);
    for (let t = 0; t < 8 && this.civs.some((c) => c.alive && c.name === name); t++) {
      ({ name, banner } = civName(this.rng));
    }
    if (this.civs.some((c) => c.alive && c.name === name)) {
      let n = 1;
      while (this.civs.some((c) => c.alive && c.name === `${name} ${roman(n + 1)}`)) n++;
      name = `${name} ${roman(n + 1)}`;
    }
    const color = CIV_COLORS[this.civSeq % CIV_COLORS.length];
    const civ: Civ = {
      id: this.civSeq++,
      name,
      race,
      color,
      colorHex: `#${color.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
      pop: 0,
      tiles: [],
      frontier: [],
      houses: 0,
      capital: -1,
      kingName: this.uniqueName(race),
      alive: true,
      banner,
      colonizeCd: 0,
      history: [],
      gold: 0,
      knowledge: 0,
      // —— 科技与社会体系初始化 ——
      techs: [],
      research: null,
      researchP: 0,
      gov: 0,
      govYear: Math.floor(this.yearF),
      stability: 70,
      culture: 0,
      militarism: 30,
      income: 0,
      expense: 0,
      festivalCd: 0,
    };
    this.civs.push(civ);
    this.civs[civ.id] = civ; // ids are dense anyway

    // find capital spot（半径扩到 5：建国点贴海/贴山也能找到可建地块）
    let cap = -1;
    outer: for (let r = 0; r <= 5; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // 只扫当前环
          const xx = Math.floor(x) + dx;
          const yy = Math.floor(y) + dy;
          if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
          const i = idx(xx, yy);
          if (buildable(this.terrain[i]) && this.building[i] === 0) {
            cap = i;
            break outer;
          }
        }
      }
    }
    if (cap >= 0) {
      this.buildBuilding(cap, 2, civ.id);
      civ.capital = cap;
    }
    // seed territory — 以首都为圆心（比点击点更可靠）；找不到首都再退回原点
    const anchor = cap >= 0 ? cap : idx(Math.floor(x), Math.floor(y));
    const cx = anchor % W;
    const cy = (anchor / W) | 0;
    this.seedTerritory(civ, cx, cy);
    this.toast(`${RACES[race].name}王国「${name}」建立了`, 'good');
    this.addEvent('found', `${RACES[race].name}王国「${name}」建立了，国王 ${civ.kingName} 加冕`, { colorHex: civ.colorHex, x: cap >= 0 ? this.tileX(cap) : x, y: cap >= 0 ? this.tileY(cap) : y });
    return civ.id;
  }

  // ---------------- 王权体系（国王实体：加冕 / 驾崩 / 继承） ----------------

  /** 加冕：指定单位成为一国之君（job 'king'，hp/dmg ×1.5 —— 经 setJob 相对换算保血量比例） */
  crownUnit(civ: Civ, u: Unit, announce: boolean) {
    if (!civ.alive || u.dead || u.civ !== civ.id || !RACES[u.race].isCiv) return;
    if (u.king && civ.kingId === u.id) return; // 已在位
    u.king = true;
    WBB.touchMeta(); // job/king 列写点收口
    this.setJob(u, JOB_KEY.king);
    civ.kingId = u.id;
    civ.kingName = u.name;
    if (announce) {
      this.addEvent('king', `${u.name} 在「${civ.name}」的臣民拥戴下加冕为王`, { colorHex: civ.colorHex, x: u.x, y: u.y });
      this.toast(`「${civ.name}」新王 ${u.name} 加冕`, 'good');
    }
  }

  /** 王位空缺补冕（civsTick 每 40 tick 扫描）：建国首王 / 旧档王国自动补冕（静默）/ 继承（播报） */
  crownVacantTick() {
    for (const civ of this.civs) {
      if (!civ.alive || civ.pop <= 0) continue;
      const kid = civ.kingId;
      if (kid != null && kid !== -1) {
        const cur = this.unitById.get(kid);
        if (cur && !cur.dead && cur.king && cur.civ === civ.id) continue; // 在位
      }
      const succession = kid === -1; // 先王驾崩过 → 这次是继承（播报）；undefined = 旧档/新国首冕（静默）
      // 继承人遴选：贵族 > 战士/弓手 > 其他；附带少量随机（权柄与时运）
      let best: Unit | null = null;
      let bestScore = -1;
      for (const u of this.units) {
        if (u.dead || u.civ !== civ.id || u.boat) continue;
        const job = u.job ?? 0;
        const score = (job === 6 ? 3 : job === 2 || job === 3 ? 2 : job === 5 ? 1.5 : 1) + this.rng() * 0.9;
        if (score > bestScore) { bestScore = score; best = u; }
      }
      if (best) this.crownUnit(civ, best, succession);
    }
  }

  /** 国王驾崩：纪事「驾崩」+ 稳定度下挫 + 王位空缺（继承由 crownVacantTick 补冕） */
  onKingDeath(u: Unit) {
    const civ = this.civs[u.civ];
    u.king = false;
    if (!civ || !civ.alive) return;
    if (civ.kingId === u.id) civ.kingId = -1;
    civ.stability = Math.max(0, (civ.stability ?? 70) - 18);
    this.addEvent('king', `「${civ.name}」的国王 ${civ.kingName} 驾崩了——举国缟素，王位悬而未决`, { colorHex: civ.colorHex, x: u.x, y: u.y });
    this.toast(`「${civ.name}」国王驾崩，朝野震动`, 'danger');
  }

  /** 领土播种：以 (cx,cy) 为圆心圈占 5x5 无主沃土（建国与幽灵王国自愈共用）。
   *  原地无沃土（成员困在山顶/孤地）时螺旋外扩（最远 14 格）找最近可圈之地。 */
  seedTerritory(civ: Civ, cx: number, cy: number) {
    // 先剔除 owner 已不符的陈旧记录（避免 stats 双计）
    if (civ.tiles.length > 0) {
      civ.tiles = civ.tiles.filter((i) => this.owner[i] === civ.id);
    }
    const claimAt = (ax: number, ay: number) => {
      let n = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = ax + dx;
          const yy = ay + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const i = idx(xx, yy);
          if (this.owner[i] === -1 && isLand(this.terrain[i]) && this.terrain[i] !== T.MOUNTAIN) {
            this.claimTile(i, civ.id);
            n++;
          }
        }
      }
      return n;
    };
    if (claimAt(cx, cy) > 0) return;
    for (let r = 3; r <= 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // 只扫当前环
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
          const i = idx(xx, yy);
          if (this.owner[i] === -1 && isLand(this.terrain[i]) && this.terrain[i] !== T.MOUNTAIN) {
            if (claimAt(xx, yy) > 0) return;
          }
        }
      }
    }
  }

  claimTile(i: number, civId: number) {
    const civ = this.civs[civId];
    if (!civ || !civ.alive) return;
    this.owner[i] = civId;
    // 占领层同步清除（转正/割让/新占都走主权移交，不留虚界残影）
    if (this.occCiv[i] !== -1) { this.occCiv[i] = -1; this.occStr[i] = 0; this.occSet.delete(i); }
    civ.tiles.push(i);
    this.markDirty(i);
    if (this.overlayMode === 'political' || this.overlayMode === 'alliance') this.overlayDirty = true;
    const x = i % W;
    const y = (i / W) | 0;
    const push = (j: number) => {
      if (this.owner[j] === -1 && isLand(this.terrain[j]) && this.terrain[j] !== T.MOUNTAIN) civ.frontier.push(j);
    };
    if (x > 0) push(i - 1);
    if (x < W - 1) push(i + 1);
    if (y > 0) push(i - W);
    if (y < H - 1) push(i + W);
    // diplomacy on border contact
    const meet = (j: number) => {
      const o = this.owner[j];
      if (o >= 0 && o !== civId) {
        this.diplomacyMeet(civId, o);
        // 边境摩擦：领土接触是地缘张力的燃料（扩张期摩擦飙升 → 战争风险真实起来）
        if (this.rng() < 0.5) {
          const k = pairKey(civId, o);
          this.tension.set(k, Math.min(80, (this.tension.get(k) ?? 0) + 2));
        }
      }
    };
    if (x > 0) meet(i - 1);
    if (x < W - 1) meet(i + 1);
    if (y > 0) meet(i - W);
    if (y < H - 1) meet(i + W);
  }

  // ---------------- buildings ----------------
  buildBuilding(i: number, kind: number, civId: number) {
    if (this.building[i] > 0) return;
    const b: Building = { i, x: i % W, y: (i / W) | 0, kind, civ: civId };
    this.buildings.push(b);
    this.bIdx.set(i, this.buildings.length - 1);
    this.building[i] = kind;
    // 科技工程加成：石匠/城墙等提升建筑耐久（新建筑按当前科技入帐）
    this.bHp.set(i, Math.round((BUILDING_DEFS[kind]?.hp ?? 70) * this.techModsOf(civId).bhp));
    this.damagedSet.delete(i);
    const civ = this.civs[civId];
    if (civ && kind !== BUILD_KINDS.WALL) civ.houses++; // 城墙不计入住宅（不虚增人口容量）
    // 深度打磨：建筑落成即连路（村庄脉络自然生长；首都/首栋为路网根节点）——城墙不铺路
    if (kind !== BUILD_KINDS.WALL) this.connectRoad(i, civId);
  }

  /** 城墙圈（城防体系）：有 fortification 科技的王国环绕首都修一圈城墙（半径 3-5 格按城市规模）。
   *  每次 wallTick 分批补砌 ≤3 段（金库出账）；海岸/山体豁口天然留门。 */
  wallTick() {
    const cost = BUILDING_DEFS[BUILD_KINDS.WALL]?.cost ?? 2;
    for (const civ of this.civs) {
      if (!civ.alive || civ.pop < 8 || civ.capital < 0) continue;
      if (!(civ.techs ?? []).includes('fortification')) continue;
      if ((civ.gold ?? 0) < cost) continue;
      const cx = this.tileX(civ.capital);
      const cy = this.tileY(civ.capital);
      const radius = Math.min(5, 3 + Math.floor(civ.houses / 14)); // 半径 3-5 随城市规模
      const gaps: number[] = [];
      for (let k = 0; k < 72; k++) {
        const ang = (k / 72) * Math.PI * 2;
        const xx = Math.round(cx + Math.cos(ang) * radius);
        const yy = Math.round(cy + Math.sin(ang) * radius);
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        const i = idx(xx, yy);
        if (this.building[i] > 0) continue; // 已有墙/建筑占位
        if (this.owner[i] !== civ.id) continue; // 只在己方领土砌
        const tt = this.terrain[i];
        if (!buildable(tt) || tt === T.FOREST) continue; // 城墙立于实土（buildable 已排除沼泽/水域）
        gaps.push(i);
      }
      // 圈完整（缺口 ≤3：海岸与山体豁口留作城门）则不再砌
      if (gaps.length === 0 || gaps.length <= 3) continue;
      let built = 0;
      for (const i of gaps) {
        if (built >= 3) break;
        if ((civ.gold ?? 0) < cost) break;
        this.buildBuilding(i, BUILD_KINDS.WALL, civ.id);
        civ.gold = (civ.gold ?? 0) - cost;
        built++;
      }
      if (built > 0 && this.fxPrefs.ambience) {
        const b0 = this.buildings[this.bIdx.get(gaps[0]) ?? -1];
        if (b0) this.fx('hammer', b0.x + 0.5, b0.y + 0.5, 14);
      }
    }
  }

  /** 守军城墙防御加成：单位（同格或邻格）有己方城墙 → 受击减伤（castle战/围城战守方优势） */
  wallDefenseOf(u: Unit): number {
    if (u.civ < 0) return 1;
    const x = Math.floor(u.x);
    const y = Math.floor(u.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = idx(xx, yy);
        if (this.building[i] !== BUILD_KINDS.WALL) continue;
        const b = this.buildings[this.bIdx.get(i) ?? -1];
        if (b && b.civ === u.civ) return 0.72; // 借墙而战：伤害减免 28%
      }
    }
    return 1;
  }

  // ---------------- 道路网络（深度打磨：村庄脉络） ----------------
  /** A* 寻路（8 向；避水/山/岩浆；曼哈顿启发 + 二叉小顶堆；节点预算上限）。
   *  返回含起终点的 tile 路径，不可达/超预算返回 null */
  findPath(from: number, to: number, budget = 4000): number[] | null {
    if (from === to) return [from];
    const tx = to % W;
    const ty = (to / W) | 0;
    const g = new Map<number, number>([[from, 0]]);
    const prev = new Map<number, number>([[from, -1]]);
    // 二叉小顶堆（平行数组：f 值 / 节点）
    const hf: number[] = [Math.abs(tx - (from % W)) + Math.abs(ty - ((from / W) | 0))];
    const hn: number[] = [from];
    const push = (f: number, n: number) => {
      hf.push(f); hn.push(n);
      let i = hf.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hf[p] <= hf[i]) break;
        const tf = hf[p]; hf[p] = hf[i]; hf[i] = tf;
        const tn = hn[p]; hn[p] = hn[i]; hn[i] = tn;
        i = p;
      }
    };
    let expanded = 0;
    while (hn.length > 0 && expanded < budget) {
      // pop min
      const cur = hn[0];
      const lf = hf.pop()!;
      const ln = hn.pop()!;
      if (hf.length > 0) {
        hf[0] = lf; hn[0] = ln;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let m = i;
          if (l < hf.length && hf[l] < hf[m]) m = l;
          if (r < hf.length && hf[r] < hf[m]) m = r;
          if (m === i) break;
          const tf = hf[m]; hf[m] = hf[i]; hf[i] = tf;
          const tn = hn[m]; hn[m] = hn[i]; hn[i] = tn;
          i = m;
        }
      }
      if (cur === to) {
        const path: number[] = [];
        let p = cur;
        while (p !== -1) { path.push(p); p = prev.get(p)!; }
        return path.reverse();
      }
      expanded++;
      const cg = g.get(cur)!;
      const cx = cur % W;
      const cy = (cur / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          const t = this.terrain[j];
          if (t === T.DEEP || t === T.WATER || t === T.MOUNTAIN || t === T.LAVA) continue;
          const ng = cg + 1;
          const og = g.get(j);
          if (og !== undefined && og <= ng) continue;
          g.set(j, ng);
          prev.set(j, cur);
          push(ng + Math.abs(tx - xx) + Math.abs(ty - yy), j);
        }
      }
    }
    return null;
  }

  /** 建筑落成后连路：BFS 到最近的「已通路建筑或首都」，沿路径铺土路 */
  connectRoad(i: number, civId: number) {
    const x = i % W;
    const y = (i / W) | 0;
    // 目标：同文明已通路建筑或首都（就近）
    let best: number | null = null;
    let bestD = Infinity;
    for (const o of this.buildings) {
      if (o.civ !== civId || o.i === i) continue;
      if (o.kind !== BUILD_KINDS.CAPITAL && this.road[o.i] === 0) continue;
      const d = Math.abs(o.x - x) + Math.abs(o.y - y);
      if (d > 0 && d < bestD) { bestD = d; best = o.i; }
    }
    if (best == null) return;
    const path = this.findPath(i, best, 800);
    if (!path) return;
    let laid = 0;
    for (const p of path) {
      if (this.road[p] === 0) {
        this.road[p] = 1;
        this.dirty.add(p);
        this.propsDirty.add(p);
        laid++;
      }
    }
    if (laid > 3 && this.rng() < 0.1) {
      const civ = this.civs[civId];
      if (civ) this.addEvent('road', `「${civ.name}」修筑道路，疆域脉络渐成`, { colorHex: civ.colorHex, x, y });
    }
  }

  destroyBuilding(i: number) {
    const bi = this.bIdx.get(i);
    if (bi === undefined) return;
    const b = this.buildings[bi];
    const civ = this.civs[b.civ];
    if (civ) {
      civ.houses--;
      if (b.kind === BUILD_KINDS.CAPITAL) civ.capital = -1;
    }
    const last = this.buildings.pop()!;
    if (bi < this.buildings.length) {
      this.buildings[bi] = last;
      this.bIdx.set(last.i, bi);
    }
    this.bIdx.delete(i);
    this.building[i] = 0;
    this.bHp.delete(i);
    this.damagedSet.delete(i);
    this.fx('smoke', b.x, b.y, 36, { r: 1.5 });
  }

  /** 建筑选址：领土内随机采样，按类别约束（港口需邻水/农田允许密排） */
  tryBuildBuilding(civ: Civ, kind: number): boolean {
    const needWater = kind === BUILD_KINDS.PORT;
    const spacing = kind === BUILD_KINDS.FARM ? 2 : 3;
    for (let attempt = 0; attempt < 24; attempt++) {
      if (civ.tiles.length === 0) return false;
      const i = civ.tiles[Math.floor(this.rng() * civ.tiles.length)];
      if (this.owner[i] !== civ.id) continue;
      if (!buildable(this.terrain[i]) || this.building[i] > 0) continue;
      const x = i % W;
      const y = (i / W) | 0;
      if (needWater) {
        // 港口：周边 2 格内须有海面
        let nearSea = false;
        for (let dy = -2; dy <= 2 && !nearSea; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            if (isWater(this.terrain[idx(xx, yy)])) { nearSea = true; break; }
          }
        }
        if (!nearSea) continue;
      }
      // spacing from other buildings
      let ok = true;
      for (const b of this.buildings) {
        if (b.civ !== civ.id) continue;
        if (Math.abs(b.x - x) < spacing && Math.abs(b.y - y) < spacing) { ok = false; break; }
      }
      if (!ok) continue;
      this.buildBuilding(i, kind, civ.id);
      this.fx('smoke', x, y, 26, { r: 1 });
      // 高阶建筑落成播报（城堡/神殿/图书馆/港口）
      if (kind === BUILD_KINDS.CASTLE || kind === BUILD_KINDS.TEMPLE || kind === BUILD_KINDS.LIBRARY || kind === BUILD_KINDS.PORT) {
        this.addEvent('build', `「${civ.name}」建成${BUILDING_DEFS[kind].name}，国力日盛`, { colorHex: civ.colorHex, x, y });
      }
      return true;
    }
    return false;
  }

  /** 旧接口兼容：默认住宅 / 塔 */
  tryBuildHouse(civ: Civ, tower = false): boolean {
    return this.tryBuildBuilding(civ, tower ? BUILD_KINDS.TOWER : BUILD_KINDS.HOUSE);
  }

  /** 王国人口容量：住宅 + 王都 + 农田（各类建筑 popCap 求和；住宅容量随房屋阶位提升：4→5→6→7） */
  popCapOf(civ: Civ): number {
    const bonus = this.houseTierOf(civ);
    const counts = this.civBuildCounts.get(civ.id);
    if (!counts) return civ.houses * (HOUSE_CAP + bonus);
    let cap = 0;
    for (let k = 1; k < BUILDING_DEFS.length; k++) {
      const pc = BUILDING_DEFS[k].popCap ?? 0;
      if (pc > 0 && counts[k]) cap += (pc + (k === BUILD_KINDS.HOUSE ? bonus : 0)) * counts[k];
    }
    return cap;
  }

  /** 某文明当前是否与任一在世文明交战 */
  civAtWar(civId: number): boolean {
    for (const o of this.civs) {
      if (o.alive && o.id !== civId && this.atWar(civId, o.id)) return true;
    }
    return false;
  }

  /** 重建各文明建筑分类计数（civsTick 每 5 tick 调一次） */
  rebuildCivBuildCounts() {
    this.civBuildCounts.clear();
    this.marketIdx.clear();
    for (const b of this.buildings) {
      let arr = this.civBuildCounts.get(b.civ);
      if (!arr) { arr = new Array(BUILDING_DEFS.length).fill(0); this.civBuildCounts.set(b.civ, arr); }
      arr[b.kind]++;
      if (b.kind === BUILD_KINDS.MARKET && !this.marketIdx.has(b.civ)) this.marketIdx.set(b.civ, b.i);
    }
  }

  // ---------------- diplomacy ----------------
  diplomacyMeet(a: number, b: number) {
    const key = pairKey(a, b);
    if (this.met.has(key)) return;
    this.met.add(key);
    // 战争法则关闭：外交接触永远是和平的（旧战争由 warTick 加速停火）
    // 宣战倾向由社会体系驱动：军国主义推高 / 共和降低 / 帝国膨胀
    const ca = this.civs[a];
    const cb = this.civs[b];
    const ra = RACES[ca.race];
    const rb = RACES[cb.race];
    // —— 种族系统 v2：种族外交底色（兽人难交朋友，人类八面玲珑）——
    const raceDiplo = ((ra?.diplo ?? 0.5) + (rb?.diplo ?? 0.5)) / 2; // 0-1
    const warChance = Math.max(0.08, Math.min(0.8, 0.2 + ((ca.militarism ?? 30) + (cb.militarism ?? 30)) / 400 + ((ca.gov === 4 || cb.gov === 4) ? 0.1 : 0) - ((ca.gov === 3 || cb.gov === 3) ? 0.12 : 0) - (raceDiplo - 0.5) * 0.3));
    if (this.laws.wars && this.rng() < warChance) {
      // 战争必须有名有实：按社会气质/复仇记忆/实力对比挑选开战理由
      const pick = this.pickCasus(ca, cb);
      this.declareWar(pick.aggressor.id, pick.victim.id, pick.reason);
    } else {
      // —— 种族关系：首次接触的印象由种族底色决定（精灵与兽人初见即怀敌意）——
      const rr = this.raceRelOf(ca.race, cb.race);
      this.rel.set(key, Math.max(-10, Math.min(45, 20 + rr / 3)));
    }
  }

  atWar(a: number, b: number): boolean {
    const v = this.rel.get(pairKey(a, b));
    return v !== undefined && v < -20;
  }

  /** 野生物种对敌意 LUT（Task 42-a）：双方均无文明归属时 isEnemy 结果只由种族对决定
   *  （种族定义静态、dynRaces 只增不改 → 缓存永不过期）；桶扫描每 tick 数千次调用的大头 */
  private enemyLut = new Map<number, boolean>();

  /** isEnemy 快速通道（updateUnit 桶扫描专用）：野生 vs 野生命中 LUT，其余回退原判定 */
  isEnemyFast(a: Unit, b: Unit): boolean {
    if (a.civ < 0 && b.civ < 0) {
      const key = a.race * 65536 + b.race;
      const hit = this.enemyLut.get(key);
      if (hit !== undefined) return hit;
      const v = this.isEnemy(a, b);
      this.enemyLut.set(key, v);
      return v;
    }
    return this.isEnemy(a, b);
  }

  isEnemy(a: Unit, b: Unit): boolean {
    if (a === b) return false;
    const ra = RACES[a.race];
    const rb = RACES[b.race];
    // —— 亡者阵营：骷髅/僵尸/白行者/吸血鬼互不为敌，并肩作战争夺生者的世界 ——
    if (ra.undead && rb.undead) return false;
    // 天使（R.ANGEL=28）/ 凤凰（R.PHOENIX=29）/ 树人（R.ENT=30）无需专门分支：恶魔/亡灵五族/巨龙/克拉肯/沙虫/蛇怪的
    // 「与众生为敌」分支对称覆盖三者（双侧为敌 = 圣剑/焰爪/枝干重击自动出鞘）；对无辜者
    // 由全零旗标自然放行 —— 与 wasm is_enemy_full（rust-core lib.rs）逐位一致。
    // 巫妖（R.LICH=31）走 hostile+undead 既有亡灵逻辑（与骷髅同构），亦无需专门分支。
    // 九头蛇（R.HYDRA=32）走 hostile+predator 既有猎杀逻辑（与蛇怪同构），亦无需专门分支。
    // ⚠️ 若在此新增天使/凤凰/树人/巫妖/九头蛇特判，必须同步 rust-core/src/lib.rs 并重建 wbcore.wasm。
    if (a.race === R.ZOMBIE || b.race === R.ZOMBIE) return a.race !== b.race;
    if (a.race === R.SKELETON || b.race === R.SKELETON) return a.race !== b.race; // 亡灵与众人为敌
    if (a.race === R.WHITEWALKER || b.race === R.WHITEWALKER) return a.race !== b.race; // 寒冰之主与众生为敌
    if (a.race === R.DRAGON || b.race === R.DRAGON) return a.race !== b.race;
    if (a.race === R.DEMON || b.race === R.DEMON) return a.race !== b.race; // 恶魔烧毁一切
    if (a.race === R.KRAKEN || b.race === R.KRAKEN) return a.race !== b.race; // 深海巨怪袭击一切（含船只）
    if (a.race === R.SANDWORM || b.race === R.SANDWORM) return a.race !== b.race; // 沙虫吞噬一切
    if (a.race === R.BASILISK || b.race === R.BASILISK) return a.race !== b.race; // 蛇怪与众生为敌
    if (ra.hostile && rb.isCiv) return true;
    if (rb.hostile && ra.isCiv) return true;
    // 捕食者把食草动物（绵羊/鹿/企鹅/骆驼及其演化后裔）当作猎物
    if (ra.predator && this.isHerbivoreRace(b.race)) return true;
    if (ra.predator && a.race === R.BEAR && rb.isCiv) return true;
    // 蝎子主动袭击小型食草动物（沙漠小猎手）
    if (a.race === R.SCORPION && this.isHerbivoreRace(b.race)) return true;
    // 蛇也是沙漠猎手：猎小型食草动物与蝎子（蛇吃蝎子是沙漠生态的真实关系）
    if (a.race === R.SNAKE && (this.isHerbivoreRace(b.race) || b.race === R.SCORPION)) return true;
    // 鲨鱼：捕食鱼群（isHerbivoreRace 含鱼）与落水的游泳单位（陆行种族在水里就是猎物）
    if (a.race === R.SHARK && (b.race === R.FISH || (!rb.aquatic && !rb.flying && isWater(this.terrain[idx(Math.floor(b.x), Math.floor(b.y))])))) return true;
    if (a.civ >= 0 && b.civ >= 0 && a.civ !== b.civ) return this.atWar(a.civ, b.civ);
    return false;
  }

  /** 食草物种判定（含动态演化后裔：种化自食草母种的新物种仍被视为猎物——生态链不断裂）。
   *  v5：全新造物（无血统链）用 eco 角色锚裁决——explicit pred/neutral 不入猎物 */
  isHerbivoreRace(race: number): boolean {
    if (race === R.SHEEP || race === R.DEER || race === R.PENGUIN || race === R.CAMEL) return true;
    // 八新动物：鸡/猪/兔（陆）与鱼（水）均为猎物链底层（狐猎兔鸡、鲨猎鱼）
    if (race === R.CHICKEN || race === R.PIG || race === R.RABBIT || race === R.FISH) return true;
    const d = this.dynRaces.get(race);
    if (!d) return false;
    if (d.eco === 'herb') return true;
    if (d.eco) return false;
    return this.isHerbivoreRace(d.parent);
  }

  /** 野生动物种群上限（动态物种继承母种上限：演化后裔不会脱缰爆炸；全新造物用 cap/eco 锚） */
  wildCapOf(race: number): number {
    if (race === R.SHEEP) return 240;
    if (race === R.WOLF) return 90;
    if (race === R.DEER) return 160;
    if (race === R.PENGUIN) return 110;
    if (race === R.CAMEL) return 90;
    if (race === R.SCORPION) return 60;
    if (race === R.SNAKE) return 80;
    if (race === R.SNOWWOLF) return 70;
    // 八新动物种群上限（鸡猪兔群居快繁；鱼群最大；鲨鱼稀缺）
    if (race === R.CHICKEN) return 150;
    if (race === R.PIG) return 120;
    if (race === R.RABBIT) return 220;
    if (race === R.FOX) return 70;
    if (race === R.FISH) return 280;
    if (race === R.CRAB) return 90;
    if (race === R.TURTLE) return 90;
    // 鲨鱼稀缺（Task 98 重校准 40→16）：旧 cap 40 + 扑杀预算 ≤10/轮 = 不可持续规模 —— boom 至
    // 20+ 后食物摊薄、集体饿毙归零（吸收态），只能靠迁徙反复重播。16 头 × 0.5 food/tick = 8
    // food/tick，预算 10 杀/轮（250 food）可持续供给 —— 舰队稳定在预算可养活的规模内。
    if (race === R.SHARK) return 16;
    const d = this.dynRaces.get(race);
    if (!d) return 40;
    if (d.cap) return d.cap;
    if (d.eco === 'herb') return 140;
    if (d.eco === 'pred') return 60;
    if (d.eco === 'neutral') return 80;
    return this.wildCapOf(d.parent);
  }

  /** 捕食物种判定（含动态演化后裔：狼/熊/蛇/蝎/雪狼的种化后继仍参与捕食压力；全新造物用 eco 锚） */
  isPredatorRace(race: number): boolean {
    if (race === R.WOLF || race === R.SNOWWOLF || race === R.BEAR || race === R.SCORPION || race === R.SNAKE) return true;
    // 八新动物：狐（陆猎手）与鲨（海猎手）参与捕食压力
    if (race === R.FOX || race === R.SHARK) return true;
    const d = this.dynRaces.get(race);
    if (!d) return false;
    if (d.eco === 'pred') return true;
    if (d.eco) return false;
    return this.isPredatorRace(d.parent);
  }

  eliminateCiv(civ: Civ) {
    // 灭国归属：若亡于交战之手，纪事归于征服者（灭国战争叙事闭环）
    let conqueror: Civ | null = null;
    for (const o of this.civs) {
      if (o.alive && o.id !== civ.id && this.atWar(o.id, civ.id)) { conqueror = o; break; }
    }
    civ.alive = false;
    this.statCivsFallen++; // 成就计数：王国陨落
    this.clearFrontOf(civ.id); // 该国战线全境蒸发
    // —— 联盟除名：亡国的旗帜从盟册上撤下（凝聚力受创——盟友陨落的震动）——
    const alFall = this.allianceOfCiv(civ.id);
    if (alFall) {
      alFall.cohesion = Math.max(0, alFall.cohesion - 18);
      this.leaveAlliance(civ.id, 'fallen');
      this.addEvent('alliance', `「${civ.name}」的覆灭震动了盟邦——「${alFall.members.length >= 2 ? alFall.name : '其盟友'}」为亡者降下半旗`, { colorHex: alFall.colorHex });
    }
    // —— 终极世界大战：参战国覆灭追记（逐面旗帜倒下）——
    if (this.worldWar.phase === 'running' && this.worldWar.belligerents.includes(civ.id) && !this.worldWar.fallen.some((f) => f.id === civ.id)) {
      this.worldWar.fallen.push({ id: civ.id, name: civ.name, colorHex: civ.colorHex });
      const remain = this.worldWar.belligerents.length - this.worldWar.fallen.length;
      this.addEvent('worldwar', `「${civ.name}」退出终极世界大战——还剩 ${remain} 面旗帜在战场上飘扬`, { colorHex: civ.colorHex });
    }
    // —— 军团随之覆灭（静默解散）——
    for (const a of [...this.armies]) if (a.civ === civ.id) this.disbandArmy(a, true);
    // —— 战争档案清理 ——
    for (const key of [...this.warData.keys()]) {
      const dash = key.indexOf('-');
      const x = +key.slice(0, dash);
      const y = +key.slice(dash + 1);
      if (x === civ.id || y === civ.id) this.warData.delete(key);
    }
    // —— 旨意结算：以该国为目标的灭国/攻城令 → 颁布方成功；该国的旨意 → 失败 ——
    for (const d of this.directives) {
      if (d.status !== 'active') continue;
      if (d.civ === civ.id) this.finishDirective(d, 'failed', `「${civ.name}」覆灭，宏图化为泡影`);
      else if ((d.kind === 'annihilate' || d.kind === 'conquer') && d.target === civ.id) this.finishDirective(d, 'success', `目标「${civ.name}」已被抹去`);
    }
    for (const i of civ.tiles) {
      if (this.owner[i] === civ.id) {
        this.owner[i] = -1;
        this.markDirty(i);
      }
    }
    civ.tiles = [];
    civ.frontier = [];
    for (const b of [...this.buildings]) {
      if (b.civ === civ.id) this.destroyBuilding(b.i);
    }
    // 清理该文明的外交残留（否则 warsCount 统计与关系矩阵会永远计入亡国）
    for (const key of [...this.rel.keys()]) {
      const [a, b] = key.split('-').map(Number);
      if (a === civ.id || b === civ.id) { this.rel.delete(key); this.totalWars.delete(key); }
    }
    for (const key of [...this.met]) {
      const [a, b] = key.split('-').map(Number);
      if (a === civ.id || b === civ.id) this.met.delete(key);
    }
    this.toast(`「${civ.name}」覆灭了`, 'danger');
    if (conqueror) {
      this.addEvent('fall', `「${civ.name}」（${RACES[civ.race].name}）被「${conqueror.name}」彻底征服，旗帜倒下，国土并入征服者的版图`, { colorHex: conqueror.colorHex });
    } else {
      this.addEvent('fall', `「${civ.name}」（${RACES[civ.race].name}）的旗帜倒下了，国土化为无主之地`, { colorHex: civ.colorHex });
    }
    if (this.overlayMode === 'political' || this.overlayMode === 'alliance') this.overlayDirty = true;
  }

  // ================== 超级演化 v4：王国融合（Dynastic Union） ==================

  /**
   * 王国融合（超级演化 v4）：两个深度盟邦和平合并为联合王朝 ——
   *  领土/建筑/军团/单位/国库/科技全量和平转移（区别于征服的暴力易主）
   *  存活方 = 综合国力更强者；联合国名 = 双方名首字组合（≤10 字）
   *  @param cause natural = 深盟自然融合（低频 tick）；oracle = 神谕钦定 */
  mergeCivs(a: Civ, b: Civ, cause: 'natural' | 'oracle' = 'natural'): Civ | null {
    if (!a.alive || !b.alive || a.id === b.id) return null;
    const power = (c: Civ) => c.pop * 2 + (c.gold ?? 0) * 0.6 + this.armies.filter((x) => x.civ === c.id).length * 30 + c.tiles.length;
    const keep = power(a) >= power(b) ? a : b;
    const gone = keep === a ? b : a;
    // —— 和平转移（顺序重要：先转资产，再清战争/外交，最后关账）——
    const newTiles: number[] = [];
    for (const i of gone.tiles) {
      if (this.owner[i] === gone.id) {
        this.owner[i] = keep.id;
        newTiles.push(i);
        this.markDirty(i);
      }
    }
    keep.tiles.push(...newTiles);
    gone.tiles = [];
    gone.frontier = [];
    for (const bd of this.buildings) {
      if (bd.civ === gone.id) {
        bd.civ = keep.id;
        if (bd.kind === 1) keep.houses++; // 住宅计数随资产转移
      }
    }
    for (const u of this.units) {
      if (!u.dead && u.civ === gone.id) u.civ = keep.id;
    }
    WBB.touchMeta(); // Stage 3：civ 列 JS 写点收口（王国融合的全民改籍）
    const keepArmies = this.armies.filter((x) => x.civ === keep.id).length;
    let mergedArmies = 0;
    for (const ar of [...this.armies]) {
      if (ar.civ !== gone.id) continue;
      if (keepArmies + mergedArmies < 4) {
        ar.civ = keep.id; // 军团整编：联合王朝旗号
        mergedArmies++;
      } else {
        this.disbandArmy(ar, true); // 超编则荣散（士兵归田）
      }
    }
    // 国库/知识/科技合并（科技并集 —— 融合的红利）
    keep.gold = (keep.gold ?? 0) + (gone.gold ?? 0);
    keep.knowledge = (keep.knowledge ?? 0) + (gone.knowledge ?? 0);
    const techs = new Set(keep.techs ?? []);
    for (const t of gone.techs ?? []) techs.add(t);
    keep.techs = [...techs];
    keep.pop = keep.pop + gone.pop;
    // —— 战争清理：融合国的战争档案全数和平落幕（联合王朝不继承旧仇）——
    for (const key of [...this.warData.keys()]) {
      const dash = key.indexOf('-');
      const x = +key.slice(0, dash);
      const y = +key.slice(dash + 1);
      if (x === gone.id || y === gone.id) this.warData.delete(key);
    }
    for (const key of [...this.rel.keys()]) {
      const [x, y] = key.split('-').map(Number);
      if (x !== gone.id && y !== gone.id) continue;
      const other = x === gone.id ? y : x;
      if (other === keep.id) { this.rel.delete(key); this.totalWars.delete(key); continue; }
      // 对第三方关系由联合王朝继承（无则采纳 / 有则取优）
      const nk = pairKey(keep.id, other);
      if (!this.rel.has(nk)) this.rel.set(nk, this.rel.get(key) ?? 0);
      this.rel.delete(key);
    }
    for (const key of [...this.met.keys()]) {
      const [x, y] = key.split('-').map(Number);
      if (x === gone.id || y === gone.id) {
        const other = x === gone.id ? y : x;
        if (other !== keep.id) this.met.add(pairKey(keep.id, other));
        this.met.delete(key);
      }
    }
    // 旨意结算：融合方的宏图失败（由联合王朝继承精神）；针对融合方的灭国令成功
    for (const d of this.directives) {
      if (d.status !== 'active') continue;
      if (d.civ === gone.id) this.finishDirective(d, 'failed', `「${gone.name}」并入「${keep.name}」，宏图由联合王朝继承`);
      else if ((d.kind === 'annihilate' || d.kind === 'conquer') && d.target === gone.id) this.finishDirective(d, 'success', `目标「${gone.name}」已成为联合王朝的一部分`);
    }
    // 联盟除名（keep 留任）
    this.leaveAlliance(gone.id, 'fallen');
    // 世界大战参战资格：融合方席位由联合王朝继承
    if (this.worldWar.phase === 'running' && this.worldWar.belligerents.includes(gone.id)) {
      const bi = this.worldWar.belligerents.indexOf(gone.id);
      if (!this.worldWar.belligerents.includes(keep.id)) this.worldWar.belligerents[bi] = keep.id;
      else this.worldWar.belligerents.splice(bi, 1);
    }
    this.clearFrontOf(gone.id); // 融合方战线蒸发（领土已易主，keep 的前线 tick 自会重建）
    // —— 关账：alive=false + mergedInto 标记（区别于灭亡：不增加 fallen 计数）——
    gone.alive = false;
    gone.mergedInto = keep.id;
    // —— 联合国名（双名和 ≤8 字用全名；否则各取前 3 字；总长 ≤14）——
    const stem = keep.name.length + gone.name.length <= 8 ? `${keep.name}·${gone.name}` : `${keep.name.slice(0, 3)}·${gone.name.slice(0, 3)}`;
    const newName = `${stem}联合王朝`.slice(0, 14);
    const oldKeepName = keep.name;
    keep.name = newName;
    // —— 图谱 + 纪事 ——
    this.recordEvo('society', newName, null, keep.colorHex,
      `王国融合${cause === 'oracle' ? '（神谕钦定）' : '（深盟自然融合）'}——「${oldKeepName}」与「${gone.name}」和平合并：领土 ${newTiles.length} 格 / 人口 ${gone.pop} / 军团 ${mergedArmies} 全量继承`,
      `人口 ${keep.pop}·领土 ${keep.tiles.length}`, { civ: keep.id, mergedFrom: gone.id, tiles: newTiles.length, pop: gone.pop });
    this.addEvent('alliance', `王座合璧——「${oldKeepName}」与「${gone.name}」${cause === 'oracle' ? '奉神谕' : '历经数十年深盟'}和平合并为「${newName}」（领土 ${newTiles.length} 格、军团 ${mergedArmies} 支、科技并集全数继承，列国为之侧目）`, { colorHex: keep.colorHex });
    this.toast(`「${oldKeepName}」与「${gone.name}」合并为「${newName}」`, 'good');
    if (this.overlayMode === 'political' || this.overlayMode === 'alliance') this.overlayDirty = true;
    return keep;
  }

  /** 深盟融合扫描（超级演化 v4，civsTick 每 300 tick 错峰 5 触发）：
   *  高凝聚力联盟（≥ 70）+ 成立 ≥ 36 年 + 成员均非交战态 → 10% 概率和平合并（每轮最多一国） */
  civFuseScan() {
    if (this.tickCount % 300 !== 5) return;
    const now = this.tickCount;
    for (const al of this.alliances) {
      if (al.cohesion < 70 || al.members.length < 2) continue;
      if (now - al.formedTick < 1440) continue; // 成立未满 36 年（1 年 = 40 tick）
      const alive = al.members.map((m) => this.civs[m]).filter((c) => c?.alive && c.pop >= 20);
      if (alive.length < 2) continue;
      // 候选对：两两非交战（同盟内部本就无战）
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const a = alive[i];
          const b = alive[j];
          if (this.atWar(a.id, b.id)) continue;
          if (this.rng() > 0.1) continue;
          if (this.mergeCivs(a, b, 'natural')) return; // 每轮最多一次合并（防天下大势一夜巨变）
        }
      }
    }
  }

  /** 重绘地图覆盖层（政治版图/温度/湿度/人口密度）到离屏画布；render 每帧检查 overlayDirty */
  redrawOverlay() {
    const oc = this.overlayCtx;
    oc.clearRect(0, 0, W * 4, H * 4);
    const mode = this.overlayMode;
    if (mode === 'political') {
      for (let i = 0; i < W * H; i++) {
        const o = this.owner[i];
        if (o < 0) continue;
        const civ = this.civs[o];
        if (!civ || !civ.alive) continue;
        const x = i % W;
        const y = (i / W) | 0;
        const px = x * 4;
        const py = y * 4;
        oc.fillStyle = civ.colorHex;
        oc.fillRect(px, py, 4, 4);
        // 国界描边：与邻格归属不同处画黑边（比日常领土淡染更醒目的"版图"观感）
        const x2 = x < W - 1 && this.owner[i + 1] !== o;
        const y2 = y < H - 1 && this.owner[i + W] !== o;
        if (x > 0 && this.owner[i - 1] !== o) { oc.fillStyle = '#09090b'; oc.fillRect(px, py, 2, 4); oc.fillStyle = civ.colorHex; }
        if (x2) { oc.fillStyle = '#09090b'; oc.fillRect(px + 2, py, 2, 4); oc.fillStyle = civ.colorHex; }
        if (y > 0 && this.owner[i - W] !== o) { oc.fillStyle = '#09090b'; oc.fillRect(px, py, 4, 2); oc.fillStyle = civ.colorHex; }
        if (y2) { oc.fillStyle = '#09090b'; oc.fillRect(px, py + 2, 4, 2); oc.fillStyle = civ.colorHex; }
      }
    } else if (mode === 'alliance') {
      // —— 联盟势力版图：成员领土着联盟色（阵营一目了然），无盟国灰暗，阵营间/无盟国间画黑界 ——
      const alColor = new Map<number, string>();
      for (const al of this.alliances) alColor.set(al.id, al.colorHex);
      const groupId = (o: number) => this.allianceOf.get(o) ?? -(o + 1) * 1001;
      for (let i = 0; i < W * H; i++) {
        const o = this.owner[i];
        if (o < 0) continue;
        const civ = this.civs[o];
        if (!civ || !civ.alive) continue;
        const x = i % W;
        const y = (i / W) | 0;
        const px = x * 4;
        const py = y * 4;
        const alId = this.allianceOf.get(o);
        const fill = alId != null ? (alColor.get(alId) ?? '#71717a') : '#52525b';
        oc.fillStyle = fill;
        oc.fillRect(px, py, 4, 4);
        // 阵营边界：相邻格归属不同阵营（或不同无盟国）时画黑边
        const g = groupId(o);
        const gn = (j: number) => {
          const o2 = this.owner[j];
          if (o2 < 0 || !this.civs[o2]?.alive) return g;
          return groupId(o2);
        };
        if (x > 0 && gn(i - 1) !== g) { oc.fillStyle = '#09090b'; oc.fillRect(px, py, 2, 4); oc.fillStyle = fill; }
        if (x < W - 1 && gn(i + 1) !== g) { oc.fillStyle = '#09090b'; oc.fillRect(px + 2, py, 2, 4); oc.fillStyle = fill; }
        if (y > 0 && gn(i - W) !== g) { oc.fillStyle = '#09090b'; oc.fillRect(px, py, 4, 2); oc.fillStyle = fill; }
        if (y < H - 1 && gn(i + W) !== g) { oc.fillStyle = '#09090b'; oc.fillRect(px, py + 2, 4, 2); oc.fillStyle = fill; }
      }
    } else if (mode === 'density') {
      // 人口密度热力图：按 4x4 tile 分桶统计在世单位，五档色带（稀→密）
      // 海洋不绘制（保持深蓝原样）→ 密度与"陆地承载"对齐，读图更直觉
      const counts = this.densityGrid;
      counts.fill(0);
      for (const u of this.units) {
        if (u.dead) continue;
        const bx = Math.min(this.bw - 1, Math.max(0, (u.x / 4) | 0));
        const by = Math.min(this.bh - 1, Math.max(0, (u.y / 4) | 0));
        counts[by * this.bw + bx]++;
      }
      const ramp = ['#1d4e89', '#2e86ab', '#7fb069', '#f2c14e', '#d64530'];
      for (let by = 0; by < this.bh; by++) {
        for (let bx = 0; bx < this.bw; bx++) {
          const n = counts[by * this.bw + bx];
          if (n === 0) continue;
          // 有单位的桶必然是陆地/海岸 → 直接绘制；0 桶跳过（海面干净）
          const band = n <= 1 ? 0 : n <= 3 ? 1 : n <= 7 ? 2 : n <= 14 ? 3 : 4;
          oc.fillStyle = ramp[band];
          oc.fillRect(bx * 16, by * 16, 16, 16);
        }
      }
    } else if (mode === 'biome') {
      // 生物群落分布图：温度 × 湿度 六群落（冰原/苔原/针叶林/草原/沙漠/雨林）
      // 山地/岩浆/焦土按地形覆盖（雪峰青灰/熔岩黑红/焦土褐黑）；海洋按深浅分染
      for (let i = 0; i < W * H; i++) {
        const t = this.terrain[i];
        const px = (i % W) * 2;
        const py = ((i / W) | 0) * 2;
        let col: string;
        if (t === T.DEEP) col = '#16324f';
        else if (t === T.WATER) col = '#2d6a8f';
        else if (t === T.MOUNTAIN) col = '#8a8f98';
        else if (t === T.LAVA) col = '#7a1f14';
        else if (t === T.BURNT) col = '#4a3b2f';
        else {
          // 陆地生物群落：温度（寒/温/热）× 湿度（干/湿）→ 六色可读矩阵（深时引擎：动态温度场）
          const cold = this.worldsim.tempOverlay[i] < 90;
          const hot = this.worldsim.tempOverlay[i] >= 165;
          const wet = this.moistMap[i] >= 128;
          if (cold && !wet) col = '#dce8f2';            // 冰原（寒+干）
          else if (cold && wet) col = '#9db8c9';          // 苔原（寒+湿）
          else if (hot && !wet) col = '#e3c17a';          // 沙漠（热+干）
          else if (hot && wet) col = '#3f9d4f';           // 雨林（热+湿）
          else if (wet) col = '#2f7d4a';                  // 针叶林/密林（温+湿）
          else col = '#a8c56a';                           // 草原（温+干）
        }
        oc.fillStyle = col;
        oc.fillRect(px, py, 4, 4);
      }
    } else {
      // 温度/湿度：五档色带，只染陆地（海洋保持原样以区分"无效区"）
      const isTemp = mode === 'temperature';
      const ramp = isTemp
        ? ['#4a7fd6', '#7db8e0', '#e0c050', '#e07830', '#d04030'] // 寒 → 热
        : ['#d6b878', '#b0a860', '#80a060', '#50a090', '#3878c0']; // 干 → 湿
      const src = isTemp ? this.worldsim.tempOverlay : this.moistMap; // 深时引擎：温度覆盖层改为动态场
      oc.fillStyle = isTemp ? 'rgba(20,40,70,0.35)' : 'rgba(60,50,30,0.35)';
      oc.fillRect(0, 0, W * 4, H * 4); // 海面统一暗染
      for (let i = 0; i < W * H; i++) {
        const t = this.terrain[i];
        if (t === T.DEEP || t === T.WATER) continue;
        const band = Math.min(4, Math.floor(src[i] / 52));
        oc.fillStyle = ramp[band];
        oc.fillRect((i % W) * 4, ((i / W) | 0) * 4, 4, 4);
      }
    }
    this.overlayDirty = false;
  }

  // ---------------- main tick ----------------
  /** 分段剖析（EMA ms）：snap=插值快照 fire=火焰 buckets=空间桶 units=单位模拟(含收尸) effects=特效 low=低频摊销 */
  prof = { snap: 0, fire: 0, buckets: 0, units: 0, effects: 0, low: 0 };
  tick() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.tickCount++;
    // 渲染插值快照：记录本 tick 起始位置 → 渲染帧在 lx→x 间插值（WorldBox 式丝滑移动）
    const tS = t0;
    for (const u of this.units) {
      u.lx = u.x;
      u.ly = u.y;
    }
    // 军旗插值快照（Task 48-B3）：行军发生在 civsTick（每 5 tick），帧间以 lax→x 插值补滑
    for (const a of this.armies) {
      a.lax = a.x;
      a.lay = a.y;
    }
    this.yearF += 1 / YEAR_TICKS;
    const tA = performance.now();
    this.fireTick();
    const tB = performance.now();
    this.rebuildBuckets();
    const tC = performance.now();
    this.unitsTick();
    const tD = performance.now();
    // —— 涌现社会内核：恐慌雪崩监测（每 60 tick ≈ 1.5 年采样：峰值统计 + 雪崩事件） ——
    if (this.tickCount % 60 === 0) this.panicTick();
    if (this.panicNoteCd > 0) this.panicNoteCd--;
    if (this.tickCount % 5 === 0) { this.rebuildCivBuildCounts(); this.civsTick(); }
    const tM = performance.now();
    this.effectsTick();
    const tE = performance.now();
    // 密度热力图：单位会移动，每 30 tick（2 年）刷新一次覆盖层
    if (this.overlayMode === 'density' && this.tickCount % 30 === 0) this.overlayDirty = true;
    if (this.tickCount % 30 === 0) this.radTick();
    if (this.tickCount % 30 === 0) this.frontTick(); // 动态战线周期结算（衰减/反攻/收复）
    // 深度文明系统：经济（集市/图书馆产出）→ 防御建筑（箭塔/城堡射击）→ 神殿治疗 → 兵营训练
    if (this.tickCount % 120 === 0) this.economyTick();
    // 深度打磨：国际贸易（每年一次的市场驱动商队调度）
    if (this.tickCount % 40 === 0) this.tradeTick();
    if (this.tickCount % 10 === 0) this.defenseTick();
    if (this.tickCount % 120 === 0) this.templeTick();
    if (this.tickCount % 200 === 0) this.barracksTick();
    // 世界法则驱动的周期事件：强盗袭击（22.5 年）/ 巨龙降临（75 年）
    if (this.tickCount % 900 === 0) this.banditRaidTick();
    if (this.tickCount % 3000 === 0) this.dragonSpawnTick();
    if (this.tickCount % 60 === 0) { this.regrowTick(); this.statsTick(); }
    // 事件触发器评估（每 8 tick ≈ 0.2 年：条件响应及时且开销可忽略）
    if (this.tickCount % 8 === 0) this.checkTriggers();
    // 原子级 decals：血迹/尸骸老化淡出（每 2 tick）
    if (this.tickCount % 2 === 0) this.decalsTick();
    // Task 48-B1：脚印采样（每 2 tick；确定性条件零 RNG —— 位等安全）
    if (this.tickCount % 2 === 0) this.fpTick();
    // 冰面生态：消融（火/岩浆/暖气候）+ 极地自然冻结 + 海啸洪水退潮 + 湿沙干透（每 40 tick）
    if (this.tickCount % 40 === 0) this.iceTick();
    // 冬季雪人（Task 104）：村民雪地堆雪人 / 出冬渐融（每 80 tick，与 iceTick 错峰）
    if (this.tickCount % 80 === 16) this.snowmanTick();
    if (this.tickCount % 200 === 0) this.historyTick();
    if (this.tickCount % 150 === 0) this.victoryTick();
    if (this.tickCount % 200 === 0) this.warTick();
    // —— 终极世界大战：终局判定 / 停战到期重启战端 / 战端重燃 / 现代武器部署（每 30 tick） ——
    if (this.tickCount % 30 === 0) this.worldWarTick();
    // —— 军团方阵体系：状态机每 5 tick 推进（集结/行军/会战/围城/溃退）——
    if (this.tickCount % 5 === 0) this.armyTick();
    // —— 战争体系升级：战争分数结算/割地/亡乏（每 100 tick）——
    if (this.tickCount % 100 === 0) this.warInfoTick();
    // —— 文明旨意：进度评估/成功/失败（每 30 tick）——
    if (this.tickCount % 30 === 0) this.directiveTick();
    // —— 科技研发：选题/投入/完成（每 120 tick，与经济错峰）——
    if (this.tickCount % 120 === 5) this.techTick();
    // —— 社会体系：稳定度/文化/军国主义/政体演变/收支（每 150 tick）——
    if (this.tickCount % 150 === 7) this.societyTick();
    // —— 联盟系统：结盟/扩员/凝聚力结算/经济互助/种族关系漂移（每 300 tick ≈ 7.5 年，与外交错峰）——
    if (this.tickCount % 300 === 23) this.allianceTick();
    // —— 军备工坊：科技军备等级 → 自动武装国民（每 240 tick）——
    if (this.tickCount % 240 === 13) this.armoryTick();
    // —— 生态竞争：植被/食草/食肉承载力与竞争性饥饿（每 120 tick）——
    if (this.tickCount % 120 === 9) this.ecoTick();
    // —— 生物进化：种群基因均值 → 棘轮推进与亚种播报（每 600 tick）——
    if (this.tickCount % 600 === 11) this.evolutionTick();
    // —— 种群历史采样：生态面板曲线数据（每 300 tick ≈ 1 年）——
    if (this.tickCount % 300 === 17) this.sampleHistory();
    // —— 成就评估：解锁新成就 + 进度缓存（每 600 tick）——
    if (this.tickCount % 600 === 19) this.achievementsTick();
    // —— 自然引擎：大气环流（每 10 tick：蒸发/平流/云雨/雨影）——
    if (this.tickCount % 10 === 3) this.nature.atmTick();
    // —— 自然引擎：风暴生命周期 + 气候型天灾（每 40 tick）——
    if (this.tickCount % 40 === 5) this.nature.stormTick();
    // 水文（每 120 tick）：丰沛降雨在山地汇流成新河（大气→地貌因果链）
    if (this.tickCount % 120 === 9) this.nature.hydroTick();
    // —— 自然引擎：季节轮转检测（每 40 tick；换季全图刷新色调）——
    if (this.tickCount % 40 === 0) this.nature.seasonCheck();
    // —— 自然引擎：板块构造（每 240 tick：应力积累/地震释放/热点增压）——
    if (this.tickCount % 240 === 21) this.nature.tectonicTick();
    // —— 自然引擎：地质演变（每 600 tick：造山/侵蚀/沉积/火山喷发/裂谷）——
    if (this.tickCount % 600 === 31) this.nature.geologyTick();
    // —— 深时引擎：洋流环流（每 120 tick：风应力+科氏 Jacobi 流函数 → 西向强化暖流）——
    if (this.tickCount % 120 === 15) this.worldsim.oceanTick();
    // —— 天使光环（引擎级通道：和平野生单位被 rust 批内核接管不经 updateUnit，
    //    治愈是纯 TS 增益无需 rust 镜像；每 3 tick 扫描，天使稀少开销可忽略）——
    if (this.tickCount % 3 === 0) this.angelAuraTick();
    // —— 凤凰涅槃（引擎级通道：灰烬倒数到点重生；spawnUnit 走常规注册+打包，与批内核无冲突）——
    if (this.phoenixAshes.length > 0) this.phoenixAshTick();
    // —— 树人播种（引擎级通道：和平野生单位被批内核接管；植树/灭火是纯地形操作无需 rust 镜像）——
    if (this.tickCount % 10 === 0) this.entGroveTick();
    // —— 巫妖死灵复生（引擎级通道：复生是「尸体→新单位」的引擎操作，与批内核战斗无冲突）——
    // 巫妖复生节律（季节 × 万物）：寒冬死潮加速（12→8 tick）——长夜与寒冬是死灵的盟友
    if (this.tickCount % (this.nature.season === 3 ? 8 : 12) === 0) this.lichRaiseTick();
    if (this.tickCount % 30 === 0) this.hydraRegenTick();
    // —— 水生搁浅整治（引擎级通道：和平单位被内核接管不经 updateUnit，救援必须在通道层）——
    this.beachedAquaticTick();
    // —— 百兽迁徙（引擎级通道：灭绝野生动物的低频回归 —— 每 600 tick ≈3.3 年掷签一支迁徙兽群）——
    if (this.tickCount % 600 === 61) this.wildlifeReboundTick();
    // —— 猎手扑杀（引擎级通道：内核捕食者追不上猎物的能量链补环 —— 每 20 tick 一轮扑杀窗口）——
    if (this.tickCount % 20 === 7) this.predatorHuntTick();
    // —— 鲨群繁衍辅助（引擎级通道：低种群地板机制 —— 肥鲨诞崽，<8 启动；内核繁衍率救不回震荡期）——
    if (this.tickCount % 240 === 13) this.sharkBreedTick();
    // —— 深时引擎：动态温度场（每 120 tick：纬度+海拔+大陆度+灰烬+洋流异常耦合）——
    if (this.tickCount % 120 === 27) this.worldsim.tempTick();
    // —— 深时引擎：冰川系统（每 240 tick：积累/消融/进退——火山冬反馈环）——
    if (this.tickCount % 240 === 33) this.worldsim.glacierTick();
    // —— 深时引擎：水力侵蚀与沉积（每 600 tick 与地质错峰：流向累加刻谷 + 泥沙成原）——
    if (this.tickCount % 600 === 41) this.worldsim.hydroTick();
    // —— 深时引擎：海平面与海岸线进退（每 600 tick：全球均温驱动，有主领土绕行）——
    if (this.tickCount % 600 === 47) this.worldsim.coastTick();
    // —— 深时引擎：群系漂移（每 600 tick：气候期望 vs 现状持续错配才迁移）——
    if (this.tickCount % 600 === 53) this.worldsim.biomeTick();
    // —— v40：Agent 法则结算（每 120 tick：神谕书写的活机制触发器×动作）——
    if (this.tickCount % 120 === 57) { WBB.touchMeta(); this.agentLaws.tick(); } // Stage 3：神谕法则可能改单位（保守收口）
    this.shake *= 0.88;
    // tick 耗时统计（EMA，开发者面板展示）+ 性能仪表（同口径镜像 simMs；500ms 窗口结算 simUps）
    if (t0) {
      this.tickMs = this.tickMs * 0.9 + (performance.now() - t0) * 0.1;
      // 分段剖析（EMA；单位：ms）—— 性能面板 / __wb.prof 实时可读
      const P = this.prof;
      P.snap = P.snap * 0.9 + (tA - tS) * 0.1;
      P.fire = P.fire * 0.9 + (tB - tA) * 0.1;
      P.buckets = P.buckets * 0.9 + (tC - tB) * 0.1;
      P.units = P.units * 0.9 + (tD - tC) * 0.1;
      P.effects = P.effects * 0.9 + (tE - tM) * 0.1;
      P.low = P.low * 0.9 + (tM - tD + performance.now() - tE) * 0.1;
      this.perf.simMs = this.tickMs;
      this._perfWinN++;
      const pw = performance.now();
      if (pw - this._perfWinT >= 500) {
        const ups = this._perfWinT > 0 ? (this._perfWinN * 1000) / (pw - this._perfWinT) : 0;
        this.perf.simUps = this.perf.simUps > 0 ? this.perf.simUps * 0.6 + ups * 0.4 : ups;
        this._perfWinT = pw;
        this._perfWinN = 0;
      }
    }
  }

  /** 文明兴衰历史采样：每 200 tick（5 年）记录各王国 [人口, 领土, 房屋]，供兴衰曲线图多维度绘制 */
  historyTick() {
    const year = Math.floor(this.yearF);
    for (const c of this.civs) {
      if (!c.alive) continue; // 灭亡王国的曲线在覆灭前最后一点截止
      const h = c.history ?? (c.history = []);
      let tiles = 0;
      for (const i of c.tiles) if (this.owner[i] === c.id) tiles++;
      const sample: number[] = [year, Math.max(0, c.pop), tiles, c.houses];
      // 去重：同一采样年份只保留最后一点（读档后 tick 回退的场景）
      if (h.length > 0 && h[h.length - 1][0] === year) h[h.length - 1] = sample;
      else h.push(sample);
      if (h.length > 160) h.splice(0, h.length - 160); // 上限 160 点（约 800 年）
    }
  }

  // ================== 昼夜光影（渲染层驱动：帧计数推进，视觉与模拟节奏解耦） ==================
  /** 一天的帧数（60fps ≈ 40 秒/昼夜：足够慢以营造氛围、足够快以被观察到） */
  static readonly DAY_FRAMES = 2400;

  /** 当前昼夜相位 0..1（0..0.45 白昼 · 0.45..0.5 黄昏 · 0.5..0.9 夜晚 · 0.9..1 破晓） */
  dayPhase(): number {
    return (this.frameCount % GameEngine.DAY_FRAMES) / GameEngine.DAY_FRAMES;
  }

  /** 太阳状态（渲染管线共享同一光源）：level 光照 0..1；sx/sy 阴影方向单位向量；len 阴影长度系数
   *  时间轴：0..0.40 白昼 · 0.40..0.52 黄昏（4.8s 转场）· 0.52..0.88 夜晚 · 0.88..1 破晓（4.8s 转场）
   *  白昼太阳东升西落（晨影指西 → 暮影指东）；夜晚月影微弱固定西偏；破晓暗影最短时完成日月交替 */
  sunState(): { level: number; sx: number; sy: number; len: number } {
    const p = this.dayPhase();
    const DAY = 0.40, DUSK = 0.52, NIGHT_END = 0.88;
    let level: number, sx: number, sy: number;
    if (p < DAY) {
      const t = p / DAY;
      level = 0.35 + 0.65 * Math.sin(t * Math.PI); // 日出晨光 → 正午满照 → 日落暮光
      sx = -Math.cos(t * Math.PI); // 影子从指西翻转到指东
      sy = 0.45; // 俯视角光线的南向分量（影子略向下延）
    } else if (p < DUSK) {
      const t = (p - DAY) / (DUSK - DAY);
      level = 0.35 * (1 - t) + 0.18 * t; // 暮色四合
      sx = 1; sy = 0.4; // 暮影指东（太阳落西）
    } else if (p < NIGHT_END) {
      level = 0.16 + 0.05 * Math.sin((p - DUSK) * Math.PI / (NIGHT_END - DUSK)); // 月光微弧
      sx = 1; sy = 0.3; // 月影固定西偏
    } else {
      const t = (p - NIGHT_END) / (1 - NIGHT_END);
      level = 0.18 + (0.35 - 0.18) * t; // 破晓渐亮
      sx = 1 * (1 - t) + (-1) * t; // 月影 → 晨影翻转（暗影最短时切换不可察觉）
      sy = 0.4;
    }
    const len = 0.6 + 2.2 * (1 - level); // 晨昏长影 / 正午短影
    return { level, sx, sy, len };
  }

  frame(dtMs: number) {
    this.frameCount++;
    this.updateZoomAnim(dtMs);
    if (this.speed > 0) {
      this.acc += dtMs * this.speed;
      // —— 帧预算式步进调度【性能修复 v74】——
      // 旧版固定步数上限（simMs EMA 分档 4/8/12）的问题：①偶发重 tick（战争结算/地质演化/
      // 繁衍潮）时仍会连跑 4-12 个重 tick，单帧 50ms+ 停顿 —— 可感知卡顿的主源；②小世界
      // （sim 便宜）时步数上限 12 又封死了极速上限（12 步/帧 = 720tps 封顶）。
      // 现改为逐 tick 实测耗时：超过帧预算即让出本帧（积压截断到 ≤2 tick，避免追赶风暴；
      // 速度盘的「引擎保护中·实际 X.X×」如实反映有效速率），步数硬上限提到 30 ——
      // 小世界 50x 极速也能真实跑满，重世界永不爆发式连 tick。
      const budget = this.speed >= 3 ? 11 : 9; // ms：高倍速给模拟更多帧内份额（渲染层另有 ~5-8ms）
      const tStart = performance.now();
      let steps = 0;
      while (this.acc >= TICK_MS) {
        if (steps > 0 && performance.now() - tStart >= budget) {
          // 预算用尽：丢弃大部分积压（保留 ≤2 tick 追赶余地），本帧让出
          this.acc = Math.min(this.acc, TICK_MS * 2);
          break;
        }
        this.tick();
        this.acc -= TICK_MS;
        if (++steps >= 30) { this.acc = Math.min(this.acc, TICK_MS - 1); break; }
      }
    }
    // —— 渲染插值：tick 内位置已定格，按 tick 进度（acc/TICK_MS）计算每单位的平滑渲染坐标 ——
    // 暂停时定格在终点（alpha=1），避免单位悬浮在半格位置
    this.tickAlpha = this.speed > 0 ? Math.min(1, this.acc / TICK_MS) : 1;
    const ia = this.tickAlpha;
    for (const u of this.units) {
      const lx = u.lx ?? u.x;
      const ly = u.ly ?? u.y;
      u.rx = lx + (u.x - lx) * ia;
      u.ry = ly + (u.y - ly) * ia;
      // —— 质感工程 v3（Task 49）：整数设备像素吸附 ——
      // Task 48-A1 的浮点亚像素绘制在低分辨率画布上触发 Canvas 抗锯齿，
      // 半透明边缘经最近邻放大后全部单位发虚（VLM 确诊「软边/重影」）。
      // 现改为吸附到 2048 画布的整数设备像素（1/4 精灵格 = 1/8 格）：
      // 精灵边缘绝对锐利，运动步长 zoom/8 屏幕像素（较 Task 48 前的 zoom/2 减半）。
      u.dpx = Math.round(u.rx * 8) / 4;
      u.dpy = Math.round(u.ry * 8) / 4;
    }
    // —— 神之手指保活：抓取悬停期间即使指针不动，被抓单位也保持 AI 暂停（逐帧刷新） ——
    if (this.grabId != null) {
      const g = this.unitById.get(this.grabId);
      if (g && !g.dead && (g.thrT ?? 0) <= 0) g.grab = Math.max(g.grab ?? 0, 6);
      else if (!g || g.dead) this.grabId = null;
    }
    // —— 军旗插值（Task 48-B3）：军团每 5 tick 才行军一次，军旗直读坐标会以 3 次/秒跳变 ——
    // 质感工程 v3：同样吸附到整数设备像素（tile 坐标 1/8 网格）保持锐利
    for (const a of this.armies) {
      const lax = a.lax ?? a.x;
      const lay = a.lay ?? a.y;
      a.ax = Math.round((lax + (a.x - lax) * ia) * 8) / 8;
      a.ay = Math.round((lay + (a.y - lay) * ia) * 8) / 8;
    }
    // —— 瞬态视觉推进（Task 48-B2：闪电/鸟群/脚印老化 —— 纯视觉，与模拟 RNG 零交叉） ——
    this.vizTick(dtMs);
    if (this.followId != null) {
      const u = this.unitById.get(this.followId);
      if (u) { this.cam.x = u.rx ?? u.x; this.cam.y = u.ry ?? u.y; }
      else this.followId = null;
    }
  }

  // ---------------- fire ----------------
  fireTick() {
    if (this.fireSet.size === 0) return;
    // 复用熄灭列表（每 tick 燃烧时都分配 → 提出为实例字段手动清空，热路径零分配）
    const done = this.fireDone;
    done.length = 0;
    for (const i of this.fireSet) {
      // 火焰落在冰面上：热量直接把脚下冰烧融（火也随水熄灭）
      if (this.terrain[i] === T.ICE) {
        this.meltIce(i);
        this.fire[i] = 0;
        done.push(i);
        continue;
      }
      this.fire[i] -= 5;
      if (this.fire[i] <= 0) { done.push(i); continue; }
      if (this.building[i] > 0 && this.fire[i] < 100) {
        this.destroyBuilding(i);
        done.push(i);
        continue;
      }
      if (this.rng() < 0.4) {
        const x = i % W;
        const y = (i / W) | 0;
        // 风驱蔓延（v2）：下风向火势更旺、上风向受抑（大气与野火的因果链）
        const wcell = this.nature.cellOf(x, y);
        const [wu, wv] = this.nature.windAt(wcell % AW, (wcell / AW) | 0);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = idx(xx, yy);
            // 火焰融冰：燃烧产生的热量使邻近冰面消融为水
            if (this.terrain[j] === T.ICE) { this.meltIce(j); continue; }
            const t = this.terrain[j];
            let p = (this.building[j] > 0 ? 0.25 : t === T.FOREST ? 0.13 : t === T.GRASS ? 0.05 : t === T.SNOW ? 0.008 : 0) * this.nature.fireMul(j) * ep('fire.spreadMul');
            // 邻格对角距离只会是 1 或 √2（dx/dy ∈ {-1,0,1}）—— 查表替代 Math.hypot
            const dl = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
            const wproj = (wu * dx + wv * dy) / dl;
            p *= wproj > 0.35 ? 2.1 : wproj < -0.35 ? 0.4 : 1; // 顺风 ×2.1 / 逆风 ×0.4
            if (p > 0 && this.rng() < p) this.ignite(j);
          }
        }
      }
    }
    for (const i of done) {
      this.fireSet.delete(i);
      this.fire[i] = 0;
      const t = this.terrain[i];
      if (t === T.FOREST || t === T.GRASS) {
        this.setTerrain(i, T.BURNT);
        // 季节影响复苏速度（春快冬慢；雨区加速）× 土壤肥力（贫土慢一半，沃土快四成）× 热参数
        this.regrow.set(i, this.tickCount + Math.round((ep('eco.regrowBase') + Math.floor(this.rng() * 900)) / (this.nature.regrowMul() * this.worldsim.soilMulAt(i))));
      }
    }
  }

  regrowTick() {
    if (this.regrow.size === 0) return;
    for (const [i, at] of this.regrow) {
      if (this.tickCount >= at) {
        this.regrow.delete(i);
        if (this.terrain[i] === T.BURNT && this.owner[i] >= 0 || this.terrain[i] === T.BURNT) {
          this.setTerrain(i, T.GRASS);
        }
      }
    }
  }

  radTick() {
    if (this.radSet.size === 0) return;
    for (const [i, at] of this.radSet) {
      if (this.tickCount >= at) {
        this.radSet.delete(i);
        this.radiate[i] = 0;
        this.markDirty(i);
      }
    }
  }

  // ---------------- 原子级 decals（血迹 / 尸骸） ----------------
  /** 血迹上限（环形淘汰：最早的先消失） */
  static readonly BLOOD_MAX = 420;
  /** 尸骸上限 */
  static readonly CORPSE_MAX = 240;
  /** 尸骸存留 tick（≈7.5 年后淡出） */
  static readonly CORPSE_TTL = 300;
  /** 凤凰涅槃耗时（tick；240 = 4s）：灰烬堆从余烬闪烁到火光渐盛的倒数可视化 */
  static readonly PHOENIX_ASH_TTL = 240;
  /** 血迹存留 tick（受击飞溅 ≈7.5 年 / 血泊 ≈10 年） */
  static readonly BLOOD_TTL = 300;

  addBlood(x: number, y: number, big: boolean) {
    if (!this.fxPrefs.blood) return;
    this.blood.push({ x, y, age: 0, seed: Math.floor(this.rng() * 65536), big });
    if (this.blood.length > GameEngine.BLOOD_MAX) this.blood.splice(0, this.blood.length - GameEngine.BLOOD_MAX);
  }

  addCorpse(x: number, y: number, stone: boolean, undead: boolean) {
    if (!this.fxPrefs.corpses) return;
    this.corpses.push({ x, y, age: 0, stone, undead });
    if (this.corpses.length > GameEngine.CORPSE_MAX) this.corpses.splice(0, this.corpses.length - GameEngine.CORPSE_MAX);
  }

  decalsTick() {
    for (let i = this.blood.length - 1; i >= 0; i--) {
      const b = this.blood[i];
      b.age += 2;
      if (b.age > GameEngine.BLOOD_TTL * (b.big ? 1.4 : 1)) this.blood.splice(i, 1);
    }
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i];
      c.age += 2;
      if (c.age > GameEngine.CORPSE_TTL * (c.stone ? 2.2 : 1)) this.corpses.splice(i, 1); // 石像留存更久
    }
  }

  // ---------------- 冰面生态（冻结 / 消融 / 洪水退潮） ----------------
  /** 消融：冰面 → 水（统一入口，保持 frozen 簿记） */
  meltIce(i: number) {
    if (this.terrain[i] !== T.ICE) return;
    this.setTerrain(i, T.WATER);
  }

  /** 冰面生态循环（每 40 tick）：
   *  1. 热源消融 —— 岩浆/火焰邻近立即融；暖气候小概率融（极地冰常年不化）
   *  2. 极地自然冻结 —— 雪地邻水小概率结冰（两极自然生成冰盖）
   *  3. 海啸洪水退潮 —— 到期淹没区化回沙滩 + 湿沙标记（接海的水保留）
   *  4. 湿沙干透 —— 深色褪去 */
  iceTick() {
    // 1. 热源消融 + 暖气候消融
    if (this.frozen.size > 0) {
      for (const i of [...this.frozen]) {
        const x = i % W;
        const y = (i / W) | 0;
        let hot = false;
        for (let k = 0; k < 4; k++) {
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (this.terrain[j] === T.LAVA || this.fire[j] > 0) { hot = true; break; }
        }
        if (hot) { this.meltIce(i); continue; }
        // 春汛解冻（Task 101）：春回大地，冻结线北退——中低纬冰面春季快速消融，
        // 极地（latF ≥ 0.62）不受此通道影响（极地冰盖「常年不化」语义由既有暖候通道接管）
        if (this.nature.season === 0) {
          const latF2 = Math.abs(y / H - 0.5) * 2;
          if (latF2 < 0.62 && this.rng() < 0.06 + 0.28 * (1 - latF2)) {
            this.meltIce(i);
            // 融滴（Task 102）：春汛解冻的细微水花反馈，与封冻闪晶同节奏
            if (this.rng() < 0.2) this.fx('water', x + 0.5, y + 0.5, 26);
            // 落冰湖纪事（Task 103）：融冰瞬间冰面上若有非水生单位，它即将坠入湖水——每春播报一次
            if (!this.nature.thawChronDone) {
              let fell = false;
              for (const u of this.units) {
                if (u.dead || u.boat) continue;
                const def = RACES[u.race];
                if (def.aquatic || def.flying) continue;
                if ((u.x | 0) === x && (u.y | 0) === y) { fell = true; break; }
              }
              if (fell) {
                this.nature.thawChronDone = true;
                this.addEvent('geo', '春汛冰消——冰面上的行人随碎裂的冰层跌入湖水，春寒刺骨', { x, y });
              }
            }
            continue;
          }
        }
        // 暖气候小概率消融（极地 temp 低则几乎不化；夏季/火山冬调制）
        const meltP = 0.012 * this.nature.iceMul();
        if (this.rng() < meltP && this.tempMap[i] > 96) this.meltIce(i);
      }
    }
    // 2. 极地自然冻结：随机采样雪地邻水点（冬季/火山冬冻结更活跃 → 冰缘扩张）
    const freezeN = Math.round(14 * this.nature.iceMul());
    for (let k = 0; k < freezeN; k++) {
      const x = 1 + Math.floor(this.rng() * (W - 2));
      const y = 1 + Math.floor(this.rng() * (H - 2));
      const i = idx(x, y);
      if (this.terrain[i] !== T.SNOW) continue;
      // 找邻水（浅水优先结冰）
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const d = dirs[Math.floor(this.rng() * 4)];
      const j = idx(x + d[0], y + d[1]);
      if (j >= 0 && j < W * H) {
        const t = this.terrain[j];
        if (t === T.WATER && this.rng() < 0.3) this.setTerrain(j, T.ICE);
        else if (t === T.DEEP && this.rng() < 0.04) this.setTerrain(j, T.ICE);
      }
    }
    // 2b. 冬季大封冻（Task 101「千里冰封」）：中纬度水面季节性结冰——冻结线随纬度自两极向赤道推进，
    //  岸缘优先封冻（岸冰 p 全额 / 湖心 p 三折——真实湖泊自岸向心冻结的观感），赤道无冰带（latF < 0.26）永不封冻；
    //  深洋仅极北封冻（latF ≥ 0.5 且概率锐减）。冻结的水面可行走（落水者自担风险），水中鱼群被冻上岸由
    //  beachedAquaticTick 归海导向自愈。冰面生态循环每 40 tick 一次，每季约 2 轮 → 预算按「可感知」标定。
    if (this.nature.season === 3) {
      let frozeN = 0;
      for (let k = 0; k < 1100; k++) {
        const x = 1 + Math.floor(this.rng() * (W - 2));
        const y = 1 + Math.floor(this.rng() * (H - 2));
        const i = idx(x, y);
        const t = this.terrain[i];
        if (t !== T.WATER && t !== T.DEEP) continue;
        const latF = Math.abs(y / H - 0.5) * 2;
        if (t === T.WATER) {
          if (latF < 0.26) continue;
          // 岸缘判定：4 邻存在任何陆地（非水）→ 岸冰全额概率，湖心缓冻
          let shore = false;
          for (let q = 0; q < 4 && !shore; q++) {
            const xx = x + (q === 0 ? -1 : q === 1 ? 1 : 0);
            const yy = y + (q === 2 ? -1 : q === 3 ? 1 : 0);
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const tt = this.terrain[idx(xx, yy)];
            if (tt !== T.WATER && tt !== T.DEEP) shore = true;
          }
          if (this.rng() < Math.min(0.9, (latF - 0.24) * (shore ? 0.9 : 0.3))) {
            this.setTerrain(i, T.ICE);
            frozeN++;
            // 封冻闪晶（Task 102）：1/4 概率在新冻格上绽开冰晶星芒——冻结线推进肉眼可辨
            if (this.rng() < 0.25) this.fx('frost', x + 0.5, y + 0.5, 36);
          }
        } else if (latF >= 0.5 && this.rng() < (latF - 0.5) * 0.22) { this.setTerrain(i, T.ICE); frozeN++; }
      }
      // 封冻纪事（每冬至多一条；冰晶灯效应之外的机制提示——冰面可行走）
      if (frozeN >= 12 && !this.nature.iceChronDone) {
        this.nature.iceChronDone = true;
        this.addEvent('geo', '千里冰封——寒潮封住了北地的湖泽，冰面覆霜可行走，鱼群潜入未冻的深水', {});
      }
    }
    // 3. 海啸洪水退潮：到期回退为沙滩 + 湿沙（接自然水域的保留为海）
    if (this.flood.size > 0) {
      for (const [i, at] of [...this.flood]) {
        if (this.tickCount < at) continue;
        this.flood.delete(i);
        if (this.terrain[i] !== T.WATER) continue; // 玩家已改造过
        // 任一邻格是自然水（非洪水区）→ 保留为海（海湾被永久打开）
        const x = i % W;
        const y = (i / W) | 0;
        let natural = false;
        for (let k = 0; k < 4 && !natural; k++) {
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (isWater(this.terrain[j]) && !this.flood.has(j)) natural = true;
        }
        if (!natural) {
          this.setTerrain(i, T.SAND);
          this.wet.set(i, this.tickCount + 220); // 湿沙：退潮后的深色印记
        }
      }
    }
    // 4. 湿沙干透
    if (this.wet.size > 0) {
      for (const [i, at] of [...this.wet]) {
        if (this.tickCount >= at) this.wet.delete(i);
      }
    }
  }

  /** 冬季雪人（Task 104）：村民雪地堆雪人（装饰瞬态）/ 出冬渐融（每 80 tick，与 iceTick 错峰）。
   *  抽样以村民为单位（站雪者身旁 5×5 找空雪格落人），上限 140 座防全图泛滥；
   *  融化用步长 7919（与 40960 互素）全域扫融，每窗至多 40 座 → 一季内化完。 */
  private snowmanTick() {
    if (this.nature.season !== 3) {
      if (this.snowmanN === 0) return;
      const off = (this.rng() * W * H) | 0;
      let melted = 0;
      for (let k = 0; k < W * H && melted < 40; k++) {
        const i = (k * 7919 + off) % (W * H);
        if (!this.snowman[i]) continue;
        this.snowman[i] = 0;
        this.snowmanN--;
        this.propsDirty.add(i);
        if (this.rng() < 0.25) this.fx('water', (i % W) + 0.5, ((i / W) | 0) + 0.5, 14);
        melted++;
      }
      return;
    }
    if (this.snowmanN >= 140 || this.units.length === 0) return;
    let built = 0;
    for (let k = 0; k < 12; k++) {
      if (this.snowmanN >= 140 || built >= 3) break;
      const u = this.units[(this.rng() * this.units.length) | 0];
      if (!u || u.dead || u.civ < 0 || !RACES[u.race].isCiv) continue;
      const ux = Math.floor(u.x);
      const uy = Math.floor(u.y);
      if (this.terrain[uy * W + ux] !== T.SNOW) continue;
      // 身旁 5×5 随机找一块空雪格落人（雪人不占行走层，纯装饰）
      const px = ux + ((this.rng() * 5) | 0) - 2;
      const py = uy + ((this.rng() * 5) | 0) - 2;
      if (px < 1 || py < 1 || px >= W - 1 || py >= H - 1) continue;
      const i = py * W + px;
      if (this.snowman[i] || this.terrain[i] !== T.SNOW || this.building[i] > 0) continue;
      if (this.rng() >= 0.3) continue;
      this.snowman[i] = 1;
      this.snowmanN++;
      this.propsDirty.add(i);
      if (this.rng() < 0.5) this.fx('frost', px + 0.5, py + 0.5, 16);
      built++;
      if (!this.nature.snowmanChronDone) {
        this.nature.snowmanChronDone = true;
        this.addEvent('eco', '村民们在雪地里堆起了雪人——严冬之上也有嬉戏的时光', {});
      }
    }
  }

  // ---------------- units sim ----------------
  rebuildBuckets() {
    const buckets = this.buckets;
    // Rust 重构 Stage 3（懒清空）：世代戳递增 → 仅本 tick 实际有单位落入的桶才清空。
    // 4096 桶全清 → 按需 ~N 清（N=存活单位数）；桶内容仍严格是本世代数据，消费者零改动。
    const cur = (this.bucketStamp = (this.bucketStamp + 1) | 0);
    const st = this.bucketStampArr;
    // 索引循环 + 局部量（bw/bh/buckets 提出循环，避免逐单位属性链访问；热路径每 tick 全量重排）
    const units = this.units;
    const bw = this.bw;
    const bh = this.bh;
    const maxY = bh - 1;
    const maxX = bw - 1;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      let cx = (u.x / 4) | 0;
      let cy = (u.y / 4) | 0;
      if (cx > maxX) cx = maxX; else if (cx < 0) cx = 0;
      if (cy > maxY) cy = maxY; else if (cy < 0) cy = 0;
      const ci = cy * bw + cx;
      if (st[ci] !== cur) { buckets[ci].length = 0; st[ci] = cur; }
      buckets[ci].push(u);
    }
    // WASM 空间内核镜像打包（Task 45-a：SoA 镜像 + counting-sort 网格；扫描环位精确替代）
    if (WB.active() && !WBB.batchReady) WB.pack(this); // 批内核就绪后由 pack2 全量接管（Stage 1 扫描镜像停更）
  }

  /** unitsTick 内层剖析（EMA ms）：pack2=JS→WASM 镜像打包 batch=Rust 批处理 replay=动作回放 wb=写回+收尸+bail接力 js=JS 路径（fallback） */
  uprof = { pack2: 0, batch: 0, replay: 0, wb: 0, js: 0 };
  /** TEMP-48: bail 类型诊断直方图（1=船 2=涌现 3=建筑摧毁 4=商队 5=殖民建城） */
  bailKinds: Record<number, number> = {};
  unitsTick() {
    const parity = this.tickCount % 2;
    const wbOn = WB.active();
    // —— Stage 2：Rust 批内核接管（位精确；稀疏路径 bail → JS 接力 → 续批）——
    // 【性能修复 v74】guard 触发后不再永久放弃批内核 —— 冷却到期 retryDue 自动重试（指数退避），
    // 避免长会话（海军/商队风暴一次触发）永久跌回慢速 JS 路径（实测吞吐直接砍半）
    if (WBB.active() || WBB.retryDue(this.tickCount)) {
      const uT0 = performance.now();
      WBB.pack2(this); // 首次 pack 建立镜像并置 batchReady；失败则回退 JS
      const uT1 = performance.now();
      if (WBB.active() && WBB.batchReady) {
        this._wbBatch = true;
        let from = 0;
        let guard = 0;
        let batchAcc = 0; let replayAcc = 0; let wbAcc = 0;
        for (;;) {
          const tB0 = performance.now();
          const r = WBB.batch(this, from);
          batchAcc += performance.now() - tB0;
          if (r.code === 2) {
            // TEMP-48: bail 类型诊断直方图
            this.bailKinds[r.kind] = (this.bailKinds[r.kind] ?? 0) + 1;
            // bail：回放动作 → 写回脏行 → 同步 RNG → JS 接力该单位 → 分级重打包 → 续批
            const tR0 = performance.now();
            WBB.replayActions(this);
            replayAcc += performance.now() - tR0;
            const tW0 = performance.now();
            WBB.writeback(this);
            this.rngA = WBB.getRng();
            const u = this.units[r.slot];
            // —— Task 50：接力前快照爆炸面特征（建筑/文明/家族表长度）—— 接力后按 bail 类型 + 实测爆炸面分级选择重打包截面 ——
            // 根治 bail 风暴：旧方案每次 bail 全量重打包（网格+文明+建筑+全行 meta ≈ 0.7ms），
            // 船队/繁衍潮/商队密集时 simMs 被拖到 12ms；分级后纯航行 bail ≈ 0.1ms（位等由漏斗+哨兵兑底）。
            const bB = this.buildings.length, cN = this.civs.length, fN = this.families.size;
            const wasBoat = !!(u && u.boat); // Task 50：接力前快照 —— 区分「虚拟船（商队）」与「真船靠岸（爆炸面最大）」
            if (u) this.wbResume(u, r.kind, r.data);
            wbAcc += performance.now() - tW0;
            const tP0 = performance.now();
            const pureSail = !!u && r.kind === 1 && wasBoat && !!u.boat
              && this.buildings.length === bB && this.civs.length === cN && this.families.size === fN;
            if (pureSail) {
              // 船纯航行：只有该船自身热列 + fx/标量变动 —— 单行重灌（~0.01ms；守卫内建退化路径）
              WBB.packSail(this, r.slot);
            } else if (r.kind === 1 && u && !wasBoat) {
              // Task 50：虚拟船（商队单位）—— 接力段跑了完整 updateUnit（攻击/拾取/繁衍/商队转向），
              // 爆炸面 = 文明/家族/物品/战争位图 + 行（网格/建筑不触及：建筑伤害经箭矢 fx 延迟结算）
              WBB.pack2(this, false, WP_WAR | WP_CIV | WP_FAM | WP_ITEM | WP_SCAL | WP_HOT | WP_META);
            } else if (r.kind === 2 && this.buildings.length === bB && this.civs.length === cN) {
              // 涌现繁衍：spawn 改 civ.pop/wild/新行（行级增量）—— 轻截面（网格/建筑/物品/战争位图跳过）
              WBB.pack2(this, false, WP_CIV | WP_FAM | WP_SCAL | WP_HOT | WP_META);
            } else if (r.kind === 4 && this.buildings.length === bB && this.civs.length === cN) {
              // 商队结算：gold/rel/拾取 —— 中截面（网格/建筑跳过）
              WBB.pack2(this, false, WP_WAR | WP_CIV | WP_FAM | WP_ITEM | WP_SCAL | WP_HOT | WP_META);
            } else if (r.kind === 3 && this.civs.length === cN) {
              // 建筑摧毁：全表段（网格/建筑/战争都要）但 meta 全行重灌仅由漏斗触发（不再强制 full）
              WBB.pack2(this, false, 511);
            } else {
              // 殖民建城 / 检出未知爆炸面：保守全量（含强制 meta 全行）
              WBB.pack2(this, true);
            }
            batchAcc += performance.now() - tP0; // bail 重打包计入 batch 段
            from = r.slot + 1;
            if (++guard > 400) { // 防御：极端退化（如全船队）本 tick 放弃批处理 —— 冷却后自动重试
              WBB.failed = true;
              WBB.scheduleRetry(this.tickCount);
              break;
            }
            this._wbBatch = true;
            continue;
          }
          break;
        }
        const tR1 = performance.now();
        WBB.replayActions(this);
        replayAcc += performance.now() - tR1;
        const tW1 = performance.now();
        WBB.writeback(this);
        this.rngA = WBB.getRng();
        this._wbBatch = false;
        this.unitsReap();
        wbAcc += performance.now() - tW1;
        WBB.noteGood(); // 【v74】本轮无 guard 触发 → 退避计数衰减
        const UP = this.uprof;
        UP.pack2 = UP.pack2 * 0.9 + (uT1 - uT0) * 0.1;
        UP.batch = UP.batch * 0.9 + batchAcc * 0.1;
        UP.replay = UP.replay * 0.9 + replayAcc * 0.1;
        UP.wb = UP.wb * 0.9 + wbAcc * 0.1;
        return;
      }
    }
    const jsT0 = performance.now();
    for (const u of this.units) {
      if (u.parity === parity && !u.dead) {
        this.updateUnit(u);
        // WASM 镜像收口：水单位自身变异（移动/死亡/恐慌衰减）回写 —— 后续单位的扫描读到活值
        if (wbOn) WB.syncAfterUpdate(u);
      }
    }
    this.unitsReap();
    this.uprof.js = this.uprof.js * 0.9 + (performance.now() - jsT0) * 0.1;
  }

  /** 死亡收尸（Stage 2：批内核路径与 JS 路径共用） */

  /** Stage 2 bail 接力：Rust 在稀疏复杂路径让位 —— 动作已回放 / 脏行已写回 / RNG 已同步 */
  private wbResume(u: Unit, kind: number, d: Float64Array) {
    switch (kind) {
      case 1: {
        // 船单位：Rust 侧 hurt-- 未标脏（bail 早退在 dirty(s) 之前）→ JS 未同步到 h-1。
        // Task 50 修复：不再补偿（旧补偿 u.hurt++ 抵消 updateUnit 的唯一递减 → bail 船受击闪烁永不衰减，
        // 实证 36 tick hurt 恒 25）；直接 JS 接管，updateUnit 执行唯一一次 hurt--，
        // Rust 的孤儿写会被下一次重打包热列覆盖 —— 与纯 JS 路径位等。
        this.updateUnit(u);
        break;
      }
      case 2: {
        // 涌现特质门已过（Rust 已消耗 0.06 掷骰）：发明特质 + 完成繁衍 spawn
        const cg = { s: d[0], d: d[1], h: d[2], r: d[3] };
        // —— 超级演化 v4：辐射区演化高压锅（Rust 侧已定型 cg，JS 侧对辐射带出生的于代二次放大偏移）——
        const rIdx = idx(Math.max(0, Math.min(W - 1, u.x | 0)), Math.max(0, Math.min(H - 1, u.y | 0)));
        if (this.radiate[rIdx] > 0) {
          const pg = u.gene ?? { s: 1, d: 1, h: 1, r: 1 };
          for (const k of ['s', 'd', 'h', 'r'] as const) {
            cg[k] = Math.max(0.5, Math.min(2, pg[k] + (cg[k] - pg[k]) * 2.2));
          }
        }
        const traitKey = this.inventEmergentTrait(u, cg);
        const def = RACES[u.race];
        if (d[4] >= 1) {
          // 文明分支（人口/上限门已在 Rust 通过）
          const civ = this.civs[u.civ];
          if (civ && civ.alive) {
            const fam = u.fam ?? (this.rng() < 0.25 ? this.newFamily(u.race, u).id : undefined);
            this.spawnUnit(u.race, u.x + this.rng() - 0.5, u.y + this.rng() - 0.5, { civ: u.civ, silent: true, gene: cg, trait: traitKey ?? undefined, fam, fgn: fam !== undefined ? (u.fgn ?? 1) + 1 : undefined });
            this.fx('heart', u.x, u.y - 1, 40);
          }
        } else {
          const cap = this.wildCapOf(u.race);
          const same = this.wildCount.get(u.race) ?? 0;
          if (same < cap) {
            const fam = u.fam ?? (this.rng() < 0.25 ? this.newFamily(u.race, u).id : undefined);
            this.spawnUnit(u.race, u.x + this.rng() - 0.5, u.y + this.rng() - 0.5, { silent: true, gene: cg, trait: traitKey ?? undefined, fam, fgn: fam !== undefined ? (u.fgn ?? 1) + 1 : undefined });
            this.fx('heart', u.x, u.y - 1, 40);
          }
        }
        void def;
        break;
      }
      case 3: {
        // 建筑摧毁级联（单位 cd/atk 已置）：onBuildingDestroyed + 战争 AI 分支剩余 + 尾段
        const tile = d[0] | 0;
        const byCiv = d[1] | 0;
        this.onBuildingDestroyed(tile, byCiv);
        const job = u.job ?? 0;
        const inArmy = u.army != null;
        // 弓手轰击（cd 已被置 14 → 门不触发，掷骰不消耗 —— 与 Rust 短路一致）
        if (job === 3 && u.cd <= 0 && this.rng() < 0.1) {
          const bi = this.enemyBuildingNear(u, JOBS[3].ranged ?? 5);
          if (bi >= 0) {
            u.cd = 18;
            this.castArrow(u, (bi % W) + 0.5, ((bi / W) | 0) + 0.5, u.dmg);
          }
        }
        if (!inArmy) {
          if (this.rng() < 0.05 && this.maybeBoardForWar(u)) break;
          {
            const tdx = u.tx - u.x;
            const tdy = u.ty - u.y;
            if (tdx * tdx + tdy * tdy < 1.44 || this.rng() < 0.03) {
              const tgt = this.nearestEnemyBuilding(u);
              if (tgt) { u.tx = tgt.x + this.rng() * 2 - 1; u.ty = tgt.y + this.rng() * 2 - 1; }
            }
          }
        }
        if (this.updateUnitTailJS(u)) break;
        this.updateUnitPostJS(u);
        break;
      }
      case 4: {
        // 商队抵达结算（4 rng + 外交涟漪）+ 尾段
        this.caravanArrive(u);
        if (this.updateUnitTailJS(u)) break;
        this.updateUnitPostJS(u);
        break;
      }
      case 5: {
        // 殖民建城（buildBuilding + 圈地 + 播报）—— disembark 已完成落位
        this.foundSettlement(u, d[0] | 0);
        break;
      }
    }
  }

  /** 涌现特质发明（tryEmergentTrait 的门后段 —— 门与掷骰已在 Rust 侧消耗） */
  private inventEmergentTrait(parent: Unit, childGene: Gene): string | null {
    const t = inventTrait(this.rng, childGene, this.traitSeq);
    t.key = `dt${this.traitSeq++}`;
    this.dynTraits.set(t.key, t);
    TRAITS[t.key] = t;
    this.recordEvo('trait', t.name, null, '#ff5fd2', `${t.desc} —— 源自「${RACES[parent.race]?.name ?? '?'}」种群 ${Math.floor(this.yearF)} 年的极端基因个体`, t.desc, { race: parent.race });
    this.addEvent('emerge', `演化奇迹——「${RACES[parent.race]?.name ?? '?'}」种群诞生了前所未见的个体，携带着新特质「${t.name}」（${t.desc}）`, { colorHex: '#ff5fd2', x: parent.x, y: parent.y });
    return t.key;
  }

  unitsReap() {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (!u.dead) continue;
      // —— 僵尸病毒（世界法则，旧档缺字段按 true）：瘟疫致死 35% 尸变（复用 zombify 原地转化）——
      if (u.infected && this.laws.zombieVirus !== false && !RACES[u.race].undead && !RACES[u.race].aquatic && !RACES[u.race].flying && this.rng() < 0.35) {
        u.infected = false;
        this.zombify(u);
        continue; // 原地复生为僵尸：不走死亡结算（zombify 已把 dead 置回 false）
      }
      // —— 王权：国王驾崩（纪事 + 稳定度下挫 + 继承加冕）——
      if (u.king && u.civ >= 0) this.onKingDeath(u);
      // —— 凤凰：浴火重生（灰烬涅槃倒数，至多三次；第四次死亡魂飞魄散走常规收尸）——
      // 跳过骷髅/血泊/宝藏/家族吊唁全套常规死亡反馈：神鸟陨落只余一堆渐燃的灰
      if (u.race === R.PHOENIX && (u.rebirths ?? 0) < 3) {
        // 季节节律（季节 × 万物）：寒冬涅槃迟缓 —— 霜冻延缓火种复燃（TTL ×1.5 ≈ 6s@1x）
        const ashTtl = this.nature.season === 3 ? Math.round(GameEngine.PHOENIX_ASH_TTL * 1.5) : GameEngine.PHOENIX_ASH_TTL;
        this.phoenixAshes.push({ x: u.x, y: u.y, t: ashTtl, rebirths: (u.rebirths ?? 0) + 1 });
        this.addEvent('phoenix', `凤凰陨落成灰——余烬仍在闪烁，传说它将自火中归来（第 ${(u.rebirths ?? 0) + 1} 次涅槃）`, { x: u.x, y: u.y });
        this.fx('smoke', u.x, u.y, 30);
        this.unitById.delete(u.id);
        this.bumpWild(u.race, -1); // 野生动物计数同步（重生 spawn 时会 +1）
        const last = this.units.pop()!;
        if (i < this.units.length) { this.units[i] = last; WBB.touchRow(i); }
        continue;
      }
      if (u.race === R.PHOENIX) {
        this.addEvent('phoenix', '火种熄灭——这只凤凰耗尽了所有涅槃，化作永恒的灰烬', { x: u.x, y: u.y });
      }
      // —— 九头蛇：斩首分裂（被杀时断颈处萌发两条幼蛇；世代上限 2，第三世代死亡即真终焉）——
      // 神话弱点：火焰烧灼断颈可阻止再生 —— 死亡位置燃着火 / 身陷岩浆 = 被烧灼，直接真死走常规收尸
      // 分裂走 spawnUnit（受 MAX_HYDRAS / MAX_WILDLIFE 上限约束，spawnUnit 返回 null = 头颅再也长不出来）
      if (u.race === R.HYDRA && (u.gen ?? 0) < 2) {
        const ti = ((u.y | 0) * W) + (u.x | 0);
        const seared = this.fire[ti] > 0 || this.terrain[ti] === T.LAVA;
        if (!seared) {
          const g = (u.gen ?? 0) + 1;
          const born: Unit[] = [];
          for (const [dx, dy] of [[-1.3, 0.5], [1.3, -0.5]] as const) {
            const nu = this.spawnUnit(R.HYDRA, u.x + dx, u.y + dy, { silent: true });
            if (nu) {
              nu.gen = g;
              nu.maxHp = Math.round(nu.maxHp * 0.6); // 幼蛇只继承了六成的伟力
              nu.hp = nu.maxHp;
              born.push(nu);
            }
          }
          if (born.length > 0) {
            this.addEvent('hydra', born.length > 1
              ? `九头蛇被斩首——断颈处竟萌发出 ${born.length} 条幼蛇，每一颗都在嘶鸣（第 ${g} 世代）`
              : `九头蛇倒下了——仅剩的一颗断颈仍萌发出一条幼蛇（第 ${g} 世代）`, { x: u.x, y: u.y });
            this.fx('smoke', u.x, u.y, 36);
            this.fx('blood', u.x, u.y, 20);
            this.shake = Math.max(this.shake, 3);
            this.onSound?.('hydra');
            this.unitById.delete(u.id);
            this.bumpWild(u.race, -1); // 母体计数 -1（幼蛇 spawn 各自 +1）
            const last = this.units.pop()!;
            if (i < this.units.length) { this.units[i] = last; WBB.touchRow(i); }
            continue;
          }
          // 上限满 → 分裂失败，落入常规收尸（传说的尽头：头颅再也长不出来）
          this.addEvent('hydra', '九头蛇倒下了——但世上九头蛇已经太多，断颈静寂，再无新生', { x: u.x, y: u.y });
        } else {
          this.addEvent('hydra', '烈焰烧灼了断颈——被火焚灭的九头蛇再也无法萌生新的头颅', { x: u.x, y: u.y });
        }
      }
      if (u.race === R.HYDRA && (u.gen ?? 0) >= 2) {
        this.addEvent('hydra', '最后一颗头颅垂下了——这条熬过两次斩首的老蛇终于真正死去', { x: u.x, y: u.y });
      }
      // Task 38 在线采集：野生动物遭遇会话死亡结算（饿死 = 捕食者断粮；Map 空查 no-op）
      collectUnitDead(u.id, (u.food ?? 70) <= 0 && RACES[u.race].predator && !RACES[u.race].undead);
      if (u.civ >= 0 && this.civs[u.civ]) this.civs[u.civ].pop--;
      // 家族送葬：族人倒下（僵尸转化不触发此处 —— 血脉延续到亡者军团，家族成员数不减）
      if (u.fam != null) {
        const df = this.families.get(u.fam);
        if (df) df.members--;
      }
      this.fx('skull', u.x, u.y, 46);
      // 深度打磨：商队遇袭 → 贸易中断 + 两国外交降温（劫掠后果链）
      if ((u.caravan ?? 0) > 0) {
        const home = u.civ >= 0 ? this.civs[u.civ] : null;
        const partner = this.civs[u.caravan!];
        if (home && partner && home.alive && partner.alive) {
          const key = pairKey(home.id, partner.id);
          this.rel.set(key, Math.max(-100, (this.rel.get(key) ?? 0) - 6));
          this.addEvent('trade', `「${home.name}」的商队在途中遇袭，贸易中断`, { colorHex: home.colorHex, x: u.x, y: u.y });
        }
      }
      // 尸骸残留 + 死亡血泊（原子级死亡反馈；亡者化为骨尘、无血可流）
      const undead = RACES[u.race].undead;
      if (u.race !== R.SANDWORM) { // 被吞噬者无残骸（已在吞噬处单独处理）
        if (this.fxPrefs.corpses) this.addCorpse(u.x, u.y, false, undead);
        if (this.fxPrefs.blood && !undead) this.addBlood(u.x, u.y, true);
      }
      // —— 战争缴获与巨怪宝藏（Task 34 去虚务实）：装备随死者落回大地 ——
      //    战场成为武器库（胜者拾取战利品再武装），巨怪巢穴藏着宝物——物品系统自然循环，不再只靠玩家手刷宝箱
      // —— 肉掉落：普通动物（非文明/非巨怪/非亡灵）死亡掉 1-3 块肉，拾食链的源头 ——
      if (!RACES[u.race].isCiv && !GameEngine.MONSTER_LOOT.has(u.race) && !RACES[u.race].undead && this.rng() < 0.85) {
        this.dropMeat(u.x, u.y, 1 + this.rng() * 2 + (u.race === R.PIG ? 1 : 0));
      }
      // —— 腐食回充（引擎级通道，v0.49 内核生态修复）：捕食者的进食结算在 TS 战斗路径
      //     （updateUnit 命中敌人 → food 回充），而 v0.49 起野生动物被批内核接管、不经 updateUnit
      //     —— 内核捕食者「只猎不吃」，饥饿账本只出不进，数年内必然饿毙（67 年老世界实测：
      //     狼/熊/狐/蛇/鲨全部归零）。此钩在收尸层补上能量转移：猎物倒下的地方，r=3.5 内
      //     最饥饿的一只野生捕食者上前取食（猎获/食腐），饥饿账本回充 —— Lotka-Volterra 的能量腿。
      if (this.isHerbivoreRace(u.race) && !RACES[u.race].isCiv) {
        let best: Unit | null = null;
        let bestHunger = 0;
        for (const p of this.units) {
          if (p.dead) continue;
          const pd = RACES[p.race];
          if (!pd.predator || pd.undead || pd.isCiv) continue;
          const dx = p.x - u.x, dy = p.y - u.y;
          if (dx * dx + dy * dy > 36) continue; // r=6 取食半径（嗅到血腥味循迹而来）
          const hunger = 80 - (p.food ?? 0);
          if (hunger <= bestHunger) continue; // 只喂最饥饿者（食物 <80 才进食）
          bestHunger = hunger;
          best = p;
        }
        if (best) best.food = Math.min(400, (best.food ?? 0) + 55 + Math.round(u.maxHp * 0.5)); // 400：可携带一个鱼群的能量远航
      }
      if (this.items.length < 170) {
        const boss = GameEngine.MONSTER_LOOT.has(u.race);
        if (u.wep && this.rng() < 0.35) {
          this.dropItem(u.wep as ItemKind, u.x, u.y);
        } else if (boss && this.rng() < 0.5) {
          this.dropItem(rollChestItem('chest2', this.rng), u.x, u.y); // 巨怪宝藏（秘银级）
          this.addEvent('loot', `巨怪倒下的地方散落着宝藏——静待有缘人`, { x: u.x, y: u.y });
        } else if (!RACES[u.race].isCiv && !boss && this.rng() < 0.05) {
          this.dropItem(rollChestItem('chest', this.rng), u.x, u.y); // 野兽偶尔叼着亮闪闪的东西
        }
      }
      this.unitById.delete(u.id);
      if (!RACES[u.race].isCiv) this.bumpWild(u.race, -1); // 野生动物计数同步（O(1)）
      const last = this.units.pop()!;
      if (i < this.units.length) { this.units[i] = last; WBB.touchRow(i); } // Stage 3+：移位行行级重灌（末尾 pop 无需）
    }
  }

  updateUnit(u: Unit) {
    const def = RACES[u.race];
    if (u.hurt > 0) u.hurt--;
    // —— 神之手指：被抓起/掷飞/落地的眩晕单位暂停 AI（免疫地面伤害），由 beginGrab/moveGrab/endGrab 驱动 ——
    if ((u.grab ?? 0) > 0) { this.grabbedTick(u); return; }
    // 殖民船：独立的航海逻辑（不参战/不覆水伤害）
    if (u.boat) {
      this.updateBoat(u);
      return;
    }
    u.age += 2 / YEAR_TICKS;
    if (u.age > u.maxAge) {
      // 亡者复生法则：寿终正寝的文明生物有小概率化为骷髅
      if (this.laws.undeadRise && def.isCiv && this.rng() < 0.08) this.riseSkeleton(u.x, u.y);
      u.dead = true; return;
    }
    if (u.cd > 0) u.cd -= 2;
    // 瞬态计时：攻击挥击动画 / 寒冻减速（均不入档）
    if (u.atk) u.atk -= 2;
    if (u.chill) u.chill -= 1;
    if (u.fleeT) {
      u.fleeT -= 2;
      // Task 38 在线采集：脱离冷却走完 → 遭遇会话结算（escape/kill）
      if (u.fleeT <= 0) collectFleeEnd(u.id, this.tickCount);
    }
    // —— 神力增益计时：祝福（回血+金光）/ 诅咒（失血+紫霾）/ 爱之甘霖（繁衍增益）——
    if (u.bless) {
      u.bless -= 2;
      if (u.hp > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 0.06);
      if (this.fxPrefs.ambience && this.rng() < 0.02) this.fx('bless', u.x, u.y - 0.6, 16);
    }
    if (u.curse) {
      u.curse -= 2;
      u.hp -= 0.05;
      u.hurt = Math.max(u.hurt, 4);
      if (this.fxPrefs.ambience && this.rng() < 0.02) this.fx('curse', u.x, u.y - 0.6, 16);
    }
    if (u.fert) u.fert -= 2;
    // —— 卡死自愈：远目标却长期无净位移（山体/水域隔断的直线追击死锁）→ 绕行优先 ——
    // 通用机制：狼追隔山羊、军队征隔海敌、商队遇断路 —— 所有直线追击不再永困死角
    if (u.detour) u.detour -= 2;
    // —— 涌现社会内核：恐慌随时间平复（0.008/update ≈ 6 年彻底消散；雪崩传播窗口 ≈ 半年） + 血仇随岁月消磨（0.12/年，22 年化开 3.0 峰值仇怨） ——
    if (u.panic !== undefined) {
      u.panic -= ep('social.panicDecay');
      if (u.panic <= 0) u.panic = undefined;
    }
    if (u.gVal !== undefined) {
      let alive = false;
      for (let gi = 0; gi < u.gVal.length; gi++) {
        u.gVal[gi] -= ep('social.grudgeDecay');
        if (u.gVal[gi] < 0.3) {
          u.gIds?.splice(gi, 1);
          u.gVal.splice(gi, 1);
          gi--;
        } else alive = true;
      }
      if (!alive) { u.gIds = undefined; u.gVal = undefined; }
    }
    {
      // 平方距离替代 Math.hypot（纯阈值比较，避免热点三角函数与中间精度开销）
      const fdx = u.tx - u.x;
      const fdy = u.ty - u.y;
      const farT = fdx * fdx + fdy * fdy > 6.25; // 2.5²
      if (farT) {
        if (u.sxk === undefined || u.syk === undefined) { u.sxk = u.x; u.syk = u.y; }
        const sdx = u.x - u.sxk;
        const sdy = u.y - (u.syk ?? u.y);
        if (sdx * sdx + sdy * sdy > 0.64) { // 0.8²
          u.stk = 0; u.sxk = u.x; u.syk = u.y; // 正常行进中：重置锚点
        } else {
          u.stk = (u.stk ?? 0) + 1;
          if (u.stk > 36) {
            u.stk = 0; u.sxk = u.x; u.syk = u.y;
            u.detour = 60; // 后续 30 次更新内：追击/索敌不再覆写目标 —— 逃生方向真正生效
            u.tx = Math.max(1, Math.min(W - 2, u.x + (this.rng() * 2 - 1) * 9));
            u.ty = Math.max(1, Math.min(H - 2, u.y + (this.rng() * 2 - 1) * 9));
          }
        }
      } else if (u.stk) { u.stk = 0; u.sxk = u.x; u.syk = u.y; }
    }

    const ti = idx(Math.floor(u.x), Math.floor(u.y));
    if (this.fire[ti] > 0 && !def.lavaImmune) { u.hp -= ep('fire.damage'); u.hurt = 20; }
    if (this.radiate[ti] > 0) { u.hp -= 0.5; u.hurt = 20; }
    if (this.terrain[ti] === T.LAVA && !def.lavaImmune) { u.hp -= 15; u.hurt = 20; }
    if (!def.flying && !def.aquatic && u.race !== R.WHITEWALKER && isWater(this.terrain[ti])) { u.hp -= 4; u.hurt = 20; }
    // 离水窒息（洪水/海啸退潮搁浅的生态闭环）：纯水生单位离水后缓慢缺氧（蹦跳自救需快于此——
    // 鱼约 300 tick 窒息 vs 蹦跳 5 格约 66 tick），防止陆生鱼群永久自续成「陆上鱼海」的退化生态
    if (def.aquatic && !def.beach && !isWater(this.terrain[ti])) { u.hp -= 0.02; u.hurt = Math.max(u.hurt, 2); }
    if (u.infected) {
      u.hp -= 0.15;
      if (this.rng() < 0.02) this.spreadPlague(u);
    }
    // 再生：特质或装备的缓慢回血（战斗外的顽强生命力）；巨魔天生再生
    if (u.hp > 0 && u.hp < u.maxHp) {
      const gb = def.isCiv ? this.gearBonus(u) : null;
      const rg = (u.trait ? TRAITS[u.trait]?.regen ?? 0 : 0) + (gb?.regen ?? 0) + (u.race === R.TROLL ? 0.35 : 0);
      if (rg > 0) u.hp = Math.min(u.maxHp, u.hp + rg);
    }
    // —— 捕食者饥饿账本：食物随时间消耗；断粮持续掉血（猎物丰欠决定捕食者兴衰 —— 真实 Lotka-Volterra 迟滞） ——
    if (def.predator && !def.undead) {
      u.food = (u.food ?? 70) - 1; // 旧档/新生的捕食者带 70 单位口粮缓冲（够长征到猎场）
      if (u.food <= 0) { u.hp -= 1.4; u.hurt = Math.max(u.hurt, 3); }
    }
    // 白行者寒霜灵气：途经之地霜冻成雪 + 熄灭周遭火焰 + 水面结成可行走的冰
    if (u.race === R.WHITEWALKER) {
      if (this.rng() < 0.08) {
        const j = idx(Math.floor(u.x + this.rng() * 3 - 1.5), Math.floor(u.y + this.rng() * 3 - 1.5));
        if (j >= 0 && j < W * H) {
          const t = this.terrain[j];
          if (t === T.GRASS || t === T.BURNT || t === T.SAND) this.setTerrain(j, T.SNOW);
          else if (t === T.FOREST && this.rng() < 0.4) this.setTerrain(j, T.SNOW);
          else if (isWater(t) && this.rng() < 0.5) this.setTerrain(j, T.ICE); // 冰封水面
          // 寒霜灭火：冰之主走过之处火焰奄灭
          if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); }
        }
      }
      // 白行者踏上水面时把脚下冻成冰（寒冰之路）
      if (isWater(this.terrain[ti]) && this.rng() < 0.6) this.setTerrain(ti, T.ICE);
    }
    if (u.hp <= 0) { u.dead = true; return; }

    // find enemy（同步清点邻近友军/敌群 —— 神经决策特征，零额外 isEnemy 调用）
    let enemy: Unit | null = null;
    let bestD = 7;
    let enemyD = 7; // 仇人加权后的「心理距离」与真实距离分离：选敌用加权、特征喂真实
    let allies = 0;
    let foes = 0;
    // 恐慌传染掷骰（每 update 至多一次）：惊恐者把恐惧传给 4 格内恐慌更低的同族 —— 雪崩传播链
    const contagious = (u.panic ?? 0) > 0.55 && this.rng() < 0.2;
    const cx = Math.min(this.bw - 1, Math.max(0, (u.x / 4) | 0));
    const cy = Math.min(this.bh - 1, Math.max(0, (u.y / 4) | 0));
    const uxx = u.x;
    const uyy = u.y;
    // —— Rust WASM 空间内核（Task 45-a）：位精确扫描替代 ——
    //    迭代序/敌意判定/恐慌传染与下方 JS 环逐行为一致（Rust 侧 js_min 已对齐 NaN 语义）；
    //    任何超限（血仇>32/传染溢出/未打包）自动回退 JS 原路径
    let wbScanApplied = false;
    if (WB.active() && !this._wbBatch) {
      const r = WB.scan(this, u, contagious, cx, cy);
      if (r) {
        if (r.enemySlot >= 0) {
          enemy = this.units[r.enemySlot];
          bestD = r.bestD;
          enemyD = r.enemyD;
        }
        allies = r.allies;
        foes = r.foes;
        for (let pk = 0; pk < r.panicN; pk++) this.units[r.panicSlots[pk]].panic = r.panicVals[pk];
        wbScanApplied = true;
      }
    }
    if (!wbScanApplied) {
    for (let by = cy - 1; by <= cy + 1; by++) {
      for (let bx = cx - 1; bx <= cx + 1; bx++) {
        if (bx < 0 || by < 0 || bx >= this.bw || by >= this.bh) continue;
        for (const o of this.buckets[by * this.bw + bx]) {
          if (o.dead || o === u) continue;
          const ddx = o.x - uxx;
          const ddy = o.y - uyy;
          if (this.isEnemyFast(u, o)) {
            foes++;
            const d2 = ddx * ddx + ddy * ddy;
            // 视野粗筛（平方空间）：无血仇记录时超出当前最优直接跳过；
            // 有血仇时心理距离可被拉近（加权因子 < 1），必须实距结算 —— 保持原语义
            if (u.gIds == null && d2 >= bestD * bestD) continue;
            const d = Math.sqrt(d2);
            // 血仇加权：仇人「心理距离」更近 —— 复仇优先锁定（涌现：舍近求远扑向仇敌）
            let wd = d;
            if (u.gIds) {
              const gi = u.gIds.indexOf(o.id);
              if (gi >= 0) wd = d * (1 - 0.42 * Math.min(1, (u.gVal?.[gi] ?? 1) / 2));
            }
            if (wd < bestD) { bestD = wd; enemy = o; enemyD = d; }
          } else if (u.civ >= 0 ? o.civ === u.civ : o.race === u.race) {
            allies++; // 同国同袍 / 野生同族（狼群/羊群）
            // 恐慌传染：惊恐传给近旁更冷静的同族（0.4×self，封顶 1）—— 兽群雪崩的微观动力（4² 平方距离判定）
            if (contagious && (o.panic ?? 0) < (u.panic ?? 0) - 0.15 && ddx * ddx + ddy * ddy < 16) {
              o.panic = Math.min(1, (o.panic ?? 0) + (u.panic ?? 0) * 0.4);
            }
          }
        }
      }
    }
    } // —— WASM/JS 扫描环分流结束 ——

    if (enemy && (u.caravan ?? 0) > 0) {
      // 深度打磨：商队不攻击 — 满载行商遇敌只会夺路而逃（可被劫杀，贸易中断）
      const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);
      u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 4));
      u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 4));
      this.moveUnit(u, 1.15); // 逃命加成
      return;
    }

    // —— 脱离冷却：战或逃/伤重脱离期间持续拉开距离，不接战（瞬态 fleeT）——
    // 恐慌溃逃者狂奔加速（1.18 → 1.32：夺路而逃顾不上队形）
    if (enemy && (u.fleeT ?? 0) > 0) {
      const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);
      u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 5));
      u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 5));
      this.moveUnit(u, (u.panic ?? 0) >= 0.5 ? 1.32 : 1.18);
      return;
    }

    // —— 涌现社会内核：恐慌溃逃 —— 恐惧压倒理性（网络判「战」也夺路而逃）；军团与亡灵除外 ——
    //    雪崩的宏观形态：狼群突入羊群 → 目击羊恐慌 → 同族传染 → 整群突破 0.72 阈值集体狂奔
    if (enemy && (u.panic ?? 0) >= ep('social.panicRout') && u.army == null && !def.undead) {
      u.fleeT = 60;
      const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);
      u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 5));
      u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 5));
      this.moveUnit(u, 1.3); // 夺路狂奔
      return;
    }

    // —— 神经决策核心③：战或逃 —— 野生动物/敌对种的重伤劣势脱离（465 参微型网络 · 0.2µs/次）——
    //    教师策略：饿兽拼命、伤兽弃猎、巨怪死战、弱兽避强 —— 旧版所有野怪死战到底
    //    （亡灵不知恐惧，不参与战或逃）
    if (enemy && (!def.isCiv || def.hostile) && !def.undead) {
      // 血仇上头：对仇敌时战力自信 +20%（仇恨压倒恐惧 —— 涌现复仇勇士）
      let myPow = u.dmg + u.hp / 8;
      if (u.gIds) {
        const gi = u.gIds.indexOf(enemy.id);
        if (gi >= 0) myPow *= 1 + 0.2 * Math.min(1, (u.gVal?.[gi] ?? 1) / 2);
      }
      const foePow = enemy.dmg + enemy.hp / 8;
      F_FLIGHT[0] = Math.max(0, u.hp) / u.maxHp;
      F_FLIGHT[1] = def.predator ? Math.max(0, Math.min(1, 1 - (u.food ?? 70) / 160)) : 0.5;
      F_FLIGHT[2] = myPow / (myPow + foePow);
      F_FLIGHT[3] = Math.max(0, enemy.hp) / enemy.maxHp;
      F_FLIGHT[4] = Math.min(12, enemyD) / 12;
      F_FLIGHT[5] = this.isHerbivoreRace(enemy.race) ? 1 : 0;
      F_FLIGHT[6] = Math.min(3, Math.max(0, foes - 1)) / 3;
      F_FLIGHT[7] = GameEngine.MONSTER_LOOT.has(u.race) ? 1 : 0;
      F_FLIGHT[8] = Math.min(20, u.kills) / 20;
      const flAct = neuroFlight(F_FLIGHT);
      // Task 38 在线采集：状态拷贝 + 双策略动作 + π_old（开关关闭时 no-op，<0.1µs）
      collectDecision(u.id, this.tickCount, this.isHerbivoreRace(u.race), F_FLIGHT, flAct);
      if (flAct === 1) {
        u.fleeT = 40; // 20 次更新内脱离接触
        const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);
        u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 5));
        u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 5));
        this.moveUnit(u, 1.2);
        return;
      }
    }

    if (enemy) {
      const rd = def.ranged;
      // 弓手/持弓者/火枪兵：远程射击（拉开距离放风筝；线膛枪科技加射程）
      const bowRange = ((u.job === 3 ? JOBS[3].ranged ?? 5 : 0) || (def.isCiv ? this.gearBonus(u).ranged : 0)) + (def.isCiv && u.civ >= 0 ? this.techModsOf(u.civ).range : 0);
      // —— 神经决策核心②：战斗姿态（追击接敌/原地坚守/且战且退/伤重脱离 —— 微型网络替代硬编码阈值链）——
      //    平滑策略替代阈值悬崖：法师风筝带 0.7×射程 / 弓手 0.45×射程 → 网络连续判定；
      //    新增能力：伤血过半且战力劣势的文明散兵主动撤出战斗（军团成员军令如山不撤）
      let myPow = u.dmg + u.hp / 8;
      if (u.gIds) {
        const gi = u.gIds.indexOf(enemy.id);
        if (gi >= 0) myPow *= 1 + 0.2 * Math.min(1, (u.gVal?.[gi] ?? 1) / 2); // 血仇上头
      }
      const foePow = enemy.dmg + enemy.hp / 8;
      F_STANCE[0] = Math.min(12, enemyD) / 12;
      F_STANCE[1] = Math.max(0, u.hp) / u.maxHp;
      F_STANCE[2] = Math.max(0, enemy.hp) / enemy.maxHp;
      F_STANCE[3] = rd || bowRange > 0 ? 1 : 0;
      F_STANCE[4] = Math.min(8, rd ? rd.range : bowRange) / 8;
      F_STANCE[5] = Math.min(2, def.reach ?? 0.9) / 2;
      F_STANCE[6] = rd ? 1 : 0;
      F_STANCE[7] = myPow / (myPow + foePow);
      F_STANCE[8] = Math.min(4, allies) / 4;
      F_STANCE[9] = u.army != null ? 1 : 0;
      F_STANCE[10] = def.isCiv ? 1 : 0;
      F_STANCE[11] = Math.min(20, u.kills) / 20;
      const stance = neuroStance(F_STANCE);
      if (stance === 3) {
        // 伤重脱离：劣势散兵撤出战斗保全性命（撤离期间 fleeT 冷却，脱离接触）
        u.fleeT = 50;
        const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);
        u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 6));
        u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 6));
        this.moveUnit(u, 1.15);
        return;
      }
      if (rd && enemyD > 1.6 && enemyD <= rd.range) {
        // 法师远程火球：拉开距离释放（风筝走位）
        if (u.cd <= 0) {
          u.cd = rd.cd;
          u.atk = 10; // 施法动画
          this.castFireball(u, enemy.x + this.rng() * 0.6 - 0.3, enemy.y + this.rng() * 0.6 - 0.3, rd.dmg);
        }
        if (stance === 2) {
          // 风筝带（0.7×射程）内且战且退；带外站桩吟唱（旧版无条件后撤会自行退出射程 —— 震荡根治）
          const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);
          u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 3));
          u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 3));
          this.moveUnit(u, 0.6);
        }
      } else if (bowRange > 0 && enemyD > 1.4 && enemyD <= bowRange) {
        // 弓手/火枪兵/能量枪兵：射程内射击，近身时后撤
        const gun = u.wep === 'musket' || u.wep === 'rifle';
        const beam = u.wep === 'laser_rifle';
        if (u.cd <= 0) {
          u.cd = beam ? 12 : gun ? 15 : 18; // 能量武器射速最快
          u.atk = 10; // 拉弓/瞄准动画
          const mul = def.isCiv && u.civ >= 0 ? this.techModsOf(u.civ).archer : 1;
          // 弹道预测：瞄准目标提前量（飞行期间目标仍在移动）
          const aim = this.leadAim(enemy, beam ? 8 : gun ? 5 : 12);
          if (beam) this.castBeam(u, aim.x, aim.y, u.dmg * 0.75 * mul);
          else if (gun) this.castBullet(u, aim.x, aim.y, u.dmg * mul);
          else this.castArrow(u, aim.x, aim.y, u.dmg * mul);
        }
        if (stance === 2) {
          // 近距风筝带（0.45×射程）内拉开距离 —— 网络连续判定替代硬阈值
          const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);
          u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 3));
          u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 3));
          this.moveUnit(u, 0.7);
        }
      } else if (enemyD < (def.reach ?? 0.9)) {
        if (u.cd <= 0) {
          // 武器攻速：匕首快/巨斧慢（装备 speedMul 终于接入攻击节奏）
          const wspeed = def.isCiv ? this.gearBonus(u).speed : 1;
          u.cd = Math.round(14 / wspeed);
          u.atk = 12; // 挥击动画窗口
          // —— 克拉肯：触手拖拽船只入渊（对航海者双倍伤害 + 击沉概率）——
          if (u.race === R.KRAKEN && enemy.boat) {
            enemy.hp -= u.dmg * 2;
            enemy.hurt = 20;
            if (this.rng() < 0.3) {
              enemy.dead = true;
              WB.syncDead(enemy); // WASM 镜像：后续扫描即刻跳过亡者
              enemy.boat = 0;
              this.fx('explosion', enemy.x, enemy.y, 16, { r: 1.6 });
              this.addEvent('shipwreck', `「${enemy.name}」的航船被克拉肯拖入了深渊`, { x: enemy.x, y: enemy.y });
            } else {
              this.fx('tsunami', enemy.x, enemy.y, 12, { r: 2.5, quiet: true });
            }
            return;
          }
          // —— 沙虫：吞噬 —— 小型猎物直接囫囵吞下（血雾飞溅，连残骸都不剩）
          if (u.race === R.SANDWORM && enemy.hp <= enemy.maxHp * 0.4) {
            enemy.hp = 0;
            enemy.dead = true;
            WB.syncDead(enemy); // WASM 镜像同步
            u.kills++;
            u.food = Math.min(160, (u.food ?? 0) + 50 + Math.round(enemy.maxHp * 0.6)); // 吞噬得饱
            this.fx('blood', enemy.x, enemy.y, 16);
            if (this.fxPrefs.dmgNumbers) this.fx('dmg', enemy.x, enemy.y, 26, { text: '吞噬' });
            return;
          }
          // —— 蛇怪：石化凝视 —— 8% 概率将猎物当场化为石像 ——
          if (u.race === R.BASILISK && this.rng() < 0.08) {
            enemy.hp = 0;
            enemy.dead = true;
            WB.syncDead(enemy); // WASM 镜像同步
            u.kills++;
            this.addCorpse(enemy.x, enemy.y, true, false);
            this.addEvent('petrify', `「${enemy.name}」与蛇怪对视，化作了石像`, { x: enemy.x, y: enemy.y });
            if (this.fxPrefs.dmgNumbers) this.fx('dmg', enemy.x, enemy.y, 30, { text: '石化' });
            return;
          }
          // —— 命中判定 → 神经决策核心①：微型网络命中头（16 隐单元 sigmoid）替代 12 分支判定链 ——
          //    特征同源：经验/敏捷差/体型特质/神力/地形掩护；0.36µs/次 · |Δ|≤0.02 一致率 98.7%
          //    （掷骰仍在引擎 —— 网络只负责给出命中概率，行为分布与教师策略一致）
          {
            const rd2 = RACES[enemy.race];
            const eix = idx(Math.floor(Math.max(0, Math.min(W - 1, enemy.x))), Math.floor(Math.max(0, Math.min(H - 1, enemy.y))));
            F_ACC[0] = Math.min(20, u.kills) / 20; // 百战老兵更准
            F_ACC[1] = Math.min(0.5, Math.max(0, (rd2.speed - def.speed) * 7)) * 2; // 目标敏捷差
            F_ACC[2] = enemy.trait === 'tiny' ? 1 : 0; // 侏儒难打
            F_ACC[3] = enemy.trait === 'swift' ? 1 : 0; // 迅捷难打
            F_ACC[4] = enemy.trait === 'giant' ? 1 : 0; // 巨型好打
            F_ACC[5] = u.trait === 'tiny' ? 1 : 0;
            F_ACC[6] = u.bless ? 1 : 0;
            F_ACC[7] = u.curse ? 1 : 0;
            F_ACC[8] = this.terrain[eix] === T.FOREST ? 1 : 0; // 林间掩护
            F_ACC[9] = this.terrain[eix] === T.MOUNTAIN ? 1 : 0; // 山地高下差
            if (this.rng() > Math.max(0.35, Math.min(0.97, neuroAcc(F_ACC)))) {
              // 挥空：保留挥击动画，这一击落空（目标反打不受阻）
              if (this.fxPrefs.dmgNumbers && this.rng() < 0.55) this.fx('dmg', enemy.x, enemy.y - 0.4, 20, { text: '闪' });
              return;
            }
          }
          // —— 装备战斗结算：暴击 → 目标减伤 → 吸血 → 反伤 ——
          const gA = def.isCiv ? this.gearBonus(u) : null;
          const gD = RACES[enemy.race].isCiv ? this.gearBonus(enemy) : null;
          // 神力增益：祝福伤害 ×1.3 / 诅咒伤害 ×0.75
          let dmg = u.dmg * (0.8 + this.rng() * 0.4) * (u.bless ? 1.3 : 1) * (u.curse ? 0.75 : 1);
          // —— 城墙防御加成：守军借墙而战（围城/城堡战中守方优势） ——
          dmg *= this.wallDefenseOf(enemy);
          // —— 昼夜互连：夜战混乱减益 ×0.92（黑暗中的慌乱）—— 黑暗视觉种族（兽人/哥布林）不受影响
          const dPhase = this.dayPhase();
          if (dPhase > 0.5 && dPhase < 0.9 && !def.nightsight) dmg *= 0.92;
          let crit = false;
          if (gA && gA.crit > 0 && this.rng() * 100 < gA.crit) {
            dmg *= 2.2;
            crit = true;
          }
          if (gD && gD.armor > 0) dmg *= 1 - gD.armor / 100;
          enemy.hp -= dmg;
          enemy.hurt = 20;
          this.fx('hit', (u.x + enemy.x) / 2, (u.y + enemy.y) / 2, 6);
          // 血溅：受击飞溅（原子级战斗反馈，可在画面设置中关闭）
          if (this.fxPrefs.blood && dmg >= 5 && this.rng() < 0.5) this.addBlood(enemy.x, enemy.y, false);
          // 蛇怪毒牙：命中后高概率使受害者中毒
          if (u.race === R.BASILISK && this.rng() < 0.45 && !enemy.infected && !(enemy.trait ? TRAITS[enemy.trait]?.immune : false)) {
            enemy.infected = true;
            if (this.fxPrefs.dmgNumbers) this.fx('dmg', enemy.x, enemy.y - 0.8, 26, { text: '毒' });
          }
          // 伤害数字：较大的伤害或 40% 概率显示，避免 8x 速下刷屏（可在画面设置中关闭）
          if (this.fxPrefs.dmgNumbers && (crit || dmg >= 12 || this.rng() < 0.4)) {
            this.fx('dmg', enemy.x, enemy.y, 26, { text: (crit ? '暴' : '') + '-' + Math.round(dmg) });
          }
          // 吸血鬼吮血：按造成伤害大幅回血（永生之秘）
          if (u.race === R.VAMPIRE && u.hp > 0) {
            u.hp = Math.min(u.maxHp, u.hp + dmg * 0.6);
            if (this.fxPrefs.dmgNumbers && this.rng() < 0.4) this.fx('heart', u.x, u.y - 0.5, 18);
          }
          // 吸血：按造成伤害回血
          if (gA && gA.lifesteal > 0 && u.hp > 0) {
            u.hp = Math.min(u.maxHp, u.hp + (dmg * gA.lifesteal) / 100);
          }
          // 反伤：攻击者受到固定反弹伤害
          if (gD && gD.thorns > 0) {
            u.hp -= gD.thorns;
            u.hurt = 14;
            if (u.hp <= 0) { u.dead = true; }
          }
          // 蝎子的毒刺：命中后有概率使受害者染病（可被治疗神力清除；免疫特质者不受）
          if (u.race === R.SCORPION && this.rng() < 0.3 && !enemy.infected && !(enemy.trait ? TRAITS[enemy.trait]?.immune : false)) {
            enemy.infected = true;
            if (this.fxPrefs.dmgNumbers) this.fx('dmg', enemy.x, enemy.y - 0.8, 26, { text: '毒' });
          }
          // 蛇的毒牙：命中后有概率使受害者中毒（可被治疗神力清除，与蝎子共用感染机制）
          if (u.race === R.SNAKE && this.rng() < 0.3 && !enemy.infected && !(enemy.trait ? TRAITS[enemy.trait]?.immune : false)) {
            enemy.infected = true;
            if (this.fxPrefs.dmgNumbers) this.fx('dmg', enemy.x, enemy.y - 0.8, 26, { text: '毒' });
          }
          // 记录战斗位置（战争前线红闪，30 tick 衰减窗口保证 1x/8x 下均可见）
          const bi = idx(Math.floor(enemy.x), Math.floor(enemy.y));
          this.activeBattles.set(bi, this.tickCount + 30);
          if (this.activeBattles.size > 64) {
            // 上限保护：过期优先淘汰
            for (const [k, exp] of this.activeBattles) {
              if (exp <= this.tickCount) this.activeBattles.delete(k);
            }
          }
          if (enemy.hp <= 0) {
            // 蛇怪的凝视未及发动时，直接击杀仍会留下尸骸
            const zomb = u.race === R.ZOMBIE && RACES[enemy.race].isCiv && this.laws.zombieInfect;
            if (zomb) {
              this.zombify(enemy);
            } else {
              enemy.dead = true;
              WB.syncDead(enemy); // WASM 镜像：击杀即刻同步
              u.kills++;
              // —— 涌现社会内核：目睹死亡广播（恐慌上涌 + 血仇记账，一次遍历双产出） ——
              this.witnessDeath(u, enemy);
              // —— 复仇结算：手刃仇敌 → 恩怨两清（12% 采样播报防刷屏） ——
              if (u.gIds) {
                const rgi = u.gIds.indexOf(enemy.id);
                if (rgi >= 0) {
                  u.gIds.splice(rgi, 1);
                  u.gVal?.splice(rgi, 1);
                  if (!u.gIds.length) { u.gIds = undefined; u.gVal = undefined; }
                  if (this.rng() < 0.12) this.addEvent('revenge', `「${u.name}」手刃仇敌「${enemy.name}」，血仇得报`, { x: u.x, y: u.y });
                }
              }
              // —— 家族战功：族人每一击杀都记在家族名下；十杀英雄光耀门楣 ——
              if (u.fam != null) {
                const rf = this.families.get(u.fam);
                if (rf) {
                  rf.kills++;
                  if (u.kills === 10) {
                    rf.heroes++;
                    this.addEvent('lineage', `「${rf.name}」家族的 ${u.name} 阵斩十敌，成为家族英雄（先祖 ${rf.founder}）`, { x: u.x, y: u.y });
                  }
                }
              }
              // Task 38 在线采集：击杀奖励按牺牲者体量（会话继续 —— 连续作战）
              collectKill(u.id, enemy.maxHp);
              // —— 捕食者进食：猎物倒下 → 饥饿账本回充（猎物越大越饱 —— 种群随猎物涨落） ——
              if (def.predator && !def.undead) u.food = Math.min(160, (u.food ?? 0) + 55 + Math.round(enemy.maxHp * 0.5));
              // 屠龙计数（成就：凡人斩落巨龙）
              if (enemy.race === R.DRAGON) this.statDragonsSlain++;
              // —— 战争体系：击杀结算（分数/军团战功/总动员计数）——
              this.onWarKill(u, enemy);
              if (u.kills === 10) {
                this.toast(`${u.name} 已斩获 10 次击杀`, 'info');
                this.addEvent('legend', `传奇武士 ${u.name}（${u.civ >= 0 ? this.civs[u.civ]?.name ?? '流浪' : RACES[u.race].name}）达成了 10 次击杀`, { x: u.x, y: u.y });
              }
              // 白行者击杀：寒冰将其复活为骷髅（亡者军团扩张）
              if (u.race === R.WHITEWALKER && RACES[enemy.race].isCiv) {
                this.riseSkeleton(enemy.x, enemy.y);
              }
              // 亡者复生法则：战死的文明生物有小概率原地复生
              if (this.laws.undeadRise && RACES[enemy.race].isCiv && this.rng() < 0.06) {
                this.riseSkeleton(enemy.x, enemy.y);
              }
            }
          }
        }
      } else if (stance === 2 && (rd || bowRange > 0)) {
        // 射程死区（近到无法开火、远于触及）：网络判定拉开距离恢复射程（旧版会一头撞进近战）
        const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);
        u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 3));
        u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 3));
        this.moveUnit(u, 0.8);
      } else {
        if (!u.detour) { u.tx = enemy.x; u.ty = enemy.y; } // 绕行期间不覆写（卡死自愈）
        this.moveUnit(u, 1.25);
      }
    } else {
      // Task 38 在线采集：敌人不在视野（走出视野/被他人击杀）→ 遭遇会话结算（Map 空查 no-op）
      collectEnemyGone(u.id, this.tickCount);
      // peaceful behaviors
      if (u.race === R2) {
        u.breath -= 2;
        if (u.breath <= 0) {
          u.breath = 150 + Math.floor(this.rng() * 150);
          this.dragonBreath(u);
        }
      }
      // 注：天使治愈光环不在 updateUnit 内 —— 天使是和平野生单位，会被 rust 批内核
      // 整批接管（TS 和平分支不执行）；光环改由引擎级 angelAuraTick() 驱动（见 tick 通道）。
      if (def.isCiv && u.civ >= 0) {
        const job = u.job ?? 0;
        const warring = this.civAtWar(u.civ);
        // —— 国民防灾（最高优先级：火不等人；军团成员除外——军令如山）——
        // 大面积火情 → 全民动员模式：响应半径与出勤率提升（灾情动员）
        const bigFire = this.fireSet.size > 8;
        if (u.army == null && this.fireSet.size > 0 && this.rng() < (bigFire ? 0.5 : 0.3)) {
          const radius = job === 4 ? (bigFire ? 7 : 4.5) : bigFire ? 5 : 3;
          const fi = this.fireNear(u, radius);
          if (fi >= 0) {
            const fxp = (fi % W) + 0.5;
            const fyp = ((fi / W) | 0) + 0.5;
            const cdx = fxp - u.x;
            const cdy = fyp - u.y;
            if (cdx * cdx + cdy * cdy < 2.89) { // 1.7²：平方距离判定（纯阈值比较）
              this.extinguishFire(fi, u);
              u.cd = Math.max(u.cd, 10); // 泼水动作
            } else {
              u.tx = fxp;
              u.ty = fyp;
              this.moveUnit(u, 1.2);
              return; // 赶赴火场（本 tick 优先救灾）
            }
          }
        }
        // —— 建筑师：主动奔赴受损建筑修缮（战争不纵火，但拆毁与天灾依旧留下疮痍）——
        if (u.army == null && job === 4 && u.cd <= 0 && this.rng() < 0.2) {
          const di = this.damagedNear(u, 14);
          const b = di >= 0 ? this.buildings[this.bIdx.get(di) ?? -1] : null;
          if (b) {
            const bdx = b.x + 0.5 - u.x;
            const bdy = b.y + 0.5 - u.y;
            if (bdx * bdx + bdy * bdy < 3.24) { // 1.8²：平方距离判定（纯阈值比较）
              u.cd = 16;
              u.atk = 10; // 敲击动画
              this.repairBuilding(di, 12 * this.techModsOf(u.civ).repair, u);
            } else {
              u.tx = b.x + 0.5;
              u.ty = b.y + 0.5;
              this.moveUnit(u, 1.15);
              return; // 赶赴工地
            }
          }
        }
        // —— 路过国民顺手修缮身边受损建筑（平民皆可搭把手）——
        if (u.army == null && job !== 2 && job !== 3 && u.cd <= 0 && this.damagedSet.size > 0 && this.rng() < 0.12) {
          const di = this.damagedNear(u, 1.9);
          if (di >= 0) {
            u.cd = 22;
            this.repairBuilding(di, 3, u);
          }
        }
        // —— 战争 AI：战士/弓手围攻敌国建筑（战争毁灭房屋的核心链路）——
        if (warring && (job === 2 || job === 3)) {
          const inArmy = u.army != null;
          // 相邻敌建筑 → 近战拆毁（3x3 tile 内检索，低开销；军团成员围城时同样执行）
          if (u.cd <= 0) {
            const bi = this.enemyBuildingNear(u, 1.6);
            if (bi >= 0) {
              u.cd = 14;
              u.atk = 12; // 拆城挥击动画
              this.attackBuilding(bi, u.dmg * 1.6, u.civ);
            }
          }
          // 弓手：射程内敌建筑 → 箭矢轰击（概率节流）
          if (job === 3 && u.cd <= 0 && this.rng() < 0.1) {
            const bi = this.enemyBuildingNear(u, JOBS[3].ranged ?? 5);
            if (bi >= 0) {
              u.cd = 18;
              this.castArrow(u, (bi % W) + 0.5, ((bi / W) | 0) + 0.5, u.dmg);
            }
          }
          // 军团成员：阵位/冲锋目标由 armyTick 统一驱动（不再自行寻的/登船）
          if (!inArmy) {
            // 跨海远征：隔海目标周期性尝试登船（沿岸滑行的单位不会触发 moveUnit 阻断分支，
            // 必须主动检查 — maybeBoardForWar 内部有距离/跨水率/锚地完整校验）
            if (this.rng() < 0.05 && this.maybeBoardForWar(u)) return;
            // 推进至最近的敌建筑（抵达或偶发重定目标；1.2² 平方距离判定）
            {
              const tdx = u.tx - u.x;
              const tdy = u.ty - u.y;
              if (tdx * tdx + tdy * tdy < 1.44 || this.rng() < 0.03) {
                const tgt = this.nearestEnemyBuilding(u);
                if (tgt) { u.tx = tgt.x + this.rng() * 2 - 1; u.ty = tgt.y + this.rng() * 2 - 1; }
              }
            }
          }
        } else if (job === 1 && this.rng() < 0.06) {
          // 农民：在王国农田周边劳作
          const f = this.nearestBuildingOf(u, BUILD_KINDS.FARM);
          if (f) {
            u.tx = Math.max(1, Math.min(W - 2, f.x + this.rng() * 5 - 2.5));
            u.ty = Math.max(1, Math.min(H - 2, f.y + this.rng() * 5 - 2.5));
          }
        } else if (job === 5) {
          // 商人：往来集市/王都贸易，抵达时为国库入账
          const civ = this.civs[u.civ];
          {
            const tdx = u.tx - u.x;
            const tdy = u.ty - u.y;
            if (civ && (tdx * tdx + tdy * tdy < 1.44 || this.rng() < 0.03)) { // 1.2² 平方距离判定
              const m = this.nearestBuildingOf(u, this.rng() < 0.6 ? BUILD_KINDS.MARKET : BUILD_KINDS.CAPITAL);
              if (m) {
                u.tx = m.x + this.rng() * 2 - 1;
                u.ty = m.y + this.rng() * 2 - 1;
                const mdx = u.x - m.x;
                const mdy = u.y - m.y;
                if (mdx * mdx + mdy * mdy < 2.25) { // 1.5² 平方距离判定
                  civ.gold = (civ.gold ?? 0) + 2;
                  this.fx('coin', u.x, u.y - 1, 24);
                }
              }
            }
          }
        } else if (job === 6 && this.rng() < 0.06) {
          // 贵族：居于王都
          const civ = this.civs[u.civ];
          if (civ && civ.capital >= 0) {
            const cx = this.tileX(civ.capital);
            const cy = this.tileY(civ.capital);
            u.tx = Math.max(1, Math.min(W - 2, cx + this.rng() * 6 - 3));
            u.ty = Math.max(1, Math.min(H - 2, cy + this.rng() * 6 - 3));
          }
        } else if (this.rng() < 0.02) {
          // march to war
          const target = this.warTarget(u.civ);
          if (target) { u.tx = target.x + this.rng() * 4 - 2; u.ty = target.y + this.rng() * 4 - 2; }
        }
      }
      if (this.updateUnitTailJS(u)) return; // 尾段早退（猎物命中/密度场导航）→ 跳过拾取与繁衍
    }
    this.updateUnitPostJS(u);
  }

  /** 尾段（Stage 2 共享）：商队导航 / 捕食者索敌 / 漫游 / 移动 / 拾取 / 繁衍 —— updateUnit 与 wbResume 共用 */
  private updateUnitTailJS(u: Unit): boolean {
    const def = RACES[u.race];
      // 深度打磨：贸易商队 — 全程奔向伙伴市场，不受随机漫游覆盖；抵达即结算
      if ((u.caravan ?? 0) > 0) {
        const pc = this.civs[u.caravan!];
        const mi = pc && pc.alive ? this.marketIdx.get(u.caravan!) : undefined;
        if (mi == null) {
          u.caravan = 0; // 伙伴亡国/市场尽毁 → 就地转为行商
          WBB.touchMeta(); // Task 50：caravan 列 JS 写点收口（bail 轻重打包依赖漏斗，防镜像漂移）
        } else {
          u.tx = (mi % W) + 0.5;
          u.ty = ((mi / W) | 0) + 0.5;
          const cdx = u.x - u.tx;
          const cdy = u.y - u.ty;
          if (cdx * cdx + cdy * cdy < 3.24) this.caravanArrive(u); // 1.8² 平方距离判定
        }
      }
      // —— 捕食者索敌（猎手嗅觉）：饥饿时大范围搜索猎物并循味逼近（不再守株待兔地瞎逛） ——
      if (def.predator && !def.undead && (u.food ?? 99) < 70 && this.rng() < 0.4) {
        const hx = Math.min(this.bw - 1, Math.max(0, (u.x / 4) | 0));
        const hy = Math.min(this.bh - 1, Math.max(0, (u.y / 4) | 0));
        let prey: Unit | null = null;
        let preyD2 = 26 * 26; // 嗅觉半径平方（远超遭遇视野 —— 能跨地域找到相邻羊群；纯阈值比较走平方距离）
        for (let by = hy - 6; by <= hy + 6; by++) {
          for (let bx = hx - 6; bx <= hx + 6; bx++) {
            if (bx < 0 || by < 0 || bx >= this.bw || by >= this.bh) continue;
            for (const o of this.buckets[by * this.bw + bx]) {
              if (o.dead || o === u) continue;
              if (!this.isHerbivoreRace(o.race)) continue;
              const pdx = o.x - u.x;
              const pdy = o.y - u.y;
              const pd2 = pdx * pdx + pdy * pdy;
              if (pd2 < preyD2) { preyD2 = pd2; prey = o; }
            }
          }
        }
        if (prey && !u.detour) { u.tx = prey.x; u.ty = prey.y; this.moveUnit(u, 1.15); return true; }
        // 嗅觉内无猎物 → 猎物密度场导航：朝猎物最富集的逃区进发（跨地域长征 —— 不再原地打转饿死）
        if (!u.detour) {
          const gx = Math.min(31, Math.max(0, (u.x / 8) | 0));
          const gy = Math.min(19, Math.max(0, (u.y / 8) | 0));
          let bestCell = -1;
          let bestScore = 0;
          for (let cy2 = Math.max(0, gy - 3); cy2 <= Math.min(19, gy + 3); cy2++) {
            for (let cx2 = Math.max(0, gx - 3); cx2 <= Math.min(31, gx + 3); cx2++) {
              const c = this.preyGrid[cy2 * 32 + cx2];
              if (c <= 0) continue;
              const d = Math.hypot(cx2 - gx, cy2 - gy);
              if (d < 0.9) continue; // 本区已有猎（在嗅觉内却没扫到 —— 等下一轮）
              const score = c / (1 + d * 0.8);
              if (score > bestScore) { bestScore = score; bestCell = cy2 * 32 + cx2; }
            }
          }
          if (bestCell >= 0) {
            u.tx = Math.max(1, Math.min(W - 2, (bestCell % 32) * 8 + 4 + (this.rng() * 4 - 2)));
            u.ty = Math.max(1, Math.min(H - 2, ((bestCell / 32) | 0) * 8 + 4 + (this.rng() * 4 - 2)));
            this.moveUnit(u, 1.15);
            return true;
          }
        }
      }
      // —— 鱼群结队（5-10 群游）：偶尔向邻近同类鱼的重心靠拢（集体游弋的观感；浅扫 3×3 桶，开销可控） ——
      if (u.race === R.FISH && this.rng() < 0.12) {
        const hx = Math.min(this.bw - 1, Math.max(0, (u.x / 4) | 0));
        const hy = Math.min(this.bh - 1, Math.max(0, (u.y / 4) | 0));
        let ax = 0, ay = 0, n = 0;
        for (let by = hy - 1; by <= hy + 1; by++) {
          for (let bx = hx - 1; bx <= hx + 1; bx++) {
            if (bx < 0 || by < 0 || bx >= this.bw || by >= this.bh) continue;
            for (const o of this.buckets[by * this.bw + bx]) {
              if (o === u || o.dead || o.race !== R.FISH) continue;
              const dx2 = o.x - u.x;
              const dy2 = o.y - u.y;
              if (dx2 * dx2 + dy2 * dy2 > 36) continue; // 6 格内的同群鱼
              ax += o.x; ay += o.y; n++;
            }
          }
        }
        if (n >= 2) {
          const gx2 = ax / n;
          const gy2 = ay / n;
          // 鱼群中心必须是水域：搁浅个体会把同群目标拽上岸（洪水退潮搁浅扩散源之一）
          if (isWater(this.terrain[idx(Math.max(0, Math.min(W - 1, Math.floor(gx2))), Math.max(0, Math.min(H - 1, Math.floor(gy2))))])) {
            u.tx = Math.max(1, Math.min(W - 2, gx2 + (this.rng() - 0.5) * 2));
            u.ty = Math.max(1, Math.min(H - 2, gy2 + (this.rng() - 0.5) * 2));
          }
        }
      }
      // 随机漫游触发判定（0.5² 平方距离：纯阈值比较，无需实距）
      const ndx = u.tx - u.x;
      const ndy = u.ty - u.y;
      if ((u.caravan ?? 0) === 0 && (ndx * ndx + ndy * ndy < 0.25 || this.rng() < 0.02)) {
        const r = u.race === R.SHEEP ? 2.5 : u.race === R2 ? 9 : 5;
        let wx = u.x + (this.rng() * 2 - 1) * r;
        let wy = u.y + (this.rng() * 2 - 1) * r;
        // 饥饿捕食者的逐草而行：食草动物活在草原 —— 顺着植被走就能找到猎场（跨地域觅食）
        if (def.predator && !def.undead && (u.food ?? 99) < 55) {
          for (let k = 0; k < 3; k++) {
            const gx = u.x + (this.rng() * 2 - 1) * 14;
            const gy = u.y + (this.rng() * 2 - 1) * 14;
            const gj = idx(Math.max(0, Math.min(W - 1, Math.floor(gx))), Math.max(0, Math.min(H - 1, Math.floor(gy))));
            const tt = this.terrain[gj];
            if ((tt === T.GRASS || tt === T.FOREST) && this.building[gj] === 0) { wx = gx; wy = gy; break; }
          }
        }
        // 蟹：滩涂限定 —— 游荡目标须为水域或邻水沙滩（离岸沙丘不去；4 次重选仍不合法则
        // 原地停留，防止 inland 沙漠安家）
        if (u.race === R.CRAB) {
          let ok = false;
          for (let k = 0; k < 4 && !ok; k++) {
            const cx2 = Math.max(0, Math.min(W - 1, Math.floor(wx)));
            const cy2 = Math.max(0, Math.min(H - 1, Math.floor(wy)));
            const cj = cy2 * W + cx2;
            const ct = this.terrain[cj];
            if (isWater(ct)) ok = true;
            else if (ct === T.SAND) {
              ok = (cx2 > 0 && isWater(this.terrain[cj - 1])) || (cx2 < W - 1 && isWater(this.terrain[cj + 1]))
                || (cy2 > 0 && isWater(this.terrain[cj - W])) || (cy2 < H - 1 && isWater(this.terrain[cj + W]));
            }
            if (!ok) { wx = u.x + (this.rng() * 2 - 1) * r; wy = u.y + (this.rng() * 2 - 1) * r; }
          }
          if (!ok) { wx = u.x; wy = u.y; }
        }
        // 纯水生（鱼/龟/鲨）：游荡目标必须为水域 —— 海啸/洪水退潮搁浅的入口封锁；
        // 已搁浅个体则把目标导向最近水域（配合 moveUnit 搁浅蹦跳完成自救回归）
        else if (def.aquatic) {
          let ok = false;
          for (let k = 0; k < 4 && !ok; k++) {
            const cx2 = Math.max(0, Math.min(W - 1, Math.floor(wx)));
            const cy2 = Math.max(0, Math.min(H - 1, Math.floor(wy)));
            if (isWater(this.terrain[cy2 * W + cx2])) ok = true;
            else { wx = u.x + (this.rng() * 2 - 1) * r; wy = u.y + (this.rng() * 2 - 1) * r; }
          }
          if (!ok) {
            const w = isWater(this.terrain[idx(Math.floor(u.x), Math.floor(u.y))]) ? null : this.findWaterNear(u.x, u.y, 14);
            if (w) { wx = w.x; wy = w.y; } else { wx = u.x; wy = u.y; }
          }
        }
        u.tx = Math.max(1, Math.min(W - 2, wx));
        u.ty = Math.max(1, Math.min(H - 2, wy));
      }
    this.moveUnit(u, 1);
      return false;
  }

  /** 后段（Stage 2 共享）：宝物拾取 + 繁衍 —— 无敌尾与接敌追击共用 */
  private updateUnitPostJS(u: Unit) {
    const def = RACES[u.race];
    // 宝物拾取：文明生物与强盗经过地面物品时自动装备更强的；捕食者顺路捡食肉
    if (this.items.length > 0 && (def.isCiv || u.race === R.BANDIT || (def.predator && !def.undead))) {
      this.tryPickup(u);
    }
    // reproduce — 与战斗状态无关（否则被猎物包围的捕食者永不绝育 → 种群灭绝）
    // 繁衍：两段式 —— 先掷基础骰（绝大多数单位此 tick 直接跳过），过门再算增益（懒计算省 CPU）
    // 搁浅的水生个体失去繁衍能力（离水濒死不产卵 —— 否则陆生鱼群自续成退化生态；beachT 由 beachedAquaticTick 维护）
    if (this.laws.reproduction && def.repro > 0 && !(def.aquatic && !def.beach && (u.beachT ?? 0) > 0) && this.rng() < def.repro) {
      // 增益链：人口令 ×1.8 / 科技繁衍 / 爱之甘霖 ×2.5 / 基因繁衍 / 自然季节
      // 战乱年代生育率 ×0.55（兵荒马乱）；食草动物随植被丰度 ×0.75..1.5（草肥羊壮）
      const boost = (def.isCiv && u.civ >= 0 && this.activeDirective(u.civ, 'populate') ? 1.8 : 1)
        * (def.isCiv && u.civ >= 0 ? this.techModsOf(u.civ).repro * (1 + this.ideaModsOf(u.civ).repro) : 1)
        * (u.fert ? 2.5 : 1)
        * (u.gene?.r ?? 1) // v3：全体单位的基因繁衍乘数（文明种族也在自然选择中演化）
        * ((u.panic ?? 0) >= 0.5 ? 0.3 : 1) // 涌现社会内核：惊魂未定者无心繁衍（猎食压力抑制生育 —— 恐慌的种群级效应）
        * (def.isCiv ? 0.85 + (def.growth ?? 0.5) * 0.3 : 1) // 种族系统 v2：繁衍倾向（哥布林 1.11×/精灵 0.94×）
        * this.nature.reproMul()
        * (def.isCiv && u.civ >= 0 && this.civAtWar(u.civ) ? 0.55 : 1)
        * (!def.isCiv && !def.predator ? 0.75 + Math.min(0.75, this.grassTiles / 16000) : 1)
        // 捕食者丰猎增益：吃得越饱生得越多（1.6..3×）—— 猎物涨 → 狼群兴；猎物跌 → 绝育
        // （无此增益时繁衍间隔 > 寿命 → 世代衰减灭绝 —— Lotka-Volterra 的繁殖腿）
        * (def.predator ? 1.6 + Math.min(1.4, Math.max(0, (u.food ?? 0) - 40) / 85) : 1)
        * ep('pop.reproMul'); // v40 热参数：全体繁衍全局乘数（神谕可热调）
      // 捕食者繁衍门槛：饥饿账本充盈（food > 40）才生育 —— 猎物稀少时种群自我收缩（Lotka-Volterra 迟滞）
      if ((!def.predator || (u.food ?? 0) > 40) && this.rng() < boost) {
        if (def.isCiv) {
          const civ = this.civs[u.civ];
          if (civ && civ.alive && civ.pop < this.popCapOf(civ) + 6 && this.units.length < MAX_UNITS) {
            // v3：文明子代也遗传基因（±变异 + 环境选择压力）—— 文明种族在代代繁衍中演化
            const cg = this.childGene(u);
            const traitKey = this.tryEmergentTrait(u, cg);
            // 家族谱系：子随母姓（fgn+1 代代相传）；无姓者 25% 概率为子嗣开宗立姓
            const fam = u.fam ?? (this.rng() < 0.25 ? this.newFamily(u.race, u).id : undefined);
            this.spawnUnit(u.race, u.x + this.rng() - 0.5, u.y + this.rng() - 0.5, { civ: u.civ, silent: true, gene: cg, trait: traitKey ?? undefined, fam, fgn: fam !== undefined ? (u.fgn ?? 1) + 1 : undefined });
            this.fx('heart', u.x, u.y - 1, 40);
          }
        } else {
          const cap = this.wildCapOf(u.race);
          // O(1) 分种族计数（替代 O(N) 全表扫描 —— 千单位时每次生育省一次全表遍历）
          const same = this.wildCount.get(u.race) ?? 0;
          if (same < cap) {
            // 子代基因：母代基因 + 环境偏向突变（进化引擎）+ v3 涌现特质分化
            const cg = this.childGene(u);
            const traitKey = this.tryEmergentTrait(u, cg);
            // 家族谱系：兽群血脉（同种代代相传）；无姓者 25% 概率为子嗣开宗立姓
            const fam = u.fam ?? (this.rng() < 0.25 ? this.newFamily(u.race, u).id : undefined);
            this.spawnUnit(u.race, u.x + this.rng() - 0.5, u.y + this.rng() - 0.5, { silent: true, gene: cg, trait: traitKey ?? undefined, fam, fgn: fam !== undefined ? (u.fgn ?? 1) + 1 : undefined });
            this.fx('heart', u.x, u.y - 1, 40);
          }
        }
      }
    }
  }
  zombify(u: Unit) {
    WBB.touchMeta(); // Stage 3：race/装备等 meta 列 JS 写点收口
    // 国王尸变：王位等同驾崩（纪事+稳定度+继承）
    if (u.king && u.civ >= 0) this.onKingDeath(u);
    if (u.civ >= 0 && this.civs[u.civ]) this.civs[u.civ].pop--;
    if (!RACES[u.race].isCiv) this.bumpWild(u.race, -1); // 种族变化：旧种计数摘除
    u.race = R.ZOMBIE;
    u.civ = -1;
    u.hp = 40;
    u.maxHp = 46;
    u.dmg = 6;
    u.speed = 0.05;
    u.age = 0;
    u.maxAge = 9999;
    u.infected = false;
    u.dead = false;
    u.boat = 0;
    u.boatTTL = 0;
    u.king = false;
    u.grab = 0; u.thrT = 0; // 神之手指账目清零（尸变不继承抓取状态）
    WB.syncFull(u); // WASM 镜像全行同步：原地变种族/阵营，后续扫描立即按僵尸判定
    this.bumpWild(R.ZOMBIE, 1);
    this.fx('spawn', u.x, u.y, 30);
  }

  // ---------------- 法师火球（远程攻击） ----------------
  /** 施放火球：特效从施法者飞向目标点，命中时溅射伤害 + 点燃地面 */
  castFireball(u: Unit, tx: number, ty: number, dmg: number) {
    this.fx('fireball', Math.max(0.5, Math.min(W - 0.5, tx)), Math.max(0.5, Math.min(H - 0.5, ty)), 16, { r: dmg, x0: u.x, y0: u.y });
  }

  // ---------------- 弓手箭矢 ----------------
  /** 弹道预测：按目标当前速度取提前量（箭矢飞行 12 tick 期间目标会走 1 格余 ——
   *  老练射手懂得打提前量；否则对移动目标十射九空） */
  leadAim(enemy: Unit, ttl: number): { x: number; y: number } {
    const vx = enemy.x - (enemy.lx ?? enemy.x);
    const vy = enemy.y - (enemy.ly ?? enemy.y);
    return {
      x: Math.max(0.5, Math.min(W - 0.5, enemy.x + vx * ttl + this.rng() * 0.4 - 0.2)),
      y: Math.max(0.5, Math.min(H - 0.5, enemy.y + vy * ttl + this.rng() * 0.4 - 0.2)),
    };
  }

  /** 军团成员是否为远程位（弓手职/持枪/能量武器/装备弓）——战线阵列与齐射的编队依据 */
  isRangedMember(u: Unit): boolean {
    if ((u.job ?? 0) === 3) return true;
    if (u.wep === 'musket' || u.wep === 'rifle' || u.wep === 'laser_rifle') return true;
    return RACES[u.race].isCiv && this.gearBonus(u).ranged > 0;
  }

  /** 施放箭矢：命中时对单体敌人结算伤害，或轰击敌国建筑 */
  castArrow(u: Unit, tx: number, ty: number, dmg: number) {
    this.fx('arrow', Math.max(0.5, Math.min(W - 0.5, tx)), Math.max(0.5, Math.min(H - 0.5, ty)), 12, { x0: u.x, y0: u.y, src: u.civ, r: 0, dmg });
  }

  // ---------------- 火器射击（现代武器） ----------------
  /** 步枪射击：高速曳光弹道（命中结算同箭矢；ttl 短 → 弹速快） */
  castBullet(u: Unit, tx: number, ty: number, dmg: number) {
    this.fx('bullet', Math.max(0.5, Math.min(W - 0.5, tx)), Math.max(0.5, Math.min(H - 0.5, ty)), 5, { x0: u.x, y0: u.y, src: u.civ, r: 0, dmg });
    if (this.rng() < 0.12) this.onSound?.('place'); // 稀疏的枪声反馈
  }

  // ---------------- 相位光束（未来武器） ----------------
  /** 能量步枪射击：贯穿激光束（弹道线杀伤——可穿射队列中的多个敌人； dmg 打 75 折平衡穿透优势） */
  castBeam(u: Unit, tx: number, ty: number, dmg: number) {
    const ex = Math.max(0.5, Math.min(W - 0.5, tx));
    const ey = Math.max(0.5, Math.min(H - 0.5, ty));
    // 光束略过冲 1.2 格：穿射目标身后的敌人（相位贯穿）
    const dx = ex - u.x;
    const dy = ey - u.y;
    const dl = Math.hypot(dx, dy) || 1;
    const ox = Math.max(0.5, Math.min(W - 0.5, ex + (dx / dl) * 1.2));
    const oy = Math.max(0.5, Math.min(H - 0.5, ey + (dy / dl) * 1.2));
    this.fx('laser', ox, oy, 8, { x0: u.x, y0: u.y, src: u.civ, dmg });
    if (this.rng() < 0.08) this.onSound?.('place'); // 稀疏的能量嗡鸣
  }

  // ---------------- 攻城与建筑毁灭（战争毁灭房屋） ----------------
  /** 单位周边（半径 r）最近的敌国建筑 tile（返回 tileIdx 或 -1；tile 网检索低开销） */
  enemyBuildingNear(u: Unit, r: number): number {
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    const rr = Math.ceil(r);
    let best = -1;
    let bestD = r + 0.5;
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = idx(xx, yy);
        const bk = this.building[i];
        if (bk === 0) continue;
        const b = this.buildings[this.bIdx.get(i) ?? -1];
        if (!b || b.civ === u.civ) continue;
        if (u.civ >= 0 && !this.atWar(u.civ, b.civ)) continue;
        const d = Math.hypot(xx - u.x, yy - u.y);
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return best;
  }

  /** 距单位最近的敌国交战建筑（全军推进目标；建筑全表扫描，低频调用） */
  nearestEnemyBuilding(u: Unit): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.civ === u.civ) continue;
      if (u.civ < 0 || !this.atWar(u.civ, b.civ)) continue;
      const d = Math.hypot(b.x - u.x, b.y - u.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** 距单位最近的本国指定类别建筑 */
  nearestBuildingOf(u: Unit, kind: number): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.civ !== u.civ || b.kind !== kind) continue;
      const d = Math.hypot(b.x - u.x, b.y - u.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** 攻击建筑：扣耐久 → 摧毁/易帜/王都陷落 */
  attackBuilding(i: number, dmg: number, byCiv: number) {
    const kind = this.building[i];
    if (kind === 0) return;
    const def = BUILDING_DEFS[kind];
    let hp = this.bHp.get(i) ?? def.hp;
    hp -= dmg;
    const x = i % W;
    const y = (i / W) | 0;
    if (hp <= 0) {
      this.onBuildingDestroyed(i, byCiv);
    } else {
      this.bHp.set(i, hp);
      this.damagedSet.add(i); // 受损登记：国民修复体系的目标
      this.fx('hit', x + 0.5, y + 0.5, 6);
    }
  }

  /** 建筑被摧毁后的战争结算：占领易帜 / 王都陷落吞并 / 攻城纪事 */
  onBuildingDestroyed(i: number, byCiv?: number) {
    const bi = this.bIdx.get(i);
    if (bi === undefined) return;
    const b = this.buildings[bi];
    const kind = b.kind;
    const victimCiv = b.civ;
    const def = BUILDING_DEFS[kind];
    this.destroyBuilding(i);
    if (byCiv == null || byCiv < 0 || byCiv === victimCiv) return; // 天灾/己方摧毁：无战争结算
    const attacker = this.civs[byCiv];
    const victim = this.civs[victimCiv];
    if (!attacker?.alive || !victim?.alive) return;
    if (!this.atWar(byCiv, victimCiv)) return;
    // 占领：可易帜建筑（住宅/农田/集市/兵营/港口）45% 归入攻方，周边领土易主
    if (CAPTURABLE.has(kind) && this.rng() < 0.45) {
      this.buildBuilding(i, kind, byCiv);
      this.annexTiles(i, byCiv, 2);
      this.addWarScore(byCiv, victimCiv, 8, 'capture');
      this.addEvent('capture', `「${attacker.name}」占领了「${victim.name}」的${def.name}`, { colorHex: attacker.colorHex, x: b.x, y: b.y });
      this.fx('spawn', b.x, b.y, 26);
      if (this.overlayMode === 'political' || this.overlayMode === 'alliance') this.overlayDirty = true;
      return;
    }
    // 王都陷落：大事件——攻方吞并王都周边领土，守方建筑尽数易帜或焚毁
    if (kind === BUILD_KINDS.CAPITAL) {
      this.sackCapital(b, byCiv);
      return;
    }
    // 普通攻城摧毁：纯武力拆毁（战争不纵火 —— 国民会奋起修复家园）+ 节流纪事
    this.addWarScore(byCiv, victimCiv, 5, 'raze');
    if (this.tickCount - this.lastSiegeEventTick > 150) {
      this.lastSiegeEventTick = this.tickCount;
      this.addEvent('siege', `「${attacker.name}」的军队摧毁了「${victim.name}」的${def.name}`, { colorHex: attacker.colorHex, x: b.x, y: b.y });
    }
  }

  /** 王都陷落（灭国战争高潮）：吞并王都周边 6 格领土 + 建筑易帜/焚毁 + 震屏播报 */
  sackCapital(capital: Building, byCiv: number) {
    const attacker = this.civs[byCiv];
    const victim = this.civs[capital.civ];
    if (!attacker?.alive || !victim?.alive) return;
    this.shake = Math.max(this.shake, 10);
    this.annexTiles(capital.i, byCiv, 6);
    this.addWarScore(byCiv, capital.civ, 40, 'capital'); // 王都陷落：战争分数大额入账
    this.addEvent('sack', `「${victim.name}」的王都陷落了！「${attacker.name}」的铁蹄踏碎了最后的城墙，国土尽数易主`, { colorHex: attacker.colorHex, x: capital.x, y: capital.y });
    this.toast(`「${victim.name}」的王都陷落了`, 'war');
    this.onSound?.('boom');
  }

  /** 领土吞并：以 tile 为圆心把半径 r 内守方领土/建筑划归攻方 */
  annexTiles(center: number, toCiv: number, r: number) {
    const victim = this.owner[center];
    const cx = center % W;
    const cy = (center / W) | 0;
    let took = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = idx(xx, yy);
        // 领土易主（仅吞并受害方与无主地，不抢第三方）
        if (this.owner[i] === victim || (this.owner[i] === -1 && victim === -1)) {
          const old = this.owner[i];
          if (old >= 0 && old !== toCiv) {
            this.civs[old].tiles = this.civs[old].tiles.filter((t) => t !== i);
            if (old === victim) took++;
          }
          this.owner[i] = toCiv;
          this.civs[toCiv].tiles.push(i);
          this.markDirty(i);
        }
        // 建筑易帜或焚毁
        if (this.building[i] > 0) {
          const bi = this.bIdx.get(i)!;
          const b = this.buildings[bi];
          if (b.civ !== toCiv) {
            if (CAPTURABLE.has(b.kind)) {
              const oldCiv = this.civs[b.civ];
              if (oldCiv) oldCiv.houses--;
              b.civ = toCiv;
              this.civs[toCiv].houses++;
              this.bHp.set(i, BUILDING_DEFS[b.kind].hp);
            } else {
              this.destroyBuilding(i);
            }
          }
        }
      }
    }
    // 战争占领入账（目的进度：border/conquest 的量尺）
    if (took > 0 && victim >= 0) this.noteOccupied(toCiv, victim, took);
    if (this.overlayMode === 'political' || this.overlayMode === 'alliance') this.overlayDirty = true;
  }

  // ---------------- 国民防灾：灭火与修缮（生物主动对抗天灾/战祸） ----------------
  /** 找到单位附近值得扑救的火：本国领土的火 → 主动救援；贴身之火 → 自保扑灭 */
  fireNear(u: Unit, r: number): number {
    if (this.fireSet.size === 0) return -1;
    const cx = Math.floor(u.x);
    const cy = Math.floor(u.y);
    const rr = Math.ceil(r);
    let best = -1;
    let bestD = r + 0.5;
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = idx(xx, yy);
        if (this.fire[i] <= 0) continue;
        const d = Math.hypot(xx + 0.5 - u.x, yy + 0.5 - u.y);
        if (d >= bestD) continue;
        // 响应条件：火烧本国领土 / 烧本国建筑 / 贴身自保（<2.2 格）
        const own = u.civ >= 0 && (this.owner[i] === u.civ || (this.building[i] > 0 && this.buildings[this.bIdx.get(i) ?? -1]?.civ === u.civ));
        if (own || d < 2.2) { bestD = d; best = i; }
      }
    }
    return best;
  }

  /** 扑灭火焰：国民消防（水花特效 + 统计 + 节流播报） */
  extinguishFire(i: number, by: Unit) {
    this.fire[i] = 0;
    this.fireSet.delete(i);
    this.firesOut++;
    this.fx('water', (i % W) + 0.5, ((i / W) | 0) + 0.5, 16);
    // 节流播报：累积 3 次以上才上纪事，间隔 ≥ 480 tick
    if (this.firesOut >= 3 && this.tickCount - this.lastFireOutEventTick > 480) {
      this.lastFireOutEventTick = this.tickCount;
      const civ = this.civs[by.civ];
      if (civ?.alive) {
        this.addEvent('fireOut', `「${civ.name}」的国民提桶救火，扑灭了蔓延的火势`, { colorHex: civ.colorHex, x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 });
      }
    }
  }

  /** 建筑师寻找最近的本国受损建筑（damagedSet 全表小集合扫描） */
  damagedNear(u: Unit, r: number): number {
    if (this.damagedSet.size === 0) return -1;
    let best = -1;
    let bestD = r;
    for (const i of this.damagedSet) {
      const b = this.buildings[this.bIdx.get(i) ?? -1];
      if (!b || b.civ !== u.civ) continue;
      const d = Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** 修复建筑一点耐久：建筑师主力 / 路过国民顺手（返回 true = 修满） */
  repairBuilding(i: number, amount: number, by: Unit): boolean {
    const b = this.buildings[this.bIdx.get(i) ?? -1];
    if (!b) return false;
    const def = BUILDING_DEFS[b.kind];
    const max = Math.round((def?.hp ?? 70) * this.techModsOf(b.civ).bhp);
    let hp = this.bHp.get(i) ?? max;
    hp = Math.min(max, hp + amount);
    this.bHp.set(i, hp);
    this.repairsDone++;
    this.fx('hammer', b.x + 0.5, b.y + 0.2, 14);
    const done = hp >= max;
    if (done) {
      this.damagedSet.delete(i);
      this.fx('spawn', b.x + 0.5, b.y + 0.5, 22);
      // 节流播报：战争疮痍被修复
      if (this.repairsDone >= 6 && this.tickCount - this.lastRepairEventTick > 720) {
        this.lastRepairEventTick = this.tickCount;
        const civ = this.civs[b.civ];
        if (civ?.alive) {
          this.addEvent('repair', `「${civ.name}」的工匠修复了受损的${def?.name ?? '建筑'}，家园重焕生机`, { colorHex: civ.colorHex, x: b.x, y: b.y });
        }
      }
    }
    return done;
  }

  // ---------------- 建筑运转：防御/经济/神殿/兵营 ----------------
  /** 箭塔/城堡：每 10 tick 自动射击射程内敌人（守城力量，让攻城付出代价） */
  defenseTick() {
    for (const b of this.buildings) {
      if (b.kind !== BUILD_KINDS.TOWER && b.kind !== BUILD_KINDS.CASTLE) continue;
      if (!this.civs[b.civ]?.alive) continue;
      const range = b.kind === BUILD_KINDS.CASTLE ? 5.5 : 4.5;
      const dmg = b.kind === BUILD_KINDS.CASTLE ? 12 : 7;
      // 空间分桶检索最近敌人
      const bx0 = Math.max(0, Math.floor((b.x - range) / 4));
      const bx1 = Math.min(this.bw - 1, Math.floor((b.x + range) / 4));
      const by0 = Math.max(0, Math.floor((b.y - range) / 4));
      const by1 = Math.min(this.bh - 1, Math.floor((b.y + range) / 4));
      let target: Unit | null = null;
      let bestD = range;
      for (let by = by0; by <= by1 && !target; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const bucket = this.buckets[by * this.bw + bx];
          for (const o of bucket) {
            if (o.dead) continue;
            const d = Math.hypot(o.x - b.x, o.y - b.y);
            if (d < bestD) {
              const hostile = this.civs[b.civ] && (o.civ !== b.civ) && (o.civ < 0 ? RACES[o.race].hostile || o.race === R.ZOMBIE || o.race === R.SKELETON : this.atWar(b.civ, o.civ));
              if (hostile) { bestD = d; target = o; }
            }
          }
        }
      }
      if (target && this.rng() < 0.6) {
        this.castArrow({ x: b.x + 0.5, y: b.y + 0.5, civ: b.civ } as Unit, target.x, target.y, dmg);
      }
    }
  }

  /** 神殿：每 120 tick 治疗光环（半径 4 内友军回复） */
  templeTick() {
    for (const b of this.buildings) {
      if (b.kind !== BUILD_KINDS.TEMPLE) continue;
      const civ = this.civs[b.civ];
      if (!civ?.alive) continue;
      const bx0 = Math.max(0, Math.floor((b.x - 4) / 4));
      const bx1 = Math.min(this.bw - 1, Math.floor((b.x + 4) / 4));
      const by0 = Math.max(0, Math.floor((b.y - 4) / 4));
      const by1 = Math.min(this.bh - 1, Math.floor((b.y + 4) / 4));
      let healed = 0;
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          for (const o of this.buckets[by * this.bw + bx]) {
            if (o.dead || o.civ !== b.civ) continue;
            if (Math.hypot(o.x - b.x, o.y - b.y) < 4 && o.hp < o.maxHp) {
              o.hp = Math.min(o.maxHp, o.hp + 8);
              healed++;
            }
          }
        }
      }
      if (healed > 0 && this.rng() < 0.4) this.fx('heart', b.x + 0.5, b.y - 1, 36);
    }
  }

  /** 经济：每 120 tick（约 3 年）集市产金、图书馆产知识、人口税基 —— 含科技/政体加成与军团军饷 */
  // ---------------- 国际贸易（深度打磨：市场驱动的商队网络） ----------------
  /** 每年一次：和平且拥有市场的文明向伙伴派出实体商队（交战国停摆） */
  tradeTick() {
    WBB.touchMeta(); // Stage 3：商队 spawn 后 caravan/maxAge 赋值收口
    if (this.units.length >= MAX_UNITS) return;
    let active = 0;
    for (const u of this.units) if ((u.caravan ?? 0) > 0) active++;
    if (active >= 10) return; // 全局商队上限（防刷屏）
    for (const civ of this.civs) {
      if (!civ.alive || civ.pop <= 0) continue;
      if ((this.tradeNext.get(civ.id) ?? 0) > this.tickCount) continue;
      const mi = this.marketIdx.get(civ.id);
      if (mi == null) continue;
      const atWar = this.civAtWar(civ.id);
      // —— 瘟疫互连：疫病流行时商队停发（封锁疫区是古已有之的智慧）——
      let infected = 0;
      for (const u of this.units) {
        if (!u.dead && u.civ === civ.id && u.infected) infected++;
        if (infected >= 8) break;
      }
      const plagueBlock = infected >= 8 ? 0.35 : 1;
      // 冷却：交战国长期停摆，和平期 ~9-17 年一队（外交亲和种族商队更勤）
      const rdT = RACES[civ.race];
      this.tradeNext.set(civ.id, this.tickCount + Math.floor((atWar ? 520 : 360) / (0.8 + (rdT?.diplo ?? 0.5) * 0.4) / plagueBlock) + Math.floor(this.rng() * 320));
      if (atWar || this.rng() > plagueBlock) continue;
      // 和平伙伴（双方有市场、无战事、关系非敌意；盟友门槛放宽至 -40 —— 盟约凌驾于祖怨）
      const alT = this.allianceOfCiv(civ.id);
      const partners: Civ[] = [];
      for (const o of this.civs) {
        if (!o.alive || o.id === civ.id || o.pop <= 0) continue;
        if (!this.marketIdx.has(o.id)) continue;
        if (this.atWar(civ.id, o.id)) continue;
        const threshold = alT && alT.members.includes(o.id) ? -40 : -15;
        if ((this.rel.get(pairKey(civ.id, o.id)) ?? 0) < threshold) continue;
        partners.push(o);
      }
      if (partners.length === 0) continue;
      // —— 种族互连（Task 34 去虚务实）：商路选择看族缘——同族与亲善种族优先通商 ——
      //    世仇不阻断通商（那由外交关系把关）但日渐稀疏：族缘真实塑造商路网络
      let wTotal = 0;
      const pws = partners.map((o) => {
        const rr = o.race === civ.race ? 25 : this.raceRelOf(civ.race, o.race);
        const pw = 1 + Math.max(0, rr) / 35;
        wTotal += pw;
        return pw;
      });
      let rollP = this.rng() * wTotal;
      let pickIdx = partners.length - 1;
      for (let pj = 0; pj < partners.length; pj++) { rollP -= pws[pj]; if (rollP <= 0) { pickIdx = pj; break; } }
      const partner = partners[pickIdx];
      const pi = this.marketIdx.get(partner.id)!;
      // 可达性校验（同大陆且路径预算内；商队不航海）
      if (this.findPath(mi, pi, 5000) == null) continue;
      const cu = this.spawnUnit(civ.race, (mi % W) + 0.5, ((mi / W) | 0) + 0.5, { civ: civ.id, silent: true, job: 5 });
      if (!cu) continue;
      cu.caravan = partner.id;
      cu.tx = (pi % W) + 0.5;
      cu.ty = ((pi / W) | 0) + 0.5;
      cu.maxAge = Math.max(cu.maxAge, cu.age + 90); // 保证走完长途（约 22 年余量）
      if (this.rng() < 0.22) {
        this.addEvent('trade', `「${civ.name}」商队启程，满载货物奔赴「${partner.name}」`, { colorHex: civ.colorHex, x: cu.x, y: cu.y });
      }
    }
  }

  /** 商队抵达伙伴市场：双方入账 + 偶发知识流通 + 外交升温 + 种族亲善；行商转为客居商人 */
  caravanArrive(u: Unit) {
    WBB.touchMeta(); // Stage 3：caravan/job 列 JS 写点收口
    const home = u.civ >= 0 ? this.civs[u.civ] : null;
    const partner = this.civs[u.caravan!];
    // —— 联盟互连：盟内商路免税互市，收益 ×1.25 ——
    const alC = home && partner ? this.allianceOfCiv(home.id) : null;
    const allyBonus = alC && partner && alC.members.includes(partner.id) ? (alC.bonded ? 1.38 : 1.25) : 1;
    const val = Math.round((6 + Math.floor(this.rng() * 9)) * allyBonus);
    if (home && home.alive) {
      home.gold = (home.gold ?? 0) + val;
      if (this.rng() < 0.35) home.knowledge = (home.knowledge ?? 0) + 1;
    }
    if (partner && partner.alive) {
      partner.gold = (partner.gold ?? 0) + val;
      if (this.rng() < 0.4) partner.knowledge = (partner.knowledge ?? 0) + 1;
      if (home && home.alive) {
        const key = pairKey(home.id, partner.id);
        this.rel.set(key, Math.min(100, (this.rel.get(key) ?? 0) + 4)); // 贸易升温
        // —— 种族互连：商贸往来让两个种族渐生好感（商缘即族缘）——
        if (home.race !== partner.race) this.shiftRaceRel(home.race, partner.race, 0.2);
      }
    }
    this.fx('coin', u.x, u.y - 1, 30);
    if (this.rng() < 0.3 && home && partner) {
      this.addEvent('trade', `「${home.name}」商队抵达「${partner.name}」，两市共获 ${val} 金`, { colorHex: partner.colorHex, x: u.x, y: u.y });
    }
    u.caravan = 0;
    u.job = 5;
  }

  economyTick() {
    for (const c of this.civs) {
      if (!c.alive || c.pop <= 0) continue;
      const counts = this.civBuildCounts.get(c.id);
      if (!counts) continue;
      const markets = counts[BUILD_KINDS.MARKET] ?? 0;
      const libraries = counts[BUILD_KINDS.LIBRARY] ?? 0;
      const temples = counts[BUILD_KINDS.TEMPLE] ?? 0;
      const ports = counts[BUILD_KINDS.PORT] ?? 0;
      // 旨意加成：富国令财富产出 ×2 / 启智令知识产出 ×2（文明自行达成的引擎）
      const wealthBoost = this.activeDirective(c.id, 'wealth') ? 2 : 1;
      const wisdomBoost = this.activeDirective(c.id, 'wisdom') ? 2 : 1;
      // —— 科技/社会加成：税基×tech.tax×政体 / 经济×tech.gold / 知识×tech.know（文化反哺）——
      const tm = this.techModsOf(c.id);
      const im = this.ideaModsOf(c.id); // v3：涌现理念加成（经济/知识）
      const gov = this.govOf(c.id);
      const cultKnow = 1 + Math.min(0.5, (c.culture ?? 0) * 0.002); // 文化反哺学术（上限 +50%）
      const govTaxMul = gov === 1 ? 1.1 : gov === 2 ? 1.0 : gov === 3 ? 1.0 : gov === 4 ? 1.05 : 1;
      // —— 种族互连：勤勉种族的税基更丰厚（矮人的工坊永不熄火）——
      const rpE = RACES[c.race];
      const industryMul = 0.8 + (rpE?.industry ?? 0.5) * 0.4;
      // —— 季节互连：冬季雪封商路，集市与港口收入 ×0.9 ——
      const winterMul = this.nature.season === 3 ? 0.9 : 1;
      const taxBase = Math.floor(c.pop * 0.05 * tm.tax * govTaxMul);
      // —— 财富饱和：囤积低效（官僚损耗随库藏膨胀 → 净入账递减 —— 软上限防数万金通胀） ——
      // 打仗花钱 → 国库回落 → 入账效率恢复：战争重新成为财政大事而非无关痛痒
      const hoard = c.gold ?? 0;
      const drag = 1 / (1 + hoard / 900);
      // —— 联盟互连：盟友间商贸一体化，关税减免 ×1.15（盟内市场优先繁荣）——
      const alE = this.allianceOfCiv(c.id);
      const allyTrade = alE && alE.members.length >= 2 ? (alE.bonded ? 1.25 : 1.15) : 1;
      const income = Math.max(0, Math.round((markets * 3 + temples * 1 + ports * 2 + taxBase) * wealthBoost * tm.gold * (gov === 3 ? 1.25 : 1) * (1 + im.gold) * industryMul * winterMul * allyTrade * drag));
      // —— 军团军饷：现役军团成员人均 0.12 金/tick 段（军国主义高涨的国家咬牙供养）——
      let upkeep = 0;
      for (const a of this.armies) {
        if (a.civ === c.id && a.state !== 'retreat') upkeep += a.members.length * 0.12; // 军饷（战时大军是吞金兽）
      }
      upkeep += (counts[BUILD_KINDS.CASTLE] ?? 0) * 0.5 + (counts[BUILD_KINDS.TOWER] ?? 0) * 0.15; // 城防维护
      c.income = income;
      c.expense = Math.round(upkeep * 10) / 10;
      c.gold = Math.max(0, (c.gold ?? 0) + income - upkeep);
      // —— 军饷欠饷：国库见底 → 军团士气滑落（帝国过度扩张的代价）——
      if ((c.gold ?? 0) <= 0 && upkeep > 2) {
        for (const a of this.armies) {
          if (a.civ === c.id) a.morale = Math.max(0, a.morale - 0.5);
        }
      }
      // —— 知识：种族奥术天赋（精灵的魔法学术）× 冬季蛰居苦读（×1.05 反向补偿）——
      const arcaneMul = 0.8 + (rpE?.arcane ?? 0.5) * 0.45;
      const knowGain = Math.round((libraries * 2 + (c.pop > 20 ? 1 : 0)) * wisdomBoost * tm.know * cultKnow * (gov === 2 ? 1.15 : 1) * (1 + im.know) * arcaneMul * (this.nature.season === 3 ? 1.05 : 1));
      // 知识优先投入研究（科技研发体系），余量入国库知识存量（解锁建筑）
      const spent = this.fundResearch(c, knowGain);
      c.knowledge = (c.knowledge ?? 0) + (knowGain - spent);
    }
  }

  // ---------------- 科技研发体系（Tech Research Engine） ----------------
  /** 文明的科技加成（缓存：科技完成/读档时重建） */
  /** 汇总某文明加成（引擎缓存调用）：静态科技 × 涌现科技叠加 */
  techModsOf(civId: number): TechMods {
    if (civId < 0) return NEUTRAL_MODS;
    const cached = this.techModCache.get(civId);
    if (cached) return cached;
    const c = this.civs[civId];
    let mods = c ? modsOfTechs(c.techs ?? []) : NEUTRAL_MODS;
    // v3：涌现科技效果叠加（无限发明 → 无限叠加的小加成）
    if (c && this.emTechs.size > 0) {
      for (const key of c.techs ?? []) {
        const em = this.emTechs.get(key);
        if (em) applyEmTechMods(mods as unknown as Record<string, number>, em);
      }
    }
    if (c) this.techModCache.set(civId, mods);
    return mods;
  }

  /** 文明政体 id（缓存） */
  govOf(civId: number): number {
    if (civId < 0) return 0;
    const c = this.civs[civId];
    return c?.gov ?? 0;
  }

  /** 文明可研究科技列表（未拥有且前置齐备） */
  availableTechs(c: Civ): typeof TECHS {
    const owned = new Set(c.techs ?? []);
    return TECHS.filter((t) => !owned.has(t.key) && t.deps.every((d) => owned.has(d)));
  }

  /** 文明自动选题：偏好与国家气质相关（军国主义高 → 军事科技；文化高 → 文化科技；否则按时代近邻加权） */
  pickResearch(c: Civ): string | null {
    const avail = this.availableTechs(c);
    if (avail.length === 0) return null;
    // 偏好加权：军国主义/文化/国库影响选题倾向（真实的国家路径分化）
    const mil = (c.militarism ?? 30) / 100;
    const cul = Math.min(1, (c.culture ?? 0) / 120);
    const rich = Math.min(1, (c.gold ?? 0) / 200);
    const w = avail.map((t) => {
      let base = 1;
      if (t.cat === 'military') base *= 0.5 + mil * 1.6;
      if (t.cat === 'culture') base *= 0.5 + cul * 1.6;
      if (t.cat === 'econ') base *= 0.6 + rich * 1.4;
      if (t.cat === 'civic') base *= 0.7 + (100 - (c.stability ?? 70)) / 150;
      if (t.cat === 'naval') base *= 0.7;
      if (t.cat === 'agri') base *= 0.8 + Math.min(0.8, c.pop / 100);
      if (t.cat === 'eng') base *= 0.9;
      return base;
    });
    let total = 0;
    for (const x of w) total += x;
    let roll = this.rng() * total;
    for (let i = 0; i < avail.length; i++) {
      roll -= w[i];
      if (roll <= 0) return avail[i].key;
    }
    return avail[avail.length - 1].key;
  }

  /** 知识注入研究：完成返回实际消耗量（仅缺口部分，余数留国库；研究完成时播报 + 效果重建）
   *  v3：静态树穷尽后转入涌现发明（无限科技链 —— 文明的学术前沿永无止境） */
  fundResearch(c: Civ, points: number): number {
    if (points <= 0) return 0;
    if (!c.research) {
      const pick = this.pickResearch(c) ?? this.inventEmTech(c);
      if (!pick) return 0;
      c.research = pick;
      c.researchP = 0;
      this.addEvent('tech', `「${c.name}」的学者们开始研究「${TECH_BY_KEY[pick]?.name ?? this.emTechs.get(pick)?.name ?? pick}」`, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
    }
    const def = TECH_BY_KEY[c.research] ?? this.emTechs.get(c.research);
    if (!def) { c.research = null; return 0; }
    const start = c.researchP ?? 0;
    // —— 联盟互连：盟友已掌握的科技 → 技术交流使研究效率 ×1.2（盟内知识扩散）——
    const alF = this.allianceOfCiv(c.id);
    let diffusion = 1;
    if (alF) {
      for (const m of alF.members) {
        if (m === c.id) continue;
        const mc = this.civs[m];
        if (mc?.alive && (mc.techs ?? []).includes(c.research!)) { diffusion = alF.bonded ? 1.32 : 1.2; break; }
      }
    }
    c.researchP = start + points * diffusion;
    if (c.researchP >= def.cost) {
      this.completeTech(c, def.key);
      return Math.max(0, def.cost - start); // 实际消耗 = 完成缺口（余量回流国库）
    }
    return points;
  }

  /** 科技完成：入帐 + 纪事 + 加成缓存重建（v3：兼容涌现科技 —— 静态/涌现统一结算） */
  completeTech(c: Civ, key: string) {
    if (!c.techs) c.techs = [];
    c.techs.push(key);
    const def = TECH_BY_KEY[key];
    const em = this.emTechs.get(key);
    c.research = null;
    c.researchP = 0;
    this.techModCache.delete(c.id);
    // —— 科技回溯（Task 34 去虚务实）：研发完成即刻惠及全军现役单位——
    //    按新旧乘数差重算：青铜→钢铁跃迁后老兵同步换装列装，而非只有新兵变强；
    //    武器锻造水准也随之翻新（国家冶金强了，制式武器同步升级）
    {
      const nm = this.techModsOf(c.id); // 缓存已删，重算即新值
      if (nm.dmg !== 1 || nm.hp !== 1) {
        for (const u of this.units) {
          if (u.dead || u.civ !== c.id) continue;
          const rd = nm.dmg / (u.tDmg ?? 1);
          const rh = nm.hp / (u.tHp ?? 1);
          if (rd !== 1) u.dmg = Math.max(1, u.dmg * rd);
          if (rh !== 1) {
            const ratio = u.hp / u.maxHp;
            u.maxHp = Math.max(1, Math.round(u.maxHp * rh));
            u.hp = Math.min(u.maxHp, Math.max(1, Math.round(u.maxHp * ratio)));
          }
          u.tDmg = nm.dmg;
          u.tHp = nm.hp;
        }
      }
    }
    this.addEvent('tech', `「${c.name}」研发出「${def?.name ?? em?.name ?? key}」—— ${def?.desc ?? em?.desc ?? ''}`, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
    // 大科技里程碑提示（涌现科技每 5 项提示一次，防刷屏）
    if ((def && def.era >= 2) || (em && em.gen % 5 === 0)) {
      this.toast(`「${c.name}」掌握了「${def?.name ?? em?.name ?? key}」`, 'info');
      this.onSound?.('era'); // 纪元跃迁钟声（42-e 接线）
    }
    // 现有建筑随工程科技升级耐久上限（老房加固——立即重建受损映射）
    if (def && (def.key === 'masonry' || def.key === 'fortification' || def.key === 'gothic')) {
      const mul = this.techModsOf(c.id).bhp;
      for (const b of this.buildings) {
        if (b.civ !== c.id) continue;
        const base = BUILDING_DEFS[b.kind]?.hp ?? 70;
        const max = Math.round(base * mul);
        this.bHp.set(b.i, Math.min(max, (this.bHp.get(b.i) ?? base) + base * 0.25));
      }
    }
  }

  /** 文明中心坐标（事件定位用） */
  civCenterX(c: Civ) {
    if (c.capital >= 0) return this.tileX(c.capital) + 0.5;
    return c.tiles.length > 0 ? this.tileX(c.tiles[(c.tiles.length / 2) | 0]) : W / 2;
  }
  civCenterY(c: Civ) {
    if (c.capital >= 0) return this.tileY(c.capital) + 0.5;
    return c.tiles.length > 0 ? this.tileY(c.tiles[(c.tiles.length / 2) | 0]) : H / 2;
  }

  /** 科技 tick：每 120 tick 一次（选题由 economyTick 知识注入驱动；本 tick 处理无收入文明的慢速自然积累） */
  techTick() {
    for (const c of this.civs) {
      if (!c.alive || c.pop <= 0) continue;
      // 无图书馆的小文明：口传心授的自然积累（每 tick 段 0-1 点，人口越大越多）
      if (!c.research && (c.knowledge ?? 0) < 40 && this.rng() < 0.35) {
        this.fundResearch(c, this.rng() < 0.5 ? 1 : 0); // 确定性 RNG（Math.random 会破坏同种子复现 —— L3 A/B 排障发现）
      }
    }
  }

  // ---------------- 社会体系（政治 · 经济 · 文化 · 军事） ----------------
  /** 社会 tick：稳定度漂移 / 文化积累 / 军国主义演变 / 政体变革 / 节日与危机 */
  societyTick() {
    for (const c of this.civs) {
      if (!c.alive || c.pop <= 0) continue;
      const counts = this.civBuildCounts.get(c.id);
      const temples = counts?.[BUILD_KINDS.TEMPLE] ?? 0;
      const libraries = counts?.[BUILD_KINDS.LIBRARY] ?? 0;
      const tm2 = this.techModsOf(c.id);
      const im2 = this.ideaModsOf(c.id); // v3：涌现理念加成（稳定/军国/厌战）
      const gov = this.govOf(c.id);
      const rp = RACES[c.race]; // 种族系统 v2：种族性格驱动社会行为
      // —— 稳定度：战争损耗 / 领土过大 / 税负 vs 神殿安抚 / 文化繁荣 / 科技治理 ——
      let stab = c.stability ?? 70;
      const atWar = this.civAtWar(c.id);
      stab += atWar ? -1.2 : 0.6;
      if (c.tiles.length > 120) stab -= 0.4; // 过度扩张
      stab += temples * 0.15 + (c.culture ?? 0) * 0.001;
      stab += tm2.stab / 50; // 法律/共和科技的治理红利
      stab += im2.stab * 0.45; // 涌现理念：民本/铁律的治理实效（Task 34 量级修正——从噪声级提到有感）
      stab += gov === 1 ? 0.2 : gov === 2 ? 0.12 : gov === 3 ? 0.25 : gov === 4 ? -0.15 : 0;
      // —— 种族互连：多族王国的种族张力（包容种族多元化更稳 / 排外种族动荡）——
      const homo = this.civHomogeneity.get(c.id) ?? 1;
      if (homo < 0.9) stab += ((rp?.harmony ?? 0.5) - 0.45) * 20 * (0.9 - homo);
      // —— 联盟互连：盟约的安全感（凝聚力高的联盟成员更安定）——
      const alS = this.allianceOfCiv(c.id);
      if (alS && !atWar) stab += Math.min(1.2, alS.cohesion * 0.012);
      c.stability = Math.max(0, Math.min(100, stab));
      // —— 文化积累：神殿 + 节日 + 科技乘数 + 种族虔诚（精灵的仪式与信仰）——
      const cultGain = (temples * 0.8 + 0.4 + libraries * 0.3) * (0.7 + (rp?.piety ?? 0.5) * 0.6) * tm2.cult * (gov === 2 ? 1.4 : 1);
      c.culture = (c.culture ?? 0) + cultGain;
      // —— 军国主义：战争推高 / 胜利强化 / 和平消退 + 种族好战基线引力（血蹄永不停步）——
      let mil = c.militarism ?? 30;
      mil += atWar ? 0.9 : -0.5;
      mil += im2.mil * 3; // 涌现理念：军功爵推高 / 偃武主义拉低（Task 34 量级修正——从 7% 权重提到真实驱动力）
      if (this.recentVictory(c.id)) mil += 1.2;
      mil += ((rp?.aggr ?? 0.5) * 100 - mil) * 0.01; // 向种族基线缓漂（每十年约 10% 靠近）
      c.militarism = Math.max(0, Math.min(100, mil));
      // —— 节日：文化丰盈时举国庆典（稳定度小振作 + 纪事）——
      const fest = c.festivalCd ?? 0;
      if (fest > 0) {
        c.festivalCd = fest - 1;
      } else if ((c.culture ?? 0) > 40 && this.rng() < 0.3) {
        c.festivalCd = 10;
        c.culture = (c.culture ?? 0) - 20;
        c.stability = Math.min(100, (c.stability ?? 70) + 3);
        this.addEvent('festival', `「${c.name}」举国欢庆丰年祭，鼓乐与篝火彻夜不息`, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
      }
      // —— v3：涌现理念采纳（文化丰盈时酝酿新思想 / 异邦思想传入） ——
      if ((c.ideas ?? []).length < 3 && (c.culture ?? 0) > 60 && this.rng() < 0.15) {
        this.adoptIdea(c);
      }
      // —— 政体演变：满足门槛且 12% 概率变革（革命式跃迁）——
      this.tryGovEvolve(c);
      // —— 危机：稳定度 < 18 → 动乱（叛乱分裂既有系统）/ 妥协变革 ——
      if ((c.stability ?? 70) < 18 && this.rng() < 0.25) {
        if (c.pop > 25 && (c.knowledge ?? 0) > 30 && c.gov !== 3) {
          // 启蒙革命：直接进入共和制（翻身求稳）
          this.setGov(c, 3, 'revolution');
        } else {
          this.addEvent('riot', `「${c.name}」爆发了暴动——粮仓被劫，贵族的宅邸火光冲天`, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
          c.stability = Math.min(40, (c.stability ?? 10) + 12); // 动乱宣泄后回升
          c.gold = Math.max(0, (c.gold ?? 0) - 15);
        }
      }
    }
  }

  /** 近期战争胜利（战争分数结算中最近 300 tick 内取胜）*/
  recentVictory(civId: number): boolean {
    for (const wd of this.warData.values()) {
      const winner = wd.scoreA > wd.scoreB ? wd.a : wd.b;
      if (winner === civId && this.tickCount - wd.startTick < 300 && this.tickCount - wd.startTick > 200) return true;
    }
    return false;
  }

  /** 政体变革（含播报） */
  setGov(c: Civ, gov: number, cause: 'evolve' | 'revolution') {
    if ((c.gov ?? 0) === gov) return;
    c.gov = gov;
    c.govYear = Math.floor(this.yearF);
    this.govCache.set(c.id, gov);
    const g = GOV_DEFS[gov];
    const text = cause === 'revolution'
      ? `革命席卷「${c.name}」！王冠坠地，${g.name}在废墟上建立`
      : `「${c.name}」确立了${g.name}（${g.desc}）`;
    this.addEvent('gov', text, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
    this.toast(`「${c.name}」改制为${g.name}`, 'info');
  }

  /** 政体自然演变：门槛达成（人口/建筑/知识/军国主义）→ 概率跃迁 */
  tryGovEvolve(c: Civ) {
    const last = this.lastGovEventTick.get(c.id) ?? -4000;
    if (this.tickCount - last < 2000) return; // 变革冷却（≥50 年）
    const owned = new Set(c.techs ?? []);
    const gov = c.gov ?? 0;
    const counts = this.civBuildCounts.get(c.id);
    const temples = counts?.[BUILD_KINDS.TEMPLE] ?? 0;
    // 升序判定：帝国 > 共和 > 神权 > 君主
    const canMonarchy = gov < 1 && c.pop >= 25;
    const canTheocracy = gov < 2 && temples >= 1 && owned.has('theology') && (c.culture ?? 0) > 50;
    const canRepublic = gov !== 3 && c.pop >= 60 && (owned.has('law') || owned.has('printing')) && (c.knowledge ?? 0) >= 40 && (c.stability ?? 70) < 55;
    const canEmpire = gov !== 4 && c.pop >= 120 && (c.militarism ?? 30) >= 55 && (owned.has('legion') || owned.has('tactics'));
    if (canEmpire && this.rng() < 0.25) {
      this.lastGovEventTick.set(c.id, this.tickCount);
      this.setGov(c, 4, 'evolve');
    } else if (canRepublic && this.rng() < 0.18) {
      this.lastGovEventTick.set(c.id, this.tickCount);
      this.setGov(c, 3, 'evolve');
    } else if (canTheocracy && this.rng() < 0.15) {
      this.lastGovEventTick.set(c.id, this.tickCount);
      this.setGov(c, 2, 'evolve');
    } else if (canMonarchy && this.rng() < 0.2) {
      this.lastGovEventTick.set(c.id, this.tickCount);
      this.setGov(c, 1, 'evolve');
    }
  }

  /** 兵营：每 200 tick 把附近的平民训练为战士（战时优先扩军，和平期低概率维持常备） */
  barracksTick() {
    for (const b of this.buildings) {
      if (b.kind !== BUILD_KINDS.BARRACKS) continue;
      const civ = this.civs[b.civ];
      if (!civ?.alive) continue;
      const atWar = this.civAtWar(b.civ);
      if (!atWar && this.rng() > 0.25) continue; // 和平期仅 25% 概率出兵员
      // 找 3.5 格内的本国平民 → 转职战士
      const bx0 = Math.max(0, Math.floor((b.x - 3.5) / 4));
      const bx1 = Math.min(this.bw - 1, Math.floor((b.x + 3.5) / 4));
      const by0 = Math.max(0, Math.floor((b.y - 3.5) / 4));
      const by1 = Math.min(this.bh - 1, Math.floor((b.y + 3.5) / 4));
      let trained = 0;
      const quota = atWar ? 2 : 1; // 战时动员加倍（战争机器全速运转）
      for (let by = by0; by <= by1 && trained < quota; by++) {
        for (let bx = bx0; bx <= bx1 && trained < quota; bx++) {
          for (const o of this.buckets[by * this.bw + bx]) {
            if (trained >= quota) break;
            if (o.dead || o.civ !== b.civ || (o.job ?? 0) === 2) continue;
            if (Math.hypot(o.x - b.x, o.y - b.y) < 3.5) {
              this.setJob(o, 2);
              this.fx('spawn', o.x, o.y, 24);
              trained++;
            }
          }
        }
      }
    }
  }

  // ---------------- 亡者复生 ----------------
  /** 死者化为骷髅（undeadRise 法则）：自然死亡 8% / 战死 6% 触发 */
  riseSkeleton(x: number, y: number) {
    const u = this.spawnUnit(R.SKELETON, x, y, { silent: true });
    if (u) {
      this.fx('spawn', x, y, 30);
      // 偶发播报（防刷屏）：约 1/8 概率
      if (this.rng() < 0.12) {
        this.addEvent('skeleton', '大地传来不祥的声响——一名死者化作了骷髅', { x, y });
      }
    }
  }

  // ---------------- 物品系统（宝物掉落/拾取/装备） ----------------
  /** 在地面掉落一件物品（落水时吸附到最近陆地） */
  dropItem(kind: ItemKind, wx: number, wy: number): GroundItem | null {
    if (this.items.length >= MAX_ITEMS) {
      this.toast('大地上的宝物太多了，等它们被拾取后再丢吧', 'info');
      return null;
    }
    let x = wx;
    let y = wy;
    if (isWater(this.terrain[idx(Math.floor(wx), Math.floor(wy))])) {
      const land = this.findLandNear(wx, wy, 5);
      if (!land) {
        this.toast('宝物沉入了大海——附近没有陆地', 'danger', true);
        return null;
      }
      x = land.x;
      y = land.y;
    }
    const item: GroundItem = { id: this.itemSeq++, kind, x, y };
    this.items.push(item);
    this.fx('spawn', x, y, 30);
    this.onSound?.('place');
    return item;
  }

  /** 宝箱：按档位加权随机掉落一件宝物（普通/秘银/神话三档稀有度区间） */
  dropRandomItem(wx: number, wy: number, tier = 'chest') {
    const pick = rollChestItem(tier, this.rng);
    const it = this.dropItem(pick, wx, wy);
    if (it) {
      const def = ITEM_DEFS[pick];
      const rar = RARITY_META[def.rarity];
      const tierLabel = CHEST_TIERS[tier]?.label ?? '宝箱';
      this.toast(`${tierLabel}开启：${rar.name}${def.name}！`, def.rarity >= 3 ? 'good' : 'info');
      this.fx('heart', wx, wy - 1, 30);
      if (def.rarity >= 4) {
        this.addEvent('loot', `神话宝箱中现世了传说之物——${def.name}，静待有缘人`, { x: wx, y: wy });
      }
    }
  }

  /** 单位经过地面物品时自动装备更强的（七槽位：武器/护甲/头盔/盾牌/靴/戒/符，同槽高阶替换）；
   *  肉：捕食者饥饿捡食恢复，文明单位/强盗拾取入国库（食物储备） */
  tryPickup(u: Unit) {
    const defR = RACES[u.race];
    const eater = defR.isCiv || u.race === R.BANDIT || (defR.predator && !defR.undead);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (Math.abs(it.x - u.x) > 0.9 || Math.abs(it.y - u.y) > 0.9) continue;
      // —— 肉：捕食链的地面食物（拾取即食；非捕食野生动物不捡） ——
      if (it.kind === 'meat') {
        if (!eater || (u.grab ?? 0) > 0) continue;
        if (defR.predator && !defR.undead) {
          u.food = Math.min(160, (u.food ?? 0) + 45); // 饱食回充
          if (this.fxPrefs.dmgNumbers) this.fx('dmg', u.x, u.y - 1, 22, { text: '饱' });
        } else if (u.civ >= 0 && this.civs[u.civ]) {
          const civ = this.civs[u.civ];
          civ.gold = (civ.gold ?? 0) + 2; // 入国库：食物储备（集市经济口径）
          this.fx('coin', u.x, u.y - 1, 20);
        }
        this.items.splice(i, 1);
        this.fx('heart', u.x, u.y - 0.8, 18);
        continue;
      }
      if (!defR.isCiv && u.race !== R.BANDIT) continue; // 野生动物不捡装备
      const def = ITEM_DEFS[it.kind];
      if (!def) continue;
      const field = SLOT_FIELD[def.slot];
      const cur = u[field] as string | null | undefined;
      const curRank = cur ? ITEM_DEFS[cur]?.rank ?? -1 : -1;
      if (curRank >= def.rank) continue; // 已有同级或更好的装备
      // —— 换装先卸旧（Task 34 失衡修复）：同槽替换时扣除旧装备加成——
      //    旧版只加不减：高阶拾取链上伤害无限累加、速度乘子复利，一身神装的兵一刀一个巨龙
      if (cur) {
        const old = ITEM_DEFS[cur];
        if (old) {
          if (old.dmg) u.dmg = Math.max(1, u.dmg - old.dmg);
          if (old.hp) u.maxHp = Math.max(1, u.maxHp - old.hp);
          if (old.speedMul) u.speed /= old.speedMul;
        }
      }
      u[field] = it.kind as ItemKind;
      WBB.touchMeta(); // Task 50：gear/dmg/maxHp/speed meta 写点收口（拾取换装 —— bail 轻重打包依赖）
      if (def.dmg) u.dmg += def.dmg;
      if (def.hp) { u.maxHp += def.hp; u.hp = Math.min(u.maxHp, u.hp + def.hp); }
      if (def.speedMul) u.speed *= def.speedMul;
      this.items.splice(i, 1);
      this.fx('spawn', u.x, u.y, 26);
      this.onSound?.('coin'); // 拾取叮当（42-e 接线）
      // 拾取播报：史诗/传说足够稀有时额外 toast + 纪事
      if (this.fxPrefs.dmgNumbers) this.fx('dmg', u.x, u.y - 1.2, 34, { text: def.name });
      if (def.rarity >= 3) {
        this.toast(`${u.name} 拾取了${RARITY_META[def.rarity].name}${def.name}`, 'good');
      }
      if (def.rarity === 4) {
        this.addEvent('loot', `${u.name}（${u.civ >= 0 ? this.civs[u.civ]?.name ?? '流浪' : RACES[u.race].name}）获得了传说之物「${def.name}」`, { x: u.x, y: u.y });
      }
    }
  }

  // ---------------- 神之手指（抓取投掷：渲染层按指针事件调用三步 API） ----------------
  /** 当前被抓起的单位 id（null = 未抓取） */
  grabId: number | null = null;

  /** ① 按下：抓起 (wx,wy) 半径 2.2 内最近的单位（含飞行/水生），返回是否抓到 */
  beginGrab(wx: number, wy: number): boolean {
    let best: Unit | null = null;
    let bestD = 2.2 * 2.2;
    for (const u of this.units) {
      if (u.dead || u.boat) continue;
      const dx = u.x - wx;
      const dy = u.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = u; }
    }
    if (!best) { this.grabId = null; return false; }
    this.grabId = best.id;
    best.grab = 6;
    this.fx('spawn', best.x, best.y - 0.6, 22);
    return true;
  }

  /** ② 拖动：被抓单位脱离地面跟随指针（AI 暂停、免疫地面伤害；按帧调用保持抓取活性） */
  moveGrab(wx: number, wy: number) {
    if (this.grabId == null) return;
    const u = this.unitById.get(this.grabId);
    if (!u || u.dead) { this.grabId = null; return; }
    if ((u.thrT ?? 0) > 0) return; // 已掷出（飞行中）不再跟随
    u.x = Math.max(0.5, Math.min(W - 0.5, wx));
    u.y = Math.max(0.5, Math.min(H - 0.5, wy));
    u.tx = u.x; u.ty = u.y;
    u.lx = u.x; u.ly = u.y; // 插值锚点同步（指针跟手，不滑行）
    u.rx = u.x; u.ry = u.y;
    u.grab = 6; // 刷新抓取活性（AI 暂停窗口）
  }

  /** ③ 松手：按指针速度投掷 —— 抛物线飞行，落地眩晕 + 按飞行距离伤害 + 尘土特效 */
  endGrab(vx: number, vy: number) {
    if (this.grabId == null) return;
    const u = this.unitById.get(this.grabId);
    this.grabId = null;
    if (!u || u.dead) return;
    const spd = Math.hypot(vx, vy);
    if (spd < 0.35) {
      // 轻放：原地缓降，短暂发懵
      u.grab = 10;
      u.thrT = 0;
      this.fx('dust', u.x, u.y + 0.4, 14);
      return;
    }
    // 抛物线：初速越快飞得越久越远（水平速度衰减模拟空气阻力；tick 数 = 速度驱动）
    u.thrVx = vx / spd * Math.min(1.6, spd * 0.22);
    u.thrVy = vy / spd * Math.min(1.6, spd * 0.22);
    u.thrT = 8 + Math.min(22, Math.round(spd * 5));
    u.thrX0 = u.x;
    u.thrY0 = u.y;
    u.grab = u.thrT + 26; // 飞行 + 落地眩晕全程暂停 AI
    u.atk = 0;
  }

  /** 抓取/飞行/眩晕状态推进（updateUnit 早退分支调用；被抓单位免疫地面伤害） */
  private grabbedTick(u: Unit) {
    if (u.grab) u.grab -= 2;
    if ((u.thrT ?? 0) > 0) {
      // 抛物线飞行：水平速度衰减（空气阻力），落点即停
      u.thrT = (u.thrT ?? 0) - 2;
      const nx = Math.max(0.5, Math.min(W - 0.5, u.x + (u.thrVx ?? 0) * 2));
      const ny = Math.max(0.5, Math.min(H - 0.5, u.y + (u.thrVy ?? 0) * 2));
      // 撞山即坠（其余地形掠过）
      const tt = this.terrain[idx(Math.floor(nx), Math.floor(ny))];
      if (tt !== T.MOUNTAIN) { u.x = nx; u.y = ny; }
      u.thrVx = (u.thrVx ?? 0) * 0.94;
      u.thrVy = (u.thrVy ?? 0) * 0.94;
      if (this.rng() < 0.3) this.fx('dust', u.x, u.y, 10);
      if ((u.thrT ?? 0) <= 0) {
        // 落地：眩晕 + 按飞行距离伤害 + 尘土特效
        const dist = Math.hypot(u.x - (u.thrX0 ?? u.x), u.y - (u.thrY0 ?? u.y));
        const dmg = Math.round(dist * 2.6);
        u.hp -= dmg;
        u.hurt = 24;
        u.grab = Math.max(u.grab ?? 0, 24); // 眩晕躺地（AI 暂停）
        u.thrT = 0;
        for (let k = 0; k < 3; k++) this.fx('dust', u.x + (this.rng() - 0.5) * 1.6, u.y + (this.rng() - 0.5) * 1.6, 20);
        if (this.fxPrefs.dmgNumbers && dmg > 0) this.fx('dmg', u.x, u.y - 1, 30, { text: `${dmg}` });
        this.shake = Math.max(this.shake, Math.min(5, 1 + dist * 0.3));
      }
      if (u.hp <= 0) u.dead = true;
    } else if ((u.grab ?? 0) <= 0) {
      // 眩晕结束：清账归队
      u.grab = 0;
      u.thrVx = 0;
      u.thrVy = 0;
    }
  }

  // ---------------- 肉掉落（动物死亡 → 猎人与文明的食物来源） ----------------
  /** 动物尸体落肉：1-3 块散落原地（捕食者饥饿捡食恢复；文明单位拾取入国库食物储备） */
  dropMeat(wx: number, wy: number, n: number) {
    const cnt = Math.max(1, Math.min(3, Math.round(n)));
    for (let k = 0; k < cnt; k++) {
      if (this.items.length >= MAX_ITEMS - 6) return; // 与宝物共享地面物品预算（留少量余量）
      const px = Math.max(0.5, Math.min(W - 0.5, wx + (this.rng() - 0.5) * 1.6));
      const py = Math.max(0.5, Math.min(H - 0.5, wy + (this.rng() - 0.5) * 1.6));
      if (isWater(this.terrain[idx(Math.floor(px), Math.floor(py))])) {
        const land = this.findLandNear(px, py, 3);
        if (!land) continue; // 沉海喂鱼
        this.items.push({ id: this.itemSeq++, kind: 'meat', x: land.x, y: land.y });
      } else {
        this.items.push({ id: this.itemSeq++, kind: 'meat', x: px, y: py });
      }
    }
  }

  // ---------------- 世界法则驱动的周期事件 ----------------
  /** 强盗袭击：荒野深处集结强盗团伙（900 tick ≈ 22.5 年一次） */
  banditRaidTick() {
    if (!this.laws.banditRaids) return;
    // —— 社会互连：低稳定国家（<40）的边境更易匪患（乱世出盗匪）——
    const weakBorders: { x: number; y: number }[] = []
    for (const c of this.civs) {
      if (!c.alive || (c.stability ?? 70) >= 40 || c.tiles.length === 0) continue;
      const t = c.tiles[Math.floor(this.rng() * c.tiles.length)];
      weakBorders.push({ x: this.tileX(t) + 0.5, y: this.tileY(t) + 0.5 });
    }
    // 低稳定边境 45% 概率优先出匪；否则照旧荒野集结
    if (weakBorders.length > 0 && this.rng() < 0.45) {
      const spot = weakBorders[Math.floor(this.rng() * weakBorders.length)];
      const n = 2 + Math.floor(this.rng() * 3);
      for (let s = 0; s < n; s++) {
        this.spawnUnit(R.BANDIT, spot.x + this.rng() * 3 - 1.5, spot.y + this.rng() * 3 - 1.5, { silent: true });
      }
      this.addEvent('bandit', `乱世匪患：一伙强盗（${n} 人）趁乱在动荡的国度边境啸聚`, { x: spot.x, y: spot.y });
      this.toast('动荡的王国内出现了强盗', 'danger');
      return;
    }
    for (let k = 0; k < 30; k++) {
      const x = 4 + this.rng() * (W - 8);
      const y = 4 + this.rng() * (H - 8);
      const i = idx(Math.floor(x), Math.floor(y));
      const t = this.terrain[i];
      if (t !== T.GRASS && t !== T.FOREST && t !== T.SAND && t !== T.SNOW) continue;
      if (this.owner[i] >= 0) continue;
      // 远离文明的建筑（荒野）
      let near = false;
      for (const b of this.buildings) {
        if (Math.hypot(b.x - x, b.y - y) < 16) { near = true; break; }
      }
      if (near) continue;
      const n = 2 + Math.floor(this.rng() * 3);
      for (let s = 0; s < n; s++) {
        this.spawnUnit(R.BANDIT, x + this.rng() * 3 - 1.5, y + this.rng() * 3 - 1.5, { silent: true });
      }
      this.addEvent('bandit', `一伙强盗（${n} 人）在荒野中集结，正逼近文明的边境`, { x, y });
      this.toast('荒野中出现了强盗的踪迹', 'danger');
      break;
    }
  }

  /** 巨龙自然降临：dragonSpawns 法则开启时每 3000 tick（75 年）检查一次 */
  dragonSpawnTick() {
    if (!this.laws.dragonSpawns) return;
    if ((this.wildCount.get(R2) ?? 0) >= MAX_DRAGONS) return;
    for (let k = 0; k < 24; k++) {
      const x = 6 + this.rng() * (W - 12);
      const y = 6 + this.rng() * (H - 12);
      if (isLand(this.terrain[idx(Math.floor(x), Math.floor(y))])) {
        this.spawnUnit(R2, x, y); // spawnUnit 自带 toast + event
        break;
      }
    }
  }

  // ---------------- 叛乱分裂（ rebels 法则） ----------------
  /** 大王国叛乱：距首都最远的聚落宣布独立，周边领土与国民脱离 → 新王国与母国开战 */
  splitKingdom(civ: Civ) {
    if (civ.capital < 0 || civ.tiles.length === 0) return;
    const capX = this.tileX(civ.capital);
    const capY = this.tileY(civ.capital);
    // 找距首都最远的本国建筑作为叛乱策源地（至少 14 格）
    let anchor: Building | null = null;
    let bestD = 14;
    for (const b of this.buildings) {
      if (b.civ !== civ.id) continue;
      const d = Math.hypot(b.x - capX, b.y - capY);
      if (d > bestD) { bestD = d; anchor = b; }
    }
    if (!anchor) return;
    // 建立叛军王国（同种族新王国，createCiv 自带建国播报）
    const newId = this.createCiv(civ.race, anchor.x + 0.5, anchor.y + 0.5);
    const rebel = this.civs[newId];
    if (!rebel) return;
    // 转移策源地周边领土（半径 9 内的母国领土易帜）
    const keep: number[] = [];
    for (const i of civ.tiles) {
      if (this.owner[i] !== civ.id) continue; // 陈旧记录
      const x = this.tileX(i);
      const y = this.tileY(i);
      if (Math.hypot(x - anchor.x, y - anchor.y) <= 9) {
        this.owner[i] = rebel.id;
        rebel.tiles.push(i);
        this.markDirty(i);
      } else {
        keep.push(i);
      }
    }
    civ.tiles = keep;
    // 转移策源地建筑（含房屋账目）
    const bi = this.bIdx.get(anchor.i);
    if (bi !== undefined) {
      const b = this.buildings[bi];
      if (b.civ === civ.id) {
        b.civ = rebel.id;
        civ.houses--;
        rebel.houses++;
      }
    }
    // 转移领土上的国民（人口账目同步）
    let moved = 0;
    for (const u of this.units) {
      if (u.dead || u.civ !== civ.id || u.boat) continue;
      if (Math.hypot(u.x - anchor.x, u.y - anchor.y) <= 9) {
        u.civ = rebel.id;
        moved++;
      }
    }
    civ.pop -= moved;
    rebel.pop += moved;
    // 叛乱即战争（宗主讨伐叛军——不死不休的叛乱战争，目的=叛军覆灭）
    this.declareWar(civ.id, rebel.id, 'rebel', { force: true });
    if (this.overlayMode === 'political' || this.overlayMode === 'alliance') this.overlayDirty = true;
  }

  // ---------------- 船只跨海殖民 ----------------
  /** 繁荣的文明周期性派出殖民船驶向无主之地（人口≥10、房屋≥2、冷却已过） */
  tryLaunchColonyShip(civ: Civ): boolean {
    WBB.touchMeta(); // Stage 3：殖民船 boat 列收口
    // 无论成败先进入冷却，避免每 5 tick 重扫（600-1200 tick ≈ 15-30 年；航海科技缩短间隔）
    const colMul = this.techModsOf(civ.id).col;
    civ.colonizeCd = this.tickCount + Math.max(220, Math.round((600 + Math.floor(this.rng() * 600)) * colMul));
    // 挑一名国民充当殖民者（不要抽干小国人口）
    const cand = this.units.filter((u) => !u.dead && u.civ === civ.id && !u.boat);
    if (cand.length < 6) return false;
    const u = cand[Math.floor(this.rng() * cand.length)];
    // 找最近的海面（半径 8 内且有足够水域，避免在小池塘启航）
    const water = this.findWaterNear(u.x, u.y, 8);
    if (!water) return false;
    // 找一块远方的无主可居住土地作为殖民目标
    const target = this.findColonyTarget(u.x, u.y);
    if (!target) return false;
    // 启航
    u.boat = 1;
    u.boatTTL = 1200; // 航海寿命（约 30 年）
    u.x = water.x;
    u.y = water.y;
    u.tx = target.x;
    u.ty = target.y;
    u.hp = Math.min(u.maxHp, u.hp + 20); // 朝圣者获得体力補充以支撑远航
    this.fx('spawn', water.x, water.y, 30);
    this.addEvent('colonize', `「${civ.name}」的殖民船扬帆启航，驶向未知的大海`, { colorHex: civ.colorHex, x: water.x, y: water.y });
    this.toast(`「${civ.name}」的殖民船启航了`, 'info');
    return true;
  }

  /** 找 (x,y) 附近最近的海面 tile（要求 8 邻域至少 5 格水域——真正的海而非池塘） */
  findWaterNear(x: number, y: number, r: number): { x: number; y: number } | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let ring = 1; ring <= r; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue; // 只看当前环
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
          const i = idx(xx, yy);
          if (!isWater(this.terrain[i])) continue;
          let waterN = 0;
          for (let ny = -1; ny <= 1; ny++) {
            for (let nx = -1; nx <= 1; nx++) {
              if (nx === 0 && ny === 0) continue;
              if (isWater(this.terrain[idx(xx + nx, yy + ny)])) waterN++;
            }
          }
          if (waterN >= 5) return { x: xx + 0.5, y: yy + 0.5 };
        }
      }
    }
    return null;
  }

  /** 采样远方无主可居住土地（距离 25-85，采样 40 次） */
  findColonyTarget(x: number, y: number): { x: number; y: number } | null {
    for (let k = 0; k < 40; k++) {
      const ang = this.rng() * Math.PI * 2;
      const dist = 25 + this.rng() * 60;
      const xx = Math.floor(x + Math.cos(ang) * dist);
      const yy = Math.floor(y + Math.sin(ang) * dist);
      if (xx < 2 || yy < 2 || xx >= W - 2 || yy >= H - 2) continue;
      const i = idx(xx, yy);
      if (this.owner[i] === -1 && this.building[i] === 0 && buildable(this.terrain[i])) {
        return { x: xx + 0.5, y: yy + 0.5 };
      }
    }
    return null;
  }

  /** 找 (x,y) 附近最近的陆地 tile（导航超时后改向最近海岸） */
  findLandNear(x: number, y: number, r: number): { x: number; y: number } | null {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let ring = 1; ring <= r; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const xx = cx + dx;
          const yy = cy + dy;
          if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
          const t = this.terrain[idx(xx, yy)];
          if (!isWater(t) && t !== T.MOUNTAIN && t !== T.LAVA) return { x: xx + 0.5, y: yy + 0.5 };
        }
      }
    }
    return null;
  }

  /** 殖民船每 tick 航行：贪心绕障（仅水面上移动），抵近目标/超时后尝试靠岸 */
  updateBoat(u: Unit) {
    u.age += 2 / YEAR_TICKS;
    if (u.age > u.maxAge) { u.dead = true; return; } // 年迈的殖民者可能死在航程中
    u.boatTTL = (u.boatTTL ?? 0) - 1;

    const dx = u.tx - u.x;
    const dy = u.ty - u.y;
    const d = Math.hypot(dx, dy);

    // 超时后改向最近陆地；宽限期内仍找不到岸则海难
    if ((u.boatTTL ?? 0) <= 0) {
      if ((u.boatTTL ?? 0) <= -600) {
        u.dead = true;
        this.fx('skull', u.x, u.y, 46);
        this.addEvent('shipwreck', '一艘殖民船连同它的船员葬身了大海', { x: u.x, y: u.y });
        return;
      }
      const land = this.findLandNear(u.x, u.y, 14);
      if (land) { u.tx = land.x; u.ty = land.y; }
    }

    // —— 靠岸登陆判定 ——
    // 目标常在内陆深处（敌建筑/殖民点距岸数格）：按「距目标直线距离」永远进不了 2.5 登陆圈。
    // 正确信号是「直航前方被陆地阻断」= 已抵达面向目标的海岸 → 改锚 2 格内最近岸并尝试登陆
    const baseAng = Math.atan2(u.ty - u.y, u.tx - u.x);
    const aheadX = Math.floor(u.x + Math.cos(baseAng) * 0.4);
    const aheadY = Math.floor(u.y + Math.sin(baseAng) * 0.4);
    const aheadBlocked = aheadX < 0 || aheadY < 0 || aheadX >= W || aheadY >= H || !isWater(this.terrain[idx(aheadX, aheadY)]);
    if (aheadBlocked) {
      const coast = this.findLandNear(u.x, u.y, 2);
      if (coast) { u.tx = coast.x; u.ty = coast.y; }
    }
    if (Math.hypot(u.tx - u.x, u.ty - u.y) < 2.5) {
      if (this.disembark(u)) return;
      // 船边无岸（湖心等罕见情形）：改向目标周边海岸寻地登陆
      if ((u.boatTTL ?? 0) > 0) {
        const land = this.findLandNear(u.tx, u.ty, 6);
        if (land) { u.tx = land.x; u.ty = land.y; }
      }
    }

    // 航行：直航角 ± 绕障偏角依次尝试（只在水面推进；baseAng 已在靠岸判定中求出）
    const step = 0.26; // 船速（约为行军 1.4 倍 — WorldBox 中乘船快于步行）
    for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.6, -2.6, Math.PI]) {
      const ang = baseAng + off;
      const nx = u.x + Math.cos(ang) * step;
      const ny = u.y + Math.sin(ang) * step;
      if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
      if (!isWater(this.terrain[idx(Math.floor(nx), Math.floor(ny))])) continue;
      u.x = nx;
      u.y = ny;
      if (Math.cos(ang) !== 0) u.flip = Math.cos(ang) < 0;
      return;
    }
    // 完全被围（罕见）：原地等待下一 tick
  }

  /** 靠岸登陆：优先无主沃土（建定居点）> 本国领土 > 拒绝敌国海岸。成功返回 true */
  disembark(u: Unit): boolean {
    const x = Math.floor(u.x);
    const y = Math.floor(u.y);
    let best: number | null = null;
    let bestScore = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = idx(xx, yy);
        const t = this.terrain[i];
        if (isWater(t) || t === T.MOUNTAIN || t === T.LAVA) continue;
        let score = 0;
        if (this.owner[i] === -1 && this.building[i] === 0 && buildable(t)) score = 3; // 处女地
        else if (this.owner[i] === u.civ && u.civ >= 0) score = 2; // 回到家门
        else if (u.civ >= 0 && this.owner[i] >= 0 && this.owner[i] !== u.civ && this.atWar(u.civ, this.owner[i])) score = 1; // 战时入侵：敌国海岸也可登陆（战争舰队）
        if (score > bestScore) { bestScore = score; best = i; }
      }
    }
    if (best == null) return false;
    WBB.touchMeta(); // Stage 3：下船 boat 列收口（Task 50：仅成功路径 —— 靠岸失败不再触发全表 meta 重灌）
    const lx = this.tileX(best) + 0.5;
    const ly = this.tileY(best) + 0.5;
    const wasColonist = bestScore === 3;
    u.boat = 0;
    u.boatTTL = 0;
    u.x = lx;
    u.y = ly;
    u.tx = lx;
    u.ty = ly;
    this.fx('spawn', lx, ly, 30);
    if (wasColonist) this.foundSettlement(u, best);
    return true;
  }

  /** 在新大陆建立定居点：建房 + 圈地 5x5 + 纪事播报 */
  foundSettlement(u: Unit, i: number) {
    const civ = u.civ >= 0 ? this.civs[u.civ] : null;
    if (!civ || !civ.alive) return;
    if (this.building[i] === 0 && buildable(this.terrain[i])) {
      this.buildBuilding(i, 1, civ.id);
    }
    const cx = this.tileX(i);
    const cy = this.tileY(i);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = idx(xx, yy);
        if (this.owner[j] === -1 && isLand(this.terrain[j]) && this.terrain[j] !== T.MOUNTAIN) {
          this.claimTile(j, civ.id);
        }
      }
    }
    this.addEvent('settle', `「${civ.name}」的殖民者在遥远的海岸建立了新定居点`, { colorHex: civ.colorHex, x: cx, y: cy });
    this.toast(`「${civ.name}」的殖民者发现了新大陆`, 'good');
    this.fx('heart', cx, cy - 1, 40);
  }

  warTarget(civId: number): Building | null {
    const enemies: Building[] = [];
    for (const b of this.buildings) {
      if (b.civ !== civId && this.atWar(civId, b.civ)) enemies.push(b);
    }
    if (enemies.length === 0) return null;
    return enemies[Math.floor(this.rng() * enemies.length)];
  }

  /** 战时跨海远征：战士/弓手在岸边自动登船驶向隔海的敌国（WorldBox 战争船）
   *  触发：交战中、行军目标距离远且直线跨水、当前在陆地步行、附近有可下锚海域。
   *  在 moveUnit 被地形阻断时调用（走不过去 = 隔海，登船绕过去） */
  maybeBoardForWar(u: Unit): boolean {
    WBB.touchMeta(); // Stage 3：战争登船 boat 列收口
    if (u.boat || !RACES[u.race].isCiv) return false;
    const job = u.job ?? 0;
    if (job !== 2 && job !== 3) return false; // 只有作战职业会跨海远征
    if (u.civ < 0 || !this.civAtWar(u.civ)) return false;
    const dx = u.tx - u.x;
    const dy = u.ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) return false; // 近距离目标正常行军
    // 直线跨水采样：水面占比 ≥ 45% → 视为隔海（山阻不是跨海）
    let water = 0;
    const samples = Math.max(1, Math.floor(d));
    for (let s = 1; s <= samples; s++) {
      const xx = Math.floor(u.x + (dx * s) / d);
      const yy = Math.floor(u.y + (dy * s) / d);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (isWater(this.terrain[idx(xx, yy)])) water++;
    }
    if (water / samples < 0.45) return false;
    const cur = this.terrain[idx(Math.floor(u.x), Math.floor(u.y))];
    if (isWater(cur)) return false; // 落水者直接游向岸边
    const dock = this.findWaterNear(u.x, u.y, 4);
    if (!dock) return false;
    // —— 集结编队：附近 6 格内同国的作战同袍一起登船（集团军出海，不再单个漂洋）——
    const sharedTarget = { tx: u.tx, ty: u.ty, ttl: 700 + Math.floor(this.rng() * 300) };
    const board = (o: Unit) => {
      o.boat = 1;
      o.boatTTL = sharedTarget.ttl;
      o.x = dock!.x + (this.rng() - 0.5) * 1.2;
      o.y = dock!.y + (this.rng() - 0.5) * 1.2;
      o.lx = o.x;
      o.ly = o.y; // 登船重置插值起点，避免一帧长距离滑行
      o.tx = sharedTarget.tx;
      o.ty = sharedTarget.ty;
      this.fx('spawn', o.x, o.y, 24);
    };
    board(u);
    let fleet = 1;
    for (const o of this.units) {
      if (fleet >= 4) break; // 编队上限 4 艘（同屏成本可控）
      if (o === u || o.dead || o.boat || o.civ !== u.civ) continue;
      const ojob = o.job ?? 0;
      if (ojob !== 2 && ojob !== 3) continue;
      if (Math.hypot(o.x - u.x, o.y - u.y) > 6) continue;
      // 同编队：目标一致（驶向同一敌国建筑 → 抵达后自然汇合攻城）
      board(o);
      fleet++;
    }
    if (fleet >= 3) {
      this.addEvent('war', `「${this.civs[u.civ]?.name ?? ''}」的一支舰队（${fleet} 艘战船）跨海远征`, { colorHex: this.civs[u.civ]?.colorHex, x: u.x, y: u.y });
    }
    return true;
  }

  /** 通行判定（moveUnit 专用）：游泳中放行除岩浆/山外的所有格；山顶放行除水域/岩浆外的所有格；平地走 walkable */
  private static passTile(swimming: boolean, onMountain: boolean, t: number): boolean {
    if (swimming) return t !== T.LAVA && t !== T.MOUNTAIN;
    if (onMountain) return t !== T.DEEP && t !== T.WATER && t !== T.LAVA;
    return walkable(t);
  }

  /** 城墙阻挡判定：目标格有敌方城墙 → 陆行敌人不可通行（己方/中立/飞行放行；
   *  与墙主交战的文明单位与天生的敌意野怪（hostile）都会被墙拦住） */
  private wallBlocks(x: number, y: number, u: Unit): boolean {
    const i = idx(x, y);
    if (this.building[i] !== BUILD_KINDS.WALL) return false;
    const b = this.buildings[this.bIdx.get(i) ?? -1];
    if (!b || b.civ === u.civ) return false; // 己方城墙自家随便走
    if (u.civ >= 0) return this.atWar(b.civ, u.civ); // 中立/盟友通行，交战国被拦
    return RACES[u.race].hostile; // 无国籍野怪：天生敌意者被拦（狼/僵尸等），走兽野兽通行
  }

  moveUnit(u: Unit, mul: number) {
    const def = RACES[u.race];
    const dx = u.tx - u.x;
    const dy = u.ty - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return;
    // 寒冻（暴风雪）：移速锐减的踱步；诅咒：紫霾缠身寸步难行
    let step = u.speed * 2 * mul * (u.chill ? 0.55 : 1) * (u.curse ? 0.75 : 1);
    // 沼泽泥泞：陷足难行（移速 ×0.6）
    if (this.terrain[idx(Math.floor(u.x), Math.floor(u.y))] === T.SWAMP) step *= 0.6;
    // 冷血缓滞（季节节律）：寒冬降临变温生物代谢迟缓，爬行/变温种族移速 ×0.6
    if (def.coldBlood && this.nature.season === 3) step *= 0.6;
    // 深度打磨：道路行军加成 — 土路上的军队/商队/平民提速 45%（路网价值）
    if (this.road[idx(Math.floor(u.x), Math.floor(u.y))] > 0) step *= 1.45;
    const nx = u.x + (dx / d) * step;
    const ny = u.y + (dy / d) * step;
    if (dx !== 0) u.flip = dx < 0;
    if (def.flying) {
      u.x = Math.max(0.5, Math.min(W - 0.5, nx));
      u.y = Math.max(0.5, Math.min(H - 0.5, ny));
      return;
    }
    // 通行规则：
    // - 平地单位照旧（不可入山/水/岩浆）
    // - 落水单位可以"游泳"（水→水/水→岸都放行）→ 朝岸边漂而不是原地扑腾淹死
    // - 山顶单位可以"翻山"（山→山/山→地都放行）→ 走下山而不是被永远困在峰顶
    // - 水生巨怪（克拉肯）：只能在水域游动（冰面也不行 —— 它在冰下凿不开路）
    // - 沙泳巨虫（沙虫）：只能在沙/草/焦土潜行（沙海之王不洺水不登山）
    const cur = this.terrain[idx(Math.floor(u.x), Math.floor(u.y))];
    if (def.aquatic) {
      // 水生巨怪只可在水域游动（内联判定替代闭包 —— 每次移动都分配闭包是热路径浪费）；
      // 滩涂两栖（蟹）：邻水沙滩亦可爬行
      const nt = this.terrain[idx(Math.floor(nx), Math.floor(ny))];
      if (nt === T.DEEP || nt === T.WATER || (def.beach && nt === T.SAND)) { u.x = nx; u.y = ny; }
      else if (!isWater(cur) && !def.beach) {
        // 搁浅自救（洪水/海啸退潮遗留）：离水的纯水生单位在陆上蹦跳（×0.7 蹒跚仍快于窒息线），
        // 踏任何地表直奔目标（目标已被漫游限定为最近水域）—— 回海后恢复常态水游
        const f = 0.7;
        u.x = Math.max(0.5, Math.min(W - 0.5, u.x + (nx - u.x) * f));
        u.y = Math.max(0.5, Math.min(H - 0.5, u.y + (ny - u.y) * f));
        u.flip = dx < 0;
      }
      else {
        // 留在深水：随机改向游动
        u.tx = Math.max(1, Math.min(W - 2, u.x + (this.rng() * 2 - 1) * 8));
        u.ty = Math.max(1, Math.min(H - 2, u.y + (this.rng() * 2 - 1) * 8));
      }
      return;
    }
    if (def.sandswim) {
      // 沙泳巨虫只可在沙/草/焦土潜行（内联判定替代闭包）
      const nt = this.terrain[idx(Math.floor(nx), Math.floor(ny))];
      if (nt === T.SAND || nt === T.GRASS || nt === T.BURNT) { u.x = nx; u.y = ny; }
      else {
        u.tx = Math.max(1, Math.min(W - 2, u.x + (this.rng() * 2 - 1) * 6));
        u.ty = Math.max(1, Math.min(H - 2, u.y + (this.rng() * 2 - 1) * 6));
      }
      // 沙泳扬尘：移动中偶尔喷出沙尘（原子级拖尾反馈）
      if (this.fxPrefs.ambience && this.rng() < 0.08) this.fx('dust', u.x, u.y + 0.5, 12);
      return;
    }
    const swimming = cur === T.DEEP || cur === T.WATER;
    const onMountain = cur === T.MOUNTAIN;
    // 通行判定（静态方法替代每步新建的闭包；语义与原 passable 完全一致）+ 城墙阻挡（敌方陆行单位不可逾越）
    const wallChk = swimming ? (_x: number, _y: number) => false : (x: number, y: number) => this.wallBlocks(x, y, u);
    const passX = !wallChk(Math.floor(nx), Math.floor(u.y)) && GameEngine.passTile(swimming, onMountain, this.terrain[idx(Math.floor(nx), Math.floor(u.y))]);
    const passY = !wallChk(Math.floor(u.x), Math.floor(ny)) && GameEngine.passTile(swimming, onMountain, this.terrain[idx(Math.floor(u.x), Math.floor(ny))]);
    if (passX && passY) { u.x = nx; u.y = ny; }
    else if (passX) u.x = nx;
    else if (passY) u.y = ny;
    else {
      // 阻断：战时可能是隔海 → 登船跨海远征（WorldBox 战争船）；否则随机改向绕行
      if (this.maybeBoardForWar(u)) return;
      u.tx = Math.max(1, Math.min(W - 2, u.x + (this.rng() * 2 - 1) * 6));
      u.ty = Math.max(1, Math.min(H - 2, u.y + (this.rng() * 2 - 1) * 6));
    }
  }

  // ---------------- civs sim ----------------
  /** 建造决策：按人口压力/战争/财富/知识加权选拣建筑类别（文明深度核心） */
  pickBuildingKind(civ: Civ): number {
    const counts = this.civBuildCounts.get(civ.id);
    const c = (k: number) => (counts ? counts[k] ?? 0 : 0);
    const houses = Math.max(1, civ.houses);
    const gold = civ.gold ?? 0;
    const know = civ.knowledge ?? 0;
    const atWar = this.civAtWar(civ.id);
    const pop = Math.max(1, civ.pop);
    // 旨意加成：建城令住宅权重 ×3 / 信仰令神殿权重 ×5（文明自行达成的引擎）
    const buildDir = this.activeDirective(civ.id, 'build');
    const templeDir = this.activeDirective(civ.id, 'temple');
    const cands: { kind: number; w: number }[] = [];
    // 住宅：人口压力的基本解
    cands.push({ kind: BUILD_KINDS.HOUSE, w: buildDir ? 30 : 10 });
    // 农田：供养扩张（每 3 人需要 1 农田支撑）
    if (c(BUILD_KINDS.FARM) * 3 < pop / 3 + 2) cands.push({ kind: BUILD_KINDS.FARM, w: 9 });
    // 兵营：战时军备
    if (atWar && c(BUILD_KINDS.BARRACKS) < 1 + houses / 10) cands.push({ kind: BUILD_KINDS.BARRACKS, w: 8 });
    // 箭塔：战争防御
    if (atWar && c(BUILD_KINDS.TOWER) < 1 + houses / 12) cands.push({ kind: BUILD_KINDS.TOWER, w: 5 });
    // 集市：财富引擎
    if (c(BUILD_KINDS.MARKET) < 1 + houses / 12) cands.push({ kind: BUILD_KINDS.MARKET, w: 6 });
    // 图书馆：知识引擎
    if (c(BUILD_KINDS.LIBRARY) < 1 + houses / 20) cands.push({ kind: BUILD_KINDS.LIBRARY, w: 4 });
    // 港口：海洋扩张
    if (know >= (BUILDING_DEFS[BUILD_KINDS.PORT].needKnowledge ?? 0) && c(BUILD_KINDS.PORT) < 1 + houses / 25) cands.push({ kind: BUILD_KINDS.PORT, w: 4 });
    // 神殿：治疗庇佑
    if (know >= (BUILDING_DEFS[BUILD_KINDS.TEMPLE].needKnowledge ?? 0) && c(BUILD_KINDS.TEMPLE) < 1 + houses / 15) cands.push({ kind: BUILD_KINDS.TEMPLE, w: templeDir ? 18 : 3 });
    // 城堡：终极防御
    if (know >= (BUILDING_DEFS[BUILD_KINDS.CASTLE].needKnowledge ?? 0) && c(BUILD_KINDS.CASTLE) < 1 + houses / 25) cands.push({ kind: BUILD_KINDS.CASTLE, w: 6 });
    // 过滤财富不足的候选
    const afford = cands.filter((x) => gold >= (BUILDING_DEFS[x.kind].cost ?? 0));
    const pool = afford.length > 0 ? afford : [{ kind: BUILD_KINDS.HOUSE, w: 1 }];
    let total = 0;
    for (const x of pool) total += x.w;
    let r = this.rng() * total;
    for (const x of pool) { r -= x.w; if (r <= 0) return x.kind; }
    return BUILD_KINDS.HOUSE;
  }

  civsTick() {
    this.civFuseScan(); // 超级演化 v4：深盟融合扫描（内部自带 300 tick 错峰门）
    // —— 王权：王位空缺补冕（建国首王/旧档补冕/驾崩继承；内部逐国扫描） ——
    if (this.tickCount % 40 === 0) this.crownVacantTick();
    // —— 城墙：有城防科技的王国环绕首都修筑城墙圈（分批砌筑） ——
    if (this.tickCount % 20 === 0) this.wallTick();
    for (const civ of this.civs) {
      if (!civ.alive) continue;
      // 幽灵王国消亡：人口持续为 0（哪怕还有空房）超过 10 年 → 自然消亡，领土归无主
      if (civ.pop <= 0) {
        if (civ.popZeroTick == null) civ.popZeroTick = this.tickCount;
        else if (this.tickCount - civ.popZeroTick > 400) { this.eliminateCiv(civ); continue; }
      } else civ.popZeroTick = undefined;
      // 幽灵王国自愈：有国民但零领土零边境（水上建国/旧存档数据/家园尽毁）
      // → 每 600 tick 在一名在世成员脚下重新播种（旧存档读入后同样生效）
      if (civ.pop > 0 && civ.frontier.length === 0 && this.tickCount % 600 === 0) {
        let owned = 0;
        for (const i of civ.tiles) if (this.owner[i] === civ.id) owned++;
        if (owned === 0) {
          const member = this.units.find((u) => !u.dead && u.civ === civ.id);
          if (member) {
            this.seedTerritory(civ, Math.floor(member.x), Math.floor(member.y));
            if (civ.tiles.length > 0) {
              this.toast(`「${civ.name}」的流亡者重新扎根了`, 'good');
              this.addEvent('settle', `「${civ.name}」的流亡者在新的土地上重新扎根`, { colorHex: civ.colorHex, x: member.x, y: member.y });
            }
          }
        }
      }
      // 总动员期间：平民持续武装化（旨意/开发者驱动的全民皆兵）
      if (civ.mobilizeUntil != null && this.tickCount < (civ.mobilizeUntil ?? 0) && this.tickCount % 25 === 0) {
        let n = 0;
        for (const u of this.units) {
          if (n >= 2) break;
          if (u.dead || u.civ !== civ.id || u.boat) continue;
          const job = u.job ?? 0;
          if (job === 0 || job === 1 || job === 5) { this.setJob(u, 2); n++; }
        }
      }
      // territory expansion — 2 tiles per civ every 5 ticks（无人不扩张：无民何以为国）；扩张令期间加速 3 倍
      const expandBoost = this.activeDirective(civ.id, 'expand') ? 3 : 1;
      if (this.laws.cityGrowth && civ.pop > 0) for (let k = 0; k < 2 * expandBoost; k++) {
        if (civ.frontier.length === 0) break;
        const fi = Math.floor(this.rng() * civ.frontier.length);
        const i = civ.frontier[fi];
        civ.frontier[fi] = civ.frontier[civ.frontier.length - 1];
        civ.frontier.pop();
        if (this.owner[i] !== -1) continue;
        if (!isLand(this.terrain[i]) || this.terrain[i] === T.MOUNTAIN) continue;
        this.claimTile(i, civ.id);
      }
      // housing & building variety：按人口压力/战争/财富/知识选择建造目标
      if (this.tickCount % 120 === 0 && civ.pop > 0) {
        const cap = this.popCapOf(civ);
        if (civ.pop > cap - 2) {
          const kind = this.pickBuildingKind(civ);
          const cost = BUILDING_DEFS[kind].cost ?? 0;
          if ((civ.gold ?? 0) >= cost) {
            if (this.tryBuildBuilding(civ, kind)) civ.gold = (civ.gold ?? 0) - cost;
          } else {
            // 财富不足 → 退而建免费住宅
            this.tryBuildBuilding(civ, BUILD_KINDS.HOUSE);
          }
        }
      }
      // war towers（保留旧时代行为：战争期间补建箭塔）
      if (this.tickCount % 300 === 0 && civ.houses > 8 && this.rng() < 0.5) {
        let atWar = false;
        for (const other of this.civs) {
          if (other.alive && other.id !== civ.id && this.atWar(civ.id, other.id)) { atWar = true; break; }
        }
        if (atWar) this.tryBuildBuilding(civ, BUILD_KINDS.TOWER);
      }
      // colony ships — 繁荣文明周期性跨海殖民
      if (civ.pop >= 10 && civ.houses >= 2 && this.tickCount >= (civ.colonizeCd ?? 0) && this.rng() < 0.06) {
        this.tryLaunchColonyShip(civ);
      }
      // 叛乱分裂：大国度（人口 > 30 且领土 > 220）每 300 tick（7.5 年）掷骰 ——
      // 社会体系联动：稳定度低 → 概率倍增（动荡帝国四分五裂）；稳定度高 → 几乎无内乱
      if (this.laws.rebels && this.tickCount % 300 === 0 && civ.pop > 30 && civ.tiles.length > 220) {
        const stab = civ.stability ?? 70;
        const rebelChance = stab < 30 ? 0.16 : stab < 50 ? 0.08 : stab < 70 ? 0.04 : 0.015;
        if (this.rng() < rebelChance) {
          this.splitKingdom(civ);
          continue;
        }
      }
      // promote capital
      if (civ.capital < 0 && civ.houses > 0) {
        const b = this.buildings.find((bb) => bb.civ === civ.id && bb.kind === 1);
        if (b) {
          this.bIdx.delete(b.i);
          this.building[b.i] = 0;
          const civ2 = this.civs[b.civ];
          if (civ2) civ2.houses--;
          const bi = this.buildings.indexOf(b);
          const last = this.buildings.pop()!;
          if (bi < this.buildings.length) { this.buildings[bi] = last; this.bIdx.set(last.i, bi); }
          this.buildBuilding(b.i, 2, civ.id);
          civ.capital = b.i;
          // 迁都播报（王都陷落后的韧性）
          this.addEvent('capital', `「${civ.name}」迁都于新都，重整山河`, { colorHex: civ.colorHex, x: b.x, y: b.y });
        }
      }
      // elimination
      if (civ.pop <= 0 && civ.houses <= 0) this.eliminateCiv(civ);
    }
  }

  // ================== 军团方阵体系（Army Formation System） ==================
  /** 军团规模：组建下限 / 编队上限 */
  static readonly ARMY_MIN = 6;
  static readonly ARMY_MAX = 24;
  /** 军旗推进速度（tile/tick）——方阵步频 */
  static readonly ARMY_SPEED = 0.05;
  /** 军团解散后的再征兵冷却（tick） */
  static readonly ARMY_CD = 900;

  /** 组建军团：从王都周边集结战士/弓手成方阵（需处于战争状态） */
  tryFormArmy(civ: Civ, targetCiv?: number): Army | null {
    WBB.touchMeta(); // Stage 3：军团编入 army 列收口
    if (!civ.alive || civ.pop < 10) return null;
    if (this.tickCount < (civ.armyCd ?? 0)) return null;
    const armyCap = Math.max(1, Math.round(((this.activeDirective(civ.id, 'legion') ? Math.max(3, this.activeDirective(civ.id, 'legion')!.param) : 2) + this.techModsOf(civ.id).armyMax + (this.govOf(civ.id) === 4 ? 1 : 0)) * (0.75 + (RACES[civ.race]?.aggr ?? 0.5) * 0.5)));
    if (this.armies.filter((a) => a.civ === civ.id).length >= armyCap) return null;
    // 目标敌国：指定或取交战中最近且尚有建筑者
    let enemyId = targetCiv ?? -1;
    if (enemyId < 0) {
      const e = this.pickWarEnemy(civ.id);
      if (!e) return null;
      enemyId = e.id;
    } else if (!this.civs[enemyId]?.alive || !this.atWar(civ.id, enemyId)) return null;
    // 兵员：集结点 24 格内的无军团战士/弓手（大帝国边疆兵员也可入列）；
    // 不足编时回退全国征召（前线战士向军旗回师集结）
    const center = this.civRallyPoint(civ);
    if (!center) return null;
    const near: Unit[] = [];
    const far: Unit[] = [];
    for (const u of this.units) {
      if (u.dead || u.civ !== civ.id || u.boat || u.army != null) continue;
      const job = u.job ?? 0;
      if (job !== 2 && job !== 3) continue;
      (Math.hypot(u.x - center.x, u.y - center.y) <= 24 ? near : far).push(u);
    }
    if (near.length < GameEngine.ARMY_MIN) {
      far.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
      near.push(...far.slice(0, GameEngine.ARMY_MAX - near.length));
    }
    // —— 战时紧急征召（levy）：兵源不足时征募集结点附近的平民执戈 ——
    if (near.length < GameEngine.ARMY_MIN && this.civAtWar(civ.id)) {
      const levy: Unit[] = [];
      for (const u of this.units) {
        if (levy.length >= GameEngine.ARMY_MIN + 4) break;
        if (u.dead || u.civ !== civ.id || u.boat || u.army != null) continue;
        const job = u.job ?? 0;
        if (job !== 0) continue;
        if (Math.hypot(u.x - center.x, u.y - center.y) > 20) continue;
        levy.push(u);
      }
      for (const u of levy) this.setJob(u, 2);
      if (levy.length > 0) {
        this.addEvent('army', `「${civ.name}」敲响征兵鼓——${levy.length} 名平民放下锄头拿起长矛`, { colorHex: civ.colorHex, x: center.x, y: center.y });
      }
      near.push(...levy);
    }
    const pool = near;
    if (pool.length < GameEngine.ARMY_MIN) return null;
    // 就近入列（集结快），上限 ARMY_MAX
    pool.sort((a, b) => Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y));
    const members = pool.slice(0, GameEngine.ARMY_MAX);
    // 指挥官 = 击杀最多者（宿将执旗）
    let leader = members[0];
    for (const m of members) if (m.kills > leader.kills) leader = m;
    const seq = (this.armyNameSeq.get(civ.id) ?? 0) + 1;
    this.armyNameSeq.set(civ.id, seq);
    const archerRatio = members.filter((m) => (m.job ?? 0) === 3).length / members.length;
    const name = armyNameByJobs(this.rng, seq, archerRatio);
    // 军旗落点 = 兵员质心（就近可站立地块）
    let sx = 0;
    let sy = 0;
    for (const m of members) { sx += m.x; sy += m.y; }
    const flag = this.nearestStandable(Math.round(sx / members.length), Math.round(sy / members.length));
    const a: Army = {
      id: this.armySeq++, civ: civ.id, name,
      members: members.map((m) => m.id), leaderId: leader.id,
      x: flag.x, y: flag.y, tx: flag.x, ty: flag.y,
      state: 'rally', formedTick: this.tickCount, size0: members.length,
      morale: Math.min(95, 58 + leader.kills * 3),
      targetCiv: enemyId, rot: this.rng() * Math.PI * 2,
      kills: 0, losses: 0, evalTick: this.tickCount,
    };
    for (const m of members) m.army = a.id;
    // —— 组建军费（Task 34 经济闭环）：征召集结耗资；国库不足时仓促成军士气受挫（粮草不济）——
    {
      const musterCost = 6 + Math.round(members.length * 0.35);
      if ((civ.gold ?? 0) >= musterCost) {
        civ.gold = (civ.gold ?? 0) - musterCost;
      } else {
        civ.gold = 0;
        a.morale = Math.max(20, a.morale - 12);
        this.addEvent('army', `「${civ.name}」国库告罄，${name}仓促成军——粮草不济，士气低落`, { colorHex: civ.colorHex, x: a.x, y: a.y });
      }
    }
    this.armies.push(a);
    this.addEvent('army', `「${civ.name}」集结了${name}（${members.length} 人，宿将 ${leader.name} 执旗）`, { colorHex: civ.colorHex, x: a.x, y: a.y });
    this.toast(`「${civ.name}」的${name}集结完毕`, 'war');
    return a;
  }

  /** 军团集结点：王都优先，回退国民质心 */
  civRallyPoint(civ: Civ): { x: number; y: number } | null {
    if (civ.capital >= 0) return { x: this.tileX(civ.capital), y: this.tileY(civ.capital) };
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const u of this.units) {
      if (u.dead || u.civ !== civ.id) continue;
      sx += u.x; sy += u.y; n++;
    }
    if (n === 0) return null;
    return { x: sx / n, y: sy / n };
  }

  /** 交战国中距本国最近且尚有建筑的敌国 */
  pickWarEnemy(civId: number): Civ | null {
    const me = this.civs[civId];
    if (!me?.alive) return null;
    const px = me.capital >= 0 ? this.tileX(me.capital) : W / 2;
    const py = me.capital >= 0 ? this.tileY(me.capital) : H / 2;
    let best: Civ | null = null;
    let bestD = Infinity;
    const byCiv = this.civBuildCounts;
    for (const o of this.civs) {
      if (!o.alive || o.id === civId || !this.atWar(civId, o.id)) continue;
      const cnt = byCiv.get(o.id);
      if (!cnt) continue;
      let hasB = false;
      for (let k = 1; k < cnt.length; k++) if (cnt[k] > 0) { hasB = true; break; }
      if (!hasB) continue;
      const d = o.capital >= 0 ? Math.hypot(this.tileX(o.capital) - px, this.tileY(o.capital) - py) : 100;
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  /** 最近可站立地块（军旗落点/登陆用） */
  nearestStandable(x: number, y: number): { x: number; y: number } {
    for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // 只扫环
          const xx = Math.max(0, Math.min(W - 1, x + dx));
          const yy = Math.max(0, Math.min(H - 1, y + dy));
          if (walkable(this.terrain[idx(xx, yy)])) return { x: xx, y: yy };
        }
      }
    }
    return { x, y };
  }

  /** 编队阵位：行军=纵队（3 列拖后），其余=环形方阵（指挥官贴旗） */
  formationPos(a: Army, k: number): [number, number] {
    const n = a.members.length;
    if (a.state === 'march' || a.state === 'retreat') {
      const dirAng = Math.atan2(a.ty - a.y, a.tx - a.x);
      const per = 3;
      const row = Math.floor(k / per);
      const col = (k % per) - 1;
      const back = 0.9 + row * 1.15;
      const px = -Math.cos(dirAng) * back + Math.cos(dirAng + Math.PI / 2) * col * 1.0;
      const py = -Math.sin(dirAng) * back + Math.sin(dirAng + Math.PI / 2) * col * 1.0;
      return [Math.max(0.5, Math.min(W - 0.5, a.x + px)), Math.max(0.5, Math.min(H - 0.5, a.y + py))];
    }
    const ang = (k / Math.max(1, n)) * Math.PI * 2 + a.rot;
    const r = k === 0 ? 0.7 : 1.5 + (k % 3) * 0.55;
    return [Math.max(0.5, Math.min(W - 0.5, a.x + Math.cos(ang) * r)), Math.max(0.5, Math.min(H - 0.5, a.y + Math.sin(ang) * r))];
  }

  /** 军团状态机主循环（每 5 tick） */
  armyTick() {
    WBB.touchMeta(); // Stage 3：军团状态机写 army/boat 等 meta 列收口（保守超集）
    // 战时文明周期性组建军团
    if (this.tickCount % 60 === 0) {
      for (const civ of this.civs) {
        if (!civ.alive || !this.civAtWar(civ.id)) continue;
        if (this.rng() < 0.5) this.tryFormArmy(civ);
      }
    }
    for (let i = this.armies.length - 1; i >= 0; i--) {
      const a = this.armies[i];
      const civ = this.civs[a.civ];
      if (!civ?.alive) { this.disbandArmy(a, true); continue; }
      // —— 成员清点：死亡/离散者出列，士气折损 ——
      let leaderDead = false;
      for (let k = a.members.length - 1; k >= 0; k--) {
        const u = this.unitById.get(a.members[k]);
        if (!u || u.dead || u.civ !== a.civ || u.army !== a.id) {
          const uid = a.members[k];
          a.members.splice(k, 1);
          a.losses++;
          a.morale -= 4;
          if (uid === a.leaderId) leaderDead = true;
        }
      }
      if (leaderDead) this.electLeader(a);
      // 残部不足 → 解散
      if (a.members.length < 4) { this.disbandArmy(a, true); continue; }
      // —— 补给线：深入敌境的军团士气缓降（机械化军团自持补给，半径更大）——
      if (a.state !== 'retreat' && this.tickCount % 25 === 0) {
        const mech = this.techModsOf(a.civ).mech > 0;
        const limit = mech ? 26 : 15;
        let near = Infinity;
        for (const b of this.buildings) {
          if (b.civ !== a.civ) continue;
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          if (d < near) near = d;
          if (near < limit) break;
        }
        if (near > limit) {
          a.morale -= 1.2;
          if (!a.supplyWarned && a.morale < 72) {
            a.supplyWarned = true;
            this.addEvent('army', `${a.name} 深入敌境，补给线吃紧——士卒疲惫，士气日渐消磨`, { colorHex: this.civs[a.civ]?.colorHex, x: a.x, y: a.y });
          }
        } else if (a.supplyWarned) a.supplyWarned = false;
      }
      // —— 溃退追击（Task 36）：溃退敌军进入我军锋线 6 格 → 追亡逐北，殿后者持续折损 ——
      //    （会战胜利从「目送溃军远去」变成歼灭追击 —— 战争更快分出胜负，不再无限僵持）
      if (a.state !== 'retreat' && this.tickCount % 10 === 0) {
        for (const o of this.armies) {
          if (o === a || o.civ === a.civ || o.state !== 'retreat' || !this.atWar(a.civ, o.civ)) continue;
          if (Math.hypot(o.x - a.x, o.y - a.y) > 6) continue;
          if (this.rng() < 0.4 && o.members.length > 0) {
            const victim = this.unitById.get(o.members[(this.rng() * o.members.length) | 0]);
            if (victim && !victim.dead) {
              victim.hp = 0;
              victim.dead = true;
              this.addCorpse(victim.x, victim.y, false, false);
              this.wwCountKill(victim);
              o.losses++;
              o.morale = Math.max(5, o.morale - 3);
              const wd = this.warData.get(pairKey(a.civ, o.civ));
              if (wd) {
                if (a.civ === wd.a) { wd.casB++; wd.scoreA += 0.5; } else { wd.casA++; wd.scoreB += 0.5; }
              }
              if (this.rng() < 0.12) this.addEvent('clash', `${a.name} 追亡逐北，溃军沿途折损（${o.name} 尚存 ${o.members.length} 人）`, { colorHex: civ.colorHex, x: o.x, y: o.y });
            }
          }
        }
      }
      // 士气崩塌 → 溃退（会战大失败的收场；方阵战术科技让军队更顽强）
      const moraleFloor = 35 + this.techModsOf(a.civ).morale;
      if (a.morale < moraleFloor && a.state !== 'retreat') { this.routArmy(a); continue; }
      // 战争结束/敌国已灭 → 凯旋归国
      const enemy = this.civs[a.targetCiv];
      if (a.state !== 'retreat' && (!enemy?.alive || !this.atWar(a.civ, a.targetCiv))) {
        this.routArmy(a, true);
        continue;
      }
      switch (a.state) {
        case 'rally': this.armyRally(a, civ); break;
        case 'march': this.armyMarch(a, civ); break;
        case 'battle': this.armyBattle(a, civ); break;
        case 'siege': this.armySiege(a, civ); break;
        case 'retreat': this.armyRetreat(a, civ); break;
      }
      // 非战斗状态缓慢回士气（整编/归途；战术/军团科技加速重整）
      if (a.state === 'rally' || a.state === 'retreat') a.morale = Math.min(100, a.morale + 0.4 + this.techModsOf(a.civ).morale * 0.015);
      // 伤亡过半 → 士气持续下滑（惨重代价）
      if (a.members.length < a.size0 * 0.5 && (a.state === 'march' || a.state === 'siege')) a.morale -= 0.4;
    }
  }

  /** 选举新指挥官（旧将阵亡） */
  electLeader(a: Army) {
    let leader: Unit | null = null;
    for (const id of a.members) {
      const u = this.unitById.get(id);
      if (u && (!leader || u.kills > leader.kills)) leader = u;
    }
    a.leaderId = leader ? leader.id : -1;
    a.morale = Math.max(20, a.morale - 8); // 主将阵亡军心动摇
    if (leader) this.addEvent('army', `${a.name} 主将阵亡，${leader.name} 接过军旗`, { colorHex: this.civs[a.civ]?.colorHex, x: a.x, y: a.y });
  }

  armyRally(a: Army, _civ: Civ) {
    let gathered = 0;
    for (let k = 0; k < a.members.length; k++) {
      const u = this.unitById.get(a.members[k]);
      if (!u) continue;
      const [fx, fy] = this.formationPos(a, k);
      u.tx = fx; u.ty = fy;
      if (Math.hypot(u.x - a.x, u.y - a.y) < 3.5) gathered++;
    }
    const ratio = gathered / a.members.length;
    const waited = this.tickCount - a.formedTick;
    if ((ratio >= 0.8 && waited > 40) || waited > 300) {
      const tgt = this.armyMarchTarget(a);
      if (tgt) {
        a.tx = tgt.x; a.ty = tgt.y;
        a.state = 'march';
        this.addEvent('army', `${a.name} 誓师出征（${a.members.length} 人）`, { colorHex: this.civs[a.civ]?.colorHex, x: a.x, y: a.y });
      }
    }
  }

  /** 行军目标：敌国王都优先，回退最近敌建筑 */
  armyMarchTarget(a: Army): { x: number; y: number } | null {
    const e = this.civs[a.targetCiv];
    if (!e?.alive) return null;
    if (e.capital >= 0) return { x: this.tileX(e.capital), y: this.tileY(e.capital) };
    let best: Building | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.civ !== a.targetCiv) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) return { x: best.x, y: best.y };
    // —— 终极回退：敌境已无建筑 → 敌国剩余领土质心（军团压境清剿残土，战线自行推进；修复 rally 卡死）——
    if (e.tiles.length > 0) {
      let sx = 0, sy = 0;
      for (const t of e.tiles) { sx += t % W; sy += (t / W) | 0; }
      return { x: sx / e.tiles.length, y: sy / e.tiles.length };
    }
    return null;
  }

  armyMarch(a: Army, civ: Civ) {
    WBB.touchMeta(); // Stage 3：行军涉水登船 boat 列收口
    // —— 林间伏击：行军于森林的军团进入潜伏（接战首击士气加成）——
    const hereTile = this.terrain[idx(Math.floor(a.x), Math.floor(a.y))];
    a.ambush = hereTile === T.FOREST;
    // —— 合击战术（Task 35）：附近友军已与敌接战 → 就近压上夹击（军团协同，不再各自为战）——
    for (const o of this.armies) {
      if (o.civ !== a.civ || o.id === a.id || o.state !== 'battle' || o.clashWith == null) continue;
      const f2 = this.armies.find((x) => x.id === o.clashWith);
      if (!f2 || !this.atWar(a.civ, f2.civ)) continue;
      if (Math.hypot(f2.x - a.x, f2.y - a.y) < 11) {
        this.declareClash(a, f2, civ);
        return;
      }
    }
    // —— 溃退追击（Task 36）：优先咬住 10 格内的溃退敌军 —— 军旗直指溃军背影 ——
    //    （追击不接战：溃军无建制，declareClash 溃退守卫会拒绝接战；歼灭由 armyTick 追击屠戮结算）
    let chasing = false;
    {
      let routedFoe: Army | null = null;
      let routedD = 10;
      for (const o of this.armies) {
        if (o.civ === a.civ || o.state !== 'retreat' || !this.atWar(a.civ, o.civ)) continue;
        const dd = Math.hypot(o.x - a.x, o.y - a.y);
        if (dd < routedD) { routedD = dd; routedFoe = o; }
      }
      if (routedFoe && !a.naval) {
        chasing = true;
        a.tx = routedFoe.x;
        a.ty = routedFoe.y;
      }
    }
    // —— 敌军团逼近 → 会战（战术 AI 军团先评估胜算：深劣势则战术转移，不打无谓消耗战）——
    const foe = this.nearestEnemyArmy(a);
    if (foe && foe.state !== 'retreat' && Math.hypot(foe.x - a.x, foe.y - a.y) < 8) {
      const ai = this.techModsOf(a.civ).ai > 0;
      if (ai && foe.members.length > a.members.length * 1.8 && a.morale < 60) {
        this.routArmy(a, false, true); // 战术智能：避其锋芒，后撤再战
        return;
      }
      this.declareClash(a, foe, civ);
      return;
    }
    const d = Math.hypot(a.tx - a.x, a.ty - a.y);
    // —— 舰队抵达敌岸 → 登陆 ——
    if (a.naval) {
      const onLand = walkable(this.terrain[idx(Math.floor(a.x), Math.floor(a.y))]);
      if (onLand && d < 8) { this.armyDisembark(a); a.state = 'siege'; a.evalTick = this.tickCount; return; }
    } else if (d < 3 && !chasing) {
      a.state = 'siege'; a.evalTick = this.tickCount;
      return;
    }
    // —— 行军渗透：途经敌境留下占领脚印（弱功率；战线随军推进）——
    if (!a.naval && this.tickCount - (a.marchPushTick ?? 0) > 25) {
      a.marchPushTick = this.tickCount;
      this.frontPush(a, 2, 3);
    }

    // —— 军旗推进（步频 × 士气加成 × 机械化履带加速 × 追击提速；8 向贪心绕障）——
    const step = GameEngine.ARMY_SPEED * (0.75 + a.morale / 200) * (this.techModsOf(a.civ).mech > 0 ? 1.4 : 1) * (chasing ? 1.5 : 1);
    if (a.naval) {
      a.x = Math.max(0.5, Math.min(W - 0.5, a.x + ((a.tx - a.x) / d) * step));
      a.y = Math.max(0.5, Math.min(H - 0.5, a.y + ((a.ty - a.y) / d) * step));
    } else {
      const base = Math.atan2(a.ty - a.y, a.tx - a.x);
      let moved = false;
      for (const off of [0, 0.45, -0.45, 0.95, -0.95, 1.7, -1.7, Math.PI]) {
        const ang = base + off;
        const nx = a.x + Math.cos(ang) * step;
        const ny = a.y + Math.sin(ang) * step;
        if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
        if (!walkable(this.terrain[idx(Math.floor(nx), Math.floor(ny))])) continue;
        a.x = nx; a.y = ny;
        moved = true;
        break;
      }
      if (!moved) {
        // 四周全堵：直行前方是水且跨海 → 舰队渡海；否则原地等待（下轮重试）
        const ax = Math.floor(a.x + Math.cos(base) * 1.5);
        const ay = Math.floor(a.y + Math.sin(base) * 1.5);
        if (ax >= 0 && ay >= 0 && ax < W && ay < H && isWater(this.terrain[idx(ax, ay)]) && this.crossesWater(a.x, a.y, a.tx, a.ty)) {
          this.armyEmbark(a);
          return;
        }
      }
    }
    // —— 成员跟随编队（行军纵队阵位）——
    for (let k = 0; k < a.members.length; k++) {
      const u = this.unitById.get(a.members[k]);
      if (!u) continue;
      const [fx, fy] = this.formationPos(a, k);
      u.tx = fx; u.ty = fy;
      if (a.naval) {
        const inWater = isWater(this.terrain[idx(Math.floor(u.x), Math.floor(u.y))]);
        if (!u.boat && inWater) { u.boat = 1; u.boatTTL = 1600; }
        if (u.boat) {
          u.boatTTL = Math.max(u.boatTTL ?? 0, 200); // 舰队补给：不海难
          // 落后的旱鸭子跳上旗舰（距旗 < 3 直接登船）
          if (!inWater && Math.hypot(u.x - a.x, u.y - a.y) < 3) {
            const w = this.findWaterNear(a.x, a.y, 3);
            if (w) { u.boat = 1; u.boatTTL = 1600; u.x = w.x; u.y = w.y; u.lx = w.x; u.ly = w.y; }
          }
        }
      } else if (u.boat && Math.hypot(u.x - a.x, u.y - a.y) < 4) {
        // 已转陆路但仍有成员漂着 → 靠岸归队
        u.boat = 0; u.boatTTL = 0;
        const s = this.nearestStandable(Math.floor(u.x), Math.floor(u.y));
        u.x = s.x; u.y = s.y; u.lx = s.x; u.ly = s.y;
      }
    }
  }

  armyBattle(a: Army, civ: Civ) {
    const foe = a.clashWith != null ? this.armies.find((x) => x.id === a.clashWith) : null;
    // —— 会战结束：对手溃散/解散/脱离 ——
    if (!foe || !this.armies.includes(foe) || foe.state !== 'battle' || Math.hypot(foe.x - a.x, foe.y - a.y) > 12) {
      const won = foe ? (foe.state === 'retreat' || a.members.length >= foe.members.length) : true;
      a.morale = Math.min(100, a.morale + (won ? 12 : 2));
      const wd = foe ? this.warData.get(pairKey(a.civ, foe.civ)) : null;
      if (wd && won) {
        if (a.civ === wd.a) wd.scoreA += 10; else wd.scoreB += 10;
      }
      if (this.tickCount - (a.battleSince ?? this.tickCount) > 50) {
        this.addEvent('clash', `${a.name} ${won ? `击溃了敌军（斩获 ${a.kills}）` : '且战且退'}，会战落幕`, { colorHex: civ.colorHex, x: a.x, y: a.y });
      }
      a.clashWith = undefined;
      a.battleSince = undefined;
      if (won) a.state = 'march';
      else this.routArmy(a); // 败方溃退（guard 去重）
      return;
    }
    const tmA = this.techModsOf(a.civ);
    const ai = tmA.ai > 0;
    const mech = tmA.mech > 0;
    // —— 伤亡崩溃：阵亡过半 → 战线崩溃全线溃退（会战的决胜时刻，不再无限对耗）——
    const bs0 = a.battleSize0 ?? a.members.length;
    if (a.members.length <= Math.max(3, Math.floor(bs0 * 0.5))) {
      this.addEvent('clash', `${a.name} 伤亡过半，战线崩溃——残部溃散`, { colorHex: civ.colorHex, x: a.x, y: a.y });
      const wd0 = this.warData.get(pairKey(a.civ, foe.civ));
      if (wd0) {
        if (foe.civ === wd0.a) wd0.scoreA += 8;
        else wd0.scoreB += 8; // 歼灭战果：会战胜利直接折算战争分数
      }
      this.routArmy(a);
      return;
    }
    // —— 机械化军团：机炮周期扫射敌军团阵地（超视距火力压制）——
    if (mech && this.tickCount % 20 === 0) {
      let hits = 0;
      for (const id of foe.members) {
        const u = this.unitById.get(id);
        if (!u || u.dead) continue;
        if (Math.hypot(u.x - foe.x, u.y - foe.y) < 3.5) {
          u.hp -= 16 + this.rng() * 10;
          u.hurt = 20;
          hits++;
          if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
        }
      }
      if (hits > 0) {
        this.fx('bullet', foe.x + this.rng() * 2 - 1, foe.y + this.rng() * 2 - 1, 5, { x0: a.x, y0: a.y, src: a.civ, r: 0, dmg: 0 });
      }
    }
    // —— 战线阵列（Task 35）：近战前排压向敌旗 2.4 格列横队，弓手后排距敌 5.5 格展开 ——
    // （沿战线垂直方向排开，各就各位——不再一窝蜂乱冲锋的鸟合之众）
    const fAng = Math.atan2(foe.y - a.y, foe.x - a.x);
    const ppx = -Math.sin(fAng);
    const ppy = Math.cos(fAng);
    const foes = foe.members.map((id) => this.unitById.get(id)).filter((u): u is Unit => !!u && !u.dead);
    let mCount = 0;
    let rCount = 0;
    const rangedFlags: boolean[] = [];
    for (const id of a.members) {
      const u = this.unitById.get(id);
      const r = u ? this.isRangedMember(u) : false;
      rangedFlags.push(r);
      if (r) rCount++;
      else mCount++;
    }
    let mi = 0;
    let ri = 0;
    for (let k = 0; k < a.members.length; k++) {
      const u = this.unitById.get(a.members[k]);
      if (!u) continue;
      if (rangedFlags[k]) {
        // 远程后排：本旗后方 2.6 格列队（避开近战线，持续输出）
        const off = (ri - (rCount - 1) / 2) * 1.1;
        ri++;
        u.tx = Math.max(0.5, Math.min(W - 0.5, a.x - Math.cos(fAng) * 2.6 + ppx * off));
        u.ty = Math.max(0.5, Math.min(H - 0.5, a.y - Math.sin(fAng) * 2.6 + ppy * off));
      } else {
        // 近战前排：压向敌旗 2.4 格接触线（横队展开）
        const off = (mi - (mCount - 1) / 2) * 1.05;
        mi++;
        u.tx = Math.max(0.5, Math.min(W - 0.5, foe.x - Math.cos(fAng) * 2.4 + ppx * off));
        u.ty = Math.max(0.5, Math.min(H - 0.5, foe.y - Math.sin(fAng) * 2.4 + ppy * off));
      }
    }
    // —— 齐射（Task 35）：后排按口令集火敌阵（弹道预测 + 同时开火 —— 组织化杀伤力）——
    if (foes.length > 0 && this.tickCount % 15 === 0) {
      let volleyN = 0;
      for (let k = 0; k < a.members.length; k++) {
        const u = this.unitById.get(a.members[k]);
        if (!u || u.dead || u.cd > 0 || !rangedFlags[k]) continue;
        const gun = u.wep === 'musket' || u.wep === 'rifle';
        const beam = u.wep === 'laser_rifle';
        const t = foes[(this.rng() * foes.length) | 0];
        const aim = this.leadAim(t, beam ? 8 : gun ? 5 : 12);
        const mul = RACES[u.race].isCiv && a.civ >= 0 ? tmA.archer : 1;
        if (beam) this.castBeam(u, aim.x, aim.y, u.dmg * 0.75 * mul);
        else if (gun) this.castBullet(u, aim.x, aim.y, u.dmg * mul);
        else this.castArrow(u, aim.x, aim.y, u.dmg * mul);
        u.cd = beam ? 12 : gun ? 15 : 18;
        u.atk = 10;
        volleyN++;
      }
      if (volleyN >= 4) {
        // —— 齐射震慑（Task 36）：箭如飞蝗不只是伤害 —— 敌军士气加速崩落（士气地板与 50% 硬崩溃两道保险收敛）——
        foe.morale = Math.max(5, foe.morale - 1.5);
        if (this.tickCount - this.lastVolleyEventTick > 200 && this.rng() < 0.25) {
          this.lastVolleyEventTick = this.tickCount;
          this.addEvent('clash', `${a.name} 一声令下，${volleyN} 名弓手齐射——箭如飞蝗`, { colorHex: civ.colorHex, x: a.x, y: a.y });
        }
      }
    }
    // —— 会战烈度：兵力对比消耗士气 + 包围/增援/战术撤退 ——
    if (this.tickCount - a.evalTick > 25) {
      a.evalTick = this.tickCount;
      const myPow = a.members.length * (1 + a.morale / 100);
      const foePow = foe.members.length * (1 + foe.morale / 100);
      a.morale += myPow > foePow ? 2 : -4;
      // —— 伤亡-士气耦合（Task 36）：阵亡越众士气崩得越快 —— 常规军触士气地板、精锐触 50% 硬崩溃，两道保险同步收敛（Task 35 遗留 #1 治理）——
      const bs0c = a.battleSize0 ?? a.members.length;
      const frac = a.members.length / Math.max(1, bs0c);
      if (frac < 0.8) a.morale -= (0.8 - frac) * 4;
      // —— 包围判定：≥2 支己方军团压向敌旗 → 被围方士气加速崩落 ——
      let surrounders = 0;
      for (const o of this.armies) {
        if (o.civ !== a.civ || o.state === 'retreat' || o.id === a.id) continue;
        if (Math.hypot(o.x - foe.x, o.y - foe.y) < 14) surrounders++;
      }
      if (surrounders >= 1 && Math.hypot(a.x - foe.x, a.y - foe.y) < 8) {
        foe.morale = Math.max(5, foe.morale - 3); // 身陷重围：士气持续崩落
        a.morale = Math.min(100, a.morale + 1);
        if (this.rng() < 0.06) {
          this.addEvent('clash', `${a.name}${surrounders >= 2 ? ` 与 ${surrounders} 支友军` : ''}完成合围——${foe.name} 身陷重围，军心动摇`, { colorHex: civ.colorHex, x: foe.x, y: foe.y });
        }
      }
      // —— 增援调度：劣势方呼叫本国未接战军团驰援（战术 AI 主动，普通军团小概率响应）——
      if (myPow < foePow * 0.75 && (ai || this.rng() < 0.25)) {
        let best: Army | null = null;
        let bestD = 26;
        for (const o of this.armies) {
          if (o.civ !== a.civ || o.id === a.id) continue;
          if (o.state === 'battle' || o.state === 'retreat') continue;
          if (o.targetCiv !== foe.civ && this.techModsOf(o.civ).ai <= 0) continue; // 非 AI 军团只驰援同战线
          const dd = Math.hypot(o.x - a.x, o.y - a.y);
          if (dd < bestD) { bestD = dd; best = o; }
        }
        if (best) {
          best.targetCiv = foe.civ;
          best.tx = a.x;
          best.ty = a.y;
          if (best.state === 'rally') best.state = 'march';
          a.reinforced = (a.reinforced ?? 0) + 1;
          if (this.tickCount - this.lastReinforceEventTick > 240) {
            this.lastReinforceEventTick = this.tickCount;
            this.addEvent('army', `${best.name} 奉令驰援 ${a.name}——合击会战之敌`, { colorHex: civ.colorHex, x: a.x, y: a.y });
          }
        }
      }
      // —— 战术 AI：深劣势且军心不稳 → 战术撤退（保存建制，而非死战到崩溃）——
      if (ai && myPow < foePow * 0.55 && a.morale < 55) {
        this.routArmy(a, false, true);
        return;
      }
      // 惨烈消耗 → 战争疲乏（加速终战）
      const wd = this.warData.get(pairKey(a.civ, foe.civ));
      if (wd) {
        if (a.civ === wd.a) { wd.exA += 1; wd.exB += 1; } else { wd.exA += 1; wd.exB += 1; }
      }
    }
  }

  armySiege(a: Army, civ: Civ) {
    if (this.tickCount - a.evalTick <= 30) {
      // 敌援军来袭 → 迎战
      const foe = this.nearestEnemyArmy(a);
      if (foe && Math.hypot(foe.x - a.x, foe.y - a.y) < 7) { this.declareClash(a, foe, civ); }
      return;
    }
    a.evalTick = this.tickCount;
    // 围城目标：旗周 12 格内最近敌建筑
    const tgt = this.nearestEnemyBuildingOf(a);
    if (tgt) {
      // —— 机械化军团：放出机甲突击拆毁敌建筑（大型双足机甲推进 + 机炮扫射）——
      if (this.techModsOf(a.civ).mech > 0 && this.rng() < 0.35) {
        this.launchMech(civ, a.x, a.y, tgt.x + 0.5, tgt.y + 0.5);
      }
      for (const id of a.members) {
        const u = this.unitById.get(id);
        if (!u) continue;
        u.tx = tgt.x + this.rng() * 3 - 1.5;
        u.ty = tgt.y + this.rng() * 3 - 1.5;
      }
      const dd = Math.hypot(tgt.x - a.x, tgt.y - a.y);
      if (dd > 5) { a.tx = tgt.x; a.ty = tgt.y; a.state = 'march'; return; }
      // 军旗压近
      const step = GameEngine.ARMY_SPEED * 1.5;
      const nx = a.x + ((tgt.x - a.x) / dd) * step;
      const ny = a.y + ((tgt.y - a.y) / dd) * step;
      if (walkable(this.terrain[idx(Math.floor(nx), Math.floor(ny))]) || a.naval) { a.x = nx; a.y = ny; }
      // 围城本身也在蚕食周边敌土（战线语义：压境即渗透）
      this.frontPush(a, 2, 4);
      return;
    }
    // —— 动态战线：敌境纵深渗透（战时虚国界渐进推进，替代旧的瞬时易帜）——
    const pushed = this.frontPush(a, 3, a.state === 'siege' ? 6 : 8);
    if (pushed > 0) {
      if (this.rng() < 0.2) {
        this.addEvent('occupy', `${a.name} 的战线向敌境推进（渗透 ${pushed} 格）`, { colorHex: civ.colorHex, x: a.x, y: a.y });
      }
      // 继续向敌国内陆推进
      const next = this.armyMarchTarget(a);
      if (next && Math.hypot(next.x - a.x, next.y - a.y) > 6) { a.tx = next.x; a.ty = next.y; a.state = 'march'; }
    } else {
      // 无可占领 → 转向下一个敌国（或凯旋）
      const next = this.pickWarEnemy(a.civ);
      if (next) {
        a.targetCiv = next.id;
        const t = this.armyMarchTarget(a);
        if (t) { a.tx = t.x; a.ty = t.y; a.state = 'march'; }
      } else {
        this.routArmy(a, true); // 凯旋归国
      }
    }
  }

  armyRetreat(a: Army, civ: Civ) {
    const home = this.civRallyPoint(civ);
    if (!home) { this.disbandArmy(a, true); return; }
    a.tx = home.x; a.ty = home.y;
    const d = Math.hypot(home.x - a.x, home.y - a.y);
    if (d < 3) {
      if (a.naval) this.armyDisembark(a); // 归航舰队靠岸
      this.disbandArmy(a, false);
      return;
    }
    const step = GameEngine.ARMY_SPEED * 1.3;
    if (a.naval) {
      // 舰队归航：直航；抵达本国海岸 → 登陆走陆路归营
      a.x = Math.max(0.5, Math.min(W - 0.5, a.x + ((home.x - a.x) / d) * step));
      a.y = Math.max(0.5, Math.min(H - 0.5, a.y + ((home.y - a.y) / d) * step));
      if (walkable(this.terrain[idx(Math.floor(a.x), Math.floor(a.y))]) && d < 10) this.armyDisembark(a);
    } else {
      // 溃军归途：8 向贪心绕障（可泅渡涉水）
      const base = Math.atan2(home.y - a.y, home.x - a.x);
      for (const off of [0, 0.45, -0.45, 0.95, -0.95, 1.7, -1.7, Math.PI]) {
        const ang = base + off;
        const nx = a.x + Math.cos(ang) * step;
        const ny = a.y + Math.sin(ang) * step;
        if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
        const t = this.terrain[idx(Math.floor(nx), Math.floor(ny))];
        if (!walkable(t) && !isWater(t)) continue;
        a.x = nx; a.y = ny;
        break;
      }
    }
    for (let k = 0; k < a.members.length; k++) {
      const u = this.unitById.get(a.members[k]);
      if (!u) continue;
      const [fx, fy] = this.formationPos(a, k);
      u.tx = fx; u.ty = fy;
    }
  }

  /** 宣布会战（两军团相互标记，纪事播报 + 战争档案会战计数） */
  declareClash(a: Army, foe: Army, civ: Civ) {
    // —— 溃退之军不接战（Task 35 修复）：追击交给单位层战斗——
    // （否则溃军被强拉回 battle 态后立即再次触底溃退 → 「全军溃退」事件连环刷屏）
    if (a.state === 'retreat' || foe.state === 'retreat') return;
    // —— 林间伏击首击：伏击方先声夺人（士气 +10，一次性）——
    if (a.ambush) { a.morale = Math.min(100, a.morale + 10); a.ambush = false; }
    if (foe.ambush) { foe.morale = Math.min(100, foe.morale + 10); foe.ambush = false; }
    a.state = 'battle'; a.battleSince = this.tickCount; a.clashWith = foe.id;
    foe.state = 'battle'; foe.battleSince = this.tickCount; foe.clashWith = a.id;
    a.battleSize0 = a.members.length; // 会战开局兵力基准（伤亡崩溃判定）
    foe.battleSize0 = foe.members.length;
    const wd = this.warData.get(pairKey(a.civ, foe.civ));
    if (wd) wd.battles++;
    if (this.tickCount - this.lastClashEventTick > 180) {
      this.lastClashEventTick = this.tickCount;
      const field = battleFieldName(this.rng);
      this.addEvent('clash', `${a.name}（${this.civs[a.civ]?.name}）与 ${foe.name}（${this.civs[foe.civ]?.name}）于${field}爆发会战`, { colorHex: civ.colorHex, x: (a.x + foe.x) / 2, y: (a.y + foe.y) / 2 });
      this.shake = Math.max(this.shake, 4);
    }
  }

  /** 最近的敌军团 */
  nearestEnemyArmy(a: Army): Army | null {
    let best: Army | null = null;
    let bestD = Infinity;
    for (const o of this.armies) {
      if (o.civ === a.civ || !this.atWar(a.civ, o.civ)) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best;
  }

  /** 旗周 12 格内最近的敌国建筑（返回建筑对象或 null） */
  nearestEnemyBuildingOf(a: Army): Building | null {
    let best: Building | null = null;
    let bestD = 12;
    for (const b of this.buildings) {
      if (b.civ !== a.targetCiv && !this.atWar(a.civ, b.civ)) continue;
      if (b.civ === a.civ) continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  /** 直线跨水率 ≥ 45%（渡海判定） */
  crossesWater(x0: number, y0: number, x1: number, y1: number): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const d = Math.hypot(dx, dy);
    if (d < 4) return false;
    let water = 0;
    const samples = Math.max(1, Math.floor(d));
    for (let s = 1; s <= samples; s++) {
      const xx = Math.floor(x0 + (dx * s) / d);
      const yy = Math.floor(y0 + (dy * s) / d);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (isWater(this.terrain[idx(xx, yy)])) water++;
    }
    return water / samples >= 0.45;
  }

  /** 舰队渡海：军旗与成员转航海模式 */
  armyEmbark(a: Army) {
    WBB.touchMeta(); // Stage 3：舰队登船 boat 列收口
    a.naval = true;
    const w = this.findWaterNear(a.x, a.y, 3);
    if (w) { a.x = w.x; a.y = w.y; }
    let boarded = 0;
    for (const id of a.members) {
      const u = this.unitById.get(id);
      if (!u || u.boat) continue;
      if (Math.hypot(u.x - a.x, u.y - a.y) < 5) {
        const ww = this.findWaterNear(a.x, a.y, 4);
        if (ww) {
          u.boat = 1; u.boatTTL = 1600;
          u.x = ww.x + this.rng() - 0.5; u.y = ww.y + this.rng() - 0.5;
          u.lx = u.x; u.ly = u.y;
          boarded++;
        }
      }
      // 远处成员：走陆路奔向旗（到旗边自动登船）
    }
    if (boarded > 0 || a.members.length > 0) {
      this.addEvent('army', `${a.name} 登船渡海，远征敌国（舰队 ${Math.max(boarded, 1)} 艘）`, { colorHex: this.civs[a.civ]?.colorHex, x: a.x, y: a.y });
    }
  }

  /** 舰队登陆：全员弃船上岸 */
  armyDisembark(a: Army) {
    a.naval = false;
    const land = this.nearestStandable(Math.floor(a.x), Math.floor(a.y));
    a.x = land.x; a.y = land.y;
    let landed = 0;
    for (const id of a.members) {
      const u = this.unitById.get(id);
      if (!u) continue;
      if (u.boat || isWater(this.terrain[idx(Math.floor(u.x), Math.floor(u.y))])) {
        const s = this.nearestStandable(Math.floor(a.x) + (this.rng() * 6 | 0) - 3, Math.floor(a.y) + (this.rng() * 6 | 0) - 3);
        u.boat = 0; u.boatTTL = 0;
        u.x = s.x + 0.5; u.y = s.y + 0.5;
        u.lx = u.x; u.ly = u.y;
        landed++;
        this.fx('spawn', u.x, u.y, 20);
      }
    }
    a.morale = Math.min(100, a.morale + 5); // 成功登陆士气大振
    if (landed > 0) this.addEvent('army', `${a.name} 的远征军抢滩登陆（${landed} 人上岸）`, { colorHex: this.civs[a.civ]?.colorHex, x: a.x, y: a.y });
  }

  /** 溃退（triumph = 凯旋归国；重复调用去重——同一军团不重复播报） */
  routArmy(a: Army, triumph = false, tactical = false) {
    if (a.state === 'retreat') return; // 已在溃退途中：不重复触发事件/士气
    a.state = 'retreat';
    a.clashWith = undefined;
    a.battleSince = undefined;
    a.morale = triumph ? Math.min(100, a.morale + 10) : tactical ? Math.max(45, a.morale) : Math.max(30, a.morale);
    if (triumph) {
      this.addEvent('army', `${a.name} 大获全胜，凯旋归国（斩获 ${a.kills}，损失 ${a.losses}）`, { colorHex: this.civs[a.civ]?.colorHex, x: a.x, y: a.y });
    } else if (tactical) {
      // 战术撤退（战术 AI 驱动）：保存建制，择机再战
      this.addEvent('army', `${a.name} 审时度势，战术转移后撤——保存建制，择机再战`, { colorHex: this.civs[a.civ]?.colorHex, x: a.x, y: a.y });
    } else {
      this.addEvent('rout', `${a.name} 全军溃退！（尚存 ${a.members.length} 人）`, { colorHex: this.civs[a.civ]?.colorHex, x: a.x, y: a.y });
      this.shake = Math.max(this.shake, 3);
      // —— 恐慌蔓延：溃退传染周遭友军军心 ——
      for (const o of this.armies) {
        if (o === a || o.civ !== a.civ || o.state === 'retreat') continue;
        if (Math.hypot(o.x - a.x, o.y - a.y) < 10) {
          o.morale = Math.max(10, o.morale - 12);
          if (this.rng() < 0.25) this.addEvent('rout', `${a.name} 的溃败动摇了 ${o.name} 的军心`, { colorHex: this.civs[a.civ]?.colorHex, x: o.x, y: o.y });
        }
      }
    }
  }

  /** 解散军团（quiet = 残部/国灭静默解散；false = 归营总结纪事） */
  disbandArmy(a: Army, quiet: boolean) {
    WBB.touchMeta(); // Stage 3：解散 army/boat 列收口
    const civ = this.civs[a.civ];
    for (const id of a.members) {
      const u = this.unitById.get(id);
      if (u && u.army === a.id) {
        u.army = undefined;
        u.boat = 0; u.boatTTL = 0;
      }
    }
    const ix = this.armies.indexOf(a);
    if (ix >= 0) this.armies.splice(ix, 1);
    if (civ) civ.armyCd = this.tickCount + GameEngine.ARMY_CD;
    if (!quiet && civ) {
      const msg = a.tactical
        ? `${a.name} 战术后撤归营整补（斩获 ${a.kills}，损失 ${a.losses}）——军旗未倒，随时再战`
        : `${a.name} 解散归田（战役斩获 ${a.kills}，损失 ${a.losses}）`;
      a.tactical = false;
      this.addEvent('army', msg, { colorHex: civ.colorHex, x: a.x, y: a.y });
    }
    // 从其它军团的会战引用中摘除
    for (const o of this.armies) if (o.clashWith === a.id) { o.clashWith = undefined; if (o.state === 'battle') o.state = 'march'; }
  }

  // ================== 战争理由体系（Casus Belli）：战争必须有名有实 ==================
  /** 理由烈度 → 宣战时关系跌幅 */
  static readonly CASUS_LEVEL: Record<CasusKind, number> = {
    border: -45, conquest: -70, plunder: -55, revenge: -65, rebel: -80, annex: -90, unify: -85, holy: -90, alliance: -50,
  };

  /** 大战自动停战时长（tick）：战力崩溃/神谕停战后休整 15 年，到期战端重燃 */
  static readonly WW_TRUCE_TICKS = 600;

  /** 反物质打击全局冷却（tick）：两次湮灭至少间隔 30 年 */
  static readonly WW_ANTI_CD = 1200;

  /** 终极世界大战空白状态（新世界/未打响/读档缺省共用） */
  static IDLE_WORLD_WAR(): WorldWarState {
    return { phase: 'idle', startTick: 0, startYear: 0, endTick: 0, belligerents: [], pop0: {}, kills: 0, fallen: [], truces: 0, nukes: 0, lasers: 0, drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 0, winner: null, endText: '' };
  }

  /** 巨怪种族集（战利品掉落判定：倒下时概率掉宝） */
  static readonly MONSTER_LOOT = new Set<number>([R.DRAGON, R.KRAKEN, R.SANDWORM, R.BASILISK, R.TROLL, R.OGRE, R.WHITEWALKER, R.VAMPIRE, R.DEMON]);

  /** 自然引燃上次判定的 tick（独立计时器：worldWarTick 每 30 tick 一跳，若用 %400 会与 30 的公倍数错拍 —— 实际每 1200 tick 才判定一次的隐蔽 bug */
  wwIgniteTick = -400;
  /** 宣战时间戳流水（自然引燃的频仍度信号：短命战争频繁爆发也是列强失控；瞬态不入档，读档后重新积累） */
  warHistory: number[] = [];

  /** 宣战檄文（纪事原文） */
  casusText(ca: Civ, cb: Civ, reason: CasusKind, goal: number): string {
    switch (reason) {
      case 'border': return `「${ca.name}」以边境土地纠葛为由向「${cb.name}」宣战——旨在夺取 ${goal} 格接壤疆土`;
      case 'conquest': return `「${ca.name}」以开疆拓土之名向「${cb.name}」宣战——不吞并 ${goal} 格国土誓不罢兵`;
      case 'plunder': return `「${ca.name}」垂诞「${cb.name}」的膏腴，发动劫掠战争——须斩获 ${goal} 战果方肯休战`;
      case 'revenge': return `「${ca.name}」不忘旧败之耻，向「${cb.name}」掀起复仇战争——不夺回 ${goal} 分优势决不收兵`;
      case 'rebel': return `「${ca.name}」出兵讨伐叛离的「${cb.name}」——不将其从大地上抹去决不收兵`;
      case 'annex': return `「${ca.name}」对「${cb.name}」发动灭国战争——不摧毁对方最后一座城池决不罢休`;
      case 'unify': return `「${ca.name}」奉统一天下之大义向「${cb.name}」宣战——世间只能有一个强权`;
      case 'holy': return `神谕既下：「${ca.name}」奉旨向「${cb.name}」发动圣战`;
      case 'alliance': return `「${ca.name}」依盟约向「${cb.name}」参战——政守同盟，共赴戎机`;
    }
  }

  /** 统一宣战入口：战争必须有理由（casus belli）与可量化的目的。
   *  停战仅两途——目的达成（concludeGoalWar）或无力支撑（warInfoTick 崩溃判定） */
  declareWar(agg: number, victim: number, reason: CasusKind, opts?: { total?: boolean; goal?: number; force?: boolean; quiet?: boolean }): WarInfo | null {
    const ca = this.civs[agg];
    const cb = this.civs[victim];
    if (!ca?.alive || !cb?.alive || agg === victim) return null;
    if (!opts?.force && !this.laws.wars) return null; // 世界法则禁战（神谕/叛乱由 force 驱动）
    const key = pairKey(agg, victim);
    this.met.add(key);
    const level = GameEngine.CASUS_LEVEL[reason];
    const cur = this.rel.get(key) ?? 0;
    this.rel.set(key, Math.min(cur, level));
    // 目的定量（opts.goal 优先——神谕攻城令等自带目标）
    let goal = opts?.goal ?? 0;
    if (goal <= 0) {
      const vicTiles = cb.tiles.length;
      switch (reason) {
        case 'border': goal = Math.max(6, Math.min(12, Math.round(vicTiles * 0.1))); break;
        case 'conquest': goal = Math.max(16, Math.min(45, Math.round(vicTiles * 0.25))); break;
        case 'plunder': goal = Math.max(24, Math.min(44, Math.round(cb.pop * 0.6))); break;
        case 'revenge': goal = 30; break;
        default: goal = 0; // rebel/annex/unify/holy：摧毁敌国
      }
    }
    const wd = this.ensureWarData(agg, victim);
    if (!wd) return null;
    wd.reason = reason;
    wd.aggressor = agg;
    wd.goal = goal;
    wd.reasonText = this.casusText(ca, cb, reason, goal);
    const immortal = reason === 'annex' || reason === 'unify' || reason === 'rebel' || opts?.total;
    if (immortal) {
      wd.total = true;
      this.totalWars.add(key);
      if (wd.giveUpAt === 0) wd.giveUpAt = this.tickCount + 3600;
    }
    wd.lastActiveTick = this.tickCount;
    // —— 宣战流水（自然引燃频仍度信号）：连年烽火的积累比瞬时战争数更真实 ——
    this.warHistory.push(this.tickCount);
    if (this.warHistory.length > 24) this.warHistory.shift();
    // —— 战争动员开销（Task 34 经济闭环）：开战即烧钱（集结/军械/粮秣）——
    //    穷国黩武愈发勉强；大战列强互宣时重复计费 = 总体战掏空国库的历史质感
    {
      const cost = Math.min(40, 8 + Math.floor(ca.pop * 0.08));
      ca.gold = Math.max(0, (ca.gold ?? 0) - cost);
    }
    if (!opts?.quiet) {
      this.addEvent('casus', wd.reasonText, {
        colorHex: ca.colorHex,
        x: ca.capital >= 0 ? this.tileX(ca.capital) : undefined,
        y: ca.capital >= 0 ? this.tileY(ca.capital) : undefined,
      });
      this.toast(`「${ca.name}」对「${cb.name}」宣战：${CASUS_META[reason].label}`, 'war');
      this.onSound?.('horn'); // 宣战号角（42-e 接线）
    }
    // —— 联盟集体防御：对成员宣战 = 与整个联盟为敌（攻守同盟的核心条款）——
    if (reason !== 'alliance' || opts?.force) {
      const vAl = this.allianceOfCiv(victim);
      if (vAl && !vAl.members.includes(agg)) {
        let joined = 0;
        for (const m of vAl.members) {
          if (m === victim || m === agg) continue;
          const mc = this.civs[m];
          if (!mc?.alive || this.atWar(m, agg)) continue;
          if (this.declareWar(m, agg, 'alliance', { force: true, quiet: true, goal: 6 })) {
            joined++;
            const k = pairKey(m, agg);
            this.rel.set(k, Math.min(this.rel.get(k) ?? 0, -35));
          }
        }
        if (joined > 0 && !opts?.quiet) {
          vAl.warsTogether++;
          this.addEvent('alliance', `集体防御条款生效：「${vAl.name}」的 ${joined} 个成员国对侵略者「${ca.name}」宣战`, { colorHex: vAl.colorHex });
        }
      }
    }
    // —— 联军协同出击：盟友主动开战时跟随参战（每联盟 300 tick 冷却；盟友与对方关系 ≥20 则拒绝）——
    if (!opts?.force && reason !== 'alliance' && reason !== 'rebel' && this.laws.wars) {
      const aAl = this.allianceOfCiv(agg);
      if (aAl && this.tickCount - (this.allianceWarCd.get(aAl.id) ?? -9e9) > 300) {
        let joined = 0;
        for (const m of aAl.members) {
          if (m === agg) continue;
          const mc = this.civs[m];
          if (!mc?.alive || this.atWar(m, victim)) continue;
          if ((this.rel.get(pairKey(m, victim)) ?? 0) >= 20) {
            aAl.cohesion = Math.max(0, aAl.cohesion - 2); // 拒绝出兵：貌合神离
            continue;
          }
          if (this.rng() < 0.6 && this.declareWar(m, victim, 'alliance', { force: true, quiet: true, goal: 6 })) {
            joined++;
          }
        }
        if (joined > 0) {
          this.allianceWarCd.set(aAl.id, this.tickCount);
          aAl.warsTogether++;
          this.addEvent('alliance', `联军出击：「${aAl.name}」${joined} 个成员国响应盟主号令，共讨「${cb.name}」`, { colorHex: aAl.colorHex });
        }
      }
    }
    // —— 种族关系：种族间王国的战争撕裂整个种族对彼此的看法（圣战/世仇最伤）——
    this.shiftRaceRel(ca.race, cb.race, reason === 'holy' ? -4 : -2.5);
    return wd;
  }

  /** 挑选开战理由与挑起方（复仇记忆/统一雄心/神谕目标/实力对比共同驱动） */
  pickCasus(ca: Civ, cb: Civ): { reason: CasusKind; aggressor: Civ; victim: Civ } {
    const key = pairKey(ca.id, cb.id);
    // 复仇：上一场战争的败方主动寻仇（败国之恨几乎必然寻机翻案）
    const shame = this.warShame.get(key);
    if (shame != null) {
      const agg = shame === ca.id ? ca : cb;
      const vic = shame === ca.id ? cb : ca;
      if (agg.alive && vic.alive && (agg.militarism ?? 30) >= 22 && this.rng() < 0.6) {
        return { reason: 'revenge', aggressor: agg, victim: vic };
      }
    }
    // 统一雄心 / 灭国·攻城神谕：目标就在眼前
    for (const c of [ca, cb]) {
      const other = c === ca ? cb : ca;
      if (this.activeDirective(c.id, 'unify') && c.pop >= other.pop) {
        return { reason: 'unify', aggressor: c, victim: other };
      }
      const d = this.activeDirective(c.id, 'annihilate') ?? this.activeDirective(c.id, 'conquer');
      if (d && d.target === other.id) return { reason: 'holy', aggressor: c, victim: other };
    }
    // 挑起方：军国主义更高者更主动
    const agg = (ca.militarism ?? 30) + this.rng() * 34 >= (cb.militarism ?? 30) + this.rng() * 34 ? ca : cb;
    const vic = agg === ca ? cb : ca;
    const ratio = (agg.pop + 2) / (vic.pop + 2);
    // —— 种族贪婪互连：贪婪种族（哥布林/矮人财性）的劫掠冲动更强 ——
    const greed = RACES[agg.race]?.greed ?? 0.5;
    if (ratio >= 1.6 && (agg.militarism ?? 30) >= 42) return { reason: 'conquest', aggressor: agg, victim: vic };
    if ((vic.gold ?? 0) >= 140 && (agg.militarism ?? 30) >= 45 && (greed >= 0.55 || this.rng() < 0.4)) return { reason: 'plunder', aggressor: agg, victim: vic };
    if (ratio <= 0.8 && (agg.militarism ?? 30) >= 52 && greed >= 0.6) return { reason: 'plunder', aggressor: agg, victim: vic };
    return { reason: 'border', aggressor: agg, victim: vic };
  }

  /** 战争承受力（0-100）：军心/财富/政体支撑 − 伤亡/家园烽火/战局不利/人口凋敝。跌破 25 = 无力支撑 */
  sustainOf(civ: Civ, wd: WarInfo, isA: boolean): number {
    const ex = isA ? wd.exA : wd.exB;
    const myScore = isA ? wd.scoreA : wd.scoreB;
    const foeScore = isA ? wd.scoreB : wd.scoreA;
    const razedAgainst = isA ? wd.razedB : wd.razedA;
    const pop0 = isA ? wd.popA0 : wd.popB0;
    let s = 66;
    s += (civ.militarism ?? 30) * 0.28;
    s += Math.min(16, (civ.gold ?? 0) * 0.05);
    if (civ.gov === 4) s += 8;
    if ((civ.mobilizeUntil ?? 0) > this.tickCount) s += 12;
    // —— 联盟并肩：盟友正与同一敌人交战 → 盟军并肩作战承受力 +10 ——
    const alSide = this.allianceOfCiv(civ.id);
    if (alSide) {
      const foe = isA ? wd.b : wd.a;
      for (const m of alSide.members) {
        if (m !== civ.id && this.atWar(m, foe)) { s += 10; break; }
      }
    }
    // —— 季节互连：冬季战役自古艰难（补给线被冰雪封锁） ——
    if (this.nature.season === 3) s -= 6;
    // —— 生态互连：饥荒年月，军队与百姓争食 ——
    if (this.ecoState === 'collapse') s -= 8;
    s -= ex * 0.5;
    s -= (isA ? (wd.wearA ?? 0) : (wd.wearB ?? 0)) * 0.24; // 厌战度侵蚀承受力
    s -= razedAgainst * 1.2;
    s -= Math.max(0, foeScore - myScore) * 0.4;
    s -= Math.max(0, 1 - Math.max(0, civ.pop) / Math.max(1, pop0)) * 70;
    return Math.max(0, Math.min(100, s));
  }

  /** 战争目的当前进度（数值；goal=0 的摧毁战争以敌方人口凋敝度 0-100 计） */
  warGoalNow(wd: WarInfo): number {
    const aggIsA = wd.aggressor === wd.a;
    if (wd.goal <= 0) {
      const vic = aggIsA ? this.civs[wd.b] : this.civs[wd.a];
      const pop0 = aggIsA ? wd.popB0 : wd.popA0;
      if (!vic || pop0 <= 0) return 0;
      return Math.round((1 - Math.max(0, vic.pop) / pop0) * 100);
    }
    const aggScore = aggIsA ? wd.scoreA : wd.scoreB;
    const foeScore = aggIsA ? wd.scoreB : wd.scoreA;
    const occ = aggIsA ? wd.occA : wd.occB;
    switch (wd.reason) {
      case 'border':
      case 'conquest':
        return occ;
      case 'revenge':
        return Math.max(0, Math.round(aggScore - foeScore));
      default:
        return Math.max(0, Math.round(aggScore));
    }
  }

  /** 目的量描述（战况面板） */
  warGoalLabel(wd: WarInfo): string {
    if (wd.goal <= 0) return '摧毁敌国';
    switch (wd.reason) {
      case 'plunder': return `斩获 ${wd.goal} 战果`;
      case 'revenge': return `夺回 ${wd.goal} 分优势`;
      case 'holy': return `神谕战果 ${wd.goal}`;
      default: return `夺取 ${wd.goal} 格疆土`;
    }
  }

  /** 目的是否达成（goal=0 的摧毁战争由灭国结算，不走此门） */
  warGoalMet(wd: WarInfo): boolean {
    return wd.goal > 0 && this.warGoalNow(wd) >= wd.goal;
  }

  /** 目的达成的终战：战胜国按理由提取战利品（占领地保留 / 索赔赔款） */
  concludeGoalWar(wd: WarInfo) {
    const ca = this.civs[wd.a];
    const cb = this.civs[wd.b];
    const agg = this.civs[wd.aggressor] ?? ca;
    if (!ca?.alive || !cb?.alive || !agg?.alive) return;
    const vic = agg === ca ? cb : ca;
    if (wd.reason === 'plunder' || wd.reason === 'revenge') {
      const loot = Math.min(vic.gold ?? 0, wd.reason === 'revenge' ? 90 : 70);
      if (loot > 0) {
        vic.gold = (vic.gold ?? 0) - loot;
        agg.gold = (agg.gold ?? 0) + loot;
      }
      this.makePeace(agg.id, vic.id, `「${agg.name}」的${CASUS_META[wd.reason].label}大功告成${loot > 0 ? `，索赔 ${loot} 财富` : ''}，如愿收兵`, 10);
      if (loot > 0) this.addEvent('loot', `「${agg.name}」从「${vic.name}」索得 ${loot} 财富赔款`, { colorHex: agg.colorHex });
    } else {
      const occ = wd.aggressor === wd.a ? wd.occA : wd.occB;
      this.makePeace(agg.id, vic.id, `「${agg.name}」的${CASUS_META[wd.reason].label}目的达成——夺取 ${occ} 格疆土，战线成为新国界`, 10);
      if (occ > 0) this.addEvent('cession', `「${agg.name}」经此一役尽得 ${occ} 格疆土，「${vic.name}」被迫接受新国界`, { colorHex: agg.colorHex });
    }
  }

  /** 战争占领入账（目的进度：border/conquest 的量尺） */
  noteOccupied(byCiv: number, victimCiv: number, n: number) {
    if (n <= 0 || byCiv === victimCiv) return;
    const wd = this.warData.get(pairKey(byCiv, victimCiv));
    if (!wd) return;
    if (wd.a === byCiv) wd.occA += n; else wd.occB += n;
  }

  /** 旧档战争档案补全（理由体系字段缺省回填） */
  normalizeWarInfo(w: Partial<WarInfo>): WarInfo {
    const a = this.civs[w.a ?? -1];
    const b = this.civs[w.b ?? -1];
    const reason: CasusKind = w.reason ?? (w.total ? 'annex' : 'border');
    return {
      key: w.key ?? pairKey(w.a ?? 0, w.b ?? 1),
      a: w.a ?? 0,
      b: w.b ?? 0,
      startTick: w.startTick ?? this.tickCount,
      startYear: w.startYear ?? Math.floor(this.yearF),
      total: w.total ?? false,
      scoreA: w.scoreA ?? 0, scoreB: w.scoreB ?? 0,
      exA: w.exA ?? 0, exB: w.exB ?? 0, casA: w.casA ?? 0, casB: w.casB ?? 0,
      razedA: w.razedA ?? 0, razedB: w.razedB ?? 0, battles: w.battles ?? 0,
      giveUpAt: w.giveUpAt ?? 0,
      reason,
      reasonText: w.reasonText ?? (a?.alive && b?.alive ? this.casusText(a, b, reason, w.goal ?? 0) : ''),
      aggressor: w.aggressor ?? (a?.alive && b?.alive ? (a.pop >= b.pop ? w.a! : w.b!) : w.a ?? 0),
      goal: w.goal ?? 0,
      goalNow: w.goalNow ?? 0,
      occA: w.occA ?? 0, occB: w.occB ?? 0,
      popA0: w.popA0 ?? a?.pop ?? 0,
      popB0: w.popB0 ?? b?.pop ?? 0,
      lastActiveTick: this.tickCount,
    };
  }

  // ================== 战争体系升级（WarInfo 档案/战争分数/割地/疲乏） ==================
  /** 取/建战争档案（宣战时调用） */
  ensureWarData(a: number, b: number): WarInfo | null {
    const key = pairKey(a, b);
    let wd = this.warData.get(key);
    if (wd) return wd;
    if (!this.civs[a]?.alive || !this.civs[b]?.alive) return null;
    const ca = this.civs[a];
    const cb = this.civs[b];
    wd = {
      key, a: Math.min(a, b), b: Math.max(a, b),
      startTick: this.tickCount, startYear: Math.floor(this.yearF),
      total: this.totalWars.has(key),
      scoreA: 0, scoreB: 0, exA: 0, exB: 0, casA: 0, casB: 0,
      razedA: 0, razedB: 0, battles: 0,
      giveUpAt: 0,
      reason: 'border', reasonText: '', aggressor: ca.pop >= cb.pop ? a : b,
      goal: 0, goalNow: 0, occA: 0, occB: 0,
      popA0: ca.pop, popB0: cb.pop,
      lastActiveTick: this.tickCount,
    };
    this.warData.set(key, wd);
    this.statWars++; // 成就计数：新战争建档（含旧档补录）
    return wd;
  }

  /** 战争分数入账（byCiv 侧 +pts；伤亡/疲乏同步） */
  addWarScore(byCiv: number, victimCiv: number, pts: number, kind: 'kill' | 'raze' | 'capture' | 'capital' | 'clash' | 'occupy') {
    const wd = this.warData.get(pairKey(byCiv, victimCiv));
    if (!wd) return;
    const isA = wd.a === byCiv;
    if (isA) wd.scoreA += pts; else wd.scoreB += pts;
    if (kind === 'kill') {
      if (isA) { wd.casB += 1; wd.exB += 1; } else { wd.casA += 1; wd.exA += 1; }
    } else if (kind === 'raze' || kind === 'capture') {
      if (isA) wd.razedA += 1; else wd.razedB += 1;
    }
  }

  /** 战斗击杀结算：战争分数 / 军团战功 / 总动员计数 */
  onWarKill(killer: Unit, victim: Unit) {
    if (killer.civ < 0 || victim.civ < 0 || killer.civ === victim.civ) return;
    if (!this.atWar(killer.civ, victim.civ)) return;
    this.addWarScore(killer.civ, victim.civ, 2, 'kill');
    this.wwCountKill(victim); // 大战阵亡计数
    // 军团战功
    if (killer.army != null) {
      const ka = this.armies.find((x) => x.id === killer.army);
      if (ka) { ka.kills++; ka.morale = Math.min(100, ka.morale + 1.5); }
    }
    // 总动员旨意战果计数
    for (const d of this.directives) {
      if (d.status === 'active' && d.kind === 'mobilize' && d.civ === killer.civ) {
        d.killCount = (d.killCount ?? 0) + 1;
      }
    }
  }

  /** 战争档案周期结算（每 100 tick）——停战的唯一裁决者：
   *  ① 目的达成 → concludeGoalWar；② 无力支撑（承受力崩溃/灭国久攻不下）→ 割地或白平；
   *  ③ 劳师糜饷（长期沉寂）→ 财政枯竭式罢兵 */
  // ================== 动态战线（战时占领层） ==================
  /** 军团注入占领力：r 环内敌方领土 → 占领层渐进渗透（战时虚国界推进） */
  private frontPush(a: Army, radius: number, power: number) {
    const cx = Math.floor(a.x);
    const cy = Math.floor(a.y);
    let pushed = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + 1) continue;
        const xx = cx + dx;
        const yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx;
        const o = this.owner[i];
        if (o !== a.targetCiv) continue; // 只渗透当前交战敌国领土
        if (!isLand(this.terrain[i]) || this.terrain[i] === T.MOUNTAIN) continue;
        // 距离衰减：军团脚下满功率、边缘 1/4 功率 → 波纹式战线（前沿始终有渐变渗透带）
        const dist = Math.sqrt(dx * dx + dy * dy);
        const pw = Math.max(1, Math.round(power * (1 - (dist / (radius + 1)) * 0.75)));
        if (this.occCiv[i] === a.civ) {
          const ns = Math.min(100, this.occStr[i] + pw + Math.floor(this.rng() * 3));
          if (ns >= 100 && this.occStr[i] < 100) this.frontSolidify(i, a.civ);
          else this.occStr[i] = ns;
        } else if (this.occCiv[i] === -1 || this.occStr[i] < 25) {
          // 新渗透（敌方控制的占领格需先打掉）
          this.occCiv[i] = a.civ;
          this.occStr[i] = Math.max(4, Math.min(30, this.occStr[i] + pw));
          this.occSet.add(i);
        }
        pushed++;
      }
    }
    // （Task 35 修正：占领层反复堆功率不再重置战争活跃计时——只有真推进（frontSolidify 转正
    //   → occ 入账 → 战事签名变化）才算活跃；否则行军刷功率可无限续命僵持战）
    return pushed;
  }

  /** 占领转正：正式易帜 + 战功入账（城头变幻大王旗） */
  private frontSolidify(i: number, civId: number) {
    this.occCiv[i] = -1;
    this.occStr[i] = 0;
    this.occSet.delete(i);
    const victim = this.owner[i];
    this.claimTile(i, civId);
    const wd = this.warData.get(pairKey(civId, victim));
    if (wd) {
      if (civId === wd.a) { wd.scoreA += 1; wd.occA += 1; } else { wd.scoreB += 1; wd.occB += 1; }
    }
  }

  /** 战线周期结算（每 30 tick）：无军团维持 → 衰减；敌军压境 → 加速瓦解；转正在 frontPush 内即时触发 */
  frontTick() {
    if (this.occSet.size === 0) return;
    // 军团位置快照（平方距离判定省 sqrt）+ 各文明盟友快查（盟军协防）
    const arr = this.armies.map((a) => ({ civ: a.civ, x: a.x, y: a.y }));
    const allyMap = new Map<number, Set<number>>();
    for (const al of this.alliances) {
      const set = new Set(al.members);
      for (const m of al.members) allyMap.set(m, set);
    }
    for (const i of [...this.occSet]) {
      const oc = this.occCiv[i];
      if (oc < 0 || !this.civs[oc]?.alive) { this.occCiv[i] = -1; this.occStr[i] = 0; this.occSet.delete(i); continue; }
      const x = i % W;
      const y = (i / W) | 0;
      let held = false;
      let contested = false;
      const ocAllies = allyMap.get(oc);
      for (const a of arr) {
        const d2 = (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y);
        if (d2 <= 49) { // 7 格内本国军团维持占领；盟友军团协防（衰减减半）
          if (a.civ === oc) { held = true; break; }
          if (ocAllies && ocAllies.has(a.civ)) { held = true; break; }
        }
        if (d2 <= 9 && a.civ === this.owner[i]) contested = true; // 3 格内敌国军团反攻
      }
      if (contested) {
        this.occStr[i] = Math.max(0, this.occStr[i] - 16);
      } else if (!held) {
        this.occStr[i] = Math.max(0, this.occStr[i] - 4);
      }
      if (this.occStr[i] <= 0) {
        const victim = this.owner[i];
        this.occCiv[i] = -1;
        this.occStr[i] = 0;
        this.occSet.delete(i);
        // 收复失地纪事（低频）
        if (this.rng() < 0.08 && victim >= 0 && this.civs[victim]?.alive) {
          const c = this.civs[victim];
          this.addEvent('battle', `「${c.name}」收复了一块沦陷的国土`, { colorHex: c.colorHex, x, y });
        }
      }
    }
  }

  /** 停战结算战线：高强度占领区成为既成事实（割让），低强度归还 */
  settleFront(a: number, b: number) {
    let ceded = 0;
    let returned = 0;
    for (const i of [...this.occSet]) {
      const oc = this.occCiv[i];
      if (oc !== a && oc !== b) continue;
      const o = this.owner[i];
      if (oc === a && o === b) {
        if (this.occStr[i] >= 70) { this.frontSolidify(i, a); ceded++; }
        else { this.occCiv[i] = -1; this.occStr[i] = 0; this.occSet.delete(i); returned++; }
      } else if (oc === b && o === a) {
        if (this.occStr[i] >= 70) { this.frontSolidify(i, b); ceded++; }
        else { this.occCiv[i] = -1; this.occStr[i] = 0; this.occSet.delete(i); returned++; }
      }
    }
    return { ceded, returned };
  }

  /** 清空某国的全部占领（灭国时） */
  clearFrontOf(civId: number) {
    for (const i of [...this.occSet]) {
      if (this.occCiv[i] === civId) {
        this.occCiv[i] = -1;
        this.occStr[i] = 0;
        this.occSet.delete(i);
      }
    }
  }

  warInfoTick() {
    // Task 38 决战冻结：任何战争/终极世界大战进行中 → 暂停在采集与训练（决战不训练）
    setFrozen(this.warData.size > 0 || this.worldWar.phase === 'running');
    // —— 战争财政（Task 34 经济闭环）：交战国每轮（2.5 年）支付战争维持费（粮秣/军械/抚恤）——
    //    和平积累、战争烧钱：财政从「只涨不花的数字」变成战争机器的血液；国库见底则民怨沸腾
    for (const c of this.civs) {
      if (!c.alive || c.pop <= 0 || !this.civAtWar(c.id)) continue;
      const cost = Math.min(30, 3 + Math.floor(c.pop * 0.12));
      if ((c.gold ?? 0) >= cost) {
        c.gold = (c.gold ?? 0) - cost;
      } else {
        c.gold = 0;
        c.stability = Math.max(0, (c.stability ?? 70) - 0.8); // 战争贷款压垮民意
      }
      c.expense = Math.round(((c.expense ?? 0) + cost) * 10) / 10;
    }
    // 新战争建档（直设 rel 的漏网之鱼兜底：旧存档/分裂残余）
    for (const [key, v] of this.rel) {
      if (v < -20 && !this.warData.has(key)) {
        const dash = key.indexOf('-');
        const a = +key.slice(0, dash);
        const b = +key.slice(dash + 1);
        const ca = this.civs[a];
        const cb = this.civs[b];
        if (!ca?.alive || !cb?.alive) continue;
        const wd = this.ensureWarData(a, b);
        if (wd) {
          // 推断理由：-75 以下视为深仇灭国，否则按边境战争补档
          wd.reason = v <= -75 ? 'annex' : 'border';
          wd.total = v <= -75 || this.totalWars.has(key);
          if (wd.total) this.totalWars.add(key);
          wd.aggressor = ca.pop >= cb.pop ? a : b;
          wd.reasonText = this.casusText(ca, cb, wd.reason, 0);
        }
      }
    }
    for (const [key, wd] of [...this.warData.entries()]) {
      const ca = this.civs[wd.a];
      const cb = this.civs[wd.b];
      if (!ca?.alive || !cb?.alive) { this.warData.delete(key); continue; }
      if ((this.rel.get(key) ?? 0) >= -20) { this.warData.delete(key); continue; } // 已停战（神谕/法则）
      // —— 终极世界大战：战争不真正结束——崩溃方只能乞求临时停战（到期自动重燃）——
      if (this.worldWar.phase === 'running' && this.wwIsBelligerent(wd.a) && this.wwIsBelligerent(wd.b)) {
        const sAw = this.sustainOf(ca, wd, true);
        const sBw = this.sustainOf(cb, wd, false);
        if ((sAw < 25 || sBw < 25) && this.rng() < 0.5) {
          const broken = sAw < 25 ? ca : cb;
          this.addEvent('collapse', `「${broken.name}」民穷财尽、战线崩溃——只能乞求临时停战喘息`, { colorHex: broken.colorHex });
          this.makePeace(ca.id, cb.id, `终极世界大战暂时平息：「${ca.name}」与「${cb.name}」罢兵休整（战端随时重燃）`, 5);
        }
        continue; // 大战期间跳过常规终战裁决（目的达成/劳师糜饷一概不停战）
      }
      // —— 现代武器（常规战争）：掌握火炮科技的国家偶尔炮击敌境 ——
      const tmA2 = this.techModsOf(wd.a);
      const tmB2 = this.techModsOf(wd.b);
      if ((tmA2.arty > 0 || tmB2.arty > 0) && this.rng() < 0.12) {
        const shooter = tmA2.arty > 0 && (tmB2.arty <= 0 || this.rng() < 0.5) ? ca : cb;
        const target = shooter === ca ? cb : ca;
        this.launchArtillery(shooter, target);
      }
      // —— 未来武器（常规战争）：定向能国家的激光炮台精确狙杀 ——
      if ((tmA2.laser > 0 || tmB2.laser > 0) && this.rng() < 0.2) {
        const shooter = tmA2.laser > 0 && (tmB2.laser <= 0 || this.rng() < 0.5) ? ca : cb;
        const target = shooter === ca ? cb : ca;
        this.launchLaser(shooter, target);
      }
      // —— 未来武器（常规战争）：无人机蜂群自主游猎 ——
      if ((tmA2.drone > 0 || tmB2.drone > 0) && this.rng() < 0.1) {
        const shooter = tmA2.drone > 0 && (tmB2.drone <= 0 || this.rng() < 0.5) ? ca : cb;
        const target = shooter === ca ? cb : ca;
        const tt = target.capital >= 0 ? target.capital : target.tiles[0] ?? -1;
        if (tt >= 0) this.launchDroneSwarm(shooter, this.tileX(tt) + 0.5, this.tileY(tt) + 0.5);
      }
      // —— 战事活跃签名：有战果 → 仇恨加深（有机升级灭国战争）+ 重置沉寂计时 ——
      const sig = wd.casA + wd.casB + wd.razedA + wd.razedB + wd.occA + wd.occB + wd.battles * 3;
      if (sig !== wd.sigMark) {
        const gained = sig - (wd.sigMark ?? sig);
        wd.sigMark = sig;
        wd.lastActiveTick = this.tickCount;
        const v0 = this.rel.get(key) ?? 0;
        this.rel.set(key, Math.max(-96, v0 - 2));
        // —— 厌战方向修正（Task 35）：胜利方民心振奋（厌战回落），失利方民怨沸腾（厌战上升）——
        // （旧版双方齐回落 → 久战双方永不厌战 → 无限僵持的病灶）
        const aAhead = (wd.scoreA - wd.scoreB) >= 0;
        const kw = Math.min(3, Math.ceil(gained / 6));
        if (aAhead) {
          wd.wearA = Math.max(0, (wd.wearA ?? 0) - 3 * kw);
          wd.wearB = Math.min(100, (wd.wearB ?? 0) + 1.2 * kw);
        } else {
          wd.wearB = Math.max(0, (wd.wearB ?? 0) - 3 * kw);
          wd.wearA = Math.min(100, (wd.wearA ?? 0) + 1.2 * kw);
        }
      }
      // —— 厌战度累积：久战无果 + 民生凋敝（每轮 2.5 年 +1.8 基线；人口跌破 75% 加速）——
      // 联盟互连：盟友并肩参战 → 士气振奋，厌战增速 ×0.85
      const alA = this.allianceOfCiv(wd.a);
      const alB = this.allianceOfCiv(wd.b);
      const allyA = alA ? alA.members.some((m) => m !== wd.a && this.atWar(m, wd.b)) ? 0.85 : 1 : 1;
      const allyB = alB ? alB.members.some((m) => m !== wd.b && this.atWar(m, wd.a)) ? 0.85 : 1 : 1;
      const wearBase = 1.8;
      const imA = this.ideaModsOf(wd.a); // v3：涌现理念影响厌战（偃武主义拉低 / 军功爵推高）
      const imB = this.ideaModsOf(wd.b);
      const popRatioA = Math.max(0, ca.pop) / Math.max(1, wd.popA0);
      const popRatioB = Math.max(0, cb.pop) / Math.max(1, wd.popB0);
      wd.wearA = Math.min(100, (wd.wearA ?? 0) + (wearBase + (popRatioA < 0.75 ? 2.2 : 0) + (wd.razedA > 0 ? 0 : 0.4)) * (1 + imA.wear) * allyA);
      wd.wearB = Math.min(100, (wd.wearB ?? 0) + (wearBase + (popRatioB < 0.75 ? 2.2 : 0) + (wd.razedB > 0 ? 0 : 0.4)) * (1 + imB.wear) * allyB);
      // —— 单边厌战崩溃（Task 35）：落后方厌战爆表 → 被迫屈膝求和（不看战线活跃度——民变逼迫政府）——
      if (!wd.total && ((wd.wearA ?? 0) > 82 || (wd.wearB ?? 0) > 82)) {
        const weary = (wd.wearA ?? 0) > 82 ? ca : cb;
        const diff = wd.scoreA - wd.scoreB;
        const winner = diff >= 0 ? ca : cb;
        const loser = diff >= 0 ? cb : ca;
        if (weary === loser) {
          this.addEvent('collapse', `「${weary.name}」厌战怒火沸腾，政局摇摇欲坠——被迫屈膝求和`, { colorHex: weary.colorHex });
          const cap = wd.reason === 'border' ? Math.max(6, wd.goal) : wd.reason === 'plunder' || wd.reason === 'revenge' ? 10 : 40;
          this.concludeByScore(winner, loser, cap);
        } else {
          this.makePeace(ca.id, cb.id, `「${weary.name}」虽占上风却民怨沸腾，见好就收，两国罢兵言和`, 8);
        }
        continue;
      }
      // —— 双高厌战 + 战线沉寂 → 民意压垮战争（白平，不等国力崩溃）——
      if ((wd.wearA ?? 0) > 62 && (wd.wearB ?? 0) > 62 && this.tickCount - (wd.lastActiveTick ?? wd.startTick) > 500 && !wd.total) {
        this.addEvent('collapse', `「${ca.name}」与「${cb.name}」两国怨声载道，民意压垮了战争`, { colorHex: ca.colorHex });
        this.makePeace(ca.id, cb.id, `「${ca.name}」与「${cb.name}」不堪连年征战，民间厌战沸腾，两国罢兵`, 8);
        continue;
      }
      // —— 仇恨燎原 → 升级为灭国战争（不死不休）——
      const rel = this.rel.get(key) ?? 0;
      if (rel < -75 && !this.totalWars.has(key) && this.laws.wars) {
        this.totalWars.add(key);
        wd.total = true;
        const [x, y] = key.split('-').map(Number);
        const cx = this.civs[x];
        const cy = this.civs[y];
        if (cx?.alive && cy?.alive) {
          const agg = wd.aggressor === x ? cx : cy;
          const vic = wd.aggressor === x ? cy : cx;
          wd.reason = 'annex';
          wd.goal = 0;
          wd.reasonText = this.casusText(agg, vic, 'annex', 0);
          this.addEvent('totalwar', `「${cx.name}」与「${cy.name}」的战争升级为灭国战争——不摧毁对方最后一座城池决不罢休`, { colorHex: cx.colorHex });
          this.toast(`「${cx.name}」与「${cy.name}」的灭国战争开始了`, 'war');
        }
        if (wd.giveUpAt === 0) wd.giveUpAt = this.tickCount + 3600;
      }
      // —— ① 目的达成 → 终战 ——
      wd.goalNow = this.warGoalNow(wd);
      if (this.warGoalMet(wd)) { this.concludeGoalWar(wd); continue; }
      // —— ② 灭国战争久攻不下 → 攻方放弃（灭国可以失败！）——
      if (wd.total && wd.giveUpAt > 0 && this.tickCount > wd.giveUpAt) {
        const aAhead = wd.scoreA >= wd.scoreB;
        const winner = aAhead ? ca : cb;
        const quitter = aAhead ? cb : ca;
        this.totalWars.delete(key);
        this.warData.delete(key);
        this.rel.set(key, -5); // 怀恨在心（> -20 即停战，宿怨为复仇战争留种）
        this.addEvent('peace', `灭国战争草草收场：「${quitter.name}」久攻「${winner.name}」不下，师老兵疲，只得罢兵`, { colorHex: winner.colorHex });
        this.addEvent('collapse', `「${quitter.name}」国力耗竭，无力支撑灭国宏图`, { colorHex: quitter.colorHex });
        this.toast(`「${quitter.name}」的灭国战争失败了`, 'info');
        continue;
      }
      // —— ③ 战争承受力（0-100，<25 崩溃）——
      const sA = this.sustainOf(ca, wd, true);
      const sB = this.sustainOf(cb, wd, false);
      const aBroken = sA < 25;
      const bBroken = sB < 25;
      if (wd.total) {
        // 灭国/统一/叛乱战争：唯攻方崩溃才作罢——守方撑不住也要战至亡国（由灭国结算）
        const aggBroken = wd.aggressor === wd.a ? aBroken : bBroken;
        const agg = this.civs[wd.aggressor];
        if (aggBroken && agg?.alive && this.rng() < 0.5) {
          this.totalWars.delete(key);
          this.warData.delete(key);
          this.rel.set(key, -5);
          this.addEvent('collapse', `「${agg.name}」民穷财尽，无力支撑灭国战争，攻势土崩瓦解`, { colorHex: agg.colorHex });
          this.addEvent('peace', `「${ca.name}」与「${cb.name}」的灭国战争无果而终，两国罢兵`, { colorHex: ca.colorHex });
          this.toast(`「${agg.name}」的灭国战争失败了`, 'info');
        }
        continue; // 守方崩溃不停战：战至最后
      }
      if (aBroken || bBroken) {
        const diff = wd.scoreA - wd.scoreB;
        const winner = diff >= 0 ? ca : cb;
        const loser = diff >= 0 ? cb : ca;
        const brokenIsLoser = diff >= 0 ? bBroken : aBroken;
        if (brokenIsLoser && this.rng() < 0.5) {
          // 弱势方崩溃 → 屈膝割地求和（割让量与战争目的相称）
          this.addEvent('collapse', `「${loser.name}」民穷财尽、无力支撑战事，被迫屈膝求和`, { colorHex: loser.colorHex });
          const cap = wd.reason === 'border' ? Math.max(6, wd.goal) : wd.reason === 'plunder' || wd.reason === 'revenge' ? 10 : 40;
          this.concludeByScore(winner, loser, cap);
        } else if (this.rng() < 0.4) {
          // 占优方虚耗崩溃 / 双方两败俱伤 → 白平（心怀怨怼）
          this.addEvent('collapse', `「${winner.name}」久战虚耗，国力难以为继，战争无果而终`, { colorHex: winner.colorHex });
          this.makePeace(ca.id, cb.id, `「${ca.name}」与「${cb.name}」两败俱伤，民疲兵乏，罢战言和`, 5);
        }
        continue;
      }
      // —— ④ 劳师糜饷：战线长期沉寂 → 财政枯竭式罢兵（1500→950：僵持治理）——
      if (this.tickCount - (wd.lastActiveTick ?? wd.startTick) > 950) {
        this.makePeace(ca.id, cb.id, `「${ca.name}」与「${cb.name}」劳师糜饷、战线久无战事，罢兵息战`, 10);
        continue;
      }
      // —— ⑤ 战争世代期限（Task 36 软化）：薅战跨代仍未分胜负 → 厌战概率逐轮攀升的有机罢兵（替代硬截止 2400，更自然的历史节奏）——
      const warLen = this.tickCount - wd.startTick;
      if (!wd.total && warLen > 1800 && this.rng() < Math.min(0.4, (warLen - 1800) / 1500)) {
        this.makePeace(ca.id, cb.id, `「${ca.name}」与「${cb.name}」的战争跨越世代仍未分出胜负——师老兵疲，两国罢兵`, 8);
        continue;
      }
    }
  }

  /** 停战（统一入口：纪事 + 战败耻辱记忆 + 未竟战争旨意提前结算）。
   *  postRel：战后关系（25=常态；10=冷和平；5=心怀怨咀；40=神谕和解） */
  makePeace(a: number, b: number, text: string, postRel = 25) {
    const key = pairKey(a, b);
    // —— 动态战线停战结算：高强度占领成既成事实（割让），低强度归还 ——
    const fr = this.settleFront(a, b);
    if (fr.ceded > 0) {
      const taker = this.civs[a]?.alive ? this.civs[a] : this.civs[b];
      if (taker) this.addEvent('occupy', `停战协议承认既成事实：${fr.ceded} 格战占领土正式易帜`, { colorHex: taker.colorHex });
    }
    // —— 终极世界大战：参战国之间的和平只是休战（停战到期战端自动重燃）——
    const isWwPair = this.wwIsBelligerent(a) && this.wwIsBelligerent(b);
    const wd = this.warData.get(key);
    if (wd) {
      // 战败耻辱记忆（复仇战争的种子）
      const loser = wd.scoreA === wd.scoreB ? null : wd.scoreA > wd.scoreB ? this.civs[wd.b] : this.civs[wd.a];
      if (loser?.alive) this.warShame.set(key, loser.id);
      // 未竟的战争旨意随停战提前失败（灭国/攻城令半途而废——目标未成则失败）
      for (const d of this.directives) {
        if (d.status !== 'active') continue;
        if (!((d.civ === a && d.target === b) || (d.civ === b && d.target === a))) continue;
        if (d.kind === 'annihilate' && this.civs[d.target ?? -1]?.alive) {
          this.finishDirective(d, 'failed', '停战使灭国宏图半途而废');
        } else if (d.kind === 'conquer') {
          const s = wd.a === d.civ ? wd.scoreA : wd.scoreB;
          if (s < 45) this.finishDirective(d, 'failed', '停战使攻城宏图半途而废');
        }
      }
    }
    this.rel.set(key, postRel);
    this.totalWars.delete(key);
    this.warData.delete(key);
    // —— 种族关系：种族间王国的和平让两个种族缓一口气 ——
    if (this.civs[a] && this.civs[b]) this.shiftRaceRel(this.civs[a].race, this.civs[b].race, 1);
    // —— 阵营停战：盟约战争的参战方停战 → 盟友跟随（75%）或拒绝（凝聚力 -10 各自为政）——
    if (wd?.reason === 'alliance') {
      for (const side of [a, b]) {
        const al = this.allianceOfCiv(side);
        if (!al) continue;
        const enemy = side === a ? b : a;
        for (const m of [...al.members]) {
          if (m === side || !this.civs[m]?.alive) continue;
          if (!this.atWar(m, enemy)) continue;
          if (this.rng() < 0.75) {
            this.makePeace(m, enemy, `阵营停战：「${this.civs[m]?.name}」随盟退出战争`, 18);
          } else {
            al.cohesion = Math.max(0, al.cohesion - 10);
          }
        }
      }
    }
    this.addEvent('peace', text, { colorHex: this.civs[a]?.colorHex });
    this.toast(`「${this.civs[a]?.name}」与「${this.civs[b]?.name}」停战了`, 'peace');
    // 大战休战令：记录停战协议（15 年后战端自动重燃）
    if (isWwPair) {
      this.wwTruce.set(key, this.tickCount + GameEngine.WW_TRUCE_TICKS);
      this.worldWar.truces++;
    }
  }

  /** 割地和约：败方割让与胜方接壤的边境领土（按战争理由定上限）+ 建筑随土易帜 */
  concludeByScore(winner: Civ, loser: Civ, maxTiles = 40) {
    let ceded = 0;
    const newTiles: number[] = [];
    for (const t of loser.tiles) {
      if (ceded >= maxTiles) break;
      if (this.owner[t] !== loser.id) continue;
      if (!this.touchesOwner(t, winner.id)) continue;
      this.owner[t] = winner.id;
      newTiles.push(t);
      this.markDirty(t);
      ceded++;
    }
    if (ceded > 0) {
      loser.tiles = loser.tiles.filter((t) => this.owner[t] !== winner.id || !newTiles.includes(t));
      winner.tiles.push(...newTiles);
      // 割地上建筑易帜
      for (const t of newTiles) {
        if (this.building[t] > 0) {
          const bi = this.bIdx.get(t);
          const b = bi !== undefined ? this.buildings[bi] : null;
          if (b && b.civ === loser.id) {
            if (CAPTURABLE.has(b.kind)) {
              b.civ = winner.id;
              loser.houses--;
              winner.houses++;
              this.bHp.set(t, BUILDING_DEFS[b.kind].hp);
            } else {
              this.destroyBuilding(t);
            }
          }
        }
      }
      if (this.overlayMode === 'political' || this.overlayMode === 'alliance') this.overlayDirty = true;
    }
    this.makePeace(winner.id, loser.id, `「${loser.name}」战败求和，向「${winner.name}」割让 ${ceded} 格领土${ceded > 0 ? '，城头变幻大王旗' : ''}`, 10);
    this.addEvent('cession', `「${loser.name}」割地 ${ceded} 格予「${winner.name}」，城头变幻大王旗`, { colorHex: winner.colorHex });
  }

  /** tile 是否与 civ 领土接壤 */
  touchesOwner(t: number, civId: number): boolean {
    const x = t % W;
    const y = (t / W) | 0;
    if (x > 0 && this.owner[t - 1] === civId) return true;
    if (x < W - 1 && this.owner[t + 1] === civId) return true;
    if (y > 0 && this.owner[t - W] === civId) return true;
    if (y < H - 1 && this.owner[t + W] === civId) return true;
    return false;
  }

  // ================== 文明旨意（文明级开发者功能） ==================
  /** 该文明当前生效的某类旨意 */
  activeDirective(civId: number, kind: DirectiveKind): Directive | undefined {
    for (const d of this.directives) {
      if (d.status === 'active' && d.civ === civId && d.kind === kind) return d;
    }
    return undefined;
  }

  /** 旨意期限（tick）与默认参数 */
  static readonly DIRECTIVE_META: Record<DirectiveKind, { years: number; param: number; label: string }> = {
    annihilate: { years: 120, param: 0, label: '灭国令' },
    conquer: { years: 80, param: 0, label: '攻城令' },
    expand: { years: 60, param: 160, label: '扩张令' },
    wealth: { years: 50, param: 300, label: '富国令' },
    wisdom: { years: 60, param: 200, label: '启智令' },
    populate: { years: 60, param: 80, label: '人口令' },
    legion: { years: 30, param: 2, label: '军团令' },
    build: { years: 60, param: 20, label: '建城令' },
    unify: { years: 0, param: 0, label: '统一令' },
    mobilize: { years: 20, param: 30, label: '总动员令' },
    alliance: { years: 40, param: 0, label: '联盟令' },
    temple: { years: 60, param: 0, label: '信仰令' },
  };

  /** 颁布文明旨意（文明自行达成，可能失败） */
  issueDirective(civId: number, kind: DirectiveKind, param = 0, target?: number): Directive | null {
    const civ = this.civs[civId];
    if (!civ?.alive) return null;
    if (this.directives.filter((d) => d.civ === civId && d.status === 'active').length >= 2) return null;
    if (this.activeDirective(civId, kind)) return null;
    const meta = GameEngine.DIRECTIVE_META[kind];
    const p = param > 0 ? param : meta.param;
    const d: Directive = {
      id: this.dirSeq++, civ: civId, kind, target,
      param: p, status: 'active',
      startTick: this.tickCount,
      deadlineTick: meta.years > 0 ? this.tickCount + meta.years * YEAR_TICKS : 0,
      text: this.describeDirective(civ, kind, p, target),
    };
    this.directives.push(d);
    this.applyDirectiveImpulse(d, civ);
    this.addEvent('decree', d.text, { colorHex: civ.colorHex });
    this.toast(`「${civ.name}」奉神谕：${meta.label}`, 'info');
    return d;
  }

  describeDirective(civ: Civ, kind: DirectiveKind, p: number, target?: number): string {
    const years = GameEngine.DIRECTIVE_META[kind].years;
    const lim = years > 0 ? `（${years} 年内）` : '';
    const tn = target != null ? this.civs[target]?.name ?? '?' : '';
    switch (kind) {
      case 'annihilate': return `「${civ.name}」奉旨灭国：「${tn}」必须被从大地上抹去${lim}`;
      case 'conquer': return `「${civ.name}」奉旨攻城：王师须攻陷「${tn}」的王都${lim}`;
      case 'expand': return `「${civ.name}」奉旨扩张：领土须达 ${p} 格${lim}`;
      case 'wealth': return `「${civ.name}」奉旨富国：国库须达 ${p} 财富${lim}`;
      case 'wisdom': return `「${civ.name}」奉旨启智：知识须达 ${p}${lim}`;
      case 'populate': return `「${civ.name}」奉旨繁衍：人口须达 ${p}${lim}`;
      case 'legion': return `「${civ.name}」奉旨建军：须同时保有 ${p} 支现役军团${lim}`;
      case 'build': return `「${civ.name}」奉旨营建：房屋须达 ${p} 座${lim}`;
      case 'unify': return `「${civ.name}」奉旨统一：须成为这个世界唯一的强权`;
      case 'mobilize': return `「${civ.name}」奉旨总动员：全民皆兵，限期斩获 ${p} 名敌军${lim}`;
      case 'alliance': return `「${civ.name}」奉旨结盟：须与「${tn}」缔结盟好${lim}`;
      case 'temple': return `「${civ.name}」奉旨立信：须建成一座神殿${lim}`;
    }
  }

  /** 旨意颁布瞬间的文明行为驱动（让文明"自己去达成"） */
  applyDirectiveImpulse(d: Directive, civ: Civ) {
    switch (d.kind) {
      case 'annihilate': {
        if (d.target == null) break;
        // 圣战：神谕宣战（灭国战争——不死不休，攻方可能失败）
        const wd = this.declareWar(d.civ, d.target, 'holy', { total: true, goal: 0, force: true });
        if (wd) wd.giveUpAt = d.deadlineTick + 800;
        this.tryFormArmy(civ, d.target);
        break;
      }
      case 'conquer': {
        if (d.target == null) break;
        // 圣战：神谕宣战（目的=神谕战果 45 分，攻陷王都即达成）
        this.declareWar(d.civ, d.target, 'holy', { goal: 45, force: true });
        this.tryFormArmy(civ, d.target);
        break;
      }
      case 'mobilize': {
        civ.mobilizeUntil = this.tickCount + (d.deadlineTick - this.tickCount) * 0.8;
        let armed = 0;
        for (const u of this.units) {
          if (u.dead || u.civ !== civ.id) continue;
          const job = u.job ?? 0;
          if (job === 0 || job === 1 || job === 5) { this.setJob(u, 2); armed++; }
        }
        this.addEvent('war', `「${civ.name}」总动员！${armed} 名国民放下锄头拿起长剑`, { colorHex: civ.colorHex });
        break;
      }
      case 'legion': {
        civ.armyCd = 0;
        this.tryFormArmy(civ);
        if (this.civAtWar(civ.id)) this.tryFormArmy(civ);
        break;
      }
      case 'alliance': {
        if (d.target == null) break;
        const key = pairKey(d.civ, d.target);
        this.met.add(key);
        const cur = this.rel.get(key) ?? 0;
        if (cur < -20) this.makePeace(d.civ, d.target, `「${civ.name}」奉神谕与「${this.civs[d.target]?.name}」化干戈为玉帛`, 40);
        else this.rel.set(key, Math.max(cur, 45));
        // —— 联盟系统：神谕直接促成真联盟（攻守同盟实体，非数值友谊）——
        const t = this.civs[d.target];
        const myAl = this.allianceOfCiv(civ.id);
        const tAl = this.allianceOfCiv(d.target);
        if (t?.alive && !myAl && !tAl) this.formAlliance(civ.pop >= t.pop ? civ : t, civ.pop >= t.pop ? t : civ);
        else if (t?.alive && myAl && !tAl) this.joinAlliance(myAl, t);
        break;
      }
      default:
        break; // 扩张/富国/启智/人口/建城/统一/信仰：由各系统周期 hook 持续加成
    }
  }

  /** 旨意进度评估（每 30 tick） */
  directiveTick() {
    for (let i = this.directives.length - 1; i >= 0; i--) {
      const d = this.directives[i];
      if (d.status !== 'active') {
        // 已结算的旨意保留 200 tick 供 UI 展示后清理
        if (d.endTick != null && this.tickCount - d.endTick > 200) this.directives.splice(i, 1);
        continue;
      }
      const civ = this.civs[d.civ];
      if (!civ?.alive) { this.finishDirective(d, 'failed', `「${civ?.name ?? ''}」覆灭，宏图化为泡影`); continue; }
      const r = this.evalDirective(d, civ);
      if (r.done) { this.finishDirective(d, 'success', r.msg); continue; }
      if (d.deadlineTick > 0 && this.tickCount > d.deadlineTick) { this.finishDirective(d, 'failed', r.msg); continue; }
    }
  }

  /** 单条旨意条件评估：done=达成；msg=结算文案 */
  evalDirective(d: Directive, civ: Civ): { done: boolean; msg: string; progress?: number } {
    switch (d.kind) {
      case 'annihilate': {
        const t = d.target != null ? this.civs[d.target] : null;
        return { done: !t?.alive, msg: !t?.alive ? `「${t?.name}」已被从大地上抹去` : `期限已至，「${t?.name}」仍在顽抗，灭国宏业功亏一篑` };
      }
      case 'conquer': {
        const t = d.target != null ? this.civs[d.target] : null;
        if (!t?.alive) return { done: true, msg: `「${t?.name}」已亡国，王都早已易主` };
        const wd = this.warData.get(pairKey(d.civ, d.target!));
        const s = wd ? (wd.a === d.civ ? wd.scoreA : wd.scoreB) : 0;
        return { done: s >= 45, msg: s >= 45 ? `「${t.name}」的王都陷落了` : `期限已至，「${t.name}」的王都仍屹立不倒` };
      }
      case 'expand': {
        let tiles = 0;
        for (const i of civ.tiles) if (this.owner[i] === civ.id) tiles++;
        return { done: tiles >= d.param, msg: tiles >= d.param ? `领土已达 ${tiles} 格` : `期限已至，领土仅 ${tiles} 格（目标 ${d.param}）`, progress: Math.min(1, tiles / d.param) };
      }
      case 'wealth': {
        const g = civ.gold ?? 0;
        return { done: g >= d.param, msg: g >= d.param ? `国库充盈（${g} 财富）` : `期限已至，国库仅 ${g} 财富`, progress: Math.min(1, g / d.param) };
      }
      case 'wisdom': {
        const k = civ.knowledge ?? 0;
        return { done: k >= d.param, msg: k >= d.param ? `知识渊博（${k}）` : `期限已至，知识仅 ${k}`, progress: Math.min(1, k / d.param) };
      }
      case 'populate': {
        const p = Math.max(0, civ.pop);
        return { done: p >= d.param, msg: p >= d.param ? `人丁兴旺（${p} 人口）` : `期限已至，人口仅 ${p}`, progress: Math.min(1, p / d.param) };
      }
      case 'legion': {
        const n = this.armies.filter((a) => a.civ === civ.id).length;
        return { done: n >= d.param, msg: n >= d.param ? `${n} 支军团同时现役` : `期限已至，现役军团仅 ${n} 支`, progress: Math.min(1, n / d.param) };
      }
      case 'build': {
        const h = civ.houses;
        return { done: h >= d.param, msg: h >= d.param ? `城郭连绵（${h} 座房屋）` : `期限已至，房屋仅 ${h} 座`, progress: Math.min(1, h / d.param) };
      }
      case 'unify': {
        const done = this.victoryCiv === civ.id;
        return { done, msg: done ? `世界已归于「${civ.name}」的旌旗之下` : '统一大业未竟' };
      }
      case 'mobilize': {
        const kc = d.killCount ?? 0;
        return { done: kc >= d.param, msg: kc >= d.param ? `总动员战果辉煌（斩获 ${kc}）` : `动员期限已至，斩获仅 ${kc}`, progress: Math.min(1, kc / d.param) };
      }
      case 'alliance': {
        // 种族系统 v2 + 联盟系统：旨意的「缔结盟好」现在是真联盟（阵营实体）
        const t = d.target != null ? this.civs[d.target] : null;
        const me = this.civs[d.civ];
        if (t && me && t.alive && me.alive) {
          const myAl = this.allianceOfCiv(me.id);
          const tAl = this.allianceOfCiv(t.id);
          if (myAl && myAl.id === tAl?.id) {
            return { done: true, msg: `与「${t.name}」同叢「${myAl.name}」盟旗之下`, progress: 1 };
          }
          if (!myAl && !tAl && this.formAlliance(me.pop >= t.pop ? me : t, me.pop >= t.pop ? t : me)) {
            return { done: true, msg: `与「${t.name}」缔结了攻守同盟`, progress: 1 };
          }
          if (myAl && !tAl && this.joinAlliance(myAl, t)) {
            return { done: true, msg: `「${t.name}」加入了「${myAl.name}」`, progress: 1 };
          }
        }
        const v = d.target != null ? this.rel.get(pairKey(d.civ, d.target)) ?? -100 : -100;
        return { done: v >= 60, msg: v >= 60 ? `与「${this.civs[d.target ?? 0]?.name}」缔结盟好` : `期限已至，两国仍未同心（关系 ${Math.round(v)}）`, progress: Math.min(1, (v + 100) / 160) };
      }
      case 'temple': {
        const cnt = this.civBuildCounts.get(civ.id);
        const n = cnt ? cnt[BUILD_KINDS.TEMPLE] ?? 0 : 0;
        return { done: n > 0, msg: n > 0 ? '神殿落成，钟声悠扬' : '期限已至，神殿仍是空中楼阁', progress: Math.min(1, n) };
      }
    }
  }

  /** 旨意结算（成功=奖励；失败=惩罚） */
  finishDirective(d: Directive, status: 'success' | 'failed', msg: string) {
    if (d.status !== 'active') return;
    d.status = status;
    d.endTick = this.tickCount;
    d.endText = msg;
    const civ = this.civs[d.civ];
    if (civ?.alive) {
      if (status === 'success') {
        civ.gold = (civ.gold ?? 0) + 120;
        for (const a of this.armies) if (a.civ === civ.id) a.morale = Math.min(100, a.morale + 10);
        this.addEvent('decreeOk', `神谕达成：「${civ.name}」——${msg}（国库 +120）`, { colorHex: civ.colorHex });
        this.toast(`「${civ.name}」达成了${GameEngine.DIRECTIVE_META[d.kind].label}`, 'good');
      } else {
        civ.gold = Math.max(0, (civ.gold ?? 0) - 60);
        for (const a of this.armies) if (a.civ === civ.id) a.morale = Math.max(25, a.morale - 10);
        this.addEvent('decreeFail', `神谕落空：「${civ.name}」——${msg}`, { colorHex: civ.colorHex });
        this.toast(`「${civ.name}」未能达成${GameEngine.DIRECTIVE_META[d.kind].label}`, 'danger');
      }
    }
  }

  /** 旨意进度（stats 快照用） */
  directiveProgressOf(d: Directive): number {
    const civ = this.civs[d.civ];
    if (!civ) return 0;
    if (d.status !== 'active') return d.status === 'success' ? 1 : 0;
    const r = this.evalDirective(d, civ);
    return r.progress ?? (r.done ? 1 : 0);
  }

  warTick() {
    WBB.touchMeta(); // Stage 3：战争体系写 army 等 meta 列收口（保守）
    for (const key of this.met) {
      const v = this.rel.get(key) ?? 0;
      if (v < -20) {
        if (!this.laws.wars) {
          // 战争被禁止：神谕加速停火（神意凌驾于战争理由之上）
          if (this.rng() < 0.5) {
            const [a, b] = key.split('-').map(Number);
            const ca = this.civs[a];
            const cb = this.civs[b];
            this.rel.set(key, 30);
            this.totalWars.delete(key);
            this.warData.delete(key);
            if (ca?.alive && cb?.alive) {
              this.toast(`「${ca.name}」与「${cb.name}」停战了`, 'peace');
              this.addEvent('peace', `神谕止战：「${ca.name}」与「${cb.name}」签署停战协议`, { colorHex: ca.colorHex });
            }
          } else {
            this.rel.set(key, v + 6);
          }
        } else {
          // 交战期间：关系冻结——停战唯一途径=目的达成/无力支撑（warInfoTick 全权裁决）
          // 灭国战争仇恨缓慢固化；常规战争由战事活跃签名驱动仇恨（warInfoTick）
          if (this.totalWars.has(key)) this.rel.set(key, Math.max(-96, v - 0.5));
        }
      } else {
        this.totalWars.delete(key);
        const dash = key.indexOf('-');
        const a = +key.slice(0, dash);
        const b = +key.slice(dash + 1);
        const ca = this.civs[a];
        const cb = this.civs[b];
        // —— 边境摩擦：和平消化衰减 × 军国主义大国被动增压（扩张停滞的年代，野心仍在滋长） ——
        let ten = (this.tension.get(key) ?? 0) * ep('war.tensionDecay');
        const milPair = (ca?.militarism ?? 30) + (cb?.militarism ?? 30);
        if (milPair > 105) ten += (milPair - 105) * ep('war.milPressure'); // 双军国 ≥53：每轮注入（热参数）
        ten = Math.min(80, ten);
        this.tension.set(key, ten);
        // —— 和平水位：不再单向漂到 60 —— 军国主义高的两国关系自然冷淡；摩擦把水位压得更低
        const mil = ((ca?.militarism ?? 30) + (cb?.militarism ?? 30));
        const target = Math.max(8, 38 - mil / 8) + Math.min(16, ten * 0.18);
        if (v < target) this.rel.set(key, v + 1);
        else if (v > target + 8) this.rel.set(key, v - 1); // 过热关系回冷（盟友也会疏远）
        // —— 战端重燃：摩擦 + 军国主义 + 宿怨共同抬高概率（替代旧日的窄窗彩票） ——
        // 典型值：摩擦 20 + 军国 60 → ~3%/轮(5年)/对 → 一个世纪每对约五成开战 —— 活跃而不失控
        if (this.laws.wars && v < 45 && ca?.alive && cb?.alive && !this.warData.has(key)) {
          const grudge = v < -5 ? 0.02 : 0; // 宿怨余烬
          // —— 种族互连：好战种族的组合更易开战；同族相残更难（种族认同）——
          const raW = RACES[ca.race];
          const rbW = RACES[cb.race];
          const aggrMul = 0.7 + ((raW?.aggr ?? 0.5) + (rbW?.aggr ?? 0.5)) / 2 * 0.6;
          const sameRace = ca.race === cb.race ? 0.55 : 1;
          // —— 种族关系底色：世仇种族的王国更易开战（精灵与兽人的边境从不安静）——
          const rr = ca.race === cb.race ? 0 : this.raceRelOf(ca.race, cb.race);
          const rrMul = rr < -30 ? 1.35 : rr > 30 ? 0.75 : 1;
          // —— 大灾不兴刀兵：受灾国（首都近灾点且灾后 100 tick 内）短期免遭落井下石 ——
          let catastMul = 1;
          if (this.tickCount - this.lastCatastrophe.tick < 100) {
            for (const c of [ca, cb]) {
              if (c && c.capital >= 0 && Math.hypot(this.tileX(c.capital) - this.lastCatastrophe.x, this.tileY(c.capital) - this.lastCatastrophe.y) < 12) { catastMul = 0.3; break; }
            }
          }
          const p = (0.008 + ten * 0.0011 + mil * 0.00007 + grudge) * aggrMul * sameRace * rrMul * catastMul * ep('war.declareRate');
          if (this.rng() < p) {
            const pick = this.pickCasus(ca, cb);
            // 节奏阀：每文明十年内至多主动挑起一场新战争（防连环开战的混战地狱）
            const now = this.tickCount;
            if (now - (this.lastDeclareAt.get(pick.aggressor.id) ?? -9e9) > 400) {
              this.lastDeclareAt.set(pick.aggressor.id, now);
              this.declareWar(pick.aggressor.id, pick.victim.id, pick.reason);
              this.tension.set(key, Math.max(0, ten - 25)); // 宣战泄压
            }
          }
        }
      }
    }
    // —— 涌现武器常规发射（非大战期：交战国小概率动用在役涌现设计） ——
    if (this.emergentWeapons.size > 0) {
      for (const c of this.civs) {
        if (!c.alive || !this.civAtWar(c.id)) continue;
        const em = [...this.emergentWeapons.values()].filter((x) => !x.retired && x.civ === c.id);
        if (em.length > 0 && this.rng() < 0.12) {
          this.fireEmergent(c, em[Math.floor(this.rng() * em.length)]);
        }
      }
    }
  }

  // ================== 联盟系统（Alliance System）：阵营实体 ==================
  // 结盟：高关系 + 种族外交亲和 + 共同威胁 → 阵营实体（集体防御/联军出击/阵营停战/知识扩散/贸易加成/经济互助）
  // 凝聚力：成员关系/共同敌人/天灾同仇/军人干政/贸易活跃/理念分歧共同塑造 —— <25 名存实亡

  /** 种族关系读取（预设基线 + 动态漂移合并；同族 = 45 认同） */
  raceRelOf(a: number, b: number): number {
    if (a === b) return 45;
    const key = pairKey(a, b);
    return this.raceRel.get(key) ?? RACE_REL_BASE[key] ?? 0;
  }

  /** 种族关系漂移（clamp -80..80）：战争撕裂/贸易亲善/联盟交融的外交底色 */
  shiftRaceRel(a: number, b: number, dv: number) {
    if (a === b) return;
    const key = pairKey(a, b);
    const cur = this.raceRel.get(key) ?? RACE_REL_BASE[key] ?? 0;
    this.raceRel.set(key, Math.max(-80, Math.min(80, cur + dv)));
  }

  /** 文明所属联盟（null = 无） */
  allianceOfCiv(civId: number): Alliance | null {
    const id = this.allianceOf.get(civId);
    if (id == null) return null;
    return this.alliances.find((al) => al.id === id) ?? null;
  }

  /** 联盟命名：盟主首都方位 × 本质词（北境同盟/南疆公约/东海誓约/西陲协定/中原联盟） */
  allianceNameFor(leader: Civ): string {
    let region = '中原';
    if (leader.capital >= 0) {
      const dx = this.tileX(leader.capital) / W - 0.5;
      const dy = this.tileY(leader.capital) / H - 0.5;
      if (Math.abs(dx) < 0.16 && Math.abs(dy) < 0.16) region = '中原';
      else if (Math.abs(dy) >= Math.abs(dx)) region = dy < 0 ? '北境' : '南疆';
      else region = dx < 0 ? '西陲' : '东海';
    }
    const essence = ['同盟', '公约', '誓约', '协定', '协约', '阵营'][Math.floor(this.rng() * 6)];
    return `${region}${essence}`;
  }

  /** 缔结联盟（a 为发起者/首任盟主） */
  formAlliance(a: Civ, b: Civ): Alliance | null {
    if (this.allianceOf.has(a.id) || this.allianceOf.has(b.id)) return null;
    if (this.alliances.length >= 4) return null;
    const al: Alliance = {
      id: this.allianceSeq++,
      name: this.allianceNameFor(a),
      members: [a.id, b.id],
      leader: a.id,
      cohesion: 55,
      formedTick: this.tickCount,
      formedYear: Math.floor(this.yearF),
      warsTogether: 0,
      colorHex: ALLIANCE_COLORS[(this.allianceSeq - 2) % ALLIANCE_COLORS.length],
    };
    this.alliances.push(al);
    this.allianceOf.set(a.id, al.id);
    this.allianceOf.set(b.id, al.id);
    // 成员关系即刻升温（盟约即承诺）
    this.rel.set(pairKey(a.id, b.id), Math.max(60, this.rel.get(pairKey(a.id, b.id)) ?? 0));
    this.met.add(pairKey(a.id, b.id));
    // 跨种族结盟 → 两个种族对彼此的看法缓改善（种族互连）
    this.shiftRaceRel(a.race, b.race, 9);
    this.addEvent('alliance', `「${a.name}」与「${b.name}」缔结「${al.name}」——攻守同盟，荣辱与共`, {
      colorHex: al.colorHex,
      x: a.capital >= 0 ? this.tileX(a.capital) : undefined,
      y: a.capital >= 0 ? this.tileY(a.capital) : undefined,
    });
    this.toast(`「${al.name}」成立`, 'good');
    this.onSound?.('heal');
    if (this.overlayMode === 'alliance') this.overlayDirty = true;
    return al;
  }

  /** 加入联盟（种族世仇审查：与盟主种族关系 < -35 的种族难以入盟） */
  joinAlliance(al: Alliance, c: Civ): boolean {
    if (al.members.length >= 5 || this.allianceOf.has(c.id)) return false;
    const leader = this.civs[al.leader];
    if (!leader?.alive) return false;
    const rr = this.raceRelOf(c.race, leader.race);
    if (rr < -35) {
      if (this.rng() < 0.7) {
        this.addEvent('alliance', `「${c.name}」申请加入「${al.name}」被拒——千年的种族世仇不是一纸盟约能化解的`, { colorHex: al.colorHex });
        return false;
      }
    }
    al.members.push(c.id);
    this.allianceOf.set(c.id, al.id);
    for (const m of al.members) {
      if (m === c.id) continue;
      const mc = this.civs[m];
      if (!mc?.alive) continue;
      const k = pairKey(m, c.id);
      this.rel.set(k, Math.max(52, this.rel.get(k) ?? 0));
      this.shiftRaceRel(mc.race, c.race, 4);
      this.met.add(k);
    }
    this.addEvent('alliance', `「${c.name}」加入「${al.name}」——盟旗之下多了一支力量`, {
      colorHex: al.colorHex,
      x: c.capital >= 0 ? this.tileX(c.capital) : undefined,
      y: c.capital >= 0 ? this.tileY(c.capital) : undefined,
    });
    if (this.overlayMode === 'alliance') this.overlayDirty = true;
    return true;
  }

  /** 退出联盟（quit 自退 / betray 对盟友开战叛离 / fallen 灭国除名） */
  leaveAlliance(civId: number, cause: 'quit' | 'betray' | 'fallen') {
    const al = this.allianceOfCiv(civId);
    if (!al) return;
    al.members = al.members.filter((m) => m !== civId);
    this.allianceOf.delete(civId);
    const c = this.civs[civId];
    if (cause === 'betray') {
      al.cohesion = Math.max(0, al.cohesion - 22);
      for (const m of al.members) {
        const mc = this.civs[m];
        if (!mc?.alive) continue;
        const k = pairKey(m, civId);
        this.rel.set(k, Math.min(-30, this.rel.get(k) ?? 0));
      }
      if (c?.alive) {
        this.addEvent('alliance', `「${c.name}」对盟友刀兵相向，被逐出「${al.name}」——盟约的背叛者将无人再信`, { colorHex: '#f87171' });
        this.toast(`「${c.name}」叛盟`, 'danger');
      }
    } else if (cause === 'quit' && c?.alive) {
      al.cohesion = Math.max(0, al.cohesion - 8);
      this.addEvent('alliance', `「${c.name}」宣布退出「${al.name}」，独自面对乱世`, { colorHex: al.colorHex });
    }
    if (al.members.length < 2) {
      this.dissolveAlliance(al, `「${al.name}」成员星散，盟约黯然作废`);
    }
  }

  /** 联盟解散 */
  dissolveAlliance(al: Alliance, text: string) {
    for (const m of al.members) this.allianceOf.delete(m);
    this.allianceWarCd.delete(al.id);
    this.alliances = this.alliances.filter((x) => x.id !== al.id);
    this.addEvent('alliance', text, { colorHex: al.colorHex });
    if (this.overlayMode === 'alliance') this.overlayDirty = true;
  }

  /** 联盟主循环（每 300 tick ≈ 7.5 年）：对账 → 结盟 → 扩员 → 凝聚力 → 经济互助 → 种族关系漂移 */
  allianceTick() {
    // —— ① 对账：灭亡成员除名 + 盟主继任 + 成员互战判叛 ——
    for (const al of [...this.alliances]) {
      for (const m of [...al.members]) {
        const c = this.civs[m];
        if (!c?.alive || c.pop <= 0) this.leaveAlliance(m, 'fallen');
      }
      if (!this.alliances.includes(al)) continue;
      // 成员互战：挑起方（军国主义更高者）被判叛徒逐出
      for (let i = 0; i < al.members.length; i++) {
        for (let j = i + 1; j < al.members.length; j++) {
          const x = al.members[i];
          const y = al.members[j];
          if (!this.atWar(x, y)) continue;
          const cx = this.civs[x];
          const cy = this.civs[y];
          const traitor = (cx?.militarism ?? 30) >= (cy?.militarism ?? 30) ? x : y;
          this.leaveAlliance(traitor, 'betray');
        }
      }
      if (!this.alliances.includes(al)) continue;
      if (!al.members.includes(al.leader)) {
        let best = al.members[0];
        let bestPop = -1;
        for (const m of al.members) {
          const c = this.civs[m];
          if (c && c.pop > bestPop) { bestPop = c.pop; best = m; }
        }
        al.leader = best;
        this.addEvent('alliance', `「${al.name}」盟主易位，「${this.civs[best]?.name ?? '?'}」执掌盟务`, { colorHex: al.colorHex });
      }
    }
    const alive = this.civs.filter((c) => c.alive && c.pop > 0);
    // —— ② 新联盟诞生：高关系 + 种族外交亲和 + 共同敌人（3 倍加成）+ 大灾同病相怜 ——
    if (this.alliances.length < 4 && alive.length >= 2) {
      const free = alive.filter((c) => !this.allianceOf.has(c.id));
      for (let i = 0; i < free.length && this.alliances.length < 4; i++) {
        for (let j = i + 1; j < free.length; j++) {
          const ca = free[i];
          const cb = free[j];
          if (this.allianceOf.has(ca.id) || this.allianceOf.has(cb.id)) continue;
          const key = pairKey(ca.id, cb.id);
          if (!this.met.has(key)) continue;
          const v = this.rel.get(key) ?? 0;
          if (v < 55 || this.atWar(ca.id, cb.id)) continue;
          const ra = RACES[ca.race];
          const rb = RACES[cb.race];
          if (!ra || !rb) continue;
          const diploMul = 0.5 + ((ra.diplo ?? 0.5) + (rb.diplo ?? 0.5)) / 2;
          // 共同敌人：两国正与同一第三国交战（同仇敌忾是结盟最强催化剂）
          const commonFoe = [...this.warData.values()].some((wd) => (this.atWar(ca.id, wd.a) && this.atWar(cb.id, wd.a)) || (this.atWar(ca.id, wd.b) && this.atWar(cb.id, wd.b)));
          // 大灾同病相怜：近 250 tick 内世界刚遭大灾
          const catast = this.tickCount - this.lastCatastrophe.tick < 250;
          let p = 0.05 * diploMul * (commonFoe ? 3.2 : 1) * (catast ? 1.6 : 1);
          if (this.rng() < p) {
            const leader = ca.pop >= cb.pop ? ca : cb;
            const other = leader === ca ? cb : ca;
            this.formAlliance(leader, other);
            break; // 本轮一个新联盟足矣（防一夜之间全球站队）
          }
        }
      }
    }
    // —— ③ 扩员：联盟邀请关系良好的无盟国（种族世仇审查在 joinAlliance 内） ——
    for (const al of this.alliances) {
      if (al.members.length >= 5) continue;
      const leader = this.civs[al.leader];
      if (!leader?.alive) continue;
      for (const c of alive) {
        if (al.members.length >= 5) break;
        if (this.allianceOf.has(c.id) || al.members.includes(c.id)) continue;
        const v = this.rel.get(pairKey(al.leader, c.id)) ?? 0;
        if (v < 45) continue;
        // 至少一半现有成员对候选者非敌意
        let okCount = 0;
        for (const m of al.members) if ((this.rel.get(pairKey(m, c.id)) ?? 0) > 5) okCount++;
        if (okCount < Math.ceil(al.members.length / 2)) continue;
        const rd = RACES[c.race];
        const p = 0.05 * (0.5 + (rd?.diplo ?? 0.5));
        if (this.rng() < p) this.joinAlliance(al, c);
      }
    }
    // —— ④ 凝聚力结算：成员关系/共同敌人/天灾同仇/军人干政/贸易活跃/理念分歧 ——
    let dragons = 0;
    for (const u of this.units) if (!u.dead && u.race === R.DRAGON) dragons++;
    for (const al of [...this.alliances]) {
      const ms = al.members.map((m) => this.civs[m]).filter((c): c is Civ => !!c?.alive);
      if (ms.length < 2) continue;
      let dh = 0.5; // 存在即巩固
      let relSum = 0;
      let relN = 0;
      for (let i = 0; i < ms.length; i++) {
        for (let j = i + 1; j < ms.length; j++) {
          relSum += this.rel.get(pairKey(ms[i].id, ms[j].id)) ?? 0;
          relN++;
        }
      }
      const relAvg = relN > 0 ? relSum / relN : 50;
      if (relAvg < 30) dh -= 1.5; // 貌合神离
      // 共同敌人：≥2 成员与同一敌国交战 → 同仇敌忾
      let common = false;
      for (const wd of this.warData.values()) {
        let n = 0;
        for (const m of ms) if (this.atWar(m.id, wd.a) || this.atWar(m.id, wd.b)) n++;
        if (n >= 2) { common = true; break; }
      }
      if (common) dh += 0.8; // 同仇敌忾
      if (dragons > 0 || this.zombieOutbreakNoted) dh += 0.5; // 巨龙/亡灵天灾下的同仇敌忾
      const milAvg = ms.reduce((s, c) => s + (c.militarism ?? 30), 0) / ms.length;
      if (milAvg > 60) dh -= 0.8; // 军人干政：黩武盟友难约束
      // 盟内贸易活跃 → 商缘即盟缘
      let tradeN = 0;
      for (const u of this.units) {
        if (u.dead || (u.caravan ?? 0) <= 0) continue;
        if (al.members.includes(u.civ) && al.members.includes(u.caravan!)) tradeN++;
      }
      if (tradeN > 0) dh += 0.4;
      // 理念分歧：军功爵（mil>0.3）拉低 / 偃武（mil<-0.2）提振
      for (const m of ms) {
        const im = this.ideaModsOf(m.id);
        if (im.mil > 0.3) dh -= 0.15;
        if (im.mil < -0.2) dh += 0.15;
      }
      al.cohesion = Math.max(0, Math.min(100, al.cohesion + dh));
      // —— 袍泽纽带（Task 34 去虚务实）：共战 3 次解锁阵营红利——
      //    盟内贸易再 +10%/研究扩散再 +12%：血战淬炼的信任落到实处，共战次数不再只是摆设数字
      if (al.warsTogether >= 3 && !al.bonded) {
        al.bonded = true;
        al.cohesion = Math.min(100, al.cohesion + 8);
        this.addEvent('alliance', `「${al.name}」的盟军在血与火中淬炼出袍泽纽带——盟内商路与学术交流全面深化`, { colorHex: al.colorHex });
        this.toast(`「${al.name}」缔结袍泽纽带`, 'good');
      }
      if (al.cohesion < 25 && this.rng() < 0.3) {
        this.dissolveAlliance(al, `「${al.name}」凝聚力涣散、貌合神离，盟约名存实亡`);
      }
    }
    // —— ⑤ 经济互助：金库见底的成员获得富盟友雪中送炭 ——
    for (const al of this.alliances) {
      for (const m of al.members) {
        const c = this.civs[m];
        if (!c?.alive || (c.gold ?? 0) >= 30) continue;
        const rich = al.members
          .map((x) => this.civs[x])
          .find((x) => x?.alive && (x.gold ?? 0) > 200);
        if (rich && this.rng() < 0.4) {
          rich.gold = (rich.gold ?? 0) - 15;
          c.gold = (c.gold ?? 0) + 15;
          this.addEvent('trade', `「${rich.name}」雪中送炭：15 金驰援困顿的盟邦「${c.name}」`, { colorHex: al.colorHex });
        }
      }
    }
    // —— ⑥ 种族关系漂移：盟内跨种族交融 +0.15/轮（文化均 >80 额外 +0.1）；交战种族 -0.3/轮 ——
    for (const al of this.alliances) {
      for (let i = 0; i < al.members.length; i++) {
        for (let j = i + 1; j < al.members.length; j++) {
          const cx = this.civs[al.members[i]];
          const cy = this.civs[al.members[j]];
          if (!cx?.alive || !cy?.alive || cx.race === cy.race) continue;
          const cultured = (cx.culture ?? 0) > 80 && (cy.culture ?? 0) > 80;
          this.shiftRaceRel(cx.race, cy.race, 0.15 + (cultured ? 0.1 : 0));
        }
      }
    }
    for (const wd of this.warData.values()) {
      const ca = this.civs[wd.a];
      const cb = this.civs[wd.b];
      if (ca?.alive && cb?.alive && ca.race !== cb.race) this.shiftRaceRel(ca.race, cb.race, -0.3);
    }
  }

  victoryTick() {
    const alive = this.civs.filter((c) => c.alive && c.pop > 0);
    if (alive.length > 1) this.multiCivSeen = true;
    if (this.multiCivSeen && alive.length === 1 && this.victoryCiv === null) {
      this.victoryCiv = alive[0].id;
      this.toast(`世界已被「${alive[0].name}」统一!`, 'good');
      this.addEvent('unify', `世界已被「${alive[0].name}」（${RACES[alive[0].race].name}）统一，历史翻开了新的一页`, { colorHex: alive[0].colorHex });
    }
  }

  // ================== 终极世界大战（Ultimate World War） ==================
  // 开发者模式引燃：全部在世国家互宣死战，直到只剩一国或全部灭亡；中途可暂时停战（自动到期重燃）。

  /** 大战中仍在世的参战国 */
  wwAliveBelligerents(): Civ[] {
    return this.worldWar.belligerents
      .map((id) => this.civs[id])
      .filter((c): c is Civ => !!c && c.alive && c.pop > 0);
  }

  /** 是否为大战参战国（running 阶段） */
  wwIsBelligerent(civId: number): boolean {
    return this.worldWar.phase === 'running' && this.worldWar.belligerents.includes(civId);
  }

  /** 引燃终极世界大战 */
  devUltimateWar(): boolean {
    if (this.worldWar.phase === 'running') return false;
    const alive = this.civs.filter((c) => c.alive && c.pop > 0);
    if (alive.length < 2) {
      this.toast('世上王国不足两个，无从点燃世界大战', 'info');
      return false;
    }
    this.worldWar = {
      phase: 'running',
      startTick: this.tickCount,
      startYear: Math.floor(this.yearF),
      endTick: 0,
      belligerents: alive.map((c) => c.id),
      pop0: Object.fromEntries(alive.map((c) => [c.id, c.pop])),
      kills: 0,
      fallen: [],
      truces: 0,
      nukes: 0,
      lasers: 0,
      drones: 0,
      orbitals: 0,
      plasmas: 0,
      antimatters: 0,
      emerged: 0,
      winner: null,
      endText: '',
    };
    this.wwTruce.clear();
    // —— 联盟阵营化：盟友不互相宣战（阵营对峙取代全员互殴）；无联盟才退回全员互战 ——
    let n = 0;
    let blocKept = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const alI = this.allianceOfCiv(alive[i].id);
        if (alI && alI.members.includes(alive[j].id)) { blocKept++; continue; } // 同盟不战
        if (this.declareWar(alive[i].id, alive[j].id, 'annex', { force: true, total: true, quiet: true })) n++;
      }
    }
    this.addEvent('worldwar', `终极世界大战爆发！${alive.length} 个王国卷入战火${blocKept > 0 ? `——${blocKept} 对盟友暂守盟约（阵营对峙）` : '——不死不休，直至只剩一国或全部覆灭'}`, { colorHex: '#ff4d4d' });
    this.toast(`终极世界大战爆发：${n} 条战线同时点燃`, 'war');
    this.shake = Math.max(this.shake, 10);
    this.statsTick();
    return true;
  }

  /** 大战主循环（每 30 tick）：终局判定 → 停战到期重启 → 战端重燃 → 现代武器部署 */
  worldWarTick() {
    WBB.touchMeta(); // Stage 3：终局战争写 meta 列收口（保守）
    const ww = this.worldWar;
    // —— 自然引燃（Task 34 去虚务实）：火器时代以后，多国长期混战有概率失控升级为世界大战 ——
    //    核弹/轰炸机/轨道炮不再只活在开发者面板：文明自己会走到这一步（连年混战 + 军备竞赛）
    if (ww.phase !== 'running' && this.laws.wars && this.tickCount - this.wwIgniteTick >= 400) {
      this.wwIgniteTick = this.tickCount;
      const sinceEnd = ww.phase === 'ended' ? this.tickCount - ww.endTick : Infinity;
      if (sinceEnd > 1600) { // 大战余烬冷却 40 年
        const aliveW = this.civs.filter((c) => c.alive && c.pop > 0);
        const armed = aliveW.filter((c) => this.armamentOf(c) >= 4);
        let activeWars = 0;
        for (const _wd of this.warData.values()) activeWars++;
        // 引燃的火药桶三形态（满足其一即是失控前兆）：
        // ① 多线开战（activeWars ≥ 2） ② 战端频仍（近 40 年宣战 ≥3） ③ 长期消耗战 + 列强军国狂热（堑壕战泥潭）
        const recentWars = this.warHistory.filter((t) => this.tickCount - t <= 1600).length;
        let longWar = false;
        for (const wd of this.warData.values()) {
          if (this.tickCount - wd.startTick >= 600) { longWar = true; break; }
        }
        const milHot = armed.length > 0 && armed.reduce((s, c) => s + (c.militarism ?? 30), 0) / armed.length >= 50;
        if (aliveW.length >= 3 && armed.length >= 2 && (activeWars >= 2 || recentWars >= 3 || (longWar && milHot)) && this.yearF > 80 && this.rng() < 0.16) {
          if (this.devUltimateWar()) {
            this.addEvent('worldwar', `世界滑向深渊——列强的军备竞赛与连年混战终于失控，战火燃遍全球`, { colorHex: '#ff4d4d' });
          }
        }
      }
    }
    if (ww.phase !== 'running') return;
    const alive = this.wwAliveBelligerents();
    // —— 终局：只剩一国（胜者）或全部灭亡（同归于尽）——
    if (alive.length <= 1) {
      this.endWorldWar(alive[0] ?? null);
      return;
    }
    // —— 联盟终局：所有存活参战国同属一个联盟 → 阵营胜利（大战结束，盟主代领战功）——
    const firstAl = this.allianceOfCiv(alive[0].id);
    if (firstAl && alive.every((c) => this.allianceOfCiv(c.id)?.id === firstAl.id)) {
      const leader = this.civs[firstAl.leader];
      ww.phase = 'ended';
      ww.endTick = this.tickCount;
      ww.winner = leader?.id ?? null;
      ww.endText = `「${firstAl.name}」以阵营之姿终结了大战——第 ${Math.max(0, Math.floor(this.yearF) - ww.startYear)} 年，盟旗插遍了废墟`;
      this.addEvent('worldwar', `终极世界大战终局：「${firstAl.name}」的同盟笑到了最后——阵营协作击败了所有孤军`, { colorHex: firstAl.colorHex });
      this.toast(`大战结束——「${firstAl.name}」阵营胜利`, 'good');
      this.wwTruce.clear();
      for (const m of firstAl.members) {
        const mc = this.civs[m];
        if (mc?.alive) { firstAl.cohesion = Math.min(100, firstAl.cohesion + 15); break; }
      }
      this.statsTick();
      return;
    }
    // —— 停战到期：战端重启 ——
    let resumed = 0;
    for (const [key, until] of [...this.wwTruce.entries()]) {
      if (this.tickCount < until) continue;
      this.wwTruce.delete(key);
      const dash = key.indexOf('-');
      const a = +key.slice(0, dash);
      const b = +key.slice(dash + 1);
      if (!this.civs[a]?.alive || !this.civs[b]?.alive) continue;
      this.declareWar(a, b, 'annex', { force: true, total: true, quiet: true });
      resumed++;
    }
    if (resumed > 0 && this.rng() < 0.6) {
      this.addEvent('worldwar', `停战期满，${resumed} 条战线重燃战火——大战没有出口，只有终局`, { colorHex: '#ff4d4d' });
    }
    // —— 战端重燃：既未交战也未停战的参战对 → 强制宣战（任何和平途径都被推翻）——
    // 联盟阵营化：同联盟不重燃（阵营是大战中的秩序孤岛）；终局狂热（存活≤3）时盟约撕裂 —— 末日之下，盟约成了废纸
    const wwFrenzy = alive.length <= 3;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const key = pairKey(alive[i].id, alive[j].id);
        if (this.wwTruce.has(key) || this.atWar(alive[i].id, alive[j].id)) continue;
        const alI = this.allianceOfCiv(alive[i].id);
        if (!wwFrenzy && alI && alI.members.includes(alive[j].id)) continue;
        if (wwFrenzy && alI && alI.members.includes(alive[j].id)) {
          this.dissolveAlliance(alI, `终局狂热之下，「${alI.name}」的盟友们反目成仇——末日面前，盟约成了废纸`);
        }
        this.declareWar(alive[i].id, alive[j].id, 'annex', { force: true, total: true, quiet: true });
      }
    }
    // —— 现代武器部署（工业时代军备的国家倾泻火力）——
    this.wwWeaponsTick(alive);
  }

  /** 大战期间的武器部署：现代（火炮/空袭/导弹/核） + 未来（激光/蜂群/轨道/等离子/反物质）
   *  终局狂热（存活 ≤ 3 国）：武器频率翻倍 + 反物质解禁 */
  wwWeaponsTick(alive: Civ[]) {
    // —— 终局狂热：最后的三强倾尽武库（每轮大战只播报一次）——
    const frenzy = alive.length <= 3;
    if (frenzy && this.wwFrenzyAnnounced !== this.worldWar.startTick) {
      this.wwFrenzyAnnounced = this.worldWar.startTick;
      this.addEvent('worldwar', `终局狂热——仅存的三强倾尽武库，反物质武器解禁，毁灭不再有禁忌`, { colorHex: '#ff4d4d' });
      this.toast('终局狂热：反物质武器解禁', 'danger');
    }
    const rate = frenzy ? 2 : 1;
    for (const c of alive) {
      const tm = this.techModsOf(c.id);
      if (tm.arty <= 0 && tm.bomber <= 0 && tm.nukeCap <= 0 && tm.laser <= 0 && tm.drone <= 0 && tm.orbital <= 0 && tm.plasma <= 0 && tm.antiMatter <= 0) continue;
      const foes = alive.filter((o) => o.id !== c.id);
      if (foes.length === 0) continue;
      const foe = foes[Math.floor(this.rng() * foes.length)];
      const tgtTile = foe.capital >= 0 ? foe.capital : foe.tiles[0] ?? -1;
      // —— 反物质打击（天启：仅终局狂热阶段解禁，全局冷却 30 年）——
      if (tm.antiMatter > 0 && frenzy && tgtTile >= 0 && this.tickCount - this.wwLastAntiTick > GameEngine.WW_ANTI_CD && this.rng() < 0.12) {
        this.wwLastAntiTick = this.tickCount;
        this.worldWar.antimatters++;
        const tx = this.tileX(tgtTile) + 0.5;
        const ty = this.tileY(tgtTile) + 0.5;
        this.launchAntimatter(c, tx, ty);
        this.addEvent('superweapon', `⚠ 湮灭警报——「${c.name}」的反物质弹升空，目标：「${foe.name}」的心脏，接触即湮灭`, { colorHex: c.colorHex, x: tx, y: ty });
        continue;
      }
      // —— 轨道天罚（天基动能钨棒：大威力爆破 + 地形焦化）——
      if (tm.orbital > 0 && tgtTile >= 0 && this.rng() < 0.08 * rate) {
        this.worldWar.orbitals++;
        const tx = this.tileX(tgtTile) + 0.5;
        const ty = this.tileY(tgtTile) + 0.5;
        this.launchOrbital(c, tx, ty);
        this.addEvent('superweapon', `「${c.name}」的轨道天基平台亮起——钨棒脱离轨道，坠向「${foe.name}」`, { colorHex: c.colorHex, x: tx, y: ty });
        continue;
      }
      // —— 等离子炮（大威力 + 电磁脉冲击溃士气）——
      if (tm.plasma > 0 && tgtTile >= 0 && this.rng() < 0.12 * rate) {
        this.worldWar.plasmas++;
        const tx = this.tileX(tgtTile) + 0.5;
        const ty = this.tileY(tgtTile) + 0.5;
        this.launchPlasma(c, tx, ty);
        this.addEvent('superweapon', `「${c.name}」的等离子炮充能完毕——电浆光球划破长空`, { colorHex: c.colorHex, x: tx, y: ty });
        continue;
      }
      // —— 无人机蜂群（自主游猎扫射）——
      if (tm.drone > 0 && tgtTile >= 0 && this.rng() < 0.16 * rate) {
        this.worldWar.drones++;
        this.launchDroneSwarm(c, this.tileX(tgtTile) + 0.5, this.tileY(tgtTile) + 0.5);
        this.addEvent('superweapon', `「${c.name}」的无人机蜂群升空——自主游猎，杀向「${foe.name}」纵深`, { colorHex: c.colorHex });
        continue;
      }
      // —— 激光炮台（高频精确狙杀，无冷却限制）——
      if (tm.laser > 0 && this.rng() < 0.3 * rate) {
        this.worldWar.lasers++;
        this.launchLaser(c, foe);
        continue;
      }
      // —— 核打击（终局武器：全局冷却 15 年 + 概率发射）——
      if (tm.nukeCap > 0 && tgtTile >= 0 && this.tickCount - this.wwLastNukeTick > GameEngine.WW_TRUCE_TICKS && this.rng() < 0.06 * rate) {
        this.wwLastNukeTick = this.tickCount;
        this.worldWar.nukes++;
        const tx = this.tileX(tgtTile) + 0.5;
        const ty = this.tileY(tgtTile) + 0.5;
        this.launchMissile(c, tx, ty, 1.8);
        this.addEvent('worldwar', `「${c.name}」的核导弹拖着尾焰升空——目标：「${foe.name}」的心脏`, { colorHex: c.colorHex, x: tx, y: ty });
        continue;
      }
      // —— 常规导弹打击（现代军备级）——
      if (tm.arty > 0 && this.armamentOf(c) >= 5 && tgtTile >= 0 && this.rng() < 0.06 * rate) {
        this.launchMissile(c, this.tileX(tgtTile) + 0.5, this.tileY(tgtTile) + 0.5, 0);
        continue;
      }
      // —— 空袭轰炸 ——
      if (tm.bomber > 0 && tgtTile >= 0 && this.rng() < 0.08 * rate) {
        this.launchAirstrike(c, this.tileX(tgtTile) + 0.5, this.tileY(tgtTile) + 0.5);
        continue;
      }
      // —— 火炮轰击（对敌境建筑与军队）——
      if (tm.arty > 0 && this.rng() < 0.25 * rate) {
        this.launchArtillery(c, foe);
      }
      // —— 涌现武器（架构化：供能组件决定射击节奏——奇点供能射得欢，化学装药慢工细活）——
      const em = [...this.emergentWeapons.values()].filter((x) => !x.retired && x.civ === c.id);
      for (const x of em) {
        const cad = GameEngine.WC_POWER[x.pw ?? 0].cadence * ((x.q?.[3] ?? 1));
        if (this.rng() < 0.11 * rate * cad) {
          this.fireEmergent(c, x);
          break; // 每国每轮至多一次涌现打击（防弹幕洗屏）
        }
      }
    }
  }

  /** 终局结算：胜者通吃 / 同归于尽 / 神谕中止 */
  endWorldWar(winner: Civ | null, divine = false) {
    const ww = this.worldWar;
    ww.phase = 'ended';
    ww.endTick = this.tickCount;
    ww.winner = winner?.id ?? null;
    const years = Math.max(0, Math.floor(this.yearF) - ww.startYear);
    if (divine) {
      ww.endText = `神谕降临，大战被强行中止——第 ${years} 年，没有胜者，只有废墟`;
      this.addEvent('worldwar', `神谕终止了终极世界大战：${ww.belligerents.length} 国混战 ${years} 年，战火被神意掐灭`, { colorHex: '#ffd93d' });
      this.toast('终极世界大战被神谕终止', 'info');
    } else if (winner) {
      ww.endText = `「${winner.name}」笑到了最后——第 ${years} 年，战火燃尽，世界归于一面旗帜之下`;
      this.addEvent('worldwar', `终极世界大战终局：${ww.belligerents.length} 国混战 ${years} 年，「${winner.name}」踏着 ${ww.fallen.length} 面倒下的旗帜统一了世界`, { colorHex: winner.colorHex });
      this.toast(`终极世界大战结束——「${winner.name}」赢得了一切`, 'good');
    } else {
      ww.endText = `同归于尽——第 ${years} 年，最后一个参战国也倒下了，只余焦土与寂静`;
      this.addEvent('worldwar', `终极世界大战终局：${ww.belligerents.length} 国混战 ${years} 年，同归于尽——世上再无参战国`, { colorHex: '#ff4d4d' });
      this.toast('终极世界大战结束——所有参战国同归于尽', 'danger');
    }
    this.wwTruce.clear();
    this.shake = Math.max(this.shake, 8);
    this.statsTick();
  }

  /** 开发者：大战强制全球停战 N 年（战火仅是暂息——到期自动重燃） */
  devWwTruce(years = 12): number {
    if (this.worldWar.phase !== 'running') return 0;
    const alive = this.wwAliveBelligerents();
    let n = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const key = pairKey(alive[i].id, alive[j].id);
        this.wwTruce.set(key, this.tickCount + Math.max(40, Math.round(years * YEAR_TICKS)));
        if (this.atWar(alive[i].id, alive[j].id)) {
          this.makePeace(alive[i].id, alive[j].id, `全球停战令：「${alive[i].name}」与「${alive[j].name}」收兵入营，枕戈待旦`, 10);
        }
        n++;
      }
    }
    this.worldWar.truces++;
    this.addEvent('worldwar', `全球停战令下达——战火暂息 ${years} 年（大战并未结束，战端将自动重燃）`, { colorHex: '#ffd93d' });
    this.toast(`大战暂息 ${years} 年（到期自动重启）`, 'peace');
    return n;
  }

  /** 开发者：撕毁全部停战协议，立即重启战端 */
  devWwResume(): number {
    if (this.worldWar.phase !== 'running') return 0;
    const alive = this.wwAliveBelligerents();
    this.wwTruce.clear();
    let n = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        if (this.atWar(alive[i].id, alive[j].id)) continue;
        this.declareWar(alive[i].id, alive[j].id, 'annex', { force: true, total: true, quiet: true });
        n++;
      }
    }
    this.addEvent('worldwar', `停战协议被尽数撕毁，战端全线重燃——杀戮继续`, { colorHex: '#ff4d4d' });
    this.toast('战端全线重燃', 'war');
    this.shake = Math.max(this.shake, 8);
    return n;
  }

  /** 开发者：神谕终止大战（无胜者） */
  devWwEnd(): boolean {
    if (this.worldWar.phase !== 'running') return false;
    this.endWorldWar(null, true);
    return true;
  }

  /** 大战阵亡计数（近战/枪械/炮火/空袭/核爆死亡统一入账） */
  wwCountKill(victim: Unit) {
    // 涌现武器战绩归属：弹体命中结算瞬间 killCredit 指向武器 → 实战击杀入账 + 学说/品质反馈
    if (this.killCredit != null) {
      const w = this.emergentWeapons.get(this.killCredit);
      if (w) {
        w.kills++;
        // 武器架构 v2 反馈：击杀验证架构 → 攻方学说向该武器剖面漂移 + 装药品质进化
        const attacker = this.civs[w.civ];
        if (attacker && attacker.alive) {
          const doc = this.doctrineOf(w.civ);
          const P = GameEngine.WC_PAYLOAD[w.pl ?? 1];
          const G = GameEngine.WC_GUIDE[w.gd ?? 1];
          const D = GameEngine.WC_DELIVERY[w.dl ?? 0];
          if (P.rad || P.terra) doc.terror = Math.min(0.95, doc.terror + 0.006);
          if ((D.sat + G.sat) > 0.3) doc.saturation = Math.min(0.95, doc.saturation + 0.006);
          if (G.acc > 0.7) doc.precision = Math.min(0.95, doc.precision + 0.006);
          if (G.acc < 0.5 && (w.pw ?? 0) <= 1) doc.attrition = Math.min(0.95, doc.attrition + 0.006);
        }
        if (w.q) w.q[0] = Math.min(1.4, w.q[0] + 0.012); // 装药威力被实战验证 → 品质上行
      }
    }
    if (this.worldWar.phase !== 'running' || victim.civ < 0) return;
    if (this.worldWar.belligerents.includes(victim.civ)) this.worldWar.kills++;
  }

  // ================== 涌现层（Emergence Layer：突破预设的不可预测发展） ==================
  // 武器不再走预设清单：伤害类型 × 投送方式 × 效果标志随机铸造，战绩反馈驱动血系迭代，
  // 敌国缴获仿制引发军备竞赛；生物种化诞生全新动态物种；基因阈值涌现具名特质。

  /** 生态物种全集：预设野生物种 + 动态种化新物种（进化/采样/统计共用） */
  ecoRaces(): number[] {
    const base = [R.SHEEP, R.WOLF, R.DEER, R.PENGUIN, R.CAMEL, R.SCORPION, R.SNAKE, R.SNOWWOLF, R.BEAR];
    if (this.dynRaces.size === 0) return base;
    return [...base, ...this.dynRaces.keys()];
  }

  /** 涌现武器威名后缀（架构名之外的诗性命名） */
  static readonly WEAP_EPI = ['焚天', '裂地', '蚀海', '静默', '终焉', '湮灭', '穿云', '噬星', '惊雷', '破晓'];
  /** 装药弹道视觉签名色（v3：动能白/高爆橙/铝热红/电脉青/生化绿/聚变金/反物质紫） */
  static readonly PAYLOAD_FX = ['#e8e2d5', '#ff9b2d', '#ff5f3d', '#7df9ff', '#8fd66f', '#ffd93d', '#c98fff'];
  /** 动态物种标记色板（头顶 1px 突变点） */
  static readonly DYN_TINTS = ['#ff5fd2', '#5fe8ff', '#c9ff5f', '#ff9e5f', '#b45fff', '#7df9ff', '#ffb35f', '#a0ff8f'];

  // ================== 涌现式进化 v3（Infinite Emergent Evolution） ==================
  // 所有系统全量接入无限涌现：物种（野/文明）链式种化 + 视觉基因组 + 涌现科技/特质/理念
  // + 进化图谱（五系谱系统一记录）—— 进化不止改属性和名字，还直接写在脸上。

  /** 预设文明种族快照（CIV_RACES 会被动态种化 push，重置/读档时复原） */
  static readonly BASE_CIV_RACES = [...CIV_RACES];

  /** 世界生成时播种物种根源节点（图谱的树根：9 野生物种 + 6 文明种族） */
  seedSpeciesRoots() {
    const roots = [...this.ecoRaces(), ...GameEngine.BASE_CIV_RACES];
    for (const race of roots) {
      const def = RACES[race];
      if (!def) continue;
      const id = this.evoSeq++;
      this.evoNodes.push({ id, kind: 'species', name: def.name, parent: null, year: 0, colorHex: '#a3a3a3', detail: '创世预设物种', alive: true, meta: { race } });
      this.evoIndex.set(`sp:${race}`, id);
    }
  }

  /** 图谱记录（五系涌现事件统一入口）：返回节点 id 供子代挂边 */
  recordEvo(kind: EvoKind, name: string, parentKey: string | null, colorHex: string, detail: string, stat?: string, meta?: Record<string, number | string>): number {
    const id = this.evoSeq++;
    const parent = parentKey ? (this.evoIndex.get(parentKey) ?? null) : null;
    this.evoNodes.push({ id, kind, name, parent, year: Math.floor(this.yearF), colorHex, detail, stat, alive: true, meta });
    // 图谱上限（保留最新 720 节点；prune 只影响远古细节，谱系边由 evoIndex 保真）
    if (this.evoNodes.length > 720) {
      const drop = this.evoNodes.splice(0, this.evoNodes.length - 720);
      const dropped = new Set(drop.map((n) => n.id));
      for (const n of this.evoNodes) if (n.parent != null && dropped.has(n.parent)) n.parent = null;
    }
    return id;
  }

  /** 物种图谱节点（预设种懒补 —— 读档旧世界可能无根源） */
  speciesNodeOf(race: number): number {
    const key = `sp:${race}`;
    const hit = this.evoIndex.get(key);
    if (hit != null) return hit;
    const def = RACES[race];
    const id = this.recordEvo('species', def?.name ?? `物种${race}`, null, '#a3a3a3', '预设物种', undefined, { race });
    this.evoIndex.set(key, id);
    return id;
  }

  /** 涌现图谱数据（面板拉取）：节点 + 分类计数 + 存活物种数（nodes 返回副本 —— 面板 useMemo 引用可比对） */
  getEvoGraph() {
    const counts = { species: 0, weapon: 0, tech: 0, trait: 0, society: 0 };
    for (const n of this.evoNodes) if (n.year > 0 || n.kind !== 'species') counts[n.kind]++;
    return {
      nodes: [...this.evoNodes],
      counts,
      dynSpecies: this.dynRaces.size,
      dynWeapons: this.emergentWeapons.size,
      emTechs: this.emTechs.size,
      dynTraits: this.dynTraits.size,
      emIdeas: this.emIdeas.size,
      year: Math.floor(this.yearF),
    };
  }

  /** 涌现科技发明（静态树穷尽后的无限延伸）：登记 → 图谱 → 播报 */
  inventEmTech(c: Civ): string | null {
    if (this.emTechs.size >= 60) return null; // 注册表软上限（防超长局内存膨胀；效果仍可叠加）
    const t = inventTech(this.rng, { mil: (c.militarism ?? 30) / 100, cult: Math.min(1, (c.culture ?? 0) / 120), rich: Math.min(1, (c.gold ?? 0) / 200) }, this.emTechSeq);
    t.key = `em${this.emTechSeq++}`;
    this.emTechs.set(t.key, t);
    this.recordEvo('tech', t.name, null, c.colorHex, `${t.desc}（${c.name} 的第 ${t.gen} 项涌现发明）`, t.desc, { civ: c.id, cost: t.cost, gen: t.gen });
    this.addEvent('emerge', `「${c.name}」的学者穷尽了既有典籍，开创出前所未有的学问——「${t.name}」（${t.desc}）`, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
    this.toast(`「${c.name}」发明了「${t.name}」`, 'good');
    return t.key;
  }

  /** 涌现社会理念采纳（societyTick 文化丰盈时）：50% 全新发明 / 50% 邻国理念文化扩散 */
  adoptIdea(c: Civ) {
    const known = [...this.emIdeas.values()].filter((i) => !(c.ideas ?? []).includes(i.key));
    let idea: IdeaDef | null = null;
    let spread = false;
    if (known.length > 0 && this.rng() < 0.5) {
      // 文化扩散：优先采纳文化强国的理念（文明间的思想传播）
      idea = known[Math.floor(this.rng() * known.length)];
      spread = true;
    } else if (this.emIdeas.size < 48) {
      idea = inventIdea(this.rng, this.ideaSeq);
      idea.key = `id${this.ideaSeq++}`;
      this.emIdeas.set(idea.key, idea);
    } else if (known.length > 0) {
      idea = known[Math.floor(this.rng() * known.length)];
      spread = true;
    }
    if (!idea) return;
    if (!c.ideas) c.ideas = [];
    c.ideas.push(idea.key);
    this.ideaModCache.delete(c.id);
    this.recordEvo('society', idea.name, null, c.colorHex, spread ? `${idea.desc}（自邻邦传入「${c.name}」）` : `${idea.desc}（${c.name} 独创）`, idea.desc, { civ: c.id });
    this.addEvent('emerge', spread
      ? `「${c.name}」的使节带回了异邦的思想——「${idea.name}」开始在朝野流传（${idea.desc}）`
      : `「${c.name}」酝酿出新的治国理念——「${idea.name}」（${idea.desc}）`, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
  }

  /** 理念加成汇总（缓存：采纳时失效） */
  ideaModsOf(civId: number): { gold: number; stab: number; mil: number; know: number; repro: number; wear: number } {
    if (civId < 0) return { gold: 0, stab: 0, mil: 0, know: 0, repro: 0, wear: 0 };
    const cached = this.ideaModCache.get(civId);
    if (cached) return cached;
    const c = this.civs[civId];
    const out = { gold: 0, stab: 0, mil: 0, know: 0, repro: 0, wear: 0 };
    if (c) for (const key of c.ideas ?? []) {
      const m = this.emIdeas.get(key)?.mods;
      if (!m) continue;
      out.gold += m.gold ?? 0;
      out.stab += m.stab ?? 0;
      out.mil += m.mil ?? 0;
      out.know += m.know ?? 0;
      out.repro += m.repro ?? 0;
      out.wear += m.wear ?? 0;
    }
    this.ideaModCache.set(civId, out);
    return out;
  }

  /** 涌现特质诞生（新生儿极端基因分化）：登记 TRAITS + 图谱 + 播报，返回 key（null = 未分化） */
  tryEmergentTrait(parent: Unit, childGene: Gene): string | null {
    const extreme = childGene.d >= 1.5 || childGene.h >= 1.5 || childGene.s >= 1.5;
    if (!extreme || this.dynTraits.size >= 24 || this.rng() > 0.06) return null;
    const t = inventTrait(this.rng, childGene, this.traitSeq);
    t.key = `dt${this.traitSeq++}`;
    this.dynTraits.set(t.key, t);
    TRAITS[t.key] = t; // 模块级注册（全引擎 TRAITS[u.trait] 查找即刻生效）
    this.recordEvo('trait', t.name, null, '#ff5fd2', `${t.desc} —— 源自「${RACES[parent.race]?.name ?? '?'}」种群 ${Math.floor(this.yearF)} 年的极端基因个体`, t.desc, { race: parent.race });
    this.addEvent('emerge', `演化奇迹——「${RACES[parent.race]?.name ?? '?'}」种群诞生了前所未见的个体，携带着新特质「${t.name}」（${t.desc}）`, { colorHex: '#ff5fd2', x: parent.x, y: parent.y });
    return t.key;
  }

  // ================== 武器涌现架构 v2（Weapon Architecture Emergence） ==================
  // 武器不再是「数值袋」，而是四槽组件拼装的「架构」：装药 × 投送 × 制导 × 供能。
  // 军备学说（doctrine）由实战反馈漂移 → 各国军备走向不可预测的分流；
  // 敌国防御（点防/装甲/疏散）随挨打演化 → 下一代武器对抗性选型 —— 攻防螺旋带记忆。

  /** 装药组件（7 种：决定伤害类型/附带效应/破甲能力） */
  static readonly WC_PAYLOAD = [
    { name: '穿甲', dtype: 0, dmgMul: 1.15, rMul: 0.85, fire: 0.05, rad: false, terra: false, morale: 6, pen: 0.6 },
    { name: '高爆', dtype: 1, dmgMul: 0.95, rMul: 1.25, fire: 0.25, rad: false, terra: false, morale: 10, pen: 0.1 },
    { name: '铝热', dtype: 1, dmgMul: 0.8, rMul: 1.0, fire: 0.85, rad: false, terra: false, morale: 8, pen: 0.15 },
    { name: '电脉', dtype: 2, dmgMul: 0.75, rMul: 1.1, fire: 0, rad: false, terra: false, morale: 24, pen: 0.45 },
    { name: '毒剂', dtype: 3, dmgMul: 0.7, rMul: 0.9, fire: 0, rad: true, terra: false, morale: 14, pen: 0.05 },
    { name: '聚变', dtype: 1, dmgMul: 1.5, rMul: 1.35, fire: 0.5, rad: true, terra: false, morale: 18, pen: 0.2 },
    { name: '反物', dtype: 4, dmgMul: 1.8, rMul: 1.45, fire: 0, rad: true, terra: true, morale: 26, pen: 0.55 },
  ] as const;
  /** 投送组件（5 种：决定弹道特效/拦截难度/饱和能力） */
  static readonly WC_DELIVERY = [
    { name: '火炮', fx: 'shell', speed: 0.5, stealth: 0, cadence: 1.3, pen: 0, sat: 0 },
    { name: '火箭', fx: 'drone', speed: 0.62, stealth: 0.15, cadence: 1.05, pen: 0, sat: 0.35 },
    { name: '钻地', fx: 'shell', speed: 0.8, stealth: 0.35, cadence: 0.75, pen: 0.25, sat: 0 },
    { name: '滑翔', fx: 'plasma', speed: 0.9, stealth: 0.55, cadence: 0.6, pen: 0.1, sat: 0.1 },
    { name: '轨道', fx: 'orbital', speed: 1.0, stealth: 0.7, cadence: 0.45, pen: 0.05, sat: 0 },
  ] as const;
  /** 制导组件（5 种：决定精度/抗诱饵能力） */
  static readonly WC_GUIDE = [
    { name: '哑弹', acc: 0.3, decoyRes: 0, cadence: 1.4, sat: 0 },
    { name: '惯导', acc: 0.55, decoyRes: 0.25, cadence: 1.0, sat: 0 },
    { name: '精导', acc: 0.78, decoyRes: 0.5, cadence: 0.75, sat: 0 },
    { name: '蜂群', acc: 0.68, decoyRes: 0.85, cadence: 0.9, sat: 0.3 },
    { name: '量子', acc: 0.95, decoyRes: 1.0, cadence: 0.5, sat: 0 },
  ] as const;
  /** 供能组件（5 种：决定威力放大/射击节奏/奇迹概率；未来时代解锁后两档） */
  static readonly WC_POWER = [
    { name: '化学', dmgMul: 1.0, cadence: 1.0, wonder: 0 },
    { name: '激光', dmgMul: 1.1, cadence: 1.15, wonder: 0.01 },
    { name: '超导', dmgMul: 1.2, cadence: 1.3, wonder: 0.02 },
    { name: '堆心', dmgMul: 1.35, cadence: 1.5, wonder: 0.03 },
    { name: '奇点', dmgMul: 1.55, cadence: 1.75, wonder: 0.05 },
  ] as const;

  /** 军备学说访问器（首访问时注入随机初始流派——各国军备走向从诞生起就分流） */
  doctrineOf(civId: number): WeaponDoctrine {
    let d = this.doctrines.get(civId);
    if (!d) {
      const r = () => 0.14 + this.rng() * 0.24;
      d = { precision: r(), saturation: r(), terror: r(), attrition: r() };
      this.doctrines.set(civId, d);
    }
    return d;
  }
  /** 防御套件访问器（零起步，挨打成长，上限受军备时代约束） */
  defenseOf(civId: number): WeaponDefense {
    let d = this.defenses.get(civId);
    if (!d) { d = { point: 0, armor: 0, evade: 0 }; this.defenses.set(civId, d); }
    return d;
  }
  /** 防御成长上限（军备时代 = 硬天花板：木石国攒不出点防矩阵） */
  defenseCap(civId: number): number {
    const c = this.civs[civId];
    const tier = c ? this.armamentOf(c) : 0;
    return 18 + tier * 13;
  }

  /** 组件选型（武器架构 v2 核心）：学说权重 × 对抗性偏好 × 时代门槛的加权抽奖 */
  pickComponent(slot: 0 | 1 | 2 | 3, doc: WeaponDoctrine, threat: { point: number; armor: number; evade: number }, tier: number): number {
    let w: number[];
    if (slot === 0) {
      // 装药：恐吓流派 → 毒剂/聚变/反物；消耗流派 → 穿甲/高爆；敌装甲厚 → 穿甲/电脉优先
      w = [
        0.4 + doc.attrition + threat.armor / 55,   // 穿甲
        0.9,                                         // 高爆（万金油）
        0.45,                                        // 铝热
        0.4 + threat.armor / 80,                    // 电脉
        0.3 + doc.terror * 1.7,                     // 毒剂
        tier >= 6 ? 0.25 + doc.terror * 1.3 : 0,    // 聚变（未来）
        tier >= 6 ? 0.14 + doc.terror : 0,          // 反物（未来）
      ];
    } else if (slot === 1) {
      // 投送：饱和流派 → 火箭集群；敌点防高 → 隐身快弹（滑翔/轨道）；消耗 → 火炮
      w = [
        0.8 + doc.attrition * 0.8,                  // 火炮
        0.6 + doc.saturation * 1.8,                 // 火箭
        0.35 + threat.point / 90 + doc.precision * 0.4, // 钻地
        tier >= 5 ? 0.3 + threat.point / 70 : 0,    // 滑翔（现代）
        tier >= 6 ? 0.22 + threat.point / 55 : 0,   // 轨道（未来）
      ];
    } else if (slot === 2) {
      // 制导：精确流派 → 精导/量子；敌疏散高 → 量子/蜂群抗诱饵；消耗 → 哑弹便宜量足
      w = [
        0.5 + doc.attrition * 1.2,                  // 哑弹
        0.9,                                        // 惯导
        0.5 + doc.precision * 1.6,                  // 精导
        0.35 + threat.evade / 70 + doc.saturation * 0.5, // 蜂群
        tier >= 6 ? 0.2 + doc.precision * 0.9 + threat.evade / 60 : 0, // 量子
      ];
    } else {
      // 供能：未来时代解锁高级供能（威力放大但节奏更慢的取舍自由）
      w = [
        0.9,                                        // 化学
        tier >= 5 ? 0.6 : 0,                        // 激光
        tier >= 5 ? 0.45 : 0,                       // 超导
        tier >= 6 ? 0.3 : 0,                        // 堆心
        tier >= 6 ? 0.18 : 0,                       // 奇点
      ];
    }
    const total = w.reduce((a, b) => a + b, 0);
    let pick = this.rng() * total;
    for (let k = 0; k < w.length; k++) {
      pick -= w[k];
      if (pick <= 0) return k;
    }
    return 0;
  }

  /** 铸造一件涌现武器（v2 架构化）：学说偏置选型 + 血系组件继承突变 + q 品质向量遗传 */
  forgeWeapon(c: Civ, parent: EmergentWeapon | null = null): EmergentWeapon | null {
    if (this.emergentWeapons.size >= 128) return null; // v4：上限 96→128（融合谱系加入后的实践上限）
    const active = [...this.emergentWeapons.values()].filter((w) => !w.retired && w.civ === c.id);
    if (active.length >= 5) return null;
    const tier = this.armamentOf(c); // 4 火器 / 5 现代 / 6 未来
    if (tier < 4) return null;
    // —— 铸造经费（Task 34 经济闭环）：军备竞赛烧钱——代数越高迭代越贵，国库见底则军工停摆 ——
    const forgeCost = 12 + (parent ? parent.gen * 4 : 6);
    if ((c.gold ?? 0) < forgeCost) return null;
    const doc = this.doctrineOf(c.id);
    // 敌国防御画像（对抗性选型的压力源）
    const foes = this.civs.filter((o) => o.alive && o.id !== c.id && this.atWar(c.id, o.id));
    let tPoint = 0;
    let tArmor = 0;
    let tEvade = 0;
    if (foes.length > 0) {
      for (const f of foes) {
        const fd = this.defenseOf(f.id);
        tPoint += fd.point;
        tArmor += fd.armor;
        tEvade += fd.evade;
      }
      tPoint /= foes.length;
      tArmor /= foes.length;
      tEvade /= foes.length;
    }
    const threat = { point: tPoint, armor: tArmor, evade: tEvade };
    const gen = parent ? parent.gen + 1 : 1;
    // 四槽选型：血系继承（单槽突变换新） or 全新架构
    let pl: number;
    let dl: number;
    let gd: number;
    let pw: number;
    if (parent) {
      pl = parent.pl ?? 1;
      dl = parent.dl ?? 0;
      gd = parent.gd ?? 1;
      pw = parent.pw ?? 0;
      const mutSlot = Math.floor(this.rng() * 4) as 0 | 1 | 2 | 3;
      if (mutSlot === 0) pl = this.pickComponent(0, doc, threat, tier);
      else if (mutSlot === 1) dl = this.pickComponent(1, doc, threat, tier);
      else if (mutSlot === 2) gd = this.pickComponent(2, doc, threat, tier);
      else pw = this.pickComponent(3, doc, threat, tier);
    } else {
      pl = this.pickComponent(0, doc, threat, tier);
      dl = this.pickComponent(1, doc, threat, tier);
      gd = this.pickComponent(2, doc, threat, tier);
      pw = this.pickComponent(3, doc, threat, tier);
    }
    // q 品质向量（装药威力/投送速度/制导精度/供能效率）：遗传 ± 突变，或全新采样
    const clampQ = (v: number) => Math.max(0.6, Math.min(1.4, Math.round(v * 1000) / 1000));
    const q: [number, number, number, number] = parent && parent.q
      ? [
          clampQ(parent.q[0] * (0.96 + this.rng() * 0.16)),
          clampQ(parent.q[1] * (0.96 + this.rng() * 0.16)),
          clampQ(parent.q[2] * (0.96 + this.rng() * 0.16)),
          clampQ(parent.q[3] * (0.96 + this.rng() * 0.16)),
        ]
      : [clampQ(0.75 + this.rng() * 0.55), clampQ(0.75 + this.rng() * 0.55), clampQ(0.75 + this.rng() * 0.55), clampQ(0.75 + this.rng() * 0.55)];
    const P = GameEngine.WC_PAYLOAD[pl];
    const D = GameEngine.WC_DELIVERY[dl];
    const G = GameEngine.WC_GUIDE[gd];
    const PW = GameEngine.WC_POWER[pw];
    const wonder = !parent && this.rng() < 0.02 + PW.wonder;
    // —— 代数收益递减 + 软上限（Task 34 失衡修复）：血系迭代不再指数无界——
    //    旧版 gen 20+ 单发 500+ 伤害一发清屏；现在封顶为战略级火力而非灭世神器
    const dmgCap = 130 + tier * 14; // 火器 186 / 现代 200 / 未来 214
    // 架构推导数值：组件乘子 × q 向量 × 时代/代数放大
    let dmg = Math.min(dmgCap, (16 + 26 * q[0]) * P.dmgMul * PW.dmgMul * (1 + 0.3 * (tier - 4)) * (1 + 0.2 * (gen - 1)) * (wonder ? 2 : 1));
    let radius = (1.2 + 0.9 * q[1]) * P.rMul + 0.12 * (gen - 1);
    let fire = P.fire * Math.min(1.1, q[0]);
    const rad = P.rad;
    const terra = P.terra;
    let morale = P.morale * (0.85 + 0.3 * q[2]);
    if (parent) {
      // 血系迭代整体强化（谱系感：代代精进；增益随代数衰减——后发改进越来越难）
      dmg = Math.min(dmgCap, Math.max(parent.dmg * (1 + (0.1 + this.rng() * 0.08) * Math.pow(0.92, gen)), dmg * 0.85));
      radius = Math.max(parent.radius * 1.03, radius * 0.9);
      morale = Math.min(35, Math.max(parent.morale + 3, morale * 0.9));
    }
    const mk = gen > 1 ? ` Mk.${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][Math.min(7, gen - 1)]}` : '';
    const epi = GameEngine.WEAP_EPI[Math.floor(this.rng() * GameEngine.WEAP_EPI.length)];
    const name = `${wonder ? '神铸·' : ''}${P.name}·${D.name}·${G.name}${mk}·${epi}`;
    const w: EmergentWeapon = {
      id: this.weapSeq++,
      civ: c.id,
      name,
      gen,
      dtype: P.dtype,
      delivery: dl,
      dmg: Math.round(dmg * 10) / 10,
      radius: Math.round(Math.min(6.5, radius) * 10) / 10,
      fire: Math.round(Math.max(0, Math.min(1, fire)) * 100) / 100,
      rad,
      terra,
      morale: Math.round(Math.min(35, morale)),
      wonder,
      kills: 0,
      fired: 0,
      parent: parent?.id ?? null,
      bornYear: Math.floor(this.yearF),
      retired: false,
      pl,
      dl,
      gd,
      pw,
      q,
      inter: 0,
    };
    this.emergentWeapons.set(w.id, w);
    c.gold = Math.max(0, (c.gold ?? 0) - forgeCost); // 铸造落账：军工复合体的账单
    // v3：武器谱系入图谱（血系迭代/缴获仿制挂边到父设计节点）
    const wNode = this.recordEvo('weapon', w.name, parent ? `wp:${parent.id}` : null, c.colorHex,
      parent ? `第 ${gen} 代血系迭代（${P.name}·${D.name}·${G.name}）` : `全新铸造（${P.name}×${D.name}×${G.name}×${PW.name}）${wonder ? ' —— 奇迹武器' : ''}`,
      `威力 ${Math.round(w.dmg)}·半径 ${w.radius}`, { civ: c.id, wid: w.id, dmg: Math.round(w.dmg), radius: w.radius, gen });
    this.evoIndex.set(`wp:${w.id}`, wNode);
    // 纪事：铸造/迭代/缴获仿制 三种叙事（v2 带架构叙事）
    if (parent && parent.civ !== c.id) {
      this.addEvent('emerge', `「${c.name}」的军械师逆向缴获的「${this.emergentWeapons.get(parent.id)?.name ?? parent.name}」，嫁接出己方架构——「${w.name}」（${P.name}弹体 + ${D.name}投送）`, { colorHex: c.colorHex });
    } else if (parent) {
      parent.retired = true; // 旧型退役（谱系保留）
      this.addEvent('emerge', `「${c.name}」依实战反馈将「${parent.name}」重构为第 ${gen} 代——「${w.name}」（${P.name}·${D.name}·${G.name}，威力 ${Math.round(w.dmg)}）`, { colorHex: c.colorHex });
    } else if (wonder) {
      this.addEvent('emerge', `奇迹武器诞生！「${c.name}」的工坊铸出旷世之作——「${w.name}」（${P.name}装药 × ${PW.name}供能，威力 ${Math.round(w.dmg)} / 半径 ${w.radius}）`, { colorHex: c.colorHex });
      this.toast(`奇迹武器「${w.name}」铸成`, 'war');
    } else {
      this.addEvent('emerge', `「${c.name}」以${doc.terror > 0.4 ? '恐吓' : doc.saturation > 0.4 ? '饱和' : doc.precision > 0.4 ? '精确' : '消耗'}学说铸造新武器——「${w.name}」（威力 ${Math.round(w.dmg)} / 半径 ${w.radius}${w.rad ? ' / 辐射' : ''}${w.terra ? ' / 湮灭地形' : ''}）`, { colorHex: c.colorHex });
    }
    return w;
  }

  /** 涌现武器融合（超级演化 v4）：两件成熟设计嫁接 —— 四槽各取其优、q 向量逐维取大再乘杂种优势
   *  ——军备竞赛从「单血系迭代」升维为「双血系融合」：融合体可突破常规软上限 15%（军备竞赛的终极诱惑）
   *  @param wa/wb 两件在役成熟设计（fired ≥ 5）；返回融合新设计（双亲退役让位） */
  fuseWeapon(c: Civ, wa: EmergentWeapon, wb: EmergentWeapon): EmergentWeapon | null {
    if (this.emergentWeapons.size >= 128) return null;
    if (wa.id === wb.id || wa.civ !== c.id || wb.civ !== c.id) return null;
    const tier = this.armamentOf(c);
    if (tier < 4) return null;
    // —— 融合经费：比迭代更昂贵（嫁接两套生产线的成本）——
    const fuseCost = 26 + Math.max(wa.gen, wb.gen) * 5;
    if ((c.gold ?? 0) < fuseCost) return null;
    const gen = Math.max(wa.gen, wb.gen) + 1;
    // —— 四槽选型：按各槽位的性能贡献取优（装药看威力、投送看隐蔽、制导看精度、供能看放大）——
    const pl = (wa.q?.[0] ?? 1) * GameEngine.WC_PAYLOAD[wa.pl ?? 1].dmgMul >= (wb.q?.[0] ?? 1) * GameEngine.WC_PAYLOAD[wb.pl ?? 1].dmgMul ? (wa.pl ?? 1) : (wb.pl ?? 1);
    const dl = GameEngine.WC_DELIVERY[wa.dl ?? 0].stealth >= GameEngine.WC_DELIVERY[wb.dl ?? 0].stealth ? (wa.dl ?? 0) : (wb.dl ?? 0);
    const gd = GameEngine.WC_GUIDE[wa.gd ?? 1].acc >= GameEngine.WC_GUIDE[wb.gd ?? 1].acc ? (wa.gd ?? 1) : (wb.gd ?? 1);
    const pw = GameEngine.WC_POWER[wa.pw ?? 0].dmgMul >= GameEngine.WC_POWER[wb.pw ?? 0].dmgMul ? (wa.pw ?? 0) : (wb.pw ?? 0);
    // —— q 品质向量：逐维取大 × 1.05 杂种优势（杂交重组的性能红利）——
    const clampQ = (v: number) => Math.max(0.6, Math.min(1.45, Math.round(v * 1000) / 1000));
    const q: [number, number, number, number] = [
      clampQ(Math.max(wa.q?.[0] ?? 1, wb.q?.[0] ?? 1) * 1.05),
      clampQ(Math.max(wa.q?.[1] ?? 1, wb.q?.[1] ?? 1) * 1.05),
      clampQ(Math.max(wa.q?.[2] ?? 1, wb.q?.[2] ?? 1) * 1.05),
      clampQ(Math.max(wa.q?.[3] ?? 1, wb.q?.[3] ?? 1) * 1.05),
    ];
    const P = GameEngine.WC_PAYLOAD[pl];
    const D = GameEngine.WC_DELIVERY[dl];
    const G = GameEngine.WC_GUIDE[gd];
    const PW = GameEngine.WC_POWER[pw];
    // —— 数值推导：融合上限放宽 15%（唯一能突破常规软上限的途径）——
    const dmgCap = (130 + tier * 14) * 1.15;
    let dmg = Math.min(dmgCap, (18 + 30 * q[0]) * P.dmgMul * PW.dmgMul * (1 + 0.3 * (tier - 4)) * (1 + 0.22 * (gen - 1)));
    let radius = Math.min(7.2, (1.35 + 0.95 * q[1]) * P.rMul + 0.14 * (gen - 1));
    let fire = P.fire * Math.min(1.1, q[0]);
    let morale = P.morale * (0.9 + 0.32 * q[2]);
    // 融合增益：对双亲的相对优势保底（杂种不应弱于任一亲代）
    dmg = Math.min(dmgCap, Math.max(dmg, Math.max(wa.dmg, wb.dmg) * 1.06));
    radius = Math.max(radius, Math.max(wa.radius, wb.radius) * 1.02);
    morale = Math.round(Math.min(38, Math.max(morale, Math.max(wa.morale, wb.morale) + 2)));
    const mk = gen > 1 ? ` Mk.${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][Math.min(7, gen - 1)]}` : '';
    const epi = GameEngine.WEAP_EPI[Math.floor(this.rng() * GameEngine.WEAP_EPI.length)];
    const name = `融铸·${P.name}·${D.name}·${G.name}${mk}·${epi}`;
    const w: EmergentWeapon = {
      id: this.weapSeq++,
      civ: c.id,
      name,
      gen,
      dtype: P.dtype,
      delivery: dl,
      dmg: Math.round(dmg * 10) / 10,
      radius: Math.round(radius * 10) / 10,
      fire: Math.round(Math.max(0, Math.min(1, fire)) * 100) / 100,
      rad: P.rad,
      terra: P.terra,
      morale,
      wonder: false,
      kills: 0,
      fired: 0,
      parent: wa.id,
      parent2: wb.id,
      bornYear: Math.floor(this.yearF),
      retired: false,
      pl,
      dl,
      gd,
      pw,
      q,
      inter: 0,
    };
    this.emergentWeapons.set(w.id, w);
    c.gold = Math.max(0, (c.gold ?? 0) - fuseCost);
    // 双亲退役（谱系保留——图谱上形成两条父边汇入融合节点）
    wa.retired = true;
    wb.retired = true;
    // —— 图谱：融合节点挂到主父（威力更高的那件），副父记入 meta ——
    const mainParent = wa.dmg >= wb.dmg ? wa : wb;
    const wNode = this.recordEvo('weapon', w.name, `wp:${mainParent.id}`, c.colorHex,
      `双血系融合：「${wa.name}」×「${wb.name}」嫁接（${P.name}·${D.name}·${G.name}·${PW.name}）—— 四槽取优 + 杂种优势`,
      `威力 ${Math.round(w.dmg)}·半径 ${w.radius}`, { civ: c.id, wid: w.id, dmg: Math.round(w.dmg), radius: w.radius, gen, parent2: (mainParent === wa ? wb : wa).id });
    this.evoIndex.set(`wp:${w.id}`, wNode);
    this.addEvent('emerge', `军械史的奇点——「${c.name}」的工坊将「${wa.name}」与「${wb.name}」两套血系嫁接，铸出融合设计「${w.name}」（威力 ${Math.round(w.dmg)} / 半径 ${w.radius}${w.rad ? ' / 辐射' : ''}）`, { colorHex: c.colorHex });
    this.toast(`融合武器「${w.name}」铸成`, 'war');
    return w;
  }

  /** 神谕·神铸武器（forge_divine_weapon 工具真身）：绕过时代/经费/活跃上限的神力铸造
   *  —— 神力不受物理学与预算约束：wonder 奇迹标记 + 可选组件钦定 + 威力倍率 */
  forgeDivineWeapon(civId: number, opts: { name?: string; pl?: number; dl?: number; gd?: number; pw?: number; boost?: number }): EmergentWeapon | null {
    const c = this.civs[civId];
    if (!c?.alive) return null;
    if (this.emergentWeapons.size >= 128) return null;
    const tier = Math.max(4, this.armamentOf(c));
    const doc = this.doctrineOf(c.id);
    const cl = (v: number | undefined, hi: number): number => (v == null || !Number.isFinite(v) ? -1 : Math.max(0, Math.min(hi, Math.round(v))));
    const pl = cl(opts.pl, GameEngine.WC_PAYLOAD.length - 1) >= 0 ? cl(opts.pl, GameEngine.WC_PAYLOAD.length - 1) : this.pickComponent(0, doc, { point: 0, armor: 0, evade: 0 }, tier);
    const dl = cl(opts.dl, GameEngine.WC_DELIVERY.length - 1) >= 0 ? cl(opts.dl, GameEngine.WC_DELIVERY.length - 1) : this.pickComponent(1, doc, { point: 0, armor: 0, evade: 0 }, tier);
    const gd = cl(opts.gd, GameEngine.WC_GUIDE.length - 1) >= 0 ? cl(opts.gd, GameEngine.WC_GUIDE.length - 1) : this.pickComponent(2, doc, { point: 0, armor: 0, evade: 0 }, tier);
    const pwRaw = cl(opts.pw, GameEngine.WC_POWER.length - 1);
    const pw = pwRaw >= 0 ? pwRaw : Math.min(GameEngine.WC_POWER.length - 1, tier >= 6 ? 4 : tier === 5 ? 3 : 2);
    const boost = Math.max(0.5, Math.min(3, opts.boost ?? 1.6));
    const P = GameEngine.WC_PAYLOAD[pl];
    const D = GameEngine.WC_DELIVERY[dl];
    const G = GameEngine.WC_GUIDE[gd];
    const PW = GameEngine.WC_POWER[pw];
    const q: [number, number, number, number] = [1.25, 1.2, 1.25, 1.2];
    const dmgCap = (130 + tier * 14) * 1.3 * boost; // 神铸上限：常规 ×1.3 × 钦定倍率
    const dmg = Math.min(dmgCap, (20 + 32 * q[0]) * P.dmgMul * PW.dmgMul * (1 + 0.3 * (tier - 4)) * boost);
    const radius = Math.min(7.5, (1.4 + 1.0 * q[1]) * P.rMul * (1 + boost * 0.08));
    const name = ((opts.name ?? '').trim() || `神铸·${P.name}·${D.name}·${G.name}·天启`).slice(0, 30);
    const w: EmergentWeapon = {
      id: this.weapSeq++,
      civ: c.id,
      name,
      gen: 1,
      dtype: P.dtype,
      delivery: dl,
      dmg: Math.round(dmg * 10) / 10,
      radius: Math.round(radius * 10) / 10,
      fire: Math.round(Math.max(0, Math.min(1, P.fire)) * 100) / 100,
      rad: P.rad,
      terra: P.terra,
      morale: Math.round(Math.min(40, P.morale * 1.3)),
      wonder: true,
      kills: 0,
      fired: 0,
      parent: null,
      bornYear: Math.floor(this.yearF),
      retired: false,
      pl, dl, gd, pw, q,
      inter: 0,
    };
    this.emergentWeapons.set(w.id, w);
    const wNode = this.recordEvo('weapon', w.name, null, c.colorHex,
      `神谕亲铸（${P.name}×${D.name}×${G.name}×${PW.name}，威力倍率 ${boost.toFixed(2)}）—— 神力不受物理学与预算约束`,
      `威力 ${Math.round(w.dmg)}·半径 ${w.radius}`, { civ: c.id, wid: w.id, dmg: Math.round(w.dmg), radius: w.radius, gen: 1, divine: 1 });
    this.evoIndex.set(`wp:${w.id}`, wNode);
    this.addEvent('emerge', `神谕亲铸——「${c.name}」的武库中降下天启兵器「${w.name}」（${P.name}装药 × ${PW.name}供能，威力 ${Math.round(w.dmg)} / 半径 ${w.radius}${w.rad ? ' / 辐射' : ''}${w.terra ? ' / 湮灭地形' : ''}）`, { colorHex: c.colorHex });
    this.toast(`神铸武器「${w.name}」降临`, 'war');
    return w;
  }

  /** 涌现锻造驱动（armoryTick 尾部）：交战国随机铸造 + 战绩迭代 + 缴获仿制 + 融合铸造 + 和平期防御荒废
   *  ——军备竞赛的正反馈回路：实战杀敌越多，武器越强，越被敌国觊觎仿制 */
  emergentForgeTick() {
    const atWar = this.civs.filter((c) => c.alive && c.pop >= 6 && this.civAtWar(c.id));
    for (const c of atWar) {
      // —— 融合铸造（超级演化 v4）：两件成熟设计（fired ≥ 5）→ 18% 概率嫁接出融合体 ——
      const fusePool = [...this.emergentWeapons.values()].filter((w) => !w.retired && w.civ === c.id && w.fired >= 5);
      if (fusePool.length >= 2 && this.rng() < 0.18) {
        const i = Math.floor(this.rng() * fusePool.length);
        let j = Math.floor(this.rng() * (fusePool.length - 1));
        if (j >= i) j++;
        if (this.fuseWeapon(c, fusePool[i], fusePool[j])) continue;
      }
      // —— 战绩反馈迭代：发射 ≥ 6 且杀敌 ≥ 12 的成熟设计 → 55% 概率迭代下一代 ——
      const mature = [...this.emergentWeapons.values()].filter((w) => !w.retired && w.civ === c.id && w.fired >= 6 && w.kills >= 12);
      if (mature.length > 0 && this.rng() < 0.55) {
        this.forgeWeapon(c, mature[Math.floor(this.rng() * mature.length)]);
        continue;
      }
      // —— 缴获仿制：敌国在役高杀武器（kills ≥ 15）→ 25% 概率被本国逆向 ——
      const foes = this.civs.filter((o) => o.alive && o.id !== c.id && this.atWar(c.id, o.id));
      if (foes.length > 0 && this.rng() < 0.25) {
        const prized = [...this.emergentWeapons.values()].filter((w) => !w.retired && foes.some((f) => f.id === w.civ) && w.kills >= 15);
        if (prized.length > 0 && this.rng() < 0.5) {
          this.forgeWeapon(c, prized[Math.floor(this.rng() * prized.length)]);
          continue;
        }
      }
      // —— 全新铸造：交战国每轮（240 tick ≈ 6 年）小概率开新谱系；世界大战期翻倍 ——
      const p = this.worldWar.phase === 'running' ? 0.24 : 0.1;
      if (this.rng() < p) this.forgeWeapon(c, null);
    }
    // —— 对抗演化松弛：和平期防御荒废（无威胁则军备生锈），学说缓慢熵回均匀 ——
    for (const c of this.civs) {
      if (!c.alive) continue;
      const inWar = atWar.some((x) => x.id === c.id);
      if (inWar) continue;
      const def = this.defenses.get(c.id);
      if (def && (def.point > 0 || def.armor > 0 || def.evade > 0)) {
        def.point *= 0.992;
        def.armor *= 0.992;
        def.evade *= 0.992;
        if (def.point < 0.05) def.point = 0;
        if (def.armor < 0.05) def.armor = 0;
        if (def.evade < 0.05) def.evade = 0;
      }
      const doc = this.doctrines.get(c.id);
      if (doc) {
        doc.precision += (0.25 - doc.precision) * 0.01;
        doc.saturation += (0.25 - doc.saturation) * 0.01;
        doc.terror += (0.25 - doc.terror) * 0.01;
        doc.attrition += (0.25 - doc.attrition) * 0.01;
      }
    }
  }

  /** 发射一件涌现武器（v2 架构化）：点防拦截判定 → 制导散射 → 装甲减伤 → 弹道特效；
   *  每一次交手都在改写双方的学说与防御（攻防螺旋的瞬间记忆） */
  fireEmergent(c: Civ, w: EmergentWeapon) {
    const foes = this.civs.filter((o) => o.alive && o.id !== c.id && this.atWar(c.id, o.id));
    if (foes.length === 0) return;
    const foe = foes[Math.floor(this.rng() * foes.length)];
    // 目标选择器：优先敌军团（nearer 高价值）→ 首都 → 随机建筑
    let tx = -1;
    let ty = -1;
    const foeArmies = this.armies.filter((a) => a.civ === foe.id);
    if (foeArmies.length > 0 && this.rng() < 0.4) {
      const a = foeArmies[Math.floor(this.rng() * foeArmies.length)];
      const m = a.members[0] != null ? this.unitById.get(a.members[0]) : null;
      if (m && !m.dead) { tx = m.x; ty = m.y; }
    }
    if (tx < 0 && foe.capital >= 0) { tx = this.tileX(foe.capital) + 0.5; ty = this.tileY(foe.capital) + 0.5; }
    if (tx < 0) {
      const fb = this.buildings.filter((b) => b.civ === foe.id);
      if (fb.length > 0) { const b = fb[Math.floor(this.rng() * fb.length)]; tx = b.x + 0.5; ty = b.y + 0.5; }
    }
    if (tx < 0) return;
    const sx = this.civCenterX(c);
    const sy = this.civCenterY(c);
    const P = GameEngine.WC_PAYLOAD[w.pl ?? 1];
    const D = GameEngine.WC_DELIVERY[w.dl ?? 0];
    const G = GameEngine.WC_GUIDE[w.gd ?? 1];
    const q = w.q ?? [1, 1, 1, 1];
    const doc = this.doctrineOf(c.id);
    const def = this.defenseOf(foe.id);
    const defCap = this.defenseCap(foe.id);
    w.fired++;
    // —— 拦截判定：点防 × (1-投送速度) × (1-饱和压制) ——
    const speed = D.speed * q[1];
    const sat = Math.min(0.75, D.sat + G.sat);
    const pInt = (def.point / 100) * (1 - speed * 0.75) * (1 - sat);
    if (this.rng() < pInt) {
      // 中段拦截：弹道中点炸成烟花，无伤害
      const mx = (sx + tx) / 2;
      const my = (sy + ty) / 2;
      this.fx('explosion', mx, my, 16, { r: 1.8 });
      this.fx('spark', mx, my, 10);
      w.inter = (w.inter ?? 0) + 1;
      // 反馈回路：守方点防强化 + 攻方学说转向饱和/隐身投送 + 投送品质被否证
      def.point = Math.min(defCap, def.point + 1.5);
      doc.saturation = Math.min(0.95, doc.saturation + 0.025);
      doc.precision = Math.max(0.05, doc.precision - 0.012);
      if (w.q) w.q[1] = Math.max(0.6, w.q[1] - 0.02);
      if (w.inter === 1 || (w.inter ?? 0) % 5 === 0) {
        this.addEvent('superweapon', `「${foe.name}」的点防御网在半途撕碎了「${w.name}」——第 ${w.inter} 次拦截成功`, { colorHex: foe.colorHex, x: mx, y: my });
      }
      if (this.worldWar.phase === 'running' && this.worldWar.belligerents.includes(c.id)) this.worldWar.emerged++;
      return;
    }
    // —— 制导散射：有效精度 vs 疏散诱饵（诱饵抵抗高的制导不吃疏散）——
    const effAcc = G.acc * q[2] * (1 - Math.min(0.55, (def.evade / 100) * (1 - G.decoyRes)));
    const missR = (1 - effAcc) * (3.5 + w.radius * 1.4);
    const missA = this.rng() * Math.PI * 2;
    const ax = tx + Math.cos(missA) * missR;
    const ay = ty + Math.sin(missA) * missR;
    // —— 装甲减伤：破甲能力抵消装甲（穿甲/钻地/电脉天生克制重甲）——
    const pen = Math.min(0.85, P.pen + D.pen);
    const armorMit = Math.max(0.35, 1 - (def.armor / 100) * (1 - pen));
    const dmgOut = w.dmg * armorMit;
    const radiusOut = w.radius * (0.72 + 0.28 * armorMit);
    const dist = Math.hypot(ax - sx, ay - sy);
    const ttl = Math.max(30, Math.min(140, Math.round(dist * 1.3)));
    this.fx(D.fx as Effect['kind'], ax, ay, ttl, {
      x0: sx,
      y0: sy,
      src: c.id,
      r: radiusOut,
      dmg: dmgOut,
      fire: this.rng() < w.fire ? 1 : 0,
      wid: w.id,
      col: GameEngine.PAYLOAD_FX[Math.max(0, Math.min(6, w.pl ?? 1))], // v3：装药专属弹道色
    });
    if (this.worldWar.phase === 'running' && this.worldWar.belligerents.includes(c.id)) this.worldWar.emerged++;
    // —— 挨打反馈：守方防御按攻击剖面成长（点防小涨/装甲大涨/疏散中涨）——
    def.point = Math.min(defCap, def.point + 0.5);
    def.armor = Math.min(defCap, def.armor + 1.6 * (1 - pen * 0.5));
    def.evade = Math.min(defCap, def.evade + 1.1);
    // 首射/奇迹武器入纪事（常规发射由命中结算播报，防刷屏）
    if (w.fired === 1 || w.wonder) {
      this.addEvent('emerge', `「${c.name}」的涌现武器「${w.name}」首次开火——${effAcc > 0.7 ? '制导锁定' : '弹道解算'}完毕，目标：「${foe.name}」`, { colorHex: c.colorHex, x: ax, y: ay });
    }
  }

  /** 涌现武器命中附加结算：辐射污染 / 地形湮灭 / 军团士气打击（在弹体落点结算时调用） */
  emergentPayload(e: Effect) {
    const w = this.emergentWeapons.get(e.wid ?? -1);
    if (!w) return;
    const r = e.r ?? w.radius;
    if (w.rad) {
      // 辐射污染：落点半径 40% 内 tile 染辐射（radSet 到期自动衰减）
      const rr = Math.max(1, Math.round(r * 0.4));
      for (let yy = Math.floor(e.y - rr); yy <= e.y + rr; yy++) {
        for (let xx = Math.floor(e.x - rr); xx <= e.x + rr; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (Math.hypot(xx + 0.5 - e.x, yy + 0.5 - e.y) > rr) continue;
          const i = idx(xx, yy);
          if (isLand(this.terrain[i])) {
            this.radiate[i] = 40;
            this.radSet.set(i, this.tickCount + 2400);
            this.markDirty(i);
          }
        }
      }
    }
    if (w.terra) {
      // 奇点湮灭：中心焦土化（不动山——保留地质）
      const rr = Math.max(1, Math.round(r * 0.55));
      for (let yy = Math.floor(e.y - rr); yy <= e.y + rr; yy++) {
        for (let xx = Math.floor(e.x - rr); xx <= e.x + rr; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (Math.hypot(xx + 0.5 - e.x, yy + 0.5 - e.y) > rr) continue;
          const i = idx(xx, yy);
          if (isLand(this.terrain[i]) && this.terrain[i] !== T.MOUNTAIN && this.rng() < 0.7) this.setTerrain(i, T.BURNT);
        }
      }
    }
    if (w.morale > 0) {
      // 军团士气打击（EMP/恐慌波）：半径 + 2 内敌军团士气崩落
      for (const a of this.armies) {
        if (e.src !== undefined && a.civ === e.src) continue;
        if (Math.hypot(a.x - e.x, a.y - e.y) < r + 2.5) a.morale = Math.max(5, (a.morale ?? 60) - w.morale);
      }
    }
  }

  // ================== 现代武器体系（工业时代军备） ==================

  /** 火炮轰击：从己方前线建筑向敌国目标发射炮弹（抛物线弹道 + 落点爆破） */
  launchArtillery(c: Civ, foe: Civ) {
    // 目标：敌国随机建筑（无建筑则打敌军单位）
    let tx = -1;
    let ty = -1;
    const foeBuilds = this.buildings.filter((b) => b.civ === foe.id);
    if (foeBuilds.length > 0) {
      const b = foeBuilds[Math.floor(this.rng() * foeBuilds.length)];
      tx = b.x + 0.5;
      ty = b.y + 0.5;
    } else {
      const tu = this.units.find((u) => !u.dead && u.civ === foe.id);
      if (tu) { tx = tu.x; ty = tu.y; }
    }
    if (tx < 0) return;
    // 炮位：己方距目标最近的建筑（前线炮兵阵地）
    let sx = this.civCenterX(c);
    let sy = this.civCenterY(c);
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.civ !== c.id) continue;
      const d = Math.hypot(b.x - tx, b.y - ty);
      if (d < bestD) { bestD = d; sx = b.x + 0.5; sy = b.y + 0.5; }
    }
    if (bestD < 6) return; // 贴脸无需炮击（近战解决）
    const dist = Math.hypot(tx - sx, ty - sy);
    const ttl = Math.max(16, Math.min(60, Math.round(dist * 1.1)));
    this.fx('shell', tx, ty, ttl, { x0: sx, y0: sy, src: c.id, r: 1.6, dmg: 26 + this.rng() * 14, fire: this.rng() < 0.5 ? 1 : 0 });
    if (this.rng() < 0.25) this.onSound?.('boom');
  }

  /** 空袭：轰炸机从己方腹地飞向敌国纵深，沿途投弹 */
  launchAirstrike(c: Civ, tx: number, ty: number) {
    const sx = this.civCenterX(c);
    const sy = this.civCenterY(c);
    const dist = Math.hypot(tx - sx, ty - sy);
    const ttl = Math.max(40, Math.min(120, Math.round(dist * 1.6)));
    this.fx('airstrike', tx, ty, ttl, { x0: sx, y0: sy, src: c.id, r: 1.4, dmg: 30 });
    this.addEvent('worldwar', `「${c.name}」的轰炸机编队升空，朝敌境纵深飞去`, { colorHex: c.colorHex, x: sx, y: sy });
  }

  /** 导弹打击：从己方腹地发射（nukePower > 0 时为核弹头，命中升起蘑菇云） */
  launchMissile(c: Civ, tx: number, ty: number, nukePower = 0) {
    const sx = this.civCenterX(c);
    const sy = this.civCenterY(c);
    const dist = Math.hypot(tx - sx, ty - sy);
    const ttl = Math.max(30, Math.min(90, Math.round(dist * 1.2)));
    this.fx('missile', tx, ty, ttl, { x0: sx, y0: sy, src: c.id, r: nukePower > 0 ? 0 : 2.8, dmg: nukePower > 0 ? 0 : 60, nuke: nukePower });
  }

  // ================== 未来武器体系（未来时代军备：定向能/蜂群/轨道/机甲/等离子/反物质） ==================

  /** 激光炮台：从己方前沿阵地向敌军单位射出瞬时相干光束（线杀伤 + 焦点全伤） */
  launchLaser(c: Civ, foe: Civ) {
    // 目标：敌国单位随机采样（军职加权优先——狙杀战斗人员）
    let tgt: Unit | null = null;
    let bestScore = 0;
    for (let k = 0; k < 12; k++) {
      const u = this.units[Math.floor(this.rng() * this.units.length)];
      if (!u || u.dead || u.civ !== foe.id) continue;
      const s = (u.job === 1 || u.job === 2 ? 2 : 1) + this.rng();
      if (s > bestScore) { bestScore = s; tgt = u; }
    }
    if (!tgt) return;
    // 炮位：距目标最近的己方建筑（前沿激光阵地）
    let sx = this.civCenterX(c);
    let sy = this.civCenterY(c);
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.civ !== c.id) continue;
      const d = Math.hypot(b.x - tgt.x, b.y - tgt.y);
      if (d < bestD) { bestD = d; sx = b.x + 0.5; sy = b.y + 0.5; }
    }
    if (bestD < 3) return;
    this.fx('laser', tgt.x, tgt.y, 8, { x0: sx, y0: sy, src: c.id, dmg: 34 + this.rng() * 14 });
  }

  /** 无人机蜂群：从腹地放飞自主蜂群，沿途游猎扫射，终点集束爆破 */
  launchDroneSwarm(c: Civ, tx: number, ty: number) {
    const sx = this.civCenterX(c);
    const sy = this.civCenterY(c);
    const dist = Math.hypot(tx - sx, ty - sy);
    const ttl = Math.max(50, Math.min(150, Math.round(dist * 1.9)));
    this.fx('drone', tx, ty, ttl, { x0: sx, y0: sy, src: c.id, r: 2.6, dmg: 14 + this.rng() * 6 });
  }

  /** 轨道天罚：天基动能平台投下钨棒（天顶垂直坠落 → 大威力爆破 + 地形焦化） */
  launchOrbital(c: Civ, tx: number, ty: number) {
    this.fx('orbital', tx, ty, 30, { src: c.id });
    if (this.rng() < 0.5) this.onSound?.('nuke');
  }

  /** 等离子炮：慢速电浆光球（命中大威力爆破 + 电磁脉冲击溃周遭士气） */
  launchPlasma(c: Civ, tx: number, ty: number) {
    const sx = this.civCenterX(c);
    const sy = this.civCenterY(c);
    const dist = Math.hypot(tx - sx, ty - sy);
    const ttl = Math.max(45, Math.min(110, Math.round(dist * 1.5)));
    this.fx('plasma', tx, ty, ttl, { x0: sx, y0: sy, src: c.id, r: 3.2, dmg: 78 + this.rng() * 22 });
  }

  /** 反物质打击：湮灭天启（全屏白闪 + 半径湮灭 + 地形玻璃化） */
  launchAntimatter(c: Civ, tx: number, ty: number) {
    const sx = this.civCenterX(c);
    const sy = this.civCenterY(c);
    const dist = Math.hypot(tx - sx, ty - sy);
    const ttl = Math.max(50, Math.min(130, Math.round(dist * 1.4)));
    this.fx('antimatter', tx, ty, ttl, { x0: sx, y0: sy, src: c.id });
  }

  /** 机甲突击：机械化军团放出大型双足机甲（地面推进 + 沿途机炮扫射 + 终点爆破） */
  launchMech(c: Civ, fromX: number, fromY: number, tx: number, ty: number) {
    const dist = Math.hypot(tx - fromX, ty - fromY);
    if (dist < 4) return;
    const ttl = Math.max(40, Math.min(110, Math.round(dist * 1.2)));
    this.fx('mech', tx, ty, ttl, { x0: fromX, y0: fromY, src: c.id, r: 2.2, dmg: 40 + this.rng() * 10 });
  }

  /** 反物质湮灭结算：范围内敌方单位归零 + 地形玻璃化（中心熔融 + 外环焦土）+ 全屏白闪 */
  annihilate(x: number, y: number, r: number, src: number) {
    for (const u of this.units) {
      if (u.dead) continue;
      if (src >= 0 && u.civ === src) continue; // 施放国豁免（与弹体豁免一致）
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < r) {
        u.hp -= 600;
        u.hurt = 40;
        if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
      }
    }
    const rr = Math.ceil(r);
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        if (d > r) continue;
        const i = idx(xx, yy);
        if (this.building[i] > 0) this.destroyBuilding(i);
        if (isLand(this.terrain[i])) {
          // 玻璃化：中心熔融成岩浆池，外环焦土玻璃
          if (d < r * 0.28) this.setTerrain(i, T.LAVA);
          else if (this.terrain[i] !== T.MOUNTAIN) this.setTerrain(i, T.BURNT);
        }
      }
    }
    // 全屏白闪（复用核爆闪光通道）+ 双层爆炸特效 + 强震屏
    this.fx('flash', x, y, 26, { r: 3 });
    this.fx('explosion', x, y, 30, { r: r * 0.7 });
    this.fx('mushroom', x, y, 60, { r: r * 0.9 });
    this.shake = Math.max(this.shake, 12);
    this.onSound?.('nuke');
  }


  /** 弹体落点爆破（炮弹/炸弹/常规导弹）：伤害衰减 + 建筑损毁 + 可选纵火 */
  shellBurst(x: number, y: number, r: number, dmg: number, fire = false, src = -1) {
    for (const u of this.units) {
      if (u.dead) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < r + 0.4) {
        u.hp -= dmg * Math.max(0.25, 1 - d / (r + 0.4));
        u.hurt = 24;
        if (u.hp <= 0) {
          u.dead = true;
          this.wwCountKill(u);
        }
      }
    }
    const rr = Math.ceil(r);
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) > r) continue;
        const i = idx(xx, yy);
        if (this.building[i] > 0) this.attackBuilding(i, dmg * 0.9, src);
        if (fire && isLand(this.terrain[i]) && this.terrain[i] !== T.MOUNTAIN && this.rng() < 0.45) this.ignite(i);
      }
    }
    this.fx('explosion', x, y, 16, { r });
    this.shake = Math.max(this.shake, Math.min(5, 1 + r));
  }

  /** 开发者：全文明工业革命（瞬间授予工业时代科技——现代武器铺开的前提） */
  devModernize(): number {
    const KEYS = ['steam', 'gunpowder', 'assembly', 'sanitation', 'rifling', 'explosives', 'flight', 'atomic'];
    let n = 0;
    for (const c of this.civs) {
      if (!c.alive || c.pop <= 0) continue;
      if (!c.techs) c.techs = [];
      let added = 0;
      for (const k of KEYS) {
        if (c.techs.includes(k)) continue;
        c.techs.push(k);
        added++;
      }
      if (added <= 0) continue;
      this.techModCache.delete(c.id);
      c.research = null;
      c.researchP = 0;
      n += added;
      this.addEvent('tech', `「${c.name}」一夜完成工业革命——蒸汽机轰鸣，枪炮列装，轰炸机蓄势待发（军备：现代）`, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
      // 现有建筑随工程科技加固耐久
      const mul = this.techModsOf(c.id).bhp;
      for (const b of this.buildings) {
        if (b.civ !== c.id) continue;
        const base = BUILDING_DEFS[b.kind]?.hp ?? 70;
        const max = Math.round(base * mul);
        this.bHp.set(b.i, Math.min(max, (this.bHp.get(b.i) ?? base) + base * 0.4));
      }
    }
    if (n > 0) this.toast(`工业革命降临：${n} 项现代科技普及诸国`, 'info');
    this.statsTick();
    return n;
  }

  /** 开发者：全文明未来革命（瞬间授予未来时代科技——激光/蜂群/轨道/机甲/等离子/反物质全面铺开） */
  devTranscend(): number {
    const KEYS = ['electronics', 'singularity', 'robotics', 'lasers', 'drones', 'orbital', 'plasma', 'antimatter'];
    let n = 0;
    for (const c of this.civs) {
      if (!c.alive || c.pop <= 0) continue;
      if (!c.techs) c.techs = [];
      // 现代科技铺底（未来武器依赖链）
      const BASE = ['steam', 'gunpowder', 'assembly', 'rifling', 'explosives', 'flight', 'atomic', 'astronomy', 'republic', 'machinery', 'banking', 'crop4', 'medicine'];
      let added = 0;
      for (const k of [...BASE, ...KEYS]) {
        if (c.techs.includes(k)) continue;
        c.techs.push(k);
        added++;
      }
      if (added <= 0) continue;
      this.techModCache.delete(c.id);
      c.research = null;
      c.researchP = 0;
      n += added;
      this.addEvent('tech', `「${c.name}」跨入奇点——量子机房嗡鸣，机甲列装，轨道平台展开（军备：未来）`, { colorHex: c.colorHex, x: this.civCenterX(c), y: this.civCenterY(c) });
      // 建筑随未来工程科技加固耐久
      const mul = this.techModsOf(c.id).bhp;
      for (const b of this.buildings) {
        if (b.civ !== c.id) continue;
        const base = BUILDING_DEFS[b.kind]?.hp ?? 70;
        const max = Math.round(base * mul);
        this.bHp.set(b.i, Math.min(max, (this.bHp.get(b.i) ?? base) + base * 0.5));
      }
    }
    if (n > 0) this.toast(`未来革命降临：${n} 项未来科技普及诸国`, 'info');
    this.statsTick();
    return n;
  }

  // ---------------- 自然引擎开发者驱动 ----------------

  /** 开发者：在应力最高的板块边界强制释放一次强震（含海啸判定） */
  devQuake(): boolean {
    let best = -1;
    let bestS = -1;
    for (const i of this.nature.boundary) {
      if (this.nature.stress[i] > bestS) { bestS = this.nature.stress[i]; best = i; }
    }
    if (best < 0) best = Math.floor(this.rng() * W * H); // 无边界则随机震中
    // 先注满应力再释放（保证震级可观）
    for (const i of this.nature.boundary) {
      const d = Math.hypot((i % W) - (best % W), ((i / W) | 0) - ((best / W) | 0));
      if (d < 7) this.nature.stress[i] = Math.max(this.nature.stress[i], NatureSystem.RELEASE * 0.9);
    }
    this.nature.releaseQuake(best);
    return true;
  }

  /** 开发者：随机火山热点立即大喷发（注入火山灰 → 火山冬链路） */
  devVolcano(): boolean {
    const hs = this.nature.hotspots;
    if (hs.length === 0) return false;
    const h = hs[Math.floor(this.rng() * hs.length)];
    this.volcano(h.x, h.y, 3);
    this.nature.counters.eruptions++;
    // v2：灰烬注入平流场（与自然喷发同路径——先区域后全球）
    const cell = this.nature.cellOf(h.x, h.y);
    this.nature.ashF[cell] = Math.min(1, this.nature.ashF[cell] + 0.55);
    const cxx = cell % AW;
    const cyy = (cell / AW) | 0;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cxx + ox;
      const ny = cyy + oy;
      if (nx < 0 || ny < 0 || nx >= AW || ny >= AH) continue;
      this.nature.ashF[ny * AW + nx] = Math.min(1, this.nature.ashF[ny * AW + nx] + 0.22);
    }
    let sum = 0;
    for (let k = 0; k < AW * AH; k++) sum += this.nature.ashF[k];
    this.nature.ash = sum / (AW * AH);
    for (let i = 0; i < W * H; i++) this.dirty.add(i);
    return true;
  }

  /** 开发者：镜头附近暖洋生成一个强气旋（若无暖洋则强制生成于随机洋面） */
  devCyclone(): boolean {
    const cx = Math.min(AW - 1, Math.max(0, (this.cam.x / 8) | 0));
    const cy = Math.min(AH - 1, Math.max(0, (this.cam.y / 8) | 0));
    let sx = -1;
    let sy = -1;
    for (let r = 0; r < 8 && sx < 0; r++) {
      for (let tr = 0; tr < 12; tr++) {
        const ax = Math.min(AW - 1, Math.max(0, cx + Math.floor(this.rng() * (r * 2 + 1)) - r));
        const ay = Math.min(AH - 1, Math.max(0, cy + Math.floor(this.rng() * (r * 2 + 1)) - r));
        const st = this.nature.cellStats(ax, ay);
        if (st.waterFrac > 0.8) { sx = ax; sy = ay; break; }
      }
    }
    if (sx < 0) return false;
    this.nature.storms.push({
      id: this.nature.stormSeq++,
      x: sx * 8 + 4,
      y: sy * 8 + 4,
      strength: 0.85,
      ttl: 500,
      seed: Math.floor(this.rng() * 65536),
      kind: 'cyclone',
      name: STORM_NAME_AT(this.nature.stormSeq - 1),
      landed: false,
    });
    this.nature.counters.cyclones++;
    this.addEvent('geo', `开发者之手搅动海洋——强气旋「${this.nature.storms[this.nature.storms.length - 1].name}」瞬息成形`, { x: sx * 8 + 4, y: sy * 8 + 4 });
    return true;
  }

  /** 开发者：季节快进一档（春→夏→秋→冬循环；立即全图刷新色调）
   *  lastSeason 置为「上一季」而非 -1——seasonCheck 将其视为真实过渡，换季宣告照常触发 */
  devNextSeason(): number {
    this.nature.seasonOffset = (this.nature.seasonOffset + 1) % 4;
    this.nature.lastSeason = (this.nature.season + 3) % 4;
    this.nature.seasonCheck();
    this.statsTick();
    return this.nature.season;
  }

  // ---------------- effects & disasters ----------------
  /** 特效密度档位 → 同屏上限（低/标准/华丽） */
  static readonly FX_CAPS = [260, 620, 1500] as const;
  /** 次要特效类型（满员时优先逐出/丢弃） */
  static readonly FX_MINOR: ReadonlySet<Effect['kind']> = new Set(['dmg', 'hit', 'smoke', 'spawn', 'heart', 'skull', 'arrow', 'coin', 'blood', 'dust', 'bullet', 'frost'] as Effect['kind'][]);

  fx(kind: Effect['kind'], x: number, y: number, ttl: number, opts?: Partial<Effect>): Effect | null {
    // 特效总量控制：同屏超出上限时先逐出最老的次要特效；全是关键特效时丢弃新的次要特效（天灾必须可见）
    const cap = GameEngine.FX_CAPS[this.fxPrefs.fxDensity ?? 1] ?? 620;
    if (this.effects.length >= cap) {
      // 手写线性查找替代 findIndex 闭包（特效满载时每次触发都分配闭包 —— 战斗高峰热路径）
      let victim = -1;
      for (let i = 0; i < this.effects.length; i++) {
        if (GameEngine.FX_MINOR.has(this.effects[i].kind)) { victim = i; break; }
      }
      if (victim >= 0) this.effects.splice(victim, 1);
      else if (GameEngine.FX_MINOR.has(kind)) return null; // 满且无次要可逐 → 新次要特效直接丢弃
    }
    const e: Effect = {
      kind, x, y, x0: x, y0: y, r: 1, age: 0, ttl, seed: Math.floor(this.rng() * 65536), dir: this.rng() * Math.PI * 2,
      ...opts,
    };
    this.effects.push(e);
    return e;
  }

  effectsTick() {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age++;
      if (e.kind === 'tornado') {
        e.dir += (this.rng() - 0.5) * 0.35;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.2));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.2));
        for (const u of this.units) {
          if (u.dead) continue;
          const d = Math.hypot(u.x - e.x, u.y - e.y);
          if (d < 3.2) {
            const nx = u.x + ((u.x - e.x) / (d + 0.01)) * 0.4;
            const ny = u.y + ((u.y - e.y) / (d + 0.01)) * 0.4;
            if (walkable(this.terrain[idx(Math.floor(nx), Math.floor(ny))]) || RACES[u.race].flying) {
              u.x = Math.max(0.5, Math.min(W - 0.5, nx));
              u.y = Math.max(0.5, Math.min(H - 0.5, ny));
            }
            u.hurt = 16;
            if (d < 2.2) u.hp -= 1.2;
          }
        }
        const ti = idx(Math.floor(e.x), Math.floor(e.y));
        if (this.building[ti] > 0 && this.rng() < 0.3) this.destroyBuilding(ti);
        if (this.terrain[ti] === T.FOREST && this.rng() < 0.08) this.setTerrain(ti, T.GRASS);
      } else if (e.kind === 'acid') {
        // 酸雨云：每 tick 腐蚀云内生物（飞行者也难幸免）+ 随机枯萎植被 + 蚀损建筑
        const ar2 = e.r * e.r; // 云盖半径平方（每 tick 常量，提出循环）
        for (const u of this.units) {
          if (u.dead) continue;
          const adx = u.x - e.x;
          const ady = u.y - e.y;
          if (adx * adx + ady * ady < ar2) {
            u.hp -= 0.3;
            u.hurt = 10;
            if (u.hp <= 0) u.dead = true;
          }
        }
        if (this.rng() < 0.9) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS && this.rng() < 0.55) this.setTerrain(j, T.BURNT);
            else if (t === T.FOREST && this.rng() < 0.35) this.setTerrain(j, T.GRASS);
            else if (t === T.SNOW && this.rng() < 0.3) this.setTerrain(j, T.GRASS);
            if (this.building[j] > 0 && this.rng() < 0.1) this.attackBuilding(j, 3, -1);
          }
        }
      } else if (e.kind === 'volcano') {
        // 火山喷发：周期性喷出熔岩弹 + 岩浆外溢 + 山脚灼伤（锥体在 volcano() 中已隆起）
        this.shake = Math.max(this.shake, 2);
        if (e.age % 14 === 0 && e.age < e.ttl - 20) {
          const ang = this.rng() * Math.PI * 2;
          const rr = 2 + this.rng() * 6;
          const tx = e.x + Math.cos(ang) * rr;
          const ty = e.y + Math.sin(ang) * rr;
          if (tx > 1 && ty > 1 && tx < W - 2 && ty < H - 2) {
            const m = this.fx('meteor', tx, ty, 24);
            if (m) { m.x0 = e.x + 8; m.y0 = e.y - 20; m.quiet = true; }
          }
        }
        if (e.age % 6 === 0) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * 2.5;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          // 采样点始终在锥体（r<2.5）内 → 允许侵蚀山体形成熔岩流坡面
          if (j >= 0 && j < W * H && this.terrain[j] !== T.LAVA && !isWater(this.terrain[j])) this.setTerrain(j, T.LAVA);
        }
        for (const u of this.units) {
          if (u.dead) continue;
          const vdx = u.x - e.x;
          const vdy = u.y - e.y;
          if (vdx * vdx + vdy * vdy < 6.25 && !RACES[u.race].lavaImmune) { u.hp -= 0.8; u.hurt = 12; if (u.hp <= 0) u.dead = true; } // 2.5² 平方距离
        }
      } else if (e.kind === 'tsunami') {
        // 海啸：波前环形扩张，扫过之处低地没顶、建筑倾覆、生物溺水
        const t = e.age / e.ttl;
        const waveR = 1 + t * e.r;
        const prevR = 1 + ((e.age - 1) / e.ttl) * e.r;
        // 波前判定的平方半径（两处循环共用；纯阈值比较走平方距离免三角函数）
        const prevR2 = prevR * prevR;
        const waveR2 = waveR * waveR;
        const waveRu2 = (waveR + 1) * (waveR + 1);
        for (let yy = Math.floor(e.y - waveR); yy <= e.y + waveR; yy++) {
          for (let xx = Math.floor(e.x - waveR); xx <= e.x + waveR; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const ddx = xx + 0.5 - e.x;
            const ddy = yy + 0.5 - e.y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 >= prevR2 && d2 < waveR2) {
              const j = idx(xx, yy);
              const tt = this.terrain[j];
              // 山脉/丘陵/岩浆/冰面幸存；低地化为汪洋（洪水会退潮 — 湿沙→沙滩）
              if (tt !== T.MOUNTAIN && tt !== T.HILL && tt !== T.WATER && tt !== T.DEEP && tt !== T.LAVA && tt !== T.ICE) {
                this.setTerrain(j, T.WATER);
                this.flood.set(j, this.tickCount + 240 + Math.floor(this.rng() * 120)); // 6~9 年后退潮
                if (this.building[j] > 0) this.destroyBuilding(j);
              }
            }
          }
        }
        // 波前生物：溺水（非飞行/航海者）
        for (const u of this.units) {
          if (u.dead || u.boat) continue;
          const udx = u.x - e.x;
          const udy = u.y - e.y;
          const ud2 = udx * udx + udy * udy;
          if (ud2 >= prevR2 && ud2 < waveRu2 && !RACES[u.race].flying) {
            u.hp -= 60; u.hurt = 24; if (u.hp <= 0) u.dead = true;
          }
        }
        if (e.age === 1) this.shake = Math.max(this.shake, 6);
      } else if (e.kind === 'blizzard') {
        // 暴风雪：游荡冰暴 —— 冻结大地为雪原 + 生物寒伤减速（寒地种族免疫）
        e.dir += (this.rng() - 0.5) * 0.3;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.12));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.12));
        const br2 = e.r * e.r; // 云盖半径平方（每 tick 常量，提出循环）
        for (const u of this.units) {
          if (u.dead) continue;
          const bdx = u.x - e.x;
          const bdy = u.y - e.y;
          if (bdx * bdx + bdy * bdy < br2) {
            const coldBorn = u.race === R.PENGUIN || u.race === R.SNOWWOLF || u.race === R.WHITEWALKER;
            if (!coldBorn) {
              u.hp -= 0.22; u.hurt = 8; u.chill = 14;
              if (u.hp <= 0) u.dead = true;
            }
          }
        }
        if (this.rng() < 0.8) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS || t === T.BURNT) this.setTerrain(j, T.SNOW);
            else if (t === T.FOREST && this.rng() < 0.4) this.setTerrain(j, T.SNOW);
            else if (t === T.SAND && this.rng() < 0.2) this.setTerrain(j, T.SNOW);
            // 原子级：暴风雪冻结水面（浅水优先，深海更难冻实）
            else if (t === T.WATER && this.rng() < 0.45) this.setTerrain(j, T.ICE);
            else if (t === T.DEEP && this.rng() < 0.06) this.setTerrain(j, T.ICE);
            // 寒霜也压熄火焰
            if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); }
          }
        }
      } else if (e.kind === 'locust') {
        // 蝗群：游荡虫群 —— 吞噬植被与农田
        e.dir += (this.rng() - 0.5) * 0.25;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.15));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.15));
        const lr2 = e.r * e.r; // 云盖半径平方（每 tick 常量，提出循环）
        for (const u of this.units) {
          if (u.dead) continue;
          const ldx = u.x - e.x;
          const ldy = u.y - e.y;
          if (ldx * ldx + ldy * ldy < lr2) { u.hp -= 0.06; if (u.hp <= 0) u.dead = true; }
        }
        if (this.rng() < 0.95) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS && this.rng() < 0.6) this.setTerrain(j, T.BURNT);
            else if (t === T.FOREST && this.rng() < 0.25) this.setTerrain(j, T.GRASS);
            if (this.building[j] === BUILD_KINDS.FARM) this.attackBuilding(j, 4, -1);
          }
        }
      } else if (e.kind === 'drought') {
        // 干旱：灼热穹顶 —— 草枯为沙、林化为烬、浅水蒸发、生物热衰竭
        if (this.rng() < 0.85) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS && this.rng() < 0.5) this.setTerrain(j, T.SAND);
            else if (t === T.FOREST && this.rng() < 0.3) this.setTerrain(j, T.BURNT);
            else if (t === T.WATER && this.rng() < 0.25) this.setTerrain(j, T.SAND);
            // 热浪融冰：干旱穹顶下的冰面无法存留
            else if (t === T.ICE && this.rng() < 0.4) this.meltIce(j);
          }
        }
        const dr2 = e.r * e.r; // 穹顶半径平方（每 tick 常量，提出循环）
        for (const u of this.units) {
          if (u.dead) continue;
          const ddx2 = u.x - e.x;
          const ddy2 = u.y - e.y;
          if (ddx2 * ddx2 + ddy2 * ddy2 < dr2) {
            const heatproof = u.race === R.SKELETON || u.race === R.DEMON || u.race === R.ZOMBIE;
            if (!heatproof) { u.hp -= 0.15; u.hurt = 6; if (u.hp <= 0) u.dead = true; }
          }
        }
      } else if (e.kind === 'rainstorm') {
        // 唤雨云：游荡甘霖 —— 浇灭火焰、洗净辐射、复苏焦土为草原
        e.dir += (this.rng() - 0.5) * 0.2;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.1));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.1));
        if (this.rng() < 1.2) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); this.fx('water', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14); }
            else if (this.radiate[j] > 0) { this.radiate[j] = 0; this.radSet.delete(j); this.markDirty(j); }
            else if (this.terrain[j] === T.BURNT && this.rng() < 0.3) { this.setTerrain(j, T.GRASS); this.fx('water', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14); }
            else if (this.terrain[j] === T.SNOW && this.rng() < 0.1) this.setTerrain(j, T.GRASS);
          }
        }
        // 治疗雨中生物（微弱生命甘霖）
        if (this.rng() < 0.5) {
          const rr2 = e.r * e.r; // 云盖半径平方（提出循环）
          for (const u of this.units) {
            if (u.dead) continue;
            const rdx = u.x - e.x;
            const rdy = u.y - e.y;
            if (rdx * rdx + rdy * rdy < rr2 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 0.3);
          }
        }
      } else if (e.kind === 'wrath') {
        // 天罚风暴：怒云持续降下雷电（雷暴域）
        if (e.age % 10 === 0 && e.age < e.ttl - 12) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          this.lightning(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr);
        }
      } else if (e.kind === 'holystorm') {
        // 圣光风暴：金色圣云游荡 —— 审判黑暗（亡灵/恶魔/巨龙 圣炎灼烧）+ 治愈无辜（微光甘霖/驱瘟）
        // + 浇灭火焰/洗净辐射/复苏焦土（与唤雨同源的善力采样）
        e.dir += (this.rng() - 0.5) * 0.2;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.1));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.1));
        if (this.rng() < 1.2) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); this.fx('water', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14); }
            else if (this.radiate[j] > 0) { this.radiate[j] = 0; this.radSet.delete(j); this.markDirty(j); }
            else if (this.terrain[j] === T.BURNT && this.rng() < 0.3) { this.setTerrain(j, T.GRASS); this.fx('spark', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14); }
          }
        }
        const hr2 = e.r * e.r;
        for (const u of this.units) {
          if (u.dead) continue;
          const hdx = u.x - e.x;
          const hdy = u.y - e.y;
          if (hdx * hdx + hdy * hdy >= hr2) continue;
          const ud = RACES[u.race];
          const dark = ud.undead || u.race === R.DEMON || u.race === R.DRAGON; // 圣光审判名单：与天使圣剑同构（不伤克拉肯/沙虫/蛇怪等自然巨兽）
          if (dark) {
            u.hp -= 0.4; // 圣炎灼烧：比酸雨（0.3）更痛 —— 黑暗在圣光下无所遁形
            u.hurt = 10;
            if (u.hp <= 0) u.dead = true;
            if (this.rng() < 0.2) this.fx('spark', u.x, u.y - 0.4, 16);
          } else if (!ud.hostile) {
            if (u.hp < u.maxHp) {
              u.hp = Math.min(u.maxHp, u.hp + 0.15); // 微光甘霖：持续缓愈
              if (this.rng() < 0.08) this.fx('bless', u.x, u.y - 0.4, 18);
            }
            if (u.infected) { u.infected = false; this.fx('bless', u.x, u.y - 0.4, 22); } // 圣光驱瘟
          }
          // 敌对自然巨兽（狼/熊/克拉肯等）：既不审判也不治愈 —— 圣光只针对超自然黑暗
        }
      } else if (e.kind === 'sandstorm') {
        // 沙尘暴：游荡沙暴 —— 草被沙埋、生物迷失风中
        e.dir += (this.rng() - 0.5) * 0.25;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.16));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.16));
        if (this.rng() < 0.9) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS && this.rng() < 0.5) this.setTerrain(j, T.SAND);
            else if (t === T.FOREST && this.rng() < 0.2) this.setTerrain(j, T.GRASS);
          }
        }
        for (const u of this.units) {
          if (u.dead) continue;
          if (Math.hypot(u.x - e.x, u.y - e.y) < e.r) {
            u.chill = 12; // 风沙迷眼：踉跄减速
            u.hp -= 0.1; u.hurt = 8;
            if (u.hp <= 0) u.dead = true;
          }
        }
      } else if (e.kind === 'typhoon') {
        // 台风：海上气旋 —— 狂风推拽 + 间歇雷电 + 暴雨灭火
        e.dir += (this.rng() - 0.5) * 0.3;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.22));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.22));
        for (const u of this.units) {
          if (u.dead) continue;
          const d = Math.hypot(u.x - e.x, u.y - e.y);
          if (d < e.r + 1.5) {
            const nx = u.x + ((u.x - e.x) / (d + 0.01)) * 0.5;
            const ny = u.y + ((u.y - e.y) / (d + 0.01)) * 0.5;
            if (walkable(this.terrain[idx(Math.floor(nx), Math.floor(ny))]) || RACES[u.race].flying) {
              u.x = Math.max(0.5, Math.min(W - 0.5, nx));
              u.y = Math.max(0.5, Math.min(H - 0.5, ny));
            }
            if (d < e.r) { u.hp -= 0.18; u.hurt = 12; if (u.hp <= 0) u.dead = true; }
          }
        }
        if (e.age % 36 === 0 && e.age < e.ttl - 15) {
          const ang = this.rng() * Math.PI * 2;
          this.lightning(e.x + Math.cos(ang) * e.r * 0.7, e.y + Math.sin(ang) * e.r * 0.7);
        }
        // 台风暴雨顺手浇熄路径上的火焰
        if (this.rng() < 0.4) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H && this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); }
        }
      } else if (e.kind === 'sinkhole') {
        // 深渊天坑：环状渐进塌陷 —— 大地没顶、建筑倾覆、生物坠落
        const t = e.age / e.ttl;
        const waveR = 0.5 + t * e.r;
        const prevR = 0.5 + ((e.age - 1) / e.ttl) * e.r;
        for (let yy = Math.floor(e.y - waveR); yy <= e.y + waveR; yy++) {
          for (let xx = Math.floor(e.x - waveR); xx <= e.x + waveR; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const d = Math.hypot(xx + 0.5 - e.x, yy + 0.5 - e.y);
            if (d >= prevR && d < waveR) {
              const j = idx(xx, yy);
              const tt = this.terrain[j];
              if (tt !== T.MOUNTAIN && tt !== T.WATER && tt !== T.DEEP && tt !== T.LAVA) {
                this.setTerrain(j, T.WATER);
                if (this.building[j] > 0) this.destroyBuilding(j);
              }
            }
          }
        }
        if (e.age % 2 === 0) this.shake = Math.max(this.shake, 4);
        // 塌陷波前生物：坠落重伤
        for (const u of this.units) {
          if (u.dead || u.boat) continue;
          const d = Math.hypot(u.x - e.x, u.y - e.y);
          if (d >= prevR && d < waveR + 0.5 && !RACES[u.race].flying) {
            u.hp -= 55; u.hurt = 24; if (u.hp <= 0) u.dead = true;
          }
        }
      } else if (e.kind === 'iceage') {
        // 冰河寒潮：静态极寒穹顶 —— 冻结大地 + 寒伤（寒地种族免疫）
        if (this.rng() < 1.6) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS || t === T.BURNT || t === T.SAND) this.setTerrain(j, T.SNOW);
            else if (t === T.FOREST && this.rng() < 0.5) this.setTerrain(j, T.SNOW);
            else if (t === T.WATER && this.rng() < 0.55) this.setTerrain(j, T.ICE);
            else if (t === T.DEEP && this.rng() < 0.08) this.setTerrain(j, T.ICE);
            if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); }
          }
        }
        for (const u of this.units) {
          if (u.dead) continue;
          if (Math.hypot(u.x - e.x, u.y - e.y) < e.r) {
            const coldBorn = u.race === R.PENGUIN || u.race === R.SNOWWOLF || u.race === R.WHITEWALKER;
            if (!coldBorn) { u.hp -= 0.26; u.hurt = 8; u.chill = 16; if (u.hp <= 0) u.dead = true; }
          }
        }
      } else if (e.kind === 'famine') {
        // 饥荒：贫瘠之云 —— 生灵饿殍、田园荒芜
        e.dir += (this.rng() - 0.5) * 0.22;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.12));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.12));
        for (const u of this.units) {
          if (u.dead) continue;
          if (Math.hypot(u.x - e.x, u.y - e.y) < e.r) {
            const undead = RACES[u.race].undead;
            if (!undead) { u.hp -= 0.24; u.hurt = 10; if (u.hp <= 0) u.dead = true; }
          }
        }
        if (this.rng() < 0.7) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            if (this.building[j] === BUILD_KINDS.FARM) this.attackBuilding(j, 4, -1);
            else if (this.terrain[j] === T.GRASS && this.rng() < 0.12) this.setTerrain(j, T.BURNT); // 寸草不生
          }
        }
      } else if (e.kind === 'blackhole') {
        // 黑洞：时空陷阱 —— 吸引力随时间增长，末期奇点爆发湮灭
        const pullR = e.r * Math.min(1, e.age / 50 + 0.25);
        for (const u of this.units) {
          if (u.dead) continue;
          const d = Math.hypot(u.x - e.x, u.y - e.y);
          if (d < pullR && d > 0.3) {
            const pull = Math.min(1.1, 0.35 + (pullR - d) * 0.12);
            u.x += ((e.x - u.x) / d) * pull;
            u.y += ((e.y - u.y) / d) * pull;
            u.hurt = 10;
            if (d < 1.2) { u.hp -= 1.5; if (u.hp <= 0) u.dead = true; }
          }
        }
        if (e.age >= e.ttl - 1) {
          // 奇点爆发：内圈湮灭 + 焦土坑
          for (const u of this.units) {
            if (!u.dead && Math.hypot(u.x - e.x, u.y - e.y) < 3.5) u.dead = true;
          }
          for (let yy = Math.floor(e.y - 3); yy <= e.y + 3; yy++) {
            for (let xx = Math.floor(e.x - 3); xx <= e.x + 3; xx++) {
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              const j = idx(xx, yy);
              if (Math.hypot(xx + 0.5 - e.x, yy + 0.5 - e.y) < 3) {
                if (this.building[j] > 0) this.destroyBuilding(j);
                if (this.terrain[j] !== T.WATER && this.terrain[j] !== T.DEEP) this.setTerrain(j, T.BURNT);
              }
            }
          }
          this.fx('explosion', e.x, e.y, 26, { r: 3 });
          this.shake = Math.max(this.shake, 9);
          this.onSound?.('boom');
        }
      } else if (e.kind === 'quake') {
        this.shake = 7;
        if (this.rng() < 0.35) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const xx = Math.floor(e.x + Math.cos(ang) * rr);
          const yy = Math.floor(e.y + Math.sin(ang) * rr);
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
            const j = idx(xx, yy);
            if (this.building[j] > 0) this.destroyBuilding(j);
            else if ((this.terrain[j] === T.GRASS || this.terrain[j] === T.FOREST) && this.rng() < 0.3) this.setTerrain(j, T.BURNT);
          }
        }
      } else if (e.kind === 'meteor' && e.age >= e.ttl) {
        this.explode(e.x, e.y, 4.2, { terrain: true });
        if (!e.quiet) this.addEvent('meteor', '一颗燃烧的陨石轰然坠地', { x: e.x, y: e.y });
      } else if (e.kind === 'fireball' && e.age >= e.ttl) {
        // 法师火球命中：溅射伤害（法师自身免疫友军伤害规避）+ 点燃地面
        for (const u of this.units) {
          if (u.dead || u.race === R.MAGE) continue;
          const d = Math.hypot(u.x - e.x, u.y - e.y);
          if (d < 1.15) {
            u.hp -= e.r;
            u.hurt = 20;
            if (u.hp <= 0) u.dead = true;
          }
        }
        this.fx('explosion', e.x, e.y, 14, { r: 0.9 });
        // 法师火球不再点燃建筑格（战争不纵火；只灼焦空地）
        const fi = idx(Math.floor(e.x), Math.floor(e.y));
        if (fi >= 0 && fi < W * H && this.building[fi] === 0) this.ignite(fi);
      } else if ((e.kind === 'arrow' || e.kind === 'bullet') && e.age >= e.ttl) {
        // 箭矢/子弹命中：单体伤害（豁友军）+ 命中点敌国建筑耐久
        let hit: Unit | null = null;
        let hitD = 1.1;
        const abx = Math.min(this.bw - 1, Math.max(0, Math.floor(e.x / 4)));
        const aby = Math.min(this.bh - 1, Math.max(0, Math.floor(e.y / 4)));
        for (let by = aby - 1; by <= aby + 1; by++) {
          for (let bx = abx - 1; bx <= abx + 1; bx++) {
            if (bx < 0 || by < 0 || bx >= this.bw || by >= this.bh) continue;
            for (const o of this.buckets[by * this.bw + bx]) {
              if (o.dead) continue;
              if (e.src !== undefined && o.civ === e.src) continue; // 不误伤友军
              const d = Math.hypot(o.x - e.x, o.y - e.y);
              if (d < hitD) { hitD = d; hit = o; }
            }
          }
        }
        if (hit) {
          const dmg = e.dmg ?? 6;
          // 目标装备减伤结算
          const gD = RACES[hit.race].isCiv ? this.gearBonus(hit) : null;
          const final = gD && gD.armor > 0 ? dmg * (1 - gD.armor / 100) : dmg;
          hit.hp -= final;
          hit.hurt = 20;
          this.fx('hit', e.x, e.y, 6);
          if (this.fxPrefs.dmgNumbers && (final >= 10 || this.rng() < 0.3)) this.fx('dmg', hit.x, hit.y, 24, { text: '-' + Math.round(final) });
          if (hit.hp <= 0) {
            hit.dead = true;
            this.wwCountKill(hit); // 大战阵亡计数（枪械/箭矢命中致死）
          }
        } else {
          // 落点敌国建筑：箭矢/炮弹轰击城墙
          const fi = idx(Math.floor(e.x), Math.floor(e.y));
          if (fi >= 0 && fi < W * H && this.building[fi] > 0) {
            const b = this.buildings[this.bIdx.get(fi) ?? -1];
            if (b && e.src !== undefined && b.civ !== e.src && b.civ >= 0 && e.src >= 0 && this.atWar(e.src, b.civ)) {
              this.attackBuilding(fi, (e.dmg ?? 6) * 0.8, e.src);
            }
          }
        }
      } else if (e.kind === 'shell' && e.age >= e.ttl) {
        // 炮弹落地：抛物线弹道终点爆破（伤害 + 建筑损毁 + 可选纵火）；wid = 涌现武器归属
        this.killCredit = e.wid ?? null;
        this.shellBurst(e.x, e.y, e.r || 1.6, e.dmg ?? 30, !!e.fire, e.src ?? -1);
        if (e.wid != null) this.emergentPayload(e);
        this.killCredit = null;
        if (this.rng() < 0.2) this.onSound?.('boom');
      } else if (e.kind === 'missile' && e.age >= e.ttl) {
        // 导弹命中：核弹头 → 蘑菇云；常规 → 大威力爆破 + 纵火
        if (e.nuke && e.nuke > 0) {
          this.addEvent('nuke', `蘑菇云在战场上升起——核打击命中`, { x: e.x, y: e.y });
          this.nuke(e.x, e.y, e.nuke);
        } else {
          this.shellBurst(e.x, e.y, e.r || 2.8, e.dmg ?? 60, true, e.src ?? -1);
          this.onSound?.('boom');
        }
      } else if (e.kind === 'airstrike') {
        // 轰炸机：沿航线飞行，周期性投弹；抵达终点收尾爆破
        const at = Math.min(1, e.age / e.ttl);
        const ax = (e.x0 ?? e.x) + (e.x - (e.x0 ?? e.x)) * at;
        const ay = (e.y0 ?? e.y) + (e.y - (e.y0 ?? e.y)) * at;
        if (e.age > 6 && e.age % 16 === 0 && at < 0.92) {
          this.shellBurst(ax, ay, 1.2, 22, this.rng() < 0.4, e.src ?? -1);
        }
        if (e.age >= e.ttl) {
          this.shellBurst(e.x, e.y, e.r || 1.8, e.dmg ?? 30, true, e.src ?? -1);
          this.onSound?.('boom');
        }
      } else if (e.kind === 'laser' && e.age >= e.ttl) {
        // 激光命中：光束线杀伤（距弹道线 < 0.75 的敌军）+ 焦点处全伤 + 终点小爆破
        const lsx = e.x0 ?? e.x;
        const lsy = e.y0 ?? e.y;
        const ldx = e.x - lsx;
        const ldy = e.y - lsy;
        const llen = Math.hypot(ldx, ldy) || 1;
        const lux = ldx / llen;
        const luy = ldy / llen;
        const ldmg = e.dmg ?? 30;
        this.killCredit = e.wid ?? null;
        for (const u of this.units) {
          if (u.dead) continue;
          if (e.src !== undefined && u.civ === e.src) continue;
          const px = u.x - lsx;
          const py = u.y - lsy;
          const t = Math.max(0, Math.min(llen, px * lux + py * luy));
          const d = Math.hypot(px - lux * t, py - luy * t);
          if (d < 0.75) {
            const final = t / llen > 0.85 ? ldmg : ldmg * 0.7; // 焦点（弹道末段）全伤
            u.hp -= final;
            u.hurt = 22;
            this.fx('hit', u.x, u.y, 6);
            if (this.fxPrefs.dmgNumbers && this.rng() < 0.4) this.fx('dmg', u.x, u.y, 24, { text: '-' + Math.round(final) });
            if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
          }
        }
        if (e.wid != null) this.emergentPayload(e);
        this.killCredit = null;
        this.fx('explosion', e.x, e.y, 10, { r: 0.8 });
      } else if (e.kind === 'drone') {
        // 无人机蜂群：沿航线游猎扫射（周期小爆破）；抵达终点集束爆破
        const dt = Math.min(1, e.age / e.ttl);
        const dxp = (e.x0 ?? e.x) + (e.x - (e.x0 ?? e.x)) * dt;
        const dyp = (e.y0 ?? e.y) + (e.y - (e.y0 ?? e.y)) * dt;
        if (e.age > 8 && e.age % 12 === 0 && dt < 0.92) {
          this.killCredit = e.wid ?? null;
          this.shellBurst(dxp, dyp, 1.0, e.dmg ?? 14, false, e.src ?? -1);
          this.killCredit = null;
        }
        if (e.age >= e.ttl) {
          this.killCredit = e.wid ?? null;
          this.shellBurst(e.x, e.y, e.r || 2.6, (e.dmg ?? 14) * 2.6, true, e.src ?? -1);
          if (e.wid != null) this.emergentPayload(e);
          this.killCredit = null;
          this.onSound?.('boom');
        }
      } else if (e.kind === 'orbital' && e.age >= e.ttl) {
        // 轨道天罚命中：天顶动能钨棒大爆破 + 地形焦化环 + 强震屏
        const or = 4.5;
        this.killCredit = e.wid ?? null;
        this.shellBurst(e.x, e.y, or, 120, true, e.src ?? -1);
        for (let yy = Math.floor(e.y - or); yy <= e.y + or; yy++) {
          for (let xx = Math.floor(e.x - or); xx <= e.x + or; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const d = Math.hypot(xx + 0.5 - e.x, yy + 0.5 - e.y);
            if (d < or && isLand(this.terrain[idx(xx, yy)]) && this.terrain[idx(xx, yy)] !== T.MOUNTAIN && this.rng() < 0.8) {
              this.setTerrain(idx(xx, yy), T.BURNT);
            }
          }
        }
        this.addEvent('superweapon', '天罚降临——钨棒轰然砸穿大地，留下焦黑的弹坑', { x: e.x, y: e.y });
        if (e.wid != null) this.emergentPayload(e);
        this.killCredit = null;
        this.shake = Math.max(this.shake, 9);
        this.onSound?.('nuke');
      } else if (e.kind === 'mech') {
        // 机甲突击：地面推进沿途机炮扫射（小杀伤 + 曳光视觉）；抵达终点爆破
        const mt = Math.min(1, e.age / e.ttl);
        const mx = (e.x0 ?? e.x) + (e.x - (e.x0 ?? e.x)) * mt;
        const my = (e.y0 ?? e.y) + (e.y - (e.y0 ?? e.y)) * mt;
        if (e.age > 6 && e.age % 12 === 0 && mt < 0.9) {
          for (const u of this.units) {
            if (u.dead) continue;
            if (e.src !== undefined && u.civ === e.src) continue;
            if (Math.hypot(u.x - mx, u.y - my) < 2.4) {
              u.hp -= 14 + this.rng() * 8;
              u.hurt = 20;
              if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
            }
          }
          this.fx('bullet', mx + this.rng() * 2 - 1, my + this.rng() * 2 - 1, 5, { x0: mx, y0: my, src: e.src, r: 0, dmg: 0 });
        }
        if (e.age >= e.ttl) {
          this.shellBurst(e.x, e.y, e.r || 2.2, e.dmg ?? 45, false, e.src ?? -1);
          this.onSound?.('boom');
        }
      } else if (e.kind === 'plasma' && e.age >= e.ttl) {
        // 等离子命中：大威力爆破 + 电磁脉冲（周遭敌军麻痹减速 + 敌军团士气崩落）
        this.killCredit = e.wid ?? null;
        this.shellBurst(e.x, e.y, e.r || 3.2, e.dmg ?? 80, true, e.src ?? -1);
        for (const u of this.units) {
          if (u.dead) continue;
          if (e.src !== undefined && u.civ === e.src) continue;
          if (Math.hypot(u.x - e.x, u.y - e.y) < (e.r || 3.2) + 2.5) {
            u.hurt = 60; // EMP 电击：长时硬直
            u.hp -= 6;
            if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
          }
        }
        for (const a of this.armies) {
          if (e.src !== undefined && a.civ === e.src) continue;
          if (Math.hypot(a.x - e.x, a.y - e.y) < (e.r || 3.2) + 6) {
            a.morale = Math.max(8, a.morale - 15); // 电磁脉冲击溃军心
          }
        }
        if (e.wid != null) this.emergentPayload(e);
        this.killCredit = null;
        this.fx('flash', e.x, e.y, 12, { r: 2 });
        this.onSound?.('boom');
      } else if (e.kind === 'antimatter' && e.age >= e.ttl) {
        // 反物质湮灭：范围内敌方归零 + 地形玻璃化 + 全屏白闪
        this.annihilate(e.x, e.y, 9, e.src ?? -1);
        this.addEvent('superweapon', '湮灭之光吞没大地——半径之内，物质归零，只余熔融的玻璃', { x: e.x, y: e.y });
      }
      if (e.age >= e.ttl) {
        this.effects.splice(i, 1);
      }
    }
    // 战斗红闪过期清理
    if (this.activeBattles.size > 0 && this.tickCount % 5 === 0) {
      for (const [k, exp] of this.activeBattles) {
        if (exp <= this.tickCount) this.activeBattles.delete(k);
      }
    }
  }

  explode(x: number, y: number, r: number, opts?: { terrain?: boolean; lava?: boolean; nuke?: boolean }) {
    // 爆炸音效上报（核弹用更深沉的音色）
    this.onSound?.(opts?.nuke ? 'nuke' : 'boom');
    for (let yy = Math.floor(y - r); yy <= y + r; yy++) {
      for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(xx - x, yy - y);
        if (d > r) continue;
        const i = idx(xx, yy);
        if (this.building[i] > 0) this.destroyBuilding(i);
        if (opts?.terrain && isLand(this.terrain[i])) {
          if (opts?.lava && d < 1.8) this.setTerrain(i, T.LAVA);
          else if (this.terrain[i] !== T.MOUNTAIN) this.setTerrain(i, T.BURNT);
          if (d > r * 0.55 && this.rng() < 0.3) this.ignite(i);
        }
      }
    }
    for (const u of this.units) {
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < r + 0.8) {
        u.hp -= 300 * Math.max(0.15, 1 - d / (r + 0.8));
        u.hurt = 30;
        if (u.hp <= 0) {
          u.dead = true;
          this.wwCountKill(u); // 大战阵亡计数（爆炸/核爆致死）
        }
      }
    }
    this.shake = Math.max(this.shake, opts?.nuke ? 14 : 8);
    this.fx('explosion', x, y, 26, { r });
    for (let s = 0; s < 6; s++) {
      this.fx('smoke', x + this.rng() * r - r / 2, y + this.rng() * r - r / 2, 34);
    }
    if (opts?.nuke) {
      this.fx('flash', x, y, 14);
      this.fx('mushroom', x, y, 90);
      this.addEvent('nuke', '蘑菇云在大地上升起，幸存者将长久铭记这一天', { x, y });
      for (let yy = Math.floor(y - 5); yy <= y + 5; yy++) {
        for (let xx = Math.floor(x - 5); xx <= x + 5; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (Math.hypot(xx - x, yy - y) < 5) {
            const i = idx(xx, yy);
            this.radiate[i] = 1;
            this.radSet.set(i, this.tickCount + 2400);
            this.markDirty(i);
          }
        }
      }
    }
  }

  lightning(x: number, y: number, count = 1, power = 1) {
    this.onSound?.('thunder'); // 雷击音效上报（连击只播一次）
    const n = Math.max(1, Math.min(12, Math.floor(count)));
    const pw = Math.max(0.5, Math.min(3, power));
    for (let k = 0; k < n; k++) {
      // 连击：首击精确命中，其余在 ±max(2, n) 范围内散布
      const lx = n > 1 ? x + (this.rng() - 0.5) * Math.max(2, n) : x;
      const ly = n > 1 ? y + (this.rng() - 0.5) * Math.max(2, n) : y;
      this.fx('bolt', lx, ly, 10);
      for (const u of this.units) {
        const d = Math.hypot(u.x - lx, u.y - ly);
        if (d < 1.9) { u.hp -= 95 * pw; u.hurt = 30; if (u.hp <= 0) u.dead = true; }
      }
      const i = idx(Math.floor(lx), Math.floor(ly));
      this.ignite(i);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const xx = Math.floor(lx) + dx;
        const yy = Math.floor(ly) + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (this.rng() < 0.5) this.ignite(idx(xx, yy));
      }
    }
    this.shake = Math.max(this.shake, 4);
  }

  earthquake(x: number, y: number, r = 9, power = 1) {
    this.onSound?.('quake'); // 地震隆隆声上报
    const rr = Math.max(3, Math.min(24, r));
    const pw = Math.max(0.5, Math.min(3, power));
    // 烈度 → 震波持续时长（每 tick 抽样塌毁，时长越长累计塌毁越多）+ 屏震强度
    this.fx('quake', x, y, Math.max(30, Math.floor(90 * pw)), { r: rr });
    this.shake = Math.min(12, Math.round(8 * pw));
  }

  // ---------------- 自然引擎宿主方法（板块/大气/风暴结算入口） ----------------

  /** 自然雷暴闪电（nature 大气步暴雨云触发；区别于神力天雷 lightning）：
   *  弱伤害（26 而非 95×pw——环境危险而非神怒秒杀）、不点燃（湿雨浇灭火种，野火留给旱季），
   *  视觉复用 bolt 锯齿天枝、声音走 distantThunder 远雷滚动（音乐通道，与神力天雷的近劈瞬响区分） */
  natureLightning(x: number, y: number) {
    this.onSound?.('distantThunder');
    this.fx('bolt', x, y, 10);
    for (const u of this.units) {
      if (u.dead) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < 1.6) {
        // 冷血体质对剧烈环境冲击更脆弱（×1.4）；冬季在暴雨中僵直的爬虫首当其冲
        const mult = RACES[u.race].coldBlood ? 1.4 : 1;
        u.hp -= 26 * mult; u.hurt = 22; if (u.hp <= 0) u.dead = true;
      }
    }
  }

  /** 板块地震（里氏震级驱动）：塌毁/伤亡/地裂随震级缩放，取代神力地震的固定参数 */
  natureQuake(x: number, y: number, m: number) {
    this.onSound?.('quake');
    // —— 大灾互连：记录灾点与时间（外交「大灾不兴刀兵」/联盟「同病相怜」共同消费）——
    this.lastCatastrophe = { x, y, tick: this.tickCount };
    const r = Math.round(2 + (m - 4.4) * 4.2); // M4.5≈2格 … M8.8≈19格
    const dur = Math.round(24 + (m - 4.4) * 34);
    this.fx('quake', x, y, dur, { r });
    this.shake = Math.min(14, Math.round(3 + (m - 4.4) * 4.5));
    const intensity = (m - 4.4) / 4.8; // 0-1 归一化破坏烈度
    // 塌毁与伤亡：半径内抽样（地震 fx 自身的塌房逻辑之外，这里直接按震级结算一次性破坏）
    const rr = Math.ceil(r);
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
        if (d > r) continue;
        const i = idx(xx, yy);
        const falloff = 1 - d / (r + 0.5);
        if (this.building[i] > 0 && this.rng() < 0.32 * intensity * falloff) this.attackBuilding(i, 40 + 90 * intensity, -1);
        // 强震地裂：草林撕裂为焦土（M≥7 的疤痕）
        if (m >= 7 && this.rng() < 0.05 * intensity * falloff) {
          const t = this.terrain[i];
          if (t === T.GRASS || t === T.FOREST) this.setTerrain(i, T.BURNT);
        }
      }
    }
    // 人员伤亡：单位按烈度受损
    for (const u of this.units) {
      if (u.dead) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d > r + 1) continue;
      const dmg = (12 + 70 * intensity) * Math.max(0.2, 1 - d / (r + 1));
      u.hp -= dmg;
      u.hurt = 20;
      if (u.hp <= 0) u.dead = true;
    }
    this.addEvent('geo', `里氏 ${m.toFixed(1)} 级强震撼动了大地${m >= 7 ? '，山川易色，屋舍成墟' : m >= 6 ? '，墙垣迸裂' : ''}`, { x, y });
    if (m >= 7) this.toast(`${m.toFixed(1)} 级强震！`, 'danger');
  }

  /** 风暴肆虐（每 40 tick）：狂风伤人毁屋拔树；冰暴型额外冻结大地 */
  stormRavage(st: Cyclone) {
    if (st.strength >= 1.1) this.lastCatastrophe = { x: st.x, y: st.y, tick: this.tickCount }; // 强风暴入大灾档案
    const r = 3 + st.strength * 7;
    // 生物：狂风卷击（飞行系除外）
    for (const u of this.units) {
      if (u.dead || u.boat) continue;
      if (RACES[u.race].flying) continue;
      const d = Math.hypot(u.x - st.x, u.y - st.y);
      if (d < r) {
        const dmg = (st.strength - 0.55) * 7 * (1 - d / r);
        if (st.kind === 'blizzard') {
          const coldBorn = u.race === R.PENGUIN || u.race === R.SNOWWOLF || u.race === R.WHITEWALKER;
          if (!coldBorn) { u.hp -= dmg * 0.6; u.chill = 30; u.hurt = 12; }
        } else {
          u.hp -= dmg;
          u.hurt = 16;
        }
        if (u.hp <= 0) u.dead = true;
      }
    }
    // 建筑：强风撕裂屋顶
    const rr = Math.ceil(r);
    for (let yy = Math.floor(st.y - rr); yy <= st.y + rr; yy++) {
      for (let xx = Math.floor(st.x - rr); xx <= st.x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(xx + 0.5 - st.x, yy + 0.5 - st.y);
        if (d > r) continue;
        const i = idx(xx, yy);
        const p = 0.028 * (st.strength - 0.55) * (1 - d / r);
        if (this.building[i] > 0 && this.rng() < p) this.attackBuilding(i, 14 + st.strength * 22, -1);
        const t = this.terrain[i];
        if (st.kind === 'blizzard') {
          // 冰暴冻结大地
          if ((t === T.GRASS || t === T.BURNT) && this.rng() < 0.25) this.setTerrain(i, T.SNOW);
          else if (t === T.WATER && this.rng() < 0.15) this.setTerrain(i, T.ICE);
        } else if (t === T.FOREST && this.rng() < 0.02 * st.strength) {
          this.setTerrain(i, T.GRASS); // 拔树
        }
      }
    }
  }

  /** 雨区灭火探针：在 8×8 格内随机找一个火点扑灭（返回 tile 或 -1） */
  rainFireProbe(x0: number, y0: number): number {
    for (let k = 0; k < 5; k++) {
      const xx = x0 + Math.floor(this.rng() * 8);
      const yy = y0 + Math.floor(this.rng() * 8);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = idx(xx, yy);
      if (this.fire[i] > 0) {
        this.fire[i] = 0;
        this.fireSet.delete(i);
        return i;
      }
    }
    return -1;
  }

  /** 雨区复苏：8×8 格内随机一块焦土提前返青（regrow 计时 -160 tick） */
  rainRegrow(x0: number, y0: number) {
    for (let k = 0; k < 4; k++) {
      const xx = x0 + Math.floor(this.rng() * 8);
      const yy = y0 + Math.floor(this.rng() * 8);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = idx(xx, yy);
      const at = this.regrow.get(i);
      if (at != null) {
        this.regrow.set(i, Math.max(this.tickCount + 60, at - 160));
        return;
      }
    }
  }

  /** 流域洪水（持续暴雨）：低地短暂没顶（随洪水退潮系统自然回退） */
  natureFlood(x: number, y: number) {
    let flooded = 0;
    for (let k = 0; k < 10; k++) {
      const ang = this.rng() * Math.PI * 2;
      const rr = this.rng() * 4.5;
      const xx = Math.floor(x + Math.cos(ang) * rr);
      const yy = Math.floor(y + Math.sin(ang) * rr);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = idx(xx, yy);
      const t = this.terrain[i];
      if ((t === T.GRASS || t === T.SAND || t === T.BURNT) && !this.flood.has(i)) {
        this.setTerrain(i, T.WATER);
        this.flood.set(i, this.tickCount + 180 + Math.floor(this.rng() * 120));
        if (this.building[i] > 0) this.destroyBuilding(i);
        flooded++;
      }
    }
    if (flooded >= 4) {
      this.addEvent('geo', `持续的暴雨漫过了河岸，洼地化作一片泽国`, { x, y });
    }
  }

  /** 神力洪水（'flood' 工具）：目标半径内洼地漫成泽国（复用自然洪水的 flood 退去账本——数秒后潮退） */
  floodArea(x: number, y: number, r: number) {
    const rr = Math.max(2, Math.min(12, r));
    let flooded = 0;
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx - x, yy - y) > rr) continue;
        const i = idx(xx, yy);
        const t = this.terrain[i];
        if (t !== T.GRASS && t !== T.SAND && t !== T.BURNT && t !== T.SWAMP && t !== T.HILL) continue;
        if (this.flood.has(i)) continue;
        this.setTerrain(i, T.WATER);
        // 退去时刻：半径越大涨水越久（180~360 tick ≈ 12~24 秒）
        this.flood.set(i, this.tickCount + 180 + Math.floor(this.rng() * 180));
        if (this.building[i] > 0) this.destroyBuilding(i);
        flooded++;
      }
    }
    if (flooded > 0) {
      this.fx('tsunami', x, y, 30, { r: rr + 1, quiet: true });
      this.shake = Math.max(this.shake, 3);
      this.onSound?.('tsunami');
      this.toast(`洪水漫过了大地（${flooded} 格），数秒后将退去`, 'info');
    }
  }

  spawnTornado(x: number, y: number, count = 1) {
    const n = Math.max(1, Math.min(6, Math.floor(count)));
    const cur = this.effects.filter((e) => e.kind === 'tornado').length;
    for (let k = 0; k < n; k++) {
      if (cur + k >= 6) break; // 全局上限防刷屏
      const ox = k === 0 ? 0 : (this.rng() - 0.5) * Math.max(4, n * 2);
      const oy = k === 0 ? 0 : (this.rng() - 0.5) * Math.max(4, n * 2);
      this.fx('tornado', x + ox, y + oy, 340);
    }
  }

  /** 酸雨云：WorldBox 八大天灾之一 — 持续腐蚀范围内的生物/植被/建筑 */
  acidRain(x: number, y: number, r: number, ttl = 150) {
    const rr = Math.max(4, Math.min(16, r));
    const count = this.effects.filter((e) => e.kind === 'acid').length;
    if (count >= 6) return; // 云数上限防刷屏
    this.fx('acid', x, y, ttl, { r: rr });
    this.addEvent('acidrain', '一片酸雨云在天空凝聚，腐蚀着大地与生灵', { x, y });
  }

  /** 火山喷发：大地隆起火山锥 → 岩浆弹轮番轰击 + 岩浆外溢 + 火海（烈度可调） */
  volcano(x: number, y: number, power = 1) {
    const pw = Math.max(1, Math.min(3, power));
    const cx = Math.max(2, Math.min(W - 3, Math.floor(x)));
    const cy = Math.max(2, Math.min(H - 3, Math.floor(y)));
    // 隆起火山锥（半径 2.3 的山体；水面上喷发也先成陆基）
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(dx, dy) <= 2.3) this.setTerrain(idx(xx, yy), T.MOUNTAIN);
      }
    }
    // 山口岩浆湖（烈度 2 → 十字熔岩；烈度 3 → 3x3 熔岩湖）
    this.setTerrain(idx(cx, cy), T.LAVA);
    if (pw >= 2) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.setTerrain(idx(cx + dx, cy + dy), T.LAVA);
    }
    if (pw >= 3) {
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.setTerrain(idx(cx + dx, cy + dy), T.LAVA);
    }
    // 山脚引燃圈（半径随烈度扩张）
    const ring = 3.5 * pw;
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const j = idx(Math.floor(cx + Math.cos(ang) * ring), Math.floor(cy + Math.sin(ang) * ring));
      if (j >= 0 && j < W * H) this.ignite(j);
    }
    this.fx('volcano', cx + 0.5, cy + 0.5, 110);
    this.shake = Math.max(this.shake, 6 + pw * 2);
    this.onSound?.('volcano');
    this.addEvent('volcano', pw > 1 ? `大地震颤，一座火山拔地而起，熔岩以烈度 ${pw} 喷薄而出` : '大地震颤，一座火山拔地而起，岩浆喷薄而出', { x: cx, y: cy });
  }

  /** 海啸：滔天巨浪自震中扩张淹没低地（笔刷即浪级） */
  tsunami(x: number, y: number, r: number) {
    const rr = Math.max(6, Math.min(30, r * 2.5));
    this.fx('tsunami', x, y, 42, { r: rr });
    this.onSound?.('tsunami');
    this.addEvent('tsunami', '滔天巨浪涌来，漫过了低地与海岸线', { x, y });
  }

  /** 暴风雪：游荡的冰暴冻结大地、寒伤减速生物 */
  blizzard(x: number, y: number, r: number, ttl = 190) {
    const rr = Math.max(5, Math.min(15, r));
    const count = this.effects.filter((e) => e.kind === 'blizzard').length;
    if (count >= 4) return;
    this.fx('blizzard', x, y, ttl, { r: rr });
    this.onSound?.('blizzard');
    this.addEvent('blizzard', '极寒的暴风雪降临，大地在冰霜下沉睡', { x, y });
  }

  /** 陨石雨：一连串陨石轮番轰击区域（陨石数可调） */
  meteorShower(x: number, y: number, r: number, count?: number) {
    const rr = Math.max(4, Math.min(18, r));
    const n = count ? Math.max(1, Math.min(24, Math.floor(count))) : 5 + Math.floor(this.rng() * 4);
    for (let k = 0; k < n; k++) {
      const ang = this.rng() * Math.PI * 2;
      const dist = this.rng() * rr;
      const tx = Math.max(1, Math.min(W - 2, x + Math.cos(ang) * dist));
      const ty = Math.max(1, Math.min(H - 2, y + Math.sin(ang) * dist));
      const m = this.fx('meteor', tx, ty, 20 + k * 10);
      if (m) { m.x0 = tx + 18; m.y0 = ty - 30; m.quiet = true; }
    }
    this.addEvent('meteorshower', `一场陨石雨呼啸而降（${n} 颗）`, { x, y });
    this.statMeteorShowers++; // 成就计数：流星如愿
    this.onSound?.('boom');
  }

  /** 蝗灾：游荡虫群吞噬植被与农田 */
  locust(x: number, y: number, r = 5, ttl = 240) {
    const count = this.effects.filter((e) => e.kind === 'locust').length;
    if (count >= 3) return;
    this.fx('locust', x, y, ttl, { r: Math.max(3, Math.min(10, r)) });
    this.addEvent('locust', '黑压压的蝗群遮天蔽日，吞噬着沿途的植被', { x, y });
  }

  /** 干旱：灼热穹顶使大地龟裂、浅水蒸发 */
  drought(x: number, y: number, r: number, ttl = 200) {
    const rr = Math.max(5, Math.min(16, r));
    const count = this.effects.filter((e) => e.kind === 'drought').length;
    if (count >= 4) return;
    this.fx('drought', x, y, ttl, { r: rr });
    this.addEvent('drought', '灼热的旱魃笼罩大地，河流枯竭、草木焦黄', { x, y });
  }

  // ---------------- 神力扩充（唤雨/祝福/诅咒/爱/突变/传送/天罚） ----------------

  /** 唤雨术：甘霖云浇灭火焰、洗净辐射、复苏焦土（游荡云系，与天灾对称的善意力量） */
  rainCloud(x: number, y: number, r: number, ttl = 200) {
    WBB.touchMeta(); // Stage 3：雨云 bless/curse 列收口
    const rr = Math.max(4, Math.min(14, r));
    const count = this.effects.filter((e) => e.kind === 'rainstorm').length;
    if (count >= 6) return; // 上限防刷屏
    this.fx('rainstorm', x, y, ttl, { r: rr });
    this.addEvent('rain', '造物主唤来了甘霖，焦土将在雨水中重生', { x, y });
    this.onSound?.('heal');
  }

  /** 神恩祝福：范围内单位治疗 + 增益（伤害×1.3、缓回血、净化疫病） */
  blessArea(x: number, y: number, r: number) {
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.5);
      u.bless = 600;
      u.infected = false;
      n++;
      if (this.rng() < 0.4) this.fx('bless', u.x, u.y - 0.4, 24);
    }
    if (n > 0) this.onSound?.('heal');
    return n;
  }

  /** 神罚诅咒：范围内单位移速×0.75 + 持续失血（不致死性但致命的削弱） */
  curseArea(x: number, y: number, r: number) {
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      u.curse = 500;
      n++;
      if (this.rng() < 0.4) this.fx('curse', u.x, u.y - 0.4, 24);
    }
    return n;
  }

  /** 爱之甘霖：繁衍概率 ×2.5（种群重建与生态实验的加速器） */
  loveArea(x: number, y: number, r: number) {
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (RACES[u.race].repro <= 0) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      u.fert = 500;
      n++;
      if (this.rng() < 0.5) this.fx('heart', u.x, u.y - 1, 36);
    }
    return n;
  }

  /** 基因突变：乱流改写基因（进化引擎联动：野生动物基因跳变 / 文明生物特质重塑 + 小概率基因化选育） */
  mutateArea(x: number, y: number, r: number) {
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      if (RACES[u.race].isCiv) {
        if (this.rng() < 0.3) { this.rerollTrait(u); n++; }
        // 基因化选育：神力乱流同样改写文明生物体格（25% 概率·幅度较野生动物温和）
        if (this.rng() < 0.25) { this.jumpGene(u, 0.12); n++; }
      } else {
        if (!u.gene) u.gene = this.baseGene(u.race);
        this.jumpGene(u, 0.2);
        n++;
      }
      this.fx('mutate', u.x, u.y, 30);
    }
    return n;
  }

  /** 空间传送：范围内生物随机传送到世界某处陆地（端点双色火花） */
  teleportArea(x: number, y: number, r: number) {
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      const spot = this.randomLandSpot();
      if (!spot) continue;
      this.fx('spark', u.x, u.y, 18);
      u.x = spot.x; u.y = spot.y;
      u.tx = spot.x; u.ty = spot.y;
      u.lx = spot.x; u.ly = spot.y;
      this.fx('spark', u.x, u.y, 22);
      n++;
    }
    return n;
  }

  /** 天罚风暴：怒云持续降下雷电（雷暴域，半径可调） */
  wrathStorm(x: number, y: number, r: number, ttl = 180) {
    const rr = Math.max(4, Math.min(14, r));
    const count = this.effects.filter((e) => e.kind === 'wrath').length;
    if (count >= 3) return;
    this.fx('wrath', x, y, ttl, { r: rr });
    this.addEvent('wrath', '神怒之云聚拢，雷霆将轮番轰击大地', { x, y });
  }

  /** 圣光风暴：首个光明阵营神力 —— 金色圣云游荡：审判亡灵/恶魔/巨龙（圣炎灼烧），
   *  治愈无辜生灵（微光甘霖+驱散瘟疫），浇灭火焰/洗净辐射/复苏焦土（与唤雨同源善力）。 */
  holyStorm(x: number, y: number, r: number, ttl = 200) {
    const rr = Math.max(4, Math.min(14, r));
    const count = this.effects.filter((e) => e.kind === 'holystorm').length;
    if (count >= 3) return; // 上限防刷屏（与天罚风暴同策）
    this.fx('holystorm', x, y, ttl, { r: rr });
    this.addEvent('holystorm', '金色的圣云自天际涌来，圣光将审判黑暗、治愈无辜', { x, y });
    this.onSound?.('shield');
  }

  // ---------------- 天灾扩充（沙尘暴/台风/天坑/冰河寒潮/饥荒/黑洞） ----------------

  /** 沙尘暴：游荡沙暴 —— 草被沙埋、生物迷失风中（沙尘减速+轻伤） */
  sandstorm(x: number, y: number, r = 5.5, ttl = 280) {
    const count = this.effects.filter((e) => e.kind === 'sandstorm').length;
    if (count >= 3) return;
    this.fx('sandstorm', x, y, ttl, { r: Math.max(3, Math.min(12, r)) });
    this.addEvent('sandstorm', '遮天蔽日的沙暴席卷而来，绿意将被黄沙掩埋', { x, y });
  }

  /** 台风：海上气旋 —— 狂风推拽一切 + 间歇雷电（水龙卷） */
  typhoon(x: number, y: number, r = 6, ttl = 240) {
    const count = this.effects.filter((e) => e.kind === 'typhoon').length;
    if (count >= 3) return;
    this.fx('typhoon', x, y, ttl, { r: Math.max(4, Math.min(14, r)) });
    this.addEvent('typhoon', '海上升起了狂暴的台风气旋，狂风暴雨将至', { x, y });
  }

  /** 深渊天坑：大地环状塌陷入水（渐进式塌落 + 建筑倾覆 + 生物坠落） */
  sinkhole(x: number, y: number, r: number) {
    const rr = Math.max(3, Math.min(12, r));
    const count = this.effects.filter((e) => e.kind === 'sinkhole').length;
    if (count >= 3) return;
    this.fx('sinkhole', x, y, 80, { r: rr });
    this.addEvent('sinkhole', '大地震颤着塌陷下去，深渊的黑暗吞噬了一切', { x, y });
    this.shake = Math.max(this.shake, 7);
    this.onSound?.('boom');
  }

  /** 冰河寒潮：极寒穹顶 —— 大地冻结为雪原冰盖（静态大范围，比暴风雪更沉重） */
  iceAge(x: number, y: number, r: number, ttl = 420) {
    const rr = Math.max(6, Math.min(22, r));
    const count = this.effects.filter((e) => e.kind === 'iceage').length;
    if (count >= 2) return;
    this.fx('iceage', x, y, ttl, { r: rr });
    this.addEvent('iceage', '极寒的冰河寒潮降临，冻上的一切将沉眠于冰封之下', { x, y });
    this.shake = Math.max(this.shake, 4);
  }

  /** 饥荒：贫瘠之云 —— 生灵饿殍、田园荒芜（持续失血 + 农田摧残） */
  famineCloud(x: number, y: number, r = 6, ttl = 260) {
    const count = this.effects.filter((e) => e.kind === 'famine').length;
    if (count >= 3) return;
    this.fx('famine', x, y, ttl, { r: Math.max(3, Math.min(12, r)) });
    this.addEvent('famine', '灰色的饥荒之云漂来，饿殍遍野的时世开始了', { x, y });
  }

  /** 黑洞：时空陷阱 —— 吸入万物后奇点爆发湮灭（终极神罚） */
  blackhole(x: number, y: number, r = 8, ttl = 130) {
    this.statBlackholes++; // 成就计数：事件视界
    const count = this.effects.filter((e) => e.kind === 'blackhole').length;
    if (count >= 2) return;
    this.fx('blackhole', x, y, ttl, { r: Math.max(4, Math.min(16, r)) });
    this.addEvent('blackhole', '时空被撕开了一个黑洞，万物正被拉向湮灭', { x, y });
  }

  /** 随机找一块可站立的陆地（传送/物种扩散用；40 次尝试） */
  randomLandSpot(): { x: number; y: number } | null {
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(this.rng() * W);
      const y = Math.floor(this.rng() * H);
      const t = this.terrain[idx(x, y)];
      if (t === T.GRASS || t === T.SAND || t === T.SNOW || t === T.BURNT || t === T.FOREST || t === T.HILL) return { x: x + 0.5, y: y + 0.5 };
    }
    return null;
  }

  /** 重塑特质（基因突变用）：退旧乘数上新乘数（近似 setJob 的属性重算） */
  rerollTrait(u: Unit) {
    const old = u.trait ? TRAITS[u.trait] : null;
    const key = this.rollTrait();
    const nw = key ? TRAITS[key] : null;
    if (old) {
      u.maxHp = Math.max(1, Math.round(u.maxHp / (old.hpMul ?? 1)));
      u.hp = Math.min(u.maxHp, Math.max(1, Math.round(u.hp / (old.hpMul ?? 1))));
      u.dmg /= old.dmgMul ?? 1;
      u.speed /= old.speedMul ?? 1;
    }
    if (nw) {
      u.maxHp = Math.max(1, Math.round(u.maxHp * (nw.hpMul ?? 1)));
      u.hp = Math.min(u.maxHp, Math.round(u.hp * (nw.hpMul ?? 1)));
      u.dmg *= nw.dmgMul ?? 1;
      u.speed *= nw.speedMul ?? 1;
    }
    u.trait = key ?? null;
  }

  // ---------------- 生物进化系统（基因遗传/变异/棘轮） ----------------

  /** 物种基线取样（人工放置野生动物时）：基线 ± 5% 个体差异 */
  baseGene(race: number): Gene {
    const b = this.speciesBase.get(race)?.gene;
    if (!b) return { s: 1, d: 1, h: 1, r: 1 };
    const j = (v: number) => Math.max(0.5, Math.min(2, v * (1 + (this.rng() - 0.5) * 0.1)));
    return { s: j(b.s), d: j(b.d), h: j(b.h), r: j(b.r) };
  }

  /** 子代基因：母代基因 + 突变（±4%）+ 环境偏向（雪地选健壮/沙地选敏捷/森林选杀伤/草地选繁衍） */
  childGene(parent: Unit): Gene {
    const g = parent.gene ?? { s: 1, d: 1, h: 1, r: 1 };
    // —— 超级演化 v4：辐射区 = 演化高压锅（辐射地带的于代突变幅度 ×2.6 —— 武器污染反哺物种分化）——
    const gx = Math.max(0, Math.min(W - 1, Math.floor(parent.x)));
    const gy = Math.max(0, Math.min(H - 1, Math.floor(parent.y)));
    const radBoost = this.radiate[idx(gx, gy)] > 0 ? 2.6 : 1;
    const mut = (v: number) => Math.max(0.5, Math.min(2, v * (1 + (this.rng() - 0.5) * ep('evo.mutationRate') * radBoost)));
    const gene: Gene = { s: mut(g.s), d: mut(g.d), h: mut(g.h), r: mut(g.r) };
    // 环境选择压力：不同地物偏向不同基因维（长期演化出地方适应性）
    const t = this.terrain[idx(gx, gy)];
    if (t === T.SNOW || t === T.ICE) gene.h = Math.min(2, gene.h * (1 + this.rng() * 0.05));
    else if (t === T.SAND) gene.s = Math.min(2, gene.s * (1 + this.rng() * 0.05));
    else if (t === T.FOREST) gene.d = Math.min(2, gene.d * (1 + this.rng() * 0.05));
    else if (t === T.GRASS) gene.r = Math.min(2, gene.r * (1 + this.rng() * 0.04));
    return gene;
  }

  /** 强制基因跳变（基因突变神力）：±amount 随机维度重铸 */
  jumpGene(u: Unit, amount: number) {
    const g = u.gene ?? (u.gene = { s: 1, d: 1, h: 1, r: 1 });
    const dims: (keyof Gene)[] = ['s', 'd', 'h', 'r'];
    for (const dim of dims) {
      if (this.rng() < 0.6) {
        g[dim] = Math.max(0.5, Math.min(2, g[dim] * (1 + (this.rng() - 0.42) * 2 * amount)));
      }
    }
    // 基因改变后属性立即重算（基于本种族基准 × 基因）
    const def = RACES[u.race];
    const td = u.trait ? TRAITS[u.trait] : null;
    const jd = def.isCiv ? JOBS[u.job ?? 0] : null;
    u.maxHp = Math.max(1, Math.round(def.hp * (td?.hpMul ?? 1) * (jd?.hpMul ?? 1) * g.h));
    u.hp = Math.min(u.maxHp, u.hp);
    u.dmg = def.dmg * (td?.dmgMul ?? 1) * (jd?.dmgMul ?? 1) * g.d;
    u.speed = def.speed * (td?.speedMul ?? 1) * (jd?.speedMul ?? 1) * g.s;
  }

  /** 物种种名尾字（亚种命名用：霜+狼 → 霜狼） */
  static readonly SUB_TAIL: Record<number, string> = {
    [R.SHEEP]: '羊', [R.WOLF]: '狼', [R.DEER]: '鹿', [R.PENGUIN]: '企鹅',
    [R.CAMEL]: '驼', [R.SCORPION]: '蝎', [R.SNAKE]: '蛇', [R.SNOWWOLF]: '雪狼', [R.BEAR]: '熊',
  };

  /** 亚种命名：栖息地环境前缀 × 主导漂移维度词 → 「霜狼·健硕」（代代棘轮时重铸） */
  subspeciesName(race: number, maxDim: keyof Gene, up: boolean): string {
    // 维度词（正负向各一）
    const DIM_WORD: Record<keyof Gene, [string, string]> = {
      s: ['疾足', '蹒跚'], d: ['凶猛', '温驯'], h: ['健硕', '孱弱'], r: ['繁盛', '凋零'],
    };
    // 环境前缀：种群主要栖息地（SNOW/ICE 霜 · SAND 漠 · FOREST 林 · GRASS 原 · 岩地 岩 · 其他 无）
    let env = '';
    let envCount = 0;
    const envTally = new Map<number, number>();
    for (const u of this.units) {
      if (u.dead || u.race !== race) continue;
      const t = this.terrain[idx(Math.max(0, Math.min(W - 1, u.x | 0)), Math.max(0, Math.min(H - 1, u.y | 0)))];
      envTally.set(t, (envTally.get(t) ?? 0) + 1);
    }
    for (const [t, c] of envTally) {
      const isEnv = t === T.SNOW || t === T.ICE || t === T.SAND || t === T.FOREST || t === T.GRASS || t === T.HILL || t === T.MOUNTAIN;
      if (isEnv && c > envCount) {
        envCount = c;
        env = t === T.SNOW || t === T.ICE ? '霜' : t === T.SAND ? '漠' : t === T.FOREST ? '林' : t === T.GRASS ? '原' : '岩';
      }
    }
    const tail = GameEngine.SUB_TAIL[race] ?? RACES[race].name.slice(-1);
    // 雪狼自身带霜意象：前缀与种名重复时省去前缀
    const dedup = (env && (tail.startsWith(env) || RACES[race].name.includes(env) && race === R.SNOWWOLF)) ? '' : env;
    return `${dedup}${tail}·${DIM_WORD[maxDim][up ? 0 : 1]}`;
  }

  /** 单位属性重算（种化转化/基因跳变后：种族基准 × 特质 × 职业 × 基因） */
  recomputeStats(u: Unit) {
    const def = RACES[u.race];
    if (!def) return;
    const td = u.trait ? TRAITS[u.trait] : null;
    const jd = def.isCiv && u.job != null ? JOBS[u.job] : null;
    const g = u.gene ?? { s: 1, d: 1, h: 1, r: 1 };
    u.maxHp = Math.max(1, Math.round(def.hp * (td?.hpMul ?? 1) * (jd?.hpMul ?? 1) * g.h));
    u.hp = Math.min(u.maxHp, u.hp);
    u.dmg = def.dmg * (td?.dmgMul ?? 1) * (jd?.dmgMul ?? 1) * g.d;
    u.speed = def.speed * (td?.speedMul ?? 1) * (jd?.speedMul ?? 1) * g.s;
  }

  /** 涌现种化命名部件（环境前缀 × 力量词 × 父种种尾——组合空间 6×8×N） */
  static readonly SPEC_ENV = ['霜', '漠', '林', '原', '岩', '幽'];
  static readonly SPEC_POWER = ['刃', '爪', '牙', '鳞', '睛', '影', '吼', '蹄'];
  /** 全新造物命名词尾（无模板血统——不用任何种族名尾字） */
  static readonly SPEC_TAIL = ['兽', '灵', '怪', '魔', '裔', '嗣'];

  /** 涌现式种化：亚种棘轮积累到临界（gen ≥ 3 且基因漂移 ≥ 32%）→ 诞生全新动态物种
   *  （新物种注册进 RACES、转化部分种群、独立基因池继续演化——突破预设物种表）
   *  v3：①上限 6→48（无限链式种化——动态物种可再次种化，分化出茂密的演化树）
   *      ②文明种族也可种化（王国种族分化：转化单一王国内的种群，新种族可建新国）
   *      ③视觉基因组 —— 每次种化外观真实变异（色相/体型/角刺鬃尾/花纹）+ 图谱记录 */
  speciate(race: number, base: { gene: Gene; gen: number }, avg: Gene, pop: number): boolean {
    if (this.dynRaces.size >= 64) return false; // 物种上限：防生态爆炸（v4：48→64 —— 融合谱系与分化谱系共存）
    const parentDef = RACES[race];
    if (!parentDef) return false;
    const isCivRace = parentDef.isCiv;
    // 临界条件：棘轮 ≥ 3 代 + 最大维度漂移 ≥ 32% + 种群 ≥ 25 + 概率门（文明种族门槛更高：漂移 ≥ 38%）
    let maxDim: keyof Gene = 's';
    let maxDrift = 0;
    for (const dim of ['s', 'd', 'h', 'r'] as (keyof Gene)[]) {
      const drift = (avg[dim] - base.gene[dim]) / base.gene[dim];
      if (Math.abs(drift) > Math.abs(maxDrift)) { maxDrift = drift; maxDim = dim; }
    }
    const driftGate = isCivRace ? 0.38 : 0.32;
    if (base.gen < 3 || Math.abs(maxDrift) < driftGate || pop < (isCivRace ? 40 : 25)) return false;
    if (this.rng() > 0.3) return false;
    // —— 注册新物种（RACES 为模块级可变 Record：运行时追加，全引擎 RACES[race] 查找即刻生效） ——
    const id = this.dynSeq++;
    const env = GameEngine.SPEC_ENV[Math.floor(this.rng() * GameEngine.SPEC_ENV.length)];
    const power = GameEngine.SPEC_POWER[Math.floor(this.rng() * GameEngine.SPEC_POWER.length)];
    const tail = GameEngine.SUB_TAIL[race] ?? parentDef.name.slice(-1);
    const name = `${env}${power}${tail}`;
    // 属性由漂移基因真实导出（体魄→hp / 杀伤→dmg / 速度→speed / 繁衍→repro）
    const tint = GameEngine.DYN_TINTS[this.dynRaces.size % GameEngine.DYN_TINTS.length];
    // 视觉基因组：父种视觉维上变异（色相/体型/附器全部漂移 —— 新物种长出新模样）
    const rootVis = parentDef.vis ?? (parentDef.isCiv ? visFromGene(race, avg, this.rng) : null);
    const vis = mutateVis(rootVis, rootVis?.root ?? race, this.rng, 1.25);
    RACES[id] = {
      ...parentDef,
      key: `dyn${id}`,
      name,
      dynTint: tint,
      vis,
      hp: Math.max(3, Math.round(parentDef.hp * Math.max(0.7, Math.min(1.6, avg.h)))),
      dmg: Math.max(1, Math.round(parentDef.dmg * Math.max(0.7, Math.min(1.6, avg.d)) * 10) / 10),
      speed: Math.round(parentDef.speed * Math.max(0.7, Math.min(1.5, avg.s)) * 1000) / 1000,
      repro: Math.max(0.0008, Math.min(0.012, parentDef.repro * Math.max(0.8, Math.min(1.5, avg.r)))),
      maxAge: Math.round(parentDef.maxAge * (1 + (avg.h - 1) * 0.2)),
      // —— 种族系统 v2：性格随种化漂移（±10% 摆动 —— 分化出的亚种有新的民族性）——
      diplo: Math.max(0, Math.min(1, (parentDef.diplo ?? 0.5) + (this.rng() - 0.5) * 0.2)),
      aggr: Math.max(0, Math.min(1, (parentDef.aggr ?? 0.5) + (this.rng() - 0.5) * 0.2)),
      greed: Math.max(0, Math.min(1, (parentDef.greed ?? 0.5) + (this.rng() - 0.5) * 0.2)),
      piety: Math.max(0, Math.min(1, (parentDef.piety ?? 0.5) + (this.rng() - 0.5) * 0.2)),
      industry: Math.max(0, Math.min(1, (parentDef.industry ?? 0.5) + (this.rng() - 0.5) * 0.2)),
      arcane: Math.max(0, Math.min(1, (parentDef.arcane ?? 0.5) + (this.rng() - 0.5) * 0.2)),
      growth: Math.max(0, Math.min(1, (parentDef.growth ?? 0.5) + (this.rng() - 0.5) * 0.2)),
      harmony: Math.max(0, Math.min(1, (parentDef.harmony ?? 0.5) + (this.rng() - 0.5) * 0.2)),
    };
    this.dynRaces.set(id, { parent: race, bornYear: Math.floor(this.yearF) });
    // —— 种族关系继承：新种族从父种继承对各族的看法（×0.75 稀释 —— 新族自有新颜面）——
    if (isCivRace) {
      for (const other of new Set<number>([...Object.keys(RACES).map(Number), ...this.dynRaces.keys()])) {
        if (other === id || other === race) continue;
        if (!RACES[other]?.isCiv) continue;
        const inherited = this.raceRelOf(race, other) * 0.75;
        if (Math.abs(inherited) >= 3) this.raceRel.set(pairKey(id, other), Math.round(inherited));
      }
    }
    // —— 转化种群为新物种（携带当前基因 → 属性重算） ——
    // 文明种族：只转化「该种族人口最多的王国」的 25-40%（王国内的种族分化 —— 新亚种可在其内部繁衍成势）
    // 野生物种：转化全种群 35-55%（地理种化的经典式样）
    let converted = 0;
    const ratio = isCivRace ? 0.25 + this.rng() * 0.15 : 0.35 + this.rng() * 0.2;
    let targetCiv = -1;
    if (isCivRace) {
      const civTally = new Map<number, number>();
      for (const u of this.units) {
        if (u.dead || u.race !== race || u.civ < 0) continue;
        civTally.set(u.civ, (civTally.get(u.civ) ?? 0) + 1);
      }
      let best = 0;
      for (const [cid, n] of civTally) if (n > best) { best = n; targetCiv = cid; }
    }
    for (const u of this.units) {
      if (u.dead || u.race !== race) continue;
      if (isCivRace && u.civ !== targetCiv) continue;
      if (this.rng() < ratio) {
        u.race = id;
        this.recomputeStats(u);
        converted++;
      }
    }
    // —— 独立基因池（新物种基线 = 母种漂移均值，代数清零重新棘轮） ——
    this.speciesBase.set(id, { gene: { ...avg }, gen: 0 });
    this.lastEcoPop.set(id, converted);
    const hist = this.speciesHist.get(race) ?? [];
    this.speciesHist.set(id, hist.slice(-8).map(() => 0));
    this.speciesHist.get(id)!.push(converted);
    if (isCivRace) CIV_RACES.push(id); // 新文明种族可自行建国（ wandering 单位 foundKingdom 即用）
    const DIM_NAME: Record<keyof Gene, string> = { s: '速度', d: '杀伤', h: '体魄', r: '繁衍' };
    const pct = Math.round(maxDrift * 100);
    // —— 图谱记录（物种谱系：父种节点 → 新种节点） ——
    const parentNode = this.speciesNodeOf(race);
    const node: EvoNode = { id: this.evoSeq++, kind: 'species', name, parent: parentNode, year: Math.floor(this.yearF), colorHex: tint, detail: '', stat: '', alive: true, meta: { race: id, parent: race, converted } };
    node.detail = `自「${parentDef.name}」分化（${DIM_NAME[maxDim]}${maxDrift > 0 ? '强化' : '退化'} ${Math.abs(pct)}%，${converted} 只个体）—— ${describeVis(vis)}`;
    node.stat = describeVis(vis);
    this.evoNodes.push(node);
    this.evoIndex.set(`sp:${id}`, node.id);
    if (isCivRace) {
      const civName = targetCiv >= 0 ? this.civs[targetCiv]?.name ?? '流浪部族' : '流浪部族';
      this.addEvent('emerge', `演化奇点——「${civName}」境内的${parentDef.name}分化出新种族「${name}」（${DIM_NAME[maxDim]}${maxDrift > 0 ? '强化' : '退化'} ${Math.abs(pct)}%，${converted} 名${parentDef.name}踏上独立演化之路，外貌也已改变：${describeVis(vis)}）`, { colorHex: targetCiv >= 0 ? this.civs[targetCiv]?.colorHex : '#c9ff5f' });
    } else {
      this.addEvent('emerge', `演化奇点——「${parentDef.name}」种群分化出新物种「${name}」（${DIM_NAME[maxDim]}${maxDrift > 0 ? '强化' : '退化'} ${Math.abs(pct)}%，${converted} 只个体踏上独立演化之路，外貌也已改变：${describeVis(vis)}）`, { colorHex: '#c9ff5f' });
    }
    this.toast(`新物种「${name}」诞生`, 'good');
    return true;
  }

  // ================== 超级演化 v4：物种融合（Hybridization） ==================

  /** 融合物种命名：双亲名首字拼接 + 族属后缀（「霜狼」×「漠蝎」→「霜漠蝎」；文明种族加「族」） */
  private hybridName(a: RaceDef, b: RaceDef): string {
    const head = a.name.slice(0, 1);
    const body = b.name.slice(0, 2);
    return a.isCiv && b.isCiv ? `${head}${body}族` : `${head}${body}`;
  }

  /** 视觉基因组融合：色相中点 / 体型取大（杂种优势）/ 附器并集 / 花纹显性分歧 + 10% 突变荧光 */
  private blendVis(va: VisGenome, vb: VisGenome, rng: () => number): VisGenome {
    const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    return {
      root: va.root,
      hue: Math.round(cl((va.hue + vb.hue) / 2 + (rng() - 0.5) * 10, -40, 40)),
      lum: Math.round(cl((va.lum + vb.lum) / 2, 0.72, 1.28) * 100) / 100,
      size: Math.round(cl(Math.max(va.size, vb.size) * 1.03, 0.8, 1.45) * 100) / 100,
      bulk: Math.round(cl(Math.max(va.bulk, vb.bulk) + 0.05, 0, 1) * 100) / 100,
      horns: Math.max(va.horns, vb.horns),
      spikes: va.spikes || vb.spikes ? 1 : 0,
      mane: va.mane || vb.mane ? 1 : 0,
      tail: Math.max(va.tail, vb.tail),
      ears: Math.max(va.ears, vb.ears),
      glow: va.glow || vb.glow || rng() < 0.1 ? 1 : 0,
      pattern: va.pattern === vb.pattern ? va.pattern : rng() < 0.5 ? 1 : 2,
      crest: va.crest || vb.crest ? 1 : 0,
    };
  }

  /**
   * 涌现式物种融合核心（超级演化 v4）：两个兴旺且分布重叠的物种 → 诞生杂种新物种
   *  —— 杂种优势：属性取双亲均值 ×1.08（演化史的真实规律：杂交后代常更强壮）
   *  —— 生态链：parent 指向捕食者亲本（若一方为捕食者），isHerbivoreRace/isPredatorRace 沿父链解析不断裂
   *  —— 谱系：图谱双亲边（parent + parent2），纪事大播报
   *  @param sa/sb 双方种群实况 { pop, cx, cy, avg }（自然融合由 evolutionTick 供给；神谕强制融合内部计算） */
  hybridizeCore(a: number, b: number, sa: { pop: number; cx: number; cy: number; avg: Gene }, sb: { pop: number; cx: number; cy: number; avg: Gene }, minPop: number): { id: number; name: string; converted: number } | null {
    if (this.dynRaces.size >= 64) return null;
    const da = RACES[a];
    const db = RACES[b];
    if (!da || !b || !db || a === b) return null;
    if (sa.pop < minPop || sb.pop < minPop) return null;
    // 直系血亲融合防护：3 代内祖裔不融合（保持演化树可读）
    let walkA = a;
    for (let g = 0; g < 3; g++) {
      const p = this.dynRaces.get(walkA);
      if (!p) break;
      if (p.parent === b || p.parent2 === b) return null;
      walkA = p.parent;
    }
    const key = pairKey(Math.min(a, b), Math.max(a, b));
    if ((this.hybridCd.get(key) ?? 0) > this.tickCount) return null;
    // —— 注册杂种：属性 = 双亲均值 × 杂种优势；性格 = 双亲折中 ——
    const id = this.dynSeq++;
    const isCivRace = da.isCiv && db.isCiv;
    // 生态位裁决：任一亲本是捕食者 → 杂种按捕食者链注册（parent 指向捕食亲本，营养级沿父链解析）
    const predatorSide = db.predator && !da.predator ? 'b' : 'a';
    const predParent = predatorSide === 'b' ? b : a;
    const preyParent = predatorSide === 'b' ? a : b;
    const name = this.hybridName(da, db);
    const tint = GameEngine.DYN_TINTS[this.dynRaces.size % GameEngine.DYN_TINTS.length];
    const va = da.vis ?? visFromGene(a, { s: 1, d: 1, h: 1, r: 1 }, this.rng);
    const vb = db.vis ?? visFromGene(b, { s: 1, d: 1, h: 1, r: 1 }, this.rng);
    const vis = this.blendVis(va, vb, this.rng);
    const HET = 1.08; // 杂种优势系数
    const pp = RACES[predParent];
    RACES[id] = {
      ...pp,
      key: `dyn${id}`,
      name,
      dynTint: tint,
      vis,
      predator: da.predator || db.predator,
      hp: Math.max(3, Math.round((da.hp + db.hp) / 2 * HET)),
      dmg: Math.max(1, Math.round((da.dmg + db.dmg) / 2 * HET * 10) / 10),
      speed: Math.round(Math.min(0.16, (da.speed + db.speed) / 2 * 1.02) * 1000) / 1000,
      repro: Math.max(0.0006, Math.min(0.011, (da.repro + db.repro) / 2 * 0.9)),
      maxAge: Math.round((da.maxAge + db.maxAge) / 2 * 1.05),
      diplo: Math.max(0, Math.min(1, ((da.diplo ?? 0.5) + (db.diplo ?? 0.5)) / 2 + (this.rng() - 0.5) * 0.1)),
      aggr: Math.max(0, Math.min(1, ((da.aggr ?? 0.5) + (db.aggr ?? 0.5)) / 2 + (this.rng() - 0.5) * 0.1)),
      greed: Math.max(0, Math.min(1, ((da.greed ?? 0.5) + (db.greed ?? 0.5)) / 2)),
      piety: Math.max(0, Math.min(1, ((da.piety ?? 0.5) + (db.piety ?? 0.5)) / 2)),
      industry: Math.max(0, Math.min(1, ((da.industry ?? 0.5) + (db.industry ?? 0.5)) / 2)),
      arcane: Math.max(0, Math.min(1, ((da.arcane ?? 0.5) + (db.arcane ?? 0.5)) / 2 + (this.rng() - 0.5) * 0.08)),
      growth: Math.max(0, Math.min(1, ((da.growth ?? 0.5) + (db.growth ?? 0.5)) / 2 + 0.05)),
      harmony: Math.max(0, Math.min(1, ((da.harmony ?? 0.5) + (db.harmony ?? 0.5)) / 2)),
    };
    this.dynRaces.set(id, { parent: predParent, bornYear: Math.floor(this.yearF), parent2: preyParent });
    // —— 种族关系继承：双亲对各文明种族看法的折中（×0.8 稀释）——
    if (isCivRace) {
      for (const other of new Set<number>([...Object.keys(RACES).map(Number), ...this.dynRaces.keys()])) {
        if (other === id || other === a || other === b) continue;
        if (!RACES[other]?.isCiv) continue;
        const inherited = (this.raceRelOf(a, other) + this.raceRelOf(b, other)) / 2 * 0.8;
        if (Math.abs(inherited) >= 3) this.raceRel.set(pairKey(id, other), Math.round(inherited));
      }
    }
    // —— 转化种群：融合带（双亲分布中心折中点）附近，各转化 20-35% ——
    const fx = (sa.cx + sb.cx) / 2;
    const fy = (sa.cy + sb.cy) / 2;
    const ratio = 0.2 + this.rng() * 0.15;
    let converted = 0;
    const tryConvert = (u: Unit) => {
      if (u.dead) return;
      if (u.race !== a && u.race !== b) return;
      // 融合带引力：距融合带越近越可能转化（25 格衰减）
      const dist = Math.hypot(u.x - fx, u.y - fy);
      const p = ratio * Math.max(0.15, 1 - dist / 25);
      if (this.rng() < p) {
        u.race = id;
        this.recomputeStats(u);
        converted++;
      }
    };
    for (const u of this.units) tryConvert(u);
    WBB.touchMeta(); // Stage 3：race 列 JS 写点收口（Task 50 漏斗惯例——bail 轻重打包依赖）
    // —— 独立基因池：双亲种群均值的再融合（杂交重组的遗传学直觉）——
    const fusedGene: Gene = {
      s: Math.max(0.5, Math.min(2, (sa.avg.s + sb.avg.s) / 2 * 1.04)),
      d: Math.max(0.5, Math.min(2, (sa.avg.d + sb.avg.d) / 2 * 1.04)),
      h: Math.max(0.5, Math.min(2, (sa.avg.h + sb.avg.h) / 2 * 1.04)),
      r: Math.max(0.5, Math.min(2, (sa.avg.r + sb.avg.r) / 2 * 1.04)),
    };
    this.speciesBase.set(id, { gene: fusedGene, gen: 0 });
    this.lastEcoPop.set(id, converted);
    const hist = this.speciesHist.get(a) ?? [];
    this.speciesHist.set(id, hist.slice(-8).map(() => 0));
    this.speciesHist.get(id)!.push(converted);
    if (isCivRace) CIV_RACES.push(id);
    // —— 图谱：双亲节点各挂一条边（主父 parent + 副父记入 meta 与 detail）——
    const nodeA = this.speciesNodeOf(a);
    const node: EvoNode = { id: this.evoSeq++, kind: 'species', name, parent: nodeA, year: Math.floor(this.yearF), colorHex: tint, detail: '', stat: '', alive: true, meta: { race: id, parent: a, parent2: b, converted } };
    node.detail = `「${da.name}」与「${db.name}」的融合奇点（${converted} 只杂种个体，杂种优势 +8%）—— ${describeVis(vis)}`;
    node.stat = describeVis(vis);
    this.evoNodes.push(node);
    this.evoIndex.set(`sp:${id}`, node.id);
    this.hybridCd.set(key, this.tickCount + 2400); // 60 年冷却
    this.addEvent('emerge', `融合奇点——「${da.name}」与「${db.name}」的种群在共存地带交融，诞生杂种新物种「${name}」（杂种优势：体质与杀伤超越双亲均值，外貌混血：${describeVis(vis)}）`, { colorHex: '#ffd93d', x: fx, y: fy });
    this.toast(`融合物种「${name}」诞生`, 'good');
    return { id, name, converted };
  }

  /** 神谕·强制物种融合（hybridize_species 工具真身）：即时计算双亲实况并融合 */
  forceHybridize(a: number, b: number): { id: number; name: string; converted: number } | null {
    const stat = (race: number) => {
      let n = 0, s = 0, d = 0, h = 0, r = 0, cx = 0, cy = 0;
      for (const u of this.units) {
        if (u.dead || u.race !== race || !u.gene) continue;
        n++; s += u.gene.s; d += u.gene.d; h += u.gene.h; r += u.gene.r; cx += u.x; cy += u.y;
      }
      return { pop: n, cx: n ? cx / n : W / 2, cy: n ? cy / n : H / 2, avg: { s: n ? s / n : 1, d: n ? d / n : 1, h: n ? h / n : 1, r: n ? r / n : 1 } };
    };
    const res = this.hybridizeCore(a, b, stat(a), stat(b), 8);
    if (res) this.hybridCd.set(pairKey(Math.min(a, b), Math.max(a, b)), this.tickCount + 600); // 神谕融合只需 15 年冷却
    return res;
  }

  /** 神谕·物种创造 v5（spawn_species 工具真身）：**全新创造，非模板克隆**——
   *  属性由造物主/AI 显式设计（缺省按生态角色给合理值，绝不继承模板数值）；
   *  外貌 = form 体形族系（决定精灵色板）+ 视觉基因组显式参数（未指定维度猛烈随机）；
   *  生态角色用 eco 锚裁决（捕食/食草/中立 + cap 种群上限），不依赖血统父链；
   *  进化图谱 parent = null（与预设物种同级的「新根源」）。 */
  static readonly FORM_ANCHOR: Record<string, number> = {
    person: R.HUMAN, sheep: R.SHEEP, wolf: R.WOLF, bear: R.BEAR, dragon: R.DRAGON, deer: R.DEER,
    penguin: R.PENGUIN, camel: R.CAMEL, scorpion: R.SCORPION, snake: R.SNAKE, snowwolf: R.SNOWWOLF,
    skeleton: R.SKELETON, demon: R.DEMON, mage: R.MAGE, troll: R.TROLL, ogre: R.OGRE,
    whitewalker: R.WHITEWALKER, vampire: R.VAMPIRE, kraken: R.KRAKEN, sandworm: R.SANDWORM, basilisk: R.BASILISK,
  };
  /** 各生态角色的属性缺省（全新造物基线——非任何模板的数值） */
  private static readonly ECO_BASE: Record<string, { hp: number; dmg: number; speed: number; repro: number; maxAge: number; cap: number }> = {
    pred: { hp: 48, dmg: 12, speed: 0.085, repro: 0.0028, maxAge: 32, cap: 60 },
    herb: { hp: 24, dmg: 2, speed: 0.06, repro: 0.004, maxAge: 24, cap: 140 },
    neutral: { hp: 40, dmg: 6, speed: 0.08, repro: 0.0038, maxAge: 40, cap: 80 },
    civ: { hp: 62, dmg: 9, speed: 0.09, repro: 0.0055, maxAge: 65, cap: 0 },
  };
  spawnCustomSpecies(opts: {
    name?: string; count: number; x?: number; y?: number;
    wild?: boolean; predator?: boolean; hostile?: boolean;
    hp?: number; dmg?: number; speed?: number; repro?: number; maxAge?: number; cap?: number;
    form?: string; archetype?: string;
    vis?: Partial<Pick<VisGenome, 'hue' | 'size' | 'bulk' | 'horns' | 'spikes' | 'mane' | 'tail' | 'ears' | 'glow' | 'pattern' | 'crest'>>;
  }): { id: number; name: string; spawned: number; at: [number, number]; form: string } | null {
    if (this.dynRaces.size >= 64) return null;
    const wild = opts.wild ?? true;
    // —— 生态角色：捕食/食草/中立（文明种族默认中立）——
    const eco: 'pred' | 'herb' | 'neutral' = wild
      ? (opts.predator ? 'pred' : opts.predator === false ? (opts.hp != null && opts.dmg != null && opts.dmg <= 3 ? 'herb' : 'neutral') : 'neutral')
      : 'neutral';
    const base = GameEngine.ECO_BASE[!wild ? 'civ' : eco];
    // —— 体形族系：决定精灵渲染色板与身体构造（缺省按角色随机挑一个有戏剧性的）——
    const FORM_POOL: Record<string, string[]> = {
      pred: ['wolf', 'bear', 'snake', 'scorpion', 'snowwolf', 'ogre', 'troll', 'basilisk', 'dragon'],
      herb: ['sheep', 'deer', 'penguin', 'camel'],
      neutral: ['person', 'mage', 'skeleton', 'vampire', 'whitewalker'],
      civ: ['person'],
    };
    const formQ = (opts.form ?? '').trim().toLowerCase();
    const form = formQ in GameEngine.FORM_ANCHOR
      ? formQ
      : FORM_POOL[!wild ? 'civ' : eco][Math.floor(this.rng() * FORM_POOL[!wild ? 'civ' : eco].length)];
    const anchor = GameEngine.FORM_ANCHOR[form] ?? R.WOLF;
    // —— 全新属性（显式设计值优先；缺省 = 生态角色基线 ± 随机个性扰动，非模板继承）——
    const jit = (v: number, amt: number) => Math.round(v * (1 + (this.rng() - 0.5) * amt) * 100) / 100;
    const hp = Math.max(1, Math.round(opts.hp ?? jit(base.hp, 0.3)));
    const dmg = Math.max(0, Math.round((opts.dmg ?? jit(base.dmg, 0.3)) * 10) / 10);
    const speed = Math.round(Math.max(0.005, Math.min(0.3, opts.speed ?? jit(base.speed, 0.25))) * 1000) / 1000;
    const repro = Math.round(Math.max(0, Math.min(0.02, opts.repro ?? jit(base.repro, 0.3))) * 10000) / 10000;
    const maxAge = Math.max(1, Math.round(opts.maxAge ?? jit(base.maxAge, 0.35)));
    const cap = Math.max(4, Math.min(400, Math.round(opts.cap ?? base.cap)));
    const predator = eco === 'pred';
    const hostile = opts.hostile ?? (predator && this.rng() < 0.5);
    const id = this.dynSeq++;
    const fbEnv = GameEngine.SPEC_ENV[Math.floor(this.rng() * GameEngine.SPEC_ENV.length)];
    const fbPow = GameEngine.SPEC_POWER[Math.floor(this.rng() * GameEngine.SPEC_POWER.length)];
    const fbTail = GameEngine.SPEC_TAIL[Math.floor(this.rng() * GameEngine.SPEC_TAIL.length)];
    const fallback = `${fbEnv}${fbPow}${fbTail}`;
    const name = ((opts.name ?? '').trim() || fallback).slice(0, 8);
    const tint = GameEngine.DYN_TINTS[this.dynRaces.size % GameEngine.DYN_TINTS.length];
    // —— 全新视觉基因组：以体形族系色板为底猛烈随机（非模板 drift），显式参数覆盖 ——
    const randVis = visFromGene(anchor, { s: 1, d: predator ? 1.4 : 0.9, h: 1, r: 1 }, this.rng);
    randVis.hue = Math.round((this.rng() - 0.5) * 72); // 全新造物色相全域随机（±36°）
    const vv = opts.vis ?? {};
    const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const vis: VisGenome = {
      ...randVis,
      root: anchor,
      hue: vv.hue != null ? Math.round(cl(vv.hue, -40, 40)) : randVis.hue,
      lum: Math.round(cl(randVis.lum, 0.72, 1.28) * 100) / 100,
      size: vv.size != null ? Math.round(cl(vv.size, 0.8, 1.45) * 100) / 100 : randVis.size,
      bulk: vv.bulk != null ? Math.round(cl(vv.bulk, 0, 1) * 100) / 100 : randVis.bulk,
      horns: vv.horns != null ? Math.round(cl(vv.horns, 0, 2)) : randVis.horns,
      spikes: vv.spikes != null ? (vv.spikes ? 1 : 0) : randVis.spikes,
      mane: vv.mane != null ? (vv.mane ? 1 : 0) : randVis.mane,
      tail: vv.tail != null ? Math.round(cl(vv.tail, 0, 2)) : randVis.tail,
      ears: vv.ears != null ? Math.round(cl(vv.ears, 0, 2)) : randVis.ears,
      glow: vv.glow != null ? (vv.glow ? 1 : 0) : randVis.glow,
      pattern: vv.pattern != null ? Math.round(cl(vv.pattern, 0, 2)) : randVis.pattern,
      crest: vv.crest != null ? (vv.crest ? 1 : 0) : randVis.crest,
    };
    // —— 全新种族定义：从零构建（不 spread 任何模板）——
    RACES[id] = {
      key: `dyn${id}`,
      name,
      isCiv: !wild,
      hostile,
      flying: form === 'dragon',
      predator,
      undead: form === 'skeleton' || form === 'whitewalker' || form === 'vampire',
      lavaImmune: form === 'demon',
      aquatic: form === 'kraken' ? true : undefined,
      sandswim: form === 'sandworm' ? true : undefined,
      hp, dmg, speed, maxAge, repro,
      sprite: form as RaceDef['sprite'],
      dynTint: tint,
      vis,
      archetype: (opts.archetype ?? '').trim().slice(0, 24) || undefined,
      // 文明种族：性格维度随机赋性（0.15-0.85）
      ...(!wild
        ? {
            diplo: Math.round((0.15 + this.rng() * 0.7) * 100) / 100,
            aggr: Math.round((0.15 + this.rng() * 0.7) * 100) / 100,
            greed: Math.round((0.15 + this.rng() * 0.7) * 100) / 100,
            piety: Math.round((0.15 + this.rng() * 0.7) * 100) / 100,
            industry: Math.round((0.15 + this.rng() * 0.7) * 100) / 100,
            arcane: Math.round((0.15 + this.rng() * 0.7) * 100) / 100,
            growth: Math.round((0.15 + this.rng() * 0.7) * 100) / 100,
            harmony: Math.round((0.15 + this.rng() * 0.7) * 100) / 100,
          }
        : {}),
    };
    this.dynRaces.set(id, { parent: anchor, bornYear: Math.floor(this.yearF), eco: wild ? eco : undefined, cap: wild ? cap : undefined });
    this.speciesBase.set(id, { gene: { s: 1, d: 1, h: 1, r: 1 }, gen: 0 });
    this.lastEcoPop.set(id, 0);
    this.speciesHist.set(id, [0]);
    if (!wild) CIV_RACES.push(id);
    invalidateVisCache();
    // —— 降临种群（placeRace：落点校验吸附——水/岩浆自动找最近合法地块）——
    const hasXY = typeof opts.x === 'number' && typeof opts.y === 'number';
    const cx = hasXY ? (opts.x as number) : this.cam.x;
    const cy = hasXY ? (opts.y as number) : this.cam.y;
    let spawned = 0;
    for (let k = 0; k < Math.max(1, Math.min(40, opts.count)); k++) {
      const sx = k === 0 ? cx : cx + (this.rng() - 0.5) * 7;
      const sy = k === 0 ? cy : cy + (this.rng() - 0.5) * 7;
      if (this.placeRace(id, sx, sy, k > 0)) spawned++;
    }
    this.lastEcoPop.set(id, spawned);
    WBB.touchMeta(); // 新种族首代 spawn 收口（保守：isCiv 单位可能已自动建国）
    // —— 图谱 + 纪事（parent = null：与预设物种同级的新根源）——
    const node: EvoNode = {
      id: this.evoSeq++, kind: 'species', name, parent: null, year: Math.floor(this.yearF), colorHex: tint,
      detail: `神谕从虚无中锻造的全新${wild ? `野生物种（${eco === 'pred' ? '捕食者' : eco === 'herb' ? '食草动物' : '中立生灵'}）` : '文明种族'}——体形族系「${form}」，无模板血统 —— ${describeVis(vis)}`,
      stat: describeVis(vis), alive: true, meta: { race: id, divine: 1, spawned },
    };
    this.evoNodes.push(node);
    this.evoIndex.set(`sp:${id}`, node.id);
    this.addEvent('emerge', `神谕之手撕开造物帷幕——全新${wild ? '野生物种' : '文明种族'}「${name}」降临界域（${spawned} 只个体，体形族系 ${form}，属性 hp ${hp}/攻 ${dmg}/速 ${speed}，外貌：${describeVis(vis)}）`, { colorHex: '#ffd93d', x: cx, y: cy });
    this.toast(`神创物种「${name}」降临 ×${spawned}`, 'good');
    return { id, name, spawned, at: [Math.round(cx), Math.round(cy)], form };
  }

  // ———————————————— 造物工坊（Creation Studio：图鉴放置 / 全元素原地编辑 / 永久收藏） ————————————————

  /** 图鉴模板种族解析（跨世界稳定：内置 key 优先 → 名称匹配 → 狼兜底） */
  resolveCreationBase(baseKey: string, baseName: string): number {
    for (const idS of Object.keys(RACES)) {
      const rid = Number(idS);
      if (rid < 100 && RACES[rid] && RACES[rid].key === baseKey) return rid;
    }
    for (const idS of Object.keys(RACES)) {
      const rid = Number(idS);
      if (RACES[rid] && RACES[rid].name === baseName) return rid;
    }
    return R.WOLF;
  }

  /** 图鉴条目在本世界已注册的种族 id（从未放置过 → null）。
   *  Task 72 遗留收口：Toolbar cre: 数据编辑据此改走 editRaceDef —— 已降临个体同步生效 */
  creationRaceIdOf(uid: string): number | null {
    const rid = this.creationRaceIds.get(uid);
    return rid !== undefined && RACES[rid] ? rid : null;
  }

  /** 图鉴条目 → 本世界种族注册（幂等：creationRaceIds 缓存；注册即入 dynRaces 随存档走）；
   *  v5：全新造物元数据（体形族系/捕食/敌意/上限/原型）全量落地——放置的图鉴物种不再是父模板翻版 */
  registerCreation(entry: SpeciesCreation): number {
    const cached = this.creationRaceIds.get(entry.uid);
    if (cached !== undefined && RACES[cached]) return cached;
    if (this.dynRaces.size >= 64) return -1;
    const base = this.resolveCreationBase(entry.baseKey, entry.baseName);
    const bd = RACES[base];
    if (!bd) return -1;
    const id = this.dynSeq++;
    // 体形族系锚（全新造物优先用 form；旧条目回退 base 模板）
    const formQ = (entry.form ?? '').trim().toLowerCase();
    const anchor = (formQ in GameEngine.FORM_ANCHOR ? GameEngine.FORM_ANCHOR[formQ] : base) ?? base;
    RACES[id] = {
      ...(formQ in GameEngine.FORM_ANCHOR ? RACES[anchor] : bd), // 全新造物：从体形族系预设拿 sprite/flags 基底（非属性）
      key: `dyn${id}`,
      name: entry.name.slice(0, 8),
      isCiv: !entry.wild,
      hostile: entry.hostile ?? (formQ in GameEngine.FORM_ANCHOR ? false : bd.hostile),
      predator: entry.predator ?? (formQ in GameEngine.FORM_ANCHOR ? false : bd.predator),
      archetype: entry.archetype,
      dynTint: GameEngine.DYN_TINTS[Math.max(0, Math.min(7, entry.tintIdx | 0))],
      vis: Array.isArray(entry.visT) && entry.visT.length >= 13
        ? tupleToVis(entry.visT as [number, number, number, number, number, number, number, number, number, number, number, number, number])
        : visFromGene(anchor, { s: 1, d: 1, h: 1, r: 1 }, this.rng),
      hp: Math.max(1, Math.round(entry.hp)),
      dmg: Math.max(0, entry.dmg),
      speed: Math.max(0.005, Math.min(0.3, entry.speed)),
      repro: Math.max(0, Math.min(0.02, entry.repro)),
      maxAge: Math.max(1, Math.round(entry.maxAge)),
    };
    if (Array.isArray(entry.visT) && entry.visT.length >= 13) RACES[id].vis = { ...RACES[id].vis!, root: anchor };
    const eco = entry.wild ? (entry.predator ? 'pred' : entry.predator === false ? (entry.dmg <= 3 ? 'herb' : 'neutral') : undefined) : undefined;
    this.dynRaces.set(id, { parent: anchor, bornYear: Math.floor(this.yearF), uid: entry.uid, eco, cap: entry.wild ? entry.cap : undefined });
    this.speciesBase.set(id, { gene: { s: 1, d: 1, h: 1, r: 1 }, gen: 0 });
    this.lastEcoPop.set(id, 0);
    this.speciesHist.set(id, [0]);
    if (!entry.wild && !CIV_RACES.includes(id)) CIV_RACES.push(id);
    this.creationRaceIds.set(entry.uid, id);
    invalidateVisCache();
    return id;
  }

  /** 放置图鉴物种（applyTool 的 cre: 前缀入口；散布语义与原生生物工具一致） */
  placeCreation(uid: string, wx: number, wy: number, count: number, r: number): number {
    const entry = getCreation(uid);
    if (!entry || entry.kind !== 'species') return 0;
    const id = this.registerCreation(entry);
    if (id < 0) return 0;
    const scatter = Math.max(2, Math.min(10, r));
    let spawned = 0;
    for (let k = 0; k < Math.max(1, Math.min(40, count)); k++) {
      let px = wx;
      let py = wy;
      if (k > 0) {
        const ang = this.rng() * Math.PI * 2;
        const dist = 0.6 + this.rng() * scatter;
        px = Math.max(0, Math.min(W - 0.02, wx + Math.cos(ang) * dist));
        py = Math.max(0, Math.min(H - 0.02, wy + Math.sin(ang) * dist));
      }
      if (this.placeRace(id, px, py, k > 0)) spawned++;
    }
    if (spawned > 0) {
      WBB.touchMeta(); // 新种族首代收口
      this.toast(`图鉴造物「${entry.name}」降临 ×${spawned}`, 'good');
    }
    return spawned;
  }

  /** 现存种族 → 图鉴永久收藏（「编辑生物栏元素 → 存为自定义物种」的落地）；v5：带出全新造物元数据（体形族系/生态角色/上限） */
  saveRaceToCreation(raceId: number, opts: { pin?: boolean; note?: string } = {}): SpeciesCreation | null {
    const d = RACES[raceId];
    if (!d) return null;
    // 动态种：模板取其父链（体形族系锚）；内置种：模板即自身
    const dynInfo = this.dynRaces.get(raceId);
    const parentId = dynInfo?.parent ?? (raceId < 100 ? raceId : 0);
    const pdef = RACES[parentId];
    const entry = addCreation({
      kind: 'species',
      name: d.name,
      baseKey: pdef?.key ?? 'wolf',
      baseName: pdef?.name ?? '狼',
      wild: !d.isCiv,
      hp: d.hp, dmg: d.dmg, speed: d.speed, repro: d.repro, maxAge: d.maxAge,
      visT: d.vis ? visToTuple(d.vis) : undefined,
      tintIdx: Math.max(0, GameEngine.DYN_TINTS.indexOf(d.dynTint ?? '')),
      power: 1,
      form: d.sprite,
      predator: !!d.predator,
      hostile: !!d.hostile,
      cap: dynInfo?.cap,
      archetype: d.archetype,
      pinned: opts.pin ?? true,
      createdBy: 'player',
      note: opts.note,
    } as Omit<SpeciesCreation, 'uid' | 'createdAt'>);
    if (!entry) return null;
    // 收藏即链接：动态种直接挂现有 id（当前世界放置不变异）；内置种按需注册独立分身
    if (opts.pin ?? true) {
      if (raceId >= 100 && dynInfo) {
        this.creationRaceIds.set(entry.uid, raceId);
        dynInfo.uid = entry.uid;
      }
      // 内置种：不自动注册（保留原种群纯粹性；从工具栏点击时才注册分身）
    }
    this.toast(`「${d.name}」已铭刻图鉴${(opts.pin ?? true) ? '，工具栏可放置' : ''}`, 'good');
    return entry;
  }

  /** 种族定义原地编辑（生物栏全元素可编辑）：内置 id 入 raceMods 随档走；动态种同步图鉴；
   *  flags 变化时失效 WASM 敌我标志缓存；可选波及现存个体（这才是「编辑种族」） */
  editRaceDef(
    raceId: number,
    patch: Partial<Pick<RaceDef, 'name' | 'hp' | 'dmg' | 'speed' | 'repro' | 'maxAge' | 'isCiv' | 'hostile'>> & { rerollVis?: number },
    opts: { applyToExisting?: boolean } = {},
  ): RaceDef | null {
    const d = RACES[raceId];
    if (!d) return null;
    if (!this.raceOrig.has(raceId)) this.raceOrig.set(raceId, { ...d }); // 首次覆写前快照出厂值
    const before = { isCiv: d.isCiv, hostile: d.hostile };
    const statBefore = { hp: d.hp, dmg: d.dmg, speed: d.speed, maxAge: d.maxAge };
    if (typeof patch.name === 'string' && patch.name.trim()) d.name = patch.name.trim().slice(0, 8);
    if (typeof patch.hp === 'number' && Number.isFinite(patch.hp)) d.hp = Math.max(1, Math.min(99999, Math.round(patch.hp)));
    if (typeof patch.dmg === 'number' && Number.isFinite(patch.dmg)) d.dmg = Math.max(0, Math.min(500, patch.dmg));
    if (typeof patch.speed === 'number' && Number.isFinite(patch.speed)) d.speed = Math.max(0.005, Math.min(0.3, patch.speed));
    if (typeof patch.repro === 'number' && Number.isFinite(patch.repro)) d.repro = Math.max(0, Math.min(0.02, patch.repro));
    if (typeof patch.maxAge === 'number' && Number.isFinite(patch.maxAge)) d.maxAge = Math.max(1, Math.min(9999, Math.round(patch.maxAge)));
    if (typeof patch.isCiv === 'boolean' && patch.isCiv !== before.isCiv) {
      d.isCiv = patch.isCiv;
      if (patch.isCiv && !CIV_RACES.includes(raceId)) CIV_RACES.push(raceId);
      if (!patch.isCiv) {
        const i = CIV_RACES.indexOf(raceId);
        if (i >= 0) CIV_RACES.splice(i, 1);
      }
    }
    if (typeof patch.hostile === 'boolean') d.hostile = patch.hostile;
    if (typeof patch.rerollVis === 'number') {
      const parent = this.dynRaces.get(raceId)?.parent ?? (raceId < 100 ? raceId : 0);
      d.vis = mutateVis(d.vis ?? visFromGene(parent, { s: 1, d: 1, h: 1, r: 1 }, this.rng), d.vis?.root ?? parent, this.rng, Math.max(0.2, Math.min(3, patch.rerollVis)));
      invalidateVisCache();
    }
    // 内置种覆写入档（动态种不入：dyn.races 元组 + 图鉴同步已覆盖）
    if (raceId < 100) {
      this.raceMods.set(raceId, JSON.stringify({ name: d.name, hp: d.hp, dmg: d.dmg, speed: d.speed, repro: d.repro, maxAge: d.maxAge, isCiv: d.isCiv, hostile: d.hostile }));
    }
    // WASM 敌我标志缓存失效 + JS 敌意 LUT 清空（hostile/isCiv 变化波及敌我判定）
    if (d.hostile !== before.hostile || d.isCiv !== before.isCiv) {
      WB.invalidateRaceFlags();
      this.enemyLut.clear();
    }
    // 图鉴联动：该种族源自图鉴 → 库内属性同步（编辑处处生效）
    for (const [uid, rid] of this.creationRaceIds) {
      if (rid === raceId) {
        patchCreation(uid, { name: d.name, hp: d.hp, dmg: d.dmg, speed: d.speed, repro: d.repro, maxAge: d.maxAge, wild: !d.isCiv, visT: d.vis ? visToTuple(d.vis) : undefined });
        break;
      }
    }
    // 存量个体同步（种族级改写波及现存族群——体型/杀伤/寿限立即生效）
    if (opts.applyToExisting !== false) {
      const statChanged = statBefore.hp !== d.hp || statBefore.dmg !== d.dmg || statBefore.speed !== d.speed || statBefore.maxAge !== d.maxAge;
      if (statChanged) {
        for (const u of this.units) {
          if (u.dead || u.race !== raceId) continue;
          u.maxHp = d.hp;
          u.hp = Math.min(u.hp, d.hp);
          u.dmg = d.dmg;
          u.speed = d.speed;
          u.maxAge = d.maxAge;
        }
        WBB.touchMeta(); // 单位属性列重灌
      }
    }
    this.toast(`「${d.name}」形态已改写`, 'good', true); // 神力编辑回执：不惊动岁月沙漏
    return d;
  }

  /** 物品定义原地编辑（宝物栏全元素可编辑；随档走 + 图鉴神物联动） */
  editItemDef(kind: string, patch: Partial<Pick<ItemDef, 'name' | 'rarity' | 'desc' | 'dmg' | 'hp' | 'speedMul' | 'regen' | 'armor' | 'crit' | 'lifesteal' | 'thorns' | 'ranged'>>): ItemDef | null {
    const d = ITEM_DEFS[kind];
    if (!d) return null;
    if (!this.itemOrig.has(kind)) this.itemOrig.set(kind, { ...d });
    if (typeof patch.name === 'string' && patch.name.trim()) d.name = patch.name.trim().slice(0, 8);
    if (typeof patch.rarity === 'number' && Number.isFinite(patch.rarity)) d.rarity = Math.max(0, Math.min(4, Math.round(patch.rarity)));
    for (const k of ['dmg', 'hp', 'speedMul', 'regen', 'armor', 'crit', 'lifesteal', 'thorns', 'ranged'] as const) {
      const v = patch[k];
      if (typeof v === 'number' && Number.isFinite(v)) (d as unknown as Record<string, number>)[k] = v;
    }
    if (typeof patch.desc === 'string' && patch.desc.trim()) d.desc = patch.desc.trim().slice(0, 40);
    this.itemMods.set(kind, JSON.stringify({ name: d.name, rarity: d.rarity, desc: d.desc, dmg: d.dmg, hp: d.hp, speedMul: d.speedMul, regen: d.regen, armor: d.armor, crit: d.crit, lifesteal: d.lifesteal, thorns: d.thorns, ranged: d.ranged }));
    // 图鉴神物联动
    const cre = getCreation(kind);
    if (cre?.kind === 'item') {
      patchCreation(kind, { name: d.name, rarity: d.rarity, desc: d.desc, stats: { dmg: d.dmg, hp: d.hp, speedMul: d.speedMul, regen: d.regen, armor: d.armor, crit: d.crit, lifesteal: d.lifesteal, thorns: d.thorns, ranged: d.ranged } });
    }
    this.toast(`「${d.name}」已重铸`, 'good', true); // 神力编辑回执：不惊动岁月沙漏
    return d;
  }

  /** —— 无极数值面板（Task 71）：出厂值读取 ——
   *  从未覆写过的定义返回 null（UI 侧据此隐藏「恢复出厂」按钮） */
  raceOrigOf(raceId: number): RaceDef | null {
    const o = this.raceOrig.get(raceId);
    return o ? { ...o } : null;
  }
  itemOrigOf(kind: string): NonNullable<(typeof ITEM_DEFS)[string]> | null {
    const o = this.itemOrig.get(kind);
    return o ? { ...o } : null;
  }

  /** —— 无极数值面板（Task 71）：恢复出厂 ——
   *  种族：还原 RACES + raceMods 删除（随档不再携带）+ 存量个体同步 + 缓存失效 + 图鉴联动 */
  resetRaceDef(raceId: number): RaceDef | null {
    const orig = this.raceOrig.get(raceId);
    const d = RACES[raceId];
    if (!orig || !d) return null;
    const before = { isCiv: d.isCiv, hostile: d.hostile };
    RACES[raceId] = { ...orig };
    this.raceMods.delete(raceId);
    this.raceOrig.delete(raceId);
    if (before.isCiv !== orig.isCiv) {
      const i = CIV_RACES.indexOf(raceId);
      if (orig.isCiv && i < 0) CIV_RACES.push(raceId);
      if (!orig.isCiv && i >= 0) CIV_RACES.splice(i, 1);
    }
    if (before.hostile !== orig.hostile || before.isCiv !== orig.isCiv) {
      WB.invalidateRaceFlags();
      this.enemyLut.clear();
    }
    for (const [uid, rid] of this.creationRaceIds) {
      if (rid === raceId) {
        patchCreation(uid, { name: orig.name, hp: orig.hp, dmg: orig.dmg, speed: orig.speed, repro: orig.repro, maxAge: orig.maxAge, wild: !orig.isCiv });
        break;
      }
    }
    for (const u of this.units) {
      if (u.dead || u.race !== raceId) continue;
      u.maxHp = orig.hp;
      u.hp = Math.min(u.hp, orig.hp);
      u.dmg = orig.dmg;
      u.speed = orig.speed;
      u.maxAge = orig.maxAge;
    }
    WBB.touchMeta();
    this.toast(`「${orig.name}」已恢复出厂形态`, 'good', true);
    return RACES[raceId];
  }

  /** 物品：还原 ITEM_DEFS + itemMods 删除 + 图鉴神物联动 */
  resetItemDef(kind: string): NonNullable<(typeof ITEM_DEFS)[string]> | null {
    const orig = this.itemOrig.get(kind);
    const d = ITEM_DEFS[kind];
    if (!orig || !d) return null;
    ITEM_DEFS[kind] = { ...orig };
    this.itemMods.delete(kind);
    this.itemOrig.delete(kind);
    const cre = getCreation(kind);
    if (cre?.kind === 'item') {
      const r = ITEM_DEFS[kind];
      patchCreation(kind, { name: r.name, rarity: r.rarity, desc: r.desc, stats: { dmg: r.dmg, hp: r.hp, speedMul: r.speedMul, regen: r.regen, armor: r.armor, crit: r.crit, lifesteal: r.lifesteal, thorns: r.thorns, ranged: r.ranged } });
    }
    this.toast(`「${ITEM_DEFS[kind].name}」已恢复出厂`, 'good', true);
    return ITEM_DEFS[kind];
  }

  /** 图鉴神铸武器 → 指定王国（工坊「铸造到王国」；复用 forgeDivineWeapon 全部奇迹通道） */
  forgeCreationWeapon(uid: string, civId: number): EmergentWeapon | null {
    const entry = getCreation(uid);
    if (!entry || entry.kind !== 'weapon') return null;
    return this.forgeDivineWeapon(civId, { name: entry.name, pl: entry.payload, dl: entry.delivery, gd: entry.guide, pw: entry.powerSlot, boost: entry.boost });
  }

  /** 内置定义覆写全量还原（新世界/读档前调用；出厂快照未动的项无操作） */
  private resetMods(): void {
    for (const [rid, orig] of this.raceOrig) {
      if (rid >= 100) continue; // 动态种族：RACES 已随 dynRaces 清理删除
      if (RACES[rid]) RACES[rid] = { ...orig };
    }
    this.raceMods.clear();
    for (const [kind, orig] of this.itemOrig) {
      if (ITEM_DEFS[kind]) ITEM_DEFS[kind] = { ...orig };
    }
    this.itemMods.clear();
    WB.invalidateRaceFlags();
    this.enemyLut.clear();
  }


  /** 进化评估（每 600 tick）：种群基因均值 vs 物种棘轮基线 → 漂移超 12% 时棘轮推进 + 亚种命名 + 播报；
   *  涌现层：阈值特质具名播报 + 临界种化诞生全新动态物种 */
  evolutionTick() {
    const DIM_NAME: Record<keyof Gene, string> = { s: '速度', d: '杀伤', h: '体魄', r: '繁衍' };
    // 超级演化 v4：种群实况累计器（自然融合扫描的数据源：pop/质心/基因均值）
    const hybStats = new Map<number, { pop: number; cx: number; cy: number; s: number; d: number; h: number; r: number }>();
    for (const race of this.ecoRaces()) {
      let n = 0;
      let s = 0, d = 0, h = 0, r = 0;
      let mx = 0, my = 0;
      for (const u of this.units) {
        if (u.dead || u.race !== race || !u.gene) continue;
        n++; s += u.gene.s; d += u.gene.d; h += u.gene.h; r += u.gene.r; mx += u.x; my += u.y;
      }
      if (n >= 12) hybStats.set(race, { pop: n, cx: mx / n, cy: my / n, s, d, h, r });
      if (n < 12) continue; // 种群太小不评估（避免噪声棘轮）
      const avg: Gene = { s: s / n, d: d / n, h: h / n, r: r / n };
      const base = this.speciesBase.get(race) ?? { gene: { s: 1, d: 1, h: 1, r: 1 }, gen: 0 };
      // —— 涌现阈值特质：任一维度均值首破 1.45 → 具名行为涌现（生态面板徽章 + 纪事播报） ——
      const beh = base.beh ?? [];
      const BEH_NAME: Record<keyof Gene, string> = { s: '疾足', d: '凶猛', h: '坚躯', r: '爆发繁衍' };
      for (const dim of ['s', 'd', 'h', 'r'] as (keyof Gene)[]) {
        if (avg[dim] >= 1.45 && !beh.includes(BEH_NAME[dim])) {
          beh.push(BEH_NAME[dim]);
          this.addEvent('emerge', `「${RACES[race].name}」种群涌现出新行为特质——「${BEH_NAME[dim]}」（${DIM_NAME[dim]}均值达 ${avg[dim].toFixed(2)}，突破物种常态）`, { colorHex: '#6fd66f' });
        }
      }
      if (beh !== base.beh) base.beh = beh;
      // 找出漂移最大的维度
      let maxDim: keyof Gene = 's';
      let maxDrift = 0;
      for (const dim of ['s', 'd', 'h', 'r'] as (keyof Gene)[]) {
        const drift = (avg[dim] - base.gene[dim]) / base.gene[dim];
        if (Math.abs(drift) > Math.abs(maxDrift)) { maxDrift = drift; maxDim = dim; }
      }
      if (Math.abs(maxDrift) >= 0.12) {
        // 棘轮推进：基线向均值靠拢 60%（代代累积）
        for (const dim of ['s', 'd', 'h', 'r'] as (keyof Gene)[]) {
          base.gene[dim] = Math.max(0.5, Math.min(2, base.gene[dim] + (avg[dim] - base.gene[dim]) * 0.6));
        }
        base.gen++;
        // 亚种命名：棘轮推进 = 进化出可命名的地方型亚种
        const sub = this.subspeciesName(race, maxDim, maxDrift > 0);
        base.sub = sub;
        this.speciesBase.set(race, base);
        const pct = Math.round(maxDrift * 100);
        const dir = maxDrift > 0 ? '强化' : '退化';
        const evo = `${RACES[race].name}演化出新亚种——「${sub}」（第 ${base.gen} 代：${DIM_NAME[maxDim]}${dir} ${Math.abs(pct)}%）`;
        this.addEvent('evolve', evo, { colorHex: '#6fd66f' });
        // —— 涌现式种化尝试（棘轮积累 → 演化奇点）——
        this.speciate(race, base, avg, n);
      } else if (beh !== base.beh) {
        this.speciesBase.set(race, base);
      }
    }
    // —— v3：文明种族进化（人类/精灵/…及其动态亚种全量接入：棘轮 + 王国种族分化种化） ——
    for (const race of [...CIV_RACES]) {
      const def = RACES[race];
      if (!def?.isCiv) continue;
      let n = 0;
      let s = 0, d = 0, h = 0, r = 0;
      let mx = 0, my = 0;
      for (const u of this.units) {
        if (u.dead || u.race !== race || !u.gene) continue;
        n++; s += u.gene.s; d += u.gene.d; h += u.gene.h; r += u.gene.r; mx += u.x; my += u.y;
      }
      if (n >= 25) hybStats.set(race, { pop: n, cx: mx / n, cy: my / n, s, d, h, r });
      if (n < 25) continue; // 文明种族种群门槛更高（城邦人口噪声大）
      const avg: Gene = { s: s / n, d: d / n, h: h / n, r: r / n };
      const base = this.speciesBase.get(race) ?? { gene: { s: 1, d: 1, h: 1, r: 1 }, gen: 0 };
      let maxDim: keyof Gene = 's';
      let maxDrift = 0;
      for (const dim of ['s', 'd', 'h', 'r'] as (keyof Gene)[]) {
        const drift = (avg[dim] - base.gene[dim]) / base.gene[dim];
        if (Math.abs(drift) > Math.abs(maxDrift)) { maxDrift = drift; maxDim = dim; }
      }
      if (Math.abs(maxDrift) >= 0.12) {
        for (const dim of ['s', 'd', 'h', 'r'] as (keyof Gene)[]) {
          base.gene[dim] = Math.max(0.5, Math.min(2, base.gene[dim] + (avg[dim] - base.gene[dim]) * 0.6));
        }
        base.gen++;
        this.speciesBase.set(race, base);
        const pct = Math.round(maxDrift * 100);
        const dir = maxDrift > 0 ? '强化' : '退化';
        this.addEvent('evolve', `${def.name}全族演化——${DIM_NAME[maxDim]}${dir} ${Math.abs(pct)}%（第 ${base.gen} 代族脉，性状已写入血脉）`, { colorHex: '#6fd66f' });
        // —— 王国种族分化种化尝试（演化奇点：诞生全新文明种族） ——
        this.speciate(race, base, avg, n);
      }
    }
    // —— 超级演化 v4：自然物种融合扫描（分布重叠的兴旺物种对 → 小概率诞生杂种） ——
    this.hybridScan(hybStats);
  }

  /** 自然融合扫描（超级演化 v4）：每 600 tick（15 年）一次 ——
   *  野生对：质心距离 ≤ 22 格且双方 pop ≥ 20 → 12% 融合概率
   *  文明对：同王国共存的两个种族（各族 ≥ 12 人于同一国）→ 跨族通婚融合
   *  每轮最多一次融合（防生态地震）；冷却 60 年；3 代内血亲不融合 */
  private hybridScan(stats: Map<number, { pop: number; cx: number; cy: number; s: number; d: number; h: number; r: number }>) {
    if (stats.size < 2 || this.dynRaces.size >= 64) return;
    const toAvg = (st: { pop: number; s: number; d: number; h: number; r: number }): Gene => ({ s: st.s / st.pop, d: st.d / st.pop, h: st.h / st.pop, r: st.r / st.pop });
    const ids = [...stats.keys()];
    // ① 野生对（含动态物种）：分布重叠 → 融合带
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i];
        const b = ids[j];
        const da = RACES[a];
        const db = RACES[b];
        if (!da || !db) continue;
        if (da.isCiv !== db.isCiv) continue; // 野生×文明不融合（生态位与叙事均不通）
        if (da.isCiv && db.isCiv) continue; // 文明对走同王国通道（下方②）
        if (da.undead || db.undead) continue; // 亡者不参与融合（无繁衍）
        const sa = stats.get(a)!;
        const sb = stats.get(b)!;
        if (sa.pop < 20 || sb.pop < 20) continue;
        if (Math.hypot(sa.cx - sb.cx, sa.cy - sb.cy) > 22) continue;
        if (this.rng() > 0.12) continue;
        if (this.hybridizeCore(a, b, { pop: sa.pop, cx: sa.cx, cy: sa.cy, avg: toAvg(sa) }, { pop: sb.pop, cx: sb.cx, cy: sb.cy, avg: toAvg(sb) }, 20)) return; // 每轮一次
      }
    }
    // ② 文明对：同王国共存的两族（跨族通婚 → 混血新种族）
    const rcTally = new Map<string, number>();
    const raceCivs: [number, number][] = [];
    for (const u of this.units) {
      if (u.dead || u.civ < 0) continue;
      const def = RACES[u.race];
      if (!def?.isCiv) continue;
      // 统计每 (race, civ) 计数（一次遍历建立索引）
      const rcKey = `${u.race}:${u.civ}`;
      rcTally.set(rcKey, (rcTally.get(rcKey) ?? 0) + 1);
    }
    for (const [key, cnt] of rcTally) {
      if (cnt < 12) continue;
      const [race, civ] = key.split(':').map(Number);
      raceCivs.push([race, civ]);
    }
    const civPairs = new Map<string, [number, number, number]>(); // pairKey → [raceA, raceB, 共存王国]
    for (let i = 0; i < raceCivs.length; i++) {
      for (let j = i + 1; j < raceCivs.length; j++) {
        const [ra, ca] = raceCivs[i];
        const [rb, cb] = raceCivs[j];
        if (ca !== cb || ra === rb) continue;
        const pairKey = `${Math.min(ra, rb)}-${Math.max(ra, rb)}`;
        civPairs.set(pairKey, [ra, rb, ca]);
      }
    }
    for (const [ra, rb, civ] of civPairs.values()) {
      const sa = stats.get(ra);
      const sb = stats.get(rb);
      if (!sa || !sb) continue;
      if (this.rng() > 0.15) continue;
      const res = this.hybridizeCore(ra, rb, { pop: sa.pop, cx: sa.cx, cy: sa.cy, avg: toAvg(sa) }, { pop: sb.pop, cx: sb.cx, cy: sb.cy, avg: toAvg(sb) }, 12);
      if (res) {
        // 混血种族初始归属：出生地 = 共存王国首都附近
        const civ2 = this.civs[civ];
        if (civ2?.alive && civ2.capital >= 0) {
          for (const u of this.units) {
            if (u.race !== res.id) continue;
            if (Math.hypot(u.x - ((civ2.capital % W) + 0.5), u.y - (((civ2.capital / W) | 0) + 0.5)) > 18) continue;
            u.civ = civ;
          }
        }
        return;
      }
    }
  }

  /** 种群历史采样（每 300 tick≈1 年）：生态物种（含动态种化新物种）规模入环形缓冲 */
  sampleHistory() {
    const ECO_RACES = this.ecoRaces();
    const counts = new Map<number, number>();
    for (const u of this.units) {
      if (u.dead) continue;
      if (ECO_RACES.includes(u.race)) counts.set(u.race, (counts.get(u.race) ?? 0) + 1);
    }
    for (const race of ECO_RACES) {
      const arr = this.speciesHist.get(race) ?? [];
      arr.push(counts.get(race) ?? 0);
      if (arr.length > 120) arr.shift();
      this.speciesHist.set(race, arr);
    }
  }

  // ---------------- 成就系统（评估/注入/快照） ----------------

  /** 成就评估（每 600 tick）：条件达成 → 解锁 + 纪事播报；未解锁 → 进度缓存 */
  achievementsTick() {
    WBB.touchMeta(); // Stage 3：成就奖励可能发装备/特质（保守）
    // 进度缓存（未解锁的进度型成就，面板进度条实时展示）
    const prog: Record<string, number> = {};
    for (const a of ACHIEVEMENTS) {
      if (this.achUnlocked.has(a.id)) continue;
      if (a.progress) prog[a.id] = a.progress(this);
    }
    this.achProgressCache = prog;
    // 条件评估（新解锁 → 播报）
    const newly = checkAchievements(this);
    for (const a of newly) {
      this.achUnlocked.set(a.id, Math.floor(this.yearF));
      this.addEvent('achieve', `成就达成「${a.name}」— ${a.desc}`, { colorHex: '#fbbf24' });
      this.onSound?.('achieve'); // 成就琶音（42-e 接线）
    }
  }

  /** 注入已解锁成就（gameStore 从 localStorage 恢复 → 引擎不再重复播报；返回实际接受数） */
  injectAch(ids: { id: string; year: number }[]): number {
    let n = 0;
    for (const { id, year } of ids) {
      if (this.achUnlocked.has(id)) continue;
      if (!ACHIEVEMENTS.some((a) => a.id === id)) continue;
      this.achUnlocked.set(id, year);
      n++;
    }
    return n;
  }

  // ---------------- 生态竞争系统（植被/食草/食肉承载链） ----------------

  /** 生态评估（每 120 tick）：承载力竞争 + 过牧啃食 + 捕食失衡，Lotka-Volterra 式振荡 */
  ecoTick() {
    // 1) 植被重算（草原+森林 = 食草承载力底座）
    let grass = 0;
    for (let i = 0; i < W * H; i++) {
      const t = this.terrain[i];
      if (t === T.GRASS || t === T.FOREST) grass++;
    }
    this.grassTiles = grass;
    // 2) 种群清点（同步重算猎物密度场 —— 饥饿捕食者的宏观导航底图）
    let herb = 0;
    let pred = 0;
    const herbivores: Unit[] = [];
    const predators: Unit[] = [];
    this.preyGrid.fill(0);
    for (const u of this.units) {
      if (u.dead) continue;
      const udef = RACES[u.race];
      // 水生物种（鱼/蟹/龟/鲨等）不入陆地承载账本（海洋生态由 wildCapOf 封顶）；
      // 鲨鱼计入猎物密度场导航无意义（自身即猎手），跳过
      if (udef.aquatic) continue;
      if (this.isHerbivoreRace(u.race)) {
        herb++; herbivores.push(u);
        const gx = Math.min(31, Math.max(0, (u.x / 8) | 0));
        const gy = Math.min(19, Math.max(0, (u.y / 8) | 0));
        this.preyGrid[gy * 32 + gx]++;
      }
      else if (this.isPredatorRace(u.race)) { pred++; predators.push(u); }
    }
    // 3) 食草动物 vs 植被承载力（竞争性饥饿：弱者先饿；缺口越大饿殍越多 —— 不再保护性封顶）
    const capacity = grass * 1.6;
    if (herb > capacity) {
      const starve = Math.min(10, Math.ceil((herb - capacity) * 0.2));
      for (let k = 0; k < starve; k++) {
        // 竞争性饥饿：三选一，体魄与敏捷最弱者先倒下（自然选择）
        let victim: Unit | null = null;
        let worst = Infinity;
        for (let j = 0; j < 3; j++) {
          const cand = herbivores[Math.floor(this.rng() * herbivores.length)];
          if (!cand || cand.dead) continue;
          const fitness = (cand.gene?.h ?? 1) * (cand.gene?.s ?? 1);
          if (fitness < worst) { worst = fitness; victim = cand; }
        }
        if (victim) { victim.hp -= 15; victim.hurt = 20; }
      }
      // 过度啃食：草地被啃秃（via regrow 循环自愈；啃食速率热参数可调）
      if (this.rng() < 0.6 * ep('eco.grazeRate') && herbivores.length > 0) {
        const grazer = herbivores[Math.floor(this.rng() * herbivores.length)];
        const gi = idx(Math.max(0, Math.min(W - 1, Math.floor(grazer.x))), Math.max(0, Math.min(H - 1, Math.floor(grazer.y))));
        if (this.terrain[gi] === T.GRASS && this.building[gi] === 0) {
          this.setTerrain(gi, T.BURNT);
          if (!this.regrow.has(gi)) this.regrow.set(gi, this.tickCount + Math.round((Math.round(ep('eco.regrowBase') * 1.3) + Math.floor(this.rng() * 900)) / this.worldsim.soilMulAt(gi)));
        }
      }
    }
    // 4) 食肉动物 vs 猎物存量（捕食者过密互竞争 → 饿殍；缺口越大淘汰越狠）
    const predCap = herb / 4.5;
    if (pred > predCap && predators.length > 4) {
      const starve = Math.min(8, Math.ceil((pred - predCap) * 0.25));
      for (let k = 0; k < starve; k++) {
        const cand = predators[Math.floor(this.rng() * predators.length)];
        if (cand && !cand.dead) { cand.hp -= 14; cand.hurt = 20; }
      }
    }
    // 5) 状态播报（去重：状态切换时才报，冷却 15 年）
    const ratio = capacity > 0 ? herb / capacity : 0;
    const nextState: typeof this.ecoState = herb < 8 ? 'collapse' : ratio > 1.15 ? 'overgraze' : ratio < 0.25 ? 'overgrass' : 'balanced';
    if (nextState !== this.ecoState && Math.floor(this.yearF) - this.ecoLastNoteYear > 15) {
      this.ecoLastNoteYear = Math.floor(this.yearF);
      const msg: Record<typeof this.ecoState, string> = {
        overgrass: '植被繁茂而食草动物稀少 —— 大地静待新的种群',
        balanced: '食草与捕食重回平衡，草原生生不息',
        overgraze: `食草动物超过了植被承载力（${herb}/${Math.round(capacity)}）——饥饿蔓延`,
        collapse: '野生动物几近绝迹 —— 生态面临崩溃',
      };
      this.addEvent('eco', msg[nextState], { colorHex: '#a3e635' });
      this.ecoState = nextState;
    } else if (nextState !== this.ecoState) {
      this.ecoState = nextState; // 冷却中静默切换
    }
    // 6) 生态自愈（迁徙入境）：植被繁茂而食草寥寥 → 种群循草而来；羊多而捕食者绝 → 荒野狼群循猎而来
    //    （局部灭绝不再永逝 —— 大自然自己补种，间隔 ≥ 25 年，且远离文明密集区）
    const yearNow = Math.floor(this.yearF);
    if (yearNow - this.ecoRepopYear > 25) {
      if (ratio < 0.22 && grass > 1800 && this.rng() < 0.35) {
        // 食草种群迁徙：在无主的茂草处落户 5 只（雪原入鹿、草原入羊）
        for (let k = 0; k < 10; k++) {
          const gx = 4 + Math.floor(this.rng() * (W - 8));
          const gy = 4 + Math.floor(this.rng() * (H - 8));
          const gi = gy * W + gx;
          const tt = this.terrain[gi];
          if (tt !== T.GRASS && tt !== T.FOREST) continue;
          if (this.owner[gi] >= 0 || this.building[gi] > 0) continue;
          const race = tt === T.FOREST ? R.DEER : R.SHEEP;
          for (let n = 0; n < 5; n++) this.spawnUnit(race, gx + this.rng() * 2 - 1, gy + this.rng() * 2 - 1, { silent: true });
          this.addEvent('eco', `一群${RACES[race].name}迁徙而来，在这片丰茂的草原上落户`, { colorHex: '#a3e635', x: gx, y: gy });
          this.ecoRepopYear = yearNow;
          break;
        }
      } else if (herb > 60 && pred < 6 && herbivores.length > 0 && this.rng() < 0.25) {
        // 捕食者迁入：狼群循着猎物的踪迹入境（跟随羊群而非随机落点）
        const herd = herbivores[Math.floor(this.rng() * herbivores.length)];
        for (let n = 0; n < 2; n++) this.spawnUnit(R.WOLF, herd.x + this.rng() * 6 - 3, herd.y + this.rng() * 6 - 3, { silent: true });
        this.addEvent('eco', '荒野狼群循着猎物的踪迹迁徙入境', { colorHex: '#c084fc', x: herd.x, y: herd.y });
        this.ecoRepopYear = yearNow;
      }
    }
  }

  // ---------------- 科技×军备/房屋深度绑定 ----------------

  /** 军备等级：科技树直接决定国家武备（0 木石/1 青铜/2 铁/3 钢/4 火器/5 现代/6 未来） */
  armamentOf(civ: Civ): number {
    const t = civ.techs ?? [];
    if (t.includes('plasma') || t.includes('antimatter') || t.includes('drones') || t.includes('lasers') || t.includes('robotics') || t.includes('orbital')) return 6;
    if (t.includes('explosives')) return 5;
    if (t.includes('gunpowder')) return 4;
    if (t.includes('steel')) return 3;
    if (t.includes('iron')) return 2;
    if (t.includes('bronze')) return 1;
    return 0;
  }

  /** 军备工坊（每 240 tick）：国库出钱，按军备等级自动武装无武器国民（可视武器+战力绑定） */
  armoryTick() {
    WBB.touchMeta(); // Stage 3：军备工坊写 gear×7 列收口
    const WEAPON_BY_TIER = ['wood_club', 'sword1', 'sword2', 'sword3', 'musket', 'rifle', 'laser_rifle'] as const;
    const ARMOR_BY_TIER = ['', 'armor1', 'armor1', 'armor2', 'armor2', 'iron_plate', 'energy_shield'] as const;
    for (const civ of this.civs) {
      if (!civ.alive || civ.pop < 6) continue;
      const tier = this.armamentOf(civ);
      if (tier < 1) continue; // 木石时代无武备工业
      const gold = civ.gold ?? 0;
      if (gold < 2) continue; // 国库见底无力造械
      // —— 兑现率随军备档位提升（Task 34 去虚务实）：火器时代后军工流水线扩产——
      //    旧版固定 2 人/轮：未来军备国 300 年也武装不完国民，「未来军备」徒有其名
      const quota = 2 + Math.floor(tier * 0.9); // tier6 → 7 人/轮
      const budget = 4 + tier * 1.5; // tier6 → 13 金/轮
      let armed = 0;
      let spent = 0;
      for (const u of this.units) {
        if (armed >= quota || spent >= budget) break; // 每国每轮产量与预算双封顶（工业时代扩产）
        if (u.dead || u.civ !== civ.id || u.boat) continue;
        if (!u.wep) {
          const key = WEAPON_BY_TIER[tier];
          const def = ITEM_DEFS[key];
          if (def) {
            u.wep = key as ItemKind;
            if (def.dmg) u.dmg += def.dmg;
            if (def.hp) { u.maxHp += def.hp; u.hp = Math.min(u.maxHp, u.hp + def.hp); }
            spent += 2;
            armed++;
            if (this.rng() < 0.3) this.fx('hammer', u.x, u.y, 12);
          }
        } else if (!u.arm && tier >= 2 && (u.job === 1 || u.job === 2)) {
          const key = ARMOR_BY_TIER[tier];
          const def = ITEM_DEFS[key];
          if (def) {
            u.arm = key as ItemKind;
            if (def.hp) { u.maxHp += def.hp; u.hp = Math.min(u.maxHp, u.hp + def.hp); }
            spent += 2;
            armed++;
          }
        }
      }
      if (spent > 0) civ.gold = Math.max(0, gold - spent);
    }
    // —— 涌现武器锻造驱动（每 240 tick：交战国铸造/迭代/缴获仿制） ——
    this.emergentForgeTick();
  }

  /** 房屋阶位：石匠/城防/哥特科技逐阶升迁（茅屋→石屋→堡垒宅→哥特庄园） */
  houseTierOf(civ: Civ | undefined): number {
    if (!civ || !civ.alive) return 0;
    const t = civ.techs ?? [];
    let tier = 0;
    if (t.includes('masonry')) tier = 1;
    if (t.includes('fortification')) tier = 2;
    if (t.includes('gothic')) tier = 3;
    return tier;
  }

  meteor(x: number, y: number) {
    const e = this.fx('meteor', x, y, 34);
    if (e) {
      e.x0 = x + 20;
      e.y0 = y - 34;
    }
  }

  nuke(x: number, y: number, power = 1) {
    this.statNukes++; // 成就计数：蘑菇云升起
    // 当量可调：爆炸半径 7 → 最高 21（全屏级）
    const r = Math.max(3, Math.min(24, 7 * power));
    this.explode(x, y, r, { terrain: true, lava: true, nuke: true });
  }

  boom(x: number, y: number, r = 2.4) {
    const rr = Math.max(1, Math.min(8, r));
    for (const u of this.units) {
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < rr + 0.5) { u.hp -= 160 * Math.max(0.1, 1 - d / (rr + 0.5)); u.hurt = 30; if (u.hp <= 0) u.dead = true; }
    }
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = idx(xx, yy);
        if (Math.hypot(xx - x, yy - y) < rr && this.building[i] > 0) this.destroyBuilding(i);
      }
    }
    this.fx('explosion', x, y, 22, { r: rr });
    this.onSound?.('boom');
    this.shake = Math.max(this.shake, Math.min(9, Math.round(2 + rr)));
  }

  // ---------------- 河流开凿 ----------------
  /** 开凿一条蜿蜒入海的河流：BFS 距水场引导 + 蜿蜒选路，沿岸灌溉成绿洲 */
  carveRiver(wx: number, wy: number, widthOverride?: number) {
    const sx = Math.max(0, Math.min(W - 1, Math.floor(wx)));
    const sy = Math.max(0, Math.min(H - 1, Math.floor(wy)));
    const start = idx(sx, sy);
    if (isWater(this.terrain[start])) return false; // 点在水上无需开凿
    // BFS：从所有水格出发计算每格到水的步数（绕开山脉 → 河流自然绕山而行）
    const N = W * H;
    const dist = new Int32Array(N).fill(-1);
    const queue = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) {
      if (isWater(this.terrain[i])) { dist[i] = 0; queue[qt++] = i; }
    }
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % W;
      const y = (i / W) | 0;
      const d = dist[i];
      if (x > 0 && dist[i - 1] === -1 && this.terrain[i - 1] !== T.MOUNTAIN) { dist[i - 1] = d + 1; queue[qt++] = i - 1; }
      if (x < W - 1 && dist[i + 1] === -1 && this.terrain[i + 1] !== T.MOUNTAIN) { dist[i + 1] = d + 1; queue[qt++] = i + 1; }
      if (y > 0 && dist[i - W] === -1 && this.terrain[i - W] !== T.MOUNTAIN) { dist[i - W] = d + 1; queue[qt++] = i - W; }
      if (y < H - 1 && dist[i + W] === -1 && this.terrain[i + W] !== T.MOUNTAIN) { dist[i + W] = d + 1; queue[qt++] = i + W; }
    }
    if (dist[start] === -1) {
      // 山脉环绕的洼地 → 就地积水成湖（内流湖）
      this.carveLake(sx, sy, Math.max(2, this.brush));
      this.toast('群山环抱的洼地积水成湖', 'info');
      this.addEvent('river', '群山之间诞生了一泓内流湖', { x: sx + 0.5, y: sy + 0.5 });
      this.onSound?.('heal');
      return true;
    }
    // 沿下降方向蜿蜒行走（加权随机选路 → 自然弯曲的河道）
    // widthOverride：自然河 genesis 传 0（单宽涓流）；缺省用笔刷宽度
    const width = widthOverride != null ? widthOverride : Math.max(0, Math.floor((this.brush - 1) / 2)); // 笔刷 1-2 → 1 宽；3-4 → 2 宽；5+ → 3 宽
    const visited = new Uint8Array(N);
    let cx = sx, cy = sy;
    let carved = 0;
    let reached = false;
    for (let steps = 0; steps < 400; steps++) {
      const i = idx(cx, cy);
      if (visited[i]) break; // 防绕圈
      visited[i] = 1;
      if (dist[i] === 0) { reached = true; break; } // 已抵达大海
      // 下一格：所有下降方向邻居按「下降越快权重越高」加权随机（蜿蜒感）
      // （先选路再刻河：dist 场不受刻蚀影响，且能把流向写进河道格）
      const curD = dist[i];
      const cands: number[] = [];
      const wts: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (dist[j] < 0 || dist[j] >= curD) continue;
          cands.push(j);
          wts.push(1 / (1 + (curD - dist[j]) * 0.5)); // 快速下降权重高，但慢绕也有机会 → 蜿蜒
        }
      }
      if (cands.length === 0) {
        // 无下降方向的洼地 → 河到此处积水成湖
        this.carveLake(cx, cy, Math.max(2, width + 1));
        break;
      }
      let total = 0;
      for (const w of wts) total += w;
      let r = this.rng() * total;
      let pick = cands[0];
      for (let k = 0; k < cands.length; k++) { r -= wts[k]; if (r <= 0) { pick = cands[k]; break; } }
      const nx = pick % W;
      const ny = (pick / W) | 0;
      const dirCode = encodeRiverDir(nx - cx, ny - cy); // 水流方向 = 行进方向
      // 刻河道（圆形，绕开山脉），并记录流向（驱动水流动画）
      for (let dy = -width; dy <= width; dy++) {
        for (let dx = -width; dx <= width; dx++) {
          if (dx * dx + dy * dy > width * width + 0.5) continue;
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (this.terrain[j] === T.MOUNTAIN) continue; // 河绕山，不穿山
          if (this.terrain[j] !== T.WATER) { this.setTerrain(j, T.WATER); carved++; }
          if (dirCode > 0) {
            this.riverDir[j] = dirCode;
            this.riverTiles.add(j);
          }
        }
      }
      // 沿岸灌溉：沙滩/焦土 → 草地（绿洲），偶有成林
      const ir = width + 1;
      for (let dy = -ir; dy <= ir; dy++) {
        for (let dx = -ir; dx <= ir; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          const t = this.terrain[j];
          if (t === T.SAND || t === T.BURNT) this.setTerrain(j, T.GRASS);
          else if (t === T.GRASS && this.rng() < 0.05 * this.worldsim.soilMulAt(j)) this.setTerrain(j, T.FOREST);
        }
      }
      cx = nx;
      cy = ny;
    }
    if (carved > 0) {
      this.fx('spawn', wx, wy, 30);
      this.toast(reached ? '一条大河蜿蜒入海' : '河流在洼地尽头积成了湖', 'info');
      this.addEvent('river', reached ? '一条大河诞生了，蜿蜒流向大海' : '一条河在洼地尽头汇成了湖', { x: sx + 0.5, y: sy + 0.5 });
      this.onSound?.('heal');
      return true;
    }
    return false;
  }

  /** 就地挖一个圆湖（内流湖 / 山间火山口湖），外圈绿洲 */
  carveLake(cx: number, cy: number, r: number) {
    for (let dy = -r - 1; dy <= r + 1; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx, dy);
        if (d <= r) {
          // 山区点选 → 火山口湖：允许淹没山体
          this.setTerrain(idx(xx, yy), T.WATER);
        } else if (d <= r + 1) {
          const j = idx(xx, yy);
          if (this.terrain[j] === T.SAND || this.terrain[j] === T.BURNT) this.setTerrain(j, T.GRASS); // 湖畔绿洲
        }
      }
    }
    this.fx('spawn', cx + 0.5, cy + 0.5, 30);
  }

  /** 绿洲神力：荒漠中心一泓清泉 + 草木环带 + 散布的棕榈树（森林） */
  createOasis(wx: number, wy: number) {
    const cx = Math.max(1, Math.min(W - 2, Math.floor(wx)));
    const cy = Math.max(1, Math.min(H - 2, Math.floor(wy)));
    const pondR = Math.max(2, Math.min(6, this.brush)); // 泉眼半径随笔刷
    const ringR = pondR + 2; // 草木环带半径
    // 只在荒芜地形（沙/焦土/岩浆?否）有意义：中心非荒地时也给环带但提示不同
    const center = this.terrain[idx(cx, cy)];
    const barren = center === T.SAND || center === T.BURNT;
    let greened = 0;
    let palms = 0;
    for (let dy = -ringR; dy <= ringR; dy++) {
      for (let dx = -ringR; dx <= ringR; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx, dy);
        const j = idx(xx, yy);
        if (d <= pondR * 0.55) {
          // 泉眼：清潭
          if (this.terrain[j] !== T.MOUNTAIN) this.setTerrain(j, T.WATER);
        } else if (d <= pondR) {
          // 浅滩：偶尔保留沙，倾向水
          if (this.terrain[j] !== T.MOUNTAIN && this.rng() < 0.8) this.setTerrain(j, T.WATER);
        } else if (d <= ringR) {
          // 草木环带：沙/焦土 → 草，30% 长成棕榈树（森林）
          const t = this.terrain[j];
          if (t === T.SAND || t === T.BURNT) {
            this.setTerrain(j, T.GRASS);
            greened++;
            if (this.rng() < 0.3) { this.setTerrain(j, T.FOREST); palms++; }
          } else if (t === T.GRASS && this.rng() < 0.08) {
            this.setTerrain(j, T.FOREST);
            palms++;
          }
        }
      }
    }
    // 绿洲不清除领土/建筑（在文明疆域内点绿洲只是美化）
    this.fx('spawn', wx, wy, 34);
    this.fx('spawn', wx, wy - 1, 40);
    this.toast(barren ? '荒漠中涌出一泓清泉，绿意环绕' : '清泉在草木间闪烁', 'good');
    this.addEvent('oasis', barren ? `荒漠中诞生了一片绿洲${palms > 0 ? `，${palms} 株棕榈亭亭而立` : ''}` : '一处泉眼被点化，波光潋滟', { x: cx + 0.5, y: cy + 0.5 });
    this.onSound?.('heal');
  }

  /** 平滑笔刷：把笔刷内每格替换为 3x3 邻域出现最多的地形（众数滤波 → 海岸变圆润） */
  smoothTerrain(wx: number, wy: number, r: number) {
    if (r < 1) r = 1;
    const changes: [number, number][] = []; // [tileIdx, newTerrain] 先算后写（众数必须基于原图）
    for (let yy = Math.floor(wy - r); yy <= wy + r; yy++) {
      for (let xx = Math.floor(wx - r); xx <= wx + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx - wx, yy - wy) > r) continue;
        const i = idx(xx, yy);
        // 统计 3x3 邻域（含自身）各地形计数
        const counts = new Map<number, number>();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = xx + dx, ny = yy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const t = this.terrain[idx(nx, ny)];
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        }
        // 众数（平局取计数相同中先出现的——确定性）
        let bestT = this.terrain[i];
        let bestC = 0;
        for (const [t, c] of counts) {
          if (c > bestC) { bestC = c; bestT = t; }
        }
        // 众数 5 票以上（过半数）才动手 → 只抹平噪声边缘，不大幅改写
        if (bestT !== this.terrain[i] && bestC >= 5) changes.push([i, bestT]);
      }
    }
    for (const [i, t] of changes) this.setTerrain(i, t);
  }

  /** 粗糙笔刷：边缘格随机吸入邻居地形 + 色彩抖动重掷 → 嶙峋破碎的纹理 */
  roughenTerrain(wx: number, wy: number, r: number) {
    if (r < 1) r = 1;
    const neighbors: number[] = []; // [tileIdx, terrain] 对
    for (let yy = Math.floor(wy - r); yy <= wy + r; yy++) {
      for (let xx = Math.floor(wx - r); xx <= wx + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx - wx, yy - wy) > r) continue;
        const i = idx(xx, yy);
        // 只动边缘格（邻域地形种类 ≥2），内部保持稳定
        const kinds = new Set<number>();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = xx + dx, ny = yy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            kinds.add(this.terrain[idx(nx, ny)]);
          }
        }
        if (kinds.size < 2) {
          // 内部格：重掷色差抖动（视觉颗粒感）
          this.variant[i] = Math.floor(this.rng() * 256);
          this.markDirty(i);
          continue;
        }
        if (this.rng() < 0.5) neighbors.push(i);
      }
    }
    // 第二遍：被选中的边缘格随机换成某个邻居的地形（含对角）
    for (const i of neighbors) {
      const x = i % W;
      const y = (i / W) | 0;
      const opts: number[] = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          opts.push(idx(nx, ny));
        }
      }
      if (opts.length > 0) {
        const src = opts[Math.floor(this.rng() * opts.length)];
        if (this.terrain[src] !== this.terrain[i]) this.setTerrain(i, this.terrain[src]);
      }
    }
  }

  dragonBreath(u: Unit) {
    const tx = Math.max(1, Math.min(W - 2, u.x + (this.rng() * 2 - 1) * 8));
    const ty = Math.max(1, Math.min(H - 2, u.y + (this.rng() * 2 - 1) * 8));
    for (let k = 0; k < 4; k++) {
      const xx = Math.floor(tx + this.rng() * 3 - 1.5);
      const yy = Math.floor(ty + this.rng() * 3 - 1.5);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      this.ignite(idx(xx, yy));
    }
    this.fx('explosion', tx, ty, 16, { r: 1.6 });
  }

  spreadPlague(u: Unit) {
    for (const o of this.units) {
      if (o === u || o.infected || o.dead) continue;
      if (RACES[o.race].undead) continue;
      if (o.trait && TRAITS[o.trait]?.immune) continue; // 免疫特质者不染疫
      if (Math.hypot(o.x - u.x, o.y - u.y) < 1.8) {
        // 医学科技：文明国民的瘟疫抗性（医士隔离染疫者）
        if (o.civ >= 0 && this.rng() < this.techModsOf(o.civ).plague) {
          o.infected = true;
          break;
        }
      }
    }
  }

  plagueArea(x: number, y: number, r: number) {
    for (const u of this.units) {
      if (Math.hypot(u.x - x, u.y - y) < r && !RACES[u.race].undead && !(u.trait ? TRAITS[u.trait]?.immune : false)) u.infected = true;
    }
  }

  healArea(x: number, y: number, r: number) {
    for (const u of this.units) {
      if (Math.hypot(u.x - x, u.y - y) <= r) {
        u.hp = u.maxHp;
        u.infected = false;
        u.hurt = 0;
      }
    }
    for (let yy = Math.floor(y - r); yy <= y + r; yy++) {
      for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx - x, yy - y) > r) continue;
        const i = idx(xx, yy);
        if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }
        if (this.terrain[i] === T.BURNT) this.setTerrain(i, T.GRASS);
        if (this.terrain[i] === T.ICE) this.meltIce(i); // 治疗神力融冰（复苏大地）
        if (this.radiate[i] > 0) { this.radiate[i] = 0; this.radSet.delete(i); this.markDirty(i); }
      }
    }
    this.fx('heart', x, y - 1, 36);
    this.onSound?.('heal'); // 治疗音效上报
  }

  killArea(x: number, y: number, r: number) {
    for (const u of this.units) {
      if (!u.dead && Math.hypot(u.x - x, u.y - y) <= r) u.dead = true;
    }
  }

  // ---------------- tools ----------------

  /** 散落掉落多件宝物：首件精确落点，其余散布半径 4 内 */
  dropScattered(n: number, wx: number, wy: number, fn: (px: number, py: number) => void) {
    const total = Math.max(1, Math.min(16, Math.floor(n)));
    for (let k = 0; k < total; k++) {
      const px = k === 0 ? wx : Math.max(0, Math.min(W - 0.5, wx + (this.rng() - 0.5) * 8));
      const py = k === 0 ? wy : Math.max(0, Math.min(H - 0.5, wy + (this.rng() - 0.5) * 8));
      fn(px, py);
    }
  }

  /** 水生牧养（引擎级通道）：rust 批内核对和平水生单位的漫游无水域校验 —— 鱼会被内核 wander
   *  目标遛上岸（实测水鱼 20s 内上岸），洪水/海啸退潮再把已深入内陆的个体晾死 —— 双重搁浅源。
   *  此通道逐 tick 对纯水生单位（鱼/龟/鲨等；蟹 beach 两栖除外）断言水域目标：
   *  ① 水中个体：水域内随机游走目标（每 20 tick 重采样，逐 tick 断言 tx/ty 对抗内核覆盖）——
   *     fleeT>0（逃亡）时让位于内核 AI；饱食的捕食者（food≥45）猎游让位内核；
   *     饥饿的捕食者（food<45）由引擎导向最近的水中猎物（Task 96 实测：内核不追鱼——
   *     280 条鱼擦着鲨鱼游过，鲨鱼仍然饿毙 —— 内核猎游对水生猎物形同虚设，引擎代驾）；
   *  ② 搁浅个体：目标导向最近实体水域（findWaterNear ≥5 邻水实心水体）+ 窒息计数
   *     （beachT 每 proc +1，≥15 ≈ 300 tick 挣扎窗口 → 标记死亡走常规收尸；内核拥有 hp，
   *     TS 扣血会被回读覆写 —— 实测无效 —— 故用瞬态计数）。
   *  近岸个体形成「挣扎回海」窗口，深内陆个体窒息终局 —— 陆生鱼群无法自续，退化生态自愈。 */
  private beachedAquaticTick() {
    const retarget = this.tickCount % 20 === 0; // 目标采样每 20 tick 一次；断言逐 tick 廉价
    for (const u of this.units) {
      if (u.dead) continue;
      const def = RACES[u.race];
      if (!def.aquatic || def.beach) continue;
      const ti = idx(Math.floor(u.x), Math.floor(u.y));
      if (isWater(this.terrain[ti])) {
        u.beachT = 0;
        if ((u.fleeT ?? 0) > 0) { u.beachTx = undefined; u.beachTy = undefined; continue; } // 逃亡交给内核 AI
        if (def.predator) {
          // 全时段猎游导向（Task 98 终版）：旧设计「饱食 ≥300 交内核自便」会把肥鲨随机游走带离
          // 鱼群几十格，饿到阈值再导向 —— 散逸-通勤循环在多种子长程下反复把舰队送进死亡螺旋
          // （yr38-46 十二鲨四年零扑杀 / yr12 后击杀归零等多起实证）。终版：任何食物水平都导向
          // 最近猎物 —— 鲨群定居猎场；防滥杀由扑杀出手门（≤300）+ 弹性预算 + 猎物存量平滑
          // 耦合把守，肥鲨只是守在鱼群边不落爪。
          // 饥饿猎游：导向水中猎物（每 20 tick 重采样，逐 tick 断言 tx/ty）
          if (retarget || u.beachTx == null || u.beachTy == null) {
            // 粘性目标 + 散签初选（Task 98 终版）：纯全局最近 → 全队锁死同一尾鱼（perpetual 惊逃
            // 集体饿毙）；纯随机六选一 → 每 20 tick 换目标之字形游走永不闭合（实测击杀率再度塌陷）。
            // 终版：目标鱼存活且 ≤40 格则粘住不换；失效才在最近 6 名中重新抽签 —— 单追可闭合，
            // 初选分散防狗堆。
            let tgt: Unit | null = null;
            const tid = (u.beachTargetId ?? -1);
            if (tid >= 0) {
              const cand = this.units.find((q) => q.id === tid && !q.dead);
              if (cand && !RACES[cand.race].isCiv) {
                const cj = Math.floor(cand.y) * W + Math.floor(cand.x);
                const dx = cand.x - u.x, dy = cand.y - u.y;
                if (isWater(this.terrain[cj]) && dx * dx + dy * dy <= 1600) tgt = cand; // ≤40 格粘住（惊逃远逃仍尾随 —— 内核惊逃有间歇，远距粘性防换目标抖动）
              }
            }
            if (!tgt) {
              const cands: { q: Unit; d2: number }[] = [];
              for (const q of this.units) {
                if (q.dead || q.race === u.race) continue;
                if (RACES[q.race].isCiv || !this.isHerbivoreRace(q.race)) continue;
                const qx = Math.floor(q.x), qy = Math.floor(q.y);
                const qj = qy * W + qx;
                if (!isWater(this.terrain[qj])) continue; // 只追水中猎物（防导向陆地扑空搁浅）
                // 实体水过滤：猎物须身处 ≥5 邻水的实心水体 —— 岸边浅洼里的鱼不去追
                // （否则猎游目标与归海导向拔河，鲨鱼会追着一尾岸沟鱼活活搁浅而死 —— Task 96 实测）
                let wn = 0;
                for (let ny = -1; ny <= 1; ny++) for (let nx = -1; nx <= 1; nx++) {
                  const xx = qx + nx, yy = qy + ny;
                  if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                  if (isWater(this.terrain[yy * W + xx])) wn++;
                }
                if (wn < 6) continue;
                const dx = q.x - u.x, dy = q.y - u.y;
                cands.push({ q, d2: dx * dx + dy * dy });
              }
              if (cands.length > 0) {
                cands.sort((a, b) => a.d2 - b.d2);
                const top = cands.slice(0, Math.min(6, cands.length));
                const pick = top[Math.floor(this.rng() * top.length)];
                tgt = pick.q;
              }
            }
            u.beachTargetId = tgt ? tgt.id : undefined;
            if (tgt) { u.beachTx = tgt.x; u.beachTy = tgt.y; }
            else { u.beachTx = undefined; u.beachTy = undefined; }
          } else if (u.beachTargetId != null) {
            // 粘性目标的逐 tick 坐标刷新：目标鱼在游，断言坐标必须跟随（否则追着旧坐标扑空）
            const tgt = this.units.find((q) => q.id === u.beachTargetId && !q.dead);
            if (tgt) { u.beachTx = tgt.x; u.beachTy = tgt.y; }
          }
          if (u.beachTx != null && u.beachTy != null) { u.tx = u.beachTx; u.ty = u.beachTy; }
          continue;
        }
        u.beachTx = undefined; u.beachTy = undefined;
        if (retarget || u.beachTx == null) {
          // 水域内随机游走：采样 8 个候选点，取首个「实体水」（自身+≥5 邻水）—— 防止指向孤水坑/岸边
          // 25% 远散布（±14）：鱼群低频外溢 —— 高密鱼团让鲨鱼的校际通勤饿毙（Task 96 实测 102 格通勤）
          const far = this.rng() < 0.25;
          const spread = far ? 14 : 6;
          for (let k = 0; k < 8; k++) {
            const wx = Math.max(1, Math.min(W - 2, Math.floor(u.x + (this.rng() * 2 - 1) * spread)));
            const wy = Math.max(1, Math.min(H - 2, Math.floor(u.y + (this.rng() * 2 - 1) * spread)));
            const j = wy * W + wx;
            if (!isWater(this.terrain[j])) continue;
            let wn = 0;
            for (let ny = -1; ny <= 1; ny++) for (let nx = -1; nx <= 1; nx++) {
              if (isWater(this.terrain[j + ny * W + nx])) wn++;
            }
            if (wn >= 6) { u.beachTx = wx + 0.5; u.beachTy = wy + 0.5; break; }
          }
        }
        if (u.beachTx != null && u.beachTy != null) { u.tx = u.beachTx; u.ty = u.beachTy; }
        continue;
      }
      // —— 搁浅：窒息 + 归海导向 ——
      u.beachT = (u.beachT ?? 0) + 1;
      u.hurt = Math.max(u.hurt, 2);
      if (retarget || u.beachTx == null) {
        const w = this.findWaterNear(u.x, u.y, 16);
        if (w) { u.beachTx = w.x; u.beachTy = w.y; }
      }
      if (u.beachTx != null && u.beachTy != null) { u.tx = u.beachTx; u.ty = u.beachTy; }
      if ((u.beachT ?? 0) >= 15) u.dead = true; // 窒息终局：交还常规收尸（尸骸/捕食链自然接管）
    }
  }

  /** 猎手扑杀（引擎级通道，v0.49 内核生态修复）：内核捕食者的进食公式（击杀→food 回充）本身完好
   *  （实测鲨鱼吞鱼 food +33），但猎物逃跑速度 ≥ 捕食者 —— 狼追不上羊、内核战斗极少命中，
   *  能量链净负 → 捕食者种群繁衍（food>40 门槛）后仍集体饿毙（实测 39→49→0）。此通道每 20 tick
   *  让饥饿的野生捕食者（food<45）对 r=1.6 内最近的野生猎物发动扑杀 —— 走 u.dead 常规收尸
   *  （肉掉落/血泊/腐食回充自然接管）。预算弹性化（Task 97）：满额陆 8/水 4 防屠杀踩踏，且随
   *  猎物存量分级收缩（≤150 减半 / ≤60 收缩 / ≤25 生态保护期禁猎）—— 狼把羊吃到 0 的整群
   *  清盘是吸收态，猎物崩溃期收刀给种群喘息窗口 —— Lotka-Volterra 的捕食腿 + 保险丝。水生预算
   *  随饿鲨规模伸缩（Task 98：4-12 弹性 + fishAlive≤40 保险丝）—— 猎场网络修通后鲨群恢复，
   *  固定 4/轮连舰队折旧都盖不住（实测全员 food 贴地）。 */
  private predatorHuntTick() {
    // 扑杀预算水陆分账：units 数组序是「先到先得」—— 狼群爆发期（60-84 饿狼）会把全局名额
    // 垄断到海里一只也轮不上（Task 96 实测鲨鱼在狼 boom 世代集体饿毙的隐形之手）
    // 猎物存量普查（O(n) 每 20 tick 一次）：弹性预算的依据 —— 狼把羊吃到 0 的整群清盘
    // 是吸收态，迁徙重建要 3.3 年起步；猎物崩溃期收刀，给猎物种群一个喘息窗口（Task 97）
    let preyAlive = 0;
    let fishAlive = 0;
    for (const q of this.units) {
      if (!q.dead && !RACES[q.race].isCiv && this.isHerbivoreRace(q.race)) {
        preyAlive++;
        if (RACES[q.race].aquatic) fishAlive++;
      }
    }
    // 水生预算随饿鲨规模伸缩（Task 98）：固定 4/轮是单鲨时代的参数 —— 猎场网络修通后鲨群恢复
    // 到 11+ 头，4 杀/轮连舰队折旧都盖不住（每杀 +25 vs 耗 0.5/tick → 11 头需 ~4.4 杀/轮持平），
    // 实测鲨群 food 全员贴地 18-51。按饥饿水生捕食者数给配额（每 2 头 1 杀，4-12 弹性）；
    // 鱼群专属保险丝：fishAlive≤40 时收缩至 1（鲨群不得把猎场网络吃穿 —— 迁徙重建要 3.3 年）。
    let hungryAqua = 0;
    for (const p of this.units) {
      if (p.dead) continue;
      const pd = RACES[p.race];
      if (pd.predator && pd.aquatic && !pd.undead && !pd.isCiv && (p.food ?? 70) <= 300) hungryAqua++;
    }
    // 分级预算：猎物>150 满额（陆 8 固定 / 水 4-10 弹性）→ ≤150 减半 → ≤60 收缩 → ≤25 生态保护期禁猎
    let capLand = 8;
    let capAqua = Math.min(10, Math.max(4, Math.ceil(hungryAqua * 0.75)));
    if (preyAlive <= 150) { capLand = 4; capAqua = Math.ceil(capAqua / 2); }
    if (preyAlive <= 60) { capLand = 2; capAqua = Math.max(1, Math.ceil(capAqua / 4)); }
    if (preyAlive <= 25) { capLand = 0; capAqua = 0; }
    // 猎物存量平滑耦合（Task 98）：扑杀压力与鱼群存量成正比（280→10 杀/轮、120→4、56→2）——
    // 硬保险丝（≤40 才收刀）放任鱼群先跌穿 2/3 再急刹，平滑 scaler 让 LV 振荡发生在半途。
    capAqua = Math.min(capAqua, Math.max(1, Math.round(fishAlive / 28)));
    let killsLand = 0;
    let killsAqua = 0;
    for (const p of this.units) {
      if (p.dead) continue;
      const pd = RACES[p.race];
      if (!pd.predator || pd.undead || pd.isCiv) continue;
      if (pd.aquatic ? killsAqua >= capAqua : killsLand >= capLand) continue; // 弹性预算（随猎物存量收缩）
      // 出手门（Task 98）：水生与猎游阈值同轨（≤300）—— 旧门 ≤45 + 每杀 +25 是「贴地均衡」
      // （45→70→45 振荡，净亏 0.5/tick），鲨群永远在饥饿线下、任何通勤开销即死；陆生维持 45
      // （狼-羊平衡是 Task 95/97 调好的，勿动）。水生鲨群在猎场吃饱到 ~300，才有通勤/繁衍的盈余。
      if ((p.food ?? 70) > (pd.aquatic ? 300 : 45)) continue; // 只有饥饿者出手（饱食者不滥杀）
      let prey: Unit | null = null;
      let bd = pd.aquatic ? 196 : 2.56; // 扑杀窗口：陆捕 r=1.6 / 水捕 r=14（深海突袭抽象 —— 内核猎物惊逃感知半径
      // 大于追击可闭合距离，插桩实测 3 鲨 750 tick 零扑杀的死亡螺旋；r=14 让导向鲨在惊逃启动前
      // 稳定落爪，防过杀由弹性预算 + 猎物存量平滑耦合把守）
      for (const q of this.units) {
        if (q.dead || (q.grab ?? 0) > 0) continue; // 神明手中之物不捕
        if (RACES[q.race].isCiv || !this.isHerbivoreRace(q.race)) continue;
        const dx = q.x - p.x, dy = q.y - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; prey = q; }
      }
      if (!prey) continue;
      prey.dead = true;
      WB.syncDead(prey); // WASM 镜像：后续扫描即刻跳过亡者
      this.fx('blood', prey.x, prey.y, 14);
      if (pd.aquatic) {
        killsAqua++;
        // 深海突袭水花（Task 98 遗留④）：r=14 的引擎级扑杀本是"隔空"抽象 —— 水花 + 血渍
        // 双特效把 hit 翻译成可读的突袭视觉（水花蓝色四溅 + 中心水柱闪光，与灭火同款语言）
        this.fx('water', prey.x, prey.y, 16);
      } else {
        killsLand++;
      }
      p.food = Math.min(400, (p.food ?? 0) + 25); // 扑杀即刻进食（腐食回充再补一口）
      if ((p.food ?? 0) >= 380) break; // 吃饱了就收手 —— 满仓过杀只会浪费猎物（能量随尸体蒸发）
    }
  }

  /** 百兽迁徙（引擎级通道）：野生动物灭绝是吸收态 —— 归零的种族永远消失，长寿世界里生态单调化
   *  （67 年老世界实测：狼/熊/狐/鹿/蛇/鲨/雪狼……全部归零，仅高繁衍物种幸存 —— 捕食者饥饿
   *  + 食物>40 繁衍门槛 + 灭绝无回归，Lotka-Volterra 的单向棘轮）。此通道让灭绝的野生种族以
   *  「远方兽群迁徙而来」的方式低频回归：每 600 tick（≈3.3 年）检一轮，灭绝名单里掷签一个种族，
   *  在其适宜栖息地投放一小群奠基者 —— 生态韧性（回迁腿），世界再老也生机不断。 */
  private wildlifeReboundTick() {
    if (!this.laws.reproduction) return; // 神明关闭繁衍法则时，世界静寂如死
    // 奠基者名单（与 worldgen trySpawn 播撒对齐；文明/神话/亡灵有自己的降临通道不入列）
    // habitat：适宜栖息地判定（与 worldgen 的地形口径一致）；n：迁徙群规模区间
    const isW = (t: number) => t === T.DEEP || t === T.WATER;
    const SEED: Array<{ race: number; n: [number, number]; habitat: (t: number) => boolean }> = [
      { race: R.SHEEP, n: [3, 5], habitat: (t) => t === T.GRASS },
      { race: R.WOLF, n: [2, 3], habitat: (t) => t === T.FOREST },
      { race: R.BEAR, n: [1, 2], habitat: (t) => t === T.FOREST },
      { race: R.DEER, n: [2, 4], habitat: (t) => t === T.GRASS },
      { race: R.PENGUIN, n: [2, 3], habitat: (t) => t === T.SNOW },
      { race: R.CAMEL, n: [2, 3], habitat: (t) => t === T.SAND },
      { race: R.SCORPION, n: [2, 3], habitat: (t) => t === T.SAND },
      { race: R.SNAKE, n: [2, 3], habitat: (t) => t === T.SAND },
      { race: R.SNOWWOLF, n: [2, 3], habitat: (t) => t === T.SNOW },
      { race: R.CHICKEN, n: [3, 5], habitat: (t) => t === T.GRASS },
      { race: R.PIG, n: [2, 4], habitat: (t) => t === T.GRASS },
      { race: R.RABBIT, n: [3, 5], habitat: (t) => t === T.GRASS || t === T.FOREST },
      { race: R.FOX, n: [1, 2], habitat: (t) => t === T.FOREST },
      { race: R.FISH, n: [4, 7], habitat: isW },
      { race: R.CRAB, n: [2, 3], habitat: (t) => t === T.SAND },
      { race: R.TURTLE, n: [2, 3], habitat: isW },
      { race: R.SHARK, n: [1, 2], habitat: isW },
    ];
    // 灭绝名单：wildCount 为 0 的候选（O(1) 分种族计数）
    const extinct = SEED.filter((s) => (this.wildCount.get(s.race) ?? 0) === 0);
    if (extinct.length === 0) return;
    if (this.rng() > 0.6) return; // 掷签门：并非每轮都迁来 —— 平均 ~5.5 年一支兽群抵达
    // 加权掷签（Task 97）：灭绝越久的种族权重越高（1 → 最高 5，2400 tick ≈ 13 年封顶）——
    // 久别的客人先请进门；从未迁入过的种族以最高权重优先登场，迁入后权重回落重新排队
    const weights = extinct.map((s) => {
      const last = this.reboundLast.get(s.race);
      const ago = last === undefined ? Number.MAX_SAFE_INTEGER : this.tickCount - last;
      return 1 + Math.min(4, ago / 2400);
    });
    const totalW = weights.reduce((a, b) => a + b, 0);
    let pick = this.rng() * totalW;
    let idx = extinct.length - 1;
    for (let i = 0; i < extinct.length; i++) {
      pick -= weights[i];
      if (pick <= 0) { idx = i; break; }
    }
    const seed = extinct[idx];
    const def = RACES[seed.race];
    const aquatic = !!def.aquatic;
    // 预算按轨检（水生掷签看海洋配额，陆生看全球预算）—— 羊群饱和不再挡住鲨鱼的迁徙回归
    if (aquatic ? this.wildAliveAquatic() >= MAX_WILDLIFE_AQUATIC - 8 : this.wildAlive() >= MAX_WILDLIFE - 8) return;
    // 栖息地采样：随机掷点找落位（蟹需 r=2 内有水 —— 沿 worldgen 口径）
    // 鲨鱼特例：锚定一条活鱼落位（猎手跟着鱼群走 —— 随机深水的鲨鱼追不上远处的鱼群，Task 96 实测）
    if (seed.race === R.SHARK) {
      const fishes = this.units.filter((q) => !q.dead && q.race === R.FISH);
      if (fishes.length > 0) {
        let placed = 0;
        const n = seed.n[0] + Math.floor(this.rng() * (seed.n[1] - seed.n[0] + 1));
        for (let k = 0; k < n; k++) {
          const f = fishes[Math.floor(this.rng() * fishes.length)];
          for (let t2 = 0; t2 < 8; t2++) {
            const jx = Math.max(0.5, Math.min(W - 0.5, f.x + (this.rng() * 3 - 1.5)));
            const jy = Math.max(0.5, Math.min(H - 0.5, f.y + (this.rng() * 3 - 1.5)));
            const j = Math.floor(jy) * W + Math.floor(jx);
            if (!isWater(this.terrain[j])) continue;
            if (this.spawnUnit(R.SHARK, jx, jy, { silent: true })) placed++;
            break;
          }
        }
        if (placed > 0) {
          this.reboundLast.set(seed.race, this.tickCount);
          this.fx('spawn', fishes[0].x, fishes[0].y, 46);
          this.addEvent('eco', `洋流送来了远方的族群——${def.name}循着鱼群的踪迹重新游回了这片海域`, { x: fishes[0].x, y: fishes[0].y });
        }
        return;
      }
      // 无鱼可锚（海洋真空）→ 落回通用随机采样
    }
    // 鱼群补种撒网式落位（Task 98）：2-3 个互距 ≥18 格的锚点各落一小群 —— 猎场网络重建从多点
    // 起步（单点奠基群会被饥饿的鲨鱼一锅端，网络重新退化为孤岛；多点撒布让任意海域的鲨鱼
    // 都有一程续航之内的猎场）。鱼群灭绝时才触发（extinct 名单），无需检查与活鱼的距离。
    if (seed.race === R.FISH) {
      const spots: { x: number; y: number }[] = [];
      for (let tries = 0; tries < 260 && spots.length < 3; tries++) {
        const x = 2 + Math.floor(this.rng() * (W - 4));
        const y = 2 + Math.floor(this.rng() * (H - 4));
        const i = y * W + x;
        if (!seed.habitat(this.terrain[i])) continue;
        let ok = true;
        for (const s of spots) {
          const dx = s.x - x, dy = s.y - y;
          if (dx * dx + dy * dy < 324) { ok = false; break; } // 锚间 ≥18 格
        }
        if (!ok) continue;
        spots.push({ x, y });
      }
      let placed = 0;
      for (const s of spots) {
        const n = 2 + Math.floor(this.rng() * 2); // 每锚点 2-3 尾奠基鱼
        for (let k = 0; k < n; k++) {
          for (let t2 = 0; t2 < 8; t2++) {
            const jx = s.x + (this.rng() * 2.5 - 1.25), jy = s.y + (this.rng() * 2.5 - 1.25);
            const j = Math.max(0, Math.min(W * H - 1, Math.floor(jy) * W + Math.floor(jx)));
            if (!seed.habitat(this.terrain[j])) continue;
            if (this.spawnUnit(R.FISH, jx, jy, { silent: true })) placed++;
            break;
          }
        }
      }
      if (placed > 0) {
        this.reboundLast.set(seed.race, this.tickCount);
        const s0 = spots[0];
        this.fx('spawn', s0.x + 0.5, s0.y + 0.5, 46);
        this.addEvent('eco', `洋流送来了远方的族群——${def.name}重新出现在这片水域`, { x: s0.x + 0.5, y: s0.y + 0.5 });
      }
      return;
    }
    for (let tries = 0; tries < 140; tries++) {
      const x = 2 + Math.floor(this.rng() * (W - 4));
      const y = 2 + Math.floor(this.rng() * (H - 4));
      const i = y * W + x;
      if (!seed.habitat(this.terrain[i])) continue;
      if (seed.race === R.CRAB) {
        let w = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (isWater(this.terrain[ny * W + nx])) w++;
        }
        if (w === 0) continue;
      }
      // 奠基者落位：逐只采样（水生逐格校验水域；陆生允许 ±1.5 抖动）
      const n = seed.n[0] + Math.floor(this.rng() * (seed.n[1] - seed.n[0] + 1));
      let placed = 0;
      for (let k = 0; k < n; k++) {
        for (let t2 = 0; t2 < 10; t2++) {
          const jx = x + (this.rng() * 3 - 1.5), jy = y + (this.rng() * 3 - 1.5);
          const j = Math.max(0, Math.min(W * H - 1, Math.floor(jy) * W + Math.floor(jx)));
          if (!seed.habitat(this.terrain[j])) continue;
          const nu = this.spawnUnit(seed.race, jx, jy, { silent: true });
          if (nu) placed++;
          break;
        }
      }
      if (placed === 0) continue; // 落点全数失败（预算/上限）→ 换个点再试
      this.reboundLast.set(seed.race, this.tickCount);
      this.fx('spawn', x + 0.5, y + 0.5, 46);
      const msg = aquatic
        ? `洋流送来了远方的族群——${def.name}重新出现在这片水域`
        : `远方的兽群跋涉而来——${def.name}重新踏上了这片大地`;
      this.addEvent('eco', msg, { x: x + 0.5, y: y + 0.5 });
      return; // 每轮至多一支兽群迁入（节奏克制，迁徙是稀客）
    }
  }

  /** 鲨群繁衍辅助（引擎级通道，Task 98）：内核繁衍率在低种群下追不上死亡率 —— 震荡期 3-4 鲨
   *  不可逆滑向灭绝（yr82 实测归零），迁徙重播平均 5.5 年一支救不回来。肥鲨（food>220 = 刚在
   *  猎场吃饱）每 240 tick 诞一崽：种群 <8 才启动（地板机制，上限保护防爆炸），-60 母体食物 =
   *  妊娠成本（食不够照常跌回捕食循环）。与凤凰涅槃/巫妖复生同范式 —— spawnUnit 常规注册+打包。 */
  private sharkBreedTick() {
    if (!this.laws.reproduction) return; // 神明关闭繁衍法则时静默
    const sharks = this.units.filter((u) => !u.dead && u.race === R.SHARK);
    if (sharks.length === 0 || sharks.length >= 8) return;
    const mother = sharks.find((s) => (s.food ?? 0) > 220);
    if (!mother) return;
    for (let t = 0; t < 8; t++) {
      const jx = Math.max(0.5, Math.min(W - 0.5, mother.x + (this.rng() * 3 - 1.5)));
      const jy = Math.max(0.5, Math.min(H - 0.5, mother.y + (this.rng() * 3 - 1.5)));
      const j = Math.floor(jy) * W + Math.floor(jx);
      if (!isWater(this.terrain[j])) continue; // 诞崽必须落水（防搁浅夭折 —— Task 98 worldgen 教训）
      const pup = this.spawnUnit(R.SHARK, jx, jy, { silent: true });
      if (pup) {
        mother.food = Math.max(0, (mother.food ?? 0) - 60);
        this.fx('spawn', jx, jy, 30);
        this.fx('water', jx, jy, 18); // 诞崽水花（生产涟漪 —— 与突袭水花同语言）
      }
      break;
    }
  }

  /** 凤凰涅槃（引擎级通道）：灰烬倒数到点重生 —— spawnUnit 走常规注册+打包，与批内核无冲突。
   *  重生体继承 rebirths 计数（累计 3 次后死亡走常规收尸 = 真终焉）；瞬态不入档。 */
  private phoenixAshTick() {
    for (let i = this.phoenixAshes.length - 1; i >= 0; i--) {
      const a = this.phoenixAshes[i];
      a.t -= 2; // 与 cd 同款节拍：1 tick = 2 单位（240 单位 ≈ 4s@1x）
      if (a.t > 0) continue;
      this.phoenixAshes.splice(i, 1);
      const nu = this.spawnUnit(R.PHOENIX, a.x, a.y, { silent: true });
      if (nu) nu.rebirths = a.rebirths; // 重生体继承涅槃计数（防御：spawnUnit 有种族上限 null 分支）
      this.fx('spawn', a.x, a.y, 46);
      this.fx('fireball', a.x, a.y - 1, 30);
      this.toast('凤凰在灰烬中重生了', 'info');
      this.addEvent('phoenix', '烈焰冲天而起——凤凰自灰烬中振翼重生', { x: a.x, y: a.y });
      this.onSound?.('phoenix');
    }
  }

  /** 九头蛇多头再生（引擎级通道）：hostile 巨兽被 rust 批内核接管，回血不在 TS updateUnit 里跑 ——
   *  每 30 tick 全场九头蛇回复 2% maxHp（多头的顽强生命力；幼蛇同样受益）。与批内核无冲突。
   *  季节节律（季节 × 万物）：冬季冬眠 —— 冷血蛇虫蛰伏，代谢停滞伤口不愈
   *  （对抗九头蛇的第二把钥匙：烈焰烧灼断颈之外，还可以把仗拖到冬天）。 */
  private hydraRegenTick() {
    if (this.nature.season === 3) return; // 冬眠：霜降之日，多头蛇的再生之泉一并封冻
    for (const u of this.units) {
      if (u.dead || u.race !== R.HYDRA) continue;
      if (u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02);
        u.hurt = 0; // 再生中不残留受创闪红
      }
    }
  }

  /** 树人播种（引擎级通道）：森林守护者的两大职责 ——
   *  ① 播种：每 10 tick 每棵树人采样周围 r=3 格，草地/沙地/焦土 概率化为森林（森林扩张是纯地形写，
   *     自然引擎 regrow 与野火系统会自然接管后续演化 —— 树人是活的绿化引擎）；
   *     季节节律（季节 × 万物）：春季播种热情 ×1.3（春播），冬季蛰伏停播（树皮休眠，落叶纷飞的岁月）。
   *  ② 扑火：扑灭周围 r=2.5 的火焰（森林卫士的本职；不灭岩浆 —— 那超出树人的能力；四季在岗不辍）。
   *  和平野生单位被 rust 批内核接管不经 updateUnit，地形操作挂引擎 tick 通道与批内核共存。 */
  private entGroveTick() {
    let planted = 0;
    const sn = this.nature.season; // 季节节律：春播冬蛰（一次采样，循环内共用）
    for (const u of this.units) {
      if (u.dead || u.race !== R.ENT) continue;
      // ① 播种：一次采样 2 个点（树人是慢节奏的园丁，不猛长；冬季蛰伏跳过）
      if (sn !== 3) {
      const pm = sn === 0 ? 1.3 : 1; // 春播热情：种子在暖雨里更敢扎根
      for (let k = 0; k < 2; k++) {
        const ang = this.rng() * Math.PI * 2;
        const rr = 1 + this.rng() * 2.5;
        const j = idx(Math.floor(u.x + Math.cos(ang) * rr), Math.floor(u.y + Math.sin(ang) * rr));
        if (j < 0 || j >= W * H) continue;
        if (this.building[j] > 0) continue; // 有建筑的格子不种（屋顶下长树成何体统）
        const t = this.terrain[j];
        if ((t === T.GRASS && this.rng() < 0.22 * pm) || (t === T.BURNT && this.rng() < 0.45 * pm) || (t === T.SAND && this.rng() < 0.06 * pm)) {
          this.setTerrain(j, T.FOREST);
          planted++;
          if (planted <= 6) this.fx('spark', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14);
        }
      }
      } // 蛰伏：冬雪封地时树人收拢枝桠，静候春雷
      // ② 扑火：熄灭周围 r=2.5 的火焰
      const ex = Math.floor(u.x);
      const ey = Math.floor(u.y);
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx * dx + dy * dy > 6.25) continue;
          const xx = ex + dx;
          const yy = ey + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (this.fire[j] > 0) {
            this.fire[j] = 0;
            this.fireSet.delete(j);
            this.fx('water', xx + 0.5, yy + 0.5, 12);
          }
        }
      }
    }
    // 播种木语：本轮有种下新林时低概率鸣响（慢节奏的园丁不喧哗；throttle 900ms 防叠音）
    if (planted > 0 && this.rng() < 0.35) this.onSound?.('ent');
  }

  /** 巫妖死灵复生（引擎级通道）：永夜亡者军团的源泉 ——
   *  每 12 tick 扫描一次，每只巫妖拾取 r=4 内最陈旧的一具尸体，以死灵术唤起为骷髅：
   *  尸体被消耗（从 corpses 移除），新骷髅走 spawnUnit 常规注册 + 打包（与批内核无冲突）。
   *  细节：蛇怪石像跳过（石化凝视连灵魂都封住了，死灵术唤不醒）；
   *  全图骷髅 > 40 时停手（军团也需节制，防尸山血海战场被无限刷穿）。
   *  与树人播种构成正邪对偶：一个播撒生，一个收割死。 */
  private lichRaiseTick() {
    let skeletons = 0;
    for (const s of this.units) if (!s.dead && s.race === R.SKELETON) skeletons++;
    if (skeletons > 40) return;
    let events = 0;
    for (const l of this.units) {
      if (l.dead || l.race !== R.LICH) continue;
      let best = -1;
      let bestAge = -1;
      for (let i = 0; i < this.corpses.length; i++) {
        const c = this.corpses[i];
        if (c.stone) continue; // 石像：灵魂被封在石壳里
        const dx = c.x - l.x;
        const dy = c.y - l.y;
        if (dx * dx + dy * dy > 16) continue; // 4²
        if (c.age > bestAge) { bestAge = c.age; best = i; }
      }
      if (best < 0) continue;
      const c = this.corpses[best];
      const nu = this.spawnUnit(R.SKELETON, c.x, c.y, { silent: true });
      if (!nu) continue; // 种族上限等分支：尸体保留，下轮再试
      this.corpses.splice(best, 1);
      this.fx('skull', c.x, c.y - 1, 26);
      this.fx('smoke', c.x, c.y, 16);
      if (events < 3) { this.addEvent('lich', '骸骨应声而起——巫妖的死灵术将亡者重新编入军团', { x: c.x, y: c.y }); events++; }
    }
  }

  /** 天使光环（引擎级通道）：治愈周围无辜生灵（含国民/动物）+ 驱散瘟疫。
   *  为什么不在 updateUnit：天使是和平野生单位，会被 rust 批内核整批接管，
   *  TS 的和平分支不执行（实证 breath 不衰减）；治愈是纯 TS 增益，挂 tick 通道。
   *  节律：每 3 tick 扫描一次，(phase + id*13) % 50 === 0 时触发
   *  —— 每只天使约每 150 tick（10s@1x）一轮，相位按 id 错开防同帧扎堆。 */
  private angelAuraTick() {
    const phase = (this.tickCount / 3) | 0;
    for (const a of this.units) {
      if (a.dead || a.race !== R.ANGEL) continue;
      if ((phase + a.id * 13) % 50 !== 0) continue;
      let healed = 0;
      for (const o of this.units) {
        if (o.dead || o === a) continue;
        const od = RACES[o.race];
        if (od.hostile || od.undead) continue; // 只渡无辜者
        if (o.hp >= o.maxHp && !o.infected) continue;
        const dxo = o.x - a.x;
        const dyo = o.y - a.y;
        if (dxo * dxo + dyo * dyo > 12.25) continue; // 3.5²
        if (o.hp < o.maxHp) {
          o.hp = Math.min(o.maxHp, o.hp + Math.max(10, o.maxHp * 0.25));
          this.fx('bless', o.x, o.y, 16);
        }
        if (o.infected) { o.infected = false; this.fx('bless', o.x, o.y, 20); }
        if (++healed >= 10) break;
      }
      if (healed > 0) { this.fx('bless', a.x, a.y, 34); this.onSound?.('heal'); }
    }
  }

  /** 单只生物放置（含水生/沙泳/飞行落点校验与螺旋吸附）；数量参数的每一只独立调用 */
  placeRace(race: number, wx: number, wy: number, quiet = false): boolean {
    const def = RACES[race];
    let px = wx;
    let py = wy;
    // 落点校验：非飞行种族不能种在水/岩浆上（否则产生无首都无领土的"幽灵王国"）
    // → 螺旋搜索最近的合法地块吸附放置；周围全无陆地则拒绝并提示
    // 水生（克拉肯）反之：必须落在水里；沙泳（沙虫）必须落在沙/草/焦土
    const aquatic = !!def.aquatic;
    const sandswim = !!def.sandswim;
    const bad = (i: number) => {
      if (aquatic) {
        if (def.beach) { const t = this.terrain[i]; return t !== T.SAND && !isWater(t); } // 滩涂两栖（蟹）：水或沙滩
        return !isWater(this.terrain[i]);
      }
      if (sandswim) { const t = this.terrain[i]; return t !== T.SAND && t !== T.GRASS && t !== T.BURNT; }
      return isWater(this.terrain[i]) || this.terrain[i] === T.LAVA;
    };
    if (!def.flying && bad(idx(Math.floor(wx), Math.floor(wy)))) {
      if (aquatic && !isWater(this.terrain[idx(Math.floor(wx), Math.floor(wy))])) {
        // 水生巨怪：吸附到最近的水域
        const w = this.findWaterNear(wx, wy, 9);
        if (w) { px = w.x; py = w.y; }
        else { if (!quiet) this.toast('克拉肯需要一片海洋来安身', 'danger', true); return false; }
      } else if (sandswim) {
        let found = false;
        outerSand: for (let rr = 1; rr <= 7; rr++) {
          for (let dy = -rr; dy <= rr; dy++) {
            for (let dx = -rr; dx <= rr; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
              const xx = Math.floor(wx) + dx;
              const yy = Math.floor(wy) + dy;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              const t = this.terrain[idx(xx, yy)];
              if (t === T.SAND || t === T.GRASS || t === T.BURNT) { px = xx + 0.5; py = yy + 0.5; found = true; break outerSand; }
            }
          }
        }
        if (!found) { if (!quiet) this.toast('沙虫只能安身于沙海与旷野', 'danger', true); return false; }
      } else {
        let found = false;
        outerSnap: for (let rr = 1; rr <= 7; rr++) {
          for (let dy = -rr; dy <= rr; dy++) {
            for (let dx = -rr; dx <= rr; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue; // 只扫当前环
              const xx = Math.floor(wx) + dx;
              const yy = Math.floor(wy) + dy;
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              if (!bad(idx(xx, yy))) {
                px = xx + 0.5;
                py = yy + 0.5;
                found = true;
                break outerSnap;
              }
            }
          }
        }
        if (!found) {
          if (!quiet) this.toast('这里波涛汹涌 — 附近没有可以落脚的陆地', 'danger', true);
          return false;
        }
      }
    }
    const u = this.spawnUnit(race, px, py);
    return !!u;
  }

  applyTool(toolId: string, wx: number, wy: number, params?: Record<string, number>) {
    // v5 修复：cre: 图鉴造物工具不在静态 TOOL_BY_ID 表中——此前的 early return 让「放置造物」从未生效
    // （点击画布无反应 = 「新物种放置无法选位置和数量」的直接根因）；动态工具走 parseCreationTool 白名单
    if (!TOOL_BY_ID[toolId] && !parseCreationTool(toolId)) return;
    // —— 放置参数（未提供时回退默认行为）——
    const pv = (k: string, d: number) => {
      const v = params?.[k];
      return typeof v === 'number' && Number.isFinite(v) ? v : d;
    };
    const rRaw = pv('radius', NaN);
    const r = Number.isFinite(rRaw) ? rRaw : this.brush; // 带 radius 参数的工具用参数；否则用通用笔刷
    const rP = Number.isFinite(rRaw) ? rRaw : undefined; // 旧版无 brush 联动的工具：未提供时用方法默认值
    const count = Math.max(1, Math.floor(pv('count', 1)));
    const countP = params && typeof params.count === 'number' ? count : undefined;
    const power = pv('power', 1);
    const powerP = params && typeof params.power === 'number' ? power : undefined;
    const duration = Math.max(20, Math.floor(pv('duration', 0)));
    const durationP = params && typeof params.duration === 'number' ? duration : undefined;
    // 宝物工具：掉落地面物品（三档宝箱 → 随机；具体物品 → 指定；count → 散落多件）
    if (toolId === 'chest' || toolId === 'chest2' || toolId === 'chest3') {
      this.dropScattered(count, wx, wy, (px, py) => this.dropRandomItem(px, py, toolId));
      return;
    }
    const itemKind = ITEM_TOOL[toolId];
    if (itemKind) {
      this.dropScattered(count, wx, wy, (px, py) => this.dropItem(itemKind as ItemKind, px, py));
      return;
    }
    // 造物图鉴工具（cre:<uid>）：图鉴物种降临 / 神物掉落（放置面板的自定义条目）
    const creUid = parseCreationTool(toolId);
    if (creUid) {
      const entry = getCreation(creUid);
      if (entry?.kind === 'species') {
        const n = this.placeCreation(creUid, wx, wy, count, r);
        if (n > 0) this.onSound?.('place');
      } else if (entry?.kind === 'item') {
        this.dropScattered(count, wx, wy, (px, py) => this.dropItem(creUid as ItemKind, px, py));
        this.onSound?.('place');
      }
      return;
    }
    if (RACE_TOOL[toolId] !== undefined) {
      const race = RACE_TOOL[toolId];
      // 首只在点击点精确落位；其余散布在半径 max(2, r) 的圆内（各自独立做落点校验吸附）
      const scatter = Math.max(2, Math.min(10, r));
      let spawned = 0;
      for (let k = 0; k < count; k++) {
        let px = wx;
        let py = wy;
        if (k > 0) {
          const ang = this.rng() * Math.PI * 2;
          const dist = 0.6 + this.rng() * scatter;
          px = Math.max(0, Math.min(W - 0.02, wx + Math.cos(ang) * dist));
          py = Math.max(0, Math.min(H - 0.02, wy + Math.sin(ang) * dist));
        }
        if (this.placeRace(race, px, py, k > 0)) spawned++;
      }
      if (spawned > 0) this.onSound?.('place'); // 放置成功才播放置音
      return;
    }
    switch (toolId) {
      case 'raise': {
        for (let yy = Math.floor(wy - r); yy <= wy + r; yy++) {
          for (let xx = Math.floor(wx - r); xx <= wx + r; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            if (Math.hypot(xx - wx, yy - wy) > r) continue;
            const i = idx(xx, yy);
            const t = this.terrain[i];
            if (t === T.DEEP) this.setTerrain(i, T.WATER);
            else if (t === T.WATER) this.setTerrain(i, T.SAND);
            else if (t === T.SAND || t === T.BURNT) this.setTerrain(i, T.GRASS);
          }
        }
        break;
      }
      case 'water': case 'sand': case 'grass': case 'forest': case 'mountain': case 'snow': case 'lava': case 'ice': case 'swamp': {
        const map: Record<string, number> = {
          water: T.WATER, sand: T.SAND, grass: T.GRASS, forest: T.FOREST,
          mountain: T.MOUNTAIN, snow: T.SNOW, lava: T.LAVA, ice: T.ICE, swamp: T.SWAMP,
        };
        const target = map[toolId];
        for (let yy = Math.floor(wy - r); yy <= wy + r; yy++) {
          for (let xx = Math.floor(wx - r); xx <= wx + r; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            if (Math.hypot(xx - wx, yy - wy) > r) continue;
            const i = idx(xx, yy);
            if (toolId === 'forest' && isWater(this.terrain[i])) continue;
            if (toolId === 'forest' && this.terrain[i] === T.MOUNTAIN) continue;
            this.setTerrain(i, target);
          }
        }
        break;
      }
      case 'fire': {
        for (let yy = Math.floor(wy - r); yy <= wy + r; yy++) {
          for (let xx = Math.floor(wx - r); xx <= wx + r; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            if (Math.hypot(xx - wx, yy - wy) > r) continue;
            this.ignite(idx(xx, yy));
          }
        }
        break;
      }
      case 'lightning':
        this.lightning(wx, wy, countP, powerP);
        break;
      case 'tornado':
        this.spawnTornado(wx, wy, countP);
        break;
      case 'earthquake':
        this.earthquake(wx, wy, rP ?? 9, powerP);
        break;
      case 'meteor': {
        const n = countP ?? 1;
        for (let k = 0; k < n; k++) {
          const ox = n > 1 ? (this.rng() - 0.5) * Math.max(3, n) : 0;
          const oy = n > 1 ? (this.rng() - 0.5) * Math.max(3, n) : 0;
          this.meteor(wx + ox, wy + oy);
        }
        break;
      }
      case 'nuke':
        this.nuke(wx, wy, powerP);
        break;
      case 'river':
        this.carveRiver(wx, wy);
        break;
      case 'oasis':
        this.createOasis(wx, wy);
        break;
      case 'smooth':
        this.smoothTerrain(wx, wy, r);
        break;
      case 'rough':
        this.roughenTerrain(wx, wy, r);
        break;
      case 'plague':
        this.plagueArea(wx, wy, Math.max(3, r));
        break;
      case 'flood':
        this.floodArea(wx, wy, rP ?? 5);
        break;
      case 'finger':
        this.beginGrab(wx, wy);
        break;
      case 'acidrain':
        this.acidRain(wx, wy, Math.max(4, r), durationP);
        break;
      case 'volcano':
        this.volcano(wx, wy, powerP);
        break;
      case 'tsunami':
        this.tsunami(wx, wy, r);
        break;
      case 'blizzard':
        this.blizzard(wx, wy, Math.max(5, r), durationP);
        break;
      case 'meteorshower':
        this.meteorShower(wx, wy, Math.max(4, r), countP);
        break;
      case 'locust':
        this.locust(wx, wy, rP, durationP);
        break;
      case 'drought':
        this.drought(wx, wy, Math.max(5, r), durationP);
        break;
      case 'heal':
        this.healArea(wx, wy, r);
        break;
      case 'kill':
        this.killArea(wx, wy, r);
        break;
      case 'boom':
        this.boom(wx, wy, rP);
        break;
      // —— 神力扩充 ——
      case 'rain':
        this.rainCloud(wx, wy, Math.max(4, r), durationP);
        break;
      case 'bless':
        this.blessArea(wx, wy, r);
        break;
      case 'curse':
        this.curseArea(wx, wy, r);
        break;
      case 'love':
        this.loveArea(wx, wy, r);
        break;
      case 'mutate':
        this.mutateArea(wx, wy, r);
        break;
      case 'teleport':
        this.teleportArea(wx, wy, r);
        break;
      case 'wrath':
        this.wrathStorm(wx, wy, Math.max(4, r), durationP);
        break;
      case 'holystorm':
        this.holyStorm(wx, wy, Math.max(4, r), durationP);
        break;
      // —— 天灾扩充 ——
      case 'sandstorm':
        this.sandstorm(wx, wy, rP, durationP);
        break;
      case 'typhoon':
        this.typhoon(wx, wy, rP, durationP);
        break;
      case 'sinkhole':
        this.sinkhole(wx, wy, Math.max(3, r));
        break;
      case 'iceage':
        this.iceAge(wx, wy, rP ?? Math.max(6, this.brush * 2 + 4), durationP);
        break;
      case 'famine':
        this.famineCloud(wx, wy, rP, durationP);
        break;
      case 'blackhole':
        this.blackhole(wx, wy, rP, durationP);
        break;
      default:
        break;
    }
  }

  // ---------------- camera ----------------
  /**
   * 视口雨情 0-1（Task 107 雨声环境音数据源）：把当前视口映射到 nature 雨格
   * （CELL=8 tile），≤36 格步进采样 rainCell 均值。全海视口/无雨世界自然为 0；
   * zoom 越小视口越广，采样自动扩到更大范围。GameCanvas 每秒级调用一次。
   */
  rainAmbienceLevel(cw: number, ch: number): number {
    const z = Math.max(0.01, this.cam.zoom);
    const wx0 = this.cam.x - cw / 2 / z;
    const wy0 = this.cam.y - ch / 2 / z;
    const wx1 = this.cam.x + cw / 2 / z;
    const wy1 = this.cam.y + ch / 2 / z;
    const cx0 = Math.max(0, Math.floor(wx0 / CELL));
    const cy0 = Math.max(0, Math.floor(wy0 / CELL));
    const cx1 = Math.min(AW - 1, Math.floor(wx1 / CELL));
    const cy1 = Math.min(AH - 1, Math.floor(wy1 / CELL));
    if (cx1 < cx0 || cy1 < cy0) return 0;
    const sx = Math.max(1, Math.ceil((cx1 - cx0 + 1) / 6));
    const sy = Math.max(1, Math.ceil((cy1 - cy0 + 1) / 6));
    let sum = 0;
    let n = 0;
    for (let cy = cy0; cy <= cy1; cy += sy) {
      for (let cx = cx0; cx <= cx1; cx += sx) {
        sum += this.nature.rainCell[cy * AW + cx];
        n++;
      }
    }
    if (n === 0) return 0;
    return Math.min(1, sum / n / 255);
  }

  screenToWorld(px: number, py: number, cw: number, ch: number) {
    return {
      wx: (px - cw / 2) / this.cam.zoom + this.cam.x,
      wy: (py - ch / 2) / this.cam.zoom + this.cam.y,
    };
  }

  zoomAt(px: number, py: number, factor: number, cw: number, ch: number) {
    if (Math.abs(factor - 1) < 0.0006) return;
    // 锚点取自当前视口（动画中途再次缩放也视觉正确）；目标倍率从「动画目标」复利
    // 而非当前插值倍率 —— 否则缓动会吃掉大部分输入，连续滚动越滚越慢
    const before = this.screenToWorld(px, py, cw, ch);
    const base = this.zoomAnim ? this.zoomAnim.target : this.cam.zoom;
    const target = Math.max(0.6, Math.min(24, base * factor));
    this.zoomAnim = { target, sx: px, sy: py, wx: before.wx, wy: before.wy, cw, ch };
  }

  /** 每渲染帧推进缩放动画：指数逼近目标倍率，锚点世界坐标钉在原屏幕位（经典地图推拉手感） */
  updateZoomAnim(dtMs: number) {
    const a = this.zoomAnim;
    if (!a) return;
    const k = 1 - Math.exp(-Math.min(64, Math.max(4, dtMs)) / 55);
    let z = this.cam.zoom + (a.target - this.cam.zoom) * k;
    if (Math.abs(a.target - z) < 0.004 * a.target) z = a.target; // 贴合收尾，防永久微颤
    this.cam.zoom = z;
    this.cam.x = a.wx - (a.sx - a.cw / 2) / z;
    this.cam.y = a.wy - (a.sy - a.ch / 2) / z;
    this.clampCam();
    if (z === a.target) this.zoomAnim = null;
  }

  pan(dx: number, dy: number) {
    // dx/dy 正值 = 镜头向右/向下移动（画面内容反向移动）。调用方传入 lastX - clientX：
    // 手指向右拖 → 传负值 → 镜头左移 → 内容跟随手指（此前用 -= 导致触屏拖动与移动方向相反，
    // 键盘 WASD/方向键同样反向，本轮统一修复）
    this.cam.x += dx / this.cam.zoom;
    this.cam.y += dy / this.cam.zoom;
    // 缩放滑行途中被拖动：把锚点重设到屏幕中心（当前视野中心），
    // 否则下一帧锚点回写会把这次拖动「吃掉」
    if (this.zoomAnim) {
      const a = this.zoomAnim;
      a.wx = this.cam.x;
      a.wy = this.cam.y;
      a.sx = a.cw / 2;
      a.sy = a.ch / 2;
    }
    this.clampCam();
  }

  clampCam() {
    this.cam.x = Math.max(-10, Math.min(W + 10, this.cam.x));
    this.cam.y = Math.max(-10, Math.min(H + 10, this.cam.y));
  }

  // ---------------- picking ----------------
  hitUnit(wx: number, wy: number, r = 1.2): Unit | null {
    // 【75 性能】平方距离比较替代 Math.hypot（免开方，约 5-10× 提速；命中判定只需与
    // r² 比大小，语义与返回值完全不变：仍取半径内最近单位）。该方法是悬停芯片/点选/
    // 右键菜单共用的拾取入口，2000+ 单位世界中此热点的耗时直接决定指针跟手度。
    let best: Unit | null = null;
    let bestD = r * r;
    const units = this.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const dx = (u.rx ?? u.x) - wx;
      const dy = (u.ry ?? u.y) - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) {
        bestD = d2;
        best = u;
      }
    }
    return best;
  }

  // ---------------- stats ----------------
  statsTick() {
    const byRace: Record<string, number> = {};
    let totalPop = 0;
    // 每文明军队统计（战士+弓手）+ 种族构成（多族王国同质性）
    const armyBy: Record<number, number> = {};
    const civRaceCnt = new Map<number, Map<number, number>>();
    for (const u of this.units) {
      if (u.dead) continue;
      const def = RACES[u.race];
      if (!def) continue; // 防御：未知种族（损坏存档）不入统计
      const k = def.key;
      byRace[k] = (byRace[k] ?? 0) + 1;
      if (def.isCiv) {
        totalPop++;
        if (u.civ >= 0) {
          if (u.job === 2 || u.job === 3) armyBy[u.civ] = (armyBy[u.civ] ?? 0) + 1;
          let rc = civRaceCnt.get(u.civ);
          if (!rc) { rc = new Map(); civRaceCnt.set(u.civ, rc); }
          rc.set(u.race, (rc.get(u.race) ?? 0) + 1);
        }
      }
    }
    // —— 种族同质性重建（多族王国稳定度修正用）——
    this.civHomogeneity.clear();
    for (const [cid, rc] of civRaceCnt) {
      let tot = 0;
      let maj = 0;
      for (const n of rc.values()) { tot += n; if (n > maj) maj = n; }
      this.civHomogeneity.set(cid, tot > 0 ? maj / tot : 1);
    }
    // —— 种族灭绝检测（曾经繁盛的种族归零 → 灭族纪事；复现后重置）——
    const allRaceIds = new Set<number>([...Object.keys(RACES).map(Number), ...this.dynRaces.keys()]);
    for (const rid of allRaceIds) {
      const def = RACES[rid];
      if (!def?.isCiv) continue;
      const pop = byRace[def.key] ?? 0;
      if (pop >= 25) {
        this.raceThrived.add(rid);
        if (this.extinctNoted.has(def.key)) this.extinctNoted.delete(def.key);
      } else if (pop === 0 && this.raceThrived.has(rid) && !this.extinctNoted.has(def.key)) {
        this.extinctNoted.add(def.key);
        this.addEvent('extinct', `${def.name}一族已从世界上彻底消失——一个种族的灭绝`, { colorHex: '#94a3b8' });
        this.toast(`${def.name}灭绝了`, 'danger');
      }
    }
    // 僵尸爆发播报：超过 20 只记一次，清零后重置可再触发
    const zombies = byRace.zombie ?? 0;
    if (zombies >= 20 && !this.zombieOutbreakNoted) {
      this.zombieOutbreakNoted = true;
      this.addEvent('zombie', `僵尸潮爆发了 — ${zombies} 只行尸正在大地上游荡`);
    } else if (zombies === 0 && this.zombieOutbreakNoted) {
      this.zombieOutbreakNoted = false;
    }
    const civs = this.civs
      .filter((c) => c.alive)
      .map((c) => {
        const wars: string[] = [];
        for (const o of this.civs) {
          if (o.alive && o.id !== c.id && this.atWar(c.id, o.id)) wars.push(o.name);
        }
        let tiles = 0;
        for (const i of c.tiles) if (this.owner[i] === c.id) tiles++;
        const capital = c.capital >= 0 ? { x: this.tileX(c.capital), y: this.tileY(c.capital) } : null;
        const counts = this.civBuildCounts.get(c.id);
        const builds: { kind: number; n: number }[] = [];
        if (counts) {
          for (let k = 1; k < BUILDING_DEFS.length; k++) if (counts[k]) builds.push({ kind: k, n: counts[k] });
        }
        // —— 科技与社会快照（CivPanel / Inspector 展示）——
        const rDef = c.research ? TECH_BY_KEY[c.research] : null;
        const research = rDef
          ? { key: rDef.key, name: rDef.name, progress: Math.min(1, (c.researchP ?? 0) / rDef.cost), remain: Math.max(0, Math.ceil(rDef.cost - (c.researchP ?? 0))) }
          : null;
        return {
          id: c.id, name: c.name, race: c.race, colorHex: c.colorHex, pop: c.pop, tiles, houses: c.houses, wars, capital,
          gold: Math.floor(c.gold ?? 0), knowledge: Math.floor(c.knowledge ?? 0), army: armyBy[c.id] ?? 0, builds,
          techCount: (c.techs ?? []).length, research,
          gov: c.gov ?? 0, govName: GOV_DEFS[c.gov ?? 0]?.name ?? '部落制',
          stability: Math.round(c.stability ?? 70), culture: Math.round(c.culture ?? 0),
          militarism: Math.round(c.militarism ?? 30),
          income: Math.round(c.income ?? 0), expense: Math.round(c.expense ?? 0),
          armament: this.armamentOf(c),
          armamentName: ['木石时代', '青铜时代', '铁器时代', '钢铁时代', '火器时代', '现代军备', '未来军备'][this.armamentOf(c)],
          allianceId: (() => { const al = this.allianceOfCiv(c.id); return al ? al.id : -1; })(),
          allianceName: (() => { const al = this.allianceOfCiv(c.id); return al ? al.name : ''; })(),
        };
      });
    // —— 联盟快照（阵营实体：成员/凝聚力/共同战争——KingdomsPanel 联盟区展示）——
    const alliances = this.alliances.map((al) => ({
      id: al.id, name: al.name, colorHex: al.colorHex,
      leaderName: this.civs[al.leader]?.name ?? '?',
      leaderId: al.leader,
      members: al.members
        .map((m) => this.civs[m])
        .filter((c): c is Civ => !!c?.alive)
        .map((c) => ({ id: c.id, name: c.name, colorHex: c.colorHex, raceName: RACES[c.race]?.name ?? '?', pop: c.pop })),
      cohesion: Math.round(al.cohesion), formedYear: al.formedYear, warsTogether: al.warsTogether,
    }));
    let warsCount = 0;
    for (const v of this.rel.values()) if (v < -20) warsCount++;
    let boats = 0;
    for (const u of this.units) if (u.boat && !u.dead) boats++;
    // 王国间外交关系快照（双方均在世才入列）
    const relations: { a: number; b: number; v: number }[] = [];
    for (const [key, v] of this.rel) {
      const dash = key.indexOf('-');
      const a = +key.slice(0, dash);
      const b = +key.slice(dash + 1);
      if (this.civs[a]?.alive && this.civs[b]?.alive) relations.push({ a, b, v: Math.round(v) });
    }
    // 深度打磨：活跃贸易路线（在途商队两端文明对，去重）
    const tradeSeen = new Set<string>();
    const tradePairs: [number, number][] = [];
    for (const u of this.units) {
      if (u.dead || (u.caravan ?? 0) <= 0) continue;
      const a = u.civ;
      const b = u.caravan!;
      if (a < 0 || !this.civs[a]?.alive || !this.civs[b]?.alive) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (tradeSeen.has(key)) continue;
      tradeSeen.add(key);
      tradePairs.push([a, b]);
    }
    // —— 军团方阵一览（快照：士气/战损/机械化/战术 AI——作战行为系统可视化）——
    const armies = this.armies.map((a) => {
      const tm = this.techModsOf(a.civ);
      return {
        id: a.id, name: a.name, civ: a.civ,
        size: a.members.length, size0: a.size0,
        morale: Math.round(a.morale), state: a.state,
        x: Math.round(a.x * 10) / 10, y: Math.round(a.y * 10) / 10,
        kills: a.kills,
        losses: a.losses ?? 0,
        mech: tm.mech > 0,
        ai: tm.ai > 0,
      };
    });
    // —— 进行中战争详情（快照：理由/目的/承受力/战况）——
    const warList = [...this.warData.values()]
      .filter((wd) => this.civs[wd.a]?.alive && this.civs[wd.b]?.alive)
      .map((wd) => ({
        a: wd.a, b: wd.b,
        nameA: this.civs[wd.a]?.name ?? '?', nameB: this.civs[wd.b]?.name ?? '?',
        colorA: this.civs[wd.a]?.colorHex ?? '#888', colorB: this.civs[wd.b]?.colorHex ?? '#888',
        years: Math.max(0, Math.floor(this.yearF) - wd.startYear),
        scoreA: Math.round(wd.scoreA), scoreB: Math.round(wd.scoreB),
        casA: wd.casA, casB: wd.casB, razedA: wd.razedA, razedB: wd.razedB, total: wd.total,
        reason: wd.reason,
        reasonLabel: CASUS_META[wd.reason]?.label ?? '战争',
        reasonText: wd.reasonText,
        aggressor: wd.aggressor,
        goal: wd.goal,
        goalNow: this.warGoalNow(wd),
        goalLabel: this.warGoalLabel(wd),
        sustainA: Math.round(this.sustainOf(this.civs[wd.a]!, wd, true)),
        sustainB: Math.round(this.sustainOf(this.civs[wd.b]!, wd, false)),
        exA: Math.round(wd.exA), exB: Math.round(wd.exB),
      }));
    // —— 文明旨意一览（快照）——
    const directives = this.directives.map((d) => ({
      id: d.id, civ: d.civ, civName: this.civs[d.civ]?.name ?? '?',
      kind: d.kind, text: d.text, status: d.status,
      progress: Math.round(this.directiveProgressOf(d) * 100) / 100,
      deadlineYear: d.deadlineTick > 0 ? Math.floor(this.yearF + (d.deadlineTick - this.tickCount) / YEAR_TICKS) : 0,
    }));
    // —— 生态与进化快照（EcologyPanel 展示）——
    const ECO_RACES = this.ecoRaces();
    const species: SpeciesEco[] = [];
    let herbivores = 0;
    let predators = 0;
    const HERBIVORE_KEYS = new Set(['sheep', 'deer', 'penguin', 'camel']);
    for (const race of ECO_RACES) {
      let n = 0;
      let s = 0, d = 0, h = 0, r = 0;
      for (const u of this.units) {
        if (u.dead || u.race !== race) continue;
        n++;
        if (u.gene) { s += u.gene.s; d += u.gene.d; h += u.gene.h; r += u.gene.r; }
        else { s += 1; d += 1; h += 1; r += 1; }
      }
      if (HERBIVORE_KEYS.has(RACES[race].key)) herbivores += n;
      else predators += n;
      if (n === 0) {
        // 灭绝纪念卡：历史上有过采样记录的物种仍入快照（曲线归零 + 灭绝徽章），从未出现则跳过
        const hist = this.speciesHist.get(race);
        if (!hist || !hist.some((v) => v > 0)) continue;
        species.push({
          race,
          name: RACES[race].name,
          pop: 0,
          gene: { s: 1, d: 1, h: 1, r: 1 },
          base: this.speciesBase.get(race)?.gene ?? { s: 1, d: 1, h: 1, r: 1 },
          trend: -100,
          gen: this.speciesBase.get(race)?.gen ?? 0,
          sub: this.speciesBase.get(race)?.sub,
          beh: this.speciesBase.get(race)?.beh,
          hist: hist.slice(),
        });
        continue;
      }
      const prev = this.lastEcoPop.get(race) ?? n;
      this.lastEcoPop.set(race, n);
      species.push({
        race,
        name: RACES[race].name,
        pop: n,
        gene: { s: s / n, d: d / n, h: h / n, r: r / n },
        base: this.speciesBase.get(race)?.gene ?? { s: 1, d: 1, h: 1, r: 1 },
        trend: prev > 0 ? Math.round(((n - prev) / prev) * 100) : 0,
        gen: this.speciesBase.get(race)?.gen ?? 0,
        sub: this.speciesBase.get(race)?.sub,
        beh: this.speciesBase.get(race)?.beh,
        hist: this.speciesHist.get(race)?.slice(),
      });
    }
    // —— 终极世界大战快照（HUD / 开发面板展示）——
    let worldWar: StatsSnapshot['worldWar'] = null;
    if (this.worldWar.phase !== 'idle') {
      const ww = this.worldWar;
      const aliveN = this.wwAliveBelligerents().length;
      let modernCivs = 0;
      let futureCivs = 0;
      for (const c of this.civs) {
        if (!c.alive) continue;
        const arm = this.armamentOf(c);
        if (arm >= 6) futureCivs++;
        else if (arm >= 4) modernCivs++;
      }
      const winnerCiv = ww.winner != null ? this.civs[ww.winner] : null;
      worldWar = {
        phase: ww.phase,
        startTick: ww.startTick,
        startYear: ww.startYear,
        years: Math.max(0, Math.floor(this.yearF) - ww.startYear),
        belligerents: ww.belligerents.length,
        alive: ww.phase === 'running' ? aliveN : winnerCiv ? 1 : 0,
        kills: ww.kills,
        truces: ww.truces,
        nukes: ww.nukes,
        modernCivs,
        futureCivs,
        frenzy: ww.phase === 'running' && aliveN <= 3,
        lasers: ww.lasers,
        drones: ww.drones,
        orbitals: ww.orbitals,
        plasmas: ww.plasmas,
        antimatters: ww.antimatters,
        emergent: ww.emerged,
        fallen: ww.fallen.map((f) => ({ name: f.name, colorHex: f.colorHex })),
        winner: ww.winner,
        winnerName: winnerCiv?.name ?? null,
        endText: ww.endText,
      };
    }
    // —— 种族系统 v2 快照（种族名录 + 关系矩阵 —— RacePanel 展示）——
    const raceKingdoms = new Map<number, number>();
    for (const c of this.civs) {
      if (c.alive && c.pop > 0) raceKingdoms.set(c.race, (raceKingdoms.get(c.race) ?? 0) + 1);
    }
    const races: StatsSnapshot['races'] = [];
    for (const rid of allRaceIds) {
      const def = RACES[rid];
      if (!def) continue;
      const dyn = this.dynRaces.get(rid);
      const persona = def.diplo != null || def.aggr != null
        ? {
            diplo: Math.round((def.diplo ?? 0.5) * 100), aggr: Math.round((def.aggr ?? 0.5) * 100),
            greed: Math.round((def.greed ?? 0.5) * 100), piety: Math.round((def.piety ?? 0.5) * 100),
            industry: Math.round((def.industry ?? 0.5) * 100), arcane: Math.round((def.arcane ?? 0.5) * 100),
            growth: Math.round((def.growth ?? 0.5) * 100), harmony: Math.round((def.harmony ?? 0.5) * 100),
          }
        : null;
      races.push({
        id: rid, key: def.key, name: def.name, isCiv: def.isCiv,
        pop: byRace[def.key] ?? 0,
        kingdoms: raceKingdoms.get(rid) ?? 0,
        archetype: def.archetype ?? (def.isCiv ? '新兴文明种族' : '野生动物'),
        persona,
        nightsight: !!def.nightsight,
        dynamic: !!dyn,
        parentName: dyn ? (RACES[dyn.parent]?.name ?? null) : null,
        extinct: def.isCiv && (byRace[def.key] ?? 0) === 0 && this.raceThrived.has(rid),
      });
    }
    races.sort((x, y) => (Number(y.isCiv) - Number(x.isCiv)) || (y.pop - x.pop));
    // 种族关系矩阵（文明种族间全对；动态种族仅主要者 —— pop≥10）
    const relRaceIds = races.filter((r) => r.isCiv && (r.pop >= 10 || !r.dynamic)).map((r) => r.id);
    const raceRelations: StatsSnapshot['raceRelations'] = [];
    for (let i = 0; i < relRaceIds.length; i++) {
      for (let j = i + 1; j < relRaceIds.length; j++) {
        raceRelations.push({ a: relRaceIds[i], b: relRaceIds[j], v: Math.round(this.raceRelOf(relRaceIds[i], relRaceIds[j])) });
      }
    }
    const stats: StatsSnapshot = {
      year: Math.floor(this.yearF),
      totalPop,
      byRace,
      civs,
      alliances,
      races,
      raceRelations,
      warsCount, // rel 每对关系单条目（pairKey 规范化）：计数即战争数，旧版误除 2
      fires: this.fireSet.size,
      units: this.units.length,
      boats,
      relations,
      tradePairs,
      armies,
      warList,
      directives,
      species,
      grass: this.grassTiles,
      herbivores,
      predators,
      ecoState: this.ecoState,
      // —— 成就快照（跨世界元进度：面板展示 + gameStore 持久化合并）——
      unlockedAch: [...this.achUnlocked.entries()].map(([id, year]) => ({ id, year })),
      achProgress: this.achProgressCache,
      worldWar,
      // —— 自然引擎快照（板块/季节/大气/地质；NaturePanel + 神谕上下文）——
      nature: this.nature.snapshot(),
    };
    this.onStats?.(stats);
  }

  // ---------------- 事件触发器（像素级精细化事件控制） ----------------
  /** 触发器条件评估（tick 循环每 8 tick 调用一次）：满足条件即执行动作 */
  checkTriggers() {
    if (this.triggers.length === 0) return;
    for (let i = this.triggers.length - 1; i >= 0; i--) {
      const t = this.triggers[i];
      if (!t.enabled || t.cond.kind === 'hand') continue;
      // 年度门槛（一次性条件 + 冷却 + 周期排程共用）
      if (this.yearF < t.nextFireYear) continue;
      if (!this.evalTriggerCond(t)) continue;
      this.fireTrigger(t);
      if (t.once) this.triggers.splice(i, 1);
    }
  }

  /** 评估单个触发器的条件（不含年份门槛与冷却——checkTriggers 已处理） */
  evalTriggerCond(t: TriggerDef): boolean {
    const c = t.cond;
    switch (c.kind) {
      case 'time':
        return this.yearF >= c.year;
      case 'every':
        return true; // 周期排程由 nextFireYear 驱动，到达即触发
      case 'pop': {
        let n = 0;
        for (const u of this.units) {
          if (u.dead) continue;
          if (c.race === -1 ? RACES[u.race]?.isCiv : u.race === c.race) n++;
        }
        return n >= c.count;
      }
      case 'kingdomPop':
        return this.civs.some((cv) => cv.alive && cv.pop >= c.count);
      case 'kingdomTiles':
        return this.civs.some((cv) => cv.alive && cv.tiles.length >= c.count);
      case 'wars': {
        let wars = 0;
        for (const v of this.rel.values()) if (v < -20) wars++;
        return (wars / 2 | 0) >= c.count;
      }
      case 'fires':
        return this.fireSet.size >= c.count;
      case 'unitCount': {
        let n = 0;
        for (const u of this.units) if (!u.dead) n++;
        return n >= c.count;
      }
      case 'enter': {
        // 区域检测：中心 ± r 的方形内扫描空间分桶（与渲染/战斗同粒度，O(区域) 而非 O(units)）
        const x0 = Math.max(0, Math.floor(t.x - t.r));
        const x1 = Math.min(W - 1, Math.ceil(t.x + t.r));
        const y0 = Math.max(0, Math.floor(t.y - t.r));
        const y1 = Math.min(H - 1, Math.ceil(t.y + t.r));
        const bx0 = Math.floor(x0 / 4), bx1 = Math.floor(x1 / 4);
        const by0 = Math.floor(y0 / 4), by1 = Math.floor(y1 / 4);
        for (let by = by0; by <= by1; by++) {
          for (let bx = bx0; bx <= bx1; bx++) {
            const bucket = this.buckets[by * this.bw + bx];
            if (!bucket) continue;
            for (const u of bucket) {
              if (u.dead) continue;
              if (Math.hypot(u.x - t.x, u.y - t.y) > t.r) continue;
              if (c.race === -1 || u.race === c.race) return true;
            }
          }
        }
        return false;
      }
      case 'hand':
        return false; // 手动触发不走自动评估
    }
  }

  /** 执行触发器动作：以 t.brush 为笔刷在 (t.x, t.y) 施放 t.action 工具 */
  fireTrigger(t: TriggerDef) {
    const tool = TOOL_BY_ID[t.action];
    if (!tool) return;
    // 临时借用 brush 字段执行动作（applyTool 读 this.brush）
    const savedBrush = this.brush;
    this.brush = t.brush;
    try {
      this.applyTool(t.action, t.x, t.y);
    } finally {
      this.brush = savedBrush;
    }
    t.fired++;
    // 周期/冷却排程：every 推进下一周期；其余条件按 cd 冷却（cd=0 时至少 0.5 年，防止每 8 tick 连发）
    t.nextFireYear = t.cond.kind === 'every'
      ? Math.floor(this.yearF) + t.cond.years
      : this.yearF + Math.max(t.cd, 0.5);
    const actName = tool.label;
    this.addEvent('trigger', `「${t.name}」触发：${actName} @ (${Math.floor(t.x)},${Math.floor(t.y)})`, { x: t.x, y: t.y });
    this.toast(`触发器「${t.name}」执行了 ${actName}`, 'info');
  }

  /** 手动触发（面板按钮直接调用）：无视年份门槛，但遵守 once/统计 */
  manualTrigger(id: number) {
    const t = this.triggers.find((x) => x.id === id);
    if (!t) return;
    this.fireTrigger(t);
    if (t.once) this.triggers = this.triggers.filter((x) => x.id !== id);
  }

  /** 新建触发器（UI store 调用）：返回新建的触发器 */
  addTrigger(t: Omit<TriggerDef, 'id' | 'fired' | 'nextFireYear'>): TriggerDef {
    // 周期型触发器从下一个周期开始（首触发在创建年份 + years）
    const nextFireYear = t.cond.kind === 'every'
      ? Math.floor(this.yearF) + t.cond.years
      : 0; // 其余条件立即可评估（冷却在触发后生效）
    const full: TriggerDef = { ...t, id: this.triggerSeq++, fired: 0, nextFireYear };
    this.triggers.push(full);
    return full;
  }

  /** 删除触发器 */
  removeTrigger(id: number) {
    this.triggers = this.triggers.filter((t) => t.id !== id);
  }

  /** 更新触发器字段（局部合并；改 cond 时重置排程） */
  updateTrigger(id: number, patch: Partial<TriggerDef>) {
    const t = this.triggers.find((x) => x.id === id);
    if (!t) return;
    if (patch.cond && patch.cond !== t.cond) {
      patch.nextFireYear = patch.cond.kind === 'every'
        ? Math.floor(this.yearF) + patch.cond.years
        : 0;
      patch.fired = 0;
    }
    Object.assign(t, patch);
  }

  /** op = 操作反馈标记（「对你的回话」而非「世界的搏动」）：只走事件浮层，不联动岁月沙漏脉冲。
   *  替代 Task 70 的 PULSE_SKIP 短语黑名单 —— 新增操作反馈类 toast 只需传 true，无需再维护硬编码列表 */
  toast(text: string, tone: ToastMsg['tone'], op?: boolean) {
    this.onToast?.({ id: this.toastSeq++, text, tone, op });
  }

  /** 记录一条世界纪事（上限 80 条，新的在最前） */
  addEvent(kind: WorldEventKind, text: string, opts?: { colorHex?: string; x?: number; y?: number }) {
    const ev: WorldEvent = {
      id: this.eventSeq++,
      year: Math.floor(this.yearF),
      kind,
      text,
      colorHex: opts?.colorHex,
      x: opts?.x,
      y: opts?.y,
    };
    this.worldEvents.unshift(ev);
    if (this.worldEvents.length > 80) this.worldEvents.length = 80;
    // 传副本保证引用变化（zustand 选择器与 React useMemo 才会感知新事件）
    this.onEvent?.(this.worldEvents.slice());
    // v41：机制热插拔事件总线——event 型机制在此感应世界脉动
    //（零法则零开销；firing 重入保护在 onEvent 内——fire 里的神力会再 addEvent，防无限递归）
    const alws = this.agentLaws as AgentLawSystem | undefined;
    if (alws !== undefined && alws.laws.length > 0) alws.onEvent(kind, opts?.x, opts?.y);
  }

  // ---------------- layer flush ----------------
  flushDirty() {
    if (this.dirty.size === 0) return;
    const data = this.terrainImg.data;
    const nat = this.nature;
    // putImageData 脏矩形追踪（质感工程 v3：旧版每次全图 put 2048×1280 = 10MB CPU 拷贝；
    // 改为只上传脏瓦片包围盒 —— 常态每帧仅数个脏瓦片，上传成本降低两个数量级）
    let bminX = W, bminY = H, bmaxX = -1, bmaxY = -1;
    for (const i of this.dirty) {
      const tx = i % W;
      const ty = (i / W) | 0;
      if (tx < bminX) bminX = tx;
      if (tx > bmaxX) bmaxX = tx;
      if (ty < bminY) bminY = ty;
      if (ty > bmaxY) bmaxY = ty;
      const t = this.terrain[i];
      // —— 水深分层取色：浅礁绿松石 → 近岸 → 开阔 → 陆架 → 深渊（色彩纵深）
      let base: [number, number, number];
      if (t === T.WATER) {
        const wt = this.waterTier[i];
        base = WATER_TIER_RGB[wt <= 2 ? wt : 2] ?? TERRAIN_RGB[1];
      } else if (t === T.DEEP) {
        const wt = this.waterTier[i];
        base = wt >= 3 ? DEEP_TIER_RGB[wt - 3] : TERRAIN_RGB[0];
      } else {
        base = TERRAIN_RGB[t] ?? TERRAIN_RGB[0];
      }
      const v = (this.variant[i] % 13) - 6;
      // 季节/灰烬调色（自然引擎：春青/秋金/冬霜 + 火山冬压暗；深时引擎：冰川覆被）
      const tint = nat.tint(t, (i / W) | 0, i);
      let r = base[0] + v + tint[0];
      let g = base[1] + v + tint[1];
      let b = base[2] + v + tint[2];
      // —— 群系边缘融合：软土地形与相邻异色地形做抖动棋盘混合（消除油漆桶硬边界） ——
      if (SOFT_TERRAIN[t]) {
        const x = i % W;
        const y = (i / W) | 0;
        let nb = -1;
        if (x > 0 && this.terrain[i - 1] !== t && SOFT_TERRAIN[this.terrain[i - 1]]) nb = this.terrain[i - 1];
        else if (x < W - 1 && this.terrain[i + 1] !== t && SOFT_TERRAIN[this.terrain[i + 1]]) nb = this.terrain[i + 1];
        else if (y > 0 && this.terrain[i - W] !== t && SOFT_TERRAIN[this.terrain[i - W]]) nb = this.terrain[i - W];
        else if (y < H - 1 && this.terrain[i + W] !== t && SOFT_TERRAIN[this.terrain[i + W]]) nb = this.terrain[i + W];
        if (nb >= 0 && ((this.variant[i] + x + y) & 1) === 0) {
          // 硬群系过渡（沙↔草、雪↔草）：中间色 50/50 混出更宽的渐变带；其余软地形维持 32% 轻融
          const hardPair = (t === T.GRASS && (nb === T.SAND || nb === T.SNOW))
            || (t === T.SAND && nb === T.GRASS) || (t === T.SNOW && nb === T.GRASS);
          const a = hardPair ? 0.5 : 0.32;
          const bc = TERRAIN_RGB[nb];
          r = r * (1 - a) + bc[0] * a;
          g = g * (1 - a) + bc[1] * a;
          b = b * (1 - a) + bc[2] * a;
        }
      }
      // —— 坡向明暗（hillshade）：西北邻高 → 本格背光压暗；东南邻高 → 本格受光提亮（烘焙零稳态开销） ——
      if (t === T.HILL || t === T.MOUNTAIN) {
        const hx = i % W;
        const hy = (i / W) | 0;
        const elev = (j: number) => { const tt = this.terrain[j]; return tt === T.MOUNTAIN ? 2 : tt === T.HILL ? 1 : 0; };
        let slope = 0;
        if (hx > 0 && hy > 0) slope += elev(i - W - 1); // 西北邻高出 → 遮光
        if (hx < W - 1 && hy < H - 1) slope -= elev(i + W + 1); // 东南邻高出 → 本格朝光
        if (slope > 0) { const k = Math.min(0.16, slope * 0.08); r *= 1 - k; g *= 1 - k; b *= 1 - k; }
        else if (slope < 0) { const k = Math.min(0.12, -slope * 0.06); r += 30 * k; g += 30 * k; b += 26 * k; }
      }
      // —— 道路：向夥实土路色混合（疆域脉络一眼可读） ——
      if (this.road[i] > 0) {
        r = r * 0.5 + 178 * 0.5;
        g = g * 0.5 + 156 * 0.5;
        b = b * 0.5 + 114 * 0.5;
      }
      const o = this.owner[i];
      if (o >= 0) {
        const civ = this.civs[o];
        if (civ && civ.alive) {
          const x = i % W;
          const y = (i / W) | 0;
          let border = false;
          if (x > 0 && this.owner[i - 1] !== o) border = true;
          else if (x < W - 1 && this.owner[i + 1] !== o) border = true;
          else if (y > 0 && this.owner[i - W] !== o) border = true;
          else if (y < H - 1 && this.owner[i + W] !== o) border = true;
          const a = border ? 0.45 : 0.22;
          r = r * (1 - a) + civ.color[0] * a;
          g = g * (1 - a) + civ.color[1] * a;
          b = b * (1 - a) + civ.color[2] * a;
        }
      }
      if (this.radiate[i] > 0) {
        r = r * 0.6 + 100 * 0.4;
        g = g * 0.6 + 230 * 0.4;
        b = b * 0.6 + 90 * 0.4;
      }
      // —— 质感工程 v3（Task 49）：干净瓦片烘焙（8px/格超采样） ——
      // 旧版逐子像素 ±2 随机抖动在高倍缩放下呈「电视雪花」（VLM 确诊「无章法的
      // 彩色噪点」）。新版遵循商业像素画惯例：瓦片以平涂为主（tile 级 variant ±6
      // 保留大尺度斑驳），细节改为稀疏「聚簇特征」（草簇/沙纹/岩裂/浪花/野花），
      // ~80% 平涂 + ~20% 细节 —— 干净 = 高级感。
      const WBW = W * 8;
      const bx = (i % W) * 8;
      const by = ty * 8;
      const r0 = r | 0, g0 = g | 0, b0 = b | 0;
      const hsh = (this.variant[i] * 2654435761 + i * 97) >>> 0;
      // 8×8 平涂底色：大片平涂保留「干净」基调；草地/森林/沙地叠加确定性哈希 2 值细噪点
      // （~15% 密度、±2 亮度，按子像素位置哈希 → 同格重绘结果一致）—— 低幅大地肌理
      const fineNoise = t === T.GRASS || t === T.FOREST || t === T.SAND;
      for (let sy = 0; sy < 8; sy++) {
        let off = ((by + sy) * WBW + bx) * 4;
        for (let sx = 0; sx < 8; sx++, off += 4) {
          let pr = r0, pg = g0, pb = b0;
          if (fineNoise) {
            const nz = ((hsh ^ Math.imul((sy << 3) | sx, 2246822519)) >>> 10) % 20;
            if (nz < 3) { const d = (nz & 1) === 0 ? 2 : -2; pr += d; pg += d; pb += d; }
          }
          data[off] = pr;
          data[off + 1] = pg;
          data[off + 2] = pb;
          data[off + 3] = 255;
        }
      }
      // 特征块写入器（8×8 网格，支持 w×h 块；确定性哈希 → 同格重绘结果一致）
      const dot = (sx: number, sy: number, dr: number, dg: number, db: number, w = 1, h = 1) => {
        const x1 = Math.min(8, sx + w), y1 = Math.min(8, sy + h);
        for (let yy = Math.max(0, sy); yy < y1; yy++) {
          let off = ((by + yy) * WBW + bx + Math.max(0, sx)) * 4;
          for (let xx = Math.max(0, sx); xx < x1; xx++, off += 4) {
            data[off] = Math.max(0, Math.min(255, r0 + dr));
            data[off + 1] = Math.max(0, Math.min(255, g0 + dg));
            data[off + 2] = Math.max(0, Math.min(255, b0 + db));
          }
        }
      };
      if (t === T.GRASS || t === T.FOREST) {
        // 草簇：竖 1×2 草茎（深/亮二态）+ 偶发野花 —— 稀疏聚簇，大片平涂留白
        const n = 1 + (hsh & 1);
        for (let k = 0; k < n; k++) {
          const sx = (hsh >>> (k * 3 + 2)) & 7;
          const sy = (hsh >>> (k * 3 + 5)) & 6;
          const lit = ((hsh >>> (k * 5)) & 1) === 1;
          const dr2 = lit ? 14 : -16;
          dot(sx, sy, dr2, (dr2 * 1.4) | 0, (dr2 * 0.4) | 0, 1, 2);
        }
        // 野花（~2.7% 草地）：双色小花（红/黄/白轮换）
        if (hsh % 37 === 0) {
          const fx = (hsh >>> 4) & 7;
          const fy = (hsh >>> 9) & 7;
          const kind = (hsh >>> 3) & 3;
          if (kind === 0) dot(fx, fy, 52, -20, 18, 1, 1);      // 红瓣
          else if (kind === 1) dot(fx, fy, 58, 44, -24, 1, 1); // 黄瓣
          else dot(fx, fy, 64, 62, 54, 1, 1);                  // 白瓣
          dot(Math.min(7, fx + 1), fy, -6, 10, -4, 1, 1);       // 暗芯点缀
        }
      } else if (t === T.SAND) {
        // 沙纹：1-2 条横向暗色短纹 + 偶发亮颗粒（风蚀肌理，非噪声）
        const rx = (hsh >>> 3) & 6;
        const ry = (hsh >>> 6) & 7;
        dot(rx, ry, -12, -9, -4, 3, 1);
        if ((hsh & 1) === 0) dot((hsh >>> 9) & 6, (hsh >>> 12) & 7, -10, -7, -3, 2, 1);
        if ((hsh & 3) === 0) dot((hsh >>> 15) & 7, (hsh >>> 18) & 7, 15, 12, 5);
        // 湿沙边：邻水一侧的暗色条带（浪线打湿的痕迹）
        const xL = tx > 0 && (this.terrain[i - 1] === T.WATER || this.terrain[i - 1] === T.DEEP);
        const xR = tx < W - 1 && (this.terrain[i + 1] === T.WATER || this.terrain[i + 1] === T.DEEP);
        const yT = ty > 0 && (this.terrain[i - W] === T.WATER || this.terrain[i - W] === T.DEEP);
        const yB = ty < H - 1 && (this.terrain[i + W] === T.WATER || this.terrain[i + W] === T.DEEP);
        if (xL) dot(0, 0, -22, -16, -6, 1, 8);
        if (xR) dot(7, 0, -22, -16, -6, 1, 8);
        if (yT) dot(0, 0, -22, -16, -6, 8, 1);
        if (yB) dot(0, 7, -22, -16, -6, 8, 1);
      } else if (t === T.WATER) {
        // 浅水：偶发静态波光（动态粼点由环境层承担）；深水保持平静平面
        const wt = this.waterTier[i];
        if (wt <= 1 && (hsh & 3) === 0) {
          dot((hsh >>> 4) & 6, (hsh >>> 7) & 7, 22, 30, 40, 2, 1);
        }
        // 海岸泡沫：邻陆一侧的亮白浪线（商业像素游戏的经典海岸语言；
        // 与环境层动态波光叠加 → 海浪拍岸的生命感）
        const landL = tx > 0 && this.terrain[i - 1] !== T.WATER && this.terrain[i - 1] !== T.DEEP;
        const landR = tx < W - 1 && this.terrain[i + 1] !== T.WATER && this.terrain[i + 1] !== T.DEEP;
        const landT = ty > 0 && this.terrain[i - W] !== T.WATER && this.terrain[i - W] !== T.DEEP;
        const landB = ty < H - 1 && this.terrain[i + W] !== T.WATER && this.terrain[i + W] !== T.DEEP;
        if (landL || landR || landT || landB) {
          const fo = 46, fg = 54, fb = 56;
          if (landL) {
            dot(0, (hsh >>> 5) & 6, fo, fg, fb, 1, 2);
            dot(0, ((hsh >>> 8) & 5) + 3, (fo * 0.7) | 0, (fg * 0.7) | 0, (fb * 0.7) | 0, 1, 1);
          }
          if (landR) {
            dot(7, (hsh >>> 5) & 6, fo, fg, fb, 1, 2);
            dot(7, ((hsh >>> 8) & 5) + 3, (fo * 0.7) | 0, (fg * 0.7) | 0, (fb * 0.7) | 0, 1, 1);
          }
          if (landT) {
            dot((hsh >>> 5) & 6, 0, fo, fg, fb, 2, 1);
            dot(((hsh >>> 8) & 5) + 3, 0, (fo * 0.7) | 0, (fg * 0.7) | 0, (fb * 0.7) | 0, 1, 1);
          }
          if (landB) {
            dot((hsh >>> 5) & 6, 7, fo, fg, fb, 2, 1);
            dot(((hsh >>> 8) & 5) + 3, 7, (fo * 0.7) | 0, (fg * 0.7) | 0, (fb * 0.7) | 0, 1, 1);
          }
        }
      } else if (t === T.SNOW) {
        // 雪原亮晶：稀疏闪光 + 偶发风吹雪影
        if ((hsh & 1) === 0) dot((hsh >>> 3) & 7, (hsh >>> 6) & 7, 20, 20, 24);
        if ((hsh & 3) === 0) dot((hsh >>> 9) & 7, (hsh >>> 12) & 7, 14, 15, 20);
        if ((hsh & 7) === 0) dot((hsh >>> 15) & 6, (hsh >>> 18) & 7, -9, -8, -4, 2, 1);
      } else if (t === T.ICE) {
        // 冰面裂纹与闪晶
        if ((hsh & 3) === 0) {
          const cx = (hsh >>> 4) & 6;
          const cy = (hsh >>> 7) & 6;
          dot(cx, cy, -16, -20, -18, 1, 2);
          dot(Math.min(7, cx + 1), cy + 2, -14, -18, -16, 2, 1);
        }
        if ((hsh & 1) === 0) dot((hsh >>> 10) & 7, (hsh >>> 13) & 7, 24, 28, 32);
      } else if (t === T.MOUNTAIN || t === T.HILL) {
        // 山岩：竖向裂纹暗缝 + 受光立面亮块（VLM 复审反馈：细节密度过高呈「白色噪点」
        // → 门控降密：~55% 格裂纹、~25% 格亮面、深点稀少；hillshade 承担主体明暗）
        if ((hsh % 9) < 5) {
          const cx = (hsh >>> 3) & 7;
          const cy = (hsh >>> 6) & 5;
          dot(cx, cy, -20, -18, -16, 1, 3);
        }
        if ((hsh & 3) === 0) {
          const cx = (hsh >>> 3) & 7;
          const cy = (hsh >>> 6) & 5;
          dot(Math.max(0, cx - 2), cy + 1, 15, 14, 12, 2, 2);
        }
        if ((hsh & 15) === 0) dot((hsh >>> 12) & 7, (hsh >>> 15) & 7, -30, -28, -26);
      } else if (t === T.LAVA) {
        // 熔岩：暗色结壳 + 亮橙流纹裂缝（块状对比，拒绝噪点）
        const cx = (hsh >>> 3) & 5;
        const cy = (hsh >>> 6) & 5;
        dot(cx, cy, -44, -28, -6, 3, 3);
        dot(cx + 3, cy, 56, 26, -8, 1, 2);
        dot(cx, cy + 3, 50, 22, -8, 2, 1);
      } else if (t === T.SWAMP) {
        // 沼泽：浑浊泥沼斑驳（暗水洼 + 浮藻亮斑）+ 芦苇深绿竖笔画 + 泥点 —— 湿地的斑驳语言
        if ((hsh & 3) !== 3) {
          const mx = (hsh >>> 3) & 5;
          const my = (hsh >>> 6) & 5;
          dot(mx, my, -14, -10, -8, 3, 2);                                              // 暗色泥沼水洼
          if ((hsh & 1) === 0) dot((hsh >>> 9) & 6, (hsh >>> 12) & 6, 10, 8, -6, 2, 1); // 浮藻亮斑
        }
        // 芦苇：1×3 竖笔画（~44% 格 1-2 根，深/浅二态）
        const reeds = (hsh % 9) < 4 ? 1 + ((hsh >>> 20) & 1) : 0;
        for (let k = 0; k < reeds; k++) {
          const rx = (hsh >>> (k * 4 + 2)) & 7;
          const ry = (hsh >>> (k * 4 + 6)) & 5;
          const lit = ((hsh >>> (k * 7)) & 1) === 1;
          dot(rx, ry, lit ? -26 : -40, lit ? -22 : -32, lit ? -6 : -12, 1, 3);
        }
        // 泥点（~6% 格：棕褐泥渍）
        if (hsh % 16 === 0) dot((hsh >>> 14) & 7, (hsh >>> 18) & 7, -6, -20, -10);
        // 邻水过渡：邻水一侧的暗色湿泥带（潮线侵蚀痕迹；陆侧过渡由 SOFT_TERRAIN 抖动承担）
        const xLw = tx > 0 && isWater(this.terrain[i - 1]);
        const xRw = tx < W - 1 && isWater(this.terrain[i + 1]);
        const yTw = ty > 0 && isWater(this.terrain[i - W]);
        const yBw = ty < H - 1 && isWater(this.terrain[i + W]);
        if (xLw || xRw || yTw || yBw) {
          if (xLw) dot(0, 0, -20, -14, -10, 1, 8);
          if (xRw) dot(7, 0, -20, -14, -10, 1, 8);
          if (yTw) dot(0, 0, -20, -14, -10, 8, 1);
          if (yBw) dot(0, 7, -20, -14, -10, 8, 1);
        }
      } else if (t === T.BURNT) {
        // 焦土余烬：灰烬点 + 偶发暗火
        dot((hsh >>> 4) & 7, (hsh >>> 6) & 7, -12, -10, -6, 2, 1);
        if ((hsh & 3) === 0) dot((hsh >>> 9) & 7, (hsh >>> 11) & 7, 30, 10, -6);
      }
    }
    this.dirty.clear();
    if (bmaxX >= 0) {
      const bx = bminX * 8, by = bminY * 8, bw = (bmaxX - bminX + 1) * 8, bh = (bmaxY - bminY + 1) * 8;
      this.terrainCtx.putImageData(this.terrainImg, 0, 0, bx, by, bw, bh);
      // Task 71 静态层脏盒（设备像素；多次 flush 在 render 消费前持续求并集）
      const p = this.terrainFlushBox;
      this.terrainFlushBox = p
        ? {
            x: Math.min(p.x, bx), y: Math.min(p.y, by),
            w: Math.max(p.x + p.w, bx + bw) - Math.min(p.x, bx),
            h: Math.max(p.y + p.h, by + bh) - Math.min(p.y, by),
          }
        : { x: bx, y: by, w: bw, h: bh };
    }
  }

  flushProps() {
    if (this.propsDirty.size === 0) return;
    const { propsCtx } = this;
    // Task 71 静态层脏盒：道具绘制以 4px/格 用户坐标 ×2 变换落在 2048 设备画布上，
    // clearRect 覆盖 (x*4-2, y*4-3, 9, 10) 用户区 → 设备 (x*8-4, y*8-6)~(x*8+14, y*8+14)，
    // 树/山等精灵可能略溢出 → 统一外扩 8 设备像素的安全垫
    let pminX = W, pminY = H, pmaxX = -1, pmaxY = -1;
    for (const i of this.propsDirty) {
      const x = i % W;
      const y = (i / W) | 0;
      if (x < pminX) pminX = x;
      if (x > pmaxX) pmaxX = x;
      if (y < pminY) pminY = y;
      if (y > pmaxY) pmaxY = y;
      propsCtx.clearRect(x * 4 - 2, y * 4 - 3, 9, 10);
      const tt = this.terrain[i];
      if (tt === T.FOREST) {
        // import lazily to avoid cycle at module load
        sprites.drawTree(propsCtx, x, y, this.variant[i], this.nature.season);
      } else if (tt === T.MOUNTAIN) {
        // 雪帽=海拔+寒冷度：variant 伪海拔 150-199，cold=纬度极值+冬增夏减（极地全雪冠，赤道仅高峰）
        const polar = Math.abs(y / H - 0.5) * 2;
        const cold = Math.min(1, polar * 1.1 + (this.nature.season === 3 ? 0.25 : this.nature.season === 1 ? -0.1 : 0.05));
        sprites.drawMountainProp(propsCtx, x, y, this.variant[i], 150 + (this.variant[i] % 50), cold);
      } else if (this.road[i] > 0) {
        // —— 土路：碎石与车辙点缀（夯实的路感） ——
        const h = (this.variant[i] * 2654435761) >>> 0;
        if (h % 3 === 0) {
          propsCtx.fillStyle = 'rgba(120,102,74,0.85)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + ((h >> 1) & 1), 1, 1);
          if (h % 6 === 0) {
            propsCtx.fillStyle = 'rgba(160,142,110,0.8)';
            propsCtx.fillRect(x * 4 + 1 - (h & 1), y * 4 + 1 - ((h >> 1) & 1), 1, 1);
          }
        }
      } else if (tt === T.GRASS) {
        // —— 草地生境：野花/草簇/石子（variant 哈希确定性，一劳永逸 bake） ——
        const h = (this.variant[i] * 2654435761 + i * 40503) >>> 0;
        const m = h % 31;
        if (m < 3) {
          const FLOWER = ['#e5696d', '#ffd93d', '#f2ead8', '#c793e8'];
          propsCtx.fillStyle = FLOWER[(h >> 5) & 3];
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
        } else if (m < 10) {
          propsCtx.fillStyle = 'rgba(44,84,28,0.6)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4, 1, 2);
          propsCtx.fillStyle = 'rgba(70,120,44,0.55)';
          propsCtx.fillRect(x * 4 + 1 - (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
        } else if (m === 10) {
          propsCtx.fillStyle = 'rgba(148,144,136,0.8)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + ((h >> 4) & 1), 1, 1);
        }
      } else if (tt === T.SAND) {
        // —— 沙地：风蚀沙纹与零星沙砾 ——
        const h = (this.variant[i] * 2654435761 + i * 9127) >>> 0;
        if (h % 13 === 0) {
          propsCtx.fillStyle = 'rgba(238,222,168,0.55)';
          propsCtx.fillRect(x * 4, y * 4 + (h & 1), 2, 1);
          propsCtx.fillStyle = 'rgba(214,192,140,0.5)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + 1 - (h & 1), 1, 1);
        } else if (h % 37 === 0) {
          propsCtx.fillStyle = 'rgba(178,158,120,0.7)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
        }
      } else if (tt === T.HILL) {
        // —— 丘陵：干草丛与岩屑 ——
        const h = (this.variant[i] * 2654435761 + i * 7907) >>> 0;
        if (h % 17 === 0) {
          propsCtx.fillStyle = 'rgba(96,104,54,0.6)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4, 1, 2);
        } else if (h % 41 === 0) {
          propsCtx.fillStyle = 'rgba(118,116,110,0.7)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
        }
      } else if (tt === T.SNOW) {
        // —— 雪原：冰晶闪点 ——
        const h = (this.variant[i] * 2654435761 + i * 1543) >>> 0;
        if (h % 19 === 0) {
          propsCtx.fillStyle = 'rgba(222,240,252,0.85)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
        }
      } else if (tt === T.BURNT) {
        // —— 焦土：炭化残枝 ——
        const h = (this.variant[i] * 2654435761 + i * 3571) >>> 0;
        if (h % 11 === 0) {
          propsCtx.fillStyle = 'rgba(28,22,18,0.7)';
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
          propsCtx.fillRect(x * 4 + (h & 1), y * 4 + 1 - ((h >> 2) & 1), 1, 1);
        }
      }
      // —— 冬季雪人（Task 104）：村民堆起的雪人装饰。雪原白底上以色温差立形：
      //  冷蓝白底球+底缘阴影、暖白头、双煤眼+胡萝卜鼻、枝手探出；
      //  Task 113：冷调暗环描边——夜间雪原与雪人同色系难辨，1px 幽蓝轮廓昼夜皆立形 ——
      if (this.snowman[i]) {
        const px = x * 4;
        propsCtx.fillStyle = 'rgba(52,70,92,0.42)';
        propsCtx.fillRect(px, y * 4 + 1, 1, 3); // 左缘
        propsCtx.fillRect(px + 3, y * 4 + 1, 1, 3); // 右缘
        propsCtx.fillRect(px + 1, y * 4 - 1, 2, 1); // 顶缘
        propsCtx.fillRect(px + 1, y * 4 + 4, 2, 1); // 底缘落地影
        propsCtx.fillStyle = 'rgba(96,74,50,0.9)';
        propsCtx.fillRect(px, y * 4 + 2, 1, 1);
        propsCtx.fillRect(px + 3, y * 4 + 2, 1, 1);
        propsCtx.fillStyle = '#dbe9f4';
        propsCtx.fillRect(px + 1, y * 4 + 2, 2, 2);
        propsCtx.fillStyle = 'rgba(150,180,205,0.65)';
        propsCtx.fillRect(px + 1, y * 4 + 3, 2, 1);
        propsCtx.fillStyle = '#f4f9fd';
        propsCtx.fillRect(px + 1, y * 4, 2, 2);
        // 单煤眼（2px 头双眼会吞满顶行读作黑发）+ 胡萝卜鼻
        propsCtx.fillStyle = '#3a3226';
        propsCtx.fillRect(px + 1, y * 4, 1, 1);
        propsCtx.fillStyle = '#e08a3c';
        propsCtx.fillRect(px + 2, y * 4 + 1, 1, 1);
      }
    }
    this.propsDirty.clear();
    // Task 71 静态层脏盒落账（设备像素；安全垫 8px 覆盖精灵溢出；render 消费前持续求并集）
    if (pmaxX >= 0) {
      const bx = Math.max(0, pminX * 8 - 12), by = Math.max(0, pminY * 8 - 14);
      const bx1 = Math.min(W * 8, pmaxX * 8 + 22), by1 = Math.min(H * 8, pmaxY * 8 + 22);
      const bw = bx1 - bx, bh = by1 - by;
      if (bw > 0 && bh > 0) {
        const p = this.propsFlushBox;
        this.propsFlushBox = p
          ? {
              x: Math.min(p.x, bx), y: Math.min(p.y, by),
              w: Math.max(p.x + p.w, bx + bw) - Math.min(p.x, bx),
              h: Math.max(p.y + p.h, by + bh) - Math.min(p.y, by),
            }
          : { x: bx, y: by, w: bw, h: bh };
      }
    }
  }

  getUnitInfo(id: number) {
    const u = this.unitById.get(id);
    if (!u) return null;
    const jobDef = u.job != null ? JOBS[u.job] : null;
    return {
      ...u,
      raceName: RACES[u.race].name,
      civName: u.civ >= 0 && this.civs[u.civ] ? this.civs[u.civ].name : null,
      civColor: u.civ >= 0 && this.civs[u.civ] ? this.civs[u.civ].colorHex : null,
      traitName: u.trait ? TRAITS[u.trait]?.name : null,
      traitDesc: u.trait ? TRAITS[u.trait]?.desc : null,
      jobName: jobDef?.name ?? null,
      jobDesc: jobDef?.desc ?? null,
      ageYears: Math.floor(u.age),
      isCiv: RACES[u.race].isCiv,
    };
  }

  getCivInfo(id: number) {
    const c = this.civs[id];
    if (!c || !c.alive) return null;
    const wars: string[] = [];
    for (const o of this.civs) {
      if (o.alive && o.id !== c.id && this.atWar(c.id, o.id)) wars.push(o.name);
    }
    let tiles = 0;
    for (const i of c.tiles) if (this.owner[i] === c.id) tiles++;
    const cap = c.capital >= 0 ? this.buildings.find((b) => b.i === c.capital) : undefined;
    const counts = this.civBuildCounts.get(c.id);
    const builds: { kind: number; n: number }[] = [];
    if (counts) {
      for (let k = 1; k < BUILDING_DEFS.length; k++) if (counts[k]) builds.push({ kind: k, n: counts[k] });
    }
    let army = 0;
    let armedN = 0;
    let popN = 0;
    for (const u of this.units) {
      if (u.dead || u.civ !== c.id) continue;
      if (u.job === 2 || u.job === 3) army++;
      if (!u.boat) {
        popN++;
        if (u.wep) armedN++;
      }
    }
    // —— 动态战线统计：本国正在渗透的敌土 / 本国正被渗透的国土 ——
    let occPushing = 0;
    let occPushStr = 0;
    let occLosing = 0;
    for (const i of this.occSet) {
      const oc = this.occCiv[i];
      if (oc === c.id) { occPushing++; occPushStr += this.occStr[i]; }
      else if (this.owner[i] === c.id) occLosing++;
    }
    return {
      ...c,
      tiles,
      wars,
      occPushing,
      occPushAvg: occPushing > 0 ? Math.round(occPushStr / occPushing) : 0,
      occLosing,
      raceName: RACES[c.race].name,
      raceArchetype: RACES[c.race]?.archetype ?? '',
      allianceId: (() => { const al = this.allianceOfCiv(c.id); return al ? al.id : -1; })(),
      allianceName: (() => { const al = this.allianceOfCiv(c.id); return al ? al.name : ''; })(),
      allianceCohesion: (() => { const al = this.allianceOfCiv(c.id); return al ? Math.round(al.cohesion) : 0; })(),
      allianceMembers: (() => { const al = this.allianceOfCiv(c.id); return al ? al.members.filter((m) => m !== c.id && this.civs[m]?.alive).map((m) => this.civs[m]!.name) : []; })(),
      capitalPos: cap ? { x: cap.x, y: cap.y } : null,
      houseCap: this.popCapOf(c),
      gold: Math.floor(c.gold ?? 0),
      knowledge: Math.floor(c.knowledge ?? 0),
      army,
      armedRate: popN > 0 ? Math.round((armedN / popN) * 100) : 0, // 持械率（军备时代 ≠ 全民国兵——真实兑现度一目了然）
      ideas: (c.ideas ?? []).map((k) => this.emIdeas.get(k)?.name ?? k), // 已采纳的涌现理念（CivPanel 徽章列）
      builds,
      // —— 科技与社会（CivPanel 深入数据）——
      techs: [...(c.techs ?? [])],
      techCount: (c.techs ?? []).length,
      research: c.research,
      researchP: c.researchP ?? 0,
      researchNeed: c.research ? TECH_BY_KEY[c.research]?.cost ?? 0 : 0,
      gov: c.gov ?? 0,
      govName: GOV_DEFS[c.gov ?? 0]?.name ?? '部落制',
      govDesc: GOV_DEFS[c.gov ?? 0]?.desc ?? '',
      govBonus: GOV_DEFS[c.gov ?? 0]?.bonus ?? '',
      govYear: c.govYear ?? 0,
      stability: Math.round(c.stability ?? 70),
      culture: Math.round(c.culture ?? 0),
      militarism: Math.round(c.militarism ?? 30),
      income: Math.round(c.income ?? 0),
      expense: Math.round(c.expense ?? 0),
      // —— 军备/房屋阶位（科技深度绑定）——
      armament: this.armamentOf(c),
      armamentName: ['木石时代', '青铜时代', '铁器时代', '钢铁时代', '火器时代', '现代军备', '未来军备'][this.armamentOf(c)],
      houseTier: this.houseTierOf(c),
      houseTierName: ['茅屋村', '石砌村', '堡垒宅', '哥特庄园'][this.houseTierOf(c)],
    };
  }

  regenerate(seed?: number, params?: WorldGenParams) {
    this.generate(seed ?? Math.floor(Math.random() * 1e9), params);
    this.statsTick();
  }

  // ---------------- 开发者模式（Dev Mode） ----------------
  /** 开发者面板：全量内部统计 */
  devStats() {
    return {
      year: Math.floor(this.yearF),
      tick: this.tickCount,
      tickMs: Math.round(this.tickMs * 100) / 100,
      units: this.units.length,
      buildings: this.buildings.length,
      effects: this.effects.length,
      civs: this.civs.filter((c) => c.alive).length,
      wars: [...this.rel.values()].filter((v) => v < -20).length, // 每对关系单条目：无需除 2
      totalWars: this.totalWars.size,
      items: this.items.length,
      triggers: this.triggers.length,
      fires: this.fireSet.size,
      seed: this.seed,
      armies: this.armies.length,
      directives: this.directives.filter((d) => d.status === 'active').length,
      // —— 修复防灾 / 科技社会 ——
      firesOut: this.firesOut,
      repairsDone: this.repairsDone,
      damaged: this.damagedSet.size,
      techsKnown: this.civs.reduce((n, c) => n + (c.alive ? (c.techs ?? []).length : 0), 0),
      researching: this.civs.filter((c) => c.alive && c.research).length,
      // —— 涌现层（武器铸造/动态物种）——
      emergentWeapons: [...this.emergentWeapons.values()].filter((w) => !w.retired).length,
      emergentKills: [...this.emergentWeapons.values()].reduce((n, w) => n + w.kills, 0),
      dynSpecies: this.dynRaces.size,
    };
  }

  /** 开发者：立即完成当前在研科技（无在研则自动选题并完成） */
  devResearch(civId: number): string | null {
    const c = this.civs[civId];
    if (!c?.alive) return null;
    let key = c.research;
    if (!key) {
      key = this.pickResearch(c);
      if (!key) return null;
      c.research = key;
      c.researchP = 0;
    }
    this.completeTech(c, key);
    return key;
  }

  /** 开发者：直接设定政体 */
  devSetGov(civId: number, gov: number): boolean {
    const c = this.civs[civId];
    if (!c?.alive) return false;
    this.setGov(c, Math.max(0, Math.min(GOV_DEFS.length - 1, Math.round(gov))), 'evolve');
    return true;
  }

  /** 旧装备字段迁移：trk → bts/rng（读档兼容 v2 旧档） */
  migrateLegacyGear(u: Unit) {
    if (u.trk) {
      const d = ITEM_DEFS[u.trk];
      if (d) u[SLOT_FIELD[d.slot]] = u.trk;
      u.trk = null;
    }
    if (u.job == null) u.job = 0;
  }

  /** 开发者：直接修改单位属性（数值字段做安全夹取） */
  devSetUnit(id: number, patch: Partial<Unit>) {
    const u = this.unitById.get(id);
    if (!u) return null;
    const p = { ...patch };
    if (typeof p.hp === 'number') p.hp = Math.max(1, p.hp);
    if (typeof p.maxHp === 'number') p.maxHp = Math.max(1, p.maxHp);
    if (typeof p.dmg === 'number') p.dmg = Math.max(0, p.dmg);
    if (typeof p.speed === 'number') p.speed = Math.max(0.01, Math.min(1, p.speed));
    if (typeof p.kills === 'number') p.kills = Math.max(0, Math.round(p.kills));
    if (p.job !== undefined && typeof p.job === 'number') {
      this.setJob(u, Math.max(0, Math.min(JOBS.length - 1, Math.round(p.job))));
      delete p.job;
    }
    delete p.id;
    delete p.dead;
    Object.assign(u, p);
    return this.getUnitInfo(id);
  }

  /** 开发者：给单位配齐神装（每槽位最高阶） */
  devEquip(u: Unit) {
    for (const slot of SLOT_ORDER) {
      const key = BEST_BY_SLOT[slot];
      if (!key) continue;
      const field = SLOT_FIELD[slot];
      const cur = u[field] as string | null | undefined;
      const curDef = cur ? ITEM_DEFS[cur] : null;
      // 先退掉旧装备的属性贡献，再上新装（近似：只加新减旧）
      if (curDef) {
        if (curDef.dmg) u.dmg -= curDef.dmg;
        if (curDef.hp) { u.maxHp -= curDef.hp; u.hp = Math.min(u.maxHp, u.hp); }
        if (curDef.speedMul) u.speed /= curDef.speedMul;
      }
      const def = ITEM_DEFS[key];
      if (def.dmg) u.dmg += def.dmg;
      if (def.hp) { u.maxHp += def.hp; u.hp = u.maxHp; }
      if (def.speedMul) u.speed *= def.speedMul;
      u[field] = key as ItemKind;
    }
    this.fx('spawn', u.x, u.y, 30);
  }

  /** 开发者：卸下单位全部装备 */
  devUnequip(id: number) {
    const u = this.unitById.get(id);
    if (!u) return;
    for (const slot of SLOT_ORDER) {
      const field = SLOT_FIELD[slot];
      const cur = u[field] as string | null | undefined;
      const def = cur ? ITEM_DEFS[cur] : null;
      if (def) {
        if (def.dmg) u.dmg -= def.dmg;
        if (def.hp) { u.maxHp -= def.hp; u.hp = Math.min(u.maxHp, u.hp); }
        if (def.speedMul) u.speed /= def.speedMul;
      }
      u[field] = null;
    }
  }

  /** 开发者：在镜头中心生成冠军（神装战士，可直接选看） */
  devSpawnChampion(race = 0, job = 2) {
    const u = this.spawnUnit(race, this.cam.x, this.cam.y, { job, silent: true });
    if (u) {
      this.devEquip(u);
      u.kills = 0;
      this.toast(`冠军 ${u.name} 已降临`, 'good');
      this.fx('spawn', u.x, u.y, 34);
    }
    return u;
  }

  /** 开发者：强制两文明宣战（按局势挑选开战理由——战争必须有名有实） */
  devForceWar(a: number, b: number) {
    const ca = this.civs[a];
    const cb = this.civs[b];
    if (!ca?.alive || !cb?.alive || a === b) return false;
    const pick = this.pickCasus(ca, cb);
    return this.declareWar(pick.aggressor.id, pick.victim.id, pick.reason, { force: true }) != null;
  }

  /** 开发者：强制结盟（a+b 指定对；无参时自动挑关系最好的无盟对） */
  devAlliance(a = -1, b = -1): boolean {
    let ca: Civ | null = null;
    let cb: Civ | null = null;
    if (a >= 0 && b >= 0) {
      ca = this.civs[a] ?? null;
      cb = this.civs[b] ?? null;
    } else {
      // 自动挑选：无盟、已接触、关系最高的存活对
      let bestV = -Infinity;
      const alive = this.civs.filter((c) => c.alive && c.pop > 0 && !this.allianceOf.has(c.id));
      for (let i = 0; i < alive.length; i++) {
        for (let j = i + 1; j < alive.length; j++) {
          const key = pairKey(alive[i].id, alive[j].id);
          if (!this.met.has(key)) continue;
          const v = this.rel.get(key) ?? -100;
          if (v > bestV) { bestV = v; ca = alive[i]; cb = alive[j]; }
        }
      }
    }
    if (!ca?.alive || !cb?.alive || ca.id === cb.id) return false;
    if (this.atWar(ca.id, cb.id)) this.makePeace(ca.id, cb.id, `「${ca.name}」与「${cb.name}」化干戈为玉帛，携手结盟`, 55);
    const al = this.formAlliance(ca.pop >= cb.pop ? ca : cb, ca.pop >= cb.pop ? cb : ca);
    return al != null;
  }

  /** 开发者：解散所有联盟 */
  devDissolveAlliances(): number {
    let n = this.alliances.length;
    for (const al of [...this.alliances]) this.dissolveAlliance(al, `「${al.name}」奉神谕解散`);
    return n;
  }

  /** 开发者：强制停战 */
  devForcePeace(a: number, b: number) {
    const ca = this.civs[a];
    const cb = this.civs[b];
    if (!ca?.alive || !cb?.alive) return false;
    const key = pairKey(a, b);
    this.rel.set(key, 40);
    this.totalWars.delete(key);
    this.toast(`「${ca.name}」与「${cb.name}」缔造了和平`, 'peace');
    this.addEvent('peace', `神意降临：「${ca.name}」与「${cb.name}」签署停战协议`, { colorHex: ca.colorHex });
    return true;
  }

  /** 开发者：世界和平（清除全部战争关系） */
  devPeaceAll() {
    let n = 0;
    for (const [key, v] of this.rel) {
      if (v < -20) { this.rel.set(key, 30); n++; }
    }
    this.totalWars.clear();
    this.toast(n > 0 ? `神谕止战：${n / 2 | 0} 场战争宣告终结` : '世界本就和平', 'peace');
  }

  /** 开发者：吞并 —— a 吸收 b 的全部领土/建筑/国民，b 灭国 */
  devAnnexCiv(a: number, b: number) {
    const ca = this.civs[a];
    const cb = this.civs[b];
    if (!ca?.alive || !cb?.alive || a === b) return false;
    // 领土与建筑划转
    for (const i of cb.tiles) {
      if (this.owner[i] === b) {
        this.owner[i] = a;
        ca.tiles.push(i);
        this.markDirty(i);
      }
    }
    for (const bl of this.buildings) {
      if (bl.civ === b) {
        bl.civ = a;
        cb.houses--;
        ca.houses++;
        this.bHp.set(bl.i, BUILDING_DEFS[bl.kind]?.hp ?? 70);
      }
    }
    // 国民划转
    let moved = 0;
    for (const u of this.units) {
      if (!u.dead && u.civ === b) { u.civ = a; moved++; }
    }
    ca.pop += cb.pop;
    ca.gold = (ca.gold ?? 0) + (cb.gold ?? 0);
    ca.knowledge = (ca.knowledge ?? 0) + (cb.knowledge ?? 0);
    cb.pop = 0;
    this.eliminateCiv(cb);
    this.addEvent('capture', `「${ca.name}」吞并了「${cb.name}」——${moved} 名国民归入新旌之下`, { colorHex: ca.colorHex });
    if (this.overlayMode === 'political' || this.overlayMode === 'alliance') this.overlayDirty = true;
    return true;
  }

  /** 开发者：抹杀文明（全体国民死亡 + 灭国） */
  devKillCiv(id: number) {
    const c = this.civs[id];
    if (!c?.alive) return false;
    for (const u of this.units) {
      if (!u.dead && u.civ === id) u.dead = true;
    }
    c.pop = 0;
    this.eliminateCiv(c);
    return true;
  }

  /** 开发者：国库拨款 */
  devAddGold(id: number, n: number) {
    const c = this.civs[id];
    if (!c?.alive) return false;
    c.gold = (c.gold ?? 0) + n;
    this.toast(`「${c.name}」国库 +${n} 财富`, 'good');
    return true;
  }

  /** 开发者：世界级清算 */
  devClearFires() {
    this.fireSet.clear();
    this.fire.fill(0);
    this.radSet.clear();
    this.radiate.fill(0);
    for (let i = 0; i < W * H; i++) this.markDirty(i);
    this.toast('烈火与辐射尽数散去', 'good', true);
  }

  devClearUnits() {
    let n = 0;
    for (const u of this.units) {
      if (!u.dead) { u.dead = true; n++; }
    }
    this.toast(`${n} 名生灵归尘`, 'danger');
  }

  /** 开发者：时间跳跃（模拟推快 n 年，一步到位） */
  devJumpYears(n: number) {
    const steps = Math.max(0, Math.min(40, Math.round(n))) * YEAR_TICKS;
    for (let i = 0; i < steps; i++) this.tick();
    this.toast(`时光飞逝 ${Math.round(n)} 年`, 'info');
  }

  // ================== 神经决策核心（NeuroCore）：面板/QA 接口 ==================

  /** 神经决策核心运行快照（三头统计 + 训练验证指标） */
  neuroInfo() {
    return neuroSnapshot();
  }

  /** 神经决策核心开关（A/B 对照：关 = 教师策略回退，开 = 微型网络判定） */
  setNeuro(on: boolean) {
    setNeuroEnabled(on);
  }

  /** Task 37：flight 头策略源切换（'bc' 行为克隆 ↔ 'rl' PPO 强化学习版）—— 面板与 QA 共用 */
  neuroSetFlightMode(mode: 'bc' | 'rl') {
    setFlightMode(mode);
    return neuroSnapshot().flightMode;
  }

  // ================== 在线局后训练（Task 38）：面板/QA 接口 ==================

  /** 在线训练快照（采集/Worker/上线历史/快照栈） */
  onlineFlightInfo(): OnlineSnapshot {
    return onlineSnapshot();
  }

  /** 在线训练开关（默认关；开启 = 引擎采集 → Worker 训练 → 评估门上线） */
  setOnlineFlight(on: boolean) {
    setOnline(on);
    return onlineSnapshot().enabled;
  }

  /** 学习强度（保守/均衡/激进 —— 切换同时解除自动回退暂停） */
  setOnlineFlightIntensity(i: Intensity) {
    setIntensity(i);
    return onlineSnapshot().intensity;
  }

  /** 一键回滚到快照栈第 i 份（0 = 最近） */
  rollbackFlightOnline(i: number) {
    return onlineRollback(i, true);
  }

  /** 丢弃全部在线增量，重置为离线导出权重 */
  resetFlightOnline() {
    return resetToOffline();
  }

  /** 固定评估种子（QA 可复现） */
  devSetOnlineEvalSeed(seed: number) {
    setEvalSeed(seed);
  }

  /** QA：flight 头单次前向（合成 on-policy 经验用：返回动作 + 生产权重 logp） */
  devFlightForward(f: number[]) {
    const act = neuroFlight(f);
    return { action: act, logp0: flightLastLogp[0], logp1: flightLastLogp[1] };
  }

  /** QA：直接注入合成遭遇战经验（跳过引擎采集，验证 Worker→评估门→上线全链路） */
  devInjectFlightEpisodes(eps: {
    n: number;
    states: number[];
    actions: number[];
    teacherActions: number[];
    oldLogps: number[];
    rewards: number[];
    dones: number[];
    outcome: string;
  }[]) {
    const packets = eps.map((e) => ({
      n: e.n,
      states: Float32Array.from(e.states),
      actions: Uint8Array.from(e.actions),
      teacherActions: Uint8Array.from(e.teacherActions),
      oldLogps: Float32Array.from(e.oldLogps),
      rewards: Float32Array.from(e.rewards),
      dones: Uint8Array.from(e.dones),
      outcome: e.outcome as 'kill' | 'escape' | 'killed' | 'starved' | 'timeout',
    }));
    qaInjectEpisodes(packets);
    return { injected: packets.length };
  }

  // ================== 开发者模式扩展（30+ 功能：文明级 / 开发级） ==================

  // —— 军团控制（开发级） ——
  /** 开发者：强制组建军团（civ 对 target 宣战并集结方阵） */
  devFormArmy(civId: number, targetCiv?: number): Army | null {
    const civ = this.civs[civId];
    if (!civ?.alive) return null;
    if (targetCiv != null && targetCiv >= 0 && targetCiv !== civId) {
      if (!this.atWar(civId, targetCiv)) this.devForceWar(civId, targetCiv);
    }
    const a = this.tryFormArmy(civ, targetCiv);
    if (!a) this.toast('军团集结失败（兵员不足/冷却中/无战事）', 'danger', true);
    return a;
  }

  /** 开发者：解散指定军团 */
  devDisbandArmy(armyId: number): boolean {
    const a = this.armies.find((x) => x.id === armyId);
    if (!a) return false;
    this.disbandArmy(a, false);
    return true;
  }

  /** 开发者：设定军团士气 */
  devSetMorale(armyId: number, v: number): boolean {
    const a = this.armies.find((x) => x.id === armyId);
    if (!a) return false;
    a.morale = Math.max(0, Math.min(100, v));
    return true;
  }

  /** 开发者：强制溃退 */
  devForceRout(armyId: number): boolean {
    const a = this.armies.find((x) => x.id === armyId);
    if (!a) return false;
    this.routArmy(a);
    return true;
  }

  /** 开发者：军团列表信息 */
  devArmiesInfo() {
    return this.armies.map((a) => ({
      id: a.id, name: a.name, civ: a.civ, civName: this.civs[a.civ]?.name ?? '?',
      size: a.members.length, size0: a.size0, morale: Math.round(a.morale),
      state: a.state, kills: a.kills, losses: a.losses,
      x: Math.round(a.x), y: Math.round(a.y), naval: !!a.naval,
    }));
  }

  // —— 文明旨意（文明级：文明自行达成，可能失败） ——
  /** 颁布旨意 */
  devDecree(civId: number, kind: DirectiveKind, param = 0, target?: number): Directive | null {
    return this.issueDirective(civId, kind, param, target);
  }

  /** 撤销旨意 */
  devRevokeDecree(id: number): boolean {
    const d = this.directives.find((x) => x.id === id);
    if (!d || d.status !== 'active') return false;
    this.finishDirective(d, 'failed', '神意收回，旨意撤销');
    this.toast('旨意已撤销', 'info');
    return true;
  }

  /** 旨意列表 */
  devDirectivesInfo() {
    return this.directives.map((d) => ({
      id: d.id, civ: d.civ, civName: this.civs[d.civ]?.name ?? '?',
      kind: d.kind, text: d.text, status: d.status,
      progress: Math.round(this.directiveProgressOf(d) * 100),
    }));
  }

  // —— 总动员 ——
  /** 开发者：全民皆兵（限期） */
  devMobilize(civId: number, years = 20): boolean {
    const civ = this.civs[civId];
    if (!civ?.alive) return false;
    civ.mobilizeUntil = this.tickCount + years * YEAR_TICKS;
    let armed = 0;
    for (const u of this.units) {
      if (u.dead || u.civ !== civId) continue;
      const job = u.job ?? 0;
      if (job === 0 || job === 1 || job === 5) { this.setJob(u, 2); armed++; }
    }
    this.addEvent('war', `「${civ.name}」总动员！${armed} 名国民放下锄头拿起长剑`, { colorHex: civ.colorHex });
    return true;
  }

  /** 开发者：解除动员（恢复生产） */
  devDemobilize(civId: number): boolean {
    const civ = this.civs[civId];
    if (!civ?.alive) return false;
    civ.mobilizeUntil = 0;
    let n = 0;
    for (const u of this.units) {
      if (u.dead || u.civ !== civId) continue;
      if ((u.job ?? 0) === 2 && u.army == null && this.rng() < 0.4) { this.setJob(u, 0); n++; }
    }
    this.toast(`「${civ.name}」解甲归田（${n} 人复员）`, 'peace');
    return true;
  }

  // —— 战争工具 ——
  /** 开发者：直接发动灭国战争（理由=灭国，目的=摧毁敌国） */
  devTotalWar(a: number, b: number): boolean {
    const ca = this.civs[a];
    const cb = this.civs[b];
    if (!ca?.alive || !cb?.alive || a === b) return false;
    return this.declareWar(a, b, 'annex', { force: true }) != null;
  }

  /** 开发者：世界大战（所有在世文明互相宣战） */
  devWorldWar(): number {
    const alive = this.civs.filter((c) => c.alive);
    let n = 0;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        if (this.devForceWar(alive[i].id, alive[j].id)) n++;
      }
    }
    this.toast(n > 0 ? `世界大战爆发：${n} 条战线同时点燃` : '世上只有一个王国，无从大战', n > 0 ? 'war' : 'info');
    if (n > 0) this.shake = Math.max(this.shake, 6);
    return n;
  }

  // —— 单位工具 ——
  /** 开发者：击杀单位 */
  devKillUnit(id: number): boolean {
    const u = this.unitById.get(id);
    if (!u || u.dead) return false;
    u.dead = true;
    return true;
  }

  /** 开发者：治疗单位（满血+去病） */
  devHealUnit(id: number): boolean {
    const u = this.unitById.get(id);
    if (!u || u.dead) return false;
    u.hp = u.maxHp;
    u.infected = false;
    this.fx('heart', u.x, u.y - 1, 30);
    return true;
  }

  /** 开发者：传送单位到世界坐标 */
  devTeleportUnit(id: number, x: number, y: number): boolean {
    const u = this.unitById.get(id);
    if (!u || u.dead) return false;
    const s = this.nearestStandable(Math.floor(x), Math.floor(y));
    u.x = s.x + 0.5; u.y = s.y + 0.5;
    u.lx = u.x; u.ly = u.y;
    u.tx = u.x; u.ty = u.y;
    this.fx('spawn', u.x, u.y, 24);
    return true;
  }

  /** 开发者：给单位全套神装 */
  devEquipUnit(id: number): boolean {
    WBB.touchMeta(); // Stage 3：神装/特质写入收口
    const u = this.unitById.get(id);
    if (!u || u.dead) return false;
    this.devEquip(u);
    this.toast(`${u.name} 已获神装`, 'good');
    return true;
  }

  /** 开发者：在镜头中心生成 n 个某种族 */
  /** 上帝之手：直接改写单位特质（特质编辑器；属性随新旧特质等比迁移，即时生效） */
  devSetTrait(unitId: number, key: string | null): boolean {
    const u = this.unitById.get(unitId);
    if (!u || u.dead) return false;
    const old = u.trait ? TRAITS[u.trait] : null;
    const nw = key && key !== u.trait ? TRAITS[key] : null;
    if (old) {
      if (old.speedMul) u.speed /= old.speedMul;
      if (old.hpMul) { u.maxHp /= old.hpMul; u.hp = Math.min(u.maxHp, u.hp / old.hpMul); }
      if (old.dmgMul) u.dmg /= old.dmgMul;
    }
    if (nw) {
      if (nw.speedMul) u.speed *= nw.speedMul;
      if (nw.hpMul) { u.maxHp *= nw.hpMul; u.hp *= nw.hpMul; }
      if (nw.dmgMul) u.dmg *= nw.dmgMul;
    }
    u.trait = nw ? nw.key : null;
    this.fx('bless', u.x, u.y - 0.6, 22);
    return true;
  }

  devSpawnRace(race: number, n: number): number {
    let spawned = 0;
    for (let i = 0; i < Math.max(1, Math.min(30, n)); i++) {
      const x = this.cam.x + this.rng() * 6 - 3;
      const y = this.cam.y + this.rng() * 6 - 3;
      if (this.spawnUnit(race, x, y, { silent: true })) spawned++;
    }
    this.toast(`已生成 ${spawned} × ${RACES[race]?.name ?? '?'}`, 'info');
    return spawned;
  }

  // —— 世界工具 ——
  /** 开发者：注入知识 */
  devAddKnowledge(civId: number, n: number): boolean {
    const c = this.civs[civId];
    if (!c?.alive) return false;
    c.knowledge = (c.knowledge ?? 0) + n;
    this.toast(`「${c.name}」知识 +${n}`, 'good');
    return true;
  }

  /** 开发者：修复全部建筑（耐久回满） */
  devRenewBuildings(): number {
    let n = 0;
    for (const b of this.buildings) {
      this.bHp.set(b.i, Math.round((BUILDING_DEFS[b.kind]?.hp ?? 70) * this.techModsOf(b.civ).bhp));
      this.damagedSet.delete(b.i);
      n++;
    }
    this.toast(`神迹降临：${n} 座建筑焕然一新`, 'good');
    return n;
  }

  /** 开发者：镜头中心火雨（n 颗陨石） */
  devRainFire(n: number): number {
    let cast = 0;
    for (let i = 0; i < Math.max(1, Math.min(20, n)); i++) {
      const x = this.cam.x + this.rng() * 14 - 7;
      const y = this.cam.y + this.rng() * 14 - 7;
      this.applyTool('meteor', x, y);
      cast++;
    }
    this.toast(`天降火雨 ×${cast}`, 'danger');
    return cast;
  }

  /** 开发者：减半众生（人口调控） */
  devCullHalf(): number {
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (this.rng() < 0.5) { u.dead = true; n++; }
    }
    this.toast(`神罚降临：${n} 名生灵归尘`, 'danger');
    return n;
  }

  /** 开发者：清除血迹/尸骸（画面净化） */
  devClearDecals(): number {
    const n = this.blood.length + this.corpses.length;
    this.blood.length = 0;
    this.corpses.length = 0;
    this.toast('战场涤净', 'good', true);
    return n;
  }

  /** 开发者：切换世界法则 */
  devSetLaw(law: keyof WorldLaws, v: boolean): boolean {
    if (!(law in this.laws)) return false;
    (this.laws as unknown as Record<string, boolean>)[law] = v;
    this.toast(`世界法则「${law}」→ ${v ? '开' : '关'}`, 'info');
    return true;
  }

  /** 开发者：读取世界法则 */
  devGetLaws(): WorldLaws {
    return { ...this.laws };
  }

  killUnit(id: number) {
    const u = this.unitById.get(id);
    if (u) u.dead = true;
  }

  jumpTo(x: number, y: number) {
    this.cam.x = x;
    this.cam.y = y;
    this.followId = null;
    this.zoomAnim = null; // 跳转是瞬时定位，终止进行中的缩放滑行
    this.clampCam();
  }

  // ---------------- 世界存档 ----------------
  /** 序列化完整世界状态：地形 typed array 转 base64，单位/文明/建筑为 JSON */
  serialize(source: 'manual' | 'auto'): SaveDataV2 {
    // v2：RLE 压缩 + 列式单位数组 + variant 剔除（按 seed 确定性重算）
    // 注意 owner 是 Int16Array，需要按字节视图编码后再 RLE
    const ownerBytes = new Uint8Array(this.owner.buffer, this.owner.byteOffset, this.owner.byteLength);
    return {
      v: 2,
      savedAt: Date.now(),
      source,
      seed: this.seed,
      tickCount: this.tickCount,
      yearF: this.yearF,
      unitSeq: this.unitSeq,
      civSeq: this.civSeq,
      toastSeq: this.toastSeq,
      victoryCiv: this.victoryCiv,
      multiCivSeen: this.multiCivSeen,
      terrain: rleEncode(this.terrain),
      variant: '', // v2 不存 variant：读档按 seed 确定性重算（worldgen hash2 纯函数）
      owner: rleEncode(ownerBytes),
      building: rleEncode(this.building),
      fire: rleEncode(this.fire),
      radiate: rleEncode(this.radiate),
      regrow: [...this.regrow.entries()],
      radDue: [...this.radSet.entries()],
      u: unitsToRows(this.units),
      units: [], // 列式格式生效时此字段为空（metaFromData 读 u 优先）
      civs: this.civs.map((c) => ({ ...c, tiles: [...c.tiles], frontier: [...c.frontier], color: [...c.color] as [number, number, number] })),
      buildings: this.buildings.map((b) => ({ ...b })),
      rel: [...this.rel.entries()],
      met: [...this.met],
      cam: { ...this.cam },
      events: this.worldEvents.map((e) => ({ ...e })),
      eventSeq: this.eventSeq,
      river: rleEncode(this.riverDir),
      road: rleEncode(this.road),
      laws: { ...this.laws },
      items: this.items.map((it) => [it.id, it.kind, it.x, it.y] as [number, string, number, number]),
      itemSeq: this.itemSeq,
      triggers: this.triggers.map(triggerToRow),
      triggerSeq: this.triggerSeq,
      // 军团方阵 / 战争档案 / 文明旨意
      armies: this.armies.map((a) => ({ ...a, members: [...a.members] })),
      armySeq: this.armySeq,
      warData: [...this.warData.values()].map((w) => ({ ...w })),
      // 动态战线：活跃占领格稀疏编码 [tileIdx, civId, str]
      front: [...this.occSet].map((i) => [i, this.occCiv[i], this.occStr[i]] as [number, number, number]),
      warShame: [...this.warShame.entries()],
      directives: this.directives.map((d) => ({ ...d })),
      dirSeq: this.dirSeq,
      // 物种进化棘轮基线（[race, s, d, h, r, gen, sub?, beh?（逗号连接）]）
      speciesBase: [...this.speciesBase.entries()].map(([race, b]) => [race, b.gene.s, b.gene.d, b.gene.h, b.gene.r, b.gen, b.sub ?? '', (b.beh ?? []).join(',')] as [number, number, number, number, number, number, string?, string?]),
      // 终极世界大战状态 + 停战协议表
      worldWar: { ...this.worldWar, belligerents: [...this.worldWar.belligerents], fallen: this.worldWar.fallen.map((f) => ({ ...f })) },
      wwTruce: [...this.wwTruce.entries()],
      // 涌现层：动态物种注册表 + 涌现武器全谱系（读档时重注册/恢复） + 学说/防御（武器架构 v2）
      dyn: {
        races: [...this.dynRaces.entries()].map(([id, info]) => {
          const def = RACES[id];
          // v5 元组扩展：[11]=eco（0无/1捕食/2食草/3中立）[12]=cap [13]=maxAge [14]=flags（bit0文明 bit1敌意 bit2捕食）
          const ecoN = info.eco === 'pred' ? 1 : info.eco === 'herb' ? 2 : info.eco === 'neutral' ? 3 : 0;
          const flags = (def?.isCiv ? 1 : 0) | (def?.hostile ? 2 : 0) | (def?.predator ? 4 : 0);
          return [id, def?.name ?? `物种${id}`, info.parent, Math.round(def?.hp ?? 30), Math.round((def?.dmg ?? 5) * 10) / 10, Math.round((def?.speed ?? 0.06) * 1000) / 1000, Math.round((def?.repro ?? 0.002) * 10000) / 10000, GameEngine.DYN_TINTS.indexOf(def?.dynTint ?? ''), def?.vis ? visToTuple(def.vis) : undefined, info.parent2 ?? 0, ecoN, info.cap ?? 0, Math.round(def?.maxAge ?? 40), flags] as [number, string, number, number, number, number, number, number, number[]?, number?, number?, number?, number?, number?];
        }),
        weapons: [...this.emergentWeapons.values()].map((w) => ({ ...w })),
        dynSeq: this.dynSeq,
        weapSeq: this.weapSeq,
        dctr: [...this.doctrines.entries()].map(([id, d]) => [id, Math.round(d.precision * 100) / 100, Math.round(d.saturation * 100) / 100, Math.round(d.terror * 100) / 100, Math.round(d.attrition * 100) / 100] as [number, number, number, number, number]),
        ddef: [...this.defenses.entries()].map(([id, d]) => [id, Math.round(d.point), Math.round(d.armor), Math.round(d.evade)] as [number, number, number, number]),
        // v3：涌现特质注册表（读档时重新注入 TRAITS）
        trts: [...this.dynTraits.values()].map((t) => [t.key, t.name, Math.round((t.dmgMul ?? 1) * 100), Math.round((t.hpMul ?? 1) * 100), Math.round((t.speedMul ?? 1) * 100), Math.round((t.regen ?? 0) * 1000)] as [string, string, number, number, number, number]),
        traitSeq: this.traitSeq,
      },
      // v3：涌现科技/理念/进化图谱（无限涌现层的全量持久化）
      emT: [...this.emTechs.values()].map((t) => [t.key, t.name, TECH_CATS.findIndex((x) => x.key === t.cat), t.cost, t.gen, t.effects.map((e) => `${e.k}:${e.v}`).join(',')] as [string, string, number, number, number, string]),
      emI: [...this.emIdeas.values()].map((i) => [i.key, i.name, i.desc, Object.entries(i.mods).map(([k, v]) => `${k}:${v as number}`).join(',')] as [string, string, string, string]),
      evo: this.evoNodes.map((n) => [n.id, ['species', 'weapon', 'tech', 'trait', 'society'].indexOf(n.kind), n.year, n.parent ?? -1, n.name, n.colorHex, n.detail, n.stat ?? '', n.alive ? 1 : 0, n.meta ? JSON.stringify(n.meta) : ''] as [number, number, number, number, string, string, string, string, number, string]),
      evoSeq: this.evoSeq,
      // v39：涌现社会内核——家族谱系（单位 fam/fgn/gIds/gVal 已入列式行；panic 瞬态不入档自然消散）
      fams: [...this.families.values()].map((f) => [f.id, f.name, f.race, f.founded, f.founder, f.members, f.heroes, f.kills, f.peak, f.milestones] as [number, string, number, number, string, number, number, number, number, number]),
      familySeq: this.familySeq,
      // v40/v41：神谕 Agent 法则注册表（完整热载机制状态随存档走）+ 自定义计数器
      alws: this.agentLaws.laws,
      alwsSeq: this.agentLaws.seq,
      alwsCounters: this.agentLaws.counters,
      // 自然引擎：板块由 seed 确定性重生成，只存动态量（应力/风暴/灰烬/计数）
      nat: {
        stress: (() => {
          const rows: [number, number][] = [];
          for (const i of this.nature.boundary) {
            if (this.nature.stress[i] > 0.5) rows.push([i, Math.min(255, Math.round(this.nature.stress[i] * 8))]);
          }
          return rows.slice(0, 4096);
        })(),
        storms: this.nature.storms.map((st) => [st.id, Math.round(st.x * 10) / 10, Math.round(st.y * 10) / 10, Math.round(st.strength * 100) / 100, st.ttl, st.seed, st.kind === 'blizzard' ? 1 : 0, st.name.length, st.landed ? 1 : 0] as [number, number, number, number, number, number, number, number, number]),
        ash: Math.round(this.nature.ash * 1000) / 1000,
        seasonOffset: this.nature.seasonOffset,
        counters: [this.nature.counters.quakes, this.nature.counters.quakesBig, this.nature.counters.eruptions, this.nature.counters.uplifts, this.nature.counters.erosions, this.nature.counters.cyclones, this.nature.counters.tsunamis, this.nature.counters.floods, this.nature.counters.blizzards, this.nature.counters.droughts],
        stormSeq: this.nature.stormSeq,
        // v2：板块真实漂移接力（质心/构造期）+ 热点地幔柱 + 灰烬平流场
        pcx: this.nature.plateCx.map((v) => Math.round(v * 10) / 10),
        pcy: this.nature.plateCy.map((v) => Math.round(v * 10) / 10),
        pe: this.nature.plateEpoch,
        hot: this.nature.hotspots.map((h) => [h.x, h.y, Math.round(h.heat * 100) / 100] as [number, number, number]),
        ashF: (() => {
          const rows: [number, number][] = [];
          for (let i = 0; i < AW * AH; i++) if (this.nature.ashF[i] > 0.02) rows.push([i, Math.round(this.nature.ashF[i] * 200)]);
          return rows;
        })(),
      },
      // v4：联盟系统持久化（阵营实体 + 种族关系矩阵）
      als: this.alliances.map((al) => [al.id, al.name, al.members.join(','), al.leader, Math.round(al.cohesion), al.formedTick, al.formedYear, al.warsTogether, al.colorHex, al.bonded ? 1 : 0] as [number, string, string, number, number, number, number, number, string, number]),
      allianceSeq: this.allianceSeq,
      rrel: [...this.raceRel.entries()].map(([k, v]) => [k, Math.round(v)] as [string, number]),
      // v5：造物工坊——内置种族/物品原地覆写（世界内编辑持久化）+ 图鉴注册重链（uid → 种族 id）
      rmods: [...this.raceMods.entries()].filter(([rid]) => rid < 100),
      imods: [...this.itemMods.entries()],
      creg: [...this.creationRaceIds.entries()],
    };
  }

  /** 读档：恢复世界状态并全量重绘。数据损坏时抛错（由调用方捕获后 toast 提示）
   *  兼容 v1（base64 平铺）与 v2（RLE 压缩）两种格式 */
  applySave(data: SaveData): void {
    WBB.touchMeta(); // Stage 3：读档后全部行重建
    const version = data.v;
    if (version !== 1 && version !== 2) throw new Error(`不支持的存档版本: ${version}`);
    if (!Array.isArray(data.units) || !Array.isArray(data.civs) || !Array.isArray(data.buildings)) {
      throw new Error('存档数据结构损坏');
    }
    // 造物工坊：图鉴注册解除（下方 creg 重链）+ 覆写还原到出厂值（档内覆写稍后重放）
    this.creationRaceIds.clear();
    this.resetMods();
    // 解码地形数组（按版本选择解码器；长度校验在解码器内完成，失败即抛错）
    const isV2 = data.v === 2;
    const dec = (s: string, expect: number) => (isV2 ? rleDecode(s, expect) : b64ToBytes(s, expect));
    const terrain = dec(data.terrain, W * H);
    // v2 不存 variant（纯随机色彩抖动）：按 seed 确定性重算，与生成时一致（hash2 纯函数）
    const variant = isV2 ? new Uint8Array(W * H) : dec(data.variant, W * H);
    if (isV2) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) variant[y * W + x] = Math.floor(hash2(x, y, data.seed + 999) * 255);
    }
    const ownerBytes = dec(data.owner, W * H * 2);
    const owner = new Int16Array(ownerBytes.buffer, ownerBytes.byteOffset, W * H);
    const building = dec(data.building, W * H);
    const fire = dec(data.fire, W * H);
    const radiate = dec(data.radiate, W * H);

    // 恢复标量状态
    this.seed = data.seed;
    this.tickCount = data.tickCount;
    this.yearF = data.yearF;
    this.unitSeq = data.unitSeq;
    this.civSeq = data.civSeq;
    this.toastSeq = data.toastSeq;
    this.victoryCiv = data.victoryCiv;
    this.multiCivSeen = data.multiCivSeen;
    if (Number.isFinite(data.cam?.x) && Number.isFinite(data.cam?.y) && Number.isFinite(data.cam?.zoom)) {
      this.cam = { x: data.cam.x, y: data.cam.y, zoom: Math.max(1.2, Math.min(24, data.cam.zoom)) };
      this.zoomAnim = null;
    }
    // 随机数无法序列化闭包状态，用 seed+tick 重新播种即可
    this.rngA = ((this.seed ^ 0x9e3779b9) + this.tickCount) >>> 0;

    // —— v3 涌现层早期恢复（emTechs/emIdeas/evoNodes/dynTraits —— 必须先于文明处理：research 校验/加成缓存/理念表依赖） ——
    const v3s = data as SaveDataV2;
    this.emTechs.clear();
    this.emTechSeq = 1;
    for (const row of v3s.emT ?? []) {
      if (!Array.isArray(row) || row.length < 6) continue;
      const [key, name, catIdx, cost, gen, effCsv] = row;
      const effects = String(effCsv).split(',').filter((s) => s.includes(':')).map((s) => {
        const [k, v] = s.split(':');
        return { k: k as EmModKey, v: Number(v) || 0 };
      });
      const catDef = TECH_CATS[Math.max(0, Math.min(TECH_CATS.length - 1, catIdx | 0))];
      this.emTechs.set(String(key), { key: String(key), name: String(name), cat: catDef.key, cost: Math.max(10, Number(cost) || 120), gen: Math.max(1, Number(gen) || 1), effects, desc: '' });
      this.emTechSeq = Math.max(this.emTechSeq, Number(gen) + 1);
    }
    this.emIdeas.clear();
    this.ideaSeq = 1;
    this.ideaModCache.clear();
    for (const row of v3s.emI ?? []) {
      if (!Array.isArray(row) || row.length < 4) continue;
      const [key, name, desc, modsCsv] = row;
      const mods: IdeaDef['mods'] = {};
      for (const seg of String(modsCsv).split(',')) {
        if (!seg.includes(':')) continue;
        const [k, v] = seg.split(':');
        const num = Number(v) || 0;
        if (k === 'gold' || k === 'mil' || k === 'know' || k === 'repro' || k === 'wear') mods[k] = num;
        else if (k === 'stab') mods.stab = Math.round(num);
      }
      this.emIdeas.set(String(key), { key: String(key), name: String(name), desc: String(desc), mods });
      this.ideaSeq = Math.max(this.ideaSeq, parseInt(String(key).slice(2), 10) + 1 || 1);
    }
    for (const key of this.dynTraits.keys()) delete TRAITS[key];
    this.dynTraits.clear();
    this.traitSeq = 1;
    this.evoNodes = [];
    this.evoSeq = 1;
    this.evoIndex.clear();

    // 恢复 typed array（直接替换引用，避免逐格写入的 dirty 开销——稍后全量重绘）
    this.terrain = terrain;
    this.variant = variant;
    this.owner = owner;
    this.building = building;
    this.fire = fire;
    this.radiate = radiate;

    // 从数组重建派生集合
    this.fireSet.clear();
    for (let i = 0; i < this.fire.length; i++) if (this.fire[i] > 0) this.fireSet.add(i);
    // 重建冰面集合（瞬态不入档：读档后从地形扫描恢复，保证读档后的冰仍会消融）
    this.frozen.clear();
    for (let i = 0; i < this.terrain.length; i++) if (this.terrain[i] === T.ICE) this.frozen.add(i);
    // 瞬态 decals 清空（血迹/尸骸/洪水/湿沙不随存档走）
    this.blood.length = 0;
    this.corpses.length = 0;
    this.flood.clear();
    this.wet.clear();
    // 恢复河道流向场（可选字段：旧存档无河 → 全 0）
    const river = data.river ? dec(data.river, W * H) : new Uint8Array(W * H);
    this.riverDir = river;
    this.riverTiles.clear();
    for (let i = 0; i < river.length; i++) {
      if (river[i] > 0 && isWater(this.terrain[i])) this.riverTiles.add(i);
    }
    // 深度打磨：恢复道路网络（旧档无路 → 全 0，新建筑会重新铺设）
    this.road = ((data as SaveDataV2).road ? dec((data as SaveDataV2).road!, W * H) : new Uint8Array(W * H)) as Uint8Array<ArrayBuffer>;
    this.tradeNext.clear();
    this.marketIdx.clear();
    this.regrow.clear();
    for (const [i, at] of data.regrow) this.regrow.set(i, at);
    this.radSet.clear();
    for (const [i, at] of data.radDue) this.radSet.set(i, at);

    // 恢复实体列表与索引（v2 列式 u 优先，回退 v1 units；boat/colonizeCd 为可选字段补默认值）
    const savedUnits = data.v === 2 && Array.isArray(data.u) && data.u.length > 1 ? rowsToUnits(data.u) : data.units;
    if (!Array.isArray(savedUnits) || savedUnits.some((u) => typeof u.id !== 'number' || typeof u.race !== 'number')) throw new Error('存档单位数据损坏');
    this.units = savedUnits.map((u) => ({ ...u, boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0 }));
    // 存档兼容护栏：丢弃未知种族单位（跨版本枚举变更 / 动态种化失联 —— 否则 RACES[id] 越界崩溃）
    const unknownRace = this.units.filter((u) => !RACES[u.race]);
    if (unknownRace.length > 0) {
      console.warn(`[applySave] 丢弃 ${unknownRace.length} 个未知种族单位（id: ${[...new Set(unknownRace.map((u) => u.race))].join(',')}）—— 存档来自不同版本的种族枚举`);
      this.units = this.units.filter((u) => !!RACES[u.race]);
    }
    // 旧档迁移：trk 饰品槽 → bts/rng；job 缺省 0（平民）
    for (const u of this.units) this.migrateLegacyGear(u);
    this.unitById.clear();
    for (const u of this.units) this.unitById.set(u.id, u);
    // 野生动物分种族计数重建（增量维护的缓存：读档后一次性全量重算）
    this.wildCount.clear();
    for (const u of this.units) if (!u.dead && !RACES[u.race].isCiv) this.bumpWild(u.race, 1);
    this.civs = data.civs.map((c) => ({
      ...c,
      colonizeCd: c.colonizeCd ?? 0,
      history: c.history ?? [],
      gold: c.gold ?? 0,
      knowledge: c.knowledge ?? 0,
      // —— 科技与社会体系（旧档迁移默认值）——
      techs: c.techs ?? [],
      research: c.research ?? null,
      researchP: c.researchP ?? 0,
      gov: c.gov ?? 0,
      govYear: c.govYear ?? 0,
      stability: c.stability ?? 70,
      culture: c.culture ?? 0,
      militarism: c.militarism ?? 30,
      income: c.income ?? 0,
      expense: c.expense ?? 0,
      festivalCd: c.festivalCd ?? 0,
      ideas: c.ideas ?? [],
      tiles: [...c.tiles],
      frontier: [...c.frontier],
      color: [...c.color] as [number, number, number],
    }));
    // 科技/政体缓存重建 + 研究中的科技校验（防旧档脏数据；v3：涌现科技同样合法）
    this.techModCache.clear();
    this.govCache.clear();
    for (const c of this.civs) {
      if (c.research && !TECH_BY_KEY[c.research] && !this.emTechs.get(c.research)) { c.research = null; c.researchP = 0; }
      this.techModsOf(c.id); // v3：含涌现科技效果的完整重建
    }
    this.buildings = data.buildings.map((b) => ({ ...b }));
    this.bIdx.clear();
    this.buildings.forEach((b, i) => this.bIdx.set(b.i, i));
    this.rel.clear();
    for (const [k, v] of data.rel) this.rel.set(k, v);
    this.met.clear();
    for (const k of data.met) this.met.add(k);
    // 恢复世界纪事（可选字段：兼容无 events 的旧存档）
    this.worldEvents = (data.events ?? []).map((e) => ({ ...e }));
    this.eventSeq = data.eventSeq ?? (this.worldEvents[0]?.id ?? 0) + 1;
    this.zombieOutbreakNoted = (this.worldEvents.some((e) => e.kind === 'zombie') && (this.wildCount.get(R.ZOMBIE) ?? 0) >= 20);
    this.activeBattles.clear();
    this.onEvent?.(this.worldEvents);

    // 恢复世界法则与地面物品（可选字段：旧存档回退默认法则/空物品）
    this.laws = { ...DEFAULT_LAWS, ...(data.laws ?? {}) };
    this.items = (data.items ?? []).map((row) => ({ id: row[0], kind: row[1] as ItemKind, x: row[2], y: row[3] }));
    this.itemSeq = data.itemSeq ?? (this.items.reduce((m, it) => Math.max(m, it.id), 0) + 1);
    // 恢复事件触发器（可选字段：旧存档无触发器 → 空列表；损坏行抛错拒绝整档）
    this.triggers = (data.triggers ?? []).map(rowToTrigger);
    this.triggerSeq = data.triggerSeq ?? (this.triggers.reduce((m, t) => Math.max(m, t.id), 0) + 1);

    // 恢复军团方阵 / 战争档案 / 文明旨意（可选字段：旧存档回退空）
    this.armies = (data.armies ?? []).map((a) => ({ ...a, members: [...a.members], clashWith: undefined, battleSince: undefined }));
    this.armySeq = data.armySeq ?? (this.armies.reduce((m, a) => Math.max(m, a.id), 0) + 1);
    this.warData.clear();
    for (const w of data.warData ?? []) this.warData.set(w.key ?? pairKey(w.a ?? 0, w.b ?? 1), this.normalizeWarInfo(w));
    // 动态战线恢复（旧档缺省 → 空战线）
    this.occCiv.fill(-1);
    this.occStr.fill(0);
    this.occSet.clear();
    for (const [i, c, st] of (data as { front?: [number, number, number][] }).front ?? []) {
      if (i < 0 || i >= W * H || c < 0 || !this.civs[c]?.alive) continue;
      this.occCiv[i] = c;
      this.occStr[i] = Math.max(1, Math.min(99, st));
      this.occSet.add(i);
    }
    this.warShame.clear();
    for (const [k, v] of data.warShame ?? []) this.warShame.set(k, v);
    this.directives = (data.directives ?? []).map((d) => ({ ...d }));
    this.dirSeq = data.dirSeq ?? (this.directives.reduce((m, d) => Math.max(m, d.id), 0) + 1);
    // 物种进化棘轮基线恢复（旧档缺省 → 空 Map，全 1.0 基线自然回填；第 7 列亚种名/第 8 列涌现特质兼容缺省）
    this.speciesBase.clear();
    for (const row of data.speciesBase ?? []) {
      if (!Array.isArray(row) || row.length < 6) continue;
      this.speciesBase.set(row[0] | 0, {
        gene: { s: Number(row[1]) || 1, d: Number(row[2]) || 1, h: Number(row[3]) || 1, r: Number(row[4]) || 1 },
        gen: row[5] | 0,
        sub: row[6] || undefined,
        beh: row[7] ? String(row[7]).split(',').filter(Boolean) : undefined,
      });
    }
    // 涌现层恢复：动态物种重注册（父种族在前→链式种化可行）+ 涌现武器谱系
    for (const id of this.dynRaces.keys()) delete RACES[id];
    this.dynRaces.clear();
    this.enemyLut.clear(); // 读档重注册动态种族：属性可能与缓存时的同 ID 种族不同，敌意 LUT 必须重建
    WB.onWorldReset(this);
    WBB.onWorldReset(this); // WASM 内核同步失效（读档种族重注册 + 批内核表格重灌）
    this.emergentWeapons.clear();
    this.doctrines.clear();
    this.defenses.clear();
    CIV_RACES.length = 0;
    CIV_RACES.push(...GameEngine.BASE_CIV_RACES); // 文明种族表复原（种化的新文明种族在下方重注册）
    invalidateVisCache();
    const dynSave = (data as SaveDataV2).dyn;
    if (isV2 && dynSave && typeof dynSave === 'object' && Array.isArray(dynSave.races)) {
      for (const row of dynSave.races) {
        if (!Array.isArray(row) || row.length < 8) continue;
        const [id, name, parent, hp, dmg, speed, repro, tintIdx, visT, parent2, ecoN, cap, maxAge, flags] = row as [number, string, number, number, number, number, number, number, number[]?, number?, number?, number?, number?, number?];
        const pdef = RACES[parent];
        if (!pdef) continue; // 父种族丢失（损坏行）：丢弃该物种
        // v3：视觉基因组恢复（旧档无 vis → 由父种基准随机分化一个，保持视觉多样性）
        const vis: VisGenome = Array.isArray(visT) && visT.length >= 13
          ? tupleToVis(visT as [number, number, number, number, number, number, number, number, number, number, number, number, number])
          : visFromGene(pdef.vis?.root ?? parent, { s: 1, d: 1, h: 1, r: 1 }, this.rng);
        RACES[id] = {
          ...pdef,
          key: `dyn${id}`,
          name: String(name),
          dynTint: GameEngine.DYN_TINTS[Math.max(0, Math.min(7, tintIdx | 0))],
          vis,
          hp: Math.max(1, Number(hp) || pdef.hp),
          dmg: Number(dmg) || pdef.dmg,
          speed: Number(speed) || pdef.speed,
          repro: Number(repro) || pdef.repro,
          // v5：全新造物元数据恢复（旧档缺省 → 父模板值，行为不变）
          maxAge: Number(maxAge) > 0 ? Math.round(Number(maxAge)) : pdef.maxAge,
          ...(flags != null && Number.isFinite(flags)
            ? { isCiv: !!(flags & 1), hostile: !!(flags & 2), predator: !!(flags & 4) }
            : {}),
        };
        const eco = ecoN === 1 ? 'pred' : ecoN === 2 ? 'herb' : ecoN === 3 ? 'neutral' : undefined;
        this.dynRaces.set(id | 0, { parent: parent | 0, bornYear: 0, parent2: parent2 && parent2 > 0 ? parent2 | 0 : undefined, eco, cap: Number(cap) > 0 ? Math.round(Number(cap)) : undefined });
        const isCiv = flags != null && Number.isFinite(flags) ? !!(flags & 1) : !!pdef.isCiv;
        if (isCiv && !CIV_RACES.includes(id | 0)) CIV_RACES.push(id | 0); // 文明亚种重入建国种族表
      }
      for (const w of dynSave.weapons ?? []) {
        if (w && typeof w.id === 'number' && typeof w.name === 'string') this.emergentWeapons.set(w.id, { ...w });
      }
      this.dynSeq = Math.max(100, dynSave.dynSeq ?? 100, ...[...this.dynRaces.keys()].map((x) => x + 1));
      this.weapSeq = Math.max(1, dynSave.weapSeq ?? 1, ...[...this.emergentWeapons.keys()].map((x) => x + 1));
      // 学说/防御恢复（武器架构 v2；旧档缺省 → 均匀学说 + 零防御自然回填）
      for (const row of dynSave.dctr ?? []) {
        if (!Array.isArray(row) || row.length < 5) continue;
        this.doctrines.set(row[0] | 0, { precision: Number(row[1]) || 0.2, saturation: Number(row[2]) || 0.2, terror: Number(row[3]) || 0.2, attrition: Number(row[4]) || 0.2 });
      }
      for (const row of dynSave.ddef ?? []) {
        if (!Array.isArray(row) || row.length < 4) continue;
        this.defenses.set(row[0] | 0, { point: Math.max(0, Number(row[1]) || 0), armor: Math.max(0, Number(row[2]) || 0), evade: Math.max(0, Number(row[3]) || 0) });
      }
      // v3：涌现特质恢复（重新注入 TRAITS 模块表）
      for (const row of dynSave.trts ?? []) {
        if (!Array.isArray(row) || row.length < 6) continue;
        const [key, name, dmg100, hp100, spd100, regen1000] = row;
        const t = {
          key: String(key), name: String(name), desc: '涌现特质', good: true,
          dmgMul: dmg100 ? dmg100 / 100 : undefined,
          hpMul: hp100 ? hp100 / 100 : undefined,
          speedMul: spd100 ? spd100 / 100 : undefined,
          regen: regen1000 ? regen1000 / 1000 : undefined,
        };
        this.dynTraits.set(t.key, t);
        TRAITS[t.key] = t;
      }
      this.traitSeq = Math.max(1, dynSave.traitSeq ?? 1, ...[...this.dynTraits.keys()].map((k) => parseInt(k.slice(2), 10) + 1 || 1));
    }
    // v3：进化图谱恢复（节点 + 索引重建；旧档缺省 → 根源懒补）
    const EVO_KINDS: EvoKind[] = ['species', 'weapon', 'tech', 'trait', 'society'];
    for (const row of v3s.evo ?? []) {
      if (!Array.isArray(row) || row.length < 9) continue;
      const [id, kindIdx, year, parent, name, colorHex, detail, stat, alive, metaJson] = row;
      let meta: Record<string, number | string> | undefined;
      if (metaJson) { try { meta = JSON.parse(String(metaJson)); } catch { meta = undefined; } }
      this.evoNodes.push({ id: id | 0, kind: EVO_KINDS[Math.max(0, Math.min(4, kindIdx | 0))], name: String(name), parent: (parent | 0) >= 0 ? parent | 0 : null, year: Number(year) || 0, colorHex: String(colorHex), detail: String(detail), stat: stat ? String(stat) : undefined, alive: alive === 1, meta });
    }
    this.evoSeq = Math.max(1, v3s.evoSeq ?? 1, ...this.evoNodes.map((n) => n.id + 1));
    for (const n of this.evoNodes) {
      if (n.kind === 'species' && n.meta?.race !== undefined) this.evoIndex.set(`sp:${n.meta.race}`, n.id);
      if (n.kind === 'weapon' && n.meta?.wid !== undefined) this.evoIndex.set(`wp:${n.meta.wid}`, n.id);
    }
    // v39：涌现社会内核——家族谱系恢复（旧档缺省 = 空表：单位 fam 字段自然 undefined，家族功能静默降级）；
    //      恐慌为瞬态不入档（读档后自然平复）；血仇 gIds/gVal 随单位列式行走（无家族的单位同样可携仇读档）
    this.families.clear();
    for (const row of v3s.fams ?? []) {
      if (!Array.isArray(row) || row.length < 10) continue;
      const [id, name, race, founded, founder, members, heroes, kills, peak, milestones] = row;
      this.families.set(id | 0, { id: id | 0, name: String(name), race: race | 0, founded: Number(founded) || 0, founder: String(founder), members: members | 0, heroes: heroes | 0, kills: kills | 0, peak: peak | 0, milestones: milestones | 0 });
    }
    this.familySeq = Math.max(1, v3s.familySeq ?? 1, ...[...this.families.keys()].map((id) => id + 1));
    this.panicPeak = 0;
    this.panicEvents = 0;
    this.panicNoteCd = 0;
    // v40/v41：神谕 Agent 法则恢复（旧档缺省 = 无法则：神谕机制热加载读档后零成本重建）
    this.agentLaws = new AgentLawSystem(this);
    if (Array.isArray(v3s.alws)) {
      for (const law of v3s.alws) {
        // v41：旧档归一化——v1 触发器补 kind:'cron'、缺省字段补默认、未知动作剔除（不炸、不丢 fired 统计）
        const n = normalizeLaw(law);
        if (n) this.agentLaws.laws.push(n);
      }
      this.agentLaws.seq = Math.max(1, v3s.alwsSeq ?? 1);
    }
    // v41：机制自定义计数器恢复（旧档缺省 = 空）
    this.agentLaws.counters = v3s.alwsCounters && typeof v3s.alwsCounters === 'object' ? { ...v3s.alwsCounters } : {};
    // 旧档武器迁移：无组件字段的谱系武器由 dtype/delivery 回推四槽组件（保持可发射可迭代）
    for (const w of this.emergentWeapons.values()) {
      if (w.pl != null && w.pl >= 0) continue;
      const dtype = Math.max(0, Math.min(4, w.dtype ?? 0));
      const delivery = Math.max(0, Math.min(4, w.delivery ?? 0));
      w.pl = dtype === 0 ? 0 : dtype === 1 ? (w.fire > 0.4 ? 2 : 1) : dtype === 2 ? 3 : dtype === 3 ? 4 : 6;
      w.dl = delivery;
      w.gd = 2;
      w.pw = 0;
      w.q = [1, 1, 1, 1];
      w.inter = w.inter ?? 0;
    }
    // 自然引擎恢复：板块由 seed 重生 + 质心/热点/灰烬场/应力/风暴回填（旧档缺省 = 全新自然）
    this.nature = new NatureSystem(this, this.seed);
    this.nature.initPlates();
    const natSave = (data as SaveDataV2).nat;
    if (isV2 && natSave && typeof natSave === 'object') {
      // v2：板块质心恢复（真实漂移接力）→ 重算 Voronoi 场
      const pcx = Array.isArray(natSave.pcx) ? natSave.pcx.map((v) => Number(v) || 0) : null;
      const pcy = Array.isArray(natSave.pcy) ? natSave.pcy.map((v) => Number(v) || 0) : null;
      if (pcx && pcy && pcx.length === this.nature.plateN && pcy.length === this.nature.plateN) {
        for (let p = 0; p < this.nature.plateN; p++) {
          this.nature.plateCx[p] = Math.max(4, Math.min(W - 4, pcx[p]));
          this.nature.plateCy[p] = Math.max(4, Math.min(H - 4, pcy[p]));
        }
        this.nature.recomputePlates();
      }
      this.nature.plateEpoch = (natSave.pe ?? 0) | 0;
      // v2：火山热点恢复（固定地幔柱位置与蓄热）
      if (Array.isArray(natSave.hot) && natSave.hot.length > 0) {
        this.nature.hotspots = natSave.hot
          .filter((h) => Array.isArray(h) && h.length >= 3)
          .map((h) => ({ x: Math.max(4, Math.min(W - 5, h[0] | 0)), y: Math.max(4, Math.min(H - 5, h[1] | 0)), heat: Math.max(0, Math.min(3, Number(h[2]) || 0)) }));
      }
      for (const [i, q] of Array.isArray(natSave.stress) ? natSave.stress : []) {
        if (typeof i === 'number' && i >= 0 && i < W * H) this.nature.stress[i] = (Number(q) || 0) / 8;
      }
      this.nature.ash = Math.max(0, Math.min(1, Number(natSave.ash) || 0));
      // v2：灰烬平流场恢复（旧档只有全局标量 → 均匀播撒兼容）
      if (Array.isArray(natSave.ashF) && natSave.ashF.length > 0) {
        this.nature.ashF.fill(0);
        for (const [ci, q] of natSave.ashF) {
          if (typeof ci === 'number' && ci >= 0 && ci < AW * AH) this.nature.ashF[ci] = Math.max(0, Math.min(1, (Number(q) || 0) / 200));
        }
      } else {
        this.nature.ashF.fill(this.nature.ash);
      }
      this.nature.seasonOffset = (natSave.seasonOffset ?? 0) | 0;
      const cts = Array.isArray(natSave.counters) ? natSave.counters : [];
      if (cts.length >= 10) {
        this.nature.counters = {
          quakes: cts[0] | 0, quakesBig: cts[1] | 0, eruptions: cts[2] | 0, uplifts: cts[3] | 0, erosions: cts[4] | 0,
          cyclones: cts[5] | 0, tsunamis: cts[6] | 0, floods: cts[7] | 0, blizzards: cts[8] | 0, droughts: cts[9] | 0,
        };
      }
      this.nature.stormSeq = Math.max(1, (natSave.stormSeq ?? 1) | 0, ...Array.isArray(natSave.storms) ? natSave.storms.map((s) => (s[0] | 0) + 1) : [1]);
      for (const row of Array.isArray(natSave.storms) ? natSave.storms : []) {
        if (!Array.isArray(row) || row.length < 9) continue;
        const [id, x, y, strength, ttl, seed, kindI, , landed] = row;
        this.nature.storms.push({
          id: id | 0,
          x: Math.max(3, Math.min(W - 4, Number(x) || 4)),
          y: Math.max(3, Math.min(H - 4, Number(y) || 4)),
          strength: Math.max(0.1, Math.min(1.6, Number(strength) || 0.4)),
          ttl: Math.max(0, ttl | 0),
          seed: seed | 0,
          kind: kindI === 1 ? 'blizzard' : 'cyclone',
          name: STORM_NAME_AT(id | 0),
          landed: !!landed,
        });
      }
    }
    this.nature.lastSeason = -1; // 换季检测强制刷新全图色调
    this.killCredit = null;
    // 种群历史重置（曲线不跨存档，新采样自然回填）
    this.speciesHist.clear();
    // 终极世界大战恢复（旧档缺省 = 未打响）
    const wwSave = (data as SaveDataV2).worldWar;
    if (wwSave && (wwSave.phase === 'running' || wwSave.phase === 'ended')) {
      this.worldWar = {
        phase: wwSave.phase,
        startTick: wwSave.startTick ?? 0,
        startYear: wwSave.startYear ?? 0,
        endTick: wwSave.endTick ?? 0,
        belligerents: Array.isArray(wwSave.belligerents) ? wwSave.belligerents.filter((v) => typeof v === 'number') : [],
        pop0: wwSave.pop0 ?? {},
        kills: wwSave.kills ?? 0,
        fallen: Array.isArray(wwSave.fallen) ? wwSave.fallen.filter((f) => f && typeof f.id === 'number') : [],
        truces: wwSave.truces ?? 0,
        nukes: wwSave.nukes ?? 0,
        lasers: wwSave.lasers ?? 0,
        drones: wwSave.drones ?? 0,
        orbitals: wwSave.orbitals ?? 0,
        plasmas: wwSave.plasmas ?? 0,
        antimatters: wwSave.antimatters ?? 0,
        emerged: wwSave.emerged ?? 0,
        winner: typeof wwSave.winner === 'number' ? wwSave.winner : null,
        endText: wwSave.endText ?? '',
      };
    } else {
      this.worldWar = GameEngine.IDLE_WORLD_WAR();
    }
    this.wwTruce.clear();
    const truceSave = (data as SaveDataV2).wwTruce;
    if (Array.isArray(truceSave)) {
      for (const [k, v] of truceSave) {
        if (typeof k === 'string' && typeof v === 'number') this.wwTruce.set(k, v);
      }
    }
    this.wwLastNukeTick = -600;
    this.wwLastAntiTick = -1200;
    this.wwFrenzyAnnounced = -1;
    // 军团成员 id 与单位表对账（存档期间手工编辑可能造成悬空引用）
    for (let ai = this.armies.length - 1; ai >= 0; ai--) {
      const a = this.armies[ai];
      for (let k = a.members.length - 1; k >= 0; k--) {
        const u = this.unitById.get(a.members[k]);
        if (!u || u.dead || u.civ !== a.civ) a.members.splice(k, 1);
        else u.army = a.id;
      }
      if (a.members.length < 4) this.armies.splice(ai, 1);
    }
    this.lastWarSet.clear();
    this.lastClashEventTick = 0;
    this.lastReinforceEventTick = 0;
    this.lastVolleyEventTick = 0;

    // —— v4 联盟系统恢复（阵营实体 + 种族关系；旧档缺省 = 无联盟纯基线）——
    this.alliances = [];
    this.allianceSeq = 1;
    this.allianceOf.clear();
    this.allianceWarCd.clear();
    this.raceRel.clear();
    this.civHomogeneity.clear();
    this.extinctNoted.clear();
    this.raceThrived.clear();
    this.lastCatastrophe = { x: -1, y: -1, tick: -999999 };
    const alsSave = (data as SaveDataV2).als;
    if (Array.isArray(alsSave)) {
      for (const row of alsSave) {
        if (!Array.isArray(row) || row.length < 9) continue;
        const [id, name, membersCsv, leader, cohesion, formedTick, formedYear, warsTogether, colorHex, bonded] = row;
        const members = String(membersCsv).split(',').map((v) => Number(v)).filter((v) => Number.isFinite(v) && v >= 0 && v < this.civs.length);
        if (members.length < 2) continue; // 成员不足的联盟无意义
        const al: Alliance = {
          id: id | 0,
          name: String(name || `同盟${id}`),
          members,
          leader: Math.max(0, leader | 0),
          cohesion: Math.max(0, Math.min(100, Number(cohesion) || 55)),
          formedTick: formedTick | 0,
          formedYear: formedYear | 0,
          warsTogether: warsTogether | 0,
          colorHex: typeof colorHex === 'string' && colorHex.startsWith('#') ? colorHex : ALLIANCE_COLORS[(id | 0) % ALLIANCE_COLORS.length],
          bonded: !!bonded, // 袍泽纽带（共战 3 次解锁的阵营红利；旧档缺省 = 未解锁可重新 earned）
        };
        this.alliances.push(al);
        for (const m of members) this.allianceOf.set(m, al.id);
        this.allianceSeq = Math.max(this.allianceSeq, (id | 0) + 1);
      }
    }
    if (typeof (data as SaveDataV2).allianceSeq === 'number') {
      this.allianceSeq = Math.max(this.allianceSeq, (data as SaveDataV2).allianceSeq! | 0);
    }
    const rrelSave = (data as SaveDataV2).rrel;
    if (Array.isArray(rrelSave)) {
      for (const [k, v] of rrelSave) {
        if (typeof k === 'string' && typeof v === 'number') this.raceRel.set(k, Math.max(-80, Math.min(80, v)));
      }
    }
    // v5：造物工坊恢复——图鉴注册重链（uid → 恢复后的动态种族 id）+ 内置覆写重放 + 图鉴物种属性同步
    const cregSave = (data as SaveDataV2).creg;
    if (Array.isArray(cregSave)) {
      for (const [uid, rid] of cregSave) {
        if (typeof uid === 'string' && typeof rid === 'number' && RACES[rid]) {
          this.creationRaceIds.set(uid, rid);
          const info = this.dynRaces.get(rid);
          if (info) info.uid = uid;
        }
      }
    }
    const rmodsSave = (data as SaveDataV2).rmods;
    if (Array.isArray(rmodsSave)) {
      for (const [rid, json] of rmodsSave) {
        if (typeof rid !== 'number' || rid < 0 || rid >= 100 || typeof json !== 'string') continue;
        const d = RACES[rid];
        if (!d) continue;
        try {
          const p = JSON.parse(json) as Partial<Pick<RaceDef, 'name' | 'hp' | 'dmg' | 'speed' | 'repro' | 'maxAge' | 'isCiv' | 'hostile'>>;
          if (!this.raceOrig.has(rid)) this.raceOrig.set(rid, { ...d });
          if (typeof p.name === 'string' && p.name) d.name = p.name.slice(0, 8);
          if (typeof p.hp === 'number') d.hp = Math.max(1, Math.min(99999, Math.round(p.hp)));
          if (typeof p.dmg === 'number') d.dmg = Math.max(0, Math.min(500, p.dmg));
          if (typeof p.speed === 'number') d.speed = Math.max(0.005, Math.min(0.3, p.speed));
          if (typeof p.repro === 'number') d.repro = Math.max(0, Math.min(0.02, p.repro));
          if (typeof p.maxAge === 'number') d.maxAge = Math.max(1, Math.min(9999, Math.round(p.maxAge)));
          if (typeof p.isCiv === 'boolean') d.isCiv = p.isCiv;
          if (typeof p.hostile === 'boolean') d.hostile = p.hostile;
          this.raceMods.set(rid, json);
        } catch {
          /* 坏 patch 行：跳过（不阻断读档） */
        }
      }
      if (rmodsSave.length > 0) {
        WB.invalidateRaceFlags();
        this.enemyLut.clear();
      }
    }
    const imodsSave = (data as SaveDataV2).imods;
    if (Array.isArray(imodsSave)) {
      for (const [kind, json] of imodsSave) {
        if (typeof kind !== 'string' || typeof json !== 'string') continue;
        const d = ITEM_DEFS[kind];
        if (!d) continue;
        try {
          const p = JSON.parse(json) as Partial<ItemDef>;
          if (!this.itemOrig.has(kind)) this.itemOrig.set(kind, { ...d });
          if (typeof p.name === 'string' && p.name) d.name = p.name.slice(0, 8);
          if (typeof p.rarity === 'number') d.rarity = Math.max(0, Math.min(4, Math.round(p.rarity)));
          if (typeof p.desc === 'string' && p.desc) d.desc = p.desc.slice(0, 40);
          for (const k of ['dmg', 'hp', 'speedMul', 'regen', 'armor', 'crit', 'lifesteal', 'thorns', 'ranged'] as const) {
            const v = p[k];
            if (typeof v === 'number' && Number.isFinite(v)) (d as unknown as Record<string, number>)[k] = v;
          }
          this.itemMods.set(kind, json);
        } catch {
          /* 坏 patch 行：跳过 */
        }
      }
    }
    // 曾繁盛种族重建（读档后首个 statsTick 前避免误报灭绝）
    for (const u of this.units) {
      if (u.dead || !RACES[u.race]?.isCiv) continue;
      this.raceThrived.add(u.race);
    }
    // —— 科技回溯基准初始化（Task 34）：旧档单位无 tDmg/tHp 快照 ——
    //    视为「已适应当前科技」——下次科技完成时按新乘数差正常回溯，无实然跳变
    for (const u of this.units) {
      if (u.civ >= 0 && this.civs[u.civ]?.alive) {
        const tm = this.techModsOf(u.civ);
        u.tDmg = tm.dmg;
        u.tHp = tm.hp;
      } else {
        u.tDmg = 1;
        u.tHp = 1;
      }
    }

    // 清空瞬态状态（特效/震屏/跟随/选中）
    this.effects = [];
    this.shake = 0;
    this.followId = null;
    this.selectedId = null;
    this.acc = 0;

    // 全量重绘两层画布（复用 generate 的重绘流程；质感工程 v3：×2 超采样缓冲）
    this.terrainImg = this.terrainCtx.createImageData(W * 8, H * 8);
    this.propsCtx.clearRect(0, 0, W * 4, H * 4);
    // 气候场不入存档：按 seed 确定性重算（generateWorld 同 seed 输出一致）
    const climate = generateWorld(this.seed);
    this.tempMap = climate.temp;
    this.moistMap = climate.moist;
    // 深度打磨：读档后重算水深场（地形已恢复，海岸纵深即时重建）
    this.rebuildWaterTiers();
    // 深时引擎读档重导出（零存档成本：全部场由已恢复地形 + seed 重建，不触碰任何已恢复状态）
    this.worldsim = new WorldSim(this);
    this.worldsim.initFromTerrain();
    this.overlayDirty = true;
    this.dirty.clear();
    for (let i = 0; i < W * H; i++) this.dirty.add(i);
    this.flushDirty();
    this.propsDirty.clear();
    for (let i = 0; i < W * H; i++) this.propsDirty.add(i);
    this.flushProps();
    this.rebuildAmbLists();
    this.statsTick();
  }
}

// WASM 空间内核客户端自举（服务端/SSR 安全：window 守卫；加载失败自动永久回退 JS 扫描路径）
if (typeof window !== 'undefined') {
  void WB.boot();
  void WBB.boot(); // Stage 2 批内核（失败自动回退 JS 全路径）
}

