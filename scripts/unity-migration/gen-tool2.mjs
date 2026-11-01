// ============================================================================
// gen-tool2.mjs —— M-U15 切片二「三神力创建函数 + nuke/river 调用面」黄金向量
//   蓝本 engine.ts：lightning L10507-10531 / earthquake L10532-10544 /
//   spawnTornado L10725-10737 / applyTool case lightning L13333-13335 +
//   tornado L13336-13338 + earthquake L13339-13341（rP ?? 9）+ nuke L13351-13353 +
//   river L13354-13356（runtime carveRiver L12312-12415——M-U7k 译件体同源，
//   玩家路径 w.brush 参化面）。
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），手术式夹具直写 +
// rngA 尾置清零起流 + calls 序直调（每调用后快照——gen-tool M-U14 协议同构）。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA——lightning 首击 n>1 亦散布（L10513 n>1 门在循环内）
//     2 掷/击 + 中心 ignite 1 掷/点燃 + 四邻 1 掷/格（先界外 continue 后掷——L10524-10528
//     序敏感）；tornado k=0 零掷 + k>0 2 掷/只（L10730-10731）+ 全局 cur+k>=6 break
//     （L10729，cur 为 filter 快照）；earthquake 零掷（fx ttl + JsRound shake 面）；
//     nuke→explode 全级联（M-U10c 译件体）；river→BFS + 加权随机走 1 掷/步 +
//     灌溉环 1 掷/GRASS 格（0.05×soilMulAt 门）+ 内流湖零掷支。
//   ② Math.hypot 域：lightning 单位环 d<1.9 + carveLake d=hypot(dx,dy)——bun 原生
//     fdlibm；C# FdHypot 位精确件对账。
//   ③ OOB 语义面（L10519 idx 无钳——负 fy 真越界）：terrain[i]=undefined →
//     FLAMMABLE.includes(false)=false → !false=true && building[i]===0=undefined===0
//     =false → 合取不过门 → 不早退 → 1 掷消费（fire[i] 定型数组 OOB 写静默丢弃）+
//     fireSet.add(i) 负索引入集（JS Set 容忍）——C# 侧 OOB 分支显式镜像（S4 钉）。
//   ④ Math.round 域：earthquake shake=min(12, round(8*pw))——JS .5 上取整；
//     C# JsRound（WbMath L151 floor(x+0.5)），禁 Math.Round 银行家舍入。
//   ⑤ toast 宿主回调（onToast 收集——river 双文本/内流湖文本）+ statNukes 成就计数 +
//     riverTiles 插入序 + riverDirMd5 面（S11/S12 对账）。
//
// 运行：bun scripts/unity-migration/gen-tool2.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/tool2.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool2.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（同 gen-tool.mjs） ----
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

// 瘦单位直写（gen-tool mkUnit 同源）
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

// units dump 协议（gen-tool dumpUnit 同构）
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

// ---- 手术式夹具构建 + calls 直调步进快照（gen-tool buildScenario 同构） ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-tool 同款 + brush 本域直写面）
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
  eng.brush = spec.brush ?? 3;                     // L688 类字段默认 3——river 参化消费面
  eng.statNukes = 0;                               // L230 成就计数清零（nuke 面）

  // toast 宿主回调收集器（纪律③事件流——onToast L14027 收集面入黄金）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });

  // 手术二·直写相（保序）：terrain/owner/regrow/flood/fire/building/soil/variant/radiate/units/effects
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
  for (const [x, y, kind] of spec.effects ?? []) {
    eng.effects.push({ kind, x, y, ttl: 100, age: 0, seed: 1, dir: 0, r: kind === 'quake' ? 8 : undefined }); // 直写游荡云族快照面——tornado-cap 计数消费
  }

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
    radiate0: gzB64(eng.radiate),
    radSet0: [...eng.radSet.entries()],
    brush0: eng.brush,
    effects0: (spec.effects ?? []).map(([x, y, kind]) => ({ i: idx(x, y), x, y, kind })),
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
      riverDirMd5: md5hex(eng.riverDir),
      riverTiles: [...eng.riverTiles],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
      buildingsCount: eng.buildings.length,
      shake: eng.shake,
      statNukes: eng.statNukes,
      unitsCount: eng.units.length,
    });
  }

  // sanity（生成即验证）——TOOL2_DIAG=1 时不符仅告警继续（供首轮掷数定案）
  const totalDraws = (eng.rngA >>> 0) === (spec.seed >>> 0) ? 0 : chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  const drawsMismatch = spec.minDraws !== undefined && totalDraws !== spec.minDraws;
  if (drawsMismatch && process.env.TOOL2_DIAG === '1') console.log(`DIAG-draws ${spec.key}: 实测 ${totalDraws} ≠ 预估 ${spec.minDraws}`);
  if (drawsMismatch && process.env.TOOL2_DIAG !== '1') throw new Error(`${spec.key}: 掷数 ${totalDraws} ≠ 期望 ${spec.minDraws}`);
  if (spec.sanity && !spec.sanity(eng, toasts)) {
    console.error(`DIAG ${spec.key}: draws=${totalDraws} rngA=${(eng.rngA >>> 0).toString(16)} shake=${eng.shake} nukes=${eng.statNukes} fx=${JSON.stringify(eng.effects.map((e) => ({ k: e.kind, x: e.x, y: e.y, ttl: e.ttl, r: e.r })))} fireSetNeg=[...eng.fireSet].filter(i=>i<0).length=${[...eng.fireSet].filter((i) => i < 0).length} units=${JSON.stringify(eng.units.map((u) => ({ id: u.id, hp: u.hp, hurt: u.hurt, dead: u.dead })))} ev=${JSON.stringify(eng.worldEvents.map((e) => e.text))} toasts=${JSON.stringify(toasts.map((t) => t.text))} riverTiles=${eng.riverTiles.length} t10060=${eng.terrain[idx(100, 60)]} waterTier10060=${eng.waterTier[idx(100, 60)]}`);
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
    statNukes: eng.statNukes,
    riverTiles: [...eng.riverTiles],
    riverDirMd5: md5hex(eng.riverDir),
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
    units: eng.units.map(dumpUnit),
    toasts,
  };
}

// ---- 场景集（12 场景：lightning 四面 / tornado 三面 / quake 双面 / nuke / river 双面） ----
// 靶区：中心 (100,60)；brush 直写面走 spec.brush（L688 默认 3）
const BASE = 20261115;

const specs = [
  // ---- S1：lightning 单击默认参（n=1 精确命中零散布掷 + 中心点燃 + 四邻 4 掷；
  //        单位环 d<1.9 hp-=95×pw——grass 全域 fill 使 ignite 门全过）----
  {
    key: 'lightning-single', baseSeed: BASE + 1, seed: 0x0B610001, tickCount: 1000, fill: 'grass',
    units: [{ id: 900, race: R.SHEEP, x: 100, y: 60, hp: 200, maxHp: 200 },
            { id: 901, race: R.SHEEP, x: 102.5, y: 60, hp: 200, maxHp: 200 }],   // d=2.5 环外
    calls: [{ fn: 'applyTool', args: ['lightning', 100, 60] }],
    minDraws: 10,  // 实测钉：fx bolt 2 + 中心点燃 1 + 四邻 4 + 邻格点燃支 3
    sanity: (eng) => eng.unitById.get(900).hp === 105 && eng.unitById.get(901).hp === 200
      && eng.shake === 4 && eng.fire[idx(100, 60)] > 0 && eng.fireSet.size >= 1,
  },
  // ---- S2：lightning 连击（count=5 power=1.5——首击亦散布 n>1 门在循环内 2 掷/击；
  //        95×1.5=142.5 伤害面）----
  {
    key: 'lightning-multi', baseSeed: BASE + 2, seed: 0x0B610002, tickCount: 1000, fill: 'grass',
    units: [{ id: 910, race: R.SHEEP, x: 100, y: 60, hp: 500, maxHp: 500 },
            { id: 911, race: R.SHEEP, x: 101, y: 60.4, hp: 500, maxHp: 500 }],   // 近距副目标
    calls: [{ fn: 'applyTool', args: ['lightning', 100, 60, { count: 5, power: 1.5 }] }],
    minDraws: 53,  // 实测钉：5 击 ×（2 散布+fx 2+点燃 1+邻 4）+ 邻格点燃支
    sanity: (eng) => eng.effects.filter((e) => e.kind === 'bolt').length === 5 && eng.shake === 4,
  },
  // ---- S3：lightning 钳位双调用（count=50→n=12 power=10→pw=3 上钳；count=0→n=1
  //        power=0.1→pw=0.5 下钳——双端 clamp 面 + 散布脱靶实证）----
  {
    key: 'lightning-clamp', baseSeed: BASE + 3, seed: 0x0B610003, tickCount: 1000, fill: 'grass',
    units: [{ id: 920, race: R.SHEEP, x: 100.5, y: 60, hp: 2000, maxHp: 2000 }],
    calls: [
      { fn: 'applyTool', args: ['lightning', 100, 60, { count: 50, power: 10 }] },  // n=12 pw=3
      { fn: 'applyTool', args: ['lightning', 100, 60, { count: 0, power: 0.1 }] },  // n=1 pw=0.5
    ],
    minDraws: 134, // 实测钉：12 击 ×9 + 1 击 ×（fx 2+点燃 1+邻 4）+ 点燃支
    sanity: (eng) => eng.effects.filter((e) => e.kind === 'bolt').length === 13
      && eng.unitById.get(920).hp === 1952.5,   // 12 连击散布 ±6 全脱靶 + 第二调用 n=1 精确命中 pw=0.5 → 2000-95×0.5
  },
  // ---- S4：lightning 边缘散布（靶 (3,0.4) count=12——ly<0 → idx 负 fy 真越界：
  //        ignite OOB 分支 1 掷消费 + fireSet 负索引入集——JS undefined 语义镜像钉）----
  {
    key: 'lightning-edge', baseSeed: BASE + 4, seed: 0x0B610004, tickCount: 1000, fill: 'grass',
    units: [{ id: 930, race: R.SHEEP, x: 3, y: 0.4, hp: 2000, maxHp: 2000 }],
    calls: [{ fn: 'applyTool', args: ['lightning', 3, 0.4, { count: 12, power: 3 }] }],
    minDraws: 88,  // 实测钉：12 击 ×（2 散布+fx 2+点燃 1+邻 4）+ OOB/点燃支 4
    sanity: (eng) => eng.effects.filter((e) => e.kind === 'bolt').length === 12
      && [...eng.fireSet].some((i) => i < 0),   // OOB ignite 负索引入集实证
  },
  // ---- S5：tornado 单只（count 缺省 → n=1——k=0 精确落点 + fx tornado 2 掷 ttl=340）----
  {
    key: 'tornado-single', baseSeed: BASE + 5, seed: 0x0B610005, tickCount: 1000, fill: 'grass',
    calls: [{ fn: 'applyTool', args: ['tornado', 100, 60] }],
    minDraws: 2,   // 实测钉：fx tornado 2 掷（种子+漂移相流——fx 恒 2 掷，M-U10d 注记同源）
    sanity: (eng) => eng.effects.length === 1 && eng.effects[0].kind === 'tornado'
      && eng.effects[0].x === 100 && eng.effects[0].y === 60 && eng.effects[0].ttl === 340,
  },
  // ---- S6：tornado 散布（count=4——k=0 精确 + 3 只 2 掷散布/只 spread max(4, 8)=8）----
  {
    key: 'tornado-multi', baseSeed: BASE + 6, seed: 0x0B610006, tickCount: 1000, fill: 'grass',
    calls: [{ fn: 'applyTool', args: ['tornado', 100, 60, { count: 4 }] }],
    minDraws: 14,  // 实测钉：k=0 fx 2 + 3×（散布 2+fx 2）
    sanity: (eng) => eng.effects.length === 4 && eng.effects.filter((e) => e.kind === 'tornado').length === 4,
  },
  // ---- S7：tornado 全局 6 上限（预置 5 只 tornado 直写 + count=3——cur=5 快照：
  //        k=0 精确补 1 只（fx 2 掷）+ k=1 cur+k=6>=6 break——上限防刷屏面）----
  {
    key: 'tornado-cap', baseSeed: BASE + 7, seed: 0x0B610007, tickCount: 1000, fill: 'grass',
    effects: [[90, 50, 'tornado'], [95, 50, 'tornado'], [100, 50, 'tornado'], [105, 50, 'tornado'], [110, 50, 'tornado']],
    calls: [{ fn: 'applyTool', args: ['tornado', 100, 60, { count: 3 }] }],
    minDraws: 2,   // 实测钉：k=0 fx 2 + k=1 break 零掷
    sanity: (eng) => eng.effects.filter((e) => e.kind === 'tornado').length === 6,
  },
  // ---- S8：quake 默认参（rP undefined → case rP ?? 9 = 9；pw=1——rr=9 ttl=floor(90)=90
  //        shake=min(12, JsRound(8))=8——fx 2 掷外全确定域）----
  {
    key: 'quake-default', baseSeed: BASE + 8, seed: 0x0B610008, tickCount: 1000, fill: 'grass',
    calls: [{ fn: 'applyTool', args: ['earthquake', 100, 60] }],
    minDraws: 2,   // 实测钉：fx quake 2 掷
    sanity: (eng) => eng.effects.length === 1 && eng.effects[0].kind === 'quake'
      && eng.effects[0].ttl === 90 && eng.effects[0].r === 9 && eng.shake === 8,
  },
  // ---- S9：quake 双端钳位（radius=2→rP=2→rr=max(3,2)=3 pw=min(3,5)=3 ttl=270 shake=12 封顶；
  //        radius=40→rr=24 power=0.2→pw=0.5 ttl=45 shake=JsRound(4)=4——双步进）----
  {
    key: 'quake-clamp-double', baseSeed: BASE + 9, seed: 0x0B610009, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['earthquake', 100, 60, { radius: 2, power: 5 }] },
      { fn: 'applyTool', args: ['earthquake', 110, 60, { radius: 40, power: 0.2 }] },
    ],
    minDraws: 4,   // 实测钉：2 次 fx quake 各 2 掷
    sanity: (eng) => eng.effects.length === 2 && eng.effects[0].r === 3 && eng.effects[0].ttl === 270
      && eng.effects[1].r === 24 && eng.effects[1].ttl === 45 && eng.shake === 4,
  },
  // ---- S10：nuke 调用面（power=2 → r=max(3,min(24,14))=14——explode{terrain,lava,nuke}
  //        全级联（M-U10c 译件体）+ statNukes 成就计数 + 建筑摧毁 + 单位环 + 蘑菇云纪事）----
  {
    key: 'nuke-hit', baseSeed: BASE + 10, seed: 0x0B61000A, tickCount: 1000, fill: 'grass',
    terrain: [...rect(88, 52, 112, 68, T.GRASS)],
    buildings: [[101, 60, 3], [115, 60, 3]],
    units: [
      { id: 940, race: R.SHEEP, x: 100, y: 60, hp: 300, maxHp: 300 },
      { id: 941, race: R.SHEEP, x: 112, y: 60, hp: 300, maxHp: 300 },   // d=12 <14 伤
      { id: 942, race: R.SHEEP, x: 120, y: 60, hp: 300, maxHp: 300 },   // d=20 环外
    ],
    calls: [{ fn: 'applyTool', args: ['nuke', 100, 60, { power: 2 }] }],
    minDraws: 460, // 实测钉：explode 级联掷流（smoke/flash/mushroom fx + 环格门）
    sanity: (eng) => eng.statNukes === 1 && !!eng.unitById.get(940).dead   // explode 写 u.dead = true（布尔真值——!==1）
      && eng.unitById.get(941).hp === 243.24324324324323 && !eng.unitById.get(942).dead
      && eng.buildings.length === 1 && eng.buildings[0].i === idx(115, 60)
      && eng.shake === 14 && eng.worldEvents.some((e) => e.text.includes('蘑菇云')),
  },
  // ---- S11：river 行走支（pond 直写 (18,58)-(22,62)——BFS 反向距离场 + 加权随机走
  //        1 掷/步 + 刻河 cross width=1 + 灌溉环 ir=2 GRASS 1 掷/格（0.05×soilMul 门）
  //        + riverDir/riverTiles 写入 + fx spawn 2 掷 + toast 入海文本）----
  {
    key: 'river-walk', baseSeed: BASE + 11, seed: 0x0B61000B, tickCount: 1000, fill: 'grass',
    terrain: rect(18, 58, 22, 62, T.WATER),
    brush: 3,
    calls: [{ fn: 'applyTool', args: ['river', 100, 60] }],
    sanity: (eng, toasts) => eng.terrain[idx(100, 60)] === T.WATER
      && eng.riverTiles.has(idx(100, 60)) && toasts.some((t) => t.text === '一条大河蜿蜒入海'),
  },
  // ---- S12：river 内流湖 + 早退双支（brush=5——无水 BFS 全 -1 → carveLake max(2,5)=5
  //        参化面 + toast 群山文本；步二 (100,60) 已 WATER → isWater 早退 false 零写零掷）----
  {
    key: 'river-lake-earlyreturn', baseSeed: BASE + 12, seed: 0x0B61000C, tickCount: 1000, fill: 'grass',
    brush: 5,
    calls: [
      { fn: 'applyTool', args: ['river', 100, 60] },   // 内流湖 r=5（参化 max(2,brush)）
      { fn: 'applyTool', args: ['river', 100, 60] },   // 早退 false（isWater 门）
    ],
    minDraws: 2,   // 内流湖 fx spawn 2 掷 + 步二早退零掷（实测钉）
    sanity: (eng, toasts) => eng.terrain[idx(100, 60)] === T.WATER
      && eng.terrain[idx(100, 54)] === T.GRASS   // d=6 r+1 环带幸存 GRASS（d≤r=5 才 WATER）
      && eng.terrain[idx(106, 60)] === T.GRASS    // 环带 GRASS 不变（无 SAND/BURNT）
      && toasts.some((t) => t.text === '群山环抱的洼地积水成湖'),
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
  if (a.stepsSnap.at(-1).terrainMd5 !== b.stepsSnap.at(-1).terrainMd5
    || a.stepsSnap.at(-1).rngA !== b.stepsSnap.at(-1).rngA
    || JSON.stringify(a.stepsSnap) !== JSON.stringify(b.stepsSnap)
    || JSON.stringify(a.units) !== JSON.stringify(b.units)
    || JSON.stringify(a.fx) !== JSON.stringify(b.fx)
    || JSON.stringify(a.toasts) !== JSON.stringify(b.toasts)
    || JSON.stringify(a.riverTiles) !== JSON.stringify(b.riverTiles))
    throw new Error(`det 失败 ${specs[i].key}`);
}
console.log('det 双跑字节级一致:', specs.map((s) => s.key).join(' '));

const scenarios = specs.map((sp, i) => det1[i]);
const out = {
  meta: {
    gen: 'gen-tool2.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写（fill 面 deep/grass + terrain/owner/regrow/flood/fire/buildings/soil/variant/radiate/units/effects 瘦直写 + brush/statNukes 直写）+ rngA 尾置清零起流 + calls 序直调（applyTool 大分发器切片二）每调用步进快照',
    rng: 'eng.rngA 单流；lightning n>1 每击 2 掷散布（含首击）+ 中心 ignite 1 掷/点燃 + 四邻界外 continue 后 1 掷/格；ignite OOB 分支（idx 负 fy）1 掷消费 + fireSet 负索引入集；tornado k=0 零掷 + k>0 2 掷/只 + cur+k>=6 break；quake/内流湖/早退零掷；nuke→explode 级联掷流；river→加权随机走 1 掷/步 + 灌溉 1 掷/GRASS 格；mulberry 纯数学反解 total',
    math: '纯算术域 + Math.hypot（lightning 单位环 d<1.9 / carveLake d=hypot(dx,dy)——bun 原生 fdlibm；C# FdHypot 位精确件对账）+ Math.round（quake shake——JS .5 上取整；C# JsRound 禁银行家舍入）+ 加权随机权重 1/(1+(curD-dist)*0.5) 纯算术',
    domains: ['lightning L10507-10531（clamp 1-12/0.5-3 + n>1 散布 + 单位环 95*pw + ignite + 四邻 0.5 门 + shake=max 4）', 'earthquake L10532-10544（clamp 3-24/0.5-3 + fx quake ttl max(30,floor(90*pw)) opts{r:rr} + shake=min(12,round(8*pw))）', 'spawnTornado L10725-10737（clamp 1-6 + filter 快照 cur + cur+k>=6 break + k=0 零掷 + ttl=340）', 'applyTool case lightning/tornado/earthquake（rP??9）/nuke（powerP 默认 1）/river L13333-13356', 'carveRiver L12312-12415（runtime 体——M-U7k 译件同源 + w.brush 参化面 + moistMap 桩参不消费）', 'carveLake L12417-12431（hypot 圆湖 + 外圈绿洲）', 'ignite L1078-1085（已译件 IgniteE 复用 + OOB 分支显式镜像）', 'Nuke L12255-12260（M-U10d 译件——statNukes + explode 级联）', 'toast L13990-13992 onToast 收集 + statNukes L230'],
    deferred: ['natureLightning L10548 / 板块地震 L10565+（nature 域切片）', 'acidRain L10739 / volcano L10752+（天灾域切片）', 'meteor/finger/chest/ITEM_TOOL/cre:/RACE_TOOL 等其余 applyTool case（各域切片挂账不变）'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/tool2.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool2.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('tool2.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
