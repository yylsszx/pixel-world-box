#!/usr/bin/env node
// ============================================================
// M-U2b 网格扫描黄金向量生成器（Job 2902286）
// 真实现 = public/wasm/wbcore.wasm（位精确权威蓝本）
// 蓝本段：rust-core/src/lib.rs wb_scan L968-1106（单单位版，RESULT 写回）
//         + is_enemy_full/is_enemy_slot L354-444 + wb_pack_end L882-941
//         + rust-core/src/units.rs bucket_scan L633-734（批内版，镜像直写）
// 输出: scripts/unity-migration/golden/units_scan.json
// 结构: 单单位层（wb_scan 直调，RESULT 全字段 424B 逐位）+ 批处理层
//      （wb_units_batch 集成：恐慌蔓延/商队逃逸/FLEET 逃逸的 rng 流与镜像写入）
// 纪律②：零算法复制——一切行为取自 wasm 真实现，生成器只做内存布置与采样。
// ============================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { T } from '../../src/lib/game/types.ts';
import { walkable, isWater } from '../../src/lib/game/constants.ts';
import { ep } from '../../src/lib/game/engineParams.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WASM = path.join(ROOT, 'public/wasm/wbcore.wasm');
const OUT = path.join(ROOT, 'scripts/unity-migration/golden/units_scan.json');

// —— 常量（rust-core lib.rs；与 gen-units-move.mjs 同源 place! 序）——
const W = 256, H = 160, TILES = 40960, MAX_RACES = 512, MAX_UNITS = 4096, MAX_CIVS = 64;
const PANIC_CAP = 32, GRUDGE_CAP = 32;
const ID = {
  UX: 0, UY: 1, GVALS: 3, UPANIC: 2, UCIV: 4, URACE: 5, UID: 6, UCELL: 7, GIDS: 8,
  UDEAD: 14, UHASPANIC: 15, RESULT: 16,
  UTX: 18, UTY: 19, UHP: 20, UMAXHP: 21, UDMG: 22, USPEED: 23, UAGE: 24, UMAXAGE: 25,
  UCD: 27, UFD: 28, USTK: 34, UATK: 35, UCHILL: 36, UFLEET: 37, UBLESS: 38,
  UCURSE: 39, UFERT: 40, UDETOUR: 41, UHURT: 42, UJOB: 43, UINF: 45,
  UFLIP: 46, UPAR: 47, UBOAT: 48, UCVN: 50, UARMY: 51, UGENE: 53, UFAM: 54, UFGN: 55,
  UGLN: 57, UGIDS: 58, UGVAL: 59,
  TERR: 60, FIREG: 61, RAD: 62, ROAD: 63,
  ITMN: 90, NCTL: 94,
  RNGS: 95, TICK: 96, PAR: 98, EPS: 100, LAWS: 101, FXP: 102,
  ACT: 120, ACTN: 121, BAILK: 122, DIRTY: 126, DLIST: 127, DLISTN: 128, BATCHR: 129,
  TBF: 131, TBT: 139, COLEN: 142, MISC: 148,
  RACE_FLAGS: 11, DYN_PARENT: 12, ATWAR: 13,
};
const F_HOSTILE = 1, F_CIV = 2, F_UNDEAD = 4, F_PREDATOR = 8, F_HERBIVORE = 16;

// —— f64 bits 工具 ——
const _buf = new ArrayBuffer(8);
const _f64 = new Float64Array(_buf);
const _u64 = new BigUint64Array(_buf);
function bits(v) { _f64[0] = v; return '0x' + _u64[0].toString(16).padStart(16, '0'); }
const F_NAN = NaN;

// —— wasm 装载 ——
const wasmBytes = readFileSync(WASM);
const mod = await WebAssembly.instantiate(wasmBytes, {});
const ex = mod.instance.exports;
const mem = ex.memory;

function u8(id, i) { return new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(id))[i]; }
function setU8(id, i, v) { new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(id))[i] = v & 0xff; }
function setU32(id, i, v) { const a = ex.wb_arena_ptr() + ex.wb_off(id); new DataView(mem.buffer).setUint32(a + i * 4, v >>> 0, true); }
function setI32(id, i, v) { const a = ex.wb_arena_ptr() + ex.wb_off(id); new DataView(mem.buffer).setInt32(a + i * 4, v | 0, true); }
function setF64(id, i, v) { const a = ex.wb_arena_ptr() + ex.wb_off(id); new DataView(mem.buffer).setFloat64(a + i * 8, v, true); }
function getF64(id, i) { const a = ex.wb_arena_ptr() + ex.wb_off(id); return new DataView(mem.buffer).getFloat64(a + i * 8, true); }
function getU32(id, i) { const a = ex.wb_arena_ptr() + ex.wb_off(id); return new DataView(mem.buffer).getUint32(a + i * 4, true); }
function getI32(id, i) { const a = ex.wb_arena_ptr() + ex.wb_off(id); return new DataView(mem.buffer).getInt32(a + i * 4, true); }

// —— ScanResult 读回（lib.rs L83-95 repr(C) 布局，RESULT_BYTES=424）——
// enemy_slot i32@0 / overflow i32@4 / best_d f64@8 / enemy_d f64@16
// allies u32@24 / foes u32@28 / panic_n u32@32 / _pad u32@36
// panic_slots [u32;32]@40 / panic_vals [f64;32]@168
function readResult() {
  const dv = new DataView(mem.buffer);
  const ro = ex.wb_arena_ptr() + ex.wb_off(ID.RESULT); // ⚠ 基址不可省（区域偏移是相对 arena 起点）
  return {
    enemySlot: dv.getInt32(ro, true),
    overflow: dv.getInt32(ro + 4, true),
    bestD: bits(dv.getFloat64(ro + 8, true)),
    enemyD: bits(dv.getFloat64(ro + 16, true)),
    allies: dv.getUint32(ro + 24, true),
    foes: dv.getUint32(ro + 28, true),
    panicN: dv.getUint32(ro + 32, true),
    pad: dv.getUint32(ro + 36, true),
    panicSlots: Array.from({ length: PANIC_CAP }, (_, i) => dv.getUint32(ro + 40 + i * 4, true)),
    panicVals: Array.from({ length: PANIC_CAP }, (_, i) => bits(dv.getFloat64(ro + 168 + i * 8, true))),
  };
}

// —— 世界布置（每场景独立 init，arena 全零起步）——
// EPS 表（wbspatial.ts L505-506 EP_KEYS 序 + engineParams.ep 真值——纪律②直接 import 真实现）
const EP_KEYS = ['pop.reproMul', 'eco.regrowBase', 'eco.grazeRate', 'fire.spreadMul', 'fire.damage', 'war.declareRate', 'war.tensionDecay', 'war.milPressure', 'evo.mutationRate', 'social.panicDecay', 'social.panicRout', 'social.grudgeDecay', 'nature.quakeStress', 'nature.stormRate', 'nature.erosionRate'];
function initWorld(seed, fxp) {
  if (ex.wb_init(W, H, MAX_UNITS) !== 1) throw new Error('wb_init failed');
  setU32(ID.RNGS, 0, seed >>> 0);
  setU8(ID.PAR, 0, 0);
  setU8(ID.LAWS, 0, 0);
  setU8(ID.FXP, 0, fxp ?? 0);
  setU32(ID.ITMN, 0, 0);
  setU8(ID.COLEN, 0, 0);
  setU8(ID.NCTL, 0, 0);
  setI32(ID.MISC, 0, MAX_UNITS);
  EP_KEYS.forEach((k, i) => setF64(100 /* OFF_EPS */, i, ep(k)));
  for (let t = 0; t < 16; t++) {
    let m = 0;
    if (t <= 11 && walkable(t)) m |= 1;
    if (t <= 11 && isWater(t)) m |= 2;
    if (t === T.GRASS || t === T.FOREST) m |= 4;
    setU8(ID.TBT, t, m);
  }
}

function fillTerrain(base) {
  const terr = new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(ID.TERR), TILES);
  terr.fill(base);
}

// 种族引导表（RACE_FLAGS 512 + TBF 1024；scan 不读 TBF 但 batch 移动路径读）
function setupRaces(races) {
  for (const [race, fl] of races) {
    setU8(ID.RACE_FLAGS, race, fl);
    setU8(ID.TBF, race * 2, 0);
    setU8(ID.TBF, race * 2 + 1, 0);
  }
}

// 单位布置（scan 场景最小前置：位置/civ/race/panic/grudge/商队/FLEET 可控）
function putUnit(slot, u) {
  setU32(ID.UID, slot, u.id ?? slot);
  setU32(ID.URACE, slot, u.race);
  setU32(ID.UCELL, slot, Math.floor(u.y / 4) * 256 + Math.floor(u.x / 4)); // wbspatial L298-305：cy*engine.bw+cx（bw=256 tile 宽，坐标除 4）
  setF64(ID.UX, slot, u.x);
  setF64(ID.UY, slot, u.y);
  setF64(ID.UTX, slot, u.tx ?? u.x);
  setF64(ID.UTY, slot, u.ty ?? u.y);
  setF64(ID.USPEED, slot, 0.08);
  setF64(ID.UHP, slot, 100);
  setF64(ID.UMAXHP, slot, 100);
  setF64(ID.UMAXAGE, slot, 9999);
  setF64(ID.UAGE, slot, 0);
  setF64(ID.UDMG, slot, 5);
  setF64(ID.UCHILL, slot, 0);
  setF64(ID.UCURSE, slot, 0);
  setF64(ID.UFD, slot, u.food === undefined ? F_NAN : u.food);
  setF64(ID.UCVN, slot, u.cvn ?? 0);
  setF64(ID.UFLEET, slot, u.fleet ?? 0);
  setF64(ID.UBLESS, slot, 0);
  setF64(ID.UFERT, slot, 0);
  setF64(ID.UDETOUR, slot, 0);
  setF64(ID.UHURT, slot, 0);
  setF64(ID.UATK, slot, 0);
  setF64(ID.UCD, slot, 0);
  setI32(ID.UCIV, slot, u.civ === undefined ? -1 : u.civ);
  setI32(ID.UJOB, slot, -1);
  setI32(ID.UARMY, slot, -1);
  setI32(ID.UGLN, slot, u.glen === undefined ? -1 : u.glen);
  setI32(ID.UFAM, slot, -1);
  setI32(ID.UFGN, slot, -1);
  setI32(ID.USTK, slot, 0);
  setU8(ID.UDEAD, slot, u.dead ? 1 : 0);
  setU8(ID.UHASPANIC, slot, u.panic === undefined ? 0 : 1);
  if (u.panic !== undefined) setF64(ID.UPANIC, slot, u.panic);
  setU8(ID.UINF, slot, 0);
  setU8(ID.UBOAT, slot, 0);
  setU8(ID.UFLIP, slot, 0);
  for (let g = 0; g < 4; g++) setF64(ID.UGENE, slot * 4 + g, 1);
  for (let t = 0; t < 8; t++) { setI32(ID.UGIDS, slot * 8 + t, -1); setF64(ID.UGVAL, slot * 8 + t, 0); }
  // grudge 单位级数据（批内版 bucket_scan 读 UGIDS/UGVAL）
  if (u.grudges) {
    for (let t = 0; t < u.grudges.length && t < 8; t++) {
      setI32(ID.UGIDS, slot * 8 + t, u.grudges[t].oid);
      setF64(ID.UGVAL, slot * 8 + t, u.grudges[t].gv);
    }
  }
}

// 全局 grudge 数组（单单位版 wb_scan 读 GIDS/GVALS；lib.rs L1044/L1050）
function putGlobalGrudges(gids, gvals) {
  for (let t = 0; t < GRUDGE_CAP; t++) {
    setI32(ID.GIDS, t, gids && t < gids.length ? gids[t] : -1);
    setF64(ID.GVALS, t, gvals && t < gvals.length ? gvals[t] : 0);
  }
}

// —— 单单位层采样：rc + RESULT 全字段 + LUT 抽样 ——
function sampleSingle(rc, lutProbe) {
  const out = { rc, result: readResult() };
  if (lutProbe) {
    const lutOff = findLutOff();
    out.lutProbe = lutProbe.map((k) => ({ key: k, v: new Uint8Array(mem.buffer, ex.wb_arena_ptr() + lutOff)[k] }));
  }
  return out;
}

// LUT_OFF 不在 offs 表（lib.rs static mut，wb_init 中 = res_off 之前的对齐点）——
// 实测定位：DYN_PARENT 区域前一字节对齐处；这里用官方 place! 序反推：
// lut_off = align8(offs[RACE_FLAGS] + MAX_RACES)。生成器直接按蓝本公式推导。
function findLutOff() {
  const rfOff = ex.wb_off(ID.RACE_FLAGS);
  return (rfOff + MAX_RACES + 7) & ~7;
}

// —— 批处理层采样（与 gen-units-move.mjs 同构 + panic/haspanic 字段）——
const SAMPLE_FIELDS = [
  ['x', ID.UX], ['y', ID.UY], ['tx', ID.UTX], ['ty', ID.UTY],
  ['panic', ID.UPANIC],
];
function sampleTick(nUnits, slots) {
  const dv = new DataView(mem.buffer);
  const units = slots.map((s) => {
    const o = {
      slot: s, race: getU32(ID.URACE, s), dead: u8(ID.UDEAD, s),
      hasPanic: u8(ID.UHASPANIC, s), flip: u8(ID.UFLIP, s),
    };
    for (const [k, id] of SAMPLE_FIELDS) o[k] = bits(dv.getFloat64(ex.wb_arena_ptr() + ex.wb_off(id) + s * 8, true));
    return o;
  });
  const actN = getU32(ID.ACTN, 0);
  return {
    rng: getU32(ID.RNGS, 0), actN,
    dlistN: getU32(ID.DLISTN, 0), batchR: getU32(ID.BATCHR, 0), bailK: getU32(ID.BAILK, 0),
    units,
  };
}

// —— 单场景执行（单单位层）——
function runSingle(sc) {
  initWorld(sc.seed, sc.fxp);
  fillTerrain(sc.base ?? T.GRASS);
  setupRaces(sc.races);
  for (const u of sc.units) putUnit(u.slot, u);
  if (sc.atwar) for (const [a, b] of sc.atwar) setU8(ID.ATWAR, a * MAX_CIVS + b, 1);
  putGlobalGrudges(sc.gids, sc.gvals);
  ex.wb_pack_end(sc.units.length);
  const scans = [sc.scan, ...(sc.extraScans ?? [])];
  const outputs = [];
  for (const sp of scans) {
    const rc = ex.wb_scan(sp.slot, sp.cx, sp.cy, sp.contagious ? 1 : 0, sp.gLen ?? -1);
    outputs.push(sampleSingle(rc, sp === sc.scan ? sc.lutProbe : sc.lutProbe));
  }
  return { name: sc.name, mode: 'single', input: sc, output: outputs.length === 1 ? outputs[0] : outputs };
}

// —— 单场景执行（批处理层：wb_units_batch × ticks，宿主协议模拟同 gen-units-move）——
function runBatch(sc) {
  initWorld(sc.seed, sc.fxp ?? 0);
  fillTerrain(sc.base ?? T.GRASS);
  setupRaces(sc.races);
  for (const u of sc.units) putUnit(u.slot, u);
  ex.wb_pack_end(sc.units.length);
  const ticks = [];
  for (let t = 0; t < sc.ticks; t++) {
    const rc = ex.wb_units_batch(0, 0);
    ticks.push({ rc, ...sampleTick(sc.units.length, sc.units.map((u) => u.slot)) });
    setU8(ID.PAR, 0, u8(ID.PAR, 0) ^ 1);
    for (const u of sc.units) {
      if (u8(ID.UDEAD, u.slot)) continue;
      const x = getF64(ID.UX, u.slot), y = getF64(ID.UY, u.slot);
      setU32(ID.UCELL, u.slot, Math.floor(y / 4) * 256 + Math.floor(x / 4));
      setU8(ID.UPAR, u.slot, u8(ID.PAR, 0));
    }
    ex.wb_pack_end(sc.units.length);
  }
  return { name: sc.name, mode: 'batch', input: sc, output: ticks };
}

// —— 自校验：双跑确定性 ——
function determinismCheck(scenarios) {
  for (const sc of scenarios) {
    const run = sc.mode === 'single' ? runSingle : runBatch;
    const a = JSON.stringify(run(sc));
    const b = JSON.stringify(run(sc));
    if (a !== b) throw new Error(`determinism FAIL: ${sc.name}`);
  }
}

export { runSingle, runBatch, determinismCheck, bits, F_NAN, W, H, TILES, MAX_RACES, MAX_CIVS, GRUDGE_CAP, ID, ex, mem, putUnit, putGlobalGrudges, setupRaces, fillTerrain, initWorld, setU8, setI32, setF64, setU32, getF64, getI32, getU32, u8 };
export { T, F_HOSTILE, F_CIV, F_UNDEAD, F_PREDATOR, F_HERBIVORE };

// ============ 场景集（M-U2b 网格扫描全覆盖）============
// 单位层：wb_scan 直调（RESULT 424B 逐位 + rc + LUT probe）
// 批处理层：wb_units_batch 集成（rng 流 + 恐慌镜像写入；扫描后逃逸段 M-U2c 范围不覆盖）
// 种族布置：6 羊 HERBIVORE / 8 熊 PREDATOR / 5 僵尸 HOSTILE|UNDEAD / 100/101 测试 CIV 种族
const R_SCAN = [
  [6, F_HERBIVORE], [8, F_PREDATOR], [5, F_HOSTILE | F_UNDEAD], [4, F_HOSTILE], [100, F_CIV], [101, F_CIV],
];
const LUT_PROBE_KEYS = [3078, 3080, 3077, 4101, 4102]; // key(6,6) key(6,8) key(6,5) key(8,5) key(8,6) = ra*512+rb

const SCENARIOS = [
  // —— 单位层：敌我判定矩阵 ——
  { name: 'SC01-ally-same-race', mode: 'single', seed: 0x11100001, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5 },
      { slot: 1, race: 6, x: 43.5, y: 40.5 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  { name: 'SC02-predator-herbivore', mode: 'single', seed: 0x11100002, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 8, x: 40.5, y: 40.5 },
      { slot: 1, race: 6, x: 43.5, y: 41.5 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  { name: 'SC03-undead-mutual', mode: 'single', seed: 0x11100003, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 5, x: 40.5, y: 40.5 },
      { slot: 1, race: 5, x: 43.5, y: 40.5 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  { name: 'SC04-zombie-sheep', mode: 'single', seed: 0x11100004, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 5, x: 40.5, y: 40.5 },
      { slot: 1, race: 6, x: 43.5, y: 40.5 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  // —— 恐慌蔓延数学（contagious=1 直传）——
  { name: 'SC05-panic-contagion', mode: 'single', seed: 0x11100005, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5, panic: 0.9 },
      { slot: 1, race: 6, x: 43.5, y: 40.5, panic: 0.3 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 1 } },
  { name: 'SC06-panic-boundary-d2', mode: 'single', seed: 0x11100006, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5, panic: 0.9 },
      { slot: 1, race: 6, x: 44.5, y: 40.5, panic: 0.3 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 1 } },
  { name: 'SC07-panic-gap-small', mode: 'single', seed: 0x11100007, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5, panic: 0.9 },
      { slot: 1, race: 6, x: 41.5, y: 40.5, panic: 0.8 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 1 } },
  { name: 'SC08-panic-cap-overflow', mode: 'single', seed: 0x11100008, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5, panic: 1.0 },
      ...Array.from({ length: 33 }, (_, t) => ({ slot: t + 1, race: 6, x: 40.0 + (t + 1) * 0.1, y: 40.0, panic: 0 })),
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 1 } },
  // —— best_d 剪枝与 gear/grudge 加权 ——
  { name: 'SC09-best-d-prune', mode: 'single', seed: 0x11100009, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 8, x: 40.5, y: 40.5 },
      { slot: 1, race: 6, x: 43.5, y: 40.5 },   // d=3.0 先访问
      { slot: 2, race: 6, x: 44.5, y: 40.5 },   // d=4.0 剪枝
      { slot: 3, race: 6, x: 45.5, y: 40.5 },   // d=5.0 剪枝
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  { name: 'SC10-corner-clamp', mode: 'single', seed: 0x1110000a, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 1.5, y: 1.5 },
      { slot: 1, race: 6, x: 0.5, y: 0.5 },
      { slot: 2, race: 6, x: 6.5, y: 1.5 },
    ], scan: { slot: 0, cx: 0, cy: 0, contagious: 0 } },
  { name: 'SC11-dead-invisible', mode: 'single', seed: 0x1110000b, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5 },
      { slot: 1, race: 6, x: 41.5, y: 40.5, dead: 1 },
      { slot: 2, race: 6, x: 42.5, y: 40.5 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  // —— civ 分组与 ATWAR ——
  { name: 'SC12-civ-grouping', mode: 'single', seed: 0x1110000c, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 100, x: 40.5, y: 40.5, civ: 1 },
      { slot: 1, race: 101, x: 41.5, y: 40.5, civ: 1 },
      { slot: 2, race: 100, x: 42.5, y: 40.5, civ: 2 },
      { slot: 3, race: 100, x: 43.5, y: 40.5 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  { name: 'SC13-atwar-civs', mode: 'single', seed: 0x1110000d, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 100, x: 40.5, y: 40.5, civ: 1 },
      { slot: 1, race: 101, x: 41.5, y: 40.5, civ: 1 },
      { slot: 2, race: 100, x: 42.5, y: 40.5, civ: 2 },
    ], atwar: [[1, 2]], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  // —— grudge 加权（单单位版读全局 GIDS/GVALS；批内版读 UGIDS/UGVAL）——
  { name: 'SC14-grudge-weighted', mode: 'single', seed: 0x1110000e, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 8, x: 40.5, y: 40.5 },
      { slot: 1, race: 6, x: 45.5, y: 40.5 },   // d=5.0 无 grudge（先访问）
      { slot: 2, race: 6, x: 46.5, y: 40.5, id: 99 }, // d=6.0 grudge gv=2.0 → wd=3.48 胜出
    ], gids: [99], gvals: [2.0], scan: { slot: 0, cx: 10, cy: 10, contagious: 0, gLen: 1 } },
  { name: 'SC15-grudge-noprune', mode: 'single', seed: 0x1110000f, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 8, x: 40.5, y: 40.5 },
      { slot: 1, race: 6, x: 43.5, y: 40.5 },   // d=3.0（先访问，best=3.0）
      { slot: 2, race: 6, x: 44.5, y: 40.5, id: 77 }, // d=4.0 d2=16>=9 本应剪枝，has_g 不剪 → wd=4*0.71=2.84 胜出
    ], gids: [77], gvals: [1.4], scan: { slot: 0, cx: 10, cy: 10, contagious: 0, gLen: 1 } },
  // —— LUT 缓存命中（三次 scan + probe 快照）——
  { name: 'SC16-lut-cache', mode: 'single', seed: 0x11100010, races: R_SCAN, base: T.GRASS, lutProbe: LUT_PROBE_KEYS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5 },
      { slot: 1, race: 6, x: 41.5, y: 40.5 },
      { slot: 2, race: 8, x: 42.5, y: 40.5 },
      { slot: 3, race: 5, x: 43.5, y: 40.5 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 },
    extraScans: [{ slot: 1, cx: 10, cy: 10, contagious: 0 }, { slot: 2, cx: 10, cy: 10, contagious: 0 }] },
  { name: 'SC17-empty-bucket', mode: 'single', seed: 0x11100011, races: R_SCAN, base: T.GRASS,
    units: [{ slot: 0, race: 6, x: 40.5, y: 40.5 }], scan: { slot: 0, cx: 10, cy: 10, contagious: 0 } },
  { name: 'SC18-visit-order-panic', mode: 'single', seed: 0x11100012, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5, panic: 1.0 },
      { slot: 1, race: 6, x: 41.5, y: 40.5, panic: 0 },
      { slot: 2, race: 6, x: 42.5, y: 40.5, panic: 0 },
      { slot: 3, race: 6, x: 43.5, y: 40.5, panic: 0 },
    ], scan: { slot: 0, cx: 10, cy: 10, contagious: 1 } },
  // —— 批处理层（wb_units_batch 集成；enemy=-1 保路径全在已翻译段）——
  { name: 'SC19-friends-only-rng', mode: 'batch', seed: 0x11100013, ticks: 2, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5, tx: 60.5, ty: 42.5 },
      { slot: 1, race: 6, x: 41.5, y: 41.5, tx: 61.5, ty: 43.5 },
    ] },
  { name: 'SC20-panic-spread-batch', mode: 'batch', seed: 0x11100016, ticks: 2, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 6, x: 40.5, y: 40.5, tx: 60.5, ty: 42.5, panic: 0.58 },
      { slot: 1, race: 6, x: 41.5, y: 40.5, tx: 61.5, ty: 43.5, panic: 0.1 },
      { slot: 2, race: 6, x: 62.5, y: 62.5, tx: 80.5, ty: 64.5 },   // 远离：不受蔓延
    ] },
  { name: 'SC21-predator-hungry-scan', mode: 'batch', seed: 0x11100015, ticks: 2, races: R_SCAN, base: T.GRASS,
    units: [
      { slot: 0, race: 8, x: 40.5, y: 40.5, tx: 60.5, ty: 42.5, food: 60 },
      { slot: 1, race: 6, x: 41.5, y: 41.5, tx: 61.5, ty: 43.5 },
    ] },
];

// —— 健全性断言（语义黄金，防"对账了错误蓝本"）——
function sanityCheck(runs) {
  const byName = Object.fromEntries(runs.map((r) => [r.name, r]));
  const eq = (a, b, msg) => { if (a !== b) throw new Error(`sanity FAIL: ${msg} (${a} vs ${b})`); };
  const r1 = byName['SC01-ally-same-race'].output.result;
  eq(r1.allies, 1, 'SC01 allies'); eq(r1.enemySlot, -1, 'SC01 enemy'); eq(r1.foes, 0, 'SC01 foes');
  const r2 = byName['SC02-predator-herbivore'].output.result;
  eq(r2.foes, 1, 'SC02 foes'); eq(r2.enemySlot, 1, 'SC02 enemy');
  eq(byName['SC03-undead-mutual'].output.result.enemySlot, -1, 'SC03 undead-mutual 非敌');
  eq(byName['SC03-undead-mutual'].output.result.allies, 1, 'SC03 allies');
  eq(byName['SC04-zombie-sheep'].output.result.enemySlot, 1, 'SC04 zombie 敌意');
  const r5 = byName['SC05-panic-contagion'].output.result;
  eq(r5.panicN, 1, 'SC05 panicN');
  if (r5.panicVals[0] !== bits(0.66)) throw new Error(`sanity FAIL: SC05 panic val ${r5.panicVals[0]} != bits(0.66)`);
  eq(byName['SC06-panic-boundary-d2'].output.result.panicN, 0, 'SC06 d2=16 不蔓延');
  eq(byName['SC07-panic-gap-small'].output.result.panicN, 0, 'SC07 差<0.15 不蔓延');
  const r8 = byName['SC08-panic-cap-overflow'].output;
  eq(r8.rc, 2, 'SC08 rc=2 overflow'); eq(r8.result.panicN, 32, 'SC08 panicN=32');
  eq(r8.result.overflow, 1, 'SC08 overflow=1'); eq(r8.result.allies, 33, 'SC08 allies=33');
  const r9 = byName['SC09-best-d-prune'].output.result;
  eq(r9.enemySlot, 1, 'SC09 最近敌');
  const r15 = byName['SC15-grudge-noprune'].output.result;
  eq(r15.enemySlot, 2, 'SC15 grudge 胜出（has_g 不剪枝）');
  if (r15.enemyD !== bits(4.0)) throw new Error(`sanity FAIL: SC15 enemyD=${r15.enemyD} != bits(4.0)`);
  const r16 = byName['SC16-lut-cache'].output;
  const lut = Object.fromEntries(r16[2].lutProbe.map((p) => [p.key, p.v]));  // 第三次 scan 后的 LUT 终态
  // 方向性语义：fa&PREDATOR 方向才敌羊（bear 作 a）；R_ZOMBIE 特判先于 predator 链
  if (lut[3080] !== 1 || lut[3078] !== 1 || lut[3077] !== 2 || lut[4101] !== 2 || lut[4102] !== 2)
    throw new Error(`sanity FAIL: SC16 LUT ${JSON.stringify(lut)}`);
  const r18 = byName['SC18-visit-order-panic'].output.result;
  eq(r18.panicN, 3, 'SC18 panicN=3');
  for (let i = 0; i < 3; i++) { eq(r18.panicSlots[i], i + 1, `SC18 slot${i} 升序`); if (r18.panicVals[i] !== bits(0.4)) throw new Error(`sanity FAIL: SC18 val${i}`); }
  if (r18.panicSlots[3] !== 0 || r18.panicVals[3] !== bits(0)) throw new Error('sanity FAIL: SC18 未写区域不干净');
  // SC20（seed 0x11100016）：tick0 即蔓延——A(slot0) 衰减 0.58-0.008=0.572>0.55 门过 →
  // contagious rng1=0.0399<0.2 → 蔓延 B=np=min(1, 0.1+0.572*0.4) → B 自身 update 衰减 np-0.008。
  // C 远离不受蔓延。（链式 f64 与 wasm 同序；实验证实 tick0 后 B=bits(0.3208)）
  const t20 = byName['SC20-panic-spread-batch'].output[0];
  if (t20.units[1].hasPanic !== 1) throw new Error('sanity FAIL: SC20 邻居未被蔓延（contagious 门未触发）');
  const a20 = 0.58 - 0.008;
  const want20 = Math.min(1.0, 0.1 + a20 * 0.4) - 0.008;
  if (t20.units[1].panic !== bits(want20)) throw new Error(`sanity FAIL: SC20 蔓延值 ${t20.units[1].panic} != bits(${want20})`);
  if (t20.units[0].panic !== bits(a20)) throw new Error(`sanity FAIL: SC20 A 衰减值 ${t20.units[0].panic} != bits(${a20})`);
  if (t20.units[2].hasPanic !== 0) throw new Error('sanity FAIL: SC20 远离单位不应被蔓延');
  console.log('sanity: 全部断言 PASS');
}

// —— 主流程（仅直接执行时运行；export 供调试脚本 import）——
if (import.meta.main) {
  const runs = SCENARIOS.map((sc) => (sc.mode === 'single' ? runSingle : runBatch)(sc));
  console.log(`执行 ${runs.length} 场景（单层 ${SCENARIOS.filter((s) => s.mode === 'single').length} + 批层 ${SCENARIOS.filter((s) => s.mode === 'batch').length}）`);
  sanityCheck(runs);
  determinismCheck(SCENARIOS);
  console.log('determinism: 双跑 PASS');
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ name: 'units_scan', blueprint: 'lib.rs wb_scan L968-1106 + units.rs bucket_scan L633-734 + is_enemy_full/slot L354-444', scenarios: runs }, null, 1));
  console.log(`写出 ${OUT}`);
}
