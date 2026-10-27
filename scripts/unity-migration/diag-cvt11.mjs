// diag-cvt11.mjs — CVT11 rng 流分歧定位（临时诊断）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/units_civtick.json'), 'utf8'));
const sc = golden.scenarios.find((s) => s.name === 'CVT11-two-civ-friction');
const want = sc.traces[0];

console.log('want.rngA =', want.rngA);
console.log('want.civs =', JSON.stringify(want.civs.map((c) => ({ id: c.id, pop: c.pop, tiles: c.tiles.length, frontier: c.frontier }))));
console.log('want.tension =', JSON.stringify(want.tension));
console.log('want.rel =', JSON.stringify(want.rel));
console.log('want.met =', JSON.stringify(want.met));
console.log('want.dirty len =', want.dirty.length, 'propsDirty len =', want.propsDirty.length);
console.log('want.newEvents =', JSON.stringify(want.newEvents));

// trace1 也看
const want1 = sc.traces[1];
console.log('t1 want.rngA =', want1.rngA, 'rel =', JSON.stringify(want1.rel), 'met =', JSON.stringify(want1.met));
