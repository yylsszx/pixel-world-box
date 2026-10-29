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
const R = { HUMAN: 0, ELF: 1, FISH: 26, CRAB: 33, SHEEP: 6, DRAGON: 9 };
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
const JOBS_MUL = [
  { hp: 1, dmg: 1, speed: 1, weight: 46 },
  { hp: 0.95, dmg: 0.9, speed: 1, weight: 24 },
  { hp: 1.3, dmg: 1.35, speed: 1.05, weight: 14 },
  { hp: 1.05, dmg: 1.15, speed: 1, weight: 8 },
  { hp: 1.15, dmg: 0.95, speed: 1.05, weight: 5 },
  { hp: 1, dmg: 0.9, speed: 1.2, weight: 2 },
  { hp: 1.25, dmg: 1.1, speed: 1, weight: 1 },
  { hp: 1.5, dmg: 1.5, speed: 1, weight: 0 },
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
    // M-U3h 第三批 case2 消费域（序列器/家族/涌现特质/演化图谱/辐射场）
    unitSeq: fx.unitSeq0, unitSeq0: fx.unitSeq0, familySeq: fx.familySeq0, traitSeq: fx.traitSeq0, evoSeq: fx.evoSeq0,
    families: new Map(), dynTraits: new Map(), evoNodes: [], evoIndex: new Map(),
    radiate: new Uint8Array(W * H),
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
      chill: 0, curse: 0, detour: 0, food: 0, fert: 0, panic: 0, beachT: 0, lx: null, ly: null,
      // case2 消费域：fam/fgn undefined 语义（null）+ gene 对象（{s,d,h,r} 或 null）+ name（gen mkUnit u${id} 语义）
      name: `u${u.id}`, kills: 0, cd: 0, breath: 0, parity: 0, king: 0, infected: 0,
      fam: u.fam ?? null, fgn: u.fgn ?? null,
      gene: u.gene ? { s: u.gene.s, d: u.gene.d, h: u.gene.h, r: u.gene.r } : null };
    w.units.push(un); w.unitById.set(un.id, un);
  }
  for (const [r, n] of fx.fixture.wildCount ?? []) w.wildCount.set(r, n); // case2 cap 门夹具（清理后施加同 gen 序）
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
function Fx(w, kind, x, y, ttl) {
  if (w.effects.length >= FX_CAP) {
    let victim = -1;
    for (let i = 0; i < w.effects.length; i++) if (FX_MINOR.has(w.effects[i].kind)) { victim = i; break; }
    if (victim >= 0) w.effects.splice(victim, 1);
    else if (FX_MINOR.has(kind)) return null;
  }
  const e = { kind, x, y, x0: x, y0: y, r: 1, age: 0, ttl, seed: MathFloor(Rng(w) * 65536), dir: Rng(w) * Math.PI * 2 };
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
      if (w.fxPrefs.dmgNumbers && dmg > 0) Fx(w, 'dmg', u.x, u.y - 1, 30);
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
  const trait = opts?.trait !== undefined ? (opts.trait || null) : (Rng(w) < 0.15 ? (() => { throw new Error('rollTrait 未转写（case2 场景恒传 trait）'); })() : null);
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
  if (u.civ >= 0) throw new Error('wallBlocks→atWar 分支未转写（第二批域；黄金场景无城墙）');
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
  if (def.flying) throw new Error('moveUnit flying 分支未转写（第二批域）');
  const cur = w.terrain[idx(MathFloor(u.x), MathFloor(u.y))];
  if (def.aquatic) throw new Error('moveUnit aquatic 分支未转写（第二批域）');
  if (def.sandswim) throw new Error('moveUnit sandswim 分支未转写（第二批域）');
  const swimming = cur === T.DEEP || cur === T.WATER;
  const onMountain = cur === T.MOUNTAIN;
  const wallChk = swimming ? (_x, _y) => false : (x, y) => WallBlocks(w, x, y, u);
  const passX = !wallChk(MathFloor(nx), MathFloor(u.y)) && PassTile(swimming, onMountain, w.terrain[idx(MathFloor(nx), MathFloor(u.y))]);
  const passY = !wallChk(MathFloor(u.x), MathFloor(ny)) && PassTile(swimming, onMountain, w.terrain[idx(MathFloor(u.x), MathFloor(ny))]);
  if (passX && passY) { u.x = nx; u.y = ny; }
  else if (passX) u.x = nx;
  else if (passY) u.y = ny;
  else throw new Error('moveUnit 阻断分支（maybeBoardForWar/reroute）未转写（第二批域）');
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
    throw new Error('tail 捕食者索敌分支未转写（第二批域）');
  }
  if (u.race === R.FISH && Rng(w) < 0.12) {
    throw new Error('tail 鱼群结队分支未转写（第二批域）');
  }
  const ndx = u.tx - u.x, ndy = u.ty - u.y;
  if ((u.caravan ?? 0) === 0 && (ndx * ndx + ndy * ndy < 0.25 || Rng(w) < 0.02)) {
    const r = u.race === R.SHEEP ? 2.5 : u.race === R.DRAGON ? 9 : 5;
    let wx = u.x + (Rng(w) * 2 - 1) * r;
    let wy = u.y + (Rng(w) * 2 - 1) * r;
    if (def.predator && !def.undead && (u.food ?? 99) < 55) {
      throw new Error('tail 漫游逐草分支未转写（第二批域）');
    }
    if (u.race === R.CRAB) throw new Error('tail 蟹漫游分支未转写（第二批域）');
    else if (def.aquatic) throw new Error('tail 水生漫游分支未转写（第二批域）');
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
    throw new Error('post tryPickup 本体未转写（第二批域；黄金场景 items 空）');
  }
  if (w.laws.reproduction && def.repro > 0 && !(def.aquatic && !def.beach && (u.beachT ?? 0) > 0) && Rng(w) < def.repro) {
    throw new Error('post 繁衍门意外通过（黄金场景 rngA0 受控必败）—— boost 链深域未转写（第二批）');
  }
}
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
      throw new Error(`wbResume case ${kind} 未转写（第二批余域：3 建筑摧毁）`);
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
    effects: w.effects.map((e) => ({ kind: e.kind, x: hex(e.x), y: hex(e.y), x0: hex(e.x0), y0: hex(e.y0), r: hex(e.r), age: hex(e.age), ttl: hex(e.ttl), seed: e.seed, dir: hex(e.dir) })),
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
  const w = mkWorld(fx, golden);
  const u = w.unitById.get(fx.unitId);
  WbResume(w, u, fx.kind, Float64Array.from(fx.data ?? []));
  const got = dumpAll(w, u, fx);
  const want = fx;
  const diffs = [];
  const cmp = (path, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${path}: got ${JSON.stringify(a)?.slice(0, 120)} want ${JSON.stringify(b)?.slice(0, 120)}`); };
  cmp('rngA', got.rngA, want.rngA);
  cmp('eventSeq', got.eventSeq, want.eventSeq);
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
  if (diffs.length === 0) { pass++; console.log(`PASS ${fx.name}`); }
  else { fail++; console.log(`FAIL ${fx.name}\n  ${diffs.join('\n  ')}`); }
}
console.log(`\nbail-transcript: ${pass}/${pass + fail} ALL ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);
