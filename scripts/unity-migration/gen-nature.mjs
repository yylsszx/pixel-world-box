// ============================================================================
// gen-nature.mjs —— M-U1b 切片 1「板块构造核心」黄金向量（Task 136）
// 直接 import 现役 src/lib/game/nature.ts（真实现，非复制），
// 以最小 stub 引擎驱动 initPlates + tectonicTick + releaseQuake，
// 输出板块场/边界/热点/应力/地震事件的逐位黄金向量。
// 引擎侧效应（natureQuake/tsunami）以事件流捕获——C# 侧以 PendingQuakes 结构对账。
// 运行：bun scripts/unity-migration/gen-nature.mjs
// 输出：scripts/unity-migration/golden-nature.json
// ============================================================================
import { NatureSystem } from '../../src/lib/game/nature.ts';
import { W, H } from '../../src/lib/game/constants.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { writeFileSync } from 'node:fs';

// ---- FNV-1a 32bit（与 C# 对账台同式） ----
const fnv = (u8) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < u8.length; i++) {
    h = (h ^ u8[i]) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
const fnvF32 = (f32arr) => {
  const u8 = new Uint8Array(f32arr.length * 4);
  const dv = new DataView(u8.buffer);
  for (let i = 0; i < f32arr.length; i++) dv.setFloat32(i * 4, f32arr[i], true);
  return fnv(u8);
};
const fnvU32 = (u32arr) => {
  const u8 = new Uint8Array(u32arr.length * 4);
  const dv = new DataView(u8.buffer);
  for (let i = 0; i < u32arr.length; i++) dv.setUint32(i * 4, u32arr[i] >>> 0, true);
  return fnv(u8);
};
/** IEEE754 小端 16 hex（位模式对账用，禁 epsilon） */
const bitHex = (d) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// ---- stub 引擎：tectonic 路径所需最小面 ----
function makeStubEng(rngSeed) {
  const events = [];
  return {
    events,
    laws: { tectonics: true, atmosphere: false, seasons: true },
    yearF: 1234.5,
    rng: mulberry32(rngSeed),
    terrain: new Uint8Array(W * H), // 全 DEEP(0)：地震→海啸分支全激活（海岸判定走 DEEP 分支）
    natureQuake: (x, y, m) => events.push({ k: 'q', x, y, mb: bitHex(m) }),
    tsunami: (x, y, r) => events.push({ k: 't', x, y, rb: bitHex(r) }),
    toast: () => {}, addEvent: () => {},
    dirty: new Set(), propsDirty: new Set(),
    units: [], worldsim: null,
    moonIllum: () => 0, dayPhase: () => 0,
  };
}

const CASES = [
  { name: 's20261026', seed: 20261026, engRngSeed: 911 },
  { name: 's42', seed: 42, engRngSeed: 912 },
  { name: 's777', seed: 777, engRngSeed: 913 },
];

const out = [];
for (const c of CASES) {
  const eng = makeStubEng(c.engRngSeed);
  const nat = new NatureSystem(eng, c.seed);
  nat.initPlates();

  // ---- init 状态 ----
  const init = {
    plateN: nat.plateN,
    plateDigest: fnv(nat.plate),
    boundaryCount: nat.boundary.size,
    boundaryDigest: fnvU32([...nat.boundary]),
    hotspots: nat.hotspots.map((h) => [h.x, h.y]),
    cx: nat.plateCx.map(bitHex),
    cy: nat.plateCy.map(bitHex),
    ddx: nat.drift.map((d) => bitHex(d.dx)),
    ddy: nat.drift.map((d) => bitHex(d.dy)),
    quakeStress: ep('nature.quakeStress'),
  };

  // ---- tectonic 演化：40 构造期（10 次重算 + 多轮地震循环） ----
  const ticks = [];
  const stressAt = {};
  for (let t = 1; t <= 40; t++) {
    eng.events.length = 0;
    nat.tectonicTick();
    if (eng.events.length > 0) ticks.push({ t, events: eng.events.map((e) => [e.k, e.x, e.y, e.k === 'q' ? e.mb : e.rb]) });
    if (t === 10 || t === 20 || t === 30 || t === 40) stressAt['t' + t] = fnvF32(nat.stress);
  }

  // ---- 终态 ----
  const final = {
    plateDigest: fnv(nat.plate),
    boundaryCount: nat.boundary.size,
    boundaryDigest: fnvU32([...nat.boundary]),
    stressDigest: fnvF32(nat.stress),
    cx: nat.plateCx.map(bitHex),
    cy: nat.plateCy.map(bitHex),
    hotHeat: nat.hotspots.map((h) => bitHex(h.heat)),
    counters: { ...nat.counters },
    recentQuakes: nat.recentQuakes.map((q) => [q.x, q.y, bitHex(q.m), q.year]),
    epoch: nat.plateEpoch,
    ash: bitHex(nat.ash),
  };

  // stub rng 消耗对账：计数包装重放全程（initPlates 用局部 rand 不耗 eng.rng；
  // tectonicTick/releaseQuake 消耗）——终态后再抽 4 步作流指纹（C# 尾抽逐位比对），
  // 若消耗次数不同则状态不同 → 尾抽必然漂移，无需单独对 count。
  const eng2 = makeStubEng(c.engRngSeed);
  const rngRaw = eng2.rng;
  let rngCount = 0;
  eng2.rng = () => { rngCount++; return rngRaw(); };
  const nat2 = new NatureSystem(eng2, c.seed);
  nat2.initPlates();
  for (let t = 0; t < 40; t++) nat2.tectonicTick();
  const tail = [];
  for (let i = 0; i < 4; i++) tail.push(bitHex(eng2.rng()));

  out.push({ name: c.name, seed: c.seed, engRngSeed: c.engRngSeed, init, ticks, stressAt, final, rngCount, rngTail: tail });
}

const summary = out.map((o) => `${o.name}: quakes=${o.final.counters.quakes} big=${o.final.counters.quakesBig} tsunamis=${o.final.counters.tsunamis} rngDraws=${o.rngCount} epoch=${o.final.epoch} boundary=${o.final.boundaryCount}`);
writeFileSync(new URL('./golden-nature.json', import.meta.url), JSON.stringify(out));
console.log('golden-nature.json written,', out.length, 'cases');
console.log(summary.join('\n'));
