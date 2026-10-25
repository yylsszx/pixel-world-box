#!/bin/bash
# =============================================================================
# 开发形态切换脚本（agent 工具，部署环境不需要）
# -----------------------------------------------------------------------------
# 用途：本沙箱被部署链切换到「生产形态」（standalone server）后，agent 需要
# 继续开发（HMR / Turbopack 热更新）时，运行本脚本切回 dev server。
# 生产服务器会被停止，dev server 以双 fork 法常驻拉起。
# 之后再部署：bash .zscripts/build.sh （自动停 dev → 构建 → 切回生产形态）
# =============================================================================
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$DIR/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
HEALTH_URL="http://localhost:${PORT}/"

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

echo "[TO-DEV] stopping any server on :$PORT ..."
pids=$(port_pids "$PORT")
if [ -n "$pids" ]; then
  kill $pids 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    pids=$(port_pids "$PORT")
    [ -z "$pids" ] && break
    sleep 1
  done
  pids=$(port_pids "$PORT")
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
fi

echo "[TO-DEV] starting dev server (double-fork, escapes session cleanup)..."
(setsid bash -c "cd '$PROJECT_DIR' && bun run dev" >/dev/null 2>&1 < /dev/null &)

for _ in $(seq 1 90); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo "[TO-DEV] dev server healthy on :$PORT"
    exit 0
  fi
  sleep 2
done
echo "[TO-DEV] ERROR: dev server did not become ready within 180s"
tail -n 20 dev.log 2>/dev/null || true
exit 1
