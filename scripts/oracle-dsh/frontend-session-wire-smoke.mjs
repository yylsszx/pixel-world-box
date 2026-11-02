// ============ M-O4 相三挂账①：前端 sessionId 接线 · 线协议冒烟（离线假中继 E2E） ============
// 直测 src/lib/oracle 前端 TS 源（tsx 装载），断言新会话面的 wire 契约：
//   ① runDshSessionTurn → body.dsh={sessionId} + messages 仅末条 user + SSE 泵 {t}/{r}
//   ② 默认面字节守卫：无 extras 时 body 无 dsh 键、messages 原样透传
//   ③ 非 relay 场景 extras 静默忽略（builtin → 离线文案，不崩不漏）
//   ④ session.ts 形状面：sessionId 恒匹配服务端守卫正则（[A-Za-z0-9._-]{1,64}）
//   ⑤ 挂账② snapshot 透传：body.dsh={sessionId,snapshot}（无快照时恒 {sessionId}）
// 运行：oracle-server/dsh-runtime/node_modules/.bin/tsx scripts/oracle-dsh/frontend-session-wire-smoke.mjs
import http from 'node:http';
import assert from 'node:assert/strict';

// tsx 装载前端 TS 源（direct-client 仅相对导入 ./types，无路径别名依赖）
const { runDshSessionTurn, routeCallModel } = await import('../../src/lib/oracle/direct-client.ts');
const { createSessionId, rotateSessionId, loadOrCreateSessionId, isValidSessionId, loadDshOn, storeDshOn } = await import(
  '../../src/lib/oracle/session.ts'
);

let step = 0;
const ok = (name) => console.log(`  ✓ [${++step}] ${name}`);

/** 假中继：捕获 body；SSE 回 {r} 桥线 + {t} 两帧 + [DONE]（与服务端 v1.2 线协议同形） */
const captured = [];
const server = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    captured.push(JSON.parse(raw));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"r":"[桥] turn-start"}\n\n');
    res.write('data: {"t":"回"}\n\n');
    res.write('data: {"t":"答"}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const relayProvider = { kind: 'openai', label: '假中继', baseUrl: 'http://upstream.invalid', model: 'test-model', relayUrl: `http://127.0.0.1:${port}` };

// ① dsh 会话面：body.dsh 形状 + 仅末条 user + 流面 {t}/{r} 泵取
const sid = createSessionId();
const deltas = [];
const r1 = await runDshSessionTurn(relayProvider, sid, '第二条消息', {
  onDelta: (d) => deltas.push(d),
});
const b1 = captured[0];
assert.equal(b1.dsh && b1.dsh.sessionId, sid, 'body.dsh.sessionId 透传');
assert.deepEqual(b1.dsh, { sessionId: sid }, 'body.dsh 恰为 {sessionId}');
assert.deepEqual(b1.messages, [{ role: 'user', content: '第二条消息' }], 'messages 仅末条 user（服务端权威历史，无历史外泄）');
assert.equal(b1.deep, false);
assert.equal(b1.provider.label, '假中继', 'provider 原样透传');
assert.equal(r1.content, '回答', 'SSE {t} 聚合');
assert.ok(r1.reasoning.includes('[桥] turn-start'), 'SSE {r} 桥线归入 reason');
assert.equal(r1.err, '');
assert.equal(deltas[0].reason, '[桥] turn-start', 'onDelta 首帧为桥线');
ok(`dsh 会话面：body.dsh={sessionId} + 仅末条 user + {t}/{r} 泵（content=${r1.content}）`);

// ② 默认面字节守卫：无 extras → body 无 dsh 键，messages 原样透传（v6 行为不变）
const hist = [
  { role: 'assistant', content: '系统提示' },
  { role: 'user', content: '一' },
  { role: 'assistant', content: '二' },
  { role: 'user', content: '三' },
];
await routeCallModel(relayProvider, hist, true, {});
const b2 = captured[1];
assert.equal('dsh' in b2, false, '无 extras → body 无 dsh 键（旧后端零感知）');
assert.deepEqual(b2.messages, hist, 'messages 原样透传');
assert.equal(b2.deep, true, 'deep 原样透传');
ok('默认面字节守卫：无 dsh 键 + messages/deep 原样（v6 零变化）');

// ③ 非 relay 场景：extras 静默忽略（builtin 走本站后端探测失败 → 离线文案，不崩不漏 dsh）
const builtinNoRelay = { kind: 'builtin', label: '内置' };
const r3 = await routeCallModel(builtinNoRelay, hist, false, {}, { dsh: { sessionId: sid } });
assert.ok(r3.err.includes('神谕离线'), 'builtin 无后端 → 精确离线文案');
assert.equal(captured.length, 2, '非 relay 场景零新增请求（extras 未泄漏到别处）');
ok('非 relay 场景：extras 静默忽略，零请求泄漏');

// ④ session.ts 形状面：恒匹配服务端守卫正则 + 轮换互异 + 开关持久化往返（node 无 localStorage → 内存态降级）
for (let i = 0; i < 200; i++) assert.ok(isValidSessionId(createSessionId()), `随机形状 #${i}`);
assert.notEqual(rotateSessionId(), rotateSessionId(), '轮换互异');
assert.ok(isValidSessionId(loadOrCreateSessionId()), '恢复/新建恒合法');
assert.equal(typeof loadDshOn(), 'boolean');
storeDshOn(true);
assert.equal(loadDshOn(), true);
storeDshOn(false);
assert.equal(loadDshOn(), false);
assert.equal(isValidSessionId('x'.repeat(65)), false, '65 字符拒（服务端 400 同规）');
assert.equal(isValidSessionId('s-abc-123'), true);
ok('session.ts 形状面：200 随机全合法 + 轮换互异 + 开关往返 + 越界拒绝');

// ⑤ 挂账② snapshot 透传：runDshSessionTurn 带 snapshot → body.dsh={sessionId,snapshot}；
//   无 snapshot 时 body.dsh 恒为 {sessionId}（步骤①deepEqual 已守）；无 relay 场景零泄漏不变（步骤③已守）
const snap = { digest: '第 42 年：三国鼎立。', chronicle: ['人类建成第二村落'] };
const r5 = await runDshSessionTurn(relayProvider, sid, '带快照提问', {}, snap);
const b5 = captured[captured.length - 1];
assert.deepEqual(b5.dsh, { sessionId: sid, snapshot: snap }, 'body.dsh={sessionId,snapshot} 透传（字节面）');
assert.equal(b5.messages.length, 1, '带快照仍仅末条 user');
assert.equal(r5.content, '回答', '快照面 SSE 泵不受影响');
ok(`snapshot 透传：body.dsh={sessionId,snapshot}（digest ${snap.digest.length} 字+纪事 ${snap.chronicle.length} 行）`);

server.close();
console.log(`\nFRONTEND SESSION WIRE SMOKE: ${step} 步 ALL PASS`);
