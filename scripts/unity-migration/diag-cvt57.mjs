// diag-cvt57.mjs — 最小复现：pop0/houses0 civ 在 civsTick 后是否被消灭
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

const eng = new GameEngine(0xa3b1);
eng.civs.length = 0; eng.units.length = 0; eng.unitById.clear();
eng.laws = { ...DEFAULT_LAWS };
const c0 = { id: 0, name: 'C0', race: 0, color: [200, 60, 60], colorHex: '#c83c3c', pop: 30, tiles: [20 * 256 + 20], frontier: [], houses: 8, capital: 20 * 256 + 20, culture: 0, kingName: 'K', alive: true, banner: 'B', colonizeCd: 0, history: [], gold: 100, knowledge: 0, armyCd: 0, techs: [], research: null, researchP: 0, gov: 0, govYear: 0, stability: 70, militarism: 30, income: 0, expense: 0, festivalCd: 0 };
const c1 = { id: 1, name: 'C1', race: 0, color: [60, 60, 200], colorHex: '#3c3cc8', pop: 0, tiles: [200 + 120 * 256], frontier: [], houses: 0, capital: 200 + 120 * 256, culture: 0, kingName: 'K', alive: true, banner: 'B', colonizeCd: 0, history: [], gold: 0, knowledge: 0, armyCd: 0, techs: [], research: null, researchP: 0, gov: 0, govYear: 0, stability: 70, militarism: 30, income: 0, expense: 0, festivalCd: 0 };
eng.civs.push(c0, c1); eng.civs[0] = c0; eng.civs[1] = c1;
eng.civSeq = 2;
for (const i of c0.tiles) eng.owner[i] = 0;
for (const i of c1.tiles) eng.owner[i] = 1;
eng.rel.set('0-1', -21);
eng.tickCount = 60;
console.log('before: c1.alive=', c1.alive, 'houses=', c1.houses, 'pop=', c1.pop);
eng.rebuildCivBuildCounts();
eng.civsTick();
console.log('after civsTick: c1.alive=', c1.alive, 'houses=', c1.houses, 'popZeroTick=', c1.popZeroTick);
console.log('events:', eng.worldEvents.map((e) => e.kind + ':' + e.text.slice(0, 24)));
console.log('rel 0-1:', eng.rel.get('0-1'));
