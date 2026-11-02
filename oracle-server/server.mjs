// ============ PWB 神谕中继后端（Sealos 容器版 · v1） ============
// 职责：为 GitHub Pages 静态前端提供云端厂商统一 SSE 网关——
//   GET  /healthz            健康检查（Sealos 探针 / R1 冷启动探测）
//   POST /api/oracle/agent   AgentRequestBody → 统一 SSE（{"r"|"t"|"err"} + [DONE]）
//   GET  /api/oracle/agent   405（前端 probeSiteBackend 以 405 识别「后端在」）
// 设计铁律：
//   ① 零 npm 依赖——纯 node: 内置能力，镜像构建不触网（R1 网络波动韧性）。
//   ② 与 src/app/api/oracle/agent/route.ts 线协议逐字段一致（同一前端无差别切换）。
//   ③ apiKey 只经内存转发，绝不写日志；错误信息不回显密钥。
//   ④ CORS 全放行（前端 corsDirect 直连）；本服务不含任何游戏逻辑，后端与前端产物严格分离（R3）。
//   ⑤ builtin（z-ai-web-dev-sdk）为可选增强：镜像内未安装时给出明确指引，不影响 openai/anthropic。
import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const TIMEOUT_MS = 120_000;
const MAX_BODY_BYTES = 1_000_000; // 1MB 请求体上限
const MAX_MESSAGES = 64;
const MAX_CONTENT_CHARS = 24_000;
const VERSION = '1.0.0';

// ============ SSE 输出 ============

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

/** 统一 SSE 应答头（CORS 全放行 + 禁缓冲） */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': '*',
};

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

/** 把 async run() 包成 SSE 应答：错误 → err 事件，末尾恒发 [DONE] */
async function sseResponse(res, run) {
  res.writeHead(200, SSE_HEADERS);
  const send = (obj) => res.write(sse(obj));
  try {
    await run(send);
  } catch (e) {
    try {
      send({ err: e && e.message ? e.message : String(e) });
    } catch {
      /* 客户端已断开 */
    }
  }
  try {
    res.write('data: [DONE]\n\n');
    res.end();
  } catch {
    /* 已断开 */
  }
}

// ============ 通用工具 ============

function jsonRec(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/** 非 2xx → 含状态码与响应体摘要（截断 300 字）的错误 */
async function describeBadResponse(label, res) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    /* ignore */
  }
  if (text.length > 300) text = `${text.slice(0, 300)}…`;
  return `[${label}] HTTP ${res.status}${text ? `：${text}` : '（空响应体）'}`;
}

/** 120s 超时 + 外部请求中断联动 */
function makeAbort(req) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onClose = () => ctl.abort();
  req.on('close', onClose);
  return {
    signal: ctl.signal,
    cleanup: () => {
      clearTimeout(timer);
      req.off('close', onClose);
    },
  };
}

/** 逐行泵取 OpenAI 兼容 SSE（reasoning_content/reasoning → r，content → t）。返回是否收到过 token */
async function pumpOpenAILines(upstream, send) {
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
        /* 心跳/注释行 */
      }
    }
  }
  return gotAny;
}

/** 逐行泵取 Anthropic SSE（thinking → r / text → t；error → 抛错；message_stop → 收泵） */
async function pumpAnthropicLines(upstream, label, send) {
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
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let rec;
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
        const text = typeof d.text === 'string' ? d.text : '';
        if (thinking) {
          gotAny = true;
          send({ r: thinking });
        }
        if (text) {
          gotAny = true;
          send({ t: text });
        }
      } else if (type === 'error') {
        const errRec = jsonRec(rec.error);
        const msg = errRec && typeof errRec.message === 'string' ? errRec.message : '上游错误';
        throw new Error(`[${label}] ${msg}`);
      } else if (type === 'message_stop') {
        break outer;
      }
    }
  }
  if (!gotAny) send({ err: `[${label}] 流式响应为空` });
}

// ============ 厂商通道（与 src/lib/oracle/providers.ts 同逻辑） ============

function normalizeOpenAIUrl(baseUrl) {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

function normalizeAnthropicUrl(baseUrl) {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/v1/messages')) return base;
  if (base.endsWith('/v1')) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/** messages[0]（assistant 系统提示）→ system 顶层 + user/assistant 交替 */
function toAnthropicPayload(messages) {
  const system = messages[0]?.role === 'assistant' ? messages[0].content : '';
  const rest = messages[0]?.role === 'assistant' ? messages.slice(1) : messages.slice();
  const merged = [];
  for (const m of rest) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else merged.push({ role: m.role, content: m.content });
  }
  if (merged.length === 0) throw new Error('[anthropic] 除系统提示词外至少需要一条消息');
  if (merged[0].role === 'assistant') merged.unshift({ role: 'user', content: '（开始）' });
  return { system, messages: merged };
}

async function streamOpenAI(body, send, signal) {
  const { provider } = body;
  const label = provider.label || provider.model || 'openai';
  const url = normalizeOpenAIUrl(provider.baseUrl ?? '');
  const payload = {
    model: provider.model,
    messages: body.messages,
    stream: true,
    max_tokens: 6000, // 与前端服务端同参：防兼容端点低上限截断 JSON 工具块
  };
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(await describeBadResponse(label, res));
  if (!res.body) throw new Error(`[${label}] 响应无流式体`);
  const gotAny = await pumpOpenAILines(res.body, send);
  if (!gotAny) send({ err: `[${label}] 流式响应为空` });
}

async function streamAnthropic(body, send, signal) {
  const { provider } = body;
  const label = provider.label || provider.model || 'anthropic';
  const url = normalizeAnthropicUrl(provider.baseUrl ?? '');
  const { system, messages } = toAnthropicPayload(body.messages);
  const payload = {
    model: provider.model,
    max_tokens: 8192,
    stream: true,
    system,
    messages,
  };
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': provider.apiKey ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(await describeBadResponse(label, res));
  if (!res.body) throw new Error(`[${label}] 响应无流式体`);
  await pumpAnthropicLines(res.body, label, send);
}

// —— builtin：可选增强（镜像内安装 z-ai-web-dev-sdk 时自动启用） ——

let zaiPromise = null;
async function getZAI() {
  if (!zaiPromise) {
    const mod = await import('z-ai-web-dev-sdk').catch(() => null);
    if (!mod) {
      throw new Error(
        '[builtin] 本镜像未安装 z-ai-web-dev-sdk（可选增强）。请在容器内 npm i z-ai-web-dev-sdk 后重启，或改用 openai/anthropic 厂商。',
      );
    }
    const p = mod.default.create();
    zaiPromise = p;
    p.catch(() => {
      if (zaiPromise === p) zaiPromise = null;
    });
  }
  return zaiPromise;
}

async function streamBuiltin(body, send) {
  const zai = await getZAI();
  const completion = await zai.chat.completions.create({
    messages: body.messages,
    stream: true,
    thinking: { type: body.deep ? 'enabled' : 'disabled' },
  });
  if (completion && typeof completion.getReader === 'function') {
    const gotAny = await pumpOpenAILines(completion, send);
    if (!gotAny) send({ err: '神谕沉默了（流式响应为空）' });
    return;
  }
  const full = completion?.choices?.[0]?.message;
  const reasoning = full?.reasoning_content?.trim();
  const reply = full?.content?.trim();
  if (!reply && !reasoning) throw new Error('神谕沉默了（空响应）');
  if (reasoning) send({ r: reasoning });
  if (reply) send({ t: reply });
}

// ============ 请求校验（与 route.ts 同规则） ============

const KINDS = new Set(['builtin', 'openai', 'anthropic']);

function validateProvider(p) {
  const label = p.label || p.model || p.kind;
  if (p.kind === 'openai' || p.kind === 'anthropic') {
    if (!p.baseUrl?.trim()) return `[${label}] 缺少 baseUrl`;
    if (!p.apiKey?.trim()) return `[${label}] 缺少 apiKey`;
    if (!p.model?.trim()) return `[${label}] 缺少 model`;
  }
  return null;
}

function parseAndValidate(body) {
  const provider = body?.provider;
  if (provider && provider.kind === 'local') {
    return { error: 'local 厂商由浏览器端推理，不经后端转发' };
  }
  if (!provider || typeof provider !== 'object' || !KINDS.has(provider.kind)) {
    return { error: 'provider.kind 必须是 builtin / openai / anthropic' };
  }
  const providerErr = validateProvider(provider);
  if (providerErr) return { error: providerErr };

  const rawMsgs = Array.isArray(body.messages) ? body.messages : [];
  if (rawMsgs.length === 0) return { error: 'messages 不能为空' };
  const first = rawMsgs[0];
  if (!first || first.role !== 'assistant' || typeof first.content !== 'string' || !first.content.trim()) {
    return { error: 'messages[0] 必须是承载系统提示词的 assistant 消息（buildSystemPrompt 产物）' };
  }
  for (const m of rawMsgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim()) {
      return { error: 'messages 每条须为 {role:"user"|"assistant", content:非空字符串}' };
    }
  }
  const messages =
    rawMsgs.length <= MAX_MESSAGES
      ? rawMsgs.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) }))
      : [
          { role: rawMsgs[0].role, content: rawMsgs[0].content.slice(0, MAX_CONTENT_CHARS) },
          ...rawMsgs
            .slice(-(MAX_MESSAGES - 1))
            .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) })),
        ];
  return { provider, messages, deep: !!body.deep };
}

// ============ HTTP 服务 ============

const BUILTIN_READY = await import('z-ai-web-dev-sdk')
  .then(() => true)
  .catch(() => false);

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];

  // —— CORS 预检 ——
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // —— 健康检查（Sealos 探针 / R1 冷启动探测） ——
  if (url === '/healthz' && req.method === 'GET') {
    json(res, 200, {
      ok: true,
      service: 'pwb-oracle-server',
      version: VERSION,
      uptime_s: Math.round(process.uptime()),
      builtin: BUILTIN_READY,
      node: process.version,
    });
    return;
  }

  if (url === '/api/oracle/agent') {
    if (req.method === 'GET') {
      json(res, 405, { error: 'POST only' });
      return;
    }
    if (req.method !== 'POST') {
      json(res, 405, { error: 'POST only' });
      return;
    }
    // —— 读体（1MB 上限） ——
    const chunks = [];
    let size = 0;
    let tooBig = false;
    await new Promise((resolve) => {
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) {
          tooBig = true;
          resolve();
          return;
        }
        chunks.push(c);
      });
      req.on('end', resolve);
      req.on('error', resolve);
    });
    if (tooBig) {
      json(res, 413, { error: `请求体超限（>${MAX_BODY_BYTES} 字节）` });
      return;
    }
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      json(res, 400, { error: '请求体不是合法 JSON' });
      return;
    }
    const v = parseAndValidate(body);
    if (v.error) {
      json(res, 400, { error: v.error });
      return;
    }
    const { signal, cleanup } = makeAbort(req);
    try {
      await sseResponse(res, async (send) => {
        try {
          if (v.provider.kind === 'builtin') await streamBuiltin({ ...v }, send);
          else if (v.provider.kind === 'anthropic') await streamAnthropic({ ...v }, send, signal);
          else await streamOpenAI({ ...v }, send, signal);
        } finally {
          cleanup();
        }
      });
    } catch (e) {
      // sseResponse 内部已折错；此处兜底防进程崩溃
      if (!res.headersSent) json(res, 502, { error: e && e.message ? e.message : '上游不可达' });
      else try { res.end(); } catch { /* 已断开 */ }
    }
    return;
  }

  if (url === '/' && req.method === 'GET') {
    json(res, 200, {
      service: 'pwb-oracle-server',
      version: VERSION,
      endpoints: ['GET /healthz', 'POST /api/oracle/agent'],
      note: 'PWB 神谕中继后端（Sealos 容器版）——前端「厂商接入 → 中继后端」填本服务地址即可。',
    });
    return;
  }

  json(res, 404, { error: `未知路径 ${url}` });
});

server.listen(PORT, () => {
  console.log(`[pwb-oracle-server] v${VERSION} listening on :${PORT} (builtin=${BUILTIN_READY}, node=${process.version})`);
});

// —— 优雅退出（Sealos 滚动更新） ——
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
