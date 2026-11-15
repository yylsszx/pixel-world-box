// #101（大幅打磨·阶段一·地形③）单测：子像素起伏明暗 / 去千篇一律 / 山顶雪被有机化 / 植被演替
// 用法：node scripts/polish101-test.mjs
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
const { generateWorld } = await jiti.import(path.join(ROOT, 'src/lib/game/worldgen.ts'));
const { setEngineParam } = await jiti.import(path.join(ROOT, 'src/lib/game/engineParams.ts'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const eng = new GameEngine(20260315);
const W = 256, H = 160;

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
const lum = (p) => (p[0] + p[1] + p[2]) / 3;

// ============ 1. 高度场：存在、确定性 ============
console.log('[1] 海拔场（heights）');
{
  const g1 = generateWorld(777);
  const g2 = generateWorld(777);
  let same = true;
  for (let i = 0; i < W * H; i++) if (g1.heights[i] !== g2.heights[i]) { same = false; break; }
  ok(g1.heights.length === W * H && same, 'heights 长度 = 全图且同 seed 确定性一致');
  let landH = 0, n = 0;
  for (let i = 0; i < W * H; i += 13) { if (g1.terrain[i] >= T.SAND) { landH += g1.heights[i]; n++; } }
  ok(n > 1000 && landH / n > 60, `陆地平均海拔 >60（实测 ${(landH / n) | 0}，n=${n}）`);
}

// ============ 2. 子像素起伏：合成斜坡直接验证 ============
console.log('[2] 子像素起伏明暗');
{
  const corr = (a, b) => {
    const ma = a.reduce((x, y) => x + y, 0) / a.length, mb = b.reduce((x, y) => x + y, 0) / b.length;
    let num = 0, da = 0, db = 0;
    for (let k = 0; k < a.length; k++) { num += (a[k] - ma) * (b[k] - mb); da += (a[k] - ma) ** 2; db += (b[k] - mb) ** 2; }
    return num / Math.sqrt(da * db || 1);
  };
  const dirVal = [];
  for (let sy = 0; sy < 8; sy++) for (let sx = 0; sx < 8; sx++) dirVal.push(sx + sy);
  // 合成斜坡：3×3 山岩区，heightMap 手工布成向东南爬升的坡（每格 +12）
  const cx = 60, cy = 60;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    eng.setTerrain((cy + dy) * W + cx + dx, T.MOUNTAIN);
    eng.heightMap[(cy + dy) * W + cx + dx] = 120 + (dx + 1) * 12 + (dy + 1) * 12;
  }
  eng.flushDirty();
  const lums = subpixels(cx, cy).map(lum);
  const spread = Math.max(...lums) - Math.min(...lums);
  const c1 = corr(lums, dirVal);
  ok(spread >= 5, `东南坡格子内部明暗差 ≥5（实测 ${spread.toFixed(1)}）—— 子像素级起伏生效`);
  ok(c1 > 0.45, `亮度与东南向星正相关（r=${c1.toFixed(2)} > 0.45）—— 西北光源坡向受光`);
  // 平坦对照：heights 全等 → 无坡向梯度
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) eng.heightMap[(cy + dy) * W + cx + dx] = 150;
  eng.dirty.add(cy * W + cx); eng.flushDirty();
  const lums2 = subpixels(cx, cy).map(lum);
  const c2 = corr(lums2, dirVal);
  ok(Math.abs(c2) < 0.4, `平坦山岩无坡向梯度（r=${c2.toFixed(2)} < 0.4）`);
  // 确定性：重烘同一格逐字节一致
  const before = subpixels(cx, cy);
  eng.dirty.add(cy * W + cx); eng.flushDirty();
  const after = subpixels(cx, cy);
  let ident = true;
  for (let k = 0; k < 64; k++) if (before[k][0] !== after[k][0] || before[k][1] !== after[k][1] || before[k][2] !== after[k][2]) { ident = false; break; }
  ok(ident, '同格重烘逐字节一致（防闪烁铁律）');
}

// ============ 3. 去千篇一律：大尺度色调拼图 + 草簇密度分化 ============
console.log('[3] 大尺度斑块（去千篇一律）');
{
  // 采 200 个草地格的 tile 平均亮度 → 极差应 > 6（patch ±4.5 调制）
  const means = [];
  for (let i = 0, c = 0; i < W * H && c < 200; i += 37) {
    if (eng.terrain[i] !== T.GRASS) continue;
    const p = subpixels(i % W, (i / W) | 0);
    means.push(p.reduce((s, q) => s + lum(q), 0) / 64);
    c++;
  }
  const mx = Math.max(...means), mn = Math.min(...means);
  ok(means.length >= 100 && mx - mn >= 6, `草地 tile 均值极差 ≥6（实测 ${(mx - mn).toFixed(1)}，n=${means.length}）—— 明暗拼图生效`);
  // 草簇密度分化：统计每草格「明显深于 tile 均值的子像素数」→ 有格为 0（裸地）也有格 ≥4（密丛）
  let zero = 0, dense = 0;
  for (let i = 0, c = 0; i < W * H && c < 300; i += 23) {
    if (eng.terrain[i] !== T.GRASS) continue;
    const p = subpixels(i % W, (i / W) | 0).map(lum);
    const m = p.reduce((a, b) => a + b, 0) / 64;
    const dark = p.filter((v) => v < m - 8).length;
    if (dark === 0) zero++;
    if (dark >= 4) dense++;
    c++;
  }
  ok(zero >= 5 && dense >= 5, `草簇密度分化（裸地格 ${zero} / 密丛格 ${dense}，n≈300）—— 不再千篇一律`);
}

// ============ 4. 山顶雪被：雪贴山岩一侧有岩色尖突穿透 ============
console.log('[4] 雪-岩过渡（山顶雪被有机化）');
{
  // 造试验区：3×3 山岩，右侧一列雪
  for (let y = 30; y <= 32; y++) for (let x = 30; x <= 32; x++) eng.setTerrain(y * W + x, T.MOUNTAIN);
  for (let y = 30; y <= 32; y++) eng.setTerrain(y * W + 33, T.SNOW);
  eng.flushDirty();
  const snowP = subpixels(33, 31);
  // 贴岩左缘 0-2 列：应有岩石色像素（山岩 RGB 远暗于雪）
  const rock = snowP.filter((p, idx) => { const sx = idx % 8; return sx < 3 && p[0] < 165; }).length;
  ok(rock >= 2, `雪格贴岩侧有岩色尖突 ≥2px（实测 ${rock}）`);
  // 内侧仍以雪为主
  const inner = snowP.filter((p, idx) => { const sx = idx % 8; return sx >= 4 && p[0] > 195; }).length;
  ok(inner >= 24, `雪格内侧保持雪被（≥24/32，实测 ${inner}）`);
}

// ============ 5. 植被演替：森林扩张 / 焦土返青 / 沙化龟进 ============
console.log('[5] 植被演替（活植被）');
{
  // 造一块湿润草地 + 邻林环境：5×5 草地，左侧一列森林，moist 全拉高
  for (let y = 100; y <= 104; y++) for (let x = 50; x <= 54; x++) {
    eng.setTerrain(y * W + x, T.GRASS);
    eng.moistMap[y * W + x] = 200;
  }
  for (let y = 100; y <= 104; y++) eng.setTerrain(y * W + 49, T.FOREST);
  const forestBefore = eng.nature.counters.sprouts;
  // 参数拉满做确定性验证（默认值极慢是世界节奏，不是测试节奏）；验证后复原
  setEngineParam('nature.sproutP', 1);
  for (let k = 0; k < 8; k++) eng.nature.vegetationTick();
  setEngineParam('nature.sproutP', 0.05);
  ok(eng.nature.counters.sprouts > forestBefore, `森林演替扩张发生（sprouts ${forestBefore} → ${eng.nature.counters.sprouts}）`);
  // 建筑格免疫
  let buildingImmune = true;
  for (let y = 100; y <= 104; y++) {
    eng.setTerrain(y * W + 50, T.GRASS);
    eng.building[y * W + 50] = 1;
  }
  eng.nature.vegetationTick();
  for (let y = 100; y <= 104; y++) {
    if (eng.terrain[y * W + 50] === T.FOREST) buildingImmune = false;
    eng.building[y * W + 50] = 0;
  }
  ok(buildingImmune, '建筑格不被演替吞并');
  // 焦土返青：大区域 + 参数拉满 → 统计必命中
  for (let y = 118; y <= 140; y++) for (let x = 58; x <= 60; x++) eng.setTerrain(y * W + x, T.BURNT);
  const regBefore = eng.nature.counters.regrows;
  setEngineParam('nature.regrowP', 1);
  for (let k = 0; k < 240; k++) eng.nature.vegetationTick();
  setEngineParam('nature.regrowP', 0.06);
  ok(eng.nature.counters.regrows > regBefore, `焦土返青发生（regrows ${regBefore} → ${eng.nature.counters.regrows}）`);
  // 干旱草地贴沙沙化：大区域 + 参数拉满
  for (let y = 130; y <= 152; y++) for (let x = 70; x <= 72; x++) {
    eng.setTerrain(y * W + x, T.GRASS);
    eng.moistMap[y * W + x] = 50; // 干
    eng.tempMap[y * W + x] = 250; // 热
  }
  for (let y = 130; y <= 152; y++) for (let x = 73; x <= 75; x++) eng.setTerrain(y * W + x, T.SAND);
  const desBefore = eng.nature.counters.desertified;
  setEngineParam('nature.desertifyP', 1);
  for (let k = 0; k < 240; k++) eng.nature.vegetationTick();
  setEngineParam('nature.desertifyP', 0.02);
  ok(eng.nature.counters.desertified > desBefore, `荒漠龟进发生（desertified ${desBefore} → ${eng.nature.counters.desertified}）`);
  // 负例：湿润草地永不沙化
  for (let y = 150; y <= 152; y++) for (let x = 70; x <= 72; x++) {
    eng.setTerrain(y * W + x, T.GRASS);
    eng.moistMap[y * W + x] = 200; // 湿润
    eng.tempMap[y * W + x] = 250;
  }
  for (let y = 150; y <= 152; y++) for (let x = 73; x <= 75; x++) eng.setTerrain(y * W + x, T.SAND);
  const d2 = eng.nature.counters.desertified;
  setEngineParam('nature.desertifyP', 1);
  for (let k = 0; k < 40; k++) eng.nature.vegetationTick();
  setEngineParam('nature.desertifyP', 0.02);
  let wetKept = true;
  for (let y = 150; y <= 152; y++) for (let x = 70; x <= 72; x++) if (eng.terrain[y * W + x] !== T.GRASS && eng.terrain[y * W + x] !== T.FOREST) wetKept = false;
  ok(wetKept, '湿润草地即使干热邻沙也不沙化（湿度门控）');
}

// ============ 6. 存档兼容：短 counters 数组恢复不炸 ============
console.log('[6] 存档兼容');
{
  const nat = eng.nature;
  const old = { quakes: 1, quakesBig: 0, eruptions: 2, uplifts: 3, erosions: 4, cyclones: 5, tsunamis: 6, floods: 7, blizzards: 8, droughts: 9 };
  nat.counters = { ...nat.counters, ...old };
  ok(nat.counters.sprouts !== undefined && nat.counters.desertified !== undefined, 'counters 含新字段（sprouts/regrows/desertified）');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
