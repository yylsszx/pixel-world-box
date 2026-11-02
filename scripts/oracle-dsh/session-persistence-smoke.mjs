// M-O4 相三：oracle-server dsh 持久会话面冒烟——100 轮不失忆验收链（离线假上游 E2E）
// 闭环：假 OpenAI 上游（NEED_TOOL 两段式 / 常规终文，全量记录请求）→ server.mjs（DSH_RUNTIME=1 + JSONL 存储）
//       ⓪前置 ①假上游 ②引导+healthz 持久化状态 ③100 轮会话（锚点+定时工具轮）
//       ④不失忆探针（第 101 轮：模型可见面含锚点 + 预算内 + 日志全量 101 回合 + compaction 发生）
//       ⑤重启续跑（杀进程→同存储根新进程→第 102 轮仍含锚点——磁盘回放成立）
//       ⑥守卫（非法 sessionId 400 / 空 user 400）⑦无 sessionId 直通面回归
// 前置：oracle-server/dsh-runtime 已 pack + pnpm install（.pwb-hooks 已章）
// 用法：bash scripts/oracle-dsh/run-session-persistence-smoke.sh
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
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
await step('⓪ 前置：装配树 + 依赖 + .pwb-hooks 章 + 相三新件', async () => {
  assert.ok(existsSync(serverPath), 'server.mjs 缺失')
  assert.ok(existsSync(path.join(runtimeRoot, 'package.json')), '装配树未 pack')
  assert.ok(existsSync(path.join(runtimeRoot, 'node_modules')), '装配树未 pnpm install')
  assert.ok(existsSync(path.join(runtimeRoot, '.pwb-hooks', 'dsh-hook.mjs')), '.pwb-hooks 章缺失（pack-runtime 复跑）')
  assert.ok(existsSync(path.join(projectRoot, 'oracle-server', 'dsh-jsonl-persistence.mjs')), 'JSONL 后端缺失')
  assert.ok(existsSync(path.join(projectRoot, 'oracle-server', 'dsh-session-memory.mjs')), '会话记忆引擎缺失')
  return '前置齐备'
})

// ---- ① 假 OpenAI 上游（全量记录；NEED_TOOL 两段式 / 常规终文） ----
const upstream = { server: null, port: 0, requests: [] }
function sseChunk(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`) }
function sseDone(res) { res.write('data: [DONE]\n\n'); res.end() }
async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}
function roundOf(text) {
  const m = /第(\d+)轮/.exec(text ?? '')
  return m ? Number(m[1]) : 0
}
async function startUpstream() {
  upstream.requests = []
  upstream.server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || !req.url.startsWith('/chat/completions')) { res.writeHead(404).end(); return }
      const body = await readBody(req)
      upstream.requests.push(body)
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const last = body.messages[body.messages.length - 1]
      const anyText = body.messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ')
      const round = roundOf(anyText)
      if (last?.role === 'tool') {
        // 工具结果已回灌 → 终文回执
        assert.ok(last.tool_call_id, 'tool 结果缺 tool_call_id')
        sseChunk(res, { choices: [{ delta: { content: `回执:${round}:纪要已录` } }] })
        sseChunk(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
        sseDone(res)
      } else if (/NEED_TOOL/.test(anyText)) {
        // 两段式：工具调用（wb_echo 回执该轮锚点线索）
        sseChunk(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: `call_r${round}`, function: { name: 'wb_echo', arguments: '{"text":"锚点回执-' } }] } }] })
        sseChunk(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: `第${round}轮"}` } }] } }] })
        sseChunk(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
        sseDone(res)
      } else {
        sseChunk(res, { choices: [{ delta: { content: `第${round}轮回应：纪要已录，草原与森林交界处无异常动静。` } }] })
        sseChunk(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
        sseDone(res)
      }
    } catch (e) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: e && e.message ? e.message : String(e) }))
    }
  })
  await new Promise((resolve) => upstream.server.listen(0, '127.0.0.1', resolve))
  upstream.port = upstream.server.address().port
}
await startUpstream()
steps.push(`  ✓ ① 假 OpenAI 上游（NEED_TOOL 两段式 + 常规终文）—— :127.0.0.1:${upstream.port}`)

// ---- server 生命周期工具 ----
const storeRoot = mkdtempSync(path.join(os.tmpdir(), 'pwb-store-'))
const BUDGET = '6000'
function bootServer(port) {
  const child = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      DSH_RUNTIME: '1',
      PORT: String(port),
      PWB_STORE_ROOT: storeRoot,
      DSH_SESSION_SURFACE_CHAR_BUDGET: BUDGET,
      DSH_SESSION_PRUNE_KEEP: '3',
      DSH_SESSION_COMPACT_KEEP_TAIL: '8',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const out = []
  child.stdout.on('data', (d) => out.push(d))
  child.stderr.on('data', (d) => out.push(d))
  child._out = out
  return child
}
async function waitReady(child, port) {
  const t0 = Date.now()
  let last = null
  while (Date.now() - t0 < 90_000) {
    if (child.exitCode !== null) break
    try {
      const r = await fetch(`http://127.0.0.1:${port}/healthz`)
      last = { code: r.status, body: await r.json() }
      if (last.code === 200 && last.body?.dsh?.ready) return last.body
    } catch { /* 未起 */ }
    await new Promise((r) => setTimeout(r, 400))
  }
  throw new Error(`server 未就绪：exit=${child.exitCode} last=${JSON.stringify(last?.body ?? last)}\n${child._out.join('').slice(-1500)}`)
}
async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const t = setTimeout(() => { try { child.kill('SIGKILL') } catch { /* 已退出 */ } resolve() }, 8000)
    child.once('exit', () => { clearTimeout(t); resolve() })
  })
}
async function collectSSE(port, urlPath, payload) {
  const r = await fetch(`http://127.0.0.1:${port}${urlPath ?? '/api/oracle/agent'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (r.status !== 200) {
    const text = await r.text().catch(() => '')
    return { status: r.status, events: [], doneSeen: false, errorBody: text.slice(0, 300) }
  }
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
      if (p === '[DONE]') { doneSeen = true; continue }
      try { events.push(JSON.parse(p)) } catch { /* 心跳 */ }
    }
  }
  return { status: r.status, events, doneSeen }
}
function provider(port) {
  return { kind: 'openai', label: 'mock-local', baseUrl: `http://127.0.0.1:${port}`, apiKey: 'sk-smoke', model: 'mock-small' }
}
const SESSION_ID = 'smoke-s1'
const ANCHOR = '蓝月历77年蓝鲸座落于灰湖'
async function sessionRound(port, round, extra = '') {
  const payload = {
    provider: provider(upstream.port),
    messages: [{ role: 'assistant', content: '载体' }, { role: 'user', content: extra || `第${round}轮例行巡逻：纪要已入世界之书。` }],
    dsh: { sessionId: SESSION_ID },
  }
  const { status, events, doneSeen, errorBody } = await collectSSE(port, '/api/oracle/agent', payload)
  if (status !== 200) {
    console.error(`[debug] 目标端口=${port} 载荷=${JSON.stringify(payload).slice(0, 200)}`)
    console.error(`[debug] server 日志尾：\n${(childA._out ?? []).join('').slice(-1200)}`)
  }
  assert.equal(status, 200, `第${round}轮 HTTP ${status}${errorBody ? ' — ' + errorBody : ''}${status !== 200 ? ' | 载荷=' + JSON.stringify(payload).slice(0, 300) : ''}`)
  assert.ok(doneSeen, `第${round}轮未见 [DONE]`)
  const err = events.find((e) => typeof e.err === 'string')
  assert.ok(!err, `第${round}轮 err：${err?.err}`)
  return events
}

// ---- ② server A 引导 + healthz 持久化状态 ----
const PORT_A = 18800 + Math.floor(Math.random() * 100)
const childA = bootServer(PORT_A)
process.on('exit', () => { try { childA.kill('SIGKILL') } catch { /* 已退出 */ } })
await step('② server 引导（DSH_RUNTIME=1）+ healthz 报持久化状态', async () => {
  const body = await waitReady(childA, PORT_A)
  assert.equal(body.dsh.enabled, true, 'dsh.enabled 应为 true')
  assert.ok(body.dsh.packages >= 60, `packages 异常：${body.dsh.packages}`)
  assert.equal(body.dsh.persistence?.backend, 'jsonl', `persistence.backend 异常：${JSON.stringify(body.dsh.persistence)}`)
  assert.ok(typeof body.dsh.persistence?.sessions === 'number', 'persistence.sessions 缺失')
  assert.ok(String(body.dsh.store_root ?? '').length > 0, 'store_root 缺失')
  return `packages=${body.dsh.packages} 持久化=${body.dsh.persistence.sessions} 会话`
})

// ---- ③ 100 轮会话（第 1 轮锚点 + 每 10 轮工具） ----
await step('③ 100 轮持久会话：第 1 轮锚点 + 每 10 轮 wb_echo 工具轮', async () => {
  const t0 = Date.now()
  await sessionRound(PORT_A, 1, `第1轮：【锚点】${ANCHOR}。NEED_TOOL`)
  for (let round = 2; round <= 100; round += 1) {
    await sessionRound(PORT_A, round, round % 10 === 0 ? `第${round}轮例行巡逻：触发一次勘测。NEED_TOOL` : `第${round}轮例行巡逻：纪要已入世界之书。`)
  }
  return `100 轮 / ${Date.now() - t0}ms / 上游请求 ${upstream.requests.length} 次`
})

// ---- ④ 不失忆探针（第 101 轮） + 日志全量 + compaction 发生 ----
const artifactPath = path.join(storeRoot, 'sessions', `${SESSION_ID}.jsonl`)
function readArtifactLines() {
  return readFileSync(artifactPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
}
function wireChars(messages) {
  return messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0) + (Array.isArray(m.tool_calls) ? JSON.stringify(m.tool_calls).length : 0), 0)
}
await step('④ 第 101 轮不失忆探针：模型可见面含锚点 + 预算内 + 日志全量 + compaction 实证', async () => {
  await sessionRound(PORT_A, 101, '第101轮：最初提到的蓝月历是什么？')
  const probe = upstream.requests[upstream.requests.length - 1]
  assert.equal(probe.messages[0].role, 'system', '探针请求 messages[0] 应为 system')
  const visible = probe.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''))).join('\n')
  assert.ok(visible.includes(ANCHOR), `模型可见面丢失锚点（compaction 未保真）\n${visible.slice(-800)}`)
  const chars = wireChars(probe.messages)
  assert.ok(chars <= Number(BUDGET) + 2000, `表面预算失控：${chars} > ${BUDGET}+2000`)
  const lines = readArtifactLines()
  const events = lines.slice(1)
  const turnStarts = events.filter((e) => e.type === 'turn/start')
  assert.equal(turnStarts.length, 101, `turn/start 应 101 条，实 ${turnStarts.length}（事件溯源全量承诺）`)
  assert.ok(events.some((e) => e.type === 'compaction/summary'), '未见 compaction/summary（压缩未发生——预算应已被 100 轮击穿）')
  assert.ok(events.some((e) => e.type === 'compaction/prune'), '未见 compaction/prune（工具结果修剪未发生）')
  const replaced = events.filter((e) => e.type === 'user/message' && e.surfaceOp && typeof e.surfaceOp === 'object')
  assert.ok(replaced.length >= 1, '未见 replace 型纪要节点')
  const rawUsers = events.filter((e) => e.type === 'user/message')
  assert.ok(rawUsers.length >= 102, `user/message 事件应 ≥102（101 回合 + 纪要替换节点），实 ${rawUsers.length}`)
  return `可见 ${chars} 字符 ≤ 预算；日志 ${events.length} 事件 / 101 回合全量；纪要替换 ${replaced.length} 次`
})

// ---- ⑤ 重启续跑（磁盘回放 + turn 计数延续） ----
const PORT_B = 18900 + Math.floor(Math.random() * 100)
await step('⑤ 重启续跑：杀进程→同存储根新进程→第 102 轮仍含锚点', async () => {
  await stopServer(childA)
  assert.equal(childA.exitCode !== null, true, 'server A 未退出')
  await startUpstream()
  const childB = bootServer(PORT_B)
  process.on('exit', () => { try { childB.kill('SIGKILL') } catch { /* 已退出 */ } })
  try {
    const body = await waitReady(childB, PORT_B)
    assert.equal(body.dsh.persistence?.backend, 'jsonl', '重启后持久化后端应为 jsonl')
    await sessionRound(PORT_B, 102, '第102轮：把最初那段蓝月历再说一遍？')
    const probe = upstream.requests[upstream.requests.length - 1]
    const visible = probe.messages.map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''))).join('\n')
    assert.ok(visible.includes(ANCHOR), `重启后模型可见面丢失锚点（磁盘回放失败）\n${visible.slice(-800)}`)
    const events = readArtifactLines().slice(1)
    const turnStarts = events.filter((e) => e.type === 'turn/start')
    assert.equal(turnStarts.length, 102, `重启后续跑应 102 回合，实 ${turnStarts.length}`)
    const lastTurn = turnStarts[turnStarts.length - 1]
    assert.equal(lastTurn.data.turn, 102, 'turn 计数未延续（应从日志恢复为 102）')
    return '磁盘回放成立：空内存态恢复 102 回合 + 锚点保真'
  } finally {
    await stopServer(childB)
  }
})

// ---- ⑥ 守卫：非法 sessionId / 空 user → 400（SSE 前 JSON） ----
await step('⑥ 守卫：非法 sessionId 400 + 空 user 400', async () => {
  const PORT_C = 19000 + Math.floor(Math.random() * 100)
  const childC = bootServer(PORT_C)
  process.on('exit', () => { try { childC.kill('SIGKILL') } catch { /* 已退出 */ } })
  try {
    await waitReady(childC, PORT_C)
    const bad = await fetch(`http://127.0.0.1:${PORT_C}/api/oracle/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider(upstream.port),
        messages: [{ role: 'assistant', content: '载体' }, { role: 'user', content: '第1轮测试' }],
        dsh: { sessionId: 'bad id!' },
      }),
    })
    assert.equal(bad.status, 400, `非法 sessionId 应 400，实 ${bad.status}`)
    const badBody = await bad.json()
    assert.ok(badBody.error.includes('sessionId'), `守卫信息异常：${badBody.error}`)
    const empty = await fetch(`http://127.0.0.1:${PORT_C}/api/oracle/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider(upstream.port),
        messages: [{ role: 'assistant', content: '载体' }],
        dsh: { sessionId: SESSION_ID },
      }),
    })
    assert.equal(empty.status, 400, `空 user 应 400，实 ${empty.status}`)
    const emptyBody = await empty.json()
    assert.ok(emptyBody.error.includes('user'), `守卫信息异常：${emptyBody.error}`)
    return '形状守卫生效'
  } finally {
    await stopServer(childC)
  }
})

// ---- ⑦ 无 sessionId 会话面回归（相二行为零变化 + 状态面零污染） ----
await step('⑦ 无 sessionId 会话面回归：状态性行为零变化', async () => {
  const PORT_D = 19100 + Math.floor(Math.random() * 100)
  const childD = bootServer(PORT_D)
  process.on('exit', () => { try { childD.kill('SIGKILL') } catch { /* 已退出 */ } })
  try {
    await waitReady(childD, PORT_D)
    const { status, events, doneSeen } = await collectSSE(PORT_D, '/api/oracle/agent', {
      provider: provider(upstream.port),
      messages: [{ role: 'assistant', content: '载体' }, { role: 'user', content: '第1轮临时问询' }],
      dsh: { snapshot: { chronicle: ['狼群在森林北缘猎食'] } },
    })
    assert.equal(status, 200, `HTTP ${status}`)
    assert.ok(doneSeen, '未见 [DONE]')
    const err = events.find((e) => typeof e.err === 'string')
    assert.ok(!err, `err 混入：${err?.err}`)
    const ts = events.filter((e) => typeof e.t === 'string').map((e) => e.t).join('')
    assert.ok(ts.includes('第1轮回应'), `直通回归异常：${ts.slice(0, 120)}`)
    assert.ok(events.some((e) => typeof e.r === 'string' && e.r.includes('[bridge] 回合开始')), '桥事件未对接')
    // 状态面零污染：不产生任何新会话工件（全程应只有 smoke-s1 一个）
    const files = readdirSync(path.join(storeRoot, 'sessions'))
    assert.equal(files.length, 1, `应仅 1 个会话工件（无 sessionId 请求不入盘），实 ${files.length}`)
    return '无 sessionId 零入盘 + 相二行为保持'
  } finally {
    await stopServer(childD)
  }
})

// ---- 收尾 ----
await stopServer(childA)
console.log('M-O4 相三 oracle-server dsh 持久会话面冒烟：ALL PASS')
for (const line of steps) console.log(line)
process.exit(0)
