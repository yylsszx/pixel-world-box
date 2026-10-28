// ============================================================================
// gen-units-buckets.mjs —— M-U2b「网格与扫描」黄金向量
// 蓝本：src/lib/game/engine.ts rebuildBuckets（L3183-3217）+ isEnemyFast/isEnemy/
//       isHerbivoreRace（L2133-2191）+ updateUnit 扫描环与出口链（L3706-4101）+
//       policy.ts teacherFlight/teacherStance（L67-106）。
//       rust-core/src/units.rs calc_cell/scan 网格（L700-772，交叉核对）。
// 直接 import 现役 engine.ts（真实现，零同源复制）：Object.create(GameEngine.prototype)
// + stub 字段面驱动真 rebuildBuckets/updateUnit/isEnemyFast（Task 140 原型链 stub 模式）。
// 截断契约（C# 侧哨兵同构，触达即设计错误）：
//  ① 神经头关闭（setNeuroEnabled(false) → policy.ts 教师路径——RL/BC 网络 tanh
//     位精确属 M-U2c，路线图已注记：现役网页默认开网络，M-U2c 须补 fdlibm tanh）；
//  ② 扫描单位 race 无 ranged、job≠3（远程域 M-U2c）；army/caravan undefined（M-U3）；
//  ③ fleeT=0、panic<panicRout(0.72)、健康度不触发 flAct=1/stance=3（三角函数
//     出口——fdlibm atan2/cos/sin 属 M-U2a 切片 3）；
//  ④ 近战触及（enemyD<reach）须 cd>0（战斗树 M-U2c）；⑤ 无龙（breath 列 M-U3）、
//     civ 扫描者恒有敌在环（文明职业链 M-U3）。
// 运行：bun scripts/unity-migration/gen-units-buckets.mjs
// 输出：scripts/unity-migration/golden-units-buckets.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, TRAITS } from '../../src/lib/game/types.ts';
import { WB } from '../../src/lib/wasm/wbspatial.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { setNeuroEnabled } from '../../src/lib/game/neuro.ts';
import { writeFileSync } from 'node:fs';

const W = 256, H = 160;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };

setNeuroEnabled(false);   // 截断契约①：教师路径（C# TeacherFlight/TeacherStance 同构）
WB.setEnabled(false);     // WB.scan WASM 分流关闭——JS 桶环路径为准

// ---- ep 真值随 JSON 分发（C# 不硬编码引擎参数） ----
const EP = {
  panicDecay: ep('social.panicDecay'), grudgeDecay: ep('social.grudgeDecay'),
  fireDamage: ep('fire.damage'), panicRout: ep('social.panicRout'),
};

// ---- 种族挑选（真 RACES 表扫描；位字节+reach 随 JSON 回显——C# 零独立打包） ----
const pickRace = (key) => {
  for (const k of Object.keys(RACES)) if (RACES[k].key === key) return Number(k);
  throw new Error('race not found: ' + key);
};
const RACE_KEYS = ['human', 'sheep', 'wolf', 'shark', 'fish', 'scorpion', 'snake', 'bear',
  'zombie', 'skeleton', 'whitewalker', 'dragon', 'demon', 'kraken', 'sandworm', 'basilisk',
  'vampire', 'troll', 'ogre', 'bandit'];
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
    tbf1: (d.coldBlood ? 4 : 0) | (d.beach ? 8 : 0),
    reach: d.reach === undefined ? null : d.reach,   // NaN ≡ undefined（C# ?? 0.9 语义）
  };
}

// ---- 场景地形 spec（def + 矩形补丁，C# 侧同式重建） ----
const TERRAIN_SPECS = [
  { name: 'plains', def: T.GRASS, patches: [] },
  { name: 'sharkzone', def: T.GRASS, patches: [[50, 20, 56, 26, T.WATER]] },
];

// ---- 单位构造（null ≡ undefined——与 TS 可选字段语义一致） ----
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
  dead: !!o.dead,
  caravan: o.caravan ?? 0,
  speed: o.speed === undefined ? null : o.speed,
});
const mkTsUnit = (spec) => {
  const u = { id: spec.id, race: spec.race, x: spec.x, y: spec.y, tx: spec.tx, ty: spec.ty };
  if (spec.age !== undefined) u.age = spec.age;
  if (spec.maxAge !== undefined) u.maxAge = spec.maxAge;
  if (spec.hp !== undefined) u.hp = spec.hp;
  if (spec.maxHp !== undefined) u.maxHp = spec.maxHp;
  if (spec.dmg) u.dmg = spec.dmg;
  if (spec.kills) u.kills = spec.kills;
  if (spec.hurt !== null) u.hurt = spec.hurt;
  if (spec.cd) u.cd = spec.cd;
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
  if (spec.boat) u.boat = spec.boat;
  u.civ = spec.civ; u.job = spec.job; u.flip = spec.flip;
  if (spec.dead) u.dead = true;
  if (spec.caravan) u.caravan = spec.caravan;      // 商队伙伴 civ id（0 = undefined）
  if (spec.speed !== null) u.speed = spec.speed;   // MoveUnit step = speed*2*mul
  return u;
};
const snapU = (u) => ({
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
  sxk: u.sxk === undefined ? null : bitHex(u.sxk),
  syk: u.syk === undefined ? null : bitHex(u.syk),
  infected: !!u.infected, dead: !!u.dead, grab: u.grab ?? 0, boat: u.boat ?? 0,
  caravan: u.caravan ?? 0,
  dmg: bitHex(u.dmg ?? 0), kills: u.kills ?? 0,
  x: bitHex(u.x), y: bitHex(u.y), tx: bitHex(u.tx), ty: bitHex(u.ty),
});

/** IEEE754 小端 16 hex（位模式对账用，禁 epsilon） */
function bitHex(d) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- stub 引擎：网格字段面 + 扫描哨兵面 ----
function makeStubEng(env, cap) {
  const eng = Object.create(GameEngine.prototype);
  eng.terrain = new Uint8Array(W * H);
  eng.road = new Uint8Array(W * H);
  eng.fire = new Uint8Array(W * H);
  eng.radiate = new Uint8Array(W * H);
  eng.fireSet = new Set(env.fireSet ?? []);
  eng.damagedSet = new Set();
  eng.buildings = []; eng.bIdx = new Map(); eng.civs = {};
  eng.building = new Uint8Array(W * H);   // wallBlocks 逐格建筑 id（0=无墙——场景契约）
  eng.bw = W / 4; eng.bh = H / 4;
  eng.buckets = Array.from({ length: eng.bw * eng.bh }, () => []);
  eng.bucketStampArr = new Int32Array(eng.bw * eng.bh);   // M-U2b：懒清空世代戳
  eng.bucketStamp = 0;
  eng.ghostBuckets = [];                                   // M-U2b：Task 133 幽灵清单
  eng.enemyLut = new Map();                                // isEnemyFast LUT（引擎私有字段镜像）
  eng.rel = new Map();                                     // atWar 关系表（真 atWar 方法读）
  eng.dynRaces = new Map();                                // isHerbivoreRace 递归域
  eng.laws = { undeadRise: env.lawsRise ?? false };
  eng.nature = { season: env.season ?? 0, bloodMoonTTL: env.bloodMoonTtl ?? 0, eclipseTTL: env.eclipseTtl ?? 0 };
  eng.moonIllum = () => env.moonIllum ?? 0;   // 满月潮汐 illum≥0.95 快照（场景 0）
  eng.fxPrefs = { get ambience() { return env.ambience ?? false; } };
  eng.tickCount = 0;
  eng.fx = (kind, x, y, ttl) => cap.fx.push({ k: kind, x: bitHex(x), y: bitHex(y), ttl });
  eng.grabbedTick = (u) => cap.evt.push(['grab', u.id]);
  eng.updateBoat = (u) => cap.evt.push(['boat', u.id]);
  eng.riseSkeleton = (x, y) => cap.evt.push(['rise', bitHex(x), bitHex(y)]);
  eng.spreadPlague = (u) => cap.evt.push(['plague', u.id]);
  eng.gearBonus = () => ({ regen: env.gearRegen ?? 0, crit: 0, armor: 0, lifesteal: 0, thorns: 0, speed: 1, ranged: 0 });
  eng.techModsOf = () => ({ range: 0, archer: 1, repair: 1 });   // bowRange 文明科技项（场景契约 0）
  eng.setTerrain = (i, t) => { if (eng.terrain[i] === t) return; const old = eng.terrain[i]; eng.terrain[i] = t; cap.terr.push([i, old, t]); };
  // 尾段/后段事件流（enemy==null → tail+post；enemy 命中 → 仅 post——TS 结构语义）
  eng.updateUnitTailJS = (u) => { cap.evt.push(['tail', u.id]); return false; };
  eng.updateUnitPostJS = (u) => { cap.evt.push(['post', u.id]); };
  return eng;
}
const buildGrid = (spec) => {
  const g = new Uint8Array(W * H).fill(spec.def);
  for (const [x1, y1, x2, y2, t] of spec.patches)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) g[y * W + x] = t;
  return g;
};

// ---- 桶状态转储（非空桶按 ci 升序 + 成员 slot 序 = push 序） ----
const dumpBuckets = (eng) => {
  const out = [];
  for (let ci = 0; ci < eng.buckets.length; ci++)
    if (eng.buckets[ci].length) out.push([ci, eng.buckets[ci].map((u) => eng.units.indexOf(u))]);
  return out;
};
const dumpLut = (eng) => {
  const keys = [...eng.enemyLut.keys()].sort((a, b) => a - b);
  return { size: keys.length, entries: keys.map((k) => [k, eng.enemyLut.get(k)]) };
};

const applyMut = (u, m) => {
  for (const [k, v] of Object.entries(m)) {
    if (k === 'slot') continue;
    if (k === 'panic' || k === 'sxk' || k === 'syk' || k === 'food' || k === 'chill' || k === 'stk') {
      u[k] = v === null ? undefined : v;
    } else if (k === 'gids') {
      if (v === null) { u.gIds = undefined; u.gVal = undefined; }
      else { u.gIds = [...v]; if (u.gVal === undefined) u.gVal = v.map(() => 1); }
    } else if (k === 'dead') u.dead = !!v;
    else if (k === 'flip') u.flip = !!v;
    else u[k] = v;
  }
};

// ================= 场景定义 =================
const CASES = [];

// S1 rebuild-ghost：网格生命周期（clamp 边界 / 同桶序 / dead 入桶 / 幽灵清理 / 懒清空重投）
CASES.push({
  name: 'rebuild-ghost', mode: 'rebuild', terrain: 'plains', seed: 1, env: {},
  units: [
    U({ id: 1, race: raceIds.sheep, x: -0.4, y: -0.7 }),        // 负坐标 → 截断 0 → clamp 0
    U({ id: 2, race: raceIds.sheep, x: 1020.5, y: 80.5 }),      // 255 → clamp 63
    U({ id: 3, race: raceIds.sheep, x: 100.5, y: 100.5 }),      // (25,25)
    U({ id: 4, race: raceIds.sheep, x: 100.9, y: 100.2 }),      // 同桶 (25,25)——push 序
    U({ id: 5, race: raceIds.sheep, x: 256.0, y: 161.0 }),      // 64/40 → clamp (63,39)
    U({ id: 6, race: raceIds.sheep, x: 159.9999, y: 159.9999 }),// 角落 (39,39)
    U({ id: 7, race: raceIds.sheep, x: 100.5, y: 100.5, dead: true }), // dead 仍入桶（rebuild 无 dead 过滤）
  ],
  steps: [
    null,                                                            // tick1：初始投放
    { muts: [{ slot: 2, x: 200.5, y: 100.5 }, { slot: 3, x: 104.5, y: 100.5 }, { slot: 4, x: 1020.5, y: -1.0 }] }, // tick2：移桶（幽灵清理）
    { muts: [{ slot: 2, x: 100.5, y: 100.5 }] },                     // tick3：移回（懒清空重投）
  ],
});

// S2 allies-contagion：羊群恐慌传染链（contagious 掷骰 + 4² 窗 + panic 写 + 边界桶跳过）
// seed 寻优：u0 首拍 contagious 抽 <0.2（panic 0.62 前置衰减后 0.612>0.55 → 必掷）
CASES.push({
  name: 'allies-contagion', mode: 'units', terrain: 'plains', seed: 77, env: {},
  units: [
    U({ id: 1, race: raceIds.sheep, x: 1.5, y: 1.5, panic: 0.62 }),   // u0：cx=0/cy=0 边界桶（by=-1/bx=-1 跳过）
    U({ id: 2, race: raceIds.sheep, x: 2.5, y: 1.5, panic: 0.1 }),    // u1：d²=1 <16 且 0.1<0.462 → 传染
    U({ id: 3, race: raceIds.sheep, x: 7.5, y: 1.5, panic: 0.3 }),    // u2：d²=36 >16 → 不传染（同环 allies++）
    U({ id: 4, race: raceIds.sheep, x: 3.5, y: 3.5, panic: 0.5 }),    // u3：d²=8 <16 但 0.5>0.462 → 不传染
    U({ id: 5, race: raceIds.sheep, x: 1.5, y: 4.5 }),                // u4：panic undefined→0 <0.462 → 传染（0.2248 写回）
  ],
  steps: 4,
});

// S3 wolf-chase：双狼追羊（LUT 首抽/命中 + 视野粗筛 d2≥bestD² + 迭代序 + chase 出口 + moveUnit）
CASES.push({
  name: 'wolf-chase', mode: 'units', terrain: 'plains', seed: 31337, env: {},
  units: [
    U({ id: 1, race: raceIds.wolf, x: 100.5, y: 80.5, dmg: 10, speed: 0.093 }),   // u0：狼（predator）
    U({ id: 2, race: raceIds.sheep, x: 103.4, y: 81.4, dmg: 1, speed: 0.05 }),    // u1：羊（猎物——狼敌羊非敌，非对称敌意）
    U({ id: 3, race: raceIds.wolf, x: 107.5, y: 82.5, dmg: 10, speed: 0.093 }),   // u2：第二狼（同环看羊 → LUT 命中路径）
    U({ id: 4, race: raceIds.sheep, x: 107.0, y: 80.2, dmg: 1, speed: 0.05 }),    // u3：远羊（d²=42.3 ≥ bestD²=6.12 → 视野粗筛跳过——迭代序锚）
  ],
  steps: 6,
});

// S4 grudge-selection：血仇舍近求远（gIds 加权 wd=d×(1-0.42×min(1,gVal/2)) + 无血仇视野粗筛对照）
CASES.push({
  name: 'grudge-selection', mode: 'units', terrain: 'plains', seed: 606, env: {},
  units: [
    U({ id: 11, race: raceIds.wolf, x: 40.5, y: 40.5, dmg: 10, speed: 0.093, gids: [12], gval: [2.0] }), // u0：血仇狼（仇羊 id=12）
    U({ id: 12, race: raceIds.sheep, x: 43.5, y: 40.5, dmg: 1, speed: 0.05 }),   // u1：仇羊 d=3.0 → wd=1.74（舍近求远胜出）
    U({ id: 13, race: raceIds.sheep, x: 42.5, y: 40.5, dmg: 1, speed: 0.05 }),   // u2：近羊 d=2.0（无血仇——1.74<2.0 落选）
    U({ id: 14, race: raceIds.wolf, x: 40.5, y: 42.5, dmg: 10, speed: 0.093 }),  // u3：无血仇对照狼（选 d=2.83 近羊 + d2 粗筛）
  ],
  steps: 3,
});

// S5 enemy-matrix：isEnemyFast/isEnemy/isHerbivoreRace 直驱矩阵（LUT 污染陷阱 + dyn 递归 + 行回绕）
CASES.push({
  name: 'enemy-matrix', mode: 'matrix', terrain: 'sharkzone', seed: 9, env: {},
  units: [],
  matrix: null,   // 求值后填充（见下方矩阵构建）
});

// S6 civ-war：文明战争索敌（atWar rel 表 + LUT 旁路 + 同袍 allies + 文明 isCiv stance 路径）
CASES.push({
  name: 'civ-war', mode: 'units', terrain: 'plains', seed: 20261026, env: {},
  units: [
    U({ id: 1, race: raceIds.human, x: 200.5, y: 80.5, dmg: 6, speed: 0.14, civ: 1 }),  // u0：civ1 战士
    U({ id: 2, race: raceIds.human, x: 203.9, y: 80.5, dmg: 6, speed: 0.14, civ: 2 }),  // u1：civ2 敌国（rel '1-2'=-30）
    U({ id: 3, race: raceIds.human, x: 200.5, y: 82.5, dmg: 6, speed: 0.14, civ: 1 }),  // u2：civ1 同袍（allies）
    U({ id: 4, race: raceIds.sheep, x: 208.5, y: 84.5, dmg: 1, speed: 0.05, civ: -1 }), // u3：野生羊对照（非敌——人非捕食者）
  ],
  steps: 3,
  relWar: [['1-2', -30], ['1-3', 20], ['2-3', 20]],
});

// S7 caravan-flee：商队夺路而逃（k=4 mul 1.15——gate 序第一位）
CASES.push({
  name: 'caravan-flee', mode: 'units', terrain: 'plains', seed: 404, env: {},
  units: [
    U({ id: 1, race: 'human', x: 60.5, y: 60.5, dmg: 6, speed: 0.14, civ: 1, caravan: 3 }),  // u0：行商（遇敌即逃）
    U({ id: 2, race: 'human', x: 63.5, y: 60.5, dmg: 6, speed: 0.14, civ: 2 }),              // u1：敌国劫掠者（chase）
    U({ id: 3, race: 'human', x: 60.5, y: 62.5, dmg: 6, speed: 0.14, civ: 1 }),              // u2：同国武护（chase u1）
    U({ id: 4, race: 'sheep', x: 70.5, y: 66.5, dmg: 1, speed: 0.05, civ: -1 }),             // u3：无关羊
  ],
  steps: 2,
  relWar: [['1-2', -30], ['1-3', 20], ['2-3', 20]],
});

// S8 fleeT-disengage：脱离冷却双乘数（panic<0.5→1.18 / ≥0.5→1.32）+ 次拍转 chase
CASES.push({
  name: 'fleeT-disengage', mode: 'units', terrain: 'plains', seed: 505, env: {},
  units: [
    U({ id: 1, race: 'wolf', x: 70.5, y: 80.5, dmg: 10, speed: 0.093, fleeT: 4, panic: 0.2 }),  // u0：低恐慌脱离（1.18）
    U({ id: 2, race: 'sheep', x: 73.5, y: 80.5, dmg: 1, speed: 0.05 }),                          // u1：脱离对象
    U({ id: 3, race: 'wolf', x: 90.5, y: 80.5, dmg: 10, speed: 0.093, fleeT: 4, panic: 0.7 }),  // u2：高恐慌脱离（1.32）
    U({ id: 4, race: 'sheep', x: 93.5, y: 80.5, dmg: 1, speed: 0.05 }),                          // u3：脱离对象
  ],
  steps: 3,
});

// S9 panic-rout：恐慌溃逃（≥0.72 → fleeT=60 + mul 1.3）+ 次拍 fleeT×1.32 转脱离
//    熊×文明人敌意（predator&&BEAR&&isCiv）+ civ 内战溃逃 + 追兵三重奏
CASES.push({
  name: 'panic-rout', mode: 'units', terrain: 'plains', seed: 606, env: {},
  units: [
    U({ id: 1, race: 'bear', x: 118.5, y: 82.5, dmg: 20, speed: 0.09, panic: 0.8, civ: -1 }),   // u0：惊熊（见人即敌）
    U({ id: 2, race: 'human', x: 120.5, y: 80.5, dmg: 6, speed: 0.14, panic: 0.8, civ: 1 }),    // u1：惊恐国民（见敌国溃逃）
    U({ id: 3, race: 'human', x: 123.5, y: 80.5, dmg: 6, speed: 0.14, civ: 2 }),                // u2：敌国追兵（chase u1——贴近保环覆盖防职业链哨兵）
  ],
  steps: 3,
  relWar: [['1-2', -30]],
});

// S10 flight-flee：战或逃教师路径（伤狼 prey 分支 f0<0.22 / 巨怪 troll f0<0.15）+ 次拍 fleeT×1.18
CASES.push({
  name: 'flight-flee', mode: 'units', terrain: 'plains', seed: 707, env: {},
  units: [
    U({ id: 1, race: 'wolf', x: 130.5, y: 80.5, dmg: 10, speed: 0.093, hp: 15, maxHp: 100 }),   // u0：伤狼（f0=0.15<0.22 → FLEE）
    U({ id: 2, race: 'sheep', x: 133.5, y: 80.5, dmg: 1, speed: 0.05 }),                         // u1：猎物（逃跑对象）
    U({ id: 3, race: 'troll', x: 140.5, y: 80.5, dmg: 30, speed: 0.052, hp: 14, maxHp: 100 }),  // u2：重创巨魔（f0<0.15 → FLEE；0.35/拍再生→次拍转 chase）
    U({ id: 4, race: 'sheep', x: 143.5, y: 80.5, dmg: 1, speed: 0.05 }),                         // u3：猎物
  ],
  steps: 3,
});

// S11 stance-withdraw：伤重脱离（isCiv + hpN<0.3 + powRatio<0.42 → fleeT=50 + k=6 mul 1.15）
CASES.push({
  name: 'stance-withdraw', mode: 'units', terrain: 'plains', seed: 808, env: {},
  units: [
    U({ id: 1, race: 'human', x: 160.5, y: 80.5, dmg: 4, speed: 0.14, hp: 20, maxHp: 100, civ: 1 }), // u0：劣势散兵
    U({ id: 2, race: 'human', x: 163.5, y: 80.5, dmg: 20, speed: 0.14, hp: 100, maxHp: 100, civ: 2 }), // u1：强敌（powRatio 0.167）
  ],
  steps: 3,
  relWar: [['1-2', -30]],
});

// S12 gate-order：商队 > fleeT > rout 门序锁定（caravan=1 + fleeT=4 + panic=0.9 三门全开——caravan 胜出）
CASES.push({
  name: 'gate-order', mode: 'units', terrain: 'plains', seed: 909, env: {},
  units: [
    U({ id: 1, race: 'human', x: 180.5, y: 80.5, dmg: 6, speed: 0.14, civ: 1, caravan: 1, fleeT: 4, panic: 0.9 }), // u0：三门全开
    U({ id: 2, race: 'human', x: 183.5, y: 80.5, dmg: 6, speed: 0.14, civ: 2 }),                                    // u1：敌
  ],
  steps: 2,
  relWar: [['1-2', -30]],
});

// ---- S5 矩阵构建（真实现求值——期望即记录，零硬编码） ----
{
  const c = CASES.find((x) => x.name === 'enemy-matrix');
  const cap = { fx: [], evt: [], terr: [] };
  const eng = makeStubEng({}, cap);
  eng.terrain.set(buildGrid(TERRAIN_SPECS.find((s) => s.name === c.terrain)));
  const mk = (raceKey, x, y, extra) => mkTsUnit({ ...U({ race: raceIds[raceKey], x, y, ...(extra ?? {}) }) });
  const shark = mk('shark', 55.5, 21.5);
  const shark2 = mk('shark', 45.5, 21.5);
  const fish = mk('fish', 53.5, 22.5);
  const sheepLand = mk('sheep', 60.5, 23.5);
  const sheepWater = mk('sheep', 52.5, 23.5);      // (52,23) ∈ 水域补丁
  const sheepOobNeg = mk('sheep', -1.5, -0.5);     // idx<0 → undefined → isWater false
  const sheepOobWrap = mk('sheep', -1.5, 23.5);    // 负 x 行回绕（idx≥0）→ 读 def GRASS
  const wolf = mk('wolf', 10.5, 10.5);
  const wolf2 = mk('wolf', 12.5, 10.5);
  const bear = mk('bear', 20.5, 10.5);
  const human1 = mk('human', 30.5, 10.5, { civ: 1 });
  const human2 = mk('human', 32.5, 10.5, { civ: 2 });
  const human3 = mk('human', 34.5, 10.5, { civ: 1 });
  const bandit = mk('bandit', 40.5, 10.5);
  const zombie = mk('zombie', 50.5, 30.5);
  const skeleton = mk('skeleton', 52.5, 30.5);
  const ww = mk('whitewalker', 54.5, 30.5);
  const dragon = mk('dragon', 56.5, 30.5);
  const demon = mk('demon', 58.5, 30.5);
  const kraken = mk('kraken', 60.5, 30.5);
  const sandworm = mk('sandworm', 62.5, 30.5);
  const basilisk = mk('basilisk', 64.5, 30.5);
  const vampire = mk('vampire', 66.5, 30.5);
  const scorpion = mk('scorpion', 68.5, 30.5);
  const snake = mk('snake', 70.5, 30.5);
  const dynHerb = mk('sheep', 90.5, 10.5); dynHerb.race = 500;
  const dynPred = mk('sheep', 92.5, 10.5); dynPred.race = 501;
  const dynNeutral = mk('sheep', 94.5, 10.5); dynNeutral.race = 502;
  const scorpion2 = mk('scorpion', 14.5, 10.5);   // 狼×蝎分支测试（预建避免 ops 内联 id 漂移）
  const wolfWater = mk('wolf', 52.5, 21.5);   // 水域狼（(52,21)∈补丁——鲨鱼水陆判定触达）
  // 动态种族（真实引擎 speciation 语义：RACES 表 + dynRaces 表双注册）
  RACES[500] = { key: 'dynherb', name: '演化羊', undead: false, hostile: false, isCiv: false, predator: false, aquatic: false, flying: false, lavaImmune: false };
  RACES[501] = { key: 'dynpred', name: '演化狼', undead: false, hostile: false, isCiv: false, predator: false, aquatic: false, flying: false, lavaImmune: false };
  RACES[502] = { key: 'dynneutral', name: '中立演化', undead: false, hostile: false, isCiv: false, predator: false, aquatic: false, flying: false, lavaImmune: false };
  eng.dynRaces.set(500, { eco: 'herb', parent: raceIds.sheep });
  eng.dynRaces.set(501, { eco: 'pred', parent: raceIds.sheep });
  eng.dynRaces.set(502, { eco: null, parent: raceIds.sheep });   // eco 空 → 沿 parent 递归
  eng.rel.set('1-2', -30);   // atWar(1,2) true（rel < -20）
  eng.rel.set('1-3', 20);    // 同国不判（civ 相同短路）
  eng.rel.set('2-3', 20);

  // 矩阵调用序（顺序敏感——LUT 逐次填充；fast=LUT 通道 / direct=绕过 LUT）
  const ops = [
    ['fast', shark, sheepLand],      // 鲨×陆羊 → predator×herb 短路 true 入 LUT（水陆判定不触达）
    ['fast', shark, sheepWater],     // 鲨×水羊 → LUT 命中 true
    ['direct', shark, sheepWater],   // 绕过 LUT → true（predator×herb）
    ['fast', shark2, sheepWater],    // 同键再命中 → true
    ['direct', shark, fish],         // 鲨×鱼 → true（FISH 分支）
    ['fast', shark, wolf],           // 鲨×陆狼 → 非猎物 → 水陆判定 isWater(land)=false → false 入 LUT
    ['fast', shark, wolfWater],      // 鲨×水狼 → LUT 命中 false（水陆依赖被 race 对键污染——陷阱锁定）
    ['direct', shark, wolfWater],    // 绕过 LUT → true（isWater 实判——狼会游泳才被鲨袭击）
    ['direct', shark, sheepOobNeg],  // 猎物短路：predator×herb 先于鲨鱼分支 → true（水陆判定不触达）
    ['direct', shark, sheepOobWrap], // 同上 → true
    ['fast', fish, shark],           // 反向对（独立 LUT 键）→ 鱼非捕食者 → false
    ['fast', wolf, sheepWater],      // 狼×羊 → predator×herb → true 入 LUT
    ['fast', wolf2, sheepWater],     // 狼×羊 LUT 命中 → true
    ['fast', sheepWater, wolf],      // 羊×狼（反向）→ 非对称敌意 → false
    ['fast', wolf, wolf2],           // 狼×狼 → false
    ['fast', wolf, scorpion2],        // 狼×蝎 → 蝎非猎物 → false
    ['fast', scorpion, sheepWater],  // 蝎×羊 → true（蝎猎小型食草）
    ['fast', snake, scorpion],       // 蛇×蝎 → true（蛇吃蝎）
    ['fast', snake, sheepWater],     // 蛇×羊 → true
    ['fast', bear, human1],          // 熊×文明人 → true（predator && BEAR && isCiv）
    ['fast', bear, sheepWater],      // 熊×羊 → true（predator×herb）
    ['fast', bear, wolf],            // 熊×狼 → 双捕食者 → false
    ['fast', human1, human2],        // 文明 1×2 → atWar(rel -30) → true（civ 路径绕过 LUT）
    ['fast', human2, human1],        // 反向 → true（pairKey 无向）
    ['fast', human1, human3],        // 同国 → false（civ 相同短路）
    ['fast', human1, sheepWater],    // 人×羊 → 人非捕食者 → false
    ['fast', bandit, human1],        // 匪×人 → hostile×isCiv → true
    ['fast', human1, bandit],        // 人×匪 → 反向 hostile×isCiv → true
    ['fast', zombie, zombie],        // 僵×僵 → race 相同 → false
    ['fast', zombie, sheepWater],    // 僵×羊 → true
    ['fast', skeleton, zombie],      // 骷×僵 → 双亡灵 → false（亡者阵营门先于种分支）
    ['fast', skeleton, sheepWater],  // 骷×羊 → true
    ['fast', ww, zombie],            // 白行者×僵 → 双亡灵 → false
    ['fast', ww, sheepWater],        // 白行者×羊 → true
    ['fast', dragon, sheepWater],    // 龙×羊 → true
    ['fast', dragon, demon],         // 龙×恶魔 → true（双侧为敌种分支）
    ['fast', demon, dragon],         // 恶魔×龙 → true
    ['fast', kraken, fish],          // 克拉肯×鱼 → true（kraken 分支先于 shark 分支）
    ['fast', sandworm, basilisk],    // 沙虫×蛇怪 → true
    ['fast', basilisk, sheepWater],  // 蛇怪×羊 → true
    ['fast', vampire, sheepWater],   // 吸血鬼×羊 → 非 predator/hostile×civ 命中 → false（真值记录）
    ['fast', vampire, human1],       // 吸血鬼×人 → hostile×isCiv（若 vampire hostile）→ 真值记录
    ['herb', 500], ['herb', 501], ['herb', 502], ['herb', raceIds.sheep], ['herb', raceIds.wolf],
    ['fast', wolf, dynHerb],
    ['fast', wolf, dynPred],
    ['fast', wolf, dynNeutral],
  ];
  const matrix = [];
  for (const [t, a, b] of ops) {
    if (t === 'fast') matrix.push({ t, a: a.id, b: b.id, v: eng.isEnemyFast(a, b) });
    else if (t === 'direct') matrix.push({ t, a: a.id, b: b.id, v: eng.isEnemy(a, b) });
    else matrix.push({ t, r: a, v: eng.isHerbivoreRace(a) });
  }
  c.matrix = {
    ops: matrix,
    unitIndex: (() => {   // 单位注册表（C# 侧按 spec 重建——race/x/y/civ/dmg/hp 等全量回显）
      const all = [shark, shark2, fish, sheepLand, sheepWater, sheepOobNeg, sheepOobWrap, wolf, wolf2, bear,
        human1, human2, human3, bandit, zombie, skeleton, ww, dragon, demon, kraken, sandworm, basilisk,
        vampire, scorpion, snake, scorpion2, wolfWater, dynHerb, dynPred, dynNeutral];
      return all.map((u) => ({ id: u.id, race: u.race, x: u.x, y: u.y, civ: u.civ }));   // 矩阵只需敌意判定字段（纯数值 spec）
    })(),
    dyn: [[500, 1, raceIds.sheep], [501, 2, raceIds.sheep], [502, 0, raceIds.sheep]],  // [race, eco, parent]
    rel: [['1-2', -30], ['1-3', 20], ['2-3', 20]],
    lut: dumpLut(eng),
  };
}

// ---- 主循环：逐 case 驱动 ----
const out = {
  w: W, h: H, ep: EP, raceIds, races: raceTable,
  terrainSpecs: TERRAIN_SPECS, cases: [],
};
for (const c of CASES) {
  if (c.mode === 'matrix') { out.cases.push(c); continue; }
  const env = { ...c.env };
  const cap = { fx: [], evt: [], terr: [] };
  const eng = makeStubEng(env, cap);
  eng.terrain.set(buildGrid(TERRAIN_SPECS.find((s) => s.name === c.terrain)));
  if (c.relWar) for (const [k, v] of c.relWar) eng.rel.set(k, v);
  const specs = c.units;
  const units = specs.map((s) => mkTsUnit({ ...s, race: raceIds[s.race] ?? s.race }));
  eng.units = units;
  let draws = 0;
  const raw = mulberry32(c.seed);
  eng.rng = () => { draws++; return raw(); };

  const outSteps = [];
  for (let sn = 0; sn < (c.mode === 'rebuild' ? c.steps.length : c.steps); sn++) {
    const muts = [];
    if (c.mode === 'rebuild') {
      const stp = c.steps[sn];
      if (stp?.muts) for (const m of stp.muts) { applyMut(units[m.slot], m); muts.push(m); }
    }
    eng.rebuildBuckets();   // 真实现——每 tick 网格重建（幽灵清理 + 懒清空）
    const stepRec = {
      muts,
      stamp: eng.bucketStamp,
      ghosts: eng.ghostBuckets.slice(),
      buckets: dumpBuckets(eng),
    };
    if (c.mode === 'units') {
      const draw0 = draws;
      const perU = [];
      for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (u.dead) { perU.push({ dead: true }); continue; }
        const e0 = cap.evt.length, f0 = cap.fx.length, t0 = cap.terr.length;
        eng.updateUnit(u);   // 真实现——pre+扫描环+出口链全程
        perU.push({
          ...snapU(u),
          evt: cap.evt.slice(e0).map((e) => e.map((v) => v)),
          fx: cap.fx.slice(f0).map((f) => [f.k, f.x, f.y, f.ttl]),
          terr: cap.terr.slice(t0).map((p) => [p[0], p[1], p[2]]),
        });
      }
      stepRec.units = perU;
      stepRec.draws = draws - draw0;
      eng.tickCount++;
    }
    outSteps.push(stepRec);
  }
  const rec = {
    name: c.name, mode: c.mode, terrain: c.terrain, seed: c.seed,
    env: c.env, relWar: c.relWar ?? null,
    units: specs.map((s) => ({ ...s, race: raceIds[s.race] ?? s.race })), steps: c.steps ?? 0,
    out: outSteps,
  };
  if (c.mode === 'units') {
    rec.final = units.map(snapU);
    rec.lut = dumpLut(eng);
    const rngTail = [raw(), raw(), raw(), raw()].map(bitHex);
    rec.rngTail = rngTail;
  }
  // 激活度 sanity（激活度工程断言——静默通过即达标）
  if (c.name === 'allies-contagion') {
    const u1 = units[1], u4 = units[4];
    if (!(u1.panic > 0.3 && u1.panic < 0.4)) throw new Error('S2 传染未激活: u1.panic=' + u1.panic);
    if (!(u4.panic > 0.2 && u4.panic < 0.3)) throw new Error('S2 传染未激活: u4.panic=' + u4.panic);
    if (!(units[3].panic === 0.5 - EP.panicDecay * 4)) throw new Error('S2 u3 未被传染才对: ' + units[3].panic);
  }
  if (c.name === 'wolf-chase') {
    if (eng.enemyLut.get(raceIds.wolf * 65536 + raceIds.sheep) !== true) throw new Error('S3 LUT 未命中 wolf×sheep');
    const d6 = Math.hypot(units[0].x - units[1].x, units[0].y - units[1].y);
    if (d6 < 1.0) throw new Error('S3 狼贴脸触及近战域: d=' + d6);
    if (units[0].tx !== units[1].x || units[0].ty !== units[1].y) throw new Error('S3 chase 未锁定羊');
  }
  if (c.name === 'grudge-selection') {
    if (units[0].tx !== units[1].x) throw new Error('S4 血仇未舍近求远: tx=' + units[0].tx + ' 期望仇羊 x=' + units[1].x);
    if (units[3].tx !== units[2].x) throw new Error('S4 对照狼未选近羊');
  }
  if (c.name === 'civ-war') {
    if (eng.enemyLut.size !== 0) throw new Error('S6 文明对不应入 LUT: size=' + eng.enemyLut.size);
  }
  out.cases.push(rec);
}

writeFileSync(new URL('./golden-units-buckets.json', import.meta.url), JSON.stringify(out));
console.log('golden-units-buckets.json written:',
  JSON.stringify({ cases: out.cases.length, ep: EP, raceIds }));
