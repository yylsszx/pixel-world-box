// ============ Cloudflare Worker 冒烟测试：mock OpenAI 上游 → 全端点校验面 + 服务端密钥注入 ============
// 运行：node scripts/worker-smoke.mjs（沙箱内 Node 20+：Request/Response/TransformStream/fetch 全可用）
// 与 oracle-server-smoke.sh 同一mock上游形态，验证 Workers 版与 Node 版线协议逐字段一致。
import http from 'node:http';

const PASS = []; const FAIL = [];
const ok = (m) => { PASS.push(m); console.log(`  ✓ ${m}`); };
const bad = (m, ...d) => { FAIL.push(m); console.log(`  ✗ ${m}`, ...d); };

// —— mock 上游：OpenAI 兼容 SSE（:9099）——记录收到的 Authorization 以验证服务端密钥注入 ——
let lastAuth = ''; let lastPayload = null;
const mock = http.createServer((req, res) => {
  if (req.url.endsWith('/chat/completions')) {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      lastAuth = req.headers.authorization ?? '';
      try { lastPayload = JSON.parse(body); } catch { lastPayload = null; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // 中枢决策请求（系统提示含「中枢核心」）→ 回决策 JSON；普通对话 → 回中文寒暄
      const isBrain = (lastPayload?.messages ?? []).some((m) => typeof m?.content === 'string' && m.content.includes('中枢核心'));
      if (isBrain) {
        res.write('data: {"choices":[{"delta":{"content":"{\\"personaPatch\\":{\\"war\\":0.55,\\"farm\\":0.7},\\"note\\":\\"测试纪要\\"}"}}]}\n\n');
      } else {
        res.write('data: {"choices":[{"delta":{"reasoning_content":"思"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n');
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  } else { res.writeHead(404); res.end(); }
});
await new Promise((r) => mock.listen(9099, r));

const worker = (await import('../cloudflare/worker.js')).default;
const ENV_DEFAULT = { DEFAULT_OPENAI_API_KEY: 'sk-server-side', DEFAULT_OPENAI_BASE_URL: 'http://127.0.0.1:9099/v1', DEFAULT_OPENAI_MODEL: 'mock-model' };
const ENV_EMPTY = {};

async function call(env, path, init = {}) {
  const req = new Request(`https://worker.test${path}`, init);
  return worker.fetch(req, env);
}
async function text(res) { return await res.text(); }

// == 1. healthz（无默认厂商） ==
{
  const r = await call(ENV_EMPTY, '/healthz');
  const t = await text(r);
  r.status === 200 && t.includes('"ok":true') && t.includes('"default_provider":false')
    ? ok('healthz 200 + default_provider:false 如实上报') : bad('healthz 异常', r.status, t);
}
// == 2. CORS 预检 ==
{
  const r = await call(ENV_EMPTY, '/api/oracle/agent', { method: 'OPTIONS', headers: { Origin: 'https://yylsszx.github.io' } });
  r.status === 204 && r.headers.get('access-control-allow-origin') === '*'
    ? ok('OPTIONS 204 + CORS 全放行') : bad('CORS 预检异常', r.status);
}
// == 3. GET 405（前端探测识别「后端在」） ==
{
  const r = await call(ENV_EMPTY, '/api/oracle/agent');
  r.status === 405 ? ok('GET /api/oracle/agent → 405') : bad('GET → ', r.status);
  const r2 = await call(ENV_EMPTY, '/api/civ-brain');
  r2.status === 405 ? ok('GET /api/civ-brain → 405') : bad('GET → ', r2.status);
}
// == 4. SSE 转发（openai → mock 上游，自带 apiKey） ==
{
  const r = await call(ENV_EMPTY, '/api/oracle/agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: { kind: 'openai', label: 'mock', baseUrl: 'http://127.0.0.1:9099/v1', apiKey: 'sk-test', model: 'm1' }, messages: [{ role: 'assistant', content: 'sys' }, { role: 'user', content: 'hi' }] }),
  });
  const t = await text(r);
  const okAll = t.includes('"r":"思"') && t.includes('"t":"你好"') && t.includes('"t":"，世界"') && t.includes('[DONE]');
  okAll ? ok('SSE r/t 通道 + [DONE] 全转发') : bad('SSE 缺帧', t);
}
// == 5. 服务端密钥注入（openai 无 apiKey → env 默认三元组补全；密钥不回传前端） ==
{
  const r = await call(ENV_DEFAULT, '/api/oracle/agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: { kind: 'openai', label: '留空走服务端' }, messages: [{ role: 'assistant', content: 'sys' }, { role: 'user', content: 'hi' }] }),
  });
  const t = await text(r);
  t.includes('"t":"你好"') && lastAuth === 'Bearer sk-server-side' && lastPayload?.model === 'mock-model'
    ? ok('openai 留空 → 服务端 key/baseUrl/model 注入（上游实收 Bearer sk-server-side）') : bad('注入失败', t, lastAuth);
  t.includes('sk-server-side') ? bad('响应泄漏服务端密钥！', t) : ok('响应体零密钥泄漏');
}
// == 6. builtin → 默认厂商映射（议会通道接活的关键） ==
{
  const r = await call(ENV_DEFAULT, '/api/oracle/agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: { kind: 'builtin' }, messages: [{ role: 'assistant', content: 'sys' }, { role: 'user', content: 'hi' }] }),
  });
  const t = await text(r);
  t.includes('"t":"你好"') && lastAuth === 'Bearer sk-server-side'
    ? ok('builtin → 默认厂商映射接通') : bad('builtin 映射失败', t, lastAuth);
  const r2 = await call(ENV_EMPTY, '/api/oracle/agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: { kind: 'builtin' }, messages: [{ role: 'assistant', content: 'sys' }, { role: 'user', content: 'hi' }] }),
  });
  const t2 = await text(r2);
  r2.status === 400 && t2.includes('DEFAULT_OPENAI_API_KEY')
    ? ok('builtin 无默认厂商 → 400 明示指引') : bad('builtin 无默认异常', r2.status, t2);
}
// == 7. /api/civ-brain：默认厂商注入 → personaPatch 白名单提取 ==
{
  const r = await call(ENV_DEFAULT, '/api/civ-brain', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: { kind: 'builtin' }, civ: { name: '测试国', pop: 100 }, persona: { war: 0.5 } }),
  });
  const t = await text(r);
  let j = null; try { j = JSON.parse(t); } catch { /* below */ }
  r.status === 200 && j && j.note === '测试纪要' && j.personaPatch && j.personaPatch.farm === 0.7 && Object.keys(j.personaPatch).length === 2
    ? ok(`civ-brain 回执白名单提取（war=0.55 farm=0.7）`) : bad('civ-brain 异常', r.status, t);
  const r2 = await call(ENV_EMPTY, '/api/civ-brain', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: { kind: 'local' }, civ: {}, persona: {} }),
  });
  r2.status === 400 ? ok('civ-brain 非法 kind → 400') : bad('civ-brain kind 校验异常', r2.status);
}
// == 8. 校验面 ==
{
  const r = await call(ENV_EMPTY, '/api/oracle/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json' });
  r.status === 400 ? ok('坏 JSON → 400') : bad('坏 JSON → ', r.status);
  const r2 = await call(ENV_EMPTY, '/api/oracle/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: { kind: 'local' }, messages: [{ role: 'assistant', content: 's' }] }) });
  const t2 = await text(r2);
  r2.status === 400 && t2.includes('builtin / openai / anthropic') ? ok('local 厂商拒绝') : bad('local 未拒', r2.status, t2);
  const r3 = await call(ENV_EMPTY, '/api/oracle/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: { kind: 'openai' }, messages: [{ role: 'assistant', content: 'sys' }, { role: 'user', content: 'hi' }], dsh: { sessionId: 'x' } }) });
  const t3 = await text(r3);
  r3.status === 400 && t3.includes('dsh') ? ok('dsh 面 → 400 明示不支持') : bad('dsh 异常', r3.status, t3);
  const r4 = await call(ENV_EMPTY, '/api/oracle/agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: { kind: 'openai' }, messages: [{ role: 'user', content: 'no-sys' }] }) });
  r4.status === 400 ? ok('messages[0] 非 assistant → 400') : bad('校验异常', r4.status);
}
// == 9. 未知路径 ==
{
  const r = await call(ENV_EMPTY, '/nope');
  r.status === 404 ? ok('未知路径 404') : bad('未知路径 → ', r.status);
}

mock.close();
console.log(`== 冒烟结果: PASS=${PASS.length} FAIL=${FAIL.length} ==`);
process.exit(FAIL.length ? 1 : 0);
