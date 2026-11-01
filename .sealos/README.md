# ============ Sealos 后端分支 README ============
# Pixel World Box - Sealos 后端版本

## 🎮 特性

- **纯前端版** (main 分支): https://yylsszx.github.io/pixel-world-box/
  - 100% 浏览器本地运行，无需服务器
  - 适合单人游玩、快速体验

- **Sealos 后端版** (feat/sealos-backend 分支):
  - 多人同世界 (WebSocket 实时同步)
  - 服务端持久化存档 (PostgreSQL)
  - 服务端 AI 推理 (支持大模型、无浏览器限制)
  - 管理后台、存档分享、排行榜
  - 一键部署到 Sealos 云平台

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Sealos 部署架构                           │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Next.js)  ←→  Backend (Node.js 自定义服务器)      │
│       CDN/对象存储                │                          │
│                                 ▼                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              应用服务 (Next.js API Routes + WS)       │  │
│  │  /api/world   /api/oracle   /api/save   /api/ws      │  │
│  └──────────────────────────────────────────────────────┘  │
│           │                    │                    │       │
│           ▼                    ▼                    ▼       │
│      PostgreSQL            Redis              WebSocket     │
│   (世界状态/存档)        (会话/缓存)          (实时同步)     │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 快速开始

### 本地开发

```bash
# 1. 启动开发环境 (自动启动 PostgreSQL + 运行迁移 + 启动服务器)
bash .sealos/dev.sh

# 2. 访问 http://localhost:3000
```

### Sealos 云部署

```bash
# 1. 复制环境变量模板并填入实际值
cp .sealos/env.example .sealos/env.local
# 编辑 .sealos/env.local 填入 DATABASE_URL, Z_API_KEY, NEXTAUTH_SECRET 等

# 2. 一键部署
bash .sealos/deploy.sh production

# 3. 访问分配的域名
```

## 📦 构建模式

| 模式 | 环境变量 | 用途 | 产物 |
|------|---------|------|------|
| 静态导出 | `STATIC_EXPORT=1` | GitHub Pages | `out/` |
| 标准构建 | (默认) | Vercel/通用 | `.next/standalone` |
| Sealos 后端 | `SEALOS_BACKEND=1` | Sealos 云 | `.next/standalone` + 自定义服务器 |

```bash
# 标准构建
bash .zscripts/build.sh

# 静态导出
STATIC_EXPORT=1 bash .zscripts/build.sh
# 或
bash .zscripts/export-static.sh

# Sealos 后端构建
SEALOS_BACKEND=1 bash .zscripts/build.sh
# 或
bash .zscripts/build-sealos.sh
```

## 🔧 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 |
| `Z_API_KEY` | ✅ | Z.ai API Key (内置神谕模型) |
| `NEXTAUTH_SECRET` | ✅ | NextAuth 密钥 (生成: `openssl rand -base64 32`) |
| `NODE_ENV` | - | 运行环境 (production/development) |
| `PORT` | - | 服务端口 (默认 3000) |
| `SEALOS_BACKEND` | ✅ | 启用 Sealos 后端模式 (设为 "1") |

## 📡 API 接口

### 世界管理
- `GET /api/world` - 列出世界
- `POST /api/world` - 创建世界
- `GET /api/world/:id` - 获取世界详情
- `PATCH /api/world/:id` - 更新世界
- `DELETE /api/world/:id` - 删除世界

### 世界状态同步
- `GET /api/world/:id/state` - 获取完整世界状态
- `WS /api/ws` - WebSocket 实时同步

### 指令执行
- `POST /api/world/:id/directive` - 执行玩家指令

### 存档管理
- `GET /api/world/:id/saves` - 列出存档
- `POST /api/world/:id/saves` - 创建存档
- `GET /api/world/:id/saves/:saveId` - 获取存档详情
- `POST /api/world/:id/saves/:saveId/load` - 加载存档
- `DELETE /api/world/:id/saves/:saveId` - 删除存档

### 神谕 AI
- `POST /api/oracle/agent` - 神谕 Agent 对话 (SSE 流式)

## 🐳 Docker

```bash
# 构建镜像
docker build -f .sealos/Dockerfile -t pixel-world-box .

# 运行容器
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e Z_API_KEY="..." \
  -e NEXTAUTH_SECRET="..." \
  -e NODE_ENV=production \
  -e SEALOS_BACKEND=1 \
  pixel-world-box
```

## 🔄 从纯前端版迁移

纯前端版的存档 (localStorage) 可导入后端版：

1. 在纯前端版导出存档 JSON
2. 在后端版创建新世界
3. 使用存档导入功能恢复

## 📄 许可

游戏源码仅供学习交流。