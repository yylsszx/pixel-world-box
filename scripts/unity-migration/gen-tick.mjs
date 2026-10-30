// gen-tick.mjs — M-U7c tick() 编排层黄金向量生成器：engine.tick() 真实现 intercept 实录
// 蓝本锚：engine.ts L2501-2649（tick 母体——57 调用点：实例 47 + nature 6 + worldsim 6 + agentLaws 1 + WBB 1，
//         另有 L2627 shake 衰减与 L2629-2648 性能段（宿主性能域不进对账面））
// 对账边界：**调度序列本身**（模条件 + 调用顺序 + 快照/递减/置位副作用）——域内部行为各有自己的黄金
//         切片（CivsTick/ArmyTick/EconomyTick/TechTick/SocietyTick/AllianceTick/DirectiveTick 已译域在
//         空世界下零效应空转）。JS 侧 intercept patch（记录+替换，不调原实现）→ 黄金零效应确定性。
// trace 协议：`name@tickCount` 字符串序列（tickCount 为 tick 体内自增后的绝对值——L2503 先 ++ 后调度）。
// dump 协议：每场景 { name, setup, ticks, trace[], post{ tickCount, yearF f64hexLE, shake, panicNoteCd,
//         units, fires, overlayDirty } }。yearF 走 f64hex 小端（render5/7/overlay/bail 家族 LE 先例）。
// 跑法：node scripts/unity-migration/gen-tick.mjs（自带 sanity + det 子进程双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（必须在 import engine 之前挂好；gen-minimap 同款精简） ----------------
let canvasSeq = 0;
class RecCtx {
  constructor(canvas) {
    this.canvas = canvas; this.id = canvas.__id; this.ops = [];
    this.fillStyle = '#000000'; this.strokeStyle = '#000000'; this.lineWidth = 1;
    this.globalAlpha = 1; this.imageSmoothingEnabled = true; this.font = '';
    this.textAlign = 'left'; this.textBaseline = 'alphabetic'; this.lineCap = 'butt'; this.lineJoin = 'miter';
  }
  fillRect() {} strokeRect() {} clearRect() {} save() {} restore() {} translate() {} scale() {}
  setTransform() {} putImageData() {} drawImage() {} beginPath() {} arc() {} fill() {} stroke() {}
  moveTo() {} lineTo() {} setLineDash() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; }
  measureText() { return { width: 0 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
}
function mkCanvas(w, h) {
  const c = { width: w, height: h, __id: ++canvasSeq };
  c.getContext = () => { if (!c.__ctx) c.__ctx = new RecCtx(c); return c.__ctx; };
  return c;
}
globalThis.document = { createElement: () => mkCanvas(0, 0), createElementNS: () => mkCanvas(0, 0), addEventListener: () => {} };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.requestAnimationFrame = () => {};
globalThis.performance = globalThis.performance ?? { now: () => 0 };

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const wbsp = await jiti.import(path.join(ROOT, 'src/lib/wasm/wbspatial.ts'));

function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}

// ---------------- tick() 内被调方法全表（probe-tick.mjs 实证 57 点零 MISSING） ----------------
const ENG_METHODS = ['fireTick','rebuildBuckets','unitsTick','panicTick','rebuildCivBuildCounts','civsTick','effectsTick','radTick','frontTick','economyTick','tradeTick','defenseTick','templeTick','barracksTick','banditRaidTick','dragonSpawnTick','regrowTick','statsTick','checkTriggers','decalsTick','fpTick','iceTick','snowmanTick','historyTick','victoryTick','warTick','worldWarTick','armyTick','warInfoTick','directiveTick','techTick','societyTick','allianceTick','armoryTick','ecoTick','evolutionTick','sampleHistory','achievementsTick','angelAuraTick','phoenixAshTick','entGroveTick','lichRaiseTick','hydraRegenTick','beachedAquaticTick','wildlifeReboundTick','predatorHuntTick','sharkBreedTick'];
const NATURE_METHODS = ['atmTick','stormTick','hydroTick','seasonCheck','tectonicTick','geologyTick'];
const WORLDSIM_METHODS = ['oceanTick','tempTick','glacierTick','hydroTick','coastTick','biomeTick'];

// ---------------- 场景装配（intercept 模式：记录+替换，零效应确定性） ----------------
function runScen(eng, sc) {
  // 跨场景复位（确定性基线——mmScene 先例 + tickCount/yearF 归零使场景独立可对账）
  eng.units.length = 0;
  eng.civs.length = 0;
  eng.buildings.length = 0;
  eng.armies.length = 0;
  eng.fireSet.clear();
  eng.activeBattles.clear();
  eng.phoenixAshes.length = 0;
  eng.tickCount = 0;
  eng.yearF = 0;
  eng.shake = 0;
  eng.panicNoteCd = 0;
  eng.overlayMode = sc.setup.overlayMode;
  eng.overlayDirty = sc.setup.overlayDirty;
  eng.nature.seasonOffset = sc.setup.seasonOffset;
  if (sc.setup.panicNoteCd0 != null) eng.panicNoteCd = sc.setup.panicNoteCd0;
  for (const ash of sc.setup.ashes ?? []) eng.phoenixAshes.push(ash);

  // intercept patch（实例方法——engine L2501-2649 全部被调点）
  const trace = [];
  const rec = (name) => { trace.push(`${name}@${eng.tickCount}`); };
  for (const m of ENG_METHODS) eng[m] = function () { rec(m); };
  for (const m of NATURE_METHODS) eng.nature[m] = function () { rec(`nature.${m}`); };
  for (const m of WORLDSIM_METHODS) eng.worldsim[m] = function () { rec(`worldsim.${m}`); };
  eng.agentLaws.tick = function () { rec('agentLaws.tick'); };
  wbsp.WBB.touchMeta = function () { rec('WBB.touchMeta'); };

  for (let i = 0; i < sc.ticks; i++) eng.tick();

  return {
    name: sc.name,
    setup: sc.setup,
    ticks: sc.ticks,
    trace,
    post: {
      tickCount: eng.tickCount,
      yearF: f64hex(eng.yearF),
      shake: eng.shake,
      panicNoteCd: eng.panicNoteCd,
      units: eng.units.length,
      fires: eng.fireSet.size,
      overlayDirty: eng.overlayDirty,
    },
  };
}

const scens = [
  {
    // S0：空世界 606 tick——全模类覆盖（%2/3/5/8/10/20/30/40/60/80/100/120/150/200/240/300/600 及全部错峰余数）
    name: 'S0_base_606', ticks: 606,
    setup: { seasonOffset: 0, overlayMode: 'none', overlayDirty: false },
  },
  {
    // S1：冬季（seasonOffset=3 → nature.season=3）——engine L2605 lichRaiseTick 节律 12→8 实证
    name: 'S1_winter_lich8', ticks: 60,
    setup: { seasonOffset: 3, overlayMode: 'none', overlayDirty: false },
  },
  {
    // S2：凤凰灰烬非空——engine L2600 phoenixAshTick 每 tick 触发（length>0 门）
    name: 'S2_ashes_20', ticks: 20,
    setup: { seasonOffset: 0, overlayMode: 'none', overlayDirty: false, ashes: [{ x: 10, y: 10, t: 5 }] },
  },
  {
    // S3：密度覆盖层——engine L2531 overlayMode==='density' && %30 → overlayDirty 置位（POST 面）
    name: 'S3_density_61', ticks: 61,
    setup: { seasonOffset: 0, overlayMode: 'density', overlayDirty: false },
  },
  {
    // S4：播报冷却递减——engine L2525 panicNoteCd 每 tick --（POST 面：3→t3 归 0）
    name: 'S4_paniccd_6', ticks: 6,
    setup: { seasonOffset: 0, overlayMode: 'none', overlayDirty: false, panicNoteCd0: 3 },
  },
];

let ENG = null;
function getEng() { if (!ENG) ENG = new GameEngine(4213); return ENG; }

const eng = getEng();
const dump = { gen: 'gen-tick', scens: scens.map((sc) => runScen(eng, sc)) };

// ---------------- sanity ----------------
let fail = 0;
const S0 = dump.scens[0];
// sanity1：tickCount 推进与首 tick 调度序（空世界基线——每 tick 必调五件套 fire/rebuild/units/effects/beached）
{
  const t1 = S0.trace.filter((s) => s.endsWith('@1'));
  const want1 = ['fireTick@1', 'rebuildBuckets@1', 'unitsTick@1', 'effectsTick@1', 'beachedAquaticTick@1'];
  if (JSON.stringify(t1) !== JSON.stringify(want1)) { console.error('sanity1 first-tick sequence FAIL:', t1); fail++; }
}
// sanity2：S1 冬季 lich 节律 8（vs S0 的 12——S0 内 season 随 yearF 轮转，t≈248 起入冬切 %8，
//         这是 L2605 三元的真实编排语义；期望集用与 engine L2515 同序的 yearF 累加推演）
{
  const lichS0 = S0.trace.filter((s) => s.startsWith('lichRaiseTick@')).map((s) => +s.split('@')[1]);
  const S1 = dump.scens[1];
  const lichS1 = S1.trace.filter((s) => s.startsWith('lichRaiseTick@')).map((s) => +s.split('@')[1]);
  let y0 = 0; const exp0 = [];
  for (let t = 1; t <= 606; t++) { y0 += 1 / 40; const season = Math.floor(y0 / 2) % 4; if (t % (season === 3 ? 8 : 12) === 0) exp0.push(t); }
  let y1 = 0; const exp1 = [];
  for (let t = 1; t <= 60; t++) { y1 += 1 / 40; const season = Math.floor(y1 / 2 + 3) % 4; if (t % (season === 3 ? 8 : 12) === 0) exp1.push(t); }
  if (JSON.stringify(lichS0) !== JSON.stringify(exp0)) { console.error('sanity2 S0 lich FAIL len', lichS0.length, 'exp', exp0.length, 'missing', exp0.filter((x) => !lichS0.includes(x)).slice(0, 6), 'extra', lichS0.filter((x) => !exp0.includes(x)).slice(0, 6)); fail++; }
  if (JSON.stringify(lichS1) !== JSON.stringify(exp1)) { console.error('sanity2 S1 lich8 FAIL len', lichS1.length, 'exp', exp1.length, 'got', lichS1); fail++; }
}
// sanity3：S2 ashes 每 tick phoenixAshTick；S4 panicNoteCd 3→0
{
  const S2 = dump.scens[2], S4 = dump.scens[3 + 1];
  const ashCalls = S2.trace.filter((s) => s.startsWith('phoenixAshTick@')).length;
  if (ashCalls !== 20) { console.error('sanity3 S2 ashes FAIL:', ashCalls); fail++; }
  if (S4.post.panicNoteCd !== 0) { console.error('sanity3 S4 panicCd FAIL:', S4.post.panicNoteCd); fail++; }
}
// sanity4：S3 density 置位（t30 起真）
{
  const S3 = dump.scens[3];
  if (S3.post.overlayDirty !== true) { console.error('sanity4 density FAIL:', S3.post.overlayDirty); fail++; }
}
// sanity5：S0 POST yearF 位级（606 × 1/40 同序双精度累加——与 engine L2515 同序）
{
  let y = 0; for (let i = 0; i < 606; i++) y += 1 / 40;
  if (S0.post.yearF !== f64hex(y)) { console.error('sanity5 yearF FAIL:', S0.post.yearF); fail++; }
}

if (fail > 0) { console.error(`[GEN FAIL] ${fail} sanity failures`); process.exit(1); }

// ---------------- det 子进程双跑 ----------------
const { execFileSync } = await import('node:child_process');
const self = fileURLToPath(import.meta.url);
const tmp1 = JSON.stringify(dump);
if (process.env.DET_CHILD) {
  // 子进程模式：只打印 marker 后退出（不写盘不跑 sanity）
  process.stdout.write('DET_MARKER' + tmp1);
  process.exit(0);
}
// det 子进程双跑：重跑自身取 dump 字节对照
{
  const out = execFileSync('node', [self], { env: { ...process.env, DET_CHILD: '1' }, maxBuffer: 1024 * 1024 * 64 }).toString();
  const m = out.match(/DET_MARKER(.*)/s);
  if (!m) { console.error('[GEN FAIL] det child no marker'); process.exit(1); }
  if (m[1].trim() !== tmp1) { console.error('[GEN FAIL] det mismatch (bytes differ)'); process.exit(1); }
}

const outDir = path.join(ROOT, 'scripts/unity-migration/golden');
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'tick.json'), JSON.stringify(dump));
// 双写 StreamingAssets（NUnit 候选 3 协议）
const saDir = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden');
mkdirSync(saDir, { recursive: true });
writeFileSync(path.join(saDir, 'tick.json'), JSON.stringify(dump));

const totalTrace = dump.scens.reduce((a, s) => a + s.trace.length, 0);
console.log(`[GEN PASS] tick.json ${dump.scens.length} scens, ${totalTrace} trace lines, sanity 5/5, det byte-identical`);
