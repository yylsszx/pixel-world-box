#!/bin/bash
# M-O1 dsh 五包最小闭环冒烟复跑入口（零构建源码直消费，docs/deepseek-harness-adaptation.md §4 方案A变体）
# 前置：third_party/deepseek-harness 已 pnpm install（--filter 五包闭包 --ignore-scripts）
# 用法：bash scripts/oracle-dsh/run-smoke.sh
set -euo pipefail
cd "$(dirname "$0")/../../third_party/deepseek-harness"
exec node --import tsx --import "$(dirname "$0")/hook-register.mjs" "$(dirname "$0")/smoke.mjs"
