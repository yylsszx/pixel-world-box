// ============================================================================
// probe-river-seed.mjs —— M-U20 applyTool case "river" runtime 语义切换种子标定
//   蓝本 engine.ts carveRiver L12312-12420 + setTerrain 级联 L975-1013 +
//   applyTool case 'river' L13354-13356（this.carveRiver(wx, wy)）。
//   S15 判据（runtime 级联可夹具面）：reached 入海 + 火墙 9 格全灭（L997）+
//   regrow 删减（L985）+ owner 清除（L1000-1003）+ flood 删（L990 灌溉支）+
//   绿洲 SAND/BURNT→GRASS（L12403）+ 成林门 ≥1（L12404）+ fx spawn（L12385）。
//   注：ICE prev===ICE→frozen.delete 面 fixture 不可注入（直写相无 frozen）——
//   由 iceAge/blizzard 切片覆盖；引擎复用重置面与 gen buildScenario 手术一等价，
//   命中种子最终以 gen-tool3 新鲜引擎 det 双跑为准。
//   ⚠ baseSeed 必须与 gen S15 baseSeed 一致（20261216）——soilF 派生自 generate(baseSeed)，
//   不同 baseSeed 的 soilMulAt 差异 → 成林门命中差异 → 掷流分配漂移 → 异路径（同值序列异用途实证）。
// 运行：bun scripts/unity-migration/probe-river-seed.mjs
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
const { T } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const idx = (x, y) => y * W + x;
const rect = (x0, y0, x1, y1, t) => [...(() => { const a = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a.push([x, y, t]); return a; })()];

// S15 夹具
const TERRAIN = [
  ...rect(0, 52, 5, 68, T.WATER),                 // 西侧水池（入海终点）
  ...rect(12, 59, 14, 61, T.SAND),                // 绿洲沙地（灌溉 → GRASS）
  [15, 59, T.BURNT], [15, 61, T.BURNT],           // 焦土绿洲支
  [24, 58, T.MOUNTAIN], [24, 62, T.MOUNTAIN],     // 绕山（刻蚀 skip + BFS dist 门）
];
const FIRE = [[18, 60, 100], [18, 59, 100], [18, 61, 100], [19, 60, 100], [19, 59, 100], [19, 61, 100], [17, 60, 100], [17, 59, 100], [17, 61, 100]];   // 3×3 火墙
const REGROW = [[20, 60, 1500], [22, 60, 1500], [24, 60, 1500], [20, 62, 1500]];
const OWNER = [[26, 60, 3], [26, 59, 3]];
const FLOOD = [[18, 58, 2000], [20, 58, 2000]];

// 引擎复用（一次 worldgen；per-seed 手术重置 = gen buildScenario 全量面）
const eng = new GameEngine(20261216);   // = BASE + 15（gen-tool3 S15 baseSeed 同源——soilF 派生面必须一致：soilMulAt 差异即成林门差异即掷流分配漂移）
const SOIL_SNAP = new Uint8Array(eng.worldsim.soilF);   // onTerrainChanged 若改 soilF——per-seed 还原保 soilMulAt 一致

function reset(seed) {
  eng.terrain.fill(T.GRASS);
  eng.tempMap.fill(0); eng.fire.fill(0); eng.fireSet.clear(); eng.frozen.clear();
  eng.flood.clear(); eng.wet.clear(); eng.regrow.clear();
  eng.effects.length = 0; eng.worldEvents.length = 0; eng.eventSeq = 1;
  eng.owner.fill(-1); eng.road.fill(0); eng.riverDir.fill(0); eng.riverTiles.clear();
  eng.waterTier.fill(0); eng.worldsim.glacier.fill(0); eng.dirty.clear();
  eng.worldsim.soilF.set(SOIL_SNAP);
  eng.toastSeq = 1;                                  // engine L181/L927 初值 1（fresh 语义）
  eng.tickCount = 1000; eng.shake = 0; eng.brush = 3;
  for (const [x, y, t] of TERRAIN) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of OWNER) eng.owner[idx(x, y)] = v;
  for (const [x, y, at] of REGROW) eng.regrow.set(idx(x, y), at);
  for (const [x, y, at] of FLOOD) eng.flood.set(idx(x, y), at);
  for (const [x, y, v] of FIRE) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });
  eng.rngA = seed >>> 0;
  return toasts;
}

function check(toasts) {
  if (!toasts.some((t) => t.text === '一条大河蜿蜒入海')) return false;   // reached 入海支
  if (eng.fireSet.size !== 0) return false;                              // 火墙 9 格全灭（路径穿 3×3）
  if (eng.regrow.size >= 4) return false;                                // regrow 删减（≥1 删）
  if (eng.owner[idx(26, 60)] !== -1 && eng.owner[idx(26, 59)] !== -1) return false;   // owner 清除支
  if (eng.flood.size !== 0) return false;                                // flood 删（灌溉 GRASS 支）
  let forest = 0;                                                        // 成林门 ≥1（走廊扫描）
  for (let y = 50; y <= 70; y++) for (let x = 5; x <= 30; x++) if (eng.terrain[idx(x, y)] === T.FOREST) forest++;
  if (forest < 1) return false;
  if (!eng.effects.some((e) => e.kind === 'spawn')) return false;        // fx spawn 尾面
  return true;
}

const hits = [];
for (let seed = 1; seed <= 60000 && hits.length < 3; seed++) {
  const toasts = reset(seed);
  eng.applyTool('river', 30, 60);
  if (check(toasts)) hits.push(seed);
}
console.log('S15 river-runtime 种子:', hits.map((s) => '0x' + (s >>> 0).toString(16).toUpperCase().padStart(8, '0')).join(' '), `(${hits.length} 命中)`);
if (hits.length) {
  const toasts = reset(hits[0]);
  eng.applyTool('river', 30, 60);
  const path = [];
  for (let y = 50; y <= 70; y++) for (let x = 0; x <= 40; x++) if (eng.riverTiles.has(idx(x, y))) path.push([x, y]);
  console.log('路径格数:', path.length, '样本:', JSON.stringify(path.slice(0, 12)));
  console.log('toasts:', JSON.stringify(toasts));
  console.log('events:', JSON.stringify(eng.worldEvents.map((e) => ({ k: e.kind, t: e.text }))));
  console.log('fx:', JSON.stringify(eng.effects.map((e) => ({ k: e.kind, seed: e.seed }))));
}
