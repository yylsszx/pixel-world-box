// ============================================================================
// gen-tool.mjs —— M-U14 切片一「applyTool 大分发器」黄金向量（骨架 + 守卫 + 17 case 标签）
//   蓝本 engine.ts applyTool L13230-13420。切片一边界（Task 170 台账推荐口径）：
//   ① 守卫 L13233：!TOOL_BY_ID[toolId] && !parseCreationTool(toolId) → early return
//     （TOOL_BY_ID 210 键 = TOOLS 86 + item_* 117 + legacy 7；cre: 前缀 creations.ts L243）
//   ② 骨架 L13234-13251：pv 参数提取 + r/rP（radius 参数 vs this.brush 笔刷回退）+
//     count/countP/power/powerP/duration/durationP（slice-1 消费 r/rP——其余机械提取在位）
//   ③ 内联 case：raise L13298-13310（三段抬升）+ 九地形笔刷 L13311-13327（forest 双门
//     continue：water + mountain）+ fire L13328-13336（ignite 逐格 L1078——flammable 门 +
//     building 门 + 150+floor(rng*90) 1 掷/点燃）
//   ④ 委派 case（callee 已译件复用）：flood→floodArea（rP ?? 5，M-U11）+ oasis→createOasis
//     + smooth→smoothTerrain(r) + rough→roughenTerrain(r) + plague→plagueArea(max(3,r)) +
//     heal→healArea(r) + kill→killArea(r) + boom→boom(rP——undefined → 默认 2.4，M-U13）
//   ⑤ 挂账（本切片不译，switch 注记）：chest/chest2/chest3 L13253 + ITEM_TOOL L13259 +
//     cre: L13264 + RACE_TOOL L13278 四前置支（物品/造物/种族域切片）+ river L13353/nuke
//     L13352（callee WbWorldgen.CarveRiver/Nuke 在位——M-U15 切片二随三神力创建函数接入）+
//     lightning/tornado/earthquake/meteor/finger/acidrain/volcano/tsunami/blizzard/
//     meteorshower/locust/drought/rain/bless/curse/love/mutate/teleport/wrath/holystorm/
//     plasmacannon/annihilate/sandstorm/typhoon/sinkhole/iceage/famine/blackhole 28 case
//     （callee 未译随各域切片）。
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），手术式夹具直写 +
// rngA 尾置清零起流 + calls 序直调（每调用后快照——gen-brush M-U13 协议同构）。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA——raise/九笔刷/smooth 零掷；fire 1 掷/点燃格；floodArea 掷流
//     （M-U11）；createOasis 浅滩+环带+fx（M-U13）；heal fx 2 掷；boom fx 2 掷。
//   ② Math.hypot 域：raise/九笔刷格距——bun 原生 fdlibm；C# FdHypot 位精确件对账。
//   ③ setTerrain 全级联随件（WbBail L1959 已译件复用）：regrow 出账/owner 熄灭/fire 熄灭
//     fireSet 出/road 清/glacier 清/waterTier——S4 ice/lava 触达。
//   ④ toast 宿主回调（L14027 onToast）——createOasis 文本入黄金 toasts（纪律③事件流）。
//   ⑤ sanity：掷数下限 / det 双跑字节级（生成即验证）。
//
// 运行：bun scripts/unity-migration/gen-tool.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/tool.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（同 gen-brush.mjs） ----
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
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
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

// 瘦单位直写（gen-brush mkUnit 协议同源）
function mkUnit(eng, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
    hp: o.hp ?? 10, maxHp: o.maxHp ?? o.hp ?? 10, dmg: 1, speed: o.speed ?? 1, age: o.age ?? 0, maxAge: o.maxAge ?? 9999, kills: 0,
    cd: 0, trait: o.trait ?? 0, job: o.job ?? 0, king: 0, infected: o.infected ?? false, flip: 0,
    name: `u${o.id}`, hurt: o.hurt ?? 0, breath: 0, parity: 0, dead: o.dead ?? 0,
    fam: null, fgn: null, gene: o.gene ?? null, army: null,
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}

// units dump 协议（gen-brush dumpUnit 同构）
function dumpUnit(u) {
  return {
    id: u.id, race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx ?? u.x), ty: f64hex(u.ty ?? u.y),
    hp: f64hex(u.hp ?? 10), maxHp: f64hex(u.maxHp ?? 10), dmg: f64hex(u.dmg ?? 1), speed: f64hex(u.speed ?? 1),
    age: f64hex(u.age ?? 0), maxAge: f64hex(u.maxAge ?? 9999),
    hurtN: u.hurt === undefined || u.hurt === null ? null : f64hex(u.hurt),
    dead: u.dead ? 1 : 0, flip: u.flip ? 1 : 0, infected: u.infected ? 1 : 0,
    job: u.job === undefined ? null : u.job, name: u.name ?? null,
    gene: u.gene ? { s: f64hex(u.gene.s), d: f64hex(u.gene.d), h: f64hex(u.gene.h), r: f64hex(u.gene.r) } : null,
    fam: u.fam ?? null, fgn: u.fgn ?? null,
    breath: u.breath ?? null, parity: u.parity ?? null, kills: u.kills ?? null,
  };
}

// ---- 手术式夹具构建 + calls 直调步进快照（gen-brush buildScenario 同构——calls 走 applyTool） ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-brush 同款 + brush 本域直写面）
  eng.terrain.fill(spec.fill === 'deep' ? T.DEEP : T.GRASS);
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
  eng.radiate.fill(0);
  eng.radSet.clear();
  eng.laws.seasons = spec.seasons ?? true;
  eng.yearF = spec.yearF ?? 2.5;
  eng.tickCount = spec.tickCount;
  eng.shake = 0;
  eng.brush = spec.brush ?? 3;                     // L688 类字段默认 3——applyTool r 回退消费面

  // toast 宿主回调收集器（纪律③事件流——onToast L14027 收集面入黄金）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });

  // 手术二·直写相（保序）：terrain/owner/regrow/flood/fire/building/soil/variant/radiate/units
  for (const [x, y, t] of spec.terrain ?? []) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of spec.owner ?? []) eng.owner[idx(x, y)] = v;
  for (const [x, y, at] of spec.regrow ?? []) eng.regrow.set(idx(x, y), at);
  for (const [x, y, at] of spec.flood ?? []) eng.flood.set(idx(x, y), at);
  for (const [x, y, v] of spec.fire ?? []) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  for (const [x, y, kind] of spec.buildings ?? []) {
    eng.building[idx(x, y)] = kind;
    eng.buildings.push({ i: idx(x, y), x, y, kind, civ: -1 });
    eng.bIdx.set(idx(x, y), eng.buildings.length - 1);
  }
  for (const [x, y, v] of spec.soil ?? []) eng.worldsim.soilF[idx(x, y)] = v;
  for (const [x, y, v] of spec.variant ?? []) eng.variant[idx(x, y)] = v;
  for (const [x, y, v] of spec.radiate ?? []) { eng.radiate[idx(x, y)] = v; eng.radSet.set(idx(x, y), spec.tickCount + 500); }
  for (const uo of spec.units ?? []) mkUnit(eng, uo);

  // 手术二·快照：直写后/调用前的镜像输入面（黄金 fixture 通道）
  const fixture = {
    terrain0: gzB64(eng.terrain),
    owner0: gzB64(new Uint8Array(eng.owner.buffer.slice(0))),
    regrow0: [...eng.regrow.entries()],
    flood0: [...eng.flood.entries()],
    fire0: gzB64(eng.fire),
    fireSet0: [...eng.fireSet],
    building0: (spec.buildings ?? []).map(([x, y, kind]) => ({ i: idx(x, y), x, y, kind })),
    soil0: gzB64(eng.worldsim.soilF),
    // variant0 不入 fixture（R3 体积红线——variant 全域=Hash2(x,y,baseSeed+999) 确定域，
    // C# 侧 WbNoise.Hash2 重建；无重掷消费 case 本域 variantMd5 恒定面）
    radiate0: gzB64(eng.radiate),
    radSet0: [...eng.radSet.entries()],
    brush0: eng.brush,
    units0: (spec.units ?? []).map((uo) => ({
      id: uo.id, race: uo.race, x: uo.x, y: uo.y, hp: uo.hp ?? 10, maxHp: uo.maxHp ?? uo.hp ?? 10,
      gene: uo.gene ?? null, dead: uo.dead ?? 0, infected: uo.infected ?? false, hurt: uo.hurt ?? 0, trait: uo.trait ?? 0,
    })),
    yearF0: eng.yearF,
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
      variantMd5: md5hex(eng.variant),
      radiateMd5: md5hex(eng.radiate),
      radSet: [...eng.radSet.entries()],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
      buildingsCount: eng.buildings.length,
      shake: eng.shake,
      unitsCount: eng.units.length,
    });
  }

  // sanity（生成即验证）
  const totalDraws = (eng.rngA >>> 0) === (spec.seed >>> 0) ? 0 : chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  if (spec.minDraws !== undefined && totalDraws !== spec.minDraws) throw new Error(`${spec.key}: 掷数 ${totalDraws} ≠ 期望 ${spec.minDraws}`);
  if (spec.sanity && !spec.sanity(eng, toasts)) {
    console.error(`DIAG ${spec.key}: draws=${totalDraws} rngA=${(eng.rngA >>> 0).toString(16)} shake=${eng.shake} fx=${JSON.stringify(eng.effects.map((e) => ({ k: e.kind, r: e.r })))} bld=${eng.buildings.map((b) => b.i)} units=${JSON.stringify(eng.units.map((u) => ({ id: u.id, hp: u.hp, hurt: u.hurt, dead: u.dead, inf: u.infected })))} ev=${JSON.stringify(eng.worldEvents.map((e) => e.text))} toasts=${JSON.stringify(toasts.map((t) => t.text))} t10060=${eng.terrain[idx(100, 60)]} t9960=${eng.terrain[idx(99, 60)]} fire10060=${eng.fire[idx(100, 60)]}`);
    throw new Error(`${spec.key}: sanity 未过`);
  }

  return {
    key: spec.key,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    tickCount: spec.tickCount,
    totalDraws,
    fixture,
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    variantMd5: md5hex(eng.variant),
    radiate: gzB64(eng.radiate),
    radSet: [...eng.radSet.entries()],
    regrow: [...eng.regrow.entries()],
    shake: eng.shake,
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
    units: eng.units.map(dumpUnit),
    toasts,
  };
}

// ---- 场景集（12 场景：守卫/骨架/内联三面/委派八面） ----
// 靶区：中心 (100,60)；brush 直写面走 spec.brush（L688 默认 3）
const BASE = 20261105;
const specs = [
  // ---- S1：守卫 early return（未知工具——TOOL_BY_ID 无 + 非 cre: 前缀；零掷零写） ----
  {
    key: 'guard-unknown', baseSeed: BASE + 1, seed: 0x0B600001, tickCount: 1000, fill: 'deep',
    terrain: rect(98, 58, 102, 62, T.GRASS),
    calls: [{ fn: 'applyTool', args: ['no-such-tool', 100, 60] }],
    minDraws: 0,
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.GRASS && eng.effects.length === 0 && eng.units.length === 0,
  },
  // ---- S2：raise 三段抬升（DEEP→WATER→SAND→GRASS 三支全触达；零 rng；brush=4 圆域） ----
  {
    key: 'raise-stages', baseSeed: BASE + 2, seed: 0x0B600002, tickCount: 1000, fill: 'deep',
    terrain: [...rect(97, 57, 103, 63, T.WATER), ...rect(99, 59, 101, 61, T.SAND)],
    brush: 4,
    calls: [{ fn: 'applyTool', args: ['raise', 100, 60] }],
    minDraws: 0,
    // 中心 SAND→GRASS（(99,59) d=1.41≤4）/(98,58) WATER→SAND（d=2.83）/(100,64) DEEP→WATER
    // （d=4 恰等内含——L13302 > r continue 面）/(97,57) d=4.24>4 环外 WATER 不动
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.GRASS && eng.terrain[idx(98, 58)] === T.SAND
      && eng.terrain[idx(100, 64)] === T.WATER && eng.terrain[idx(97, 57)] === T.WATER,
  },
  // ---- S3：forest 双 continue 门（water 门 + mountain 门 + 恰等内含 d=4 面） ----
  {
    key: 'forest-gates', baseSeed: BASE + 3, seed: 0x0B600003, tickCount: 1000, fill: 'deep',
    terrain: [...rect(95, 55, 105, 65, T.GRASS), ...rect(97, 58, 99, 60, T.WATER), ...rect(101, 59, 103, 61, T.MOUNTAIN)],
    brush: 4,
    calls: [{ fn: 'applyTool', args: ['forest', 100, 60] }],
    minDraws: 0,
    // (97,58) d=3.6≤4 WATER 门跳 / (101,59) d=1.41 MOUNTAIN 门跳 / (104,60) d=4 恰等内含 FOREST /
    // (100,58) d=2 GRASS→FOREST
    sanity: (eng) => eng.terrain[idx(97, 58)] === T.WATER && eng.terrain[idx(101, 59)] === T.MOUNTAIN
      && eng.terrain[idx(104, 60)] === T.FOREST && eng.terrain[idx(100, 58)] === T.FOREST,
  },
  // ---- S4：九笔刷其余五支步进（mountain→snow→lava→ice→swamp——map 查表 + setTerrain 级联；
  //        五中心两两相离≥5 格（r=2 圆域零重叠）----
  {
    key: 'brush-nine-rest', baseSeed: BASE + 4, seed: 0x0B600004, tickCount: 1000, fill: 'deep',
    terrain: rect(95, 55, 105, 65, T.GRASS),
    brush: 2,
    calls: [
      { fn: 'applyTool', args: ['mountain', 98, 58] },
      { fn: 'applyTool', args: ['snow', 103, 58] },
      { fn: 'applyTool', args: ['lava', 98, 63] },
      { fn: 'applyTool', args: ['ice', 103, 63] },
      { fn: 'applyTool', args: ['swamp', 100, 60] },
    ],
    minDraws: 0,
    // 五连步进——终态 (98,58) MOUNTAIN / (103,58) SNOW / (98,63) LAVA / (103,63) ICE / (100,60) SWAMP
    sanity: (eng) => eng.terrain[idx(98, 58)] === T.MOUNTAIN && eng.terrain[idx(103, 58)] === T.SNOW
      && eng.terrain[idx(98, 63)] === T.LAVA && eng.terrain[idx(103, 63)] === T.ICE
      && eng.terrain[idx(100, 60)] === T.SWAMP,
  },
  // ---- S5：fire 逐格点燃（flammable 门 + building 门 + 1 掷/点燃——20 点燃 20 掷） ----
  {
    key: 'fire-ignite', baseSeed: BASE + 5, seed: 0x0B600005, tickCount: 1000, fill: 'deep',
    terrain: [...rect(96, 56, 104, 64, T.GRASS), ...rect(99, 59, 101, 61, T.WATER)],
    buildings: [[103, 60, 3]],
    brush: 3,
    calls: [{ fn: 'applyTool', args: ['fire', 100, 60] }],
    // r=3 圆域 29 格 − 9 水格（flammable 门零掷）= 20 点燃（含建筑格 (103,60)——GRASS 可燃
    // 且 building>0 不过 L1081 门，蓝本语义建筑可燃）；fire 值 150+floor(rng*90)
    minDraws: 20,
    sanity: (eng) => eng.fire[idx(100, 58)] > 0 && eng.fire[idx(99, 60)] === 0
      && eng.fire[idx(103, 60)] > 0 && eng.fireSet.size === 20 && eng.fire[idx(107, 60)] === 0,
  },
  // ---- S6：smooth radius 参数 vs brush 回退（双调用步进——零 rng 确定域） ----
  {
    key: 'smooth-radius', baseSeed: BASE + 6, seed: 0x0B600006, tickCount: 1000, fill: 'deep',
    terrain: [...rect(95, 55, 105, 65, T.GRASS), [100, 60, T.SAND], [100, 61, T.SAND], [101, 60, T.SAND], [96, 56, T.SAND]],
    brush: 3,
    calls: [
      { fn: 'applyTool', args: ['smooth', 100, 60] },             // r=brush=3：(96,56) 环外 SAND 孤格不动
      { fn: 'applyTool', args: ['smooth', 100, 60, { radius: 5 }] }, // r=5：(96,56) d=5.66>5 仍外——(97,57) d=4.24 内
    ],
    minDraws: 0,
    // 步一 r=3：(100,60)/(100,61)/(101,60) SAND 噪声被 GRASS 众数抹平；(96,56) 环外不动
    // 步二 r=5：全域 GRASS 众数——(96,56) d=5.66 仍外不动（半径参数面零变更步进）
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.GRASS && eng.terrain[idx(101, 60)] === T.GRASS,
  },
  // ---- S7：flood rP 默认 5 vs radius 2（rP ?? 5 面——M-U11 floodArea 掷流随件） ----
  {
    key: 'flood-rp', baseSeed: BASE + 7, seed: 0x0B600007, tickCount: 1000, fill: 'deep',
    terrain: rect(95, 55, 105, 65, T.GRASS),
    brush: 3,
    calls: [
      { fn: 'applyTool', args: ['flood', 100, 60] },              // rP undefined → 5（case 内 ?? 5）
      { fn: 'applyTool', args: ['flood', 100, 60, { radius: 2 }] }, // rP=2
    ],
    // 步一 r=5：81 格 flood.set（1 掷/格）+ terrain→WATER + fx tsunami + shake=3；
    // 步二 r=2：flood.has 门全跳零掷零写（步一 r=5 ⊃ r=2 域）
    sanity: (eng) => eng.flood.size === 81 && eng.terrain[idx(100, 60)] === T.WATER
      && eng.terrain[idx(97, 57)] === T.WATER && eng.terrain[idx(94, 60)] === T.DEEP,
  },
  // ---- S8：plague max(3,r) 下钳（brush=1 → r=3；undead 跳 + immune 豁免；零 rng） ----
  {
    key: 'plague-floor', baseSeed: BASE + 8, seed: 0x0B600008, tickCount: 1000, fill: 'deep',
    units: [
      { id: 800, race: R.SHEEP, x: 100, y: 60 },                    // 感染
      { id: 801, race: R.SHEEP, x: 102.5, y: 60, trait: 'immune' }, // d=2.5<3 免疫豁免
      { id: 802, race: R.ZOMBIE, x: 99, y: 60 },                    // undead 跳
      { id: 803, race: R.SHEEP, x: 104, y: 60 },                    // d=4 界外
    ],
    brush: 1,
    calls: [{ fn: 'applyTool', args: ['plague', 100, 60] }],
    minDraws: 0,
    sanity: (eng) => eng.unitById.get(800).infected && !eng.unitById.get(801).infected
      && !eng.unitById.get(802).infected && !eng.unitById.get(803).infected,
  },
  // ---- S9：oasis 调用面（createOasis 全掷流——barren 文本 + 泉眼/浅滩/环带） ----
  {
    key: 'oasis-via-tool', baseSeed: BASE + 9, seed: 0x0B600009, tickCount: 1000, fill: 'deep',
    terrain: rect(93, 53, 107, 67, T.SAND),
    brush: 3,
    calls: [{ fn: 'applyTool', args: ['oasis', 100, 60] }],
    // pondR=clamp(brush=3,2,6)=3：泉眼/浅滩/环带 + fx×2 + barren 文本（gen-brush S3 同构）
    sanity: (eng, toasts) => eng.terrain[idx(100, 60)] === T.WATER && toasts.length === 1
      && toasts[0].text === '荒漠中涌出一泓清泉，绿意环绕',
  },
  // ---- S10：heal→kill 双委派（r=brush=5——复苏链 + 圆域处决；步进快照） ----
  {
    key: 'heal-kill-via', baseSeed: BASE + 10, seed: 0x0B60000A, tickCount: 1000, fill: 'deep',
    terrain: [...rect(96, 56, 104, 64, T.GRASS), [100, 60, T.BURNT], [101, 60, T.ICE]],
    fire: [[102, 60, 30]],
    radiate: [[103, 60, 40]],
    units: [
      { id: 810, race: R.SHEEP, x: 100, y: 60, hp: 3, maxHp: 10, hurt: 8, infected: true },
      { id: 811, race: R.SHEEP, x: 105, y: 60, hp: 3, maxHp: 10, hurt: 8, infected: true },   // d=5 恰等内含
      { id: 812, race: R.SHEEP, x: 106, y: 60, hp: 3, maxHp: 10, hurt: 8, infected: true },   // d=6 界外
    ],
    brush: 5,
    calls: [
      { fn: 'applyTool', args: ['heal', 100, 60] },   // 满血三清 + 复苏 + 融冰 + 熄火 + 清辐射 + fx heart 2 掷
      { fn: 'applyTool', args: ['kill', 100, 60] },   // (100,60)/(105,60) 处决 + (106,60) 幸存（零 rng）
    ],
    // heal r=brush=5：u0/u1 满血 u2 界外；kill r=5：u0/u1 dead；BURNT→GRASS + ICE→WATER
    sanity: (eng) => eng.unitById.get(810).dead && eng.unitById.get(811).dead
      && !eng.unitById.get(812).dead && eng.terrain[idx(100, 60)] === T.GRASS
      && eng.terrain[idx(101, 60)] === T.WATER && eng.fire[idx(102, 60)] === 0
      && eng.radiate[idx(103, 60)] === 0,
  },
  // ---- S11：boom rP 默认 2.4 vs radius 0.3（rP undefined → JS 默认参面 + 钳位面） ----
  {
    key: 'boom-rp', baseSeed: BASE + 11, seed: 0x0B60000B, tickCount: 1000, fill: 'deep',
    terrain: rect(95, 55, 105, 65, T.GRASS),
    buildings: [[101, 60, 3], [105, 60, 3]],
    units: [
      { id: 820, race: R.SHEEP, x: 100, y: 60, hp: 50, maxHp: 50 },
      { id: 821, race: R.SHEEP, x: 101.5, y: 60, hp: 50, maxHp: 50 },   // d=1.5<2.9 dead（步一）
      { id: 822, race: R.SHEEP, x: 102.9, y: 60, hp: 50, maxHp: 50 },   // d=2.9 恰等不含
      { id: 823, race: R.SHEEP, x: 103.5, y: 60, hp: 50, maxHp: 50 },   // 环外
    ],
    brush: 3,
    calls: [
      { fn: 'applyTool', args: ['boom', 100, 60] },                    // rP undefined → 默认 2.4
      { fn: 'applyTool', args: ['boom', 100, 60, { radius: 0.3 }] },   // rr=max(1,0.3)=1 下钳
    ],
    // 步一：u0/u1 dead + (101,60) d=1<2.4 摧毁 + shake=min(9,round(4.4))=4
    // 步二：rr=1 下钳——u1 d=1.5 恰等排除面不伤 + 无新摧毁；shake=max(4,min(9,round(3)))=4
    sanity: (eng) => eng.units.filter((u) => u.dead).length === 2
      && eng.unitById.get(822).hp === 50 && eng.buildings.length === 1
      && eng.buildings[0].i === idx(105, 60) && eng.shake === 4,
  },
  // ---- S12：混合调用序（raise→forest→fire→boom→heal→smooth 六步分发广度 + rng 链连续） ----
  {
    key: 'mixed-sequence', baseSeed: BASE + 12, seed: 0x0B60000C, tickCount: 1000, fill: 'deep',
    terrain: [...rect(96, 56, 104, 64, T.GRASS), [100, 60, T.SAND]],
    buildings: [[103, 60, 3]],
    units: [
      { id: 830, race: R.SHEEP, x: 100, y: 60, hp: 50, maxHp: 50 },
      { id: 831, race: R.SHEEP, x: 101, y: 60, hp: 50, maxHp: 50 },
    ],
    brush: 3,
    calls: [
      { fn: 'applyTool', args: ['raise', 100, 60] },    // 零 rng（SAND/GRASS 无抬升支）
      { fn: 'applyTool', args: ['forest', 100, 60] },   // GRASS→FOREST（SAND 门无 forest 门）
      { fn: 'applyTool', args: ['fire', 100, 60] },     // 逐格点燃（含 FOREST 可燃——掷流）
      { fn: 'applyTool', args: ['boom', 100, 60] },     // 伤员 + shake + 建筑摧毁
      { fn: 'applyTool', args: ['heal', 100, 60] },     // 熄火 + 满血（r=3）
      { fn: 'applyTool', args: ['smooth', 100, 60] },   // 众数抹平（零 rng）
    ],
    // 终态：boom（rP 默认 2.4）双单位 dead（heal 只回 hp 不清 dead——尸体满血镜像面）+
    // 建筑幸存（(103,60) d=3>2.4 环外）+ heal 熄火 r=3 全域 + forest→smooth 终态 FOREST
    sanity: (eng) => eng.unitById.get(830).dead && eng.unitById.get(831).dead
      && eng.unitById.get(830).hp === 50 && eng.fireSet.size === 0
      && eng.terrain[idx(100, 60)] === T.FOREST && eng.buildings.length === 1,
  },
];

for (const s of specs.map((sp) => buildScenario(sp))) {
  console.log(`${s.key}: draws=${s.totalDraws} fx=${s.fx.length} ev=${s.events.length} units=${s.units.length} shake=${s.shake} rngA=${s.stepsSnap.at(-1).rngA}`);
}

// ---- det 双跑（字节级） ----
const det2 = specs.map(buildScenario);
for (let i = 0; i < specs.length; i++) {
  const a = buildScenario(specs[i]);
  if (a.stepsSnap.at(-1).terrainMd5 !== det2[i].stepsSnap.at(-1).terrainMd5
    || a.stepsSnap.at(-1).rngA !== det2[i].stepsSnap.at(-1).rngA
    || JSON.stringify(a.stepsSnap) !== JSON.stringify(det2[i].stepsSnap)
    || JSON.stringify(a.units) !== JSON.stringify(det2[i].units)
    || JSON.stringify(a.fx) !== JSON.stringify(det2[i].fx)
    || JSON.stringify(a.toasts) !== JSON.stringify(det2[i].toasts))
    throw new Error(`det 失败 ${specs[i].key}`);
}
console.log('det 双跑字节级一致:', specs.map((s) => s.key).join(' '));

const scenarios = specs.map((sp) => buildScenario(sp));
const out = {
  meta: {
    gen: 'gen-tool.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写（fill 面 deep + terrain/owner/regrow/flood/fire/buildings/soil/variant/radiate/units 瘦直写 + brush 直写）+ rngA 尾置清零起流 + calls 序直调（applyTool 大分发器）每调用步进快照',
    rng: 'eng.rngA 单流；raise/九笔刷/smooth/plague/kill 守卫 unknown 零掷；fire 1 掷/点燃格（L1083）；floodArea 掷流（M-U11 随件）；createOasis 浅滩 1 掷/格+环带+fx×2（M-U13 随件）；heal fx 2 掷；boom fx 2 掷/次；mulberry 纯数学反解 total',
    math: '纯算术域 + Math.hypot（raise/九笔刷格距——bun 原生 fdlibm；C# FdHypot 位精确件对账——无 +0.5 偏移）+ boom 像素距/oasis 整数极距/heal 格距（M-U13 随件）+ smooth counts Map 插入序 tie-break（C# Dictionary 枚举序同构）',
    domains: ['applyTool L13230-13420 切片一（守卫 L13233 + 骨架 L13234-13251 + raise L13298-13310 + 九笔刷 L13311-13327 + fire L13328-13336 + flood L13363-13364 + oasis/smooth/rough/plague L13355-13362 + heal/kill/boom L13385-13390）', 'ignite L1078-1085（已译件 IgniteE 复用）', 'floodArea L10690+（M-U11 随件）', '七函数 L12292-12626（M-U13 随件）', 'setTerrain 级联（WbBail 已译件复用）', 'toast L13990-13992 onToast 收集', 'addEvent L13995-14009 unshift+cap80'],
    deferred: ['chest/chest2/chest3 L13253', 'ITEM_TOOL L13259', 'cre: L13264', 'RACE_TOOL L13278', 'nuke L13352', 'river L13353', 'lightning/tornado/earthquake/meteor/finger/acidrain/volcano/tsunami/blizzard/meteorshower/locust/drought/rain/bless/curse/love/mutate/teleport/wrath/holystorm/plasmacannon/annihilate/sandstorm/typhoon/sinkhole/iceage/famine/blackhole'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/tool.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('tool.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
