// ============================================================================
// gen-units-reap.mjs —— M-U2d 切片 1「收尸全链 + 地面物品闭环」黄金向量
// 蓝本：src/lib/game/engine.ts unitsReap（L3444-3560：僵尸病毒 35%/王权/凤凰/九头蛇/
//       送葬/颅骨/商队/尸骸血泊/肉掉落/腐食回充/缴获三分支/swap-pop 摘除）+
//       dropMeat（L5542）/ dropItem（L5347）/ findLandNear（L5752）/ tryPickup
//       （L5388：肉拾取/装备换装）+ rollItem/rollChestItem（items.ts/constants.ts）。
// 直接 import 现役 engine.ts（真实现，零同源复制）：原型链 stub 驱动（Task 140 模式）。
// 步语义升级：每步 = rebuildBuckets → update 循环（pre+scan+post[tryPickup 真实现]）→
//   unitsReap()（真实现收尸）——黄金记录含收尸事件/物品全量/终态数组序（swap-pop 漂移）。
// 截断契约（C# 侧哨兵同构，触达即设计错误）：
//  ① 繁衍：laws.reproduction=false 场景契约（repro 域属 M-U2d 切片 2——零 rng 短路）；
//  ② 王权 onKingDeath/凤凰 PHOENIX/九头蛇 HYDRA 分支——场景契约种族/旗标不可达（哨兵）；
//  ③ 商队贸易中断（caravan>0）——场景契约 0；④ 沉海宝物 toast——findLandNear 无陆
//     返回 null 契约可见；⑤ 在线采集 collectUnitDead——collector 关 no-op；
//  ⑥ rollChestItem 池 = ALL_ITEMS×RARITY 权重——数据回显（C# 零独立打包）。
// 运行：bun scripts/unity-migration/gen-units-reap.mjs
// 输出：scripts/unity-migration/golden-units-reap.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, TRAITS, ITEM_DEFS } from '../../src/lib/game/types.ts';
import { ALL_ITEMS, RARITY_META } from '../../src/lib/game/items.ts';
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
const RACE_KEYS = ['human', 'bandit', 'sheep', 'wolf', 'fish', 'zombie', 'pig'];
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
    isAquatic: !!d.aquatic,
    isCiv: !!d.isCiv,
    undead: !!d.undead,
    predator: !!d.predator,
  };
}
// rollItem 池回显（ALL_ITEMS 序 + RARITY 权重——C# 加权抽取零独立打包）
const rollPool = ALL_ITEMS.map((d) => ({ key: d.key, rarity: d.rarity }));
const rarityW = RARITY_META.map((r) => r.w);
// TRAITS 键序回显（rollTrait 用——spawn 属切片 2，此表为下切片预备）
const traitKeys = Object.keys(TRAITS);
const ITEM_DEFS_ECHO = {};
for (const k of Object.keys(ITEM_DEFS)) {
  const d = ITEM_DEFS[k];
  ITEM_DEFS_ECHO[k] = { slot: d.slot, rank: d.rank, dmg: d.dmg ?? 0, hp: d.hp ?? 0, speedMul: d.speedMul ?? 1, armor: d.armor ?? 0, crit: d.crit ?? 0, lifesteal: d.lifesteal ?? 0, thorns: d.thorns ?? 0, regen: d.regen ?? 0, ranged: d.ranged ?? 0, name: d.name, rarity: d.rarity };
}

const TERRAIN_SPECS = [
  { name: 'plains', def: T.GRASS, patches: [] },
  { name: 'lake', def: T.GRASS, patches: [[50, 20, 58, 26, T.WATER]] },
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
  eng.laws = { undeadRise: false, zombieInfect: env.lawsZombie ?? false, reproduction: false, zombieVirus: env.lawsZombieVirus !== false };
  eng.nature = { season: env.season ?? 0, bloodMoonTTL: env.bloodMoonTtl ?? 0, eclipseTTL: env.eclipseTtl ?? 0 };
  eng.moonIllum = () => env.moonIllum ?? 0;
  eng.fxPrefs = { get ambience() { return env.ambience ?? false; }, get blood() { return env.fxBlood ?? true; }, get dmgNumbers() { return env.fxDmgNumbers ?? true; }, get corpses() { return env.fxCorpses ?? true; } };
  eng.frameCount = env.frameCount ?? 100;
  eng.tickCount = 0;
  eng.blood = []; eng.corpses = [];
  eng.activeBattles = new Map();
  eng.statDragonsSlain = 0;
  eng.wildCount = new Map(env.wild ?? []);
  eng.eventSeq = 0; eng.toastSeq = 0;
  eng.items = (env.items ?? []).map((it) => ({ ...it }));   // 地面物品初始态
  eng.itemSeq = env.itemSeq ?? 1;
  eng.families = new Map(env.families ?? []);
  eng.familySeq = env.familySeq ?? 1;
  eng.unitSeq = env.unitSeq ?? 1000;
  eng.grassTiles = env.grassTiles ?? 0;
  eng.unitById = new Map();   // 收尸 unitById.delete（id 索引——宿主域镜像，对账不含）
  eng.grabbedTick = (u) => cap.evt.push(['grab', u.id]);
  eng.updateBoat = (u) => cap.evt.push(['boat', u.id]);
  eng.riseSkeleton = (x, y) => cap.evt.push(['rise', bitHex(x), bitHex(y)]);
  eng.spreadPlague = (u) => cap.evt.push(['plague', u.id]);
  eng.addEvent = (kind, text, opts) => cap.evt.push(['ev', kind, opts?.x === undefined ? null : bitHex(opts.x), opts?.y === undefined ? null : bitHex(opts.y)]);
  eng.toast = () => {};
  eng.onSound = null;
  eng.setTerrain = (i, t) => { if (eng.terrain[i] === t) return; const old = eng.terrain[i]; eng.terrain[i] = t; cap.terr.push([i, old, t]); };
  eng.updateUnitTailJS = (u) => { cap.evt.push(['tail', u.id]); return false; };
  // ⚠ updateUnitPostJS 不 stub——真实现（tryPickup+repro 契约关闭）由 updateUnit 内部调用
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
const dumpFamilies = (eng) => [...eng.families.entries()].sort((a, b) => a[0] - b[0]).map(([id, f]) => ({ id, name: f.name, members: f.members, kills: f.kills, heroes: f.heroes }));

const CASES = [];
// S1 reap-hunt：狼杀羊 → 收尸全链（颅骨/尸骸/血泊 big/肉掉落 0.85+位置掷/腐食回充狼/摘除 swap-pop）
CASES.push({
  name: 'reap-hunt', mode: 'units', terrain: 'plains', seed: 1, env: { unitSeq: 100 },
  units: [
    U({ id: 1, race: 'wolf', x: 100.5, y: 80.5, dmg: 45, hp: 100, maxHp: 100, speed: 0.093, food: 20 }),   // 饿狼（击杀后腐食回充）
    U({ id: 2, race: 'sheep', x: 101.2, y: 80.5, dmg: 1, hp: 36, maxHp: 100, speed: 0.05 }),               // 猎物（一击必杀）
    U({ id: 3, race: 'sheep', x: 110.5, y: 84.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05 }),              // 幸存羊（swap-pop 幸存者对照）
  ],
  steps: 3,
});
// S2 reap-virus：感染羊寿终（maxAge 门）→ 僵尸病毒 35% 尸变（真 zombify）对照
CASES.push({
  name: 'reap-virus', mode: 'units', terrain: 'plains', seed: 2, env: { unitSeq: 200 },
  units: [
    U({ id: 11, race: 'sheep', x: 60.5, y: 60.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05, age: 20.1, maxAge: 20.1, infected: true }), // 寿终+感染
    U({ id: 12, race: 'sheep', x: 70.5, y: 70.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05, age: 20, maxAge: 20.1 }),                 // 寿终无感染对照
  ],
  steps: 2,
});
// S3 meat-pickup：饿狼路过地面肉 → post tryPickup（food+45+饱 fx+splice）
CASES.push({
  name: 'meat-pickup', mode: 'units', terrain: 'plains', seed: 3, env: {
    unitSeq: 300,
    items: [{ id: 1, kind: 'meat', x: 40.6, y: 40.5 }, { id: 2, kind: 'meat', x: 55.5, y: 55.5 }],   // 一近一远
    itemSeq: 3,
  },
  units: [
    U({ id: 21, race: 'wolf', x: 40.5, y: 40.5, dmg: 10, hp: 100, maxHp: 100, speed: 0.05, food: 60 }),  // 饿狼贴肉（|dx|=0.1 ≤0.9）
    U({ id: 22, race: 'sheep', x: 55.5, y: 55.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05 }),            // 远肉上的羊（非捕食者不捡——对照）
  ],
  steps: 2,
});
// S4 gear-pickup：强盗路过锈蚀短剑 → 换装（dmg+=5/rank 比较/旧装卸除路径留给多件场景）
CASES.push({
  name: 'gear-pickup', mode: 'units', terrain: 'plains', seed: 4, env: {
    unitSeq: 400,
    items: [{ id: 1, kind: 'sword1', x: 80.5, y: 80.4 }, { id: 2, kind: 'sword2', x: 80.6, y: 80.5 }],   // 两件近邻——同拍先拾低阶再拾高阶（换装卸旧）
    itemSeq: 3,
  },
  units: [
    U({ id: 31, race: 'bandit', x: 80.5, y: 80.5, dmg: 8, hp: 60, maxHp: 60, speed: 0.1 }),   // 强盗（civ 域拾取门 isCiv||bandit）
  ],
  steps: 2,
});
// S5 meat-water：羊死于水域边缘 → 肉落水 → findLandNear 环扫描着陆
CASES.push({
  name: 'meat-water', mode: 'units', terrain: 'lake', seed: 5, env: { unitSeq: 500 },
  units: [
    U({ id: 41, race: 'sheep', x: 51.5, y: 21.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05, age: 20.1, maxAge: 20.1 }), // 水域中心寿终（溺水+收尸）
  ],
  steps: 2,
});
// S6 scavenge：衰老羊死于饿狼附近（狼 d≈3 追而不及）→ 收尸腐食回充（hunger=80-food>0 门）
CASES.push({
  name: 'scavenge', mode: 'units', terrain: 'plains', seed: 66, env: { unitSeq: 650 },
  units: [
    U({ id: 61, race: 'wolf', x: 103.5, y: 80.5, dmg: 10, hp: 100, maxHp: 100, speed: 0.093, food: 20 }),  // 饿狼（追而不及——d=3 > reach 0.9）
    U({ id: 62, race: 'sheep', x: 100.5, y: 80.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05, age: 20.1, maxAge: 20.1 }), // 衰老羊（step0 pre 即死）
    U({ id: 63, race: 'sheep', x: 108.5, y: 82.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05 }),             // 健康羊（scavenge 不喂对照）
  ],
  steps: 2,
});

// S7 multi-death-swap：双羊同拍死亡 → 收尸逆序遍历 + swap-pop 槽位移位（终态数组序对账）
CASES.push({
  name: 'multi-death-swap', mode: 'units', terrain: 'plains', seed: 7, env: { unitSeq: 600, famSeq: 1, families: [[1, { id: 1, name: '霜牙', race: -1, founded: 1, founder: 'X', members: 2, heroes: 0, kills: 0, peak: 2, milestones: 0 }]] },
  units: [
    U({ id: 51, race: 'sheep', x: 90.5, y: 60.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05, age: 20.1, maxAge: 20.1, fam: 1 }),  // 有族羊（送葬 members--）
    U({ id: 52, race: 'sheep', x: 95.5, y: 60.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05, age: 20.1, maxAge: 20.1 }),          // 无族羊
    U({ id: 53, race: 'sheep', x: 100.5, y: 60.5, dmg: 1, hp: 100, maxHp: 100, speed: 0.05 }),                                // 幸存者（swap-pop 到槽 0）
  ],
  steps: 2,
});

const out = {
  w: W, h: H, ep: EP, raceIds, races: raceTable,
  terrainSpecs: TERRAIN_SPECS, rollPool, rarityW, traitKeys, itemDefs: ITEM_DEFS_ECHO,
  cases: [],
};
for (const c of CASES) {
  const env = { ...c.env };
  const envInit = JSON.parse(JSON.stringify(env));   // ⚠ 深拷贝初始 env（收尸原地改 families/对象——echo 须为初始态）
  const cap = { fx: [], evt: [], terr: [], rz: [] };
  const eng = makeStubEng(env, cap);
  eng.terrain.set(buildGrid(TERRAIN_SPECS.find((s) => s.name === c.terrain)));
  const specs = c.units;
  const units = specs.map((s) => mkTsUnit({ ...s, race: raceIds[s.race] ?? s.race }));
  eng.units = units;
  // wildCount 初始化（真实引擎由 spawn/收尸维护——场景按在世野生单位注入）
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
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.dead) { perU.push({ dead: true }); continue; }
      const e0 = cap.evt.length, f0 = cap.fx.length, t0 = cap.terr.length;
      const b0 = eng.blood.length, cp0 = eng.corpses.length;
      eng.updateUnit(u);                       // 前置+扫描+战斗树+尾段+后段（真实现——post 含 tryPickup，repro 契约关闭）
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
    stepRec.draws = draws - draw0;   // ⚠ 收尸掷骰（肉/宝箱/尸变）计入本步——快照必须在 reap 之后
    stepRec.rz = cap.rz.slice(rz0);
    stepRec.fx = cap.fx.slice(fxAfterUnits).map((f) => [f.k, f.x, f.y, f.ttl]);   // reap fx（颅骨/heart 等）
    stepRec.items = dumpItems(eng);
    stepRec.battles = dumpBattles(eng);
    eng.tickCount++;
    outSteps.push(stepRec);
  }
  const rec = {
    name: c.name, mode: c.mode, terrain: c.terrain, seed: c.seed,
    env: { ...envInit, dayPhase: (eng.frameCount % 2400) / 2400, lawsUndeadRise: false, lawsReproduction: false, neuro: { enabled: true, flightMode: 'rl' } },
    units: specs.map((s) => ({ ...s, race: raceIds[s.race] ?? s.race })), steps: c.steps,
    out: outSteps,
    final: units.map(snapU),          // ⚠ swap-pop 后数组序（槽位重排对账）
    items: dumpItems(eng),
    wild: dumpWild(eng),
    families: dumpFamilies(eng),
    itemSeq: eng.itemSeq,
  };
  rec.rngTail = [raw(), raw(), raw(), raw()].map(bitHex);
  out.cases.push(rec);
}

writeFileSync(new URL('./golden-units-reap.json', import.meta.url), JSON.stringify(out));
console.log('golden-units-reap.json written:', JSON.stringify({ cases: out.cases.length, pool: rollPool.length, ep: EP }));
