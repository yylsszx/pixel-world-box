#!/bin/bash
# M-O4 相三挂账②：pwb-tools 真实游戏工具注册冒烟复跑入口（装配树 = oracle-server/dsh-runtime，非池）
# 前置：node scripts/oracle-dsh/pack-runtime.mjs && cd oracle-server/dsh-runtime && pnpm install --ignore-scripts
# 用法：bash scripts/oracle-dsh/run-pwb-tools-smoke.sh
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_ROOT="$SCRIPT_DIR/../../oracle-server/dsh-runtime"
if [ ! -d "$RUNTIME_ROOT/node_modules" ]; then
  echo "✗ 装配树未安装依赖：$RUNTIME_ROOT（先 pack + pnpm install，见文件头）" >&2
  exit 1
fi
cd "$RUNTIME_ROOT"
DSH_ROOT="$RUNTIME_ROOT" exec node --import tsx --import "$SCRIPT_DIR/hook-register.mjs" "$SCRIPT_DIR/pwb-tools-smoke.mjs"
