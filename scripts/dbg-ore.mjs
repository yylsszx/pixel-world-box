import { createJiti } from 'jiti';
import path from 'node:path';
const ROOT = '/home/z/my-project/pixel-world-box';
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
const eng = new GameEngine(20261113);
console.log('seed =', eng.seed);
const s1 = Uint8Array.from(eng.ore);
// 找第一个矿格，看它在 generate 后与二次 derive 后的差异
let diffAt = -1;
eng.deriveOre();
for (let i = 0; i < s1.length; i++) if (s1[i] !== eng.ore[i]) { diffAt = i; break; }
console.log('first diff at tile', diffAt, 'val', s1[diffAt], '->', eng.ore[diffAt]);
console.log('terrain at diff:', eng.terrain[diffAt]);
// 关键怀疑：generate 里 deriveOre 之后有没有代码改 ore？搜 engine 内 ore 的写点
