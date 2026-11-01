#!/bin/bash
# ============ Sealos 后端构建脚本 ============
# 用法: SEALOS_BACKEND=1 bash .zscripts/build.sh

set -e

echo "🐳 Sealos 后端构建模式"

# 安装依赖
bun install --frozen-lockfile

# 生成 Prisma Client
bunx prisma generate

# 运行 Next.js 构建
SEALOS_BACKEND=1 bun run next build

echo "✅ Sealos 后端构建完成"