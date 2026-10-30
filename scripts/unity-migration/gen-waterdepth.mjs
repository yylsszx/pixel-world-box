// ============================================================================
// gen-waterdepth.mjs —— M-U7g 切片「水深分级域 + 宿主真地形落位」黄金向量
// 真实现 = engine.ts L1011-1050（landForDepth/waterTierAt/rebuildWaterTiers 原型方法
//          直调，非复制）+ worldgen.ts generateWorld 真实现（pre-river 地形域）。
//
// 域口径（关键）：
//   蓝本 generate()（engine.ts L771-952）顺序 = generateWorld → spawnAnimals(L936)
//   → nature.seedRivers()（L939，刻河改写 terrain——nature.ts 未译域）→ rebuildWaterTiers(L949)。
//   C# 可复现域 = pre-river（WbWorldgen.GenerateWorld 输出直灌）——黄金锚定 pre-river
//   地形 × 真方法 waterTierAt 全场；河网切片落位时宿主接线须再刻河+重算（WbGameHost 注记）。
//   gen 侧同时用真引擎实例做双层自洽：
//   ① 真字段自洽：eng.waterTier[i] ≡ eng.waterTierAt(i)（post-river 全索引）——引擎内部完整面；
//   ② 调用面等价：eng.terrain 换装 pre-river 后真方法直调全场 ≡ 原型借用调用
//      （同 this 形状 { terrain, landForDepth }）——借用面与真面零分歧证。
//
// 运行：node scripts/unity-migration/gen-waterdepth.mjs（自带 sanity + det 子进程双跑 + [GEN PASS]）
// 输出：scripts/unity-migration/golden/waterdepth.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/waterdepth.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 gen-tick-orch.mjs 原则） ----
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
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }),
  addEventListener: noop,
  getElementById: () => null,
};
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
// 不垫 globalThis.window —— engine.ts WASM boot 守卫是 typeof window !== 'undefined'

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
if (typeof GameEngine !== 'function') throw new Error('GameEngine 未定位: ' + Object.keys(engMod).join(','));
const { generateWorld } = await jiti.import(path.join(ROOT, 'src/lib/game/worldgen.ts'));
if (typeof generateWorld !== 'function') throw new Error('generateWorld 未定位');

const W = 256, H = 160;
const NPX = W * H;

function gzB64(u8) { return zlib.gzipSync(Buffer.from(u8), { level: 9 }).toString('base64'); }
function md5(buf) { return createHash('md5').update(buf).digest('hex'); }

// ---- 场景表：宿主种子 + 跨种子 + 群群岛（海陆密度差 → tier 分布差） ----
const SCENS = [
  { name: 'S1_host_seed',   seed: 20261029, params: undefined },          // WbGameHost 默认种子
  { name: 'S2_seed_42',     seed: 42,       params: undefined },
  { name: 'S3_seed_987654', seed: 987654,   params: undefined },
  { name: 'S4_archipelago', seed: 777,      params: { seaBias: 0.15 } },  // 群群岛：海岸线暴涨 → 浅礁/陆架覆盖面拉满
];

function buildScens() {
  const scens = [];
  for (const s of SCENS) {
    // ① pre-river 地形（worldgen.ts 真实现直调——C# WbWorldgen 同源域）
    const gen = generateWorld(s.seed, s.params);
    if (gen.terrain.length !== NPX) throw new Error(s.name + ' terrain 尺寸异常');
    // ② 真实现直调面：真引擎实例换装 pre-river terrain → waterTierAt 逐格真调
    const eng = new GameEngine(s.seed);
    // 真字段自洽（post-river）：eng.waterTier ≡ eng.waterTierAt（引擎内部完整面）
    for (let i = 0; i < NPX; i++) {
      if (eng.waterTier[i] !== eng.waterTierAt(i)) throw new Error(s.name + ' 引擎字段自洽破 @i=' + i);
    }
    const savedTerrain = eng.terrain;
    eng.terrain = gen.terrain;                       // 换装 pre-river（eng 不再 tick，安全）
    const tiersReal = new Uint8Array(NPX);
    for (let i = 0; i < NPX; i++) tiersReal[i] = eng.waterTierAt(i);   // 真方法直调
    eng.terrain = savedTerrain;                      // 复原
    // 调用面等价：原型借用调用（this={terrain}+原型 landForDepth）≡ 真方法直调全场
    const borrowed = Object.create(GameEngine.prototype);
    borrowed.terrain = gen.terrain;
    for (let i = 0; i < NPX; i++) {
      if (borrowed.waterTierAt(i) !== tiersReal[i]) throw new Error(s.name + ' 调用面分歧 @i=' + i);
    }
    // 值域 + 分布 sanity：tier ⊆ {0..4}；四档水域 0/2/3/4 全场景必现（陆地必有岸，海必有渊）
    const hist = [0, 0, 0, 0, 0];
    for (let i = 0; i < NPX; i++) {
      const v = tiersReal[i];
      if (!(v >= 0 && v <= 4)) throw new Error(s.name + ' tier 越界 ' + v + ' @i=' + i);
      hist[v]++;
    }
    for (const t of [0, 2, 3, 4]) {
      if (hist[t] === 0) throw new Error(s.name + ' tier ' + t + ' 零覆盖（分布 sanity 破）');
    }
    scens.push({
      name: s.name,
      seed: s.seed,
      params: s.params ?? null,
      terrainGzB64: gzB64(gen.terrain),
      waterTierGzB64: gzB64(tiersReal),
      terrainMd5: md5(gen.terrain),
      waterTierMd5: md5(tiersReal),
      hist,
      note: 'pre-river 域（generateWorld 直出 × waterTierAt 真方法）——河网 seedRivers 落位后须重算',
    });
    console.log('[gen] ' + s.name + ' seed=' + s.seed + ' hist=' + JSON.stringify(hist));
  }
  return scens;
}

const isDetChild = process.argv.includes('--detchild');
const scens = buildScens();
const snap = JSON.stringify({ meta: { gen: 'gen-waterdepth.mjs', note: 'M-U7g 水深分级黄金：pre-river terrain × engine.waterTierAt 真方法全场' }, scens });

if (isDetChild) {
  writeFileSync('/tmp/wb-det-childwd.json', snap);
  process.exit(0);
}
mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/waterdepth.json');
writeFileSync(outPath, snap);
const out2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/waterdepth.json');
writeFileSync(out2, snap);

// det 子进程双跑（同 gen-worldgen 协议）
const { execFileSync } = await import('node:child_process');
const selfPath = fileURLToPath(import.meta.url);
execFileSync(process.execPath, [selfPath, '--detchild'], { stdio: ['ignore', 'ignore', 'inherit'] });
const childSnap = readFileSync('/tmp/wb-det-childwd.json', 'utf8');
if (childSnap !== snap) { console.error('[GEN WATERDEPTH] det 双跑不一致'); process.exit(1); }
console.log('[GEN WATERDEPTH] det 双跑字节级一致 md5=' + md5(snap));
console.log('[GEN WATERDEPTH] golden/waterdepth.json ' + (snap.length / 1024).toFixed(1) + 'KB 双写 golden/ + StreamingAssets/WbGolden/');
console.log('[GEN PASS]');
