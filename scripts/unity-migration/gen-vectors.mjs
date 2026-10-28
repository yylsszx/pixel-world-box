// ============================================================================
// gen-vectors.mjs —— 黄金向量生成器（Unity 迁移对账台 M0）
// 从现役 src/lib/game/noise.ts（真实游戏实现，非复制）生成黄金向量 JSON，
// 供 dotnet 对账台（parity/）对 C# 移植做逐位（bit-exact）比对。
// 运行：bun scripts/unity-migration/gen-vectors.mjs
// 输出：scripts/unity-migration/golden-vectors.json
// ============================================================================
import { mulberry32, hash2, valueNoise, fbm } from '../../src/lib/game/noise.ts';
import { writeFileSync } from 'node:fs';

const out = { rng: [], hash2: [], vn: [], fbm: [] };

// ---------- 1) mulberry32 流：5 seed × 64 draw ----------
const RNG_SEEDS = [0, 1, 20261026, 4294967295, 123456789];
for (const s of RNG_SEEDS) {
  const g = mulberry32(s);
  const draws = [];
  for (let i = 0; i < 64; i++) draws.push(g());
  out.rng.push({ seed: s, draws });
}

// ---------- 2) hash2 网格：x/y 含负数与边界、seed 含负 ----------
const HS = [0, 1, 20261026, -5, 1000000007];
const HP = [-2048, -1, 0, 1, 7, 100, 4095, 65536];
for (const seed of HS) {
  for (const x of HP) {
    for (const y of HP) {
      out.hash2.push({ x, y, seed, v: hash2(x, y, seed) });
    }
  }
}

// ---------- 3) valueNoise 采样：格点/半格/负坐标 ----------
const VP = [0, 0.5, -0.5, 13.7, 1024.25, -77.5];
for (const seed of [20261026, -5]) {
  for (const x of VP) for (const y of VP) {
    out.vn.push({ x, y, seed, v: valueNoise(x, y, seed) });
  }
}

// ---------- 4) fbm 采样：默认参数 + 变参 ----------
const FP = [0.25, 3.5, -2.75, 88.125, 2048.5];
for (const seed of [20261026, 42]) {
  for (const x of FP) for (const y of FP) {
    out.fbm.push({ x, y, seed, v: fbm(x, y, seed) });
  }
}
// 变参：octaves/lacunarity/gain 与 TS 侧调用点对齐（worldsim/nature 用默认与变体）
for (const [oc, la, ga] of [[2, 2, 0.5], [8, 2, 0.5], [5, 3, 0.45]]) {
  for (const x of FP) for (const y of FP) {
    out.fbm.push({ x, y, seed: 20261026, octaves: oc, lacunarity: la, gain: ga, v: fbm(x, y, 20261026, oc, la, ga) });
  }
}

const path = new URL('./golden-vectors.json', import.meta.url).pathname;
writeFileSync(path, JSON.stringify(out));
console.log(`golden vectors: rng=${out.rng.length} streams, hash2=${out.hash2.length}, vn=${out.vn.length}, fbm=${out.fbm.length} -> ${path}`);
