// ============================================================================
// gen-brush.mjs —— M-U13 切片「地形整形与邻域神力域」黄金向量（七函数建库）
//   ① boom L12292-12306（爆炸冲击——单位环 160×max(0.1,1-d/(rr+0.5)) falloff + hurt 30 +
//      建筑圆域 destroyBuilding 级联 + fx explosion{r:rr} 2 掷 + shake=max(·,min(9,round(2+rr)))
//      + onSound 注记；零 rng 除 fx——调用面 applyTool 'boom' L13404 未译，本体先行建库
//      ——annihilate L9559 M-U10h 本体先例同构）
//   ② createOasis L12444-12486（绿洲泉眼——pondR=clamp(brush,2,6) 环带三层：
//      d≤0.55R 泉眼清潭（MOUNTAIN 幸存）/ d≤R 浅滩 rng<0.8 / d≤R+2 草木环带
//      （SAND|BURNT→GRASS greened++ + rng<0.3 FOREST palms++；GRASS rng<0.08 FOREST）+
//      fx spawn×2（4 掷）+ toast barren 双文本 + addEvent oasis 棕榈计数插值 + onSound 注记）
//   ③ smoothTerrain L12489-12520（平滑笔刷——3×3 众数滤波先算后写：counts Map
//      插入序 tie-break + bestC>=5 过半门 + 批量 setTerrain；零 rng 确定域）
//   ④ roughenTerrain L12521-12563（粗糙笔刷——边缘 kinds>=2 格 rng<0.5 吸入 +
//      内部格 variant=floor(rng*256) 色抖重掷 markDirty + 二遍邻居随机替换；
//      调用面同上，本体先行）
//   ⑤ plagueArea L12594-12599（瘟疫降临——圆域感染 + undead 跳 + immune 特质豁免；零 rng）
//   ⑥ healArea L12600-12622（治疗大地——单位满血/解感染/清 hurt + 熄火 fireSet 出 +
//      BURNT→GRASS 复苏 + ICE meltIce + radiate/radSet 清 + fx heart 2 掷 + onSound 注记）
//   ⑦ killArea L12623-12626（死亡之指——圆域处决 dead=true；零 rng）
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），手术式夹具直写 +
// rngA 尾置清零起流 + calls 序直调（每调用后快照——gen-rainflood M-U11 协议同构）。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA——boom 零掷（fx 2 掷/次）；createOasis 浅滩 1 掷/格 +
//     环带沙格 1 掷（+棕榈命中 1）+ 环带草格 1 掷 + fx×2（4 掷）；roughen 内部格 1 掷
//     （variant）+ 边缘格 1 掷（0.5 门）+ 被选边缘 1 掷（邻居采样）；heal fx 2 掷。
//     boom/killArea/plagueArea/smoothTerrain 零掷确定域。
//   ② Math.hypot 域：boom 单位像素距/建筑格心距 + createOasis 整数极距 + smooth/rough
//     格距——bun 原生 fdlibm 与 gen 同 runtime 同位；C# FdHypot 位精确件对账
//     （WbMath L43 既有件；floodArea M-U11 格角距同构——无 +0.5 偏移）。
//   ③ setTerrain 全级联随件（WbBail L1959 已译件）：regrow 出账/owner 熄灭/fire 熄灭
//     fireSet 出/road 清/glacier 清/waterTier——S6/S8/S10 触达。
//   ④ toast 宿主回调（L14027 onToast）——createOasis 双文本入黄金 toasts（纪律③事件流）。
//   ⑤ sanity：掷数下限 / det 双跑字节级（生成即验证）。
//
// 运行：bun scripts/unity-migration/gen-brush.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/brush.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/brush.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（同 gen-rainflood.mjs） ----
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

// 瘦单位直写（gen-eco mkUnit 协议同源 + heal/plague/kill 改面 hp/infected/hurt/trait 透传）
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

// units dump 协议（gen-eco dumpUnit 同构——heal 改面 hp/hurt/infected 位级对账）
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

// ---- 手术式夹具构建 + calls 直调步进快照 ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-rainflood 同款 + variant/radiate/brush 本域直写面）
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
  eng.brush = spec.brush ?? 3;                     // L688 类字段默认 3——createOasis pondR=clamp(brush,2,6)

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
    // C# 侧 WbNoise.Hash2 重建；rough 重掷面由终态 variantMd5 对账）
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
    console.error(`DIAG ${spec.key}: draws=${totalDraws} rngA=${(eng.rngA >>> 0).toString(16)} shake=${eng.shake} fx=${JSON.stringify(eng.effects.map((e) => ({ k: e.kind, r: e.r })))} bld=${eng.buildings.map((b) => b.i)} units=${JSON.stringify(eng.units.map((u) => ({ id: u.id, hp: u.hp, hurt: u.hurt, dead: u.dead, inf: u.infected })))} ev=${JSON.stringify(eng.worldEvents.map((e) => e.text))} toasts=${JSON.stringify(toasts.map((t) => t.text))} t10060=${eng.terrain[idx(100, 60)]} t9960=${eng.terrain[idx(99, 60)]}`);
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

// ---- 场景集（12 场景：七函数全分支） ----
// boom 靶区：中心 (100,60)；u0 中心 d=0 / u1 d=1.5 / u2 d=2.9 边缘 / u3 d=3.5 环外（rr=2.4 → 界 rr+0.5=2.9 恰等内含）
const BOOM_UNITS = (base) => [
  { id: base, race: R.SHEEP, x: 100, y: 60, hp: 50, maxHp: 50 },
  { id: base + 1, race: R.SHEEP, x: 101.5, y: 60, hp: 50, maxHp: 50 },
  { id: base + 2, race: R.SHEEP, x: 102.9, y: 60, hp: 50, maxHp: 50 },
  { id: base + 3, race: R.SHEEP, x: 103.5, y: 60, hp: 50, maxHp: 50 },
];
const BASE = 20261104;
const specs = [
  // ---- S1：boom 默认 r=2.4 中心面（零掷除 fx 2——falloff 三支 + 建筑摧毁级联 + shake=4） ----
  {
    key: 'boom-center', baseSeed: BASE + 1, seed: 0x0B500001, tickCount: 1000, fill: 'deep',
    terrain: rect(98, 58, 102, 62, T.GRASS),
    buildings: [[101, 60, 3], [104, 60, 3]],
    units: BOOM_UNITS(100),
    calls: [{ fn: 'boom', args: [100, 60] }],
    // u0 d=0 hp50-160=-110 dead / u1 d=1.5 hp50-160*(1-1.5/2.9)=-27.24 dead / u2 d=2.9 恰等**不含**（L12295 严格 <）hp50 不动 / u3 d=3.5 环外
    // 建筑 (101,60) d=1<2.4 摧毁 smoke 2 掷 / (104,60) d=4 环外幸存；shake=min(9,round(4.4))=4；掷流 4=smoke 2+explosion 2
    sanity: (eng) => eng.units.filter((u) => u.dead).length === 2
      && eng.unitById.get(102).hp === 50 && eng.unitById.get(103).hp === 50
      && eng.buildings.length === 1 && eng.buildings[0].i === idx(104, 60)
      && eng.shake === 4 && eng.effects.length === 2 && eng.effects[1].kind === 'explosion',
  },
  // ---- S2：boom 钳位双支（r=0.3→rr=1 下钳 / r=50→rr=8 上钳——两调用步进快照） ----
  {
    key: 'boom-clamp', baseSeed: BASE + 2, seed: 0x0B500002, tickCount: 1000, fill: 'deep',
    terrain: rect(95, 55, 105, 65, T.GRASS),
    buildings: [[100, 60, 3], [105, 60, 3], [110, 60, 3]],
    units: BOOM_UNITS(200),
    calls: [{ fn: 'boom', args: [100, 60, 0.3] }, { fn: 'boom', args: [100, 60, 50] }],
    // a: rr=1 → (100,60) d=0<1 摧毁 / (105,60) d=5 幸存；u1 d=1.5<1.5 假不伤（恰等排除面）
    // b: rr=8 → (105,60) d=5<8 摧毁 / (110,60) d=10 幸存；shake=min(9,round(10))=9 封顶
    sanity: (eng) => eng.buildings.length === 1 && eng.buildings[0].i === idx(110, 60) && eng.shake === 9,
  },
  // ---- S3：createOasis 荒地中心（SAND 全域 brush=3 → pondR=3 ringR=5；棕榈掷流 + barren 双文本） ----
  {
    key: 'oasis-barren', baseSeed: BASE + 3, seed: 0x0B500003, tickCount: 1000, fill: 'deep',
    terrain: rect(93, 53, 107, 67, T.SAND),
    calls: [{ fn: 'createOasis', args: [100, 60] }],
    // 泉眼 d≤1.65 全 WATER / 浅滩 1.65<d≤3 rng<0.8 / 环带 3<d≤5 SAND→GRASS + rng<0.3 FOREST
    sanity: (eng, toasts) => eng.terrain[idx(100, 60)] === T.WATER && toasts.length === 1
      && toasts[0].text === '荒漠中涌出一泓清泉，绿意环绕' && eng.worldEvents.length === 1
      && eng.worldEvents[0].kind === 'oasis' && eng.worldEvents[0].text.includes('绿洲'),
  },
  // ---- S4：createOasis 草地中心（非荒地文本 + GRASS 环带 8% 支——水GRASS 零掷面） ----
  {
    key: 'oasis-grass', baseSeed: BASE + 4, seed: 0x0B500004, tickCount: 1000, fill: 'deep',
    terrain: rect(93, 53, 107, 67, T.GRASS),
    calls: [{ fn: 'createOasis', args: [100, 60] }],
    // GRASS 环带 rng<0.08 掷——GREENED=0；中心泉眼 GRASS→WATER（d≤1.65 无 MOUNTAIN 门通过）
    sanity: (eng, toasts) => toasts.length === 1 && toasts[0].text === '清泉在草木间闪烁'
      && eng.worldEvents.length === 1 && eng.worldEvents[0].text === '一处泉眼被点化，波光潋滟',
  },
  // ---- S5：createOasis 山幸存（泉眼/浅滩 MOUNTAIN 双门零写 + 环带山不触） ----
  {
    key: 'oasis-mountain', baseSeed: BASE + 5, seed: 0x0B500005, tickCount: 1000, fill: 'deep',
    terrain: [...rect(93, 53, 107, 67, T.SAND), ...rect(99, 59, 101, 61, T.MOUNTAIN)],
    calls: [{ fn: 'createOasis', args: [100, 60] }],
    // 中心山 → 泉眼门 terrain!==MOUNTAIN 断零写；环带 t===MOUNTAIN 首支断 + 第二支 t===GRASS 断零掷
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.MOUNTAIN && eng.terrain[idx(99, 60)] === T.MOUNTAIN,
  },
  // ---- S6：smooth 众数抹平（GRASS 海洋中的 SAND 噪声点 + <5 票孤格不动；零 rng） ----
  {
    key: 'smooth-mode', baseSeed: BASE + 6, seed: 0x0B500006, tickCount: 1000, fill: 'deep',
    terrain: [...rect(95, 55, 105, 65, T.GRASS), [100, 60, T.SAND], [100, 61, T.SAND], [101, 60, T.SAND]],
    calls: [{ fn: 'smoothTerrain', args: [100, 60, 4] }],
    // (100,60) 3×3 内 SAND×3 GRASS×6 → 众数 GRASS 6 票 ≥5 → 变；(100,61)/(101,60) 同理；
    // 圆域 r=4 内其余 GRASS 格众数 GRASS=自身 → bestT===terrain[i] 跳
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.GRASS && eng.terrain[idx(100, 61)] === T.GRASS
      && eng.terrain[idx(101, 60)] === T.GRASS && eng.terrain[idx(95, 55)] === T.GRASS,
  },
  // ---- S7：smooth 全同格零变更（changes 空——批量面零 setTerrain 级联零触达） ----
  {
    key: 'smooth-uniform', baseSeed: BASE + 7, seed: 0x0B500007, tickCount: 1000, fill: 'deep',
    terrain: rect(96, 56, 104, 64, T.WATER),
    calls: [{ fn: 'smoothTerrain', args: [100, 60, 4] }],
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.WATER && eng.terrain[idx(96, 56)] === T.WATER,
  },
  // ---- S8：rough 边缘吸入 + 内部 variant 重掷（rng 掷流——kinds 双门 + 0.5 门 + 邻居替换） ----
  {
    key: 'rough-edge', baseSeed: BASE + 8, seed: 0x0B500008, tickCount: 1000, fill: 'deep',
    terrain: [...rect(95, 55, 105, 65, T.GRASS), ...rect(95, 55, 105, 56, T.WATER), ...rect(95, 64, 105, 65, T.WATER)],
    calls: [{ fn: 'roughenTerrain', args: [100, 60, 5] }],
    // 上/下边带 GRASS|WATER kinds≥2 边缘格 rng<0.5 吸入 → 二遍邻居随机替换；
    // 内部 GRASS 格 variant=floor(rng*256) 重掷；零变更格无级联
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.GRASS || eng.terrain[idx(100, 60)] === T.WATER,
  },
  // ---- S9：plague 半径感染（undead 跳 + immune 特质豁免 + 界外跳；零 rng） ----
  {
    key: 'plague-area', baseSeed: BASE + 9, seed: 0x0B500009, tickCount: 1000, fill: 'deep',
    units: [
      { id: 700, race: R.SHEEP, x: 100, y: 60 },                                    // 感染
      { id: 701, race: R.SHEEP, x: 102.5, y: 60, trait: 'immune' },                 // d=2.5<5 免疫豁免
      { id: 702, race: R.ZOMBIE, x: 99, y: 60 },                                    // undead 跳
      { id: 703, race: R.SHEEP, x: 106, y: 60 },                                    // d=6 界外
      { id: 704, race: R.SHEEP, x: 101, y: 60, infected: true },                    // 已染复染同态
    ],
    calls: [{ fn: 'plagueArea', args: [100, 60, 5] }],
    sanity: (eng) => eng.units.filter((u) => u.infected).length === 2
      && !eng.unitById.get(701).infected && !eng.unitById.get(702).infected && !eng.unitById.get(703).infected,
  },
  // ---- S10：heal 大地复苏（满血/解染/清 hurt + 熄火 + BURNT 复苏 + 融冰 + 清辐射 + fx heart） ----
  {
    key: 'heal-area', baseSeed: BASE + 10, seed: 0x0B50000A, tickCount: 1000, fill: 'deep',
    terrain: [...rect(96, 56, 104, 64, T.GRASS), [100, 60, T.BURNT], [101, 60, T.ICE]],
    fire: [[102, 60, 30], [107, 60, 30]],
    radiate: [[103, 60, 40], [108, 60, 40]],
    units: [
      { id: 710, race: R.SHEEP, x: 100, y: 60, hp: 3, maxHp: 10, hurt: 8, infected: true },   // d=0 满血三清
      { id: 711, race: R.SHEEP, x: 105, y: 60, hp: 3, maxHp: 10, hurt: 8, infected: true },   // d=5 恰等内含（<=）
      { id: 712, race: R.SHEEP, x: 106, y: 60, hp: 3, maxHp: 10, hurt: 8, infected: true },   // d=6 界外三态保留
    ],
    calls: [{ fn: 'healArea', args: [100, 60, 5] }],
    // (100,60) BURNT→GRASS 复苏 + (101,60) ICE meltIce→WATER + (102,60) 熄火 fireSet 出
    // (103,60) 清辐射 radSet 出 + (107,60)/(108,60) 界外不动；fx heart 2 掷
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.GRASS && eng.terrain[idx(101, 60)] === T.WATER
      && eng.fire[idx(102, 60)] === 0 && !eng.fireSet.has(idx(102, 60)) && eng.fire[idx(107, 60)] === 30
      && eng.radiate[idx(103, 60)] === 0 && eng.radiate[idx(108, 60)] === 40
      && eng.unitById.get(710).hp === 10 && eng.unitById.get(712).hp === 3,
  },
  // ---- S11：kill 半径处决（dead 已死跳 + 界外幸存；零 rng） ----
  {
    key: 'kill-area', baseSeed: BASE + 11, seed: 0x0B50000B, tickCount: 1000, fill: 'deep',
    units: [
      { id: 720, race: R.SHEEP, x: 100, y: 60 },
      { id: 721, race: R.SHEEP, x: 105, y: 60 },                        // d=5 恰等内含
      { id: 722, race: R.SHEEP, x: 106, y: 60 },                        // 界外幸存
      { id: 723, race: R.SHEEP, x: 101, y: 60, dead: 1 },               // 已死跳
    ],
    calls: [{ fn: 'killArea', args: [100, 60, 5] }],
    sanity: (eng) => !!eng.unitById.get(720).dead && !!eng.unitById.get(721).dead
      && !eng.unitById.get(722).dead && !!eng.unitById.get(723).dead,   // dead 布尔/数值混合域（L12626 u.dead=true 直写）——真值断言
  },
  // ---- S12：混合调用序（boom→heal 复苏链 + plague→heal 解染——多调用每调用步进快照） ----
  {
    key: 'mixed-sequence', baseSeed: BASE + 12, seed: 0x0B50000C, tickCount: 1000, fill: 'deep',
    terrain: [...rect(96, 56, 104, 64, T.GRASS), [100, 60, T.SAND]],
    units: [
      { id: 730, race: R.SHEEP, x: 100, y: 60, hp: 50, maxHp: 50 },
      { id: 731, race: R.SHEEP, x: 101, y: 60, hp: 50, maxHp: 50 },
    ],
    calls: [
      { fn: 'plagueArea', args: [100, 60, 5] },     // 双染
      { fn: 'boom', args: [100, 60, 2] },           // 伤 + shake
      { fn: 'healArea', args: [100, 60, 5] },       // 解染满血 + SAND 众数 GRASS 平滑
      { fn: 'smoothTerrain', args: [100, 60, 3] },  // 二次平滑（SAND 孤格众数 GRASS）
    ],
    sanity: (eng) => eng.unitById.get(730).infected === false && eng.unitById.get(730).hp === eng.unitById.get(730).maxHp
      && eng.terrain[idx(100, 60)] === T.GRASS,
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
    gen: 'gen-brush.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写（fill 面 grass/deep + terrain/owner/regrow/flood/fire/buildings/soil/variant/radiate/units 瘦直写 + brush 直写）+ rngA 尾置清零起流 + calls 序直调（七函数）每调用步进快照',
    rng: 'eng.rngA 单流；boom 零掷（fx 2 掷/次）；createOasis 浅滩 1 掷/格+环带沙格 1 掷（+棕榈命中 1）+环带草格 1 掷+fx×2 4 掷；roughen 内部格 1 掷（variant）+边缘格 1 掷（0.5 门）+被选边缘 1 掷（邻居采样）；heal fx 2 掷；boom/killArea/plagueArea/smoothTerrain 零掷；mulberry 纯数学反解 total',
    math: '纯算术域 + Math.hypot（boom 像素距/格心距 + oasis 整数极距 + smooth/rough 格距——bun 原生 fdlibm；C# FdHypot 位精确件对账——无 +0.5 偏移格距同 floodArea M-U11）+ smooth counts Map 插入序 tie-break（C# Dictionary 枚举序同构）',
    domains: ['boom L12292-12306', 'createOasis L12444-12486', 'smoothTerrain L12489-12520', 'roughenTerrain L12521-12563', 'plagueArea L12594-12599', 'healArea L12600-12622', 'killArea L12623-12626', 'setTerrain 级联（WbBail 已译件复用）', 'destroyBuilding smoke 级联（WbCivSim 已译件复用）', 'meltIce L2898（已译件复用）', 'addEvent L13995-14009 unshift+cap80', 'toast L13990-13992 onToast 收集'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/brush.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/brush.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('brush.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
