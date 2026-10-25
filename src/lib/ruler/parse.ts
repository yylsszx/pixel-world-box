// ============ 统治者议会 · L2 意图解析器 ============
// AI 输出 → 结构化意图。只做「格式与白名单」的规范化：
//   ① 动作必须在白名单且属于该席位权柄（越权拒绝）
//   ② 禁止字段（x/y/id/region_id/tool…）→ 整条拒绝（硬约束：坐标与 ID 留在代码层）
//   ③ 参数按 schema 规范化：枚举大小写归一、数值钳制范围、字符串截断
// 不做的事：地名解析（geo.ts）、合法性（arbiter）、执行（executor）。
import type { RulerAction, RulerIntent, RulerRole } from './types';
import { ACTION_META } from './whitelist';
import { FORBIDDEN_KEYS, INTENT_SCHEMA } from './schema';

export interface ParseOutcome {
  intents: RulerIntent[];
  /** 规范化过程中的问题（进日志，不进汇报） */
  issues: string[];
}

/** 从模型原文提取 JSON（围栏 → 裸对象/数组 → null） */
function extractJson(raw: string): unknown | null {
  const t = raw.trim();
  if (!t) return null;
  // 围栏块
  const fence = /```[A-Za-z]*\s*([\s\S]*?)```/.exec(t);
  const candidates = fence ? [fence[1], t] : [t];
  for (const c of candidates) {
    const s = c.trim().replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(s);
    } catch {
      /* 试下一个 */
    }
  }
  // 裸 {"intents":…} 定位（配平花括号）
  const idx = t.indexOf('{"intents"');
  if (idx >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = idx; i < t.length; i++) {
      const ch = t[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(t.slice(idx, i + 1).replace(/,\s*([}\]])/g, '$1'));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function coerceArg(action: RulerAction, key: string, raw: unknown, issues: string[]): string | number | boolean | undefined {
  const spec = INTENT_SCHEMA[action][key];
  if (!spec) return undefined;
  switch (spec.type) {
    case 'number': {
      let n: number;
      if (typeof raw === 'number') n = raw;
      else if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) n = Number(raw);
      else {
        if (raw !== undefined) issues.push(`${action}.${key}：「${String(raw).slice(0, 12)}」不是数字，已用缺省`);
        n = typeof spec.def === 'number' ? spec.def : spec.min ?? 0;
      }
      const lo = spec.min ?? -Infinity;
      const hi = spec.max ?? Infinity;
      const clamped = Math.max(lo, Math.min(hi, n));
      if (clamped !== n) issues.push(`${action}.${key}：${n} 超出 [${lo},${hi}]，钳制为 ${clamped}`);
      return clamped;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true' || raw === 1) return true;
      if (raw === 'false' || raw === 0) return false;
      if (raw !== undefined) issues.push(`${action}.${key}：「${String(raw).slice(0, 12)}」不是布尔，已忽略`);
      return undefined;
    }
    case 'string': {
      let s = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';
      if (!s) return spec.def !== undefined ? String(spec.def) : undefined;
      if (spec.enum) {
        const hit = spec.enum.find((e) => e.toLowerCase() === s.toLowerCase());
        if (!hit) {
          issues.push(`${action}.${key}：「${s.slice(0, 16)}」不在枚举内（${spec.enum.join('/')}），意图拒绝`);
          return null as unknown as undefined; // 用 null 标记枚举失败（调用方丢弃整条）
        }
        return hit;
      }
      // 地名/国名/物种名长度护栏
      if (key === 'name') s = s.slice(0, 8);
      else if (key === 'archetype') s = s.slice(0, 24);
      else s = s.slice(0, 16);
      return s;
    }
  }
}

/**
 * 解析一个席位的模型输出。
 * 返回 issues 供「决策层」定位问题；任何一条意图的硬约束违规只丢弃该条，不影响其余。
 */
export function parseAgentOutput(role: RulerRole, raw: string): ParseOutcome {
  const intents: RulerIntent[] = [];
  const issues: string[] = [];
  const j = extractJson(raw);
  if (j === null) {
    // 沉默协议：非 JSON 输出一律视为沉默（无动作），但留问题记录
    if (raw.trim()) issues.push('输出不是合法 JSON（视为沉默）');
    return { intents, issues };
  }
  const list = Array.isArray(j)
    ? j
    : typeof j === 'object' && j !== null && Array.isArray((j as Record<string, unknown>).intents)
      ? ((j as Record<string, unknown>).intents as unknown[])
      : null;
  if (!list) {
    issues.push('JSON 结构不符（应为 {"intents":[…]}）');
    return { intents, issues };
  }
  for (const item of list.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const actionQ = String(o.action ?? '').trim();
    if (!(actionQ in ACTION_META)) {
      issues.push(`动作「${actionQ.slice(0, 20)}」不在白名单，已丢弃`);
      continue;
    }
    const action = actionQ as RulerAction;
    if (!ACTION_META[action].roles.includes(role)) {
      issues.push(`动作 ${action} 不属于${role}席位权柄，已丢弃`);
      continue;
    }
    // 禁止字段：坐标/ID/工具名 —— 出现即整条拒绝（架构硬约束）
    const forbidden = FORBIDDEN_KEYS.filter((k) => k in o);
    if (forbidden.length) {
      issues.push(`${action}：输出了禁止字段 ${forbidden.join('/')}（坐标与 ID 由代码解析），整条拒绝`);
      continue;
    }
    const rawParams = (typeof o.params === 'object' && o.params !== null && !Array.isArray(o.params) ? o.params : o) as Record<string, unknown>;
    const params: Record<string, string | number | boolean> = {};
    let dead = false;
    for (const [key, val] of Object.entries(rawParams)) {
      if (key === 'action' || key === 'why' || key === 'id') continue;
      const spec = INTENT_SCHEMA[action][key];
      if (!spec) {
        issues.push(`${action}：未知参数「${key}」已丢弃`);
        continue;
      }
      const coerced = coerceArg(action, key, val, issues);
      if (coerced === null) { dead = true; break; } // 枚举失败 → 丢弃整条
      if (coerced !== undefined) params[key] = coerced;
    }
    if (dead) continue;
    // 必填校验
    let missing = false;
    for (const [key, spec] of Object.entries(INTENT_SCHEMA[action])) {
      if (spec.required && params[key] === undefined) {
        issues.push(`${action}：缺必填参数 ${key}，已丢弃`);
        missing = true;
      }
    }
    if (missing) continue;
    const why = typeof o.why === 'string' ? o.why.trim().slice(0, 24) : undefined;
    intents.push({ agent: role, action, params, why: why || undefined });
  }
  return { intents, issues };
}
