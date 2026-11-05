#!/usr/bin/env bash
# M-O4 相三挂账①「前端中继实测」E2E——真前端静态产物 × oracle-server(node 直跑真装配) × 假 ollama 上游(:11434)
# 链路：浏览器(:8123 out/ 产物) → relayUrl(:8787) → dsh 会话面/纯中继 → 上游(:11434 openai 兼容)
# 场景：R1 dsh 两段式工具轮 → R2 显式重启#1 续跑(服务端权威记忆) → R3 刷新+重启#2 续跑(前端锚点)
#       R4 清空=sessionId 轮换(新 JSONL) → R5 关持久=直通面回归(无 dsh 字段)
# 用法：bash scripts/oracle-dsh/relay-e2e-live.sh   （需 out/ 静态伺服 :8123 与 agent-browser）
set -uo pipefail
ROOT=/home/z/my-project
E2E_OUT=/tmp/pwb-relay-e2e
STORE=/tmp/pwb-relay-store
AB="agent-browser"
PASS=0; FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }

SRV_PID=""; UP_PID=""
ensure_upstream(){
  # 上游全脚本仅起一次（seq 全局递增 → up-XX 与回合对号；stop_servers 不杀它）
  curl -sf http://127.0.0.1:11434/api/tags > /dev/null 2>&1 && return 0
  setsid nohup node "$ROOT/scripts/oracle-dsh/relay-e2e-upstream.mjs" > "$E2E_OUT/upstream.log" 2>&1 < /dev/null &
  UP_PID=$!
  for _ in $(seq 1 20); do curl -sf http://127.0.0.1:11434/api/tags > /dev/null 2>&1 && return 0; sleep 0.25; done
  return 1
}
start_servers(){
  ensure_upstream || { echo "  ✗ 上游 :11434 未就绪"; return 1; }
  ( cd "$ROOT/oracle-server" && DSH_RUNTIME=1 PORT=8787 PWB_STORE_ROOT="$STORE" setsid nohup node server.mjs > "$E2E_OUT/server.log" 2>&1 < /dev/null & echo $! > "$E2E_OUT/srv.pid" )
  SRV_PID=$(cat "$E2E_OUT/srv.pid" 2>/dev/null || echo "")
  for _ in $(seq 1 60); do
    curl -sf http://127.0.0.1:8787/healthz > /dev/null 2>&1 && break
    sleep 0.25
  done
  curl -sf http://127.0.0.1:8787/healthz > /dev/null 2>&1
}
stop_servers(){
  [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null
  pkill -f 'node server.mjs' 2>/dev/null
  sleep 0.5
}
panel_text(){
  $AB eval "(document.querySelector('[aria-label=\"神谕 Agent 面板\"]')||document.body).innerText.replace(/\n+/g,'|').slice(0,1000)" 2>/dev/null
}
wait_panel_contains(){
  local needle="$1"
  for _ in $(seq 1 30); do
    if panel_text | grep -q "$needle"; then return 0; fi
    sleep 1
  done
  return 1
}
sid_of(){ $AB eval "localStorage.getItem('oracle-dsh-session-v1')||''" 2>/dev/null | tr -d '"' | head -c 80; }

echo "=== M-O4 相三挂账① 前端中继实测 E2E ==="

# ---- ⓪ 清场 + 浏览器统一初始化（注入 provider + 持久开 → reload → 进世界 → 开面板） ----
# 强制重启上游（seq 从 1 起 → up-XX 与回合对号；幂等：上轮残留进程会使序号漂移）
pkill -f relay-e2e-upstream.mjs 2>/dev/null
sleep 0.5
rm -rf "$STORE"; mkdir -p "$STORE" "$E2E_OUT"
rm -f "$E2E_OUT"/up-*.json
$AB open http://127.0.0.1:8123/pixel-world-box/ > /dev/null 2>&1
sleep 2
$AB eval "localStorage.setItem('oracle-provider-v1', JSON.stringify({kind:'openai',label:'通道A假ollama',baseUrl:'http://127.0.0.1:11434',apiKey:'test-key',model:'fake-mini:1b',relayUrl:'http://127.0.0.1:8787'})); localStorage.setItem('oracle-dsh-on-v1','1'); localStorage.removeItem('oracle-dsh-session-v1'); 'ok'" > /dev/null 2>&1
$AB reload > /dev/null 2>&1
$AB wait --text "进入世界" --timeout 30000 > /dev/null 2>&1 && ok "⓪ 静态产物加载（TitleScreen 出现）" || bad "⓪ TitleScreen 未出现"
$AB find role button click --name "进入世界" > /dev/null 2>&1
sleep 3
$AB find role button click --name "神谕 AI" > /dev/null 2>&1
sleep 1
PRESSED=$($AB eval "Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-pressed')!==null&&b.textContent.includes('持久')))?.getAttribute('aria-pressed')||'none'" 2>/dev/null | tr -d '"')
[ "$PRESSED" = "true" ] && ok "⓪ 「持久」开关初始 aria-pressed=true（localStorage 注入生效）" || bad "⓪ 持久开关状态=$PRESSED（期望 true）"

# ---- R1：dsh 两段式工具轮（wb_echo → 终文） ----
echo "-- R1 dsh 会话面：wb_echo 工具轮 + {t}/{r} 流"
start_servers && ok "R1 起服 healthz 就绪" || bad "R1 起服失败"
$AB find label "向神谕提问" fill "看看这个世界" > /dev/null 2>&1
$AB find role button click --name "发送提问" > /dev/null 2>&1
# 回合中 {r} 思考流窗口（上游第 1 段延迟 2s）：抓「[bridge] 工具轮 1: wb_echo」桥过程行
FOUND_BR=0
for _ in $(seq 1 16); do
  if panel_text | grep -q "工具轮"; then FOUND_BR=1; break; fi
  sleep 0.45
done
[ "$FOUND_BR" = "1" ] && ok "R1 回合中 {r} 思考流现「[bridge] 工具轮 1: wb_echo」桥过程行（非静默）" || bad "R1 未抓到工具轮桥过程行（思考流窗口错过）"
if wait_panel_contains "中继实测回复"; then ok "R1 终文气泡「中继实测回复｜上游见N条投影」入流"; else bad "R1 终文未入流：$(panel_text | head -c 300)"; fi
panel_text | grep -q "wb_echo" && ok "R1 工具卡 wb_echo 入流（桥过程非静默）" || echo "  · R1 终态面板无 wb_echo 字样（wb_echo 为服务端执行，工具卡挂账支线——思考流窗口已另证）"
S1=$(sid_of)
case "$S1" in s-*) ok "R1 sessionId 形状合法：$S1";; *) bad "R1 sessionId 异常：'$S1'";; esac
JSONL1="$STORE/sessions/$S1.jsonl"
[ -s "$JSONL1" ] && ok "R1 服务端 JSONL 落盘：$S1.jsonl" || bad "R1 JSONL 未落盘"
stop_servers

# ---- R2：显式重启 #1 → 同 sessionId 续跑（服务端权威记忆） ----
echo "-- R2 重启#1：同 sessionId 续跑（历史由 JSONL 投影回放，前端仅发末条 user）"
start_servers && ok "R2 重启#1 就绪" || bad "R2 重启失败"
$AB find label "向神谕提问" fill "还记得刚才吗" > /dev/null 2>&1
$AB find role button click --name "发送提问" > /dev/null 2>&1
wait_panel_contains "中继实测回复" && ok "R2 重启后续跑回复入流" || bad "R2 重启后回复未入流"
S2=$(sid_of)
[ "$S2" = "$S1" ] && ok "R2 sessionId 恒定（服务重启不换锚点）" || bad "R2 sessionId 漂移：$S1→$S2"
stop_servers

# ---- R3：浏览器刷新（切后台模拟）→ 重启 #2 → 续跑 ----
echo "-- R3 刷新+重启#2：localStorage 锚点恢复 + 服务端回放"
$AB reload > /dev/null 2>&1
$AB wait --text "进入世界" --timeout 30000 > /dev/null 2>&1
$AB find role button click --name "进入世界" > /dev/null 2>&1
sleep 3
$AB find role button click --name "神谕 AI" > /dev/null 2>&1
sleep 1
S3=$(sid_of)
[ "$S3" = "$S1" ] && ok "R3 刷新后 sessionId 恢复（前端锚点持久化）" || bad "R3 刷新后 sessionId 漂移：$S1→$S3"
start_servers && ok "R3 重启#2 就绪" || bad "R3 重启失败"
$AB find label "向神谕提问" fill "世界纪事最近有什么" > /dev/null 2>&1
$AB find role button click --name "发送提问" > /dev/null 2>&1
wait_panel_contains "中继实测回复" && ok "R3 刷新+重启双续跑回复入流" || bad "R3 回复未入流"
stop_servers

# ---- R4：清空 → sessionId 轮换 → 新 JSONL ----
echo "-- R4 清空：气泡清空 + sessionId 轮换（旧会话留档）"
$AB find first "button[aria-label^='清空神谕会话']" click > /dev/null 2>&1
sleep 0.8
S4=$(sid_of)
[ -n "$S4" ] && [ "$S4" != "$S1" ] && ok "R4 清空轮换新 sessionId：$S4" || bad "R4 轮换异常：$S1→$S4"
PT=$(panel_text)
echo "$PT" | grep -q "看看这个世界" && bad "R4 气泡未清空" || ok "R4 气泡已清空"
start_servers && ok "R4 重启#3 就绪" || bad "R4 重启失败"
$AB find label "向神谕提问" fill "新会话第一条" > /dev/null 2>&1
$AB find role button click --name "发送提问" > /dev/null 2>&1
wait_panel_contains "中继实测回复" && ok "R4 新会话回复入流" || bad "R4 回复未入流"
[ -s "$STORE/sessions/$S4.jsonl" ] && ok "R4 新会话独立 JSONL 落盘" || bad "R4 新 JSONL 未落盘"
stop_servers

# ---- R5：关持久 → 直通面回归（无 dsh 字段，与 v6 逐字节同形） ----
echo "-- R5 关持久：直通面（纯中继，无 dsh 键）"
$AB eval "Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-pressed')!==null&&b.textContent.includes('持久'))?.click(); 'clicked'" > /dev/null 2>&1
sleep 0.6
P5=$($AB eval "Array.from(document.querySelectorAll('button')).find(b=>(b.getAttribute('aria-pressed')!==null&&b.textContent.includes('持久')))?.getAttribute('aria-pressed')||'none'" 2>/dev/null | tr -d '"')
[ "$P5" = "false" ] && ok "R5 持久开关已关（aria-pressed=false）" || bad "R5 开关状态=$P5"
start_servers && ok "R5 重启#4 就绪" || bad "R5 重启失败"
$AB find label "向神谕提问" fill "直通测试" > /dev/null 2>&1
$AB find role button click --name "发送提问" > /dev/null 2>&1
for _ in $(seq 1 30); do panel_text | grep -q "直通面OK" && break; sleep 1; done
panel_text | grep -q "直通面OK" && ok "R5 直通面回复入流（假上游直通分支命中）" || bad "R5 直通回复未入流：$(panel_text | head -c 300)"
SID5=$(sid_of)
[ "$SID5" = "$S4" ] && ok "R5 关持久不发 dsh（sessionId 本地保留不动）" || bad "R5 sessionId 意外变化"
stop_servers

echo "=== 浏览器交互面：PASS=$PASS FAIL=$FAIL ==="
echo "=== 移交断言脚本 relay-e2e-assert.mjs（服务面+投影+逐字节）==="
node "$ROOT/scripts/oracle-dsh/relay-e2e-assert.mjs" "$S1" "$S4"
EXIT=$?
[ $FAIL -eq 0 ] && [ $EXIT -eq 0 ] && { echo "=== 前端中继实测 E2E：ALL PASS ==="; exit 0; }
echo "=== 前端中继实测 E2E：存在失败（浏览器面 FAIL=$FAIL / 断言面 exit=$EXIT）==="
exit 1
