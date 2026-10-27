// civtick-transcript.mjs — M-U3b WbCivSim.cs 的 JS 镜像（独立转写，防循环论证）
// 语义源 = unity/pixel-world-box/Assets/Scripts/Wb/{WbWorld,WbCivSim}.cs（C# 机械翻译产物）
// 对账权威 = golden/units_civtick.json（engine.ts 直跑生成）
// 验证闭环：C# 翻译逻辑 → JS 镜像转写 → 黄金回放逐位对账（黄金与镜像两条独立链路）
// 跑法：node scripts/unity-migration/civtick-transcript.mjs（零依赖，读 golden JSON）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- WbWorld（C# 同构 → JS） ----------------
const W = 256, H = 160, HOUSE_CAP = 4, WORLD_EVENTS_CAP = 80, FX_CAP = 620;
const T_DEEP = 0, T_WATER = 1, T_SAND = 2, T_GRASS = 3, T_FOREST = 4, T_HILL = 5,
      T_MOUNTAIN = 6, T_SNOW = 7, T_LAVA = 8, T_BURNT = 9, T_ICE = 10, T_SWAMP = 11;

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const isWater = (t) => t === T_DEEP || t === T_WATER;
const isLand = (t) => t !== T_DEEP && t !== T_WATER && t !== T_LAVA;
const buildable = (t) => t === T_GRASS || t === T_SAND || t === T_HILL || t === T_SNOW || t === T_BURNT || t === T_FOREST;

const FX_MINOR = new Set(['dmg', 'hit', 'smoke', 'spawn', 'heart', 'skull', 'arrow', 'coin', 'blood', 'dust']);

// RACE_REL_BASE（WbWorld.BuildRaceRelBase 同表）
const RACE_REL_BASE = { '1-3': -45, '2-3': -30, '0-1': 25, '0-2': 20, '2-20': -25, '1-20': -20, '3-20': 15, '3-19': -10, '1-2': 10 };

// BUILDING_DEFS（WbCivSim.BUILDING_DEFS 同表；-1 哨兵 → 读取点 ?? 0）
const BUILDING_DEFS = [
  { key: 'none', hp: 0, popCap: -1, cost: -1, needKnowledge: -1 },
  { key: 'house', hp: 70, popCap: 4, cost: 0, needKnowledge: -1 },
  { key: 'capital', hp: 240, popCap: 6, cost: 0, needKnowledge: -1 },
  { key: 'tower', hp: 120, popCap: -1, cost: 8, needKnowledge: -1 },
  { key: 'farm', hp: 40, popCap: 2, cost: 5, needKnowledge: -1 },
  { key: 'barracks', hp: 150, popCap: -1, cost: 12, needKnowledge: -1 },
  { key: 'castle', hp: 340, popCap: -1, cost: 34, needKnowledge: 18 },
  { key: 'port', hp: 90, popCap: -1, cost: 16, needKnowledge: 8 },
  { key: 'library', hp: 110, popCap: -1, cost: 18, needKnowledge: -1 },
  { key: 'market', hp: 100, popCap: -1, cost: 12, needKnowledge: -1 },
  { key: 'temple', hp: 140, popCap: -1, cost: 22, needKnowledge: 10 },
  { key: 'wall', hp: 200, popCap: -1, cost: 2, needKnowledge: -1 },
];
const BK = { HOUSE: 1, CAPITAL: 2, TOWER: 3, FARM: 4, BARRACKS: 5, CASTLE: 6, PORT: 7, LIBRARY: 8, MARKET: 9, TEMPLE: 10, WALL: 11 };
const defCost = (k) => (BUILDING_DEFS[k].cost < 0 ? 0 : BUILDING_DEFS[k].cost);
const defPopCap = (k) => (BUILDING_DEFS[k].popCap < 0 ? 0 : BUILDING_DEFS[k].popCap);
const defNeed = (k) => (BUILDING_DEFS[k].needKnowledge < 0 ? 0 : BUILDING_DEFS[k].needKnowledge);

function newWorld() {
  return {
    terrain: new Uint8Array(W * H),
    owner: new Int16Array(W * H).fill(-1),
    building: new Uint8Array(W * H),
    road: new Uint8Array(W * H),
    occCiv: new Int8Array(W * H).fill(-1),
    occStr: new Uint8Array(W * H),
    civs: [], units: [], unitById: new Map(),
    buildings: [], bIdx: new Map(), bHp: new Map(), civBuildCounts: new Map(), marketIdx: new Map(),
    occSet: new Set(), damagedSet: new Set(), dirty: new Set(), propsDirty: new Set(),
    rel: new Map(), tension: new Map(), met: new Set(),
    effects: [], worldEvents: [], toasts: [],
    eventSeq: 0, toastSeq: 0,
    alliances: [], directives: [],
    laws: { wars: true, cityGrowth: true, rebels: true },
    rngA: 0, tickCount: 0, yearF: 0, statCivsFallen: 0,
  };
}
// C# WbWorld.Rng 逐行转写（unchecked uint → JS |0 + Math.imul 位级一致）
function Rng(w) {
  w.rngA = (w.rngA + 0x6d2b79f5) | 0;
  let t = Math.imul(w.rngA ^ (w.rngA >>> 15), 1 | w.rngA);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function Fx(w, kind, x, y, ttl, optR, optCiv, optColorHex) {
  if (w.effects.length >= FX_CAP) {
    let victim = -1;
    for (let i = 0; i < w.effects.length; i++) if (FX_MINOR.has(w.effects[i].kind)) { victim = i; break; }
    if (victim >= 0) w.effects.splice(victim, 1);
    else if (FX_MINOR.has(kind)) return null;
  }
  const e = {
    kind, x, y, x0: x, y0: y,
    r: optR ?? 1, age: 0, ttl,
    seed: Math.floor(Rng(w) * 65536),
    dir: Rng(w) * Math.PI * 2,
    civ: optCiv, colorHex: optColorHex,
  };
  w.effects.push(e);
  return e;
}
function AddEvent(w, kind, text, colorHex, x, y) {
  const ev = { id: w.eventSeq++, year: Math.floor(w.yearF), kind, text, colorHex: colorHex ?? null, x: x ?? null, y: y ?? null };
  w.worldEvents.unshift(ev);
  if (w.worldEvents.length > WORLD_EVENTS_CAP) w.worldEvents.length = WORLD_EVENTS_CAP;
}
function Toast(w, text, tone) { w.toasts.push({ id: w.toastSeq++, text, tone, op: null }); }
function MarkDirty(w, i) {
  w.dirty.add(i);
  const x = i % W, y = (i / W) | 0;
  if (x > 0) w.dirty.add(i - 1);
  if (x < W - 1) w.dirty.add(i + 1);
  if (y > 0) w.dirty.add(i - W);
  if (y < H - 1) w.dirty.add(i + W);
}
function RaceRelOf(w, a, b) {
  if (a === b) return 45;
  const key = pairKey(a, b);
  return RACE_REL_BASE[key] ?? 0; // raceRel Map 恒空（M-U3b 无写入点）
}
const civAt = (w, id) => (id >= 0 && id < w.civs.length ? w.civs[id] : null);

// ---------------- TechMods（C# ModsOfTechs 转写） ----------------
function ModsOfTechs(keys) {
  const m = { dmg: 1, hp: 1, bhp: 1, gold: 1, know: 1, repro: 1, col: 1, tax: 1, cult: 1, repair: 1, stab: 0, morale: 0, armyMax: 0, archer: 1, plague: 1, range: 0, arty: 0, bomber: 0, nukeCap: 0 };
  if (!keys) return m;
  for (const k of keys) {
    switch (k) {
      case 'fire': m.repro += 0.08; break;
      case 'stone': m.archer += 0.0; m.dmg += 0.10; break;
      case 'shelter': m.bhp += 0.15; break;
      case 'clan': m.stab += 8; break;
      case 'song': m.cult += 0.5; break;
      case 'gather': m.tax += 0.2; break;
      case 'raft': m.col -= 0.10; break;
      case 'pottery': m.tax += 0.15; break;
      case 'irrigation': m.repro += 0.08; break;
      case 'bronze': m.dmg += 0.15; break;
      case 'writing': m.know += 0.3; break;
      case 'masonry': m.bhp += 0.25; m.repair += 0.5; break;
      case 'currency': m.gold += 0.4; break;
      case 'sail': m.col -= 0.2; break;
      case 'law': m.stab += 12; break;
      case 'crossbow': m.archer += 0.2; break;
      case 'plow': m.repro += 0.12; break;
      case 'iron': m.dmg += 0.18; m.hp += 0.10; break;
      case 'guild': m.gold += 0.25; break;
      case 'theology': m.cult += 0.8; break;
      case 'fortification': m.bhp += 0.30; break;
      case 'compass': m.col -= 0.25; break;
      case 'feudal': m.tax += 0.3; m.stab -= 4; break;
      case 'tactics': m.morale += 8; break;
      case 'machinery': m.repair += 0.6; break;
      case 'crop4': m.repro += 0.15; break;
      default: break;
    }
  }
  return m;
}
const techModCache = new Map();
function TechModsOf(w, civId) {
  if (civId < 0) return ModsOfTechs(null);
  if (techModCache.has(civId)) return techModCache.get(civId);
  const c = civAt(w, civId);
  const mods = c ? ModsOfTechs(c.techs) : ModsOfTechs(null);
  techModCache.set(civId, mods);
  return mods;
}

// ---------------- WbCivSim 方法族（C# 逐行转写） ----------------
function CivFuseScan(w) {
  if (w.tickCount % 300 !== 5) return;
  const now = w.tickCount;
  for (const al of w.alliances) {
    if (al.cohesion < 70 || al.members.length < 2) continue;
    if (now - al.formedTick < 1440) continue;
    const alive = al.members.map((m) => civAt(w, m)).filter((c) => c && c.alive && c.pop >= 20);
    if (alive.length < 2) continue;
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        if (AtWar(w, a.id, b.id)) continue;
        if (Rng(w) > 0.1) continue;
        if (MergeCivs(w, a, b, 'natural')) return;
      }
    }
  }
}
function CrownVacantTick(w) { /* C# 桩：黄金场景在位王夹具 → 蓝本 continue 零 rng */ }
function WallTick(w) { /* C# 桩：fortification 科技门 → 黄金恒不触发 */ }

function CivsTick(w) {
  CivFuseScan(w);
  if (w.tickCount % 40 === 0) CrownVacantTick(w);
  if (w.tickCount % 20 === 0) WallTick(w);
  for (let ci = 0; ci < w.civs.length; ci++) {
    const civ = w.civs[ci];
    if (civ == null) continue;
    if (!civ.alive) continue;
    if (civ.pop <= 0) {
      if (civ.popZeroTick == null) civ.popZeroTick = w.tickCount;
      else if (w.tickCount - civ.popZeroTick > 400) { EliminateCiv(w, civ); continue; }
    } else civ.popZeroTick = undefined;
    if (civ.pop > 0 && civ.frontier.length === 0 && w.tickCount % 600 === 0) {
      let owned = 0;
      for (const i of civ.tiles) if (w.owner[i] === civ.id) owned++;
      if (owned === 0) {
        let member = null;
        for (const u of w.units) { if (u.dead === 0 && u.civ === civ.id) { member = u; break; } }
        if (member) {
          SeedTerritory(w, civ, Math.floor(member.x), Math.floor(member.y));
          if (civ.tiles.length > 0) {
            Toast(w, `「${civ.name}」的流亡者重新扎根了`, 'good');
            AddEvent(w, 'settle', `「${civ.name}」的流亡者在新的土地上重新扎根`, civ.colorHex, member.x, member.y);
          }
        }
      }
    }
    if (civ.mobilizeUntil != null && w.tickCount < civ.mobilizeUntil && w.tickCount % 25 === 0) {
      let n = 0;
      for (const u of w.units) {
        if (n >= 2) break;
        if (u.dead !== 0 || u.civ !== civ.id || u.boat !== 0) continue;
        const job = u.job ?? 0;
        if (job === 0 || job === 1 || job === 5) { SetJob(w, u, 2); n++; }
      }
    }
    const expandBoost = ActiveDirective(w, civ.id, 'expand') != null ? 3 : 1;
    if (w.laws.cityGrowth && civ.pop > 0) for (let k = 0; k < 2 * expandBoost; k++) {
      if (civ.frontier.length === 0) break;
      const fi = Math.floor(Rng(w) * civ.frontier.length);
      const i = civ.frontier[fi];
      civ.frontier[fi] = civ.frontier[civ.frontier.length - 1];
      civ.frontier.pop();
      if (w.owner[i] !== -1) continue;
      if (!isLand(w.terrain[i]) || w.terrain[i] === T_MOUNTAIN) continue;
      ClaimTile(w, i, civ.id);
    }
    if (w.tickCount % 120 === 0 && civ.pop > 0) {
      const cap = PopCapOf(w, civ);
      if (civ.pop > cap - 2) {
        const kind = PickBuildingKind(w, civ);
        const cost = defCost(kind);
        if ((civ.gold ?? 0) >= cost) {
          if (TryBuildBuilding(w, civ, kind)) civ.gold = (civ.gold ?? 0) - cost;
        } else {
          TryBuildBuilding(w, civ, BK.HOUSE);
        }
      }
    }
    if (w.tickCount % 300 === 0 && civ.houses > 8 && Rng(w) < 0.5) {
      let atWar = false;
      for (const other of w.civs) {
        if (other && other.alive && other.id !== civ.id && AtWar(w, civ.id, other.id)) { atWar = true; break; }
      }
      if (atWar) TryBuildBuilding(w, civ, BK.TOWER);
    }
    if (civ.pop >= 10 && civ.houses >= 2 && w.tickCount >= (civ.colonizeCd ?? 0) && Rng(w) < 0.06) {
      TryLaunchColonyShip(w, civ);
    }
    if (w.laws.rebels && w.tickCount % 300 === 0 && civ.pop > 30 && civ.tiles.length > 220) {
      const stab = civ.stability ?? 70;
      const rebelChance = stab < 30 ? 0.16 : stab < 50 ? 0.08 : stab < 70 ? 0.04 : 0.015;
      if (Rng(w) < rebelChance) { SplitKingdom(w, civ); continue; }
    }
    // promote capital
    if (civ.capital < 0 && civ.houses > 0) {
      let b = null;
      for (const bb of w.buildings) { if (bb.civ === civ.id && bb.kind === 1) { b = bb; break; } }
      if (b) {
        w.bIdx.delete(b.i);
        w.building[b.i] = 0;
        const civ2 = civAt(w, b.civ);
        if (civ2) civ2.houses--;
        const bi = w.buildings.indexOf(b);
        const last = w.buildings.pop();
        if (bi < w.buildings.length) { w.buildings[bi] = last; w.bIdx.set(last.i, bi); }
        BuildBuilding(w, b.i, 2, civ.id);
        civ.capital = b.i;
        AddEvent(w, 'capital', `「${civ.name}」迁都于新都，重整山河`, civ.colorHex, b.x, b.y);
      }
    }
    if (civ.pop <= 0 && civ.houses <= 0) EliminateCiv(w, civ);
  }
}

function ClaimTile(w, i, civId) {
  const civ = civAt(w, civId);
  if (!civ || !civ.alive) return;
  w.owner[i] = civId;
  if (w.occCiv[i] !== -1) { w.occCiv[i] = -1; w.occStr[i] = 0; w.occSet.delete(i); }
  civ.tiles.push(i);
  MarkDirty(w, i);
  const x = i % W, y = (i / W) | 0;
  const push = (j) => { if (w.owner[j] === -1 && isLand(w.terrain[j]) && w.terrain[j] !== T_MOUNTAIN) civ.frontier.push(j); };
  if (x > 0) push(i - 1);
  if (x < W - 1) push(i + 1);
  if (y > 0) push(i - W);
  if (y < H - 1) push(i + W);
  const meet = (j) => {
    const o = w.owner[j];
    if (o >= 0 && o !== civId) {
      DiplomacyMeet(w, civId, o);
      if (Rng(w) < 0.5) {
        const k = pairKey(civId, o);
        w.tension.set(k, Math.min(80, (w.tension.get(k) ?? 0) + 2));
      }
    }
  };
  if (x > 0) meet(i - 1);
  if (x < W - 1) meet(i + 1);
  if (y > 0) meet(i - W);
  if (y < H - 1) meet(i + W);
}

function SeedTerritory(w, civ, cx, cy) {
  if (civ.tiles.length > 0) civ.tiles = civ.tiles.filter((i) => w.owner[i] === civ.id);
  const claimAt = (ax, ay) => {
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = ax + dx, yy = ay + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (w.owner[i] === -1 && isLand(w.terrain[i]) && w.terrain[i] !== T_MOUNTAIN) { ClaimTile(w, i, civ.id); n++; }
    }
    return n;
  };
  if (claimAt(cx, cy) > 0) return;
  for (let r = 3; r <= 14; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
      const i = yy * W + xx;
      if (w.owner[i] === -1 && isLand(w.terrain[i]) && w.terrain[i] !== T_MOUNTAIN) {
        if (claimAt(xx, yy) > 0) return;
      }
    }
  }
}

function PopCapOf(w, civ) {
  const bonus = HouseTierOf(w, civ);
  const counts = w.civBuildCounts.get(civ.id);
  if (!counts) return civ.houses * (HOUSE_CAP + bonus);
  let cap = 0;
  for (let k = 1; k < BUILDING_DEFS.length; k++) {
    const pc = defPopCap(k);
    if (pc > 0 && counts[k]) cap += (pc + (k === BK.HOUSE ? bonus : 0)) * counts[k];
  }
  return cap;
}
function HouseTierOf(w, civ) {
  if (!civ || !civ.alive) return 0;
  const t = civ.techs ?? [];
  let tier = 0;
  if (t.includes('masonry')) tier = 1;
  if (t.includes('fortification')) tier = 2;
  if (t.includes('gothic')) tier = 3;
  return tier;
}

function PickBuildingKind(w, civ) {
  const counts = w.civBuildCounts.get(civ.id);
  const c = (k) => (counts ? counts[k] ?? 0 : 0);
  const houses = Math.max(1, civ.houses);
  const gold = civ.gold ?? 0;
  const know = civ.knowledge ?? 0;
  const war = CivAtWar(w, civ.id);
  const pop = Math.max(1, civ.pop);
  const buildDir = ActiveDirective(w, civ.id, 'build') != null;
  const templeDir = ActiveDirective(w, civ.id, 'temple') != null;
  const cands = [];
  cands.push({ kind: BK.HOUSE, w: buildDir ? 30 : 10 });
  if (c(BK.FARM) * 3 < pop / 3 + 2) cands.push({ kind: BK.FARM, w: 9 });
  if (war && c(BK.BARRACKS) < 1 + houses / 10) cands.push({ kind: BK.BARRACKS, w: 8 });
  if (war && c(BK.TOWER) < 1 + houses / 12) cands.push({ kind: BK.TOWER, w: 5 });
  if (c(BK.MARKET) < 1 + houses / 12) cands.push({ kind: BK.MARKET, w: 6 });
  if (c(BK.LIBRARY) < 1 + houses / 20) cands.push({ kind: BK.LIBRARY, w: 4 });
  if (know >= defNeed(BK.PORT) && c(BK.PORT) < 1 + houses / 25) cands.push({ kind: BK.PORT, w: 4 });
  if (know >= defNeed(BK.TEMPLE) && c(BK.TEMPLE) < 1 + houses / 15) cands.push({ kind: BK.TEMPLE, w: templeDir ? 18 : 3 });
  if (know >= defNeed(BK.CASTLE) && c(BK.CASTLE) < 1 + houses / 25) cands.push({ kind: BK.CASTLE, w: 6 });
  const afford = cands.filter((x) => gold >= defCost(x.kind));
  const pool = afford.length > 0 ? afford : [{ kind: BK.HOUSE, w: 1 }];
  let total = 0;
  for (const x of pool) total += x.w;
  let r = Rng(w) * total;
  for (const x of pool) { r -= x.w; if (r <= 0) return x.kind; }
  return BK.HOUSE;
}

function TryBuildBuilding(w, civ, kind) {
  const needWater = kind === BK.PORT;
  const spacing = kind === BK.FARM ? 2 : 3;
  for (let attempt = 0; attempt < 24; attempt++) {
    if (civ.tiles.length === 0) return false;
    const i = civ.tiles[Math.floor(Rng(w) * civ.tiles.length)];
    if (w.owner[i] !== civ.id) continue;
    if (!buildable(w.terrain[i]) || w.building[i] > 0) continue;
    const x = i % W, y = (i / W) | 0;
    if (needWater) {
      let nearSea = false;
      for (let dy = -2; dy <= 2 && !nearSea; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (isWater(w.terrain[yy * W + xx])) { nearSea = true; break; }
      }
      if (!nearSea) continue;
    }
    let ok = true;
    for (const b of w.buildings) {
      if (b.civ !== civ.id) continue;
      if (Math.abs(b.x - x) < spacing && Math.abs(b.y - y) < spacing) { ok = false; break; }
    }
    if (!ok) continue;
    BuildBuilding(w, i, kind, civ.id);
    Fx(w, 'smoke', x, y, 26, 1);
    if (kind === BK.CASTLE || kind === BK.TEMPLE || kind === BK.LIBRARY || kind === BK.PORT) {
      AddEvent(w, 'build', `「${civ.name}」建成${BUILDING_DEFS[kind].key}，国力日盛`, civ.colorHex, x, y);
    }
    return true;
  }
  return false;
}

function BuildBuilding(w, i, kind, civId) {
  if (w.building[i] > 0) return;
  const b = { i, x: i % W, y: (i / W) | 0, kind, civ: civId };
  w.buildings.push(b);
  w.bIdx.set(i, w.buildings.length - 1);
  w.building[i] = kind;
  w.bHp.set(i, Math.round(BUILDING_DEFS[kind].hp * TechModsOf(w, civId).bhp));
  w.damagedSet.delete(i);
  const civ = civAt(w, civId);
  if (civ && kind !== BK.WALL) civ.houses++;
  if (kind !== BK.WALL) ConnectRoad(w, i, civId);
}

function DestroyBuilding(w, i) {
  const bi = w.bIdx.get(i);
  if (bi === undefined) return;
  const b = w.buildings[bi];
  const civ = civAt(w, b.civ);
  if (civ) {
    civ.houses--;
    if (b.kind === BK.CAPITAL) civ.capital = -1;
  }
  const last = w.buildings.pop();
  if (bi < w.buildings.length) { w.buildings[bi] = last; w.bIdx.set(last.i, bi); }
  w.bIdx.delete(i);
  w.building[i] = 0;
  w.bHp.delete(i);
  w.damagedSet.delete(i);
  Fx(w, 'smoke', b.x, b.y, 36, 1.5);
}

function ConnectRoad(w, i, civId) {
  const x = i % W, y = (i / W) | 0;
  let best = null, bestD = Infinity;
  for (const o of w.buildings) {
    if (o.civ !== civId || o.i === i) continue;
    if (o.kind !== BK.CAPITAL && w.road[o.i] === 0) continue;
    const d = Math.abs(o.x - x) + Math.abs(o.y - y);
    if (d > 0 && d < bestD) { bestD = d; best = o.i; }
  }
  if (best == null) return;
  const path = FindPath(w, i, best, 800);
  if (!path) return;
  let laid = 0;
  for (const p of path) {
    if (w.road[p] === 0) { w.road[p] = 1; w.dirty.add(p); w.propsDirty.add(p); laid++; }
  }
  if (laid > 3 && Rng(w) < 0.1) {
    const civ = civAt(w, civId);
    if (civ) AddEvent(w, 'road', `「${civ.name}」修筑道路，疆域脉络渐成`, civ.colorHex, x, y);
  }
}

function FindPath(w, from, to, budget = 4000) {
  if (from === to) return [from];
  const tx = to % W, ty = (to / W) | 0;
  const g = new Map([[from, 0]]);
  const prev = new Map([[from, -1]]);
  const hf = [Math.abs(tx - (from % W)) + Math.abs(ty - ((from / W) | 0))];
  const hn = [from];
  const push = (f, n) => {
    hf.push(f); hn.push(n);
    let i = hf.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hf[p] <= hf[i]) break;
      [hf[p], hf[i]] = [hf[i], hf[p]];
      [hn[p], hn[i]] = [hn[i], hn[p]];
      i = p;
    }
  };
  let expanded = 0;
  while (hn.length > 0 && expanded < budget) {
    const cur = hn[0];
    const lf = hf.pop(), ln = hn.pop();
    if (hf.length > 0) {
      hf[0] = lf; hn[0] = ln;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < hf.length && hf[l] < hf[m]) m = l;
        if (r < hf.length && hf[r] < hf[m]) m = r;
        if (m === i) break;
        [hf[m], hf[i]] = [hf[i], hf[m]];
        [hn[m], hn[i]] = [hn[i], hn[m]];
        i = m;
      }
    }
    if (cur === to) {
      const path = [];
      let p = cur;
      while (p !== -1) { path.push(p); p = prev.get(p); }
      return path.reverse();
    }
    expanded++;
    const cg = g.get(cur);
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const t = w.terrain[j];
      if (t === T_DEEP || t === T_WATER || t === T_MOUNTAIN || t === T_LAVA) continue;
      const ng = cg + 1;
      const og = g.get(j);
      if (og !== undefined && og <= ng) continue;
      g.set(j, ng);
      prev.set(j, cur);
      push(ng + Math.abs(tx - xx) + Math.abs(ty - yy), j);
    }
  }
  return null;
}

function EliminateCiv(w, civ) {
  let conqueror = null;
  for (const o of w.civs) {
    if (o && o.alive && o.id !== civ.id && AtWar(w, o.id, civ.id)) { conqueror = o; break; }
  }
  civ.alive = false;
  w.statCivsFallen++;
  ClearFrontOf(w, civ.id);
  const alFall = AllianceOfCiv(w, civ.id);
  if (alFall) {
    alFall.cohesion = Math.max(0, alFall.cohesion - 18);
    LeaveAlliance(w, civ.id, 'fallen');
    AddEvent(w, 'alliance', `「${civ.name}」的覆灭震动了盟邦——「${alFall.members.length >= 2 ? alFall.name : '其盟友'}」为亡者降下半旗`, alFall.colorHex);
  }
  // worldWar/armies/warData：M-U3b 恒空/idle（C# 桩同构）
  for (const d of w.directives) {
    if (d.status !== 'active') continue;
    if (d.civ === civ.id) FinishDirective(w, d, 'failed', `「${civ.name}」覆灭，宏图化为泡影`);
    else if ((d.kind === 'annihilate' || d.kind === 'conquer') && d.target === civ.id) FinishDirective(w, d, 'success', `目标「${civ.name}」已被抹去`);
  }
  for (const i of civ.tiles) {
    if (w.owner[i] === civ.id) { w.owner[i] = -1; MarkDirty(w, i); }
  }
  civ.tiles = [];
  civ.frontier = [];
  for (const b of [...w.buildings]) {
    if (b.civ === civ.id) DestroyBuilding(w, b.i);
  }
  for (const key of [...w.rel.keys()]) {
    const dash = key.indexOf('-');
    const x = +key.slice(0, dash), y = +key.slice(dash + 1);
    if (x === civ.id || y === civ.id) w.rel.delete(key);
  }
  for (const key of [...w.met]) {
    const dash = key.indexOf('-');
    const x = +key.slice(0, dash), y = +key.slice(dash + 1);
    if (x === civ.id || y === civ.id) w.met.delete(key);
  }
  Toast(w, `「${civ.name}」覆灭了`, 'danger');
  if (conqueror) AddEvent(w, 'fall', `「${civ.name}」（${RACES_NAME[civ.race]}）被「${conqueror.name}」彻底征服，旗帜倒下，国土并入征服者的版图`, conqueror.colorHex);
  else AddEvent(w, 'fall', `「${civ.name}」（${RACES_NAME[civ.race]}）的旗帜倒下了，国土化为无主之地`, civ.colorHex);
}

const RACES_NAME = ['人类', '精灵', '矮人', '兽人', '蜥蜴人', '哥布林'];

function AtWar(w, a, b) {
  const v = w.rel.get(pairKey(a, b));
  return v !== undefined && v < -20;
}
function CivAtWar(w, civId) {
  for (const o of w.civs) {
    if (o && o.alive && o.id !== civId && AtWar(w, civId, o.id)) return true;
  }
  return false;
}
function DiplomacyMeet(w, a, b) {
  const key = pairKey(a, b);
  if (w.met.has(key)) return;
  w.met.add(key);
  const ca = civAt(w, a), cb = civAt(w, b);
  if (!ca || !cb) return;
  const RACES_DIPLO = [0.65, 0.45, 0.4, 0.15, 0.35, 0.3];
  const da = ca.race < RACES_DIPLO.length ? RACES_DIPLO[ca.race] : 0.5;
  const db = cb.race < RACES_DIPLO.length ? RACES_DIPLO[cb.race] : 0.5;
  const raceDiplo = (da + db) / 2;
  const warChance = Math.max(0.08, Math.min(0.8,
    0.2 + ((ca.militarism ?? 30) + (cb.militarism ?? 30)) / 400.0
    + ((ca.gov === 4 || cb.gov === 4) ? 0.1 : 0)
    - ((ca.gov === 3 || cb.gov === 3) ? 0.12 : 0)
    - (raceDiplo - 0.5) * 0.3));
  if (w.laws.wars && Rng(w) < warChance) {
    // TODO(M-U3c): pickCasus+declareWar（黄金集 CVT11/15 全部 rng>=warChance 不宣战，位等价成立）
    return;
  } else {
    const rr = RaceRelOf(w, ca.race, cb.race);
    w.rel.set(key, Math.max(-10, Math.min(45, 20 + rr / 3)));
  }
}
function RebuildCivBuildCounts(w) {
  w.civBuildCounts.clear();
  w.marketIdx.clear();
  for (const b of w.buildings) {
    let arr = w.civBuildCounts.get(b.civ);
    if (!arr) { arr = new Array(BUILDING_DEFS.length).fill(0); w.civBuildCounts.set(b.civ, arr); }
    arr[b.kind]++;
    if (b.kind === BK.MARKET && !w.marketIdx.has(b.civ)) w.marketIdx.set(b.civ, b.i);
  }
}
function ActiveDirective(w, civId, kind) {
  for (const d of w.directives) {
    if (d.status === 'active' && d.civ === civId && d.kind === kind) return d;
  }
  return undefined;
}
function ClearFrontOf(w, civId) {
  for (const i of [...w.occSet]) {
    if (w.occCiv[i] === civId) { w.occCiv[i] = -1; w.occStr[i] = 0; w.occSet.delete(i); }
  }
}
function TryLaunchColonyShip(w, civ) {
  const colMul = TechModsOf(w, civ.id).col;
  civ.colonizeCd = w.tickCount + Math.max(220, Math.round((600 + Math.floor(Rng(w) * 600)) * colMul));
  let cand = 0;
  for (const u of w.units) if (u.dead === 0 && u.civ === civ.id && u.boat === 0) cand++;
  if (cand < 6) return false;
  return false; // TODO(M-U3c): findWaterNear/findColonyTarget（黄金 cand<6 不可达）
}
function SplitKingdom(w, civ) { /* C# 桩同构 */ }
function MergeCivs(w, a, b, reason) { return false; }
function SetJob(w, u, job) { /* C# 桩同构：黄金 mobilizeUntil=null 不可达 */ }
function LeaveAlliance(w, civId, reason) { }
function FinishDirective(w, d, status, msg) { d.status = status; }
function AllianceOfCiv(w, civId) {
  for (const al of w.alliances) if (al.members.includes(civId)) return al;
  return null;
}

// ---------------- 回放 + 对账 ----------------
const f64hex = (v) => {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
};

function replayScenario(sc) {
  const w = newWorld();
  w.rngA = sc.rngA0 >>> 0;
  w.eventSeq = sc.eventSeq0;
  w.toastSeq = sc.toastSeq0;
  // terrain RLE
  const rle = sc.terrainRle;
  let pos = 0;
  for (let k = 0; k < rle.length; k += 2) {
    const v = rle[k], run = rle[k + 1];
    for (let j = 0; j < run; j++) w.terrain[pos++] = v;
  }
  if (pos !== W * H) throw new Error(`${sc.name} RLE 覆盖不足 ${pos}`);
  // laws
  w.laws.wars = sc.laws.wars;
  w.laws.cityGrowth = sc.laws.cityGrowth;
  w.laws.rebels = sc.laws.rebels;
  // civs
  for (const c of sc.fixture.civs ?? []) {
    const civ = {
      id: c.id, name: c.name ?? `C${c.id}`, race: c.race ?? 0,
      pop: c.pop ?? 0, houses: c.houses ?? 0, capital: c.capital ?? -1,
      alive: c.alive ?? true, gold: c.gold ?? 0, knowledge: c.knowledge ?? 0,
      colonizeCd: c.colonizeCd ?? 0, popZeroTick: c.popZeroTick, armyCd: c.armyCd ?? 0,
      mobilizeUntil: c.mobilizeUntil, mergedInto: c.mergedInto,
      techs: c.techs ?? [], research: null, researchP: 0,
      gov: c.gov ?? 0, govYear: 0, stability: c.stability ?? 70, culture: 0,
      militarism: c.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
      kingId: c.kingId ?? undefined, kingName: c.kingName ?? 'K', banner: c.banner ?? 'B',
      colorHex: c.colorHex ?? '#c83c3c', color: c.color ?? [200, 60, 60],
      tiles: c.tiles ? [...c.tiles] : [], frontier: c.frontier ? [...c.frontier] : [],
    };
    w.civs.push(civ);
    w.civs[civ.id] = civ;
    for (const i of civ.tiles) w.owner[i] = civ.id;
  }
  // units
  for (const u of sc.fixture.units ?? []) putUnit(w, u);
  // 补王（gen 同构）
  let kingSeq = 1000;
  for (const c of w.civs) {
    if (!c || !c.alive || c.pop <= 0) continue;
    if (c.kingId != null && c.kingId !== -1) continue;
    const wid = kingSeq++;
    const t0 = c.tiles.length > 0 ? c.tiles[0] : 0;
    putUnit(w, { id: wid, civ: c.id, x: t0 % 256 + 0.5, y: ((t0 / 256) | 0) + 0.5, king: 1 });
    c.kingId = wid;
  }
  // rel/tension/met/buildings
  for (const [a, b, v] of sc.fixture.rel ?? []) w.rel.set(pairKey(a, b), v);
  for (const [a, b, v] of sc.fixture.tension ?? []) w.tension.set(pairKey(a, b), v);
  for (const mk of sc.fixture.met ?? []) w.met.add(mk);
  for (const [i, kind, civId] of sc.fixture.buildings ?? []) {
    const b = { i, x: i % W, y: (i / W) | 0, kind, civ: civId };
    w.buildings.push(b);
    w.bIdx.set(i, w.buildings.length - 1);
    w.building[i] = kind;
    w.bHp.set(i, BUILDING_DEFS[kind].hp);
    const civ = civAt(w, civId);
    if (civ && kind !== BK.WALL) civ.houses++;
  }
  // drive + trace
  w.tickCount = sc.startTick ?? 0;
  const traces = [];
  for (let t = 0; t < sc.traces.length; t++) {
    if (w.tickCount % 5 === 0) RebuildCivBuildCounts(w);
    CivsTick(w);
    w.tickCount++;
    traces.push(traceOf(w, t));
  }
  return traces;
}

function putUnit(w, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.x, ty: o.y,
    hp: 10, maxHp: 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0, cd: 0, trait: 0,
    job: o.job ?? 0, king: o.king ?? 0, infected: 0, flip: 0, name: `u${o.id}`,
    hurt: 0, breath: 0, parity: 0, dead: o.dead ?? 0, boat: o.boat ?? 0, boatTTL: 0, caravan: 0,
    wep: 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0, army: null, gene: null,
    food: 0, fam: 0, fgn: 0, gIds: [], gVal: [],
  };
  w.units.push(u);
  w.unitById.set(u.id, u);
}

function diffArr(prev, cur) {
  const out = [];
  const n = Math.max(prev?.length ?? 0, cur.length);
  for (let i = 0; i < n; i++) if (prev?.[i] !== cur[i]) out.push([i, cur[i]]);
  return out;
}
function mapEntries(m) { return m ? [...m.entries()] : []; }

function traceOf(w, t) {
  return {
    tick: t,
    rngA: w.rngA >>> 0,
    tickCount: w.tickCount,
    civs: w.civs.filter(Boolean).map((c) => ({
      id: c.id, name: c.name, race: c.race, pop: c.pop, houses: c.houses, capital: c.capital,
      alive: c.alive, gold: c.gold ?? null, knowledge: c.knowledge ?? null,
      colonizeCd: c.colonizeCd ?? null, popZeroTick: c.popZeroTick === undefined ? null : c.popZeroTick,
      armyCd: c.armyCd ?? null, mobilizeUntil: c.mobilizeUntil === undefined ? null : c.mobilizeUntil,
      mergedInto: c.mergedInto === undefined ? null : c.mergedInto,
      techs: c.techs ?? null, research: c.research ?? null, researchP: c.researchP ?? null,
      gov: c.gov ?? null, stability: c.stability ?? null, culture: c.culture ?? null, militarism: c.militarism ?? null,
      kingId: c.kingId === undefined ? null : c.kingId, kingName: c.kingName, banner: c.banner,
      colorHex: c.colorHex, color: c.color,
      tiles: [...c.tiles], frontier: [...c.frontier],
    })),
    buildings: w.buildings.map((b) => ({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: b.civ })),
    bHp: mapEntries(w.bHp),
    civBuildCounts: mapEntries(w.civBuildCounts).map(([k, v]) => [k, [...v]]),
    marketIdx: mapEntries(w.marketIdx),
    ownerDiff: diffArr(w.__prev?.owner, [...w.owner]),
    buildingDiff: diffArr(w.__prev?.building, [...w.building]),
    roadDiff: diffArr(w.__prev?.road, [...w.road]),
    occCivDiff: diffArr(w.__prev?.occCiv, [...w.occCiv]),
    dirty: [...w.dirty].sort((a, b) => a - b),
    propsDirty: [...w.propsDirty].sort((a, b) => a - b),
    effects: w.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), x0: f64hex(e.x0), y0: f64hex(e.y0), r: f64hex(e.r), age: f64hex(e.age), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir) })),
    newEvents: w.worldEvents.slice(0, w.__evCount ?? 0).map((e) => ({ id: e.id, year: e.year, kind: e.kind, text: e.text, colorHex: e.colorHex, x: e.x === null ? null : f64hex(e.x), y: e.y === null ? null : f64hex(e.y) })),
    toasts: w.toasts.splice(0, w.toasts.length),
    tension: mapEntries(w.tension),
    rel: mapEntries(w.rel),
    met: [...w.met],
    statCivsFallen: w.statCivsFallen,
  };
}
// trace 快照辅助：__prev/__evCount 注入（回放驱动层管理）
function snapWorld(w) {
  return { owner: [...w.owner], building: [...w.building], road: [...w.road], occCiv: [...w.occCiv] };
}

// ---------------- 主流程 ----------------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/units_civtick.json'), 'utf8'));
  let pass = 0, fail = 0;
  for (const sc of golden.scenarios) {
    // 回放驱动（traceOf 需要逐 tick 前快照/事件基线 —— 内嵌驱动循环）
    const w = newWorld();
    w.rngA = sc.rngA0 >>> 0;
    w.eventSeq = sc.eventSeq0;
    w.toastSeq = sc.toastSeq0;
    let pos = 0;
    for (let k = 0; k < sc.terrainRle.length; k += 2) {
      const run = sc.terrainRle[k + 1];
      for (let j = 0; j < run; j++) w.terrain[pos++] = sc.terrainRle[k];
    }
    w.laws.wars = sc.laws.wars;
    w.laws.cityGrowth = sc.laws.cityGrowth;
    w.laws.rebels = sc.laws.rebels;
    for (const c of sc.fixture.civs ?? []) {
      const civ = {
        id: c.id, name: c.name ?? `C${c.id}`, race: c.race ?? 0,
        pop: c.pop ?? 0, houses: c.houses ?? 0, capital: c.capital ?? -1,
        alive: c.alive ?? true, gold: c.gold ?? 0, knowledge: c.knowledge ?? 0,
        colonizeCd: c.colonizeCd ?? 0, popZeroTick: c.popZeroTick, armyCd: c.armyCd ?? 0,
        mobilizeUntil: c.mobilizeUntil, mergedInto: c.mergedInto,
        techs: c.techs ?? [], research: null, researchP: 0,
        gov: c.gov ?? 0, govYear: 0, stability: c.stability ?? 70, culture: 0,
        militarism: c.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
        kingId: c.kingId ?? undefined, kingName: c.kingName ?? 'K', banner: c.banner ?? 'B',
        colorHex: c.colorHex ?? '#c83c3c', color: c.color ?? [200, 60, 60],
        tiles: c.tiles ? [...c.tiles] : [], frontier: c.frontier ? [...c.frontier] : [],
      };
      w.civs.push(civ);
      w.civs[civ.id] = civ;
      for (const i of civ.tiles) w.owner[i] = civ.id;
    }
    for (const u of sc.fixture.units ?? []) putUnit(w, u);
    let kingSeq = 1000;
    for (const c of w.civs) {
      if (!c || !c.alive || c.pop <= 0) continue;
      if (c.kingId != null && c.kingId !== -1) continue;
      const wid = kingSeq++;
      const t0 = c.tiles.length > 0 ? c.tiles[0] : 0;
      putUnit(w, { id: wid, civ: c.id, x: t0 % 256 + 0.5, y: ((t0 / 256) | 0) + 0.5, king: 1 });
      c.kingId = wid;
    }
    for (const [a, b, v] of sc.fixture.rel ?? []) w.rel.set(pairKey(a, b), v);
    for (const [a, b, v] of sc.fixture.tension ?? []) w.tension.set(pairKey(a, b), v);
    for (const mk of sc.fixture.met ?? []) w.met.add(mk);
    for (const [i, kind, civId] of sc.fixture.buildings ?? []) {
      const b = { i, x: i % W, y: (i / W) | 0, kind, civ: civId };
      w.buildings.push(b);
      w.bIdx.set(i, w.buildings.length - 1);
      w.building[i] = kind;
      w.bHp.set(i, BUILDING_DEFS[kind].hp);
      const civ = civAt(w, civId);
      if (civ && kind !== BK.WALL) civ.houses++;
    }
    w.tickCount = sc.startTick ?? 0;
    let prev = snapWorld(w);
    let evBase = w.eventSeq; // newEvents 基线（gen __lastEventId 同构）
    let scOk = true;
    for (let t = 0; t < sc.traces.length; t++) {
      if (w.tickCount % 5 === 0) RebuildCivBuildCounts(w);
      CivsTick(w);
      w.tickCount++;
      const tr = traceOf(w, t);
      tr.ownerDiff = diffArr(prev.owner, [...w.owner]);
      tr.buildingDiff = diffArr(prev.building, [...w.building]);
      tr.roadDiff = diffArr(prev.road, [...w.road]);
      tr.occCivDiff = diffArr(prev.occCiv, [...w.occCiv]);
      tr.newEvents = w.worldEvents.slice(0, w.worldEvents.length).filter((e) => e.id >= evBase).map((e) => ({ id: e.id, year: e.year, kind: e.kind, text: e.text, colorHex: e.colorHex, x: e.x === null ? null : f64hex(e.x), y: e.y === null ? null : f64hex(e.y) }));
      prev = snapWorld(w);
      evBase = w.eventSeq;
      const want = sc.traces[t];
      const a = JSON.stringify(normalize(tr)), b = JSON.stringify(normalize(want));
      if (a !== b) {
        scOk = false;
        fail++;
        // 首个 diff 字段定位
        const ta = normalize(tr), tb = normalize(want);
        const keys = new Set([...Object.keys(ta), ...Object.keys(tb)]);
        for (const k of keys) {
          if (JSON.stringify(ta[k]) !== JSON.stringify(tb[k])) {
            console.log(`[DIFF] ${sc.name} tick${t} field=${k}`);
            console.log('  got :', JSON.stringify(ta[k])?.slice(0, 300));
            console.log('  want:', JSON.stringify(tb[k])?.slice(0, 300));
            break;
          }
        }
        break;
      }
    }
    if (scOk) { pass++; console.log(`[PASS] ${sc.name}`); }
  }
  console.log(`[transcript] ${pass}/${golden.scenarios.length} PASS`);
  process.exit(fail ? 1 : 0);
}

function normalize(tr) {
  // 键序无关化：bHp/civBuildCounts/tension/rel 排序（Map 插入序 JS 侧天然一致——两侧都 JS Map，无需排序；保留直比）
  return tr;
}
