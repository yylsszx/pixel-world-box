// ============ PWB 神谕中继后端 · Cloudflare Workers 版（v2.0「后端全家桶」） ============
// 职责：为 GitHub Pages 静态前端提供云端 AI 网关 + 云存档 + 结构化决策 + 编年史生成。
//   GET  /healthz             健康检查（部署链探活）
//   GET  /api/capabilities    能力协商（ai / kv / default_provider / 端点清单）
//   GET  /api/oracle/agent    405（前端 probeSiteBackend 以 405 识别「后端在」）
//   POST /api/oracle/agent    AgentRequestBody → 统一 SSE（{"r"|"t"|"err"} + [DONE]）
//   GET  /api/civ-brain       405（POST only）
//   POST /api/civ-brain       {provider, civ, persona} → {personaPatch, note}（非流式收全量后提取 JSON）
//   POST /api/agent/decide   {provider?, civ, world, actions} → {decisions, note}（决策白名单校验）
//   POST /api/chronicle       {provider?, civName, events} → {chronicle}（编年史叙事生成）
//   POST /api/save/backup     {device, slot, name, payload} → 云端存档备份（KV）
//   GET  /api/save/list?device=云端存档清单（KV list by prefix）
//   GET  /api/save/get?device=&slot=读取云端存档
//   POST /api/save/delete     {device, slot} 删除云端存档
// 设计铁律：
//   ① 零 npm 依赖——单文件 Web 标准 API，wrangler deploy 即活。
//   ② 与 oracle-server / Next 路由多端同一线协议（同一前端无差别切换）。
//   ③ apiKey 只经内存转发，绝不写日志；错误信息不回显密钥。
//   ④ CORS 全放行；Worker 不含任何游戏逻辑（决策/编年史只做 LLM 网关 + 白名单校验）。
//   ⑤ 服务端默认厂商注入：env 配 DEFAULT_OPENAI_API_KEY / _BASE_URL / _MODEL 后，
//     请求侧 apiKey/baseUrl/model 任一留空即由服务端密钥补全——密钥永不出现在前端。
//   ⑥ Workers AI 接活（v2.0 核心升级）：binding AI 可用时，builtin 厂商映射为
//     Cloudflare Workers AI（llama-3.1-8b-instruct）——零配置用户直接获得真 AI 神谕，
//     不再必然降级「神谕离线」。免费计划 Workers AI 每日 10k neurons 配额即天然限流。
//   ⑦ 云存档（v2.0）：binding SAVES_KV（KV）+ 备份码鉴权（device code 由前端生成、
//     96bit 熵不可猜测）；KV 免费配额（1k 写/日）即写入限流，429 友好透传。
// 部署：GitHub Actions（.github/workflows/deploy-worker.yml）用仓库密钥 CLOUDFLARE_API_TOKEN
//   自动部署；KV namespace 由 workflow 的 ensure 步骤自动创建并注入 id。
//   默认厂商三元组经仓库密钥 ORACLE_OPENAI_API_KEY / _BASE_URL / _MODEL 注入。

const VERSION = '2.0.0';
const TIMEOUT_MS = 120_000;
const MAX_MESSAGES = 64;
const MAX_CONTENT_CHARS = 24_000;
const CIV_BRAIN_DIMS = ['war', 'build', 'farm', 'trade', 'sea', 'faith'];
const AI_MODEL_DEFAULT = '@cf/meta/llama-3.1-8b-instruct';
const AI_TIMEOUT_MS = 45_000; // Workers AI 上限保护（外脑再慢不拖垮客户端）
const SAVE_PAYLOAD_MAX = 2_000_000; // 存档 2MB 上限（KV value 上限 25MB，留足裕量）
const SAVE_SLOTS_MAX = 100;
const DEVICE_RE = /^pwb-[a-z0-9]{16,32}$/;
const CHRON_EVENTS_MAX = 48;

// ============ 应答工具 ============

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

function hasWorkersAI(env) {
  return !!(env && env.AI && typeof env.AI.run === 'function');
}

function hasSaveKV(env) {
  return !!(env && env.SAVES_KV && typeof env.SAVES_KV.put === 'function');
}

/**
 * 请求侧 provider → 有效上游 provider（服务端密钥补全 + Workers AI 接活）。
 * - builtin：优先 Workers AI（v2.0 核心升级——零配置真 AI）；其次服务端默认厂商组；都无 → error。
 * - workers-ai：显式选择 Workers AI（高级用户），无 binding → error。
 * - openai：apiKey/baseUrl/model 任一空 → 用 env 默认三元组补全。
 * - anthropic：透传（厂商密钥体系不同，不注入 openai 默认组）。
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
    if (hasWorkersAI(env)) {
      return { kind: 'workers-ai', label: 'Cloudflare Workers AI', model: base.model || AI_MODEL_DEFAULT };
    }
    if (!dKey) {
      return {
        error:
          '本中继未启用任何可用内置模型（Workers AI 绑定与服务端默认厂商密钥均未配置）——' +
          '请在「厂商接入」改选 openai 兼容/anthropic 厂商，或联系部署者配置默认厂商密钥',
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
  if (kind === 'workers-ai') {
    if (!hasWorkersAI(env)) return { error: '本中继未绑定 Workers AI（binding AI 未配置）' };
    return { kind: 'workers-ai', label: base.label || 'Cloudflare Workers AI', model: base.model || AI_MODEL_DEFAULT };
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

// ============ Workers AI 通道（v2.0 核心升级：零配置真 AI） ============

/**
 * 前端线协议 messages[0] = assistant（承载系统提示）→ Workers AI 的 system role 转换。
 * Workers AI messages 支持 system/user/assistant；连续同角色合法（无需合并）。
 */
function toWorkersAIMessages(messages) {
  const sys = messages[0]?.role === 'assistant' ? messages[0].content : '';
  const rest = messages[0]?.role === 'assistant' ? messages.slice(1) : messages.slice();
  return { sys, messages: rest };
}

/** 流式：AI.run(model, {messages, stream:true}) → SSE Response → {"response":"…"} 行 → send({t}) */
async function streamWorkersAI(env, provider, messages, send) {
  const label = provider.label || 'Workers AI';
  const { sys, messages: rest } = toWorkersAIMessages(messages);
  const full = sys ? [{ role: 'system', content: sys }, ...rest] : rest;
  const runPromise = env.AI.run(provider.model || AI_MODEL_DEFAULT, {
    messages: full,
    stream: true,
  });
  const aiRes = await Promise.race([
    runPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`[${label}] 生成超时（45s）`)), AI_TIMEOUT_MS)),
  ]);
  if (!aiRes || !aiRes.body) throw new Error(`[${label}] Workers AI 无响应体（可能超出每日免费配额）`);
  const reader = aiRes.body.getReader();
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
        const text = rec && typeof rec.response === 'string' ? rec.response : '';
        if (text) {
          gotAny = true;
          send({ t: text });
        }
      } catch { /* 心跳行 */ }
    }
  }
  if (!gotAny) send({ err: `[${label}] 流式响应为空（可能超出每日免费配额，明日恢复）` });
}

/** 非流式：AI.run(model, {messages, stream:false}) → {response}（civ-brain / decide / chronicle 共用） */
async function runWorkersAIOnce(env, model, messages, timeoutMs) {
  const { sys, messages: rest } = toWorkersAIMessages(messages);
  const full = sys ? [{ role: 'system', content: sys }, ...rest] : rest;
  const out = await Promise.race([
    env.AI.run(model || AI_MODEL_DEFAULT, { messages: full }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('Workers AI 生成超时')), timeoutMs || AI_TIMEOUT_MS)),
  ]);
  if (!out || typeof out.response !== 'string') throw new Error('Workers AI 无输出（可能超出每日免费配额）');
  return out.response;
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
  if (!provider) return { error: 'provider.kind 必须是 builtin / workers-ai / openai / anthropic' };
  const kind = String(provider.kind ?? '');
  if (kind !== 'builtin' && kind !== 'workers-ai' && kind !== 'openai' && kind !== 'anthropic') {
    return { error: 'provider.kind 必须是 builtin / workers-ai / openai / anthropic' };
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

// ============ /api/agent/decide 结构化决策（中枢二笔服务端半件，v2.0） ============
// 设计：Worker 不含游戏逻辑——决策候选与值域由前端传入并由白名单校验器强制；
//       引擎侧接线（消费 decisions 驱动军团/外交/建设）由前端后续轮完成。

const DECIDE_FIELDS = {
  stance: ['expand', 'defend', 'turtle'],
  build_focus: ['farm', 'house', 'tower', 'harbor', 'market', 'wall', 'none'],
};

function decideMessages(civ, world, actions) {
  const sys = [
    '你是像素沙盒世界中一个文明的「中枢核心」，基于国情与列出的可行动清单，做出本年度的宏观数字国策。',
    '你只输出一个 JSON 对象，禁止任何其它文本、markdown 代码块或解释。格式：',
    '{"decisions":{...},"note":"一句话决策纪要"}',
    'decisions 中每个字段都是可选的，只输出你决定调整的：',
    '- stance：外交姿态，"expand"扩张 | "defend"防御 | "turtle"闭守',
    '- build_focus：建设优先，"farm"|"house"|"tower"|"harbor"|"market"|"wall"|"none"',
    '- war_target：宣战目标的王国编号（数字）或 null（须是敌对清单中列出的编号）',
    '- peace_offer：求和目标的王国编号或 null（须是交战清单中列出的编号）',
    '- alliance_target：结盟目标的王国编号或 null',
    '- migration：迁徙方向 0-7（0=北，2=东，4=南，6=西，余对角）或 null',
    '规则：note 不超过 40 字中文（以该王国的口吻）；只依据国情做出最有利于存续与繁荣的选择。',
    `可行动清单（敌对/交战/可结盟王国编号，均为数字数组）：${JSON.stringify(actions ?? {})}`,
    `本年度国情速报：${JSON.stringify(civ ?? {})}`,
    `世界形势：${JSON.stringify(world ?? {})}`,
  ].join('\n');
  return [
    { role: 'assistant', content: sys },
    { role: 'user', content: '请做出本年度的结构化国策（只输出 JSON）。' },
  ];
}

/** 决策白名单校验器：只放行字段值域内的内容，其余丢弃（宁可少决断不可错决断） */
function validateDecide(raw, actions) {
  const src = jsonRec(raw) ?? {};
  const d = jsonRec(src.decisions) ?? {};
  const out = {};
  for (const [field, allowed] of Object.entries(DECIDE_FIELDS)) {
    if (d[field] !== undefined && d[field] !== null && allowed.includes(d[field])) out[field] = d[field];
  }
  const idFields = ['war_target', 'peace_offer', 'alliance_target'];
  for (const f of idFields) {
    const v = d[f];
    if (v === null) { if (f in d) out[f] = null; continue; }
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) {
      const listName = f === 'war_target' ? 'enemies' : f === 'peace_offer' ? 'atWar' : 'canAlly';
      const list = Array.isArray(actions?.[listName]) ? actions[listName] : null;
      // 敌对/交战/结盟目标必须来自清单；清单缺位（前端未传）时拒绝该字段
      if (Array.isArray(list) && list.includes(v)) out[f] = v;
    }
  }
  if (typeof d.migration === 'number' && Number.isInteger(d.migration) && d.migration >= 0 && d.migration <= 7) {
    out.migration = d.migration;
  }
  const note = typeof src.note === 'string' ? src.note.slice(0, 80) : '';
  return { decisions: out, note };
}

// ============ /api/chronicle 编年史生成（v2.0） ============

function chronicleMessages(civName, events) {
  const sys = [
    '你是像素沙盒世界的编年史官，把一段王国的结构化大事记写成简练的编年史叙事。',
    '风格：如《史记》纪传体般凝练的中文，事件间用分号或句号衔接，不虚构大事记之外的内容。',
    `王国名：${civName || '无名王国'}`,
    `大事记（按时间序）：${JSON.stringify(events)}`,
    '输出 120-240 字的编年史正文，只输出正文，禁止解释与 markdown。',
  ].join('\n');
  return [
    { role: 'assistant', content: sys },
    { role: 'user', content: '请撰写这段编年史。' },
  ];
}

function validateChronicleInput(rec) {
  const events = Array.isArray(rec?.events) ? rec.events : [];
  if (events.length === 0) return { error: 'events 不能为空' };
  if (events.length > CHRON_EVENTS_MAX) return { error: `events 超过上限 ${CHRON_EVENTS_MAX} 条` };
  const clean = [];
  for (const ev of events.slice(0, CHRON_EVENTS_MAX)) {
    const e = jsonRec(ev);
    if (!e) continue;
    clean.push({
      year: typeof e.year === 'number' ? e.year : 0,
      type: typeof e.type === 'string' ? e.type.slice(0, 40) : '',
      text: typeof e.text === 'string' ? e.text.slice(0, 160) : '',
    });
  }
  if (clean.length === 0) return { error: 'events 中没有合法条目' };
  return { events: clean, civName: typeof rec.civName === 'string' ? rec.civName.slice(0, 60) : '' };
}

// ============ /api/save/* 云存档（KV，v2.0） ============

function saveKey(device, slot) {
  return `save:${device}:${slot}`;
}

function validateDevice(device) {
  return typeof device === 'string' && DEVICE_RE.test(device);
}

function validateSlot(slot) {
  return Number.isInteger(slot) && slot >= 0 && slot < SAVE_SLOTS_MAX;
}

// ============ 入口 ============

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // —— CORS 预检 ——
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    // —— 健康检查（部署链探活；如实上报能力，不泄漏密钥） ——
    if (path === '/healthz' && request.method === 'GET') {
      return jsonBody(200, {
        ok: true,
        service: 'pwb-oracle-worker',
        version: VERSION,
        default_provider: hasDefaultProvider(env),
        ai: hasWorkersAI(env),
        kv: hasSaveKV(env),
        endpoints: [
          'GET /healthz',
          'GET /api/capabilities',
          'POST /api/oracle/agent',
          'POST /api/civ-brain',
          'POST /api/agent/decide',
          'POST /api/chronicle',
          'POST /api/save/backup',
          'GET /api/save/list',
          'GET /api/save/get',
          'POST /api/save/delete',
        ],
      });
    }

    // —— 能力协商（前端探测后端可服务面，v2.0） ——
    if (path === '/api/capabilities' && request.method === 'GET') {
      return jsonBody(200, {
        service: 'pwb-oracle-worker',
        version: VERSION,
        ai: hasWorkersAI(env),
        ai_model: hasWorkersAI(env) ? AI_MODEL_DEFAULT : null,
        builtin_alive: hasWorkersAI(env) || hasDefaultProvider(env),
        kv: hasSaveKV(env),
        default_provider: hasDefaultProvider(env),
        endpoints: [
          'POST /api/oracle/agent',
          'POST /api/civ-brain',
          'POST /api/agent/decide',
          'POST /api/chronicle',
          'POST /api/save/backup',
          'GET /api/save/list',
          'GET /api/save/get',
          'POST /api/save/delete',
        ],
      });
    }

    // —— 服务自述 ——
    if (path === '/' && request.method === 'GET') {
      return jsonBody(200, {
        service: 'pwb-oracle-worker',
        version: VERSION,
        endpoints: ['GET /healthz', 'GET /api/capabilities', 'POST /api/oracle/agent', 'POST /api/civ-brain', 'POST /api/agent/decide', 'POST /api/chronicle', 'POST /api/save/backup', 'GET /api/save/list', 'GET /api/save/get', 'POST /api/save/delete'],
        note:
          'PWB 神谕中继后端（Cloudflare Workers 版 v2.0）——前端「厂商接入 → 中继后端」填本服务地址即可；' +
          '已绑定 Workers AI 时，builtin（内置）厂商零配置可用；/api/save/* 为云端存档（备份码鉴权）。' +
          '配置服务端默认厂商密钥后，请求侧 apiKey/baseUrl/model 留空即由服务端补全（密钥永不出现在前端）。',
      });
    }

    // —— 云存档：备份 ——
    if (path === '/api/save/backup' && request.method === 'POST') {
      if (!hasSaveKV(env)) return jsonBody(503, { error: '本中继未启用云存档（KV 未绑定）' });
      let body;
      try { body = await request.json(); } catch { return jsonBody(400, { error: '请求体不是合法 JSON' }); }
      const rec = jsonRec(body);
      if (!rec) return jsonBody(400, { error: '请求体须为 JSON 对象' });
      const { device, slot } = { device: rec.device, slot: rec.slot };
      if (!validateDevice(device)) return jsonBody(400, { error: 'device 备份码格式不合法（应为 pwb- 前缀 16-32 位随机十六进制）' });
      if (!validateSlot(slot)) return jsonBody(400, { error: 'slot 须为 0-99 的整数' });
      if (typeof rec.payload !== 'string' || !rec.payload.trim()) return jsonBody(400, { error: 'payload 不能为空' });
      if (rec.payload.length > SAVE_PAYLOAD_MAX) return jsonBody(413, { error: `存档超过大小上限（${Math.round(SAVE_PAYLOAD_MAX / 1000)}KB）` });
      const name = typeof rec.name === 'string' ? rec.name.slice(0, 60) : '';
      try {
        await env.SAVES_KV.put(saveKey(device, slot), rec.payload, {
          metadata: { name, savedAt: Date.now(), size: rec.payload.length },
        });
      } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        if (/exceed|429|limit/i.test(msg)) return jsonBody(429, { error: '云端写入配额已满（免费版每日约 1000 次写入），请明日再试或减少备份频率' });
        return jsonBody(500, { error: `云端写入失败：${msg}` });
      }
      return jsonBody(200, { ok: true, device, slot, savedAt: Date.now() });
    }

    // —— 云存档：清单 ——
    if (path === '/api/save/list' && request.method === 'GET') {
      if (!hasSaveKV(env)) return jsonBody(503, { error: '本中继未启用云存档（KV 未绑定）' });
      const device = url.searchParams.get('device') ?? '';
      if (!validateDevice(device)) return jsonBody(400, { error: 'device 备份码格式不合法' });
      const cursor = url.searchParams.get('cursor') ?? undefined;
      let page;
      try {
        page = await env.SAVES_KV.list({ prefix: `save:${device}:`, cursor: cursor || undefined });
      } catch (e) {
        return jsonBody(500, { error: `云端读取失败：${String(e && e.message ? e.message : e)}` });
      }
      const slots = [];
      for (const k of page.keys) {
        const m = jsonRec(k.metadata) ?? {};
        const slotNum = Number(k.name.split(':')[2]);
        if (!Number.isInteger(slotNum)) continue;
        slots.push({
          slot: slotNum,
          name: typeof m.name === 'string' ? m.name : '',
          savedAt: typeof m.savedAt === 'number' ? m.savedAt : 0,
          size: typeof m.size === 'number' ? m.size : 0,
        });
      }
      slots.sort((a, b) => b.slot - a.slot);
      return jsonBody(200, { device, slots, cursor: page.list_complete ? null : page.cursor });
    }

    // —— 云存档：读取 ——
    if (path === '/api/save/get' && request.method === 'GET') {
      if (!hasSaveKV(env)) return jsonBody(503, { error: '本中继未启用云存档（KV 未绑定）' });
      const device = url.searchParams.get('device') ?? '';
      const slot = Number(url.searchParams.get('slot'));
      if (!validateDevice(device)) return jsonBody(400, { error: 'device 备份码格式不合法' });
      if (!validateSlot(slot)) return jsonBody(400, { error: 'slot 须为 0-99 的整数' });
      let payload;
      try { payload = await env.SAVES_KV.get(saveKey(device, slot), 'text'); } catch { payload = null; }
      if (payload === null || payload === undefined) return jsonBody(404, { error: '该云端槽位没有存档' });
      return jsonBody(200, { device, slot, payload });
    }

    // —— 云存档：删除 ——
    if (path === '/api/save/delete' && request.method === 'POST') {
      if (!hasSaveKV(env)) return jsonBody(503, { error: '本中继未启用云存档（KV 未绑定）' });
      let body;
      try { body = await request.json(); } catch { return jsonBody(400, { error: '请求体不是合法 JSON' }); }
      const rec = jsonRec(body);
      const device = rec?.device;
      const slot = Number(rec?.slot);
      if (!validateDevice(device)) return jsonBody(400, { error: 'device 备份码格式不合法' });
      if (!validateSlot(slot)) return jsonBody(400, { error: 'slot 须为 0-99 的整数' });
      try { await env.SAVES_KV.delete(saveKey(device, slot)); } catch (e) {
        return jsonBody(500, { error: `云端删除失败：${String(e && e.message ? e.message : e)}` });
      }
      return jsonBody(200, { ok: true });
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
        if (resolved.kind === 'workers-ai') await streamWorkersAI(env, resolved, messages, send);
        else if (resolved.kind === 'anthropic') await streamAnthropic(resolved, messages, send, signal);
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
      if (kind !== 'builtin' && kind !== 'workers-ai' && kind !== 'openai' && kind !== 'anthropic') {
        return jsonBody(400, { error: 'provider.kind 必须是 builtin / workers-ai / openai / anthropic' });
      }
      const resolved = resolveProvider(provider, env);
      if (resolved.error) return jsonBody(400, { error: resolved.error });
      const messages = civBrainMessages(jsonRec(rec?.civ), jsonRec(rec?.persona));
      // 非流式语义：Workers AI 直取；openai/anthropic 复用流式通道收全量文本（15s 超时保护）
      const CIV_TIMEOUT_MS = 15_000;
      try {
        let text = '';
        if (resolved.kind === 'workers-ai') {
          text = await runWorkersAIOnce(env, resolved.model, messages, CIV_TIMEOUT_MS);
        } else {
          let streamErr = '';
          const send = (ev) => {
            if (ev && typeof ev.t === 'string') text += ev.t;
            if (ev && typeof ev.err === 'string' && !text) streamErr = ev.err;
          };
          const civSignal = AbortSignal.timeout(CIV_TIMEOUT_MS);
          await Promise.race([
            (async () => {
              if (resolved.kind === 'anthropic') await streamAnthropic(resolved, messages, send, civSignal);
              else await streamOpenAI(resolved, messages, send, civSignal);
            })(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('外脑超时（15s）')), CIV_TIMEOUT_MS)),
          ]);
          if (!text) return jsonBody(502, { error: streamErr || '外脑无输出' });
        }
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

    // —— 结构化决策（中枢二笔服务端半件，v2.0） ——
    if (path === '/api/agent/decide') {
      if (request.method !== 'POST') return jsonBody(405, { error: 'POST only' });
      let body;
      try { body = await request.json(); } catch { return jsonBody(400, { error: '请求体不是合法 JSON' }); }
      const rec = jsonRec(body);
      if (!rec) return jsonBody(400, { error: '请求体须为 JSON 对象' });
      const provider = jsonRec(rec.provider);
      const kind = provider ? String(provider.kind) : 'builtin'; // 缺省 builtin（零配置直连 Workers AI）
      if (kind !== 'builtin' && kind !== 'workers-ai' && kind !== 'openai' && kind !== 'anthropic') {
        return jsonBody(400, { error: 'provider.kind 必须是 builtin / workers-ai / openai / anthropic' });
      }
      const resolved = resolveProvider(provider ?? { kind }, env);
      if (resolved.error) return jsonBody(400, { error: resolved.error });
      const civ = jsonRec(rec.civ) ?? {};
      const world = jsonRec(rec.world) ?? {};
      const actions = jsonRec(rec.actions) ?? {};
      const messages = decideMessages(civ, world, actions);
      const DECIDE_TIMEOUT_MS = 15_000;
      try {
        let text = '';
        if (resolved.kind === 'workers-ai') {
          text = await runWorkersAIOnce(env, resolved.model, messages, DECIDE_TIMEOUT_MS);
        } else {
          let streamErr = '';
          const send = (ev) => {
            if (ev && typeof ev.t === 'string') text += ev.t;
            if (ev && typeof ev.err === 'string' && !text) streamErr = ev.err;
          };
          const sig = AbortSignal.timeout(DECIDE_TIMEOUT_MS);
          await Promise.race([
            (async () => {
              if (resolved.kind === 'anthropic') await streamAnthropic(resolved, messages, send, sig);
              else await streamOpenAI(resolved, messages, send, sig);
            })(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('外脑超时（15s）')), DECIDE_TIMEOUT_MS)),
          ]);
          if (!text) return jsonBody(502, { error: streamErr || '外脑无输出' });
        }
        const obj = extractCivJson(text);
        if (!obj) return jsonBody(502, { error: '外脑未输出可解析的 JSON 决策' });
        const { decisions, note } = validateDecide(obj, actions);
        return jsonBody(200, { decisions, note });
      } catch (e) {
        return jsonBody(502, { error: e && e.message ? e.message : '上游不可达' });
      }
    }

    // —— 编年史生成（v2.0） ——
    if (path === '/api/chronicle') {
      if (request.method !== 'POST') return jsonBody(405, { error: 'POST only' });
      let body;
      try { body = await request.json(); } catch { return jsonBody(400, { error: '请求体不是合法 JSON' }); }
      const rec = jsonRec(body);
      if (!rec) return jsonBody(400, { error: '请求体须为 JSON 对象' });
      const provider = jsonRec(rec.provider);
      const kind = provider ? String(provider.kind) : 'builtin'; // 缺省 builtin
      if (kind !== 'builtin' && kind !== 'workers-ai' && kind !== 'openai' && kind !== 'anthropic') {
        return jsonBody(400, { error: 'provider.kind 必须是 builtin / workers-ai / openai / anthropic' });
      }
      const resolved = resolveProvider(provider ?? { kind }, env);
      if (resolved.error) return jsonBody(400, { error: resolved.error });
      const input = validateChronicleInput(rec);
      if (input.error) return jsonBody(400, { error: input.error });
      const messages = chronicleMessages(input.civName, input.events);
      const CHRON_TIMEOUT_MS = 20_000;
      try {
        let text = '';
        if (resolved.kind === 'workers-ai') {
          text = await runWorkersAIOnce(env, resolved.model, messages, CHRON_TIMEOUT_MS);
        } else {
          let streamErr = '';
          const send = (ev) => {
            if (ev && typeof ev.t === 'string') text += ev.t;
            if (ev && typeof ev.err === 'string' && !text) streamErr = ev.err;
          };
          const sig = AbortSignal.timeout(CHRON_TIMEOUT_MS);
          await Promise.race([
            (async () => {
              if (resolved.kind === 'anthropic') await streamAnthropic(resolved, messages, send, sig);
              else await streamOpenAI(resolved, messages, send, sig);
            })(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('外脑超时（20s）')), CHRON_TIMEOUT_MS)),
          ]);
          if (!text) return jsonBody(502, { error: streamErr || '外脑无输出' });
        }
        const chronicle = text.trim().slice(0, 800);
        return jsonBody(200, { chronicle });
      } catch (e) {
        return jsonBody(502, { error: e && e.message ? e.message : '上游不可达' });
      }
    }

    return jsonBody(404, { error: `未知路径 ${path}` });
  },
};
