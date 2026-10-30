// ============================================================================
// gen-tick-orch.mjs —— M-U7c' 切片「engine.tick() 母体编排」黄金向量
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），插桩导出
// 3100 tick 的调度台账（dispatch ledger）——对账面 = tick 体 61 个直接调度点
// 的触发序列（深度守卫协议：嵌套内部调用双侧不记——worldWarTick→statsTick
// engine L8485 先例；C# 调度骨架与 TS 逐行同构）。
//
// 协议要点：
//   ① 深度守卫：wrapper 仅在 inTick && depth===0 时记账（tick 体直接调度面）
//   ② 算术镜像自检：节律表 (mod,phase) 纯算术重推每 tick 期望序列，
//      与插桩实测逐 tick 全等断言（防 wrapper 漏记/重记/错序）
//   ③ 审计三件：seasonUsed（yearF f64hex 逐 tick，lich 条件对账面）、
//      phoenixLenMax（恒 0 窗口实证）、panicNoteCd（桩域分歧非对账面，仅记录）
//   ④ lich 节律 season===3?8:12：season = floor(yearF/2)%4（nature.ts L160-163
//      getter；SEASON_YEARS=2，offset 0）——yearF 双精度累加与 C# 同序同构
//
// 运行：node scripts/unity-migration/gen-tick-orch.mjs
// 输出：scripts/unity-migration/golden/tick_orch.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tick_orch.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 probe-civs-headless.mjs 原则） ----
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
// 原型归属模块（engine 先载入缓存，循环 import 安全）
const { NatureSystem } = await jiti.import(path.join(ROOT, 'src/lib/game/nature.ts'));
const { WorldSim } = await jiti.import(path.join(ROOT, 'src/lib/game/worldsim.ts'));
const { AgentLawSystem } = await jiti.import(path.join(ROOT, 'src/lib/game/agentLaws.ts'));
const wbsp = await jiti.import(path.join(ROOT, 'src/lib/wasm/wbspatial.ts'));

const SEED = 20261029;
const TICKS = 3100; // 覆盖 %900（banditRaid@900）与 %3000（dragonSpawn@3000）全部节律

// ---- 台账 manifest：蓝本调度序（engine.ts L2501-2655 逐行） ----
const MANIFEST = [
  'fireTick',            // L2517
  'rebuildBuckets',      // L2519
  'unitsTick',           // L2521
  'panicTick',           // L2524 %60===0
  'rebuildCivBuildCounts', // L2526 %5===0 前半
  'civsTick',            // L2526 %5===0 后半
  'effectsTick',         // L2528
  'radTick',             // L2532 %30===0
  'frontTick',           // L2533 %30===0
  'economyTick',         // L2535 %120===0
  'tradeTick',           // L2537 %40===0
  'defenseTick',         // L2538 %10===0
  'templeTick',          // L2539 %120===0
  'barracksTick',        // L2540 %200===0
  'banditRaidTick',      // L2542 %900===0
  'dragonSpawnTick',     // L2543 %3000===0
  'regrowTick',          // L2544 %60===0 前半
  'statsTick',           // L2544 %60===0 后半
  'checkTriggers',       // L2546 %8===0
  'decalsTick',          // L2548 %2===0
  'fpTick',              // L2550 %2===0
  'iceTick',             // L2552 %40===0
  'snowmanTick',         // L2554 %80===16
  'historyTick',         // L2555 %200===0
  'victoryTick',         // L2556 %150===0
  'warTick',             // L2557 %200===0
  'worldWarTick',        // L2559 %30===0
  'armyTick',            // L2561 %5===0
  'warInfoTick',         // L2563 %100===0
  'directiveTick',       // L2565 %30===0
  'techTick',            // L2567 %120===5
  'societyTick',         // L2569 %150===7
  'allianceTick',        // L2571 %300===23
  'armoryTick',          // L2573 %240===13
  'ecoTick',             // L2575 %120===9
  'evolutionTick',       // L2577 %600===11
  'sampleHistory',       // L2579 %300===17
  'achievementsTick',    // L2581 %600===19
  'nature.atmTick',      // L2583 %10===3
  'nature.stormTick',    // L2585 %40===5
  'nature.hydroTick',    // L2587 %120===9
  'nature.seasonCheck',  // L2589 %40===0
  'nature.tectonicTick', // L2591 %240===21
  'nature.geologyTick',  // L2593 %600===31
  'worldsim.oceanTick',  // L2595 %120===15
  'angelAuraTick',       // L2598 %3===0
  'phoenixAshTick',      // L2600 phoenixAshes.length>0
  'entGroveTick',        // L2602 %10===0
  'lichRaiseTick',       // L2605 %(season===3?8:12)===0
  'hydraRegenTick',      // L2606 %30===0
  'beachedAquaticTick',  // L2608 每 tick
  'wildlifeReboundTick', // L2610 %600===61
  'predatorHuntTick',    // L2612 %20===7
  'sharkBreedTick',      // L2614 %240===13
  'worldsim.tempTick',   // L2616 %120===27
  'worldsim.glacierTick', // L2618 %240===33
  'worldsim.hydroTick',  // L2620 %600===41
  'worldsim.coastTick',  // L2622 %600===47
  'worldsim.biomeTick',  // L2624 %600===53
  'WBB.touchMeta',       // L2626 %120===57 前半
  'agentLaws.tick',      // L2626 %120===57 后半
];
const CODE = new Map(MANIFEST.map((n, i) => [n, i]));

// ---- 插桩（深度守卫协议） ----
let inTick = false;
let depth = 0;
let cur = null;
const ledger = [];          // 每 tick：名字数组（后转 codes 串）
const seasonUsed = [];      // 每 tick 后：nature.season（lich 条件对账面）
const panicNoteCdPre = [];  // 每 tick 前：panicNoteCd（桩域分歧非对账面，仅记录）
let phoenixLenMax = 0;
let overlayModeConst = null;

const wrap = (obj, key, recordName, method) => {
  // key = 引擎实际派发的属性名（原型方法名/单例方法名）；recordName = 台账 manifest 名。
  // 教训：包装器必须装在真实 key 上（首版装在 'nature.atmTick' 带点键上——引擎调
  // this.nature.atmTick() 解析的是原型 'atmTick'，插桩 14 点全部静默失联）。
  obj[key] = function (...args) {
    const rec = inTick && depth === 0;
    if (rec) {
      if (!CODE.has(recordName)) throw new Error('台账外调用: ' + recordName);
      cur.push(recordName);
    }
    depth++;
    try { return method.apply(this, args); }
    finally { depth--; }
  };
};

// tick 本体包裹：开新缓冲 + inTick 门
{
  const origTick = GameEngine.prototype.tick;
  GameEngine.prototype.tick = function (...args) {
    cur = [];
    ledger.push(cur);
    panicNoteCdPre.push(this.panicNoteCd);
    if (this.phoenixAshes.length > phoenixLenMax) phoenixLenMax = this.phoenixAshes.length;
    if (overlayModeConst === null) overlayModeConst = this.overlayMode;
    else if (overlayModeConst !== this.overlayMode) throw new Error('overlayMode 变异: ' + this.overlayMode);
    inTick = true;
    depth = 0;
    try { return origTick.apply(this, args); }
    finally {
      inTick = false;
      seasonUsed.push(this.nature.season);
    }
  };
}
// 引擎方法（47）
for (const n of ['fireTick', 'rebuildBuckets', 'unitsTick', 'panicTick', 'rebuildCivBuildCounts', 'civsTick',
  'effectsTick', 'radTick', 'frontTick', 'economyTick', 'tradeTick', 'defenseTick', 'templeTick', 'barracksTick',
  'banditRaidTick', 'dragonSpawnTick', 'regrowTick', 'statsTick', 'checkTriggers', 'decalsTick', 'fpTick',
  'iceTick', 'snowmanTick', 'historyTick', 'victoryTick', 'warTick', 'worldWarTick', 'armyTick', 'warInfoTick',
  'directiveTick', 'techTick', 'societyTick', 'allianceTick', 'armoryTick', 'ecoTick', 'evolutionTick',
  'sampleHistory', 'achievementsTick', 'angelAuraTick', 'phoenixAshTick', 'entGroveTick', 'lichRaiseTick',
  'hydraRegenTick', 'beachedAquaticTick', 'wildlifeReboundTick', 'predatorHuntTick', 'sharkBreedTick']) {
  wrap(GameEngine.prototype, n, n, GameEngine.prototype[n]);
}
// nature（6）/ worldsim（6）/ agentLaws（1）/ WBB（1）——真实 key 安装 + 台账名记账
for (const n of ['atmTick', 'stormTick', 'hydroTick', 'seasonCheck', 'tectonicTick', 'geologyTick'])
  wrap(NatureSystem.prototype, n, 'nature.' + n, NatureSystem.prototype[n]);
for (const n of ['oceanTick', 'tempTick', 'glacierTick', 'hydroTick', 'coastTick', 'biomeTick'])
  wrap(WorldSim.prototype, n, 'worldsim.' + n, WorldSim.prototype[n]);
wrap(AgentLawSystem.prototype, 'tick', 'agentLaws.tick', AgentLawSystem.prototype.tick);
wrap(wbsp.WBB, 'touchMeta', 'WBB.touchMeta', wbsp.WBB.touchMeta);

// ---- 真实现直驱：新世界 3100 tick ----
const eng = new GameEngine(SEED);
if (eng.laws.seasons !== true) throw new Error('laws.seasons 非真（lich 对账面前提破坏）: ' + eng.laws.seasons);
console.log('[gen] engine constructed: units =', eng.units.length, 'civs =', eng.civs.length, 'armies =', eng.armies.length);
const t0 = Date.now();
for (let t = 1; t <= TICKS; t++) eng.tick();
console.log('[gen]', TICKS, 'ticks in', Date.now() - t0, 'ms');

if (ledger.length !== TICKS) throw new Error('台账 tick 数不齐: ' + ledger.length);

// ---- 算术镜像自检（节律表纯算术重推，与插桩实测逐 tick 全等） ----
// yearF 双精度累加镜像（engine L2515 this.yearF += 1/YEAR_TICKS；YEAR_TICKS=40 constants L9）
// season = floor(yearF/2)%4（nature.ts L160-163 getter；SEASON_YEARS=2；offset 0）
let yf = 0;
const seasonAt = (t) => { // 第 t tick 内的 season（yearF 已含第 t 次累加）
  const s = Math.floor(yf / 2) % 4;
  return s < 0 ? s + 4 : s;
};
// 节律表：[manifest 名, mod, phase]；null mod = 每 tick；'phoenix' = phoenixAshes.length>0
// 顺序 = engine.ts tick 体文本序（effectsTick 在 civs 块之后 L2528——首版误置 BASE 第四位，
// tick5 实测位序曝光：civsTick 触发时 effectsTick 落其后）
const RHYTHMS = [
  ['panicTick', 60, 0], ['rebuildCivBuildCounts', 5, 0], ['civsTick', 5, 0],
  ['effectsTick', null, 0],
  ['radTick', 30, 0], ['frontTick', 30, 0], ['economyTick', 120, 0], ['tradeTick', 40, 0],
  ['defenseTick', 10, 0], ['templeTick', 120, 0], ['barracksTick', 200, 0],
  ['banditRaidTick', 900, 0], ['dragonSpawnTick', 3000, 0],
  ['regrowTick', 60, 0], ['statsTick', 60, 0], ['checkTriggers', 8, 0],
  ['decalsTick', 2, 0], ['fpTick', 2, 0], ['iceTick', 40, 0], ['snowmanTick', 80, 16],
  ['historyTick', 200, 0], ['victoryTick', 150, 0], ['warTick', 200, 0], ['worldWarTick', 30, 0],
  ['armyTick', 5, 0], ['warInfoTick', 100, 0], ['directiveTick', 30, 0], ['techTick', 120, 5],
  ['societyTick', 150, 7], ['allianceTick', 300, 23], ['armoryTick', 240, 13], ['ecoTick', 120, 9],
  ['evolutionTick', 600, 11], ['sampleHistory', 300, 17], ['achievementsTick', 600, 19],
  ['nature.atmTick', 10, 3], ['nature.stormTick', 40, 5], ['nature.hydroTick', 120, 9],
  ['nature.seasonCheck', 40, 0], ['nature.tectonicTick', 240, 21], ['nature.geologyTick', 600, 31],
  ['worldsim.oceanTick', 120, 15], ['angelAuraTick', 3, 0],
  ['phoenixAshTick', 'phoenix', 0],
  ['entGroveTick', 10, 0], ['lichRaiseTick', 'lich', 0], ['hydraRegenTick', 30, 0],
  ['beachedAquaticTick', null, 0], ['wildlifeReboundTick', 600, 61], ['predatorHuntTick', 20, 7],
  ['sharkBreedTick', 240, 13], ['worldsim.tempTick', 120, 27], ['worldsim.glacierTick', 240, 33],
  ['worldsim.hydroTick', 600, 41], ['worldsim.coastTick', 600, 47], ['worldsim.biomeTick', 600, 53],
  ['WBB.touchMeta', 120, 57], ['agentLaws.tick', 120, 57],
];
const BASE = ['fireTick', 'rebuildBuckets', 'unitsTick'];
let mirrorFail = 0;
for (let t = 1; t <= TICKS; t++) {
  yf += 1 / 40;
  const exp = [...BASE];
  for (const [name, mod, ph] of RHYTHMS) {
    if (mod === 'phoenix') { /* 窗口恒假（phoenixLenMax 断言兜底） */ continue; }
    if (mod === 'lich') {
      const period = seasonAt(t) === 3 ? 8 : 12;
      if (t % period === 0) exp.push(name);
      continue;
    }
    if (mod === null || t % mod === ph) exp.push(name);
  }
  const got = ledger[t - 1];
  if (got.length !== exp.length || got.some((n, i) => n !== exp[i])) {
    if (mirrorFail < 3) console.error('[mirror] tick', t, '期望', exp.join(','), '实测', got.join(','));
    mirrorFail++;
  }
  if (seasonUsed[t - 1] !== seasonAt(t)) throw new Error('season 审计漂移 @' + t + ': ' + seasonUsed[t - 1] + ' ≠ ' + seasonAt(t));
}
if (mirrorFail > 0) throw new Error('算术镜像失配 ' + mirrorFail + ' tick（插桩或节律表有误）');
if (phoenixLenMax !== 0) throw new Error('phoenixAshes 窗口非空（phoenixAshTick 条件非恒假，协议需扩）: max=' + phoenixLenMax);

// ---- 覆盖率表 ----
const coverage = MANIFEST.map((n) => ({ name: n, fires: 0 }));
for (const tickCalls of ledger) for (const n of tickCalls) coverage[CODE.get(n)].fires++;
const zeroFired = coverage.filter((c) => c.fires === 0).map((c) => c.name);
console.log('[gen] 覆盖率：' + coverage.filter((c) => c.fires > 0).length + '/' + MANIFEST.length + ' 名全窗触发；零触发 = [' + zeroFired.join(',') + ']');
if (zeroFired.join(',') !== 'phoenixAshTick') throw new Error('意外零触发: ' + zeroFired.join(','));

// ---- f64hex（小端字节序，gen-nature bitHex 同构） ----
const f64hex = (d) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
// yearF 逐 tick 位型审计（lich 对账面的位级证据；重算路径 = 镜像同款累加）
yf = 0;
const yearFHex = [];
for (let t = 1; t <= TICKS; t++) { yf += 1 / 40; yearFHex.push(f64hex(yf)); }

// ---- 黄金落盘（双写） ----
const codes = ledger.map((calls) => calls.map((n) => CODE.get(n)).join(','));
const golden = {
  meta: {
    blueprint: 'engine.ts GameEngine.tick L2501-2655（母体编排）',
    genScript: 'gen-tick-orch.mjs',
    seed: SEED, ticks: TICKS, yearTicks: 40, seasonYears: 2,
    manifest: MANIFEST,
    protocol: [
      '深度守卫：台账仅记 tick 体直接调度（嵌套内部调用双侧不记——worldWarTick→statsTick engine L8485 先例）',
      'codes = manifest 索引，行序 = tick 序（行 t-1 = 第 t tick）',
      'lich 节律 season===3?8:12；season=floor(yearF/2)%4（nature.ts L160-163，SEASON_YEARS=2，offset 0）',
      'phoenixAshTick 窗口恒假实证（phoenixLenMax=0）；panicNoteCd 桩域分歧非对账面',
      'yearFHex 小端 f64 位型（DataView LE，gen-nature bitHex 同构）',
    ],
  },
  audits: { seasonUsed, yearFHex, panicNoteCdPre, phoenixLenMax, overlayModeConst },
  ledger: codes,
};
const json = JSON.stringify(golden);
const out1 = path.join(ROOT, 'scripts/unity-migration/golden/tick_orch.json');
const out2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tick_orch.json');
writeFileSync(out1, json);
writeFileSync(out2, json);
const md5 = createHash('md5').update(json).digest('hex');
console.log('[gen] 双写完成:', out1);
console.log('[gen] md5:', md5, '| 大小:', (json.length / 1024).toFixed(1), 'KB | ledger 行:', codes.length, '| 总调度数:', ledger.reduce((s, c) => s + c.length, 0));
console.log('[gen] PASS');
