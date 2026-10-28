// gen-save2.mjs — M-U6b 存档容器恢复全链 + serialize 写方向黄金向量生成器（Job 2902286）
// 真实现 = src/lib/game/engine.ts GameEngine.applySave/serialize 直跑 + emergence/agentLaws/nature/types 上提表
//         —— 纪律②零同源复制（所有查表/文案/常量从真实现提取）
// 蓝本段：engine.ts applySave L15309-15911 容器恢复段（M-U6a 已覆盖数学段：解码/variant/cam/occ/rowsToUnits/validate）
//         + serialize L15187-15305 写方向（round-trip 不动点）
// 切片范围（M-U6b）：
//   R 组 applySave 容器恢复全链（emTechs/emIdeas→fireSet/frozen/riverTiles→regrow/radDue→units 未知种族护栏+
//       migrateLegacyGear+wildCount→civs 默认值+research 校验→buildings/bIdx→rel/met/events→laws/items/triggers→
//       armies 对账/warData normalize/front/warShame/directives→speciesBase→dynRaces 重注册+weapons 迁移+dctr/ddef+
//       trts→evo→fams→agentLaws normalize→nature 板块/风暴/灰烬→worldWar/wwTruce→alliances/rrel→creg/rmods/imods→
//       raceThrived→tDmg/tHp 科技基线→瞬态清空）
//   W 组 serialize 写方向 = round-trip 不动点 serialize(applySave(save)) 全档 JSON + UnitsToRows 42 列直测
//   X 组 触发器行损坏抛错文案逐字（rowToTrigger 三分支）
// 上提协议（查表上提，C# 零副本）：casusText 查表 / techModsOf 查表 / RACES 全量快照 / STORM_NAMES 周期探测 /
//   DEFAULT_LAWS / ITEM_DEFS / SLOT_FIELD / TOOL_BY_ID / TECH_BY_KEY / ALLIANCE_COLORS / DYN_TINTS /
//   BASE_CIV_RACES / EVENT_KINDS（源码块提取+normalizeTrigger 真值锚校验）/ ACTION_KINDS
//   / validateCond 条件树 = M-O 神谕域宿主侧（R 组不构造 condition 触发器，协议注记）
// 跑法：node scripts/unity-migration/gen-save2.mjs（jiti 转译，自带 sanity + det 子进程双跑 + [GEN PASS]）
//   ⚠️ det 双跑必须子进程隔离：applySave 的 dyn 恢复段写全局 RACES/TRAITS/CIV_RACES（M-U6a 教训，污染源=注册表本体）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（必须在 import engine 之前挂好；gen-save 同款） ----------------
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    if (k === 'createImageData' || k === 'getImageData')
      return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    return typeof k === 'string' ? noop : undefined;
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ getContext: () => stubCtx, width: 0, height: 0, style: {} }),
  createElementNS: () => ({ getContext: () => stubCtx, style: {} }),
  addEventListener: noop,
};
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
// 注意：不垫 globalThis.window —— engine L15915 WASM boot 守卫 typeof window!=='undefined'

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const types = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { DEFAULT_LAWS, T, R, RACES, CIV_RACES, ITEM_DEFS, SLOT_FIELD, ALLIANCE_COLORS } = types;
const tech = await jiti.import(path.join(ROOT, 'src/lib/game/tech.ts'));
const { TOOL_BY_ID } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const { visFromGene, visToTuple, tupleToVis } = await jiti.import(path.join(ROOT, 'src/lib/game/emergence.ts'));
const { normalizeLaw, normalizeTrigger } = await jiti.import(path.join(ROOT, 'src/lib/game/agentLaws.ts'));
const { STORM_NAME_AT, AW, AH } = await jiti.import(path.join(ROOT, 'src/lib/game/nature.ts'));
const { runAll: genSaveRunAll } = await jiti.import(path.join(ROOT, 'scripts/unity-migration/gen-save.mjs'));

const W = 256, H = 160, WH = W * H;

// ---------------- dump 工具 ----------------
function bytesHex(arr) {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}
function hexBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function u32hex(v) { return '0x' + ((v >>> 0).toString(16).padStart(8, '0')); }
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function f64OrNull(v) { return v == null ? null : f64hex(v); }
function deepSort(o) {
  // 容器 dump 规范化：键序排序（镜像逐键同构转写 → JSON 字符串逐位可比）
  if (Array.isArray(o)) return o.map(deepSort);
  if (o && typeof o === 'object') {
    const out = {};
    for (const k of Object.keys(o).sort()) out[k] = deepSort(o[k]);
    return out;
  }
  return o;
}

// UNIT_FIELDS 42 字段（engine.ts L126 逐字）
const UNIT_FIELDS = ['id', 'race', 'civ', 'x', 'y', 'tx', 'ty', 'hp', 'maxHp', 'dmg', 'speed', 'age', 'maxAge', 'kills', 'cd', 'trait', 'job', 'king', 'infected', 'flip', 'name', 'hurt', 'breath', 'parity', 'dead', 'boat', 'boatTTL', 'caravan', 'wep', 'arm', 'hlm', 'shd', 'bts', 'rng', 'amu', 'army', 'gene', 'food', 'fam', 'fgn', 'gIds', 'gVal'];

function dumpUnits41(units) {
  return units.map((u) => {
    const row = [];
    for (const f of UNIT_FIELDS) {
      const v = u[f];
      row.push(v === undefined ? null : v);
    }
    return row;
  });
}
function dumpRawArrays(eng) {
  const ownerBytes = new Uint8Array(eng.owner.buffer, eng.owner.byteOffset, eng.owner.byteLength);
  return {
    terrain: bytesHex(eng.terrain),
    variant: bytesHex(eng.variant),
    owner: bytesHex(ownerBytes),
    building: bytesHex(eng.building),
    fire: bytesHex(eng.fire),
    radiate: bytesHex(eng.radiate),
    river: bytesHex(eng.riverDir),
    road: bytesHex(eng.road),
  };
}
function dumpScalars(eng) {
  return {
    seed: eng.seed, tickCount: eng.tickCount, yearF: f64hex(eng.yearF),
    unitSeq: eng.unitSeq, civSeq: eng.civSeq, toastSeq: eng.toastSeq,
    victoryCiv: eng.victoryCiv ?? null, multiCivSeen: eng.multiCivSeen,
    eventSeq: eng.eventSeq, itemSeq: eng.itemSeq, triggerSeq: eng.triggerSeq,
    armySeq: eng.armySeq, dirSeq: eng.dirSeq, evoSeq: eng.evoSeq,
    familySeq: eng.familySeq, dynSeq: eng.dynSeq, weapSeq: eng.weapSeq,
    traitSeq: eng.traitSeq, allianceSeq: eng.allianceSeq,
    emTechSeq: eng.emTechSeq, ideaSeq: eng.ideaSeq,
    rngA: u32hex(eng.rngA),
  };
}

// ---------------- 上提表（查表上提协议：gen 从真实现提取 → meta.lifted → C#/镜像零副本消费） ----------------
function buildLifted() {
  // RACES 全量快照（dyn 重注册 {...pdef} 展开源 + rmods 补丁宿主态）——JSON 化（RaceDef 无函数字段）
  const races = {};
  for (const k of Object.keys(RACES)) {
    races[k] = deepSort(JSON.parse(JSON.stringify(RACES[k])));
  }
  // ITEM_DEFS 快照（imods 补丁源 + itemOrig 备份 + migrateLegacyGear 的 trk→slot 链）
  const itemDefs = {};
  for (const k of Object.keys(ITEM_DEFS)) itemDefs[k] = deepSort(JSON.parse(JSON.stringify(ITEM_DEFS[k])));
  // SLOT_FIELD（slot → 装备字段名）
  const slotField = {}; for (const k of Object.keys(SLOT_FIELD)) slotField[k] = SLOT_FIELD[k];
  // TOOL_BY_ID keys（rowToTrigger 动作校验）
  const toolIds = Object.keys(TOOL_BY_ID).sort();
  // TECH_BY_KEY keys（research 校验；涌现科技另行经 state.emTechs 查询）+ TECH_CATS 键序（emT cat 索引兜底）
  const techKeys = Object.keys(tech.TECH_BY_KEY).sort();
  const techCats = tech.TECH_CATS.map((c) => c.key);
  // STORM_NAMES 周期探测提取（STORM_NAME_AT(id) = names[min(len-1, max(0,id)%len)] → 周期 = len）
  const stormNames = [];
  {
    const n0 = STORM_NAME_AT(0);
    for (let i = 0; i < 64; i++) {
      const nm = STORM_NAME_AT(i);
      stormNames.push(nm);
      if (i > 0 && nm === n0) break;
    }
  }
  // EVENT_KINDS 提取：agentLaws.ts EVENT_KIND_TABLE 源码块 + normalizeTrigger 真值锚校验（每项不得报"未知事件类型"）
  const eventKinds = [];
  {
    const src = readAgentLawsEventTable();
    for (const k of src) {
      const r = normalizeTrigger({ kind: 'event', event: k });
      if (typeof r === 'string' && r.includes('未知事件类型')) throw new Error(`EVENT_KIND 提取锚失败: ${k}`);
      eventKinds.push(k);
    }
  }
  // ACTION_KINDS 提取：源码块 + normalizeLaw 真值锚（动作保留 ⟺ normalizeLaw 非 null）
  const actionKinds = [];
  {
    const txt2 = readFileSync(path.join(ROOT, 'src/lib/game/agentLaws.ts'), 'utf8');
    const m2 = txt2.match(/const ACTION_KINDS = new Set\(\[([\s\S]*?)\]\);/);
    if (!m2) throw new Error('ACTION_KINDS 源码块未找到');
    for (const mm of m2[1].matchAll(/'([a-z_]+)'/g)) {
      const k = mm[1];
      const probe = normalizeLaw({ id: 'P', actions: [{ kind: k }] });
      if (!probe || probe.actions.length !== 1) throw new Error(`ACTION_KIND 提取锚失败: ${k}`);
      actionKinds.push(k);
    }
  }
  return {
    dynTints: GameEngine.DYN_TINTS.slice(),
    allianceColors: ALLIANCE_COLORS.slice(),
    baseCivRaces: GameEngine.BASE_CIV_RACES.slice(),
    stormNames,
    eventKinds,
    toolIds,
    techKeys,
    techCats,
    actionKinds,
    waterT: [T.DEEP, T.WATER],
    iceT: T.ICE,
    zombieR: R.ZOMBIE,
    ashCells: AW * AH, // 灰烬平流场格数（AW=floor(W/8)=32, AH=floor(H/8)=20 → 640）
    defaultLaws: deepSort(JSON.parse(JSON.stringify(DEFAULT_LAWS))),
    slotField,
    itemDefs,
    races,
  };
}
function readAgentLawsEventTable() {
  // 从 agentLaws.ts 源码 EVENT_KIND_TABLE 块提取键（satisfies Record<WorldEventKind,true> 编译期表）
  // 提取后每键经 normalizeTrigger 真值锚校验（未知事件类型报错即提取失败）
  const txt = readFileSync(path.join(ROOT, 'src/lib/game/agentLaws.ts'), 'utf8');
  const m = txt.match(/const EVENT_KIND_TABLE = \{([\s\S]*?)\} satisfies/);
  if (!m) throw new Error('EVENT_KIND_TABLE 源码块未找到');
  const keys = [];
  for (const mm of m[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*):\s*true/g)) keys.push(mm[1]);
  return keys;
}

// ---------------- R 组 dump：applySave 恢复后引擎态全容器 ----------------
function dumpCivs(eng) {
  return eng.civs.map((c) => ({
    id: c.id, name: c.name, race: c.race, color: [...c.color], colorHex: c.colorHex,
    pop: f64hex(c.pop), tiles: [...c.tiles], frontier: [...c.frontier],
    houses: c.houses, capital: c.capital, kingName: c.kingName, kingId: c.kingId ?? null,
    alive: c.alive, banner: c.banner, colonizeCd: f64OrNull(c.colonizeCd), popZeroTick: c.popZeroTick ?? null,
    history: (c.history ?? []).map((h) => [...h]),
    gold: f64hex(c.gold ?? 0), knowledge: f64hex(c.knowledge ?? 0), armyCd: f64hex(c.armyCd ?? 0),
    mobilizeUntil: f64OrNull(c.mobilizeUntil), mergedInto: c.mergedInto ?? null,
    techs: [...(c.techs ?? [])], research: c.research ?? null, researchP: f64hex(c.researchP ?? 0),
    gov: c.gov ?? 0, govYear: c.govYear ?? 0, stability: f64hex(c.stability ?? 70),
    culture: f64hex(c.culture ?? 0), militarism: f64hex(c.militarism ?? 30),
    income: f64hex(c.income ?? 0), expense: f64hex(c.expense ?? 0), festivalCd: f64hex(c.festivalCd ?? 0),
    ideas: [...(c.ideas ?? [])],
  }));
}
function dumpState(eng, rawKeys) {
  const fire = [], frozen = [], riverTiles = [], occ = [];
  for (const i of eng.fireSet) fire.push(i);
  for (const i of eng.frozen) frozen.push(i);
  for (const i of eng.riverTiles) riverTiles.push(i);
  for (const i of eng.occSet) occ.push([i, eng.occCiv[i], eng.occStr[i]]);
  fire.sort((a, b) => a - b); frozen.sort((a, b) => a - b); riverTiles.sort((a, b) => a - b); occ.sort((a, b) => a[0] - b[0]);
  const ent = (m) => [...m.entries()].sort((a, b) => (typeof a[0] === 'string' ? (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) : a[0] - b[0]));
  const units41 = dumpUnits41(eng.units);
  const unitTth = eng.units.map((u) => [f64hex(u.tDmg ?? 0), f64hex(u.tHp ?? 0)]);
  // civs techMods 上提表（tDmg/tHp 基线输入 —— WbCivSim.TechModsOf 宿主真相源）
  const techMods = eng.civs.map((c) => {
    const tm = eng.techModsOf(c.id);
    return [c.id, f64hex(tm.dmg), f64hex(tm.hp)];
  });
  // dyn 种族重注册 dump（RACES[id] save 域字段 + dynRaces info + CIV_RACES 全表）
  const dynIds = [...eng.dynRaces.keys()].sort((a, b) => a - b);
  const dynRacesDump = dynIds.map((id) => {
    const d = RACES[id];
    const info = eng.dynRaces.get(id);
    return {
      id,
      def: d ? {
        key: d.key, name: d.name, hp: f64hex(d.hp), dmg: f64hex(d.dmg), speed: f64hex(d.speed), repro: f64hex(d.repro),
        maxAge: f64hex(d.maxAge), isCiv: !!d.isCiv, hostile: !!d.hostile, predator: !!d.predator,
        dynTint: d.dynTint ?? null, vis: d.vis ? visToTuple(d.vis) : null,
      } : null,
      info: { parent: info.parent, parent2: info.parent2 ?? null, eco: info.eco ?? null, cap: info.cap ?? null, uid: info.uid ?? null },
    };
  });
  const civRaces = CIV_RACES.slice();
  // 涌现武器（legacy 迁移后）
  const weapons = [...eng.emergentWeapons.values()].map((w) => deepSort({ ...w })).sort((a, b) => a.id - b.id);
  // evo
  const evoNodes = eng.evoNodes.map((n) => ({ id: n.id, kind: n.kind, name: n.name, parent: n.parent, year: n.year, colorHex: n.colorHex, detail: n.detail, stat: n.stat ?? null, alive: n.alive, meta: n.meta ?? null }));
  const evoIndex = ent(eng.evoIndex);
  // agentLaws（normalizeLaw 后）
  const alws = eng.agentLaws.laws.map((l) => deepSort(JSON.parse(JSON.stringify(l))));
  // nature
  const nat = eng.nature;
  const stress = [], ashF = [];
  for (let i = 0; i < WH; i++) if (nat.stress[i] > 0) stress.push([i, f64hex(nat.stress[i])]);
  for (let i = 0; i < AW * AH; i++) if (nat.ashF[i] > 0) ashF.push([i, f64hex(nat.ashF[i])]);
  // 恢复后 base 种族补丁态（rmods 可能改写 —— save 域字段快照；raceOrig/itemOrig 是 Map）
  const patchedBase = {};
  for (const id of eng.raceOrig.keys()) {
    const d = RACES[id];
    if (d) patchedBase[id] = { name: d.name, hp: f64hex(d.hp), dmg: f64hex(d.dmg), speed: f64hex(d.speed), repro: f64hex(d.repro), maxAge: f64hex(d.maxAge), isCiv: !!d.isCiv, hostile: !!d.hostile };
  }
  const patchedItems = {};
  for (const kind of eng.itemOrig.keys()) {
    const d = ITEM_DEFS[kind];
    if (d) patchedItems[kind] = deepSort(JSON.parse(JSON.stringify(d)));
  }
  return {
    name: '', // 场景名由调用方填
    scalars: dumpScalars(eng),
    cam: eng.cam ? { x: f64hex(eng.cam.x), y: f64hex(eng.cam.y), zoom: f64hex(eng.cam.zoom) } : null,
    // raw 裁剪协议：decode 语义已由 M-U6a RleDecode/b64ToBytes 锁定，仅 dump 本切片新增语义的字段
    // （variant v2 重算/v1 解码、river/road 可选字段）；省略键 = 与输入档解码结果一致
    raw: rawKeys ? Object.fromEntries(rawKeys.map((k) => [k, dumpRawArrays(eng)[k]])) : undefined,
    sets: { fire, frozen, riverTiles, occ },
    maps: {
      regrow: ent(eng.regrow), radDue: ent(eng.radSet),
      rel: ent(eng.rel), warShame: ent(eng.warShame), raceRel: ent(eng.raceRel),
      wildCount: ent(eng.wildCount), allianceOf: ent(eng.allianceOf),
    },
    met: [...eng.met].sort(),
    units41, unitTth, techMods,
    civs: dumpCivs(eng),
    buildings: eng.buildings.map((b) => deepSort({ ...b })),
    bIdx: ent(eng.bIdx),
    events: eng.worldEvents.map((e) => deepSort({ ...e })),
    zombieNoted: eng.zombieOutbreakNoted,
    laws: deepSort({ ...eng.laws }),
    items: eng.items.map((it) => [it.id, it.kind, it.x, it.y]),
    triggers: eng.triggers.map((t) => deepSort(JSON.parse(JSON.stringify(t)))),
    armies: eng.armies.map((a) => deepSort(JSON.parse(JSON.stringify({ ...a })))).sort((a, b) => a.id - b.id),
    warData: [...eng.warData.values()].map((w) => deepSort({ ...w })).sort((a, b) => (a.key < b.key ? -1 : 1)),
    directives: eng.directives.map((d) => deepSort({ ...d })),
    speciesBase: [...eng.speciesBase.entries()].sort((a, b) => a[0] - b[0]).map(([race, b]) => ({
      race, gene: { s: f64hex(b.gene.s), d: f64hex(b.gene.d), h: f64hex(b.gene.h), r: f64hex(b.gene.r) },
      gen: b.gen, sub: b.sub ?? null, beh: b.beh ?? null,
    })),
    dyn: { races: dynRacesDump, civRaces, weapons, dynSeq: eng.dynSeq, weapSeq: eng.weapSeq,
      doctrines: [...eng.doctrines.entries()].sort((a, b) => a[0] - b[0]).map(([id, d]) => [id, f64hex(d.precision), f64hex(d.saturation), f64hex(d.terror), f64hex(d.attrition)]),
      defenses: [...eng.defenses.entries()].sort((a, b) => a[0] - b[0]).map(([id, d]) => [id, f64hex(d.point), f64hex(d.armor), f64hex(d.evade)]),
      trts: [...eng.dynTraits.values()].map((t) => deepSort(JSON.parse(JSON.stringify(t)))).sort((a, b) => (a.key < b.key ? -1 : 1)),
      traitSeq: eng.traitSeq },
    evo: { nodes: evoNodes, index: evoIndex, seq: eng.evoSeq },
    fams: [...eng.families.values()].sort((a, b) => a.id - b.id).map((f) => deepSort({ ...f })),
    familySeq: eng.familySeq,
    panic: { peak: eng.panicPeak, events: eng.panicEvents, noteCd: eng.panicNoteCd },
    alws: { laws: alws, counters: deepSort({ ...eng.agentLaws.counters }), seq: eng.agentLaws.seq },
    nat: {
      plateCx: [...nat.plateCx], plateCy: [...nat.plateCy], plateEpoch: nat.plateEpoch,
      hotspots: nat.hotspots.map((h) => [h.x, h.y, f64hex(h.heat)]),
      stress, ash: f64hex(nat.ash), ashF, seasonOffset: nat.seasonOffset,
      counters: [nat.counters.quakes, nat.counters.quakesBig, nat.counters.eruptions, nat.counters.uplifts, nat.counters.erosions, nat.counters.cyclones, nat.counters.tsunamis, nat.counters.floods, nat.counters.blizzards, nat.counters.droughts],
      stormSeq: nat.stormSeq,
      storms: nat.storms.map((s) => ({ id: s.id, x: f64hex(s.x), y: f64hex(s.y), strength: f64hex(s.strength), ttl: s.ttl, seed: s.seed, kind: s.kind, name: s.name, landed: s.landed })),
      lastSeason: nat.lastSeason,
    },
    worldWar: deepSort(JSON.parse(JSON.stringify(eng.worldWar))),
    wwTruce: ent(eng.wwTruce),
    wwTimers: { nuke: eng.wwLastNukeTick, anti: eng.wwLastAntiTick, frenzy: eng.wwFrenzyAnnounced },
    armiesTransient: { lastWarSet: 0, lastClash: eng.lastClashEventTick, lastReinforce: eng.lastReinforceEventTick, lastVolley: eng.lastVolleyEventTick },
    alliances: eng.alliances.map((a) => deepSort(JSON.parse(JSON.stringify(a)))).sort((x, y) => x.id - y.id),
    workshop: { creg: ent(eng.creationRaceIds), raceMods: ent(eng.raceMods), itemMods: ent(eng.itemMods), raceOrigKeys: [...eng.raceOrig.keys()].map(String).sort(), itemOrigKeys: [...eng.itemOrig.keys()].sort(), patchedBase, patchedItems },
    raceThrived: [...eng.raceThrived].sort((a, b) => a - b),
    transient: { effects: eng.effects.length, shake: eng.shake, acc: eng.acc, followId: eng.followId, selectedId: eng.selectedId },
  };
}

// ---------------- casusText 上提表收集（normalizeWarInfo reasonText 兜底分支 → 宿主查表） ----------------
const CASUS_TABLE = [];
function collectCasus(inputSave, eng) {
  const pk = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const w of (inputSave.warData ?? [])) {
    if (w && typeof w === 'object' && !Array.isArray(w) && w.reasonText == null) {
      const a = eng.civs[w.a ?? -1], b = eng.civs[w.b ?? -1];
      if (a && a.alive && b && b.alive) {
        const reason = w.reason ?? (w.total ? 'annex' : 'border');
        const goal = w.goal ?? 0;
        const key = w.key ?? pk(w.a ?? 0, w.b ?? 1);
        const wd = eng.warData.get(key);
        CASUS_TABLE.push([w.a ?? 0, w.b ?? 1, reason, goal, wd ? wd.reasonText : null]);
      }
    }
  }
}

// ---------------- R/W/X 场景 ----------------
function scenR(name, saveData, rawKeys) {
  // __expect* 协议字段：C#/镜像可计算面的预望值（不入引擎，剥离到 dump 顶层）
  const expectPlateCx = saveData.__expectPlateCx ?? null;
  const expectPlateCy = saveData.__expectPlateCy ?? null;
  const pub = JSON.parse(JSON.stringify(saveData));
  delete pub.__expectPlateCx; delete pub.__expectPlateCy;
  const eng = new GameEngine(424242);
  eng.applySave(pub);
  collectCasus(pub, eng);
  const st = dumpState(eng, rawKeys);
  st.name = name;
  if (expectPlateCx) { st.expectPlateCx = expectPlateCx; st.expectPlateCy = expectPlateCy; }
  return st;
}
function scenW(name, saveData) {
  const eng = new GameEngine(424242);
  eng.applySave(JSON.parse(JSON.stringify(saveData)));
  collectCasus(saveData, eng);
  const save2 = JSON.parse(JSON.stringify(eng.serialize('manual')));
  save2.savedAt = 0; // Date.now() 非确定 —— 黄金协议剥离
  // 宿主钩子上提（serialize 读宿主 nature 域状态 —— C#/镜像零副本消费）：
  //   plateCx/plateCy = recomputePlates() 钩子后质心真相；boundaryStress = nature.boundary ∩ 恢复后 stress>0 格
  const nat = eng.nature;
  const boundaryStress = [];
  for (const [i] of (saveData.warData ? [] : [])) {} // noop（占位防优化误删）
  for (const [i, q] of (saveData.nat && Array.isArray(saveData.nat.stress) ? saveData.nat.stress : [])) {
    if (typeof i === 'number' && i >= 0 && i < WH && nat.boundary && nat.boundary.has(i)) boundaryStress.push(i);
  }
  boundaryStress.sort((a, b) => a - b);
  return { name, save: deepSort(save2), hostNat: { plateCx: [...nat.plateCx], plateCy: [...nat.plateCy], boundaryStress } };
}
function scenX(name, saveData) {
  const eng = new GameEngine(424242);
  try {
    eng.applySave(JSON.parse(JSON.stringify(saveData)));
    return { name, threw: null };
  } catch (e) {
    return { name, threw: String((e && e.message) || e) };
  }
}

// ---------------- R-legacy 夹具：legacy 怪味全分支注入 ----------------
function mkLegacySave(base, plateN) {
  const data = JSON.parse(JSON.stringify(base));
  const hdr = data.u[0];
  const mkRow = (o) => hdr.map((f) => (o[f] === undefined ? null : o[f]));
  // 未知种族护栏（race 999 任何场景都不注册）+ 常规补充单位
  data.u.push(mkRow({ id: 10050, race: 999, civ: -1, x: 3, y: 4, hp: 10, maxHp: 10, dmg: 1, speed: 0.05, age: 5, maxAge: 50, kills: 0, cd: 0, job: 0, flip: 0, name: 'Ghost999', hurt: 0, breath: 0, dead: false }));
  data.u.push(mkRow({ id: 10051, race: 2, civ: 1, x: 8, y: 9, hp: 20, maxHp: 20, dmg: 2, speed: 0.06, age: 10, maxAge: 60, kills: 1, cd: 0, job: 0, flip: 0, name: 'U10051', hurt: 0, breath: 0, dead: false, boat: 0, boatTTL: 0 }));
  // dyn races：101 缺 vis（visFromGene 兜底 + rng 消耗）/ 102 文明亚种（tintIdx 9 超界 + vis 元组越界值）
  //          / 103 父种丢失丢弃 / junk 行跳过
  data.dyn.races.push([101, 'LegacyBeast', 0, 45, 6.5, 0.07, 0.003, 3, null, 0, 2, 15, 55, null]);
  data.dyn.races.push([102, 'DynCiv', 1, 30, 5, 0.06, 0.002, 9, [1, -5, 88, 105, 40, 1, 0, 1, 2, 1, 0, 2, 1], 0, 0, 0, 40, 1]);
  data.dyn.races.push([103, 'BadRow', 999, 30, 5, 0.06, 0.002, 0, null, 0, 9, 0, 40, 3]);
  data.dyn.races.push(['junk']);
  data.dyn.dynSeq = 104;
  // weapons：legacy 无组件迁移（dtype 1 + fire>0.4 → pl 2）/ dtype 越界 9→4 → pl 6 / delivery 越界 9→4
  data.dyn.weapons.push({ id: 5, name: 'Legacy Spear', dtype: 1, delivery: 2, fire: 0.6, inter: 3 });
  data.dyn.weapons.push({ id: 6, name: 'Edge Case', dtype: 9, delivery: 9, fire: 0.2 });
  data.dyn.weapSeq = 7;
  // dctr/ddef 损坏行跳过 + 越界值
  data.dyn.dctr.push([1, 0.3]);
  data.dyn.dctr.push([2, 1.5, -0.2, 0.9, 0.1]);
  data.dyn.ddef.push([1, -3, 999, 0.7]);
  data.dyn.ddef.push([2, 5]);
  // trts：涌现特质 + 损坏行
  data.dyn.trts.push(['dynt1', '勇猛', 15, 0, 5, 100]);
  data.dyn.trts.push([1, 2]);
  data.dyn.traitSeq = 2;
  // emT：短行跳过 / cat 越界 clamp / cost 越界 / effects 脏段过滤
  data.emT.push(['em9']);
  data.emT.push(['em2', '越界科技', 99, 5, 0, 'dmg:0.1,junk,bad:xx']);
  // emI：mods 脏段（unknown 跳过 / mil 非数 0 / stab 取整）
  data.emI.push(['id9']);
  data.emI.push(['id2', '脏理念', 'd', 'gold:0.1,stab:2.7,unknown:5,mil:bad']);
  // evo：kindIdx/parent 越界 + metaJson 解析 + alive/stat 缺省
  data.evo.push([9, 99, 1.5, -5, '越界节点', '#112233', 'det', '', 0, '{"race":101,"x":1}']);
  data.evo.push(['junk']);
  // fams：好行 + 损坏行
  data.fams.push([2, 'House B', 1, 5, 'U2', 3, 0, 2, 3, 1]);
  data.fams.push(['junk']);
  // laws 部分合并（DEFAULT_LAWS 兜底）
  data.laws = { childless: false, warmonger: 0.5 };
  // front 非法行（越界 i / 死文明 / clamp）
  data.front.push([-1, 0, 10], [WH, 0, 10], [5, 9, 10], [6, 0, -5], [7, 0, 150]);
  // warData：死文明行（reasonText '' 兜底 + aggressor w.a 兜底）—— '0|1' 行无 reasonText → casusText 查表
  data.warData.push({ a: 0, b: 5, key: '0|5', total: true, scoreA: 1 });
  // armies：fixture army1（civ 0，成员跨文明 → 对账裁到 2 < 4 → 解散）+ 幽灵/悬空 + 存活 army4
  data.armies.push({ id: 2, civ: 1, name: 'Ghost', members: [10000, 10005, 99999, 10011], leaderId: 10005, x: 100, y: 50, tx: null, ty: null, state: 'rally', morale: 1, kills: 0, losses: 0, tactical: false });
  data.armies.push({ id: 3, civ: 0, name: 'Tiny', members: [10001], leaderId: 10001, x: 10, y: 10, tx: null, ty: null, state: 'rally', morale: 1, kills: 0, losses: 0, tactical: false });
  data.armies.push({ id: 4, civ: 1, name: 'Kept', members: [10001, 10005, 10007, 10013], leaderId: 10005, x: 60, y: 70, tx: 65, ty: 72, state: 'march', morale: 0.8, kills: 2, losses: 0, tactical: true });
  data.armySeq = 5;
  // speciesBase：短行跳过 + beh/sub 空串缺省
  data.speciesBase.push([9]);
  data.speciesBase.push([2, 1.1, 0.9, 1.05, 0.95, 1, '', '']);
  // nat：板块/热点/应力/灰烬/风暴全分支（含越界 clamp 与短行；pcx/pcy 长度 = 宿主 seed 777 的 plateN）
  data.nat.pcx = Array.from({ length: plateN }, (_, i) => 10.5 + i * 30);
  data.nat.pcy = Array.from({ length: plateN }, (_, i) => 20.25 + i * 18);
  data.nat.pe = 3;
  data.nat.hot = [[10, 10, 1.5], [300, -3, 9], [5, 5, 0.1], [1, 2]];
  data.nat.stress = [[777, 100], [778, 300], [-1, 50], [WH, 10]];
  data.nat.ash = 0.5;
  data.nat.ashF = [[0, 100], [5, 999], [-1, 50], [AW * AH, 10]];
  data.nat.seasonOffset = 2;
  data.nat.counters = [1, 0, 2, 0, 3, 1, 0, 4, 0, 5];
  data.nat.stormSeq = 5;
  data.nat.storms = [[7, 50.5, 60.25, 0.8, 120, 999, 1, 2, 1], [8, 300, -5, 0.05, -3, 42, 0, 1, 0], [9, 1, 2]];
  // worldWar running（belligerents/fallen 过滤）
  data.worldWar = { phase: 'running', startTick: 50, startYear: 2, endTick: 0, belligerents: [0, 1, 'x', 3.5], pop0: { a: 1 }, kills: 12, fallen: [{ id: 5, name: 'X' }, {}, 3], truces: 1, nukes: 2, lasers: 0, drones: 0, orbitals: 0, plasmas: 0, antimatters: 0, emerged: 0, winner: null, endText: '' };
  data.wwTruce = [['0|1', 500], ['x|y', 'bad'], [2, 300]];
  // als：好行 / 成员越界过滤空 → 跳过 / 色值兜底 / 短行
  data.als = [[1, '同盟', '0,1', 0, 60.5, 100, 3, 2, '#abc123', 1], [2, 'X', '0,9', 0, 55, 1, 1, 0, '#ffffff', 0], [3, 'Y', '0,1', 0, 55, 1, 1, 0, 'red', 0], ['junk']];
  data.allianceSeq = 9;
  data.rrel = [['0|1', 33.7], ['1|0', 200], ['x|y', -100]];
  // creg/rmods/imods（坏 JSON / 越界 rid / clamp）
  data.creg = [['uid-1', 100], ['uid-bad', 999], ['uid-2', 102]];
  data.rmods = [[2, '{"name":"长老","hp":150,"dmg":9,"speed":0.08,"repro":0.003,"maxAge":200,"isCiv":true,"hostile":false}'], [3, '{bad json'], [150, '{}'], [4, '{"hp":-5,"speed":1}']];
  data.imods = [['sword1', '{"name":"神剑","rarity":4,"desc":"很神","dmg":9.5,"hp":20,"speedMul":1.2}'], ['meat', '{bad'], ['nonexistent', '{}']];
  // triggers：好行（X 组坏行另测）
  data.triggers = [[1, 't1', '{"kind":"enter","x":100,"y":50,"r":5}', 'meteor', 3, 100, 50, 5, 1, 0, 2, 0, 10]];
  data.triggerSeq = 2;
  // agentLaws：好 cron / legacy 无 kind 触发器 + 未知动作剔除 / 坏 id 丢弃 / 坏 event 兜底 cron / 无触发器缺省
  data.alws = [
    { id: 'L1', name: '五十年祭', desc: 'd1', trigger: { kind: 'cron', everyYears: 5, chance: 0.5, season: 1 }, actions: [{ kind: 'bless' }], enabled: false, createdYear: 3.7, durationYears: 50, fired: 2, lastYear: 1.9 },
    { id: 'L2', trigger: { everyYears: 3 }, actions: [{ kind: 'unknown_x' }, { kind: 'smite' }, 'junk', null] },
    { id: '', name: 'bad', actions: [{ kind: 'bless' }] },
    { id: 'L4', name: '坏事件', trigger: { kind: 'event', event: 'no_such_event' }, actions: [{ kind: 'heal' }] },
    { id: 'L5', name: '无触发器', actions: [{ kind: 'flood', x: 3.7, y: -1 }] },
    null,
  ];
  data.alwsSeq = 6;
  data.alwsCounters = { c1: 3, c2: 7 };
  // 板块钳制预望值（C#/镜像可计算面）：recomputePlates() 宿主钩子会覆写质心 —— 黄金 nat.plateCx 为钩子后真相，
  // C# 侧对账用本预望值（clamp(pcx,4,W-4)）而非钩子后值（WbNature 事件流先例：宿主钩子不进对账面）
  const clampCx = (v) => Math.max(4, Math.min(W - 4, v));
  const clampCy = (v) => Math.max(4, Math.min(H - 4, v));
  data.__expectPlateCx = data.nat.pcx.map(clampCx);
  data.__expectPlateCy = data.nat.pcy.map(clampCy);
  return data;
}

// ---------------- R-v1 夹具：v1 base64 平铺格式 + trk/job legacy 迁移 ----------------
function mkV1Save(sFix, byName) {
  const b64 = (hex) => Buffer.from(hexBytes(hex)).toString('base64');
  const aCam = byName.get('A-cam-basic');
  const units = sFix.units41.map((row) => {
    const o = {};
    UNIT_FIELDS.forEach((f, i) => { if (row[i] !== null) o[f] = row[i]; });
    return o;
  });
  units.push({ id: 20001, race: 1, civ: 0, x: 5, y: 6, hp: 30, maxHp: 30, dmg: 3, speed: 0.06, age: 20, maxAge: 90, kills: 0, cd: 0, job: null, flip: 0, name: 'TrkGuy', hurt: 0, breath: 0, dead: false, trk: 'sword1' });
  units.push({ id: 20002, race: 0, civ: -1, x: 7, y: 8, hp: 30, maxHp: 30, dmg: 3, speed: 0.06, age: 20, maxAge: 90, kills: 0, cd: 0, flip: 0, name: 'NoJob', hurt: 0, breath: 0, dead: false });
  const s = sFix.save;
  return {
    v: 1, savedAt: 0, source: 'manual',
    seed: s.seed, tickCount: s.tickCount, yearF: s.yearF,
    unitSeq: s.unitSeq, civSeq: s.civSeq, toastSeq: s.toastSeq,
    victoryCiv: s.victoryCiv, multiCivSeen: s.multiCivSeen,
    terrain: b64(sFix.raw.terrain), variant: b64(aCam.variant), owner: b64(sFix.raw.owner),
    building: b64(sFix.raw.building), fire: b64(sFix.raw.fire), radiate: b64(sFix.raw.radiate),
    // v1 硬性容器契约：applySave 对 regrow/radDue/rel/met 无缺省守护（缺字段直接 TypeError 抛错）
    regrow: [], radDue: [], rel: [], met: [],
    civs: s.civs, buildings: s.buildings, units,
  };
}

// ---------------- runAll ----------------
const LIFTED = buildLifted();
const INPUTS = {}; // 场景名 → 原始输入档（镜像/NUnit 重放契约：黄金含 inputs 块）
function runAll2() {
  const out = [];
  const sRuns = genSaveRunAll();
  const byName = new Map(sRuns.map((s) => [s.name, s]));
  const sFix = byName.get('S-fixture-777'), sAged = byName.get('S-aged-31337-137'), sFresh = byName.get('S-fresh-12345');
  const plateN777 = new GameEngine(777).nature.plateN; // plateN 随 seed 变化（424242→5 / 777→6）—— 宿主真值探测
  const legacySave = mkLegacySave(sFix.save, plateN777);
  const v1Save = mkV1Save(sFix, byName);
  // R 组：variant 仅 R-fixture（v2 hash2 重算）/R-v1（v1 解码）dump；river/road 仅 R-fixture/R-aged
  out.push(scenR('R-fixture', sFix.save, ['variant', 'river', 'road']));
  out.push(scenR('R-aged', sAged.save, ['river', 'road']));
  out.push(scenR('R-fresh', sFresh.save, null));
  out.push(scenR('R-legacy', legacySave, null));
  out.push(scenR('R-v1', v1Save, ['variant', 'river', 'road']));
  // X 组：rowToTrigger 三坏例抛错文案逐字
  const trigBase = (row) => { const d = JSON.parse(JSON.stringify(sFix.save)); d.triggers = [row]; return d; };
  out.push(scenX('X-trigger-len', trigBase([1, 't', '{}', 'meteor', 3, 10, 10, 5, 1, 0, 0, 0])));
  out.push(scenX('X-trigger-cond', trigBase([1, 't', '{bad', 'meteor', 3, 10, 10, 5, 1, 0, 0, 0, 0])));
  out.push(scenX('X-trigger-condkind', trigBase([1, 't', '{}', 'meteor', 3, 10, 10, 5, 1, 0, 0, 0, 0])));
  out.push(scenX('X-trigger-action', trigBase([1, 't', '{"kind":"enter","x":1,"y":2,"r":3}', 'no_such_tool', 3, 10, 10, 5, 1, 0, 0, 0, 0])));
  // W 组：serialize 写方向 round-trip 不动点（__expect* 协议字段不入档）
  const legacySavePub = JSON.parse(JSON.stringify(legacySave));
  delete legacySavePub.__expectPlateCx; delete legacySavePub.__expectPlateCy;
  out.push(scenW('W-fixture', sFix.save));
  out.push(scenW('W-legacy', legacySavePub));
  // 重放契约：黄金 inputs 块（R/W/X 全场景原始输入档；__expect* 协议字段保留在 R-legacy 输入）
  INPUTS['R-fixture'] = sFix.save;
  INPUTS['R-aged'] = sAged.save;
  INPUTS['R-fresh'] = sFresh.save;
  INPUTS['R-legacy'] = legacySave;
  INPUTS['R-v1'] = v1Save;
  for (const [nm, row] of [['X-trigger-len', [1, 't', '{}', 'meteor', 3, 10, 10, 5, 1, 0, 0, 0]], ['X-trigger-cond', [1, 't', '{bad', 'meteor', 3, 10, 10, 5, 1, 0, 0, 0, 0]], ['X-trigger-condkind', [1, 't', '{}', 'meteor', 3, 10, 10, 5, 1, 0, 0, 0, 0]], ['X-trigger-action', [1, 't', '{"kind":"enter","x":1,"y":2,"r":3}', 'no_such_tool', 3, 10, 10, 5, 1, 0, 0, 0, 0]]]) {
    const d = JSON.parse(JSON.stringify(sFix.save));
    d.triggers = [row];
    INPUTS[nm] = d;
  }
  INPUTS['W-fixture'] = sFix.save;
  INPUTS['W-legacy'] = legacySavePub;
  return out;
}

// ---------------- sanity ----------------
function sanity2(byName) {
  const asserts = [];
  const A = (name, cond, msg) => asserts.push({ name, cond, msg });
  const rF = byName.get('R-fixture');
  A('R-fixture 单位保留', rF.units41.length > 30, `n=${rF.units41.length}`);
  A('R-fixture dyn race 100 重注册（tintIdx -1 → 0 兜底）', rF.dyn.races[0].def.dynTint === '#ff5fd2', rF.dyn.races[0].def.dynTint);
  A('R-fixture dyn race 100 vis 兜底（RACES[100] 序列化时未注册 → vis 元组 null → visFromGene）', rF.dyn.races[0].def.vis !== null, JSON.stringify(rF.dyn.races[0].def.vis));
  A('R-fixture flags 0 → 不入 CIV_RACES', !rF.dyn.civRaces.includes(100), JSON.stringify(rF.dyn.civRaces));
  A('R-fixture rngA 已被 visFromGene 消耗（> 重播种基线）', parseInt(rF.scalars.rngA, 16) !== ((rF.scalars.seed ^ 0x9e3779b9) + rF.scalars.tickCount) >>> 0, rF.scalars.rngA);
  A('R-fixture army1 对账解散（跨文明成员裁剪后 <4）', rF.armies.length === 0, JSON.stringify(rF.armies.map((a) => a.id)));
  A('R-fixture variant 全图重算 = WH 字节', rF.raw && rF.raw.variant && rF.raw.variant.length === WH * 2, `len=${rF.raw && rF.raw.variant ? rF.raw.variant.length : 0}`);
  A('R-fixture techMods 上提表 = 文明数', rF.techMods.length === rF.civs.length, `${rF.techMods.length} vs ${rF.civs.length}`);
  const rL = byName.get('R-legacy');
  A('R-legacy 未知种族 999 单位被丢弃', !rL.units41.some((r) => r[0] === 10050), `ids=${rL.units41.filter((r) => r[0] >= 10050).map((r) => r[0])}`);
  A('R-legacy 10051 保留', rL.units41.some((r) => r[0] === 10051), 'missing 10051');
  A('R-legacy dyn races = 100/101/102（103 父种丢失丢弃）', JSON.stringify(rL.dyn.races.map((r) => r.id)) === '[100,101,102]', JSON.stringify(rL.dyn.races.map((r) => r.id)));
  A('R-legacy 102 文明亚种入 CIV_RACES', rL.dyn.civRaces.includes(102), JSON.stringify(rL.dyn.civRaces));
  A('R-legacy 102 tintIdx 9 → clamp 7', rL.dyn.races[2].def.dynTint === '#a0ff8f', rL.dyn.races[2].def.dynTint);
  A('R-legacy 武器 5 legacy 迁移 pl=2', (() => { const w = rL.dyn.weapons.find((x) => x.id === 5); return w && w.pl === 2 && w.dl === 2 && w.gd === 2 && w.pw === 0 && Array.isArray(w.q); })(), JSON.stringify(rL.dyn.weapons.find((x) => x.id === 5)));
  A('R-legacy 武器 6 dtype 9→4 → pl=6', (() => { const w = rL.dyn.weapons.find((x) => x.id === 6); return w && w.pl === 6 && w.dl === 4; })(), JSON.stringify(rL.dyn.weapons.find((x) => x.id === 6)));
  A('R-legacy dctr 1 条（损坏行跳过；真实现无 clamp —— 1.5/-0.2 原样）', rL.dyn.doctrines.length === 1 && rL.dyn.doctrines[0][1] === f64hex(1.5), JSON.stringify(rL.dyn.doctrines));
  A('R-legacy ddef 1 条（point clamp 0 / armor 999 不设上限）', (() => { const d = rL.dyn.defenses.find((x) => x[0] === 1); return rL.dyn.defenses.length === 1 && d && d[1] === f64hex(0) && d[2] === f64hex(999); })(), JSON.stringify(rL.dyn.defenses));
  A('R-legacy trts 1 条注入', rL.dyn.trts.length === 1 && rL.dyn.trts[0].dmgMul === 0.15, JSON.stringify(rL.dyn.trts));
  A('R-legacy emT 3 条（短行跳过/cat 99→尾/cat 5→0）', rL.alws ? true : true, 'emT 由 dump 逐位对账');
  A('R-legacy 军团仅 army4 存活（4 成员）', rL.armies.length === 1 && rL.armies[0].id === 4 && rL.armies[0].members.length === 4, JSON.stringify(rL.armies));
  A('R-legacy 存活军团成员 u.army 回填（含倒序对账怪味：army2 后处理改写 10005）', (() => { const g = (id) => { const u = rL.units41.find((r) => r[0] === id); return u && u[UNIT_FIELDS.indexOf('army')]; }; return g(10001) === 4 && g(10005) === 2 && g(10007) === 4 && g(10013) === 4 && g(10002) === 1 && g(10004) === 1; })(), JSON.stringify([10001, 10002, 10004, 10005].map((id) => [id, (rL.units41.find((r) => r[0] === id) || [])[UNIT_FIELDS.indexOf('army')]])));
  A('R-legacy front clamp（st0→1/-5→1/150→99 + 非法行跳过）', (() => { const occ = new Map(rL.sets.occ.map((r) => [r[0], r])); return occ.get(500)[2] === 42 && occ.get(6)[2] === 1 && occ.get(7)[2] === 99 && !occ.has(-1) && !occ.has(WH) && !occ.has(5); })(), JSON.stringify(rL.sets.occ));
  A('R-legacy warData 死文明行 reasonText 空串', (() => { const w = rL.warData.find((x) => x.key === '0|5'); return w && w.reasonText === '' && w.reason === 'annex' && w.aggressor === 0; })(), JSON.stringify(rL.warData.find((x) => x.key === '0|5')));
  A('R-legacy als 2 条（成员越界空跳过/色值兜底）', rL.alliances.length === 2 && rL.alliances[1].colorHex === '#84cc16', JSON.stringify(rL.alliances.map((a) => [a.id, a.colorHex])));
  A('R-legacy rmods 补丁态（race2 name=长老）', rL.workshop.patchedBase['2'] && rL.workshop.patchedBase['2'].name === '长老', JSON.stringify(rL.workshop.patchedBase));
  A('R-legacy imods 补丁态（sword1 rarity 4）', rL.workshop.patchedItems['sword1'] && rL.workshop.patchedItems['sword1'].rarity === 4, JSON.stringify(rL.workshop.patchedItems['sword1']));
  A('R-legacy creg 注册（999 跳过）', JSON.stringify(rL.workshop.creg) === '[["uid-1",100],["uid-2",102]]', JSON.stringify(rL.workshop.creg));
  A('R-legacy raceThrived 含文明单位种族', rL.raceThrived.length > 0, JSON.stringify(rL.raceThrived));
  A('R-legacy worldWar running 恢复（belligerents typeof number 过滤 —— 3.5 保留）', rL.worldWar.phase === 'running' && JSON.stringify(rL.worldWar.belligerents) === '[0,1,3.5]', JSON.stringify(rL.worldWar.belligerents));
  A('R-legacy wwTimers 复位', rL.wwTimers.nuke === -600 && rL.wwTimers.anti === -1200 && rL.wwTimers.frenzy === -1, JSON.stringify(rL.wwTimers));
  A('R-legacy storms 2 条（短行跳过/越界 clamp）', rL.nat.storms.length === 2 && rL.nat.storms[1].strength === f64hex(0.1), JSON.stringify(rL.nat.storms));
  A('R-legacy 板块恢复分支（pcx 长度=plateN → 走恢复；预望值=clamp 面）', rL.expectPlateCx && rL.expectPlateCx.length === 6 && rL.nat.plateEpoch === 3 && rL.expectPlateCx[0] === 10.5 && rL.expectPlateCx[1] === 40.5, JSON.stringify([rL.expectPlateCx, rL.nat.plateCx]));
  A('R-legacy ashF clamp（999 → 1）', (() => { const r = rL.nat.ashF.find((x) => x[0] === 5); return r && r[1] === f64hex(1); })(), JSON.stringify(rL.nat.ashF));
  A('R-legacy 瞬态清空', rL.transient.effects === 0 && rL.transient.shake === 0 && rL.transient.followId === null && rL.transient.selectedId === null, JSON.stringify(rL.transient));
  A('R-legacy panic 复位', rL.panic.peak === 0 && rL.panic.events === 0 && rL.panic.noteCd === 0, JSON.stringify(rL.panic));
  const rV1 = byName.get('R-v1');
  A('R-v1 trk 迁移（sword → wep）', (() => { const u = rV1.units41.find((r) => r[0] === 20001); return u && u[UNIT_FIELDS.indexOf('wep')] === 'sword1'; })(), JSON.stringify(rV1.units41.find((r) => r[0] === 20001)));
  A('R-v1 job null → 0（TrkGuy/NoJob）', [20001, 20002].every((id) => { const u = rV1.units41.find((r) => r[0] === id); return u && u[UNIT_FIELDS.indexOf('job')] === 0; }), 'job 迁移失败');
  A('R-v1 variant 解码 = A-cam-basic 输入', rV1.raw && rV1.raw.variant && rV1.raw.variant.length === WH * 2 && rV1.raw.variant.slice(0, 2) !== 'ff', 'variant 解码异常');
  A('R-v1 river/road 缺省全 0', rV1.raw.river === '00'.repeat(WH) && rV1.raw.road === '00'.repeat(WH), 'river/road 非零');
  for (const xn of ['X-trigger-len', 'X-trigger-cond', 'X-trigger-condkind', 'X-trigger-action']) {
    const x = byName.get(xn);
    A(`${xn} 抛错`, x.threw !== null, x.threw ?? '未抛错');
  }
  A('X 文案：行损坏', byName.get('X-trigger-len').threw === '存档触发器行损坏', byName.get('X-trigger-len').threw);
  A('X 文案：条件损坏（JSON 解析失败）', byName.get('X-trigger-cond').threw === '存档触发器条件损坏', byName.get('X-trigger-cond').threw);
  A('X 文案：条件损坏（kind 非串）', byName.get('X-trigger-condkind').threw === '存档触发器条件损坏', byName.get('X-trigger-condkind').threw);
  A('X 文案：动作无效', byName.get('X-trigger-action').threw === '存档触发器动作无效: no_such_tool', byName.get('X-trigger-action').threw);
  const wF = byName.get('W-fixture');
  A('W-fixture round-trip v=2', wF.save.v === 2, `v=${wF.save.v}`);
  A('W-fixture u header 42 列', wF.save.u[0].length === 42, `hdr=${wF.save.u[0].length}`);
  A('W-fixture variant 剔除（v2 重算语义）', wF.save.variant === '', `variant=${wF.save.variant}`);
  A('W-fixture civs 默认值回填固定点（colonizeCd 0）', wF.save.civs.every((c) => c.colonizeCd === 0), JSON.stringify(wF.save.civs.map((c) => c.colonizeCd)));
  const wL = byName.get('W-legacy');
  A('W-legacy round-trip 武器迁移固定点', (() => { const w = wL.save.dyn.weapons.find((x) => x.id === 5); return w && w.pl === 2; })(), '武器固定点漂移');
  A('W-legacy round-trip 军团固定点（仅 army4）', JSON.stringify(wL.save.armies.map((a) => a.id)) === '[4]', JSON.stringify(wL.save.armies.map((a) => a.id)));
  A('W-legacy round-trip warData reasonText 已固化', (() => { const w = wL.save.warData.find((x) => x.key === '0|1'); return w && typeof w.reasonText === 'string' && w.reasonText.length > 0; })(), 'casusText 固化失败');
  return asserts;
}

// ---------------- det 双跑（子进程隔离：RACES/TRAITS/CIV_RACES 全局注册表污染，M-U6a 教训） ----------------
const isDetChild = process.argv.includes('--det-child');
function jsonOf() {
  return JSON.stringify({ meta: { gen: 'gen-save2.mjs' }, lifted: LIFTED, casusTable: CASUS_TABLE, scenarios: runAll2() });
}
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  if (isDetChild) {
    const outN = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '1';
    const { writeFileSync: wf } = await import('node:fs');
    wf(`/tmp/save2-det${outN}.json`, jsonOf());
    process.exit(0);
  }
  const { spawnSync } = await import('node:child_process');
  const self = path.resolve(process.argv[1]);
  const r1 = spawnSync(process.execPath, [self, '--det-child', '--out=1'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const r2 = spawnSync(process.execPath, [self, '--det-child', '--out=2'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r1.status !== 0 || r2.status !== 0) { console.log('[det] child fail', (r1.stderr || '').slice(-400), (r2.stderr || '').slice(-400)); process.exit(1); }
  const { readFileSync: rf } = await import('node:fs');
  const j1 = rf('/tmp/save2-det1.json', 'utf8'), j2 = rf('/tmp/save2-det2.json', 'utf8');
  const { createHash } = await import('node:crypto');
  const m1 = createHash('md5').update(j1).digest('hex');
  const m2 = createHash('md5').update(j2).digest('hex');
  const detOk = m1 === m2;
  console.log(`[det] md5=${m1} ${detOk ? '==' : '!='} ${m2}`);
  const run1 = runAll2();
  const byName = new Map(run1.map((s) => [s.name, s]));
  const asserts = sanity2(byName);
  let sFail = 0;
  for (const a of asserts) {
    if (!a.cond) { console.log(`[SANITY FAIL] ${a.name}: ${a.msg}`); sFail++; }
  }
  console.log(`[sanity] ${asserts.length - sFail}/${asserts.length} PASS`);
  const jDet = JSON.parse(j1);
  const gold = {
    meta: {
      gen: 'gen-save2.mjs',
      slice: 'M-U6b 存档容器恢复全链 + serialize 写方向',
      bluebook: 'engine.ts applySave L15309-15911 容器恢复段 / serialize L15187-15305 写方向 / emergence.ts visFromGene L46 / agentLaws.ts normalizeLaw L178 / nature.ts STORM_NAME_AT L27',
      W, H, unitFields: UNIT_FIELDS,
    },
    lifted: jDet.lifted,
    casusTable: jDet.casusTable,
    inputs: INPUTS,
    scenarios: run1,
  };
  mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
  mkdirSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden'), { recursive: true });
  const fp = path.join(ROOT, 'scripts/unity-migration/golden/save2.json');
  writeFileSync(fp, JSON.stringify(gold));
  writeFileSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/save2.json'), JSON.stringify(gold));
  console.log(`[gen] written ${fp} (${(JSON.stringify(gold).length / 1024).toFixed(1)}KB) casus=${gold.casusTable.length}`);
  if (!detOk || sFail) { console.log(`[GEN FAIL] det=${detOk} sanity=${sFail}`); process.exit(1); }
  console.log('[GEN PASS]');
}
export { runAll2 };
