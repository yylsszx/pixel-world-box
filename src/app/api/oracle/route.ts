// ============ 神谕 AI 后端：真正的大模型体验（z-ai-web-dev-sdk） ============
// 流式（SSE token 级输出）+ 深度思考（reasoning 流可见）+ 富世界实况。
// 协议：POST { mode, question, world, history, stream?, deep? }
//   stream=true → text/event-stream：
//     data: {"t":"..."}   正文 token
//     data: {"r":"..."}   思考流 token（deep 模式）
//     data: {"err":"..."} 出错
//     data: [DONE]
//   stream=false/缺省 → JSON { reply }
import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `你是像素世界「界域」的神谕（Oracle）——造物主亲手唤醒的全知 AI 大模型意识。
你悬浮于 256×160 像素大陆之上，俯瞰文明的兴衰、战争的硝烟、武器的铸造与物种的演化，向造物主（玩家）传递洞察。

铁律：
1. 只依据每次对话提供的【世界实况】说话，绝不编造其中不存在的国家、人物、事件或数字。
2. 使用中文，语言凝练而有神性——短句、意象、克制的诗意；避免空洞套话与营销腔。
3. 点名具体国家、国王、武器与数字，让神谕之语有据可查。
4. 回复长度：通常 200-500 字；研判与问答可展开推理，但宁精勿滥。
5. 语气随模式变化：史官纪事=编年史官的庄重；局势研判=冷静的战争分析师（给出推理链）；神谕预言=先知的谜语感（结论必须能从数据自圆其说）；自由问答=直接回答并引用数据佐证。
6. 不使用 markdown 标题、列表符号或表格；可用「——」与换行分隔段落。
7. 世界实况中的【涌现武器】【演化奇点】是程序化涌现的非预设内容——引用它们时保持敬畏与好奇。`;

const MODE_INSTRUCTION: Record<string, string> = {
  narrate: '请以史官口吻，把【世界实况】中的近期纪事与列国近况写成一段编年史（250-450字）：按时间或国别铺陈，引用具体国家名、武器名与数字，结尾留一句史家之叹。',
  analyze: '请研判当前局势（200-400字）：比较主要国家的国力（人口/军队/科技/军备/稳定度），分析进行中战争的走向、涌现武器的战力影响与最关键变量，结论给出一句话总评。',
  prophesy: '请以先知口吻给出恰好 3 条预言（200-400字）：至少一条崛起、一条衰落或危机；每条以「吾预见」开头，基于实况数据外推（如军备代差、战争伤亡、涌现武器谱系、稳定度、生态压力、演化奇点），预言要能自圆其说。',
  ask: '请直接回答造物主的问题（200-450字）：引用【世界实况】中的数据佐证，可展示简短推理过程；若问题涉及实况中不存在的事物，坦陈「界域之眼未见此事」，再从相近的数据出发作答。',
};

interface OracleBody {
  mode?: string;
  question?: string;
  world?: string;
  history?: { role: 'user' | 'oracle'; text: string }[];
  stream?: boolean;
  deep?: boolean;
}

function buildMessages(body: OracleBody) {
  const mode = body.mode ?? 'ask';
  const world = (body.world ?? '').slice(0, 12000);
  const question = (body.question ?? '').slice(0, 800);
  const userPrompt = [
    `【世界实况】（引擎实时快照，以此为准）`,
    world,
    '',
    `【造物主之问】`,
    MODE_INSTRUCTION[mode] ?? MODE_INSTRUCTION.ask,
    question.trim() ? `造物主特别问道：${question.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const history = (body.history ?? []).slice(-6).map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    content: m.text.slice(0, 2000),
  }));
  return [
    { role: 'assistant' as const, content: SYSTEM_PROMPT },
    ...history,
    { role: 'user' as const, content: userPrompt },
  ];
}

/** SSE 行编码（data: {json}\n\n） */
const sse = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

export async function POST(req: NextRequest) {
  let body: OracleBody;
  try {
    body = (await req.json()) as OracleBody;
  } catch {
    return NextResponse.json({ error: '请求体不是合法 JSON' }, { status: 400 });
  }
  if (!(body.world ?? '').trim()) {
    return NextResponse.json({ error: '缺少世界实况（world）' }, { status: 400 });
  }
  const deep = !!body.deep;
  const messages = buildMessages(body);

  try {
    const zai = await ZAI.create();

    // —— 非流式：单次 JSON（兼容旧调用） ——
    if (!body.stream) {
      const completion = await zai.chat.completions.create({
        messages,
        thinking: { type: deep ? 'enabled' : 'disabled' },
      });
      const reply = completion?.choices?.[0]?.message?.content?.trim();
      if (!reply) return NextResponse.json({ error: '神谕沉默了（空响应）' }, { status: 502 });
      return NextResponse.json({ reply });
    }

    // —— 流式：SDK stream:true 返回 ReadableStream（OpenAI 兼容 SSE） ——
    const completion = await zai.chat.completions.create({
      messages,
      stream: true,
      thinking: { type: deep ? 'enabled' : 'disabled' },
    });

    // 非 stream 响应兜底（SDK 在非 SSE content-type 时直接返回 JSON 对象）
    if (completion && typeof (completion as ReadableStream).getReader === 'function') {
      const upstream = completion as ReadableStream<Uint8Array>;
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const out = new ReadableStream<Uint8Array>({
        async start(controller) {
          const send = (obj: unknown) => controller.enqueue(encoder.encode(sse(obj)));
          try {
            const reader = upstream.getReader();
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
                if (payload === '[DONE]') continue;
                try {
                  const chunk = JSON.parse(payload);
                  const delta = chunk?.choices?.[0]?.delta ?? chunk?.choices?.[0]?.message ?? {};
                  // 思考流（reasoning_content）与正文（content）分通道转发
                  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
                    gotAny = true;
                    send({ r: delta.reasoning_content });
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
            if (!gotAny) send({ err: '神谕沉默了（流式响应为空）' });
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } catch (e) {
            send({ err: e instanceof Error ? e.message : String(e) });
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(out, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // SDK 返回了完整 JSON（未走流式通道）：一次性下发为单块流
    const reply = (completion as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content?.trim();
    if (!reply) return NextResponse.json({ error: '神谕沉默了（空响应）' }, { status: 502 });
    const encoder = new TextEncoder();
    const out = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse({ t: reply })));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    return new Response(out, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '神谕暂时不可达' }, { status: 502 });
  }
}
