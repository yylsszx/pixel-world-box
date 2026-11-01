#!/bin/bash
# ============ 统一构建脚本（支持三种模式） ============
# 用法:
#   bash .zscripts/build.sh              # 标准构建 (standalone for Vercel/Sealos)
#   STATIC_EXPORT=1 bash .zscripts/build.sh  # 静态导出
#   SEALOS_BACKEND=1 bash .zscripts/build.sh # Sealos 后端构建

set -e

echo "🔨 开始构建..."

# 安装依赖
bun install --frozen-lockfile

# 生成 Prisma Client
bunx prisma generate

# 运行 Next.js 构建
if [ "$STATIC_EXPORT" = "1" ]; then
  echo "📦 模式: 静态导出 (GitHub Pages)"
  STATIC_EXPORT=1 bun run next build
elif [ "$SEALOS_BACKEND" = "1" ]; then
  echo "🐳 模式: Sealos 后端"
  SEALOS_BACKEND=1 bun run next build
else
  echo "☁️ 模式: 标准构建"
  bun run next build
fi

echo "✅ 构建完成"