#!/usr/bin/env node
// ============================================================
// M-U2c 战斗树黄金向量生成器（Job 2902286）
// 真实现 = public/wasm/wbcore.wasm（位精确权威蓝本，纪律②零同源复制）
// 蓝本段：rust-core/src/units.rs L2458-2954（接敌逃逸链+接敌战斗树）
//         L2288-2315 血仇衰减 / L986-1015 spread_plague / L2379-2397 gear regen
//         L2407-2438 白行者寒霜 / L499-586 神经三头+gear_bonus / L1768-1792 zombify
//         L1017-1157 add_grudge+witness_death
// 引导表灌入 = src/lib/wasm/wbspatial.ts packTables L703-791 宿主协议复刻
// （TBR/RACE_FLAGS/TBF ← types.ts RACES 真表；TBJ ← JOBS 真表；
//   TBI/GUNBM/BEAMBM ← items.ts ITEM_DEFS 真表）——零手抄数值。
// 用法: node scripts/unity-migration/gen-units-combat.mjs
// 输出: scripts/unity-migration/golden/units_combat.json（f64 全 bits）
// 场景边界：全部经 wb_units_batch（战斗树仅可达路径）；接敌场景 skip_tail=true
// 不触和平尾 civ 段（M-U3），无接敌场景仅野怪/龙/白行者（civ 尾不触发）。
// ============================================================
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { T } from '../../src/lib/game/types.ts';
import { R, RACES, JOBS } from '../../src/lib/game/types.ts';
import { ITEM_DEFS, SLOT_ORDER } from '../../src/lib/game/items.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import {
  W, H, TILES, MAX_RACES, MAX_CIVS, ID, ex, mem,
  bits, F_NAN, initWorld, setU8, setI32, setF64, setU32, getF64, getU32, u8,
} from './gen-units-scan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'scripts/unity-migration/golden/units_combat.json');
const GRUDGE_CAP = 8; // UGIDS/UGVAL 单位槽宽（WbConstants.UG_CAP）

// ep 键序（wbspatial.ts L505-506；与 units.rs EP_* 一致）
const EP_KEYS = ['pop.reproMul', 'eco.regrowBase', 'eco.grazeRate', 'fire.spreadMul', 'fire.damage', 'war.declareRate', 'war.tensionDecay', 'war.milPressure', 'evo.mutationRate', 'social.panicDecay', 'social.panicRout', 'social.grudgeDecay', 'nature.quakeStress', 'nature.stormRate', 'nature.erosionRate'];

// TC_ 索引（units.rs L123-131）
const TC_REPAIR = 9, TC_ARCHER = 13, TC_PLAGUE = 14, TC_RANGE = 15;
// RB_/JB_/IT_ 索引（units.rs L134-167）
const RB_REACH = 5, RB_RNG_RANGE = 7;
const JB_RNG = 4;
const IT_ARMOR = 0, IT_CRIT = 1, IT_LIFE = 2, IT_THORNS = 3, IT_REGEN = 4, IT_RNG = 5, IT_SPDMUL = 6;
// 神经（units.rs L451-454）
const NW_FRL = 768;
// TL/SND/TOAST（units.rs L83-93）
const TL_DECISION = 2, TL_KILL = 4;
const SND_PLACE = 1, TOAST_KILLS10 = 1;
// 动作/特效/事件（units.rs L12-93）
const ACT_FX = 1, ACT_SND = 3, ACT_EVT = 4, ACT_TOAST = 5, ACT_CIV = 12, ACT_BATTLE = 17, ACT_WARKILL = 18, ACT_CORPSE = 22, ACT_BLOOD = 23;
const FX_FIREBALL = 15, FX_ARROW = 16, FX_BULLET = 17, FX_EXPLOSION = 8;
const TXT_MISS = 4, TXT_DEVOUR = 1, TXT_PETRIFY = 2, TXT_POISON = 3;
const EVT_SHIPWRECK = 1, EVT_PETRIFY = 2, EVT_REVENGE = 3, EVT_LEGEND = 4;
const LAW_ZINFECT = 2;
const FXP_DMGNUM = 1, FXP_BLOOD = 4, FXP_CORPSES = 8;

// —— 区域 id（gen-units-scan ID 表缺键的补集——全部数字字面量，防 wb_off(undefined)→0 隐形炸弹）——
const R_UKILLS = 26, R_UBREATH = 29, R_ULX = 30, R_ULY = 31, R_UTRAIT = 44, R_UGEAR = 52;
const R_CVPOP = 68, R_CVTECH = 74, R_CVMKT = 77, R_CVAL = 72;
const R_TBR = 130, R_TBJ = 132, R_TBI = 133, R_TBIN = 134, R_GUNBM = 150, R_BEAMBM = 151;
const R_CNT = 119, R_WILD = 106, R_FIREN = 145, R_NEUCALL = 141, R_NEUW = 93, R_DAYPH = 108, R_ATWAR = 13, R_UPAR = 47;

function f64at2(rid, i) { return new DataView(mem.buffer).getFloat64(ex.wb_arena_ptr() + ex.wb_off(rid) + i * 8, true); }
function getTbj(c) { return f64at2(R_TBJ, c); }

// —— 物品表索引（宿主 pack 语义：ITEM_DEFS 键序 = 物品 id）——
const ITEM_KEYS = Object.keys(ITEM_DEFS);
function itemIdx(key) { const i = ITEM_KEYS.indexOf(key); if (i < 0) throw new Error(`item ${key} missing`); return i; }
function firstItem(pred) { const k = ITEM_KEYS.find((k2) => pred(ITEM_DEFS[k2])); if (!k) throw new Error('item not found'); return itemIdx(k); }
const GUN_ID = itemIdx('musket');
const CRIT_ID = firstItem((d) => (d.crit ?? 0) > 0);
const ARMOR_ID = firstItem((d) => (d.armor ?? 0) > 0);
const THORNS_ID = firstItem((d) => (d.thorns ?? 0) > 0);
const REGEN_ID = firstItem((d) => (d.regen ?? 0) > 0);

// —— 引导表（wbspatial.ts packTables L703-791 宿主协议复刻，每场景 wb_init 后重灌）——
// BOOT_DUMP：最近一次 bootTables 的全部写入（meta 转储用——NUnit C# 侧无法 import TS 真表，
// 以此为位精确引导源；f64 以 JSON number 转储（JS shortest-roundtrip 语义保证 bits 精确））
let BOOT_DUMP = null;
function bootTables() {
  const dump = { tbr: {}, raceFlags: {}, tbf0: {}, tbf1: {}, tbj: [], tbi: {}, tbin: 0, gunbm: [0, 0, 0, 0], beambm: [0, 0, 0, 0] };
  BOOT_DUMP = dump;
  // TBI + GUNBM/BEAMBM + TBIN（L703-731）
  const A = (id) => ex.wb_arena_ptr() + ex.wb_off(id);
  const dv = new DataView(mem.buffer);
  dump.tbin = ITEM_KEYS.length;
  for (let i = 0; i < ITEM_KEYS.length && i < 128; i++) {
    const d = ITEM_DEFS[ITEM_KEYS[i]];
    const base = A(R_TBI) + i * 12 * 8;
    dump.tbi[i] = [d.armor ?? 0, d.crit ?? 0, d.lifesteal ?? 0, d.thorns ?? 0, d.regen ?? 0, d.ranged ?? 0, d.speedMul ?? 1, d.dmg ?? 0, d.hp ?? 0, d.rank ?? 0, d.rarity ?? 0, SLOT_ORDER.indexOf((d.slot ?? 'wep'))];
    dv.setFloat64(base + IT_ARMOR * 8, d.armor ?? 0, true);
    dv.setFloat64(base + IT_CRIT * 8, d.crit ?? 0, true);
    dv.setFloat64(base + IT_LIFE * 8, d.lifesteal ?? 0, true);
    dv.setFloat64(base + IT_THORNS * 8, d.thorns ?? 0, true);
    dv.setFloat64(base + IT_REGEN * 8, d.regen ?? 0, true);
    dv.setFloat64(base + IT_RNG * 8, d.ranged ?? 0, true);
    dv.setFloat64(base + IT_SPDMUL * 8, d.speedMul ?? 1, true);
  }
  for (const k of ['musket', 'rifle']) { const i = itemIdx(k); setU32(R_GUNBM, i >> 5, getU32(R_GUNBM, i >> 5) | (1 << (i & 31))); }
  { const i = itemIdx('laser_rifle'); setU32(R_BEAMBM, i >> 5, getU32(R_BEAMBM, i >> 5) | (1 << (i & 31))); }
  setI32(R_TBIN, 0, ITEM_KEYS.length);
  for (let w = 0; w < 4; w++) { dump.gunbm[w] = getU32(R_GUNBM, w); dump.beambm[w] = getU32(R_BEAMBM, w); }
  // TBR + RACE_FLAGS + TBF（L757-791；herbivore 硬编码表与 flying|aquatic bit32 宿主语义）
  for (const k of Object.keys(RACES)) {
    const id = Number(k);
    if (id < 0 || id >= 512) continue;
    const d = RACES[id];
    setF64(R_TBR, id * 12 + 0, d.hp); setF64(R_TBR, id * 12 + 1, d.dmg); setF64(R_TBR, id * 12 + 2, d.speed);
    setF64(R_TBR, id * 12 + 3, d.maxAge); setF64(R_TBR, id * 12 + 4, d.repro); setF64(R_TBR, id * 12 + 5, d.reach ?? 0);
    setF64(R_TBR, id * 12 + 6, d.growth ?? 0.5);
    setF64(R_TBR, id * 12 + 7, d.ranged?.range ?? 0); setF64(R_TBR, id * 12 + 8, d.ranged?.dmg ?? 0); setF64(R_TBR, id * 12 + 9, d.ranged?.cd ?? 0);
    dump.tbr[id] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((c) => f64at2(R_TBR, id * 12 + c));
    dump.raceFlags[id] = 0;
    let f1 = 0;
    if (d.hostile) f1 |= 1;
    if (d.isCiv) f1 |= 2;
    if (d.undead) f1 |= 4;
    if (d.predator) f1 |= 8;
    if (id === 6 || id === 10 || id === 11 || id === 12 || id === 33 || id === 34 || id === 35 || id === 37) f1 |= 16;
    if (d.flying || d.aquatic) f1 |= 32;
    setU8(ID.RACE_FLAGS, id, f1);
    dump.raceFlags[id] = f1;
    let f2 = 0;
    if (d.lavaImmune) f2 |= 1;
    if (d.nightsight) f2 |= 2;
    if (d.flying) f2 |= 32;
    if (d.aquatic) f2 |= 64;
    if (d.sandswim) f2 |= 128;
    setU8(ID.TBF, id * 2 + 1, f2);
    if (d.flying) setU8(ID.TBF, id * 2, 32);
    dump.tbf0[id] = d.flying ? 32 : 0;
    dump.tbf1[id] = f2;
  }
  // TBJ（L792-797：7*5 窗口，king 越界写被 Float64Array 静默丢弃——复刻同语义）
  for (let i = 0; i < 7; i++) {
    const j = JOBS[i];
    setF64(R_TBJ, i * 5 + 0, j.hpMul); setF64(R_TBJ, i * 5 + 1, j.dmgMul); setF64(R_TBJ, i * 5 + 2, j.speedMul);
    setF64(R_TBJ, i * 5 + 3, j.weight); setF64(R_TBJ, i * 5 + 4, j.ranged ?? 0);
  }
  for (let c = 0; c < 35; c++) dump.tbj.push(getTbj(c));
}

// —— 地形（base + rects + fire + road）——
function fillTerrainEx(spec) {
  const terr = new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(ID.TERR), TILES);
  terr.fill(spec.base ?? T.GRASS);
  for (const r of spec.rects ?? []) {
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) terr[y * W + x] = r.t;
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

// —— 单位布置（战斗前置全字段；ULX/ULY=NaN 出生语义、UTRAIT=-1、UGEAR=-1×7）——
function putUnitC(slot, u) {
  setU32(ID.UID, slot, u.id ?? slot);
  setU32(ID.URACE, slot, u.race);
  setU32(ID.UCELL, slot, Math.floor(u.y / 4) * 256 + Math.floor(u.x / 4));
  setF64(ID.UX, slot, u.x);
  setF64(ID.UY, slot, u.y);
  setF64(ID.UTX, slot, u.tx ?? u.x);
  setF64(ID.UTY, slot, u.ty ?? u.y);
  setF64(ID.USPEED, slot, u.speed ?? 0.08);
  setF64(ID.UHP, slot, u.hp ?? 100);
  setF64(ID.UMAXHP, slot, u.maxhp ?? 100);
  setF64(ID.UMAXAGE, slot, 9999);
  setF64(ID.UAGE, slot, 0);
  setF64(ID.UDMG, slot, u.dmg ?? 5);
  setF64(R_UKILLS, slot, u.kills ?? 0);
  setF64(ID.UCHILL, slot, 0);
  setF64(ID.UCURSE, slot, u.curse ?? 0);
  setF64(ID.UBLESS, slot, 0);
  setF64(ID.UFERT, slot, 0);
  setF64(ID.UDETOUR, slot, 0);
  setF64(ID.UHURT, slot, 0);
  setF64(ID.UATK, slot, 0);
  setF64(ID.UCD, slot, u.cd ?? 0);
  setF64(R_UBREATH, slot, u.breath ?? 0);
  setF64(ID.UFD, slot, u.food === undefined ? F_NAN : u.food);
  setF64(ID.UCVN, slot, u.cvn ?? 0);
  setF64(ID.UFLEET, slot, u.fleet ?? 0);
  setI32(ID.UCIV, slot, u.civ === undefined ? -1 : u.civ);
  setI32(ID.UJOB, slot, u.job === undefined ? -1 : u.job);
  setI32(ID.UARMY, slot, -1);
  setI32(ID.UFAM, slot, -1);
  setI32(ID.UFGN, slot, -1);
  setI32(ID.USTK, slot, 0);
  setI32(R_UTRAIT, slot, u.trait === undefined ? -1 : u.trait);
  setU8(ID.UDEAD, slot, 0);
  setU8(ID.UHASPANIC, slot, u.panic === undefined ? 0 : 1);
  if (u.panic !== undefined) setF64(ID.UPANIC, slot, u.panic);
  setU8(ID.UINF, slot, u.inf ? 1 : 0);
  setU8(ID.UBOAT, slot, u.boat ? 1 : 0);
  setU8(ID.UFLIP, slot, 0);
  setF64(R_ULX, slot, F_NAN); // 出生未移动语义（弓手弹道预测 NaN 分支）
  setF64(R_ULY, slot, F_NAN);
  for (let g = 0; g < 4; g++) setF64(ID.UGENE, slot * 4 + g, 1);
  for (let g = 0; g < 7; g++) setI32(R_UGEAR, slot * 7 + g, u.gear?.[g] ?? -1);
  for (let g = 0; g < GRUDGE_CAP; g++) { setI32(ID.UGIDS, slot * GRUDGE_CAP + g, -1); setF64(ID.UGVAL, slot * GRUDGE_CAP + g, 0); }
  if (u.grudges) {
    for (let g = 0; g < u.grudges.length && g < GRUDGE_CAP; g++) {
      setI32(ID.UGIDS, slot * GRUDGE_CAP + g, u.grudges[g].oid);
      setF64(ID.UGVAL, slot * GRUDGE_CAP + g, u.grudges[g].gv);
    }
    setI32(ID.UGLN, slot, u.grudges.length);
  } else {
    setI32(ID.UGLN, slot, -1);
  }
}

// —— 采样（战斗全字段）——
const F64_FIELDS = [
  ['x', ID.UX], ['y', ID.UY], ['tx', ID.UTX], ['ty', ID.UTY],
  ['hp', ID.UHP], ['panic', ID.UPANIC], ['fleet', ID.UFLEET], ['cd', ID.UCD],
  ['atk', ID.UATK], ['hurt', ID.UHURT], ['food', ID.UFD], ['kills', R_UKILLS],
  ['breath', R_UBREATH], ['age', ID.UAGE],
];
function sampleTick(slots, sc) {
  const dv = new DataView(mem.buffer);
  const at = (id) => ex.wb_arena_ptr() + ex.wb_off(id);
  const units = slots.map((s) => {
    const o = {
      slot: s, race: getU32(ID.URACE, s), dead: u8(ID.UDEAD, s), hasPanic: u8(ID.UHASPANIC, s),
      inf: u8(ID.UINF, s), boat: u8(ID.UBOAT, s), flip: u8(ID.UFLIP, s),
      glen: (() => { const a = at(ID.UGLN) + s * 4; return dv.getInt32(a, true); })(),
    };
    for (const [k, id] of F64_FIELDS) o[k] = bits(dv.getFloat64(at(id) + s * 8, true));
    o.gids = []; o.gvals = [];
    for (let g = 0; g < GRUDGE_CAP; g++) {
      o.gids.push(dv.getInt32(at(ID.UGIDS) + (s * GRUDGE_CAP + g) * 4, true));
      o.gvals.push(bits(dv.getFloat64(at(ID.UGVAL) + (s * GRUDGE_CAP + g) * 8, true)));
    }
    return o;
  });
  const actN = getU32(ID.ACTN, 0);
  const actBase = ex.wb_arena_ptr() + ex.wb_off(ID.ACT);
  const actHex = Buffer.from(mem.buffer, actBase, Math.min(actN, 512)).toString('hex');
  const terr = new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(ID.TERR), TILES);
  const out = {
    rng: getU32(ID.RNGS, 0), tick: getU32(ID.TICK, 0), actN,
    dlistN: getU32(ID.DLISTN, 0), batchR: getU32(ID.BATCHR, 0), bailK: getU32(ID.BAILK, 0),
    cnt4: bits(dv.getFloat64(at(R_CNT) + 4 * 8, true)),
    wildZombie: dv.getInt32(at(R_WILD) + 5 * 4, true),
    wildSheep: dv.getInt32(at(R_WILD) + 6 * 4, true),
    cvpop0: bits(dv.getFloat64(at(R_CVPOP) + 0 * 8, true)),
    fireN: dv.getInt32(at(R_FIREN) + 0 * 4, true),
    neuCall: [dv.getUint32(at(R_NEUCALL) + 0 * 4, true), dv.getUint32(at(R_NEUCALL) + 4, true), dv.getUint32(at(R_NEUCALL) + 8, true)],
    units, actHex,
  };
  if (sc?.terrProbe) {
    out.terr = sc.terrProbe.map(([x, y]) => terr[y * W + x]);
  }
  return out;
}

// —— 单场景执行（批层战斗：init→boot→civ→units→pack→batch×ticks）——
function runCombat(sc) {
  initWorld(sc.seed, sc.fxp ?? 0);
  setU8(ID.LAWS, 0, sc.laws ?? 0);
  if (sc.dayph !== undefined) setF64(R_DAYPH, 0, sc.dayph);
  if (sc.nctl !== undefined) setU8(ID.NCTL, 0, sc.nctl);
  if (sc.neuw) for (const [i, v] of sc.neuw) setF64(R_NEUW, i, v);
  fillTerrainEx(sc.terrain ?? {});
  bootTables();
  if (sc.civs) {
    setI32(ID.CIVN, 0, sc.civs.length);
    sc.civs.forEach((c, i) => {
      setU8(R_CVAL, i, 1);
      if (c.mkt !== undefined) setI32(R_CVMKT, i, c.mkt);
      if (c.plague !== undefined) setF64(R_CVTECH, i * 24 + TC_PLAGUE, c.plague);
      if (c.archer !== undefined) setF64(R_CVTECH, i * 24 + TC_ARCHER, c.archer);
      if (c.range !== undefined) setF64(R_CVTECH, i * 24 + TC_RANGE, c.range);
    });
  }
  if (sc.atwar) for (const [a, b] of sc.atwar) { setU8(R_ATWAR, a * MAX_CIVS + b, 1); setU8(R_ATWAR, b * MAX_CIVS + a, 1); } // 对称宣战（IsEnemyFull 读 ATWAR[ca][cb] 双向）
  for (const u of sc.units) putUnitC(u.slot, u);
  ex.wb_pack_end(sc.units.length);
  const ticks = [];
  for (let t = 0; t < sc.ticks; t++) {
    const rc = ex.wb_units_batch(0, 0);
    ticks.push({ rc, ...sampleTick(sc.units.map((u) => u.slot), sc) });
    setU8(ID.PAR, 0, u8(ID.PAR, 0) ^ 1);
    for (const u of sc.units) {
      if (u8(ID.UDEAD, u.slot)) continue;
      const x = getF64(ID.UX, u.slot), y = getF64(ID.UY, u.slot);
      setU32(ID.UCELL, u.slot, Math.floor(y / 4) * 256 + Math.floor(x / 4));
      setU8(R_UPAR, u.slot, u8(ID.PAR, 0));
    }
    ex.wb_pack_end(sc.units.length);
  }
  return { name: sc.name, seed: sc.seed, input: sc, output: ticks };
}

// —— 种子猎取（分支敏感场景：冻结首个满足判定的种子，此后全定）——
function pickSeed(sc) {
  for (let sd = 1; sd < 4096; sd++) {
    const probe = { ...sc, seed: sd };
    try {
      if (sc.hunt(runCombat(probe).output)) return sd;
    } catch { /* bail/rc 异常种子跳过 */ }
  }
  throw new Error(`pickSeed FAIL: ${sc.name}`);
}

export { runCombat, bootTables, putUnitC, fillTerrainEx, pickSeed, actHas, actHasTxt };

// ============ 场景集（M-U2c 战斗树全覆盖）============
// 坐标基尺：攻击者 (40.5, 80.5)，敌 d=3 → (43.5, 80.5)，d=0.5 → (41, 80.5)
const D3 = { x: 43.5, y: 80.5 }, D05 = { x: 41.0, y: 80.5 }, D25 = { x: 43.0, y: 80.5 };
void D3; void D05; void D25; void TILES; void H;
const GRASS = { base: T.GRASS };
const WATER = { base: T.DEEP, rects: [] };
const SAND = { base: T.SAND };

const SCENARIOS = [
  // —— 逃逸链（L2458-2535）——
  { name: 'C01-caravan-flee', seed: 1, ticks: 2, terrain: GRASS, civs: [{}],
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, cvn: 0.5 },
            { slot: 1, race: R.BANDIT, ...D3 }] },
  { name: 'C02-fleet-flee', seed: 2, ticks: 2, terrain: GRASS,
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5, fleet: 30 },
            { slot: 1, race: R.SHEEP, maxhp: 16, hp: 16, ...D3 }] },
  { name: 'C03-fleet-flee-panic', seed: 3, ticks: 2, terrain: GRASS,
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5, fleet: 30, panic: 0.6 },
            { slot: 1, race: R.SHEEP, maxhp: 16, hp: 16, ...D3 }] },
  { name: 'C04-panic-rout', seed: 4, ticks: 2, terrain: GRASS,
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5, panic: 0.9 },
            { slot: 1, race: R.SHEEP, maxhp: 16, hp: 16, ...D3 }] },
  // —— 战或逃神经（教师路径 L2485-2535；飞逃=1）——
  { name: 'C05-flight-flee', seed: 5, ticks: 2, terrain: GRASS,
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5, hp: 10, food: 40 },
            { slot: 1, race: R.DRAGON, ...D25 }] },
  // —— 姿态网络（教师路径；溃退 stance=3 → fleet=50）——
  // 注：IsEnemyFull 无猎物侧检查（羊看不见狼）——弱者逃逸链须用敌意/civ 对（bandit 见 human）
  { name: 'C06-stance-retreat', seed: 6, ticks: 2, terrain: GRASS, civs: [{}],
    units: [{ slot: 0, race: R.BANDIT, x: 40.5, y: 80.5, hp: 4 },
            { slot: 1, race: R.HUMAN, civ: 0, ...D25 }] },
  // —— 法师火球（has_rd 命中窗 + stance2 拉扯 0.6；mage hostile 见 human civ）——
  { name: 'C07-mage-fireball', seed: 7, ticks: 2, terrain: GRASS, civs: [{}],
    units: [{ slot: 0, race: R.MAGE, x: 40.5, y: 80.5 },
            { slot: 1, race: R.HUMAN, civ: 0, ...D3 }] },
  // —— 弓手（job3 TBJ ranged=5 真值 + 弹道预测 NaN 语义）——
  { name: 'C08-archer-arrow', seed: 8, ticks: 2, terrain: GRASS, civs: [{}],
    units: [{ slot: 0, race: R.HUMAN, civ: 0, job: 3, x: 40.5, y: 80.5 },
            { slot: 1, race: R.BANDIT, ...D3 }] },
  // —— 火枪（gear ranged + GUNBM 位图 + 12% SND）——
  { name: 'C09-musket-snd', seed: 0, ticks: 2, terrain: GRASS, civs: [{}, {}], atwar: [[0, 1]],
    hunt: (t) => t[0].actHex.length > 4 && actHas(t[0].actHex, ACT_SND, 1),
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, gear: [GUN_ID] },
            { slot: 1, race: R.HUMAN, civ: 1, ...D3 }] },
  // —— 近战命中（命中网络教师 0.78 + 血溅 + 战场标记）——
  { name: 'C10-melee-hit', seed: 0, ticks: 2, terrain: GRASS, fxp: FXP_DMGNUM | FXP_BLOOD,
    hunt: (t) => t[0].units[1].hp < bits(16),
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5 },
            { slot: 1, race: R.SHEEP, maxhp: 16, hp: 16, ...D05 }] },
  // —— 近战落空（rng>acc → TXT_MISS 0.55 掷）——
  { name: 'C11-melee-miss', seed: 0, ticks: 2, terrain: GRASS, fxp: FXP_DMGNUM,
    hunt: (t) => t[0].units[1].hp === bits(16) && actHasTxt(t[0].actHex, TXT_MISS),
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5 },
            { slot: 1, race: R.SHEEP, maxhp: 16, hp: 16, ...D05 }] },
  // —— 克拉肯触手（boat 分支：30% 击沉 EVT_SHIPWRECK / 70% 海啸）——
  { name: 'C12-kraken-tentacle', seed: 0, ticks: 2, terrain: WATER,
    hunt: (t) => t[0].units[1].dead === 1,
    units: [{ slot: 0, race: R.KRAKEN, x: 40.5, y: 80.5 },
            { slot: 1, race: R.HUMAN, civ: 0, boat: 1, x: 42.5, y: 80.5 }] },
  // —— 沙虫吞噬（hp≤40% maxhp → 即死 + 进食）——
  { name: 'C13-sandworm-devour', seed: 13, ticks: 2, terrain: SAND, fxp: FXP_DMGNUM,
    units: [{ slot: 0, race: R.SANDWORM, x: 40.5, y: 80.5, food: 20 },
            { slot: 1, race: R.SHEEP, maxhp: 16, hp: 5, x: 41.5, y: 80.5 }] },
  // —— 蛇怪石化（0.08 掷 + 尸体动作 + EVT_PETRIFY）——
  { name: 'C14-basilisk-petrify', seed: 0, ticks: 2, terrain: GRASS, fxp: FXP_DMGNUM | FXP_CORPSES,
    hunt: (t) => t[0].units[1].dead === 1,
    units: [{ slot: 0, race: R.BASILISK, x: 40.5, y: 80.5 },
            { slot: 1, race: R.SHEEP, maxhp: 16, hp: 16, ...D05 }] },
  // —— 蛇怪毒牙（石化未中 → 命中 → 0.45 中毒 UINF）——
  { name: 'C15-basilisk-poison', seed: 0, ticks: 2, terrain: GRASS, fxp: FXP_DMGNUM,
    hunt: (t) => t[0].units[1].inf === 1 && t[0].units[1].dead === 0,
    units: [{ slot: 0, race: R.BASILISK, x: 40.5, y: 80.5 },
            { slot: 1, race: R.SHEEP, maxhp: 16, hp: 16, ...D05 }] },
  // —— 吸血鬼吸血（0.6 倍 + FX_HEART 0.4 掷）——
  { name: 'C16-vampire-lifesteal', seed: 16, ticks: 2, terrain: GRASS, civs: [{}], fxp: FXP_DMGNUM,
    units: [{ slot: 0, race: R.VAMPIRE, x: 40.5, y: 80.5, hp: 60 },
            { slot: 1, race: R.HUMAN, civ: 0, ...D05 }] },
  // —— gear 全链（crit 2.2 / armor 减伤 / thorns 反伤）——
  { name: 'C17-gear-crit-armor-thorns', seed: 0, ticks: 2, terrain: GRASS, civs: [{}, {}], atwar: [[0, 1]],
    hunt: (t) => t[0].units[0].hurt > bits(0) && t[0].units[1].hp < bits(100),
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, gear: [CRIT_ID] },
            { slot: 1, race: R.HUMAN, civ: 1, ...D05, gear: [-1, ARMOR_ID, -1, -1, -1, -1, THORNS_ID] }] },
  // —— 击杀僵尸感染（LAW_ZINFECT → zombify 原地变僵尸）——
  { name: 'C18-kill-zombify', seed: 18, ticks: 2, terrain: GRASS, laws: LAW_ZINFECT, civs: [{}],
    units: [{ slot: 0, race: R.ZOMBIE, x: 40.5, y: 80.5 },
            { slot: 1, race: R.HUMAN, civ: 0, hp: 3, ...D05 }] },
  // —— 复仇 splice + 目击恐慌/记仇 + 捕食者进食 ——
  { name: 'C19-kill-revenge-witness', seed: 0, ticks: 2, terrain: GRASS, fxp: FXP_DMGNUM,
    hunt: (t) => t[0].units[0].glen === 0 && t[0].units[2].hasPanic === 1 && t[0].units[2].glen === 1
      && actHas(t[0].actHex, ACT_EVT, EVT_REVENGE),
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5, food: 20, grudges: [{ oid: 1, gv: 2.0 }] },
            { slot: 1, race: R.SHEEP, id: 1, maxhp: 16, hp: 3, ...D05 },
            { slot: 2, race: R.SHEEP, maxhp: 16, hp: 16, x: 42.5, y: 81.5 }] },
  // —— 十杀传奇 + 屠龙计数（kills 9→10 → TOAST+EVT_LEGEND+CNT[4]）——
  { name: 'C20-kill-legend-dragon', seed: 0, ticks: 2, terrain: GRASS,
    hunt: (t) => t[0].units[1].dead === 1 && t[0].units[0].kills === bits(10),
    // 注：杀手用 bandit 非 human——龙死于 tick0 后 tick1 独处会触和平尾 civ 段（M-U3 桩域外）；
    // bandit 非 civ 免触；龙敌对特判（ra!=rb）对任意种族成立
    units: [{ slot: 0, race: R.BANDIT, x: 40.5, y: 80.5, kills: 9 },
            { slot: 1, race: R.DRAGON, hp: 1, ...D05 }] },
  // —— 追击（stance0 均势 → tx/ty=敌坐标 + move 1.25）——
  { name: 'C21-chase', seed: 21, ticks: 2, terrain: GRASS, civs: [{}, {}], atwar: [[0, 1]],
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5 },
            { slot: 1, race: R.HUMAN, civ: 1, ...D25 }] },
  // —— 射程死区（敌出射程 + stance2 + has_rd → 拉扯 0.8）——
  { name: 'C22-range-deadzone', seed: 22, ticks: 2, terrain: GRASS, civs: [{}],
    units: [{ slot: 0, race: R.MAGE, x: 40.5, y: 80.5 },
            { slot: 1, race: R.HUMAN, civ: 0, x: 47.5, y: 80.5 }] },
  // —— 血仇衰减（splice<0.3 前移语义 + 全空 → UGLN=-1）——
  { name: 'C23-grudge-decay', seed: 23, ticks: 2, terrain: GRASS,
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5,
              grudges: [{ oid: 11, gv: 0.303 }, { oid: 12, gv: 1.0 }] }] },
  // —— 疫病传播（UINF + 0.02 掷 + TC_PLAGUE 门）——
  { name: 'C24-spread-plague', seed: 0, ticks: 2, terrain: GRASS, civs: [{ plague: 0.5 }],
    hunt: (t) => t[0].units[1].inf === 1,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, inf: 1 },
            { slot: 1, race: R.HUMAN, civ: 0, x: 41.4, y: 80.5 },
            { slot: 2, race: R.BANDIT, ...D3 }] },
  // —— 白行者寒霜（0.08 掷 → 草地冻雪 + 火清）——
  { name: 'C25-whitewalker-frost', seed: 0, ticks: 2, terrain: { base: T.GRASS, fire: [[41, 80]] },
    hunt: (t) => t[0].terr[0] === T.SNOW,
    terrProbe: [[41, 80], [42, 80]],
    units: [{ slot: 0, race: R.WHITEWALKER, x: 40.5, y: 80.5 }] },
  // —— gear 再生（head 段 L2379-2397：civ gear regen 附加；接敌场景不触尾）——
  { name: 'C26-gear-regen', seed: 26, ticks: 2, terrain: GRASS, civs: [{}],
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, hp: 50, gear: [-1, REGEN_ID] },
            { slot: 1, race: R.BANDIT, ...D3 }] },
  // —— 夜战减益（dayph 0.7 非 nightSIGHT ×0.92）——
  { name: 'C27-night-debuff', seed: 0, ticks: 2, terrain: GRASS, dayph: 0.7, atwar: [[0, 1]],
    hunt: (t) => t[0].units[1].hp < bits(93),
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, dmg: 20 },
            { slot: 1, race: R.HUMAN, civ: 1, ...D05 }] },
  // —— 神经网络路径（NCTL bit0=1 + FRL 权重 + f32 舍入语义）——
  { name: 'C28-network-flight', seed: 28, ticks: 2, terrain: GRASS, nctl: 1,
    neuw: Array.from({ length: 98 }, (_, k) => [NW_FRL + k, ((k * 37) % 13) * 0.03 - 0.18]),
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5, hp: 10, food: 40 },
            { slot: 1, race: R.DRAGON, ...D25 }] },
  // —— 和平尾龙息（skip_tail=false → UBREATH 归零重掷 + DragonBreath）——
  { name: 'C29-dragon-breath-tail', seed: 29, ticks: 2, terrain: WATER,
    units: [{ slot: 0, race: R.DRAGON, x: 40.5, y: 80.5, breath: 1 }] },
];

// —— act 缓冲扫描助手（断言用）——
function actHas(hex, op, arg1) {
  const b = Buffer.from(hex, 'hex');
  for (let i = 0; i + 1 < b.length; i++) {
    if (b[i] === op) {
      if (arg1 === undefined) return true;
      if (b[i + 1] === arg1) return true;
    }
  }
  return false;
}
function actHasTxt(hex, txtOp) {
  const b = Buffer.from(hex, 'hex');
  for (let i = 0; i + 3 < b.length; i++) {
    if (b[i] === ACT_FX && b[i + 3] === txtOp) return true;
  }
  return false;
}

// ============ 执行（直接执行或经 run-node-ts runner 时运行；export 供调试脚本 import）============
if (import.meta.main || process.env.WB_GEN_MAIN === '1') {
main();
}

function main() {
console.log(`items: n=${ITEM_KEYS.length} gun=${GUN_ID} crit=${CRIT_ID} armor=${ARMOR_ID} thorns=${THORNS_ID} regen=${REGEN_ID}`);
for (const sc of SCENARIOS) {
  if (sc.hunt && sc.seed === 0) {
    sc.seed = pickSeed(sc);
    console.log(`  hunt ${sc.name}: seed=0x${sc.seed.toString(16)}`);
  }
}
const results = SCENARIOS.map(runCombat);

// —— 双跑确定性 ——
for (const sc of SCENARIOS) {
  const a = JSON.stringify(runCombat(sc));
  const b = JSON.stringify(runCombat(sc));
  if (a !== b) throw new Error(`determinism FAIL: ${sc.name}`);
}
console.log(`determinism: PASS (${SCENARIOS.length} scenarios × 2 runs)`);

// —— 健全性断言（黄金数据生成质量门）——
function T0(name) { const r = results.find((x) => x.name === name); if (!r) throw new Error(`missing ${name}`); return r.output[0]; }
for (const r of results) {
  for (const tk of r.output) {
    if (tk.rc !== 1) throw new Error(`${r.name} tick rc=${tk.rc} bail=${tk.bailK}`);
    if (tk.batchR !== 1) throw new Error(`${r.name} batchR=${tk.batchR}`);
  }
}
{ const t = T0('C01-caravan-flee'); const u = t.units[0];
  if (u.fleet !== bits(0)) throw new Error('C01 fleet polluted');
  const moved = u.tx !== bits(40.5) || u.ty !== bits(80.5);
  if (!moved) throw new Error('C01 caravan did not re-target'); }
{ const t = T0('C04-panic-rout'); if (t.units[0].fleet !== bits(60)) throw new Error('C04 fleet!=60'); }
{ const t = T0('C05-flight-flee'); if (t.units[0].fleet !== bits(40)) throw new Error('C05 fleet!=40 (teacher flight)'); }
{ const t = T0('C06-stance-retreat'); if (t.units[0].fleet !== bits(50)) throw new Error('C06 fleet!=50 (stance3)'); }
{ const t = T0('C07-mage-fireball');
  if (!actHas(t.actHex, ACT_FX, FX_FIREBALL)) throw new Error('C07 no fireball fx');
  if (t.units[0].cd !== bits(26)) throw new Error('C07 cd!=26 (TBR ranged cd 真值)'); }
{ const t = T0('C08-archer-arrow'); if (!actHas(t.actHex, ACT_FX, FX_ARROW)) throw new Error('C08 no arrow fx'); }
{ const t = T0('C09-musket-snd');
  if (!actHas(t.actHex, ACT_FX, FX_BULLET)) throw new Error('C09 no bullet fx');
  if (!actHas(t.actHex, ACT_SND, SND_PLACE)) throw new Error('C09 no gun snd'); }
{ const t = T0('C10-melee-hit'); if (t.units[1].hp >= bits(16)) throw new Error('C10 no damage'); }
{ const t = T0('C11-melee-miss'); if (t.units[1].hp !== bits(16)) throw new Error('C11 victim damaged on miss'); }
{ const t = T0('C12-kraken-tentacle'); if (t.units[1].dead !== 1) throw new Error('C12 no shipwreck kill'); }
{ const t = T0('C13-sandworm-devour'); if (t.units[1].dead !== 1) throw new Error('C13 no devour'); }
{ const t = T0('C14-basilisk-petrify');
  if (t.units[1].dead !== 1) throw new Error('C14 no petrify');
  if (!actHas(t.actHex, ACT_EVT, EVT_PETRIFY)) throw new Error('C14 no petrify evt'); }
{ const t = T0('C15-basilisk-poison'); if (t.units[1].inf !== 1) throw new Error('C15 no poison'); }
{ const t = T0('C16-vampire-lifesteal');
  if (t.units[0].hp === bits(60)) throw new Error('C16 no lifesteal'); }
{ const t = T0('C18-kill-zombify');
  const v = t.units[1];
  if (v.race !== 5) throw new Error('C18 victim not zombified');
  if (v.hp !== bits(40)) throw new Error('C18 zombie hp!=40'); }
{ const t = T0('C19-kill-revenge-witness');
  if (t.units[0].glen !== 0) throw new Error('C19 grudge not spliced');
  if (t.units[2].hasPanic !== 1 || t.units[2].glen !== 1) throw new Error('C19 witness no panic/grudge'); }
{ const t = T0('C20-kill-legend-dragon');
  if (t.units[0].kills !== bits(10)) throw new Error('C20 kills!=10');
  if (t.cnt4 !== bits(1)) throw new Error('C20 dragon cnt!=1'); }
{ const t = T0('C21-chase'); if (t.units[0].tx === bits(40.5) && t.units[0].ty === bits(80.5)) throw new Error('C21 no chase target'); }
{ const t = T0('C23-grudge-decay');
  if (t.units[0].glen !== 1) throw new Error('C23 grudge decay splice fail');
  if (t.units[0].gids[0] !== 12) throw new Error('C23 splice order fail'); }
{ const t = T0('C24-spread-plague'); if (t.units[1].inf !== 1) throw new Error('C24 plague not spread'); }
{ const t = T0('C26-gear-regen'); if (t.units[0].hp === bits(50)) throw new Error('C26 no regen'); }
{ const t = T0('C28-network-flight'); if (t.neuCall[2] < 1) throw new Error('C28 flight net not called'); }
{ const t = T0('C29-dragon-breath-tail');
  const f64of = (h) => new Float64Array(new BigUint64Array([BigInt(h)]).buffer)[0];
  const br = f64of(t.units[0].breath);
  if (!(br >= 150 && br < 300)) throw new Error(`C29 breath not reset: ${br}`);
  if (!actHas(t.actHex, ACT_FX, FX_EXPLOSION)) throw new Error('C29 no breath fx'); }
console.log('sanity: PASS (escape/stance/ranged/melee/kill/grudge/plague/frost/regen/network/tail)');

// —— 入库 ——
const out = {
  meta: {
    gen: 'gen-units-combat.mjs', job: 2902286, slice: 'M-U2c',
    W, H, TILES, MAX_RACES, MAX_CIVS,
    regionIds: ID, eps: EP_KEYS.map((k) => ep(k)), epKeys: EP_KEYS,
    items: { keys: ITEM_KEYS, gun: GUN_ID, crit: CRIT_ID, armor: ARMOR_ID, thorns: THORNS_ID, regen: REGEN_ID },
    tc: { repair: TC_REPAIR, archer: TC_ARCHER, plague: TC_PLAGUE, range: TC_RANGE },
    rb: { reach: RB_REACH, rngRange: RB_RNG_RANGE }, jb: { rng: JB_RNG },
    nw: { frl: NW_FRL }, tl: { decision: TL_DECISION, kill: TL_KILL },
    acts: { fx: ACT_FX, snd: ACT_SND, evt: ACT_EVT, toast: ACT_TOAST, civ: ACT_CIV, battle: ACT_BATTLE, warkill: ACT_WARKILL, corpse: ACT_CORPSE, blood: ACT_BLOOD },
    fxs: { fireball: FX_FIREBALL, arrow: FX_ARROW, bullet: FX_BULLET, explosion: FX_EXPLOSION },
    txts: { miss: TXT_MISS, devour: TXT_DEVOUR, petrify: TXT_PETRIFY, poison: TXT_POISON },
    evts: { shipwreck: EVT_SHIPWRECK, petrify: EVT_PETRIFY, revenge: EVT_REVENGE, legend: EVT_LEGEND },
    laws: { zInfect: LAW_ZINFECT }, toast: { kills10: TOAST_KILLS10 }, snd: { place: SND_PLACE },
    grudgeCap: GRUDGE_CAP,
    boot: BOOT_DUMP,
    note: 'f64 全 bits(hex)。引导表 = wbspatial packTables 宿主协议复刻（RACES/JOBS/ITEM_DEFS 真表灌入）。蓝本 units.rs L2458-2954 战斗树 + L2288-2438 head 补全段。',
  },
  scenarios: results,
};
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`golden: ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(1)} KB)`);
for (const r of results) {
  const t = r.output.at(-1);
  console.log(`  ${r.name}: seed=0x${r.seed.toString(16)} rng=${t.rng.toString(16)} actN=${t.actN} dlistN=${t.dlistN}`);
}
}

