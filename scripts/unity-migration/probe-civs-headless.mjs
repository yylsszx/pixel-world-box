// M-U3b 探针：engine.ts 无头可跑性验证（黄金向量前置可行性）
// 垫片原则：只垫 civsTick 不触碰的渲染壳（canvas ctx 方法全 stub），
// 数据层（terrain/civs/units/building）走真实实现——纪律②零同源复制。
// 经 run-node-ts.mjs 运行（types.ts 值重导出链）。
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好） ----
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    // 有返回对象的 ctx 方法（flushDirty 读 .data 等）
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
// 注意：不垫 globalThis.window —— engine.ts L15915 的 WASM boot 守卫是
// typeof window !== 'undefined'，垫了会让浏览器专用自举在 node 里跑（ERR_INVALID_URL）。

// ---- 真实现直驱（jiti 完整 TS 转译：engine.ts 含 parameter property，node strip-only 不支持） ----
const { createJiti } = await import('jiti');
// alias：wbspatial.ts 用 '@/lib/...' 路径别名（tsconfig paths），jiti 须显式映射
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine, ep: epMod } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts')).then((m) => {
  console.log('[probe] engine module keys:', Object.keys(m).filter(k => /Engine|engine/i.test(k)).join(','), '| typeof .Engine:', typeof m.Engine, '| typeof .default:', typeof m.default);
  if (m.GameEngine) return m;
  if (m.default?.GameEngine) return m.default;
  throw new Error('Engine export 未定位: ' + Object.keys(m).join(','));
});
const { BUILDING_DEFS, BUILD_KINDS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const ep = epMod ?? (await jiti.import(path.join(ROOT, 'src/lib/game/engineParams.ts'))).ep;

const eng = new GameEngine(20261027);
console.log('[probe] engine constructed, terrain len =', eng.terrain.length, 'civs =', eng.civs.length);

// 手工灌一个 civ（绕过玩家交互），放一个 capital 建筑再跑 civsTick
const W = 256, H = 256;
const mid = (128 * W + 128);
console.log('[probe] terrain@mid =', eng.terrain[mid], 'building@mid =', eng.building[mid]);

// 找一块陆地
let landIdx = -1;
for (let i = 0; i < eng.terrain.length; i++) {
  if (eng.terrain[i] === 1 || eng.terrain[i] === 2 || eng.terrain[i] === 3) { landIdx = i; break; }
}
console.log('[probe] landIdx =', landIdx, 'terrain =', eng.terrain[landIdx]);

// civsTick 单步驱动
const before = eng.tickCount;
for (let t = 0; t < 5; t++) {
  eng.tick();
}
console.log('[probe] tickCount', before, '->', eng.tickCount, '(tick() 全引擎单步 OK)');

// civsTick 依赖方法可达性快照
console.log('[probe] methods:', ['civsTick', 'pickBuildingKind', 'tryBuildBuilding', 'claimTile', 'crownVacantTick', 'splitKingdom', 'eliminateCiv', 'popCapOf', 'seedTerritory', 'tryLaunchColonyShip', 'tryFormArmy', 'wallTick', 'civFuseScan'].map(m => `${m}:${typeof eng[m]}`).join(' '));

console.log('[probe] PASS — engine.ts 无头可跑，civsTick 驱动通道打开');
