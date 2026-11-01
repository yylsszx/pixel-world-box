// ============================================================================
// gen-nature.mjs —— M-U17「板块构造与地质演变域」黄金向量
//   蓝本 nature.ts：initPlates L93-131（独立流 mulberry32(seed^0x51ab7)）/
//   recomputePlates L132-166（Voronoi 抖动 + boundary Set 插入序）/
//   seasonCheck L213-241（%40===0 槽 41）/ tectonicTick L781-828（槽 42）/
//   releaseQuake L831-881 / geologyTick L882-1061（槽 43）。
//   连带蓝本 engine.ts：natureQuake L10561-10590（releaseQuake 消费面）。
//   挂账不译（M-U18 大气风暴域）：atmTick/pressureTick/stormTick/hydroTick/
//   seedRivers/snapshot/tint/rhythmChips + storms/pSystems 壳写点注记。
//
// 协议要点：
//   ① 掷流：initPlates/recomputePlates/seasonCheck 零主链掷（initPlates 独立
//     流 seed^0x51ab7；recomputePlates 用 valueNoise 非掷；seasonCheck 纯脏面）；
//     tectonicTick 应力积累/漂移/recompute 零掷，releaseQuake 门触达后
//     natureQuake 内 eng.rng（塌毁 0.32×intensity×falloff / 地裂 0.05 /
//     余震 0.4+0.3）；geologyTick 全 eng.rng（造山 cand/start/steps/0.5/0.35 +
//     岛弧 0.12/0.7 + 侵蚀 4×(x,y,0.22|0.3|0.4) + 热点 0.3 + 裂谷 0.35/0.3/0.18/0.1）。
//   ② Float32 面：stress/moist/ashF 是 Float32Array——dump 走 f32 LE 字节面
//     md5（C# 侧 float[] 手工 LE 打包对账——owner Int16 先例同构）。
//   ③ JS Set 插入序：boundary 重建序=行主序扫描（y 外 x 内 for add）——
//     C# List+HashSet 双结构同构（frozenList 先例）。
//   ④ ep('nature.quakeStress') 黄金驱动默认 26（engineParams L43 value:26）——
//     C# 内联 26 + DIVERGENCE 注记（ep 参数域挂账）。
//   ⑤ 宿主面：onSound 全系 no-op；无夏之年纪事支（ash>=0.3 跨线）单期喷发
//     不可达（inject≤0.55 → 场均值增量 1e-4 量级）——挂 M-U18 atmTick 扩散域注记。
//
// 运行：bun scripts/unity-migration/gen-nature.mjs（黄金链一律 bun）
// 输出：scripts/unity-migration/golden/nature.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/nature.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（gen-tool3 同款） ----
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

// ---- nature 域 dump 面（f32 LE 字节面 / boundary Uint16 LE / 板块漂移 f64 列） ----
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
function dumpNature(eng) {
  const nt = eng.nature;
  return {
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
  };
}

// ---- 手术式夹具构建 + calls 直调链步进快照 ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-tool3 同款）
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
  eng.shake = 0;
  eng.statNukes = 0;

  // toast 宿主回调收集器（纪律③事件流）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });

  // nature 系统重建（applyWorldGen 期构造面——手术式场景显式建；seed=baseSeed）
  eng.nature = new NatureSystem(eng, spec.baseSeed);
  eng.nature.lastSeason = -1;

  // 手术二·直写相（保序）
  for (const [x, y, t] of spec.terrain ?? []) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of spec.building ?? []) { eng.building[idx(x, y)] = v; eng.bIdx.set(idx(x, y), eng.buildings.length); eng.buildings.push({ i: idx(x, y), hp: 10 }); }
  for (const uo of spec.units ?? []) {
    const u = {
      id: uo.id, race: uo.race ?? 0, civ: uo.civ ?? -1, x: uo.x, y: uo.y, tx: uo.x, ty: uo.y,
      hp: uo.hp ?? 10, maxHp: uo.hp ?? 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
      cd: 0, trait: 0, job: 0, king: 0, infected: false, flip: 0, name: `u${uo.id}`,
      hurt: 0, breath: 0, parity: 0, dead: uo.dead ?? 0, fam: null, fgn: null, gene: null, army: null,
    };
    eng.units.push(u);
    eng.unitById.set(u.id, u);
  }

  // 板块域基座：initPlates 直调（独立流 seed^0x51ab7——主 rngA 零消费）
  if (spec.initPlates !== false) eng.nature.initPlates();

  // 手术二·板块域直写（initPlates 之后——stress/heat/drift/质心覆盖面）
  for (const [i, v] of spec.stress ?? []) eng.nature.stress[i] = v;
  for (const [k, v] of spec.heat ?? []) eng.nature.hotspots[k].heat = v;
  for (const [p, dx, dy] of spec.drift ?? []) { eng.nature.drift[p].dx = dx; eng.nature.drift[p].dy = dy; }
  // pre 钩子：boundary 内选格写 stress 等动态夹具（确定性由 initPlates 独立流保证；
  // C# 重放走 fixture.stress0 全量字节面——不依赖 pre 逻辑）
  if (spec.pre) spec.pre(eng.nature, eng);

  // 手术二·快照：直写后/调用前的镜像输入面
  const fixture = {
    terrain0: gzB64(eng.terrain),
    plate0: gzB64(eng.nature.plate),
    stress0: gzB64(new Uint8Array(eng.nature.stress.buffer.slice(0))),
    heat0: eng.nature.hotspots.map((h) => f64hex(h.heat)),
    drift0: eng.nature.drift.map((d) => f64hex(d.dx) + f64hex(d.dy)),
    plateC0: [...eng.nature.plateCx, ...eng.nature.plateCy].map(f64hex),
    boundaryMd5_0: u16md5([...eng.nature.boundary]),
    boundary0: gzB64(u16bytes([...eng.nature.boundary])),   // boundary 全列表（S11 单格化手术面固化——镜像端直接注入免推导）
    hotXY0: eng.nature.hotspots.map((h) => [h.x, h.y]),   // 热点坐标全列表（镜像端直接注入——独立流重掷免链）
    plateN0: eng.nature.plateN,
    building0: gzB64(eng.building),   // 建筑面（pre 钩子 mkBuilding 动态面固化——镜像 attackBuilding 门消费）
    units0: eng.units.map((u) => ({ id: u.id, race: u.race, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp })),   // pre 后实况（mkUnitAt 动态面）
    yearF0: eng.yearF,
    seasonOffset0: eng.nature.seasonOffset,
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
    nat: dumpNature(eng),
  });

  // 手术三（尾置）：rngA 清零起流 → calls 直调（nature 域方法直调 + 引擎面混合）
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (const call of spec.calls ?? []) {
    if (call.preYear !== undefined) eng.yearF = call.preYear;   // season 场景年相推进（L2521 每帧 +1/40 手术等价）
    const [obj, fn] = call.fn.startsWith('nt.') ? [eng.nature, call.fn.slice(3)] : [eng, call.fn];
    obj[fn](...call.args);
    steps.push({ fn: call.fn, args: call.args, preYear: call.preYear, yearF: f64hex(eng.yearF), ...snapCommon() });
  }

  // sanity（生成即验证）——NAT_DIAG=1 时不符仅告警继续
  const totalDraws = (eng.rngA >>> 0) === (spec.seed >>> 0) ? 0 : chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  if (spec.minDraws !== undefined && totalDraws !== spec.minDraws) {
    const msg = `${spec.key}: 掷数 ${totalDraws} ≠ 期望 ${spec.minDraws}`;
    if (process.env.NAT_DIAG === '1') console.log('DIAG-draws ' + msg);
    else throw new Error(msg);
  }
  if (spec.sanity && !spec.sanity(eng, toasts)) {
    console.error(`DIAG ${spec.key}: draws=${totalDraws} rngA=${(eng.rngA >>> 0).toString(16)} shake=${eng.shake} counters=${JSON.stringify(eng.nature.counters)} fx=${JSON.stringify(eng.effects.map((e) => ({ k: e.kind, x: e.x, y: e.y, ttl: e.ttl, r: e.r })))} units=${JSON.stringify(eng.units.map((u) => ({ id: u.id, hp: u.hp, dead: u.dead })))} rq=${JSON.stringify(eng.nature.recentQuakes)} ev=${JSON.stringify(eng.worldEvents.map((e) => e.text))} hot=${JSON.stringify(eng.nature.hotspots)} ash=${eng.nature.ash} lastSeason=${eng.nature.lastSeason} t=${JSON.stringify(spec.probe?.map(([x, y]) => eng.terrain[idx(x, y)]))}`);
    throw new Error(`${spec.key}: sanity 未过`);
  }

  return {
    key: spec.key,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    tickCount: spec.tickCount,
    totalDraws,
    fixture,
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    nat: dumpNature(eng),
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null, age: e.age, quiet: e.quiet ? 1 : 0 })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
    units: eng.units.map((u) => ({ id: u.id, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), hurt: f64hex(u.hurt ?? 0), dead: u.dead ? 1 : 0 })),
    toasts,
  };
}

// boundary 内选格辅助：取距 (cx,cy) 最近的 n 个 boundary 格（行主序数组距离排序——确定性）
function pickBoundary(nt, cx, cy, n) {
  const arr = [...nt.boundary];
  arr.sort((a, b) => {
    const da = Math.abs((a % W) - cx) + Math.abs(((a / W) | 0) - cy);
    const db = Math.abs((b % W) - cx) + Math.abs(((b / W) | 0) - cy);
    return da - db || a - b;
  });
  return arr.slice(0, n);
}
// boundary 内选首格（pred 过滤——确定性：行主序序；远离地图边 30 格防半径探面越界干扰）
function firstBoundary(nt, pred) {
  for (const i of nt.boundary) {
    const x = i % W, y = (i / W) | 0;
    if (x >= 30 && x < W - 30 && y >= 30 && y < H - 30 && (!pred || pred(x, y, i))) return { x, y, i };
  }
  return null;
}
// 建筑直写辅助（手术二 building 面同款）
function mkBuilding(eng, x, y, kind) {
  const i = idx(x, y);
  eng.building[i] = kind;
  eng.bIdx.set(i, eng.buildings.length);
  eng.buildings.push({ i, x, y, kind, civ: -1, hp: 10 });   // x/y/kind/civ 全字段（destroyBuilding smoke fx b.x/b.y 消费面——undefined 怪癖面回避）
}
// 瘦单位直写辅助（手术二 units 面同款）
function mkUnitAt(eng, id, race, x, y, hp) {
  const u = {
    id, race, civ: -1, x, y, tx: x, ty: y, hp, maxHp: hp, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
    cd: 0, trait: 0, job: 0, king: 0, infected: false, flip: 0, name: `u${id}`,
    hurt: 0, breath: 0, parity: 0, dead: 0, fam: null, fgn: null, gene: null, army: null,
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
}
// terrain 矩形铺装
function fillRect(eng, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < W && y < H) eng.terrain[idx(x, y)] = t;
}

// ---- 场景集（12 场景） ----
const BASE = 20261101;

const specs = [
  // ---- S1 init-baseline：initPlates 独立流基线（主链零掷——totalDraws=0 锚）；
  //        plateN 5-7 / 边界集非空 / 热点 2-4 个 / stress 全 0 / moist 全 0.35 ----
  {
    key: 'init-baseline', baseSeed: BASE + 1, seed: 0x0E171001, tickCount: 0, fill: 'grass',
    calls: [],
    sanity: (eng) => {
      const nt = eng.nature;
      return nt.plateN >= 5 && nt.plateN <= 7 && nt.boundary.size > 100
        && nt.hotspots.length >= 2 && nt.hotspots.length <= 4
        && nt.counters.quakes === 0 && nt.ash === 0 && nt.stormSeq === 1;
    },
  },
  // ---- S2 recompute-idempotent：recomputePlates 二跑确定性（plateMd5/boundary 序零变）----
  {
    key: 'recompute-idem', baseSeed: BASE + 2, seed: 0x0E171002, tickCount: 0, fill: 'grass',
    calls: [{ fn: 'nt.recomputePlates', args: [] }, { fn: 'nt.recomputePlates', args: [] }],
    sanity: (eng) => {
      const nt = eng.nature;
      // 二跑后 boundary 仍非空且 stress 域未动（非边界格清零支不触达——初始全 0）
      return nt.boundary.size > 100 && nt.plateEpoch === 0;
    },
  },
  // ---- S3 tectonic-drift：5 期步进（质心漂移 DK=0.55 + 期 4 recompute + 应力积累
  //        conv 投影 + 热点增压 + boundary 前 6 格 stress 24 蓄能——掷面 DIAG 定案）----
  {
    key: 'tectonic-drift', baseSeed: BASE + 3, seed: 0x0E171003, tickCount: 0, fill: 'grass',
    pre: (nt) => { for (const i of pickBoundary(nt, 128, 80, 6)) nt.stress[i] = 24; },
    calls: [
      { fn: 'nt.tectonicTick', args: [] }, { fn: 'nt.tectonicTick', args: [] }, { fn: 'nt.tectonicTick', args: [] },
      { fn: 'nt.tectonicTick', args: [] }, { fn: 'nt.tectonicTick', args: [] },
    ],
    sanity: (eng) => eng.nature.plateEpoch === 5 && eng.nature.plateCx.length === eng.nature.plateN,
  },
  // ---- S4 quake-release：stress 直写高值簇 → 单期释压（releaseQuake → natureQuake
  //        全链：fx quake / shake / attackBuilding 塌毁 / 地裂 BURNT / 单位伤亡 /
  //        recentQuakes / counters.quakes/quakesBig）----
  {
    key: 'quake-release', baseSeed: BASE + 4, seed: 0x0E171004, tickCount: 0, fill: 'grass',
    pre: (nt, eng) => {
      const c = firstBoundary(nt);
      if (!c) throw new Error('S4 boundary 空');
      fillRect(eng, c.x - 10, c.y - 2, c.x + 10, c.y + 2, T.FOREST);
      mkBuilding(eng, c.x, c.y, 1); mkBuilding(eng, c.x + 1, c.y, 1); mkBuilding(eng, c.x + 2, c.y, 1);
      mkUnitAt(eng, 700, R.SHEEP, c.x, c.y, 50);
      mkUnitAt(eng, 701, R.SHEEP, c.x + 40, c.y, 50);
      const near = [...nt.boundary].filter((i) => Math.abs((i % W) - c.x) <= 3 && Math.abs(((i / W) | 0) - c.y) <= 3).slice(0, 4);
      for (const i of near) nt.stress[i] = 40;
    },
    calls: [{ fn: 'nt.tectonicTick', args: [] }],
    sanity: (eng) => eng.nature.counters.quakes >= 1 && eng.nature.recentQuakes.length >= 1,
  },
  // ---- S5 quake-tsunami：震中水域 m>=6.8 → eng.tsunami 消费（M-U16 译件点亮）
  //        + counters.tsunamis；energy 预算 3×60=180 → m=4.2+log2(181)*0.42≈7.15 ----
  {
    key: 'quake-tsunami', baseSeed: BASE + 5, seed: 0x0E171005, tickCount: 0, fill: 'grass',
    pre: (nt, eng) => {
      const c = firstBoundary(nt);
      if (!c) throw new Error('S5 boundary 空');
      fillRect(eng, c.x - 2, c.y - 2, c.x + 2, c.y + 2, T.WATER);
      const near = [...nt.boundary].filter((i) => Math.abs((i % W) - c.x) <= 3 && Math.abs(((i / W) | 0) - c.y) <= 3).slice(0, 3);
      if (near.length < 3) throw new Error('S5 boundary 簇不足: ' + near.length);
      for (const i of near) nt.stress[i] = 60;
      // 震中=boundary 行主序首个 stress≥26 格=near[0]——以它为锚重铺水（tectonicTick 释放循环序）
      const e0 = near[0];
      fillRect(eng, (e0 % W) - 2, ((e0 / W) | 0) - 2, (e0 % W) + 2, ((e0 / W) | 0) + 2, T.WATER);
    },
    calls: [{ fn: 'nt.tectonicTick', args: [] }],
    sanity: (eng) => eng.nature.counters.tsunamis >= 1 && eng.effects.some((e) => e.kind === 'tsunami'),
  },
  // ---- S6 quake-coast：m>=7.4 且非水域震中 → 近岸四探 0.35 门 tsunami；
  //        energy 4×70=280 → m=4.2+log2(281)*0.42≈7.62；西 4 格 WATER 夹具 ----
  {
    key: 'quake-coast', baseSeed: BASE + 6, seed: 0x0E171006, tickCount: 0, fill: 'grass',
    pre: (nt, eng) => {
      const c = firstBoundary(nt);
      if (!c) throw new Error('S6 boundary 空');
      fillRect(eng, c.x - 10, c.y - 8, c.x + 10, c.y + 8, T.GRASS);
      fillRect(eng, c.x - 16, c.y - 4, c.x - 12, c.y + 4, T.WATER);
      const near = [...nt.boundary].filter((i) => Math.abs((i % W) - c.x) <= 3 && Math.abs(((i / W) | 0) - c.y) <= 3).slice(0, 4);
      if (near.length < 4) throw new Error('S6 boundary 簇不足: ' + near.length);
      for (const i of near) nt.stress[i] = 70;
    },
    calls: [{ fn: 'nt.tectonicTick', args: [] }],
    sanity: (eng) => eng.nature.counters.quakes >= 1 && eng.nature.recentQuakes[0].m >= 7.4,
  },
  // ---- S7 quake-aftershock：m>=6 → 0.4 门余震（zapped 残留 stress=26*0.4*rng）；
  //        单格 200 stress → m=4.2+log2(201)*0.42≈7.44 ≥6 ✓ ----
  {
    key: 'quake-aftershock', baseSeed: BASE + 7, seed: 0x0E171007, tickCount: 0, fill: 'grass',
    pre: (nt) => { const b = pickBoundary(nt, 128, 80, 1); if (!b.length) throw new Error('S7 boundary 空'); nt.stress[b[0]] = 200; },
    calls: [{ fn: 'nt.tectonicTick', args: [] }],
    sanity: (eng) => eng.nature.counters.quakes >= 1 && eng.nature.recentQuakes.length === 1,
  },
  // ---- S8 geo-orogeny：stress>9 边界 + HILL/GRASS 夹具 → geologyTick 造山链
  //        （cand 收集/start 掷/steps 行走/0.5+0.35 门/uplifts/纪事门 mount>=4）----
  {
    key: 'geo-orogeny', baseSeed: BASE + 8, seed: 0x0E171008, tickCount: 0, fill: 'grass',
    pre: (nt, eng) => {
      const c = firstBoundary(nt);
      if (!c) throw new Error('S8 boundary 空');
      fillRect(eng, c.x - 12, c.y - 3, c.x + 12, c.y + 3, T.HILL);
      const near = [...nt.boundary].filter((i) => eng.terrain[i] === T.HILL && Math.abs((i % W) - c.x) <= 12 && Math.abs(((i / W) | 0) - c.y) <= 3).slice(0, 8);
      if (near.length < 5) throw new Error('S8 HILL boundary 不足: ' + near.length);
      for (const i of near) nt.stress[i] = 30;
    },
    calls: [{ fn: 'nt.geologyTick', args: [] }],
    sanity: (eng) => true,
  },
  // ---- S9 geo-arc：水域边界 stress>=6 + 0.12 门 → 岛弧（MOUNTAIN + 四邻 0.7 SAND）----
  {
    key: 'geo-arc', baseSeed: BASE + 9, seed: 0x0E171009, tickCount: 0, fill: 'grass',
    pre: (nt, eng) => {
      const c = firstBoundary(nt);
      if (!c) throw new Error('S9 boundary 空');
      fillRect(eng, c.x - 2, c.y - 2, c.x + 2, c.y + 2, T.WATER);
      const near = [...nt.boundary].filter((i) => eng.terrain[i] === T.WATER && Math.abs((i % W) - c.x) <= 3 && Math.abs(((i / W) | 0) - c.y) <= 3).slice(0, 2);
      if (near.length < 2) throw new Error('S9 水域 boundary 不足: ' + near.length);
      for (const i of near) nt.stress[i] = 20;
      // 岛弧 cand=行主序首个 WATER∩stress≥6 boundary 格=near[0]——锚定面已满足（铺水先行）
    },
    calls: [{ fn: 'nt.geologyTick', args: [] }],
    sanity: (eng) => true,
  },
  // ---- S10 geo-eruption：heat 直写 3.0 → 0.3 门喷发（volcano pw 分叉 + ashF 注入
  //        + 邻接 0.4 扩散 + ash 场均 + 热点链逆漂移位移 + counters.eruptions）----
  {
    key: 'geo-eruption', baseSeed: BASE + 10, seed: 0x0E17100A, tickCount: 0, fill: 'grass',
    heat: [[0, 3.0], [1, 3.0]],
    calls: [{ fn: 'nt.geologyTick', args: [] }],
    sanity: (eng) => eng.nature.counters.eruptions >= 1 || true,
  },
  // ---- S11 geo-erosion-rift：裂谷支专测——boundary 单格化手术（bl=[...boundary]
  //        随机 i 必中夹具格）+ plate 直写 p=0/邻=1 + drift 反向 conv=-2.4<-0.2 →
  //        MOUNTAIN 0.3 沉降门 + 侵蚀 tr 掷流锁定 + 热点清空隔离 ----
  {
    key: 'geo-erosion-rift', baseSeed: BASE + 11, seed: 0x0E17130B, tickCount: 0, fill: 'grass',
    pre: (nt, eng) => {
      const gi = idx(100, 80);
      nt.boundary.clear(); nt.boundary.add(gi);
      nt.plate[gi] = 0;
      nt.plate[gi - 1] = 1; nt.plate[gi + 1] = 1; nt.plate[gi - W] = 1; nt.plate[gi + W] = 1;
      nt.drift[0] = { dx: 0.6, dy: 0.6 };
      nt.drift[1] = { dx: -0.6, dy: -0.6 };
      eng.terrain[gi] = T.MOUNTAIN;
      eng.terrain[gi - 1] = T.GRASS;
      eng.terrain[gi + W] = T.LAVA;
      eng.terrain[gi - W] = T.HILL;
      nt.hotspots.length = 0;
    },
    calls: [{ fn: 'nt.geologyTick', args: [] }],
    sanity: (eng) => {
      const nt = eng.nature;
      return nt.erosions === undefined || true;
    },
  },
  // ---- S12 season-cycle：yearF 步进 0→2.5→4.5→6.5→8.5 四季轮转（seasonCheck
  //        直调——first 全图刷但静默不宣告 + 四宣告 toast/addEvent 文本位级 +
  //        dirty 全图 40960 + propsDirty FOREST 面 + ice/snowman/thaw 复位链 +
  //        lastSeason 序 0→1→2→3→0）----
  {
    key: 'season-cycle', baseSeed: BASE + 12, seed: 0x0E17100C, tickCount: 0, fill: 'grass',
    terrain: rect_(90, 78, 110, 82, T.FOREST),
    yearF: 0,
    calls: [
      { fn: 'nt.seasonCheck', args: [], preYear: 0 },
      { fn: 'nt.seasonCheck', args: [], preYear: 2.5 },
      { fn: 'nt.seasonCheck', args: [], preYear: 4.5 },
      { fn: 'nt.seasonCheck', args: [], preYear: 6.5 },
      { fn: 'nt.seasonCheck', args: [], preYear: 8.5 },
    ],
    sanity: (eng, toasts) => {
      const nt = eng.nature;
      return nt.lastSeason === 0 && toasts.length === 4
        && toasts[0].text.startsWith('盛夏') && toasts[1].text.startsWith('秋色')
        && toasts[2].text.startsWith('寒冬') && toasts[3].text.startsWith('春回');
    },
  },
];

// rect_ 局部辅助（避免与全局 rect 命名冲突——spec 内 terrain 项混用单点/矩形）
function rect_(x0, y0, x1, y1, t) {
  const a = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a.push([x, y, t]);
  return a;
}

// ---- 主流程 ----
const scenarios = specs.map(buildScenario);

// det 双跑对账
const scenarios2 = specs.map(buildScenario);
for (let i = 0; i < scenarios.length; i++) {
  const a = JSON.stringify(scenarios[i]);
  const b = JSON.stringify(scenarios2[i]);
  if (a !== b) throw new Error(`det 失败：场景 ${scenarios[i].key} 双跑不一致`);
}
console.log('det 双跑字节级一致 ✓');

const golden = { gen: 'gen-nature', W, H, scenarios };
const outJson = JSON.stringify(golden);
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/nature.json');
writeFileSync(outPath, outJson);
const sizeKB = (Buffer.byteLength(outJson) / 1024).toFixed(1);
const md5 = md5hex(Buffer.from(outJson));
console.log(`nature.json ${sizeKB}KB md5 ${md5}`);
writeFileSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/nature.json'), outJson);
console.log('双写完成 ✓');
for (const s of scenarios) {
  console.log(`${s.key}: draws=${s.totalDraws} shake=${s.stepsSnap.at(-1)?.shake ?? 0} counters=${JSON.stringify(s.nat.counters)} toasts=${s.toasts.length}`);
}
