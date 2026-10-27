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
    emTechs: new Map(), emTechSeq: 1, // M-U3e 涌现科技注册表
    // M-U3f 经济/社会域（C# WbWorld 同构）
    govCache: new Map(), lastGovEventTick: new Map(), civHomogeneity: new Map(), seasonOffset: 0,
    overlayMode: 'none', overlayDirty: true,
    evoNodes: [], evoSeq: 0, evoIndex: new Map(),
    laws: { wars: true, cityGrowth: true, rebels: true, seasons: true },
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
      // —— M-U3e：余下 24 项全量补齐（tech.ts L201-226 逐字保真） ——
      case 'printing': m.know += 0.5; m.cult += 0.3; break;
      case 'banking': m.gold += 0.35; break;
      case 'astronomy': m.col -= 0.3; break;
      case 'medicine': m.plague -= 0.45; break;
      case 'gothic': m.bhp += 0.25; m.repair += 0.6; break;
      case 'republic': m.stab += 15; m.gold += 0.2; break;
      case 'steel': m.dmg += 0.2; m.hp += 0.12; break;
      case 'legion': m.armyMax += 2; m.morale += 6; break;
      case 'steam': m.bhp += 0.4; m.repair += 0.8; break;
      case 'gunpowder': m.dmg += 0.25; break;
      case 'assembly': m.gold += 0.6; break;
      case 'sanitation': m.repro += 0.12; m.plague -= 0.3; break;
      case 'rifling': m.range += 2.5; m.archer += 0.3; break;
      case 'explosives': m.dmg += 0.15; m.arty += 1; break;
      case 'flight': m.bomber += 1; break;
      case 'atomic': m.nukeCap += 1; break;
      case 'electronics': m.know += 0.6; break;
      case 'singularity': m.ai += 1; m.stab += 10; m.know += 0.4; break;
      case 'robotics': m.mech += 1; m.repair += 1.0; m.bhp += 0.4; break;
      case 'lasers': m.laser += 1; m.dmg += 0.2; break;
      case 'drones': m.drone += 1; break;
      case 'orbital': m.orbital += 1; break;
      case 'plasma': m.plasma += 1; m.dmg += 0.15; break;
      case 'antimatter': m.antiMatter += 1; break;
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
  // v3：涌现科技效果叠加（emergence.ts applyEmTechMods）
  if (c && w.emTechs.size > 0) {
    for (const key of c.techs) {
      const em = w.emTechs.get(key);
      if (em) ApplyEmTechMods(mods, em);
    }
  }
  techModCache.set(civId, mods);
  return mods;
}

// ==================== M-U3e 科技研发域（WbCivSim.cs/WbTech.cs 机械翻译同构） ====================
const TECHS_TABLE = [
  { key: 'fire', name: '火种', cat: 'agri', era: 0, cost: 4, deps: [], desc: '熟食烹饪：繁衍速度 +8%' },
  { key: 'stone', name: '石器打磨', cat: 'military', era: 0, cost: 5, deps: [], desc: '锋利石斧：战士伤害 +10%' },
  { key: 'shelter', name: '筑巢术', cat: 'eng', era: 0, cost: 5, deps: [], desc: '梁柱结构：建筑耐久 +15%' },
  { key: 'clan', name: '氏族血亲', cat: 'civic', era: 0, cost: 6, deps: [], desc: '长老议事：稳定度 +8' },
  { key: 'song', name: '图腾歌舞', cat: 'culture', era: 0, cost: 6, deps: [], desc: '篝火节庆：文化积累 +50%' },
  { key: 'gather', name: '采集术', cat: 'econ', era: 0, cost: 6, deps: [], desc: '采集储藏：人口税基 +20%' },
  { key: 'raft', name: '木筏', cat: 'naval', era: 0, cost: 8, deps: [], desc: '漂流远航：殖民间隔 -10%' },
  { key: 'pottery', name: '陶器', cat: 'econ', era: 0, cost: 8, deps: ['fire'], desc: '储粮储水：人口税基 +15%' },
  { key: 'irrigation', name: '农耕灌溉', cat: 'agri', era: 1, cost: 14, deps: ['fire'], desc: '沟渠引水：农田容量 +1，繁衍 +8%' },
  { key: 'bronze', name: '青铜冶炼', cat: 'military', era: 1, cost: 16, deps: ['stone'], desc: '青铜兵器：全军伤害 +15%' },
  { key: 'writing', name: '文字', cat: 'culture', era: 1, cost: 14, deps: ['song'], desc: '楔形刻痕：知识产出 +30%' },
  { key: 'masonry', name: '石匠工艺', cat: 'eng', era: 1, cost: 15, deps: ['shelter'], desc: '凿石垒砌：建筑耐久 +25%，修复速度 +50%' },
  { key: 'currency', name: '铸币', cat: 'econ', era: 1, cost: 15, deps: ['gather', 'pottery'], desc: '金属通货：集市收入 +40%' },
  { key: 'sail', name: '帆船', cat: 'naval', era: 1, cost: 18, deps: ['raft'], desc: '乘风破浪：殖民间隔 -20%' },
  { key: 'law', name: '成文法典', cat: 'civic', era: 1, cost: 20, deps: ['clan', 'writing'], desc: '律令昭彰：稳定度 +12，叛乱风险降低' },
  { key: 'crossbow', name: '弩机', cat: 'military', era: 1, cost: 20, deps: ['bronze'], desc: '弩矢穿透：弓手伤害 +20%' },
  { key: 'plow', name: '重犁轮作', cat: 'agri', era: 2, cost: 30, deps: ['irrigation'], desc: '深耕细作：繁衍速度 +12%' },
  { key: 'iron', name: '铁器锻造', cat: 'military', era: 2, cost: 30, deps: ['bronze'], desc: '铁剑铁甲：全军伤害 +18%，生命 +10%' },
  { key: 'guild', name: '行会制度', cat: 'econ', era: 2, cost: 30, deps: ['currency'], desc: '匠人行会：全部经济收入 +25%' },
  { key: 'theology', name: '神学', cat: 'culture', era: 2, cost: 30, deps: ['writing'], desc: '经院哲学：文化积累 +80% 解锁神权政体' },
  { key: 'fortification', name: '城墙堡垒', cat: 'eng', era: 2, cost: 32, deps: ['masonry'], desc: '瓮城箭楼：建筑耐久 +30%' },
  { key: 'compass', name: '罗盘', cat: 'naval', era: 2, cost: 32, deps: ['sail'], desc: '指北磁针：殖民间隔 -25%' },
  { key: 'feudal', name: '封建采邑', cat: 'civic', era: 2, cost: 34, deps: ['law'], desc: '分封效忠：税基 +30%（稳定 -4）' },
  { key: 'tactics', name: '方阵战术', cat: 'military', era: 2, cost: 36, deps: ['iron'], desc: '进退如一：军团士气上限 +8、恢复 +50%' },
  { key: 'machinery', name: '机械装置', cat: 'eng', era: 2, cost: 38, deps: ['fortification'], desc: '绞盘滑轮：修复速度 +60% 陷阱→攻城强化' },
  { key: 'crop4', name: '良种选育', cat: 'agri', era: 3, cost: 52, deps: ['plow'], desc: '良种轮种：繁衍速度 +15%' },
  { key: 'printing', name: '活字印刷', cat: 'culture', era: 3, cost: 55, deps: ['theology'], desc: '知识传布：知识产出 +50%，文化 +30%' },
  { key: 'banking', name: '银行信贷', cat: 'econ', era: 3, cost: 55, deps: ['guild'], desc: '金库汇票：全部经济收入 +35%' },
  { key: 'astronomy', name: '天文航海', cat: 'naval', era: 3, cost: 60, deps: ['compass'], desc: '星图导航：殖民间隔 -30%' },
  { key: 'medicine', name: '医学', cat: 'culture', era: 3, cost: 58, deps: ['printing'], desc: '瘟疫医生：瘟疫传播 -45%' },
  { key: 'gothic', name: '哥特拱券', cat: 'eng', era: 3, cost: 55, deps: ['machinery'], desc: '飞扶壁尖拱：建筑耐久 +25%，修复 +60%' },
  { key: 'republic', name: '共和宪政', cat: 'civic', era: 3, cost: 65, deps: ['feudal', 'printing'], desc: '市民议会：稳定 +15，收入 +20% 解锁共和政体' },
  { key: 'steel', name: '钢铁淬火', cat: 'military', era: 3, cost: 60, deps: ['tactics'], desc: '板甲钢刃：全军伤害 +20%，生命 +12%' },
  { key: 'legion', name: '帝国军制', cat: 'military', era: 3, cost: 75, deps: ['steel'], desc: '常备军团：军团上限 +2，士气 +6 解锁帝国政体' },
  { key: 'steam', name: '蒸汽机', cat: 'eng', era: 4, cost: 85, deps: ['machinery'], desc: '锅炉与活塞：建筑耐久 +40%，修复 +80%' },
  { key: 'gunpowder', name: '火药', cat: 'military', era: 4, cost: 88, deps: ['steel', 'machinery'], desc: '黑火药枪械：全军伤害 +25% 解锁火器军备' },
  { key: 'assembly', name: '流水装配', cat: 'econ', era: 4, cost: 95, deps: ['banking', 'steam'], desc: '标准化生产：全部经济收入 +60%' },
  { key: 'sanitation', name: '公共卫生', cat: 'agri', era: 4, cost: 92, deps: ['crop4', 'medicine'], desc: '下水道与疫苗：繁衍 +12%，瘟疫传播 -30%' },
  { key: 'rifling', name: '线膛枪', cat: 'military', era: 4, cost: 110, deps: ['gunpowder'], desc: '膛线旋进：远程射程 +2.5，射击伤害 +30%' },
  { key: 'explosives', name: '高爆炸药', cat: 'military', era: 4, cost: 125, deps: ['gunpowder'], desc: '苦味酸与 TNT：全军伤害 +15% 解锁火炮轰击' },
  { key: 'flight', name: '航空引擎', cat: 'eng', era: 4, cost: 140, deps: ['steam', 'astronomy'], desc: '双翼机凌空：解锁战时空袭轰炸' },
  { key: 'atomic', name: '原子能工程', cat: 'military', era: 4, cost: 185, deps: ['explosives', 'flight'], desc: '裂变之火：解锁核打击——终极世界大战的终局武器' },
  { key: 'electronics', name: '电子计算', cat: 'eng', era: 5, cost: 160, deps: ['atomic'], desc: '硅基心智：知识产出 +60%' },
  { key: 'singularity', name: '奇点智能', cat: 'civic', era: 5, cost: 240, deps: ['electronics', 'republic'], desc: '超越性 AI 治军：军团获得战术智能（会评估会战/主动增援/战术撤退），稳定 +10' },
  { key: 'robotics', name: '机器人学', cat: 'eng', era: 5, cost: 210, deps: ['electronics', 'assembly'], desc: '钢铁之躯：修复 +100%，建筑耐久 +40%，解锁机甲军团（行军/围城/会战全面机械化）' },
  { key: 'lasers', name: '定向能武器', cat: 'military', era: 5, cost: 200, deps: ['electronics', 'rifling'], desc: '光束即刀刃：全军伤害 +20%，解锁激光炮台（战时精确狙杀）' },
  { key: 'drones', name: '无人机蜂群', cat: 'military', era: 5, cost: 240, deps: ['robotics', 'flight'], desc: '蔽日蜂群：解锁蜂群打击（自主游猎敌军与建筑）' },
  { key: 'orbital', name: '轨道天基', cat: 'eng', era: 5, cost: 300, deps: ['robotics', 'astronomy'], desc: '天基动能平台：解锁轨道天罚（天顶坠落的钨棒）' },
  { key: 'plasma', name: '等离子体', cat: 'military', era: 5, cost: 320, deps: ['lasers', 'explosives'], desc: '物质第四态：伤害 +15%，解锁等离子炮（爆破 + 电磁脉冲击溃士气）' },
  { key: 'antimatter', name: '反物质工程', cat: 'military', era: 5, cost: 420, deps: ['plasma', 'atomic'], desc: '湮灭即终极：解锁反物质打击——终局狂热阶段的天启武器' },
];
const TECH_BY_KEY2 = Object.fromEntries(TECHS_TABLE.map((t) => [t.key, t]));
// EM 词库（emergence.ts L298-326；'−' = U+2212 蓝本原文）
const EM_PREFIX = ['量子', '纳米', '等离子', '基因', '光子', '超导', '混沌', '灵能', '暗物质', '弦', '晶格', '磁悬浮', '熵减', '聚变', '深空', '引力'];
const EM_FIELD_NAME = ['冶金学', '护盾工程', '农艺', '算术', '航海术', '财税学', '营造法式', '市场学', '战术学', '医道', '弹道学', '射艺', '礼乐', '治理术', '营缮学', '军制'];
const EM_FIELD_CAT = ['military', 'eng', 'agri', 'culture', 'naval', 'econ', 'eng', 'econ', 'military', 'culture', 'military', 'military', 'culture', 'civic', 'eng', 'military'];
const EM_FIELD_EFF = ['dmg', 'hp', 'repro', 'know', 'col', 'tax', 'bhp', 'gold', 'morale', 'plague', 'range', 'archer', 'cult', 'stab', 'repair', 'armyMax'];
const EM_EFF_NAME = { dmg: '全军伤害', hp: '全军生命', bhp: '建筑耐久', gold: '经济收入', know: '知识产出', repro: '繁衍速度', col: '殖民速度', tax: '人口税基', cult: '文化积累', repair: '修复速度', morale: '军团士气', armyMax: '军团上限', archer: '射手伤害', plague: '瘟疫传播', range: '远程射程', stab: '稳定度' };
const ROMAN12 = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
function InventTech(w, mil, cult, rich, gen) {
  const n = EM_FIELD_NAME.length;
  const wt = [];
  let total = 0;
  for (let i = 0; i < n; i++) {
    let b = 1;
    if (EM_FIELD_CAT[i] === 'military') b *= 0.5 + mil * 1.5;
    if (EM_FIELD_CAT[i] === 'culture') b *= 0.5 + cult * 1.5;
    if (EM_FIELD_CAT[i] === 'econ') b *= 0.6 + rich * 1.4;
    wt.push(b);
    total += b;
  }
  let roll = Rng(w) * total;
  let field = 0;
  for (let i = 0; i < n; i++) {
    roll -= wt[i];
    if (roll <= 0) { field = i; break; }
  }
  const prefix = EM_PREFIX[Math.floor(Rng(w) * EM_PREFIX.length)];
  const suffix = gen > 12 ? `·${ROMAN12[Math.min(11, Math.floor(gen / 12))]}` : '';
  const name = `${prefix}${EM_FIELD_NAME[field]}${suffix}`;
  const effs = [];
  const mag = (k) => {
    const t = 1 + Math.min(0.8, gen * 0.04);
    if (k === 'morale' || k === 'armyMax' || k === 'range' || k === 'stab') return jsRound((2 + Rng(w) * 3) * t);
    return jsRound((0.05 + Rng(w) * 0.07) * t * 1000) / 1000;
  };
  effs.push({ k: EM_FIELD_EFF[field], v: mag(EM_FIELD_EFF[field]) });
  if (Rng(w) < 0.35) {
    const other = Math.floor(Rng(w) * n);
    if (EM_FIELD_EFF[other] !== EM_FIELD_EFF[field]) effs.push({ k: EM_FIELD_EFF[other], v: mag(EM_FIELD_EFF[other]) });
  }
  const desc = effs.map((e) => `${EM_EFF_NAME[e.k]} ${e.k === 'plague' ? '\u2212' : '+'}${jsRound(e.v * (e.v < 1 ? 100 : 1))}${e.v < 1 ? '%' : ''}`).join('，');
  return { key: `em${gen}`, name, cat: EM_FIELD_CAT[field], cost: jsRound(110 + gen * 14 + Rng(w) * 30), gen, effects: effs, desc };
}
function ApplyEmTechMods(mods, t) {
  for (const e of t.effects) {
    mods[e.k] = (mods[e.k] ?? 0) + (e.k === 'plague' ? -Math.abs(e.v) : e.v);
  }
}
function CivCenterX(w, c) {
  if (c.capital >= 0) return WbTileX(c.capital) + 0.5;
  return c.tiles.length > 0 ? WbTileX(c.tiles[(c.tiles.length / 2) | 0]) : W / 2;
}
function CivCenterY(w, c) {
  if (c.capital >= 0) return WbTileY(c.capital) + 0.5;
  return c.tiles.length > 0 ? WbTileY(c.tiles[(c.tiles.length / 2) | 0]) : H / 2;
}
function AvailableTechs(c) {
  const owned = new Set(c.techs ?? []);
  return TECHS_TABLE.filter((t) => !owned.has(t.key) && t.deps.every((d) => owned.has(d)));
}
function PickResearch(w, c) {
  const avail = AvailableTechs(c);
  if (avail.length === 0) return null;
  const mil = (c.militarism ?? 30) / 100;
  const cul = Math.min(1, (c.culture ?? 0) / 120);
  const rich = Math.min(1, (c.gold ?? 0) / 200);
  const wt = avail.map((t) => {
    let base = 1;
    if (t.cat === 'military') base *= 0.5 + mil * 1.6;
    if (t.cat === 'culture') base *= 0.5 + cul * 1.6;
    if (t.cat === 'econ') base *= 0.6 + rich * 1.4;
    if (t.cat === 'civic') base *= 0.7 + (100 - (c.stability ?? 70)) / 150;
    if (t.cat === 'naval') base *= 0.7;
    if (t.cat === 'agri') base *= 0.8 + Math.min(0.8, c.pop / 100);
    if (t.cat === 'eng') base *= 0.9;
    return base;
  });
  let total = 0;
  for (const x of wt) total += x;
  let roll = Rng(w) * total;
  for (let i = 0; i < avail.length; i++) {
    roll -= wt[i];
    if (roll <= 0) return avail[i].key;
  }
  return avail[avail.length - 1].key;
}
function FundResearch(w, c, points) {
  if (points <= 0) return 0;
  if (!c.research) {
    const pick = PickResearch(w, c) ?? InventEmTech(w, c);
    if (!pick) return 0;
    c.research = pick;
    c.researchP = 0;
    const def0 = TECH_BY_KEY2[pick];
    const em0 = w.emTechs.get(pick);
    AddEvent(w, 'tech', `「${c.name}」的学者们开始研究「${def0?.name ?? em0?.name ?? pick}」`, c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
  }
  const def = TECH_BY_KEY2[c.research];
  const em = w.emTechs.get(c.research);
  if (!def && !em) { c.research = null; return 0; }
  const cost = def ? def.cost : em.cost;
  const start = c.researchP;
  // 联盟互连：盟友已掌握的科技 → 研究效率 ×1.2（bonded 1.32）
  const alF = AllianceOfCiv(w, c.id);
  let diffusion = 1;
  if (alF) {
    for (const m of alF.members) {
      if (m === c.id) continue;
      const mc = civAt(w, m);
      if (mc && mc.alive && (mc.techs ?? []).includes(c.research)) { diffusion = alF.bonded ? 1.32 : 1.2; break; }
    }
  }
  c.researchP = start + points * diffusion;
  if (c.researchP >= cost) {
    CompleteTech(w, c, c.research);
    return Math.max(0, cost - start);
  }
  return points;
}
function CompleteTech(w, c, key) {
  c.techs.push(key);
  const def = TECH_BY_KEY2[key];
  const em = w.emTechs.get(key);
  c.research = null;
  c.researchP = 0;
  techModCache.delete(c.id);
  {
    const nm = TechModsOf(w, c.id); // 缓存已删，重算即新值
    if (nm.dmg !== 1 || nm.hp !== 1) {
      for (const u of w.units) {
        if (u.dead || u.civ !== c.id) continue;
        const rd = nm.dmg / (u.tDmg ?? 1);
        const rh = nm.hp / (u.tHp ?? 1);
        if (rd !== 1) u.dmg = Math.max(1, u.dmg * rd);
        if (rh !== 1) {
          const ratio = u.hp / u.maxHp;
          u.maxHp = Math.max(1, jsRound(u.maxHp * rh));
          u.hp = Math.min(u.maxHp, Math.max(1, jsRound(u.maxHp * ratio)));
        }
        u.tDmg = nm.dmg;
        u.tHp = nm.hp;
      }
    }
  }
  AddEvent(w, 'tech', `「${c.name}」研发出「${def?.name ?? em?.name ?? key}」—— ${def?.desc ?? em?.desc ?? ''}`, c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
  if ((def && def.era >= 2) || (em && em.gen % 5 === 0)) {
    Toast(w, `「${c.name}」掌握了「${def?.name ?? em?.name ?? key}」`, 'info');
  }
  if (def && (def.key === 'masonry' || def.key === 'fortification' || def.key === 'gothic')) {
    const mul = TechModsOf(w, c.id).bhp;
    for (const b of w.buildings) {
      if (b.civ !== c.id) continue;
      const base = BUILDING_DEFS[b.kind]?.hp ?? 70;
      const max = jsRound(base * mul);
      w.bHp.set(b.i, Math.min(max, (w.bHp.get(b.i) ?? base) + base * 0.25));
    }
  }
}
function InventEmTech(w, c) {
  if (w.emTechs.size >= 60) return null;
  const t = InventTech(w, (c.militarism ?? 30) / 100, Math.min(1, (c.culture ?? 0) / 120), Math.min(1, (c.gold ?? 0) / 200), w.emTechSeq);
  t.key = `em${w.emTechSeq++}`;
  w.emTechs.set(t.key, t);
  RecordEvo(w, 'tech', t.name, null, c.colorHex, `${t.desc}（${c.name} 的第 ${t.gen} 项涌现发明）`, t.desc, null);
  AddEvent(w, 'emerge', `「${c.name}」的学者穷尽了既有典籍，开创出前所未有的学问——「${t.name}」（${t.desc}）`, c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
  Toast(w, `「${c.name}」发明了「${t.name}」`, 'good');
  return t.key;
}
function TechTick(w) {
  for (const c of w.civs) {
    if (!c || !c.alive || c.pop <= 0) continue;
    if (!c.research && (c.knowledge ?? 0) < 40 && Rng(w) < 0.35) {
      FundResearch(w, c, Rng(w) < 0.5 ? 1 : 0);
    }
  }
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

// ---------------- M-U3f 种族社会属性（types.ts RACES isCiv 六族稀疏表 + ?? 0.5 回退 —— C# RacesIndustry 同构） ----------------
const RACES_INDUSTRY = { 0: 0.6, 1: 0.3, 2: 0.9, 3: 0.3, 19: 0.45, 20: 0.4 };
const RACES_ARCANE = { 0: 0.35, 1: 0.85, 2: 0.4, 3: 0.15, 19: 0.45, 20: 0.3 };
const RACES_PIETY = { 0: 0.4, 1: 0.75, 2: 0.35, 3: 0.25, 19: 0.5, 20: 0.2 };
const RACES_HARMONY = { 0: 0.7, 1: 0.5, 2: 0.45, 3: 0.25, 19: 0.4, 20: 0.35 };
const raceIndustryOf = (r) => (r in RACES_INDUSTRY ? RACES_INDUSTRY[r] : 0.5);
const raceArcaneOf = (r) => (r in RACES_ARCANE ? RACES_ARCANE[r] : 0.5);
const racePietyOf = (r) => (r in RACES_PIETY ? RACES_PIETY[r] : 0.5);
const raceHarmonyOf = (r) => (r in RACES_HARMONY ? RACES_HARMONY[r] : 0.5);

// engine tick() 季节 getter（nature.ts L160-163）—— 黄金驱动 yearF 恒 0
function NatureSeason(w) {
  if (!w.laws.seasons) return 1; // 永夏
  const s = (Math.floor(w.yearF / 2) + w.seasonOffset) % 4; // SEASON_YEARS = 2
  return s < 0 ? s + 4 : s;
}

// GOV_DEFS（tech.ts L242-248）—— setGov 播报用
const GOV_DEFS = [
  { key: 'tribal', name: '部落制', desc: '长老围坐篝火议事，血脉即律法' },
  { key: 'monarchy', name: '君主制', desc: '王冠与权杖，世袭的秩序' },
  { key: 'theocracy', name: '神权制', desc: '神谕高过王令，祭司执掌尘世' },
  { key: 'republic', name: '共和制', desc: '市民的广场与选票' },
  { key: 'empire', name: '帝国制', desc: '铁蹄与大道，万邦来朝' },
];

// IDEA 词表（emergence.ts L435-446 逐字保真）
const IDEA_PRE = ['军功爵', '重商', '垦荒', '天工', '航海', '民本', '格物', '荣耀', '万学', '大同', '无为', '铁律'];
const IDEA_POST = ['主义', '律令', '学会', '改革', '之道', '运动'];
const IDEA_BODY = [
  { name: '重商', desc: '商路即国脉', mods: { gold: 0.18 } },
  { name: '军功爵', desc: '斩首授田，武士阶层的上升阶梯', mods: { mil: 0.06, stab: -1 } },
  { name: '民本', desc: '民为邦本，本固邦宁', mods: { stab: 3, repro: 0.05 } },
  { name: '格物', desc: '致知在格物', mods: { know: 0.22 } },
  { name: '垦荒', desc: '寸土不荒', mods: { repro: 0.08, gold: 0.06 } },
  { name: '偃武', desc: '铸剑为犁', mods: { wear: -0.15, mil: -0.05 } },
  { name: '铁律', desc: '令行禁止', mods: { stab: 4, gold: -0.05 } },
  { name: '万学', desc: '百花齐放', mods: { know: 0.15, stab: 1 } },
];

function InventIdea(w, seq) {
  const pick = (arr) => arr[Math.floor(Rng(w) * arr.length)];
  const body = pick(IDEA_BODY);
  const post = pick(IDEA_POST);
  const pre = Rng(w) < 0.2 ? pick(IDEA_PRE) : '';
  const jitter = (v, amt) => v === undefined ? undefined : Math.round((v + (Rng(w) - 0.5) * amt) * 1000) / 1000;
  const mods = {
    gold: jitter(body.mods.gold, 0.08),
    stab: body.mods.stab !== undefined ? Math.round(body.mods.stab + (Rng(w) - 0.5) * 1.5) : undefined,
    mil: jitter(body.mods.mil, 0.02),
    know: jitter(body.mods.know, 0.08),
    repro: jitter(body.mods.repro, 0.03),
    wear: jitter(body.mods.wear, 0.06),
  };
  const effBits = [];
  if (mods.gold) effBits.push(`收入 +${Math.round(mods.gold * 100)}%`);
  if (mods.stab) effBits.push(`稳定 ${mods.stab > 0 ? '+' : ''}${mods.stab}`);
  if (mods.mil) effBits.push(`军国倾向 ${mods.mil > 0 ? '+' : ''}${Math.round(mods.mil * 100)}/十年`);
  if (mods.know) effBits.push(`知识 +${Math.round(mods.know * 100)}%`);
  if (mods.repro) effBits.push(`繁衍 +${Math.round(mods.repro * 100)}%`);
  if (mods.wear) effBits.push(`厌战 ${mods.wear > 0 ? '+' : ''}${Math.round(mods.wear * 100)}%`);
  return { key: `id${seq}`, name: `${pre}${body.name}${post}`, desc: `${body.desc} —— ${effBits.join('，')}`, mods };
}

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

// ==================== M-U3f 经济/社会域镜像（engine L4800-5136 + L8806-8830） ====================
// GovOf 已有（M-U3d L1467 箭头版）—— 语义同 engine govOf L4877

/// engine economyTick L4800-4854（每 %120===0；hostTicks 门在驱动循环）
function EconomyTick(w) {
  for (const c of w.civs) {
    if (!c || !c.alive || c.pop <= 0) continue;
    const counts = w.civBuildCounts.get(c.id);
    if (!counts) continue;
    const markets = counts[BK.MARKET] ?? 0;
    const libraries = counts[BK.LIBRARY] ?? 0;
    const temples = counts[BK.TEMPLE] ?? 0;
    const ports = counts[BK.PORT] ?? 0;
    // 旨意加成：富国令财富产出 ×2 / 启智令知识产出 ×2（文明自行达成的引擎）
    const wealthBoost = ActiveDirective(w, c.id, 'wealth') ? 2 : 1;
    const wisdomBoost = ActiveDirective(w, c.id, 'wisdom') ? 2 : 1;
    // —— 科技/社会加成：税基×tech.tax×政体 / 经济×tech.gold / 知识×tech.know（文化反哺）——
    const tm = TechModsOf(w, c.id);
    const im = IdeaModsOf(w, c.id); // v3：涌现理念加成（经济/知识）
    const gov = GovOf(w, c.id);
    const cultKnow = 1 + Math.min(0.5, (c.culture ?? 0) * 0.002); // 文化反哺学术（上限 +50%）
    const govTaxMul = gov === 1 ? 1.1 : gov === 2 ? 1.0 : gov === 3 ? 1.0 : gov === 4 ? 1.05 : 1;
    // —— 种族互连：勤勉种族的税基更丰厚（矮人的工坊永不熄火）——
    const industryMul = 0.8 + raceIndustryOf(c.race) * 0.4;
    // —— 季节互连：冬季雪封商路，集市与港口收入 ×0.9 ——
    const winterMul = NatureSeason(w) === 3 ? 0.9 : 1;
    const taxBase = Math.floor(c.pop * 0.05 * tm.tax * govTaxMul);
    // —— 财富饱和：囤积低效（官僚损耗随库藏膨胀 → 净入账递减 —— 软上限防数万金通胀） ——
    const hoard = c.gold ?? 0;
    const drag = 1 / (1 + hoard / 900);
    // —— 联盟互连：盟友间商贸一体化，关税减免 ×1.15（盟内市场优先繁荣）——
    const alE = AllianceOfCiv(w, c.id);
    const allyTrade = alE && alE.members.length >= 2 ? (alE.bonded ? 1.25 : 1.15) : 1;
    const income = Math.max(0, Math.round((markets * 3 + temples * 1 + ports * 2 + taxBase) * wealthBoost * tm.gold * (gov === 3 ? 1.25 : 1) * (1 + im.gold) * industryMul * winterMul * allyTrade * drag));
    // —— 军团军饷：现役军团成员人均 0.12 金/tick 段（军国主义高涨的国家咬牙供养）——
    let upkeep = 0;
    for (const a of w.armies) {
      if (a.civ === c.id && a.state !== 'retreat') upkeep += a.members.length * 0.12; // 军饷（战时大军是吞金兽）
    }
    upkeep += (counts[BK.CASTLE] ?? 0) * 0.5 + (counts[BK.TOWER] ?? 0) * 0.15; // 城防维护
    c.income = income;
    c.expense = Math.round(upkeep * 10) / 10;
    c.gold = Math.max(0, (c.gold ?? 0) + income - upkeep);
    // —— 军饷欠饷：国库见底 → 军团士气滑落（帝国过度扩张的代价）——
    if ((c.gold ?? 0) <= 0 && upkeep > 2) {
      for (const a of w.armies) {
        if (a.civ === c.id) a.morale = Math.max(0, a.morale - 0.5);
      }
    }
    // —— 知识：种族奥术天赋（精灵的魔法学术）× 冬季蛰居苦读（×1.05 反向补偿）——
    const arcaneMul = 0.8 + raceArcaneOf(c.race) * 0.45;
    const knowGain = Math.round((libraries * 2 + (c.pop > 20 ? 1 : 0)) * wisdomBoost * tm.know * cultKnow * (gov === 2 ? 1.15 : 1) * (1 + im.know) * arcaneMul * (NatureSeason(w) === 3 ? 1.05 : 1));
    // 知识优先投入研究（科技研发体系），余量入国库知识存量（解锁建筑）
    const spent = FundResearch(w, c, knowGain);
    c.knowledge = (c.knowledge ?? 0) + (knowGain - spent);
  }
}

/// engine recentVictory L5088-5094（战争分数结算中最近 200-300 tick 窗口内取胜）
function RecentVictory(w, civId) {
  for (const wd of w.warData.values()) {
    const winner = wd.scoreA > wd.scoreB ? wd.a : wd.b;
    if (winner === civId && w.tickCount - wd.startTick < 300 && w.tickCount - wd.startTick > 200) return true;
  }
  return false;
}

/// engine setGov L5097-5108（政体变革含播报）
function SetGov(w, c, gov, cause) {
  if ((c.gov ?? 0) === gov) return;
  c.gov = gov;
  c.govYear = Math.floor(w.yearF);
  w.govCache.set(c.id, gov);
  const g = GOV_DEFS[gov];
  const text = cause === 'revolution'
    ? `革命席卷「${c.name}」！王冠坠地，${g.name}在废墟上建立`
    : `「${c.name}」确立了${g.name}（${g.desc}）`;
  AddEvent(w, 'gov', text, c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
  Toast(w, `「${c.name}」改制为${g.name}`, 'info');
}

/// engine tryGovEvolve L5111-5136（门槛达成 → 概率跃迁；升序判定：帝国 > 共和 > 神权 > 君主）
function TryGovEvolve(w, c) {
  const last = w.lastGovEventTick.get(c.id) ?? -4000;
  if (w.tickCount - last < 2000) return; // 变革冷却（≥50 年）
  const owned = new Set(c.techs ?? []);
  const gov = c.gov ?? 0;
  const counts = w.civBuildCounts.get(c.id);
  const temples = counts ? (counts[BK.TEMPLE] ?? 0) : 0;
  const canMonarchy = gov < 1 && c.pop >= 25;
  const canTheocracy = gov < 2 && temples >= 1 && owned.has('theology') && (c.culture ?? 0) > 50;
  const canRepublic = gov !== 3 && c.pop >= 60 && (owned.has('law') || owned.has('printing')) && (c.knowledge ?? 0) >= 40 && (c.stability ?? 70) < 55;
  const canEmpire = gov !== 4 && c.pop >= 120 && (c.militarism ?? 30) >= 55 && (owned.has('legion') || owned.has('tactics'));
  if (canEmpire && Rng(w) < 0.25) {
    w.lastGovEventTick.set(c.id, w.tickCount);
    SetGov(w, c, 4, 'evolve');
  } else if (canRepublic && Rng(w) < 0.18) {
    w.lastGovEventTick.set(c.id, w.tickCount);
    SetGov(w, c, 3, 'evolve');
  } else if (canTheocracy && Rng(w) < 0.15) {
    w.lastGovEventTick.set(c.id, w.tickCount);
    SetGov(w, c, 2, 'evolve');
  } else if (canMonarchy && Rng(w) < 0.2) {
    w.lastGovEventTick.set(c.id, w.tickCount);
    SetGov(w, c, 1, 'evolve');
  }
}

/// engine adoptIdea L8806-8830（50% 全新发明 / 50% 邻国理念文化扩散）
function AdoptIdea(w, c) {
  const known = [...w.emIdeas.values()].filter((i) => !(c.ideas ?? []).includes(i.key));
  let idea = null;
  let spread = false;
  if (known.length > 0 && Rng(w) < 0.5) {
    // 文化扩散：优先采纳文化强国的理念（文明间的思想传播）
    idea = known[Math.floor(Rng(w) * known.length)];
    spread = true;
  } else if (w.emIdeas.size < 48) {
    idea = InventIdea(w, w.ideaSeq);
    idea.key = `id${w.ideaSeq++}`;
    w.emIdeas.set(idea.key, idea);
  } else if (known.length > 0) {
    idea = known[Math.floor(Rng(w) * known.length)];
    spread = true;
  }
  if (!idea) return;
  if (!c.ideas) c.ideas = [];
  c.ideas.push(idea.key);
  w.ideaModCache.delete(c.id);
  RecordEvo(w, 'society', idea.name, null, c.colorHex, spread ? `${idea.desc}（自邻邦传入「${c.name}」）` : `${idea.desc}（${c.name} 独创）`, idea.desc, { civ: c.id });
  AddEvent(w, 'emerge', spread
    ? `「${c.name}」的使节带回了异邦的思想——「${idea.name}」开始在朝野流传（${idea.desc}）`
    : `「${c.name}」酝酿出新的治国理念——「${idea.name}」（${idea.desc}）`, c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
}

/// engine societyTick L5021-5085（每 %150===7：稳定度/文化/军国主义/节日/理念采纳/政体演变/危机）
function SocietyTick(w) {
  for (const c of w.civs) {
    if (!c || !c.alive || c.pop <= 0) continue;
    const counts = w.civBuildCounts.get(c.id);
    const temples = counts ? (counts[BK.TEMPLE] ?? 0) : 0;
    const libraries = counts ? (counts[BK.LIBRARY] ?? 0) : 0;
    const tm2 = TechModsOf(w, c.id);
    const im2 = IdeaModsOf(w, c.id); // v3：涌现理念加成（稳定/军国/厌战）
    const gov = GovOf(w, c.id);
    // —— 稳定度：战争损耗 / 领土过大 / 税负 vs 神殿安抚 / 文化繁荣 / 科技治理 ——
    let stab = c.stability ?? 70;
    const atWar = CivAtWar(w, c.id);
    stab += atWar ? -1.2 : 0.6;
    if (c.tiles.length > 120) stab -= 0.4; // 过度扩张
    stab += temples * 0.15 + (c.culture ?? 0) * 0.001;
    stab += tm2.stab / 50; // 法律/共和科技的治理红利
    stab += im2.stab * 0.45; // 涌现理念：民本/铁律的治理实效
    stab += gov === 1 ? 0.2 : gov === 2 ? 0.12 : gov === 3 ? 0.25 : gov === 4 ? -0.15 : 0;
    // —— 种族互连：多族王国的种族张力（包容种族多元化更稳 / 排外种族动荡）——
    const homo = w.civHomogeneity.get(c.id) ?? 1;
    if (homo < 0.9) stab += (raceHarmonyOf(c.race) - 0.45) * 20 * (0.9 - homo);
    // —— 联盟互连：盟约的安全感（凝聚力高的联盟成员更安定）——
    const alS = AllianceOfCiv(w, c.id);
    if (alS && !atWar) stab += Math.min(1.2, alS.cohesion * 0.012);
    c.stability = Math.max(0, Math.min(100, stab));
    // —— 文化积累：神殿 + 节日 + 科技乘数 + 种族虔诚（精灵的仪式与信仰）——
    const cultGain = (temples * 0.8 + 0.4 + libraries * 0.3) * (0.7 + racePietyOf(c.race) * 0.6) * tm2.cult * (gov === 2 ? 1.4 : 1);
    c.culture = (c.culture ?? 0) + cultGain;
    // —— 军国主义：战争推高 / 胜利强化 / 和平消退 + 种族好战基线引力（血蹄永不停步）——
    let mil = c.militarism ?? 30;
    mil += atWar ? 0.9 : -0.5;
    mil += im2.mil * 3; // 涌现理念：军功爵推高 / 偃武主义拉低
    if (RecentVictory(w, c.id)) mil += 1.2;
    mil += (raceAggrOf(c.race) * 100 - mil) * 0.01; // 向种族基线缓漂（每十年约 10% 靠近）
    c.militarism = Math.max(0, Math.min(100, mil));
    // —— 节日：文化丰盈时举国庆典（稳定度小振作 + 纪事）——
    const fest = c.festivalCd ?? 0;
    if (fest > 0) {
      c.festivalCd = fest - 1;
    } else if ((c.culture ?? 0) > 40 && Rng(w) < 0.3) {
      c.festivalCd = 10;
      c.culture = (c.culture ?? 0) - 20;
      c.stability = Math.min(100, (c.stability ?? 70) + 3);
      AddEvent(w, 'festival', `「${c.name}」举国欢庆丰年祭，鼓乐与篝火彻夜不息`, c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
    }
    // —— v3：涌现理念采纳（文化丰盈时酝酿新思想 / 异邦思想传入） ——
    if ((c.ideas ?? []).length < 3 && (c.culture ?? 0) > 60 && Rng(w) < 0.15) {
      AdoptIdea(w, c);
    }
    // —— 政体演变：满足门槛且概率变革（革命式跃迁）——
    TryGovEvolve(w, c);
    // —— 危机：稳定度 < 18 → 动乱（叛乱分裂既有系统）/ 妥协变革 ——
    if ((c.stability ?? 70) < 18 && Rng(w) < 0.25) {
      if (c.pop > 25 && (c.knowledge ?? 0) > 30 && c.gov !== 3) {
        // 启蒙革命：直接进入共和制（翻身求稳）
        SetGov(w, c, 3, 'revolution');
      } else {
        AddEvent(w, 'riot', `「${c.name}」爆发了暴动——粮仓被劫，贵族的宅邸火光冲天`, c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
        c.stability = Math.min(40, (c.stability ?? 10) + 12); // 动乱宣泄后回升
        c.gold = Math.max(0, (c.gold ?? 0) - 15);
      }
    }
  }
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
      techs: c.techs ?? [], research: c.research ?? null, researchP: c.researchP ?? 0,
      gov: c.gov ?? 0, govYear: 0, stability: c.stability ?? 70, culture: c.culture ?? 0,
      militarism: c.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
      ideas: c.ideas ? [...c.ideas] : undefined,
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
    w.warData.set(wd.key, { key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick ?? 0, startYear: wd.startYear ?? 0, total: wd.total ?? false, scoreA: wd.scoreA ?? 0, scoreB: wd.scoreB ?? 0, exA: 0, exB: 0, casA: 0, casB: 0, razedA: 0, razedB: 0, battles: 0, giveUpAt: wd.giveUpAt ?? 0, reason: wd.reason ?? 'border', reasonText: wd.reasonText ?? '', aggressor: wd.aggressor ?? 0, goal: wd.goal ?? 0, goalNow: 0, occA: 0, occB: 0, popA0: wd.popA0 ?? 0, popB0: wd.popB0 ?? 0, lastActiveTick: wd.lastActiveTick ?? 0 });
  }
  for (const ar of sc.fixture.armies ?? []) {
    w.armies.push({ id: ar.id, civ: ar.civ, name: ar.name ?? `A${ar.id}`, members: [...(ar.members ?? [])], leaderId: ar.leaderId ?? -1, x: ar.x ?? 0, y: ar.y ?? 0, tx: ar.tx ?? ar.x ?? 0, ty: ar.ty ?? ar.y ?? 0, state: ar.state ?? 'rally', morale: ar.morale ?? 1, kills: ar.kills ?? 0, losses: ar.losses ?? 0, tactical: ar.tactical ?? false, clashWith: ar.clashWith });
  }
  for (const id_ of sc.fixture.emIdeas ?? []) {
    w.emIdeas.set(id_.key, { key: id_.key, name: id_.name ?? `I${id_.key}`, desc: id_.desc ?? '', mods: { gold: id_.mods?.gold, stab: id_.mods?.stab, mil: id_.mods?.mil, know: id_.mods?.know, repro: id_.mods?.repro, wear: id_.mods?.wear } });
    const nId = parseInt(String(id_.key).replace(/^id/, ''), 10);
    if (Number.isFinite(nId)) w.ideaSeq = Math.max(w.ideaSeq ?? 1, nId + 1);
  }
  for (const [cid, v] of sc.fixture.homogeneity ?? []) w.civHomogeneity.set(cid, v); // M-U3f：种族同质性声明式
  if (sc.fixture.seasonOffset != null) w.seasonOffset = sc.fixture.seasonOffset; // M-U3f：季节注入
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
      for (const fd of sc.fixture.fund ?? []) if (fd.at === t) FundResearch(w, w.civs[fd.civ], fd.points);
      if (w.tickCount % 120 === 0) EconomyTick(w); // engine L2535（M-U3f）
      if (w.tickCount % 30 === 0) DirectiveTick(w);
      if (w.tickCount % 120 === 5) TechTick(w); // engine L2567（M-U3e）
      if (w.tickCount % 150 === 7) SocietyTick(w); // engine L2569（M-U3f）
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
      income: c.income ?? null, expense: c.expense ?? null, festivalCd: c.festivalCd ?? null, govYear: c.govYear ?? null,
      ideas: c.ideas ? [...c.ideas] : null,
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
    // —— M-U3e 扩展段 ——
    emTechs: [...w.emTechs.values()].map((t) => ({ key: t.key, name: t.name, cat: t.cat, cost: t.cost, gen: t.gen, effects: (t.effects ?? []).map((e) => [e.k, e.v]), desc: t.desc })),
    // —— M-U3f 扩展段（armies/emIdeas/ideaSeq —— gen dumpArmy/dumpIdea 同构）——
    armies: w.armies.map((a) => ({ id: a.id, civ: a.civ, name: a.name, members: [...a.members], leaderId: a.leaderId, x: a.x, y: a.y, tx: a.tx, ty: a.ty, state: a.state, morale: a.morale, kills: a.kills, losses: a.losses, tactical: a.tactical, clashWith: a.clashWith === undefined ? null : a.clashWith })),
    emIdeas: [...w.emIdeas.values()].map((i) => ({ key: i.key, name: i.name, desc: i.desc, mods: { gold: i.mods.gold ?? null, stab: i.mods.stab ?? null, mil: i.mods.mil ?? null, know: i.mods.know ?? null, repro: i.mods.repro ?? null, wear: i.mods.wear ?? null } })),
    ideaSeq: w.ideaSeq ?? null,
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
        techs: c.techs ?? [], research: c.research ?? null, researchP: c.researchP ?? 0,
        gov: c.gov ?? 0, govYear: 0, stability: c.stability ?? 70, culture: c.culture ?? 0,
        militarism: c.militarism ?? 30, income: 0, expense: 0, festivalCd: 0,
        ideas: c.ideas ? [...c.ideas] : undefined,
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
      w.warData.set(wd.key, { key: wd.key, a: wd.a, b: wd.b, startTick: wd.startTick ?? 0, startYear: wd.startYear ?? 0, total: wd.total ?? false, scoreA: wd.scoreA ?? 0, scoreB: wd.scoreB ?? 0, exA: 0, exB: 0, casA: 0, casB: 0, razedA: 0, razedB: 0, battles: 0, giveUpAt: wd.giveUpAt ?? 0, reason: wd.reason ?? 'border', reasonText: wd.reasonText ?? '', aggressor: wd.aggressor ?? 0, goal: wd.goal ?? 0, goalNow: 0, occA: 0, occB: 0, popA0: wd.popA0 ?? 0, popB0: wd.popB0 ?? 0, lastActiveTick: wd.lastActiveTick ?? 0 });
    }
    for (const ar of sc.fixture.armies ?? []) {
      w.armies.push({ id: ar.id, civ: ar.civ, name: ar.name ?? `A${ar.id}`, members: [...(ar.members ?? [])], leaderId: ar.leaderId ?? -1, x: ar.x ?? 0, y: ar.y ?? 0, tx: ar.tx ?? ar.x ?? 0, ty: ar.ty ?? ar.y ?? 0, state: ar.state ?? 'rally', morale: ar.morale ?? 1, kills: ar.kills ?? 0, losses: ar.losses ?? 0, tactical: ar.tactical ?? false, clashWith: ar.clashWith });
    }
      for (const id_ of sc.fixture.emIdeas ?? []) {
      w.emIdeas.set(id_.key, { key: id_.key, name: id_.name ?? `I${id_.key}`, desc: id_.desc ?? '', mods: { gold: id_.mods?.gold, stab: id_.mods?.stab, mil: id_.mods?.mil, know: id_.mods?.know, repro: id_.mods?.repro, wear: id_.mods?.wear } });
      const nId = parseInt(String(id_.key).replace(/^id/, ''), 10);
        if (Number.isFinite(nId)) w.ideaSeq = Math.max(w.ideaSeq ?? 1, nId + 1);
    }
      for (const [cid, v] of sc.fixture.homogeneity ?? []) w.civHomogeneity.set(cid, v); // M-U3f：种族同质性声明式
      if (sc.fixture.seasonOffset != null) w.seasonOffset = sc.fixture.seasonOffset; // M-U3f：季节注入
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
        for (const fd of sc.fixture.fund ?? []) if (fd.at === t) FundResearch(w, w.civs[fd.civ], fd.points);
        if (w.tickCount % 120 === 0) EconomyTick(w); // engine L2535（M-U3f：directiveTick 前）
        if (w.tickCount % 30 === 0) DirectiveTick(w);
        if (w.tickCount % 120 === 5) TechTick(w); // engine L2567（M-U3e）
        if (w.tickCount % 150 === 7) SocietyTick(w); // engine L2569（M-U3f：techTick 后 allianceTick 前）
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
