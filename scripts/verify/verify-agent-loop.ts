// 端到端验证：原生函数调用 agent 循环（mock OpenAI 兼容 SSE 服务器）
// （bun 运行时专用；@types/bun 不在依赖内——就地声明 Bun.serve 的最小面）
declare const Bun: { serve(cfg: Record<string, unknown>): { port: number; stop(): void } };
// 覆盖：tools 参数下发 / system 角色转换 / 流式 tool_calls 解析 /
//       权限闸门（L0 拦截 run_script）/ role:'tool' 结果回传 / 最终回答收束
import './dom-stub';

const PORT = 18123;
let reqCount = 0;
const seenBodies: Record<string, unknown>[] = [];

const sse = (obj: unknown): Response => {
  const enc = new TextEncoder();
  const payload = `data: ${JSON.stringify(obj)}\n\n`;
  const stream = new ReadableStream({
    start(c) { c.enqueue(enc.encode(payload)); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const body = (await req.json()) as Record<string, unknown>;
    seenBodies.push(body);
    reqCount++;
    if (reqCount === 1) {
      // 第一轮：下发 tool_calls（get_stats + run_script 并行）
      return sse({ choices: [{ delta: { tool_calls: [
        { index: 0, id: 'call_a', type: 'function', function: { name: 'get_stats', arguments: '{}' } },
        { index: 1, id: 'call_b', type: 'function', function: { name: 'run_script', arguments: '{"code":"return 1"}' } },
      ] } }] });
    }
    // 第二轮：纯文本收束
    return sse({ choices: [{ delta: { content: '世界实况已呈报，根壳权限不足已如实转告。' } }] });
  },
});

const { runOracleAgentTurn } = await import('../../src/lib/oracle/agent');
const { buildSystemPrompt } = await import('../../src/lib/oracle/prompt');
const { renderToolCatalog } = await import('../../src/lib/oracle/tools');
const { buildNativeToolParams } = await import('../../src/lib/oracle/native-tools');
const { PERM_LEVELS } = await import('../../src/lib/oracle/permissions');

let pass = 0, fail = 0;
const t = (name: string, cond: boolean) => { cond ? pass++ : (fail++, console.log('✗ FAIL: ' + name)); };

const perm = { level: 0, confirm: [], rootAck: false }; // L0 观察者：read 放行 / write+root 拦截
const provider = { kind: 'openai' as const, label: 'Mock厂商', baseUrl: `http://localhost:${PORT}/v1`, model: 'mock-model', apiKey: 'k' };
const history = [
  { role: 'assistant' as const, content: buildSystemPrompt(renderToolCatalog(), { native: true, perm }) },
  { role: 'user' as const, content: '报告世界实况，并用根壳做一次手术' },
];

const res = await runOracleAgentTurn(
  provider,
  history,
  {},
  10,
  false,
  {
    perms: perm,
    nativeTools: buildNativeToolParams(PERM_LEVELS[perm.level].tiers),
    systemPromptNative: buildSystemPrompt(renderToolCatalog(), { native: true, perm }),
  },
);

// —— 断言：结果 ——
t('回合成功返回', !!res.content);
t('最终回答为模型文本', res.content.includes('根壳权限不足'));
t('两轮模型调用', res.turns === 2);
t('两个工具事件', res.toolEvents.length === 2);
const evtNames = res.toolEvents.map((e) => e.name);
t('并行调用都被执行', evtNames.includes('get_stats') && evtNames.includes('run_script'));
t('run_script 被 L0 权限闸门拦截', res.toolEvents.find((e) => e.name === 'run_script')?.summary.includes('权限不足') === true);

// —— 断言：请求体（原生 FC 协议细节） ——
const req1 = seenBodies[0] as Record<string, unknown>;
const msgs1 = req1.messages as Record<string, unknown>[];
t('请求一含 tools 参数', Array.isArray(req1.tools) && (req1.tools as unknown[]).length > 0);
t('请求一 system 角色转换', msgs1[0]?.role === 'system');
t('tool_choice=auto', req1.tool_choice === 'auto');
const req2 = seenBodies[1] as Record<string, unknown>;
const msgs2 = req2.messages as Record<string, unknown>[];
const toolMsgs = msgs2.filter((m) => m.role === 'tool');
t('请求二含 role:tool 结果回传', toolMsgs.length === 2);
t('tool 消息带 tool_call_id', toolMsgs.every((m) => typeof m.tool_call_id === 'string' && m.tool_call_id.startsWith('call_')));
const asstWithCalls = msgs2.filter((m) => m.role === 'assistant' && Array.isArray((m as { tool_calls?: unknown }).tool_calls));
t('请求二保留 assistant.tool_calls 轨迹', asstWithCalls.length === 1 && (asstWithCalls[0] as { tool_calls: unknown[] }).tool_calls.length === 2);
const toolContent0 = JSON.stringify(toolMsgs.map((m) => m.content));
t('run_script 拦截文案进入模型上下文', toolContent0.includes('权限不足'));

// —— 断言：审计流 ——
const { useGameStore } = await import('../../src/store/gameStore');
const audit = useGameStore.getState().oracleAudit;
t('审计流记录权限拦截', audit.some((e) => e.name === 'run_script' && e.verdict === 'deny'));

console.log(`\n===== 原生 FC Agent 循环端到端：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail > 0 ? 1 : 0);
