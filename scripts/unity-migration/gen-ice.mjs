// ============================================================================
// gen-ice.mjs —— M-U9a 切片「冰域」黄金向量（iceTick L2902-3031 + meltIce L2892-2895
//   + setTerrain 贴花级联 L981-984）
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制）。夹具 = 手术式字段直写：
//   构造 GameEngine(baseSeed)（构造器 generate 全链）后 terrain/tempMap/fire/frozen/
//   flood/wet/units/laws/yearF/tickCount 直写覆写，尾置 eng.rngA = seed 清零掷链 →
//   iceTick 掷链自 seed 纯净起流（无 spawnUnit 前掷——与 rivers 链重建协议异构，免链反解）。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA（类字段箭头 rng L728-733）——iceTick 全域零超越函数
//     （floor/abs/min/round 纯算术——JS/C# IEEE 位安全域），mulberryStep 纯数学
//     重建掷数（noise.ts L3-13 公式）→ 掷数 total 由 s0→终态链走唯一反解。
//   ② 季节控制：laws.seasons + yearF（nature.ts L160-163 getter：floor(yearF/2)%4——
//     0 春/1 夏/2 秋/3 冬；seasonOffset 默认 0，ash 默认 0 nature.ts L78）。
//   ③ 纪事旗标：nature.thawChronDone/iceChronDone（L178/180 默认 false——fresh 引擎即净态）。
//   ④ 夹具单位：spawnUnit 真实现（L1283）先行（掷数不计——rngA 后置），黄金记 spawn 调用
//     + RACES 派生 aquatic/flying 旗（transcript 零引擎消费 + C# RDEF 交叉锁定）。
//   ⑤ setTerrain 直调（S5 级联面）零掷——级联全簿记。
//   ⑥ sanity：每场景掷数>0（除纯零掷面外）/终态地形 md5 稳定/det 双跑字节级。
//
// 运行：bun scripts/unity-migration/gen-ice.mjs（M-U7w 口径：超函数链 bun fdlibm——
//   本域零超越函数，bun/node 同位，但口径统一 bun）
// 输出：scripts/unity-migration/golden/ice.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/ice.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 gen-rivers.mjs 原则） ----
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

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
if (typeof GameEngine !== 'function') throw new Error('GameEngine 未定位: ' + Object.keys(engMod).join(','));
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const N = W * H;

// ---- 工具 ----
const gzB64 = (u8) => zlib.gzipSync(Buffer.from(u8), { level: 9 }).toString('base64');
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

// mulberry32 步进（noise.ts L3-13 公式逐行同构）——掷数 total 纯数学反解
function mulberryStep(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
function chainDraws(state0, finalState) {
  let a = state0 | 0;
  for (let k = 0; k < 5_000_000; k++) {
    a = mulberryStep(a).a;
    if ((a >>> 0) === (finalState >>> 0)) return k + 1;
  }
  throw new Error('rng 链未达终态——协议失效');
}
const idx = (x, y) => y * W + x;

// ---- 手术式夹具构建 + iceTick 步进 + 快照（两相手术：直写相 → 快照 → setTerrain 直调相） ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);      // 构造器 generate 全链（后续手术覆写）

  // 手术一：瞬态层清零（terrain 基面 GRASS / tempMap 基温 / 火清 / 贴花集清 / 单位清）
  eng.terrain.fill(T.GRASS);
  eng.tempMap.fill(0);
  eng.fire.fill(0);
  eng.fireSet.clear();
  eng.frozen = new Set();
  eng.flood = new Map();
  eng.wet = new Map();
  eng.units.length = 0;
  eng.unitById.clear();
  eng.effects.length = 0;
  eng.worldEvents.length = 0;
  eng.eventSeq = 1;
  eng.laws.seasons = spec.seasons;
  eng.yearF = spec.yearF;
  eng.tickCount = spec.tickCount;

  // 手术二·直写相：贴片收集（保序）
  const terrainW = [], tempW = [], fireW = [], frozenA = [], floodS = [], wetS = [], setCalls = [], spawnCalls = [], raceFlags = [], units = [], spawn0 = [];
  for (const p of spec.patches) {
    if (p.terrain) for (const [x, y, t] of p.terrain) terrainW.push([x, y, t]);
    if (p.temp) for (const [x, y, v] of p.temp) tempW.push([x, y, v]);
    if (p.fire) for (const [x, y, v] of p.fire) fireW.push([x, y, v]);
    if (p.frozen) for (const [x, y] of p.frozen) frozenA.push([x, y]);
    if (p.flood) for (const [x, y, at] of p.flood) floodS.push([x, y, at]);
    if (p.wet) for (const [x, y, at] of p.wet) wetS.push([x, y, at]);
    if (p.set) for (const [x, y, t] of p.set) setCalls.push([x, y, t]);   // setTerrain 直调（级联面 L981-984——零掷；相位二执行）
    if (p.spawn) for (const [race, x, y] of p.spawn) spawnCalls.push([race, x, y]);
  }
  for (const [x, y, t] of terrainW) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of tempW) eng.tempMap[idx(x, y)] = v;
  for (const [x, y, v] of fireW) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  for (const [x, y] of frozenA) eng.frozen.add(idx(x, y));
  for (const [x, y, at] of floodS) eng.flood.set(idx(x, y), at);
  for (const [x, y, at] of wetS) eng.wet.set(idx(x, y), at);
  for (const [race, x, y] of spawnCalls) {
    const u = eng.spawnUnit(race, x, y, { silent: true });
    if (!u || u.dead) throw new Error(`S${spec.key}: spawn 失败 race=${race}@${x},${y}`);
    const rd = raceDefOf(race);   // RACES 表直查（零引擎侧以黄金 raceFlags/units 行为准）
    raceFlags.push({ race, aquatic: rd.aquatic ? 1 : 0, flying: rd.flying ? 1 : 0 });
    units.push({ x: Math.floor(u.x), y: Math.floor(u.y), dead: u.dead ? 1 : 0, boat: u.boat ? 1 : 0, aquatic: rd.aquatic ? 1 : 0, flying: rd.flying ? 1 : 0 });
    spawn0.push({ race, x: f64hex(u.x), y: f64hex(u.y) });   // C# SpawnUnit 重放入参（f64 位级——M-U3h 译件交叉锁）
  }

  // 手术二·快照：直写后/setTerrain 直调前的镜像输入面（黄金 fixture 通道）
  const fixture = {
    terrain0: gzB64(eng.terrain),
    temp0: gzB64(eng.tempMap),
    fire0: gzB64(eng.fire),
    fireSet0: [...eng.fireSet],
    frozen0: [...eng.frozen],
    flood0: [...eng.flood.entries()],
    wet0: [...eng.wet.entries()],
    setCalls,
    spawn0,
    units,
  };

  // 手术二·相位二：setTerrain 直调（级联面——镜像按序重放）
  for (const [x, y, t] of setCalls) eng.setTerrain(idx(x, y), t);

  // 手术三（尾置）：rngA 清零起流 → iceTick 步进 + 逐步快照
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (let k = 0; k < spec.steps; k++) {
    eng.iceTick();
    steps.push({
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      terrainMd5: md5hex(eng.terrain),
      frozen: [...eng.frozen],                    // JS Set 插入序（删不重排/加尾插——C# List 镜像对账面）
      flood: [...eng.flood.entries()],            // JS Map 插入序
      wet: [...eng.wet.entries()],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
    });
  }

  // sanity（生成即验证）
  const totalDraws = chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  if (spec.minDraws && totalDraws < spec.minDraws) throw new Error(`S${spec.key}: 掷数 ${totalDraws} < 下限 ${spec.minDraws}`);
  if (spec.sanity && !spec.sanity(eng)) throw new Error(`S${spec.key}: sanity 未过`);

  return {
    key: spec.key,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    seasons: spec.seasons,
    yearF: spec.yearF,
    tickCount: spec.tickCount,
    steps: spec.steps,
    totalDraws,
    raceFlags,
    fixture,
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    tempMap: gzB64(eng.tempMap),
    fire: gzB64(eng.fire),
    fireSet: [...eng.fireSet],
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir) })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
  };
}

// RACES 表（types.ts 直查——spawn 旗派生；transcript 零引擎侧以黄金 raceFlags 为准）
let RACESRef = null;
async function loadRaces() {
  const m = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
  RACESRef = m.RACES;
}
function raceDefOf(race) {
  const d = RACESRef[race];
  if (!d) throw new Error('RACES 缺 race ' + race);
  return d;
}

// ---- 场景集（5 场景：热融/春汛/冬封/洪水退潮/湿沙干透+级联） ----
await loadRaces();
const BASE = 20261031;
const specs = [
  {
    key: 'hot-melt', baseSeed: BASE + 1, seed: 0x11CE001, seasons: true, yearF: 2.5, tickCount: 1000, steps: 1, minDraws: 10,
    patches: [
      { terrain: [[99, 80, T.LAVA], [100, 80, T.ICE], [120, 80, T.ICE], [140, 80, T.ICE]], temp: [[140, 80, 200]],
        fire: [[121, 80, 50]], frozen: [[100, 80], [120, 80], [140, 80]] },
    ],
    sanity: (eng) => eng.terrain[idx(100, 80)] === T.WATER && eng.terrain[idx(120, 80)] === T.WATER,
  },
  {
    key: 'spring-thaw', baseSeed: BASE + 2, seed: 0x11CE002, seasons: true, yearF: 0.5, tickCount: 2000, steps: 1, minDraws: 10,
    patches: [
      { terrain: [[100, 70, T.ICE], [110, 72, T.ICE], [200, 5, T.ICE]], temp: [[200, 5, 200]],
        frozen: [[100, 70], [110, 72], [200, 5]], spawn: [[R.SHEEP, 110.5, 72.5]] },   // 野生绵羊（非 isCiv——零建国面；非水生非飞行——纪事扫描合格）
    ],
    sanity: (eng) => eng.terrain[idx(110, 72)] === T.WATER && eng.terrain[idx(200, 5)] === T.ICE
      && eng.worldEvents.some((e) => e.kind === 'geo'),
  },
  {
    key: 'winter-freeze', baseSeed: BASE + 3, seed: 0x11CE003, seasons: true, yearF: 6.5, tickCount: 3000, steps: 2, minDraws: 1000,
    patches: [
      { terrain: [
        ...(() => { const a = []; for (let y = 0; y < 20; y++) for (let x = 0; x < W; x++) a.push([x, y, T.SNOW]); return a; })(),   // 极地雪带
        ...(() => { const a = []; for (let y = 20; y < 22; y++) for (let x = 30; x < 226; x++) a.push([x, y, T.WATER]); return a; })(), // 雪缘水带
        ...(() => { const a = []; for (let y = 24; y < 57; y++) for (let x = 30; x < 227; x++) a.push([x, y, T.WATER]); return a; })(), // 北湖（latF 0.2875..0.7——避赤道无冰带 latF<0.26）
        ...(() => { const a = []; for (let y = 104; y < 137; y++) for (let x = 30; x < 227; x++) a.push([x, y, T.WATER]); return a; })(), // 南湖（对称纬度）
        ...(() => { const a = []; for (let y = 0; y < 30; y++) for (let x = 230; x < 254; x++) a.push([x, y, T.DEEP]); return a; })(),  // 极地深洋（latF≥0.5 深洋支路 L2994）
      ] },
    ],
    sanity: (eng) => eng.frozen.size > 12 && eng.worldEvents.some((e) => e.kind === 'geo'),
  },
  {
    key: 'flood-retreat', baseSeed: BASE + 4, seed: 0x11CE004, seasons: false, yearF: 2.5, tickCount: 5000, steps: 2, minDraws: 10,
    patches: [
      { terrain: [[50, 60, T.WATER], [51, 60, T.WATER], [52, 60, T.WATER], [60, 60, T.WATER], [61, 60, T.DEEP], [70, 60, T.GRASS]],
        flood: [[50, 60, 4990], [51, 60, 6000], [60, 60, 4990], [70, 60, 4990], [52, 60, 6000]] },
    ],
    // 50,60：邻 51,60 为 flood 区（!flood.has 排除）+ 51,60 自身非邻——内湖 → SAND+wet；
    // 60,60：邻 61,60 DEEP 自然水（非 flood）→ 保留海；70,60：玩家已改造（GRASS）→ 跳过；52,60：未到期。
    sanity: (eng) => eng.terrain[idx(50, 60)] === T.SAND && eng.wet.has(idx(50, 60)) && eng.terrain[idx(60, 60)] === T.WATER,
  },
  {
    key: 'wet-dry-cascade', baseSeed: BASE + 5, seed: 0x11CE005, seasons: false, yearF: 2.5, tickCount: 6000, steps: 1, minDraws: 10,
    patches: [
      { wet: [[80, 60, 5900], [82, 60, 6100]], flood: [[90, 60, 5990], [91, 60, 5990], [92, 60, 6100], [93, 60, 6100]],
        terrain: [[90, 60, T.WATER], [91, 60, T.WATER], [92, 60, T.WATER], [93, 60, T.WATER], [100, 60, T.ICE], [101, 60, T.ICE]],
        frozen: [[100, 60], [101, 60]] },
      { set: [[100, 60, T.GRASS], [94, 60, T.ICE], [90, 60, T.SAND], [82, 60, T.FOREST]] },   // setTerrain 级联直调面（零掷——L981-984 点亮验证；82,60 GRASS→FOREST 异值——同值早退 L971 不触达级联）
    ],
    // 级联面：100,60 ICE→GRASS frozen.delete（L981）/94,60 WATER→ICE frozen.add（L982）/
    // 90,60 WATER→SAND flood.delete（L983）/82,60 wet→GRASS wet.delete（L984）；
    // wet 80,60 到期干透（L3028）；flood 91,60 到期——邻 90 已非水非 flood → natural=false → SAND+wet。
    sanity: (eng) => !eng.frozen.has(idx(100, 60)) && eng.frozen.has(idx(94, 60)) && eng.wet.has(idx(91, 60)) && !eng.wet.has(idx(80, 60)) && !eng.wet.has(idx(82, 60)),
  },
];

const scenarios = specs.map(buildScenario);
for (const s of scenarios) {
  console.log(`${s.key}: draws=${s.totalDraws} frozen=${s.stepsSnap.at(-1).frozen.length} fx=${s.fx.length} events=${s.events.length} rngA=${s.stepsSnap.at(-1).rngA}`);
}

// ---- det 双跑（字节级）：同 spec 重跑终态对账 ----
const det2 = specs.map(buildScenario);
for (let i = 0; i < scenarios.length; i++) {
  if (scenarios[i].stepsSnap.at(-1).terrainMd5 !== det2[i].stepsSnap.at(-1).terrainMd5
    || scenarios[i].stepsSnap.at(-1).rngA !== det2[i].stepsSnap.at(-1).rngA
    || JSON.stringify(scenarios[i].stepsSnap) !== JSON.stringify(det2[i].stepsSnap))
    throw new Error(`det 失败 S${scenarios[i].key}`);
}
console.log('det 双跑字节级一致:', scenarios.map((s) => s.key).join(' '));

const out = {
  meta: {
    gen: 'gen-ice.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写 + rngA 尾置清零起流（无前掷——免链反解）+ iceTick 直调步进快照',
    rng: 'eng.rngA 单流（类字段箭头 rng L728-733）；mulberry 纯数学反解 total（noise.ts L3-13）',
    domains: ['iceTick L2902-3031', 'meltIce L2892-2895', 'setTerrain 贴花级联 L981-984', 'nature.iceMul L341-345（ash=0 域）', '纪事旗标 nature L178/180'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/ice.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/ice.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('ice.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
