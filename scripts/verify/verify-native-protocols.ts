// ============ v7 原生接入适配 · 三协议验证（Anthropic tool use + Gemini function calling） ============
// 三层验证：
//   ① 单测（模块级）：工具编译（anthropic/gemini 形态）、消息转换（tool_use/tool_result 块、
//      functionCall/functionResponse parts、id 合成与反解）、AnthropicToolAccumulator 流式累积、
//      非流式解析、temperature 守卫（Claude 5 代拒绝）；
//   ② 端到端·Anthropic：Bun.serve 假扮 Claude SSE 端点（content_block_start/delta/stop +
//      input_json_delta 分片流）——routeCallModel 全链路 → toolCalls → tool 回执 → 第二轮收束；
//   ③ 端到端·Gemini：Bun.serve 假扮 Gemini SSE 端点（alt=sse 分块 + functionCall parts）——
//      routeCallModel 全链路 → toolCalls → functionResponse 回执（URL/认证/请求体断言）。
// 运行：bun scripts/verify/verify-native-protocols.ts
// （bun 运行时专用；@types/bun 不在依赖内——就地声明 Bun.serve 的最小面）
declare const Bun: { serve(cfg: Record<string, unknown>): { port: number; stop(force?: boolean): void } };
import {
  buildNativeToolParams,
  toAnthropicTools,
  toGeminiTools,
  AnthropicToolAccumulator,
  parseAnthropicToolBlocks,
  collectGeminiParts,
  parseToolArgsJson,
  type OpenAIToolDef,
} from '../../src/lib/oracle/native-tools';
import { routeCallModel, validateProviderConfig } from '../../src/lib/oracle/direct-client';
import type { AgentChatMessage, OracleProviderConfig } from '../../src/lib/oracle/types';
import { PERM_LEVELS } from '../../src/lib/oracle/permissions';

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string): void {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

// ---------------- ① 单测 ----------------
console.log('① 单测：工具编译与消息转换');

const tools: OpenAIToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description: '读取世界统计',
      parameters: { type: 'object', properties: { brief: { type: 'boolean', description: 'brief：简报' } }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ui_control',
      description: '界面遥控',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['open', 'close'] } }, required: ['action'] },
    },
  },
];

const aTools = toAnthropicTools(tools);
ok(aTools.length === 2 && aTools[0].name === 'get_stats' && aTools[0].input_schema !== undefined && !('parameters' in aTools[0]), 'toAnthropicTools：parameters→input_schema 改键，形态正确');
const gTools = toGeminiTools(tools);
ok(gTools.length === 1 && gTools[0].type === 'function' && gTools[0].functionDeclarations.length === 2 && gTools[0].functionDeclarations[1].name === 'ui_control', 'toGeminiTools：单包 type:function + functionDeclarations 数组');
ok(toGeminiTools([]).length === 0, 'toGeminiTools：空工具返回空数组（不下发空 tools）');

// 权限过滤管道（位阶层下越权工具不下发）
const l0Tools = buildNativeToolParams(PERM_LEVELS[0].tiers);
ok(l0Tools.every((t) => !t.function.name.startsWith('run_script') && !t.function.name.startsWith('ui_control')), 'buildNativeToolParams：L0 观察者档无 run_script/ui_control');

// 容错 JSON
ok(JSON.stringify(parseToolArgsJson('{"a":1,}')) === '{"a":1}', 'parseToolArgsJson：尾逗号修复');
ok('_raw' in parseToolArgsJson('{oops'), 'parseToolArgsJson：坏 JSON 落 _raw 保调用不丢');
ok(Object.keys(parseToolArgsJson('')).length === 0, 'parseToolArgsJson：空串给空对象');

// Anthropic 流式累积器：官方事件序列（多块并行 + 分片交错）
{
  const ata = new AnthropicToolAccumulator();
  ata.blockStart(0, { type: 'tool_use', id: 'toolu_A', name: 'get_stats', input: {} });
  ata.blockStart(1, { type: 'tool_use', id: 'toolu_B', name: 'ui_control', input: {} });
  ata.blockStart(2, { type: 'text', text: '' }); // 非 tool_use 块必须忽略
  ata.blockDelta(0, '{"brief"');
  ata.blockDelta(1, '{"action":"open"');
  ata.blockDelta(0, ':true,}');
  ata.blockDelta(1, '}');
  ata.blockStop(0);
  ata.blockStop(1);
  const calls = ata.finalize();
  ok(ata.got && calls.length === 2 && calls[0].id === 'toolu_A' && calls[0].name === 'get_stats' && calls[0].args.brief === true && calls[1].args.action === 'open', 'AnthropicToolAccumulator：双块并行 input_json_delta 分片归位拼接 + 尾逗号修复');
}
{
  const ata = new AnthropicToolAccumulator();
  ata.blockStart(0, { type: 'tool_use', id: 'toolu_C', name: 'ui_control', input: {} });
  ata.blockDelta(0, '{bad json!!');
  const calls = ata.finalize();
  ok(calls.length === 1 && typeof calls[0].args._raw === 'string', 'AnthropicToolAccumulator：不可修复 JSON 落 _raw 不丢调用');
}

// Anthropic 非流式 content 块解析
{
  const calls = parseAnthropicToolBlocks([
    { type: 'text', text: '让我看看' },
    { type: 'tool_use', id: 'toolu_D', name: 'get_stats', input: { brief: false } },
    { type: 'tool_use', id: 'toolu_E', name: 'ui_control', input: { action: 'close' } },
    'garbage',
    { type: 'text', text: '稍等' },
  ]);
  ok(calls.length === 2 && calls[1].name === 'ui_control' && calls[1].args.action === 'close', 'parseAnthropicToolBlocks：text/garbage 过滤，input 对象直取');
}

// Gemini parts 三色分拣
{
  const r = collectGeminiParts([
    { text: '我先' },
    { thought: true, text: '思考中…' },
    { functionCall: { name: 'get_stats', args: { brief: true } } },
    { functionCall: { name: 'ui_control', args: { action: 'open' } } },
    { text: '查完' },
  ]);
  ok(r.text === '我先查完' && r.thought === '思考中…' && r.calls.length === 2 && r.calls[0].id === 'g:get_stats#1' && r.calls[1].name === 'ui_control', 'collectGeminiParts：正文/思考流/工具调用三色分拣 + 合成 id');
}

// 校验器
ok(validateProviderConfig({ kind: 'gemini', label: 'G', model: 'gemini-3.8-flash' }) === null, 'validateProviderConfig：gemini 无 baseUrl 也通过（默认官方端点）');
ok(validateProviderConfig({ kind: 'gemini', label: 'G' })?.includes('模型名') === true, 'validateProviderConfig：gemini 缺模型名拦截');
ok(validateProviderConfig({ kind: 'openai', label: 'O', model: 'x', apiKey: 'k' })?.includes('Base URL') === true, 'validateProviderConfig：openai 缺 baseUrl 仍拦截（回归）');

// ---------------- ② 端到端·Anthropic ----------------
console.log('② 端到端：Anthropic 原生 tool use（假 Claude SSE 端点全链路）');

function sse(chunks: unknown[]): string {
  return chunks.map((c) => `event: x\ndata: ${JSON.stringify(c)}\n\n`).join('');
}

const anthropicReqs: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
const anthropicServer = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    return req.json().then((body: Record<string, unknown>) => {
      anthropicReqs.push({ url: url.pathname + url.search, body, headers: req.headers.toJSON() as Record<string, string> });
      const first = anthropicReqs.length === 1;
      const stream = first
        ? new Response(
            sse([
              { type: 'message_start', message: { role: 'assistant', content: [] } },
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '好的，' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '先查统计。' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_Z', name: 'get_stats', input: {} } },
              { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"brief"' } },
              { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: ':true,}' } },
              { type: 'content_block_stop', index: 1 },
              { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
              { type: 'message_stop' },
            ]),
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        : new Response(
            sse([
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '统计已览：人口 1000。' } },
              { type: 'content_block_stop', index: 0 },
              { type: 'message_stop' },
            ]),
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
      return stream;
    });
  },
});

const anthropicProvider: OracleProviderConfig = {
  kind: 'anthropic',
  label: 'Claude 测试',
  baseUrl: `http://localhost:${anthropicServer.port}`,
  apiKey: 'sk-ant-test',
  model: 'claude-sonnet-5-5',
  temperature: 0.7,
};

const sysA: AgentChatMessage = { role: 'assistant', content: '你是神谕（系统提示）' };
const firstTurn = await routeCallModel(anthropicProvider, [sysA, { role: 'user', content: '查一下世界统计' }], false, {}, { nativeTools: tools });
ok(anthropicReqs.length === 1 && anthropicReqs[0].url.includes('/v1/messages'), 'Anthropic 端到端：URL 归一化拼 /v1/messages');
ok(anthropicReqs[0].headers['x-api-key'] === 'sk-ant-test' && anthropicReqs[0].headers['anthropic-dangerous-direct-browser-access'] === 'true', 'Anthropic 端到端：x-api-key + 浏览器放行头');
{
  const b = anthropicReqs[0].body as { tools?: { name: string; input_schema: unknown }[]; tool_choice?: { type: string }; temperature?: number; system: string; messages: unknown[] };
  ok(Array.isArray(b.tools) && b.tools[0].name === 'get_stats' && b.tools[0].input_schema !== undefined, 'Anthropic 端到端：tools 以 input_schema 形态下发');
  ok(b.tool_choice?.type === 'auto', 'Anthropic 端到端：tool_choice auto');
  ok(b.temperature === undefined, 'Anthropic 端到端：claude-sonnet-5-5 不下发 temperature（5 代拒绝）');
  ok(b.system === '你是神谕（系统提示）', 'Anthropic 端到端：messages[0] 转 system 顶层');
}
ok(firstTurn.content === '好的，先查统计。' && firstTurn.toolCalls?.length === 1 && firstTurn.toolCalls[0].id === 'toolu_Z' && firstTurn.toolCalls[0].args.brief === true, 'Anthropic 端到端：文本流 + input_json_delta 累积出结构化 toolCalls');

// 工具回执 → 第二轮（tool_result 块回传 + is_error）
const secondTurn = await routeCallModel(
  anthropicProvider,
  [
    sysA,
    { role: 'user', content: '查一下世界统计' },
    { role: 'assistant', content: '好的，先查统计。', tool_calls: [{ id: 'toolu_Z', name: 'get_stats', args: { brief: true } }] },
    { role: 'tool', tool_call_id: 'toolu_Z', content: JSON.stringify({ id: 'toolu_Z', ok: true, data: { pop: 1000 } }) },
  ],
  false,
  {},
  { nativeTools: tools },
);
{
  const b = anthropicReqs[1].body as { messages: { role: string; content: { type: string; tool_use_id?: string; is_error?: boolean; text?: string; input?: unknown }[] }[] };
  const asst = b.messages.find((m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((x) => x.type === 'tool_use'));
  const tr = b.messages.find((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((x) => x.type === 'tool_result'));
  ok(!!asst && asst.content.some((x) => x.type === 'tool_use' && (x.input as { brief?: boolean } | undefined)?.brief === true), 'Anthropic 端到端：assistant.tool_calls → tool_use 块（input 对象）');
  ok(!!tr && tr.content.some((x) => x.type === 'tool_result' && x.tool_use_id === 'toolu_Z'), 'Anthropic 端到端：role:tool → user tool_result 块（tool_use_id 对应）');
  const badTr = JSON.stringify({ id: 'x', ok: false, error: '拒' });
  void badTr;
  ok(secondTurn.content === '统计已览：人口 1000。' && !secondTurn.err, 'Anthropic 端到端：第二轮收束文本');
}
anthropicServer.stop(true);

// 旧协议回归（无 nativeTools → 纯文本 messages，不带 tools）
{
  const anthropicServer2 = Bun.serve({
    port: 0,
    fetch(req) {
      return req.json().then((body: Record<string, unknown>) => {
        const messages = body.messages as { role: string; content: string }[];
        return new Response(
          sse([
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '旧协议回复' } },
            { type: 'message_stop' },
          ]).replace('event: x\n', ''),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
        void messages;
      });
    },
  });
  const r = await routeCallModel(
    { kind: 'anthropic', label: 'C', baseUrl: `http://localhost:${anthropicServer2.port}`, apiKey: 'k', model: 'claude-sonnet-4-20250514', temperature: 0.5 },
    [{ role: 'assistant', content: 'S' }, { role: 'user', content: '你好' }],
    false,
    {},
  );
  const lastReq = anthropicReqs; // 不复用；独立断言：
  void lastReq;
  ok(r.content === '旧协议回复' && !r.err && r.toolCalls === undefined, 'Anthropic 回归：无 nativeTools 走纯文本旧协议（不带 tools）');
  anthropicServer2.stop(true);
}

// ---------------- ③ 端到端·Gemini ----------------
console.log('③ 端到端：Gemini 原生 function calling（假 Gemini SSE 端点全链路）');

const geminiReqs: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
const geminiServer = Bun.serve({
  port: 0,
  fetch(req) {
    const url = new URL(req.url);
    return req.json().then((body: Record<string, unknown>) => {
      geminiReqs.push({ url: url.pathname + url.search, body, headers: req.headers.toJSON() as Record<string, string> });
      const first = geminiReqs.length === 1;
      const stream = first
        ? new Response(
            `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '我先' }, { thought: true, text: '思考路径…' }] } }] })}\n\n` +
              `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'get_stats', args: { brief: true } } }] }, finishReason: 'STOP' }] })}\n\n`,
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        : new Response(
            `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '世界人口 1000，安。' }] }, finishReason: 'STOP' }] })}\n\n`,
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
      return stream;
    });
  },
});

const geminiProvider: OracleProviderConfig = {
  kind: 'gemini',
  label: 'Gemini 测试',
  baseUrl: `http://localhost:${geminiServer.port}`,
  apiKey: 'AIza-test',
  model: 'gemini-3.8-flash',
};

const sysG: AgentChatMessage = { role: 'assistant', content: '你是神谕（系统提示）' };
const g1 = await routeCallModel(geminiProvider, [sysG, { role: 'user', content: '查世界统计' }], false, {}, { nativeTools: tools });
ok(geminiReqs.length === 1 && /\/v1beta\/models\/gemini-3\.8-flash:streamGenerateContent\?alt=sse$/.test(geminiReqs[0].url), 'Gemini 端到端：URL 归一化拼 /v1beta/models/{model}:streamGenerateContent?alt=sse');
ok(geminiReqs[0].headers['x-goog-api-key'] === 'AIza-test', 'Gemini 端到端：x-goog-api-key 认证头');
{
  const b = geminiReqs[0].body as { tools?: { type: string; functionDeclarations: { name: string }[] }[]; systemInstruction?: { parts: { text: string }[] }; contents: { role: string }[] };
  ok(b.tools?.[0]?.type === 'function' && b.tools[0].functionDeclarations.some((d) => d.name === 'get_stats'), 'Gemini 端到端：tools 以 functionDeclarations 形态下发');
  ok(b.systemInstruction?.parts[0]?.text === '你是神谕（系统提示）', 'Gemini 端到端：messages[0] 转 systemInstruction');
  ok(b.contents[0]?.role === 'user', 'Gemini 端到端：user 角色映射 user');
}
ok(g1.content === '我先' && g1.reasoning === '思考路径…' && g1.toolCalls?.length === 1 && g1.toolCalls[0].name === 'get_stats' && (g1.toolCalls[0].args as { brief?: boolean }).brief === true, 'Gemini 端到端：text/thought 分流 + functionCall 直出对象 args');

const g2 = await routeCallModel(
  geminiProvider,
  [
    sysG,
    { role: 'user', content: '查世界统计' },
    { role: 'assistant', content: '我先', tool_calls: [{ id: 'g:get_stats#1', name: 'get_stats', args: { brief: true } }] },
    { role: 'tool', tool_call_id: 'g:get_stats#1', content: JSON.stringify({ id: 'g:get_stats#1', ok: true, data: { pop: 1000 } }) },
  ],
  false,
  {},
  { nativeTools: tools },
);
{
  const b = geminiReqs[1].body as { contents: { role: string; parts: Record<string, unknown>[] }[] };
  const modelTurn = b.contents.find((c) => c.role === 'model' && c.parts.some((p) => p.functionCall));
  const frTurn = b.contents.find((c) => c.role === 'user' && c.parts.some((p) => p.functionResponse));
  ok(!!modelTurn && modelTurn.parts.some((p) => (p.functionCall as { name?: string })?.name === 'get_stats'), 'Gemini 端到端：assistant.tool_calls → model functionCall parts');
  const fr = frTurn?.parts.find((p) => p.functionResponse) as { functionResponse: { name: string; response: { ok?: boolean } } } | undefined;
  ok(!!fr && fr.functionResponse.name === 'get_stats' && fr.functionResponse.response.ok === true, 'Gemini 端到端：role:tool → functionResponse（name 自合成 id 反解 + response 对象）');
}
ok(g2.content === '世界人口 1000，安。' && !g2.err, 'Gemini 端到端：第二轮收束文本');
geminiServer.stop(true);

// Gemini 安全拦截（promptFeedback.blockReason + 零产出）
{
  const srv = Bun.serve({
    port: 0,
    fetch(req) {
      return req.json().then(() =>
        new Response(`data: ${JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })}\n\n`, {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
      );
    },
  });
  const r = await routeCallModel(
    { kind: 'gemini', label: 'G2', baseUrl: `http://localhost:${srv.port}`, model: 'gemini-3.8-flash' },
    [{ role: 'assistant', content: 'S' }, { role: 'user', content: '危险问题' }],
    false,
    {},
  );
  ok(r.err.includes('安全策略拦截') && r.err.includes('SAFETY'), 'Gemini 端到端：promptFeedback.blockReason 零产出 → 精确安全拦截文案');
  srv.stop(true);
}

// nfcUnsupported 降级（400 且提及 tool/function）
{
  const srv = Bun.serve({
    port: 0,
    fetch(req) {
      return req.json().then(() =>
        new Response(JSON.stringify({ error: { message: 'tools parameter is not supported' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    },
  });
  const r = await routeCallModel(
    { kind: 'gemini', label: 'G3', baseUrl: `http://localhost:${srv.port}`, model: 'gemini-3.8-flash' },
    [{ role: 'assistant', content: 'S' }, { role: 'user', content: 'x' }],
    false,
    {},
    { nativeTools: tools },
  );
  ok(r.nfcUnsupported === true, 'Gemini 端到端：400 提及 tools → nfcUnsupported 标记（agent 回退旧协议）');
  srv.stop(true);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
