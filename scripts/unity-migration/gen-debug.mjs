// gen-debug.mjs — U42 红点来源临时诊断（M-U4 gen 调试辅助，不入验证链）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.argv[2] = 'debug';
// 直接跑 gen 的模块逻辑不可行（顶层执行）——用最小复现：同 shim + 单场景
const BAIL = { depth: 0, fn: null };
let canvasSeq = 0;
class RecCtx {
  constructor(canvas) { this.canvas = canvas; this.id = canvas.__id; this.ops = []; this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.globalAlpha = 1; }
  _rec(o, a) { this.ops.push({ o, a, s: [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha], tag: BAIL.depth > 0 ? BAIL.fn : null }); }
  fillRect(x, y, w, h) { this._rec('fillRect', [x, y, w, h]); }
  clearRect(x, y, w, h) { this._rec('clearRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._rec('strokeRect', [x, y, w, h]); }
  save() { this._rec('save', []); } restore() { this._rec('restore', []); }
  translate(x, y) { this._rec('translate', [x, y]); } scale(x, y) { this._rec('scale', [x, y]); }
  rotate() {} setTransform() {} resetTransform() {}
  beginPath() {} moveTo() {} lineTo() {} arc() {} closePath() {} fill() {} stroke() {} clip() {} rect() {}
  fillText() {} strokeText() {} measureText() { return { width: 0 }; }
  drawImage() {} putImageData() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h, __id: 'i' }; }
  getImageData(x, y, w, h) { return this.createImageData(w, h); }
  createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; } setLineDash() {} getLineDash() { return []; }
}
function mkCanvas(w, h) { const c = { width: w ?? 0, height: h ?? 0, style: {}, __id: 'cv' + (++canvasSeq) }; c.getContext = () => (c.__ctx ??= new RecCtx(c)); return c; }
globalThis.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, appendChild() {} }), addEventListener() {}, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.requestAnimationFrame = () => 0;
const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const renderMod = await jiti.import(path.join(ROOT, 'src/lib/game/render.ts'));
const W = 256, H = 160;
const eng = new GameEngine(123);
eng.civs.length = 0; eng.units.length = 0; eng.unitById.clear();
eng.laws = { ...DEFAULT_LAWS, seasons: true };
eng.effects.length = 0; eng.buildings.length = 0; eng.armies.length = 0; eng.items.length = 0;
eng.blood.length = 0; eng.corpses.length = 0; eng.phoenixAshes.length = 0;
eng.fireSet.clear(); eng.occSet.clear(); eng.wet.clear(); eng.dirty.clear(); eng.propsDirty.clear();
eng.selectedId = 0; eng.shake = 0; eng.overlayMode = 'none'; eng.nature.ash = 0; eng.yearF = 0;
eng.terrain.fill(T.GRASS); eng.road.fill(0); eng.owner.fill(-1); eng.radiate.fill(0); eng.snowman.fill(0); eng.waterTier.fill(0);
eng.civs[0] = { id: 0, color: [59, 125, 216], colorHex: '#3b7dd8', alive: true };
const u = { id: 1, name: 'U', race: 0, civ: 0, x: 30, y: 20, rx: undefined, ry: undefined, dpx: undefined, dpy: undefined, flip: 0, lx: undefined, ly: undefined, wep: null, atk: 0, trait: null, age: 20, hurt: 0, hp: 60, maxHp: 60, panic: 0.8, boat: 0, caravan: 0, king: 0, dead: 0, job: 0 };
eng.units.push(u);
eng.cam = { x: 30, y: 20, zoom: 6 };
eng.frameCount = 1002;
eng.fxPrefs = { fxDensity: 1, ambience: false, riverFlow: false, dayNight: false, hpBars: false, battleFlash: false };
console.log('frameCount%36 =', 1002 % 36);
renderMod.render(eng, mkCanvas(1024, 640).getContext(), 1024, 640);
for (const op of eng.worldCtx.ops) {
  if (op.tag) continue;
  console.log(op.o, JSON.stringify(op.a?.slice(0, 4)), op.s[0], op.tag ?? '');
}
