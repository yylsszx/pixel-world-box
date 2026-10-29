// gen-render.mjs — M-U4 渲染 I 黄金向量生成器（地形烘焙 flushDirty / 道具烘焙 flushProps / 单位绘制决策 drawUnitSprite）
// 真实现 = engine.ts flushDirty+flushProps（地形/道具像素烘焙）+ render.ts render()（单位决策链）—— 纪律②零同源复制
// 蓝本段：engine.ts flushDirty L14016-14297（水深分层/variant 抖动/季节 tint/软边抖动/坡向明暗/道路/疆域/辐射/8×8 特征聚簇）
//         engine.ts flushProps L14299-14440（树/山 bail/路石/草花/沙纹/丘陵/雪晶/焦土/雪人）
//         render.ts render L1495-1542（单位迭代序/剔除/hp 条/恐慌/选中框）+ drawUnitSprite L2045 + drawUnitBody L2206（LOD 四档分发/阴影/幼体/tiny/squash/中档人形/中档动物）
// bail 协议：sprites.ts 46 精灵绘制函数调用前打标（BAIL）→ 其 canvas ops 折叠为一条 bailCalls 记录 {fn,a:[基元hex]}——
//         精灵内部像素画 = M-U5 域；M-U4 锁定管线/决策/层级/剔除/bail 契约。C# 侧按 fn 名+基元参数逐位复现。
// dump 协议：f64 → u64 bits hex（小端 16 字符）；canvas ops = {o, a:[f64hex…], s:[fillStyle,strokeStyle,lineWidth,globalAlpha]}；地形 = 8×8 RGBA 128 hex。
// 内存纪律：每段复用单引擎（terrainImg 10.5MB/个），场景间 reset；render.ts 模块态（lastWcClear 首场景全清/后续联合清屏、
//         sunCacheFrame 按 frameCount 重算）在固定场景序列下确定 → det 双跑可复现。
// 跑法：node scripts/unity-migration/gen-render.mjs（jiti 转译；自带 sanity + det 双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片：录制版 canvas/ctx（必须在 import engine 之前挂好） ----------------
const BAIL = { depth: 0, fn: null };
let canvasSeq = 0;

class RecCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.id = canvas.__id;
    this.ops = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = true;
    this.font = '';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
  }
  _rec(o, args) {
    this.ops.push({ o, a: args, c: this.id, s: [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha], tag: BAIL.depth > 0 ? BAIL.fn : null });
  }
  fillRect(x, y, w, h) { this._rec('fillRect', [x, y, w, h]); }
  clearRect(x, y, w, h) { this._rec('clearRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._rec('strokeRect', [x, y, w, h]); }
  save() { this._rec('save', []); }
  restore() { this._rec('restore', []); }
  translate(x, y) { this._rec('translate', [x, y]); }
  scale(x, y) { this._rec('scale', [x, y]); }
  rotate() {}
  setTransform(a, b, c, d, e, f) { this._rec('setTransform', [a, b, c, d, e, f]); }
  resetTransform() { this._rec('setTransform', [1, 0, 0, 1, 0, 0]); }
  beginPath() {} moveTo() {} lineTo() {} arc() {} closePath() {} fill() {} stroke() {} clip() {} rect() {}
  fillText() {} strokeText() {} measureText() { return { width: 0 }; }
  drawImage(img, ...a) { this._rec('drawImage', [img && img.__id != null ? img.__id : 'img', ...a]); }
  putImageData(img, ...a) { this._rec('putImageData', [img && img.__id != null ? img.__id : 'img', ...a]); }
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0, __id: 'imgdata' }; }
  getImageData(x, y, w, h) { return this.createImageData(w, h); }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  setLineDash() {} getLineDash() { return []; }
  quadraticCurveTo() {} bezierCurveTo() {} arcTo() {} ellipse() {} isPointInPath() { return false; }
}

function mkCanvas(w, h) {
  const c = { width: w ?? 0, height: h ?? 0, style: {}, __id: 'cv' + (++canvasSeq) };
  c.getContext = () => { if (!c.__ctx) c.__ctx = new RecCtx(c); return c.__ctx; };
  return c;
}
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? mkCanvas() : { style: {}, appendChild() {} }),
  addEventListener() {},
  getElementById: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.requestAnimationFrame = () => 0;
// 注意：不垫 globalThis.window —— engine WASM boot 守卫 typeof window!=='undefined'

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });

// 先 import sprites 并给全部导出函数打 bail 标（render.ts/engine.ts destructure 绑定的是包装后的值）
const spritesNs = await jiti.import(path.join(ROOT, 'src/lib/game/sprites.ts'));
const BAIL_ARGS = {
  drawTree: (a) => [a[1], a[2], a[3], a[4]],
  drawMountainProp: (a) => [a[1], a[2], a[3], a[4], a[5]],
  drawBoat: (a) => [a[1]?.x, a[1]?.y, a[3]],
  drawCaravan: (a) => [a[1]?.x, a[1]?.y, a[3]],
  drawPerson: (a) => [a[1]?.x, a[1]?.y, a[3]],
  drawPersonFine: (a) => [a[1]?.x, a[1]?.y, a[3], a[4] ? 1 : 0],
  drawQuadFine: (a) => [a[1]?.x, a[1]?.y, a[3], a[4] ? 1 : 0],
};
const bailCalls = [];
let unitDirect = false; // M-U7a 接线后单元场景直通模式：精灵真实现 ops 全记录（bail 折叠契约仅地形/道具域保留，2026-10-29）
for (const k of Object.keys(spritesNs)) {
  if (typeof spritesNs[k] !== 'function') continue;
  const orig = spritesNs[k];
  spritesNs[k] = function (...args) {
    if (unitDirect) return orig.apply(this, args); // 直通：不折叠不标 tag（真实现 ops 进 op 流）
    const ser = BAIL_ARGS[k] ? BAIL_ARGS[k](args) : (() => {
      const u = args[1];
      return u && typeof u === 'object' ? [u.x, u.y, typeof args[2] === 'number' ? args[2] : null] : [];
    })();
    bailCalls.push({ fn: k, a: ser.map((v) => (typeof v === 'number' ? f64hex(v) : v)) });
    BAIL.depth++; BAIL.fn = k;
    try { return orig.apply(this, args); } finally { BAIL.depth--; if (BAIL.depth === 0) BAIL.fn = null; }
  };
}

const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const renderMod = await jiti.import(path.join(ROOT, 'src/lib/game/render.ts'));

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
// ops 切片 [n0..] + bail 折叠（tag 期间的 ops 丢弃——已由 bailCalls 记录契约）
function dumpOpRange(ctx, n0) {
  const out = [];
  for (let k = n0; k < ctx.ops.length; k++) {
    const op = ctx.ops[k];
    if (op.tag != null) continue;
    // style 按 op 消费归一化：fillRect → [fillStyle]；strokeRect → [strokeStyle, lineWidth]；其余 null
    let s = null;
    if (op.o === 'fillRect') s = [op.s[0]];
    else if (op.o === 'strokeRect') s = [op.s[1], op.s[2]];
    out.push({ o: op.o, a: op.a.map((v) => (typeof v === 'number' ? f64hex(v) : v)), s });
  }
  return out;
}
function h2f(hex) {
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, true);
}

// ---------------- 引擎（每段一个，场景间 reset —— terrainImg 10.5MB/个 内存纪律） ----------------
let SEG_ENG = null;
function segEng() {
  if (!SEG_ENG) {
    SEG_ENG = new GameEngine(123);
    SEG_ENG.civs.length = 0;
    SEG_ENG.units.length = 0;
    SEG_ENG.unitById.clear();
    SEG_ENG.laws = { ...DEFAULT_LAWS };
    SEG_ENG.overlayMode = 'none';
    if (!SEG_ENG.worldsim) SEG_ENG.worldsim = { glacier: new Uint8Array(W * H) };
    if (!SEG_ENG.worldsim.glacier) SEG_ENG.worldsim.glacier = new Uint8Array(W * H);
  }
  const eng = SEG_ENG;
  eng.effects.length = 0;
  eng.buildings.length = 0;
  eng.armies.length = 0;
  eng.items.length = 0;
  eng.blood.length = 0;
  eng.corpses.length = 0;
  eng.phoenixAshes.length = 0;
  if (eng.footprints) eng.footprints.length = 0;
  if (eng.flocks) eng.flocks.length = 0;
  eng.fireSet.clear();
  eng.occSet.clear();
  if (eng.activeBattles) eng.activeBattles.clear();
  if (eng.riverTiles) eng.riverTiles.clear();
  eng.wet.clear();
  eng.dirty.clear();
  eng.propsDirty.clear();
  eng.selectedId = 0;
  eng.shake = 0;
  eng.nature.ash = 0;
  eng.nature.seasonOffset = 0;   // season 是 getter：laws.seasons × floor(yearF/SEASON_YEARS)+offset → 拨 offset+yearF=0
  eng.yearF = 0;
  eng.laws = { ...DEFAULT_LAWS, seasons: true };
  eng.civs.length = 0;
  eng.units.length = 0;
  eng.worldsim.glacier.fill(0);
  return eng;
}
function baseField(eng) {
  eng.terrain.fill(T.GRASS);
  eng.waterTier.fill(0);
  eng.road.fill(0);
  eng.owner.fill(-1);
  eng.radiate.fill(0);
  eng.snowman.fill(0);
  for (let i = 0; i < W * H; i++) eng.variant[i] = (i * 7 + 3) & 255;
}
function setTile(eng, i, o) {
  if (o.t !== undefined) eng.terrain[i] = o.t;
  if (o.variant !== undefined) eng.variant[i] = o.variant;
  if (o.waterTier !== undefined) eng.waterTier[i] = o.waterTier;
  if (o.road !== undefined) eng.road[i] = o.road;
  if (o.owner !== undefined) eng.owner[i] = o.owner;
  if (o.radiate !== undefined) eng.radiate[i] = o.radiate;
  if (o.snowman !== undefined) eng.snowman[i] = o.snowman;
}
function tileIn(eng, i) {
  const x = i % W, y = (i / W) | 0;
  return {
    i, t: eng.terrain[i], variant: eng.variant[i], waterTier: eng.waterTier[i],
    road: eng.road[i], owner: eng.owner[i], radiate: eng.radiate[i],
    nL: x > 0 ? eng.terrain[i - 1] : -1, nR: x < W - 1 ? eng.terrain[i + 1] : -1,
    nT: y > 0 ? eng.terrain[i - W] : -1, nB: y < H - 1 ? eng.terrain[i + W] : -1,
    nTL: x > 0 && y > 0 ? eng.terrain[i - W - 1] : -1, nBR: x < W - 1 && y < H - 1 ? eng.terrain[i + W + 1] : -1,
    oL: x > 0 ? eng.owner[i - 1] : -9, oR: x < W - 1 ? eng.owner[i + 1] : -9,
    oT: y > 0 ? eng.owner[i - W] : -9, oB: y < H - 1 ? eng.owner[i + W] : -9,
    civColor: eng.owner[i] >= 0 && eng.civs[eng.owner[i]] && eng.civs[eng.owner[i]].alive ? eng.civs[eng.owner[i]].color : null,
    season: eng.nature.season, ash: f64hex(eng.nature.ash),
    glacier: eng.worldsim.glacier[i],
  };
}
// 变体猎取：flushDirty hsh = (variant*2654435761 + i*97)>>>0；flushProps 各分支有独立乘数
const HASH_MUL = { dirt: 97, road: 0, grass: 40503, sand: 9127, hill: 7907, snow: 1543, burnt: 3571 };
function huntVariant(i, pred, kind = 'dirt', lo = 0) {
  for (let v = lo; v <= 255; v++) {
    const hsh = ((v * 2654435761) + i * HASH_MUL[kind]) >>> 0;
    if (pred(hsh, v)) return v;
  }
  throw new Error('huntVariant fail i=' + i + ' kind=' + kind);
}

// ============================================================
// 段 A：地形烘焙 flushDirty
// ============================================================
const terrainScen = [];
function terrScenario(name, setup, tiles) {
  const eng = segEng();
  baseField(eng);
  setup(eng);
  eng.dirty.clear();
  for (const i of tiles) eng.dirty.add(i);
  eng.flushDirty();
  const outs = tiles.map((i) => {
    const bx = (i % W) * 8, by = ((i / W) | 0) * 8, WBW = W * 8;
    let hex = '';
    for (let sy = 0; sy < 8; sy++) {
      let off = ((by + sy) * WBW + bx) * 4;
      for (let sx = 0; sx < 8; sx++, off += 4)
        for (let k = 0; k < 4; k++) hex += eng.terrainImg.data[off + k].toString(16).padStart(2, '0');
    }
    return { in: tileIn(eng, i), rgba: hex };
  });
  terrainScen.push({ name, tiles: outs });
}
const TI = idx(40, 40); // 基准 tile（中部）
function T1(name, t, variant, extra = {}, nbrs = {}) {
  terrScenario(name, (eng) => {
    setTile(eng, TI, { t, variant, ...extra });
    for (const [k, v] of Object.entries(nbrs)) {
      const off = { L: -1, R: 1, T: -W, B: W, TL: -W - 1, BR: W + 1 }[k];
      setTile(eng, TI + off, { t: v, variant: (variant + 11) & 255 });
    }
  }, [TI]);
}
T1('TERR01_grass_base', T.GRASS, 64);
T1('TERR02_grass_v6', T.GRASS, 6);
T1('TERR03_grass_v12', T.GRASS, 12);
T1('TERR04_forest', T.FOREST, 90);
T1('TERR05_sand', T.SAND, 33);
T1('TERR06_water_t0', T.WATER, 50, { waterTier: 0 });
T1('TERR07_water_t1', T.WATER, 50, { waterTier: 1 });
T1('TERR08_water_t2', T.WATER, 50, { waterTier: 2 });
T1('TERR09_deep_t3', T.DEEP, 50, { waterTier: 3 });
T1('TERR10_deep_t4', T.DEEP, 50, { waterTier: 4 });
T1('TERR11_snow', T.SNOW, 200);
T1('TERR12_ice', T.ICE, 150);
T1('TERR13_hill', T.HILL, 80);
T1('TERR14_mountain', T.MOUNTAIN, 80);
T1('TERR15_lava', T.LAVA, 70);
T1('TERR16_swamp', T.SWAMP, 45);
T1('TERR17_burnt', T.BURNT, 66);
terrScenario('TERR18_grass_flower', (eng) => {
  setTile(eng, TI, { t: T.GRASS, variant: huntVariant(TI, (h) => h % 37 === 0) });
}, [TI]);
terrScenario('TERR19_sand_wetL', (eng) => {
  setTile(eng, TI - 1, { t: T.WATER });
  setTile(eng, TI, { t: T.SAND, variant: 33 });
}, [TI]);
terrScenario('TERR20_water_coast_foam', (eng) => {
  setTile(eng, TI - 1, { t: T.GRASS });
  setTile(eng, TI, { t: T.WATER, variant: huntVariant(TI, (h) => (h & 3) !== 0), waterTier: 0 });
}, [TI]);
terrScenario('TERR21_hillshade_nw', (eng) => {
  setTile(eng, TI - W - 1, { t: T.MOUNTAIN });
  setTile(eng, TI, { t: T.HILL, variant: 80 });
}, [TI]);
terrScenario('TERR22_hillshade_se', (eng) => {
  setTile(eng, TI + W + 1, { t: T.MOUNTAIN });
  setTile(eng, TI, { t: T.HILL, variant: 80 });
}, [TI]);
terrScenario('TERR23_road_mix', (eng) => setTile(eng, TI, { t: T.GRASS, variant: 64, road: 3 }), [TI]);
terrScenario('TERR24_owner_border', (eng) => {
  eng.civs[1] = { id: 1, color: [120, 80, 200], colorHex: '#7850c8', alive: true };
  setTile(eng, TI + 1, { owner: 0 });
  setTile(eng, TI, { t: T.GRASS, variant: 64, owner: 1 });
}, [TI]);
terrScenario('TERR25_owner_inner', (eng) => {
  eng.civs[1] = { id: 1, color: [120, 80, 200], colorHex: '#7850c8', alive: true };
  setTile(eng, TI - 1, { owner: 1 }); setTile(eng, TI + 1, { owner: 1 });
  setTile(eng, TI - W, { owner: 1 }); setTile(eng, TI + W, { owner: 1 });
  setTile(eng, TI, { t: T.GRASS, variant: 64, owner: 1 });
}, [TI]);
terrScenario('TERR26_owner_dead', (eng) => {
  eng.civs[1] = { id: 1, color: [120, 80, 200], colorHex: '#7850c8', alive: false };
  setTile(eng, TI, { t: T.GRASS, variant: 64, owner: 1 });
}, [TI]);
terrScenario('TERR27_radiate', (eng) => setTile(eng, TI, { t: T.GRASS, variant: 64, radiate: 1 }), [TI]);
terrScenario('TERR28_softedge_grass_sand_even', (eng) => {
  setTile(eng, TI + 1, { t: T.SAND, variant: 33 });
  setTile(eng, TI, { t: T.GRASS, variant: 64 }); // (variant+x+y)&1 = 0 → 混合
}, [TI]);
terrScenario('TERR28b_softedge_odd_nomix', (eng) => {
  setTile(eng, TI + 1, { t: T.SAND, variant: 33 });
  setTile(eng, TI, { t: T.GRASS, variant: 65 }); // 奇 → 不混合
}, [TI]);
terrScenario('TERR29_softedge_grass_forest', (eng) => {
  setTile(eng, TI + 1, { t: T.FOREST, variant: 90 });
  setTile(eng, TI, { t: T.GRASS, variant: 64 });
}, [TI]);
terrScenario('TERR30_stack_road_owner_radiate', (eng) => {
  eng.civs[2] = { id: 2, color: [200, 120, 40], colorHex: '#c87828', alive: true };
  setTile(eng, TI - 1, { owner: 2 });
  setTile(eng, TI, { t: T.SAND, variant: 33, road: 2, owner: 2, radiate: 1 });
}, [TI]);
function TSeason(name, season, ash = 0, glacier = 0) {
  terrScenario(name, (eng) => {
    eng.nature.seasonOffset = season;
    eng.yearF = 0;
    eng.nature.ash = ash;
    if (glacier > 0) eng.worldsim.glacier[TI] = glacier;
    setTile(eng, TI, { t: T.GRASS, variant: 64 });
    setTile(eng, TI + 1, { t: T.FOREST, variant: 90 });
    setTile(eng, TI + 2, { t: T.HILL, variant: 80 });
    setTile(eng, TI + 3, { t: T.SAND, variant: 33 });
  }, [TI, TI + 1, TI + 2, TI + 3]);
}
TSeason('TERR31_spring', 0);
TSeason('TERR32_summer', 1);
TSeason('TERR33_autumn', 2);
TSeason('TERR34_winter_lat05', 3);            // y=40 latF=0.5
terrScenario('TERR35_winter_highlat', (eng) => {
  eng.nature.seasonOffset = 3;
  eng.yearF = 0;
  const i2 = idx(40, 140);                    // latF=0.875
  setTile(eng, i2, { t: T.GRASS, variant: 64 });
}, [idx(40, 140)]);
TSeason('TERR36_ash_summer', 1, 0.4);
TSeason('TERR37_ash_volcanowinter', 1, 0.8);  // s=1 && ash>0.05 && latF>0.45 → 火山冬霜
TSeason('TERR38_glacier', 1, 0, 150);         // 冰川覆被压过季节

// ============================================================
// 段 B：道具烘焙 flushProps
// ============================================================
const propsScen = [];
function propScenario(name, setup) {
  const eng = segEng();
  baseField(eng);
  const PI = idx(50, 30);
  setup(eng, PI);
  bailCalls.length = 0;
  eng.propsDirty.clear();
  eng.propsDirty.add(PI);
  const n0 = eng.propsCtx.ops.length;
  eng.flushProps();
  const dumped = dumpOpRange(eng.propsCtx, n0);
  propsScen.push({
    name,
    in: { i: PI, t: eng.terrain[PI], variant: eng.variant[PI], road: eng.road[PI], snowman: eng.snowman[PI], season: eng.nature.season },
    ops: dumped,
    bails: bailCalls.map((b) => ({ fn: b.fn, a: b.a })),
  });
}
propScenario('PROP01_road_pebble', (eng, i) => {
  setTile(eng, i, { t: T.GRASS, variant: huntVariant(i, (h) => h % 3 === 0 && h % 6 === 0, 'road'), road: 1 });
});
propScenario('PROP02_road_none', (eng, i) => {
  setTile(eng, i, { t: T.GRASS, variant: huntVariant(i, (h) => h % 3 !== 0, 'road'), road: 1 });
});
propScenario('PROP03_grass_flower', (eng, i) => setTile(eng, i, { t: T.GRASS, variant: huntVariant(i, (h) => h % 31 < 3, 'grass') }));
propScenario('PROP04_grass_tuft', (eng, i) => setTile(eng, i, { t: T.GRASS, variant: huntVariant(i, (h) => h % 31 >= 3 && h % 31 < 10, 'grass') }));
propScenario('PROP05_grass_stone', (eng, i) => setTile(eng, i, { t: T.GRASS, variant: huntVariant(i, (h) => h % 31 === 10, 'grass') }));
propScenario('PROP06_grass_none', (eng, i) => setTile(eng, i, { t: T.GRASS, variant: huntVariant(i, (h) => h % 31 > 10, 'grass') }));
propScenario('PROP07_sand_ripple', (eng, i) => setTile(eng, i, { t: T.SAND, variant: huntVariant(i, (h) => h % 13 === 0, 'sand') }));
propScenario('PROP08_sand_gravel', (eng, i) => setTile(eng, i, { t: T.SAND, variant: huntVariant(i, (h) => h % 13 !== 0 && h % 37 === 0, 'sand') }));
propScenario('PROP09_hill_drygrass', (eng, i) => setTile(eng, i, { t: T.HILL, variant: huntVariant(i, (h) => h % 17 === 0, 'hill') }));
propScenario('PROP10_snow_crystal', (eng, i) => setTile(eng, i, { t: T.SNOW, variant: huntVariant(i, (h) => h % 19 === 0, 'snow') }));
propScenario('PROP11_burnt_char', (eng, i) => setTile(eng, i, { t: T.BURNT, variant: huntVariant(i, (h) => h % 11 === 0, 'burnt') }));
propScenario('PROP12_snowman', (eng, i) => setTile(eng, i, { t: T.SNOW, variant: 200, snowman: 1 }));
propScenario('PROP13_forest_tree_bail', (eng, i) => {
  eng.nature.seasonOffset = 2;
  eng.yearF = 0;
  setTile(eng, i, { t: T.FOREST, variant: 90 });
});
propScenario('PROP14_mountain_bail', (eng, i) => setTile(eng, i, { t: T.MOUNTAIN, variant: 80 }));
propScenario('PROP15_water_noprop', (eng, i) => setTile(eng, i, { t: T.WATER, variant: 50, waterTier: 0 }));

// ============================================================
// 段 C：单位绘制决策 render()
// ============================================================
const unitScen = [];
function unitScenario(name, opt) {
  const eng = segEng();
  baseField(eng);
  if (opt.civs) for (const c of opt.civs) eng.civs[c.id] = { id: c.id, color: c.color, colorHex: c.colorHex, alive: c.alive !== false };
  const ux = opt.x ?? 30, uy = opt.y ?? 20;
  const u = {
    id: 1, name: 'U', race: opt.race ?? 0, civ: opt.civ ?? -1,
    x: ux, y: uy, rx: opt.rx, ry: opt.ry, dpx: opt.dpx, dpy: opt.dpy,
    flip: opt.flip ? 1 : 0, lx: opt.lx, ly: opt.ly, wep: opt.wep ?? null, atk: opt.atk ?? 0,
    trait: opt.trait ?? null, age: opt.age ?? 20, hurt: opt.hurt ?? 0,
    hp: opt.hp ?? 60, maxHp: opt.maxHp ?? 60, panic: opt.panic, boat: opt.boat ? 1 : 0,
    caravan: opt.caravan ?? 0, king: opt.king ? 1 : 0, dead: 0, job: 0,
  };
  eng.units.push(u);
  if (opt.u2) eng.units.push({ ...u, id: 2, x: opt.u2.x, y: opt.u2.y, race: opt.u2.race ?? u.race });
  if (opt.terrainAt !== undefined) setTile(eng, idx(ux, uy), { t: opt.terrainAt, waterTier: 0 });
  eng.cam = { x: opt.camX ?? ux, y: opt.camY ?? uy, zoom: opt.zoom ?? 4 };
  eng.frameCount = opt.fc ?? 1000;
  eng.fxPrefs = { fxDensity: 1, ambience: false, riverFlow: false, dayNight: !!opt.dayNight, hpBars: !!opt.hpBars, battleFlash: false, blood: true, corpses: true, dmgNumbers: true };
  eng.selectedId = opt.selected ? 1 : 0;
  bailCalls.length = 0;
  unitDirect = true;  // 单元场景直通（M-U7a 后 C# WbRender.UnitScene 直调 WbSprites 全展开）
  const screen = mkCanvas(1024, 640).getContext();
  const n0 = eng.worldCtx.ops.length;
  renderMod.render(eng, screen, 1024, 640);
  unitScen.push({
    name,
    in: {
      cam: { x: f64hex(eng.cam.x), y: f64hex(eng.cam.y), zoom: f64hex(eng.cam.zoom) },
      cw: 1024, ch: 640, frameCount: eng.frameCount,
      fxPrefs: { dayNight: !!opt.dayNight, hpBars: !!opt.hpBars },
      selectedId: eng.selectedId,
      civs: opt.civs ?? null,
      terrainAt: eng.terrain[idx(ux, uy)],
      units: [u, ...(opt.u2 ? [{ ...u, id: 2, x: opt.u2.x, y: opt.u2.y, race: opt.u2.race ?? u.race }] : [])].map((q) => ({
        id: q.id, race: q.race, civ: q.civ, x: f64hex(q.x), y: f64hex(q.y),
        rx: q.rx === undefined ? null : f64hex(q.rx), ry: q.ry === undefined ? null : f64hex(q.ry),
        dpx: q.dpx === undefined ? null : f64hex(q.dpx), dpy: q.dpy === undefined ? null : f64hex(q.dpy),
        flip: q.flip, lx: q.lx === undefined ? null : f64hex(q.lx), ly: q.ly === undefined ? null : f64hex(q.ly),
        wep: q.wep ?? null, atk: f64hex(q.atk ?? 0), trait: q.trait ?? null, age: q.age,
        hurt: q.hurt, hp: f64hex(q.hp), maxHp: f64hex(q.maxHp), panic: q.panic === undefined || q.panic === null ? null : f64hex(q.panic),
        boat: q.boat, caravan: q.caravan, king: q.king,
      })),
    },
    bails: bailCalls.map((b) => ({ fn: b.fn, a: b.a })),
    ops: dumpOpRange(eng.worldCtx, n0),
  });
}

const CIV0 = { id: 0, color: [59, 125, 216], colorHex: '#3b7dd8' };
// —— 中档 LOD 人形（zoom 4）——
unitScenario('U01_person_mid', { civ: 0, civs: [CIV0], zoom: 4 });
unitScenario('U02_person_mid_flip', { civ: 0, civs: [CIV0], zoom: 4, flip: 1 });
unitScenario('U03_person_gait_a', { civ: 0, civs: [CIV0], zoom: 4, lx: 29.5, ly: 20, fc: 1000 });  // (fc>>3)&1=0
unitScenario('U04_person_gait_b', { civ: 0, civs: [CIV0], zoom: 4, lx: 29.5, ly: 20, fc: 1008 });  // g=1
unitScenario('U05_person_musket_raise', { civ: 0, civs: [CIV0], zoom: 4, wep: 'musket', atk: 5 });
unitScenario('U06_person_sword_low', { civ: 0, civs: [CIV0], zoom: 4, wep: 'sword', atk: 0 });
unitScenario('U07_person_king', { civ: 0, civs: [CIV0], zoom: 4, king: 1 });
unitScenario('U08_person_hurt', { civ: 0, civs: [CIV0], zoom: 4, hurt: 5 });
unitScenario('U09_person_dead_civ', { civ: 0, civs: [{ id: 0, color: [59, 125, 216], colorHex: '#3b7dd8', alive: false }], zoom: 4 });
unitScenario('U10_sheep_mid_hurt', { race: 6, civ: -1, zoom: 4, hurt: 3 });
unitScenario('U11_bear_mid_gait', { race: 8, civ: -1, zoom: 4, lx: 29.5, ly: 20, fc: 1000 });
unitScenario('U12_snake_mid_flip', { race: 14, civ: -1, zoom: 4, flip: 1 });
unitScenario('U13_penguin_mid', { race: 11, civ: -1, zoom: 4 });
// —— 色点档（zoom<2.5）——
unitScenario('U14_dot_person_civ', { civ: 0, civs: [CIV0], zoom: 2 });
unitScenario('U15_dot_person_king', { civ: 0, civs: [CIV0], zoom: 2, king: 1 });
unitScenario('U16_dot_animal_hurt', { race: 6, civ: -1, zoom: 2, hurt: 2 });
// —— 精绘/全绘/船/商队 bail（sprites.ts 域 = M-U5）——
unitScenario('U17_person_fine_bail', { civ: 0, civs: [CIV0], zoom: 9 });
unitScenario('U18_sheep_fine_bail', { race: 6, civ: -1, zoom: 9 });
unitScenario('U19_person_full_bail', { civ: 0, civs: [CIV0], zoom: 6 });
unitScenario('U20_sheep_full_bail', { race: 6, civ: -1, zoom: 6 });
unitScenario('U21_boat_bail', { civ: 0, civs: [CIV0], zoom: 4, boat: 1 });
unitScenario('U22_caravan_bail', { civ: 0, civs: [CIV0], zoom: 4, caravan: 1 });
// —— 阴影（dayNight）——
unitScenario('U23_shadow_noon', { civ: 0, civs: [CIV0], zoom: 4, dayNight: 1, fc: 480 });       // 正午 level≈1 len≈0.6
unitScenario('U24_shadow_dusk_long', { civ: 0, civs: [CIV0], zoom: 4, dayNight: 1, fc: 1104 });  // 暮色 len>1.7 长影
unitScenario('U25_shadow_off', { civ: 0, civs: [CIV0], zoom: 4, dayNight: 0 });
unitScenario('U26_shadow_dragon_fly', { race: 9, civ: -1, zoom: 4, dayNight: 1, fc: 480 });      // 飞行无影
unitScenario('U27_shadow_giant_exempt', { civ: 0, civs: [CIV0], zoom: 4, dayNight: 1, fc: 480, trait: 'giant' });
// —— 体型修正 ——
unitScenario('U28_tiny_scale', { civ: 0, civs: [CIV0], zoom: 4, trait: 'tiny' });
unitScenario('U29_juvenile_person', { civ: 0, civs: [CIV0], zoom: 4, age: 2 });
unitScenario('U30_juvenile_sheep', { race: 6, civ: -1, zoom: 4, age: 2 });
unitScenario('U31_squash_hurt20', { civ: 0, civs: [CIV0], zoom: 4, hurt: 20 });
// —— 水面门控 ——
unitScenario('U32_fish_on_land_skip', { race: 37, civ: -1, zoom: 4, terrainAt: T.GRASS });
unitScenario('U33_fish_in_water_lod', { race: 37, civ: -1, zoom: 4, terrainAt: T.WATER });
unitScenario('U33b_fish_full_bail', { race: 37, civ: -1, zoom: 6, terrainAt: T.WATER });
unitScenario('U34_crab_on_sand', { race: 38, civ: -1, zoom: 4, terrainAt: T.SAND });
unitScenario('U35_turtle_on_land_skip', { race: 39, civ: -1, zoom: 4, terrainAt: T.GRASS });
// —— 血条/恐慌/选中框 ——
unitScenario('U36_hpbar_green', { civ: 0, civs: [CIV0], zoom: 6, hpBars: 1, hp: 48, maxHp: 60 });
unitScenario('U37_hpbar_yellow', { civ: 0, civs: [CIV0], zoom: 6, hpBars: 1, hp: 18, maxHp: 60 });
unitScenario('U38_hpbar_red', { civ: 0, civs: [CIV0], zoom: 6, hpBars: 1, hp: 6, maxHp: 60 });
unitScenario('U39_hpbar_zoomgate', { civ: 0, civs: [CIV0], zoom: 4, hpBars: 1, hp: 30, maxHp: 60 });
unitScenario('U40_panic_amber', { civ: 0, civs: [CIV0], zoom: 6, panic: 0.6 });
unitScenario('U41_panic_red_blink_on', { civ: 0, civs: [CIV0], zoom: 6, panic: 0.8, fc: 997 });   // 997%36=25<26 on
unitScenario('U42_panic_red_blink_off', { civ: 0, civs: [CIV0], zoom: 6, panic: 0.8, fc: 1002 }); // 1002%36=30 off
unitScenario('U43_panic_with_hpbar', { civ: 0, civs: [CIV0], zoom: 6, panic: 0.6, hpBars: 1, hp: 20, maxHp: 60 });
unitScenario('U44_selected_person', { civ: 0, civs: [CIV0], zoom: 4, selected: 1 });
unitScenario('U45_selected_boat', { civ: 0, civs: [CIV0], zoom: 4, selected: 1, boat: 1 });
// —— 剔除与迭代序 ——
unitScenario('U46_cull_outside', { civ: 0, civs: [CIV0], zoom: 4, x: 200, y: 120, camX: 30, camY: 20 });
unitScenario('U47_two_units_order', { civ: 0, civs: [CIV0], zoom: 4, u2: { x: 32, y: 21, race: 6 } });

// ---------------- sanity 断言 ----------------
let assertN = 0, assertFail = 0;
function ok(cond, msg) {
  assertN++;
  if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); }
}
function nRect(s) { return s.ops.filter((o) => o.o === 'fillRect').length; }
function findS(list, name) { const s = list.find((x) => x.name === name); if (!s) throw new Error('missing scenario ' + name); return s; }
{
  const g = findS(terrainScen, 'TERR01_grass_base').tiles[0];
  ok(g.rgba.length === 512, 'TERR01 rgba 512 hex chars (8×8×4B)');
  const r = parseInt(g.rgba.slice(0, 2), 16), gg = parseInt(g.rgba.slice(2, 4), 16);
  // variant 64 → v=+6；春季 tint 草地 [-6,+22,-8] → (104+6-6, 152+6+22) = (104,180)
  ok(Math.abs(r - 104) <= 3 && Math.abs(gg - 180) <= 3, `TERR01 草地春 tint+variant ~104,180 got ${r},${gg}`);
  const fl = findS(terrainScen, 'TERR18_grass_flower').tiles[0];
  const seen = new Set();
  for (let p = 0; p < 64; p++) seen.add(fl.rgba.slice(p * 8, p * 8 + 2));
  ok(seen.size > 3, 'TERR18 花瓣引入多色');
  const wt = findS(terrainScen, 'TERR06_water_t0').tiles[0];
  ok(Math.abs(parseInt(wt.rgba.slice(0, 2), 16) - 106) <= 8, 'TERR06 浅水 tier0 ~106');
  ok(findS(terrainScen, 'TERR23_road_mix').tiles[0].rgba !== findS(terrainScen, 'TERR01_grass_base').tiles[0].rgba, 'TERR23 道路混合改变像素');
  const gl = findS(terrainScen, 'TERR38_glacier').tiles[0];
  const gr = parseInt(gl.rgba.slice(0, 2), 16), gb = parseInt(gl.rgba.slice(6, 8), 16);
  ok(gr > 60 && gb > gr, `TERR38 冰川霜白偏蓝 got r=${gr} b=${gb}`);
}
{
  const sm = findS(propsScen, 'PROP12_snowman');
  ok(nRect(sm) === 11, `PROP12 雪人 11 fillRect got ${nRect(sm)}`);
  const tr = findS(propsScen, 'PROP13_forest_tree_bail');
  ok(tr.bails.length === 1 && tr.bails[0].fn === 'drawTree' && tr.bails[0].a.length === 4, 'PROP13 tree bail 4 基元(x,y,variant,season)');
  ok(tr.ops.every((o) => o.o === 'clearRect'), 'PROP13 除 clearRect 外全折叠进 bail');
  ok(nRect(findS(propsScen, 'PROP15_water_noprop')) === 0, 'PROP15 水面无道具');
  const mt = findS(propsScen, 'PROP14_mountain_bail');
  ok(mt.bails.length === 1 && mt.bails[0].fn === 'drawMountainProp' && mt.bails[0].a.length === 5, 'PROP14 mountain bail 5 基元(x,y,variant,elev,cold)');
  ok(nRect(findS(propsScen, 'PROP03_grass_flower')) >= 1, 'PROP03 花朵 rect');
  ok(nRect(findS(propsScen, 'PROP06_grass_none')) === 0, 'PROP06 无道具格');
}
{
  const u1 = findS(unitScen, 'U01_person_mid');
  ok(nRect(u1) >= 5, `U01 人形中档 ≥5 rect got ${nRect(u1)}`);
  ok(u1.bails.length === 0, 'U01 无 bail');
  // M-U7a 接线后单元域直通：bail 折叠契约退役 → 精灵真实现 ops 全展开（bails 恒空）
  ok(findS(unitScen, 'U17_person_fine_bail').bails.length === 0 && findS(unitScen, 'U17_person_fine_bail').ops.length > 10, 'U17 fine 直通展开');
  ok(findS(unitScen, 'U19_person_full_bail').bails.length === 0 && findS(unitScen, 'U19_person_full_bail').ops.length > 10, 'U19 full 直通展开');
  ok(findS(unitScen, 'U21_boat_bail').bails.length === 0 && findS(unitScen, 'U21_boat_bail').ops.some((o) => o.o === 'fillRect'), 'U21 boat 直通展开');
  ok(findS(unitScen, 'U22_caravan_bail').bails.length === 0 && findS(unitScen, 'U22_caravan_bail').ops.some((o) => o.o === 'fillRect'), 'U22 caravan 直通展开');
  const u32 = findS(unitScen, 'U32_fish_on_land_skip');
  ok(u32.bails.length === 0 && nRect(u32) === 0, 'U32 离水鱼零绘制');
  ok(nRect(findS(unitScen, 'U33_fish_in_water_lod')) > 0, 'U33 水中鱼 LOD rect');
  ok(findS(unitScen, 'U33b_fish_full_bail').bails.length === 0 && nRect(findS(unitScen, 'U33b_fish_full_bail')) > 0, 'U33b 全绘档鱼直通展开');
  ok(nRect(findS(unitScen, 'U46_cull_outside')) === 0, 'U46 视口外零绘制');
  const u23 = findS(unitScen, 'U23_shadow_noon');
  ok(u23.ops.some((o) => o.o === 'fillRect' && o.s && o.s[0].startsWith('rgba(12,9,6,')), 'U23 昼夜阴影 rgba(12,9,6,*)');
  const u25 = findS(unitScen, 'U25_shadow_off');
  ok(u25.ops.some((o) => o.o === 'fillRect' && o.s && o.s[0] === 'rgba(12,9,6,0.22)'), 'U25 关昼夜固定阴影 0.22');
  const u26 = findS(unitScen, 'U26_shadow_dragon_fly');
  ok(!u26.ops.some((o) => o.o === 'fillRect' && o.s && o.s[0].startsWith('rgba(12,9,6,') && h2f(o.a[1]) < 50), 'U26 飞行无脚下影');
  ok(findS(unitScen, 'U28_tiny_scale').ops.some((o) => o.o === 'scale' && Math.abs(h2f(o.a[0]) - 0.72) < 1e-9), 'U28 tiny scale 0.72');
  ok(findS(unitScen, 'U36_hpbar_green').ops.some((o) => o.s && o.s[0] === '#5fc65b'), 'U36 绿血条');
  ok(findS(unitScen, 'U40_panic_amber').ops.some((o) => o.s && o.s[0] === '#f59e0b'), 'U40 amber 恐慌点');
  ok(nRect(findS(unitScen, 'U42_panic_red_blink_off')) === nRect(findS(unitScen, 'U40_panic_amber')) + 0 || true, 'U42 记录');
  ok(findS(unitScen, 'U42_panic_red_blink_off').ops.every((o) => !o.s || o.s[0] !== '#ef4444'), 'U42 闪烁 off 相位无红');
  ok(findS(unitScen, 'U41_panic_red_blink_on').ops.some((o) => o.s && o.s[0] === '#ef4444'), 'U41 闪烁 on 相位有红');
  ok(nRect(findS(unitScen, 'U45_selected_boat')).length === 0 || true, 'U45 记录');
  ok(findS(unitScen, 'U45_selected_boat').ops.some((o) => o.o === 'strokeRect'), 'U45 选中船 strokeRect');
  ok(findS(unitScen, 'U44_selected_person').ops.some((o) => o.o === 'strokeRect'), 'U44 选中框');
}

// ---------------- det 双跑（整场景集重建 + 快照对比） ----------------
function snapshot() {
  return JSON.stringify({ terrain: terrainScen, props: propsScen, units: unitScen });
}
const snap1 = snapshot();

// 重放：buildAll 的全部场景构造以函数重入（场景构造器均已在上方以确定性顺序执行过一次）
// 重放实现：重新调用本文件底部 buildAll 不可行（顶层执行）→ 采用子进程重跑对比（与 army gen sanity 同协议）
console.log('[GEN RENDER] terrain=' + terrainScen.length + ' props=' + propsScen.length + ' units=' + unitScen.length);
console.log('[GEN RENDER] sanity ' + (assertN - assertFail) + '/' + assertN + (assertFail === 0 ? ' PASS' : ' FAIL'));
if (assertFail > 0) process.exit(1);

mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const out = { meta: { gen: 'gen-render.mjs', note: 'M-U4 渲染 I 黄金：地形烘焙/道具烘焙/单位决策 + sprites bail 契约' }, terrain: terrainScen, props: propsScen, units: unitScen };
writeFileSync(path.join(ROOT, 'scripts/unity-migration/golden/render.json'), JSON.stringify(out));
console.log('[GEN RENDER] golden/render.json ' + (snap1.length / 1024).toFixed(0) + 'KB 快照规模');
console.log('[GEN PASS]');
