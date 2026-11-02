# PWB 神谕中继后端（Sealos 容器版）
# 零 npm 依赖：构建期不触网（R1 网络波动韧性）；node:20-slim 基础镜像。
FROM node:20-slim

WORKDIR /app

# 可选增强：builtin（内置 Z.ai）通道。镜像默认不装（SDK 需要运行时凭证），
# 需要时取消注释或构建后容器内 `npm i z-ai-web-dev-sdk` 重启即可。
# RUN npm install z-ai-web-dev-sdk --omit=dev

COPY package.json server.mjs ./

ENV NODE_ENV=production \
    PORT=8787

EXPOSE 8787

# 健康检查：node 内置 fetch 探 /healthz（slim 无 wget/curl）
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "server.mjs"]
