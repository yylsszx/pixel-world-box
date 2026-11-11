// ============ PWB 神谕中继后端 · Cloudflare Workers 版（v1.0） ============
// 职责：为 GitHub Pages 静态前端提供云端厂商统一 SSE 网关（与 oracle-server v1.2 线协议逐字段一致）——
//   GET  /healthz            健康检查（部署链探活）
//   GET  /api/oracle/agent    405（前端 probeSiteBackend 以 405 识别「后端在」）
//   POST /api/oracle/agent   AgentRequestBody → 统一 SSE（{"r"|"t"|"err"} + [DONE]）
//   GET  /api/civ-brain      405（POST only）
//   POST /api/civ-brain      {provider, civ, persona} → {personaPatch, note}（非流式收全量后提取 JSON）
// 设计铁律：
//   ① 零 npm 依赖——单文件 Web 标准 API，wrangler deploy 即活。
//   ② 与 oracle-server / Next 路由三端同一线协议（同一前端无差别切换）。
//   ③ apiKey 只经内存转发，绝不写日志；错误信息不回显密钥。
//   ④ CORS 全放行（与 oracle-server 一致）；不含任何游戏逻辑。
//   ⑤ 服务端默认厂商注入（专业后端核心）：env 配 DEFAULT_OPENAI_API_KEY / _BASE_URL / _MODEL 后，
//     请求侧 apiKey/baseUrl/model 任一留空即由服务端密钥补全——密钥永不出现在前端。
//     builtin 同理映射到默认厂商（议会/内置 Z.ai 通道在线上静态托管时由此接活）。
//   ⑥ dsh 持久会话面不在本版支持范围（前端显式开关才发，发来则 400 明示）。
// 部署：GitHub Actions（.github/workflows/deploy-worker.yml）用仓库密钥 CLOUDFLARE_API_TOKEN 自动部署；
//   默认厂商三元组经仓库密钥 ORACLE_OPENAI_API_KEY / _BASE_URL / _MODEL 在部署时 wrangler secret put。

const VERSION = '1.0.0';
const TIMEOUT_MS = 120_000;
const MAX_MESSAGES = 64;
const MAX_CONTENT_CHARS = 24_000;
const CIV_BRAIN_DIMS = ['war', 'build', 'farm', 'trade', 'sea', 'faith'];

// ============ 应答工具 ============

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
  'Access-Control-Max-Age': '86400',
};

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  ...CORS_HEADERS,
};

function jsonBody(code, obj) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

const sse = (obj) => `data: ${JSON.stringify(obj)}\n\n`;

/** 把 async run(send) 包成 SSE 应答：错误 → err 事件，末尾恒发 [DONE]（与 oracle-server sseResponse 同行为） */
function sseResponse(request, run) {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  const send = (obj) => writer.write(enc.encode(sse(obj)));
  // Workers 惯例：不 await 任务本体，由 runtime 随响应流驱动；客户端断开由 request.signal 联动上游
  (async () => {
    try {
      await run(send);
    } catch (e) {
      try { await send({ err: e && e.message ? e.message : String(e) }); } catch { /* 客户端已断开 */ }
    }
    try {
      await writer.write(enc.encode('data: [DONE]\n\n'));
      await writer.close();
    } catch { /* 已断开 */ }
  })();
  return new Response(readable, { headers: SSE_HEADERS });
}

// ============ 通用工具 ============

function jsonRec(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null;
}

/** 非 2xx → 含状态码与响应体摘要（截断 300 字）的错误 */
async function describeBadResponse(label, res) {
  let text = '';
  try { text = await res.text(); } catch { /* ignore */ }
  if (text.length > 300) text = `${text.slice(0, 300)}…`;
  return `[${label}] HTTP ${res.status}${text ? `：${text}` : '（空响应体）'}`;
}

/** 120s 超时 + 客户端断开联动（Workers 的 request.signal 在客户端断开时 abort） */
function upstreamSignal(request) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  if (typeof AbortSignal.any === 'function' && request.signal) return AbortSignal.any([request.signal, timeout]);
  return request.signal || timeout;
}

// ============ 服务端默认厂商注入（专业后端核心：密钥不进前端） ============

function hasDefaultProvider(env) {
  return typeof env.DEFAULT_OPENAI_API_KEY === 'string' && env.DEFAULT_OPENAI_API_KEY.trim().length > 0;
}

/**
 * 请求侧 provider → 有效上游 provider（服务端密钥补全）。
 * - openai：apiKey/baseUrl/model 任一空 → 用 env 默认三元组补全；
 * - anthropic：透传（厂商密钥体系不同，不注入 openai 默认组）；
 * - builtin：有默认组时映射为默认厂商（议会「内置 Z.ai」与线上静态托管 builtin 由此接活），
 *   无默认组 → 返回 error（调用方折进 err/SSE）。
 */
function resolveProvider(p, env) {
  const kind = String(p.kind ?? '');
  const base = {
    kind,
    label: typeof p.label === 'string' ? p.label : '',
    baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : '',
    apiKey: typeof p.apiKey === 'string' ? p.apiKey : '',
    model: typeof p.model === 'string' ? p.model : '',
    temperature: typeof p.temperature === 'number' ? p.temperature : undefined,
  };
  const dKey = typeof env.DEFAULT_OPENAI_API_KEY === 'string' ? env.DEFAULT_OPENAI_API_KEY.trim() : '';
  const dUrl = typeof env.DEFAULT_OPENAI_BASE_URL === 'string' ? env.DEFAULT_OPENAI_BASE_URL.trim() : '';
  const dModel = typeof env.DEFAULT_OPENAI_MODEL === 'string' ? env.DEFAULT_OPENAI_MODEL.trim() : '';
  if (kind === 'builtin') {
    if (!dKey) {
      return {
        error:
          '内置 Z.ai 需服务端 SDK，本中继未启用——请在「厂商接入」改选 openai 兼容/anthropic 厂商，' +
          '或在部署时配置服务端默认厂商密钥（DEFAULT_OPENAI_API_KEY 等）',
      };
    }
    return {
      kind: 'openai',
      label: base.label || '服务端默认厂商',
      baseUrl: base.baseUrl || dUrl,
      apiKey: dKey,
      model: base.model || dModel,
      temperature: base.temperature,
    };
  }
  if (kind === 'openai') {
    return {
      ...base,
      baseUrl: base.baseUrl || dUrl,
      apiKey: base.apiKey || dKey,
      model: base.model || dModel,
    };
  }
  return base; // anthropic 透传
}

// ============ SSE 上游泵（与 oracle-server 同逻辑） ============

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
      } catch { /* 心跳/注释行 */ }
    }
  }
  return gotAny;
}

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
      try { rec = jsonRec(JSON.parse(payload)); } catch { continue; }
      if (!rec) continue;
      const type = typeof rec.type === 'string' ? rec.type : '';
      if (type === 'content_block_delta') {
        const d = jsonRec(rec.delta) ?? {};
        const thinking = typeof d.thinking === 'string' ? d.thinking : '';
        const text = typeof d.text === 'string' ? d.text : '';
        if (thinking) { gotAny = true; send({ r: thinking }); }
        if (text) { gotAny = true; send({ t: text }); }
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

// ============ 厂商通道（与 oracle-server streamOpenAI/streamAnthropic 同参） ============

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

async function streamOpenAI(provider, messages, send, signal) {
  const label = provider.label || provider.model || 'openai';
  if (!provider.baseUrl) throw new Error(`[${label}] 缺少 baseUrl（且服务端未配置默认厂商）`);
  if (!provider.model) throw new Error(`[${label}] 缺少 model（且服务端未配置默认厂商）`);
  const payload = { model: provider.model, messages, stream: true, max_tokens: 6000 };
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;
  const res = await fetch(normalizeOpenAIUrl(provider.baseUrl), {
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

async function streamAnthropic(provider, messages, send, signal) {
  const label = provider.label || provider.model || 'anthropic';
  if (!provider.baseUrl) throw new Error(`[${label}] 缺少 baseUrl`);
  if (!provider.model) throw new Error(`[${label}] 缺少 model`);
  if (!provider.apiKey) throw new Error(`[${label}] 缺少 apiKey`);
  const { system, messages: merged } = toAnthropicPayload(messages);
  const payload = { model: provider.model, max_tokens: 8192, stream: true, system, messages: merged };
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;
  const res = await fetch(normalizeAnthropicUrl(provider.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': provider.apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(await describeBadResponse(label, res));
  if (!res.body) throw new Error(`[${label}] 响应无流式体`);
  await pumpAnthropicLines(res.body, label, send);
}

// ============ /api/oracle/agent 校验面（与 Next 路由 / oracle-server 同规则） ============

function parseAndValidateAgent(body) {
  const v = jsonRec(body);
  if (!v) return { error: '请求体须为 JSON 对象' };
  const provider = jsonRec(v.provider);
  if (!provider) return { error: 'provider.kind 必须是 builtin / openai / anthropic' };
  const kind = String(provider.kind ?? '');
  if (kind !== 'builtin' && kind !== 'openai' && kind !== 'anthropic') {
    return { error: 'provider.kind 必须是 builtin / openai / anthropic' };
  }
  const rawMsgs = Array.isArray(v.messages) ? v.messages : [];
  if (rawMsgs.length === 0) return { error: 'messages 不能为空' };
  const first = jsonRec(rawMsgs[0]);
  if (
    !first ||
    first.role !== 'assistant' ||
    typeof first.content !== 'string' ||
    !first.content.trim()
  ) {
    return { error: 'messages[0] 必须是承载系统提示词的 assistant 消息（buildSystemPrompt 产物）' };
  }
  for (const m of rawMsgs) {
    const rec = jsonRec(m);
    if (!rec || (rec.role !== 'user' && rec.role !== 'assistant') || typeof rec.content !== 'string' || !rec.content.trim()) {
      return { error: 'messages 每条须为 {role:"user"|"assistant", content:非空字符串}' };
    }
  }
  const messages =
    rawMsgs.length <= MAX_MESSAGES
      ? rawMsgs.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) }))
      : [
          { role: rawMsgs[0].role, content: rawMsgs[0].content.slice(0, MAX_CONTENT_CHARS) },
          ...rawMsgs.slice(-(MAX_MESSAGES - 1)).map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) })),
        ];
  if (v.dsh !== undefined) {
    return { error: 'Workers 版中继暂不支持 dsh 持久会话面——请关闭「持久会话」开关（Sealos 版支持）' };
  }
  return { provider, messages };
}

// ============ /api/civ-brain 非流式决策（与 oracle-server 同心智） ============

function civBrainMessages(civ, persona) {
  const sys = [
    '你是像素沙盒世界中一个文明的「中枢核心」——这个文明唯一的超级决策智能体。',
    '你以王国的整体存续与繁荣为唯一目标，基于国情与禀性做出本年度国策决断。',
    '你只输出一个 JSON 对象，禁止任何其它文本、markdown 代码块或解释。格式：',
    '{"personaPatch":{"war":0.55,"farm":0.7},"note":"一句话决策纪要"}',
    '规则：',
    '1. personaPatch 每维都是 0-1 数字（war 好战 / build 筑城 / farm 重农 / trade 通商 / sea 向海 / faith 虔信），只需给出想调整的维度，每维相对当前值变动幅度 ≤0.2。',
    '2. note：不超过 40 字的中文决策纪要（以该王国的口吻，如「粮仓将罄，举国恳田，暂休刀兵」）。',
    `3. 当前人格六维：${JSON.stringify(persona ?? {})}`,
    `4. 本年度国情速报：${JSON.stringify(civ ?? {})}`,
  ].join('\n');
  return [
    { role: 'assistant', content: sys },
    { role: 'user', content: '请做出本年度的中枢决策（只输出 JSON）。' },
  ];
}

function extractCivJson(text) {
  const s = text.indexOf('{');
  if (s < 0) return null;
  let depth = 0;
  for (let i = s; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(s, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// ============ 入口 ============

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // —— CORS 预检 ——
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    // —— 健康检查（部署链探活；如实上报默认厂商是否启用，不泄漏密钥） ——
    if (path === '/healthz' && request.method === 'GET') {
      return jsonBody(200, {
        ok: true,
        service: 'pwb-oracle-worker',
        version: VERSION,
        default_provider: hasDefaultProvider(env),
        endpoints: ['GET /healthz', 'POST /api/oracle/agent', 'POST /api/civ-brain'],
      });
    }

    // —— 服务自述 ——
    if (path === '/' && request.method === 'GET') {
      return jsonBody(200, {
        service: 'pwb-oracle-worker',
        version: VERSION,
        endpoints: ['GET /healthz', 'POST /api/oracle/agent', 'POST /api/civ-brain'],
        note:
          'PWB 神谕中继后端（Cloudflare Workers 版）——前端「厂商接入 → 中继后端」填本服务地址即可；' +
          '/api/civ-brain 为文明中枢核心的非流式决策中继。配置服务端默认厂商密钥后，' +
          '请求侧 apiKey/baseUrl/model 留空即由服务端补全（密钥永不出现在前端）。',
      });
    }

    if (path === '/api/oracle/agent') {
      if (request.method !== 'POST') return jsonBody(405, { error: 'POST only' });
      let body;
      try { body = await request.json(); } catch { return jsonBody(400, { error: '请求体不是合法 JSON' }); }
      const v = parseAndValidateAgent(body);
      if (v.error) return jsonBody(400, { error: v.error });
      const resolved = resolveProvider(v.provider, env);
      if (resolved.error) return jsonBody(400, { error: resolved.error });
      const messages = v.messages;
      const signal = upstreamSignal(request);
      return sseResponse(request, async (send) => {
        if (resolved.kind === 'anthropic') await streamAnthropic(resolved, messages, send, signal);
        else await streamOpenAI(resolved, messages, send, signal);
      });
    }

    if (path === '/api/civ-brain') {
      if (request.method !== 'POST') return jsonBody(405, { error: 'POST only' });
      let body;
      try { body = await request.json(); } catch { return jsonBody(400, { error: '请求体不是合法 JSON' }); }
      const rec = jsonRec(body);
      const provider = jsonRec(rec?.provider) ?? null;
      const kind = provider ? String(provider.kind) : '';
      if (kind !== 'builtin' && kind !== 'openai' && kind !== 'anthropic') {
        return jsonBody(400, { error: 'provider.kind 必须是 builtin / openai / anthropic' });
      }
      const resolved = resolveProvider(provider, env);
      if (resolved.error) return jsonBody(400, { error: resolved.error });
      const messages = civBrainMessages(jsonRec(rec?.civ), jsonRec(rec?.persona));
      // 非流式语义：复用流式通道收全量文本，提取 JSON 一次性返回（15s 超时保护——外脑再慢不拖垮客户端）
      const CIV_TIMEOUT_MS = 15_000;
      const civSignal = AbortSignal.timeout(CIV_TIMEOUT_MS);
      try {
        let text = '';
        let streamErr = '';
        const send = (ev) => {
          if (ev && typeof ev.t === 'string') text += ev.t;
          if (ev && typeof ev.err === 'string' && !text) streamErr = ev.err;
        };
        await Promise.race([
          (async () => {
            if (resolved.kind === 'anthropic') await streamAnthropic(resolved, messages, send, civSignal);
            else await streamOpenAI(resolved, messages, send, civSignal);
          })(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('外脑超时（15s）')), CIV_TIMEOUT_MS)),
        ]);
        if (!text) return jsonBody(502, { error: streamErr || '外脑无输出' });
        const obj = extractCivJson(text);
        if (!obj) return jsonBody(502, { error: '外脑未输出可解析的 JSON 决策' });
        const personaPatch = {};
        const raw = jsonRec(obj.personaPatch) ?? {};
        for (const dim of CIV_BRAIN_DIMS) {
          const dv = raw[dim];
          if (typeof dv === 'number' && Number.isFinite(dv)) personaPatch[dim] = Math.max(0.05, Math.min(0.95, dv));
        }
        const note = typeof obj.note === 'string' ? obj.note.slice(0, 80) : '';
        return jsonBody(200, { personaPatch, note });
      } catch (e) {
        return jsonBody(502, { error: e && e.message ? e.message : '上游不可达' });
      }
    }

    return jsonBody(404, { error: `未知路径 ${path}` });
  },
};
