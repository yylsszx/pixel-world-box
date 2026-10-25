#!/bin/bash
# =============================================================================
# 永生看门狗 v76 —— 常驻探活守护（模式无关）
# -----------------------------------------------------------------------------
# 每 5s 探活 :PORT，连续 2 次失败（≥10s 确认死亡，防瞬态抖动）：
#   1. revive.sh 秒级复活（standalone 重启 / dev 拉起，互斥 + 60s 速率限制）
#   2. 连续 3 轮 revive 后仍死亡 → build.sh 全量重建（300s 速率限制防风暴）
#
# 启动方式：build.sh / start.sh 均以双 fork 法幂等拉起（本脚本自带 pidfile
# 防重）。日志：.zscripts/watchdog.log（自动截尾 2000→800 行防膨胀）。
# =============================================================================
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/watchdog.log"
PID_FILE="$DIR/watchdog.pid"
PORT="${PORT:-3000}"
HEALTH_URL="http://localhost:${PORT}/"

log() {
  echo "[$(date '+%F %T')] $*" >> "$LOG"
  # 截尾：超 2000 行保留最新 800
  if [ "$(wc -l < "$LOG" 2>/dev/null || echo 0)" -gt 2000 ]; then
    tail -n 800 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
  fi
}

# 幂等：已有活实例则退出（pidfile + kill -0 + 命令行匹配三重校验）
# 三重校验的必要性（Task 76 演练踩坑）：陈旧 pidfile（git 同步/容器重启后
# pid 被无关进程复用）会让 kill -0 误判「已在运行」→ watchdog 永远起不来
if [ -f "$PID_FILE" ]; then
  _old_pid=$(cat "$PID_FILE" 2>/dev/null || true)
  if [ -n "$_old_pid" ] && kill -0 "$_old_pid" 2>/dev/null; then
    _old_cmd=$(ps -p "$_old_pid" -o cmd= 2>/dev/null || true)
    case "$_old_cmd" in
      *watchdog.sh*) exit 0 ;;
      *) log "stale pidfile (pid $_old_pid is '$_old_cmd', not a watchdog) — taking over" ;;
    esac
  fi
fi
echo $$ > "$PID_FILE"

log "watchdog started (pid $$, port $PORT)"

FAILS=0
REVIVE_ROUNDS=0
LAST_FULL=0
while true; do
  # pidfile 被更新（新实例接管）则自退，防双 watchdog
  [ -f "$PID_FILE" ] && [ "$(cat "$PID_FILE" 2>/dev/null)" != "$$" ] && exit 0

  if curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
    FAILS=0
    REVIVE_ROUNDS=0
  else
    FAILS=$((FAILS + 1))
    log "health check failed ($FAILS/2)"
    if [ "$FAILS" -ge 2 ]; then
      FAILS=0
      log "server confirmed dead — revive round"
      # revive.sh 退出码：0=复活成功/已健康（轮次清零）；1=真实失败（轮次+1）；
      # 2=限流跳过（不计不升——防止把限流窗口误判成产物损坏而触发全量重建）
      bash "$DIR/revive.sh" >> "$LOG" 2>&1
      rc=$?
      if [ "$rc" = "0" ]; then
        REVIVE_ROUNDS=0
      elif [ "$rc" = "1" ]; then
        REVIVE_ROUNDS=$((REVIVE_ROUNDS + 1))
      fi
      log "revive round finished (rc=$rc, rounds=$REVIVE_ROUNDS)"
      # 连续 3 轮「真实失败」后 → 全量重建（300s 速率限制防风暴）
      if ! curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; then
        NOW=$(date +%s)
        if [ "$REVIVE_ROUNDS" -ge 3 ] && [ $((NOW - LAST_FULL)) -ge 300 ]; then
          LAST_FULL=$NOW
          log "revives exhausted — full rebuild via build.sh (recovery) ..."
          DEPLOY_REASON=recovery bash "$DIR/build.sh" >> "$LOG" 2>&1
          log "full rebuild finished (exit=$?)"
          REVIVE_ROUNDS=0
        fi
      fi
    fi
  fi
  sleep 5
done
