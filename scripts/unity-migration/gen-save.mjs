// gen-save.mjs — M-U6a 存档编解码核心黄金向量生成器（Job 2902286）
// 真实现 = src/lib/game/engine.ts GameEngine.serialize/applySave 直跑 + saveSafe.ts validateSaveData
//         + noise.ts hash2 —— 纪律②零同源复制
// 蓝本段：engine.ts serialize L15187-15305 / applySave L15309-15911 /
//         bytesToB64 L74 / b64ToBytes L82 / rleEncode L92 / rleDecode L106 / unitsToRows L128 / rowsToUnits L140 /
//         variant 重算 L15325-15327（hash2(x,y,seed+999)*255 Floor）/ rng 重播种 L15348（(seed^0x9e3779b9)+tick u32）/
//         cam clamp L15343-15346（1.2..24）/ occ clamp L15505（1..99）/
//         saveSafe.ts validateSaveData L125-168（全错误分支文案逐字）
// 切片范围（M-U6a 读方向 = Unity 读 TS 存档第一层）：
//   S 组 serialize 真世界 round-trip（RLE/b64/列式 u 行）—— C# RleDecode(黄金) == 引擎内数组 hex；RleEncode(hex) == 黄金字串
//   A 组 applySave 数学段（variant 重算 hex / rngA u32 / cam clamp / occ front clamp）
//   H 组 hash2 / ReseedRng 数学单元（f64/u32 bits）
//   V 组 validateSaveData 全错误分支（16 场景文案逐字）
// 跑法：node scripts/unity-migration/gen-save.mjs（jiti 转译，自带 sanity + det 双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片（必须在 import engine 之前挂好；gen-units-civtick 同款） ----------------
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
// 注意：不垫 globalThis.window —— engine L15915 WASM boot 守卫 typeof window!=='undefined'

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { hash2 } = await jiti.import(path.join(ROOT, 'src/lib/game/noise.ts'));
const { validateSaveData } = await jiti.import(path.join(ROOT, 'src/lib/game/saveSafe.ts'));

const W = 256, H = 160, WH = W * H;

// ---------------- dump 工具 ----------------
function bytesHex(arr) {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}
function u32hex(v) { return '0x' + ((v >>> 0).toString(16).padStart(8, '0')); }
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}

// UNIT_FIELDS 42 字段（engine.ts L126 逐字）—— units41 直读协议（rowsToUnits 对账目标）
const UNIT_FIELDS = ['id', 'race', 'civ', 'x', 'y', 'tx', 'ty', 'hp', 'maxHp', 'dmg', 'speed', 'age', 'maxAge', 'kills', 'cd', 'trait', 'job', 'king', 'infected', 'flip', 'name', 'hurt', 'breath', 'parity', 'dead', 'boat', 'boatTTL', 'caravan', 'wep', 'arm', 'hlm', 'shd', 'bts', 'rng', 'amu', 'army', 'gene', 'food', 'fam', 'fgn', 'gIds', 'gVal'];

function dumpUnits41(units) {
  // 直读引擎真对象 42 字段（undefined→null JSON 语义；对象字段 wep/gene 原样入 JSON）
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
  // 引擎内数组原样 hex —— RleDecode 对账目标（owner 按 Int16Array 字节视图）
  const ownerBytes = new Uint8Array(eng.owner.buffer, eng.owner.byteOffset, eng.owner.byteLength);
  return {
    terrain: bytesHex(eng.terrain),
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
    victoryCiv: eng.victoryCiv, multiCivSeen: eng.multiCivSeen,
    eventSeq: eng.eventSeq, itemSeq: eng.itemSeq, triggerSeq: eng.triggerSeq,
    armySeq: eng.armySeq, dirSeq: eng.dirSeq, evoSeq: eng.evoSeq,
    familySeq: eng.familySeq, dynSeq: eng.dynSeq, weapSeq: eng.weapSeq,
    traitSeq: eng.traitSeq, allianceSeq: eng.allianceSeq,
    rngA: u32hex(eng.rngA),
  };
}
function stripNonDet(save) {
  // savedAt = Date.now() 非确定 —— 黄金协议剥离（C# 对账跳过该字段）
  const s = { ...save };
  s.savedAt = 0;
  return s;
}

// ---------------- 场景组 S：真世界 serialize ----------------
function mkAged(seed, ticks) {
  const eng = new GameEngine(seed);
  for (let i = 0; i < ticks; i++) eng.tick();
  return eng;
}
// 手动文明夹具（gen-units-civtick mkCiv 同构 —— 137/251 tick 自然演化未必建国，容器覆盖靠注入）
function mkCiv(eng, o) {
  const civ = {
    id: o.id, name: o.name ?? `C${o.id}`, race: o.race ?? 0,
    color: o.color ?? [200, 60, 60], colorHex: o.colorHex ?? '#c83c3c',
    pop: o.pop ?? 0, tiles: o.tiles ? [...o.tiles] : [], frontier: o.frontier ? [...o.frontier] : [],
    houses: o.houses ?? 0, capital: o.capital ?? -1,
    culture: o.culture ?? 0,
    kingName: o.kingName ?? 'K', kingId: o.kingId, alive: o.alive ?? true,
    banner: o.banner ?? 'B', colonizeCd: o.colonizeCd ?? 0,
    popZeroTick: o.popZeroTick, history: o.history ? [...o.history] : [],
    gold: o.gold ?? 0, knowledge: o.knowledge ?? 0,
    armyCd: o.armyCd ?? 0, mobilizeUntil: o.mobilizeUntil,
    mergedInto: o.mergedInto, techs: o.techs ? [...o.techs] : [], research: o.research ?? null, researchP: o.researchP ?? 0,
    gov: o.gov ?? 0, govYear: o.govYear ?? 0, stability: o.stability ?? 70,
    militarism: o.militarism ?? 30, income: o.income ?? 0, expense: o.expense ?? 0, festivalCd: o.festivalCd ?? 0,
  };
  if (o.ideas) civ.ideas = [...o.ideas];
  eng.civs.push(civ);
  eng.civs[civ.id] = civ;
  eng.civSeq = Math.max(eng.civSeq ?? 0, (o.id ?? 0) + 1);
  for (const i of civ.tiles) eng.owner[i] = civ.id;
  return civ;
}
function mkU42(o) {
  // 42 字段全量单位夹具（UNIT_FIELDS 逐字段；undefined 字段真正缺省）
  const u = {};
  const set = (k, v) => { if (v !== undefined) u[k] = v; };
  set('id', o.id); set('race', o.race ?? 0); set('civ', o.civ ?? -1);
  set('x', o.x ?? 40); set('y', o.y ?? 30); set('tx', o.tx); set('ty', o.ty);
  set('hp', o.hp ?? 60); set('maxHp', o.maxHp ?? 60); set('dmg', o.dmg ?? 5); set('speed', o.speed ?? 0.06);
  set('age', o.age ?? 20); set('maxAge', o.maxAge ?? 100);
  set('kills', o.kills ?? 0); set('cd', o.cd ?? 0); set('trait', o.trait); set('job', o.job ?? 0);
  set('king', o.king); set('infected', o.infected); set('flip', o.flip ?? 0);
  set('name', o.name ?? `U${o.id}`); set('hurt', o.hurt ?? 0); set('breath', o.breath ?? 0);
  set('parity', o.parity); set('dead', o.dead ?? false); set('boat', o.boat); set('boatTTL', o.boatTTL);
  set('caravan', o.caravan); set('wep', o.wep); set('arm', o.arm); set('hlm', o.hlm);
  set('shd', o.shd); set('bts', o.bts); set('rng', o.rng); set('amu', o.amu);
  set('army', o.army); set('gene', o.gene); set('food', o.food);
  set('fam', o.fam); set('fgn', o.fgn); set('gIds', o.gIds); set('gVal', o.gVal);
  return u;
}
// 全容器注入场景：civs/buildings/armies/events/items/rel/met/regrow/radDue/triggers/speciesBase/dyn
// （serialize 全字段结构覆盖 —— 列式 u 行含对象/null/缺省三态）
function mkFixture(seed) {
  const eng = new GameEngine(seed);
  const t0 = eng.seed % WH;
  const civ0 = mkCiv(eng, { id: 0, pop: 24, tiles: [t0, (t0 + 1) % WH, (t0 + 2) % WH, (t0 + W) % WH, (t0 + W + 1) % WH, (t0 + 2 * W) % WH], houses: 2, capital: t0, gold: 120.5, knowledge: 40.25, stability: 66.5, culture: 3.5, militarism: 32.25, techs: ['bronze'], gov: 1, income: 3, expense: 0.6, ideas: ['i1'] });
  const civ1 = mkCiv(eng, { id: 1, race: 3, pop: 12, tiles: [(eng.seed + 500) % WH], houses: 1, kingId: -1, mobilizeUntil: 99.5, militarism: 38.75 });
  eng.rel.set('0|1', -25.5);
  eng.rel.set('1|0', -25.5);
  eng.met.add('0|1'); eng.met.add('1|0');
  // 建筑夹具（civ0 领土内格直接用 —— serialize 对账不挑地形合法性）
  let placed = 0;
  for (let i = 0; i < WH && placed < 3; i++) {
    if (eng.owner[i] === 0 && eng.building[i] === 0) {
      eng.buildings.push({ i, x: i % W, y: (i / W) | 0, kind: placed === 0 ? 1 : placed === 1 ? 3 : 5, civ: 0 });
      eng.building[i] = placed === 0 ? 1 : placed === 1 ? 3 : 5;
      eng.bIdx.set(i, eng.buildings.length - 1);
      placed++;
    }
  }
  civ0.houses = Math.max(civ0.houses, 2);
  // 军团夹具（members 指向真实单位 id）
  // 单位夹具 30（id 10000 起 —— generate(seed) 已撒 ~600 初始单位且 id 从 1 起，避免撞车）：
  // 三态覆盖（对象字段 wep/arm/hlm/bts/rng/amu/gene + null 化缺省 + dead/boat/king 特殊值）
  for (let k = 0; k < 30; k++) {
    const u = mkU42({
      id: 10000 + k, race: k % 7, civ: k % 3 === 0 ? -1 : k % 2, x: (eng.seed + k * 7) % W, y: (eng.seed + k * 13) % H,
      name: k === 5 ? 'King Aldric' : `U${10000 + k}`, king: k === 5 ? 1 : undefined,
      wep: k % 4 === 0 ? { id: 1, name: 'Emergent Blade', dtype: 1, delivery: 0, fire: 0.5, inter: 2 } : undefined,
      gene: k % 4 === 1 ? { s: 1.05, d: 0.95, h: 1.1, r: 0.9 } : undefined,
      bts: k % 4 === 2 ? 3 : undefined, amu: k === 7 ? 2 : undefined,
      boat: k === 9 ? 1 : undefined, boatTTL: k === 9 ? 40 : undefined,
      dead: k === 11 ? true : false, infected: k === 13 ? 1 : undefined,
      gIds: k === 15 ? [3, 5] : undefined, gVal: k === 15 ? 2 : undefined,
      fam: k === 17 ? 1 : undefined, fgn: k === 17 ? 'House' : undefined,
      army: k < 5 ? 1 : undefined, trait: k === 19 ? 'brave' : undefined,
      caravan: k === 21 ? 1 : undefined,
    });
    eng.units.push(u);
    eng.unitById.set(u.id, u);
  }
  eng.armies.push({ id: 1, civ: 0, name: 'First Legion', members: [10000, 10001, 10002, 10003, 10004], leaderId: 10001, x: 100, y: 50, tx: 110, ty: 55, state: 'rally', morale: 1.2, kills: 3, losses: 1, tactical: false });
  eng.armySeq = 2;
  // 纪事/物品/触发器/再生长/辐射/火
  eng.worldEvents.push({ id: 1, year: 3, kind: 'war', text: '战争爆发', colorHex: '#ff4444', x: 10, y: 20 });
  eng.eventSeq = 2;
  eng.items.push({ id: 1, kind: 'meat', x: 5, y: 6 }, { id: 2, kind: 'sword', x: 7, y: 8 });
  eng.itemSeq = 3;
  eng.regrow.set(100, 250); eng.regrow.set(200, 350);
  eng.radSet.set(300, 400); eng.fireSet.add(400); eng.fire[400] = 2;
  eng.warData.set('0|1', { key: '0|1', a: 0, b: 1, scoreA: 2, scoreB: 1, startTick: 50, startYear: 1 });
  eng.occSet.add(500); eng.occCiv[500] = 0; eng.occStr[500] = 42;
  eng.warShame.set(0, 1.5);
  eng.directives.push({ id: 1, civ: 0, kind: 'holy_war', issuedTick: 10, deadline: 300, params: {}, progress: 0, done: false });
  eng.dirSeq = 2;
  eng.speciesBase.set(0, { gene: { s: 1.02, d: 0.98, h: 1.01, r: 1.03 }, gen: 2, sub: '亚种名', beh: ['brave', 'calm'] });
  eng.dynRaces.set(100, { parent: 0, bornYear: 2, parent2: undefined, eco: 'pred', cap: 20 });
  eng.dynSeq = 101;
  eng.emergentWeapons.set(1, { id: 1, name: 'Emergent Blade', dtype: 1, delivery: 0, fire: 0.5, pl: 1, dl: 0, gd: 2, pw: 0, q: [1, 1, 1, 1], inter: 2 });
  eng.weapSeq = 2;
  eng.emTechs.set('em1', { key: 'em1', name: '涌现科技', cat: 'military', cost: 120, gen: 1, effects: [{ k: 'dmg', v: 0.1 }], desc: '' });
  eng.emTechSeq = 2;
  eng.emIdeas.set('id1', { key: 'id1', name: '涌现理念', desc: 'd', mods: { gold: 0.1, stab: 2 } });
  eng.ideaSeq = 2;
  eng.evoNodes.push({ id: 1, kind: 'species', name: '演化种', parent: null, year: 3, colorHex: '#aabbcc', detail: 'd', stat: 'pop 10', alive: true, meta: { race: 100 } });
  eng.evoSeq = 2;
  eng.families.set(1, { id: 1, name: 'House A', race: 0, founded: 3, founder: 'U1', members: 4, heroes: 1, kills: 7, peak: 5, milestones: 2 });
  eng.familySeq = 2;
  eng.agentLaws.laws.push({ id: 1, kind: 'cron', name: 'law1', trigger: { every: 50 }, actions: [{ type: 'bless' }], enabled: true, fired: 0 });
  eng.agentLaws.seq = 2;
  eng.agentLaws.counters = { c1: 3 };
  return eng;
}
function scenS(name, eng, source) {
  const save = stripNonDet(eng.serialize(source));
  const out = {
    name,
    save,
    raw: dumpRawArrays(eng),
    units41: dumpUnits41(eng.units),
    scalars: dumpScalars(eng),
    unitCount: eng.units.length,
  };
  return out;
}

// ---------------- 场景组 A：applySave 数学段 ----------------
// variant 重算：v2 读档 hash2(x,y,seed+999)*255 Floor 逐位（L15325-15327）
// rng 重播种：(seed ^ 0x9e3779b9) + tickCount u32（L15348）
// cam clamp：三字段全有限才采纳，zoom ∈ [1.2, 24]（L15343-15346）
// occ clamp：i 越界/civ 无效/死亡文明跳过，st ∈ [1, 99]（L15502-15507）
function scenA(baseSave, tag, cam, front) {
  const eng = new GameEngine(424242); // 一次性宿主：applySave 全量覆写（种子无意义，取确定性哨兵）
  const data = JSON.parse(JSON.stringify(baseSave));
  const camGiven = cam !== undefined;
  data.cam = cam;
  if (front !== undefined) data.front = front;
  eng.applySave(data);
  const occ = [];
  for (let i = 0; i < WH; i++) if (eng.occSet.has(i)) occ.push([i, eng.occCiv[i], eng.occStr[i]]);
  return {
    name: `A-${tag}`,
    variant: bytesHex(eng.variant),
    rngA: u32hex(eng.rngA),
    cam: eng.cam ? { x: f64hex(eng.cam.x), y: f64hex(eng.cam.y), zoom: f64hex(eng.cam.zoom) } : null,
    camApplied: camGiven && data.cam != null && Number.isFinite(data.cam.x) && Number.isFinite(data.cam.y) && Number.isFinite(data.cam.zoom),
    camIn: camGiven ? { x: f64hex(cam.x), y: f64hex(cam.y), zoom: Number.isFinite(cam.zoom) ? f64hex(cam.zoom) : 'NaN' } : null,
    // rngA 为 applySave 尾链（statsTick/rebuildAmbLists）推进后值 —— 重播种公式已由 H-math 组锁定，尾链对账留 M-U6b
    occ,
    scalarSeed: eng.seed, scalarTick: eng.tickCount,
    unitCount: eng.units.length,
    civCount: eng.civs.length,
  };
}

// ---------------- 场景组 H：hash2 / ReseedRng 数学单元 ----------------
function scenH() {
  const h = [];
  // hash2 网格采样：x/y 跨正负域 + seed 覆盖 seed+999 变体重算域
  for (const seed of [1, 12345, 999999, 2147483647, -5, 987654321]) {
    for (const [x, y] of [[0, 0], [1, 1], [255, 159], [7, 13], [-3, 5], [100, 100], [63, 41]]) {
      h.push([x, y, seed, f64hex(hash2(x, y, seed))]);
    }
  }
  const r = [];
  for (const seed of [1, 42, 123456789, 2147483647, 4294967295, 0]) {
    for (const tick of [0, 1, 137, 999999, 2147483647]) {
      r.push([seed, tick, u32hex(((seed ^ 0x9e3779b9) + tick) >>> 0)]);
    }
  }
  return { name: 'H-math', hash2: h, reseed: r };
}

// ---------------- 场景组 V：validateSaveData 全分支 ----------------
function mkHealthyV2() {
  return {
    v: 2, savedAt: 0, source: 'manual', seed: 12345, tickCount: 100, yearF: 0.5,
    unitSeq: 10, civSeq: 2, toastSeq: 1, victoryCiv: null, multiCivSeen: true,
    terrain: 'AQIDBAUFCA', variant: '', owner: '____', building: 'AQ', fire: 'AA', radiate: 'AA',
    regrow: [], radDue: [], u: [['id', 'race', 'civ'], [1, 0, -1], [2, 3, 0]], units: [],
    civs: [{ id: 0 }, { id: 1 }], buildings: [], rel: [], met: [],
    cam: { x: 5, y: 5, zoom: 8 },
    events: [], eventSeq: 2, river: 'AA', road: 'AA', laws: {}, items: [], itemSeq: 1,
    triggers: [], triggerSeq: 1, armies: [], armySeq: 1, warData: [], front: [],
    warShame: [], directives: [], dirSeq: 1, speciesBase: [],
    worldWar: { phase: 'idle', belligerents: [], fallen: [] }, wwTruce: [],
    dyn: { races: [[100, 'DynBeast', 0, 30, 5, 0.06, 0.002, 0, undefined, 0, 3, 0, 40, 6]], weapons: [], dynSeq: 101, weapSeq: 1, dctr: [], ddef: [], trts: [], traitSeq: 1 },
    emT: [], emI: [], evo: [], evoSeq: 1, fams: [], familySeq: 1,
    alws: [], alwsSeq: 1, alwsCounters: {},
    nat: { stress: [], storms: [], ash: 0, seasonOffset: 0, counters: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], stormSeq: 1, pcx: [], pcy: [], pe: 0, hot: [], ashF: [] },
    als: [], allianceSeq: 1, rrel: [], rmods: [], imods: [], creg: [],
  };
}
function scenV() {
  const healthy = mkHealthyV2();
  const v1 = { v: 1, seed: 7, tickCount: 5, civs: [{ id: 0 }], buildings: [], units: [{ id: 1, race: 0 }], terrain: 'AQID', variant: 'AQ', owner: 'AA', building: 'AA', fire: 'AA', radiate: 'AA' };
  const mk = (name, patch, expect) => {
    const base = patch.base === 'v1' ? JSON.parse(JSON.stringify(v1)) : JSON.parse(JSON.stringify(healthy));
    delete patch.base;
    Object.assign(base, patch);
    return { name: `V-${name}`, input: base, expect };
  };
  return { name: 'V-validate', cases: [
    mk('null-root', { }, '存档根结构损坏（非对象）'), // 特判：input 直接置 null（下方 post 处理）
    mk('bad-v', { v: 3 }, '不支持的存档版本: 3'),
    mk('bad-seed', { seed: NaN }, '种子数据损坏'),
    mk('bad-seed-str', { seed: 'x' }, '种子数据损坏'),
    mk('bad-tick', { tickCount: -1 }, '时间线数据损坏'),
    mk('bad-tick-nan', { tickCount: Infinity }, '时间线数据损坏'),
    mk('bad-civs', { civs: 'nope' }, '文明数据损坏（civs 非 Array）'),
    mk('bad-buildings', { buildings: 42 }, '建筑数据损坏（buildings 非 Array）'),
    mk('v2-terrain-short', { terrain: 'abc' }, '地形数据损坏（RLE 流过短）'),
    mk('v2-terrain-nonstr', { terrain: 123 }, '地形数据损坏（RLE 流过短）'),
    mk('v2-u-units-empty', { u: [], units: [] }, '单位数据损坏（u/units 均为空）'),
    mk('v2-u-bad-row', { u: [['id', 'race'], [1]] }, '单位行 1 数据损坏'),
    mk('v2-u-bad-row2', { u: [['id', 'race'], ['a', 0]] }, '单位行 1 数据损坏'),
    mk('v2-units-bad', { u: [], units: [{ id: 'x', race: 0 }] }, '存档单位数据损坏'),
    mk('v2-dyn-bad', { dyn: { races: 'nope' } }, '涌现层数据损坏（dyn.races 非 Array）'),
    mk('v1-units-bad', { base: 'v1', units: 'nope' }, '单位数据损坏（units 非 Array）'),
    mk('v1-unit-row-bad', { base: 'v1', units: [{ race: 0 }] }, '存档单位数据损坏'),
    mk('civ-row-bad', { civs: [{ }, { id: 1 }] }, '文明行数据损坏'),
    mk('healthy-v2', { }, null),
    mk('healthy-v1', { base: 'v1' }, null),
  ].map((c, i) => {
    // V-null-root 特判：input=null（根结构非对象分支）
    if (i === 0) c.input = null;
    return c;
  }) };
}

// ---------------- main + sanity + det ----------------
function runAll() {
  const out = [];
  // S-1：空世界 fresh（owner 全 -1 单一大游程 RLE 代表）
  out.push(scenS('S-fresh-12345', new GameEngine(12345), 'manual'));
  // S-2：全容器注入夹具（civs/buildings/armies/events/items/rel/dyn/emTech/30 单位三态 —— serialize 全字段覆盖）
  out.push(scenS('S-fixture-777', mkFixture(777), 'manual'));
  // S-3：真演化 aged 137 tick（模拟链实跑产物全档）
  out.push(scenS('S-aged-31337-137', mkAged(31337, 137), 'auto'));
  const sFix = out.find((s) => s.name === 'S-fixture-777');
  // A 组：cam clamp 变体 + occ clamp 变体（对 S-777-137 黄金档）
  out.push(scenA(sFix.save, 'cam-basic', { x: 100, y: 50, zoom: 8 }, undefined));
  out.push(scenA(sFix.save, 'cam-low', { x: 0, y: 0, zoom: 0.5 }, undefined)); // zoom 下界外 → 1.2
  out.push(scenA(sFix.save, 'cam-high', { x: 0, y: 0, zoom: 30 }, undefined)); // zoom 上界外 → 24
  out.push(scenA(sFix.save, 'cam-edge-lo', { x: 0, y: 0, zoom: 1.2 }, undefined)); // 边界内
  out.push(scenA(sFix.save, 'cam-edge-hi', { x: 0, y: 0, zoom: 24 }, undefined)); // 边界内
  out.push(scenA(sFix.save, 'cam-nan', { x: NaN, y: 0, zoom: 8 }, undefined)); // NaN → 不采纳
  out.push(scenA(sFix.save, 'cam-none', undefined, undefined)); // 无 cam → 不采纳
  out.push(scenA(sFix.save, 'occ-clamp', { x: 5, y: 5, zoom: 8 }, [[0, 0, 0], [1, 0, 1], [2, 0, 50], [3, 0, 99], [4, 0, 100], [5, 0, 150], [6, 9, 10], [7, 0, -5], [-1, 0, 10], [WH, 0, 10], [8, 1, 3], [9, 0, 98]]));
  const h = scenH();
  out.push(h);
  const v = scenV();
  out.push(v);
  return out;
}

function sanity(byName) {
  const asserts = [];
  const A = (name, cond, msg) => asserts.push({ name, cond, msg });
  const s0 = byName.get('S-fresh-12345');
  A('S0 unitCount>0', s0.unitCount > 0, `units=${s0.unitCount}`);
  A('S0 save.v=2', s0.save.v === 2, `v=${s0.save.v}`);
  A('S0 terrain RLE 非空', typeof s0.save.terrain === 'string' && s0.save.terrain.length > 8, `len=${s0.save.terrain.length}`);
  A('S0 u header 42 字段', s0.save.u[0].length === 42, `hdr=${s0.save.u[0].length}`);
  A('S0 units41 与 u 行数一致', s0.units41.length === s0.save.u.length - 1, `u=${s0.save.u.length - 1} vs units41=${s0.units41.length}`);
  A('S0 owner raw hex = 2×WH 字节', s0.raw.owner.length === WH * 4, `owner=${s0.raw.owner.length}`);
  A('S0 terrain raw hex = WH 字节', s0.raw.terrain.length === WH * 2, `terrain=${s0.raw.terrain.length}`);
  A('S0 savedAt 剥离', s0.save.savedAt === 0, `savedAt=${s0.save.savedAt}`);
  A('S0 scalar rngA u32 形态', /^0x[0-9a-f]{8}$/.test(s0.scalars.rngA), s0.scalars.rngA);
  const sFix = byName.get('S-fixture-777');
  A('SFix 双文明', sFix.save.civs.length === 2, `civs=${sFix.save.civs.length}`);
  A('SFix 建筑非空', sFix.save.buildings.length === 3, `b=${sFix.save.buildings.length}`);
  A('SFix 军团非空', sFix.save.armies.length === 1, `a=${sFix.save.armies.length}`);
  A('SFix units41 = gen 初始 + 30 注入', sFix.units41.length === sFix.save.u.length - 1 && sFix.units41.length > 30, `n=${sFix.units41.length} u=${sFix.save.u.length - 1}`);
  A('SFix owner ≠ 全 -1（文明领土入档）', sFix.raw.owner !== s0.raw.owner, 'owner 与空世界相同');
  A('SFix 对象字段入 u 行（wep/gene JSON 保留）', (() => {
    const i = sFix.units41.findIndex((r) => r[0] === 10000);
    if (i < 0) return false;
    const w = sFix.units41[i][UNIT_FIELDS.indexOf('wep')];
    return w !== null && typeof w === 'object' && w.name === 'Emergent Blade';
  })(), `wep 行未找到或字段缺失`);
  const sAged = byName.get('S-aged-31337-137');
  A('SAged tickCount=137', sAged.scalars.tickCount === 137, `${sAged.scalars.tickCount}`);
  A('SAged 世界与 fresh 不同', sAged.raw.terrain !== s0.raw.terrain, 'terrain 相同（模拟未改地形）');
  const a0 = byName.get('A-cam-basic');
  A('A0 variant hex = WH 字节', a0.variant.length === WH * 2, `variant=${a0.variant.length}`);
  // 变体重算真值锚：hash2(0,0,seed+999)*255 Floor —— 真实现同源直算
  const seed = 777;
  const expect00 = Math.floor(hash2(0, 0, seed + 999) * 255);
  A('A0 variant[0] hash2 真值', parseInt(a0.variant.slice(0, 2), 16) === expect00, `got=${a0.variant.slice(0, 2)} want=${expect00.toString(16)}`);
  const aZoomLow = byName.get('A-cam-low');
  A('A-low zoom clamp 1.2', aZoomLow.cam.zoom === f64hex(1.2), `zoom=${aZoomLow.cam.zoom}`);
  const aZoomHigh = byName.get('A-cam-high');
  A('A-high zoom clamp 24', aZoomHigh.cam.zoom === f64hex(24), `zoom=${aZoomHigh.cam.zoom}`);
  const aNan = byName.get('A-cam-nan');
  A('A-nan cam 不采纳（保持引擎默认）', aNan.camApplied === false && aNan.cam.zoom !== f64hex(8), `applied=${aNan.camApplied} zoom=${aNan.cam.zoom}`);
  const aOcc = byName.get('A-occ-clamp');
  // occ clamp 真值：st∈[1,99]（0→1/-5→1/150→99）；civ 越界(9)/负 i/≥WH 跳过；i=8 civ=1 死亡?活体文明收；i=9 st=98
  const occMap = new Map(aOcc.occ.map((r) => [r[0], r]));
  A('A-occ st0 → 1', occMap.get(0)?.[2] === 1, JSON.stringify(occMap.get(0)));
  A('A-occ st-5 → 1', occMap.get(7)?.[2] === 1, JSON.stringify(occMap.get(7)));
  A('A-occ st150 → 99', occMap.get(5)?.[2] === 99, JSON.stringify(occMap.get(5)));
  A('A-occ st98 → 98', occMap.get(9)?.[2] === 98, JSON.stringify(occMap.get(9)));
  A('A-occ civ9 越界跳过', !occMap.has(6), `has 6=${occMap.has(6)}`);
  A('A-occ i=-1 跳过', !occMap.has(-1), `has -1=${occMap.has(-1)}`);
  A('A-occ i=WH 跳过', !occMap.has(WH), `has WH=${occMap.has(WH)}`);
  const hsc = byName.get('H-math');
  A('H hash2 42 点', hsc.hash2.length === 42, `${hsc.hash2.length}`);
  A('H reseed 30 点', hsc.reseed.length === 30, `${hsc.reseed.length}`);
  const vsc = byName.get('V-validate');
  A('V 20 案例', vsc.cases.length === 20, `${vsc.cases.length}`);
  // V 真值锚：validateSaveData 真实现直判（同源 sanity）
  let vPass = 0;
  for (const c of vsc.cases) {
    const got = validateSaveData(c.input);
    if (got === c.expect) vPass++;
    else A(`V-真值 ${c.name}`, false, `got=${JSON.stringify(got)} want=${JSON.stringify(c.expect)}`);
  }
  A('V 全案例真实现一致', vPass === vsc.cases.length, `${vPass}/${vsc.cases.length}`);
  return asserts;
}

// det 对比：双跑必须子进程隔离 —— applySave 的 dyn 恢复段写全局 RACES 表（读档重注册），
// 同进程第二跑的 serialize 会读到第一次 run 的 RACES[100] 残留（M-U3c 静态缓存污染同款坑，
// 此处污染源更大：RACES 注册表本体）。子进程各自全新模块态，字节级可比。
const isDetChild = process.argv.includes('--det-child');
function jsonOf(out) {
  return JSON.stringify({ meta: { gen: 'gen-save.mjs' }, scenarios: out });
}
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  if (isDetChild) {
    // 子进程模式：跑一次写文件退出（序号取 --out=N）
    const outN = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '1';
    const { writeFileSync: wf } = await import('node:fs');
    wf(`/tmp/save-det${outN}.json`, jsonOf(runAll()));
    process.exit(0);
  }
  const { spawnSync } = await import('node:child_process');
  const self = path.resolve(process.argv[1]);
  const r1 = spawnSync(process.execPath, [self, '--det-child', '--out=1'], { cwd: ROOT, encoding: 'utf8' });
  const r2 = spawnSync(process.execPath, [self, '--det-child', '--out=2'], { cwd: ROOT, encoding: 'utf8' });
  if (r1.status !== 0 || r2.status !== 0) { console.log('[det] child fail', r1.stderr?.slice(-400), r2.stderr?.slice(-400)); process.exit(1); }
  const { readFileSync: rf } = await import('node:fs');
  const j1 = rf('/tmp/save-det1.json', 'utf8'), j2 = rf('/tmp/save-det2.json', 'utf8');
  const { createHash } = await import('node:crypto');
  const m1 = createHash('md5').update(j1).digest('hex');
  const m2 = createHash('md5').update(j2).digest('hex');
  const detOk = m1 === m2;
  console.log(`[det] md5=${m1} ${detOk ? '==' : '!='} ${m2}`);
  // 主进程跑一次 sanity（黄金与黄金文件以首跑 runAll 为准 —— 与子进程同构确定性）
  const run1 = runAll();
  const byName = new Map(run1.map((s) => [s.name, s]));
  const asserts = sanity(byName);
  let sFail = 0;
  for (const a of asserts) {
    if (!a.cond) { console.log(`[SANITY FAIL] ${a.name}: ${a.msg}`); sFail++; }
  }
  console.log(`[sanity] ${asserts.length - sFail}/${asserts.length} PASS`);
  const gold = {
    meta: {
      gen: 'gen-save.mjs',
      slice: 'M-U6a 存档编解码核心',
      bluebook: 'engine.ts serialize L15187 / applySave L15309 / rle L92-123 / unitsToRows L128 / saveSafe.ts validateSaveData L125 / noise.ts hash2 L14',
      W, H,
      unitFields: UNIT_FIELDS,
    },
    scenarios: run1,
  };
  mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
  mkdirSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden'), { recursive: true });
  const fp = path.join(ROOT, 'scripts/unity-migration/golden/save.json');
  writeFileSync(fp, JSON.stringify(gold));
  writeFileSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/save.json'), JSON.stringify(gold));
  console.log(`[gen] written ${fp} (${(JSON.stringify(gold).length / 1024).toFixed(1)}KB)`);
  if (!detOk || sFail) { console.log(`[GEN FAIL] det=${detOk} sanity=${sFail}`); process.exit(1); }
  console.log('[GEN PASS]');
}
export { runAll };
