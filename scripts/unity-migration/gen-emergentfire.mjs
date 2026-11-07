// ============================================================================
// gen-emergentfire.mjs —— M-U31 切片「发射面：fireEmergent + emergentPayload + wwCountKill」
//   蓝本 src/lib/game/engine.ts：
//   · wwCountKill L8695-8719（killCredit 反馈支路：kills++/学说四漂移/q[0] 上行 +
//     worldWar 计数——M-U30 起恒 null 死支路，本轮解桩）
//   · 数据面：PAYLOAD_FX L8735（7 色）/ DYN_TINTS L8737（8 色——随件入账）
//   · fireEmergent L9317-9400（发射：foes 掷选敌 → 目标三选（army 0.4 门/capital/
//     building）→ 点防拦截（pInt 门+中段烟花+inter 反馈）→ 制导散射 missA → 装甲减伤
//     → fx 携 wid/col/D.fx → 挨打反馈（point+0.5/armor+1.6·(1-pen·0.5)/evade+1.1）
//     → 首射/奇迹播报 + worldWar.emerged）
//   · emergentPayload L9403-9442（命中附加：wid 早退/rad 辐射环 40%（radiate=40+
//     radSet tick+2400+markDirty）/terra 奇点焦土 55%（rng<0.7 掷/tile、山地板留）/
//     morale 士气崩落（r+2.5 内敌军团 max(5,·-w.morale)、src 国豁免））
//   切片边界（挂账注记）：warTick L8049 / worldWarTick L8616 两处 fireEmergent 生产者
//     调用点未接线（warTick/worldWarTick 域本体未译——域切片时随件）；WbBail 命中
//     结算五处 killCredit=e.wid 设置随本轮入链（EmergentPayload 桩解桩）。
// 直接 import 现役 src/lib/game/engine.ts + types.ts（真实现，非复制）。
// 夹具 = 手术式字段直写（gen-armory M-U30 协议）：构造 GameEngine(baseSeed) 后瞬态层
//   清零 + civs/warData/rel/weapons/doctrines/defenses/armies/buildings/worldWar 手术
//   注入 + spawnUnit 真调用（trait:'' 钉死 0.15 掷——M-U30 教训 b）+ rngA 尾置清零起流
//   → ops 逐步直调（fireEmergent/emergentPayload/wwCountKill——系统结算不经母体编排）
//   + 每步快照（rngA/gold/weapons canonical/doctrines/defenses/weapSeq/fx 全字段/
//   events/radiate 切片/radSet/armies morale/worldWar 计数/terrain 焦土计数）。
// 掷数核账：fx() 内嵌 2 掷（seed/dir——M-U30 教训 a）；fireEmergent 掷序 =
//   foes 1 掷（无条件）→ army 门 0.4 掷（有敌军团时）→ army 选 1 掷 → building 选
//   1 掷（回退时）→ 拦截 1 掷 → missA 1 掷 → fire 纵火 1 掷（突防路径）→ fx 2 掷。
// det 双跑字节级（M-U28 协议①）。
//
// 运行：bun scripts/unity-migration/gen-emergentfire.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/emergentfire.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/emergentfire.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 gen-armory.mjs） ----
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
const { W } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));   // W=256（radiate/terrain 索引基）

// ---- 工具（同 gen-armory） ----
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

function chainDraws(state0, finalState) {   // mulberry 纯数学反解（gen-ice/gen-armory 协议①）
  const step = (a) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return a;                                // 引擎 rngA 存的是加常数后的状态 A（engine.ts L733）
  };
  let a = state0 | 0;
  if ((state0 >>> 0) === (finalState >>> 0)) return 0;
  for (let k = 0; k < 5_000_000; k++) {
    a = step(a);
    if ((a >>> 0) === (finalState >>> 0)) return k + 1;
  }
  throw new Error('rng 链未达终态——协议失效');
}

// ---- canonical（同 gen-armory 的武器/学说/防御行协议） ----
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
const doctrineCanon = (d) => [f64hex(d.precision), f64hex(d.saturation), f64hex(d.terror), f64hex(d.attrition)];
const defenseCanon = (d) => [f64hex(d.point), f64hex(d.armor), f64hex(d.evade)];

// ---- fx canonical（发射面全字段：extras x0/y0/src/r/dmg/fire/wid/col——M-U31 扩协议） ----
function fxCanon(e) {
  return {
    kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), x0: f64hex(e.x0), y0: f64hex(e.y0),
    r: f64hex(e.r), ttl: f64hex(e.ttl), age: e.age,
    src: e.src ?? null, dmg: e.dmg !== undefined ? f64hex(e.dmg) : null,
    fire: e.fire ?? null, wid: e.wid ?? null, col: e.col ?? null,
    nuke: e.nuke ?? null, quiet: !!e.quiet, text: e.text ?? null,
  };
}

// ---- 观察窗切片（辐射/焦土面：中心矩形窗收 radiate/terrain——全图快照过大；W=256 常量基） ----
function windowSlice(arr, x0, y0, x1, y1) {
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(arr[y * W + x]);
  return out;
}

// ---- 手术式夹具构建 + ops 逐步直调 + 每步快照 ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);      // 构造器 generate 全链（后续手术覆写）

  // 手术一：瞬态层清零（terrain 基面 GRASS / 单位清 / 文明与谱系清 / 事件清）
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
  eng.yearF = spec.yearF;
  eng.tickCount = spec.tickCount;

  // civ 注入（发射面触面：id/name/colorHex/alive/pop/gold/techs/capital/tiles）
  for (const c of spec.civs) {
    eng.civs.push({
      id: c.id, name: c.name, colorHex: c.colorHex, alive: c.alive !== false,
      pop: c.pop ?? 0, gold: c.gold ?? 0, techs: [...(c.techs ?? [])],
      capital: c.capital ?? -1, tiles: [...(c.tiles ?? [])], frontier: [], ideas: null,
    });
  }
  // rel 注入（atWar L2067-2070：v < -20 即交战）
  for (const [k, v] of spec.rel ?? []) eng.rel.set(k, v);
  // 武器/学说/防御 注入（发射池夹具——直写为 M-U28/30 法则注入先例）
  for (const w of spec.weapons0 ?? []) eng.emergentWeapons.set(w.id, JSON.parse(JSON.stringify(w)));
  eng.weapSeq = spec.weapSeq0 ?? 1;
  for (const [id, p, s, t, a] of spec.doctrines0 ?? [])
    eng.doctrines.set(id, { precision: p, saturation: s, terror: t, attrition: a });
  for (const [id, p, a, e] of spec.defenses0 ?? [])
    eng.defenses.set(id, { point: p, armor: a, evade: e });
  // 建筑注入（fireEmergent building 目标面：civ/x/y 触面）
  for (const b of spec.buildings0 ?? []) eng.buildings.push({ ...b, hp: 100, level: 1 });
  // worldWar 注入（wwCountKill 计数面 + fireEmergent emerged 面：整体覆写——duck typing）
  if (spec.worldWar0) eng.worldWar = JSON.parse(JSON.stringify(spec.worldWar0));

  // spawn 真调用注入（掷数不计——rngA 尾置；trait:'' 钉死 0.15 掷——M-U30 教训 b）
  const spawn0 = [];
  for (const sp of spec.spawn ?? []) {
    const u = eng.spawnUnit(sp.race, sp.x, sp.y, { silent: true, civ: sp.civ, job: sp.job, trait: '' });
    if (!u || u.dead) throw new Error(`S${spec.key}: spawn 失败 race=${sp.race}@${sp.x},${sp.y}`);
    spawn0.push({ race: sp.race, x: f64hex(u.x), y: f64hex(u.y), civ: sp.civ ?? -1, job: sp.job ?? 0, id: u.id });
  }

  // 军团注入（spawn 后置——members 支持 'spawn:N' 引用第 N 个 spawn 单位 id：fireEmergent
  //   army 目标面 members[0] → unitById 真命中路径）
  for (const a of spec.armies0 ?? []) {
    const members = (a.members ?? []).map((m) => (typeof m === 'string' && m.startsWith('spawn:')
      ? spawn0[+m.slice(6)].id : m));
    eng.armies.push({
      id: a.id, civ: a.civ, name: a.name ?? `军团${a.id}`, members,
      leaderId: -1, x: a.x, y: a.y, tx: a.x, ty: a.y, state: a.state ?? 'rally',
      formedTick: 0, size: members.length, morale: a.morale ?? 60,
    });
  }

  // 手术二（尾置）：rngA 清零起流 → ops 逐步直调 + 每步快照
  eng.rngA = spec.seed >>> 0;
  let killCreditPending = null;    // ww 面直调前的 killCredit 状态缓存（快照还原用）
  const steps = [];
  for (const op of spec.ops) {
    switch (op.op) {
      case 'fire': {                                              // fireEmergent L9317-9400
        eng.fireEmergent(eng.civs[op.civ], eng.emergentWeapons.get(op.wid));
        break;
      }
      case 'payload': {                                          // emergentPayload L9403-9442
        const e = {
          kind: op.fxKind ?? 'bolt', x: op.x, y: op.y, x0: op.x, y0: op.y,
          r: op.r, age: 0, ttl: op.ttl ?? 60, seed: 0, dir: 0,
          wid: op.wid, src: op.src, dmg: op.dmg,
        };
        eng.emergentPayload(e);
        break;
      }
      case 'wwKill': {                                           // wwCountKill L8695-8719
        if (op.killCredit !== undefined) eng.killCredit = op.killCredit;
        else if (killCreditPending !== null) eng.killCredit = killCreditPending;
        const victim = op.victimUnit === 'spawn'
          ? eng.units[op.spawnIdx ?? 0]
          : { civ: op.victimCiv ?? -1, hp: 0, dead: true, x: 0, y: 0, id: -1 };
        eng.wwCountKill(victim);
        killCreditPending = eng.killCredit;                       // JS 语义：命中结算后清 null——直调面保留观察
        break;
      }
      case 'killClear': {                                        // 命中结算出口：killCredit = null（L10306 模式）
        eng.killCredit = null;
        killCreditPending = null;
        break;
      }
      default:
        throw new Error(`S${spec.key}: 未知 op ${op.op}`);
    }
    // 每步快照（canonical）
    steps.push({
      op: op.op + (op.wid !== undefined ? `:${op.wid}` : '') + (op.victimCiv !== undefined ? `:v${op.victimCiv}` : ''),
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      weapons: [...eng.emergentWeapons.values()].map(weaponCanon),
      weapSeq: eng.weapSeq,
      doctrines: [...eng.doctrines.entries()].map(([id, d]) => [id, ...doctrineCanon(d)]),
      defenses: [...eng.defenses.entries()].map(([id, d]) => [id, ...defenseCanon(d)]),
      fxCount: eng.effects.length,
      fx: eng.effects.map(fxCanon),
      events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
      armies: eng.armies.map((a) => ({ civ: a.civ, x: f64hex(a.x), y: f64hex(a.y), morale: f64hex(a.morale ?? 60) })),
      worldWar: { phase: eng.worldWar.phase, kills: eng.worldWar.kills, emerged: eng.worldWar.emerged, belligerents: [...eng.worldWar.belligerents] },
      killCredit: eng.killCredit ?? null,
      radWindow: spec.radWindow ? windowSlice(eng.radiate, ...spec.radWindow) : null,
      radSet: [...eng.radSet.entries()].sort((a, b) => a[0] - b[0]).map(([i, at]) => [i, at]),
      burntCount: spec.radWindow
        ? windowSlice(eng.terrain, ...spec.radWindow).filter((t) => t === T.BURNT).length
        : null,
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
    name: spec.name,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    yearF: spec.yearF,
    tickCount: spec.tickCount,
    civs: spec.civs,
    rel: spec.rel ?? [],
    weapons0: spec.weapons0 ?? [],
    weapSeq0: spec.weapSeq0 ?? 1,
    doctrines0: spec.doctrines0 ?? [],
    defenses0: spec.defenses0 ?? [],
    armies0: spec.armies0 ?? [],
    buildings0: spec.buildings0 ?? [],
    worldWar0: spec.worldWar0 ?? null,
    radWindow: spec.radWindow ?? null,
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

// 基础武器池（v2 架构：pl/dl/gd/pw + q 四槽）
const W_HYPER = (id, civ, over = {}) => ({
  id, civ, name: `超导·轨道·量子·焚天${id}`, gen: 2, dtype: 2, delivery: 4,
  dmg: 120.5, radius: 3.2, fire: 0.35, rad: true, terra: false, morale: 18,
  wonder: false, kills: 5, fired: 7, parent: null, bornYear: 50, retired: false,
  pl: 5, dl: 4, gd: 4, pw: 3, q: [1.05, 1.1, 0.95, 1.0], inter: 1, ...over,
});

// S1 无交战敌国 → foes.length===0 return（1 掷：foes 门后无掷——L9319 直退零掷面）
//   注：L9320 foes 选择掷仅在 foes.length>0 时发生；无敌人 → 零掷直退
scenarios.push({
  key: 'S1', name: 'no-foes',
  baseSeed: 30101, seed: 0x010203, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 },
  ],
  rel: [],                        // 无 rel → atWar 恒 false
  weapons0: [W_HYPER(1, 0)],
  weapSeq0: 2,
  ops: [{ op: 'fire', civ: 0, wid: 1 }],
  allowZeroDraws: true,           // 无敌国零掷直退
});

// S2 军团门命中但成员无效 → capital 回退 + 突防（fx 携 wid/col 全字段）
//   掷序：foes 1 + army 门 1 + army 选 1（members[0] 无对应单位 → m=null → capital 回退）
//        + 拦截 1 + missA 1 + fire 1 + fx 2 = 8 掷
scenarios.push({
  key: 'S2', name: 'army-miss-capital-pierce',
  baseSeed: 30102, seed: 0x1a2b3c, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: 100 * 120 + 60 },
  ],
  rel: [['0-1', -80]],            // 交战
  weapons0: [W_HYPER(1, 0)],
  weapSeq0: 2,
  doctrines0: [[0, 0.4, 0.3, 0.3, 0.3]],
  defenses0: [[1, 0.5, 2.0, 0.5]],   // 点防极低 → pInt≈0 → 必突防
  spawn: [{ race: R.HUMAN, x: 60.5, y: 60.5, civ: 0, job: 0 }],
  armies0: [{ id: 0, civ: 1, x: 100.5, y: 60.5, morale: 60, members: [99999] }],  // members[0] 无对应单位 → m=null → tx 仍 -1 → 落 capital
  buildings0: [],
  ops: [{ op: 'fire', civ: 0, wid: 1 }],
});

// S3 capital 回退 + worldWar emerged 计数（running + belligerents 含攻方）
//   掷序：foes 1 + army 门 1（有军团但 rng≥0.4 或 members 无效）+ 拦截 1 + missA 1 + fire 1 + fx 2 = 7 掷
scenarios.push({
  key: 'S3', name: 'capital-ww-emerged',
  baseSeed: 30103, seed: 0x2b3c4d, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: 60 * 120 + 80 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: 100 * 120 + 60 },
  ],
  rel: [['0-1', -80]],
  weapons0: [W_HYPER(1, 0, { rad: false, terra: false, morale: 0 })],
  weapSeq0: 2,
  doctrines0: [[0, 0.4, 0.3, 0.3, 0.3]],
  defenses0: [[1, 1.0, 3.0, 1.0]],
  worldWar0: { phase: 'running', startTick: 4000, startYear: 78, endTick: 0, belligerents: [0, 1], pop0: { 0: 20, 1: 15 }, kills: 3, fallen: [], truces: 0, nukes: 0, lasers: 0, drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 2, winner: null, endText: '' },
  ops: [{ op: 'fire', civ: 0, wid: 1 }, { op: 'fire', civ: 0, wid: 1 }, { op: 'fire', civ: 0, wid: 1 }],
});

// S4 building 回退（无军团无 capital → buildings 随机选）
//   掷序：foes 1 + 拦截 1 + building 选 1 + missA 1 + fire 1 + fx 2 = 7 掷/次
scenarios.push({
  key: 'S4', name: 'building-fallback',
  baseSeed: 30104, seed: 0x3c4d5e, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: -1 },
  ],
  rel: [['0-1', -80]],
  weapons0: [W_HYPER(1, 0)],
  weapSeq0: 2,
  doctrines0: [[0, 0.4, 0.3, 0.3, 0.3]],
  defenses0: [[1, 0.0, 0.0, 0.0]],
  buildings0: [
    { x: 100, y: 60, civ: 1, kind: 'house' },
    { x: 104, y: 64, civ: 1, kind: 'tower' },
  ],
  ops: [{ op: 'fire', civ: 0, wid: 1 }, { op: 'fire', civ: 0, wid: 1 }],
});

// S5 无任何目标 → return（foes 1 掷后三选全落空）
scenarios.push({
  key: 'S5', name: 'no-target',
  baseSeed: 30105, seed: 0x4d5e6f, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: -1 },
  ],
  rel: [['0-1', -80]],
  weapons0: [W_HYPER(1, 0)],
  weapSeq0: 2,
  doctrines0: [],
  defenses0: [],
  ops: [{ op: 'fire', civ: 0, wid: 1 }],
  allowZeroDraws: true,           // foes 掷后无军团无 capital 无建筑 → tx<0 return（掷 1 后退）
  // 注：L9320 foes 选择掷无条件（foes.length≥1）→ totalDraws 应为 1
});

// S6 拦截路径（dl=0 火炮 speed=0.5×q[1]=0.6→0.3 → pInt=(0.95)(1-0.225)(1-0)≈0.74 → 首掷即命中：
//   中段烟花 explosion{r:1.8}+spark + inter 反馈 + def/doc 漂移 + 播报门）
//   掷序/次：foes 1 + 拦截 1 + fx(explosion) 2 + fx(spark) 2 = 6 掷（拦截后 return——无散射/纵火掷）
//   首拦 inter 4→5：%5===0 播报门（L9362）
scenarios.push({
  key: 'S6', name: 'intercept',
  baseSeed: 30106, seed: 0x5e6f70, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: 47 * 256 + 68 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: 23 * 256 + 100 },
  ],
  rel: [['0-1', -80]],
  weapons0: [W_HYPER(1, 0, { inter: 4, dl: 0, q: [1, 0.6, 1, 1] })],   // 火炮低速 → pInt≈0.74；第 5 次拦截 → %5===0 播报
  weapSeq0: 2,
  doctrines0: [[0, 0.4, 0.3, 0.3, 0.3]],
  defenses0: [[1, 95.0, 10.0, 0.0]],         // 点防 95
  worldWar0: { phase: 'running', startTick: 4000, startYear: 78, endTick: 0, belligerents: [0, 1], pop0: { 0: 20, 1: 15 }, kills: 0, fallen: [], truces: 0, nukes: 0, lasers: 0, drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 0, winner: null, endText: '' },
  ops: [
    { op: 'fire', civ: 0, wid: 1 },
    { op: 'fire', civ: 0, wid: 1 },
    { op: 'fire', civ: 0, wid: 1 },
  ],
});

// S7 wonder 播报 + 非首射静默（fired>1 的 wonder 播报 / 非 wonder 非 first 静默）
scenarios.push({
  key: 'S7', name: 'wonder-announce',
  baseSeed: 30107, seed: 0x6f7081, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: 60 * 120 + 80 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: 100 * 120 + 60 },
  ],
  rel: [['0-1', -80]],
  weapons0: [
    W_HYPER(1, 0, { wonder: true, fired: 5 }),   // wonder：每次发射都播报
    W_HYPER(2, 0, { fired: 3 }),                  // 非 wonder 非 first：静默
  ],
  weapSeq0: 3,
  doctrines0: [[0, 0.4, 0.3, 0.3, 0.3]],
  defenses0: [[1, 0.0, 0.0, 0.0]],
  ops: [
    { op: 'fire', civ: 0, wid: 1 }, { op: 'fire', civ: 0, wid: 2 },
    { op: 'fire', civ: 0, wid: 1 }, { op: 'fire', civ: 0, wid: 2 },
  ],
});

// S8 多 foes 选敌（3 国混战 → foes.length=3 → 掷选其一；dead 国排除）
//   + 军团目标真命中（members 'spawn:0' 引用 → unitById 命中 → tx=m.x/m.y）
scenarios.push({
  key: 'S8', name: 'multi-foes',
  baseSeed: 30108, seed: 0x708192, yearF: 80.25, tickCount: 5000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: 60 * 120 + 80 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: 100 * 120 + 60 },
    { id: 2, name: '石民', colorHex: '#a3a3a3', pop: 30, gold: 9, techs: [], capital: 40 * 120 + 30 },
    { id: 3, name: '亡灵', colorHex: '#888888', pop: 0, gold: 0, techs: [], capital: -1, alive: false },
  ],
  rel: [['0-1', -80], ['0-2', -60], ['0-3', -90]],
  weapons0: [W_HYPER(1, 0)],
  weapSeq0: 2,
  doctrines0: [[0, 0.4, 0.3, 0.3, 0.3]],
  defenses0: [[1, 0.5, 1.0, 0.5], [2, 0.5, 1.0, 0.5]],
  spawn: [{ race: R.ELF, x: 92.5, y: 52.5, civ: 1, job: 0 }],
  armies0: [{ id: 0, civ: 1, x: 92.5, y: 52.5, morale: 60, members: ['spawn:0'] }],
  ops: [
    { op: 'fire', civ: 0, wid: 1 }, { op: 'fire', civ: 0, wid: 1 },
    { op: 'fire', civ: 0, wid: 1 }, { op: 'fire', civ: 0, wid: 1 },
  ],
});

// S9 emergentPayload：wid 无效早退 + rad 辐射环（radiate=40 + radSet tick+2400）
//   rad 面零掷（hypot 过滤无 rng）→ 观察窗 radiate 切片 + radSet 键值
scenarios.push({
  key: 'S9', name: 'payload-rad',
  baseSeed: 30109, seed: 0x8192a3, yearF: 80.25, tickCount: 7000,
  civs: [{ id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 }],
  weapons0: [W_HYPER(1, 0, { rad: true, terra: false, morale: 0, radius: 5.0 })],
  weapSeq0: 2,
  radWindow: [96, 56, 104, 64],   // (x0,y0,x1,y1) 观察窗——落点 100.5,60.5 半径 rr=round(5*0.4)=2
  ops: [
    { op: 'payload', wid: 999, x: 100.5, y: 60.5, r: 5.0 },        // 无效 wid 早退（零掷）
    { op: 'payload', wid: 1, x: 100.5, y: 60.5, r: 5.0 },          // rad 面：rr=2 → 落点圆内 isLand 染辐射
    { op: 'payload', wid: 1, x: 100.5, y: 60.5, r: 5.0 },          // 幂等重放（同值覆写）
  ],
  allowZeroDraws: true,            // rad 面零掷（无 terra/morale 掷）
});

// S10 emergentPayload：terra 奇点焦土（rng<0.7 掷/tile、MOUNTAIN 板留、BURNT 落地）
//   + 混合 rad+terra（rr 两环不同半径：0.4 vs 0.55）
scenarios.push({
  key: 'S10', name: 'payload-terra',
  baseSeed: 30110, seed: 0x92a3b4, yearF: 80.25, tickCount: 7000,
  civs: [{ id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 }],
  weapons0: [W_HYPER(1, 0, { rad: true, terra: true, morale: 0, radius: 4.0 })],
  weapSeq0: 2,
  radWindow: [96, 56, 106, 66],
  ops: [
    { op: 'payload', wid: 1, x: 101.5, y: 61.5, r: 4.0 },   // terra rr=round(4*0.55)=2 → 圆内 rng<0.7 焦土
    { op: 'payload', wid: 1, x: 101.5, y: 61.5, r: 4.0 },   // 二次轰击（BURNT 已是 land？isLand(BURNT) 真 → 再掷）
  ],
});

// S11 emergentPayload：morale 士气崩落（r+2.5 内敌军团、src 国豁免、morale=5 下限）
//   morale 面零掷
scenarios.push({
  key: 'S11', name: 'payload-morale',
  baseSeed: 30111, seed: 0xa3b4c5, yearF: 80.25, tickCount: 7000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: -1 },
  ],
  weapons0: [W_HYPER(1, 0, { rad: false, terra: false, morale: 30, radius: 3.0 })],
  weapSeq0: 2,
  armies0: [
    { id: 0, civ: 1, x: 100.5, y: 60.5, morale: 60, members: [] },   // 圆内敌军团 → 60-30=30
    { id: 1, civ: 1, x: 110.5, y: 60.5, morale: 60, members: [] },   // 圆外（3+2.5=5.5 < 10 距离）
    { id: 2, civ: 0, x: 100.5, y: 61.0, morale: 60, members: [] },   // src 国豁免（e.src=0）
    { id: 3, civ: 1, x: 101.0, y: 60.8, morale: 8, members: [] },    // 下限 5：8-30 → 5
  ],
  ops: [
    { op: 'payload', wid: 1, x: 100.5, y: 60.5, r: 3.0, src: 0 },
    // e.src undefined（int? null 镜像）：无豁免面——a.civ === e.src 恒假 → 全员吃崩落；
    //   e.r 直用（JS e.r ?? w.radius 的 undefined 态生产面不可达——fx 构造 r 恒数字，DIVERGENCE-1 注记）
    { op: 'payload', wid: 1, x: 100.5, y: 60.5, r: 3.0 },
  ],
  allowZeroDraws: true,            // morale 面零掷
});

// S12 wwCountKill：killCredit 反馈全支路（kills++/学说四漂移按 P·G·D 特性/q[0] 上行）
//   + worldWar kills 计数（belligerents 内）+ killCredit 无效武器直跳
//   反馈面零掷
scenarios.push({
  key: 'S12', name: 'wwkill-feedback',
  baseSeed: 30112, seed: 0xb4c5d6, yearF: 80.25, tickCount: 7000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: -1 },
  ],
  weapons0: [
    // pl=5 聚变（P.rad 真）→ terror 漂移；gd=4 量子（G.acc>0.7 → precision）+ G.sat+D.sat>0.3 → saturation
    W_HYPER(1, 0, { kills: 10, q: [1.3, 1.0, 1.0, 1.0] }),         // q[0]=1.3 → +0.012 → 1.312（未钳）
    W_HYPER(2, 0, { kills: 0, q: [1.395, 1.0, 1.0, 1.0] }),         // q[0] 钳 1.4 上界：1.395+0.012=1.407 → 1.4
    W_HYPER(3, 0, { kills: 0, pl: 0, dl: 1, gd: 0, pw: 0, q: [0.9, 1.0, 1.0, 1.0] }),  // 火箭 sat 0.35+哑弹 0 >0.3 → saturation 漂；哑弹 acc 0.3<0.5 && pw=0≤1 → attrition 漂
  ],
  weapSeq0: 4,
  doctrines0: [[0, 0.949, 0.949, 0.949, 0.949]],   // 钳 0.95 上界观察
  worldWar0: { phase: 'running', startTick: 6000, startYear: 78, endTick: 0, belligerents: [0, 1], pop0: { 0: 20, 1: 15 }, kills: 7, fallen: [], truces: 0, nukes: 0, lasers: 0, drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 0, winner: null, endText: '' },
  ops: [
    { op: 'wwKill', killCredit: 1, victimCiv: 1 },   // w1：kills 10→11、q[0] 1.3→1.312、terror/sat/prec 漂移、ww.kills 7→8
    { op: 'wwKill', killCredit: 2, victimCiv: 1 },   // w2：q[0] 钳 1.4
    { op: 'wwKill', killCredit: 3, victimCiv: 1 },   // w3：attrition 漂移（G.acc<0.5 && pw≤1）
    { op: 'wwKill', killCredit: 3, victimCiv: 1 },   // doctrine 各轴钳 0.95（0.949+0.006=0.955 → 0.95）
    { op: 'wwKill', killCredit: 999, victimCiv: 1 }, // 无效武器 id → 直跳（ww.kills 仍 +1）
    { op: 'wwKill', killCredit: 1, victimCiv: -1 },  // victim.civ<0 → 不计 ww.kills
    { op: 'killClear' },                              // 命中结算出口（killCredit=null）
    { op: 'wwKill', victimCiv: 1 },                   // killCredit null → 直跳 ww 计数
  ],
  allowZeroDraws: true,            // 反馈面零掷
});

// S13 全链组合：fire → payload → wwKill（发射-命中-击杀全反馈闭环 + 死国学说保护）
scenarios.push({
  key: 'S13', name: 'full-chain',
  baseSeed: 30113, seed: 0xc5d6e7, yearF: 80.25, tickCount: 7000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: 60 * 120 + 80 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: 100 * 120 + 60 },
    { id: 2, name: '石民', colorHex: '#a3a3a3', pop: 30, gold: 9, techs: [], capital: 40 * 120 + 30, alive: false },
  ],
  rel: [['0-1', -80], ['0-2', -60]],
  weapons0: [W_HYPER(1, 0, { rad: true, terra: true, morale: 25, radius: 3.5, wonder: true })],
  weapSeq0: 2,
  doctrines0: [[0, 0.3, 0.3, 0.3, 0.3]],
  defenses0: [[1, 2.0, 5.0, 2.0]],
  armies0: [
    { id: 0, civ: 1, x: 100.5, y: 60.5, morale: 55, members: [] },
    { id: 1, civ: 1, x: 101.2, y: 60.9, morale: 40, members: [] },
  ],
  worldWar0: { phase: 'running', startTick: 6000, startYear: 78, endTick: 0, belligerents: [0, 1], pop0: { 0: 20, 1: 15 }, kills: 0, fallen: [], truces: 0, nukes: 0, lasers: 0, drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 0, winner: null, endText: '' },
  radWindow: [97, 57, 105, 65],
  ops: [
    { op: 'fire', civ: 0, wid: 1 },                              // 发射（散射落点记录在 fx）
    { op: 'payload', wid: 1, x: 100.5, y: 60.5, r: 3.5, src: 0 }, // 命中附加（rad+terra+morale 全开）
    { op: 'wwKill', killCredit: 1, victimCiv: 1 },               // 击杀归属
    { op: 'wwKill', killCredit: 1, victimCiv: 1 },               // 二杀（kills 2）
  ],
});

// S14 死国学说保护 + pl/dl/gd 缺省路径（w.civ 指向死国 → attacker.alive 假 → 学说不漂移；q[0] 仍上行）
scenarios.push({
  key: 'S14', name: 'dead-civ-guard',
  baseSeed: 30114, seed: 0xd6e7f8, yearF: 80.25, tickCount: 7000,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: [], capital: -1 },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: [], capital: -1, alive: false },
  ],
  weapons0: [W_HYPER(1, 1)],    // 武器属国=1（死国）→ killCredit 反馈：kills/q[0] 上行但学说不漂移
  weapSeq0: 2,
  doctrines0: [[1, 0.3, 0.3, 0.3, 0.3]],
  ops: [
    { op: 'wwKill', killCredit: 1, victimCiv: 0 },
    { op: 'wwKill', killCredit: 1, victimCiv: 0 },
  ],
  allowZeroDraws: true,
});

// ============================================================================
// det 双跑 + 写盘
// ============================================================================
console.log('== gen-emergentfire: det 双跑 ==');
const runA = scenarios.map((s) => buildScenario(s));
const runB = scenarios.map((s) => buildScenario(s));
const ja = JSON.stringify(runA);
const jb = JSON.stringify(runB);
if (ja !== jb) {
  for (let i = 0; i < runA.length; i++) {
    if (JSON.stringify(runA[i]) !== JSON.stringify(runB[i])) throw new Error(`det 双跑失一致: S${runA[i].key}`);
  }
  throw new Error('det 双跑失一致（未定位）');
}
console.log('det 双跑字节级一致 ✓');

const golden = {
  meta: {
    gen: 'gen-emergentfire.mjs',
    slice: 'M-U31 发射面：fireEmergent + emergentPayload + wwCountKill',
    blueprint: 'engine.ts L8695-8719（wwCountKill killCredit 反馈）+ L8735/L8737（PAYLOAD_FX/DYN_TINTS）+ L9317-9400（fireEmergent）+ L9403-9442（emergentPayload）',
    detDoubleRun: 'byte-identical',
    snapshotProtocol: 'f64hex 位级 canonical（M-U28/29/30 协议）；fx 全字段扩协议（x0/y0/src/r/dmg/fire/wid/col）',
    generatedAt: new Date().toISOString(),
  },
  scenarios: runA,
};

const out1 = path.join(ROOT, 'scripts/unity-migration/golden/emergentfire.json');
writeFileSync(out1, JSON.stringify(golden));
const out2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/emergentfire.json');
writeFileSync(out2, JSON.stringify(golden));
console.log(`写入 ${out1} (${(JSON.stringify(golden).length / 1024).toFixed(1)}KB)`);
console.log(`写入 ${out2}（双写）`);
for (const s of runA) console.log(`  S${s.key} ${s.name}: ops=${s.ops.length} draws=${s.totalDraws} steps=${s.steps.length}`);
