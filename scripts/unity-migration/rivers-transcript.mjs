// ============================================================================
// rivers-transcript.mjs —— M-U7k 河域零引擎导入镜像（parity 链）
// 独立转写（蓝本逐行锚，零 src 导入——bail/waterdepth-transcript 同纪律）：
//   encodeRiverDir engine.ts L62-71（RIVER_DIRS L63-65）/ carveRiver L12282-12392 /
//   carveLake L12394-12411 / seedRivers nature.ts L1094-1108（nature.rng = mulberry32
//   seed^0x7ea12d L89）/ SOIL_BASE worldsim.ts L31-34 + initFromTerrain L125 /
//   soilMulAt L168-170 / rebuildWaterTiers L1011-1050 / fx spawn 2 掷 L9781-9799。
// 输入 = rivers.json 场景自举（preTerrain/preMoist gzB64 + rng.tail 尾段掷值 + seed）。
// 掷值协议：engine.rngA 流尾段（markIdx 起）依序消费——fx 2 掷/走步 1 掷/灌溉 GRASS 格
//   1 掷（&& 短路）逐位对齐；消费数 ≠ tail.length 即失败（抽签台账闭合自证）。
// setTerrain 簿记（amb/frozen/flood/wet/fire/owner/building/markDirty）在世界生成域均为
//   no-op（空表/全 -1/L950 全量 dirty 兜底）——C# 直写等价注记（M-U7g 宿主接力先例）。
// 对账输出：terrain/riverDir/waterTier 逐字节 + riverTiles 插入序 + effects(kind/seed/dir f64hex)
//   + events(kind/text 序)——与黄金逐项全等。
// 运行：node scripts/unity-migration/rivers-transcript.mjs
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/rivers.json'), 'utf8'));

// ---- 常量（types.ts T L10-24 / worldsim.ts SOIL_BASE L31-34 / engine.ts L686 brush） ----
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const W = 256, H = 160, N = W * H;
const SOIL_BASE = { 0: 40, 1: 45, 2: 64, 3: 142, 4: 152, 5: 112, 6: 66, 7: 92, 8: 30, 9: 96, 10: 45 };  // [T.DEEP..T.ICE]；SWAMP 等 → ?? 128
const BRUSH = 3;              // engine.ts L686 brush = 3（世界生成期无笔刷 UI）
const isWater = (t) => t === T.DEEP || t === T.WATER;              // constants.ts L67-69

// ---- 蓝本逐行转写 ----

/** engine.ts L62-71：河道八方向编码（1-8） */
const RIVER_DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];
function encodeRiverDir(dx, dy) {
  for (let k = 0; k < 8; k++) {
    if (RIVER_DIRS[k][0] === Math.sign(dx) && RIVER_DIRS[k][1] === Math.sign(dy)) return k + 1;
  }
  return 0;
}

/** worldsim.ts L168-170（soilF = SOIL_BASE[t] ?? 128，initFromTerrain L125 世界生成期初值） */
function soilMulAt(soilF, j) {
  return 0.6 + (soilF[j] / 255) * 0.8;
}

/** engine.ts L1011-1013 landForDepth + L1016-1045 waterTierAt + L1048-1050 rebuildWaterTiers */
function landForDepth(t) { return t !== T.DEEP && t !== T.WATER && t !== T.ICE; }
function waterTierAt(terrain, i) {
  const t = terrain[i];
  const x = i % W, y = (i / W) | 0;
  if (t === T.DEEP) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (terrain[yy * W + xx] === T.WATER) return 3;
    }
    return 4;
  }
  if (t !== T.WATER) return 0;
  for (let r = 1; r <= 3; r++) {
    let land = false;
    for (let dy = -r; dy <= r && !land; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (landForDepth(terrain[yy * W + xx])) { land = true; break; }
    }
    if (land) return r - 1;
  }
  return 2;
}
function rebuildWaterTiers(terrain) {
  const wt = new Uint8Array(N);
  for (let i = 0; i < N; i++) wt[i] = waterTierAt(terrain, i);
  return wt;
}

/** 一次河域回放：输入场景黄金 → 独立重放 → 输出面 */
function replay(sc) {
  const seed = sc.seed;
  const terrain = new Uint8Array(zlib.gunzipSync(Buffer.from(sc.preTerrain, 'base64')));
  const moist = new Uint8Array(zlib.gunzipSync(Buffer.from(sc.preMoist, 'base64')));
  if (terrain.length !== N || moist.length !== N) throw new Error(`S${seed}: 输入幅面失效`);
  const soilF = new Uint8Array(N);
  for (let i = 0; i < N; i++) soilF[i] = SOIL_BASE[terrain[i]] ?? 128;   // worldsim.ts L125

  // 双 rng 流：engine 尾段掷值（黄金 rng.tail 依序消费）+ nature 流（mulberry32(seed^0x7ea12d)）
  const tail = sc.rng.tail;
  let cur = 0;
  const rng = () => {
    if (cur >= tail.length) throw new Error(`S${seed}: 掷值链提前耗尽 @${cur}`);
    return Buffer.from(tail[cur++], 'hex').readDoubleLE(0);
  };
  let natA = (seed ^ 0x7ea12d) >>> 0;                                     // nature.ts L89
  const nat = () => {
    natA = (natA + 0x6d2b79f5) | 0;
    let t = Math.imul(natA ^ (natA >>> 15), 1 | natA);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const riverDir = new Uint8Array(N);
  const riverTiles = [];                                                  // JS Set 插入序
  const riverSet = new Set();
  const effects = [];
  const events = [];                                                      // unshift 语义 → [0] 插入
  const addEvent = (kind, text) => events.unshift({ kind, text });
  const fx = (kind, x, y, ttl) => {                                       // L9781-9799（cap 620 世界生成不触达）
    effects.push({ kind, x, y, ttl, seed: Math.floor(rng() * 65536), dir: rng() * Math.PI * 2 });  // 2 掷 L9794
  };

  /** engine.ts L12394-12411 carveLake（内流湖/火山口湖；r 由调用方给） */
  function carveLake(cx, cy, r) {
    for (let dy = -r - 1; dy <= r + 1; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx, dy);
        if (d <= r) {
          terrain[yy * W + xx] = T.WATER;                                 // L12403（山区淹没山体）
        } else if (d <= r + 1) {
          const j = yy * W + xx;
          if (terrain[j] === T.SAND || terrain[j] === T.BURNT) terrain[j] = T.GRASS;   // L12406 湖畔绿洲
        }
      }
    }
    fx('spawn', cx + 0.5, cy + 0.5, 30);                                  // L12410（2 掷）
  }

  /** engine.ts L12282-12392 carveRiver */
  function carveRiver(wx, wy, widthOverride) {
    const sx = Math.max(0, Math.min(W - 1, Math.floor(wx)));              // L12283
    const sy = Math.max(0, Math.min(H - 1, Math.floor(wy)));              // L12284
    const start = sy * W + sx;                                            // L12285
    if (isWater(terrain[start])) return false;                            // L12286（零掷）
    // L12287-12304 BFS：全水格出发 4 邻步进场，山体阻断
    const dist = new Int32Array(N).fill(-1);
    const queue = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) if (isWater(terrain[i])) { dist[i] = 0; queue[qt++] = i; }
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % W, y = (i / W) | 0;
      const d = dist[i];
      if (x > 0 && dist[i - 1] === -1 && terrain[i - 1] !== T.MOUNTAIN) { dist[i - 1] = d + 1; queue[qt++] = i - 1; }
      if (x < W - 1 && dist[i + 1] === -1 && terrain[i + 1] !== T.MOUNTAIN) { dist[i + 1] = d + 1; queue[qt++] = i + 1; }
      if (y > 0 && dist[i - W] === -1 && terrain[i - W] !== T.MOUNTAIN) { dist[i - W] = d + 1; queue[qt++] = i - W; }
      if (y < H - 1 && dist[i + W] === -1 && terrain[i + W] !== T.MOUNTAIN) { dist[i + W] = d + 1; queue[qt++] = i + W; }
    }
    if (dist[start] === -1) {                                             // L12305-12312 山脉环抱 → 内流湖
      carveLake(sx, sy, Math.max(2, BRUSH));
      addEvent('river', '群山之间诞生了一泓内流湖');
      return true;
    }
    const width = widthOverride != null ? widthOverride : Math.max(0, Math.floor((BRUSH - 1) / 2));   // L12315
    const visited = new Uint8Array(N);
    let cx = sx, cy = sy, carved = 0, reached = false;
    for (let steps = 0; steps < 400; steps++) {                           // L12320
      const i = cy * W + cx;
      if (visited[i]) break;                                              // L12322 防绕圈（零掷）
      visited[i] = 1;
      if (dist[i] === 0) { reached = true; break; }                       // L12324 抵海（零掷）
      const curD = dist[i];
      const cands = [], wts = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (dist[j] < 0 || dist[j] >= curD) continue;
        cands.push(j);
        wts.push(1 / (1 + (curD - dist[j]) * 0.5));                       // L12338
      }
      if (cands.length === 0) { carveLake(cx, cy, Math.max(2, width + 1)); break; }   // L12341-12344
      let total = 0;
      for (const w of wts) total += w;
      let r = rng() * total;                                            // L12348（1 掷）
      let pick = cands[0];
      for (let k = 0; k < cands.length; k++) { r -= wts[k]; if (r <= 0) { pick = cands[k]; break; } }
      const nx = pick % W, ny = (pick / W) | 0;
      const dirCode = encodeRiverDir(nx - cx, ny - cy);                   // L12353
      for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {   // L12355-12368
        if (dx * dx + dy * dy > width * width + 0.5) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (terrain[j] === T.MOUNTAIN) continue;                          // L12361 河绕山
        if (terrain[j] !== T.WATER) { terrain[j] = T.WATER; carved++; }   // L12362（setTerrain 簿记 worldgen 域 no-op）
        if (dirCode > 0) {
          riverDir[j] = dirCode;
          if (!riverSet.has(j)) { riverSet.add(j); riverTiles.push(j); }  // L12365 Set.add 重复 no-op → 插入序保持
        }
      }
      const ir = width + 1;                                               // L12369-12380 沿岸灌溉
      for (let dy = -ir; dy <= ir; dy++) for (let dx = -ir; dx <= ir; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const t = terrain[j];
        if (t === T.SAND || t === T.BURNT) terrain[j] = T.GRASS;
        else if (t === T.GRASS && rng() < 0.05 * soilMulAt(soilF, j)) terrain[j] = T.FOREST;   // L12378（&& 短路 1 掷/GRASS 格）
      }
      cx = nx; cy = ny;                                                   // L12381-12382
    }
    if (carved > 0) {                                                     // L12384-12390
      fx('spawn', wx, wy, 30);                                            // L12385（2 掷）
      addEvent('river', reached ? '一条大河诞生了，蜿蜒流向大海' : '一条河在洼地尽头汇成了湖');   // L12387
      return true;
    }
    return false;                                                         // L12391
  }

  /** nature.ts L1094-1108 seedRivers（世界生成期自然河网） */
  function seedRivers() {
    const n = 8 + Math.floor(nat() * 6);                                  // L1096（nature 流 1 掷）
    let carved = 0;
    for (let tr = 0; tr < n * 16 && carved < n; tr++) {                   // L1098
      const x = 6 + Math.floor(nat() * (W - 12));                         // L1099（2 掷/try）
      const y = 6 + Math.floor(nat() * (H - 12));                         // L1100
      const i = y * W + x;
      const t = terrain[i];
      if (t !== T.MOUNTAIN && t !== T.HILL) continue;                     // L1103
      if (moist[i] < 115) continue;                                       // L1104 干旱山地不成河
      if (carveRiver(x + 0.5, y + 0.5, 0)) carved++;                      // L1105
    }
    if (carved > 0) addEvent('river', `这个年轻的世界有了自己的河网——${carved} 条大河从山地奔向海洋`);   // L1107
    return carved;
  }

  seedRivers();
  const waterTier = rebuildWaterTiers(terrain);                            // L949 generate 内序
  if (cur !== tail.length) throw new Error(`S${seed}: 掷值链残余 ${tail.length - cur}——抽签台账不闭合`);
  return { terrain, riverDir, waterTier, riverTiles, effects, events };
}

// ---- 对账 ----
const f64hexOf = (v) => { const b = Buffer.alloc(8); b.writeDoubleLE(v); return b.toString('hex'); };
const ungz = (b64) => new Uint8Array(zlib.gunzipSync(Buffer.from(b64, 'base64')));
let pass = 0, fail = 0;
for (const sc of golden.scenarios) {
  const name = `S${sc.seed}`;
  try {
    const out = replay(sc);
    const eq = (a, b) => Buffer.from(a).equals(Buffer.from(b));
    const checks = [
      ['terrain', eq(out.terrain, ungz(sc.terrain))],
      ['riverDir', eq(out.riverDir, ungz(sc.riverDir))],
      ['waterTier', eq(out.waterTier, ungz(sc.waterTier))],
      ['riverTiles', JSON.stringify(out.riverTiles) === JSON.stringify(sc.riverTiles)],
      ['effects.count', out.effects.length === sc.effects.length],
      ['effects', sc.effects.length === out.effects.length && sc.effects.every((e, k) =>
        e.kind === out.effects[k].kind && e.seed === out.effects[k].seed &&
        e.x === f64hexOf(out.effects[k].x) && e.y === f64hexOf(out.effects[k].y) &&
        e.ttl === f64hexOf(out.effects[k].ttl) && e.dir === f64hexOf(out.effects[k].dir))],
      ['events', sc.events.length === out.events.slice(0, sc.events.length).length &&
        sc.events.every((e, k) => e.kind === out.events[k].kind && e.text === out.events[k].text)],
      ['events.count', out.events.length === sc.events.length],
    ];
    const bad = checks.filter(([, ok]) => !ok);
    if (bad.length === 0) { console.log(`${name}: ALL PASS (${out.riverTiles.length} river tiles, ${out.effects.length} fx, ${out.events.length} events)`); pass++; }
    else { console.log(`${name}: FAIL — ${bad.map(([k]) => k).join(',')}`); fail++; }
  } catch (e) {
    console.log(`${name}: THROW — ${e.message}`); fail++;
  }
}
console.log(`\nrivers-transcript: ${pass}/${golden.scenarios.length} ${fail === 0 ? 'ALL PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);
