// ============================================================================
// gen-tool3.mjs —— M-U16 切片四「神力生成器域」黄金向量
//   蓝本 engine.ts：acidRain L10737-10745 / volcano L10746-10777 / tsunami
//   L10780-10785 / blizzard L10788-10795 / meteorShower L10798-10813 / locust
//   L10815-10822 / drought L10823-10830 / rainCloud L10834-10843 / blessArea
//   L10845-10859 / curseArea L10861-10872 / loveArea L10874-10886 /
//   teleportArea L10908-10924（randomLandSpot L11033-11043 依赖）/
//   wrathStorm L10926-10934 / holyStorm L10936-10945 / plasmaCannon
//   L10947-10957 / annihilationLight L10959-10969 / sandstorm L10972-10979 /
//   typhoon L10980-10987 / sinkhole L10988-10996 / iceAge L10999-11008 /
//   famineCloud L11030-11036 / blackhole L11017-11023 / meteor L12277-12282 +
//   applyTool case L13342-13455（meteor 内联抖动循环 + 22 委派）+ effectsTick
//   消费端补缺四支：volcano L9851-9876 / wrath L10023-10029 / holystorm
//   L10030-10075 / typhoon L10091-10119。
// M-U19 追加：mutateArea L10888-10906（特质域：civ 0.3 reroll / 0.25 jumpGene
//   0.12 + wild baseGene/jumpGene 0.2 + fx 每命中单位 2 掷）+ rerollTrait
//   L11037-11057（旧乘数卸除/新乘数上装）+ jumpGene L11085-11103（四维 0.6 门
//   重铸 + RACES×TRAITS×JOBS 属性重算）+ rollTrait L1467-1470 + baseGene
//   L11029-11031（speciesBase 空表分支零掷恒 {1,1,1,1}——种子标定探针
//   probe-mutate-seed.mjs：S13=0x00000144 / S14=0x00000027）。
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），手术式夹具直写 +
// rngA 尾置清零起流 + calls 直调 / ticks 步进（tickCount++ + effectsTick——
// gen-power M-U10a 主循环 L2508 序同构）混合链（gen-tool2 + gen-power 双亲）。
//
// 协议要点：
//   ① 掷流：fx 恒 2 掷（seed=floor(rng*65536) + dir=rng*2π——L9793-9797）；
//     生成器 cap 门 filter 快照零掷；bless/curse 0.4 门 1 掷/单位；love 0.5 门
//     1 掷/单位；teleport randomLandSpot 2 掷/尝试（40 次上限）；volcano 锥体
//     hypot 整数域零掷 + 引燃圈 8 点 1 掷/点燃 + 消费端熔岩弹 age%14 双掷 + 岩浆
//     外溢 age%6 双掷；wrath/typhoon 消费端 lightning（M-U15 译件 7-11 掷/击）；
//     holystorm 恒真门 1.2 掷位保持 + 采样双掷 + 单位门掷。
//   ② Math.hypot 域：volcano 锥体 hypot(dx,dy)≤2.3（整数极距 fdlibm）/
//     area 神力单位环 hypot(u.x-x,u.y-y)>r / plasmaCannon-annihilationLight
//     dist=hypot(7,9)/hypot(8,11)——bun 原生 fdlibm；C# FdHypot 位精确件对账。
//   ③ Math.round 域：plasmaCannon ttl=max(45,min(110,round(dist*1.5)))——
//     JS .5 上取整；C# JsRound（floor(x+0.5)）禁银行家舍入。
//   ④ 宿主面：onSound 全系 no-op（黄金受控 undefined——零掷零写）；WBB.touchMeta
//     （rainCloud L10835 Stage 3 UI 收口）宿主域挂点不进模拟面。
//   ⑤ 成就计数：statMeteorShowers/statPlasmas/statAnnihilations/statBlackholes
//     四字段（engine L230-234——WbWorld statNukes 邻位只加）。
//
// 运行：bun scripts/unity-migration/gen-tool3.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/tool3.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool3.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（同 gen-tool2.mjs） ----
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

// 瘦单位直写（gen-tool2 mkUnit 同构）
function mkUnit(eng, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
    hp: o.hp ?? 10, maxHp: o.maxHp ?? o.hp ?? 10, dmg: 1, speed: o.speed ?? 1, age: o.age ?? 0, maxAge: o.maxAge ?? 9999, kills: 0,
    cd: 0, trait: o.trait ?? 0, job: o.job ?? 0, king: 0, infected: o.infected ?? false, flip: 0,
    name: `u${o.id}`, hurt: o.hurt ?? 0, breath: 0, parity: 0, dead: o.dead ?? 0,
    fam: null, fgn: null, gene: o.gene ? { s: o.gene.s, d: o.gene.d, h: o.gene.h, r: o.gene.r } : null, army: null,   // M-U19：gene 深拷贝（spec 对象复用 det 双跑——jumpGene 原地改写 u.gene，共享引用即 det 污染）
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}

// units dump 协议（gen-tool2 dumpUnit 同构 + bless/curse/fert 三瞬态扩展）
function dumpUnit(u) {
  return {
    id: u.id, race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx ?? u.x), ty: f64hex(u.ty ?? u.y),
    hp: f64hex(u.hp ?? 10), maxHp: f64hex(u.maxHp ?? 10), dmg: f64hex(u.dmg ?? 1), speed: f64hex(u.speed ?? 1),
    age: f64hex(u.age ?? 0), maxAge: f64hex(u.maxAge ?? 9999),
    hurtN: u.hurt === undefined || u.hurt === null ? null : f64hex(u.hurt),
    dead: u.dead ? 1 : 0, flip: u.flip ? 1 : 0, infected: u.infected ? 1 : 0,
    bless: u.bless ?? null, curse: u.curse ?? null, fert: u.fert ?? null,
    job: u.job === undefined ? null : u.job, name: u.name ?? null,
    trait: u.trait ? u.trait : null,                       // M-U19：u.trait string 语义（0 falsy → null；rerollTrait 写面）
    gene: u.gene ? { s: f64hex(u.gene.s), d: f64hex(u.gene.d), h: f64hex(u.gene.h), r: f64hex(u.gene.r) } : null,
    fam: u.fam ?? null, fgn: u.fgn ?? null,
    breath: u.breath ?? null, parity: u.parity ?? null, kills: u.kills ?? null,
  };
}

// fx 终态 dump（gen-tool2 fx 同构 + x0/y0/age/quiet/dmg 五面——熔岩弹/等离子 dmg 消费）
function dumpFx(e) {
  return {
    kind: e.kind, x: f64hex(e.x), y: f64hex(e.y),
    x0: e.x0 === undefined ? null : f64hex(e.x0), y0: e.y0 === undefined ? null : f64hex(e.y0),
    ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null, age: e.age,
    quiet: e.quiet ? 1 : 0, dmg: e.dmg === undefined || e.dmg === null ? null : f64hex(e.dmg),
  };
}

// events dump（gen-tool2 同构 + colorHex 面——annihilationLight '#ff4d4d' 消费）
function dumpEvent(e) {
  return { kind: e.kind, text: e.text, colorHex: e.colorHex ?? null, x: e.x ?? null, y: e.y ?? null };
}

// ---- 手术式夹具构建 + calls/ticks 混合链步进快照 ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-tool2 同款）
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
  eng.dirty.clear();
  eng.laws.seasons = spec.seasons ?? true;
  eng.yearF = spec.yearF ?? 2.5;
  eng.tickCount = spec.tickCount;
  eng.shake = 0;
  eng.brush = spec.brush ?? 3;                     // L688 类字段默认 3
  eng.statNukes = 0;
  eng.statMeteorShowers = 0;                       // L230-234 成就计数五联清零
  eng.statPlasmas = 0;
  eng.statAnnihilations = 0;
  eng.statBlackholes = 0;

  // toast 宿主回调收集器（纪律③事件流）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });

  // 手术二·直写相（保序）
  for (const [x, y, t] of spec.terrain ?? []) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of spec.owner ?? []) eng.owner[idx(x, y)] = v;
  for (const [x, y, at] of spec.regrow ?? []) eng.regrow.set(idx(x, y), at);
  for (const [x, y, at] of spec.flood ?? []) eng.flood.set(idx(x, y), at);
  for (const [x, y, v] of spec.fire ?? []) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  for (const [x, y, v] of spec.soil ?? []) eng.worldsim.soilF[idx(x, y)] = v;
  for (const [x, y, v] of spec.variant ?? []) eng.variant[idx(x, y)] = v;
  for (const [x, y, v] of spec.radiate ?? []) { eng.radiate[idx(x, y)] = v; eng.radSet.set(idx(x, y), spec.tickCount + 500); }
  for (const uo of spec.units ?? []) mkUnit(eng, uo);

  // 手术二·快照：直写后/调用前的镜像输入面
  const fixture = {
    terrain0: gzB64(eng.terrain),
    owner0: gzB64(new Uint8Array(eng.owner.buffer.slice(0))),
    regrow0: [...eng.regrow.entries()],
    flood0: [...eng.flood.entries()],
    fire0: gzB64(eng.fire),
    fireSet0: [...eng.fireSet],
    soil0: gzB64(eng.worldsim.soilF),
    radiate0: gzB64(eng.radiate),
    radSet0: [...eng.radSet.entries()],
    brush0: eng.brush,
    units0: (spec.units ?? []).map((uo) => ({
      id: uo.id, race: uo.race, x: uo.x, y: uo.y, hp: uo.hp ?? 10, maxHp: uo.maxHp ?? uo.hp ?? 10,
      gene: uo.gene ?? null, dead: uo.dead ?? 0, infected: uo.infected ?? false, hurt: uo.hurt ?? 0, trait: uo.trait ?? 0,
      job: uo.job ?? 0,                                     // M-U19：jumpGene JOBS[job] 消费面（civ jd 乘数支）
    })),
    yearF0: eng.yearF,
  };

  // 步进快照（calls 与 ticks 统一面——applyTool 紧凑 / effectsTick 全列）
  const snapCommon = () => ({
    rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
    terrainMd5: md5hex(eng.terrain),
    fireMd5: md5hex(eng.fire),
    fireSet: [...eng.fireSet],
    frozen: [...eng.frozen],
    regrow: [...eng.regrow.entries()],
    flood: [...eng.flood.entries()],
    wet: [...eng.wet.entries()],
    radiateMd5: md5hex(eng.radiate),
    radSet: [...eng.radSet.entries()],
    fxCount: eng.effects.length,
    eventsCount: eng.worldEvents.length,
    buildingsCount: eng.buildings.length,
    shake: eng.shake,
    stats: [eng.statNukes, eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes],
    unitsCount: eng.units.length,
  });

  // 手术三（尾置）：rngA 清零起流 → calls 直调 + ticks 步进（tickCount++ 头 + effectsTick——主循环 L2508 序）
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (const call of spec.calls ?? []) {
    eng[call.fn](...call.args);
    steps.push({ fn: call.fn, args: call.args, ...snapCommon() });
  }
  for (let k = 0; k < (spec.ticks ?? 0); k++) {
    eng.tickCount++;
    eng.effectsTick();
    steps.push({
      fn: 'effectsTick', tick: k + 1,
      ...snapCommon(),
      fx: eng.effects.map((e) => ({ kind: e.kind, age: e.age, x: f64hex(e.x), y: f64hex(e.y), dir: f64hex(e.dir) })),
      units: eng.units.map((u) => ({ id: u.id, hp: f64hex(u.hp), hurt: f64hex(u.hurt ?? 0), dead: u.dead ? 1 : 0, x: f64hex(u.x), y: f64hex(u.y) })),
      dirty: [...eng.dirty].sort((a, b) => a - b),
    });
  }

  // sanity（生成即验证）——TOOL3_DIAG=1 时不符仅告警继续
  const totalDraws = (eng.rngA >>> 0) === (spec.seed >>> 0) ? 0 : chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  if (spec.minDraws !== undefined && totalDraws !== spec.minDraws) {
    const msg = `${spec.key}: 掷数 ${totalDraws} ≠ 期望 ${spec.minDraws}`;
    if (process.env.TOOL3_DIAG === '1') console.log('DIAG-draws ' + msg);
    else throw new Error(msg);
  }
  if (spec.sanity && !spec.sanity(eng, toasts)) {
    console.error(`DIAG ${spec.key}: draws=${totalDraws} rngA=${(eng.rngA >>> 0).toString(16)} shake=${eng.shake} stats=${JSON.stringify([eng.statNukes, eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes])} fx=${JSON.stringify(eng.effects.map((e) => ({ k: e.kind, x: e.x, y: e.y, ttl: e.ttl, age: e.age, r: e.r, x0: e.x0, y0: e.y0, q: e.quiet })))} fireSet=${eng.fireSet.size} units=${JSON.stringify(eng.units.map((u) => ({ id: u.id, hp: u.hp, hurt: u.hurt, dead: u.dead, bless: u.bless, curse: u.curse, fert: u.fert, inf: u.infected })))} ev=${JSON.stringify(eng.worldEvents.map((e) => ({ k: e.kind, t: e.text })))} t10060=${eng.terrain[idx(100, 60)]}`);
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
    stats: [eng.statNukes, eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes],
    fx: eng.effects.map(dumpFx),
    events: eng.worldEvents.map(dumpEvent),
    units: eng.units.map(dumpUnit),
    toasts,
  };
}

// ---- 场景集（12 场景） ----
// 靶区：中心 (100,60)；brush 直写面走 spec.brush（L688 默认 3）
const BASE = 20261201;

const specs = [
  // ---- S1：volcano 默认参 pw=1（锥体 21 格 MOUNTAIN + 山口 LAVA + 引燃圈 8 点
  //        ring=3.5 + fx volcano ttl 110 + shake 8；消费端 30 tick：熔岩弹 age14/28
  //        双掷×2 + 岩浆外溢 age%6 五次 + 单位灼烧 0.8/tick——u1 死亡 u2 环外幸存）----
  {
    key: 'volcano-default', baseSeed: BASE + 1, seed: 0x0C610001, tickCount: 1000, fill: 'grass',
    units: [{ id: 900, race: R.SHEEP, x: 101, y: 60, hp: 20, maxHp: 20 },
            { id: 901, race: R.SHEEP, x: 104, y: 60, hp: 200, maxHp: 200 }],   // d=4 灼烧环外
    calls: [{ fn: 'applyTool', args: ['volcano', 100, 60] }],
    ticks: 30,
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.LAVA && eng.terrain[idx(97, 60)] === T.GRASS
      && eng.fireSet.size === 8
      && eng.unitById.get(900).dead && eng.unitById.get(901).hp === 200
      && eng.effects.filter((e) => e.kind === 'volcano').length === 1
      && eng.worldEvents.some((e) => e.text === '大地震颤，一座火山拔地而起，岩浆喷薄而出'),
  },
  // ---- S2：volcano pw=3（十字 + 3x3 熔岩湖 + ring=10.5 引燃 + shake 12 封顶面
  //        6+3*2=12；event pw>1 文本分叉 + 熔岩弹 age14 单发）----
  {
    key: 'volcano-power3', baseSeed: BASE + 2, seed: 0x0C610002, tickCount: 1000, fill: 'grass',
    units: [{ id: 910, race: R.SHEEP, x: 110, y: 70, hp: 200, maxHp: 200 }],   // d≈14.1 环外
    calls: [{ fn: 'applyTool', args: ['volcano', 100, 60, { power: 3 }] }],
    ticks: 5,   // age<6：消费端仅 shake 面——地形断言确定性（S1 已覆盖熔岩弹/外溢面）
    sanity: (eng) => eng.terrain[idx(101, 60)] === T.LAVA && eng.terrain[idx(100, 60)] === T.LAVA
      && eng.terrain[idx(100, 50)] === T.GRASS   // ring=10.5 引燃圈外 GRASS 不变
      && eng.fireSet.size === 8
      && eng.shake === 12 && eng.unitById.get(910).hp === 200
      && eng.worldEvents.some((e) => e.text === '大地震颤，一座火山拔地而起，熔岩以烈度 3 喷薄而出'),
  },
  // ---- S3：四生成器 spawn 面（tsunami r*2.5 钳 + blizzard max(5,r) + locust rP
  //        undefined→JS 默认参 5 + drought max(5,r)——全 tickless 零消费面）----
  {
    key: 'spawn-quartet', baseSeed: BASE + 3, seed: 0x0C610003, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['tsunami', 100, 60] },
      { fn: 'applyTool', args: ['blizzard', 100, 60] },
      { fn: 'applyTool', args: ['locust', 100, 60] },
      { fn: 'applyTool', args: ['drought', 100, 60] },
    ],
    sanity: (eng) => eng.effects.length === 4
      && eng.effects[0].kind === 'tsunami' && eng.effects[0].r === 7.5 && eng.effects[0].ttl === 42
      && eng.effects[1].kind === 'blizzard' && eng.effects[1].r === 5 && eng.effects[1].ttl === 190
      && eng.effects[2].kind === 'locust' && eng.effects[2].r === 5 && eng.effects[2].ttl === 240
      && eng.effects[3].kind === 'drought' && eng.effects[3].r === 5 && eng.effects[3].ttl === 200,
  },
  // ---- S4：meteor 单发 + meteorshower 六连（x0/y0 偏移面 + quiet 衍生弹抑纪事
  //        + statMeteorShowers 成就计数 + n=count 直取面）----
  {
    key: 'meteor-meteorshower', baseSeed: BASE + 4, seed: 0x0C610004, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['meteor', 100, 60] },
      { fn: 'applyTool', args: ['meteorshower', 100, 60, { count: 6 }] },
    ],
    sanity: (eng) => eng.effects.length === 7
      && eng.effects[0].x0 === 120 && eng.effects[0].y0 === 26 && !eng.effects[0].quiet
      && eng.effects.filter((e) => e.kind === 'meteor').length === 7
      && eng.effects.slice(1).every((e) => e.quiet && e.x0 === e.x + 18 && e.y0 === e.y - 30)
      && eng.statMeteorShowers === 1
      && eng.worldEvents.some((e) => e.text === '一场陨石雨呼啸而降（6 颗）'),
  },
  // ---- S5：wrath 天罚风暴（spawn cap 门 + 消费端 22 tick：age%10 雷击×2——
  //        lightning n=1 全掷流 + 中心点燃 + 四邻 0.5 门）----
  {
    key: 'wrath-ticks', baseSeed: BASE + 5, seed: 0x0C610005, tickCount: 1000, fill: 'grass',
    units: [{ id: 920, race: R.SHEEP, x: 100, y: 60, hp: 5000, maxHp: 5000 }],   // 雷击环 d<1.9 面承伤
    calls: [{ fn: 'applyTool', args: ['wrath', 100, 60] }],
    ticks: 22,
    sanity: (eng) => eng.effects.filter((e) => e.kind === 'wrath').length === 1
      && eng.effects.filter((e) => e.kind === 'bolt').length === 1   // age10 bolt ttl10 已 splice；age20 bolt 在列
      && eng.fireSet.size === 5 && eng.effects[0].r === 4,
  },
  // ---- S6：单位面四神力（bless 治疗+增益+驱瘟 / curse 诅咒 / love 繁衍增益 /
  //        teleport randomLandSpot 迁移——四瞬态字段 + fx 门掷 + spark 双发）----
  {
    key: 'area-powers', baseSeed: BASE + 6, seed: 0x0C610006, tickCount: 1000, fill: 'grass',
    units: [
      { id: 930, race: R.SHEEP, x: 99, y: 60, hp: 20, maxHp: 100, infected: true },   // bless: hp→70
      { id: 931, race: R.SHEEP, x: 101, y: 60, hp: 100, maxHp: 100 },                 // curse
      { id: 932, race: R.SHEEP, x: 100.5, y: 61, hp: 100, maxHp: 100 },               // love
      { id: 933, race: R.SHEEP, x: 100, y: 59, hp: 100, maxHp: 100 },                 // teleport
    ],
    calls: [
      { fn: 'applyTool', args: ['bless', 100, 60] },
      { fn: 'applyTool', args: ['curse', 100, 60] },
      { fn: 'applyTool', args: ['love', 100, 60] },
      { fn: 'applyTool', args: ['teleport', 100, 60] },
    ],
    sanity: (eng) => eng.unitById.get(930).hp === 70 && eng.unitById.get(930).bless === 600
      && eng.unitById.get(930).infected === false && eng.unitById.get(931).curse === 500
      && eng.unitById.get(932).fert === 500
      && (eng.unitById.get(933).x !== 100 || eng.unitById.get(933).y !== 59),
  },
  // ---- S7：静态四神力 spawn（sinkhole shake 7 + iceAge rP undefined→max(6,brush*2+4)
  //        =10 + famine JS 默认参 6 + blackhole statBlackholes 成就计数）----
  {
    key: 'static-quartet', baseSeed: BASE + 7, seed: 0x0C610007, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['sinkhole', 100, 60] },
      { fn: 'applyTool', args: ['iceage', 100, 60] },
      { fn: 'applyTool', args: ['famine', 100, 60] },
      { fn: 'applyTool', args: ['blackhole', 100, 60] },
    ],
    sanity: (eng) => eng.effects.length === 4
      && eng.effects[0].kind === 'sinkhole' && eng.effects[0].r === 3 && eng.effects[0].ttl === 80
      && eng.effects[1].kind === 'iceage' && eng.effects[1].r === 10 && eng.effects[1].ttl === 420
      && eng.effects[2].kind === 'famine' && eng.effects[2].r === 6 && eng.effects[2].ttl === 260
      && eng.effects[3].kind === 'blackhole' && eng.effects[3].r === 8 && eng.effects[3].ttl === 130
      && eng.shake === 7 && eng.statBlackholes === 1,
  },
  // ---- S8：十三神力 cap 门复合（每系 ×(cap+1) 次连发——filter 快照零掷拒面 +
  //        接纳面 2 掷/fx；拒后零写零掷实证）----
  {
    key: 'caps-composite', baseSeed: BASE + 8, seed: 0x0C610008, tickCount: 1000, fill: 'grass',
    calls: [
      ...[1, 2, 3, 4, 5, 6, 7].map((k) => ({ fn: 'applyTool', args: ['acidrain', 100, 60] })),
      ...[1, 2, 3, 4, 5, 6, 7].map((k) => ({ fn: 'applyTool', args: ['rain', 100, 60] })),
      ...[1, 2, 3, 4, 5].map((k) => ({ fn: 'applyTool', args: ['blizzard', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['locust', 100, 60] })),
      ...[1, 2, 3, 4, 5].map((k) => ({ fn: 'applyTool', args: ['drought', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['wrath', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['holystorm', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['sandstorm', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['typhoon', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['sinkhole', 100, 60] })),
      ...[1, 2, 3].map((k) => ({ fn: 'applyTool', args: ['iceage', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['famine', 100, 60] })),
      ...[1, 2, 3].map((k) => ({ fn: 'applyTool', args: ['blackhole', 100, 60] })),
    ],
    sanity: (eng) => {
      const cnt = (k) => eng.effects.filter((e) => e.kind === k).length;
      return cnt('acid') === 6 && cnt('rainstorm') === 6 && cnt('blizzard') === 4 && cnt('locust') === 3
        && cnt('drought') === 4 && cnt('wrath') === 3 && cnt('holystorm') === 3 && cnt('sandstorm') === 3
        && cnt('typhoon') === 3 && cnt('sinkhole') === 3 && cnt('iceage') === 2 && cnt('famine') === 3
        && cnt('blackhole') === 2 && eng.effects.length === 45;
    },
  },
  // ---- S9：typhoon 消费端 40 tick（游荡 dir 1 掷/tick + 狂风推拽 walkable 门 +
  //        环伤 0.18 + age%36 雷击 + 暴雨灭火 0.4 门——预置火格双格）----
  {
    key: 'typhoon-ticks', baseSeed: BASE + 9, seed: 0x0C610009, tickCount: 1000, fill: 'grass',
    fire: [[103, 60, 100], [104, 61, 100]],
    units: [{ id: 940, race: R.SHEEP, x: 101, y: 60, hp: 500, maxHp: 500 },
            { id: 941, race: R.SHEEP, x: 103, y: 60, hp: 500, maxHp: 500 }],
    calls: [{ fn: 'applyTool', args: ['typhoon', 100, 60] }],
    ticks: 40,
    sanity: (eng) => eng.effects.filter((e) => e.kind === 'typhoon').length === 1
      && eng.effects[0].r === 6 && eng.unitById.get(940).hp < 500
      && eng.unitById.get(941).hp < 500,
  },
  // ---- S10：超武双神力（plasmaCannon dmg 默认 90 + x0/y0 钳位 + ttl round 域 +
  //        statPlasmas；annihilationLight colorHex '#ff4d4d' + statAnnihilations）----
  {
    key: 'plasma-annihilate', baseSeed: BASE + 10, seed: 0x0C61000A, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['plasmacannon', 100, 60] },
      { fn: 'applyTool', args: ['annihilate', 100, 60] },
    ],
    sanity: (eng) => eng.effects.length === 2
      && eng.effects[0].kind === 'plasma' && eng.effects[0].x0 === 93 && eng.effects[0].y0 === 51
      && eng.effects[0].dmg === 90 && eng.effects[0].r === 3.2 && eng.effects[0].ttl === 45
      && eng.effects[1].kind === 'antimatter' && eng.effects[1].x0 === 92 && eng.effects[1].y0 === 49
      && eng.effects[1].ttl === 50
      && eng.statPlasmas === 1 && eng.statAnnihilations === 1
      && eng.worldEvents.some((e) => e.colorHex === '#ff4d4d'),
  },
  // ---- S11：volcano 边缘钳位（(1,1)→cx,cy=2,2 双钳 + 引燃圈 j>=0 显式卫门
  //        （负索引不入 fireSet——lightning OOB 语义对照面）+ 外溢 8 tick）----
  {
    key: 'volcano-edge', baseSeed: BASE + 11, seed: 0x0C61000B, tickCount: 1000, fill: 'grass',
    calls: [{ fn: 'applyTool', args: ['volcano', 1, 1] }],
    ticks: 8,
    sanity: (eng) => eng.terrain[idx(2, 2)] === T.LAVA && eng.terrain[idx(0, 4)] === T.GRASS
      && [...eng.fireSet].every((i) => i >= 0 && i < W * H)
      && eng.effects[0].x === 2.5 && eng.effects[0].y === 2.5,
  },
  // ---- S13：mutate civ 面（u960 giant 旧特质 reroll 0.3 HIT 旧乘数卸除/新乘数上装 +
  //        0.25 jumpGene(0.12) HIT job2 战士乘数重算；u961 reroll MISS + jump HIT
  //        且 ≥1 维门 MISS〔{1,1,1,1} 起步 miss 维恒等 1 钉面〕；u962 dead skip
  //        零掷；u963 界外 skip）——种子标定 0x00000144（probe-mutate-seed.mjs）----
  {
    key: 'mutate-civ-reroll', baseSeed: BASE + 13, seed: 0x00000144, tickCount: 1000, fill: 'grass',
    units: [
      { id: 960, race: R.HUMAN, x: 99.5, y: 60, hp: 200, maxHp: 200, trait: 'giant', job: 2 },
      { id: 961, race: R.HUMAN, x: 101, y: 60.5, hp: 60, maxHp: 60 },
      { id: 962, race: R.SHEEP, x: 100, y: 59, hp: 16, maxHp: 16, dead: 1 },
      { id: 963, race: R.HUMAN, x: 112, y: 60, hp: 60, maxHp: 60 },   // d=12 > r=3 界外
    ],
    calls: [{ fn: 'applyTool', args: ['mutate', 100, 60] }],
    sanity: (eng) => {
      const a = eng.unitById.get(960), b = eng.unitById.get(961), dd = eng.unitById.get(962), oor = eng.unitById.get(963);
      return typeof a.trait === 'string' && a.trait !== 'giant' && a.gene
        && (b.trait === 0 || b.trait === null) && b.gene
        && [b.gene.s, b.gene.d, b.gene.h, b.gene.r].some((v) => v === 1)
        && dd.gene === null && dd.hp === 16 && oor.gene === null && oor.hp === 60
        && eng.effects.filter((e) => e.kind === 'mutate').length === 2;
    },
  },
  // ---- S14：mutate wild 面 3 连发（u970 preset gene 直 jumpGene(0.2)；u971 空表
  //        baseGene 零掷〔speciesBase 演化域未译恒空——蓝本 L11029-11031〕；u972
  //        wolf 捕食者 RACES 重算；3 单位 × 3 连发后至少 1 维恰触铛位 0.5/2——
  //        Math.max/min 恰等面）——种子标定 0x00000027----
  {
    key: 'mutate-wild-clamp', baseSeed: BASE + 14, seed: 0x00000027, tickCount: 1000, fill: 'grass',
    units: [
      { id: 970, race: R.SHEEP, x: 100, y: 60, hp: 16, maxHp: 16, gene: { s: 1.3, d: 0.8, h: 1.1, r: 0.9 } },
      { id: 971, race: R.SHEEP, x: 101, y: 60, hp: 16, maxHp: 16 },
      { id: 972, race: R.WOLF, x: 99, y: 60.5, hp: 34, maxHp: 34 },
    ],
    calls: [
      { fn: 'applyTool', args: ['mutate', 100, 60] },
      { fn: 'applyTool', args: ['mutate', 100, 60] },
      { fn: 'applyTool', args: ['mutate', 100, 60] },
    ],
    sanity: (eng) => {
      let clamped = 0;
      for (const id of [970, 971, 972]) {
        const u = eng.unitById.get(id);
        if (!u.gene) return false;
        for (const v of [u.gene.s, u.gene.d, u.gene.h, u.gene.r]) if (v === 0.5 || v === 2) clamped++;
      }
      return clamped >= 1 && eng.effects.filter((e) => e.kind === 'mutate').length === 9;
    },
  },
  // ---- S12：holystorm 消费端 30 tick（游荡 dir + 恒真门 1.2 掷位 + 浇火/洗辐射/
  //        焦土复苏 + 黑暗审判 0.4/tick + 无辜缓愈 0.15 + 驱瘟 fx）----
  {
    key: 'holystorm-ticks', baseSeed: BASE + 12, seed: 0x0C61000C, tickCount: 1000, fill: 'grass',
    terrain: [[100, 63, T.BURNT]],
    fire: [[103, 60, 100]],
    radiate: [[98, 60, 1]],
    units: [
      { id: 950, race: R.DEMON, x: 100.5, y: 60.5, hp: 100, maxHp: 100 },   // 黑暗审判：hp 100→88
      { id: 951, race: R.SHEEP, x: 99, y: 60, hp: 90, maxHp: 100, infected: true },   // 缓愈 90→94.5 + 驱瘟
      { id: 952, race: R.SHEEP, x: 102, y: 61, hp: 100, maxHp: 100 },
    ],
    calls: [{ fn: 'applyTool', args: ['holystorm', 100, 60] }],
    ticks: 30,
    sanity: (eng) => {
      const d = eng.unitById.get(950), s1 = eng.unitById.get(951);
      return Math.abs(d.hp - 88) < 1e-9 && d.hurt === 10 && s1.infected === false
        && Math.abs(s1.hp - 94.5) < 1e-9
        && eng.effects.filter((e) => e.kind === 'holystorm').length === 1;
    },
  },
];

// ---- det 双跑 + 双写 ----
function runAll() {
  return specs.map((sp) => buildScenario(sp));
}
const det1 = runAll();
const det2 = runAll();
for (let i = 0; i < det1.length; i++) {
  const a = det1[i], b = det2[i];
  if (a.stepsSnap.at(-1).rngA !== b.stepsSnap.at(-1).rngA
    || JSON.stringify(a.stepsSnap) !== JSON.stringify(b.stepsSnap)
    || JSON.stringify(a.units) !== JSON.stringify(b.units)
    || JSON.stringify(a.fx) !== JSON.stringify(b.fx)
    || JSON.stringify(a.events) !== JSON.stringify(b.events)
    || JSON.stringify(a.toasts) !== JSON.stringify(b.toasts))
    throw new Error(`det 失败 ${specs[i].key}`);
}
console.log('det 双跑字节级一致:', specs.map((s) => s.key).join(' '));

const scenarios = specs.map((sp, i) => det1[i]);
const out = {
  meta: {
    gen: 'gen-tool3.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写（fill 面 grass + terrain/fire/radiate/units 瘦直写 + brush/五成就计数直写）+ rngA 尾置清零起流 + calls 直调 / ticks 步进（tickCount++ 头 + effectsTick——主循环 L2508 序）混合链，每步统一快照（applyTool 紧凑 / effectsTick 全列 fx+units+dirty）',
    rng: 'eng.rngA 单流；fx 恒 2 掷（seed+dir）；cap 门 filter 快照零掷；volcano 引燃圈 1 掷/点燃 + 消费端熔岩弹 age%14 双掷 + 外溢 age%6 双掷；wrath/typhoon 消费端 lightning（n=1：fx 2+中心点燃 1+四邻 4+邻格点燃支）；holystorm 恒真门 1.2 掷位保持 + 采样双掷 + 单位门掷（审判 0.2/缓愈 0.08）；bless/curse 0.4 门 + love 0.5 门 1 掷/单位 + fx 2 掷；teleport randomLandSpot 2 掷/尝试；mutate：civ 0.3 门 1 掷 + rerollTrait rollTrait 1 掷 + 0.25 门 1 掷 + jumpGene 4 门掷/命中维值掷；wild 直 jumpGene 4 门掷/命中维值掷〔baseGene 空表零掷〕；命中单位 fx 2 掷（门 miss 亦掷——L10901 fx 在 if/else 外）；mulberry 纯数学反解 total',
    math: 'Math.hypot（volcano 锥体整数极距 / area 神力单位环〔含 mutate L10891〕 / plasma dist=hypot(7,9) / annihilate dist=hypot(8,11)——bun 原生 fdlibm；C# FdHypot 位精确件对账）+ Math.round（plasma ttl=round(dist*1.5) + mutate rerollTrait/jumpGene maxHp round 域——JS .5 上取整；C# JsRound 禁银行家舍入）+ Math.max/min 铛位（mutate 基因 0.5/2 恰等面 + maxHp≥1）+ 纯算术域',
    domains: ['mutateArea L10888-10906（M-U19：civ 0.3 reroll/0.25 jumpGene 0.12 + wild baseGene/jumpGene 0.2 + fx 每命中单位 2 掷〔双门双 miss 亦掷——fx 在 if/else 外〕）', 'rerollTrait L11037-11057（旧乘数卸除/新乘数上装——maxHp round 域 + hp min/max 双钳不对称〔old 支 max(1,·) / nw 支无〕）', 'jumpGene L11085-11103（四维 0.6 门 + (rng-0.42)*2*amount 重铸 + 0.5/2 铛位 + RACES×TRAITS×JOBS 属性重算）', 'rollTrait L1467-1470（TRAITS keys 12 预设插入序随机抽）', 'baseGene L11029-11031（speciesBase 空表分支——零掷恒 {1,1,1,1}）', 'acidRain L10737-10745（cap 6 + fx acid）', 'volcano L10746-10777（锥体 hypot≤2.3 + 山口/十字/3x3 熔岩 + 引燃圈 3.5*pw + shake 6+2pw + event 双文本）', 'tsunami L10780-10785（r*2.5 钳 [6,30]）', 'blizzard L10788-10795（cap 4 + max(5,r) 钳 [5,15]）', 'meteorShower L10798-10813（clamp [1,24] + rng 散布 + x0/y0/quiet 衍生弹 + statMeteorShowers）', 'locust L10815-10822（cap 3 + r 钳 [3,10]）', 'drought L10823-10830（cap 4）', 'rainCloud L10834-10843（cap 6 + touchMeta 宿主挂点）', 'blessArea L10845-10859（hp+50%max + bless 600 + 驱瘟 + 0.4 fx 门）', 'curseArea L10861-10872（curse 500）', 'loveArea L10874-10886（repro 门 + fert 500）', 'teleportArea L10908-10924（randomLandSpot 40 试 + spark 双发）', 'wrathStorm L10926-10934（cap 3）', 'holyStorm L10936-10945（cap 3）', 'plasmaCannon L10947-10957（x0/y0 钳 + ttl round 域 + dmg + statPlasmas）', 'annihilationLight L10959-10969（colorHex #ff4d4d + statAnnihilations）', 'sandstorm L10972-10979（cap 3）', 'typhoon L10980-10987（cap 3）', 'sinkhole L10988-10996（shake 7）', 'iceAge L10999-11008（cap 2 + shake 4）', 'famineCloud L11030-11036（cap 3）', 'blackhole L11017-11023（cap 2 + statBlackholes）', 'meteor L12277-12282（x0=x+20/y0=y-34）', 'randomLandSpot L11033-11043（40 试六地形门）', 'applyTool case L13342-13455（meteor 内联抖动 + 22 委派）', 'effectsTick 消费端四支：volcano L9851-9876 / wrath L10023-10029 / holystorm L10030-10075 / typhoon L10091-10119'],
    deferred: ['finger→beginGrab L5293（抓取交互域切片）', 'chest/ITEM_TOOL/cre:/RACE_TOOL 等其余 applyTool case（各域切片挂账不变）'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/tool3.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool3.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('tool3.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
