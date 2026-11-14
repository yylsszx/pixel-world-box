#!/usr/bin/env bash
# GLM / Naive 预检变体扫描：Origin 组合 × 请求头组合 × 备用端点
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'
test_preflight() {
  local url="$1" origin="$2" acah="$3"
  echo "--- Origin: ${origin:-<无>} | ACAH: ${acah:-<无>}"
  local args=(-sS -o /tmp/pf-body -w '' -D - --max-time 12 -X OPTIONS "$url" -A "$UA" -H "Access-Control-Request-Method: POST")
  [ -n "$origin" ] && args+=(-H "Origin: $origin")
  [ -n "$acah" ] && args+=(-H "Access-Control-Request-Headers: $acah")
  curl "${args[@]}" 2>&1 | tr -d '\r' | rg -i '^(HTTP|access-control)' || echo '  (无 CORS/状态头)'
  echo "  body: $(head -c 160 /tmp/pf-body 2>/dev/null | tr '\n' ' ')"
}
echo '===== GLM open.bigmodel.cn/api/paas/v4/chat/completions ====='
for origin in 'https://yylsszx.github.io' 'https://open.bigmodel.cn' 'null' 'https://chatglm.cn'; do
  test_preflight 'https://open.bigmodel.cn/api/paas/v4/chat/completions' "$origin" 'authorization,content-type'
done
echo '--- GLM 变体：不发 ACAH'
test_preflight 'https://open.bigmodel.cn/api/paas/v4/chat/completions' 'https://yylsszx.github.io' ''
echo '--- GLM 变体：ACAH 带空格'
test_preflight 'https://open.bigmodel.cn/api/paas/v4/chat/completions' 'https://yylsszx.github.io' 'authorization, content-type'
echo '--- GLM 备用域名 api.z.ai'
test_preflight 'https://api.z.ai/api/paas/v4/chat/completions' 'https://yylsszx.github.io' 'authorization,content-type'
echo '--- GLM coding 端点'
test_preflight 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions' 'https://yylsszx.github.io' 'authorization,content-type'
echo
echo '===== Naive api.naive.ai/v1/chat/completions ====='
for origin in 'https://yylsszx.github.io' 'https://platform.naive.ai' 'https://naive.ai' 'https://localhost:3000' 'http://localhost:5173' 'https://foo.github.io' 'null'; do
  test_preflight 'https://api.naive.ai/v1/chat/completions' "$origin" 'authorization,content-type'
done
echo '--- Naive Anthropic 格式端点 /v1/messages'
test_preflight 'https://api.naive.ai/v1/messages' 'https://yylsszx.github.io' 'x-api-key,content-type,anthropic-version'
echo
echo '===== MiniMax POST 响应体看 404 原因 ====='
curl -sS --max-time 12 -X POST 'https://api.minimaxi.com/v1/text/chat_completion_v2' -A "$UA" \
  -H 'Origin: https://yylsszx.github.io' -H 'Content-Type: application/json' \
  -d '{"model":"abab6.5s-chat","messages":[{"role":"user","content":"hi"}]}' | head -c 300; echo
echo '===== MiniMax 新式端点 /v1/chat/completions 预检 ====='
test_preflight 'https://api.minimaxi.com/v1/chat/completions' 'https://yylsszx.github.io' 'authorization,content-type'
echo '===== 混元 GET 形态 preflight 看状态 ====='
test_preflight 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions' 'https://yylsszx.github.io' 'authorization,content-type'
