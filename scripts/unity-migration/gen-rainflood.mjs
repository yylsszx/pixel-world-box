// ============================================================================
// gen-rainflood.mjs —— M-U11 切片「雨洪生产域」黄金向量
//   ① rainRegrow L10660-10671（雨区复苏——regrow 生产源之二：8×8 窗 4 采样命中
//      → regrow.set(max(tickCount+60, at-160))；调用面 nature.ts L527 暴雨云未译，
//      本体先行建库——M-U10h annihilate 本体先例同构）
//   ② natureFlood L10673-10693（流域洪水——flood 生产源：10 次极坐标采样，
//      GRASS/SAND/BURNT 门 + flood 门 + setTerrain(WATER) 全级联 + flood.set
//      (+180+rng*120) + flooded>=4 纪事；调用面 nature.ts L532 / executor L211 /
//      bridge-ext L1157 / agentLaws L680 均未译，本体先行建库）
//   ③ floodArea L10695-10723（神力洪水——flood 生产源二：半径钳 [2,12] +
//      Math.hypot 圆域门（fdlibm——C# FdHypot 对账）+ 五地形门 + flood 门 +
//      flood.set(+180+rng*180) + flooded>0 → fx tsunami{r:rr+1,quiet} + shake
//      max(3) + onSound 注记 + toast；调用面 toolsTick L13370 未译，本体先行）
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），手术式字段直写 +
// rngA 尾置清零起流 + calls 序直调（每调用后快照——gen-fire 步进协议同构）。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA——rainRegrow 每采样 2 掷（xx/yy，命中即返）；natureFlood
//     每采样 2 掷（ang/rr）+ 命中格 flood.set 1 掷（rng*120）+ destroyBuilding
//     smoke fx 2 掷/座（L1954）；floodArea 命中格 flood.set 1 掷（rng*180）+
//     destroyBuilding smoke 2 掷。mulberry 纯数学反解 total（noise.ts L3-13）。
//   ② fdlibm 域：natureFlood Math.cos/sin（极坐标）+ floodArea Math.hypot——
//     bun 原生 fdlibm 与 gen 同 runtime 同位；C# 侧 FdSin/FdCos/FdHypot 位精确件
//     对账（WbMath L700/L714/L43 既有件，零新数学件）。
//   ③ setTerrain 全级联随件（WbBail L1959 已译件）：regrow 出账（L979）/owner 熄灭
//     （L994）/fire 熄灭 fireSet 出（L990-993）/road 清（L1002）/glacier 清
//     （worldsim L159-163）/RefreshWaterTierAround（L1006 水深场）——S5 全铺触达。
//   ④ toast 宿主回调（L14027 onToast）——gen 挂收集器（eng.onToast）入黄金
//     （纪律③事件流：C# 侧 w.Toast 收集式 L801 语义对齐）。
//   ⑤ sanity：掷数下限 / det 双跑字节级（生成即验证）。
//
// 运行：bun scripts/unity-migration/gen-rainflood.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/rainflood.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/rainflood.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（同 gen-fire.mjs） ----
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
globalThis.localStorage = { getItem: () => null, set: noop, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
if (typeof GameEngine !== 'function') throw new Error('GameEngine 未定位: ' + Object.keys(engMod).join(','));
const { T } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const N = W * H;

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
const rect = (x0, y0, x1, y1, t) => [...(() => { const a = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a.push([x, y, t]); return a; })()];

// ---- 手术式夹具构建 + calls 直调步进快照 ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-fire 同款）
  eng.terrain.fill(T.GRASS);
  eng.tempMap.fill(0);
  eng.fire.fill(0);
  eng.fireSet.clear();
  eng.frozen.clear();
  eng.flood.clear();
  eng.wet.clear();
  eng.regrow.clear();
  eng.units.length = 0;
  eng.unitById.clear();
  eng.effects.length = 0;
  eng.worldEvents.length = 0;
  eng.eventSeq = 1;
  eng.buildings.length = 0;
  eng.bIdx.clear();
  eng.building.fill(0);
  eng.owner.fill(-1);
  eng.road.fill(0);
  eng.riverDir.fill(0);
  eng.riverTiles.clear();
  eng.waterTier.fill(0);
  eng.worldsim.glacier.fill(0);
  eng.laws.seasons = spec.seasons ?? true;
  eng.yearF = spec.yearF ?? 2.5;
  eng.tickCount = spec.tickCount;
  eng.shake = 0;

  // toast 宿主回调收集器（纪律③事件流——onToast L14027 收集面入黄金）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });

  // 手术二·直写相（保序）：terrain/owner/road/regrow/flood/fire/building/glacier/soil
  for (const [x, y, t] of spec.terrain ?? []) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of spec.owner ?? []) eng.owner[idx(x, y)] = v;
  for (const [x, y, v] of spec.road ?? []) eng.road[idx(x, y)] = v;
  for (const [x, y, at] of spec.regrow ?? []) eng.regrow.set(idx(x, y), at);
  for (const [x, y, at] of spec.flood ?? []) eng.flood.set(idx(x, y), at);
  for (const [x, y, v] of spec.fire ?? []) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  for (const [x, y, kind] of spec.buildings ?? []) {
    eng.building[idx(x, y)] = kind;
    eng.buildings.push({ i: idx(x, y), x, y, kind, civ: -1 });   // civ=-1 → houses 账不触（gen-fire/Test31 形态）
    eng.bIdx.set(idx(x, y), eng.buildings.length - 1);
  }
  for (const [x, y, v] of spec.glacier ?? []) eng.worldsim.glacier[idx(x, y)] = v;
  for (const [x, y, v] of spec.soil ?? []) eng.worldsim.soilF[idx(x, y)] = v;

  // 手术二·快照：直写后/调用前的镜像输入面（黄金 fixture 通道）
  const fixture = {
    terrain0: gzB64(eng.terrain),
    owner0: gzB64(new Uint8Array(eng.owner.buffer.slice(0))),   // 字节视图序列化（Buffer.from(TypedArray) 按元素 clamp 截字节的坑——Int16/Float64 必须走 buffer 字节面）
    road0: gzB64(eng.road),
    regrow0: [...eng.regrow.entries()],
    flood0: [...eng.flood.entries()],
    fire0: gzB64(eng.fire),
    fireSet0: [...eng.fireSet],
    building0: (spec.buildings ?? []).map(([x, y, kind]) => ({ i: idx(x, y), x, y, kind })),
    glacier0: gzB64(eng.worldsim.glacier),   // worldsim.glacier = Uint8Array（worldsim.ts L90）直 gz 无损
    soil0: gzB64(eng.worldsim.soilF),
  };

  // 手术三（尾置）：rngA 清零起流 → calls 序直调 + 逐步快照（每调用一步）
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (const call of spec.calls) {
    eng[call.fn](...call.args);
    steps.push({
      fn: call.fn,
      args: call.args,
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      terrainMd5: md5hex(eng.terrain),
      fireMd5: md5hex(eng.fire),
      fireSet: [...eng.fireSet],
      flood: [...eng.flood.entries()],
      regrow: [...eng.regrow.entries()],
      wet: [...eng.wet.entries()],
      frozen: [...eng.frozen],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
      buildingsCount: eng.buildings.length,
      shake: eng.shake,
      waterTierMd5: md5hex(eng.waterTier),
      glacierMd5: md5hex(eng.worldsim.glacier),
      ownerMd5: md5hex(new Uint8Array(eng.owner.buffer)),
      roadMd5: md5hex(eng.road),
    });
  }

  // sanity（生成即验证）
  const totalDraws = (eng.rngA >>> 0) === (spec.seed >>> 0) ? 0 : chainDraws(spec.seed >>> 0, eng.rngA >>> 0);   // 零掷直通短路（S9：floodArea 全不命中 0 掷——rngA 终态 === seed 初态，链反解 0 步解不存在须先判）
  if (spec.minDraws !== undefined && totalDraws !== spec.minDraws) throw new Error(`${spec.key}: 掷数 ${totalDraws} ≠ 期望 ${spec.minDraws}`);
  if (spec.minDraws === undefined && totalDraws < 1 && spec.calls.length > 0) { /* 零掷直通场景（S9）允许 */ }
  if (spec.sanity && !spec.sanity(eng, toasts)) throw new Error(`${spec.key}: sanity 未过`);

  return {
    key: spec.key,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    tickCount: spec.tickCount,
    totalDraws,
    fixture,
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    flood: [...eng.flood.entries()],
    regrow: [...eng.regrow.entries()],
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
    toasts,
  };
}

// ---- 场景集（9 场景：rainRegrow 三支 / natureFlood 四面 / floodArea 三面） ----
// 大窗 regrow 夹具：8×8 窗 64 格全入账 → 首采样必命中（命中概率 64/64）——
// 命中支确定性化（窗内单格方案的 1/64 命中不可控——大窗全覆盖是确定化正解）。
const REGROW_WIN = [...(() => { const a = []; for (let y = 56; y < 64; y++) for (let x = 96; x < 104; x++) a.push([x, y, 3000 + ((y - 56) * 8 + (x - 96)) * 10]); return a; })()];
// at = 3000 + n*10（n=0..63 → at ∈ [3000,3630]）：
//   S1 tick=3480 → tick+60=3540 ≥ at-160 上界 3470 → max 全走 +60 支
//   S2 tick=2800 → tick+60=2860 ≤ at-160 下界 2840 → max 全走 -160 支（at=3000 时 2840<2860——格 n=0 走 +60，其余 -160——单格混合支保留在证）

// natureFlood 靶区：11×11（123-133 × 75-85）全铺——极坐标落点 xx∈[123,132]、
// yy∈[75,84]（rr<4.5 → cos*rr∈(-4.5,4.5)，靶心 (128,80)）全覆盖确定性命中。
const FLOOD_PAD = rect(123, 75, 133, 85, T.GRASS);

const BASE = 20261101;
const specs = [
  // ---- rainRegrow 三支（L10660-10671） ----
  {
    key: 'rf-rain-hit-plus60', baseSeed: BASE + 1, seed: 0x0A11F001, tickCount: 3480, minDraws: 2,
    regrow: REGROW_WIN,
    calls: [{ fn: 'rainRegrow', args: [96, 56] }],
    sanity: (eng) => [...eng.regrow.values()].some((at) => at === 3540),
  },
  {
    key: 'rf-rain-hit-minus160', baseSeed: BASE + 2, seed: 0x0A11F002, tickCount: 2800, minDraws: 2,
    regrow: REGROW_WIN,
    calls: [{ fn: 'rainRegrow', args: [96, 56] }],
    sanity: (eng) => [...eng.regrow.values()].every((at) => at === 2840 || at === 2860 || at >= 3000),
  },
  {
    key: 'rf-rain-miss-boundary', baseSeed: BASE + 3, seed: 0x0A11F003, tickCount: 3000, minDraws: 8,
    calls: [{ fn: 'rainRegrow', args: [252, 156] }],   // 窗跨右下边界——越界 continue 支 + 4 采样全 miss 支（8 掷恒定）
    sanity: (eng) => eng.regrow.size === 0,
  },
  // ---- natureFlood 四面（L10673-10693） ----
  {
    key: 'rf-nflood-basic', baseSeed: BASE + 4, seed: 0x0A11F004, tickCount: 5000,
    terrain: FLOOD_PAD,
    calls: [{ fn: 'natureFlood', args: [128, 80] }],
    // 20 采样掷 + flood.set 1 掷/唯一命中格（采样落点碰撞合法语义——重复淋同格 flood 门跳）；
    // flooded>=4 → 纪事支（碰撞自适应：flood.size 即 flooded）
    sanity: (eng) => eng.flood.size >= 9 && eng.worldEvents.length === 1,
  },
  {
    key: 'rf-nflood-cascade', baseSeed: BASE + 5, seed: 0x0A11F005, tickCount: 6000,
    terrain: FLOOD_PAD,
    owner: FLOOD_PAD.map(([x, y]) => [x, y, 5]),                       // owner 熄灭支（L994）——全铺必触达
    road: FLOOD_PAD.map(([x, y]) => [x, y, 1]),                        // road 清支（L1002）——全铺必触达
    regrow: FLOOD_PAD.map(([x, y]) => [x, y, 9999]),                   // regrow 出账支（L979）——全铺必触达
    fire: FLOOD_PAD.map(([x, y]) => [x, y, 30]),                       // fire 熄灭+fireSet 出账支（L990-993）——全铺必触达
    glacier: FLOOD_PAD.map(([x, y]) => [x, y, 80]),                    // glacier 清支（worldsim L159-163）——全铺必触达
    calls: [{ fn: 'natureFlood', args: [128, 80] }],
    // 级联五支按任一命中格断言（采样落点不可控——flood 表首格反查）
    sanity: (eng) => {
      if (eng.flood.size < 7 || eng.worldEvents.length !== 1) return false;
      for (const i of eng.flood.keys()) {
        if (eng.owner[i] !== -1 || eng.road[i] !== 0 || eng.fire[i] !== 0 || eng.fireSet.has(i) || eng.worldsim.glacier[i] !== 0) return false;
      }
      return true;
    },
  },
  {
    key: 'rf-nflood-buildings', baseSeed: BASE + 6, seed: 0x0A11F006, tickCount: 7000,
    terrain: FLOOD_PAD,
    buildings: FLOOD_PAD.map(([x, y]) => [x, y, 3]),                   // 121 座建筑全铺——命中即摧毁（smoke 2 掷/座）
    calls: [{ fn: 'natureFlood', args: [128, 80] }],
    // 摧毁数 = flooded 数（碰撞自适应）；smoke fx 计数 = 摧毁数
    sanity: (eng) => eng.flood.size >= 9 && eng.buildings.length === 121 - eng.flood.size && eng.effects.filter((e) => e.kind === 'smoke').length === 121 - eng.buildings.length && eng.worldEvents.length === 1,
  },
  {
    key: 'rf-nflood-floodgate', baseSeed: BASE + 7, seed: 0x0A11F007, tickCount: 8000,
    terrain: FLOOD_PAD,
    flood: FLOOD_PAD.map(([x, y]) => [x, y, 8050]),                    // flood 门全铺（has 即跳，不管到期）——10 采全跳 flooded=0 无纪事
    calls: [{ fn: 'natureFlood', args: [128, 80] }],
    sanity: (eng) => eng.flood.size === 121 && eng.worldEvents.length === 0,
  },
  // ---- floodArea 三面（L10695-10723） ----
  {
    key: 'rf-farea-cast', baseSeed: BASE + 8, seed: 0x0A11F008, tickCount: 9000,
    // 调用 a：r=1 → 钳 2（下钳支）——小圆 ~13 格命中；调用 b：r=50 → 钳 12（上钳支）——
    // 大圆 ~441 格（a 已淹格走 flood 门跳——交叠真实语义）；圆内四特格确定性布点：
    //   (60,60) SWAMP 跳 / (66,60) HILL 跳 / (63,60) 建筑摧毁（smoke 2 掷）/(57,60) 预置 flood 门跳
    terrain: [
      ...rect(44, 44, 76, 76, T.GRASS),
      [60, 60, T.SWAMP], [66, 60, T.HILL],
    ],
    buildings: [[63, 60, 3]],
    flood: [[57, 60, 9500]],
    calls: [
      { fn: 'floodArea', args: [60, 60, 1] },
      { fn: 'floodArea', args: [60, 60, 50] },
    ],
    sanity: (eng, toasts) => eng.effects.filter((e) => e.kind === 'tsunami').length === 2 && eng.shake === 3 && toasts.length === 2 && eng.buildings.length === 0,
    __toasts: true,
  },
  {
    key: 'rf-farea-none', baseSeed: BASE + 9, seed: 0x0A11F009, tickCount: 10000, minDraws: 0,
    terrain: rect(192, 12, 208, 28, T.DEEP),                           // 圆域全深水——五地形门全跳
    calls: [{ fn: 'floodArea', args: [200, 20, 8] }],
    sanity: (eng) => eng.flood.size === 0 && eng.effects.length === 0,   // 零掷直通（rngA 不变）——totalDraws 反解兜底
  },
];

// S8 的 sanity 闭包引用外部 toasts——buildScenario 内部收集器透传
const _build = buildScenario;
const scenarios = specs.map((s) => {
  const sc = _build(s);
  if (s.__toasts) sc.sanityToasts = sc.toasts.length;
  return sc;
});
for (const s of scenarios) {
  console.log(`${s.key}: draws=${s.totalDraws} flood=${s.stepsSnap.at(-1).flood.length} regrow=${s.stepsSnap.at(-1).regrow.length} fx=${s.fx.length} ev=${s.events.length} toast=${s.toasts.length} rngA=${s.stepsSnap.at(-1).rngA}`);
}

// ---- det 双跑（字节级） ----
const det2 = specs.map(buildScenario);
for (let i = 0; i < scenarios.length; i++) {
  if (scenarios[i].stepsSnap.at(-1).terrainMd5 !== det2[i].stepsSnap.at(-1).terrainMd5
    || scenarios[i].stepsSnap.at(-1).rngA !== det2[i].stepsSnap.at(-1).rngA
    || JSON.stringify(scenarios[i].stepsSnap) !== JSON.stringify(det2[i].stepsSnap))
    throw new Error(`det 失败 ${scenarios[i].key}`);
}
console.log('det 双跑字节级一致:', scenarios.map((s) => s.key).join(' '));

const out = {
  meta: {
    gen: 'gen-rainflood.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写（terrain/owner/road/regrow/flood/fire/buildings/glacier/soil）+ rngA 尾置清零起流 + calls 序直调（rainRegrow/natureFlood/floodArea）每调用步进快照 + onToast 收集器',
    rng: 'eng.rngA 单流；rainRegrow 2 掷/采样、natureFlood 2 掷/采样+1 掷/命中+flood.set、destroyBuilding smoke 2 掷/座、floodArea 1 掷/命中+flood.set；mulberry 纯数学反解 total（noise.ts L3-13）',
    math: 'natureFlood 极坐标 Math.cos/sin + floodArea Math.hypot——bun fdlibm 同 runtime；C# FdSin/FdCos/FdHypot 位精确件对账（WbMath 既有件零新增）',
    domains: ['rainRegrow L10660-10671', 'natureFlood L10673-10693', 'floodArea L10695-10723', 'setTerrain 级联（WbBail 已译件复用）', 'destroyBuilding L1936-1955（smoke fx）', 'toast onToast L14027'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/rainflood.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/rainflood.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('rainflood.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
