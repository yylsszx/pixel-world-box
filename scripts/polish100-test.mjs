// #100（大幅打磨·阶段一·地形②）单测：地形覆盖物去方块化
// 雪被有机遮罩 / 雪缘楔入 / 森林地被草底斑块 / 软地形有机过渡 / 确定性重绘
// 用法：node scripts/polish100-test.mjs
import { createJiti } from 'jiti';
import path from 'node:path';
const ROOT = '/home/z/my-project/pixel-world-box';
const noop = () => {};
const stubCtx = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return null;
  if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
  if (k === 'measureText') return () => ({ width: 0 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'createPattern') return () => ({});
  return typeof k === 'string' ? noop : undefined;
}, set: () => true });
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const eng = new GameEngine(20260315);
const W = 256;

// 取某格 8×8 子像素（返回 [r,g,b] 数组，按 (sy*8+sx) 排列）
function subpixels(x, y) {
  const d = eng.terrainImg.data;
  const out = [];
  const bx = x * 8, by = y * 8;
  for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) {
    const o = ((by + sy) * W * 8 + bx + sx) * 4;
    out.push([d[o], d[o + 1], d[o + 2]]);
  }
  return out;
}

// ============ 1. 雪被有机遮罩：雪↔草边界不再是直线方块 ============
console.log('[1] 雪被有机遮罩（雪格贴草侧露出地色 + 参差过渡）');
{
  // 造一块干净试验区：6×6 草地，左 3 列改雪 → x=62 右贴草、x=63 左贴雪
  for (let y = 60; y <= 65; y++) for (let x = 60; x <= 65; x++) eng.setTerrain(y * W + x, T.GRASS);
  for (let y = 60; y <= 65; y++) for (let x = 60; x <= 62; x++) eng.setTerrain(y * W + x, T.SNOW);
  eng.flushDirty();
  // 雪格 (62,62) 右缘（sx=6..7）：应有露出地色的暗像素（草 r≈104 远低于雪 r≈228）
  const snowEdge = subpixels(62, 62);
  const darkRight = snowEdge.filter((p, idx) => { const sx = idx % 8; return sx >= 6 && p[0] < 190; }).length;
  ok(darkRight >= 3, `雪格贴草侧右缘露出地色像素 ≥3（实测 ${darkRight}）`);
  // 雪格中部（sx=0..3）应仍以雪为主（亮像素为主）
  const brightInner = snowEdge.filter((p, idx) => { const sx = idx % 8; return sx <= 3 && p[0] > 195; }).length;
  ok(brightInner >= 20, `雪格内侧保持雪被（亮像素 ≥20/32，实测 ${brightInner}）`);
  // 参差感：右缘 16 个子像素中，暗像素数应介于 3~13（既非全露、也非全雪的直线）
  ok(darkRight >= 3 && darkRight <= 13, `右缘参差（暗像素 3~13，实测 ${darkRight}）`);
}

// ============ 2. 雪缘楔入：草格贴雪侧被雪舌不规则伸入 ============
console.log('[2] 雪缘楔入（草格贴雪侧 2-3px 雪舌）');
{
  const grassSide = subpixels(63, 62);
  const snowWedge = grassSide.filter((p, idx) => { const sx = idx % 8; return sx <= 1 && p[0] > 195; }).length;
  ok(snowWedge >= 3, `草格贴雪侧左缘有雪舌像素 ≥3（实测 ${snowWedge}）`);
  // 雪舌只在近缘：远端（sx≥3）不应被雪覆盖
  const farSnow = grassSide.filter((p, idx) => { const sx = idx % 8; return sx >= 3 && p[0] > 195; }).length;
  ok(farSnow <= 2, `雪舌不深入格心（sx≥3 亮像素 ≤2，实测 ${farSnow}）`);
}

// ============ 3. 森林地被去方块：草底 + 树冠荫斑块 ============
console.log('[3] 森林地被（整格深绿方块 → 草底+荫斑块混合）');
{
  for (let y = 70; y <= 75; y++) for (let x = 60; x <= 65; x++) eng.setTerrain(y * W + x, T.FOREST);
  eng.flushDirty();
  const forest = subpixels(62, 72);
  const greens = forest.map((p) => p[1]).sort((a, b) => a - b);
  const minG = greens[0], maxG = greens[greens.length - 1];
  ok(maxG - minG >= 18, `森林地被出现明暗双态（绿通道极差 ≥18，实测 ${maxG - minG}）`);
  const dark = greens.filter((g) => g < (minG + maxG) / 2).length;
  const light = 64 - dark;
  ok(dark >= 12 && light >= 8, `荫斑块/草底混合（暗 ${dark} + 亮 ${light} / 64）`);
}

// ============ 4. 雪原内部无孔洞（全亮，不因遮罩误伤） ============
console.log('[4] 雪原内部完整性');
{
  const inner = subpixels(61, 62); // L/R/T/B 全是雪
  const bright = inner.filter((p) => p[0] > 190).length;
  ok(bright >= 60, `雪原内部 ≥60/64 亮像素（实测 ${bright}）`);
}

// ============ 5. 确定性：同格重绘字节一致 ============
console.log('[5] 确定性重绘（防闪烁铁律）');
{
  const before = subpixels(62, 62).flat();
  const before2 = subpixels(63, 62).flat();
  eng.dirty.add(62 * W + 62); eng.dirty.add(63 * W + 62);
  eng.flushDirty();
  const after = subpixels(62, 62).flat();
  const after2 = subpixels(63 * 0 + 63, 62).flat();
  ok(before.join() === after.join(), '雪缘格重绘一致');
  ok(before2.join() === after2.join(), '草缘格重绘一致');
}

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
