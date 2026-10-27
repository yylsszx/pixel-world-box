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
const idx = (x, y) => y * W + x; // constants.ts 同款（M-U3c wallTick/殖民船/建国扫描用）
const isWater = (t) => t === T_DEEP || t === T_WATER;
const isLand = (t) => t !== T_DEEP && t !== T_WATER && t !== T_LAVA;
const buildable = (t) => t === T_GRASS || t === T_SAND || t === T_HILL || t === T_SNOW || t === T_BURNT || t === T_FOREST;

const FX_MINOR = new Set(['dmg', 'hit', 'smoke', 'spawn', 'heart', 'skull', 'arrow', 'coin', 'blood', 'dust']);

// RACE_REL_BASE（WbWorld.BuildRACE_REL_BASE 同表）
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
    // M-U3c 战争/联盟/图谱域（C# WbWorld 新字段同构）
    warData: new Map(), totalWars: new Set(), warShame: new Map(), warHistory: [],
    raceRel: new Map(), statWars: 0,
    armies: [], worldWar: { phase: 'idle', belligerents: [], fallen: [] },
    allianceOf: new Map(), allianceWarCd: new Map(), allianceSeq: 1, civSeq: 0,
    // M-U3d 旨意/理念域（C# WbWorld 同构）
    dirSeq: 1, victoryCiv: null, lastCatastropheTick: -999999, zombieOutbreakNoted: false,
    emIdeas: new Map(), ideaSeq: 1, ideaModCache: new Map(),
    overlayMode: 'none', overlayDirty: true,
    evoNodes: [], evoSeq: 0, evoIndex: new Map(),
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
  const v = w.raceRel.get(key);
  if (v !== undefined) return v; // raceRel Map（f64）优先——M-U3c shiftRaceRel 写入
  return RACE_REL_BASE[key] ?? 0;
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
// ---------------- M-U3c 全量镜像（WbCivSim.cs 机械翻译同构） ----------------
const JOBS_MUL = [
  { hp: 1, dmg: 1, speed: 1 }, { hp: 0.95, dmg: 0.9, speed: 1 }, { hp: 1.3, dmg: 1.35, speed: 1.05 },
  { hp: 1.05, dmg: 1.15, speed: 1 }, { hp: 1.15, dmg: 0.95, speed: 1.05 }, { hp: 1, dmg: 0.9, speed: 1.2 },
  { hp: 1.25, dmg: 1.1, speed: 1 }, { hp: 1.5, dmg: 1.5, speed: 1 },
];
const JOB_KING = 7;
const RACES_IS_CIV = [true, true, true, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, true, true, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false];
const isCivRace = (r) => r >= 0 && r < RACES_IS_CIV.length && RACES_IS_CIV[r];
const RACE_GREED = { 0: 0.45, 1: 0.25, 2: 0.7, 3: 0.65, 19: 0.4, 20: 0.8 };
const raceGreed = (r) => (r in RACE_GREED ? RACE_GREED[r] : 0.5);
const CIV_COLORS = [[219, 62, 47], [255, 176, 32], [64, 182, 133], [214, 84, 200], [240, 238, 232], [255, 106, 76], [146, 200, 62], [230, 140, 200], [120, 200, 200], [240, 170, 60], [200, 220, 120], [250, 100, 150]];
const CASUS_LEVEL = { border: -45, conquest: -70, plunder: -55, revenge: -65, rebel: -80, annex: -90, unify: -85, holy: -90, alliance: -50 };
const CASUS_LABEL = { border: '边境战争', conquest: '征服战争', plunder: '劫掠战争', revenge: '复仇战争', rebel: '叛乱战争', annex: '灭国战争', unify: '统一战争', holy: '圣战', alliance: '盟约战争' };
const DIRECTIVE_LABEL = { annihilate: '灭国令', conquer: '攻城令', expand: '扩张令', wealth: '富国令', wisdom: '启智令', populate: '人口令', legion: '军团令', build: '建城令', unify: '统一令', mobilize: '总动员令', alliance: '联盟令', temple: '信仰令' };
const ARMY_CD = 900;
// WbNames.cs 镜像（names.ts 全池）
const FIRST = {
  0: ['Alric', 'Berta', 'Corin', 'Dahlia', 'Edwin', 'Faye', 'Gareth', 'Hilda', 'Ivan', 'Jora', 'Kelvin', 'Lyra', 'Marcus', 'Nora', 'Osric', 'Petra'],
  1: ['Aelar', 'Briel', 'Caelum', 'Dain', 'Elowen', 'Faelis', 'Galad', 'Haldir', 'Ithil', 'Laucian', 'Mirelle', 'Naivara', 'Orophin', 'Priami', 'Riardon', 'Sylvar'],
  2: ['Adrik', 'Balgor', 'Brunhild', 'Dolgrim', 'Durik', 'Edvana', 'Farga', 'Grimli', 'Harbek', 'Ingvar', 'Karrak', 'Morgran', 'Norgra', 'Oskar', 'Thrain', 'Ulfgar'],
  3: ['Ashgar', 'Brug', 'Durok', 'Gashnak', 'Grum', 'Hargor', 'Kargh', 'Mok', 'Nargul', 'Ogrum', 'Rukk', 'Shagrat', 'Thokk', 'Uglok', 'Vrag', 'Zugor'],
  4: ['Raven', 'Vex', 'Crow', 'Shade', 'Fang', 'Dirk', 'Whisper', 'Krait'],
  5: ['Rot', 'Shamble', 'Gnaw', 'Groan', 'Lurch', 'Decay'],
  6: ['Wooly', 'Fluff', 'Baaald', 'Shears', 'Cloud', 'Tumble'],
  7: ['Fenrir', 'Grey', 'Howl', 'Fang', 'Shadow', 'Nip'],
  8: ['Bruno', 'Kodiak', 'Ursa', 'Grizzle', 'Paw', 'Claw'],
  9: ['Smaug', 'Ancalagon', 'Glaurung', 'Firnaki', 'Vermithor', 'Balerion'],
  10: ['Bambi', 'Fawn', 'Dash', 'Clover', 'Willow', 'Bramble', 'Hazel', 'Sorrel'],
  11: ['Pingu', 'Waddle', 'Chilly', 'Tux', 'Frostie', 'Pebble', 'Skipper', 'Noot'],
  12: ['Sahara', 'Dune', 'Humpy', 'Oasis', 'Sandy', 'Caravan', 'Mirage', 'Nabd'],
  13: ['Sting', 'Venom', 'Skitter', 'Pincer', 'Sable', 'Rust', 'Barb', 'Flick'],
  14: ['Hiss', 'Coil', 'Slither', 'Sidewind', 'Mamba', 'Viper', 'Rattle', 'Adder'],
  15: ['Frost', 'Blizzard', 'Avalanche', 'Snowcap', 'Glacia', 'Arctic', 'Polar', 'Yuki', 'Tundra', 'Rime'],
  16: ['Bones', 'Rattle', 'Marrow', 'Creak', 'Skull', 'Grin', 'Clatter', 'Dust', 'Hollow', 'Grim'],
  17: ['Azgor', 'Balroth', 'Mephisto', 'Vulgrim', 'Xaroth', 'Infernus', 'Malgor', 'Pyros', 'Zagan', 'Nihil'],
  18: ['Zarkon', 'Merlyn', 'Alazar', 'Drahcir', 'Vexis', 'Ozric', 'Thulsa', 'Ravenor', 'Kaldor', 'Sarquiss'],
  19: ['Sszar', 'Hsska', 'Zsthax', 'Kressh', 'Vissith', 'Slithis', 'Grix', 'Xessk', 'Thassk', 'Narsss', 'Skarn', 'Veshk'],
  20: ['Grizzik', 'Snik', 'Zog', 'Nix', 'Rikt', 'Pob', 'Grib', 'Skab', 'Wix', 'Trug', 'Miz', 'Krag', 'Splug', 'Yark'],
  21: ['Grolk', 'Ungo', 'Karnn', 'Brogg', 'Zull', 'Morgg', 'Durn', 'Skalgg', 'Hrukk', 'Vorn', 'Tuskarr', 'Grumb'],
  22: ['Gnash', 'Chomper', 'Bruuz', 'Gulp', 'Mawg', 'Krunch', 'Slogg', 'Bite', 'Gorge', 'Tumm', 'Snack', 'Devour'],
  23: ['Kael', 'Noctis', 'Vhorn', 'Icethorn', 'Sorrow', 'Winterborn', 'Grim', 'Pale', 'Nihils', 'Rime', 'Hoarfrost', 'Shiver'],
  24: ['Dracul', 'Carmilla', 'Alucard', 'Nosferu', 'Vlad', 'Lestat', 'Sanguine', 'Nocturn', 'Vesper', 'Morwenna', 'Bloodwyn', 'Duskryn'],
  25: ['Nessie', 'Abyssus', 'Scylla', 'Charyb', 'Tentacl', 'Inkblot', 'Maelstr', 'Leviath', 'Briney', 'Krakenor', 'Drench', 'Umiboz'],
  26: ['Shai', 'Hulud', 'Ggrukkk', 'Wyrmoid', 'Sandst', 'Dunerig', 'Tremorr', 'Borewor', 'Grainma', 'Siftjaw', 'Cyclura', 'Migon'],
  27: ['Medusae', 'Cockatri', 'Gorgon', 'Basilio', 'Sserqet', 'Venomax', 'Stareye', 'Scalecr', 'Hissra', 'Stonega', 'Najar', 'Sibyl'],
};
const KINGDOM_PRE = ['Iron', 'Storm', 'Ember', 'Frost', 'Gold', 'Silver', 'Thorn', 'Wolfs', 'Raven', 'Oak', 'Star', 'Sun', 'Moon', 'Stone', 'Wind', 'Mist', 'Dawn', 'Dusk', 'Crystal', 'Thunder'];
const KINGDOM_SUF = ['hold', 'gard', 'fell', 'mere', 'burg', 'haven', 'shire', 'crest', 'vale', 'watch', 'forge', 'rest', 'moor', 'spire', 'reach'];
const BANNERS = ['狮', '狼', '鹰', '鹿', '熊', '龙', '蛇', '鱼', '虎', '鸦', '马', '牛', '羊', '狐', '豹', '鲸'];
function roman(n) {
  if (n < 1 || n > 40) return String(n);
  const table = [[40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '', v = n;
  for (const [val, sym] of table) while (v >= val) { out += sym; v -= val; }
  return out.toUpperCase();
}
function unitName(race, w) {
  const pool = FIRST[race] ?? FIRST[0];
  return pool[Math.floor(Rng(w) * pool.length)];
}
function civName(w) {
  const pre = KINGDOM_PRE[Math.floor(Rng(w) * KINGDOM_PRE.length)];
  const suf = KINGDOM_SUF[Math.floor(Rng(w) * KINGDOM_SUF.length)];
  const banner = BANNERS[Math.floor(Rng(w) * BANNERS.length)];
  return { name: pre + suf, banner };
}
// JsRound C# = Math.Floor(x + 0.5) —— 镜像同名（蓝本 Math.round 半升语义）
const jsRound = (x) => Math.floor(x + 0.5);

function SetJob(w, u, job) {
  if (!isCivRace(u.race) || job < 0 || job >= JOBS_MUL.length) return;
  const oldJ = JOBS_MUL[u.job];
  const nw = JOBS_MUL[job];
  u.hp = Math.max(1, jsRound((u.hp * nw.hp) / oldJ.hp));
  u.maxHp = Math.max(1, jsRound((u.maxHp * nw.hp) / oldJ.hp));
  u.dmg = (u.dmg * nw.dmg) / oldJ.dmg;
  u.speed = (u.speed * nw.speed) / oldJ.speed;
  u.job = job;
}
function UniqueName(w, race) {
  const base = unitName(race, w);
  const bl = base.length;
  let n = 0;
  for (const u of w.units) {
    if (u.dead) continue;
    const nm = u.name;
    if (nm === base || (nm.length > bl && nm.charCodeAt(bl) === 32 && nm.startsWith(base))) n++;
  }
  return n === 0 ? base : `${base} ${roman(n + 1)}`;
}
function civNameClash(w, name) { return w.civs.some((c) => c && c.alive && c.name === name); }
function CreateCiv(w, race, x, y) {
  let { name, banner } = civName(w);
  for (let t = 0; t < 8 && civNameClash(w, name); t++) ({ name, banner } = civName(w));
  if (civNameClash(w, name)) {
    let n = 1;
    while (civNameClash(w, `${name} ${roman(n + 1)}`)) n++;
    name = `${name} ${roman(n + 1)}`;
  }
  const color = CIV_COLORS[w.civSeq % CIV_COLORS.length];
  const civ = {
    id: w.civSeq++, name, race, color, colorHex: `#${color.map((c) => c.toString(16).padStart(2, '0')).join('')}`,
    pop: 0, tiles: [], frontier: [], houses: 0, capital: -1,
    kingName: UniqueName(w, race), alive: true, banner, colonizeCd: 0, popZeroTick: undefined,
    history: [], gold: 0, knowledge: 0, armyCd: undefined, mobilizeUntil: undefined, mergedInto: undefined,
    techs: [], research: null, researchP: 0, gov: 0, govYear: Math.floor(w.yearF),
    stability: 70, culture: 0, militarism: 30, income: 0, expense: 0, festivalCd: 0,
    kingId: undefined, kingName2: undefined,
  };
  delete civ.kingName2;
  w.civs.push(civ);
  w.civs[civ.id] = civ;
  // find capital spot（半径扩到 5）
  let cap = -1;
  outer: for (let r = 0; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = Math.floor(x) + dx, yy = Math.floor(y) + dy;
        if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
        const i = idx(xx, yy);
        if (buildable(w.terrain[i]) && w.building[i] === 0) { cap = i; break outer; }
      }
    }
  }
  if (cap >= 0) { BuildBuilding(w, cap, 2, civ.id); civ.capital = cap; }
  const anchor = cap >= 0 ? cap : idx(Math.floor(x), Math.floor(y));
  const cx = anchor % W, cy = (anchor / W) | 0;
  SeedTerritory(w, civ, cx, cy);
  Toast(w, `${RACES_NAME[race]}王国「${name}」建立了`, 'good');
  AddEvent(w, 'found', `${RACES_NAME[race]}王国「${name}」建立了，国王 ${civ.kingName} 加冕`, civ.colorHex, cap >= 0 ? WbTileX(cap) : x, cap >= 0 ? WbTileY(cap) : y);
  return civ.id;
}
const WbTileX = (i) => i % W;
const WbTileY = (i) => (i / W) | 0;
function CrownUnit(w, civ, u, announce) {
  if (!civ.alive || u.dead !== 0 || u.civ !== civ.id || !isCivRace(u.race)) return;
  if (u.king !== 0 && civ.kingId === u.id) return;
  u.king = 1;
  SetJob(w, u, JOB_KING);
  civ.kingId = u.id;
  civ.kingName = u.name;
  if (announce) {
    AddEvent(w, 'king', `${u.name} 在「${civ.name}」的臣民拥戴下加冕为王`, civ.colorHex, u.x, u.y);
    Toast(w, `「${civ.name}」新王 ${u.name} 加冕`, 'good');
  }
}
function CrownVacantTick(w) {
  for (const civ of w.civs) {
    if (!civ || !civ.alive || civ.pop <= 0) continue;
    const kid = civ.kingId;
    if (kid != null && kid !== -1) {
      const cur = w.unitById.get(kid);
      if (cur && !cur.dead && cur.king && cur.civ === civ.id) continue;
    }
    const succession = kid === -1;
    let best = null, bestScore = -1;
    for (const u of w.units) {
      if (u.dead || u.civ !== civ.id || u.boat) continue;
      const job = u.job ?? 0;
      const score = (job === 6 ? 3 : job === 2 || job === 3 ? 2 : job === 5 ? 1.5 : 1) + Rng(w) * 0.9;
      if (score > bestScore) { bestScore = score; best = u; }
    }
    if (best) CrownUnit(w, civ, best, succession);
  }
}
function WallTick(w) {
  const cost = defCost(BK.WALL);
  for (const civ of w.civs) {
    if (!civ || !civ.alive || civ.pop < 8 || civ.capital < 0) continue;
    if (!(civ.techs ?? []).includes('fortification')) continue;
    if ((civ.gold ?? 0) < cost) continue;
    const cx = WbTileX(civ.capital), cy = WbTileY(civ.capital);
    const radius = Math.min(5, 3 + Math.floor(civ.houses / 14));
    const gaps = [];
    for (let k = 0; k < 72; k++) {
      const ang = (k / 72) * Math.PI * 2;
      const xx = jsRound(cx + Math.cos(ang) * radius);
      const yy = jsRound(cy + Math.sin(ang) * radius);
      if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
      const i = idx(xx, yy);
      if (w.building[i] > 0) continue;
      if (w.owner[i] !== civ.id) continue;
      const tt = w.terrain[i];
      if (!buildable(tt) || tt === T_FOREST) continue;
      gaps.push(i);
    }
    if (gaps.length === 0 || gaps.length <= 3) continue;
    let built = 0;
    for (const i of gaps) {
      if (built >= 3) break;
      if ((civ.gold ?? 0) < cost) break;
      BuildBuilding(w, i, BK.WALL, civ.id);
      civ.gold = (civ.gold ?? 0) - cost;
      built++;
    }
    if (built > 0) {
      const b0 = w.buildings[w.bIdx.get(gaps[0]) ?? -1];
      if (b0) Fx(w, 'hammer', b0.x + 0.5, b0.y + 0.5, 14);
    }
  }
}
function WallDefenseOf(w, u) {
  if (u.civ < 0) return 1;
  const x = Math.floor(u.x), y = Math.floor(u.y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const i = idx(xx, yy);
    if (w.building[i] !== BK.WALL) continue;
    const b = w.buildings[w.bIdx.get(i) ?? -1];
    if (b && b.civ === u.civ) return 0.72;
  }
  return 1;
}

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
  // —— 终极世界大战：参战国覆灭追记（M-U3c 补段，C# 同构）——
  if (w.worldWar.phase === 'running' && w.worldWar.belligerents.includes(civ.id) && !w.worldWar.fallen.some((f) => f.id === civ.id)) {
    w.worldWar.fallen.push({ id: civ.id, name: civ.name, colorHex: civ.colorHex });
    const remain = w.worldWar.belligerents.length - w.worldWar.fallen.length;
    AddEvent(w, 'worldwar', `「${civ.name}」退出终极世界大战——还剩 ${remain} 面旗帜在战场上飘扬`, civ.colorHex);
  }
  // —— 军团随之覆灭（静默解散）——
  for (const a of [...w.armies]) if (a.civ === civ.id) DisbandArmy(w, a, true);
  // —— 战争档案清理 ——
  for (const key of [...w.warData.keys()]) {
    const dash = key.indexOf('-');
    const x = +key.slice(0, dash), y = +key.slice(dash + 1);
    if (x === civ.id || y === civ.id) w.warData.delete(key);
  }
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

const RACES_NAME = ['人类', '精灵', '矮人', '兽人', '强盗', '僵尸', '绵羊', '狼', '熊', '巨龙', '鹿', '企鹅', '骆驼', '蝎子', '蛇', '雪狼', '骷髅', '恶魔', '法师', '蜥蜴人', '哥布林', '巨魔', '食人魔', '白行者', '吸血鬼', '克拉肯', '沙虫', '蛇怪', '天使', '凤凰', '树人', '巫妖', '九头蛇', '鸡', '猪', '兔', '狐', '鱼', '蟹', '龟', '鲨鱼'];

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
  const RACES_DIPLO_MAP = { 0: 0.65, 1: 0.45, 2: 0.4, 3: 0.15, 19: 0.35, 20: 0.3 };
  const da = ca.race in RACES_DIPLO_MAP ? RACES_DIPLO_MAP[ca.race] : 0.5;
  const db = cb.race in RACES_DIPLO_MAP ? RACES_DIPLO_MAP[cb.race] : 0.5;
  const raceDiplo = (da + db) / 2;
  const warChance = Math.max(0.08, Math.min(0.8,
    0.2 + ((ca.militarism ?? 30) + (cb.militarism ?? 30)) / 400.0
    + ((ca.gov === 4 || cb.gov === 4) ? 0.1 : 0)
    - ((ca.gov === 3 || cb.gov === 3) ? 0.12 : 0)
    - (raceDiplo - 0.5) * 0.3));
  if (w.laws.wars && Rng(w) < warChance) {
    const pick = PickCasus(w, ca, cb);
    DeclareWar(w, pick.aggressor.id, pick.victim.id, pick.reason);
    return;
  } else {
    const rr = RaceRelOf(w, ca.race, cb.race); // f64（raceRel Map 可存小数）
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
function FindWaterNear(w, x, y, r) {
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let ring = 1; ring <= r; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;
      const i = idx(xx, yy);
      if (!isWater(w.terrain[i])) continue;
      let waterN = 0;
      for (let ny = -1; ny <= 1; ny++) for (let nx = -1; nx <= 1; nx++) {
        if (nx === 0 && ny === 0) continue;
        if (isWater(w.terrain[idx(xx + nx, yy + ny)])) waterN++;
      }
      if (waterN >= 5) return { x: xx + 0.5, y: yy + 0.5 };
    }
  }
  return null;
}
function FindColonyTarget(w, x, y) {
  for (let k = 0; k < 40; k++) {
    const ang = Rng(w) * Math.PI * 2;
    const dist = 25 + Rng(w) * 60;
    const xx = Math.floor(x + Math.cos(ang) * dist);
    const yy = Math.floor(y + Math.sin(ang) * dist);
    if (xx < 2 || yy < 2 || xx >= W - 2 || yy >= H - 2) continue;
    const i = idx(xx, yy);
    if (w.owner[i] === -1 && w.building[i] === 0 && buildable(w.terrain[i])) return { x: xx + 0.5, y: yy + 0.5 };
  }
  return null;
}
function TryLaunchColonyShip(w, civ) {
  // 无论成败先进入冷却（600-1200 tick ≈ 15-30 年；航海科技缩短间隔）
  const colMul = TechModsOf(w, civ.id).col;
  civ.colonizeCd = w.tickCount + Math.max(220, jsRound((600 + Math.floor(Rng(w) * 600)) * colMul));
  const cand = w.units.filter((u) => !u.dead && u.civ === civ.id && !u.boat);
  if (cand.length < 6) return false;
  const u = cand[Math.floor(Rng(w) * cand.length)];
  const water = FindWaterNear(w, u.x, u.y, 8);
  if (!water) return false;
  const target = FindColonyTarget(w, u.x, u.y);
  if (!target) return false;
  u.boat = 1;
  u.boatTTL = 1200;
  u.x = water.x; u.y = water.y;
  u.tx = target.x; u.ty = target.y;
  u.hp = Math.min(u.maxHp, u.hp + 20);
  Fx(w, 'spawn', water.x, water.y, 30);
  AddEvent(w, 'colonize', `「${civ.name}」的殖民船扬帆启航，驶向未知的大海`, civ.colorHex, water.x, water.y);
  Toast(w, `「${civ.name}」的殖民船启航了`, 'info');
  return true;
}
function SplitKingdom(w, civ) {
  if (civ.capital < 0 || civ.tiles.length === 0) return;
  const capX = WbTileX(civ.capital), capY = WbTileY(civ.capital);
  let anchor = null, bestD = 14;
  for (const b of w.buildings) {
    if (b.civ !== civ.id) continue;
    const d = Math.hypot(b.x - capX, b.y - capY);
    if (d > bestD) { bestD = d; anchor = b; }
  }
  if (!anchor) return;
  const newId = CreateCiv(w, civ.race, anchor.x + 0.5, anchor.y + 0.5);
  const rebel = civAt(w, newId);
  if (!rebel) return;
  const keep = [];
  for (const i of civ.tiles) {
    if (w.owner[i] !== civ.id) continue;
    const x = WbTileX(i), y = WbTileY(i);
    if (Math.hypot(x - anchor.x, y - anchor.y) <= 9) {
      w.owner[i] = rebel.id;
      rebel.tiles.push(i);
      MarkDirty(w, i);
    } else keep.push(i);
  }
  civ.tiles = keep;
  const bi = w.bIdx.get(anchor.i);
  if (bi !== undefined) {
    const b = w.buildings[bi];
    if (b.civ === civ.id) { b.civ = rebel.id; civ.houses--; rebel.houses++; }
  }
  let moved = 0;
  for (const u of w.units) {
    if (u.dead || u.civ !== civ.id || u.boat) continue;
    if (Math.hypot(u.x - anchor.x, u.y - anchor.y) <= 9) { u.civ = rebel.id; moved++; }
  }
  civ.pop -= moved;
  rebel.pop += moved;
  DeclareWar(w, civ.id, rebel.id, 'rebel', { force: true });
  if (w.overlayMode === 'political' || w.overlayMode === 'alliance') w.overlayDirty = true;
}
function MergeCivs(w, a, b, cause) {
  if (!a.alive || !b.alive || a.id === b.id) return false;
  const power = (c) => c.pop * 2 + (c.gold ?? 0) * 0.6 + w.armies.filter((x) => x.civ === c.id).length * 30 + c.tiles.length;
  const keep = power(a) >= power(b) ? a : b;
  const gone = keep === a ? b : a;
  const newTiles = [];
  for (const i of gone.tiles) {
    if (w.owner[i] === gone.id) { w.owner[i] = keep.id; newTiles.push(i); MarkDirty(w, i); }
  }
  keep.tiles.push(...newTiles);
  gone.tiles = [];
  gone.frontier = [];
  for (const bd of w.buildings) {
    if (bd.civ === gone.id) { bd.civ = keep.id; if (bd.kind === 1) keep.houses++; }
  }
  for (const u of w.units) { if (!u.dead && u.civ === gone.id) u.civ = keep.id; }
  const keepArmies = w.armies.filter((x) => x.civ === keep.id).length;
  let mergedArmies = 0;
  for (const ar of [...w.armies]) {
    if (ar.civ !== gone.id) continue;
    if (keepArmies + mergedArmies < 4) { ar.civ = keep.id; mergedArmies++; }
    else DisbandArmy(w, ar, true);
  }
  keep.gold = (keep.gold ?? 0) + (gone.gold ?? 0);
  keep.knowledge = (keep.knowledge ?? 0) + (gone.knowledge ?? 0);
  const techs = new Set(keep.techs ?? []);
  for (const t of gone.techs ?? []) techs.add(t);
  keep.techs = [...techs];
  keep.pop = keep.pop + gone.pop;
  for (const key of [...w.warData.keys()]) {
    const dash = key.indexOf('-');
    const x = +key.slice(0, dash), y = +key.slice(dash + 1);
    if (x === gone.id || y === gone.id) w.warData.delete(key);
  }
  for (const key of [...w.rel.keys()]) {
    const dash = key.indexOf('-');
    const x = +key.slice(0, dash), y = +key.slice(dash + 1);
    if (x !== gone.id && y !== gone.id) continue;
    const other = x === gone.id ? y : x;
    if (other === keep.id) { w.rel.delete(key); w.totalWars.delete(key); continue; }
    const nk = pairKey(keep.id, other);
    if (!w.rel.has(nk)) w.rel.set(nk, w.rel.get(key) ?? 0);
    w.rel.delete(key);
  }
  for (const key of [...w.met]) {
    const dash = key.indexOf('-');
    const x = +key.slice(0, dash), y = +key.slice(dash + 1);
    if (x === gone.id || y === gone.id) {
      const other = x === gone.id ? y : x;
      if (other !== keep.id) w.met.add(pairKey(keep.id, other));
      w.met.delete(key);
    }
  }
  for (const d of w.directives) {
    if (d.status !== 'active') continue;
    if (d.civ === gone.id) FinishDirective(w, d, 'failed', `「${gone.name}」并入「${keep.name}」，宏图由联合王朝继承`);
    else if ((d.kind === 'annihilate' || d.kind === 'conquer') && d.target === gone.id) FinishDirective(w, d, 'success', `目标「${gone.name}」已成为联合王朝的一部分`);
  }
  LeaveAlliance(w, gone.id, 'fallen');
  if (w.worldWar.phase === 'running' && w.worldWar.belligerents.includes(gone.id)) {
    const bi2 = w.worldWar.belligerents.indexOf(gone.id);
    if (!w.worldWar.belligerents.includes(keep.id)) w.worldWar.belligerents[bi2] = keep.id;
    else w.worldWar.belligerents.splice(bi2, 1);
  }
  ClearFrontOf(w, gone.id);
  gone.alive = false;
  gone.mergedInto = keep.id;
  const stem = keep.name.length + gone.name.length <= 8 ? `${keep.name}·${gone.name}` : `${keep.name.slice(0, 3)}·${gone.name.slice(0, 3)}`;
  const newName = `${stem}联合王朝`.slice(0, 14);
  const oldKeepName = keep.name;
  keep.name = newName;
  RecordEvo(w, 'society', newName, null, keep.colorHex,
    `王国融合${cause === 'oracle' ? '（神谕钦定）' : '（深盟自然融合）'}——「${oldKeepName}」与「${gone.name}」和平合并：领土 ${newTiles.length} 格 / 人口 ${gone.pop} / 军团 ${mergedArmies} 全量继承`,
    `人口 ${keep.pop}·领土 ${keep.tiles.length}`,
    { civ: keep.id, mergedFrom: gone.id, tiles: newTiles.length, pop: gone.pop });
  AddEvent(w, 'alliance', `王座合璧——「${oldKeepName}」与「${gone.name}」${cause === 'oracle' ? '奉神谕' : '历经数十年深盟'}和平合并为「${newName}」（领土 ${newTiles.length} 格、军团 ${mergedArmies} 支、科技并集全数继承，列国为之侧目）`, keep.colorHex);
  Toast(w, `「${oldKeepName}」与「${gone.name}」合并为「${newName}」`, 'good');
  if (w.overlayMode === 'political' || w.overlayMode === 'alliance') w.overlayDirty = true;
  return keep;
}
function RecordEvo(w, kind, name, parentKey, colorHex, detail, stat, meta) {
  const id = w.evoSeq++;
  const parent = parentKey ? (w.evoIndex.get(parentKey) ?? null) : null;
  w.evoNodes.push({ id, kind, name, parent, year: Math.floor(w.yearF), colorHex, detail, stat, alive: true, meta });
  if (w.evoNodes.length > 720) {
    const drop = w.evoNodes.splice(0, w.evoNodes.length - 720);
    const dropped = new Set(drop.map((n) => n.id));
    for (const n of w.evoNodes) if (n.parent != null && dropped.has(n.parent)) n.parent = null;
  }
  return id;
}
function LeaveAlliance(w, civId, cause) {
  const al = AllianceOfCiv(w, civId);
  if (!al) return;
  al.members = al.members.filter((m) => m !== civId);
  w.allianceOf.delete(civId);
  const c = civAt(w, civId);
  if (cause === 'betray') {
    al.cohesion = Math.max(0, al.cohesion - 22);
    for (const m of [...al.members]) {
      const mc = civAt(w, m);
      if (!mc || !mc.alive) continue;
      const k = pairKey(m, civId);
      w.rel.set(k, Math.min(-30, w.rel.get(k) ?? 0));
    }
    if (c && c.alive) {
      AddEvent(w, 'alliance', `「${c.name}」对盟友刀兵相向，被逐出「${al.name}」——盟约的背叛者将无人再信`, '#f87171');
      Toast(w, `「${c.name}」叛盟`, 'danger');
    }
  } else if (cause === 'quit' && c && c.alive) {
    al.cohesion = Math.max(0, al.cohesion - 8);
    AddEvent(w, 'alliance', `「${c.name}」宣布退出「${al.name}」，独自面对乱世`, al.colorHex);
  }
  if (al.members.length < 2) DissolveAlliance(w, al, `「${al.name}」成员星散，盟约黯然作废`);
}
function DissolveAlliance(w, al, text) {
  for (const m of al.members) w.allianceOf.delete(m);
  w.allianceWarCd.delete(al.id);
  w.alliances = w.alliances.filter((x) => x.id !== al.id);
  AddEvent(w, 'alliance', text, al.colorHex);
  if (w.overlayMode === 'alliance') w.overlayDirty = true;
}
function FinishDirective(w, d, status, msg) {
  if (d.status !== 'active') return;
  d.status = status;
  d.endTick = w.tickCount;
  d.endText = msg;
  const civ = civAt(w, d.civ);
  if (civ && civ.alive) {
    if (status === 'success') {
      civ.gold = (civ.gold ?? 0) + 120;
      for (const a of w.armies) if (a.civ === civ.id) a.morale = Math.min(100, a.morale + 10);
      AddEvent(w, 'decreeOk', `神谕达成：「${civ.name}」——${msg}（国库 +120）`, civ.colorHex);
      Toast(w, `「${civ.name}」达成了${DIRECTIVE_LABEL[d.kind]}`, 'good');
    } else {
      civ.gold = Math.max(0, (civ.gold ?? 0) - 60);
      for (const a of w.armies) if (a.civ === civ.id) a.morale = Math.max(25, a.morale - 10);
      AddEvent(w, 'decreeFail', `神谕落空：「${civ.name}」——${msg}`, civ.colorHex);
      Toast(w, `「${civ.name}」未能达成${DIRECTIVE_LABEL[d.kind]}`, 'danger');
    }
  }
}
function DisbandArmy(w, a, quiet) {
  const civ = civAt(w, a.civ);
  for (const id of a.members) {
    const u = w.unitById.get(id);
    if (u && u.army === a.id) { u.army = undefined; u.boat = 0; u.boatTTL = 0; }
  }
  const ix = w.armies.indexOf(a);
  if (ix >= 0) w.armies.splice(ix, 1);
  if (civ) civ.armyCd = w.tickCount + ARMY_CD;
  if (!quiet && civ) {
    const msg = a.tactical
      ? `${a.name} 战术后撤归营整补（斩获 ${a.kills}，损失 ${a.losses}）——军旗未倒，随时再战`
      : `${a.name} 解散归田（战役斩获 ${a.kills}，损失 ${a.losses}）`;
    a.tactical = false;
    AddEvent(w, 'army', msg, civ.colorHex, a.x, a.y);
  }
  for (const o of w.armies) if (o.clashWith === a.id) { o.clashWith = undefined; if (o.state === 'battle') o.state = 'march'; }
}
function AllianceOfCiv(w, civId) {
  const id = w.allianceOf.get(civId);
  if (id == null) return null;
  return w.alliances.find((al) => al.id === id) ?? null;
}

// ==================== M-U3d 联盟系统 + 旨意颁布（WbCivSim.cs 机械翻译同构） ====================
const YEAR_TICKS = 40; // constants.ts L9
const DIRECTIVE_YEARS = { annihilate: 120, conquer: 80, expand: 60, wealth: 50, wisdom: 60, populate: 60, legion: 30, build: 60, unify: 0, mobilize: 20, alliance: 40, temple: 60 };
const DIRECTIVE_PARAM = { annihilate: 0, conquer: 0, expand: 160, wealth: 300, wisdom: 200, populate: 80, legion: 2, build: 20, unify: 0, mobilize: 30, alliance: 0, temple: 0 };
// RACES diplo/aggr（types.ts 仅 6 族定义 → ?? 0.5；BANDIT(4)/ZOMBIE(5) 无字段）
const RACES_DIPLO_MAP = { 0: 0.65, 1: 0.45, 2: 0.4, 3: 0.15, 19: 0.35, 20: 0.3 };
const RACES_AGGR_MAP = { 0: 0.4, 1: 0.25, 2: 0.5, 3: 0.9, 19: 0.5, 20: 0.55 };
const raceDiploOf = (r) => (r in RACES_DIPLO_MAP ? RACES_DIPLO_MAP[r] : 0.5);
const raceAggrOf = (r) => (r in RACES_AGGR_MAP ? RACES_AGGR_MAP[r] : 0.5);
const ALLIANCE_COLORS = ['#14b8a6', '#f97316', '#a855f7', '#84cc16', '#ec4899', '#06b6d4'];
const GovOf = (w, civId) => (civId < 0 ? 0 : (civAt(w, civId)?.gov ?? 0));
function ShiftRaceRelF(w, a, b, dv) {
  if (a === b) return;
  const rk = pairKey(a, b);
  const curR = w.raceRel.get(rk) ?? RACE_REL_BASE[rk] ?? 0;
  w.raceRel.set(rk, Math.max(-80, Math.min(80, curR + dv)));
}
function AllianceNameFor(w, leader) {
  let region = '中原';
  if (leader.capital >= 0) {
    const dx = WbTileX(leader.capital) / W - 0.5;
    const dy = WbTileY(leader.capital) / H - 0.5;
    if (Math.abs(dx) < 0.16 && Math.abs(dy) < 0.16) region = '中原';
    else if (Math.abs(dy) >= Math.abs(dx)) region = dy < 0 ? '北境' : '南疆';
    else region = dx < 0 ? '西陲' : '东海';
  }
  const essence = ['同盟', '公约', '誓约', '协定', '协约', '阵营'];
  return region + essence[Math.floor(Rng(w) * 6)];
}
function FormAlliance(w, a, b) {
  if (!a || !b) return null;
  if (w.allianceOf.has(a.id) || w.allianceOf.has(b.id)) return null;
  if (w.alliances.length >= 4) return null;
  const al = {
    id: w.allianceSeq++,
    name: AllianceNameFor(w, a),
    members: [a.id, b.id],
    leader: a.id,
    cohesion: 55,
    formedTick: w.tickCount,
    formedYear: Math.floor(w.yearF),
    warsTogether: 0,
    colorHex: ALLIANCE_COLORS[(w.allianceSeq - 2) % ALLIANCE_COLORS.length],
    bonded: false,
  };
  w.alliances.push(al);
  w.allianceOf.set(a.id, al.id);
  w.allianceOf.set(b.id, al.id);
  const pk = pairKey(a.id, b.id);
  w.rel.set(pk, Math.max(60, w.rel.get(pk) ?? 0));
  w.met.add(pk);
  ShiftRaceRelF(w, a.race, b.race, 9);
  AddEvent(w, 'alliance', `「${a.name}」与「${b.name}」缔结「${al.name}」——攻守同盟，荣辱与共`, al.colorHex,
    a.capital >= 0 ? WbTileX(a.capital) : null, a.capital >= 0 ? WbTileY(a.capital) : null);
  Toast(w, `「${al.name}」成立`, 'good');
  if (w.overlayMode === 'alliance') w.overlayDirty = true;
  return al;
}
function JoinAlliance(w, al, c) {
  if (!al || !c) return false;
  if (al.members.length >= 5 || w.allianceOf.has(c.id)) return false;
  const leader = civAt(w, al.leader);
  if (!leader || !leader.alive) return false;
  const rr = RaceRelOf(w, c.race, leader.race);
  if (rr < -35) {
    if (Rng(w) < 0.7) {
      AddEvent(w, 'alliance', `「${c.name}」申请加入「${al.name}」被拒——千年的种族世仇不是一纸盟约能化解的`, al.colorHex);
      return false;
    }
  }
  al.members.push(c.id);
  w.allianceOf.set(c.id, al.id);
  for (const m of [...al.members]) {
    if (m === c.id) continue;
    const mc = civAt(w, m);
    if (!mc || !mc.alive) continue;
    const k = pairKey(m, c.id);
    w.rel.set(k, Math.max(52, w.rel.get(k) ?? 0));
    ShiftRaceRelF(w, mc.race, c.race, 4);
    w.met.add(k);
  }
  AddEvent(w, 'alliance', `「${c.name}」加入「${al.name}」——盟旗之下多了一支力量`, al.colorHex,
    c.capital >= 0 ? WbTileX(c.capital) : null, c.capital >= 0 ? WbTileY(c.capital) : null);
  if (w.overlayMode === 'alliance') w.overlayDirty = true;
  return true;
}
function IdeaModsOf(w, civId) {
  if (civId < 0) return { gold: 0, stab: 0, mil: 0, know: 0, repro: 0, wear: 0 };
  const cached = w.ideaModCache.get(civId);
  if (cached) return cached;
  const c = civAt(w, civId);
  const mi = { gold: 0, stab: 0, mil: 0, know: 0, repro: 0, wear: 0 };
  if (c && c.ideas) {
    for (const key of c.ideas) {
      const m = w.emIdeas.get(key)?.mods;
      if (!m) continue;
      mi.gold += m.gold ?? 0;
      mi.stab += m.stab ?? 0;
      mi.mil += m.mil ?? 0;
      mi.know += m.know ?? 0;
      mi.repro += m.repro ?? 0;
      mi.wear += m.wear ?? 0;
    }
  }
  w.ideaModCache.set(civId, mi);
  return mi;
}
function AllianceTick(w) {
  // ① 对账：灭亡成员除名 + 盟主继任 + 成员互战判叛
  for (const al of [...w.alliances]) {
    for (const m of [...al.members]) {
      const c = civAt(w, m);
      if (!c || !c.alive || c.pop <= 0) LeaveAlliance(w, m, 'fallen');
    }
    if (!w.alliances.includes(al)) continue;
    for (let i = 0; i < al.members.length; i++) {
      for (let j = i + 1; j < al.members.length; j++) {
        const x = al.members[i], y = al.members[j];
        if (!AtWar(w, x, y)) continue;
        const cx = civAt(w, x), cy = civAt(w, y);
        const traitor = ((cx?.militarism ?? 30) >= (cy?.militarism ?? 30)) ? x : y;
        LeaveAlliance(w, traitor, 'betray');
      }
    }
    if (!w.alliances.includes(al)) continue;
    if (!al.members.includes(al.leader)) {
      let best = al.members[0], bestPop = -1;
      for (const m of al.members) {
        const c = civAt(w, m);
        if (c && c.pop > bestPop) { bestPop = c.pop; best = m; }
      }
      al.leader = best;
      AddEvent(w, 'alliance', `「${al.name}」盟主易位，「${civAt(w, best)?.name ?? '?'}」执掌盟务`, al.colorHex);
    }
  }
  const alive = w.civs.filter((c) => c && c.alive && c.pop > 0);
  // ② 新联盟诞生
  if (w.alliances.length < 4 && alive.length >= 2) {
    const free = alive.filter((c) => !w.allianceOf.has(c.id));
    for (let i = 0; i < free.length && w.alliances.length < 4; i++) {
      for (let j = i + 1; j < free.length; j++) {
        const ca = free[i], cb = free[j];
        if (w.allianceOf.has(ca.id) || w.allianceOf.has(cb.id)) continue;
        const key = pairKey(ca.id, cb.id);
        if (!w.met.has(key)) continue;
        const v = w.rel.get(key) ?? 0;
        if (v < 55 || AtWar(w, ca.id, cb.id)) continue;
        const diploMul = 0.5 + (raceDiploOf(ca.race) + raceDiploOf(cb.race)) / 2;
        const commonFoe = [...w.warData.values()].some((wd) => (AtWar(w, ca.id, wd.a) && AtWar(w, cb.id, wd.a)) || (AtWar(w, ca.id, wd.b) && AtWar(w, cb.id, wd.b)));
        const catast = w.tickCount - w.lastCatastropheTick < 250;
        const p = 0.05 * diploMul * (commonFoe ? 3.2 : 1) * (catast ? 1.6 : 1);
        if (Rng(w) < p) {
          const leader = ca.pop >= cb.pop ? ca : cb;
          const other = leader === ca ? cb : ca;
          FormAlliance(w, leader, other);
          break;
        }
      }
    }
  }
  // ③ 扩员
  for (const al of [...w.alliances]) {
    if (al.members.length >= 5) continue;
    const leader = civAt(w, al.leader);
    if (!leader || !leader.alive) continue;
    for (const c of alive) {
      if (al.members.length >= 5) break;
      if (w.allianceOf.has(c.id) || al.members.includes(c.id)) continue;
      const v = w.rel.get(pairKey(al.leader, c.id)) ?? 0;
      if (v < 45) continue;
      let okCount = 0;
      for (const m of al.members) if ((w.rel.get(pairKey(m, c.id)) ?? 0) > 5) okCount++;
      if (okCount < Math.ceil(al.members.length / 2)) continue;
      const p = 0.05 * (0.5 + raceDiploOf(c.race));
      if (Rng(w) < p) JoinAlliance(w, al, c);
    }
  }
  // ④ 凝聚力结算
  let dragons = 0;
  for (const u of w.units) if (!u.dead && u.race === 9) dragons++;
  for (const al of [...w.alliances]) {
    const ms = al.members.map((m) => civAt(w, m)).filter((c) => c && c.alive);
    if (ms.length < 2) continue;
    let dh = 0.5;
    let relSum = 0, relN = 0;
    for (let i = 0; i < ms.length; i++) {
      for (let j = i + 1; j < ms.length; j++) {
        relSum += w.rel.get(pairKey(ms[i].id, ms[j].id)) ?? 0;
        relN++;
      }
    }
    const relAvg = relN > 0 ? relSum / relN : 50;
    if (relAvg < 30) dh -= 1.5;
    let common = false;
    for (const wd of w.warData.values()) {
      let n = 0;
      for (const m of ms) if (AtWar(w, m.id, wd.a) || AtWar(w, m.id, wd.b)) n++;
      if (n >= 2) { common = true; break; }
    }
    if (common) dh += 0.8;
    if (dragons > 0 || w.zombieOutbreakNoted) dh += 0.5;
    const milAvg = ms.reduce((s, c) => s + (c.militarism ?? 30), 0) / ms.length;
    if (milAvg > 60) dh -= 0.8;
    let tradeN = 0;
    for (const u of w.units) {
      if (u.dead || (u.caravan ?? 0) <= 0) continue;
      if (al.members.includes(u.civ) && al.members.includes(u.caravan)) tradeN++;
    }
    if (tradeN > 0) dh += 0.4;
    for (const m of ms) {
      const im = IdeaModsOf(w, m.id);
      if (im.mil > 0.3) dh -= 0.15;
      if (im.mil < -0.2) dh += 0.15;
    }
    al.cohesion = Math.max(0, Math.min(100, al.cohesion + dh));
    if (al.warsTogether >= 3 && !al.bonded) {
      al.bonded = true;
      al.cohesion = Math.min(100, al.cohesion + 8);
      AddEvent(w, 'alliance', `「${al.name}」的盟军在血与火中淬炼出袍泽纽带——盟内商路与学术交流全面深化`, al.colorHex);
      Toast(w, `「${al.name}」缔结袍泽纽带`, 'good');
    }
    if (al.cohesion < 25 && Rng(w) < 0.3) {
      DissolveAlliance(w, al, `「${al.name}」凝聚力涣散、貌合神离，盟约名存实亡`);
    }
  }
  // ⑤ 经济互助
  for (const al of [...w.alliances]) {
    for (const m of [...al.members]) {
      const c = civAt(w, m);
      if (!c || !c.alive || (c.gold ?? 0) >= 30) continue;
      const rich = al.members.map((x) => civAt(w, x)).find((x) => x && x.alive && (x.gold ?? 0) > 200);
      if (rich && Rng(w) < 0.4) {
        rich.gold = (rich.gold ?? 0) - 15;
        c.gold = (c.gold ?? 0) + 15;
        AddEvent(w, 'trade', `「${rich.name}」雪中送炭：15 金驰援困顿的盟邦「${c.name}」`, al.colorHex);
      }
    }
  }
  // ⑥ 种族关系漂移
  for (const al of [...w.alliances]) {
    for (let i = 0; i < al.members.length; i++) {
      for (let j = i + 1; j < al.members.length; j++) {
        const cx = civAt(w, al.members[i]), cy = civAt(w, al.members[j]);
        if (!cx || !cx.alive || !cy || !cy.alive || cx.race === cy.race) continue;
        const cultured = (cx.culture ?? 0) > 80 && (cy.culture ?? 0) > 80;
        ShiftRaceRelF(w, cx.race, cy.race, 0.15 + (cultured ? 0.1 : 0));
      }
    }
  }
  for (const wd of [...w.warData.values()]) {
    const ca = civAt(w, wd.a), cb = civAt(w, wd.b);
    if (ca && ca.alive && cb && cb.alive && ca.race !== cb.race) ShiftRaceRelF(w, ca.race, cb.race, -0.3);
  }
}
function IssueDirective(w, civId, kind, param = 0, target) {
  const civ = civAt(w, civId);
  if (!civ || !civ.alive) return null;
  if (w.directives.filter((d) => d.civ === civId && d.status === 'active').length >= 2) return null;
  if (ActiveDirective(w, civId, kind)) return null;
  const years = DIRECTIVE_YEARS[kind] ?? 0;
  const metaParam = DIRECTIVE_PARAM[kind] ?? 0;
  const p = param > 0 ? param : metaParam;
  const d = {
    id: w.dirSeq++, civ: civId, kind, target,
    param: p, status: 'active',
    startTick: w.tickCount,
    deadlineTick: years > 0 ? w.tickCount + years * YEAR_TICKS : 0,
    text: DescribeDirective(w, civ, kind, p, target),
  };
  w.directives.push(d);
  ApplyDirectiveImpulse(w, d, civ);
  AddEvent(w, 'decree', d.text, civ.colorHex);
  Toast(w, `「${civ.name}」奉神谕：${DIRECTIVE_LABEL[kind]}`, 'info');
  return d;
}
function DescribeDirective(w, civ, kind, p, target) {
  const years = DIRECTIVE_YEARS[kind] ?? 0;
  const lim = years > 0 ? `（${years} 年内）` : '';
  const tn = target != null ? (civAt(w, target)?.name ?? '?') : '';
  switch (kind) {
    case 'annihilate': return `「${civ.name}」奉旨灭国：「${tn}」必须被从大地上抹去${lim}`;
    case 'conquer': return `「${civ.name}」奉旨攻城：王师须攻陷「${tn}」的王都${lim}`;
    case 'expand': return `「${civ.name}」奉旨扩张：领土须达 ${p} 格${lim}`;
    case 'wealth': return `「${civ.name}」奉旨富国：国库须达 ${p} 财富${lim}`;
    case 'wisdom': return `「${civ.name}」奉旨启智：知识须达 ${p}${lim}`;
    case 'populate': return `「${civ.name}」奉旨繁衍：人口须达 ${p}${lim}`;
    case 'legion': return `「${civ.name}」奉旨建军：须同时保有 ${p} 支现役军团${lim}`;
    case 'build': return `「${civ.name}」奉旨营建：房屋须达 ${p} 座${lim}`;
    case 'unify': return `「${civ.name}」奉旨统一：须成为这个世界唯一的强权`;
    case 'mobilize': return `「${civ.name}」奉旨总动员：全民皆兵，限期斩获 ${p} 名敌军${lim}`;
    case 'alliance': return `「${civ.name}」奉旨结盟：须与「${tn}」缔结盟好${lim}`;
    case 'temple': return `「${civ.name}」奉旨立信：须建成一座神殿${lim}`;
  }
  return null;
}
function ApplyDirectiveImpulse(w, d, civ) {
  switch (d.kind) {
    case 'annihilate': {
      if (d.target == null) break;
      const wd = DeclareWar(w, d.civ, d.target, 'holy', { total: true, goal: 0, force: true });
      if (wd) wd.giveUpAt = d.deadlineTick + 800;
      TryFormArmy(w, civ, d.target);
      break;
    }
    case 'conquer': {
      if (d.target == null) break;
      DeclareWar(w, d.civ, d.target, 'holy', { goal: 45, force: true });
      TryFormArmy(w, civ, d.target);
      break;
    }
    case 'mobilize': {
      civ.mobilizeUntil = w.tickCount + (d.deadlineTick - w.tickCount) * 0.8;
      let armed = 0;
      for (const u of [...w.units]) {
        if (u.dead || u.civ !== civ.id) continue;
        const job = u.job ?? 0;
        if (job === 0 || job === 1 || job === 5) { SetJob(w, u, 2); armed++; }
      }
      AddEvent(w, 'war', `「${civ.name}」总动员！${armed} 名国民放下锄头拿起长剑`, civ.colorHex);
      break;
    }
    case 'legion': {
      civ.armyCd = 0;
      TryFormArmy(w, civ);
      if (CivAtWar(w, civ.id)) TryFormArmy(w, civ);
      break;
    }
    case 'alliance': {
      if (d.target == null) break;
      const key = pairKey(d.civ, d.target);
      w.met.add(key);
      const cur = w.rel.get(key) ?? 0;
      if (cur < -20) MakePeace(w, d.civ, d.target, `「${civ.name}」奉神谕与「${civAt(w, d.target)?.name}」化干戈为玉帛`, 40);
      else w.rel.set(key, Math.max(cur, 45));
      const t = civAt(w, d.target);
      const myAl = AllianceOfCiv(w, civ.id);
      const tAl = AllianceOfCiv(w, d.target);
      if (t && t.alive && !myAl && !tAl) FormAlliance(w, civ.pop >= t.pop ? civ : t, civ.pop >= t.pop ? t : civ);
      else if (t && t.alive && myAl && !tAl) JoinAlliance(w, myAl, t);
      break;
    }
    default: break;
  }
}
function TryFormArmy(w, civ, targetCiv) {
  // M-U3e 军团域桩：门控段位等（pickWarEnemy 纯扫描零 rng → null 位等）
  if (!civ || !civ.alive || civ.pop < 10) return null;
  if (w.tickCount < (civ.armyCd ?? 0)) return null;
  const leg = ActiveDirective(w, civ.id, 'legion');
  const legionParam = leg ? Math.max(3, leg.param) : 2;
  const aggr = raceAggrOf(civ.race);
  const armyCap = Math.max(1, Math.round((legionParam + TechModsOf(w, civ.id).armyMax + (GovOf(w, civ.id) === 4 ? 1 : 0)) * (0.75 + aggr * 0.5)));
  if (w.armies.filter((a) => a.civ === civ.id).length >= armyCap) return null;
  const enemyId = targetCiv ?? -1;
  if (enemyId < 0) return null; // TODO(M-U3e): pickWarEnemy + 集结/征召/编成段
  const ec = civAt(w, enemyId);
  if (!ec || !ec.alive || !AtWar(w, civ.id, enemyId)) return null;
  return null; // TODO(M-U3e): 兵源/征召/编成
}
function MakePeace() {
  throw new Error('TODO(M-U3e): makePeace/settleFront 未翻译 —— golden 场景恒不可达（哨兵）');
}
function DirectiveTick(w) {
  for (let i = w.directives.length - 1; i >= 0; i--) {
    const d = w.directives[i];
    if (d.status !== 'active') {
      if (d.endTick != null && w.tickCount - d.endTick > 200) w.directives.splice(i, 1);
      continue;
    }
    const civ = civAt(w, d.civ);
    if (!civ || !civ.alive) { FinishDirective(w, d, 'failed', `「${civ?.name ?? ''}」覆灭，宏图化为泡影`); continue; }
    const r = EvalDirective(w, d, civ);
    if (r.done) { FinishDirective(w, d, 'success', r.msg); continue; }
    if (d.deadlineTick > 0 && w.tickCount > d.deadlineTick) { FinishDirective(w, d, 'failed', r.msg); continue; }
  }
}
function EvalDirective(w, d, civ) {
  switch (d.kind) {
    case 'annihilate': {
      const t = d.target != null ? civAt(w, d.target) : null;
      return { done: !t?.alive, msg: !t?.alive ? `「${t?.name}」已被从大地上抹去` : `期限已至，「${t.name}」仍在顽抗，灭国宏业功亏一篑` };
    }
    case 'conquer': {
      const t = d.target != null ? civAt(w, d.target) : null;
      if (!t?.alive) return { done: true, msg: `「${t?.name}」已亡国，王都早已易主` };
      const wd = w.warData.get(pairKey(d.civ, d.target));
      const s = wd ? (wd.a === d.civ ? wd.scoreA : wd.scoreB) : 0;
      return { done: s >= 45, msg: s >= 45 ? `「${t.name}」的王都陷落了` : `期限已至，「${t.name}」的王都仍屹立不倒` };
    }
    case 'expand': {
      let tiles = 0;
      for (const i of civ.tiles) if (w.owner[i] === civ.id) tiles++;
      return { done: tiles >= d.param, msg: tiles >= d.param ? `领土已达 ${tiles} 格` : `期限已至，领土仅 ${tiles} 格（目标 ${d.param}）`, progress: Math.min(1, tiles / d.param) };
    }
    case 'wealth': {
      const g = civ.gold ?? 0;
      return { done: g >= d.param, msg: g >= d.param ? `国库充盈（${g} 财富）` : `期限已至，国库仅 ${g} 财富`, progress: Math.min(1, g / d.param) };
    }
    case 'wisdom': {
      const k = civ.knowledge ?? 0;
      return { done: k >= d.param, msg: k >= d.param ? `知识渊博（${k}）` : `期限已至，知识仅 ${k}`, progress: Math.min(1, k / d.param) };
    }
    case 'populate': {
      const p = Math.max(0, civ.pop);
      return { done: p >= d.param, msg: p >= d.param ? `人丁兴旺（${p} 人口）` : `期限已至，人口仅 ${p}`, progress: Math.min(1, p / d.param) };
    }
    case 'legion': {
      const n = w.armies.filter((a) => a.civ === civ.id).length;
      return { done: n >= d.param, msg: n >= d.param ? `${n} 支军团同时现役` : `期限已至，现役军团仅 ${n} 支`, progress: Math.min(1, n / d.param) };
    }
    case 'build': {
      const h = civ.houses;
      return { done: h >= d.param, msg: h >= d.param ? `城郭连绵（${h} 座房屋）` : `期限已至，房屋仅 ${h} 座`, progress: Math.min(1, h / d.param) };
    }
    case 'unify': {
      const done = w.victoryCiv === civ.id;
      return { done, msg: done ? `世界已归于「${civ.name}」的旌旗之下` : '统一大业未竟' };
    }
    case 'mobilize': {
      const kc = d.killCount ?? 0;
      return { done: kc >= d.param, msg: kc >= d.param ? `总动员战果辉煌（斩获 ${kc}）` : `动员期限已至，斩获仅 ${kc}`, progress: Math.min(1, kc / d.param) };
    }
    case 'alliance': {
      const t = d.target != null ? civAt(w, d.target) : null;
      const me = civAt(w, d.civ);
      if (t && me && t.alive && me.alive) {
        const myAl = AllianceOfCiv(w, me.id);
        const tAl = AllianceOfCiv(w, t.id);
        if (myAl && myAl.id === tAl?.id) return { done: true, msg: `与「${t.name}」同叢「${myAl.name}」盟旗之下`, progress: 1 };
        if (!myAl && !tAl && FormAlliance(w, me.pop >= t.pop ? me : t, me.pop >= t.pop ? t : me)) return { done: true, msg: `与「${t.name}」缔结了攻守同盟`, progress: 1 };
        if (myAl && !tAl && JoinAlliance(w, myAl, t)) return { done: true, msg: `「${t.name}」加入了「${myAl.name}」`, progress: 1 };
      }
      const v = d.target != null ? w.rel.get(pairKey(d.civ, d.target)) ?? -100 : -100;
      return { done: v >= 60, msg: v >= 60 ? `与「${civAt(w, d.target ?? 0)?.name}」缔结盟好` : `期限已至，两国仍未同心（关系 ${Math.round(v)}）`, progress: Math.min(1, (v + 100) / 160) };
    }
    case 'temple': {
      const cnt = w.civBuildCounts.get(civ.id);
      const n = cnt ? cnt[BK.TEMPLE] ?? 0 : 0;
      return { done: n > 0, msg: n > 0 ? '神殿落成，钟声悠扬' : '期限已至，神殿仍是空中楼阁', progress: Math.min(1, n) };
    }
  }
}
function EnsureWarData(w, a, b) {
  const key = pairKey(a, b);
  let wd = w.warData.get(key);
  if (wd) return wd;
  const ca = civAt(w, a), cb = civAt(w, b);
  if (!ca || !cb || !ca.alive || !cb.alive) return null;
  wd = {
    key, a: Math.min(a, b), b: Math.max(a, b),
    startTick: w.tickCount, startYear: Math.floor(w.yearF),
    total: w.totalWars.has(key),
    scoreA: 0, scoreB: 0, exA: 0, exB: 0, casA: 0, casB: 0,
    razedA: 0, razedB: 0, battles: 0, giveUpAt: 0,
    reason: 'border', reasonText: '', aggressor: ca.pop >= cb.pop ? a : b,
    goal: 0, goalNow: 0, occA: 0, occB: 0,
    popA0: ca.pop, popB0: cb.pop, lastActiveTick: w.tickCount,
  };
  w.warData.set(key, wd);
  w.statWars++;
  return wd;
}
function CasusText(w, ca, cb, reason, goal) {
  switch (reason) {
    case 'border': return `「${ca.name}」以边境土地纠葛为由向「${cb.name}」宣战——旨在夺取 ${goal} 格接壤疆土`;
    case 'conquest': return `「${ca.name}」以开疆拓土之名向「${cb.name}」宣战——不吞并 ${goal} 格国土誓不罢休`;
    case 'plunder': return `「${ca.name}」垂诞「${cb.name}」的膏腴，发动劫掠战争——须斩获 ${goal} 战果方肯休战`;
    case 'revenge': return `「${ca.name}」不忘旧败之耻，向「${cb.name}」掀起复仇战争——不夺回 ${goal} 分优势决不收兵`;
    case 'rebel': return `「${ca.name}」出兵讨伐叛离的「${cb.name}」——不将其从大地上抹去决不收兵`;
    case 'annex': return `「${ca.name}」对「${cb.name}」发动灭国战争——不摧毁对方最后一座城池决不罢休`;
    case 'unify': return `「${ca.name}」奉统一天下之大义向「${cb.name}」宣战——世间只能有一个强权`;
    case 'holy': return `神谕既下：「${ca.name}」奉旨向「${cb.name}」发动圣战`;
    case 'alliance': return `「${ca.name}」依盟约向「${cb.name}」参战——政守同盟，共赴戎机`;
  }
}
function DeclareWar(w, agg, victim, reason, opts = {}) {
  const ca = civAt(w, agg), cb = civAt(w, victim);
  if (!ca || !cb || !ca.alive || !cb.alive || agg === victim) return null;
  if (!opts.force && !w.laws.wars) return null;
  const key = pairKey(agg, victim);
  w.met.add(key);
  const level = CASUS_LEVEL[reason];
  const cur = w.rel.get(key) ?? 0;
  w.rel.set(key, Math.min(cur, level));
  let goal = opts.goal ?? 0;
  if (goal <= 0) {
    const vicTiles = cb.tiles.length;
    switch (reason) {
      case 'border': goal = Math.max(6, Math.min(12, jsRound(vicTiles * 0.1))); break;
      case 'conquest': goal = Math.max(16, Math.min(45, jsRound(vicTiles * 0.25))); break;
      case 'plunder': goal = Math.max(24, Math.min(44, jsRound(cb.pop * 0.6))); break;
      case 'revenge': goal = 30; break;
      default: goal = 0;
    }
  }
  const wd = EnsureWarData(w, agg, victim);
  if (!wd) return null;
  wd.reason = reason;
  wd.aggressor = agg;
  wd.goal = goal;
  wd.reasonText = CasusText(w, ca, cb, reason, goal);
  const immortal = reason === 'annex' || reason === 'unify' || reason === 'rebel' || opts.total;
  if (immortal) {
    wd.total = true;
    w.totalWars.add(key);
    if (wd.giveUpAt === 0) wd.giveUpAt = w.tickCount + 3600;
  }
  wd.lastActiveTick = w.tickCount;
  w.warHistory.push(w.tickCount);
  if (w.warHistory.length > 24) w.warHistory.shift();
  {
    const cost = Math.min(40, 8 + Math.floor(ca.pop * 0.08));
    ca.gold = Math.max(0, (ca.gold ?? 0) - cost);
  }
  if (!opts.quiet) {
    AddEvent(w, 'casus', wd.reasonText, ca.colorHex, ca.capital >= 0 ? WbTileX(ca.capital) : undefined, ca.capital >= 0 ? WbTileY(ca.capital) : undefined);
    Toast(w, `「${ca.name}」对「${cb.name}」宣战：${CASUS_LABEL[reason]}`, 'war');
  }
  if (reason !== 'alliance' || opts.force) {
    const vAl = AllianceOfCiv(w, victim);
    if (vAl && !vAl.members.includes(agg)) {
      let joined = 0;
      for (const m of [...vAl.members]) {
        if (m === victim || m === agg) continue;
        const mc = civAt(w, m);
        if (!mc || !mc.alive || AtWar(w, m, agg)) continue;
        if (DeclareWar(w, m, agg, 'alliance', { force: true, quiet: true, goal: 6 })) {
          joined++;
          const k = pairKey(m, agg);
          w.rel.set(k, Math.min(w.rel.get(k) ?? 0, -35));
        }
      }
      if (joined > 0 && !opts.quiet) {
        vAl.warsTogether++;
        AddEvent(w, 'alliance', `集体防御条款生效：「${vAl.name}」的 ${joined} 个成员国对侵略者「${ca.name}」宣战`, vAl.colorHex);
      }
    }
  }
  if (!opts.force && reason !== 'alliance' && reason !== 'rebel' && w.laws.wars) {
    const aAl = AllianceOfCiv(w, agg);
    if (aAl && w.tickCount - (w.allianceWarCd.get(aAl.id) ?? -9e9) > 300) {
      let joined = 0;
      for (const m of [...aAl.members]) {
        if (m === agg) continue;
        const mc = civAt(w, m);
        if (!mc || !mc.alive || AtWar(w, m, victim)) continue;
        if ((w.rel.get(pairKey(m, victim)) ?? 0) >= 20) { aAl.cohesion = Math.max(0, aAl.cohesion - 2); continue; }
        if (Rng(w) < 0.6 && DeclareWar(w, m, victim, 'alliance', { force: true, quiet: true, goal: 6 })) joined++;
      }
      if (joined > 0) {
        w.allianceWarCd.set(aAl.id, w.tickCount);
        aAl.warsTogether++;
        AddEvent(w, 'alliance', `联军出击：「${aAl.name}」${joined} 个成员国响应盟主号令，共讨「${cb.name}」`, aAl.colorHex);
      }
    }
  }
  // shiftRaceRel（WbWorld.ShiftRaceRel 镜像）
  if (ca.race !== cb.race) {
    const rk = pairKey(ca.race, cb.race);
    const curR = w.raceRel.get(rk) ?? RACE_REL_BASE[rk] ?? 0;
    w.raceRel.set(rk, Math.max(-80, Math.min(80, curR + (reason === 'holy' ? -4 : -2.5))));
  }
  return wd;
}
function PickCasus(w, ca, cb) {
  const key = pairKey(ca.id, cb.id);
  const shame = w.warShame.get(key);
  if (shame != null) {
    const agg = shame === ca.id ? ca : cb;
    const vic = shame === ca.id ? cb : ca;
    if (agg.alive && vic.alive && (agg.militarism ?? 30) >= 22 && Rng(w) < 0.6) {
      return { reason: 'revenge', aggressor: agg, victim: vic };
    }
  }
  for (const c of [ca, cb]) {
    const other = c === ca ? cb : ca;
    if (ActiveDirective(w, c.id, 'unify') && c.pop >= other.pop) return { reason: 'unify', aggressor: c, victim: other };
    const d = ActiveDirective(w, c.id, 'annihilate') ?? ActiveDirective(w, c.id, 'conquer');
    if (d && d.target === other.id) return { reason: 'holy', aggressor: c, victim: other };
  }
  const agg = (ca.militarism ?? 30) + Rng(w) * 34 >= (cb.militarism ?? 30) + Rng(w) * 34 ? ca : cb;
  const vic = agg === ca ? cb : ca;
  const ratio = (agg.pop + 2) / (vic.pop + 2);
  const greed = raceGreed(agg.race);
  if (ratio >= 1.6 && (agg.militarism ?? 30) >= 42) return { reason: 'conquest', aggressor: agg, victim: vic };
  if ((vic.gold ?? 0) >= 140 && (agg.militarism ?? 30) >= 45 && (greed >= 0.55 || Rng(w) < 0.4)) return { reason: 'plunder', aggressor: agg, victim: vic };
  if (ratio <= 0.8 && (agg.militarism ?? 30) >= 52 && greed >= 0.6) return { reason: 'plunder', aggressor: agg, victim: vic };
  return { reason: 'border', aggressor: agg, victim: vic };
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
  techModCache.clear(); // 静态科技缓存跨场景污染防护
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
      gov: c.gov ?? 0, govYear: 0, stability: c.stability ?? 70, culture: c.culture ?? 0,
      militarism: c.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
      kingId: c.kingId ?? undefined, kingName: c.kingName ?? 'K', banner: c.banner ?? 'B',
      colorHex: c.colorHex ?? '#c83c3c', color: c.color ?? [200, 60, 60],
      tiles: c.tiles ? [...c.tiles] : [], frontier: c.frontier ? [...c.frontier] : [],
    };
    w.civs.push(civ);
    w.civs[civ.id] = civ;
    w.civSeq = Math.max(w.civSeq, (c.id ?? 0) + 1);
    for (const i of civ.tiles) w.owner[i] = civ.id;
  }
  // units
  for (const u of sc.fixture.units ?? []) putUnit(w, u);
  for (const d of sc.fixture.directives ?? []) {
    w.directives.push({ id: d.id, civ: d.civ, kind: d.kind, target: d.target, param: d.param ?? 0, status: d.status ?? 'active', startTick: d.startTick ?? 0, deadlineTick: d.deadlineTick ?? 0, text: d.text ?? '', killCount: d.killCount });
    w.dirSeq = Math.max(w.dirSeq ?? 1, (d.id ?? 0) + 1); // gen mkDirective 游标同步
  }
  for (const al of sc.fixture.alliances ?? []) {
    const a2 = { id: al.id, name: al.name ?? `A${al.id}`, members: [...al.members], leader: al.leader ?? al.members[0], cohesion: al.cohesion ?? 55, formedTick: al.formedTick ?? 0, formedYear: al.formedYear ?? 0, warsTogether: al.warsTogether ?? 0, colorHex: al.colorHex ?? '#14b8a6', bonded: al.bonded === true };
    w.alliances.push(a2);
    for (const m of a2.members) w.allianceOf.set(m, a2.id);
  }
  for (const wd of sc.fixture.wars ?? []) {
    w.warData.set(wd.key, { key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick ?? 0, startYear: wd.startYear ?? 0, total: wd.total ?? false, scoreA: 0, scoreB: 0, exA: 0, exB: 0, casA: 0, casB: 0, razedA: 0, razedB: 0, battles: 0, giveUpAt: wd.giveUpAt ?? 0, reason: wd.reason ?? 'border', reasonText: wd.reasonText ?? '', aggressor: wd.aggressor ?? 0, goal: wd.goal ?? 0, goalNow: 0, occA: 0, occB: 0, popA0: wd.popA0 ?? 0, popB0: wd.popB0 ?? 0, lastActiveTick: wd.lastActiveTick ?? 0 });
  }
  // 补王（gen 同构；noAutoKing 场景跳过）
  if (!sc.fixture.noAutoKing) {
    let kingSeq = 1000;
    for (const c of w.civs) {
      if (!c || !c.alive || c.pop <= 0) continue;
      if (c.kingId != null && c.kingId !== -1) continue;
      const wid = kingSeq++;
      const t0 = c.tiles.length > 0 ? c.tiles[0] : 0;
      putUnit(w, { id: wid, civ: c.id, x: t0 % 256 + 0.5, y: ((t0 / 256) | 0) + 0.5, king: 1 });
      c.kingId = wid;
    }
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
    if (sc.fixture.hostTicks) {
      for (const iss of sc.fixture.issue ?? []) if (iss.at === t) IssueDirective(w, iss.civ, iss.kind, iss.param ?? 0, iss.target);
      if (w.tickCount % 30 === 0) DirectiveTick(w);
      if (w.tickCount % 300 === 23) AllianceTick(w);
    }
    w.tickCount++;
    traces.push(traceOf(w, t));
  }
  return traces;
}

function putUnit(w, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.x, ty: o.y,
    hp: o.hp ?? 10, maxHp: o.hp ?? 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0, cd: 0, trait: 0,
    job: o.job ?? 0, king: o.king ?? 0, infected: 0, flip: 0, name: `u${o.id}`,
    hurt: 0, breath: 0, parity: 0, dead: o.dead ?? 0, boat: o.boat ?? 0, boatTTL: 0, caravan: o.caravan ?? 0,
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
    // —— M-U3c 扩展段（gen dumpUnit/dumpWar/dumpAlliance/dumpDirective/dumpEvo 同构）——
    units: w.units.map((u) => ({
      id: u.id, name: u.name, race: u.race, civ: u.civ,
      x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx), ty: f64hex(u.ty),
      hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), dmg: f64hex(u.dmg), speed: f64hex(u.speed),
      job: u.job ?? 0, king: u.king ? 1 : 0, boat: u.boat ?? 0, boatTTL: u.boatTTL ?? 0, dead: u.dead ?? 0,
    })),
    warData: mapEntries(w.warData).map(([, wd]) => ({
      key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick, startYear: wd.startYear, total: wd.total,
      aggressor: wd.aggressor, reason: wd.reason, reasonText: wd.reasonText, goal: wd.goal,
      giveUpAt: wd.giveUpAt, popA0: wd.popA0, popB0: wd.popB0, lastActiveTick: wd.lastActiveTick,
    })),
    raceRel: mapEntries(w.raceRel),
    totalWars: [...w.totalWars].sort(),
    warHistory: [...w.warHistory],
    statWars: w.statWars,
    civSeq: w.civSeq,
    alliances: w.alliances.map((al) => ({ id: al.id, name: al.name, members: [...al.members], leader: al.leader, cohesion: al.cohesion, formedTick: al.formedTick, formedYear: al.formedYear ?? null, warsTogether: al.warsTogether ?? 0, colorHex: al.colorHex, bonded: al.bonded === true ? true : undefined })),
    directives: w.directives.map((d) => ({ id: d.id, civ: d.civ, kind: d.kind, target: d.target === undefined ? null : d.target, param: d.param ?? null, status: d.status, startTick: d.startTick ?? null, deadlineTick: d.deadlineTick ?? null, text: d.text ?? null, endTick: d.endTick === undefined ? null : d.endTick, endText: d.endText === undefined ? null : d.endText, killCount: d.killCount === undefined ? null : d.killCount })),
    evoNodes: w.evoNodes.map((n) => ({ id: n.id, kind: n.kind, name: n.name, parent: n.parent ?? null, year: n.year, colorHex: n.colorHex, detail: n.detail, stat: n.stat ?? null })),
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
    techModCache.clear(); // 静态科技缓存跨场景污染防护（engine generate 每次新建；C# NUnit 同需 ClearTechModCache）
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
        gov: c.gov ?? 0, govYear: 0, stability: c.stability ?? 70, culture: c.culture ?? 0,
        militarism: c.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
        kingId: c.kingId ?? undefined, kingName: c.kingName ?? 'K', banner: c.banner ?? 'B',
        colorHex: c.colorHex ?? '#c83c3c', color: c.color ?? [200, 60, 60],
        tiles: c.tiles ? [...c.tiles] : [], frontier: c.frontier ? [...c.frontier] : [],
      };
      w.civs.push(civ);
      w.civs[civ.id] = civ;
      w.civSeq = Math.max(w.civSeq, (c.id ?? 0) + 1); // gen mkCiv civSeq 游标同步（createCiv id 不撞车）
      for (const i of civ.tiles) w.owner[i] = civ.id;
    }
    for (const u of sc.fixture.units ?? []) putUnit(w, u);
    if (!sc.fixture.noAutoKing) {
      let kingSeq = 1000;
      for (const c of w.civs) {
        if (!c || !c.alive || c.pop <= 0) continue;
        if (c.kingId != null && c.kingId !== -1) continue;
        const wid = kingSeq++;
        const t0 = c.tiles.length > 0 ? c.tiles[0] : 0;
        putUnit(w, { id: wid, civ: c.id, x: t0 % 256 + 0.5, y: ((t0 / 256) | 0) + 0.5, king: 1 });
        c.kingId = wid;
      }
    }
    for (const [a, b, v] of sc.fixture.rel ?? []) w.rel.set(pairKey(a, b), v);
    for (const [a, b, v] of sc.fixture.tension ?? []) w.tension.set(pairKey(a, b), v);
    for (const mk of sc.fixture.met ?? []) w.met.add(mk);
    for (const d of sc.fixture.directives ?? []) {
      w.directives.push({ id: d.id, civ: d.civ, kind: d.kind, target: d.target, param: d.param ?? 0, status: d.status ?? 'active', startTick: d.startTick ?? 0, deadlineTick: d.deadlineTick ?? 0, text: d.text ?? '', killCount: d.killCount });
      w.dirSeq = Math.max(w.dirSeq ?? 1, (d.id ?? 0) + 1); // gen mkDirective 游标同步
    }
    for (const al of sc.fixture.alliances ?? []) {
      const a2 = { id: al.id, name: al.name ?? `A${al.id}`, members: [...al.members], leader: al.leader ?? al.members[0], cohesion: al.cohesion ?? 55, formedTick: al.formedTick ?? 0, formedYear: al.formedYear ?? 0, warsTogether: al.warsTogether ?? 0, colorHex: al.colorHex ?? '#14b8a6', bonded: al.bonded === true };
      w.alliances.push(a2);
      for (const m of a2.members) w.allianceOf.set(m, a2.id);
    }
    for (const wd of sc.fixture.wars ?? []) {
      w.warData.set(wd.key, { key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick ?? 0, startYear: wd.startYear ?? 0, total: wd.total ?? false, scoreA: 0, scoreB: 0, exA: 0, exB: 0, casA: 0, casB: 0, razedA: 0, razedB: 0, battles: 0, giveUpAt: wd.giveUpAt ?? 0, reason: wd.reason ?? 'border', reasonText: wd.reasonText ?? '', aggressor: wd.aggressor ?? 0, goal: wd.goal ?? 0, goalNow: 0, occA: 0, occB: 0, popA0: wd.popA0 ?? 0, popB0: wd.popB0 ?? 0, lastActiveTick: wd.lastActiveTick ?? 0 });
    }
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
      if (sc.fixture.hostTicks) {
        for (const iss of sc.fixture.issue ?? []) if (iss.at === t) IssueDirective(w, iss.civ, iss.kind, iss.param ?? 0, iss.target);
        if (w.tickCount % 30 === 0) DirectiveTick(w);
        if (w.tickCount % 300 === 23) AllianceTick(w);
      }
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
            console.log('  got :', JSON.stringify(ta[k])?.slice(0, 9000));
            console.log('  want:', JSON.stringify(tb[k])?.slice(0, 9000));
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
