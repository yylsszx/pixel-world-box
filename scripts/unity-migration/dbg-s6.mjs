import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const noop = () => {};
const stubCtx = new Proxy({}, { get: (_t, k) => { if (k === 'canvas') return null; if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w|0)*(h|0)*4)), width: w|0, height: h|0 }); if (k === 'measureText') return () => ({ width: 0 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop }); if (k === 'createPattern') return () => ({}); return typeof k === 'string' ? noop : undefined; }, set: () => true });
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, set: noop, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
const natMod = await jiti.import(path.join(ROOT, 'src/lib/game/nature.ts'));
const NatureSystem = natMod.NatureSystem;
const { T } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const fr = Math.fround;
for (let k = 0; k < 8; k++) {
  const eng = new GameEngine(20261107);
  eng.terrain.fill(T.GRASS);
  eng.laws.seasons = true; eng.laws.atmosphere = true; eng.laws.naturalDisasters = true;
  eng.yearF = 6.5; eng.tickCount = 1000; eng.frameCount = 0; eng.shake = 0;
  eng.onToast = () => {};
  eng.nature = new NatureSystem(eng, 20261107);
  eng.nature.lastSeason = -1;
  eng.nature.initPlates();
  const m = eng.nature.moist;
  for (let cy = 5; cy <= 12; cy++) for (let cx = 5; cx <= 17; cx++) m[cy * 32 + cx] = fr(0.99);
  eng.nature.pSystems.push({ x: 100, y: 68, kind: 0, str: 1.0, ttl: 50 });
  eng.nature.pSystems.push({ x: 116, y: 76, kind: 0, str: 1.0, ttl: 50 });
  eng.rngA = (0x0E2A0601 + k) >>> 0;
  eng.nature.atmTick();
  let n190 = 0, rmax = 0, draws = 0;
  for (let i = 0; i < 640; i++) { const r = eng.nature.rainCell[i]; if (r >= 190) n190++; if (r > rmax) rmax = r; }
  console.log(`seed+${k}: r>=190=${n190} rmax=${rmax} tSnow=${eng.nature.tSnowChronDone} boltCool=${eng.nature.boltCool}`);
}
