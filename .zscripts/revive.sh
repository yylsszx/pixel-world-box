#!/bin/bash
# =============================================================================
# 秒级复活脚本 v76（新）—— watchdog / start supervisor 共用的复活路径
# -----------------------------------------------------------------------------
# 与 build.sh（全量重建，分钟级）分离：生产服务器死亡后无需重建，直接重启
# standalone server.js 即可在数秒内恢复 —— 「永久不死极其稳定」的快路径。
#
# 优先级：:PORT 已健康 → 退出；standalone 可用 → 重启生产服务器；
#         否则 → dev server 拉起（v74 语义）。
# 互斥：复用 revive.lock（防 watchdog × supervisor × 平台并发复活）；
# 速率限制：60s 内最多一次实际复活动作（防崩溃循环）。
# =============================================================================
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
HEALTH_URL="http://localhost:${PORT}/"
RATE_FILE="$DIR/revive.rate"

health() { curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; }
prod_ready() { [ -f .next/standalone/server.js ] && [ -f .next/DEPLOY_OK ]; }

log() { echo "[REVIVE] $(date '+%F %T') $*" >> "$DIR/watchdog.log"; }

# 端口 → pid（ss 为准；本镜像 lsof 静默失效——见 build.sh 踩坑注释）
port_pids() {
  local port="$1" pids=""
  pids=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2)
  if [ -z "$pids" ]; then
    pids=$(lsof -t -i ":$port" -sTCP:LISTEN 2>/dev/null || true)
  fi
  if [ -n "$pids" ]; then
    echo "$pids" | sort -u
  fi
  return 0
}

health && exit 0

# —— 互斥锁（并发安全）——
exec 8>"$DIR/revive.lock"
flock -w 60 8 || true

# 拿到锁后二次探活（对端可能已修好）
health && exit 0

# —— 速率限制（60s 一次）——
# 退出码语义：0=已健康/复活成功；1=真实失败；2=限流跳过（调用方不应计为失败，
# 更不应因此升级到 build.sh 全量重建——那会把「崩溃风暴限流中」误判成「产物损坏」）
NOW=$(date +%s)
LAST=0
[ -f "$RATE_FILE" ] && LAST=$(cat "$RATE_FILE" 2>/dev/null || echo 0)
if [ $((NOW - LAST)) -lt 60 ] && [ "$LAST" != "0" ]; then
  log "rate limited (last revive ${LAST}) — skipping"
  exit 2
fi
echo "$NOW" > "$RATE_FILE"

if prod_ready; then
  log "restarting PRODUCTION server on :$PORT ..."
  # 先清残尸（上次死亡的半开 socket/僵尸进程）
  pids=$(port_pids "$PORT")
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  # 【锁 fd 继承防护】本脚本持 revive.lock（fd 8），服务器继承它会让下一次
  # revive 的 flock -w 60 白等 60s —— 派生前先关闭
  (
    exec 8>&-
    cd .next/standalone
    PORT="$PORT" HOSTNAME=0.0.0.0 setsid node server.js >> "$PROJECT_DIR/.zscripts/prod.log" 2>&1 < /dev/null &
  )
else
  log "starting dev server (fallback) on :$PORT ..."
  pids=$(port_pids "$PORT")
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  # 直接调 next dev -p $PORT（bun run dev 脚本写死 3000，PORT 可变时起不来）
  (exec 8>&-; setsid bash -c "cd '$PROJECT_DIR' && exec node_modules/.bin/next dev -p $PORT >> dev.log 2>&1" >/dev/null 2>&1 < /dev/null &)
fi

# —— 等就绪（生产秒级；dev 冷编译可能 60-120s）——
for _ in $(seq 1 45); do
  health && { log "revive OK on :$PORT"; exit 0; }
  sleep 2
done

log "revive FAILED within 90s"
exit 1
