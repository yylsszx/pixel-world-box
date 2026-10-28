// gen-overlay.mjs — M-U7d overlay 政治版图层黄金向量生成器：engine.redrawOverlay 五模式直录
// 真实现 = engine.ts redrawOverlay L2374-2496（political/alliance/density/biome/temperature/humidity 六入口）
// 蓝本锚：owner 染色+国界黑边（2px 边条）/联盟色+阵营界（groupId 闭包 =-(o+1)*1001 无盟分组）/
//         密度 4×4 分桶五档色带（bw=64/bh=40）/生物群落温度×湿度六色矩阵+地形覆盖（×2 pitch）/温度湿度五档（海面暗染）。
// 对账边界：overlay 层 op 流本体（fillRect/clearRect + style）——主管线 blit（alpha 0.62 drawImage）与
//         minimap 消费属宿主合成域（M-U4 syncStatic 先例：canvas 合成不进对账面）。
// dump 协议：稀疏阵列（owner 默认 -1/terrain 默认 GRASS/temp/moist 默认 128）+ civs/alliances/allianceOf/units
//         （u 坐标 f64hex 小端）+ ops（gen-render7 同款归一化）。
// 跑法：node scripts/unity-migration/gen-overlay.mjs（自带 sanity + det 子进程双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（必须在 import engine 之前挂好；gen-render7 同款精简） ----------------
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
const { T } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

const W = 256, H = 160;
const N = W * H;

function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function dumpOpRange(ctx, n0) {
  const out = [];
  for (let k = n0; k < ctx.ops.length; k++) {
    const op = ctx.ops[k];
    let s = null;
    if (op.o === 'fillRect') s = [op.s[0]];
    else if (op.o === 'strokeRect') s = [op.s[1], op.s[2]];
    out.push({ o: op.o, a: op.a.map((v) => (typeof v === 'number' ? f64hex(v) : v)), s });
  }
  return out;
}

// ---------------- 场景装配 ----------------
const scens = [];
let ENG = null;
function getEng() {
  if (!ENG) ENG = new GameEngine(123);
  return ENG;
}
// RLE 稀疏 dump（[start, value, runLen]…—— 全图海洋化类场景 38k 条目压至单 run）
function rle(arr, dflt) {
  const out = [];
  let i = 0;
  while (i < arr.length) {
    if (arr[i] === dflt) { i++; continue; }
    const start = i;
    const v = arr[i];
    while (i < arr.length && arr[i] === v) i++;
    out.push([start, v, i - start]);
  }
  return out;
}
function ovScene(name, mode, setup) {
  const eng = getEng();
  // 跨场景复位（确定性基线）
  eng.owner.fill(-1);
  eng.terrain.fill(T.GRASS);
  eng.moistMap.fill(128);
  eng.worldsim.tempOverlay.fill(128);
  eng.units.length = 0;
  eng.civs.length = 0;
  eng.alliances.length = 0;
  eng.allianceOf.clear();
  eng.overlayMode = mode;
  eng.overlayDirty = true;
  setup(eng);
  const n0 = eng.overlayCtx.ops.length;
  eng.redrawOverlay();
  scens.push({
    name, mode,
    civs: eng.civs.length ? eng.civs.filter((c) => c).map((c) => ({ id: c.id, color: c.color, colorHex: c.colorHex, alive: c.alive })) : null,
    alliances: eng.alliances.length ? eng.alliances.map((a) => ({ id: a.id, colorHex: a.colorHex })) : null,
    allianceOf: eng.allianceOf.size ? [...eng.allianceOf.entries()] : null,
    units: eng.units.length ? eng.units.map((u) => ({ x: f64hex(u.x), y: f64hex(u.y), dead: u.dead ? 1 : 0 })) : null,
    ownerRle: rle(eng.owner, -1),
    terrainRle: rle(eng.terrain, T.GRASS),
    tempRle: rle(eng.worldsim.tempOverlay, 128),
    moistRle: rle(eng.moistMap, 128),
    ops: dumpOpRange(eng.overlayCtx, n0),
  });
}
function mkCiv(id, hex, alive = true) {
  return { id, color: [59, 125, 216], colorHex: hex, alive };
}

// ============================================================
// O 组：political（owner 染色 + 国界黑边）
// ============================================================
ovScene('O01_political_blocks', 'political', (eng) => {
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.civs[1] = mkCiv(1, '#d65d3b');
  eng.civs[2] = mkCiv(2, '#3bd67d', false);   // 死国：领土跳过
  for (let y = 0; y < 60; y++) for (let x = 0; x < 64; x++) {   // 窗口化（外部无主不染色）
    eng.owner[y * W + x] = x < 20 ? 0 : x < 40 ? 1 : x < 50 ? 2 : -1;
  }
});
ovScene('O02_political_rows', 'political', (eng) => {
  eng.civs[0] = mkCiv(0, '#8a5ad8');
  eng.civs[3] = mkCiv(3, '#d8b43b');
  for (let y = 0; y < 40; y++) for (let x = 0; x < 64; x++) {   // 窗口化：横向界+无主带
    eng.owner[y * W + x] = y < 10 ? 0 : y < 12 ? -1 : y < 30 ? 3 : 0;
  }
});
ovScene('O09_political_single', 'political', (eng) => {
  eng.civs[0] = mkCiv(0, '#3bd6a8');
  eng.owner[80 * W + 128] = 0;   // 孤立格：四向全边
});

// ============================================================
// A 组：alliance（联盟色 + 阵营界）
// ============================================================
ovScene('O03_alliance_basic', 'alliance', (eng) => {
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.civs[1] = mkCiv(1, '#d65d3b');
  eng.civs[2] = mkCiv(2, '#3bd67d');          // 无盟国 → #52525b
  eng.alliances.push({ id: 1, colorHex: '#e8b23c' }, { id: 2, colorHex: '#7d4bd6' });
  eng.allianceOf.set(0, 1);
  eng.allianceOf.set(1, 2);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 50; x++) {   // 窗口化
    eng.owner[y * W + x] = x < 20 ? 0 : x < 35 ? 1 : x < 45 ? 2 : -1;
  }
});
ovScene('O04_alliance_dead', 'alliance', (eng) => {
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.civs[1] = mkCiv(1, '#d65d3b', false);   // 死盟国：领土跳过 + 邻接组界语义（gn 死国→同组）
  eng.civs[2] = mkCiv(2, '#3bd67d');
  eng.alliances.push({ id: 1, colorHex: '#e8b23c' });
  eng.allianceOf.set(0, 1);
  eng.allianceOf.set(2, 1);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) {   // 窗口化
    eng.owner[y * W + x] = x < 20 ? 0 : x < 40 ? 1 : x < 55 ? 2 : -1;
  }
});
ovScene('O10_alliance_edge_case', 'alliance', (eng) => {
  eng.civs[0] = mkCiv(0, '#3b7dd8');
  eng.civs[1] = mkCiv(1, '#d65d3b');
  eng.alliances.push({ id: 1, colorHex: '#e8b23c' });
  eng.allianceOf.set(1, 1);                    // 仅 civ1 有盟；civ0 无盟（独立组）与盟国相邻 → 界
  eng.owner[80 * W + 10] = 0;
  eng.owner[80 * W + 11] = 1;
  eng.owner[80 * W + 12] = 0;
});

// ============================================================
// D 组：density（4×4 分桶五档）
// ============================================================
ovScene('O05_density_bands', 'density', (eng) => {
  // 桶 (10,10)=1 档0 / (20,10)=3 档1 / (30,10)=8 档2 / (40,20)=15 档4 / (50,10) 死单位跳过 + (5,5) 2 个档1
  let k = 0;
  const put = (bx, by, n, dead = false) => {
    for (let j = 0; j < n; j++) {
      eng.units.push({ id: ++k, x: bx * 4 + j * 0.13, y: by * 4 + 0.5, dead: dead ? 1 : 0, race: 7, civ: -1 });
    }
  };
  put(10, 10, 1);
  put(5, 5, 2);
  put(20, 10, 3);
  put(30, 10, 6);
  put(35, 10, 12);
  put(40, 20, 15);
  put(50, 10, 3, true);
});

// ============================================================
// B 组：biome（六群落 + 地形覆盖，×2 pitch）
// ============================================================
ovScene('O06_biome_matrix', 'biome', (eng) => {
  // 地形列带：DEEP/WATER/MOUNTAIN/LAVA/BURNT/陆地交替（x 带）
  const bands = [[0, 30, T.DEEP], [30, 60, T.WATER], [60, 90, T.MOUNTAIN], [90, 120, T.LAVA], [120, 150, T.BURNT]];
  for (const [x0, x1, t] of bands) {
    for (let y = 0; y < H; y++) for (let x = x0; x < x1; x++) eng.terrain[y * W + x] = t;
  }
  // 陆地区（x≥150）温湿矩阵：temp 列带 89/90/164/165 × moist 行带 127/128
  for (let y = 0; y < H; y++) for (let x = 150; x < W; x++) {
    const i = y * W + x;
    eng.worldsim.tempOverlay[i] = x < 170 ? 89 : x < 190 ? 90 : x < 210 ? 164 : 165;
    eng.moistMap[i] = y < 80 ? 127 : 128;
  }
});

// ============================================================
// T 组：temperature / humidity（五档 + 海面暗染）
// ============================================================
ovScene('O07_temperature_bands', 'temperature', (eng) => {
  eng.terrain.fill(T.DEEP);   // 全图海洋化：窗口外不染（只剩海面暗染 1 op）
  for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) {   // 陆地窗口：全档列带
    const i = y * W + x;
    eng.terrain[i] = T.GRASS;
    eng.worldsim.tempOverlay[i] = [0, 51, 52, 103, 104, 155, 156, 207, 208, 255][x % 10];
  }
});
ovScene('O08_humidity_bands', 'humidity', (eng) => {
  eng.terrain.fill(T.WATER);   // 同款窗口化
  for (let y = 0; y < 40; y++) for (let x = 0; x < 60; x++) {
    const i = y * W + x;
    eng.terrain[i] = T.GRASS;
    eng.moistMap[i] = [255, 208, 207, 156, 155, 104, 103, 52, 51, 0][x % 10];
  }
});

// ============================================================
// sanity 断言
// ============================================================
let assertN = 0, assertFail = 0;
function ok(cond, msg) { assertN++; if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); } }
function findS(n) { return scens.find((s) => s.name === n); }
function styles(s) { return new Set(s.ops.filter((o) => o.o === 'fillRect').map((o) => o.s[0])); }

{
  ok(styles(findS('O01_political_blocks')).has('#09090b') && styles(findS('O01_political_blocks')).has('#3b7dd8'), 'O01 国界黑边+国色');
  ok(!findS('O01_political_blocks').ops.some((o) => o.o === 'fillRect' && o.s[0] === '#3bd67d'), 'O01 死国领土跳过');
  ok(styles(findS('O09_political_single')).size === 2, 'O09 孤立格=国色+黑边两色');
  const a3 = styles(findS('O03_alliance_basic'));
  ok(a3.has('#e8b23c') && a3.has('#7d4bd6') && a3.has('#52525b') && a3.has('#09090b'), 'O03 联盟色×2+无盟灰+黑界');
  ok(!findS('O03_alliance_basic').ops.some((o) => o.o === 'fillRect' && o.s[0] === '#3bd67d'), 'O03 无盟国本色不出现（灰染）');
  const d5 = styles(findS('O05_density_bands'));
  ok(['#1d4e89', '#2e86ab', '#7fb069', '#f2c14e', '#d64530'].every((c) => d5.has(c)), 'O05 五档色带全出现');
  const b6 = styles(findS('O06_biome_matrix'));
  ok(['#16324f', '#2d6a8f', '#8a8f98', '#7a1f14', '#4a3b2f', '#dce8f2', '#9db8c9', '#e3c17a', '#3f9d4f', '#2f7d4a', '#a8c56a'].every((c) => b6.has(c)), 'O06 五地形+六群落全出现');
  ok(findS('O07_temperature_bands').ops.some((o) => o.o === 'fillRect' && o.s[0] === 'rgba(20,40,70,0.35)'), 'O07 海面暗染 temp');
  ok(findS('O08_humidity_bands').ops.some((o) => o.o === 'fillRect' && o.s[0] === 'rgba(60,50,30,0.35)'), 'O08 海面暗染 humidity');
  ok(findS('O10_alliance_edge_case').ops.length > 0, 'O10 组界场景非空');
  ok(scens.length === 10, '场景数 10');
}
console.log('[GEN OVERLAY] scen=' + scens.length);
console.log('[GEN OVERLAY] sanity ' + (assertN - assertFail) + '/' + assertN + (assertFail === 0 ? ' PASS' : ' FAIL'));
if (assertFail > 0 && !process.env.WB_GENO_KEEPFAIL) process.exit(1);

// ---------------- det 双跑 ----------------
const snap1 = JSON.stringify(scens);
const CHILD = process.argv.includes('--detchild');
if (CHILD) {
  mkdirSync('/tmp', { recursive: true });
  writeFileSync('/tmp/wb-det-childo.json', snap1);
  process.exit(0);
}
mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/overlay.json');
writeFileSync(outPath, JSON.stringify({ meta: { gen: 'gen-overlay.mjs', note: 'M-U7d overlay 政治版图层黄金：redrawOverlay 五模式直录（political/alliance/density/biome/temperature/humidity）' }, scens: scens }));
const { createHash } = await import('node:crypto');
const { execFileSync } = await import('node:child_process');
const selfPath = fileURLToPath(import.meta.url);
execFileSync(process.execPath, [selfPath, '--detchild'], { stdio: ['ignore', 'ignore', 'inherit'] });
const childSnap = readFileSync('/tmp/wb-det-childo.json', 'utf8');
if (childSnap !== snap1) { console.error('[GEN OVERLAY] det 双跑不一致'); process.exit(1); }
console.log('[GEN OVERLAY] det 双跑字节级一致 md5=' + createHash('md5').update(snap1).digest('hex'));
console.log('[GEN OVERLAY] golden/overlay.json ' + (snap1.length / 1024).toFixed(1) + 'KB 快照规模');
console.log('[GEN PASS]');
