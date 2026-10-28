// ============================================================================
// gen-units-society.mjs —— M-U3 切片 6「社会体系域」黄金向量
// 蓝本：src/lib/game/engine.ts + tech.ts + emergence.ts
//   economyTick L4931-4989（市场/神殿/港口收入 + 人口税基 taxBase floor + 财富饱和 drag
//   1/(1+hoard/900) + 盟内商贸 allyTrade 1.15/1.25 + 勤勉 industryMul 0.8+ind*0.4 +
//   冬季 winterMul 0.9 + 军团军饷 armies 空契约 + 城防维护 castle 0.5/tower 0.15 +
//   income/expense round 链 + 知识 knowGain libraries*2+pop>20 ×wisdom ×tm.know ×
//   cultKnow 1+min(0.5,cult*0.002) ×gov2 1.15 ×(1+im.know) ×arcaneMul 0.8+arc*0.45 ×
//   冬读 1.05 → fundResearch 知识注入 + 余量入国库）+
//   availableTechs L5015-5019（未拥有 + deps 全备 TECHS 序过滤）+
//   pickResearch L5021-5046（军国/文化/国库/稳定/海/农/工 七领域加权 + rng×total 逐减法）+
//   fundResearch L5048-5080（选题开工事件 + 盟内技术扩散 diffusion 1.2/bonded 1.32 +
//   researchP 累积 + cost 达成 completeTech + 实际消耗 max(0,cost-start) 余量回流）+
//   completeTech L5082-5115（techs.push + research 清零 + techModCache.delete + 科技回溯
//   全军现役 rd=nm.dmg/(tDmg??1) maxHp/hp round 链 + tDmg/tHp 无条件刷新 + 纪事 +
//   era≥2 toast 契约 + masonry/fortification/gothic bHp 老房加固 min(max, cur+base*0.25)）+
//   civCenterX/Y L5117-5124（事件定位：首都/tiles 中位/画布半宽）+
//   techTick L5140-5146（%120===5 驱动：无研究且 knowledge<40 rng<0.35 门 +
//   rng<0.5?1:0 口传心授——0 点早退不开题）+
//   inventEmTech L8964-8976（静态树穷尽 → 涌现发明 emTechSeq + recordEvo 图谱 + emerge 事件）+
//   inventTech emergence.ts L329-374（EM_FIELD 十六领域加权 ×国家气质 + EM_PREFIX 十六前缀 +
//   代数后缀 ROMAN gen>12 + 主效果 + 35% 副效果 mag 饱和 + cost round(110+gen*14+rng*30)）+
//   applyEmTechMods emergence.ts L376-380（涌现科技叠加 plague 取负绝对值）+
//   techModsOf L4990-5005 emTechs 叠加段真实现（M-U3 切片 4 哨兵开闸）+
//   TECHS tech.ts L45-101（51 项全表数据回显）+ BUILDING_DEFS hp 表 +
//   recordEvo L8923（evoSeq++ 图谱消费——节点 UI 域不镜像）。
// 直接 import 现役 engine.ts（真实现，零同源复制）：原型链 stub 驱动（Task 140 模式）。
// 步语义：step op = rebuildBuckets → update 活数组循环（pre+scan+combat+tail+post 全真实现）
//   → unitsReap() → tickCount++（循环内新生同拍被驱动——TS for(i<units.length) 活数组序）。
//   dtick op = directiveTick() 显式驱动（真实 tick 每 30 拍——parity 显式化逐 op 对账）。
// op 语义：stick=societyTick（稳定漂移/文化/军国/节日/理念/政体/危机全链）/ etick/ttick/
//   fundres/avail/pickres/comptech/formal/setalpatch/setemtech/bhps（tech 域复用面）/
//   issue/dtick/rebuild/bld/setciv（含 festivalCd/govYear 补丁）/sethomo=civHomogeneity 注入
//   （civsTick 重建域后续切片——本切片消费面）/setemidea=emIdeas 注入（升级：name/desc/mods
//   全字段——adoptIdea spread 路径词法消费）/ war / peace / adv / setrel / met / killciv /
//   setwd（+startTick 补丁——recentVictory 窗口）/ probe: imod（六元）/ bhps。
// // 截断契约（C# 侧哨兵/no-op 同构，触达即设计错误）：
//  ① armies 空表——economyTick 军饷循环 no-op（城防维护 castle/tower 照算）；
//  ② toast/onSound/setFrozen——UI/采集域 no-op（era≥2 里程碑条件不镜像 C#——零观感）；
//  ③ findCivNear/createCiv——spawnUnit civ<0 野人立国域哨兵（场景无 spawn op）；
//  ④ evoNodes/evoIndex 图谱节点 UI 域不镜像——recordEvo 仅 evoSeq++ 消费对账；
//  ⑤ emTechs<60 软上限（60 触达返 null——场景远低于）。
// rng 消耗点（对账指纹）：pickResearch 1 抽（avail 空早退 0 抽）/ techTick 门 1 抽 +
//   口传量 1 抽（0 点则 fundResearch 早退零后续）/ inventTech 4-6 抽（领域+前缀+主效果+
//   副效果门+副领域+cost）/ formAlliance 词法 1 抽（essence rng×6）/ 经济 tick 零抽
//   （除 fundResearch 链）/ completeTech 零抽（纯结算）。
// 运行：bun scripts/unity-migration/gen-units-society.mjs（PW_SEEDS 环境变量通道 + --hunt 激活度自检）
// 输出：scripts/unity-migration/golden-units-society.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, TRAITS, JOBS, ALLIANCE_COLORS, RACE_REL_BASE, BUILDING_DEFS } from '../../src/lib/game/types.ts';
import { TECHS, GOV_DEFS } from '../../src/lib/game/tech.ts';
import { FIRST } from '../../src/lib/game/names.ts';
import { WB } from '../../src/lib/wasm/wbspatial.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { neuroStats } from '../../src/lib/game/neuro.ts';
import { writeFileSync } from 'node:fs';

const W = 256, H = 160;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };

neuroStats.enabled = false;          // 本切片无战斗决策场景（civ 同国互不为敌）——教师面不触达
WB.setEnabled(false);                // WASM 分流关闭——JS 路径为准（M-U2b 契约）

const EP = {
  panicDecay: ep('social.panicDecay'), grudgeDecay: ep('social.grudgeDecay'),
  fireDamage: ep('fire.damage'), panicRout: ep('social.panicRout'),
  reproMul: ep('pop.reproMul'), mutationRate: ep('evo.mutationRate'),
};

const pickRace = (key) => {
  for (const k of Object.keys(RACES)) if (RACES[k].key === key) return Number(k);
  throw new Error('race not found: ' + key);
};
// 文明种族 echo（human 基线 + elf 奥术/dwarf 勤勉/orc 低奥术——经济科技四维对照）
const RACE_KEYS = ['human', 'elf', 'dwarf', 'orc'];
const raceIds = {};
const raceTable = {};
for (const k of RACE_KEYS) {
  const id = pickRace(k);
  raceIds[k] = id;
  const d = RACES[id];
  raceTable[String(id)] = {
    // 位序铁律（WbConstants F* 对齐——repro gen 同约定）：hostile=1/isCiv=2/undead=4/predator=8/lavaImmune=16
    flags: (d.hostile ? 1 : 0) | (d.isCiv ? 2 : 0) | (d.undead ? 4 : 0) | (d.predator ? 8 : 0) | (d.lavaImmune ? 16 : 0),
    // tbf 位序（repro gen 同约定）：tbf0 flying=32/aquatic=64/sandswim=128；tbf1 coldBlood=4/beach=8/nightsight=16
    tbf0: (d.flying ? 32 : 0) | (d.aquatic ? 64 : 0) | (d.sandswim ? 128 : 0),
    tbf1: (d.coldBlood ? 4 : 0) | (d.beach ? 8 : 0) | (d.nightsight ? 16 : 0),
    reach: d.reach === undefined ? null : d.reach,
    speed: d.speed, repro: d.repro ?? 0,
    growth: d.growth === undefined ? null : d.growth,
    maxAge: d.maxAge, hp: d.hp, dmg: d.dmg,
    // M-U3 切片 5：经济/学术种族维（economyTick industryMul/arcaneMul 消费面）
    industry: d.industry === undefined ? null : d.industry,
    arcane: d.arcane === undefined ? null : d.arcane,
    // M-U3 切片 6：社会种族维（societyTick 稳定 harmony/文化 piety/军国 aggr 消费面）
    piety: d.piety === undefined ? null : d.piety,
    harmony: d.harmony === undefined ? null : d.harmony,
    aggr: d.aggr === undefined ? null : d.aggr,
  };
}

// JOBS echo（8 职——C# host 数据面；weight/hpMul/dmgMul/speedMul 全回显零硬编码）
const JOBS_ECHO = JOBS.map((j) => ({ key: j.key, hpMul: j.hpMul, dmgMul: j.dmgMul, speedMul: j.speedMul, weight: j.weight }));

// FIRST 名池 echo（human——uniqueName）
const FIRST_ECHO = {};
for (const [rid, pool] of Object.entries(FIRST)) FIRST_ECHO[rid] = [...pool];

// 涌现特质词法面（repro childGene/tryEmergentTrait 真实现驱动）
const TRAIT_DEFS_ECHO = {};
for (const [k, t] of Object.entries(TRAITS)) {
  if (k.startsWith('dt')) continue;
  TRAIT_DEFS_ECHO[k] = { hpMul: t.hpMul ?? 1, dmgMul: t.dmgMul ?? 1, speedMul: t.speedMul ?? 1, regen: t.regen ?? 0, immune: !!t.immune };
}
const TRAIT_KEYS = Object.keys(TRAIT_DEFS_ECHO);
const EM_ECHO = {
  traitPrefix: ['碎星', '夜嚎', '铁鬃', '影步', '雷鸣', '霜牙'],
  traitBody: ['利爪', '坚骨', '疾风', '毒腺', '厚皮', '锐目'],
  famPre: ['荆棘', '黑岩', '灰羽', '白川', '铁木', '红沙'],
  famPost: ['氏族', '部族', '家系', '血脉'],
};

const ALLIANCE_COLORS_ECHO = [...ALLIANCE_COLORS];
const RACE_REL_BASE_ECHO = { ...RACE_REL_BASE };   // shiftRaceRel 基线表（formAlliance 跨种族 +9 消费面）

// TECHS 全表 echo（51 项——availableTechs 过滤/pickResearch 加权/completeTech 纪事消费面；
//   C# host.TechDefs 按 TECHS 序装载——过滤序即加权池序，零硬编码）
const TECHS_ECHO = TECHS.map((t) => ({ key: t.key, name: t.name, cat: t.cat, era: t.era, cost: t.cost, deps: [...t.deps], desc: t.desc }));

// BUILDING_DEFS hp echo（completeTech 老房加固 base 消费面——bld op 同表）
const BUILDING_HP_ECHO = Object.fromEntries(BUILDING_DEFS.map((b, i) => [i, b.hp]));

// 涌现科技词法面（inventTech emergence.ts 模块级常量非导出——Task 146 traitEcho 同款回显；
//   C# host 词法数据面。发明产物 name/desc/cost 进黄金逐字对账，回显漂移即 parity 红）
const EM_LEX = {
  prefix: ['量子', '纳米', '等离子', '基因', '光子', '超导', '混沌', '灵能', '暗物质', '弦', '晶格', '磁悬浮', '熵减', '聚变', '深空', '引力'],
  fields: [
    { name: '冶金学', cat: 'military', eff: 'dmg' }, { name: '护盾工程', cat: 'eng', eff: 'hp' },
    { name: '农艺', cat: 'agri', eff: 'repro' }, { name: '算术', cat: 'culture', eff: 'know' },
    { name: '航海术', cat: 'naval', eff: 'col' }, { name: '财税学', cat: 'econ', eff: 'tax' },
    { name: '营造法式', cat: 'eng', eff: 'bhp' }, { name: '市场学', cat: 'econ', eff: 'gold' },
    { name: '战术学', cat: 'military', eff: 'morale' }, { name: '医道', cat: 'culture', eff: 'plague' },
    { name: '弹道学', cat: 'military', eff: 'range' }, { name: '射艺', cat: 'military', eff: 'archer' },
    { name: '礼乐', cat: 'culture', eff: 'cult' }, { name: '治理术', cat: 'civic', eff: 'stab' },
    { name: '营缮学', cat: 'eng', eff: 'repair' }, { name: '军制', cat: 'military', eff: 'armyMax' },
  ],
  effNames: {
    dmg: '全军伤害', hp: '全军生命', bhp: '建筑耐久', gold: '经济收入', know: '知识产出',
    repro: '繁衍速度', col: '殖民速度', tax: '人口税基', cult: '文化积累', repair: '修复速度',
    morale: '军团士气', armyMax: '军团上限', archer: '射手伤害', plague: '瘟疫传播', range: '远程射程', stab: '稳定度',
  },
  roman: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'],
};

// GOV_DEFS echo（tech.ts L236-247——setGov 播报 g.name/g.desc 消费面，零硬编码）
const GOV_DEFS_ECHO = GOV_DEFS.map((g, i) => ({ id: i, key: g.key, name: g.name, desc: g.desc }));

// 涌现理念词法面（inventIdea emergence.ts 模块级常量非导出——Task 146/151 词法回显同款；
//   发明产物 name/desc/mods 进黄金逐字对账）
const IDEA_LEX = {
  pre: ['军功爵', '重商', '垦荒', '天工', '航海', '民本', '格物', '荣耀', '万学', '大同', '无为', '铁律'],
  post: ['主义', '律令', '学会', '改革', '之道', '运动'],
  body: [
    { name: '重商', desc: '商路即国脉', mods: { gold: 0.18 } },
    { name: '军功爵', desc: '斩首授田，武士阶层的上升阶梯', mods: { mil: 0.06, stab: -1 } },
    { name: '民本', desc: '民为邦本，本固邦宁', mods: { stab: 3, repro: 0.05 } },
    { name: '格物', desc: '致知在格物', mods: { know: 0.22 } },
    { name: '垦荒', desc: '寸土不荒', mods: { repro: 0.08, gold: 0.06 } },
    { name: '偃武', desc: '铸剑为犁', mods: { wear: -0.15, mil: -0.05 } },
    { name: '铁律', desc: '令行禁止', mods: { stab: 4, gold: -0.05 } },
    { name: '万学', desc: '百花齐放', mods: { know: 0.15, stab: 1 } },
  ],
};

const bitHex = (d) => {
  if (typeof d === 'number' && Object.is(d, -0)) d = 0;   // -0 归一（JSON 丢失符号——Task 143 课）
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

// mkCiv：文明全字段（tiles 浅拷贝铁律——模块级常量数组会被 concludeByScore/扩张原地污染——Task 149 课）
const mkCiv = (o) => ({
  id: o.id, name: o.name, race: o.race, colorHex: o.colorHex ?? '#cccccc',
  pop: o.pop ?? 10, tiles: [...(o.tiles ?? [])], frontier: [],
  houses: o.houses ?? 0, capital: o.capital ?? -1, alive: o.alive !== false,
  gold: o.gold === undefined ? undefined : o.gold,
  knowledge: o.knowledge === undefined ? undefined : o.knowledge,
  techs: [...(o.techs ?? [])],
  ideas: [...(o.ideas ?? [])],
  militarism: o.militarism === undefined ? undefined : o.militarism,
  gov: o.gov === undefined ? undefined : o.gov,
  armyCd: o.armyCd === undefined ? undefined : o.armyCd,
  stability: o.stability === undefined ? undefined : o.stability,
  expense: o.expense === undefined ? undefined : o.expense,
  mobilizeUntil: o.mobilizeUntil === undefined ? undefined : o.mobilizeUntil,
  culture: o.culture === undefined ? undefined : o.culture,
  // M-U3 切片 5：研究面（TS optional——undefined ≠ null 语义保真）
  research: o.research === undefined ? undefined : o.research,
  researchP: o.researchP === undefined ? undefined : o.researchP,
  income: o.income === undefined ? undefined : o.income,
  // M-U3 切片 6：社会面（festivalCd/govYear——societyTick 消费/写入）
  festivalCd: o.festivalCd === undefined ? undefined : o.festivalCd,
  govYear: o.govYear === undefined ? undefined : o.govYear,
});

// mkTsUnit（单位 stub——repro gen 同构；job 显式化）
const U = (o) => ({
  id: o.id, race: o.race, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
  age: o.age ?? 0, maxAge: o.maxAge ?? 55, hp: o.hp ?? 100, maxHp: o.maxHp ?? 100,
  dmg: o.dmg === undefined ? null : o.dmg,
  kills: o.kills ?? 0, hurt: o.hurt === undefined ? null : o.hurt, cd: o.cd ?? 0,
  atk: o.atk ?? 0, chill: o.chill === undefined ? null : o.chill,
  fleeT: o.fleeT ?? 0, bless: o.bless ?? 0, curse: o.curse ?? 0,
  fert: o.fert ?? 0, detour: o.detour ?? 0,
  panic: o.panic === undefined ? null : o.panic,
  gids: o.gids === undefined ? null : o.gids, gval: o.gval === undefined ? null : o.gval,
  food: o.food === undefined ? null : o.food,
  stk: o.stk === undefined ? null : o.stk,
  sxk: o.sxk === undefined ? null : o.sxk, syk: o.syk === undefined ? null : o.syk,
  infected: !!o.infected, grab: o.grab ?? 0, boat: o.boat ?? 0,
  civ: o.civ ?? -1, job: o.job ?? 0, flip: !!o.flip,
  dead: !!o.dead, caravan: o.caravan ?? 0,
  speed: o.speed === undefined ? null : o.speed,
  wep: o.wep === undefined ? null : o.wep, arm: o.arm === undefined ? null : o.arm,
  hlm: o.hlm === undefined ? null : o.hlm, shd: o.shd === undefined ? null : o.shd,
  bts: o.bts === undefined ? null : o.bts, rng: o.rng === undefined ? null : o.rng,
  amu: o.amu === undefined ? null : o.amu,
  trait: o.trait === undefined ? null : o.trait,
  king: !!o.king, fam: o.fam === undefined ? null : o.fam, army: o.army === undefined ? null : o.army,
  boatTTL: o.boatTTL ?? 0, thrT: o.thrT ?? 0, grabTTL: o.grabTTL ?? 0,
  gene: o.gene === undefined ? null : o.gene, fgn: o.fgn === undefined ? null : o.fgn,
  beachT: o.beachT ?? 0,
  name: o.name ?? ('U' + (o.id ?? '?')),
});
const mkTsUnit = (spec) => {
  const u = { id: spec.id, race: spec.race, x: spec.x, y: spec.y, tx: spec.tx, ty: spec.ty };
  if (spec.age !== undefined) u.age = spec.age;
  if (spec.maxAge !== undefined) u.maxAge = spec.maxAge;
  if (spec.hp !== undefined) u.hp = spec.hp;
  if (spec.maxHp !== undefined) u.maxHp = spec.maxHp;
  if (spec.dmg !== undefined) u.dmg = spec.dmg ?? 0;
  u.kills = spec.kills ?? 0;
  if (spec.hurt !== null) u.hurt = spec.hurt;
  u.cd = spec.cd ?? 0;
  if (spec.atk) u.atk = spec.atk;
  if (spec.chill !== null) u.chill = spec.chill;
  if (spec.fleeT) u.fleeT = spec.fleeT;
  if (spec.bless) u.bless = spec.bless;
  if (spec.curse) u.curse = spec.curse;
  if (spec.fert) u.fert = spec.fert;
  if (spec.detour) u.detour = spec.detour;
  if (spec.panic !== null) u.panic = spec.panic;
  if (spec.gids !== null) { u.gIds = [...spec.gids]; u.gVal = [...spec.gval]; }
  if (spec.food !== null) u.food = spec.food;
  if (spec.infected) u.infected = true;
  if (spec.grab) u.grab = spec.grab;
  if (spec.boat) { u.boat = spec.boat; u.boatTTL = spec.boatTTL ?? 900; }
  u.civ = spec.civ; u.job = spec.job; u.flip = spec.flip;
  if (spec.dead) u.dead = true;
  if (spec.caravan) u.caravan = spec.caravan;
  if (spec.speed !== null) u.speed = spec.speed;
  if (spec.wep !== null) u.wep = spec.wep;
  if (spec.arm !== null) u.arm = spec.arm;
  if (spec.hlm !== null) u.hlm = spec.hlm;
  if (spec.shd !== null) u.shd = spec.shd;
  if (spec.bts !== null) u.bts = spec.bts;
  if (spec.rng !== null) u.rng = spec.rng;
  if (spec.amu !== null) u.amu = spec.amu;
  if (spec.trait !== null) u.trait = spec.trait;
  if (spec.king) u.king = true;
  if (spec.fam !== null) u.fam = spec.fam;
  if (spec.army !== null) u.army = spec.army;
  if (spec.boatTTL) u.boatTTL = spec.boatTTL;
  if (spec.thrT) u.thrT = spec.thrT;
  if (spec.grabTTL) u.grabTTL = spec.grabTTL;
  if (spec.gene !== null) u.gene = { ...spec.gene };
  if (spec.fgn !== null) u.fgn = spec.fgn;
  if (spec.beachT) u.beachT = spec.beachT;
  if (spec.tdmg !== undefined) u.tDmg = spec.tdmg;   // 出生科技乘数快照（completeTech 回溯基准）
  if (spec.thp !== undefined) u.tHp = spec.thp;
  u.name = spec.name;
  return u;
};

const snapU = (u) => ({
  id: u.id, race: u.race,
  age: bitHex(u.age), hp: bitHex(u.hp), maxAge: bitHex(u.maxAge), maxHp: bitHex(u.maxHp),
  hurt: u.hurt === undefined ? null : bitHex(u.hurt), cd: bitHex(u.cd ?? 0), atk: bitHex(u.atk ?? 0),
  chill: u.chill === undefined ? null : bitHex(u.chill),
  fleeT: bitHex(u.fleeT ?? 0), bless: bitHex(u.bless ?? 0), curse: bitHex(u.curse ?? 0),
  fert: bitHex(u.fert ?? 0), detour: bitHex(u.detour ?? 0),
  panic: u.panic === undefined ? null : bitHex(u.panic),
  food: u.food === undefined ? null : bitHex(u.food),
  infected: !!u.infected, dead: !!u.dead, grab: u.grab ?? 0, boat: u.boat ?? 0,
  caravan: u.caravan ?? 0,
  dmg: bitHex(u.dmg ?? 0), kills: u.kills ?? 0,
  x: bitHex(u.x), y: bitHex(u.y), tx: bitHex(u.tx), ty: bitHex(u.ty),
  trait: u.trait === undefined ? null : u.trait,
  king: !!u.king, fam: u.fam === undefined ? null : u.fam, army: u.army === undefined ? null : u.army,
  lx: u.lx === undefined ? null : bitHex(u.lx), ly: u.ly === undefined ? null : bitHex(u.ly),
  flip: !!u.flip, job: u.job ?? 0, civ: u.civ ?? -1,
  name: u.name,
  speed: u.speed === undefined ? null : bitHex(u.speed),
  gene: u.gene === undefined ? null : { s: bitHex(u.gene.s), d: bitHex(u.gene.d), h: bitHex(u.gene.h), r: bitHex(u.gene.r) },
  fgn: u.fgn === undefined ? null : u.fgn,
  breath: u.breath === undefined ? null : bitHex(u.breath),
  uparity: u.parity === undefined ? null : u.parity,
  beachT: u.beachT ?? 0,
  tdmg: u.tDmg === undefined ? null : bitHex(u.tDmg),
  thp: u.tHp === undefined ? null : bitHex(u.tHp),
});

// 地形规格（草地主面 + 湖泊对照——移动语义 Uint8 + 领土语义共用 3=GRASS）
const TERRAIN_SPECS = [
  { name: 'plains', def: T.GRASS, patches: [] },
  { name: 'lake', def: T.GRASS, patches: [[0, 0, W, 20, T.WATER], [0, H - 20, W, H, T.WATER]] },
];
const buildGrid = (spec) => {
  const g = new Uint8Array(W * H).fill(spec.def);
  for (const [x1, y1, x2, y2, t] of spec.patches)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) g[y * W + x] = t;
  return g;
};

const dumpWild = (eng) => [...eng.wildCount.entries()].sort((a, b) => a[0] - b[0]);
const dumpItems = (eng) => eng.items.map((it) => ({ id: it.id, kind: it.kind, x: bitHex(it.x), y: bitHex(it.y) }));
const dumpFamilies = (eng) => [...eng.families.entries()].sort((a, b) => a[0] - b[0]).map(([id, f]) => ({ id, name: f.name, members: f.members, kills: f.kills, heroes: f.heroes, peak: f.peak, founded: f.founded, founder: f.founder, milestones: f.milestones }));
const dumpDirectives = (eng) => [...eng.directives].map((d) => ({
  id: d.id, civ: d.civ, kind: d.kind, target: d.target === undefined ? null : d.target,
  param: d.param, status: d.status, startTick: d.startTick,
  deadlineTick: d.deadlineTick === undefined ? null : d.deadlineTick,
  text: d.text,
  endTick: d.endTick === undefined ? null : d.endTick,
  endText: d.endText === undefined ? null : d.endText,
  killCount: d.killCount === undefined ? null : d.killCount,
}));
const dumpCivs = (eng) => eng.civs.map((cv) => cv === undefined ? null : ({
  id: cv.id, name: cv.name, pop: bitHex(cv.pop),
  gold: cv.gold === undefined ? null : bitHex(cv.gold),
  knowledge: cv.knowledge === undefined ? null : bitHex(cv.knowledge),
  houses: cv.houses, alive: cv.alive, armyCd: cv.armyCd === undefined ? null : cv.armyCd,
  mobilizeUntil: cv.mobilizeUntil === undefined ? null : bitHex(cv.mobilizeUntil),
  gov: cv.gov === undefined ? null : cv.gov,
  techs: [...(cv.techs ?? [])], ideas: [...(cv.ideas ?? [])],
  tiles: [...cv.tiles], frontier: [...cv.frontier],
  // M-U3 切片 5：研究面快照（research null≡TS null/undefined 都归 null——C# string? 同构）
  research: cv.research === undefined || cv.research === null ? null : cv.research,
  researchP: cv.researchP === undefined ? null : bitHex(cv.researchP),
  income: cv.income === undefined ? null : bitHex(cv.income),
  expense: cv.expense === undefined ? null : bitHex(cv.expense),
  festivalCd: cv.festivalCd === undefined ? null : bitHex(cv.festivalCd),
  govYear: cv.govYear === undefined ? null : cv.govYear,
  // M-U3 切片 6：社会三维（societyTick 漂移主输出——jobs/tech 旧档不触碰恒 undefined）
  stability: cv.stability === undefined ? null : bitHex(cv.stability),
  culture: cv.culture === undefined ? null : bitHex(cv.culture),
  militarism: cv.militarism === undefined ? null : bitHex(cv.militarism),
}));
const dumpAlliances = (eng) => eng.alliances.map((al) => ({
  id: al.id, name: al.name, members: [...al.members], leader: al.leader,
  cohesion: bitHex(al.cohesion), colorHex: al.colorHex, formedTick: al.formedTick,
}));
const dumpRel = (m) => [...m.entries()].map(([k, v]) => [k, bitHex(v)]);
const dumpMapI = (m) => [...m.entries()].map(([k, v]) => [k, v]);
const TM_KEYS = ['dmg', 'hp', 'bhp', 'gold', 'know', 'repro', 'col', 'tax', 'cult', 'repair', 'stab', 'morale', 'armyMax', 'archer', 'plague', 'range', 'arty', 'bomber', 'nukeCap', 'laser', 'drone', 'orbital', 'mech', 'ai', 'plasma', 'antiMatter'];
const dumpTm = (tm) => Object.fromEntries(TM_KEYS.map((k) => [k, bitHex(tm[k])]));
const dumpIm = (im) => ({ gold: bitHex(im.gold), stab: bitHex(im.stab), mil: bitHex(im.mil), know: bitHex(im.know), repro: bitHex(im.repro), wear: bitHex(im.wear) });

function makeStubEng(env, cap) {
  const eng = Object.create(GameEngine.prototype);
  // —— 单位域面（repro gen 同构） ——
  eng.terrain = new Uint8Array(W * H);
  eng.road = new Uint8Array(W * H);
  eng.fire = new Uint8Array(W * H);
  eng.radiate = new Uint8Array(W * H);
  eng.fireSet = new Set(env.fireSet ?? []);
  eng.building = new Uint8Array(W * H);
  eng.bw = W / 4; eng.bh = H / 4;
  eng.buckets = Array.from({ length: eng.bw * eng.bh }, () => []);
  eng.bucketStampArr = new Int32Array(eng.bw * eng.bh);
  eng.bucketStamp = 0;
  eng.ghostBuckets = [];
  eng.enemyLut = new Map();
  eng.dynRaces = new Map();
  eng.blood = []; eng.corpses = [];
  eng.activeBattles = new Map();
  eng.statDragonsSlain = 0;
  eng.wildCount = new Map(env.wild ?? []);
  eng.items = (env.items ?? []).map((it) => ({ ...it }));
  eng.itemSeq = env.itemSeq ?? 1;
  eng.families = new Map(env.families ?? []);
  eng.familySeq = env.familySeq ?? 1;
  eng.unitSeq = env.unitSeq ?? 1000;
  eng.grassTiles = env.grassTiles ?? 0;
  eng.yearF = env.yearF ?? 0;
  eng.dynTraits = new Map();
  eng.traitSeq = env.traitSeq ?? 0;
  eng.evoSeq = 0; eng.evoIndex = new Map(); eng.evoNodes = [];
  eng.speciesBase = new Map();
  eng.unitById = new Map();
  eng.nature = { season: env.season ?? 0, bloodMoonTTL: env.bloodMoonTtl ?? 0, eclipseTTL: env.eclipseTtl ?? 0, reproMul() { return this.season === 0 ? 1.14 : this.season === 3 ? 0.78 : 1; } };   // nature.ts L371-374 机械镜像
  eng.moonIllum = () => env.moonIllum ?? 0;
  eng.fxPrefs = { get ambience() { return env.ambience ?? false; }, get blood() { return env.fxBlood ?? true; }, get dmgNumbers() { return env.fxDmgNumbers ?? true; }, get corpses() { return env.fxCorpses ?? true; } };
  eng.frameCount = env.frameCount ?? 100;
  eng.tickCount = env.tick ?? 0;                          // ⚠ 类字段原型链不继承——漏初始化 → NaN → 期限永不触发
  eng.laws = { wars: env.lawsWars !== false, undeadRise: false, zombieInfect: env.lawsZombie ?? false, reproduction: env.lawsRepro !== false, zombieVirus: env.lawsZombieVirus !== false, cityGrowth: true };   // wars（declareWar 门——warinfo gen 同源）
  // —— 战争域面（warinfo gen 同构） ——
  eng.civs = [];
  eng.met = new Set();
  eng.rel = new Map();
  eng.tension = new Map();
  eng.raceRel = new Map();
  eng.warData = new Map();
  eng.totalWars = new Set();
  eng.warShame = new Map();
  eng.warHistory = [];
  eng.lastDeclareAt = new Map();
  eng.allianceWarCd = new Map();
  eng.alliances = []; eng.allianceOf = new Map();
  eng.allianceSeq = env.allianceSeq ?? 1;
  eng.armies = [];                                       // 截断②
  eng.emergentWeapons = new Map();
  eng.killCredit = null;
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };   // 大战 idle
  eng.statWars = 0;
  eng.lastCatastrophe = { tick: -1000000000, x: -1, y: -1 };
  eng.ecoState = env.ecoState ?? 'balanced';
  eng.owner = new Int16Array(W * H).fill(-1);
  eng.occCiv = new Int8Array(W * H).fill(-1);
  eng.occStr = new Uint8Array(W * H);
  eng.occSet = new Set();
  eng.buildings = []; eng.bIdx = new Map(); eng.bHp = new Map();
  eng.damagedSet = new Set();
  eng.dirty = new Set();
  eng.overlayMode = 'none'; eng.overlayDirty = false;
  // —— M-U3 切片 4 开闸面：directives/techs/ideas/popCap ——
  eng.directives = [];
  eng.dirSeq = env.dirSeq ?? 1;
  eng.victoryCiv = null;
  eng.techModCache = new Map();
  eng.emTechs = new Map();                               // M-U3 切片 5 开闸面（setemtech 注入 / inventEmTech 真实现写入）
  eng.emTechSeq = env.emTechSeq ?? 1;                    // ⚠ 类字段原型链不继承——漏初始化 → NaN 键（Task 150 课⑤）
  eng.ideaSeq = env.ideaSeq ?? 1;                        // ⚠ 类字段原型链不继承（ideaSeq engine.ts L662 初始 1——adoptIdea id{seq} 先取后增）
  eng.govCache = new Map();                              // setGov 写入面（govOf 不读——存档/UI 域快照）
  eng.lastGovEventTick = new Map();                      // tryGovEvolve 2000 拍冷却
  eng.civHomogeneity = new Map();                        // civsTick 重建域（sethomo 注入——本切片消费面）
  eng.ideaModCache = new Map();
  eng.emIdeas = new Map();                               // 场景注入（ideaModsOf 涌现面真实现）
  eng.civBuildCounts = new Map();
  eng.marketIdx = new Map();
  eng.tileX = (i) => i % W;
  eng.tileY = (i) => (i / W) | 0;
  eng.eventSeq = 0; eng.toastSeq = 0;                    // ⚠ 类字段原型链不继承——漏初始化 → id NaN → JSON null（Task 144 铁律重演）
  eng.grabbedTick = (u) => cap.evt.push(['grab', u.id]);
  eng.updateBoat = (u) => cap.evt.push(['boat', u.id]);
  eng.riseSkeleton = (x, y) => cap.evt.push(['rise', bitHex(x), bitHex(y)]);
  eng.spreadPlague = (u) => cap.evt.push(['plague', u.id]);
  eng.addEvent = (kind, text, opts) => cap.evt.push(['ev', kind, text,
    opts?.colorHex === undefined ? null : opts.colorHex,
    opts?.x === undefined ? null : bitHex(opts.x), opts?.y === undefined ? null : bitHex(opts.y)]);
  eng.toast = () => {};                                  // 截断④
  eng.onSound = null;
  eng.setTerrain = (i, t) => { if (eng.terrain[i] === t) return; const old = eng.terrain[i]; eng.terrain[i] = t; cap.terr.push([i, old, t]); };
  eng.updateUnitTailJS = (u) => { cap.evt.push(['tail', u.id]); return false; };
  eng.tryFormArmy = (civ, target) => eng.addEvent('tryFormArmy', `__stub__${civ.id}:${target === undefined ? 'null' : target}`, {});   // 截断①（经 addEvent 双捕获——事件流对账）
  // ⚠ updateUnit/updateUnitPostJS/unitsReap/techModsOf/ideaModsOf/popCapOf/houseTierOf/
  //    rollJob/setJob/activeDirective/issueDirective/applyDirectiveImpulse/describeDirective/
  //    directiveTick/evalDirective/finishDirective/directiveProgressOf/rebuildCivBuildCounts/
  //    declareWar/makePeace/formAlliance/joinAlliance 不 stub——真实现
  eng.fx = (kind, x, y, ttl) => cap.fx.push({ k: kind, x: bitHex(x), y: bitHex(y), ttl });
  return eng;
}

const SEEDS = JSON.parse(process.env.PW_SEEDS ?? '{}');
function seedOf(name, dflt) { return SEEDS[name] ?? dflt; }
const CASES = [];
// S1 soc-drift：稳定度漂移全维——civ0 交战（war op）+130 格领土（>120 超扩 -0.4）+神殿/图书馆
//   +theology（tm2.stab 12/50）+君主制 gov1（+0.2）；civ1 和平无建筑（counts 可选链零值——
//   部落 +0.6 漂移基线）；civ2+civ3 联盟 cohesion 55（+min(1.2, 0.66)=0.66）——四国
//   stability/culture/militarism 位模式分化。stick×2（fest/ideas/evolve 掷骰序列进账）。
CASES.push({
  name: 'soc-drift', mode: 'ops', terrain: 'plains', seed: seedOf('soc-drift', 401),
  env: { tick: 150, yearF: 3.8 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 30, gold: 60, gov: 1, stability: 55, culture: 12, militarism: 40,
      tiles: Array.from({ length: 130 }, (_, i) => 8041 + i), techs: ['theology'] },
    { id: 1, name: '磐石国', race: raceIds.human, colorHex: '#5ba8e0', pop: 10 },
    { id: 2, name: '苍梧国', race: raceIds.human, colorHex: '#c0a060', pop: 12, stability: 60 },
    { id: 3, name: '白川国', race: raceIds.human, colorHex: '#60a0c0', pop: 12, stability: 60 },
  ],
  units: [],
  ops: [
    { op: 'bld', i: 8041, kind: 10, civ: 0 },
    { op: 'bld', i: 8042, kind: 8, civ: 0 },
    { op: 'rebuild' },
    { op: 'formal', a: 2, b: 3 },
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'stick' },
    { op: 'stick' },
    { op: 'imod', civ: 0 },
    { op: 'imod', civ: 1 },
  ],
});
// S2 soc-festival：节日链——culture 65 预置（>40 门）+stick×15：rng<0.3 过门 → festivalCd=10+
//   culture -20+stability+3+纪事逐字 → 后续拍 festivalCd 递减零抽 → 到期再掷——冷却期与
//   重燃节奏全捕获（种子寻优保两轮过节）。
CASES.push({
  name: 'soc-festival', mode: 'ops', terrain: 'plains', seed: seedOf('soc-festival', 402),
  env: { tick: 300, yearF: 7.5 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 14, culture: 65, stability: 50 },
  ],
  units: [],
  ops: [
    { op: 'stick' }, { op: 'stick' }, { op: 'stick' }, { op: 'stick' }, { op: 'stick' },
    { op: 'stick' }, { op: 'stick' }, { op: 'stick' }, { op: 'stick' }, { op: 'stick' },
    { op: 'stick' }, { op: 'stick' }, { op: 'stick' }, { op: 'stick' }, { op: 'stick' },
  ],
});
// S3 soc-ideas：理念采纳双路——civ0 spread 路径（setemidea ×2 预置 emIdeas+ideas 空 culture 65：
//   known>0 → rng<0.5 过门 → known[floor(rng×2)] 采纳+imod 失效重建对照）；civ1 invent 路径
//   （emIdeas 已全持 → known 0 → inventIdea：body/post/pre 门/微扰逐 mod 抽——id0 登记+desc
//   效果位串+imod 六元位串）；ideas <3 门与 culture>60 门消费序。
CASES.push({
  name: 'soc-ideas', mode: 'ops', terrain: 'plains', seed: seedOf('soc-ideas', 403),
  env: { tick: 450, yearF: 11.3, ideaSeq: 2 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 14, culture: 65, festivalCd: 2 },
    { id: 1, name: '磐石国', race: raceIds.human, colorHex: '#5ba8e0', pop: 14, culture: 65, festivalCd: 2, ideas: ['id0', 'id1'] },
  ],
  units: [],
  ops: [
    { op: 'setemidea', key: 'id0', name: '重商主义', desc: '商路即国脉 —— 收入 +18%',
      mods: { gold: 0.18 } },
    { op: 'setemidea', key: 'id1', name: '铁律律令', desc: '令行禁止 —— 稳定 +4',
      mods: { stab: 4, gold: -0.05 } },
    { op: 'imod', civ: 0 },
    { op: 'stick' },
    { op: 'stick' },
    { op: 'imod', civ: 0 },
    { op: 'stick' },
    { op: 'stick' },
    { op: 'imod', civ: 1 },
  ],
});
// S4 soc-gov-evolve：政体跃迁三路——civ0 pop130+军国 60+legion（canEmpire→rng<0.25 帝国）；
//   civ1 pop60+law+knowledge 50+stability 50（empire 拒→canRepublic rng<0.18）；civ2 pop25
//   （empire/republic/theocracy 全拒→canMonarchy rng<0.2）——冷却 2000 门（adv 1999 拒
//   零抽→adv 1 过门二跃）；govCache/lastGovEventTick/govYear 终态。
CASES.push({
  name: 'soc-gov-evolve', mode: 'ops', terrain: 'plains', seed: seedOf('soc-gov-evolve', 404),
  env: { tick: 600, yearF: 15.0 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 130, gold: 30, militarism: 60, techs: ['legion'] },
    { id: 1, name: '磐石国', race: raceIds.human, colorHex: '#5ba8e0', pop: 60, gold: 30, stability: 50, knowledge: 50, techs: ['law'] },
    { id: 2, name: '孤竹国', race: raceIds.human, colorHex: '#8ad0a0', pop: 25, gold: 30 },
  ],
  units: [],
  ops: [
    { op: 'stick' },
    { op: 'adv', n: 1999 },
    { op: 'stick' },
    { op: 'adv', n: 1 },
    { op: 'stick' },
    { op: 'adv', n: 1500 },
    { op: 'stick' },
  ],
});
// S5 soc-revolution-riot：危机链——civ0 stability 10 预置+pop 30+knowledge 40（暴动门过→
//   启蒙革命 setGov 3 'revolution' 逐字）；civ1 stability 10+pop 20（≤25 → 暴动事件逐字+
//   stability min(40, 10+12)=22+gold -15）；civ2 stability 10+pop 30+knowledge 40+gov 3
//   （gov===3 拒革命→暴动路）；gold 零下限对照（civ1 gold 8 → max(0, -7)=0）。
CASES.push({
  name: 'soc-revolution-riot', mode: 'ops', terrain: 'plains', seed: seedOf('soc-revolution-riot', 405),
  env: { tick: 900, yearF: 22.5 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 30, gold: 30, knowledge: 40, stability: 10 },
    { id: 1, name: '磐石国', race: raceIds.human, colorHex: '#5ba8e0', pop: 20, gold: 8, stability: 10 },
    { id: 2, name: '孤竹国', race: raceIds.human, colorHex: '#8ad0a0', pop: 30, gold: 30, knowledge: 40, stability: 10, gov: 3 },
  ],
  units: [],
  ops: [
    { op: 'stick' },
    { op: 'stick' },
  ],
});
// S6 soc-recent-victory：recentVictory 窗口指纹——war(0,1) 建档+setwd scoreA 50（civ0 领先）
//   → adv 使 tickCount-startTick=250 ∈ (200,300) → stick 军国 +1.2 指纹 vs civ2 无战争基线；
//   窗外对照（adv 后 tickCount-startTick=301 → recentVictory false 拒加成）。
CASES.push({
  name: 'soc-recent-victory', mode: 'ops', terrain: 'plains', seed: seedOf('soc-recent-victory', 406),
  env: { tick: 1200, yearF: 30.0 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 14, militarism: 40 },
    { id: 1, name: '磐石国', race: raceIds.human, colorHex: '#5ba8e0', pop: 14, militarism: 40 },
    { id: 2, name: '孤竹国', race: raceIds.human, colorHex: '#8ad0a0', pop: 14, militarism: 40 },
  ],
  units: [],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'setwd', a: 0, b: 1, patch: { scoreA: 50 } },
    { op: 'adv', n: 250 },
    { op: 'stick' },
    { op: 'adv', n: 51 },
    { op: 'stick' },
  ],
});
// S7 soc-homogeneity：种族张力——sethomo 0.7（<0.9 门）→ human harmony 0.7：+（0.25）×20×0.2
//   =+1.0；orc harmony 0.25：-0.2×20×0.2=-0.8——同 homo 异种族稳定度分化指纹；homo 1 对照零触达。
CASES.push({
  name: 'soc-homogeneity', mode: 'ops', terrain: 'plains', seed: seedOf('soc-homogeneity', 407),
  env: { tick: 1350, yearF: 33.8 },
  civs: [
    { id: 0, name: '晨风国', race: raceIds.human, colorHex: '#cf3f2e', pop: 14, stability: 50 },
    { id: 1, name: '血蹄国', race: raceIds.orc, colorHex: '#e05b5b', pop: 14, stability: 50 },
    { id: 2, name: '磐石国', race: raceIds.human, colorHex: '#5ba8e0', pop: 14, stability: 50 },
  ],
  units: [],
  ops: [
    { op: 'sethomo', civ: 0, v: 0.7 },
    { op: 'sethomo', civ: 1, v: 0.7 },
    { op: 'stick' },
    { op: 'sethomo', civ: 0, v: 0.95 },
    { op: 'stick' },
  ],
});
const out = {
  w: W, h: H, ep: EP, raceIds, races: raceTable,
  jobs: JOBS_ECHO, firsts: FIRST_ECHO,
  raceRelBase: RACE_REL_BASE_ECHO,
  traitKeys: TRAIT_KEYS, traitDefs: TRAIT_DEFS_ECHO, em: EM_ECHO,
  alColors: ALLIANCE_COLORS_ECHO,
  // M-U3 切片 5：科技域数据面（TECHS 全表/BUILDING hp/涌现词法）
  techs: TECHS_ECHO, buildingHp: BUILDING_HP_ECHO, emLex: EM_LEX,
  // M-U3 切片 6：社会域数据面（GOV_DEFS 播报词法/IDEA 词法）
  govDefs: GOV_DEFS_ECHO, ideaLex: IDEA_LEX,
  terrainSpecs: TERRAIN_SPECS,
  cases: [],
};

for (const c of CASES) {
  const env = { ...c.env };
  const envInit = JSON.parse(JSON.stringify(env));   // 深拷贝初始 env（真实现原地变异——echo 须为初始态）
  const cap = { fx: [], evt: [], terr: [], rz: [] };
  const eng = makeStubEng(env, cap);
  eng.terrain.set(buildGrid(TERRAIN_SPECS.find((s) => s.name === c.terrain)));
  // 文明注入（tiles 浅拷贝已由 mkCiv 完成）+ owner 预置（领土一致性前提）
  for (const cv of c.civs) eng.civs[cv.id] = mkCiv(cv);
  for (const cv of eng.civs) {
    if (!cv) continue;
    for (const t of cv.tiles) eng.owner[t] = cv.id;
  }
  const units = c.units.map((s) => mkTsUnit({ ...s, race: raceIds[s.race] ?? s.race }));
  eng.units = units;
  for (const u of units) if (!u.dead && !RACES[u.race].isCiv) eng.wildCount.set(u.race, (eng.wildCount.get(u.race) ?? 0) + 1);

  let draws = 0;
  const raw = mulberry32(c.seed);
  eng.rng = () => { draws++; return raw(); };

  const evts = [];
  eng.addEvent = (kind, text, opts) => { cap.evt.push(['ev', kind, text, opts?.colorHex === undefined ? null : opts.colorHex, opts?.x === undefined ? null : bitHex(opts.x), opts?.y === undefined ? null : bitHex(opts.y)]); evts.push({ id: eng.eventSeq++, year: Math.floor(eng.yearF), kind, text, colorHex: opts?.colorHex ?? null, x: opts?.x === undefined ? null : opts.x, y: opts?.y === undefined ? null : opts.y }); };

  const outSteps = [];
  for (const op of c.ops) {
    draws = 0;
    const evMark = evts.length;
    let probe = null;
    const rec = { op: op.op };
    switch (op.op) {
      case 'spawn': {
        const u = eng.spawnUnit(raceIds[op.race] ?? op.race, op.x, op.y, {
          civ: op.civ, job: op.job, silent: true,
          trait: op.trait, gene: op.gene, fam: op.fam, fgn: op.fgn,
        });
        probe = u ? snapU(u) : null;
        break;
      }
      case 'step': {
        eng.rebuildBuckets();
        const perU = [];
        const fx0 = cap.fx.length;
        for (let i = 0; i < units.length; i++) {   // 活数组：循环内新生 push → 边界增长（C# LiveLen 同构）
          const u = units[i];
          if (u.dead) { perU.push({ dead: true }); continue; }
          const e0 = cap.evt.length, f0 = cap.fx.length;
          eng.updateUnit(u);                        // 前置+扫描+战斗树+尾段+后段（真实现）
          perU.push({
            ...snapU(u),
            evt: cap.evt.slice(e0),
            fx: cap.fx.slice(f0).map((f) => [f.k, f.x, f.y, f.ttl]),
          });
        }
        eng.unitsReap();
        rec.units = perU;
        rec.all = units.map(snapU);
        rec.fx = cap.fx.slice(fx0).map((f) => [f.k, f.x, f.y, f.ttl]);
        rec.wild = dumpWild(eng);
        rec.families = dumpFamilies(eng);
        eng.tickCount++;
        break;
      }
      case 'dtick': eng.directiveTick(); break;
      case 'issue': {
        const d = eng.issueDirective(op.civ, op.kind, op.param ?? 0, op.target);
        probe = d ? d.id : null;
        break;
      }
      case 'rebuild': eng.rebuildCivBuildCounts(); break;
      case 'bld': {
        eng.building[op.i] = op.kind;
        eng.buildings.push({ i: op.i, x: op.i % W, y: (op.i / W) | 0, kind: op.kind, civ: op.civ });
        eng.bIdx.set(op.i, eng.buildings.length - 1);
        eng.bHp.set(op.i, { 1: 70, 2: 240, 3: 120, 4: 40, 5: 150, 6: 340, 7: 90, 8: 110, 9: 100, 10: 140, 11: 200 }[op.kind] ?? 70);
        const bcv = eng.civs[op.civ];
        if (bcv && op.kind !== 11) bcv.houses++;
        break;
      }
      case 'setciv': {
        const cv = eng.civs[op.id];
        if (!cv) throw new Error('setciv: no civ ' + op.id);
        for (const [k, v] of Object.entries(op.patch)) cv[k] = v;
        break;
      }
      case 'setocc': {
        eng.occCiv[op.i] = op.civ; eng.occStr[op.i] = op.str; eng.occSet.add(op.i);
        if (op.civ >= 0 && !eng.civs[op.civ].tiles.includes(op.i)) eng.civs[op.civ].tiles.push(op.i);
        break;
      }
      case 'setemidea': eng.emIdeas.set(op.key, { key: op.key, name: op.name ?? op.key, desc: op.desc ?? '', mods: { ...op.mods } }); break;
      case 'sethomo': eng.civHomogeneity.set(op.civ, op.v); break;
      case 'stick': eng.societyTick(); break;
      case 'setvict': eng.victoryCiv = op.id; break;
      case 'setwd': {
        const wd = eng.warData.get(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`);
        if (!wd) throw new Error('setwd: no warData ' + op.a + '-' + op.b);
        for (const [k, v] of Object.entries(op.patch)) wd[k] = v;
        break;
      }
      case 'war': eng.declareWar(op.agg, op.vic, op.reason, op.opts); break;
      case 'peace': eng.makePeace(op.a, op.b, op.text, op.postRel); break;
      case 'adv': eng.tickCount += op.n; break;
      case 'setrel': eng.rel.set(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`, op.v); break;
      case 'met': eng.met.add(op.a < op.b ? `${op.a}-${op.b}` : `${op.b}-${op.a}`); break;
      case 'warkill': eng.onWarKill({ civ: op.kc, army: undefined }, { civ: op.vc }); break;
      case 'killciv': eng.civs[op.id].alive = false; break;
      case 'popcap': {
        const cv = eng.civs[op.civ];
        probe = cv ? bitHex(eng.popCapOf(cv)) : null;
        break;
      }
      case 'tmod': {
        const cv = eng.civs[op.civ];
        probe = cv ? dumpTm(eng.techModsOf(op.civ)) : null;
        break;
      }
      case 'imod': {
        const cv = eng.civs[op.civ];
        probe = cv ? dumpIm(eng.ideaModsOf(op.civ)) : null;
        break;
      }
      case 'prog': {
        const d = eng.activeDirective(op.civ, op.kind);
        probe = d ? bitHex(eng.directiveProgressOf(d)) : null;
        break;
      }
      // —— M-U3 切片 5：科技研发域 op ——
      case 'etick': eng.economyTick(); break;
      case 'ttick': eng.techTick(); break;
      case 'fundres': {
        const spent = eng.fundResearch(eng.civs[op.civ], op.points);
        probe = bitHex(spent);
        break;
      }
      case 'avail': probe = eng.availableTechs(eng.civs[op.civ]).map((t) => t.key); break;
      case 'pickres': probe = eng.pickResearch(eng.civs[op.civ]); break;
      case 'comptech': eng.completeTech(eng.civs[op.civ], op.key); break;
      case 'formal': {
        const al = eng.formAlliance(eng.civs[op.a], eng.civs[op.b]);
        probe = al ? al.id : null;
        break;
      }
      case 'setalpatch': {
        const al = eng.alliances.find((a) => a.id === op.id);
        if (!al) throw new Error('setalpatch: no alliance ' + op.id);
        for (const [k, v] of Object.entries(op.patch)) al[k] = v;
        break;
      }
      case 'setemtech':
        eng.emTechs.set(op.key, {
          key: op.key, name: op.name, cat: op.cat, cost: op.cost, gen: op.gen,
          effects: op.effects.map((e) => ({ k: e.k, v: e.v })), desc: op.desc,
        });
        break;
      case 'bhps': probe = [...eng.bHp.entries()].map(([i, v]) => [i, bitHex(v)]); break;
      default: throw new Error('unknown op: ' + op.op);
    }
    rec.draws = draws;
    rec.probe = probe;
    rec.dirs = dumpDirectives(eng);
    rec.civs = dumpCivs(eng);
    rec.evts = evts.slice(evMark);
    outSteps.push(rec);
  }

  const rec = {
    name: c.name, mode: c.mode, terrain: c.terrain, seed: c.seed,
    env: { ...envInit, dayPhase: (eng.frameCount % 2400) / 2400, lawsUndeadRise: false, lawsReproduction: env.lawsRepro !== false, neuro: { enabled: false, flightMode: 'rl' } },
    civs: c.civs, units: c.units.map((s) => ({ ...s, race: raceIds[s.race] ?? s.race })), ops: c.ops,
    out: outSteps,
    final: units.map(snapU),
    dirs: dumpDirectives(eng),
    civs0: c.civs, civsEnd: dumpCivs(eng),
    alliances: dumpAlliances(eng),
    rel: dumpRel(eng.rel),
    raceRel: dumpRel(eng.raceRel),
    met: [...eng.met],
    events: evts,
    wild: dumpWild(eng),
    families: dumpFamilies(eng),
    unitSeq: eng.unitSeq,
    traitSeq: eng.traitSeq,
    dirSeq: eng.dirSeq,
    victoryCiv: eng.victoryCiv,
    // M-U3 切片 5：科技域终态（evoSeq recordEvo 消费/emTechSeq 涌现代数/emTechs 全量）
    evoSeq: eng.evoSeq,
    emTechSeq: eng.emTechSeq,
    ideaSeq: eng.ideaSeq,
    govCache: [...eng.govCache.entries()].map(([k, v]) => [k, v]),
    lastGovEventTick: [...eng.lastGovEventTick.entries()].map(([k, v]) => [k, v]),
    emIdeas: [...eng.emIdeas.entries()].map(([k, t]) => ({
      key: k, name: t.name, desc: t.desc,
      mods: {
        gold: t.mods.gold === undefined ? null : bitHex(t.mods.gold),
        stab: t.mods.stab === undefined ? null : bitHex(t.mods.stab),
        mil: t.mods.mil === undefined ? null : bitHex(t.mods.mil),
        know: t.mods.know === undefined ? null : bitHex(t.mods.know),
        repro: t.mods.repro === undefined ? null : bitHex(t.mods.repro),
        wear: t.mods.wear === undefined ? null : bitHex(t.mods.wear),
      },
    })),
    emTechs: [...eng.emTechs.entries()].map(([k, t]) => ({
      key: k, name: t.name, cat: t.cat, cost: t.cost, gen: t.gen,
      effects: t.effects.map((e) => [e.k, bitHex(e.v)]), desc: t.desc,
    })),
    bhpsEnd: [...eng.bHp.entries()].map(([i, v]) => [i, bitHex(v)]),
  };
  rec.rngTail = [raw(), raw(), raw(), raw()].map(bitHex);
  out.cases.push(rec);
}

// —— 激活度自检（--hunt：各 case 科技域摘要） ——
if (process.argv.includes('--hunt')) {
  for (const r of out.cases) {
    let techEvts = 0, emerge = 0, alliance = 0;
    for (const st of r.out) if (st.evts) for (const e of st.evts) {
      if (e.kind === 'tech') techEvts++;
      if (e.kind === 'emerge') emerge++;
      if (e.kind === 'alliance') alliance++;
    }
    let fest = 0, govN = 0, riot = 0;
    for (const st of r.out) if (st.evts) for (const e of st.evts) {
      if (e.kind === 'festival') fest++;
      if (e.kind === 'gov') govN++;
      if (e.kind === 'riot') riot++;
    }
    const govs = r.civsEnd.filter((c2) => c2 && c2.gov !== null).map((c2) => c2.gov);
    const ideas = r.civsEnd.filter((c2) => c2 && c2.ideas.length > 0).map((c2) => c2.ideas.length);
    console.log(`${r.name}: techEvts=${techEvts} fest=${fest} gov=${govN} riot=${riot} govs=[${govs}] ideas=[${ideas}] ideaSeq=${r.ideaSeq} evoSeq=${r.evoSeq} draws[maxOp]=${Math.max(...r.out.map((s) => s.draws))}`);
  }
}

const outPath = new URL('./golden-units-society.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(out));
console.log(`golden-units-society.json: ${out.cases.length} cases, ${(JSON.stringify(out).length / 1024).toFixed(0)}KB`);
