// ============================================================================
// gen-war.mjs —— M-U32 切片「大战域本体：warTick + worldWarTick + wwWeaponsTick +
//   endWorldWar + devUltimateWar + wwAliveBelligerents/wwIsBelligerent + launch 八件」
//   蓝本 src/lib/game/engine.ts：
//   · warTick L7966-8053（rel< -20 三分支〔神谕止战 0.5 掷/神谕软化 +6/冻结 v-0.5
//     钳 -96〕+ 和平面〔tension 衰减 ep0.92/军国注入 ep0.06/钳 80/水位 target ±1/
//     宣战全链 p=…·aggrMul·sameRace·rrMul·catastMul→pickCasus→400 节奏阀→declareWar
//     →tension 泄压〕+ emergentWeapons 常规发射 0.12 门→fireEmergent）
//   · wwAliveBelligerents L8383-8387 / wwIsBelligerent L8390-8392
//   · devUltimateWar L8395-8438（<2 国 toast false / worldWar 全字段重置 / wwTruce
//     clear / 联盟 blocKept 门 / declareWar force·total·quiet / shake 10 / addEvent+toast）
//   · worldWarTick L8441-8526（自然引燃〔400 冷却+sinceEnd 1600+三形态+armed≥2+
//     yearF>80+0.16 掷〕/ alive≤1 终局 / 联盟终局 cohesion+15 / 停战到期重燃
//     resumed+0.6 播报 / 战端重燃双循环〔阵营门+wwFrenzy≤3 盟约撕裂〕/ wwWeaponsTick）
//   · wwWeaponsTick L8530-8621（frenzy 播报去重 / antiMatter CD1200 0.12 / orbital
//     0.08·rate / plasma 0.12·rate / drone 0.16·rate / laser 0.3·rate / nuke CD600
//     0.06·rate / 常规导弹 armament≥5 0.06·rate / bomber 0.08·rate / artillery
//     0.25·rate / emergent cadence 0.11·rate·WC_POWER[q[3]] break）
//   · endWorldWar L8624-8646（divine/winner/null 三分支）
//   · launch 八件 L9447-9554（artillery〔buildings 选 1+fx dmg/fire 4 掷+0.25 音效掷〕/
//     airstrike / missile〔nukePower r/dmg 分叉〕/ laser〔12 采样军职加权 2 掷/采〕/
//     droneSwarm / orbital〔0.5 音效掷〕/ plasma / antimatter——全 fx 弹道实体）
//   切片边界（挂账注记）：devWwTruce/devWwResume/devWwEnd L8648-8693（开发者面板件，
//     依赖 makePeace→settleFront 战线域——战线域未译，TickOrch 无槽无生产者，留挂账）；
//     statsTick L13568（worldWarTick→statsTick 调用点——双侧不记协议，no-op 注记）；
//     WBB.touchMeta（槽 59 前半 no-op——warTick L7967/worldWarTick L8442 调用点）；
//     launchMech L9557（非 wwWeaponsTick callee——机甲域挂账）。
// 直接 import 现役 src/lib/game/engine.ts + types.ts（真实现，非复制）。
// 夹具 = 手术式字段直写（gen-emergentfire M-U31 协议扩展）：GameEngine(baseSeed) 后
//   瞬态层清零 + civs〔扩 militarism〕/rel/met/tension/totalWars/warData/warHistory/
//   lastDeclareAt/wwTruce/warShame/lastCatastrophe/alliances/武器池/worldWar 手术注入
//   + spawnUnit 真调用（trait:'' 钉死）+ rngA 尾置清零起流 → ops 逐步直调（wt/wwt/
//   endww/devww/launch——系统结算不经母体编排）+ 每步快照（rngA/rel/tension/totalWars/
//   warData canonical/warHistory/wwTruce/lastDeclareAt/met 序/fx 全字段/events/toasts/
//   worldWar 全计数/weapons canonical/gold/shake/statWars/冷却四 tick/units dead 面）。
// 掷数核账：fx() 内嵌 2 掷（seed/dir——M-U30 教训 a）；chainDraws 反解自动核账。
// det 双跑字节级（M-U28 协议①）。
//
// 运行：bun scripts/unity-migration/gen-war.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/war.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/war.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 gen-emergentfire.mjs） ----
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
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));

// ---- 工具（同 gen-emergentfire） ----
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

function chainDraws(state0, finalState) {
  const step = (a) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return a;
  };
  let a = state0 | 0;
  if ((state0 >>> 0) === (finalState >>> 0)) return 0;
  for (let k = 0; k < 5_000_000; k++) {
    a = step(a);
    if ((a >>> 0) === (finalState >>> 0)) return k + 1;
  }
  throw new Error('rng 链未达终态——协议失效');
}

// ---- canonical（行协议） ----
function weaponCanon(w) {
  return {
    id: w.id, civ: w.civ, name: w.name, gen: w.gen, dtype: w.dtype, delivery: w.delivery,
    dmg: f64hex(w.dmg), radius: f64hex(w.radius), fire: f64hex(w.fire),
    rad: !!w.rad, terra: !!w.terra, morale: w.morale, wonder: !!w.wonder,
    kills: w.kills, fired: w.fired, parent: w.parent ?? null,
    parent2: w.parent2 ?? null, bornYear: w.bornYear, retired: !!w.retired,
    pl: w.pl ?? null, dl: w.dl ?? null, gd: w.gd ?? null, pw: w.pw ?? null,
    q: w.q ? w.q.map(f64hex) : null, inter: w.inter ?? null,
  };
}
function warDataCanon(wd) {
  return {
    key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick, startYear: wd.startYear,
    total: !!wd.total, scoreA: wd.scoreA, scoreB: wd.scoreB,
    exA: wd.exA, exB: wd.exB, casA: wd.casA, casB: wd.casB,
    razedA: wd.razedA, razedB: wd.razedB, battles: wd.battles,
    giveUpAt: wd.giveUpAt ?? 0, reason: wd.reason, reasonText: wd.reasonText,
    aggressor: wd.aggressor, goal: wd.goal, goalNow: wd.goalNow,
    occA: wd.occA, occB: wd.occB, popA0: wd.popA0, popB0: wd.popB0,
    lastActiveTick: wd.lastActiveTick,
  };
}
const worldWarCanon = (ww) => ({
  phase: ww.phase, startTick: ww.startTick, startYear: ww.startYear, endTick: ww.endTick,
  belligerents: [...ww.belligerents],
  pop0: Object.keys(ww.pop0 ?? {}).sort((x, y) => +x - +y).map((k) => [k, ww.pop0[k]]),
  kills: ww.kills, fallen: ww.fallen.map((f) => [f.id, f.name, f.colorHex]),
  truces: ww.truces, nukes: ww.nukes, lasers: ww.lasers, drones: ww.drones,
  orbitals: ww.orbitals, plasmas: ww.plasmas, antimatters: ww.antimatters,
  emerged: ww.emerged, winner: ww.winner ?? null, endText: ww.endText ?? '',
});
function fxCanon(e) {
  return {
    kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), x0: f64hex(e.x0), y0: f64hex(e.y0),
    r: f64hex(e.r), ttl: f64hex(e.ttl), age: e.age,
    src: e.src ?? null, dmg: e.dmg !== undefined ? f64hex(e.dmg) : null,
    fire: e.fire ?? null, wid: e.wid ?? null, col: e.col ?? null,
    nuke: e.nuke ?? null, quiet: !!e.quiet, text: e.text ?? null,
  };
}

// ---- 手术式夹具构建 + ops 逐步直调 + 每步快照 ----
function buildScenario(spec, opts = {}) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零
  eng.terrain.fill(T.GRASS);
  eng.units.length = 0;
  eng.unitById.clear();
  eng.effects.length = 0;
  eng.worldEvents.length = 0;
  eng.eventSeq = 1;
  eng.civs.length = 0;
  eng.warData.clear();
  eng.families.clear();
  eng.dynRaces.clear();
  eng.armies.length = 0;
  eng.buildings.length = 0;
  eng.radiate.fill(0);
  eng.radSet.clear();
  eng.met.clear();
  eng.totalWars.clear();
  eng.tension.clear();
  eng.warShame.clear();
  eng.warHistory.length = 0;
  eng.lastDeclareAt.clear();
  eng.wwTruce.clear();
  eng.alliances.length = 0;
  eng.allianceOf.clear();
  eng.yearF = spec.yearF;
  eng.tickCount = spec.tickCount;
  eng.laws.wars = spec.lawsWars !== false;          // 缺省 true（S1/S2 神谕止战面 false）
  eng.lastCatastrophe = { ...(spec.catast ?? { x: -1, y: -1, tick: -999999 }) };
  eng.wwIgniteTick = spec.wwIgniteTick0 ?? -400;
  eng.wwLastNukeTick = spec.wwLastNukeTick0 ?? -600;
  eng.wwLastAntiTick = spec.wwLastAntiTick0 ?? -1200;
  eng.wwFrenzyAnnounced = spec.wwFrenzyAnnounced0 ?? -1;
  eng.statWars = 0;
  eng.toastSeq = 1;
  // toasts 收集器（toast 本体不存储——onToast 回调面）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ text: t.text, tone: t.tone });

  // civ 注入（warTick 触面：militarism/gold/pop/tiles/capital/race/colorHex）
  for (const c of spec.civs) {
    eng.civs.push({
      id: c.id, name: c.name, colorHex: c.colorHex, alive: c.alive !== false,
      pop: c.pop ?? 0, gold: c.gold ?? 0, techs: [...(c.techs ?? [])],
      capital: c.capital ?? -1, tiles: [...(c.tiles ?? [])], frontier: [], ideas: null,
      race: c.race ?? R.HUMAN, militarism: c.militarism ?? 30,
    });
  }
  // rel / met / tension / totalWars / warShame / warHistory / lastDeclareAt / wwTruce 注入
  for (const [k, v] of spec.rel ?? []) eng.rel.set(k, v);
  for (const k of spec.met0 ?? []) eng.met.add(k);
  for (const [k, v] of spec.tension0 ?? []) eng.tension.set(k, v);
  for (const k of spec.totalWars0 ?? []) eng.totalWars.add(k);
  for (const [k, v] of spec.warShame0 ?? []) eng.warShame.set(k, v);
  eng.warHistory.push(...(spec.warHistory0 ?? []));
  for (const [k, v] of spec.lastDeclareAt0 ?? []) eng.lastDeclareAt.set(k, v);
  for (const [k, v] of spec.wwTruce0 ?? []) eng.wwTruce.set(k, v);
  // warData 注入（EnsureWarData 形状——手术覆写 giveUpAt/reason 等触发面）
  for (const wd0 of spec.warData0 ?? []) {
    eng.warData.set(wd0.key, {
      key: wd0.key, a: wd0.a, b: wd0.b, startTick: wd0.startTick ?? spec.tickCount,
      startYear: wd0.startYear ?? Math.floor(spec.yearF), total: !!wd0.total,
      scoreA: wd0.scoreA ?? 0, scoreB: wd0.scoreB ?? 0, exA: 0, exB: 0, casA: 0, casB: 0,
      razedA: 0, razedB: 0, battles: 0, giveUpAt: wd0.giveUpAt ?? 0,
      reason: wd0.reason ?? 'border', reasonText: wd0.reasonText ?? '',
      aggressor: wd0.aggressor ?? wd0.a, goal: wd0.goal ?? 0, goalNow: 0,
      occA: 0, occB: 0, popA0: wd0.popA0 ?? 0, popB0: wd0.popB0 ?? 0,
      lastActiveTick: wd0.lastActiveTick ?? spec.tickCount,
    });
  }
  // 联盟注入（阵营终局/撕裂面）
  for (const al of spec.alliances0 ?? []) {
    eng.alliances.push(JSON.parse(JSON.stringify(al)));
    for (const m of al.members) eng.allianceOf.set(m, al.id);
  }
  // 武器池（emergent 常规发射面）
  for (const w of spec.weapons0 ?? []) eng.emergentWeapons.set(w.id, JSON.parse(JSON.stringify(w)));
  eng.weapSeq = spec.weapSeq0 ?? 1;
  // 建筑注入（artillery/laser 目标面）
  for (const b of spec.buildings0 ?? []) eng.buildings.push({ ...b, hp: 100, level: 1 });
  // worldWar 注入（整体覆写——duck typing）
  if (spec.worldWar0) eng.worldWar = JSON.parse(JSON.stringify(spec.worldWar0));
  else if (spec.wwIdle) eng.worldWar = GameEngine.IDLE_WORLD_WAR();

  // spawn 真调用（掷数不计——rngA 尾置；trait:'' 钉死）
  const spawn0 = [];
  for (const sp of spec.spawn ?? []) {
    const u = eng.spawnUnit(sp.race, sp.x, sp.y, { silent: true, civ: sp.civ, job: sp.job, trait: '' });
    if (!u || u.dead) throw new Error(`S${spec.key}: spawn 失败 race=${sp.race}@${sp.x},${sp.y}`);
    spawn0.push({ race: sp.race, x: f64hex(u.x), y: f64hex(u.y), civ: sp.civ ?? -1, job: sp.job ?? 0, id: u.id });
  }

  // 手术二（尾置）：rngA 清零起流 → ops 逐步直调 + 每步快照
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (const op of spec.ops) {
    switch (op.op) {
      case 'wt': eng.warTick(); break;                                        // warTick L7966
      case 'wwt': eng.worldWarTick(); break;                                  // worldWarTick L8441
      case 'endww':                                                           // endWorldWar L8624
        eng.endWorldWar(op.winner === null ? null : eng.civs[op.winner], !!op.divine);
        break;
      case 'devww': eng.devUltimateWar(); break;                              // devUltimateWar L8395
      case 'wwalive': eng.wwAliveBelligerents(); break;                       // 纯读——快照面校验
      case 'fire':                                                            // fireEmergent（S6 内嵌面）
        eng.fireEmergent(eng.civs[op.civ], eng.emergentWeapons.get(op.wid));
        break;
      case 'launch': {                                                        // launch 八件直调
        const c = eng.civs[op.civ];
        const foe = op.foe !== undefined ? eng.civs[op.foe] : null;
        if (op.fn === 'artillery') eng.launchArtillery(c, foe);
        else if (op.fn === 'airstrike') eng.launchAirstrike(c, op.tx, op.ty);
        else if (op.fn === 'missile') eng.launchMissile(c, op.tx, op.ty, op.nukePower ?? 0);
        else if (op.fn === 'laser') eng.launchLaser(c, foe);
        else if (op.fn === 'drone') eng.launchDroneSwarm(c, op.tx, op.ty);
        else if (op.fn === 'orbital') eng.launchOrbital(c, op.tx, op.ty);
        else if (op.fn === 'plasma') eng.launchPlasma(c, op.tx, op.ty);
        else if (op.fn === 'antimatter') eng.launchAntimatter(c, op.tx, op.ty);
        else throw new Error(`S${spec.key}: 未知 launch ${op.fn}`);
        break;
      }
      default:
        throw new Error(`S${spec.key}: 未知 op ${op.op}`);
    }
    // 每步快照（canonical）
    steps.push({
      op: op.op + (op.fn ? `:${op.fn}` : '') + (op.wid !== undefined ? `:${op.wid}` : '') + (op.winner !== undefined ? `:${op.winner}` : ''),
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      rel: [...eng.rel.entries()].map(([k, v]) => [k, f64hex(v)]),
      tension: [...eng.tension.entries()].map(([k, v]) => [k, v]),
      totalWars: [...eng.totalWars],
      met: [...eng.met],
      warHistory: [...eng.warHistory],
      lastDeclareAt: [...eng.lastDeclareAt.entries()].map(([k, v]) => [k, v]),
      wwTruce: [...eng.wwTruce.entries()].map(([k, v]) => [k, v]),
      warShame: [...eng.warShame.entries()],
      warData: [...eng.warData.values()].map(warDataCanon),
      fxCount: eng.effects.length,
      fx: eng.effects.map(fxCanon),
      events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
      toasts: [...toasts],
      worldWar: worldWarCanon(eng.worldWar),
      weapons: [...eng.emergentWeapons.values()].map(weaponCanon),
      gold: eng.civs.map((c) => f64hex(c.gold ?? 0)),
      shake: f64hex(eng.shake ?? 0),
      statWars: eng.statWars,
      wwIgniteTick: eng.wwIgniteTick,
      wwLastNukeTick: eng.wwLastNukeTick,
      wwLastAntiTick: eng.wwLastAntiTick,
      wwFrenzyAnnounced: eng.wwFrenzyAnnounced,
      deadCount: eng.units.filter((u) => u.dead).length,
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
  if (spec.sanity && !opts?.ignoreSanity && !spec.sanity(eng)) throw new Error(`S${spec.key}: sanity 未过`);

  return {
    key: spec.key,
    name: spec.name,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    yearF: spec.yearF,
    tickCount: spec.tickCount,
    lawsWars: spec.lawsWars !== false,
    civs: spec.civs,
    rel: spec.rel ?? [],
    met0: spec.met0 ?? [],
    tension0: spec.tension0 ?? [],
    totalWars0: spec.totalWars0 ?? [],
    warShame0: spec.warShame0 ?? [],
    warHistory0: spec.warHistory0 ?? [],
    lastDeclareAt0: spec.lastDeclareAt0 ?? [],
    wwTruce0: spec.wwTruce0 ?? [],
    warData0: spec.warData0 ?? [],
    alliances0: spec.alliances0 ?? [],
    weapons0: spec.weapons0 ?? [],
    weapSeq0: spec.weapSeq0 ?? 1,
    buildings0: spec.buildings0 ?? [],
    worldWar0: spec.worldWar0 ?? null,
    wwIdle: !!spec.wwIdle,
    catast: spec.catast ?? null,
    wwIgniteTick0: spec.wwIgniteTick0 ?? -400,
    wwLastNukeTick0: spec.wwLastNukeTick0 ?? -600,
    wwLastAntiTick0: spec.wwLastAntiTick0 ?? -1200,
    wwFrenzyAnnounced0: spec.wwFrenzyAnnounced0 ?? -1,
    spawn: spawn0,
    ops: spec.ops,
    totalDraws,
    steps,
  };
}

// ============================================================================
// 场景册
// ============================================================================
const scenarios = [];

// 基础武器池（v2 架构——继承 gen-emergentfire 协议）
const W_HYPER = (id, civ, over = {}) => ({
  id, civ, name: `超导·轨道·量子·焚天${id}`, gen: 2, dtype: 2, delivery: 4,
  dmg: 120.5, radius: 3.2, fire: 0.35, rad: false, terra: false, morale: 0,
  wonder: false, kills: 0, fired: 0, parent: null, bornYear: 50, retired: false,
  pl: 5, dl: 4, gd: 4, pw: 3, q: [1.05, 1.1, 0.95, 1.0], inter: 0, ...over,
});
// 大战状态（running 形状——devUltimateWar L8402-8421 全字段）
const WW_RUN = (over = {}) => ({
  phase: 'running', startTick: 4000, startYear: 78, endTick: 0, belligerents: [0, 1],
  pop0: { 0: 20, 1: 15 }, kills: 3, fallen: [], truces: 0, nukes: 0, lasers: 0,
  drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 0, winner: null, endText: '', ...over,
});

// S1 warTick 神谕止战全链（laws.wars=false + rel<-20 + warData/totalWars 预注入）
//   步1：rng<0.5 → 停战（rel=30/totalWars 删/warData 删/toast+addEvent peace）——1 掷
//   步2：v=30≥-20 和平面（宣战门 laws.wars 假短路——零掷）
scenarios.push({
  key: 'S1', name: 'wt-divine-peace',
  baseSeed: 32101, seed: 0x1100001, yearF: 80.25, tickCount: 5000, lawsWars: false,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 60 * 120 + 80, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30 },
  ],
  rel: [['0-1', -50]],
  met0: ['0-1'],
  totalWars0: ['0-1'],
  warData0: [{ key: '0-1', a: 0, b: 1, scoreA: 12, scoreB: 4, reason: 'border', aggressor: 0, goal: 8 }],
  ops: [{ op: 'wt' }, { op: 'wt' }],
  // 终态：wt1 停战 rel=30 + wt2 和平面水位 +1 = 31（target 水位门）
  sanity: (eng) => eng.rel.get('0-1') === 31 && eng.totalWars.size === 0 && eng.warData.size === 0,
});

// S2 warTick 神谕软化（laws.wars=false + rng≥0.5 → rel+6）×2 步
scenarios.push({
  key: 'S2', name: 'wt-divine-soften',
  baseSeed: 32102, seed: 0xE100005, yearF: 80.25, tickCount: 5000, lawsWars: false,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, militarism: 30 },
  ],
  rel: [['0-1', -50]],
  met0: ['0-1'],
  ops: [{ op: 'wt' }, { op: 'wt' }],
  sanity: (eng) => eng.rel.get('0-1') === -38 && eng.worldEvents.length === 0 && eng.totalWars.size === 0,
});

// S3 warTick 冻结 + 钳面（laws.wars=true + totalWars.has → max(-96, v-0.5)）
//   键1：v=-50 → 步1 -50.5 → 步2 -51.0；键2：v=-95.8 → -96.3 钳 -96 恒——零掷步
scenarios.push({
  key: 'S3', name: 'wt-freeze-clamp',
  baseSeed: 32103, seed: 0x2100003, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 4, capital: -1, militarism: 30 },
  ],
  rel: [['0-1', -50], ['0-2', -95.8]],
  met0: ['0-1', '0-2'],
  totalWars0: ['0-1', '0-2'],
  ops: [{ op: 'wt' }, { op: 'wt' }],
  // 终态：步1 -50.5 → 步2 -51.0（两步冻结）；0-2 钳 -96 恒
  sanity: (eng) => eng.rel.get('0-1') === -51 && eng.rel.get('0-2') === -96,
  allowZeroDraws: true,
});

// S4 warTick 和平面三键（tension 衰减 ep0.92/军国注入 ep0.06/钳 80/水位 target ±1）
//   键1 rel=10（v<target → +1）；键2 rel=70（v>target+8 → -1 过热回冷）；
//   键3 rel=45 + 双国 militarism 60（milPair=120>105 → ten 注入 (120-105)*0.06=0.9）
//   ——零掷面（宣战门 v<45 键1 边界：45<45 假；键3 rel=45 → v<45 假短路）
scenarios.push({
  key: 'S4', name: 'wt-peace-drift',
  baseSeed: 32104, seed: 0x3100004, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, militarism: 60 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, militarism: 60 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 4, capital: -1, militarism: 30 },
  ],
  rel: [['0-1', 45], ['0-2', 10], ['1-2', 70]],
  met0: ['0-1', '0-2', '1-2'],
  tension0: [['0-1', 20], ['0-2', 0], ['1-2', 0]],
  ops: [{ op: 'wt' }, { op: 'wt' }],
  // 终态：0-1 45→44→43（两步回冷）；0-2 10→11→12；1-2 70→69→68；
  // tension 0-1：20*0.92+0.9=19.3 → 19.3*0.92+0.9=18.656；宣战门 0-2 v<45 进（每步 1 掷未中）
  sanity: (eng) => eng.rel.get('0-1') === 43 && eng.rel.get('0-2') === 12
    && eng.rel.get('1-2') === 68 && Math.abs(eng.tension.get('0-1') - 18.656) < 1e-9,
});

// S5 warTick 宣战全链（p 命中 → pickCasus border → 400 阀过 → declareWar → 泄压）
//   掷序：0.008+ten*0.0011+mil*0.00007 ≈ 0.008+0.023+0.0042≈0.035×aggrMul×sameRace×
//   rrMul×catastMul ≈ 0.035×0.7×1×1×1 ≈ 0.0245——seed 首掷需 <p：试跑核账；
//   pickCasus：warShame 无 → 挑起方比较 2 掷 → ratio/greed 门（border 直落）；
//   declareWar：零掷（无联盟）+ gold 扣/warData/totalWars add(border 不 immortal→不 add)/
//   warHistory push/lastDeclareAt set/tension 泄压。
scenarios.push({
  key: 'S5', name: 'wt-declare-border',
  baseSeed: 32105, seed: 0x4100010, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 60 * 120 + 80, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30 },
  ],
  rel: [['0-1', 40]],
  met0: ['0-1'],
  tension0: [['0-1', 40]],
  ops: [{ op: 'wt' }],
  sanity: (eng) => eng.warData.size === 1 && eng.warHistory.length === 1
    && eng.lastDeclareAt.size === 1,
});

// S6 warTick emergent 常规发射（0.12 门命中 → fireEmergent M-U31 译件全链）
scenarios.push({
  key: 'S6', name: 'wt-emergent-fire',
  baseSeed: 32106, seed: 0x5100006, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 60 * 120 + 80, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30 },
  ],
  rel: [['0-1', -80]],
  met0: ['0-1'],
  weapons0: [W_HYPER(1, 0)],
  weapSeq0: 2,
  ops: [{ op: 'wt' }],
  sanity: (eng) => eng.emergentWeapons.get(1).fired === 1 && eng.effects.length > 0,
});

// S7 worldWarTick 自然引燃全门（idle→引燃→devUltimateWar→2 对互宣 force 零掷）
//   掷序：0.16 门 1 掷 → devUltimateWar（declareWar×3 对零掷〔3 国 i<j〕——blocKept=0）
scenarios.push({
  key: 'S7', name: 'ww-ignite',
  baseSeed: 32107, seed: 0x610000B, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 60 * 120 + 80, militarism: 30, techs: ['gunpowder'] },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30, techs: ['gunpowder'] },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 4, capital: 40 * 120 + 40, militarism: 30, techs: ['gunpowder'] },
  ],
  rel: [['0-1', -50], ['0-2', -50]],
  met0: ['0-1', '0-2'],
  // 三形态①多线开战：activeWars≥2——warData 预注入两键
  warData0: [
    { key: '0-1', a: 0, b: 1, reason: 'border', aggressor: 0, goal: 8, startTick: 4600 },
    { key: '0-2', a: 0, b: 2, reason: 'border', aggressor: 0, goal: 8, startTick: 4700 },
  ],
  ops: [{ op: 'wwt' }],
  sanity: (eng) => eng.worldWar.phase === 'running' && eng.worldWar.belligerents.length === 3,
});

// S8 worldWarTick 冷却早退（ended 近期 endTick=tick-800 → sinceEnd<1600 → 0 掷）
scenarios.push({
  key: 'S8', name: 'ww-ignite-cooldown',
  baseSeed: 32108, seed: 0x7100008, yearF: 80.25, tickCount: 5000, wwIdle: true,
  worldWar0: { ...WW_RUN({ belligerents: [0, 1], pop0: { 0: 20, 1: 15 } }), phase: 'ended', endTick: 4200, endText: '旧战' },
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, militarism: 30, techs: ['gunpowder'] },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, militarism: 30, techs: ['gunpowder'] },
  ],
  ops: [{ op: 'wwt' }],
  sanity: (eng) => eng.worldWar.phase === 'ended' && eng.worldWar.endTick === 4200,
  allowZeroDraws: true,
});

// S9 worldWarTick 终局（alive=1 → endWorldWar(winner) 胜者分支）
scenarios.push({
  key: 'S9', name: 'ww-end-winner',
  baseSeed: 32109, seed: 0x8100009, yearF: 90.5, tickCount: 8000, wwIdle: true,
  worldWar0: WW_RUN({ startTick: 4000, belligerents: [0, 1], pop0: { 0: 20, 1: 0 } }),
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 0, gold: 6, alive: false, capital: -1, militarism: 30 },
  ],
  ops: [{ op: 'wwt' }],
  sanity: (eng) => eng.worldWar.phase === 'ended' && eng.worldWar.winner === 0,
  allowZeroDraws: true,
});

// S10 worldWarTick 终局（alive=0 → endWorldWar(null) 同归于尽分支）
scenarios.push({
  key: 'S10', name: 'ww-end-all',
  baseSeed: 32110, seed: 0x910000A, yearF: 90.5, tickCount: 8000, wwIdle: true,
  worldWar0: WW_RUN({ belligerents: [0, 1] }),
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 0, gold: 40, alive: false, capital: -1, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 0, gold: 6, alive: false, capital: -1, militarism: 30 },
  ],
  ops: [{ op: 'wwt' }],
  sanity: (eng) => eng.worldWar.phase === 'ended' && eng.worldWar.winner === null,
  allowZeroDraws: true,
});

// S11 worldWarTick 停战到期重燃（wwTruce 到期键 → declareWar force → resumed + 0.6 播报掷）
scenarios.push({
  key: 'S11', name: 'ww-truce-resume',
  baseSeed: 32111, seed: 0xA10000B, yearF: 90.5, tickCount: 8000, wwIdle: true,
  worldWar0: WW_RUN(),
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, militarism: 30 },
  ],
  rel: [['0-1', 30]],
  met0: ['0-1'],
  wwTruce0: [['0-1', 7900]],
  ops: [{ op: 'wwt' }],
  sanity: (eng) => eng.wwTruce.size === 0 && eng.warData.size === 1 && eng.atWar(0, 1),
});

// S12 worldWarTick 战端重燃 + 终局狂热盟约撕裂（alive=3 frenzy + A-B 同盟 → dissolveAlliance）
//   wwWeaponsTick 面：三国 techs 空 → tm 全 0 → continue 零掷
scenarios.push({
  key: 'S12', name: 'ww-reignite-frenzy',
  baseSeed: 32112, seed: 0xB10000C, yearF: 90.5, tickCount: 8000, wwIdle: true,
  worldWar0: WW_RUN({ belligerents: [0, 1, 2], pop0: { 0: 20, 1: 15, 2: 12 } }),
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 4, capital: -1, militarism: 30 },
  ],
  rel: [['0-1', 30], ['0-2', 30], ['1-2', 30]],
  met0: ['0-1', '0-2', '1-2'],
  alliances0: [{ id: 1, name: '北境同盟', members: [0, 1], leader: 0, cohesion: 60, formedTick: 1000, formedYear: 10, warsTogether: 0, colorHex: '#88aaff' }],
  ops: [{ op: 'wwt' }],
  sanity: (eng) => eng.alliances.length === 0 && eng.warData.size === 3,
  allowZeroDraws: true,
});

// S13 worldWarTick 联盟终局（alive 2 国同属一盟 → 阵营胜利 cohesion+15）
scenarios.push({
  key: 'S13', name: 'ww-alliance-victory',
  baseSeed: 32113, seed: 0xC10000D, yearF: 90.5, tickCount: 8000, wwIdle: true,
  worldWar0: WW_RUN(),
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, militarism: 30 },
  ],
  alliances0: [{ id: 1, name: '东海誓约', members: [0, 1], leader: 0, cohesion: 50, formedTick: 1000, formedYear: 10, warsTogether: 2, colorHex: '#88aaff' }],
  ops: [{ op: 'wwt' }],
  sanity: (eng) => eng.worldWar.phase === 'ended' && eng.worldWar.winner === 0
    && eng.alliances[0].cohesion === 65,
  allowZeroDraws: true,
});

// S14 launch 基础串（airstrike/missile 核常双态/drone/plasma/antimatter 零掷面+orbital 0.5 音效掷）
//   掷序：airstrike fx 2 + missile(nuke0) fx 2 + missile(1.8) fx 2 + drone fx 2
//        + orbital 0.5 掷 1 +〔真〕无 fx（音效 no-op）+ plasma fx 2 + antimatter fx 2 = 13 掷
scenarios.push({
  key: 'S14', name: 'launch-basic',
  baseSeed: 32114, seed: 0xD10000E, yearF: 90.5, tickCount: 8000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 60 * 120 + 80, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30 },
  ],
  ops: [
    { op: 'launch', fn: 'airstrike', civ: 0, tx: 100.5, ty: 60.5 },
    { op: 'launch', fn: 'missile', civ: 0, tx: 100.5, ty: 60.5, nukePower: 0 },
    { op: 'launch', fn: 'missile', civ: 0, tx: 100.5, ty: 60.5, nukePower: 1.8 },
    { op: 'launch', fn: 'drone', civ: 0, tx: 100.5, ty: 60.5 },
    { op: 'launch', fn: 'orbital', civ: 0, tx: 100.5, ty: 60.5 },
    { op: 'launch', fn: 'plasma', civ: 0, tx: 100.5, ty: 60.5 },
    { op: 'launch', fn: 'antimatter', civ: 0, tx: 100.5, ty: 60.5 },
  ],
});

// S15 launchArtillery（buildings 选 1 掷 + dmg 1 + fire 1 + fx 2 + 0.25 音效掷 = 6 掷/发）
//   第二发贴脸（bestD<6 → return——buildings 选 1 掷后退）
scenarios.push({
  key: 'S15', name: 'launch-artillery',
  baseSeed: 32115, seed: 0xE10000F, yearF: 90.5, tickCount: 8000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 40 * 120 + 40, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30 },
  ],
  buildings0: [
    { x: 44, y: 44, civ: 0, kind: 'tower' },
    { x: 102, y: 62, civ: 1, kind: 'house' },
  ],
  ops: [
    { op: 'launch', fn: 'artillery', civ: 0, foe: 1 },
    { op: 'launch', fn: 'artillery', civ: 0, foe: 1 },
  ],
});

// S18 launchArtillery 单位回退 + 空目标早退（foeBuilds 空 → units.find → fx；
//   第三步 foe 无单位无建筑 → tx<0 return——零掷）
scenarios.push({
  key: 'S18', name: 'launch-artillery-units',
  baseSeed: 32118, seed: 0x1A00112, yearF: 90.5, tickCount: 8000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 40 * 120 + 40, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30 },
  ],
  spawn: [{ race: R.HUMAN, x: 100.5, y: 60.5, civ: 1, job: 0 }],
  buildings0: [{ x: 44, y: 44, civ: 0, kind: 'tower' }],
  ops: [
    { op: 'launch', fn: 'artillery', civ: 0, foe: 1 },   // 单位目标面：fx shell（5 掷）
    { op: 'launch', fn: 'artillery', civ: 0, foe: 1 },   // 炮位贴脸门？——目标单位 (100.5,60.5) vs 炮位 (44,44)——d>6 发射
  ],
});

// S16 launchLaser（12 采样×2 掷 + fx 2——军职加权狙杀；无目标 return 变体： foe 无单位 → tgt null）
scenarios.push({
  key: 'S16', name: 'launch-laser',
  baseSeed: 32116, seed: 0xF100010, yearF: 90.5, tickCount: 8000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 40 * 120 + 40, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30 },
  ],
  spawn: [
    { race: R.HUMAN, x: 100.5, y: 60.5, civ: 1, job: 2 },
    { race: R.HUMAN, x: 101.5, y: 61.5, civ: 1, job: 0 },
  ],
  buildings0: [{ x: 44, y: 44, civ: 0, kind: 'tower' }],
  ops: [
    { op: 'launch', fn: 'laser', civ: 0, foe: 1 },
    { op: 'launch', fn: 'laser', civ: 0, foe: 1 },
  ],
});

// S17 wwWeaponsTick 全武器链（worldWarTick 经 wwWeaponsTick：civ0 explosives+atomic+flight
//   → nuke 分支 CD 过 → 0.06 掷 → launchMissile(nuke1.8) continue；civ1 explosives →
//   nuke 跳（tm.nukeCap=0）→ 常规导弹 armamentOf≥5 → 0.06 掷 → launchMissile(0) continue；
//   第二步 wwt：nuke CD 600 未过（tick 差 30<600）→ 假 → 常规导弹 0.06 → bomber 0.08 →
//   artillery 0.25 → launchArtillery 5 掷；emergent 循环 weapons0 无 → 零掷）
scenarios.push({
  key: 'S17', name: 'ww-weapons-chain',
  baseSeed: 32117, seed: 0x0A00111, yearF: 90.5, tickCount: 8000, wwIdle: true,
  worldWar0: WW_RUN({ startTick: 7900 }),
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 40 * 120 + 40, militarism: 30, techs: ['explosives', 'atomic', 'flight'] },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 100 * 120 + 60, militarism: 30, techs: ['explosives'] },
  ],
  buildings0: [
    { x: 98, y: 60, civ: 1, kind: 'house' },
    { x: 44, y: 44, civ: 0, kind: 'tower' },
  ],
  ops: [{ op: 'wwt' }, { op: 'wwt' }],
  sanity: (eng) => eng.worldWar.nukes === 1 && eng.effects.length >= 2,
});

// ============================================================================
// runner（det 双跑字节级 + 双写）——bun run 直跑；import 探针只取 buildScenario
// ============================================================================
export { buildScenario, scenarios };

if (import.meta.main) {
const golden = scenarios.map(buildScenario);

// det 双跑（M-U28 协议①：同 seed 重跑逐字节 diff）
function runAll(list) {
  return JSON.stringify(list.map((s) => s.steps));
}
const pass1 = runAll(golden);
const golden2 = scenarios.map(buildScenario);
const pass2 = runAll(golden2);
if (pass1 !== pass2) {
  for (let i = 0; i < golden.length; i++) {
    if (JSON.stringify(golden[i].steps) !== JSON.stringify(golden2[i].steps)) {
      throw new Error(`det 双跑失配: S${golden[i].key}`);
    }
  }
  throw new Error('det 双跑失配（未定位）');
}

const out = { meta: { manifest: scenarios.map((s) => s.key), name: 'war', slice: 'M-U32', totalDraws: golden.map((g) => g.totalDraws) }, scenarios: golden };
const json = JSON.stringify(out);
const p1 = path.join(ROOT, 'scripts/unity-migration/golden/war.json');
const p2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/war.json');
writeFileSync(p1, json);
writeFileSync(p2, json);
const draws = golden.map((g) => `S${g.key}=${g.totalDraws}`).join(' ');
console.log(`gen-war OK: ${golden.length} 场景 det 双跑字节级一致 | ${json.length} bytes | md5=${md5hex(Buffer.from(json))}`);
console.log(`掷数核账: ${draws}`);
}
