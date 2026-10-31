// ============================================================================
// gen-power.mjs —— M-U10a「effectsTick 游荡云族八种」+ M-U10b「波前族+静态族五 kind」
//   + M-U10c「命中族三 kind + explode 消费面」+ M-U10d「shell/missile/核弹」
//   + M-U10e「war 面 airstrike/drone/mech」+ M-U10f「laser 光束线杀伤」+ M-U10g「orbital 轨道天罚」黄金向量
// （tornado L9805-9824 / acid L9826-9850 / blizzard L9915-9948 / locust L9949-9971 /
//   drought L9972-9996 / rainstorm L9997-10022 / sandstorm L10068-10090 / famine L10170-10190
//   + M-U10b: tsunami L9877-9914 / sinkhole L10120-10147 / iceage L10148-10169 /
//   blackhole L10191-10223 / quake L10224-10236
//   + M-U10c: meteor L10237-10239 / fireball L10240-10254 / arrow·bullet L10255-10294 /
//   explode L10450-10499（terrain/nuke 全译，夹具 terrain 支触达）+ ignite L1072-1077
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
//   ⑦ M-U10c 命中族：arrow/bullet 桶扫描（3×3 环带）依赖 buckets——注入相尾 eng.rebuildBuckets()
//     （纯函数零掷）→ 黄金步进期内桶态冻结（effectsTick 不重建——主循环 L2519 序镜像）；
//     gearBonus 装备面：engine 真 gearBonus(u).armor 于快照相采样入 units0.gbArmor（链甲 armor=8
//     → final=dmg*0.92 位精确钉），C# 镜像侧 GearBonusHook 桩回放同值；rel0 外交挂账通道
//     （eng.rel.set pairKey）+ atWar <-20 门；孤儿建筑格通道 orphanBuilding（building[i]>0 而无
//     buildings/bIdx 记录——L10289 bIdx.get ?? -1 → buildings[-1]=undefined 镜像钉）。
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
const { T, R, RACES } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
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
  const orphanB = [];
  for (const p of spec.patches) {
    if (p.terrain) for (const [x, y, t] of p.terrain) terrainW.push([x, y, t]);
    if (p.fire) for (const [x, y, v] of p.fire) fireW.push([x, y, v]);
    if (p.building) for (const [x, y, kind, civ] of p.building) buildingW.push([x, y, kind, civ ?? -1]);
    if (p.orphanBuilding) for (const [x, y, kind] of p.orphanBuilding) orphanB.push([idx(x, y), kind]);
    if (p.regrow) for (const [x, y, at] of p.regrow) regrowS.push([x, y, at]);
    if (p.frozen) for (const [x, y] of p.frozen) frozenA.push([x, y]);
    if (p.radiate) for (const [x, y, v] of p.radiate) radiateW.push([x, y, v]);
    if (p.radSet) for (const [x, y, at] of p.radSet) radSetW.push([x, y, at]);
    if (p.battles) for (const [tile, exp] of p.battles) battlesW.push([tile, exp]);
    if (p.rel) for (const [k, v] of p.rel) eng.rel.set(k, v);   // M-U10c 外交挂账（pairKey 字符串键——engine L34）
  }
  for (const [i, kind] of orphanB) eng.building[i] = kind;       // 孤儿建筑格（building>0 而无 buildings/bIdx 记录——L10289 undefined 镜像钉）
  for (const [x, y, t] of terrainW) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of fireW) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  for (const [x, y, kind, civ] of buildingW) {
    eng.building[idx(x, y)] = kind;
    eng.buildings.push({ i: idx(x, y), x, y, kind, civ });
    eng.bIdx.set(idx(x, y), eng.buildings.length - 1);
  }
  for (const [x, y, at] of regrowS) eng.regrow.set(idx(x, y), at);
  for (const [x, y] of frozenA) eng.frozen.add(idx(x, y));
  for (const [x, y, v] of radiateW) eng.radiate[idx(x, y)] = v;
  for (const [x, y, at] of radSetW) eng.radSet.set(idx(x, y), at);
  for (const [tile, exp] of battlesW) eng.activeBattles.set(tile, exp);

  // 手术二·单位真调用注入（spawnUnit 掷消耗 baseSeed 流——黄金掷链尾置清零后纯净起流）
  //   M-U10c：civ 直传 spawnUnit opts（友军豁免面）+ gear.arm 装备直写（gearBonus armor 采样入快照）
  for (const up of spec.patches) {
    if (!up.units) continue;
    for (const u of up.units) {
      const spawned = eng.spawnUnit(R[u.race], u.x, u.y, { silent: true, civ: u.civ });
      if (u.hp !== undefined) spawned.hp = u.hp;
      if (u.maxHp !== undefined) spawned.maxHp = u.maxHp;
      if (u.hurt !== undefined) spawned.hurt = u.hurt;
      if (u.dead !== undefined) spawned.dead = u.dead;       // M-U10f 死亡直写（laser 循环头 dead 跳过面——L10335 消费）
      if (u.gear && u.gear.arm) spawned.arm = u.gear.arm;   // 装备槽直写（gearBonus 快路径破——七槽非空）
    }
  }

  // 手术二·effects 真调用注入（fx seed/dir 双掷同上注入相；M-U10c src/dmg/quiet 传参按在位键展开——
  //   engine fx opts Partial<Effect> spread 语义：undefined 键不覆盖）
  for (const p of spec.patches) {
    if (!p.fx) continue;
    for (const f of p.fx) {
      const opts = {};
      if (f.r !== undefined) opts.r = f.r;
      if (f.src !== undefined) opts.src = f.src;
      if (f.dmg !== undefined) opts.dmg = f.dmg;
      if (f.quiet !== undefined) opts.quiet = f.quiet;
      if (f.wid !== undefined) opts.wid = f.wid;     // M-U10d 涌现武器 id（killCredit 归属面）
      if (f.nuke !== undefined) opts.nuke = f.nuke;  // M-U10d 核弹头当量（missile 核支门）
      if (f.fire !== undefined) opts.fire = f.fire;  // M-U10d 弹体纵火（shell !!e.fire 门）
      if (f.x0 !== undefined) opts.x0 = f.x0;        // M-U10e 航线起点（airstrike/drone/mech 插值面——fx() 默认 x0=x 可被 opts 覆盖 L9797）
      if (f.y0 !== undefined) opts.y0 = f.y0;
      eng.fx(f.kind, f.x, f.y, f.ttl, opts);
      if (f.preAge !== undefined) eng.effects[eng.effects.length - 1].age = f.preAge;   // M-U10e 手术覆写 age（周期门首掷对位——fx() age:0 默认后直写，同 spawnUnit hp 覆写先例）
    }
  }

  // 手术二·civs 直写注入（M-U10d：raze 级联 alive/name/colorHex 最小语义面——战争结算域消费；
  //   文明创建无单点真调用 API（foundNation 重域），orphanBuilding 同款直写先例）
  for (const c of spec.civs ?? []) {
    eng.civs[c.id] = { id: c.id, name: c.name, alive: true, colorHex: c.colorHex, tiles: [], color: [0, 0, 0], pop: 0 };
  }

  // 手术二尾：桶重建（arrow/bullet 扫描面——主循环 L2519 rebuildBuckets 同构；纯函数零掷）
  eng.rebuildBuckets();

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
    building0: buildingW.map(([x, y, kind, civ]) => ({ i: idx(x, y), x, y, kind, civ })),
    orphanB0: orphanB,                    // M-U10c 孤儿建筑格（building>0 无记录——L10289 镜像钉）
    civs0: (spec.civs ?? []).map((c) => ({ id: c.id, name: c.name, colorHex: c.colorHex })),   // M-U10d raze 级联 alive/name/colorHex 最小语义面
    rel0: [...eng.rel.entries()],         // M-U10c 外交挂账（pairKey 字符串键 → atWar <-20 门）
    battles0: [...eng.activeBattles.entries()],
    fx0: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), r: e.r, age: e.age, ttl: e.ttl, seed: e.seed, dir: f64hex(e.dir), src: e.src ?? null, dmg: e.dmg ?? null, quiet: e.quiet === true, wid: e.wid ?? null, nuke: e.nuke ?? null, fire: e.fire ?? null, ...(e.x0 !== e.x || e.y0 !== e.y ? { x0: f64hex(e.x0), y0: f64hex(e.y0) } : {}) })),   // M-U10d wid/nuke/fire 通道（?? 语义：0 值保真）+ M-U10e 稀疏 x0/y0（航线 divergent 时才出键——旧 21 场景 fx0 字节不变）
    units0: eng.units.map((u) => ({ id: u.id, race: u.race, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), hurt: u.hurt, chill: u.chill, dead: u.dead, civ: u.civ, gbArmor: RACES[u.race].isCiv ? eng.gearBonus(u).armor : 0 })),
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
  if (spec.sanity && !spec.sanity(eng)) {
    const dbg = { units: eng.units.map((u) => ({ hp: u.hp, dead: u.dead })), bHp: [...eng.bHp.entries()], damaged: [...eng.damagedSet], fireSet: eng.fireSet.size, shake: eng.shake, buildings: eng.buildings.length, fx: eng.effects.map((e) => e.kind), events: eng.worldEvents.map((e) => e.kind), statN: eng.statNukes, kc: eng.killCredit, radSet: eng.radSet.size, terr: [eng.terrain[idx(104, 60)], eng.terrain[idx(97, 60)], eng.terrain[idx(100, 60)]] };
    throw new Error(`S${spec.key}: sanity 未过 ${JSON.stringify(dbg)}`);
  }

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
    kc: eng.killCredit ?? null,                      // M-U10d killCredit 终态钉（shell/missile wid 面复位语义 L10297/L10300）
    statN: eng.statNukes,                            // M-U10d statNukes 终态钉（Nuke L12256 成就计数）
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
  {
    // S15 meteor（M-U10c）：age>=ttl → explode(4.2,{terrain:true})——BURNT 环（MOUNTAIN 幸存/WATER isLand 门
    //   整格跳过含 ignite 门掷）+ ignite 门掷 d>r*0.55（<0.3 短路）+ 单位 300*max(0.15,1-d/5) + shake max 8
    //   + fx explosion {r:4.2} + smoke ×6（各 2 掷）+ 非quiet 入纪事（quiet 弹抑事件——双弹对照钉）
    key: 'power-meteor', baseSeed: BASE + 35, seed: 0x0A0E0F, seasons: false, yearF: 2.5, tickCount: 14000, steps: 6, minDraws: 30,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })().concat([[98, 58, T.MOUNTAIN], [102, 58, T.WATER]])],
        units: [{ race: 'SHEEP', x: 100.5, y: 60.5, hp: 500, maxHp: 500 }, { race: 'SHEEP', x: 106.5, y: 60.5, hp: 500, maxHp: 500 }],
        fx: [{ kind: 'meteor', x: 100.5, y: 60.5, ttl: 3 }, { kind: 'meteor', x: 150.5, y: 80.5, ttl: 3, quiet: true }] },
    ],
    sanity: (eng) => eng.worldEvents.length === 1 && eng.worldEvents[0].kind === 'meteor'
      && eng.terrain[idx(98, 58)] === T.MOUNTAIN && eng.terrain[idx(102, 58)] === T.WATER
      && eng.shake === 8 && eng.effects.length === 14 && eng.effects.every((e) => e.kind === 'explosion' || e.kind === 'smoke')
      && eng.units[0].hp > 150 && eng.units[0].hp < 250 && eng.units[1].hp === 500,
  },
  {
    // S16 fireball（M-U10c）：age>=ttl → 溅射（MAGE 豁免 / hp-=e.r〔r=伤害位面——真法师火球 dmg 18〕/
    //   dead）+ fx explosion {r:0.9} + ignite 建筑门（building[fi]>0 不烧——战争不纵火）与空地正面支（fireSet 入账）
    key: 'power-fireball', baseSeed: BASE + 36, seed: 0x0A0E10, seasons: false, yearF: 2.5, tickCount: 15000, steps: 4, minDraws: 5,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        building: [[102, 60, 1]],
        units: [{ race: 'SHEEP', x: 102.5, y: 60.5, hp: 50 }, { race: 'SHEEP', x: 103.0, y: 60.5, hp: 3 }, { race: 'MAGE', x: 102.5, y: 61.0, hp: 50 }],
        fx: [{ kind: 'fireball', x: 102.5, y: 60.5, ttl: 2, r: 18 }, { kind: 'fireball', x: 98.5, y: 58.5, ttl: 2, r: 18 }] },
    ],
    sanity: (eng) => eng.units[0].hp === 32 && eng.units[1].dead === true && eng.units[2].hp === 50
      && eng.fireSet.has(idx(98, 58)) && eng.fireSet.size === 1 && eng.worldEvents.length === 0
      && eng.effects.length === 2 && eng.effects.every((e) => e.kind === 'explosion'),
  },
  {
    // S17 arrow·bullet（M-U10c）：桶扫描 3×3 最近命中（<1.1）——友军豁免（civ===src）/ gearBonus armor 减伤
    //   （链甲 8 → final=dmg*0.92 位精确）/ 非 civ 免 gearBonus / dmgNumbers 双支（<10 掷 0.3 vs >=10 短路无掷）
    //   / kill→wwCountKill（killCredit 恒 null + worldWar idle 直跳）/ 建筑支三分（自军免 b.civ===src /
    //   atWar rel=-30 打 attackBuilding dmg*0.8 hp>0 支 bHp.set+damagedSet+fx hit / 无建筑落空零掷）
    key: 'power-arrow', baseSeed: BASE + 37, seed: 0x0A0E11, seasons: false, yearF: 2.5, tickCount: 16000, steps: 3, minDraws: 8,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 76; y < 85; y++) for (let x = 196; x < 212; x++) a.push([x, y, T.GRASS]); return a; })()],
        building: [[206, 80, 4, 1], [208, 80, 4, 2]],
        rel: [['1-2', -30]],
        units: [{ race: 'HUMAN', x: 200.5, y: 80.5, hp: 50, maxHp: 50, civ: 1 }, { race: 'HUMAN', x: 200.9, y: 80.5, hp: 50, maxHp: 50, civ: 2, gear: { arm: 'chain_mail' } }, { race: 'SHEEP', x: 204.0, y: 80.0, hp: 5, maxHp: 50 }],
        fx: [{ kind: 'arrow', x: 200.5, y: 80.5, ttl: 1, src: 1, dmg: 6 }, { kind: 'arrow', x: 204.0, y: 80.0, ttl: 1, dmg: 12 }, { kind: 'bullet', x: 206.0, y: 80.0, ttl: 1, src: 2, dmg: 9 }, { kind: 'bullet', x: 208.0, y: 80.0, ttl: 1, src: 2, dmg: 6 }] },
    ],
    sanity: (eng) => eng.units[0].hp === 50 && eng.units[2].dead === true && eng.bHp.size === 1
      && eng.damagedSet.has(idx(206, 80)) && !eng.damagedSet.has(idx(208, 80)) && eng.buildings.length === 2,
  },
  {
    // S18 bullet 支路余面（M-U10c）：孤儿建筑格（building>0 无 bIdx 记录——buildings[-1]=undefined 镜像钉）
    //   + 非战 rel（10 → atWar false 不打——bHp/damagedSet 零写面）+ 混批到期 splice（ttl=2 step2 出账）
    key: 'power-bullet-misc', baseSeed: BASE + 38, seed: 0x0A0E12, seasons: false, yearF: 2.5, tickCount: 17000, steps: 4, minDraws: 2,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        building: [[102, 60, 4, 2]],
        orphanBuilding: [[100, 60, 1]],
        rel: [['1-2', 10]],
        units: [{ race: 'SHEEP', x: 110.5, y: 60.5, hp: 50, maxHp: 50 }],
        fx: [{ kind: 'bullet', x: 100.5, y: 60.5, ttl: 1, src: 3, dmg: 8 }, { kind: 'bullet', x: 102.5, y: 60.5, ttl: 1, src: 1, dmg: 8 }, { kind: 'arrow', x: 130.5, y: 60.5, ttl: 2, src: 1, dmg: 6 }, { kind: 'fireball', x: 98.5, y: 56.5, ttl: 1, r: 18 }] },
    ],
    sanity: (eng) => eng.bHp.size === 0 && eng.damagedSet.size === 0 && eng.buildings.length === 1 && eng.effects.length === 1
      && eng.fireSet.has(idx(98, 56)) && eng.effects[0].kind === 'explosion',
  },
  {
    // S19 shell（M-U10d）：shellBurst L9595-9620 全链——单位环 dmg*max(0.25,1-d/(r+0.4))（无 src 豁免——
    //   己方步兵同溅射钉）+ kill→wwCountKill（killCredit 恒 null）/ 建筑环 attackBuilding dmg*0.9（无友军门——
    //   己方住宅同账钉）+ fire:1 ignite 门掷（MOUNTAIN/WATER 短路无掷）+ fx explosion {r} + shake min(5,1+r)
    //   + 空 area 弹（fire:0 零掷——纯 fx+shake 面）
    key: 'power-shell', baseSeed: BASE + 39, seed: 0x0A0E13, seasons: false, yearF: 2.5, tickCount: 18000, steps: 3, minDraws: 8,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })().concat([[100, 59, T.MOUNTAIN], [101, 59, T.WATER]])],
        building: [[100, 60, 1, 2], [101, 60, 1, 1]],
        rel: [['1-2', -30]],
        units: [{ race: 'SHEEP', x: 100.5, y: 60.5, hp: 25, maxHp: 50 }, { race: 'HUMAN', x: 101.5, y: 60.5, hp: 50, maxHp: 50, civ: 1 }, { race: 'SHEEP', x: 110.5, y: 60.5, hp: 50, maxHp: 50 }],
        fx: [{ kind: 'shell', x: 100.5, y: 60.5, ttl: 1, src: 1, dmg: 30, r: 1.6, fire: 1 }, { kind: 'shell', x: 150.5, y: 80.5, ttl: 1, dmg: 30, fire: 0 }],
      },
    ],
    sanity: (eng) => eng.units[0].dead === true && eng.units[1].hp === 35 && eng.units[2].hp === 50
      && eng.bHp.size === 2 && eng.damagedSet.has(idx(100, 60)) && eng.damagedSet.has(idx(101, 60))
      && eng.fireSet.size > 0 && eng.shake === 2.6 && eng.buildings.length === 2 && eng.effects.length === 4,
  },
  {
    // S20 missile 常规弹 + raze 级联（M-U10d）：r||2.8/dmg??60/fire 恒 true → shellBurst →
    //   attackBuilding dmg*0.9=54 > FARM 40 → onBuildingDestroyed 战争结算面（civs0 最小语义注入）：
    //   alive 门 + atWar(rel -30) + CAPTURABLE 0.45 门（raze 支——addWarScore warData 空表早退 +
    //   lastSiegeEventTick 节流 siege 纪事）+ shell r:0→||1.6 / dmg 缺→??30 / src 缺→-1 / fire 缺→falsy 无掷
    //   + killCredit wid 面（铸域空表桩——L9399 早退）+ statNukes 零写钉
    key: 'power-missile', baseSeed: BASE + 40, seed: 0x0A0E16, seasons: false, yearF: 2.5, tickCount: 19000, steps: 3, minDraws: 6,
    civs: [{ id: 1, name: '青禾部落', colorHex: '#40a060' }, { id: 2, name: '熔铁部族', colorHex: '#c04040' }],
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        building: [[100, 60, 4, 1]],
        rel: [['1-2', -30]],
        units: [{ race: 'SHEEP', x: 98.5, y: 58.5, hp: 50, maxHp: 50 }, { race: 'HUMAN', x: 100.5, y: 60.5, hp: 50, maxHp: 50, civ: 1 }],
        fx: [
          { kind: 'missile', x: 100.5, y: 60.5, ttl: 1, src: 2, r: 2.8, dmg: 60 },
          { kind: 'shell', x: 104.5, y: 64.5, ttl: 1, r: 1.2, dmg: 12, fire: 1 },
          { kind: 'shell', x: 96.5, y: 56.5, ttl: 1, r: 0 },
          { kind: 'shell', x: 130.5, y: 70.5, ttl: 1, wid: 7 },
        ],
      },
    ],
    sanity: (eng) => eng.buildings.length === 0 && eng.bHp.size === 0 && eng.damagedSet.size === 0
      && eng.worldEvents.length === 1 && eng.worldEvents[0].kind === 'siege'
      && eng.units[1].dead === true && eng.units[0].hp === 35   // 60×0.25 钉制支（d=2.828≥2.4 → falloff 钳 0.25）
      && eng.shake === 3.8 && eng.statNukes === 0 && eng.killCredit === null,
  },
  {
    // S21 missile 核弹头（M-U10d）：nuke>0 → addEvent nuke（战场升起）+ Nuke L12255-12260（statNukes++ +
    //   r=max(3,min(24,7p))=7）→ explode {terrain,lava,nuke}（LAVA 内环 d<1.8 角距 / MOUNTAIN 幸存 /
    //   WATER isLand 整格跳 / 单位环 300*max(0.15,1-d/(r+0.8)) 无 dead 跳 + shake 14 + flash/mushroom
    //   + 第二条 nuke 纪事（unshift 序）+ radSet 11×11 <5 辐射圈 + statNukes 终态钉）
    key: 'power-nukemissile', baseSeed: BASE + 41, seed: 0x0A0E15, seasons: false, yearF: 2.5, tickCount: 20000, steps: 3, minDraws: 30,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 53; y < 68; y++) for (let x = 93; x < 108; x++) a.push([x, y, T.GRASS]); return a; })().concat([[104, 60, T.MOUNTAIN], [97, 60, T.WATER]])],
        units: [{ race: 'SHEEP', x: 100.5, y: 60.5, hp: 250, maxHp: 500 }, { race: 'SHEEP', x: 107.5, y: 60.5, hp: 500, maxHp: 500 }, { race: 'SHEEP', x: 110.5, y: 60.5, hp: 500, maxHp: 500 }],
        fx: [{ kind: 'missile', x: 100.5, y: 60.5, ttl: 1, src: 1, r: 0, dmg: 0, nuke: 1 }],
      },
    ],
    sanity: (eng) => eng.statNukes === 1 && eng.worldEvents.length === 2 && eng.worldEvents[0].kind === 'nuke' && eng.worldEvents[1].kind === 'nuke'
      && eng.terrain[idx(104, 60)] === T.MOUNTAIN && eng.terrain[idx(97, 60)] === T.WATER && eng.terrain[idx(100, 60)] === T.LAVA
      && eng.shake === 14 && eng.radSet.size > 70 && eng.units[0].dead === true && eng.units[1].hp === 455   // 300×0.15 钳制支（d=7.0 → falloff 钳 0.15）
      && eng.units[2].hp === 500 && eng.killCredit === null,
  },
  {
    // S22 airstrike（M-U10e）：沿航线插值周期投弹（age>6 && age%16===0 && at<0.92 → shellBurst(ax,ay,1.2,22,rng<0.4,src??-1)——
    //   fire 实参掷门过方掷）+ 终点收尾爆破（age>=ttl → shellBurst(e.x,e.y,r||1.8,dmg??30,true)）+ 无 killCredit 写面
    //   （蓝本异形——airstrike 直呼 shellBurst 不挂 wid，与 drone 对位）+ preAge 15 → S1 age16 周期（at=16/18=0.889<0.92，
    //   插值点 ax=96.5+4*(16/18) 非整浮点位级钉）/ S2 age17 空转零掷 / S3 age18 终点+splice；x0/y0 fx0 稀疏通道首钉
    key: 'power-airstrike', baseSeed: BASE + 42, seed: 0x0A0E17, seasons: false, yearF: 2.5, tickCount: 21000, steps: 3, minDraws: 10,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        units: [{ race: 'SHEEP', x: 100.5, y: 60.5, hp: 50, maxHp: 50, civ: 2 }, { race: 'SHEEP', x: 130.5, y: 80.5, hp: 50, maxHp: 50 }],
        fx: [{ kind: 'airstrike', x: 100.5, y: 60.5, ttl: 18, x0: 96.5, y0: 56.5, src: 1, dmg: 30, r: 1.4, preAge: 15 }],
      },
    ],
    sanity: (eng) => eng.effects.length === 2 && eng.effects.every((e) => e.kind === 'explosion') && eng.shake === 2.4
      && eng.buildings.length === 0 && eng.units[0].hp > 5 && eng.units[0].hp < 40 && eng.units[1].hp === 50,
  },
  {
    // S23 drone（M-U10e）：killCredit wid 写面（周期+终点 set/reset 往返——L10358-10360/L10363-10366）+ 周期游猎
    //   （age>8 && age%12===0 && dt<0.92 → shellBurst(dxp,dyp,1.0,dmg??14,false)——fire 恒 false 零 ignite 掷）+ 终点集束
    //   （r||2.6 / (dmg??14)*2.6 / fire true——f64 乘法 36.4 位级）+ emergentPayload wid 门（铸域空表桩早退）+ preAge 11
    //   → S1 age12 周期（dt=12/14=0.857，dxp=99.92857… 非整浮点）/ S3 age14 终点+splice；建筑受损不摧毁（零级联）
    key: 'power-drone', baseSeed: BASE + 43, seed: 0x0A0E18, seasons: false, yearF: 2.5, tickCount: 22000, steps: 3, minDraws: 15,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        building: [[102, 60, 4, 2]],
        units: [{ race: 'SHEEP', x: 100.0, y: 60.0, hp: 12, maxHp: 50 }, { race: 'SHEEP', x: 110.5, y: 60.5, hp: 50, maxHp: 50 }],
        fx: [{ kind: 'drone', x: 100.5, y: 60.5, ttl: 14, x0: 96.5, y0: 56.5, src: 1, dmg: 14, r: 2.6, wid: 7, preAge: 11 }],
      },
    ],
    sanity: (eng) => eng.units[0].dead === true && eng.units[1].hp === 50 && eng.killCredit === null
      && eng.bHp.size === 1 && eng.damagedSet.has(idx(102, 60)) && eng.effects.every((e) => e.kind === 'explosion' || e.kind === 'hit'),
  },
  {
    // S24 mech（M-U10e）：地面推进机炮扫射（age>6 && age%12===0 && mt<0.9 → 单位环 hypot<2.4 逐位掷 14+rng*8
    //   + src 豁免前置短路〔civ 相同零掷零伤〕+ fx bullet 曳光面 {x0:mx,y0:my,src,r:0,dmg:0}——坐标 2 掷 + seed/dir 2 掷）
    //   + 终点爆破（r||2.2 / dmg??45 / fire false 零 ignite——shellBurst 无 src 豁免己军同账）+ preAge 11 → S1 age12 周期
    //   （mt=12/14=0.857，mx=99.92857…）/ S3 age14 终点+splice；S1 步 fx bullet 存活至终态（ttl5>2 余步）
    key: 'power-mech', baseSeed: BASE + 44, seed: 0x0A0E19, seasons: false, yearF: 2.5, tickCount: 23000, steps: 3, minDraws: 5,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        units: [{ race: 'HUMAN', x: 100.0, y: 60.0, hp: 50, maxHp: 50, civ: 1 }, { race: 'SHEEP', x: 100.5, y: 60.5, hp: 50, maxHp: 50 }, { race: 'SHEEP', x: 105.5, y: 70.5, hp: 50, maxHp: 50 }],
        fx: [{ kind: 'mech', x: 100.5, y: 60.5, ttl: 14, x0: 96.5, y0: 56.5, src: 1, dmg: 45, r: 2.2, preAge: 11 }],
      },
    ],
    sanity: (eng) => eng.units[0].hp === 50 - 45 * (1 - Math.hypot(0.5, 0.5) / 2.6) && eng.units[1].dead === true && eng.units[2].hp === 50
      && eng.shake === 3.2 && eng.effects.some((e) => e.kind === 'bullet') && eng.effects.some((e) => e.kind === 'explosion'),
  },
  {
    // S25 laser（M-U10f）：光束线杀伤全支位级（L10323-10353——ttl 到期单发，无周期相）
    //   几何面：lsx=96.5/lsy=56.5 → ldx=ldy=4 → llen=hypot(4,4)=5.656854249492381 → lux=luy=4/llen（f64 除法）
    //   u0 线上中段 t≈2.5（d=0<0.75，t/llen≈0.44≤0.85 → ldmg*0.7）/ u1 焦点线上 t≈5.4（比值≈0.955>0.85 → 全伤）
    //   u2 终点外投影钳 llen（比值 1 → 全伤，d=0.5<0.75）/ u3 起点外投影钳 0（比值 0 → 0.7×，d=0.5<0.75）
    //   u4 远离线 d=hypot(10,10)≥0.75 零掷零伤 / u5 src=1 豁免前置（线上 t≈3.5——距离门前短路零掷）
    //   u6 dead=1 线上跳过（循环头 dead continue——L10335）+ killCredit wid=7 往返（L10333 写/L10351 复位）
    //   + emergentPayload wid 门（铸域空表桩 L9399 早退）+ explosion {r:0.8} 终点小爆破
    //   + dmgNumbers 门（fxPrefs 默认 true L271——每命中单位 rng<0.4 掷，text '-'+Math.round(final)——
    //   M-U7p 桩面 false 异构：power 域真引擎面真吞掷）+ 线上坐标 lux*t 乘加序位级
    key: 'power-laser', baseSeed: BASE + 45, seed: 0x0A0E1A, seasons: false, yearF: 2.5, tickCount: 24000, steps: 2, minDraws: 8,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        units: (() => {
          const L = Math.hypot(4, 4), ux = 4 / L, uy = 4 / L;   // 蓝本同式：llen/lux/luy 由真引擎逐位消费，此处坐标生成同式
          return [
            { race: 'SHEEP', x: 96.5 + ux * 2.5, y: 56.5 + uy * 2.5, hp: 50, maxHp: 50 },   // u0 线上中段 0.7×支
            { race: 'SHEEP', x: 96.5 + ux * 5.4, y: 56.5 + uy * 5.4, hp: 50, maxHp: 50 },   // u1 焦点末段全伤支
            { race: 'SHEEP', x: 100.5 + ux * 0.5, y: 60.5 + uy * 0.5, hp: 50, maxHp: 50 },  // u2 终点外投影钳 llen
            { race: 'SHEEP', x: 96.5 - ux * 0.5, y: 56.5 - uy * 0.5, hp: 50, maxHp: 50 },   // u3 起点外投影钳 0
            { race: 'SHEEP', x: 110.5, y: 70.5, hp: 50, maxHp: 50 },                        // u4 远离线零伤
            { race: 'SHEEP', x: 96.5 + ux * 3.5, y: 56.5 + uy * 3.5, hp: 50, maxHp: 50, civ: 1 },   // u5 src 豁免
            { race: 'SHEEP', x: 96.5 + ux * 2.0, y: 56.5 + uy * 2.0, hp: 10, maxHp: 50, dead: 1 },  // u6 dead 跳过
          ];
        })(),
        fx: [{ kind: 'laser', x: 100.5, y: 60.5, ttl: 10, x0: 96.5, y0: 56.5, src: 1, dmg: 30, wid: 7, preAge: 8 }],
      },
    ],
    sanity: (eng) => eng.units[0].hp === 50 - 30 * 0.7 && eng.units[1].hp === 20 && eng.units[2].hp === 20
      && eng.units[3].hp === 50 - 30 * 0.7 && eng.units[4].hp === 50 && eng.units[5].hp === 50 && eng.units[6].hp === 10
      && eng.units[6].dead === 1 && eng.killCredit === null && eng.effects.some((e) => e.kind === 'explosion')
      && eng.effects.filter((e) => e.kind === 'hit').length === 4,
  },
  {
    // S26 laser 退化面（M-U10f）：无 x0/y0/src/dmg/wid 夹具（fx() 默认 x0=x L9793 → ldx=ldy=0 →
    //   llen=0||1=1 回退支——除零护栏位级 + lux=luy=0 点爆语义 t=0 → 0.7× 支 + ldmg ?? 30 缺位钉
    //   + e.src undefined 豁免支不触达（条件短路——C# e.src.HasValue false 同构）+ killCredit null
    //   往返（?? null 双写）+ wid null 无 emergentPayload 门 + 空转步零掷（preAge 6/ttl 8：k0 age→7
    //   <ttl 零掷——laser 无周期相单调到期）+ fx0 稀疏通道（x0==x 不出键——旧场景字节面同构）
    key: 'power-laser-degenerate', baseSeed: BASE + 46, seed: 0x0A0E1B, seasons: false, yearF: 2.5, tickCount: 25000, steps: 2, minDraws: 5,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 56; y < 65; y++) for (let x = 96; x < 105; x++) a.push([x, y, T.GRASS]); return a; })()],
        units: [{ race: 'SHEEP', x: 101.0, y: 61.0, hp: 50, maxHp: 50 }, { race: 'SHEEP', x: 101.5, y: 60.5, hp: 50, maxHp: 50 }],
        fx: [{ kind: 'laser', x: 100.5, y: 60.5, ttl: 8, preAge: 6 }],
      },
    ],
    sanity: (eng) => eng.units[0].hp === 50 - 30 * 0.7 && eng.units[1].hp === 50 && eng.killCredit === null
      && eng.effects.some((e) => e.kind === 'explosion') && eng.effects.filter((e) => e.kind === 'hit').length === 1,
  },
  {
    // S27 orbital（M-U10g）：轨道天罚 ttl 到期单发全支位级（L10370-10388）
    //   or=4.5 → shellBurst(100.5,60.5,4.5,120,true,src=1) 单位环零掷（d<4.9 几何伤害——无 src 豁免）+
    //   地形环 rr=ceil(4.5)=5 fire 门（isLand&&!MOUNTAIN 短路——WATER/MOUNTAIN 差异格零掷）→ GRASS 格
    //   rng<0.45 门掷 → ignite 内掷 FLAMMABLE[GRASS] 过 → fire=150+floor(rng*90) 第二掷 + fx explosion 2 掷
    //   → 焦化环 yy∈[56..65]/xx∈[96..105]（d<4.5 && isLand && !MOUNTAIN 掷 1/格 <0.8 → setTerrain BURNT
    //   ——M-U8b SetTerrain regrow 出账消费面）+ superweapon 纪事（AddEventHook x/y 无 colorHex）+
    //   wid=7 emergentPayload 桩门（铸域空表 L9399 早退零掷）+ killCredit 往返（??null 写/复位）+
    //   shake=max(min(5,5.5)=5, 9)=9 + k0 preAge 10→age 11<12 空转零掷步（无周期相——laser 同构）
    key: 'power-orbital', baseSeed: BASE + 47, seed: 0x0A0E1C, seasons: false, yearF: 2.5, tickCount: 26000, steps: 2, minDraws: 50,
    patches: [
      { terrain: [
          [98, 58, T.MOUNTAIN], [99, 58, T.MOUNTAIN], [102, 62, T.MOUNTAIN], [103, 62, T.MOUNTAIN],
          [97, 61, T.WATER], [98, 61, T.WATER], [103, 59, T.WATER], [104, 59, T.WATER],
        ],
        units: [
          { race: 'SHEEP', x: 100.5, y: 60.5, hp: 50, maxHp: 50 },   // u0 中心 d=0 → 120 伤死
          { race: 'SHEEP', x: 104.5, y: 64.5, hp: 50, maxHp: 50 },   // u1 d=hypot(4,4)=5.657≥4.9 零伤
          { race: 'SHEEP', x: 101.5, y: 60.5, hp: 50, maxHp: 50, dead: 1 },   // u2 dead 循环头跳过
          { race: 'SHEEP', x: 100.5, y: 61.5, hp: 50, maxHp: 50 },   // u3 d=1 → 120*(1-1/4.9) 死
        ],
        fx: [{ kind: 'orbital', x: 100.5, y: 60.5, ttl: 12, src: 1, wid: 7, preAge: 10 }],
      },
    ],
    sanity: (eng) => eng.units[0].dead === true && eng.units[3].dead === true && eng.units[1].hp === 50
      && eng.units[2].hp === 50 && eng.units[2].dead === 1 && eng.killCredit === null && eng.shake === 9
      && eng.terrain[idx(98, 58)] === T.MOUNTAIN && eng.terrain[idx(97, 61)] === T.WATER
      && !eng.effects.some((e) => e.kind === 'orbital') && eng.effects.some((e) => e.kind === 'explosion')
      && eng.worldEvents.some((ev) => ev.kind === 'superweapon'),
  },
  {
    // S28 orbital 边缘面（M-U10g）：贴边中心 (2.5,2.5) → 焦化环 xx/yy∈[-2..7] 负裁剪支（xx<0||yy<0
    //   continue 零掷）+ 左半水域 x∈[0..2] WATER（isLand false 零掷——中心格本身 WATER 语义：shellBurst
    //   单位环无地形门水上照样吃伤）+ 右半 GRASS 掷面 + wid/src 缺省（killCredit ??null null 往返 +
    //   emergentPayload 门不触达 + shellBurst src ?? -1）+ u1 d=3 → 120*(1-3/4.9)=46.5306… 幸存位级
    key: 'power-orbital-edge', baseSeed: BASE + 48, seed: 0x0A0E1D, seasons: false, yearF: 2.5, tickCount: 27000, steps: 2, minDraws: 15,
    patches: [
      { terrain: [...(() => { const a = []; for (let y = 0; y < 9; y++) for (let x = 0; x < 3; x++) a.push([x, y, T.WATER]); return a; })()],
        units: [
          { race: 'SHEEP', x: 2.5, y: 2.5, hp: 50, maxHp: 50 },      // u0 中心（WATER 上）d=0 死
          { race: 'SHEEP', x: 5.5, y: 2.5, hp: 50, maxHp: 50 },      // u1 d=3 → 幸存
        ],
        fx: [{ kind: 'orbital', x: 2.5, y: 2.5, ttl: 12, preAge: 10 }],
      },
    ],
    sanity: (eng) => eng.units[0].dead === true && eng.units[1].hp === 50 - 120 * (1 - 3 / 4.9)
      && eng.killCredit === null && eng.shake === 9 && eng.terrain[idx(1, 2)] === T.WATER
      && !eng.effects.some((e) => e.kind === 'orbital') && eng.effects.some((e) => e.kind === 'explosion')
      && eng.worldEvents.some((ev) => ev.kind === 'superweapon'),
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
    domains: ['effectsTick L9801-10447', 'tornado L9805-9824', 'acid L9826-9850', 'blizzard L9915-9948', 'locust L9949-9971', 'drought L9972-9996', 'rainstorm L9997-10022', 'sandstorm L10068-10090', 'famine L10170-10190', 'M-U10b: tsunami L9877-9914', 'M-U10b: sinkhole L10120-10147', 'M-U10b: iceage L10148-10169', 'M-U10b: blackhole L10191-10223', 'M-U10b: quake L10224-10236', 'M-U10c: meteor L10237-10239', 'M-U10c: fireball L10240-10254', 'M-U10c: arrow·bullet L10255-10294', 'M-U10c: explode L10450-10499', 'M-U10c: ignite L1072-1077', 'M-U10d: shell L10295-10301', 'M-U10d: missile L10302-10310', 'M-U10d: shellBurst L9595-9620', 'M-U10d: nuke L12255-12260', 'M-U10d: onBuildingDestroyed raze 支 L4464-4498（capture/annex 支夹具外——M-U10e 候选）', 'M-U10e: airstrike L10311-10322', 'M-U10e: drone L10353-10368', 'M-U10e: mech L10394-10414', 'M-U10f: laser L10323-10353', 'M-U10g: orbital L10370-10388', '到期 splice L10439-10441', 'activeBattles %5 清理 L10443-10447', 'fx L9781-9799', 'attackBuilding L4446-4462', 'meltIce L2892（drought 消费）', 'setTerrain L969-1007（regrow L979 出账联动 + flood L983 贴花级联）', 'rebuildBuckets L3081-3104（注入相尾——arrow/bullet 桶扫描面）', 'gearBonus L1498-1520（armor 采样入 units0.gbArmor）', 'atWar L2061-2064（rel0 挂账）'],
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
