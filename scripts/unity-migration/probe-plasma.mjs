// M-U10h 探针：S29 plasma 掷流分解实证（临时诊断件——不入链）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const noop = () => {};
const stubCtx = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return null;
  if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w|0)*(h|0)*4)), width: w|0, height: h|0 });
  if (k === 'measureText') return () => ({ width: 0 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  return typeof k === 'string' ? noop : undefined;
}, set: () => true });
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const idx = (x, y) => y * W + x;

const eng = new GameEngine(20261080);
eng.terrain.fill(T.GRASS);
eng.fire.fill(0); eng.fireSet.clear(); eng.frozen = new Set(); eng.flood = new Map(); eng.wet = new Map();
eng.regrow = new Map(); eng.radiate.fill(0); eng.radSet.clear(); eng.dirty.clear();
eng.units.length = 0; eng.unitById.clear(); eng.armies.length = 0; eng.effects.length = 0;
eng.shake = 0; eng.worldEvents.length = 0; eng.eventSeq = 1;
eng.buildings.length = 0; eng.bIdx.clear(); eng.building.fill(0); eng.bHp.clear(); eng.damagedSet.clear(); eng.activeBattles.clear();
eng.laws.seasons = false; eng.yearF = 2.5; eng.tickCount = 28000;

// 包一层 rng 计数
let draws = 0;
const origRng = eng.rng.bind(eng);
eng.rng = () => { draws++; return origRng(); };

// 单位 + plasma fx
const U = [
  [100.5, 60.5, 50, 0], [104.0, 60.5, 50, 0], [105.0, 60.5, 50, 0],
  [99.0, 60.5, 50, 1], [108.0, 60.5, 50, 0],
];
for (const [x, y, hp, civ] of U) {
  const s = eng.spawnUnit(R.SHEEP, x, y, { silent: true, civ });
  s.hp = hp; s.maxHp = 50;
}
eng.spawnUnit(R.SHEEP, 100.5, 63.0, { silent: true });
const u5 = eng.units[eng.units.length - 1];
u5.hp = 10; u5.maxHp = 50; u5.dead = 1;
eng.fx('plasma', 100.5, 60.5, 2, { src: 1, wid: 7 });
eng.rebuildBuckets();

eng.rngA = 0x0A0E1E >>> 0;
draws = 0;
// k0
eng.tickCount++; eng.effectsTick();
const k0 = draws; draws = 0;
eng.tickCount++; eng.effectsTick();
console.log('k0 draws =', k0, ' k1 draws =', draws);
console.log('fireSet.size =', eng.fireSet.size, ' effects kinds =', eng.effects.map((e) => e.kind).join(','));
console.log('units hp =', eng.units.map((u) => `${u.hp.toFixed(4)}${u.dead ? '(dead)' : ''}`).join(' '));
console.log('armies =', eng.armies.length, ' shake =', eng.shake, ' kc =', eng.killCredit);
console.log('r =', eng.effects.length, ' ttl2 plasma gone:', !eng.effects.some((e) => e.kind === 'plasma'));
