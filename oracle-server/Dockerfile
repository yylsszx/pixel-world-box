# PWB 神谕中继后端（Sealos 容器版 · v1.1 dsh 会话面）
# 中继面：零 npm 依赖（R1 韧性）；dsh 装配层：node:22-slim + pnpm 在镜像内安装
# （装配树 pnpm-lock 钉版；node:22 为相三 sqlite storage 预置——node:sqlite 实验 API 前提）。
FROM node:22-slim

WORKDIR /app

# —— 中继面（恒为零依赖直通） ——
COPY package.json server.mjs runtime-boot.mjs ./

# —— dsh 运行时装配层（M-O4 相二；DSH_RUNTIME=1 时挂载） ——
# .dockerignore 已剔 **/node_modules、**/tests、**/dist：源码 + manifest 入镜像，依赖镜像内装。
COPY dsh-runtime/package.json dsh-runtime/pnpm-workspace.yaml dsh-runtime/tsconfig.json dsh-runtime/pnpm-lock.yaml dsh-runtime/
COPY dsh-runtime/.pwb-hooks dsh-runtime/.pwb-hooks
COPY dsh-runtime/packages dsh-runtime/packages
COPY dsh-runtime/vendor dsh-runtime/vendor
RUN corepack enable \
  && corepack prepare pnpm@11.28.5 --activate \
  && cd dsh-runtime && pnpm install --ignore-scripts --frozen-lockfile \
  && pnpm store prune

ENV NODE_ENV=production \
    PORT=8787 \
    DSH_RUNTIME=1 \
    PWB_STORE_ROOT=/tmp/pwb-store

EXPOSE 8787

# 健康检查：node 内置 fetch 探 /healthz（slim 无 wget/curl）
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node

CMD ["node", "server.mjs"]
