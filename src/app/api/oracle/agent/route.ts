// ============ 神谕 Agent 后端 · API 路由 ============
// POST AgentRequestBody → 统一 SSE 事件流（{"r"}/{"t"}/{"err"}/[DONE]）。
// 协议约定：messages[0] 为 role:'assistant' 的系统提示词（buildSystemPrompt(renderToolCatalog())，
// 由客户端组装）——与 /api/oracle 一致以兼容 SDK 的 assistant 系统提示习惯。
import { NextRequest, NextResponse } from 'next/server';
import { streamAgentChat } from '@/lib/oracle/providers';
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

export async function POST(req: NextRequest) {
  // —— 解析请求体 ——
  let body: AgentRequestBody;
  try {
    body = (await req.json()) as AgentRequestBody;
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }

  // —— 校验 provider ——
  const provider = body?.provider;
  if (!provider || typeof provider !== 'object' || !KINDS.includes(provider.kind)) {
    return NextResponse.json({ error: 'provider.kind 必须是 builtin / openai / anthropic' }, { status: 400 });
  }
  const providerErr = validateProvider(provider);
  if (providerErr) return NextResponse.json({ error: providerErr }, { status: 400 });

  // —— 校验 messages：非空、逐条合法、首条为承载系统提示词的 assistant ——
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
  for (const m of rawMsgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim()) {
      return NextResponse.json({ error: 'messages 每条须为 {role:"user"|"assistant", content:非空字符串}' }, { status: 400 });
    }
  }

  // —— 防滥用裁剪：上限 64 条（保首条系统提示 + 最近消息，超限丢中间最旧段）、单条 content 截断 24000 字符 ——
  const messages: AgentChatMessage[] =
    rawMsgs.length <= MAX_MESSAGES
      ? rawMsgs.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) }))
      : [
          { role: rawMsgs[0].role, content: rawMsgs[0].content.slice(0, MAX_CONTENT_CHARS) },
          ...rawMsgs
            .slice(-(MAX_MESSAGES - 1))
            .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) })),
        ];

  // —— 流式调用（provider 构造失败 → 预流式 502 JSON） ——
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
