// QA mock：openai 兼容 + anthropic 双形态厂商端点（CORS 放行 + 请求记录到 /tmp/qa-brain-requests.log）
// 用法：node scripts/qa-mock-brain.mjs [port]  （默认 8901）
import http from 'node:http';
import fs from 'node:fs';

const PORT = Number(process.argv[2] ?? 8901);
const LOG = '/tmp/qa-brain-requests.log';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-dangerous-direct-browser-access',
};

function log(entry) {
  fs.appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
}

const server = http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }
  let body = '';
  await new Promise((r) => {
    req.on('data', (c) => { body += c; });
    req.on('end', r);
    req.on('error', r);
  });
  let parsed = null;
  try { parsed = JSON.parse(body); } catch { /* keep null */ }
  log({ t: new Date().toISOString(), port: PORT, method: req.method, url, headers: { auth: req.headers.authorization ?? null, xkey: req.headers['x-api-key'] ?? null, ver: req.headers['anthropic-version'] ?? null, dangerous: req.headers['anthropic-dangerous-direct-browser-access'] ?? null }, body: parsed });

  // 决策回执：固定可校验的六维 + note
  const decision = JSON.stringify({ personaPatch: { war: 0.21, farm: 0.88 }, note: `MOCK_DECISION_${PORT}` });
  const wantsStream = parsed && parsed.stream === true; // 中继转发用 SSE；浏览器直连用非流式

  if (url.endsWith('/chat/completions')) {
    if (wantsStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', ...CORS });
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant', content: decision } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ id: 'mock', choices: [{ index: 0, message: { role: 'assistant', content: decision } }] }));
    return;
  }
  if (url.endsWith('/v1/messages') || url.endsWith('/messages')) {
    if (wantsStream) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', ...CORS });
      res.write(`data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: decision } })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ id: 'mock', content: [{ type: 'text', text: decision }] }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify({ error: `mock: unknown ${url}` }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`mock brain listening on http://127.0.0.1:${PORT}`);
});
