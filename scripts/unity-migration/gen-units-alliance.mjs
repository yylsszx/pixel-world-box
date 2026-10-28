// ============================================================================
// gen-units-alliance.mjs —— M-U3 切片 2「联盟域开闸」黄金向量
// 蓝本：src/lib/game/engine.ts
//   formAlliance L8260-8291（allianceSeq++/色板 (seq-2)%6/nameFor rng 词法/
//   rel max(60,cur)/met.add/shiftRaceRel +9/事件 capital 坐标）/
//   joinAlliance L8294-8323（成员≤5/leader alive/种族世仇 rr<-35 → 0.7 拒/
//   rel max(52)+raceRel +4+met）/ leaveAlliance L8326-8351（betray -22+rel
//   min(-30)/quit -8/members<2 → dissolve）/ dissolveAlliance L8354-8360 /
//   allianceTick L8363-8531 六段（①对账除名+互战判叛+盟主继任 ②诞生 rel≥55+
//   diploMul+commonFoe ×3.2+catast ×1.6+break ③扩员 rel≥45+多数非敌+0.05×
//   (0.5+diplo) ④凝聚 dh=0.5±（relAvg<30 -1.5/commonFoe +0.8/龙亡 +0.5/
//   milAvg>60 -0.8/trade +0.4/idea mil ±0.15）+bonded warsTogether≥3 +8+
//   cohesion<25 ×0.3 解散 ⑤互助 gold<30+rich>200 ×0.4 转移 15 ⑥种族漂移
//   盟内跨种族 +0.15(+0.1 cultured)/交战 -0.3）/
//   declareWar 集体防御 L7166-7185（force+quiet 递归归零 rng——确定性级联）
//   +联军出击 L7187-7209（300 冷却+rel≥20 拒 cohesion-2+rng<0.6 参战）/
//   makePeace 阵营停战 L7810-7825（rng<0.75 跟随 18/cohesion-10）。
// 直接 import 现役 engine.ts（真实现，零同源复制）： wars harness 超集
//   （Task 147 模式 + 联盟状态面 + 单位影子 4 字段（dead/race/civ/caravan——
//   allianceTick ④ 的龙计数与盟内商队过滤器消费面））。
// 截断契约（C# 侧哨兵同构）：①overlayMode/overlayDirty 渲染域 no-op ②
//   ideaModsOf 恒零（civs.ideas 空表契约——M-U3 理念切片开闸）③toast/onSound
//   UI 域 no-op ④worldWar idle ⑤warsForbid 等 wars 切片既有契约延续。
// 驱动：allianceTick 由引擎 tickCount%300===23 调（L2646）——harness 以 'atick'
//   op 直驱（节奏属引擎 tick 域，C# 同构注释）。
// 运行：bun scripts/unity-migration/gen-units-alliance.mjs
// 输出：scripts/unity-migration/golden-units-alliance.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, RACE_REL_BASE } from '../../src/lib/game/types.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { writeFileSync } from 'node:fs';

const EP_ECHO = {
  declareRate: ep('war.declareRate'),
  tensionDecay: ep('war.tensionDecay'),
  milPressure: ep('war.milPressure'),
};
const CIV_RACE_IDS = [R.HUMAN, R.ELF, R.DWARF, R.ORC, R.LIZARD, R.GOBLIN];
const RACE_DIPLO = {}, RACE_AGGR = {}, RACE_GREED = {};
for (const id of CIV_RACE_IDS) {
  RACE_DIPLO[id] = RACES[id].diplo;
  RACE_AGGR[id] = RACES[id].aggr;
  RACE_GREED[id] = RACES[id].greed;
}
const RACE_REL_BASE_ECHO = { ...RACE_REL_BASE };
const ALLIANCE_COLORS = ['#14b8a6', '#f97316', '#a855f7', '#84cc16', '#ec4899', '#06b6d4'];

const bitHex = (d) => {
  if (typeof d === 'number' && Object.is(d, -0)) d = 0;
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

const mkCiv = (o) => ({
  id: o.id, name: o.name, race: o.race, colorHex: o.colorHex ?? '#cccccc',
  pop: o.pop ?? 10, tiles: o.tiles ?? [100, 101, 102], frontier: [],
  houses: 0, capital: o.capital ?? -1, alive: o.alive !== false,
  gold: o.gold === undefined ? undefined : o.gold,
  militarism: o.militarism === undefined ? undefined : o.militarism,
  gov: o.gov === undefined ? undefined : o.gov,
  culture: o.culture === undefined ? undefined : o.culture,
  ideas: o.ideas ?? [],
});

const dumpMapN = (m) => [...m.entries()].map(([k, v]) => [k, bitHex(v)]);
const dumpMapI = (m) => [...m.entries()].map(([k, v]) => [k, v]);
const dumpWarData = (m) => [...m.entries()].map(([k, w]) => ({
  key: w.key, a: w.a, b: w.b, startTick: w.startTick, startYear: w.startYear,
  total: w.total, scoreA: w.scoreA, scoreB: w.scoreB,
  exA: bitHex(w.exA), exB: bitHex(w.exB), casA: w.casA, casB: w.casB,
  razedA: w.razedA, razedB: w.razedB, battles: w.battles, giveUpAt: w.giveUpAt,
  reason: w.reason, reasonText: w.reasonText, aggressor: w.aggressor,
  goal: w.goal, goalNow: w.goalNow, occA: w.occA, occB: w.occB,
  popA0: bitHex(w.popA0), popB0: bitHex(w.popB0), lastActiveTick: w.lastActiveTick ?? null,
}));
const dumpAlliances = (arr) => arr.map((al) => ({
  id: al.id, name: al.name, members: [...al.members], leader: al.leader,
  cohesion: bitHex(al.cohesion), formedTick: al.formedTick, formedYear: al.formedYear,
  warsTogether: al.warsTogether, bonded: !!al.bonded, colorHex: al.colorHex ?? null,
}));

const SEEDS = JSON.parse(process.env.PW_SEEDS ?? '{}');
function seedOf(name, dflt) { return SEEDS[name] ?? dflt; }

function runCase(c) {
  const eng = Object.create(GameEngine.prototype);
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
  eng.alliances = []; eng.allianceOf = new Map();
  eng.allianceSeq = c.env.allianceSeq ?? 1;
  eng.directives = [];
  eng.armies = [];
  eng.emergentWeapons = new Map();
  eng.ideaModCache = new Map(); eng.emIdeas = new Map();   // 理念域空表契约（ideaModsOf 恒零——M-U3 理念切片）
  eng.occSet = new Set();
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };
  eng.laws = { wars: c.env.lawsWars !== false };
  eng.tickCount = c.env.tick ?? 0;
  eng.yearF = c.env.yearF ?? 0;
  eng.eventSeq = 0; eng.toastSeq = 0;
  eng.statWars = 0;
  eng.lastCatastrophe = { tick: c.env.catTick ?? -1000000000, x: -1, y: -1 };
  eng.zombieOutbreakNoted = !!c.env.zombieOutbreak;
  eng.tileX = (i) => i % 256;
  eng.tileY = (i) => (i / 256) | 0;
  eng.units = (c.env.units ?? []).map((u) => ({ dead: !!u.dead, race: u.race, civ: u.civ, caravan: u.caravan ?? 0 }));
  const raw = mulberry32(c.seed);
  let draws = 0;
  eng.rng = () => { draws++; return raw(); };
  const evts = [];
  eng.addEvent = (kind, text, opts) => {
    evts.push({ id: eng.eventSeq++, year: Math.floor(eng.yearF), kind, text,
      colorHex: opts?.colorHex ?? null,
      x: opts?.x === undefined ? null : opts.x, y: opts?.y === undefined ? null : opts.y });
  };
  eng.toast = () => {};
  eng.onSound = null;

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
    golds: eng.civs.filter(Boolean).map((cv) => (cv.gold === undefined ? null : bitHex(cv.gold))),
    alli: dumpAlliances(eng.alliances),
    alOf: dumpMapI(eng.allianceOf),
    alCd: dumpMapI(eng.allianceWarCd),
    alSeq: eng.allianceSeq,
    evN: evts.length,
  });

  const steps = [];
  let evMark = 0;
  for (const op of c.ops) {
    draws = 0;
    evMark = evts.length;
    let probe = null;
    switch (op.op) {
      case 'meet': eng.diplomacyMeet(op.a, op.b); break;
      case 'war': eng.declareWar(op.agg, op.vic, op.reason, op.opts); break;
      case 'peace': eng.makePeace(op.a, op.b, op.text, op.postRel); break;
      case 'tick': eng.warTick(); break;
      case 'atick': eng.allianceTick(); break;
      case 'formal': eng.formAlliance(eng.civs[op.a], eng.civs[op.b]); break;
      case 'joinal': eng.joinAlliance(eng.alliances.find((x) => x.id === op.al), eng.civs[op.c]); break;
      case 'leaveal': eng.leaveAlliance(op.c, op.cause); break;
      case 'disal': eng.dissolveAlliance(eng.alliances.find((x) => x.id === op.al), op.text); break;
      case 'setrel': eng.rel.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'setten': eng.tension.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'setshame': eng.warShame.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.who); break;
      case 'met': eng.met.add(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`); break;
      case 'setrace': eng.raceRel.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'adv': eng.tickCount += op.n; break;
      case 'atwar': probe = eng.atWar(op.a, op.b) ? 1 : 0; break;
      default: throw new Error('op not found: ' + op.op);
    }
    const s = snap();
    s.op = op.op; s.draws = draws; s.probe = probe;
    s.evts = evts.slice(evMark).map((e) => ({
      id: e.id, year: e.year, kind: e.kind, text: e.text, colorHex: e.colorHex,
      x: e.x === null ? null : bitHex(e.x), y: e.y === null ? null : bitHex(e.y),
    }));
    steps.push(s);
  }
  const tailDraws = [];
  for (let i = 0; i < 4; i++) tailDraws.push(bitHex(raw()));
  return {
    name: c.name, seed: c.seed,
    env: { tick: c.env.tick ?? 0, yearF: c.env.yearF ?? 0, lawsWars: c.env.lawsWars !== false,
      catTick: c.env.catTick ?? -1000000000, allianceSeq: c.env.allianceSeq ?? 1,
      zombieOutbreak: !!c.env.zombieOutbreak, units: (c.env.units ?? []).map((u) => ({ dead: !!u.dead, race: u.race, civ: u.civ, caravan: u.caravan ?? 0 })) },
    civs: c.civs.map((cv) => ({ id: cv.id, name: cv.name, race: cv.race, colorHex: cv.colorHex ?? '#cccccc',
      pop: cv.pop ?? 10, tilesN: (cv.tiles ?? [100, 101, 102]).length, capital: cv.capital ?? -1,
      alive: cv.alive !== false, gold: cv.gold === undefined ? null : bitHex(cv.gold),
      militarism: cv.militarism === undefined ? null : bitHex(cv.militarism),
      gov: cv.gov === undefined ? null : cv.gov,
      culture: cv.culture === undefined ? null : bitHex(cv.culture) })),
    ops: c.ops,
    steps, tailDraws,
  };
}

// ============================================================================
// 场景激活度工程（种子寻优锁定）
// ============================================================================
const CASES = [];
const civ6 = [
  { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 90, militarism: 30, gov: 1, capital: 5000, culture: 85 },
  { id: 1, name: '银叶议庭', race: R.ELF, pop: 26, gold: 60, militarism: 22, gov: 0, capital: 12000, culture: 90 },
  { id: 2, name: '铁须王座', race: R.DWARF, pop: 20, gold: 250, militarism: 40, gov: 2, capital: 15000, culture: 70 },
  { id: 3, name: '血蹄部族', race: R.ORC, pop: 36, gold: 25, militarism: 68, gov: 4, capital: 20000, culture: 30 },
  { id: 4, name: '晨风港', race: R.LIZARD, pop: 22, gold: 260, militarism: 26, gov: 3, capital: 9000, culture: 60 },
  { id: 5, name: '穴巢群殿', race: R.GOBLIN, pop: 28, gold: 40, militarism: 58, gov: 0, capital: 22000, culture: 35 },
];

// S1 form-basic：直接 formAlliance ×2——色板 (seq-2)%6 前两色 + rel max(60,cur)
//   + shiftRaceRel +9 + 事件 capital 坐标 + allianceOf 插入序 + allianceSeq 1→3
CASES.push({
  name: 'form-basic', seed: seedOf('form-basic', 1201),
  env: { tick: 400, yearF: 10.25, allianceSeq: 1 },
  civs: [civ6[0], civ6[1], civ6[2], civ6[3]],
  ops: [
    { op: 'setrel', a: 0, b: 1, v: 40 },
    { op: 'formal', a: 0, b: 1 },     // 盟主=艾索伦（pop 30≥26）；名=词法 rng×6
    { op: 'formal', a: 1, b: 3 },     // 1 已入盟 → null（守卫对照——零事件）
    { op: 'formal', a: 3, b: 2 },     // 血蹄×铁须（跨盟候选）……2 未入盟 → 成盟 id2 色板 1
    { op: 'atwar', a: 0, b: 1 },
  ],
});

// S2 atick-born：allianceTick ② 自然诞生——rel≥55+met+diploMul+commonFoe ×3.2
//   （0/3 预宣战对 1）+ catast ×1.6（catTick 近窗）→ rng<p 过门 → formAlliance+break
CASES.push({
  name: 'atick-born', seed: seedOf('atick-born', 7),
  env: { tick: 600, yearF: 15, catTick: 500, allianceSeq: 1 },
  civs: [civ6[0], civ6[1], civ6[3], civ6[4]],
  ops: [
    { op: 'met', a: 0, b: 1 },
    { op: 'setrel', a: 0, b: 1, v: 60 },
    { op: 'met', a: 3, b: 0 },        // commonFoe：0 与 1 均与 3 交战
    { op: 'war', agg: 3, vic: 0, reason: 'border' },
    { op: 'setrel', a: 1, b: 3, v: -50 },
    { op: 'war', agg: 3, vic: 1, reason: 'border' },
    { op: 'atick' },                   // ② 诞生（1/2 拍寻优）+ ④ 凝聚 + ⑥ 漂移
    { op: 'atick' },
  ],
});

// S3 atick-join：③ 扩员——盟主 rel≥45+多数非敌 → 0.05×(0.5+diplo) 过门 joinAlliance；
//   种族世仇 rr<-40（setrace 注入）→ 0.7 拒事件（候选 orc）；join 后 rel max(52)+raceRel+4+met
CASES.push({
  name: 'atick-join', seed: seedOf('atick-join', 310),
  env: { tick: 900, yearF: 22.5, allianceSeq: 1 },
  civs: [civ6[0], civ6[1], civ6[3], civ6[4]],
  ops: [
    { op: 'formal', a: 0, b: 1 },      // 人类+精灵盟（名 rng1）
    { op: 'setrel', a: 0, b: 4, v: 50 },
    { op: 'setrel', a: 1, b: 4, v: 30 },
    { op: 'met', a: 0, b: 4 }, { op: 'met', a: 1, b: 4 },
    { op: 'setrel', a: 0, b: 3, v: 50 },  // 候选 orc 过 rel 门（③无 atWar 门——引擎既有语义）
    { op: 'setrace', a: 0, b: 3, v: -40 }, // 种族世仇注入 → rr<-35 → 0.7 拒掷
    { op: 'met', a: 0, b: 3 },
    { op: 'setrel', a: 0, b: 3, v: -50 },
    { op: 'setrel', a: 1, b: 3, v: -50 },
    { op: 'war', agg: 3, vic: 0, reason: 'border' },
    { op: 'war', agg: 3, vic: 1, reason: 'border' },
    { op: 'setrel', a: 0, b: 3, v: 50 },  // 宣战钳 -45 后重置回 50（候选门）
    { op: 'atick' },                   // ③ 扩员：蜥蜴人 join（rng）+ orc 世仇拒（rng）+ ④⑤⑥
  ],
});

// S4 defense-cascade：对盟员宣战 → 集体防御确定性级联（force+quiet 递归零 rng）——
//   成员逐个 counter-declare alliance war（rel 钳 -35）+ warsTogether++ + 事件
CASES.push({
  name: 'defense-cascade', seed: seedOf('defense-cascade', 1204),
  env: { tick: 1200, yearF: 30, allianceSeq: 1 },
  civs: [civ6[0], civ6[1], civ6[2], civ6[3]],
  ops: [
    { op: 'formal', a: 0, b: 1 },
    { op: 'joinal', al: 1, c: 2 },     // 三成员盟（直接 op——join rng 无涉：非世仇）
    { op: 'war', agg: 3, vic: 1, reason: 'conquest' },   // 侵略者 3 宣战盟员 1 → 0/2 级联
    { op: 'atwar', a: 0, b: 3 },
    { op: 'atwar', a: 2, b: 3 },
  ],
});

// S5 coalition-attack：盟主主动宣战 → 联军出击（300 冷却门外+rel≥20 拒 cohesion-2+
//   rng<0.6 参战）→ allianceWarCd 落账+warsTogether++
CASES.push({
  name: 'coalition-attack', seed: seedOf('coalition-attack', 1205),
  env: { tick: 1500, yearF: 37.5, allianceSeq: 1 },
  civs: [civ6[0], civ6[1], civ6[2], civ6[3]],
  ops: [
    { op: 'formal', a: 0, b: 1 },
    { op: 'joinal', al: 1, c: 2 },
    { op: 'setrel', a: 2, b: 3, v: 25 },   // 成员 2 与 3 关系 ≥20 → 拒绝出兵 cohesion-2
    { op: 'war', agg: 0, vic: 3, reason: 'border' },   // 盟主 0 宣战 → 1 参战 rng、2 拒绝
    { op: 'atwar', a: 1, b: 3 },
    { op: 'atwar', a: 2, b: 3 },
  ],
});

// S6 peace-cascade：盟约战争（reason='alliance'）停战 → 阵营停战 rng<0.75 跟随
//   （递归 makePeace postRel 18）/拒者 cohesion-10
CASES.push({
  name: 'peace-cascade', seed: seedOf('peace-cascade', 1206),
  env: { tick: 1800, yearF: 45, allianceSeq: 1 },
  civs: [civ6[0], civ6[1], civ6[2], civ6[3]],
  ops: [
    { op: 'formal', a: 0, b: 1 },
    { op: 'joinal', al: 1, c: 2 },
    { op: 'setrel', a: 2, b: 3, v: -40 },
    { op: 'war', agg: 0, vic: 3, reason: 'border' },    // 盟主开战（0 非盟约 reason）
    { op: 'war', agg: 2, vic: 3, reason: 'alliance', opts: { force: true, quiet: true, goal: 6 } },   // 2 依盟约参战
    { op: 'peace', a: 2, b: 3, text: '「铁须王座」与「血蹄部族」签署和约', postRel: 25 },   // 盟约战争停战 → 级联
    { op: 'atwar', a: 0, b: 3 },
    { op: 'atwar', a: 2, b: 3 },
  ],
});

// S7 cohesion-bonded：三对不同侵略者各引一次集体防御（每战新征召 2 员 → warsTogether 1→2→3）
//   → ④ 袍泽纽带 bonded +8+事件；commonFoe +0.8（三成员同敌 3）
CASES.push({
  name: 'cohesion-bonded', seed: seedOf('cohesion-bonded', 1207),
  env: { tick: 2100, yearF: 52.5, allianceSeq: 1 },
  civs: [civ6[0], civ6[1], civ6[2], civ6[3], civ6[4], civ6[5]],
  ops: [
    { op: 'formal', a: 0, b: 1 },
    { op: 'joinal', al: 1, c: 2 },
    { op: 'war', agg: 3, vic: 0, reason: 'border' },   // 防御征召 1/2 → warsTogether 1
    { op: 'war', agg: 4, vic: 0, reason: 'border' },   // 1/2 与 4 无战 → 征召 → 2
    { op: 'war', agg: 5, vic: 1, reason: 'border' },   // 0/2 与 5 无战 → 征召 → 3
    { op: 'atick' },                                   // ④ bonded：warsTogether≥3 → +8+事件；commonFoe +0.8
  ],
});

// S9 dissolve-low：四员盟双 betray（-22×2 → 11）+ relAvg<30 衰减 -1.0/拍 →
//   <25 ×0.3 解散掷寻优（quit -8 自动解散链已由 S4/S5 覆盖外的 betray 链独立实证）
CASES.push({
  name: 'dissolve-low', seed: seedOf('dissolve-low', 1),
  env: { tick: 2700, yearF: 67.5, allianceSeq: 1 },
  civs: [civ6[0], civ6[1], civ6[2], civ6[3]],
  ops: [
    { op: 'formal', a: 0, b: 1 },
    { op: 'joinal', al: 1, c: 2 },
    { op: 'joinal', al: 1, c: 3 },
    { op: 'setrel', a: 0, b: 2, v: 10 }, { op: 'setrel', a: 0, b: 3, v: 10 },
    { op: 'leaveal', c: 1, cause: 'betray' },   // -22 → 33；rel ×3 min(-30)
    { op: 'leaveal', c: 2, cause: 'betray' },   // -22 → 11；members [0,3] 仍 ≥2
    { op: 'atick' },                            // ④ relAvg 10<30 → -1.0 → 10 <25 → ×0.3 解散掷（寻优）
  ],
});

// S8 aid-trade：⑤ 互助（gold<30 成员+rich>200 → 0.4 过门转移 15+trade 事件）+
//   ⑥ 种族漂移（盟内跨种族 +0.15+文化双 80 +0.1；交战对 -0.3）+ 龙计数 +0.5 同仇
CASES.push({
  name: 'aid-trade', seed: seedOf('aid-trade', 2),
  env: { tick: 2400, yearF: 60, allianceSeq: 1,
    units: [{ race: 9, civ: -1 }, { race: 1, civ: 0, caravan: 1 }, { dead: true, race: 9, civ: -1 }] },
  civs: civ6,
  ops: [
    { op: 'formal', a: 0, b: 1 },      // 艾索伦(90)+银叶(60)——文化 85/90 双>80 → +0.25
    { op: 'formal', a: 2, b: 3 },      // 铁须(250 rich)+血蹄(25 贫)——互助门对（id2 色板 1）
    { op: 'setrel', a: 1, b: 3, v: -50 },
    { op: 'war', agg: 3, vic: 1, reason: 'border' },   // orc-elf 交战 → ⑥ -0.3 漂移
    { op: 'atick' },                   // ⑤ 互助寻优 + ④ 龙 +0.5（活龙 1）+ ⑥ 三路漂移
  ],
});

// —— 激活度自检 ——
const HUNT = process.env.PW_HUNT === '1';
if (HUNT) {
  for (const c of CASES) {
    const r = runCase(c);
    const alEvts = r.steps.flatMap((s) => s.evts).filter((e) => e.kind === 'alliance').length;
    const totalDraws = r.steps.reduce((a, s) => a + s.draws, 0);
    console.log(`${c.name}: draws=${totalDraws} allianceEvts=${alEvts} alliances=${r.steps.at(-1).alli.length} alSeq=${r.steps.at(-1).alSeq} bonded=${r.steps.at(-1).alli.some((a) => a.bonded)}`);
  }
}

const out = {
  ep: EP_ECHO,
  raceDiplo: RACE_DIPLO, raceAggr: RACE_AGGR, raceGreed: RACE_GREED,
  raceRelBase: RACE_REL_BASE_ECHO,
  civRaceIds: CIV_RACE_IDS,
  raceIds: Object.keys(RACES).map(Number),   // RACES 全部已定义种族 id（allianceTick ② !ra 守卫回显）
  allianceColors: ALLIANCE_COLORS,
  cases: CASES.map(runCase),
};
writeFileSync(new URL('./golden-units-alliance.json', import.meta.url), JSON.stringify(out));
console.log('golden-units-alliance.json written:', out.cases.length, 'cases,', out.cases.reduce((a, c) => a + c.steps.length, 0), 'steps');
