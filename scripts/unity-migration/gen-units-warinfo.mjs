// ============================================================================
// gen-units-warinfo.mjs —— M-U3 切片 3「warInfoTick 战争结算」黄金向量
// 蓝本：src/lib/game/engine.ts
//   warInfoTick L7563-7773（战争财政/rel 扫描建档兜底/warData 快照循环：
//   sig 活跃签名+rel -2+厌战修正 / 厌战累积 / 单边崩溃 concludeByScore /
//   双高白平 / 仇恨燎原升级灭国 / 目的达成 concludeGoalWar / 灭国放弃 /
//   sustainOf 承受力崩溃 / 沉寂 950 罢兵 / 跨代罢兵）
//   sustainOf L7249-7278（13 项）/ warGoalNow L7281-7301 / warGoalMet L7315 /
//   concludeGoalWar L7320-7339 / concludeByScore L7836-7872 / touchesOwner L7875 /
//   claimTile L1781-1815（frontSolidify→转正链：owner/tiles/frontier/markDirty/
//   diplomacyMeet+摩擦 0.5 抽）/ frontSolidify L7476-7486 / settleFront
//   L7534-7550（occStr≥70 割让 / 否则归还）/ noteOccupied L7342 /
//   onWarKill L7417-7433（addWarScore kill +2 接线——M-U2c 空表契约开闸）/
//   markDirty L1021-1028 / destroyBuilding L1998-2016（fx smoke 2 抽）/
//   fx L9951-9969（cap 620 + seed floor(rng*65536) + dir rng*2π）
// 直接 import 现役 engine.ts（真实现，零同源复制）：原型链 stub 驱动（Task 140 模式）。
// op 语义：wtick=warInfoTick / war=declareWar / peace=makePeace / adv=tickCount 推进 /
//   setrel / met / setwd=warData 字段预置 / setciv=civ 字段预置 / setocc=占领层预置 /
//   bld=建筑预置 / warkill=onWarKill(+2 接线) / killciv=亡国 /
//   probe: sustain=sustainOf(civ, wd, isA) / goalnow=warGoalNow / goalmet=warGoalMet /
//   atwar / civatwar。
// 截断契约（C# 侧哨兵同构，触达即设计错误）：
//  ① techMods 空表（c.techs=[]→NEUTRAL_MODS 零 arty/laser/drone）——warInfoTick
//     现代武器三段（launchArtillery/Laser/DroneSwarm）零触达零抽（&& 短路）；
//  ② worldWar idle——大战分支/wwIsBelligerent/wwTruce 零触达；
//  ③ directives/armies 空表——onWarKill 军团战功/旨意战果、makePeace 未竟旨意零触达；
//  ④ emergentWeapons 空 + killCredit null——wwCountKill 涌现武器战绩段零触达；
//  ⑤ setFrozen——online 采集域 no-op（collectorStats.frozen 标志位，模拟外无消费面）；
//  ⑥ toast/onSound——UI 域 no-op。
// rng 消耗点（对账指纹）：declareWar 主链零抽（联盟空）→ warInfoTick 无显式掷骰
//   （本级抽骰仅 concludeByScore/白平分支 0.5/0.4 两处 + claimTile 摩擦 0.5 + fx 2 抽/
//   建筑摧毁）—— seed 寻优锁定各崩溃分支路径。
// 运行：bun scripts/unity-migration/gen-units-warinfo.mjs
// 输出：scripts/unity-migration/golden-units-warinfo.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, RACE_REL_BASE, BUILDING_DEFS, BUILD_KINDS } from '../../src/lib/game/types.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { writeFileSync } from 'node:fs';

const W = 256, H = 160;
const T_GRASS = 3;
const idx = (x, y) => y * W + x;

const EP_ECHO = {
  declareRate: ep('war.declareRate'),
  tensionDecay: ep('war.tensionDecay'),
  milPressure: ep('war.milPressure'),
};

const CIV_RACE_IDS = [R.HUMAN, R.ELF, R.DWARF, R.ORC, R.LIZARD, R.GOBLIN];
const RACE_DIPLO = {}, RACE_AGGR = {}, RACE_GREED = {};
for (const id of CIV_RACE_IDS) {
  const d = RACES[id];
  RACE_DIPLO[id] = d.diplo;
  RACE_AGGR[id] = d.aggr;
  RACE_GREED[id] = d.greed;
}
const RACE_REL_BASE_ECHO = { ...RACE_REL_BASE };

const bitHex = (d) => {
  if (typeof d === 'number' && Object.is(d, -0)) d = 0;   // -0 归一（JSON 丢失符号——Task 143 课）
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const mkCiv = (o) => ({
  id: o.id, name: o.name, race: o.race, colorHex: o.colorHex ?? '#cccccc',
  pop: o.pop ?? 10, tiles: [...(o.tiles ?? [100, 101, 102])], frontier: [],
  // tiles 浅拷贝铁律：T0/T1 模块级常量会被 concludeByScore winner.tiles.push 原地污染
  // （S4 割地 → S5+ 领土继承 7 格——Task 145 env echo 课同族变体）
  houses: 0, capital: o.capital ?? -1, alive: o.alive !== false,
  gold: o.gold === undefined ? undefined : o.gold,
  militarism: o.militarism === undefined ? undefined : o.militarism,
  gov: o.gov === undefined ? undefined : o.gov,
  stability: o.stability === undefined ? undefined : o.stability,       // 战争贷款压民意（??70）
  expense: o.expense === undefined ? undefined : o.expense,             // 战争维持费流水（??0）
  mobilizeUntil: o.mobilizeUntil === undefined ? undefined : o.mobilizeUntil, // 总动员承受力 +12
  ideas: o.ideas,
});

const dumpMapN = (m) => [...m.entries()].map(([k, v]) => [k, bitHex(v)]);
const dumpMapI = (m) => [...m.entries()].map(([k, v]) => [k, v]);
const dumpWarData = (m) => [...m.entries()].map(([k, w]) => ({
  key: w.key, a: w.a, b: w.b, startTick: w.startTick, startYear: w.startYear,
  total: w.total, scoreA: bitHex(w.scoreA), scoreB: bitHex(w.scoreB),
  exA: bitHex(w.exA), exB: bitHex(w.exB), casA: w.casA, casB: w.casB,
  razedA: w.razedA, razedB: w.razedB, battles: w.battles, giveUpAt: w.giveUpAt,
  reason: w.reason, reasonText: w.reasonText, aggressor: w.aggressor,
  goal: w.goal, goalNow: w.goalNow, occA: w.occA, occB: w.occB,
  popA0: bitHex(w.popA0), popB0: bitHex(w.popB0),
  wearA: w.wearA === undefined ? null : bitHex(w.wearA),
  wearB: w.wearB === undefined ? null : bitHex(w.wearB),
  sigMark: w.sigMark === undefined ? null : w.sigMark,
  lastActiveTick: w.lastActiveTick === undefined ? null : w.lastActiveTick,
}));

const SEEDS = JSON.parse(process.env.PW_SEEDS ?? '{}');
function seedOf(name, dflt) { return SEEDS[name] ?? dflt; }

function runCase(c) {
  const eng = Object.create(GameEngine.prototype);
  // —— 最小 stub 面（战争结算域：六国棋盘 + 领土/建筑/占领层最小状态面） ——
  eng.civs = [];
  for (const cv of c.civs) eng.civs[cv.id] = mkCiv(cv);
  eng.met = new Set();
  eng.rel = new Map();
  eng.tension = new Map();
  eng.raceRel = new Map();
  eng.warData = new Map();
  eng.totalWars = new Set();
  eng.warShame = new Map();
  eng.warHistory = [];
  eng.lastDeclareAt = new Map();
  eng.allianceWarCd = new Map();
  eng.alliances = []; eng.allianceOf = new Map();       // 联盟面（sustainOf 并肩/wear 盟友修正读取——空表恒 1）
  eng.directives = [];                                   // 截断③
  eng.armies = [];                                       // 截断③
  eng.emergentWeapons = new Map();                       // 截断④
  eng.killCredit = null;                                 // 截断④
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };   // 截断②
  eng.laws = { wars: c.env.lawsWars !== false, seasons: c.env.lawsSeasons !== false };
  eng.tickCount = c.env.tick ?? 0;
  eng.yearF = c.env.yearF ?? 0;
  eng.eventSeq = 0; eng.toastSeq = 0;
  eng.statWars = 0;
  eng.lastCatastrophe = { tick: -1000000000, x: -1, y: -1 };
  eng.ecoState = c.env.ecoState ?? 'balanced';           // sustainOf 饥荒 -8（默认平衡）
  eng.nature = { season: c.env.season ?? 0 };            // sustainOf 冬季 -6（stub 平面对象——真实 getter 镜像值）
  eng.owner = new Int16Array(W * H).fill(-1);
  eng.occCiv = new Int8Array(W * H).fill(-1);
  eng.occStr = new Uint8Array(W * H);
  eng.occSet = new Set();
  eng.terrain = new Int16Array(W * H).fill(T_GRASS);     // 领土面：全草地（isLand=true 非 MOUNTAIN）
  eng.building = new Uint8Array(W * H);
  eng.buildings = [];
  eng.bIdx = new Map();
  eng.bHp = new Map();
  eng.damagedSet = new Set();
  eng.dirty = new Set();
  eng.overlayMode = 'none'; eng.overlayDirty = false;
  eng.fxPrefs = {};                                      // fxDensity ?? 1 → cap 620
  eng.effects = [];
  eng.techModCache = new Map();                          // 截断①：techs 空 → NEUTRAL_MODS 零表
  eng.emTechs = new Map();
  eng.ideaModCache = new Map();
  eng.emIdeas = new Map();                               // ideaMods 空表恒零（Task 148 契约）
  eng.tileX = (i) => i % W;
  eng.tileY = (i) => (i / W) | 0;
  // 领土预置：civ.tiles → owner[]（concludeByScore/touchesOwner 一致性前提）
  for (const cv of eng.civs) {
    if (!cv) continue;
    for (const t of cv.tiles) eng.owner[t] = cv.id;
  }
  const raw = mulberry32(c.seed);
  let draws = 0;
  eng.rng = () => { draws++; return raw(); };
  const evts = [];
  eng.addEvent = (kind, text, opts) => {
    evts.push({ id: eng.eventSeq++, year: Math.floor(eng.yearF), kind, text,
      colorHex: opts?.colorHex ?? null,
      x: opts?.x === undefined ? null : opts.x, y: opts?.y === undefined ? null : opts.y });
  };
  eng.toast = () => {};          // 截断⑥
  eng.onSound = null;

  const findWd = (a, b) => eng.warData.get(a < b ? `${a}-${b}` : `${b}-${a}`);
  const snap = () => ({
    met: [...eng.met],
    rel: dumpMapN(eng.rel),
    tension: dumpMapN(eng.tension),
    raceRel: dumpMapN(eng.raceRel),
    warShame: dumpMapI(eng.warShame),
    lastDeclareAt: dumpMapI(eng.lastDeclareAt),
    totalWars: [...eng.totalWars],
    warData: dumpWarData(eng.warData),
    warHistory: [...eng.warHistory],
    statWars: eng.statWars,
    golds: eng.civs.map((cv) => (cv === undefined || cv.gold === undefined ? null : bitHex(cv.gold))),
    stabs: eng.civs.map((cv) => (cv === undefined || cv.stability === undefined ? null : bitHex(cv.stability))),
    exps: eng.civs.map((cv) => (cv === undefined || cv.expense === undefined ? null : bitHex(cv.expense))),
    pops: eng.civs.map((cv) => (cv === undefined ? null : bitHex(cv.pop))),
    tilesN: eng.civs.map((cv) => (cv === undefined ? null : cv.tiles.length)),
    housesN: eng.civs.map((cv) => (cv === undefined ? null : cv.houses)),
    frontierN: eng.civs.map((cv) => (cv === undefined ? null : cv.frontier.length)),
    tiles: eng.civs.map((cv) => (cv === undefined ? null : [...cv.tiles])),
    occ: [...eng.occSet].map((i) => ({ i, civ: eng.occCiv[i], str: eng.occStr[i] })),
    bIdx: [...eng.bIdx.entries()].map(([i, bi]) => ({ i, bi })),
    buildings: eng.buildings.map((b) => ({ i: b.i, kind: b.kind, civ: b.civ })),
    bHp: [...eng.bHp.entries()].map(([i, v]) => [i, bitHex(v)]),
    dirtyN: eng.dirty.size,
    fx: eng.effects.map((e) => ({ kind: e.kind, x: bitHex(e.x), y: bitHex(e.y), r: bitHex(e.r), ttl: e.ttl, seed: e.seed, dir: bitHex(e.dir) })),
    evN: evts.length,
  });

  const steps = [];
  let evMark = 0; let fxMark = 0;
  for (const op of c.ops) {
    draws = 0; evMark = evts.length; fxMark = eng.effects.length;
    let probe = null;
    switch (op.op) {
      case 'wtick': eng.warInfoTick(); break;
      case 'war': eng.declareWar(op.agg, op.vic, op.reason, op.opts); break;
      case 'peace': eng.makePeace(op.a, op.b, op.text, op.postRel); break;
      case 'adv': eng.tickCount += op.n; break;
      case 'setrel': eng.rel.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'met': eng.met.add(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`); break;
      case 'setwd': {
        const wd = findWd(op.a, op.b);
        if (!wd) throw new Error('setwd: no warData ' + op.a + '-' + op.b);
        for (const [k, v] of Object.entries(op.patch)) wd[k] = v;
        break;
      }
      case 'setciv': {
        const cv = eng.civs[op.id];
        if (!cv) throw new Error('setciv: no civ ' + op.id);
        for (const [k, v] of Object.entries(op.patch)) cv[k] = v;
        break;
      }
      case 'setocc': {
        eng.occCiv[op.i] = op.civ; eng.occStr[op.i] = op.str; eng.occSet.add(op.i);
        break;
      }
      case 'bld': {
        // buildBuilding 最小镜像（落成面：kind/civ/hp/houses——城墙不计住宅）
        eng.building[op.i] = op.kind;
        eng.buildings.push({ i: op.i, x: op.i % W, y: (op.i / W) | 0, kind: op.kind, civ: op.civ });
        eng.bIdx.set(op.i, eng.buildings.length - 1);
        eng.bHp.set(op.i, BUILDING_DEFS[op.kind]?.hp ?? 70);
        const bcv = eng.civs[op.civ];
        if (bcv && op.kind !== BUILD_KINDS.WALL) bcv.houses++;
        break;
      }
      case 'warkill': eng.onWarKill({ civ: op.kc, army: undefined }, { civ: op.vc }); break;
      case 'killciv': eng.civs[op.id].alive = false; break;
      case 'sustain': {
        const wd = findWd(op.a, op.b);
        probe = bitHex(eng.sustainOf(eng.civs[op.civ], wd, op.civ === wd.a));
        break;
      }
      case 'goalnow': probe = eng.warGoalNow(findWd(op.a, op.b)); break;
      case 'goalmet': probe = eng.warGoalMet(findWd(op.a, op.b)) ? 1 : 0; break;
      case 'atwar': probe = eng.atWar(op.a, op.b) ? 1 : 0; break;
      case 'civatwar': probe = eng.civAtWar(op.civ) ? 1 : 0; break;
      default: throw new Error('op not found: ' + op.op);
    }
    const s = snap();
    s.op = op.op; s.draws = draws; s.probe = probe;
    s.evts = evts.slice(evMark).map((e) => ({
      id: e.id, year: e.year, kind: e.kind, text: e.text, colorHex: e.colorHex,
      x: e.x === null ? null : bitHex(e.x), y: e.y === null ? null : bitHex(e.y),
    }));
    s.fxNew = s.fx.slice(fxMark);
    steps.push(s);
  }
  const tailDraws = [];
  for (let i = 0; i < 4; i++) tailDraws.push(bitHex(raw()));   // 尾抽=场景 rng 流连续性
  return {
    name: c.name, seed: c.seed,
    env: { tick: c.env.tick ?? 0, yearF: c.env.yearF ?? 0, lawsWars: c.env.lawsWars !== false,
      season: c.env.season ?? 0, ecoState: c.env.ecoState ?? 'balanced' },
    civs: c.civs.map((cv) => ({ id: cv.id, name: cv.name, race: cv.race, colorHex: cv.colorHex ?? '#cccccc',
      pop: cv.pop ?? 10, tiles: cv.tiles ?? [100, 101, 102], capital: cv.capital ?? -1,
      alive: cv.alive !== false,
      gold: cv.gold === undefined ? null : bitHex(cv.gold),
      militarism: cv.militarism === undefined ? null : bitHex(cv.militarism),
      gov: cv.gov === undefined ? null : cv.gov,
      stability: cv.stability === undefined ? null : bitHex(cv.stability),
      expense: cv.expense === undefined ? null : bitHex(cv.expense),
      mobilizeUntil: cv.mobilizeUntil === undefined ? null : bitHex(cv.mobilizeUntil) })),
    ops: c.ops,
    steps, tailDraws,
  };
}

// ============================================================================
// 场景激活度工程（种子寻优锁定）
// ============================================================================

const CASES = [];
// 地理常量：civ0 领土 x∈[50,52]、civ1 领土 x∈[53,56]（y=10 行——邻接用于 touchesOwner）
const T0 = [idx(50, 10), idx(51, 10), idx(52, 10)];
const T1 = [idx(53, 10), idx(54, 10), idx(55, 10), idx(56, 10)];

// S1 fin-drain：战争财政（足额扣 cost / 见底 gold=0+stability-0.8+expense 累积 round 链）
//   + sig 首拍（sigMark undefined→0：rel -2 + lastActiveTick 重置 + kw=0 零修正）
//   + wear 基线累积 2.2/拍（razed=0 → +0.4）——三拍漂移对照
CASES.push({
  name: 'fin-drain', seed: seedOf('fin-drain', 1301),
  env: { tick: 500, yearF: 12.5, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 3, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },   // 动员费：0=100-10 / 1=max(0,3-11)=0
    { op: 'wtick' },                                    // 财政：0 cost 6 → 84 / 1 cost 7 见底 → stab 69.2
    { op: 'wtick' },                                    // expense 6→12 / wear 2.2→4.4 / rel -47→-49
    { op: 'wtick' },                                    // expense 12→18 / wear 6.6 / rel -51
    { op: 'sustain', a: 0, b: 1, civ: 0 },
    { op: 'sustain', a: 0, b: 1, civ: 1 },
  ],
});

// S2 goal-border：occA 预置 6 = goal → warGoalMet → concludeGoalWar border 分支
//   （makePeace postRel 10 + cession 事件 occ>0）——sig 拍 rel -2 + kw=1 厌战修正链
CASES.push({
  name: 'goal-border', seed: seedOf('goal-border', 1302),
  env: { tick: 800, yearF: 20, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },   // goal = max(6, min(12, round(4*0.1))) = 6
    { op: 'setwd', a: 0, b: 1, patch: { occA: 6 } },   // 占领入账预置（frontSolidify 消费面另测）
    { op: 'goalnow', a: 0, b: 1 },                      // probe 6
    { op: 'goalmet', a: 0, b: 1 },                      // probe 1
    { op: 'wtick' },                                    // concludeGoalWar：makePeace + cession 事件
    { op: 'atwar', a: 0, b: 1 },                        // probe 0（已停战）
  ],
});

// S3 plunder-loot：plunder 战争 goal 36 + warkill ×18（+2 接线：scoreA 36/casB/exB 18）
//   → warGoalNow = round(aggScore) 36 → concludeGoalWar loot=min(90,70)=70 金币转移
//   + loot 事件——onWarKill 消费面全链（M-U2c 契约开闸）
CASES.push({
  name: 'plunder-loot', seed: seedOf('plunder-loot', 1303),
  env: { tick: 1000, yearF: 25, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 60, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 90, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'plunder' },  // goal = max(24, min(44, round(60*0.6))) = 36
    ...Array.from({ length: 18 }, () => ({ op: 'warkill', kc: 0, vc: 1 })),
    { op: 'goalnow', a: 0, b: 1 },                      // probe 36
    { op: 'wtick' },                                    // sig 18 → kw=3 wearA-9/wearB+3.6 → loot 70 转移
  ],
});

// S4 cede-border：单边厌战崩溃（wearB 85>82 落后方）→ concludeByScore 割地：
//   touchesOwner 链式 4 格（53→54→55→56 逐格易帜——割后邻接即新界）+ cap 6 未触顶
//   + 建筑易帜（house CAPTURABLE → bHp 重置 70）+ 非易帜摧毁（tower → destroyBuilding
//   fx smoke 2 抽 + houses-- + buildings swap-pop）+ warShame 败方记忆 + settleFront 空表
CASES.push({
  name: 'cede-border', seed: seedOf('cede-border', 1304),
  env: { tick: 1200, yearF: 30, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'bld', i: idx(53, 10), kind: BUILD_KINDS.HOUSE, civ: 1 },   // 易帜面
    { op: 'bld', i: idx(55, 10), kind: BUILD_KINDS.TOWER, civ: 1 },   // 摧毁面
    { op: 'setwd', a: 0, b: 1, patch: { scoreA: 4, wearB: 85 } },
    { op: 'wtick' },                                    // 崩溃 → concludeByScore(cap 6) → 割 4 格
    { op: 'civatwar', civ: 0 },                         // probe 0
  ],
});

// S5 cede-whitepeace：weary === winner（占优方厌战爆表）→ 见好就收 makePeace（白平 postRel 8）
//   ——不割地（concludeByScore 不触达）+ warShame 照记（scoreA 4 > scoreB）
CASES.push({
  name: 'cede-whitepeace', seed: seedOf('cede-whitepeace', 1305),
  env: { tick: 1400, yearF: 35, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'setwd', a: 0, b: 1, patch: { scoreA: 4, wearA: 85 } },
    { op: 'wtick' },                                    // weary=ca=winner → makePeace 8 白平
  ],
});

// S6 sustain-broken：pop 凋敝（30→6）+ 金库见底 + 低军国 → sustainOf < 25 落后方崩溃
//   seed 1309 寻优：draw1 0.689≥0.5（割地拒）→ draw2 0.298<0.4（白平过）——两分支抽骰指纹 2 抽
//   （占优方虚耗崩溃 → 白平 postRel 5——非割地路径）
CASES.push({
  name: 'sustain-broken', seed: seedOf('sustain-broken', 1309),
  env: { tick: 1600, yearF: 40, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 30, gold: 30, militarism: 20, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'setciv', id: 1, patch: { pop: 6 } },
    { op: 'setwd', a: 0, b: 1, patch: { scoreA: 20, wearB: 10, wearA: 10, popB0: 30 } },
    { op: 'sustain', a: 0, b: 1, civ: 1 },              // probe <25
    { op: 'wtick' },                                    // broken → draw1 拒割 → draw2 白平
  ],
});

// S7 total-giveup：annex 灭国 giveUpAt=tick+3600 → adv 3601 → 久攻不下攻方放弃
//   （totalWars 删 + warData 删 + rel -5 + peace/collapse 双事件）——灭国可以失败！
CASES.push({
  name: 'total-giveup', seed: seedOf('total-giveup', 1307),
  env: { tick: 2000, yearF: 50, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'annex' },    // total + giveUpAt 5600
    { op: 'adv', n: 3601 },
    { op: 'wtick' },                                    // giveUpAt 2000 > 5600? 5601 > 5600 ✓ → 放弃
    { op: 'atwar', a: 0, b: 1 },                        // probe 0（rel -5）
  ],
});

// S8 escalate-total：宣战后 setrel -80（深仇）→ warInfoTick 仇恨燎原升级灭国
//   （totalWars.add + reason annex + reasonText 逐字 + giveUpAt 补记 + totalwar 事件）
//   ——注意 rel 扫描建档兜底已 has → 主循环升级段才触达
CASES.push({
  name: 'escalate-total', seed: seedOf('escalate-total', 1308),
  env: { tick: 2400, yearF: 60, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },   // warData 有档（rel -45）
    { op: 'setrel', a: 0, b: 1, v: -80 },
    { op: 'wtick' },                                    // rel<-75 && !totalWars.has → 升级灭国
    { op: 'goalnow', a: 0, b: 1 },                      // probe 0（goal 重置→人口凋敝度）
  ],
});

// S9 silence-950：sigMark 预置锁定（sig 0 === sigMark 0 → 不重置 lastActiveTick）
//   + lastActiveTick 预置 tick-1000 → 沉寂 1000 > 950 → 劳师糜饷 makePeace
CASES.push({
  name: 'silence-950', seed: seedOf('silence-950', 1309),
  env: { tick: 3000, yearF: 75, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'setwd', a: 0, b: 1, patch: { sigMark: 0, lastActiveTick: 2000 } },
    { op: 'wtick' },                                    // sig 零变化 → 沉寂 1000 → 罢兵
  ],
});

// S10 settle-front：占领层预置（53 高强度 80 割让 / 54 低强度 30 归还）→ makePeace 触发
//   settleFront 真实现开闸：frontSolidify → claimTile 全链（owner 易帜/tiles push/胜方
//   frontier 2 push/markDirty 5 格/邻接 meet 幂等 + 摩擦 0.5 抽 tension+2）+ occupy 事件
//   + frontSolidify warData score/occ +1（makePeace 在 settleFront 后才删档——先 +1 后删）
//   ⚠ 败方 tiles 保留 stale 项（claimTile 只 push 不移除——清理在 concludeByScore filter）
CASES.push({
  name: 'settle-front', seed: seedOf('settle-front', 1311),
  env: { tick: 3200, yearF: 80, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'setocc', i: idx(53, 10), civ: 0, str: 80 },
    { op: 'setocc', i: idx(54, 10), civ: 0, str: 30 },
    { op: 'peace', a: 0, b: 1, text: '停战验证', postRel: 10 },
    { op: 'civatwar', civ: 0 },
  ],
});

// S11 warkill-sig：warkill ×2（scoreA 4/casB 2/exB 2）夹在两拍 wtick 之间——sig 0→2 变化
//   → gained 2 → kw=1 厌战非对称修正（胜方 wearA-3→0 / 败方 wearB+1.2）→ 末拍 sigMark
//   锁定纯累积——首拍（gained 恒 0：sigMark ?? sig 同值）/ 修正拍 / 漂移拍三态对照
CASES.push({
  name: 'warkill-sig', seed: seedOf('warkill-sig', 1311),
  env: { tick: 3600, yearF: 90, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'wtick' },                                    // 首拍：gained=0（sigMark undefined ?? sig）→ kw=0 零修正
    { op: 'warkill', kc: 0, vc: 1 },
    { op: 'warkill', kc: 0, vc: 1 },
    { op: 'wtick' },                                    // sig 2 变化 → gained 2 → kw=1 非对称修正拍
    { op: 'wtick' },                                    // sigMark 锁定 → 纯漂移拍
  ],
});

// S12 backfill-dead：rel 扫描建档兜底（setrel -30 无档 → reason border + aggressor 按人口）
//   + 亡国清理（killciv → warData delete）+ 死国财政跳过——建档兜底与清理双面
CASES.push({
  name: 'backfill-dead', seed: seedOf('backfill-dead', 1312),
  env: { tick: 4000, yearF: 100, season: 0 },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: idx(51, 10), tiles: T0 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 40, gold: 30, militarism: 40, gov: 0, capital: idx(55, 10), tiles: T1 },
    { id: 2, name: '铁须王座', race: R.DWARF, pop: 50, gold: 60, militarism: 45, gov: 2, capital: idx(80, 40), tiles: [idx(80, 40), idx(81, 40), idx(82, 40)] },
  ],
  ops: [
    { op: 'setrel', a: 0, b: 2, v: -30 },
    { op: 'wtick' },                                    // 建档兜底（reason border + aggressor 2 按人口）
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'killciv', id: 1 },
    { op: 'wtick' },                                    // 亡国清理：warData(0,1) delete + (0,2) 常规运转
    { op: 'civatwar', civ: 2 },
  ],
});

// ============================================================================
// 输出
// ============================================================================
const golden = {
  ep: EP_ECHO,
  raceDiplo: RACE_DIPLO, raceAggr: RACE_AGGR, raceGreed: RACE_GREED,
  raceRelBase: RACE_REL_BASE_ECHO,
  capturable: [...BUILDING_DEFS.keys()].filter((k) => [BUILD_KINDS.HOUSE, BUILD_KINDS.FARM, BUILD_KINDS.MARKET, BUILD_KINDS.BARRACKS, BUILD_KINDS.PORT].includes(k)),
  bHp: BUILDING_DEFS.map((d) => d.hp),
  cases: CASES.map(runCase),
};
writeFileSync(new URL('./golden-units-warinfo.json', import.meta.url), JSON.stringify(golden));
console.log('golden-units-warinfo.json written:',
  golden.cases.length, 'cases,',
  golden.cases.reduce((n, c) => n + c.steps.length, 0), 'steps');
