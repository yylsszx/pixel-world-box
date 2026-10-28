// M-O1 五包最小闭环冒烟（组件级，零网络、零构建）
// 闭环内容：cordis 启动 → SystemPrompt + ToolsService + NativeToolExecutor 插件挂载
//   → defineTool 注册（神谕AI 游戏工具桥的原型签名）→ ctx.tools.execute 真实执行一批
//   → DeepSeekAdapter 构造（llm-deepseek）→ agent-loop / session 闭包加载断言。
// 用法：cd third_party/deepseek-harness && node --import tsx \
//        --import ../../home/z/my-project/scripts/oracle-dsh/hook-register.mjs \
//        ../../home/z/my-project/scripts/oracle-dsh/smoke.mjs
//       （绝对路径调用，见 run-smoke.sh）
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { ToolsService, defineTool } from '@deepseek-ai/dsh-tools'
import * as nativeExecutorPlugin from '@deepseek-ai/dsh-tool-executor-native'
import { DeepSeekAdapter } from '@deepseek-ai/dsh-llm-deepseek'
import { Session } from '@deepseek-ai/dsh-session'
import AgentLoop, { DEFAULT_MAX_PARALLEL_TOOL_CALLS } from '@deepseek-ai/dsh-agent-loop'

const steps = []
function step(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => {
      steps.push(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
    })
}

const app = new Context()

await step('① cordis 启动 + 三服务构造（system-prompt / tools / native-executor）', async () => {
  // 此 cordis fork 的 Service 以直接构造注册（ctor 内 ctx.reflect.provide），
  // 构造序即注入序：systemPrompt 先于 tools（ToolsService ctor 调 ctx.systemPrompt.tools(...)）
  new SystemPrompt(app, {})
  new ToolsService(app)
  nativeExecutorPlugin.apply(app) // ctx.tools.setExecutor(new NativeToolExecutor(ctx))
  assert.ok(app.tools, 'ctx.tools 未就位')
  assert.ok(app.systemPrompt, 'ctx.systemPrompt 未就位')
  return 'ctx.tools/ctx.systemPrompt 就位'
})

await step('② defineTool 注册（神谕AI 游戏工具桥原型签名 wb_echo）', async () => {
  const wbEcho = defineTool({
    name: 'wb_echo',
    description: 'M-O1 smoke fixture: echo text back as content blocks.',
    parameters: {
      text: { type: 'string', required: true, description: 'Text to echo.' },
    },
    output: {
      schema: { type: 'array', items: { type: 'json' } },
      render: (_args, value) => value,
    },
    async execute(args) {
      return [{ type: 'text', text: 'echo:' + args.text }]
    },
  })
  const dispose = app.tools.register(wbEcho)
  assert.equal(typeof dispose, 'function', 'register 未返回 disposer')
  return 'wb_echo 已注册（可注销）'
})

await step('③ NativeToolExecutor 真实执行一批工具调用', async () => {
  const batch = await app.tools.execute({
    calls: [{
      type: 'tool-call',
      id: 'smoke-1',
      name: 'wb_echo',
      arguments: JSON.stringify({ text: 'hello-dsh' }),
    }],
    signal: new AbortController().signal,
  })
  assert.ok(Array.isArray(batch.results) && batch.results.length === 1, '批次结果数异常')
  const outcome = batch.results[0]
  const text = JSON.stringify(outcome)
  assert.ok(text.includes('echo:hello-dsh'), `执行输出未含回显串：${text.slice(0, 200)}`)
  return `结果链 ${text.slice(0, 120)}`
})

await step('④ llm-deepseek：DeepSeekAdapter 构造 + provider 面（零网络）', async () => {
  const adapter = new DeepSeekAdapter({
    providerName: 'DeepSeek',
    options: () => ({
      apiKey: 'sk-smoke-not-a-real-key',
      baseURL: 'https://api.deepseek.com',
    }),
  })
  const info = adapter.providerInfo('deepseek')
  assert.equal(info.id, 'deepseek')
  assert.equal(info.name, 'DeepSeek')
  const policy = adapter.providerRetryPolicy('deepseek')
  assert.ok(policy === undefined || typeof policy === 'object', 'retry policy 形态异常')
  return `providerInfo=${info.id}/${info.name}`
})

await step('⑤ agent-loop + session 闭包全量加载断言', async () => {
  assert.equal(typeof AgentLoop, 'function', 'AgentLoop 服务类未导出')
  assert.equal(typeof Session, 'function', 'Session 类未导出')
  assert.equal(typeof Session.fromRestore, 'function', 'Session.fromRestore 静态工厂缺失')
  assert.equal(typeof DEFAULT_MAX_PARALLEL_TOOL_CALLS, 'number', '常量缺失')
  return `AgentLoop/Session 闭包加载 OK（maxParallel 默认 ${DEFAULT_MAX_PARALLEL_TOOL_CALLS}）`
})

console.log('M-O1 dsh 五包最小闭环冒烟：ALL PASS')
for (const line of steps) console.log(line)
process.exit(0)
