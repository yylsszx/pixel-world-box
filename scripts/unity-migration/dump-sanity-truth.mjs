// dump-sanity-truth.mjs — 按 gen-render2 场景构造重放，dump 关键场景的 op 样式序列（sanity 真值核对用）
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let canvasSeq = 0;
class RecCtx {
  constructor(canvas) { this.canvas = canvas; this.id = canvas.__id; this.ops = []; this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.lineWidth = 1; this.globalAlpha = 1; }
  _rec(o, args) { this.ops.push({ o, a: args, s: [this.fillStyle, this.strokeStyle, this.lineWidth] }); }
  fillRect(x, y, w, h) { this._rec('fillRect', [x, y, w, h]); }
  strokeRect(x, y, w, h) { this._rec('strokeRect', [x, y, w, h]); }
  clearRect(x, y, w, h) { this._rec('clearRect', [x, y, w, h]); }
  save() {} restore() {} translate() {} scale() {} rotate() {} setTransform() {} resetTransform() {}
  beginPath() {} moveTo() {} lineTo() {} arc() {} closePath() {} fill() {} stroke() {} clip() {} rect() {}
  fillText() {} strokeText() {} measureText() { return { width: 0 }; }
  drawImage() {} putImageData() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(4), width: w, height: h }; }
  getImageData(x, y, w, h) { return this.createImageData(w, h); }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  createPattern() { return {}; }
  setLineDash() {} getLineDash() { return []; }
  quadraticCurveTo() {} bezierCurveTo() {} arcTo() {} ellipse() {} isPointInPath() { return false; }
}
function mkCanvas(w, h) {
  const c = { width: w, height: h, style: {}, __id: 'cv' + (++canvasSeq) };
  c.getContext = () => { if (!c.__ctx) c.__ctx = new RecCtx(c); return c.__ctx; };
  return c;
}
globalThis.document = { createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {} }), addEventListener() {}, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.requestAnimationFrame = () => 0;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const SP = await jiti.import(path.join(ROOT, 'src/lib/game/sprites.ts'));
const { RACES } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
RACES[100] = { ...RACES[0], key: 'dyn100', vis: { root: 0, hue: 15, lum: 1.1, size: 1, bulk: 0.7, horns: 2, spikes: 0, ears: 2, crest: 1, glow: 1, pattern: 1, tail: 0, mane: 0 } };
RACES[101] = { ...RACES[3], key: 'dyn101', vis: { root: 9, hue: -10, lum: 0.9, size: 1, bulk: 0.3, horns: 1, spikes: 0, ears: 1, crest: 0, glow: 0, pattern: 2, tail: 0, mane: 0 } };

const CIV0 = [59, 125, 216];
function mkU(o) {
  return { id: 1, name: 'U', race: o.race ?? 0, civ: o.civ ?? -1, x: o.x ?? 40, y: o.y ?? 30, rx: o.rx, ry: o.ry, dpx: o.dpx, dpy: o.dpy,
    flip: o.flip ? 1 : 0, lx: o.lx, ly: o.ly, wep: o.wep ?? null, arm: o.arm ?? null, hlm: o.hlm ?? null,
    atk: o.atk ?? 0, trait: o.trait ?? null, age: o.age ?? 20, maxAge: o.maxAge ?? 100, hurt: o.hurt ?? 0,
    hp: o.hp ?? 60, maxHp: o.maxHp ?? 60, panic: o.panic, boat: o.boat ? 1 : 0, caravan: o.caravan ?? 0, king: o.king ? 1 : 0,
    job: o.job ?? 0, infected: !!o.infected, dead: 0 };
}
function show(name, fn) {
  const ctx = mkCanvas(256, 256).getContext();
  fn(ctx);
  const rects = ctx.ops.map((o, i) => `${i}: ${o.o} [${o.s[0] ?? '-'}${o.o === 'strokeRect' ? ',' + o.s[2] : ''}] (${o.a.join(',')})`);
  console.log(`--- ${name}  rectN=${ctx.ops.filter((o) => o.o === 'fillRect').length} total=${ctx.ops.length}`);
  for (const r of rects) console.log('   ' + r);
}
const TX = 20, TY = 15;
show('TR03_autumn_gold_dark', (c) => SP.drawTree(c, TX, TY, 6, 2));
show('TR06_spring_sakura', (c) => SP.drawTree(c, TX, TY, 9, 0));
show('TR09_summer_dark_hi', (c) => SP.drawTree(c, TX, TY, 15, 1));
show('MT01_base_nosnow', (c) => SP.drawMountainProp(c, TX, TY, 40));
show('MT04_snow_elev', (c) => SP.drawMountainProp(c, TX, TY, 40, 180, 0.2));
show('P01_human_civ', (c) => SP.drawPerson(c, mkU({ civ: 0 }), CIV0, 1000));
show('P13_dwarf', (c) => SP.drawPerson(c, mkU({ civ: 0, race: 2 }), CIV0, 1000));
show('P16_lizard_tailup', (c) => SP.drawPerson(c, mkU({ civ: 0, race: 19 }), CIV0, 1016));
show('P33_vis_full', (c) => SP.drawPerson(c, mkU({ civ: 0, race: 100 }), CIV0, 1000));
show('S10_deer', (c) => SP.drawDeer(c, mkU({ race: 10 })));
show('S02_sheep_infected', (c) => SP.drawSheep(c, mkU({ race: 6, infected: 1 })));
show('PF01_base_civ', (c) => SP.drawPersonFine(c, mkU({ civ: 0 }), CIV0, 1000));
show('Q01_wolf', (c) => SP.drawQuadFine(c, mkU({}), 'wolf', 1000));
show('B01_boat_civ', (c) => SP.drawBoat(c, mkU({ civ: 0, boat: 1 }), CIV0, 1000));
