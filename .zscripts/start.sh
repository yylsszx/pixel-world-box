#!/bin/bash
# =============================================================================
# 生产启动脚本 v76 —— package.json "start" 入口（部署链第二步）
# -----------------------------------------------------------------------------
# 优先级：standalone 生产服务器（构建成功的部署形态）> dev server（兜底）。
# 行为：
#   - 生产可用 + :PORT 健康 → 前台 supervisor 循环（死亡即经 revive.sh 秒级复活，
#     连续失败升级 build.sh 全量重建）
#   - 生产可用 + :PORT 空闲 → 双 fork 拉起生产服务器 → supervisor
#   - 生产不可用 → dev 模式（v74 逻辑）：健康 → supervisor；空闲 → 前台 dev
#
# 前台 supervisor 保持进程常驻 = 平台部署「服务存活」信号；另有 watchdog
# （双 fork 常驻）双保险 —— 即使本脚本被平台超时杀掉，watchdog 仍保活。
# =============================================================================
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
HEALTH_URL="http://localhost:${PORT}/"

health() { curl -fsS --max-time 4 "$HEALTH_URL" >/dev/null 2>&1; }
prod_ready() { [ -f .next/standalone/server.js ] && [ -f .next/DEPLOY_OK ]; }

ensure_watchdog() {
  (setsid bash "$DIR/watchdog.sh" >/dev/null 2>&1 < /dev/null &)
}

wait_up() {
  for _ in $(seq 1 60); do
    health && return 0
    sleep 2
  done
  return 1
}

# —— 幂等拉起 watchdog（双 fork 常驻）——
ensure_watchdog

if health; then
  echo "[START] :$PORT already healthy — entering supervisor mode (immortal)"
  MODE="supervising"
elif prod_ready; then
  echo "[START] :$PORT free — starting PRODUCTION server (standalone)"
  (
    cd .next/standalone
    PORT="$PORT" HOSTNAME=0.0.0.0 setsid node server.js >> "$PROJECT_DIR/.zscripts/prod.log" 2>&1 < /dev/null &
  )
  if wait_up; then
    echo "[START] production server healthy on :$PORT — entering supervisor mode (immortal)"
    MODE="prod"
  else
    echo "[START] WARN: production server failed to start — trying dev fallback"
    MODE="dev"
  fi
else
  MODE="dev"
fi

# —— dev 兜底拉起 ——
if [ "$MODE" = "dev" ]; then
  if ! health; then
    echo "[START] :$PORT free — starting dev server"
    (setsid bash -c "cd '$PROJECT_DIR' && bun run dev" >/dev/null 2>&1 < /dev/null &)
    if wait_up; then
      echo "[START] dev server healthy on :$PORT — entering supervisor mode (immortal)"
    else
      echo "[START] ERROR: no server could be started on :$PORT"
      exit 1
    fi
  else
    echo "[START] server already healthy on :$PORT — entering supervisor mode (immortal)"
  fi
fi

# —— 前台监督循环：死亡 → revive.sh 秒级复活；连续 3 次真实失败 → build.sh 全量 ——
LAST_REVIVE=0
LAST_FULL=0
REVIVE_FAILED=0
while true; do
  if health; then
    REVIVE_FAILED=0
  else
    NOW=$(date +%s)
    if [ $((NOW - LAST_REVIVE)) -ge 20 ]; then
      LAST_REVIVE=$NOW
      # revive.sh 退出码：0=成功（清零）；1=真实失败（+1）；2=限流跳过（不计不升）
      # （不能用 `|| true` —— 会把 $? 重置为 0；本脚本 set -u 无 -e，非零退出码安全）
      bash "$DIR/revive.sh"
      rc=$?
      if [ "$rc" = "0" ]; then
        REVIVE_FAILED=0
      elif [ "$rc" = "1" ]; then
        REVIVE_FAILED=$((REVIVE_FAILED + 1))
      fi
    fi
    # 连续 3 次真实失败 → 全量重建（5 分钟速率限制防风暴）
    # DEPLOY_REASON=recovery：build.sh 拿锁后若服务已被他方修好则直接退出（防互踩）
    if [ "$REVIVE_FAILED" -ge 3 ] && [ $((NOW - LAST_FULL)) -ge 300 ]; then
      LAST_FULL=$NOW
      REVIVE_FAILED=0
      echo "[START] $(date '+%F %T') revives exhausted — full rebuild via build.sh (recovery)"
      DEPLOY_REASON=recovery bash "$DIR/build.sh" || true
    fi
  fi
  sleep 5
done
