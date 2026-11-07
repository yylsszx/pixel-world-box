// ============================================================================
// gen-warinfo.mjs —— M-U33 切片「warInfoTick 域本体：warInfoTick + sustainOf +
//   warGoalNow/warGoalMet + concludeGoalWar + concludeByScore + touchesOwner +
//   settleFront（makePeace 哨兵出清随件）」蓝本 src/lib/game/engine.ts：
//   · warInfoTick L7399-7609（%100===0 槽 28：setFrozen 决战冻结〔宿主 no-op〕/
//     战争财政〔gold≥cost 扣 / gold<cost → stability-0.8 + expense〕/ 新战争建档
//     〔rel<-20 漏网兜底：reason by -75 / total / aggressor by pop / casusText〕/
//     主循环：死国删 + rel≥-20 删 + 大战 belligerent 崩溃停战〔sustainOf×2 + 0.5 掷
//     → makePeace(5) + wwTruce〕+ 武器三连掷门〔arty 0.12 / laser 0.2 / drone 0.1〕/
//     战事活跃签名〔sig≠sigMark → rel-2 钳-96 + lastActiveTick + kw 厌战方向修正〕/
//     厌战度累积〔1.8 + popRatio<0.75×2.2 + razed 门 0.4〕×(1+idea.wear)×盟友 0.85 /
//     单边厌战崩溃 82〔weary=loser → concludeByScore(cap) / winner → makePeace(8)〕/
//     双高厌战 62 + 沉寂 500 → makePeace(8) / 仇恨燎原 rel<-75 → 灭国升级〔annex+
//     giveUpAt+3600〕/ ① 目的达成 → concludeGoalWar〔plunder/revenge 索赔 / occ 割地〕/
//     ② 灭国久攻不下 giveUpAt → 放弃 rel-5 / ③ 承受力崩溃 25〔total 攻方 0.5 掷放弃 /
//     常规 brokenIsLoser 0.5 掷 → concludeByScore / 0.4 掷 → makePeace(5) 白平〕/
//     ④ 劳师糜饷 950 → makePeace(10) / ⑤ 世代期限 1800 → 0.4 阀概率罢兵）
//   · sustainOf L7085-7114（0-100：军心 militarism×0.28 / 财富 min(16,gold×0.05) /
//     政体 gov===4 +8 / 动员 mobilizeUntil +12 / 联盟并肩 +10 / 冬季 season===3 -6 /
//     饥荒 ecoState collapse -8 / 伤亡 ex×0.5 / 厌战 ×0.24 / 家园焚毁 razed×1.2 /
//     战局不利 max(0,foe-my)×0.4 / 人口凋敝 (1-pop/pop0)×70 / 钳 [0,100]）
//   · warGoalNow L7117-7137 / warGoalMet L7151-7153 / concludeGoalWar L7156-7175
//   · settleFront L7370-7386（occStr≥70 frontSolidify 割让 / <70 归还——战线域随件）
//   · concludeByScore L7672-7708（接壤割地 maxTiles + CAPTURABLE 建筑转帜 hp 重置 /
//     非 capturable destroyBuilding + overlayDirty + makePeace(10) + cession 播报）
//   · touchesOwner L7711-7719 / makePeace L7613-7669（哨兵出清：settleFront 结算/
//     warShame 耻辱簿 / directives 未竟旨意失败 FinishDirective / rel=postRel /
//     totalWars/warData 双删 / shiftRaceRel +1 / 阵营停战 rng<0.75 跟随或 cohesion-10 /
//     isWwPair → wwTruce+WW_TRUCE_TICKS + truces++）
//   切片边界（挂账注记）：setFrozen（online-store collectorStats.frozen 宿主 UI 态——
//     纪律③宿主效应 no-op 注记）；warGoalLabel L7140（战况面板 UI 域——无槽不译）；
//     noteOccupied/normalizeWarInfo/addWarScore（M-U3e 已译件/存档域——不在本切片）。
// 直接 import 现役 src/lib/game/engine.ts + types.ts（真实现，非复制）。
// 夹具 = 手术式字段直写（gen-war M-U32 协议继承 + warinfo v2 扩展）：civs〔+
//   gov/mobilizeUntil/stability/expense/houses〕/ rel/totalWars/warShame/wwTruce/
//   warData〔v2 全字段：ex/cas/razed/battles/occ/wear/sigMark 手术覆写〕/alliances/
//   buildings〔v2：building[]/bIdx/bHp 三账齐注 + kind 数值〕/ worldWar / ecoState/
//   season/overlayMode / occ0〔i,occCiv,occStr〕/ owner0 / directives0 → rngA 尾置
//   清零起流 → ops 逐步直调（wit/settle——系统结算不经母体编排）+ 每步快照。
// 掷数核账：seed 预标定（S25 0x25000002 一掷 0.0621<0.5 / S26 0x26000012 一掷 0.0017<
//   0.12 八掷 0.2931≥0.2 九掷 0.6694≥0.1 / S32 0x32000012 一掷 0.0341<0.1333 /
//   S33 0x33000001 0.1892<0.5 / S34 0x34000004 0.2765<0.4 / S36 0x33000002 0.4610<0.5）。
// det 双跑字节级（M-U28 协议①）。
//
// 运行：bun scripts/unity-migration/gen-warinfo.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/warinfo.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/warinfo.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 gen-war.mjs） ----
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
const { T, R, BUILD_KINDS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));

// ---- 工具（同 gen-war） ----
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

// ---- canonical（行协议——warinfo v2：warData 带 wear/sigMark 三态 null） ----
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
    wearA: wd.wearA === undefined ? null : f64hex(wd.wearA),
    wearB: wd.wearB === undefined ? null : f64hex(wd.wearB),
    sigMark: wd.sigMark === undefined ? null : f64hex(wd.sigMark),
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
function directiveCanon(d) {
  return {
    id: d.id, civ: d.civ, kind: d.kind, target: d.target ?? null, param: d.param,
    status: d.status, startTick: d.startTick, deadlineTick: d.deadlineTick,
    text: d.text, endTick: d.endTick ?? null, endText: d.endText ?? null,
  };
}

// ---- 手术式夹具构建 + ops 逐步直调 + 每步快照 ----
function buildScenario(spec, opts = {}) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零 + 主权/占领/建筑三账清空
  eng.terrain.fill(T.GRASS);
  eng.owner.fill(-1);
  eng.building.fill(0);
  eng.bIdx.clear();
  eng.bHp.clear();
  eng.occCiv.fill(-1);
  eng.occStr.fill(0);
  eng.occSet.clear();
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
  eng.laws.wars = spec.lawsWars !== false;          // 缺省 true
  eng.statWars = 0;
  eng.toastSeq = 1;
  eng.overlayDirty = false;
  eng.overlayMode = spec.overlayMode0 ?? 'none';
  eng.ecoState = spec.ecoState0 ?? 'balanced';
  if (spec.season0 !== undefined) eng.nature.season = spec.season0;
  // toasts 收集器（toast 本体不存储——onToast 回调面）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ text: t.text, tone: t.tone });

  // civ 注入（warInfoTick 触面：pop/gold/gov/mobilizeUntil/stability/expense/houses/
  //   tiles/capital/race/colorHex/militarism/techs）
  for (const c of spec.civs) {
    eng.civs.push({
      id: c.id, name: c.name, colorHex: c.colorHex, alive: c.alive !== false,
      pop: c.pop ?? 0, gold: c.gold ?? 0, techs: [...(c.techs ?? [])],
      capital: c.capital ?? -1, tiles: [...(c.tiles ?? [])], frontier: [], ideas: null,
      race: c.race ?? R.HUMAN, militarism: c.militarism ?? 30,
      gov: c.gov ?? 0, mobilizeUntil: c.mobilizeUntil,
      stability: c.stability ?? 70, expense: c.expense ?? 0, houses: c.houses ?? 0,
    });
  }
  // rel / totalWars / warShame / wwTruce 注入
  for (const [k, v] of spec.rel ?? []) eng.rel.set(k, v);
  for (const k of spec.totalWars0 ?? []) eng.totalWars.add(k);
  for (const [k, v] of spec.warShame0 ?? []) eng.warShame.set(k, v);
  for (const [k, v] of spec.wwTruce0 ?? []) eng.wwTruce.set(k, v);
  // warData 注入（v2 全字段手术覆写——ex/cas/razed/battles/occ/wear/sigMark 触发面）
  for (const wd0 of spec.warData0 ?? []) {
    eng.warData.set(wd0.key, {
      key: wd0.key, a: wd0.a, b: wd0.b, startTick: wd0.startTick ?? spec.tickCount,
      startYear: wd0.startYear ?? Math.floor(spec.yearF), total: !!wd0.total,
      scoreA: wd0.scoreA ?? 0, scoreB: wd0.scoreB ?? 0,
      exA: wd0.exA ?? 0, exB: wd0.exB ?? 0,
      casA: wd0.casA ?? 0, casB: wd0.casB ?? 0,
      razedA: wd0.razedA ?? 0, razedB: wd0.razedB ?? 0,
      battles: wd0.battles ?? 0, giveUpAt: wd0.giveUpAt ?? 0,
      reason: wd0.reason ?? 'border', reasonText: wd0.reasonText ?? '',
      aggressor: wd0.aggressor ?? wd0.a, goal: wd0.goal ?? 0, goalNow: 0,
      occA: wd0.occA ?? 0, occB: wd0.occB ?? 0,
      popA0: wd0.popA0 ?? 0, popB0: wd0.popB0 ?? 0,
      lastActiveTick: wd0.lastActiveTick ?? spec.tickCount,
      ...(wd0.wearA !== undefined ? { wearA: wd0.wearA } : {}),
      ...(wd0.wearB !== undefined ? { wearB: wd0.wearB } : {}),
      ...(wd0.sigMark !== undefined ? { sigMark: wd0.sigMark } : {}),
    });
  }
  // 联盟注入（厌战 0.85 / sustainOf 并肩 +10 面）
  for (const al of spec.alliances0 ?? []) {
    eng.alliances.push(JSON.parse(JSON.stringify(al)));
    for (const m of al.members) eng.allianceOf.set(m, al.id);
  }
  // 建筑注入（v2：building[]/bIdx 双账——concludeByScore 转帜/销毁面 + 火炮目标面）
  for (const b of spec.buildings0 ?? []) {
    const t = b.y * W + b.x;
    eng.building[t] = b.kind;
    eng.bIdx.set(t, eng.buildings.length);
    eng.buildings.push({ i: t, x: b.x, y: b.y, kind: b.kind, civ: b.civ });
  }
  // 占领层注入（settleFront 面）
  for (const [i, oc, st] of spec.occ0 ?? []) {
    eng.occCiv[i] = oc;
    eng.occStr[i] = st;
    eng.occSet.add(i);
  }
  // 主权注入（割地面）
  for (const [t, civ] of spec.owner0 ?? []) eng.owner[t] = civ;
  // 旨意注入（makePeace 未竟旨意失败面）
  for (const d of spec.directives0 ?? []) eng.directives.push(JSON.parse(JSON.stringify(d)));
  // worldWar 注入（整体覆写——duck typing）
  if (spec.worldWar0) eng.worldWar = JSON.parse(JSON.stringify(spec.worldWar0));
  else if (spec.wwIdle) eng.worldWar = GameEngine.IDLE_WORLD_WAR();

  // 手术二（尾置）：rngA 清零起流 → ops 逐步直调 + 每步快照
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (const op of spec.ops) {
    switch (op.op) {
      case 'wit': eng.warInfoTick(); break;                                    // warInfoTick L7399
      case 'settle': eng.settleFront(op.a, op.b); break;                       // settleFront L7370
      default:
        throw new Error(`S${spec.key}: 未知 op ${op.op}`);
    }
    // 每步快照（canonical）
    steps.push({
      op: op.op + (op.a !== undefined ? `:${op.a},${op.b}` : ''),
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      rel: [...eng.rel.entries()].map(([k, v]) => [k, f64hex(v)]),
      totalWars: [...eng.totalWars],
      warShame: [...eng.warShame.entries()],
      wwTruce: [...eng.wwTruce.entries()].map(([k, v]) => [k, v]),
      warData: [...eng.warData.values()].map(warDataCanon),
      fxCount: eng.effects.length,
      fx: eng.effects.map(fxCanon),
      events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
      toasts: [...toasts],
      worldWar: worldWarCanon(eng.worldWar),
      gold: eng.civs.map((c) => f64hex(c.gold ?? 0)),
      stab: eng.civs.map((c) => f64hex(c.stability ?? 70)),
      expense: eng.civs.map((c) => f64hex(c.expense ?? 0)),
      houses: eng.civs.map((c) => c.houses ?? 0),
      tiles: eng.civs.map((c) => [...c.tiles].sort((a, b) => a - b)),
      buildings: eng.buildings.map((b) => ({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: b.civ })),
      occ: {
        set: [...eng.occSet].sort((a, b) => a - b),
        rows: [...eng.occSet].sort((a, b) => a - b).map((i) => [i, eng.occCiv[i], eng.occStr[i]]),
      },
      directives: eng.directives.map(directiveCanon),
      overlayDirty: !!eng.overlayDirty,
      statWars: eng.statWars,
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
    totalWars0: spec.totalWars0 ?? [],
    warShame0: spec.warShame0 ?? [],
    wwTruce0: spec.wwTruce0 ?? [],
    warData0: spec.warData0 ?? [],
    alliances0: spec.alliances0 ?? [],
    buildings0: spec.buildings0 ?? [],
    occ0: spec.occ0 ?? [],
    owner0: spec.owner0 ?? [],
    directives0: spec.directives0 ?? [],
    worldWar0: spec.worldWar0 ?? null,
    wwIdle: !!spec.wwIdle,
    ecoState0: spec.ecoState0 ?? 'balanced',
    season0: spec.season0 ?? 0,
    overlayMode0: spec.overlayMode0 ?? 'none',
    ops: spec.ops,
    totalDraws,
    steps,
  };
}

// ============================================================================
// 场景册
// ============================================================================
const scenarios = [];

// 大战状态（running 形状——worldWar0 全字段；M-U32 WW_RUN 协议继承）
const WW_RUN = (over = {}) => ({
  phase: 'running', startTick: 4000, startYear: 78, endTick: 0, belligerents: [0, 1],
  pop0: { 0: 20, 1: 15 }, kills: 3, fallen: [], truces: 0, nukes: 0, lasers: 0,
  drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 0, winner: null, endText: '', ...over,
});

// S19 战争财政四面（gold≥cost 扣 / gold<cost → stability-0.8 / pop0 skip / 非交战 skip）
//   cost = min(30, 3+floor(pop×0.12))：pop20→5 / pop15→4 / pop12→4 / pop10→4
//   主循环双键 sigMark 预载零进（wear 累积 2.2×2 键）——零掷
scenarios.push({
  key: 'S19', name: 'wit-fiscal',
  baseSeed: 32119, seed: 0x1900013, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 3, capital: -1, tiles: [20000], militarism: 30 },
    { id: 3, name: '沙国', colorHex: '#e8d44d', pop: 0, gold: 9, capital: -1, tiles: [], militarism: 30 },
    { id: 4, name: '泽国', colorHex: '#7dd87d', pop: 10, gold: 10, capital: -1, tiles: [30000], militarism: 30 },
  ],
  rel: [['0-1', -50], ['0-2', -50]],
  warData0: [
    { key: '0-1', a: 0, b: 1, sigMark: 0, goal: 8, popA0: 20, popB0: 15 },
    { key: '0-2', a: 0, b: 2, sigMark: 0, goal: 8, popA0: 20, popB0: 12 },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => eng.civs[0].gold === 35 && eng.civs[0].expense === 5
    && eng.civs[1].gold === 2 && eng.civs[2].gold === 0
    && Math.abs(eng.civs[2].stability - 69.2) < 1e-9 && eng.civs[3].gold === 9
    && eng.civs[4].gold === 10 && eng.civs[4].expense === 0,
});

// S20 新战争建档（rel<-20 漏网兜底：border -30 / annex -80 / aggressor by pop /
//   casusText 原文 / total→totalWars / statWars 计数）——建档后同轮主循环签名首进
//   （sigMark undefined → gained 0 → rel -2）——零掷
scenarios.push({
  key: 'S20', name: 'wit-enroll',
  baseSeed: 32120, seed: 0x1900014, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 10, capital: -1, tiles: [20000], militarism: 30 },
  ],
  rel: [['0-1', -30], ['0-2', -80]],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => eng.warData.get('0-1').reason === 'border'
    && eng.warData.get('0-1').aggressor === 0 && eng.warData.get('0-1').total === false
    && eng.warData.get('0-2').reason === 'annex' && eng.warData.get('0-2').total === true
    && eng.totalWars.has('0-2') && eng.statWars === 2
    && eng.rel.get('0-1') === -32 && eng.rel.get('0-2') === -82,
});

// S21 主循环双删面（死国 warData 删 / rel≥-20 停战删）——零掷
scenarios.push({
  key: 'S21', name: 'wit-stale-delete',
  baseSeed: 32121, seed: 0x1900015, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, alive: false, capital: -1, tiles: [], militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 10, capital: -1, tiles: [20000], militarism: 30 },
  ],
  rel: [['0-1', -50], ['0-2', 10]],
  warData0: [
    { key: '0-1', a: 0, b: 1, goal: 8, popA0: 20, popB0: 15 },
    { key: '0-2', a: 0, b: 2, goal: 8, popA0: 20, popB0: 12 },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => eng.warData.size === 0 && eng.civs[1].alive === false,
});

// S22 战事活跃签名双面（键1 sigMark 缺省 → gained 0 → kw0 厌战不动仅 rel-2 /
//   键2 sigMark 预载 10 → gained 5 → kw1 → aAhead wearA-3 wearB+1.2 + 累积序）
//   ——零掷
scenarios.push({
  key: 'S22', name: 'wit-signature',
  baseSeed: 32122, seed: 0x1900016, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 10, capital: -1, tiles: [20000], militarism: 30 },
  ],
  rel: [['0-1', -50], ['0-2', -50]],
  warData0: [
    { key: '0-1', a: 0, b: 1, casA: 2, casB: 1, battles: 4, scoreA: 5, scoreB: 3, goal: 8, popA0: 20, popB0: 15 },
    { key: '0-2', a: 0, b: 2, casA: 2, casB: 1, battles: 4, scoreA: 5, scoreB: 3, sigMark: 10, goal: 8, popA0: 20, popB0: 12 },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => eng.warData.get('0-1').sigMark === 15
    && Math.abs(eng.warData.get('0-1').wearA - 2.2) < 1e-9
    && eng.warData.get('0-2').sigMark === 15
    && Math.abs(eng.warData.get('0-2').wearB - 3.4) < 1e-9
    && eng.rel.get('0-1') === -52 && eng.rel.get('0-2') === -52,
});

// S23 签名反向（aAhead false → wearB-2×kw wearA+1.2×kw）+ popRatio<0.75 加速 2.2 +
//   razed>0 抑制 0.4 ——零掷
scenarios.push({
  key: 'S23', name: 'wit-signature-flip',
  baseSeed: 32123, seed: 0x1900017, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 12, gold: 10, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
  ],
  rel: [['0-1', -50]],
  warData0: [
    { key: '0-1', a: 0, b: 1, casA: 5, razedA: 1, occB: 2, battles: 2, sigMark: 2, scoreA: 3, scoreB: 9, goal: 8, popA0: 20, popB0: 15 },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => {
    const wd = eng.warData.get('0-1');
    return wd.sigMark === 14 && Math.abs(wd.wearA - 6.4) < 1e-9 && Math.abs(wd.wearB - 2.2) < 1e-9
      && eng.rel.get('0-1') === -52;
  },
});

// S24 联盟厌战 0.85 因子（盟友并肩参战 members.some atWar foe）+ sustainOf 并肩 +10
//   隐面——零掷（'1-2' 键 sigMark 预载防噪）
scenarios.push({
  key: 'S24', name: 'wit-wear-ally',
  baseSeed: 32124, seed: 0x1900018, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 10, capital: -1, tiles: [20000], militarism: 30 },
  ],
  rel: [['0-1', -50], ['1-2', -40]],
  alliances0: [{ id: 0, name: '焰岩同盟', members: [0, 2], leader: 0, cohesion: 100, formedTick: 0, formedYear: 0, warsTogether: 0, colorHex: '#8888ff' }],
  warData0: [
    { key: '0-1', a: 0, b: 1, wearA: 10, sigMark: 0, goal: 8, popA0: 20, popB0: 15 },
    { key: '1-2', a: 1, b: 2, sigMark: 0, goal: 0, popA0: 15, popB0: 12 },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => Math.abs(eng.warData.get('0-1').wearA - 11.87) < 1e-9
    && Math.abs(eng.warData.get('0-1').wearB - 2.2) < 1e-9,
});

// S25 大战 belligerent 崩溃停战（sustainOf 全项：gov4 +8 / mobilize +12 / 金 +1.75 /
//   militarism +8.4 vs exB 90 -45 / pop 凋敝 -63 → sBw 0 <25）→ 0.5 掷（0.0621）→
//   collapse + makePeace(5) + wwTruce 5600 + truces 1 —— 1 掷
scenarios.push({
  key: 'S25', name: 'wit-ww-truce',
  baseSeed: 32125, seed: 0x25000002, yearF: 7, tickCount: 5000, ecoState0: 'collapse',   // yearF 7 → season getter floor(3.5)%4=3（冬季 -6 面）
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30, gov: 4, mobilizeUntil: 5100 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 2, gold: 0, capital: -1, tiles: [12060], militarism: 5 },
  ],
  rel: [['0-1', -40]],
  warData0: [
    { key: '0-1', a: 0, b: 1, sigMark: 0, goal: 0, exB: 90, popA0: 20, popB0: 20 },
  ],
  worldWar0: WW_RUN({}),
  ops: [{ op: 'wit' }],
  minDraws: 1,
  sanity: (eng) => eng.warData.size === 0 && eng.rel.get('0-1') === 5
    && eng.wwTruce.get('0-1') === 5600 && eng.worldWar.truces === 1,
});

// S26 武器三连掷门（arty gate 0.0017<0.12 → launchArtillery 6 掷〔选+dmg+fire+fx2+音效〕/
//   laser gate 0.2931≥0.2 miss / drone gate 0.6694≥0.1 miss）—— 9 掷
scenarios.push({
  key: 'S26', name: 'wit-weapon-gates',
  baseSeed: 32126, seed: 0x26000012, yearF: 90.5, tickCount: 8000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: 4840, tiles: [4840], militarism: 30, techs: ['explosives'] },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: 12060, tiles: [12060], militarism: 30, techs: ['lasers', 'drones'] },
  ],
  rel: [['0-1', -40]],
  warData0: [
    { key: '0-1', a: 0, b: 1, sigMark: 0, goal: 0, popA0: 20, popB0: 15 },
  ],
  buildings0: [{ x: 100, y: 60, civ: 1, kind: BUILD_KINDS.HOUSE }],
  ops: [{ op: 'wit' }],
  minDraws: 9,
  sanity: (eng) => eng.effects.filter((e) => e.kind === 'shell').length === 1,
});

// S27 单边厌战崩溃 → concludeByScore 全链（weary=loser → cap=max(6,goal)=8 →
//   接壤链式割地 4 格〔touchesOwner 四向：右 12852/上 12850/左 13105·13107/下 13618〕
//   + HOUSE 转帜 houses 账 + TOWER destroyBuilding swap-pop +
//   overlayDirty + makePeace(10) + warShame + cession 播报）——零掷
scenarios.push({
  key: 'S27', name: 'wit-collapse-cession',
  baseSeed: 32127, seed: 0x1900019, yearF: 80.25, tickCount: 5000, wwIdle: true,
  overlayMode0: 'political',
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [12852, 13108], houses: 0, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12851, 13107, 13106, 13362], houses: 2, militarism: 30 },
  ],
  rel: [['0-1', -40]],
  owner0: [[12852, 0], [13108, 0], [12851, 1], [13107, 1], [13106, 1], [13362, 1], [13618, 0], [13361, 0]],
  warData0: [
    { key: '0-1', a: 0, b: 1, wearB: 90, scoreA: 10, scoreB: 2, sigMark: 0, goal: 8, popA0: 20, popB0: 15 },
  ],
  buildings0: [
    { x: 51, y: 50, civ: 1, kind: BUILD_KINDS.HOUSE },
    { x: 50, y: 51, civ: 1, kind: BUILD_KINDS.TOWER },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => eng.warData.size === 0 && eng.civs[0].tiles.length === 6
    && eng.civs[1].tiles.length === 0 && eng.civs[0].houses === 1 && eng.civs[1].houses === 0
    && eng.buildings.length === 1 && eng.buildings[0].civ === 0 && eng.overlayDirty === true
    && eng.rel.get('0-1') === 10 && eng.warShame.get('0-1') === 1,
});

// S28 厌战崩溃见好就收（weary=winner → makePeace(8)）+ makePeace 未竟旨意双失败面
//   （annihilate 直败 / conquer scoreB<45 败）+ FinishDirective gold ±60 + warShame
//   ——零掷
scenarios.push({
  key: 'S28', name: 'wit-see-good-directives',
  baseSeed: 32128, seed: 0x190001a, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
  ],
  rel: [['0-1', -40]],
  warData0: [
    { key: '0-1', a: 0, b: 1, wearA: 90, scoreA: 10, scoreB: 2, sigMark: 0, goal: 8, popA0: 20, popB0: 15 },
  ],
  directives0: [
    { id: 1, civ: 0, kind: 'annihilate', target: 1, param: 0, status: 'active', startTick: 4000, deadlineTick: 0, text: '灭岚国令' },
    { id: 2, civ: 1, kind: 'conquer', target: 0, param: 45, status: 'active', startTick: 4000, deadlineTick: 0, text: '攻焰邦令' },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => eng.warData.size === 0 && eng.rel.get('0-1') === 8
    && eng.directives[0].status === 'failed' && eng.directives[0].endText === '停战使灭国宏图半途而废'
    && eng.directives[1].status === 'failed' && eng.directives[1].endText === '停战使攻城宏图半途而废'
    && eng.civs[0].gold === 0 && eng.civs[1].gold === 0 && eng.warShame.get('0-1') === 1,
});

// S29 双高厌战 + 战线沉寂 600>500 → makePeace(8)（scoreA==scoreB → 无 warShame）
//   ——零掷
scenarios.push({
  key: 'S29', name: 'wit-double-wear-quiet',
  baseSeed: 32129, seed: 0x190001b, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
  ],
  rel: [['0-1', -40]],
  warData0: [
    { key: '0-1', a: 0, b: 1, wearA: 70, wearB: 70, lastActiveTick: 4400, sigMark: 0, goal: 8, popA0: 20, popB0: 15 },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => eng.warData.size === 0 && eng.rel.get('0-1') === 8 && eng.warShame.size === 0,
});

// S30 仇恨燎原 → 灭国升级（rel-80<-75 + lawsWars + !totalWars → annex 语义全套 +
//   giveUpAt 8600 + totalwar 播报）+ 升级后 ①②③ 不触发——零掷
scenarios.push({
  key: 'S30', name: 'wit-hate-total',
  baseSeed: 32130, seed: 0x190001c, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
  ],
  rel: [['0-1', -80]],
  warData0: [
    { key: '0-1', a: 0, b: 1, sigMark: 0, goal: 8, aggressor: 0, popA0: 20, popB0: 15 },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => {
    const wd = eng.warData.get('0-1');
    return wd.total === true && wd.reason === 'annex' && wd.goal === 0 && wd.giveUpAt === 8600
      && eng.totalWars.has('0-1')
      && wd.reasonText === '「焰邦」对「岚国」发动灭国战争——不摧毁对方最后一座城池决不罢休';
  },
});

// S31 ① 目的达成双支（'0-1' border occ 8≥8 → concludeGoalWar occ 面 + cession 播报 /
//   '0-2' plunder scoreA 30≥24 → 索赔面 loot=min(36,70)=36 金账）——零掷
scenarios.push({
  key: 'S31', name: 'wit-goal-met',
  baseSeed: 32131, seed: 0x190001d, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 100, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 40, capital: -1, tiles: [12060], militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 40, capital: -1, tiles: [20000], militarism: 30 },
  ],
  rel: [['0-1', -40], ['0-2', -40]],
  warData0: [
    { key: '0-1', a: 0, b: 1, reason: 'border', goal: 8, occA: 8, sigMark: 0, aggressor: 0, popA0: 20, popB0: 15 },
    { key: '0-2', a: 0, b: 2, reason: 'plunder', goal: 24, scoreA: 30, sigMark: 0, aggressor: 0, popA0: 20, popB0: 12 },
  ],
  ops: [{ op: 'wit' }],
  allowZeroDraws: true,
  sanity: (eng) => eng.warData.size === 0 && eng.rel.get('0-1') === 10 && eng.rel.get('0-2') === 10
    && eng.civs[0].gold === 131 && eng.civs[2].gold === 0
    && eng.worldEvents.filter((e) => e.kind === 'cession').length === 1
    && eng.worldEvents.filter((e) => e.kind === 'loot').length === 1,
});

// S32 终局三分支（'0-1' ② 灭国 giveUpAt 4900<5000 → 放弃 rel-5 双播报 / '0-2' ④
//   沉寂 1000>950 → makePeace(10) / '1-2' ⑤ 世代 2000>1800 → 0.0341<0.1333 →
//   makePeace(8)）—— 1 掷
scenarios.push({
  key: 'S32', name: 'wit-endings',
  baseSeed: 32132, seed: 0x32000012, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [4840], militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
    { id: 2, name: '岩国', colorHex: '#c0c0c0', pop: 12, gold: 10, capital: -1, tiles: [20000], militarism: 30 },
  ],
  rel: [['0-1', -40], ['0-2', -40], ['1-2', -40]],
  totalWars0: ['0-1'],
  warData0: [
    { key: '0-1', a: 0, b: 1, total: true, giveUpAt: 4900, sigMark: 0, goal: 0, aggressor: 0, popA0: 20, popB0: 15 },
    { key: '0-2', a: 0, b: 2, lastActiveTick: 4000, sigMark: 0, goal: 8, aggressor: 0, popA0: 20, popB0: 12 },
    { key: '1-2', a: 1, b: 2, startTick: 3000, sigMark: 0, goal: 0, aggressor: 1, popA0: 15, popB0: 12 },
  ],
  ops: [{ op: 'wit' }],
  minDraws: 1,
  sanity: (eng) => eng.warData.size === 0 && eng.totalWars.size === 0
    && eng.rel.get('0-1') === -5 && eng.rel.get('0-2') === 10 && eng.rel.get('1-2') === 8,
});

// S33 ③ total 攻方崩溃（exA 90 + pop 2/20 凋敝 → sA 0 <25 aggBroken）→ 0.1892<0.5 掷
//   → 放弃 rel-5 —— 1 掷
scenarios.push({
  key: 'S33', name: 'wit-total-agg-broken',
  baseSeed: 32133, seed: 0x33000001, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 2, gold: 0, capital: -1, tiles: [4840], militarism: 5 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
  ],
  rel: [['0-1', -40]],
  totalWars0: ['0-1'],
  warData0: [
    { key: '0-1', a: 0, b: 1, total: true, exA: 90, sigMark: 0, goal: 0, aggressor: 0, popA0: 20, popB0: 15 },
  ],
  ops: [{ op: 'wit' }],
  minDraws: 1,
  sanity: (eng) => eng.warData.size === 0 && eng.totalWars.size === 0 && eng.rel.get('0-1') === -5,
});

// S34 ③ 常规白平（winner 破碎 brokenIsLoser false → 短路零掷 → 0.2765<0.4 →
//   makePeace(5) 两败俱伤）—— 1 掷
scenarios.push({
  key: 'S34', name: 'wit-white-peace',
  baseSeed: 32134, seed: 0x34000004, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 2, gold: 0, capital: -1, tiles: [4840], militarism: 5 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12060], militarism: 30 },
  ],
  rel: [['0-1', -40]],
  warData0: [
    { key: '0-1', a: 0, b: 1, exA: 90, scoreA: 10, sigMark: 0, goal: 8, aggressor: 0, popA0: 20, popB0: 15 },
  ],
  ops: [{ op: 'wit' }],
  minDraws: 1,
  sanity: (eng) => eng.warData.size === 0 && eng.rel.get('0-1') === 5 && eng.warShame.get('0-1') === 1,
});

// S36 ③ brokenIsLoser → concludeByScore 零割地变体（scoreB 10 → winner=cb loser=ca /
//   ca 破碎 → brokenIsLoser true → 0.4610<0.5 → concludeByScore(1,0,8)：败方领土
//   不接壤 → ceded 0 → makePeace(10) 纯停战）—— 1 掷
scenarios.push({
  key: 'S36', name: 'wit-broken-cession-zero',
  baseSeed: 32136, seed: 0x33000002, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 2, gold: 0, capital: -1, tiles: [38600], houses: 1, militarism: 5 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12850], houses: 0, militarism: 30 },
  ],
  rel: [['0-1', -40]],
  owner0: [[38600, 0], [12850, 1]],
  warData0: [
    { key: '0-1', a: 0, b: 1, exA: 90, scoreB: 10, sigMark: 0, goal: 8, aggressor: 0, popA0: 20, popB0: 15 },
  ],
  ops: [{ op: 'wit' }],
  minDraws: 1,
  sanity: (eng) => eng.warData.size === 0 && eng.rel.get('0-1') === 10
    && eng.civs[0].tiles.length === 1 && eng.warShame.get('0-1') === 0,
});

// S35 settleFront 直调（occStr 80≥70 → frontSolidify 割让 claimTile + warData score/occ
//   入账 / 30<70 归还 / 10<70 归还——战线域随件出清）——零掷
scenarios.push({
  key: 'S35', name: 'settle-front',
  baseSeed: 32135, seed: 0x190001f, yearF: 80.25, tickCount: 5000, wwIdle: true,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, capital: -1, tiles: [12851], houses: 0, militarism: 30 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, capital: -1, tiles: [12850], houses: 0, militarism: 30 },
  ],
  rel: [['0-1', -40]],
  owner0: [[12850, 1], [12851, 0], [13108, 1]],
  occ0: [[12850, 0, 80], [12851, 1, 30], [13108, 0, 10]],
  warData0: [
    { key: '0-1', a: 0, b: 1, sigMark: 0, goal: 8, aggressor: 0, popA0: 20, popB0: 15 },
  ],
  ops: [{ op: 'settle', a: 0, b: 1 }],
  allowZeroDraws: true,
  sanity: (eng) => eng.occSet.size === 0 && eng.owner[12850] === 0
    && eng.civs[0].tiles.includes(12850) && eng.warData.get('0-1').scoreA === 1
    && eng.warData.get('0-1').occA === 1,
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

const out = { meta: { manifest: scenarios.map((s) => s.key), name: 'warinfo', slice: 'M-U33', totalDraws: golden.map((g) => g.totalDraws) }, scenarios: golden };
const json = JSON.stringify(out);
const p1 = path.join(ROOT, 'scripts/unity-migration/golden/warinfo.json');
const p2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/warinfo.json');
writeFileSync(p1, json);
writeFileSync(p2, json);
const draws = golden.map((g) => `S${g.key}=${g.totalDraws}`).join(' ');
console.log(`gen-warinfo OK: ${golden.length} 场景 det 双跑字节级一致 | ${json.length} bytes | md5=${md5hex(Buffer.from(json))}`);
console.log(`掷数核账: ${draws}`);
}
