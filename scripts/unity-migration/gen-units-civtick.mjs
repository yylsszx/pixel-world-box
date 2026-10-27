// gen-units-civtick.mjs — M-U3b civsTick 领土与建造核 黄金向量生成器
// 真实现 = src/lib/game/engine.ts GameEngine 直跑（civs 层不在 wasm —— TS 宿主是唯一蓝本，纪律②零同源复制）
// 蓝本段：engine.ts civsTick L5933-6040 / claimTile L1719 / seedTerritory L1681 / popCapOf L2004 /
//         pickBuildingKind L5893 / tryBuildBuilding L1958 / buildBuilding L1756 / destroyBuilding L1936 /
//         connectRoad L1906 / findPath L1833 / eliminateCiv L2174 / markDirty L959 / techModsOf L4859 /
//         atWar L2061 / civAtWar L2017 / diplomacyMeet L2037 / raceRelOf L8054 / fx L9781 / addEvent L13995
// 宿主调用协议（engine L2526）：tickCount%5===0 → rebuildCivBuildCounts() → civsTick()
// 驱动方式：不跑全 eng.tick()（避免单位层噪声），手动 tickCount++ 后直调 civsTick —— 门控语义与宿主一致
// M-U3c 桩域（黄金场景必避门控）：crownVacantTick(%40)/wallTick(%20,fortification 科技)/总动员(mobilizeUntil)/
//   殖民船(pop>=10&&houses>=2)/叛乱(laws.rebels&&pop>30&&tiles>220)/civFuseScan 融合体(%300===5 深盟)/
//   diplomacyMeet 宣战分支(laws.wars=false 走 raceRelOf) —— 场景以门控/状态控制位等价
// dump 协议：f64 → u64 bits hex（小端 16 字符）；rngA u32；每 tick 全字段 trace
// 跑法：node scripts/unity-migration/gen-units-civtick.mjs（jiti 转译，无 run-node-ts 依赖）
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
// 注意：不垫 globalThis.window —— engine L15915 WASM boot 守卫 typeof window!=='undefined'

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, RACES, JOBS, BUILDING_DEFS, BUILD_KINDS, DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { HOUSE_CAP, isLand, isWater, buildable } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const { NEUTRAL_MODS } = await jiti.import(path.join(ROOT, 'src/lib/game/tech.ts'));

const W = 256, H = 160;
const idx = (x, y) => y * W + x;

// ---------------- dump 工具 ----------------
const enc = new TextEncoder();
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function jstr(s) { return enc.encode(s ?? '').length >= 0 ? (s ?? '') : ''; }

function dumpEffect(e) {
  if (!e) return null;
  return { kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), x0: f64hex(e.x0), y0: f64hex(e.y0), r: f64hex(e.r), age: f64hex(e.age), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir) };
}
function dumpEvent(ev) {
  return { id: ev.id, year: ev.year, kind: ev.kind, text: ev.text, colorHex: ev.colorHex ?? null, x: ev.x === undefined ? null : f64hex(ev.x), y: ev.y === undefined ? null : f64hex(ev.y) };
}
function dumpCiv(c) {
  return {
    id: c.id, name: c.name, race: c.race, pop: c.pop, houses: c.houses, capital: c.capital,
    alive: c.alive, gold: c.gold ?? null, knowledge: c.knowledge ?? null,
    colonizeCd: c.colonizeCd ?? null, popZeroTick: c.popZeroTick === undefined ? null : c.popZeroTick,
    armyCd: c.armyCd ?? null, mobilizeUntil: c.mobilizeUntil === undefined ? null : c.mobilizeUntil,
    mergedInto: c.mergedInto === undefined ? null : c.mergedInto,
    techs: c.techs ?? null, research: c.research ?? null, researchP: c.researchP ?? null,
    gov: c.gov ?? null, stability: c.stability ?? null, culture: c.culture ?? null, militarism: c.militarism ?? null,
    kingId: c.kingId === undefined ? null : c.kingId, kingName: c.kingName, banner: c.banner,
    colorHex: c.colorHex, color: c.color,
    tiles: [...c.tiles], frontier: [...c.frontier],
  };
}
function diffArr(prev, cur) {
  const out = [];
  const n = Math.max(prev?.length ?? 0, cur.length);
  for (let i = 0; i < n; i++) {
    const a = prev?.[i], b = cur[i];
    if (a !== b) out.push([i, b]);
  }
  return out;
}
function mapEntries(m) {
  const out = [];
  for (const [k, v] of m ?? []) out.push(typeof k === 'string' ? [k, v] : [k, v]);
  return out;
}

// ---------------- 场景夹具 ----------------
function mkCiv(eng, o) {
  const civ = {
    id: o.id, name: o.name ?? `C${o.id}`, race: o.race ?? 0,
    color: o.color ?? [200, 60, 60], colorHex: o.colorHex ?? '#c83c3c',
    pop: o.pop ?? 0, tiles: o.tiles ? [...o.tiles] : [], frontier: o.frontier ? [...o.frontier] : [],
    houses: o.houses ?? 0, capital: o.capital ?? -1,
    kingName: o.kingName ?? 'K', kingId: o.kingId, alive: o.alive ?? true,
    banner: o.banner ?? 'B', colonizeCd: o.colonizeCd ?? 0,
    popZeroTick: o.popZeroTick, history: [],
    gold: o.gold ?? 0, knowledge: o.knowledge ?? 0,
    armyCd: o.armyCd ?? 0, mobilizeUntil: o.mobilizeUntil,
    mergedInto: o.mergedInto, techs: o.techs ?? [], research: null, researchP: 0,
    gov: o.gov ?? 0, govYear: 0, stability: o.stability ?? 70, culture: 0,
    militarism: o.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
  };
  eng.civs.push(civ);
  eng.civs[civ.id] = civ;
  // 夹具语义：tiles 是已持有领土 → owner 数组同步（蓝本 claimTile/tryBuildBuilding/seedTerritory 均以 owner 为真态）
  for (const i of civ.tiles) eng.owner[i] = civ.id;
  return civ;
}
function mkUnit(eng, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.x, ty: o.y,
    hp: o.hp ?? 10, maxHp: o.hp ?? 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
    cd: 0, trait: 0, job: o.job ?? 0, king: o.king ?? 0, infected: 0, flip: 0,
    name: `u${o.id}`, hurt: 0, breath: 0, parity: 0, dead: o.dead ?? 0,
    boat: o.boat ?? 0, boatTTL: 0, caravan: 0, wep: 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0,
    army: null, gene: null, food: 0, fam: 0, fgn: 0, gIds: [], gVal: [],
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}
function paintRect(eng, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) eng.terrain[idx(x, y)] = t;
}
function mkBuilding0(eng, i, kind, civId) {
  // 测试夹具：直接构造 Building 并登记（不经 buildBuilding 以免 rng/连路扰动 —— 黄金基线由夹具定）
  const b = { i, x: i % W, y: (i / W) | 0, kind, civ: civId };
  eng.buildings.push(b);
  eng.bIdx.set(i, eng.buildings.length - 1);
  eng.building[i] = kind;
  eng.bHp.set(i, BUILDING_DEFS[kind]?.hp ?? 70);
  const civ = eng.civs[civId];
  if (civ && kind !== BUILD_KINDS.WALL) civ.houses++;
  return b;
}

// ---------------- trace 快照 ----------------
function snapState(eng) {
  return {
    owner: Float64Array.from ? Array.from(eng.owner) : [...eng.owner],
    building: [...eng.building],
    road: [...eng.road],
    occCiv: [...eng.occCiv],
  };
}
function buildTrace(eng, prevSnap, toasts, tickNo) {
  const s2 = snapState(eng);
  const tr = {
    tick: tickNo,
    rngA: eng.rngA >>> 0,
    tickCount: eng.tickCount,
    civs: eng.civs.filter(Boolean).map(dumpCiv),
    buildings: eng.buildings.map((b) => ({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: b.civ })),
    bHp: mapEntries(eng.bHp).map(([k, v]) => [k, v]),
    civBuildCounts: mapEntries(eng.civBuildCounts).map(([k, v]) => [k, [...v]]),
    marketIdx: mapEntries(eng.marketIdx),
    ownerDiff: diffArr(prevSnap?.owner, s2.owner),
    buildingDiff: diffArr(prevSnap?.building, s2.building),
    roadDiff: diffArr(prevSnap?.road, s2.road),
    occCivDiff: diffArr(prevSnap?.occCiv, s2.occCiv),
    dirty: [...eng.dirty].sort((a, b) => a - b),
    propsDirty: [...eng.propsDirty].sort((a, b) => a - b),
    effects: eng.effects.map(dumpEffect),
    newEvents: eng.worldEvents.filter((e) => e.id >= tickNo * 0 + (eng.__lastEventId ?? 0)).map(dumpEvent),
    toasts: toasts.splice(0, toasts.length),
    tension: mapEntries(eng.tension),
    rel: mapEntries(eng.rel),
    met: [...eng.met],
    statCivsFallen: eng.statCivsFallen,
  };
  eng.__lastEventId = eng.eventSeq;
  return [tr, s2];
}

function rleTerrain(eng) {
  // terrain RLE（值+长度对）—— generate 底图 + paint 夹具后的全量快照（C# 夹具不跑 generate，必须下发）
  const out = [];
  let run = 1;
  for (let i = 1; i <= eng.terrain.length; i++) {
    if (i < eng.terrain.length && eng.terrain[i] === eng.terrain[i - 1]) { run++; continue; }
    out.push(eng.terrain[i - 1], run);
    run = 1;
  }
  return out;
}

// ---------------- 驱动协议 ----------------
function runScenario(sc) {
  const seed = sc.seed;
  const eng = new GameEngine(seed);
  // 空世界：清掉 generate 自带 civs/units（worldgen 不生成 civs，但 units 可能有 wildlife —— 全清）
  eng.civs.length = 0;
  eng.units.length = 0;
  eng.unitById.clear();
  eng.laws = { ...DEFAULT_LAWS, ...(sc.laws ?? {}) };
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });
  eng.__lastEventId = eng.eventSeq;
  // 地形夹具（先于 civ 布置）
  if (sc.paint) for (const p of sc.paint) paintRect(eng, p[0], p[1], p[2], p[3], p[4]);
  // civ/rel/tension/units/buildings 夹具
  for (const c of sc.civs ?? []) mkCiv(eng, c);
  for (const u of sc.units ?? []) mkUnit(eng, u);
  // 在位王夹具：蓝本 crownVacantTick（tickCount%40===0 门）对无王活国会跑遴选循环（rng 消耗）——
  // M-U3b C# 桩零消耗，黄金场景必须让蓝本也走 continue（在位王：!dead && king && civ===id）零 rng。
  // 只补 pop>0 的活国（pop<=0 蓝本首门直接 continue）；id 从 1000 起；置于场景 units 之后
  // （流亡自愈 units.find 取首个活国民 —— 场景 member 必须在前，王殿后不干扰）。
  let kingSeq = 1000;
  for (const c of eng.civs) {
    if (!c || !c.alive || c.pop <= 0) continue;
    if (c.kingId != null && c.kingId !== -1) continue;
    const wid = kingSeq++;
    mkUnit(eng, { id: wid, civ: c.id, x: (c.tiles[0] ?? 0) % 256 + 0.5, y: ((c.tiles[0] ?? 0) / 256 | 0) + 0.5, king: 1 });
    c.kingId = wid;
  }
  for (const [a, b, v] of sc.rel ?? []) eng.rel.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
  for (const [a, b, v] of sc.tension ?? []) eng.tension.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
  for (const [i, kind, civ] of sc.buildings ?? []) mkBuilding0(eng, i, kind, civ);
  for (const mk of sc.met ?? []) eng.met.add(mk); // 声明式 met 预注入（diplomacyMeet 早退路径）
  if (sc.setup) sc.setup(eng);
  eng.tickCount = sc.startTick ?? 0;
  // 夹具后清 generate 残留（generate 的 fx/dirty/纪事是 C# 夹具无法复现的噪声 —— 黄金基线只含夹具+tick 产物）
  eng.effects.length = 0;
  eng.dirty.clear();
  eng.propsDirty.clear();
  eng.worldEvents.length = 0;
  eng.__lastEventId = eng.eventSeq;
  // 基线快照
  let prev = snapState(eng);
  const rngA0 = eng.rngA >>> 0; // 夹具后首 tick 前（C# 夹具不跑 generate，rngA 初值须从黄金读取）
  const terrainRle = rleTerrain(eng); // terrain 全量（RLE）—— C# 夹具重建底图
  const eventSeq0 = eng.eventSeq;      // generate 残留序列（newEvents id 对齐）
  const toastSeq0 = eng.toastSeq;
  const traces = [];
  for (let k = 0; k < sc.ticks; k++) {
    if (eng.tickCount % 5 === 0) eng.rebuildCivBuildCounts(); // 宿主协议 engine L2526
    eng.civsTick();
    eng.tickCount++;
    const [tr, snap] = buildTrace(eng, prev, toasts, k);
    traces.push(tr);
    prev = snap;
  }
  return { name: sc.name, seed, startTick: sc.startTick ?? 0, ticks: sc.ticks, laws: eng.laws, rngA0,
    eventSeq0, toastSeq0, terrainRle,
    fixture: { paint: sc.paint ?? null, civs: sc.civs ?? null, rel: sc.rel ?? null, tension: sc.tension ?? null, units: sc.units ?? null, buildings: sc.buildings ?? null, met: sc.met ?? null },
    traces };
}

// ---------------- 场景表 ----------------
const GRASS = T.GRASS, MOUNTAIN = T.MOUNTAIN, WATER = T.WATER, SAND = T.SAND, FOREST = T.FOREST, SNOW = T.SNOW, DEEP = T.DEEP;

const scenarios = [
  // CVT01 基础扩张：pop=5 frontier 4 陆格；tick0 建造门（pop>cap-2 恒真 cap=0）→ gold=0 退建 HOUSE 链路；
  // capital 指定避开 promote 干扰（house 建成后 houses>0 会触发迁都段）
  { name: 'CVT01-expand-basic', seed: 0x5c01, ticks: 6, startTick: 0,
    paint: [[37, 37, 44, 44, GRASS]],
    civs: [{ id: 0, pop: 5, capital: idx(40, 40), tiles: [idx(40, 40)], frontier: [idx(39, 40), idx(41, 40), idx(40, 39), idx(40, 41)] }] },
  // CVT02 扩张地形跳过：frontier 混山/海/已占 → rng 消耗但 claim 跳过
  { name: 'CVT02-expand-terrain-skip', seed: 0x5c02, ticks: 4, startTick: 3,
    paint: [[37, 37, 44, 44, GRASS], [38, 38, 43, 38, MOUNTAIN], [37, 41, 43, 41, WATER]],
    civs: [{ id: 0, pop: 3, capital: idx(40, 40), tiles: [idx(40, 40)], frontier: [idx(40, 38), idx(40, 41), idx(40, 40), idx(39, 40), idx(41, 40)] }] },
  // CVT03 幽灵王国宽限：pop=0 + houses=1（蓝本语义：无房幽灵直接被尾段 eliminate——有房才享 400 tick 宽限）
  { name: 'CVT03-ghost-zero-pop', seed: 0x5c03, ticks: 3, startTick: 100,
    civs: [{ id: 0, pop: 0, houses: 1, capital: idx(60, 60), tiles: [idx(60, 60), idx(61, 60)] }],
    buildings: [[idx(60, 60), 1, 0]] },
  // CVT04 幽灵消亡：popZeroTick=start-401 → 首 tick eliminateCiv 全量（tiles/buildings/event）
  { name: 'CVT04-ghost-eliminate', seed: 0x5c04, ticks: 2, startTick: 500,
    civs: [{ id: 0, pop: 0, popZeroTick: 99, tiles: [idx(60, 60), idx(61, 60), idx(60, 61)] }],
    buildings: [[idx(60, 60), 1, 0], [idx(61, 60), 4, 0]] },
  // CVT05 灭国归属征服者：rel=-21 atWar + 对方在世 → addEvent fall conqueror 变体
  { name: 'CVT05-eliminate-conqueror', seed: 0x5c05, ticks: 2, startTick: 500,
    civs: [{ id: 0, pop: 0, popZeroTick: 99, tiles: [idx(60, 60)] }, { id: 1, pop: 4, tiles: [idx(70, 70)] }],
    rel: [[0, 1, -21]],
    buildings: [[idx(60, 60), 1, 0]] },
  // CVT06 流亡重扎根：pop>0 frontier=[] owned=0 tick%600==0 → seedTerritory 5×5 播种
  { name: 'CVT06-seed-territory', seed: 0x5c06, ticks: 2, startTick: 1200,
    paint: [[37, 37, 44, 44, GRASS]],
    units: [{ id: 1, civ: 0, x: 40.5, y: 40.5 }],
    civs: [{ id: 0, pop: 2, tiles: [] }] },
  // CVT07 流亡环扫：member 脚下 5×5 全山 → r=3..14 环扫找地
  { name: 'CVT07-seed-ring-scan', seed: 0x5c07, ticks: 2, startTick: 1200,
    paint: [[37, 37, 43, 43, MOUNTAIN]],
    units: [{ id: 1, civ: 0, x: 40.5, y: 40.5 }],
    civs: [{ id: 0, pop: 2, tiles: [] }] },
  // CVT08 建造加权选型：gold=100 houses=1 pop=7（cap=4, 7>4-2）→ HOUSE/FARM/MARKET/LIBRARY 加权 rng；
  // tiles 拉开 ≥3 格（spacing 门：与既有建筑 |dx|,|dy|<3 冲突会 24 attempt 全败）
  { name: 'CVT08-build-weighted', seed: 0x5c08, ticks: 3, startTick: 240,
    paint: [[38, 38, 60, 44, GRASS]],
    civs: [{ id: 0, pop: 7, gold: 100, houses: 1, capital: idx(40, 40), tiles: [idx(40, 40), idx(48, 40), idx(56, 40)] }],
    buildings: [[idx(40, 40), 1, 0]] },
  // CVT09 战争箭塔：tick%300==0 houses=9 atWar(rel=-21) → rng<0.5 TOWER
  { name: 'CVT09-war-towers', seed: 0x5c09, ticks: 2, startTick: 900,
    paint: [[38, 38, 46, 46, GRASS]],
    civs: [{ id: 0, pop: 5, gold: 50, houses: 9, capital: idx(40, 40), tiles: [idx(40, 40), idx(41, 40), idx(42, 40), idx(43, 40)] }, { id: 1, pop: 4, capital: idx(90, 90), tiles: [idx(90, 90)] }],
    rel: [[0, 1, -21]],
    buildings: [[idx(40, 40), 2, 0]] },
  // CVT10 迁都：capital=-1 houses>0 有 house 建筑 → 拆 house 建 CAPITAL
  { name: 'CVT10-promote-capital', seed: 0x5c0a, ticks: 2, startTick: 5,
    civs: [{ id: 0, pop: 3, houses: 2, tiles: [idx(40, 40), idx(41, 40)] }],
    buildings: [[idx(40, 40), 1, 0], [idx(41, 40), 1, 0]] },
  // CVT11 双国外交摩擦：扩张边境相触 → diplomacyMeet（laws.wars=false → raceRelOf 分支）+ tension rng
  { name: 'CVT11-two-civ-friction', seed: 0x5c0b, ticks: 4, startTick: 7,
    paint: [[38, 38, 47, 42, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(40, 40), tiles: [idx(40, 40)], frontier: [idx(41, 40), idx(42, 40)] },
           { id: 1, pop: 3, race: 1, capital: idx(45, 40), tiles: [idx(44, 40), idx(45, 40)], frontier: [idx(43, 40)] }] },
  // CVT11b 已相遇快路径：met 预注入 → diplomacyMeet 早退（rng 零消耗验证）
  // CVT12 建筑销毁 fx/rng 流：destroyBuilding fx('smoke') rng×2 + connectRoad findPath rng；tiles 拉开避 spacing
  { name: 'CVT12-fx-rng-stream', seed: 0x5c0c, ticks: 2, startTick: 240,
    paint: [[38, 38, 60, 44, GRASS]],
    civs: [{ id: 0, pop: 12, gold: 100, houses: 2, capital: idx(40, 40), tiles: [idx(40, 40), idx(44, 40), idx(50, 40), idx(56, 40)] }],
    buildings: [[idx(40, 40), 2, 0], [idx(44, 40), 1, 0]] },
  // CVT13 popCap 门反例：pop=1 houses=1（cap=4, 1>4-2? 1>2 假 → 不建）
  { name: 'CVT13-build-gate-false', seed: 0x5c0d, ticks: 3, startTick: 240,
    civs: [{ id: 0, pop: 1, gold: 100, houses: 1, capital: idx(40, 40), tiles: [idx(40, 40)] }],
    buildings: [[idx(40, 40), 1, 0]] },
  // CVT14 eliminate 联盟/旨意/军团空转结构（worldWar idle/directives 空/armies 空/warData 空）
  { name: 'CVT14-eliminate-empty-structures', seed: 0x5c0e, ticks: 2, startTick: 500,
    civs: [{ id: 0, pop: 0, popZeroTick: 99, tiles: [idx(60, 60), idx(61, 61)] }],
    buildings: [[idx(60, 60), 1, 0], [idx(61, 61), 9, 0]] },
  // CVT15 已相遇早退：met 预注入 → diplomacyMeet 首行 return（无 rel/tension 变更、零 rng）
  { name: 'CVT15-diplomacy-met-early-exit', seed: 0x5c0f, ticks: 2, startTick: 7,
    paint: [[38, 38, 47, 42, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(40, 40), tiles: [idx(40, 40)], frontier: [idx(41, 40), idx(42, 40)] },
           { id: 1, pop: 3, race: 1, capital: idx(45, 40), tiles: [idx(44, 40), idx(45, 40)], frontier: [idx(43, 40)] }],
    met: ['0-1'] },
  // CVT16 houseTier/popCapOf 面板：无 counts 表 → houses*(HOUSE_CAP+tier) 纯路径（civBuildCounts 空时段）
  { name: 'CVT16-popcap-no-counts', seed: 0x5c10, ticks: 1, startTick: 1,
    civs: [{ id: 0, pop: 2, houses: 3, capital: idx(40, 40), tiles: [idx(40, 40)] }] },
];

// ---------------- 主流程 ----------------
function runAll() {
  const out = [];
  let fail = 0;
  for (const sc of scenarios) {
    const r1 = runScenario(sc);
    const r2 = runScenario(sc);
    const s1 = JSON.stringify(r1.traces), s2 = JSON.stringify(r2.traces);
    const det = s1 === s2;
    if (!det) { console.log(`[FAIL] ${sc.name} determinism`); fail++; }
    out.push({ name: r1.name, seed: r1.seed, startTick: r1.startTick, ticks: r1.ticks, laws: r1.laws, rngA0: r1.rngA0, eventSeq0: r1.eventSeq0, toastSeq0: r1.toastSeq0, terrainRle: r1.terrainRle, fixture: r1.fixture, traces: r1.traces });
    console.log(`[gen] ${sc.name} ticks=${sc.ticks} det=${det ? 'PASS' : 'FAIL'}`);
  }
  return { out, fail };
}

// sanity 断言（真实现行为锚点 —— 黄金数据必须承载这些语义）
function sanity(results) {
  const by = Object.fromEntries(results.map((r) => [r.name, r]));
  const asserts = [];
  const A = (name, cond, msg) => asserts.push({ name, cond, msg });

  const r1 = by['CVT01-expand-basic'];
  const last1 = r1.traces[r1.traces.length - 1].civs[0];
  A('CVT01 tiles grow', last1.tiles.length > 1, `tiles=${last1.tiles.length}`);
  A('CVT01 frontier mutate', JSON.stringify(r1.traces[0].civs[0].frontier) !== JSON.stringify([idx(39, 40), idx(41, 40), idx(40, 39), idx(40, 41)]), 'frontier 被换出');
  const first1 = r1.traces[0];
  A('CVT01 tick0 build gate', first1.buildings.length === 1, `buildings=${first1.buildings.length}（夹具 0+新建 1）`);
  A('CVT01 house built', first1.buildingDiff.some(([, v]) => v === BUILD_KINDS.HOUSE), JSON.stringify(first1.buildingDiff));
  A('CVT01 owner claimed', r1.traces[r1.traces.length - 1].civs[0].tiles.some((i) => i !== idx(40, 40)), '新领土入账');

  const r2 = by['CVT02-expand-terrain-skip'];
  A('CVT02 rng consumed', r2.traces.every((t) => t.civs[0].tiles.length >= 1), 'tiles 保留');

  const r3 = by['CVT03-ghost-zero-pop'];
  A('CVT03 popZeroTick set', r3.traces[0].civs[0].popZeroTick === 100, `popZeroTick=${r3.traces[0].civs[0].popZeroTick}`);
  A('CVT03 alive within grace', r3.traces[2].civs[0].alive === true, '宽限期内存活');

  const r4 = by['CVT04-ghost-eliminate'];
  A('CVT04 eliminated', r4.traces[0].civs[0].alive === false, '首 tick 消亡');
  A('CVT04 tiles cleared', r4.traces[0].civs[0].tiles.length === 0, '领土归无主');
  A('CVT04 owner released', r4.traces[0].ownerDiff.every(([, v]) => v === -1), JSON.stringify(r4.traces[0].ownerDiff));
  A('CVT04 buildings destroyed', r4.traces[0].buildings.length === 0, '建筑全毁');
  A('CVT04 fall event', r4.traces[0].newEvents.some((e) => e.kind === 'fall'), 'fall 纪事');

  const r5 = by['CVT05-eliminate-conqueror'];
  const ev5 = r5.traces[0].newEvents.find((e) => e.kind === 'fall');
  A('CVT05 conqueror text', ev5 && ev5.text.includes('C1'), ev5?.text ?? 'no event');

  const r6 = by['CVT06-seed-territory'];
  A('CVT06 reseeded', r6.traces[0].civs[0].tiles.length >= 20, `tiles=${r6.traces[0].civs[0].tiles.length}（5×5 播种）`);
  // CVT06 场景需 paint 保证 5×5 可种（补在场景表 paint 后此处仅复核）
  A('CVT06 settle toast', r6.traces[0].toasts.some((t) => t.text.includes('流亡者')), JSON.stringify(r6.traces[0].toasts));
  A('CVT06 settle event', r6.traces[0].newEvents.some((e) => e.kind === 'settle'), 'settle 纪事');

  const r7 = by['CVT07-seed-ring-scan'];
  A('CVT07 ring seeded', r7.traces[0].civs[0].tiles.length >= 9, `tiles=${r7.traces[0].civs[0].tiles.length}（环扫）`);

  const r8 = by['CVT08-build-weighted'];
  A('CVT08 building added', r8.traces[0].buildings.length >= 2, `n=${r8.traces[0].buildings.length}`);
  A('CVT08 house kept', r8.traces[0].buildings.some((b) => b.kind === BUILD_KINDS.HOUSE), '住宅存在');
  A('CVT08 bHp recorded', r8.traces[0].bHp.length >= 2, `bHp=${JSON.stringify(r8.traces[0].bHp)}`);

  const r9 = by['CVT09-war-towers'];
  A('CVT09 tower or rng', r9.traces[0].buildings.some((b) => b.kind === BUILD_KINDS.TOWER) || r9.traces[0].buildings.length === 1, '塔建或 rng≥0.5');

  const r10 = by['CVT10-promote-capital'];
  A('CVT10 capital promoted', r10.traces[0].civs[0].capital === idx(40, 40), `capital=${r10.traces[0].civs[0].capital}（buildings 数组序第一个 house）`);
  A('CVT10 capital kind', r10.traces[0].buildingDiff.some(([, v]) => v === BUILD_KINDS.CAPITAL), JSON.stringify(r10.traces[0].buildingDiff));
  A('CVT10 capital event', r10.traces[0].newEvents.some((e) => e.kind === 'capital'), 'capital 纪事');

  const r11 = by['CVT11-two-civ-friction'];
  const rel11 = r11.traces[r11.traces.length - 1].rel;
  A('CVT11 met recorded', r11.traces[r11.traces.length - 1].met.length >= 1, `met=${JSON.stringify(r11.traces[r11.traces.length - 1].met)}`);
  A('CVT11 rel set', rel11.length >= 1, `rel=${JSON.stringify(rel11)}`);

  const r15 = by['CVT15-diplomacy-met-early-exit'];
  const last15 = r15.traces[r15.traces.length - 1];
  A('CVT15 met unchanged', last15.met.length === 1, `met=${JSON.stringify(last15.met)}`);
  A('CVT15 rel untouched', last15.rel.length === 0, `rel=${JSON.stringify(last15.rel)}`);

  const r16 = by['CVT16-popcap-no-counts'];
  A('CVT16 no build', r16.traces[0].buildings.length === 0, `buildings=${r16.traces[0].buildings.length}（cap=12, 2>10 假）`);

  const r12 = by['CVT12-fx-rng-stream'];
  A('CVT12 fx smoke', r12.traces[0].effects.some((e) => e.kind === 'smoke'), `effects=${r12.traces[0].effects.length}`);

  const r13 = by['CVT13-build-gate-false'];
  A('CVT13 no build', r13.traces.every((t) => t.buildings.length === 1), `n=${r13.traces[0].buildings.length}`);

  const r14 = by['CVT14-eliminate-empty-structures'];
  A('CVT14 eliminated', r14.traces[0].civs[0].alive === false, '消亡');
  A('CVT14 fallen count', r14.traces[0].statCivsFallen === 1, `fallen=${r14.traces[0].statCivsFallen}`);

  return asserts;
}

// ---------------- main ----------------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const { out, fail } = runAll();
  const asserts = sanity(out);
  let sFail = 0;
  for (const a of asserts) {
    if (!a.cond) { console.log(`[SANITY FAIL] ${a.name}: ${a.msg}`); sFail++; }
  }
  console.log(`[sanity] ${asserts.length - sFail}/${asserts.length} PASS`);
  const gold = {
    meta: {
      gen: 'gen-units-civtick.mjs',
      bluebook: 'engine.ts civsTick L5933 / claimTile L1719 / eliminateCiv L2174 / findPath L1833',
      hostProtocol: 'tickCount%5===0 → rebuildCivBuildCounts() → civsTick()（engine L2526）',
      W, H, houseCap: HOUSE_CAP,
      buildingDefs: BUILDING_DEFS.map((d) => ({ key: d.key, hp: d.hp, popCap: d.popCap ?? null, cost: d.cost ?? null, needKnowledge: d.needKnowledge ?? null })),
      neutralMods: NEUTRAL_MODS,
      jobsHpMul: JOBS.map((j) => j.hpMul ?? null),
    },
    scenarios: out,
  };
  mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
  mkdirSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden'), { recursive: true });
  const fp = path.join(ROOT, 'scripts/unity-migration/golden/units_civtick.json');
  writeFileSync(fp, JSON.stringify(gold));
  writeFileSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/units_civtick.json'), JSON.stringify(gold));
  console.log(`[gen] written ${fp} (${(JSON.stringify(gold).length / 1024).toFixed(1)}KB)`);
  if (fail || sFail) { console.log(`[GEN FAIL] det=${fail} sanity=${sFail}`); process.exit(1); }
  console.log('[GEN PASS]');
}
