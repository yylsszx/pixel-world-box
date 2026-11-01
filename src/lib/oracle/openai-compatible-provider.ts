// ============ 神谕 Agent 后端 · OpenAI 兼容云平台桥（客户端直连，无需服务端） ============
// 直接通过 fetch 调用任意 OpenAI 兼容 REST API（Z.ai、Agnes、Groq、GitHub Models 等），
// 绕过 /api/oracle/agent 服务端路由。适合 GitHub Pages 静态导出部署。

/** SSE 行解析：逐行提取 data: {...} 中的 content 和 reasoning_content 字段 */
async function* pumpOpenAISSE(
  upstream: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<{ t?: string; r?: string; err?: string }> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      if (signal?.aborted) throw new Error('OpenAI 兼容请求已中止');
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

/** 客户端直接调用 OpenAI 兼容云平台，返回完整文本（供 agent 循环使用） */
export async function callOpenAICompatibleModel(
  provider: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    temperature?: number;
    label?: string;
  },
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<{ content: string; reasoning: string; err: string }> {
  const baseUrl = (provider.baseUrl ?? 'https://api.z.ai').replace(/\/+$/, '');
  const apiKey = provider.apiKey ?? '';
  const model = provider.model ?? '';
  const temperature = typeof provider.temperature === 'number' ? provider.temperature : 0.7;
  const label = provider.label ?? 'OpenAI 兼容';

  if (!apiKey) {
    return {
      content: '',
      reasoning: '',
      err: `${label} 未配置 API Key。请在厂商配置中填入 API Key，或切换其他厂商。`,
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
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role as 'system' | 'user' | 'assistant', content: m.content })),
        stream: true,
        temperature,
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
      throw new Error(`[${label}] ${msg}`);
    }

    if (!res.body) {
      throw new Error(`[${label}] 响应无流式体`);
    }

    for await (const chunk of pumpOpenAISSE(res.body, signal)) {
      if (chunk.t) content.push(chunk.t);
      if (chunk.r) reasoning += chunk.r;
      if (chunk.err) err = chunk.err;
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return { content: content.join(''), reasoning, err };
}