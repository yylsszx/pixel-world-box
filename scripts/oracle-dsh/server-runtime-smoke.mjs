// M-O4 相二：oracle-server dsh 会话面冒烟——DSH_RUNTIME=1 真实引导 + 离线 E2E
// 闭环：假 OpenAI 上游（工具调用两段式）→ server.mjs（运行时挂载）→ dsh 会话面回合：
//       快照摄入→运行时系统提示→工具循环（dsh ToolsService 真实执行）→pwb-bridge→SSE {t}/{r}/[DONE]
//       + 直通面回归（无 dsh 字段）+ 范围守卫（anthropic/非法 dsh 字段 400）
// 前置：oracle-server/dsh-runtime 已 pack + pnpm install（.pwb-hooks 已章）
// 用法：bash scripts/oracle-dsh/run-server-runtime-smoke.sh
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..', '..')
const serverPath = path.join(projectRoot, 'oracle-server', 'server.mjs')
const runtimeRoot = path.join(projectRoot, 'oracle-server', 'dsh-runtime')

const steps = []
function step(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => {
      steps.push(`  ✓ ${name}${detail ? ' — ' + detail : ''}`)
    })
}

// ---- ⓪ 前置 ----
await step('⓪ 前置：装配树 + 依赖 + .pwb-hooks 章', async () => {
  assert.ok(existsSync(serverPath), 'server.mjs 缺失')
  assert.ok(existsSync(path.join(runtimeRoot, 'package.json')), '装配树未 pack')
  assert.ok(existsSync(path.join(runtimeRoot, 'node_modules')), '装配树未 pnpm install')
  assert.ok(existsSync(path.join(runtimeRoot, '.pwb-hooks', 'dsh-hook.mjs')), '.pwb-hooks 章缺失（pack-runtime 复跑）')
  return '前置齐备'
})

// ---- ① 假 OpenAI 上游（工具调用两段式 + 直通面分支） ----
const upstream = {
  server: null,
  port: 0,
  requests: [], // {tools:boolean, messages:[...]}
}
function sseChunk(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`)
}
function sseDone(res) {
  res.write('data: [DONE]\n\n')
  res.end()
}
async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
await step('① 假 OpenAI 上游：/chat/completions 两段式（tool_calls → 终文）', async () => {
  upstream.server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || !req.url.startsWith('/chat/completions')) {
        res.writeHead(404).end()
        return
      }
      const body = await readBody(req)
      const hasTools = Array.isArray(body.tools) && body.tools.length > 0
      const turn = upstream.requests.length
      upstream.requests.push(body)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      if (hasTools && turn === 0) {
        // dsh 第 1 轮：推理 + 工具调用（参数分片验证累积）
        assert.equal(body.messages[0].role, 'system', 'dsh 面首轮 messages[0] 应为 system（运行时所有）')
        assert.ok(body.messages[0].content.includes('世界纪事'), '系统提示未含世界纪事叙事（快照摄入未生效）')
        sseChunk(res, { choices: [{ delta: { reasoning_content: '推演中…' } }] })
        sseChunk(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_t1', function: { name: 'wb_echo', arguments: '{"text":' } }] } }] })
        sseChunk(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"relay-ok"}' } }] } }] })
        sseChunk(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
        sseDone(res)
      } else if (hasTools && turn === 1) {
        // dsh 第 2 轮：工具结果必须已回灌（ToolsService 真实执行证据）
        const toolMsg = body.messages.find((m) => m.role === 'tool')
        assert.ok(toolMsg, '第 2 轮缺 tool 结果消息')
        assert.equal(toolMsg.tool_call_id, 'call_t1', 'tool_call_id 不匹配')
        assert.ok(toolMsg.content.includes('echo:relay-ok'), `工具结果未含执行输出：${toolMsg.content.slice(0, 120)}`)
        const asst = body.messages.find((m) => m.role === 'assistant' && Array.isArray(m.tool_calls))
        assert.ok(asst && asst.tool_calls[0]?.function?.name === 'wb_echo', 'assistant tool_calls 未回灌')
        sseChunk(res, { choices: [{ delta: { content: '神谕:' } }] })
        sseChunk(res, { choices: [{ delta: { content: 'world-ok' } }] })
        sseChunk(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
        sseDone(res)
      } else if (!hasTools) {
        // 直通面（无 dsh 字段）回归
        sseChunk(res, { choices: [{ delta: { content: 'plain-relay-ok' } }] })
        sseChunk(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
        sseDone(res)
      } else {
        res.writeHead(500).end()
      }
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e && e.message ? e.message : String(e) }))
    }
  })
  await new Promise((resolve) => upstream.server.listen(0, '127.0.0.1', resolve))
  upstream.port = upstream.server.address().port
  return `:127.0.0.1:${upstream.port}`
})

// ---- ② 起 server（DSH_RUNTIME=1）并等运行时就绪 ----
const PORT = 18700 + Math.floor(Math.random() * 200)
const storeRoot = mkdtempSync(path.join(os.tmpdir(), 'pwb-store-'))
const child = spawn(process.execPath, [serverPath], {
  env: { ...process.env, DSH_RUNTIME: '1', PORT: String(PORT), PWB_STORE_ROOT: storeRoot },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const out = []
child.stdout.on('data', (d) => out.push(d))
child.stderr.on('data', (d) => out.push(d))
process.on('exit', () => {
  try { child.kill('SIGKILL') } catch { /* 已退出 */ }
  try { upstream.server?.close() } catch { /* 已关 */ }
})
async function healthz() {
  const r = await fetch(`http://127.0.0.1:${PORT}/healthz`)
  return { code: r.status, body: await r.json() }
}
await step('② server 引导（DSH_RUNTIME=1）等待运行时就绪', async () => {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < 60_000) {
    if (child.exitCode !== null) break
    try {
      last = await healthz()
      if (last.code === 200 && last.body?.dsh?.ready) break
    } catch { /* 未起 */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  assert.ok(child.exitCode === null, `server 进程退出（exit=${child.exitCode}）\n${out.join('').slice(-1200)}`)
  assert.ok(last && last.code === 200 && last.body?.dsh?.ready, `运行时未就绪：${JSON.stringify(last?.body?.dsh ?? last)}\n${out.join('').slice(-1200)}`)
  return `boot_ms=${last.body.dsh.boot_ms}`
})

// ---- ③ healthz 报运行时状态 ----
await step('③ healthz 报 dsh 运行时状态', async () => {
  const { body } = await healthz()
  assert.equal(body.dsh.enabled, true, 'dsh.enabled 应为 true')
  assert.equal(body.dsh.ready, true, 'dsh.ready 应为 true')
  assert.ok(body.dsh.packages >= 60, `packages 异常：${body.dsh.packages}`)
  assert.equal(body.dsh.error, null, `dsh.error 应为 null：${body.dsh.error}`)
  return `packages=${body.dsh.packages}`
})

// ---- SSE 收集器 ----
async function collectSSE(port, urlPath, payload) {
  const r = await fetch(`http://127.0.0.1:${port}${urlPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const events = []
  let doneSeen = false
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const p = t.slice(5).trim()
      if (p === '[DONE]') {
        doneSeen = true
        continue
      }
      try { events.push(JSON.parse(p)) } catch { /* 心跳 */ }
    }
  }
  return { status: r.status, events, doneSeen }
}

// ---- ④ dsh 会话面 E2E：快照摄入 → 桥 → 工具循环 → {t}/{r}/[DONE] ----
await step('④ dsh 会话面 E2E：快照→系统提示→wb_echo 工具轮→桥事件→终文', async () => {
  const { status, events, doneSeen } = await collectSSE(PORT, '/api/oracle/agent', {
    provider: {
      kind: 'openai',
      label: 'mock-local',
      baseUrl: `http://127.0.0.1:${upstream.port}`,
      apiKey: 'sk-server-smoke',
      model: 'mock-small',
    },
    messages: [
      { role: 'assistant', content: '前端 buildSystemPrompt 载体（dsh 面应降为调度方补充）' },
      { role: 'user', content: '看看世界' },
    ],
    dsh: { snapshot: { chronicle: ['狼群在森林北缘猎食', '人类村落点燃篝火'] } },
  })
  assert.equal(status, 200, `HTTP ${status}`)
  assert.ok(doneSeen, '未见 [DONE] 终止符')
  const rs = events.filter((e) => typeof e.r === 'string').map((e) => e.r).join('')
  const ts = events.filter((e) => typeof e.t === 'string').map((e) => e.t).join('')
  assert.ok(rs.includes('推演中'), `推理通道缺失：${rs.slice(0, 120)}`)
  assert.ok(rs.includes('[bridge] 回合开始'), 'pwb-bridge 回合开始事件未对接 SSE')
  assert.ok(rs.includes('[bridge] 工具轮 1: wb_echo'), `pwb-bridge 工具轮事件未对接 SSE：${rs.slice(0, 200)}`)
  assert.ok(ts.includes('神谕:'), `终文分片缺失：${ts.slice(0, 120)}`)
  assert.ok(ts.includes('world-ok'), '终文回显缺失')
  assert.ok(!events.some((e) => typeof e.err === 'string'), `err 事件混入：${JSON.stringify(events.find((e) => e.err))}`)
  assert.equal(upstream.requests.length, 2, '上游收到的请求数不符')
  return `t=${ts.length}字 r=${rs.length}字 桥=3类 工具轮=1`
})

// ---- ⑤ 直通面回归：无 dsh 字段同端点不变 ----
await step('⑤ 直通面回归：无 dsh 字段 → 纯中继（无工具/无桥噪声）', async () => {
  const { status, events, doneSeen } = await collectSSE(PORT, '/api/oracle/agent', {
    provider: {
      kind: 'openai',
      label: 'mock-relay',
      baseUrl: `http://127.0.0.1:${upstream.port}`,
      apiKey: 'sk-server-smoke',
      model: 'mock-small',
    },
    messages: [
      { role: 'assistant', content: '系统提示载体' },
      { role: 'user', content: '普通问话' },
    ],
  })
  assert.equal(status, 200, `HTTP ${status}`)
  assert.ok(doneSeen, '未见 [DONE]')
  const ts = events.map((e) => e.t ?? '').join('')
  assert.ok(ts.includes('plain-relay-ok'), `直通回归异常：${ts}`)
  assert.ok(!events.some((e) => typeof e.r === 'string' && e.r.includes('[bridge]')), '直通面不应出现桥事件')
  assert.ok(upstream.requests[2] && !('tools' in upstream.requests[2]), '直通面不应携带 tools 字段')
  return '直通面零变化'
})

// ---- ⑥ 范围守卫：dsh+anthropic → 400（SSE 前 JSON） ----
await step('⑥ 范围守卫：dsh×anthropic → 400 JSON', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/oracle/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: { kind: 'anthropic', baseUrl: 'https://example.invalid', apiKey: 'x', model: 'm' },
      messages: [{ role: 'assistant', content: 's' }, { role: 'user', content: 'u' }],
      dsh: true,
    }),
  })
  const body = await r.json()
  assert.equal(r.status, 400, `应 400，实 ${r.status}`)
  assert.ok(body.error.includes('会话面 v1'), `守卫信息异常：${body.error}`)
  return 'v1 范围明确'
})

// ---- ⑦ 非法 dsh 字段 → 400 ----
await step('⑦ 非法 dsh 字段 → 400', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/oracle/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: { kind: 'openai', baseUrl: `http://127.0.0.1:${upstream.port}`, apiKey: 'x', model: 'm' },
      messages: [{ role: 'assistant', content: 's' }, { role: 'user', content: 'u' }],
      dsh: 'yes',
    }),
  })
  const body = await r.json()
  assert.equal(r.status, 400, `应 400，实 ${r.status}`)
  assert.ok(body.error.includes('dsh 字段'), `错误信息异常：${body.error}`)
  return '字段校验生效'
})

// ---- 收尾 ----
try { child.kill('SIGTERM') } catch { /* 已退出 */ }
console.log('M-O4 相二 oracle-server dsh 会话面冒烟：ALL PASS')
for (const line of steps) console.log(line)
process.exit(0)
