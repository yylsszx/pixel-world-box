// 探针 2：rift 场景内嵌 instrumentation——重放 geologyTick 的裂谷段，记录每次 gate 通过后的
// pick→conv→terrain→抽签结果（用与主脚本完全一致的 rng 流）
import { NatureSystem } from '../../src/lib/game/nature.ts';
import { W, H } from '../../src/lib/game/constants.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { generateWorld } from '../../src/lib/game/worldgen.ts';

const terrain = generateWorld(42).terrain;
const eng = {
  laws: { tectonics: true, atmosphere: true, seasons: true, naturalDisasters: true },
  yearF: 1234.5, rng: mulberry32(934), terrain,
  riverDir: new Uint8Array(W * H), riverTiles: new Set(),
  setTerrain: (i, t) => { eng.terrain[i] = t; },
  volcano: () => {}, toast: () => {}, addEvent: () => {},
  dirty: new Set(), propsDirty: new Set(), units: [], cam: { x: 0, y: 0 },
};
const nat = new NatureSystem(eng, 42);
nat.initPlates();
for (let p = 0; p < nat.plateN; p++) nat.drift[p] = { dx: 0.3 - 0.25 * p, dy: 0 };
// coastalGrass 注入（同主脚本）
{
  const T = terrain;
  for (const i of nat.boundary) {
    const t = T[i];
    if (!(t === 2 || t === 3 || t === 4 || t === 5)) continue;
    const x = i % W, y = (i / W) | 0;
    let coastal = false;
    for (let k = 0; k < 4 && !coastal; k++) {
      const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const nt = T[yy * W + xx];
      if (nt === 0 || nt === 1) coastal = true;
    }
    T[i] = coastal ? 3 : 5;
  }
}
console.log(`plateN=${nat.plateN} boundary=${nat.boundary.size}`);
// 地形类分布（边界格）
const dist = {};
for (const i of nat.boundary) dist[terrain[i]] = (dist[terrain[i]] || 0) + 1;
console.log('boundary terrain dist:', JSON.stringify(dist));

// 事件捕获版 addEvent——跑 200 次真 geologyTick，但替换 rng 为可日志化版本无法内部插桩——
// 改为直接调用 nat.geologyTick() 并在 addEvent 捕获 + 事后重放 conv 统计：
let riftEv = 0, geoAll = [];
eng.addEvent = (cat, msg, pos) => { geoAll.push([cat, String(msg).slice(0, 14), pos ? `${pos.x},${pos.y}` : '-']); };
for (let it = 0; it < 200; it++) {
  if (it % 10 === 0 && it > 0) { /* 无 hill 续注（rift 场景无 hillInject） */ }
  nat.geologyTick();
}
console.log('events total:', geoAll.length);
const counts = {};
for (const [cat, m, pos] of geoAll) {
  const key = m.startsWith('裂谷') ? 'RIFT-EVENT' : m.slice(0, 8);
  counts[key] = (counts[key] || 0) + 1;
}
console.log('event kinds:', JSON.stringify(counts, null, 0));
// 独立统计：20000 次盲抽 boundary 的 conv 与地形（背景分布——非 rng 流内）
let pass = 0, terr = {};
const bl = [...nat.boundary];
for (let it = 0; it < 20000; it++) {
  const i = bl[Math.floor(Math.random() * bl.length)];
  const p = nat.plate[i];
  const x = i % W, y = (i / W) | 0;
  let np = p;
  if (x > 0 && nat.plate[i - 1] !== p) np = nat.plate[i - 1];
  else if (x < W - 1 && nat.plate[i + 1] !== p) np = nat.plate[i + 1];
  else if (y > 0 && nat.plate[i - W] !== p) np = nat.plate[i - W];
  else if (y < H - 1 && nat.plate[i + W] !== p) np = nat.plate[i + W];
  const conv = (nat.drift[np].dx - nat.drift[p].dx) + (nat.drift[np].dy - nat.drift[p].dy);
  if (conv < -0.2) { pass++; terr[terrain[i]] = (terr[terrain[i]] || 0) + 1; }
}
console.log(`convPass=${pass}/20000 (${(pass / 200).toFixed(1)}%) terrain@pass:`, JSON.stringify(terr));
console.log('erosions counter:', nat.counters.erosions, 'uplifts:', nat.counters.uplifts);
