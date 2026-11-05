// M-O4 相一：运行时装配冒烟——从 oracle-server/dsh-runtime（装配树，非池）自举
// 闭环：隔离负面断言 → cordis 启动 + pwb 五件注册 → fixture 工具真实执行 →
//       agent-loop/session/llm-deepseek 闭包加载 → pwb-context 叙事化冒烟
// 前置：node scripts/oracle-dsh/pack-runtime.mjs && cd oracle-server/dsh-runtime && pnpm install --ignore-scripts
// 用法：bash scripts/oracle-dsh/run-runtime-smoke.sh
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const runtimeRoot = path.resolve(here, '..', '..', 'oracle-server', 'dsh-runtime')

// ---- ⓪ 隔离负面断言：禁载能力组在装配树中物理缺席（R3/白名单纪律的硬证据）----
const forbidden = [
  'packages/shell/bash-local', 'packages/shell/bash-sandbox', 'packages/shell/tool-bash',
  'packages/shell/tool-bash-persistent', 'packages/shell/pwsh-local', 'packages/shell/tool-pwsh',
  'packages/web/web', 'packages/web/tool-web', 'packages/web/web-fetch-http',
  'packages/browser-use/browser-use', 'packages/computer-use/computer-use',
  'packages/fs/tool-fs', 'packages/fs/tool-fs-search', 'packages/fs/tool-str-replace-editor',
  'packages/fs/fs-local', 'packages/fs/fs-sandbox',
  'packages/terminal/terminal', 'packages/subprocess/subprocess-local',
  'packages/ssh/ssh', 'packages/host/webserver', 'packages/mcp/mcp-client',
  'packages/sandbox/sandbox-local', 'packages/session-query/session-query-sqlite',
  'packages/storage/storage-sqlite', 'packages/storage/storage-json',
  'packages/ptc-runtime/ptc-runtime-node',
  'packages/subagent/subagent-claude-code', 'packages/subagent/subagent-codex',
  'packages/subagent/subagent-acp', 'packages/skill/skill-office',
]
const present = forbidden.filter(rel => existsSync(path.join(runtimeRoot, rel)))
assert.equal(present.length, 0, `禁载能力包混入装配树：${present.join(', ')}`)
console.log('  ✓ ⓪ 隔离负面断言：禁载能力包 0/31 在装配树（物理缺席）')

const steps = []
function step(name, fn) {
  return Promise.resolve().then(fn).then((detail) => {
    steps.push(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
  })
}

await step('① pwb 五件注册面 + cordis 启动（装配树源码直消费）', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const SystemPrompt = (await import('@deepseek-ai/dsh-system-prompt')).default
  const { ToolsService } = await import('@deepseek-ai/dsh-tools')
  const nativeExecutorPlugin = await import('@deepseek-ai/dsh-tool-executor-native')
  const { applyAll } = await import('../../oracle-server/pwb-plugins.mjs')
  const app = new Context()
  new SystemPrompt(app, {})
  new ToolsService(app)
  nativeExecutorPlugin.apply(app)
  const dispose = applyAll(app)
  assert.equal(typeof dispose, 'function', '五件合注册未返回 disposer')
  assert.ok(app.tools && app.systemPrompt, 'ctx.tools/ctx.systemPrompt 未就位')
  assert.ok(app.pwbTools && app.pwbContext && app.pwbPrompt && app.pwbBridge && app.pwbStore, 'pwb 五件未就位')
  assert.ok(app.pwbTools.tools.some(t => t.name === 'wb_echo'), 'wb_echo 未注册')
  return 'pwb 五件 + 三服务就位'
})

await step('② pwb 工具经 NativeToolExecutor 真实执行', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const SystemPrompt = (await import('@deepseek-ai/dsh-system-prompt')).default
  const { ToolsService } = await import('@deepseek-ai/dsh-tools')
  const nativeExecutorPlugin = await import('@deepseek-ai/dsh-tool-executor-native')
  const { applyAll } = await import('../../oracle-server/pwb-plugins.mjs')
  const app = new Context()
  new SystemPrompt(app, {})
  new ToolsService(app)
  nativeExecutorPlugin.apply(app)
  applyAll(app)
  const batch = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'rt-1', name: 'wb_echo', arguments: JSON.stringify({ text: 'runtime-ok' }) }],
    signal: new AbortController().signal,
  })
  const text = JSON.stringify(batch.results[0])
  assert.ok(text.includes('echo:runtime-ok'), `执行输出异常：${text.slice(0, 160)}`)
  return 'wb_echo 回显全链通'
})

await step('③ agent-loop + session + llm-deepseek 闭包加载（零网络）', async () => {
  const AgentLoop = (await import('@deepseek-ai/dsh-agent-loop')).default
  const { DEFAULT_MAX_PARALLEL_TOOL_CALLS } = await import('@deepseek-ai/dsh-agent-loop')
  const { Session } = await import('@deepseek-ai/dsh-session')
  const { DeepSeekAdapter } = await import('@deepseek-ai/dsh-llm-deepseek')
  assert.equal(typeof AgentLoop, 'function', 'AgentLoop 未导出')
  assert.equal(typeof Session.fromRestore, 'function', 'Session.fromRestore 缺失')
  assert.equal(typeof DEFAULT_MAX_PARALLEL_TOOL_CALLS, 'number', '常量缺失')
  const adapter = new DeepSeekAdapter({
    providerName: 'DeepSeek',
    options: () => ({ apiKey: 'sk-runtime-smoke-not-real', baseURL: 'https://api.deepseek.com' }),
  })
  const info = adapter.providerInfo('deepseek')
  assert.equal(info.id, 'deepseek')
  return `闭包 OK（maxParallel=${DEFAULT_MAX_PARALLEL_TOOL_CALLS}，provider=${info.id}）`
})

await step('④ pwb-context 纪事叙事化（禁 dump JSON 契约面）', async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { applyPwbContext } = await import('../../oracle-server/pwb-plugins.mjs')
  const app = new Context()
  applyPwbContext(app)
  app.pwbContext.pushChronicle('狼群在森林北缘猎食')
  app.pwbContext.pushChronicle('人类文明第二村落成立')
  const out = app.pwbContext.narrate('狼')
  assert.ok(out.includes('狼群'), '叙事检索未命中')
  assert.ok(!out.startsWith('{'), '叙事化不得以 JSON 开头')
  return `narrate →「${out.slice(0, 40)}」`
})

console.log('M-O4 相一 运行时装配冒烟：ALL PASS')
for (const line of steps) console.log(line)
process.exit(0)
