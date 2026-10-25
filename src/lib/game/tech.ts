// ============ 科技研发体系（Tech Research System） ============
// 每个文明以知识自动研究科技：完成时全文明获得持久加成，并解锁后续科技
// 可视化：CivPanel 科技树（按纪元分列、按领域着色、依赖连线、进度条）
// 引擎接入：techModsOf() 缓存计算 → 战斗/经济/繁衍/建筑/航海/士气全线生效

export type TechCat = 'agri' | 'military' | 'econ' | 'culture' | 'eng' | 'naval' | 'civic';

export interface TechDef {
  /** 唯一 key（存档持久化） */
  key: string;
  /** 中文名 */
  name: string;
  /** 领域 */
  cat: TechCat;
  /** 纪元：0 远古 / 1 古典 / 2 中世纪 / 3 文艺复兴 */
  era: number;
  /** 研究所需知识 */
  cost: number;
  /** 前置科技 keys */
  deps: string[];
  /** 效果说明（面板展示） */
  desc: string;
}

export const ERAS: { name: string; sub: string; color: string }[] = [
  { name: '远古时代', sub: '蒙昧初开', color: 'text-stone-300' },
  { name: '古典时代', sub: '城邦兴起', color: 'text-amber-200' },
  { name: '中世纪', sub: '信仰与铁', color: 'text-sky-200' },
  { name: '文艺复兴', sub: '理性曙光', color: 'text-violet-200' },
  { name: '工业时代', sub: '钢铁与硝烟', color: 'text-orange-200' },
  { name: '未来时代', sub: '星海与奇点', color: 'text-cyan-200' },
];

export const TECH_CATS: { key: TechCat; name: string; color: string; dot: string }[] = [
  { key: 'agri', name: '农业', color: 'text-lime-300', dot: '#a3e635' },
  { key: 'military', name: '军事', color: 'text-red-300', dot: '#f87171' },
  { key: 'econ', name: '经济', color: 'text-yellow-300', dot: '#facc15' },
  { key: 'culture', name: '文化', color: 'text-violet-300', dot: '#c4b5fd' },
  { key: 'eng', name: '工程', color: 'text-orange-300', dot: '#fdba74' },
  { key: 'naval', name: '航海', color: 'text-teal-300', dot: '#5eead4' },
  { key: 'civic', name: '政治', color: 'text-zinc-300', dot: '#d4d4d8' },
];

/** 34 项科技：按纪元 4 列展开，领域内纵深依赖 */
export const TECHS: TechDef[] = [
  // —— 远古时代（0）——
  { key: 'fire', name: '火种', cat: 'agri', era: 0, cost: 4, deps: [], desc: '熟食烹饪：繁衍速度 +8%' },
  { key: 'stone', name: '石器打磨', cat: 'military', era: 0, cost: 5, deps: [], desc: '锋利石斧：战士伤害 +10%' },
  { key: 'shelter', name: '筑巢术', cat: 'eng', era: 0, cost: 5, deps: [], desc: '梁柱结构：建筑耐久 +15%' },
  { key: 'clan', name: '氏族血亲', cat: 'civic', era: 0, cost: 6, deps: [], desc: '长老议事：稳定度 +8' },
  { key: 'song', name: '图腾歌舞', cat: 'culture', era: 0, cost: 6, deps: [], desc: '篝火节庆：文化积累 +50%' },
  { key: 'gather', name: '采集术', cat: 'econ', era: 0, cost: 6, deps: [], desc: '采集储藏：人口税基 +20%' },
  { key: 'raft', name: '木筏', cat: 'naval', era: 0, cost: 8, deps: [], desc: '漂流远航：殖民间隔 -10%' },
  { key: 'pottery', name: '陶器', cat: 'econ', era: 0, cost: 8, deps: ['fire'], desc: '储粮储水：人口税基 +15%' },
  // —— 古典时代（1）——
  { key: 'irrigation', name: '农耕灌溉', cat: 'agri', era: 1, cost: 14, deps: ['fire'], desc: '沟渠引水：农田容量 +1，繁衍 +8%' },
  { key: 'bronze', name: '青铜冶炼', cat: 'military', era: 1, cost: 16, deps: ['stone'], desc: '青铜兵器：全军伤害 +15%' },
  { key: 'writing', name: '文字', cat: 'culture', era: 1, cost: 14, deps: ['song'], desc: '楔形刻痕：知识产出 +30%' },
  { key: 'masonry', name: '石匠工艺', cat: 'eng', era: 1, cost: 15, deps: ['shelter'], desc: '凿石垒砌：建筑耐久 +25%，修复速度 +50%' },
  { key: 'currency', name: '铸币', cat: 'econ', era: 1, cost: 15, deps: ['gather', 'pottery'], desc: '金属通货：集市收入 +40%' },
  { key: 'sail', name: '帆船', cat: 'naval', era: 1, cost: 18, deps: ['raft'], desc: '乘风破浪：殖民间隔 -20%' },
  { key: 'law', name: '成文法典', cat: 'civic', era: 1, cost: 20, deps: ['clan', 'writing'], desc: '律令昭彰：稳定度 +12，叛乱风险降低' },
  { key: 'crossbow', name: '弩机', cat: 'military', era: 1, cost: 20, deps: ['bronze'], desc: '弩矢穿透：弓手伤害 +20%' },
  // —— 中世纪（2）——
  { key: 'plow', name: '重犁轮作', cat: 'agri', era: 2, cost: 30, deps: ['irrigation'], desc: '深耕细作：繁衍速度 +12%' },
  { key: 'iron', name: '铁器锻造', cat: 'military', era: 2, cost: 30, deps: ['bronze'], desc: '铁剑铁甲：全军伤害 +18%，生命 +10%' },
  { key: 'guild', name: '行会制度', cat: 'econ', era: 2, cost: 30, deps: ['currency'], desc: '匠人行会：全部经济收入 +25%' },
  { key: 'theology', name: '神学', cat: 'culture', era: 2, cost: 30, deps: ['writing'], desc: '经院哲学：文化积累 +80% 解锁神权政体' },
  { key: 'fortification', name: '城墙堡垒', cat: 'eng', era: 2, cost: 32, deps: ['masonry'], desc: '瓮城箭楼：建筑耐久 +30%' },
  { key: 'compass', name: '罗盘', cat: 'naval', era: 2, cost: 32, deps: ['sail'], desc: '指北磁针：殖民间隔 -25%' },
  { key: 'feudal', name: '封建采邑', cat: 'civic', era: 2, cost: 34, deps: ['law'], desc: '分封效忠：税基 +30%（稳定 -4）' },
  { key: 'tactics', name: '方阵战术', cat: 'military', era: 2, cost: 36, deps: ['iron'], desc: '进退如一：军团士气上限 +8、恢复 +50%' },
  { key: 'machinery', name: '机械装置', cat: 'eng', era: 2, cost: 38, deps: ['fortification'], desc: '绞盘滑轮：修复速度 +60% 陷阱→攻城强化' },
  // —— 文艺复兴（3）——
  { key: 'crop4', name: '良种选育', cat: 'agri', era: 3, cost: 52, deps: ['plow'], desc: '良种轮种：繁衍速度 +15%' },
  { key: 'printing', name: '活字印刷', cat: 'culture', era: 3, cost: 55, deps: ['theology'], desc: '知识传布：知识产出 +50%，文化 +30%' },
  { key: 'banking', name: '银行信贷', cat: 'econ', era: 3, cost: 55, deps: ['guild'], desc: '金库汇票：全部经济收入 +35%' },
  { key: 'astronomy', name: '天文航海', cat: 'naval', era: 3, cost: 60, deps: ['compass'], desc: '星图导航：殖民间隔 -30%' },
  { key: 'medicine', name: '医学', cat: 'culture', era: 3, cost: 58, deps: ['printing'], desc: '瘟疫医生：瘟疫传播 -45%' },
  { key: 'gothic', name: '哥特拱券', cat: 'eng', era: 3, cost: 55, deps: ['machinery'], desc: '飞扶壁尖拱：建筑耐久 +25%，修复 +60%' },
  { key: 'republic', name: '共和宪政', cat: 'civic', era: 3, cost: 65, deps: ['feudal', 'printing'], desc: '市民议会：稳定 +15，收入 +20% 解锁共和政体' },
  { key: 'steel', name: '钢铁淬火', cat: 'military', era: 3, cost: 60, deps: ['tactics'], desc: '板甲钢刃：全军伤害 +20%，生命 +12%' },
  { key: 'legion', name: '帝国军制', cat: 'military', era: 3, cost: 75, deps: ['steel'], desc: '常备军团：军团上限 +2，士气 +6 解锁帝国政体' },
  // —— 工业时代（4）：现代武器体系 ——
  { key: 'steam', name: '蒸汽机', cat: 'eng', era: 4, cost: 85, deps: ['machinery'], desc: '锅炉与活塞：建筑耐久 +40%，修复 +80%' },
  { key: 'gunpowder', name: '火药', cat: 'military', era: 4, cost: 88, deps: ['steel', 'machinery'], desc: '黑火药枪械：全军伤害 +25% 解锁火器军备' },
  { key: 'assembly', name: '流水装配', cat: 'econ', era: 4, cost: 95, deps: ['banking', 'steam'], desc: '标准化生产：全部经济收入 +60%' },
  { key: 'sanitation', name: '公共卫生', cat: 'agri', era: 4, cost: 92, deps: ['crop4', 'medicine'], desc: '下水道与疫苗：繁衍 +12%，瘟疫传播 -30%' },
  { key: 'rifling', name: '线膛枪', cat: 'military', era: 4, cost: 110, deps: ['gunpowder'], desc: '膛线旋进：远程射程 +2.5，射击伤害 +30%' },
  { key: 'explosives', name: '高爆炸药', cat: 'military', era: 4, cost: 125, deps: ['gunpowder'], desc: '苦味酸与 TNT：全军伤害 +15% 解锁火炮轰击' },
  { key: 'flight', name: '航空引擎', cat: 'eng', era: 4, cost: 140, deps: ['steam', 'astronomy'], desc: '双翼机凌空：解锁战时空袭轰炸' },
  { key: 'atomic', name: '原子能工程', cat: 'military', era: 4, cost: 185, deps: ['explosives', 'flight'], desc: '裂变之火：解锁核打击——终极世界大战的终局武器' },
  // —— 未来时代（5）：未来武器体系 ——
  { key: 'electronics', name: '电子计算', cat: 'eng', era: 5, cost: 160, deps: ['atomic'], desc: '硅基心智：知识产出 +60%' },
  { key: 'singularity', name: '奇点智能', cat: 'civic', era: 5, cost: 240, deps: ['electronics', 'republic'], desc: '超越性 AI 治军：军团获得战术智能（会评估会战/主动增援/战术撤退），稳定 +10' },
  { key: 'robotics', name: '机器人学', cat: 'eng', era: 5, cost: 210, deps: ['electronics', 'assembly'], desc: '钢铁之躯：修复 +100%，建筑耐久 +40%，解锁机甲军团（行军/围城/会战全面机械化）' },
  { key: 'lasers', name: '定向能武器', cat: 'military', era: 5, cost: 200, deps: ['electronics', 'rifling'], desc: '光束即刀刃：全军伤害 +20%，解锁激光炮台（战时精确狙杀）' },
  { key: 'drones', name: '无人机蜂群', cat: 'military', era: 5, cost: 240, deps: ['robotics', 'flight'], desc: '蔽日蜂群：解锁蜂群打击（自主游猎敌军与建筑）' },
  { key: 'orbital', name: '轨道天基', cat: 'eng', era: 5, cost: 300, deps: ['robotics', 'astronomy'], desc: '天基动能平台：解锁轨道天罚（天顶坠落的钨棒）' },
  { key: 'plasma', name: '等离子体', cat: 'military', era: 5, cost: 320, deps: ['lasers', 'explosives'], desc: '物质第四态：伤害 +15%，解锁等离子炮（爆破 + 电磁脉冲击溃士气）' },
  { key: 'antimatter', name: '反物质工程', cat: 'military', era: 5, cost: 420, deps: ['plasma', 'atomic'], desc: '湮灭即终极：解锁反物质打击——终局狂热阶段的天启武器' },
];

export const TECH_BY_KEY: Record<string, TechDef> = Object.fromEntries(TECHS.map((t) => [t.key, t]));

/** 科技总加成（引擎缓存计算用）：全乘算叠加 */
export interface TechMods {
  /** 全军伤害乘数 */
  dmg: number;
  /** 全军生命乘数 */
  hp: number;
  /** 建筑耐久乘数 */
  bhp: number;
  /** 经济收入乘数 */
  gold: number;
  /** 知识产出乘数 */
  know: number;
  /** 繁衍速度乘数 */
  repro: number;
  /** 殖民间隔乘数（<1 更快） */
  col: number;
  /** 人口税基乘数 */
  tax: number;
  /** 文化积累乘数 */
  cult: number;
  /** 修复速度乘数 */
  repair: number;
  /** 稳定度加值 */
  stab: number;
  /** 军团士气上限加值 */
  morale: number;
  /** 军团上限加值 */
  armyMax: number;
  /** 弓手伤害加成乘数（叠在 dmg 上） */
  archer: number;
  /** 瘟疫传播概率乘数（<1 更抗） */
  plague: number;
  /** 远程射程加值（线膛枪） */
  range: number;
  /** 火炮轰击能力等级（0=无；1=战时自动炮击） */
  arty: number;
  /** 空袭轰炸能力等级（0=无；1=战时轰炸机升空） */
  bomber: number;
  /** 核打击能力等级（0=无；1=可发射核导弹） */
  nukeCap: number;
  // —— 未来时代（未来武器体系）——
  /** 定向能等级（0=无；1=战时激光炮台） */
  laser: number;
  /** 无人机蜂群等级（0=无；1=蜂群打击） */
  drone: number;
  /** 轨道打击等级（0=无；1=轨道天罚） */
  orbital: number;
  /** 机甲军团等级（0=无；1=军团机械化） */
  mech: number;
  /** 战术 AI 等级（0=无；1=军团智能行为） */
  ai: number;
  /** 等离子武器等级（0=无；1=等离子炮） */
  plasma: number;
  /** 反物质能力等级（0=无；1=反物质打击） */
  antiMatter: number;
}

export const NEUTRAL_MODS: TechMods = {
  dmg: 1, hp: 1, bhp: 1, gold: 1, know: 1, repro: 1, col: 1, tax: 1,
  cult: 1, repair: 1, stab: 0, morale: 0, armyMax: 0, archer: 1, plague: 1,
  range: 0, arty: 0, bomber: 0, nukeCap: 0,
  laser: 0, drone: 0, orbital: 0, mech: 0, ai: 0, plasma: 0, antiMatter: 0,
};

/** 汇总某科技集的加成（engine 缓存调用） */
export function modsOfTechs(keys: string[]): TechMods {
  const m: TechMods = { ...NEUTRAL_MODS };
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
      case 'printing': m.know += 0.5; m.cult += 0.3; break;
      case 'banking': m.gold += 0.35; break;
      case 'astronomy': m.col -= 0.3; break;
      case 'medicine': m.plague -= 0.45; break;
      case 'gothic': m.bhp += 0.25; m.repair += 0.6; break;
      case 'republic': m.stab += 15; m.gold += 0.2; break;
      case 'steel': m.dmg += 0.2; m.hp += 0.12; break;
      case 'legion': m.armyMax += 2; m.morale += 6; break;
      // —— 工业时代（现代武器体系） ——
      case 'steam': m.bhp += 0.4; m.repair += 0.8; break;
      case 'gunpowder': m.dmg += 0.25; break;
      case 'assembly': m.gold += 0.6; break;
      case 'sanitation': m.repro += 0.12; m.plague -= 0.3; break;
      case 'rifling': m.range += 2.5; m.archer += 0.3; break;
      case 'explosives': m.dmg += 0.15; m.arty += 1; break;
      case 'flight': m.bomber += 1; break;
      case 'atomic': m.nukeCap += 1; break;
      // —— 未来时代（未来武器体系） ——
      case 'electronics': m.know += 0.6; break;
      case 'singularity': m.ai += 1; m.stab += 10; m.know += 0.4; break;
      case 'robotics': m.mech += 1; m.repair += 1.0; m.bhp += 0.4; break;
      case 'lasers': m.laser += 1; m.dmg += 0.2; break;
      case 'drones': m.drone += 1; break;
      case 'orbital': m.orbital += 1; break;
      case 'plasma': m.plasma += 1; m.dmg += 0.15; break;
      case 'antimatter': m.antiMatter += 1; break;
    }
  }
  return m;
}

// ---------------- 政体定义（社会体系 · 政治） ----------------
export interface GovDef {
  key: string;
  name: string;
  /** 简述（面板展示） */
  desc: string;
  /** 加成说明 */
  bonus: string;
}

export const GOV_DEFS: GovDef[] = [
  { key: 'tribal', name: '部落制', desc: '长老围坐篝火议事，血脉即律法', bonus: '无特殊加成 · 万物之始' },
  { key: 'monarchy', name: '君主制', desc: '王冠与权杖，世袭的秩序', bonus: '稳定度 +10 · 税基 +10%' },
  { key: 'theocracy', name: '神权制', desc: '神谕高过王令，祭司执掌尘世', bonus: '稳定 +6 · 文化 +40% · 军事 -5%' },
  { key: 'republic', name: '共和制', desc: '市民的广场与选票', bonus: '稳定 +12 · 收入 +25% · 宣战意愿降低' },
  { key: 'empire', name: '帝国制', desc: '铁蹄与大道，万邦来朝', bonus: '伤害 +15% · 军团上限 +1 · 稳定 -6' },
];
