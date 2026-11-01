# ============ Sealos 部署 Dockerfile ============
# 多阶段构建：Builder -> Runner

# ---- Builder 阶段 ----
FROM node:20-alpine AS builder

WORKDIR /app

# 安装构建依赖
RUN apk add --no-cache python3 make g++

# 复制 package 文件
COPY package.json bun.lockb* ./

# 安装依赖 (使用 bun 更快)
RUN npm install -g bun && bun install --frozen-lockfile

# 复制源码
COPY . .

# 生成 Prisma Client
RUN bunx prisma generate

# 构建 Next.js 应用
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ---- Runner 阶段 ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 复制 Prisma 相关
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# 复制 WASM 文件
COPY --from=builder /app/public/wasm ./public/wasm

# 复制自定义服务器入口
COPY --from=builder /app/server.ts ./server.ts

# 复制依赖 (仅生产依赖)
COPY --from=builder /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动自定义服务器 (支持 WebSocket)
CMD ["node", "server.ts"]