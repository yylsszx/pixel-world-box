// ============================================================================
// waterdepth-transcript.mjs —— M-U7g 水深分级 JS 镜像（零引擎导入，对账面 =
// WbWorldgen.cs 水深段机械镜像的同构 JS 形态）：
//   读 golden/waterdepth.json → 每场景 terrainGzB64 解码 → 镜像 waterTierAt 全场
//   → 与 golden waterTierGzB64 逐字节对账（4/4 全 PASS 即镜像绿）。
// 镜像结构 = C# WbWorldgen.LandForDepth/WaterTierAt（engine.ts L1011-1036 机械翻译）
// 逐行同构：DEEP 邻水=3 否则 4；WATER 外环切比雪夫 r=1..3 找陆 → r-1；否则 0/2。
// 运行：node scripts/unity-migration/waterdepth-transcript.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const W = 256, H = 160;
const T_DEEP = 0, T_WATER = 1, T_ICE = 10;   // WbConstants 同值域（T_DEEP=0/T_WATER=1/T_ICE=10）

function gunzipB64(b64) { return new Uint8Array(zlib.gunzipSync(Buffer.from(b64, 'base64'))); }

// —— 蓝本 landForDepth（engine.ts L1011-1013）：冰面视作水面、岩浆视作海岸 ——
function landForDepth(t) {
  return t !== T_DEEP && t !== T_WATER && t !== T_ICE;
}

// —— 蓝本 waterTierAt（engine.ts L1016-1036）机械镜像 ——
// WATER: 0 浅礁/1 近岸/2 开阔；DEEP: 3 陆架/4 深渊
function waterTierAt(terrain, i) {
  const t = terrain[i];
  const x = i % W;
  const y = (i / W) | 0;
  if (t === T_DEEP) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (terrain[yy * W + xx] === T_WATER) return 3;   // 邻普通水 = 陆架
      }
    }
    return 4;                                             // 深渊
  }
  if (t !== T_WATER) return 0;
  // 普通水：切比雪夫距离 1/2/3 内有陆地 → 浅礁/近岸/开阔
  for (let r = 1; r <= 3; r++) {
    let land = false;
    for (let dy = -r; dy <= r && !land; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // 只查外环
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (landForDepth(terrain[yy * W + xx])) { land = true; break; }
      }
    }
    if (land) return r - 1;
  }
  return 2;
}

// —— 蓝本 rebuildWaterTiers（engine.ts L1048-1050）全场等价 ——
function rebuildWaterTiers(terrain) {
  const out = new Uint8Array(terrain.length);
  for (let i = 0; i < terrain.length; i++) out[i] = waterTierAt(terrain, i);
  return out;
}

const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/waterdepth.json'), 'utf8'));
let pass = 0, fail = 0;
for (const sc of gold.scens) {
  const terrain = gunzipB64(sc.terrainGzB64);
  const goldTier = gunzipB64(sc.waterTierGzB64);
  const mine = rebuildWaterTiers(terrain);
  let diff = -1;
  for (let i = 0; i < mine.length; i++) {
    if (mine[i] !== goldTier[i]) { diff = i; break; }
  }
  if (diff >= 0) {
    fail++;
    console.error(`[WD-MIRROR] ${sc.name}: FAIL @i=${diff} mine=${mine[diff]} gold=${goldTier[diff]}`);
  } else {
    pass++;
    console.log(`[WD-MIRROR] ${sc.name}: PASS (${mine.length} 格逐位一致)`);
  }
}
console.log(`[WD-MIRROR] ${pass}/${gold.scens.length} 全 PASS`);
process.exit(fail === 0 ? 0 : 1);
