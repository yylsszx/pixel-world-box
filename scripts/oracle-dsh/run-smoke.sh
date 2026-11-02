#!/bin/bash
# M-O1 dsh 五包最小闭环冒烟复跑入口（零构建源码直消费，docs/deepseek-harness-adaptation.md §4 方案A变体）
# 前置：third_party/deepseek-harness 已 pnpm install（--filter 五包闭包 --ignore-scripts）
# 用法：bash scripts/oracle-dsh/run-smoke.sh
set -euo pipefail
# 绝对路径解析：--import 与入口参数必须是可解析说明符（相对形式 'scripts/...'
# 会被 Node 当裸包名解析 → ERR_MODULE_NOT_FOUND，Task 2026-11-02 实证）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../../third_party/deepseek-harness"
exec node --import tsx --import "$SCRIPT_DIR/hook-register.mjs" "$SCRIPT_DIR/smoke.mjs"
