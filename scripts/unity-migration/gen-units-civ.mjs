#!/usr/bin/env node
// ============================================================
// M-U3a 文明切片黄金向量生成器（Job 2902286）
// 真实现 = public/wasm/wbcore.wasm（位精确权威蓝本，纪律②零同源复制）
// 蓝本段：rust-core/src/units.rs L401-419 fire_clear
//         L1187-1517 建筑辅助族全量（fire_near/extinguish_fire/damaged_near/
//         enemy_building_near/nearest_enemy_building/nearest_building_of/
//         repair_building/dmg_set_add/dmg_set_del/attack_building）
//         L2976-3141 和平尾 civ 段（M-U2d 骨架的真输入版）
// 布置协议（wbspatial.ts 宿主协议复刻）：
//   OWN 全表 -1 预填（engine L161 Int16Array.fill(-1)，建筑格覆写 civ）——
//     fire_near 的 own 判定读 OWN[i]==uciv，零初始化会让 civ0 视全域为己有；
//   WP_BLD L935-955：BLDN/BLDI/BLDXY/BLDC/BLDHP 按行写 + BLDK[tile]=kind +
//     DMGN/DMGL 有序镜像 + TBHP[k]=BUILDING_DEFS[k].hp（k=1..10，kind=11 城墙
//     不灌——宿主循环 1..10 原样复刻）；
//   CIV 段 L899-911：CIVN/CVAL/CVCAP/CVMKT/CVTECH（[2]=bhp/[9]=repair，缺省 1=NEUTRAL_MODS）；
//   FIRE：FIREG[tile]=1 + FIREN=count（fire_near 顶部 FIREN==0 早退）；
//   CNT L119 f64×16：[0]=firesOut/[1]=firesOutLast/[2]=repairsDone/[3]=repairLast
//     —— 节流门（≥3 且 tick-last>480 / ≥6 且 tick-last>720）场景预置；
//   wb_pack_end 重建 BIDX（lib.rs L943-958）→ 布置必须在首次 pack_end 前完成。
// 坐标语义（蓝本差异，场景设计关键）：
//   fire_near/damaged_near/repair 用「格中心 +0.5」距离；enemy_building_near/
//   nearest_enemy_building/nearest_building_of/march 掷点用 BLDXY「裸格坐标」。
// 用法: node scripts/unity-migration/run-node-ts.mjs scripts/unity-migration/gen-units-civ.mjs
// 输出: scripts/unity-migration/golden/units_civ.json（f64 全 bits）
// ============================================================
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { T, BUILDING_DEFS } from '../../src/lib/game/types.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import {
  W, H, TILES, MAX_CIVS, ID, ex, mem,
  bits, F_NAN, initWorld, setU8, setI32, setF64, setU32, getF64, getU32, getI32, u8,
} from './gen-units-scan.mjs';
import { bootTables, putUnitC, fillTerrainEx, actHas } from './gen-units-combat.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'scripts/unity-migration/golden/units_civ.json');

// ep 键序（wbspatial.ts L505-506；与 units.rs EP_* 一致）
const EP_KEYS = ['pop.reproMul', 'eco.regrowBase', 'eco.grazeRate', 'fire.spreadMul', 'fire.damage', 'war.declareRate', 'war.tensionDecay', 'war.milPressure', 'evo.mutationRate', 'social.panicDecay', 'social.panicRout', 'social.grudgeDecay', 'nature.quakeStress', 'nature.stormRate', 'nature.erosionRate'];

// —— 区域 id（显式 const 权威 lib.rs L148-260；数字字面量防 wb_off(undefined)→0 隐形炸弹）——
const R_CIVN = 67, R_CVPOP = 68, R_CVHOU = 69, R_CVGLD = 70, R_CVCAP = 71, R_CVAL = 72, R_CVTECH = 74, R_CVMKT = 77;
const R_BLDN = 84, R_BLDI = 85, R_BLDXY = 86, R_BLDC = 87, R_BLDHP = 88, R_BLDDMG = 89;
const R_CNT = 119, R_DMGL = 143, R_DMGN = 144, R_FIREN = 145, R_TBHP = 149;
const R_ATWAR = 13, R_UPAR = 47;
const R_BLDK = 64, R_OWN = 65, R_BIDX = 66, R_FIREG = 61;

// TC 索引（units.rs L123-131；CVTECH 24 槽/civ）
const TC_BHP = 2, TC_REPAIR = 9;
// 动作/事件/特效（units.rs L12-93）
const ACT_FX = 1, ACT_EVT = 4, ACT_BHP = 9, ACT_DMG_ADD = 10, ACT_CIV = 12;
const FX_WATER = 3, FX_HAMMER = 4, FX_HIT = 5, FX_SPAWN = 6, FX_COIN = 12, FX_ARROW = 16;
const EVT_FIREOUT = 7, EVT_REPAIR = 8;
const BAIL_ATTACK_DEST = 3, BAIL_CARAVAN = 4;

const HUMAN = 0; // R.HUMAN（CIV_RACES[0]）
const TI = (x, y) => y * W + x; // idx(x,y)=y*W+x（units.rs L193；i%W=x, i/W=y）

// —— i16 写（OFF_OWN 是 Int16 区，wbspatial L681）——
function setI16(id, i, v) {
  const a = ex.wb_arena_ptr() + ex.wb_off(id);
  new DataView(mem.buffer).setInt16(a + i * 2, v | 0, true);
}
function i32at(rid, i) { return new DataView(mem.buffer).getInt32(ex.wb_arena_ptr() + ex.wb_off(rid) + i * 4, true); }
function f64at(rid, i) { return new DataView(mem.buffer).getFloat64(ex.wb_arena_ptr() + ex.wb_off(rid) + i * 8, true); }
function bitsAt(rid, i) { return bits(f64at(rid, i)); }

// ============================================================
// 布置协议
// ============================================================

// TBHP 引导表（wbspatial L828-829 宿主协议：k=1..10；BUILDING_DEFS 真表 import，纪律②）
function putTbhp() {
  for (let k = 1; k <= 10; k++) setF64(R_TBHP, k, BUILDING_DEFS[k]?.hp ?? 70);
}

// OWN 全表 -1（engine L161 宿主语义：无主格=-1；fire_near own 判定的分母）
function fillOwnNeg1() {
  const own = new Int16Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(R_OWN), TILES);
  own.fill(-1);
}

// 建筑布置（WP_BLD L935-955 协议）：行序即 BLDI 序；tile 落 BLDK/OWN
// blds: [{x, y, kind, civ, hp?}]（hp 缺省 = round(def.hp * bhp)——宿主 bHp.get ?? 语义）
function putBuildings(blds, techBhp) {
  setI32(R_BLDN, 0, blds.length);
  blds.forEach((b, r) => {
    const t = TI(b.x, b.y);
    setI32(R_BLDI, r, t);
    setI32(R_BLDXY, r * 2, b.x);
    setI32(R_BLDXY, r * 2 + 1, b.y);
    setI32(R_BLDC, r, b.civ);
    const def = BUILDING_DEFS[b.kind];
    const hp = b.hp !== undefined ? b.hp : Math.round((def?.hp ?? 70) * (techBhp ?? 1));
    setF64(R_BLDHP, r, hp);
    setU8(R_BLDK, t, b.kind);
    setI16(R_OWN, t, b.civ);
  });
}

// 火格布置：FIREG[tile]=1 + FIREN=count（fire_near 顶部 FIREN==0 早退——计数必须同步）
function putFires(tiles) {
  for (const t of tiles) setU8(R_FIREG, t, 1);
  setI32(R_FIREN, 0, tiles.length);
}

// 损坏集镜像（WP_BLD L947-954：DMGL 有序，DMGN 计数）
function putDamaged(tiles) {
  tiles.forEach((t, k) => setI32(R_DMGL, k, t));
  setI32(R_DMGN, 0, tiles.length);
}

// 文明表布置（CIV 段 L899-911 协议）
// civs: [{alive?, cap?, mkt?, bhp?, repair?}]（bhp/repair 缺省 1 = NEUTRAL_MODS）
function putCivs(civs) {
  setI32(R_CIVN, 0, civs.length);
  civs.forEach((c, i) => {
    setU8(R_CVAL, i, c.alive === undefined ? 1 : (c.alive ? 1 : 0));
    if (c.cap !== undefined) setI32(R_CVCAP, i, c.cap);
    if (c.mkt !== undefined) setI32(R_CVMKT, i, c.mkt);
    setF64(R_CVTECH, i * 24 + TC_BHP, c.bhp ?? 1);
    setF64(R_CVTECH, i * 24 + TC_REPAIR, c.repair ?? 1);
  });
}

// CNT 预置（[0]=firesOut/[1]=firesOutLast/[2]=repairsDone/[3]=repairLast）
function putCnt(cnt) {
  if (!cnt) return;
  cnt.forEach((v, i) => { if (v !== undefined) setF64(R_CNT, i, v); });
}

// ============================================================
// 采样（每 tick 全量：单位字段 + BLD/FIRE/DMG/CNT/CIV 状态 + ACT hex）
// ============================================================
const F64_FIELDS = [
  ['x', ID.UX], ['y', ID.UY], ['tx', ID.UTX], ['ty', ID.UTY], ['cd', ID.UCD], ['atk', ID.UATK],
  ['cvn', ID.UCVN], ['dmg', ID.UDMG], ['hp', ID.UHP],
];
function sampleTick(slots, sc) {
  const dv = new DataView(mem.buffer);
  const at = (id) => ex.wb_arena_ptr() + ex.wb_off(id);
  const units = slots.map((s) => {
    const o = { slot: s, race: getU32(ID.URACE, s), dead: u8(ID.UDEAD, s), job: i32at(ID.UJOB, s), flip: u8(ID.UFLIP, s) };
    for (const [k, id] of F64_FIELDS) o[k] = bits(dv.getFloat64(at(id) + s * 8, true));
    return o;
  });
  const bldn = i32at(R_BLDN, 0);
  const blds = [];
  for (let r = 0; r < bldn; r++) {
    blds.push({ tile: i32at(R_BLDI, r), civ: i32at(R_BLDC, r), hp: bitsAt(R_BLDHP, r) });
  }
  const dmgn = i32at(R_DMGN, 0);
  const dmgl = [];
  for (let k = 0; k < dmgn; k++) dmgl.push(i32at(R_DMGL, k));
  const actN = getU32(ID.ACTN, 0);
  const actHex = Buffer.from(mem.buffer, at(ID.ACT), Math.min(actN, 512)).toString('hex');
  const out = {
    rng: getU32(ID.RNGS, 0), tick: getU32(ID.TICK, 0), actN,
    dlistN: getU32(ID.DLISTN, 0), batchR: getU32(ID.BATCHR, 0), bailK: getU32(ID.BAILK, 0),
    fireN: i32at(R_FIREN, 0), bldn, blds, dmgn, dmgl,
    cnt: [0, 1, 2, 3].map((i) => bitsAt(R_CNT, i)),
    cvgld0: bitsAt(R_CVGLD, 0), cvgld1: bitsAt(R_CVGLD, 1),
    units, actHex,
  };
  if (sc?.fireProbe) out.fireG = sc.fireProbe.map((t) => u8(R_FIREG, t));
  if (sc?.bidxProbe) out.bidx = sc.bidxProbe.map((t) => i32at(R_BIDX, t));
  return out;
}

// ============================================================
// 场景执行（批层：init→boot→own→civ→bld/fire/dmg→units→pack→batch×ticks）
// ============================================================
function runCiv(sc) {
  initWorld(sc.seed, sc.fxp ?? 0);
  fillTerrainEx(sc.terrain ?? {});
  bootTables();
  putTbhp();
  fillOwnNeg1();
  putCivs(sc.civs ?? [{}]);
  if (sc.atwar) for (const [a, b] of sc.atwar) { setU8(R_ATWAR, a * MAX_CIVS + b, 1); setU8(R_ATWAR, b * MAX_CIVS + a, 1); } // 对称宣战（Task 116 教训）
  const techBhp = (sc.civs && sc.civs[0] && sc.civs[0].bhp) || 1;
  if (sc.blds) putBuildings(sc.blds, techBhp);
  else setI32(R_BLDN, 0, 0);
  if (sc.fires) putFires(sc.fires);
  if (sc.damaged) putDamaged(sc.damaged);
  putCnt(sc.cnt);
  for (const u of sc.units) putUnitC(u.slot, u);
  ex.wb_pack_end(sc.units.length);
  const ticks = [];
  for (let t = 0; t < (sc.ticks ?? 2); t++) {
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

// —— 种子猎取（分支敏感场景：冻结首个满足判定的种子）——
function pickSeed(sc) {
  for (let sd = 1; sd < 8192; sd++) {
    const probe = { ...sc, seed: sd };
    try {
      if (sc.hunt(runCiv(probe).output)) return sd;
    } catch { /* bail/rc 异常种子跳过 */ }
  }
  throw new Error(`pickSeed FAIL: ${sc.name}`);
}

// —— bits hex → f64 数值（hunt 距离断言用；bits() 产出的是位模式 hex，须经 BigInt 还原）——
const _fb = new ArrayBuffer(8); const _fu = new BigUint64Array(_fb); const _ff = new Float64Array(_fb);
function f64bits(hexStr) { _fu[0] = BigInt(hexStr); return _ff[0]; }

// ============================================================
// 场景集（M-U3a：建筑辅助族 + 和平尾 civ 段全覆盖）
// 坐标基尺：单位 (40.5, 80.5)（CV21/25 为 41.5）；裸格距 = BLDXY 直读
// ============================================================
const GRASS = { base: T.GRASS };
const U = (over) => ({ slot: 0, race: HUMAN, civ: 0, x: 40.5, y: 80.5, food: 100, ...over });

const SCENARIOS = [
  // —— fire 族（units.rs L1187-1258 + civ 尾防灾段 L2979-2997）——
  {
    name: 'CV01-fire-none-gate', ticks: 2, terrain: GRASS, civs: [{}],
    units: [U({ job: 0 })],
    hunt: (o) => o[0].fireN === 0 && !actHas(o[0].actHex, ACT_FX, FX_WATER) && o[0].units[0].cd === bits(0),
  },
  {
    // 火格 (43,80) 中心 d=3.0 ∈(1.7,3.5)；OWN=-1 非自有 → 需自有建筑承火（own 判定）
    name: 'CV02-fire-far-move', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 43, y: 80, kind: 1, civ: 0 }], fires: [TI(43, 80)],
    units: [U({ job: 0 })], fireProbe: [TI(43, 80)],
    hunt: (o) => o[0].fireN === 1 && o[0].units[0].tx === bits(43.5) && o[0].units[0].ty === bits(80.5),
  },
  {
    name: 'CV03-fire-near-extinguish', ticks: 2, terrain: GRASS, civs: [{}],
    fires: [TI(41, 80)], // 中心 (41.5,80.5) d=1.0 <1.7（√2.89）→ d<2.2 强制计入（无需自有）
    units: [U({ job: 0 })], fireProbe: [TI(41, 80)],
    hunt: (o) => o[0].fireN === 0 && o[0].fireG[0] === 0 && actHas(o[0].actHex, ACT_FX, FX_WATER) && o[0].units[0].cd === bits(10),
  },
  {
    name: 'CV04-fire-throttle-evt', ticks: 2, terrain: GRASS, civs: [{}],
    fires: [TI(41, 80)], cnt: [2.5, -1000, 0, 0], // fires_out=3.5≥3 且 0-(-1000)>480 → EVT_FIREOUT
    units: [U({ job: 0 })], fireProbe: [TI(41, 80)],
    hunt: (o) => actHas(o[0].actHex, ACT_FX, FX_WATER) && actHas(o[0].actHex, ACT_EVT, EVT_FIREOUT),
  },
  {
    name: 'CV05-fire-throttle-silent', ticks: 2, terrain: GRASS, civs: [{}],
    fires: [TI(41, 80)], cnt: [0, -5, 0, 0], // fires_out=1<3 → 无 EVT；CNT[1] 不更新
    units: [U({ job: 0 })], fireProbe: [TI(41, 80)],
    hunt: (o) => actHas(o[0].actHex, ACT_FX, FX_WATER) && !actHas(o[0].actHex, ACT_EVT, EVT_FIREOUT) && o[0].cnt[0] === bits(1),
  },
  {
    // 外邦火 (42,81) 中心 d=√5≈2.236（≥2.2 非自有 → 跳过）；自有火 (43,80) d=3.0（OWN=0 → 计入）→ fi=自有
    name: 'CV06-fire-foreign-skip', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 43, y: 80, kind: 1, civ: 0 }], fires: [TI(42, 81), TI(43, 80)],
    units: [U({ job: 0 })],
    hunt: (o) => o[0].units[0].tx === bits(43.5),
  },
  {
    // 9 格火 → big_fire → rng<0.5、job≠4 半径 5.0：d≈4.5 自有火可寻（小火灾径 3.0 寻不到）
    name: 'CV07-fire-big-radius', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 45, y: 80, kind: 1, civ: 0 }],
    fires: Array.from({ length: 9 }, (_, i) => TI(45 + i, 80)),
    units: [U({ job: 0 })],
    hunt: (o) => o[0].units[0].tx === bits(45.5),
  },
  {
    // job=4 big fire → 半径 7.0：d≈5.5 自有火可寻
    name: 'CV08-fire-builder-radius', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 46, y: 80, kind: 1, civ: 0 }],
    fires: Array.from({ length: 9 }, (_, i) => TI(46 + i, 80)),
    units: [U({ job: 4 })],
    hunt: (o) => o[0].units[0].tx === bits(46.5),
  },
  // —— damaged_near/repair 族（L1259-1291 + L1411-1457 + civ 尾 L3002-3025）——
  {
    name: 'CV09-dmg-none-gate', ticks: 2, terrain: GRASS, civs: [{}],
    units: [U({ job: 4 })],
    hunt: (o) => o[0].units[0].cd === bits(0) && o[0].dmgn === 0,
  },
  {
    name: 'CV10-builder-far-move', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 45, y: 80, kind: 1, civ: 0 }], damaged: [TI(45, 80)], // 中心 d=5.0 ∈(1.8,14) → 赴建筑 1.15
    units: [U({ job: 4 })],
    hunt: (o) => o[0].units[0].tx === bits(45.5) && o[0].units[0].ty === bits(80.5),
  },
  {
    name: 'CV11-builder-near-repair', ticks: 2, terrain: GRASS, civs: [{ bhp: 1.25, repair: 0.8 }],
    blds: [{ x: 41, y: 80, kind: 1, civ: 0, hp: 30 }], damaged: [TI(41, 80)], // 中心 d=1.0<1.8 → 修缮
    units: [U({ job: 4 })],
    hunt: (o) => o[0].units[0].cd === bits(16) && o[0].units[0].atk === bits(10)
      && o[0].blds[0].hp === bits(Math.min(70 * 1.25, 30 + 12 * 0.8)) // 39.6
      && actHas(o[0].actHex, ACT_FX, FX_HAMMER) && actHas(o[0].actHex, ACT_BHP),
  },
  {
    name: 'CV12-repair-done-dmgdel', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 41, y: 80, kind: 4, civ: 0, hp: 35 }], damaged: [TI(41, 80), TI(50, 90)],
    cnt: [0, 0, 5.5, -1000], // rd=6.5≥6 且 0-(-1000)>720 → EVT_REPAIR
    units: [U({ job: 4 })],
    hunt: (o) => o[0].dmgn === 1 && o[0].dmgl[0] === TI(50, 90) // 有序删除保序
      && o[0].blds[0].hp === bits(40) // min(40, 35+12)=40 = max → done
      && actHas(o[0].actHex, ACT_FX, FX_SPAWN) && actHas(o[0].actHex, ACT_EVT, EVT_REPAIR),
  },
  {
    name: 'CV13-passthrough-repair', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 41, y: 80, kind: 1, civ: 0, hp: 30 }], damaged: [TI(41, 80)], // 中心 d=1.0<1.9
    units: [U({ job: 1 })], // 农民路过修缮：+3.0
    hunt: (o) => o[0].units[0].cd === bits(22) && o[0].blds[0].hp === bits(33) && actHas(o[0].actHex, ACT_FX, FX_HAMMER),
  },
  {
    // civ1 损坏建筑 (41,80) 中心 d=1.0（BLDC≠0 过滤）+ 自有损坏建筑 (44,80) 中心 d=4.0 → 选自有 → 赴自有
    name: 'CV14-damaged-civ-filter', ticks: 2, terrain: GRASS, civs: [{}, {}],
    blds: [{ x: 41, y: 80, kind: 1, civ: 1, hp: 20 }, { x: 44, y: 80, kind: 1, civ: 0, hp: 20 }],
    damaged: [TI(41, 80), TI(44, 80)],
    units: [U({ job: 4 })],
    hunt: (o) => o[0].units[0].tx === bits(44.5),
  },
  // —— 战争 AI 族（L1292-1342 + L1491-1517 + civ 尾 L3034-3073）——
  {
    name: 'CV15-war-melee-hit', ticks: 2, terrain: GRASS, civs: [{}, {}],
    atwar: [[0, 1]],
    blds: [{ x: 42, y: 80, kind: 1, civ: 1, hp: 100 }], // 裸格距 1.5 < 1.6+0.5
    units: [U({ job: 2, dmg: 8 })],
    hunt: (o) => o[0].units[0].cd === bits(14) && o[0].units[0].atk === bits(12)
      && o[0].blds[0].hp === bits(100 - 8 * 1.6) // 87.2
      && actHas(o[0].actHex, ACT_FX, FX_HIT) && actHas(o[0].actHex, ACT_BHP) && actHas(o[0].actHex, ACT_DMG_ADD),
  },
  {
    name: 'CV16-war-melee-destroy-bail', ticks: 2, terrain: GRASS, civs: [{}, {}],
    atwar: [[0, 1]],
    blds: [{ x: 42, y: 80, kind: 1, civ: 1, hp: 5 }], // 5-12.8≤0 → Err → BAIL_ATTACK_DEST
    units: [U({ job: 2, dmg: 8 })],
    hunt: (o) => o[0].bailK === BAIL_ATTACK_DEST && o[0].rc === 2,
  },
  {
    name: 'CV17-war-archer-arrow', ticks: 2, terrain: GRASS, civs: [{}, {}],
    atwar: [[0, 1]],
    blds: [{ x: 44, y: 80, kind: 1, civ: 1, hp: 100 }], // 裸格距 3.5：近身 1.6 外、弓程内
    units: [U({ job: 3, dmg: 8 })],
    hunt: (o) => actHas(o[0].actHex, ACT_FX, FX_ARROW) && o[0].units[0].cd === bits(18),
  },
  {
    name: 'CV18-war-march-nearest', ticks: 2, terrain: GRASS, civs: [{}, {}],
    atwar: [[0, 1]],
    blds: [{ x: 52, y: 80, kind: 1, civ: 1, hp: 100 }], // 裸格距 11.5 远敌建筑 → 集结掷点 ±1
    units: [U({ job: 2, dmg: 8 })],
    hunt: (o) => Math.abs(f64bits(o[0].units[0].tx) - 52) < 1.01 && Math.abs(f64bits(o[0].units[0].ty) - 80) < 1.01,
  },
  {
    // 自有 (41,80) 跳过 / 中立 civ2 (41,81) 无战争跳过 / 敌 civ1 (43,80) 裸格距 2.5 超 1.6+0.5 → 近战不触发 → 集结 nearest=civ1
    name: 'CV19-enemybld-filter', ticks: 2, terrain: GRASS, civs: [{}, {}, {}],
    atwar: [[0, 1]],
    blds: [
      { x: 41, y: 80, kind: 1, civ: 0, hp: 100 },
      { x: 41, y: 81, kind: 1, civ: 2, hp: 100 },
      { x: 43, y: 80, kind: 1, civ: 1, hp: 100 },
    ],
    units: [U({ job: 2, dmg: 8 })],
    hunt: (o) => Math.abs(f64bits(o[0].units[0].tx) - 43) < 1.01 && Math.abs(f64bits(o[0].units[0].ty) - 80) < 1.01,
  },
  // —— 平民经济族（civ 尾 L3075-3113）——
  {
    name: 'CV20-farmer-farm', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 46, y: 80, kind: 4, civ: 0, hp: 40 }], // 农民掷点农田 ±2.5（裸格坐标）
    units: [U({ job: 1 })],
    hunt: (o) => Math.abs(f64bits(o[0].units[0].tx) - 46) < 2.51 && Math.abs(f64bits(o[0].units[0].ty) - 80) < 2.51,
  },
  {
    name: 'CV21-merchant-gold', ticks: 2, terrain: GRASS, civs: [{}],
    blds: [{ x: 42, y: 80, kind: 9, civ: 0, hp: 100 }], // 裸格 (42,80)：单位 (41.5,80.5) mdx=-0.5 mdy=0.5 → <2.25 入账
    units: [U({ job: 5, x: 41.5 })],
    hunt: (o) => o[0].cvgld0 === bits(2) && actHas(o[0].actHex, ACT_FX, FX_COIN) && actHas(o[0].actHex, ACT_CIV),
  },
  {
    name: 'CV22-merchant-capital-pick', ticks: 2, terrain: GRASS, civs: [{}],
    // kindPick 掷 ≥0.6 → 王都（2）：集市裸格距 1.5 王都裸格距 7.5 → 目标为王都 ±1
    blds: [
      { x: 42, y: 80, kind: 9, civ: 0, hp: 100 },
      { x: 48, y: 80, kind: 2, civ: 0, hp: 240 },
    ],
    units: [U({ job: 5 })],
    hunt: (o) => Math.abs(f64bits(o[0].units[0].tx) - 48) < 1.01,
  },
  {
    name: 'CV23-noble-capital', ticks: 2, terrain: GRASS, civs: [{ cap: TI(47, 80) }],
    units: [U({ job: 6 })], // 贵族赴王都格 ±3（裸格坐标 47/80）
    hunt: (o) => Math.abs(f64bits(o[0].units[0].tx) - 47) < 3.01 && Math.abs(f64bits(o[0].units[0].ty) - 80) < 3.01,
  },
  {
    name: 'CV24-march-to-war', ticks: 2, terrain: GRASS, civs: [{}, {}],
    atwar: [[0, 1]],
    blds: [{ x: 50, y: 82, kind: 1, civ: 1, hp: 100 }],
    units: [U({ job: 0 })], // 平民 else 支 march：war_target 掷点敌建筑 ±2
    hunt: (o) => Math.abs(f64bits(o[0].units[0].tx) - 50) < 2.01 && Math.abs(f64bits(o[0].units[0].ty) - 82) < 2.01,
  },
  // —— 商队族（civ 尾 L3017-3033）——
  {
    name: 'CV25-caravan-arrive-bail', ticks: 2, terrain: GRASS, civs: [{}, { mkt: TI(42, 80) }],
    blds: [{ x: 42, y: 80, kind: 9, civ: 1, hp: 100 }],
    units: [U({ job: 0, cvn: 1, x: 41.5 })], // 商队 pc=1 活着有市 → 赴市 (42.5,80.5)；距 <1.8 → BAIL_CARAVAN
    hunt: (o) => o[0].bailK === BAIL_CARAVAN && o[0].rc === 2,
  },
  {
    name: 'CV26-caravan-dead-civ', ticks: 2, terrain: GRASS, civs: [{}, { alive: false }],
    units: [U({ job: 0, cvn: 1 })], // pc=1 死 → UCVN 清 0
    hunt: (o) => o[0].units[0].cvn === bits(0),
  },
  {
    name: 'CV27-caravan-mkt-missing', ticks: 2, terrain: GRASS, civs: [{}, { mkt: -1 }],
    units: [U({ job: 0, cvn: 1 })], // 活着但无市 → UCVN 清 0
    hunt: (o) => o[0].units[0].cvn === bits(0),
  },
  // —— 多建筑 war_target 掷选（L1395-1410）——
  {
    name: 'CV28-war-target-multi', ticks: 2, terrain: GRASS, civs: [{}, {}],
    atwar: [[0, 1]],
    blds: [
      { x: 50, y: 80, kind: 1, civ: 1, hp: 100 },
      { x: 50, y: 90, kind: 1, civ: 1, hp: 100 },
    ],
    units: [U({ job: 0 })],
    hunt: (o) => (Math.abs(f64bits(o[0].units[0].ty) - 80) < 2.01) || (Math.abs(f64bits(o[0].units[0].ty) - 90) < 2.01),
  },
  // —— BIDX 重建探针 + 多 tick 集成回归 ——
  {
    name: 'CV29-bidx-rebuild-probe', ticks: 3, terrain: GRASS, civs: [{}, {}],
    atwar: [[0, 1]],
    blds: [
      { x: 42, y: 80, kind: 1, civ: 1, hp: 60 },
      { x: 60, y: 60, kind: 2, civ: 0, hp: 240 },
    ],
    bidxProbe: [TI(42, 80), TI(60, 60), TI(43, 80)],
    units: [U({ job: 2, dmg: 8 })],
    hunt: (o) => o[0].bidx[0] === 0 && o[0].bidx[1] === 1 && o[0].bidx[2] === -1,
  },
  {
    name: 'CV30-multiunit-civ-mix', ticks: 3, terrain: GRASS, civs: [{}, {}],
    atwar: [[0, 1]],
    blds: [
      { x: 42, y: 80, kind: 9, civ: 0, hp: 100 },
      { x: 55, y: 85, kind: 1, civ: 1, hp: 80 },
    ],
    damaged: [TI(42, 80)],
    units: [
      U({ job: 5 }),
      U({ slot: 1, x: 50.5, y: 90.5, job: 2, dmg: 8 }),
      U({ slot: 2, x: 60.5, y: 95.5, job: 4 }),
    ],
    hunt: (o) => o.every((t) => t.rc === 1 || t.rc === 2),
  },
];

// ============================================================
// sanity 断言（语义分辨力：非平凡值/分支互斥/计数链）
// ============================================================
function sanity(res) {
  const by = Object.fromEntries(res.map((r) => [r.name, r]));
  const A = (n) => by[n].output;
  let n = 0;
  const ok = (cond, msg) => { if (!cond) throw new Error(`sanity FAIL: ${msg}`); n++; };

  // 火：扑灭链（FIREG 清 + FIREN 减 + CNT[0] +1 + UCD=10）
  {
    const t = A('CV03-fire-near-extinguish')[0];
    ok(t.fireN === 0 && t.fireG[0] === 0, 'CV03 fire cleared');
    ok(t.cnt[0] === bits(1), 'CV03 firesOut=1');
    ok(actHas(t.actHex, ACT_FX, FX_WATER), 'CV03 FX_WATER');
  }
  // 火：节流播报互斥
  ok(actHas(A('CV04-fire-throttle-evt')[0].actHex, ACT_EVT, EVT_FIREOUT), 'CV04 EVT_FIREOUT emitted');
  ok(!actHas(A('CV05-fire-throttle-silent')[0].actHex, ACT_EVT, EVT_FIREOUT), 'CV05 EVT silent');
  ok(A('CV05-fire-throttle-silent')[0].cnt[0] === bits(1) && A('CV05-fire-throttle-silent')[0].cnt[1] === bits(-5), 'CV05 CNT[1] untouched');
  // 火：自有/外邦过滤（OWN 链 + d<2.2 强制）
  ok(A('CV06-fire-foreign-skip')[0].units[0].tx === bits(43.5), 'CV06 own fire selected');
  // 火：大火半径分支
  ok(A('CV07-fire-big-radius')[0].units[0].tx === bits(45.5), 'CV07 big radius 5.0');
  ok(A('CV08-fire-builder-radius')[0].units[0].tx === bits(46.5), 'CV08 builder radius 7.0');
  // 修缮：量链（12×repair 夹 max）+ UCD/UATK + ACT_BHP + FX_HAMMER
  {
    const t = A('CV11-builder-near-repair')[0];
    ok(t.blds[0].hp === bits(39.6), `CV11 hp=39.6 got ${t.blds[0].hp}`);
    ok(t.units[0].cd === bits(16) && t.units[0].atk === bits(10), 'CV11 cd/atk');
    ok(actHas(t.actHex, ACT_BHP) && actHas(t.actHex, ACT_FX, FX_HAMMER), 'CV11 ACT_BHP+HAMMER');
    ok(t.cnt[2] === bits(1), 'CV11 rd=1');
  }
  // 修缮：done 链（DMG_DEL 保序 + FX_SPAWN + EVT_REPAIR + CNT[2]）
  {
    const t = A('CV12-repair-done-dmgdel')[0];
    ok(t.blds[0].hp === bits(40) && t.dmgn === 1 && t.dmgl[0] === TI(50, 90), 'CV12 done+ordered del');
    ok(actHas(t.actHex, ACT_FX, FX_SPAWN) && actHas(t.actHex, ACT_EVT, EVT_REPAIR), 'CV12 SPAWN+EVT_REPAIR');
    ok(t.cnt[2] === bits(6.5), 'CV12 rd=6.5');
  }
  // 路过修缮 +3
  ok(A('CV13-passthrough-repair')[0].blds[0].hp === bits(33), 'CV13 +3.0');
  // 损坏建筑 civ 过滤
  ok(A('CV14-damaged-civ-filter')[0].units[0].tx === bits(44.5), 'CV14 civ filter');
  // 近战攻建筑：hp 扣 + ACT_BHP + DMG_ADD + FX_HIT + UCD/UATK
  {
    const t = A('CV15-war-melee-hit')[0];
    ok(t.blds[0].hp === bits(87.2), `CV15 hp=87.2 got ${t.blds[0].hp}`);
    ok(t.dmgn === 1 && t.dmgl[0] === TI(42, 80), 'CV15 dmg_set_add');
    ok(t.units[0].cd === bits(14) && t.units[0].atk === bits(12), 'CV15 cd/atk');
  }
  // 摧毁 BAIL
  ok(A('CV16-war-melee-destroy-bail')[0].bailK === BAIL_ATTACK_DEST, 'CV16 BAIL_ATTACK_DEST');
  // 弓手箭
  ok(actHas(A('CV17-war-archer-arrow')[0].actHex, ACT_FX, FX_ARROW), 'CV17 FX_ARROW');
  // 商人入账（gold +2 + ACT_CIV + FX_COIN）
  ok(A('CV21-merchant-gold')[0].cvgld0 === bits(2), 'CV21 gold+2');
  // 商队 BAIL 与清 0
  ok(A('CV25-caravan-arrive-bail')[0].bailK === BAIL_CARAVAN, 'CV25 BAIL_CARAVAN');
  ok(A('CV26-caravan-dead-civ')[0].units[0].cvn === bits(0), 'CV26 cvn cleared');
  ok(A('CV27-caravan-mkt-missing')[0].units[0].cvn === bits(0), 'CV27 cvn cleared');
  // BIDX 重建
  {
    const t = A('CV29-bidx-rebuild-probe')[0];
    ok(t.bidx[0] === 0 && t.bidx[1] === 1 && t.bidx[2] === -1, 'CV29 BIDX rebuild');
  }
  // 确定性基线：tick1 后 CNT 不重复计（CV03 扑灭后火已无 → tick1 不再扑）
  ok(A('CV03-fire-near-extinguish')[1].cnt[0] === bits(1), 'CV03 no double extinguish');
  return n;
}

// ============================================================
// 主流程（直接执行或经 run-node-ts runner 时运行；export 供调试脚本 import）
// ============================================================
if (import.meta.main || (process.env.WB_GEN_MAIN === '1' && process.env.WB_GEN_TARGET === 'gen-units-civ.mjs')) {
  const scenarios = [];
  for (const sc of SCENARIOS) {
    const final = { ...sc };
    if (sc.hunt) final.seed = pickSeed(sc);
    delete final.hunt;
    scenarios.push(runCiv(final));
  }
  // 双跑确定性
  for (const sc of scenarios) {
    const a = JSON.stringify(sc);
    const b = JSON.stringify(runCiv(sc.input));
    if (a !== b) throw new Error(`determinism FAIL: ${sc.name}`);
  }
  const nSan = sanity(scenarios);
  const doc = {
    meta: {
      slice: 'M-U3a civ/building', generated: new Date().toISOString(),
      W, H, note: 'fire/building/damaged/cnt 布置协议 + wb_units_batch 批层；f64 全 bits(hex)',
      eps: Object.fromEntries(EP_KEYS.map((k) => [k, ep(k)])),
    },
    scenarios,
  };
  writeFileSync(OUT, JSON.stringify(doc, null, 1));
  console.log(`gen-units-civ: ${scenarios.length} scenarios, sanity ${nSan} asserts, determinism PASS`);
  console.log(`-> ${OUT}`);
}
export { runCiv, pickSeed, SCENARIOS };
