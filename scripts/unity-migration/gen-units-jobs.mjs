// ============================================================================
// gen-units-jobs.mjs —— M-U3 切片 4「职业链 + techMods + popCap + 旨意生命周期」黄金向量
// 蓝本：src/lib/game/engine.ts
//   rollJob L1535-1541（JOBS 加权抽取）+ setJob L1544-1554（相对乘数转职）+
//   JOBS types.ts L296-306（8 职 weight 46/24/14/8/5/2/1/0——king 0 永不自然出生）+
//   spawnUnit civ 分支（L1383-1386 job 抽取 / L1390-1392 techModsOf tH/tD 快照 /
//   L1393·L1404·L1405 jd×td×gov 乘序 / L1426 civs.pop++）+
//   updateUnitPostJS repro civ 分支（L4405-4406 populate ×1.8 × techRepro×(1+ideaRepro) /
//   L4412 civAtWar ×0.55 / L4420-4430 pop<popCap+6 门 + childGene/tryEmergentTrait/
//   newFamily 25%/spawnUnit civ silent + heart fx）+
//   techModsOf L4990-5005（NEUTRAL_MODS + modsOfTechs tech.ts L171-232 + techModCache +
//   emTechs 涌现科技叠加契约空）+ ideaModsOf L9003-9021（emIdeas mods 六元累积 +
//   ideaModCache）+ popCapOf L2066-2076（houseTierOf L12407-12414 masonry/fortification/
//   gothic 0-3 + civBuildCounts 分类计数 + BUILDING_DEFS popCap house4/capital6/farm2 +
//   n=4 兜底 civ.houses）+ rebuildCivBuildCounts L2087-2096（civBuildCounts + marketIdx）+
//   activeDirective L7887-7892 + DIRECTIVE_META L7895-7908（12 旨意 years/param/label）+
//   issueDirective L7911-7930（2-active 上限 + 同类去重 + dirSeq + deadlineTick years×40 +
//   describeDirective + applyDirectiveImpulse + decree 事件）+ describeDirective L7932-7950
//   （12 逐字文案）+ applyDirectiveImpulse L7953-8005（annihilate/conquer 神谕圣战
//   declareWar holy force + giveUpAt+800 + tryFormArmy 契约空；mobilize mobilizeUntil
//   (deadline-tick)×0.8 + setJob 0/1/5→2 全民武装；legion armyCd=0 + tryFormArmy×2；
//   alliance met.add + rel max(45) + makePeace -20 门 + formAlliance/joinAlliance 真实现）+
//   directiveTick L8008-8022（逆序迭代 + endTick 200 清理 + 亡国 fail + eval + 期限）+
//   evalDirective L8025-8097（12 条件：annihilate 目标亡 / conquer warData 分数 ≥45 /
//   expand owner 扫描 / wealth gold / wisdom knowledge / populate pop / legion armies 空
//   契约恒 0 / build houses / unify victoryCiv / mobilize killCount / alliance 同盟旗 /
//   rel≥60 兜底 / temple civBuildCounts TEMPLE）+ finishDirective L8100-8119（success
//   gold+120 + armies 士气契约空 + decreeOk；fail gold-60 夹 0 + decreeFail）+
//   directiveProgressOf L8122-8128 + onWarKill mobilize killCount L7429-7433 +
//   makePeace 未竟旨意 L7795-7803（WbWars 哨兵开闸）。
// 直接 import 现役 engine.ts（真实现，零同源复制）：原型链 stub 驱动（Task 140 模式）。
// 步语义：step op = rebuildBuckets → update 活数组循环（pre+scan+combat+tail+post 全真实现）
//   → unitsReap() → tickCount++（循环内新生同拍被驱动——TS for(i<units.length) 活数组序）。
//   dtick op = directiveTick() 显式驱动（真实 tick 每 30 拍——parity 显式化逐 op 对账）。
// op 语义：spawn=spawnUnit(civ≥0 开闸) / step=单位步 / dtick=directiveTick / issue=
//   issueDirective（返回 id 或 null 进 probe）/ rebuild=rebuildCivBuildCounts / bld=建筑预置
//   （warinfo 镜像 + houses++）/ setciv=civ 字段补丁 / setocc=占领层 / setemidea=emIdeas
//   注入（ideaModsOf 涌现面——理念发明系统另切片）/ setvict=victoryCiv / war / peace / adv /
//   setrel / met / warkill=onWarKill / killciv / probe: popcap/tmod(26 元位串)/imod(6 元)/
//   prog(civ+kind→progress)。
// 截断契约（C# 侧哨兵/no-op 同构，触达即设计错误）：
//  ① tryFormArmy no-op 事件标记（armies 域 M-U3 后续切片——levy/集结/rng 全不触达）；
//  ② armies 空表——legion eval 恒 0 / finishDirective 士气循环 no-op / onWarKill 军团战功 no-op；
//  ③ emTechs 空表——techModsOf 涌现科技叠加段零触达（techModCache 真实现）；
//  ④ toast/onSound/setFrozen——UI/采集域 no-op；
//  ⑤ findCivNear/createCiv——spawnUnit civ<0 野人立国域哨兵（场景契约 civ≥0 显式给国）；
//  ⑥ 非静默 spawn 播报——场景契约 silent=true（UI 域 M-U5）。
// rng 消耗点（对账指纹）：rollJob 1 抽/civ spawn（无 job opt）；spawnUnit trait 15%（trait
//   defined 跳过）/maxAge/flip/breath/家族 6%（fam defined 跳过）；repro gate1/gate2 +
//   childGene 5 抽 + tryEmergentTrait 6%（极端基因门）+ 家族 25% + spawn 位置 ×2；
//   declareWar force+quiet 零抽（pickCasus 短路）；makePeace 主链零抽（armies 空停战级联
//   no-op）；formAlliance 词法 1 抽（essence rng×6）；joinAlliance 世仇 0.7 拒绝掷。
// 运行：bun scripts/unity-migration/gen-units-jobs.mjs（PW_SEEDS 环境变量通道 + --hunt 激活度自检）
// 输出：scripts/unity-migration/golden-units-jobs.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, TRAITS, JOBS, ALLIANCE_COLORS, RACE_REL_BASE } from '../../src/lib/game/types.ts';
import { FIRST } from '../../src/lib/game/names.ts';
import { WB } from '../../src/lib/wasm/wbspatial.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { neuroStats } from '../../src/lib/game/neuro.ts';
import { writeFileSync } from 'node:fs';

const W = 256, H = 160;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };

neuroStats.enabled = false;          // 本切片无战斗决策场景（civ 同国互不为敌）——教师面不触达
WB.setEnabled(false);                // WASM 分流关闭——JS 路径为准（M-U2b 契约）

const EP = {
  panicDecay: ep('social.panicDecay'), grudgeDecay: ep('social.grudgeDecay'),
  fireDamage: ep('fire.damage'), panicRout: ep('social.panicRout'),
  reproMul: ep('pop.reproMul'), mutationRate: ep('evo.mutationRate'),
};

const pickRace = (key) => {
  for (const k of Object.keys(RACES)) if (RACES[k].key === key) return Number(k);
  throw new Error('race not found: ' + key);
};
// 文明种族 echo（human 全场景 + elf/orc 战争对峙面）
const RACE_KEYS = ['human', 'elf', 'orc'];
const raceIds = {};
const raceTable = {};
for (const k of RACE_KEYS) {
  const id = pickRace(k);
  raceIds[k] = id;
  const d = RACES[id];
  raceTable[String(id)] = {
    // 位序铁律（WbConstants F* 对齐——repro gen 同约定）：hostile=1/isCiv=2/undead=4/predator=8/lavaImmune=16
    flags: (d.hostile ? 1 : 0) | (d.isCiv ? 2 : 0) | (d.undead ? 4 : 0) | (d.predator ? 8 : 0) | (d.lavaImmune ? 16 : 0),
    // tbf 位序（repro gen 同约定）：tbf0 flying=32/aquatic=64/sandswim=128；tbf1 coldBlood=4/beach=8/nightsight=16
    tbf0: (d.flying ? 32 : 0) | (d.aquatic ? 64 : 0) | (d.sandswim ? 128 : 0),
    tbf1: (d.coldBlood ? 4 : 0) | (d.beach ? 8 : 0) | (d.nightsight ? 16 : 0),
    reach: d.reach === undefined ? null : d.reach,
    speed: d.speed, repro: d.repro ?? 0,
    growth: d.growth === undefined ? null : d.growth,
    maxAge: d.maxAge, hp: d.hp, dmg: d.dmg,
  };
}

// JOBS echo（8 职——C# host 数据面；weight/hpMul/dmgMul/speedMul 全回显零硬编码）
const JOBS_ECHO = JOBS.map((j) => ({ key: j.key, hpMul: j.hpMul, dmgMul: j.dmgMul, speedMul: j.speedMul, weight: j.weight }));

// FIRST 名池 echo（human——uniqueName）
const FIRST_ECHO = {};
for (const [rid, pool] of Object.entries(FIRST)) FIRST_ECHO[rid] = [...pool];

// 涌现特质词法面（repro childGene/tryEmergentTrait 真实现驱动）
const TRAIT_DEFS_ECHO = {};
for (const [k, t] of Object.entries(TRAITS)) {
  if (k.startsWith('dt')) continue;
  TRAIT_DEFS_ECHO[k] = { hpMul: t.hpMul ?? 1, dmgMul: t.dmgMul ?? 1, speedMul: t.speedMul ?? 1, regen: t.regen ?? 0, immune: !!t.immune };
}
const TRAIT_KEYS = Object.keys(TRAIT_DEFS_ECHO);
const EM_ECHO = {
  traitPrefix: ['碎星', '夜嚎', '铁鬃', '影步', '雷鸣', '霜牙'],
  traitBody: ['利爪', '坚骨', '疾风', '毒腺', '厚皮', '锐目'],
  famPre: ['荆棘', '黑岩', '灰羽', '白川', '铁木', '红沙'],
  famPost: ['氏族', '部族', '家系', '血脉'],
};

const ALLIANCE_COLORS_ECHO = [...ALLIANCE_COLORS];
const RACE_REL_BASE_ECHO = { ...RACE_REL_BASE };   // shiftRaceRel 基线表（formAlliance 跨种族 +9 消费面）

const bitHex = (d) => {
  if (typeof d === 'number' && Object.is(d, -0)) d = 0;   // -0 归一（JSON 丢失符号——Task 143 课）
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// mkCiv：文明全字段（tiles 浅拷贝铁律——模块级常量数组会被 concludeByScore/扩张原地污染——Task 149 课）
const mkCiv = (o) => ({
  id: o.id, name: o.name, race: o.race, colorHex: o.colorHex ?? '#cccccc',
  pop: o.pop ?? 10, tiles: [...(o.tiles ?? [])], frontier: [],
  houses: o.houses ?? 0, capital: o.capital ?? -1, alive: o.alive !== false,
  gold: o.gold === undefined ? undefined : o.gold,
  knowledge: o.knowledge === undefined ? undefined : o.knowledge,
  techs: [...(o.techs ?? [])],
  ideas: [...(o.ideas ?? [])],
  militarism: o.militarism === undefined ? undefined : o.militarism,
  gov: o.gov === undefined ? undefined : o.gov,
  armyCd: o.armyCd === undefined ? undefined : o.armyCd,
  stability: o.stability === undefined ? undefined : o.stability,
  expense: o.expense === undefined ? undefined : o.expense,
  mobilizeUntil: o.mobilizeUntil === undefined ? undefined : o.mobilizeUntil,
  culture: o.culture === undefined ? undefined : o.culture,
});

// mkTsUnit（单位 stub——repro gen 同构；job 显式化）
const U = (o) => ({
  id: o.id, race: o.race, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
  age: o.age ?? 0, maxAge: o.maxAge ?? 55, hp: o.hp ?? 100, maxHp: o.maxHp ?? 100,
  dmg: o.dmg === undefined ? null : o.dmg,
  kills: o.kills ?? 0, hurt: o.hurt === undefined ? null : o.hurt, cd: o.cd ?? 0,
  atk: o.atk ?? 0, chill: o.chill === undefined ? null : o.chill,
  fleeT: o.fleeT ?? 0, bless: o.bless ?? 0, curse: o.curse ?? 0,
  fert: o.fert ?? 0, detour: o.detour ?? 0,
  panic: o.panic === undefined ? null : o.panic,
  gids: o.gids === undefined ? null : o.gids, gval: o.gval === undefined ? null : o.gval,
  food: o.food === undefined ? null : o.food,
  stk: o.stk === undefined ? null : o.stk,
  sxk: o.sxk === undefined ? null : o.sxk, syk: o.syk === undefined ? null : o.syk,
  infected: !!o.infected, grab: o.grab ?? 0, boat: o.boat ?? 0,
  civ: o.civ ?? -1, job: o.job ?? 0, flip: !!o.flip,
  dead: !!o.dead, caravan: o.caravan ?? 0,
  speed: o.speed === undefined ? null : o.speed,
  wep: o.wep === undefined ? null : o.wep, arm: o.arm === undefined ? null : o.arm,
  hlm: o.hlm === undefined ? null : o.hlm, shd: o.shd === undefined ? null : o.shd,
  bts: o.bts === undefined ? null : o.bts, rng: o.rng === undefined ? null : o.rng,
  amu: o.amu === undefined ? null : o.amu,
  trait: o.trait === undefined ? null : o.trait,
  king: !!o.king, fam: o.fam === undefined ? null : o.fam, army: o.army === undefined ? null : o.army,
  boatTTL: o.boatTTL ?? 0, thrT: o.thrT ?? 0, grabTTL: o.grabTTL ?? 0,
  gene: o.gene === undefined ? null : o.gene, fgn: o.fgn === undefined ? null : o.fgn,
  beachT: o.beachT ?? 0,
  name: o.name ?? ('U' + (o.id ?? '?')),
});
const mkTsUnit = (spec) => {
  const u = { id: spec.id, race: spec.race, x: spec.x, y: spec.y, tx: spec.tx, ty: spec.ty };
  if (spec.age !== undefined) u.age = spec.age;
  if (spec.maxAge !== undefined) u.maxAge = spec.maxAge;
  if (spec.hp !== undefined) u.hp = spec.hp;
  if (spec.maxHp !== undefined) u.maxHp = spec.maxHp;
  if (spec.dmg !== undefined) u.dmg = spec.dmg ?? 0;
  u.kills = spec.kills ?? 0;
  if (spec.hurt !== null) u.hurt = spec.hurt;
  u.cd = spec.cd ?? 0;
  if (spec.atk) u.atk = spec.atk;
  if (spec.chill !== null) u.chill = spec.chill;
  if (spec.fleeT) u.fleeT = spec.fleeT;
  if (spec.bless) u.bless = spec.bless;
  if (spec.curse) u.curse = spec.curse;
  if (spec.fert) u.fert = spec.fert;
  if (spec.detour) u.detour = spec.detour;
  if (spec.panic !== null) u.panic = spec.panic;
  if (spec.gids !== null) { u.gIds = [...spec.gids]; u.gVal = [...spec.gval]; }
  if (spec.food !== null) u.food = spec.food;
  if (spec.infected) u.infected = true;
  if (spec.grab) u.grab = spec.grab;
  if (spec.boat) { u.boat = spec.boat; u.boatTTL = spec.boatTTL ?? 900; }
  u.civ = spec.civ; u.job = spec.job; u.flip = spec.flip;
  if (spec.dead) u.dead = true;
  if (spec.caravan) u.caravan = spec.caravan;
  if (spec.speed !== null) u.speed = spec.speed;
  if (spec.wep !== null) u.wep = spec.wep;
  if (spec.arm !== null) u.arm = spec.arm;
  if (spec.hlm !== null) u.hlm = spec.hlm;
  if (spec.shd !== null) u.shd = spec.shd;
  if (spec.bts !== null) u.bts = spec.bts;
  if (spec.rng !== null) u.rng = spec.rng;
  if (spec.amu !== null) u.amu = spec.amu;
  if (spec.trait !== null) u.trait = spec.trait;
  if (spec.king) u.king = true;
  if (spec.fam !== null) u.fam = spec.fam;
  if (spec.army !== null) u.army = spec.army;
  if (spec.boatTTL) u.boatTTL = spec.boatTTL;
  if (spec.thrT) u.thrT = spec.thrT;
  if (spec.grabTTL) u.grabTTL = spec.grabTTL;
  if (spec.gene !== null) u.gene = { ...spec.gene };
  if (spec.fgn !== null) u.fgn = spec.fgn;
  if (spec.beachT) u.beachT = spec.beachT;
  u.name = spec.name;
  return u;
};

const snapU = (u) => ({
  id: u.id, race: u.race,
  age: bitHex(u.age), hp: bitHex(u.hp), maxAge: bitHex(u.maxAge), maxHp: bitHex(u.maxHp),
  hurt: u.hurt === undefined ? null : bitHex(u.hurt), cd: bitHex(u.cd ?? 0), atk: bitHex(u.atk ?? 0),
  chill: u.chill === undefined ? null : bitHex(u.chill),
  fleeT: bitHex(u.fleeT ?? 0), bless: bitHex(u.bless ?? 0), curse: bitHex(u.curse ?? 0),
  fert: bitHex(u.fert ?? 0), detour: bitHex(u.detour ?? 0),
  panic: u.panic === undefined ? null : bitHex(u.panic),
  food: u.food === undefined ? null : bitHex(u.food),
  infected: !!u.infected, dead: !!u.dead, grab: u.grab ?? 0, boat: u.boat ?? 0,
  caravan: u.caravan ?? 0,
  dmg: bitHex(u.dmg ?? 0), kills: u.kills ?? 0,
  x: bitHex(u.x), y: bitHex(u.y), tx: bitHex(u.tx), ty: bitHex(u.ty),
  trait: u.trait === undefined ? null : u.trait,
  king: !!u.king, fam: u.fam === undefined ? null : u.fam, army: u.army === undefined ? null : u.army,
  lx: u.lx === undefined ? null : bitHex(u.lx), ly: u.ly === undefined ? null : bitHex(u.ly),
  flip: !!u.flip, job: u.job ?? 0, civ: u.civ ?? -1,
  name: u.name,
  speed: u.speed === undefined ? null : bitHex(u.speed),
  gene: u.gene === undefined ? null : { s: bitHex(u.gene.s), d: bitHex(u.gene.d), h: bitHex(u.gene.h), r: bitHex(u.gene.r) },
  fgn: u.fgn === undefined ? null : u.fgn,
  breath: u.breath === undefined ? null : bitHex(u.breath),
  uparity: u.parity === undefined ? null : u.parity,
  beachT: u.beachT ?? 0,
  tdmg: u.tDmg === undefined ? null : bitHex(u.tDmg),
  thp: u.tHp === undefined ? null : bitHex(u.tHp),
});

// 地形规格（草地主面 + 湖泊对照——移动语义 Uint8 + 领土语义共用 3=GRASS）
const TERRAIN_SPECS = [
  { name: 'plains', def: T.GRASS, patches: [] },
  { name: 'lake', def: T.GRASS, patches: [[0, 0, W, 20, T.WATER], [0, H - 20, W, H, T.WATER]] },
];
const buildGrid = (spec) => {
  const g = new Uint8Array(W * H).fill(spec.def);
  for (const [x1, y1, x2, y2, t] of spec.patches)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) g[y * W + x] = t;
  return g;
};

const dumpWild = (eng) => [...eng.wildCount.entries()].sort((a, b) => a[0] - b[0]);
const dumpItems = (eng) => eng.items.map((it) => ({ id: it.id, kind: it.kind, x: bitHex(it.x), y: bitHex(it.y) }));
const dumpFamilies = (eng) => [...eng.families.entries()].sort((a, b) => a[0] - b[0]).map(([id, f]) => ({ id, name: f.name, members: f.members, kills: f.kills, heroes: f.heroes, peak: f.peak, founded: f.founded, founder: f.founder, milestones: f.milestones }));
const dumpDirectives = (eng) => [...eng.directives].map((d) => ({
  id: d.id, civ: d.civ, kind: d.kind, target: d.target === undefined ? null : d.target,
  param: d.param, status: d.status, startTick: d.startTick,
  deadlineTick: d.deadlineTick === undefined ? null : d.deadlineTick,
  text: d.text,
  endTick: d.endTick === undefined ? null : d.endTick,
  endText: d.endText === undefined ? null : d.endText,
  killCount: d.killCount === undefined ? null : d.killCount,
}));
const dumpCivs = (eng) => eng.civs.map((cv) => cv === undefined ? null : ({
  id: cv.id, name: cv.name, pop: bitHex(cv.pop),
  gold: cv.gold === undefined ? null : bitHex(cv.gold),
  knowledge: cv.knowledge === undefined ? null : bitHex(cv.knowledge),
  houses: cv.houses, alive: cv.alive, armyCd: cv.armyCd === undefined ? null : cv.armyCd,
  mobilizeUntil: cv.mobilizeUntil === undefined ? null : bitHex(cv.mobilizeUntil),
  gov: cv.gov === undefined ? null : cv.gov,
  techs: [...(cv.techs ?? [])], ideas: [...(cv.ideas ?? [])],
  tiles: [...cv.tiles], frontier: [...cv.frontier],
}));
const dumpAlliances = (eng) => eng.alliances.map((al) => ({
  id: al.id, name: al.name, members: [...al.members], leader: al.leader,
  cohesion: bitHex(al.cohesion), colorHex: al.colorHex, formedTick: al.formedTick,
}));
const dumpRel = (m) => [...m.entries()].map(([k, v]) => [k, bitHex(v)]);
const dumpMapI = (m) => [...m.entries()].map(([k, v]) => [k, v]);
const TM_KEYS = ['dmg', 'hp', 'bhp', 'gold', 'know', 'repro', 'col', 'tax', 'cult', 'repair', 'stab', 'morale', 'armyMax', 'archer', 'plague', 'range', 'arty', 'bomber', 'nukeCap', 'laser', 'drone', 'orbital', 'mech', 'ai', 'plasma', 'antiMatter'];
const dumpTm = (tm) => Object.fromEntries(TM_KEYS.map((k) => [k, bitHex(tm[k])]));
const dumpIm = (im) => ({ gold: bitHex(im.gold), stab: bitHex(im.stab), mil: bitHex(im.mil), know: bitHex(im.know), repro: bitHex(im.repro), wear: bitHex(im.wear) });

function makeStubEng(env, cap) {
  const eng = Object.create(GameEngine.prototype);
  // —— 单位域面（repro gen 同构） ——
  eng.terrain = new Uint8Array(W * H);
  eng.road = new Uint8Array(W * H);
  eng.fire = new Uint8Array(W * H);
  eng.radiate = new Uint8Array(W * H);
  eng.fireSet = new Set(env.fireSet ?? []);
  eng.building = new Uint8Array(W * H);
  eng.bw = W / 4; eng.bh = H / 4;
  eng.buckets = Array.from({ length: eng.bw * eng.bh }, () => []);
  eng.bucketStampArr = new Int32Array(eng.bw * eng.bh);
  eng.bucketStamp = 0;
  eng.ghostBuckets = [];
  eng.enemyLut = new Map();
  eng.dynRaces = new Map();
  eng.blood = []; eng.corpses = [];
  eng.activeBattles = new Map();
  eng.statDragonsSlain = 0;
  eng.wildCount = new Map(env.wild ?? []);
  eng.items = (env.items ?? []).map((it) => ({ ...it }));
  eng.itemSeq = env.itemSeq ?? 1;
  eng.families = new Map(env.families ?? []);
  eng.familySeq = env.familySeq ?? 1;
  eng.unitSeq = env.unitSeq ?? 1000;
  eng.grassTiles = env.grassTiles ?? 0;
  eng.yearF = env.yearF ?? 0;
  eng.dynTraits = new Map();
  eng.traitSeq = env.traitSeq ?? 0;
  eng.evoSeq = 0; eng.evoIndex = new Map(); eng.evoNodes = [];
  eng.speciesBase = new Map();
  eng.unitById = new Map();
  eng.nature = { season: env.season ?? 0, bloodMoonTTL: env.bloodMoonTtl ?? 0, eclipseTTL: env.eclipseTtl ?? 0, reproMul() { return this.season === 0 ? 1.14 : this.season === 3 ? 0.78 : 1; } };   // nature.ts L371-374 机械镜像
  eng.moonIllum = () => env.moonIllum ?? 0;
  eng.fxPrefs = { get ambience() { return env.ambience ?? false; }, get blood() { return env.fxBlood ?? true; }, get dmgNumbers() { return env.fxDmgNumbers ?? true; }, get corpses() { return env.fxCorpses ?? true; } };
  eng.frameCount = env.frameCount ?? 100;
  eng.tickCount = env.tick ?? 0;                          // ⚠ 类字段原型链不继承——漏初始化 → NaN → 期限永不触发
  eng.laws = { undeadRise: false, zombieInfect: env.lawsZombie ?? false, reproduction: env.lawsRepro !== false, zombieVirus: env.lawsZombieVirus !== false, cityGrowth: true };
  // —— 战争域面（warinfo gen 同构） ——
  eng.civs = [];
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
  eng.allianceSeq = env.allianceSeq ?? 1;
  eng.armies = [];                                       // 截断②
  eng.emergentWeapons = new Map();
  eng.killCredit = null;
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };   // 大战 idle
  eng.statWars = 0;
  eng.lastCatastrophe = { tick: -1000000000, x: -1, y: -1 };
  eng.ecoState = env.ecoState ?? 'balanced';
  eng.owner = new Int16Array(W * H).fill(-1);
  eng.occCiv = new Int8Array(W * H).fill(-1);
  eng.occStr = new Uint8Array(W * H);
  eng.occSet = new Set();
  eng.buildings = []; eng.bIdx = new Map(); eng.bHp = new Map();
  eng.damagedSet = new Set();
  eng.dirty = new Set();
  eng.overlayMode = 'none'; eng.overlayDirty = false;
  // —— M-U3 切片 4 开闸面：directives/techs/ideas/popCap ——
  eng.directives = [];
  eng.dirSeq = env.dirSeq ?? 1;
  eng.victoryCiv = null;
  eng.techModCache = new Map();
  eng.emTechs = new Map();                               // 截断③（涌现科技发明域另切片）
  eng.ideaModCache = new Map();
  eng.emIdeas = new Map();                               // 场景注入（ideaModsOf 涌现面真实现）
  eng.civBuildCounts = new Map();
  eng.marketIdx = new Map();
  eng.tileX = (i) => i % W;
  eng.tileY = (i) => (i / W) | 0;
  eng.eventSeq = 0; eng.toastSeq = 0;                    // ⚠ 类字段原型链不继承——漏初始化 → id NaN → JSON null（Task 144 铁律重演）
  eng.grabbedTick = (u) => cap.evt.push(['grab', u.id]);
  eng.updateBoat = (u) => cap.evt.push(['boat', u.id]);
  eng.riseSkeleton = (x, y) => cap.evt.push(['rise', bitHex(x), bitHex(y)]);
  eng.spreadPlague = (u) => cap.evt.push(['plague', u.id]);
  eng.addEvent = (kind, text, opts) => cap.evt.push(['ev', kind, text,
    opts?.colorHex === undefined ? null : opts.colorHex,
    opts?.x === undefined ? null : bitHex(opts.x), opts?.y === undefined ? null : bitHex(opts.y)]);
  eng.toast = () => {};                                  // 截断④
  eng.onSound = null;
  eng.setTerrain = (i, t) => { if (eng.terrain[i] === t) return; const old = eng.terrain[i]; eng.terrain[i] = t; cap.terr.push([i, old, t]); };
  eng.updateUnitTailJS = (u) => { cap.evt.push(['tail', u.id]); return false; };
  eng.tryFormArmy = (civ, target) => eng.addEvent('tryFormArmy', `__stub__${civ.id}:${target === undefined ? 'null' : target}`, {});   // 截断①（经 addEvent 双捕获——事件流对账）
  // ⚠ updateUnit/updateUnitPostJS/unitsReap/techModsOf/ideaModsOf/popCapOf/houseTierOf/
  //    rollJob/setJob/activeDirective/issueDirective/applyDirectiveImpulse/describeDirective/
  //    directiveTick/evalDirective/finishDirective/directiveProgressOf/rebuildCivBuildCounts/
  //    declareWar/makePeace/formAlliance/joinAlliance 不 stub——真实现
  eng.fx = (kind, x, y, ttl) => cap.fx.push({ k: kind, x: bitHex(x), y: bitHex(y), ttl });
  return eng;
}

const SEEDS = JSON.parse(process.env.PW_SEEDS ?? '{}');
function seedOf(name, dflt) { return SEEDS[name] ?? dflt; }

const CASES = [];
// S1 spawn-jobs：双国对照——civ0 帝制(gov 4)+青铜/铁器（tD=1+0.15+0.18 tH=1+0.10）vs civ1
//   部落无科技（tm=NEUTRAL）；4+2 次无 opt 抽职（rollJob 加权 46/24/14/8/5/2/1/0）+ 1 次
//   job=2 显式 + civs.pop++ 链；jd×t×gov 乘序（maxHp/dmg/speed 位模式）
CASES.push({
  name: 'spawn-jobs', mode: 'ops', terrain: 'plains', seed: seedOf('spawn-jobs', 71),
  env: { unitSeq: 100, yearF: 3.2, tick: 5 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 10, gov: 4, techs: ['bronze', 'iron'] },
    { id: 1, name: '磐石国', race: raceIds.human, colorHex: '#5ba8e0', pop: 8 },
  ],
  units: [],
  ops: [
    { op: 'tmod', civ: 0 }, { op: 'tmod', civ: 1 },
    { op: 'spawn', race: 'human', x: 60.5, y: 60.5, civ: 0 },
    { op: 'spawn', race: 'human', x: 62.5, y: 61.5, civ: 0 },
    { op: 'spawn', race: 'human', x: 120.5, y: 70.5, civ: 1 },
    { op: 'spawn', race: 'human', x: 122.5, y: 71.5, civ: 1, job: 2 },
    { op: 'spawn', race: 'human', x: 124.5, y: 72.5, civ: 1 },
    { op: 'spawn', race: 'human', x: 64.5, y: 62.5, civ: 0 },
  ],
});
// S2 repro-civ-tech：火种/灌溉/重犁（tm.repro 1+0.08+0.08+0.12=1.28）+ 双宅一都
//   （popCap=2×(4+0)+6=14）—— fert 母代 ×2.5；生育→pop++→heart fx→childGene→家族
CASES.push({
  name: 'repro-civ-tech', mode: 'ops', terrain: 'plains', seed: seedOf('repro-civ-tech', 6),
  env: { unitSeq: 200, season: 0, grassTiles: 9000, yearF: 12.5, lawsRepro: true },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 6, techs: ['fire', 'irrigation', 'plow'] },
  ],
  units: [
    U({ id: 1, race: 'human', x: 60.5, y: 60.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, age: 2, maxAge: 60, fert: 1 }),
    U({ id: 2, race: 'human', x: 63.5, y: 61.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, age: 2, maxAge: 60 }),
  ],
  ops: [
    { op: 'bld', i: 14 * 16 + 14, kind: 1, civ: 0 },
    { op: 'bld', i: 14 * 16 + 17, kind: 1, civ: 0 },
    { op: 'bld', i: 16 * 16 + 15, kind: 2, civ: 0 },
    { op: 'rebuild' },
    { op: 'popcap', civ: 0 },
    { op: 'tmod', civ: 0 },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
  ],
});
// S3 repro-civ-popcap：pop 19 预置 vs cap 14（+6 容差门 19<20 真值）→ 首胎通过 pop→20
//   → 后续 gate2 照掷但 20<20 假值拒生——承载边界精确指纹（掷骰照耗零事件）
CASES.push({
  name: 'repro-civ-popcap', mode: 'ops', terrain: 'plains', seed: seedOf('repro-civ-popcap', 4),
  env: { unitSeq: 300, season: 0, grassTiles: 9000, lawsRepro: true },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 19 },
  ],
  units: [
    U({ id: 11, race: 'human', x: 60.5, y: 60.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, age: 2, maxAge: 60, fert: 1 }),
    U({ id: 12, race: 'human', x: 63.5, y: 61.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, age: 2, maxAge: 60, fert: 1 }),
  ],
  ops: [
    { op: 'bld', i: 14 * 16 + 14, kind: 1, civ: 0 },
    { op: 'bld', i: 14 * 16 + 17, kind: 1, civ: 0 },
    { op: 'bld', i: 16 * 16 + 15, kind: 2, civ: 0 },
    { op: 'rebuild' },
    { op: 'popcap', civ: 0 },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
  ],
});
// S4 repro-civ-war-populate：人口令 ×1.8 + 交战 ×0.55 + 爱之理念 repro+0.2（emIdeas 注入
//   ——ideaModsOf 涌现面真实现）+ 恐慌母代 ×0.3 + 春季 ×1.14——boost 乘积指纹
CASES.push({
  name: 'repro-civ-war-populate', mode: 'ops', terrain: 'plains', seed: seedOf('repro-civ-war-populate', 12),
  env: { unitSeq: 400, season: 0, grassTiles: 9000, lawsRepro: true },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 6, ideas: ['love'] },
    { id: 1, name: '磐石国', race: raceIds.orc, colorHex: '#5ba8e0', pop: 8 },
  ],
  units: [
    U({ id: 21, race: 'human', x: 60.5, y: 60.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, age: 2, maxAge: 60, fert: 1, panic: 0.9 }),
    U({ id: 22, race: 'human', x: 66.5, y: 62.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, age: 2, maxAge: 60 }),
  ],
  ops: [
    { op: 'bld', i: 14 * 16 + 14, kind: 1, civ: 0 },
    { op: 'bld', i: 16 * 16 + 15, kind: 2, civ: 0 },
    { op: 'rebuild' },
    { op: 'setemidea', key: 'love', mods: { gold: 0.1, stab: 0, mil: 0, know: 0, repro: 0.2, wear: -0.05 } },
    { op: 'imod', civ: 0 },
    { op: 'issue', civ: 0, kind: 'populate' },
    { op: 'war', agg: 1, vic: 0, reason: 'border', opts: { force: true, quiet: true } },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
    { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' }, { op: 'step' },
  ],
});
// S5 dir-wealth-wisdom：富国令 300（setciv gold 320 → dtick success gold+120=440）+
//   启智令 200（期限 60×40=2400 拍 → adv 2402 → dtick fail gold-60=380 夹 0 链）+
//   2-active 上限（第三道 populate 旨意拒发 probe null）+ endTick 200 清理
CASES.push({
  name: 'dir-wealth-wisdom', mode: 'ops', terrain: 'plains', seed: seedOf('dir-wealth-wisdom', 31),
  env: { tick: 100, yearF: 2.5 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 10, gold: 50, knowledge: 10 },
  ],
  units: [],
  ops: [
    { op: 'issue', civ: 0, kind: 'wealth' },
    { op: 'issue', civ: 0, kind: 'wisdom' },
    { op: 'issue', civ: 0, kind: 'populate' },
    { op: 'setciv', id: 0, patch: { gold: 320 } },
    { op: 'dtick' },
    { op: 'adv', n: 2402 },
    { op: 'dtick' },
    { op: 'adv', n: 201 },
    { op: 'dtick' },
  ],
});
// S6 dir-mobilize：总动员令 param 2（opcode param>0 覆盖 meta 30）——impulse 全民武装
//   （job 0/1/5→2 setJob 相对转职 hp/dmg/speed 位模式 + armed 计数战报）+ mobilizeUntil
//   (deadline-tick)×0.8 + 两次 warkill 战果计数 → dtick success
CASES.push({
  name: 'dir-mobilize', mode: 'ops', terrain: 'plains', seed: seedOf('dir-mobilize', 907),
  env: { unitSeq: 500, tick: 40, yearF: 1.0 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 6 },
    { id: 1, name: '磐石国', race: raceIds.orc, colorHex: '#5ba8e0', pop: 8 },
  ],
  units: [
    U({ id: 31, race: 'human', x: 60.5, y: 60.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, job: 0 }),
    U({ id: 32, race: 'human', x: 61.5, y: 61.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, job: 1 }),
    U({ id: 33, race: 'human', x: 62.5, y: 62.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, job: 5 }),
    U({ id: 34, race: 'human', x: 63.5, y: 63.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, job: 2 }),
    U({ id: 35, race: 'human', x: 64.5, y: 64.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045, job: 3 }),
    U({ id: 36, race: 'human', x: 65.5, y: 65.5, civ: 0, dmg: 3, hp: 30, maxHp: 30, speed: 0.045 }),
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border', opts: { force: true, quiet: true } },
    { op: 'issue', civ: 0, kind: 'mobilize', param: 2 },
    { op: 'warkill', kc: 0, vc: 1 },
    { op: 'warkill', kc: 0, vc: 1 },
    { op: 'dtick' },
  ],
});
// S7 dir-annihilate-peace：灭国令（神谕圣战 holy force+total giveUpAt+800 + tryFormArmy
//   契约标记）→ 停战未竟旨意 finishDirective failed（WbWars 哨兵开闸）→ 再发灭国令 +
//   killciv → dtick success（目标亡 decreeOk）
CASES.push({
  name: 'dir-annihilate-peace', mode: 'ops', terrain: 'plains', seed: seedOf('dir-annihilate-peace', 1309),
  env: { tick: 200, yearF: 5.0 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 10 },
    { id: 1, name: '磐石国', race: raceIds.orc, colorHex: '#5ba8e0', pop: 8 },
  ],
  units: [],
  ops: [
    { op: 'issue', civ: 0, kind: 'annihilate', target: 1 },
    { op: 'adv', n: 100 },
    { op: 'peace', a: 0, b: 1, text: '两国罢兵', postRel: 8 },
    { op: 'dtick' },
    { op: 'adv', n: 201 },
    { op: 'dtick' },
    { op: 'issue', civ: 0, kind: 'annihilate', target: 1 },
    { op: 'killciv', id: 1 },
    { op: 'dtick' },
  ],
});
// S8 dir-conquer-score：攻城令（圣战 goal 45）——期限失败路径（80×40=3200 拍逾 → fail
//   '期限已至…王都仍屹立不倒'）+ 分数达成路径（setwd scoreA 46 → dtick success '王都陷落了'）
CASES.push({
  name: 'dir-conquer-score', mode: 'ops', terrain: 'plains', seed: seedOf('dir-conquer-score', 611),
  env: { tick: 300, yearF: 7.5 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 10 },
    { id: 1, name: '磐石国', race: raceIds.orc, colorHex: '#5ba8e0', pop: 8 },
  ],
  units: [],
  ops: [
    { op: 'issue', civ: 0, kind: 'conquer', target: 1 },
    { op: 'adv', n: 3300 },
    { op: 'dtick' },
    { op: 'issue', civ: 0, kind: 'conquer', target: 1 },
    { op: 'setwd', a: 0, b: 1, patch: { scoreA: 46 } },
    { op: 'dtick' },
    { op: 'prog', civ: 0, kind: 'conquer' },
  ],
});
// S9 dir-temple-build-expand：信仰令（bld 神殿 → rebuild → dtick success '神殿落成'）+
//   建城令（setciv houses 2 → success '城郭连绵'）+ 扩张令（setocc 4 格 owner 预置 +
//   civ.tiles 同步 → success '领土已达 4 格' + progress 1）——2-active 串行结算
CASES.push({
  name: 'dir-temple-build-expand', mode: 'ops', terrain: 'plains', seed: seedOf('dir-temple-build-expand', 217),
  env: { tick: 500, yearF: 12.5 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 10, tiles: [8041, 8042, 8043, 8044] },
  ],
  units: [],
  ops: [
    { op: 'issue', civ: 0, kind: 'temple' },
    { op: 'bld', i: 8041, kind: 10, civ: 0 },
    { op: 'rebuild' },
    { op: 'dtick' },
    { op: 'issue', civ: 0, kind: 'build', param: 2 },
    { op: 'setciv', id: 0, patch: { houses: 2 } },
    { op: 'dtick' },
    { op: 'issue', civ: 0, kind: 'expand', param: 4 },
    { op: 'setocc', i: 8041, civ: 0, str: 100 },
    { op: 'setocc', i: 8042, civ: 0, str: 100 },
    { op: 'setocc', i: 8043, civ: 0, str: 100 },
    { op: 'setocc', i: 8044, civ: 0, str: 100 },
    { op: 'dtick' },
    { op: 'prog', civ: 0, kind: 'expand' },
  ],
});
// S10 dir-alliance-legion-unify：联盟令（impulse met+rel max(45)+formAlliance 真实现
//   词法 1 抽 + eval 同盟旗 success '同叢盟旗之下'）+ 军团令（armies 空契约 eval 恒 0 →
//   期限 30×40=1200 fail）+ 统一令（setvict → success '世界已归于…旌旗之下'——years=0
//   无期限 deadlineTick 0）
CASES.push({
  name: 'dir-alliance-legion-unify', mode: 'ops', terrain: 'plains', seed: seedOf('dir-alliance-legion-unify', 89),
  env: { tick: 600, yearF: 15.0, allianceSeq: 1 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 12 },
    { id: 1, name: '磐石国', race: raceIds.elf, colorHex: '#5ba8e0', pop: 9 },
  ],
  units: [],
  ops: [
    { op: 'issue', civ: 0, kind: 'alliance', target: 1 },
    { op: 'dtick' },
    { op: 'issue', civ: 0, kind: 'legion' },
    { op: 'adv', n: 1250 },
    { op: 'dtick' },
    { op: 'adv', n: 201 },
    { op: 'dtick' },
    { op: 'setvict', id: 0 },
    { op: 'issue', civ: 0, kind: 'unify' },
    { op: 'dtick' },
  ],
});

const out = {
  w: W, h: H, ep: EP, raceIds, races: raceTable,
  jobs: JOBS_ECHO, firsts: FIRST_ECHO,
  raceRelBase: RACE_REL_BASE_ECHO,
  traitKeys: TRAIT_KEYS, traitDefs: TRAIT_DEFS_ECHO, em: EM_ECHO,
  alColors: ALLIANCE_COLORS_ECHO,
  terrainSpecs: TERRAIN_SPECS,
  cases: [],
};

for (const c of CASES) {
  const env = { ...c.env };
  const envInit = JSON.parse(JSON.stringify(env));   // 深拷贝初始 env（真实现原地变异——echo 须为初始态）
  const cap = { fx: [], evt: [], terr: [], rz: [] };
  const eng = makeStubEng(env, cap);
  eng.terrain.set(buildGrid(TERRAIN_SPECS.find((s) => s.name === c.terrain)));
  // 文明注入（tiles 浅拷贝已由 mkCiv 完成）+ owner 预置（领土一致性前提）
  for (const cv of c.civs) eng.civs[cv.id] = mkCiv(cv);
  for (const cv of eng.civs) {
    if (!cv) continue;
    for (const t of cv.tiles) eng.owner[t] = cv.id;
  }
  const units = c.units.map((s) => mkTsUnit({ ...s, race: raceIds[s.race] ?? s.race }));
  eng.units = units;
  for (const u of units) if (!u.dead && !RACES[u.race].isCiv) eng.wildCount.set(u.race, (eng.wildCount.get(u.race) ?? 0) + 1);

  let draws = 0;
  const raw = mulberry32(c.seed);
  eng.rng = () => { draws++; return raw(); };

  const evts = [];
  eng.addEvent = (kind, text, opts) => { cap.evt.push(['ev', kind, text, opts?.colorHex === undefined ? null : opts.colorHex, opts?.x === undefined ? null : bitHex(opts.x), opts?.y === undefined ? null : bitHex(opts.y)]); evts.push({ id: eng.eventSeq++, year: Math.floor(eng.yearF), kind, text, colorHex: opts?.colorHex ?? null, x: opts?.x === undefined ? null : opts.x, y: opts?.y === undefined ? null : opts.y }); };

  const outSteps = [];
  for (const op of c.ops) {
    draws = 0;
    const evMark = evts.length;
    let probe = null;
    const rec = { op: op.op };
    switch (op.op) {
      case 'spawn': {
        const u = eng.spawnUnit(raceIds[op.race] ?? op.race, op.x, op.y, {
          civ: op.civ, job: op.job, silent: true,
          trait: op.trait, gene: op.gene, fam: op.fam, fgn: op.fgn,
        });
        probe = u ? snapU(u) : null;
        break;
      }
      case 'step': {
        eng.rebuildBuckets();
        const perU = [];
        const fx0 = cap.fx.length;
        for (let i = 0; i < units.length; i++) {   // 活数组：循环内新生 push → 边界增长（C# LiveLen 同构）
          const u = units[i];
          if (u.dead) { perU.push({ dead: true }); continue; }
          const e0 = cap.evt.length, f0 = cap.fx.length;
          eng.updateUnit(u);                        // 前置+扫描+战斗树+尾段+后段（真实现）
          perU.push({
            ...snapU(u),
            evt: cap.evt.slice(e0),
            fx: cap.fx.slice(f0).map((f) => [f.k, f.x, f.y, f.ttl]),
          });
        }
        eng.unitsReap();
        rec.units = perU;
        rec.all = units.map(snapU);
        rec.fx = cap.fx.slice(fx0).map((f) => [f.k, f.x, f.y, f.ttl]);
        rec.wild = dumpWild(eng);
        rec.families = dumpFamilies(eng);
        eng.tickCount++;
        break;
      }
      case 'dtick': eng.directiveTick(); break;
      case 'issue': {
        const d = eng.issueDirective(op.civ, op.kind, op.param ?? 0, op.target);
        probe = d ? d.id : null;
        break;
      }
      case 'rebuild': eng.rebuildCivBuildCounts(); break;
      case 'bld': {
        eng.building[op.i] = op.kind;
        eng.buildings.push({ i: op.i, x: op.i % W, y: (op.i / W) | 0, kind: op.kind, civ: op.civ });
        eng.bIdx.set(op.i, eng.buildings.length - 1);
        eng.bHp.set(op.i, { 1: 70, 2: 240, 3: 120, 4: 40, 5: 150, 6: 340, 7: 90, 8: 110, 9: 100, 10: 140, 11: 200 }[op.kind] ?? 70);
        const bcv = eng.civs[op.civ];
        if (bcv && op.kind !== 11) bcv.houses++;
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
        if (op.civ >= 0 && !eng.civs[op.civ].tiles.includes(op.i)) eng.civs[op.civ].tiles.push(op.i);
        break;
      }
      case 'setemidea': eng.emIdeas.set(op.key, { mods: { ...op.mods } }); break;
      case 'setvict': eng.victoryCiv = op.id; break;
      case 'setwd': {
        const wd = eng.warData.get(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`);
        if (!wd) throw new Error('setwd: no warData ' + op.a + '-' + op.b);
        for (const [k, v] of Object.entries(op.patch)) wd[k] = v;
        break;
      }
      case 'war': eng.declareWar(op.agg, op.vic, op.reason, op.opts); break;
      case 'peace': eng.makePeace(op.a, op.b, op.text, op.postRel); break;
      case 'adv': eng.tickCount += op.n; break;
      case 'setrel': eng.rel.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'met': eng.met.add(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`); break;
      case 'warkill': eng.onWarKill({ civ: op.kc, army: undefined }, { civ: op.vc }); break;
      case 'killciv': eng.civs[op.id].alive = false; break;
      case 'popcap': {
        const cv = eng.civs[op.civ];
        probe = cv ? bitHex(eng.popCapOf(cv)) : null;
        break;
      }
      case 'tmod': {
        const cv = eng.civs[op.civ];
        probe = cv ? dumpTm(eng.techModsOf(op.civ)) : null;
        break;
      }
      case 'imod': {
        const cv = eng.civs[op.civ];
        probe = cv ? dumpIm(eng.ideaModsOf(op.civ)) : null;
        break;
      }
      case 'prog': {
        const d = eng.activeDirective(op.civ, op.kind);
        probe = d ? bitHex(eng.directiveProgressOf(d)) : null;
        break;
      }
      default: throw new Error('unknown op: ' + op.op);
    }
    rec.draws = draws;
    rec.probe = probe;
    rec.dirs = dumpDirectives(eng);
    rec.civs = dumpCivs(eng);
    rec.evts = evts.slice(evMark);
    outSteps.push(rec);
  }

  const rec = {
    name: c.name, mode: c.mode, terrain: c.terrain, seed: c.seed,
    env: { ...envInit, dayPhase: (eng.frameCount % 2400) / 2400, lawsUndeadRise: false, lawsReproduction: env.lawsRepro !== false, neuro: { enabled: false, flightMode: 'rl' } },
    civs: c.civs, units: c.units.map((s) => ({ ...s, race: raceIds[s.race] ?? s.race })), ops: c.ops,
    out: outSteps,
    final: units.map(snapU),
    dirs: dumpDirectives(eng),
    civs0: c.civs, civsEnd: dumpCivs(eng),
    alliances: dumpAlliances(eng),
    rel: dumpRel(eng.rel),
    raceRel: dumpRel(eng.raceRel),
    met: [...eng.met],
    events: evts,
    wild: dumpWild(eng),
    families: dumpFamilies(eng),
    unitSeq: eng.unitSeq,
    traitSeq: eng.traitSeq,
    dirSeq: eng.dirSeq,
    victoryCiv: eng.victoryCiv,
  };
  rec.rngTail = [raw(), raw(), raw(), raw()].map(bitHex);
  out.cases.push(rec);
}

// —— 激活度自检（--hunt：各 case 事件/fp 生育/旨意结算摘要） ——
if (process.argv.includes('--hunt')) {
  for (const r of out.cases) {
    let births = 0, decree = 0, ok = 0, fail = 0;
    for (const st of r.out) {
      if (st.units) for (const pu of st.units) if (pu.fx) for (const f of pu.fx) if (f[0] === 'heart') births++;
      if (st.evts) for (const e of st.evts) {
        if (e.kind === 'decree') decree++;
        if (e.kind === 'decreeOk') ok++;
        if (e.kind === 'decreeFail') fail++;
      }
    }
    const probeSpawn = r.out.filter((s) => s.op === 'spawn' && s.probe).length;
    const jobs = r.out.filter((s) => s.op === 'spawn' && s.probe).map((s) => s.probe.job);
    console.log(`${r.name}: births=${births} decree=${decree} ok=${ok} fail=${fail} spawns=${probeSpawn} jobs=[${jobs}] dirsEnd=${r.dirs.length} draws[maxOp]=${Math.max(...r.out.map((s) => s.draws))}`);
  }
}

const outPath = new URL('./golden-units-jobs.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(out));
console.log(`golden-units-jobs.json: ${out.cases.length} cases, ${(JSON.stringify(out).length / 1024).toFixed(0)}KB`);
