// ============================================================================
// gen-eco.mjs —— M-U12 切片「ecoTick 生态承载域」黄金向量
//   ecoTick L12096-12202 六段全分支：
//   ① 植被重算 L12098-12103（GRASS|FOREST 计数 → grassTiles 缓存）
//   ② 种群清点 L12105-12123（aquatic 跳过 L12115 / herbivore 入账+preyGrid 写
//      gx/gy 双钳 L12118-12120 / predator 入账 L12122）
//   ③ 食草承载饥饿 L12125-12139（capacity=grass*1.6 / starve=min(10,ceil(gap*0.2)) /
//      3 采样 fitness=(gene?.h??1)*(gene?.s??1) 最弱者 hp-=15 hurt=20 / cand.dead 跳）
//   ④ 过度啃食 L12141-12148（regrow 生产源之三：门 rng<0.6*ep('eco.grazeRate')〔默认
//      1 engineParams L29——M-U7m 内联先例〕/ grazer 随机 / GRASS+building==0 门 /
//      setTerrain(BURNT) 全级联 / regrow.set(tick+round((round(ep('eco.regrowBase')*1.3)
//      〔默认 700→910 L28〕+floor(rng*900))/soilMulAt(gi))——has 门短路掷）
//   ⑤ 捕食者竞争 L12151-12158（predCap=herb/4.5 / len>4 门 / starve=min(8,ceil(gap*0.25)) /
//      hp-=14 hurt=20）
//   ⑥ 状态播报 L12160-12174（四态 collapse/overgraze/overgrass/balanced / 冷却 15 年
//      ecoLastNoteYear / 冷却中静默切换 else-if L12172-12173）
//   ⑦ 生态自愈迁徙 L12177-12200（ecoRepopYear ≥25 年节流 / a 支 ratio<0.22&&grass>1800
//      &&rng<0.35 → 10 采样落户 GRASS→SHEEP/FOREST→DEER ×5 silent spawn / b 支 herb>60
//      &&pred<6&&rng<0.25 → 狼群 ×2 循 herd 落点 silent spawn）
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），手术式夹具直写 +
// rngA 尾置清零起流 + calls 序直调（每调用后快照——gen-rainflood M-U11 协议同构）。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA——饥饿 3 掷/轮、啃食门 1+grazer 1+regrow 900 域 1（has 门
//     短路）、竞争 1 掷/轮、迁徙 a 门 1+采样 2 掷/轮、b 门 1+herd 1、silent spawn
//     trait 0.15 门+maxAge+flip+breath+family 0.06 门（bail-transcript L595 静默可达
//     域协议同源）；speciesBase 夹具恒空 → baseGene 走空表分支 {1,1,1,1} 零掷
//     （engine L11060-11062，sanity 钉 speciesBase.size===0——C# BaseGene 空表件对齐）。
//   ② ep 热参数内联口径：eco.grazeRate=1（engineParams L29）、eco.regrowBase=700
//     （L28）——gen 真实现自取默认；C# 侧 M-U7m 内联先例同构。
//   ③ setTerrain 全级联随件（WbBail L1959 / rainflood-transcript setTerrain 已译件）：
//     regrow 出账（L979）/owner 熄灭/fire 熄灭/road 清/glacier 清/waterTier——S4 系烧
//     草触达；building 门只读 eng.building[i]（L12144）。
//   ④ 事件流（纪律③）：addEvent L13995-14009 unshift+cap80——eco 播报/迁徙两支四文本
//     入黄金 events（{kind,text,x,y}）；colorHex 面不入 dump（rainflood 协议同构）。
//   ⑤ sanity：speciesBase 空表 / 掷数下限 / det 双跑字节级（生成即验证）。
//
// 运行：bun scripts/unity-migration/gen-eco.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/eco.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/eco.json（双写）
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

// 瘦单位直写（gen-units-bail mkUnit L109-128 协议同源——ecoTick 读面 dead/race/x/y/
// gene/hp/hurt + spawn 级联消费 unitSeq/wildCount；扩展字段透传 undefined 保持同构）
function mkUnit(eng, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
    hp: o.hp ?? 10, maxHp: o.hp ?? 10, dmg: 1, speed: o.speed ?? 1, age: o.age ?? 0, maxAge: o.maxAge ?? 9999, kills: 0,
    cd: 0, trait: 0, job: o.job ?? 0, king: o.king ?? 0, infected: 0, flip: 0,
    name: `u${o.id}`, hurt: o.hurt ?? 0, breath: 0, parity: 0, dead: o.dead ?? 0,
    boat: 0, boatTTL: 0, caravan: 0, wep: 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0,
    fam: o.fam ?? null, fgn: o.fgn ?? null, gene: o.gene ?? null,
    army: null, food: undefined, panic: undefined, detour: undefined, fert: undefined,
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}

// units dump 协议（ecoTick 改面 hp/hurt + spawn 产出全字段——bail-transcript 新生儿协议同构）
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

  // 手术一：瞬态层清零（gen-rainflood 同款；fill 面 spec 化——S10 全 GRASS 域）
  eng.terrain.fill(spec.fill === 'grass' ? T.GRASS : T.DEEP);
  eng.tempMap.fill(0);
  eng.fire.fill(0);
  eng.fireSet.clear();
  eng.frozen.clear();
  eng.flood.clear();
  eng.wet.clear();
  eng.regrow.clear();
  eng.units.length = 0;
  eng.unitById.clear();
  eng.unitSeq = 1;                       // spawn id 起点清零（parity=unitSeq%2 位级对齐——C# 构造默认同锚）
  eng.wildCount.clear();                 // spawn 上限门账面清零（WildAlive 门——协议零起）
  eng.families.clear();
  eng.familySeq = 1;                     // family 0.06 门 NewFamily id 起点清零
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
  // eco 三态字段直写（L248/L250/L252 默认 balanced/-999/-999；S12 冷却静默支直写）
  eng.ecoState = spec.ecoState ?? 'balanced';
  eng.ecoLastNoteYear = spec.ecoLastNoteYear ?? -999;
  eng.ecoRepopYear = spec.ecoRepopYear ?? -999;

  // 手术二·直写相（保序）：terrain/owner/regrow/buildings/soil/units
  for (const [x, y, t] of spec.terrain ?? []) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of spec.owner ?? []) eng.owner[idx(x, y)] = v;
  for (const [x, y, at] of spec.regrow ?? []) eng.regrow.set(idx(x, y), at);
  for (const [x, y, kind] of spec.buildings ?? []) {
    eng.building[idx(x, y)] = kind;
    eng.buildings.push({ i: idx(x, y), x, y, kind, civ: -1 });   // civ=-1 → houses 账不触（gen-rainflood 形态）
    eng.bIdx.set(idx(x, y), eng.buildings.length - 1);
  }
  for (const [x, y, v] of spec.soil ?? []) eng.worldsim.soilF[idx(x, y)] = v;
  for (const uo of spec.units ?? []) mkUnit(eng, uo);

  // sanity 前置：speciesBase 恒空（baseGene 空表分支零掷——C# BaseGene 空表件对齐锚）
  if (eng.speciesBase.size !== 0) throw new Error(`${spec.key}: speciesBase 非空——协议漂移`);

  // 手术二·快照：直写后/调用前的镜像输入面（黄金 fixture 通道）
  const fixture = {
    terrain0: gzB64(eng.terrain),
    regrow0: [...eng.regrow.entries()],
    building0: (spec.buildings ?? []).map(([x, y, kind]) => ({ i: idx(x, y), x, y, kind })),
    soil0: gzB64(eng.worldsim.soilF),
    units0: (spec.units ?? []).map((uo) => ({
      id: uo.id, race: uo.race, x: uo.x, y: uo.y,
      hp: uo.hp ?? 10, gene: uo.gene ?? null, dead: uo.dead ?? 0,
    })),
    ecoState0: eng.ecoState, ecoLastNoteYear0: eng.ecoLastNoteYear, ecoRepopYear0: eng.ecoRepopYear,
    yearF0: eng.yearF,   // L12177 yearNow=Math.floor(yearF)——迁徙/播报冷却双锚（S12 直写面）
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
      grassTiles: eng.grassTiles,
      preyGridMd5: md5hex(Buffer.from(eng.preyGrid.buffer)),
      ecoState: eng.ecoState,
      regrow: [...eng.regrow.entries()],
      eventsCount: eng.worldEvents.length,
      fxCount: eng.effects.length,
      unitsCount: eng.units.length,
    });
  }

  // sanity（生成即验证）
  const totalDraws = (eng.rngA >>> 0) === (spec.seed >>> 0) ? 0 : chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  if (spec.minDraws !== undefined && totalDraws !== spec.minDraws) throw new Error(`${spec.key}: 掷数 ${totalDraws} ≠ 期望 ${spec.minDraws}`);
  if (spec.sanity && !spec.sanity(eng)) {
    const gi = idx(120, 60);
    console.error(`DIAG ${spec.key}: draws=${totalDraws} rngA=${(eng.rngA >>> 0).toString(16)} grass=${eng.grassTiles} eco=${eng.ecoState} terrainGi=${eng.terrain[gi]} regrow=${[...eng.regrow.entries()]} ev=${JSON.stringify(eng.worldEvents.map((e) => e.text))} hurt20=${eng.units.filter((u) => u.hurt === 20).length} units=${eng.units.length} preySum=${eng.preyGrid.reduce((a, b) => a + b, 0)} repop=${eng.ecoRepopYear}`);
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
    regrow: [...eng.regrow.entries()],
    grassTiles: eng.grassTiles,
    preyGrid: [...eng.preyGrid],
    ecoState: eng.ecoState,
    ecoLastNoteYear: eng.ecoLastNoteYear,
    ecoRepopYear: eng.ecoRepopYear,
    units: eng.units.map(dumpUnit),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
  };
}

// ---- 场景集（12 场景：六段全分支） ----
// S4 系靶区：2×2 草格（120..121 × 60..61）capacity=4*1.6=6.4；8 羊叠站 (120.5,60.5)
// → herb=8>6.4 超载 → starve=ceil(1.6*0.2)=1 → 啃食门 grazer 恒同格 gi=idx(120,60)。
const GRAZE_PAD = rect(120, 60, 121, 61, T.GRASS);
const GRAZE_FLOCK = [...Array(8)].map((_, i) => ({ id: 100 + i, race: R.SHEEP, x: 120.5, y: 60.5 }));
// S9 靶区：4×8 草格 rect(0,0,7,3)=32 格 capacity=51.2；8 羊钳位分布（gx/gy 双钳四面）
const CLAMP_FLOCK = [
  { id: 200, race: R.SHEEP, x: -5, y: -5 },            // gx=0 gy=0（负钳；(-5/8)|0=0）
  { id: 201, race: R.SHEEP, x: 1000, y: 1000 },        // gx=31 gy=19（上钳 125→31/19）
  { id: 202, race: R.SHEEP, x: 7.9, y: 3.9 },          // gx=0 gy=0（(7.9/8)|0=0）
  { id: 203, race: R.SHEEP, x: 8, y: 8 },              // gx=1 gy=1（格界 8/8=1）
  { id: 204, race: R.SHEEP, x: 16, y: 16 },            // gx=2 gy=2
  { id: 205, race: R.SHEEP, x: 200, y: 100 },          // gx=25 gy=12
  { id: 206, race: R.SHEEP, x: 255.9, y: 159.9 },      // gx=31 gy=19（(255.9/8)|0=31 边界恰等）
  { id: 207, race: R.SHEEP, x: 120.5, y: 60.5 },       // gx=15 gy=7
];
// S11 羊群：61 只 DEEP 区散布（herb=61>60 → b 支；capacity=0 超载 starve=min(10,13)=10）
const BIG_FLOCK = [...Array(61)].map((_, i) => ({ id: 300 + i, race: R.SHEEP, x: 60 + (i % 10), y: 40 + Math.floor(i / 10) }));

const BASE = 20261102;
const specs = [
  // ---- S1：空场 collapse 播报（0 掷——迁徙 a 支 grass>1800 短路 / b 支 herb>60 短路） ----
  {
    key: 'eco-empty-collapse', baseSeed: BASE + 1, seed: 0x0EC00001, tickCount: 530, minDraws: 0,
    calls: [{ fn: 'ecoTick', args: [] }],
    sanity: (eng) => eng.grassTiles === 0 && eng.ecoState === 'collapse' && eng.worldEvents.length === 1
      && eng.worldEvents[0].kind === 'eco' && eng.worldEvents[0].text.includes('崩溃'),
  },
  // ---- S2：食草超载饥饿（gene 缺省 fitness 全 1——victim=各轮首采样）+ overgrass 播报 ----
  {
    key: 'eco-starve-nogene', baseSeed: BASE + 2, seed: 0x0EC00002, tickCount: 1000,
    units: [...Array(12)].map((_, i) => ({ id: 10 + i, race: R.SHEEP, x: 100 + i * 3, y: 50 })),
    calls: [{ fn: 'ecoTick', args: [] }],
    // starve=ceil(12*0.2)=3 轮 ×3 采样 + 啃食门（DEEP 不啃）；capacity=0 → ratio=0 → overgrass
    sanity: (eng) => eng.ecoState === 'overgrass' && eng.worldEvents.length === 1
      && eng.units.filter((u) => u.hurt === 20).length === 3 && eng.units.every((u) => u.dead ? true : u.hp <= 10),
  },
  // ---- S3：fitness 最弱者先倒下（gene.h 0.5/1/2——worst 选择面） ----
  {
    key: 'eco-starve-fitness', baseSeed: BASE + 3, seed: 0x0EC00003, tickCount: 1000,
    units: [
      { id: 21, race: R.SHEEP, x: 100, y: 50, gene: { s: 1, d: 1, h: 0.5, r: 1 } },
      { id: 22, race: R.SHEEP, x: 110, y: 50 },
      { id: 23, race: R.SHEEP, x: 120, y: 50, gene: { s: 2, d: 1, h: 2, r: 1 } },
    ],
    calls: [{ fn: 'ecoTick', args: [] }],
    // starve=ceil(3*0.2)=1 轮；victim=3 采样中 fitness 最小者（h0.5 若被采样必胜出）
    sanity: (eng) => eng.units.filter((u) => u.hurt === 20).length === 1,
  },
  // ---- S4：过度啃食命中（soil=255 → soilMul 1.4 除子）+ overgraze 播报 ----
  {
    key: 'eco-graze-burn-soil255', baseSeed: BASE + 4, seed: 0x0EC00100, tickCount: 1000,
    terrain: GRAZE_PAD, soil: GRAZE_PAD.map(([x, y]) => [x, y, 255]),
    units: GRAZE_FLOCK,
    calls: [{ fn: 'ecoTick', args: [] }],
    // regrow.set(gi, 1000+round((910+floor(rng*900))/1.4))——regrow 出账断言走黄金位级
    sanity: (eng) => {
      const gi = idx(120, 60);
      return eng.terrain[gi] === T.BURNT && eng.regrow.has(gi) && eng.grassTiles === 4
        && eng.ecoState === 'overgraze' && eng.worldEvents.length === 1
        && eng.worldEvents[0].text.includes('8/6');
    },
  },
  // ---- S5：soil=0 → soilMul 0.6 除子（regrow 值域差异位级） ----
  {
    key: 'eco-graze-burn-soil0', baseSeed: BASE + 5, seed: 0x0EC00102, tickCount: 1000,
    terrain: GRAZE_PAD, soil: GRAZE_PAD.map(([x, y]) => [x, y, 0]),
    units: GRAZE_FLOCK,
    calls: [{ fn: 'ecoTick', args: [] }],
    sanity: (eng) => eng.terrain[idx(120, 60)] === T.BURNT && eng.regrow.has(idx(120, 60)) && eng.grassTiles === 4,
  },
  // ---- S6：building 门（GRASS 门过 building!=0 → 不烧不 setTerrain） ----
  {
    key: 'eco-graze-buildingGate', baseSeed: BASE + 6, seed: 0x0EC00103, tickCount: 1000,
    terrain: GRAZE_PAD, soil: GRAZE_PAD.map(([x, y]) => [x, y, 255]),
    buildings: [[120, 60, 3]],
    units: GRAZE_FLOCK,
    calls: [{ fn: 'ecoTick', args: [] }],
    sanity: (eng) => eng.terrain[idx(120, 60)] === T.GRASS && eng.regrow.size === 0,
  },
  // ---- S7：regrow 级联出账复合语义（setTerrain(BURNT) L979 无条件 delete 预置键 →
  //        has 门 false 支 → 重设新值；场外键 5555 不受级联波及——出账域精确性） ----
  {
    key: 'eco-graze-regrowGate', baseSeed: BASE + 7, seed: 0x0EC00106, tickCount: 1000,
    terrain: GRAZE_PAD, soil: GRAZE_PAD.map(([x, y]) => [x, y, 255]),
    regrow: [[120, 60, 1100], [130, 70, 5555]],
    units: GRAZE_FLOCK,
    calls: [{ fn: 'ecoTick', args: [] }],
    // 语义链：预置 gi=15480:1100 → 烧地级联 delete → has(gi)=false → set(gi, 新值)；
    // 18050:5555 场外键原值保留
    sanity: (eng) => eng.terrain[idx(120, 60)] === T.BURNT && eng.regrow.get(idx(130, 70)) === 5555
      && eng.regrow.has(idx(120, 60)) && eng.regrow.get(idx(120, 60)) !== 1100
      && eng.regrow.get(idx(120, 60)) >= 1650 && eng.regrow.get(idx(120, 60)) <= 2293,   // 1000+round((910+0..900)/1.4) ∈ [1650,2293]
  },
  // ---- S8：捕食者竞争（aquatic 鱼/鲨跳过——pred=6 仅狼；starve=ceil(6*0.25)=2） ----
  {
    key: 'eco-pred-comp', baseSeed: BASE + 8, seed: 0x0EC00008, tickCount: 1000,
    units: [
      ...[...Array(6)].map((_, i) => ({ id: 400 + i, race: R.WOLF, x: 100 + i * 2, y: 30 })),
      { id: 410, race: R.FISH, x: 200, y: 100 },
      { id: 411, race: R.SHARK, x: 210, y: 100 },
    ],
    calls: [{ fn: 'ecoTick', args: [] }],
    // predCap=0/4.5=0 → 6>0 && len 6>4 → 2 狼挨打；herb=0<8 → collapse 播报；preyGrid 全 0
    sanity: (eng) => eng.ecoState === 'collapse' && eng.worldEvents.length === 1
      && eng.units.filter((u) => u.hurt === 20).length === 2
      && eng.preyGrid.every((v) => v === 0) && eng.grassTiles === 0,
  },
  // ---- S9：preyGrid 钳位分布（0 掷——32 格 capacity=51.2 不超载；overgrass 播报） ----
  {
    key: 'eco-preygrid-clamp', baseSeed: BASE + 9, seed: 0x0EC00009, tickCount: 1000, minDraws: 0,
    terrain: rect(0, 0, 7, 3, T.GRASS),
    units: CLAMP_FLOCK,
    calls: [{ fn: 'ecoTick', args: [] }],
    // preyGrid：[0]=2(u0,u2) [33]=1 [66]=1 [325]=1 [619]=2(u1,u6) [247]=1 合计 8
    sanity: (eng) => eng.grassTiles === 32 && eng.ecoState === 'overgrass' && eng.worldEvents.length === 1
      && eng.preyGrid[0] === 2 && eng.preyGrid[1 * 32 + 1] === 1 && eng.preyGrid[2 * 32 + 2] === 1
      && eng.preyGrid[12 * 32 + 25] === 1 && eng.preyGrid[19 * 32 + 31] === 2 && eng.preyGrid[7 * 32 + 15] === 1
      && eng.preyGrid.reduce((a, b) => a + b, 0) === 8,
  },
  // ---- S10：迁徙 a 支（全 GRASS 域 ratio≈2e-5<0.22 && grass>1800 → 5 sheep silent spawn） ----
  {
    key: 'eco-repop-herb', baseSeed: BASE + 10, seed: 0x0EC00108, tickCount: 1000, fill: 'grass',
    units: [{ id: 500, race: R.SHEEP, x: 50, y: 50 }, { id: 501, race: R.SHEEP, x: 51, y: 50 }],
    calls: [{ fn: 'ecoTick', args: [] }],
    // a 门 1 掷 + 落户采样 2 掷（全 GRASS 域必命中）+ 5 spawn（trait/maxAge/flip/breath/family 掷流）
    // collapse 播报（herb=2<8）+ 迁徙事件 = 2 条；ecoRepopYear=2
    sanity: (eng) => eng.units.length === 7 && eng.worldEvents.length === 2
      && eng.worldEvents.some((e) => e.text.includes('绵羊')) && eng.ecoRepopYear === 2
      && eng.units.filter((u) => u.race === R.SHEEP).length === 7,   // 2 夹具 + 5 spawn（unitSeq 清零起 id=1..5）
  },
  // ---- S11：迁徙 b 支（herb=61>60 && pred=0<6 → 2 狼循 herd silent spawn；前置 30 掷饥饿） ----
  {
    key: 'eco-repop-pred', baseSeed: BASE + 11, seed: 0x0EC0010E, tickCount: 1000,
    units: BIG_FLOCK,
    calls: [{ fn: 'ecoTick', args: [] }],
    // starve=10 轮 ×3 + 啃食门+grazer 2 + b 门 1 + herd 1 + 2 spawn 掷流
    // overgrass 播报（capacity=0 ratio=0）+ 狼群迁徙 = 2 事件
    sanity: (eng) => eng.units.length === 63 && eng.worldEvents.length === 2
      && eng.worldEvents.some((e) => e.text.includes('狼群')) && eng.ecoRepopYear === 2
      && eng.units.filter((u) => u.race === R.WOLF).length === 2
      && eng.units.filter((u) => u.hurt === 20).length === 10,
  },
  // ---- S12：冷却中静默切换（ecoState 直写 overgrass + ecoLastNoteYear=2 冷却中 → 静默变 overgraze） ----
  {
    key: 'eco-note-silent', baseSeed: BASE + 12, seed: 0x0EC0000C, tickCount: 1000,
    terrain: GRAZE_PAD,
    units: [...Array(12)].map((_, i) => ({ id: 600 + i, race: R.SHEEP, x: 130 + i, y: 70 })),
    ecoState: 'overgrass', ecoLastNoteYear: 2,
    calls: [{ fn: 'ecoTick', args: [] }],
    // ratio=12/6.4=1.875>1.15 → nextState=overgraze ≠ ecoState 但 2-2=0≤15 冷却 → else-if 静默
    // starve=ceil(5.6*0.2)=2 轮；迁徙 a 支 ratio>0.22 短路
    sanity: (eng) => eng.ecoState === 'overgraze' && eng.worldEvents.length === 0
      && eng.units.filter((u) => u.hurt === 20).length === 2,
  },
];

for (const s of specs.map((sp) => buildScenario(sp))) {
  console.log(`${s.key}: draws=${s.totalDraws} grass=${s.grassTiles} regrow=${s.regrow.length} units=${s.units.length} ev=${s.events.length} eco=${s.ecoState} rngA=${s.stepsSnap.at(-1).rngA}`);
}

// ---- det 双跑（字节级） ----
const det2 = specs.map(buildScenario);
for (let i = 0; i < specs.length; i++) {
  const a = buildScenario(specs[i]);
  if (a.stepsSnap.at(-1).terrainMd5 !== det2[i].stepsSnap.at(-1).terrainMd5
    || a.stepsSnap.at(-1).rngA !== det2[i].stepsSnap.at(-1).rngA
    || JSON.stringify(a.stepsSnap) !== JSON.stringify(det2[i].stepsSnap)
    || JSON.stringify(a.units) !== JSON.stringify(det2[i].units))
    throw new Error(`det 失败 ${specs[i].key}`);
}
console.log('det 双跑字节级一致:', specs.map((s) => s.key).join(' '));

const scenarios = specs.map((sp) => buildScenario(sp));
const out = {
  meta: {
    gen: 'gen-eco.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写（fill 面 deep/grass + terrain/owner/regrow/buildings/soil/units 瘦直写 + eco 三态字段）+ rngA 尾置清零起流 + calls 序直调（ecoTick）每调用步进快照',
    rng: 'eng.rngA 单流；饥饿 3 掷/轮、啃食门 1+grazer 1+regrow 1（has 门短路）、竞争 1 掷/轮、迁徙 a 门 1+采样 2/轮、b 门 1+herd 1、silent spawn trait0.15+maxAge+flip+breath+family0.06 掷流；mulberry 纯数学反解 total',
    math: '纯算术域（ceil/min/floor/round）+ soilMulAt 除子（0.6..1.4）——零 fdlibm 消费（rainFlood 系差异面）；C# Math.Ceiling/Math.Round 位域对账（JsRound 先例）',
    domains: ['ecoTick L12096-12202 六段', 'isHerbivoreRace L2120-2129（已译件复用）', 'isPredatorRace L2169-2178（本轮新建）', 'setTerrain 级联（WbBail 已译件复用）', 'spawnUnit 静默链 L1289-1465（WbBail 已译件复用）', 'addEvent L13995-14009 unshift+cap80', 'baseGene L11059-11063 空表分支零掷'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/eco.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/eco.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('eco.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
