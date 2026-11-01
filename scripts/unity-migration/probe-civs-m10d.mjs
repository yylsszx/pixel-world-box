// M-U10d 探针：S19-S21 baseSeed 基础世界 civs 存活面 + lastSiegeEventTick 初值
import { createHash } from 'node:crypto';

// ---- 无头垫片（同 gen-power.mjs L51-73 逐字） ----
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
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }),
  addEventListener: noop,
  getElementById: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const path = await import('node:path');
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;

for (const base of [20261070, 20261071, 20261072]) {
  const eng = new GameEngine(base);
  const civs = eng.civs.map((c) => ({ id: c.id, name: c.name, alive: c.alive }));
  console.log(`base=${base} civs=${JSON.stringify(civs)} lastSiege=${eng.lastSiegeEventTick} fxPrefs.dmgNumbers=${eng.fxPrefs.dmgNumbers} fxPrefs.fxDensity=${eng.fxPrefs.fxDensity}`);
}
