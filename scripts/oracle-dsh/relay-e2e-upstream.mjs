// M-O4 相三挂账①「前端中继实测」假上游——模拟通道 A 目标形态（ollama openai 兼容 :11434）
// 行为：记录每个 /chat/completions 请求体到 OUT_DIR/up-<seq>.json（断言用）；
//       dsh 面（带 tools）→ 两段式（wb_echo 工具轮 → 终文，终文携带上游所见 messages 长度＝服务端权威记忆投影的直接证据）；
//       直通面（无 tools）→ 终文回显（历史长度 + 末条 user 内容，供逐字节回归断言）。
// 用法：node scripts/oracle-dsh/relay-e2e-upstream.mjs  （端口 11434，OUT_DIR=/tmp/pwb-relay-e2e 可 env 覆盖）
import http from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const PORT = Number(process.env.E2E_UPSTREAM_PORT || 11434)
const OUT_DIR = process.env.RELAY_E2E_OUT || '/tmp/pwb-relay-e2e'
// 第 1 段（tool_calls 段）响应前延迟 ms——给浏览器 {r} 思考流留观察窗（live.sh R1 抓「工具轮」行）
const DELAY1 = Number(process.env.RELAY_E2E_DELAY1_MS || 2000)
mkdirSync(OUT_DIR, { recursive: true })

let seq = 0
function sseChunk(res, obj) { res.write(`data: ${JSON.stringify(obj)}\n\n`) }
function sseDone(res) { res.write('data: [DONE]\n\n'); res.end() }

const server = http.createServer(async (req, res) => {
  try {
    // ollama 形态装饰端点（健康探测可打）
    if (req.method === 'GET' && (req.url === '/api/tags' || req.url === '/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ models: [{ name: 'fake-mini:1b' }] }))
      return
    }
    if (req.method !== 'POST' || !(req.url === '/chat/completions' || req.url === '/v1/chat/completions')) {
      res.writeHead(404).end()
      return
    }
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    seq += 1
    const file = path.join(OUT_DIR, `up-${String(seq).padStart(2, '0')}.json`)
    writeFileSync(file, JSON.stringify({ url: req.url, body }, null, 1))

    const msgs = Array.isArray(body.messages) ? body.messages : []
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0
    const hasToolResult = msgs.some((m) => m.role === 'tool')
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user')

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })

    if (hasTools && !hasToolResult) {
      // dsh 第 1 段：推理 + wb_echo 工具调用（参数分片，与 server-runtime-smoke 同构）；延迟给 {r} 思考流留窗
      if (DELAY1 > 0) await new Promise((r) => setTimeout(r, DELAY1))
      sseChunk(res, { choices: [{ delta: { reasoning_content: '通道A假上游：两段式第1段' } }] })
      sseChunk(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_relay_e2e', function: { name: 'wb_echo', arguments: '{"text":' } }] } }] })
      sseChunk(res, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"relay-e2e-ok"}' } }] } }] })
      sseChunk(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
      sseDone(res)
      return
    }
    if (hasTools && hasToolResult) {
      // dsh 第 2 段：工具结果已回灌 → 终文（携带投影消息数＝会话记忆证据）；延迟拉宽「工具轮」{r} 行观察窗
      if (DELAY1 > 0) await new Promise((r) => setTimeout(r, DELAY1))
      sseChunk(res, { choices: [{ delta: { reasoning_content: '通道A假上游：第2段终文' } }] })
      sseChunk(res, { choices: [{ delta: { content: '中继实测回复' } }] })
      sseChunk(res, { choices: [{ delta: { content: `｜上游见${msgs.length}条投影` } }] })
      sseChunk(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
      sseDone(res)
      return
    }
    // 直通面（纯中继，无 tools）：回显历史长度与末条 user
    sseChunk(res, { choices: [{ delta: { content: `直通面OK｜历史${msgs.length}条` } }] })
    sseChunk(res, { choices: [{ delta: { content: `｜末条:${lastUser ? lastUser.content : '无'}` } }] })
    sseChunk(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
    sseDone(res)
  } catch (err) {
    try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(err) })) } catch { /* socket 已断 */ }
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`[relay-e2e-upstream] :${PORT} → ${OUT_DIR}`))
