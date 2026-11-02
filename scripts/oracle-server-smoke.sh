#!/usr/bin/env bash
# oracle-server 冒烟测试：mock OpenAI 兼容上游 → 验证 /healthz、SSE 转发、CORS、校验面
set -u
cd "$(dirname "$0")/../oracle-server" || exit 1

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

# —— mock 上游：OpenAI 兼容 SSE（:9099）——
node - <<'EOF' &
const http = require('node:http');
http.createServer((req, res) => {
  if (req.url.endsWith('/chat/completions')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"choices":[{"delta":{"reasoning_content":"思"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"你好"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  } else { res.writeHead(404); res.end(); }
}).listen(9099, () => console.log('mock up :9099'));
EOF
MOCK_PID=$!

node server.mjs > /tmp/oracle-server.log 2>&1 &
SRV_PID=$!
sleep 1.2

echo '== 1. /healthz =='
HZ=$(curl -s localhost:8787/healthz)
echo "$HZ" | grep -q '"ok":true' && ok "healthz ok: $HZ" || bad "healthz 异常: $HZ"
echo "$HZ" | grep -q '"builtin":\(true\|false\)' && ok "builtin 可选增强状态如实上报" || bad "builtin 字段异常"

echo '== 2. CORS 预检 =='
OPT=$(curl -s -o /dev/null -w '%{http_code}|%{header_json}' -X OPTIONS localhost:8787/api/oracle/agent -H 'Origin: https://yylsszx.github.io' -H 'Access-Control-Request-Method: POST')
echo "$OPT" | grep -q '^204' && ok "OPTIONS 204" || bad "OPTIONS 非 204: $OPT"
echo "$OPT" | grep -q 'access-control-allow-origin' && ok "CORS 头存在" || bad "缺 CORS 头"

echo '== 3. SSE 转发（openai → mock 上游） =='
SSE=$(curl -s -N -X POST localhost:8787/api/oracle/agent -H 'Content-Type: application/json' -H 'Origin: https://yylsszx.github.io' -d '{"provider":{"kind":"openai","label":"mock","baseUrl":"http://127.0.0.1:9099/v1","apiKey":"sk-test","model":"m1"},"messages":[{"role":"assistant","content":"sys"},{"role":"user","content":"hi"}]}')
echo "$SSE" | grep -q '"r":"思"' && ok "r 通道（reasoning）转发" || bad "r 通道丢失: $SSE"
echo "$SSE" | grep -q '"t":"你好"' && echo "$SSE" | grep -q '"t":"，世界"' && ok "t 通道（content）转发" || bad "t 通道丢失: $SSE"
echo "$SSE" | grep -q '\[DONE\]' && ok "[DONE] 终止帧" || bad "缺 [DONE]"

echo '== 4. GET 405（前端探测识别「后端在」） =='
G=$(curl -s -o /dev/null -w '%{http_code}' localhost:8787/api/oracle/agent)
[ "$G" = "405" ] && ok "GET → 405" || bad "GET → $G"

echo '== 5. 校验面 =='
V1=$(curl -s -X POST localhost:8787/api/oracle/agent -H 'Content-Type: application/json' -d '{"provider":{"kind":"openai"}}')
echo "$V1" | grep -q '缺少 baseUrl' && ok "缺 baseUrl → 400 文案" || bad "校验异常: $V1"
V2=$(curl -s -X POST localhost:8787/api/oracle/agent -H 'Content-Type: application/json' -d '{"provider":{"kind":"local"},"messages":[{"role":"assistant","content":"s"}]}')
echo "$V2" | grep -q '浏览器端推理' && ok "local 厂商拒绝转发" || bad "local 未拒: $V2"
V3=$(curl -s -o /dev/null -w '%{http_code}' -X POST localhost:8787/api/oracle/agent -H 'Content-Type: application/json' -d 'not-json')
[ "$V3" = "400" ] && ok "坏 JSON → 400" || bad "坏 JSON → $V3"

echo '== 6. apiKey 不入日志 =='
if grep -q 'sk-test' /tmp/oracle-server.log; then bad "日志泄漏 apiKey"; else ok "日志零密钥"; fi

kill $MOCK_PID $SRV_PID 2>/dev/null
wait 2>/dev/null
echo "== 冒烟结果: PASS=$PASS FAIL=$FAIL =="
[ $FAIL -eq 0 ]
