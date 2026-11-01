// dbg-bolt2.mjs —— S5/S6/S7 三场景资格面探针（r≥190 格数 / 候选掷数）
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

function mk(base, yearF, seed) {
  const eng = new GameEngine(base);
  eng.terrain.fill(T.GRASS);
  eng.laws.seasons = true; eng.laws.atmosphere = true; eng.laws.naturalDisasters = true;
  eng.yearF = yearF; eng.tickCount = 1000; eng.frameCount = 0; eng.shake = 0;
  eng.onToast = () => {};
  eng.nature = new NatureSystem(eng, base);
  eng.nature.lastSeason = -1;
  eng.nature.initPlates();
  eng.rngA = seed >>> 0;
  return eng;
}
function elig(eng, tag, steps) {
  for (let s = 0; s < steps; s++) {
    let n190 = 0, n70 = 0, rmax = 0;
    const before = eng.rngA >>> 0;
    eng.nature.atmTick();
    for (let i = 0; i < 640; i++) { const r = eng.nature.rainCell[i]; if (r >= 190) n190++; if (r > 70) n70++; if (r > rmax) rmax = r; }
    console.log(`${tag} 步${s}: r>=190格=${n190} r>70格=${n70} rmax=${rmax} boltCool=${eng.nature.boltCool} rainTTL=${eng.nature.rainbowTTL}/${eng.nature.rainbowCool} meteor=${eng.nature.meteorTTL}/${eng.nature.meteorCool} drawsΔ=${((eng.rngA >>> 0) - before) >>> 0}`);
  }
}

// S5 day: 湿带 cx8-13 cy9-12 + pSys (84,84)
{
  const eng = mk(20261106, 2.5, 0x0E2A0501);
  const m = eng.nature.moist;
  for (let cy = 9; cy <= 12; cy++) for (let cx = 8; cx <= 13; cx++) m[cy * 32 + cx] = fr(0.99);
  eng.nature.pSystems.push({ x: 84, y: 84, kind: 0, str: 1.0, ttl: 50 });
  elig(eng, 'S5', 2);
}
// S6 winter: 湿带 cx8-15 cy6-11 + pSys (92,68)
{
  const eng = mk(20261107, 6.5, 0x0E2A0601);
  const m = eng.nature.moist;
  for (let cy = 5; cy <= 12; cy++) for (let cx = 5; cx <= 17; cx++) m[cy * 32 + cx] = fr(0.99);
  eng.nature.pSystems.push({ x: 100, y: 68, kind: 0, str: 1.0, ttl: 50 });
  elig(eng, 'S6', 3);
}
// S7 sky: 干图（无湿带）+ prevRain 注入
{
  const eng = mk(20261108, 2.5, 0x0E2A0701);
  eng.frameCount = 100;
  for (let i = 128; i <= 271; i++) eng.nature.prevRain[i] = 130;
  eng.nature.atmTick();
  console.log(`S7 步0: rainbow=${eng.nature.rainbowTTL}/${eng.nature.rainbowCool} chron=${eng.nature.rainbowChronDone} moon=${eng.nature.rainbowMoon}`);
  eng.nature.rainbowTTL = 0; eng.nature.rainbowCool = 0;
  for (let i = 128; i <= 271; i++) eng.nature.prevRain[i] = 130;
  eng.frameCount = 1600;
  eng.nature.atmTick();
  console.log(`S7 步1: rainbow=${eng.nature.rainbowTTL}/${eng.nature.rainbowCool} chron=${eng.nature.rainbowChronDone}/${eng.nature.moonChronDone} moon=${eng.nature.rainbowMoon} dp=${((eng.frameCount % 2400) / 2400).toFixed(4)}`);
}

// S6 argmax 深探
{
  const eng = mk(20261107, 6.5, 0x0E2A0601);
  const m = eng.nature.moist;
  for (let cy = 5; cy <= 12; cy++) for (let cx = 5; cx <= 17; cx++) m[cy * 32 + cx] = fr(0.99);
  eng.nature.pSystems.push({ x: 100, y: 68, kind: 0, str: 1.0, ttl: 50 });
  eng.nature.atmTick();
  let bi = 0; for (let i = 0; i < 640; i++) if (eng.nature.rainCell[i] > eng.nature.rainCell[bi]) bi = i;
  const cx = bi % 32, cy = (bi / 32) | 0;
  const [u, v] = eng.nature.windAt(cx, cy);
  const st = eng.nature.cellStats(cx, cy);
  const ps = eng.nature.pSystems[0];
  console.log(`S6 argmax: cell=(${cx},${cy}) r=${eng.nature.rainCell[bi]} moist=${m[bi].toFixed(4)} wind=(${u.toFixed(3)},${v.toFixed(3)}) st=${JSON.stringify(st)} ps=(${(ps.x / 8).toFixed(2)},${(ps.y / 8).toFixed(2)},str=${ps.str.toFixed(3)}) season=${eng.nature.season} itcz=${eng.nature.itczLat.toFixed(4)}`);
  const stN = eng.nature.cellStats(cx + (u > 0 ? 1 : -1), cy + (v > 0.15 ? 1 : v < -0.15 ? -1 : 0));
  console.log(`  stN=${JSON.stringify(stN)} oro=${stN.elev > st.elev + 0.5 ? 1.7 : stN.elev < st.elev - 0.5 ? 0.55 : 1}`);
}
