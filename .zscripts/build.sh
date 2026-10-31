#!/bin/bash
# 本地构建脚本（供 package.json "build" 调用）
set -euo pipefail
cd "$(dirname "$0")/.."
NODE_OPTIONS="--max-old-space-size=2048" ./node_modules/.bin/next build