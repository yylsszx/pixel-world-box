#!/usr/bin/env node
// ============================================================
// bail-transcript.mjs — M-U3h 宿主接力 WbBail.cs 的 JS 独立转写（防循环论证双链）
// 蓝本 = engine.ts 原文机械转写（零引擎导入——静态表字面量，逻辑从源码逐行转写）：
//   wbResume L3215 case4/5 + caravanArrive L4770-4796 + updateUnitTailJS L4116-4260 +
//   updateUnitPostJS L4262-4334 + moveUnit L5813-5876 + wallBlocks L5804 + passTile L5800 +
//   foundSettlement L5704-5739 + buildBuilding L1756-1772 + connectRoad L1906-1929 +
//   claimTile L1719-1754 + shiftRaceRel L8054 + allianceOfCiv L8061 + fx L9781 + addEvent L13995 +
//   toast L13988 + rng L728-734 + RACE_REL_BASE types.ts L208 + RACES def 子表 types.ts L157-158
// 桩域断言：捕食者索敌/鱼群/登船/繁衍 spawn/diplomacyMeet 深链——黄金场景不可达，触达即 throw（第二批译域）
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
    yearF: 0, seasonOffset: 0, items: [], grassTiles: 0, wildCount: new Map(),
    overlayMode: 'none', overlayDirty: false, fxPrefs: { fxDensity: 1, ambience: true },
  };
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
    const un = { id: u.id, race: u.race ?? 0, civ: u.civ ?? -1, x: u.x, y: u.y, tx: u.x, ty: u.y,
      speed: u.speed ?? 1, flip: 0, job: u.job ?? 0, king: u.king ?? 0, dead: u.dead ?? 0,
      boat: u.boat ?? 0, boatTTL: 0, caravan: u.caravan ?? 0, hurt: 0,
      chill: 0, curse: 0, detour: 0, food: 0, fert: 0, panic: 0, beachT: 0, fam: 0, fgn: 0, gene: null, lx: null, ly: null };
    w.units.push(un); w.unitById.set(un.id, un);
  }
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
// wbResume（engine L3215-3302 case4/5；case1/2/3 第二批）
function WbResume(w, u, kind, d) {
  switch (kind) {
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
      throw new Error(`wbResume case ${kind} 未转写（第二批域：1 船/2 涌现/3 建筑摧毁）`);
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
      boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0, dead: u.dead ?? 0, hurt: u.hurt ?? 0 },
    civs: fx.fixture.civs.map((c) => {
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
  };
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
  if (got.civs.length !== want.civs.length) diffs.push('civs len');
  for (let i = 0; i < got.civs.length; i++) for (const k of Object.keys(got.civs[i])) cmp(`civs[${i}].${k}`, got.civs[i][k], want.civs[i][k]);
  cmp('rel', got.rel, want.rel);
  cmp('raceRel', got.raceRel, want.raceRel);
  cmp('effects', got.effects, want.effects);
  cmp('events', got.events, want.events);
  cmp('toasts', got.toasts, want.toasts);
  cmp('buildings', got.buildings, want.buildings);
  cmp('buildingRle', got.buildingRle, want.buildingRle);
  cmp('ownerRle', got.ownerRle, want.ownerRle);
  cmp('roadRle', got.roadRle, want.roadRle);
  if (diffs.length === 0) { pass++; console.log(`PASS ${fx.name}`); }
  else { fail++; console.log(`FAIL ${fx.name}\n  ${diffs.join('\n  ')}`); }
}
console.log(`\nbail-transcript: ${pass}/${pass + fail} ALL ${fail === 0 ? 'PASS' : 'FAIL'}`);
process.exit(fail === 0 ? 0 : 1);
