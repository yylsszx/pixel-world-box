// worldgen-transcript.mjs — M-U7f' worldgen 镜像回放：C# 语义独立转写 vs 黄金 worldgen.json
// 零引擎导入（不 import noise.ts/worldgen.ts）——从 C# WbNoise.cs/WbWorldgen.cs 语义独立转写，
// 与黄金（gen-worldgen.mjs 直调真实现 dump）三方互锁：C# 译错 → 镜像 vs 黄金同挂。
// 语义源锚（C# 侧行号）：
//   WbNoise.cs — Hash2→WbSave.Hash2（JS double 折叠+ToInt32）/ ValueNoise L44-62 / Fbm L67-83 /
//                V8Hypot L89-117（max 归一化+Kahan 补偿，57 万样本零分歧）
//   WbWorldgen.cs — HeightAt L52-69 / GenerateWorld 循环等价 L76-88 / GenOnce L90-：
//                   主循环六档+气候场 / 湖泊 V8Hypot 圈地 / 沼泽斑片 / TrySpawn 15 组 /
//                   TrySpawnSpread k-center / 鲨鱼锚定 8 重试 / land sanity 重掷
// 跑法：node scripts/unity-migration/worldgen-transcript.mjs（自带 [MIRROR PASS]）
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const W = 256, H = 160;

// ---------------- 噪声基元（C# 语义转写） ----------------
function u32(x) { return x >>> 0; }
function imul(a, b) { return Math.imul(a, b); }
// WbRng.Mulberry32Next（uint wrap 域）—— noise.ts mulberry32 L3-12 同源
function mulberry32Next(a) {
  a = u32(a + 0x6d2b79f5);
  let t = a ^ (a >>> 15);
  t = u32(imul(t, 1 | a));
  const t2 = u32(t + u32(imul(t ^ (t >>> 7), 61 | t)) ^ t);
  return [u32(t2 ^ (t2 >>> 14)) / 4294967296, a];
}
// WbSave.Hash2（JS double 折叠 + ToInt32 语义）—— noise.ts hash2 L14-19
function toInt32(d) {
  d = Math.trunc(d);
  d = d % 4294967296;
  if (d >= 2147483648) d -= 4294967296;
  if (d < -2147483648) d += 4294967296;
  return d | 0;
}
function hash2(x, y, seed) {
  let d = x * 374761393;
  d += y * 668265263;
  d += seed * 1442695041;
  let h = toInt32(d);
  const a = h ^ (h >>> 13);
  const b = toInt32(a * 1274126177);
  h = b ^ (b >>> 16);
  return (h >>> 0) / 4294967296;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }
function valueNoise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const v00 = hash2(xi, yi, seed);
  const v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed);
  const v11 = hash2(xi + 1, yi + 1, seed);
  const sx = smooth(xf), sy = smooth(yf);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}
function fbm(x, y, seed, octaves = 5, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
// WbNoise.V8Hypot（max 归一化 + Kahan 补偿）—— V8 Math.hypot 语义
function v8Hypot(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const max = ax > ay ? ax : ay;
  if (max === 0) return 0;
  if (max === Infinity) return Infinity;
  let sum = 0, compensation = 0;
  const vals = [dx / max, dy / max];
  for (const v of vals) {
    if (v === 0) continue;
    const sq = v * v;
    const t = sum + sq;
    if (Math.abs(sum) >= Math.abs(sq)) compensation += (sum - t) + sq;
    else compensation += (sq - t) + sum;
    sum = t;
  }
  return max * Math.sqrt(sum + compensation);
}
function jsRound(x) { return Math.floor(x + 0.5); }

// ---------------- 地形常量（WbConstants） ----------------
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, SWAMP: 11 };
const R = { SHEEP: 6, WOLF: 7, BEAR: 8, DEER: 10, PENGUIN: 11, CAMEL: 12, SCORPION: 13, SNAKE: 14, SNOWWOLF: 15, CHICKEN: 33, PIG: 34, RABBIT: 35, FOX: 36, FISH: 37, CRAB: 38, TURTLE: 39, SHARK: 40 };

// ---------------- worldgen 全链（C# WbWorldgen.cs 语义转写） ----------------
function heightAt(x, y, seed, warp, falloff) {
  const nx = x / W, ny = y / H;
  const wx = fbm(nx * 3 + 5.2, ny * 3 + 1.3, seed + 77, 3) - 0.5;
  const wy = fbm(nx * 3 + 1.7, ny * 3 + 9.2, seed + 133, 3) - 0.5;
  let h = fbm(nx * 4.4 + wx * 1.4 * warp, ny * 4.4 + wy * 1.4 * warp, seed, 6);
  const dx = (nx - 0.5) * 2, dy = (ny - 0.5) * 2;
  const d = Math.sqrt(dx * dx + dy * dy);
  h -= Math.max(0, (d - 0.55) * falloff);
  h = Math.max(0, Math.min(1, (h - 0.28) * 1.55 + 0.28));
  return h;
}

function generateWorld(seed, parms) {
  while (true) {
    const res = genOnce(seed, parms);
    let land = 0;
    for (let i = 0; i < res.terrain.length; i += 7) if (res.terrain[i] >= T.SAND) land++;
    if (land < 400) { seed += 1337; continue; }
    return res;
  }
}

function genOnce(seed, parms) {
  let randA = seed >>> 0;
  const Rand = () => { const [v, na] = mulberry32Next(randA); randA = na; return v; };

  const terrain = new Uint8Array(W * H);
  const variant = new Uint8Array(W * H);
  const temp = new Uint8Array(W * H);
  const moist = new Uint8Array(W * H);

  const seaBias = parms?.seaBias ?? 0;
  const tempBias = parms?.tempBias ?? 0;
  const moistBias = parms?.moistBias ?? 0;
  const warp = parms?.warp ?? 1;
  const falloff = parms?.falloff ?? 0.9;
  const lakeCount = parms?.lakes ?? 3 + Math.floor(Rand() * 4);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      variant[i] = Math.floor(hash2(x, y, seed + 999) * 255);
      const h = heightAt(x, y, seed, warp, falloff) - seaBias;
      const lat = Math.abs(y / H - 0.5) * 2;
      const tempF = 1 - lat * 1.25 + (fbm(x / 48, y / 48, seed + 555, 3) - 0.5) * 0.35 + tempBias;
      const moistF = Math.min(1, Math.max(0, fbm(x / 36 + 8, y / 36 + 3, seed + 321, 4) + moistBias));
      let t;
      if (h < 0.30) t = T.DEEP;
      else if (h < 0.42) t = T.WATER;
      else if (h < 0.46) t = T.SAND;
      else if (h < 0.70) t = T.GRASS;
      else if (h < 0.80) t = T.HILL;
      else t = T.MOUNTAIN;
      if (t === T.GRASS) {
        if (tempF < 0.26) t = T.SNOW;
        else if (moistF > 0.60 && tempF > 0.3) t = T.FOREST;
        else if (tempF > 0.82 && moistF < 0.42) t = T.SAND;
      }
      terrain[i] = t;
      temp[i] = Math.max(0, Math.min(255, jsRound((tempF + 0.08) * 165)));
      moist[i] = Math.max(0, Math.min(255, jsRound(moistF * 255)));
    }
  }

  // 湖泊 sprinkle（V8Hypot 圈地）
  for (let l = 0; l < lakeCount; l++) {
    const cx = 20 + Rand() * (W - 40);
    const cy = 16 + Rand() * (H - 32);
    const r = 2 + Rand() * 3;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dd = v8Hypot(x - cx, y - cy);
        if (dd <= r && terrain[y * W + x] >= T.SAND) terrain[y * W + x] = T.WATER;
      }
    }
  }

  // 沼泽斑片
  const nearWater = (x, y, r) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const tt = terrain[yy * W + xx];
        if (tt === T.WATER || tt === T.DEEP) return true;
      }
    }
    return false;
  };
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (terrain[i] !== T.GRASS) continue;
      const h = heightAt(x, y, seed, warp, falloff) - seaBias;
      if (h >= 0.56) continue;
      const m = Math.min(1, Math.max(0, fbm(x / 36 + 8, y / 36 + 3, seed + 321, 4) + moistBias));
      if (m < 0.60) continue;
      const patch = fbm(x / 13 + 41, y / 13 + 23, seed + 777, 3);
      if (patch < 0.55) continue;
      if (!nearWater(x, y, 2)) continue;
      terrain[i] = T.SWAMP;
    }
  }

  // wildlife
  const spawnAnimals = [];
  const trySpawn = (race, count, groupLo, groupHi, need, nearWaterR = 0) => {
    let placed = 0, guard = 0;
    while (placed < count && guard++ < count * 60) {
      const x = Rand() * W, y = Rand() * H;
      const i = Math.floor(y) * W + Math.floor(x);
      if (terrain[i] === need && (nearWaterR <= 0 || nearWater(Math.floor(x), Math.floor(y), nearWaterR))) {
        spawnAnimals.push({ race, x, y });
        placed++;
        const n = groupLo + Math.floor(Rand() * (groupHi - groupLo + 1));
        for (let m = 1; m < n; m++) {
          const mx = x + (Rand() - 0.5) * 5;
          const my = y + (Rand() - 0.5) * 5;
          const mi = Math.floor(my) * W + Math.floor(mx);
          if (mx >= 0 && my >= 0 && mx < W && my < H && terrain[mi] === need) {
            spawnAnimals.push({ race, x: mx, y: my }); // 蓝本 L155 恒等式 → 恒 race
          }
        }
      }
    }
  };
  const trySpawnSpread = (race, count, groupLo, groupHi, needs) => {
    const cand = [];
    for (let i = 0; i < terrain.length; i++) if (needs.indexOf(terrain[i]) >= 0) cand.push(i);
    if (cand.length === 0) return;
    const nearest = new Float64Array(cand.length).fill(Infinity);
    const px = [], py = [];
    const seedAt = (ci) => {
      const cx = ci % W, cy = (ci / W) | 0;
      px.push(cx); py.push(cy);
      for (let i = 0; i < cand.length; i++) {
        const dxi = (cand[i] % W) - cx, dyi = ((cand[i] / W) | 0) - cy;
        const d2 = dxi * dxi + dyi * dyi;
        if (d2 < nearest[i]) nearest[i] = d2;
      }
    };
    seedAt(Math.floor(Rand() * cand.length));
    for (let k = 1; k < count; k++) {
      let best = -1, bestD = -1;
      for (let i = 0; i < cand.length; i++) {
        if (nearest[i] > bestD) { bestD = nearest[i]; best = i; }
      }
      if (best < 0 || bestD <= 0) break;
      seedAt(cand[best]);
    }
    for (let p = 0; p < px.length; p++) {
      spawnAnimals.push({ race, x: px[p] + 0.5, y: py[p] + 0.5 });
      const n = groupLo + Math.floor(Rand() * (groupHi - groupLo + 1));
      for (let m = 1; m < n; m++) {
        const mx = px[p] + (Rand() - 0.5) * 5;
        const my = py[p] + (Rand() - 0.5) * 5;
        if (mx < 0 || my < 0 || mx >= W || my >= H) continue;
        const mi = Math.floor(my) * W + Math.floor(mx);
        if (needs.indexOf(terrain[mi]) >= 0) spawnAnimals.push({ race, x: mx, y: my });
      }
    }
  };

  trySpawn(R.SHEEP, 24, 4, 7, T.GRASS);
  trySpawn(R.WOLF, 9, 2, 4, T.FOREST);
  trySpawn(R.BEAR, 5, 1, 1, T.FOREST);
  trySpawn(R.DEER, 14, 3, 5, T.GRASS);
  trySpawn(R.PENGUIN, 8, 2, 4, T.SNOW);
  trySpawn(R.CAMEL, 6, 2, 4, T.SAND);
  trySpawn(R.SCORPION, 8, 2, 3, T.SAND);
  trySpawn(R.SNAKE, 7, 2, 3, T.SAND);
  trySpawn(R.SNOWWOLF, 8, 2, 4, T.SNOW);
  trySpawn(R.CHICKEN, 10, 3, 5, T.GRASS);
  trySpawn(R.PIG, 8, 3, 5, T.GRASS);
  trySpawn(R.RABBIT, 12, 3, 6, T.GRASS);
  trySpawn(R.RABBIT, 5, 2, 4, T.FOREST);
  trySpawn(R.FOX, 6, 1, 2, T.FOREST);
  trySpawnSpread(R.FISH, 26, 5, 9, [T.WATER, T.DEEP]);
  trySpawn(R.CRAB, 10, 2, 4, T.SAND, 2);
  trySpawn(R.TURTLE, 9, 2, 4, T.DEEP);
  trySpawn(R.SHARK, 6, 1, 2, T.DEEP);

  // 鲨鱼锚定鱼群（8 次重试）
  {
    const fishSpots = spawnAnimals.filter((a) => a.race === R.FISH);
    for (const a of spawnAnimals) {
      if (a.race !== R.SHARK || fishSpots.length === 0) continue;
      const f = fishSpots[Math.floor(Rand() * fishSpots.length)];
      for (let t = 0; t < 8; t++) {
        const jx = Math.max(0.5, Math.min(W - 0.5, f.x + (Rand() * 3 - 1.5)));
        const jy = Math.max(0.5, Math.min(H - 0.5, f.y + (Rand() * 3 - 1.5)));
        const jt = terrain[Math.floor(jy) * W + Math.floor(jx)];
        if (jt === T.WATER || jt === T.DEEP) { a.x = jx; a.y = jy; break; }
      }
    }
  }

  return { terrain, variant, temp, moist, spawnAnimals };
}

// ---------------- 黄金回放对账 ----------------
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/worldgen.json'), 'utf8'));
let pass = 0, fail = 0;
function gunzipB64(b64) { return new Uint8Array(gunzipSync(Buffer.from(b64, 'base64'))); }
function bytesEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
for (const sc of gold.scens) {
  const res = generateWorld(sc.seed, sc.params ?? undefined);
  const gt = gunzipB64(sc.terrainGzB64), gv = gunzipB64(sc.variantGzB64);
  const gm = gunzipB64(sc.moistGzB64), gtp = gunzipB64(sc.tempGzB64);
  const checks = [
    ['terrain', bytesEq(res.terrain, gt)],
    ['variant', bytesEq(res.variant, gv)],
    ['temp', bytesEq(res.temp, gtp)],
    ['moist', bytesEq(res.moist, gm)],
  ];
  // spawnAnimals 逐条位级（race 精确 + x/y double 位级）
  let animalsOk = res.spawnAnimals.length === sc.spawnAnimals.length;
  if (animalsOk) {
    for (let i = 0; i < res.spawnAnimals.length; i++) {
      const a = res.spawnAnimals[i], g = sc.spawnAnimals[i];
      if (a.race !== g.race || a.x !== g.x || a.y !== g.y) { animalsOk = false; break; }
    }
  }
  checks.push(['spawnAnimals', animalsOk]);
  const bad = checks.filter(([, ok]) => !ok);
  if (bad.length === 0) { pass++; console.log(`  [PASS] ${sc.name}（${res.spawnAnimals.length} animals）`); }
  else { fail++; console.error(`  [FAIL] ${sc.name}: ${bad.map(([k]) => k).join(',')} 位差`); }
}
console.log(`[MIRROR WORLDGEN] ${pass}/${pass + fail} 场景全档逐位` + (fail === 0 ? ' ALL PASS' : ' FAIL'));
if (fail > 0) process.exit(1);
