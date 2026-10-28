// army-transcript.mjs — M-U3g WbCivSim.cs 军团域的 JS 镜像（独立转写，防循环论证）
// 语义源 = unity/pixel-world-box/Assets/Scripts/Wb/{WbWorld,WbCivSim,WbNames}.cs（C# 机械翻译产物）
// 对账权威 = golden/units_army.json（engine.ts 直跑生成）
// 验证闭环：C# 翻译逻辑 → JS 镜像转写 → 黄金回放逐位对账（黄金与镜像两条独立链路）
// 跑法：node scripts/unity-migration/army-transcript.mjs（零依赖，读 golden JSON）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/units_army.json'), 'utf8'));

// ---------------- WbWorld（C# 同构 → JS） ----------------
const W = 256, H = 160, WORLD_EVENTS_CAP = 80, FX_CAP = 620, CORPSE_MAX = 240;
const T_DEEP = 0, T_WATER = 1, T_SAND = 2, T_GRASS = 3, T_FOREST = 4, T_HILL = 5,
      T_MOUNTAIN = 6, T_SNOW = 7, T_LAVA = 8, T_BURNT = 9, T_ICE = 10, T_SWAMP = 11;

const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const idx = (x, y) => y * W + x;
const isWater = (t) => t === T_DEEP || t === T_WATER;
const isLand = (t) => t !== T_DEEP && t !== T_WATER && t !== T_LAVA;
const walkableT = (t) => t !== T_DEEP && t !== T_WATER && t !== T_MOUNTAIN && t !== T_LAVA; // constants.ts L73-76

const FX_MINOR = new Set(['dmg', 'hit', 'smoke', 'spawn', 'heart', 'skull', 'arrow', 'coin', 'blood', 'dust']);

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

// RACES 社会属性（WbCivSim.RacesAggr 同表——仅 isCiv 六族，?? 0.5 回退）
const RACES_AGGR = { 0: 0.5, 1: 0.7, 2: 0.3, 3: 0.6, 19: 0.8, 20: 0.9 };
// WbCivSim.RacesIsCiv（黄金 meta.racesIsCiv 权威——镜像同读）
const RACES_IS_CIV = gold.meta.racesIsCiv;
const isCivRace = (r) => r >= 0 && r < RACES_IS_CIV.length && RACES_IS_CIV[r];

// WbTechMods（NEUTRAL 基线 + ModsOfTechs 军事键——镜像只需要军团域消费的键）
function newTechMods() {
  return { dmg: 1, hp: 1, bhp: 1, gold: 1, know: 1, repro: 1, col: 1, tax: 1,
    cult: 1, repair: 1, stab: 0, morale: 0, armyMax: 0, archer: 1, plague: 1,
    range: 0, arty: 0, bomber: 0, nukeCap: 0, laser: 0, drone: 0, orbital: 0, mech: 0, ai: 0, plasma: 0, antiMatter: 0 };
}
// ModsOfTechs 军事消费键（WbCivSim.cs switch 同款——只保留军团域可达键；黄金 meta.neutralMods 权威基线）
function techModsOf(w, civId) {
  const civ = w.civs[civId];
  const m = newTechMods();
  const nm = gold.meta.neutralMods;
  for (const k of Object.keys(m)) if (nm && nm[k] !== undefined && typeof m[k] === 'number') m[k] = nm[k];
  if (!civ || !civ.techs) return m;
  for (const k of civ.techs) {
    switch (k) {
      case 'crossbow': m.archer += 0.2; break;
      case 'tactics': m.morale += 8; break;
      case 'legion_t': m.armyMax += 2; m.morale += 6; break;
      case 'rifling': m.range += 2.5; m.archer += 0.3; break;
      case 'singularity': m.ai += 1; m.stab += 10; m.know += 0.4; break;
      case 'robotics': m.mech += 1; m.repair += 1.0; m.bhp += 0.4; break;
      default: break;
    }
  }
  return m;
}

// JOBS 换算（setJob L1482；黄金 meta.jobsHpMul/DmgMul/SpeedMul 权威）
const JOBS_HPMUL = gold.meta.jobsHpMul, JOBS_DMGMUL = gold.meta.jobsDmgMul, JOBS_SPEEDMUL = gold.meta.jobsSpeedMul;
const jobsMul = (j, f) => (JOBS_HPMUL && f === 'h' ? JOBS_HPMUL[j] : f === 'd' ? JOBS_DMGMUL[j] : JOBS_SPEEDMUL[j]);
const jget = (arr, j) => (arr && arr[j] != null ? arr[j] : 1);

function newWorld() {
  return {
    terrain: new Uint8Array(W * H),
    owner: new Int16Array(W * H).fill(-1),
    occCiv: new Int8Array(W * H).fill(-1),
    occStr: new Uint8Array(W * H),
    civs: [], units: [], unitById: new Map(),
    buildings: [], bHp: new Map(), civBuildCounts: new Map(),
    occSet: new Set(), armies: [],
    rel: new Map(), directives: [], warData: new Map(),
    effects: [], worldEvents: [], toasts: [], corpses: [],
    eventSeq: 0, toastSeq: 0, dirSeq: 1, civSeq: 0,
    tickCount: 0, rngA: 0,
    armySeq: 1, armyNameSeq: new Map(),
    lastClashEventTick: 0, lastReinforceEventTick: 0, lastVolleyEventTick: 0,
    killCredit: null, shake: 0,
    laws: {},
    rng() { // engine.ts L728-733 mulberry32（C# WbWorld.Rng 同构）
      this.rngA = (this.rngA + 0x6d2b79f5) | 0;
      let t = Math.imul(this.rngA ^ (this.rngA >>> 15), 1 | this.rngA);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    // engine fx L9781-9799（cap 逐出 + seed/dir rng×2 保真）
    Fx(kind, x, y, ttl, optR, optCiv) {
      if (this.effects.length >= FX_CAP) {
        let victim = -1;
        for (let i = 0; i < this.effects.length; i++) if (FX_MINOR.has(this.effects[i].kind)) { victim = i; break; }
        if (victim >= 0) this.effects.splice(victim, 1);
        else if (FX_MINOR.has(kind)) return null;
      }
      const e = { kind, x, y, x0: x, y0: y, r: optR ?? 1, age: 0, ttl, seed: Math.floor(this.rng() * 65536), dir: this.rng() * Math.PI * 2, civ: optCiv ?? null, colorHex: null };
      this.effects.push(e);
      return e;
    },
    AddEvent(kind, text, colorHex = null, x = null, y = null) { // engine addEvent L13995
      this.worldEvents.unshift({ id: this.eventSeq++, year: 0, kind, text, colorHex, x, y });
      if (this.worldEvents.length > WORLD_EVENTS_CAP) this.worldEvents.length = WORLD_EVENTS_CAP;
    },
    Toast(text, tone, op = null) { this.toasts.push({ id: this.toastSeq++, text, tone, op }); },
  };
}

// ---------------- WbNames 军团命名（WbNames.cs 同构） ----------------
const ARMY_PRE = ['苍', '黑', '白', '血', '铁', '烈', '寒', '金', '银', '怒', '晨', '暮', '风', '雷', '霜', '焰'];
const ARMY_MID = ['狼', '鹰', '狮', '龙', '熊', '鸦', '虎', '鹿', '蛇', '蝎', '犀', '鲨'];
const ARMY_SUF = ['军团', '方阵', '铁卫', '战团', '军团', '远征军', '兵团'];
const ARMY_JOB_SUF = ['步卒军团', '箭雨方阵', '混编战团'];
const FIELD_PRE = ['血', '白', '黑', '灰', '赤', '金', '寒', '荒', '雾', '断'];
const FIELD_SUF = ['谷', '滩', '原', '桥', '坡', '林', '渡', '丘', '河湾', '隘口'];

function roman(n) { // names.ts L81-91
  if (n < 1 || n > 40) return String(n);
  const table = [[40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '', v = n;
  for (const [val, sym] of table) while (v >= val) { out += sym; v -= val; }
  return out.toUpperCase();
}
function armyNameByJobs(w, seq, archerRatio) { // names.ts L64-77（两掷 rng）
  const pre = ARMY_PRE[Math.floor(w.rng() * ARMY_PRE.length)];
  const mid = ARMY_MID[Math.floor(w.rng() * ARMY_MID.length)];
  let suf;
  if (archerRatio > 0.66) suf = ARMY_JOB_SUF[1];
  else if (archerRatio < 0.25) suf = ARMY_JOB_SUF[0];
  else suf = ARMY_JOB_SUF[2];
  const bas = `${pre}${mid}${suf}`;
  return seq <= 1 ? bas : `${bas}·${roman(seq)}`;
}
function battleFieldName(w) { // names.ts L59-61
  return FIELD_PRE[Math.floor(w.rng() * FIELD_PRE.length)] + FIELD_SUF[Math.floor(w.rng() * FIELD_SUF.length)];
}

// ---------------- WbCivSim 军团域镜像（WbCivSim.cs 逐函数转写） ----------------
const ARMY_MIN = 6, ARMY_MAX = 24, ARMY_SPEED = 0.05, ARMY_CD = 900;
const Math_hypot = Math.hypot; // fdlibm 蓝本侧黄金以 engine Math.hypot 生成——镜像同用 JS hypot（C# 用 WbMath.FdHypot 对齐）

function RaceAggrOf(race) { return RACES_AGGR[race] ?? 0.5; }
function CivAt(w, id) { const c = w.civs[id]; return c && c.alive !== false ? c : (c || null); }

function ActiveDirective(w, civId, kind) { // M-U3d 已迁域镜像（WbCivSim.cs 同构）
  for (const d of w.directives) if (d.civ === civId && d.kind === kind && d.status === 'active') return d;
  return null;
}
function GovOf(w, civId) { return w.civs[civId]?.gov ?? 0; }
function AtWar(w, a, b) { const v = w.rel.get(pairKey(a, b)); return v !== undefined && v < -20; }
function CivAtWar(w, civId) {
  for (const o of w.civs) if (o && o.alive && o.id !== civId && AtWar(w, civId, o.id)) return true;
  return false;
}
function SetJob(w, u, job) { // engine L1482（WbCivSim.SetJob 同构）
  if (!isCivRace(u.race) || job < 0 || job >= JOBS_HPMUL.length) return;
  const oldH = jget(JOBS_HPMUL, u.job), nwH = jget(JOBS_HPMUL, job);
  const oldD = jget(JOBS_DMGMUL, u.job), nwD = jget(JOBS_DMGMUL, job);
  const oldS = jget(JOBS_SPEEDMUL, u.job), nwS = jget(JOBS_SPEEDMUL, job);
  u.hp = Math.max(1, Math.round((u.hp * nwH) / oldH));
  u.maxHp = Math.max(1, Math.round((u.maxHp * nwH) / oldH));
  u.dmg = (u.dmg * nwD) / oldD;
  u.speed = (u.speed * nwS) / oldS;
  u.job = job;
}
function ClaimTile(w, i, civId) { /* 建造域（M-U3b）——黄金军团场景 frontSolidify 转正时 owner 重指派由夹具等价；镜像为 no-op + owner 直写 */ 
  const old = w.owner[i];
  w.owner[i] = civId;
  return old;
}
function FdHypot(dx, dy) { return Math_hypot(dx, dy); }   // 黄金以 JS Math.hypot 生成；C# 侧 WbMath.FdHypot fdlibm 对齐
function FdAtan2(y, x) { return Math.atan2(y, x); }       // 同上（M-U2c fd_atan2 位等价 netlib 20 万样本 0 差）
function FdCos(a) { return Math.cos(a); }
function FdSin(a) { return Math.sin(a); }

function TryFormArmy(w, civ, targetCiv) { // engine L6052-6140 / WbCivSim.TryFormArmy
  if (civ == null || !civ.alive || civ.pop < 10) return null;
  if (w.tickCount < (civ.armyCd ?? 0)) return null;
  let legionParam = 2;
  const leg = ActiveDirective(w, civ.id, 'legion');
  if (leg != null) legionParam = Math.max(3, leg.param);
  const aggr = RaceAggrOf(civ.race);
  let armyCap = Math.round((legionParam + techModsOf(w, civ.id).armyMax + (GovOf(w, civ.id) === 4 ? 1 : 0)) * (0.75 + aggr * 0.5));
  armyCap = Math.max(1, armyCap);
  let own = 0;
  for (const a of w.armies) if (a.civ === civ.id) own++;
  if (own >= armyCap) return null;
  let enemyId = targetCiv ?? -1;
  if (enemyId < 0) {
    const e = PickWarEnemy(w, civ.id);
    if (e == null) return null;
    enemyId = e.id;
  } else {
    const ec0 = w.civs[enemyId];
    if (ec0 == null || !ec0.alive || !AtWar(w, civ.id, enemyId)) return null;
  }
  const centerN = CivRallyPoint(w, civ);
  if (centerN == null) return null;
  const center = centerN;
  const near = [], far = [];
  for (const u of w.units) {
    if (u.dead || u.civ !== civ.id || u.boat !== 0 || u.army != null) continue;
    const job = u.job;
    if (job !== 2 && job !== 3) continue;
    (FdHypot(u.x - center.x, u.y - center.y) <= 24 ? near : far).push(u);
  }
  if (near.length < ARMY_MIN) {
    far.sort((a, b) => FdHypot(a.x - center.x, a.y - center.y) - FdHypot(b.x - center.x, b.y - center.y));
    const take = Math.min(far.length, ARMY_MAX - near.length);
    for (let i = 0; i < take; i++) near.push(far[i]);
  }
  if (near.length < ARMY_MIN && CivAtWar(w, civ.id)) {
    const levy = [];
    for (const u of w.units) {
      if (levy.length >= ARMY_MIN + 4) break;
      if (u.dead || u.civ !== civ.id || u.boat !== 0 || u.army != null) continue;
      if (u.job !== 0) continue;
      if (FdHypot(u.x - center.x, u.y - center.y) > 20) continue;
      levy.push(u);
    }
    for (const u of levy) SetJob(w, u, 2);
    if (levy.length > 0) w.AddEvent('army', `「${civ.name}」敲响征兵鼓——${levy.length} 名平民放下锄头拿起长矛`, civ.colorHex, center.x, center.y);
    near.push(...levy);
  }
  const pool = near;
  if (pool.length < ARMY_MIN) return null;
  pool.sort((a, b) => FdHypot(a.x - center.x, a.y - center.y) - FdHypot(b.x - center.x, b.y - center.y));
  const members = pool.slice(0, ARMY_MAX);
  let leader = members[0];
  for (const m of members) if (m.kills > leader.kills) leader = m;
  const seq = (w.armyNameSeq.get(civ.id) ?? 0) + 1;
  w.armyNameSeq.set(civ.id, seq);
  let archerN = 0;
  for (const m of members) if (m.job === 3) archerN++;
  const archerRatio = archerN / members.length;
  const name = armyNameByJobs(w, seq, archerRatio);
  let sx = 0, sy = 0;
  for (const m of members) { sx += m.x; sy += m.y; }
  const flag = NearestStandable(w, Math.round(sx / members.length), Math.round(sy / members.length));
  const a2 = {
    id: w.armySeq++, civ: civ.id, name,
    members: members.map((m) => m.id), leaderId: leader.id,
    x: flag.x, y: flag.y, tx: flag.x, ty: flag.y,
    state: 'rally', formedTick: w.tickCount, size0: members.length,
    morale: Math.min(95, 58 + leader.kills * 3),
    targetCiv: enemyId, rot: w.rng() * Math.PI * 2,
    kills: 0, losses: 0, evalTick: w.tickCount,
    tactical: false, clashWith: null, naval: false, ambush: false,
    battleSize0: null, marchPushTick: null, supplyWarned: false, reinforced: null, battleSince: null,
  };
  for (const m of members) m.army = a2.id;
  {
    const musterCost = 6 + Math.round(members.length * 0.35);
    if ((civ.gold ?? 0) >= musterCost) civ.gold = (civ.gold ?? 0) - musterCost;
    else {
      civ.gold = 0;
      a2.morale = Math.max(20, a2.morale - 12);
      w.AddEvent('army', `「${civ.name}」国库告罄，${name}仓促成军——粮草不济，士气低落`, civ.colorHex, a2.x, a2.y);
    }
  }
  w.armies.push(a2);
  w.AddEvent('army', `「${civ.name}」集结了${name}（${members.length} 人，宿将 ${leader.name} 执旗）`, civ.colorHex, a2.x, a2.y);
  w.Toast(`「${civ.name}」的${name}集结完毕`, 'war');
  return a2;
}

function CivRallyPoint(w, civ) { // engine L6143-6154
  if (civ.capital >= 0) return { x: civ.capital % W, y: (civ.capital / W) | 0 };
  let sx = 0, sy = 0, n = 0;
  for (const u of w.units) {
    if (u.dead || u.civ !== civ.id) continue;
    sx += u.x; sy += u.y; n++;
  }
  if (n === 0) return null;
  return { x: sx / n, y: sy / n };
}

function PickWarEnemy(w, civId) { // engine L6157-6176
  const me = w.civs[civId];
  if (me == null || !me.alive) return null;
  const px = me.capital >= 0 ? me.capital % W : W / 2;
  const py = me.capital >= 0 ? (me.capital / W) | 0 : H / 2;
  let best = null, bestD = Infinity;
  for (const o of w.civs) {
    if (o == null || !o.alive || o.id === civId || !AtWar(w, civId, o.id)) continue;
    const cnt = w.civBuildCounts.get(o.id);
    if (!cnt) continue;
    let hasB = false;
    for (let k = 1; k < cnt.length; k++) if (cnt[k] > 0) { hasB = true; break; }
    if (!hasB) continue;
    const d = o.capital >= 0 ? FdHypot((o.capital % W) - px, ((o.capital / W) | 0) - py) : 100;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function NearestStandable(w, x, y) { // engine L6179-6191
  for (let r = 0; r < 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const xx = Math.max(0, Math.min(W - 1, x + dx));
        const yy = Math.max(0, Math.min(H - 1, y + dy));
        if (walkableT(w.terrain[idx(xx, yy)])) return { x: xx, y: yy };
      }
  return { x, y };
}

function FormationPos(w, a, k) { // engine L6194-6209
  const n = a.members.length;
  if (a.state === 'march' || a.state === 'retreat') {
    const dirAng = FdAtan2(a.ty - a.y, a.tx - a.x);
    const per = 3;
    const row = Math.floor(k / per);
    const col = (k % per) - 1;
    const back = 0.9 + row * 1.15;
    const px = -FdCos(dirAng) * back + FdCos(dirAng + Math.PI / 2) * col * 1.0;
    const py = -FdSin(dirAng) * back + FdSin(dirAng + Math.PI / 2) * col * 1.0;
    return [Math.max(0.5, Math.min(W - 0.5, a.x + px)), Math.max(0.5, Math.min(H - 0.5, a.y + py))];
  }
  const ang = (k / Math.max(1, n)) * Math.PI * 2 + a.rot;
  const r = k === 0 ? 0.7 : 1.5 + (k % 3) * 0.55;
  return [Math.max(0.5, Math.min(W - 0.5, a.x + FdCos(ang) * r)), Math.max(0.5, Math.min(H - 0.5, a.y + FdSin(ang) * r))];
}

function ArmyTick(w) { // engine L6212-6304
  if (w.tickCount % 60 === 0) {
    for (const civ of w.civs) {
      if (!civ || !civ.alive || !CivAtWar(w, civ.id)) continue;
      if (w.rng() < 0.5) TryFormArmy(w, civ, null);
    }
  }
  for (let i = w.armies.length - 1; i >= 0; i--) {
    const a = w.armies[i];
    const civ = w.civs[a.civ];
    if (!civ || !civ.alive) { DisbandArmy(w, a, true); continue; }
    let leaderDead = false;
    for (let k = a.members.length - 1; k >= 0; k--) {
      const u = w.unitById.get(a.members[k]);
      if (!u || u.dead || u.civ !== a.civ || u.army !== a.id) {
        const uid = a.members[k];
        a.members.splice(k, 1);
        a.losses++;
        a.morale -= 4;
        if (uid === a.leaderId) leaderDead = true;
      }
    }
    if (leaderDead) ElectLeader(w, a);
    if (a.members.length < 4) { DisbandArmy(w, a, true); continue; }
    if (a.state !== 'retreat' && w.tickCount % 25 === 0) {
      const mech = techModsOf(w, a.civ).mech > 0;
      const limit = mech ? 26 : 15;
      let near = Infinity;
      for (const b of w.buildings) {
        if (b.civ !== a.civ) continue;
        const d = FdHypot(b.x - a.x, b.y - a.y);
        if (d < near) near = d;
        if (near < limit) break;
      }
      if (near > limit) {
        a.morale -= 1.2;
        if (!a.supplyWarned && a.morale < 72) {
          a.supplyWarned = true;
          w.AddEvent('army', `${a.name} 深入敌境，补给线吃紧——士卒疲惫，士气日渐消磨`, civ.colorHex, a.x, a.y);
        }
      } else if (a.supplyWarned) a.supplyWarned = false;
    }
    if (a.state !== 'retreat' && w.tickCount % 10 === 0) {
      for (const o of w.armies) {
        if (o === a || o.civ === a.civ || o.state !== 'retreat' || !AtWar(w, a.civ, o.civ)) continue;
        if (FdHypot(o.x - a.x, o.y - a.y) > 6) continue;
        if (w.rng() < 0.4 && o.members.length > 0) {
          const victim = w.unitById.get(o.members[(w.rng() * o.members.length) | 0]);
          if (victim && !victim.dead) {
            victim.hp = 0;
            victim.dead = 1;
            AddCorpse(w, victim.x, victim.y, false, false);
            WwCountKill(w, victim);
            o.losses++;
            o.morale = Math.max(5, o.morale - 3);
            const wd = w.warData.get(pairKey(a.civ, o.civ));
            if (wd) {
              if (a.civ === wd.a) { wd.casB++; wd.scoreA += 0.5; } else { wd.casA++; wd.scoreB += 0.5; }
            }
            if (w.rng() < 0.12) w.AddEvent('clash', `${a.name} 追亡逐北，溃军沿途折损（${o.name} 尚存 ${o.members.length} 人）`, civ.colorHex, o.x, o.y);
          }
        }
      }
    }
    const moraleFloor = 35 + techModsOf(w, a.civ).morale;
    if (a.morale < moraleFloor && a.state !== 'retreat') { RoutArmy(w, a, false, false); continue; }
    const enemy = w.civs[a.targetCiv];
    if (a.state !== 'retreat' && (!enemy || !enemy.alive || !AtWar(w, a.civ, a.targetCiv))) {
      RoutArmy(w, a, true, false);
      continue;
    }
    switch (a.state) {
      case 'rally': ArmyRally(w, a, civ); break;
      case 'march': ArmyMarch(w, a, civ); break;
      case 'battle': ArmyBattle(w, a, civ); break;
      case 'siege': ArmySiege(w, a, civ); break;
      case 'retreat': ArmyRetreat(w, a, civ); break;
    }
    if (a.state === 'rally' || a.state === 'retreat') a.morale = Math.min(100, a.morale + 0.4 + techModsOf(w, a.civ).morale * 0.015);
    if (a.members.length < a.size0 * 0.5 && (a.state === 'march' || a.state === 'siege')) a.morale -= 0.4;
  }
}

function ElectLeader(w, a) { // engine L6307-6316
  let leader = null;
  for (const id of a.members) {
    const u = w.unitById.get(id);
    if (u && (!leader || u.kills > leader.kills)) leader = u;
  }
  a.leaderId = leader ? leader.id : -1;
  a.morale = Math.max(20, a.morale - 8);
  if (leader) w.AddEvent('army', `${a.name} 主将阵亡，${leader.name} 接过军旗`, w.civs[a.civ]?.colorHex, a.x, a.y);
}

function ArmyRally(w, a, civ) { // engine L6318-6337
  let gathered = 0;
  for (let k = 0; k < a.members.length; k++) {
    const u = w.unitById.get(a.members[k]);
    if (!u) continue;
    const [fx, fy] = FormationPos(w, a, k);
    u.tx = fx; u.ty = fy;
    if (FdHypot(u.x - a.x, u.y - a.y) < 3.5) gathered++;
  }
  const ratio = gathered / a.members.length;
  const waited = w.tickCount - a.formedTick;
  if ((ratio >= 0.8 && waited > 40) || waited > 300) {
    const tgt = ArmyMarchTarget(w, a);
    if (tgt) {
      a.tx = tgt.x; a.ty = tgt.y;
      a.state = 'march';
      w.AddEvent('army', `${a.name} 誓师出征（${a.members.length} 人）`, civ.colorHex, a.x, a.y);
    }
  }
}

function ArmyMarchTarget(w, a) { // engine L6340-6359
  const e = w.civs[a.targetCiv];
  if (!e || !e.alive) return null;
  if (e.capital >= 0) return { x: e.capital % W, y: (e.capital / W) | 0 };
  let best = null, bestD = Infinity;
  for (const b of w.buildings) {
    if (b.civ !== a.targetCiv) continue;
    const d = FdHypot(b.x - a.x, b.y - a.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  if (best) return { x: best.x, y: best.y };
  if (e.tiles.length > 0) {
    let sx = 0, sy = 0;
    for (const t of e.tiles) { sx += t % W; sy += (t / W) | 0; }
    return { x: sx / e.tiles.length, y: sy / e.tiles.length };
  }
  return null;
}

function ArmyMarch(w, a, civ) { // engine L6361-6471
  const hereTile = w.terrain[idx(Math.floor(a.x), Math.floor(a.y))];
  a.ambush = hereTile === T_FOREST;
  for (const o of w.armies) {
    if (o.civ !== a.civ || o.id === a.id || o.state !== 'battle' || o.clashWith == null) continue;
    const f2 = w.armies.find((x) => x.id === o.clashWith);
    if (!f2 || !AtWar(w, a.civ, f2.civ)) continue;
    if (FdHypot(f2.x - a.x, f2.y - a.y) < 11) { DeclareClash(w, a, f2, civ); return; }
  }
  let chasing = false;
  {
    let routedFoe = null, routedD = 10;
    for (const o of w.armies) {
      if (o.civ === a.civ || o.state !== 'retreat' || !AtWar(w, a.civ, o.civ)) continue;
      const dd = FdHypot(o.x - a.x, o.y - a.y);
      if (dd < routedD) { routedD = dd; routedFoe = o; }
    }
    if (routedFoe && !a.naval) { chasing = true; a.tx = routedFoe.x; a.ty = routedFoe.y; }
  }
  const foe = NearestEnemyArmy(w, a);
  if (foe && foe.state !== 'retreat' && FdHypot(foe.x - a.x, foe.y - a.y) < 8) {
    const ai = techModsOf(w, a.civ).ai > 0;
    if (ai && foe.members.length > a.members.length * 1.8 && a.morale < 60) { RoutArmy(w, a, false, true); return; }
    DeclareClash(w, a, foe, civ);
    return;
  }
  const d = FdHypot(a.tx - a.x, a.ty - a.y);
  if (a.naval) {
    const onLand = walkableT(w.terrain[idx(Math.floor(a.x), Math.floor(a.y))]);
    if (onLand && d < 8) { ArmyDisembark(w, a); a.state = 'siege'; a.evalTick = w.tickCount; return; }
  } else if (d < 3 && !chasing) {
    a.state = 'siege'; a.evalTick = w.tickCount;
    return;
  }
  if (!a.naval && w.tickCount - (a.marchPushTick ?? 0) > 25) {
    a.marchPushTick = w.tickCount;
    FrontPush(w, a, 2, 3);
  }
  const step = ARMY_SPEED * (0.75 + a.morale / 200) * (techModsOf(w, a.civ).mech > 0 ? 1.4 : 1) * (chasing ? 1.5 : 1);
  if (a.naval) {
    a.x = Math.max(0.5, Math.min(W - 0.5, a.x + ((a.tx - a.x) / d) * step));
    a.y = Math.max(0.5, Math.min(H - 0.5, a.y + ((a.ty - a.y) / d) * step));
  } else {
    const bas = FdAtan2(a.ty - a.y, a.tx - a.x);
    let moved = false;
    for (const off of [0, 0.45, -0.45, 0.95, -0.95, 1.7, -1.7, Math.PI]) {
      const ang = bas + off;
      const nx = a.x + FdCos(ang) * step;
      const ny = a.y + FdSin(ang) * step;
      if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
      if (!walkableT(w.terrain[idx(Math.floor(nx), Math.floor(ny))])) continue;
      a.x = nx; a.y = ny;
      moved = true;
      break;
    }
    if (!moved) {
      const ax = Math.floor(a.x + FdCos(bas) * 1.5);
      const ay = Math.floor(a.y + FdSin(bas) * 1.5);
      if (ax >= 0 && ay >= 0 && ax < W && ay < H && isWater(w.terrain[idx(ax, ay)]) && CrossesWater(w, a.x, a.y, a.tx, a.ty)) {
        ArmyEmbark(w, a);
        return;
      }
    }
  }
  for (let k = 0; k < a.members.length; k++) {
    const u = w.unitById.get(a.members[k]);
    if (!u) continue;
    const [fx, fy] = FormationPos(w, a, k);
    u.tx = fx; u.ty = fy;
    if (a.naval) {
      const inWater = isWater(w.terrain[idx(Math.floor(u.x), Math.floor(u.y))]);
      if (!u.boat && inWater) { u.boat = 1; u.boatTTL = 1600; }
      if (u.boat) {
        u.boatTTL = Math.max(u.boatTTL ?? 0, 200);
        if (!inWater && FdHypot(u.x - a.x, u.y - a.y) < 3) {
          const wp = FindWaterNear(w, a.x, a.y, 3);
          if (wp) { u.boat = 1; u.boatTTL = 1600; u.x = wp.x; u.y = wp.y; u.lx = wp.x; u.ly = wp.y; }
        }
      }
    } else if (u.boat && FdHypot(u.x - a.x, u.y - a.y) < 4) {
      u.boat = 0; u.boatTTL = 0;
      const s = NearestStandable(w, Math.floor(u.x), Math.floor(u.y));
      u.x = s.x; u.y = s.y; u.lx = s.x; u.ly = s.y;
    }
  }
}

function ArmyBattle(w, a, civ) { // engine L6473-6643
  const foe = a.clashWith != null ? w.armies.find((x) => x.id === a.clashWith) : null;
  if (!foe || !w.armies.includes(foe) || foe.state !== 'battle' || FdHypot(foe.x - a.x, foe.y - a.y) > 12) {
    const won = foe ? (foe.state === 'retreat' || a.members.length >= foe.members.length) : true;
    a.morale = Math.min(100, a.morale + (won ? 12 : 2));
    const wd = foe ? w.warData.get(pairKey(a.civ, foe.civ)) : null;
    if (wd && won) { if (a.civ === wd.a) wd.scoreA += 10; else wd.scoreB += 10; }
    if (w.tickCount - (a.battleSince ?? w.tickCount) > 50) {
      w.AddEvent('clash', `${a.name} ${won ? `击溃了敌军（斩获 ${a.kills}）` : '且战且退'}，会战落幕`, civ.colorHex, a.x, a.y);
    }
    a.clashWith = undefined;
    a.battleSince = undefined;
    if (won) a.state = 'march';
    else RoutArmy(w, a, false, false);
    return;
  }
  const tmA = techModsOf(w, a.civ);
  const ai = tmA.ai > 0;
  const mech = tmA.mech > 0;
  const bs0 = a.battleSize0 ?? a.members.length;
  if (a.members.length <= Math.max(3, Math.floor(bs0 * 0.5))) {
    w.AddEvent('clash', `${a.name} 伤亡过半，战线崩溃——残部溃散`, civ.colorHex, a.x, a.y);
    const wd0 = w.warData.get(pairKey(a.civ, foe.civ));
    if (wd0) { if (foe.civ === wd0.a) wd0.scoreA += 8; else wd0.scoreB += 8; }
    RoutArmy(w, a, false, false);
    return;
  }
  if (mech && w.tickCount % 20 === 0) {
    let hits = 0;
    for (const id of foe.members) {
      const u = w.unitById.get(id);
      if (!u || u.dead) continue;
      if (FdHypot(u.x - foe.x, u.y - foe.y) < 3.5) {
        u.hp -= 16 + w.rng() * 10;
        u.hurt = 20;
        hits++;
        if (u.hp <= 0) { u.dead = 1; WwCountKill(w, u); }
      }
    }
    if (hits > 0) {
      const e = w.Fx('bullet', foe.x + w.rng() * 2 - 1, foe.y + w.rng() * 2 - 1, 5, 0, a.civ);
      if (e) { e.x0 = a.x; e.y0 = a.y; }
    }
  }
  const fAng = FdAtan2(foe.y - a.y, foe.x - a.x);
  const ppx = -FdSin(fAng);
  const ppy = FdCos(fAng);
  const foes = foe.members.map((id) => w.unitById.get(id)).filter((u) => !!u && !u.dead);
  let mCount = 0, rCount = 0;
  const rangedFlags = [];
  for (const id of a.members) {
    const u = w.unitById.get(id);
    const r = u ? IsRangedMember(w, u) : false;
    rangedFlags.push(r);
    if (r) rCount++;
    else mCount++;
  }
  let mi = 0, ri = 0;
  for (let k = 0; k < a.members.length; k++) {
    const u = w.unitById.get(a.members[k]);
    if (!u) continue;
    if (rangedFlags[k]) {
      const off = (ri - (rCount - 1) / 2) * 1.1;
      ri++;
      u.tx = Math.max(0.5, Math.min(W - 0.5, a.x - FdCos(fAng) * 2.6 + ppx * off));
      u.ty = Math.max(0.5, Math.min(H - 0.5, a.y - FdSin(fAng) * 2.6 + ppy * off));
    } else {
      const off = (mi - (mCount - 1) / 2) * 1.05;
      mi++;
      u.tx = Math.max(0.5, Math.min(W - 0.5, foe.x - FdCos(fAng) * 2.4 + ppx * off));
      u.ty = Math.max(0.5, Math.min(H - 0.5, foe.y - FdSin(fAng) * 2.4 + ppy * off));
    }
  }
  if (foes.length > 0 && w.tickCount % 15 === 0) {
    let volleyN = 0;
    for (let k = 0; k < a.members.length; k++) {
      const u = w.unitById.get(a.members[k]);
      if (!u || u.dead || u.cd > 0 || !rangedFlags[k]) continue;
      const gun = u.wep === 'musket' || u.wep === 'rifle';
      const beam = u.wep === 'laser_rifle';
      const t = foes[(w.rng() * foes.length) | 0];
      const aim = LeadAim(w, t, beam ? 8 : gun ? 5 : 12);
      const mul = isCivRace(u.race) && a.civ >= 0 ? tmA.archer : 1;
      if (beam) CastBeam(w, u, aim.x, aim.y, u.dmg * 0.75 * mul);
      else if (gun) CastBullet(w, u, aim.x, aim.y, u.dmg * mul);
      else CastArrow(w, u, aim.x, aim.y, u.dmg * mul);
      u.cd = beam ? 12 : gun ? 15 : 18;
      u.atk = 10;
      volleyN++;
    }
    if (volleyN >= 4) {
      foe.morale = Math.max(5, foe.morale - 1.5);
      if (w.tickCount - w.lastVolleyEventTick > 200 && w.rng() < 0.25) {
        w.lastVolleyEventTick = w.tickCount;
        w.AddEvent('clash', `${a.name} 一声令下，${volleyN} 名弓手齐射——箭如飞蝗`, civ.colorHex, a.x, a.y);
      }
    }
  }
  if (w.tickCount - a.evalTick > 25) {
    a.evalTick = w.tickCount;
    const myPow = a.members.length * (1 + a.morale / 100);
    const foePow = foe.members.length * (1 + foe.morale / 100);
    a.morale += myPow > foePow ? 2 : -4;
    const bs0c = a.battleSize0 ?? a.members.length;
    const frac = a.members.length / Math.max(1, bs0c);
    if (frac < 0.8) a.morale -= (0.8 - frac) * 4;
    let surrounders = 0;
    for (const o of w.armies) {
      if (o.civ !== a.civ || o.state === 'retreat' || o.id === a.id) continue;
      if (FdHypot(o.x - foe.x, o.y - foe.y) < 14) surrounders++;
    }
    if (surrounders >= 1 && FdHypot(a.x - foe.x, a.y - foe.y) < 8) {
      foe.morale = Math.max(5, foe.morale - 3);
      a.morale = Math.min(100, a.morale + 1);
      if (w.rng() < 0.06) {
        w.AddEvent('clash', `${a.name}${surrounders >= 2 ? ` 与 ${surrounders} 支友军` : ''}完成合围——${foe.name} 身陷重围，军心动摇`, civ.colorHex, foe.x, foe.y);
      }
    }
    if (myPow < foePow * 0.75 && (ai || w.rng() < 0.25)) {
      let best = null, bestD = 26;
      for (const o of w.armies) {
        if (o.civ !== a.civ || o.id === a.id) continue;
        if (o.state === 'battle' || o.state === 'retreat') continue;
        if (o.targetCiv !== foe.civ && techModsOf(w, o.civ).ai <= 0) continue;
        const dd = FdHypot(o.x - a.x, o.y - a.y);
        if (dd < bestD) { bestD = dd; best = o; }
      }
      if (best) {
        best.targetCiv = foe.civ;
        best.tx = a.x; best.ty = a.y;
        if (best.state === 'rally') best.state = 'march';
        a.reinforced = (a.reinforced ?? 0) + 1;
        if (w.tickCount - w.lastReinforceEventTick > 240) {
          w.lastReinforceEventTick = w.tickCount;
          w.AddEvent('army', `${best.name} 奉令驰援 ${a.name}——合击会战之敌`, civ.colorHex, a.x, a.y);
        }
      }
    }
    if (ai && myPow < foePow * 0.55 && a.morale < 55) { RoutArmy(w, a, false, true); return; }
    const wd = w.warData.get(pairKey(a.civ, foe.civ));
    if (wd) { wd.exA += 1; wd.exB += 1; }
  }
}

function ArmySiege(w, a, civ) { // engine L6645-6697
  if (w.tickCount - a.evalTick <= 30) {
    const foe = NearestEnemyArmy(w, a);
    if (foe && FdHypot(foe.x - a.x, foe.y - a.y) < 7) DeclareClash(w, a, foe, civ);
    return;
  }
  a.evalTick = w.tickCount;
  const tgt = NearestEnemyBuildingOf(w, a);
  if (tgt) {
    if (techModsOf(w, a.civ).mech > 0 && w.rng() < 0.35) LaunchMech(w, civ, a.x, a.y, tgt.x + 0.5, tgt.y + 0.5);
    for (const id of a.members) {
      const u = w.unitById.get(id);
      if (!u) continue;
      u.tx = tgt.x + w.rng() * 3 - 1.5;
      u.ty = tgt.y + w.rng() * 3 - 1.5;
    }
    const dd = FdHypot(tgt.x - a.x, tgt.y - a.y);
    if (dd > 5) { a.tx = tgt.x; a.ty = tgt.y; a.state = 'march'; return; }
    const step = ARMY_SPEED * 1.5;
    const nx = a.x + ((tgt.x - a.x) / dd) * step;
    const ny = a.y + ((tgt.y - a.y) / dd) * step;
    if (walkableT(w.terrain[idx(Math.floor(nx), Math.floor(ny))]) || a.naval) { a.x = nx; a.y = ny; }
    FrontPush(w, a, 2, 4);
    return;
  }
  const pushed = FrontPush(w, a, 3, a.state === 'siege' ? 6 : 8);
  if (pushed > 0) {
    if (w.rng() < 0.2) w.AddEvent('occupy', `${a.name} 的战线向敌境推进（渗透 ${pushed} 格）`, civ.colorHex, a.x, a.y);
    const next = ArmyMarchTarget(w, a);
    if (next && FdHypot(next.x - a.x, next.y - a.y) > 6) { a.tx = next.x; a.ty = next.y; a.state = 'march'; }
  } else {
    const next2 = PickWarEnemy(w, a.civ);
    if (next2) {
      a.targetCiv = next2.id;
      const t = ArmyMarchTarget(w, a);
      if (t) { a.tx = t.x; a.ty = t.y; a.state = 'march'; }
    } else RoutArmy(w, a, true, false);
  }
}

function ArmyRetreat(w, a, civ) { // engine L6699-6735
  const home = CivRallyPoint(w, civ);
  if (!home) { DisbandArmy(w, a, true); return; }
  a.tx = home.x; a.ty = home.y;
  const d = FdHypot(home.x - a.x, home.y - a.y);
  if (d < 3) {
    if (a.naval) ArmyDisembark(w, a);
    DisbandArmy(w, a, false);
    return;
  }
  const step = ARMY_SPEED * 1.3;
  if (a.naval) {
    a.x = Math.max(0.5, Math.min(W - 0.5, a.x + ((home.x - a.x) / d) * step));
    a.y = Math.max(0.5, Math.min(H - 0.5, a.y + ((home.y - a.y) / d) * step));
    if (walkableT(w.terrain[idx(Math.floor(a.x), Math.floor(a.y))]) && d < 10) ArmyDisembark(w, a);
  } else {
    const bas = FdAtan2(home.y - a.y, home.x - a.x);
    for (const off of [0, 0.45, -0.45, 0.95, -0.95, 1.7, -1.7, Math.PI]) {
      const ang = bas + off;
      const nx = a.x + FdCos(ang) * step;
      const ny = a.y + FdSin(ang) * step;
      if (nx < 1 || ny < 1 || nx > W - 2 || ny > H - 2) continue;
      const t = w.terrain[idx(Math.floor(nx), Math.floor(ny))];
      if (!walkableT(t) && !isWater(t)) continue;
      a.x = nx; a.y = ny;
      break;
    }
  }
  for (let k = 0; k < a.members.length; k++) {
    const u = w.unitById.get(a.members[k]);
    if (!u) continue;
    const [fx, fy] = FormationPos(w, a, k);
    u.tx = fx; u.ty = fy;
  }
}

function DeclareClash(w, a, foe, civ) { // engine L6738-6757
  if (a.state === 'retreat' || foe.state === 'retreat') return;
  if (a.ambush) { a.morale = Math.min(100, a.morale + 10); a.ambush = false; }
  if (foe.ambush) { foe.morale = Math.min(100, foe.morale + 10); foe.ambush = false; }
  a.state = 'battle'; a.battleSince = w.tickCount; a.clashWith = foe.id;
  foe.state = 'battle'; foe.battleSince = w.tickCount; foe.clashWith = a.id;
  a.battleSize0 = a.members.length;
  foe.battleSize0 = foe.members.length;
  const wd = w.warData.get(pairKey(a.civ, foe.civ));
  if (wd) wd.battles++;
  if (w.tickCount - w.lastClashEventTick > 180) {
    w.lastClashEventTick = w.tickCount;
    const field = battleFieldName(w);
    w.AddEvent('clash', `${a.name}（${w.civs[a.civ]?.name}）与 ${foe.name}（${w.civs[foe.civ]?.name}）于${field}爆发会战`, civ.colorHex, (a.x + foe.x) / 2, (a.y + foe.y) / 2);
    w.shake = Math.max(w.shake, 4);
  }
}

function NearestEnemyArmy(w, a) { // engine L6760-6769
  let best = null, bestD = Infinity;
  for (const o of w.armies) {
    if (o.civ === a.civ || !AtWar(w, a.civ, o.civ)) continue;
    const d = FdHypot(o.x - a.x, o.y - a.y);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

function NearestEnemyBuildingOf(w, a) { // engine L6772-6782
  let best = null, bestD = 12;
  for (const b of w.buildings) {
    if (b.civ !== a.targetCiv && !AtWar(w, a.civ, b.civ)) continue;
    if (b.civ === a.civ) continue;
    const d = FdHypot(b.x - a.x, b.y - a.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

function CrossesWater(w, x0, y0, x1, y1) { // engine L6785-6799
  const dx = x1 - x0, dy = y1 - y0;
  const d = FdHypot(dx, dy);
  if (d < 4) return false;
  let water = 0;
  const samples = Math.max(1, Math.floor(d));
  for (let s = 1; s <= samples; s++) {
    const xx = Math.floor(x0 + (dx * s) / d);
    const yy = Math.floor(y0 + (dy * s) / d);
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    if (isWater(w.terrain[idx(xx, yy)])) water++;
  }
  return water / samples >= 0.45;
}

function FindWaterNear(w, x, y, r) { // engine L5546-5570
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let ring = 1; ring <= r; ring++)
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        const i = idx(xx, yy);
        if (!isWater(w.terrain[i])) continue;
        let waterN = 0;
        for (let ny = -1; ny <= 1; ny++)
          for (let nx = -1; nx <= 1; nx++) {
            if (nx === 0 && ny === 0) continue;
            if (isWater(w.terrain[idx(xx + nx, yy + ny)])) waterN++;
          }
        if (waterN >= 5) return { x: xx + 0.5, y: yy + 0.5 };
      }
  return null;
}

function ArmyEmbark(w, a) { // engine L6802-6825
  a.naval = true;
  const wp = FindWaterNear(w, a.x, a.y, 3);
  if (wp) { a.x = wp.x; a.y = wp.y; }
  let boarded = 0;
  for (const id of a.members) {
    const u = w.unitById.get(id);
    if (!u || u.boat) continue;
    if (FdHypot(u.x - a.x, u.y - a.y) < 5) {
      const ww = FindWaterNear(w, a.x, a.y, 4);
      if (ww) {
        u.boat = 1; u.boatTTL = 1600;
        u.x = ww.x + w.rng() - 0.5; u.y = ww.y + w.rng() - 0.5;
        u.lx = u.x; u.ly = u.y;
        boarded++;
      }
    }
  }
  if (boarded > 0 || a.members.length > 0) {
    w.AddEvent('army', `${a.name} 登船渡海，远征敌国（舰队 ${Math.max(boarded, 1)} 艘）`, w.civs[a.civ]?.colorHex, a.x, a.y);
  }
}

function ArmyDisembark(w, a) { // engine L6828-6847
  a.naval = false;
  const land = NearestStandable(w, Math.floor(a.x), Math.floor(a.y));
  a.x = land.x; a.y = land.y;
  let landed = 0;
  for (const id of a.members) {
    const u = w.unitById.get(id);
    if (!u) continue;
    if (u.boat || isWater(w.terrain[idx(Math.floor(u.x), Math.floor(u.y))])) {
      const s = NearestStandable(w, Math.floor(a.x) + ((w.rng() * 6) | 0) - 3, Math.floor(a.y) + ((w.rng() * 6) | 0) - 3);
      u.boat = 0; u.boatTTL = 0;
      u.x = s.x + 0.5; u.y = s.y + 0.5;
      u.lx = u.x; u.ly = u.y;
      landed++;
      w.Fx('spawn', u.x, u.y, 20);
    }
  }
  a.morale = Math.min(100, a.morale + 5);
  if (landed > 0) w.AddEvent('army', `${a.name} 的远征军抢滩登陆（${landed} 人上岸）`, w.civs[a.civ]?.colorHex, a.x, a.y);
}

function RoutArmy(w, a, triumph, tactical) { // engine L6850-6873
  if (a.state === 'retreat') return;
  a.state = 'retreat';
  a.clashWith = undefined;
  a.battleSince = undefined;
  a.morale = triumph ? Math.min(100, a.morale + 10) : tactical ? Math.max(45, a.morale) : Math.max(30, a.morale);
  if (triumph) {
    w.AddEvent('army', `${a.name} 大获全胜，凯旋归国（斩获 ${a.kills}，损失 ${a.losses}）`, w.civs[a.civ]?.colorHex, a.x, a.y);
  } else if (tactical) {
    w.AddEvent('army', `${a.name} 审时度势，战术转移后撤——保存建制，择机再战`, w.civs[a.civ]?.colorHex, a.x, a.y);
  } else {
    w.AddEvent('rout', `${a.name} 全军溃退！（尚存 ${a.members.length} 人）`, w.civs[a.civ]?.colorHex, a.x, a.y);
    w.shake = Math.max(w.shake, 3);
    for (const o of w.armies) {
      if (o === a || o.civ !== a.civ || o.state === 'retreat') continue;
      if (FdHypot(o.x - a.x, o.y - a.y) < 10) {
        o.morale = Math.max(10, o.morale - 12);
        if (w.rng() < 0.25) w.AddEvent('rout', `${a.name} 的溃败动摇了 ${o.name} 的军心`, w.civs[a.civ]?.colorHex, o.x, o.y);
      }
    }
  }
}

function DisbandArmy(w, a, quiet) { // engine L6876-6898
  const civ = w.civs[a.civ];
  for (const id of a.members) {
    const u = w.unitById.get(id);
    if (u && u.army === a.id) { u.army = null; u.boat = 0; u.boatTTL = 0; }
  }
  const ix = w.armies.indexOf(a);
  if (ix >= 0) w.armies.splice(ix, 1);
  if (civ) civ.armyCd = w.tickCount + ARMY_CD;
  if (!quiet && civ) {
    const msg = a.tactical
      ? `${a.name} 战术后撤归营整补（斩获 ${a.kills}，损失 ${a.losses}）——军旗未倒，随时再战`
      : `${a.name} 解散归田（战役斩获 ${a.kills}，损失 ${a.losses}）`;
    a.tactical = false;
    w.AddEvent('army', msg, civ.colorHex, a.x, a.y);
  }
  for (const o of w.armies) if (o.clashWith === a.id) { o.clashWith = undefined; if (o.state === 'battle') o.state = 'march'; }
}

function FrontPush(w, a, radius, power) { // engine L7270-7303
  const cx = Math.floor(a.x), cy = Math.floor(a.y);
  let pushed = 0;
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius + 1) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      const o = w.owner[i];
      if (o !== a.targetCiv) continue;
      if (!isLand(w.terrain[i]) || w.terrain[i] === T_MOUNTAIN) continue;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const pw = Math.max(1, Math.round(power * (1 - (dist / (radius + 1)) * 0.75)));
      if (w.occCiv[i] === a.civ) {
        const ns = Math.min(100, w.occStr[i] + pw + Math.floor(w.rng() * 3));
        if (ns >= 100 && w.occStr[i] < 100) FrontSolidify(w, i, a.civ);
        else w.occStr[i] = ns;
      } else if (w.occCiv[i] === -1 || w.occStr[i] < 25) {
        w.occCiv[i] = a.civ;
        w.occStr[i] = Math.max(4, Math.min(30, w.occStr[i] + pw));
        w.occSet.add(i);
      }
      pushed++;
    }
  return pushed;
}

function FrontSolidify(w, i, civId) { // engine L7306-7316
  w.occCiv[i] = -1;
  w.occStr[i] = 0;
  w.occSet.delete(i);
  const victim = w.owner[i];
  ClaimTile(w, i, civId);
  const wd = w.warData.get(pairKey(civId, victim));
  if (wd) {
    if (civId === wd.a) { wd.scoreA += 1; wd.occA += 1; } else { wd.scoreB += 1; wd.occB += 1; }
  }
}

function LeadAim(w, enemy, ttl) { // engine L4351-4358
  const vx = enemy.x - (enemy.lx ?? enemy.x);
  const vy = enemy.y - (enemy.ly ?? enemy.y);
  return {
    x: Math.max(0.5, Math.min(W - 0.5, enemy.x + vx * ttl + w.rng() * 0.4 - 0.2)),
    y: Math.max(0.5, Math.min(H - 0.5, enemy.y + vy * ttl + w.rng() * 0.4 - 0.2)),
  };
}

function IsRangedMember(w, u) { // engine L4361-4365（装备弓分支黄金无装备恒 false——C# 同注）
  if (u.job === 3) return true;
  if (u.wep === 'musket' || u.wep === 'rifle' || u.wep === 'laser_rifle') return true;
  return false;
}

function CastArrow(w, u, tx, ty, dmg) { // engine L4368-4370
  const e = w.Fx('arrow', Math.max(0.5, Math.min(W - 0.5, tx)), Math.max(0.5, Math.min(H - 0.5, ty)), 12, 0, u.civ);
  if (e) { e.x0 = u.x; e.y0 = u.y; }
}
function CastBullet(w, u, tx, ty, dmg) { // engine L4374-4377
  const e = w.Fx('bullet', Math.max(0.5, Math.min(W - 0.5, tx)), Math.max(0.5, Math.min(H - 0.5, ty)), 5, 0, u.civ);
  if (e) { e.x0 = u.x; e.y0 = u.y; }
  if (w.rng() < 0.12) { /* onSound no-op */ }
}
function CastBeam(w, u, tx, ty, dmg) { // engine L4381-4393
  const ex = Math.max(0.5, Math.min(W - 0.5, tx));
  const ey = Math.max(0.5, Math.min(H - 0.5, ty));
  const dx = ex - u.x, dy = ey - u.y;
  const dl = FdHypot(dx, dy) || 1;
  const ox = Math.max(0.5, Math.min(W - 0.5, ex + (dx / dl) * 1.2));
  const oy = Math.max(0.5, Math.min(H - 0.5, ey + (dy / dl) * 1.2));
  const e = w.Fx('laser', ox, oy, 8, undefined, u.civ); // 蓝本 opts 无 r → fx 默认 1
  if (e) { e.x0 = u.x; e.y0 = u.y; }
  if (w.rng() < 0.08) { /* onSound no-op */ }
}
function LaunchMech(w, c, fromX, fromY, tx, ty) { // engine L9551-9556
  const dist = FdHypot(tx - fromX, ty - fromY);
  if (dist < 4) return;
  const ttl = Math.max(40, Math.min(110, Math.round(dist * 1.2)));
  const dmg = 40 + w.rng() * 10;
  const e = w.Fx('mech', tx, ty, ttl, 2.2, c.id);
  if (e) { e.x0 = fromX; e.y0 = fromY; }
}
function AddCorpse(w, x, y, stone, undead) { // engine L2871-2875
  w.corpses.push({ x, y, age: 0, stone, undead });
  if (w.corpses.length > CORPSE_MAX) w.corpses.splice(0, w.corpses.length - CORPSE_MAX);
}
function WwCountKill(w, victim) { /* engine L8690——killCredit null + worldWar idle：no-op */ }

// ---------------- 黄金回放（fixture 重建 → 同驱动 → 逐位对账） ----------------
function f64bits(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}

function rebuild(sc) {
  const w = newWorld();
  w.rngA = sc.rngA0 >>> 0;             // 夹具后 rngA0（C# 同读黄金；gen 侧 setup 的 embark 零 rng——特判重放同语义）
  w.toastSeq = sc.toastSeq0;
  // terrain RLE
  let p = 0;
  for (let i = 0; i < sc.terrainRle.length; i += 2) {
    const run = sc.terrainRle[i], val = sc.terrainRle[i + 1];
    for (let k = 0; k < run; k++) w.terrain[p++] = val;
  }
  const fx = sc.fixture;
  for (const pt of fx.paint ?? []) {
    for (let y = pt[1]; y <= pt[3]; y++) for (let x = pt[0]; x <= pt[2]; x++) w.terrain[idx(x, y)] = pt[4];
  }
  for (const c of fx.civs ?? []) {
    const civ = {
      id: c.id, name: c.name ?? `C${c.id}`, race: c.race ?? 0, pop: c.pop ?? 0, houses: c.houses ?? 0, capital: c.capital ?? -1,
      alive: c.alive ?? true, gold: c.gold ?? 0, knowledge: c.knowledge ?? 0,
      armyCd: c.armyCd ?? 0, mobilizeUntil: c.mobilizeUntil, mergedInto: c.mergedInto,
      techs: c.techs ? [...c.techs] : [], research: c.research ?? null, researchP: c.researchP ?? 0,
      gov: c.gov ?? 0, govYear: 0, stability: c.stability ?? 70, culture: 0,
      militarism: 30, income: 0, expense: 0, festivalCd: 0,
      kingName: c.kingName ?? 'K', kingId: c.kingId, banner: c.banner ?? 'B',
      colorHex: c.colorHex ?? '#c83c3c', color: c.color ?? [200, 60, 60],
      tiles: c.tiles ? [...c.tiles] : [], frontier: c.frontier ? [...c.frontier] : [],
      colonizeCd: 0, popZeroTick: undefined, history: [], ideas: c.ideas ? [...c.ideas] : undefined,
    };
    w.civs.push(civ);
    w.civs[civ.id] = civ;
    w.civSeq = Math.max(w.civSeq, (civ.id ?? 0) + 1);
    for (const i of civ.tiles) w.owner[i] = civ.id;
  }
  for (const u of fx.units ?? []) {
    const uu = {
      id: u.id, race: u.race ?? 0, civ: u.civ ?? -1, x: u.x, y: u.y, tx: u.x, ty: u.y,
      hp: u.hp ?? 10, maxHp: u.hp ?? 10, dmg: u.dmg ?? 1, speed: u.speed ?? 1, age: 0, maxAge: 9999, kills: u.kills ?? 0,
      cd: 0, trait: 0, job: u.job ?? 0, king: u.king ?? 0, infected: 0, flip: 0,
      name: u.name ?? `u${u.id}`, hurt: 0, breath: 0, parity: 0, dead: u.dead ?? 0,
      boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0, caravan: 0, wep: u.wep ?? 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0,
      army: u.army ?? null, gene: null, food: 0, fam: 0, fgn: 0, gIds: [], gVal: [],
      lx: u.lx ?? u.x, ly: u.ly ?? u.y, atk: 0, tDmg: null, tHp: null,
    };
    w.units.push(uu);
    w.unitById.set(uu.id, uu);
  }
  for (const [a, b, v] of fx.rel ?? []) w.rel.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
  for (const [i, kind, civ] of fx.buildings ?? []) {
    const b = { i, x: i % W, y: (i / W) | 0, kind, civ };
    w.buildings.push(b);
    w.building = w.building || {};
    w.building[i] = kind;
    w.bHp.set(i, BUILDING_DEFS[kind]?.hp ?? 70);
    const cw = w.civs[civ];
    if (cw && kind !== BK.WALL) cw.houses++;
  }
  for (const [cid, cnt] of fx.civBuildCounts ?? []) w.civBuildCounts.set(cid, cnt);
  for (const d of fx.directives ?? []) {
    w.directives.push({ ...d });
    w.dirSeq = Math.max(w.dirSeq, (d.id ?? 0) + 1);
  }
  for (const wd of fx.wars ?? []) {
    w.warData.set(wd.key, {
      key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick ?? 0, startYear: wd.startYear ?? 0,
      total: wd.total ?? false, scoreA: wd.scoreA ?? 0, scoreB: wd.scoreB ?? 0, exA: wd.exA ?? 0, exB: wd.exB ?? 0,
      casA: wd.casA ?? 0, casB: wd.casB ?? 0, razedA: 0, razedB: 0, battles: wd.battles ?? 0,
      giveUpAt: wd.giveUpAt ?? 0, reason: wd.reason ?? 'border', reasonText: wd.reasonText ?? '',
      aggressor: wd.aggressor ?? 0, goal: wd.goal ?? 0, goalNow: 0, occA: wd.occA ?? 0, occB: wd.occB ?? 0,
      popA0: wd.popA0 ?? 0, popB0: wd.popB0 ?? 0, lastActiveTick: wd.lastActiveTick ?? 0,
    });
  }
  for (const ar of fx.armies ?? []) {
    const a = {
      id: ar.id, civ: ar.civ, name: ar.name ?? `A${ar.id}`, members: [...(ar.members ?? [])],
      leaderId: ar.leaderId ?? (ar.members?.[0] ?? -1), x: ar.x ?? 0, y: ar.y ?? 0, tx: ar.tx ?? ar.x ?? 0, ty: ar.ty ?? ar.y ?? 0,
      state: ar.state ?? 'rally', morale: ar.morale ?? 1, kills: ar.kills ?? 0, losses: ar.losses ?? 0,
      tactical: ar.tactical ?? false, clashWith: ar.clashWith,
      naval: ar.naval ?? false, ambush: ar.ambush ?? false, formedTick: ar.formedTick ?? 0,
      size0: ar.size0 ?? (ar.members?.length ?? 0), battleSize0: ar.battleSize0 ?? null,
      evalTick: ar.evalTick ?? 0, targetCiv: ar.targetCiv ?? -1, rot: ar.rot ?? 0,
      marchPushTick: ar.marchPushTick ?? null, supplyWarned: ar.supplyWarned ?? false,
      reinforced: ar.reinforced ?? null, battleSince: ar.battleSince ?? null,
    };
    w.armies.push(a);
    for (const uid of a.members) {
      const u = w.unitById.get(uid);
      if (u) u.army = a.id;
    }
    w.armySeq = Math.max(w.armySeq, (a.id ?? 0) + 1);
  }
  // setup 重放（黄金 JSON 无法序列化函数——按场景名特判；gen 侧 setup 在 eventSeq0 快照前 → 重放后归位）
  if (sc.name === 'ARM15-naval-crossing') {
    ArmyEmbark(w, w.armies[0]);   // 成员预置 boat → 零 rng 消耗（与黄金 rngA0 语义一致）
  }
  w.tickCount = sc.startTick ?? 0;
  w.effects.length = 0;
  w.worldEvents.length = 0;
  w.eventSeq = sc.eventSeq0;           // 与 gen 同款：setup 后重置事件基线（embark 纪事 id 随清空失效）
  w.__lastEventId = w.eventSeq;
  return w;
}

// dump（与 gen buildTrace 同构——镜像侧独立实现）
function traceOf(w, k) {
  const evs = w.worldEvents.filter((e) => e.id >= (w.__lastEventId ?? 0));
  w.__lastEventId = w.eventSeq;
  return {
    tick: k,
    rngA: w.rngA >>> 0,
    tickCount: w.tickCount,
    civs: w.civs.filter(Boolean).map((c) => ({
      id: c.id, name: c.name, race: c.race, pop: c.pop, houses: c.houses, capital: c.capital,
      alive: c.alive, gold: c.gold ?? null, knowledge: c.knowledge ?? null,
      armyCd: c.armyCd ?? null, mobilizeUntil: c.mobilizeUntil === undefined ? null : c.mobilizeUntil,
      gov: c.gov ?? null, stability: c.stability ?? null,
      kingId: c.kingId === undefined ? null : c.kingId, kingName: c.kingName, banner: c.banner,
      colorHex: c.colorHex, color: c.color,
      tiles: [...c.tiles], frontier: [...c.frontier],
    })),
    buildings: w.buildings.map((b) => ({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: b.civ })),
    bHp: [...w.bHp.entries()],
    civBuildCounts: [...w.civBuildCounts.entries()].map(([k2, v]) => [k2, [...v]]),
    rel: [...w.rel.entries()],
    killCredit: w.killCredit === undefined || w.killCredit == null ? null : w.killCredit,
    warData: [...w.warData.values()].map((wd) => ({ key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick, startYear: wd.startYear, total: wd.total,
      aggressor: wd.aggressor, reason: wd.reason, reasonText: wd.reasonText, goal: wd.goal,
      giveUpAt: wd.giveUpAt, popA0: wd.popA0, popB0: wd.popB0, lastActiveTick: wd.lastActiveTick,
      scoreA: wd.scoreA ?? 0, scoreB: wd.scoreB ?? 0, battles: wd.battles ?? 0,
      casA: wd.casA ?? 0, casB: wd.casB ?? 0, exA: wd.exA ?? 0, exB: wd.exB ?? 0,
      occA: wd.occA ?? 0, occB: wd.occB ?? 0 })),
    units: w.units.map((u) => ({
      id: u.id, name: u.name, race: u.race, civ: u.civ,
      x: f64bits(u.x), y: f64bits(u.y), tx: f64bits(u.tx), ty: f64bits(u.ty),
      hp: f64bits(u.hp), maxHp: f64bits(u.maxHp), dmg: f64bits(u.dmg), speed: f64bits(u.speed),
      job: u.job ?? 0, king: u.king ? 1 : 0, boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0,
      army: u.army === undefined ? null : u.army, hurt: f64bits(u.hurt ?? 0), dead: u.dead ? 1 : 0,
      wep: u.wep ?? 0, lx: f64bits(u.lx ?? u.x), ly: f64bits(u.ly ?? u.y),
    })),
    armies: w.armies.map((a) => ({
      id: a.id, civ: a.civ, name: a.name, members: [...a.members], leaderId: a.leaderId,
      x: f64bits(a.x), y: f64bits(a.y), tx: f64bits(a.tx), ty: f64bits(a.ty), state: a.state,
      morale: f64bits(a.morale), kills: a.kills, losses: a.losses, tactical: a.tactical ?? false,
      clashWith: a.clashWith === undefined ? null : a.clashWith,
      naval: a.naval === true ? true : undefined,
      ambush: a.ambush === true ? true : undefined,
      formedTick: a.formedTick ?? null, size0: a.size0 ?? null,
      battleSize0: a.battleSize0 === undefined ? null : a.battleSize0,
      evalTick: a.evalTick ?? null, targetCiv: a.targetCiv ?? null, rot: f64bits(a.rot ?? 0),
      marchPushTick: a.marchPushTick === undefined ? null : a.marchPushTick,
      supplyWarned: a.supplyWarned === true ? true : undefined,
      reinforced: a.reinforced === undefined ? null : a.reinforced,
      battleSince: a.battleSince === undefined ? null : a.battleSince,
    })),
    effects: w.effects.map((e) => ({ kind: e.kind, x: f64bits(e.x), y: f64bits(e.y), x0: f64bits(e.x0), y0: f64bits(e.y0), r: f64bits(e.r), age: f64bits(e.age), ttl: f64bits(e.ttl), seed: e.seed, dir: f64bits(e.dir) })),
    newEvents: evs.map((ev) => ({ id: ev.id, year: ev.year, kind: ev.kind, text: ev.text, colorHex: ev.colorHex ?? null, x: ev.x === undefined || ev.x === null ? null : f64bits(ev.x), y: ev.y === undefined || ev.y === null ? null : f64bits(ev.y) })),
    toasts: w.toasts.splice(0, w.toasts.length).map((t) => ({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null })),
    corpses: w.corpses.map((c) => ({ x: f64bits(c.x), y: f64bits(c.y), stone: c.stone ? 1 : 0, undead: c.undead ? 1 : 0 })),
    shake: f64bits(w.shake ?? 0),
    armySeq: w.armySeq ?? 0,
    armyNameSeq: [...w.armyNameSeq.entries()],
    lastClashEventTick: w.lastClashEventTick ?? null,
    lastVolleyEventTick: w.lastVolleyEventTick ?? null,
    lastReinforceEventTick: w.lastReinforceEventTick ?? null,
  };
}

function snapState(w) {
  return { owner: Array.from(w.owner), occCiv: Array.from(w.occCiv), occStr: Array.from(w.occStr) };
}
function diffArr(prev, cur) {
  const out = [];
  const n = Math.max(prev?.length ?? 0, cur.length);
  for (let i = 0; i < n; i++) {
    const a = prev?.[i], b = cur[i];
    if (a !== b) out.push([i, b]);
  }
  return out;
}
export { replayScenario, rebuild };

function replayScenario(sc) {
  const w = rebuild(sc);
  const traces = [];
  let prev = snapState(w);
  for (let k = 0; k < sc.ticks; k++) {
    if (w.tickCount % 5 === 0) ArmyTick(w); // 宿主协议 engine L2561
    w.tickCount++;
    const s2 = snapState(w);
    const tr = traceOf(w, k);
    tr.ownerDiff = diffArr(prev?.owner, s2.owner);
    tr.occCivDiff = diffArr(prev?.occCiv, s2.occCiv);
    tr.occStrDiff = diffArr(prev?.occStr, s2.occStr);
    traces.push(tr);
    prev = s2;
  }
  return traces;
}

// ---------------- 对账 ----------------
function cmp(a, b, path, fails) {
  const ta = typeof a, tb = typeof b;
  if (ta !== tb) { fails.push(`${path}: type ${ta} vs ${tb}`); return; }
  if (ta === 'object' && a !== null && b !== null) {
    if (Array.isArray(a) !== Array.isArray(b)) { fails.push(`${path}: arr mismatch`); return; }
    if (Array.isArray(a)) {
      if (a.length !== b.length) { fails.push(`${path}: len ${a.length} vs ${b.length}`); return; }
      for (let i = 0; i < a.length; i++) cmp(a[i], b[i], `${path}[${i}]`, fails);
    } else {
      const ka = Object.keys(a).filter((k) => a[k] !== undefined);
      const kb = Object.keys(b).filter((k) => b[k] !== undefined);
      if (ka.length !== kb.length) { fails.push(`${path}: keys ${ka.length} vs ${kb.length}`); return; }
      for (const k of ka) cmp(a[k], b[k], `${path}.${k}`, fails);
    }
    return;
  }
  if (a !== b) fails.push(`${path}: ${JSON.stringify(a)?.slice(0, 40)} vs ${JSON.stringify(b)?.slice(0, 40)}`);
}

// ---------------- main ----------------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  let total = 0, failScen = 0;
  const failures = [];
  for (const sc of gold.scenarios) {
    const got = replayScenario(sc);
    const want = sc.traces;
    const fails = [];
    if (got.length !== want.length) fails.push(`trace len ${got.length} vs ${want.length}`);
    else {
      for (let k = 0; k < got.length; k++) cmp(got[k], want[k], `t${k}`, fails);
    }
    total++;
    if (fails.length) {
      failScen++;
      failures.push(`[FAIL] ${sc.name}: ${fails.length} diffs\n  ${fails.slice(0, 6).join('\n  ')}`);
    }
  }
  for (const f of failures) console.log(f);
  console.log(`[transcript] ${total - failScen}/${total} scenarios 逐位对账 ${failScen === 0 ? 'ALL PASS' : 'FAIL'}`);
  if (failScen > 0) process.exit(1);
}
