// ============ 神谕原生函数调用层（Oracle OS v5 · Native Function Calling） ============
// 告别「模型把工具调用写成 markdown JSON 围栏 → 客户端正则抢救解析」的脆弱协议：
//   · OpenAI 兼容端点（DeepSeek / Kimi / 通义千问 / GLM / OpenRouter / Ollama …）原生支持
//     tools + tool_calls 结构化字段——工具调用由协议层承载，解析失败率归零。
// v7 原生接入适配（三协议全家）：在 OpenAI 协议之外接入另外两大原生协议——
//   · Anthropic（Claude Messages API）：tools[{name,description,input_schema}] + tool_use/
//     tool_result 内容块 + 流式 input_json_delta 分片累积；
//   · Google Gemini（generateContent）：tools[{type:'function',functionDeclarations}] +
//     functionCall/functionResponse parts（args 直接是对象，无需 JSON 字符串解析）。
// 本模块：
//   · buildNativeToolParams：把工具目录（按当前权限过滤）编译成 OpenAI tools 参数；
//   · toAnthropicTools / toGeminiTools：OpenAI 形态 → 各家原生形态（单一编译源，三家分发）；
//   · NativeCallAccumulator：OpenAI SSE 流式 delta.tool_calls 的逐块累积器；
//   · AnthropicToolAccumulator：Claude SSE 流式 input_json_delta 的逐块累积器；
//   · parseNonStreamToolCalls：OpenAI 非流式 message.tool_calls 解析；
//   · parseAnthropicToolBlocks：Claude 非流式 content 块解析；
//   · collectGeminiParts：Gemini parts 数组收集（text/thought/functionCall 三色分拣）。
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

// ---------------- v7 原生接入适配：Anthropic / Gemini 工具编译 ----------------

/** Anthropic 工具定义：name/description/input_schema（官方 Messages API 工具形态） */
export interface AnthropicToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** OpenAI 工具形态 → Anthropic 工具形态（parameters 键改名 input_schema，余同构） */
export function toAnthropicTools(tools: OpenAIToolDef[]): AnthropicToolDef[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

/** Gemini 工具声明（generateContent）：{type:'function', functionDeclarations:[{name,description,parameters}]} */
export interface GeminiToolDef {
  type: 'function';
  functionDeclarations: { name: string; description: string; parameters: Record<string, unknown> }[];
}

/** OpenAI 工具形态 → Gemini 工具形态（JSON Schema 同构直迁；单包 functionDeclarations 数组） */
export function toGeminiTools(tools: OpenAIToolDef[]): GeminiToolDef[] {
  if (tools.length === 0) return [];
  return [
    {
      type: 'function',
      functionDeclarations: tools.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      })),
    },
  ];
}

/** 容错参数 JSON 解析：尾逗号/零宽字符修复；坏 JSON 给 {_raw:…} 保调用不丢（三协议共用） */
export function parseToolArgsJson(raw: string): Record<string, unknown> {
  const t = raw.trim();
  if (!t) return {};
  try {
    return JSON.parse(t) as Record<string, unknown>;
  } catch {
    const fixed = t
      .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(fixed) as Record<string, unknown>;
    } catch {
      return { _raw: t.slice(0, 2000) };
    }
  }
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
      out.push({ id: slot.id ?? `nc${out.length + 1}`, name: slot.name, args: parseToolArgsJson(slot.arguments) });
    }
    return out;
  }
}

// ---------------- Anthropic 流式 tool_use 累积器（v7） ----------------

/** Claude SSE 事件序列：content_block_start{index, content_block:{type:'tool_use',id,name}} →
 *  content_block_delta{index, delta:{type:'input_json_delta', partial_json}}… → content_block_stop{index}。
 *  按 index 归位累积 partial_json，收束时一次解析。 */
export class AnthropicToolAccumulator {
  private slots = new Map<number, { id?: string; name?: string; json: string; open: boolean }>();

  /** content_block_start：开启一个 tool_use 块槽位（非 tool_use 块忽略） */
  blockStart(index: number, block: unknown): void {
    const b =
      block !== null && typeof block === 'object' && !Array.isArray(block)
        ? (block as Record<string, unknown>)
        : null;
    if (!b || b.type !== 'tool_use') return;
    this.slots.set(index, {
      id: typeof b.id === 'string' && b.id ? b.id : undefined,
      name: typeof b.name === 'string' && b.name ? b.name : undefined,
      json: '',
      open: true,
    });
  }

  /** content_block_delta：input_json_delta 分片追加到对应槽位（槽位不存在则忽略） */
  blockDelta(index: number, partialJson: string): void {
    const slot = this.slots.get(index);
    if (slot) slot.json += partialJson;
  }

  /** content_block_stop：闭合槽位（后续同 index 复用防护） */
  blockStop(index: number): void {
    const slot = this.slots.get(index);
    if (slot) slot.open = false;
  }

  /** 是否收到过任何 tool_use 块 */
  get got(): boolean {
    return this.slots.size > 0;
  }

  /** 收束：按块序解析累积的 JSON（容错修复共用） */
  finalize(): { id: string; name: string; args: Record<string, unknown> }[] {
    const out: { id: string; name: string; args: Record<string, unknown> }[] = [];
    const ordered = [...this.slots.entries()].sort((a, b) => a[0] - b[0]);
    for (const [, slot] of ordered) {
      if (!slot.name) continue;
      out.push({ id: slot.id ?? `ac${out.length + 1}`, name: slot.name, args: parseToolArgsJson(slot.json) });
    }
    return out;
  }
}

/** Claude 非流式回包：content 数组里的 tool_use 块 → 调用列表（input 直接是对象） */
export function parseAnthropicToolBlocks(content: unknown): { id: string; name: string; args: Record<string, unknown> }[] {
  if (!Array.isArray(content)) return [];
  const out: { id: string; name: string; args: Record<string, unknown> }[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== 'object') continue;
    const b = raw as Record<string, unknown>;
    if (b.type !== 'tool_use' || typeof b.name !== 'string' || !b.name) continue;
    const input = b.input !== null && typeof b.input === 'object' && !Array.isArray(b.input) ? b.input : {};
    out.push({
      id: typeof b.id === 'string' && b.id ? b.id : `ac${out.length + 1}`,
      name: b.name,
      args: input as Record<string, unknown>,
    });
  }
  return out;
}

// ---------------- Gemini parts 收集（v7，流式/非流式共用） ----------------

/** Gemini parts 分拣结果：正文 text / 思考 thought / 工具调用 calls（functionCall.args 直接是对象） */
export interface GeminiPartsResult {
  text: string;
  thought: string;
  calls: { id: string; name: string; args: Record<string, unknown> }[];
}

/** Gemini parts 数组 → 三色分拣（text→正文；thought:true→思考流；functionCall→工具调用）。
 *  functionCall 无原生 id——按名字合成 `g:<name>#<n>`（回传 functionResponse 时反解）。 */
export function collectGeminiParts(parts: unknown): GeminiPartsResult {
  const out: GeminiPartsResult = { text: '', thought: '', calls: [] };
  if (!Array.isArray(parts)) return out;
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.text === 'string' && p.text) {
      if (p.thought === true) out.thought += p.text;
      else out.text += p.text;
    }
    const fc = p.functionCall as Record<string, unknown> | undefined;
    if (fc && typeof fc === 'object' && typeof fc.name === 'string' && fc.name) {
      const args =
        fc.args !== null && typeof fc.args === 'object' && !Array.isArray(fc.args)
          ? (fc.args as Record<string, unknown>)
          : {};
      out.calls.push({ id: `g:${fc.name}#${out.calls.length + 1}`, name: fc.name, args });
    }
  }
  return out;
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
