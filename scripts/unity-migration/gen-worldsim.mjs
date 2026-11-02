// ============================================================================
// gen-worldsim.mjs —— M-U26「深时涌现域」黄金向量
//   蓝本 worldsim.ts 全域：initFromTerrain L114-150 / onTerrainChanged L153-165 /
//   hydroTick L175-294（槽 56 %600===41）/ tempTick L299-302 + computeTemps
//   L304-360（槽 54 %120===27）/ oceanTick L365-481（槽 44 %120===15）/
//   glacierTick L486-552（槽 55 %240===33）/ coastTick L557-600（槽 57
//   %600===47）/ biomeTick L605-670（槽 58 %600===53）。
//   已译消费件复用：SetTerrain M-U8a 全级联（L155/L164 钩子面本轮点亮）/
//   NatureWindAt·CellOf·ItczLat·Season M-U9b / moist·rainCell·ash M-U18 注入面。
//   挂账不译：deepSnapshot L675-708（UI 快照面——神谕/面板消费，无 sim 效应）。
//
// 协议要点：
//   ① 掷流：worldsim 独立 mulberry 流 ws.rng = mulberry32(seed ^ 0x3a91f7)
//     （L117——主 rngA 零消费）；消费点：hydroTick L244 沉积 soilF 掷（0.002×√f
//     门内 1 掷/格）+ L288 重分类采样掷（≤600）/ glacierTick L499 积累掷（门内
//     1 掷/格）+ L515 采样 300 掷 / coastTick L566 采样 30 掷 / biomeTick L641
//     采样 60 掷。initFromTerrain/onTerrainChanged/computeTemps 零掷（fbm 纯
//     函数独立 seed 派生）。
//   ② Float32 面：elev/tNoise/flowAcc/tempF/psi/curU/curV/sstAnom/heatQ/cont/
//     coastal/windU/windV/curlArr/qNext 全 Float32Array——dump 走 f32 LE 字节面
//     md5（nature2 moist 先例同构）；order Uint32Array 走 u32 LE md5；
//     waterCnt Uint16Array 走 u16 LE md5。
//   ③ 稳定排序：hydroTick L192 order.sort((a,b)=>elev[b]-elev[a])——ES2019
//     TypedArray sort 稳定；C# 侧双键（elev DESC, idx ASC）稳定归并同构
//     （DIVERGENCE 注记：比较器减法域 float——位级同构）。
//   ④ ep('nature.erosionRate') 黄金驱动默认 1（engineParams REG[14] value:1）——
//     C# 内联 1.0 + DIVERGENCE 注记（M-U7m/nature2 M-U18 先例）。
//   ⑤ season 面：NatureSeason getter（yearF/SEASON_YEARS=2 推导）——S6 冬
//     yearF=4.0→season=(floor(4/2)+0)%4=2？——yearF=6.0→3 冬（黄金 preYear 面
//     注入，tempTick 步内消费）。
//   ⑥ ws.rng 终态不可直读（mulberry32 闭包）——位级锚由消费结果面承载
//     （soilF/glacier/driftAcc/seaLevel/eroded/deposited/biomeDrift 全量 md5/
//     f64hex——M-U17 nature.plate 流同哲学）；C# 重放 wsRngState=(uint)(seed^0x3a91f7)
//     同构起流。
//   ⑦ per-call pre 钩子（ecoState/tempF 直写/riverTilesFill）以结构化 ops 落盘
//     steps[].pre——C# 重放按 ops 复演（零引擎面）。
//
// 运行：bun scripts/unity-migration/gen-worldsim.mjs（黄金链一律 bun）
// 输出：scripts/unity-migration/golden/worldsim.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/worldsim.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（gen-nature2 同款） ----
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
const idx = (x, y) => y * W + x;

// ---- f32/u32/u16 LE 字节面 ----
function f32md5(f32arr) {
  return md5hex(new Uint8Array(f32arr.buffer.slice(0)));
}
function u32bytes(intArr) {
  const u32 = new Uint32Array(intArr.length);
  for (let i = 0; i < intArr.length; i++) u32[i] = intArr[i] >>> 0;
  return new Uint8Array(u32.buffer);
}
function u16bytes(intArr) {
  const u16 = new Uint16Array(intArr.length);
  for (let i = 0; i < intArr.length; i++) u16[i] = intArr[i];
  return new Uint8Array(u16.buffer);
}

// ---- M-U26 深时域 dump 面（f32 全场 12 键 + u32/u16 各 1 + 标量 11 键） ----
function dumpWorldsim(eng) {
  const ws = eng.worldsim;
  const nt = eng.nature;
  return {
    // —— f32 全场 LE md5 ——
    elevMd5: f32md5(ws.elev),
    tNoiseMd5: f32md5(ws.tNoise),
    flowAccMd5: f32md5(ws.flowAcc),
    tempFMd5: f32md5(ws.tempF),
    psiMd5: f32md5(ws.psi),
    curUMd5: f32md5(ws.curU),
    curVMd5: f32md5(ws.curV),
    sstMd5: f32md5(ws.sstAnom),
    heatQMd5: f32md5(ws.heatQ),
    contMd5: f32md5(ws.cont),
    coastalMd5: f32md5(ws.coastal),
    // —— 整场面 ——
    tempOverlayMd5: md5hex(ws.tempOverlay),
    waterCntMd5: md5hex(new Uint8Array(u16bytes(ws.waterCnt))),
    upwellMd5: md5hex(ws.upwell),
    glacierMd5: md5hex(ws.glacier),
    driftAccMd5: md5hex(ws.driftAcc),
    soilMd5: md5hex(ws.soilF),
    // —— 标量面 ——
    globalTemp: f64hex(ws.globalTemp),
    baselineTemp: f64hex(ws.baselineTemp),
    seaLevel: f64hex(ws.seaLevel),
    eroded: f64hex(ws.eroded),
    deposited: f64hex(ws.deposited),
    biomeDrift: ws.biomeDrift,
    glacierTiles: ws.glacierTiles,
    upwellingCells: ws.upwellingCells,
    strongFrac: f64hex(ws.strongFrac),
    coastNoteCd: ws.coastNoteCd,
    // —— nature 域锚（computeTemps 消费面——S6 温度场链路） ——
    season: nt.season,
    ash: f64hex(nt.ash),
    moistMd5: f32md5(nt.moist),
    rainCellMd5: md5hex(nt.rainCell),
    yearF: f64hex(eng.yearF),
  };
}

// ---- 手术式夹具构建 + calls 直调链步进快照（gen-nature2 同款 + M-U26 ws 面） ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-nature2 同款）
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

  // nature 系统重建（手术式场景显式建；seed=baseSeed）
  eng.nature = new NatureSystem(eng, spec.baseSeed);
  eng.nature.lastSeason = -1;

  // 手术二·直写相（terrain 先于 initFromTerrain——elev/tNoise/soilF 由最终地形重导出）
  //   terrainRects [y0, x0, y1, x1, t] 五元矩形（M-U26——三元组点注入保留 terrain 键）
  for (const [x, y, t] of spec.terrain ?? []) eng.terrain[idx(x, y)] = t;
  for (const [y0, x0, y1, x1, t] of spec.terrainRects ?? []) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) eng.terrain[idx(x, y)] = t;
  }
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
  for (const [i, v] of spec.riverDir ?? []) eng.riverDir[i] = v;

  // 板块域基座（独立流 seed^0x51ab7——主 rngA 零消费；moist fill 0.35/rainCell 0）
  if (spec.initPlates !== false) eng.nature.initPlates();

  // worldsim 基座：terrain 定稿后重导出（elev/tNoise/soilF/glacier/driftAcc 全场一致）
  eng.worldsim.seed = spec.baseSeed;
  eng.worldsim.initFromTerrain();

  // 手术三·深时段直写（initFromTerrain 之后覆盖——rect 面展开，f32 精确）
  //   rect 语法：tile 域 [y0, x0, y1, x1, v]（elev/tempF/glacier/driftAcc/soilF——索引 y*W+x）
  //             cell 域（moist/sst/rainCell——粗网格索引 cy*AW+cx，坐标在粗格域 32×20）
  const rectDump = { elev: [], tempF: [], sstAnom: [], psi: [], heatQ: [], cont: [], glacier: [], driftAcc: [], soilF: [], moist: [], rainCell: [] };
  const expandRectsTile = (arr, write) => {
    const dumped = [];
    for (const [y0, x0, y1, x1, v] of arr ?? []) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) write(y * W + x, v);
      dumped.push([y0, x0, y1, x1, f64hex(v)]);
    }
    return dumped;
  };
  const expandRectsCell = (arr, write) => {
    const dumped = [];
    for (const [cy0, cx0, cy1, cx1, v] of arr ?? []) {
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) write(cy * 32 + cx, v);
      dumped.push([cy0, cx0, cy1, cx1, f64hex(v)]);
    }
    return dumped;
  };
  rectDump.elev = expandRectsTile(spec.elevRects, (i, v) => { eng.worldsim.elev[i] = fr(v); });
  rectDump.tempF = expandRectsTile(spec.tempFRects, (i, v) => { eng.worldsim.tempF[i] = fr(v); });
  rectDump.sstAnom = expandRectsCell(spec.sstRects, (i, v) => { eng.worldsim.sstAnom[i] = fr(v); });
  rectDump.psi = expandRectsTile(spec.psiRects, (i, v) => { eng.worldsim.psi[i] = fr(v); });
  rectDump.heatQ = expandRectsTile(spec.heatQRects, (i, v) => { eng.worldsim.heatQ[i] = fr(v); });
  rectDump.cont = expandRectsTile(spec.contRects, (i, v) => { eng.worldsim.cont[i] = fr(v); });
  rectDump.glacier = expandRectsTile(spec.glacierRects, (i, v) => { eng.worldsim.glacier[i] = v; });
  rectDump.driftAcc = expandRectsTile(spec.driftAccRects, (i, v) => { eng.worldsim.driftAcc[i] = v; });
  rectDump.soilF = expandRectsTile(spec.soilRects, (i, v) => { eng.worldsim.soilF[i] = v; });
  rectDump.moist = expandRectsCell(spec.moistRects, (i, v) => { eng.nature.moist[i] = fr(v); });
  rectDump.rainCell = expandRectsCell(spec.rainCellRects, (i, v) => { eng.nature.rainCell[i] = v; });
  // glacierTiles 重算（直写面与计数一致性——>80 视觉冰盖口径 L91-92）
  if ((spec.glacierRects ?? []).length > 0) {
    let gt = 0;
    for (let i = 0; i < N; i++) if (eng.worldsim.glacier[i] > 80) gt++;
    eng.worldsim.glacierTiles = gt;
  }
  if (spec.seaLevel !== undefined) eng.worldsim.seaLevel = spec.seaLevel;
  if (spec.globalTemp !== undefined) eng.worldsim.globalTemp = spec.globalTemp;
  if (spec.baselineTemp !== undefined) eng.worldsim.baselineTemp = spec.baselineTemp;
  if (spec.ash !== undefined) eng.nature.ash = spec.ash;
  if (spec.coastNoteCd !== undefined) eng.worldsim.coastNoteCd = spec.coastNoteCd;
  if (spec.ecoState !== undefined) eng.ecoState = spec.ecoState;

  // pre 钩子：动态夹具（确定性由直写/独立流保证）
  if (spec.pre) spec.pre(eng.nature, eng);

  // 手术四·快照：直写后/调用前的镜像输入面（rect 参数化——基座由 C# InitFromTerrain 重算）
  const fixture = {
    terrain0: gzB64(eng.terrain),
    building0: gzB64(eng.building),
    waterTier0: gzB64(eng.waterTier),
    rectElev: rectDump.elev,
    rectTempF: rectDump.tempF,
    rectSst: rectDump.sstAnom,
    rectPsi: rectDump.psi,
    rectHeatQ: rectDump.heatQ,
    rectCont: rectDump.cont,
    rectGlacier: rectDump.glacier,
    rectDriftAcc: rectDump.driftAcc,
    rectSoil: rectDump.soilF,
    rectMoist: rectDump.moist,
    rectRainCell: rectDump.rainCell,
    glacierTiles0: eng.worldsim.glacierTiles,
    riverDir0: spec.riverDir ?? [],
    seaLevel0: f64hex(eng.worldsim.seaLevel),
    globalTemp0: f64hex(eng.worldsim.globalTemp),
    baselineTemp0: f64hex(eng.worldsim.baselineTemp),
    coastNoteCd0: eng.worldsim.coastNoteCd,
    ash0: f64hex(eng.nature.ash),
    ecoState0: eng.ecoState,
    yearF0: eng.yearF,
    season0: eng.nature.season,
    units0: eng.units.map((u) => ({ id: u.id, race: u.race, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, boat: u.boat ?? 0 })),
    wsSeed0: spec.baseSeed,
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
    ws: dumpWorldsim(eng),
  });

  // 手术五（尾置）：rngA 清零起流 → calls 直调（ws./nt./eng 三前缀分派）
  //   ws.rng 独立流在 initFromTerrain L117 起流（mulberry32(seed^0x3a91f7)）——
  //   掷流闭包态不可直读，位级锚由 ws 全场 md5/标量面承载（M-U17 plate 流哲学）
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (const call of spec.calls ?? []) {
    if (call.preYear !== undefined) eng.yearF = call.preYear;
    if (call.laws) Object.assign(eng.laws, call.laws);
    if (call.preAsh !== undefined) eng.nature.ash = call.preAsh;
    const preOps = [];
    if (call.pre) call.pre(eng, preOps);
    let obj, fn;
    if (call.fn.startsWith('ws.')) { obj = eng.worldsim; fn = call.fn.slice(3); }
    else if (call.fn.startsWith('nt.')) { obj = eng.nature; fn = call.fn.slice(3); }
    else { obj = eng; fn = call.fn; }
    obj[fn](...call.args);
    steps.push({ fn: call.fn, args: call.args, preYear: call.preYear ?? null, laws: call.laws ?? null, preAsh: call.preAsh ?? null, pre: preOps, yearF: f64hex(eng.yearF), ...snapCommon() });
  }

  // 终态
  const fx = [];
  for (const e of eng.effects) fx.push({ t: e.t, x: e.x, y: e.y });
  const events = eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null }));
  const out = {
    key: spec.key,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    tickCount: spec.tickCount,
    seasons: spec.seasons !== false,
    atmosphere: spec.atmosphere !== false,
    disasters: spec.disasters !== false,
    fixture,
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    fx,
    events,
    toasts,
    sanity: spec.sanity ? spec.sanity(eng) : null,
  };
  return out;
}

// ---- 场景面工具 ----
function fillRect(eng, x0, y0, x1, y1, t) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) eng.terrain[idx(x, y)] = t;
}

const BASE = 0x0E260000;

// ============================================================================
// 场景 13 面（六门全分支 + 钩子 + 零门）
// ============================================================================
const specs = [
  // S0 深时基线：initFromTerrain 重导出（elev/tNoise/soilF f32 面 + globalTemp 基线）+ tempTick 单步
  {
    key: 'ws-init', baseSeed: BASE + 0, seed: 0x0E260001, tickCount: 600, yearF: 0,
    terrain: [[128, 80, T.MOUNTAIN], [100, 60, T.FOREST], [200, 100, T.SAND]],
    calls: [
      { fn: 'ws.tempTick', args: [] },
    ],
    sanity: (eng) => Math.abs(eng.worldsim.globalTemp) < 3,
  },
  // S1 水力侵蚀：山/草交界坡度（MOUNTAIN 0.85→GRASS 0.18 梯度）+ riverDir 带 + moist 高湿 →
  //   slope>0.05 && f>2.5 侵蚀支（er 单步≤0.02 + eroded 累计 + 冰川 U 谷 ×1.6 支）
  {
    key: 'hydro-erode', baseSeed: BASE + 1, seed: 0x0E260101, tickCount: 600, yearF: 0,
    terrainRects: [[0, 0, 100, 255, T.MOUNTAIN], [101, 0, 127, 255, T.GRASS]],
    moistRects: [[0, 0, 19, 31, 0.9]],
    riverDir: (() => { const a = []; for (let y = 60; y <= 67; y++) for (let x = 120; x <= 135; x++) a.push([idx(x, y), 1]); return a; })(),
    glacierRects: [[20, 40, 25, 47, 100]],   // 冰川 U 谷 ×1.6 支
    calls: [
      { fn: 'ws.hydroTick', args: [] },
      { fn: 'ws.hydroTick', args: [] },
    ],
    sanity: (eng) => eng.worldsim.eroded > 0,
  },
  // S2 沉积支：GRASS 低地（elev 注入 0.1）→ slope<0.015 && f>3 && elev<0.32 → elev+0.006 门 + soilF+2+rng*4 掷（独立流消费）+ deposited
  {
    key: 'hydro-deposit', baseSeed: BASE + 2, seed: 0x0E260201, tickCount: 600, yearF: 0,
    elevRects: [[40, 40, 90, 215, 0.1]],
    moistRects: [[5, 5, 11, 26, 1.0]],
    calls: [
      { fn: 'ws.hydroTick', args: [] },
    ],
    sanity: (eng) => eng.worldsim.deposited > 0,
  },
  // S3 河口三角洲：riverTiles 入海格（南缘海域）→ 邻陆 soilF+3 / elev+0.003 / deposited+0.003（零掷面）
  {
    key: 'hydro-delta', baseSeed: BASE + 3, seed: 0x0E260301, tickCount: 600, yearF: 0,
    terrainRects: [[152, 0, 159, 255, T.WATER]],
    riverDir: (() => { const a = []; for (let x = 100; x <= 115; x++) a.push([idx(x, 151), 2]); return a; })(),
    calls: [
      { fn: 'ws.hydroTick', args: [] },
    ],
    sanity: (eng) => true,
  },
  // S4 过牧土壤：ecoState='overgraze' → (i&7)==0 && soilF>1 的 GRASS −2 支 + GRASS+1/SAND−1 全图支
  {
    key: 'hydro-overgraze', baseSeed: BASE + 4, seed: 0x0E260401, tickCount: 600, yearF: 0,
    ecoState: 'overgraze',
    soilRects: [[3, 100, 12, 399, 50]],
    calls: [
      { fn: 'ws.hydroTick', args: [] },
    ],
    sanity: (eng) => true,
  },
  // S5 重分类三支：MOUNTAIN<0.52→HILL / HILL<0.24→GRASS / GRASS>0.62→HILL（600 采样独立流 + setTerrain 级联 + onTerrainChanged elev 靠拢 L155）
  {
    key: 'hydro-reclass', baseSeed: BASE + 5, seed: 0x0E260501, tickCount: 600, yearF: 0,
    terrainRects: [[40, 40, 60, 90, T.MOUNTAIN], [70, 40, 80, 90, T.HILL], [90, 40, 110, 90, T.GRASS]],
    elevRects: [
      [40, 40, 60, 90, 0.30],   // MOUNTAIN 低于 0.52 → HILL
      [70, 40, 80, 90, 0.10],   // HILL 低于 0.24 → GRASS
      [90, 40, 110, 90, 0.80],  // GRASS 高于 0.62 → HILL
    ],
    calls: [
      { fn: 'ws.hydroTick', args: [] },
      { fn: 'ws.hydroTick', args: [] },
    ],
    sanity: (eng) => true,
  },
  // S6 温度场：computeTemps 全链（冬 yearF=6 → season=3 + seasonsOn 振幅 + ash 遮蔽 + sstAnom 暖岸 + tempOverlay 量化）+ tempTick EMA ×3
  {
    key: 'temp-winter', baseSeed: BASE + 6, seed: 0x0E260601, tickCount: 120, yearF: 6,
    terrainRects: [[0, 0, 159, 255, T.GRASS]],
    sstRects: [[0, 0, 0, 31, 0.5]],
    calls: [
      { fn: 'ws.tempTick', args: [], preAsh: 0.8 },
      { fn: 'ws.tempTick', args: [], preYear: 6, preAsh: 0.4 },
      { fn: 'ws.tempTick', args: [], preYear: 6, preAsh: 0.1 },
    ],
    sanity: (eng) => true,
  },
  // S7 洋流系统：大洋全图（水粗格全 >32）→ windAt → curl → psi Jacobi 24it → curU/curV → heatQ 平流 → sstAnom 纬圈 ×6 → 上升流 itczLat → strongFrac（FdHypot）
  {
    key: 'ocean-gyre', baseSeed: BASE + 7, seed: 0x0E260701, tickCount: 120, yearF: 2,
    fill: 'deep',
    terrainRects: [[0, 0, 159, 255, T.WATER]],
    calls: [
      { fn: 'ws.oceanTick', args: [] },
      { fn: 'ws.oceanTick', args: [] },
    ],
    sanity: (eng) => eng.worldsim.strongFrac >= 0,
  },
  // S8 冰川进退：tempF 极冷注入（<−0.15 积累 +2~4 独立流掷 + 跨 80 dirty/glacierTiles）+ 采样 300（>180 蔓延 bestE + <30 清零）
  {
    key: 'glacier-adv', baseSeed: BASE + 8, seed: 0x0E260801, tickCount: 240, yearF: 4,
    terrainRects: [[40, 40, 119, 215, T.GRASS]],
    tempFRects: [[40, 40, 119, 215, -0.4]],
    glacierRects: [[60, 120, 61, 121, 200]],
    calls: [
      { fn: 'ws.glacierTick', args: [] },
      { fn: 'ws.glacierTick', args: [] },
      { fn: 'ws.glacierTick', args: [] },
    ],
    sanity: (eng) => true,
  },
  // S9 海岸进退：seaLevel=0.8 海侵（SAND+邻水+elev<seaLevel*0.012→WATER）+ 播报 + coastNoteCd=2400 冷却
  //   seaLevel/globalTemp/baselineTemp 由手术三直写（fixture 全记录——C# 零推导）
  {
    key: 'coast-tide', baseSeed: BASE + 9, seed: 0x0E260901, tickCount: 600, yearF: 0,
    terrainRects: [[150, 0, 159, 255, T.WATER], [149, 0, 149, 255, T.SAND]],
    elevRects: [[149, 0, 149, 255, 0.005]],
    seaLevel: 0.8, globalTemp: 0.2, baselineTemp: 0.2,
    calls: [
      { fn: 'ws.coastTick', args: [] },
      { fn: 'ws.coastTick', args: [] },
      { fn: 'ws.coastTick', args: [] },
    ],
    sanity: (eng) => true,
  },
  // S10 群系漂移：moist/tempF/soilF 三元错配（driftAcc 直写 >3 入池）→ 采样 60 迁移 ≤12 + GRASS 枢纽 + soil≤110 门 + biomeDrift + 播报 ≥3
  {
    key: 'biome-drift', baseSeed: BASE + 10, seed: 0x0E260A01, tickCount: 600, yearF: 0,
    terrainRects: [[40, 40, 119, 215, T.GRASS]],
    moistRects: [[5, 5, 14, 26, 0.9]],
    tempFRects: [[40, 40, 119, 215, 0.3]],
    soilRects: [[40, 40, 119, 215, 200]],
    driftAccRects: [[40, 40, 119, 215, 5]],
    calls: [
      { fn: 'ws.biomeTick', args: [] },
      { fn: 'ws.biomeTick', args: [] },
    ],
    sanity: (eng) => eng.worldsim.biomeDrift > 0,
  },
  // S11 钩子面：onTerrainChanged 直调四支（BURNT soil−8 / WATER 清冰川+glacierTiles−−+dirty / elev 靠拢 tgt*0.7 / driftAcc 清零）
  {
    key: 'hook-terrain', baseSeed: BASE + 11, seed: 0x0E260B01, tickCount: 0, yearF: 0,
    glacierRects: [[10, 10, 10, 10, 100], [10, 11, 10, 11, 60]],
    calls: [
      { fn: 'ws.onTerrainChanged', args: [idx(10, 10), T.WATER] },     // 清冰川（>80 计数 −1）+ elev 靠拢 −1.0
      { fn: 'ws.onTerrainChanged', args: [idx(11, 10), T.WATER] },     // ≤80 只清零
      { fn: 'ws.onTerrainChanged', args: [idx(20, 20), T.BURNT] },     // soilF−8 支
      { fn: 'ws.onTerrainChanged', args: [idx(30, 30), T.MOUNTAIN] },  // elev 靠拢 0.85
    ],
    sanity: (eng) => eng.worldsim.glacierTiles === 0,
  },
  // S12 零门：atmosphere=false → oceanTick 早退零掷；disasters=false → coastTick 只 seaLevel/冷却衰减
  {
    key: 'gates-off', baseSeed: BASE + 12, seed: 0x0E260C01, tickCount: 120, yearF: 2,
    atmosphere: false, disasters: false,
    coastNoteCd: 3000,
    calls: [
      { fn: 'ws.oceanTick', args: [] },
      { fn: 'ws.coastTick', args: [] },
      { fn: 'ws.biomeTick', args: [] },
    ],
    sanity: (eng) => eng.worldsim.coastNoteCd === 2400,
  },
  // S13 海退支 + 海退播报：seaLevel=−0.8 直写（浅水 tier<=1 露滩 + WATER→SAND + noteKind=2 文案）
  {
    key: 'coast-regress', baseSeed: BASE + 13, seed: 0x0E260D01, tickCount: 600, yearF: 0,
    terrainRects: [[150, 0, 159, 255, T.WATER]],
    seaLevel: -0.8, globalTemp: 0.2, baselineTemp: 0.2, coastNoteCd: 0,
    calls: [
      { fn: 'ws.coastTick', args: [] },
      { fn: 'ws.coastTick', args: [] },
      { fn: 'ws.coastTick', args: [] },
    ],
    sanity: (eng) => true,
  },
];

// ---- 主流程 ----
const WS_ONLY = process.env.WS_ONLY ? process.env.WS_ONLY.split(',') : null;
const WS_SEED = {};
for (const k of Object.keys(process.env)) if (k.startsWith('WS_SEED_')) WS_SEED[k.slice(8).replace(/-/g, '')] = Number.parseInt(process.env[k], 16);
const scenarios = specs
  .filter((s) => !WS_ONLY || WS_ONLY.includes(s.key))
  .map((spec) => buildScenario({ ...spec, seed: WS_SEED[spec.key.replace(/-/g, '')] ?? spec.seed }));
const out = {
  meta: {
    gen: 'gen-worldsim.mjs',
    milestone: 'M-U26',
    domain: 'worldsim deep-time: init/钩子/hydro/temp/computeTemps/ocean/glacier/coast/biome',
    blueprint: 'worldsim.ts L114-150/L153-165/L175-294/L299-360/L365-481/L486-552/L557-600/L605-670',
    W, H, AW: W / 8, AH: H / 8, CELL: 8,
    erosionRate: 1,
  },
  scenarios,
};
const json = JSON.stringify(out);
const md5 = createHash('md5').update(Buffer.from(json)).digest('hex');
if (WS_ONLY) {
  console.log(`[ONLY ${WS_ONLY.join(',')}] 跳过落盘`);
} else {
  const p1 = path.join(ROOT, 'scripts/unity-migration/golden/worldsim.json');
  writeFileSync(p1, json);
  const p2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/worldsim.json');
  writeFileSync(p2, json);
}
console.log(`worldsim.json ${scenarios.length} 场景 ${(json.length / 1024).toFixed(1)}KB md5=${md5}`);
for (const s of scenarios) console.log(`  ${s.key}: steps=${s.stepsSnap.length} fx=${s.fx.length} ev=${s.events.length} sanity=${s.sanity}`);
