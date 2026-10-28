// ============================================================================
// gen-units-barracks.mjs —— M-U3 切片 10「兵营练兵」黄金向量
// 蓝本：src/lib/game/engine.ts
//   barracksTick L5270-5295（%200 调用点 L2615——barracks→history→warTick 序）：
//   buildings 全序扫描 + kind===BARRACKS(5) 过滤 + civ.alive 门 + civAtWar 战和分岔
//   （和平时 1 抽 rng>0.25 早退——战时零抽）+ 3.5 格桶窗（bx0/by0=floor((±3.5)/4)
//   边界钳 0..bw-1/bh-1——窗口为 3.5 盘超集纯优化）+ quota 战时 2/平时 1 +
//   三重 by/bx/桶内循环 trained<quota 短路 + 桶序即迭代序（rebuildBuckets 单位数组序
//   push——dead 单位也在桶内）+ 过滤链 dead/异国/job===2（无 boat 检查——舟中亦可练！）
//   + Math.hypot<3.5 严格（fdlibm——3.5 整点不练）+ setJob(o,2) 相对转职 +
//   fx('spawn', o.x, o.y, 24)（seed floor(rng×65536)+dir rng×2π 各 1 抽）。
// 直接 import 现役 engine.ts（真实现，零同源复制）：原型链 stub 驱动（Task 140 模式）。
// op 语义：btick=rebuildBuckets+barracksTick（真实引擎 %200 调用点拍前桶已重建——
//   显式化逐 op 对账；op 模型无单位移动——重建即实时态）/ war/bld/rebuild/adv/setciv/
//   killciv 等旧 op 全量继承（rebel gen）。
// rng 消耗点（对账指纹）：和平兵营门 1 抽/座（atWar 短路 0 抽）/ fx spawn 2 抽/人
//   （seed+dir）/ setJob 0 抽（相对转职纯换算）/ 桶扫描 0 抽。
// 场景设计铁律：桶窗=3.5 盘超集（|dx|≤3.5 ⇒ bucket∈窗口——窗口裁剪无独立语义）；
//   3.5 整点严格不练（fdHypot(3.5,0)=3.5）；dead 单位入桶（重建无 dead 过滤——消费侧过滤）。
// 截断契约（C# 侧哨兵/no-op 同构，触达即设计错误）：
//  ① toast/onSound/setFrozen/onStats——UI 域 no-op；
//  ② armies 空表（barracks 域不组军）；③ evoNodes/stats UI 快照面不镜像。
// 运行：bun scripts/unity-migration/gen-units-barracks.mjs（PW_SEEDS 环境变量通道 + --hunt 激活度自检）
// 输出：scripts/unity-migration/golden-units-barracks.json
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, TRAITS, JOBS, ALLIANCE_COLORS, RACE_REL_BASE, BUILDING_DEFS } from '../../src/lib/game/types.ts';
import { TECHS, GOV_DEFS } from '../../src/lib/game/tech.ts';
import { FIRST, civName, roman } from '../../src/lib/game/names.ts';
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
    // M-U3 切片 7：灭国 fall 播报词法（RACES[race].name——C# host.RaceNames）
    name: d.name,
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
// M-U3 切片 7：建筑全维 echo（cost/needKnowledge/popCap/name——pickBuildingKind/
//   tryBuildBuilding/buildBuilding/wallTick 消费面——C# host 静态表+词法名）
const BUILDING_ECHO = BUILDING_DEFS.map((b, i) => ({
  i, key: b.key, name: b.name, hp: b.hp,
  popCap: b.popCap === undefined ? null : b.popCap,
  cost: b.cost === undefined ? null : b.cost,
  needKnowledge: b.needKnowledge === undefined ? null : b.needKnowledge,
}));

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
  // M-U3 切片 7：王权/幽灵/殖民面（civsTick 消费/写入——TS optional 语义保真）
  kingId: o.kingId === undefined ? undefined : o.kingId,
  kingName: o.kingName === undefined ? undefined : o.kingName,
  popZeroTick: o.popZeroTick === undefined ? undefined : o.popZeroTick,
  colonizeCd: o.colonizeCd === undefined ? undefined : o.colonizeCd,
  mergedInto: o.mergedInto === undefined ? undefined : o.mergedInto,
  frontier: [...(o.frontier ?? [])],   // 扩张域预置边境（swap-pop 原地变异——浅拷贝铁律）
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
  if (spec.gids) { u.gIds = [...spec.gids]; u.gVal = [...spec.gval]; }
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
  if (spec.gene) u.gene = { ...spec.gene };
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
  boatTTL: u.boatTTL ?? 0,   // M-U3 切片 8：舰队补给/海难面（naval 编队 1600/200 写点）
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

// 地形规格（草地主面 + 湖泊对照 + 战地（森林伏击/湖障碍/山障）+ 群岛（渡海舰队））
const TERRAIN_SPECS = [
  { name: 'plains', def: T.GRASS, patches: [] },
  { name: 'lake', def: T.GRASS, patches: [[0, 0, W, 20, T.WATER], [0, H - 20, W, H, T.WATER]] },
  { name: 'warland', def: T.GRASS, patches: [[38, 22, 52, 34, T.FOREST], [42, 36, 43, 40, T.WATER], [60, 70, 72, 84, T.WATER], [150, 56, 162, 72, T.MOUNTAIN]] },
  { name: 'islands', def: T.WATER, patches: [[16, 56, 84, 116, T.GRASS], [168, 56, 236, 116, T.GRASS]] },
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
  // M-U3 切片 7：civsTick 主输出面（王权/幽灵/殖民/融合——jobs/tech/society 旧档不触碰）
  capital: cv.capital,
  kingId: cv.kingId === undefined ? null : cv.kingId,
  kingName: cv.kingName === undefined ? null : cv.kingName,
  popZeroTick: cv.popZeroTick === undefined ? null : cv.popZeroTick,
  colonizeCd: cv.colonizeCd === undefined ? null : bitHex(cv.colonizeCd),
  mergedInto: cv.mergedInto === undefined ? null : cv.mergedInto,
  // M-U3 切片 9：createCiv 主输出面（建国三元组——词法/色板/种族）
  race: cv.race,
  banner: cv.banner === undefined ? null : cv.banner,
  colorHex: cv.colorHex === undefined ? null : cv.colorHex,
}));
const dumpAlliances = (eng) => eng.alliances.map((al) => ({
  id: al.id, name: al.name, members: [...al.members], leader: al.leader,
  cohesion: bitHex(al.cohesion), colorHex: al.colorHex, formedTick: al.formedTick,
}));
// —— M-U3 切片 8：军团全维快照（24 字段——undefined→null 语义保真）——
const dumpArmies = (eng) => eng.armies.map((a) => ({
  id: a.id, civ: a.civ, name: a.name, members: [...a.members], leaderId: a.leaderId,
  x: bitHex(a.x), y: bitHex(a.y), tx: bitHex(a.tx), ty: bitHex(a.ty),
  state: a.state, formedTick: a.formedTick, size0: a.size0, morale: bitHex(a.morale),
  targetCiv: a.targetCiv, rot: bitHex(a.rot), kills: a.kills, losses: a.losses, evalTick: a.evalTick,
  battleSize0: a.battleSize0 === undefined ? null : a.battleSize0,
  marchPushTick: a.marchPushTick === undefined ? null : a.marchPushTick,
  battleSince: a.battleSince === undefined ? null : a.battleSince,
  clashWith: a.clashWith === undefined ? null : a.clashWith,
  naval: !!a.naval, ambush: !!a.ambush, tactical: !!a.tactical,
  reinforced: a.reinforced === undefined ? null : a.reinforced,
  supplyWarned: !!a.supplyWarned,
}));
// —— 占领层摘要（occSet 有序集 + 力度和）+ 战争档案统计面（battles/score/cas/ex/occ）——
const dumpOcc = (eng) => {
  let n = 0, s = 0;
  for (const i of eng.occSet) { n++; s += eng.occStr[i]; }
  return { n, s };
};
const dumpWds = (eng) => [...eng.warData.entries()].map(([k, w]) => ({
  k, battles: w.battles ?? 0, scoreA: bitHex(w.scoreA ?? 0), scoreB: bitHex(w.scoreB ?? 0),
  casA: w.casA ?? 0, casB: w.casB ?? 0, exA: w.exA ?? 0, exB: w.exB ?? 0,
  occA: w.occA ?? 0, occB: w.occB ?? 0,
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
  eng.speciesHist = new Map();                           // statsTick 物种史采样面（UI 域——statsTick 真实现消费）
  eng.unitById = new Map();
  eng.nature = { season: env.season ?? 0, bloodMoonTTL: env.bloodMoonTtl ?? 0, eclipseTTL: env.eclipseTtl ?? 0, reproMul() { return this.season === 0 ? 1.14 : this.season === 3 ? 0.78 : 1; }, snapshot() { return { season: this.season }; } };   // nature.ts L371-374 机械镜像 + statsTick snapshot 面（UI 截断④）
  eng.moonIllum = () => env.moonIllum ?? 0;
  eng.fxPrefs = { get ambience() { return env.ambience ?? false; }, get blood() { return env.fxBlood ?? true; }, get dmgNumbers() { return env.fxDmgNumbers ?? true; }, get corpses() { return env.fxCorpses ?? true; } };
  eng.effects = [];                                      // M-U3 切片 7：fx 真实现（smoke/hammer/spawn 2 抽——warinfo gen 同源，不再 stub）
  eng.frameCount = env.frameCount ?? 100;
  eng.tickCount = env.tick ?? 0;                          // ⚠ 类字段原型链不继承——漏初始化 → NaN → 期限永不触发
  eng.laws = { wars: env.lawsWars !== false, undeadRise: false, zombieInfect: env.lawsZombie ?? false, reproduction: env.lawsRepro !== false, zombieVirus: env.lawsZombieVirus !== false, cityGrowth: env.lawsCityGrowth !== false, rebels: env.lawsRebels !== false };   // wars（declareWar 门）+ cityGrowth/rebels（civsTick 门——M-U3 切片 7）
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
  eng.armies = [];                                       // M-U3 切片 8 开闸面（真实现）
  eng.armySeq = env.armySeq ?? 1;                        // ⚠ 类字段原型链不继承（Task 153 课）
  eng.armyNameSeq = new Map();                           // per-civ 军团序号（armyNameByJobs·roman）
  eng.lastClashEventTick = 0;                            // 会战/齐射/增援播报去重计时器（类字段）
  eng.lastReinforceEventTick = 0;
  eng.lastVolleyEventTick = 0;
  eng.shake = 0;                                         // 屏震 UI 域不入对账面（防 NaN 污染）
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
  // —— M-U3 切片 7 开闸面：王权/幽灵/殖民/建造真实现消费 ——
  eng.statCivsFallen = 0;                                // eliminateCiv 成就计数
  eng.propsDirty = new Set();                            // connectRoad 铺路脏标（UI 域——Count 对账）
  eng.raceThrived = new Set();                           // statsTick 灭绝检测面（UI 域截断④）
  eng.extinctNoted = new Set();
  eng.zombieOutbreakNoted = false;
  eng.achUnlocked = new Map();
  eng.achProgressCache = {};
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
  eng.toast = () => {};                                  // 截断②
  eng.onSound = null;
  eng.onStats = null;                                    // 截断④（statsTick UI 快照面弃置）
  eng.setTerrain = (i, t) => { if (eng.terrain[i] === t) return; const old = eng.terrain[i]; eng.terrain[i] = t; cap.terr.push([i, old, t]); };
  eng.updateUnitTailJS = (u) => { cap.evt.push(['tail', u.id]); return false; };
  // M-U3 切片 8：tryFormArmy 真实现（不再 stub——armies 域全面开闸）
  // ⚠ updateUnit/updateUnitPostJS/unitsReap/techModsOf/ideaModsOf/popCapOf/houseTierOf/
  //    rollJob/setJob/activeDirective/issueDirective/applyDirectiveImpulse/describeDirective/
  //    directiveTick/evalDirective/finishDirective/directiveProgressOf/rebuildCivBuildCounts/
  //    declareWar/makePeace/formAlliance/joinAlliance/civsTick/crownVacantTick/crownUnit/
  //    seedTerritory/buildBuilding/connectRoad/findPath/wallTick/tryBuildBuilding/
  //    pickBuildingKind/eliminateCiv/mergeCivs/civFuseScan/clearFrontOf/tryLaunchColonyShip/
  //    findWaterNear/findColonyTarget/statsTick/tryFormArmy/armyTick/frontTick/frontPush/
  //    frontSolidify/civRallyPoint/pickWarEnemy/nearestStandable/formationPos/armyMarchTarget/
  //    armyRally/armyMarch/armyBattle/armySiege/armyRetreat/declareClash/nearestEnemyArmy/
  //    nearestEnemyBuildingOf/crossesWater/armyEmbark/armyDisembark/routArmy/disbandArmy/
  //    electLeader/leadAim/isRangedMember/castArrow/castBullet/castBeam/launchMech 不 stub——真实现
  return eng;
}

const SEEDS = JSON.parse(process.env.PW_SEEDS ?? '{}');
function seedOf(name, dflt) { return SEEDS[name] ?? dflt; }
const CASES = [];
// 领土/边境布局工具（5×5 圈 + 外圈边境预置——扩张域 swap-pop 原地变异）
const block5 = (cx, cy) => { const a = []; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) a.push((cy + dy) * W + (cx + dx)); return a; };
const ringOf = (cx, cy, r) => { const a = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; a.push((cy + dy) * W + (cx + dx)); } return a; };
const rect = (x1, y1, x2, y2) => { const a = []; for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) a.push(y * W + x); return a; };
const roadCount = (eng) => { let n = 0; for (let i = 0; i < eng.road.length; i++) if (eng.road[i]) n++; return n; };
// ============================ M-U3 切片 10 场景 ============================
// S1 barr-peace-gates：和平门双兵营对照——civ0 掷 >0.25 早退（1 抽零练）/ civ1 掷 ≤0.25
//   过门练 1（quota 平时 1）+ fx spawn 2 抽。建筑序即掷序。
CASES.push({
  name: 'barr-peace-gates', mode: 'ops', terrain: 'plains', seed: seedOf('barr-peace-gates', 731),
  env: { tick: 200, yearF: 0.2, civSeq: 2 },
  civs: [
    { id: 0, name: '息兵国', race: raceIds.human, colorHex: '#cf3f2e', pop: 2, gold: 20, colonizeCd: 9999,
      tiles: rect(16, 16, 28, 28), capital: 20 * 256 + 20 },
    { id: 1, name: '缓武国', race: raceIds.human, colorHex: '#5ba8e0', pop: 2, gold: 20, colonizeCd: 9999,
      tiles: rect(36, 16, 48, 28), capital: 20 * 256 + 40 },
  ],
  units: [
    { id: 101, race: 'human', x: 20.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '民一' },
    { id: 201, race: 'human', x: 40.5, y: 20.5, civ: 1, job: 0, maxHp: 50, hp: 50, name: '民二' },
  ],
  ops: [
    { op: 'bld', i: 20 * 256 + 20, kind: 5, civ: 0 },
    { op: 'bld', i: 20 * 256 + 40, kind: 5, civ: 1 },
    { op: 'rebuild' },
    { op: 'btick' },
  ],
});
// S2 barr-war-quota：战时 quota 2——桶窗双循环序（by=4 空→by=5：bx=4 先于 bx=5——
//   桶(4,5) 的 u103 先练、桶(5,5) 的 u101 练满 quota、同桶 u102 中断）+ atWar 零门抽。
CASES.push({
  name: 'barr-war-quota', mode: 'ops', terrain: 'plains', seed: seedOf('barr-war-quota', 731),
  env: { tick: 200, yearF: 0.2, civSeq: 2 },
  civs: [
    { id: 0, name: '交战甲', race: raceIds.human, colorHex: '#cf3f2e', pop: 3, gold: 30, colonizeCd: 9999,
      tiles: rect(16, 16, 28, 28), capital: 20 * 256 + 20 },
    { id: 1, name: '交战乙', race: raceIds.human, colorHex: '#5ba8e0', pop: 1, gold: 10, colonizeCd: 9999,
      tiles: rect(40, 16, 48, 28), capital: 20 * 256 + 44 },
  ],
  units: [
    { id: 101, race: 'human', x: 20.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '甲一' },
    { id: 102, race: 'human', x: 21.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '甲二' },
    { id: 103, race: 'human', x: 19.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '甲三' },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'bld', i: 20 * 256 + 20, kind: 5, civ: 0 },
    { op: 'rebuild' },
    { op: 'btick' },
  ],
});
// S3 barr-bounds：3.5 严格边界矩阵——(16.6,20) d=3.4 练 / (16.4,20) d=3.6 留 /
//   (16.5,20) d=3.5 整点严格留（fdHypot(3.5,0)=3.5）/ (22.4,22.4) d=3.394 斜向练 /
//   (23.9,20) d=3.9 桶内过远留。quota 2 恰容两练。
CASES.push({
  name: 'barr-bounds', mode: 'ops', terrain: 'plains', seed: seedOf('barr-bounds', 732),
  env: { tick: 200, yearF: 0.2, civSeq: 2 },
  civs: [
    { id: 0, name: '校场国', race: raceIds.human, colorHex: '#cf3f2e', pop: 5, gold: 30, colonizeCd: 9999,
      tiles: rect(16, 16, 28, 28), capital: 20 * 256 + 20 },
    { id: 1, name: '陪练国', race: raceIds.human, colorHex: '#5ba8e0', pop: 1, gold: 10, colonizeCd: 9999,
      tiles: rect(40, 16, 48, 28), capital: 20 * 256 + 44 },
  ],
  units: [
    { id: 101, race: 'human', x: 16.6, y: 20, civ: 0, job: 0, maxHp: 50, hp: 50, name: '界内' },
    { id: 102, race: 'human', x: 16.4, y: 20, civ: 0, job: 0, maxHp: 50, hp: 50, name: '界外' },
    { id: 103, race: 'human', x: 16.5, y: 20, civ: 0, job: 0, maxHp: 50, hp: 50, name: '整点' },
    { id: 104, race: 'human', x: 22.4, y: 22.4, civ: 0, job: 0, maxHp: 50, hp: 50, name: '斜内' },
    { id: 105, race: 'human', x: 23.9, y: 20, civ: 0, job: 0, maxHp: 50, hp: 50, name: '过远' },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'bld', i: 20 * 256 + 20, kind: 5, civ: 0 },
    { op: 'rebuild' },
    { op: 'btick' },
  ],
});
// S4 barr-filters：过滤链矩阵——dead（桶内死者——重建无 dead 过滤）/异国/job===2 已是
//   战士 三跳 + **boat 农民照练**（蓝本无 boat 检查——语义发现）+ 平民练满 quota 2。
CASES.push({
  name: 'barr-filters', mode: 'ops', terrain: 'plains', seed: seedOf('barr-filters', 733),
  env: { tick: 200, yearF: 0.2, civSeq: 2 },
  civs: [
    { id: 0, name: '征兵国', race: raceIds.human, colorHex: '#cf3f2e', pop: 5, gold: 30, colonizeCd: 9999,
      tiles: rect(16, 16, 28, 28), capital: 20 * 256 + 20 },
    { id: 1, name: '外邦国', race: raceIds.human, colorHex: '#5ba8e0', pop: 1, gold: 10, colonizeCd: 9999,
      tiles: rect(40, 16, 48, 28), capital: 20 * 256 + 44 },
  ],
  units: [
    { id: 101, race: 'human', x: 16.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '亡者', dead: true },
    { id: 102, race: 'human', x: 17.5, y: 20.5, civ: 1, job: 0, maxHp: 50, hp: 50, name: '外客' },
    { id: 103, race: 'human', x: 18.5, y: 20.5, civ: 0, job: 2, maxHp: 50, hp: 50, name: '老兵' },
    { id: 104, race: 'human', x: 19.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '舟农', boat: 1 },
    { id: 105, race: 'human', x: 19.5, y: 21.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '农二' },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'bld', i: 20 * 256 + 20, kind: 5, civ: 0 },
    { op: 'rebuild' },
    { op: 'btick' },
  ],
});
// S5 barr-multi：四兵营矩阵——atWar 甲练 1 + atWar 乙练 2（fx 6 抽）+ **第三方和平**丁掷
//   >0.25 早退（第 7 抽——fx 抽后流位；war 0v1 使双方皆 atWar——和平营须用未参战 civ2）
//   + 亡国戊 alive=false 静默 0 抽。建筑序即全序。
CASES.push({
  name: 'barr-multi', mode: 'ops', terrain: 'plains', seed: seedOf('barr-multi', 735),
  env: { tick: 200, yearF: 0.2, civSeq: 4 },
  civs: [
    { id: 0, name: '双营国', race: raceIds.human, colorHex: '#cf3f2e', pop: 3, gold: 40, colonizeCd: 9999,
      tiles: rect(16, 16, 68, 28), capital: 20 * 256 + 20 },
    { id: 1, name: '敌相国', race: raceIds.human, colorHex: '#5ba8e0', pop: 1, gold: 10, colonizeCd: 9999,
      tiles: rect(40, 16, 48, 28), capital: 20 * 256 + 44 },
    { id: 2, name: '和平国', race: raceIds.human, colorHex: '#40b685', pop: 1, gold: 10, colonizeCd: 9999,
      tiles: rect(96, 16, 108, 28), capital: 20 * 256 + 100 },
    { id: 3, name: '亡燕国', race: raceIds.human, colorHex: '#d654c8', pop: 1, gold: 10, colonizeCd: 9999,
      tiles: rect(136, 16, 148, 28), capital: 20 * 256 + 140 },
  ],
  units: [
    { id: 101, race: 'human', x: 20.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '甲卒' },
    { id: 102, race: 'human', x: 60.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '乙一' },
    { id: 103, race: 'human', x: 61.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '乙二' },
    { id: 201, race: 'human', x: 100.5, y: 20.5, civ: 2, job: 0, maxHp: 50, hp: 50, name: '丁卒' },
    { id: 301, race: 'human', x: 140.5, y: 20.5, civ: 3, job: 0, maxHp: 50, hp: 50, name: '戊卒' },
  ],
  ops: [
    { op: 'war', agg: 0, vic: 1, reason: 'border' },
    { op: 'bld', i: 20 * 256 + 20, kind: 5, civ: 0 },
    { op: 'bld', i: 20 * 256 + 60, kind: 5, civ: 0 },
    { op: 'bld', i: 20 * 256 + 100, kind: 5, civ: 2 },
    { op: 'bld', i: 20 * 256 + 140, kind: 5, civ: 3 },
    { op: 'killciv', id: 3 },
    { op: 'rebuild' },
    { op: 'btick' },
  ],
});
// S6 barr-notbarracks：kind 过滤——住宅/王都/集市三类满员民兵零抽零练 + 真兵营对照
//   （和平门 ≤0.25 过门练 1）。
CASES.push({
  name: 'barr-notbarracks', mode: 'ops', terrain: 'plains', seed: seedOf('barr-notbarracks', 736),
  env: { tick: 200, yearF: 0.2, civSeq: 1 },
  civs: [
    { id: 0, name: '民居国', race: raceIds.human, colorHex: '#cf3f2e', pop: 4, gold: 40, colonizeCd: 9999,
      tiles: rect(16, 16, 68, 28), capital: 20 * 256 + 24 },
  ],
  units: [
    { id: 101, race: 'human', x: 20.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '宅旁' },
    { id: 102, race: 'human', x: 24.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '都旁' },
    { id: 103, race: 'human', x: 28.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '市旁' },
    { id: 104, race: 'human', x: 60.5, y: 20.5, civ: 0, job: 0, maxHp: 50, hp: 50, name: '营旁' },
  ],
  ops: [
    { op: 'bld', i: 20 * 256 + 20, kind: 1, civ: 0 },
    { op: 'bld', i: 20 * 256 + 24, kind: 2, civ: 0 },
    { op: 'bld', i: 20 * 256 + 28, kind: 9, civ: 0 },
    { op: 'bld', i: 20 * 256 + 60, kind: 5, civ: 0 },
    { op: 'rebuild' },
    { op: 'btick' },
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
  // M-U3 切片 7：建筑全维表（cost/needKnowledge/popCap/name——C# host 词法名）
  buildingDefs: BUILDING_ECHO,
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
  // M-U3 切片 9：civSeq 权威起点（createCiv 的 id 分配/色板投钉——env 显式或 max(id)+1）
  eng.civSeq = env.civSeq ?? Math.max(0, ...c.civs.map((cv) => cv.id + 1));
  for (const cv of eng.civs) {
    if (!cv) continue;
    for (const t of cv.tiles) eng.owner[t] = cv.id;
  }
  const units = c.units.map((s) => mkTsUnit(U({ age: 20, maxAge: 55, speed: 0.1, ...s, race: raceIds[s.race] ?? s.race })));
  eng.units = units;
  for (const u of units) eng.unitById.set(u.id, u);   // crownVacantTick unitById.get(kid) 消费面
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
    const fx0 = eng.effects.length;   // M-U3 切片 7：真实现 fx 窗口（smoke/hammer/spawn）
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
      // —— M-U3 切片 8：军团域 op（tryFormArmy 真实现/状态机/战线/补丁面）——
      case 'form': {
        const a = eng.tryFormArmy(eng.civs[op.civ], op.target === undefined ? undefined : op.target);
        probe = a ? a.id : null;
        break;
      }
      case 'atick': eng.armyTick(); break;
      case 'ftick': eng.frontTick(); break;
      case 'setarmy': {
        const a = eng.armies.find((x) => x.id === op.id);
        if (!a) throw new Error('setarmy: no army ' + op.id);
        for (const [k, v] of Object.entries(op.patch)) a[k] = v;
        break;
      }
      case 'setu': {
        const u = eng.unitById.get(op.id);
        if (!u) throw new Error('setu: no unit ' + op.id);
        for (const [k, v] of Object.entries(op.patch)) u[k] = v;
        break;
      }
      // warkill 扩展 ka（killer.army——军团战功面；无 ka ≡ undefined；id/kills 占位防 undefined 读）
      case 'warkill': eng.onWarKill({ civ: op.kc, army: op.ka === undefined ? undefined : op.ka, kills: 0, id: -9 }, { civ: op.vc }); break;
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
      // —— M-U3 切片 7：civsTick 经济社会域 op ——
      case 'ctick': eng.rebuildCivBuildCounts(); eng.civsTick(); break;   // 真实引擎每 5 拍驱动序
      case 'stattick': eng.statsTick(); break;                             // homogeneity 重建真实现（UI 快照面弃置）
      case 'wtick': eng.warTick(); break;                                  // M-U3 切片 9：战争域推进（rebel war 面对账）
      case 'btick': eng.rebuildBuckets(); eng.barracksTick(); break;        // M-U3 切片 10：兵营练兵（%200 调用点拍前桶已重建——显式化）
      case 'laws': {
        if (op.cityGrowth !== undefined) eng.laws.cityGrowth = op.cityGrowth;
        if (op.rebels !== undefined) eng.laws.rebels = op.rebels;
        if (op.wars !== undefined) eng.laws.wars = op.wars;
        break;
      }
      default: throw new Error('unknown op: ' + op.op);
    }
    rec.draws = draws;
    rec.probe = probe;
    rec.dirs = dumpDirectives(eng);
    rec.civs = dumpCivs(eng);
    rec.evts = evts.slice(evMark);
    // —— M-U3 切片 7：ctick 扩展快照面（units 位精确+fx 真实现+建筑/路/脏标/同质性/灭国计数）——
    if (op.op === 'ctick' || op.op === 'stattick' || op.op === 'btick') {
      rec.units = units.map(snapU);
      rec.homo = [...eng.civHomogeneity.entries()].map(([k, v]) => [k, bitHex(v)]);
      rec.fallen = eng.statCivsFallen;
    }
    if (op.op === 'ctick') {
      rec.blds = eng.buildings.map((b) => ({ i: b.i, kind: b.kind, civ: b.civ }));
      rec.bidx = [...eng.bIdx.keys()];
      rec.dirtyN = eng.dirty.size;
      rec.propsN = eng.propsDirty.size;
      rec.roadN = roadCount(eng);
      rec.overD = eng.overlayDirty;
      // —— M-U3 切片 9：createCiv 消费面（civSeq 权威序）——
      rec.civSeq = eng.civSeq;
    }
    // —— M-U3 切片 9：叛乱战争面（wtick/ctick——warData 全维 + totalWars/warHistory/rel）——
    if (op.op === 'ctick' || op.op === 'wtick') {
      rec.wds = dumpWds(eng);
      rec.tw = [...eng.totalWars];
      rec.wh = [...eng.warHistory];
      rec.rel = dumpRel(eng.rel);
    }
    rec.fx = eng.effects.slice(fx0).map((e) => ({ kind: e.kind, x: bitHex(e.x), y: bitHex(e.y), r: bitHex(e.r), ttl: e.ttl, seed: e.seed, dir: bitHex(e.dir) }));
    // —— M-U3 切片 8：军团域扩展快照面（form/atick/ftick/warkill/setarmy/setu——armies 全维 + 占领层 + 战争档案 + 单位 tx/ty/army/boat 列）——
    if (op.op === 'form' || op.op === 'atick' || op.op === 'ftick' || op.op === 'warkill' || op.op === 'setarmy' || op.op === 'setu' || op.op === 'etick') {
      rec.armies = dumpArmies(eng);
      rec.occ = dumpOcc(eng);
      rec.wds = dumpWds(eng);
      rec.armySeq = eng.armySeq;
      rec.nameSeq = [...eng.armyNameSeq.entries()].map(([k, v]) => [k, v]);
      rec.timers = [eng.lastClashEventTick, eng.lastReinforceEventTick, eng.lastVolleyEventTick];
      rec.units = units.map(snapU);
    }
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
    // M-U3 切片 7：civsTick 终态（同质性/建筑/路/脏标/灭国计数/王权列随 civsEnd）
    homoEnd: [...eng.civHomogeneity.entries()].map(([k, v]) => [k, bitHex(v)]),
    bldsEnd: eng.buildings.map((b) => ({ i: b.i, kind: b.kind, civ: b.civ })),
    bidxEnd: [...eng.bIdx.keys()],
    roadNEnd: roadCount(eng),
    dirtyNEnd: eng.dirty.size,
    propsNEnd: eng.propsDirty.size,
    fallenEnd: eng.statCivsFallen,
    // M-U3 切片 8：军团域终态
    armiesEnd: dumpArmies(eng),
    occEnd: dumpOcc(eng),
    wdsEnd: dumpWds(eng),
    armySeqEnd: eng.armySeq,
    nameSeqEnd: [...eng.armyNameSeq.entries()].map(([k, v]) => [k, v]),
    corpsesEnd: eng.corpses.length,
    // M-U3 切片 9：叛乱域终态（civSeq/createCiv 消费——新建国三元组随 civsEnd）
    civSeqEnd: eng.civSeq,
  };
  rec.rngTail = [raw(), raw(), raw(), raw()].map(bitHex);
  out.cases.push(rec);
}

// —— 激活度自检（--hunt：各 case 兵营练兵摘要——练兵数=job 0→2 增量 + fx spawn 数） ——
if (process.argv.includes('--hunt')) {
  for (const r of out.cases) {
    let trained = 0, spawnFx = 0;
    for (const st of r.out) {
      if (st.units) for (const u of st.units) if (u.job === 2) trained++;
      if (st.fx) for (const f of st.fx) if (f.kind === 'spawn') spawnFx++;
    }
    console.log(`${r.name}: job2=${trained} spawnFx=${spawnFx} drawsMax=${Math.max(...r.out.map((s) => s.draws))} fxTotal=${r.out.reduce((a, s) => a + (s.fx?.length ?? 0), 0)} evN=${r.events.length}`);
  }
}

const outPath = new URL('./golden-units-barracks.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(out));
console.log(`golden-units-barracks.json: ${out.cases.length} cases, ${(JSON.stringify(out).length / 1024).toFixed(0)}KB`);
