#!/usr/bin/env node
// ============================================================
// M-U2d 繁衍收尸黄金向量生成器（Job 2902286）
// 真实现 = public/wasm/wbcore.wasm（位精确权威蓝本，纪律②零同源复制）
// 蓝本段：rust-core/src/units.rs L1813-2041 spawn_unit 全量
//         L1795-1808 rise_skeleton / L3267-3340 繁衍段 / L3371-3427
//         fam_for_child+child_gene+emergent_gate / L3429-3539 try_pickup
//         L737-985 arena_append/calc_cell/roman_bytes/unique_name/family 族
// 引导表灌入 = wbspatial packTables 宿主协议复刻（复用 gen-units-combat bootTables：
//   TBR/RACE_FLAGS/TBF/TBJ/TBI/GUNBM/BEAMBM/TBIN）+ TRAITS 真表键序（TRDMG/TRHP/TRSPD/TRN）
//   + FIRST 名池（names.ts → FRSTOFF/FRSTN/FRSTP 24B 定长条目）。
//   FAMP 家族词表不灌：wasm new_family 只存 pre_i/post_i 索引（FMNAME u16×2），不读词表内容。
// 驱动协议（宿主模拟，spawn 场景关键差异）：
//   live 追踪 = USEQ 差值（spawn 成功恰好 +1；budget 拒绝在 USEQ 自增前 return；
//   arena 满失败在自增后 return——场景规模极小不触达）→ liveN = n0 + spawned。
//   每 tick：batch → 采样（初始+新 slot 全字段）→ parity 翻转 → 宿主重排（含新 slot
//   UCELL/UPAR=新 parity，ACT_SPAWN 回放语义）→ pack_end(liveN)（wb_pack_end 重置
//   live_len=n，故 n 必须含 spawn 新增——与 TS 宿主 units.length 同语义）。
// 用法: node scripts/unity-migration/run-node-ts.mjs scripts/unity-migration/gen-units-spawn.mjs
// 输出: scripts/unity-migration/golden/units_spawn.json（f64 全 bits）
// ============================================================
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { T, R, TRAITS } from '../../src/lib/game/types.ts';
import { ITEM_DEFS } from '../../src/lib/game/items.ts';
import { FIRST } from '../../src/lib/game/names.ts';
import { NEUTRAL_MODS } from '../../src/lib/game/tech.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import {
  W, H, TILES, MAX_RACES, MAX_CIVS, ID, ex, mem,
  bits, F_NAN, initWorld, setU8, setI32, setF64, setU32, getF64, getU32, getI32, u8,
} from './gen-units-scan.mjs';
import { bootTables, putUnitC, fillTerrainEx, actHas } from './gen-units-combat.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'scripts/unity-migration/golden/units_spawn.json');
const GRUDGE_CAP = 8;

// ep 键序（wbspatial.ts L505-506；与 units.rs EP_* 一致）
const EP_KEYS = ['pop.reproMul', 'eco.regrowBase', 'eco.grazeRate', 'fire.spreadMul', 'fire.damage', 'war.declareRate', 'war.tensionDecay', 'war.milPressure', 'evo.mutationRate', 'social.panicDecay', 'social.panicRout', 'social.grudgeDecay', 'nature.quakeStress', 'nature.stormRate', 'nature.erosionRate'];

// —— 区域 id（显式 const 权威 lib.rs L148-260；数字字面量防 wb_off(undefined)→0 隐形炸弹）——
const R_UBREATH = 29, R_UKILLS = 26, R_ULX = 30, R_ULY = 31, R_UTRAIT = 44, R_UGEAR = 52, R_UNAME = 56;
const R_CIVN = 67, R_CVPOP = 68, R_CVAL = 72, R_CVGOV = 73, R_CVTECH = 74, R_CVDIR = 75, R_CVPC = 76, R_CVMKT = 77;
const R_FAMN = 78, R_FMID = 79, R_FMRACE = 80, R_FMNUM = 81, R_FMSEQ = 82, R_FMNAME = 83;
const R_ITMK = 91, R_ITMXY = 92, R_USEQ = 99;
const R_WILD = 106, R_GRASS = 107, R_DAYPH = 108, R_REPRM = 109, R_SPB = 111, R_SPBH = 112;
const R_TRN = 113, R_TRDMG = 114, R_TRHP = 115, R_TRSPD = 116;
const R_CNT = 119, R_BAILP = 125, R_UPAR = 47, R_ATWAR = 13;
const R_TBI = 133, R_TBIN = 134, R_FRSTOFF = 135, R_FRSTN = 136, R_FRSTP = 137;
const R_WILDCAP = 146, R_MONCAP = 147;

// TC_/JB_/IT_ 索引（units.rs L123-131/L134-167）
const TC_HP = 1, TC_DMG = 0, TC_REPRO = 5, TC_IDEA_REPRO = 18;
const JB_HP = 0, JB_DMG = 1, JB_SPD = 2, JB_W = 3;
const IT_SLOT = 11, IT_RANK = 9, IT_DMG = 7, IT_HP = 8, IT_SPDMUL = 6, IT_RARITY = 10;
// 动作/特效/事件（units.rs L12-93）
const ACT_FX = 1, ACT_SND = 3, ACT_EVT = 4, ACT_TOAST = 5, ACT_CIV = 12, ACT_SPAWN = 13, ACT_FAM_NEW = 14, ACT_FAM_MILE = 15, ACT_ITEM_DEL = 19;
const FX_HEART = 11, FX_SPAWN = 6;
const SND_COIN = 2;
const EVT_LINEAGE_FLORISH = 6, EVT_SKELETON = 10, EVT_LOOT_PICKUP = 11;
const LAW_REPRO = 1, LAW_UNDEAD_RISE = 4;
const R_SHEEP = 6, R_WOLF = 7, R_SKELETON = 16, R_ZOMBIE = 5;

function f64at2(rid, i) { return new DataView(mem.buffer).getFloat64(ex.wb_arena_ptr() + ex.wb_off(rid) + i * 8, true); }
function i32at2(rid, i) { return new DataView(mem.buffer).getInt32(ex.wb_arena_ptr() + ex.wb_off(rid) + i * 4, true); }

// —— 物品 id（宿主 pack 语义：ITEM_DEFS 键序 = 物品 id）——
const ITEM_KEYS = Object.keys(ITEM_DEFS);
function itemIdx(key) { const i = ITEM_KEYS.indexOf(key); if (i < 0) throw new Error(`item ${key} missing`); return i; }
function firstItem(pred) { const k = ITEM_KEYS.find((k2) => pred(ITEM_DEFS[k2])); if (!k) throw new Error('item not found'); return itemIdx(k); }
const GUN_ID = itemIdx('musket');
const RANK2_ID = firstItem((d) => (d.rank ?? 0) >= 2 && (d.dmg ?? 0) > 0);
const RANK1_ID = firstItem((d) => (d.rank ?? 0) === 1 && (d.dmg ?? 0) > 0);
const RARITY4_ID = firstItem((d) => (d.rarity ?? 0) === 4);

// —— TRAITS 真表（wbspatial L971-1005 宿主协议复刻：键序=id；TRDMG/TRHP/TRSPD fill(1) 后覆写）——
function traitsPool(dump) {
  const tk = Object.keys(TRAITS);
  for (let i = 0; i < 32; i++) { setF64(R_TRDMG, i, 1); setF64(R_TRHP, i, 1); setF64(R_TRSPD, i, 1); }
  tk.forEach((k, i) => {
    const t = TRAITS[k];
    if (t.dmgMul != null) setF64(R_TRDMG, i, t.dmgMul);
    if (t.hpMul != null) setF64(R_TRHP, i, t.hpMul);
    if (t.speedMul != null) setF64(R_TRSPD, i, t.speedMul);
  });
  setI32(R_TRN, 0, tk.length);
  dump.trn = tk.length;
  dump.traits = tk.map((k, i) => [TRAITS[k].dmgMul ?? 1, TRAITS[k].hpMul ?? 1, TRAITS[k].speedMul ?? 1]);
}

// —— FIRST 名池（wbspatial L726-750 宿主协议复刻：24B 定长条目 [len][bytes×23]）——
function firstPool(dump) {
  const enc = new TextEncoder();
  let cur = 0;
  for (const k of Object.keys(FIRST)) {
    const race = Number(k);
    if (race < 0 || race >= 512) continue;
    const names = FIRST[race];
    if (!names || names.length === 0) continue;
    if (cur + names.length * 24 > 16384) continue;
    setU32(R_FRSTOFF, race, cur); setU32(R_FRSTN, race, names.length);
    for (const nm of names) {
      const b = enc.encode(nm).slice(0, 23);
      const pool = new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(R_FRSTP) + cur, 24);
      pool[0] = b.length;
      pool.set(b, 1);
      cur += 24;
    }
  }
  dump.firstRaces = Object.keys(FIRST).length;
}

// —— 世界布置（每场景独立 init；MISC[1] wild 预算是 spawn 场景关键——scan initWorld 只设 MISC[0]）——
function initWorldSp(seed, fxp) {
  initWorld(seed, fxp);      // scan 版：RNGS/PAR/LAWS/FXP/ITMN/COLEN/NCTL/MISC[0]/EPS/TBT 掩码
  setI32(ID.MISC, 1, 4096);  // wild 预算（MAX_WILDLIFE）——spawn 场景必须放开，否则 wild_alive()>=0 恒拒
  // WILDCAP 放开（测试基建，非被测行为）：宿主真值 = engine.wildCapOf（sheep 240/wolf 90…），
  // 场景单位数 <10 远低于任何 cap——cap 拒绝语义由 SP02/SP03 显式 wildcaps/moncaps 布置覆盖。
  // 不放开则 cap=0 → same<cap 恒 false → 全部 wild 繁衍被拒（首跑 SP01 全种子猎取失败根因）。
  new Int32Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(R_WILDCAP), 512).fill(4096);
}

// —— 采样（spawn 全字段 + 家族/物品/BAIL/USEQ 镜像）——
const U64_FIELDS = [
  ['x', ID.UX], ['y', ID.UY], ['tx', ID.UTX], ['ty', ID.UTY],
  ['lx', R_ULX], ['ly', R_ULY],
  ['hp', ID.UHP], ['maxhp', ID.UMAXHP], ['dmg', ID.UDMG], ['speed', ID.USPEED],
  ['age', ID.UAGE], ['maxage', ID.UMAXAGE], ['kills', R_UKILLS], ['cd', ID.UCD],
  ['breath', R_UBREATH], ['hurt', ID.UHURT], ['food', ID.UFD], ['cvn', ID.UCVN],
  ['fleet', ID.UFLEET], ['bless', ID.UBLESS], ['curse', ID.UCURSE], ['fert', ID.UFERT],
  ['detour', ID.UDETOUR], ['atk', ID.UATK], ['chill', ID.UCHILL],
];
function sampleUnit(s) {
  const dv = new DataView(mem.buffer);
  const at = (id) => ex.wb_arena_ptr() + ex.wb_off(id);
  const o = {
    slot: s, race: getU32(ID.URACE, s), uid: getU32(ID.UID, s),
    dead: u8(ID.UDEAD, s), hasPanic: u8(ID.UHASPANIC, s), inf: u8(ID.UINF, s),
    boat: u8(ID.UBOAT, s), flip: u8(ID.UFLIP, s), par: u8(R_UPAR, s),
    civ: (() => dv.getInt32(at(ID.UCIV) + s * 4, true))(),
    job: (() => dv.getInt32(at(ID.UJOB) + s * 4, true))(),
    trait: (() => dv.getInt32(at(R_UTRAIT) + s * 4, true))(),
    fam: (() => dv.getInt32(at(ID.UFAM) + s * 4, true))(),
    fgn: (() => dv.getInt32(at(ID.UFGN) + s * 4, true))(),
    gln: (() => dv.getInt32(at(ID.UGLN) + s * 4, true))(),
    army: (() => dv.getInt32(at(ID.UARMY) + s * 4, true))(),
    cell: getU32(ID.UCELL, s),
    stx: (() => dv.getInt32(at(ID.USTK) + s * 4, true))(),
  };
  for (const [k, id] of U64_FIELDS) o[k] = bits(dv.getFloat64(at(id) + s * 8, true));
  o.gene = [];
  for (let g = 0; g < 4; g++) o.gene.push(bits(dv.getFloat64(at(ID.UGENE) + (s * 4 + g) * 8, true)));
  o.name = [];
  for (let g = 0; g < 32; g++) o.name.push(u8(R_UNAME, s * 32 + g));
  o.gear = [];
  for (let g = 0; g < 7; g++) o.gear.push((() => dv.getInt32(at(R_UGEAR) + (s * 7 + g) * 4, true))());
  return o;
}
function sampleTick(slots, sc) {
  const dv = new DataView(mem.buffer);
  const at = (id) => ex.wb_arena_ptr() + ex.wb_off(id);
  const units = slots.map(sampleUnit);
  const actN = getU32(ID.ACTN, 0);
  const actBase = ex.wb_arena_ptr() + ex.wb_off(ID.ACT);
  const actHex = Buffer.from(mem.buffer, actBase, Math.min(actN, 1024)).toString('hex');
  const famN = Math.min(Math.max(dv.getInt32(at(R_FAMN), true), 0), 4);
  const fams = [];
  for (let r = 0; r < famN; r++) {
    fams.push({
      id: dv.getInt32(at(R_FMID) + r * 4, true),
      race: dv.getInt32(at(R_FMRACE) + r * 4, true),
      num: [0, 1, 2, 3, 4, 5].map((k) => bits(dv.getFloat64(at(R_FMNUM) + (r * 6 + k) * 8, true))),
      name: [dv.getUint16(at(R_FMNAME) + r * 4, true), dv.getUint16(at(R_FMNAME) + r * 4 + 2, true)],
    });
  }
  const itmn = Math.max(dv.getInt32(at(ID.ITMN), true), 0);
  const items = [];
  for (let i = 0; i < Math.min(itmn, 6); i++) {
    items.push({
      k: dv.getInt32(at(R_ITMK) + i * 4, true),
      x: bits(dv.getFloat64(at(R_ITMXY) + i * 16, true)),
      y: bits(dv.getFloat64(at(R_ITMXY) + i * 16 + 8, true)),
    });
  }
  return {
    rng: getU32(ID.RNGS, 0), tick: getU32(ID.TICK, 0), actN,
    useq: getU32(R_USEQ, 0),
    dlistN: getU32(ID.DLISTN, 0), batchR: getU32(ID.BATCHR, 0), bailK: getU32(ID.BAILK, 0),
    bailS: dv.getUint32(at(ID.BAILS), true),
    bailP: [0, 1, 2, 3, 4].map((k) => bits(dv.getFloat64(at(R_BAILP) + k * 8, true))),
    famn: dv.getInt32(at(R_FAMN), true), famseq: dv.getInt32(at(R_FMSEQ), true),
    itmn, items, fams, units, actHex,
    wildSheep: dv.getInt32(at(R_WILD) + R_SHEEP * 4, true),
    wildZombie: dv.getInt32(at(R_WILD) + R_ZOMBIE * 4, true),
    wildSkeleton: dv.getInt32(at(R_WILD) + R_SKELETON * 4, true),
    wildTotal: Array.from({ length: 24 }, (_, r) => dv.getInt32(at(R_WILD) + r * 4, true)),
    cvpop0: bits(dv.getFloat64(at(R_CVPOP), true)),
    cnt4: bits(dv.getFloat64(at(R_CNT) + 4 * 8, true)),
    cnt5: bits(dv.getFloat64(at(R_CNT) + 5 * 8, true)),
    grass: bits(dv.getFloat64(at(R_GRASS), true)),
  };
}

// —— 单场景执行（批层 spawn：init→boot→civ/fam/items→units→pack→batch×ticks）——
function runSpawn(sc) {
  initWorldSp(sc.seed, sc.fxp ?? 0);
  setU8(ID.LAWS, 0, sc.laws ?? 0);
  if (sc.dayph !== undefined) setF64(R_DAYPH, 0, sc.dayph);
  if (sc.reprm !== undefined) setF64(R_REPRM, 0, sc.reprm);
  const meta = {};
  fillTerrainEx(sc.terrain ?? {});
  bootTables();
  traitsPool(meta);
  firstPool(meta);
  if (sc.civs) {
    setI32(R_CIVN, 0, sc.civs.length);
    sc.civs.forEach((c, i) => {
      setU8(R_CVAL, i, 1);
      // CVTECH = NEUTRAL_MODS 真值（宿主 pack wbspatial L904-907 语义：无科技 civ 的中性基线；
      // 不灌则 TC_REPRO=0 → boost 乘零 → civ 繁衍恒拒、TC_HP=0 → spawn max_hp=0——
      // spawn 场景走 spawn_unit 真算必需）
      setF64(R_CVTECH, i * 24 + TC_DMG, c.techDmg ?? NEUTRAL_MODS.dmg);
      setF64(R_CVTECH, i * 24 + TC_HP, c.techHp ?? NEUTRAL_MODS.hp);
      setF64(R_CVTECH, i * 24 + 2, NEUTRAL_MODS.bhp);
      setF64(R_CVTECH, i * 24 + TC_REPRO, c.techRepro ?? NEUTRAL_MODS.repro);
      setF64(R_CVTECH, i * 24 + 9, NEUTRAL_MODS.repair);
      setF64(R_CVTECH, i * 24 + 13, NEUTRAL_MODS.archer);
      setF64(R_CVTECH, i * 24 + 14, NEUTRAL_MODS.plague);
      setF64(R_CVTECH, i * 24 + 15, NEUTRAL_MODS.range);
      setF64(R_CVTECH, i * 24 + TC_IDEA_REPRO, c.techIdea ?? 0);
      if (c.pop !== undefined) setF64(R_CVPOP, i, c.pop);
      if (c.pc !== undefined) setF64(R_CVPC, i, c.pc);
      if (c.gov !== undefined) setI32(R_CVGOV, i, c.gov);
      if (c.dir !== undefined) setU8(R_CVDIR, i, c.dir);
      if (c.mkt !== undefined) setI32(R_CVMKT, i, c.mkt);
    });
  }
  if (sc.atwar) for (const [a, b] of sc.atwar) { setU8(R_ATWAR, a * MAX_CIVS + b, 1); setU8(R_ATWAR, b * MAX_CIVS + a, 1); }
  if (sc.fams) {
    sc.fams.forEach((f, i) => {
      setI32(R_FMID, i, f.id);
      setI32(R_FMRACE, i, f.race ?? 0);
      for (let k = 0; k < 6; k++) setF64(R_FMNUM, i * 6 + k, f.num?.[k] ?? 0);
      if (f.pre !== undefined) setU32(R_FMNAME, i * 2, f.pre);
      if (f.post !== undefined) setU32(R_FMNAME, i * 2 + 1, f.post);
    });
    setI32(R_FAMN, 0, sc.fams.length);
  }
  if (sc.wilds) for (const [r, n] of sc.wilds) setI32(R_WILD, r, n);
  if (sc.wildcaps) for (const [r, n] of sc.wildcaps) setI32(R_WILDCAP, r, n);
  if (sc.moncaps) for (const [r, n] of sc.moncaps) setI32(R_MONCAP, r, n);
  if (sc.spb) for (const [r, gene] of sc.spb) { for (let k = 0; k < 4; k++) setF64(R_SPB, r * 4 + k, gene[k]); setU8(R_SPBH, r, 1); }
  if (sc.cnt5 !== undefined) setF64(R_CNT, 5, sc.cnt5);
  if (sc.items) {
    sc.items.forEach((it, i) => {
      setI32(R_ITMK, i, typeof it.k === 'string' ? itemIdx(it.k) : it.k);
      setF64(R_ITMXY, i * 2, it.x);
      setF64(R_ITMXY, i * 2 + 1, it.y);
    });
    setI32(ID.ITMN, 0, sc.items.length);
  }
  for (const u of sc.units) putUnitSp(u.slot, u);
  const useq0 = getU32(R_USEQ, 0);
  let liveN = sc.units.length;
  ex.wb_pack_end(liveN);
  const ticks = [];
  for (let t = 0; t < sc.ticks; t++) {
    const rc = ex.wb_units_batch(0, 0);
    const spawned = getU32(R_USEQ, 0) - useq0; // 累计成功 spawn（USEQ 差值协议）
    liveN = sc.units.length + spawned;
    const slots = [...sc.units.map((u) => u.slot), ...Array.from({ length: spawned }, (_, k) => sc.units.length + k)];
    ticks.push({ rc, spawned, ...sampleTick(slots, sc) });
    setU8(ID.PAR, 0, u8(ID.PAR, 0) ^ 1);
    for (let s = 0; s < liveN; s++) {
      if (u8(ID.UDEAD, s)) continue;
      const x = getF64(ID.UX, s), y = getF64(ID.UY, s);
      setU32(ID.UCELL, s, Math.floor(y / 4) * 256 + Math.floor(x / 4));
      setU8(R_UPAR, s, u8(ID.PAR, 0));
    }
    ex.wb_pack_end(liveN);
  }
  return { name: sc.name, seed: sc.seed, input: sc, meta, output: ticks };
}

// —— spawn 场景单位布置（putUnitC 基础上补写：UNAME/UFERT/UGENE 自定义/UFAM/UFGN/UMAXAGE）——
function putUnitSp(slot, u) {
  putUnitC(slot, u);
  if (u.name !== undefined) {
    const b = new TextEncoder().encode(u.name).slice(0, 31);
    for (let i = 0; i < 32; i++) setU8(R_UNAME, slot * 32 + i, i < b.length ? b[i] : 0);
    setU8(R_UNAME, slot * 32 + 31, b.length);
  }
  if (u.fert !== undefined) setF64(ID.UFERT, slot, u.fert);
  if (u.gene !== undefined) for (let g = 0; g < 4; g++) setF64(ID.UGENE, slot * 4 + g, u.gene[g]);
  if (u.fam !== undefined) setI32(ID.UFAM, slot, u.fam);
  if (u.fgn !== undefined) setI32(ID.UFGN, slot, u.fgn);
  if (u.maxage !== undefined) setF64(ID.UMAXAGE, slot, u.maxage);
}

export { runSpawn, initWorldSp, traitsPool, firstPool, sampleUnit, sampleTick, itemIdx, actHas, putUnitSp };

// ============ 场景集（M-U2d 繁衍收尸全覆盖）============
const GRASS = { base: T.GRASS };
const SNOW = { base: T.SNOW };
const SAND = { base: T.SAND };
void SAND;

const SCENARIOS = [
  // —— 繁衍出生（wild/civ 双支 + spawn_unit 全字段写入）——
  // 拒绝类场景 hunt 判别：mulberry32 状态链线性自增（RNGS 存自增后 state，units.rs L206-211）
  // → rngStepsFrom 重放得绝对消耗数；拒绝路径 = 漫游 2 + rng1 + rng2 = 4（cap/pop 检查在 rng2 后）
  { name: 'SP01-wild-repro-birth', seed: 0, ticks: 2, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].spawned === 1,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5 }] },
  { name: 'SP02-wild-cap-reject', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO,
    hunt: (t, sc, sd) => t[0].spawned === 0 && rngStepsFrom(sd, t[0].rng) === 4,
    wildcaps: [[R_SHEEP, 1]], wilds: [[R_SHEEP, 1]],
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5 }] },
  { name: 'SP03-mon-cap-reject', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO,
    hunt: (t, sc, sd) => t[0].spawned === 0 && rngStepsFrom(sd, t[0].rng) === 4,
    moncaps: [[R_SHEEP, 1]], wilds: [[R_SHEEP, 1]],
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5 }] },
  { name: 'SP04-civ-repro-birth', seed: 0, ticks: 2, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    civs: [{ pop: 10, pc: 20, dir: 1 }],
    hunt: (t) => t[0].spawned === 1,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5 },
            { slot: 1, race: R.DRAGON, x: 200.5, y: 140.5 }] }, // 龙哨兵（repro=0 hostile）→ skipTail=true 避和平尾 civ 段（M-U3 桩域）
  { name: 'SP05-civ-popcap-reject', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO,
    civs: [{ pop: 30, pc: 20 }],
    hunt: (t, sc, sd) => t[0].spawned === 0 && rngStepsFrom(sd, t[0].rng) >= 4,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5 },
            { slot: 1, race: R.DRAGON, x: 200.5, y: 140.5 }] },
  // —— boost 修饰因子（panic/fert/gene.r/atwar）——
  { name: 'SP06-repro-panic', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO,
    hunt: (t, sc, sd) => t[0].spawned === 0 && rngStepsFrom(sd, t[0].rng) === 4,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5, panic: 0.9 }] },
  { name: 'SP07-repro-fert', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].spawned === 1,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5, fert: 1 }] },
  { name: 'SP08-repro-gene-r', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO,
    hunt: (t, sc, sd) => t[0].spawned === 0 && rngStepsFrom(sd, t[0].rng) === 4,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5, gene: [1, 1, 1, 0.4] }] },
  { name: 'SP09-repro-atwar', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, civs: [{}, {}], atwar: [[0, 1]],
    hunt: (t, sc, sd) => t[0].spawned === 0 && rngStepsFrom(sd, t[0].rng) >= 4,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5 },
            { slot: 1, race: R.DRAGON, x: 200.5, y: 140.5 }] },
  // —— 捕食者食物门（food_ok 短路 → rng2 不消耗；短路语义由 C# 机械翻译保真）——
  { name: 'SP10-pred-hungry-reject', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO,
    hunt: (t) => t[0].spawned === 0,
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5, food: 20 }] },
  { name: 'SP11-pred-full-birth', seed: 0, ticks: 2, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].spawned === 1,
    units: [{ slot: 0, race: R.WOLF, x: 40.5, y: 80.5, food: 100 }] },
  // —— 涌现特质 BAIL（极端基因 → TS 接管；civ/wild 双支 BAILP[4] 分化）——
  { name: 'SP12-emergent-bail-wild', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].batchR === 2,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5, gene: [1, 1.6, 1, 1] }] },
  { name: 'SP13-emergent-bail-civ', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    civs: [{ pop: 10, pc: 20 }],
    hunt: (t) => t[0].batchR === 2,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, gene: [1, 1.6, 1, 1] }] },
  { name: 'SP14-emergent-fail-birth', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].spawned === 1 && t[0].batchR === 1,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5, gene: [1, 1.6, 1, 1] }] },
  // —— child_gene 地形修正（雪地 gene[2] 增幅）——
  { name: 'SP15-childgene-snow', seed: 0, ticks: 1, terrain: SNOW, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].spawned === 1,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5 }] },
  // —— 特质掷骰（TRAITS 真表；15% 掷中/未中双分支）——
  { name: 'SP16-trait-roll', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].spawned === 1 && t[0].units[1].trait !== -2,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5 }] },
  { name: 'SP17-trait-miss', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].spawned === 1 && t[0].units[1].trait === -2,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5 }] },
  // —— 重名罗马数字后缀（unique_name 重名统计 + roman(4)；Wooly×2 全等 + Wooly II 前缀匹配 → n=3）——
  { name: 'SP18-name-roman', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    hunt: (t) => t[0].spawned === 1,
    units: [
      { slot: 0, race: R.SHEEP, x: 40.5, y: 80.5, name: 'Wooly' },
      { slot: 1, race: R.SHEEP, x: 42.5, y: 81.5, name: 'Wooly' },
      { slot: 2, race: R.SHEEP, x: 44.5, y: 82.5, name: 'Wooly II' },
    ] },
  // —— 家族继承 + 里程碑（fam>=0 → fgn+1 + FMNUM++ + ACT_FAM_MILE）——
  { name: 'SP19-fam-inherit', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    fams: [{ id: 7, race: R_SHEEP, num: [5, 0, 5, 0, 0, 1] }],
    hunt: (t) => t[0].spawned === 1,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5, fam: 7, fgn: 1 }] },
  { name: 'SP20-fam-milestone12', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12,
    fams: [{ id: 7, race: R_SHEEP, num: [11, 0, 11, 0, 0, 1] }],
    hunt: (t) => t[0].spawned === 1 && actHas(t[0].actHex, ACT_EVT, EVT_LINEAGE_FLORISH),
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5, fam: 7, fgn: 1 }] },
  // —— fam_for_child 25% 开宗（new_family 全量：FMSEQ/FMNAME/founded/CNT[5]）——
  { name: 'SP21-fam-new', seed: 0, ticks: 1, terrain: GRASS, laws: LAW_REPRO, reprm: 12, cnt5: 42,
    hunt: (t) => t[0].famn === 1 && t[0].spawned === 1,
    units: [{ slot: 0, race: R.SHEEP, x: 40.5, y: 80.5 }] },
  // —— rise_skeleton（civ 老死 + LAW_UNDEAD_RISE 0.08 掷 → spawn 骷髅 + 0.12 EVT；
  //      死亡分支在和平尾之前 return → 无桩域风险，无需哨兵）——
  { name: 'SP22-rise-skeleton', seed: 0, ticks: 2, terrain: GRASS, laws: LAW_UNDEAD_RISE,
    civs: [{ pop: 10, pc: 20 }],
    hunt: (t) => t[0].spawned === 1 && t[0].units[0].dead === 1 && t[0].units[1].race === R_SKELETON,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, maxage: 0.04 }] },
  // —— try_pickup（rank 比较/换装 splice/稀有度播报；拾取门 0.9 受漫游影响 → hunt 锁定；
  //      龙哨兵避和平尾 civ 段）——
  { name: 'SP23-pickup-basic', seed: 0, ticks: 1, terrain: GRASS, civs: [{}],
    hunt: (t) => t[0].itmn === 0 && t[0].units[0].gear[0] === RANK2_ID,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5 },
            { slot: 1, race: R.DRAGON, x: 200.5, y: 140.5 }],
    items: [{ k: RANK2_ID, x: 40.5, y: 80.5 }] },
  { name: 'SP24-pickup-swap', seed: 0, ticks: 1, terrain: GRASS, civs: [{}],
    hunt: (t) => t[0].itmn === 0 && t[0].units[0].gear[0] === RANK2_ID,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, gear: [RANK1_ID] },
            { slot: 1, race: R.DRAGON, x: 200.5, y: 140.5 }],
    items: [{ k: RANK2_ID, x: 40.5, y: 80.5 }] },
  { name: 'SP25-pickup-skip', seed: 0, ticks: 1, terrain: GRASS, civs: [{}],
    hunt: (t) => t[0].itmn === 1 && t[0].units[0].gear[0] === RANK2_ID,
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5, gear: [RANK2_ID] },
            { slot: 1, race: R.DRAGON, x: 200.5, y: 140.5 }],
    items: [{ k: RANK1_ID, x: 40.5, y: 80.5 }] },
  { name: 'SP26-pickup-rarity4', seed: 0, ticks: 1, terrain: GRASS, civs: [{}],
    hunt: (t) => actHas(t[0].actHex, ACT_EVT, EVT_LOOT_PICKUP),
    units: [{ slot: 0, race: R.HUMAN, civ: 0, x: 40.5, y: 80.5 },
            { slot: 1, race: R.DRAGON, x: 200.5, y: 140.5 }],
    items: [{ k: RARITY4_ID, x: 40.5, y: 80.5 }] },
];

// ============ 执行（直接执行或经 run-node-ts runner 时运行；export 供调试脚本 import）============
if (import.meta.main || (process.env.WB_GEN_MAIN === '1' && process.env.WB_GEN_TARGET === 'gen-units-spawn.mjs')) {
  main();
}

function main() {
  console.log(`items: n=${ITEM_KEYS.length} rank1=${RANK1_ID} rank2=${RANK2_ID} rarity4=${RARITY4_ID} gun=${GUN_ID}`);
  console.log(`traits: n=${Object.keys(TRAITS).length} keys=${Object.keys(TRAITS).join(',')}`);
  for (const sc of SCENARIOS) {
    if (sc.hunt && sc.seed === 0) {
      sc.seed = pickSeedSpawn(sc);
      console.log(`  hunt ${sc.name}: seed=0x${sc.seed.toString(16)}`);
    }
  }
  const results = SCENARIOS.map(runSpawn);

  // —— 双跑确定性 ——
  for (const sc of SCENARIOS) {
    const a = JSON.stringify(runSpawn(sc));
    const b = JSON.stringify(runSpawn(sc));
    if (a !== b) throw new Error(`determinism FAIL: ${sc.name}`);
  }
  console.log(`determinism: PASS (${SCENARIOS.length} scenarios × 2 runs)`);

  sanity(results);

  // —— 入库 ——
  const out = {
    meta: {
      gen: 'gen-units-spawn.mjs', job: 2902286, slice: 'M-U2d',
      W, H, TILES, MAX_RACES, MAX_CIVS,
      regionIds: ID, eps: EP_KEYS.map((k) => ep(k)), epKeys: EP_KEYS,
      items: { keys: ITEM_KEYS, rank1: RANK1_ID, rank2: RANK2_ID, rarity4: RARITY4_ID },
      tc: { hp: TC_HP, dmg: TC_DMG, repro: TC_REPRO, ideaRepro: TC_IDEA_REPRO },
      jb: { hp: JB_HP, dmg: JB_DMG, spd: JB_SPD, w: JB_W },
      it: { slot: IT_SLOT, rank: IT_RANK, dmg: IT_DMG, hp: IT_HP, spdmul: IT_SPDMUL, rarity: IT_RARITY },
      acts: { fx: ACT_FX, snd: ACT_SND, evt: ACT_EVT, toast: ACT_TOAST, civ: ACT_CIV, spawn: ACT_SPAWN, famNew: ACT_FAM_NEW, famMile: ACT_FAM_MILE, itemDel: ACT_ITEM_DEL },
      fxs: { heart: FX_HEART, spawn: FX_SPAWN },
      evts: { lineageFlorish: EVT_LINEAGE_FLORISH, skeleton: EVT_SKELETON, lootPickup: EVT_LOOT_PICKUP },
      laws: { repro: LAW_REPRO, undeadRise: LAW_UNDEAD_RISE },
      snd: { coin: SND_COIN },
      races: { sheep: R_SHEEP, wolf: R_WOLF, zombie: R_ZOMBIE, skeleton: R_SKELETON },
      boot: null,
      trn: Object.keys(TRAITS).length,           // TRAITS 池长（spawn_unit trait pick 依赖；黄金 meta 必须携带——首轮 T2 NUnit 因缺此表 C# TRN=0 少掷 pick 导致 RNG 流分歧）
      traits: Object.keys(TRAITS).map((k) => [TRAITS[k].dmgMul ?? 1, TRAITS[k].hpMul ?? 1, TRAITS[k].speedMul ?? 1]),
      firstPool: FIRST,          // FIRST 名池真表（C# NUnit UTF8 编码 24B 条目用；纪律②随黄金分发零手抄）
      neutralMods: NEUTRAL_MODS, // CVTECH 中性基线（C# NUnit 布置 civs 用）
      note: 'f64 全 bits(hex)。boot 表复用 gen-units-combat（meta.boot 见 units_combat.json）；新增 TRAITS 真表键序 + FIRST 名池 24B 条目灌入。驱动协议 live 追踪 = USEQ 差值（spawn 成功恰好 +1）。蓝本 units.rs L1813-2041 spawn_unit + L3267-3340 繁衍 + L3429-3539 try_pickup + L737-985 家族族。',
    },
    scenarios: results,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log(`golden: ${OUT} (${(JSON.stringify(out).length / 1024).toFixed(1)} KB)`);
  for (const r of results) {
    const t = r.output.at(-1);
    console.log(`  ${r.name}: seed=0x${r.seed.toString(16)} rng=${t.rng.toString(16)} actN=${t.actN} spawned@0=${r.output[0].spawned}`);
  }
}

// —— spawn 版种子猎取（runSpawn 驱动；catch bail/rc 异常种子跳过）——
// hunt 回调签名 (output, sc, seed)：拒绝类场景用 rngDiff 做相对判别（基准 = 同种子 laws=0）
function pickSeedSpawn(sc) {
  for (let sd = 1; sd < 4096; sd++) {
    try {
      if (sc.hunt(runSpawn({ ...sc, seed: sd }).output, sc, sd)) return sd;
    } catch { /* 异常种子跳过 */ }
  }
  throw new Error(`pickSeed FAIL: ${sc.name}`);
}

// mulberry32 状态链重放（RNGS 存自增后 state = seed + n*0x6D2B79F5 mod 2^32，units.rs L206-211）
// → 消耗次数精确可判别（hunt 相对判别基础；非线性输出下减法无效——本会话已验证）
function rngStepsFrom(seed, finalState) {
  let st = seed >>> 0;
  const fin = finalState >>> 0;
  for (let n = 1; n <= 4096; n++) {
    st = (st + 0x6d2b79f5) >>> 0;
    if (st === fin) return n;
  }
  return -1;
}

function nameOf(u) { return u.name.map((b, i) => (i < u.name[31] ? String.fromCharCode(b) : '')).join(''); }
function sanity(results) {
  const T0 = (name) => {
    const r = results.find((x) => x.name === name);
    if (!r) throw new Error(`missing ${name}`);
    return r.output[0];
  };
  for (const r of results) {
    for (const tk of r.output) {
      const bad = tk.rc !== 1 && tk.rc !== 2;
      if (bad) throw new Error(`${r.name} tick rc=${tk.rc} bail=${tk.bailK}`);
    }
  }
  { const t = T0('SP01-wild-repro-birth');
    if (t.spawned !== 1) throw new Error('SP01 no birth');
    const nb = t.units[1];
    if (nb.race !== R_SHEEP) throw new Error('SP01 newborn race');
    if (nb.civ !== -1) throw new Error('SP01 newborn civ');
    if (nb.uid !== t.useq - 1) throw new Error('SP01 uid != USEQ-1');
    if (nb.par !== (nb.uid + 1) % 2) throw new Error('SP01 par != (id+1)%2');
    if (!actHas(t.actHex, ACT_SPAWN)) throw new Error('SP01 no ACT_SPAWN');
    if (!actHas(t.actHex, ACT_FX, FX_HEART)) throw new Error('SP01 no heart fx');
    if (t.wildSheep !== 1) throw new Error('SP01 wildSheep != 1');
    // fam：-1 无家族；6% spawn 内开宗 → fgn=1；25% fam_for_child 开宗 → fgn=2（均合法）
    if (nb.fam < -1) throw new Error('SP01 newborn fam invalid');
    if (nb.fam >= 0 && (nb.fgn < 1 || t.famn < 1)) throw new Error('SP01 newborn family-link inconsistent');
    if (nb.gear.some((g) => g !== -1)) throw new Error('SP01 newborn gear not all -1');
    if (nb.food !== bits(F_NAN)) throw new Error('SP01 newborn UFD != NaN');
    if (nb.cvn !== bits(F_NAN)) throw new Error('SP01 newborn UCVN != NaN');
    if (nb.stx !== -2147483648) throw new Error('SP01 newborn USTK != i32::MIN sentinel');
    const nm = nameOf(nb);
    if (!nm.length) throw new Error('SP01 newborn name empty');
    if (!FIRST[R_SHEEP].some((n) => nm.startsWith(n))) throw new Error(`SP01 name not from FIRST[6]: ${nm}`);
  }
  { const t = T0('SP02-wild-cap-reject'); if (t.spawned !== 0) throw new Error('SP02 wildcap not enforced'); }
  { const t = T0('SP03-mon-cap-reject'); if (t.spawned !== 0) throw new Error('SP03 moncap not enforced'); }
  { const t = T0('SP04-civ-repro-birth');
    if (t.spawned !== 1) throw new Error('SP04 no birth');
    const nb = t.units[2]; // units[1] = 龙哨兵
    if (nb.civ !== 0) throw new Error('SP04 newborn civ');
    if (nb.job < 0) throw new Error('SP04 job not rolled');
    if (t.cvpop0 === bits(10)) throw new Error('SP04 cvpop not incremented (civ_delta)');
    if (!actHas(t.actHex, ACT_CIV)) throw new Error('SP04 no ACT_CIV');
  }
  { const t = T0('SP05-civ-popcap-reject'); if (t.spawned !== 0) throw new Error('SP05 popcap not enforced'); }
  { const t = T0('SP10-pred-hungry-reject'); if (t.spawned !== 0) throw new Error('SP10 hungry predator gave birth'); }
  { const t = T0('SP11-pred-full-birth'); if (t.spawned !== 1) throw new Error('SP11 full predator no birth'); }
  { const t = T0('SP12-emergent-bail-wild');
    if (t.batchR !== 2 || t.bailK !== 2) throw new Error('SP12 no BAIL_EMERGENT');
    if (t.bailP[4] !== bits(0)) throw new Error('SP12 wild bailP[4] != 0');
    if (t.bailP[1] === bits(1.6)) throw new Error('SP12 bailP should carry mutated gene (not raw)'); }
  { const t = T0('SP13-emergent-bail-civ');
    if (t.batchR !== 2 || t.bailK !== 2) throw new Error('SP13 no BAIL_EMERGENT');
    if (t.bailP[4] !== bits(1)) throw new Error('SP13 civ bailP[4] != 1'); }
  { const t = T0('SP14-emergent-fail-birth'); if (t.spawned !== 1) throw new Error('SP14 emergent-gate pass no birth'); }
  { const t = T0('SP15-childgene-snow');
    const nb = t.units[1];
    const f64of = (h) => new Float64Array(new BigUint64Array([BigInt(h)]).buffer)[0];
    if (!(f64of(nb.gene[2]) > 1.0)) throw new Error('SP15 snow gene[2] not boosted'); }
  { const t = T0('SP16-trait-roll');
    const nb = t.units[1];
    if (nb.trait < 0) throw new Error('SP16 trait not rolled');
    if (nb.maxhp !== nb.hp) throw new Error('SP16 newborn hp != maxhp (spawn 语义)'); }
  { const t = T0('SP17-trait-miss');
    if (t.units[1].trait !== -2) throw new Error('SP17 trait should be -2 (unspecified)'); }
  { const t = T0('SP18-name-roman');
    const nb = t.units[3];
    const nm = nameOf(nb);
    // 重名统计：Wooly(全等) + Wooly(全等) + Wooly II(前缀空格匹配) → n=3 → roman(4)='IV'
    if (nm !== 'Wooly IV') throw new Error(`SP18 name != 'Wooly IV': ${nm}`); }
  { const t = T0('SP19-fam-inherit');
    const nb = t.units[1];
    if (nb.fam !== 7) throw new Error('SP19 fam not inherited');
    if (nb.fgn !== 2) throw new Error('SP19 fgn != fgn0+1');
    if (t.fams[0].num[0] !== bits(6)) throw new Error('SP19 FMNUM members != 6');
    if (!actHas(t.actHex, ACT_FAM_MILE)) throw new Error('SP19 no ACT_FAM_MILE'); }
  { const t = T0('SP20-fam-milestone12');
    if (t.fams[0].num[0] !== bits(12)) throw new Error('SP20 members != 12');
    if (t.fams[0].num[2] !== bits(12)) throw new Error('SP20 peak != 12');
    // 蓝本 stride 混用位精确：ms 读@row*5+3（=num[3] 布置值 0 不变），写@row*6+4（=num[4]）
    if (t.fams[0].num[4] !== bits(1)) throw new Error('SP20 ms write != 1');
    if (!actHas(t.actHex, ACT_EVT, EVT_LINEAGE_FLORISH)) throw new Error('SP20 no lineage evt'); }
  { const t = T0('SP21-fam-new');
    if (t.famn !== 1) throw new Error('SP21 no new family');
    if (t.fams[0].id !== 0) throw new Error('SP21 fam id != 0 (FMSEQ)');
    if (t.fams[0].race !== R_SHEEP) throw new Error('SP21 fam race');
    // 双重计数位精确：fam_for_child 25% 开宗 members=1 → spawn 继承分支 FMNUM++ → 2
    if (t.fams[0].num[0] !== bits(2)) throw new Error('SP21 fam members != 2');
    if (t.fams[0].num[5] !== bits(42)) throw new Error('SP21 founded != CNT[5]=42');
    if (!actHas(t.actHex, ACT_FAM_NEW)) throw new Error('SP21 no ACT_FAM_NEW');
    const nb = t.units[1];
    if (nb.fam !== 0 || nb.fgn < 1) throw new Error('SP21 founder not linked'); }
  { const t = T0('SP22-rise-skeleton');
    if (t.units[0].dead !== 1) throw new Error('SP22 elder not dead');
    if (t.units[1].race !== R_SKELETON) throw new Error('SP22 no skeleton');
    if (t.wildSkeleton !== 1) throw new Error('SP22 wildSkeleton != 1');
    if (!actHas(t.actHex, ACT_FX, FX_SPAWN)) throw new Error('SP22 no spawn fx'); }
  { const t = T0('SP23-pickup-basic');
    const u = t.units[0];
    if (t.itmn !== 0) throw new Error('SP23 item not spliced');
    if (u.gear[0] !== RANK2_ID) throw new Error('SP23 gear not set');
    const def = ITEM_DEFS[ITEM_KEYS[RANK2_ID]];
    if (def.dmg && u.dmg === bits(5)) throw new Error('SP23 dmg not buffed');
    if (!actHas(t.actHex, ACT_ITEM_DEL)) throw new Error('SP23 no ACT_ITEM_DEL');
    if (!actHas(t.actHex, ACT_SND, SND_COIN)) throw new Error('SP23 no coin snd'); }
  { const t = T0('SP24-pickup-swap');
    const u = t.units[0];
    if (u.gear[0] !== RANK2_ID) throw new Error('SP24 gear not swapped');
    if (t.itmn !== 0) throw new Error('SP24 item not spliced'); }
  { const t = T0('SP25-pickup-skip');
    if (t.itmn !== 1) throw new Error('SP25 low-rank item picked');
    if (t.units[0].gear[0] !== RANK2_ID) throw new Error('SP25 gear polluted'); }
  { const t = T0('SP26-pickup-rarity4');
    if (!actHas(t.actHex, ACT_TOAST)) throw new Error('SP26 no toast');
    if (!actHas(t.actHex, ACT_EVT, EVT_LOOT_PICKUP)) throw new Error('SP26 no loot evt'); }
  console.log('sanity: PASS (birth/budget/boost/emergent/trait/name/family/skeleton/pickup)');
}
