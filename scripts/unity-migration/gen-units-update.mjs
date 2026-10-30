// ============================================================================
// gen-units-update.mjs —— M-U7l 切片「updateUnit 批次一」黄金向量（M-U2a 草稿接管：行号修正 + 双写标准化 + det 复验 df/e58480d1 链）
// 蓝本：src/lib/game/engine.ts updateUnit（现行号 L3455 入口 → L3590 hp≤0 死亡门批次一边界；
//       扫描域空桶穿行 → L4110 tailJS/L4112 postJS 影子调用点），
//       rust-core/src/units.rs update_unit（L2314+，交叉核对）。
// 直接 import 现役 engine.ts（真实现，非复制），以 Object.create(GameEngine.prototype)
// + stub 字段面驱动真 updateUnit；扫描段以空 buckets 截断（M-U2b 域），
// TailJS/PostJS 以实例方法遮蔽 stub（切片 3/4 域，事件流契约）。
// 引擎侧效应（grabbedTick/updateBoat/riseSkeleton/spreadPlague/fx）以事件流捕获。
// 截断契约（对 rng 消耗断点敏感，场景设计须遵守）：
//  ① 单位 panic 注入恒 ≤0.55（contagious 掷骰属扫描段——留给切片 3）；
//  ② civ=-1（isCiv 种族亦然）→ peaceful 职业链整段跳过（L4112 门 u.civ>=0→现 L3937）；
//  ③ fireSet/damagedSet 空且单位非消防相关 → 消防域 && 短路零抽；
//  ④ WB.setEnabled(false) → 扫描走 JS 空桶路径，零消耗。
// 运行：bun scripts/unity-migration/gen-units-update.mjs
// 输出：scripts/unity-migration/golden/units_update.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/units_update.json（双写）
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, TRAITS } from '../../src/lib/game/types.ts';
import { WB } from '../../src/lib/wasm/wbspatial.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const W = 256, H = 160;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };

/** IEEE754 小端 16 hex（位模式对账用，禁 epsilon） */
const bitHex = (d) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

WB.setEnabled(false); // 扫描哨兵：JS 空桶路径（C# 对账台同构零消耗）

// ---- ep 真值随 JSON 分发（C# 不硬编码引擎参数） ----
const EP = { panicDecay: ep('social.panicDecay'), grudgeDecay: ep('social.grudgeDecay'), fireDamage: ep('fire.damage') };

// ---- 种族挑选（真 RACES 表扫描；位字节随 JSON 回显——C# 零独立打包） ----
const pickRace = (pred, label) => {
  for (const k of Object.keys(RACES)) { const d = RACES[k]; if (pred(d)) return { id: Number(k), label }; }
  throw new Error('race not found: ' + label);
};
const RACE_PICKS = {
  human: pickRace((d) => d.isCiv && !d.flying && !d.aquatic && !d.lavaImmune, 'human'),
  sheep: pickRace((d) => !d.isCiv && !d.hostile && !d.predator && !d.undead && !d.aquatic, 'sheep'),
  wolf: pickRace((d) => d.predator && !d.undead && !d.isCiv && !d.aquatic && !d.flying, 'wolf'),
  kraken: pickRace((d) => d.aquatic && !d.beach, 'aquatic-noBeach'),
  troll: pickRace((d) => Number(d.key === 'troll'), 'troll'),
  demon: pickRace((d) => d.lavaImmune && !d.flying, 'lavaImmune'),
  ww: pickRace((d) => d.key === 'whitewalker', 'whitewalker'),
};
const packRace = (id) => {
  const d = RACES[id];
  return {
    flags: (d.hostile ? 1 : 0) | (d.isCiv ? 2 : 0) | (d.undead ? 4 : 0) | (d.predator ? 8 : 0) | (d.lavaImmune ? 16 : 0),
    tbf0: (d.flying ? 32 : 0) | (d.aquatic ? 64 : 0) | (d.sandswim ? 128 : 0),
    tbf1: (d.coldBlood ? 4 : 0) | (d.beach ? 8 : 0),
  };
};
const raceIds = {};
const raceTable = {};
for (const [k, rp] of Object.entries(RACE_PICKS)) { raceIds[k] = rp.id; raceTable[String(rp.id)] = packRace(rp.id); }
const TRAIT_REGEN = { regeneration: TRAITS.regeneration?.regen ?? 0 };

// ---- 场景地形 spec（def + 矩形补丁，C# 侧同式重建） ----
const mkTerrain = (name, def, patches) => ({ name, def, patches });
const TERRAIN_SPECS = {
  plains: mkTerrain('plains', T.GRASS, []),
  damage: mkTerrain('damage', T.GRASS, [
    [10, 10, 12, 12, T.GRASS],   // u0 火格站区（fire 注入）
    [20, 10, 22, 12, T.GRASS],   // u1 辐射格站区
    [30, 10, 32, 12, T.LAVA],    // u2/u3 岩浆站区
    [40, 10, 42, 12, T.WATER],   // u4 溺水站区
    [50, 10, 52, 12, T.GRASS],   // u5 水生窒息站区（陆格）
  ]),
  wwfield: mkTerrain('wwfield', T.GRASS, [
    [61, 57, 62, 58, T.FOREST],  // (61,57) 森林（0.4 门）——抽签可达域 x[61,64)y[57,60) 内
    [62, 57, 63, 58, T.WATER],   // (62,57) 水面（0.5 门 + 踏冰 0.6）
    [62, 58, 63, 59, T.BURNT],   // (62,58) 脚下焦土 → 直接转 SNOW
    [63, 58, 64, 59, T.SAND],    // (63,58) 沙 → 转 SNOW + 火格灭火（fire 注入）
  ]),
};

// ---- 单位构造（null ≡ undefined；traitRegen 已由真 TRAITS 表解析为数值） ----
let nextId = 1;
const U = (o) => ({
  id: o.id ?? nextId++,
  race: o.race, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
  age: o.age ?? 20, maxAge: o.maxAge ?? 55,
  hp: o.hp ?? 100, maxHp: o.maxHp ?? 100,
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
  trait: o.trait === undefined ? null : o.trait,   // trait 字符串（TS 侧 TRAITS 表查 regen 用；C# 用 traitRegen 数值）
  traitRegen: o.trait === undefined ? 0 : (TRAIT_REGEN[o.trait] ?? 0),
});
const mkTsUnit = (spec) => {
  const u = { id: spec.id, race: spec.race, x: spec.x, y: spec.y, tx: spec.tx, ty: spec.ty };
  if (spec.age !== undefined) u.age = spec.age;
  if (spec.maxAge !== undefined) u.maxAge = spec.maxAge;
  if (spec.hp !== undefined) u.hp = spec.hp;
  if (spec.maxHp !== undefined) u.maxHp = spec.maxHp;
  if (spec.hurt !== null) u.hurt = spec.hurt; // null ≡ undefined——TS Math.max(undefined,2)=NaN 怪癖保持
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
  if (spec.trait !== null && spec.trait !== undefined) u.trait = spec.trait; // 真 TRAITS 表键——TS 再生路径查表依赖
  return u;
};
const snapU = (u) => ({
  age: bitHex(u.age), hp: bitHex(u.hp), maxAge: bitHex(u.maxAge), maxHp: bitHex(u.maxHp),
  // hurt 不 ?? 0：undefined 保持 null——TS Math.max(undefined,2)=NaN 怪癖的位精确镜像（C# JsMax(NaN,·)=NaN 同构）
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
  x: bitHex(u.x), y: bitHex(u.y), tx: bitHex(u.tx), ty: bitHex(u.ty),
});
// ---- stub 引擎：updateUnit 前置段 + 哨兵面 ----
function makeStubEng(env, cap) {
  const eng = Object.create(GameEngine.prototype);
  eng.terrain = new Uint8Array(W * H);
  eng.fire = new Uint8Array(W * H);
  eng.radiate = new Uint8Array(W * H);
  eng.fireSet = new Set(env.fireSet ?? []);
  eng.damagedSet = new Set();
  eng.buildings = []; eng.bIdx = new Map(); eng.civs = {};
  eng.bw = W / 4; eng.bh = H / 4;
  eng.buckets = Array.from({ length: eng.bw * eng.bh }, () => []);
  eng.laws = { undeadRise: env.lawsRise };
  eng.fxPrefs = { get ambience() { return env.ambience; } };
  eng.fx = (kind, x, y, ttl) => cap.fx.push({ k: kind, x: bitHex(x), y: bitHex(y), ttl });
  eng.grabbedTick = (u) => cap.evt.push(['grab', u.id]);
  eng.updateBoat = (u) => cap.evt.push(['boat', u.id]);
  eng.riseSkeleton = (x, y) => cap.evt.push(['rise', bitHex(x), bitHex(y)]);
  eng.spreadPlague = (u) => cap.evt.push(['plague', u.id]);
  eng.gearBonus = () => ({ regen: env.gearRegen ?? 0, crit: 0, armor: 0, lifesteal: 0, thorns: 0, speed: 1, ranged: 0 });
  eng.setTerrain = (i, t) => { if (eng.terrain[i] === t) return; const old = eng.terrain[i]; eng.terrain[i] = t; cap.terr.push([i, old, t]); };
  // —— 扫描/尾段哨兵（场景契约：桶空不触达；触达即设计错误） ——
  eng.isEnemyFast = () => { throw new Error('SCAN_SENTINEL: buckets should be empty'); };
  eng.updateUnitTailJS = (u) => { cap.evt.push(['tail', u.id]); return false; };
  eng.updateUnitPostJS = (u) => { cap.evt.push(['post', u.id]); };
  return eng;
}

// ---- 地形重建（def + 矩形补丁；CASES 求值前定义——S5 种子寻优依赖） ----
const buildGrid = (spec) => {
  const g = new Uint8Array(W * H).fill(spec.def);
  for (const [x1, y1, x2, y2, t] of spec.patches)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) g[y * W + x] = t;
  return g;
};

// ---- S5 白行者种子寻优辅助（Task 138 龙卷先例：60 拍完整迷你仿真找多分支双命中种子） ----
const WW_STEPS = 60;
const wwMut = (i, u) => {
  if (i === 30) u.y = 57.3;               // 踏水（(62,57) WATER）→ 踏冰 0.6 门
  if (i === 45) { u.x = 61.5; u.y = 57.5; } // 入森林脚下（(61,57) FOREST）→ 0.4 门激活域
};
const findWwSeed = () => {
  for (let s = 1; s < 3000; s++) {
    const cap = { fx: [], evt: [], terr: [] };
    const eng = makeStubEng({ lawsRise: false, ambience: false, gearRegen: 0, fireSet: [63 * W + 58] }, cap);
    eng.terrain.set(buildGrid(TERRAIN_SPECS.wwfield));
    eng.fire[58 * W + 63] = 200; eng.fireSet.add(58 * W + 63);
    const u = mkTsUnit({ ...U({ id: 1, race: RACE_PICKS.ww.id, x: 62.5, y: 58.5, hp: 200, maxHp: 200, civ: -1 }), race: RACE_PICKS.ww.id });
    const raw = mulberry32(s); eng.rng = () => raw();
    let forest = false, ice = false, kill = false;
    for (let i = 0; i < WW_STEPS; i++) {
      wwMut(i, u);
      const t0 = cap.terr.length;
      eng.updateUnit(u);
      for (const [idx, oldT, newT] of cap.terr.slice(t0)) {
        if (newT === T.SNOW && oldT === T.FOREST) forest = true;
        if (newT === T.ICE) ice = true;
      }
      if (eng.fire[58 * W + 63] === 0) kill = true;
    }
    if (forest && ice && kill) return s;
  }
  throw new Error('no ww seed found (forest+ice+kill)');
};
const WW_SEED = findWwSeed();

// ---- 场景定义（mut 注入随 JSON 回显——C# 按 cfg 复现，规则化注入可审计） ----
// 种子寻优辅助：扫描种子使指定步的指定抽落入门内
const findSeed = (probe, lo, hi) => {
  for (let s = lo; s <= hi; s++) if (probe(s)) return s;
  throw new Error('no seed found in range');
};

const CASES = [
  // S1 core-timers：计时器全家桶 + 卡死自愈 + fx 门（panic≤0.55 契约、civ=-1 契约）
  {
    name: 'core-timers', terrain: 'plains', seed: 20261026,
    env: { lawsRise: false, ambience: true, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 120.5, y: 80.5, tx: 150.5, ty: 95.5, age: 20, maxAge: 55, hp: 50, maxHp: 100,
          hurt: 3, cd: 4, atk: 2, fleeT: 6, bless: 8, curse: 6, fert: 6, detour: 8,
          panic: 0.5, gids: [101, 102], gval: [0.5, 1.2], civ: -1 }),
    ],
    steps: 64,
  },
  // S2 aging-death：衰老门 + undeadRise 8% 门（种子寻优保证 u0 首拍命中 riseSkeleton）
  {
    name: 'aging-death', terrain: 'plains', seed: findSeed(
      (s) => { const r = mulberry32(s); return r() < 0.08; }, 1, 5000),
    env: { lawsRise: true, ambience: false, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 30.5, y: 30.5, age: 54.96, maxAge: 55, civ: -1 }),   // u0：1 拍后过阈 → 0.08 门首抽命中 → riseSkeleton + dead
      U({ race: 'human', x: 40.5, y: 30.5, age: 54.96, maxAge: 55, civ: -1 }),   // u1：同拍第二抽（≥0.08 概率大）→ 首拍幸存，次拍再掷
      U({ race: 'sheep', x: 50.5, y: 30.5, age: 54.96, maxAge: 55, civ: -1 }),   // u2：非 civ → 短路 0 抽直接死
      U({ race: 'human', x: 60.5, y: 30.5, age: 20, maxAge: 55, civ: -1 }),      // u3：低龄对照（全程存活）
    ],
    steps: 6,
  },
  // S3 terrain-damage：火/辐射/岩浆/溺水/窒息五连 + lavaImmune 免疫 + 死门触发
  {
    name: 'terrain-damage', terrain: 'damage', seed: 31337,
    env: { lawsRise: false, ambience: false, gearRegen: 0,
           fireInit: { '11,11': 200, '11,21': 1 }, radiateInit: { '11,21': 9 } },
    units: [
      U({ race: 'human', x: 11.5, y: 11.5, hp: 8, maxHp: 100, civ: -1 }),   // u0：火 3/拍 → 3 拍死（8→5→2→-1）
      U({ race: 'human', x: 21.5, y: 11.5, hp: 60, maxHp: 100, civ: -1 }),  // u1：火 3 + 辐射 0.5 → 持续掉血
      U({ race: 'human', x: 31.5, y: 11.5, hp: 30, maxHp: 100, civ: -1 }),  // u2：岩浆 15/拍 → 2 拍死
      U({ race: 'demon', x: 31.5, y: 10.5, hp: 100, maxHp: 100, civ: -1 }), // u3：lavaImmune → 岩浆/火双免
      U({ race: 'human', x: 41.5, y: 11.5, hp: 20, maxHp: 100, civ: -1 }),  // u4：溺水 4/拍 → 5 拍死
      U({ race: 'kraken', x: 51.5, y: 11.5, hp: 100, maxHp: 100, civ: -1 }),// u5：水生窒息 0.02/拍 hurt2
    ],
    steps: 8,
  },
  // S4 regen-food：再生三源（troll 天生/trait/civ 装备注入）+ 捕食者断粮账本
  {
    name: 'regen-food', terrain: 'plains', seed: 606,
    env: { lawsRise: false, ambience: false, gearRegen: 0.1 },
    units: [
      U({ race: 'troll', x: 70.5, y: 70.5, hp: 40, maxHp: 100, civ: -1 }),              // u0：0.35/拍回满
      U({ race: 'human', x: 80.5, y: 70.5, hp: 30, maxHp: 100, trait: 'regeneration', civ: -1 }), // u1：0.3+0.1 双源
      U({ race: 'wolf', x: 90.5, y: 70.5, hp: 100, maxHp: 100, food: 75, civ: -1 }),    // u2：75 拍耗尽 → 1.4/拍断粮
      U({ race: 'sheep', x: 100.5, y: 70.5, hp: 99.4, maxHp: 100, civ: -1 }),           // u3：非 civ 非 troll 无再生（gearBonus 不调）
    ],
    steps: 90,
  },
  // S5 whitewalker：寒霜灵气多分支（0.08 门 + 坐标 2 抽 + FOREST 0.4/水面 0.5/踏冰 0.6 条件抽）
  //    种子寻优（上方 findWwSeed）：FOREST 0.4 门 + 踏冰 0.6 门 + 火格灭火三命中
  {
    name: 'whitewalker', terrain: 'wwfield', seed: WW_SEED,
    env: { lawsRise: false, ambience: false, gearRegen: 0, fireSet: [58 * W + 63], terrainTrack: true,
           fireInit: { '63,58': 200 } },
    units: [
      U({ race: 'ww', x: 62.5, y: 58.5, hp: 200, maxHp: 200, civ: -1 }),
    ],
    steps: WW_STEPS,
    stepsArr: (() => {
      const a = Array.from({ length: WW_STEPS }, () => null);
      a[30] = { slot: 0, mut: { y: 57.3 } };               // 踏水（(62,57) WATER）→ 踏冰 0.6 门
      a[45] = { slot: 0, mut: { x: 61.5, y: 57.5 } };      // 入森林脚下（(61,57) FOREST）→ 0.4 门激活域
      return a;
    })(),
  },
  // S6 infection：感染掉血 + spreadPlague 0.02 门（种子寻优 ≥2 次命中——感染门每拍必 1 抽）
  {
    name: 'infection', terrain: 'plains', seed: findSeed((s) => {
      const r = mulberry32(s); let hits = 0;
      for (let i = 0; i < 100; i++) if (r() < 0.02) hits++;
      return hits >= 3;
    }, 1, 5000),
    env: { lawsRise: false, ambience: false, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 140.5, y: 90.5, hp: 80, maxHp: 100, infected: true, civ: -1 }),
    ],
    steps: 100,
  },
  // S7 panic-grudge：恐慌衰减至 undefined + 血仇 splice 中段移除 + 空表全清
  {
    name: 'panic-grudge', terrain: 'plains', seed: 777,
    env: { lawsRise: false, ambience: false, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 150.5, y: 100.5, tx: 180.5, ty: 110.5, panic: 0.5, gids: [7, 8, 9], gval: [0.25, 0.3, 0.35], civ: -1 }),
      U({ race: 'human', x: 160.5, y: 100.5, gids: [], gval: [], civ: -1 }),  // u1：空表首拍全清 undefined
    ],
    steps: 30,
  },
  // S8 grab-boat：神之手指分流（hurt-- 先行 / age 冻结） + 殖民船分流（age 冻结）
  {
    name: 'grab-boat', terrain: 'plains', seed: 88,
    env: { lawsRise: false, ambience: false, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 170.5, y: 110.5, age: 21, hp: 90, hurt: 2, grab: 3, civ: -1 }),
      U({ race: 'human', x: 180.5, y: 110.5, age: 22, boat: 1, civ: -1 }),
    ],
    steps: 3,
  },
];

// ---- mut 处理（数值字段 null → undefined，与 mkTsUnit 语义一致） ----
const applyMut = (u, m) => {
  for (const [k, v] of Object.entries(m)) {
    if (k === 'slot') continue;
    if (k === 'panic' || k === 'sxk' || k === 'syk' || k === 'food' || k === 'chill' || k === 'stk') {
      u[k] = v === null ? undefined : v;
    } else if (k === 'gids') {
      if (v === null) { u.gIds = undefined; u.gVal = undefined; }
      else { u.gIds = [...v]; if (u.gVal === undefined) u.gVal = v.map(() => 1); }
    } else if (k === 'gval') {
      if (v === null) { u.gVal = undefined; u.gIds = undefined; }
      else { u.gVal = [...v]; if (u.gIds === undefined) u.gIds = v.map((_, i) => 1000 + i); }
    } else if (k === 'infected') u.infected = !!v;
    else if (k === 'dead') u.dead = !!v;
    else if (k === 'flip') u.flip = !!v;
    else u[k] = v;
  }
};

// ---- 主循环：逐 case 驱动真 updateUnit ----
const out = { w: W, h: H, ep: EP, raceIds, races: raceTable, terrainSpecs: Object.values(TERRAIN_SPECS), cases: [] };
const sanity = [];
for (const c of CASES) {
  const env = { ...c.env };
  const cap = { fx: [], evt: [], terr: [] };
  const eng = makeStubEng(env, cap);
  eng.terrain.set(buildGrid(TERRAIN_SPECS[c.terrain]));
  for (const [k, v] of Object.entries(env.fireInit ?? {})) {
    const [x, y] = k.split(',').map(Number); eng.fire[y * W + x] = v; eng.fireSet.add(y * W + x);
  }
  for (const [k, v] of Object.entries(env.radiateInit ?? {})) {
    const [x, y] = k.split(',').map(Number); eng.radiate[y * W + x] = v;
  }
  const specs = c.units;
  const units = specs.map((s) => mkTsUnit({ ...s, race: raceIds[s.race] ?? s.race }));
  eng.units = units;
  let draws = 0;
  const raw = mulberry32(c.seed);
  eng.rng = () => { draws++; return raw(); };

  const track = !!env.terrainTrack;
  const outSteps = [];
  const snapFire = () => Array.from(eng.fire);
  const snapTerr = () => Array.from(eng.terrain);
  for (let sn = 0; sn < c.steps; sn++) {
    const stp = c.stepsArr ? c.stepsArr[sn] : null;
    const muts = [];
    if (stp?.mut) { applyMut(units[stp.slot], stp.mut); muts.push({ slot: stp.slot, ...stp.mut }); }
    if (stp?.mutAll) for (const m of stp.mutAll) { applyMut(units[m.slot], m); muts.push(m); }
    const fireBefore = track ? snapFire() : null;
    const terrBefore = track ? snapTerr() : null;
    const draw0 = draws;
    const perU = [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.dead) { perU.push({ dead: true }); continue; }
      const e0 = cap.evt.length, f0 = cap.fx.length, t0 = cap.terr.length;
      eng.updateUnit(u);
      perU.push({
        ...snapU(u),
        evt: cap.evt.slice(e0).map((e) => e.map((v) => v)),
        fx: cap.fx.slice(f0).map((f) => [f.k, f.x, f.y, f.ttl]),
        terr: cap.terr.slice(t0).map((p) => [p[0], p[1], p[2]]),
        draws: draws - draw0 - perU.reduce((a, p) => a + (p.draws ?? 0), 0),
      });
    }
    const stepFireDiff = [];
    const stepTerrDiff = [];
    if (track) {
      const fa = snapFire(), ta = snapTerr();
      for (let i = 0; i < fa.length; i++) {
        if (fa[i] !== fireBefore[i]) stepFireDiff.push([i, fireBefore[i], fa[i]]);
        if (ta[i] !== terrBefore[i]) stepTerrDiff.push([i, terrBefore[i], ta[i]]);
      }
    }
    outSteps.push({
      muts,
      draws: draws - draw0,
      fireDiff: stepFireDiff, terrDiff: stepTerrDiff,
      units: perU,
      fireSet: [...eng.fireSet].sort((a, b) => a - b),
    });
  }
  const rngTail = [raw(), raw(), raw(), raw()].map(bitHex);
  out.cases.push({
    name: c.name, terrain: c.terrain, seed: c.seed,
    env: c.env, units: specs.map((s) => ({ ...s, race: raceIds[s.race] ?? s.race })), steps: c.steps, out: outSteps,
    final: units.map(snapU),
    rngTail,
  });
  const evtN = cap.evt.length; const fxN = cap.fx.length;
  const riseN = cap.evt.filter((e) => e[0] === 'rise').length;
  const plagueN = cap.evt.filter((e) => e[0] === 'plague').length;
  const tailN = cap.evt.filter((e) => e[0] === 'tail').length;
  const grabN = cap.evt.filter((e) => e[0] === 'grab').length;
  const boatN = cap.evt.filter((e) => e[0] === 'boat').length;
  const fleeEndN = cap.evt.filter((e) => e[0] === 'fleeEnd').length;
  const drawSteps = outSteps.filter((o) => o.draws > 0).length;
  const terrN = cap.terr.length;
  const deadN = units.filter((u) => u.dead).length;
  sanity.push(`${c.name}: steps=${outSteps.length} rngSteps=${drawSteps} draws=${draws} evt=${evtN}(rise=${riseN},plague=${plagueN},tail=${tailN},grab=${grabN},boat=${boatN},fleeEnd=${fleeEndN}) fx=${fxN} terr=${terrN} dead=${deadN}/${units.length}`);
}

const json = JSON.stringify(out);
const GOLDEN1 = new URL('./golden/units_update.json', import.meta.url);
const GOLDEN2 = new URL('../../unity/pixel-world-box/Assets/StreamingAssets/WbGolden/units_update.json', import.meta.url);
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('units_update.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
console.log('=== gen-units-update 完成 ===');
for (const s of sanity) console.log('  ' + s);
