// ============================================================================
// gen-terrain.mjs —— M-U1a 地形生成黄金向量（Task 135）
// 直接 import 现役 src/lib/game/worldgen.ts（真实现，非复制），
// 对多 seed + 模板变体输出 terrain/variant/temp/moist 全量 base64 + spawn 列表。
// 运行：bun scripts/unity-migration/gen-terrain.mjs
// 输出：scripts/unity-migration/golden-terrain.json
// ============================================================================
import { generateWorld } from '../../src/lib/game/worldgen.ts';
import { writeFileSync } from 'node:fs';

const b64 = (u8) => Buffer.from(u8).toString('base64');

// seeds：主世界 seed + 多样性组；变体覆盖世界模板参数路径（群岛/盘古/冰河/湿润）
const CASES = [
  { name: 's20261026', seed: 20261026 },
  { name: 's42', seed: 42 },
  { name: 's7', seed: 7 },
  { name: 's123456789', seed: 123456789 },
  { name: 's0', seed: 0 },
  { name: 'islands', seed: 20261026, params: { seaBias: 0.08, warp: 1.6, falloff: 1.3 } },
  { name: 'pangaea', seed: 20261026, params: { seaBias: -0.06, warp: 0.7, falloff: 0.55 } },
  { name: 'iceage', seed: 42, params: { tempBias: -0.18, moistBias: 0.05 } },
  { name: 'wetlands', seed: 7, params: { moistBias: 0.15, lakes: 6 } },
  { name: 'fixedlakes', seed: 0, params: { lakes: 2 } },
];

const out = [];
let totalSpawn = 0;
for (const c of CASES) {
  const r = generateWorld(c.seed, c.params);
  const rec = {
    name: c.name,
    seed: c.seed,
    params: c.params ?? null,
    terrain: b64(r.terrain),
    variant: b64(r.variant),
    temp: b64(r.temp),
    moist: b64(r.moist),
    spawns: r.spawnAnimals.map((a) => [a.race, a.x, a.y]),
  };
  totalSpawn += rec.spawns.length;
  // 速览统计（人类可读性 + 生成健康度）
  const cnt = {};
  for (const b of r.terrain) cnt[b] = (cnt[b] || 0) + 1;
  rec.summary = cnt;
  out.push(rec);
}

const path = new URL('./golden-terrain.json', import.meta.url).pathname;
writeFileSync(path, JSON.stringify(out));
console.log(`terrain golden vectors: ${out.length} cases, spawn total ${totalSpawn} -> ${path}`);
for (const rec of out) {
  console.log(`  ${rec.name}: spawns=${rec.spawns.length} terrain_summary=${JSON.stringify(rec.summary)}`);
}
