// ============ 神谕 · 浏览器端直连与后端路由层（v6 API 接入适配） ============
// 解决「自定义厂商在静态托管下一刀切报神谕离线」的典型误报：
//   旧逻辑把除 local 外全部厂商（含自定义 openai/anthropic）都硬编码走 /api/oracle/agent，
//   GitHub Pages 静态托管下 404 → 一律「神谕离线」——而自定义厂商本可由浏览器 corsDirect 直连。
// v6 路由决策（openai/anthropic 云厂商）：
//   ① provider.relayUrl（Sealos oracle-server 等中继后端，用户显式配置）→ 中继转发；
//   ② 本站后端存在（next dev / 同源部署，GET 探测 405=在）→ 本站 /api/oracle/agent；
//   ③ 静态托管（探测 404）或后端不可达 → 浏览器直连厂商端点（CORS 允许的端点可通）；
//   ④ 直连网络级失败 → 精确可行动错误文案（绝不误报「离线」）。
// builtin（内置 Z.ai）必须经后端（SDK 密钥在服务端）：后端不在时才报「离线」，并给出替代路径。
// SSE 线协议与 /api/oracle/agent 完全一致：data: {"r"|"t"|"err"} \n\n + data: [DONE]。
// dsh 持久会话面（M-O4 相三前端接线）：仅中继通道附加 body.dsh（服务端权威历史）——
//   本站后端（Next 静态白名单路由）与 corsDirect 不识别该面，永不发送；无 dsh 时 body 逐字节不变。
import type { AgentChatMessage, OracleProviderConfig } from './types';
import { loadStoredProvider } from './provider-store';

/** 统一模型调用结果（与 agent.ts callModel 返回同构）；via：非默认路径成功时的说明（如自动换协议） */
export interface ModelCallResult {
  content: string;
  reasoning: string;
  err: string;
  via?: string;
}

export interface RouteCallbacks {
  onDelta?: (d: { text?: string; reason?: string }) => void;
  signal?: AbortSignal;
}

/**
 * dsh 快照面（挂账②）：前端每回合喂给 oracle-server 的紧凑世界实况——
 * 服务端 pwbContext.setSnapshot/pushChronicle 摄入，wb_world_digest/wb_query_chronicle 读真数据。
 * 只传文本叙事（digest ≤1200 字 + 纪事行 ≤8 条），禁 dump 结构化世界对象（体积/隐私双红线）。
 */
export interface DshSnapshot {
  /** 世界实况一段式摘要（buildOracleContext 同源文本） */
  digest?: string;
  /** 纪事行（世界事件流尾部，每行 ≤200 字） */
  chronicle?: string[];
}

/** 路由附加选项（可选，缺省=行为与 v6 完全一致） */
export interface RouteExtras {
  /** dsh 持久会话面：仅中继通道生效——body.dsh={sessionId[,snapshot]}，历史由 oracle-server 事件日志权威投影 */
  dsh?: { sessionId: string; snapshot?: DshSnapshot };
}

const TIMEOUT_MS = 120_000;

// ============ 通用工具 ============

function jsonRec(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** 外部 signal + 超时 → 联动 AbortController；cleanup 须在流结束时调用 */
function linkedAbort(external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  if (external) {
    if (external.aborted) onAbort();
    else external.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctl.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onAbort);
    },
  };
}

/** 非 2xx → 含状态码与响应体摘要（截断 300 字）的错误文案 */
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

/** 网络级失败（fetch throw）→ 精确可行动文案（直连场景的 CORS/网络不可达区分提示） */
function describeNetworkError(label: string, url: string, e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (externalAborted(e)) return '已中止';
  const host = safeHost(url);
  return `[${label}] 浏览器直连 ${host || '端点'} 失败（CORS 拦截或网络不可达：${raw}）。` +
    `可在「厂商接入」填「中继后端」地址（Sealos 部署 oracle-server）转发，或改用支持 CORS 的端点 / 本地模型。`;
}

function externalAborted(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// ============ 后端探测（60s TTL 缓存；GET 405=后端在，404=静态托管） ============

export type BackendState = 'up' | 'static' | 'down';

let probeCache: { at: number; state: BackendState } | null = null;
const PROBE_TTL_MS = 60_000;

export async function probeSiteBackend(now = Date.now()): Promise<BackendState> {
  if (probeCache && now - probeCache.at < PROBE_TTL_MS) return probeCache.state;
  const state: BackendState = await (async () => {
    try {
      const res = await fetch('/api/oracle/agent', { method: 'GET', cache: 'no-store' });
      // next dev / node 部署：GET 返回 405（POST only）；静态托管：404 页面
      if (res.status === 405 || res.status === 200) return 'up';
      if (res.status === 404) return 'static';
      return 'down';
    } catch {
      return 'down';
    }
  })();
  probeCache = { at: now, state };
  return state;
}

/** 探测结果变化时失效缓存（测试连通按钮手动触发前调用，保证及时性） */
export function invalidateBackendProbe(): void {
  probeCache = null;
  sameOriginCloudCache = null;
}

// ============ 同源云后端探测（Worker 托管游戏本体形态，v0.75） ============
// 仅 Worker v2.0+ 全家桶形态满足（同源 /api/capabilities 200 且是 PWB 后端）：
//   · Worker 托管游戏本体（workers.dev / 未来自定义域直开即玩）——同源全端点族在；
//   · next dev / node 部署：/api/capabilities 不存在（404）→ 不满足，官方中继路径不变；
//   · GitHub Pages 纯静态：404 → 不满足。

let sameOriginCloudCache: { at: number; ok: boolean } | null = null;

async function probeSameOriginCloud(now = Date.now()): Promise<boolean> {
  if (sameOriginCloudCache && now - sameOriginCloudCache.at < PROBE_TTL_MS) return sameOriginCloudCache.ok;
  let ok = false;
  try {
    const res = await fetch(`/api/capabilities?_cb=${now}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const j = (await res.json()) as { service?: string; builtin_alive?: boolean };
      ok = j.service === 'pwb-oracle-worker' || !!j.builtin_alive;
    }
  } catch {
    ok = false;
  }
  sameOriginCloudCache = { at: now, ok };
  return ok;
}

// ============ 通道 A/B：中继后端 / 本站后端（同一线协议 SSE 泵） ============

/** 中继地址归一化：去尾斜杠；已含 /api/oracle/agent 用原样，否则拼接；
 * 内网网关相对形式（含 XTransformPort 查询串，如 /api/oracle/agent?XTransformPort=8787）原样直通——
 * 查询串之后不可再拼接路径 */
export function normalizeRelayUrl(relay: string): string {
  const raw = relay.trim();
  const base = raw.replace(/\/+$/, '');
  if (base.includes('XTransformPort=')) return raw;
  if (base.endsWith('/api/oracle/agent')) return base;
  return `${base}/api/oracle/agent`;
}

/** 泵取后端统一 SSE 协议（{"r"|"t"|"err"} + [DONE]）——中继与本站后端共用 */
async function pumpBackendSSE(
  upstream: ReadableStream<Uint8Array>,
  cb: RouteCallbacks,
  state: { content: string; reasoning: string; streamErr: string },
): Promise<void> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    if (cb.signal?.aborted) {
      void reader.cancel();
      throw new DOMException('Aborted', 'AbortError');
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const ev = JSON.parse(payload) as { t?: string; r?: string; err?: string };
        if (ev.err) state.streamErr = ev.err;
        if (ev.t || ev.r) {
          state.content += ev.t ?? '';
          state.reasoning += ev.r ?? '';
          cb.onDelta?.({ text: ev.t, reason: ev.r });
        }
      } catch {
        /* 忽略无法解析的行 */
      }
    }
  }
}

/** 经后端（中继或本站）调用：POST AgentRequestBody → 统一 SSE。网络/HTTP 错误折进 err，永不 throw。 */
async function callViaBackend(
  endpoint: string,
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  cb: RouteCallbacks,
  epLabel: string,
  dsh?: { sessionId: string },
): Promise<ModelCallResult> {
  const state = { content: '', reasoning: '', streamErr: '' };
  const { signal, cleanup } = linkedAbort(cb.signal);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // dsh 仅在显式传入时附加（无 dsh 时 body 与 v6 逐字节不变——旧后端零感知）
      body: JSON.stringify(dsh ? { provider, messages, deep, dsh } : { provider, messages, deep }),
      signal,
    });
    if (!res.ok || !res.body) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {
        /* 非 JSON 错误体 */
      }
      return { content: '', reasoning: '', err: `[${epLabel}] ${msg}` };
    }
    await pumpBackendSSE(res.body, cb, state);
    return { content: state.content, reasoning: state.reasoning, err: state.streamErr };
  } catch (e) {
    if (cb.signal?.aborted || externalAborted(e)) return { content: state.content, reasoning: state.reasoning, err: '已中止' };
    return { content: '', reasoning: state.reasoning, err: `[${epLabel}] 请求失败：${e instanceof Error ? e.message : String(e)}` };
  } finally {
    cleanup();
  }
}

// ============ 通道 C：浏览器直连厂商（corsDirect） ============

/** baseUrl 归一化：去尾斜杠；已以 /chat/completions 结尾用原样，否则拼接（与服务端 providers.ts 同构） */
function normalizeOpenAIUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

/** baseUrl 归一化（Anthropic）：/v1/messages 用原样；/v1 拼 /messages；否则拼 /v1/messages */
function normalizeAnthropicUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/v1/messages')) return base;
  if (base.endsWith('/v1')) return `${base}/messages`;
  return `${base}/v1/messages`;
}

/** 协议转换：messages[0]（assistant 系统提示）→ system 顶层 + user/assistant 交替（与服务端同构） */
function toAnthropicPayload(messages: AgentChatMessage[]): {
  system: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
} {
  const system = messages[0]?.role === 'assistant' ? messages[0].content : '';
  const rest = messages[0]?.role === 'assistant' ? messages.slice(1) : messages.slice();
  const merged: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of rest) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else merged.push({ role: m.role, content: m.content });
  }
  if (merged.length === 0) throw new Error('[anthropic] 除系统提示词外至少需要一条消息');
  if (merged[0].role === 'assistant') merged.unshift({ role: 'user', content: '（开始）' });
  return { system, messages: merged };
}

/** 泵取 OpenAI 兼容 SSE（reasoning_content/reasoning → r，content → t） */
async function pumpDirectOpenAI(
  upstream: ReadableStream<Uint8Array>,
  cb: RouteCallbacks,
  state: { content: string; reasoning: string },
): Promise<void> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    if (cb.signal?.aborted) {
      void reader.cancel();
      throw new DOMException('Aborted', 'AbortError');
    }
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
          state.reasoning += reasoning;
          cb.onDelta?.({ reason: reasoning });
        }
        if (typeof delta.content === 'string' && delta.content) {
          state.content += delta.content;
          cb.onDelta?.({ text: delta.content });
        }
      } catch {
        /* 忽略心跳/注释行 */
      }
    }
  }
}

/** 泵取 Anthropic SSE（thinking → r / text → t；error → 抛错；message_stop → 收泵） */
async function pumpDirectAnthropic(
  upstream: ReadableStream<Uint8Array>,
  label: string,
  cb: RouteCallbacks,
  state: { content: string; reasoning: string },
): Promise<void> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let gotAny = false;
  outer: for (;;) {
    if (cb.signal?.aborted) {
      void reader.cancel();
      throw new DOMException('Aborted', 'AbortError');
    }
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
        const text = typeof d.text === 'string' ? d.text : '';
        if (thinking) {
          gotAny = true;
          state.reasoning += thinking;
          cb.onDelta?.({ reason: thinking });
        }
        if (text) {
          gotAny = true;
          state.content += text;
          cb.onDelta?.({ text });
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
  if (!gotAny && !state.content) throw new Error(`[${label}] 流式响应为空`);
}

/** 浏览器直连 OpenAI 兼容端点。兼容非流式 JSON 回包（部分网关忽略 stream:true）。 */
async function streamDirectOpenAI(
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  cb: RouteCallbacks,
): Promise<ModelCallResult> {
  const label = provider.label || provider.model || 'openai';
  const url = normalizeOpenAIUrl(provider.baseUrl ?? '');
  const payload: Record<string, unknown> = {
    model: provider.model,
    messages,
    stream: true,
    max_tokens: 6000, // 部分兼容端点默认上限低，截断的 JSON 工具块会直接失败（与服务端同参）
  };
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;
  void deep; // 推理模型原生输出 reasoning_content，解析侧统一处理

  const { signal, cleanup } = linkedAbort(cb.signal);
  const state = { content: '', reasoning: '' };
  // Ollama 等本地端点可无密钥：无 key 时不下发 Authorization（避免 "Bearer undefined" 灰头）
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (provider.apiKey?.trim()) headers.Authorization = `Bearer ${provider.apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) return { content: '', reasoning: '', err: await describeBadResponse(label, res) };
    if (!res.body) return { content: '', reasoning: '', err: `[${label}] 响应无流式体` };
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype.includes('application/json')) {
      // 非流式兜底：完整 JSON 对象一次性解析
      const full = jsonRec(await res.json()) as { choices?: { message?: { content?: string; reasoning_content?: string } }[] } | null;
      const msg = full?.choices?.[0]?.message;
      const content = msg?.content ?? '';
      const reasoning = msg?.reasoning_content ?? '';
      if (content) {
        state.content += content;
        cb.onDelta?.({ text: content });
      }
      if (reasoning) {
        state.reasoning += reasoning;
        cb.onDelta?.({ reason: reasoning });
      }
      if (!content && !reasoning) return { content: '', reasoning: '', err: `[${label}] 响应为空` };
      return { content: state.content, reasoning: state.reasoning, err: '' };
    }
    await pumpDirectOpenAI(res.body, cb, state);
    if (!state.content && !state.reasoning) return { content: '', reasoning: '', err: `[${label}] 流式响应为空` };
    return { content: state.content, reasoning: state.reasoning, err: '' };
  } catch (e) {
    if (cb.signal?.aborted || externalAborted(e)) return { content: state.content, reasoning: state.reasoning, err: '已中止' };
    return { content: '', reasoning: state.reasoning, err: describeNetworkError(label, url, e) };
  } finally {
    cleanup();
  }
}

/** 浏览器直连 Anthropic messages API */
async function streamDirectAnthropic(
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  cb: RouteCallbacks,
): Promise<ModelCallResult> {
  const label = provider.label || provider.model || 'anthropic';
  const url = normalizeAnthropicUrl(provider.baseUrl ?? '');
  let body: { system: string; messages: { role: 'user' | 'assistant'; content: string }[] };
  try {
    body = toAnthropicPayload(messages);
  } catch (e) {
    return { content: '', reasoning: '', err: e instanceof Error ? e.message : String(e) };
  }
  const payload: Record<string, unknown> = {
    model: provider.model,
    max_tokens: 8192,
    stream: true,
    system: body.system,
    messages: body.messages,
  };
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;
  void deep;

  const { signal, cleanup } = linkedAbort(cb.signal);
  const state = { content: '', reasoning: '' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': provider.apiKey ?? '',
        'anthropic-version': '2023-06-01',
        // 浏览器直连必需的放行头（anthropic 官方支持 anthropic-dangerous-direct-browser-access）
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) return { content: '', reasoning: '', err: await describeBadResponse(label, res) };
    if (!res.body) return { content: '', reasoning: '', err: `[${label}] 响应无流式体` };
    await pumpDirectAnthropic(res.body, label, cb, state);
    return { content: state.content, reasoning: state.reasoning, err: '' };
  } catch (e) {
    if (cb.signal?.aborted || externalAborted(e)) return { content: state.content, reasoning: state.reasoning, err: '已中止' };
    return { content: '', reasoning: state.reasoning, err: describeNetworkError(label, url, e) };
  } finally {
    cleanup();
  }
}

// ============ 路由决策入口 ============

/** 路由级失败特征（端点活着但路径不存在）——自定义网关协议选错时的典型信号 */
function isRoutableMiss(err: string): boolean {
  return /HTTP 40[45]/.test(err);
}

/** 官方端点协议固定不换（api.openai.com / api.anthropic.com）；换协议重试仅对自定义端点有意义 */
function isCustomVendorHost(p: OracleProviderConfig): boolean {
  const b = (p.baseUrl ?? '').toLowerCase();
  return !b.includes('api.openai.com') && !b.includes('api.anthropic.com');
}

/** builtin（内置 Z.ai）专用：后端不在时的准确文案（唯一允许「离线」字样的场景） */
const BUILTIN_OFFLINE_MSG =
  '神谕离线：此部署为纯静态托管且官方云端中继不可达（大陆网络对 workers.dev 常不稳，或配额已满）。' +
  '替代路径：厂商接入中改用自定义厂商（浏览器直连）、本地模型（浏览器推理），或部署中继后端后填入「中继后端」地址。';

// ============ 官方云端中继（PWB Worker v2.0：Workers AI 接活 builtin，零配置真 AI） ============

/**
 * PWB 官方 Cloudflare Worker 中继镜像池（Workers AI 免费配额供 builtin 厂商）。
 * 静态托管（GitHub Pages）下 builtin 的自动接活通路：探测 /api/capabilities（60s TTL），
 * builtin_alive=true 才走它；探测失败（大陆线路不可达 workers.dev 等）→ 原离线文案降级，不误报。
 * 大陆稳定方案：① 多镜像竞速探测（任一可达即胜出、低延迟优先——未来官方域名镜像在此追加）；
 * ② 根治位 = 自定义域名绑定（见 docs/大陆直连指南.md），绑定后填入「厂商接入→中继后端」即全端点生效。
 */
export const OFFICIAL_RELAY_URL = 'https://pwb-oracle-relay.yeyilin2010.workers.dev';
export const OFFICIAL_RELAY_POOL: readonly string[] = [OFFICIAL_RELAY_URL];

export interface OfficialRelayState {
  ok: boolean;
  ai: boolean;
  kv: boolean;
  /** 胜出镜像基地址（多镜像竞速后真正用于请求的那一个） */
  baseUrl?: string;
  /** 胜出镜像探测耗时（ms） */
  latencyMs?: number;
}

let officialRelayProbe: { at: number; state: OfficialRelayState | null } | null = null;
const OFFICIAL_RELAY_TTL_MS = 60_000;

/** 单镜像探测：/api/capabilities 带 _cb 缓存击穿参数（防中间层缓存旧响应误判——#81 实测教训） */
async function probeRelayOne(baseUrl: string): Promise<OfficialRelayState | null> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/capabilities?_cb=${t0}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const j = (await res.json()) as { builtin_alive?: boolean; ai?: boolean; kv?: boolean };
      return { ok: !!j.builtin_alive, ai: !!j.ai, kv: !!j.kv, baseUrl, latencyMs: Date.now() - t0 };
    }
  } catch {
    /* 不可达（超时/DNS/拦截）——静默降级，不打扰用户 */
  }
  return null;
}

export async function probeOfficialRelay(now = Date.now(), force = false): Promise<OfficialRelayState | null> {
  if (!force && officialRelayProbe && now - officialRelayProbe.at < OFFICIAL_RELAY_TTL_MS) return officialRelayProbe.state;
  // 多镜像竞速：全部探测，取「可达且 builtin_alive」中延迟最低者为胜者；全败 → null（静默降级）
  const states = await Promise.all(OFFICIAL_RELAY_POOL.map((u) => probeRelayOne(u)));
  const winner =
    states
      .filter((s): s is OfficialRelayState => !!s)
      .sort((a, b) => (a.latencyMs ?? 9e9) - (b.latencyMs ?? 9e9))[0] ?? null;
  officialRelayProbe = { at: now, state: winner };
  return winner;
}

/** 探测结果失效（测试连通/云面板手动刷新前调用） */
export function invalidateOfficialRelayProbe(): void {
  officialRelayProbe = null;
}

/** 中继端点探测结果（「测试连接」按钮用：可达性 + 延迟 + 能力 + 版本） */
export interface RelayEndpointProbe {
  ok: boolean;
  ai: boolean;
  kv: boolean;
  latencyMs: number;
  version?: string;
  err?: string;
}

/**
 * 探测任一中继端点（「测试连接」按钮）：url 已填 → 实测该地址；留空 → 官方云端中继池竞速实测
 * （force 绕过 TTL 缓存——测的就是当前这一刻的线路）。
 */
export async function probeRelayEndpoint(url?: string): Promise<RelayEndpointProbe> {
  const t0 = Date.now();
  const raw = url?.trim();
  if (raw) {
    const base = raw.replace(/\/+$/, '').replace(/\/api\/oracle\/agent$/, '');
    try {
      const res = await fetch(`${base}/api/capabilities?_cb=${t0}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const j = (await res.json()) as { builtin_alive?: boolean; ai?: boolean; kv?: boolean; version?: string };
        return {
          ok: !!j.builtin_alive,
          ai: !!j.ai,
          kv: !!j.kv,
          latencyMs: Date.now() - t0,
          version: typeof j.version === 'string' ? j.version : undefined,
        };
      }
      return { ok: false, ai: false, kv: false, latencyMs: Date.now() - t0, err: `HTTP ${res.status}（地址可达但不是 PWB 中继？）` };
    } catch (e) {
      return { ok: false, ai: false, kv: false, latencyMs: Date.now() - t0, err: e instanceof Error ? e.message : '不可达' };
    }
  }
  const official = await probeOfficialRelay(Date.now(), true);
  if (!official) {
    return {
      ok: false,
      ai: false,
      kv: false,
      latencyMs: Date.now() - t0,
      err: '官方云端中继不可达（大陆线路对 workers.dev 常不稳——绑定自定义域名可根治，见下方指引）',
    };
  }
  return { ok: official.ok, ai: official.ai, kv: official.kv, latencyMs: official.latencyMs ?? Date.now() - t0 };
}

/**
 * 解析「当前生效的云后端基地址」：用户显式中继 > 同源云后端（Worker 托管游戏本体形态）> 官方中继（若可达且带所需能力）。
 * 返回【裸基地址】（不含 /api/oracle/agent 后缀）——云存档 /api/save/*、国策 /api/agent/decide、
 * 编年史 /api/chronicle 等云端端点直接拼接即可；神谕 agent 线仍由 routeCallModel 走 normalizeRelayUrl。
 * cloudSync（云存档）共用此决策，保证 UI 与路由单一事实源。
 */
export async function resolveCloudBackend(): Promise<string | null> {
  try {
    const relay = loadStoredProvider()?.relayUrl?.trim();
    if (relay) return relay.replace(/\/+$/, '').replace(/\/api\/oracle\/agent$/, '');
  } catch {
    /* provider-store 不可用 → 继续同源/官方中继路径 */
  }
  // 同源云后端（Worker 托管游戏本体：同源即全端点族）——免跨域预检、
  // 天然跟随当前访问域名（自定义域绑定后零配置全端点切换）。
  if (await probeSameOriginCloud()) {
    try {
      if (typeof location !== 'undefined') return location.origin;
    } catch {
      /* 非 window 环境 → 继续官方中继 */
    }
  }
  const official = await probeOfficialRelay();
  if (official && official.ok) return official.baseUrl ?? OFFICIAL_RELAY_URL;
  return null;
}

/**
 * 统一路由入口：按 provider 配置选择最优通道。永不 throw——错误折进 err。
 * - local：不走此层（agent.ts 先行分流）。
 * - builtin：中继（若配）→ 本站后端（若在）→ 准确「离线」文案。
 * - openai/anthropic：中继（若配）→ 本站后端（若在）→ 浏览器直连 → 精确错误（绝不误报离线）。
 * - extras.dsh：dsh 持久会话面（M-O4 相三）——仅中继通道附加 body.dsh.sessionId；
 *   本站后端/corsDirect 不识别该面，静默忽略 extras（发方职责：仅在中继场景传入）。
 */
export async function routeCallModel(
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  cb: RouteCallbacks = {},
  extras?: RouteExtras,
): Promise<ModelCallResult> {
  // ① 显式中继后端（Sealos oracle-server）——用户显式配置，失败不静默换道（错误原样上浮）
  const relay = provider.relayUrl?.trim();
  if (relay) {
    const ep = normalizeRelayUrl(relay);
    const r = await callViaBackend(ep, provider, messages, deep, cb, '中继', extras?.dsh);
    if (r.err && (r.err.includes('请求失败') || r.err.includes('Failed to fetch'))) {
      return {
        ...r,
        err: `${r.err}（请检查中继地址与服务存活；清除「中继后端」可回退自动路由）`,
      };
    }
    return r;
  }

  // ② 本站后端（next dev / 同源 node 部署）
  const backend = await probeSiteBackend();
  if (backend === 'up') {
    return callViaBackend('/api/oracle/agent', provider, messages, deep, cb, '本站后端');
  }

  // ③ 静态托管 / 后端不可达 → 浏览器直连厂商；自定义端点 404/405 自动换协议重试（OpenAI 兼容 ↔ Anthropic）
  if (provider.kind === 'builtin') {
    // PWB 官方云端中继（Worker v2.0 Workers AI）：builtin_alive 时零配置接活——
    // 大陆线路不可达时探测失败 → 原离线文案降级（不误报「在线但超时」）
    const official = await probeOfficialRelay();
    if (official && official.ok) {
      return callViaBackend(official.baseUrl ?? OFFICIAL_RELAY_URL, provider, messages, deep, cb, '官方云端');
    }
    return { content: '', reasoning: '', err: BUILTIN_OFFLINE_MSG };
  }
  if (provider.kind === 'openai' || provider.kind === 'anthropic') {
    const kindName = (k: string) => (k === 'openai' ? 'OpenAI 兼容' : 'Anthropic');
    const direct =
      provider.kind === 'openai'
        ? await streamDirectOpenAI(provider, messages, deep, cb)
        : await streamDirectAnthropic(provider, messages, deep, cb);
    // 自定义网关常只开一种协议（或路径不同）：404/405 = 路径不存在 → 换另一协议自动重试一次
    if (direct.err && isRoutableMiss(direct.err) && isCustomVendorHost(provider)) {
      const altKind: 'openai' | 'anthropic' = provider.kind === 'openai' ? 'anthropic' : 'openai';
      const altProvider: OracleProviderConfig = { ...provider, kind: altKind };
      const retry =
        altKind === 'openai'
          ? await streamDirectOpenAI(altProvider, messages, deep, cb)
          : await streamDirectAnthropic(altProvider, messages, deep, cb);
      if (!retry.err) {
        return { ...retry, via: `经${kindName(altKind)}协议自动重试接通` };
      }
      return {
        ...retry,
        err: `双协议均未命中——${kindName(provider.kind)}路径 ${direct.err}；${kindName(altKind)}路径 ${retry.err}`,
      };
    }
    return direct;
  }
  return { content: '', reasoning: '', err: `未知的 provider.kind：${String(provider.kind)}` };
}

// ============ 连通性测试（面板「测试连通」共用此单一代码路径） ============

export interface ConnectTestResult {
  ok: boolean;
  msg?: string;
  /** 非默认路径接通说明（如自动换协议成功） */
  via?: string;
}

/** 最小会话连通测试：走 routeCallModel 全路由（与真实对话完全同路径），读首个增量判定。 */
export async function runConnectivityTest(provider: OracleProviderConfig): Promise<ConnectTestResult> {
  invalidateBackendProbe(); // 用户手动触发 → 强制重新探测（后端刚部署好的场景）
  let ok = false;
  const result = await routeCallModel(
    provider,
    [
      { role: 'assistant', content: '连通测试' },
      { role: 'user', content: '回复：OK' },
    ],
    false,
    {
      onDelta: (d) => {
        if (d.text || d.reason) ok = true;
      },
    },
  );
  if (ok) return { ok: true, via: result.via };
  if (result.err) return { ok: false, msg: result.err };
  // 无增量也无错误 → 上游已判定（err 应非空；双保险）
  return { ok: false, msg: result.err || '无响应' };
}

// ============ dsh 持久会话回合（M-O4 相三前端接线） ============

/**
 * dsh 持久会话单回合：服务端权威历史——前端仅发本回合 user 输入（历史由 oracle-server
 * 事件日志 JSONL 投影回放 + compaction 双策略压缩），工具轮在服务端 dsh ToolsService 执行，
 * 桥过程经 {r} 行随流回传（pumpBackendSSE 归入 reason）。100 轮不失忆/切后台续跑的服务端半边。
 * 永不 throw——错误折进 err。调用方须保证 provider.relayUrl 已配（本站后端/corsDirect 无此面）。
 */
export async function runDshSessionTurn(
  provider: OracleProviderConfig,
  sessionId: string,
  userText: string,
  cb: RouteCallbacks = {},
  snapshot?: DshSnapshot,
): Promise<ModelCallResult> {
  return routeCallModel(
    provider,
    [{ role: 'user', content: userText }],
    false,
    cb,
    // 挂账②：snapshot 仅在有值时附加（无快照时 body.dsh 恒为 {sessionId}——线协议字节不变）
    { dsh: snapshot ? { sessionId, snapshot } : { sessionId } },
  );
}

// ============ 发送前预检（杜绝「发送后才报错」的配置缺失） ============

/**
 * 校验 provider 配置完整性（custom 空字段在发送前拦截，不再等到 400/直连失败才报错）。
 * 返回错误文案或 null（通过）。本地/内网网关形式（含 XTransformPort）放行。
 */
export function validateProviderConfig(p: OracleProviderConfig): string | null {
  if (p.kind === 'builtin') return null;
  if (p.kind === 'local') {
    return p.model?.trim() ? null : '本地模型需要模型标识符（如 XENova/qwen2.5-0.5b-instruct）';
  }
  const label = p.label || p.kind;
  // 中继后端已配置：baseUrl/model 可留空——由中继侧校验/补全（Workers 版可注入服务端默认厂商三元组，密钥不出现在前端）
  if (p.relayUrl?.trim()) return null;
  if (!p.baseUrl?.trim()) return `[${label}] 缺少 Base URL——请补全下方「厂商接入」端点配置，或填写「中继后端」地址（服务端可代配厂商）`;
  const b = p.baseUrl.trim();
  if (!/^https?:\/\//i.test(b) && !b.includes('XTransformPort=')) {
    return `[${label}] Base URL 需以 http(s):// 开头`;
  }
  if (!p.model?.trim()) return `[${label}] 缺少模型名——请补全下方「厂商接入」配置`;
  return null;
}
