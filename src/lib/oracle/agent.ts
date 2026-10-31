// ============ 神谕 Agent 任务完成引擎（v3 · Task Completion Engine） ============
// 多轮工具调用协议：模型回复 → 解析 json tool_calls 块 → 本地执行（活引擎）→
// 结果回传 → 继续推理……直到模型给出最终 Markdown 回答。
// v3 大幅强化「任务完成率」：
//   ① 解析器 v2：大小写围栏 / 裸 JSON 定位 / 尾逗号修复 / 去重——格式轻微走样不再丢调用；
//   ② 解析失败回传纠错：疑似工具块但 JSON 坏 → 把错误与规范模板回传模型同轮重试；
//   ③ 参数修复层：数字串→数字、"true"→布尔、JSON 串→对象/数组、enum 大小写归一；
//   ④ 未知工具模糊建议（编辑距离）＋ 失败错误附收到的参数——模型可自我纠错；
//   ⑤ 写操作回执台账（ledger）＋「全失败却声称完成」幻觉检测 v2；
//   ⑥ 循环上限 8→14；到顶不空手而归——注入收束指令强制产出最终总结；
//   ⑦ 深度思考（deep）全链路接线；空响应单次重试。
// 每一轮模型调用都是对 /api/oracle/agent 的一次无状态 SSE 请求（会话历史由客户端持有）。
import type { AgentChatMessage, AgentToolCall, AgentToolResult, OracleProviderConfig } from './types';
import { executeOracleTool } from './bridge';
import { AGENT_TOOLS, type ToolArgDef } from './tools';
import { getEngine } from '@/store/gameStore';
import { callLocalModel } from './local-provider';

/** 单条消息里携带的工具事件（面板气泡渲染用） */
export interface OracleToolEvent {
  name: string;
  args: unknown;
  ok: boolean;
  /** 结果摘要（面板展示截断版；完整结果已进对话历史） */
  summary: string;
}

export interface AgentTurnCallbacks {
  /** 流式增量（text 正文 / reason 思考流） */
  onDelta?: (d: { text?: string; reason?: string }) => void;
  /** 模型发起了工具调用（批量） */
  onToolCalls?: (calls: AgentToolCall[]) => void;
  /** 单个工具执行完毕 */
  onToolResult?: (call: AgentToolCall, r: AgentToolResult) => void;
  /** 中止信号 */
  signal?: AbortSignal;
}

export interface AgentTurnResult {
  /** 最终回答（已剥离工具协议块；可能为空=被中止） */
  content: string;
  /** 本轮全程的工具事件流（按发生序） */
  toolEvents: OracleToolEvent[];
  /** 循环轮数（模型调用次数） */
  turns: number;
  /** 中止/出错时的错误文案 */
  error?: string;
  /** 思考流全文（深思模式） */
  reasoning?: string;
}

// ============ 一 · JSON 修复与解析 ============

/** 尝试解析 JSON：原样 → 去尾逗号 → 去零宽字符+尾逗号；全部失败返回 null */
function tryParseJson(s: string): unknown {
  const t = s.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    /* 继续修复 */
  }
  const fixed = t
    .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '')
    .replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

/** 从 startIdx（指向 '{'）做括号配平切片（跳过字符串字面量）；未闭合返回 null */
function sliceJsonObjectAt(s: string, startIdx: number): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(startIdx, i + 1);
    }
  }
  return null;
}

export interface ToolParseOutcome {
  calls: AgentToolCall[];
  /** 疑似工具调用但解析失败的块（开头片段，用于纠错回传） */
  malformed: string[];
}

/** 工具名粗判（裸单对象/单数格式的特征识别：name+args 同时存在，且 name 像工具名） */
function looksLikeToolObject(o: Record<string, unknown>): boolean {
  return typeof o.name === 'string'
    && /^[a-z][a-z0-9_]*$/i.test(o.name)
    && (('args' in o && typeof o.args === 'object') || !('args' in o));
}

/**
 * 解析器 v3：除 v2 的 ①整体 JSON ②大小写不敏感围栏 ③裸 {"tool_calls" 定位外，新增：
 *  ④ {"tool_call":{...}} 单数格；⑤ 裸 {"name":...,"args":{...}} 单对象（模型常见的自然单调用写法）
 *  ⑥ 裸 [{"name":...},...] 数组。同名同参调用去重；解析失败块进 malformed 供同轮纠错。
 *  「夸了一顿却没干活」的根因之一：模型裸单对象写法在 v2 下完全解析不到且无 malformed 上报。 */
export function extractToolCalls(content: string): ToolParseOutcome {
  const calls: AgentToolCall[] = [];
  const malformed: string[] = [];
  const seen = new Set<string>();

  const pushCall = (c: unknown, idx: number) => {
    const o = c as Record<string, unknown>;
    if (typeof o?.name !== 'string' || !o.name) return;
    const args =
      typeof o.args === 'object' && o.args !== null && !Array.isArray(o.args)
        ? (o.args as Record<string, unknown>)
        : {};
    const key = `${o.name}::${JSON.stringify(args)}`;
    if (seen.has(key)) return;
    seen.add(key);
    calls.push({
      id: typeof o.id === 'string' && o.id ? o.id : `c${idx}`,
      name: o.name,
      args,
    });
  };

  const consider = (raw: string, silent = false): boolean => {
    const t = raw.trim();
    if (!t) return false;
    if (!t.includes('tool_calls') && !t.includes('tool_call') && !/"name"\s*:/.test(t)) return false;
    const j = tryParseJson(t);
    if (j !== null && typeof j === 'object' && !Array.isArray(j)) {
      const o = j as Record<string, unknown>;
      // 形态一：{"tool_calls":[...]}
      if (Array.isArray(o.tool_calls) && o.tool_calls.length > 0) {
        o.tool_calls.forEach((c, i) => pushCall(c, i + 1));
        return true;
      }
      // 形态二（v3）：{"tool_call":{...}} 单数
      if (o.tool_call && typeof o.tool_call === 'object') {
        pushCall(o.tool_call, 1);
        return true;
      }
      // 形态三（v3）：{"name":...,"args":{...}} 裸单对象（须像工具名）
      if (looksLikeToolObject(o)) {
        pushCall(o, 1);
        return true;
      }
      // 形态四（v3）：{"calls":[...]}
      if (Array.isArray(o.calls) && o.calls.length > 0) {
        o.calls.forEach((c, i) => pushCall(c, i + 1));
        return true;
      }
    }
    // 形态五（v3）：裸数组 [{"name":...},...]
    if (j !== null && Array.isArray(j)) {
      const arr = j as unknown[];
      const toolObjs = arr.filter((c) => c && typeof c === 'object' && looksLikeToolObject(c as Record<string, unknown>));
      if (toolObjs.length > 0) {
        toolObjs.forEach((c, i) => pushCall(c, i + 1));
        return true;
      }
    }
    if (!silent) malformed.push(t.slice(0, 160));
    return false;
  };

  if (!content) return { calls, malformed };

  // 1) 整体就是 JSON（成功则不再扫围栏，防重复解析；失败时静默——坏块由围栏/裸扫描上报）
  if (consider(content, true)) {
    if (calls.length > 0) return { calls, malformed };
  }

  // 2) 所有围栏块（语言标签大小写不敏感：```json / ```JSON / ```json5 …）
  const fence = /```[A-Za-z0-9#+._-]*[^\S\n]*\r?\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(content)) !== null) {
    consider(m[1]);
  }

  // 3) 裸 {"tool_calls"…} / {"tool_call"…} / {"name"…}（模型忘写围栏时兜底）
  for (const probe of ['{"tool_calls"', '{"tool_call"', '{"calls"']) {
    let idx = content.indexOf(probe);
    while (idx >= 0) {
      const slice = sliceJsonObjectAt(content, idx);
      if (slice) consider(slice);
      idx = content.indexOf(probe, idx + 1);
    }
  }
  // 3b) 裸 {"name": "xxx", "args": …}（单对象：逐个定位配平）
  const nameProbe = /\{"name"\s*:\s*"[a-z][a-z0-9_]*"\s*,\s*"args"/gi;
  let nm: RegExpExecArray | null;
  while ((nm = nameProbe.exec(content)) !== null) {
    const slice = sliceJsonObjectAt(content, nm.index);
    if (slice) consider(slice);
  }

  // 4) 无围栏无裸对象的坏 JSON 整体（模型直吐裸坏 JSON 时上报）
  if (malformed.length === 0 && calls.length === 0 && !content.includes('```') && (content.includes('tool_calls') || content.includes('tool_call'))) {
    malformed.push(content.trim().slice(0, 160));
  }

  return { calls, malformed };
}

/** 剥离工具协议块后的干净文本（最终回答兜底清洗：围栏工具块 + 裸 tool_calls/tool_call 对象 + 裸单对象调用） */
export function stripToolBlocks(content: string): string {
  let out = content.replace(/```[A-Za-z0-9#+._-]*[^\S\n]*\r?\n?\s*\{[\s\S]*?"tool_calls"[\s\S]*?\}\s*```/g, '');
  out = out.replace(/```[A-Za-z0-9#+._-]*[^\S\n]*\r?\n?\s*\{[\s\S]*?"tool_call"[\s\S]*?\}\s*```/g, '');
  for (;;) {
    const idx = out.indexOf('{"tool_calls"');
    if (idx < 0) break;
    const slice = sliceJsonObjectAt(out, idx);
    if (!slice) break;
    out = out.slice(0, idx) + out.slice(idx + slice.length);
  }
  for (;;) {
    const idx = out.indexOf('{"tool_call"');
    if (idx < 0) break;
    const slice = sliceJsonObjectAt(out, idx);
    if (!slice) break;
    out = out.slice(0, idx) + out.slice(idx + slice.length);
  }
  // 裸单对象调用（{"name":"...","args":...}）
  const nameProbe = /\{"name"\s*:\s*"[a-z][a-z0-9_]*"\s*,\s*"args"/gi;
  for (;;) {
    const nm = nameProbe.exec(out);
    if (!nm) break;
    const slice = sliceJsonObjectAt(out, nm.index);
    if (!slice) break;
    out = out.slice(0, nm.index) + out.slice(nm.index + slice.length);
    nameProbe.lastIndex = nm.index;
  }
  return out.trim();
}

/** 台账回声清洗：模型有时会模仿历史里的工具回执标注格式，在回答末尾自添一份——剣掉 */
function stripLedgerEcho(content: string): string {
  return content
    .replace(/\n?\s*[\[（]\s*\[?本轮已执行工具回执[:：][^\]）]*\]?[\]）]?\s*(?=$|\n)/g, '')
    .replace(/\n?\s*（系统记忆标注[^）]*）\s*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ============ 二 · 参数修复层（模型输出 → 工具签名） ============

const TOOL_DEFS = new Map(AGENT_TOOLS.map((t) => [t.name, t]));

function repairValue(def: ToolArgDef, v: unknown): unknown {
  if (v == null) return v;
  switch (def.type) {
    case 'number': {
      if (typeof v === 'number') return v;
      if (typeof v === 'string') {
        const n = Number(v.trim());
        if (Number.isFinite(n)) return n;
      }
      return v;
    }
    case 'boolean': {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') {
        const t = v.trim().toLowerCase();
        if (t === 'true' || t === '1' || t === 'yes' || t === 'on') return true;
        if (t === 'false' || t === '0' || t === 'no' || t === 'off') return false;
      }
      if (typeof v === 'number') return v !== 0;
      return v;
    }
    case 'object':
    case 'string[]': {
      if (typeof v === 'string') {
        const s = v.trim();
        if (s.startsWith('[') || s.startsWith('{')) {
          const parsed = tryParseJson(s);
          if (parsed !== null && typeof parsed === 'object') return parsed;
        }
        // 宽松字面量：civ 传 "3"、ids 传 "12" 这类
        if (def.type === 'object' && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
      }
      return v;
    }
    case 'string': {
      if (typeof v === 'string') {
        if (def.enum) {
          const hit = def.enum.find((e) => e.toLowerCase() === v.trim().toLowerCase());
          if (hit) return hit;
        }
        return v;
      }
      if (typeof v === 'number' || typeof v === 'boolean') return String(v);
      return v;
    }
  }
  return v;
}

/** 按工具签名修复参数（数字串/布尔串/JSON 串/enum 大小写）；未声明的键原样保留 */
export function repairCallArgs(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const def = TOOL_DEFS.get(name);
  if (!def) return args;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    const ad = def.args[k];
    out[k] = ad ? repairValue(ad, v) : v;
  }
  return out;
}

// ============ 三 · 未知工具模糊建议 ============

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0 || n === 0) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** 工具名打错时的近似建议（去下划线比较；编辑距离或包含匹配，前 3 个） */
export function suggestTools(name: string): string[] {
  const q = name.toLowerCase().replace(/[-_\s]/g, '');
  if (!q) return [];
  return AGENT_TOOLS.map((t) => {
    const tn = t.name.toLowerCase().replace(/[-_\s]/g, '');
    let s: number;
    if (tn === q) s = 0;
    else if (tn.includes(q) || q.includes(tn)) s = 1;
    else s = editDistance(q, tn);
    return { name: t.name, s };
  })
    .filter((x) => x.s <= 3)
    .sort((x, y) => x.s - y.s)
    .slice(0, 3)
    .map((x) => x.name);
}

// ============ 四 · 写操作台账与幻觉检测 ============

/** 写操作工具清单（回执台账用；与 prompt 的写操作铁律同源；v5 补图鉴四写） */
const WRITE_TOOLS = new Set([
  'terrain_paint', 'era_control', 'spawn_creatures', 'spawn_species', 'hybridize_species', 'set_unit_attr', 'teleport_unit', 'kill_units',
  'heal_area', 'gene_control', 'spawn_item', 'cast_fx', 'civ_control', 'issue_directive',
  'diplomacy_control', 'world_war_control', 'divine_power', 'clear_area', 'announce',
  'set_law', 'set_param', 'create_law', 'manage_agent_laws', 'update_law',
  'forge_divine_weapon', 'merge_kingdoms',
  'save_creation', 'edit_creation', 'delete_creation', 'edit_race',
  'save_world', 'time_control', 'camera_control',
]);

/** 结果压成工具回传消息体的紧凑 JSON（截断保护：单结果 6000 字符） */
function resultJson(r: AgentToolResult): string {
  const s = JSON.stringify({ id: r.id, ok: r.ok, data: r.data, error: r.error });
  if (s.length > 6000)
    return JSON.stringify({
      id: r.id,
      ok: r.ok,
      data: String(JSON.stringify(r.data)).slice(0, 5600) + '…(截断)',
      error: r.error,
    });
  return s;
}

/** 面板展示用的结果摘要 */
export function summarizeResult(r: AgentToolResult): string {
  if (!r.ok) return `✗ ${r.error ?? '执行失败'}`;
  const s = JSON.stringify(r.data);
  return s.length > 220 ? s.slice(0, 220) + '…' : s;
}

/** 工具回执的紧凑单行（写操作台账用） */
function ledgerLine(name: string, r: AgentToolResult): string {
  const brief = r.ok
    ? JSON.stringify(r.data).slice(0, 120)
    : `失败：${(r.error ?? '').slice(0, 100)}`;
  return `${name}${r.ok ? '✓' : '✗'} ${brief}`;
}

// ============ 五 · 主循环 ============

const TOOL_CALL_TEMPLATE =
  '```json\n{"tool_calls": [{"id": "c1", "name": "工具名", "args": {参数对象}}]}\n```';

/** 一次模型调用（SSE 流式）；返回正文与思考流。永不 throw——网络/HTTP 错误进 err。 */
async function callModel(
  provider: OracleProviderConfig,
  messages: AgentChatMessage[],
  deep: boolean,
  signal: AbortSignal | undefined,
  onDelta: AgentTurnCallbacks['onDelta'],
): Promise<{ content: string; reasoning: string; err: string }> {
  // ── 本地模型分支（浏览器端原生推理，无需服务器） ──
  if (provider.kind === 'local') {
    try {
      const result = await callLocalModel(provider, messages, signal);
      // 本地模型一次性返回完整文本，通过 onDelta 一次性推送，兼容 agent 循环的流式接口
      onDelta?.({ text: result.content, reason: result.reasoning });
      return {
        content: result.content,
        reasoning: result.reasoning,
        err: result.err,
      };
    } catch (e) {
      return { content: '', reasoning: '', err: e instanceof Error ? e.message : String(e) };
    }
  }

  let content = '';
  let reasoning = '';
  let streamErr = '';
  try {
    const res = await fetch('/api/oracle/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, messages, deep }),
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
      // 静态托管（GitHub Pages 等）上 /api/* 不存在：404/405 → 友好降级文案
      if (res.status === 404 || res.status === 405) {
        msg = '神谕离线：此部署为纯静态托管，无 AI 后端（游戏本体不受影响）';
      }
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      if (signal?.aborted) {
        void reader.cancel();
        throw new Error('已中止');
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
        if (payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload) as { t?: string; r?: string; err?: string };
          if (ev.err) streamErr = ev.err;
          if (ev.t || ev.r) {
            content += ev.t ?? '';
            reasoning += ev.r ?? '';
            onDelta?.({ text: ev.t, reason: ev.r });
          }
        } catch {
          /* 忽略无法解析的行 */
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) return { content, reasoning, err: '已中止' };
    return { content: '', reasoning, err: e instanceof Error ? e.message : String(e) };
  }
  return { content, reasoning, err: streamErr };
}

/** 会话防失控裁剪：保留首条系统提示 + 最近 59 条（中间整段丢弃） */
function trimMessages(messages: AgentChatMessage[]): AgentChatMessage[] {
  const CAP = 60;
  if (messages.length <= CAP) return messages;
  const sys = messages[0];
  const tail = messages.slice(-(CAP - 1));
  return [sys, ...tail];
}

/** 执行一轮完整的 Agent 会话（含多轮工具循环）；永不 throw——错误进 result.error
 *  v4（超级演化轮）：工具循环轮数限制取消（默认 400 = 事实上的无限），改由三重智能守卫防失控：
 *  ① 同签名重复失败守卫：同一调用（名+参数）连续失败 ≥4 次注入换路指令，≥6 次强制收束；
 *  ② 无进展守卫：连续 8 轮没有任何成功的新工具调用 → 注入收束指令；
 *  ③ 中止信号全链路有效（造物主随时可停）。 */
export async function runOracleAgentTurn(
  provider: OracleProviderConfig,
  history: AgentChatMessage[],
  cb: AgentTurnCallbacks = {},
  maxTurns = 400,
  deep = false,
): Promise<AgentTurnResult> {
  const toolEvents: OracleToolEvent[] = [];
  const writeLedger: string[] = [];
  let failedWrites = 0;
  // 幻觉执行保险丝：全程零工具调用 + 写操作语境 → 注入系统校验消息重跑（v5：至多 2 次）
  let hallucinationRetried = 0;
  // 格式纠错次数上限（防模型反复输出坏 JSON 打转）
  let formatRetries = 0;
  // 用户最后指令（写意图检测）
  const lastUserMsg = [...history].reverse().find((m) => m.role === 'user')?.content ?? '';
  // v5 写意图正则大扩容：旧表漏了「放/来/给/弄/做/整/下/扔/丢/爆/炸/轰/劈/烧/淹/冻/唤/召/起/发/埋/种/布/撒/泼/掳」等高频动词
  // ——「放核弹」「来一场瘟疫」「给我造个武器」此前全部漏判 → 守卫不触发 → 「夸了一顿就没反应」的直接根因
  const userAsksWrite =
    /(创建|新建|建立|改|修改|改写|更新|删除|移除|废除|撤销|重命名|改名|更名|宣战|议和|停战|结盟|退盟|合并|统一|生成|创造|召唤|唤来|传送|降下|施放|降落|落下|丢下|扔下|投掷|发射|发起|开启|打开|关闭|暂停|加速|减速|保存|存档|读档|设置|设为|加|减|写|书写|颁布|发令|下令|命令|让|使|令|赐|赏赐|处决|杀|灭|清空|点燃|引燃|烧掉|铸|造|做出|弄出|来一|来个|来场|给我|放上|放置|放个|放颗|放枚|投放|扔个|扔颗|丢个|爆|炸|轰炸|核平|轰击|轰|劈|雷击|淹没|冲毁|冻住|冰封|干旱|瘟疫|感染|变异|辐射|部署|布置|安排|种植|播撒|树立|封|解封|启动|停用|启用|禁用|觉醒|唤醒|编辑|再编辑|调整|调节|微调|强化|弱化|赐予|灌输|注入|赋予|附加)/.test(
      lastUserMsg,
    );
  const answerClaimsDone = (t: string) =>
    /已[^\n{}]{0,12}?(更新|创建|修改|完成|改名|删除|移除|改为|更名|写入|生效|执行|颁布)|(更新|创建|修改|改名|删除|移除|执行|颁布)[^\n{}]{0,6}(成功|完毕|完成)/.test(
      t,
    );

  // 工作副本：系统提示 + 历史
  const messages: AgentChatMessage[] = [...history];
  // v4 守卫状态：同签名连续失败计数（防死循环重试同一坏参数）+ 无进展轮数（防无限扩展任务）
  const failStreak = new Map<string, number>();
  let lastProgressTurn = 0;
  let rerouteNotified = false;

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (cb.signal?.aborted) return { content: '', toolEvents, turns: turn - 1, error: '已中止' };

    // —— 无进展守卫：连续 8 轮无任何成功调用 → 注入收束指令 ——
    if (turn - lastProgressTurn > 8) {
      messages.push({
        role: 'user',
        content: `【系统】已连续 ${turn - lastProgressTurn - 1} 轮没有任何成功的工具调用（全部失败或空转）。请立即基于已有工具回执给出最终回答，不要再调用任何工具：已完成了什么、还有什么没做完、建议造物主下一步怎么做。`,
      });
      const wrap = await callModel(provider, trimMessages(messages), deep, cb.signal, cb.onDelta);
      if (wrap.content) return { content: stripLedgerEcho(stripToolBlocks(wrap.content)), toolEvents, turns: turn, reasoning: wrap.reasoning };
      return { content: '', toolEvents, turns: turn, error: wrap.err || '连续多轮无进展，已收束', reasoning: wrap.reasoning };
    }

    // —— 一次模型调用（SSE 流式；空响应重试一次） ——
    let model = await callModel(provider, trimMessages(messages), deep, cb.signal, cb.onDelta);
    if (!model.content && !model.err) {
      model = await callModel(provider, trimMessages(messages), deep, cb.signal, cb.onDelta);
    }
    const { content, err } = model;
    if (!content && err) return { content: '', toolEvents, turns: turn, error: err, reasoning: model.reasoning };

    // —— 解析工具调用（v2） ——
    const { calls, malformed } = extractToolCalls(content);

    if (calls.length === 0) {
      // —— 格式纠错：疑似工具块但 JSON 坏 → 回传错误与规范模板同轮重试 ——
      if (malformed.length > 0 && formatRetries < 2) {
        formatRetries++;
        messages.push({ role: 'assistant', content });
        messages.push({
          role: 'user',
          content: `【系统校验】检测到 ${malformed.length} 个疑似工具调用块，但 JSON 解析失败（尾逗号/单引号/注释/缺引号等）。首个坏块开头：${malformed[0]}。请严格按以下格式重新发出工具调用——整条回复只含一个 json 代码块，块内是合法 JSON（双引号、无尾逗号、无注释、无 JavaScript 表达式）：\n${TOOL_CALL_TEMPLATE}`,
        });
        continue;
      }
      // —— 幻觉执行保险丝：用户要求写操作 + 全程零工具调用 → 强制重跑（v5：至多 2 次）——
      if (hallucinationRetried < 2 && toolEvents.length === 0 && userAsksWrite) {
        hallucinationRetried++;
        messages.push({ role: 'assistant', content });
        messages.push({
          role: 'user',
          content: `【系统校验】造物主的指令包含写操作，但本轮对话没有发生任何工具调用（tool_results 为空）——刚才的回答（${answerClaimsDone(content) ? '声称已完成，' : ''}若描述了操作结果）属于未执行的虚构。请现在真实调用相应工具执行指令「${lastUserMsg.slice(0, 200)}」，格式严格如下（整条回复只含这一个 json 代码块）：\n${TOOL_CALL_TEMPLATE}`,
        });
        continue;
      }
      // —— 最终回答 ——
      const finalContent = stripLedgerEcho(stripToolBlocks(content));
      // v5 兜底：用户要求写 + 全程零工具 + 两次纠错后仍是空谈 → 不返回模型空谈，返回系统级未执行声明
      if (userAsksWrite && toolEvents.length === 0 && answerClaimsDone(finalContent)) {
        return {
          content: `${finalContent}\n\n> ⚠ 神谕未执行任何工具——上述「已完成」未经真实调用。请重新下达指令或换一种表述（如「在 (x,y) 放一颗核弹」）。`,
          toolEvents,
          turns: turn,
          reasoning: model.reasoning,
        };
      }
      const allWritesFailed = writeLedger.length === 0 && failedWrites > 0;
      const warnSuffix =
        userAsksWrite && toolEvents.length === 0
          ? '\n\n> ⚠ 造物主请注意：本轮没有任何工具调用回执，上述表述可能未经真实执行——请以机制管理视图/查询工具的实况为准。'
          : allWritesFailed && answerClaimsDone(finalContent)
            ? '\n\n> ⚠ 造物主请注意：本轮全部写操作均告失败，上述「已完成」的表述与工具回执不符——请让神谕重试或换一种方式下达指令。'
            : '';
      return { content: finalContent + warnSuffix, toolEvents, turns: turn, reasoning: model.reasoning };
    }

    // —— 本地执行工具（活引擎 + 参数修复层） ——
    cb.onToolCalls?.(calls);
    const eng = getEngine();
    const results: AgentToolResult[] = [];
    for (const raw of calls) {
      const known = TOOL_DEFS.has(raw.name);
      const args = known ? repairCallArgs(raw.name, raw.args ?? {}) : (raw.args ?? {});
      let r: AgentToolResult;
      if (!known) {
        const sugg = suggestTools(raw.name).join('、');
        r = {
          id: raw.id,
          ok: false,
          data: null,
          error: `未知工具「${raw.name}」${sugg ? `——你是想用：${sugg}？` : `（可用 get_introspection 查看全部 ${AGENT_TOOLS.length} 个工具）`}`,
        };
      } else if (!eng) {
        r = { id: raw.id, ok: false, data: null, error: '世界引擎尚未就绪（先进入一个世界再召唤神谕）' };
      } else {
        r = executeOracleTool(eng, raw.name, args);
        if (!r.ok && r.error) {
          // 失败附收到的参数——模型可据此自我纠错
          const argsBrief = JSON.stringify(args).slice(0, 150);
          r = { ...r, error: `${r.error}（收到参数 ${argsBrief}）` };
        }
      }
      const withIdRes = { ...r, id: raw.id };
      results.push(withIdRes);
      toolEvents.push({ name: raw.name, args, ok: r.ok, summary: summarizeResult(withIdRes) });
      if (WRITE_TOOLS.has(raw.name)) {
        if (r.ok) writeLedger.push(ledgerLine(raw.name, withIdRes));
        else failedWrites++;
      }
      // v4 守卫记账：同签名连续失败计数 / 成功则清零并标记进展
      const sig = `${raw.name}::${JSON.stringify(args)}`;
      if (r.ok) {
        failStreak.delete(sig);
        lastProgressTurn = turn;
      } else {
        failStreak.set(sig, (failStreak.get(sig) ?? 0) + 1);
      }
      cb.onToolResult?.(raw, withIdRes);
    }

    // —— 同签名重复失败守卫：同一调用连续失败 ≥4 次 → 注入换路指令（≥6 次直接收束） ——
    let worstSig = '';
    let worstN = 0;
    for (const [sig, n] of failStreak) {
      if (n > worstN) { worstN = n; worstSig = sig; }
    }
    if (worstN >= 6) {
      messages.push({
        role: 'user',
        content: `【系统】调用 ${worstSig.slice(0, 160)} 已连续失败 ${worstN} 次，继续重试同样参数没有意义。请立即停止重试该调用，基于已有工具回执给出最终回答：已完成了什么、失败的原因分析、建议造物主的替代方案。`,
      });
      const wrap = await callModel(provider, trimMessages(messages), deep, cb.signal, cb.onDelta);
      if (wrap.content) return { content: stripLedgerEcho(stripToolBlocks(wrap.content)), toolEvents, turns: turn, reasoning: wrap.reasoning };
      return { content: '', toolEvents, turns: turn, error: wrap.err || '重复失败守卫触发，已收束', reasoning: wrap.reasoning };
    }
    if (worstN >= 4 && !rerouteNotified) {
      rerouteNotified = true;
      messages.push({
        role: 'user',
        content: `【系统】检测到调用 ${worstSig.slice(0, 160)} 已连续失败 ${worstN} 次。请换一种方式：重新阅读错误信息、修正参数（范围/名称/坐标系），或改用其他工具达成目标（get_introspection 可查能力地图）。不要再以完全相同的参数重试。`,
      });
      continue;
    }

    // —— 结果回传：assistant 原文 + user tool_results ——
    messages.push({ role: 'assistant', content });
    messages.push({ role: 'user', content: `{"tool_results": [${results.map(resultJson).join(',')}]}` });
  }

  // —— 事实无限的循环也不会空手而归：收束指令强制产出最终总结 ——
  messages.push({
    role: 'user',
    content: `【系统】工具循环已达安全上限（${maxTurns} 轮——这几乎不可能自然触及）。请立即基于以上全部工具回执给出最终回答，不要再调用任何工具：已完成了什么（逐项列出工具回执）、还有什么没做完、建议造物主下一步怎么做。${writeLedger.length ? `\n已执行写操作台账：\n- ${writeLedger.join('\n- ')}` : ''}`,
  });
  const wrap = await callModel(provider, trimMessages(messages), deep, cb.signal, cb.onDelta);
  if (wrap.content) {
    return { content: stripLedgerEcho(stripToolBlocks(wrap.content)), toolEvents, turns: maxTurns, reasoning: wrap.reasoning };
  }
  return {
    content: '',
    toolEvents,
    turns: maxTurns,
    error: wrap.err || `已达最大循环轮数（${maxTurns}）——请简化指令或分步下达`,
    reasoning: wrap.reasoning,
  };
}
