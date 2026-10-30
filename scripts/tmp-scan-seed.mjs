// 种子扫描探针：找繁衍门1开（rng<repro）+ 门2开的种子
import { createJiti } from 'jiti';
import path from 'node:path';
const ROOT = '/home/z/my-project';
const noop = () => {};
const stubCtx = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return null;
  if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4,(w|0)*(h|0)*4)), width: w|0, height: h|0 });
  if (k === 'measureText') return () => ({ width: 0 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'createPattern') return () => ({});
  return typeof k === 'string' ? noop : undefined; }, set: () => true });
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
console.log('DEFAULT_LAWS.reproduction =', DEFAULT_LAWS.reproduction);
// H03: human repro 0.006；H04: sheep 0.004。扫 seed 找首掷 <repro 的
function trial(race, repro, base) {
  const hits = [];
  for (let s = 1; s <= 400 && hits.length < 3; s++) {
    const eng = new GameEngine(base + s);
    const v = eng.rng() ; // 首掷
    if (v < repro) hits.push([base + s, v.toFixed(5), eng.rng().toFixed(5)]); // 记门2掷
  }
  return hits;
}
console.log('H03 human 0.006 hits:', JSON.stringify(trial(0, 0.006, 0x5f00)));
console.log('H04 sheep 0.004 hits:', JSON.stringify(trial(6, 0.004, 0x5f00)));
console.log('H05 wolf 0.004 hits (需门1开门2短路):', JSON.stringify(trial(7, 0.004, 0x5f00)));
