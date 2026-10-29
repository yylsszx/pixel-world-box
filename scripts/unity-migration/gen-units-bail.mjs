#!/usr/bin/env node
// ============================================================
// gen-units-bail.mjs — M-U3h 第一批 bail 宿主接力黄金向量生成器（Job 2902286）
// 真实现 = src/lib/game/engine.ts GameEngine 直跑（宿主接力域不在 wasm —— TS 宿主是唯一蓝本，纪律②零同源复制）
// 蓝本段：engine.ts wbResume L3215-3302（case4 商队结算 / case5 殖民建城）+ caravanArrive L4770-4796 +
//         foundSettlement L5704-5739 + updateUnitTailJS L4116-4260 + updateUnitPostJS L4262-4334 +
//         moveUnit L5813-5876 + buildBuilding L1756 + shiftRaceRel L8054 + allianceOfCiv L8061
// 驱动方式：不跑 unitsTick（wasm 批内核域已被 M-U2a/M-U3g arena 黄金覆盖）——直调 eng.wbResume(u, kind, d)，
//   与 unitsTick L3148 `if (u) this.wbResume(u, r.kind, r.data)` 同一入口；bail 触发侧（Rust BAIL_* 发射）
//   由既有 arena 黄金与 C# WbUnits 内核翻译对账，本黄金钉住宿主接力响应。
// 桩域（场景必避门控，第二批随 BAIL_BOAT/attLES案 处理）：
//   - tail 捕食者索敌/鱼群结队分支（buckets/preyGrid 宿主结构未译——场景 race=human 非捕食者非鱼）
//   - post 繁衍 spawn 链（childGene/spawnUnit 宿主域未译——rngA0 受控使 boost 门掷骰必败）
//   - post tryPickup 本体（items 空门短路）
//   - moveUnit maybeBoardForWar 登船（开阔草地通路 passX&&passY 恒真）
// dump 协议：f64 → 小端 16 hex；rngA u32；relay 单步全字段 trace
// 跑法：node scripts/unity-migration/gen-units-bail.mjs（jiti 转译，无 run-node-ts 依赖）
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（必须在 import engine 之前挂好） ----------------
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    if (k === 'createImageData' || k === 'getImageData')
      return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'createPattern') return () => ({});
    return typeof k === 'string' ? noop : undefined;
  },
  set: () => true,
});
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }),
  addEventListener: noop,
  getElementById: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
// 不垫 globalThis.window —— engine L15915 WASM boot 守卫 typeof window!=='undefined'（接力域无需 wasm）

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, R, RACES, JOBS, BUILDING_DEFS, BUILD_KINDS, DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { isLand, isWater, buildable } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));

const W = 256, H = 160;
const idx = (x, y) => y * W + x;

// ---------------- dump 工具 ----------------
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}

function rle(arr) {
  const out = [];
  let cur = arr[0], n = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === cur && n < 65535) n++;
    else { out.push(cur, n); cur = arr[i]; n = 1; }
  }
  out.push(cur, n);
  return out;
}

function paintRect(eng, p) {
  const [, x0, y0, x1, y1, t] = p.length === 5 ? [0, ...p] : p;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    eng.terrain[idx(x, y)] = t;
  }
}

// ---------------- 夹具构造（与 gen-units-civtick 同构语义） ----------------
function mkCiv(eng, o) {
  const civ = {
    id: o.id, name: o.name ?? `C${o.id}`, race: o.race ?? 0,
    color: o.color ?? [200, 60, 60], colorHex: o.colorHex ?? '#c83c3c',
    pop: o.pop ?? 0, tiles: o.tiles ? [...o.tiles] : [], frontier: o.frontier ? [...o.frontier] : [],
    houses: o.houses ?? 0, capital: o.capital ?? -1,
    culture: o.culture ?? 0,
    kingName: o.kingName ?? 'K', kingId: o.kingId, alive: o.alive ?? true,
    banner: o.banner ?? 'B', colonizeCd: o.colonizeCd ?? 0,
    popZeroTick: o.popZeroTick, history: [],
    gold: o.gold ?? 0, knowledge: o.knowledge ?? 0,
    armyCd: o.armyCd ?? 0, mobilizeUntil: o.mobilizeUntil,
    mergedInto: o.mergedInto, techs: o.techs ? [...o.techs] : [], research: o.research ?? null, researchP: o.researchP ?? 0,
    gov: o.gov ?? 0, govYear: 0, stability: o.stability ?? 70,
    militarism: o.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
  };
  eng.civs.push(civ);
  eng.civs[civ.id] = civ;
  eng.civSeq = Math.max(eng.civSeq ?? 0, (o.id ?? 0) + 1);
  for (const i of civ.tiles) eng.owner[i] = civ.id;
  return civ;
}

function mkUnit(eng, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
    hp: o.hp ?? 10, maxHp: o.hp ?? 10, dmg: 1, speed: o.speed ?? 1, age: o.age ?? 0, maxAge: o.maxAge ?? 9999, kills: 0,
    cd: 0, trait: 0, job: o.job ?? 0, king: o.king ?? 0, infected: 0, flip: 0,
    name: `u${o.id}`, hurt: o.hurt ?? 0, breath: 0, parity: 0, dead: o.dead ?? 0,
    boat: o.boat ?? 0, boatTTL: o.boatTTL ?? 0, caravan: o.caravan ?? 0, wep: 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0,
    // M-U3h 第二批 case1 船域扩展（旧场景不传 → undefined，dump 以 null 落盘）
    grab: o.grab, thrT: o.thrT, thrVx: o.thrVx, thrVy: o.thrVy, thrX0: o.thrX0, thrY0: o.thrY0,
    army: null, gene: null, food: 0, fam: 0, fgn: 0, gIds: [], gVal: [],
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}

function mkBuilding0(eng, i, kind, civ) {
  eng.buildings.push({ i, x: i % W, y: (i / W) | 0, kind, civ });
  eng.bIdx.set(i, eng.buildings.length - 1);
  eng.building[i] = kind;
  eng.bHp.set(i, Math.round((BUILDING_DEFS[kind]?.hp ?? 70) * 1));
}

// ---------------- dump 协议 ----------------
function dumpUnit(u) {
  return {
    id: u.id, race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx), ty: f64hex(u.ty),
    speed: f64hex(u.speed), flip: u.flip ? 1 : 0, job: u.job ?? 0,
    caravan: u.caravan ?? 0, boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0, dead: u.dead ?? 0, hurt: u.hurt ?? 0,
    // M-U3h 第二批 case1 消费域扩展（字段只加：旧场景恒 0/10/null，不漂移）
    age: f64hex(u.age ?? 0), hp: f64hex(u.hp ?? 10), maxHp: f64hex(u.maxHp ?? 10),
    grab: u.grab ?? null, thrT: u.thrT ?? null,
    thrVx: u.thrVx === undefined ? null : f64hex(u.thrVx), thrVy: u.thrVy === undefined ? null : f64hex(u.thrVy),
    thrX0: u.thrX0 === undefined ? null : f64hex(u.thrX0), thrY0: u.thrY0 === undefined ? null : f64hex(u.thrY0),
  };
}
function dumpCiv(c) {
  return { id: c.id, name: c.name, race: c.race, pop: c.pop, houses: c.houses, capital: c.capital,
    alive: c.alive, gold: c.gold ?? null, knowledge: c.knowledge ?? null, colorHex: c.colorHex,
    tiles: [...c.tiles] };
}
function dumpEffect(e) {
  if (!e) return null;
  return { kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), x0: f64hex(e.x0), y0: f64hex(e.y0), r: f64hex(e.r), age: f64hex(e.age), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir) };
}
function dumpEvent(ev) {
  return { id: ev.id, year: ev.year, kind: ev.kind, text: ev.text, colorHex: ev.colorHex ?? null,
    x: ev.x === undefined ? null : f64hex(ev.x), y: ev.y === undefined ? null : f64hex(ev.y) };
}
function dumpAlliance(al) {
  return { id: al.id, name: al.name, members: [...al.members], leader: al.leader, cohesion: al.cohesion,
    formedTick: al.formedTick, formedYear: al.formedYear ?? null, warsTogether: al.warsTogether ?? 0,
    colorHex: al.colorHex, bonded: al.bonded === true ? true : undefined };
}

// ---------------- 引擎构造（单接力场景：夹具 → wbResume 直调 → dump） ----------------
function runScenario(sc) {
  const seed = sc.seed;
  const eng = new GameEngine(seed);
  eng.civs.length = 0;
  eng.units.length = 0;
  eng.unitById.clear();
  eng.laws = { ...DEFAULT_LAWS, ...(sc.laws ?? {}) };
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });
  if (sc.paint) for (const p of sc.paint) paintRect(eng, p);
  for (const c of sc.civs ?? []) mkCiv(eng, c);
  for (const u of sc.units ?? []) mkUnit(eng, u);
  for (const [a, b, v] of sc.rel ?? []) eng.rel.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
  for (const [i, kind, civ] of sc.buildings ?? []) mkBuilding0(eng, i, kind, civ);
  for (const al of sc.alliances ?? []) {
    const a = { id: al.id, name: al.name ?? `AL${al.id}`, members: [...(al.members ?? [])], leader: al.leader ?? (al.members?.[0] ?? 0),
      cohesion: al.cohesion ?? 50, formedTick: 0, formedYear: 0, warsTogether: al.warsTogether ?? 0,
      colorHex: al.colorHex ?? '#8888ff', bonded: al.bonded === true };
    eng.alliances.push(a);
    for (const m of a.members) eng.allianceOf.set(m, a.id);
  }
  for (const [cid, mi] of sc.marketIdx ?? []) eng.marketIdx.set(cid, mi); // 宿主市场表（tail 商队分支消费）
  if (sc.setup) sc.setup(eng);
  eng.tickCount = sc.startTick ?? 0;
  // 夹具后清 generate 残留（同 civtick gen 纪律：黄金基线只含夹具+relay 产物）
  eng.effects.length = 0;
  eng.dirty.clear();
  eng.propsDirty.clear();
  eng.worldEvents.length = 0;
  eng.__lastEventId = eng.eventSeq;

  const rngA0 = eng.rngA >>> 0;
  const eventSeq0 = eng.eventSeq;
  const toastSeq0 = eng.toastSeq;

  // —— relay 直调（engine L3148 同入口：wbResume(u, r.kind, r.data)）——
  const target = eng.unitById.get(sc.unitId);
  if (!target) throw new Error(`scenario ${sc.name}: unit ${sc.unitId} not found`);
  const data = Float64Array.from(sc.data ?? []);
  const kind = sc.kind;
  eng.wbResume(target, kind, data);

  return {
    name: sc.name, seed, startTick: sc.startTick ?? 0, kind, unitId: sc.unitId, data: [...(sc.data ?? [])],
    laws: eng.laws, rngA0, eventSeq0, toastSeq0,
    terrainRle: rle(eng.terrain),
    // 声明式 PRE 态夹具（C#/转写回放重建源——与 civtick gen fixture 协议同构）
    fixture: { civs: sc.civs ?? null, units: sc.units ?? null, rel: sc.rel ?? null,
      buildings: sc.buildings ?? null, alliances: sc.alliances ?? null, marketIdx: sc.marketIdx ?? null },
    rngA: eng.rngA >>> 0,
    eventSeq: eng.eventSeq,
    unit: dumpUnit(target),
    civs: (sc.civs ?? []).map((c) => dumpCiv(eng.civs[c.id])),
    rel: [...eng.rel.entries()],
    raceRel: [...eng.raceRel.entries()],
    alliances: (sc.alliances ?? []).map((al) => dumpAlliance(eng.alliances[al.id])),
    effects: eng.effects.map(dumpEffect),
    events: eng.worldEvents.map(dumpEvent),
    toasts,
    buildings: eng.buildings.map((b) => ({ i: b.i, kind: b.kind, civ: b.civ, bHp: eng.bHp.get(b.i) ?? null })),
    buildingRle: rle(eng.building),
    ownerRle: rle(Array.from(eng.owner)),
    roadRle: rle(eng.road),
    // M-U3h 第二批：grabbedTick 落地震屏（engine this.shake L5367）
    shake: f64hex(eng.shake),
  };
}

// ---------------- 场景表 ----------------
const GRASS = T.GRASS, MOUNTAIN = T.MOUNTAIN, WATER = T.WATER, SAND = T.SAND, DEEP = T.DEEP;

const scenarios = [
  // ===== case 4 商队结算（BAIL_CARAVAN → caravanArrive + updateUnitTailJS + updateUnitPostJS）=====
  // C01 基础结算：双 human 国互市，marketIdx 双表；u5 抵达伙伴市场中心 → val/gold/knowledge 掷骰链 +
  //   rel+4 + fx coin(2 掷) + 0.3 事件掷 + tail 漫游（dist²<0.25 零掷）+ moveUnit + post 繁衍门掷（0.006 必败）
  { name: 'C01-caravan-arrive-basic', seed: 0x5b01, kind: 4, data: [1.0], startTick: 0, unitId: 5,
    paint: [[36, 36, 45, 45, GRASS]],
    civs: [{ id: 0, pop: 6, capital: idx(38, 40), tiles: [idx(38, 40), idx(39, 40)] },
           { id: 1, pop: 6, capital: idx(43, 40), tiles: [idx(43, 40), idx(44, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 43.5, y: 40.5, caravan: 1, job: 4 }],
    marketIdx: [[0, idx(38, 40)], [1, idx(43, 40)]],
    rel: [[0, 1, 10]] },
  // C01b 同夹具异种子 → val/knowledge/事件掷骰变体（不同 rng 流覆盖 0.35/0.4/0.3 门两侧）
  { name: 'C01b-caravan-arrive-seed-b', seed: 0x5b0b, kind: 4, data: [1.0], startTick: 0, unitId: 5,
    paint: [[36, 36, 45, 45, GRASS]],
    civs: [{ id: 0, pop: 6, capital: idx(38, 40), tiles: [idx(38, 40), idx(39, 40)] },
           { id: 1, pop: 6, capital: idx(43, 40), tiles: [idx(43, 40), idx(44, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 43.5, y: 40.5, caravan: 1, job: 4 }],
    marketIdx: [[0, idx(38, 40)], [1, idx(43, 40)]],
    rel: [[0, 1, 10]] },
  // C02 联盟互市 bonded ×1.38 + 异族 shiftRaceRel（human↔elf）；rel 起点 -10（贸易升温 +4 仍负）
  { name: 'C02-caravan-alliance-bonded', seed: 0x5b02, kind: 4, data: [1.0], startTick: 0, unitId: 5,
    paint: [[36, 36, 45, 45, GRASS]],
    civs: [{ id: 0, pop: 6, capital: idx(38, 40), tiles: [idx(38, 40), idx(39, 40)] },
           { id: 1, race: 1, pop: 6, capital: idx(43, 40), tiles: [idx(43, 40), idx(44, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 43.5, y: 40.5, caravan: 1, job: 4 }],
    alliances: [{ id: 0, members: [0, 1], bonded: true, leader: 0, cohesion: 60 }],
    marketIdx: [[0, idx(38, 40)], [1, idx(43, 40)]],
    rel: [[0, 1, -10]] },
  // C03 伙伴亡国：partner.alive=false → 金币/知识/rel/raceRel 全跳，事件门仍在（partner 对象真值）
  { name: 'C03-caravan-partner-dead', seed: 0x5b03, kind: 4, data: [1.0], startTick: 0, unitId: 5,
    paint: [[36, 36, 45, 45, GRASS]],
    civs: [{ id: 0, pop: 6, capital: idx(38, 40), tiles: [idx(38, 40), idx(39, 40)] },
           { id: 1, pop: 6, capital: idx(43, 40), tiles: [idx(43, 40), idx(44, 40)], alive: false }],
    units: [{ id: 5, race: 0, civ: 0, x: 43.5, y: 40.5, caravan: 1, job: 4 }],
    marketIdx: [[0, idx(38, 40)]],
    rel: [[0, 1, 10]] },
  // C04 非中心结算：单位在市场旁 1.2 格（dist²=1.44 ∈ [0.25, 3.24)——bail 到达域）→ caravanArrive 即达结算
  //   tail 商队分支 caravan=0 跳过 → 漫游门 dist²=0（tx/ty=自身）< 0.25 → 零掷漫游路径（与 C01 同路径异种子/异位）
  { name: 'C04-caravan-far-roam', seed: 0x5b04, kind: 4, data: [1.0], startTick: 0, unitId: 5,
    paint: [[36, 36, 45, 45, GRASS]],
    civs: [{ id: 0, pop: 6, capital: idx(38, 40), tiles: [idx(38, 40), idx(39, 40)] },
           { id: 1, pop: 6, capital: idx(43, 40), tiles: [idx(43, 40), idx(44, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 43.5, y: 41.7, caravan: 1, job: 4 }],
    marketIdx: [[0, idx(38, 40)], [1, idx(43, 40)]],
    rel: [[0, 1, 10]] },
  // ===== case 5 殖民建城（BAIL_BOAT_SETTLE → foundSettlement；无 tail/post）=====
  // S01 基础建城：草心空格 → buildBuilding(HOUSE) + bHp + connectRoad + 5×5 圈地（owner -1 且陆地非山）+
  //   settle 纪事 + toast + fx heart（2 掷）——foundSettlement 本体零掷，rng 只剩 fx
  { name: 'S01-settle-basic', seed: 0x5b11, kind: 5, data: [idx(40, 40)], startTick: 0, unitId: 7,
    paint: [[36, 36, 45, 45, GRASS]],
    civs: [{ id: 0, pop: 8, capital: idx(38, 40), tiles: [idx(38, 40)] }],
    units: [{ id: 7, race: 0, civ: 0, x: 40.5, y: 40.5, boat: 0, job: 0 }] },
  // S02 占位跳建：目标格已有 CAPITAL → buildBuilding 早退（houses 不增），圈地/纪事/toast/fx 照发
  { name: 'S02-settle-occupied', seed: 0x5b12, kind: 5, data: [idx(40, 40)], startTick: 0, unitId: 7,
    paint: [[36, 36, 45, 45, GRASS]],
    civs: [{ id: 0, pop: 8, capital: idx(38, 40), tiles: [idx(38, 40)] }],
    units: [{ id: 7, race: 0, civ: 0, x: 40.5, y: 40.5 }],
    buildings: [[idx(40, 40), BUILD_KINDS.CAPITAL, 0]] },
  // S03 亡国早退：civ.alive=false → foundSettlement 首门 return（零效果零掷骰）
  { name: 'S03-settle-dead-civ', seed: 0x5b13, kind: 5, data: [idx(40, 40)], startTick: 0, unitId: 7,
    paint: [[36, 36, 45, 45, GRASS]],
    civs: [{ id: 0, pop: 8, capital: idx(38, 40), tiles: [idx(38, 40)], alive: false }],
    units: [{ id: 7, race: 0, civ: 0, x: 40.5, y: 40.5 }] },
  // S04 边界圈地：5×5 角山/角水/角已占（civ1 预占）→ claim 子集；目标格沙地（buildable 真值域）
  { name: 'S04-settle-partial-claim', seed: 0x5b14, kind: 5, data: [idx(41, 41)], startTick: 0, unitId: 7,
    paint: [[36, 36, 46, 46, GRASS], [38, 38, 38, 38, MOUNTAIN], [42, 42, 42, 42, WATER]],
    civs: [{ id: 0, pop: 8, capital: idx(37, 40), tiles: [idx(37, 40)] },
           { id: 1, pop: 5, capital: idx(45, 45), tiles: [idx(45, 45)] }],
    units: [{ id: 7, race: 0, civ: 0, x: 41.5, y: 41.5 }] },

  // ===== case 1 船全量 updateUnit 接管（M-U3h 第二批：前奏 L3455-3464 + grabbedTick L5343-5376 +
  //   updateBoat L5608-5660 + disembark L5663-5697 + findLandNear L5589-5606；d 参数 case1 不读，data 空）=====
  // B01 开阔海面直航：全图 DEEP；零掷骰（updateBoat 无 rng 消费）—— 航行一步 cos>0 → flip=0
  { name: 'B01-boat-sail-open', seed: 0x5c01, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, tx: 100.5, ty: 80.5, boat: 1, boatTTL: 600 }] },
  // B02 斜航翻面：目标在左后方 → baseAng 第二三象限 cos<0 → flip=1（flip 语义位）
  { name: 'B02-boat-sail-flip', seed: 0x5c02, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, tx: 20.5, ty: 70.5, boat: 1, boatTTL: 600 }] },
  // B03 TTL 超时改向：boatTTL=0 → -1，> -600 → findLandNear(x,y,14) 环扫第一陆地（ring 10 首格）→
  //   tx/ty 改锚海岸 → 直航一步（零掷骰）
  { name: 'B03-boat-ttl-redirect', seed: 0x5c03, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP], [70, 74, 73, 77, GRASS]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, tx: 100.5, ty: 80.5, boat: 1, boatTTL: 0 }] },
  // B04 殖民全链：船头前方陆地 → findLandNear(r=2) 改锚 → dist<2.5 → disembark 处女地 score=3 →
  //   wasColonist → foundSettlement：建房+圈地+settle 纪事+toast+fx spawn/heart（4 掷）
  { name: 'B04-boat-settle-colonist', seed: 0x5c04, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP], [58, 78, 63, 83, GRASS]],
    civs: [{ id: 0, pop: 8, tiles: [] }],
    units: [{ id: 11, race: 0, civ: 0, x: 59.5, y: 80.5, tx: 60.5, ty: 80.5, boat: 1, boatTTL: 100 }] },
  // B05 海难：boatTTL ≤ -600 → dead + fx skull（2 掷）+ shipwreck 纪事
  { name: 'B05-boat-shipwreck', seed: 0x5c05, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, tx: 100.5, ty: 80.5, boat: 1, boatTTL: -601 }] },
  // B06 寿终 + 前奏 hurt--：age 41→41.05 > maxAge 40 → dead（hurt 5→4 验证前奏唯一递减）
  { name: 'B06-boat-age-death', seed: 0x5c06, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, tx: 100.5, ty: 80.5, boat: 1, boatTTL: 100, age: 41, maxAge: 40, hurt: 5 }] },
  // B07 回家门登陆：3×3 内陆地全为本国领土（owner==u.civ）→ score=2 → 非殖民下船（fx spawn 2 掷，无 settlement）
  { name: 'B07-boat-home-landing', seed: 0x5c07, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP], [59, 79, 60, 80, GRASS]],
    civs: [{ id: 0, pop: 8, tiles: [idx(59, 79), idx(60, 79), idx(59, 80), idx(60, 80)] }],
    units: [{ id: 11, race: 0, civ: 0, x: 58.5, y: 79.5, tx: 59.5, ty: 80.5, boat: 1, boatTTL: 100 }] },
  // B08 战时敌岸登陆：3×3 内陆地全为敌国领土 + rel -30 → atWar → score=1 → 敌岸可登（战争舰队域）
  { name: 'B08-boat-war-landing', seed: 0x5c08, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP], [59, 79, 60, 80, GRASS]],
    civs: [{ id: 0, pop: 8, tiles: [] }, { id: 1, pop: 8, tiles: [idx(59, 79), idx(60, 79), idx(59, 80), idx(60, 80)] }],
    units: [{ id: 11, race: 0, civ: 0, x: 58.5, y: 79.5, tx: 59.5, ty: 80.5, boat: 1, boatTTL: 100 }],
    rel: [[0, 1, -30]] },
  // B09 下船失败改向：tx=自身（dist 0<2.5）→ 3×3 全水 → disembark false → boatTTL>0 →
  //   findLandNear(tx,ty,6) 环扫 6 改锚 → 直航一步（零掷骰）
  { name: 'B09-boat-no-shore-redirect', seed: 0x5c09, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP], [66, 78, 69, 81, GRASS]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, tx: 60.5, ty: 80.5, boat: 1, boatTTL: 100 }] },
  // G01 抓取眩晕静置：grab 30→28，thrT 缺省 → else-if 28>0 不清账（零掷骰；updateBoat 不达 → TTL 不减）
  { name: 'G01-boat-grab-idle', seed: 0x5c0a, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, boat: 1, boatTTL: 100, grab: 30 }] },
  // G02 抛物线飞行：thrT 6→4，位移+撞山判定（全水不阻）+ ×0.94 衰减 + 0.3 尘土门（种子定掷）
  { name: 'G02-boat-throw-flight', seed: 0x5c0b, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, boat: 1, boatTTL: 100, grab: 30, thrT: 6, thrVx: 1.2, thrVy: -0.4 }] },
  // G03 落地全链：thrT 2→0 → dist 結算 dmg=round(dist×2.6) → hp-=dmg 致死 → hurt 24 + grab=max(28,24)
  //   + 3×dust（6 掷）+ dmg fx（dmgNumbers 默认 true，2 掷）+ shake=min(5,1+dist×0.3) + hp≤0 dead
  { name: 'G03-boat-throw-land', seed: 0x5c0c, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, boat: 1, boatTTL: 100, grab: 30, thrT: 2, thrVx: 0.8, thrVy: 0.6, thrX0: 55.0, thrY0: 78.0 }] },
  // G04 眩晕结束清账：grab 1→-1 ≤ 0 → grab/thrVx/thrVy 归零（零掷骰）
  { name: 'G04-boat-grab-cleanup', seed: 0x5c0d, kind: 1, data: [], startTick: 0, unitId: 11,
    paint: [[0, 0, 255, 159, DEEP]],
    units: [{ id: 11, race: 0, x: 60.5, y: 80.5, boat: 1, boatTTL: 100, grab: 1, thrVx: 0.5, thrVy: 0.25 }] },
];

// ---------------- 主流程 ----------------
const out = { meta: {
  gen: 'gen-units-bail.mjs',
  blueprint: 'engine.ts wbResume L3215-3302 case1/case4/case5 + updateUnit 前奏 L3455-3464 + caravanArrive L4770 + foundSettlement L5704 + updateUnitTailJS L4116 + updateUnitPostJS L4262 + moveUnit L5813 + grabbedTick L5343 + updateBoat L5608 + disembark L5663 + findLandNear L5589',
  W, H,
  dumpNote: 'f64 小端 16hex；rngA u32；relay 直调（engine L3148 同入口）',
}, scenarios: [] };

for (const sc of scenarios) {
  const r = runScenario(sc);
  out.scenarios.push(r);
  console.log(`${r.name}: rngA ${r.rngA0} -> ${r.rngA} effects=${r.effects.length} events=${r.events.length} toasts=${r.toasts.length} buildings=${r.buildings.length} civ0gold=${r.civs[0]?.gold ?? '-'}`);
}

const OUT = path.join(ROOT, 'scripts/unity-migration/golden/units_bail.json');
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`written: ${OUT} (${out.scenarios.length} scenarios)`);
