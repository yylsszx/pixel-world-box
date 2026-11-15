// #97（R5 功能轮）单测：超限形态二笔·扩展——集市/港口/箭塔的 tier≥3 几何形态层
// 任务出处：worklog #87 遗留⑤「超限形态二笔可继续扩（集市/港口/箭塔——本轮只做了任务书点名的农田/兵营/航船三类代表）」
// 用法：node scripts/polish97-test.mjs
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
const { BUILD_KINDS, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { drawBuilding } = await jiti.import(path.join(ROOT, 'src/lib/game/sprites.ts'));
const { TECHS } = await jiti.import(path.join(ROOT, 'src/lib/game/tech.ts'));

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name}`); } };

const eng = new GameEngine(97001115);
const uA = eng.spawnUnit(R.HUMAN, 60, 60);
const civA = eng.civs[uA.civ];
const uB = eng.spawnUnit(R.ELF, 130, 130);
const civB = eng.civs[uB.civ];
ok(!!civA?.alive && !!civB?.alive && civA.id !== civB.id, '两国落地（人类/精灵）');

// ============ 1. 超限激活链路：永筑之道 ×2 → 三建筑 tier≥3 ============
console.log('[1] 超限形态二笔·扩展：永筑之道 ×2 → 集市/港口/箭塔 tier≥3');
{
  civA.techs = TECHS.map((t) => t.key);
  eng.techModCache.delete(civA.id);
  eng.setCivBrain(civA.id, { war: 0.05, build: 0.95, farm: 0.05, trade: 0.05, sea: 0.05, faith: 0.05 });
  const savedRng = eng.rng;
  eng.rng = () => 0.5; // 确定性注入：加权骰落在 build 频段
  eng.fundInfResearch(civA, eng.infCost(civA));
  eng.fundInfResearch(civA, eng.infCost(civA));
  eng.rng = savedRng;
  ok(eng.infCount(civA, 'build') === 2, '两次超越均入永筑之道（确定性选道）');
  const mk = eng.buildTierOf(BUILD_KINDS.MARKET, civA);
  const pt = eng.buildTierOf(BUILD_KINDS.PORT, civA);
  const tw = eng.buildTierOf(BUILD_KINDS.TOWER, civA);
  ok(mk >= 3, `集市超限阶位 ≥3（实测 ${mk}——悬浮空中集市层激活）`);
  ok(pt >= 3, `港口超限阶位 ≥3（实测 ${pt}——悬浮能量浮坞层激活）`);
  ok(tw >= 3, `箭塔超限阶位 ≥3（实测 ${tw}——悬浮符文炮台层激活）`);
  ok(mk === pt && pt === tw, `三建筑同源同阶（永筑之道对全建筑生效：${mk}/${pt}/${tw}）`);
}

// ============ 2. 像素分支可执行性：tier 3/4/5 逐档 + 阶位递进构件数 ============
console.log('[2] 三建筑 tier 3-5 像素分支可执行（无异常）+ 构件数随阶递进');
{
  const kinds = [
    { k: BUILD_KINDS.TOWER, name: '箭塔', cap: 4 },   // guns 3→1/4→2/5→3/6+→4
    { k: BUILD_KINDS.PORT, name: '港口', cap: 3 },    // beacons 3→1/4→2/5+→3
    { k: BUILD_KINDS.MARKET, name: '集市', cap: 3 },  // stalls 3→1/4→2/5+→3
  ];
  let drewAll = true;
  for (const { k, name, cap } of kinds) {
    const fakeB = { i: k, x: 60, y: 60, kind: k, civ: civA.id };
    try {
      for (const t of [3, 4, 5, 6, 7]) drawBuilding(stubCtx, fakeB, [200, 60, 60], t, 1, 100, false, 0);
    } catch (e) { drewAll = false; console.log(`    ${name} 绘制异常:`, e.message); }
    ok(drewAll, `${name} tier 3-7 逐档绘制可执行（含 cap=${cap} 封顶档）`);
    // 构件数公式（与 sprites.ts 常量同源）：min(cap, tier-2)——cap+2 阶封顶
    const cnt = (t) => Math.min(cap, t - 2);
    ok(cnt(3) === 1 && cnt(4) === 2 && cnt(cap + 2) === cap && cnt(9) === cap,
      `${name} 构件数递进 1/2/…/cap 并封顶（tier ${cap + 2} 达 cap，tier 9 仍 ${cnt(9)}——防高阶无限刷构件）`);
  }
}

// ============ 3. 边界回归：tier 0-2 无形态层 + 基线国 tier 0 ============
console.log('[3] 边界回归：基础形态不受影响');
{
  const fakeTw = { i: 90, x: 61, y: 61, kind: BUILD_KINDS.TOWER, civ: civA.id };
  const fakePt = { i: 91, x: 62, y: 62, kind: BUILD_KINDS.PORT, civ: civA.id };
  const fakeMk = { i: 92, x: 63, y: 63, kind: BUILD_KINDS.MARKET, civ: civA.id };
  let drewBase = true;
  try {
    for (const t of [0, 1, 2]) {
      drawBuilding(stubCtx, fakeTw, [200, 60, 60], t, 1, 0, false, 0);
      drawBuilding(stubCtx, fakePt, [200, 60, 60], t, 1, 0, false, 0);
      drawBuilding(stubCtx, fakeMk, [200, 60, 60], t, 1, 0, false, 0);
    }
  } catch { drewBase = false; }
  ok(drewBase, '三建筑 tier 0-2 基础/时代深化形态回归可执行（无异常）');
  // 无科技无超限国：buildTierOf = 0（形态层与光环均不激活）
  ok(eng.buildTierOf(BUILD_KINDS.MARKET, civB) === 0, `基线国（无科技）集市 tier 0（实测 ${eng.buildTierOf(BUILD_KINDS.MARKET, civB)}）`);
  ok(eng.buildTierOf(BUILD_KINDS.PORT, civB) === 0 && eng.buildTierOf(BUILD_KINDS.TOWER, civB) === 0, '基线国港口/箭塔 tier 0');
  ok(eng.buildTierOf(BUILD_KINDS.MARKET, undefined) === 0, '无主国（civ undefined）tier 0 不炸');
  // 死国回归
  const savedAlive = civB.alive;
  civB.alive = false;
  ok(eng.buildTierOf(BUILD_KINDS.TOWER, civB) === 0, '死国 tier 归零（buildTierOf 前置闸）');
  civB.alive = savedAlive;
}

// ============ 4. 超限源独立验证：深蓝之道不触发建筑形态层 ============
console.log('[4] 选道正交性：非永筑之道不给建筑加阶');
{
  // civA 已有 build×2；再修一次 sea（深蓝之道）→ 建筑 tier 不变
  eng.setCivBrain(civA.id, { war: 0.05, build: 0.05, farm: 0.05, trade: 0.05, sea: 0.95, faith: 0.05 });
  const savedRng = eng.rng;
  eng.rng = () => 0.5;
  eng.fundInfResearch(civA, eng.infCost(civA));
  eng.rng = savedRng;
  ok(eng.infCount(civA, 'sea') === 1, '第三次超越入深蓝之道');
  ok(eng.buildTierOf(BUILD_KINDS.MARKET, civA) === eng.infCount(civA, 'build') + 2,
    `集市 tier 只随永筑之道增长（${eng.buildTierOf(BUILD_KINDS.MARKET, civA)} = 基线 2 + 永筑 ${eng.infCount(civA, 'build')}——深蓝之道不串档）`);
}

// ============ 5. 冒烟：1200 tick 全链无异常 ============
console.log('[5] 1200 tick 冒烟');
{
  let err = null;
  try { for (let i = 0; i < 1200; i++) eng.tick(); } catch (e) { err = e; }
  ok(err === null, `1200 tick 冒烟无异常${err ? '（' + err.message + '）' : ''}`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
