// diag-armory-s1.mjs —— S1 步1 掷数 8 vs 手算 6 定位（rng 调用点探针）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const noop = () => {};
const stubCtx = new Proxy({}, { get: (_t, k) => { if (k === 'canvas') return null; if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }); if (k === 'measureText') return () => ({ width: 0 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop }); if (k === 'createPattern') return ({}); return typeof k === 'string' ? noop : undefined; }, set: () => true });
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

// rng 探针：包装实例 rng（实例字段/原型方法双兼容）
const proto = GameEngine.prototype;
const origRng = proto.rng;
let calls = [];

const eng = new GameEngine(20260);
eng.terrain.fill(T.GRASS);
eng.units.length = 0; eng.unitById.clear(); eng.effects.length = 0;
eng.worldEvents.length = 0; eng.eventSeq = 1; eng.civs.length = 0;
eng.warData.clear(); eng.families.clear(); eng.dynRaces.clear();
eng.yearF = 12.25; eng.tickCount = 0;
for (const c of [
  { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
  { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: ['bronze'] },
  { id: 2, name: '石民', colorHex: '#a3a3a3', pop: 30, gold: 100, techs: [] },
]) eng.civs.push({ ...c, capital: -1, tiles: [], frontier: [], ideas: null, alive: true });
const spec = [
  [R.HUMAN, 60.5, 60.5, 0, 0], [R.HUMAN, 61.5, 60.5, 0, 1], [R.HUMAN, 62.5, 60.5, 0, 2],
  [R.HUMAN, 63.5, 60.5, 0, 1, 'sword1'], [R.HUMAN, 64.5, 60.5, 0, 0, null, 'armor1'],
  [R.HUMAN, 65.5, 60.5, 0, 2], [R.HUMAN, 66.5, 60.5, 0, 1],
  [R.ELF, 90.5, 60.5, 1, 0], [R.ELF, 91.5, 60.5, 1, 1], [R.ELF, 92.5, 60.5, 1, 2], [R.ELF, 93.5, 60.5, 1, 0],
  [R.DWARF, 120.5, 60.5, 2, 0], [R.DWARF, 121.5, 60.5, 2, 1],
];
for (const [race, x, y, civ, job, wep, arm] of spec) {
  const u = eng.spawnUnit(race, x, y, { silent: true, civ, job });
  if (wep) u.wep = wep;
  if (arm) u.arm = arm;
}
const origInst = eng.rng.bind(eng);
eng.rng = (...a) => { calls.push(new Error('t').stack.split('\n')[2]?.trim().slice(0, 140) ?? '?'); return origInst(...a); };
eng.rngA = 0x1a2b3c;
calls = [];
eng.armoryTick();
console.log('步1 掷数 =', calls.length);
calls.forEach((c, i) => console.log(`  #${i + 1}`, c));
console.log('gold:', eng.civs.map((c) => c.gold));
console.log('fx:', eng.effects.length);
