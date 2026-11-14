// ============ 神谕 · 浏览器端直连与后端路由层（v9 大陆直连回归） ============
// 解决「自定义厂商在静态托管下一刀切报神谕离线」的典型误报：
//   旧逻辑把除 local 外全部厂商（含自定义 openai/anthropic）都硬编码走 /api/oracle/agent，
//   GitHub Pages 静态托管下 404 → 一律「神谕离线」——而自定义厂商本可由浏览器 corsDirect 直连。
// v6 路由决策（openai/anthropic 云厂商）：
//   ① provider.relayUrl（Sealos oracle-server 等中继后端，用户显式配置）→ 中继转发；
//   ② 本站后端存在（next dev / 同源部署，GET 探测 405=在）→ 本站 /api/oracle/agent；
//   ③ 静态托管（探测 404）或后端不可达 → 浏览器直连厂商端点（CORS 允许的端点可通）；
//   ④ 直连网络级失败 → 精确可行动错误文案（绝不误报「离线」）。
// builtin（内置 Z.ai）必须经后端（SDK 密钥在服务端）：后端不在时才报「离线」，并给出替代路径。
// v7 原生接入适配（三协议全家，浏览器直连通道）：
//   · anthropic 直连升级原生 tool use（tools + tool_use/tool_result 内容块 + 流式 input_json_delta）；
//   · 全新 gemini 原生通道（generateContent：functionDeclarations + functionCall/functionResponse +
//     :streamGenerateContent?alt=sse 流式；x-goog-api-key 认证；官方端点支持浏览器 CORS）；
//   · gemini 恒走直连/中继：本站后端白名单（src/app/api/oracle 铁律勿改）不含 gemini。
// SSE 线协议与 /api/oracle/agent 完全一致：data: {"r"|"t"|"err"} \n\n + data: [DONE]。
// dsh 持久会话面（M-O4 相三前端接线）：仅中继通道附加 body.dsh（服务端权威历史）——
//   本站后端（Next 静态白名单路由）与 corsDirect 不识别该面，永不发送；无 dsh 时 body 逐字节不变。
// v9（用户钦定：「naive glm 等所有国内 AI 的 api 在 GitHub Pages 静态部署中稳定使用（大陆）」）：
//   v8 草案（未部署）曾把浏览器直连通道整体退役、全部收敛到 workers.dev 云端后端——该域名
//   大陆线路被 DNS 污染，GitHub Pages 入口在大陆等于 AI 全灭。v9 纠偏：
//   ① 直连回归为静态托管第一通道。2026-11-14 实测（OPTIONS 预检 + 真实 POST 双验证）：
//     DeepSeek / Kimi / 通义千问 / 硅基流动（GLM 等开权重全家）/ 魔搭 api-inference /
//     MiniMax 新端点 / 火山方舟 CORS 全开——浏览器直连稳定可用；
//   ② 直连网络级失败 → 云端后端自动兜底（用户覆写 > 同源云后端 > 官方 Worker）；
//   ③ CORS 白名单制厂商（实测：智谱 open.bigmodel.cn / Naive api.naive.ai / 讯飞星火 /
//     腾讯混元——服务端只放行自家域名 origin，预检即拒）给精确事实与替代路线
//     （GLM → 硅基流动 zai-org/GLM-5.3-Flash 开权重同款直连）。
import type { AgentChatMessage, OracleProviderConfig, AgentToolCall } from './types';
import {
  NativeCallAccumulator,
  parseNonStreamToolCalls,
  toAnthropicTools,
  toGeminiTools,
  AnthropicToolAccumulator,
  parseAnthropicToolBlocks,
  collectGeminiParts,
  type OpenAIToolDef,
} from './native-tools';

export type { OpenAIToolDef } from './native-tools';

/** 统一模型调用结果（与 agent.ts callModel 返回同构）。
 *  v5：toolCalls 承载原生函数调用（仅 openai 兼容端点直连通道产生；旧协议路径恒 undefined）。 */
export interface ModelCallResult {
  content: string;
  reasoning: string;
  err: string;
  /** 原生函数调用（协议层结构化产物——告别 markdown JSON 围栏解析） */
  toolCalls?: AgentToolCall[];
  /** 端点不支持 tools 参数（400 且响应体提及 tool/function）——agent 回退旧协议 */
  nfcUnsupported?: boolean;
  /** 直连网络级失败（CORS 白名单拦截 / 网络不可达）——路由层据此降级云端后端兜底 */
  directNetworkFail?: boolean;
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
  /** 原生函数调用工具定义（v5）：openai 兼容端点浏览器直连通道生效；
   *  v7：anthropic（原生 tool_use）/ gemini（原生 functionCall）直连通道同样生效；
   *  v9：直连网络级失败时路由层返回 nfcUnsupported（云端后端讲旧线协议）——agent 回退旧 JSON 协议；
   *  中继/本站后端同样不识别 tools——agent 自动回退旧 JSON 协议 */
  nativeTools?: OpenAIToolDef[];
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

/** 2026-11-14 实测的服务端 CORS 白名单制端点（预检即拒，只放行厂商自家域名 origin）——
 *  浏览器直连物理不可能，任何前端代码都无法绕过；按 host 给出精确事实与替代路线。 */
const CORS_WHITELIST_HOSTS: Record<string, string> = {
  'open.bigmodel.cn':
    '智谱 GLM 官方端点为服务端 CORS 白名单制（实测仅放行 bigmodel 自家域名）——GLM 直连请改用「硅基流动」预设（zai-org/GLM-5.3-Flash 等开权重同款 GLM，CORS 实测全开）',
  'api.naive.ai':
    'Naive AI 官方端点为服务端 CORS 白名单制（实测仅放行 platform.naive.ai）——静态站无法直连，需可达的云端后端转发',
  'spark-api-open.xf-yun.com': '讯飞星火端点不支持浏览器直连（预检 403）——需云端后端转发',
  'api.hunyuan.cloud.tencent.com': '腾讯混元端点不支持浏览器直连（预检 404）——需云端后端转发',
};

/** 网络级失败（fetch throw）→ 精确可行动文案（白名单厂商点名事实，其余区分 CORS/不可达） */
function describeNetworkError(label: string, url: string, e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (externalAborted(e)) return '已中止';
  const host = safeHost(url);
  const known = CORS_WHITELIST_HOSTS[host];
  if (known) return `[${label}] 浏览器直连 ${host} 被拒：${known}。`;
  return `[${label}] 浏览器直连 ${host || '端点'} 失败（CORS 拦截或网络不可达：${raw}）。` +
    `可改用实测支持直连的厂商（DeepSeek / Kimi / 通义千问 / 硅基流动），或经「云端后端」转发。`;
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
  directFailCache.clear();
}

// ============ 直连失败冷却（60s：本回合与紧邻回合不重撞同一堵 CORS 墙） ============

const directFailCache = new Map<string, number>();
const DIRECT_FAIL_TTL_MS = 60_000;

function directRecentlyFailed(url: string): boolean {
  const at = directFailCache.get(url);
  return typeof at === 'number' && Date.now() - at < DIRECT_FAIL_TTL_MS;
}

function markDirectFailed(url: string): void {
  directFailCache.set(url, Date.now());
}

// ============ 云端后端解析（v0.76：云存档/编年史共用——用户显式中继 > 同源云后端 > 官方中继） ============

const OFFICIAL_CLOUD_RELAY = 'https://pwb-oracle-relay.yeyilin2010.workers.dev';
let sameOriginCloudCache: { at: number; ok: boolean } | null = null;

/** 同源云后端探测：/api/capabilities 返回 pwb-oracle-worker 即为 PWB Worker 全功能版
 *  （Workers 上同源零配置可用——云存档/编年史经 location.origin 直连） */
async function probeSameOriginCloud(now = Date.now()): Promise<boolean> {
  if (sameOriginCloudCache && now - sameOriginCloudCache.at < PROBE_TTL_MS) return sameOriginCloudCache.ok;
  let ok = false;
  try {
    const res = await fetch('/api/capabilities', { cache: 'no-store' });
    if (res.ok) {
      const j: unknown = await res.json().catch(() => null);
      ok = !!j && typeof j === 'object' && (j as Record<string, unknown>).service === 'pwb-oracle-worker';
    }
  } catch {
    ok = false;
  }
  sameOriginCloudCache = { at: now, ok };
  return ok;
}

/** 云端后端地址归一化（v9）：去尾斜杠；完整端点形式（…/api/oracle/agent）剥回根；
 *  内网网关相对形式（含 XTransformPort 查询串）原样直通（查询串之后不可再拼接路径）。 */
export function normalizeCloudBase(url: string): string {
  const raw = url.trim();
  if (raw.includes('XTransformPort=')) return raw;
  return raw.replace(/\/+$/, '').replace(/\/api\/oracle\/agent$/, '');
}

/** 云端后端单一事实源（神谕直连兜底 / 云存档 cloudSync / 编年史 chronicler 共用）。
 *  返回根地址（无尾斜杠、不含端点路径——调用方按需拼接）。优先级：
 *  ① 用户覆写（provider-store 'oracle-cloud-backend-v1'——自定义域名 Worker / 自建中继）；
 *  ② 旧版中继地址（provider.relayUrl 兼容读取，归一化到根）；
 *  ③ 同源云后端（PWB Worker 全功能版：capabilities 探测命中即当前域名）；
 *  ④ 官方云端后端（workers.dev；大陆线路常被 DNS 污染——调用方错误路径给可行动指引）。 */
export async function resolveCloudBackend(): Promise<string> {
  try {
    const { loadCloudBackendOverride, loadStoredProvider } = await import('./provider-store');
    const ovr = loadCloudBackendOverride().trim();
    if (ovr) return normalizeCloudBase(ovr);
    const relay = loadStoredProvider().relayUrl?.trim();
    if (relay) return normalizeCloudBase(relay);
  } catch {
    /* provider-store 不可用（隐私模式等）→ 继续自动路由 */
  }
  if (await probeSameOriginCloud()) {
    if (typeof location !== 'undefined') return location.origin;
  }
  return OFFICIAL_CLOUD_RELAY;
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
    const role: 'user' | 'assistant' = m.role === 'user' ? 'user' : 'assistant'; // v5：tool 消息不上此道，防御归一
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${m.content}`;
    else merged.push({ role, content: m.content });
  }
  if (merged.length === 0) throw new Error('[anthropic] 除系统提示词外至少需要一条消息');
  if (merged[0].role === 'assistant') merged.unshift({ role: 'user', content: '（开始）' });
  return { system, messages: merged };
}

/** 泵取 OpenAI 兼容 SSE（reasoning_content/reasoning → r，content → t；v5：delta.tool_calls → 累积器） */
async function pumpDirectOpenAI(
  upstream: ReadableStream<Uint8Array>,
  cb: RouteCallbacks,
  state: { content: string; reasoning: string },
  nfc: NativeCallAccumulator,
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
        // v5 原生函数调用：流式 tool_calls 分片累积（index 对齐拼接 arguments）
        if (Array.isArray((delta as Record<string, unknown>).tool_calls)) {
          nfc.push((delta as Record<string, unknown>).tool_calls);
        }
      } catch {
        /* 忽略心跳/注释行 */
      }
    }
  }
}

/** 泵取 Anthropic SSE（thinking → r / text → t；v7：content_block_start/stop + input_json_delta → tool_use 累积；error → 抛错；message_stop → 收泵） */
async function pumpDirectAnthropic(
  upstream: ReadableStream<Uint8Array>,
  label: string,
  cb: RouteCallbacks,
  state: { content: string; reasoning: string },
  ata?: AnthropicToolAccumulator,
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
      const idx = typeof rec.index === 'number' ? rec.index : 0;
      if (type === 'content_block_start') {
        ata?.blockStart(idx, rec.content_block); // tool_use 块开槽（text/thinking 块忽略）
      } else if (type === 'content_block_delta') {
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
        // v7 原生 tool use：input_json_delta 分片累积（partial_json 逐块拼接）
        if (ata && typeof d.partial_json === 'string' && d.partial_json) ata.blockDelta(idx, d.partial_json);
      } else if (type === 'content_block_stop') {
        ata?.blockStop(idx);
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

/** 消息转换（v5 双协议）：
 *  · 原生 FC：messages[0]（assistant 系统提示）→ role:'system'；assistant.tool_calls →
 *    tool_calls 结构（arguments JSON 化）；role:'tool' 逐条回传（tool_call_id）。
 *  · 旧协议直连：原样透传（与 v6 逐字节一致）。 */
function toOpenAIMessages(messages: AgentChatMessage[], native: boolean): Record<string, unknown>[] {
  if (!native) return messages as unknown as Record<string, unknown>[];
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (i === 0 && m.role === 'assistant' && !m.tool_calls) {
      out.push({ role: 'system', content: m.content });
      continue;
    }
    if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.tool_call_id ?? '', content: m.content });
      continue;
    }
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      out.push({
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.tool_calls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
        })),
      });
      continue;
    }
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/** 浏览器直连 OpenAI 兼容端点。兼容非流式 JSON 回包（部分网关忽略 stream:true）。
 *  v5：nativeTools 存在时启用原生函数调用（tools + tool_choice），流式 tool_calls 分片
 *  累积解析；端点不支持 tools（400 且提及 tool/function）→ nfcUnsupported 标记，agent 回退旧协议。 */
async function streamDirectOpenAI(
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  cb: RouteCallbacks,
  nativeTools?: OpenAIToolDef[],
): Promise<ModelCallResult> {
  const label = provider.label || provider.model || 'openai';
  const url = normalizeOpenAIUrl(provider.baseUrl ?? '');
  const native = !!nativeTools && nativeTools.length > 0;
  const payload: Record<string, unknown> = {
    model: provider.model,
    messages: toOpenAIMessages(messages, native),
    stream: true,
    max_tokens: 6000, // 部分兼容端点默认上限低，截断的 JSON 工具块会直接失败（与服务端同参）
  };
  if (native) {
    payload.tools = nativeTools;
    payload.tool_choice = 'auto';
  }
  if (typeof provider.temperature === 'number') payload.temperature = provider.temperature;
  void deep; // 推理模型原生输出 reasoning_content，解析侧统一处理

  const { signal, cleanup } = linkedAbort(cb.signal);
  const state = { content: '', reasoning: '' };
  const nfc = new NativeCallAccumulator();
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
    if (!res.ok) {
      const bad = await describeBadResponse(label, res);
      // 端点不认 tools 参数 → 标记回退（agent 本回合改用旧 JSON 协议，后续回合记忆）
      if (native && res.status === 400 && /tool|function/i.test(bad)) {
        return { content: '', reasoning: '', err: bad, nfcUnsupported: true };
      }
      return { content: '', reasoning: '', err: bad };
    }
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
      const toolCalls = parseNonStreamToolCalls(msg);
      if (!content && !reasoning && toolCalls.length === 0) return { content: '', reasoning: '', err: `[${label}] 响应为空` };
      return { content: state.content, reasoning: state.reasoning, err: '', toolCalls: toolCalls.length ? toolCalls : undefined };
    }
    await pumpDirectOpenAI(res.body, cb, state, nfc);
    const toolCalls = nfc.finalize();
    if (!state.content && !state.reasoning && toolCalls.length === 0) return { content: '', reasoning: '', err: `[${label}] 流式响应为空` };
    return { content: state.content, reasoning: state.reasoning, err: '', toolCalls: toolCalls.length ? toolCalls : undefined };
  } catch (e) {
    if (cb.signal?.aborted || externalAborted(e)) return { content: state.content, reasoning: state.reasoning, err: '已中止' };
    return { content: '', reasoning: state.reasoning, err: describeNetworkError(label, url, e), directNetworkFail: true };
  } finally {
    cleanup();
  }
}

/** Claude 5 代起（dateless 新命名，如 claude-opus-5-5）拒绝 temperature 参数（设了即 400）——
 *  探测主代号 ≥5 则不下发；旧命名（claude-3-7-sonnet-20250219 等）剥日期后缀再判。 */
function anthropicTempRejected(model: string): boolean {
  const s = model.replace(/-\d{8}$/, ''); // 剥日期后缀（claude-3-7-sonnet-20250219 → claude-3-7-sonnet）
  let m = /-(?:opus|sonnet|haiku)-(\d+)(?:-\d+)?$/.exec(s);
  if (m) return parseInt(m[1], 10) >= 5; // claude-sonnet-4-5（可设）/ claude-opus-5-5（拒绝）
  m = /^claude-(\d+)/.exec(s);
  if (m) return parseInt(m[1], 10) >= 5; // claude-3-7-sonnet（可设）
  return false;
}

/** v7 原生转换：AgentChatMessage → Anthropic 原生消息（tool_use/tool_result 内容块）。
 *  · messages[0]（assistant 系统提示）→ system 顶层字段；
 *  · assistant.tool_calls → assistant 内容块数组（text? + tool_use× N，input 直接是对象）；
 *  · role:'tool' → user 消息 tool_result 块（tool_use_id 对应；ok:false → is_error）；
 *  · 连续同角色合并（tool_result 必须紧随 tool_use，多条 tool 消息并入同一 user 消息）。 */
function toAnthropicNativeMessages(messages: AgentChatMessage[]): {
  system: string;
  messages: { role: 'user' | 'assistant'; content: unknown }[];
} {
  const system = messages[0]?.role === 'assistant' && !messages[0].tool_calls ? messages[0].content : '';
  const rest = system ? messages.slice(1) : messages.slice();
  const merged: { role: 'user' | 'assistant'; content: unknown[] }[] = [];
  const pushBlocks = (role: 'user' | 'assistant', blocks: unknown[]) => {
    if (blocks.length === 0) return;
    const last = merged[merged.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else merged.push({ role, content: [...blocks] });
  };
  for (const m of rest) {
    if (m.role === 'tool') {
      let isError = false;
      try {
        isError = (JSON.parse(m.content) as { ok?: unknown }).ok === false;
      } catch {
        /* 非 JSON 回执不标记 is_error */
      }
      pushBlocks('user', [
        isError
          ? { type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: m.content, is_error: true }
          : { type: 'tool_result', tool_use_id: m.tool_call_id ?? '', content: m.content },
      ]);
    } else if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      const blocks: unknown[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const c of m.tool_calls) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} });
      pushBlocks('assistant', blocks);
    } else if (m.role === 'user') {
      pushBlocks('user', [{ type: 'text', text: m.content }]);
    } else {
      pushBlocks('assistant', [{ type: 'text', text: m.content }]);
    }
  }
  if (merged.length === 0) throw new Error('[anthropic] 除系统提示词外至少需要一条消息');
  if (merged[0].role === 'assistant') merged.unshift({ role: 'user', content: [{ type: 'text', text: '（开始）' }] }); // 首条必须 user
  return { system, messages: merged };
}

/** 浏览器直连 Anthropic messages API（v7：原生 tool use——tools/tool_use/tool_result + 流式 input_json_delta） */
async function streamDirectAnthropic(
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  cb: RouteCallbacks,
  nativeTools?: OpenAIToolDef[],
): Promise<ModelCallResult> {
  const label = provider.label || provider.model || 'anthropic';
  const url = normalizeAnthropicUrl(provider.baseUrl ?? '');
  const native = !!nativeTools && nativeTools.length > 0;
  let body: { system: string; messages: { role: 'user' | 'assistant'; content: unknown }[] };
  try {
    body = native ? toAnthropicNativeMessages(messages) : toAnthropicPayload(messages);
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
  if (native) {
    payload.tools = toAnthropicTools(nativeTools!);
    payload.tool_choice = { type: 'auto' };
  }
  // Claude 5 代起拒绝 temperature（设了即 400）——探测主代号 ≥5 不下发
  if (typeof provider.temperature === 'number' && !anthropicTempRejected(provider.model ?? '')) {
    payload.temperature = provider.temperature;
  }
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
    if (!res.ok) {
      const bad = await describeBadResponse(label, res);
      // 端点不认 tools 参数（代理网关等）→ 标记回退旧协议
      if (native && res.status === 400 && /tool|function|input_schema/i.test(bad)) {
        return { content: '', reasoning: '', err: bad, nfcUnsupported: true };
      }
      return { content: '', reasoning: '', err: bad };
    }
    if (!res.body) return { content: '', reasoning: '', err: `[${label}] 响应无流式体` };
    // 非流式兜底：完整 JSON 回包（部分网关忽略 stream:true）——content 块分拣
    const ctype = res.headers.get('content-type') ?? '';
    if (ctype.includes('application/json')) {
      const full = jsonRec(await res.json());
      const contentArr = Array.isArray(full?.content) ? full.content : [];
      const textParts = contentArr
        .filter((b) => b && typeof b === 'object' && (b as Record<string, unknown>).type === 'text')
        .map((b) => String((b as Record<string, unknown>).text ?? ''));
      const content = textParts.join('');
      if (content) {
        state.content += content;
        cb.onDelta?.({ text: content });
      }
      const toolCalls = parseAnthropicToolBlocks(contentArr);
      if (!content && toolCalls.length === 0) return { content: '', reasoning: '', err: `[${label}] 响应为空` };
      return { content: state.content, reasoning: state.reasoning, err: '', toolCalls: toolCalls.length ? toolCalls : undefined };
    }
    const ata = native ? new AnthropicToolAccumulator() : undefined;
    await pumpDirectAnthropic(res.body, label, cb, state, ata);
    const toolCalls = ata?.finalize() ?? [];
    return { content: state.content, reasoning: state.reasoning, err: '', toolCalls: toolCalls.length ? toolCalls : undefined };
  } catch (e) {
    if (cb.signal?.aborted || externalAborted(e)) return { content: state.content, reasoning: state.reasoning, err: '已中止' };
    return { content: '', reasoning: state.reasoning, err: describeNetworkError(label, url, e), directNetworkFail: true };
  } finally {
    cleanup();
  }
}

// ============ v7 通道 C·Gemini：Google 原生 generateContent（浏览器直连） ============

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com';

/** baseUrl 归一化（Gemini）：留空→官方端点；已是完整方法端点→原样补 alt=sse；
 *  版本根（/v1beta、/v1beta1、/v1）→ 拼 models/{model}:streamGenerateContent；其余根→默认 v1beta。 */
function normalizeGeminiUrl(baseUrl: string | undefined, model: string): string {
  const base = (baseUrl?.trim() || GEMINI_DEFAULT_BASE).replace(/\/+$/, '');
  if (base.includes(':streamGenerateContent')) return base.includes('alt=sse') ? base : `${base}?alt=sse`;
  if (base.includes(':generateContent')) {
    const u = base.replace(/:generateContent$/, ':streamGenerateContent');
    return `${u}?alt=sse`;
  }
  const m = encodeURIComponent(model);
  if (/\/v\d+(?:beta\d?)?$/.test(base)) return `${base}/models/${m}:streamGenerateContent?alt=sse`;
  if (base.endsWith('/models')) return `${base}/${m}:streamGenerateContent?alt=sse`;
  return `${base}/v1beta/models/${m}:streamGenerateContent?alt=sse`;
}

/** gemini 合成调用 id `g:<name>#<n>` → 反解工具名（functionResponse 按名字回传） */
function geminiNameFromId(id: string): string {
  let s = id;
  if (s.startsWith('g:')) s = s.slice(2);
  const hash = s.indexOf('#');
  return hash >= 0 ? s.slice(0, hash) : s;
}

/** v7 原生转换：AgentChatMessage → Gemini generateContent 请求体。
 *  · messages[0]（assistant 系统提示）→ systemInstruction；
 *  · assistant.tool_calls → model 消息（text? + functionCall× N——args 直接是对象）；
 *  · role:'tool' → user 消息 functionResponse 块（name 反解自合成 id；response 为回执对象）；
 *  · 连续同角色 parts 合并（Gemini 宽容但合并更稳）。 */
function toGeminiMessages(messages: AgentChatMessage[]): {
  systemInstruction: { parts: { text: string }[] };
  contents: { role: 'user' | 'model'; parts: Record<string, unknown>[] }[];
} {
  const system = messages[0]?.role === 'assistant' && !messages[0].tool_calls ? messages[0].content : '';
  const rest = system ? messages.slice(1) : messages.slice();
  const contents: { role: 'user' | 'model'; parts: Record<string, unknown>[] }[] = [];
  const push = (role: 'user' | 'model', parts: Record<string, unknown>[]) => {
    if (parts.length === 0) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts: [...parts] });
  };
  for (const m of rest) {
    if (m.role === 'tool') {
      let resp: Record<string, unknown>;
      try {
        const j: unknown = JSON.parse(m.content);
        resp = j !== null && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : { result: m.content };
      } catch {
        resp = { result: m.content };
      }
      push('user', [{ functionResponse: { name: geminiNameFromId(m.tool_call_id ?? ''), response: resp } }]);
    } else if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
      const parts: Record<string, unknown>[] = [];
      if (m.content) parts.push({ text: m.content });
      for (const c of m.tool_calls) parts.push({ functionCall: { name: c.name, args: c.args ?? {} } });
      push('model', parts);
    } else if (m.role === 'user') {
      push('user', [{ text: m.content }]);
    } else {
      push('model', [{ text: m.content }]);
    }
  }
  if (contents.length === 0) throw new Error('[gemini] 除系统提示词外至少需要一条消息');
  return { systemInstruction: { parts: [{ text: system }] }, contents };
}

/** 泵取 Gemini SSE（alt=sse）：每个 data: 块是一个 GenerateContentResponse——
 *  candidates[0].content.parts 三色分拣（text→正文 / thought:true→思考流 / functionCall→工具调用）；
 *  promptFeedback.blockReason → 安全拦截；finishReason 记录（SAFETY 且零产出时报错）。 */
async function pumpDirectGemini(
  upstream: ReadableStream<Uint8Array>,
  cb: RouteCallbacks,
  state: { content: string; reasoning: string },
  calls: { id: string; name: string; args: Record<string, unknown> }[],
): Promise<{ finishReason: string; blockReason: string }> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let finishReason = '';
  let blockReason = '';
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
      let rec: Record<string, unknown> | null;
      try {
        rec = jsonRec(JSON.parse(payload));
      } catch {
        continue;
      }
      if (!rec) continue;
      const pf = jsonRec(rec.promptFeedback);
      if (pf && typeof pf.blockReason === 'string' && pf.blockReason) blockReason = pf.blockReason;
      const cands = Array.isArray(rec.candidates) ? rec.candidates : [];
      const first = jsonRec(cands[0]);
      if (!first) continue;
      if (typeof first.finishReason === 'string' && first.finishReason) finishReason = first.finishReason;
      const content = jsonRec(first.content);
      const parts = collectGeminiParts(content?.parts);
      if (parts.text) {
        state.content += parts.text;
        cb.onDelta?.({ text: parts.text });
      }
      if (parts.thought) {
        state.reasoning += parts.thought;
        cb.onDelta?.({ reason: parts.thought });
      }
      if (parts.calls.length > 0) calls.push(...parts.calls);
    }
  }
  return { finishReason, blockReason };
}

/** 浏览器直连 Gemini generateContent（v7 原生协议：functionDeclarations + functionCall/functionResponse）。
 *  官方端点支持浏览器 CORS（x-goog-api-key 认证）；支持流式（?alt=sse）与非流式 JSON 双形态。 */
async function streamDirectGemini(
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  cb: RouteCallbacks,
  nativeTools?: OpenAIToolDef[],
): Promise<ModelCallResult> {
  const label = provider.label || provider.model || 'gemini';
  const model = provider.model?.trim() || '';
  const url = normalizeGeminiUrl(provider.baseUrl, model);
  const native = !!nativeTools && nativeTools.length > 0;
  let body: { systemInstruction: { parts: { text: string }[] }; contents: { role: 'user' | 'model'; parts: Record<string, unknown>[] }[] };
  try {
    body = toGeminiMessages(messages);
  } catch (e) {
    return { content: '', reasoning: '', err: e instanceof Error ? e.message : String(e) };
  }
  const payload: Record<string, unknown> = { contents: body.contents };
  if (body.systemInstruction.parts[0]?.text) payload.systemInstruction = body.systemInstruction;
  if (native) payload.tools = toGeminiTools(nativeTools!); // AUTO 是默认 mode，无需 toolConfig
  if (typeof provider.temperature === 'number') payload.generationConfig = { temperature: provider.temperature };
  void deep; // Gemini 3+ 思考模型自适应，thought parts 由解析侧统一处理

  const { signal, cleanup } = linkedAbort(cb.signal);
  const state = { content: '', reasoning: '' };
  const calls: { id: string; name: string; args: Record<string, unknown> }[] = [];
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider.apiKey?.trim()) headers['x-goog-api-key'] = provider.apiKey.trim();
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload), signal });
    if (!res.ok) {
      const bad = await describeBadResponse(label, res);
      // 端点不认 functionDeclarations（旧代理等）→ 标记回退旧协议
      if (native && res.status === 400 && /tool|function/i.test(bad)) {
        return { content: '', reasoning: '', err: bad, nfcUnsupported: true };
      }
      return { content: '', reasoning: '', err: bad };
    }
    if (!res.body) return { content: '', reasoning: '', err: `[${label}] 响应无流式体` };
    const ctype = res.headers.get('content-type') ?? '';
    let blockReason = '';
    if (ctype.includes('application/json')) {
      // 非流式兜底：generateContent 完整 JSON 回包
      const full = jsonRec(await res.json());
      const pf = jsonRec(full?.promptFeedback);
      if (pf && typeof pf.blockReason === 'string') blockReason = pf.blockReason;
      const cands = Array.isArray(full?.candidates) ? full.candidates : [];
      const first = jsonRec(cands[0]);
      const contentRec = jsonRec(first?.content);
      const parts = collectGeminiParts(contentRec?.parts);
      state.content += parts.text;
      state.reasoning += parts.thought;
      calls.push(...parts.calls);
      if (parts.text) cb.onDelta?.({ text: parts.text });
      if (parts.thought) cb.onDelta?.({ reason: parts.thought });
    } else {
      const fin = await pumpDirectGemini(res.body, cb, state, calls);
      blockReason = fin.blockReason;
    }
    if (!state.content && !state.reasoning && calls.length === 0) {
      const why = blockReason
        ? `内容被安全策略拦截（${blockReason}）——可调整指令或换模型`
        : `[${label}] 流式响应为空`;
      return { content: '', reasoning: '', err: why };
    }
    return { content: state.content, reasoning: state.reasoning, err: '', toolCalls: calls.length ? calls : undefined };
  } catch (e) {
    if (cb.signal?.aborted || externalAborted(e)) return { content: state.content, reasoning: state.reasoning, err: '已中止' };
    return { content: '', reasoning: state.reasoning, err: describeNetworkError(label, url, e), directNetworkFail: true };
  } finally {
    cleanup();
  }
}

// ============ 路由决策入口 ============

/** builtin（内置 Z.ai）专用：服务端与云端后端皆不可达时的准确文案（唯一允许「离线」字样的场景） */
const BUILTIN_OFFLINE_MSG =
  '神谕离线：内置 Z.ai 需要服务端（同源后端 / 云端后端 Worker）。替代路径：厂商接入改用支持浏览器直连的厂商' +
  '（DeepSeek / Kimi / 通义千问 / 硅基流动·GLM 等），或本地模型（浏览器推理），或配置可达的「云端后端」地址。';

/** 云端后端不可达时的可行动指引（大陆线路 workers.dev DNS 污染是实测常态） */
const CLOUD_UNREACHABLE_HINT =
  '（云端后端不可达：大陆线路对 workers.dev 域名常被 DNS 污染——可在「厂商接入 → 云端后端」' +
  '填入自定义域名或自建中继地址；或改用实测支持浏览器直连的厂商预设：DeepSeek / Kimi / 通义千问 / 硅基流动）';

/** 经云端后端兜底调用（直连网络级失败 / builtin 静态托管）。错误附大陆线路指引。 */
async function callViaCloud(
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  cb: RouteCallbacks,
): Promise<ModelCallResult> {
  const cloud = await resolveCloudBackend();
  const ep = cloud.includes('XTransformPort=') ? cloud : `${cloud}/api/oracle/agent`;
  const r = await callViaBackend(ep, provider, messages, deep, cb, '云端后端');
  if (r.err && (r.err.includes('请求失败') || r.err.includes('Failed to fetch'))) {
    return { ...r, err: `${r.err}${CLOUD_UNREACHABLE_HINT}` };
  }
  return r;
}

/**
 * 统一路由入口：按 provider 配置选择最优通道。永不 throw——错误折进 err。
 * - local：不走此层（agent.ts 先行分流）。
 * - builtin：中继（若配）→ 本站后端（若在）→ 云端后端 Worker（服务端默认厂商）→ 准确「离线」文案。
 * - openai/anthropic/gemini：中继（若配）→ 本站后端（若在；gemini 例外恒直连——后端白名单不含）→
 *   浏览器直连（静态托管第一通道；60s 失败冷却）→ 云端后端自动兜底（v9）——
 *   直连网络级失败（CORS 白名单 / 不可达）才换道；应用层错误（401/400/429…）原样上浮不换道。
 * - extras.nativeTools（v5/v7/v9）：仅直连通道生效；直连网络级失败时云端后端讲旧线协议
 *   （不识别 tools）→ 返回 nfcUnsupported，agent 本回合回退旧协议重问。
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
  // ⓪ 本地模型恒浏览器端推理（v0.83 并行线修复，v0.84 合并保留）：不经中继/后端/直连任何
  //    网络通道——即使配了中继地址也不发（后端会拒绝 local kind；本地推理本就无需网络）
  if (provider.kind === 'local') {
    return {
      content: '',
      reasoning: '',
      err: `本地模型不经网络调用，无法做连通测试——直接下令即可（首次下令会下载约 300-500MB 模型权重，之后浏览器缓存离线可用；需支持 WebAssembly 的系统浏览器，WPS/微信等内嵌浏览器可能不兼容）`,
    };
  }

  // ① 显式中继后端（oracle-server）——用户显式配置，失败不静默换道（错误原样上浮）
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

  // ② 本站后端（next dev / 同源 node 部署）——gemini 例外：本站路由白名单（铁律勿改）
  //   不含 gemini，后端在也不走，恒降级到浏览器直连（官方端点支持 CORS）
  if (provider.kind !== 'gemini') {
    const backend = await probeSiteBackend();
    if (backend === 'up') {
      return callViaBackend('/api/oracle/agent', provider, messages, deep, cb, '本站后端', extras?.dsh);
    }
  }

  // ③ 浏览器直连（静态托管 / 后端不可达时的第一通道）。builtin 例外（需服务端）→ ④
  if (provider.kind !== 'builtin') {
    if (provider.kind !== 'openai' && provider.kind !== 'anthropic' && provider.kind !== 'gemini') {
      return { content: '', reasoning: '', err: `未知的 provider.kind：${String(provider.kind)}` };
    }
    const directUrl =
      provider.kind === 'openai'
        ? normalizeOpenAIUrl(provider.baseUrl ?? '')
        : provider.kind === 'anthropic'
          ? normalizeAnthropicUrl(provider.baseUrl ?? '')
          : normalizeGeminiUrl(provider.baseUrl, provider.model ?? '');
    let direct: ModelCallResult | null = null;
    if (!directRecentlyFailed(directUrl)) {
      direct =
        provider.kind === 'openai'
          ? await streamDirectOpenAI(provider, messages, deep, cb, extras?.nativeTools)
          : provider.kind === 'anthropic'
            ? await streamDirectAnthropic(provider, messages, deep, cb, extras?.nativeTools)
            : await streamDirectGemini(provider, messages, deep, cb, extras?.nativeTools);
      if (!direct.directNetworkFail) return direct; // 成功 / 应用层错误（401/400…）——原样上浮，不换道
      markDirectFailed(directUrl);
    }
    // 直连网络级失败（CORS 白名单 / 不可达）或失败冷却中 → ④ 云端后端兜底
    if (extras?.nativeTools?.length) {
      // 云端后端讲旧线协议（不识别 tools）→ 标记回退：agent 本回合换旧协议重问
      // （直连冷却期内不再重撞，重问将直达云端后端）
      return {
        content: direct?.content ?? '',
        reasoning: direct?.reasoning ?? '',
        err: direct?.err ?? `[${provider.label || '直连'}] 浏览器直连失败（60s 失败冷却中，已跳过）`,
        nfcUnsupported: true,
      };
    }
    const cloud = await callViaCloud(provider, messages, deep, cb);
    if (!cloud.err) return cloud;
    return { ...cloud, err: `${direct?.err ? `${direct.err}；` : ''}${cloud.err}` };
  }

  // ④ builtin：无直连面 → 云端后端 Worker（官方/覆写，已接服务端默认厂商）
  const cloud = await callViaCloud(provider, messages, deep, cb);
  if (!cloud.err) return cloud;
  return { ...cloud, err: `${BUILTIN_OFFLINE_MSG}（云端后端：${cloud.err}）` };
}

// ============ 连通性测试（面板「测试连通」共用此单一代码路径） ============

export interface ConnectTestResult {
  ok: boolean;
  msg?: string;
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
  if (ok) return { ok: true };
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
  // v7 Gemini：baseUrl 可留空（默认官方端点 generativelanguage.googleapis.com）；
  // Key 留空仅代理端点可跑——官方端点无 Key 会在直连时报 403（错误文案含补救指引）
  if (p.kind === 'gemini') {
    if (!p.model?.trim()) return `[${label}] 缺少模型名（如 gemini-3.8-flash）`;
    return null;
  }
  if (!p.baseUrl?.trim()) return `[${label}] 缺少 Base URL——请补全下方「厂商接入」端点配置`;
  const b = p.baseUrl.trim();
  if (!/^https?:\/\//i.test(b) && !b.includes('XTransformPort=')) {
    return `[${label}] Base URL 需以 http(s):// 开头`;
  }
  if (!p.model?.trim()) return `[${label}] 缺少模型名——请补全下方「厂商接入」配置`;
  return null;
}
