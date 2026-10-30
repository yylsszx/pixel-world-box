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
const { T, R, RACES, JOBS, BUILDING_DEFS, BUILD_KINDS, DEFAULT_LAWS, TRAITS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
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
    // M-U3h 第三批 case2 涌现接力消费域（fam/fgn 旧场景硬编码 0 → 修正为透传：TS u.fam ?? 门需 undefined 语义）
    fam: o.fam, fgn: o.fgn, gene: o.gene ?? null,
    // M-U3h 第四批 case3 消费域（army 真值门 inArmy；cd 已置语义——Rust 侧置 14 后 bail，夹具透传）
    army: o.army ?? null, cd: o.cd ?? 0,
    // M-U3h 第五批 tail/post/move 消费域（字段只加：food 索敌/拾肉门、panic 繁衍恐慌、detour 索敌抑制、fert 繁衍增益、gene 已有）
    food: o.food, panic: o.panic, detour: o.detour, fert: o.fert,
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

// M-U3h 第五批：地面物品夹具（engine items.push L5388 结构 {id, kind, x, y}——tryPickup L5225 消费）
function mkItem(eng, o) {
  eng.items.push({ id: eng.itemSeq++, kind: o.kind, x: o.x, y: o.y });
}

// ---------------- dump 协议 ----------------
function dumpUnit(u) {
  return {
    id: u.id, race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx), ty: f64hex(u.ty),
    speed: f64hex(u.speed), flip: u.flip ? 1 : 0, job: u.job ?? 0,
    caravan: u.caravan ?? 0, boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0, dead: u.dead ?? 0, hurt: u.hurt ?? 0,
    cd: u.cd ?? 0, // M-U3h 第四批 case3 弓手 cd=18 消费域（字段只加）
    // M-U3h 第二批 case1 消费域扩展（字段只加：旧场景恒 0/10/null，不漂移）
    age: f64hex(u.age ?? 0), hp: f64hex(u.hp ?? 10), maxHp: f64hex(u.maxHp ?? 10),
    // M-U3h 第五批消费域断言扩展（字段只加：dmg 拾取加成、food 索敌/拾肉、wep 换装）
    dmg: f64hex(u.dmg ?? 1), food: u.food ?? null, wep: u.wep ?? null,
    grab: u.grab ?? null, thrT: u.thrT ?? null,
    thrVx: u.thrVx === undefined ? null : f64hex(u.thrVx), thrVy: u.thrVy === undefined ? null : f64hex(u.thrVy),
    thrX0: u.thrX0 === undefined ? null : f64hex(u.thrX0), thrY0: u.thrY0 === undefined ? null : f64hex(u.thrY0),
  };
}
// case2 新生儿全字段 dump（spawnUnit 产物 —— 与 relay target 不同协议：全量出生态）
function dumpChild(u) {
  if (!u) return null;
  return {
    id: u.id, race: u.race, civ: u.civ ?? -1,
    x: f64hex(u.x), y: f64hex(u.y), lx: f64hex(u.lx), ly: f64hex(u.ly), rx: f64hex(u.rx), ry: f64hex(u.ry),
    tx: f64hex(u.tx), ty: f64hex(u.ty),
    hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), dmg: f64hex(u.dmg), speed: f64hex(u.speed),
    tDmg: u.tDmg === undefined ? null : f64hex(u.tDmg), tHp: u.tHp === undefined ? null : f64hex(u.tHp),
    age: f64hex(u.age), maxAge: f64hex(u.maxAge), kills: u.kills, cd: u.cd,
    trait: u.trait ?? null,
    gene: u.gene ? { s: f64hex(u.gene.s), d: f64hex(u.gene.d), h: f64hex(u.gene.h), r: f64hex(u.gene.r) } : null,
    job: u.job ?? null, infected: u.infected ? 1 : 0, flip: u.flip ? 1 : 0,
    name: u.name, hurt: u.hurt ?? 0, breath: u.breath, parity: u.parity, dead: u.dead ? 1 : 0,
    fam: u.fam ?? null, fgn: u.fgn ?? null,
  };
}
function dumpTrait(t) {
  return { key: t.key, name: t.name, desc: t.desc, good: t.good === true ? true : undefined,
    dmgMul: t.dmgMul === undefined ? null : f64hex(t.dmgMul), hpMul: t.hpMul === undefined ? null : f64hex(t.hpMul),
    speedMul: t.speedMul === undefined ? null : f64hex(t.speedMul), regen: t.regen === undefined ? null : f64hex(t.regen) };
}
function dumpFamily(f) {
  return { id: f.id, name: f.name, race: f.race, founded: f.founded, founder: f.founder,
    members: f.members, heroes: f.heroes, kills: f.kills, peak: f.peak, milestones: f.milestones };
}
function dumpCiv(c) {
  return { id: c.id, name: c.name, race: c.race, pop: c.pop, houses: c.houses, capital: c.capital,
    alive: c.alive, gold: c.gold ?? null, knowledge: c.knowledge ?? null, colorHex: c.colorHex,
    tiles: [...c.tiles] };
}
function dumpEffect(e) {
  if (!e) return null;
  return { kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), x0: f64hex(e.x0), y0: f64hex(e.y0), r: f64hex(e.r), age: f64hex(e.age), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir),
    // M-U3h 第五批：fx('dmg',...,{text}) 拾取播报文本维度（字段只加）
    text: e.text ?? null };
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
  // case3 warData 记分夹具（addWarScore/noteOccupied 消费——atWar 判定走 rel 基，warData 只承载增量）
  for (const wd of sc.wars ?? []) {
    eng.warData.set(wd.a < wd.b ? `${wd.a}-${wd.b}` : `${wd.b}-${wd.a}`, { key: wd.a < wd.b ? `${wd.a}-${wd.b}` : `${wd.b}-${wd.a}`,
      a: wd.a, b: wd.b, startTick: 0, startYear: 0, total: false, scoreA: 0, scoreB: 0, exA: 0, exB: 0, casA: 0, casB: 0,
      razedA: 0, razedB: 0, battles: 0, giveUpAt: 0, reason: 'border', reasonText: '', aggressor: 0, goal: 0, goalNow: 0,
      occA: 0, occB: 0, popA0: 0, popB0: 0 });
  }
  if (sc.setup) sc.setup(eng);
  // M-U3h 第五批夹具（清理后施加：items/preyGrid/grassTiles/directive 属黄金基线的一部分）
  for (const it of sc.items ?? []) mkItem(eng, it);                                     // 地面物品（tryPickup 消费）
  if (sc.preyGrid) for (const [ci, n] of sc.preyGrid) eng.preyGrid[ci] = n;             // 猎物密度场（索敌导航消费——直调不跑生态核算，全显式注入）
  if (sc.grassTiles != null) eng.grassTiles = sc.grassTiles;                            // 植被计数（野生繁衍增益消费）
  if (sc.directive) eng.directives.push({ id: 0, civ: sc.directive.civ, kind: sc.directive.kind,
    target: null, param: 0, status: 'active', startTick: 0 });                          // 旨意夹具（繁衍 populate ×1.8 消费）
  eng.tickCount = sc.startTick ?? 0;
  if (sc.lastSiegeEventTick != null) eng.lastSiegeEventTick = sc.lastSiegeEventTick; // case3 攻城纪事节流阀夹具
  eng.yearF = sc.yearF ?? 0;                                              // 纪事/图谱/家族年份基准（case2 消费）
  // 夹具后清 generate 残留（同 civtick gen 纪律：黄金基线只含夹具+relay 产物）
  eng.effects.length = 0;
  eng.dirty.clear();
  eng.propsDirty.clear();
  eng.worldEvents.length = 0;
  eng.__lastEventId = eng.eventSeq;
  // case2 域残留清理（ctor generate() 预填家族/野种计数/演化图谱——Task 129 实证 famCnt=37 污染）
  eng.families.clear();
  eng.familySeq = 0;
  eng.wildCount.clear();
  eng.dynTraits.clear();
  // TRAITS 模块级全局表重置（第五批实锤：E 系场景 inventEmergentTrait 追加的 dt* 条目跨场景污染 rollTrait 的 keys.length——
  //   Task 122 RACES 进程内污染同源教训；清理后 TRAITS 回预设 12 条，后续场景 rollTrait 抽取域一致）
  for (const tk of Object.keys(TRAITS)) if (tk.startsWith('dt')) delete TRAITS[tk];
  eng.traitSeq = 0;
  eng.evoNodes.length = 0;
  eng.evoSeq = 0;
  eng.evoIndex.clear();
  eng.unitSeq = eng.units.reduce((m, u) => Math.max(m, u.id + 1), 0);
  // case2 夹具（清理后施加：radiate/wildCount 属黄金基线的一部分，不可被残留清理抹除）
  if (sc.radiate) for (const [i, v] of sc.radiate) eng.radiate[i] = v;   // 辐射场夹具（case2 高压锅门）
  if (sc.wildCount) for (const [r, n] of sc.wildCount) eng.wildCount.set(r, n); // 野种计数夹具（case2 cap 门）

  const rngA0 = eng.rngA >>> 0;
  const eventSeq0 = eng.eventSeq;
  const toastSeq0 = eng.toastSeq;
  const unitSeq0 = eng.unitSeq;
  const familySeq0 = eng.familySeq;
  const traitSeq0 = eng.traitSeq;
  const evoSeq0 = eng.evoSeq;

  // —— relay 直调（engine L3148 同入口：wbResume(u, r.kind, r.data)）——
  const target = eng.unitById.get(sc.unitId);
  if (!target) throw new Error(`scenario ${sc.name}: unit ${sc.unitId} not found`);
  const data = Float64Array.from(sc.data ?? []);
  const kind = sc.kind;
  // M-U3h 第五批直调协议（fn 分派；Task 125 renderMinimap 直调先例）：tail/post/move/board 单步直调，
  //   桶由 gen 显式 rebuild（模拟 tick 头 rebuildBuckets——C# 侧同规则自 units 重建，协议对齐）
  let tailRet = null;
  if (sc.fn === 'tail') { eng.rebuildBuckets(); tailRet = eng.updateUnitTailJS(target) === true; }
  else if (sc.fn === 'post') { eng.updateUnitPostJS(target); }
  else if (sc.fn === 'move') { eng.moveUnit(target, sc.mul ?? 1); }
  else if (sc.fn === 'board') { tailRet = eng.maybeBoardForWar(target) === true; }
  else { eng.wbResume(target, kind, data); }

  return {
    name: sc.name, seed, startTick: sc.startTick ?? 0, kind, unitId: sc.unitId, data: [...(sc.data ?? [])],
    // M-U3h 第五批：直调协议标识（resume=wbResume 契约不变；tail/post/move/board=单步直调）
    fn: sc.fn ?? 'resume', tailRet, mul: sc.mul ?? null,
    laws: eng.laws, rngA0, eventSeq0, toastSeq0, yearF: eng.yearF,
    unitSeq0, familySeq0, traitSeq0, evoSeq0,
    terrainRle: rle(eng.terrain),
    // 声明式 PRE 态夹具（C#/转写回放重建源——与 civtick gen fixture 协议同构）
    fixture: { civs: sc.civs ?? null, units: sc.units ?? null, rel: sc.rel ?? null,
      buildings: sc.buildings ?? null, alliances: sc.alliances ?? null, marketIdx: sc.marketIdx ?? null,
      radiate: sc.radiate ?? null, wildCount: sc.wildCount ?? null, yearF: sc.yearF ?? null,
      wars: sc.wars ?? null, lastSiegeEventTick: sc.lastSiegeEventTick ?? null,
      // M-U3h 第五批夹具声明（items/preyGrid/grassTiles/directive——C# 灌入源）
      items: sc.items ?? null, preyGrid: sc.preyGrid ?? null, grassTiles: sc.grassTiles ?? null,
      directive: sc.directive ?? null, mul: sc.mul ?? null },
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
    // M-U3h 第三批 case2 POST 态（新生儿/涌现特质/演化图谱/家族/野种计数/序列器）——
    //   child 按 id≥unitSeq0 定位（cap 门不产子时为 null，勿用末位单位——那是父代）
    child: dumpChild(eng.units.find((uu) => uu.id >= unitSeq0) ?? null),
    traits: [...eng.dynTraits.values()].map(dumpTrait),
    evoNodes: eng.evoNodes.map((n) => ({ id: n.id, kind: n.kind, name: n.name, parent: n.parent ?? null,
      year: n.year, colorHex: n.colorHex, detail: n.detail, stat: n.stat ?? null })),
    families: [...eng.families.values()].map(dumpFamily),
    wildCountPost: [...eng.wildCount.entries()],
    unitSeq: eng.unitSeq, familySeq: eng.familySeq, traitSeq: eng.traitSeq, evoSeq: eng.evoSeq,
    radiateRle: rle(Array.from(eng.radiate)),
    // M-U3h 第四批 case3 POST 态（warData 记分增量/shake 已有/wd 节流阀）
    wars: [...eng.warData.values()].map((wd) => ({ key: wd.key, a: wd.a, b: wd.b, scoreA: wd.scoreA, scoreB: wd.scoreB,
      casA: wd.casA, casB: wd.casB, exA: wd.exA, exB: wd.exB, razedA: wd.razedA, razedB: wd.razedB, occA: wd.occA, occB: wd.occB })),
    lastSiegeEventTick: eng.lastSiegeEventTick,
    // M-U3h 第五批 POST 态（地面物品余量/编队舰队全单位/野种计数已有——itemsPost/fleet 字段只加）
    itemsPost: eng.items.map((it) => ({ id: it.id, kind: it.kind, x: f64hex(it.x), y: f64hex(it.y) })),
    fleet: (sc.fn === 'board') ? eng.units.map(dumpUnit) : null,
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

  // ===== case 2 涌现接力（M-U3h 第三批：辐射放大 cg L3233-3241 + inventEmergentTrait L3318-3330 +
  //   文明/野生双分支 L3242-3256 → spawnUnit L1283-1465 + newFamily L1111 + wildCapOf L2132；d=[s,d,h,r,branch]）=====
  // E01 野生羊基础：cg s=1.6 强项（speed 路径）→ inventTrait 词表掷骰 + 0.25 新家族门（fam undefined）→
  //   spawnUnit 静默野生全生态（wildAlive 预算/maxAge/flip/name/breath 掷骰 + bumpWild + heart fx）
  { name: 'E01-emerge-wild-sheep', seed: 0x5d01, kind: 2, data: [1.6, 1.0, 1.2, 1.0, 0], startTick: 0, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    units: [{ id: 5, race: 6, x: 60.5, y: 70.5 }] },
  // E02 辐射高压锅：radiate[unit tile]=1 → cg 二次放大 ×2.2 钳 [0.5,2]（pg=gene??基线 → 母代无 gene → 全 1）
  { name: 'E02-emerge-radiate-amp', seed: 0x5d02, kind: 2, data: [1.6, 1.0, 1.2, 1.0, 0], startTick: 0, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    units: [{ id: 5, race: 6, x: 60.5, y: 70.5 }],
    radiate: [[idx(60, 70), 1]] },
  // E03 文明分支：d[4]=1 → 人类 pop/上限门已在 Rust 过 → rollJob 加权抽取 + techModsOf/govOf + pop++
  { name: 'E03-emerge-civ-spawn', seed: 0x5d03, kind: 2, data: [1.0, 1.0, 1.0, 1.0, 1], startTick: 0, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(60, 70), tiles: [idx(60, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5 }] },
  // E05 regen 兕底分支：基因全中性（<1.5）→ regen+hpMul 路径（词表/数值掷骰异流）
  { name: 'E05-emerge-regen-path', seed: 0x5d05, kind: 2, data: [1.0, 1.0, 1.0, 1.0, 0], startTick: 0, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    units: [{ id: 5, race: 6, x: 60.5, y: 70.5 }] },
  // E06 种群上限门：wildCount[6]=240=cap → same<cap 假 → 不产子不掷家族门（inventTrait 掷骰已耗）
  { name: 'E06-emerge-cap-gate', seed: 0x5d06, kind: 2, data: [1.6, 1.0, 1.2, 1.0, 0], startTick: 0, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    units: [{ id: 5, race: 6, x: 60.5, y: 70.5 }],
    wildCount: [[6, 240]] },
  // E07 异种子变体：同夹具异 seed → 词表/数值/家族门掷骰变体（与 E01 覆盖 0.25 门两侧可能）
  { name: 'E07-emerge-wild-seed-b', seed: 0x5d07, kind: 2, data: [1.6, 1.0, 1.2, 1.0, 0], startTick: 0, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    units: [{ id: 5, race: 6, x: 60.5, y: 70.5 }] },

  // ===== case 3 建筑摧毁级联（M-U3h 第四批：onBuildingDestroyed L4464 + destroyBuilding L1936 +
  //   capture/raze/sack 三路 + annexTiles L4510 + addWarScore L7234 + noteOccupied L7172 +
  //   弓手轰击 enemyBuildingNear L4396 + castArrow L4368 + inArmy 跳过段 + nearestEnemyBuilding L4421；
  //   maybeBoardForWar L5740 GUARD（0.05 门受控不可达）；d=[tile,byCiv]）=====
  // D01 raze 基础：HOUSE(可占领) atWar startTick=200 → capture 门掷≥0.45 不易帜 → destroyBuilding(smoke fx)
  //   + addWarScore 5 'raze' + siege 纪事（200-0>150 节流门开，lastSiegeEventTick=200）
  { name: 'D01-raze-basic', seed: 0x5e01, kind: 3, data: [idx(70, 70), 0], startTick: 200, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(50, 70), tiles: [idx(50, 70)] }, { id: 1, pop: 3, capital: idx(72, 70), tiles: [idx(72, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5, job: 0, tx: 70.5, ty: 70.5 }],
    rel: [[0, 1, -30]],
    wars: [{ a: 0, b: 1 }],
    buildings: [[idx(70, 70), 1, 1]] },
  // D02 capture 45%：capture 门掷<0.45 → buildBuilding 易帜 + annexTiles(2) 圈地（took→occA）+ score 8 'capture'
  //   + capture 纪事 + spawn fx + overlayDirty 门（overlayMode none → 不置脏）
  { name: 'D02-capture-45', seed: 0x5e02, kind: 3, data: [idx(70, 70), 0], startTick: 200, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(50, 70), tiles: [idx(50, 70)] }, { id: 1, pop: 3, capital: idx(72, 70), tiles: [idx(72, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5, job: 0, tx: 70.5, ty: 70.5 }],
    rel: [[0, 1, -30]],
    wars: [{ a: 0, b: 1 }],
    buildings: [[idx(70, 70), 1, 1]] },
  // D03 TOWER 纯 raze：TOWER ∉ CAPTURABLE → capture 门不掷（rng 流少一次）→ 直接 raze
  { name: 'D03-tower-raze', seed: 0x5e03, kind: 3, data: [idx(70, 70), 0], startTick: 200, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(50, 70), tiles: [idx(50, 70)] }, { id: 1, pop: 3, capital: idx(72, 70), tiles: [idx(72, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5, job: 0, tx: 70.5, ty: 70.5 }],
    rel: [[0, 1, -30]],
    wars: [{ a: 0, b: 1 }],
    buildings: [[idx(70, 70), 3, 1]] },
  // D04 王都陷落：CAPITAL → sackCapital（shake=10 + annexTiles(6) + score 40 'capital' + sack 纪事 + toast + onSound no-op）
  //   destroyBuilding 先行（capital=-1），sack 的 annex 循环对已拆瓦建筑零易帜
  { name: 'D04-capital-sack', seed: 0x5e04, kind: 3, data: [idx(70, 70), 0], startTick: 200, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(50, 70), tiles: [idx(50, 70)] }, { id: 1, pop: 3, capital: idx(70, 70), tiles: [idx(70, 70), idx(71, 70), idx(69, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5, job: 0, tx: 70.5, ty: 70.5 }],
    rel: [[0, 1, -30]],
    wars: [{ a: 0, b: 1 }],
    buildings: [[idx(70, 70), 2, 1]] },
  // D05 天灾早退：byCiv=-1 → destroyBuilding 照做 → byCiv<0 return（零 warScore 零纪事零 capture 掷）
  { name: 'D05-disaster-early', seed: 0x5e05, kind: 3, data: [idx(70, 70), -1], startTick: 200, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(50, 70), tiles: [idx(50, 70)] }, { id: 1, pop: 3, capital: idx(72, 70), tiles: [idx(72, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5, job: 0, tx: 70.5, ty: 70.5 }],
    rel: [[0, 1, -30]],
    wars: [{ a: 0, b: 1 }],
    buildings: [[idx(70, 70), 1, 1]] },
  // D06 非交战早退：attacker/victim alive 但 !atWar（rel 缺）→ 只摧毁无结算（capture 门不进）
  { name: 'D06-peace-early', seed: 0x5e06, kind: 3, data: [idx(70, 70), 0], startTick: 200, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(50, 70), tiles: [idx(50, 70)] }, { id: 1, pop: 3, capital: idx(72, 70), tiles: [idx(72, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5, job: 0, tx: 70.5, ty: 70.5 }],
    wars: [{ a: 0, b: 1 }],
    buildings: [[idx(70, 70), 1, 1]] },
  // D07 弓手轰击：job=3 cd=0 → 弓手门 rng<0.1 → enemyBuildingNear(5) 索敌 → castArrow（arrow fx x0/y0/src/r:0）+ cd=18
  //   靶建筑 idx(65,70) 距 u 4.5 格 ≤5 射程内
  { name: 'D07-archer-bombard', seed: 0x5e27, kind: 3, data: [idx(70, 70), 0], startTick: 200, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(50, 70), tiles: [idx(50, 70)] }, { id: 1, pop: 3, capital: idx(72, 70), tiles: [idx(72, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5, job: 3, cd: 0, tx: 70.5, ty: 70.5 }],
    rel: [[0, 1, -30]],
    wars: [{ a: 0, b: 1 }],
    buildings: [[idx(70, 70), 1, 1], [idx(65, 70), 1, 1]] },
  // D08 inArmy 跳过段：u.army=1 → 跳 0.05 登船门/1.44 重定向段（rng 流短）直接尾段（tailJS/postJS 无 army 分支实证）
  { name: 'D08-inarmy-skip', seed: 0x5e08, kind: 3, data: [idx(70, 70), 0], startTick: 200, unitId: 5,
    paint: [[40, 60, 80, 80, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(50, 70), tiles: [idx(50, 70)] }, { id: 1, pop: 3, capital: idx(72, 70), tiles: [idx(72, 70)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 60.5, y: 70.5, job: 0, army: 1, tx: 70.5, ty: 70.5 }],
    rel: [[0, 1, -30]],
    wars: [{ a: 0, b: 1 }],
    buildings: [[idx(70, 70), 1, 1]] },
  // ===== M-U3h 第五批：tail 捕食者索敌/鱼群/漫游三分支 + post 拾取/繁衍 + moveUnit 四分支 + maybeBoardForWar =====
  //   直调协议（fn 分派）——Task 125 renderMinimap 直调先例；updateUnit 主体 L3465-4113（战斗/职业 650 行）
  //   非 M-U3h 收官依赖（Task 131 遗留②），case1 非船域保持桩——tail/post/move/board 从函数入口直调。
  // D09 登船参战基础：job3 作战职业 + atWar(rel -60) + 直线 d=27 跨水 85%≥45% + dock findWaterNear(4) 命中
  //   → board(u) 单舰 fleet=1（rng: ttl 1 + x/y 2 = 3）无纪事；tx/ty 语义 = 指向敌岛目标（不重定向）
  { name: 'D09-board-basic', seed: 0x5f09, kind: 1, fn: 'board', unitId: 5,
    paint: [[30, 38, 55, 43, GRASS], [56, 30, 82, 50, DEEP], [76, 38, 95, 43, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(32, 40), tiles: [idx(32, 40)] }, { id: 1, pop: 3, capital: idx(90, 40), tiles: [idx(90, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 52.5, y: 40.5, job: 3, tx: 80.5, ty: 40.5 }],
    rel: [[0, 1, -60]] },
  // D10 编队远征：+3 同袍（job2/3 距 ≤6）→ board×4 fleet=4（rng 3+6=9）→ fleet≥3 跨海纪事
  { name: 'D10-board-fleet', seed: 0x5f0a, kind: 1, fn: 'board', unitId: 5,
    paint: [[30, 38, 55, 43, GRASS], [56, 30, 82, 50, DEEP], [76, 38, 95, 43, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(32, 40), tiles: [idx(32, 40)] }, { id: 1, pop: 3, capital: idx(90, 40), tiles: [idx(90, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 52.5, y: 40.5, job: 3, tx: 80.5, ty: 40.5 },
            { id: 6, race: 0, civ: 0, x: 54.5, y: 38.5, job: 2 }, { id: 7, race: 0, civ: 0, x: 53.5, y: 39.5, job: 2 },
            { id: 8, race: 0, civ: 0, x: 52.5, y: 40.5, job: 2 }],
    rel: [[0, 1, -60]] },
  // D11 水占比不足：全程 GRASS（采样 water=0 <45%）→ false 零掷（rng 0 消费——采样纯几何）
  { name: 'D11-board-nowater', seed: 0x5f0b, kind: 1, fn: 'board', unitId: 5,
    paint: [[30, 38, 95, 43, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(32, 40), tiles: [idx(32, 40)] }, { id: 1, pop: 3, capital: idx(90, 40), tiles: [idx(90, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 53.5, y: 40.5, job: 3, tx: 80.5, ty: 40.5 }],
    rel: [[0, 1, -60]] },
  // D12 无码头：跨水 54%≥45% 过采样门，但 findWaterNear(4) 全 GRASS miss → false 零掷（dock 在 ttl 掷前）
  { name: 'D12-board-nodock', seed: 0x5f0c, kind: 1, fn: 'board', unitId: 5,
    paint: [[40, 36, 67, 45, GRASS], [68, 30, 100, 50, DEEP], [96, 38, 100, 43, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(42, 40), tiles: [idx(42, 40)] }, { id: 1, pop: 3, capital: idx(98, 40), tiles: [idx(98, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 45.5, y: 40.5, job: 3, tx: 95.5, ty: 40.5 }],
    rel: [[0, 1, -60]] },
  // F01 索敌命中：wolf food=60<70 + rng<0.4 门开 → 6 桶扫猎 u6 sheep（isHerbivoreRace）→ tx/ty=prey + moveUnit(1.15) return true
  { name: 'F01-pred-hunt', seed: 0x5f11, kind: 1, fn: 'tail', unitId: 5,
    paint: [[30, 35, 55, 46, GRASS]],
    units: [{ id: 5, race: 7, civ: -1, x: 40.5, y: 40.5, food: 60 }, { id: 6, race: 6, civ: -1, x: 42.5, y: 41.5 }],
    setup: (eng) => { eng.rngA = 7920; } },
  // F02 密度场导航：嗅觉内无猎 → preyGrid 注入 [231]=3（cx2=7,cy2=7 相对 gx,gy=5,5 的 d=2.83≥0.9）
  //   → bestCell=231 → tx=(231%32)*8+4=60±2 ty=((231/32)|0)*8+4=60±2（rng 门1+tx1+ty1=3）+ moveUnit(1.15) return true
  { name: 'F02-pred-grid', seed: 0x5f12, kind: 1, fn: 'tail', unitId: 5,
    paint: [[30, 35, 70, 70, GRASS]],
    units: [{ id: 5, race: 7, civ: -1, x: 40.5, y: 40.5, food: 60 }],
    preyGrid: [[231, 3]] },
  // F03 鱼群结队：FISH + rng<0.12 门开 → 3×3 桶浅扫 n=2（u6/u7 距≤6）→ 重心水域 → tx/ty=重心±1（rng 门1+2）
  //   → 漫游门 rng<0.02 关（1）→ moveUnit(u,1) 水生直走
  { name: 'F03-fish-school', seed: 0x5f13, kind: 1, fn: 'tail', unitId: 5,
    paint: [[30, 35, 55, 46, DEEP]],
    units: [{ id: 5, race: 37, civ: -1, x: 40.5, y: 40.5 }, { id: 6, race: 37, civ: -1, x: 42.5, y: 40.5 },
            { id: 7, race: 37, civ: -1, x: 40.5, y: 42.5 }],
    setup: (eng) => { eng.rngA = 293004; } },
  // F04 鱼群重心陆：全图 GRASS 搁浅三鱼 → 鱼群门开 n=2 重心 GRASS → isWater false 不设目标（tx/ty rng 不掷）
  //   → 漫游门开（dist²=0）→ wx/wy 2 + 水生 4 重选 8 全败 → findWaterNear(14) miss → 原地 → moveUnit 搁浅蹦跳 f=0.7
  { name: 'F04-fish-center-land', seed: 0x5f14, kind: 1, fn: 'tail', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    units: [{ id: 5, race: 37, civ: -1, x: 40.5, y: 40.5 }, { id: 6, race: 37, civ: -1, x: 50.5, y: 40.5 },
            { id: 7, race: 37, civ: -1, x: 49.5, y: 41.5 }],
    setup: (eng) => { eng.rngA = 293004; } },
  // F05 逐草而行：wolf food=50<55 + 索敌门 rng≥0.4 关（1）→ 漫游门开（dist²=0）→ wx/wy 2 + 逐草 k0 命中 GRASS（2）break
  { name: 'F05-graze', seed: 0x5f15, kind: 1, fn: 'tail', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    units: [{ id: 5, race: 7, civ: -1, x: 40.5, y: 40.5, food: 50 }] },
  // F06 蟹滩涂限定：CRAB 全图 GRASS → 蟹门 4 重选（水/邻水沙全非）→ 原地 wx=u.x（rng 2+8=10）→ moveUnit d<0.05 直退
  { name: 'F06-crab-inland', seed: 0x5f16, kind: 1, fn: 'tail', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    units: [{ id: 5, race: 38, civ: -1, x: 40.5, y: 40.5 }] },
  // F07 水生漫游 miss：FISH 搁浅 + 鱼群门关（1）→ 漫游门开 → wx/wy 2 + 水生 4 重选 8 全败 → findWaterNear(14) miss → 原地蹦跳
  { name: 'F07-aqua-roam', seed: 0x5f17, kind: 1, fn: 'tail', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    units: [{ id: 5, race: 37, civ: -1, x: 40.5, y: 40.5 }] },
  // H01 拾肉：wolf food=60 + meat 落地（|dx|≤0.9）→ predator !undead → food=min(160,105)=105 + fx dmg'饱' + splice + heart
  //   → 繁衍门 rng<0.004 关（1）——items 空 POST
  { name: 'H01-pickup-meat', seed: 0x5f21, kind: 1, fn: 'post', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    units: [{ id: 5, race: 7, civ: -1, x: 40.5, y: 40.5, food: 60 }],
    items: [{ kind: 'meat', x: 40.8, y: 40.5 }],
    setup: (eng) => { eng.rngA = 1; } },
  // H02 拾装备：human + sword3 黄金圣剑（rank3 rarity3 dmg18）→ 换装 u.wep + dmg+=18 + spawn fx + dmg fx text + toast（rarity≥3）
  { name: 'H02-pickup-gear', seed: 0x5f22, kind: 1, fn: 'post', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(40, 40), tiles: [idx(40, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 40.5, y: 40.5 }],
    items: [{ kind: 'sword3', x: 40.5, y: 40.5 }],
    setup: (eng) => { eng.rngA = 1; } },
  // H03 文明繁衍全链：human civ0 + populate 旨意（×1.8）+ gene.r=1.2 + repro 门 rng<0.006 开 + boost 门开
  //   → pop 门（6<cap+6）→ childGene（mut×4 + GRASS r 维 1）→ extreme 假零掷 → fam 门关（u.fam=undefined→rng≥0.25）
  //   → spawnUnit（civ silent + gene + heart fx）
  { name: 'H03-repro-civ', seed: 0x5f23, kind: 1, fn: 'post', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    civs: [{ id: 0, pop: 2, capital: idx(40, 40), tiles: [idx(40, 40)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 40.5, y: 40.5, gene: { s: 1.1, d: 1.0, h: 1.0, r: 1.2 } }],
    directive: { civ: 0, kind: 'populate' },
    setup: (eng) => { eng.rngA = 300923; } },
  // H04 野生繁衍：sheep civ=-1 + wildCount{6:3}<cap + grassTiles=8000（×1.125 植被增益）+ 门1 开 + boost 门开
  //   → fam 门开（rng<0.25 命中 → newFamily 开宗）→ spawnUnit（wild silent）+ heart + families/wildCountPost 断言
  { name: 'H04-repro-wild', seed: 0x5f24, kind: 1, fn: 'post', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    units: [{ id: 5, race: 6, civ: -1, x: 40.5, y: 40.5 }],
    wildCount: [[6, 3]], grassTiles: 8000,
    setup: (eng) => { eng.rngA = 736468; } },
  // H05 捕食者饥饿绝育：wolf food=30 → 门1 rng<0.004 开 → boost 计算含捕食者丰猎（1.6+0）→ 门2 (!predator||food>40)=false 短路零掷
  { name: 'H05-repro-gate-fail', seed: 0x5f25, kind: 1, fn: 'post', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    units: [{ id: 5, race: 7, civ: -1, x: 40.5, y: 40.5, food: 30 }],
    setup: (eng) => { eng.rngA = 300923; } },
  // I01 飞行直落：DRAGON flying → moveUnit 主干 + flying 分支钳位 [0.5,W-0.5] return（零 rng）
  { name: 'I01-flying', seed: 0x5f31, kind: 1, fn: 'move', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    units: [{ id: 5, race: 9, civ: -1, x: 40.5, y: 40.5, tx: 50.5, ty: 40.5 }] },
  // I02 深水改向：FISH 在 DEEP 目标近岸（nx=61.5→GRASS）→ aquatic 分支 nt 非水非沙 且 cur 是水 → else 深水随机改向 ×8（rng 2）
  { name: 'I02-deepwater-turn', seed: 0x5f32, kind: 1, fn: 'move', unitId: 5,
    paint: [[30, 35, 60, 46, DEEP], [61, 35, 75, 46, GRASS]],
    units: [{ id: 5, race: 37, civ: -1, x: 59.5, y: 40.5, tx: 70.5, ty: 40.5 }] },
  // I03 沙泳潜行：SANDWORM sandswim 目标 SAND 直走 + dust 门 rng<0.08 开（fxPrefs.ambience 默认 true）→ fx dust 12
  { name: 'I03-sandswim', seed: 0x5f33, kind: 1, fn: 'move', unitId: 5,
    paint: [[30, 35, 60, 46, SAND]],
    units: [{ id: 5, race: 26, civ: -1, x: 40.5, y: 40.5, tx: 50.5, ty: 40.5 }] },
  // I04 墙挡改向：human job=0（非作战→board false 零掷）+ 敌墙两轴（WALL=11 civ1 atWar）→ 阻断 else 随机改向 ×6（rng 2）
  { name: 'I04-blocked-reroute', seed: 0x5f34, kind: 1, fn: 'move', unitId: 5,
    paint: [[0, 0, 255, 159, GRASS]],
    civs: [{ id: 0, pop: 3, capital: idx(38, 38), tiles: [idx(38, 38)] }, { id: 1, pop: 3, capital: idx(90, 90), tiles: [idx(90, 90)] }],
    units: [{ id: 5, race: 0, civ: 0, x: 40.5, y: 40.5, tx: 50.5, ty: 44.5 }],
    rel: [[0, 1, -60]],
    buildings: [[idx(42, 40), 11, 1], [idx(40, 41), 11, 1]] },
];

// ---------------- 主流程 ----------------
const out = { meta: {
  gen: 'gen-units-bail.mjs',
  blueprint: 'engine.ts wbResume L3215-3302 case1/case2/case3/case4/case5 + updateUnit 前奏 L3455-3464 + caravanArrive L4770 + foundSettlement L5704 + updateUnitTailJS L4116 + updateUnitPostJS L4262 + moveUnit L5813 + grabbedTick L5343 + updateBoat L5608 + disembark L5663 + findLandNear L5589 + inventEmergentTrait L3318 + inventTrait emergence.ts L390 + spawnUnit L1283 + newFamily L1111 + wildCapOf L2132 + onBuildingDestroyed L4464 + sackCapital L4498 + annexTiles L4510 + destroyBuilding L1936 + enemyBuildingNear L4396 + nearestEnemyBuilding L4421 + castArrow L4368 + addWarScore L7234 + noteOccupied L7172',
  W, H,
  dumpNote: 'f64 小端 16hex；rngA u32；relay 直调（engine L3148 同入口）',
}, scenarios: [] };

for (const sc of scenarios) {
  if (process.env.BAIL_ONLY && !sc.name.startsWith(process.env.BAIL_ONLY)) continue; // 单场景快跑（挑 seed 用）
  const r = runScenario(sc);
  out.scenarios.push(r);
  console.log(`${r.name}: rngA ${r.rngA0} -> ${r.rngA} effects=${r.effects.length} events=${r.events.length} toasts=${r.toasts.length} buildings=${r.buildings.length} civ0gold=${r.civs[0]?.gold ?? '-'}`);
}

const OUT = path.join(ROOT, 'scripts/unity-migration/golden/units_bail.json');
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`written: ${OUT} (${out.scenarios.length} scenarios)`);
