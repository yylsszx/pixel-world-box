#!/bin/bash
# M-O4 相三挂账①：前端 sessionId 接线 · 线协议冒烟入口（离线假中继 E2E，tsx 直测前端 TS 源）
# 前置：oracle-server/dsh-runtime 装配树（pack-runtime.mjs + pnpm install，见 run-session-persistence-smoke.sh 头）
# 用法：bash scripts/oracle-dsh/run-frontend-session-wire-smoke.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_ROOT="$SCRIPT_DIR/../../oracle-server/dsh-runtime"
if [ ! -x "$RUNTIME_ROOT/node_modules/.bin/tsx" ]; then
  echo "✗ 装配树未安装依赖：$RUNTIME_ROOT（先 pack + pnpm install，见文件头）" >&2
  exit 1
fi
cd "$SCRIPT_DIR/../../.."
exec "$RUNTIME_ROOT/node_modules/.bin/tsx" "$SCRIPT_DIR/frontend-session-wire-smoke.mjs"
