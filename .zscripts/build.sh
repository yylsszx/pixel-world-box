#!/bin/bash
# =============================================================================
# 部署构建脚本 v76 —— 真实产线构建 + standalone 生产形态（dev 兜底）
# -----------------------------------------------------------------------------
# 【历史定论修正】Task 65/66 曾结论「next build 必死于 SSG OOM」→ v74 改为
# 「确保 dev server 存活」。Task 76 实测取证推翻该结论：
#   - next build 实际峰值 RSS ≈ 1.4GB（dev server 同时运行下测得）
#   - 当年失败根因 = 无堆上限 + dev server 抢内存 → cgroup 内核 OOM 杀构建
#   - NODE_OPTIONS 堆上限 + 停服后再构建 → 稳定成功（多次验证）
#
# 【新部署环境兼容】平台部署在全新容器执行（本沙箱无部署痕迹取证）：
#   1. node_modules 不进 git → 全新环境必须 bun install（v74 缺失此步，
#      「bun run dev 起不来 → 120s 超时 → 部署失败」= 用户仍见失败页的根因）
#   2. bun.lock 的 registry 改写兜底（同 /start.sh 逻辑，国内镜像加速）
#   3. .env 兜底
#
# 【流程】停 :3000 现有服务 → 清 .next 残骸 → 真实 next build →
#   成功：补齐 standalone 静态资产 + DEPLOY_OK 标记 → 双 fork 拉起生产服务器
#   失败：清残骸 → dev server 兜底（服务可用性优先，部署仍算成功）
#
# 环境变量：
#   PORT                  服务端口（默认 3000；演练/测试可覆盖）
#   DEPLOY_FALLBACK_DEV=0 禁用 dev 兜底（并行演练时防端口冲突）
#   NODE_HEAP_MB          构建堆上限（默认 2048；实测峰值 1372MB）
# =============================================================================
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

PORT="${PORT:-3000}"
HEAP="${NODE_HEAP_MB:-2048}"
HEALTH_URL="http://localhost:${PORT}/"
LOG_TAG="[DEPLOY]"

log() { echo "$LOG_TAG $(date '+%F %T') $*"; }

# —— 双 fork 常驻法：(setsid cmd &) 子壳即退 → 孤儿被 init 收养 →
#    逃逸 agent 会话的进程清理（Task 65-b 验证的唯一可行法，nohup/disown 均被清理）
# 【锁继承路坑（螺旋踩坑）】本脚本持 build.lock（fd 9），长命子进程（服务器/
# watchdog）若继承该 fd → 锁永不释放 → 后续所有 build.sh 排队 600s 死锁。
# → 所有长命进程派生点必须先 `exec 9>&-` 关闭锁 fd 再 setsid。
ensure_watchdog() {
  (exec 9>&-; setsid bash "$PROJECT_DIR/.zscripts/watchdog.sh" >/dev/null 2>&1 < /dev/null &)
}

check_up() {
  curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1
}

# —— 端口 → 监听进程 pid 集合 ——
# 【踩坑实测】本镜像的 lsof 静默失效（监听存在却返回空、exit=0）→ 旧版
# stop_port 形同虚设 → 新服务器 EADDRINUSE 崩溃 + 旧服务器冒名应答健康检查
# （假阳性「部署成功」）。ss 为准，lsof 仅在 ss 无果时兜底。
port_pids() {
  local port="$1" pids=""
  pids=$(ss -tlnp "sport = :$port" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2)
  if [ -z "$pids" ]; then
    pids=$(lsof -t -i ":$port" -sTCP:LISTEN 2>/dev/null || true)
  fi
  if [ -n "$pids" ]; then
    echo "$pids" | sort -u
  fi
  return 0
}

# —— 1) 依赖兜底：全新部署环境 node_modules 不存在 ——
if [ ! -x node_modules/.bin/next ]; then
  log "node_modules missing — running bun install (fresh deploy environment)..."
  if ! command -v bun >/dev/null 2>&1; then
    log "ERROR: bun not found in PATH — cannot install dependencies"
    exit 1
  fi
  # registry 镜像改写（与平台 /start.sh 同款逻辑，幂等）：bun.lock 里的绝对 URL
  # 会绕过 registry 配置，跨境拉包会拖垮安装甚至超时
  if [ -n "${NPM_CONFIG_REGISTRY:-}" ]; then
    _reg_host="${NPM_CONFIG_REGISTRY#*://}"; _reg_host="${_reg_host%%/*}"; _reg_host="${_reg_host%%:*}"
    if [ -n "$_reg_host" ] && [ -f bun.lock ]; then
      if grep -q 'registry\.npmjs\.com' bun.lock 2>/dev/null; then
        sed -i "s#registry\.npmjs\.com#${_reg_host}#g" bun.lock 2>/dev/null || true
        log "bun.lock registry rewritten to ${_reg_host}"
      fi
    fi
  fi
  if ! bun install; then
    log "ERROR: bun install failed"
    exit 1
  fi
fi

# —— 2) .env 兜底（standalone 运行时读取）——
if [ ! -f .env ]; then
  echo "DATABASE_URL=file:$PROJECT_DIR/db/custom.db" > .env
  log ".env created with DATABASE_URL"
fi

# —— 3) 停掉 :PORT 现有服务（部署 = 形态切换；dev 与旧生产都要让位）——
stop_port() {
  local pids
  pids=$(port_pids "$PORT")
  [ -z "$pids" ] && return 0
  log "stopping existing server on :$PORT (pid: $(echo $pids | tr '\n' ' '))"
  kill $pids 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pids=$(port_pids "$PORT")
    [ -z "$pids" ] && return 0
    sleep 1
  done
  pids=$(port_pids "$PORT")
  if [ -n "$pids" ]; then
    log "force killing $pids"
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
  # 终极保险：强杀后仍占用 → 等内核释放（防新服务器 EADDRINUSE）
  for _ in 1 2 3 4 5; do
    pids=$(port_pids "$PORT")
    [ -z "$pids" ] && return 0
    sleep 1
  done
  pids=$(port_pids "$PORT")
  [ -n "$pids" ] && log "WARN: port :$PORT still occupied by $pids"
}

# —— 3.5) 构建互斥锁（先拿锁，后动手：所有变更都在锁内）——
# 【踩坑实测（连续击杀螺旋）】watchdog 与 supervisor 同时升级到 build.sh →
# 两个 next build 抢 .next/lock 互炸 → 双双失败 → 双双落 dev 兜底。
# flock 序列化：后到者等待；拿到锁后若「恢复模式」且服务已健康 → 直接退出。
# （stop_port 也必须在锁内：否则并发时后者会删掉前者刚启动的服务器文件）
BUILD_LOCK="$PROJECT_DIR/.zscripts/build.lock"
exec 9>"$BUILD_LOCK"
if ! flock -w 600 9; then
  log "WARN: could not acquire build lock within 600s — another build is stuck"
  exit 1
fi
if [ "${DEPLOY_REASON:-deploy}" = "recovery" ] && check_up; then
  log "recovery: server already healthy after waiting for peer build — nothing to do"
  exit 0
fi

stop_port

# —— 4) 备份最后已知良好产物 + 清构建残骸 ——
# 备份的必要性（螺旋踩坑）：旧版直接 rm -rf .next → 构建失败时把最后可用
# standalone 一并毁掉 → 恢复路径永久死锁。standalone 在第 6 步后完全自包含
# （static/public 已拷入），备份它 = 保留「可回滚到上个版本」的能力。
rm -rf .next-recovery
if [ -d .next/standalone ] && [ -f .next/DEPLOY_OK ]; then
  mkdir -p .next-recovery
  cp -al .next/standalone .next-recovery/standalone 2>/dev/null || cp -r .next/standalone .next-recovery/standalone
  cp .next/DEPLOY_OK .next-recovery/DEPLOY_OK
  log "backed up last-known-good standalone to .next-recovery/"
fi
if [ -d .next ]; then
  log "cleaning previous build artifacts in .next/"
  rm -rf .next
fi

# —— 5) 真实产线构建（standalone 输出）——
log "running production build (heap cap ${HEAP}MB, measured peak ~1400MB)..."
if NODE_OPTIONS="--max-old-space-size=${HEAP}" node_modules/.bin/next build; then
  # —— 6) 补齐 standalone 运行所需资产（Next 不会自动拷贝）——
  if [ -d .next/standalone ]; then
    mkdir -p .next/standalone/.next/static
    if [ -d .next/static ]; then
      cp -r .next/static/. .next/standalone/.next/static/ 2>/dev/null || true
    fi
    if [ -d public ]; then
      mkdir -p .next/standalone/public
      cp -r public/. .next/standalone/public/ 2>/dev/null || true
    fi
    date +%s > .next/DEPLOY_OK
    chmod +x .next/standalone/server.js 2>/dev/null || true
    log "production build OK — standalone ready (.next/standalone)"
  else
    log "WARN: build exited 0 but standalone output missing — falling back to dev"
    rm -rf .next
    DEPLOY_BUILD_NO_STANDALONE=1
  fi
else
  log "WARN: production build failed — restoring last-known-good standalone"
  rm -rf .next
  # 还原最后已知良好产物（若有）：revive.sh 可继续用它秒级拉起上个版本
  if [ -d .next-recovery/standalone ] && [ -f .next-recovery/DEPLOY_OK ]; then
    mkdir -p .next
    mv .next-recovery/standalone .next/standalone
    mv .next-recovery/DEPLOY_OK .next/DEPLOY_OK
    log "restored last-known-good standalone (revive can serve previous version)"
  fi
  DEPLOY_BUILD_NO_STANDALONE=1
fi

# —— 7) 成功路径：双 fork 拉起生产服务器 ——
# 注：server.js 由 next build 生成时不带可执行位（-rw-rw-r--），启动统一走
# `node server.js`，存在性检查用 -f（演练曾因 -x 误判跌入 dev 兜底）
if [ -z "${DEPLOY_BUILD_NO_STANDALONE:-}" ] && [ -f .next/standalone/server.js ] && [ -f .next/DEPLOY_OK ]; then
  (
    exec 9>&-
    cd .next/standalone
    PORT="$PORT" HOSTNAME=0.0.0.0 setsid node server.js >> "$PROJECT_DIR/.zscripts/prod.log" 2>&1 < /dev/null &
  )
  for _ in $(seq 1 40); do
    if check_up; then
      log "production server is up on :$PORT — deploy OK (production mode)"
      ensure_watchdog
      exit 0
    fi
    sleep 2
  done
  log "WARN: production server did not become ready within 80s"
  # 生产服务器没起来 → 落到 dev 兜底
fi

# —— 8) dev 兜底（服务可用性优先）——
# 端口正确性（螺旋踩坑）：`bun run dev` 的 package.json 脚本写死 -p 3000，
# PORT≠3000 时兜底永远起不来 → 直接调 next dev -p $PORT
if [ "${DEPLOY_FALLBACK_DEV:-1}" = "0" ]; then
  log "dev fallback disabled (DEPLOY_FALLBACK_DEV=0) — deploy failed"
  exit 1
fi

log "starting dev server (fallback mode)..."
(exec 9>&-; setsid bash -c "cd '$PROJECT_DIR' && exec node_modules/.bin/next dev -p $PORT >> dev.log 2>&1" >/dev/null 2>&1 < /dev/null &)
for _ in $(seq 1 60); do
  if check_up; then
    log "dev server is up on :$PORT — deploy OK (dev-server mode)"
    ensure_watchdog
    exit 0
  fi
  sleep 2
done

log "ERROR: neither production nor dev server became ready within 120s"
log "$LOG_TAG tail of dev.log:"
tail -n 20 dev.log 2>/dev/null || true
exit 1
