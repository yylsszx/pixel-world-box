// ============ 统治者议会 · L5 汇报层 ============
// 铁律：只允许模板填槽，禁止自由文本；单条 ≤15 字。
// 槽值来源恒为代码解析结果（解析后的国名/地名/枚举中文名/数字）——AI 原文永不入汇报。
// 新增动作六步之第 5 步：在 REPORT_TEMPLATES 补一条（Record<RulerAction,…> 类型强制全同步）。
import type { RulerAction } from './types';
import { ACTION_META } from './whitelist';
import { ENUM_LABELS } from './schema';

export type ReportSlots = Record<string, string | number | undefined>;

/** 把模板填槽并压到 ≤15 字（均衡截断：多槽共享预算时按统一上限截，富余从前往后回填） */
export function fit15(template: string, slots: ReportSlots): string {
  const keys = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const values = keys.map((k) => {
    const v = slots[k];
    return v === undefined || v === '' ? '' : String(v);
  });
  const overhead = template.replace(/\{(\w+)\}/g, '').length;
  const budget = Math.max(0, 15 - overhead); // 槽值总预算
  // 均衡上限：找最大 c 使 sum(min(len, c)) ≤ budget
  let cut = 8;
  if (values.reduce((s, v) => s + Math.min(v.length, 8), 0) > budget) {
    for (cut = 8; cut >= 1; cut--) {
      if (values.reduce((s, v) => s + Math.min(v.length, cut), 0) <= budget) break;
    }
    if (cut < 1) cut = 1;
  }
  const cuts = values.map((v) => Math.min(v.length, cut));
  // 富余回填（从前往后，让主语尽量完整）
  let left = budget - cuts.reduce((s, c) => s + c, 0);
  for (let i = 0; i < keys.length && left > 0; i++) {
    const canAdd = Math.min(left, values[i].length - cuts[i]);
    if (canAdd > 0) {
      cuts[i] += canAdd;
      left -= canAdd;
    }
  }
  let vi = 0;
  return template.replace(/\{(\w+)\}/g, () => {
    const idx = vi++;
    return values[idx].slice(0, cuts[idx]);
  });
}

const enumLabel = (group: string, key: string | number | undefined): string =>
  key === undefined ? '' : ENUM_LABELS[group]?.[String(key)] ?? String(key);

/** 每个动作的汇报模板（槽值由 executor 的解析结果提供） */
export const REPORT_TEMPLATES: Record<RulerAction, (s: ReportSlots) => string> = {
  declare_war: (s) => fit15(`「{a}」向「{b}」宣战`, s),
  make_peace: (s) => fit15(`「{a}」「{b}」言和`, s),
  form_alliance: (s) => fit15(`「{a}」「{b}」结盟`, s),
  issue_directive: (s) => fit15(`「{k}」奉诏{dir}`, { ...s, dir: s.kind ? enumLabel('kind', s.kind).replace(/令$/, '') : '' }),
  divine_strike: (s) => fit15(`{power}·{place}`, { ...s, power: enumLabel('power', s.power) }),
  heal_land: (s) => fit15(`圣光净化{place}`, s),
  bless_land: (s) => fit15(`神恩沐浴{place}`, s),
  spawn_species: (s) => fit15(`新种「{name}」降临`, s),
  hybridize: (s) => fit15(`「{a}」「{b}」相融`, s),
  spawn_creatures: (s) => fit15(`{race}×{n}降于{place}`, s),
  boost_kingdom: (s) => fit15(`「{k}」天赐{what}`, { ...s, what: enumLabel('what', s.what) }),
  terraform: (s) => fit15(`{terrain}重塑{place}`, { ...s, terrain: enumLabel('terrain', s.terrain) }),
};

/** 受阻/失败也走模板（绝不自由文本） */
export function reportBlocked(action: RulerAction): string {
  return `${ACTION_META[action].label}被驳回`;
}
export function reportFailed(action: RulerAction): string {
  return `${ACTION_META[action].label}未遂`;
}
