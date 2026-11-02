// ============================================================================
// gen-armory.mjs —— M-U30 切片「武器铸造域（forge face）+ armoryTick 全件」
//   蓝本 src/lib/game/engine.ts：
//   · 数据面：WEAP_EPI L8766 / WC_PAYLOAD L8878-8886 / WC_DELIVERY L8888-8894 /
//     WC_GUIDE L8896-8902 / WC_POWER L8904-8910（PAYLOAD_FX L8768 属发射面 M-U31 不入本轮）
//   · 学说/防御：doctrineOf L8913-8921（懒注入 4 掷）/ defenseOf L8923-8928（零掷）/
//     defenseCap L8930-8934
//   · 选型：pickComponent L8937-8983（加权抽奖 1 掷/次）
//   · 铸造：forgeWeapon L8985-9118（ fresh 10 掷 / 血系 8+突变槽 1 掷）/
//     fuseWeapon L9122-9204（1 掷 epi）/ forgeDivineWeapon L9206-9257（opts 全给零掷）
//   · 驱动：emergentForgeTick L9259-9315（war 四支路 4-6 掷/国 + peace 熵回零掷）
//   · 工坊：armamentOf L12207-12216 + armoryTick L12219-12264（头部武装 hammer 0.3 掷/件）
//   · 存档：serialize L15287-15291（weapons 透传/dynSeq/weapSeq/dctr 2dp/ddef 取整）/
//     applySave L15605-15620（weapons 形状门透传 + weapSeq max + dctr Number||0.2 + ddef max(0,·)）
//   切片边界（挂账注记）：fireEmergent L9317-9396 / emergentPayload L9397-9436 /
//     wwCountKill L8699-8715 学说反馈支路属发射面（killCredit 恒 null 死支路）→ M-U31；
//     WBB.touchMeta（armoryTick 头 L12220）未译维持 no-op（M-U28 槽 59 先例）；
//     PAYLOAD_FX/DYN_TINTS 数据表随发射面入账。
// 直接 import 现役 src/lib/game/engine.ts + types.ts（真实现，非复制）。
// 夹具 = 手术式字段直写（gen-agentlaws M-U28/29 协议）：构造 GameEngine(baseSeed)（构造器
//   generate 全链）后瞬态层清零 + civs/warData 清零 + civ/rel/weapons/doctrines/defenses
//   手术注入 + spawnUnit 真调用注入（掷数不计——rngA 尾置清零起流）→ ops 逐步直调
//   （armoryTick/forgeWeapon/fuseWeapon/forgeDivineWeapon/emergentForgeTick——系统结算不经
//   母体编排，tickCount 不 ++）+ 每步快照（rngA/gold/units/weapons canonical/doctrines/
//   defenses/weapSeq/fx/events/evoDelta）。
// det 双跑字节级 + chainDraws 掷数 sanity（M-U28 协议①）。
//
// 运行：bun scripts/unity-migration/gen-armory.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/armory.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/armory.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（在 import engine 之前挂好；同 gen-agentlaws.mjs） ----
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

// ---- 工具 ----
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

function chainDraws(state0, finalState) {   // mulberry 纯数学反解（gen-ice/gen-agentlaws 协议①）
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

// ---- 武器行 canonical（可选字段 absent/null 归一 → null；C# 同构） ----
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
  eng.yearF = spec.yearF;
  eng.tickCount = spec.tickCount;

  // civ 注入（forge face 触面字段：id/name/colorHex/alive/pop/gold/techs/capital）
  for (const c of spec.civs) {
    eng.civs.push({
      id: c.id, name: c.name, colorHex: c.colorHex, alive: c.alive !== false,
      pop: c.pop ?? 0, gold: c.gold, techs: [...(c.techs ?? [])],
      capital: c.capital ?? -1, tiles: [], frontier: [], ideas: null,
    });
  }
  // rel 注入（atWar L2067-2070：v < -20 即交战）
  for (const [k, v] of spec.rel ?? []) eng.rel.set(k, v);
  // 武器/学说/防御 注入（锻造池夹具——create 域无关，直写为 M-U28 法则注入先例）
  for (const w of spec.weapons0 ?? []) eng.emergentWeapons.set(w.id, JSON.parse(JSON.stringify(w)));
  eng.weapSeq = spec.weapSeq0 ?? 1;
  for (const [id, p, s, t, a] of spec.doctrines0 ?? [])
    eng.doctrines.set(id, { precision: p, saturation: s, terror: t, attrition: a });
  for (const [id, p, a, e] of spec.defenses0 ?? [])
    eng.defenses.set(id, { point: p, armor: a, evade: e });
  // evo 图谱基线（recordEvo delta 对账——C# 侧以 evoSeq0 对齐后增量可比）
  const evoSeq0 = eng.evoSeq;

  // spawn 真调用注入（掷数不计——rngA 尾置；M-U3h/M-U28 协议）
  const spawn0 = [];
  for (const sp of spec.spawn ?? []) {
    const u = eng.spawnUnit(sp.race, sp.x, sp.y, { silent: true, civ: sp.civ, job: sp.job, trait: '' });   // trait 显式 ''（零掷确定性——rollTrait 0.15 掷不入夹具）
    if (!u || u.dead) throw new Error(`S${spec.key}: spawn 失败 race=${sp.race}@${sp.x},${sp.y}`);
    if (sp.wep !== undefined) u.wep = sp.wep;
    if (sp.arm !== undefined) u.arm = sp.arm;
    if (sp.gold !== undefined) { /* civ gold 在 civs 注入面 */ }
    spawn0.push({ race: sp.race, x: f64hex(u.x), y: f64hex(u.y), civ: sp.civ ?? -1, job: sp.job ?? 0, wep: sp.wep ?? null, arm: sp.arm ?? null, trait: u.trait ?? null });
  }

  // 手术二（尾置）：rngA 清零起流 → ops 逐步直调 + 每步快照
  eng.rngA = spec.seed >>> 0;
  let prevForge = null;          // 'prev' 语义：最近一件非 null 铸造产物
  let lastRows = null;           // saveRows/applyRows 通道
  const steps = [];
  for (const op of spec.ops) {
    switch (op.op) {
      case 'armory':
        eng.armoryTick();                                        // L12219-12264（头武装 + 尾 emergentForgeTick）
        break;
      case 'forge': {
        const c = eng.civs[op.civ];
        const parent = op.parent === 'prev' ? prevForge
          : op.parent != null ? (eng.emergentWeapons.get(op.parent) ?? null) : null;
        const w = eng.forgeWeapon(c, parent);
        if (w) prevForge = w;
        break;
      }
      case 'fuse': {
        const c = eng.civs[op.civ];
        const wa = eng.emergentWeapons.get(op.a);
        const wb = eng.emergentWeapons.get(op.b);
        const w = eng.fuseWeapon(c, wa, wb);
        if (w) prevForge = w;
        break;
      }
      case 'divine':
        eng.forgeDivineWeapon(op.civ, op.opts ?? {});
        break;
      case 'forgeTick':
        eng.emergentForgeTick();                                 // L9259-9315
        break;
      case 'doctrine': eng.doctrineOf(op.civ); break;            // L8913（懒注入 4 掷）
      case 'defense': eng.defenseOf(op.civ); break;              // L8923（零掷）
      case 'armament': eng.armamentOf(eng.civs[op.civ]); break;  // L12207（零掷）
      case 'saveRows':                                           // serialize L15287-15291 直演
        lastRows = {
          weapons: [...eng.emergentWeapons.values()].map((w) => ({ ...w })),
          weapSeq: eng.weapSeq,
          dctr: [...eng.doctrines.entries()].map(([id, d]) => [id, Math.round(d.precision * 100) / 100, Math.round(d.saturation * 100) / 100, Math.round(d.terror * 100) / 100, Math.round(d.attrition * 100) / 100]),
          ddef: [...eng.defenses.entries()].map(([id, d]) => [id, Math.round(d.point), Math.round(d.armor), Math.round(d.evade)]),
        };
        break;
      case 'applyRows': {                                        // applySave L15605-15620 直演
        eng.emergentWeapons = new Map();
        eng.doctrines = new Map();
        eng.defenses = new Map();
        eng.weapSeq = 1;
        for (const w of lastRows.weapons) {
          if (w && typeof w.id === 'number' && typeof w.name === 'string') eng.emergentWeapons.set(w.id, { ...w });
        }
        eng.weapSeq = Math.max(1, lastRows.weapSeq ?? 1, ...[...eng.emergentWeapons.keys()].map((x) => x + 1));
        for (const row of lastRows.dctr) {
          if (!Array.isArray(row) || row.length < 5) continue;
          eng.doctrines.set(row[0] | 0, { precision: Number(row[1]) || 0.2, saturation: Number(row[2]) || 0.2, terror: Number(row[3]) || 0.2, attrition: Number(row[4]) || 0.2 });
        }
        for (const row of lastRows.ddef) {
          if (!Array.isArray(row) || row.length < 4) continue;
          eng.defenses.set(row[0] | 0, { point: Math.max(0, Number(row[1]) || 0), armor: Math.max(0, Number(row[2]) || 0), evade: Math.max(0, Number(row[3]) || 0) });
        }
        break;
      }
      default:
        throw new Error(`S${spec.key}: 未知 op ${op.op}`);
    }
    // 每步快照（canonical）
    steps.push({
      op: op.op,
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      gold: eng.civs.map((c) => f64hex(c.gold ?? 0)),
      units: eng.units.map((u) => ({ wep: u.wep ?? null, arm: u.arm ?? null, dmg: f64hex(u.dmg), hp: f64hex(u.hp), maxHp: f64hex(u.maxHp) })),
      weapons: [...eng.emergentWeapons.values()].map(weaponCanon),
      weapSeq: eng.weapSeq,
      doctrines: [...eng.doctrines.entries()].map(([id, d]) => [id, ...doctrineCanon(d)]),
      defenses: [...eng.defenses.entries()].map(([id, d]) => [id, ...defenseCanon(d)]),
      fxCount: eng.effects.length,
      fx: eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl) })),
      events: eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })),
      evoDelta: eng.evoNodes.filter((n) => n.id >= evoSeq0).map((n) => ({ id: n.id, kind: n.kind, name: n.name, parent: n.parent, year: n.year, colorHex: n.colorHex, detail: n.detail, stat: n.stat ?? null, meta: n.meta ?? null })),
      evoWp: [...eng.evoIndex.keys()].filter((k) => k.startsWith('wp:')).sort((a, b) => (Number(a.slice(3)) - Number(b.slice(3)))),
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
    evoSeq0,
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

// S1 armoryTick 头部武装（quota/budget 双封顶 + hammer 0.3 掷/件 + gold 账本）
scenarios.push({
  key: 'S1', name: 'armory-head',
  baseSeed: 20260, seed: 0x1a2b3c, yearF: 12.25, tickCount: 0,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 40, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 15, gold: 6, techs: ['bronze'] },
    { id: 2, name: '石民', colorHex: '#a3a3a3', pop: 30, gold: 100, techs: [] },
  ],
  spawn: [
    { race: R.HUMAN, x: 60.5, y: 60.5, civ: 0, job: 0 },
    { race: R.HUMAN, x: 61.5, y: 60.5, civ: 0, job: 1 },
    { race: R.HUMAN, x: 62.5, y: 60.5, civ: 0, job: 2 },
    { race: R.HUMAN, x: 63.5, y: 60.5, civ: 0, job: 1, wep: 'sword1' },
    { race: R.HUMAN, x: 64.5, y: 60.5, civ: 0, job: 0, arm: 'armor1' },
    { race: R.HUMAN, x: 65.5, y: 60.5, civ: 0, job: 2 },
    { race: R.HUMAN, x: 66.5, y: 60.5, civ: 0, job: 1 },
    { race: R.ELF, x: 90.5, y: 60.5, civ: 1, job: 0 },
    { race: R.ELF, x: 91.5, y: 60.5, civ: 1, job: 1 },
    { race: R.ELF, x: 92.5, y: 60.5, civ: 1, job: 2 },
    { race: R.ELF, x: 93.5, y: 60.5, civ: 1, job: 0 },
    { race: R.DWARF, x: 120.5, y: 60.5, civ: 2, job: 0 },
    { race: R.DWARF, x: 121.5, y: 60.5, civ: 2, job: 1 },
  ],
  ops: [{ op: 'armory' }, { op: 'armory' }, { op: 'armory' }],
});

// S2 学说/防御懒注入（doctrineOf 4 掷首访 + 缓存零掷 + defenseOf 零掷 + defenseCap）
scenarios.push({
  key: 'S2', name: 'doctrine-lazy',
  baseSeed: 20261, seed: 0x2b3c4d, yearF: 30.5, tickCount: 0,
  civs: [{ id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 20, gold: 200, techs: ['bronze', 'iron', 'steel', 'gunpowder'] }],
  ops: [
    { op: 'doctrine', civ: 0 }, { op: 'doctrine', civ: 0 },
    { op: 'defense', civ: 0 }, { op: 'defense', civ: 0 },
    { op: 'armament', civ: 0 },
  ],
});

// S3 全新铸造 ×3（fresh 10 掷/件：四槽 4 + q 4 + wonder 1 + epi 1）
scenarios.push({
  key: 'S3', name: 'forge-fresh',
  baseSeed: 20262, seed: 0x3c4d5e, yearF: 45.75, tickCount: 0,
  civs: [{ id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 25, gold: 500, techs: ['bronze', 'iron', 'steel', 'gunpowder'] }],
  ops: [{ op: 'forge', civ: 0, parent: null }, { op: 'forge', civ: 0, parent: null }, { op: 'forge', civ: 0, parent: null }],
});

// S4 血系迭代 ×2（突变槽 1 掷 + 继承 + 父代退役 + Mk 罗马名 + gold 代际涨价）
scenarios.push({
  key: 'S4', name: 'forge-lineage',
  baseSeed: 20263, seed: 0x4d5e6f, yearF: 60.5, tickCount: 0,
  civs: [{ id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 25, gold: 500, techs: ['bronze', 'iron', 'steel', 'gunpowder'] }],
  weapons0: [{
    id: 1, civ: 0, name: '高爆·火炮·惯导·焚天', gen: 3, dtype: 1, delivery: 0,
    dmg: 120.5, radius: 2.8, fire: 0.25, rad: false, terra: false, morale: 18, wonder: false,
    kills: 12, fired: 6, parent: null, bornYear: 40, retired: false,
    pl: 1, dl: 0, gd: 1, pw: 0, q: [1.1, 0.9, 1.05, 0.8], inter: 0,
  }],
  weapSeq0: 2,
  ops: [{ op: 'forge', civ: 0, parent: 1 }, { op: 'forge', civ: 0, parent: 'prev' }],
});

// S5 铸造门（tier<4 / gold<cost / active≥5——三 null 零掷面）
scenarios.push({
  key: 'S5', name: 'forge-gates',
  baseSeed: 20264, seed: 0x5e6f70, yearF: 70.25, tickCount: 0,
  civs: [
    { id: 0, name: '石邦', colorHex: '#a3a3a3', pop: 20, gold: 500, techs: ['bronze', 'iron'] },          // tier 2 < 4
    { id: 1, name: '贫邦', colorHex: '#8fd66f', pop: 20, gold: 5, techs: ['bronze', 'iron', 'steel', 'gunpowder'] }, // gold < 12+6
    { id: 2, name: '满邦', colorHex: '#7df9ff', pop: 20, gold: 500, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
  ],
  weapons0: [1, 2, 3, 4, 5].map((i) => ({
    id: i, civ: 2, name: `高爆·火炮·惯导·焚天${i}`, gen: 1, dtype: 1, delivery: 0,
    dmg: 60, radius: 2, fire: 0.2, rad: false, terra: false, morale: 10, wonder: false,
    kills: 0, fired: 0, parent: null, bornYear: 50, retired: false,
    pl: 1, dl: 0, gd: 1, pw: 0, q: [1, 1, 1, 1], inter: 0,
  })),
  weapSeq0: 6,
  ops: [
    { op: 'forge', civ: 0, parent: null },
    { op: 'forge', civ: 1, parent: null },
    { op: 'forge', civ: 2, parent: null },
  ],
  allowZeroDraws: true, minDraws: 0,
});

// S6 融合铸造（四槽取优零掷 + 杂种优势 + 双亲退役 + parent2 + 同体/异国 null）
scenarios.push({
  key: 'S6', name: 'fuse',
  baseSeed: 20265, seed: 0x6f7081, yearF: 80.5, tickCount: 0,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 25, gold: 500, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 25, gold: 500, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
  ],
  weapons0: [
    { id: 1, civ: 0, name: '铝热·火箭·精导·裂地', gen: 2, dtype: 1, delivery: 1, dmg: 150.2, radius: 3.1, fire: 0.5, rad: false, terra: false, morale: 20, wonder: false, kills: 3, fired: 5, parent: null, bornYear: 60, retired: false, pl: 2, dl: 1, gd: 2, pw: 1, q: [1.2, 0.8, 1.0, 0.9], inter: 0 },
    { id: 2, civ: 0, name: '穿甲·滑翔·量子·静默', gen: 2, dtype: 0, delivery: 3, dmg: 90.7, radius: 2.0, fire: 0.05, rad: false, terra: false, morale: 12, wonder: false, kills: 20, fired: 7, parent: null, bornYear: 62, retired: false, pl: 0, dl: 3, gd: 4, pw: 2, q: [0.9, 1.3, 1.15, 0.7], inter: 2 },
    { id: 3, civ: 1, name: '毒剂·火炮·哑弹·蚀海', gen: 1, dtype: 3, delivery: 0, dmg: 55, radius: 1.9, fire: 0, rad: true, terra: false, morale: 14, wonder: false, kills: 0, fired: 0, parent: null, bornYear: 65, retired: false, pl: 4, dl: 0, gd: 0, pw: 0, q: [1.0, 1.0, 1.0, 1.0], inter: 0 },
  ],
  weapSeq0: 4,
  ops: [
    { op: 'fuse', civ: 0, a: 1, b: 1 },     // 同体 → null
    { op: 'fuse', civ: 0, a: 1, b: 3 },     // 异国 → null
    { op: 'fuse', civ: 0, a: 1, b: 2 },     // 真融合
  ],
});

// S7 神铸（opts 全给零掷 + 钳制 + 默认选型掷 + 死国 null）
scenarios.push({
  key: 'S7', name: 'divine',
  baseSeed: 20266, seed: 0x708192, yearF: 90.75, tickCount: 0,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 25, gold: 500, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
    { id: 1, name: '亡邦', colorHex: '#666666', pop: 0, gold: 500, techs: ['bronze', 'iron', 'steel', 'gunpowder'], alive: false },
  ],
  ops: [
    { op: 'divine', civ: 0, opts: { name: '天启之刃', pl: 6, dl: 4, gd: 4, pw: 4, boost: 2.5 } },   // 全钦定零掷
    { op: 'divine', civ: 0, opts: { pl: 99, dl: -3, boost: 99 } },                                   // 钳制面（pl 99→6, dl -3→0 钳下界非默认选型, boost→3）
    { op: 'divine', civ: 0, opts: {} },                                                              // 全默认（四槽选型 4 掷）
    { op: 'divine', civ: 1, opts: { name: '亡者之器' } },                                            // 死国 → null
  ],
});

// S8 emergentForgeTick 交战驱动（融合 0.18 / 迭代 0.55 / 缴获 0.25+0.5 / 全新 0.1 分支序
//   + 和平国防御荒废/学说熵回零掷面）
scenarios.push({
  key: 'S8', name: 'forge-tick-war',
  baseSeed: 20267, seed: 0x8192a3, yearF: 100.5, tickCount: 0,
  civs: [
    { id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 25, gold: 800, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
    { id: 1, name: '岚国', colorHex: '#5fe8ff', pop: 25, gold: 800, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
    { id: 2, name: '中立国', colorHex: '#c9ff5f', pop: 25, gold: 800, techs: ['bronze', 'iron', 'steel', 'gunpowder'] },
  ],
  rel: [['0-1', -30]],
  weapons0: [
    { id: 1, civ: 0, name: '铝热·火箭·精导·裂地', gen: 2, dtype: 1, delivery: 1, dmg: 150.2, radius: 3.1, fire: 0.5, rad: false, terra: false, morale: 20, wonder: false, kills: 3, fired: 5, parent: null, bornYear: 60, retired: false, pl: 2, dl: 1, gd: 2, pw: 1, q: [1.2, 0.8, 1.0, 0.9], inter: 0 },
    { id: 2, civ: 0, name: '穿甲·滑翔·量子·静默', gen: 2, dtype: 0, delivery: 3, dmg: 90.7, radius: 2.0, fire: 0.05, rad: false, terra: false, morale: 12, wonder: false, kills: 20, fired: 7, parent: null, bornYear: 62, retired: false, pl: 0, dl: 3, gd: 4, pw: 2, q: [0.9, 1.3, 1.15, 0.7], inter: 2 },
    { id: 3, civ: 0, name: '高爆·火炮·惯导·惊雷', gen: 1, dtype: 1, delivery: 0, dmg: 70, radius: 2.4, fire: 0.25, rad: false, terra: false, morale: 10, wonder: false, kills: 15, fired: 9, parent: null, bornYear: 63, retired: false, pl: 1, dl: 0, gd: 1, pw: 0, q: [1.0, 1.0, 1.0, 1.0], inter: 0 },
    { id: 4, civ: 1, name: '毒剂·钻地·蜂群·湮灭', gen: 1, dtype: 3, delivery: 2, dmg: 65, radius: 2.2, fire: 0, rad: true, terra: false, morale: 14, wonder: false, kills: 18, fired: 4, parent: null, bornYear: 64, retired: false, pl: 4, dl: 2, gd: 3, pw: 0, q: [1.0, 1.0, 1.0, 1.0], inter: 0 },
  ],
  weapSeq0: 5,
  doctrines0: [[2, 0.55, 0.35, 0.15, 0.45]],
  defenses0: [[2, 9.3, 14.7, 3.1], [0, 2.0, 3.0, 1.0], [1, 4.0, 5.0, 2.0]],
  ops: [
    { op: 'forgeTick' }, { op: 'forgeTick' }, { op: 'forgeTick' },
    { op: 'forgeTick' }, { op: 'forgeTick' }, { op: 'forgeTick' },
  ],
});

// S9 存档行面（serialize L15287-15291 直演 → applyRows L15605-15620 直演 → 回读稳定）
scenarios.push({
  key: 'S9', name: 'save-rows',
  baseSeed: 20268, seed: 0x92a3b4, yearF: 110.25, tickCount: 0,
  civs: [{ id: 0, name: '焰邦', colorHex: '#ff5f3d', pop: 25, gold: 500, techs: ['bronze', 'iron', 'steel', 'gunpowder'] }],
  weapons0: [{
    id: 1, civ: 0, name: '电脉·轨道·量子·噬星', gen: 1, dtype: 2, delivery: 4, dmg: 88.4, radius: 2.6, fire: 0, rad: false, terra: false, morale: 24, wonder: false, kills: 0, fired: 0, parent: null, bornYear: 100, retired: false, pl: 3, dl: 4, gd: 4, pw: 0, q: [1.05, 0.95, 1.1, 0.85], inter: 1,
  }],
  weapSeq0: 2,
  doctrines0: [[0, 0.333, 0.444, 0.555, 0.666]],
  defenses0: [[0, 12.6, 33.3, 7.7]],
  ops: [
    { op: 'forge', civ: 0, parent: null },
    { op: 'saveRows' },
    { op: 'applyRows' },
    { op: 'saveRows' },
    { op: 'doctrine', civ: 0 },   // 恢复后 doctrineOf 缓存命中（不再掷）
  ],
});

// ============================================================================
// det 双跑 + 写盘
// ============================================================================
console.log('== gen-armory: det 双跑 ==');
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
    gen: 'gen-armory.mjs',
    slice: 'M-U30 武器铸造域（forge face）+ armoryTick 全件',
    blueprint: 'engine.ts L8745-9315（WEAP_EPI/三组件表/doctrineOf/defenseOf/defenseCap/pickComponent/forgeWeapon/fuseWeapon/forgeDivineWeapon/emergentForgeTick）+ L12207-12264（armamentOf/armoryTick）+ L15287-15291（serialize weapons/dctr/ddef）+ L15605-15620（applySave 恢复）',
    detDoubleRun: 'byte-identical',
    snapshotProtocol: 'f64hex 位级 canonical（M-U28/29 协议）；weapons 行可选字段 absent→null 归一',
    generatedAt: new Date().toISOString(),
  },
  scenarios: runA,
};

const out1 = path.join(ROOT, 'scripts/unity-migration/golden/armory.json');
writeFileSync(out1, JSON.stringify(golden));
const out2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/armory.json');
writeFileSync(out2, JSON.stringify(golden));
console.log(`写入 ${out1} (${(JSON.stringify(golden).length / 1024).toFixed(1)}KB)`);
console.log(`写入 ${out2}（双写）`);
for (const s of runA) console.log(`  S${s.key} ${s.name}: ops=${s.ops.length} draws=${s.totalDraws} steps=${s.steps.length}`);
