// ============ 文明中枢核心 · 外脑 API（【机制④】每文明可接不同 API） ============
// POST { provider: OracleProviderConfig, civ: 国情摘要, persona: 当前人格 } → { personaPatch, note }
// · 各文明可接不同 API：provider 随请求体传入（openai 兼容端点 / anthropic / builtin 均合法）
// · 非流式语义：内部复用 providers 流式通道收全量文本，再提取 JSON 一次性返回
// · 白名单校验：personaPatch 仅接受 war/build/farm/trade/sea/faith 六维数字（引擎端还会 clamp 0.05-0.95）
// · 超时保护：15s——外脑再慢也不能拖垮客户端请求
import { NextRequest, NextResponse } from 'next/server';
import { streamAgentChat } from '@/lib/oracle/providers';
import type { AgentRequestBody, AgentChatMessage } from '@/lib/oracle/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERSONA_DIMS = ['war', 'build', 'farm', 'trade', 'sea', 'faith'] as const;
const TIMEOUT_MS = 15_000;

/** 组装中枢决策提示词（messages[0] = assistant 系统提示词——与 /api/oracle/agent 协议一致） */
function buildMessages(civ: unknown, persona: unknown): AgentChatMessage[] {
  const sys = [
    '你是像素沙盒世界中一个文明的「中枢核心」——这个文明唯一的超级决策智能体。',
    '你以王国的整体存续与繁荣为唯一目标，基于国情与禀性做出本年度国策决断。',
    '你只输出一个 JSON 对象，禁止任何其它文本、markdown 代码块或解释。格式：',
    '{"personaPatch":{"war":0.55,"farm":0.7},"note":"一句话决策纪要"}',
    '规则：',
    '1. personaPatch 每维都是 0-1 数字（war 好战 / build 筑城 / farm 重农 / trade 通商 / sea 向海 / faith 虔信），只需给出想调整的维度，每维相对当前值变动幅度 ≤0.2。',
    '2. note：不超过 40 字的中文决策纪要（以该王国的口吻，如「粮仓将罄，举国恳田，暂休刀兵」）。',
    `3. 当前人格六维：${JSON.stringify(persona)}`,
    `4. 本年度国情速报：${JSON.stringify(civ)}`,
  ].join('\n');
  return [
    { role: 'assistant', content: sys },
    { role: 'user', content: '请做出本年度的中枢决策（只输出 JSON）。' },
  ];
}

/** 收集流式通道全量文本（解析 data: {"t":"..."} 行 + [DONE]） */
async function collectStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload) as { t?: unknown; err?: unknown };
        if (typeof obj.t === 'string') out += obj.t;
        if (typeof obj.err === 'string' && !out) throw new Error(obj.err);
      } catch {
        /* 非 JSON 行跳过 */
      }
    }
  }
  return out;
}

/** 从模型输出中提取第一个 JSON 对象（容忍代码块围栏与前后杂文） */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.replace(/```(?:json)?/g, '');
  const s = fenced.indexOf('{');
  if (s < 0) return null;
  let depth = 0;
  for (let i = s; i < fenced.length; i++) {
    if (fenced[i] === '{') depth++;
    else if (fenced[i] === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(fenced.slice(s, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  let body: { provider?: unknown; civ?: unknown; persona?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }
  const provider = body.provider as AgentRequestBody['provider'] | undefined;
  if (!provider || typeof provider !== 'object' || !['builtin', 'openai', 'anthropic'].includes(String((provider as { kind?: unknown }).kind))) {
    return NextResponse.json({ error: 'provider.kind 必须是 builtin / openai / anthropic' }, { status: 400 });
  }
  if ((provider as { kind: string }).kind !== 'builtin') {
    const p = provider as { baseUrl?: string; model?: string; label?: string };
    const label = p.label || p.model || '外脑';
    if (!p.baseUrl?.trim()) return NextResponse.json({ error: `[${label}] 缺少 baseUrl` }, { status: 400 });
    if ((provider as { kind: string }).kind === 'anthropic' && !(provider as { apiKey?: string }).apiKey?.trim()) {
      return NextResponse.json({ error: `[${label}] 缺少 apiKey` }, { status: 400 });
    }
    if (!p.model?.trim()) return NextResponse.json({ error: `[${label}] 缺少 model` }, { status: 400 });
  }
  try {
    const stream = await streamAgentChat({ provider, messages: buildMessages(body.civ, body.persona), deep: false });
    const text = await Promise.race([
      collectStreamText(stream),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('外脑超时（15s）')), TIMEOUT_MS)),
    ]);
    const obj = extractJson(text);
    if (!obj) return NextResponse.json({ error: '外脑未输出可解析的 JSON 决策' }, { status: 502 });
    // —— 白名单过滤：六维数字 + note 字符串（引擎端仍有 clamp 二道闸）——
    const personaPatch: Record<string, number> = {};
    const raw = (obj.personaPatch ?? {}) as Record<string, unknown>;
    for (const dim of PERSONA_DIMS) {
      const v = raw[dim];
      if (typeof v === 'number' && Number.isFinite(v)) personaPatch[dim] = Math.max(0.05, Math.min(0.95, v));
    }
    const noteRaw = obj.note;
    const note = typeof noteRaw === 'string' ? noteRaw.slice(0, 80) : '';
    return NextResponse.json({ personaPatch, note });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '中枢外脑暂时不可达' }, { status: 502 });
  }
}

export async function GET() {
  return NextResponse.json({ error: 'POST only' }, { status: 405 });
}
