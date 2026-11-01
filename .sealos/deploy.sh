#!/bin/bash
# ============ Sealos 一键部署脚本 ============
# 用法: bash .sealos/deploy.sh [环境名]
# 示例: bash .sealos/deploy.sh production

set -e

ENV_NAME=${1:-production}
APP_NAME="pixel-world-box"
IMAGE_NAME="${APP_NAME}:$(date +%Y%m%d-%H%M%S)"

echo "🚀 开始部署 ${APP_NAME} 到 ${ENV_NAME}..."

# 检查环境变量文件
if [ ! -f ".sealos/env.local" ]; then
  echo "❌ 缺少 .sealos/env.local 文件"
  echo "📋 请复制 .sealos/env.example 并填入实际值:"
  echo "   cp .sealos/env.example .sealos/env.local"
  exit 1
fi

# 加载环境变量
source .sealos/env.local

# 1. 构建镜像
echo "📦 构建 Docker 镜像: ${IMAGE_NAME}"
docker build -f .sealos/Dockerfile -t ${IMAGE_NAME} .

# 2. 部署到 Sealos
echo "📦 部署应用..."
sealos run ${IMAGE_NAME} \
  --name ${APP_NAME} \
  --replicas 1 \
  --cpu 1 \
  --memory 2Gi \
  --port 3000 \
  --env DATABASE_URL="${DATABASE_URL}" \
  --env Z_API_KEY="${Z_API_KEY}" \
  --env NEXTAUTH_SECRET="${NEXTAUTH_SECRET}" \
  --env NODE_ENV=production \
  --env SEALOS_BACKEND=1

# 3. 运行数据库迁移
echo "🗄️ 运行数据库迁移..."
sealos exec ${APP_NAME} -- bunx prisma migrate deploy

echo "✅ 部署完成！"
echo "🌐 访问地址: https://${DOMAIN:-your-domain.sealos.io}"