#!/bin/bash
# ============ 静态导出脚本（GitHub Pages / 纯静态托管） ============
# 用法:
#   bash .zscripts/export-static.sh           # 根路径部署
#   bash .zscripts/export-static.sh /subpath  # 子路径部署 (如 /pixel-world-box)

set -e

BASE_PATH=${1:-""}
echo "📦 静态导出模式${BASE_PATH:+ (basePath: $BASE_PATH)}"

STATIC_EXPORT=1 EXPORT_BASE_PATH="$BASE_PATH" bash .zscripts/build.sh

# 产物在 out/ 目录
echo "✅ 静态产物已生成到 out/ 目录"
echo "🚀 可部署到 GitHub Pages 或任意静态托管服务"
