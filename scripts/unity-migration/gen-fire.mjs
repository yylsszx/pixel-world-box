// ============================================================================
// gen-fire.mjs —— M-U9b 切片「fire 域」黄金向量（fireTick L2772-2821 + windAt 大气依赖面）
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制）。夹具 = 手术式字段直写：
//   构造 GameEngine(baseSeed)（构造器 generate 全链）后 terrain/fire/fireSet/building/
//   buildings/bIdx/regrow 直写覆写 + **大气态注入**（nature.windPhase/seed/pSystems/
//   storms/rainCell + worldsim.glacier/soilF——atmTick/stormTick 生产面未译，注入静态值域），
//   尾置 eng.rngA = seed 清零掷链 → fireTick 掷链自 seed 纯净起流。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA——fireTick 全掷面 = 蔓延尝试 1 掷/火格（L2789 <0.4）+ 邻格蔓延
//     1 掷/可燃邻（L2807）+ ignite 强度 1 掷（L1076）+ destroyBuilding smoke fx 2 掷（L1954）；
//     mulberryStep 纯数学反解 total（noise.ts L3-13）。
//   ② 大气依赖（windAt L356-420）：ITCZ 三环 + 急流（**Math.exp——fdlibm 域，C# FdExp
//     位精确件对账**）+ 湍流 valueNoise（WbNoise.ValueNoise 位精确件）+ 气压旋涡/风暴环流
//     （**Math.hypot——C# V8Hypot/FdHypot 对账**）。空 pSystems/storms 场景仍过 exp 急流面。
//   ③ fireSet 活迭代语义（L2776 for...of + 体内 ignite add / setTerrain 灭 delete）：
//     JS Set 迭代器含运行时新增（追加项当 tick 即燃）；gen/mirror 同为 JS 原生语义——
//     C# 侧队列仿真（快照+追加+成员判定跳过）逐位对账（WbFireTests）。
//   ④ Uint8Array wrap 语义（L2783 fire[i] -= 5 强度 ≢0 mod 5 时回绕 254 续燃）——
//     蓝本既有行为，C# byte 未检查回绕同构，夹具含 wrap 案例（152 → 2 → 253）。
//   ⑤ sanity：每场景掷数>0 / det 双跑字节级。
//
// 运行：bun scripts/unity-migration/gen-fire.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/fire.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/fire.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（同 gen-ice.mjs） ----
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    if (k === 'createImageData' || k === 'getImageData')
      return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
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
const { T } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const N = W * H;
const AW = Math.floor(W / 8), AH = Math.floor(H / 8);   // nature.ts L17-18

// ---- 工具 ----
const gzB64 = (u8) => zlib.gzipSync(Buffer.from(u8), { level: 9 }).toString('base64');
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

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

// ---- 手术式夹具构建 + fireTick 步进 + 快照（两相手术：直写相 → 快照 → setTerrain 直调相） ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零
  eng.terrain.fill(T.GRASS);
  eng.tempMap.fill(0);
  eng.fire.fill(0);
  eng.fireSet.clear();
  eng.frozen = new Set();
  eng.flood = new Map();
  eng.wet = new Map();
  eng.regrow = new Map();
  eng.units.length = 0;
  eng.unitById.clear();
  eng.effects.length = 0;
  eng.worldEvents.length = 0;
  eng.eventSeq = 1;
  eng.buildings.length = 0;
  eng.bIdx.clear();
  eng.building.fill(0);
  eng.laws.seasons = spec.seasons;
  eng.yearF = spec.yearF;
  eng.tickCount = spec.tickCount;

  // 手术二·直写相收集（保序）
  const terrainW = [], fireW = [], buildingW = [], regrowS = [], frozenA = [], soilW = [], glacierW = [], rainW = [];
  let windPhase = 0, natureSeed = 0;
  const pSystems = [], storms = [];
  for (const p of spec.patches) {
    if (p.terrain) for (const [x, y, t] of p.terrain) terrainW.push([x, y, t]);
    if (p.fire) for (const [x, y, v] of p.fire) fireW.push([x, y, v]);
    if (p.building) for (const [x, y, kind] of p.building) buildingW.push([x, y, kind]);
    if (p.regrow) for (const [x, y, at] of p.regrow) regrowS.push([x, y, at]);
    if (p.frozen) for (const [x, y] of p.frozen) frozenA.push([x, y]);
    if (p.soil) for (const [x, y, v] of p.soil) soilW.push([x, y, v]);
    if (p.glacier) for (const [x, y, v] of p.glacier) glacierW.push([x, y, v]);
    if (p.rain) for (const [cx, cy, v] of p.rain) rainW.push([cx, cy, v]);
    if (p.windPhase !== undefined) windPhase = p.windPhase;
    if (p.natureSeed !== undefined) natureSeed = p.natureSeed;
    if (p.pSystems) for (const ps of p.pSystems) pSystems.push(ps);
    if (p.storms) for (const st of p.storms) storms.push(st);
  }
  for (const [x, y, t] of terrainW) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of fireW) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  for (const [x, y, kind] of buildingW) {
    eng.building[idx(x, y)] = kind;
    eng.buildings.push({ i: idx(x, y), x, y, kind, civ: -1 });   // civ=-1 → civs[b.civ] undefined → houses 账不触（Test31 形态）
    eng.bIdx.set(idx(x, y), eng.buildings.length - 1);
  }
  for (const [x, y, at] of regrowS) eng.regrow.set(idx(x, y), at);
  for (const [x, y] of frozenA) eng.frozen.add(idx(x, y));
  for (const [x, y, v] of soilW) eng.worldsim.soilF[idx(x, y)] = v;
  for (const [x, y, v] of glacierW) eng.worldsim.glacier[idx(x, y)] = v;
  for (const [cx, cy, v] of rainW) eng.nature.rainCell[cy * AW + cx] = v;
  eng.nature.windPhase = windPhase;
  eng.nature.seed = natureSeed;
  eng.nature.pSystems = pSystems;
  eng.nature.storms = storms;

  // 手术二·快照：直写后/fireTick 前的镜像输入面（黄金 fixture 通道）
  const fixture = {
    terrain0: gzB64(eng.terrain),
    fire0: gzB64(eng.fire),
    fireSet0: [...eng.fireSet],
    soil0: gzB64(eng.worldsim.soilF),
    glacier0: gzB64(eng.worldsim.glacier),
    rain0: gzB64(eng.nature.rainCell),
    windPhase: f64hex(windPhase),
    natureSeed,
    pSystems: pSystems.map((p) => ({ x: f64hex(p.x), y: f64hex(p.y), kind: p.kind, str: f64hex(p.str) })),
    storms: storms.map((s) => ({ x: f64hex(s.x), y: f64hex(s.y), strength: f64hex(s.strength) })),
    regrow0: [...eng.regrow.entries()],
    frozen0: [...eng.frozen],
    building0: buildingW.map(([x, y, kind]) => ({ i: idx(x, y), x, y, kind })),
  };

  // 手术三（尾置）：rngA 清零起流 → fireTick 步进 + 逐步快照
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (let k = 0; k < spec.steps; k++) {
    eng.fireTick();
    steps.push({
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      terrainMd5: md5hex(eng.terrain),
      fireMd5: md5hex(eng.fire),
      fireSet: [...eng.fireSet],                  // JS Set 插入序（含活迭代追加序——C# fireSetList 镜像对账面）
      regrow: [...eng.regrow.entries()],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
      buildingsCount: eng.buildings.length,
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
    fixture,
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    fire: gzB64(eng.fire),
    fireSet: [...eng.fireSet],
    regrow: [...eng.regrow.entries()],
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
  };
}

// ---- 场景集（5 场景：森林蔓延/建筑摧毁/冰火互作/风雨调制/冬缓+regrow 交叠） ----
const BASE = 20261031;
const specs = [
  {
    key: 'fire-spread-forest', baseSeed: BASE + 11, seed: 0x0F1FE11, seasons: true, yearF: 2.5, tickCount: 1000, steps: 6, minDraws: 10,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 58; y < 68; y++) for (let x = 96; x < 128; x++) a.push([x, y, T.FOREST]); return a; })()],
        fire: [[100, 62, 10], [110, 62, 15], [105, 64, 20]],        // mod-5 案例组：10→5→0 烧尽 / 15 三步 / 20 四步；强度 ≢0 mod 5 时回绕（ Uint8Array wrap 蓝本行为）
        regrow: [[104, 62, 3000]],                                  // 预置 regrow——烧毁时 L979 出账 + L2825 重设
        windPhase: 0.37, natureSeed: 777 },
    ],
    sanity: (eng) => eng.regrow.size > 0 && eng.terrain[idx(100, 62)] === T.BURNT,
  },
  {
    key: 'fire-building-destroy', baseSeed: BASE + 12, seed: 0x0F1FE02, seasons: true, yearF: 2.5, tickCount: 2000, steps: 2, minDraws: 5,
    patches: [
      { building: [[100, 60, 3], [102, 60, 11]], fire: [[100, 60, 90], [102, 60, 150]] },   // fire<100 → destroyBuilding smoke；150 常燃对照
      { terrain: [[100, 60, T.GRASS], [102, 60, T.GRASS]] },
    ],
    sanity: (eng) => eng.buildings.length === 1 && eng.effects.some((e) => e.kind === 'smoke'),
  },
  {
    key: 'fire-ice-melt', baseSeed: BASE + 13, seed: 0x0F1FE03, seasons: true, yearF: 2.5, tickCount: 3000, steps: 2, minDraws: 5,
    patches: [
      { terrain: [[100, 60, T.ICE], [101, 60, T.ICE], [102, 60, T.ICE], [99, 60, T.GRASS]],
        fire: [[99, 60, 200], [100, 60, 180]],                      // 99 燃烧格（邻 ICE 蔓延融冰面）+ 100 冰上燃烧格（L2778 脚下融冰）
        frozen: [[101, 60], [102, 60]] },                           // frozen 预置——邻冰融时 L981 出账（跨域交叠面）
    ],
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.WATER,
  },
  {
    key: 'fire-wind-rain', baseSeed: BASE + 14, seed: 0x0F1FE04, seasons: true, yearF: 2.5, tickCount: 4000, steps: 2, minDraws: 10,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 58; y < 68; y++) for (let x = 96; x < 128; x++) a.push([x, y, T.FOREST]); return a; })()],
        fire: [[105, 62, 200], [118, 62, 200]],                     // 双火点：左点雨区（fireMul 0.45）右点冰原邻（glacier 灭门）
        rain: [[13, 7, 80]],                                        // cell(13,7) 覆 x 104-111——左火点雨区难燃
        glacier: [...(() => { const a = []; for (let y = 58; y < 68; y++) for (let x = 120; x < 128; x++) a.push([x, y, 90]); return a; })()],
        pSystems: [{ x: 800, y: 480, kind: 0, str: 1.2, ttl: 400 }, { x: 1600, y: 900, kind: 1, str: 0.9, ttl: 400 }],
        storms: [{ id: 1, x: 900, y: 500, strength: 0.8, ttl: 300, seed: 42 }],
        windPhase: 0.37, natureSeed: 777 },
    ],
    sanity: (eng) => true,
  },
  {
    key: 'fire-winter-ignite', baseSeed: BASE + 15, seed: 0x0F1FE41, seasons: true, yearF: 6.5, tickCount: 5000, steps: 3, minDraws: 5,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 58; y < 66; y++) for (let x = 96; x < 122; x++) a.push([x, y, T.FOREST]); return a; })()],
        fire: [[100, 60, 10], [108, 60, 239]] },                    // 冬 fireMul 0.45 慢蔓延；10 烧尽面 + 239 mod 5 = 4 → wrap 案例
    ],
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.BURNT,
  },
];

const scenarios = specs.map(buildScenario);
for (const s of scenarios) {
  console.log(`${s.key}: draws=${s.totalDraws} fireSet=${s.stepsSnap.at(-1).fireSet.length} regrow=${s.stepsSnap.at(-1).regrow.length} fx=${s.fx.length} rngA=${s.stepsSnap.at(-1).rngA}`);
}

// ---- det 双跑（字节级） ----
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
    gen: 'gen-fire.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具两相直写 + 大气态注入（windPhase/seed/pSystems/storms/rainCell/glacier/soilF）+ rngA 尾置清零起流 + fireTick 直调步进快照',
    rng: 'eng.rngA 单流（类字段箭头 rng L728-733）；mulberry 纯数学反解 total（noise.ts L3-13）',
    math: 'windAt 急流 Math.exp + 旋涡 Math.hypot——C# FdExp/V8Hypot 位精确件对账（fdlibm 域）；湍流 valueNoise——WbNoise.ValueNoise',
    domains: ['fireTick L2772-2821', 'ignite L1072-1078', 'windAt L356-420', 'cellOf L350-354', 'fireMul L309-318', 'regrowMul L320-324', 'soilMulAt worldsim L168-170', 'destroyBuilding L1936-1955（smoke fx）'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/fire.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/fire.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('fire.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
