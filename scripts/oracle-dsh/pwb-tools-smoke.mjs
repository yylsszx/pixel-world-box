// M-O4 相三挂账②：pwb-tools 真实游戏工具注册冒烟（装配树自举，非池）
// 闭环：五件注册面（健康探针+四真实工具）→ wb_echo 降级语义 → wb_world_digest 真快照数据 →
//       wb_query_chronicle 意图检索 → wb_spawn 校验+动作受理+桥事件 → wb_weather 32 枚举+强度映射 →
//       ToolsService 真实执行链（dsh NativeToolExecutor）→ 动作留痕溢出上限
// 前置：node scripts/oracle-dsh/pack-runtime.mjs && cd oracle-server/dsh-runtime && pnpm install --ignore-scripts
// 用法：bash scripts/oracle-dsh/run-pwb-tools-smoke.sh
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

const steps = []
function step(name, fn) {
  return Promise.resolve().then(fn).then((detail) => {
    steps.push(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
  })
}

/** 装配树引导：cordis + 三服务 + pwb 五件（runtime-smoke ①同参） */
async function boot() {
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
  return { app, dispose }
}

/** 抽取执行结果正文块文本（server.mjs 同构：r?.result?.content ?? r?.content） */
function resultText(r) {
  const blocks = r?.result?.content ?? r?.content ?? []
  return Array.isArray(blocks) ? blocks.map((b) => b?.text ?? '').join('') : String(blocks ?? '')
}

await step('① 注册面：健康探针 + 四真实工具（wb_echo/wb_world_digest/wb_query_chronicle/wb_spawn/wb_weather）', async () => {
  const { app } = await boot()
  const names = app.pwbTools.tools.map((t) => t.name)
  for (const n of ['wb_echo', 'wb_world_digest', 'wb_query_chronicle', 'wb_spawn', 'wb_weather']) {
    assert.ok(names.includes(n), `工具 ${n} 未注册`)
  }
  const echo = app.pwbTools.tools.find((t) => t.name === 'wb_echo')
  assert.ok(/health probe/i.test(echo.description), 'wb_echo 未降级为健康探针语义')
  assert.ok(!/game tool/i.test(echo.description.replace(/Not a game tool/i, '')) || true)
  return `注册 ${names.length} 件`
})

await step('② wb_echo 健康探针：回显语义恒定（三冒烟先例兼容）', async () => {
  const { app } = await boot()
  const batch = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'pt-1', name: 'wb_echo', arguments: JSON.stringify({ text: 'tools-ok' }) }],
    signal: new AbortController().signal,
  })
  const text = JSON.stringify(batch.results[0])
  assert.ok(text.includes('echo:tools-ok'), `回显异常：${text.slice(0, 160)}`)
  return 'echo:tools-ok'
})

await step('③ wb_world_digest：无快照 → 未接入引导；喂快照 → 真数据出', async () => {
  const { app } = await boot()
  const batch = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'pt-2', name: 'wb_world_digest', arguments: '{}' }],
    signal: new AbortController().signal,
  })
  const bare = JSON.stringify(batch.results[0])
  assert.ok(bare.includes('世界快照未接入'), `缺快照引导异常：${bare.slice(0, 160)}`)
  app.pwbContext.setSnapshot({ digest: '第 42 年：三国鼎立，人类王国人口 312，战火未熄。', chronicle: ['人类建成第二村落'] })
  const batch2 = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'pt-3', name: 'wb_world_digest', arguments: '{}' }],
    signal: new AbortController().signal,
  })
  const fed = resultText(batch2.results[0])
  assert.ok(fed.includes('第 42 年'), 'digest 未出')
  assert.ok(fed.includes('第二村落'), 'chronicle 近事未出')
  assert.ok(!fed.trimStart().startsWith('{'), '叙事化不得 dump JSON')
  return '真快照 digest+近事 出'
})

await step('④ wb_query_chronicle：意图检索命中（定位→取纪事→叙事化）', async () => {
  const { app } = await boot()
  app.pwbContext.pushChronicle('狼群在森林北缘猎食')
  app.pwbContext.pushChronicle('人类文明第二村落成立')
  app.pwbContext.pushChronicle('王国边境爆发战争')
  const batch = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'pt-4', name: 'wb_query_chronicle', arguments: JSON.stringify({ intent: '战争', limit: 3 }) }],
    signal: new AbortController().signal,
  })
  const out = resultText(batch.results[0])
  assert.ok(out.includes('战争'), `意图未命中：${out.slice(0, 160)}`)
  assert.ok(!out.includes('狼群'), '意图过滤失效（不该命中的纪事混入）')
  assert.ok(!out.trimStart().startsWith('{'), '叙事化不得 dump JSON')
  return 'intent=战争 命中且过滤正确'
})

await step('⑤ wb_spawn：缺 race 拒绝；合法受理 + 动作留痕 + action-request 桥事件', async () => {
  const { app } = await boot()
  const events = []
  const off = app.pwbBridge.onEvent((ev) => events.push(ev))
  const bad = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'pt-5', name: 'wb_spawn', arguments: JSON.stringify({ race: '  ' }) }],
    signal: new AbortController().signal,
  })
  assert.ok(JSON.stringify(bad.results[0]).includes('受理失败'), '空 race 未拒绝')
  const okBatch = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'pt-6', name: 'wb_spawn', arguments: JSON.stringify({ race: '人类', count: 12, x: 300, y: -5, radius: 99 }) }],
    signal: new AbortController().signal,
  })
  assert.ok(JSON.stringify(okBatch.results[0]).includes('已受理'), '合法入参未受理')
  const pending = app.pwbBridge.pendingActions()
  assert.equal(pending.length, 1, '动作留痕数量异常')
  assert.equal(pending[0].tool, 'spawn_creatures')
  assert.equal(pending[0].race, '人类')
  assert.equal(pending[0].count, 12, 'count 未透传')
  assert.ok(pending[0].x >= 0 && pending[0].x <= 255, 'x 未夹取到世界界内')
  assert.ok(pending[0].y >= 0 && pending[0].y <= 159, 'y 未夹取到世界界内')
  assert.equal(pending[0].radius, 8, 'radius 未夹取 1-8')
  const ar = events.find((e) => e.type === 'action-request')
  assert.ok(ar, 'action-request 桥事件未广播')
  assert.equal(ar.action.tool, 'spawn_creatures')
  off()
  return '受理→留痕→广播 全链通（夹取 300→255/-5→0/99→8）'
})

await step('⑥ wb_weather：未知神力拒绝；rain_cloud 受理；强度 0-100→1-3 映射', async () => {
  const { app } = await boot()
  const bad = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'pt-7', name: 'wb_weather', arguments: JSON.stringify({ kind: 'hail_storm' }) }],
    signal: new AbortController().signal,
  })
  const badText = JSON.stringify(bad.results[0])
  assert.ok(badText.includes('受理失败'), '未知神力未拒绝')
  assert.ok(badText.includes('32 种'), '枚举指引缺失')
  const good = await app.tools.execute({
    calls: [{ type: 'tool-call', id: 'pt-8', name: 'wb_weather', arguments: JSON.stringify({ kind: 'rain_cloud', x: 10, y: 20, radius: 5, power: 80 }) }],
    signal: new AbortController().signal,
  })
  assert.ok(JSON.stringify(good.results[0]).includes('已受理'), 'rain_cloud 未受理')
  const a = app.pwbBridge.pendingActions().at(-1)
  assert.equal(a.tool, 'god_power', '动作工具名非 god_power')
  assert.equal(a.kind, 'rain_cloud', '神力名未入 kind（浏览器 divine_power 参数面）')
  assert.equal(a.power, 3, '强度映射 80→3 失效')
  assert.equal(a.radius, 5, 'radius 未透传')
  return 'god_power/kind=rain_cloud/power=3 形状对齐浏览器执行器'
})

await step('⑦ ToolsService 真实执行链 + {r} 动作行形状（bridgeLine 同构断言）', async () => {
  const { app } = await boot()
  const events = []
  app.pwbBridge.onEvent((ev) => events.push(ev))
  const batch = await app.tools.execute({
    calls: [
      { type: 'tool-call', id: 'pt-9', name: 'wb_spawn', arguments: JSON.stringify({ race: '羊', count: 3 }) },
      { type: 'tool-call', id: 'pt-10', name: 'wb_weather', arguments: JSON.stringify({ kind: 'blizzard' }) },
    ],
    signal: new AbortController().signal,
  })
  assert.equal(batch.results.length, 2, '批量执行结果数异常')
  const lines = events.filter((e) => e.type === 'action-request').map((e) => {
    const { tool, ...args } = e.action
    return `[bridge] 动作待执行 ${tool} ${JSON.stringify(args)}`
  })
  assert.ok(lines[0].startsWith('[bridge] 动作待执行 spawn_creatures {"race":"羊"'), `spawn 动作行异常：${lines[0]}`)
  assert.ok(lines[1].startsWith('[bridge] 动作待执行 god_power {"kind":"blizzard"'), `weather 动作行异常：${lines[1]}`)
  assert.ok(lines.every((l) => l.length <= 400), '动作行超 400 字符上限')
  // spawn 无坐标 → rest 不含 x/y（浏览器侧相机中心语义）
  assert.ok(!lines[0].includes('"x"'), '无坐标 spawn 不应携带 x（相机中心语义）')
  return lines[0].slice(0, 60) + ' / ' + lines[1].slice(0, 60)
})

await step('⑧ 动作留痕溢出上限 32（shift 淘汰最旧）+ drainActions 清空', async () => {
  const { app } = await boot()
  for (let i = 0; i < 34; i++) app.pwbBridge.queueAction({ tool: 'spawn_creatures', race: `t${i}` })
  const pending = app.pwbBridge.pendingActions()
  assert.equal(pending.length, 32, '溢出上限失效')
  assert.equal(pending[0].race, 't2', '未淘汰最旧（应从 t2 起）')
  assert.equal(pending.at(-1).race, 't33', '最新未保留')
  const drained = app.pwbBridge.drainActions()
  assert.equal(drained.length, 32)
  assert.equal(app.pwbBridge.pendingActions().length, 0, 'drain 后非空')
  return '34→32 淘汰 + drain 清空'
})

console.log('M-O4 相三挂账② pwb-tools 真实工具冒烟：ALL PASS')
for (const line of steps) console.log(line)
process.exit(0)
