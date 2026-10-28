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
    army: u.army === undefined ? null : u.army, hurt: f64hex(u.hurt ?? 0), dead: u.dead ? 1 : 0, // 布尔归一 0/1（真引擎 dead:boolean，夹具数字）
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
    boat: o.boat ?? 0, boatTTL: o.boatTTL ?? 0, caravan: 0, wep: o.wep ?? 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0,
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
scenarios.push(
  // ARM07 会战宣布：march 敌对军团 8 格内 → declareClash 互标（armies 逆序迭代 + 实时 state 判定）
  { name: 'ARM07-declare-clash', seed: 0xa7c1, ticks: 1, startTick: 300,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    wars: [{ key: '0-1', a: 0, b: 1 }],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 65, y: 80, tx: 90, ty: 80,
        state: 'march', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 300 },
      { id: 2, civ: 1, name: '乙', members: [20, 21, 22, 23, 24, 25], leaderId: 20, x: 70, y: 80, tx: 55, ty: 80,
        state: 'march', morale: 75, targetCiv: 0, formedTick: 100, size0: 6, evalTick: 300 },
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
  // ARM08 战线阵列：battle 态近战前排 2.4 / 弓手后排 2.6 横队（tx/ty f64 逐位）
  { name: 'ARM08-battle-lineup', seed: 0xa8c2, ticks: 1, startTick: 300,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    wars: [{ key: '0-1', a: 0, b: 1, battles: 1 }],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 65, y: 80, tx: 70, ty: 80,
        state: 'battle', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 280,
        clashWith: 2, battleSince: 285, battleSize0: 6 },
      { id: 2, civ: 1, name: '乙', members: [20, 21, 22, 23, 24, 25], leaderId: 20, x: 70, y: 80, tx: 65, ty: 80,
        state: 'battle', morale: 75, targetCiv: 0, formedTick: 100, size0: 6, evalTick: 280,
        clashWith: 1, battleSince: 285, battleSize0: 6 },
    ],
    units: [
      { id: 10, civ: 0, x: 65.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 65.3, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 12, civ: 0, x: 64.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 65.1, y: 80.4, job: 3, hp: 18, maxHp: 18, dmg: 2, cd: 0 },
      { id: 14, civ: 0, x: 65.6, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2, cd: 0 },
      { id: 15, civ: 0, x: 65.2, y: 80.6, job: 3, hp: 18, maxHp: 18, dmg: 2, cd: 0 },
      { id: 20, civ: 1, x: 70.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 21, civ: 1, x: 70.2, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 22, civ: 1, x: 69.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 23, civ: 1, x: 70.1, y: 79.7, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 24, civ: 1, x: 69.9, y: 80.2, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 25, civ: 1, x: 70.3, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
    ] },
  // ARM09 齐射：%15===0 三类远程（弓/火枪/激光）leadAim 弹道预测 + volley 震慑
  { name: 'ARM09-volley-mixed', seed: 0xa9b09, ticks: 1, startTick: 315,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85), techs: ['crossbow'] },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    wars: [{ key: '0-1', a: 0, b: 1, battles: 1 }],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 65, y: 80, tx: 70, ty: 80,
        state: 'battle', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 310,
        clashWith: 2, battleSince: 310, battleSize0: 6 },
      { id: 2, civ: 1, name: '乙', members: [20, 21, 22, 23, 24, 25], leaderId: 20, x: 70, y: 80, tx: 65, ty: 80,
        state: 'battle', morale: 75, targetCiv: 0, formedTick: 100, size0: 6, evalTick: 310,
        clashWith: 1, battleSince: 310, battleSize0: 6 },
    ],
    units: [
      { id: 10, civ: 0, x: 65.0, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2, cd: 0 },
      { id: 11, civ: 0, x: 65.3, y: 80.1, job: 3, hp: 18, maxHp: 18, dmg: 2, cd: 0, wep: 'musket' },
      { id: 12, civ: 0, x: 64.8, y: 79.9, job: 3, hp: 18, maxHp: 18, dmg: 2, cd: 0, wep: 'rifle' },
      { id: 13, civ: 0, x: 65.1, y: 80.4, job: 3, hp: 18, maxHp: 18, dmg: 2, cd: 0, wep: 'laser_rifle' },
      { id: 14, civ: 0, x: 65.6, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 15, civ: 0, x: 65.2, y: 80.6, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 20, civ: 1, x: 70.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 21, civ: 1, x: 70.2, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 22, civ: 1, x: 69.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 23, civ: 1, x: 70.1, y: 79.7, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 24, civ: 1, x: 69.9, y: 80.2, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 25, civ: 1, x: 70.3, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
    ] },
  // ARM10 机炮扫射：mech 科技 + %20===0 → foe hp-16+rng*10 + fx bullet
  { name: 'ARM10-battle-mech', seed: 0xaa10, ticks: 1, startTick: 320,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85), techs: ['robotics'] },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    wars: [{ key: '0-1', a: 0, b: 1, battles: 1 }],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 65, y: 80, tx: 70, ty: 80,
        state: 'battle', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 310,
        clashWith: 2, battleSince: 310, battleSize0: 6 },
      { id: 2, civ: 1, name: '乙', members: [20, 21, 22, 23, 24, 25], leaderId: 20, x: 70, y: 80, tx: 65, ty: 80,
        state: 'battle', morale: 75, targetCiv: 0, formedTick: 100, size0: 6, evalTick: 310,
        clashWith: 1, battleSince: 310, battleSize0: 6 },
    ],
    units: [
      { id: 10, civ: 0, x: 65.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 65.3, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 12, civ: 0, x: 64.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 65.1, y: 80.4, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 14, civ: 0, x: 65.6, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 15, civ: 0, x: 65.2, y: 80.6, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 20, civ: 1, x: 70.0, y: 80.0, job: 2, hp: 24, maxHp: 30, dmg: 3 },
      { id: 21, civ: 1, x: 70.2, y: 80.1, job: 2, hp: 26, maxHp: 30, dmg: 3 },
      { id: 22, civ: 1, x: 69.8, y: 79.9, job: 2, hp: 25, maxHp: 30, dmg: 3 },
      { id: 23, civ: 1, x: 70.1, y: 79.7, job: 2, hp: 28, maxHp: 30, dmg: 3 },
      { id: 24, civ: 1, x: 69.9, y: 80.2, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 25, civ: 1, x: 70.3, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
    ] },
  // ARM11 伤亡崩溃：members 6 ≤ max(3, floor(bs0=12 /2)=6) → 战线崩溃 rout + scoreA+8
  { name: 'ARM11-battle-collapse', seed: 0xab11, ticks: 1, startTick: 300,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    wars: [{ key: '0-1', a: 0, b: 1, battles: 1 }],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 65, y: 80, tx: 70, ty: 80,
        state: 'battle', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 260,
        clashWith: 2, battleSince: 270, battleSize0: 12 },
      { id: 2, civ: 1, name: '乙', members: [20, 21, 22, 23, 24, 25], leaderId: 20, x: 70, y: 80, tx: 65, ty: 80,
        state: 'battle', morale: 75, targetCiv: 0, formedTick: 100, size0: 6, evalTick: 260,
        clashWith: 1, battleSince: 270, battleSize0: 6 },
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
  // ARM12 围城+战线渗透：siege 压敌建筑 → frontPush 占领 occStr 距离衰减 + 转正 score
  { name: 'ARM12-siege-front-push', seed: 0xacc2, ticks: 1, startTick: 320,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(30, 80), tiles: ringRect0(25, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(60, 76, 70, 84) },
    ],
    rel: [[0, 1, -45]],
    wars: [{ key: '0-1', a: 0, b: 1, battles: 1 }],
    civBuildCounts: [[1, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]]],
    buildings: [[idx(66, 80), 2, 1]],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 63, y: 80, tx: 66, ty: 80,
        state: 'siege', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 280 },
    ],
    units: [
      { id: 10, civ: 0, x: 63.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 63.3, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 12, civ: 0, x: 62.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 63.1, y: 80.4, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 14, civ: 0, x: 63.6, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 15, civ: 0, x: 63.2, y: 80.6, job: 3, hp: 18, maxHp: 18, dmg: 2 },
    ] },
  // ARM13 溃退恐慌：morale<floor → routArmy 传染（supply -1.2 先于恐慌 -12）+ t2 retreat 归航行军
  { name: 'ARM13-rout-panic-retreat', seed: 0xad13, ticks: 2, startTick: 300,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    wars: [{ key: '0-1', a: 0, b: 1 }],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 90, y: 80, tx: 100, ty: 80,
        state: 'march', morale: 20, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 300 },
      { id: 2, civ: 0, name: '友', members: [16, 17, 18, 19, 20, 21], leaderId: 16, x: 92, y: 81, tx: 100, ty: 81,
        state: 'march', morale: 55, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 300 },
    ],
    units: [
      { id: 10, civ: 0, x: 90.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 90.3, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 12, civ: 0, x: 89.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 90.1, y: 80.4, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 14, civ: 0, x: 90.6, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 15, civ: 0, x: 90.2, y: 80.6, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 16, civ: 0, x: 92.0, y: 81.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 17, civ: 0, x: 92.3, y: 81.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 18, civ: 0, x: 91.8, y: 80.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 19, civ: 0, x: 92.1, y: 81.4, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 20, civ: 0, x: 92.6, y: 81.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 21, civ: 0, x: 92.2, y: 81.6, job: 3, hp: 18, maxHp: 18, dmg: 2 },
    ] },
  // ARM14 溃退追击屠戮：%10===0 → 0.4 门 victim 掷中 hp=0 + corpse + losses/morale/warData
  { name: 'ARM14-chase-purge', seed: 0xaec05, ticks: 1, startTick: 300,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    wars: [{ key: '0-1', a: 0, b: 1 }],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 65, y: 80, tx: 90, ty: 80,
        state: 'march', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 300 },
      { id: 2, civ: 1, name: '溃', members: [20, 21, 22, 23, 24, 25], leaderId: 20, x: 68, y: 80, tx: 55, ty: 80,
        state: 'retreat', morale: 30, targetCiv: 0, formedTick: 100, size0: 6, evalTick: 300 },
    ],
    units: [
      { id: 10, civ: 0, x: 65.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 65.3, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 12, civ: 0, x: 64.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 65.1, y: 80.4, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 14, civ: 0, x: 65.6, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 15, civ: 0, x: 65.2, y: 80.6, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 20, civ: 1, x: 68.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 21, civ: 1, x: 68.2, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 22, civ: 1, x: 67.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 23, civ: 1, x: 68.1, y: 79.7, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 24, civ: 1, x: 67.9, y: 80.2, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 25, civ: 1, x: 68.3, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
    ] },
  // ARM15 舰队渡海：setup 手动 armyEmbark（真实现直跑）→ 水上 naval 行军 + 岸上军团 disembark 全链
  { name: 'ARM15-naval-crossing', seed: 0xafc1, ticks: 61, startTick: 300,
    paint: [[0, 0, W - 1, H - 1, GRASS], [78, 0, 100, H - 1, WATER], [101, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(60, 80), tiles: ringRect0(55, 75, 65, 85) },
      { id: 1, pop: 10, capital: idx(120, 40), tiles: ringRect0(115, 35, 125, 45) },
    ],
    rel: [[0, 1, -45]],
    civBuildCounts: [[1, [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]]],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 90, y: 40, tx: 120, ty: 40,
        state: 'march', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 300 },
      { id: 2, civ: 0, name: '乙', members: [16, 17, 18, 19, 20, 21], leaderId: 16, x: 113, y: 40, tx: 120, ty: 40,
        state: 'march', morale: 80, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 300, naval: true },
    ],
    units: [
      { id: 10, civ: 0, x: 90.0, y: 40.0, job: 2, hp: 30, maxHp: 30, dmg: 3, boat: 1, boatTTL: 1600 },
      { id: 11, civ: 0, x: 90.3, y: 40.1, job: 2, hp: 30, maxHp: 30, dmg: 3, boat: 1, boatTTL: 1600 },
      { id: 12, civ: 0, x: 89.8, y: 39.9, job: 2, hp: 30, maxHp: 30, dmg: 3, boat: 1, boatTTL: 1600 },
      { id: 13, civ: 0, x: 90.1, y: 40.4, job: 3, hp: 18, maxHp: 18, dmg: 2, boat: 1, boatTTL: 1600 },
      { id: 14, civ: 0, x: 90.6, y: 40.0, job: 3, hp: 18, maxHp: 18, dmg: 2, boat: 1, boatTTL: 1600 },
      { id: 15, civ: 0, x: 90.2, y: 40.6, job: 3, hp: 18, maxHp: 18, dmg: 2, boat: 1, boatTTL: 1600 },
      { id: 16, civ: 0, x: 113.0, y: 40.0, job: 2, hp: 30, maxHp: 30, dmg: 3, boat: 1, boatTTL: 1600 },
      { id: 17, civ: 0, x: 113.3, y: 40.1, job: 2, hp: 30, maxHp: 30, dmg: 3, boat: 1, boatTTL: 1600 },
      { id: 18, civ: 0, x: 112.8, y: 39.9, job: 2, hp: 30, maxHp: 30, dmg: 3, boat: 1, boatTTL: 1600 },
      { id: 19, civ: 0, x: 113.1, y: 40.4, job: 3, hp: 18, maxHp: 18, dmg: 2, boat: 1, boatTTL: 1600 },
      { id: 20, civ: 0, x: 113.6, y: 40.0, job: 3, hp: 18, maxHp: 18, dmg: 2, boat: 1, boatTTL: 1600 },
      { id: 21, civ: 0, x: 113.2, y: 40.6, job: 3, hp: 18, maxHp: 18, dmg: 2, boat: 1, boatTTL: 1600 },
    ],
    setup: (eng) => { eng.armyEmbark(eng.armies[0]); } }, // tick 前 embark 真实现直跑（军旗已在水中 → 移水 no-op + 成员登船 rng 偏移 + 纪事）
  // ARM16 补给线：%25===0 深入敌境 → morale-1.2 + supplyWarned 纪事（mech 差分：limit 26）
  { name: 'ARM16-supply-line', seed: 0xb016, ticks: 1, startTick: 325,
    paint: [[0, 0, W - 1, H - 1, GRASS]],
    civs: [
      { id: 0, pop: 12, gold: 50, capital: idx(30, 80), tiles: ringRect0(25, 75, 35, 85) },
      { id: 1, pop: 10, capital: idx(200, 40), tiles: ringRect0(195, 35, 205, 45) },
    ],
    rel: [[0, 1, -45]],
    armies: [
      { id: 1, civ: 0, name: '甲', members: [10, 11, 12, 13, 14, 15], leaderId: 10, x: 100, y: 80, tx: 150, ty: 80,
        state: 'march', morale: 71, targetCiv: 1, formedTick: 100, size0: 6, evalTick: 325 },
    ],
    units: [
      { id: 10, civ: 0, x: 100.0, y: 80.0, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 11, civ: 0, x: 100.3, y: 80.1, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 12, civ: 0, x: 99.8, y: 79.9, job: 2, hp: 30, maxHp: 30, dmg: 3 },
      { id: 13, civ: 0, x: 100.1, y: 80.4, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 14, civ: 0, x: 100.6, y: 80.0, job: 3, hp: 18, maxHp: 18, dmg: 2 },
      { id: 15, civ: 0, x: 100.2, y: 80.6, job: 3, hp: 18, maxHp: 18, dmg: 2 },
    ] },
);

// ---------------- runAll + sanity ----------------
function runAll() {
  const out = [];
  let fail = 0;
  for (const sc of scenarios) {
    const r1 = runScenario(sc);
    const r2 = runScenario(sc);
    const s1 = JSON.stringify(r1), s2 = JSON.stringify(r2);
    if (s1 !== s2) { console.log(`[DET FAIL] ${sc.name}`); fail++; }
    out.push(r1);
  }
  return { out, fail };
}
// f64hex 逆变换（sanity 读回用）
function f64inv(h) {
  if (h === null || h === undefined) return 0;
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(h.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, true);
}

function sanity(by) {
  const asserts = [];
  const A = (name, cond, msg) => asserts.push({ name, cond, msg });

  const r1 = by['ARM01-muster-basic'];
  const ar1 = r1.traces[0].armies[0];
  A('ARM01 army born', r1.traces[0].armies.length === 1, `n=${r1.traces[0].armies.length}`);
  A('ARM01 members 6', ar1.members.length === 6, `m=${JSON.stringify(ar1.members)}`);
  A('ARM01 name generated', ar1.name !== 'A1' && ar1.name.length >= 4, `name=${ar1.name}`);
  A('ARM01 leader kills5', ar1.leaderId === 11, `leader=${ar1.leaderId}`);
  A('ARM01 morale 73.4', Math.abs(parseFloat(f64inv(ar1.morale)) - 73.4) < 1e-9, `morale=${f64inv(ar1.morale)}（58+5*3=73+rally回士气0.4）`);
  A('ARM01 gold 22', r1.traces[0].civs[0].gold === 22, `gold=${r1.traces[0].civs[0].gold}（30-8）`);
  A('ARM01 state rally', ar1.state === 'rally', `state=${ar1.state}`);
  A('ARM01 members linked', r1.traces[0].units.filter((u) => u.army === 1).length === 6, `linked=${r1.traces[0].units.filter((u) => u.army === 1).length}`);
  A('ARM01 muster event', r1.traces[0].newEvents.some((e) => e.kind === 'army' && e.text.includes('集结了')), JSON.stringify(r1.traces[0].newEvents.map((e) => e.kind)));
  A('ARM01 toast', r1.traces[0].toasts.some((t) => t.text.includes('集结完毕')), JSON.stringify(r1.traces[0].toasts.map((t) => t.text.slice(0, 12))));

  const r2 = by['ARM02-muster-levy'];
  const ar2 = r2.traces[0].armies[0];
  A('ARM02 levy 8', ar2.members.length === 8, `m=${ar2.members.length}（pool 8 ≥ MIN6 全收，上限 MAX24）`);
  A('ARM02 jobs to 2', r2.traces[0].units.filter((u) => u.army === 1).every((u) => u.job === 2), JSON.stringify(r2.traces[0].units.filter((u) => u.army === 1).map((u) => u.job)));
  A('ARM02 hp converted', parseFloat(f64inv(r2.traces[0].units.find((u) => u.id === 10).maxHp)) === 13, `maxHp=${f64inv(r2.traces[0].units.find((u) => u.id === 10).maxHp)}（10*JOBS[2].hpMul/JOBS[0].hpMul round=13）`);
  A('ARM02 levy event', r2.traces[0].newEvents.some((e) => e.text.includes('征兵鼓')), JSON.stringify(r2.traces[0].newEvents.map((e) => e.text.slice(0, 12))));

  const r3 = by['ARM03-muster-cost-short'];
  const ar3 = r3.traces[0].armies[0];
  A('ARM03 gold zeroed', r3.traces[0].civs[0].gold === 0, `gold=${r3.traces[0].civs[0].gold}`);
  A('ARM03 morale -12', parseFloat(f64inv(ar3.morale)) < 61, `morale=${f64inv(ar3.morale)}（58-12=46 基线+回士气）`);
  A('ARM03 broke event', r3.traces[0].newEvents.some((e) => e.text.includes('国库告罄')), JSON.stringify(r3.traces[0].newEvents.map((e) => e.text.slice(0, 12))));

  const r4 = by['ARM04-muster-cap-legion'];
  A('ARM04 cap rejects', r4.traces[0].armies.length === 2, `n=${r4.traces[0].armies.length}`);
  A('ARM04 no new army', r4.traces[0].armySeq === 3, `seq=${r4.traces[0].armySeq}`);

  const r5 = by['ARM05-rally-march'];
  const ar5 = r5.traces[0].armies[0];
  A('ARM05 march state', ar5.state === 'march', `state=${ar5.state}`);
  A('ARM05 target capital', parseFloat(f64inv(ar5.tx)) === 200 && parseFloat(f64inv(ar5.ty)) === 40, `t=(${f64inv(ar5.tx)},${f64inv(ar5.ty)})`);
  A('ARM05 oath event', r5.traces[0].newEvents.some((e) => e.text.includes('誓师出征')), JSON.stringify(r5.traces[0].newEvents.map((e) => e.text.slice(0, 12))));

  const r6 = by['ARM06-march-step-chase'];
  const ar6 = r6.traces[0].armies[0];
  A('ARM06 chasing tx', ar6.tx === r6.traces[0].armies[1].x && ar6.ty === r6.traces[0].armies[1].y, `t=(${f64inv(ar6.tx)},${f64inv(ar6.ty)})（溃军 tick 末位置——倒序迭代溃军先走）`);
  A('ARM06 moved toward', parseFloat(f64inv(ar6.x)) > 65, `x=${f64inv(ar6.x)}`);
  A('ARM06 retreat army intact', r6.traces[0].armies[1].state === 'retreat', `st=${r6.traces[0].armies[1].state}`);

  const r7 = by['ARM07-declare-clash'];
  const a7a = r7.traces[0].armies.find((x) => x.id === 1);
  const a7b = r7.traces[0].armies.find((x) => x.id === 2);
  A('ARM07 both battle', a7a.state === 'battle' && a7b.state === 'battle', `${a7a.state}/${a7b.state}`);
  A('ARM07 clash cross', a7a.clashWith === 2 && a7b.clashWith === 1, `${a7a.clashWith}/${a7b.clashWith}`);
  A('ARM07 battleSize0 6', a7a.battleSize0 === 6 && a7b.battleSize0 === 6, `${a7a.battleSize0}/${a7b.battleSize0}`);
  A('ARM07 battles ++', r7.traces[0].warData[0].battles === 1, `b=${r7.traces[0].warData[0].battles}（夹具 0 + declareClash ++）`);
  A('ARM07 clash event', r7.traces[0].newEvents.some((e) => e.kind === 'clash' && e.text.includes('爆发会战')), JSON.stringify(r7.traces[0].newEvents.map((e) => e.kind)));
  A('ARM07 shake 4', parseFloat(f64inv(r7.traces[0].shake)) === 4, `shake=${r7.traces[0].shake}`);

  const r8 = by['ARM08-battle-lineup'];
  const u8m = r8.traces[0].units.find((u) => u.id === 10);
  const u8r = r8.traces[0].units.find((u) => u.id === 13);
  A('ARM08 melee front', Math.abs(parseFloat(f64inv(u8m.tx)) - 67.6) < 1e-9, `tx=${f64inv(u8m.tx)}（70-2.4）`);
  A('ARM08 melee line y', Math.abs(parseFloat(f64inv(u8m.ty)) - 80) < 2, `ty=${f64inv(u8m.ty)}`);
  A('ARM08 archer back', Math.abs(parseFloat(f64inv(u8r.tx)) - 62.4) < 1e-9, `tx=${f64inv(u8r.tx)}（65-2.6）`);

  const r9 = by['ARM09-volley-mixed'];
  const kinds = r9.traces[0].effects.map((e) => e.kind);
  A('ARM09 volley fx', kinds.includes('arrow') && kinds.includes('bullet') && kinds.includes('laser'), JSON.stringify(kinds));
  const f9 = r9.traces[0].armies.find((x) => x.id === 2);
  A('ARM09 foe shaken', parseFloat(f64inv(f9.morale)) < 75, `morale=${f64inv(f9.morale)}（75-1.5=73.5）`);
  A('ARM09 volleyTick', r9.traces[0].lastVolleyEventTick === 315, `v=${r9.traces[0].lastVolleyEventTick}`);

  const r10 = by['ARM10-battle-mech'];
  A('ARM10 mech fire fx', r10.traces[0].effects.some((e) => e.kind === 'bullet'), JSON.stringify(r10.traces[0].effects.map((e) => e.kind)));
  const hurtU = r10.traces[0].units.find((u) => u.id === 20);
  A('ARM10 foe hp reduced', parseFloat(f64inv(hurtU.hp)) < 24, `hp=${f64inv(hurtU.hp)}（24-(16+rng*10) 除非死）`);
  A('ARM10 hurt 20', parseFloat(f64inv(hurtU.hurt)) === 20 || parseFloat(f64inv(hurtU.hurt)) === 0, `hurt=${f64inv(hurtU.hurt)}`);

  const r11 = by['ARM11-battle-collapse'];
  const a11 = r11.traces[0].armies.find((x) => x.id === 1);
  A('ARM11 rout', a11.state === 'retreat', `state=${a11.state}（6 ≤ max(3,floor(12/2))）`);
  A('ARM11 scoreB +8', r11.traces[0].warData[0].scoreB === 8, `sB=${r11.traces[0].warData[0].scoreB}（甲(civ0=a)崩溃→foe 乙(civ1=b)记 scoreB）`);
  A('ARM11 collapse event', r11.traces[0].newEvents.some((e) => e.text.includes('战线崩溃')), JSON.stringify(r11.traces[0].newEvents.map((e) => e.kind)));

  const r12 = by['ARM12-siege-front-push'];
  A('ARM12 occStr pushes', r12.traces[0].occStrDiff.length > 0, `n=${r12.traces[0].occStrDiff.length}`);
  A('ARM12 score or occ', r12.traces[0].warData[0].scoreA > 0 || r12.traces[0].warData[0].occA > 0 || r12.traces[0].occStrDiff.length > 0, `sA=${r12.traces[0].warData[0].scoreA} occ=${r12.traces[0].warData[0].occA}`);
  A('ARM12 member scatter', r12.traces[0].units.filter((u) => u.army === 1).every((u) => u.tx !== null), 'tx set');

  const r13 = by['ARM13-rout-panic-retreat'];
  const a13 = r13.traces[0].armies.find((x) => x.id === 1);
  const f13 = r13.traces[0].armies.find((x) => x.id === 2);
  A('ARM13 rout army', a13.state === 'retreat', `st=${a13.state}`);
  A('ARM13 ally morale 41.8', Math.abs(parseFloat(f64inv(f13.morale)) - 41.8) < 1e-9, `morale=${f64inv(f13.morale)}（55-1.2 supply-12 恐慌——倒序先走 supply）`);
  A('ARM13 rout event', r13.traces[0].newEvents.some((e) => e.kind === 'rout' && e.text.includes('全军溃退')), JSON.stringify(r13.traces[0].newEvents.map((e) => e.kind)));
  const t13 = r13.traces[1];
  A('ARM13 t2 retreat home', t13.armies.find((x) => x.id === 1).state === 'retreat', `t2=${t13.armies.find((x) => x.id === 1).state}`);

  const r14 = by['ARM14-chase-purge'];
  const f14 = r14.traces[0].armies.find((x) => x.id === 2);
  const deadN = r14.traces[0].units.filter((u) => u.army === 2 && u.dead === 1).length;
  A('ARM14 victim died', deadN >= 1, `dead=${deadN}`);
  A('ARM14 losses 1', f14.losses >= 1, `losses=${f14.losses}`);
  A('ARM14 corpse', r14.traces[0].corpses.length >= 1, `c=${r14.traces[0].corpses.length}`);
  A('ARM14 war score', r14.traces[0].warData[0].casB >= 1 || r14.traces[0].warData[0].casA >= 1, JSON.stringify([r14.traces[0].warData[0].casA, r14.traces[0].warData[0].casB]));

  const r15 = by['ARM15-naval-crossing'];
  const a15 = r15.traces[r15.traces.length - 1].armies.find((x) => x.id === 1); // 末条 trace（60 tick 累计行军）
  A('ARM15 naval true', a15.naval === true, `naval=${a15.naval}`);
  A('ARM15 boats', r15.traces[0].units.filter((u) => u.army === 1 && u.boat === 1).length >= 1, `boats=${r15.traces[0].units.filter((u) => u.army === 1 && u.boat === 1).length}`);
  A('ARM15 naval moved', parseFloat(f64inv(a15.x)) > 90, `x=${f64inv(a15.x)}（naval clamp 行军 12 步 ×0.0575）`);
  const t15 = r15.traces[0];
  const a15b = t15.armies.find((x) => x.id === 2);
  A('ARM15 t1 disembark', a15b.naval === undefined || a15b.naval === false, `naval=${a15b.naval}（抵岸 d<8）`);
  A('ARM15 land event', t15.newEvents.some((e) => e.text.includes('抢滩登陆')), JSON.stringify(t15.newEvents.map((e) => e.text.slice(0, 12))));
  A('ARM15 spawn fx', t15.effects.some((e) => e.kind === 'spawn'), JSON.stringify(t15.effects.map((e) => e.kind)));

  const r16 = by['ARM16-supply-line'];
  const a16 = r16.traces[0].armies.find((x) => x.id === 1);
  A('ARM16 morale 69.8', Math.abs(parseFloat(f64inv(a16.morale)) - 69.8) < 1e-9, `morale=${f64inv(a16.morale)}`);
  A('ARM16 supplyWarned', a16.supplyWarned === true, `w=${a16.supplyWarned}`);
  A('ARM16 supply event', r16.traces[0].newEvents.some((e) => e.text.includes('补给线吃紧')), JSON.stringify(r16.traces[0].newEvents.map((e) => e.text.slice(0, 14))));

  return asserts;
}

// ---------------- main ----------------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const { out, fail } = runAll();
  const byMap = {};
  for (const s of out) byMap[s.name] = s;
  const asserts = sanity(byMap);
  let sFail = 0;
  for (const a of asserts) {
    if (!a.cond) { console.log(`[SANITY FAIL] ${a.name}: ${a.msg}`); sFail++; }
  }
  console.log(`[sanity] ${asserts.length - sFail}/${asserts.length} PASS`);
  const gold = {
    meta: {
      gen: 'gen-units-army.mjs',
      bluebook: 'engine.ts armyTick L6212 / tryFormArmy L6052 / armyMarch L6361 / armyBattle L6473 / frontPush L7270',
      hostProtocol: 'tickCount%5===0 → armyTick()（engine L2561）；内部门 %60 编军 / %10 追击 / %25 补给 / %15 齐射 / %20 机炮',
      W, H, houseCap: HOUSE_CAP,
      buildingDefs: BUILDING_DEFS.map((d) => ({ key: d.key, hp: d.hp, popCap: d.popCap ?? null, cost: d.cost ?? null, needKnowledge: d.needKnowledge ?? null })),
      neutralMods: NEUTRAL_MODS,
      jobsHpMul: JOBS.map((j) => j.hpMul ?? null),
      jobsDmgMul: JOBS.map((j) => j.dmgMul ?? null),
      jobsSpeedMul: JOBS.map((j) => j.speedMul ?? null),
      racesIsCiv: Object.keys(RACES).sort((a, b) => a - b).map((k) => !!RACES[k].isCiv),
      racesName: Object.keys(RACES).sort((a, b) => a - b).map((k) => RACES[k].name),
      armyMin: 6, armyMax: 24, armySpeed: 0.05, armyCd: 900,
    },
    scenarios: out,
  };
  mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
  mkdirSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden'), { recursive: true });
  const fp = path.join(ROOT, 'scripts/unity-migration/golden/units_army.json');
  writeFileSync(fp, JSON.stringify(gold));
  writeFileSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/units_army.json'), JSON.stringify(gold));
  console.log(`[gen] written ${fp} (${(JSON.stringify(gold).length / 1024).toFixed(1)}KB)`);
  if (fail || sFail) { console.log(`[GEN FAIL] det=${fail} sanity=${sFail}`); process.exit(1); }
  console.log('[GEN PASS]');
}
