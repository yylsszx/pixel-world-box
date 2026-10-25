// ============ WorldBox Replica — Core Types ============
// 物品系统迁往 items.ts（102 件）；此处 re-export 保持旧引用兼容
import type { ItemKind as _ItemKind } from './items';
import type { VisGenome } from './emergence';
export type { ItemKind, ItemDef, ItemSlot } from './items';
export { SLOT_NAMES, SLOT_ORDER, SLOT_FIELD, RARITY_META, ITEM_DEFS, ITEMS_BY_SLOT, ITEM_COUNT, rollItem, BEST_BY_SLOT, ALL_ITEMS } from './items';
import type { ItemSlot } from './items';

/** Terrain tile kinds (values stored in Uint8Array) */
export const T = {
  DEEP: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  HILL: 5,
  MOUNTAIN: 6,
  SNOW: 7,
  LAVA: 8,
  BURNT: 9,
  /** 冰面：暴风雪/白行者冻结的水面 —— 可行走、会消融（火/岩浆/暖气候） */
  ICE: 10,
  /** 沼泽：高湿洼地的浑水湿地 —— 可行走（迟缓）、不燃、不建造 */
  SWAMP: 11,
} as const;
export type Terrain = (typeof T)[keyof typeof T];

/** Species / races (values stored on units) */
export const R = {
  HUMAN: 0,
  ELF: 1,
  DWARF: 2,
  ORC: 3,
  BANDIT: 4,
  ZOMBIE: 5,
  SHEEP: 6,
  WOLF: 7,
  BEAR: 8,
  DRAGON: 9,
  DEER: 10,
  PENGUIN: 11,
  CAMEL: 12,
  SCORPION: 13,
  SNAKE: 14,
  SNOWWOLF: 15,
  SKELETON: 16,
  DEMON: 17,
  MAGE: 18,
  LIZARD: 19,
  GOBLIN: 20,
  TROLL: 21,
  OGRE: 22,
  WHITEWALKER: 23,
  VAMPIRE: 24,
  /** 深海巨怪：多触手环体，拖拽船只，袭击海岸 */
  KRAKEN: 25,
  /** 沙漠巨虫：沙下潜行，吞噬小型生物 */
  SANDWORM: 26,
  /** 蛇怪：毒牙+石化凝视，被害者化为石像 */
  BASILISK: 27,
  /** 光明使者：治愈凡间众生，圣剑专为亡灵与恶魔出鞘 */
  ANGEL: 28,
  /** 浴火神鸟：烈焰为羽，陨落后自灰烬中重生（至多三次），火焰岩浆皆不能伤 */
  PHOENIX: 29,
  /** 森林守护者：古老的树皮巨人，游荡处播撒种子令森林扩张，并为林间生灵扑灭火魔 */
  ENT: 30,
  LICH: 31,
  /** 九头沼泽巨蟒：斩首不死——断颈处萌发两条幼蛇；唯火焰烧灼可阻其再生 */
  HYDRA: 32,
  // —— 八新动物（ID 33-40：28-32 让位给仓库线神话种族，保线上存档兼容）——
  /** 鸡：村落草地的小型家禽 */
  CHICKEN: 33,
  /** 猪：村落草地的杂食家畜（掉肉大户） */
  PIG: 34,
  /** 兔：草地与森林边缘的机敏小兽，狐狸的猎物 */
  RABBIT: 35,
  /** 狐：森林猎手，捕食兔与鸡 */
  FOX: 36,
  /** 鱼：群游的小型水生动物，鲨鱼与水岸的猎物 */
  FISH: 37,
  /** 蟹：限邻水沙滩横行的小家伙 */
  CRAB: 38,
  /** 龟：海洋游荡的长寿浮游者 */
  TURTLE: 39,
  /** 鲨鱼：海洋顶级掠食者，捕食鱼群与游泳单位 */
  SHARK: 40,
} as const;
export type RaceId = (typeof R)[keyof typeof R];

export const CIV_RACES: number[] = [R.HUMAN, R.ELF, R.DWARF, R.ORC, R.LIZARD, R.GOBLIN];

export interface RangedDef {
  /** 攻击距离（tile）：目标在 (minRange, range] 内时抛射火球而非近战 */
  range: number;
  /** 火球命中伤害（溅射半径 1.15） */
  dmg: number;
  /** 施法冷却（tick） */
  cd: number;
}

export interface RaceDef {
  key: string;
  name: string;
  isCiv: boolean; // belongs to a kingdom
  hostile: boolean; // attacks civilized races unprovoked
  flying: boolean;
  predator: boolean;
  undead: boolean;
  /** 岩浆免疫（恶魔在熔岩中漫步） */
  lavaImmune: boolean;
  /** 水生：只能在水域移动（克拉肯），不溺水 */
  aquatic?: boolean;
  /** 两栖滩涂（蟹）：水域 + 邻水沙滩均可活动 */
  beach?: boolean;
  /** 沙泳：只能在沙/草/焦土潜行（沙虫） */
  sandswim?: boolean;
  /** 近战触及距离（默认 0.9；克拉肯的触手 2.4） */
  reach?: number;
  /** 远程攻击（法师火球） */
  ranged?: RangedDef;
  hp: number;
  dmg: number;
  speed: number; // tiles per tick
  maxAge: number; // in game years
  repro: number; // reproduction chance per update
  sprite: 'person' | 'sheep' | 'wolf' | 'bear' | 'dragon' | 'deer' | 'penguin' | 'camel' | 'scorpion' | 'snake' | 'snowwolf' | 'skeleton' | 'demon' | 'mage' | 'troll' | 'ogre' | 'whitewalker' | 'vampire' | 'kraken' | 'sandworm' | 'basilisk' | 'angel' | 'phoenix' | 'ent' | 'lich' | 'hydra' | 'chicken' | 'pig' | 'rabbit' | 'fox' | 'fish' | 'crab' | 'turtle' | 'shark';
  /** 涌现物种标记：动态种化产生的新物种头顶 1px 突变色点（undefined = 预设原种） */
  dynTint?: string;
  /** 视觉基因组（涌现进化 v3）：动态物种携带 —— 色相/体型/角刺鬃尾/花纹全部程序化漂移 */
  vis?: VisGenome;
  // —— 种族系统 v2：性格维度（0-1 标度；决定外交/经济/军事/社会行为倾向，动态种化继承并可漂移）——
  /** 外交亲和：善结盟/爱贸易/低宣战倾向 */
  diplo?: number;
  /** 好战性：军国主义基线漂移方向 + 战端重燃概率 */
  aggr?: number;
  /** 贪婪：劫掠战争倾向 + 财富积累执念 */
  greed?: number;
  /** 虔诚：文化积累与稳定加成 */
  piety?: number;
  /** 勤勉：税收与建造效率 */
  industry?: number;
  /** 奥术：知识产出与研究加速 */
  arcane?: number;
  /** 繁衍倾向：出生率乘数 */
  growth?: number;
  /** 种族包容：多族王国稳定修正 + 跨种族关系改善速度 */
  harmony?: number;
  /** 夜视：夜间作战无减益（兽人/哥布林的黑暗视觉 —— 昼夜互连） */
  nightsight?: boolean;
  /** 种族原型一句话（种族面板展示） */
  archetype?: string;
}

export const RACES: Record<number, RaceDef> = {
  [R.HUMAN]: { key: 'human', name: '人类', isCiv: true, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 60, dmg: 8, speed: 0.09, maxAge: 55, repro: 0.006, sprite: 'person', diplo: 0.65, aggr: 0.4, greed: 0.45, piety: 0.4, industry: 0.6, arcane: 0.35, growth: 0.5, harmony: 0.7, archetype: '万邦之友：善于外交与贸易的开拓者' },
  [R.ELF]: { key: 'elf', name: '精灵', isCiv: true, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 55, dmg: 9, speed: 0.1, maxAge: 90, repro: 0.005, sprite: 'person', diplo: 0.45, aggr: 0.25, greed: 0.25, piety: 0.75, industry: 0.3, arcane: 0.85, growth: 0.3, harmony: 0.5, archetype: '永森守望者：长寿的奥术大师，崇尚自然' },
  [R.DWARF]: { key: 'dwarf', name: '矮人', isCiv: true, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 78, dmg: 10, speed: 0.072, maxAge: 120, repro: 0.005, sprite: 'person', diplo: 0.4, aggr: 0.5, greed: 0.7, piety: 0.35, industry: 0.9, arcane: 0.4, growth: 0.3, harmony: 0.45, archetype: '深岩锻造者：执着的工匠与财宝收藏家' },
  [R.ORC]: { key: 'orc', name: '兽人', isCiv: true, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 72, dmg: 12, speed: 0.084, maxAge: 48, repro: 0.006, sprite: 'person', diplo: 0.15, aggr: 0.9, greed: 0.65, piety: 0.25, industry: 0.3, arcane: 0.15, growth: 0.65, harmony: 0.25, nightsight: true, archetype: '血蹄征服者：强权即公理的游战部族' },
  [R.BANDIT]: { key: 'bandit', name: '强盗', isCiv: false, hostile: true, flying: false, predator: false, undead: false, lavaImmune: false, hp: 62, dmg: 11, speed: 0.093, maxAge: 45, repro: 0.0006, sprite: 'person' },
  [R.ZOMBIE]: { key: 'zombie', name: '僵尸', isCiv: false, hostile: true, flying: false, predator: false, undead: true, lavaImmune: false, hp: 46, dmg: 6, speed: 0.05, maxAge: 9999, repro: 0, sprite: 'person' },
  [R.SHEEP]: { key: 'sheep', name: '绵羊', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 16, dmg: 1, speed: 0.038, maxAge: 26, repro: 0.004, sprite: 'sheep' },
  [R.WOLF]: { key: 'wolf', name: '狼', isCiv: false, hostile: false, flying: false, predator: true, undead: false, lavaImmune: false, hp: 34, dmg: 10, speed: 0.093, maxAge: 22, repro: 0.004, sprite: 'wolf' },
  [R.BEAR]: { key: 'bear', name: '熊', isCiv: false, hostile: false, flying: false, predator: true, undead: false, lavaImmune: false, hp: 95, dmg: 19, speed: 0.06, maxAge: 40, repro: 0.002, sprite: 'bear' },
  [R.DRAGON]: { key: 'dragon', name: '巨龙', isCiv: false, hostile: true, flying: true, predator: true, undead: false, lavaImmune: false, hp: 900, dmg: 48, speed: 0.11, maxAge: 9999, repro: 0, sprite: 'dragon' },
  [R.DEER]: { key: 'deer', name: '鹿', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 24, dmg: 1, speed: 0.115, maxAge: 20, repro: 0.003, sprite: 'deer' },
  [R.PENGUIN]: { key: 'penguin', name: '企鹅', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 22, dmg: 1, speed: 0.045, maxAge: 18, repro: 0.004, sprite: 'penguin' },
  [R.CAMEL]: { key: 'camel', name: '骆驼', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 30, dmg: 2, speed: 0.05, maxAge: 35, repro: 0.002, sprite: 'camel' },
  [R.SCORPION]: { key: 'scorpion', name: '蝎子', isCiv: false, hostile: true, flying: false, predator: false, undead: false, lavaImmune: false, hp: 14, dmg: 5, speed: 0.055, maxAge: 16, repro: 0.005, sprite: 'scorpion' },
  [R.SNAKE]: { key: 'snake', name: '蛇', isCiv: false, hostile: false, flying: false, predator: true, undead: false, lavaImmune: false, hp: 20, dmg: 6, speed: 0.08, maxAge: 20, repro: 0.0035, sprite: 'snake' },
  [R.SNOWWOLF]: { key: 'snowwolf', name: '雪狼', isCiv: false, hostile: false, flying: false, predator: true, undead: false, lavaImmune: false, hp: 38, dmg: 11, speed: 0.088, maxAge: 24, repro: 0.004, sprite: 'snowwolf' },
  [R.SKELETON]: { key: 'skeleton', name: '骷髅', isCiv: false, hostile: true, flying: false, predator: false, undead: true, lavaImmune: false, hp: 55, dmg: 14, speed: 0.075, maxAge: 9999, repro: 0, sprite: 'skeleton' },
  [R.DEMON]: { key: 'demon', name: '恶魔', isCiv: false, hostile: true, flying: false, predator: true, undead: false, lavaImmune: true, hp: 600, dmg: 30, speed: 0.085, maxAge: 9999, repro: 0, sprite: 'demon' },
  [R.MAGE]: { key: 'mage', name: '法师', isCiv: false, hostile: true, flying: false, predator: false, undead: false, lavaImmune: false, ranged: { range: 6.5, dmg: 18, cd: 26 }, hp: 50, dmg: 6, speed: 0.07, maxAge: 200, repro: 0, sprite: 'mage' },
  // —— 新增智慧种族（文明双雄 + 四灾厄巨怪）——
  [R.LIZARD]: { key: 'lizard', name: '蜥蜴人', isCiv: true, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 66, dmg: 10, speed: 0.095, maxAge: 70, repro: 0.0058, sprite: 'person', diplo: 0.35, aggr: 0.5, greed: 0.4, piety: 0.5, industry: 0.45, arcane: 0.45, growth: 0.5, harmony: 0.4, archetype: '河泽伏击者：冷血而务实的沼泽猎手' },
  [R.GOBLIN]: { key: 'goblin', name: '哥布林', isCiv: true, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 40, dmg: 6, speed: 0.108, maxAge: 34, repro: 0.0092, sprite: 'person', diplo: 0.3, aggr: 0.55, greed: 0.8, piety: 0.2, industry: 0.4, arcane: 0.3, growth: 0.85, harmony: 0.35, nightsight: true, archetype: '穴居孳生者：繁殖极快的贪婪拾荒者' },
  [R.TROLL]: { key: 'troll', name: '巨魔', isCiv: false, hostile: true, flying: false, predator: true, undead: false, lavaImmune: false, hp: 380, dmg: 26, speed: 0.06, maxAge: 400, repro: 0, sprite: 'troll' },
  [R.OGRE]: { key: 'ogre', name: '食人魔', isCiv: false, hostile: true, flying: false, predator: true, undead: false, lavaImmune: false, hp: 300, dmg: 34, speed: 0.052, maxAge: 120, repro: 0, sprite: 'ogre' },
  [R.WHITEWALKER]: { key: 'whitewalker', name: '白行者', isCiv: false, hostile: true, flying: false, predator: false, undead: true, lavaImmune: false, hp: 240, dmg: 20, speed: 0.075, maxAge: 9999, repro: 0, sprite: 'whitewalker' },
  [R.VAMPIRE]: { key: 'vampire', name: '吸血鬼', isCiv: false, hostile: true, flying: false, predator: false, undead: true, lavaImmune: false, hp: 140, dmg: 16, speed: 0.118, maxAge: 9999, repro: 0, sprite: 'vampire' },
  // —— 深海/沙漠/秘境巨怪（原子级物种补齐）——
  [R.KRAKEN]: { key: 'kraken', name: '克拉肯', isCiv: false, hostile: true, flying: false, predator: true, undead: false, lavaImmune: false, aquatic: true, reach: 2.4, hp: 520, dmg: 30, speed: 0.07, maxAge: 9999, repro: 0, sprite: 'kraken' },
  [R.SANDWORM]: { key: 'sandworm', name: '沙虫', isCiv: false, hostile: true, flying: false, predator: true, undead: false, lavaImmune: false, sandswim: true, reach: 1.6, hp: 420, dmg: 40, speed: 0.14, maxAge: 9999, repro: 0, sprite: 'sandworm' },
  [R.BASILISK]: { key: 'basilisk', name: '蛇怪', isCiv: false, hostile: true, flying: false, predator: true, undead: false, lavaImmune: false, reach: 1.4, hp: 90, dmg: 14, speed: 0.11, maxAge: 400, repro: 0, sprite: 'basilisk' },
  // —— 神话种族（仓库线：光明/浴火/守护/死灵/九头）——
  [R.ANGEL]: { key: 'angel', name: '天使', isCiv: false, hostile: false, flying: true, predator: false, undead: false, lavaImmune: true, hp: 240, dmg: 22, speed: 0.105, maxAge: 9999, repro: 0, sprite: 'angel', archetype: '光明使者：圣光治愈凡间众生，圣剑专为亡灵与恶魔出鞘' },
  [R.PHOENIX]: { key: 'phoenix', name: '凤凰', isCiv: false, hostile: false, flying: true, predator: false, undead: false, lavaImmune: true, hp: 200, dmg: 18, speed: 0.12, maxAge: 9999, repro: 0, sprite: 'phoenix', archetype: '浴火神鸟：烈焰为羽，火焰岩浆皆不能伤；陨落后自灰烬中重生（至多三次），第四次死亡方为真正的终焉' },
  [R.ENT]: { key: 'ent', name: '树人', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 320, dmg: 26, speed: 0.055, maxAge: 9999, repro: 0, sprite: 'ent', archetype: '森林守护者：古老的树皮巨人，游荡处播撒种子令森林扩张，并为林间生灵扑灭火魔；沉重的枝干会砸碎任何敢犯森林的黑暗' },
  [R.LICH]: { key: 'lich', name: '巫妖', isCiv: false, hostile: true, flying: false, predator: true, undead: true, lavaImmune: false, hp: 260, dmg: 20, speed: 0.07, maxAge: 9999, repro: 0, sprite: 'lich', archetype: '不朽的死灵领主：魂魄封于命匣故永生不灭；收割生命的气息，将战场骸骨唤起编入永夜军团——圣光风暴是其天敌' },
  [R.HYDRA]: { key: 'hydra', name: '九头蛇', isCiv: false, hostile: true, flying: false, predator: true, undead: false, lavaImmune: false, hp: 500, dmg: 30, speed: 0.05, maxAge: 9999, repro: 0, sprite: 'hydra', archetype: '九头沼泽巨蟒：斩首不死——被杀时断颈处萌发两条幼蛇，越杀越多；唯有火焰烧灼断颈（火中死亡/岩浆吞噬）方能阻止再生，凤凰与烈焰是其天敌' },
  // —— 八新动物（陆地家禽野兽 + 水生鱼蟹龟鲨）——
  [R.CHICKEN]: { key: 'chicken', name: '鸡', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 10, dmg: 1, speed: 0.05, maxAge: 14, repro: 0.011, sprite: 'chicken' },
  [R.PIG]: { key: 'pig', name: '猪', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 30, dmg: 2, speed: 0.055, maxAge: 22, repro: 0.008, sprite: 'pig' },
  [R.RABBIT]: { key: 'rabbit', name: '兔', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, hp: 12, dmg: 1, speed: 0.13, maxAge: 12, repro: 0.014, sprite: 'rabbit' },
  [R.FOX]: { key: 'fox', name: '狐', isCiv: false, hostile: false, flying: false, predator: true, undead: false, lavaImmune: false, hp: 28, dmg: 8, speed: 0.105, maxAge: 18, repro: 0.004, sprite: 'fox' },
  [R.FISH]: { key: 'fish', name: '鱼', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, aquatic: true, hp: 6, dmg: 0.5, speed: 0.075, maxAge: 10, repro: 0.016, sprite: 'fish' },
  [R.CRAB]: { key: 'crab', name: '蟹', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, aquatic: true, beach: true, hp: 16, dmg: 3, speed: 0.03, maxAge: 16, repro: 0.007, sprite: 'crab' },
  [R.TURTLE]: { key: 'turtle', name: '龟', isCiv: false, hostile: false, flying: false, predator: false, undead: false, lavaImmune: false, aquatic: true, hp: 40, dmg: 1, speed: 0.028, maxAge: 120, repro: 0.003, sprite: 'turtle' },
  [R.SHARK]: { key: 'shark', name: '鲨鱼', isCiv: false, hostile: false, flying: false, predator: true, undead: false, lavaImmune: false, aquatic: true, reach: 1.3, hp: 85, dmg: 18, speed: 0.1, maxAge: 40, repro: 0.002, sprite: 'shark' },
};

// ---------------- 种族系统 v2：种族关系（Race Relations） ----------------

/** 固有种族关系基线（pairKey 小 id 在前）：精灵-兽人世仇 / 矮人-兽人宿敌 / 人类-精灵矮人传统盟友……
 *  运行时在此基础上漂移：种族间王国的战争/贸易/联盟都会缓慢改变整个种族对另一个种族的看法 */
export const RACE_REL_BASE: Record<string, number> = {
  '1-3': -45, // 精灵↔兽人：森林屠戮的千年血债（世仇）
  '2-3': -30, // 矮人↔兽人：山脉矿脉之争（宿敌）
  '0-1': 25,  // 人类↔精灵：传统盟友
  '0-2': 20,  // 人类↔矮人：传统盟友
  '2-20': -25, // 矮人↔哥布林：矿井窃贼之恨
  '1-20': -20, // 精灵↔哥布林：森林盗猎者
  '3-20': 15, // 兽人↔哥布林：绿皮同盟
  '3-19': -10, // 兽人↔蜥蜴人：荒野摩擦
  '1-2': 10,  // 精灵↔矮人：君子之交淡如水
};

/** 联盟色板（区别于 CIV_COLORS 的柔和高饱和系列：阵营渲染/图谱/徽章用） */
export const ALLIANCE_COLORS = ['#14b8a6', '#f97316', '#a855f7', '#84cc16', '#ec4899', '#06b6d4'];

/** 联盟（阵营实体：集体防御/联军作战/阵营停战/知识扩散/经济互助） */
export interface Alliance {
  id: number;
  /** 联盟名（方位×本质词组合，如「北境同盟」「钢铁公约」） */
  name: string;
  /** 成员 civ id 列表 */
  members: number[];
  /** 盟主 civ id */
  leader: number;
  /** 凝聚力 0-100（貌合神离/同仇敌忾/盟友叛离共同塑造；<25 濒临瓦解） */
  cohesion: number;
  /** 成立 tick */
  formedTick: number;
  /** 成立年份 */
  formedYear: number;
  /** 共同参战的战争数 */
  warsTogether: number;
  /** 袍泽纽带（共战 ≥3 次解锁的阵营红利：盟内贸易/研究扩散再 +10%） */
  bonded?: boolean;
  /** 联盟色 */
  colorHex: string;
}

/** Traits — small genetic flavor shown in the inspector */
export interface TraitDef {
  key: string;
  name: string;
  desc: string;
  dmgMul?: number;
  hpMul?: number;
  speedMul?: number;
  /** 再生：缓慢回血 */
  regen?: number;
  /** 巨型：更大的像素体型（视觉放大） */
  giant?: boolean;
  /** 侏儒：更小的像素体型（视觉缩小） */
  tiny?: boolean;
  /** 免疫：不感染瘟疫/毒素 */
  immune?: boolean;
  good: boolean;
}
export const TRAITS: Record<string, TraitDef> = {
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

// ---------------- 职业（Professions — WorldBox 深度文明系统） ----------------
/** 单位职业：影响属性与 AI 行为；文明生物出生时加权抽取，兵营/时代可转职 */
export interface JobDef {
  key: string;
  name: string;
  desc: string;
  hpMul: number;
  dmgMul: number;
  speedMul: number;
  /** 出生抽取权重（0 = 不会自然出生） */
  weight: number;
  /** 远程射击距离（弓手箭矢） */
  ranged?: number;
  /** UI 徽标色 */
  color: string;
}

export const JOBS: JobDef[] = [
  { key: 'peasant', name: '平民', desc: '普通居民，和平生活', hpMul: 1, dmgMul: 1, speedMul: 1, weight: 46, color: '#a8a29e' },
  { key: 'farmer', name: '农民', desc: '在农田周边耕作，供养更多人口', hpMul: 0.95, dmgMul: 0.9, speedMul: 1, weight: 24, color: '#ffd93d' },
  { key: 'warrior', name: '战士', desc: '冲锋陷阵，攻城毁屋，戍守边疆', hpMul: 1.3, dmgMul: 1.35, speedMul: 1.05, weight: 14, color: '#cf3f2e' },
  { key: 'archer', name: '弓手', desc: '远程箭矢压制，守城攻城皆宜', hpMul: 1.05, dmgMul: 1.15, speedMul: 1, weight: 8, ranged: 5, color: '#5ba8e0' },
  { key: 'builder', name: '建筑师', desc: '加速王国建造新房屋', hpMul: 1.15, dmgMul: 0.95, speedMul: 1.05, weight: 5, color: '#ff9b2d' },
  { key: 'merchant', name: '商人', desc: '往来集市贸易，为王國积累财富', hpMul: 1, dmgMul: 0.9, speedMul: 1.2, weight: 2, color: '#6fd66f' },
  { key: 'noble', name: '贵族', desc: '居于王都，供养国库', hpMul: 1.25, dmgMul: 1.1, speedMul: 1, weight: 1, color: '#b56cf0' },
  // 国王：唯一（建国/继承加冕产生；weight 0 = 永不自然出生），hp/dmg ×1.5
  { key: 'king', name: '国王', desc: '一国之主：驾崩则举国缟素，继承者加冕', hpMul: 1.5, dmgMul: 1.5, speedMul: 1, weight: 0, color: '#ffd700' },
];
export type JobId = number; // index into JOBS
export const JOB_KEY: Record<string, number> = Object.fromEntries(JOBS.map((j, i) => [j.key, i]));

// ---------------- 房屋类别（Building Categories） ----------------
export interface BuildingDef {
  key: string;
  name: string;
  /** 被摧毁耐久 */
  hp: number;
  /** 人口容量贡献（住宅 4 / 王都 6 / 农田 2） */
  popCap?: number;
  /** 建造财富成本 */
  cost?: number;
  /** 建造所需知识 */
  needKnowledge?: number;
  desc: string;
}

export const BUILDING_DEFS: BuildingDef[] = [
  { key: 'none', name: '空地', hp: 0, desc: '' },
  { key: 'house', name: '住宅', hp: 70, popCap: 4, cost: 0, desc: '容量 +4 人的居所' },
  { key: 'capital', name: '王都', hp: 240, popCap: 6, cost: 0, desc: '王国的心脏，陷落即亡国之危' },
  { key: 'tower', name: '箭塔', hp: 120, cost: 8, desc: '自动射击射程 4.5 格内的敌人' },
  { key: 'farm', name: '农田', hp: 40, popCap: 2, cost: 5, desc: '容量 +2 人，农民的劳作之处' },
  { key: 'barracks', name: '兵营', hp: 150, cost: 12, desc: '战时把附近平民训练为战士' },
  { key: 'castle', name: '城堡', hp: 340, cost: 34, needKnowledge: 18, desc: '射程 5.5 的强力箭矢防御' },
  { key: 'port', name: '港口', hp: 90, cost: 16, needKnowledge: 8, desc: '加速殖民船的派出' },
  { key: 'library', name: '图书馆', hp: 110, cost: 18, desc: '每年产出知识，解锁高阶建筑' },
  { key: 'market', name: '集市', hp: 100, cost: 12, desc: '每年产出财富' },
  { key: 'temple', name: '神殿', hp: 140, cost: 22, needKnowledge: 10, desc: '治疗光环庇佑周边单位' },
  { key: 'wall', name: '城墙', hp: 200, cost: 2, desc: '环都城防：敌方陆行单位不可逾越，守军借墙而战' },
];
export const BUILD_KINDS = {
  HOUSE: 1, CAPITAL: 2, TOWER: 3, FARM: 4, BARRACKS: 5, CASTLE: 6, PORT: 7, LIBRARY: 8, MARKET: 9, TEMPLE: 10, WALL: 11,
} as const;
/** 可被占领（易帜而非摧毁）的建筑 */
export const CAPTURABLE = new Set<number>([BUILD_KINDS.HOUSE, BUILD_KINDS.FARM, BUILD_KINDS.MARKET, BUILD_KINDS.BARRACKS, BUILD_KINDS.PORT]);

export interface Unit {
  id: number;
  race: number;
  civ: number; // civilization index or -1
  x: number;
  y: number;
  tx: number; // move target
  ty: number;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  age: number;
  maxAge: number;
  kills: number;
  cd: number; // attack cooldown
  trait: string | null;
  infected: boolean;
  flip: boolean;
  name: string;
  hurt: number; // ticks of "recently damaged" flash
  breath: number; // dragon breath timer
  /** 神经决策核心：战或逃/伤重脱离的接触冷却（tick；>0 期间脱离接触不接战 —— 瞬态不入档，读档自然消散） */
  fleeT?: number;
  parity: number; // staggered update bucket
  dead: boolean;
  /** 渲染插值：上一 tick 的位置（tick 快照；渲染时 lx→x 线性插值 → 丝滑移动） */
  lx?: number;
  ly?: number;
  /** 渲染插值：本帧插值后的渲染坐标（frame() 每帧计算，sprites 绘制用） */
  rx?: number;
  ry?: number;
  /** 亚像素绘制坐标（Task 48-A1）：rx*2 的全精度世界画布坐标 —— 取整会造成 zoom≥4 时
   *  2-6 屏幕像素的阶梯跳动，改为浮点让 fillRect 自带亚像素光栅（最近邻放大后即平滑像素滚动） */
  dpx?: number;
  dpy?: number;
  /** 殖民船：1 = 航行中（跨海殖民），0/undefined = 步行 */
  boat?: number;
  /** 剩余航海寿命（tick），耗尽后逼岸登陆/海难 */
  boatTTL?: number;
  /** 贸易商队：目标文明 id（>0 = 满载商队正奔赴伙伴市场；0/undefined = 普通） */
  caravan?: number;
  /** 职业索引（JOBS 下标；undefined = 0 平民；仅文明生物） */
  job?: number;
  /** 装备：武器（剑/斧/弓/杖） */
  wep?: _ItemKind | null;
  /** 装备：护甲 */
  arm?: _ItemKind | null;
  /** 装备：头盔 */
  hlm?: _ItemKind | null;
  /** 装备：盾牌 */
  shd?: _ItemKind | null;
  /** 装备：靴子 */
  bts?: _ItemKind | null;
  /** 装备：戒指 */
  rng?: _ItemKind | null;
  /** 装备：护符 */
  amu?: _ItemKind | null;
  /** 旧档饰品槽（迁移到 bts/rng 后删除） */
  trk?: _ItemKind | null;
  /** 攻击动画计时（tick；>0 时摆出挥击姿势 — 瞬态不入档） */
  atk?: number;
  /** 凤凰已用重生次数（0-3；第 4 次死亡魂飞魄散走常规收尸 — 不入档，读档后从 0 重计） */
  rebirths?: number;
  /** 九头蛇世代（0 初代 3 头 / 1 幼蛇 2 头 / 2 幼蛇 1 头；第 3 世代死亡即真终焉 — 不入档，与 rebirths 同策略） */
  gen?: number;
  /** 水生搁浅计数（beachedAquaticTick 每 proc +1，回水清零；≥15 窒息死亡 — 内核拥有 hp 故用瞬态计数而非扣血；不入档） */
  beachT?: number;
  /** 搁浅归海目标缓存（每 20 tick 重搜最近水体，逐 tick 断言 tx/ty 对抗内核覆盖；不入档） */
  beachTx?: number;
  beachTy?: number;
  /** 水生猎游粘性目标（猎手扑杀/导向共用：目标鱼 id，存活且 ≤40 格则粘住不换 — 不入档） */
  beachTargetId?: number;
  /** 出生时的科技伤害乘数快照（科技回溯重算基准：completeTech 按新旧差重算；不入档，读档时按当前科技初始化） */
  tDmg?: number;
  /** 出生时的科技生命乘数快照（同 tDmg） */
  tHp?: number;
  /** 寒冻减速计时（暴风雪；tick；瞬态不入档） */
  chill?: number;
  /** 所属军团 id（-1/undefined = 无军团；军团编成期间的阵位归届） */
  army?: number;
  // ---------------- 神力增益（神恩祝福/神罚诅咒/爱之甘霖；tick 倒计时，瞬态不入档） ----------------
  /** 神恩祝福剩余 tick：伤害 ×1.3 + 缓慢回血 + 金色微光 */
  bless?: number;
  /** 神罚诅咒剩余 tick：移速 ×0.75 + 持续失血 + 紫霾 */
  curse?: number;
  /** 捕食者饥饿账本（仅 predator 野生动物）：击杀猎物得食、随时间消耗；归零开始饿死，充盈才可繁衍 —— Lotka-Volterra 迟滞 */
  food?: number;
  // ---------------- 寻路自愈（瞬态不入档：山体/水域隔断的直线追击死锁） ----------------
  /** 卡死计数（远目标却无净位移的连续 update 数） */
  stk?: number;
  /** 位移锚点（卡死检测参照） */
  sxk?: number;
  syk?: number;
  /** 绕行剩余 tick：>0 时追击/索敌不覆写目标 —— 让逃生方向真正生效 */
  detour?: number;
  /** 爱之甘霖剩余 tick：繁衍概率 ×2.5 */
  fert?: number;
  // ---------------- 生物进化（基因遗传与变异） ----------------
  /** 个体基因（野生动物携带：速度/伤害/生命/繁衍四维乘数，围绕 1.0 波动） */
  gene?: Gene;
  // ---------------- 涌现社会内核（Task 39） ----------------
  /** 恐慌值 0..1（瞬态不入档：目睹死亡↑/同族传染↑/时间衰减↓ —— 兽群溃逃雪崩的微观动力） */
  panic?: number;
  /** 血仇对象 id 列表（≤4 条 LRU；与 gVal 平行 —— 目睹同族被杀所记，驱动复仇优先索敌） */
  gIds?: number[];
  /** 血仇强度平行数组（0.3..3.0：同种 +1.0 / 同国 +1.6 / 家族血亲 +2.6；每年衰减 0.12） */
  gVal?: number[];
  /** 家族 id（undefined = 无姓流浪者；子代继承母系血脉 —— 名门望族的谱系主干） */
  fam?: number;
  /** 家族代数（初代 = 1；子代 = 母代 +1 —— 「第 N 代」展示） */
  fgn?: number;
  // —— 王权（国王实体：加冕时置 true + job 'king'；旧档缺省 = 平民）——
  /** 是否国王（一国至多一位；驾崩触发继承与稳定度下降） */
  king?: boolean;
  // ---------------- 神之手指（抓取投掷：瞬态不入档） ----------------
  /** 被抓起/眩晕剩余 tick（>0 = AI 暂停 + 免疫地面伤害；抓取时由 moveGrab 持续刷新） */
  grab?: number;
  /** 投掷飞行剩余 tick（>0 = 抛物线飞行中） */
  thrT?: number;
  /** 投掷水平速度（tile/tick） */
  thrVx?: number;
  thrVy?: number;
  /** 投掷起点（落地伤害按飞行距离结算） */
  thrX0?: number;
  thrY0?: number;
}

/** 家族谱系（Lineage）：血脉传承的名门统计体（engine.families 注册表） */
export interface Family {
  id: number;
  /** 家族姓氏（词法组合生成：「霜牙」「烬羽」） */
  name: string;
  race: number;
  /** 立族年份 */
  founded: number;
  /** 初代先祖名（初代个体名） */
  founder: string;
  /** 现存成员数 */
  members: number;
  /** 家族英雄数（kills ≥ 10） */
  heroes: number;
  /** 家族累计击杀（含亡者） */
  kills: number;
  /** 历史峰值人口（枝繁叶茂播报已触发标记：12/24/40） */
  peak: number;
  milestones: number;
}

/** 基因四维乘数（0.5–2.0 夹紧）：进化系统的遗传单位 */
export interface Gene {
  /** 速度乘数 */
  s: number;
  /** 伤害乘数 */
  d: number;
  /** 生命乘数 */
  h: number;
  /** 繁衍乘数 */
  r: number;
}

/** 物种进化快照（生态面板展示：种群规模/基因均值/世代棘轮/亚种命名） */
export interface SpeciesEco {
  race: number;
  name: string;
  pop: number;
  /** 当前种群基因均值 */
  gene: Gene;
  /** 物种棘轮基线（代代累积的进化成果） */
  base: Gene;
  /** 自上一采样点的种群变化率（%·正增负减） */
  trend: number;
  /** 繁衍世代数（棘轮次数） */
  gen: number;
  /** 亚种命名（棘轮推进时按环境×漂移维度生成，如「霜狼·健壮」） */
  sub?: string;
  /** 阈值涌现特质（基因维度均值突破阈值时命名并播报，如「疾足」「凶猛」） */
  beh?: string[];
  /** 种群历史采样（近 ~120 个采样点·年，灭绝后归零） */
  hist?: number[];
}

export interface Civ {
  id: number;
  name: string;
  race: number;
  color: [number, number, number];
  colorHex: string;
  pop: number;
  tiles: number[]; // owned tile indices
  frontier: number[]; // expansion frontier
  houses: number;
  capital: number; // tile index or -1
  /** 国王名（词法生成；加冕实体单位后与国王单位名同步） */
  kingName: string;
  /** 现任国王单位 id（undefined/-1 = 尚未加冕或已驾崩待继承；crownVacantTick 自动补冕 —— 旧档王国亦然） */
  kingId?: number;
  alive: boolean;
  banner: string; // one-word banner word
  /** 下一次允许派出殖民船的 tick */
  colonizeCd?: number;
  /** 人口首次归零的 tick（幽灵王国宽限期：持续无人 10 年后自然消亡；undefined = 有人） */
  popZeroTick?: number;
  /** 兴衰历史采样点：[年份, 人口, 领土?, 房屋?]（每 5 年一次，上限 160 点；旧存档为 2 元组，领土/房屋回退 0） */
  history?: number[][];
  /** 国库财富（集市/商人生成，高阶建筑与殖民消耗） */
  gold?: number;
  /** 知识（图书馆生成，解锁高阶建筑） */
  knowledge?: number;
  /** 下一次允许组建军团的 tick（军队方阵冷却） */
  armyCd?: number;
  /** 总动员截止 tick（期间平民全部武装为战士） */
  mobilizeUntil?: number;
  /** 王国融合归宿（超级演化 v4：alive=false 且本字段非空 = 和平并入该国而非灭亡） */
  mergedInto?: number;

  // ---------------- 科技研发体系 ----------------
  /** 已研发科技 key 列表 */
  techs?: string[];
  /** 当前在研科技 key（null = 无） */
  research?: string | null;
  /** 当前在研进度（已投入知识点） */
  researchP?: number;

  // ---------------- 社会体系（政治/经济/文化/军事） ----------------
  /** 政体（0 部落制 1 君主制 2 神权制 3 共和制 4 帝国；见 GOV_DEFS） */
  gov?: number;
  /** 政体确立年份（播报用） */
  govYear?: number;
  /** 稳定度 0-100（战争/扩张降低；神殿/文化/科技提升；过低则叛乱风险飙升） */
  stability?: number;
  /** 文化点（神殿/节日/文化科技累积；提升稳定与知识产出） */
  culture?: number;
  /** 军国主义 0-100（战争与胜利推高；影响宣战倾向与军团规模） */
  militarism?: number;
  /** 上期经济总收入（税收+集市+港口+种殿）— 社会面板展示 */
  income?: number;
  /** 上期总支出（军团军饱+建筑维护）— 社会面板展示 */
  expense?: number;
  /** 文化积累纪元（用于节日/播报节奏） */
  festivalCd?: number;
  // ---------------- 涌现社会理念（Infinite Ideas） ----------------
  /** 已采纳的涌现理念 key 列表（上限 3；效果由 engine.ideaModsOf 汇总） */
  ideas?: string[];
}

export type BuildKind = number; // 0 none, 1 house, 2 capital, 3 tower, 4 farm, 5 barracks, 6 castle, 7 port, 8 library, 9 market, 10 temple, 11 wall

// ---------------- 军团方阵（Army Formation System） ----------------
export type ArmyState =
  /** 集结：成员向军旗靠拢 */
  | 'rally'
  /** 行军：方阵向敌国推进 */
  | 'march'
  /** 会战：与敌军/敌单位接战 */
  | 'battle'
  /** 围城：拆毁并占领敌国建筑与土地 */
  | 'siege'
  /** 溃退：士气崩塌后撤退回国 */
  | 'retreat';

/** 军团：战争期间文明组建的方阵集团军 */
export interface Army {
  id: number;
  civ: number;
  /** 军团名（如「苍狼军团」） */
  name: string;
  /** 成员单位 id 列表（动态增删） */
  members: number[];
  /** 指挥官（执旗官）单位 id，-1 = 无 */
  leaderId: number;
  /** 军旗当前位置（= 阵形中心，行军时向目标推进） */
  x: number;
  y: number;
  /** 军旗渲染插值（Task 48-B3）：上一 tick 军旗位置 + 本帧插值坐标（行军每 5 tick 一次，直读会 3 次/秒跳变） */
  lax?: number;
  lay?: number;
  ax?: number;
  ay?: number;
  /** 行军目标 */
  tx: number;
  ty: number;
  state: ArmyState;
  /** 组建 tick */
  formedTick: number;
  /** 组建时规模（士气/伤亡比基准） */
  size0: number;
  /** 士气 0-100 */
  morale: number;
  /** 目标敌国 */
  targetCiv: number;
  /** 阵位分配轮转种子（行军队列排列） */
  rot: number;
  /** 战役统计：击杀 */
  kills: number;
  /** 战役统计：损失 */
  losses: number;
  /** 上次状态机评估 tick */
  evalTick: number;
  /** 会战开局兵力基准（伤亡崩溃判定：阵亡过半即溃，transient 不入档） */
  battleSize0?: number;
  /** 上次行军渗透 tick（战线随军推进的节流；瞬态不入档） */
  marchPushTick?: number;
  /** 会战标记：与敌军接战 tick（用于会战结算播报） */
  battleSince?: number;
  /** 会战对手军团 id */
  clashWith?: number;
  /** 舰队渡海模式：军旗与成员乘船跨水航行 */
  naval?: boolean;
  // —— 精细作战行为（战术 AI / 机械化）——
  /** 林间伏击状态（行军于森林时激活：接战首击士气加成） */
  ambush?: boolean;
  /** 战术撤退标记（区别于士气崩溃的溃退：保持建制士气） */
  tactical?: boolean;
  /** 收到驰援次数（增援调度统计） */
  reinforced?: number;
  /** 补给线吃紧警示已播报（去重用） */
  supplyWarned?: boolean;
}

// ---------------- 战争理由（Casus Belli）体系 ----------------
/** 开战理由：每场战争必须有名有实——目的达成或国力不支才能停战 */
export type CasusKind =
  /** 边境战争：夺取少量接壤领土 */
  | 'border'
  /** 征服战争：大规模吞并敌国疆土 */
  | 'conquest'
  /** 劫掠战争：以战果削弱敌国、索赔财富 */
  | 'plunder'
  /** 复仇战争：洗刷上一场战争的败绩 */
  | 'revenge'
  /** 叛乱战争：宗主国讨伐分裂叛军（不死不休） */
  | 'rebel'
  /** 灭国战争：摧毁对方（不死不休） */
  | 'annex'
  /** 统一战争：成为世界唯一强权（不死不休） */
  | 'unify'
  /** 圣战：奉神谕而战（旨意驱动） */
  | 'holy'
  /** 盟约战争：集体防御条款生效 / 联军协同出击（联盟系统） */
  | 'alliance';

/** 战争理由元数据（UI 展示） */
export const CASUS_META: Record<CasusKind, { label: string; badge: string }> = {
  border: { label: '边境战争', badge: 'border-zinc-600 bg-zinc-700/40 text-zinc-300' },
  conquest: { label: '征服战争', badge: 'border-orange-500/60 bg-orange-500/15 text-orange-300' },
  plunder: { label: '劫掠战争', badge: 'border-yellow-500/60 bg-yellow-500/15 text-yellow-300' },
  revenge: { label: '复仇战争', badge: 'border-rose-500/60 bg-rose-500/15 text-rose-300' },
  rebel: { label: '叛乱战争', badge: 'border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-300' },
  annex: { label: '灭国战争', badge: 'border-red-500/60 bg-red-500/20 text-red-300' },
  unify: { label: '统一战争', badge: 'border-amber-400/60 bg-amber-400/15 text-amber-200' },
  holy: { label: '圣战', badge: 'border-violet-400/60 bg-violet-400/15 text-violet-300' },
  alliance: { label: '盟约战争', badge: 'border-teal-400/60 bg-teal-400/15 text-teal-200' },
};

// ---------------- 战争对象（战争体系升级） ----------------
export interface WarInfo {
  /** 关系对 key 'a-b'（a < b） */
  key: string;
  a: number;
  b: number;
  startTick: number;
  startYear: number;
  /** 灭国战争（不死不休） */
  total: boolean;
  /** 战争分数：击杀 +2 / 拆屋 +5 / 占地 +1 / 陷落王都 +40 */
  scoreA: number;
  scoreB: number;
  /** 战争疲乏（伤亡累积，双方高企时强制白平） */
  exA: number;
  exB: number;
  /** 厌战度 0-100（久战无果累积、战果与胜利冲减；>62 双方高企时民意压垮战争） */
  wearA?: number;
  wearB?: number;
  /** 伤亡：a 方损失 / b 方损失 */
  casA: number;
  casB: number;
  /** 双方拆毁的敌建筑数 */
  razedA: number;
  razedB: number;
  /** 会战次数 */
  battles: number;
  /** 灭国战争放弃倒计时（久攻不下 → 攻方可能失败） */
  giveUpAt: number;
  // —— 战争理由体系 ——
  /** 开战理由 */
  reason: CasusKind;
  /** 宣战檄文（纪事原文） */
  reasonText: string;
  /** 挑起方 */
  aggressor: number;
  /** 战争目的量：border/conquest=占领格数；plunder=战果分；revenge=分数优势；holy=神谕目标分；0=摧毁敌国 */
  goal: number;
  /** 目的当前进度（快照缓存，UI 展示） */
  goalNow: number;
  /** 双方累计占领的敌国格数 */
  occA: number;
  occB: number;
  /** 开战时双方人口（战争承受力基线） */
  popA0: number;
  popB0: number;
  /** 战事活跃签名（变化→仇恨加深/重置沉寂计时；瞬态） */
  sigMark?: number;
  /** 最近一次有战果的 tick（长期沉寂 → 劳师廉饷停战；瞬态） */
  lastActiveTick?: number;
}

// ---------------- 文明旨意（文明级开发者功能） ----------------
/** 旨意种类：由文明自行达成（可能失败）的目标指令 */
export type DirectiveKind =
  /** 灭国令：持续灭国战争摧毁目标（可能失败——久攻不下/自身覆灭） */
  | 'annihilate'
  /** 攻城令：攻陷目标王都 */
  | 'conquer'
  /** 扩张令：领土达到 N 格 */
  | 'expand'
  /** 富国令：财富达到 N */
  | 'wealth'
  /** 启智令：知识达到 N */
  | 'wisdom'
  /** 人口令：人口达到 N */
  | 'populate'
  /** 军团令：同时保有 N 支现役军团 */
  | 'legion'
  /** 建城令：房屋达到 N */
  | 'build'
  /** 统一令：成为世界唯一强权 */
  | 'unify'
  /** 总动员令：限期内全军出击斩获 N 击杀 */
  | 'mobilize'
  /** 联盟令：与目标交好（关系 ≥ 60） */
  | 'alliance'
  /** 信仰令：建成神殿 */
  | 'temple';

export interface Directive {
  id: number;
  civ: number;
  kind: DirectiveKind;
  /** 目标文明（annihilate/conquer/alliance） */
  target?: number;
  /** 阈值参数 */
  param: number;
  status: 'active' | 'success' | 'failed';
  startTick: number;
  /** 失败期限 tick（0 = 无限期） */
  deadlineTick: number;
  /** 颁布时描述（纪事/UI 展示） */
  text: string;
  /** 结算 tick */
  endTick?: number;
  /** 结算描述 */
  endText?: string;
  /** 动员窗口内累计击杀（mobilize 用） */
  killCount?: number;
}
export interface Building {
  i: number; // tile index
  x: number;
  y: number;
  kind: BuildKind;
  civ: number;
}

export type EffectKind =
  | 'explosion'
  | 'bolt'
  | 'meteor'
  | 'tornado'
  | 'quake'
  | 'skull'
  | 'heart'
  | 'hit'
  | 'smoke'
  | 'flash'
  | 'mushroom'
  | 'spawn'
  | 'fireball'
  | 'arrow'
  | 'coin'
  | 'dmg'
  | 'acid'
  | 'blood'
  | 'dust'
  | 'volcano'
  | 'tsunami'
  | 'blizzard'
  | 'locust'
  | 'drought'
  | 'water'
  | 'hammer'
  // —— 冰霜（Task 102：湖泽封冻瞬间的冰晶星芒）——
  | 'frost'
  // —— 神力扩充（7）——
  | 'rainstorm'
  | 'bless'
  | 'curse'
  | 'mutate'
  | 'spark'
  | 'wrath'
  | 'holystorm'
  // —— 天灾扩充（6）——
  | 'sandstorm'
  | 'typhoon'
  | 'sinkhole'
  | 'iceage'
  | 'famine'
  | 'blackhole'
  // —— 现代武器体系（4）——
  | 'bullet'
  | 'shell'
  | 'missile'
  | 'airstrike'
  // —— 未来武器体系（6）——
  | 'laser'
  | 'drone'
  | 'orbital'
  | 'mech'
  | 'plasma'
  | 'antimatter';

export interface Effect {
  kind: EffectKind;
  x: number;
  y: number;
  x0: number;
  y0: number;
  r: number;
  age: number;
  ttl: number;
  seed: number;
  dir: number; // tornado heading
  text?: string; // damage numbers etc.
  /** 箭矢/远程施放者的文明 id（伤害判定豁免友军） */
  src?: number;
  /** 箭矢伤害（命中时结算） */
  dmg?: number;
  /** 静默：陨石雨/火山熔岩弹等衍生弹体不再单独入纪事 */
  quiet?: boolean;
  /** 核弹头当量（missile 携带：命中时升起磨茹云） */
  nuke?: number;
  /** 弹体落地是否纵火（炮击/轰炸） */
  fire?: number;
  /** 涌现武器 id（命中结算时归属战绩 + 附加辐射/改地形/士气打击） */
  wid?: number;
  /** v3：弹道主题色（涌现武器装药组件决定 —— 每种弹头有专属视觉签名） */
  col?: string;
}

/** 世界纪事事件类型 */
export type WorldEventKind =
  | 'found' | 'war' | 'peace' | 'fall' | 'unify' | 'dragon'
  | 'legend' | 'plague' | 'zombie' | 'nuke' | 'meteor' | 'battle'
  | 'colonize' | 'settle' | 'shipwreck' | 'river' | 'oasis'
  | 'rebel' | 'bandit' | 'demon' | 'skeleton' | 'trigger'
  | 'siege' | 'capture' | 'sack' | 'totalwar' | 'loot' | 'build'
  | 'acidrain' | 'volcano' | 'tsunami' | 'blizzard' | 'locust' | 'drought'
  | 'meteorshower' | 'whitewalker' | 'vampire'
  | 'kraken' | 'sandworm' | 'basilisk' | 'petrify'
  | 'army' | 'clash' | 'rout' | 'cession' | 'occupy' | 'capital'
  | 'decree' | 'decreeOk' | 'decreeFail'
  // —— 战争理由体系 ——
  | 'casus' | 'collapse'
  // —— 科技研发与社会体系 ——
  | 'tech' | 'gov' | 'riot' | 'festival' | 'fireOut' | 'repair'
  // —— 神力/天灾扩充 ——
  | 'rain' | 'sandstorm' | 'typhoon' | 'sinkhole' | 'iceage' | 'famine' | 'blackhole' | 'wrath'
  // —— 生物进化与生态竞争 ——
  | 'evolve' | 'eco'
  // —— 成就系统（跨世界元进度）——
  | 'achieve'
  // —— 终极世界大战 ——
  | 'worldwar'
  // —— 超级武器（未来时代：激光/蜂群/轨道/等离子/反物质/机甲） ——
  | 'superweapon'
  // —— 涌现纪事（程序化武器锻造/迭代/缴获仿制 + 种化新物种 + 阈值特质） ——
  | 'emerge'
  // —— 自然引擎（板块地震/造山侵蚀/裂谷/火山灰/气旋） ——
  | 'geo'
  // —— 深度打磨：道路/国际贸易商队 ——
  | 'road' | 'trade'
  // —— 联盟系统（结盟/入盟/叛盟/解散/集体防御） ——
  | 'alliance'
  // —— 种族系统 v2（种族灭绝/种族关系大事） ——
  | 'extinct'
  // —— 涌现社会内核：兽群溃逃雪崩 / 血仇得报 / 家族里程碑 ——
  | 'panic' | 'revenge' | 'lineage'
  // —— 王权（加冕/驾崩/继承）——
  | 'king'
  // —— 神话种族（光明/浴火/守护/死灵/九头）——
  | 'angel' | 'phoenix' | 'ent' | 'lich' | 'hydra'
  // —— 圣光风暴（光明阵营神力）——
  | 'holystorm'
  // —— v40：神谕 Agent（法则书写/宣告/热改参数） ——
  | 'oracle'
  // —— 季节 × 万物（换季宣告/生物节律） ——
  | 'season';

// ---------------- v40/v41：Agent 法则（机制热插拔引擎的封闭动作枚举） ----------------
/** 法则动作：Agent 只能拼装这些积木——纯数据描述，无 eval，参数引擎侧硬校验。
 *  v2：17 经典 + 15 神力 + 机制链 mech + 计数器 counter = 33 种 */
export type AgentLawAction =
  | { kind: 'meteor'; x?: number; y?: number }
  | { kind: 'quake'; x?: number; y?: number; power?: number }
  | { kind: 'volcano'; x?: number; y?: number; power?: number }
  | { kind: 'lightning'; x?: number; y?: number; count?: number }
  | { kind: 'tornado'; x?: number; y?: number; count?: number }
  | { kind: 'tsunami'; x?: number; y?: number; radius?: number }
  | { kind: 'drought'; x?: number; y?: number; radius?: number }
  | { kind: 'flood'; x?: number; y?: number }
  | { kind: 'blizzard'; x?: number; y?: number; radius?: number }
  | { kind: 'weather'; weather: 'rain' | 'sandstorm'; x?: number; y?: number; radius?: number }
  | { kind: 'spawn'; race: string; count?: number; x?: number; y?: number }
  | { kind: 'terrain'; terrain: string; radius?: number; x?: number; y?: number }
  | { kind: 'bless'; x?: number; y?: number; radius?: number }
  | { kind: 'heal'; x?: number; y?: number; radius?: number }
  | { kind: 'smite'; x?: number; y?: number; radius?: number }
  | { kind: 'param'; path: string; value: number }
  | { kind: 'announce'; text: string }
  // ---------------- v41：15 种神力（缺省坐标逻辑：动作指定 > 事件发生地 > 随机） ----------------
  | { kind: 'meteor_shower'; x?: number; y?: number; radius?: number; count?: number }
  | { kind: 'typhoon'; x?: number; y?: number; radius?: number }
  | { kind: 'acid_rain'; x?: number; y?: number; radius?: number }
  | { kind: 'locust'; x?: number; y?: number; radius?: number }
  | { kind: 'famine'; x?: number; y?: number; radius?: number }
  | { kind: 'ice_age'; x?: number; y?: number; radius?: number }
  | { kind: 'sinkhole'; x?: number; y?: number; radius?: number }
  | { kind: 'blackhole'; x?: number; y?: number; radius?: number }
  | { kind: 'wrath'; x?: number; y?: number; radius?: number }
  | { kind: 'curse'; x?: number; y?: number; radius?: number }
  | { kind: 'love'; x?: number; y?: number; radius?: number }
  | { kind: 'mutate'; x?: number; y?: number; radius?: number }
  | { kind: 'teleport'; x?: number; y?: number; radius?: number }
  | { kind: 'rain_cloud'; x?: number; y?: number; radius?: number }
  // ---------------- v41：机制链 + 自定义计数器 ----------------
  /** 机制链：操作另一条机制（disable 会还原其 param 账本）——链式联动的基石 */
  | { kind: 'mech'; action: 'enable' | 'disable'; target: string }
  /** 自定义计数器：机制在 fire 中维护的命名变量（条件 DSL 用 counter:名 读取） */
  | { kind: 'counter'; name: string; op: 'add' | 'set'; value: number }
  // ---------------- v5：六新神力（33 → 39；引擎早已有、机制 DSL 此前不可达） ----------------
  | { kind: 'nuke'; x?: number; y?: number; power?: number }
  | { kind: 'plague'; x?: number; y?: number; radius?: number }
  | { kind: 'fire'; x?: number; y?: number; radius?: number }
  | { kind: 'boom'; x?: number; y?: number; radius?: number }
  | { kind: 'river'; x?: number; y?: number }
  | { kind: 'oasis'; x?: number; y?: number };

/** 条件表达式 DSL（机制触发条件的判定树——纯数据，无 eval） */
export type CondExpr =
  | { op: 'and' | 'or'; sub: CondExpr[] }
  | { op: 'not'; sub: CondExpr }
  | { op: 'gt' | 'lt' | 'gte' | 'lte' | 'eq'; stat: string; value: number };

/** 机制触发器 v2（cron 周期 / event 事件总线 / condition 条件轮询） */
export interface MechTrigger {
  kind: 'cron' | 'event' | 'condition';
  /** cron/condition：每隔多少游戏年尝试（1-100；condition 语义 = 两次触发的最小间隔，默认 1） */
  everyYears?: number;
  /** 每次判定的触发概率 0.01-1（event 型同样适用，默认 1） */
  chance?: number;
  /** cron/condition：限定季节 0春1夏2秋3冬（null 不限） */
  season?: number | null;
  /** event：监听的世界事件类型（WorldEventKind 字符串） */
  event?: string;
  /** event：同一机制两次触发间的最小间隔年（默认 1，防事件雪崩） */
  eventCooldownYears?: number;
  /** condition：判定条件（在引擎结算 tick 上轮询，满足即触发） */
  cond?: CondExpr;
}

/** 一条 Agent 法则（随存档序列化） */
export interface AgentLaw {
  id: string;
  /** 法则名（Agent 起的，展示用） */
  name: string;
  /** 一句话描述（造物主在法则管理器里读到的效果说明） */
  desc: string;
  enabled: boolean;
  /** 创建年份（游戏内纪年） */
  createdYear: number;
  /** 存续年数（null=永久；到期自动移除并还原 param 动作） */
  durationYears: number | null;
  /** 触发器 v2（旧档 {everyYears,chance,season} 无 kind —— 读档时 normalizeLaw 归一化为 cron） */
  trigger: MechTrigger;
  actions: AgentLawAction[];
  /** 结算统计 */
  fired: number;
  /** 上次结算的游戏年份 */
  lastYear: number;
  /** param 动作的改前值账本（path → 改前值；移除/到期时还原；不序列化——热参数不入档） */
  revert: Record<string, number>;
}

export interface WorldEvent {
  id: number;
  year: number;
  kind: WorldEventKind;
  text: string;
  colorHex?: string; // 涉及文明的主题色
  x?: number;
  y?: number; // 发生地（点击可跳转）
}

// ---------------- 涌现式武器铸造（Emergent Weapon Foundry） ----------------
/** 程序化涌现武器：伤害类型 × 投送方式 × 效果标志全部随机铸造（非预设清单）；
 *  战绩反馈驱动血系迭代（同族代代强化），敌国可缴获仿制引发军备竞赛 */
export interface EmergentWeapon {
  id: number;
  /** 所属文明 */
  civ: number;
  /** 程序化名称（如「相位光矛·湮灭」/「磁轨重炮 Mk.II·破晓」） */
  name: string;
  /** 迭代代数（同族武器代代强化：1 = 原型） */
  gen: number;
  /** 伤害类型 0 动能 1 热能 2 定向能 3 生化 4 奇点 */
  dtype: number;
  /** 投送方式 0 身管火炮 1 光束 2 蜂群 3 轨道 4 力场 */
  delivery: number;
  dmg: number;
  radius: number;
  /** 命中纵火概率 0-1 */
  fire: number;
  /** 落点辐射污染 */
  rad: boolean;
  /** 地形改造（焦土化） */
  terra: boolean;
  /** 附加军团士气打击 0-35 */
  morale: number;
  /** 奇迹武器（稀有高威力变体：×2 威力 + 金色播报） */
  wonder: boolean;
  /** 实战击杀归属（战绩反馈） */
  kills: number;
  /** 累计发射 */
  fired: number;
  /** 族系父设计 id（迭代/缴获仿制 lineage；null = 全新铸造） */
  parent: number | null;
  /** 融合第二父设计 id（超级演化 v4：双血系嫁接时非空 —— 图谱双亲边） */
  parent2?: number | null;
  bornYear: number;
  /** 已退役（被更强迭代取代，不再发射但保留谱系） */
  retired: boolean;
  // ---------------- 武器架构 v2（组件化涌现：四槽位架构而非数值袋） ----------------
  /** 装药组件 kind（0-6：动能穿甲/高爆榴/铝热燃烧/电磁脉冲/生化毒剂/聚变芯/反物质芯）；-1 = 旧档武器（由 dtype 回推） */
  pl?: number;
  /** 投送组件 kind（0-4：身管火炮/火箭集群/钻地弹道/亚轨滑翔/轨道天罚） */
  dl?: number;
  /** 制导组件 kind（0-4：哑弹/直熚惯导/卫星精导/蜂群协同/量子锁定） */
  gd?: number;
  /** 供能组件 kind（0-4：化学装药/激光激发/超导环流/反应堆心/奇点供能） */
  pw?: number;
  /** 四槽品质向量（0.6-1.4：装药威力/投送速度/制导精度/供能效率 —— 代际遇传变异的基因） */
  q?: [number, number, number, number];
  /** 被拦截次数（对抗演化反馈：推动学说转向饱和/隐身投送） */
  inter?: number;
}

/** 军备学说（武器架构 v2）：每国四轴向量 0-1，由实战反馈漂移，驱动锻造选型 —— 不可预测的军备分流 */
export interface WeaponDoctrine {
  /** 精确打击（优先高制导） */
  precision: number;
  /** 饱和压制（优先集群/廉价投送） */
  saturation: number;
  /** 纵深恐吓（优先恐怖性装药：生化/聚变/反物） */
  terror: number;
  /** 消耗磨损（优先廉价可靠：身管/哑弹/化学） */
  attrition: number;
}

/** 对抗演化防御套件（武器架构 v2）：挨打长记性，三国防御各自演化，驱动下一代武器对抗性选型 */
export interface WeaponDefense {
  /** 点防拦截 0-100（拦慢速抛物投送） */
  point: number;
  /** 装甲加固 0-100（减爆伤/护建筑） */
  armor: number;
  /** 疏散诱饵 0-100（降制导命中率） */
  evade: number;
}

/** 终极世界大战状态（开发者模式引燃：不死不休，直到只剩一国或全部灭亡；中途可暂时停战） */
export interface WorldWarState {
  /** 阶段：未打响 / 战火燃烧 / 已终战（保留终战播报供 HUD 展示） */
  phase: 'idle' | 'running' | 'ended';
  /** 开战 tick */
  startTick: number;
  /** 开战年份 */
  startYear: number;
  /** 终战 tick（phase=ended 时有效） */
  endTick: number;
  /** 参战国名单（开战时在世的全部国家；灭亡后保留作统计） */
  belligerents: number[];
  /** 开战时各国人口快照（civId → pop） */
  pop0: Record<number, number>;
  /** 战争期间阵亡总数（战斗击杀） */
  kills: number;
  /** 已灭亡参战国家名单（id/名/色，逐个追记） */
  fallen: { id: number; name: string; colorHex: string }[];
  /** 停战协议次数（含战力崩溃自动休战） */
  truces: number;
  /** 核弹发射数 */
  nukes: number;
  /** 未来武器发射计数：激光 */
  lasers: number;
  /** 未来武器发射计数：蜂群 */
  drones: number;
  /** 未来武器发射计数：轨道天罚 */
  orbitals: number;
  /** 未来武器发射计数：等离子炮 */
  plasmas: number;
  /** 未来武器发射计数：反物质湮灭 */
  antimatters: number;
  /** 涌现武器发射计数（程序化锻造的非预设武器） */
  emerged: number;
  /** 胜者 civ id（null = 同归于尽或未终战） */
  winner: number | null;
  /** 终战描述 */
  endText: string;
}

/** 终极世界大战快照（HUD / 开发面板展示） */
export interface WorldWarSnapshot {
  phase: 'idle' | 'running' | 'ended';
  /** 开战 tick（唯一标识本轮大战：HUD 关闭标记键） */
  startTick: number;
  startYear: number;
  /** 已持续年数 */
  years: number;
  /** 开战时参战国总数 */
  belligerents: number;
  /** 仍在世的参战国数 */
  alive: number;
  kills: number;
  truces: number;
  nukes: number;
  /** 现代军备国数（军备 ≥ 4） */
  modernCivs: number;
  /** 未来军备国数（军备 ≥ 6） */
  futureCivs: number;
  /** 终局狂热（存活 ≤ 3 国：武器频率翻倍，反物质解禁） */
  frenzy: boolean;
  /** 未来武器发射计数（lasers/drones/orbitals/plasmas/antimatters） */
  lasers: number;
  drones: number;
  orbitals: number;
  plasmas: number;
  antimatters: number;
  /** 涌现武器发射计数（程序化武器） */
  emergent: number;
  fallen: { name: string; colorHex: string }[];
  winner: number | null;
  winnerName: string | null;
  endText: string;
}

export interface StatsSnapshot {
  year: number;
  totalPop: number;
  byRace: Record<string, number>;
  civs: {
    id: number;
    name: string;
    race: number;
    colorHex: string;
    pop: number;
    tiles: number;
    houses: number;
    wars: string[];
    /** 首都坐标（排行榜点击跳转用） */
    capital: { x: number; y: number } | null;
    /** 国库财富 */
    gold: number;
    /** 知识 */
    knowledge: number;
    /** 军队规模（战士+弓手） */
    army: number;
    /** 各类建筑计数（kind → n，仅非零项） */
    builds: { kind: number; n: number }[];
    // —— 科技与社会体系（CivPanel / Inspector 展示） ——
    /** 已研发科技数 */
    techCount: number;
    /** 当前在研科技（key/名称/进度 0-1/还需知识点） */
    research: { key: string; name: string; progress: number; remain: number } | null;
    /** 政体 id */
    gov: number;
    /** 政体中文名 */
    govName: string;
    /** 稳定度 0-100 */
    stability: number;
    /** 文化点 */
    culture: number;
    /** 军国主义 0-100 */
    militarism: number;
    /** 上期收入 */
    income: number;
    /** 上期支出 */
    expense: number;
    // —— 军备等级（科技深度绑定：0 木石/1 青铜/2 铁/3 钢）——
    /** 军备等级 */
    armament: number;
    /** 军备名称（木石时代/青铜时代/铁器时代/钢铁时代） */
    armamentName: string;
    // —— 联盟系统（所属联盟 id，-1 = 无）——
    /** 所属联盟 id（-1 = 无联盟） */
    allianceId: number;
    /** 所属联盟名 */
    allianceName: string;
  }[];
  // ---------------- 联盟系统（阵营实体） ----------------
  /** 现存联盟一览（成员/凝聚力/共同战争） */
  alliances: {
    id: number;
    name: string;
    colorHex: string;
    leaderName: string;
    leaderId: number;
    members: { id: number; name: string; colorHex: string; raceName: string; pop: number }[];
    cohesion: number;
    formedYear: number;
    warsTogether: number;
  }[];
  warsCount: number;
  fires: number;
  units: number;
  /** 航行中的殖民船数量 */
  boats: number;
  /** 王国间外交关系（a/b 为文明 id，v 为关系值：< -20 交战，负数敌意，正数友好） */
  relations: { a: number; b: number; v: number }[];
  /** 活跃贸易路线（在途商队两端文明对，去重） */
  tradePairs: [number, number][];
  /** 现役军团（方阵）一览 */
  armies: {
    id: number;
    name: string;
    civ: number;
    size: number;
    size0: number;
    morale: number;
    state: ArmyState;
    x: number;
    y: number;
    kills: number;
    /** 累计战损（集结以来折损人数） */
    losses: number;
    /** 军团机械化（机器人学科技：金色描边 + 行军加速） */
    mech: boolean;
    /** 战术 AI（奇点智能科技：会战评估/主动驰援/战术撤退） */
    ai: boolean;
  }[];
  /** 进行中战争详情（双方/分数/年数/灭国） */
  warList: {
    a: number;
    b: number;
    nameA: string;
    nameB: string;
    colorA: string;
    colorB: string;
    years: number;
    scoreA: number;
    scoreB: number;
    casA: number;
    casB: number;
    /** 双方拆毁建筑数 */
    razedA: number;
    razedB: number;
    total: boolean;
    // —— 战争理由体系 ——
    /** 开战理由 */
    reason: CasusKind;
    /** 理由短名（徽章文案） */
    reasonLabel: string;
    /** 宣战檄文 */
    reasonText: string;
    /** 挑起方 id */
    aggressor: number;
    /** 战争目的量（0=摧毁敌国） */
    goal: number;
    /** 目的当前进度 */
    goalNow: number;
    /** 目的描述（“夺取 12 格”/“撞毁敌国”） */
    goalLabel: string;
    /** 双方战争承受力（0-100；跌破 25 即无力支撑） */
    sustainA: number;
    sustainB: number;
    /** 战争疲乏 */
    exA: number;
    exB: number;
  }[];
  /** 现行文明旨意（文明级开发者功能） */
  directives: {
    id: number;
    civ: number;
    civName: string;
    kind: DirectiveKind;
    text: string;
    status: 'active' | 'success' | 'failed';
    progress: number; // 0-1
    deadlineYear: number;
  }[];
  // ---------------- 生物进化与生态竞争（EcologyPanel 展示） ----------------
  /** 野生动物各物种：种群/基因均值/棘轮基线 */
  species: SpeciesEco[];
  /** 植被承载力（草地+森林格数） */
  grass: number;
  /** 食草动物总数（载畜压力） */
  herbivores: number;
  /** 食肉动物总数（捕食压力） */
  predators: number;
  /** 生态平衡状态：overgrass 植被富余 / balanced 平衡 / overgraze 过牧 / collapse 生态崩溃 */
  ecoState: 'overgrass' | 'balanced' | 'overgraze' | 'collapse';
  // ---------------- 成就系统（跨世界元进度） ----------------
  /** 已解锁成就（id → 解锁年份；gameStore 合并进 localStorage 持久化） */
  unlockedAch: { id: string; year: number }[];
  /** 未解锁成就的当前进度（id → 当前值，目标见 ACHIEVEMENTS.goal） */
  achProgress: Record<string, number>;
  // ---------------- 终极世界大战（开发者模式引燃） ----------------
  /** 大战快照（idle 时为 null） */
  worldWar: WorldWarSnapshot | null;
  // ---------------- 自然引擎（NaturePanel 展示） ----------------
  /** 自然快照（板块/季节/大气/地质计数；永不为 null） */
  nature: NatureSnapshot;
  // ---------------- 种族系统 v2（RacePanel 展示） ----------------
  /** 种族名录（预设+动态；含性格维度与王国归属统计） */
  races: {
    id: number;
    key: string;
    name: string;
    isCiv: boolean;
    /** 当前存活人口 */
    pop: number;
    /** 拥有王国的种族（现存文明按种族计数） */
    kingdoms: number;
    /** 种族原型描述 */
    archetype: string;
    /** 性格雷达（0-100 化简；无维度的野怪为 null） */
    persona: { diplo: number; aggr: number; greed: number; piety: number; industry: number; arcane: number; growth: number; harmony: number } | null;
    /** 夜视种族标记 */
    nightsight: boolean;
    /** 动态物种标记（种化诞生） */
    dynamic: boolean;
    /** 父种族名（动态物种谱系） */
    parentName: string | null;
    /** 灭绝标记（曾经繁盛过但当前归零） */
    extinct: boolean;
  }[];
  /** 种族关系矩阵（主要文明种族间：预设基线 + 动态漂移后的当前值） */
  raceRelations: { a: number; b: number; v: number }[];
}

// ---------------- 自然模拟引擎（板块/地质/四季/大气/风暴） ----------------

/** 气旋风暴（温暖洋面孕育，随风场漂移，登陆则减弱肆虐） */
export interface Cyclone {
  id: number;
  /** 中心位置（tile 坐标） */
  x: number;
  y: number;
  /** 强度 0.1-1.6（≥0.7 登陆致灾） */
  strength: number;
  /** 剩余寿命 tick */
  ttl: number;
  /** 随机种子（螺旋渲染/路径抖动） */
  seed: number;
  /** 类型：热带气旋 / 极地冰暴 */
  kind: 'cyclone' | 'blizzard';
  /** 中文名（从风暴命名池抽取） */
  name: string;
  /** 是否已登陆（首次登陆播报） */
  landed: boolean;
}

/** 当季生物节律条目（NaturePanel「四季轮转」下的动态徽章） */
export interface SeasonRhythm {
  /** 短标签（如「树人春播」「九头蛇冬眠」） */
  label: string;
  /** 机制说明（悬停提示） */
  desc: string;
  /** 色调语义 */
  tone: 'good' | 'info' | 'danger';
}

/** 自然引擎快照（UI 展示 + 神喩6上下文） */
export interface NatureSnapshot {
  /** 当前季节 0 春 1 夏 2 秋 3 冬（法则关闭时永夏） */
  season: number;
  /** 季节名称 */
  seasonName: string;
  /** 当季生物节律（Task 101：引擎实况计算——对应种族灭绝的节律自动退场，火险等气候节律常驻） */
  rhythms: SeasonRhythm[];
  /** 本季已过年数 */
  seasonYearIn: number;
  /** 每季年数 */
  seasonYears: number;
  /** 火山灰遮蔽度 0-1（>0.3 显著降温） */
  ash: number;
  /** 板块数 */
  plates: number;
  /** 板块边界应力总量（地震风险指示） */
  stress: number;
  /** 地震风险等级 0-3（平静/酝酿/高危/临界） */
  quakeRisk: number;
  /** 云覆盖率 0-1 */
  cloudCover: number;
  /** 平均湿度 0-1 */
  humidity: number;
  /** 活跃风暴列表（气旋/冰暴） */
  storms: { id: number; name: string; kind: 'cyclone' | 'blizzard'; strength: number; x: number; y: number; landed: boolean }[];
  /** 地质计数：地震/强震/喷发/造山/侵蚀/气旋/海啸/洪水/暴雪/干旱 */
  counters: { quakes: number; quakesBig: number; eruptions: number; uplifts: number; erosions: number; cyclones: number; tsunamis: number; floods: number; blizzards: number; droughts: number };
  /** 近期震中（ Richter 级/位置/年份，最近 6 次） */
  recentQuakes: { x: number; y: number; m: number; year: number }[];
  /** 板块漂移向量（渲染箭头用） */
  drift: { dx: number; dy: number }[];
  /** 活跃气压中心（v2：低压 L 生雨/助产风暴，高压 H 晴燥） */
  pressure: { x: number; y: number; kind: number; str: number }[];
  /** 赤道辐合带纬度 0-1（随季节摆动——季风引擎） */
  itcz: number;
  /** 急流强度倍率（冬季强夏季弱） */
  jet: number;
  /** 灰烬霾团格数（平流场中浓度 >0.12 的粗网格数） */
  ashCells: number;
  /** 深时引擎快照（Task 40：连续海拔/水力侵蚀/土壤/温度/洋流/冰川/海平面） */
  deepTime: {
    /** 全球均温（相对温标：0.6 赤道 / −0.5 极地；<0 约=冰点以下） */
    globalTemp: number;
    /** 海平面（米，正=海侵 / 负=海退） */
    seaLevel: number;
    /** 冰川覆盖比 0-1（glacier>80 视觉冰盖口径） */
    glacierArea: number;
    /** 上升流渔场数（粗格） */
    upwelling: number;
    /** 土壤均肥 0-255（陆地口径） */
    soilAvg: number;
    /** 累计侵蚀量（海拔单位） */
    eroded: number;
    /** 累计沉积量（海拔单位） */
    deposited: number;
    /** 群系漂移累计格数 */
    biomeDrift: number;
    /** 强流占比 0-1（西边界强化指示） */
    currentsStrong: number;
  };
}

export interface ToastMsg {
  id: number;
  text: string;
  tone: 'info' | 'war' | 'peace' | 'danger' | 'good';
  /** 操作反馈标记（Task 72）：true = 神力操作回执（放置失败/编辑确认等「对你的回话」），
   *  只走事件浮层、不联动岁月沙漏脉冲；未标记 = 世界事件（战争/天灾/统一等「世界的搏动」） */
  op?: boolean;
}

/** 音效事件类型 — 引擎通过回调上报，由 WebAudio 模块合成（爆炸/雷击/放置/UI 等） */
export type SoundKind = 'boom' | 'nuke' | 'thunder' | 'distantThunder' | 'place' | 'quake' | 'heal' | 'volcano' | 'blizzard' | 'tsunami' | 'horn' | 'achieve' | 'era' | 'dragon' | 'shield' | 'coin' | 'hydra' | 'phoenix' | 'ent';

/** 地图覆盖模式（顶栏切换）：无 / 政治（王国版图） / 温度 / 湿度 / 人口密度 / 生物群落 */
export type OverlayMode = 'none' | 'political' | 'temperature' | 'moisture' | 'density' | 'biome' | 'alliance';

// ---------------- 世界法则（WorldBox 的 World Laws 面板） ----------------
/** 可由玩家实时开关的模拟规则；随存档保存，也独立持久化到 localStorage */
export interface WorldLaws {
  /** 王国可以宣战（关闭后新战争被阻止，旧战争加速停火） */
  wars: boolean;
  /** 王国扩张领土 */
  cityGrowth: boolean;
  /** 生物繁衍（文明人口与野生动物） */
  reproduction: boolean;
  /** 荒野定期集结强盗团伙 */
  banditRaids: boolean;
  /** 巨龙自然降临世界 */
  dragonSpawns: boolean;
  /** 僵尸咬死的单位转化为僵尸 */
  zombieInfect: boolean;
  /** 僵尸病毒：瘟疫致死的单位有 35% 概率尸变为僵尸（旧档缺字段按 true 处理 —— 由 DEFAULT_LAWS 合并兜底） */
  zombieVirus: boolean;
  /** 亡者复生：自然死亡/战死者小概率化为骷髅 */
  undeadRise: boolean;
  /** 大王国可能爆发叛乱分裂 */
  rebels: boolean;
  // ---------------- 自然引擎法则（板块/大气/四季/天灾） ----------------
  /** 板块构造活跃（地震/造山/裂谷/火山；关闭后地质冻结） */
  tectonics: boolean;
  /** 大气环流与风暴（湿度平流/云雨/气旋；关闭后天空静谧） */
  atmosphere: boolean;
  /** 四季轮转（季节色调/生长火险/冰缘变化；关闭后永夏） */
  seasons: boolean;
  /** 自然灾害自演（气旋登陆/干旱/沙暴/暴风雪/洪水；关闭后只有神力天灾） */
  naturalDisasters: boolean;
}

export const DEFAULT_LAWS: WorldLaws = {
  wars: true,
  cityGrowth: true,
  reproduction: true,
  banditRaids: true,
  dragonSpawns: false,
  zombieInfect: true,
  zombieVirus: true,
  undeadRise: false,
  rebels: true,
  tectonics: true,
  atmosphere: true,
  seasons: true,
  naturalDisasters: true,
};

// ---------------- 物品与装备 ----------------
// 定义与 102 件物品总表已迁移至 items.ts（本文件头部 re-export）

/** 地面物品（待拾取）：位置 + 种类 + 序号 */
export interface GroundItem {
  id: number;
  kind: _ItemKind | string;
  x: number;
  y: number;
}

/** 血迹残留（地面 decal：受击/死亡血溅 — 瞬态不入档，随时间淡出） */
export interface BloodDecal {
  x: number;
  y: number;
  age: number;
  seed: number;
  /** 死亡血泊（大） vs 受击飞溅（小） */
  big: boolean;
}

/** 尸骸残留（骸骨堆 / 蛇怪石化石像 — 瞬态不入档） */
export interface CorpseDecal {
  x: number;
  y: number;
  age: number;
  /** 蛇怪石化凝视：石像而非骸骨 */
  stone: boolean;
  /** 亡灵残骸（暗色骨尘） */
  undead: boolean;
}

// ---------------- 神谕 AI（Oracle LLM，专门打造的 AI 大模型融入） ----------------
/** 神谕模式：史官纪事（编年史叙事）/ 局势研判（战略分析）/ 神谕预言（外推预言）/ 造物工坊（创造模式）/ 自由问答 */
export type OracleMode = 'narrate' | 'analyze' | 'prophesy' | 'create' | 'ask';

/** 神谕会话消息（内存级：面板渲染，切换世界清空） */
export interface OracleMsg {
  id: number;
  /** user = 造物主（玩家）提问；oracle = 神谕回话 */
  role: 'user' | 'oracle';
  text: string;
  /** 触发模式（气泡徽章展示） */
  mode: OracleMode;
  ts: number;
  /** v40：本条神谕回复产生过程中执行的工具事件流（Agent 面板渲染工具卡片） */
  tools?: { name: string; args: unknown; ok: boolean; summary: string }[];
  /** v40：思考流存档（折叠展示；仅深思模式有值） */
  reasoning?: string;
}

/** 神谕 API 请求体（前端 → /api/oracle） */
export interface OracleRequest {
  mode: OracleMode;
  /** 自由问答 / 追问内容（模式按钮触发时可空） */
  question?: string;
  /** buildOracleContext() 产出的世界实况文本（每次请求最新快照） */
  world: string;
  /** 多轮对话历史（近几轮，user/oracle 交替） */
  history?: { role: 'user' | 'oracle'; text: string }[];
}

/** 神谕 API 响应体 */
export interface OracleResponse {
  reply: string;
}

/** 画面效果开关（纯净画面模式） — 存储于引擎，由 UI store 同步并持久化 */
export interface FxPrefs {
  /** 伤害数字（战斗命中时的浮动数字） */
  dmgNumbers: boolean;
  /** 战争前线红闪（交战 tile 的红色脉冲标记） */
  battleFlash: boolean;
  /** 河流水流动画（河道波光澼粼） */
  riverFlow: boolean;
  /** 环境氛围粒子（海岸浪花 / 极地飘雪 / 沙漠扬尘 / 岩浆气泡） */
  ambience: boolean;
  /** 特效密度（0=精简 1=标准 2=华丽）：同屏特效上限，8x 大战防卡顿 */
  fxDensity: 0 | 1 | 2;
  /** 血迹残留（受击/死亡的血溅与地面血痕） */
  blood: boolean;
  /** 尸骨残骸（死亡后短暂留存的骸骨/石像） */
  corpses: boolean;
  /** 单位血条（受损时头顶红条） */
  hpBars: boolean;
  /** 昼夜光影循环（日夜色调/光源辉光/方向阴影/云影；关闭则永昼） */
  dayNight: boolean;
}

/** 存档槽位元信息（轻量索引，避免列槽位时解析 600KB 存档） */
export interface SaveSlotMeta {
  /** 槽位键标识：'slot0'|'slot1'|'slot2'|'auto'|'legacy' */
  key: string;
  savedAt: number;
  source: 'manual' | 'auto' | 'legacy';
  year: number;
  pop: number;
  civs: number;
  tick: number;
  seed: number;
}

// ---------------- 事件触发器（像素级精细化事件控制） ----------------
/**
 * 触发条件：当世界状态满足条件时自动执行指定动作。
 * 所有条件都在引擎的 tick 循环中节流评估（每 8 tick ≈ 0.5 年一次）。
 */
export type TriggerCond =
  /** 世界年份达到 year 年（一次性阈值） */
  | { kind: 'time'; year: number }
  /** 每 years 年周期性触发（第一次在 years 年） */
  | { kind: 'every'; years: number }
  /** 某种族人口达到 count（race = -1 表示总人口；仅统计在世单位） */
  | { kind: 'pop'; race: number; count: number }
  /** 任一王国人口达到 count */
  | { kind: 'kingdomPop'; count: number }
  /** 任一王国领土达到 count 格 */
  | { kind: 'kingdomTiles'; count: number }
  /** 世界战争数达到 count */
  | { kind: 'wars'; count: number }
  /** 燃烧地块达到 count（火势蔓延规模） */
  | { kind: 'fires'; count: number }
  /** 在世单位总数达到 count */
  | { kind: 'unitCount'; count: number }
  /** 有单位进入触发区域（race = -1 表示任意生物；区域 = 中心±半径） */
  | { kind: 'enter'; race: number }
  /** 手动触发（面板按钮，不自动评估） */
  | { kind: 'hand' };

/** 触发器定义：条件 + 动作 + 像素级位置 + 重复策略 */
export interface TriggerDef {
  id: number;
  name: string;
  cond: TriggerCond;
  /** 动作 = 任意工具 id（神力/天灾/地形/生物/宝物，全量复用 applyTool） */
  action: string;
  /** 动作笔刷半径（对 brush 类工具生效） */
  brush: number;
  /** 动作中心（tile 坐标，像素级） */
  x: number;
  y: number;
  /** enter 条件的检测半径（也是地图上虚线圆的可视范围） */
  r: number;
  enabled: boolean;
  /** true = 触发一次后自动销毁 */
  once: boolean;
  /** 已触发次数（统计） */
  fired: number;
  /** 冷却（年）：触发后至少间隔 cd 年才能再次触发 */
  cd: number;
  /** 下一次允许触发的年份（含周期排程与冷却） */
  nextFireYear: number;
}

/** 触发器紧凑存档格式：[id, name, condJson, action, brush, x, y, r, enabled, once, fired, cd, nextFireYear] */
export type TriggerRow = [number, string, string, string, number, number, number, number, number, number, number, number, number];

/** cond.kind → 中文描述（UI 展示用） */
export function describeCond(c: TriggerCond): string {
  switch (c.kind) {
    case 'time': return `世界年份达到 ${c.year} 年`;
    case 'every': return `每 ${c.years} 年周期`;
    case 'pop': return `${c.race === -1 ? '总人口' : RACES[c.race]?.name ?? '?'} 达到 ${c.count}`;
    case 'kingdomPop': return `任一王国人口达到 ${c.count}`;
    case 'kingdomTiles': return `任一王国领土达到 ${c.count} 格`;
    case 'wars': return `战争数达到 ${c.count}`;
    case 'fires': return `燃烧地块达到 ${c.count}`;
    case 'unitCount': return `在世单位达到 ${c.count}`;
    case 'enter': return `有${c.race === -1 ? '生物' : RACES[c.race]?.name ?? '?'}进入区域`;
    case 'hand': return '手动触发';
  }
}

/** cond.kind 标签（表单下拉用） */
export const COND_KINDS: { kind: TriggerCond['kind']; label: string; hint: string }[] = [
  { kind: 'time', label: '年份达到', hint: '世界年份达到指定值时触发（一次性）' },
  { kind: 'every', label: '周期循环', hint: '每 N 年自动触发一次' },
  { kind: 'pop', label: '人口达到', hint: '某种族或总人口达到阈值' },
  { kind: 'kingdomPop', label: '王国人口', hint: '任一王国人口达到阈值' },
  { kind: 'kingdomTiles', label: '王国领土', hint: '任一王国领土格数达到阈值' },
  { kind: 'wars', label: '战争数', hint: '世界战争数达到阈值' },
  { kind: 'fires', label: '火势', hint: '燃烧地块数达到阈值' },
  { kind: 'unitCount', label: '单位总数', hint: '在世单位总数达到阈值' },
  { kind: 'enter', label: '进入区域', hint: '有生物走进触发器虚线圆范围' },
  { kind: 'hand', label: '手动', hint: '仅通过面板按钮触发' },
];

/** 存档数据结构（v1） — 地形 typed array 转 base64，其余为精简 JSON */
export interface SaveDataV1 {
  v: 1;
  savedAt: number;
  source: 'manual' | 'auto';
  seed: number;
  tickCount: number;
  yearF: number;
  unitSeq: number;
  civSeq: number;
  toastSeq: number;
  victoryCiv: number | null;
  multiCivSeen: boolean;
  terrain: string;
  variant: string;
  owner: string;
  building: string;
  fire: string;
  radiate: string;
  regrow: [number, number][];
  radDue: [number, number][];
  units: Unit[];
  civs: Civ[];
  buildings: Building[];
  rel: [string, number][];
  met: string[];
  cam: { x: number; y: number; zoom: number };
  /** 世界纪事（可选字段：兼容旧存档） */
  events?: WorldEvent[];
  eventSeq?: number;
  /** 河道流向场（Uint8Array W*H 的 base64，0=非河，1-8=八方向；可选：兼容旧存档） */
  river?: string;
  /** 世界法则（可选：旧存档回退默认值） */
  laws?: WorldLaws;
  /** 地面物品（可选：[id, kind, x, y] 行式紧凑数组；旧存档无物品） */
  items?: [number, string, number, number][];
  /** 物品序号（可选：兼容旧存档） */
  itemSeq?: number;
  /** 事件触发器（可选：TriggerRow 紧凑行式；旧存档无触发器） */
  triggers?: TriggerRow[];
  /** 触发器序号（可选：兼容旧存档） */
  triggerSeq?: number;
  /** 军团（军队方阵；旧存档无军团 → 空） */
  armies?: Army[];
  /** 军团序号 */
  armySeq?: number;
  /** 战争详情对象（旧存档无 → 从交战关系重建空壳；字段可缺省） */
  warData?: Partial<WarInfo>[];
  /** 动态战线：活跃占领格 [tileIdx, civId, str] */
  front?: [number, number, number][];
  /** 战败耻辱记忆（pairKey → 上次败方 id；复仇宣战依据） */
  warShame?: [string, number][];
  /** 文明旨意（旧存档无 → 空） */
  directives?: Directive[];
  /** 旨意序号 */
  dirSeq?: number;
  /** 物种进化棘轮基线（[race, s, d, h, r, gen, sub?, beh?（逗号连接的涌现特质）]；缺省回退全 1.0） */
  speciesBase?: [number, number, number, number, number, number, string?, string?][];
}

/** 存档数据结构（v2） — RLE 压缩版本：typed array 改为游程编码（值,次数,...）+ base64，
 *  地形类数组大面积同值 → 压缩比 5-10x（500KB → ~60KB）。读档兼容 v1（无 compact 字段时回退 base64） */
export interface SaveDataV2 {
  v: 2;
  /** RLE 压缩的数组：值-次数对交替，Uint16Array 的 base64 */
  terrain: string;
  variant: string;
  /** Int16Array owner 按字节视图 RLE */
  owner: string;
  building: string;
  fire: string;
  radiate: string;
  river?: string;
  /** 道路网络（RLE；旧档缺省 = 无路，新建筑将重新铺设） */
  road?: string;
  /** 世界法则（可选：旧存档回退默认值） */
  laws?: WorldLaws;
  /** 地面物品（[id, kind, x, y] 行式紧凑数组） */
  items?: [number, string, number, number][];
  /** 物品序号 */
  itemSeq?: number;
  /** 事件触发器（TriggerRow 紧凑行式：[id, name, condJson, action, brush, x, y, r, enabled, once, fired, cd, nextFireYear]） */
  triggers?: TriggerRow[];
  /** 触发器序号 */
  triggerSeq?: number;
  /** 军团（军队方阵） */
  armies?: Army[];
  /** 军团序号 */
  armySeq?: number;
  /** 战争详情对象（旧档字段可缺省） */
  warData?: Partial<WarInfo>[];
  /** 动态战线：活跃占领格 [tileIdx, civId, str] */
  front?: [number, number, number][];
  /** 战败耻辱记忆 */
  warShame?: [string, number][];
  /** 文明旨意 */
  directives?: Directive[];
  /** 旨意序号 */
  dirSeq?: number;
  /** 物种进化棘轮基线（[race, s, d, h, r, gen, sub?, beh?（逗号连接的涌现特质）]；缺省回退全 1.0） */
  speciesBase?: [number, number, number, number, number, number, string?, string?][];
  /** 终极世界大战状态（缺省 = 未打响） */
  worldWar?: WorldWarState;
  /** 大战停战协议表（pairKey → 休战截止 tick） */
  wwTruce?: [string, number][];
  /** 涌现层（动态物种 + 涌现武器；旧档缺省 = 空） */
  dyn?: {
    /** 动态物种行：[id, 名称, 父种族(体形族系锚), hp, dmg, speed, repro, tintIdx, visTuple?, parent2?, eco?, cap?, maxAge?, flags?]（vis = 视觉基因组 13 元组；parent2 = 融合副父，0/缺省 = 非融合种；
     *  v5 扩展：eco = 生态角色锚 0无/1捕食/2食草/3中立；cap = 野生种群上限；maxAge = 寿限；flags = bit0文明 bit1敌意 bit2捕食——全新造物无血统链时的裁决依据） */
    races: [number, string, number, number, number, number, number, number, number[]?, number?, number?, number?, number?, number?][];
    /** 涌现武器全量（含退役谱系） */
    weapons: EmergentWeapon[];
    /** 序号接力（避免读档后 id 撞车） */
    dynSeq: number;
    weapSeq: number;
    /** 军备学说行（武器架构 v2）：[civId, 精确, 饱和, 恐吓, 消耗]（旧档缺省 = 均匀分布） */
    dctr?: [number, number, number, number, number][];
    /** 防御套件行（武器架构 v2）：[civId, 点防, 装甲, 疏散]（旧档缺省 = 零） */
    ddef?: [number, number, number, number][];
    /** v3：涌现特质注册表行 [key, name, dmgMul×100, hpMul×100, speedMul×100, regen×1000]（旧档缺省 = 无） */
    trts?: [string, string, number, number, number, number][];
    /** v3：特质序号接力 */
    traitSeq?: number;
  };
  /** v3：涌现科技注册表 [key, name, catIdx, cost, gen, effectsCsv("k:v,...")] */
  emT?: [string, string, number, number, number, string][];
  /** v3：涌现社会理念注册表 [key, name, desc, modsCsv("gold:0.2,stab:3,...")] */
  emI?: [string, string, string, string][];
  /** v3：进化图谱节点行 [id, kindIdx(0物种1武器2科技3特质4理念), year, parentNodeId(-1无), name, colorHex, detail, stat, alive(0/1)] */
  evo?: [number, number, number, number, string, string, string, string, number, string][];
  /** v3：图谱序号接力 */
  evoSeq?: number;
  /** v39：涌现社会内核——家族谱系注册表行 [id, 姓氏, 种族, 立族年, 先祖, 现存族人, 英雄, 累计击杀, 峰值, 里程碑]（旧档缺省 = 空表） */
  fams?: [number, string, number, number, string, number, number, number, number, number][];
  /** v39：家族序号接力 */
  familySeq?: number;
  /** v40：神谕 Agent 法则注册表（热载机制的完整状态；旧档缺省 = 无法则） */
  alws?: AgentLaw[];
  /** v40：法则序号接力 */
  alwsSeq?: number;
  /** v41：机制自定义计数器（counter 动作维护、条件 DSL 读取；旧档缺省 = 空） */
  alwsCounters?: Record<string, number>;
  /** 自然引擎持久化（板块由 seed 确定性重生成，只存动态量；旧档缺省 = 全新自然） */
  nat?: {
    /** 边界应力稀疏行（[tileIdx, 量化 0-255]；只存 >0 的边界格） */
    stress: [number, number][];
    /** 风暴行：[id, x, y, strength, ttl, seed, kind(0 气旋/1 冰暴), nameIdx, landed(0/1)] */
    storms: [number, number, number, number, number, number, number, number, number][];
    /** 火山灰遮蔽度 0-1 */
    ash: number;
    /** 季节偏移（devNextSeason 累计） */
    seasonOffset: number;
    /** 地质计数行：[地震, 强震, 喷发, 造山, 侵蚀, 气旋, 海啸, 洪水, 暴雪, 干旱] */
    counters: number[];
    /** 风暴命名序号接力 */
    stormSeq: number;
    /** v2：板块种子质心当前位置（缺失 = seed 初始位——旧档兼容） */
    pcx?: number[];
    pcy?: number[];
    /** v2：火山热点 [x, y, heat]（缺失 = seed 重选） */
    hot?: [number, number, number][];
    /** v2：灰烬平流场稀疏行 [cellIdx, 量化 0-200]（缺失 = 全局标量均匀播撒） */
    ashF?: [number, number][];
    /** v2：构造期接力（板块重算相位） */
    pe?: number;
  };
  /** v4：联盟系统 —— 联盟行 [id, name, membersCsv("1,2,3"), leader, cohesion, formedTick, formedYear, warsTogether, colorHex, bonded]（旧档缺省 = 无联盟/未缔结纽带） */
  als?: [number, string, string, number, number, number, number, number, string, number][];
  /** v4：联盟序号接力 */
  allianceSeq?: number;
  /** v4：动态种族关系矩阵 [racePairKey("a-b"), value]（预设基线之外的漂移量；旧档缺省 = 纯基线） */
  rrel?: [string, number][];
  /** v5：造物工坊——内置种族原地覆写行 [raceId, patchJson]（世界内编辑持久化；仅 id<100） */
  rmods?: [number, string][];
  /** v5：内置物品原地覆写行 [kind, patchJson]（宝物栏全元素可编辑的持久化） */
  imods?: [string, string][];
  /** v5：图鉴注册重链 [uid, raceId]（读档后放置面板 cre: 工具 → 恢复后的动态种族 id） */
  creg?: [string, number][];
  /** 与 v1 相同的其余字段 */
  savedAt: number;
  source: 'manual' | 'auto';
  seed: number;
  tickCount: number;
  yearF: number;
  unitSeq: number;
  civSeq: number;
  toastSeq: number;
  victoryCiv: number | null;
  multiCivSeen: boolean;
  regrow: [number, number][];
  radDue: [number, number][];
  /** v2：单位紧凑格式 [header, ...rows]（列式布局，键名只存一次，体积减半）；缺省回退 units 字段（v1） */
  u?: unknown[][];
  units: Unit[];
  civs: Civ[];
  buildings: Building[];
  rel: [string, number][];
  met: string[];
  cam: { x: number; y: number; zoom: number };
  events?: WorldEvent[];
  eventSeq?: number;
}

/** v1/v2 统一存档类型（读档入口接受两者） */
export type SaveData = SaveDataV1 | SaveDataV2;
