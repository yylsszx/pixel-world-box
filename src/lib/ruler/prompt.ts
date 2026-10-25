// ============ 统治者议会 · L2 决策 Agent 提示词 ============
// 铁律：提示词只负责「意图理解」——不负责世界知识（在 digest 用户消息里）、
// 不负责执行正确性（在代码层）。校验/执行/回读逻辑绝不写进这里。
// 权柄清单由 whitelist + schema 自动生成（六步之第 6 步天然同步，不会漏登记）。
import type { RulerRole } from './types';
import { ACTION_META, RULER_ROLES, actionsOfRole } from './whitelist';
import { ENUM_LABELS, INTENT_SCHEMA } from './schema';

/** 参数的一句话说明（含枚举中文名与范围） */
function argLine(action: string, key: string): string {
  const spec = INTENT_SCHEMA[action as keyof typeof INTENT_SCHEMA][key];
  const parts = [key];
  if (spec.required) parts.push('必填');
  if (spec.enum) {
    const labels = spec.enum.map((e) => `${e}=${ENUM_LABELS[key]?.[e] ?? e}`).join('/');
    parts.push(`枚举[${labels}]`);
  } else if (spec.type === 'number') {
    parts.push(`数值${spec.min != null ? `[${spec.min}-${spec.max ?? '∞'}]` : ''}`);
    if (spec.def !== undefined) parts.push(`缺省${spec.def}`);
  } else if (spec.type === 'boolean') {
    parts.push('布尔');
  } else {
    parts.push(spec.desc);
  }
  return parts.join(' ');
}

/** 生成某席位的权柄清单（动作+参数契约） */
export function renderAuthority(role: RulerRole): string {
  const acts = actionsOfRole(role);
  return acts
    .map((a) => {
      const meta = ACTION_META[a];
      const params = Object.entries(INTENT_SCHEMA[a])
        .filter(([k]) => k !== 'why')
        .map(([k]) => argLine(a, k))
        .join('；');
      const dangerNote = meta.danger === 'high' ? '（高危：需造物主批复）' : meta.danger === 'medium' ? '（重举措动）' : '';
      return `- ${a}｜${meta.label}${dangerNote}：${params || '无参数'}`;
    })
    .join('\n');
}

/** 席位系统提示词（messages[0] · role: assistant） */
export function buildRulerPrompt(role: RulerRole): string {
  const r = RULER_ROLES[role];
  return `你是像素世界「界域」的${r.name}（尊号·${r.title}），统治者议会的席位之一。你执掌${r.domain}。

【职责】每次议会召开，你会收到一份世界实况摘要（变化量+告警+锚点名）。你研判局势，只在你执掌的领域内献策——输出结构化意图，由议会仲裁层与执行器（纯代码）解析、校验、执行并回读验证。

【输出协议·严格遵守】
1. 整条回复必须只是一个 JSON 对象：{"intents": [ … ]}——无前言、无解释、无代码围栏以外的文字。
2. 无事可献则输出 {"intents": []}（沉默是你的常态——没有值得出手的变化就不要动作，绝不输出"暂无动作"之类的空话）。
3. 每条意图形如：{"action": "动作名", "参数名": 值, …, "why": "≤24字动机"}。why 可省略。
4. place/kingdom/a/b 等地名参数：必须引用实况摘要中出现过的锚点名或列国名（如「冬堡」「北境火场」「世界中心」），或方位词（北境/南疆/东境/西陲/中土）。地名由代码解析——你绝不输出 x/y 坐标、id、region_id 或任何工具名，出现即整条作废。
5. 只使用下方权柄清单内的动作与参数；枚举值必须逐字匹配。超出清单的动作会被仲裁层直接驳回。
6. 每次至多献 2 策（议会预算），优先最有戏剧价值或最紧迫者。

【献策品味】
- 依据摘要里的【变化】【告警】行决策：火场失控→净化或天罚纵火者；弱国濒危→天赐扶持；掠食者灭绝→放生补位；战火绵延→议和或火上浇油——你是执掌「${r.domain}」的统治者，用你的领域手段回应世界的脉搏。
- 克制是美德：摘要平淡时保持沉默。连续多轮沉默完全正常。
- 高危动作（核火/黑洞/天怒）只在摘要出现极端失衡（世界大战/人口爆炸/生态崩溃）时才考虑，且会被送呈造物主批复。

【你的权柄清单】（动作｜标签：参数契约）
${renderAuthority(role)}

【示例】（仅示意格式，地名须来自当次实况）
{"intents": [{"action": "divine_strike", "power": "lightning", "place": "冬堡火场", "scale": 2, "why": "以雷止火"}]}`;
}

/** 用户消息模板：实况摘要 + 可选造物主谕令 */
export function buildRulerUserMessage(digest: string, decree: string | null, conveneNo: number): string {
  const L = [`【第 ${conveneNo} 次议会 · 世界实况】`, digest];
  if (decree) L.push(``, `【造物主谕令】${decree}`, `（谕令优先级最高——若与你的权柄相关，本轮必须献策回应）`);
  return L.join('\n');
}
