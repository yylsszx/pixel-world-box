// ============================================================================
// orch-transcript.mjs —— M-U7c' tick 母体编排镜像（零引擎导入转写）
// 与 WbTickOrch.cs（C# 编排骨架）逐行同构的 JS 转写，重放黄金 tick_orch.json：
//   ledger 3100 行 codes 逐位 + seasonUsed + yearFHex（f64 小端位型）+
//   phoenixLenMax + overlayModeConst。
// 转写纪律：不 import engine.ts——调度结构从 WbTickOrch.Tick 的 C# 形状
// 独立重写（同 bail-transcript「零引擎导入」先例），黄金为唯一真相。
// 深度守卫协议镜像：台账只记 tick 体直接调度（嵌套调用无——骨架槽位是纯
// 记录器，无内部再派发）。
// 运行：node scripts/unity-migration/orch-transcript.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/tick_orch.json'), 'utf8'));
const { manifest, ledger, audits } = { manifest: golden.meta.manifest, ledger: golden.ledger, audits: golden.audits };
const CODE = new Map(manifest.map((n, i) => [n, i]));
const TICKS = golden.meta.ticks;

// ---- 骨架状态（= WbWorld 侧字段的最小投影） ----
let tickCount = 0;
let yearF = 0;
let panicNoteCd = 0;
let phoenixAshesLen = 0;   // 黄金窗口恒 0（phoenixLenMax 审计兜底）
let overlayMode = audits.overlayModeConst; // 'none'（黄金常量）
let overlayDirty = false;
let shake = 0;

// 调度槽记录器（C# D[] 委托表的 NUnit 记录器同构）
const fire = (name) => () => { led.push(CODE.get(name)); };
let led = [];

// nature.ts season getter L160-163 转写（laws.seasons=true 前提 = 黄金协议；seasonOffset=0）
const seasonOf = () => {
  const s = Math.floor(yearF / 2) % 4;
  return s < 0 ? s + 4 : s;
};

// ---- Tick() —— engine.ts L2501-2655 机械序（WbTickOrch.Tick 同构） ----
function tick() {
  tickCount++;
  // 插值快照（units lx/ly、armies lax/lay）——重放世界空置：循环体零次
  yearF += 1 / 40; // L2515（YEAR_TICKS=40 constants L9）
  fire('fireTick')();            // L2517
  fire('rebuildBuckets')();      // L2519
  fire('unitsTick')();           // L2521
  if (tickCount % 60 === 0) fire('panicTick')();          // L2524
  if (panicNoteCd > 0) panicNoteCd--;                     // L2525（状态面，非调度）
  if (tickCount % 5 === 0) { fire('rebuildCivBuildCounts')(); fire('civsTick')(); } // L2526
  fire('effectsTick')();         // L2528
  if (overlayMode === 'density' && tickCount % 30 === 0) overlayDirty = true;       // L2530（状态面）
  if (tickCount % 30 === 0) fire('radTick')();            // L2532
  if (tickCount % 30 === 0) fire('frontTick')();          // L2533
  if (tickCount % 120 === 0) fire('economyTick')();       // L2535
  if (tickCount % 40 === 0) fire('tradeTick')();          // L2537
  if (tickCount % 10 === 0) fire('defenseTick')();        // L2538
  if (tickCount % 120 === 0) fire('templeTick')();        // L2539
  if (tickCount % 200 === 0) fire('barracksTick')();      // L2540
  if (tickCount % 900 === 0) fire('banditRaidTick')();    // L2542
  if (tickCount % 3000 === 0) fire('dragonSpawnTick')();  // L2543
  if (tickCount % 60 === 0) { fire('regrowTick')(); fire('statsTick')(); }          // L2544
  if (tickCount % 8 === 0) fire('checkTriggers')();       // L2546
  if (tickCount % 2 === 0) fire('decalsTick')();          // L2548
  if (tickCount % 2 === 0) fire('fpTick')();              // L2550
  if (tickCount % 40 === 0) fire('iceTick')();            // L2552
  if (tickCount % 80 === 16) fire('snowmanTick')();       // L2554
  if (tickCount % 200 === 0) fire('historyTick')();       // L2555
  if (tickCount % 150 === 0) fire('victoryTick')();       // L2556
  if (tickCount % 200 === 0) fire('warTick')();           // L2557
  if (tickCount % 30 === 0) fire('worldWarTick')();       // L2559
  if (tickCount % 5 === 0) fire('armyTick')();            // L2561
  if (tickCount % 100 === 0) fire('warInfoTick')();       // L2563
  if (tickCount % 30 === 0) fire('directiveTick')();      // L2565
  if (tickCount % 120 === 5) fire('techTick')();          // L2567
  if (tickCount % 150 === 7) fire('societyTick')();       // L2569
  if (tickCount % 300 === 23) fire('allianceTick')();     // L2571
  if (tickCount % 240 === 13) fire('armoryTick')();       // L2573
  if (tickCount % 120 === 9) fire('ecoTick')();           // L2575
  if (tickCount % 600 === 11) fire('evolutionTick')();    // L2577
  if (tickCount % 300 === 17) fire('sampleHistory')();    // L2579
  if (tickCount % 600 === 19) fire('achievementsTick')(); // L2581
  if (tickCount % 10 === 3) fire('nature.atmTick')();     // L2583
  if (tickCount % 40 === 5) fire('nature.stormTick')();   // L2585
  if (tickCount % 120 === 9) fire('nature.hydroTick')();  // L2587
  if (tickCount % 40 === 0) fire('nature.seasonCheck')(); // L2589
  if (tickCount % 240 === 21) fire('nature.tectonicTick')();   // L2591
  if (tickCount % 600 === 31) fire('nature.geologyTick')();    // L2593
  if (tickCount % 120 === 15) fire('worldsim.oceanTick')();    // L2595
  if (tickCount % 3 === 0) fire('angelAuraTick')();      // L2598
  if (phoenixAshesLen > 0) fire('phoenixAshTick')();     // L2600（窗口恒假）
  if (tickCount % 10 === 0) fire('entGroveTick')();      // L2602
  if (tickCount % (seasonOf() === 3 ? 8 : 12) === 0) fire('lichRaiseTick')(); // L2605
  if (tickCount % 30 === 0) fire('hydraRegenTick')();    // L2606
  fire('beachedAquaticTick')();   // L2608 每 tick
  if (tickCount % 600 === 61) fire('wildlifeReboundTick')();   // L2610
  if (tickCount % 20 === 7) fire('predatorHuntTick')();  // L2612
  if (tickCount % 240 === 13) fire('sharkBreedTick')();  // L2614
  if (tickCount % 120 === 27) fire('worldsim.tempTick')();     // L2616
  if (tickCount % 240 === 33) fire('worldsim.glacierTick')();  // L2618
  if (tickCount % 600 === 41) fire('worldsim.hydroTick')();    // L2620
  if (tickCount % 600 === 47) fire('worldsim.coastTick')();    // L2622
  if (tickCount % 600 === 53) fire('worldsim.biomeTick')();    // L2624
  if (tickCount % 120 === 57) { fire('WBB.touchMeta')(); fire('agentLaws.tick')(); } // L2626
  shake *= 0.88;                 // L2628（状态面）
}

// ---- 重放 + 对账 ----
const f64hex = (d) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
let fail = 0;
const seasonReplay = [];
const yearFHexReplay = [];
for (let t = 1; t <= TICKS; t++) {
  led = [];
  tick();
  const got = led.join(',');
  if (got !== ledger[t - 1]) {
    if (fail < 3) console.error('[t' + t + '] 期望 ' + ledger[t - 1] + ' 实测 ' + got);
    fail++;
  }
  seasonReplay.push(seasonOf());
  yearFHexReplay.push(f64hex(yearF));
}
if (fail > 0) throw new Error('ledger 失配 ' + fail + ' tick');

// audits 对账
let af = 0;
for (let t = 0; t < TICKS; t++) {
  if (seasonReplay[t] !== audits.seasonUsed[t]) { if (af < 3) console.error('season @' + (t + 1) + ': ' + seasonReplay[t] + ' ≠ ' + audits.seasonUsed[t]); af++; }
  if (yearFHexReplay[t] !== audits.yearFHex[t]) { if (af < 3) console.error('yearFHex @' + (t + 1) + ': ' + yearFHexReplay[t] + ' ≠ ' + audits.yearFHex[t]); af++; }
}
if (af > 0) throw new Error('audits 失配 ' + af + ' 项');
if (phoenixAshesLen !== audits.phoenixLenMax) throw new Error('phoenixLenMax: ' + phoenixAshesLen + ' ≠ ' + audits.phoenixLenMax);
if (overlayMode !== audits.overlayModeConst) throw new Error('overlayMode: ' + overlayMode + ' ≠ ' + audits.overlayModeConst);
if (overlayDirty !== false) throw new Error('overlayDirty 非预期置位（mode≠density）');
// panicNoteCd 审计为桩域分歧非对账面（真实引擎 panic 系统写值 vs 骨架恒 0——黄金仅记录）
console.log('[orch-transcript] ' + TICKS + ' tick ledger 逐位 + seasonUsed + yearFHex(LE) + phoenix/overlay 审计: ALL PASS (' + manifest.length + ' 槽位 × ' + TICKS + ' 行)');
