// M-O4 相三挂账①「前端中继实测」断言面——核对上游请求投影 / JSONL 落盘 / 直通面逐字节形状
// 用法：node scripts/oracle-dsh/relay-e2e-assert.mjs <S1 首会话id> <S4 轮换后id>
// 前置：relay-e2e-live.sh 已跑完（up-*.json 与 $STORE/sessions/*.jsonl 已落盘）
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const OUT = process.env.RELAY_E2E_OUT || '/tmp/pwb-relay-e2e'
const STORE = process.env.RELAY_E2E_STORE || '/tmp/pwb-relay-store'
const [, , S1, S4] = process.argv

const steps = []
async function step(name, fn) {
  try {
    const d = await fn()
    steps.push(`  ✓ ${name}${d ? ' — ' + d : ''}`)
  } catch (err) {
    steps.push(`  ✗ ${name} — ${String(err.message || err).slice(0, 220)}`)
    process.exitCode = 1
  }
}
const up = (n) => JSON.parse(readFileSync(path.join(OUT, `up-${String(n).padStart(2, '0')}.json`), 'utf8')).body
const j = (o) => JSON.stringify(o)

console.log('=== relay-e2e 断言面（服务面 + 投影 + 逐字节）===')

await step('① 上游请求序列齐备（R1 两段 + R2/R3 各单段 + R4 两段 + R5 直通 = 7）', () => {
  const files = readdirSync(OUT).filter((f) => /^up-\d+\.json$/.test(f))
  assert.equal(files.length, 7, `应有 7 个上游请求记录，实得 ${files.length}`)
  return files.length + ' 个'
})

await step('② R1 两段式：system 运行时提示 + 仅末条 user + wb_echo 真执行回灌', () => {
  const b1 = up(1)
  assert.ok(Array.isArray(b1.tools) && b1.tools.length > 0, '第 1 段应带 tools')
  assert.equal(b1.messages[0].role, 'system', 'messages[0] 应为 system（dsh 运行时提示）')
  const users1 = b1.messages.filter((m) => m.role === 'user')
  assert.equal(users1.length, 1, '服务端权威历史下首轮应仅 1 条 user')
  assert.ok(users1[0].content.includes('看看这个世界'), 'user 应为末条输入')
  const b2 = up(2)
  const toolMsg = b2.messages.find((m) => m.role === 'tool')
  assert.ok(toolMsg, '第 2 段应有 tool 结果消息')
  assert.ok(j(toolMsg).includes('relay-e2e-ok'), 'tool 结果应含 wb_echo 真执行回显')
  return `投影 ${b1.messages.length}→${b2.messages.length} 条`
})

await step('③ R2 重启#1 回放：单段直终文（投影含第 1 轮 user + 历史 tool 消息＝JSONL 服务端权威记忆铁证）', () => {
  const b3 = up(3)
  const s = j(b3.messages)
  assert.ok(s.includes('看看这个世界'), '重启后投影应含第 1 轮 user')
  assert.ok(s.includes('还记得刚才吗'), '投影应含本轮 user')
  assert.ok(b3.messages.some((m) => m.role === 'tool'), '投影应含历史 tool 消息（假上游因此直接终文）')
  const users = b3.messages.filter((m) => m.role === 'user')
  assert.ok(users.length >= 2, `投影 user 应 ≥2 条（回放+新），实得 ${users.length}`)
  return `投影 ${b3.messages.length} 条 / user ${users.length} 条`
})

await step('④ R3 刷新+重启#2 回放：三轮 user 锚点 + R1 完整工具链均在投影', () => {
  const b4 = up(4)
  const s = j(b4.messages)
  assert.ok(s.includes('看看这个世界'), '投影应含第 1 轮')
  assert.ok(s.includes('还记得刚才吗'), '投影应含第 2 轮')
  assert.ok(s.includes('世界纪事最近有什么'), '投影应含第 3 轮')
  assert.ok(b4.messages.some((m) => m.role === 'tool'), '投影应含 R1 wb_echo 工具结果（完整事件链回放）')
  assert.ok(b4.messages.some((m) => m.tool_calls), '投影应含 R1 assistant tool_calls（事件溯源完整性）')
  return `投影 ${b4.messages.length} 条（三轮锚点+工具链全回放）`
})

await step('⑤ R4 清空轮换：新会话两段式重开（up-05/06），投影不含旧轮内容（会话隔离）', () => {
  const b5 = up(5)
  const s = j(b5.messages)
  assert.ok(!s.includes('还记得刚才吗'), '新会话不应含旧轮 user')
  assert.ok(!s.includes('世界纪事最近有什么'), '新会话不应含第 3 轮 user')
  assert.ok(!s.includes('看看这个世界'), '新会话不应含第 1 轮 user')
  const b6 = up(6)
  assert.ok(b6.messages.some((m) => m.role === 'tool'), '新会话第 2 段应有本轮 wb_echo 回灌（历史隔离后重开两段式）')
  return '隔离面成立 + 两段式重开'
})

await step('⑥ R5 直通面逐字节形状：无 dsh 键 + 无 tools + 前端全量历史', () => {
  const raw = JSON.parse(readFileSync(path.join(OUT, 'up-07.json'), 'utf8'))
  const b = raw.body
  assert.equal(b.dsh, undefined, '直通面 body 不得含 dsh 键')
  assert.equal(b.tools, undefined, '直通面不得带 tools')
  const s = j(b.messages)
  assert.ok(s.includes('直通测试'), '直通面应含本轮 user')
  assert.ok(s.includes('新会话第一条'), '直通面应含清空后的历史（前端权威历史）')
  return `messages ${b.messages.length} 条`
})

await step('⑦ JSONL 持久卷：恰 2 个会话文件（S1 三轮 + S4 单轮），事件含锚点', () => {
  const dir = path.join(STORE, 'sessions')
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')) : []
  assert.equal(files.length, 2, `sessions 下应恰 2 个 JSONL，实得 ${files.length}`)
  assert.ok(files.includes(`${S1}.jsonl`), `缺 ${S1}.jsonl`)
  assert.ok(files.includes(`${S4}.jsonl`), `缺 ${S4}.jsonl`)
  const s1 = readFileSync(path.join(dir, `${S1}.jsonl`), 'utf8')
  const s4 = readFileSync(path.join(dir, `${S4}.jsonl`), 'utf8')
  assert.ok(s1.includes('看看这个世界') && s1.includes('世界纪事最近有什么'), 'S1 日志应含三轮锚点')
  assert.ok(s4.includes('新会话第一条'), 'S4 日志应含新会话锚点')
  const lines1 = s1.trim().split('\n').length
  const lines4 = s4.trim().split('\n').length
  assert.ok(lines4 < lines1, 'S4 事件数应小于 S1（新会话）')
  return `S1=${lines1} 行 / S4=${lines4} 行`
})

await step('⑧ 存储根持久卷形状：PWB_STORE_ROOT/sessions 布局', () => {
  assert.ok(existsSync(path.join(STORE, 'sessions')), '缺 sessions 目录')
  const total = statSync(STORE).isDirectory()
  assert.ok(total, '存储根应为目录')
  return STORE
})

for (const s of steps) console.log(s)
const fails = steps.filter((s) => s.startsWith('  ✗')).length
console.log(fails === 0 ? '=== relay-e2e 断言面：ALL PASS ===' : `=== relay-e2e 断言面：${fails} 项失败 ===`)
process.exit(fails === 0 ? 0 : 1)
