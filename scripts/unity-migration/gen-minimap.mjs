// gen-minimap.mjs — M-U7e minimap 黄金向量生成器：render.ts renderMinimap 真实现直录
// 蓝本锚：render.ts L3535-3579（DEEP_BG 底 + terrain blit + overlay 0.62 blit + 单位点
//         （civ 色/boat 2x2）/建筑金点/火焰橙点/战线红点 + 视口 strokeRect）
// 对账边界：minimap 层 op 流本体（fillRect/strokeRect + style + drawImage 符号化 blit）——
//         drawImage(terrainCanvas/overlayCanvas) 以符号 op {o:'drawImage', src:'terrain'|'overlay'} 记录
//         （canvas 间合成不进像素对账面——M-U4/M-U7d 先例；blit 事实与 alpha 参数可对账）。
//         overlayDirty→redrawOverlay 触发语义以 meta.redrawCalled 布尔对账（monkey patch 计数）。
// dump 协议：units（race/civ/boat/dead + x/y f64hex 小端——gen-render5/7/overlay 家族 LE）/civs/buildings/
//         fireSet/battles（插入序）/cam f64hex/overlayMode/overlayDirty/rdefs（动态种 isCiv）/ops。
// 跑法：node scripts/unity-migration/gen-minimap.mjs（自带 sanity + det 子进程双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（必须在 import engine 之前挂好；gen-overlay 同款精简） ----------------
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
    this.ops.push({ o, a: args, c: this.id, s: [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha], tag: null });
  }
  fillRect(...a) { this._rec('fillRect', a); }
  strokeRect(...a) { this._rec('strokeRect', a); }
  clearRect(...a) { this._rec('clearRect', a); }
  save() { this._rec('save', []); }
  restore() { this._rec('restore', []); }
  translate(...a) { this._rec('translate', a); }
  scale(...a) { this._rec('scale', a); }
  setTransform(...a) { this._rec('setTransform', a); }
  putImageData(...a) { this._rec('putImageData', []); }
  drawImage(...a) { this._rec('drawImage', a); }
  beginPath() {}
  arc() {}
  fill() {}
  stroke() {}
  moveTo() {}
  lineTo() {}
  setLineDash() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; }
  measureText() { return { width: 0 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
}
function mkCanvas(w, h) {
  const c = { width: w, height: h, __id: ++canvasSeq };
  c.getContext = () => { if (!c.__ctx) c.__ctx = new RecCtx(c); return c.__ctx; };
  return c;
}
globalThis.document = {
  createElement: () => mkCanvas(0, 0),
  createElementNS: () => mkCanvas(0, 0),
  addEventListener: () => {},
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.requestAnimationFrame = () => {};

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const renderMod = await jiti.import(path.join(ROOT, 'src/lib/game/render.ts'));
const { renderMinimap } = renderMod;

const W = 256, H = 160;

function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}

// drawImage 符号化：canvas 对象 → 'terrain'/'overlay'（引用相等）；s = [src, alpha 原值数值]（AssertOpsEqual 协议：数值元素存原值）
function dumpMinimapOps(ctx, n0, terrainCanvas, overlayCanvas) {
  const out = [];
  for (let k = n0; k < ctx.ops.length; k++) {
    const op = ctx.ops[k];
    if (op.o === 'drawImage') {
      const src = op.a[0] === terrainCanvas ? 'terrain' : op.a[0] === overlayCanvas ? 'overlay' : 'unknown';
      out.push({ o: 'drawImage', src, a: op.a.slice(1).map((v) => (typeof v === 'number' ? f64hex(v) : v)), s: [src, op.s[3]] });
    } else if (op.o === 'fillRect') {
      out.push({ o: 'fillRect', a: op.a.map((v) => f64hex(v)), s: [op.s[0]] });
    } else if (op.o === 'strokeRect') {
      out.push({ o: 'strokeRect', a: op.a.map((v) => f64hex(v)), s: [op.s[1], op.s[2]] });
    } else {
      throw new Error(`unexpected op ${op.o} in minimap ctx`);
    }
  }
  return out;
}

// ---------------- 场景装配 ----------------
const scens = [];
let ENG = null;
function getEng() {
  if (!ENG) ENG = new GameEngine(4213);
  return ENG;
}

function mkCiv(id, hex, alive = true) {
  return { id, color: [59, 125, 216], colorHex: hex, alive };
}
function mkU(race, x, y, opt = {}) {
  return { id: opt.id ?? 1, race, civ: opt.civ ?? -1, x, y, boat: opt.boat ? 1 : 0, dead: opt.dead ? 1 : 0 };
}

let DYN_ID = 9100;
function mmScene(name, mw, mh, view, setup) {
  const eng = getEng();
  // 跨场景复位（确定性基线）
  eng.units.length = 0;
  eng.civs.length = 0;
  eng.buildings.length = 0;
  eng.fireSet.clear();
  eng.activeBattles.clear();
  eng.overlayMode = 'none';
  eng.overlayDirty = false;
  eng.cam = { x: W / 2, y: H / 2, zoom: 4.5 };
  DYN_ID += 10;
  // redrawOverlay 触发探测（实例覆盖 prototype 方法——renderMinimap 内 engine.redrawOverlay() 命中）
  let redrawCalled = false;
  const origRedraw = eng.redrawOverlay.bind(eng);
  eng.redrawOverlay = function () { redrawCalled = true; return origRedraw(); };
  const mini = mkCanvas(mw, mh);
  const miniCtx = mini.getContext('2d');
  const n0 = miniCtx.ops.length;
  setup(eng);
  // 输入面快照（renderMinimap 调用前）——dirty=true 时蓝本 redrawOverlay 会复位 overlayDirty=false，
  // 调用后读会丢失触发语义（Task 122 dump 协议缺陷同款：输入标注必须镜像执行前状态）
  const dirtyIn = eng.overlayDirty ? 1 : 0;
  renderMinimap(eng, miniCtx, mw, mh, view);
  // 复原 prototype 方法（避免下一场景累计覆盖——每场景重挂前旧覆盖被新覆盖顶替，仍单层）
  scens.push({
    name, mw, mh,
    view: { w: f64hex(view.w), h: f64hex(view.h) },
    cam: { x: f64hex(eng.cam.x), y: f64hex(eng.cam.y), zoom: f64hex(eng.cam.zoom) },
    overlayMode: eng.overlayMode,
    overlayDirty: dirtyIn,
    redrawCalled: redrawCalled ? 1 : 0,
    civs: eng.civs.length ? eng.civs.map((c) => (c ? { colorHex: c.colorHex, alive: c.alive } : null)) : null,
    units: eng.units.length ? eng.units.map((u) => ({ race: u.race, civ: u.civ, x: f64hex(u.x), y: f64hex(u.y), boat: u.boat ? 1 : 0, dead: u.dead ? 1 : 0 })) : null,
    buildings: eng.buildings.length ? eng.buildings.map((b) => ({ x: f64hex(b.x), y: f64hex(b.y) })) : null,
    fireSet: eng.fireSet.size ? [...eng.fireSet] : null,
    battles: eng.activeBattles.size ? [...eng.activeBattles.keys()] : null,
    rdefs: RDEF_DUMP.size ? [...RDEF_DUMP.entries()].map(([k, v]) => ({ id: k, isCiv: v.isCiv ? 1 : 0 })) : null,
    ops: dumpMinimapOps(miniCtx, n0, eng.terrainCanvas, eng.overlayCanvas),
  });
  RDEF_DUMP.clear();
}

// 动态种注册 dump（gen 手工注册——镜像 RACES spread 继承语义）
const RDEF_DUMP = new Map();
function regDyn(isCiv) {
  const id = ++DYN_ID;
  RACES_DUMP_REG(id, isCiv);
  return id;
}
let RACES_DUMP_REG = null; // 场景内赋值：真 RACES 注册

const { RACES } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
RACES_DUMP_REG = (id, isCiv) => {
  RACES[id] = { key: `dyn${id}`, name: `dyn${id}`, sprite: 'wolf', maxAge: 40, hp: 20, dmg: 5, speed: 1, repro: 0.004, isCiv };
  RDEF_DUMP.set(id, { isCiv });   // 镜像/NUnit 重建 isCiv 语义（蓝本 RACES spread 继承 → RdefHost 注入契约）
};

// ============================================================
// M 组场景
// ============================================================
// M01 基础：civ 色 / boat 2x2 / wild default
mmScene('M01_basic', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.units.push(mkU(0, 40, 30, { civ: 0 }), mkU(1, 100, 60, { civ: 0, boat: true }), mkU(6, 200, 120));
});

// M02 zombie/dragon/default 三色
mmScene('M02_zombie_dragon', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.units.push(mkU(R.ZOMBIE, 30, 20), mkU(R.DRAGON, 128, 80), mkU(8, 200, 140));
});

// M03 civ 边界：isCiv 但 civ=-1 / civ 越界 / 死国 / 正常
mmScene('M03_civ_edge', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.civs[1] = mkCiv(1, '#d65d3b', false);
  eng.units.push(
    mkU(0, 20, 20, { civ: -1 }),      // isCiv 但无国 → default
    mkU(1, 60, 40, { civ: 5 }),       // civ 越界 → default
    mkU(2, 100, 60, { civ: 1 }),      // 死国 → default
    mkU(3, 140, 80, { civ: 0 }),      // 正常 → civ 色
    mkU(6, 180, 100, { civ: 0 }),     // 非 civ 族即使 civ=0 → default（isCiv 短路）
  );
});

// M04 战略层：建筑金点 + 火焰橙点 + 战线红点
mmScene('M04_strategic', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.units.push(mkU(0, 50, 50, { civ: 0 }));
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.buildings.push({ x: 30.5, y: 40.25 }, { x: 200, y: 120 });
  eng.fireSet.add(300); eng.fireSet.add(257); eng.fireSet.add(40959);
  eng.activeBattles.set(1000, 3); eng.activeBattles.set(777, 1);
});

// M05 overlay political + dirty → redraw 真触发
mmScene('M05_overlay_political_dirty', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.overlayMode = 'political';
  eng.overlayDirty = true;
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.units.push(mkU(0, 50, 50, { civ: 0 }));
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) eng.owner[y * W + x] = 0;
});

// M06 overlay none：无 blit
mmScene('M06_overlay_none', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.units.push(mkU(6, 60, 60));
});

// M07 overlay temperature + dirty=false：blit 照常、redraw 不触发
mmScene('M07_overlay_temp_clean', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.overlayMode = 'temperature';
  eng.overlayDirty = false;
  eng.units.push(mkU(6, 60, 60));
});

// M08 dead 单位照画（蓝本无滤）
mmScene('M08_dead_unit', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.units.push(mkU(6, 60, 60, { dead: true }), mkU(7, 100, 100, { dead: true, boat: true }));
});

// M09 mw/mh 变形：200×125 缩放
mmScene('M09_size_alt', 200, 125, { w: 800, h: 500 }, (eng) => {
  eng.units.push(mkU(0, 40, 30, { civ: 0, boat: true }), mkU(6, 200, 120));
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.buildings.push({ x: 100, y: 80 });
  eng.fireSet.add(5000);
  eng.activeBattles.set(20000, 1);
});

// M10 zoom 两档：zoom=1 视口巨大（zw 出界）/ zoom=16 视口微小
mmScene('M10_zoom_lo', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.cam = { x: 128, y: 80, zoom: 1 };
  eng.units.push(mkU(6, 60, 60));
});
mmScene('M10_zoom_hi', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.cam = { x: 128.5, y: 80.25, zoom: 16 };
  eng.units.push(mkU(6, 60, 60));
});

// M11 动态种：isCiv=false 继承（野生动物父种）→ default 色
mmScene('M11_dyn_wild', 128, 80, { w: 800, h: 500 }, (eng) => {
  const id = regDyn(false);
  eng.units.push(mkU(id, 80, 60), mkU(6, 120, 90));
});

// M12 动态种 isCiv=true 继承（civ 族父种）→ civ 色路径（RdefHost isCiv 注入语义）
mmScene('M12_dyn_civ', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  const id = regDyn(true);
  eng.units.push(mkU(id, 80, 60, { civ: 0 }), mkU(id, 120, 90, { civ: -1 }));
});

// M13 fire/battles 大小坐标边界：fi=0（原点）/ fi=40959（右下角）/ battles 分数坐标
mmScene('M13_fire_edges', 128, 80, { w: 800, h: 500 }, (eng) => {
  eng.fireSet.add(0); eng.fireSet.add(1); eng.fireSet.add(255); eng.fireSet.add(256);
  eng.activeBattles.set(40959, 2); eng.activeBattles.set(0, 1);
});

// M14 空：最小流（DEEP_BG fill + terrain blit + viewport）
mmScene('M14_empty', 128, 80, { w: 640, h: 400 }, (eng) => {});

// ============================================================
// sanity 断言 + dump
// ============================================================
let fails = 0;
const A = (cond, msg) => { if (!cond) { console.error(`  [SANITY FAIL] ${msg}`); fails++; } };

for (const s of scens) {
  const ops = s.ops;
  A(ops.length > 0, `${s.name}: ops empty`);
  // 首两 op 恒为 DEEP_BG fill + terrain blit
  A(ops[0].o === 'fillRect' && ops[0].s[0] === '#0d1b2e', `${s.name}: first op DEEP_BG`);
  A(ops[1].o === 'drawImage' && ops[1].src === 'terrain', `${s.name}: second op terrain blit`);
  // 尾 op 恒为 viewport strokeRect（s = [strokeStyle, lineWidth 原值数值]）
  const last = ops[ops.length - 1];
  A(last.o === 'strokeRect' && last.s[0] === 'rgba(255,255,255,0.8)' && last.s[1] === 1, `${s.name}: last op viewport stroke`);
  // blit 符号面
  const blits = ops.filter((o) => o.o === 'drawImage');
  if (s.overlayMode === 'none') A(blits.length === 1, `${s.name}: overlay none → 1 blit`);
  else A(blits.length === 2 && blits[1].src === 'overlay', `${s.name}: overlay on → terrain+overlay blit`);
  // redraw 语义
  if (s.name === 'M05_overlay_political_dirty') A(s.redrawCalled === 1, `${s.name}: redrawCalled true`);
  if (s.name === 'M07_overlay_temp_clean') A(s.redrawCalled === 0, `${s.name}: redrawCalled false`);
  // 色点抽检
  if (s.name === 'M02_zombie_dragon') {
    const fills = ops.filter((o) => o.o === 'fillRect').map((o) => o.s[0]);
    A(fills.includes('#64c95d'), 'M02: zombie green');
    A(fills.includes('#cf3f2e'), 'M02: dragon red');
    A(fills.includes('#f2ead8'), 'M02: default cream');
  }
  if (s.name === 'M04_strategic') {
    const fills = ops.filter((o) => o.o === 'fillRect').map((o) => o.s[0]);
    A(fills.includes('#ffd93d'), 'M04: building gold');
    A(fills.includes('#ff9b2d'), 'M04: fire orange');
    A(fills.includes('#ff4030'), 'M04: battle red');
  }
  if (s.name === 'M09_size_alt') {
    const boat = ops.find((o) => o.o === 'fillRect' && o.s[0] === '#3b7dd8');
    A(boat && Number(f64ToF64(boat.a[0])) === (40 / 256) * 200 - 1, `M09: boat x scaled (${boat && boat.a[0]})`);
  }
}
function f64ToF64(hex) {
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, true);
}

const outObj = {
  meta: { gen: 'gen-minimap.mjs', note: 'M-U7e minimap 黄金：renderMinimap 直录（blit 符号化 + redrawCalled meta）' },
  scens,
};
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/minimap.json');
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(outObj));
console.log(`gen-minimap: ${scens.length} scenes, ${scens.reduce((n, s) => n + s.ops.length, 0)} ops, ${(JSON.stringify(outObj).length / 1024).toFixed(1)}KB → ${path.relative(ROOT, outPath)}`);

if (fails > 0) {
  console.error(`[GEN FAIL] ${fails} sanity failures`);
  process.exit(1);
}
console.log('[SANITY PASS]');

// ---------------- det 子进程双跑 ----------------
if (process.env.DET_CHILD !== '1' && process.argv[2] !== '--det') {
  const { spawnSync } = await import('node:child_process');
  const r1 = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--det'], { env: { ...process.env, DET_CHILD: '1' }, encoding: 'buffer' });
  if (r1.status !== 0) { console.error('[DET FAIL] child nonzero'); console.error(r1.stderr?.toString()); process.exit(1); }
  const { createHash } = await import('node:crypto');
  const mine = createHash('md5').update(JSON.stringify(outObj)).digest('hex');
  const childOut = r1.stdout.toString();
  const m = childOut.match(/DET_MD5:(\w+)/);
  if (!m) { console.error('[DET FAIL] no child md5:', childOut.slice(-400)); process.exit(1); }
  if (m[1] !== mine) { console.error(`[DET FAIL] md5 drift ${mine} vs ${m[1]}`); process.exit(1); }
  console.log(`[DET PASS] md5 ${mine}`);
} else {
  const { createHash } = await import('node:crypto');
  console.log('DET_MD5:' + createHash('md5').update(JSON.stringify(outObj)).digest('hex'));
}
console.log('[GEN PASS]');
