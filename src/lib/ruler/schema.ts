// ============ 统治者议会 · 意图 Schema（六步之第 2 步） ============
// 每个白名单动作的参数契约：类型 / 范围 / 枚举 / 缺省。
// parse.ts 据此规范化 AI 输出；executor.ts 据此做执行前二次校验；
// prompt.ts 据此自动生成权柄清单（第 6 步天然同步）。
// 【硬约束】schema 里永远不出现 x/y/id/region_id 类字段——AI 不输出坐标与 ID。
import type { RulerAction } from './types';

export interface ArgSpec {
  type: 'string' | 'number' | 'boolean';
  desc: string;
  required?: boolean;
  /** string 枚举合法值（AI 可语义选择，代码解析） */
  enum?: readonly string[];
  /** number 范围（含端点） */
  min?: number;
  max?: number;
  /** 缺省值（AI 可省略） */
  def?: string | number | boolean;
}

export type IntentSchema = Record<string, ArgSpec>;

/** 天罚神力枚举（与执行器 executor.ts 的 STRIKE_EXEC 保持同步） */
export const STRIKE_POWERS = [
  'meteor', 'meteor_shower', 'lightning', 'fire', 'plague', 'quake', 'volcano', 'tornado',
  'tsunami', 'flood', 'drought', 'blizzard', 'sandstorm', 'acid_rain', 'locust', 'famine',
  'ice_age', 'sinkhole', 'blackhole', 'typhoon', 'wrath', 'curse', 'boom', 'nuke',
] as const;

/** 宣战理由（与引擎 CasusKind 对齐） */
export const WAR_REASONS = ['border', 'conquest', 'plunder', 'revenge', 'annex', 'unify', 'holy', 'alliance'] as const;

/** 国策旨意（与引擎 DirectiveKind 对齐） */
export const DIRECTIVE_KINDS = [
  'annihilate', 'conquer', 'expand', 'wealth', 'wisdom', 'populate',
  'legion', 'build', 'unify', 'mobilize', 'alliance', 'temple',
] as const;

/** 造物体形族系（与引擎 spawnCustomSpecies 的 FORM_KEYS 对齐） */
export const SPECIES_FORMS = ['human', 'wolf', 'bear', 'snake', 'deer', 'camel', 'scorpion', 'sheep', 'penguin', 'dragon'] as const;

/** 塑地地形（内政向：不含焦土/岩浆等毁灭性地形） */
export const TERRAFORM_KINDS = ['water', 'grass', 'forest', 'hill', 'mountain', 'sand', 'snow'] as const;

/** 天赐领域 */
export const BOOST_KINDS = ['gold', 'knowledge'] as const;

const PLACE_SPEC: ArgSpec = { type: 'string', desc: '地名（必须引用实况里的锚点名或列国名，如「冬堡」「北境火场」）', required: true };
const SIZE_SPEC: ArgSpec = { type: 'number', desc: '作用范围 1-3（小/中/大）', min: 1, max: 3, def: 2 };

export const INTENT_SCHEMA: Record<RulerAction, IntentSchema> = {
  declare_war: {
    a: { type: 'string', desc: '宣战国名', required: true },
    b: { type: 'string', desc: '被宣战国名', required: true },
    reason: { type: 'string', desc: '开战理由', enum: WAR_REASONS, def: 'conquest' },
  },
  make_peace: {
    a: { type: 'string', desc: '议和国 A', required: true },
    b: { type: 'string', desc: '议和国 B', required: true },
  },
  form_alliance: {
    a: { type: 'string', desc: '盟国 A', required: true },
    b: { type: 'string', desc: '盟国 B', required: true },
  },
  issue_directive: {
    kingdom: { type: 'string', desc: '受旨王国', required: true },
    kind: { type: 'string', desc: '旨意种类', enum: DIRECTIVE_KINDS, required: true },
    target: { type: 'string', desc: '目标国名（灭国令/攻城令/联盟令需要）' },
    param: { type: 'number', desc: '数量目标（扩张/富国等令的指标，缺省由引擎定）', min: 0, max: 999999 },
  },
  divine_strike: {
    power: { type: 'string', desc: '神力', enum: STRIKE_POWERS, required: true },
    place: PLACE_SPEC,
    scale: { type: 'number', desc: '威力 1-3', min: 1, max: 3, def: 2 },
  },
  heal_land: {
    place: PLACE_SPEC,
    size: SIZE_SPEC,
  },
  bless_land: {
    place: PLACE_SPEC,
    size: SIZE_SPEC,
  },
  spawn_species: {
    name: { type: 'string', desc: '新物种名（≤8 字）', required: true },
    form: { type: 'string', desc: '体形族系', enum: SPECIES_FORMS, required: true },
    archetype: { type: 'string', desc: '一句神话背景（≤24 字）' },
    predator: { type: 'boolean', desc: '是否掠食者' },
    hostile: { type: 'boolean', desc: '是否敌对文明' },
    hp: { type: 'number', desc: '生命 4-900', min: 4, max: 900 },
    dmg: { type: 'number', desc: '攻击 1-80', min: 1, max: 80 },
    speed: { type: 'number', desc: '速度 0.02-0.2', min: 0.02, max: 0.2 },
    maxAge: { type: 'number', desc: '寿限 8-400', min: 8, max: 400 },
    cap: { type: 'number', desc: '种群上限 4-120', min: 4, max: 120 },
    hue: { type: 'number', desc: '色相偏移 -180-180', min: -180, max: 180 },
    size: { type: 'number', desc: '体型倍率 0.5-2', min: 0.5, max: 2 },
    horns: { type: 'number', desc: '角数 0-2', min: 0, max: 2 },
    glow: { type: 'boolean', desc: '发光' },
    count: { type: 'number', desc: '降临数量 1-10', min: 1, max: 10, def: 4 },
    place: { type: 'string', desc: '降临地（省略=随机沃土）' },
  },
  hybridize: {
    a: { type: 'string', desc: '物种 A 名', required: true },
    b: { type: 'string', desc: '物种 B 名', required: true },
  },
  spawn_creatures: {
    race: { type: 'string', desc: '物种名（既有物种）', required: true },
    count: { type: 'number', desc: '数量 1-24', min: 1, max: 24, def: 6 },
    place: { type: 'string', desc: '放生地（省略=随机沃土）' },
  },
  boost_kingdom: {
    kingdom: { type: 'string', desc: '受赐王国', required: true },
    what: { type: 'string', desc: '天赐领域', enum: BOOST_KINDS, required: true },
    amount: { type: 'number', desc: '数额 20-400', min: 20, max: 400, def: 100 },
  },
  terraform: {
    terrain: { type: 'string', desc: '目标地形', enum: TERRAFORM_KINDS, required: true },
    place: PLACE_SPEC,
    size: SIZE_SPEC,
  },
};

/** 禁止字段（AI 输出这些 = 意图整条拒绝——坐标/ID/工具名必须留在代码层） */
export const FORBIDDEN_KEYS = ['x', 'y', 'id', 'region_id', 'regionId', 'civ_id', 'civId', 'tool', 'tool_name', 'toolName', 'radius'] as const;

/** 枚举的中文注解（提示词自动生成用；与执行器口径一致） */
export const ENUM_LABELS: Record<string, Record<string, string>> = {
  reason: {
    border: '边境摩擦', conquest: '征服扩张', plunder: '劫掠战利', revenge: '血仇复仇',
    annex: '灭国吞并', unify: '统一天下', holy: '圣战讨伐', alliance: '盟约召唤',
  },
  kind: {
    annihilate: '灭国令', conquer: '攻城令', expand: '扩张令', wealth: '富国令',
    wisdom: '启智令', populate: '繁衍令', legion: '军团令', build: '建城令',
    unify: '统一令', mobilize: '总动员令', alliance: '联盟令', temple: '信仰令',
  },
  power: {
    meteor: '陨石', meteor_shower: '流星雨', lightning: '雷罚', fire: '天火', plague: '瘟疫',
    quake: '地震', volcano: '火山', tornado: '龙卷', tsunami: '海啸', flood: '洪水',
    drought: '旱灾', blizzard: '暴雪', sandstorm: '沙暴', acid_rain: '酸雨', locust: '蝗灾',
    famine: '饥荒', ice_age: '冰期', sinkhole: '天坑', blackhole: '黑洞', typhoon: '台风',
    wrath: '天怒风暴', curse: '诅咒', boom: '爆破', nuke: '核火',
  },
  terrain: {
    water: '水域', grass: '草原', forest: '森林', hill: '丘陵', mountain: '山脉', sand: '沙漠', snow: '雪原',
  },
  what: { gold: '财富', knowledge: '知识' },
  form: {
    human: '人形', wolf: '狼形', bear: '熊形', snake: '蛇形', deer: '鹿形', camel: '驼形',
    scorpion: '蝎形', sheep: '羊形', penguin: '企鹅形', dragon: '龙形',
  },
};
