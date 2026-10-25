// ============ 神谕 Agent 后端 · 多厂商统一流式抽象 ============
// streamAgentChat：把 builtin（z-ai-web-dev-sdk）/ openai（OpenAI 兼容）/ anthropic（Claude）
// 三种厂商统一收敛为内部 SSE 事件流（与 /api/oracle 协议一致）：
//   data: {"r":"..."}   思考流 token（reasoning）
//   data: {"t":"..."}   正文 token
//   data: {"err":"..."} 错误
//   data: [DONE]        结束
// 服务端 Node 运行时；绝不把 apiKey 写入任何日志/错误信息。
import ZAI from 'z-ai-web-dev-sdk';
import type { AgentRequestBody, AgentChatMessage } from './types';

/** SSE 行编码（data: {json}\n\n） */
const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

const TIMEOUT_MS = 120_000;

// ============ 通用工具 ============

/** 把 run() 的产出包装成统一 SSE 输出流：错误 → err 事件，末尾恒发 [DONE] */
function makeSSEStream(run: (send: (obj: unknown) => void) => Promise<void>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
      try {
        await run(send);
      } catch (e) {
        try {
          send({ err: e instanceof Error ? e.message : String(e) });
        } catch {
          /* 客户端已断开 */
        }
      }
      try {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch {
        /* 客户端已断开 */
      }
      try {
        controller.close();
      } catch {
        /* 已关闭 */
      }
    },
  });
}

/** 未知 JSON → 安全 Record（供逐行解析第三方 SSE 用） */
function jsonRec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 120s 超时 AbortController */
function makeAbort(): { signal: AbortSignal; timer: ReturnType<typeof setTimeout> } {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  return { signal: ctl.signal, timer };
}

/** 非 2xx → 抛含状态码与响应体摘要（截断 300 字）的错误 */
async function describeBadResponse(label: string, res: Response): Promise<string> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  if (text.length > 300) text = `${text.slice(0, 300)}…`;
  return `[${label}] HTTP ${res.status}${text ? `：${text}` : '（空响应体）'}`;
}

/** 逐行泵取 OpenAI 兼容 SSE（data: 行 → delta.reasoning_content/reasoning → r，delta.content → t）。返回是否收到过任何 token。 */
async function pumpOpenAILines(upstream: ReadableStream<Uint8Array>, send: (obj: unknown) => void): Promise<boolean> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let gotAny = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const rec = jsonRec(JSON.parse(payload));
        const choices = rec && Array.isArray(rec.choices) ? rec.choices : [];
        const first = jsonRec(choices[0]);
        const delta = jsonRec(first?.delta) ?? jsonRec(first?.message) ?? {};
        // 思考流：reasoning_content（DeepSeek/内置 SDK）或 reasoning（部分兼容端点）
        const reasoning =
          typeof delta.reasoning_content === 'string'
            ? delta.reasoning_content
            : typeof delta.reasoning === 'string'
              ? delta.reasoning
              : '';
        if (reasoning) {
          gotAny = true;
          send({ r: reasoning });
        }
        if (typeof delta.content === 'string' && delta.content) {
          gotAny = true;
          send({ t: delta.content });
        }
      } catch {
        // 忽略无法解析的行（心跳/注释等）
      }
    }
  }
  return gotAny;
}

/** 逐行泵取 Anthropic SSE：content_block_delta.delta.thinking → r / .text → t；error → 抛错；message_stop → 终止 */
async function pumpAnthropicLines(
  upstream: ReadableStream<Uint8Array>,
  label: string,
  send: (obj: unknown) => void,
): Promise<void> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let gotAny = false;
  outer: for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue; // event:/注释行跳过——事件类型以 JSON 的 type 字段为准（每条 data 均自带）
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let rec: Record<string, unknown> | null;
      try {
        rec = jsonRec(JSON.parse(payload));
      } catch {
        continue;
      }
      if (!rec) continue;
      const type = typeof rec.type === 'string' ? rec.type : '';
      if (type === 'content_block_delta') {
        const d = jsonRec(rec.delta) ?? {};
        const thinking = typeof d.thinking === 'string' ? d.thinking : '';
        if (thinking) {
          gotAny = true;
          send({ r: thinking });
        }
        const text = typeof d.text === 'string' ? d.text : '';
        if (text) {
          gotAny = true;
          send({ t: text });
        }
      } else if (type === 'error') {
        const errRec = jsonRec(rec.error);
        const msg = errRec && typeof errRec.message === 'string' ? errRec.message : '上游错误';
        throw new Error(`[${label}] ${msg}`);
      } else if (type === 'message_stop') {
        break outer; // 正常结束，立即收泵
      }
    }
  }
  if (!gotAny) send({ err: `[${label}] 流式响应为空` });
}

// ============ builtin：z-ai-web-dev-sdk ============

/** 模块级缓存 ZAI 实例（Promise 复用；失败时清除缓存允许重试） */
let zaiPromise: Promise<Awaited<ReturnType<typeof ZAI.create>>> | null = null;
function getZAI(): Promise<Awaited<ReturnType<typeof ZAI.create>>> {
  if (!zaiPromise) {
    const p = ZAI.create();
    zaiPromise = p;
    p.catch(() => {
      if (zaiPromise === p) zaiPromise = null;
    });
  }
  return zaiPromise;
}

async function streamBuiltin(body: AgentRequestBody): Promise<ReadableStream<Uint8Array>> {
  const zai = await getZAI();
  const completion = await zai.chat.completions.create({
    messages: body.messages,
    stream: true,
    thinking: { type: body.deep ? 'enabled' : 'disabled' },
  });

  // —— 流式：SDK stream:true 返回 OpenAI 兼容 SSE ReadableStream ——
  if (completion && typeof (completion as ReadableStream<Uint8Array>).getReader === 'function') {
    const upstream = completion as ReadableStream<Uint8Array>;
    return makeSSEStream(async (send) => {
      const gotAny = await pumpOpenAILines(upstream, send);
      if (!gotAny) send({ err: '神谕沉默了（流式响应为空）' });
    });
  }

  // —— 兜底：SDK 有时非流式返回完整 JSON 对象 ——
  const full = (completion as { choices?: { message?: { content?: string; reasoning_content?: string } }[] })
    ?.choices?.[0]?.message;
  const reasoning = full?.reasoning_content?.trim();
  const reply = full?.content?.trim();
  if (!reply && !reasoning) throw new Error('神谕沉默了（空响应）');
  return makeSSEStream(async (send) => {
    if (reasoning) send({ r: reasoning });
    if (reply) send({ t: reply });
  });
}

// ============ openai：任意 OpenAI 兼容端点 ============

/** baseUrl 归一化：去尾斜杠；已以 /chat/completions 结尾用原样，否则拼接 */
function normalizeOpenAIUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

async function streamOpenAI(body: AgentRequestBody): Promise<ReadableStream<Uint8Array>> {
  const { provider } = body;
  const label = provider.label || provider.model || 'openai';
  const url = normalizeOpenAIUrl(provider.baseUrl ?? '');
  const payload: Record<string, unknown> = {
    model: provider.model,
    messages: body.messages,
    stream: true,
    // v3：显式 max_tokens 防截断——部分兼容端点默认输出上限很低，
    // 被截断的 JSON 工具调用块会直接导致任务失败（6000 对主流模型均安全）
    max_tokens: 6000,
  };
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;
  // deep：deepseek-r1 / *reason* 等推理模型原生输出 reasoning_content，无需额外参数——解析侧已统一处理

  const { signal, timer } = makeAbort();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(`[${label}] 请求失败：${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const msg = await describeBadResponse(label, res);
    clearTimeout(timer);
    throw new Error(msg);
  }
  if (!res.body) {
    clearTimeout(timer);
    throw new Error(`[${label}] 响应无流式体`);
  }
  const upstream = res.body;
  return makeSSEStream(async (send) => {
    try {
      const gotAny = await pumpOpenAILines(upstream, send);
      if (!gotAny) send({ err: `[${label}] 流式响应为空` });
    } finally {
      clearTimeout(timer); // 超时覆盖整个流式读取过程
    }
  });
}

// ============ anthropic：Claude messages API ============

/** baseUrl 归一化：已含 /v1/messages 用原样；以 /v1 结尾拼 /messages；否则拼 /v1/messages */
function normalizeAnthropicUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/v1/messages')) return base;
  if (base.endsWith('/v1')) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/**
 * 协议转换：我们的约定把系统提示词放在 messages[0]（role:'assistant'，与 /api/oracle 兼容），
 * 而 Anthropic 需要 system 顶层字段 + 严格 user/assistant 交替且首条 user。
 */
function toAnthropicPayload(
  messages: AgentChatMessage[],
): { system: string; messages: { role: 'user' | 'assistant'; content: string }[] } {
  const system = messages[0]?.role === 'assistant' ? messages[0].content : '';
  const rest = messages[0]?.role === 'assistant' ? messages.slice(1) : messages.slice();
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of rest) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`; // 连续同角色合并
    } else {
      merged.push({ role: m.role, content: m.content });
    }
  }
  if (merged.length === 0) throw new Error('[anthropic] 除系统提示词外至少需要一条消息');
  if (merged[0].role === 'assistant') merged.unshift({ role: 'user', content: '（开始）' }); // 防御：首条必须是 user
  return { system, messages: merged };
}

async function streamAnthropic(body: AgentRequestBody): Promise<ReadableStream<Uint8Array>> {
  const { provider } = body;
  const label = provider.label || provider.model || 'anthropic';
  const url = normalizeAnthropicUrl(provider.baseUrl ?? '');
  const { system, messages } = toAnthropicPayload(body.messages);
  const payload: Record<string, unknown> = {
    model: provider.model,
    max_tokens: 8192,
    stream: true,
    system,
    messages,
  };
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;

  const { signal, timer } = makeAbort();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(`[${label}] 请求失败：${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const msg = await describeBadResponse(label, res);
    clearTimeout(timer);
    throw new Error(msg);
  }
  if (!res.body) {
    clearTimeout(timer);
    throw new Error(`[${label}] 响应无流式体`);
  }
  const upstream = res.body;
  return makeSSEStream(async (send) => {
    try {
      await pumpAnthropicLines(upstream, label, send);
    } finally {
      clearTimeout(timer); // 超时覆盖整个流式读取过程
    }
  });
}

// ============ 统一入口 ============

export async function streamAgentChat(body: AgentRequestBody): Promise<ReadableStream<Uint8Array>> {
  switch (body.provider.kind) {
    case 'builtin':
      return streamBuiltin(body);
    case 'openai':
      return streamOpenAI(body);
    case 'anthropic':
      return streamAnthropic(body);
    default:
      throw new Error(`未知的 provider.kind：${String(body.provider.kind)}`);
  }
}
