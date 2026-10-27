// gen-units-army.mjs — M-U3g 军团域黄金向量生成器（armyTick 状态机全链）
// 真实现 = src/lib/game/engine.ts GameEngine 直跑（civs 层不在 wasm —— TS 宿主是唯一蓝本，纪律②零同源复制）
// 蓝本段：engine.ts tryFormArmy L6052 / civRallyPoint L6143 / pickWarEnemy L6157 / nearestStandable L6179 /
//         formationPos L6194 / armyTick L6212 / electLeader L6307 / armyRally L6318 / armyMarchTarget L6340 /
//         armyMarch L6361 / armyBattle L6473 / armySiege L6645 / armyRetreat L6699 / declareClash L6738 /
//         nearestEnemyArmy L6760 / nearestEnemyBuildingOf L6772 / crossesWater L6785 / armyEmbark L6802 /
//         armyDisembark L6828 / routArmy L6850 / disbandArmy L6876 / frontPush L7270 / frontSolidify L7306 /
//         leadAim L4351 / isRangedMember L4361 / castArrow L4368 / castBullet L4374 / castBeam L4381 /
//         launchMech L9551 / setJob L1482 / addCorpse L2871 / wwCountKill L8690
// 宿主调用协议（engine L2561）：tickCount%5===0 → armyTick()（内部 %60 编军 / %10 追击 / %25 补给 / %15 齐射 / %20 机炮）
// 驱动方式：不跑全 eng.tick()（避免单位层噪声），手动 tickCount 对齐后直调 armyTick —— 门控语义与宿主一致
// dump 协议：f64 → u64 bits hex（小端 16 字符）；rngA u32；每 tick 全字段 trace
// 跑法：node scripts/unity-migration/gen-units-army.mjs（jiti 转译）
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
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function mapEntries(m) {
  const out = [];
  for (const [k, v] of m ?? []) out.push(typeof k === 'string' ? [k, v] : [k, v]);
  return out;
}
function dumpEffect(e) {
  if (!e) return null;
  return { kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), x0: f64hex(e.x0), y0: f64hex(e.y0), r: f64hex(e.r), age: f64hex(e.age), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir) };
}
function dumpEvent(ev) {
  return { id: ev.id, year: ev.year, kind: ev.kind, text: ev.text, colorHex: ev.colorHex ?? null, x: ev.x === undefined ? null : f64hex(ev.x), y: ev.y === undefined ? null : f64hex(ev.y) };
}
function dumpUnit(u) {
  // 军团域改写：tx/ty（编队阵位）/job（levy setJob）/hp/maxHp/dmg/speed（setJob 换算）/boat/boatTTL/army/hurt/dead
  return {
    id: u.id, name: u.name, race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx), ty: f64hex(u.ty),
    hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), dmg: f64hex(u.dmg), speed: f64hex(u.speed),
    job: u.job ?? 0, king: u.king ? 1 : 0, boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0,
    army: u.army === undefined ? null : u.army, hurt: f64hex(u.hurt ?? 0), dead: u.dead ?? 0,
    wep: u.wep ?? 0, lx: f64hex(u.lx ?? u.x), ly: f64hex(u.ly ?? u.y),
  };
}
function dumpWar(wd) {
  return { key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick, startYear: wd.startYear, total: wd.total,
    aggressor: wd.aggressor, reason: wd.reason, reasonText: wd.reasonText, goal: wd.goal,
    giveUpAt: wd.giveUpAt, popA0: wd.popA0, popB0: wd.popB0, lastActiveTick: wd.lastActiveTick,
    // —— M-U3g 军团域断言锚点：会战/追击/占领记分 ——
    scoreA: wd.scoreA ?? 0, scoreB: wd.scoreB ?? 0, battles: wd.battles ?? 0,
    casA: wd.casA ?? 0, casB: wd.casB ?? 0, exA: wd.exA ?? 0, exB: wd.exB ?? 0,
    occA: wd.occA ?? 0, occB: wd.occB ?? 0 };
}
function dumpArmy(a) {
  // engine Army 产物全字段（M-U3g 状态机消费/产出全集）
  return {
    id: a.id, civ: a.civ, name: a.name, members: [...a.members], leaderId: a.leaderId,
    x: f64hex(a.x), y: f64hex(a.y), tx: f64hex(a.tx), ty: f64hex(a.ty), state: a.state,
    morale: f64hex(a.morale), kills: a.kills, losses: a.losses, tactical: a.tactical ?? false,
    clashWith: a.clashWith === undefined ? null : a.clashWith,
    naval: a.naval === true ? true : undefined,           // 真值才下发（JSON 丢 undefined——黄金字节稳定）
    ambush: a.ambush === true ? true : undefined,
    formedTick: a.formedTick ?? null, size0: a.size0 ?? null,
    battleSize0: a.battleSize0 === undefined ? null : a.battleSize0,
    evalTick: a.evalTick ?? null, targetCiv: a.targetCiv ?? null, rot: f64hex(a.rot ?? 0),
    marchPushTick: a.marchPushTick === undefined ? null : a.marchPushTick,
    supplyWarned: a.supplyWarned === true ? true : undefined,
    reinforced: a.reinforced === undefined ? null : a.reinforced,
    battleSince: a.battleSince === undefined ? null : a.battleSince,
  };
}
function dumpCiv(c) {
  return {
    id: c.id, name: c.name, race: c.race, pop: c.pop, houses: c.houses, capital: c.capital,
    alive: c.alive, gold: c.gold ?? null, knowledge: c.knowledge ?? null,
    armyCd: c.armyCd ?? null, mobilizeUntil: c.mobilizeUntil === undefined ? null : c.mobilizeUntil,
    gov: c.gov ?? null, stability: c.stability ?? null,
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
export { runScenario, scenarios };

// ---------------- 场景夹具 ----------------
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
  if (o.ideas) civ.ideas = [...o.ideas];
  eng.civs.push(civ);
  eng.civs[civ.id] = civ;
  eng.civSeq = Math.max(eng.civSeq ?? 0, (o.id ?? 0) + 1);
  for (const i of civ.tiles) eng.owner[i] = civ.id;
  return civ;
}
function mkUnit(eng, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.x, ty: o.y,
    hp: o.hp ?? 10, maxHp: o.hp ?? 10, dmg: o.dmg ?? 1, speed: o.speed ?? 1, age: 0, maxAge: 9999, kills: o.kills ?? 0,
    cd: 0, trait: 0, job: o.job ?? 0, king: o.king ?? 0, infected: 0, flip: 0,
    name: o.name ?? `u${o.id}`, hurt: 0, breath: 0, parity: 0, dead: o.dead ?? 0,
    boat: o.boat ?? 0, boatTTL: 0, caravan: 0, wep: o.wep ?? 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0,
    army: o.army ?? null, gene: null, food: 0, fam: 0, fgn: 0, gIds: [], gVal: [],
    lx: o.lx ?? o.x, ly: o.ly ?? o.y,
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}
function mkArmy(eng, o) {
  // engine Army 产物形状（tryFormArmy L6115 产物 + 状态机扩展字段全集）
  const a = {
    id: o.id, civ: o.civ, name: o.name ?? `A${o.id}`, members: [...(o.members ?? [])],
    leaderId: o.leaderId ?? (o.members?.[0] ?? -1), x: o.x ?? 0, y: o.y ?? 0, tx: o.tx ?? o.x ?? 0, ty: o.ty ?? o.y ?? 0,
    state: o.state ?? 'rally', morale: o.morale ?? 1, kills: o.kills ?? 0, losses: o.losses ?? 0,
    tactical: o.tactical ?? false, clashWith: o.clashWith,
    naval: o.naval, ambush: o.ambush, formedTick: o.formedTick ?? 0, size0: o.size0 ?? (o.members?.length ?? 0),
    battleSize0: o.battleSize0, evalTick: o.evalTick ?? 0, targetCiv: o.targetCiv ?? -1, rot: o.rot ?? 0,
    marchPushTick: o.marchPushTick, supplyWarned: o.supplyWarned, reinforced: o.reinforced,
    battleSince: o.battleSince,
  };
  eng.armies.push(a);
  for (const uid of a.members) {
    const u = eng.unitById.get(uid);
    if (u) u.army = a.id;
  }
  eng.armySeq = Math.max(eng.armySeq ?? 0, (o.id ?? 0) + 1);
  return a;
}
function mkBuilding0(eng, i, kind, civId) {
  const b = { i, x: i % W, y: (i / W) | 0, kind, civ: civId };
  eng.buildings.push(b);
  eng.bIdx.set(i, eng.buildings.length - 1);
  eng.building[i] = kind;
  eng.bHp.set(i, BUILDING_DEFS[kind]?.hp ?? 70);
  const civ = eng.civs[civId];
  if (civ && kind !== BUILD_KINDS.WALL) civ.houses++;
  return b;
}
function mkDirective(eng, o) {
  const d = { id: o.id ?? eng.directives.length, civ: o.civ, kind: o.kind, target: o.target,
    param: o.param ?? 0, status: o.status ?? 'active', startTick: o.startTick ?? 0,
    deadlineTick: o.deadlineTick ?? 0, text: o.text ?? '', killCount: o.killCount };
  eng.directives.push(d);
  eng.dirSeq = Math.max(eng.dirSeq ?? 1, (o.id ?? 0) + 1);
  return d;
}
function mkWar(eng, o) {
  eng.warData.set(o.key, {
    key: o.key, a: o.a, b: o.b, startTick: o.startTick ?? 0, startYear: o.startYear ?? 0,
    total: o.total ?? false, scoreA: o.scoreA ?? 0, scoreB: o.scoreB ?? 0, exA: o.exA ?? 0, exB: o.exB ?? 0,
    casA: o.casA ?? 0, casB: o.casB ?? 0, razedA: 0, razedB: 0, battles: o.battles ?? 0,
    giveUpAt: o.giveUpAt ?? 0, reason: o.reason ?? 'border', reasonText: o.reasonText ?? '',
    aggressor: o.aggressor ?? 0, goal: o.goal ?? 0, goalNow: 0, occA: o.occA ?? 0, occB: o.occB ?? 0,
    popA0: o.popA0 ?? 0, popB0: o.popB0 ?? 0, lastActiveTick: o.lastActiveTick ?? 0,
  });
}
function paintRect(eng, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) eng.terrain[idx(x, y)] = t;
}
function rleTerrain(eng) {
  const out = [];
  let prev = -1, run = 0;
  for (let i = 0; i < W * H; i++) {
    const t = eng.terrain[i];
    if (t === prev) run++;
    else { if (run > 0) out.push(run, prev); prev = t; run = 1; }
  }
  if (run > 0) out.push(run, prev);
  return out;
}
function ringRect0(x0, y0, x1, y1) {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(idx(x, y));
  return out;
}

// ---------------- trace 快照 ----------------
function snapState(eng) {
  return {
    owner: [...eng.owner],
    occCiv: [...eng.occCiv],
    occStr: [...eng.occStr],
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
    bHp: mapEntries(eng.bHp),
    civBuildCounts: mapEntries(eng.civBuildCounts).map(([k, v]) => [k, [...v]]),
    ownerDiff: diffArr(prevSnap?.owner, s2.owner),
    occCivDiff: diffArr(prevSnap?.occCiv, s2.occCiv),
    occStrDiff: diffArr(prevSnap?.occStr, s2.occStr),
    effects: eng.effects.map(dumpEffect),
    newEvents: eng.worldEvents.filter((e) => e.id >= (eng.__lastEventId ?? 0)).map(dumpEvent),
    toasts: toasts.splice(0, toasts.length),
    rel: mapEntries(eng.rel),
    warData: mapEntries(eng.warData).map(([, wd]) => dumpWar(wd)),
    units: eng.units.map(dumpUnit),
    armies: eng.armies.map(dumpArmy),
    corpses: eng.corpses.map((c) => ({ x: f64hex(c.x), y: f64hex(c.y), stone: c.stone ? 1 : 0, undead: c.undead ? 1 : 0 })),
    shake: f64hex(eng.shake ?? 0),
    armySeq: eng.armySeq ?? 0,
    armyNameSeq: mapEntries(eng.armyNameSeq ?? new Map()),
    lastClashEventTick: eng.lastClashEventTick ?? null,
    lastVolleyEventTick: eng.lastVolleyEventTick ?? null,
    lastReinforceEventTick: eng.lastReinforceEventTick ?? null,
    killCredit: eng.killCredit === undefined || eng.killCredit == null ? null : eng.killCredit,
  };
  eng.__lastEventId = eng.eventSeq;
  return [tr, s2];
}

// ---------------- runScenario ----------------
function runScenario(sc) {
  const seed = sc.seed;
  const eng = new GameEngine(seed);
  eng.civs.length = 0;
  eng.units.length = 0;
  eng.unitById.clear();
  eng.laws = { ...DEFAULT_LAWS, ...(sc.laws ?? {}) };
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });
  eng.__lastEventId = eng.eventSeq;
  if (sc.paint) for (const p of sc.paint) paintRect(eng, p[0], p[1], p[2], p[3], p[4]);
  for (const c of sc.civs ?? []) mkCiv(eng, c);
  for (const u of sc.units ?? []) mkUnit(eng, u);
  for (const [a, b, v] of sc.rel ?? []) eng.rel.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
  for (const [i, kind, civ] of sc.buildings ?? []) mkBuilding0(eng, i, kind, civ);
  for (const [cid, cnt] of sc.civBuildCounts ?? []) eng.civBuildCounts.set(cid, cnt);
  for (const d of sc.directives ?? []) mkDirective(eng, d);
  for (const wd of sc.wars ?? []) mkWar(eng, wd);
  for (const ar of sc.armies ?? []) mkArmy(eng, ar);
  if (sc.setup) sc.setup(eng);
  eng.tickCount = sc.startTick ?? 0;
  eng.effects.length = 0;
  eng.dirty.clear();
  eng.propsDirty.clear();
  eng.worldEvents.length = 0;
  eng.__lastEventId = eng.eventSeq;
  let prev = snapState(eng);
  const rngA0 = eng.rngA >>> 0;
  const terrainRle = rleTerrain(eng);
  const eventSeq0 = eng.eventSeq;
  const toastSeq0 = eng.toastSeq;
  const traces = [];
  for (let k = 0; k < sc.ticks; k++) {
    if (eng.tickCount % 5 === 0) eng.armyTick(); // 宿主协议 engine L2561（%5===0 门控）
    eng.tickCount++;
    const [tr, snap] = buildTrace(eng, prev, toasts, k);
    traces.push(tr);
    prev = snap;
  }
  return { name: sc.name, seed, startTick: sc.startTick ?? 0, ticks: sc.ticks, laws: eng.laws, rngA0,
    eventSeq0, toastSeq0, terrainRle,
    fixture: { paint: sc.paint ?? null, civs: sc.civs ?? null, rel: sc.rel ?? null, units: sc.units ?? null, buildings: sc.buildings ?? null,
      civBuildCounts: sc.civBuildCounts ?? null, directives: sc.directives ?? null, wars: sc.wars ?? null, armies: sc.armies ?? null },
    traces };
}

// ---------------- 场景表 ----------------
const GRASS = T.GRASS, MOUNTAIN = T.MOUNTAIN, WATER = T.WATER, SAND = T.SAND, FOREST = T.FOREST, SNOW = T.SNOW, DEEP = T.DEEP;

const scenarios = [
  // ARM01 编成全链：%60 编军 → 军名/军旗/军费/军长/成员回填（morale 73 + rally 回士气 0.4 = 73.4）
  { name: 'ARM01-muster-basic', seed: 0xa1c4, ticks: 1, startTick: 60,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 30, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    civBuildCounts: [[1, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]]],
    units: [
      { id: 10, civ: 0, x: 60.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3, kills: 2 },
      { id: 11, civ: 0, x: 61.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3, kills: 5 },
      { id: 12, civ: 0, x: 59.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 60.0, y: 79.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 14, civ: 0, x: 60.0, y: 81.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 15, civ: 0, x: 62.0, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
    ] },
  // ARM02 征召 levy：无战士 → 8 平民执戈（setJob 换算 + 征兵鼓纪事）
  { name: 'ARM02-muster-levy', seed: 0xa2b02, ticks: 1, startTick: 60,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    civBuildCounts: [[1, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]]],
    units: [
      { id: 10, civ: 0, x: 60.0, y: 80.0, job: 0, hp: 10, maxHp: 10, dmg: 1, speed: 1 },
      { id: 11, civ: 0, x: 61.0, y: 80.0, job: 0, hp: 12, maxHp: 12, dmg: 1, speed: 1.1 },
      { id: 12, civ: 0, x: 59.0, y: 80.0, job: 0, hp: 9, maxHp: 9, dmg: 1, speed: 0.9 },
      { id: 13, civ: 0, x: 60.0, y: 79.0, job: 0, hp: 10, maxHp: 10, dmg: 1, speed: 1 },
      { id: 14, civ: 0, x: 60.0, y: 81.0, job: 0, hp: 11, maxHp: 11, dmg: 1, speed: 1 },
      { id: 15, civ: 0, x: 62.0, y: 80.0, job: 0, hp: 10, maxHp: 10, dmg: 1, speed: 1 },
      { id: 16, civ: 0, x: 63.0, y: 80.0, job: 0, hp: 10, maxHp: 10, dmg: 1, speed: 1 },
      { id: 17, civ: 0, x: 64.0, y: 80.0, job: 0, hp: 10, maxHp: 10, dmg: 1, speed: 1 },
    ] },
  // ARM03 军费不足：gold 2 < musterCost → 仓促成军 morale-12 + 国库告罄纪事
  { name: 'ARM03-muster-cost-short', seed: 0xa3c3, ticks: 1, startTick: 60,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 2, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    civBuildCounts: [[1, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]]],
    units: [
      { id: 10, civ: 0, x: 60.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 61.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 12, civ: 0, x: 59.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 60.0, y: 79.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 14, civ: 0, x: 60.0, y: 81.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 15, civ: 0, x: 62.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
    ] },
  // ARM04 军团上限：legion 旨意 param=4 + gov=4（共和 aggr 种族）→ armyCap 精确 → 满编拒绝
  { name: 'ARM04-muster-cap-legion', seed: 0xa4b04, ticks: 1, startTick: 60,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 99, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85), race: 3, gov: 4 },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    civBuildCounts: [[1, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]]],
    directives: [{ id: 0, civ: 0, kind: 'legion', param: 4 }],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [30, 31, 32, 33, 34, 35], x: 60, y: 80, state: 'march', morale: 80, targetCiv: 1, formedTick: 0, size0: 6 },
      { id: 2, civ: 0, name: '乙', members: [36, 37, 38, 39, 40, 41], x: 61, y: 80, state: 'march', morale: 80, targetCiv: 1, formedTick: 0, size0: 6 },
    ],
    units: [
      ...Array.from({ length: 12 }, (_, i) => ({ id: 30 + i, civ: 0, x: 60.0 + i, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 })),
    ] },
  // ARM05 rally→march：就位 + waited>40 → 誓师出征（armyMarchTarget=敌王都）
  { name: 'ARM05-rally-march', seed: 0xa5b05, ticks: 1, startTick: 100,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 11, x: 60, y: 80, tx: 60, ty: 80,
        state: 'rally', morale: 70, targetCiv: 1, formedTick: 50, size0: 6, evalTick: 100 },
    ],
    units: [
      { id: 10, civ: 0, x: 60.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 60.5, y: 80.2, job: 2, hp: 30, maxHp: 30, dmg: 3, kills: 3 },
      { id: 12, civ: 0, x: 59.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 60.2, y: 80.5, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 14, civ: 0, x: 60.9, y: 80.1, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 15, civ: 0, x: 60.1, y: 80.8, job: 3, hp: 18, maxHp: 18, dmg: 2 },
    ] },
  // ARM06 march 8 向推进 + 溃军咬定（chasing step×1.5；倒序迭代溃军先走）
  { name: 'ARM06-march-step-chase', seed: 0xa6b06, ticks: 2, startTick: 300,
    paint: [[0, 0, W - 1, H - 1, GRASS], [70, 78, 76, 82, FOREST]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 65, y: 80, tx: 90, ty: 80,
        state: 'march', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 300 },
      { id: 2, civ: 1, name: '溃', members: [20, 21, 22, 23, 24, 25], leaderId: 20, x: 70, y: 80, tx: 55, ty: 80,
        state: 'retreat', morale: 30, targetCiv: 0, formedTick: 100, size0: 6, evalTick: 300 },
    ],
    units: [
      { id: 10, civ: 0, x: 65.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 65.3, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 12, civ: 0, x: 64.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 65.1, y: 80.4, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 14, civ: 0, x: 65.6, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 15, civ: 0, x: 65.2, y: 80.6, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 20, civ: 1, x: 70.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 21, civ: 1, x: 70.2, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 22, civ: 1, x: 69.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 23, civ: 1, x: 70.1, y: 79.7, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 24, civ: 1, x: 69.9, y: 80.2, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 25, civ: 1, x: 70.3, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
    ] },
];
