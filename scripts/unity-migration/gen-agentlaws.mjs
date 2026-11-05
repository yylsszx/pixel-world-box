// ============================================================================
// gen-agentlaws.mjs —— M-U28 切片「Agent 法则系统 v2 结算面」（TickOrch 槽 60 语义）
//   蓝本 src/lib/game/agentLaws.ts：
//   · 纯函数面：evalCond L125-143（模块级）、resolveRace L70-87
//   · 系统面：tick L524-557（cron/condition 结算 + 到期移除 + 预算 ≤6）/
//     onEvent L562-582（事件总线 + 重入保护 + 单事件 ≤4）/ statValue L585-593 +
//     buildStats L596-629（16 统计键 + counter:名）/ fire L638-875（39 动作分发）/
//     remove L496-504 / toggle L506-512 / revertParams L515-520
//   · 数据面：engineParams.ts REG 15 参数 get/set（param 动作 + 还原账本）
//   切片边界（挂账注记）：create/update/normalizeTrigger/normalizeLaw/list 属工具/
//     存档面（法则夹具手术式直写注入，不经 create——先例 gen-power radSet 注入态
//     radTick 未译不入本轮）；WBB.touchMeta（槽 59 前半）未译维持 no-op。
//   DIVERGENCE（docs/UNITY_MIGRATION.md 同步）：C# ep() 热路径未接线（引擎各域内联
//     默认值）——param 动作只改注册表值，下游模拟效应为后续接线挂账；计数值字符串
//     的 |v|<1e-7 指数形态边界（JS String 指数/C# 定点）场景值域避开，列长尾挂账。
// 直接 import 现役 src/lib/game/agentLaws.ts + engine.ts（真实现，非复制）。
// 夹具 = 手术式字段直写（gen-ice 协议）：构造 GameEngine(baseSeed)（构造器 generate
//   全链）后瞬态层清零 + civs/warData/families/dynRaces 清零 + spawnUnit 真调用注入
//   （掷数不计——rngA 尾置）+ fireSet 直写 + 法则直写，尾置 eng.rngA = seed 清零掷链
//   → agentLaws.tick() 直调步进（tickCount 不 ++——系统结算不经母体编排，掷链自 seed
//   纯净起流；year=floor(yearF) 恒定，间隔门跨步语义由 S12 证明）。
//
// 协议要点：
//   ① 单 rng 流：eng.rngA——结算 chance 掷（每法则 1）/fire 随机坐标 2 掷/spawn 每
//     单位 2 掷/ignite 每可燃格 1 掷/神力方法内掷（M-U10 位精确译件）。
//   ② onEvent 级联：fire 内 addEvent 被 firing 重入保护拦截；fire 返回后的结算播报
//     addEvent('oracle') 触发 onEvent——event 型法则在结算内感应（S6 全链）。
//   ③ statsCache：tick 入口置 null → 同结算多条件法则共享 buildStats（S2）；fire
//     finally 置 null（神力改世界即作废）。
//   ④ det 双跑字节级 + 每场景掷数下限 sanity。
//
// 运行：bun scripts/unity-migration/gen-agentlaws.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/agentlaws.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/agentlaws.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 gen-ice.mjs） ----
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
const alMod = await jiti.import(path.join(ROOT, 'src/lib/game/agentLaws.ts'));
const epMod = await jiti.import(path.join(ROOT, 'src/lib/game/engineParams.ts'));
const { T, R, RACES } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const N = W * H;

// ---- 工具 ----
const gzB64 = (u8) => zlib.gzipSync(Buffer.from(u8), { level: 9 }).toString('base64');
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };
const idx = (x, y) => y * W + x;

function chainDraws(state0, finalState) {   // mulberry 纯数学反解（gen-ice 协议①——步进返回新状态 a，非输出值）
  const step = (a) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return a;                                // 引擎 rngA 存的是加常数后的状态 A（engine.ts L733）
  };
  let a = state0 | 0;
  if ((state0 >>> 0) === (finalState >>> 0)) return 0;   // 零掷面（终态=起态——到期移除/间隔门等零掷场景）
  for (let k = 0; k < 5_000_000; k++) {
    a = step(a);
    if ((a >>> 0) === (finalState >>> 0)) return k + 1;
  }
  throw new Error('rng 链未达终态——协议失效');
}

// ---- 手术式夹具构建 + agentLaws.tick 步进 + 快照 ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);      // 构造器 generate 全链（后续手术覆写）
  epMod.resetEngineParams();                      // 参数注册表进程级单例——场景间复位（det 双跑前置条件）

  // 手术一：瞬态层清零（terrain 基面 GRASS / 火清 / 贴花清 / 单位清 / 文明与谱系清 / 事件清）
  eng.terrain.fill(T.GRASS);
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
  eng.civs.length = 0;
  eng.warData.clear();
  eng.families.clear();
  eng.dynRaces.clear();
  eng.laws.seasons = spec.seasons;
  eng.yearF = spec.yearF;
  eng.tickCount = spec.tickCount;

  // 法则/计数器直写注入（手术式——create/normalizeTrigger 属工具/存档面下一轮）
  for (const jl of spec.laws) eng.agentLaws.laws.push(JSON.parse(JSON.stringify(jl)));
  let maxSeq = 0;
  for (const l of eng.agentLaws.laws) { const m = /^L(\d+)$/.exec(l.id); if (m) maxSeq = Math.max(maxSeq, Number(m[1])); }
  eng.agentLaws.seq = maxSeq + 1;
  for (const [k, v] of Object.entries(spec.counters0 ?? {})) eng.agentLaws.counters[k] = v;

  // spawn 真调用注入（掷数不计——rngA 尾置；M-U3h 协议）
  const spawn0 = [];
  for (const [race, x, y] of spec.spawn ?? []) {
    const u = eng.spawnUnit(race, x, y, { silent: true });
    if (!u || u.dead) throw new Error(`S${spec.key}: spawn 失败 race=${race}@${x},${y}`);
    spawn0.push({ race, x: f64hex(u.x), y: f64hex(u.y) });   // C# SpawnUnit 重放入参（f64 位级）
  }
  // fireSet 直写注入（fires 统计键；fire[] 恒 0——fireTick 不入本轮）
  for (const i of spec.fireSet0 ?? []) eng.fireSet.add(i);

  // 手术二·快照：步进前镜像输入面（黄金 fixture 通道——C# 灌注重建）
  const fixture = {
    terrain0: gzB64(eng.terrain),
    soilF0: gzB64(eng.worldsim.soilF),
    fire0: gzB64(eng.fire),
    fireSet0: [...eng.fireSet],
    spawn0,
    globalTempHex: f64hex(eng.worldsim.globalTemp),
    seaLevelHex: f64hex(eng.worldsim.seaLevel),
    glacierTiles: eng.worldsim.glacierTiles,
  };

  // 手术三（尾置）：rngA 清零起流 → agentLaws.tick() 步进 + 逐步快照
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (let k = 0; k < spec.steps; k++) {
    eng.agentLaws.tick();
    steps.push({
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      terrainMd5: md5hex(eng.terrain),
      lawsState: eng.agentLaws.laws.map((l) => ({ id: l.id, enabled: l.enabled, fired: l.fired, lastYear: l.lastYear })),
      counters: Object.entries(eng.agentLaws.counters).map(([k2, v]) => [k2, f64hex(v)]),
      eventsCount: eng.worldEvents.length,
      fxCount: eng.effects.length,
      fireSet: [...eng.fireSet],
    });
  }

  // sanity（生成即验证）
  let totalDraws;
  try {
    totalDraws = chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  } catch (e) {
    throw new Error(`S${spec.key}: ${e.message} rngA=${(eng.rngA >>> 0).toString(16)} seed=${(spec.seed >>> 0).toString(16)}`);
  }
  if (spec.minDraws !== undefined && totalDraws !== spec.minDraws) throw new Error(`S${spec.key}: 掷数 ${totalDraws} != 期望 ${spec.minDraws}`);
  if (spec.minDraws === undefined && totalDraws === 0 && !spec.allowZeroDraws) throw new Error(`S${spec.key}: 掷数 0（非预期零掷面）`);
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
    laws: spec.laws,
    counters0: spec.counters0 ?? {},
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    fire: gzB64(eng.fire),
    fireSet: [...eng.fireSet],
    fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir) })),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
    units: eng.units.map((u) => ({ x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), dead: u.dead })),
    params: epMod.listEngineParams().map((m) => ({ path: m.path, valueHex: f64hex(m.value) })),
    reverts: eng.agentLaws.laws.map((l) => ({ id: l.id, revert: Object.entries(l.revert).map(([k2, v]) => [k2, f64hex(v)]) })),
  };
}

// ---- 场景集（12 场景：cron 基础/条件统计/NaN 链位/到期还原/预算/事件级联/内联动作/神力全分发/机制链/chance 门/间隔门/跨步间隔） ----
const BASE = 20261102;
const at = (x, y) => ({ x, y });
const specs = [
  {
    // S1 cron 基础：interval 门过 → chance 掷 1（chance=1 恒过）→ announce（fire 内 addEvent 被
    // firing 重入保护拦截）+ counter → 结算播报 addEvent('oracle')（无 event 法则零级联）
    key: 'cron-basic', baseSeed: BASE + 1, seed: 0xA1CE001, seasons: true, yearF: 10.5, tickCount: 1000, steps: 1, minDraws: 5,
    // 5 掷 = chance 1 + announce 随机坐标 2（L646-649 对无坐标动作无条件算 x/y）+ counter 2
    laws: [{
      id: 'L1', name: '天命', desc: '每年宣告', enabled: true, createdYear: 0, durationYears: null,
      trigger: { kind: 'cron', everyYears: 10, chance: 1, season: null },
      actions: [{ kind: 'announce', text: '天命昭昭' }, { kind: 'counter', name: '威严', op: 'add', value: 3 }],
      fired: 0, lastYear: 0, revert: {},
    }],
    sanity: (eng) => eng.agentLaws.counters['威严'] === 3 && eng.agentLaws.laws[0].fired === 1,
  },
  {
    // S2 条件统计：and 树（wildlife>2 ∧ counter:kills≥1）+ buildStats 单遍历（sheep×3 isCiv=false
    // herbivore + wolf predator）+ 同结算双条件法则共享 statsCache（L2 season=1 夏门过）+ event 型零掷 skip
    key: 'cond-stats', baseSeed: BASE + 2, seed: 0xA1CE002, seasons: true, yearF: 2.5, tickCount: 2000, steps: 1, minDraws: 6,
    // 6 掷 = L1 chance 1 + L1 counter 随机坐标 2 + L2 chance 1 + L2 announce 随机坐标 2
    spawn: [[R.SHEEP, 100.5, 60.5], [R.SHEEP, 101.5, 60.5], [R.SHEEP, 102.5, 60.5], [R.WOLF, 110.5, 62.5]],
    counters0: { kills: 2 },
    laws: [
      {
        id: 'L1', name: '猎季', desc: '野兽繁盛即赏', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'condition', everyYears: 1, chance: 1, season: null,
          cond: { op: 'and', sub: [{ op: 'gt', stat: 'wildlife', value: 2 }, { op: 'gte', stat: 'counter:kills', value: 1 }] } },
        actions: [{ kind: 'counter', name: '狩猎', op: 'add', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L2', name: '夏语', desc: '夏日宣告', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'condition', everyYears: 1, chance: 1, season: 1,
          cond: { op: 'lt', stat: 'pop', value: 5 } },
        actions: [{ kind: 'announce', text: '夏日低语' }],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L3', name: '亡国回响', desc: 'fall 监听（tick 零掷 skip——事件型由 addEvent 钩子驱动）', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'event', chance: 1, event: 'fall', eventCooldownYears: 1 },
        actions: [{ kind: 'announce', text: '王国回响' }],
        fired: 0, lastYear: 0, revert: {},
      },
    ],
    sanity: (eng) => eng.agentLaws.counters['狩猎'] === 1 && eng.agentLaws.laws[2].fired === 0,
  },
  {
    // S3 NaN 链位：未知统计键 → statValue NaN → evalCond false → rng 不掷（L1 零掷）——
    // L2 cron 正常掷 1，掷链终态钉住「L1 未掷」的链位证据
    key: 'nan-chain', baseSeed: BASE + 3, seed: 0xA1CE003, seasons: true, yearF: 10.5, tickCount: 3000, steps: 1, minDraws: 3,
    // 3 掷 = L1 零掷（NaN→false 在 rng 前——链位证据）+ L2 chance 1 + counter 随机坐标 2
    laws: [
      {
        id: 'L1', name: '天机', desc: '未知键恒 false', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'condition', everyYears: 1, chance: 1, season: null, cond: { op: 'gt', stat: 'mystery', value: 0 } },
        actions: [{ kind: 'counter', name: '不该出现', op: 'add', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L2', name: '年轮', desc: 'cron 正常', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 10, chance: 1, season: null },
        actions: [{ kind: 'counter', name: '年轮数', op: 'set', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
    ],
    sanity: (eng) => eng.agentLaws.counters['不该出现'] === undefined && eng.agentLaws.counters['年轮数'] === 1,
  },
  {
    // S4 到期还原：durationYears=5 已届 → remove(false) + revertParams（param 改前值账本还原
    // pop.reproMul 0.7）+ revert 清空 + 「悄然消散」纪事；L2 幸存法则证明循环继续
    key: 'expiry-revert', baseSeed: BASE + 4, seed: 0xA1CE004, seasons: true, yearF: 5.5, tickCount: 4000, steps: 1, minDraws: 0, allowZeroDraws: true,
    laws: [
      {
        id: 'L1', name: '丰饶', desc: '到期即还', enabled: true, createdYear: 0, durationYears: 5,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [{ kind: 'param', path: 'pop.reproMul', value: 2 }],
        fired: 1, lastYear: 4, revert: { 'pop.reproMul': 0.7 },
      },
      {
        id: 'L2', name: '长夜', desc: '百年不动', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 100, chance: 1, season: null },
        actions: [{ kind: 'counter', name: '长夜数', op: 'add', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
    ],
    sanity: (eng) => eng.agentLaws.laws.length === 1 && eng.agentLaws.laws[0].id === 'L2'
      && Math.abs(epMod.getEngineParam('pop.reproMul').value - 0.7) < 1e-15,
  },
  {
    // S5 预算封顶：8 条同资格 cron 法则——全局 fire ≤6，L7/L8 在 budget 门（rng 前）被拦零掷
    key: 'budget-6', baseSeed: BASE + 5, seed: 0xA1CE005, seasons: true, yearF: 1.5, tickCount: 5000, steps: 1, minDraws: 18,
    // 18 掷 = 6 法则 ×（chance 1 + counter 随机坐标 2）；L7/L8 在 budget 门（rng 前）被拦零掷
    laws: Array.from({ length: 8 }, (_, i) => ({
      id: `L${i + 1}`, name: `潮${i + 1}`, desc: '预算压测', enabled: true, createdYear: 0, durationYears: null,
      trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
      actions: [{ kind: 'counter', name: `k${i + 1}`, op: 'add', value: 1 }],
      fired: 0, lastYear: 0, revert: {},
    })),
    sanity: (eng) => eng.agentLaws.laws.filter((l) => l.fired === 1).length === 6,
  },
  {
    // S6 事件级联全链：L1 cron announce → fire 内 addEvent 被 firing 拦截 → 结算播报
    // addEvent('oracle') → onEvent：L2（event oracle）chance 掷过 → fire(spawn×2 随机坐标
    // 4 掷 + counter) → 播报再入 onEvent 被冷却闸（year-lastYear=0<1）拦断——无递归；
    // L3 event fall 非 matching kind skip
    key: 'event-cascade', baseSeed: BASE + 6, seed: 0xA1CE006, seasons: true, yearF: 1.5, tickCount: 6000, steps: 1, minDraws: 24,
    // 24 掷（实测钉死）= 手算面 10（L1 chance 1+announce 坐标 2；L2 onEvent chance 1+spawn 2 单位
    // ×2 落点掷+counter 坐标 2）+ spawnUnit 内掷 14（gene/maxAge/trait 面——spawn 在受测链内，
    // M-U3h 译件同构重放）；L3 零掷；播报再入 onEvent 被冷却闸拦断
    laws: [
      {
        id: 'L1', name: '圣言', desc: '宣告引感召', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [{ kind: 'announce', text: '圣言降世' }],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L2', name: '感召', desc: '神谕事件招绵羊', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'event', chance: 1, event: 'oracle', eventCooldownYears: 1 },
        actions: [{ kind: 'spawn', race: 'sheep', count: 2 }, { kind: 'counter', name: '感召数', op: 'add', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L3', name: '覆灭哨', desc: 'fall 监听（非 oracle 不感）', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'event', chance: 1, event: 'fall', eventCooldownYears: 1 },
        actions: [{ kind: 'announce', text: '不应触发' }],
        fired: 0, lastYear: 0, revert: {},
      },
    ],
    sanity: (eng) => eng.units.length === 2 && eng.agentLaws.counters['感召数'] === 1 && eng.agentLaws.laws[2].fired === 0,
  },
  {
    // S7 内联动作面：weather rain（healArea）/weather sandstorm/terrain（r² 环写 + setTerrain
    // 级联）/smite（u.hp=0 直写）/fire（ignite 每可燃格 1 掷）/spawn（px 定点 2 掷）/heal/bless
    key: 'inline-actions', baseSeed: BASE + 7, seed: 0xA1CE007, seasons: true, yearF: 1.5, tickCount: 7000, steps: 1,
    spawn: [[R.SHEEP, 60.5, 60.5], [R.SHEEP, 61.5, 60.5], [R.WOLF, 200.5, 100.5]],
    laws: [{
      id: 'L1', name: '雕琢', desc: '内联动作八连', enabled: true, createdYear: 0, durationYears: null,
      trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
      actions: [
        { kind: 'weather', weather: 'rain', x: 60, y: 60, radius: 3 },
        { kind: 'weather', weather: 'sandstorm', x: 60, y: 60, radius: 3 },
        { kind: 'terrain', terrain: 'forest', x: 60, y: 60, radius: 2 },
        { kind: 'smite', x: 60, y: 60, radius: 5 },
        { kind: 'fire', x: 120, y: 60, radius: 2 },
        { kind: 'spawn', race: 'wolf', count: 1, x: 60, y: 60 },
        { kind: 'heal', x: 60, y: 60, radius: 3 },
        { kind: 'bless', x: 60, y: 60, radius: 3 },
      ],
      fired: 0, lastYear: 0, revert: {},
    }],
    sanity: (eng) => eng.units.length === 4 && eng.terrain[idx(60, 60)] === T.FOREST,
  },
  {
    // S8 神力全分发：meteor/quake(M toFixed)/volcano/lightning/tornado/tsunami/drought/flood +
    // blizzard/meteor_shower/typhoon/acid_rain/locust/famine/ice_age/sinkhole + blackhole/wrath/
    // curse/love/mutate/teleport/rain_cloud/plague(Max(3,·)) + nuke/boom/river(WbWorldgen 全级联)/
    // oasis/fire(ignite)——4 法则 ≤8 动作、预算 4≤6、坐标全定点（fire 内 2 掷/ignite 掷/神力内掷）
    key: 'powers-dispatch', baseSeed: BASE + 8, seed: 0xA1CE008, seasons: true, yearF: 1.5, tickCount: 8000, steps: 1,
    laws: [
      {
        id: 'L1', name: '天灾卷一', desc: '经典八连', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [
          { kind: 'meteor', x: 100, y: 80 },
          { kind: 'quake', x: 100, y: 80, power: 2 },
          { kind: 'volcano', x: 100, y: 80, power: 1 },
          { kind: 'lightning', x: 100, y: 80, count: 3 },
          { kind: 'tornado', x: 100, y: 80, count: 1 },
          { kind: 'tsunami', x: 100, y: 80, radius: 6 },
          { kind: 'drought', x: 100, y: 80, radius: 6 },
          { kind: 'flood', x: 100, y: 80 },
        ],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L2', name: '天灾卷二', desc: 'v2 神力八连', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [
          { kind: 'blizzard', x: 150, y: 90, radius: 5 },
          { kind: 'meteor_shower', x: 150, y: 90, radius: 5, count: 3 },
          { kind: 'typhoon', x: 150, y: 90, radius: 5 },
          { kind: 'acid_rain', x: 150, y: 90, radius: 4 },
          { kind: 'locust', x: 150, y: 90, radius: 4 },
          { kind: 'famine', x: 150, y: 90, radius: 5 },
          { kind: 'ice_age', x: 150, y: 90, radius: 5 },
          { kind: 'sinkhole', x: 150, y: 90, radius: 4 },
        ],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L3', name: '天灾卷三', desc: 'v2 神力再八', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [
          { kind: 'blackhole', x: 60, y: 40, radius: 6 },
          { kind: 'wrath', x: 60, y: 40, radius: 4 },
          { kind: 'curse', x: 60, y: 40, radius: 4 },
          { kind: 'love', x: 60, y: 40, radius: 4 },
          { kind: 'mutate', x: 60, y: 40, radius: 4 },
          { kind: 'teleport', x: 60, y: 40, radius: 4 },
          { kind: 'rain_cloud', x: 60, y: 40, radius: 4 },
          { kind: 'plague', x: 60, y: 40, radius: 5 },
        ],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L4', name: '造物卷', desc: 'v5 五连', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [
          { kind: 'nuke', x: 200, y: 120, power: 1 },
          { kind: 'boom', x: 200, y: 120, radius: 4 },
          { kind: 'river', x: 30, y: 30 },
          { kind: 'oasis', x: 210, y: 130 },
          { kind: 'fire', x: 220, y: 140, radius: 3 },
        ],
        fired: 0, lastYear: 0, revert: {},
      },
    ],
    sanity: (eng) => eng.agentLaws.laws.every((l) => l.fired === 1) && eng.effects.length > 0,
  },
  {
    // S9 机制链：L1 param 写入（revert 记账）→ L2 mech disable L1 → toggle 还原 param 账本 +
    // enabled=false（可逆性同样适用于机制链）
    key: 'mech-chain', baseSeed: BASE + 9, seed: 0xA1CE009, seasons: true, yearF: 1.5, tickCount: 9000, steps: 1, minDraws: 6,
    // 6 掷 = L1 chance 1 + param 坐标 2 + L2 chance 1 + mech 坐标 2
    laws: [
      {
        id: 'L1', name: '烈火法', desc: 'param 调参', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [{ kind: 'param', path: 'fire.damage', value: 8 }],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L2', name: '冰封令', desc: '冻结烈火法', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [{ kind: 'mech', action: 'disable', target: 'L1' }],
        fired: 0, lastYear: 0, revert: {},
      },
    ],
    sanity: (eng) => eng.agentLaws.laws[0].enabled === false
      && Math.abs(epMod.getEngineParam('fire.damage').value - 3) < 1e-15
      && Object.keys(eng.agentLaws.laws[0].revert).length === 0,
  },
  {
    // S10 chance 门不中：L1 chance 0.01（seed 选掷 >0.01）→ skip（fired 0/lastYear 0，掷 1）；
    // L2 chance 1 → fire（掷 1）——对照面
    key: 'chance-gate', baseSeed: BASE + 10, seed: 0xA1CE00A, seasons: true, yearF: 1.5, tickCount: 10000, steps: 1, minDraws: 4,
    // 4 掷 = L1 chance（0.01 门不中→skip，无 fire 坐标掷）+ L2 chance 1 + counter 坐标 2
    laws: [
      {
        id: 'L1', name: '低愿', desc: '1% 愿望', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 0.01, season: null },
        actions: [{ kind: 'counter', name: '低愿数', op: 'add', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L2', name: '满愿', desc: '100% 愿望', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [{ kind: 'counter', name: '满愿数', op: 'add', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
    ],
    sanity: (eng) => eng.agentLaws.laws[0].fired === 0 && eng.agentLaws.laws[1].fired === 1,
  },
  {
    // S11 间隔门：L1 everyYears 100（year-lastYear=1<100 → continue 零掷）；L2 everyYears 1 正常
    key: 'interval-gate', baseSeed: BASE + 11, seed: 0xA1CE00B, seasons: true, yearF: 1.5, tickCount: 11000, steps: 1, minDraws: 3,
    // 3 掷 = L1 零掷（间隔门 rng 前）+ L2 chance 1 + counter 坐标 2
    laws: [
      {
        id: 'L1', name: '长庚', desc: '百年一遇', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 100, chance: 1, season: null },
        actions: [{ kind: 'counter', name: '长庚数', op: 'add', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
      {
        id: 'L2', name: '朔望', desc: '年年有约', enabled: true, createdYear: 0, durationYears: null,
        trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
        actions: [{ kind: 'counter', name: '朔望数', op: 'add', value: 1 }],
        fired: 0, lastYear: 0, revert: {},
      },
    ],
    sanity: (eng) => eng.agentLaws.laws[0].fired === 0 && eng.agentLaws.laws[1].fired === 1,
  },
  {
    // S12 跨步间隔：steps=3——step1 fire（lastYear=1）→ step2/3 year 恒 1 → 0<1 continue 零掷；
    // statsCache 每结算入口重建语义（tickCount 恒定也不复用跨结算缓存）
    key: 'cross-steps', baseSeed: BASE + 12, seed: 0xA1CE00C, seasons: true, yearF: 1.5, tickCount: 12000, steps: 3, minDraws: 3,
    // 3 掷 = step1（chance 1 + counter 坐标 2）；step2/3 间隔门 0<1 continue 零掷
    laws: [{
      id: 'L1', name: '脉搏', desc: '一步一搏', enabled: true, createdYear: 0, durationYears: null,
      trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null },
      actions: [{ kind: 'counter', name: '搏动数', op: 'add', value: 1 }],
      fired: 0, lastYear: 0, revert: {},
    }],
    sanity: (eng) => eng.agentLaws.counters['搏动数'] === 1 && eng.agentLaws.laws[0].fired === 1,
  },
];

const scenarios = specs.map(buildScenario);
for (const s of scenarios) {
  console.log(`${s.key}: draws=${s.totalDraws} events=${s.events.length} fx=${s.fx.length} units=${s.units.length} rngA=${s.stepsSnap.at(-1).rngA}`);
}

// ---- det 双跑（字节级）：同 spec 重跑终态对账 ----
const det2 = specs.map(buildScenario);
for (let i = 0; i < scenarios.length; i++) {
  if (scenarios[i].stepsSnap.at(-1).terrainMd5 !== det2[i].stepsSnap.at(-1).terrainMd5
    || scenarios[i].stepsSnap.at(-1).rngA !== det2[i].stepsSnap.at(-1).rngA
    || JSON.stringify(scenarios[i].stepsSnap) !== JSON.stringify(det2[i].stepsSnap)
    || JSON.stringify(scenarios[i].events) !== JSON.stringify(det2[i].events)
    || JSON.stringify(scenarios[i].params) !== JSON.stringify(det2[i].params))
    throw new Error(`det 失败 S${scenarios[i].key}`);
}
console.log('det 双跑字节级一致:', scenarios.map((s) => s.key).join(' '));

// ---- 纯函数向量（evalCond 模块级 L125-143 + resolveRace L70-87） ----
const STAT = { pop: 10, wars: 0, 'counter:k': 3.5, temp: -2.25 };
const statFn = (key) => (key in STAT ? STAT[key] : NaN);
const ce = (op, extra = {}) => ({ op, ...extra });
const pureEvalCond = [
  { c: ce('gt', { stat: 'pop', value: 5 }), expected: alMod.evalCond(ce('gt', { stat: 'pop', value: 5 }), statFn) },
  { c: ce('lt', { stat: 'pop', value: 5 }), expected: alMod.evalCond(ce('lt', { stat: 'pop', value: 5 }), statFn) },
  { c: ce('gte', { stat: 'pop', value: 10 }), expected: alMod.evalCond(ce('gte', { stat: 'pop', value: 10 }), statFn) },
  { c: ce('lte', { stat: 'pop', value: 9.999 }), expected: alMod.evalCond(ce('lte', { stat: 'pop', value: 9.999 }), statFn) },
  { c: ce('eq', { stat: 'pop', value: 10 }), expected: alMod.evalCond(ce('eq', { stat: 'pop', value: 10 }), statFn) },
  { c: ce('eq', { stat: 'pop', value: 10.0000000001 }), expected: alMod.evalCond(ce('eq', { stat: 'pop', value: 10.0000000001 }), statFn) },
  { c: ce('gt', { stat: 'wars', value: 0 }), expected: alMod.evalCond(ce('gt', { stat: 'wars', value: 0 }), statFn) },
  { c: ce('gte', { stat: 'counter:k', value: 3 }), expected: alMod.evalCond(ce('gte', { stat: 'counter:k', value: 3 }), statFn) },
  { c: ce('gt', { stat: 'mystery', value: 0 }), expected: alMod.evalCond(ce('gt', { stat: 'mystery', value: 0 }), statFn) },
  { c: ce('and', { sub: [] }), expected: alMod.evalCond(ce('and', { sub: [] }), statFn) },
  { c: ce('or', { sub: [] }), expected: alMod.evalCond(ce('or', { sub: [] }), statFn) },
  { c: ce('not', { sub: ce('gt', { stat: 'pop', value: 5 }) }), expected: alMod.evalCond(ce('not', { sub: ce('gt', { stat: 'pop', value: 5 }) }), statFn) },
  {
    c: ce('and', { sub: [ce('or', { sub: [ce('lt', { stat: 'temp', value: 0 }), ce('gt', { stat: 'wars', value: 0 })] }), ce('not', { sub: ce('eq', { stat: 'pop', value: 9 }) })] }),
    expected: alMod.evalCond(ce('and', { sub: [ce('or', { sub: [ce('lt', { stat: 'temp', value: 0 }), ce('gt', { stat: 'wars', value: 0 })] }), ce('not', { sub: ce('eq', { stat: 'pop', value: 9 }) })] }), statFn),
  },
];
for (const t of pureEvalCond) { if (t.expected !== alMod.evalCond(t.c, statFn)) throw new Error('pure evalCond 自洽失败'); }
const pureResolveRace = ['人类', 'human', 'HUMAN', 'elf', '雪狼', '狼', '雪', 'dragon', 'DRAGON', '龙', 'sheep', '巨龙', '', '不存在的种族', '天使']
  .map((name) => ({ name, expected: alMod.resolveRace(name) }));
for (const t of pureResolveRace) { if (t.expected !== alMod.resolveRace(t.name)) throw new Error('pure resolveRace 自洽失败'); }
console.log('pure 向量: evalCond ' + pureEvalCond.length + ' + resolveRace ' + pureResolveRace.length);

// ============================================================================
// 工具/存档面（M-U29 切片）：validateCond L94-122 / normalizeTrigger L149-174 /
//   normalizeLaw L178-209 / validateActions L212-310（经 create/update 错误路径覆盖）/
//   create L341-391 / update L395-493 + 存档双面（engine.ts serialize L15305-15307 /
//   applySave L15660-15672——saveRoundTrip 直演）。
// 纯函数面无引擎（validateCond/normalizeTrigger/normalizeLaw 独立导出 L12）；系统面
//   （create/update）每 case 独立引擎 + 手术注入（laws0/counters0 直写）——零 rng
//   （create/update 不掷），det 双跑全量 JSON 字节级。
// canonical 面（f64hex 位级对账，M-U28 教训 d——禁 double 往返）：所有 JS 数值 → f64hex
//   字符串；JS undefined 字段 → 键省略（JSON.stringify 语义）；null 字段 → null 保留。
// ============================================================================
const f64h = f64hex;
const condCanon = (c) => {
  if (c.op === 'and' || c.op === 'or') return { op: c.op, sub: c.sub.map(condCanon) };
  if (c.op === 'not') return { op: 'not', sub: condCanon(c.sub) };
  return { op: c.op, stat: c.stat, value: f64h(c.value) };
};
const trigCanon = (t) => {
  const out = { kind: t.kind };
  if (t.kind === 'event') {
    out.chance = f64h(t.chance); out.event = t.event; out.eventCooldownYears = f64h(t.eventCooldownYears);
    return out;
  }
  if (t.everyYears !== undefined) out.everyYears = f64h(t.everyYears);   // event→cron 回退后 undefined → 键省略（L475）
  out.chance = f64h(t.chance);
  out.season = t.season === undefined ? null : t.season;
  if (t.kind === 'condition') out.cond = condCanon(t.cond);
  return out;
};
const ACT_KEY_ORDER = {
  meteor: ['kind', 'x', 'y'], flood: ['kind', 'x', 'y'],
  quake: ['kind', 'x', 'y', 'power'], volcano: ['kind', 'x', 'y', 'power'],
  lightning: ['kind', 'x', 'y', 'count'], tornado: ['kind', 'x', 'y', 'count'],
  tsunami: ['kind', 'x', 'y', 'radius'], drought: ['kind', 'x', 'y', 'radius'], blizzard: ['kind', 'x', 'y', 'radius'],
  weather: ['kind', 'weather', 'x', 'y', 'radius'],
  spawn: ['kind', 'race', 'count', 'x', 'y'],
  terrain: ['kind', 'terrain', 'radius', 'x', 'y'],
  bless: ['kind', 'x', 'y', 'radius'], heal: ['kind', 'x', 'y', 'radius'], smite: ['kind', 'x', 'y', 'radius'],
  param: ['kind', 'path', 'value'], announce: ['kind', 'text'],
  meteor_shower: ['kind', 'x', 'y', 'radius', 'count'],
  typhoon: ['kind', 'x', 'y', 'radius'], acid_rain: ['kind', 'x', 'y', 'radius'], locust: ['kind', 'x', 'y', 'radius'],
  famine: ['kind', 'x', 'y', 'radius'], ice_age: ['kind', 'x', 'y', 'radius'], sinkhole: ['kind', 'x', 'y', 'radius'],
  blackhole: ['kind', 'x', 'y', 'radius'], wrath: ['kind', 'x', 'y', 'radius'], curse: ['kind', 'x', 'y', 'radius'],
  love: ['kind', 'x', 'y', 'radius'], mutate: ['kind', 'x', 'y', 'radius'], teleport: ['kind', 'x', 'y', 'radius'],
  rain_cloud: ['kind', 'x', 'y', 'radius'],
  mech: ['kind', 'action', 'target'], counter: ['kind', 'name', 'op', 'value'],
  nuke: ['kind', 'x', 'y', 'power'],
  plague: ['kind', 'x', 'y', 'radius'], fire: ['kind', 'x', 'y', 'radius'], boom: ['kind', 'x', 'y', 'radius'],
  river: ['kind', 'x', 'y'], oasis: ['kind', 'x', 'y'],
};
const NUMERIC_ACT_KEYS = new Set(['x', 'y', 'power', 'count', 'radius', 'value']);
const actCanon = (a) => {
  const out = {};
  for (const k of ACT_KEY_ORDER[a.kind] ?? ['kind']) {
    if (!(k in a) || a[k] === undefined) continue;   // JS undefined → 键省略（JSON.stringify 语义）
    out[k] = NUMERIC_ACT_KEYS.has(k) ? f64h(a[k]) : a[k];
  }
  return out;
};
const lawCanon = (l) => ({
  id: l.id,
  name: l.name,
  desc: l.desc,
  enabled: l.enabled,
  createdYear: f64h(l.createdYear),
  durationYears: l.durationYears === undefined || l.durationYears === null ? null : f64h(l.durationYears),
  trigger: trigCanon(l.trigger),
  actions: l.actions.map(actCanon),
  fired: f64h(l.fired),
  lastYear: f64h(l.lastYear),
  revert: Object.entries(l.revert ?? {}).map(([k, v]) => [k, f64h(v)]),
});

// ---- 纯函数向量（无引擎）：validateCond / normalizeTrigger / normalizeLaw ----
const tfCases = [];
const pushTF = (op, name, input, expect) => tfCases.push({ op, name, input, expect });
const ccOrStr = (r) => (typeof r === 'string' ? r : condCanon(r));
const tcOrStr = (r) => (typeof r === 'string' ? r : trigCanon(r));
const lcOrNull = (r) => (r === null || r === undefined ? null : lawCanon(r));
{
  const A = (op, name, c) => pushTF('validateCond', name, c, ccOrStr(alMod.validateCond(c)));
  A(1, 'and-ok', { op: 'and', sub: [{ op: 'gt', stat: 'pop', value: 5 }, { op: 'lt', stat: 'wars', value: 1 }] });
  A(2, 'or-empty-true', { op: 'or', sub: [] });
  A(3, 'not-ok', { op: 'not', sub: { op: 'eq', stat: 'pop', value: 1 } });
  A(4, 'depth5', { op: 'not', sub: { op: 'not', sub: { op: 'not', sub: { op: 'not', sub: { op: 'not', sub: { op: 'gt', stat: 'pop', value: 1 } } } } } });
  A(5, 'non-object', 'cond string');
  A(6, 'array-input', [{ op: 'gt' }]);
  A(7, 'null-input', null);
  A(8, 'and-no-sub', { op: 'and' });
  A(9, 'and-sub5', { op: 'and', sub: [1, 2, 3, 4, 5].map((i) => ({ op: 'gt', stat: 'pop', value: i })) });
  A(10, 'and-sub-bad', { op: 'and', sub: [{ op: 'gt', stat: 'pop', value: 1 }, { op: 'bad' }] });
  A(11, 'gt-no-stat', { op: 'gt', value: 1 });
  A(12, 'gt-string-value', { op: 'gt', stat: 'pop', value: '5' });
  A(13, 'unknown-op', { op: 'xor', stat: 'pop', value: 1 });
  A(14, 'empty-op', { stat: 'pop' });
  pushTF('validateCond', 'cmp-ok-gte', { op: 'gte', stat: 'counter:k', value: 3.5 }, ccOrStr(alMod.validateCond({ op: 'gte', stat: 'counter:k', value: 3.5 })));
  // 16 全分支：and/or/not × 结构错误 × 比较五 op × 深度/类型/空 stat/非有限 value/未知 op

  const T = (name, raw) => pushTF('normalizeTrigger', name, raw, tcOrStr(alMod.normalizeTrigger(raw)));
  T('empty-default-cron', {});
  T('null-raw-cron', null);
  T('legacy-v1', { everyYears: 5, chance: 0.5, season: 2 });
  T('infer-event', { event: 'fall' });
  T('infer-cond', { cond: { op: 'gt', stat: 'year', value: 3 } });
  T('event-ok', { kind: 'event', event: 'oracle', eventCooldownYears: 7, chance: 0.3 });
  T('event-unknown', { kind: 'event', event: 'nope' });
  T('event-cd-clamp', { kind: 'event', event: 'war', eventCooldownYears: 500 });
  T('cond-missing', { kind: 'condition' });
  T('cond-bad', { kind: 'condition', cond: { op: 'bad' } });
  T('cond-ok-clamps', { kind: 'condition', everyYears: 0.4, chance: 5, season: 9, cond: { op: 'lte', stat: 'pop', value: 100 } });
  T('kind-null-stringified', { kind: null });
  T('everyyears-string', { kind: 'cron', everyYears: 'x', chance: -2, season: -1 });
  T('season-string-num', { kind: 'cron', everyYears: 3.6, season: '2' });
  T('number-raw', 42);
  // 15 全分支：默认/推断 × event/condition/cron × 钳制 × null-kind 怪癖 × Number 强转

  const L = (name, raw) => pushTF('normalizeLaw', name, raw, lcOrNull(alMod.normalizeLaw(raw)));
  L('full-valid', {
    id: 'L9', name: '条件法则', desc: 'd', enabled: true, createdYear: 2.4, durationYears: 50, fired: 3, lastYear: 2,
    trigger: { kind: 'condition', everyYears: 2, chance: 1, season: 1, cond: { op: 'gt', stat: 'pop', value: 4 } },
    actions: [{ kind: 'announce', text: 'x' }, { kind: 'counter', name: 'c', op: 'add', value: 1 }],
    revert: { 'pop.reproMul': 0.7 },
  });
  L('minimal', { id: 'L1', actions: [{ kind: 'announce', text: 'hi' }] });
  L('v1-legacy-trigger', { id: 'L2', actions: [{ kind: 'heal', radius: 3 }], trigger: { everyYears: 3, chance: 0.5, season: 1 }, fired: 9, lastYear: 4, createdYear: 1 });
  L('corrupt-trigger-fallback', { id: 'L3', actions: [{ kind: 'smite', radius: 2 }], trigger: { kind: 'lunar' }, fired: 5 });
  L('no-id', { actions: [{ kind: 'announce', text: 'x' }] });
  L('no-actions', { id: 'L4' });
  L('all-actions-unknown', { id: 'L5', actions: [{ kind: 'zap' }, 'junk', null] });
  L('mixed-actions-filter', { id: 'L6', actions: [{ kind: 'zap' }, { kind: 'nuke', power: 1 }, 42] });
  L('slices-and-clamps', { id: 'L7', name: '一二三四五六七八九十一二三四五六七八九十二十四字名', desc: '很'.repeat(130), enabled: false, durationYears: 5000, fired: -5, lastYear: 'x', createdYear: 9.6, trigger: { kind: 'cron', everyYears: 1, chance: 1, season: null }, actions: [{ kind: 'announce', text: 'ok' }] });
  L('non-object', 'law string');
  // 10 全分支：有效/最小/legacy/损坏退化 × 结构 null × 过滤 × 切片钳制
}

// ---- 系统面向量（create/update/saveRoundTrip）：每 case 独立引擎 + 手术注入 ----
function buildToolCase(spec) {
  const eng = new GameEngine(spec.baseSeed);
  epMod.resetEngineParams();
  eng.worldEvents.length = 0;
  eng.eventSeq = 1;
  eng.yearF = spec.yearF ?? 3.5;
  eng.tickCount = spec.tickCount ?? 900;
  for (const jl of spec.laws0 ?? []) eng.agentLaws.laws.push(JSON.parse(JSON.stringify(jl)));
  let maxSeq = 0;
  for (const l of eng.agentLaws.laws) { const m = /^L(\d+)$/.exec(l.id); if (m) maxSeq = Math.max(maxSeq, Number(m[1])); }
  eng.agentLaws.seq = maxSeq + 1;
  for (const [k, v] of Object.entries(spec.counters0 ?? {})) eng.agentLaws.counters[k] = v;

  const results = [];
  for (const step of spec.ops) {
    if (step.op === 'create') results.push({ err: eng.agentLaws.create(step.raw) });
    else if (step.op === 'update') results.push({ err: eng.agentLaws.update(step.id, step.patch) });
    else throw new Error(`未知工具步 ${step.op}`);
  }

  let saved = null;
  if (spec.saveRoundTrip) {
    // 存档双面直演：serialize L15305-15307（alws/alwsSeq/alwsCounters 原样落 JSON）→
    // applySave L15660-15672（new AgentLawSystem + normalizeLaw 逐行 + seq 保底 + counters 展开）
    const payload = JSON.parse(JSON.stringify({ alws: eng.agentLaws.laws, alwsSeq: eng.agentLaws.seq, alwsCounters: eng.agentLaws.counters }));
    payload.alws.push({ id: 'L99', name: '坏行', actions: [{ kind: 'nonexist_kind_x', x: 1 }], fired: 3 });
    payload.alws.push({ id: 'L98', name: 'v1 旧档行', desc: 'legacy', enabled: false, createdYear: 2, lastYear: 4, fired: 7, trigger: { everyYears: 3, chance: 0.5, season: 1 }, actions: [{ kind: 'announce', text: '旧' }] });
    const eng2 = new GameEngine(spec.baseSeed + 777);
    eng2.yearF = 9.25;
    for (const law of payload.alws) { const n = alMod.normalizeLaw(law); if (n) eng2.agentLaws.laws.push(n); }
    eng2.agentLaws.seq = Math.max(1, payload.alwsSeq ?? 1);
    eng2.agentLaws.counters = payload.alwsCounters && typeof payload.alwsCounters === 'object' ? { ...payload.alwsCounters } : {};
    saved = {
      laws: eng2.agentLaws.laws.map(lawCanon),
      seq: eng2.agentLaws.seq,
      counters: Object.entries(eng2.agentLaws.counters).map(([k, v]) => [k, f64h(v)]),
      reverts: eng2.agentLaws.laws.map((l) => ({ id: l.id, revert: Object.entries(l.revert).map(([k, v]) => [k, f64h(v)]) })),
    };
  }

  return {
    key: spec.key,
    yearF: spec.yearF ?? 3.5,
    laws0: spec.laws0 ?? [],
    counters0: spec.counters0 ?? {},
    ops: spec.ops,
    saveRoundTrip: !!spec.saveRoundTrip,
    results,
    laws: eng.agentLaws.laws.map(lawCanon),
    seq: eng.agentLaws.seq,
    counters: Object.entries(eng.agentLaws.counters).map(([k, v]) => [k, f64h(v)]),
    events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
    params: epMod.listEngineParams().map((m) => ({ path: m.path, valueHex: f64h(m.value) })),
    reverts: eng.agentLaws.laws.map((l) => ({ id: l.id, revert: Object.entries(l.revert).map(([k, v]) => [k, f64h(v)]) })),
    saved,
  };
}

const CRON_T = { kind: 'cron', everyYears: 1, chance: 1, season: null };
const toolSpecs = [
  {
    // T1 create 成功三态：legacy cron（顶层字段）+ 结构化 trigger + 事件型——id 序/纪事/缺省
    key: 'create-ok', baseSeed: 91000001, yearF: 3.5,
    ops: [
      { op: 'create', raw: { name: '天命', desc: '宣告', everyYears: 5, chance: 0.5, season: 1, actions: [{ kind: 'announce', text: '昭' }] } },
      { op: 'create', raw: { name: '结构', trigger: { kind: 'cron', everyYears: 2, chance: 0.9 }, actions: [{ kind: 'heal', radius: 3, x: 60, y: 60 }] } },
      { op: 'create', raw: { name: '哨卫', trigger: { kind: 'event', event: 'fall', eventCooldownYears: 9 }, desc: '听覆灭', actions: [{ kind: 'spawn', race: 'skeleton', count: 2 }] } },
    ],
  },
  {
    // T2 create 条件型 + 顶层 cond 推断 + param 缺省值（cur.value 兜底——getEngineParam 面）
    key: 'create-cond-param', baseSeed: 91000002, yearF: 4.5,
    ops: [
      { op: 'create', raw: { name: '-cond', everyYears: 2, cond: { op: 'and', sub: [{ op: 'gt', stat: 'pop', value: 3 }, { op: 'not', sub: { op: 'eq', stat: 'wars', value: 0 } }] }, actions: [{ kind: 'counter', name: 'cond数', op: 'add', value: 1 }] } },
      { op: 'create', raw: { name: '调参', trigger: { kind: 'cron', everyYears: 1, chance: 1 }, actions: [{ kind: 'param', path: 'fire.damage' }] } },
    ],
  },
  {
    // T3 create 错误面全分支：空名/bad trigger/空 actions/未知种族/未知地形/未知参数/
    //   mech 非法 action/counter 空 name——每错误零副作用（laws/seq/事件零增）
    key: 'create-errors', baseSeed: 91000003, yearF: 5.5,
    ops: [
      { op: 'create', raw: { name: '  ', actions: [{ kind: 'announce', text: 'x' }] } },
      { op: 'create', raw: { name: '坏触发', trigger: { kind: 'lunar' }, actions: [{ kind: 'announce', text: 'x' }] } },
      { op: 'create', raw: { name: '空动作', actions: [] } },
      { op: 'create', raw: { name: '九动作', actions: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(() => ({ kind: 'announce', text: 'x' })) } },
      { op: 'create', raw: { name: '异种', actions: [{ kind: 'spawn', race: '龙象' }] } },
      { op: 'create', raw: { name: '异地', actions: [{ kind: 'terrain', terrain: 'sky' }] } },
      { op: 'create', raw: { name: '异参', actions: [{ kind: 'param', path: 'nope.mul', value: 1 }] } },
      { op: 'create', raw: { name: '异mech', actions: [{ kind: 'mech', action: 'toggle', target: 'L1' }] } },
      { op: 'create', raw: { name: '异target', actions: [{ kind: 'mech', action: 'enable', target: 'mech1' }] } },
      { op: 'create', raw: { name: '异counter', actions: [{ kind: 'counter', name: '', op: 'add', value: 1 }] } },
      { op: 'create', raw: { name: '异天气', actions: [{ kind: 'weather', weather: 'snow' }] } },
    ],
  },
  {
    // T4 create LRU 24：26 连创（announce 最小行）——第 1 条被 remove(false) 静默挤出
    key: 'create-lru24', baseSeed: 91000004, yearF: 6.5,
    ops: Array.from({ length: 26 }, (_, i) => ({ op: 'create', raw: { name: `m${i + 1}`, actions: [{ kind: 'announce', text: `a${i + 1}` }] } })),
  },
  {
    // T5 create 切片/清洗面：30 字名 slice 24 + 130 字宣告 slice 120 + counter 名清洗
    //   （'a b:c'→'a_b_c'）+ value ±1e9 钳制
    key: 'create-slice', baseSeed: 91000005, yearF: 7.5,
    ops: [
      { op: 'create', raw: { name: '一二三四五六七八九十一二三四五六七八九十二十四字名', desc: '很'.repeat(130), actions: [{ kind: 'announce', text: '长'.repeat(130) }] } },
      { op: 'create', raw: { name: '清洗', actions: [{ kind: 'counter', name: 'a b:c', op: 'add', value: 2e9 }] } },
    ],
  },
  {
    // T6 update 基础面：更名+desc（changes 文案）+ enabled 布尔校验错误（零副作用）+ no-op 微调
    key: 'update-basic', baseSeed: 91000006, yearF: 8.5,
    laws0: [{ id: 'L1', name: '旧名', desc: '旧说', enabled: true, createdYear: 0, durationYears: null, trigger: CRON_T, actions: [{ kind: 'announce', text: 'a' }], fired: 0, lastYear: 0, revert: {} }],
    ops: [
      { op: 'update', id: 'L1', patch: { name: '新名', desc: '新说' } },
      { op: 'update', id: 'L1', patch: { enabled: 'yes' } },
      { op: 'update', id: 'L1', patch: { desc: '新说' } },
      { op: 'update', id: 'L99', patch: { name: '不存在' } },
    ],
  },
  {
    // T7 update 时效/周期/概率/季节：duration 50→null（改为永久）+ everyYears 周期文案 + chance + season
    key: 'update-fields', baseSeed: 91000007, yearF: 8.5,
    laws0: [{ id: 'L1', name: '调时', desc: 'd', enabled: true, createdYear: 0, durationYears: 50, trigger: { kind: 'cron', everyYears: 5, chance: 1, season: null }, actions: [{ kind: 'heal', radius: 2 }], fired: 0, lastYear: 0, revert: {} }],
    ops: [
      { op: 'update', id: 'L1', patch: { durationYears: 80 } },
      { op: 'update', id: 'L1', patch: { durationYears: null } },
      { op: 'update', id: 'L1', patch: { everyYears: 30 } },
      { op: 'update', id: 'L1', patch: { chance: 0.2, season: 3 } },
    ],
  },
  {
    // T8 update 触发器改道：cron→event（cd ?? 1 兜底）→event everyYears 冷却文案→event null 回 cron
    //   （everyYears undefined 键省略）→cond 设立（everyYears ?? 1——cron 10 保持）→冲突错误
    key: 'update-trigger', baseSeed: 91000008, yearF: 8.5,
    laws0: [{ id: 'L1', name: '改道', desc: 'd', enabled: true, createdYear: 0, durationYears: null, trigger: { kind: 'cron', everyYears: 10, chance: 1, season: null }, actions: [{ kind: 'announce', text: 'a' }], fired: 0, lastYear: 0, revert: {} }],
    ops: [
      { op: 'update', id: 'L1', patch: { event: 'plague' } },
      { op: 'update', id: 'L1', patch: { everyYears: 9 } },
      { op: 'update', id: 'L1', patch: { event: null } },
      { op: 'update', id: 'L1', patch: { cond: { op: 'gt', stat: 'year', value: 2 } } },
      { op: 'update', id: 'L1', patch: { event: 'war', cond: { op: 'lt', stat: 'pop', value: 9 } } },
      { op: 'update', id: 'L1', patch: { event: 'nope' } },
    ],
  },
  {
    // T9 update event→cron 回退（everyYears undefined 键省略）+ condition 型 everyYears 判定间隔文案
    key: 'update-event-cron', baseSeed: 91000009, yearF: 8.5,
    laws0: [{ id: 'L1', name: '回退', desc: 'd', enabled: true, createdYear: 0, durationYears: null, trigger: { kind: 'event', chance: 1, event: 'war', eventCooldownYears: 4 }, actions: [{ kind: 'announce', text: 'a' }], fired: 0, lastYear: 0, revert: {} }],
    ops: [
      { op: 'update', id: 'L1', patch: { event: null } },
      { op: 'update', id: 'L1', patch: { everyYears: 7 } },
    ],
  },
  {
    // T10 update 动作重铸还原 param 账本（可逆性承诺——改 actions 前先 revertParams）
    key: 'update-reforge', baseSeed: 91000010, yearF: 8.5,
    laws0: [{ id: 'L1', name: '丰饶', desc: 'd', enabled: true, createdYear: 0, durationYears: null, trigger: CRON_T, actions: [{ kind: 'param', path: 'pop.reproMul', value: 2 }], fired: 0, lastYear: 0, revert: { 'pop.reproMul': 0.7 } }],
    ops: [
      { op: 'update', id: 'L1', patch: { actions: [{ kind: 'announce', text: '改写后' }] } },
      { op: 'update', id: 'L1', patch: { actions: [{ kind: 'param', path: 'nope.x', value: 1 }] } },
    ],
  },
  {
    // T11 update 条件型 everyYears 判定间隔 + 零 side-effect 错误（未知动作在 patch 里）
    key: 'update-cond', baseSeed: 91000011, yearF: 8.5,
    laws0: [{ id: 'L1', name: '_cond', desc: 'd', enabled: true, createdYear: 0, durationYears: null, trigger: { kind: 'condition', everyYears: 2, chance: 1, season: null, cond: { op: 'gt', stat: 'pop', value: 1 } }, actions: [{ kind: 'counter', name: 'c', op: 'add', value: 1 }], fired: 0, lastYear: 0, revert: {} }],
    ops: [
      { op: 'update', id: 'L1', patch: { everyYears: 8 } },
      { op: 'update', id: 'L1', patch: { actions: [{ kind: 'zap' }] } },
    ],
  },
  {
    // T12 saveRoundTrip：create 双法则（event 型 + counter）+ 计数器 → serialize → 损坏行/v1 行
    //   混入 → applySave 归一化恢复（revert 不序列化/seq 保底/counters 展开）
    key: 'save-roundtrip', baseSeed: 91000012, yearF: 4.5, saveRoundTrip: true,
    counters0: { 岁月: 2, 战功: -1.5 },
    ops: [
      { op: 'create', raw: { name: '哨卫', trigger: { kind: 'event', event: 'fall', eventCooldownYears: 3 }, desc: '听覆灭', actions: [{ kind: 'spawn', race: 'wolf', count: 1 }] } },
      { op: 'create', raw: { name: '计数', everyYears: 1, actions: [{ kind: 'counter', name: '岁月', op: 'add', value: 2 }] } },
    ],
  },
];

const toolCases = toolSpecs.map((s) => buildToolCase(s));
const toolDet2 = toolSpecs.map((s) => buildToolCase(s));
for (let i = 0; i < toolCases.length; i++) {
  if (JSON.stringify(toolCases[i]) !== JSON.stringify(toolDet2[i])) throw new Error(`tool det 失败 ${toolCases[i].key}`);
}
console.log('toolface det 双跑字节级一致:', toolCases.map((c) => c.key).join(' '));

const out = {
  meta: {
    gen: 'gen-agentlaws.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写（法则/计数器注入）+ rngA 尾置清零起流 + agentLaws.tick() 直调步进（tickCount 不 ++）',
    rng: 'eng.rngA 单流；mulberry 纯数学反解 total',
    domains: ['agentLaws.tick L524-557', 'onEvent L562-582', 'statValue/buildStats L585-629', 'fire 39 动作 L638-875', 'remove/toggle/revertParams L496-520', 'evalCond L125-143', 'resolveRace L70-87', 'engineParams get/set', 'M-U29 工具/存档面: validateCond L94-122/normalizeTrigger L149-174/normalizeLaw L178-209/validateActions L212-310/create L341-391/update L395-493/saveRoundTrip engine.ts L15305-15307+L15660-15672'],
    sliceBoundary: 'WBB.touchMeta（槽 59）未译 no-op；validateActions 非导出经 create/update 错误路径覆盖；normalizeLaw 动作行 AS-IS 平铺拷贝（null 字段动作不在切片）',
    scenarioCount: scenarios.length,
    toolfaceCount: toolCases.length,
    toolPureCount: tfCases.length,
  },
  pure: { evalCond: pureEvalCond, resolveRace: pureResolveRace },
  scenarios,
  toolface: { cases: tfCases, systems: toolCases },
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/agentlaws.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/agentlaws.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('agentlaws.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
