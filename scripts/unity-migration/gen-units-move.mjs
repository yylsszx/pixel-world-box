#!/usr/bin/env node
// ============================================================
// M-U2a 单位移动黄金向量生成器（Job 2902286）
// 真实现 = public/wasm/wbcore.wasm（rust-core 编译产物，位精确权威蓝本）
// 蓝本段：rust-core/src/units.rs move_unit L1675-1765 + update_unit 移动路径
//         src/lib/game/engine.ts moveUnit L5813-5889（迭代序协议）
// 用法: node scripts/unity-migration/gen-units-move.mjs
// 输出: scripts/unity-migration/golden/units_move.json（f64 全 bits 双保险）
// 纪律②：本文件零算法复制——一切行为取自 wasm 真实现，生成器只做内存布置与采样。
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { T } from '../../src/lib/game/types.ts';
import { walkable, isWater } from '../../src/lib/game/constants.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WASM = path.join(ROOT, 'public/wasm/wbcore.wasm');
const OUT = path.join(ROOT, 'scripts/unity-migration/golden/units_move.json');

// —— 常量（rust-core lib.rs）——
const W = 256, H = 160, TILES = 40960, MAX_RACES = 512, MAX_UNITS = 4096;
// region id（lib.rs L99-259 place! 序——WbConstants.cs 机械翻译源；此处仅列生成器所用）
const ID = {
  UX: 0, UY: 1, UPANIC: 2, UCIV: 4, URACE: 5, UID: 6, UCELL: 7,
  UDEAD: 14, UHASPANIC: 15,
  UTX: 18, UTY: 19, UHP: 20, UMAXHP: 21, UDMG: 22, USPEED: 23, UAGE: 24, UMAXAGE: 25,
  UCD: 27, UFD: 28, UBREATH: 29, USTK: 34, UATK: 35, UCHILL: 36, UFLEET: 37,
  UBLESS: 38, UCURSE: 39, UFERT: 40, UDETOUR: 41, UHURT: 42, UJOB: 43, UINF: 45,
  UFLIP: 46, UPAR: 47, UBOAT: 48, UCVN: 50, UARMY: 51, UGENE: 53, UFAM: 54, UFGN: 55,
  UGLN: 57,
  TERR: 60, FIREG: 61, RAD: 62, ROAD: 63, BLDK: 64,
  ITMN: 90, NCTL: 94,
  RNGS: 95, TICK: 96, PAR: 98, EPS: 100, LAWS: 101, FXP: 102,
  ACT: 120, ACTN: 121, BAILK: 122, DIRTY: 126, DLIST: 127, DLISTN: 128, BATCHR: 129,
  TBF: 131, TBT: 139, COLEN: 142, MISC: 148,
};
const F_HOSTILE = 1, F_CIV = 2, F_UNDEAD = 4, F_PREDATOR = 8, F_HERBIVORE = 16;
const RF2_LAVAIMM = 1;
const FXP_AMB = 2;

// —— f64 bits 工具 ——
const _buf = new ArrayBuffer(8);
const _f64 = new Float64Array(_buf);
const _u64 = new BigUint64Array(_buf);
function bits(v) { _f64[0] = v; return '0x' + _u64[0].toString(16).padStart(16, '0'); }
const NAN_BITS = '0x7ff8000000000000';
const F_NAN = NaN;

// —— wasm 装载 ——
const wasmBytes = readFileSync(WASM);
const mod = await WebAssembly.instantiate(wasmBytes, {});
const ex = mod.instance.exports;
const mem = ex.memory;

function u8(id, i) { return new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(id), 1)[0]; }
function setU8(id, i, v) { new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(id))[i] = v & 0xff; }
function setU32(id, i, v) { const a = ex.wb_arena_ptr() + ex.wb_off(id); new DataView(mem.buffer).setUint32(a + i * 4, v >>> 0, true); }
function setI32(id, i, v) { const a = ex.wb_arena_ptr() + ex.wb_off(id); new DataView(mem.buffer).setInt32(a + i * 4, v | 0, true); }
function setF64(id, i, v) { const a = ex.wb_arena_ptr() + ex.wb_off(id); new DataView(mem.buffer).setFloat64(a + i * 8, v, true); }
function getF64(id, i) { const a = ex.wb_arena_ptr() + ex.wb_off(id); return new DataView(mem.buffer).getFloat64(a + i * 8, true); }
function getU32(id, i) { const a = ex.wb_arena_ptr() + ex.wb_off(id); return new DataView(mem.buffer).getUint32(a + i * 4, true); }

// —— 世界布置（每场景独立 init，arena 全零起步）——
function initWorld(seed, fxp) {
  if (ex.wb_init(W, H, MAX_UNITS) !== 1) throw new Error('wb_init failed');
  const offs = {};
  for (const k of Object.keys(ID)) offs[k] = ex.wb_off(ID[k]);
  setU32(ID.RNGS, 0, seed >>> 0);
  setU8(ID.PAR, 0, 0);
  setU8(ID.LAWS, 0, 0);           // REPRO/ZINFECT/UNDEAD_RISE 全关
  setU8(ID.FXP, 0, fxp);
  setU32(ID.ITMN, 0, 0);          // 拾取短路
  setU8(ID.COLEN, 0, 0);          // 采集器关
  setU8(ID.NCTL, 0, 0);           // 神经禁用
  setI32(ID.MISC, 0, MAX_UNITS);  // spawn 预算（M-U2a 不触发，置满保险）
  // TBT 引导表（u8×16）：bit0 walkable bit1 water bit2 flammable bit3 buildable
  // —— 灌入源 = src/lib/game/constants.ts 真实现（walkable/isWater + FLAMMABLE/buildable 语义）
  for (let t = 0; t < 16; t++) {
    let m = 0;
    if (t <= 11 && walkable(t)) m |= 1;
    if (t <= 11 && isWater(t)) m |= 2;
    if (t === T.GRASS || t === T.FOREST) m |= 4;
    if (t === T.GRASS || t === T.SAND || t === T.HILL || t === T.SNOW || t === T.BURNT || t === T.FOREST) m |= 8;
    setU8(ID.TBT, t, m);
  }
  return offs;
}

// 场景地形：uniform 底色 + 矩形覆盖
function fillTerrain(spec) {
  const base = spec.base ?? T.GRASS;
  const terr = new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(ID.TERR), TILES);
  terr.fill(base);
  for (const r of spec.rects ?? []) {
    for (let y = r.y0; y <= r.y1; y++)
      for (let x = r.x0; x <= r.x1; x++)
        terr[y * W + x] = r.t;
  }
  if (spec.fire) {
    const fg = new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(ID.FIREG), TILES);
    for (const [x, y] of spec.fire) fg[y * W + x] = 1;
  }
  if (spec.road) {
    const rd = new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(ID.ROAD), TILES);
    for (const [x, y] of spec.road) rd[y * W + x] = 1;
  }
}

// 种族引导表布置（RACE_FLAGS 512 + TBF 1024）
// flags2 bit0 RF2_LAVAIMM —— 测地形伤害的单位置 0
function setupRaces(races) {
  for (const [race, fl, fl2, tbfFlags] of races) {
    setU8(11 /* RACE_FLAGS */, race, fl);
    setU8(ID.TBF, race * 2, tbfFlags);      // [r*2] bit5 flying bit6 aquatic bit7 sandswim
    setU8(ID.TBF, race * 2 + 1, fl2);       // [r*2+1] bit0 lavaimm
  }
}

// 单位布置（update_unit 移动路径前置全中性：无 boat/panic/grudge/inf/job/fam）
function putUnit(slot, u) {
  setU32(ID.UID, slot, slot);
  setU32(ID.URACE, slot, u.race);
  setU32(ID.UCELL, slot, Math.floor(u.y) * W + Math.floor(u.x)); // wbspatial L305: cy*bw+cx
  setF64(ID.UX, slot, u.x);
  setF64(ID.UY, slot, u.y);
  setF64(ID.UTX, slot, u.tx);
  setF64(ID.UTY, slot, u.ty);
  setF64(ID.USPEED, slot, u.speed ?? 0.08);
  setF64(ID.UHP, slot, u.hp ?? 100);
  setF64(ID.UMAXHP, slot, u.maxhp ?? 100);
  setF64(ID.UMAXAGE, slot, 9999);
  setF64(ID.UAGE, slot, 0);
  setF64(ID.UDMG, slot, 5);
  setF64(ID.UCHILL, slot, u.chill ?? 0);
  setF64(ID.UCURSE, slot, u.curse ?? 0);
  setF64(ID.UFD, slot, u.food === undefined ? F_NAN : u.food);   // NaN=未持有（u_has_food=false）
  setF64(ID.UCVN, slot, 0);       // 非商队
  setF64(ID.UFLEET, slot, 0);
  setF64(ID.UBLESS, slot, 0);
  setF64(ID.UFERT, slot, 0);
  setF64(ID.UDETOUR, slot, 0);
  setF64(ID.UHURT, slot, 0);
  setF64(ID.UATK, slot, 0);
  setF64(ID.UCD, slot, 0);
  setF64(ID.UBREATH, slot, 0);
  setI32(ID.UCIV, slot, -1);
  setI32(ID.UJOB, slot, -1);
  setI32(ID.UARMY, slot, -1);
  setI32(ID.UGLN, slot, -1);      // 无 grudge
  setI32(ID.UFAM, slot, -1);
  setI32(ID.UFGN, slot, -1);
  setI32(ID.USTK, slot, 0);
  setU8(ID.UDEAD, slot, 0);
  setU8(ID.UHASPANIC, slot, 0);
  setU8(ID.UINF, slot, 0);
  setU8(ID.UBOAT, slot, 0);
  setU8(ID.UFLIP, slot, 0);
  for (let g = 0; g < 4; g++) setF64(ID.UGENE, slot * 4 + g, 1);
}

// —— 采样 ——
const SAMPLE_FIELDS = [
  ['x', ID.UX], ['y', ID.UY], ['tx', ID.UTX], ['ty', ID.UTY],
  ['age', ID.UAGE], ['hp', ID.UHP], ['chill', ID.UCHILL], ['curse', ID.UCURSE], ['hurt', ID.UHURT],
];
function sampleTick(nUnits, slots) {
  const dv = new DataView(mem.buffer);
  const units = slots.map((s) => {
    const o = { slot: s, race: getU32(ID.URACE, s), flip: u8(ID.UFLIP, s), dead: u8(ID.UDEAD, s) };
    for (const [k, id] of SAMPLE_FIELDS) o[k] = bits(dv.getFloat64(ex.wb_arena_ptr() + ex.wb_off(id) + s * 8, true));
    return o;
  });
  const actN = getU32(ID.ACTN, 0);
  const actBase = ex.wb_arena_ptr() + ex.wb_off(ID.ACT);
  const actHex = Buffer.from(mem.buffer, actBase, Math.min(actN, 256)).toString('hex');
  return {
    rng: getU32(ID.RNGS, 0), tick: getU32(ID.TICK, 0), actN,
    dlistN: getU32(ID.DLISTN, 0), batchR: getU32(ID.BATCHR, 0), bailK: getU32(ID.BAILK, 0),
    units, actHex,
  };
}

// —— 单场景执行（可重复：独立 init → 布置 → batch×ticks）——
function runScenario(sc) {
  initWorld(sc.seed, sc.fxp ?? 0);
  fillTerrain(sc.terrain);
  setupRaces(sc.races);
  for (const u of sc.units) putUnit(u.slot, u);
  ex.wb_pack_end(sc.units.length);
  const ticks = [];
  const par0 = u8(ID.PAR, 0);
  for (let t = 0; t < sc.ticks; t++) {
    const rc = ex.wb_units_batch(0, 0);
    ticks.push({ rc, ...sampleTick(sc.units.length, sc.units.map((u) => u.slot)) });
    // 宿主协议模拟：翻转 parity + 移动后重排 cell + repack（wbspatial pack 语义）
    setU8(ID.PAR, 0, u8(ID.PAR, 0) ^ 1);
    for (const u of sc.units) {
      if (u8(ID.UDEAD, u.slot)) continue;
      const x = getF64(ID.UX, u.slot), y = getF64(ID.UY, u.slot);
      setU32(ID.UCELL, u.slot, Math.floor(y) * W + Math.floor(x));
      setU8(ID.UPAR, u.slot, u8(ID.PAR, 0));
    }
    ex.wb_pack_end(sc.units.length);
  }
  return { name: sc.name, seed: sc.seed, fxp: sc.fxp ?? 0, input: sc, output: ticks };
}

// —— 自校验：双跑确定性 ——
function determinismCheck(scenarios) {
  for (const sc of scenarios) {
    const a = JSON.stringify(runScenario(sc));
    const b = JSON.stringify(runScenario(sc));
    if (a !== b) throw new Error(`determinism FAIL: ${sc.name}`);
  }
}

// ============ 场景集（M-U2a 移动段全覆盖）============
// 种族：sheep=6 兽群 / bear=8 捕食者 / dragon=9 飞行 / kraken=25 水生 / sandworm=26 沙泳
//       zombie=5 亡灵 / bandit=4 敌意
const RACES_STD = [
  [6, F_HERBIVORE, 0, 0],
  [8, F_PREDATOR, 0, 0],
  [9, F_HOSTILE | F_PREDATOR, 0, 32],   // flying
  [25, F_HOSTILE, 0, 64],               // aquatic
  [26, F_HOSTILE, 0, 128],              // sandswim
  [5, F_HOSTILE | F_UNDEAD, 0, 0],
  [4, F_HOSTILE, 0, 0],
];
const SCENARIOS = [
  { name: 'S01-straight-grass', seed: 0x12345678, ticks: 3, races: RACES_STD, terrain: { base: T.GRASS },
    units: [{ slot: 0, race: 6, x: 10.5, y: 10.5, tx: 20.5, ty: 14.5 }] },
  { name: 'S02-road-boost', seed: 0x12345678, ticks: 3, races: RACES_STD, terrain: { base: T.GRASS, road: [[10, 10], [11, 10]] },
    units: [{ slot: 0, race: 6, x: 10.5, y: 10.5, tx: 20.5, ty: 14.5 }] },
  { name: 'S03-chill-slow', seed: 0x87654321, ticks: 3, races: RACES_STD, terrain: { base: T.GRASS },
    units: [{ slot: 0, race: 6, x: 10.5, y: 10.5, tx: 30.5, ty: 10.5, chill: 5 }] },
  { name: 'S04-curse-slow', seed: 0x22334455, ticks: 3, races: RACES_STD, terrain: { base: T.GRASS },
    units: [{ slot: 0, race: 6, x: 10.5, y: 10.5, tx: 30.5, ty: 10.5, curse: 5 }] },
  { name: 'S05-flying-over-water', seed: 0x33445566, ticks: 3, races: RACES_STD,
    terrain: { base: T.GRASS, rects: [{ t: T.DEEP, x0: 0, y0: 0, x1: 255, y1: 159 }] },
    units: [{ slot: 0, race: 9, x: 10.5, y: 10.5, tx: 40.5, ty: 40.5 }] },
  { name: 'S06-aquatic-swim', seed: 0x44556677, ticks: 3, races: RACES_STD,
    terrain: { base: T.GRASS, rects: [{ t: T.DEEP, x0: 0, y0: 0, x1: 255, y1: 159 }] },
    units: [{ slot: 0, race: 25, x: 10.5, y: 10.5, tx: 40.5, ty: 12.5 }] },
  { name: 'S07-aquatic-redirect', seed: 0x55667788, ticks: 3, races: RACES_STD, terrain: { base: T.GRASS },
    units: [{ slot: 0, race: 25, x: 10.5, y: 10.5, tx: 40.5, ty: 12.5 }] },
  { name: 'S08-sandswim-dust', seed: 0x66778899, fxp: FXP_AMB, ticks: 3, races: RACES_STD, terrain: { base: T.SAND },
    units: [{ slot: 0, race: 26, x: 10.5, y: 10.5, tx: 40.5, ty: 12.5 }] },
  { name: 'S09-sandswim-redirect', seed: 0x778899aa, fxp: FXP_AMB, ticks: 3, races: RACES_STD,
    terrain: { base: T.GRASS, rects: [{ t: T.WATER, x0: 30, y0: 0, x1: 60, y1: 159 }] },
    units: [{ slot: 0, race: 26, x: 10.5, y: 10.5, tx: 40.5, ty: 12.5 }] },
  { name: 'S10-land-blocked-redirect', seed: 0x8899aabb, ticks: 3, races: RACES_STD,
    terrain: { base: T.GRASS, rects: [{ t: T.WATER, x0: 20, y0: 0, x1: 40, y1: 159 }] },
    units: [{ slot: 0, race: 6, x: 10.5, y: 80.5, tx: 60.5, ty: 80.5 }] },
  { name: 'S11-swimming-ashore', seed: 0x99aabbcc, ticks: 3, races: RACES_STD,
    terrain: { base: T.GRASS, rects: [{ t: T.WATER, x0: 0, y0: 0, x1: 20, y1: 159 }] },
    units: [{ slot: 0, race: 6, x: 5.5, y: 80.5, tx: 40.5, ty: 80.5 }] },
  { name: 'S12-mountain-descent', seed: 0xaabbccdd, ticks: 3, races: RACES_STD,
    terrain: { base: T.GRASS, rects: [{ t: T.MOUNTAIN, x0: 0, y0: 70, x1: 255, y1: 90 }] },
    units: [{ slot: 0, race: 8, x: 10.5, y: 80.5, tx: 40.5, ty: 80.5 }] },
  { name: 'S13-mixed-batch-order', seed: 0xbbccddee, ticks: 3, races: RACES_STD,
    terrain: { base: T.GRASS, rects: [{ t: T.WATER, x0: 0, y0: 0, x1: 255, y1: 30 }, { t: T.SAND, x0: 0, y0: 130, x1: 255, y1: 159 }] },
    units: [
      { slot: 0, race: 6, x: 10.5, y: 50.5, tx: 60.5, ty: 55.5 },
      { slot: 1, race: 9, x: 12.5, y: 52.5, tx: 62.5, ty: 57.5 },
      { slot: 2, race: 25, x: 14.5, y: 10.5, tx: 64.5, ty: 15.5 },
      { slot: 3, race: 26, x: 16.5, y: 140.5, tx: 66.5, ty: 145.5 },
      { slot: 4, race: 8, x: 18.5, y: 54.5, tx: 68.5, ty: 59.5 },
      { slot: 5, race: 5, x: 20.5, y: 56.5, tx: 70.5, ty: 61.5 },
      { slot: 6, race: 4, x: 22.5, y: 58.5, tx: 72.5, ty: 63.5 },
      { slot: 7, race: 6, x: 24.5, y: 60.5, tx: 74.5, ty: 65.5, chill: 3 },
      { slot: 8, race: 6, x: 26.5, y: 62.5, tx: 16.5, ty: 62.5 },   // 向左 flip
      { slot: 9, race: 26, x: 28.5, y: 64.5, tx: 8.5, ty: 64.5 },   // 目标在水 → 改向
    ] },
  { name: 'S14-deadzone', seed: 0xccddeeff, ticks: 3, races: RACES_STD, terrain: { base: T.GRASS },
    units: [{ slot: 0, race: 6, x: 10.5, y: 10.5, tx: 10.503, ty: 10.504 }] },
  { name: 'S15-flip-both', seed: 0xddeeff00, ticks: 2, races: RACES_STD, terrain: { base: T.GRASS },
    units: [
      { slot: 0, race: 6, x: 20.5, y: 10.5, tx: 8.5, ty: 10.5 },
      { slot: 1, race: 6, x: 8.5, y: 12.5, tx: 20.5, ty: 12.5 },
    ] },
  { name: 'S16-fire-tile', seed: 0xeeff0011, ticks: 3, races: RACES_STD, terrain: { base: T.GRASS, fire: [[10, 10]] },
    units: [{ slot: 0, race: 6, x: 10.5, y: 10.5, tx: 30.5, ty: 10.5 }] },
  { name: 'S17-water-drown', seed: 0xff001122, ticks: 3, races: RACES_STD,
    terrain: { base: T.GRASS, rects: [{ t: T.WATER, x0: 0, y0: 0, x1: 255, y1: 159 }] },
    units: [{ slot: 0, race: 6, x: 10.5, y: 10.5, tx: 30.5, ty: 10.5 }] },
  { name: 'S18-predator-hunt', seed: 0x00112233, ticks: 3, races: RACES_STD, terrain: { base: T.GRASS, rects: [{ t: T.FOREST, x0: 14, y0: 6, x1: 24, y1: 14 }] },
    units: [{ slot: 0, race: 8, x: 10.5, y: 10.5, tx: 30.5, ty: 10.5, food: 40 }] },
  { name: 'S19-fire-immune', seed: 0x11223344, ticks: 3, races: [
      [6, F_HERBIVORE, RF2_LAVAIMM, 0], ...RACES_STD.filter((r) => r[0] !== 6),
    ], terrain: { base: T.GRASS, fire: [[10, 10]] },
    units: [{ slot: 0, race: 6, x: 10.5, y: 10.5, tx: 30.5, ty: 10.5 }] },
];

// ============ 执行 ============
console.log(`wasm: ${wasmBytes.length} bytes, exports: wb_units_batch=${typeof ex.wb_units_batch}`);
const results = SCENARIOS.map(runScenario);
determinismCheck(SCENARIOS);

// 健全性断言（黄金数据生成质量门）
const S01 = results[0];
if (S01.output[0].units[0].x === bits(10.5)) throw new Error('S01 did not move');
if (S01.output[0].rng === 0x12345678) throw new Error('S01 consumed no RNG');
const S14 = results[13];
// deadzone 语义：原目标 d=0.005<0.05 时 move_unit 早退（不直奔原目标），
// 但漫游分支 L3239 先行重掷目标（ndx²<0.25）→ 断言原目标被重掷 + RNG 流推进
if (S14.output[0].units[0].tx === bits(10.503)) throw new Error('S14 deadzone target not re-rolled');
const S05 = results[4];
if (S05.output[0].batchR !== 1) throw new Error(`batchR=${S05.output[0].batchR} (bail!)`);
for (const r of results) {
  for (const tk of r.output) {
    if (tk.rc !== 1) throw new Error(`${r.name} tick rc=${tk.rc} bail=${tk.bailK}`);
    if (tk.batchR !== 1) throw new Error(`${r.name} batchR=${tk.batchR}`);
  }
}
console.log(`determinism: PASS (${SCENARIOS.length} scenarios × 2 runs)`);
console.log(`sanity: PASS (moved/deadzone/no-bail/rng-consumed)`);

mkdirSync(path.dirname(OUT), { recursive: true });
const out = {
  meta: {
    gen: 'gen-units-move.mjs', job: 2902286, slice: 'M-U2a',
    wasmBytes: wasmBytes.length, W, H, MAX_UNITS, MAX_RACES, TILES,
    regionIds: ID, raceFlags: { F_HOSTILE, F_CIV, F_UNDEAD, F_PREDATOR, F_HERBIVORE },
    tbfBits: { flying: 32, aquatic: 64, sandswim: 128 }, rf2: { lavaimm: RF2_LAVAIMM },
    fxp: { AMB: FXP_AMB }, nanBits: NAN_BITS,
    offs: (() => { const o = []; for (let i = 0; i < 154; i++) o.push(ex.wb_off(i)); return o; })(),
    note: 'f64 字段全部 bits(hex) 位精确；十进制仅供阅读。蓝本 units.rs move_unit L1675/update_unit L2202。offs = wasm 运行时权威布局（wb_off 0..153），C# 布局自算须与此逐位一致。',
  },
  scenarios: results,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`golden: ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(1)} KB)`);
for (const r of results) {
  const u0 = r.output.at(-1).units[0];
  console.log(`  ${r.name}: rng=${r.output.at(-1).rng.toString(16)} actN=${r.output.at(-1).actN} dlistN=${r.output.at(-1).dlistN} x=${u0.x}`);
}
