// ============================================================================
// gen-nature2.mjs —— M-U18「大气风暴域」黄金向量
//   蓝本 nature.ts：atmTick L423-625（槽 38 %10===3）/ pressureTick L629-662
//   （atmTick L435 内联调用）/ stormTick L665-778（槽 39 %40===5）/
//   hydroTick L1062-1091（槽 40 %120===9）+ cellStats L404-420。
//   连带蓝本 engine.ts 消费面：natureLightning L10546-10558（bolt 消费）/
//   stormRavage L10602-10642（风暴肆虐）/ rainFireProbe L10645-10658（雨区灭火）。
//   已译消费件复用：rainRegrow M-U11 / natureFlood M-U11 / spawnTornado M-U10c /
//   sandstorm / drought M-U13 / carveRiver M-U15 参化 / windAt·cellOf·itczLat
//   M-U9b / dayPhase M-U7x。
//   挂账不译（M-U19+）：snapshot L1111+/tint/rhythmChips UI 面。
//
// 协议要点：
//   ① 掷流：atmTick 每步——雨效环 rainRegrow 门 1 掷/格(r>80) + 灭火探针
//     （r>70：每探针 5k×2 掷）+ bolt 门 1 掷/格(r≥190) + rainbow/meteor 门掷；
//     pressureTick 每步——生成门 1 掷（cap<5 才掷）+ 存活 ps 漂移 2 掷/个 +
//     生成体 6-8 掷；stormTick——孕育门 1 掷（storms<3 且 disasters 才掷）+
//     tr 试掷 2/轮 + 成形体 ttl/seed 2 掷 + 推进漂移 2 掷/风暴 + 龙卷门 1 掷 +
//     气候骰 1 掷（sandstorm 支）或 2 掷（drought 支 r 掷）；hydroTick——
//     0.05 门 1 掷 + tr 试掷 2/轮 + carveRiver 内掷（M-U15 译件）。
//   ② Float32 面：moist/ashF/floodAcc/sstAnom 是 Float32Array——dump 走 f32 LE
//     字节面 md5（C# float[] 手工 LE 对账——stress/moist 先例同构）。
//   ③ storms 槽协议扩展（字段只加）：C#/JS storms[i] = [x, y, strength, id,
//     ttl, seed, kind(0=cyclone,1=blizzard), landed(0/1)]——windAt 只读 [0..2]
//     零触碰；name 可由 id 导出（STORM_NAME_AT(id)，nature.ts L25-27）。
//     pSystems[i] = [x, y, kind, str, ttl]（windAt 只读 [0..3] 零触碰）。
//   ④ ep('nature.stormRate') 黄金驱动默认 1（engineParams L44 value:1）——
//     C# 内联 1.0 + DIVERGENCE 注记（M-U7m 先例）。
//   ⑤ per-call pre 钩子（fire/prevRain/frame/riverTilesFill/cam 注入）以
//     结构化 ops 落盘 steps[].pre——C# 重放按 ops 复演（零引擎面）。
//
// 运行：bun scripts/unity-migration/gen-nature2.mjs（黄金链一律 bun）
// 输出：scripts/unity-migration/golden/nature2.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/nature2.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（gen-nature 同款） ----
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
globalThis.localStorage = { getItem: () => null, set: noop, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
if (typeof GameEngine !== 'function') throw new Error('GameEngine 未定位: ' + Object.keys(engMod).join(','));
const natMod = await jiti.import(path.join(ROOT, 'src/lib/game/nature.ts'));
const NatureSystem = natMod.NatureSystem;
if (typeof NatureSystem !== 'function') throw new Error('NatureSystem 未定位: ' + Object.keys(natMod).join(','));
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const N = W * H;

// ---- 工具 ----
const gzB64 = (u8) => zlib.gzipSync(Buffer.from(u8), { level: 9 }).toString('base64');
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };
const fr = Math.fround;

function mulberryStep(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
function chainDraws(state0, finalState) {
  let a = state0 | 0;
  for (let k = 0; k < 5_000_000; k++) {
    a = mulberryStep(a).a;
    if ((a >>> 0) === (finalState >>> 0)) return k + 1;
  }
  throw new Error('rng 链未达终态——协议失效');
}
const idx = (x, y) => y * W + x;

// ---- f32 LE 字节面（moist/ashF/floodAcc/sstAnom dump） ----
function f32md5(f32arr) {
  return md5hex(new Uint8Array(f32arr.buffer.slice(0)));
}
function u16bytes(intArr) {
  const u16 = new Uint16Array(intArr.length);
  for (let i = 0; i < intArr.length; i++) u16[i] = intArr[i];
  return new Uint8Array(u16.buffer);
}
function u16md5(intArr) {
  const u16 = new Uint16Array(intArr.length);
  for (let i = 0; i < intArr.length; i++) u16[i] = intArr[i];
  return md5hex(new Uint8Array(u16.buffer));
}

// ---- M-U18 大气域 dump 面（storms 8 槽 / pSystems 5 槽 f64hex 全列 + 瞬态域全键） ----
function dumpNature2(eng) {
  const nt = eng.nature;
  return {
    // —— 板块域基座（M-U17 dumpNature 同键——基座零回归对账） ——
    plateN: nt.plateN,
    plateMd5: md5hex(nt.plate),
    plateC: [...nt.plateCx, ...nt.plateCy].map(f64hex),
    drift: nt.drift.map((d) => f64hex(d.dx) + f64hex(d.dy)),
    boundaryN: nt.boundary.size,
    boundaryMd5: u16md5([...nt.boundary]),
    stressMd5: f32md5(nt.stress),
    hotspots: nt.hotspots.map((h) => ({ x: h.x, y: h.y, heat: f64hex(h.heat) })),
    moistMd5: f32md5(nt.moist),
    ashFMd5: f32md5(nt.ashF),
    ash: f64hex(nt.ash),
    rainCellMd5: md5hex(nt.rainCell),
    counters: ['quakes', 'quakesBig', 'eruptions', 'uplifts', 'erosions', 'cyclones', 'tsunamis', 'floods', 'blizzards', 'droughts'].map((k) => nt.counters[k]),
    recentQuakes: nt.recentQuakes.map((q) => ({ x: q.x, y: q.y, m: f64hex(q.m), year: q.year })),
    lastSeason: nt.lastSeason,
    epoch: nt.plateEpoch,
    yearF: f64hex(eng.yearF),
    stormSeq: nt.stormSeq,
    // —— M-U18 大气域新增键 ——
    windPhase: f64hex(nt.windPhase),
    floodAccMd5: f32md5(nt.floodAcc),
    prevRainMd5: md5hex(nt.prevRain),
    boltCool: nt.boltCool,
    boltChron: nt.boltChronDone ? 1 : 0,
    tSnowChron: nt.tSnowChronDone ? 1 : 0,
    lightningN: nt.lightningN,
    rainbowX: f64hex(nt.rainbowX),
    rainbowY: f64hex(nt.rainbowY),
    rainbowTTL: nt.rainbowTTL,
    rainbowCool: nt.rainbowCool,
    rainbowMoon: nt.rainbowMoon ? 1 : 0,
    rainbowChron: nt.rainbowChronDone ? 1 : 0,
    moonChron: nt.moonChronDone ? 1 : 0,
    meteorX: f64hex(nt.meteorX),
    meteorY: f64hex(nt.meteorY),
    meteorDx: f64hex(nt.meteorDx),
    meteorDy: f64hex(nt.meteorDy),
    meteorTTL: nt.meteorTTL,
    meteorCool: nt.meteorCool,
    meteorsN: nt.meteorsN,
    meteorChron: nt.meteorChronDone ? 1 : 0,
    pSys: nt.pSystems.map((p) => [f64hex(p.x), f64hex(p.y), f64hex(p.kind), f64hex(p.str), f64hex(p.ttl)]),
    stormR: nt.storms.map((s) => [f64hex(s.x), f64hex(s.y), f64hex(s.strength), s.id, s.ttl, s.seed, s.kind === 'blizzard' ? 1 : 0, s.landed ? 1 : 0, s.name]),
    sstMd5: f32md5(eng.worldsim.sstAnom),
  };
}

// ---- 手术式夹具构建 + calls 直调链步进快照（gen-nature 同款 + M-U18 扩展） ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-nature 同款）
  eng.terrain.fill(spec.fill === 'deep' ? T.DEEP : T.GRASS);
  eng.tempMap.fill(0);
  eng.fire.fill(0);
  eng.fireSet.clear();
  eng.frozen.clear();
  eng.flood.clear();
  eng.wet.clear();
  eng.regrow.clear();
  eng.units.length = 0;
  eng.unitById.clear();
  eng.effects.length = 0;
  eng.worldEvents.length = 0;
  eng.eventSeq = 1;
  eng.buildings.length = 0;
  eng.bIdx.clear();
  eng.building.fill(0);
  eng.owner.fill(-1);
  eng.road.fill(0);
  eng.riverDir.fill(0);
  eng.riverTiles.clear();
  eng.waterTier.fill(0);
  eng.worldsim.glacier.fill(0);
  eng.radiate.fill(0);
  eng.radSet.clear();
  eng.dirty.clear();
  eng.propsDirty.clear();
  eng.laws.seasons = spec.seasons ?? true;
  eng.laws.tectonics = spec.tectonics ?? true;
  eng.laws.atmosphere = spec.atmosphere ?? true;
  eng.laws.naturalDisasters = spec.disasters ?? true;
  eng.yearF = spec.yearF ?? 0;
  eng.tickCount = spec.tickCount;
  eng.frameCount = spec.frameCount ?? 0;
  eng.shake = 0;
  eng.statNukes = 0;
  eng.cam.x = spec.camX ?? W / 2;
  eng.cam.y = spec.camY ?? H / 2;

  // toast 宿主回调收集器（纪律③事件流）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });

  // nature 系统重建（applyWorldGen 期构造面——手术式场景显式建；seed=baseSeed）
  eng.nature = new NatureSystem(eng, spec.baseSeed);
  eng.nature.lastSeason = -1;

  // 手术二·直写相（保序）
  for (const [x, y, t] of spec.terrain ?? []) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of spec.building ?? []) { eng.building[idx(x, y)] = v; eng.bIdx.set(idx(x, y), eng.buildings.length); eng.buildings.push({ i: idx(x, y), x, y, kind: v, civ: -1, hp: 10 }); }
  for (const uo of spec.units ?? []) {
    const u = {
      id: uo.id, race: uo.race ?? 0, civ: uo.civ ?? -1, x: uo.x, y: uo.y, tx: uo.x, ty: uo.y,
      hp: uo.hp ?? 10, maxHp: uo.hp ?? 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
      cd: 0, trait: 0, job: 0, king: 0, infected: false, flip: 0, name: `u${uo.id}`,
      hurt: 0, breath: 0, parity: 0, dead: uo.dead ?? 0, fam: null, fgn: null, gene: null, army: null,
      boat: uo.boat ?? 0, chill: 0,
    };
    eng.units.push(u);
    eng.unitById.set(u.id, u);
  }
  // M-U18 大气域直写：moist/ashF/floodAcc/prevRain/sstAnom（f32 精确）
  for (const [i, v] of spec.moist ?? []) eng.nature.moist[i] = fr(v);
  for (const [i, v] of spec.ashF ?? []) eng.nature.ashF[i] = fr(v);
  for (const [i, v] of spec.floodAcc ?? []) eng.nature.floodAcc[i] = fr(v);
  for (const [i, v] of spec.prevRain ?? []) eng.nature.prevRain[i] = v;
  for (const [i, v] of spec.sstAnom ?? []) eng.worldsim.sstAnom[i] = fr(v);
  // pSystems 直写（5 槽协议：x/y/kind/str/ttl——windAt 读 [0..3]）
  for (const [x, y, kind, str, ttl] of spec.pSys ?? []) eng.nature.pSystems.push({ x, y, kind, str, ttl });
  // storms 直写（JS Cyclone 对象——dump 面全键）
  for (const [x, y, strength, id, ttl, seed, kind, landed] of spec.stormR ?? [])
    eng.nature.storms.push({ id, x, y, strength, ttl, seed, kind: kind === 1 ? 'blizzard' : 'cyclone', name: natMod.STORM_NAME_AT(id), landed: !!landed });
  // 火面直写（S4 灭火探针——fireSet/fireSetList 同步）
  for (const [i, v] of spec.fire ?? []) { eng.fire[i] = v; eng.fireSet.add(i); eng.fireSetList.push(i); }
  // riverDir 直写（S13 近河门）
  for (const [i, v] of spec.riverDir ?? []) eng.riverDir[i] = v;

  // 板块域基座：initPlates 直调（独立流 seed^0x51ab7——主 rngA 零消费）
  //   注意：initPlates 会 moist.fill(0.35)/rainCell.fill(0)/floodAcc.fill(0)/
  //   ashF.fill(0)/pSystems=[]/storms=[]——大气域直写必须在 initPlates 之后。
  if (spec.initPlates !== false) eng.nature.initPlates();

  // 手术二·大气域直写（initPlates 之后——覆盖 fill 面）
  for (const [i, v] of spec.moist ?? []) eng.nature.moist[i] = fr(v);
  for (const [i, v] of spec.ashF ?? []) eng.nature.ashF[i] = fr(v);
  for (const [i, v] of spec.floodAcc ?? []) eng.nature.floodAcc[i] = fr(v);
  for (const [i, v] of spec.prevRain ?? []) eng.nature.prevRain[i] = v;
  for (const [i, v] of spec.sstAnom ?? []) eng.worldsim.sstAnom[i] = fr(v);
  for (const [x, y, kind, str, ttl] of spec.pSys ?? []) eng.nature.pSystems.push({ x, y, kind, str, ttl });
  for (const [x, y, strength, id, ttl, seed, kind, landed] of spec.stormR ?? [])
    eng.nature.storms.push({ id, x, y, strength, ttl, seed, kind: kind === 1 ? 'blizzard' : 'cyclone', name: natMod.STORM_NAME_AT(id), landed: !!landed });

  // pre 钩子：动态夹具（确定性由独立流/直写保证；C# 重放走 fixture 全量字节面）
  if (spec.pre) spec.pre(eng.nature, eng);

  // 手术二·快照：直写后/调用前的镜像输入面
  const fixture = {
    terrain0: gzB64(eng.terrain),
    plate0: gzB64(eng.nature.plate),
    stress0: gzB64(new Uint8Array(eng.nature.stress.buffer.slice(0))),
    plateC0: [...eng.nature.plateCx, ...eng.nature.plateCy].map(f64hex),
    boundaryMd5_0: u16md5([...eng.nature.boundary]),
    boundary0: gzB64(u16bytes([...eng.nature.boundary])),
    plateN0: eng.nature.plateN,
    drift0: eng.nature.drift.map((d) => f64hex(d.dx) + f64hex(d.dy)),
    hotXY0: eng.nature.hotspots.map((h) => [h.x, h.y]),
    heat0: eng.nature.hotspots.map((h) => f64hex(h.heat)),
    building0: gzB64(eng.building),
    soil0: gzB64(eng.worldsim.soilF),   // 土壤肥力场（worldgen initFromTerrain 派生——carveRiver 灌溉成林 rng 门 L12378 消费）
    units0: eng.units.map((u) => ({ id: u.id, race: u.race, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, boat: u.boat ?? 0 })),
    yearF0: eng.yearF,
    seasonOffset0: eng.nature.seasonOffset,
    frameCount0: eng.frameCount,
    camX0: eng.cam.x,
    camY0: eng.cam.y,
    // —— M-U18 大气域输入面（全量字节/全列固化——镜像端零推导直接注入） ——
    moist0: gzB64(new Uint8Array(eng.nature.moist.buffer.slice(0))),
    ashF0: gzB64(new Uint8Array(eng.nature.ashF.buffer.slice(0))),
    floodAcc0: gzB64(new Uint8Array(eng.nature.floodAcc.buffer.slice(0))),
    sst0: gzB64(new Uint8Array(eng.worldsim.sstAnom.buffer.slice(0))),
    prevRain0: gzB64(eng.nature.prevRain),
    rainCell0: gzB64(eng.nature.rainCell),
    windPhase0: f64hex(eng.nature.windPhase),
    boltCool0: eng.nature.boltCool,
    rainbowTTL0: eng.nature.rainbowTTL,
    rainbowCool0: eng.nature.rainbowCool,
    meteorTTL0: eng.nature.meteorTTL,
    meteorCool0: eng.nature.meteorCool,
    pSys0: eng.nature.pSystems.map((p) => [f64hex(p.x), f64hex(p.y), f64hex(p.kind), f64hex(p.str), f64hex(p.ttl)]),
    stormR0: eng.nature.storms.map((s) => [f64hex(s.x), f64hex(s.y), f64hex(s.strength), s.id, s.ttl, s.seed, s.kind === 'blizzard' ? 1 : 0, s.landed ? 1 : 0]),
    fire0: spec.fire ?? [],
    riverDir0: spec.riverDir ?? [],
  };

  // 步进快照（calls 直调统一面）
  const snapCommon = () => ({
    rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
    terrainMd5: md5hex(eng.terrain),
    fxCount: eng.effects.length,
    eventsCount: eng.worldEvents.length,
    shake: eng.shake,
    dirtyN: eng.dirty.size,
    propsDirtyN: eng.propsDirty.size,
    nat: dumpNature2(eng),
  });

  // 手术三（尾置）：rngA 清零起流 → calls 直调（nature 域方法直调 + 引擎面混合）
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (const call of spec.calls ?? []) {
    if (call.preYear !== undefined) eng.yearF = call.preYear;   // season 场景年相推进（L2521 每帧 +1/40 手术等价）
    if (call.laws) Object.assign(eng.laws, call.laws);          // 中途法则切换（disasters 开关门——C# 重放按 step.laws 复演）
    const preOps = [];
    if (call.pre) call.pre(eng, preOps);                        // per-call 注入钩子（结构化 ops 落盘——C# 重放复演）
    const [obj, fn] = call.fn.startsWith('nt.') ? [eng.nature, call.fn.slice(3)] : [eng, call.fn];
    obj[fn](...call.args);
    steps.push({ fn: call.fn, args: call.args, preYear: call.preYear, laws: call.laws ?? null, pre: preOps, yearF: f64hex(eng.yearF), ...snapCommon() });
  }

  // sanity（生成即验证）——N2_DIAG=1 时不符仅告警继续
  const totalDraws = (eng.rngA >>> 0) === (spec.seed >>> 0) ? 0 : chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  if (spec.minDraws !== undefined && totalDraws !== spec.minDraws) {
    const msg = `${spec.key}: 掷数 ${totalDraws} ≠ 期望 ${spec.minDraws}`;
    if (process.env.N2_DIAG === '1') console.log('DIAG-draws ' + msg);
    else throw new Error(msg);
  }
  if (spec.sanity && !spec.sanity(eng, toasts)) {
    console.error(`DIAG ${spec.key}: draws=${totalDraws} rngA=${(eng.rngA >>> 0).toString(16)} shake=${eng.shake} counters=${JSON.stringify(eng.nature.counters)} pSys=${JSON.stringify(eng.nature.pSystems)} storms=${JSON.stringify(eng.nature.storms)} fx=${JSON.stringify(eng.effects.map((e) => ({ k: e.kind, x: e.x, y: e.y, ttl: e.ttl })))} ev=${JSON.stringify(eng.worldEvents.map((e) => e.text))} toasts=${JSON.stringify(toasts.map((t) => t.text))} boltCool=${eng.nature.boltCool} lightningN=${eng.nature.lightningN} rainbows=${eng.nature.rainbowTTL}/${eng.nature.rainbowCool} meteors=${eng.nature.meteorTTL}/${eng.nature.meteorCool}/${eng.nature.meteorsN} moistC=${eng.nature.moist[5 * 32 + 2]} rainC=${eng.nature.rainCell[5 * 32 + 2]} fAcc=${eng.nature.floodAcc[5 * 32 + 2]} rivers=${eng.riverTiles.size} fire=${JSON.stringify(eng.fireSet)} units=${JSON.stringify(eng.units.map((u) => ({ id: u.id, hp: u.hp, hurt: u.hurt, dead: u.dead, chill: u.chill })))}`);
    throw new Error(`${spec.key}: sanity 未过`);
  }

  return {
    key: spec.key,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    tickCount: spec.tickCount,
    laws: { seasons: spec.seasons ?? true, atmosphere: spec.atmosphere ?? true, disasters: spec.disasters ?? true, tectonics: spec.tectonics ?? true },
    totalDraws,
    fixture,
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    nat: dumpNature2(eng),
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null, age: e.age, quiet: e.quiet ? 1 : 0 })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
    units: eng.units.map((u) => ({ id: u.id, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), hurt: f64hex(u.hurt ?? 0), dead: u.dead ? 1 : 0, chill: u.chill ?? 0 })),
    toasts,
  };
}

// terrain 矩形铺装
function fillRect(eng, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < W && y < H) eng.terrain[idx(x, y)] = t;
}

// ---- 场景集（14 场景——atmTick/pressureTick/stormTick/hydroTick 全分支） ----
const BASE = 20261101;

const specs = [
  // S1 大气关停（L425-428 早退面：prevRain 清零 + 零掷——boltCool/风相/全场雨情冻结）
  {
    key: 'atm-off', baseSeed: BASE + 1, seed: 0x0E2A0101, tickCount: 900, atmosphere: false,
    prevRain: [[271, 130], [272, 200]],
    calls: [{ fn: 'nt.atmTick', args: [] }, { fn: 'nt.atmTick', args: [] }],
    minDraws: 0,
    sanity: (eng) => eng.nature.prevRain.every((v) => v === 0) && eng.nature.windPhase === 0,
  },
  // S2 蒸发+平流+灰烬平流（L437-479：洋面蒸发 sstAnom>0 ×1.15 支 + 半拉格朗日 + 灰烬扩散沉降）
  //   掷数=pressureTick 生成门 1 掷/步×3（pSystems 空 cap<5）——结构性非零，记录不锚定
  {
    key: 'evap-adv-ash', baseSeed: BASE + 2, seed: 0x0E2A0201, tickCount: 1000, yearF: 2.5,
    pre: (nt, eng) => { fillRect(eng, 0, 0, 15, H - 1, T.DEEP); },
    sstAnom: [[2 * 32 + 1, 0.5]],
    ashF: [[5 * 32 + 2, 0.5]],
    calls: [{ fn: 'nt.atmTick', args: [] }, { fn: 'nt.atmTick', args: [] }, { fn: 'nt.atmTick', args: [] }],
    sanity: (eng) => eng.nature.windPhase > 0.03 && eng.nature.ash > 0,
  },
  // S3 迎风坡致雨+ITCZ+洪水累计→natureFlood（L480-533：orographic 1.7 支 + floodAcc>1 重置 + disasters 门 + rainRegrow 0.3 门）
  {
    key: 'oroflood', baseSeed: BASE + 3, seed: 0x0E2A0301, tickCount: 1000, yearF: 2.5,
    pre: (nt, eng) => {
      fillRect(eng, 0, 0, 15, H - 1, T.DEEP);            // 洋面 cx0-1
      fillRect(eng, 24, 32, 31, 47, T.MOUNTAIN);          // 山脉 cx3-4 cy4-5（迎风坡）
      const m = eng.nature.moist;
      for (let cy = 4; cy <= 6; cy++) for (let cx = 1; cx <= 4; cx++) m[cy * 32 + cx] = fr(0.9);
    },
    floodAcc: [[5 * 32 + 2, fr(1.5)]],
    calls: [{ fn: 'nt.atmTick', args: [] }],
    sanity: (eng) => eng.nature.floodAcc[5 * 32 + 2] === 0 && eng.worldEvents.some((e) => e.text.includes('泽国')),
  },
  // S4 雨区灭火探针（L518-525 + engine rainFireProbe L10645-10658：未中 10 掷早退 / 命中 2 掷 + 灭火）+
  //   disasters=false 门（floodAcc>1 不触发 natureFlood——L530 合取短路面；floodAcc 继续累计）
  //   确定性面：火铺满 cx2 探针窗（16-23×40-47 64 格）——探针 k=0 必中（任意 xx,yy 皆火），
  //   6 探针 ×2 掷 = 12 掷 拑 6 火（余 58）；cx3/cx4 窗无火 10 掷早退——双支路零种子标定
  {
    key: 'fire-probe', baseSeed: BASE + 4, seed: 0x0E2A0401, tickCount: 1000, yearF: 2.5, disasters: false,
    pre: (nt, eng) => {
      fillRect(eng, 0, 0, 15, H - 1, T.DEEP);
      fillRect(eng, 24, 32, 31, 55, T.MOUNTAIN);                                  // 山脉 cx3-4 cy4-6（oro 1.7 垫高雨强——r≈91 稳过 70 门）
      const m = eng.nature.moist;
      for (let cy = 4; cy <= 6; cy++) for (let cx = 0; cx <= 4; cx++) m[cy * 32 + cx] = fr(0.9);
    },
    floodAcc: [[5 * 32 + 2, fr(1.5)]],
    calls: [
      { fn: 'nt.atmTick', args: [] },                                             // 步1 无火：cx2 探针 10 掷全空 → -1 早退
      { fn: 'nt.atmTick', args: [], pre: (eng, ops) => { for (let y = 40; y <= 47; y++) for (let x = 16; x <= 23; x++) { eng.fire[idx(x, y)] = 30; eng.fireSet.add(idx(x, y)); } ops.push({ op: 'fireRect', x0: 16, y0: 40, x1: 23, y1: 47, v: 30 }); } },   // 步2 火满窗：6 探针全中
    ],
    sanity: (eng) => eng.fireSet.size === 58,
  },
  // S5 雷暴（L534-553：r≥190 门 + boltCool 180-420 + natureLightning 消费〔coldBlood ×1.4 支〕+ 首雷宣告）
  //   门概率 0.05×≥4 掷/步——种子扫描标定（N2_SEED_bolt-day）
  {
    key: 'bolt-day', baseSeed: BASE + 5, seed: 0x0E2A052B, tickCount: 1000, yearF: 2.5,
    pre: (nt, eng) => {
      const m = eng.nature.moist;
      // 湿带 cx8-13 cy9-12（pSys 旋涡反风修正——上风采样落带内；中心四格 r≈230）
      for (let cy = 9; cy <= 12; cy++) for (let cx = 8; cx <= 13; cx++) m[cy * 32 + cx] = fr(0.99);
      eng.nature.pSystems.push({ x: 84, y: 84, kind: 0, str: 1.0, ttl: 50 });     // 强低压 → 雨强 ×~1.74
    },
    units: [{ id: 1, race: 0, x: 84, y: 84, hp: 40 }, { id: 2, race: 13, x: 84.5, y: 84.5, hp: 40 }],   // HUMAN + SCORPION(coldBlood)
    calls: [{ fn: 'nt.atmTick', args: [] }],
    sanity: (eng) => eng.nature.boltCool > 0 && eng.nature.lightningN === 1 && eng.nature.boltChronDone === true && eng.units[1].hp < 40,
  },
  // S6 雷打雪（冬支：winterBolt 概率 0.012 + 冷却 600-1200 + tSnowChron 防重独立纪事）
  //   门概率 0.012——湿带 cx8-15 cy6-11（48 格，pSys 中心埋设 → r≥190 格 ≈20+）×3 步 ≈60 掷 → ~51%
  {
    key: 'bolt-winter', baseSeed: BASE + 6, seed: 0x0E2A0613, tickCount: 1000, yearF: 6.5,
    pre: (nt, eng) => {
      const m = eng.nature.moist;
      // 湿带 cx5-17 cy5-12（冬季 jetMul 1.35 强风稀释面——上风采样恒落带内）
      for (let cy = 5; cy <= 12; cy++) for (let cx = 5; cx <= 17; cx++) m[cy * 32 + cx] = fr(0.99);
      eng.nature.pSystems.push({ x: 100, y: 68, kind: 0, str: 1.0, ttl: 50 });    // ITCZ 带心低压一（cx12.5 cy8.5）
      eng.nature.pSystems.push({ x: 116, y: 76, kind: 0, str: 1.0, ttl: 50 });    // 低压二（cx14.5 cy9.5）——双低叠乘破冬 0.7 惩罚（L494 先于 L496：ITCZ 加成不吃 0.7，单低乘子上限 1.896 → rmax 198 窗口 d≤0.33）
    },
    calls: [{ fn: 'nt.atmTick', args: [] }, { fn: 'nt.atmTick', args: [] }, { fn: 'nt.atmTick', args: [] }],
    sanity: (eng, toasts) => eng.nature.tSnowChronDone === true && toasts.some((t) => t.text.includes('雷打雪')),
  },
  // S7 天幕家族（L556-623：昼虹 0.02 + 月虹 0.008 + 晴夜流星 0.045——rainbowTTL/cool 双节流 + chron 三防重 + cam 锚定钳位）
  //   prevRain 144 格注入（128..271）→ 昼虹/月虹命中面放大；步 2/4 节流旁路注入；种子扫描标定
  {
    key: 'sky-family', baseSeed: BASE + 7, seed: 0x0E2A0706, tickCount: 1000, yearF: 2.5, camX: 100, camY: 90,
    calls: [
      { fn: 'nt.atmTick', args: [], pre: (eng, ops) => { for (let i = 128; i <= 271; i++) { eng.nature.prevRain[i] = 130; ops.push({ op: 'prevRain', i, v: 130 }); } eng.frameCount = 100; ops.push({ op: 'frame', v: 100 }); } },   // 步1 昼虹（dp 0.0417，144 候选格）
      { fn: 'nt.atmTick', args: [], pre: (eng, ops) => { eng.nature.rainbowTTL = 0; eng.nature.rainbowCool = 0; ops.push({ op: 'nat', k: 'rainbowTTL', v: 0 }, { op: 'nat', k: 'rainbowCool', v: 0 }); for (let i = 128; i <= 271; i++) { eng.nature.prevRain[i] = 130; ops.push({ op: 'prevRain', i, v: 130 }); } eng.frameCount = 1600; ops.push({ op: 'frame', v: 1600 }); } },  // 步2 月虹（dp 0.6667 深夜）——TTL/cool 直置+op 记录双写
      { fn: 'nt.atmTick', args: [], pre: (eng, ops) => { eng.frameCount = 1600; ops.push({ op: 'frame', v: 1600 }); } },                                                                                 // 步3 流星（prevRain 已清）
      { fn: 'nt.atmTick', args: [], pre: (eng, ops) => { eng.frameCount = 1600; ops.push({ op: 'frame', v: 1600 }); } },                                                                                 // 步4 流星重试（step3 miss 时）
    ],
    sanity: (eng, toasts) => eng.nature.rainbowChronDone && eng.nature.moonChronDone && eng.nature.meteorChronDone && eng.nature.meteorsN === 1 && eng.nature.rainbowMoon === true,
  },
  // S8 气压系统生命周期（L629-662：生成门 cap 5 + isL/lat 三支 + 漂移 baseU 三带 + 强度演化四支 + ttl/str 双亡）
  {
    key: 'pressure-cycle', baseSeed: BASE + 8, seed: 0x0E2A0803, tickCount: 1000, yearF: 2.5,
    pre: (nt, eng) => {
      fillRect(eng, 0, 0, 63, 63, T.DEEP);                                        // 暖洋（水Frac>0.6 增强支）
      eng.nature.pSystems.push({ x: 100, y: 80, kind: 0, str: 0.5, ttl: 1 });     // ttl 亡支（陆地 cy10）
      eng.nature.pSystems.push({ x: 200, y: 40, kind: 1, str: 0.15, ttl: 100 });  // str 亡支（kind1 陆地衰减）
      eng.nature.pSystems.push({ x: 32, y: 40, kind: 0, str: 0.5, ttl: 100 });    // baseU 带一 -0.5 + 暖洋增强 +0.006
      eng.nature.pSystems.push({ x: 200, y: 150, kind: 1, str: 0.5, ttl: 100 });  // baseU 边带 -0.35 + kind1 陆地衰减
    },
    calls: [{ fn: 'nt.pressureTick', args: [] }, { fn: 'nt.pressureTick', args: [] }, { fn: 'nt.pressureTick', args: [] }, { fn: 'nt.pressureTick', args: [] }, { fn: 'nt.pressureTick', args: [] }, { fn: 'nt.pressureTick', args: [] }],
    sanity: (eng) => eng.nature.pSystems.length >= 3,
  },
  // S9 气旋全生命周期（L666-777：孕育门 warmOcean 支 + 命名 STORM_NAME_AT + 暖洋增益 + 湿气倾泻 + str 亡静默 + ttl 亡〔预注〕）
  {
    key: 'storm-cyclone', baseSeed: BASE + 9, seed: 0x0E2A0901, tickCount: 1000, yearF: 2.5,
    pre: (nt, eng) => {
      fillRect(eng, 0, 0, 127, H - 1, T.DEEP);                                    // 暖洋 cx0-15（命中面 ×2）
      const m = eng.nature.moist;
      for (let cy = 7; cy <= 14; cy++) for (let cx = 0; cx <= 15; cx++) m[cy * 32 + cx] = fr(0.8);
      eng.nature.storms.push({ id: 7, x: 100, y: 80, strength: 0.14, ttl: 200, seed: 0, kind: 'cyclone', name: natMod.STORM_NAME_AT(7), landed: false });   // str 亡支
    },
    calls: [{ fn: 'nt.stormTick', args: [] }, { fn: 'nt.stormTick', args: [] }, { fn: 'nt.stormTick', args: [] }, { fn: 'nt.stormTick', args: [] }],
    sanity: (eng, toasts) => eng.nature.counters.cyclones >= 1 && toasts.some((t) => t.text.includes('成形')),
  },
  // S10 冰暴登陆+冻结肆虐（winterPolar 支 + stormRavage blizzard 支：coldBorn 免疫 + GRASS→SNOW + WATER→ICE + blizzards 计数）
  {
    key: 'storm-blizzard', baseSeed: BASE + 10, seed: 0x0E2A1001, tickCount: 1000, yearF: 6.5,
    pre: (nt, eng) => {
      fillRect(eng, 8, 0, 15, 47, T.DEEP);                                        // 寒洋（winterPolar waterFrac>0.3 支——cy0-2 洋陆混合）
      const m = eng.nature.moist;
      for (let cy = 0; cy <= 2; cy++) for (let cx = 0; cx <= 7; cx++) m[cy * 32 + cx] = fr(0.6);
      eng.nature.storms.push({ id: 3, x: 20, y: 10, strength: 0.8, ttl: 300, seed: 0, kind: 'blizzard', name: natMod.STORM_NAME_AT(3), landed: false });   // 直置登陆态
      fillRect(eng, 14, 16, 17, 19, T.WATER);                                     // 冻结支（WATER→ICE——耨虐半径内 d≈8.9）
      for (let by = 8; by <= 11; by++) for (let bx = 18; bx <= 21; bx++) eng.terrain[idx(bx, by)] = T.GRASS;   // 冻结支草地（GRASS→SNOW 0.25 门样本区）
    },
    units: [{ id: 1, race: 11, x: 20, y: 10, hp: 30 }, { id: 2, race: 0, x: 22, y: 10, hp: 30 }],   // PENGUIN(coldBorn) + HUMAN
    building: [[18, 8, 1], [19, 8, 1], [20, 8, 1], [21, 8, 1], [18, 9, 1], [19, 9, 1], [20, 9, 1], [21, 9, 1], [18, 10, 1], [19, 10, 1], [20, 10, 1], [21, 10, 1]],   // 12 建筑群（attackBuilding 门 p≈0.02×24 试）
    calls: [{ fn: 'nt.stormTick', args: [] }, { fn: 'nt.stormTick', args: [] }],
    sanity: (eng) => eng.nature.storms.some((s) => s.landed === true) && eng.nature.counters.blizzards >= 1,
  },
  // S10b 冰暴孕育（winterPolar 真支路：寒洋 cx0-15 全高 + 极地湿带 cy0-3——warmOcean 支不满足（夏季外/湿门）只 winterPolar 可生）
  {
    key: 'blizzard-spawn', baseSeed: BASE + 16, seed: 0x0E2A1602, tickCount: 1000, yearF: 6.5,
    pre: (nt, eng) => {
      fillRect(eng, 0, 0, 127, H - 1, T.DEEP);                                    // 寒洋 cx0-15
      const m = eng.nature.moist;
      for (let cy = 0; cy <= 3; cy++) for (let cx = 0; cx <= 15; cx++) m[cy * 32 + cx] = fr(0.6);
    },
    calls: Array.from({ length: 40 }, () => ({ fn: 'nt.stormTick', args: [] })),
    sanity: (eng) => eng.nature.storms.length >= 1 && eng.nature.storms.every((s) => s.kind === 'blizzard'),
  },
  // S11 气旋肆虐+龙卷分离（stormRavage cyclone 支：flying/boat 跳过 + 拔树 FOREST→GRASS + attackBuilding + 龙卷 0.12 门 + lastCatastrophe + 耗尽宣告支）
  {
    key: 'storm-ravage', baseSeed: BASE + 11, seed: 0x0E2A1102, tickCount: 1000, yearF: 2.5,
    pre: (nt, eng) => {
      fillRect(eng, 16, 32, 31, 47, T.MOUNTAIN);                                  // elev 3 > 1.6 龙卷支
      fillRect(eng, 12, 32, 15, 39, T.FOREST);                                    // 拔树支（耨虐半径内 d≈6.5）
      eng.nature.storms.push({ id: 2, x: 20, y: 36, strength: 1.2, ttl: 400, seed: 0, kind: 'cyclone', name: natMod.STORM_NAME_AT(2), landed: false });   // ≥1.1 大灾档案
      eng.nature.storms.push({ id: 4, x: 100, y: 80, strength: 0.9, ttl: 40, seed: 0, kind: 'cyclone', name: natMod.STORM_NAME_AT(4), landed: true });     // ttl 亡 + landed 耗尽宣告
      for (const [bx, by] of [[19, 35], [21, 35], [19, 37], [21, 37], [20, 36]]) { eng.building[idx(bx, by)] = 1; eng.bIdx.set(idx(bx, by), eng.buildings.length); eng.buildings.push({ i: idx(bx, by), x: bx, y: by, kind: 1, civ: -1, hp: 10 }); }   // 中心建筑群（attackBuilding 门 p≈0.017）
    },
    units: [{ id: 1, race: 0, x: 20, y: 36, hp: 40 }, { id: 2, race: 9, x: 21, y: 36, hp: 40 }, { id: 3, race: 0, x: 22, y: 36, hp: 40, boat: 1 }],   // HUMAN + DRAGON(flying) + boat
    calls: [{ fn: 'nt.stormTick', args: [] }, { fn: 'nt.stormTick', args: [] }, { fn: 'nt.stormTick', args: [] }, { fn: 'nt.stormTick', args: [] }],
    sanity: (eng) => eng.nature.storms.length <= 1 && eng.worldEvents.some((e) => e.text.includes('龙卷')),
  },
  // S12 干旱/沙暴气候骰（L755-777：sand>34+windSpd>0.5 沙暴支 / sand<20 干旱支 + droughts 计数）
  //   布局：SAND cx0-7 cy7-8（急流带 latA≈0.39——windSpd 必>0.5）沙暴支；全图湿 0.1（<0.14 干旱门）
  //   其余 GRASS sand=0<20 干旱支；80 步长跑——期望 ≥2 次门中且双支各至少一火（种子扫描选种）
  {
    key: 'drought-sand', baseSeed: BASE + 12, seed: 0x0E2A1201, tickCount: 1000, yearF: 2.5,
    pre: (nt, eng) => {
      fillRect(eng, 0, 56, 63, 71, T.SAND);                                       // cx0-7 cy7-8 沙（sand 64 > 34）
      const m = eng.nature.moist;
      for (let i = 0; i < m.length; i++) m[i] = fr(0.1);                          // 全图干旱（moist<0.14 门）
    },
    calls: Array.from({ length: 80 }, () => ({ fn: 'nt.stormTick', args: [] })),
    sanity: (eng) => eng.nature.counters.droughts >= 2,
  },
  // S13 降雨刻河（L1062-1091：riverTiles>900 早退 + 0.05 门 + 山地湿门 + nearRiver 7×7 + carveRiver 成河 + 10 试耗尽）
  {
    key: 'hydro-rivers', baseSeed: BASE + 13, seed: 0x0E2A1310, tickCount: 1000, yearF: 2.5,
    pre: (nt, eng) => {
      fillRect(eng, 24, 32, 231, 127, T.MOUNTAIN);                                // 山地大区 cx3-28 cy4-15（随机命中率高）
      fillRect(eng, 0, 152, 255, 159, T.WATER);                                   // 南缘海域（carve BFS 终点）
      const m = eng.nature.moist;
      for (let cy = 4; cy <= 15; cy++) for (let cx = 3; cx <= 28; cx++) m[cy * 32 + cx] = fr(0.9);   // 湿门全区
      for (let y = 64; y <= 71; y++) for (let x = 112; x <= 143; x++) eng.riverDir[idx(x, y)] = 1;   // nearRiver 带 cx14-17 cy8
    },
    calls: [
      { fn: 'nt.hydroTick', args: [], pre: (eng, ops) => { for (let k = 0; k < 901; k++) eng.riverTiles.add(60000 + k); ops.push({ op: 'riverTilesFill', n: 901 }); } },   // 步1 cap 早退（零掷）
      { fn: 'nt.hydroTick', args: [], pre: (eng, ops) => { eng.riverTiles.clear(); ops.push({ op: 'riverTilesClear' }); } },                                                // 步2 山地湿门过 → carve 成河
      { fn: 'nt.hydroTick', args: [] },                                                                                            // 步3 湿门后后续刻河/耗尽
    ],
    sanity: (eng) => eng.worldEvents.some((e) => e.text.includes('河流')),
  },
  // S14 disasters=false 雷暴门短路面（L538 合取 disasters 支：r≥190 零掷不落雷——rng 消费差异分支）
  {
    key: 'bolt-gate-off', baseSeed: BASE + 14, seed: 0x0E2A1401, tickCount: 1000, yearF: 2.5, disasters: false,
    pre: (nt, eng) => {
      const m = eng.nature.moist;
      for (let cy = 10; cy <= 11; cy++) for (let cx = 10; cx <= 11; cx++) m[cy * 32 + cx] = fr(0.99);
      eng.nature.pSystems.push({ x: 84, y: 84, kind: 0, str: 1.0, ttl: 50 });
    },
    calls: [{ fn: 'nt.atmTick', args: [] }],
    sanity: (eng) => eng.nature.boltCool === 0 && eng.nature.lightningN === 0,
  },
];

// ---- 主流程 ----
const N2_ONLY = process.env.N2_ONLY ? process.env.N2_ONLY.split(',') : null;
const N2_SEED = {};
for (const k of Object.keys(process.env)) if (k.startsWith('N2_SEED_')) N2_SEED[k.slice(8).replace(/-/g, '')] = Number.parseInt(process.env[k], 16);
const scenarios = specs
  .filter((s) => !N2_ONLY || N2_ONLY.includes(s.key))
  .map((spec) => buildScenario({ ...spec, seed: N2_SEED[spec.key.replace(/-/g, '')] ?? spec.seed }));
const out = {
  meta: {
    gen: 'gen-nature2.mjs',
    milestone: 'M-U18',
    domain: 'nature atm/pressure/storm/hydro + natureLightning/stormRavage/rainFireProbe',
    blueprint: 'nature.ts L404-420/L423-625/L629-662/L665-778/L1062-1091 + engine.ts L10546-10558/L10602-10642/L10645-10658',
    W, H, AW: W / 8, AH: H / 8, CELL: 8,
    stormRate: 1,
  },
  scenarios,
};
const json = JSON.stringify(out);
const md5 = createHash('md5').update(Buffer.from(json)).digest('hex');
if (N2_ONLY) {
  console.log(`[ONLY ${N2_ONLY.join(',')}] 跳过落盘`);
} else {
  const p1 = path.join(ROOT, 'scripts/unity-migration/golden/nature2.json');
  writeFileSync(p1, json);
  const p2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/nature2.json');
  writeFileSync(p2, json);
}
console.log(`nature2.json ${scenarios.length} 场景 ${(json.length / 1024).toFixed(1)}KB md5=${md5}`);
for (const s of scenarios) console.log(`  ${s.key}: draws=${s.totalDraws} steps=${s.stepsSnap.length} fx=${s.fx.length} ev=${s.events.length} toasts=${s.toasts.length}`);
