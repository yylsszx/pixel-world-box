// ============ 涌现式进化引擎 v3（Infinite Emergent Evolution Core） ============
// 所有系统共享的涌现基础设施：
//   ① VisGenome 视觉基因组 —— 进化不止改属性和名字，还程序化改变外观（色相/体型/角刺鬃尾/花纹）
//   ② EvoNode 进化图谱 —— 物种/武器/科技/特质/理念 五系谱系的统一节点（涌现图谱面板数据源）
//   ③ 涌现生成器 —— 无限科技发明 / 无限特质分化 / 无限社会理念（词法组合，永不重复预设）
// 本模块零引擎依赖（纯函数 + 类型），engine / sprites / render / 面板共用，杜绝循环引用。

import type { Gene, TraitDef } from './types';
import type { TechCat } from './tech';

// ---------------------------------------------------------------------------
// ---------------- ① 视觉基因组（Visual Genome） ----------------
// ---------------------------------------------------------------------------

/** 视觉基因组：种化/棘轮时随基因一起变异 —— 涌现进化直接写在脸上 */
export interface VisGenome {
  /** 根预设种族 id（决定基础体色板与精灵族系；种化链保持根血统） */
  root: number;
  /** 色相偏移（-40..40 度：种族肤色/毛色的谱系漂移） */
  hue: number;
  /** 明度乘数（0.72..1.28） */
  lum: number;
  /** 体型乘数（0.8..1.45：视觉缩放） */
  size: number;
  /** 壮硕度（0..1：体宽 +1px 阈值） */
  bulk: number;
  /** 头角数量（0..2） */
  horns: number;
  /** 背棘（0/1） */
  spikes: number;
  /** 鬃毛（0/1） */
  mane: number;
  /** 尾长（0..2） */
  tail: number;
  /** 耳型（0 无 1 竖耳 2 长耳） */
  ears: number;
  /** 发光器官（0/1：眼/斑荧光） */
  glow: number;
  /** 花纹（0 素色 1 条纹 2 斑点） */
  pattern: number;
  /** 头冠（0/1：蜥蜴式冠） */
  crest: number;
}

/** 由基因漂移推导初始视觉（大体魄→硕大壮硕 / 高杀伤→角与刺 / 高速→流线小体 / 高繁衍→素色） */
export function visFromGene(root: number, g: Gene, rng: () => number): VisGenome {
  return {
    root,
    hue: Math.round((rng() - 0.5) * 20 + (g.d - 1) * 14),
    lum: Math.round((0.92 + rng() * 0.12 + (g.h - 1) * 0.08) * 100) / 100,
    size: Math.round((0.9 + rng() * 0.2 + (g.h - 1) * 0.3) * 100) / 100,
    bulk: Math.max(0, Math.min(1, 0.3 + (g.h - 1) * 0.8 + (g.d - 1) * 0.3)),
    horns: g.d > 1.25 ? (rng() < 0.6 ? 1 : 2) : rng() < 0.2 ? 1 : 0,
    spikes: g.d > 1.35 && rng() < 0.5 ? 1 : 0,
    mane: g.h > 1.2 && rng() < 0.4 ? 1 : 0,
    tail: Math.round(rng() * 2),
    ears: rng() < 0.45 ? 1 : rng() < 0.5 ? 2 : 0,
    glow: rng() < 0.12 ? 1 : 0,
    pattern: rng() < 0.3 ? 1 : rng() < 0.35 ? 2 : 0,
    crest: rng() < 0.15 ? 1 : 0,
  };
}

/** 视觉基因变异（种化时）：色相/体型连续漂移 + 附器离散突变 —— 每一代都长出新模样 */
export function mutateVis(parent: VisGenome | null, root: number, rng: () => number, drift = 1): VisGenome {
  if (!parent) return visFromGene(root, { s: 1, d: 1, h: 1, r: 1 }, rng);
  const cl = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const flip = (p: number) => (rng() < p ? 1 : 0);
  return {
    root,
    hue: Math.round(cl(parent.hue + (rng() - 0.5) * 22 * drift, -40, 40)),
    lum: Math.round(cl(parent.lum * (1 + (rng() - 0.5) * 0.14 * drift), 0.72, 1.28) * 100) / 100,
    size: Math.round(cl(parent.size * (1 + (rng() - 0.5) * 0.16 * drift), 0.8, 1.45) * 100) / 100,
    bulk: Math.round(cl(parent.bulk + (rng() - 0.5) * 0.3 * drift, 0, 1) * 100) / 100,
    horns: rng() < 0.25 ? Math.round(cl(parent.horns + (rng() < 0.5 ? -1 : 1), 0, 2)) : parent.horns,
    spikes: parent.spikes ? (rng() < 0.2 ? 0 : 1) : flip(0.14),
    mane: parent.mane ? (rng() < 0.2 ? 0 : 1) : flip(0.14),
    tail: rng() < 0.25 ? Math.round(cl(parent.tail + (rng() < 0.5 ? -1 : 1), 0, 2)) : parent.tail,
    ears: rng() < 0.2 ? Math.round(cl(parent.ears + (rng() < 0.5 ? -1 : 1), 0, 2)) : parent.ears,
    glow: parent.glow ? (rng() < 0.15 ? 0 : 1) : flip(0.08),
    pattern: rng() < 0.18 ? Math.floor(rng() * 3) : parent.pattern,
    crest: parent.crest ? (rng() < 0.2 ? 0 : 1) : flip(0.1),
  };
}

/** 序列化：13 元组（全部量化整数，save 紧凑） */
export type VisTuple = [number, number, number, number, number, number, number, number, number, number, number, number, number];
export function visToTuple(v: VisGenome): VisTuple {
  return [v.root, v.hue, Math.round(v.lum * 100), Math.round(v.size * 100), Math.round(v.bulk * 100), v.horns, v.spikes, v.mane, v.tail, v.ears, v.glow, v.pattern, v.crest];
}
export function tupleToVis(t: VisTuple): VisGenome {
  return {
    root: t[0] | 0, hue: t[1] | 0, lum: t[2] / 100, size: t[3] / 100, bulk: t[4] / 100,
    horns: t[5] | 0, spikes: t[6] | 0, mane: t[7] | 0, tail: t[8] | 0, ears: t[9] | 0,
    glow: t[10] | 0, pattern: t[11] | 0, crest: t[12] | 0,
  };
}

/** 视觉基因组中文速写（检查器/图谱节点用）：「巨角·条纹·硕躯」 */
export function describeVis(v: VisGenome): string {
  const parts: string[] = [];
  if (v.size >= 1.25) parts.push('硕大');
  else if (v.size <= 0.88) parts.push('娇小');
  if (v.bulk >= 0.62) parts.push('壮硕');
  if (v.horns === 2) parts.push('双角');
  else if (v.horns === 1) parts.push('独角');
  if (v.spikes) parts.push('背棘');
  if (v.mane) parts.push('鬃毛');
  if (v.tail >= 2) parts.push('长尾');
  if (v.ears === 2) parts.push('长耳');
  else if (v.ears === 1) parts.push('竖耳');
  if (v.glow) parts.push('荧光');
  if (v.pattern === 1) parts.push('条纹');
  else if (v.pattern === 2) parts.push('斑纹');
  if (v.crest) parts.push('头冠');
  if (v.hue <= -14) parts.push('冷色血统');
  else if (v.hue >= 14) parts.push('暖色血统');
  return parts.length > 0 ? parts.slice(0, 4).join('·') : '常态';
}

// ---------------------------------------------------------------------------
// ---------------- 色彩工具（hex ↔ hsl 漂移） ----------------
// ---------------------------------------------------------------------------

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v: number) => Math.max(0, Math.min(255, Math.round((v + m) * 255))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 按视觉基因组漂移一个基色（hue/lum），返回 hex */
export function shiftColor(base: string, v: VisGenome, lumBias = 0): string {
  const [h, s, l] = hexToHsl(base);
  const l2 = Math.max(0.06, Math.min(0.94, l * v.lum + lumBias));
  return hslToHex(h + v.hue, Math.min(1, s * 1.05), l2);
}

/** RGB 三元组版（人形肤色用） */
export function shiftRgb(c: [number, number, number], v: VisGenome): [number, number, number] {
  const hex = `#${c[0].toString(16).padStart(2, '0')}${c[1].toString(16).padStart(2, '0')}${c[2].toString(16).padStart(2, '0')}`;
  const out = shiftColor(hex, v);
  return [parseInt(out.slice(1, 3), 16), parseInt(out.slice(3, 5), 16), parseInt(out.slice(5, 7), 16)];
}

/** 各精灵族系的基础体色（父种色板 —— 视觉基因在其上漂移） */
export const SPRITE_BASE: Record<string, { body: string; dark: string; light: string }> = {
  sheep: { body: '#f2ead8', dark: '#575757', light: '#fffaf0' },
  wolf: { body: '#8d8d8d', dark: '#3a342c', light: '#c8c8c8' },
  snowwolf: { body: '#eef2f5', dark: '#d4dde4', light: '#ffffff' },
  bear: { body: '#6e4a2b', dark: '#3a342c', light: '#9a6f45' },
  deer: { body: '#a5794f', dark: '#5b3d24', light: '#d1a878' },
  penguin: { body: '#2b3a4a', dark: '#14100c', light: '#f2f6fa' },
  camel: { body: '#c49a5c', dark: '#8a6432', light: '#e8c890' },
  scorpion: { body: '#7a4a20', dark: '#3a2410', light: '#b0763a' },
  snake: { body: '#4a7a3a', dark: '#2a4a20', light: '#7aa85c' },
  person: { body: '#d9a066', dark: '#3a342c', light: '#f2d0a0' },
};

/** 渲染缓存：视觉基因组 → 展开为绘制参数（模块级缓存，种化时失效） */
export interface VisCache {
  body: string;
  dark: string;
  light: string;
  accent: string;
  size: number;
  bulk: number;
  horns: number;
  spikes: boolean;
  mane: boolean;
  tail: number;
  ears: number;
  glow: boolean;
  pattern: number;
  crest: boolean;
}

const visCacheMap = new Map<number, VisCache>();

/** 取/建某动态物种的渲染缓存（base = 根族系色板） */
export function visCacheFor(race: number, vis: VisGenome | undefined | null, sprite: string): VisCache | null {
  if (!vis) return null;
  const hit = visCacheMap.get(race);
  if (hit) return hit;
  const base = SPRITE_BASE[sprite] ?? SPRITE_BASE.wolf;
  const vc: VisCache = {
    body: shiftColor(base.body, vis),
    dark: shiftColor(base.dark, vis, -0.04),
    light: shiftColor(base.light, vis, 0.05),
    accent: shiftColor(vis.pattern === 2 ? base.light : base.dark, vis, vis.glow ? 0.3 : 0.02),
    size: vis.size,
    bulk: vis.bulk,
    horns: vis.horns,
    spikes: !!vis.spikes,
    mane: !!vis.mane,
    tail: vis.tail,
    ears: vis.ears,
    glow: !!vis.glow,
    pattern: vis.pattern,
    crest: !!vis.crest,
  };
  if (vis.glow) vc.accent = '#7df9ff';
  visCacheMap.set(race, vc);
  return vc;
}

/** 使某物种渲染缓存失效（种化/读档后调用） */
export function invalidateVisCache(race?: number) {
  if (race === undefined) visCacheMap.clear();
  else visCacheMap.delete(race);
}

// ---------------------------------------------------------------------------
// ---------------- ② 进化图谱（Evolution Graph） ----------------
// ---------------------------------------------------------------------------

export type EvoKind = 'species' | 'weapon' | 'tech' | 'trait' | 'society';

export interface EvoNode {
  /** 图谱节点 id（全局 evoSeq） */
  id: number;
  kind: EvoKind;
  name: string;
  /** 父节点 id（null = 预设根源） */
  parent: number | null;
  /** 诞生年份 */
  year: number;
  colorHex: string;
  /** 一句话详情 */
  detail: string;
  /** 数值快照（面板徽章，如「杀伤+38%」/「威力 86」） */
  stat?: string;
  /** 存活/在役（false = 已灭绝/退役） */
  alive: boolean;
  /** 附加数值（点击详情展示） */
  meta?: Record<string, number | string>;
}

export const EVO_KIND_META: Record<EvoKind, { name: string; color: string; desc: string }> = {
  species: { name: '物种', color: '#6fd66f', desc: '种化分化出的全新动态物种（无限链式演化）' },
  weapon: { name: '武器', color: '#ff9e5f', desc: '程序化锻造的涌现武器谱系（血系迭代/缴获仿制）' },
  tech: { name: '科技', color: '#5fe8ff', desc: '超越预设科技树的无限涌现发明' },
  trait: { name: '特质', color: '#ff5fd2', desc: '极端基因个体分化出的新特质' },
  society: { name: '理念', color: '#ffd93d', desc: '社会涌现的新治国理念（文化扩散）' },
};

// ---------------------------------------------------------------------------
// ---------------- ③ 涌现科技生成器（Infinite Tech Invention） ----------------
// ---------------------------------------------------------------------------

/** 涌现科技效果键（与 TechMods 数值域对齐） */
export type EmModKey =
  | 'dmg' | 'hp' | 'bhp' | 'gold' | 'know' | 'repro' | 'col' | 'tax'
  | 'cult' | 'repair' | 'morale' | 'armyMax' | 'archer' | 'plague' | 'range' | 'stab';

export interface EmTechEff {
  k: EmModKey;
  v: number;
}

export interface EmTech {
  key: string;
  name: string;
  cat: TechCat;
  cost: number;
  /** 涌现代数（第 N 项涌现发明） */
  gen: number;
  effects: EmTechEff[];
  desc: string;
}

/** 涌现科技词库：前缀 × 领域 —— 组合空间 16×16=256，代数后缀无限 */
const EM_PREFIX = ['量子', '纳米', '等离子', '基因', '光子', '超导', '混沌', '灵能', '暗物质', '弦', '晶格', '磁悬浮', '熵减', '聚变', '深空', '引力'];
const EM_FIELD: { name: string; cat: TechCat; eff: EmModKey; good: boolean }[] = [
  { name: '冶金学', cat: 'military', eff: 'dmg', good: true },
  { name: '护盾工程', cat: 'eng', eff: 'hp', good: true },
  { name: '农艺', cat: 'agri', eff: 'repro', good: true },
  { name: '算术', cat: 'culture', eff: 'know', good: true },
  { name: '航海术', cat: 'naval', eff: 'col', good: true },
  { name: '财税学', cat: 'econ', eff: 'tax', good: true },
  { name: '营造法式', cat: 'eng', eff: 'bhp', good: true },
  { name: '市场学', cat: 'econ', eff: 'gold', good: true },
  { name: '战术学', cat: 'military', eff: 'morale', good: true },
  { name: '医道', cat: 'culture', eff: 'plague', good: false },
  { name: '弹道学', cat: 'military', eff: 'range', good: true },
  { name: '射艺', cat: 'military', eff: 'archer', good: true },
  { name: '礼乐', cat: 'culture', eff: 'cult', good: true },
  { name: '治理术', cat: 'civic', eff: 'stab', good: true },
  { name: '营缮学', cat: 'eng', eff: 'repair', good: true },
  { name: '军制', cat: 'military', eff: 'armyMax', good: true },
];

const EM_EFF_NAME: Record<EmModKey, [string, boolean]> = {
  dmg: ['全军伤害', true], hp: ['全军生命', true], bhp: ['建筑耐久', true], gold: ['经济收入', true],
  know: ['知识产出', true], repro: ['繁衍速度', true], col: ['殖民速度', true], tax: ['人口税基', true],
  cult: ['文化积累', true], repair: ['修复速度', true], morale: ['军团士气', true], armyMax: ['军团上限', true],
  archer: ['射手伤害', true], plague: ['瘟疫传播', false], range: ['远程射程', true], stab: ['稳定度', true],
};

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** 发明一项涌现科技（静态树研究完后的无限延伸）：前缀 × 领域 × 代数，效果 1-2 条小加成 */
export function inventTech(rng: () => number, civLike: { mil: number; cult: number; rich: number }, gen: number): EmTech {
  // 领域选择受国家气质加权（军国爱军事/文化人爱礼乐/富豪爱经济）
  const w = EM_FIELD.map((f) => {
    let base = 1;
    if (f.cat === 'military') base *= 0.5 + civLike.mil * 1.5;
    if (f.cat === 'culture') base *= 0.5 + civLike.cult * 1.5;
    if (f.cat === 'econ') base *= 0.6 + civLike.rich * 1.4;
    return base;
  });
  let total = 0;
  for (const x of w) total += x;
  let roll = rng() * total;
  let field = EM_FIELD[0];
  for (let i = 0; i < EM_FIELD.length; i++) {
    roll -= w[i];
    if (roll <= 0) { field = EM_FIELD[i]; break; }
  }
  const prefix = EM_PREFIX[Math.floor(rng() * EM_PREFIX.length)];
  const suffix = gen > 12 ? `·${ROMAN[Math.min(11, Math.floor(gen / 12))]}` : '';
  const name = `${prefix}${field.name}${suffix}`;
  // 效果：主效果 + 35% 概率副效果（量级随代数缓增但饱和）
  const effs: EmTechEff[] = [];
  const mag = (k: EmModKey) => {
    const t = 1 + Math.min(0.8, gen * 0.04);
    switch (k) {
      case 'morale': case 'armyMax': case 'range': case 'stab': return Math.round((2 + rng() * 3) * t);
      default: return Math.round((0.05 + rng() * 0.07) * t * 1000) / 1000;
    }
  };
  effs.push({ k: field.eff, v: mag(field.eff) });
  if (rng() < 0.35) {
    const other = EM_FIELD[Math.floor(rng() * EM_FIELD.length)];
    if (other.eff !== field.eff) effs.push({ k: other.eff, v: mag(other.eff) });
  }
  const desc = effs.map((e) => `${EM_EFF_NAME[e.k][0]} ${e.k === 'plague' ? '−' : '+'}${Math.round(e.v * (e.v < 1 ? 100 : 1))}${e.v < 1 ? '%' : ''}`).join('，');
  return {
    key: `em${gen}`,
    name,
    cat: field.cat,
    cost: Math.round(110 + gen * 14 + rng() * 30),
    gen,
    effects: effs,
    desc,
  };
}

/** 涌现科技效果叠加进 TechMods（engine.techModsOf 调用） */
export function applyEmTechMods(mods: Record<string, number>, t: EmTech): void {
  for (const e of t.effects) {
    mods[e.k] = (mods[e.k] ?? 0) + (e.k === 'plague' ? -Math.abs(e.v) : e.v);
  }
}

// ---------------------------------------------------------------------------
// ---------------- ③ 涌现特质生成器（Infinite Trait Emergence） ----------------
// ---------------------------------------------------------------------------

const TRAIT_PREFIX = ['凶蛮', '钢筋', '魅影', '荒野', '苔藓', '血怒', '霜骨', '雷筋', '深渊', '星辉', '荆棘', '孤狼'];
const TRAIT_BODY = ['之爪', '之躯', '之足', '血脉', '之瞳', '之鳞'];

/** 极端基因新生儿分化出新特质：1 强项 + 40% 弱项，词法组合 72 种 × 数值连续 —— 无限 */
export function inventTrait(rng: () => number, gene: Gene, seq: number): TraitDef {
  const prefix = TRAIT_PREFIX[Math.floor(rng() * TRAIT_PREFIX.length)];
  const body = TRAIT_BODY[Math.floor(rng() * TRAIT_BODY.length)];
  const t: TraitDef = { key: `dt${seq}`, name: `${prefix}${body}`, desc: '', good: true };
  const pick = rng();
  if (gene.d >= 1.5 && pick < 0.4) {
    t.dmgMul = Math.round((1.18 + rng() * 0.2) * 100) / 100;
    if (rng() < 0.4) t.hpMul = Math.round((0.88 + rng() * 0.1) * 100) / 100;
  } else if (gene.h >= 1.5 && pick < 0.7) {
    t.hpMul = Math.round((1.2 + rng() * 0.22) * 100) / 100;
    if (rng() < 0.35) t.regen = 0.02;
  } else if (gene.s >= 1.5 && pick < 0.9) {
    t.speedMul = Math.round((1.15 + rng() * 0.18) * 100) / 100;
    if (rng() < 0.4) t.dmgMul = Math.round((1.08 + rng() * 0.1) * 100) / 100;
  } else {
    t.regen = Math.round((0.015 + rng() * 0.03) * 1000) / 1000;
    t.hpMul = Math.round((1.1 + rng() * 0.15) * 100) / 100;
  }
  const bits: string[] = [];
  if (t.dmgMul) bits.push(`伤害 +${Math.round((t.dmgMul - 1) * 100)}%`);
  if (t.hpMul) bits.push(`生命 +${Math.round((t.hpMul - 1) * 100)}%`);
  if (t.speedMul) bits.push(`速度 +${Math.round((t.speedMul - 1) * 100)}%`);
  if (t.regen) bits.push('缓慢再生');
  t.desc = bits.join(' ') + '（涌现特质）';
  return t;
}

// ---------------------------------------------------------------------------
// ---------------- ③ 涌现社会理念生成器（Infinite Ideas） ----------------
// ---------------------------------------------------------------------------

export interface IdeaDef {
  key: string;
  name: string;
  desc: string;
  mods: {
    gold?: number;
    stab?: number;
    mil?: number;
    know?: number;
    repro?: number;
    wear?: number;
  };
}

const IDEA_PRE = ['军功爵', '重商', '垦荒', '天工', '航海', '民本', '格物', '荣耀', '万学', '大同', '无为', '铁律'];
const IDEA_POST = ['主义', '律令', '学会', '改革', '之道', '运动'];
const IDEA_BODY: { name: string; desc: string; mods: IdeaDef['mods'] }[] = [
  { name: '重商', desc: '商路即国脉', mods: { gold: 0.18 } },
  { name: '军功爵', desc: '斩首授田，武士阶层的上升阶梯', mods: { mil: 0.06, stab: -1 } },
  { name: '民本', desc: '民为邦本，本固邦宁', mods: { stab: 3, repro: 0.05 } },
  { name: '格物', desc: '致知在格物', mods: { know: 0.22 } },
  { name: '垦荒', desc: '寸土不荒', mods: { repro: 0.08, gold: 0.06 } },
  { name: '偃武', desc: '铸剑为犁', mods: { wear: -0.15, mil: -0.05 } },
  { name: '铁律', desc: '令行禁止', mods: { stab: 4, gold: -0.05 } },
  { name: '万学', desc: '百花齐放', mods: { know: 0.15, stab: 1 } },
];

/** 发明一项社会理念：本体 × 后缀 ×（20% 变体前缀）—— 8×6×12 组合 + 效果微扰 */
export function inventIdea(rng: () => number, seq: number): IdeaDef {
  const body = IDEA_BODY[Math.floor(rng() * IDEA_BODY.length)];
  const post = IDEA_POST[Math.floor(rng() * IDEA_POST.length)];
  const pre = rng() < 0.2 ? IDEA_PRE[Math.floor(rng() * IDEA_PRE.length)] : '';
  const jitter = (v: number | undefined, amt: number) => v === undefined ? undefined : Math.round((v + (rng() - 0.5) * amt) * 1000) / 1000;
  const mods = {
    gold: jitter(body.mods.gold, 0.08),
    stab: body.mods.stab !== undefined ? Math.round(body.mods.stab + (rng() - 0.5) * 1.5) : undefined,
    mil: jitter(body.mods.mil, 0.02),
    know: jitter(body.mods.know, 0.08),
    repro: jitter(body.mods.repro, 0.03),
    wear: jitter(body.mods.wear, 0.06),
  };
  const effBits: string[] = [];
  if (mods.gold) effBits.push(`收入 +${Math.round(mods.gold * 100)}%`);
  if (mods.stab) effBits.push(`稳定 ${mods.stab > 0 ? '+' : ''}${mods.stab}`);
  if (mods.mil) effBits.push(`军国倾向 ${mods.mil > 0 ? '+' : ''}${Math.round(mods.mil * 100)}/十年`);
  if (mods.know) effBits.push(`知识 +${Math.round(mods.know * 100)}%`);
  if (mods.repro) effBits.push(`繁衍 +${Math.round(mods.repro * 100)}%`);
  if (mods.wear) effBits.push(`厌战 ${mods.wear > 0 ? '+' : ''}${Math.round(mods.wear * 100)}%`);
  return {
    key: `id${seq}`,
    name: `${pre}${body.name}${post}`,
    desc: `${body.desc} —— ${effBits.join('，')}`,
    mods,
  };
}
