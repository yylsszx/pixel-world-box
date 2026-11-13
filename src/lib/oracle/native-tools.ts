// ============ 神谕原生函数调用层（Oracle OS v5 · Native Function Calling） ============
// 告别「模型把工具调用写成 markdown JSON 围栏 → 客户端正则抢救解析」的脆弱协议：
//   OpenAI 兼容端点（DeepSeek / Kimi / 通义千问 / GLM / OpenRouter / Ollama …）原生支持
//   tools + tool_calls 结构化字段——工具调用由协议层承载，解析失败率归零。
// 本模块：
//   · buildNativeToolParams：把工具目录（按当前权限过滤）编译成 OpenAI tools 参数；
//   · NativeCallAccumulator：SSE 流式 delta.tool_calls 的逐块累积器（index 对齐拼接）；
//   · parseNonStreamToolCalls：非流式 JSON 回包的 message.tool_calls 解析。
// 降级策略：端点不支持 tools（HTTP 400 提及 tool/function）→ agent.ts 记忆并回退旧协议。
import { AGENT_TOOLS, type ToolDef } from './tools';
import type { PermTier } from './permissions';
import { tierOfTool } from './permissions';

/** OpenAI JSON Schema 参数类型（由 ToolArgDef 翻译；宽松模式：未知字段不拒收） */
function argToSchema(name: string, def: ToolDef['args'][string]): Record<string, unknown> {
  const base: Record<string, unknown> = { description: `${name}：${def.desc}` };
  if (def.enum) return { type: 'string', enum: def.enum, ...base };
  switch (def.type) {
    case 'number':
      return { type: 'number', ...base };
    case 'boolean':
      return { type: 'boolean', ...base };
    case 'string[]':
      return { type: 'array', items: { type: 'string' }, ...base };
    case 'object':
      // 机制 DSL（trigger/cond/actions…）——自由对象，描述里讲清楚结构
      return { type: 'object', additionalProperties: true, ...base };
    default:
      return { type: 'string', ...base };
  }
}

export interface OpenAIToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

/** 工具目录 → OpenAI tools 数组（perm 允许的位阶才下发——模型连看不见越权工具） */
export function buildNativeToolParams(allowedTiers: PermTier[]): OpenAIToolDef[] {
  return AGENT_TOOLS.filter((t) => allowedTiers.includes(tierOfTool(t.name))).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.desc,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(t.args).map(([n, a]) => [n, argToSchema(n, a)])),
        required: Object.entries(t.args)
          .filter(([, a]) => a.required)
          .map(([n]) => n),
      },
    },
  }));
}

// ---------------- 流式 tool_calls 累积器 ----------------

interface AccSlot {
  id?: string;
  name?: string;
  arguments: string;
}

/**
 * SSE delta.tool_calls 逐块累积：每个分片携带 index，id/function.name 只出现一次，
 * function.arguments 是被切块的 JSON 字符串——按 index 归位拼接，流结束后一次解析。
 */
export class NativeCallAccumulator {
  private slots = new Map<number, AccSlot>();

  /** 喂入一个 delta.tool_calls 数组分片 */
  push(toolCallsDelta: unknown): void {
    if (!Array.isArray(toolCallsDelta)) return;
    for (const raw of toolCallsDelta) {
      if (!raw || typeof raw !== 'object') continue;
      const d = raw as Record<string, unknown>;
      const idx = typeof d.index === 'number' ? d.index : 0;
      let slot = this.slots.get(idx);
      if (!slot) {
        slot = { arguments: '' };
        this.slots.set(idx, slot);
      }
      if (typeof d.id === 'string' && d.id) slot.id = d.id;
      const fn = d.function as Record<string, unknown> | undefined;
      if (fn && typeof fn === 'object') {
        if (typeof fn.name === 'string' && fn.name) slot.name = fn.name;
        if (typeof fn.arguments === 'string') slot.arguments += fn.arguments;
      }
    }
  }

  /** 是否收到过任何 tool_calls 分片 */
  get got(): boolean {
    return this.slots.size > 0;
  }

  /** 收束：解析拼接后的 arguments JSON（尾逗号/零宽字符修复；坏 JSON 给空对象保调用不丢） */
  finalize(): { id: string; name: string; args: Record<string, unknown> }[] {
    const out: { id: string; name: string; args: Record<string, unknown> }[] = [];
    const ordered = [...this.slots.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, slot] of ordered) {
      if (!slot.name) continue;
      let args: Record<string, unknown> = {};
      const t = slot.arguments.trim();
      if (t) {
        try {
          args = JSON.parse(t) as Record<string, unknown>;
        } catch {
          const fixed = t
            .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
            .replace(/,\s*([}\]])/g, '$1');
          try {
            args = JSON.parse(fixed) as Record<string, unknown>;
          } catch {
            args = { _raw: t.slice(0, 2000) };
          }
        }
      }
      out.push({ id: slot.id ?? `nc${out.length + 1}`, name: slot.name, args });
    }
    return out;
  }
}

/** 非流式回包 message.tool_calls → 调用列表（部分网关忽略 stream:true） */
export function parseNonStreamToolCalls(message: unknown): { id: string; name: string; args: Record<string, unknown> }[] {
  if (!message || typeof message !== 'object') return [];
  const tc = (message as { tool_calls?: unknown }).tool_calls;
  if (!Array.isArray(tc)) return [];
  const out: { id: string; name: string; args: Record<string, unknown> }[] = [];
  for (const raw of tc) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as Record<string, unknown>;
    const fn = d.function as Record<string, unknown> | undefined;
    if (!fn || typeof fn.name !== 'string' || !fn.name) continue;
    let args: Record<string, unknown> = {};
    if (typeof fn.arguments === 'string' && fn.arguments.trim()) {
      try {
        args = JSON.parse(fn.arguments) as Record<string, unknown>;
      } catch {
        args = { _raw: fn.arguments.slice(0, 2000) };
      }
    }
    out.push({ id: typeof d.id === 'string' && d.id ? d.id : `nc${out.length + 1}`, name: fn.name, args });
  }
  return out;
}
