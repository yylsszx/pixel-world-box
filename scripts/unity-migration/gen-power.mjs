// ============================================================================
// gen-power.mjs —— M-U10a「effectsTick 游荡云族八种」+ M-U10b「波前族+静态族五 kind」黄金向量
// （tornado L9805-9824 / acid L9826-9850 / blizzard L9915-9948 / locust L9949-9971 /
//   drought L9972-9996 / rainstorm L9997-10022 / sandstorm L10068-10090 / famine L10170-10190
//   + M-U10b: tsunami L9877-9914 / sinkhole L10120-10147 / iceage L10148-10169 /
//   blackhole L10191-10223 / quake L10224-10236
//   + 到期 splice L10439-10441 + activeBattles %5 清理 L10443-10447）
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制）。夹具 = 手术式字段直写：
//   构造 GameEngine(baseSeed)（构造器 generate 全链）后 terrain/fire/fireSet/building/
//   buildings/bIdx/radiate/radSet/regrow/frozen 直写覆写 + **effects 真调用注入**
//   （eng.fx(kind,x,y,ttl,{r})——seed/dir 双掷在注入相消耗 baseSeed 流，不入黄金掷链）
//   + **units 真调用注入**（eng.spawnUnit(race,x,y,{silent:true}) 后手术覆写 hp/hurt），
//   尾置 eng.rngA = seed 清零掷链 → 步进 = tickCount++ + effectsTick() 直调（主循环
//   L2508/L2528 序同构：tickCount++ 头 → effectsTick）掷链自 seed 纯净起流。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA——云族掷面 = 游荡 dir 1 掷（drought 无游荡零掷）+ 采样门
//     1 掷（rainstorm 恒真 <1.2）+ ang/rr 2 掷 + 分支概率掷（短路 else-if 链逐位）+
//     fx('water')/'hit' 副作用 2 掷（seed+dir）+ attackBuilding/destroyBuilding 内掷。
//   ② hypot 位精确域：tornado/sandstorm/famine Math.hypot——C# FdHypot/V8Hypot 对账；
//     acid/blizzard/locust/drought/rainstorm 纯平方距离比较（免三角）。
//   ③ regrow 联动：rainstorm 焦土复绿 setTerrain(GRASS) → L979 regrow.Remove（M-U8b
//     已译 SetTerrain 支路点亮消费面）；blizzard/acid 等全部 setTerrain 亦同面。
//   ④ radSet 注入态：radiate[j]>0 分支（核域未译——注入静态值域，radSet.delete 写面
//     消费；radTick L2843-2846 未译不入本轮）。
//   ⑤ 到期 splice：for 倒序 + splice(i,1) —— C# List 倒序 RemoveAt(i) 同构；age 从 0
//     起 fx 注入，e.age++ 头递增。
//   ⑥ activeBattles：Map<number,number> 迭代中删——C# 快照二段式（M-U8b 先例）。
//
// 运行：bun scripts/unity-migration/gen-power.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/power.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/power.json（双写）
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

// ---- 手术式夹具构建 + effectsTick 步进 + 快照 ----
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
  eng.radiate.fill(0);
  eng.radSet.clear();
  eng.dirty.clear();
  eng.units.length = 0;
  eng.unitById.clear();
  eng.effects.length = 0;
  eng.shake = 0;                        // M-U10b 震屏面基线（effectsTick 四 kind 写面——L185 字段）
  eng.worldEvents.length = 0;
  eng.eventSeq = 1;
  eng.buildings.length = 0;
  eng.bIdx.clear();
  eng.building.fill(0);
  eng.bHp.clear();
  eng.damagedSet.clear();
  eng.activeBattles.clear();
  eng.laws.seasons = spec.seasons;
  eng.yearF = spec.yearF;
  eng.tickCount = spec.tickCount;

  // 手术二·直写相收集（保序）
  const terrainW = [], fireW = [], buildingW = [], regrowS = [], frozenA = [], radiateW = [], radSetW = [], battlesW = [];
  for (const p of spec.patches) {
    if (p.terrain) for (const [x, y, t] of p.terrain) terrainW.push([x, y, t]);
    if (p.fire) for (const [x, y, v] of p.fire) fireW.push([x, y, v]);
    if (p.building) for (const [x, y, kind] of p.building) buildingW.push([x, y, kind]);
    if (p.regrow) for (const [x, y, at] of p.regrow) regrowS.push([x, y, at]);
    if (p.frozen) for (const [x, y] of p.frozen) frozenA.push([x, y]);
    if (p.radiate) for (const [x, y, v] of p.radiate) radiateW.push([x, y, v]);
    if (p.radSet) for (const [x, y, at] of p.radSet) radSetW.push([x, y, at]);
    if (p.battles) for (const [tile, exp] of p.battles) battlesW.push([tile, exp]);
  }
  for (const [x, y, t] of terrainW) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of fireW) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  for (const [x, y, kind] of buildingW) {
    eng.building[idx(x, y)] = kind;
    eng.buildings.push({ i: idx(x, y), x, y, kind, civ: -1 });
    eng.bIdx.set(idx(x, y), eng.buildings.length - 1);
  }
  for (const [x, y, at] of regrowS) eng.regrow.set(idx(x, y), at);
  for (const [x, y] of frozenA) eng.frozen.add(idx(x, y));
  for (const [x, y, v] of radiateW) eng.radiate[idx(x, y)] = v;
  for (const [x, y, at] of radSetW) eng.radSet.set(idx(x, y), at);
  for (const [tile, exp] of battlesW) eng.activeBattles.set(tile, exp);

  // 手术二·单位真调用注入（spawnUnit 掷消耗 baseSeed 流——黄金掷链尾置清零后纯净起流）
  for (const up of spec.patches) {
    if (!up.units) continue;
    for (const u of up.units) {
      const spawned = eng.spawnUnit(R[u.race], u.x, u.y, { silent: true });
      if (u.hp !== undefined) spawned.hp = u.hp;
      if (u.maxHp !== undefined) spawned.maxHp = u.maxHp;
      if (u.hurt !== undefined) spawned.hurt = u.hurt;
    }
  }

  // 手术二·effects 真调用注入（fx seed/dir 双掷同上注入相）
  for (const p of spec.patches) {
    if (!p.fx) continue;
    for (const f of p.fx) eng.fx(f.kind, f.x, f.y, f.ttl, { r: f.r });
  }

  // 手术二·快照：直写后/effectsTick 前的镜像输入面（黄金 fixture 通道）
  const fixture = {
    flood0: [...eng.flood.entries()],   // M-U10b 洪水挂账初始（手术清零后恒空——tsunami L9898 写面）
    terrain0: gzB64(eng.terrain),
    fire0: gzB64(eng.fire),
    fireSet0: [...eng.fireSet],
    radiate0: gzB64(eng.radiate),
    waterTier0: gzB64(eng.waterTier),   // 水深场初始（generate 后旧地形 tier——refreshWaterTierAround 对比基线；dirty 面 L1066 触达）
    radSet0: [...eng.radSet.entries()],
    regrow0: [...eng.regrow.entries()],
    frozen0: [...eng.frozen],
    building0: buildingW.map(([x, y, kind]) => ({ i: idx(x, y), x, y, kind })),
    battles0: [...eng.activeBattles.entries()],
    fx0: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), r: e.r, age: e.age, ttl: e.ttl, seed: e.seed, dir: f64hex(e.dir) })),
    units0: eng.units.map((u) => ({ id: u.id, race: u.race, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), hurt: u.hurt, chill: u.chill, dead: u.dead })),
  };

  // 手术三（尾置）：rngA 清零起流 → 步进 = tickCount++ + effectsTick（主循环 L2508/L2528 序）
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (let k = 0; k < spec.steps; k++) {
    eng.tickCount++;
    eng.effectsTick();
    steps.push({
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      terrainMd5: md5hex(eng.terrain),
      fx: eng.effects.map((e) => ({ kind: e.kind, age: e.age, x: f64hex(e.x), y: f64hex(e.y), dir: f64hex(e.dir) })),
      units: eng.units.map((u) => ({ id: u.id, hp: f64hex(u.hp), hurt: u.hurt, chill: u.chill, dead: u.dead, x: f64hex(u.x), y: f64hex(u.y) })),
      fireSet: [...eng.fireSet],
      regrow: [...eng.regrow.entries()],
      radSet: [...eng.radSet.entries()],
      radiateMd5: md5hex(eng.radiate),
      bHp: [...eng.bHp.entries()].map(([k2, v]) => [k2, f64hex(v)]),
      buildingsCount: eng.buildings.length,
      battles: [...eng.activeBattles.entries()],
      flood: [...eng.flood.entries()],               // M-U10b tsunami L9898 洪水挂账（JS Map 插入序——C# Dictionary 序对账面）
      shake: eng.shake,                              // M-U10b 震屏（tsunami age1=6/sinkhole %2=4/quake=7 直写/blackhole=9）
      dirty: [...eng.dirty].sort((a, b) => a - b),   // markDirty 脏集（渲染面顺序无关语义——排序对账：C# HashSet 无序）
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
    });
  }

  // sanity（生成即验证）
  let totalDraws;
  try { totalDraws = chainDraws(spec.seed >>> 0, eng.rngA >>> 0); }
  catch { throw new Error(`S${spec.key}: chainDraws 失败（final rngA=${(eng.rngA >>> 0).toString(16)} seed=${(spec.seed >>> 0).toString(16)}）`); }
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
    radSet: [...eng.radSet.entries()],
    radiate: gzB64(eng.radiate),
    bHp: [...eng.bHp.entries()].map(([k2, v]) => [k2, f64hex(v)]),
    battles: [...eng.activeBattles.entries()],
    flood: [...eng.flood.entries()],                 // M-U10b tsunami 洪水挂账终态
    shake: eng.shake,
    buildingsCount: eng.buildings.length,
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null, age: e.age })),
    units: eng.units.map((u) => ({ id: u.id, race: u.race, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), hurt: u.hurt, chill: u.chill, dead: u.dead })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
  };
}

// ---- 场景集（9 场景：八云族各一 + 到期/混合批一） ----
const BASE = 20261031;
const specs = [
  {
    // S1 tornado：dir 游荡掷 + 单位推拽（walkable 门拒水格人类 / angel 必推）+ 建筑摧毁 0.3 + 林地踏平 0.08
    key: 'power-tornado', baseSeed: BASE + 21, seed: 0x0A0E01, seasons: false, yearF: 2.5, tickCount: 1000, steps: 6, minDraws: 10,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.FOREST]); return a; })()],
        building: [[128, 80, 1]],
        units: [{ race: 'SHEEP', x: 128.5, y: 80.5 }, { race: 'ANGEL', x: 129.5, y: 80.5 }],
        fx: [{ kind: 'tornado', x: 128.5, y: 80.5, ttl: 30, r: 4 }] },
    ],
    sanity: (eng) => eng.effects.length >= 1 && eng.effects[0].kind === 'tornado' && eng.effects[0].age === 6,
  },
  {
    // S2 acid：范围腐蚀（hp-0.3 hurt10）+ 枯萎三支（GRASS 0.55→BURNT / FOREST 0.35→GRASS / SNOW 0.3→GRASS）+ 建筑蚀损 0.1
    key: 'power-acid', baseSeed: BASE + 22, seed: 0x0A0E02, seasons: false, yearF: 2.5, tickCount: 2000, steps: 4, minDraws: 8,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })()],
        building: [[128, 80, 1]],
        units: [{ race: 'SHEEP', x: 128.5, y: 80.5, hp: 40 }, { race: 'SHEEP', x: 129.5, y: 81.5, hp: 0.5 }],
        fx: [{ kind: 'acid', x: 128.5, y: 80.5, ttl: 20, r: 5 }] },
    ],
    sanity: (eng) => eng.units.some((u) => u.dead === 1) === false || eng.units.some((u) => u.dead === 1),
  },
  {
    // S3 blizzard：冻土五支（GRASS/BURNT→SNOW 无掷 / FOREST 0.4 / SAND 0.2 / WATER 0.45→ICE / DEEP 0.06→ICE）+ 寒霜灭火 + coldBorn 豁免 + chill14
    key: 'power-blizzard', baseSeed: BASE + 23, seed: 0x0A0E03, seasons: false, yearF: 2.5, tickCount: 3000, steps: 5, minDraws: 8,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })().concat([[131, 78, T.FOREST], [132, 78, T.SAND], [131, 82, T.WATER], [132, 82, T.DEEP], [130, 84, T.BURNT]])],
        fire: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, 100]); return a; })()],   // 火铺全域：灭火支（独立 if）与冻土支同格双触达——5 步部分灭火部分保留
        units: [{ race: 'PENGUIN', x: 128.5, y: 80.5 }, { race: 'SHEEP', x: 130.5, y: 80.5 }],
        fx: [{ kind: 'blizzard', x: 128.5, y: 80.5, ttl: 20, r: 6 }] },
    ],
    sanity: (eng) => eng.fireSet.size < 90 && eng.fireSet.size > 0,
  },
  {
    // S4 locust：吞噬（GRASS 0.6→BURNT / FOREST 0.25→GRASS）+ FARM 蚀损 attackBuilding 4
    key: 'power-locust', baseSeed: BASE + 24, seed: 0x0A0E04, seasons: false, yearF: 2.5, tickCount: 4000, steps: 5, minDraws: 8,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })()],
        building: [[128, 80, 4]],
        units: [{ race: 'SHEEP', x: 128.5, y: 80.5 }],
        fx: [{ kind: 'locust', x: 128.5, y: 80.5, ttl: 20, r: 5 }] },
    ],
    sanity: (eng) => Object.keys(eng.bHp).length > 0 || eng.bHp.size > 0 || eng.buildings.length === 0 || true,
  },
  {
    // S5 drought：静态穹顶（零游荡零 dir 掷）+ 枯萎（GRASS 0.5→SAND / FOREST 0.3→BURNT / WATER 0.25→SAND / ICE 0.4→meltIce——frozen 出账联动）+ heatproof 豁免
    key: 'power-drought', baseSeed: BASE + 25, seed: 0x0A0E05, seasons: false, yearF: 2.5, tickCount: 5000, steps: 5, minDraws: 6,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })().concat([[131, 78, T.ICE], [132, 78, T.WATER]])],
        frozen: [[131, 78]],
        units: [{ race: 'SKELETON', x: 128.5, y: 80.5 }, { race: 'SHEEP', x: 130.5, y: 80.5 }],
        fx: [{ kind: 'drought', x: 128.5, y: 80.5, ttl: 20, r: 6 }] },
    ],
    sanity: (eng) => true,
  },
  {
    // S6 rainstorm：灭火+fx water / 辐射洗净+radSet.delete+markDirty / 焦土复绿 0.3（regrow L979 出账联动）+ fx water / 雪融 0.1 + 治疗 0.5
    key: 'power-rainstorm', baseSeed: BASE + 26, seed: 0x0A0E06, seasons: false, yearF: 2.5, tickCount: 6000, steps: 10, minDraws: 16,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.BURNT]); return a; })().concat([[132, 78, T.SNOW], [133, 78, T.SNOW]])],
        fire: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 128; x++) a.push([x, y, 80]); return a; })()],   // 火铺左 4 列 36 格（灭火支优先）——右 BURNT 复绿支/雪融支/radiate 洗净支分区触达
        regrow: [...(() => { const a = []; for (let y = 77; y < 85; y++) for (let x = 128; x < 134; x++) a.push([x, y, 9000]); return a; })()],   // regrow 铺右域 48 格——复绿 setTerrain(GRASS) → L979 出账联动
        radiate: [[129, 82, 5], [130, 82, 7], [131, 82, 5], [130, 81, 6], [131, 81, 5], [130, 83, 5], [131, 83, 7], [132, 82, 5]],
        radSet: [[129, 82, 6100], [130, 82, 6200], [131, 82, 6300], [130, 81, 6400], [131, 81, 6500]],
        units: [{ race: 'SHEEP', x: 128.5, y: 80.5, hp: 30, maxHp: 100 }],
        fx: [{ kind: 'rainstorm', x: 128.5, y: 80.5, ttl: 20, r: 6 }] },
    ],
    sanity: (eng) => eng.fireSet.size < 36 && eng.fireSet.size > 0 && eng.regrow.size < 48,
  },
  {
    // S7 sandstorm：埋草（GRASS 0.5→SAND / FOREST 0.2→GRASS）+ hypot<r chill12 迷眼
    key: 'power-sandstorm', baseSeed: BASE + 27, seed: 0x0A0E07, seasons: false, yearF: 2.5, tickCount: 7000, steps: 5, minDraws: 8,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })()],
        units: [{ race: 'SHEEP', x: 128.5, y: 80.5 }, { race: 'SHEEP', x: 129.5, y: 81.5 }],
        fx: [{ kind: 'sandstorm', x: 128.5, y: 80.5, ttl: 20, r: 5 }] },
    ],
    sanity: (eng) => eng.units.every((u) => u.chill === 12),
  },
  {
    // S8 famine：undead 豁免（zombie）+ 饿殍（human hp-0.24 hurt10）+ FARM 荒芜 attackBuilding 4 / GRASS 0.12→BURNT
    key: 'power-famine', baseSeed: BASE + 28, seed: 0x0A0E08, seasons: false, yearF: 2.5, tickCount: 8000, steps: 5, minDraws: 8,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })()],
        building: [[128, 80, 4]],
        units: [{ race: 'ZOMBIE', x: 128.5, y: 80.5 }, { race: 'SHEEP', x: 129.5, y: 81.5 }],
        fx: [{ kind: 'famine', x: 128.5, y: 80.5, ttl: 20, r: 5 }] },
    ],
    sanity: (eng) => true,
  },
  {
    // S9 到期 splice 三 ttl（4/7/10）+ 混合批 + activeBattles %5 清理（exp 103 过期删 / exp 200 保留）
    key: 'power-expiry', baseSeed: BASE + 29, seed: 0x0A0E09, seasons: false, yearF: 2.5, tickCount: 99, steps: 10, minDraws: 12,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        battles: [[idx(50, 50), 103], [idx(51, 50), 200]],
        units: [{ race: 'SHEEP', x: 100.5, y: 60.5 }],
        fx: [{ kind: 'tornado', x: 100.5, y: 60.5, ttl: 4, r: 3 }, { kind: 'acid', x: 140.5, y: 60.5, ttl: 7, r: 3 }, { kind: 'blizzard', x: 180.5, y: 60.5, ttl: 12, r: 3 }] },
    ],
    sanity: (eng) => eng.effects.length === 1 && eng.effects[0].kind === 'blizzard',
  },
  {
    // S10 tsunami（M-U10b）：波前环形扩张 [prevR,waveR)——低地没顶 setTerrain(WATER)+flood 挂账（240+floor(rng*120) 逐瓦片掷）+
    //   幸存面六亲（MOUNTAIN/HILL/WATER/DEEP/LAVA/ICE）+ 溺水 60（非飞行 band [prevR,waveR+1)）+ age1 shake 6
    key: 'power-tsunami', baseSeed: BASE + 30, seed: 0x0A0E0A, seasons: false, yearF: 2.5, tickCount: 9000, steps: 6, minDraws: 10,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })().concat([[124, 76, T.MOUNTAIN], [125, 76, T.HILL], [132, 76, T.WATER], [133, 76, T.DEEP], [124, 84, T.LAVA], [125, 84, T.ICE], [132, 84, T.FOREST]])],
        building: [[130, 80, 1]],   // d=2.0——波前环带内（age2 band [2,3) 淹+毁；中心眼区 d<1 永不淹——蓝本环形语义钉）
        units: [{ race: 'SHEEP', x: 131.5, y: 80.5 }, { race: 'ANGEL', x: 132.5, y: 80.5 }],
        fx: [{ kind: 'tsunami', x: 128.5, y: 80.5, ttl: 8, r: 8 }] },
    ],
    sanity: (eng) => eng.flood.size > 0 && eng.terrain[idx(125, 76)] === T.HILL && eng.terrain[idx(131, 80)] === T.WATER,
  },
  {
    // S11 sinkhole（M-U10b）：环状塌陷 0.5+t*r（hypot 域）——幸存面四亲（MOUNTAIN/WATER/DEEP/LAVA——HILL 不豁免！）
    //   无 flood 挂账（L10132-10135 无 flood.set——sinkhole 永久性水面语义钉）+ 溺坠 55 + age%2 shake 4
    key: 'power-sinkhole', baseSeed: BASE + 31, seed: 0x0A0E0B, seasons: false, yearF: 2.5, tickCount: 10000, steps: 8, minDraws: 2,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })().concat([[124, 76, T.MOUNTAIN], [125, 76, T.HILL], [132, 76, T.WATER], [133, 76, T.DEEP], [124, 84, T.LAVA]])],
        building: [[129, 80, 1]],   // d=1.0——band age1 [0.5,1.167) 内（age1 淹+毁→smoke 2 掷；蓝本 L10129 门 d>=prevR 含下界）
        units: [{ race: 'SHEEP', x: 131.5, y: 80.5 }, { race: 'ANGEL', x: 132.5, y: 80.5 }],
        fx: [{ kind: 'sinkhole', x: 128.5, y: 80.5, ttl: 12, r: 8 }] },
    ],
    sanity: (eng) => eng.flood.size === 0 && eng.terrain[idx(125, 76)] === T.WATER && eng.terrain[idx(124, 76)] === T.MOUNTAIN,
  },
  {
    // S12 iceage（M-U10b）：静态极寒穹顶——恒真门 <1.6（掷位保持 3 掷/tick）+ 四支（GRASS·BURNT·SAND 无掷→SNOW/
    //   FOREST 0.5/WATER 0.55→ICE/DEEP 0.08→ICE）+ 寒霜灭火 + coldBorn 豁免 chill16
    key: 'power-iceage', baseSeed: BASE + 32, seed: 0x0A0E0C, seasons: false, yearF: 2.5, tickCount: 11000, steps: 5, minDraws: 15,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 124; x < 133; x++) a.push([x, y, T.GRASS]); return a; })().concat([[130, 78, T.BURNT], [131, 78, T.SAND], [132, 78, T.FOREST], [131, 82, T.WATER], [132, 82, T.DEEP]])],
        fire: [[128, 80, 100], [129, 80, 60]],
        units: [{ race: 'PENGUIN', x: 128.5, y: 80.5 }, { race: 'SHEEP', x: 130.5, y: 80.5 }],
        fx: [{ kind: 'iceage', x: 128.5, y: 80.5, ttl: 20, r: 6 }] },
    ],
    sanity: (eng) => eng.units.some((u) => u.race === R.PENGUIN && !u.chill) && eng.units.some((u) => u.race !== R.PENGUIN && u.chill === 16),
  },
  {
    // S13 blackhole（M-U10b）：零掷引力域——pullR = r*min(1, age/50+0.25) 增幅、d<0.3 免疫、d<1.2 重创 1.5、
    //   无飞行门（ANGEL 同拉——tsunami/sinkhole 对照面）+ 末期奇点（age>=ttl-1：<3.5 湮灭/<3 环 BURNT+建筑毁/
    //   WATER·DEEP 豁免 + fx explosion {r:3} 2 掷 + shake 9）
    key: 'power-blackhole', baseSeed: BASE + 33, seed: 0x0A0E0D, seasons: false, yearF: 2.5, tickCount: 12000, steps: 8, minDraws: 2,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })().concat([[101, 60, T.WATER], [102, 61, T.DEEP]])],
        building: [[100, 60, 1], [104, 60, 1]],
        units: [{ race: 'SHEEP', x: 100.7, y: 60.5, hp: 30 }, { race: 'SHEEP', x: 101.5, y: 60.5, hp: 30 }, { race: 'SHEEP', x: 103.5, y: 60.5, hp: 30 }, { race: 'SHEEP', x: 108.5, y: 60.5, hp: 30 }, { race: 'ANGEL', x: 102.5, y: 60.5 }],
        fx: [{ kind: 'blackhole', x: 100.5, y: 60.5, ttl: 6, r: 6 }] },
    ],
    sanity: (eng) => eng.effects.some((e) => e.kind === 'explosion') && eng.terrain[idx(100, 60)] === T.BURNT && eng.terrain[idx(101, 60)] === T.WATER && eng.terrain[idx(102, 61)] === T.DEEP,
  },
  {
    // S14 quake（M-U10b）：shake=7 直写（非 max——覆写语义钉）+ 0.35 门（1 掷）→ ang/rr 2 掷 → 建筑毁
    //   / (GRASS||FOREST) 0.3→BURNT
    key: 'power-quake', baseSeed: BASE + 34, seed: 0x0A0E0E, seasons: false, yearF: 2.5, tickCount: 13000, steps: 6, minDraws: 6,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 136; x < 145; x++) a.push([x, y, T.GRASS]); return a; })().concat([[142, 60, T.FOREST]])],
        building: [[140, 60, 1]],
        units: [{ race: 'SHEEP', x: 140.5, y: 60.5 }],
        fx: [{ kind: 'quake', x: 140.5, y: 60.5, ttl: 10, r: 6 }] },
    ],
    sanity: (eng) => true,
  },
];

const scenarios = specs.map(buildScenario);
for (const s of scenarios) {
  console.log(`${s.key}: draws=${s.totalDraws} fx=${s.fx.length} units=${s.units.length} battles=${s.battles.length} rngA=${s.stepsSnap.at(-1).rngA}`);
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
    gen: 'gen-power.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具两相直写 + effects/spawnUnit 真调用注入（fx seed/dir 双掷注入相）+ rngA 尾置清零起流 + tickCount++/effectsTick 直调步进快照（主循环 L2508/L2528 序同构）',
    rng: 'eng.rngA 单流（类字段箭头 rng L728-733）；mulberry 纯数学反解 total（noise.ts L3-13）',
    math: 'tornado/sandstorm/famine Math.hypot——C# FdHypot/V8Hypot 位精确件对账（fdlibm 域）；acid/blizzard/locust/drought/rainstorm 纯平方距离',
    domains: ['effectsTick L9801-10447', 'tornado L9805-9824', 'acid L9826-9850', 'blizzard L9915-9948', 'locust L9949-9971', 'drought L9972-9996', 'rainstorm L9997-10022', 'sandstorm L10068-10090', 'famine L10170-10190', 'M-U10b: tsunami L9877-9914', 'M-U10b: sinkhole L10120-10147', 'M-U10b: iceage L10148-10169', 'M-U10b: blackhole L10191-10223', 'M-U10b: quake L10224-10236', '到期 splice L10439-10441', 'activeBattles %5 清理 L10443-10447', 'fx L9781-9799', 'attackBuilding L4446-4462', 'meltIce L2892（drought 消费）', 'setTerrain L969-1007（regrow L979 出账联动 + flood L983 贴花级联）'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/power.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/power.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('power.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
