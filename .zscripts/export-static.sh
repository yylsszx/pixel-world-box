#!/bin/bash
# ============================================================
# Task 78：GitHub Pages 静态导出
# 用法:  bash .zscripts/export-static.sh [/仓库名]
#   $1   = basePath（GitHub Pages 项目站点 = /仓库名；根域名站点留空）
# 产物:  out/ （可直接作为 gh-pages 分支内容）
#
# 原理：
#   · 游戏本体 100% 客户端（'use client' + ssr:false + localStorage 存档），
#     唯一的服务端依赖是 AI 神谕的 3 个 API 路由 —— 静态导出不支持动态
#     POST 处理器，且外部托管本来也连不上平台内网 AI 网关，客户端已有
#     404 友好降级文案，故暂移后构建、结束自动还原（trap 兜底）。
#   · NEXT_DIST_DIR 隔离构建目录，绝不干扰运行中的 dev server。
#   · .nojekyll：GitHub Pages 默认跑 Jekyll，会忽略 _next/ 下划线目录
#     （所有 JS/CSS 资产 404）—— 必须放一个空 .nojekyll 关掉它。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

BASE_PATH="${1:-}"
API_DIR="src/app/api"
API_BAK=".api-stash-export"
OUT_DIR="out"

echo "[EXPORT] 静态导出开始  basePath='${BASE_PATH}'"

# ---- 1) 暂移 API 路由（唯一的静态导出阻挡物） ----
restore_api() {
  if [ -d "$API_BAK" ]; then
    rm -rf "$API_DIR"
    mv "$API_BAK" "$API_DIR"
    echo "[EXPORT] api 路由已还原"
  fi
}
if [ -d "$API_DIR" ]; then
  rm -rf "$API_BAK"
  mv "$API_DIR" "$API_BAK"
  trap restore_api EXIT
  echo "[EXPORT] api 路由已暂移（构建后自动还原）"
fi

# ---- 1.5) 临时补丁：放开 Next 构建工人的堆顶 ----
# 根因（2026-11-02 实证）：next build 以 isolatedMemory:true 硬编码在 worker 子进程
# 内删除 NODE_OPTIONS 的 max-old-space-size（dist/lib/worker.js），4GB 沙箱下 worker
# 落回 V8 默认堆顶 ~2048MB，预渲染必 OOM（外部 2048/2800/3200 三档全数无效实证）。
# 处置：构建期临时 isolatedMemory→false 让堆参数直达 worker，构建后自动还原。
NEXT_PATCH_FILES=(
  "node_modules/next/dist/build/index.js"
  "node_modules/next/dist/esm/build/index.js"
)
restore_next_patch() {
  if [ "${PATCHED:-0}" = "1" ]; then
    for f in "${NEXT_PATCH_FILES[@]}"; do
      if [ -f "$f.bak-heap" ]; then mv "$f.bak-heap" "$f"; fi
    done
    echo "[EXPORT] next worker 堆补丁已还原"
  fi
}
restore_all() { restore_api; restore_next_patch; }
PATCHED=0
for f in "${NEXT_PATCH_FILES[@]}"; do
  if [ -f "$f" ] && grep -q 'isolatedMemory: true' "$f"; then
    cp "$f" "$f.bak-heap"
    sed -i 's/isolatedMemory: true/isolatedMemory: false/g' "$f"
    PATCHED=1
  fi
done
if [ "$PATCHED" = "1" ]; then
  trap restore_all EXIT
  echo "[EXPORT] next worker 堆补丁已打（isolatedMemory→false，构建后自动还原）"
fi

# ---- 2) 静态构建（独立 distDir，与运行中的 dev server 互不干扰；堆顶可覆写） ----
rm -rf "$OUT_DIR" ".next-export"
STATIC_EXPORT=1 \
  EXPORT_BASE_PATH="$BASE_PATH" \
  NEXT_DIST_DIR=".next-export" \
  NODE_OPTIONS="--max-old-space-size=${EXPORT_HEAP:-2800}" \
  ./node_modules/.bin/next build

# ---- 3) 还原（api 路由越早越好） ----
restore_api
restore_next_patch
trap - EXIT

# ---- 4) 产物校验 ----
if [ ! -f "$OUT_DIR/index.html" ]; then
  echo "[EXPORT] FATAL: $OUT_DIR/index.html 不存在（构建异常）" >&2
  exit 1
fi
touch "$OUT_DIR/.nojekyll"

if [ ! -f "$OUT_DIR/wasm/wbcore.wasm" ]; then
  echo "[EXPORT] WARN: public/wasm/wbcore.wasm 未进产物（wasm 批内核将降级 JS 路径）" >&2
fi

# basePath 烧录自检：_next 资产引用必须带前缀
if [ -n "$BASE_PATH" ]; then
  if grep -q "src=\"/pixel\|href=\"/$BASE_PATH" "$OUT_DIR/index.html" 2>/dev/null || \
     grep -q "\"$BASE_PATH/_next" "$OUT_DIR/index.html" 2>/dev/null; then
    echo "[EXPORT] basePath 已正确烧录进 index.html"
  else
    echo "[EXPORT] WARN: index.html 未见 basePath 前缀的资产引用，请人工检查"
  fi
fi

FILES=$(find "$OUT_DIR" -type f | wc -l)
SIZE=$(du -sh "$OUT_DIR" | cut -f1)
echo "[EXPORT] 完成：out/ = ${SIZE}，${FILES} 个文件（含 .nojekyll）"
