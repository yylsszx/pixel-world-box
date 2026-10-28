// ============================================================================
// gen-units-wars.mjs —— M-U3 切片 1「rel/wars 外交关系域内核」黄金向量
// 蓝本：src/lib/game/engine.ts
//   pairKey L93 / rel+atWar L2123-2126 / civAtWar L2079-2084 /
//   diplomacyMeet L2099-2121（首触外交：warChance 公式 + pickCasus 宣战 / 和平印象）
//   / pickCasus L7216-7246（复仇记忆→directives 截断→军国主义掷骰挑起方→
//   conquest/plunder/border）/ CASUS_LEVEL L7072-7074 / casusText L7096-7108 /
//   ensureWarData L7379-7401 / addWarScore L7404-7414 / declareWar L7112-7213 /
//   makePeace L7777-7833 / warTick L8130-8217 / raceRelOf+shiftRaceRel
//   L8224-8236 / RACE_REL_BASE（types.ts L208-218）
// 直接 import 现役 engine.ts（真实现，零同源复制）：原型链 stub 驱动（Task 140 模式）。
// op 语义：meet=diplomacyMeet / war=declareWar / peace=makePeace / tick=warTick /
//   setrel/setten/setshame 状态预置 / adv=tickCount 推进（yearF 恒 env 值——
//   函数只独立读取两计数器，两侧一致即对账有效）/ atwar/civatwar 探针。
// 截断契约（C# 侧哨兵同构，触达即设计错误）：
//  ① 联盟域（alliances=[]/allianceOf 空）——declareWar 集体防御/联军出击、
//     makePeace 阵营停战（rng<0.75 段）零触达——M-U3 联盟切片开闸；
//  ② directives=[]——pickCasus 统一/神谕分支、makePeace 未竟旨意零触达；
//  ③ emergentWeapons 空——warTick 涌现武器段零触达；
//  ④ worldWar idle——wwIsBelligerent 恒 false（isWwPair/wwTruce 零触达）；
//  ⑤ occSet 空——settleFront {ceded:0,returned:0}（战线占领域 M-U3 另切片）；
//  ⑥ lastCatastrophe.tick=-1e9——warTick catastMul 循环零触达（灾变互连另切片）；
//  ⑦ toast/onSound——UI 域 no-op；WBB.touchMeta——WASM 桥域 no-op。
// rng 消耗点（对账指纹）：diplomacyMeet warChance 1 抽 + pickCasus（shame 0.6 门/
//   挑起方 2 抽左先/plunder greed 短路 0.4）/ warTick 0.5 止战抽 + 引燃 p 抽；
//   declareWar/makePeace 主链零抽（联盟截断）。
// 运行：bun scripts/unity-migration/gen-units-wars.mjs
// 输出：scripts/unity-migration/golden-units-wars.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, RACE_REL_BASE } from '../../src/lib/game/types.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { writeFileSync } from 'node:fs';

// —— ep 热参数回显（C# env 同构装载——零硬编码） ——
const EP_ECHO = {
  declareRate: ep('war.declareRate'),
  tensionDecay: ep('war.tensionDecay'),
  milPressure: ep('war.milPressure'),
};

// —— 文明种族外交三维 + RACE_REL_BASE 数据回显（C# 零独立打包） ——
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
  pop: o.pop ?? 10, tiles: (o.tiles ?? [100, 101, 102]), frontier: [],
  houses: 0, capital: o.capital ?? -1, alive: o.alive !== false,
  gold: o.gold === undefined ? undefined : o.gold,
  militarism: o.militarism === undefined ? undefined : o.militarism,
  gov: o.gov === undefined ? undefined : o.gov,
});

// —— Map/Set 插入序快照（met/warData/totalWars 迭代序即行为序） ——
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

const SEEDS = JSON.parse(process.env.PW_SEEDS ?? '{}');
function seedOf(name, dflt) { return SEEDS[name] ?? dflt; }

function runCase(c) {
  const eng = Object.create(GameEngine.prototype);
  // —— 最小 stub 面（战争域不触地形/单位/桶——六国棋盘即全部状态） ——
  // civs 按 id 索引（稀疏占位——warTick/civAtWar 按 id 查户）：
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
  eng.alliances = []; eng.allianceOf = new Map();       // 截断①：联盟空
  eng.directives = [];                                   // 截断②：旨意空
  eng.armies = [];
  eng.emergentWeapons = new Map();                       // 截断③
  eng.occSet = new Set();                                // 截断⑤：战线空
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };   // 截断④
  eng.laws = { wars: c.env.lawsWars !== false };
  eng.tickCount = c.env.tick ?? 0;
  eng.yearF = c.env.yearF ?? 0;
  eng.eventSeq = 0; eng.toastSeq = 0;
  eng.statWars = 0;
  eng.lastCatastrophe = { tick: c.env.catTick ?? -1000000000, x: -1, y: -1 };   // 截断⑥
  eng.tileX = (i) => i % 256;   // tileX/tileY 原型方法读模块级 W——stub 同式（256）
  eng.tileY = (i) => (i / 256) | 0;
  const raw = mulberry32(c.seed);
  let draws = 0;
  eng.rng = () => { draws++; return raw(); };
  const evts = [];
  eng.addEvent = (kind, text, opts) => {
    evts.push({ id: eng.eventSeq++, year: Math.floor(eng.yearF), kind, text,
      colorHex: opts?.colorHex ?? null,
      x: opts?.x === undefined ? null : opts.x, y: opts?.y === undefined ? null : opts.y });
  };
  eng.toast = () => {};          // 截断⑦：UI 域
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
    golds: eng.civs.map((cv) => (cv.gold === undefined ? null : bitHex(cv.gold))),
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
      case 'setrel': eng.rel.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'setten': eng.tension.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'setshame': eng.warShame.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.who); break;
      case 'setrace': eng.raceRel.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'met': eng.met.add(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`); break;
      case 'adv': eng.tickCount += op.n; break;
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
    steps.push(s);
  }
  const tailDraws = [];
  for (let i = 0; i < 4; i++) tailDraws.push(bitHex(raw()));   // 尾抽=场景 rng 流连续性（C# 同流续抽）
  return {
    name: c.name, seed: c.seed,
    env: { tick: c.env.tick ?? 0, yearF: c.env.yearF ?? 0, lawsWars: c.env.lawsWars !== false, catTick: c.env.catTick ?? -1000000000 },
    civs: c.civs.map((cv) => ({ id: cv.id, name: cv.name, race: cv.race, colorHex: cv.colorHex ?? '#cccccc',
      pop: cv.pop ?? 10, tilesN: (cv.tiles ?? [100, 101, 102]).length, capital: cv.capital ?? -1,
      alive: cv.alive !== false, gold: cv.gold === undefined ? null : bitHex(cv.gold),
      militarism: cv.militarism === undefined ? null : bitHex(cv.militarism),
      gov: cv.gov === undefined ? null : cv.gov })),
    ops: c.ops,
    steps, tailDraws,
  };
}

// ============================================================================
// 场景激活度工程（种子寻优锁定）
// ============================================================================

const CASES = [];

// S1 meet-peace：战争法则关闭（laws.wars=false）→ 首触零抽和平印象
//   rel=clamp(20+rr/3, -10..45)——RACE_REL_BASE 世仇（精灵-兽人 -45 → 5）与
//   传统盟友（人-精灵 25 → 28.333…）对照 + met 插入序
CASES.push({
  name: 'meet-peace', seed: seedOf('meet-peace', 1101),
  env: { tick: 400, yearF: 10.25, lawsWars: false },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 30, gov: 1, capital: 5000, tiles: [4900, 4901, 5000, 5001, 5002] },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 24, gold: 60, militarism: 18, gov: 0, capital: 12000, tiles: [12000, 12001, 12002] },
    { id: 3, name: '血蹄部族', race: R.ORC, pop: 36, gold: 20, militarism: 70, gov: 0, capital: 20000, tiles: [20000, 20001] },
  ],
  ops: [
    { op: 'meet', a: 0, b: 1 },     // 人-精灵：base 25 → 20+25/3=28.333
    { op: 'meet', a: 1, b: 3 },     // 精-兽：base -45 → max(-10, 20-15)=5
    { op: 'meet', a: 0, b: 1 },     // 重复首触：met 命中零抽零写入
    { op: 'atwar', a: 0, b: 1 },
  ],
});

// S2 meet-war：laws.wars=true + seed 寻优 warChance 过门 → pickCasus（无 shame/directives
//   → 挑起方 2 抽）→ declareWar border 全链（rel 钳 -45/goal=6..12/warHistory/动员费/
//   casus 事件坐标 capital≥0 + shiftRaceRel -2.5）
CASES.push({
  name: 'meet-war', seed: seedOf('meet-war', 1102),
  env: { tick: 800, yearF: 20.5, lawsWars: true },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 100, militarism: 55, gov: 1, capital: 5000, tiles: [4900, 5000, 5001, 5002, 5003, 5004, 5005, 5006] },
    { id: 3, name: '血蹄部族', race: R.ORC, pop: 36, gold: 20, militarism: 70, gov: 0, capital: 20000, tiles: [20000, 20001, 20002, 20003] },
  ],
  ops: [
    { op: 'meet', a: 0, b: 3 },     // warChance=max(0.08,min(0.8,0.2+(55+70)/400+0-0-(0.4+0.15)/2*0.3+…)) 掷骰寻优
    { op: 'atwar', a: 0, b: 3 },
  ],
});

// S3 pick-casus 三分支矩阵：warShame 复仇（0.6 门 seed 6137 过门早退——pickCasus 仅 1 抽）/
//   conquest（ratio≥1.6+军国≥42，orc 胜出）/ plunder（gold≥140+军国≥45+greed<0.55 掷 0.4
//   过门，elf 挑起）——经 warTick 引燃路径驱动（宣战限速门 lastDeclareAt 400 独立 per aggressor）
CASES.push({
  name: 'pick-casus', seed: seedOf('pick-casus', 6137),
  env: { tick: 1000, yearF: 25, lawsWars: true },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 90, militarism: 50, gov: 1, capital: 5000 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 24, gold: 200, militarism: 46, gov: 0, capital: 12000 },
    { id: 2, name: '铁须王座', race: R.DWARF, pop: 20, gold: 150, militarism: 44, gov: 2, capital: 15000 },
    { id: 3, name: '血蹄部族', race: R.ORC, pop: 60, gold: 30, militarism: 75, gov: 4, capital: 20000 },
  ],
  ops: [
    { op: 'setshame', a: 0, b: 1, who: 0 },    // 复仇记忆：0 上轮败于 1
    { op: 'met', a: 0, b: 1 },
    { op: 'setrel', a: 0, b: 1, v: 10 },
    { op: 'setten', a: 0, b: 1, v: 60 },
    { op: 'tick' },                             // 引燃掷骰 → pickCasus 复仇 0.6 门过门早退（1 抽）
    { op: 'met', a: 2, b: 3 },
    { op: 'setrel', a: 2, b: 3, v: 10 },
    { op: 'setten', a: 2, b: 3, v: 60 },
    { op: 'tick' },                             // dwarf(20) vs orc(60)：ratio=(60+2)/(20+2)≥1.6 + orc mil 75≥42 → conquest
    { op: 'adv', n: 401 },                      // 泄 lastDeclareAt 限速
    { op: 'met', a: 1, b: 2 },
    { op: 'setrel', a: 1, b: 2, v: 10 },
    { op: 'setten', a: 1, b: 2, v: 70 },
    { op: 'tick' },                             // elf(200 gold) 挑起：plunder 路径 greed 0.25<0.55 → 0.4 掷过门
  ],
});

// S4 wartick-drift：和平对 tension 衰减（×0.92）+ 军国增压（双军国>105 注入）+
//   target 水位（v<target → +1 / v>target+8 → -1）——seed 2 三拍零引燃纯漂移对照
CASES.push({
  name: 'wartick-drift', seed: seedOf('wartick-drift', 2),
  env: { tick: 1200, yearF: 30, lawsWars: true },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 90, militarism: 30, gov: 1, capital: 5000 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 24, gold: 60, militarism: 28, gov: 0, capital: 12000 },
    { id: 2, name: '铁须王座', race: R.DWARF, pop: 20, gold: 150, militarism: 60, gov: 2, capital: 15000 },
    { id: 3, name: '血蹄部族', race: R.ORC, pop: 36, gold: 30, militarism: 58, gov: 4, capital: 20000 },
  ],
  ops: [
    { op: 'met', a: 0, b: 1 },
    { op: 'setrel', a: 0, b: 1, v: 12 },        // 低水位：38-mil/8=17.5+min(16,ten*0.18) → 爬升 +1
    { op: 'setten', a: 0, b: 1, v: 20 },
    { op: 'met', a: 2, b: 3 },
    { op: 'setrel', a: 2, b: 3, v: 50 },        // 高水位过热：>target+8 → 回冷 -1；军国 118>105 增压
    { op: 'setten', a: 2, b: 3, v: 10 },
    { op: 'tick' },
    { op: 'tick' },
    { op: 'tick' },
  ],
});

// S5 wartick-gate：共享 aggressor 双对同拍引燃 → 400 限速门拒绝（rng 已消耗对账）
//   → adv 401 门开 + (0,1) 和平后高水位门关（v≥45 零抽）→ (0,2) 再宣战
CASES.push({
  name: 'wartick-gate', seed: seedOf('wartick-gate', 671),
  env: { tick: 2000, yearF: 50, lawsWars: true },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 90, militarism: 95, gov: 1, capital: 5000 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 24, gold: 60, militarism: 10, gov: 0, capital: 12000 },
    { id: 2, name: '铁须王座', race: R.DWARF, pop: 20, gold: 150, militarism: 12, gov: 2, capital: 15000 },
  ],
  ops: [
    { op: 'met', a: 0, b: 1 },
    { op: 'met', a: 0, b: 2 },
    { op: 'setrel', a: 0, b: 1, v: 30 },
    { op: 'setten', a: 0, b: 1, v: 80 },
    { op: 'setrel', a: 0, b: 2, v: 30 },
    { op: 'setten', a: 0, b: 2, v: 80 },
    { op: 'tick' },                             // 双对引燃：A 军国 95 压倒性胜出挑起；第二对被 400 门拒绝
    { op: 'adv', n: 401 },                      // 泄限速门
    { op: 'peace', a: 0, b: 1, text: '「艾索伦」与「银叶议庭」罢兵言和', postRel: 25 },
    { op: 'setrel', a: 0, b: 1, v: 50 },        // 高水位：v≥45 门关（零抽对照）
    { op: 'setten', a: 0, b: 1, v: 80 },
    { op: 'setrel', a: 0, b: 2, v: 30 },
    { op: 'setten', a: 0, b: 2, v: 80 },
    { op: 'tick' },                             // 门开：401>400 → (0,2) 再宣战
  ],
});

// S6 wartick-totalwar：annex 宣战（totalWars）→ warTick 交战冻结段 rel -0.5 固化
//   （-96 钳实证：低开 rel -96.5 钳 -96）+ laws.wars=false 神谕止战 0.5 抽两分支
CASES.push({
  name: 'wartick-totalwar', seed: seedOf('wartick-totalwar', 1106),
  env: { tick: 3000, yearF: 75, lawsWars: true },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 90, militarism: 60, gov: 1, capital: 5000 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 24, gold: 60, militarism: 55, gov: 0, capital: 12000 },
    { id: 2, name: '铁须王座', race: R.DWARF, pop: 20, gold: 150, militarism: 50, gov: 2, capital: 15000 },
    { id: 3, name: '血蹄部族', race: R.ORC, pop: 36, gold: 30, militarism: 65, gov: 4, capital: 20000 },
  ],
  ops: [
    { op: 'war', agg: 3, vic: 0, reason: 'annex' },   // 灭国：totalWars+giveUpAt=tick+3600
    { op: 'met', a: 1, b: 2 },
    { op: 'setrel', a: 2, b: 1, v: -40 },             // 常规战争冻结对照（非 total：零写入）
    { op: 'tick' },                                    // totalWars：rel -90.5；常规对冻结
    { op: 'met', a: 2, b: 3 },
    { op: 'setrel', a: 2, b: 3, v: -97 },             // -96 钳对照：非 total 冻结零写入（恒 -97）
    { op: 'tick' },
    { op: 'setrel', a: 0, b: 3, v: -96.5 },           // 钳位命中：total 对 max(-96, -97) = -96
    { op: 'tick' },
  ],
});

// S7 peace：makePeace 全链（warShame 败方记忆 + rel=postRel + totalWars/warData 清 +
//   shiftRaceRel +1 + peace 事件 colorHex）+ scoreA==scoreB 无败方对照
CASES.push({
  name: 'peace', seed: seedOf('peace', 1107),
  env: { tick: 4000, yearF: 100, lawsWars: true },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 90, militarism: 60, gov: 1, capital: 5000 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 24, gold: 60, militarism: 55, gov: 0, capital: 12000 },
    { id: 2, name: '铁须王座', race: R.DWARF, pop: 20, gold: 150, militarism: 50, gov: 2, capital: 15000 },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'setrel', a: 0, b: 1, v: -60 },       // warTick 前置——makePeace 不读 rel 但 score 侧 wd 已在
    { op: 'peace', a: 0, b: 1, text: '「艾索伦」与「银叶议庭」签署和约', postRel: 25 },
    { op: 'atwar', a: 0, b: 1 },
    { op: 'war', agg: 0, vic: 2, reason: 'conquest' },
    { op: 'peace', a: 2, b: 0, text: '「铁须王座」与「艾索伦」罢兵言和', postRel: 10 },   // postRel=10 冷和平
  ],
});

// S8 civatwar 矩阵：atWar/civAtWar 三态直驱（无 rel=-20 边界 / < -20 交战 / civs 死国
//   civAtWar 跳过 alive=false）——边界值 -20/-21 双点
CASES.push({
  name: 'civatwar', seed: seedOf('civatwar', 1108),
  env: { tick: 5000, yearF: 125, lawsWars: true },
  civs: [
    { id: 0, name: '艾索伦', race: R.HUMAN, pop: 30, gold: 90, militarism: 60, gov: 1, capital: 5000 },
    { id: 1, name: '银叶议庭', race: R.ELF, pop: 24, gold: 60, militarism: 55, gov: 0, capital: 12000 },
    { id: 2, name: '铁须王座', race: R.DWARF, pop: 20, gold: 150, militarism: 50, gov: 2, capital: 15000 },
    { id: 3, name: '血蹄部族', race: R.ORC, pop: 36, gold: 30, militarism: 65, gov: 4, capital: 20000, alive: false },
  ],
  ops: [
    { op: 'setrel', a: 0, b: 1, v: -20 }, { op: 'atwar', a: 0, b: 1 },   // 边界 false
    { op: 'setrel', a: 0, b: 2, v: -20.5 }, { op: 'atwar', a: 2, b: 0 }, // < -20 true（对调 pairKey 序）
    { op: 'civatwar', civ: 0 },
    { op: 'civatwar', civ: 1 },
    { op: 'civatwar', civ: 3 },                                          // 死国自身仍可由 rel 判
  ],
});

// —— 激活度自检（宣战/止战/固化三指纹） ——
const HUNT = process.env.PW_HUNT === '1';
if (HUNT) {
  for (const c of CASES) {
    const r = runCase(c);
    const warEvts = r.steps.flatMap((s) => s.evts).filter((e) => e.kind === 'casus').length;
    const peaceEvts = r.steps.flatMap((s) => s.evts).filter((e) => e.kind === 'peace').length;
    const totalWar = r.steps.some((s) => s.warData.some((w) => w.total));
    const totalDraws = r.steps.reduce((a, s) => a + s.draws, 0);
    console.log(`${c.name}: draws=${totalDraws} casus=${warEvts} peace=${peaceEvts} totalWar=${totalWar} warData=${r.steps.at(-1).warData.length} statWars=${r.steps.at(-1).statWars}`);
  }
}

const out = {
  ep: EP_ECHO,
  raceDiplo: RACE_DIPLO, raceAggr: RACE_AGGR, raceGreed: RACE_GREED,
  raceRelBase: RACE_REL_BASE_ECHO,
  civRaceIds: CIV_RACE_IDS,
  cases: CASES.map(runCase),
};
writeFileSync(new URL('./golden-units-wars.json', import.meta.url), JSON.stringify(out));
console.log('golden-units-wars.json written:', out.cases.length, 'cases,', out.cases.reduce((a, c) => a + c.steps.length, 0), 'steps');
