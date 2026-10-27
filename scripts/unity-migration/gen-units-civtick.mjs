// gen-units-civtick.mjs — M-U3b/M-U3c civsTick 黄金向量生成器（M-U3b 领土与建造核 + M-U3c 王权/城墙/殖民船/叛乱/融合/总动员/宣战）
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
function dumpUnit(u) {
  // M-U3c：crown/setJob/殖民船/分裂/融合 均改写单位态 —— trace 全量下发（f64 hex 逐位）
  return {
    id: u.id, name: u.name, race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx), ty: f64hex(u.ty),
    hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), dmg: f64hex(u.dmg), speed: f64hex(u.speed),
    job: u.job ?? 0, king: u.king ? 1 : 0, boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0, dead: u.dead ?? 0,
  };
}
function dumpWar(wd) {
  return { key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick, startYear: wd.startYear, total: wd.total,
    aggressor: wd.aggressor, reason: wd.reason, reasonText: wd.reasonText, goal: wd.goal,
    giveUpAt: wd.giveUpAt, popA0: wd.popA0, popB0: wd.popB0, lastActiveTick: wd.lastActiveTick };
}
function dumpAlliance(al) {
  return { id: al.id, name: al.name, members: [...al.members], leader: al.leader, cohesion: al.cohesion,
    formedTick: al.formedTick, formedYear: al.formedYear ?? null, warsTogether: al.warsTogether ?? 0, colorHex: al.colorHex,
    // bonded 仅真值时下发（JSON.stringify 丢弃 undefined）—— CVT01-25 黄金字节不变
    bonded: al.bonded === true ? true : undefined };
}
function dumpDirective(d) {
  return { id: d.id, civ: d.civ, kind: d.kind, target: d.target === undefined ? null : d.target,
    param: d.param ?? null, status: d.status, startTick: d.startTick ?? null, deadlineTick: d.deadlineTick ?? null,
    text: d.text ?? null, endTick: d.endTick === undefined ? null : d.endTick, endText: d.endText === undefined ? null : d.endText,
    killCount: d.killCount === undefined ? null : d.killCount };
}
function dumpEvo(n) {
  return { id: n.id, kind: n.kind, name: n.name, parent: n.parent === undefined || n.parent === null ? null : n.parent,
    year: n.year, colorHex: n.colorHex, detail: n.detail, stat: n.stat === undefined ? null : n.stat };
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
    culture: o.culture ?? 0,
    kingName: o.kingName ?? 'K', kingId: o.kingId, alive: o.alive ?? true,
    banner: o.banner ?? 'B', colonizeCd: o.colonizeCd ?? 0,
    popZeroTick: o.popZeroTick, history: [],
    gold: o.gold ?? 0, knowledge: o.knowledge ?? 0,
    armyCd: o.armyCd ?? 0, mobilizeUntil: o.mobilizeUntil,
    mergedInto: o.mergedInto, techs: o.techs ?? [], research: null, researchP: 0,
    gov: o.gov ?? 0, govYear: 0, stability: o.stability ?? 70,
    militarism: o.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
  };
  eng.civs.push(civ);
  eng.civs[civ.id] = civ;
  // createCiv 的 id = civSeq++（engine L1564）—— 夹具绕过 createCiv 时须同步游标，否则叛乱/融合建新国 id 撞车
  eng.civSeq = Math.max(eng.civSeq ?? 0, (o.id ?? 0) + 1);
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
    boat: o.boat ?? 0, boatTTL: 0, caravan: o.caravan ?? 0, wep: 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0,
    army: null, gene: null, food: 0, fam: 0, fgn: 0, gIds: [], gVal: [],
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}
function paintRect(eng, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) eng.terrain[idx(x, y)] = t;
}
function ringRect(x0, y0, x1, y1) {
  // 矩形全量 tile 列表（声明式夹具用：mkCiv 同步 owner）
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(idx(x, y));
  return out;
}
function wallRingCells(cx, cy, radius) {
  // 与 wallTick 同公式扫环（Math.cos/sin 与蓝本同源）—— 返回去重后的 ring cell 列表（k 序）
  const seen = new Set();
  const out = [];
  for (let k = 0; k < 72; k++) {
    const ang = (k / 72) * Math.PI * 2;
    const xx = Math.round(cx + Math.cos(ang) * radius);
    const yy = Math.round(cy + Math.sin(ang) * radius);
    if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
    const i = idx(xx, yy);
    if (!seen.has(i)) { seen.add(i); out.push(i); }
  }
  return out;
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
function mkDirective(eng, o) {
  // engine issueDirective 产物形状（M-U3c 只消费：status/civ/kind/target/param + 结算字段）
  // M-U3d：dirSeq 游标同步（同 mkCiv civSeq 规则）—— 否则 issueDirective 分发的 id 与夹具 id 撞车
  const d = { id: o.id ?? eng.directives.length, civ: o.civ, kind: o.kind, target: o.target,
    param: o.param ?? 0, status: o.status ?? 'active', startTick: o.startTick ?? 0,
    deadlineTick: o.deadlineTick ?? 0, text: o.text ?? '', killCount: o.killCount };
  eng.directives.push(d);
  eng.dirSeq = Math.max(eng.dirSeq ?? 1, (o.id ?? 0) + 1);
  return d;
}
function mkAlliance(eng, o) {
  // engine formAlliance 产物形状（M-U3c 消费全字段；M-U3d 加 bonded 袍泽纽带）
  const al = { id: o.id, name: o.name ?? `A${o.id}`, members: [...o.members], leader: o.leader ?? o.members[0],
    cohesion: o.cohesion ?? 55, formedTick: o.formedTick ?? 0, formedYear: o.formedYear ?? 0,
    warsTogether: o.warsTogether ?? 0, colorHex: o.colorHex ?? '#14b8a6', bonded: o.bonded ?? false };
  eng.alliances.push(al);
  for (const m of al.members) eng.allianceOf.set(m, al.id);
  return al;
}
function mkWar(eng, o) {
  // engine ensureWarData 产物形状（声明式战争档案夹具 —— eliminateCiv 清理路径用）
  eng.warData.set(o.key, {
    key: o.key, a: o.a, b: o.b, startTick: o.startTick ?? 0, startYear: o.startYear ?? 0,
    total: o.total ?? false, scoreA: 0, scoreB: 0, exA: 0, exB: 0, casA: 0, casB: 0,
    razedA: 0, razedB: 0, battles: 0, giveUpAt: o.giveUpAt ?? 0,
    reason: o.reason ?? 'border', reasonText: o.reasonText ?? '', aggressor: o.aggressor ?? 0,
    goal: o.goal ?? 0, goalNow: 0, occA: 0, occB: 0, popA0: o.popA0 ?? 0, popB0: o.popB0 ?? 0,
    lastActiveTick: o.lastActiveTick ?? 0,
  });
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
    // —— M-U3c 扩展段 ——
    units: eng.units.map(dumpUnit),
    warData: mapEntries(eng.warData).map(([, wd]) => dumpWar(wd)),
    raceRel: mapEntries(eng.raceRel),
    totalWars: [...(eng.totalWars ?? [])].sort(),
    warHistory: [...(eng.warHistory ?? [])],
    statWars: eng.statWars ?? null,
    civSeq: eng.civSeq ?? null,
    alliances: eng.alliances.map(dumpAlliance),
    directives: eng.directives.map(dumpDirective),
    evoNodes: eng.evoNodes.map(dumpEvo),
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
  // M-U3c：noAutoKing 场景跳过整段（王位继承/首冕场景需无王国态）。
  if (!sc.noAutoKing) {
    let kingSeq = 1000;
    for (const c of eng.civs) {
      if (!c || !c.alive || c.pop <= 0) continue;
      if (c.kingId != null && c.kingId !== -1) continue;
      const wid = kingSeq++;
      mkUnit(eng, { id: wid, civ: c.id, x: (c.tiles[0] ?? 0) % 256 + 0.5, y: ((c.tiles[0] ?? 0) / 256 | 0) + 0.5, king: 1 });
      c.kingId = wid;
    }
  }
  for (const [a, b, v] of sc.rel ?? []) eng.rel.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
  for (const [a, b, v] of sc.tension ?? []) eng.tension.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
  for (const [i, kind, civ] of sc.buildings ?? []) mkBuilding0(eng, i, kind, civ);
  for (const mk of sc.met ?? []) eng.met.add(mk); // 声明式 met 预注入（diplomacyMeet 早退路径）
  for (const d of sc.directives ?? []) mkDirective(eng, d); // M-U3c：旨意夹具（finishDirective 结算路径）
  for (const al of sc.alliances ?? []) mkAlliance(eng, al); // M-U3c：联盟夹具（融合/除名/解散路径）
  for (const wd of sc.wars ?? []) mkWar(eng, wd); // M-U3c：战争档案夹具（eliminateCiv 清理路径）
  if (sc.setup) sc.setup(eng);
  eng.tickCount = sc.startTick ?? 0;
  // 夹具后清 generate 残留（generate 的 fx/dirty/纪事是 C# 夹具无法复现的噪声 —— 黄金基线只含夹具+tick 产物）
  eng.effects.length = 0;
  eng.dirty.clear();
  eng.propsDirty.clear();
  eng.worldEvents.length = 0;
  eng.evoNodes.length = 0; eng.evoSeq = 0; eng.evoIndex.clear(); // generate 物种残留（C# 夹具不可复现，同 fx/dirty 批次清理）
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
    // M-U3d 宿主子系统协议（engine L2565/L2571 —— directiveTick/allianceTick 是 tick() 宿主层门控，
    // 不在 civsTick 内；旧场景不置 hostTicks 保持 CVT01-25 黄金字节不变）。
    // 顺序 = 真实宿主序：civsTick → issue（UI/神谕 API 任意时点，取 civsTick 后）→ %30 旨意 → %300 联盟。
    if (sc.hostTicks) {
      for (const iss of sc.issue ?? []) {
        if (iss.at === k) eng.issueDirective(iss.civ, iss.kind, iss.param ?? 0, iss.target);
      }
      if (eng.tickCount % 30 === 0) eng.directiveTick();
      if (eng.tickCount % 300 === 23) eng.allianceTick();
    }
    eng.tickCount++;
    const [tr, snap] = buildTrace(eng, prev, toasts, k);
    traces.push(tr);
    prev = snap;
  }
  return { name: sc.name, seed, startTick: sc.startTick ?? 0, ticks: sc.ticks, laws: eng.laws, rngA0,
    eventSeq0, toastSeq0, terrainRle,
    fixture: { paint: sc.paint ?? null, civs: sc.civs ?? null, rel: sc.rel ?? null, tension: sc.tension ?? null, units: sc.units ?? null, buildings: sc.buildings ?? null, met: sc.met ?? null, directives: sc.directives ?? null, alliances: sc.alliances ?? null, wars: sc.wars ?? null, noAutoKing: sc.noAutoKing ?? null, hostTicks: sc.hostTicks ?? null, issue: sc.issue ?? null },
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
  // ==================== M-U3c 桩域销案场景 ====================
  // CVT17 王位继承：kingId=-1（先王驾崩）→ %40 crownVacantTick 遴选（贵族3/战士2/平民1 权重+rng*0.9
  //   → 贵族 [3,3.9] 恒压战士 [2,2.9]，胜负与 rng 无关）→ crownUnit 播报继承 + setJob(king) 属性换算。
  //   dead/boat 候选在 rng 前被 continue 剔除（零消耗）；%20 wallTick pop<8 早退零 rng。
  { name: 'CVT17-crown-succession', seed: 0x5c11, ticks: 1, startTick: 40, noAutoKing: true,
    civs: [{ id: 0, pop: 3, kingId: -1, kingName: 'OldK', capital: idx(40, 40), tiles: [idx(40, 40)] }],
    units: [
      { id: 1, civ: 0, x: 40.5, y: 40.5, job: 6 },
      { id: 2, civ: 0, x: 41.5, y: 40.5, job: 2 },
      { id: 3, civ: 0, x: 42.5, y: 40.5, job: 0 },
      { id: 4, civ: 0, x: 43.5, y: 40.5, dead: 1 },
      { id: 5, civ: 0, x: 44.5, y: 40.5, boat: 1 },
    ] },
  // CVT18 首王静默加冕：kingId=undefined（新国/旧档）→ succession=false → crownUnit 静默（零事件零 toast）
  { name: 'CVT18-crown-first-silent', seed: 0x5c12, ticks: 1, startTick: 40, noAutoKing: true,
    civs: [{ id: 0, pop: 2, capital: idx(40, 40), tiles: [idx(40, 40)] }],
    units: [
      { id: 1, civ: 0, x: 40.5, y: 40.5, job: 0 },
      { id: 2, civ: 0, x: 41.5, y: 40.5, job: 2 },
    ] },
  // CVT19 城墙砌筑：fortification+pop=10+gold=100+首都 ring 半径3 → 首批 3 段（gold -2×3）+ fx hammer（rng×2）
  { name: 'CVT19-wall-build', seed: 0x5c13, ticks: 1, startTick: 40,
    paint: [[40, 34, 52, 46, GRASS]],
    civs: [{ id: 0, pop: 10, gold: 100, houses: 5, techs: ['fortification'], capital: idx(46, 40), tiles: ringRect(43, 37, 49, 43) }],
    buildings: [[idx(46, 40), 2, 0]] },
  // CVT19b 城墙圈完整：缺口 ≤3 → 不再砌（gaps.length<=3 continue，零 rng 零 fx）
  { name: 'CVT19b-wall-complete', seed: 0x5c14, ticks: 1, startTick: 40,
    paint: [[40, 34, 52, 46, GRASS]],
    civs: [{ id: 0, pop: 10, gold: 100, houses: 5, techs: ['fortification'], capital: idx(46, 40), tiles: ringRect(43, 37, 49, 43) }],
    // 预砌全环（声明式——setup 动态夹具不可回放）：gaps.length===0 → wallTick continue（零 build 零 fx）。
    // 注：wallTick gaps 按采样序含重复（72 采样→28 去重格），留缺口会被重复采样撑爆，完整圈才是「不再砌」分支。
    buildings: [[idx(46, 40), 2, 0], ...wallRingCells(46, 40, 3).map((i) => [i, BUILD_KINDS.WALL, 0])] },
  // CVT20 殖民船启航：pop=10+houses=2+cand=6（含 wild/boat 过滤样本）+ 8 邻水域 waterN>=5 + 远方 25-85 采样落点
  //   → boat=1/boatTTL=1200/坐标重置/hp+20/fx spawn/纪事 toast/colonizeCd 冷却（无论成败先入冷却）
  { name: 'CVT20-colony-launch', seed: 0xc1a2a, ticks: 1, startTick: 1,
    paint: [[8, 8, 240, 150, GRASS], [42, 42, 58, 58, DEEP]],
    civs: [{ id: 0, pop: 10, houses: 2, capital: idx(30, 30), tiles: [idx(50, 50)] }],
    units: [
      { id: 1, civ: 0, x: 50.5, y: 50.5 },
      { id: 2, civ: 0, x: 50.5, y: 50.5 },
      { id: 3, civ: 0, x: 50.5, y: 50.5 },
      { id: 4, civ: 0, x: 50.5, y: 50.5 },
      { id: 5, civ: 0, x: 50.5, y: 50.5 },
      { id: 6, civ: 0, x: 50.5, y: 50.5 },
      { id: 7, civ: -1, x: 51.5, y: 51.5 },
      { id: 8, civ: 0, x: 52.5, y: 52.5, boat: 1 },
    ] },
  // CVT21 叛乱分裂：pop=40+tiles 572+stab=20（<30 → 0.16）+%300 门 → 距首都最远建筑（>14）为策源地
  //   → createCiv（名池/色板/首都扫描/播种/播报）+ 半径9 领土易帜 + 建筑转移 + 国民转移 + declareWar rebel force 全链
  { name: 'CVT21-rebel-split', seed: 0x68a3c, ticks: 1, startTick: 600,
    paint: [[28, 34, 82, 44, GRASS]],
    civs: [{ id: 0, pop: 40, gold: 100, houses: 4, stability: 20, capital: idx(30, 39), tiles: ringRect(28, 34, 79, 44) }],
    units: [
      { id: 1, civ: 0, x: 75.5, y: 39.5 },
      { id: 2, civ: 0, x: 75.5, y: 39.5 },
      { id: 3, civ: 0, x: 75.5, y: 39.5 },
    ],
    buildings: [[idx(30, 39), 2, 0], [idx(75, 39), 1, 0]] },
  // CVT22 深盟融合：%300===5 + cohesion 80 + 成立≥1440 tick + 均非交战 + rng<=0.1
  //   → power 对比 → keep/gone → 领土/建筑/国民/金库/知识/科技并集/rel/met 继承 remap → 旨意双路结算（failed+success）
  //   → leaveAlliance fallen → 成员<2 → dissolveAlliance → alive=false+mergedInto → 联合王朝命名 + recordEvo
  { name: 'CVT22-merge-fuse', seed: 0xc1a2c, ticks: 1, startTick: 1505,
    paint: [[36, 36, 64, 44, GRASS]],
    civs: [
      { id: 0, pop: 25, gold: 50, houses: 2, capital: idx(40, 40), tiles: [idx(40, 40), idx(41, 40)] },
      { id: 1, pop: 22, gold: 30, knowledge: 7, houses: 1, techs: ['masonry'], capital: idx(50, 40), tiles: [idx(50, 40)] },
      { id: 2, pop: 5, capital: idx(60, 40), tiles: [idx(60, 40)] },
    ],
    units: [{ id: 10, civ: 1, x: 50.5, y: 40.5 }],
    rel: [[1, 2, -30]],
    met: ['1-2'],
    directives: [
      { id: 0, civ: 1, kind: 'wealth', param: 300 },
      { id: 1, civ: 0, kind: 'annihilate', target: 1 },
    ],
    alliances: [{ id: 0, name: 'A0', members: [0, 1], leader: 0, cohesion: 80, formedTick: 65 }] },
  // CVT23 总动员武装化：mobilizeUntil 窗口内 %25 门 → 前 2 名武装（peasant/farmer→warrior 属性比例换算）
  //   商人（第3位）在 n>=2 break 后不转换 —— 迭代序位精确
  { name: 'CVT23-mobilize-setjob', seed: 0x5c18, ticks: 1, startTick: 175,
    civs: [{ id: 0, pop: 5, mobilizeUntil: 200, capital: idx(40, 40), tiles: [idx(40, 40)] }],
    units: [
      { id: 1, civ: 0, x: 40.5, y: 40.5, job: 0, hp: 10 },
      { id: 2, civ: 0, x: 41.5, y: 40.5, job: 1, hp: 10 },
      { id: 3, civ: 0, x: 42.5, y: 40.5, job: 5, hp: 10 },
      { id: 4, civ: 0, x: 43.5, y: 40.5, job: 2, hp: 10 },
    ] },
  // CVT24 外交宣战：laws.wars=true + 扩张接触 → diplomacyMeet rng<warChance(0.335) → pickCasus border
  //   → declareWar 全链（rel-45/goal 6/warData/gold 战争开销/casus 纪事/种族关系 25-2.5=22.5）
  { name: 'CVT24-diplomacy-war', seed: 0x5ec08, ticks: 3, startTick: 7,
    paint: [[30, 38, 50, 42, GRASS]],
    civs: [
      { id: 0, pop: 3, capital: idx(35, 40), tiles: [idx(35, 40)], frontier: [idx(36, 40), idx(37, 40)] },
      { id: 1, pop: 3, race: 1, capital: idx(44, 40), tiles: [idx(44, 40), idx(43, 40)], frontier: [idx(38, 40)] },
    ] },
  // CVT25 灭国+联盟除名+旨意成功：幽灵消亡 → EliminateCiv 全链（alFall 凝聚力-18 → leaveAlliance fallen
  //   → 成员<2 dissolveAlliance 星散 + warData 档案清理 + annihilate 目标令 success（civ1 gold+120 decreeOk））
  { name: 'CVT25-eliminate-alliance', seed: 0x5c1a, ticks: 1, startTick: 500,
    civs: [
      { id: 0, pop: 0, popZeroTick: 99, tiles: [idx(60, 60)] },
      { id: 1, pop: 4, gold: 10, houses: 1, capital: idx(70, 70), tiles: [idx(70, 70)] },
    ],
    buildings: [[idx(60, 60), 1, 0], [idx(70, 70), 1, 1]],
    rel: [[0, 1, -21]],
    directives: [{ id: 0, civ: 1, kind: 'annihilate', target: 0 }],
    alliances: [{ id: 0, name: 'A0', members: [0, 1], leader: 0, cohesion: 60, formedTick: 10 }],
    wars: [{ key: '0-1', a: 0, b: 1, startTick: 400, startYear: 0, total: true, aggressor: 1, reason: 'rebel', reasonText: 'war', goal: 0, giveUpAt: 4000, popA0: 3, popB0: 4, lastActiveTick: 450 }] },

  // ==================== M-U3d 联盟系统 + 旨意颁布（hostTicks 宿主子系统协议） ====================
  // 注意：hostTicks 场景的 civsTick 段保持零噪声（frontier 空 + pop≤houses*4-2 无建造门 + 相距远无外交接触
  // + %25/%40/%300 内部门不命中）—— rng 流完全由宿主子系统消耗，种子可预测。

  // CVT26 结盟诞生：rel 60≥55 + met + 非交战 + 异族（human/elf diploMul=1.05→p=0.0525）→ rng<p
  // → formAlliance（pop 大者为盟主）→ 盟名地域词（中原：双 capital 均近中心 |dx|<0.16）+ essence 掷 rng
  // → rel≥60 升温 + met + shiftRaceRel +9（RACE_REL_BASE['0-1']=25 → 34）+ alliance/toast 事件
  { name: 'CVT26-form-alliance', seed: 0xd569e, ticks: 1, startTick: 23, hostTicks: true,
    civs: [
      { id: 0, pop: 3, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)] },
      { id: 1, pop: 2, houses: 1, capital: idx(130, 80), tiles: [idx(130, 80)], race: 1, colorHex: '#3c6cc8' },
    ],
    rel: [[0, 1, 60]],
    met: ['0-1'] },
  // CVT27 扩员：既有盟（0,1）+ 候选 2（rel(leader0,2)=50≥45、成员 1-2 rel 10>5 多数 ok）
  // → rng < 0.05*(0.5+0.65) → joinAlliance：members+1、rel(0,2)/(1,2)≥52、raceRel +4（0-2 human/human 同族早退；1-2 elf/human → base+4）
  { name: 'CVT27-join-alliance', seed: 0x27e9dc, ticks: 1, startTick: 23, hostTicks: true,
    civs: [
      { id: 0, pop: 2, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)] },
      { id: 1, pop: 2, houses: 1, capital: idx(124, 80), tiles: [idx(124, 80)], race: 1, colorHex: '#3c6cc8' },
      { id: 2, pop: 2, houses: 1, capital: idx(200, 120), tiles: [idx(200, 120)] },
    ],
    rel: [[0, 2, 50], [1, 2, 10]],
    met: ['0-2'],
    alliances: [{ id: 0, name: '中原同盟', members: [0, 1], leader: 0, cohesion: 60, formedTick: 100 }] },
  // CVT28 判叛解散：双人盟成员互战（warData 0-1）→ 对账 atWar → traitor=军国主义高者（civ0 mil 50 vs 20）
  // → leaveAlliance betray（cohesion -22、rel→min(-30,-21)=-30、叛盟事件/toast）→ members<2 → dissolve（星散事件）
  { name: 'CVT28-betray-dissolve', seed: 0x5c1d, ticks: 1, startTick: 23, hostTicks: true,
    civs: [
      { id: 0, pop: 2, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)], militarism: 50 },
      { id: 1, pop: 2, houses: 1, capital: idx(124, 80), tiles: [idx(124, 80)], militarism: 20 },
    ],
    rel: [[0, 1, -21]],
    alliances: [{ id: 0, name: '北境公约', members: [0, 1], leader: 0, cohesion: 60, formedTick: 100 }],
    wars: [{ key: '0-1', a: 0, b: 1, startTick: 10, aggressor: 0, reason: 'border', reasonText: 'w', goal: 6, popA0: 2, popB0: 2, lastActiveTick: 20 }] },
  // CVT29 判叛存续+盟主易位：三人盟 0-1 互战 → civ0（mil 50）叛离 → members [1,2] 存续（cohesion -22、rel(1,0)/(2,0)→-30）
  // → leader=0 不在 members → pop 继任（civ2 pop 5 > civ1 pop 2）→ 易位事件
  { name: 'CVT29-betray-succession', seed: 0x5c1e, ticks: 1, startTick: 23, hostTicks: true,
    civs: [
      { id: 0, pop: 2, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)], militarism: 50 },
      { id: 1, pop: 2, houses: 1, capital: idx(124, 80), tiles: [idx(124, 80)], militarism: 30 },
      { id: 2, pop: 5, houses: 1, capital: idx(200, 120), tiles: [idx(200, 120)] },
    ],
    rel: [[0, 1, -21]],
    alliances: [{ id: 0, name: '东海誓约', members: [0, 1, 2], leader: 0, cohesion: 60, formedTick: 100 }],
    wars: [{ key: '0-1', a: 0, b: 1, startTick: 10, aggressor: 0, reason: 'border', reasonText: 'w', goal: 6, popA0: 2, popB0: 2, lastActiveTick: 20 }] },
  // CVT30 凝聚力双盟：al0（rel 70→relAvg 70、caravan 商队 +0.4、warsTogether 3→bonded +8、mil 30）
  //   dh=0.5+0.4=0.9 → 55+0.9=55.9 → bonded → 63.9（f64 语义！cohesion double 修复实证）+ 袍泽事件/toast
  // al1（rel 10→relAvg<30 -1.5、mil 均 70>-60 -0.8）dh=0.5-1.5-0.8=-1.8 → 20-1.8=18.2 <25 → rng<0.3 → 涣散解散
  { name: 'CVT30-cohesion-two-als', seed: 0x2d4fb, ticks: 1, startTick: 23, hostTicks: true,
    civs: [
      { id: 0, pop: 2, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)] },
      { id: 1, pop: 2, houses: 1, capital: idx(124, 80), tiles: [idx(124, 80)] },
      { id: 2, pop: 2, houses: 1, capital: idx(200, 120), tiles: [idx(200, 120)] },
      { id: 3, pop: 2, houses: 1, capital: idx(204, 120), tiles: [idx(204, 120)], militarism: 70 },
      { id: 4, pop: 2, houses: 1, capital: idx(208, 120), tiles: [idx(208, 120)], militarism: 70 },
    ],
    rel: [[0, 1, 70], [2, 3, 10], [2, 4, 10], [3, 4, 10]],
    units: [{ id: 50, civ: 0, x: 121.5, y: 80.5, caravan: 1 }],
    alliances: [
      { id: 0, name: '南疆协定', members: [0, 1], leader: 0, cohesion: 55, formedTick: 100, warsTogether: 3 },
      { id: 1, name: '西陲联盟', members: [2, 3, 4], leader: 2, cohesion: 20, formedTick: 100 },
    ] },
  // CVT31 经济互助+种族漂移：al0 成员 gold 10/250 → rng<0.4 → 助济 -15/+15 + trade 事件；
  // 盟内异族对 culture 90/90 → shiftRaceRel +0.25；另 warData '2-3'（elf/orc 不同族交战）→ -0.3
  { name: 'CVT31-aid-drift', seed: 0x5c20, ticks: 1, startTick: 23, hostTicks: true,
    civs: [
      { id: 0, pop: 2, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)], gold: 10, culture: 90 },
      { id: 1, pop: 2, houses: 1, capital: idx(124, 80), tiles: [idx(124, 80)], gold: 250, culture: 90, race: 1, colorHex: '#3c6cc8' },
      { id: 2, pop: 2, houses: 1, capital: idx(200, 120), tiles: [idx(200, 120)], race: 1, colorHex: '#3c6cc8' },
      { id: 3, pop: 2, houses: 1, capital: idx(204, 120), tiles: [idx(204, 120)], race: 3, colorHex: '#c8a03c' },
    ],
    rel: [[0, 1, 60], [2, 3, -21]],
    alliances: [{ id: 0, name: '中原协约', members: [0, 1], leader: 0, cohesion: 55, formedTick: 100 }],
    wars: [{ key: '2-3', a: 2, b: 3, startTick: 10, aggressor: 3, reason: 'border', reasonText: 'w', goal: 6, popA0: 2, popB0: 2, lastActiveTick: 20 }] },
  // CVT32 旨意颁布+当轮达成：issue wealth param 300（gold 350≥300）→ directiveTick %30 → finishDirective success
  // → gold 350+120=470、deadline=30+50*40=2030、decree/decreeOk 事件 + 双 toast
  { name: 'CVT32-issue-wealth-success', seed: 0x5c21, ticks: 1, startTick: 30, hostTicks: true,
    civs: [{ id: 0, pop: 2, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)], gold: 350 }],
    issue: [{ at: 0, civ: 0, kind: 'wealth', param: 300 }] },
  // CVT33 颁布门禁：civ0 已有 1 条 active → 再颁不同 kind 成功（2 条）；civ1 已有 wealth active → 再颁 wealth 被拒
  { name: 'CVT33-issue-guards', seed: 0x5c22, ticks: 1, startTick: 30, hostTicks: true,
    civs: [
      { id: 0, pop: 2, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)], gold: 100 },
      { id: 1, pop: 2, houses: 1, capital: idx(124, 80), tiles: [idx(124, 80)], gold: 100 },
    ],
    directives: [
      { id: 1, civ: 0, kind: 'expand', param: 160, deadlineTick: 30 + 60 * 40 },
      { id: 2, civ: 1, kind: 'wealth', param: 300, deadlineTick: 30 + 50 * 40 },
    ],
    issue: [{ at: 0, civ: 0, kind: 'build', param: 0 }, { at: 0, civ: 1, kind: 'wealth', param: 0 }] },
  // CVT34 期限落败：expand 期限 20<30 → eval 领土 2<160 未达 → finishDirective failed → gold max(0,50-60)=0
  { name: 'CVT34-deadline-fail', seed: 0x5c23, ticks: 1, startTick: 30, hostTicks: true,
    civs: [{ id: 0, pop: 2, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80), idx(121, 80)], gold: 50 }],
    directives: [{ id: 1, civ: 0, kind: 'expand', param: 160, startTick: 0, deadlineTick: 20 }] },
  // CVT35 总动员颁布：mobilize 令 → mobilizeUntil=30+(830-30)*0.8=670 → job 0/1/5 → 战士（setJob 属性换算）+ 动员事件
  // → eval killCount 0 < 30 → active 存续
  { name: 'CVT35-mobilize-impulse', seed: 0x5c24, ticks: 1, startTick: 30, hostTicks: true,
    paint: [[115, 75, 130, 85, 3]],
    civs: [{ id: 0, pop: 4, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)] }],
    units: [
      { id: 10, civ: 0, x: 120.5, y: 80.5, job: 0 },
      { id: 11, civ: 0, x: 121.5, y: 80.5, job: 1 },
      { id: 12, civ: 0, x: 122.5, y: 80.5, job: 5 },
      { id: 13, civ: 0, x: 123.5, y: 80.5, job: 2 },
    ],
    issue: [{ at: 0, civ: 0, kind: 'mobilize', param: 0 }] },
  // CVT36 联盟令颁布：alliance 令 target=1（rel 10 ≥-20 不走 makePeace）→ met + rel max(10,45)=45
  // → formAlliance（pop 5≥3 → civ0 盟主）→ rel 60/raceRel+9 → directiveTick 当轮 eval 同盟 done → success +120
  { name: 'CVT36-alliance-directive', seed: 0x5c25, ticks: 1, startTick: 30, hostTicks: true,
    civs: [
      { id: 0, pop: 5, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)], gold: 20 },
      { id: 1, pop: 3, houses: 1, capital: idx(130, 80), tiles: [idx(130, 80)], race: 1, colorHex: '#3c6cc8', gold: 10 },
    ],
    rel: [[0, 1, 10]],
    issue: [{ at: 0, civ: 0, kind: 'alliance', param: 0, target: 1 }] },
  // CVT37 灭国令圣战：annihilate target=1 → declareWar holy force total → rel min(10,-90)=-90、
  // goal 0（holy 摧毁敌国）、giveUpAt 先 3600 后被覆写 deadline+800=30+120*40+800=5630、宣战烧钱 min(40,8+0)=8
  // → tryFormArmy pop 5<10 门早退（M-U3e 军团域桩位）→ eval target alive → active 存续
  { name: 'CVT37-annihilate-holy', seed: 0x5c26, ticks: 1, startTick: 30, hostTicks: true,
    civs: [
      { id: 0, pop: 5, houses: 1, capital: idx(120, 80), tiles: [idx(120, 80)], gold: 50 },
      { id: 1, pop: 3, houses: 1, capital: idx(130, 80), tiles: [idx(130, 80)], race: 1, colorHex: '#3c6cc8' },
    ],
    rel: [[0, 1, 10]],
    met: ['0-1'],
    issue: [{ at: 0, civ: 0, kind: 'annihilate', param: 0, target: 1 }] },
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

  // —— M-U3c 断言 ——
  const r17 = by['CVT17-crown-succession'];
  const c17 = r17.traces[0].civs[0];
  A('CVT17 noble crowned', c17.kingId === 1 && c17.kingName === 'u1', `kingId=${c17.kingId} kingName=${c17.kingName}`);
  const u17 = r17.traces[0].units.find((u) => u.id === 1);
  A('CVT17 job king + hp round', u17.job === 7 && u17.king === 1 && u17.hp === f64hex(12) && u17.maxHp === f64hex(12), `job=${u17.job} hp=${u17.hp}`);
  A('CVT17 dmg f64 ratio', u17.dmg === f64hex(1 * 1.5 / 1.1), `dmg=${u17.dmg}`);
  A('CVT17 succession announced', r17.traces[0].newEvents.some((e) => e.kind === 'king' && e.text.includes('加冕')), JSON.stringify(r17.traces[0].newEvents));
  A('CVT17 toast 新王', r17.traces[0].toasts.some((t) => t.text.includes('新王')), JSON.stringify(r17.traces[0].toasts));

  const r18 = by['CVT18-crown-first-silent'];
  const c18 = r18.traces[0].civs[0];
  // CVT18 无贵族 → 战士恒胜（job 2 权重 2 > 平民 1；评分区间不相交）
  A('CVT18 crowned silently', c18.kingId === 2 && c18.kingName === 'u2' && r18.traces[0].newEvents.length === 0 && r18.traces[0].toasts.length === 0, `kingId=${c18.kingId} ev=${r18.traces[0].newEvents.length} toast=${r18.traces[0].toasts.length}`);

  const r19 = by['CVT19-wall-build'];
  const wallDiffs = r19.traces[0].buildingDiff.filter(([, v]) => v === BUILD_KINDS.WALL);
  // 环采样重复怪癖：72 采样含同格重复（k=0/1 同落 (49,40)）→ 第 3 次建造对已砌格早退，
  //   但 gold 照扣 built 照计（蓝本 L1800-1803 原样）→ 独立墙体 2 面、支出 3 段 —— 黄金如实捕捉
  A('CVT19 2 unique walls (dup-sample quirk)', wallDiffs.length === 2, `walls=${wallDiffs.length}`);
  const c19 = r19.traces[0].civs[0];
  A('CVT19 gold paid', c19.gold === 94, `gold=${c19.gold}`);
  A('CVT19 hammer fx', r19.traces[0].effects.some((e) => e.kind === 'hammer'), `fx=${r19.traces[0].effects.map((e) => e.kind)}`);

  const r19b = by['CVT19b-wall-complete'];
  A('CVT19b no build', r19b.traces[0].buildingDiff.length === 0, `diff=${JSON.stringify(r19b.traces[0].buildingDiff)}`);
  A('CVT19b gold kept', r19b.traces[0].civs[0].gold === 100, `gold=${r19b.traces[0].civs[0].gold}`);
  A('CVT19b no fx', r19b.traces[0].effects.length === 0, `fx=${r19b.traces[0].effects.length}`);

  const r20 = by['CVT20-colony-launch'];
  const boater = r20.traces[0].units.find((u) => u.boat === 1 && u.boatTTL === 1200);
  A('CVT20 launched', !!boater, `boats=${r20.traces[0].units.filter((u) => u.boat === 1).length}`);
  A('CVT20 moved to water', boater && boater.x === f64hex(49.5) && boater.y === f64hex(49.5), boater ? `x=${boater.x}` : 'no boater');
  A('CVT20 target set', boater && boater.tx !== f64hex(50.5), boater ? `tx=${boater.tx}` : 'no boater');
  A('CVT20 colonize event', r20.traces[0].newEvents.some((e) => e.kind === 'colonize'), JSON.stringify(r20.traces[0].newEvents.map((e) => e.kind)));
  A('CVT20 cd set', r20.traces[0].civs[0].colonizeCd > 0, `cd=${r20.traces[0].civs[0].colonizeCd}`);

  const r21 = by['CVT21-rebel-split'];
  const last21 = r21.traces[0];
  A('CVT21 rebel created', last21.civs.length === 2 && last21.civs[1] && last21.civs[1].alive === true, `civs=${last21.civs.length}`);
  A('CVT21 rebel war', last21.warData.length === 1 && last21.warData[0].reason === 'rebel' && last21.warData[0].total === true, JSON.stringify(last21.warData.map((w) => [w.reason, w.total])));
  A('CVT21 rel -80', last21.rel.some(([k, v]) => k === '0-1' && v === -80), JSON.stringify(last21.rel));
  A('CVT21 totalWars', last21.totalWars.includes('0-1'), JSON.stringify(last21.totalWars));
  A('CVT21 pop moved', last21.civs[0].pop === 37 && last21.civs[1].pop === 3, `pop=${last21.civs[0].pop}/${last21.civs[1].pop}`);
  A('CVT21 units transferred', last21.units.filter((u) => u.civ === 1).length === 3, `civ1=${last21.units.filter((u) => u.civ === 1).length}`);
  A('CVT21 warHistory', last21.warHistory.includes(600), JSON.stringify(last21.warHistory));
  // 同种族 shiftRaceRel 早退（a===b return）—— 叛军与宗主同种族 → raceRel 零条目
  A('CVT21 raceRel early-return', last21.raceRel.length === 0, JSON.stringify(last21.raceRel));
  A('CVT21 found+casus events', last21.newEvents.some((e) => e.kind === 'found') && last21.newEvents.some((e) => e.kind === 'casus'), JSON.stringify(last21.newEvents.map((e) => e.kind)));

  const r22 = by['CVT22-merge-fuse'];
  const last22 = r22.traces[0];
  const c22 = last22.civs.find((c) => c.id === 0);
  const g22 = last22.civs.find((c) => c.id === 1);
  A('CVT22 merged flag', g22.alive === false && g22.mergedInto === 0, `alive=${g22.alive} mergedInto=${g22.mergedInto}`);
  A('CVT22 union name', c22.name === 'C0·C1联合王朝', `name=${c22.name}`);
  A('CVT22 gold 200', c22.gold === 200, `gold=${c22.gold}`);
  A('CVT22 pop 47', c22.pop === 47, `pop=${c22.pop}`);
  A('CVT22 techs union', JSON.stringify(c22.techs) === JSON.stringify(['masonry']), `techs=${JSON.stringify(c22.techs)}`);
  A('CVT22 rel remap', last22.rel.some(([k, v]) => k === '0-2' && v === -30) && !last22.rel.some(([k]) => k === '1-2'), JSON.stringify(last22.rel));
  A('CVT22 met remap', last22.met.includes('0-2') && !last22.met.includes('1-2'), JSON.stringify(last22.met));
  A('CVT22 directives settled', last22.directives.every((d) => d.status !== 'active') && last22.directives.find((d) => d.id === 0).status === 'failed' && last22.directives.find((d) => d.id === 1).status === 'success', JSON.stringify(last22.directives.map((d) => [d.id, d.status])));
  A('CVT22 alliance dissolved', last22.alliances.length === 0, `al=${last22.alliances.length}`);
  A('CVT22 evo society', last22.evoNodes.some((n) => n.kind === 'society'), JSON.stringify(last22.evoNodes.map((n) => n.kind).filter((k) => k !== 'species')));
  A('CVT22 unit transferred', last22.units.find((u) => u.id === 10).civ === 0, `u10.civ=${last22.units.find((u) => u.id === 10).civ}`);

  const r23 = by['CVT23-mobilize-setjob'];
  const us23 = r23.traces[0].units;
  A('CVT23 peasant armed', us23[0].job === 2 && us23[0].hp === f64hex(13), `job=${us23[0].job} hp=${us23[0].hp}`);
  A('CVT23 farmer armed', us23[1].job === 2 && us23[1].hp === f64hex(Math.round(10 * 1.3 / 0.95)), `hp=${us23[1].hp}`);
  A('CVT23 merchant untouched', us23[2].job === 5, `job=${us23[2].job}`);
  A('CVT23 dmg f64', us23[1].dmg === f64hex(1 * 1.35 / 0.9), `dmg=${us23[1].dmg}`);

  const r24 = by['CVT24-diplomacy-war'];
  const last24 = r24.traces[r24.traces.length - 1];
  A('CVT24 war declared', last24.warData.length === 1 && last24.warData[0].reason === 'border' && last24.warData[0].goal === 6, JSON.stringify(last24.warData.map((w) => [w.reason, w.goal])));
  A('CVT24 rel -45', last24.rel.some(([k, v]) => k === '0-1' && v === -45), JSON.stringify(last24.rel));
  A('CVT24 raceRel 22.5', last24.raceRel.some(([k, v]) => k === '0-1' && v === 22.5), JSON.stringify(last24.raceRel));
  A('CVT24 statWars 1', last24.statWars === 1, `statWars=${last24.statWars}`);
  A('CVT24 casus event', r24.traces.some((t) => t.newEvents.some((e) => e.kind === 'casus')), JSON.stringify(r24.traces.map((t) => t.newEvents.map((e) => e.kind))));

  const r25 = by['CVT25-eliminate-alliance'];
  const last25 = r25.traces[0];
  A('CVT25 eliminated', last25.civs.find((c) => c.id === 0).alive === false, 'civ0 消亡');
  A('CVT25 warData cleaned', last25.warData.length === 0, `warData=${JSON.stringify(last25.warData)}`);
  A('CVT25 alliance dissolved', last25.alliances.length === 0, `al=${last25.alliances.length}`);
  A('CVT25 decree gold', last25.civs.find((c) => c.id === 1).gold === 130, `gold=${last25.civs.find((c) => c.id === 1).gold}`);
  A('CVT25 decree success', last25.directives.find((d) => d.id === 0).status === 'success', JSON.stringify(last25.directives.map((d) => d.status)));
  A('CVT25 decreeOk event', last25.newEvents.some((e) => e.kind === 'decreeOk'), JSON.stringify(last25.newEvents.map((e) => e.kind)));
  A('CVT25 dissolve event', last25.newEvents.some((e) => e.kind === 'alliance' && e.text.includes('星散')), JSON.stringify(last25.newEvents.map((e) => [e.kind, e.text.slice(0, 20)])));

  // ==================== M-U3d 联盟系统 + 旨意颁布 ====================
  const r26 = by['CVT26-form-alliance'];
  const t26 = r26.traces[0];
  A('CVT26 alliance born', t26.alliances.length === 1 && t26.alliances[0].id === 1 && t26.alliances[0].leader === 0, JSON.stringify(t26.alliances));
  A('CVT26 name zhongyuan', t26.alliances[0] && t26.alliances[0].name.startsWith('中原'), `name=${t26.alliances[0]?.name}`);
  A('CVT26 cohesion 55.5', Math.abs(t26.alliances[0].cohesion - 55.5) < 1e-9, `coh=${t26.alliances[0].cohesion}`);
  A('CVT26 color first', t26.alliances[0].colorHex === '#14b8a6', `c=${t26.alliances[0].colorHex}`);
  A('CVT26 rel raised', t26.rel.some(([k, v]) => k === '0-1' && v === 60), JSON.stringify(t26.rel));
  A('CVT26 raceRel 34.15', t26.raceRel.some(([k, v]) => k === '0-1' && Math.abs(v - 34.15) < 1e-9), JSON.stringify(t26.raceRel));
  A('CVT26 form event', t26.newEvents.some((e) => e.kind === 'alliance' && e.text.includes('攻守同盟')), JSON.stringify(t26.newEvents.map((e) => e.kind)));
  A('CVT26 toast good', t26.toasts.some((t) => t.tone === 'good'), JSON.stringify(t26.toasts.map((t) => t.tone)));

  const r27 = by['CVT27-join-alliance'];
  const t27 = r27.traces[0];
  A('CVT27 joined', t27.alliances.length === 1 && t27.alliances[0].members.length === 3, JSON.stringify(t27.alliances[0]?.members));
  A('CVT27 rel 52', t27.rel.some(([k, v]) => k === '0-2' && v === 52) && t27.rel.some(([k, v]) => k === '1-2' && v === 52), JSON.stringify(t27.rel));
  A('CVT27 raceRel 29.3', t27.raceRel.some(([k, v]) => k === '0-1' && Math.abs(v - 29.3) < 1e-9), JSON.stringify(t27.raceRel));
  A('CVT27 join event', t27.newEvents.some((e) => e.kind === 'alliance' && e.text.includes('加入')), JSON.stringify(t27.newEvents.map((e) => [e.kind, e.text.slice(0, 16)])));

  const r28 = by['CVT28-betray-dissolve'];
  const t28 = r28.traces[0];
  A('CVT28 dissolved', t28.alliances.length === 0, `al=${t28.alliances.length}`);
  A('CVT28 rel -30', t28.rel.some(([k, v]) => k === '0-1' && v === -30), JSON.stringify(t28.rel));
  A('CVT28 betray event', t28.newEvents.some((e) => e.kind === 'alliance' && e.text.includes('刀兵相向')), JSON.stringify(t28.newEvents.map((e) => [e.kind, e.text.slice(0, 16)])));
  A('CVT28 star event', t28.newEvents.some((e) => e.kind === 'alliance' && e.text.includes('星散')), JSON.stringify(t28.newEvents.map((e) => e.text.slice(0, 16))));
  A('CVT28 toast danger', t28.toasts.some((t) => t.tone === 'danger'), JSON.stringify(t28.toasts));

  const r29 = by['CVT29-betray-succession'];
  const t29 = r29.traces[0];
  A('CVT29 survive', t29.alliances.length === 1 && JSON.stringify(t29.alliances[0].members) === '[1,2]', JSON.stringify(t29.alliances));
  A('CVT29 leader 2', t29.alliances[0].leader === 2, `leader=${t29.alliances[0].leader}`);
  A('CVT29 cohesion 37.8', Math.abs(t29.alliances[0].cohesion - 37.8) < 1e-9, `coh=${t29.alliances[0].cohesion}`);
  A('CVT29 rel both -30', t29.rel.some(([k, v]) => k === '0-1' && v === -30) && t29.rel.some(([k, v]) => k === '0-2' && v === -30), JSON.stringify(t29.rel));
  A('CVT29 successor event', t29.newEvents.some((e) => e.kind === 'alliance' && e.text.includes('易位')), JSON.stringify(t29.newEvents.map((e) => e.text.slice(0, 16))));

  const r30 = by['CVT30-cohesion-two-als'];
  const t30 = r30.traces[0];
  const al30 = t30.alliances[0];
  A('CVT30 bonded true', al30 && al30.bonded === true && al30.warsTogether === 3, JSON.stringify(al30));
  A('CVT30 cohesion 63.9', al30 && Math.abs(al30.cohesion - 63.9) < 1e-9, `coh=${al30?.cohesion}`);
  A('CVT30 al1 dissolved', t30.alliances.length === 1, `als=${t30.alliances.length}`);
  A('CVT30 fused event', t30.newEvents.some((e) => e.kind === 'alliance' && e.text.includes('涣散')), JSON.stringify(t30.newEvents.map((e) => e.text.slice(0, 14))));

  const r31 = by['CVT31-aid-drift'];
  const t31 = r31.traces[0];
  A('CVT31 gold moved', t31.civs.find((c) => c.id === 0).gold === 25 && t31.civs.find((c) => c.id === 1).gold === 235, `gold=${t31.civs.map((c) => c.gold)}`);
  A('CVT31 aid event', t31.newEvents.some((e) => e.kind === 'trade' && e.text.includes('雪中送炭')), JSON.stringify(t31.newEvents.map((e) => [e.kind, e.text.slice(0, 12)])));
  A('CVT31 drift +0.25', t31.raceRel.some(([k, v]) => k === '0-1' && Math.abs(v - 25.25) < 1e-9), JSON.stringify(t31.raceRel));
  A('CVT31 war drift -0.3', t31.raceRel.some(([k, v]) => k === '1-3' && Math.abs(v + 45.3) < 1e-9), JSON.stringify(t31.raceRel));

  const r32 = by['CVT32-issue-wealth-success'];
  const t32 = r32.traces[0];
  const d32 = t32.directives[0];
  A('CVT32 success', d32.status === 'success' && d32.deadlineTick === 2030 && d32.id === 1, JSON.stringify(d32));
  A('CVT32 gold 470', t32.civs[0].gold === 470, `gold=${t32.civs[0].gold}`);
  A('CVT32 decree events', t32.newEvents.some((e) => e.kind === 'decree') && t32.newEvents.some((e) => e.kind === 'decreeOk'), JSON.stringify(t32.newEvents.map((e) => e.kind)));
  A('CVT32 text rich', d32.text.includes('奉旨富国') && d32.text.includes('300'), d32.text);

  const r33 = by['CVT33-issue-guards'];
  const t33 = r33.traces[0];
  A('CVT33 civ0 two', t33.directives.filter((d) => d.civ === 0).length === 2 && t33.directives.some((d) => d.civ === 0 && d.kind === 'build' && d.id === 3), JSON.stringify(t33.directives.map((d) => [d.id, d.civ, d.kind])));
  A('CVT33 civ1 dup blocked', t33.directives.filter((d) => d.civ === 1).length === 1, `civ1=${t33.directives.filter((d) => d.civ === 1).length}`);
  A('CVT33 build deadline', t33.directives.find((d) => d.kind === 'build').deadlineTick === 2430, `dl=${t33.directives.find((d) => d.kind === 'build').deadlineTick}`);

  const r34 = by['CVT34-deadline-fail'];
  const t34 = r34.traces[0];
  const d34 = t34.directives[0];
  A('CVT34 failed', d34.status === 'failed' && d34.endTick === 30, JSON.stringify(d34));
  A('CVT34 endText', d34.endText.includes('期限已至') && d34.endText.includes('2 格'), d34.endText);
  A('CVT34 gold clamped 0', t34.civs[0].gold === 0, `gold=${t34.civs[0].gold}`);

  const r35 = by['CVT35-mobilize-impulse'];
  const t35 = r35.traces[0];
  A('CVT35 all armed', t35.units.filter((u) => u.civ === 0).every((u) => u.job === 2), JSON.stringify(t35.units.map((u) => u.job)));
  A('CVT35 hp transformed', t35.units[0].hp === f64hex(13), `hp=${t35.units[0].hp}`);
  A('CVT35 directive active', t35.directives[0].status === 'active' && t35.directives[0].param === 30 && t35.directives[0].deadlineTick === 830, JSON.stringify(t35.directives[0]));
  A('CVT35 war event', t35.newEvents.some((e) => e.kind === 'war' && e.text.includes('4 名国民')), JSON.stringify(t35.newEvents.map((e) => [e.kind, e.text.slice(0, 14)])));

  const r36 = by['CVT36-alliance-directive'];
  const t36 = r36.traces[0];
  A('CVT36 alliance formed', t36.alliances.length === 1 && t36.alliances[0].leader === 0 && t36.alliances[0].cohesion === 55, JSON.stringify(t36.alliances));
  A('CVT36 rel 60', t36.rel.some(([k, v]) => k === '0-1' && v === 60), JSON.stringify(t36.rel));
  A('CVT36 raceRel 34', t36.raceRel.some(([k, v]) => k === '0-1' && v === 34), JSON.stringify(t36.raceRel));
  A('CVT36 decree success', t36.directives[0].status === 'success', JSON.stringify(t36.directives[0]));
  A('CVT36 gold 140', t36.civs[0].gold === 140, `gold=${t36.civs[0].gold}`);

  const r37 = by['CVT37-annihilate-holy'];
  const t37 = r37.traces[0];
  const wd37 = t37.warData[0];
  A('CVT37 holy war', wd37 && wd37.reason === 'holy' && wd37.total === true && wd37.goal === 0 && wd37.aggressor === 0, JSON.stringify(wd37));
  A('CVT37 giveUpAt 5630', wd37 && wd37.giveUpAt === 5630, `g=${wd37?.giveUpAt}`);
  A('CVT37 rel -90', t37.rel.some(([k, v]) => k === '0-1' && v === -90), JSON.stringify(t37.rel));
  A('CVT37 totalWars', JSON.stringify(t37.totalWars) === '["0-1"]' && t37.warHistory.includes(30), `tw=${JSON.stringify(t37.totalWars)} wh=${JSON.stringify(t37.warHistory)}`);
  A('CVT37 gold 42', t37.civs.find((c) => c.id === 0).gold === 42, `gold=${t37.civs.find((c) => c.id === 0).gold}`);
  A('CVT37 raceRel 21', t37.raceRel.some(([k, v]) => k === '0-1' && v === 21), JSON.stringify(t37.raceRel));
  A('CVT37 active stays', t37.directives[0].status === 'active' && t37.directives[0].deadlineTick === 4830, JSON.stringify(t37.directives[0]));

  return asserts;
}

// 导出（种子猎取探针复用 —— 零同源复制；isMain 守卫保证 import 无副作用）
export { runScenario, scenarios };

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
      jobsDmgMul: JOBS.map((j) => j.dmgMul ?? null),
      jobsSpeedMul: JOBS.map((j) => j.speedMul ?? null),
      racesIsCiv: Object.keys(RACES).sort((a, b) => a - b).map((k) => !!RACES[k].isCiv),
      racesName: Object.keys(RACES).sort((a, b) => a - b).map((k) => RACES[k].name),
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
