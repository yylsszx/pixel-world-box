// ============================================================================
// gen-rivers.mjs —— M-U7k 切片「河域」黄金向量
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），驱动 GameEngine 全链
// generate(seed)（engine.ts L771-952：genWorld → worldsim initFromTerrain →
// L936 spawnUnit 逐只 → L941 nature.seedRivers → L949 rebuildWaterTiers）。
//
// 协议要点：
//   ① 双 rng 流：engine.rngA = (seed ^ 0x9e3779b9)>>>0（L773；spawnUnit/carveRiver/fx 消费）+
//     nature.rng = mulberry32(seed ^ 0x7ea12d)（nature.ts L89；seedRivers 源头选点消费）。
//   ② 掷值重建（类字段陷阱规避）：engine.rng 是类字段箭头函数初始化器（L728-733，非原型方法
//     ——prototype.rng 不存在，monkey-patch 不可用）→ 纯数学重建：mulberry 链自
//     state0 确定性推进，每掷恰前进一步（noise.ts L3-13 公式）；seedRivers wrap 快照
//     this.eng.rngA 状态（链上唯一）反解 markIdx（spawnUnit 域掷数上界）；终态 eng.rngA
//     反解总掷数。draws = 链输出序列（f64 hex）——transcript 算法域自 markIdx 起消费，
//     免重写 spawnUnit/uniqueName/unitName 域（M-U3h 黄金链已锁 + 本黄金 units dump 回归面）。
//   ③ fx 掷数：fx() 每调 2 掷（seed+dir L9794——Task 138 基本单位语义）→ carveRiver 尾
//     L12385/carveLake L12410 各计入链；fx cap 620（FX_CAPS[1]）世界生成不触达。
//   ④ sanity：每场景 riverTiles>0 / units>0 / worldEvents 含 'river'；det 双跑字节级。
//
// 运行：node scripts/unity-migration/gen-rivers.mjs
// 输出：scripts/unity-migration/golden/rivers.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/rivers.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 gen-tick-orch.mjs 原则） ----
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    if (k === 'createImageData' || k === 'getImageData')
      return (w, h, x, y) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
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
const { NatureSystem } = await jiti.import(path.join(ROOT, 'src/lib/game/nature.ts'));

// ---- 工具 ----
const gzB64 = (u8) => zlib.gzipSync(Buffer.from(u8), { level: 9 }).toString('base64');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

// mulberry32 步进（noise.ts L3-13 公式逐行同构）——纯数学掷值链重建
function mulberryStep(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

// seedRivers 分割锚：wrap 原型方法（真原型方法——Task 134 安装键纪律），快照：
//   rngA 状态（链上唯一 → 步数唯一反解）+ pre-river terrain/moistMap（此时刻 = genWorld 输出，
//   transcript 的算法域输入源；C# 侧与 GenerateWorld 产物交叉锁定）
let markState = -1;
let preTerrain = null, preMoist = null;
const origSeedRivers = NatureSystem.prototype.seedRivers;
NatureSystem.prototype.seedRivers = function (...args) {
  markState = this.eng.rngA >>> 0;   // 链上唯一状态 → 步数唯一反解
  preTerrain = this.eng.terrain.slice();
  preMoist = this.eng.moistMap ? this.eng.moistMap.slice() : null;
  return origSeedRivers.apply(this, args);
};

// 掷值链重建：state0 → 逐步推进至 markState（markIdx）与 finalState（total）；
// 营盘裁剪：仅保留 markIdx 后段掷值（spawnUnit 域 M-U3h 已锁——transcript 算法域自 markIdx 起消费；
// R3 体积纪律：全链 3800+ 掷 ×17B ≈ 65KB/场景 → 尾段 ~250 掷 ≈ 4KB）
function rebuildChain(state0, markState, finalState) {
  const tail = [];
  let a = state0 | 0;
  let markIdx = -1;
  for (let k = 0; k < 5_000_000; k++) {
    const r = mulberryStep(a);
    a = r.a;
    if (markIdx >= 0) tail.push(f64hex(r.v));               // 过分割点后才开始收集
    if ((a >>> 0) === (markState >>> 0)) markIdx = k + 1;      // seedRivers 入口前掷数
    if ((a >>> 0) === (finalState >>> 0)) return { tail, markIdx, total: k + 1 };
  }
  throw new Error('rng 链未达终态——协议失效');
}

const SEEDS = [20261029, 42, 987654, 777, 20261030];

const scenarios = [];
for (const seed of SEEDS) {
  markState = -1;
  const eng = new GameEngine(seed);   // 构造器内 generate(seed) 全链（L771-952）
  const W = eng.W ?? 256, H = eng.H ?? 160;
  const N = W * H;

  // sanity（黄金生成时健全性断言——生成即验证）
  const riverTiles = Array.from(eng.riverTiles);
  if (riverTiles.length === 0) throw new Error(`S${seed}: riverTiles 空——河域场景失效`);
  if (eng.units.length === 0) throw new Error(`S${seed}: units 空——spawnAnimals 重放失效`);
  const evs = eng.worldEvents.filter((e) => e.kind === 'river');
  if (evs.length === 0) throw new Error(`S${seed}: worldEvents 无 river 纪事`);
  if (markState < 0) throw new Error(`S${seed}: seedRivers wrap 未命中`);

  const state0 = (seed ^ 0x9e3779b9) >>> 0;               // engine.ts L773
  const finalState = eng.rngA >>> 0;
  const chain = rebuildChain(state0, markState, finalState);
  if (!preMoist) throw new Error(`S${seed}: moistMap 缺失——seedRivers 门控输入面失效`);

  // units 回归面：SHA256 摘要（C# 同构重建字符串 → 同哈希对账）+ S1 锚点 unit0 全字段诊断位
  // 规范串：id|race|x|y|dmg|speed|maxAge|flip|breath|name|trait|gs|gd|gh|gr 以 ';' 连接（f64hex 小写）
  const canon = (u) => [
    u.id, u.race, f64hex(u.x), f64hex(u.y), f64hex(u.dmg), f64hex(u.speed), f64hex(u.maxAge),
    u.flip ? 1 : 0, u.breath, u.name, u.trait ?? '',
    f64hex(u.gene?.s ?? 1), f64hex(u.gene?.d ?? 1), f64hex(u.gene?.h ?? 1), f64hex(u.gene?.r ?? 1),
  ].join('|');
  const unitsDigest = createHash('sha256').update(eng.units.map(canon).join(';'), 'utf8').digest('hex');

  const effects = eng.effects.map((e) => ({
    kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl),
    seed: e.seed, dir: f64hex(e.dir),
  }));
  const events = eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text }));   // 全量（cap 80 域；截断会破坏 count 对账）

  const u0 = eng.units[0];
  scenarios.push({
    seed,
    markIdx: chain.markIdx,                                  // seedRivers 入口掷数分割
    rng: { tail: chain.tail, markIdx: chain.markIdx, total: chain.total },  // 尾段掷值（markIdx 起）
    rngA: finalState.toString(16).padStart(8, '0'),          // 终态抽签台账（uint hex）——C# w.rngA 终态对账
    unitsCount: eng.units.length,
    unitsDigest,                                             // units 全列表 SHA256（C# 同构重建对账）
    unit0: { id: u0.id, race: u0.race, x: f64hex(u0.x), y: f64hex(u0.y), name: u0.name, trait: u0.trait ?? null,
             dmg: f64hex(u0.dmg), speed: f64hex(u0.speed), maxAge: f64hex(u0.maxAge), flip: u0.flip ? 1 : 0, breath: u0.breath,
             gene: { s: f64hex(u0.gene?.s ?? 1), d: f64hex(u0.gene?.d ?? 1), h: f64hex(u0.gene?.h ?? 1), r: f64hex(u0.gene?.r ?? 1) } },
    preTerrain: gzB64(preTerrain),                           // transcript 算法域输入（= genWorld 输出）
    preMoist: gzB64(preMoist),
    terrain: gzB64(eng.terrain),
    riverDir: gzB64(eng.riverDir),
    waterTier: gzB64(eng.waterTier),
    riverTiles,                                              // JS Set 插入序
    effects,
    events,
  });
  console.log(`S${seed}: units=${eng.units.length} rivers=${riverTiles.length} draws=${chain.total} markIdx=${chain.markIdx} rngA=${finalState.toString(16)}`);
}

// ---- det 双跑（字节级）：第二遍重跑对账（generate 对同 seed 幂等） ----
const det1 = scenarios.map((s) => {
  const ungz = (b64) => new Uint8Array(zlib.gunzipSync(Buffer.from(b64, 'base64')));
  const h = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
  return { seed: s.seed, terrainMd5: h(ungz(s.terrain)), riverDirMd5: h(ungz(s.riverDir)), waterTierMd5: h(ungz(s.waterTier)), rngA: s.rngA };
});
const det2 = [];
for (const s of scenarios) {
  markState = -1;
  const eng = new GameEngine(s.seed);
  const h = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
  det2.push({
    seed: s.seed,
    terrainMd5: h(eng.terrain),
    riverDirMd5: h(eng.riverDir),
    waterTierMd5: h(eng.waterTier),
    rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
  });
}
for (let i = 0; i < det1.length; i++) {
  const a = det1[i], b = det2[i];
  if (a.terrainMd5 !== b.terrainMd5 || a.riverDirMd5 !== b.riverDirMd5 || a.waterTierMd5 !== b.waterTierMd5 || a.rngA !== b.rngA)
    throw new Error(`det 失败 S${a.seed}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
}
console.log('det 双跑字节级一致:', det1.map((d) => `${d.seed}:${d.terrainMd5.slice(0, 8)}`).join(' '));

const out = {
  meta: {
    gen: 'gen-rivers.mjs',
    protocol: 'GameEngine 全链 generate(seed) 真实现（L771-952）+ rngA 掷值链纯数学重建 + seedRivers 状态锚分割',
    rngStreams: { engine: '(seed ^ 0x9e3779b9)>>>0 L773（类字段箭头 rng L728-733——patch 不可用→链重建）', nature: 'mulberry32(seed ^ 0x7ea12d) nature.ts L89' },
    domains: ['spawnUnit 重放 L936（M-U3h 锁域回归面）', 'seedRivers nature.ts L1094-1108', 'carveRiver engine.ts L12282-12392', 'carveLake L12394-12411', 'rebuildWaterTiers L949'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/rivers.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/rivers.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('rivers.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
