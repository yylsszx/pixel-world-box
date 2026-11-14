#!/usr/bin/env bash
# v9 直连勘察：各 AI 厂商 chat/completions 端点 CORS 浏览器直连实测
# 模拟浏览器预检（OPTIONS + ACA-Headers）与真实 POST（无 Key，看响应头与状态码）
ORIGIN="${1:-https://yylsszx.github.io}"
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
declare -a EPS=(
  "GLM|https://open.bigmodel.cn/api/paas/v4/chat/completions"
  "DeepSeek|https://api.deepseek.com/v1/chat/completions"
  "Kimi|https://api.moonshot.cn/v1/chat/completions"
  "Qwen|https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  "Naive|https://api.naive.ai/v1/chat/completions"
  "SiliconFlow|https://api.siliconflow.cn/v1/chat/completions"
  "Hunyuan|https://api.hunyuan.cloud.tencent.com/v1/chat/completions"
  "MiniMax|https://api.minimaxi.com/v1/text/chat_completion_v2"
  "Spark|https://spark-api-open.xf-yun.com/v1/chat/completions"
  "Ark|https://ark.cn-beijing.volces.com/api/v3/chat/completions"
)
for ep in "${EPS[@]}"; do
  name="${ep%%|*}"; url="${ep#*|}"
  echo "=== $name  ($url)"
  echo "--- preflight OPTIONS (Origin: $ORIGIN)"
  curl -sS -o /dev/null -D - --max-time 12 -X OPTIONS "$url" -A "$UA" \
    -H "Origin: $ORIGIN" \
    -H 'Access-Control-Request-Method: POST' \
    -H 'Access-Control-Request-Headers: authorization,content-type' 2>&1 \
    | tr -d '\r' | rg -i '^(HTTP|access-control|server)' || echo '(no CORS/status headers)'
  echo "--- real POST without key"
  curl -sS -o /dev/null -D - --max-time 12 -X POST "$url" -A "$UA" \
    -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
    -d '{"model":"m","messages":[{"role":"user","content":"hi"}],"stream":true}' 2>&1 \
    | tr -d '\r' | rg -i '^(HTTP|access-control)' || echo '(no CORS/status headers)'
  echo
done
