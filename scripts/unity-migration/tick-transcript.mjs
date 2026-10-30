// tick-transcript.mjs — M-U7c tick() 编排层独立转写对账台：蓝本 engine.ts L2501-2649 调度表
// 纯模运算重放（零 engine 导入）——对照 golden/tick.json（gen-tick.mjs 引擎实录），逐位 ALL PASS
// 才算蓝本双通道一致（bail-transcript 先例：实录侧防 dump 逻辑错、转写侧防 patch 系统性偏差）。
// 蓝本锚逐行：每行注释标 engine.ts 行号。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}

// 调度表：[蓝本行号, trace 名, 门谓词(t,tickCount,setup)]——顺序即 tick 体内出现序
// 每对多 trace 名的项表示蓝本同一 if 内多调用（L2526/L2544/L2626）
const SCHEDULE = [
  [2517, ['fireTick'], () => true],
  [2519, ['rebuildBuckets'], () => true],
  [2521, ['unitsTick'], () => true],
  [2524, ['panicTick'], (tc) => tc % 60 === 0],
  [2526, ['rebuildCivBuildCounts', 'civsTick'], (tc) => tc % 5 === 0],
  [2528, ['effectsTick'], () => true],
  [2532, ['radTick'], (tc) => tc % 30 === 0],
  [2533, ['frontTick'], (tc) => tc % 30 === 0],
  [2535, ['economyTick'], (tc) => tc % 120 === 0],
  [2537, ['tradeTick'], (tc) => tc % 40 === 0],
  [2538, ['defenseTick'], (tc) => tc % 10 === 0],
  [2539, ['templeTick'], (tc) => tc % 120 === 0],
  [2540, ['barracksTick'], (tc) => tc % 200 === 0],
  [2542, ['banditRaidTick'], (tc) => tc % 900 === 0],
  [2543, ['dragonSpawnTick'], (tc) => tc % 3000 === 0],
  [2544, ['regrowTick', 'statsTick'], (tc) => tc % 60 === 0],
  [2546, ['checkTriggers'], (tc) => tc % 8 === 0],
  [2548, ['decalsTick'], (tc) => tc % 2 === 0],
  [2550, ['fpTick'], (tc) => tc % 2 === 0],
  [2552, ['iceTick'], (tc) => tc % 40 === 0],
  [2554, ['snowmanTick'], (tc) => tc % 80 === 16],
  [2555, ['historyTick'], (tc) => tc % 200 === 0],
  [2556, ['victoryTick'], (tc) => tc % 150 === 0],
  [2557, ['warTick'], (tc) => tc % 200 === 0],
  [2559, ['worldWarTick'], (tc) => tc % 30 === 0],
  [2561, ['armyTick'], (tc) => tc % 5 === 0],
  [2563, ['warInfoTick'], (tc) => tc % 100 === 0],
  [2565, ['directiveTick'], (tc) => tc % 30 === 0],
  [2567, ['techTick'], (tc) => tc % 120 === 5],
  [2569, ['societyTick'], (tc) => tc % 150 === 7],
  [2571, ['allianceTick'], (tc) => tc % 300 === 23],
  [2573, ['armoryTick'], (tc) => tc % 240 === 13],
  [2575, ['ecoTick'], (tc) => tc % 120 === 9],
  [2577, ['evolutionTick'], (tc) => tc % 600 === 11],
  [2579, ['sampleHistory'], (tc) => tc % 300 === 17],
  [2581, ['achievementsTick'], (tc) => tc % 600 === 19],
  [2583, ['nature.atmTick'], (tc) => tc % 10 === 3],
  [2585, ['nature.stormTick'], (tc) => tc % 40 === 5],
  [2587, ['nature.hydroTick'], (tc) => tc % 120 === 9],
  [2589, ['nature.seasonCheck'], (tc) => tc % 40 === 0],
  [2591, ['nature.tectonicTick'], (tc) => tc % 240 === 21],
  [2593, ['nature.geologyTick'], (tc) => tc % 600 === 31],
  [2595, ['worldsim.oceanTick'], (tc) => tc % 120 === 15],
  [2598, ['angelAuraTick'], (tc) => tc % 3 === 0],
  [2600, ['phoenixAshTick'], (tc, tc2, setup) => (setup.ashes?.length ?? 0) > 0],
  [2602, ['entGroveTick'], (tc) => tc % 10 === 0],
  [2605, ['lichRaiseTick'], (tc, tc2, setup) => tc % seasonGate(setup) === 0],
  [2606, ['hydraRegenTick'], (tc) => tc % 30 === 0],
  [2608, ['beachedAquaticTick'], () => true],
  [2610, ['wildlifeReboundTick'], (tc) => tc % 600 === 61],
  [2612, ['predatorHuntTick'], (tc) => tc % 20 === 7],
  [2614, ['sharkBreedTick'], (tc) => tc % 240 === 13],
  [2616, ['worldsim.tempTick'], (tc) => tc % 120 === 27],
  [2618, ['worldsim.glacierTick'], (tc) => tc % 240 === 33],
  [2620, ['worldsim.hydroTick'], (tc) => tc % 600 === 41],
  [2622, ['worldsim.coastTick'], (tc) => tc % 600 === 47],
  [2624, ['worldsim.biomeTick'], (tc) => tc % 600 === 53],
  [2626, ['WBB.touchMeta', 'agentLaws.tick'], (tc) => tc % 120 === 57],
];

// nature.season getter（nature.ts L160-163）+ SEASON_YEARS=2 + 同序 yearF 累加（engine L2515）
function seasonOf(yearF, setup) {
  const seasonOffset = setup.seasonOffset ?? 0;
  const s = Math.floor(yearF / 2 + seasonOffset) % 4;
  return s < 0 ? s + 4 : s;
}
// L2605 门：season 用当前 yearF（本次累加已在 simScen L2515 段先于调度完成并写入 seasonCache）
function seasonGate(setup) {
  return seasonCache === 3 ? 8 : 12;
}
let seasonCache = 0;

function simScen(sc) {
  let tickCount = 0, yearF = 0, panicNoteCd = sc.setup.panicNoteCd0 ?? 0;
  let overlayDirty = sc.setup.overlayDirty;
  const ashes = (sc.setup.ashes ?? []).slice();
  const trace = [];
  for (let i = 0; i < sc.ticks; i++) {
    // L2503
    tickCount++;
    // L2506-2509 units lx/ly 快照（空列表零循环，无 trace）；L2511-2514 armies 同
    // L2515
    yearF += 1 / 40;
    seasonCache = seasonOf(yearF, sc.setup); // L2605 读取点在调度中段——yearF 已含本次累加（L2515 先于全部调度）
    for (const [line, names, gate] of SCHEDULE) {
      if (!gate(tickCount, tickCount, sc.setup)) continue;
      for (const n of names) trace.push(`${n}@${tickCount}`);
    }
    // L2525（panicTick 门之后）
    if (panicNoteCd > 0) panicNoteCd--;
    // L2531
    if (sc.setup.overlayMode === 'density' && tickCount % 30 === 0) overlayDirty = true;
    // L2627
    // shake *= 0.88 —— 0 恒 0，无 trace
  }
  return {
    name: sc.name,
    setup: sc.setup,
    ticks: sc.ticks,
    trace,
    post: {
      tickCount,
      yearF: f64hex(yearF),
      shake: 0,
      panicNoteCd,
      units: 0,
      fires: 0,
      overlayDirty,
    },
  };
}
// ---------------- 对照 golden ----------------
const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/tick.json'), 'utf8'));
let fail = 0;
for (let k = 0; k < golden.scens.length; k++) {
  const g = golden.scens[k];
  const t = simScen(g);
  const gt = JSON.stringify(g.trace), tt = JSON.stringify(t.trace);
  if (gt !== tt) {
    fail++;
    const a = g.trace, b = t.trace;
    let d = 0; while (d < a.length && d < b.length && a[d] === b[d]) d++;
    console.error(`[FAIL] ${g.name}: trace diverge at ${d} golden=${a[d]} transcript=${b[d]} (len ${a.length} vs ${b.length})`);
  } else if (JSON.stringify(g.post) !== JSON.stringify(t.post)) {
    fail++;
    console.error(`[FAIL] ${g.name}: post golden=${JSON.stringify(g.post)} transcript=${JSON.stringify(t.post)}`);
  } else {
    console.log(`[PASS] ${g.name}: ${t.trace.length} trace lines + post 逐位`);
  }
}
if (fail > 0) { console.error(`[TRANSCRIPT FAIL] ${fail}/${golden.scens.length} scens`); process.exit(1); }
console.log(`[TRANSCRIPT PASS] ${golden.scens.length}/${golden.scens.length} scens 逐位一致（调度表 58 项蓝本行号锚）`);
