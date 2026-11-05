// diag-armory-u10.mjs —— S1 u10 dmg 漂移定位（spawn 明细：dmg/gene/tm/job）
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

const eng = new GameEngine(20260);
console.log('speciesBase size =', eng.speciesBase.size, 'has ELF(1):', eng.speciesBase.has(1), 'entry:', eng.speciesBase.get(1));
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
  if (u.id >= 7) console.log(`u${u.id} race=${race} job=${u.job} dmg=${u.dmg.toFixed(6)} gene.d=${u.gene.d.toFixed(6)} gene.s=${u.gene.s.toFixed(4)} age=${u.age} tmD=${eng.techModsOf(civ).dmg}`);
}
