// ============ 神谕 Agent 后端 · Z.ai 云平台桥（客户端直连，无需服务端） ============
// 直接通过 fetch 调用 z.ai REST API（OpenAI 兼容格式），绕过 /api/oracle/agent 服务端路由。
// 适合 GitHub Pages 静态导出部署：移动端打开即可用，无需 Node.js 服务端。
//
// z.ai API 调用方式（参考 z-ai-web-dev-sdk 源码）：
//   POST ${baseUrl}/chat/completions
//   Headers: Authorization: Bearer <apiKey>, Content-Type: application/json, X-Z-AI-From: Z
//   Body: OpenAI 格式的 chat/completions 请求（stream=true 返回 SSE）

/** SSE 行解析：逐行提取 data: {...} 中的 t（正文）和 r（思考流）字段 */
async function* pumpZaiSSE(
  upstream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<{ t?: string; r?: string; err?: string }> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      if (signal?.aborted) throw new Error('Z.ai 请求已中止');
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
          const rec = JSON.parse(payload);
          const delta = rec?.choices?.[0]?.delta ?? rec?.choices?.[0]?.message ?? {};
          if (typeof delta.content === 'string' && delta.content)
            yield { t: delta.content };
          if (typeof delta.reasoning_content === 'string' && delta.reasoning_content)
            yield { r: delta.reasoning_content };
        } catch {
          /* 忽略无法解析的行（心跳/注释等） */
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

/** 客户端直接调用 z.ai 云平台，返回完整文本（供 agent 循环使用） */
export async function callZaiModel(
  provider: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    temperature?: number;
  },
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<{ content: string; reasoning: string; err: string }> {
  const baseUrl = (provider.baseUrl ?? 'https://api.z.ai').replace(/\/$/, '');
  const apiKey = provider.apiKey ?? '';
  const model = provider.model ?? '';
  const temperature = typeof provider.temperature === 'number' ? provider.temperature : 0.7;

  if (!apiKey) {
    return {
      content: '',
      reasoning: '',
      err: 'Z.ai 未配置 API Key。请在厂商配置中填入 Z.ai API Key（从 https://platform.z.ai 获取），或切换其他厂商。',
    };
  }

  const content: string[] = [];
  let reasoning = '';
  let err = '';

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Z-AI-From': 'Z',
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
        stream: true,
        temperature,
        thinking: { type: 'disabled' },
      }),
      signal,
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j.error) msg = j.error.message ?? JSON.stringify(j.error);
      } catch {
        /* ignore */
      }
      throw new Error(`[Z.ai] ${msg}`);
    }

    if (!res.body) {
      throw new Error('[Z.ai] 响应无流式体');
    }

    for await (const chunk of pumpZaiSSE(res.body, signal)) {
      if (chunk.t) content.push(chunk.t);
      if (chunk.r) reasoning += chunk.r;
      if (chunk.err) err = chunk.err;
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return { content: content.join(''), reasoning, err };
}