#!/usr/bin/env node
// ============================================================
// bail-transcript.mjs — M-U3h 宿主接力 WbBail.cs 的 JS 独立转写（防循环论证双链）
// 蓝本 = engine.ts 原文机械转写（零引擎导入——静态表字面量，逻辑从源码逐行转写）：
//   wbResume L3215 case1/4/5 + updateUnit 前奏 L3455-3464 + grabbedTick L5343-5376 +
//   updateBoat L5608-5660 + disembark L5663-5697 + findLandNear L5589-5606 +
//   caravanArrive L4770-4796 + updateUnitTailJS L4116-4260 + updateUnitPostJS L4262-4334 +
//   moveUnit L5813-5876 + wallBlocks L5804 + passTile L5800 + foundSettlement L5704-5739 +
//   buildBuilding L1756-1772 + connectRoad L1906-1929 + claimTile L1719-1754 + atWar L2061-2064 +
//   shiftRaceRel L8054 + allianceOfCiv L8061 + fx L9781 + addEvent L13995 + toast L13988 +
//   rng L728-734 + RACE_REL_BASE types.ts L208 + RACES def 子表 types.ts L157-158 + YEAR_TICKS constants.ts L9
// 桩域断言：捕食者索敌/鱼群/登船/繁衍 spawn/diplomacyMeet 深链/updateUnit 主体——黄金场景不可达，触达即 throw（第二批余域）
// 跑法：node scripts/unity-migration/bail-transcript.mjs（对 golden/units_bail.json 全场景全字段逐位）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLDEN = path.join(ROOT, 'scripts/unity-migration/golden/units_bail.json');

const W = 256, H = 160;
const idx = (x, y) => y * W + x;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const BUILD_KINDS = { HOUSE: 1, CAPITAL: 2, TOWER: 3, FARM: 4, BARRACKS: 5, CASTLE: 6, PORT: 7, LIBRARY: 8, MARKET: 9, TEMPLE: 10, WALL: 11 };
const R = { HUMAN: 0, ELF: 1, FISH: 37, CRAB: 38, SHEEP: 6, DRAGON: 9 }; // R.FISH=37/R.CRAB=38（types.ts L70-71 实号；旧臆测 26/33 系第五批 F 系场景暴露的潜伏错）
// RACE_REL_BASE（types.ts L208-219）
const RACE_REL_BASE = { '1-3': -45, '2-3': -30, '0-1': 25, '0-2': 20, '2-20': -25, '1-20': -20, '3-20': 15, '3-19': -10, '1-2': 10 };
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const isLand = (t) => t !== T.DEEP && t !== T.WATER && t !== T.LAVA;
const isWater = (t) => t === T.DEEP || t === T.WATER;
const buildable = (t) => t === T.GRASS || t === T.SAND || t === T.HILL || t === T.SNOW || t === T.BURNT || t === T.FOREST;
const walkable = (t) => t !== T.DEEP && t !== T.WATER && t !== T.MOUNTAIN && t !== T.LAVA;
// RACES def 子表（types.ts L157-158 机械转写——接力域消费字段；场景只含 race 0/1，其余触达即 throw）
const RDEF = {
  0: { isCiv: true, hostile: false, flying: false, aquatic: false, beach: false, sandswim: false, predator: false, undead: false, coldBlood: false, repro: 0.006, growth: 0.5 },
  1: { isCiv: true, hostile: false, flying: false, aquatic: false, beach: false, sandswim: false, predator: false, undead: false, coldBlood: false, repro: 0.005, growth: 0.3 },
  // M-U3h 第五批消费域追加（types.ts L164/166/185/199/200：狼/龙/沙虫/蟹/鱼——tail/move/board 消费切片）
  7: { isCiv: false, hostile: false, flying: false, aquatic: false, beach: false, sandswim: false, predator: true, undead: false, coldBlood: false, repro: 0.004, growth: 0 },
  6: { isCiv: false, hostile: false, flying: false, aquatic: false, beach: false, sandswim: false, predator: false, undead: false, coldBlood: false, repro: 0.004, growth: 0 },
  9: { isCiv: false, hostile: true, flying: true, aquatic: false, beach: false, sandswim: false, predator: true, undead: false, coldBlood: false, repro: 0, growth: 0 },
  26: { isCiv: false, hostile: true, flying: false, aquatic: false, beach: false, sandswim: true, predator: true, undead: false, coldBlood: false, repro: 0, growth: 0 },
  37: { isCiv: false, hostile: false, flying: false, aquatic: true, beach: false, sandswim: false, predator: false, undead: false, coldBlood: false, repro: 0, growth: 0 },
  38: { isCiv: false, hostile: false, flying: false, aquatic: true, beach: true, sandswim: false, predator: false, undead: false, coldBlood: false, repro: 0.007, growth: 0 },
};
const defOf = (race) => {
  const d = RDEF[race];
  if (!d) throw new Error(`RDEF race ${race} 未转写（第二批域）`);
  return d;
};
const BUILDING_HP = [0, 70, 240, 120, 40, 150, 340, 90, 110, 100, 140, 200]; // BUILDING_DEFS[kind].hp（types.ts L325-337）
// —— M-U3h 第三批 case2 消费域静态表（机械转写，零引擎导入）——
const MAX_UNITS2 = 2400, MAX_WILDLIFE2 = 900, MAX_WILDLIFE_AQUATIC2 = 520; // constants.ts L10-31
const MAX_DRAGONS2 = 4, MAX_DEMONS2 = 2, MAX_TROLLS2 = 5, MAX_KRAKENS2 = 3, MAX_SANDWORMS2 = 3,
  MAX_BASILISKS2 = 6, MAX_OGRES2 = 5, MAX_WHITEWALKERS2 = 6, MAX_HYDRAS2 = 6, MAX_VAMPIRES2 = 8; // constants.ts L19-31
const R2D = 9, RDD = 17; // engine L36-37（R2=DRAGON / RD=DEMON）
const AQUATIC_RACES = new Set([25, 37, 38, 39, 40]); // kraken/fish/crab/turtle/shark（RACES aquatic 全表）
// 种族基础属性（types.ts L157-204 消费切片：name/hp/dmg/speed/maxAge/isCiv/undead——场景只用 0/6，余触达即 throw）
const RSTAT = {
  0: { name: '人类', hp: 60, dmg: 8, speed: 0.09, maxAge: 55, isCiv: true, undead: false },
  6: { name: '绵羊', hp: 16, dmg: 1, speed: 0.038, maxAge: 26, isCiv: false, undead: false },
};
const statOf = (race) => { const s = RSTAT[race]; if (!s) throw new Error(`RSTAT race ${race} 未转写（case2 场景外）`); return s; };
// names.ts FIRST L8-36 消费切片（unitName 池——场景只用 0/6）
const FIRST = {
  0: ['Alric', 'Berta', 'Corin', 'Dahlia', 'Edwin', 'Faye', 'Gareth', 'Hilda', 'Ivan', 'Jora', 'Kelvin', 'Lyra', 'Marcus', 'Nora', 'Osric', 'Petra'],
  6: ['Wooly', 'Fluff', 'Baaald', 'Shears', 'Cloud', 'Tumble'],
};
// engine L1107-1108 家族名表
const FAM_PRE = ['霜', '烬', '暴风', '血', '铁', '荆棘', '暗影', '星', '狼', '鹰', '珊瑚', '苔', '雷', '冬', '荒', '银'];
const FAM_POST = ['牙', '羽', '痕', '鬃', '棘', '誓', '歌', '爪', '翼', '须', '蹄', '岚'];
// emergence.ts L386-387 涌现特质词表
const TRAIT_PREFIX = ['凶蛮', '钢筋', '魅影', '荒野', '苔藓', '血怒', '霜骨', '雷筋', '深渊', '星辉', '荆棘', '孤狼'];
const TRAIT_BODY = ['之爪', '之躯', '之足', '血脉', '之瞳', '之鳞'];
// types.ts L296-305 JOBS 权重/乘数（rollJob + spawnUnit 消费切片）
const JOBS_MUL = [ // types.ts L296-305 JOBS 真值（字段名 hpMul/dmgMul/speedMul——第五批 H03 暴露旧简写 hp/dmg/speed 与 gen 真引擎分歧）
  { hpMul: 1, dmgMul: 1, speedMul: 1, weight: 46 },
  { hpMul: 0.95, dmgMul: 0.9, speedMul: 1, weight: 24 },
  { hpMul: 1.3, dmgMul: 1.35, speedMul: 1.05, weight: 14 },
  { hpMul: 1.05, dmgMul: 1.15, speedMul: 1, weight: 8 },
  { hpMul: 1.15, dmgMul: 0.95, speedMul: 1.05, weight: 5 },
  { hpMul: 1, dmgMul: 0.9, speedMul: 1.2, weight: 2 },
  { hpMul: 1.25, dmgMul: 1.1, speedMul: 1, weight: 1 },
  { hpMul: 1.5, dmgMul: 1.5, speedMul: 1, weight: 0 },
];
// types.ts L264-276 TRAITS 预设表（spawnUnit td 消费 + inventEmergentTrait 写入目标）
const TRAITS_ALL = {
  strong: { key: 'strong', name: '强壮', desc: '伤害 +40%', dmgMul: 1.4, good: true },
  tough: { key: 'tough', name: '坚韧', desc: '生命 +35%', hpMul: 1.35, good: true },
  swift: { key: 'swift', name: '迅捷', desc: '速度 +30%', speedMul: 1.3, good: true },
  weak: { key: 'weak', name: '羸弱', desc: '伤害 -20%', dmgMul: 0.8, good: false },
  sickly: { key: 'sickly', name: '多病', desc: '生命 -25%', hpMul: 0.75, good: false },
  genius: { key: 'genius', name: '天才', desc: '可能缔造传奇', good: true },
  berserk: { key: 'berserk', name: '狂暴', desc: '伤害 +70%, 生命 -15%', dmgMul: 1.7, hpMul: 0.85, good: true },
  lucky: { key: 'lucky', name: '幸运', desc: '命不该绝', good: true },
  regeneration: { key: 'regeneration', name: '再生', desc: '缓慢恢复生命', regen: 0.3, good: true },
  giant: { key: 'giant', name: '巨型', desc: '生命 +80%, 伤害 +50%, 速度 -25%', hpMul: 1.8, dmgMul: 1.5, speedMul: 0.75, giant: true, good: true },
  tiny: { key: 'tiny', name: '侏儒', desc: '生命 -45%, 伤害 -20%, 速度 +25%', hpMul: 0.55, dmgMul: 0.8, speedMul: 1.25, tiny: true, good: true },
  immune: { key: 'immune', name: '免疫', desc: '不会感染瘟疫与毒素', immune: true, good: true },
};
// names.ts roman L81-91
function Roman(n) {
  if (n < 1 || n > 40) return String(n);
  const table = [[40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '', v = n;
  for (const [val, sym] of table) { while (v >= val) { out += sym; v -= val; } }
  return out.toUpperCase();
}
const FX_MINOR = new Set(['dmg', 'hit', 'smoke', 'spawn', 'heart', 'skull', 'arrow', 'coin', 'blood', 'dust']);
const FX_CAP = 620;

// ---------------- 世界态（engine 对象域最小面） ----------------
function mkWorld(fx, golden) {
  const w = {
    W, H, terrain: new Uint8Array(W * H), owner: new Int16Array(W * H).fill(-1),
    building: new Uint8Array(W * H), road: new Uint8Array(W * H),
    occCiv: new Int8Array(W * H).fill(-1), occStr: new Uint8Array(W * H),
    occSet: new Set(), civs: [], civById: {}, units: [], unitById: new Map(),
    buildings: [], bIdx: new Map(), bHp: new Map(), damagedSet: new Set(),
    rel: new Map(), tension: new Map(), raceRel: new Map(), met: new Set(),
    alliances: [], allianceOf: new Map(), marketIdx: new Map(),
    effects: [], worldEvents: [], toasts: [],
    laws: { ...fx.laws }, rngA: fx.rngA0 >>> 0, eventSeq: fx.eventSeq0, toastSeq: fx.toastSeq0,
    yearF: fx.yearF ?? 0, seasonOffset: 0, items: [], grassTiles: 0, wildCount: new Map(),
    overlayMode: 'none', overlayDirty: false, fxPrefs: { fxDensity: 1, ambience: true, dmgNumbers: true },
    shake: 0,
    // M-U3h 第四批 case3 消费域（攻城纪事节流阀/战争记分簿/tick 基准）
    tickCount: fx.startTick ?? 0, lastSiegeEventTick: fx.fixture?.lastSiegeEventTick ?? 0, // ctor L521 初值 0（禁读 POST 态——dump 时序纪律④）
    warData: new Map(),
    // M-U3h 第三批 case2 消费域（序列器/家族/涌现特质/演化图谱/辐射场）
    unitSeq: fx.unitSeq0, unitSeq0: fx.unitSeq0, familySeq: fx.familySeq0, traitSeq: fx.traitSeq0, evoSeq: fx.evoSeq0,
    families: new Map(), dynTraits: new Map(), evoNodes: [], evoIndex: new Map(),
    radiate: new Uint8Array(W * H),
    // M-U3h 第五批 tail/post 消费域（旨意/猎物密度场/空间桶/itemSeq）
    directives: [], preyGrid: new Uint16Array(32 * 20), buckets: null, itemSeq: 0,
  };
  // radiate RLE（case2 高压锅门消费；夹具态全量）
  {
    let rpos = 0;
    const rr = fx.radiateRle ?? [];
    for (let k = 0; k < rr.length; k += 2) for (let j = 0; j < rr[k + 1] && rpos < W * H; j++) w.radiate[rpos++] = rr[k];
  }
  // terrain RLE（paint 后全量）
  let pos = 0;
  const rle = fx.terrainRle ?? [];
  for (let k = 0; k < rle.length; k += 2) for (let j = 0; j < rle[k + 1] && pos < W * H; j++) w.terrain[pos++] = rle[k];
  // civs / units / rel / buildings / alliances / marketIdx（声明式 PRE 态夹具 fixture.*）
  for (const c of fx.fixture.civs ?? []) {
    const civ = { id: c.id, name: c.name ?? `C${c.id}`, race: c.race ?? 0, pop: c.pop ?? 0,
      tiles: [...(c.tiles ?? [])], frontier: [...(c.frontier ?? [])], houses: c.houses ?? 0, capital: c.capital ?? -1,
      alive: c.alive ?? true, gold: c.gold ?? 0, knowledge: c.knowledge ?? 0, colorHex: c.colorHex ?? '#c83c3c',
      techs: [], techMods: null };
    w.civs.push(civ); w.civs[civ.id] = civ; w.civById[civ.id] = civ;
    for (const i of civ.tiles) w.owner[i] = civ.id;
  }
  for (const u of fx.fixture.units ?? []) {
    const un = { id: u.id, race: u.race ?? 0, civ: u.civ ?? -1, x: u.x, y: u.y, tx: u.tx ?? u.x, ty: u.ty ?? u.y,
      speed: u.speed ?? 1, flip: 0, job: u.job ?? 0, king: u.king ?? 0, dead: u.dead ?? 0,
      boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0, caravan: u.caravan ?? 0, hurt: u.hurt ?? 0,
      hp: u.hp ?? 10, maxHp: u.hp ?? 10, age: u.age ?? 0, maxAge: u.maxAge ?? 9999,
      grab: u.grab ?? null, thrT: u.thrT ?? null, thrVx: u.thrVx ?? null, thrVy: u.thrVy ?? null,
      thrX0: u.thrX0 ?? null, thrY0: u.thrY0 ?? null,
      chill: 0, curse: 0, detour: u.detour ?? 0, food: u.food ?? null, fert: u.fert ?? 0, panic: u.panic ?? 0, beachT: 0, lx: null, ly: null,
      wep: 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0, // gen mkUnit 装备 int 0 占位（dump ?? null → 0 非 nullish 落 0）
      // case2 消费域：fam/fgn undefined 语义（null）+ gene 对象（{s,d,h,r} 或 null）+ name（gen mkUnit u${id} 语义）
      name: `u${u.id}`, kills: 0, cd: u.cd ?? 0, breath: 0, parity: 0, king: 0, infected: 0,
      dmg: 1, // gen mkUnit dmg: 1（拾装备 += 域；第五批 H02 暴露缺字段 NaN）
      army: u.army ?? null, // case3 inArmy 真值门（u.army != null）
      fam: u.fam ?? null, fgn: u.fgn ?? null,
      gene: u.gene ? { s: u.gene.s, d: u.gene.d, h: u.gene.h, r: u.gene.r } : null };
    w.units.push(un); w.unitById.set(un.id, un);
  }
  for (const [r, n] of fx.fixture.wildCount ?? []) w.wildCount.set(r, n); // case2 cap 门夹具（清理后施加同 gen 序）
  // M-U3h 第五批夹具（items/preyGrid/grassTiles/directive —— 同 gen 施加序）
  for (const it of fx.fixture.items ?? []) w.items.push({ id: w.itemSeq++, kind: it.kind, x: it.x, y: it.y });
  for (const [ci, n] of fx.fixture.preyGrid ?? []) w.preyGrid[ci] = n;
  if (fx.fixture.grassTiles != null) w.grassTiles = fx.fixture.grassTiles;
  if (fx.fixture.directive) w.directives.push({ id: 0, civ: fx.fixture.directive.civ, kind: fx.fixture.directive.kind, target: null, param: 0, status: 'active', startTick: 0 });
  for (const [a, b, v] of fx.fixture.rel ?? []) w.rel.set(pairKey(a, b), v);
  for (const [i, kind, civ] of fx.fixture.buildings ?? []) {
    w.buildings.push({ i, x: i % W, y: (i / W) | 0, kind, civ });
    w.bIdx.set(i, w.buildings.length - 1);
    w.building[i] = kind;
    w.bHp.set(i, Math.round(BUILDING_HP[kind] ?? 0)); // BUILDING_DEFS[kind].hp × bhp 1（夹具语义同 gen mkBuilding0）
  }
  for (const al of fx.fixture.alliances ?? []) {
    const a = { id: al.id, members: [...(al.members ?? [])], leader: al.leader ?? (al.members?.[0] ?? 0),
      bonded: al.bonded === true };
    w.alliances.push(a);
    for (const m of a.members) w.allianceOf.set(m, a.id);
  }
  for (const [cid, mi] of fx.fixture.marketIdx ?? []) w.marketIdx.set(cid, mi);
  // case3 warData 记分夹具（addWarScore/noteOccupied 消费；atWar 走 rel 基——wars 只承载增量）
  for (const wd of fx.fixture.wars ?? []) w.warData.set(wd.a < wd.b ? `${wd.a}-${wd.b}` : `${wd.b}-${wd.a}`,
    { key: wd.a < wd.b ? `${wd.a}-${wd.b}` : `${wd.b}-${wd.a}`, a: wd.a, b: wd.b, scoreA: 0, scoreB: 0, casA: 0, casB: 0, exA: 0, exB: 0, razedA: 0, razedB: 0, occA: 0, occB: 0 });
  return w;
}

// rng（engine L728-734 逐行）
function Rng(w) {
  const A = (w.rngA = (w.rngA + 0x6d2b79f5) | 0);
  let t = Math.imul(A ^ (A >>> 15), 1 | A);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const MathFloor = Math.floor;
function season(w) { // nature.ts L160-164
  if (!w.laws.seasons) return 1;
  const s = (MathFloor(w.yearF / 2) + w.seasonOffset) % 4;
  return s < 0 ? s + 4 : s;
}
function reproMul(w) { // nature.ts L325-328
  const s = season(w);
  return s === 0 ? 1.14 : s === 3 ? 0.78 : 1;
}
// fx（engine L9781-9799）
function Fx(w, kind, x, y, ttl, opts) {
  if (w.effects.length >= FX_CAP) {
    let victim = -1;
    for (let i = 0; i < w.effects.length; i++) if (FX_MINOR.has(w.effects[i].kind)) { victim = i; break; }
    if (victim >= 0) w.effects.splice(victim, 1);
    else if (FX_MINOR.has(kind)) return null;
  }
  // engine L9793-9797：默认面后 spread opts（x0/y0/src/r/dmg 覆盖 —— castArrow L4369 消费）
  const e = { kind, x, y, x0: x, y0: y, r: 1, age: 0, ttl, seed: MathFloor(Rng(w) * 65536), dir: Rng(w) * Math.PI * 2, ...opts };
  w.effects.push(e);
  return e;
}
// addEvent（engine L13995-14013）
function AddEvent(w, kind, text, o) {
  const ev = { id: w.eventSeq++, year: MathFloor(w.yearF), kind, text, colorHex: o?.colorHex, x: o?.x, y: o?.y };
  w.worldEvents.unshift(ev);
  if (w.worldEvents.length > 80) w.worldEvents.length = 80;
}
// toast（engine L13988-13990）
function Toast(w, text, tone) { w.toasts.push({ id: w.toastSeq++, text, tone, op: null }); }
// shiftRaceRel（engine L8054-8059）
function ShiftRaceRel(w, a, b, dv) {
  if (a === b) return;
  const key = pairKey(a, b);
  const cur = w.raceRel.get(key) ?? RACE_REL_BASE[key] ?? 0;
  w.raceRel.set(key, Math.max(-80, Math.min(80, cur + dv)));
}
// allianceOfCiv（engine L8061-8065）
function AllianceOfCiv(w, civId) {
  const id = w.allianceOf.get(civId);
  if (id == null) return null;
  return w.alliances.find((al) => al.id === id) ?? null;
}
// markDirty（overlay 域 no-op：接力黄金无渲染消费）
const markDirty = () => {};
// claimTile（engine L1719-1754；diplomacyMeet 深链 GUARD）
function ClaimTile(w, i, civId) {
  const civ = w.civs[civId];
  if (!civ || !civ.alive) return;
  w.owner[i] = civId;
  if (w.occCiv[i] !== -1) { w.occCiv[i] = -1; w.occStr[i] = 0; w.occSet.delete(i); }
  civ.tiles.push(i);
  markDirty(i);
  if (w.overlayMode === 'political' || w.overlayMode === 'alliance') w.overlayDirty = true;
  const x = i % W, y = (i / W) | 0;
  const push = (j) => { if (w.owner[j] === -1 && isLand(w.terrain[j]) && w.terrain[j] !== T.MOUNTAIN) civ.frontier.push(j); };
  if (x > 0) push(i - 1);
  if (x < W - 1) push(i + 1);
  if (y > 0) push(i - W);
  if (y < H - 1) push(i + W);
  const meet = (j) => {
    const o = w.owner[j];
    if (o >= 0 && o !== civId) {
      throw new Error('claimTile→diplomacyMeet 深链未转写（第二批域；黄金场景无边境接触）');
    }
  };
  if (x > 0) meet(i - 1);
  if (x < W - 1) meet(i + 1);
  if (y > 0) meet(i - W);
  if (y < H - 1) meet(i + W);
}
// buildBuilding（engine L1756-1772；connectRoad L1906-1929）
function BuildBuilding(w, i, kind, civId) {
  if (w.building[i] > 0) return;
  const b = { i, x: i % W, y: (i / W) | 0, kind, civ: civId };
  w.buildings.push(b);
  w.bIdx.set(i, w.buildings.length - 1);
  w.building[i] = kind;
  w.bHp.set(i, Math.round((BUILDING_HP[kind] ?? 0) * 1)); // BUILDING_DEFS[kind].hp × techModsOf(civId).bhp（无科技 → 1）
  w.damagedSet.delete(i);
  const civ = w.civs[civId];
  if (civ && kind !== BUILD_KINDS.WALL) civ.houses++;
  if (kind !== BUILD_KINDS.WALL) ConnectRoad(w, i, civId);
}
function ConnectRoad(w, i, civId) {
  const x = i % W, y = (i / W) | 0;
  let best = null, bestD = Infinity;
  for (const o of w.buildings) {
    if (o.civ !== civId || o.i === i) continue;
    if (o.kind !== BUILD_KINDS.CAPITAL && w.road[o.i] === 0) continue;
    const d = Math.abs(o.x - x) + Math.abs(o.y - y);
    if (d > 0 && d < bestD) { bestD = d; best = o.i; }
  }
  if (best == null) return;
  throw new Error('connectRoad→findPath 深链未转写（第二批域；黄金场景无既有路网建筑）');
}
// foundSettlement（engine L5704-5739）
function FoundSettlement(w, u, i) {
  const civ = u.civ >= 0 ? w.civs[u.civ] : null;
  if (!civ || !civ.alive) return;
  if (w.building[i] === 0 && buildable(w.terrain[i])) BuildBuilding(w, i, 1, civ.id);
  const cx = i % W, cy = (i / W) | 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = idx(xx, yy);
      if (w.owner[j] === -1 && isLand(w.terrain[j]) && w.terrain[j] !== T.MOUNTAIN) ClaimTile(w, j, civ.id);
    }
  }
  AddEvent(w, 'settle', `「${civ.name}」的殖民者在遥远的海岸建立了新定居点`, { colorHex: civ.colorHex, x: cx, y: cy });
  Toast(w, `「${civ.name}」的殖民者发现了新大陆`, 'good');
  Fx(w, 'heart', cx, cy - 1, 40);
}
// atWar（engine L2061-2064 —— rel < -20）
function AtWarT(w, a, b) {
  const v = w.rel.get(pairKey(a, b));
  return v !== undefined && v < -20;
}
// findLandNear（engine L5589-5606）
function FindLandNear(w, x, y, r) {
  const cx = MathFloor(x), cy = MathFloor(y);
  for (let ring = 1; ring <= r; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        const t = w.terrain[idx(xx, yy)];
        if (!isWater(t) && t !== T.MOUNTAIN && t !== T.LAVA) return { x: xx + 0.5, y: yy + 0.5 };
      }
    }
  }
  return null;
}
// grabbedTick（engine L5343-5376）
function GrabbedTick(w, u) {
  if (u.grab) u.grab -= 2;
  if ((u.thrT ?? 0) > 0) {
    u.thrT = (u.thrT ?? 0) - 2;
    const nx = Math.max(0.5, Math.min(W - 0.5, u.x + (u.thrVx ?? 0) * 2));
    const ny = Math.max(0.5, Math.min(H - 0.5, u.y + (u.thrVy ?? 0) * 2));
    const tt = w.terrain[idx(MathFloor(nx), MathFloor(ny))];
    if (tt !== T.MOUNTAIN) { u.x = nx; u.y = ny; }
    u.thrVx = (u.thrVx ?? 0) * 0.94;
    u.thrVy = (u.thrVy ?? 0) * 0.94;
    if (Rng(w) < 0.3) Fx(w, 'dust', u.x, u.y, 10);
    if ((u.thrT ?? 0) <= 0) {
      const dist = Math.hypot(u.x - (u.thrX0 ?? u.x), u.y - (u.thrY0 ?? u.y));
      const dmg = Math.round(dist * 2.6);
      u.hp -= dmg;
      u.hurt = 24;
      u.grab = Math.max(u.grab ?? 0, 24);
      u.thrT = 0;
      for (let k = 0; k < 3; k++) Fx(w, 'dust', u.x + (Rng(w) - 0.5) * 1.6, u.y + (Rng(w) - 0.5) * 1.6, 20);
      if (w.fxPrefs.dmgNumbers && dmg > 0) Fx(w, 'dmg', u.x, u.y - 1, 30, { text: `${dmg}` });   // L5366 {text: `${dmg}`}（第五批 dump text 维度）
      w.shake = Math.max(w.shake, Math.min(5, 1 + dist * 0.3));
    }
    if (u.hp <= 0) u.dead = true;
  } else if ((u.grab ?? 0) <= 0) {
    u.grab = 0; u.thrVx = 0; u.thrVy = 0;
  }
}
// updateBoat（engine L5608-5660；YEAR_TICKS = 40 constants.ts L9）
const YEAR_TICKS = 40;
function UpdateBoat(w, u) {
  u.age += 2 / YEAR_TICKS;
  if (u.age > u.maxAge) { u.dead = true; return; }
  u.boatTTL = (u.boatTTL ?? 0) - 1;
  const dx = u.tx - u.x, dy = u.ty - u.y;
  const d = Math.hypot(dx, dy);
  void d;
  if ((u.boatTTL ?? 0) <= 0) {
    if ((u.boatTTL ?? 0) <= -600) {
      u.dead = true;
      Fx(w, 'skull', u.x, u.y, 46);
      AddEvent(w, 'shipwreck', '一艘殖民船连同它的船员葬身了大海', { x: u.x, y: u.y });
      return;
    }
    const land = FindLandNear(w, u.x, u.y, 14);
    if (land) { u.tx = land.x; u.ty = land.y; }
  }
  const baseAng = Math.atan2(u.ty - u.y, u.tx - u.x);
  const aheadX = MathFloor(u.x + Math.cos(baseAng) * 0.4);
  const aheadY = MathFloor(u.y + Math.sin(baseAng) * 0.4);
  const aheadBlocked = aheadX < 0 || aheadY < 0 || aheadX >= W || aheadY >= H || !isWater(w.terrain[idx(aheadX, aheadY)]);
  if (aheadBlocked) {
    const coast = FindLandNear(w, u.x, u.y, 2);
    if (coast) { u.tx = coast.x; u.ty = coast.y; }
  }
  if (Math.hypot(u.tx - u.x, u.ty - u.y) < 2.5) {
    if (Disembark(w, u)) return;
    if ((u.boatTTL ?? 0) > 0) {
      const land = FindLandNear(w, u.tx, u.ty, 6);
      if (land) { u.tx = land.x; u.ty = land.y; }
    }
  }
  const step = 0.26;
  for (const off of [0, 0.7, -0.7, 1.4, -1.4, 2.6, -2.6, Math.PI]) {
    const ang = baseAng + off;
    const nx = u.x + Math.cos(ang) * step;
    const ny = u.y + Math.sin(ang) * step;
    if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
    if (!isWater(w.terrain[idx(MathFloor(nx), MathFloor(ny))])) continue;
    u.x = nx; u.y = ny;
    if (Math.cos(ang) !== 0) u.flip = Math.cos(ang) < 0 ? 1 : 0;
    return;
  }
}
// disembark（engine L5663-5697；WBB.touchMeta = boat 列 wasm 镜像写点——转写层 no-op 同 WbCivSim 先例）
function Disembark(w, u) {
  const x = MathFloor(u.x), y = MathFloor(u.y);
  let best = null, bestScore = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = idx(xx, yy);
      const t = w.terrain[i];
      if (isWater(t) || t === T.MOUNTAIN || t === T.LAVA) continue;
      let score = 0;
      if (w.owner[i] === -1 && w.building[i] === 0 && buildable(t)) score = 3;
      else if (w.owner[i] === u.civ && u.civ >= 0) score = 2;
      else if (u.civ >= 0 && w.owner[i] >= 0 && w.owner[i] !== u.civ && AtWarT(w, u.civ, w.owner[i])) score = 1;
      if (score > bestScore) { bestScore = score; best = i; }
    }
  }
  if (best == null) return false;
  const lx = (best % W) + 0.5, ly = ((best / W) | 0) + 0.5;
  const wasColonist = bestScore === 3;
  u.boat = 0; u.boatTTL = 0; u.x = lx; u.y = ly; u.tx = lx; u.ty = ly;
  Fx(w, 'spawn', lx, ly, 30);
  if (wasColonist) FoundSettlement(w, u, best);
  return true;
}
// updateUnit（engine L3455-3464 —— case1 船可达前奏；主体域（战斗/职业）桩域 GUARD）
function UpdateUnit(w, u) {
  if (u.hurt > 0) u.hurt--;
  if ((u.grab ?? 0) > 0) { GrabbedTick(w, u); return; }
  if (u.boat) { UpdateBoat(w, u); return; }
  throw new Error('updateUnit 主体（非船域：战斗/职业/尾段）未转写（第二批余域；case1 契约 = 船单位）');
}
// —— M-U3h 第三批 case2 涌现接力域（机械转写，零引擎导入）——
// wildCapOf（engine L2132-2157；dynRaces 空表 → 缺省 40）
function WildCapOf(w, race) {
  if (race === 6) return 240;
  if (race === 7) return 90;
  if (race === 10) return 160;
  if (race === 11) return 110;
  if (race === 12) return 90;
  if (race === 13) return 60;
  if (race === 14) return 80;
  if (race === 15) return 70;
  if (race === 33) return 150;
  if (race === 34) return 120;
  if (race === 35) return 220;
  if (race === 36) return 70;
  if (race === 37) return 280;
  if (race === 38) return 90;
  if (race === 39) return 90;
  if (race === 40) return 16;
  const d = w.dynRaces ? w.dynRaces.get(race) : null;
  if (!d) return 40;
  if (d.cap) return d.cap;
  if (d.eco === 'herb') return 140;
  if (d.eco === 'pred') return 60;
  if (d.eco === 'neutral') return 80;
  return WildCapOf(w, d.parent);
}
// bumpWild（engine L1082-1087）
function BumpWild(w, race, d) {
  const n = (w.wildCount.get(race) ?? 0) + d;
  if (n > 0) w.wildCount.set(race, n);
  else w.wildCount.delete(race);
}
// wildAlive（engine L1089-1094）
function WildAlive(w) {
  let n = 0;
  for (const v of w.wildCount.values()) n += v;
  return n;
}
// wildAliveAquatic（engine L1096-1100；aquatic 旗标分账——场景无动态种）
function WildAliveAquatic(w) {
  let n = 0;
  for (const [race, v] of w.wildCount) if (AQUATIC_RACES.has(race)) n += v;
  return n;
}
// rollJob（engine L1472-1480）
function RollJob(w) {
  let total = 0;
  for (const j of JOBS_MUL) total += j.weight;
  let r = Rng(w) * total;
  for (let i = 0; i < JOBS_MUL.length; i++) { r -= JOBS_MUL[i].weight; if (r <= 0) return i; }
  return 0;
}
// uniqueName（engine L1522-1534；unitName = names.ts L74-77）
function UnitNameOf(race, w) {
  const pool = FIRST[race] ?? FIRST[0];
  return pool[MathFloor(Rng(w) * pool.length)];
}
function UniqueName(w, race) {
  const base = UnitNameOf(race, w);
  const bl = base.length;
  let n = 0;
  for (const u of w.units) {
    if (u.dead) continue;
    const nm = u.name;
    if (nm === base || (nm.length > bl && nm.charCodeAt(bl) === 32 && nm.startsWith(base))) n++;
  }
  return n === 0 ? base : `${base} ${Roman(n + 1)}`;
}
// newFamily（engine L1111-1133）
function NewFamily(w, race, founder) {
  const pre = FAM_PRE[MathFloor(Rng(w) * FAM_PRE.length)];
  const post = FAM_POST[MathFloor(Rng(w) * FAM_POST.length)];
  const f = {
    id: w.familySeq++, name: pre + post, race, founded: MathFloor(w.yearF), founder: founder.name,
    members: 1, heroes: 0, kills: 0, peak: 1, milestones: 0,
  };
  w.families.set(f.id, f);
  PruneFamilies(w);
  return f;
}
// pruneFamilies（engine L1135-1138）
function PruneFamilies(w) {
  if (w.families.size <= 240) return;
  const dead = [...w.families.values()].filter((f) => f.members <= 0 && f.kills < 10).sort((a, b) => a.id - b.id);
  for (let i = 0; i < 20 && i < dead.length; i++) w.families.delete(dead[i].id);
}
// familyMilestone（engine L1139-1149）
function FamilyMilestone(w, f) {
  if (f.members > f.peak) f.peak = f.members;
  const marks = [12, 24, 40];
  while (f.milestones < marks.length && f.members >= marks[f.milestones]) {
    const m = marks[f.milestones++];
    const raceName = statOf(f.race).name;
    AddEvent(w, 'lineage', `${raceName}「${f.name}」家族枝繁叶茂 —— 族人已达 ${m} 口（先祖 ${f.founder}）`);
  }
}
// inventTrait（emergence.ts L390-417）
function InventTrait(w, gene, seq) {
  const prefix = TRAIT_PREFIX[MathFloor(Rng(w) * TRAIT_PREFIX.length)];
  const body = TRAIT_BODY[MathFloor(Rng(w) * TRAIT_BODY.length)];
  const t = { key: `dt${seq}`, name: `${prefix}${body}`, desc: '', good: true };
  const pick = Rng(w);
  if (gene.d >= 1.5 && pick < 0.4) {
    t.dmgMul = Math.round((1.18 + Rng(w) * 0.2) * 100) / 100;
    if (Rng(w) < 0.4) t.hpMul = Math.round((0.88 + Rng(w) * 0.1) * 100) / 100;
  } else if (gene.h >= 1.5 && pick < 0.7) {
    t.hpMul = Math.round((1.2 + Rng(w) * 0.22) * 100) / 100;
    if (Rng(w) < 0.35) t.regen = 0.02;
  } else if (gene.s >= 1.5 && pick < 0.9) {
    t.speedMul = Math.round((1.15 + Rng(w) * 0.18) * 100) / 100;
    if (Rng(w) < 0.4) t.dmgMul = Math.round((1.08 + Rng(w) * 0.1) * 100) / 100;
  } else {
    t.regen = Math.round((0.015 + Rng(w) * 0.03) * 1000) / 1000;
    t.hpMul = Math.round((1.1 + Rng(w) * 0.15) * 100) / 100;
  }
  const bits = [];
  if (t.dmgMul) bits.push(`伤害 +${Math.round((t.dmgMul - 1) * 100)}%`);
  if (t.hpMul) bits.push(`生命 +${Math.round((t.hpMul - 1) * 100)}%`);
  if (t.speedMul) bits.push(`速度 +${Math.round((t.speedMul - 1) * 100)}%`);
  if (t.regen) bits.push('缓慢再生');
  t.desc = bits.join(' ') + '（涌现特质）';
  return t;
}
// recordEvo（engine L3305-3316；720 图谱上限保留全语义）
function RecordEvo(w, kind, name, parentKey, colorHex, detail, stat, meta) {
  const id = w.evoSeq++;
  const parent = parentKey ? (w.evoIndex.get(parentKey) ?? null) : null;
  w.evoNodes.push({ id, kind, name, parent, year: MathFloor(w.yearF), colorHex, detail, stat, alive: true, meta });
  if (w.evoNodes.length > 720) {
    const drop = w.evoNodes.splice(0, w.evoNodes.length - 720);
    const dropped = new Set(drop.map((n) => n.id));
    for (const n of w.evoNodes) if (n.parent != null && dropped.has(n.parent)) n.parent = null;
  }
  return id;
}
// techModsOf 最小面（engine L4859-4874；场景 civ techs 空 → NEUTRAL；非空/emTechs 触达即 throw）
function TechModsOf2(w, civId) {
  if (civId < 0) return { hp: 1, dmg: 1 };
  const c = w.civs[civId];
  if (c && (c.techs ?? []).length > 0) throw new Error('techModsOf 非空 techs 未转写（case2 场景外）');
  if (w.emTechs && w.emTechs.size > 0) throw new Error('emTechs 叠加未转写（case2 场景外）');
  return { hp: 1, dmg: 1 };
}
// govOf（engine L8067-8070）
const GovOf = (w, civId) => (civId < 0 ? 0 : (w.civs[civId]?.gov ?? 0));
// spawnUnit（engine L1283-1465；静默可达域全译；announce/findCivNear/createCiv/rollTrait/devEquip/baseGene 桩 GUARD）
function SpawnUnit(w, race, x, y, opts) {
  const st = statOf(race);
  if (st.isCiv && w.units.length >= MAX_UNITS2) return null;
  if (!st.isCiv) {
    if (st.aquatic) { if (WildAliveAquatic(w) >= MAX_WILDLIFE_AQUATIC2) return null; }
    else if (WildAlive(w) >= MAX_WILDLIFE2) return null;
  }
  if (race === R2D && (w.wildCount.get(race) ?? 0) >= MAX_DRAGONS2) return null;
  if (race === RDD && (w.wildCount.get(race) ?? 0) >= MAX_DEMONS2) return null;
  if (race === 21 && (w.wildCount.get(race) ?? 0) >= MAX_TROLLS2) return null;
  if (race === 22 && (w.wildCount.get(race) ?? 0) >= MAX_OGRES2) return null;
  if (race === 23 && (w.wildCount.get(race) ?? 0) >= MAX_WHITEWALKERS2) return null;
  if (race === 24 && (w.wildCount.get(race) ?? 0) >= MAX_VAMPIRES2) return null;
  if (race === 25 && (w.wildCount.get(race) ?? 0) >= MAX_KRAKENS2) return null;
  if (race === 26 && (w.wildCount.get(race) ?? 0) >= MAX_SANDWORMS2) return null;
  if (race === 27 && (w.wildCount.get(race) ?? 0) >= MAX_BASILISKS2) return null;
  if (race === 32 && (w.wildCount.get(race) ?? 0) >= MAX_HYDRAS2) return null;
  x = Math.max(0.5, Math.min(W - 0.5, x));
  y = Math.max(0.5, Math.min(H - 0.5, y));
  let civ = opts?.civ ?? -1;
  if (st.isCiv && civ < 0) throw new Error('findCivNear/createCiv 深链未转写（case2 场景 civ>=0 或野生）');
  const trait = opts?.trait !== undefined ? (opts.trait || null) : (Rng(w) < 0.15 ? RollTrait(w) : null);   // L1316 三门（第五批繁衍链 traitKey=null 可达 → 0.15 门）
  const td = trait ? TRAITS_ALL[trait] : null;
  if (opts?.gene === undefined) throw new Error('baseGene 深链未转写（case2 场景恒传 gene）');
  const gene = opts.gene;
  let job = 0;
  if (st.isCiv && civ >= 0) job = opts?.job ?? RollJob(w);
  const jd = st.isCiv ? JOBS_MUL[job] : null;
  const tm = st.isCiv && civ >= 0 ? TechModsOf2(w, civ) : null;
  const tH = tm?.hp ?? 1;
  const tD = tm?.dmg ?? 1;
  const maxHp = Math.round(st.hp * (td?.hpMul ?? 1) * (jd?.hpMul ?? 1) * tH * (gene?.h ?? 1));
  const u = {
    id: w.unitSeq++, race, civ, x, y,
    lx: x, ly: y, rx: x, ry: y, tx: x, ty: y,
    hp: maxHp, maxHp,
    dmg: st.dmg * (td?.dmgMul ?? 1) * (jd?.dmgMul ?? 1) * tD * (GovOf(w, civ) === 4 ? 1.15 : 1) * (gene?.d ?? 1),
    speed: st.speed * (td?.speedMul ?? 1) * (jd?.speedMul ?? 1) * (gene?.s ?? 1),
    tDmg: tD, tHp: tH,
    age: 0, maxAge: st.maxAge * (0.8 + Rng(w) * 0.4), kills: 0, cd: 0,
    trait, gene,
    job: st.isCiv ? job : undefined,
    infected: opts?.infected ?? false,
    flip: Rng(w) < 0.5,
    name: UniqueName(w, race),
    hurt: 0, breath: 120 + MathFloor(Rng(w) * 160), parity: w.unitSeq % 2, dead: false,
    fam: null, fgn: null,
  };
  w.units.push(u);
  // WBB.touchRow —— 新行 meta 列行级增量灌入（wasm 镜像写点，转写层 no-op 同先例）
  w.unitById.set(u.id, u);
  if (civ >= 0 && w.civs[civ]) w.civs[civ].pop++;
  if (!st.isCiv) BumpWild(w, race, 1);
  if (opts?.fam !== undefined) {
    u.fam = opts.fam;
    u.fgn = opts.fgn ?? 1;
    const f = w.families.get(opts.fam);
    if (f) { f.members++; FamilyMilestone(w, f); }
  } else if (!st.undead && Rng(w) < 0.06) {
    const f = NewFamily(w, race, u);
    u.fam = f.id;
    u.fgn = 1;
  }
  if (opts?.gear) throw new Error('devEquip 未转写（case2 场景不传 gear）');
  if (!opts?.silent) throw new Error('spawnUnit announce 分支未转写（case2 场景恒 silent）');
  return u;
}
// inventEmergentTrait（engine L3318-3330）
function InventEmergentTrait(w, parent, childGene) {
  const t = InventTrait(w, childGene, w.traitSeq);
  t.key = `dt${w.traitSeq++}`;
  w.dynTraits.set(t.key, t);
  TRAITS_ALL[t.key] = t;
  RecordEvo(w, 'trait', t.name, null, '#ff5fd2', `${t.desc} —— 源自「${statOf(parent.race).name}」种群 ${MathFloor(w.yearF)} 年的极端基因个体`, t.desc, { race: parent.race });
  AddEvent(w, 'emerge', `演化奇迹——「${statOf(parent.race).name}」种群诞生了前所未见的个体，携带着新特质「${t.name}」（${t.desc}）`, { colorHex: '#ff5fd2', x: parent.x, y: parent.y });
  return t.key;
}
// wbResume case2 体（engine L3230-3257）
function Case2(w, u, d) {
  const cg = { s: d[0], d: d[1], h: d[2], r: d[3] };
  // 超级演化 v4：辐射区演化高压锅（Rust 侧已定型 cg，JS 侧对辐射带出生的于代二次放大偏移）
  const rIdx = idx(Math.max(0, Math.min(W - 1, u.x | 0)), Math.max(0, Math.min(H - 1, u.y | 0)));
  if (w.radiate[rIdx] > 0) {
    const pg = u.gene ?? { s: 1, d: 1, h: 1, r: 1 };
    for (const k of ['s', 'd', 'h', 'r']) {
      cg[k] = Math.max(0.5, Math.min(2, pg[k] + (cg[k] - pg[k]) * 2.2));
    }
  }
  const traitKey = InventEmergentTrait(w, u, cg);
  if (d[4] >= 1) {
    // 文明分支（人口/上限门已在 Rust 通过）
    const civ = w.civs[u.civ];
    if (civ && civ.alive) {
      const fam = u.fam ?? (Rng(w) < 0.25 ? NewFamily(w, u.race, u).id : undefined);
      SpawnUnit(w, u.race, u.x + Rng(w) - 0.5, u.y + Rng(w) - 0.5, { civ: u.civ, silent: true, gene: cg, trait: traitKey ?? undefined, fam, fgn: fam !== undefined ? (u.fgn ?? 1) + 1 : undefined });
      Fx(w, 'heart', u.x, u.y - 1, 40);
    }
  } else {
    const cap = WildCapOf(w, u.race);
    const same = w.wildCount.get(u.race) ?? 0;
    if (same < cap) {
      const fam = u.fam ?? (Rng(w) < 0.25 ? NewFamily(w, u.race, u).id : undefined);
      SpawnUnit(w, u.race, u.x + Rng(w) - 0.5, u.y + Rng(w) - 0.5, { silent: true, gene: cg, trait: traitKey ?? undefined, fam, fgn: fam !== undefined ? (u.fgn ?? 1) + 1 : undefined });
      Fx(w, 'heart', u.x, u.y - 1, 40);
    }
  }
}
// ================= M-U3h 第四批 case3 建筑摧毁级联（engine 蓝本机械转写，零引擎导入） =================
// CAPTURABLE（types.ts L343 —— Set{HOUSE, FARM, MARKET, BARRACKS, PORT}）
const CAPTURABLE = new Set([1, 4, 9, 5, 7]);
// destroyBuilding（engine L1936-1952）
function DestroyBuilding(w, i) {
  const bi = w.bIdx.get(i);
  if (bi === undefined) return;
  const b = w.buildings[bi];
  const civ = w.civs[b.civ];
  if (civ) {
    civ.houses--;
    if (b.kind === 2) civ.capital = -1; // BUILD_KINDS.CAPITAL
  }
  const last = w.buildings.pop();
  if (bi < w.buildings.length) {
    w.buildings[bi] = last;
    w.bIdx.set(last.i, bi);
  }
  w.bIdx.delete(i);
  w.building[i] = 0;
  w.bHp.delete(i);
  w.damagedSet.delete(i);
  Fx(w, 'smoke', b.x, b.y, 36, { r: 1.5 });
}
// addWarScore（engine L7234-7245）
function AddWarScore(w, byCiv, victimCiv, pts, kind) {
  const wd = w.warData.get(pairKey(byCiv, victimCiv));
  if (!wd) return;
  const isA = wd.a === byCiv;
  if (isA) wd.scoreA += pts; else wd.scoreB += pts;
  if (kind === 'kill') {
    if (isA) { wd.casB += 1; wd.exB += 1; } else { wd.casA += 1; wd.exA += 1; }
  } else if (kind === 'raze' || kind === 'capture') {
    if (isA) wd.razedA += 1; else wd.razedB += 1;
  }
}
// noteOccupied（engine L7172-7177）
function NoteOccupied(w, byCiv, victimCiv, n) {
  if (n <= 0 || byCiv === victimCiv) return;
  const wd = w.warData.get(pairKey(byCiv, victimCiv));
  if (!wd) return;
  if (wd.a === byCiv) wd.occA += n; else wd.occB += n;
}
// annexTiles（engine L4510-4553：以 tile 为圆心把半径 r 内守方领土/建筑划归攻方）
function AnnexTiles(w, center, toCiv, r) {
  const victim = w.owner[center];
  const cx = center % W;
  const cy = (center / W) | 0;
  let took = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r + 0.5) continue;
      const xx = cx + dx;
      const yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = idx(xx, yy);
      // 领土易主（仅吞并受害方与无主地，不抢第三方）
      if (w.owner[i] === victim || (w.owner[i] === -1 && victim === -1)) {
        const old = w.owner[i];
        if (old >= 0 && old !== toCiv) {
          w.civs[old].tiles = w.civs[old].tiles.filter((t) => t !== i);
          if (old === victim) took++;
        }
        w.owner[i] = toCiv;
        w.civs[toCiv].tiles.push(i);
        markDirty(i);
      }
      // 建筑易帜或焚毁
      if (w.building[i] > 0) {
        const bi = w.bIdx.get(i);
        const b = w.buildings[bi];
        if (b.civ !== toCiv) {
          if (CAPTURABLE.has(b.kind)) {
            const oldCiv = w.civs[b.civ];
            if (oldCiv) oldCiv.houses--;
            b.civ = toCiv;
            w.civs[toCiv].houses++;
            w.bHp.set(i, BUILDING_HP[b.kind]);
          } else {
            DestroyBuilding(w, i);
          }
        }
      }
    }
  }
  // 战争占领入账（目的进度：border/conquest 的量尺）
  if (took > 0 && victim >= 0) NoteOccupied(w, toCiv, victim, took);
  if (w.overlayMode === 'political' || w.overlayMode === 'alliance') w.overlayDirty = true;
}
// sackCapital（engine L4498-4508：王都陷落——吞并 6 格 + 震屏播报；onSound 宿主回调 no-op）
function SackCapital(w, capital, byCiv) {
  const attacker = w.civs[byCiv];
  const victim = w.civs[capital.civ];
  if (!attacker?.alive || !victim?.alive) return;
  w.shake = Math.max(w.shake, 10);
  AnnexTiles(w, capital.i, byCiv, 6);
  AddWarScore(w, byCiv, capital.civ, 40, 'capital');
  AddEvent(w, 'sack', `「${victim.name}」的王都陷落了！「${attacker.name}」的铁蹄踏碎了最后的城墙，国土尽数易主`, { colorHex: attacker.colorHex, x: capital.x, y: capital.y });
  Toast(w, `「${victim.name}」的王都陷落了`, 'war');
  // onSound('boom') —— 宿主回调（黄金受控 undefined → no-op 同 gen 端）
}
// onBuildingDestroyed（engine L4464-4496：建筑被摧毁后的战争结算——占领易帜 / 王都陷落 / 攻城纪事）
function OnBuildingDestroyed(w, i, byCiv) {
  const bi = w.bIdx.get(i);
  if (bi === undefined) return;
  const b = w.buildings[bi];
  const kind = b.kind;
  const victimCiv = b.civ;
  DestroyBuilding(w, i);
  if (byCiv == null || byCiv < 0 || byCiv === victimCiv) return; // 天灾/己方摧毁：无战争结算
  const attacker = w.civs[byCiv];
  const victim = w.civs[victimCiv];
  if (!attacker?.alive || !victim?.alive) return;
  if (!AtWarT(w, byCiv, victimCiv)) return;
  // 占领：可易帜建筑（住宅/农田/集市/兵营/港口）45% 归入攻方，周边领土易主
  if (CAPTURABLE.has(kind) && Rng(w) < 0.45) {
    BuildBuilding(w, i, kind, byCiv);
    AnnexTiles(w, i, byCiv, 2);
    AddWarScore(w, byCiv, victimCiv, 8, 'capture');
    AddEvent(w, 'capture', `「${attacker.name}」占领了「${victim.name}」的${BUILD_NAME[kind]}`, { colorHex: attacker.colorHex, x: b.x, y: b.y });
    Fx(w, 'spawn', b.x, b.y, 26);
    if (w.overlayMode === 'political' || w.overlayMode === 'alliance') w.overlayDirty = true;
    return;
  }
  // 王都陷落：大事件——攻方吞并王都周边领土，守方建筑尽数易帜或焚毁
  if (kind === 2) {
    SackCapital(w, b, byCiv);
    return;
  }
  // 普通攻城摧毁：纯武力拆毁 + 节流纪事
  AddWarScore(w, byCiv, victimCiv, 5, 'raze');
  if (w.tickCount - w.lastSiegeEventTick > 150) {
    w.lastSiegeEventTick = w.tickCount;
    AddEvent(w, 'siege', `「${attacker.name}」的军队摧毁了「${victim.name}」的${BUILD_NAME[kind]}`, { colorHex: attacker.colorHex, x: b.x, y: b.y });
  }
}
// BUILD_NAME（types.ts L325-337 BUILDING_DEFS[kind].name 消费切片——capture/siege 纪事文案）
const BUILD_NAME = { 1: '住宅', 2: '王都', 3: '箭塔', 4: '农田', 5: '兵营', 6: '城堡', 7: '港口', 8: '图书馆', 9: '集市', 10: '神殿', 11: '城墙' };
// castArrow（engine L4368-4370）
function CastArrow(w, u, tx, ty, dmg) {
  Fx(w, 'arrow', Math.max(0.5, Math.min(W - 0.5, tx)), Math.max(0.5, Math.min(H - 0.5, ty)), 12, { x0: u.x, y0: u.y, src: u.civ, r: 0, dmg });
}
// enemyBuildingNear（engine L4396-4417：单位周边半径 r 最近敌国建筑 tile）
function EnemyBuildingNear(w, u, r) {
  const cx = Math.floor(u.x);
  const cy = Math.floor(u.y);
  const rr = Math.ceil(r);
  let best = -1;
  let bestD = r + 0.5;
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const xx = cx + dx;
      const yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = idx(xx, yy);
      const bk = w.building[i];
      if (bk === 0) continue;
      const b = w.buildings[w.bIdx.get(i) ?? -1];
      if (!b || b.civ === u.civ) continue;
      if (u.civ >= 0 && !AtWarT(w, u.civ, b.civ)) continue;
      const d = Math.hypot(xx - u.x, yy - u.y);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}
// nearestEnemyBuilding（engine L4421-4431：全表扫描最近敌国交战建筑）
function NearestEnemyBuilding(w, u) {
  let best = null;
  let bestD = Infinity;
  for (const b of w.buildings) {
    if (b.civ === u.civ) continue;
    if (u.civ < 0 || !AtWarT(w, u.civ, b.civ)) continue;
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}
// wbResume case3 体（engine L3258-3285）
function Case3(w, u, d) {
  // 建筑摧毁级联（单位 cd/atk 已置）：onBuildingDestroyed + 战争 AI 分支剩余 + 尾段
  const tile = d[0] | 0;
  const byCiv = d[1] | 0;
  OnBuildingDestroyed(w, tile, byCiv);
  const job = u.job ?? 0;
  const inArmy = u.army != null;
  // 弓手轰击（cd 已被置 14 → 门不触发，掷骰不消耗 —— 与 Rust 短路一致）
  if (job === 3 && u.cd <= 0 && Rng(w) < 0.1) {
    const bi = EnemyBuildingNear(w, u, 5); // JOBS[3].ranged ?? 5
    if (bi >= 0) {
      u.cd = 18;
      CastArrow(w, u, (bi % W) + 0.5, ((bi / W) | 0) + 0.5, u.dmg);
    }
  }
  if (!inArmy) {
    if (Rng(w) < 0.05 && MaybeBoardForWar(w, u)) return;
    {
      const tdx = u.tx - u.x;
      const tdy = u.ty - u.y;
      if (tdx * tdx + tdy * tdy < 1.44 || Rng(w) < 0.03) {
        const tgt = NearestEnemyBuilding(w, u);
        if (tgt) { u.tx = tgt.x + Rng(w) * 2 - 1; u.ty = tgt.y + Rng(w) * 2 - 1; }
      }
    }
  }
  if (UpdateUnitTailJS(w, u)) return;
  UpdateUnitPostJS(w, u);
}

// caravanArrive（engine L4770-4796）
function CaravanArrive(w, u) {
  const home = u.civ >= 0 ? w.civs[u.civ] : null;
  const partner = w.civs[u.caravan];
  const alC = home && partner ? AllianceOfCiv(w, home.id) : null;
  const allyBonus = alC && partner && alC.members.includes(partner.id) ? (alC.bonded ? 1.38 : 1.25) : 1;
  const val = Math.round((6 + MathFloor(Rng(w) * 9)) * allyBonus);
  if (home && home.alive) {
    home.gold = (home.gold ?? 0) + val;
    if (Rng(w) < 0.35) home.knowledge = (home.knowledge ?? 0) + 1;
  }
  if (partner && partner.alive) {
    partner.gold = (partner.gold ?? 0) + val;
    if (Rng(w) < 0.4) partner.knowledge = (partner.knowledge ?? 0) + 1;
    if (home && home.alive) {
      const key = pairKey(home.id, partner.id);
      w.rel.set(key, Math.min(100, (w.rel.get(key) ?? 0) + 4));
      if (home.race !== partner.race) ShiftRaceRel(w, home.race, partner.race, 0.2);
    }
  }
  Fx(w, 'coin', u.x, u.y - 1, 30);
  if (Rng(w) < 0.3 && home && partner) {
    AddEvent(w, 'trade', `「${home.name}」商队抵达「${partner.name}」，两市共获 ${val} 金`, { colorHex: partner.colorHex, x: u.x, y: u.y });
  }
  u.caravan = 0;
  u.job = 5;
}
// wallBlocks（engine L5804-5812）
function WallBlocks(w, x, y, u) {
  const i = idx(x, y);
  if (w.building[i] !== BUILD_KINDS.WALL) return false;
  const b = w.buildings[w.bIdx.get(i) ?? -1];
  if (!b || b.civ === u.civ) return false;
  if (u.civ >= 0) return AtWarT(w, b.civ, u.civ); // 中立/盟友通行，交战国被拦（M-U3h 第五批 I04 真译——AtWarT 复用）
  return defOf(u.race).hostile;
}
// passTile（engine L5800-5802）
function PassTile(swimming, onMountain, t) {
  if (swimming) return t !== T.LAVA && t !== T.MOUNTAIN;
  if (onMountain) return t !== T.DEEP && t !== T.WATER && t !== T.LAVA;
  return walkable(t);
}
// moveUnit（engine L5813-5876；aquatic/sandswim/flying/maybeBoardForWar 桩域 GUARD）
function MoveUnit(w, u, mul) {
  const def = defOf(u.race);
  const dx = u.tx - u.x, dy = u.ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.05) return;
  let step = u.speed * 2 * mul * (u.chill ? 0.55 : 1) * (u.curse ? 0.75 : 1);
  if (w.terrain[idx(MathFloor(u.x), MathFloor(u.y))] === T.SWAMP) step *= 0.6;
  if (def.coldBlood && season(w) === 3) step *= 0.6;
  if (w.road[idx(MathFloor(u.x), MathFloor(u.y))] > 0) step *= 1.45;
  const nx = u.x + (dx / d) * step;
  const ny = u.y + (dy / d) * step;
  if (dx !== 0) u.flip = dx < 0 ? 1 : 0;
  if (def.flying) {
    u.x = Math.max(0.5, Math.min(W - 0.5, nx));                                                // L5832-5835
    u.y = Math.max(0.5, Math.min(H - 0.5, ny));
    return;
  }
  const cur = w.terrain[idx(MathFloor(u.x), MathFloor(u.y))];
  if (def.aquatic) {
    // 水生巨怪只可在水域游动；滩涂两栖（蟹）：邻水沙滩亦可爬行                                    // L5844-5860
    const nt = w.terrain[idx(MathFloor(nx), MathFloor(ny))];
    if (nt === T.DEEP || nt === T.WATER || (def.beach && nt === T.SAND)) { u.x = nx; u.y = ny; }
    else if (!isWater(cur) && !def.beach) {
      // 搁浅自救：离水的纯水生单位在陆上蹦跳（×0.7 蹒跚仍快于窒息线）
      const f = 0.7;
      u.x = Math.max(0.5, Math.min(W - 0.5, u.x + (nx - u.x) * f));
      u.y = Math.max(0.5, Math.min(H - 0.5, u.y + (ny - u.y) * f));
      u.flip = dx < 0 ? 1 : 0;
    } else {
      // 留在深水：随机改向游动
      u.tx = Math.max(1, Math.min(W - 2, u.x + (Rng(w) * 2 - 1) * 8));
      u.ty = Math.max(1, Math.min(H - 2, u.y + (Rng(w) * 2 - 1) * 8));
    }
    return;
  }
  if (def.sandswim) {
    // 沙泳巨虫只可在沙/草/焦土潜行（内联判定替代闭包）                                          // L5861-5870
    const nt = w.terrain[idx(MathFloor(nx), MathFloor(ny))];
    if (nt === T.SAND || nt === T.GRASS || nt === T.BURNT) { u.x = nx; u.y = ny; }
    else {
      u.tx = Math.max(1, Math.min(W - 2, u.x + (Rng(w) * 2 - 1) * 6));
      u.ty = Math.max(1, Math.min(H - 2, u.y + (Rng(w) * 2 - 1) * 6));
    }
    // 沙泳扬尘：移动中偶尔喷出沙尘（原子级拖尾反馈）
    if (w.fxPrefs.ambience && Rng(w) < 0.08) Fx(w, 'dust', u.x, u.y + 0.5, 12);
    return;
  }
  const swimming = cur === T.DEEP || cur === T.WATER;
  const onMountain = cur === T.MOUNTAIN;
  const wallChk = swimming ? (_x, _y) => false : (x, y) => WallBlocks(w, x, y, u);
  const passX = !wallChk(MathFloor(nx), MathFloor(u.y)) && PassTile(swimming, onMountain, w.terrain[idx(MathFloor(nx), MathFloor(u.y))]);
  const passY = !wallChk(MathFloor(u.x), MathFloor(ny)) && PassTile(swimming, onMountain, w.terrain[idx(MathFloor(u.x), MathFloor(ny))]);
  if (passX && passY) { u.x = nx; u.y = ny; }
  else if (passX) u.x = nx;
  else if (passY) u.y = ny;
  else {
    // 阻断：战时可能是隔海 → 登船跨海远征（WorldBox 战争船）；否则随机改向绕行           // L5881-5889
    if (MaybeBoardForWar(w, u)) return;
    u.tx = Math.max(1, Math.min(W - 2, u.x + (Rng(w) * 2 - 1) * 6));
    u.ty = Math.max(1, Math.min(H - 2, u.y + (Rng(w) * 2 - 1) * 6));
  }
}
// updateUnitTailJS（engine L4116-4260；捕食者/鱼群分支 GUARD）
function UpdateUnitTailJS(w, u) {
  const def = defOf(u.race);
  if ((u.caravan ?? 0) > 0) {
    const pc = w.civs[u.caravan];
    const mi = pc && pc.alive ? w.marketIdx.get(u.caravan) : undefined;
    if (mi == null) {
      u.caravan = 0;
    } else {
      u.tx = (mi % W) + 0.5;
      u.ty = ((mi / W) | 0) + 0.5;
      const cdx = u.x - u.tx, cdy = u.y - u.ty;
      if (cdx * cdx + cdy * cdy < 3.24) CaravanArrive(w, u);
    }
  }
  if (def.predator && !def.undead && (u.food ?? 99) < 70 && Rng(w) < 0.4) {
    // 捕食者索敌（猎手嗅觉）：6 桶半径扫猎 → 猎物密度场导航                                     // L4132-4176
    const hx = Math.min(BKW - 1, Math.max(0, (u.x / 4) | 0));
    const hy = Math.min(BKH - 1, Math.max(0, (u.y / 4) | 0));
    let prey = null;
    let preyD2 = 26 * 26;
    for (let by = hy - 6; by <= hy + 6; by++) {
      for (let bx = hx - 6; bx <= hx + 6; bx++) {
        if (bx < 0 || by < 0 || bx >= BKW || by >= BKH) continue;
        for (const o of w.buckets[by * BKW + bx]) {
          if (o.dead || o === u) continue;
          if (!IsHerbivoreRace(w, o.race)) continue;
          const pdx = o.x - u.x, pdy = o.y - u.y;
          const pd2 = pdx * pdx + pdy * pdy;
          if (pd2 < preyD2) { preyD2 = pd2; prey = o; }
        }
      }
    }
    if (prey && !u.detour) { u.tx = prey.x; u.ty = prey.y; MoveUnit(w, u, 1.15); return true; }
    if (!u.detour) {
      const gx = Math.min(31, Math.max(0, (u.x / 8) | 0));
      const gy = Math.min(19, Math.max(0, (u.y / 8) | 0));
      let bestCell = -1, bestScore = 0;
      for (let cy2 = Math.max(0, gy - 3); cy2 <= Math.min(19, gy + 3); cy2++) {
        for (let cx2 = Math.max(0, gx - 3); cx2 <= Math.min(31, gx + 3); cx2++) {
          const c = w.preyGrid[cy2 * 32 + cx2];
          if (c <= 0) continue;
          const dd = Math.hypot(cx2 - gx, cy2 - gy);
          if (dd < 0.9) continue;
          const score = c / (1 + dd * 0.8);
          if (score > bestScore) { bestScore = score; bestCell = cy2 * 32 + cx2; }
        }
      }
      if (bestCell >= 0) {
        u.tx = Math.max(1, Math.min(W - 2, (bestCell % 32) * 8 + 4 + (Rng(w) * 4 - 2)));
        u.ty = Math.max(1, Math.min(H - 2, ((bestCell / 32) | 0) * 8 + 4 + (Rng(w) * 4 - 2)));
        MoveUnit(w, u, 1.15);
        return true;
      }
    }
  }
  if (u.race === R.FISH && Rng(w) < 0.12) {
    // 鱼群结队（5-10 群游）：3×3 桶浅扫同种鱼重心靠拢                                             // L4177-4204
    const hx = Math.min(BKW - 1, Math.max(0, (u.x / 4) | 0));
    const hy = Math.min(BKH - 1, Math.max(0, (u.y / 4) | 0));
    let ax = 0, ay = 0, n = 0;
    for (let by = hy - 1; by <= hy + 1; by++) {
      for (let bx = hx - 1; bx <= hx + 1; bx++) {
        if (bx < 0 || by < 0 || bx >= BKW || by >= BKH) continue;
        for (const o of w.buckets[by * BKW + bx]) {
          if (o === u || o.dead || o.race !== R.FISH) continue;
          const dx2 = o.x - u.x, dy2 = o.y - u.y;
          if (dx2 * dx2 + dy2 * dy2 > 36) continue;
          ax += o.x; ay += o.y; n++;
        }
      }
    }
    if (n >= 2) {
      const gx2 = ax / n, gy2 = ay / n;
      const ci = idx(Math.max(0, Math.min(W - 1, MathFloor(gx2))), Math.max(0, Math.min(H - 1, MathFloor(gy2))));
      if (isWater(w.terrain[ci])) {
        u.tx = Math.max(1, Math.min(W - 2, gx2 + (Rng(w) - 0.5) * 2));
        u.ty = Math.max(1, Math.min(H - 2, gy2 + (Rng(w) - 0.5) * 2));
      }
    }
  }
  const ndx = u.tx - u.x, ndy = u.ty - u.y;
  if ((u.caravan ?? 0) === 0 && (ndx * ndx + ndy * ndy < 0.25 || Rng(w) < 0.02)) {
    const r = u.race === R.SHEEP ? 2.5 : u.race === R.DRAGON ? 9 : 5;
    let wx = u.x + (Rng(w) * 2 - 1) * r;
    let wy = u.y + (Rng(w) * 2 - 1) * r;
    if (def.predator && !def.undead && (u.food ?? 99) < 55) {
      // 饥饿捕食者的逐草而行：顺着植被走就能找到猎场（跨地域觅食）                              // L4221-4229
      for (let k = 0; k < 3; k++) {
        const gx = u.x + (Rng(w) * 2 - 1) * 14;
        const gy = u.y + (Rng(w) * 2 - 1) * 14;
        const gj = idx(Math.max(0, Math.min(W - 1, MathFloor(gx))), Math.max(0, Math.min(H - 1, MathFloor(gy))));
        const tt = w.terrain[gj];
        if ((tt === T.GRASS || tt === T.FOREST) && w.building[gj] === 0) { wx = gx; wy = gy; break; }
      }
    }
    if (u.race === R.CRAB) {
      // 蟹：滩涂限定 —— 游荡目标须为水域或邻水沙滩（4 次重选仍不合法则原地停留）            // L4230-4240
      let ok = false;
      for (let k = 0; k < 4 && !ok; k++) {
        const cx2 = Math.max(0, Math.min(W - 1, MathFloor(wx)));
        const cy2 = Math.max(0, Math.min(H - 1, MathFloor(wy)));
        const cj = cy2 * W + cx2;
        const ct = w.terrain[cj];
        if (isWater(ct)) ok = true;
        else if (ct === T.SAND) {
          ok = (cx2 > 0 && isWater(w.terrain[cj - 1])) || (cx2 < W - 1 && isWater(w.terrain[cj + 1]))
            || (cy2 > 0 && isWater(w.terrain[cj - W])) || (cy2 < H - 1 && isWater(w.terrain[cj + W]));
        }
        if (!ok) { wx = u.x + (Rng(w) * 2 - 1) * r; wy = u.y + (Rng(w) * 2 - 1) * r; }
      }
      if (!ok) { wx = u.x; wy = u.y; }
    }
    else if (def.aquatic) {
      // 纯水生：游荡目标必须为水域（4 次重选 miss → findWaterNear(14) 或原地）              // L4241-4256
      let ok = false;
      for (let k = 0; k < 4 && !ok; k++) {
        const cx2 = Math.max(0, Math.min(W - 1, MathFloor(wx)));
        const cy2 = Math.max(0, Math.min(H - 1, MathFloor(wy)));
        if (isWater(w.terrain[cy2 * W + cx2])) ok = true;
        else { wx = u.x + (Rng(w) * 2 - 1) * r; wy = u.y + (Rng(w) * 2 - 1) * r; }
      }
      if (!ok) {
        const near = isWater(w.terrain[idx(MathFloor(u.x), MathFloor(u.y))]) ? null : FindWaterNear(w, u.x, u.y, 14);
        if (near) { wx = near.x; wy = near.y; } else { wx = u.x; wy = u.y; }
      }
    }
    u.tx = Math.max(1, Math.min(W - 2, wx));
    u.ty = Math.max(1, Math.min(H - 2, wy));
  }
  MoveUnit(w, u, 1);
  return false;
}
// updateUnitPostJS（engine L4262-4334；拾取本体/繁衍 spawn 链 GUARD）
function UpdateUnitPostJS(w, u) {
  const def = defOf(u.race);
  if (w.items.length > 0 && (def.isCiv || u.race === R.BANDIT || (def.predator && !def.undead))) {
    TryPickup(w, u);                                                                     // L4265-4267
  }
  if (w.laws.reproduction && def.repro > 0 && !(def.aquatic && !def.beach && (u.beachT ?? 0) > 0) && Rng(w) < def.repro) {
    // 增益链（L4277-4287）：人口令/科技繁衍/爱之甘霖/基因/恐慌/繁衍倾向/自然季节/战争/植被/捕食者丰猎/热参数
    const boost = ((def.isCiv && u.civ >= 0 && activeDirective(w, u.civ, 'populate')) ? 1.8 : 1)
      * (def.isCiv && u.civ >= 0 ? techModsRepro(w, u.civ) * (1 + ideaModsRepro(w, u.civ)) : 1)
      * (u.fert ? 2.5 : 1)
      * (u.gene ? u.gene.r : 1)
      * ((u.panic ?? 0) >= 0.5 ? 0.3 : 1)
      * (def.isCiv ? 0.85 + def.growth * 0.3 : 1)
      * reproMul(w)
      * (def.isCiv && u.civ >= 0 && CivAtWar(w, u.civ) ? 0.55 : 1)
      * (!def.isCiv && !def.predator ? 0.75 + Math.min(0.75, w.grassTiles / 16000) : 1)
      * (def.predator ? 1.6 + Math.min(1.4, Math.max(0, (u.food ?? 0) - 40) / 85) : 1)
      * 1; // ep('pop.reproMul') 默认 1
    if ((!def.predator || (u.food ?? 0) > 40) && Rng(w) < boost) {
      if (def.isCiv) {
        const civ = w.civs[u.civ];
        if (civ && civ.alive && civ.pop < PopCapOf(w, civ) + 6 && w.units.length < 4096) {
          const cg = ChildGene(w, u);                                                    // L4293-4303
          const traitKey = TryEmergentTrait(w, u, cg);
          const fam = u.fam ?? (Rng(w) < 0.25 ? NewFamily(w, u.race, u).id : undefined);
          SpawnUnit(w, u.race, u.x + Rng(w) - 0.5, u.y + Rng(w) - 0.5,
            { civ: u.civ, silent: true, gene: cg, trait: traitKey ?? undefined,
              fam, fgn: fam !== undefined ? (u.fgn ?? 1) + 1 : undefined });
          Fx(w, 'heart', u.x, u.y - 1, 40);
        }
      } else {
        const cap = WildCapOf(w, u.race);                                                // L4305-4319
        const same = w.wildCount.get(u.race) ?? 0;
        if (same < cap) {
          const cg = ChildGene(w, u);
          const traitKey = TryEmergentTrait(w, u, cg);
          const fam = u.fam ?? (Rng(w) < 0.25 ? NewFamily(w, u.race, u).id : undefined);
          SpawnUnit(w, u.race, u.x + Rng(w) - 0.5, u.y + Rng(w) - 0.5,
            { silent: true, gene: cg, trait: traitKey ?? undefined,
              fam, fgn: fam !== undefined ? (u.fgn ?? 1) + 1 : undefined });
          Fx(w, 'heart', u.x, u.y - 1, 40);
        }
      }
    }
  }
}
// ---------------- M-U3h 第五批转写（tail 索敌/鱼群/漫游 + post 拾取/繁衍 + moveUnit 四分支 + maybeBoardForWar） ----------------
// isHerbivoreRace（engine L2120-2128）：静态八种 + dynRaces 递归母族
function IsHerbivoreRace(w, race) {
  if (race === R.SHEEP || race === R.DEER || race === R.PENGUIN || race === R.CAMEL) return true;
  if (race === R.CHICKEN || race === R.PIG || race === R.RABBIT || race === R.FISH) return true;
  const d = w.dynRaces ? w.dynRaces.get(race) : null;
  if (!d) return false;
  if (d.eco === 'herb') return true;
  if (d.eco) return false;
  return IsHerbivoreRace(w, d.parent);
}
// childGene（engine L11037-11057）：母代 ± 变异 + 辐射高压锅 + 环境选择压力
function ChildGene(w, parent) {
  const g = parent.gene ?? { s: 1, d: 1, h: 1, r: 1 };
  const gx = Math.max(0, Math.min(W - 1, MathFloor(parent.x)));
  const gy = Math.max(0, Math.min(H - 1, MathFloor(parent.y)));
  const radBoost = w.radiate[idx(gx, gy)] > 0 ? 2.6 : 1;
  const mut = (v) => Math.max(0.5, Math.min(2, v * (1 + (Rng(w) - 0.5) * 0.08 * radBoost)));  // ep('evo.mutationRate') 默认 0.08
  const gene = { s: mut(g.s), d: mut(g.d), h: mut(g.h), r: mut(g.r) };
  const t = w.terrain[idx(gx, gy)];
  if (t === T.SNOW || t === T.ICE) gene.h = Math.min(2, gene.h * (1 + Rng(w) * 0.05));
  else if (t === T.SAND) gene.s = Math.min(2, gene.s * (1 + Rng(w) * 0.05));
  else if (t === T.FOREST) gene.d = Math.min(2, gene.d * (1 + Rng(w) * 0.05));
  else if (t === T.GRASS) gene.r = Math.min(2, gene.r * (1 + Rng(w) * 0.04));
  return gene;
}
// tryEmergentTrait（engine L8854-8866）：繁衍链涌现特质门
function TryEmergentTrait(w, parent, cg) {
  const extreme = cg.d >= 1.5 || cg.h >= 1.5 || cg.s >= 1.5;
  if (!extreme || w.dynTraits.size >= 24 || Rng(w) > 0.06) return null;
  const t = InventTrait(w, cg, w.traitSeq);
  t.key = `dt${w.traitSeq++}`;
  w.dynTraits.set(t.key, t);
  TRAITS_ALL[t.key] = t;
  RecordEvo(w, 'trait', t.name, null, '#ff5fd2', `${t.desc} —— 源自「${statOf(parent.race).name ?? '?'}」种群 ${MathFloor(w.yearF)} 年的极端基因个体`, t.desc, { race: parent.race });
  AddEvent(w, 'emerge', `演化奇迹——「${statOf(parent.race).name ?? '?'}」种群诞生了前所未见的个体，携带着新特质「${t.name}」（${t.desc}）`, { colorHex: '#ff5fd2', x: parent.x, y: parent.y });
  return t.key;
}
// rollTrait（engine L1467-1470）：TRAITS keys 插入序随机抽
function RollTrait(w) {
  const keys = Object.keys(TRAITS_ALL);
  return keys[MathFloor(Rng(w) * keys.length)];
}
// tryPickup（engine L5225-5279）：拾肉回充 / 换装升级先卸旧（ITEM_DEFS 消费切片：场景只触 meat/sword3）
const ITEM_DEFS_CUT = { sword3: { key: 'sword3', name: '黄金圣剑', slot: 'wep', rank: 3, rarity: 3, dmg: 18, hp: 0, speedMul: 0 } };
const SLOT_FIELD_CUT = { wep: 'wep', arm: 'arm', hlm: 'hlm', shd: 'shd', bts: 'bts', rng: 'rng', amu: 'amu' };
const RARITY_NAMES = ['普通', '精良', '稀有', '史诗', '传说'];
function getGear(u, field) { return field === 'wep' ? (typeof u.wep === 'string' ? u.wep : null)
  : field === 'arm' ? (typeof u.armS === 'string' ? u.armS : null)
  : field === 'hlm' ? (typeof u.hlmS === 'string' ? u.hlmS : null)
  : (u[`${field}S`] ?? null); }
function setGear(u, field, key) {
  if (field === 'wep') u.wep = key;
  else if (field === 'arm') u.armS = key;
  else if (field === 'hlm') u.hlmS = key;
  else u[`${field}S`] = key;
}
function TryPickup(w, u) {
  const defR = defOf(u.race);
  const eater = defR.isCiv || u.race === R.BANDIT || (defR.predator && !defR.undead);
  for (let i = w.items.length - 1; i >= 0; i--) {
    const it = w.items[i];
    if (Math.abs(it.x - u.x) > 0.9 || Math.abs(it.y - u.y) > 0.9) continue;
    if (it.kind === 'meat') {
      if (!eater || (u.grab ?? 0) > 0) continue;
      if (defR.predator && !defR.undead) {
        u.food = Math.min(160, (u.food ?? 0) + 45);
        if (w.fxPrefs.dmgNumbers) Fx(w, 'dmg', u.x, u.y - 1, 22, { text: '饱' });
      } else if (u.civ >= 0 && w.civs[u.civ]) {
        const civ = w.civs[u.civ];
        civ.gold = (civ.gold ?? 0) + 2;
        Fx(w, 'coin', u.x, u.y - 1, 20);
      }
      w.items.splice(i, 1);
      Fx(w, 'heart', u.x, u.y - 0.8, 18);
      continue;
    }
    if (!defR.isCiv && u.race !== R.BANDIT) continue;
    const def = ITEM_DEFS_CUT[it.kind];
    if (!def) continue;
    const field = SLOT_FIELD_CUT[def.slot];
    const cur = getGear(u, field);
    const curRank = cur && ITEM_DEFS_CUT[cur] ? ITEM_DEFS_CUT[cur].rank : -1;
    if (curRank >= def.rank) continue;
    if (cur && ITEM_DEFS_CUT[cur]) {
      const old = ITEM_DEFS_CUT[cur];
      if (old.dmg) u.dmg = Math.max(1, u.dmg - old.dmg);
      if (old.hp) u.maxHp = Math.max(1, u.maxHp - old.hp);
      if (old.speedMul) u.speed /= old.speedMul;
    }
    setGear(u, field, it.kind);
    if (def.dmg) u.dmg += def.dmg;
    if (def.hp) { u.maxHp += def.hp; u.hp = Math.min(u.maxHp, u.hp + def.hp); }
    if (def.speedMul) u.speed *= def.speedMul;
    w.items.splice(i, 1);
    Fx(w, 'spawn', u.x, u.y, 26);
    if (w.fxPrefs.dmgNumbers) Fx(w, 'dmg', u.x, u.y - 1.2, 34, { text: def.name });
    if (def.rarity >= 3) Toast(w, `${u.name} 拾取了${RARITY_NAMES[def.rarity]}${def.name}`, 'good');
    if (def.rarity === 4) {
      const owner = u.civ >= 0 ? (w.civs[u.civ]?.name ?? '流浪') : statOf(u.race).name;
      AddEvent(w, 'loot', `${u.name}（${owner}）获得了传说之物「${def.name}」`, { x: u.x, y: u.y });
    }
  }
}
// maybeBoardForWar（engine L5740-5791）：战时隔海登船跨海远征（编队 board 闭包 + 直线跨水 45% 采样）
function MaybeBoardForWar(w, u) {
  if (u.boat || !defOf(u.race).isCiv) return false;
  const job = u.job ?? 0;
  if (job !== 2 && job !== 3) return false;
  if (u.civ < 0 || !CivAtWar(w, u.civ)) return false;
  const dx = u.tx - u.x, dy = u.ty - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 8) return false;
  let water = 0;
  const samples = Math.max(1, MathFloor(d));
  for (let s = 1; s <= samples; s++) {
    const xx = MathFloor(u.x + (dx * s) / d);
    const yy = MathFloor(u.y + (dy * s) / d);
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    if (isWater(w.terrain[idx(xx, yy)])) water++;
  }
  if (water / samples < 0.45) return false;
  const cur = w.terrain[idx(MathFloor(u.x), MathFloor(u.y))];
  if (isWater(cur)) return false;
  const dock = FindWaterNear(w, u.x, u.y, 4);
  if (!dock) return false;
  const sharedTtl = 700 + MathFloor(Rng(w) * 300);
  const board = (o) => {
    o.boat = 1;
    o.boatTTL = sharedTtl;
    o.x = dock.x + (Rng(w) - 0.5) * 1.2;
    o.y = dock.y + (Rng(w) - 0.5) * 1.2;
    o.lx = o.x; o.ly = o.y;
    Fx(w, 'spawn', o.x, o.y, 24);
  };
  board(u);
  let fleet = 1;
  for (const o of w.units) {
    if (fleet >= 4) break;
    if (o === u || o.dead || o.boat || o.civ !== u.civ) continue;
    const ojob = o.job ?? 0;
    if (ojob !== 2 && ojob !== 3) continue;
    if (Math.hypot(o.x - u.x, o.y - u.y) > 6) continue;
    board(o);
    fleet++;
  }
  if (fleet >= 3) {
    AddEvent(w, 'war', `「${w.civs[u.civ]?.name ?? ''}」的一支舰队（${fleet} 艘战船）跨海远征`, { colorHex: w.civs[u.civ]?.colorHex, x: u.x, y: u.y });
  }
  return true;
}
// findWaterNear（engine L5546-5571）：环扫水域（3×3 邻域 ≥5 水面）
function FindWaterNear(w, x, y, r) {
  const cx = MathFloor(x), cy = MathFloor(y);
  for (let ring = 1; ring <= r; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        if (!isWater(w.terrain[idx(xx, yy)])) continue;
        let waterN = 0;
        for (let ny = -1; ny <= 1; ny++) for (let nx = -1; nx <= 1; nx++) {
          if (nx === 0 && ny === 0) continue;
          if (isWater(w.terrain[idx(xx + nx, yy + ny)])) waterN++;
        }
        if (waterN >= 5) return { x: xx + 0.5, y: yy + 0.5 };
      }
    }
  }
  return null;
}
// rebuildBuckets（engine L3081-3104）：空间桶全量重建（桶内序 = units push 序）
const BKW = Math.ceil(W / 4), BKH = Math.ceil(H / 4);
function RebuildBuckets(w) {
  const buckets = w.buckets || (w.buckets = Array.from({ length: BKW * BKH }, () => []));
  for (const b of buckets) b.length = 0;
  for (const u of w.units) {
    let cx = (u.x / 4) | 0, cy = (u.y / 4) | 0;
    if (cx > BKW - 1) cx = BKW - 1; else if (cx < 0) cx = 0;
    if (cy > BKH - 1) cy = BKH - 1; else if (cy < 0) cy = 0;
    buckets[cy * BKW + cx].push(u);
  }
}
// activeDirective（engine L7717-7722）
function activeDirective(w, civId, kind) {
  for (const d of w.directives) if (d.status === 'active' && d.civ === civId && d.kind === kind) return d;
  return undefined;
}
// civAtWar（engine L2017-2020）：任一他国 alive 且 AtWar（rel<-30 基，与 C# CivAtWar 同构）
function CivAtWar(w, civId) {
  for (const o of w.civs) {
    if (o && o.alive && o.id !== civId && AtWarT(w, civId, o.id)) return true;
  }
  return false;
}
// popCapOf（engine L2004-2014）：houseTier + 建筑承载（场景无 civBuildCounts → houses × (HOUSE_CAP+bonus)）
function PopCapOf(w, civ) {
  let bonus = 0;
  if (civ && civ.alive) {
    const t = civ.techs ?? [];
    if (t.includes('masonry')) bonus = 1;
    if (t.includes('fortification')) bonus = 2;
    if (t.includes('gothic')) bonus = 3;
  }
  return civ.houses * (4 + bonus); // HOUSE_CAP = 4（场景无建筑 counts）
}
// techModsOf/ideaModsOf 的 repro 消费切片（场景 techs/ideas 空 → NEUTRAL 1 / 0）
function techModsRepro(w, civId) { void w; void civId; return 1; }
function ideaModsRepro(w, civId) { void w; void civId; return 0; }
// wbResume（engine L3215-3302 case1/2/4/5；case3 第二批余域）
function WbResume(w, u, kind, d) {
  switch (kind) {
    case 1: {
      // 船单位：Rust 侧 hurt-- 未标脏 → 直接 JS 接管，updateUnit 执行唯一一次 hurt--（Task 50 注释语义）
      UpdateUnit(w, u);
      break;
    }
    case 2: {
      // 涌现特质门已过（Rust 已消耗 0.06 掷骰）：发明特质 + 完成繁衍 spawn
      Case2(w, u, d);
      break;
    }
    case 3: {
      // 建筑摧毁级联（单位 cd/atk 已置）：onBuildingDestroyed + 战争 AI 分支剩余 + 尾段
      Case3(w, u, d);
      break;
    }
    case 4: {
      CaravanArrive(w, u);
      if (UpdateUnitTailJS(w, u)) break;
      UpdateUnitPostJS(w, u);
      break;
    }
    case 5: {
      FoundSettlement(w, u, d[0] | 0);
      break;
    }
    default:
      throw new Error(`wbResume case ${kind} 未转写（第四批余域）`);
  }
}

// ---------------- dump（与 gen 同协议） ----------------
const hex = (v) => {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
};
function rle(arr) {
  const out = [];
  let cur = arr[0], n = 1;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] === cur && n < 65535) n++;
    else { out.push(cur, n); cur = arr[i]; n = 1; }
  }
  out.push(cur, n);
  return out;
}
function dumpAll(w, u, fx) {
  return {
    rngA: w.rngA >>> 0,
    eventSeq: w.eventSeq,
    unit: { id: u.id, race: u.race, civ: u.civ, x: hex(u.x), y: hex(u.y), tx: hex(u.tx), ty: hex(u.ty),
      speed: hex(u.speed), flip: u.flip ?? 0, job: u.job ?? 0, caravan: u.caravan ?? 0,
      boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0, dead: u.dead ?? 0, hurt: u.hurt ?? 0,
      age: hex(u.age ?? 0), hp: hex(u.hp ?? 10), maxHp: hex(u.maxHp ?? 10),
      dmg: hex(u.dmg ?? 1), food: u.food ?? null, wep: u.wep ?? null,
      grab: u.grab ?? null, thrT: u.thrT ?? null,
      thrVx: u.thrVx === undefined || u.thrVx === null ? null : hex(u.thrVx),
      thrVy: u.thrVy === undefined || u.thrVy === null ? null : hex(u.thrVy),
      thrX0: u.thrX0 === undefined || u.thrX0 === null ? null : hex(u.thrX0),
      thrY0: u.thrY0 === undefined || u.thrY0 === null ? null : hex(u.thrY0) },
    civs: (fx.fixture.civs ?? []).map((c) => {
      const cv = w.civs[c.id];
      return { id: cv.id, name: cv.name, race: cv.race, pop: cv.pop, houses: cv.houses, capital: cv.capital,
        alive: cv.alive, gold: cv.gold ?? null, knowledge: cv.knowledge ?? null, colorHex: cv.colorHex, tiles: [...cv.tiles] };
    }),
    rel: [...w.rel.entries()],
    raceRel: [...w.raceRel.entries()],
    effects: w.effects.map((e) => ({ kind: e.kind, x: hex(e.x), y: hex(e.y), x0: hex(e.x0), y0: hex(e.y0), r: hex(e.r), age: hex(e.age), ttl: hex(e.ttl), seed: e.seed, dir: hex(e.dir), text: e.text ?? null })),
    events: w.worldEvents.map((ev) => ({ id: ev.id, year: ev.year, kind: ev.kind, text: ev.text, colorHex: ev.colorHex ?? null,
      x: ev.x === undefined ? null : hex(ev.x), y: ev.y === undefined ? null : hex(ev.y) })),
    toasts: w.toasts,
    buildings: w.buildings.map((b) => ({ i: b.i, kind: b.kind, civ: b.civ, bHp: w.bHp.get(b.i) ?? null })),
    buildingRle: rle(w.building),
    ownerRle: rle(Array.from(w.owner)),
    roadRle: rle(w.road),
    shake: hex(w.shake),
    // M-U3h 第三批 case2 POST 态（与 gen 同协议）
    child: dumpChild(w, w.unitSeq0),
    traits: [...w.dynTraits.values()].map(dumpTraitM),
    evoNodes: w.evoNodes.map((n) => ({ id: n.id, kind: n.kind, name: n.name, parent: n.parent ?? null,
      year: n.year, colorHex: n.colorHex, detail: n.detail, stat: n.stat ?? null })),
    families: [...w.families.values()].map((f) => ({ id: f.id, name: f.name, race: f.race, founded: f.founded,
      founder: f.founder, members: f.members, heroes: f.heroes, kills: f.kills, peak: f.peak, milestones: f.milestones })),
    wildCountPost: [...w.wildCount.entries()],
    unitSeq: w.unitSeq, familySeq: w.familySeq, traitSeq: w.traitSeq, evoSeq: w.evoSeq,
    radiateRle: rle(w.radiate),
    // M-U3h 第四批 case3 POST 态（warData 记分增量/攻城纪事节流阀终值）
    wars: [...w.warData.values()].map((wd) => ({ key: wd.key, a: wd.a, b: wd.b, scoreA: wd.scoreA, scoreB: wd.scoreB,
      casA: wd.casA, casB: wd.casB, exA: wd.exA, exB: wd.exB, razedA: wd.razedA, razedB: wd.razedB, occA: wd.occA, occB: wd.occB })),
    lastSiegeEventTick: w.lastSiegeEventTick,
    // M-U3h 第五批 POST 态（itemsPost 余量/fleet 编队全单位 —— 与 gen 同协议）
    itemsPost: w.items.map((it) => ({ id: it.id, kind: it.kind, x: hex(it.x), y: hex(it.y) })),
    fleet: null,
  };
}
// case2 新生儿 dump（gen dumpChild 同协议；按 id≥unitSeq0 定位——cap 门不产子为 null）
function dumpChild(w, unitSeq0) {
  const u = w.units.find((uu) => uu.id >= unitSeq0) ?? null;
  if (!u) return null;
  return {
    id: u.id, race: u.race, civ: u.civ ?? -1,
    x: hex(u.x), y: hex(u.y), lx: hex(u.lx), ly: hex(u.ly), rx: hex(u.rx), ry: hex(u.ry),
    tx: hex(u.tx), ty: hex(u.ty),
    hp: hex(u.hp), maxHp: hex(u.maxHp), dmg: hex(u.dmg), speed: hex(u.speed),
    tDmg: u.tDmg === undefined ? null : hex(u.tDmg), tHp: u.tHp === undefined ? null : hex(u.tHp),
    age: hex(u.age), maxAge: hex(u.maxAge), kills: u.kills, cd: u.cd,
    trait: u.trait ?? null,
    gene: u.gene ? { s: hex(u.gene.s), d: hex(u.gene.d), h: hex(u.gene.h), r: hex(u.gene.r) } : null,
    job: u.job ?? null, infected: u.infected ? 1 : 0, flip: u.flip ? 1 : 0,
    name: u.name, hurt: u.hurt ?? 0, breath: u.breath, parity: u.parity, dead: u.dead ? 1 : 0,
    fam: u.fam ?? null, fgn: u.fgn ?? null,
  };
}
function dumpTraitM(t) {
  return { key: t.key, name: t.name, desc: t.desc, good: t.good === true ? true : undefined,
    dmgMul: t.dmgMul === undefined ? null : hex(t.dmgMul), hpMul: t.hpMul === undefined ? null : hex(t.hpMul),
    speedMul: t.speedMul === undefined ? null : hex(t.speedMul), regen: t.regen === undefined ? null : hex(t.regen) };
}

// ---------------- 主流程 ----------------
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
let pass = 0, fail = 0;
for (const fx of golden.scenarios) {
  // TRAITS 模块级全局表重置（gen 清理段同款：E 系 InventEmergentTrait 的 dt* 条目跨场景污染 RollTrait keys 域）
  for (const tk of Object.keys(TRAITS_ALL)) if (tk.startsWith('dt')) delete TRAITS_ALL[tk];
  const w = mkWorld(fx, golden);
  const u = w.unitById.get(fx.unitId);
  // M-U3h 第五批 fn 分派直调（与 gen/NUnit 同协议：tail 前显式 rebuild 模拟 tick 头）
  let tailRet = null;
  if (fx.fn === 'tail') { RebuildBuckets(w); tailRet = UpdateUnitTailJS(w, u) === true; }
  else if (fx.fn === 'post') UpdateUnitPostJS(w, u);
  else if (fx.fn === 'move') MoveUnit(w, u, fx.mul ?? 1);
  else if (fx.fn === 'board') tailRet = MaybeBoardForWar(w, u) === true;
  else WbResume(w, u, fx.kind, Float64Array.from(fx.data ?? []));
  const got = dumpAll(w, u, fx);
  if (fx.fn === 'board') got.fleet = w.units.map((uu) => ({ id: uu.id, race: uu.race, civ: uu.civ, x: hex(uu.x), y: hex(uu.y),
    tx: hex(uu.tx), ty: hex(uu.ty), speed: hex(uu.speed), flip: uu.flip ?? 0, job: uu.job ?? 0, caravan: uu.caravan ?? 0,
    boat: uu.boat ?? 0, boatTTL: uu.boatTTL ?? 0, dead: uu.dead ?? 0, hurt: uu.hurt ?? 0,
    age: hex(uu.age ?? 0), hp: hex(uu.hp ?? 10), maxHp: hex(uu.maxHp ?? 10),
    dmg: hex(uu.dmg ?? 1), food: uu.food ?? null, wep: uu.wep ?? null,
    grab: uu.grab ?? null, thrT: uu.thrT ?? null,
    thrVx: uu.thrVx === undefined || uu.thrVx === null ? null : hex(uu.thrVx),
    thrVy: uu.thrVy === undefined || uu.thrVy === null ? null : hex(uu.thrVy),
    thrX0: uu.thrX0 === undefined || uu.thrX0 === null ? null : hex(uu.thrX0),
    thrY0: uu.thrY0 === undefined || uu.thrY0 === null ? null : hex(uu.thrY0) }));
  if (fx.fn === 'tail' || fx.fn === 'board') got.tailRet = tailRet;
  const want = fx;
  const diffs = [];
  const cmp = (path, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${path}: got ${JSON.stringify(a)?.slice(0, 120)} want ${JSON.stringify(b)?.slice(0, 120)}`); };
  cmp('rngA', got.rngA, want.rngA);
  cmp('eventSeq', got.eventSeq, want.eventSeq);
  if (want.fn === 'tail' || want.fn === 'board') cmp('tailRet', got.tailRet, want.tailRet === true);
  for (const k of Object.keys(got.unit)) cmp(`unit.${k}`, got.unit[k], want.unit[k]);
  const wantCivsArr = want.civs ?? [];
  if (got.civs.length !== wantCivsArr.length) diffs.push('civs len');
  for (let i = 0; i < got.civs.length; i++) for (const k of Object.keys(got.civs[i])) cmp(`civs[${i}].${k}`, got.civs[i][k], wantCivsArr[i][k]);
  cmp('rel', got.rel, want.rel);
  cmp('raceRel', got.raceRel, want.raceRel);
  cmp('effects', got.effects, want.effects);
  cmp('events', got.events, want.events);
  cmp('toasts', got.toasts, want.toasts);
  cmp('buildings', got.buildings, want.buildings);
  cmp('buildingRle', got.buildingRle, want.buildingRle);
  cmp('ownerRle', got.ownerRle, want.ownerRle);
  cmp('roadRle', got.roadRle, want.roadRle);
  cmp('shake', got.shake, want.shake);
  // case2 POST 态对账
  for (const k of Object.keys(got.child ?? {})) cmp(`child.${k}`, got.child ? got.child[k] : null, want.child ? want.child[k] : null);
  if ((got.child === null) !== (want.child === null)) diffs.push('child null 性不一致');
  cmp('traits', got.traits, want.traits);
  cmp('evoNodes', got.evoNodes, want.evoNodes);
  cmp('families', got.families, want.families);
  cmp('wildCountPost', got.wildCountPost, want.wildCountPost);
  cmp('unitSeq', got.unitSeq, want.unitSeq);
  cmp('familySeq', got.familySeq, want.familySeq);
  cmp('traitSeq', got.traitSeq, want.traitSeq);
  cmp('evoSeq', got.evoSeq, want.evoSeq);
  cmp('radiateRle', got.radiateRle, want.radiateRle);
  // case3 POST 态对账（第四批）
  cmp('wars', got.wars, want.wars);
  cmp('lastSiegeEventTick', got.lastSiegeEventTick, want.lastSiegeEventTick);
  if (diffs.length === 0) { pass++; console.log(`PASS ${fx.name}`); }
  else { fail++; console.log(`FAIL ${fx.name}\n  ${diffs.join('\n  ')}`); }
}
console.log(`\nbail-transcript: ${pass}/${pass + fail} ALL ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);
