// diag-cvt57b.mjs — 用 runScenario 夹具重放 CVT57/60，插桩 civ1 生命周期
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
const gen = await jiti.import(path.join(ROOT, 'scripts/unity-migration/gen-units-civtick.mjs'));
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

const mk = (name) => gen.scenarios.find((s) => s.name === name);

const names = ['CVT57-army-form', 'CVT58-army-levy', 'CVT59-army-muster-broke', 'CVT60-army-rally-march',
  'CVT61-army-march-siege-ambush', 'CVT62-army-siege-approach', 'CVT63-army-frontpush-march', 'CVT64-army-supply-line',
  'CVT65-army-pursue-kill', 'CVT66-army-rout-panic-disband', 'CVT67-army-triumph', 'CVT68-barracks-war',
  'CVT69-barracks-peace', 'CVT70-temple-heal', 'CVT71-front-decay', 'CVT72-front-solidify'];
for (const name of names) {
  const sc = mk(name);
  const eng = new GameEngine(sc.seed);
  eng.civs.length = 0; eng.units.length = 0; eng.unitById.clear();
  eng.laws = { ...DEFAULT_LAWS, ...(sc.laws ?? {}) };
  if (sc.paint) for (const p of sc.paint) {
    for (let y = p[1]; y <= p[3]; y++) for (let x = p[0]; x <= p[2]; x++) eng.terrain[y * 256 + x] = p[4];
  }
  for (const c of sc.civs ?? []) {
    const civ = { id: c.id, name: c.name ?? `C${c.id}`, race: c.race ?? 0, color: c.color ?? [200, 60, 60], colorHex: c.colorHex ?? '#c83c3c', pop: c.pop ?? 0, tiles: [...(c.tiles ?? [])], frontier: [], houses: c.houses ?? 0, capital: c.capital ?? -1, culture: 0, kingName: 'K', alive: c.alive ?? true, banner: 'B', colonizeCd: 0, history: [], gold: c.gold ?? 0, knowledge: 0, armyCd: 0, techs: [], research: null, researchP: 0, gov: 0, govYear: 0, stability: 70, militarism: 30, income: 0, expense: 0, festivalCd: 0 };
    eng.civs.push(civ); eng.civs[civ.id] = civ;
    eng.civSeq = Math.max(eng.civSeq ?? 0, civ.id + 1);
    for (const i of civ.tiles) eng.owner[i] = civ.id;
  }
  for (const u of sc.units ?? []) {
    const u2 = { id: u.id, race: 0, civ: u.civ ?? -1, x: u.x, y: u.y, tx: u.x, ty: u.y, hp: 10, maxHp: 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: u.kills ?? 0, cd: 0, trait: 0, job: u.job ?? 0, king: 0, infected: 0, flip: 0, name: `u${u.id}`, hurt: 0, breath: 0, parity: 0, dead: 0, boat: 0, boatTTL: 0, caravan: 0, wep: 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0, army: u.army ?? null, gene: null, food: 0, fam: 0, fgn: 0, gIds: [], gVal: [] };
    eng.units.push(u2); eng.unitById.set(u2.id, u2);
  }
  for (const [i, kind, civ] of sc.buildings ?? []) {
    eng.buildings.push({ i, x: i % 256, y: (i / 256) | 0, kind, civ });
    eng.bIdx.set(i, eng.buildings.length - 1);
    eng.building[i] = kind;
  }
  for (const [a, b, v] of sc.rel ?? []) eng.rel.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
  eng.tickCount = sc.startTick ?? 0;
  const c1 = eng.civs[1];
  console.log(`\n=== ${name} ===`);
  console.log('pre civsTick: c1.alive=', c1.alive, 'pop=', c1.pop, 'houses=', c1.houses, 'tiles=', c1.tiles.length);
  eng.rebuildCivBuildCounts();
  eng.civsTick();
  console.log('post civsTick: c1.alive=', c1.alive, 'houses=', c1.houses, 'popZeroTick=', c1.popZeroTick);
  console.log('events:', eng.worldEvents.filter((e) => e.kind === 'fall' || e.kind === 'colonize').map((e) => e.kind + ':' + e.text.slice(0, 26)));
}
