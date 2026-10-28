// 探针：drowned 场景裂谷分支为何 0 命中——conv<-0.2 命中率 + 选中格地形分布
import { NatureSystem } from '../../src/lib/game/nature.ts';
import { W, H } from '../../src/lib/game/constants.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { generateWorld } from '../../src/lib/game/worldgen.ts';

const terrain = generateWorld(777).terrain;
const eng = {
  laws: { tectonics: true, atmosphere: true, seasons: true, naturalDisasters: true },
  yearF: 1234.5, rng: mulberry32(933), terrain,
  riverDir: new Uint8Array(W * H), riverTiles: new Set(),
  setTerrain: (i, t) => { eng.terrain[i] = t; },
  volcano: () => {}, toast: () => {}, addEvent: () => {},
  dirty: new Set(), propsDirty: new Set(), units: [], cam: { x: 0, y: 0 },
};
const nat = new NatureSystem(eng, 777);
nat.initPlates();
for (let p = 0; p < nat.plateN; p++) nat.drift[p] = { dx: 0.3 - 0.25 * p, dy: 0 };
// hill 注入（同主脚本）
for (const i of nat.boundary) { const t = terrain[i]; if (t === 2 || t === 3 || t === 4) terrain[i] = 5; }

// 直接重放 rift 段的抽样逻辑（不跑 geologyTick——独立统计 80 次盲抽的背景分布）
let convPass = 0, terrStats = {};
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
  if (conv < -0.2) {
    convPass++;
    const t = terrain[i];
    terrStats[t] = (terrStats[t] || 0) + 1;
  }
}
console.log(`boundary=${bl.length} plateN=${nat.plateN} convPass=${convPass}/20000 (${(convPass / 200).toFixed(1)}%)`);
console.log('terrain dist at conv-pass:', JSON.stringify(terrStats));
// 预期：80 iters × 0.35 gate ≈ 28 picks × convPass% × terrain 抽签率
