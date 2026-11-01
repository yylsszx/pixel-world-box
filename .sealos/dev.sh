#!/bin/bash
# ============ 本地开发启动脚本 (Sealos 模拟) ============

set -e

echo "🔧 启动本地开发环境 (Sealos 模式)..."

# 1. 启动 PostgreSQL (Docker)
if ! docker ps | grep -q pixelworld-db; then
  echo "🐘 启动 PostgreSQL..."
  docker run -d --name pixelworld-db \
    -e POSTGRES_DB=pixelworld \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_PASSWORD=postgres \
    -p 5432:5432 \
    postgres:16-alpine
  echo "⏳ 等待数据库就绪..."
  sleep 5
fi

# 2. 设置环境变量
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pixelworld?schema=public"
export Z_API_KEY="${Z_API_KEY:-}"
export NEXTAUTH_SECRET="${NEXTAUTH_SECRET:-dev-secret-change-in-production}"
export NODE_ENV="development"
export PORT="3000"
export SEALOS_BACKEND="1"

# 3. 运行数据库迁移
echo "🗄️ 运行数据库迁移..."
bunx prisma migrate dev --name init

# 4. 生成 Prisma Client
echo "🔨 生成 Prisma Client..."
bunx prisma generate

# 5. 启动开发服务器 (支持 WebSocket)
echo "🚀 启动开发服务器..."
bun run server.ts