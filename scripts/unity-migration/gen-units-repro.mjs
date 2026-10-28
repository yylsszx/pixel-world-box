// ============================================================================
// gen-units-repro.mjs —— M-U2d 切片 2「繁衍全链 + spawnUnit」黄金向量
// 蓝本：src/lib/game/engine.ts updateUnitPostJS repro 段（L4399-4446：两段式掷骰/
//       11 因子 boost 链/捕食者食物门/civ 分支 M-U3 哨兵/野生分支）+ childGene
//       （L11207-11222：±突变×环境辐射 2.6×/雪沙林草环境偏向）+ tryEmergentTrait
//       （L9024-9034：极端基因 ≥1.5 门/dynTraits 24 上限/6% 掷骰/inventTrait）+
//       inventTrait（emergence.ts L390-415）+ spawnUnit（L1345-1526：预算三轨/
//       10 种族上限/夹紧/trait 15% 掷/gene 快照/maxHp·dmg·speed 乘序/maxAge 掷/
//       flip 掷/breath 掷/uniqueName FIRST 表/家族 25%+6%/bumpWild/静默播报）+
//       newFamily（L1173-1191）/pruneFamilies/familyMilestone（12/24/40 播报）+
//       wildCapOf（L2194-2222）/uniqueName+roman（L1584-1595/names.ts L81-92）。
// 直接 import 现役 engine.ts（真实现，零同源复制）：原型链 stub 驱动（Task 140 模式）。
// 步语义：每步 = rebuildBuckets → update 循环（pre+scan+combat+tail+post[拾取+繁衍
//   真实现]）→ unitsReap() —— ⚠ 循环内新生单位同拍被驱动（TS for(let i<units.length)
//   活数组迭代序——新生 push 后循环边界增长，C# LiveLen 循环同构）。
// 截断契约（C# 侧哨兵同构，触达即设计错误）：
//  ① 繁衍 civ 分支（civs/popCapOf/activeDirective/techModsOf/ideaModsOf）——M-U3 域
//     哨兵（场景契约野生种族 civ=-1）；② spawnUnit civ≥0 分支（findCivNear/createCiv/
//     rollJob/techMods/govOf===4/civs.pop++）——同 M-U3；③ 非静默 spawn 播报
//     （dragon/demon/angel/…toast/onSound）——场景契约 silent=true（UI 域 M-U5）；
//  ④ baseGene speciesBase 取样——场景契约全部携带 gene（worldgen 域另切片）；
//  ⑤ devEquip（opts.gear）——开发者模式域，repro 恒 false。
// 运行：bun scripts/unity-migration/gen-units-repro.mjs
// 输出：scripts/unity-migration/golden-units-repro.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, TRAITS, ITEM_DEFS } from '../../src/lib/game/types.ts';
import { ALL_ITEMS, RARITY_META } from '../../src/lib/game/items.ts';
import { FIRST } from '../../src/lib/game/names.ts';
import { WB } from '../../src/lib/wasm/wbspatial.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { neuroStats } from '../../src/lib/game/neuro.ts';
import { writeFileSync } from 'node:fs';

const W = 256, H = 160;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };

neuroStats.enabled = true;
neuroStats.flightMode = 'rl';
WB.setEnabled(false);     // WASM 分流关闭——JS 路径为准（M-U2b 契约）

const EP = {
  panicDecay: ep('social.panicDecay'), grudgeDecay: ep('social.grudgeDecay'),
  fireDamage: ep('fire.damage'), panicRout: ep('social.panicRout'),
  reproMul: ep('pop.reproMul'), mutationRate: ep('evo.mutationRate'),
};

const pickRace = (key) => {
  for (const k of Object.keys(RACES)) if (RACES[k].key === key) return Number(k);
  throw new Error('race not found: ' + key);
};
const RACE_KEYS = ['sheep', 'wolf', 'fish', 'rabbit', 'zombie'];
const raceIds = {};
const raceTable = {};
for (const k of RACE_KEYS) {
  const id = pickRace(k);
  raceIds[k] = id;
  const d = RACES[id];
  raceTable[String(id)] = {
    key: k,
    flags: (d.hostile ? 1 : 0) | (d.isCiv ? 2 : 0) | (d.undead ? 4 : 0) | (d.predator ? 8 : 0) | (d.lavaImmune ? 16 : 0),
    tbf0: (d.flying ? 32 : 0) | (d.aquatic ? 64 : 0) | (d.sandswim ? 128 : 0),
    tbf1: (d.coldBlood ? 4 : 0) | (d.beach ? 8 : 0) | (d.nightsight ? 16 : 0),
    reach: d.reach === undefined ? null : d.reach,
    speed: d.speed,
    repro: d.repro,
    growth: d.growth === undefined ? null : d.growth,
    maxAge: d.maxAge,
    hp: d.hp,
    dmg: d.dmg,
    isAquatic: !!d.aquatic,
    isCiv: !!d.isCiv,
    undead: !!d.undead,
    predator: !!d.predator,
  };
}
// rollItem 池回显 + TRAITS 键序（spawnUnit 15% trait 掷骰用——运行期 dt* 追加由 C# 同构镜像）
const rollPool = ALL_ITEMS.map((d) => ({ key: d.key, rarity: d.rarity }));
const rarityW = RARITY_META.map((r) => r.w);
const traitKeys = Object.keys(TRAITS);
const TRAIT_DEFS_ECHO = {};
for (const k of traitKeys) {
  const d = TRAITS[k];
  TRAIT_DEFS_ECHO[k] = { hpMul: d.hpMul ?? 1, dmgMul: d.dmgMul ?? 1, speedMul: d.speedMul ?? 1, regen: d.regen ?? 0, immune: !!d.immune };
}
// inventTrait 词法表 + 家族词法表 + FIRST 名池（uniqueName 基名）——数据回显零独立打包
const EM_ECHO = {
  traitPrefix: ['凶蛮', '钢筋', '魅影', '荒野', '苔藓', '血怒', '霜骨', '雷筋', '深渊', '星辉', '荆棘', '孤狼'],
  traitBody: ['之爪', '之躯', '之足', '血脉', '之瞳', '之鳞'],
  famPre: ['霜', '烬', '暴风', '血', '铁', '荆棘', '暗影', '星', '狼', '鹰', '珊瑚', '苔', '雷', '冬', '荒', '银'],
  famPost: ['牙', '羽', '痕', '鬃', '棘', '誓', '歌', '爪', '翼', '须', '蹄', '岚'],
};
const ITEM_DEFS_ECHO = {};
for (const k of Object.keys(ITEM_DEFS)) {
  const d = ITEM_DEFS[k];
  ITEM_DEFS_ECHO[k] = { slot: d.slot, rank: d.rank, dmg: d.dmg ?? 0, hp: d.hp ?? 0, speedMul: d.speedMul ?? 1, armor: d.armor ?? 0, crit: d.crit ?? 0, lifesteal: d.lifesteal ?? 0, thorns: d.thorns ?? 0, regen: d.regen ?? 0, ranged: d.ranged ?? 0, name: d.name, rarity: d.rarity };
}
const FIRST_ECHO = {};
for (const k of Object.keys(FIRST)) FIRST_ECHO[k] = FIRST[k];

const TERRAIN_SPECS = [
  { name: 'plains', def: T.GRASS, patches: [] },
  { name: 'lake', def: T.GRASS, patches: [[40, 15, 70, 45, T.WATER]] },
];

let nextId = 1;
const U = (o) => ({
  id: o.id ?? nextId++,
  race: o.race, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
  age: o.age ?? 20, maxAge: o.maxAge ?? 55,
  hp: o.hp ?? 100, maxHp: o.maxHp ?? 100,
  dmg: o.dmg ?? 0, kills: o.kills ?? 0,
  hurt: o.hurt === undefined ? null : o.hurt, cd: o.cd ?? 0, atk: o.atk ?? 0,
  chill: o.chill === undefined ? null : o.chill,
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
const bitHex = (d) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const snapU = (u) => ({
  id: u.id, race: u.race,
  age: bitHex(u.age), hp: bitHex(u.hp), maxAge: bitHex(u.maxAge), maxHp: bitHex(u.maxHp),
  hurt: u.hurt === undefined ? null : bitHex(u.hurt), cd: bitHex(u.cd ?? 0), atk: bitHex(u.atk ?? 0),
  chill: u.chill === undefined ? null : bitHex(u.chill),
  fleeT: bitHex(u.fleeT ?? 0), bless: bitHex(u.bless ?? 0), curse: bitHex(u.curse ?? 0),
  fert: bitHex(u.fert ?? 0), detour: bitHex(u.detour ?? 0),
  panic: u.panic === undefined ? null : bitHex(u.panic),
  gids: u.gIds === undefined ? null : u.gIds.join(','),
  gval: u.gVal === undefined ? null : u.gVal.map(bitHex).join(','),
  food: u.food === undefined ? null : bitHex(u.food),
  stk: u.stk === undefined || u.stk === 0 ? 0 : u.stk,
  sxk: u.sxk === undefined ? null : bitHex(u.sxk), syk: u.syk === undefined ? null : bitHex(u.syk),
  infected: !!u.infected, dead: !!u.dead, grab: u.grab ?? 0, boat: u.boat ?? 0,
  caravan: u.caravan ?? 0,
  dmg: bitHex(u.dmg ?? 0), kills: u.kills ?? 0,
  x: bitHex(u.x), y: bitHex(u.y), tx: bitHex(u.tx), ty: bitHex(u.ty),
  trait: u.trait === undefined ? null : u.trait,
  wep: u.wep === undefined ? null : u.wep, arm: u.arm === undefined ? null : u.arm,
  hlm: u.hlm === undefined ? null : u.hlm, shd: u.shd === undefined ? null : u.shd,
  bts: u.bts === undefined ? null : u.bts, rng: u.rng === undefined ? null : u.rng,
  amu: u.amu === undefined ? null : u.amu,
  king: !!u.king, fam: u.fam === undefined ? null : u.fam, army: u.army === undefined ? null : u.army,
  boatTTL: bitHex(u.boatTTL ?? 0), thrT: bitHex(u.thrT ?? 0), grabTTL: bitHex(u.grabTTL ?? 0),
  lx: u.lx === undefined ? null : bitHex(u.lx), ly: u.ly === undefined ? null : bitHex(u.ly),
  flip: !!u.flip, job: u.job ?? 0, civ: u.civ ?? -1,
  name: u.name,
  // —— M-U2d 切片 2 繁衍域扩展快照 ——
  speed: u.speed === undefined ? null : bitHex(u.speed),
  gene: u.gene === undefined ? null : { s: bitHex(u.gene.s), d: bitHex(u.gene.d), h: bitHex(u.gene.h), r: bitHex(u.gene.r) },
  fgn: u.fgn === undefined ? null : u.fgn,
  breath: u.breath === undefined ? null : bitHex(u.breath),
  uparity: u.parity === undefined ? null : u.parity,
  beachT: u.beachT ?? 0,
});

function makeStubEng(env, cap) {
  const eng = Object.create(GameEngine.prototype);
  eng.terrain = new Uint8Array(W * H);
  eng.road = new Uint8Array(W * H);
  eng.fire = new Uint8Array(W * H);
  eng.radiate = new Uint8Array(W * H);
  eng.fireSet = new Set(env.fireSet ?? []);
  eng.damagedSet = new Set();
  eng.buildings = []; eng.bIdx = new Map(); eng.civs = [];
  eng.techModCache = new Map(); eng.emTechs = new Map();
  eng.building = new Uint8Array(W * H);
  eng.bw = W / 4; eng.bh = H / 4;
  eng.buckets = Array.from({ length: eng.bw * eng.bh }, () => []);
  eng.bucketStampArr = new Int32Array(eng.bw * eng.bh);
  eng.bucketStamp = 0;
  eng.ghostBuckets = [];
  eng.enemyLut = new Map();
  eng.rel = new Map(); eng.tension = new Map(); eng.warShame = new Map();
  eng.warData = new Map(); eng.directives = []; eng.armies = []; eng.emergentWeapons = new Map();
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };
  eng.dynRaces = new Map();
  eng.laws = { undeadRise: false, zombieInfect: env.lawsZombie ?? false, reproduction: env.lawsRepro !== false, zombieVirus: env.lawsZombieVirus !== false };
  eng.nature = { season: env.season ?? 0, bloodMoonTTL: env.bloodMoonTtl ?? 0, eclipseTTL: env.eclipseTtl ?? 0, reproMul() { return this.season === 0 ? 1.14 : this.season === 3 ? 0.78 : 1; } };   // nature.ts L371-374 机械镜像
  eng.moonIllum = () => env.moonIllum ?? 0;
  eng.fxPrefs = { get ambience() { return env.ambience ?? false; }, get blood() { return env.fxBlood ?? true; }, get dmgNumbers() { return env.fxDmgNumbers ?? true; }, get corpses() { return env.fxCorpses ?? true; } };
  eng.frameCount = env.frameCount ?? 100;
  eng.tickCount = 0;
  eng.blood = []; eng.corpses = [];
  eng.activeBattles = new Map();
  eng.statDragonsSlain = 0;
  eng.wildCount = new Map(env.wild ?? []);
  eng.eventSeq = 0; eng.toastSeq = 0;
  eng.items = (env.items ?? []).map((it) => ({ ...it }));
  eng.itemSeq = env.itemSeq ?? 1;
  eng.families = new Map(env.families ?? []);
  eng.familySeq = env.familySeq ?? 1;
  eng.unitSeq = env.unitSeq ?? 1000;
  eng.grassTiles = env.grassTiles ?? 0;
  eng.yearF = env.yearF ?? 0;
  // —— M-U2d 切片 2：涌现特质/图谱 stub 面（tryEmergentTrait 真实现驱动） ——
  eng.dynTraits = new Map();
  eng.traitSeq = env.traitSeq ?? 0;
  eng.evoSeq = 0; eng.evoIndex = new Map(); eng.evoNodes = [];
  eng.speciesBase = new Map();   // 场景契约：全部单位携带 gene——baseGene 取样不触达（worldgen 域）
  eng.unitById = new Map();
  eng.grabbedTick = (u) => cap.evt.push(['grab', u.id]);
  eng.updateBoat = (u) => cap.evt.push(['boat', u.id]);
  eng.riseSkeleton = (x, y) => cap.evt.push(['rise', bitHex(x), bitHex(y)]);
  eng.spreadPlague = (u) => cap.evt.push(['plague', u.id]);
  eng.addEvent = (kind, text, opts) => cap.evt.push(['ev', kind, opts?.x === undefined ? null : bitHex(opts.x), opts?.y === undefined ? null : bitHex(opts.y)]);
  eng.toast = () => {};
  eng.onSound = null;
  eng.setTerrain = (i, t) => { if (eng.terrain[i] === t) return; const old = eng.terrain[i]; eng.terrain[i] = t; cap.terr.push([i, old, t]); };
  eng.updateUnitTailJS = (u) => { cap.evt.push(['tail', u.id]); return false; };
  // ⚠ updateUnitPostJS 不 stub——真实现（tryPickup + 繁衍全链）由 updateUnit 内部调用
  eng.fx = (kind, x, y, ttl) => cap.fx.push({ k: kind, x: bitHex(x), y: bitHex(y), ttl });
  return eng;
}
const buildGrid = (spec) => {
  const g = new Uint8Array(W * H).fill(spec.def);
  for (const [x1, y1, x2, y2, t] of spec.patches)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) g[y * W + x] = t;
  return g;
};
const dumpBattles = (eng) => [...eng.activeBattles.entries()].sort((a, b) => a[0] - b[0]);
const dumpWild = (eng) => [...eng.wildCount.entries()].sort((a, b) => a[0] - b[0]);
const dumpItems = (eng) => eng.items.map((it) => ({ id: it.id, kind: it.kind, x: bitHex(it.x), y: bitHex(it.y) }));
const dumpFamilies = (eng) => [...eng.families.entries()].sort((a, b) => a[0] - b[0]).map(([id, f]) => ({ id, name: f.name, members: f.members, kills: f.kills, heroes: f.heroes, peak: f.peak, founded: f.founded, founder: f.founder, milestones: f.milestones }));

const SEEDS = JSON.parse(process.env.PW_SEEDS ?? '{}');   // 种子寻优通道：PW_SEEDS='{"repro-rabbit":123,…}'
function seedOf(name, dflt) { return SEEDS[name] ?? dflt; }

const CASES = [];
// S1 repro-rabbit：草地兔对自然繁衍（gate1 0.014 命中）→ boost 链 → childGene 4+1 抽 →
//   trait 15% 掷 → maxAge/flip/breath/name 掷 → 家族 25% → spawnUnit → heart fx →
//   新生同拍被驱动（活数组迭代序）→ wildCount+1 / swap-pop 无关（无死亡）
CASES.push({
  name: 'repro-rabbit', mode: 'units', terrain: 'plains', seed: seedOf('repro-rabbit', 1004), env: { unitSeq: 100, season: 0, grassTiles: 9000, yearF: 12.5 },
  units: [
    U({ id: 1, race: 'rabbit', x: 60.5, y: 60.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12 }),
    U({ id: 2, race: 'rabbit', x: 63.5, y: 61.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12 }),
  ],
  steps: 14,
});
// S2 repro-cap：wildCount 注入 cap=240（羊承载满）→ gate1/gate2 照掷但 `same < cap` 拒绝
//   ——兔子对照正常（同拍生）；承载门零事件零 fx 零 wild 增量
CASES.push({
  name: 'repro-cap', mode: 'units', terrain: 'plains', seed: seedOf('repro-cap', 22), env: { unitSeq: 200, season: 0, grassTiles: 9000, wild: [[6, 240]] },
  units: [
    U({ id: 11, race: 'sheep', x: 40.5, y: 40.5, dmg: 1, hp: 16, maxHp: 16, speed: 0.038, maxAge: 26 }),
    U({ id: 12, race: 'sheep', x: 44.5, y: 41.5, dmg: 1, hp: 16, maxHp: 16, speed: 0.038, maxAge: 26 }),
    U({ id: 13, race: 'rabbit', x: 80.5, y: 60.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12 }),
  ],
  steps: 12,
});
// S3 repro-predator：饱食狼（food 80 → boost ×2.07 捕食者增益 + food>40 门过）vs 饥狼
//   （food 30 ≤ 40 → gate2 短路零掷）——掷骰差即行为指纹
CASES.push({
  name: 'repro-predator', mode: 'units', terrain: 'plains', seed: seedOf('repro-predator', 42), env: { unitSeq: 300, season: 1, grassTiles: 0 },
  units: [
    U({ id: 21, race: 'wolf', x: 100.5, y: 80.5, dmg: 10, hp: 34, maxHp: 34, speed: 0.093, age: 8, maxAge: 22, food: 80 }),
    U({ id: 22, race: 'wolf', x: 140.5, y: 84.5, dmg: 10, hp: 34, maxHp: 34, speed: 0.093, age: 8, maxAge: 22, food: 30 }),
  ],
  steps: 16,
});
// S4 repro-panic-fert：fert ×2.5 与恐慌 ×0.3 对冲 + 冬季 reproMul ×0.78 —— boost 链
//   中段因子激活；对照组无 fert 无 panic
CASES.push({
  name: 'repro-panic-fert', mode: 'units', terrain: 'plains', seed: seedOf('repro-panic-fert', 12), env: { unitSeq: 400, season: 3, grassTiles: 9000 },
  units: [
    U({ id: 31, race: 'rabbit', x: 50.5, y: 50.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12, fert: 1, panic: 0.9 }),
    U({ id: 32, race: 'rabbit', x: 56.5, y: 52.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12 }),
  ],
  steps: 14,
});
// S5 repro-beach：搁浅鱼（aquatic 无 beach + beachT>0 → gate1 短路零掷）vs 在水鱼
//   （正常掷 gate1）——湖泊地形；掷骰差即行为指纹
CASES.push({
  name: 'repro-beach', mode: 'units', terrain: 'lake', seed: seedOf('repro-beach', 55), env: { unitSeq: 500, season: 0 },
  units: [
    U({ id: 41, race: 'fish', x: 50.5, y: 25.5, dmg: 0.5, hp: 6, maxHp: 6, speed: 0.075, age: 2, maxAge: 10, beachT: 5 }),
    U({ id: 42, race: 'fish', x: 60.5, y: 30.5, dmg: 0.5, hp: 6, maxHp: 6, speed: 0.075, age: 2, maxAge: 10 }),
  ],
  steps: 8,
});
// S6 repro-emergent：极端基因兔（s=1.6 ≥1.5 门开）→ 6% 涌现掷 → inventTrait 词法表 +
//   dt{seq} 注册（TRAITS 键序追加 → 后续 15% trait 掷可见）+ evo 图谱 + emerge 事件 +
//   新生特质 speedMul 即刻生效（新生 speed 位模式）
CASES.push({
  name: 'repro-emergent', mode: 'units', terrain: 'plains', seed: seedOf('repro-emergent', 23), env: { unitSeq: 600, season: 0, grassTiles: 9000, traitSeq: 0 },
  units: [
    U({ id: 51, race: 'rabbit', x: 60.5, y: 60.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12, fert: 1, gene: { s: 1.6, d: 1, h: 1, r: 1 } }),
    U({ id: 52, race: 'rabbit', x: 64.5, y: 61.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12, fert: 1, gene: { s: 1.6, d: 1, h: 1, r: 1 } }),
    U({ id: 53, race: 'rabbit', x: 68.5, y: 62.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12, fert: 1, gene: { s: 1.6, d: 1, h: 1, r: 1 } }),
    U({ id: 54, race: 'rabbit', x: 72.5, y: 63.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12, fert: 1, gene: { s: 1.6, d: 1, h: 1, r: 1 } }),
  ],
  steps: 18,
});
// S7 repro-family：家族谱系——有姓母代（fam=7 members=11 → 诞生 members=12 → lineage
//   播报事件）+ 无姓母代 25% 开宗立姓（newFamily 词法姓氏）+ spawnUnit 6% 白手起家分支
CASES.push({
  name: 'repro-family', mode: 'units', terrain: 'plains', seed: seedOf('repro-family', 2), env: {
    unitSeq: 700, season: 0, grassTiles: 9000, familySeq: 8, yearF: 9.8,
    families: [[7, { id: 7, name: '霜牙', race: 35, founded: 1, founder: 'U701', members: 11, heroes: 0, kills: 0, peak: 11, milestones: 0 }]],
  },
  units: [
    U({ id: 61, race: 'rabbit', x: 50.5, y: 50.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12, fam: 7, fgn: 3, name: 'U701' }),
    U({ id: 62, race: 'rabbit', x: 56.5, y: 52.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12 }),
  ],
  steps: 14,
});
// S8 repro-uniquename：同名撞车 → 罗马数字后缀（Fang II 机制）——双兔同名 'Alric'，
//   新生 unitName 抽取 FIRST[0] 池（rabbit 35 → FIRST[0] 兜底）命中 'Alric' → n=2 → III
CASES.push({
  name: 'repro-uniquename', mode: 'units', terrain: 'plains', seed: seedOf('repro-uniquename', 52), env: { unitSeq: 800, season: 0, grassTiles: 9000 },
  units: [
    U({ id: 71, race: 'rabbit', x: 60.5, y: 60.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12, name: 'Alric' }),
    U({ id: 72, race: 'rabbit', x: 64.5, y: 61.5, dmg: 1, hp: 12, maxHp: 12, speed: 0.13, age: 2, maxAge: 12, name: 'Alric' }),
  ],
  steps: 12,
});

const out = {
  w: W, h: H, ep: EP, raceIds, races: raceTable,
  terrainSpecs: TERRAIN_SPECS, rollPool, rarityW, traitKeys, traitDefs: TRAIT_DEFS_ECHO,
  em: EM_ECHO, firsts: FIRST_ECHO, itemDefs: ITEM_DEFS_ECHO,
  cases: [],
};
for (const c of CASES) {
  const env = { ...c.env };
  const envInit = JSON.parse(JSON.stringify(env));   // ⚠ 深拷贝初始 env（繁衍原地改 families/对象——echo 须为初始态）
  const cap = { fx: [], evt: [], terr: [], rz: [] };
  const eng = makeStubEng(env, cap);
  eng.terrain.set(buildGrid(TERRAIN_SPECS.find((s) => s.name === c.terrain)));
  const specs = c.units;
  const units = specs.map((s) => mkTsUnit({ ...s, race: raceIds[s.race] ?? s.race }));
  eng.units = units;
  // wildCount 初始化（真实引擎由 spawn/收尸维护——场景按在世野生单位注入 + env 显式注入合并）
  for (const u of units) if (!u.dead && !RACES[u.race].isCiv) eng.wildCount.set(u.race, (eng.wildCount.get(u.race) ?? 0) + 1);
  let draws = 0;
  const raw = mulberry32(c.seed);
  eng.rng = () => { draws++; return raw(); };

  const outSteps = [];
  for (let sn = 0; sn < c.steps; sn++) {
    eng.rebuildBuckets();
    const stepRec = { units: [], all: null, draws: 0, rz0: cap.rz.length, items0: dumpItems(eng) };
    const draw0 = draws;
    const perU = [];
    for (let i = 0; i < units.length; i++) {   // ⚠ 活数组：循环内新生 push → 边界增长（C# LiveLen 同构）
      const u = units[i];
      if (u.dead) { perU.push({ dead: true }); continue; }
      const e0 = cap.evt.length, f0 = cap.fx.length, t0 = cap.terr.length;
      const b0 = eng.blood.length, cp0 = eng.corpses.length;
      eng.updateUnit(u);                       // 前置+扫描+战斗树+尾段+后段（真实现——post 含拾取+繁衍）
      perU.push({
        ...snapU(u),
        evt: cap.evt.slice(e0),
        fx: cap.fx.slice(f0).map((f) => [f.k, f.x, f.y, f.ttl]),
        terr: cap.terr.slice(t0),
        blood: eng.blood.slice(b0).map((b) => [bitHex(b.x), bitHex(b.y), b.seed, b.big ? 1 : 0]),
        corpse: eng.corpses.slice(cp0).map((cc) => [bitHex(cc.x), bitHex(cc.y), cc.stone ? 1 : 0, cc.undead ? 1 : 0]),
      });
    }
    stepRec.units = perU;
    stepRec.all = units.map(snapU);
    const fxAfterUnits = cap.fx.length;
    // —— 收尸（真实现 unitsReap——逆序遍历/尸变/送葬/掉落/swap-pop） ——
    const rz0 = cap.rz.length;
    eng.unitsReap();
    stepRec.draws = draws - draw0;   // ⚠ 收尸+繁衍掷骰全计入本步——快照必须在 reap 之后
    stepRec.rz = cap.rz.slice(rz0);
    stepRec.fx = cap.fx.slice(fxAfterUnits).map((f) => [f.k, f.x, f.y, f.ttl]);
    stepRec.items = dumpItems(eng);
    stepRec.battles = dumpBattles(eng);
    eng.tickCount++;
    outSteps.push(stepRec);
  }
  const rec = {
    name: c.name, mode: c.mode, terrain: c.terrain, seed: c.seed,
    env: { ...envInit, dayPhase: (eng.frameCount % 2400) / 2400, lawsUndeadRise: false, lawsReproduction: env.lawsRepro !== false, neuro: { enabled: true, flightMode: 'rl' } },
    units: specs.map((s) => ({ ...s, race: raceIds[s.race] ?? s.race })), steps: c.steps,
    out: outSteps,
    final: units.map(snapU),          // ⚠ swap-pop 后数组序（槽位重排对账）
    items: dumpItems(eng),
    wild: dumpWild(eng),
    families: dumpFamilies(eng),
    itemSeq: eng.itemSeq,
    unitSeq: eng.unitSeq,             // 新生 id 消耗（spawnUnit unitSeq++ 指纹）
    traitSeq: eng.traitSeq,           // 涌现特质序号消耗
    dynTraits: [...eng.dynTraits.keys()],
  };
  rec.rngTail = [raw(), raw(), raw(), raw()].map(bitHex);
  out.cases.push(rec);
}

// —— 激活度自检（seed 寻优辅助：--hunt 打印每 case 新生数/涌现数/家族事件） ——
if (process.argv.includes('--hunt')) {
  for (const r of out.cases) {
    let births = 0, emerge = 0, lineage = 0, romanNames = [];
    for (const st of r.out) for (const pu of st.units) if (pu.fx) for (const f of pu.fx) if (f[0] === 'heart') births++;
    for (const st of r.out) for (const pu of st.units) if (pu.evt) for (const e of pu.evt) {
      if (e[0] === 'ev' && e[1] === 'emerge') emerge++;
      if (e[0] === 'ev' && e[1] === 'lineage') lineage++;
    }
    for (const u of r.final) if (u.name && / [ivxlIVXL]+$/.test(u.name)) romanNames.push(u.name);
    console.log(`${r.name}: births=${births} emerge=${emerge} lineage=${lineage} roman=[${romanNames}] unitSeq=${r.unitSeq} traitSeq=${r.traitSeq} dyn=[${r.dynTraits}] wild=${JSON.stringify(r.wild)} fams=${JSON.stringify(r.families.map((f) => [f.id, f.name, f.members]))}`);
  }
} else {
  writeFileSync(new URL('./golden-units-repro.json', import.meta.url), JSON.stringify(out));
  console.log('golden-units-repro.json written:', JSON.stringify({ cases: out.cases.length, pool: rollPool.length, traits: traitKeys.length, ep: EP }));
}
