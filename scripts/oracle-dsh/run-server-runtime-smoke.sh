#!/bin/bash
# M-O4 相二：oracle-server dsh 会话面冒烟入口（DSH_RUNTIME=1 真实引导 + 离线假上游 E2E）
# 前置：node scripts/oracle-dsh/pack-runtime.mjs && cd oracle-server/dsh-runtime && pnpm install --ignore-scripts
# 用法：bash scripts/oracle-dsh/run-server-runtime-smoke.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_ROOT="$SCRIPT_DIR/../../oracle-server/dsh-runtime"
if [ ! -d "$RUNTIME_ROOT/node_modules" ]; then
  echo "✗ 装配树未安装依赖：$RUNTIME_ROOT（先 pack + pnpm install，见文件头）" >&2
  exit 1
fi
cd "$RUNTIME_ROOT"
exec node "$SCRIPT_DIR/server-runtime-smoke.mjs"
