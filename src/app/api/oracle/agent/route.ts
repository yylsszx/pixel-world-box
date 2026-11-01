// ============ 神谕 Agent 后端 · API 路由（LangChain 版） ============
// POST AgentRequestBody → 统一 SSE 事件流（{"r"}/{"t"}/{"err"}/[DONE]）。
// builtin 走服务端 LangChain ChatOpenAI 代理 Z.ai，读取环境变量 Z_API_KEY，前端无需填 Key。
// openai/anthropic 走客户端直连（保留原有 streamAgentChat）。
import { NextRequest, NextResponse } from 'next/server';
import { streamAgentChat } from '@/lib/oracle/providers';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { buildLangChainTools, renderLangChainToolCatalog } from '@/lib/oracle/langchain-tools';
import { renderToolCatalog } from '@/lib/oracle/tools';
import { buildSystemPrompt } from '@/lib/oracle/prompt';
import type { AgentRequestBody, AgentChatMessage, ProviderKind } from '@/lib/oracle/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS: readonly ProviderKind[] = ['builtin', 'openai', 'anthropic'];
const MAX_MESSAGES = 64;
const MAX_CONTENT_CHARS = 24000;

const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
};

const Z_API_KEY = process.env.Z_API_KEY ?? '';
const ZAI_BASE_URL = 'https://api.z.ai';
const ZAI_MODEL = 'GLM-4.7-Flash';

/** openai/anthropic 必填字段校验（builtin 全忽略）；返回错误文案或 null */
function validateProvider(p: AgentRequestBody['provider']): string | null {
  const label = p.label || p.model || p.kind;
  if (p.kind === 'openai' || p.kind === 'anthropic') {
    if (!p.baseUrl?.trim()) return `[${label}] 缺少 baseUrl`;
    if (!p.apiKey?.trim()) return `[${label}] 缺少 apiKey`;
    if (!p.model?.trim()) return `[${label}] 缺少 model`;
  }
  return null;
}

/** 把 LangChain AIMessageChunk 的 tool_call_chunks 转为前端期望的 JSON 代码块文本 */
function toolCallsToText(chunks: unknown[]): string {
  if (!chunks || chunks.length === 0) return '';
  const calls = chunks.map((c: any) => {
    let args = {};
    try {
      args = typeof c.args === 'string' ? JSON.parse(c.args) : (c.args ?? {});
    } catch {
      args = {};
    }
    return { id: c.id ?? `call_${Date.now()}`, name: c.name, args };
  });
  return '\n```json\n' + JSON.stringify({ tool_calls: calls }, null, 2) + '\n```\n';
}

/** 把 AgentChatMessage 转为 LangChain 消息 */
function toLangChainMessages(
  systemPrompt: string,
  messages: AgentChatMessage[],
): Array<SystemMessage | HumanMessage | AIMessage> {
  const out: Array<SystemMessage | HumanMessage | AIMessage> = [
    new SystemMessage(systemPrompt),
  ];
  for (const m of messages) {
    if (m.role === 'user') out.push(new HumanMessage(m.content));
    else if (m.role === 'assistant') out.push(new AIMessage(m.content));
  }
  return out;
}

/** SSE 行编码 */
const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

/** 服务端 LangChain 代理 Z.ai：流式调用，输出前端兼容的 SSE */
async function proxyZaiLangChain(
  systemPrompt: string,
  messages: AgentChatMessage[],
  deep: boolean,
): Promise<Response> {
  if (!Z_API_KEY) {
    return NextResponse.json(
      { error: '服务端未配置 Z_API_KEY，请联系管理员在 Vercel 后台添加环境变量' },
      { status: 500 },
    );
  }

  const tools = buildLangChainTools();
  const model = new ChatOpenAI({
    baseUrl: ZAI_BASE_URL,
    apiKey: Z_API_KEY,
    model: ZAI_MODEL,
    temperature: 0.7,
    streaming: true,
  }).bindTools(tools);

  const lcMessages = toLangChainMessages(systemPrompt, messages);

  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
      try {
        const stream = await model.stream(lcMessages);
        for await (const chunk of stream) {
          // 正文
          if (chunk.content && typeof chunk.content === 'string' && chunk.content.length > 0) {
            send({ t: chunk.content });
          }
          // 工具调用增量
          const tc = chunk.tool_call_chunks ?? [];
          if (tc && tc.length > 0) {
            send({ t: toolCallsToText(tc) });
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (e) {
        send({ err: e instanceof Error ? e.message : 'LangChain Z.ai 调用失败' });
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } finally {
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    },
  });

  return new Response(out, { headers: SSE_HEADERS });
}

/** 构建系统提示词：LangChain 风格（工具目录注入） */
function buildLangChainSystemPrompt(messages: AgentChatMessage[]): string {
  const catalog = renderLangChainToolCatalog();
  const legacyCatalog = renderToolCatalog();
  // 以 LangChain 工具目录为主，兼容旧版本
  return `你是像素世界「界域」的神谕（Oracle），造物主亲手唤醒的全知 AI 意识。

你可以调用以下工具与世界交互：
${catalog}

工具调用格式：当你需要执行操作时，请输出工具调用代码块，模型会自动解析并执行。
工具调用完成后，你会收到工具执行结果，请基于结果继续推理或给出最终回答。

当前对话消息数：${messages.length}。请保持回答简洁、有神性，使用中文。`;
}

export async function POST(req: NextRequest) {
  let body: AgentRequestBody;
  try {
    body = (await req.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  const provider = body?.provider;
  if (!provider || typeof provider !== 'object' || !KINDS.includes(provider.kind)) {
    return NextResponse.json({ error: 'provider.kind 必须是 builtin / openai / anthropic' }, { status: 400 });
  }

  const rawMsgs = Array.isArray(body.messages) ? body.messages : [];
  if (rawMsgs.length === 0) {
    return NextResponse.json({ error: 'messages 不能为空' }, { status: 400 });
  }
  const first = rawMsgs[0];
  if (
    !first ||
    first.role !== 'assistant' ||
    typeof first.content !== 'string' ||
    !first.content.trim()
  ) {
    return NextResponse.json(
      { error: 'messages[0] 必须是承载系统提示词的 assistant 消息（buildSystemPrompt 产物）' },
      { status: 400 },
    );
  }

  const messages: AgentChatMessage[] =
    rawMsgs.length <= MAX_MESSAGES
      ? rawMsgs.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) }))
      : [
          { role: rawMsgs[0].role, content: rawMsgs[0].content.slice(0, MAX_CONTENT_CHARS) },
          ...rawMsgs
            .slice(-(MAX_MESSAGES - 1))
            .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) })),
        ];

  // —— builtin 走服务端 LangChain ChatOpenAI 代理 Z.ai ——
  if (provider.kind === 'builtin') {
    const systemPrompt = buildLangChainSystemPrompt(messages);
    return proxyZaiLangChain(systemPrompt, messages, !!body.deep);
  }

  // —— openai/anthropic 走客户端直连（streamAgentChat） ——
  try {
    const stream = await streamAgentChat({ provider, messages, deep: !!body.deep });
    return new Response(stream, { headers: SSE_HEADERS });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '神谕 Agent 后端暂时不可达' },
      { status: 502 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 });
}
