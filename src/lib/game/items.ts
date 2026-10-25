// ============ WorldBox Items — 100+ 物品系统 ============
// 纯数据模块（零依赖）：物品定义 / 稀有度 / 掉落 / 图标生成。
// 图标使用模板位图 + 稀有度调色板（q/u/i/x/a 字符映射在 constants.PIX 注册）。

export type ItemSlot = 'wep' | 'arm' | 'hlm' | 'shd' | 'bts' | 'rng' | 'amu';
export type ItemKind = string;

export interface ItemDef {
  key: string;
  name: string;
  slot: ItemSlot;
  /** 同槽位强度序（拾取时高序替换低序） */
  rank: number;
  /** 稀有度 0普通 1精良 2稀有 3史诗 4传说（影响掉率与配色） */
  rarity: number;
  /** 图标形制 */
  art: string;
  /** 伤害加成（直接加进单位攻击力） */
  dmg?: number;
  /** 生命上限加成 */
  hp?: number;
  /** 速度倍率（<1 减速） */
  speedMul?: number;
  /** 每刻再生 */
  regen?: number;
  /** 减伤百分比（多件叠加，引擎内封顶 60%） */
  armor?: number;
  /** 暴击率百分比（暴击 2.2 倍伤害） */
  crit?: number;
  /** 吸血百分比（按造成伤害回血） */
  lifesteal?: number;
  /** 反伤：攻击者受到的固定伤害 */
  thorns?: number;
  /** 远程射程（弓/杖：佩带者获得远程攻击） */
  ranged?: number;
  desc: string;
}

export const SLOT_ORDER: ItemSlot[] = ['wep', 'arm', 'hlm', 'shd', 'bts', 'rng', 'amu'];
export const SLOT_NAMES: Record<ItemSlot, string> = {
  wep: '武器', arm: '护甲', hlm: '头盔', shd: '盾牌', bts: '靴子', rng: '戒指', amu: '护符',
};
/** 单位装备槽字段名（Unit 上对应字段） */
export const SLOT_FIELD: Record<ItemSlot, 'wep' | 'arm' | 'hlm' | 'shd' | 'bts' | 'rng' | 'amu'> = {
  wep: 'wep', arm: 'arm', hlm: 'hlm', shd: 'shd', bts: 'bts', rng: 'rng', amu: 'amu',
};

export const RARITY_META = [
  { name: '普通', color: '#a8a29e', w: 46 },
  { name: '精良', color: '#6fd66f', w: 26 },
  { name: '稀有', color: '#5ba8e0', w: 15 },
  { name: '史诗', color: '#b56cf0', w: 9 },
  { name: '传说', color: '#ffb020', w: 4 },
] as const;

// ------------------------------------------------------------------
// 物品总表：[key, name, slot, rank, rarity, art, stats]
// rank = 同槽强度序；stats 见 ItemDef。
// 注意：保留旧存档键 sword1/sword2/sword3/armor1/armor2/boots/ring。
// ------------------------------------------------------------------
type Stats = Partial<Pick<ItemDef, 'dmg' | 'hp' | 'speedMul' | 'regen' | 'armor' | 'crit' | 'lifesteal' | 'thorns' | 'ranged'>>;
type Row = [string, string, ItemSlot, number, number, string, Stats];

const TABLE: Row[] = [
  // ---------- 武器：剑 ----------
  ['sword1', '锈蚀短剑', 'wep', 1, 0, 'sword', { dmg: 5 }],
  ['sword2', '铁铸长剑', 'wep', 2, 0, 'sword', { dmg: 11 }],
  ['sword3', '黄金圣剑', 'wep', 3, 3, 'sword', { dmg: 18, crit: 5 }],
  ['wood_club', '粗木棒', 'wep', 0, 0, 'axe', { dmg: 2 }],
  ['iron_dagger', '铁匕首', 'wep', 1, 0, 'sword', { dmg: 6, crit: 8, speedMul: 1.04 }],
  ['katana', '武士刀', 'wep', 3, 2, 'sword', { dmg: 16, crit: 12, speedMul: 1.05 }],
  ['elf_blade', '精灵之刃', 'wep', 3, 2, 'sword', { dmg: 15, speedMul: 1.08 }],
  ['flame_sword', '烈焰之剑', 'wep', 4, 3, 'sword', { dmg: 22, thorns: 6 }],
  ['ice_sword', '寒冰之剑', 'wep', 4, 3, 'sword', { dmg: 21, armor: 6 }],
  ['excalibur', '王者之剑', 'wep', 6, 4, 'sword', { dmg: 34, crit: 10 }],
  ['holy_sword', '圣光之剑', 'wep', 5, 3, 'sword', { dmg: 26, regen: 0.4 }],
  // ---------- 武器：斧/锤 ----------
  ['battle_axe', '战斧', 'wep', 2, 0, 'axe', { dmg: 14, speedMul: 0.96 }],
  ['warhammer', '战锤', 'wep', 3, 1, 'axe', { dmg: 17, speedMul: 0.95 }],
  ['berserker_axe', '狂战士巨斧', 'wep', 4, 2, 'axe', { dmg: 24, speedMul: 0.93 }],
  ['executioner_axe', '刽子手巨斧', 'wep', 5, 2, 'axe', { dmg: 28, crit: 8 }],
  ['thunder_hammer', '雷神之锤', 'wep', 5, 4, 'axe', { dmg: 30, crit: 15 }],
  ['storm_hammer', '风暴之锤', 'wep', 4, 3, 'axe', { dmg: 23, thorns: 8 }],
  ['pickaxe', '矿工镐', 'wep', 1, 0, 'axe', { dmg: 6 }],
  // ---------- 武器：矛/枪 ----------
  ['hunting_spear', '猎人矛', 'wep', 2, 0, 'sword', { dmg: 12 }],
  ['dragon_fang', '龙牙枪', 'wep', 4, 3, 'sword', { dmg: 23, crit: 6 }],
  ['dual_blades', '双刃', 'wep', 3, 2, 'sword', { dmg: 18, crit: 10, speedMul: 1.06 }],
  ['scythe', '死神镰刀', 'wep', 5, 4, 'axe', { dmg: 26, lifesteal: 20 }],
  ['dragon_slayer', '屠龙巨刃', 'wep', 5, 4, 'sword', { dmg: 30 }],
  // ---------- 武器：弓 ----------
  ['short_bow', '短弓', 'wep', 1, 0, 'bow', { dmg: 3, ranged: 4.5 }],
  ['long_bow', '长弓', 'wep', 2, 1, 'bow', { dmg: 6, ranged: 5.5 }],
  ['crossbow', '重弩', 'wep', 3, 1, 'bow', { dmg: 9, ranged: 5.5 }],
  ['elf_bow', '精灵长弓', 'wep', 3, 2, 'bow', { dmg: 8, ranged: 6.5 }],
  ['eagle_bow', '鹰眼神弓', 'wep', 4, 3, 'bow', { dmg: 11, ranged: 7.5, crit: 8 }],
  ['hunt_bow', '猎人角弓', 'wep', 2, 0, 'bow', { dmg: 5, ranged: 5 }],
  // ---------- 武器：火器（工业时代军备） ----------
  ['musket', '燧发火枪', 'wep', 4, 2, 'gun', { dmg: 19, ranged: 6.5, crit: 6 }],
  ['rifle', '线膛步枪', 'wep', 5, 3, 'gun', { dmg: 20, ranged: 7.5, crit: 8 }],
  // ---------- 武器：未来武器（未来时代军备） ----------
  ['laser_rifle', '相位光束枪', 'wep', 6, 4, 'gun', { dmg: 28, ranged: 9, crit: 10 }],
  ['plasma_caster', '等离子投射器', 'wep', 7, 4, 'gun', { dmg: 34, ranged: 8.5, crit: 12 }],
  // ---------- 武器：法杖 ----------
  ['wood_staff', '学徒木杖', 'wep', 1, 0, 'staff', { dmg: 3, ranged: 4.5 }],
  ['mage_staff', '法师权杖', 'wep', 2, 1, 'staff', { dmg: 6, ranged: 5.5 }],
  ['storm_staff', '风暴法杖', 'wep', 4, 3, 'staff', { dmg: 12, ranged: 6.5, crit: 6 }],
  ['archmage_staff', '大魔导师杖', 'wep', 5, 4, 'staff', { dmg: 15, ranged: 7.5, crit: 10 }],
  // ---------- 护甲 ----------
  ['armor1', '皮革护甲', 'arm', 1, 0, 'armor', { hp: 18 }],
  ['armor2', '钢铁重甲', 'arm', 2, 1, 'armor', { hp: 36, speedMul: 0.97 }],
  ['cloth_robe', '粗布袍', 'arm', 0, 0, 'armor', { hp: 6 }],
  ['studded_leather', '镶钉皮甲', 'arm', 2, 0, 'armor', { hp: 26, armor: 4 }],
  ['chain_mail', '锁子甲', 'arm', 3, 1, 'armor', { hp: 40, armor: 8 }],
  ['iron_plate', '铁板甲', 'arm', 3, 1, 'armor', { hp: 48, armor: 10, speedMul: 0.95 }],
  // ---------- 护甲：未来（未来时代军备） ----------
  ['energy_shield', '能量护盾', 'arm', 6, 4, 'armor', { hp: 68, armor: 20, speedMul: 1.02 }],
  ['gold_armor', '黄金铠甲', 'arm', 4, 2, 'armor', { hp: 55, armor: 12 }],
  ['dragon_scale', '龙鳞甲', 'arm', 5, 4, 'armor', { hp: 75, armor: 18, thorns: 6 }],
  ['mithril_mail', '秘银锁甲', 'arm', 5, 3, 'armor', { hp: 62, armor: 16, speedMul: 1.03 }],
  ['shadow_cloak', '暗影斗篷', 'arm', 3, 2, 'armor', { hp: 30, speedMul: 1.12 }],
  ['berserker_hide', '狂战士皮', 'arm', 2, 0, 'armor', { hp: 30, dmg: 4 }],
  ['elf_robe', '精灵长袍', 'arm', 3, 2, 'armor', { hp: 28, regen: 0.4 }],
  ['bone_armor', '白骨战甲', 'arm', 3, 1, 'armor', { hp: 44, armor: 6, thorns: 5 }],
  ['obsidian_shell', '黑曜石甲', 'arm', 4, 3, 'armor', { hp: 60, armor: 15 }],
  ['holy_vestment', '圣袍', 'arm', 4, 2, 'armor', { hp: 38, regen: 0.8 }],
  ['emperor_robe', '帝王华服', 'arm', 5, 3, 'armor', { hp: 70, armor: 10, crit: 5 }],
  // ---------- 头盔 ----------
  ['leather_cap', '皮帽', 'hlm', 1, 0, 'helm', { hp: 6 }],
  ['archer_cap', '猎手帽', 'hlm', 1, 0, 'helm', { hp: 5, speedMul: 1.05 }],
  ['iron_helm', '铁盔', 'hlm', 2, 0, 'helm', { hp: 14, armor: 4 }],
  ['horned_helm', '兽角盔', 'hlm', 2, 0, 'helm', { hp: 12, dmg: 3 }],
  ['wizard_hat', '法师尖帽', 'hlm', 2, 1, 'helm', { hp: 8, crit: 6 }],
  ['knight_helm', '骑士全盔', 'hlm', 3, 1, 'helm', { hp: 22, armor: 8 }],
  ['warlock_hood', '术士兜帽', 'hlm', 3, 2, 'helm', { hp: 12, crit: 10 }],
  ['viking_helm', '维京战盔', 'hlm', 3, 1, 'helm', { hp: 20, armor: 5, dmg: 4 }],
  ['skull_mask', '骷髅面甲', 'hlm', 3, 1, 'helm', { hp: 18, armor: 6, thorns: 6 }],
  ['gold_crown', '黄金王冠', 'hlm', 3, 2, 'helm', { hp: 16, dmg: 4 }],
  ['dragon_skull', '龙骨冠', 'hlm', 4, 3, 'helm', { hp: 30, armor: 10, dmg: 6 }],
  ['crown_kings', '王者之冠', 'hlm', 5, 4, 'helm', { hp: 26, dmg: 8, crit: 8 }],
  // ---------- 盾牌 ----------
  ['round_shield', '圆木盾', 'shd', 0, 0, 'shield', { armor: 4 }],
  ['wood_shield', '木盾', 'shd', 1, 0, 'shield', { armor: 6 }],
  ['kite_shield', '鸢形盾', 'shd', 2, 0, 'shield', { armor: 10, hp: 8 }],
  ['spiked_shield', '刺击盾', 'shd', 2, 0, 'shield', { armor: 8, thorns: 12 }],
  ['iron_shield', '铁盾', 'shd', 2, 1, 'shield', { armor: 12, hp: 10 }],
  ['tower_shield', '塔盾', 'shd', 3, 1, 'shield', { armor: 18, hp: 16, speedMul: 0.95 }],
  ['gold_shield', '黄金盾', 'shd', 4, 2, 'shield', { armor: 20, hp: 12 }],
  ['holy_aegis', '神圣庇护盾', 'shd', 4, 3, 'shield', { armor: 22, regen: 0.5 }],
  ['mithril_shield', '秘银盾', 'shd', 5, 3, 'shield', { armor: 24, speedMul: 1.02 }],
  ['dragon_shield', '龙纹盾', 'shd', 5, 4, 'shield', { armor: 26, hp: 20, thorns: 8 }],
  // ---------- 靴子 ----------
  ['worn_sandal', '破旧凉鞋', 'bts', 0, 0, 'boots', { speedMul: 1.05 }],
  ['leather_boots', '皮靴', 'bts', 1, 0, 'boots', { speedMul: 1.15 }],
  ['boots', '迅捷之靴', 'bts', 2, 1, 'boots', { speedMul: 1.35 }],
  ['mountain_boots', '登山靴', 'bts', 2, 0, 'boots', { speedMul: 1.1, hp: 6 }],
  ['war_greaves', '战争胫甲', 'bts', 2, 1, 'boots', { hp: 14, speedMul: 1.2, armor: 3 }],
  ['iron_boots', '铁靴', 'bts', 2, 0, 'boots', { hp: 10, armor: 4, speedMul: 1.05 }],
  ['swift_greaves', '疾风胫甲', 'bts', 3, 2, 'boots', { speedMul: 1.5 }],
  ['lava_boots', '熔岩之靴', 'bts', 4, 3, 'boots', { speedMul: 1.3, armor: 8 }],
  ['winged_sandals', '神行凉鞋', 'bts', 4, 3, 'boots', { speedMul: 1.65 }],
  ['phantom_boots', '幻影之靴', 'bts', 5, 4, 'boots', { speedMul: 1.8, crit: 6 }],
  // ---------- 戒指 ----------
  ['copper_ring', '铜戒指', 'rng', 1, 0, 'ring', { dmg: 3 }],
  ['silver_ring', '银戒', 'rng', 1, 0, 'ring', { hp: 8 }],
  ['ring', '再生之戒', 'rng', 2, 1, 'ring', { regen: 0.4 }],
  ['gold_ring', '黄金戒指', 'rng', 2, 0, 'ring', { hp: 16 }],
  ['ruby_ring', '红宝石之戒', 'rng', 3, 1, 'ring', { dmg: 8 }],
  ['sapphire_ring', '蓝宝石之戒', 'rng', 3, 1, 'ring', { armor: 8 }],
  ['ring_power', '力量之戒', 'rng', 3, 2, 'ring', { dmg: 10, hp: 10 }],
  ['ring_fire', '烈焰之戒', 'rng', 4, 3, 'ring', { dmg: 12, thorns: 8 }],
  ['ring_ice', '寒冰之戒', 'rng', 4, 3, 'ring', { armor: 10, crit: 8 }],
  ['ring_sage', '贤者之戒', 'rng', 4, 3, 'ring', { crit: 12, regen: 0.3 }],
  ['ring_void', '虚空指环', 'rng', 5, 4, 'ring', { dmg: 14, crit: 10 }],
  ['ring_immortal', '不朽之戒', 'rng', 6, 4, 'ring', { regen: 1.2, hp: 20 }],
  // ---------- 护符 ----------
  ['lucky_charm', '幸运符', 'amu', 1, 0, 'amulet', { crit: 5 }],
  ['wolf_fang', '狼牙坠', 'amu', 1, 0, 'amulet', { dmg: 4 }],
  ['bear_claw', '熊爪链', 'amu', 2, 0, 'amulet', { dmg: 6, hp: 8 }],
  ['totem_stone', '图腾石', 'amu', 2, 1, 'amulet', { armor: 6, thorns: 6 }],
  ['eagle_eye', '鹰眼石', 'amu', 2, 1, 'amulet', { crit: 8 }],
  ['vampire_fang', '吸血獠牙', 'amu', 3, 2, 'amulet', { lifesteal: 15 }],
  ['holy_symbol', '圣徽', 'amu', 3, 1, 'amulet', { regen: 0.5 }],
  ['moon_pendant', '月亮坠饰', 'amu', 3, 2, 'amulet', { hp: 20, speedMul: 1.08 }],
  ['demon_heart', '恶魔之心', 'amu', 4, 3, 'amulet', { dmg: 14, lifesteal: 10 }],
  ['phoenix_feather', '凤凰羽', 'amu', 4, 3, 'amulet', { regen: 1.0 }],
  ['doom_amulet', '末日坠饰', 'amu', 5, 4, 'amulet', { dmg: 16, hp: 16 }],
  ['god_shard', '神之碎片', 'amu', 6, 4, 'amulet', { dmg: 12, hp: 24, regen: 0.8, crit: 10, lifesteal: 10 }],
];

function statText(s: Stats): string {
  const parts: string[] = [];
  if (s.dmg) parts.push(`伤害 +${s.dmg}`);
  if (s.hp) parts.push(`生命 +${s.hp}`);
  if (s.speedMul && s.speedMul !== 1) parts.push(`速度 ${s.speedMul > 1 ? '+' : ''}${Math.round((s.speedMul - 1) * 100)}%`);
  if (s.armor) parts.push(`减伤 ${s.armor}%`);
  if (s.crit) parts.push(`暴击 ${s.crit}%`);
  if (s.lifesteal) parts.push(`吸血 ${s.lifesteal}%`);
  if (s.thorns) parts.push(`反伤 ${s.thorns}`);
  if (s.regen) parts.push(`再生 ${s.regen}`);
  if (s.ranged) parts.push(`射程 ${s.ranged} 格`);
  return parts.join(' · ');
}

export const ITEM_DEFS: Record<string, ItemDef> = {};
export const ITEMS_BY_SLOT: Record<ItemSlot, ItemDef[]> = { wep: [], arm: [], hlm: [], shd: [], bts: [], rng: [], amu: [] };

for (const [key, name, slot, rank, rarity, art, stats] of TABLE) {
  const def: ItemDef = { key, name, slot, rank, rarity, art, ...stats, desc: statText(stats) };
  ITEM_DEFS[key] = def;
  ITEMS_BY_SLOT[slot].push(def);
}
for (const slot of SLOT_ORDER) ITEMS_BY_SLOT[slot].sort((a, b) => a.rank - b.rank || a.rarity - b.rarity);

export const ITEM_COUNT = TABLE.length;
export const ALL_ITEMS: ItemDef[] = TABLE.map(([key]) => ITEM_DEFS[key]);

/** 每槽位最高阶物品（开发者模式「赐神装」用） */
export const BEST_BY_SLOT: Record<ItemSlot, string> = {} as Record<ItemSlot, string>;
for (const slot of SLOT_ORDER) {
  const list = ITEMS_BY_SLOT[slot];
  BEST_BY_SLOT[slot] = list[list.length - 1]?.key ?? '';
}

/** 按稀有度加权随机一件物品。minRarity/maxRarity 用于宝箱分档 */
export function rollItem(rng: () => number, opts?: { minRarity?: number; maxRarity?: number }): ItemKind {
  const min = opts?.minRarity ?? 0;
  const max = opts?.maxRarity ?? 4;
  let total = 0;
  const pool: { k: ItemDef; w: number }[] = [];
  for (const def of ALL_ITEMS) {
    if (def.rarity < min || def.rarity > max) continue;
    const w = RARITY_META[def.rarity].w;
    pool.push({ k: def, w });
    total += w;
  }
  if (pool.length === 0) return 'sword1';
  let r = rng() * total;
  for (const p of pool) { r -= p.w; if (r <= 0) return p.k.key; }
  return pool[pool.length - 1].k.key;
}

// ------------------------------------------------------------------
// 图标生成：模板位图（'1' 主材质 '2' 副材质）× 稀有度调色字符
// q/Q=普通 u/U=精良 i/I=稀有 x/X=史诗 a/A=传说（注册于 constants.PIX）
// ------------------------------------------------------------------
const RARITY_CHARS = ['q', 'u', 'i', 'x', 'a'];

const ART_TEMPLATES: Record<string, string[]> = {
  sword: [
    '.....1..',
    '....11..',
    '...11...',
    '..11....',
    '.11.....',
    '.2k.....',
    '2.......',
    '........',
  ],
  axe: [
    '..111...',
    '.1111...',
    '.11k11..',
    '...1....',
    '...2....',
    '...2....',
    '...2....',
    '........',
  ],
  bow: [
    '...11...',
    '..1..1..',
    '..1...1.',
    '.1....1.',
    '.1....1.',
    '..1...1.',
    '..1..1..',
    '...11...',
  ],
  staff: [
    '....1...',
    '...111..',
    '....1...',
    '....2...',
    '....2...',
    '....2...',
    '....2...',
    '...2....',
  ],
  gun: [
    '...111..',
    '..111111',
    '...11...',
    '...2....',
    '...2....',
    '..12....',
    '........',
    '........',
  ],
  armor: [
    '........',
    '.11..11.',
    '.111111.',
    '.111111.',
    '.221122.',
    '..1111..',
    '..1221..',
    '........',
  ],
  helm: [
    '........',
    '..1111..',
    '.111111.',
    '.111111.',
    '.11..11.',
    '.1k11k1.',
    '..1111..',
    '........',
  ],
  shield: [
    '........',
    '.111111.',
    '.122221.',
    '.111111.',
    '.111111.',
    '..1111..',
    '...11...',
    '........',
  ],
  boots: [
    '........',
    '...11...',
    '...11...',
    '...11...',
    '...11...',
    '...111..',
    '..1111..',
    '........',
  ],
  ring: [
    '........',
    '...11...',
    '..1..1..',
    '..1..1..',
    '..1..1..',
    '...11...',
    '...2....',
    '........',
  ],
  amulet: [
    '...11...',
    '....1...',
    '...111..',
    '..11111.',
    '..12121.',
    '..11111.',
    '...111..',
    '........',
  ],
};

/** 为全部物品生成 8x8 图标（constants 在模块初始化时合并进 ICONS） */
export function buildItemIcons(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const def of ALL_ITEMS) {
    const tpl = ART_TEMPLATES[def.art] ?? ART_TEMPLATES.sword;
    const primary = RARITY_CHARS[def.rarity];
    const secondary = primary.toUpperCase();
    out[def.key] = tpl.map((row) => row.replace(/1/g, primary).replace(/2/g, secondary));
  }
  return out;
}
