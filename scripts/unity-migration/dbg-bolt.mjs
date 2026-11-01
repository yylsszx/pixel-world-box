// dbg-bolt.mjs —— bolt-day 场景雨面/掷流探针
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
const idx = (x, y) => y * W + x;

const eng = new GameEngine(20261106);
eng.terrain.fill(T.GRASS);
eng.laws.seasons = true; eng.laws.atmosphere = true; eng.laws.naturalDisasters = true;
eng.yearF = 2.5; eng.tickCount = 1000; eng.frameCount = 0; eng.shake = 0;
eng.onToast = () => {};
eng.nature = new NatureSystem(eng, 20261106);
eng.nature.lastSeason = -1;
eng.nature.initPlates();
const m = eng.nature.moist;
for (let cy = 10; cy <= 11; cy++) for (let cx = 10; cx <= 11; cx++) m[cy * 32 + cx] = fr(0.99);
eng.nature.pSystems.push({ x: 84, y: 84, kind: 0, str: 1.0, ttl: 50 });

// 掷流探针：包一层 eng.rng
const draws = [];
const origRng = eng.rng.bind(eng);
eng.rng = () => { const v = origRng(); draws.push(v.toFixed(4)); return v; };

eng.rngA = 0x0E2A0501 >>> 0;
eng.nature.atmTick();
console.log('season=', eng.nature.season, 'itczLat=', eng.nature.itczLat.toFixed(4), 'windPhase=', eng.nature.windPhase.toFixed(4));
for (const cy of [9, 10, 11, 12]) {
  const row = [];
  for (const cx of [9, 10, 11, 12]) row.push(eng.nature.rainCell[cy * 32 + cx]);
  console.log('rainCell cy' + cy + ':', row.join(','));
}
console.log('moist(10,10)=', eng.nature.moist[10 * 32 + 10].toFixed(4));
console.log('boltCool=', eng.nature.boltCool, 'lightningN=', eng.nature.lightningN, 'draws=', draws.length);
console.log('draws head:', draws.slice(0, 12).join(','));
