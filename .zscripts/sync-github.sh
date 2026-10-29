#!/bin/bash
# ============================================================
# 一键同步源码到 GitHub main（Task 82 后续更新链）
# 用法:  bash .zscripts/sync-github.sh ["提交说明"]
# 行为:  组装白名单源码 → 无变化即跳过 → 有变化则提交推送 main
#        → GitHub Actions CI 自动重建 gh-pages（本脚本不碰部署）
# 认证:  gh auth 凭证助手（gh auth setup-git 已配置，无需明文 token）
# 幂等:  远端已是最新时直接退出 0；staging 丢失时自动重建并对接远端历史
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

GH_USER="yylsszx"
REPO="pixel-world-box"
MSG="${1:-update $(date -u +%FT%TZ)}"
STAGING="/tmp/gh-repo-staging"
REMOTE="https://github.com/$GH_USER/$REPO.git"

# --- 1) staging 就绪（存在则复用历史；丢失则初始化并尝试对接远端） ---
if [ ! -d "$STAGING/.git" ]; then
  rm -rf "$STAGING"; mkdir -p "$STAGING"
  ( cd "$STAGING"
    git init -q -b main
    git remote add origin "$REMOTE"
    if git fetch -q --depth=5 origin main 2>/dev/null; then
      git reset -q --hard FETCH_HEAD   # 对接远端历史（工作区马上会被覆盖）
    fi
  )
fi

# --- 2) 清空工作区（保留 .git 与 .zscripts），按白名单重新组装 ---
# Task 93：.zscripts 不再清空 —— 远端 v0.49 起该目录含协作方基建脚本（build/dev/push-github 等），
# 白名单重组若清空会逐轮误删；本目录以「保留远端存量 + 本地 export-static.sh 覆写」合并。
cd "$STAGING"
find . -mindepth 1 -maxdepth 1 ! -name .git ! -name .zscripts -exec rm -rf {} +
mkdir -p .zscripts
# Task 129（Job 2902286）教训：白名单缺 worklog.md/.gitignore 曾致 021e062 误删（Task 126 bddb62c 同款）——
# 恢复式提交治标，白名单补齐治本；两文件为仓库常驻真相源（worklog 台账/构建产物忽略规则）。
for item in src public prisma rust-core scripts unity docs README-GITHUB.md package.json bun.lock tsconfig.json tailwind.config.ts postcss.config.mjs components.json eslint.config.mjs next-env.d.ts next.config.ts .github .gitignore worklog.md; do
  [ -e "/home/z/my-project/$item" ] && cp -r "/home/z/my-project/$item" "./$item"
done
cp /home/z/my-project/.zscripts/export-static.sh .zscripts/
# lockfile 官方 registry（沙箱镜像源仅区域加速）
sed -i 's#registry\.npmmirror\.com#registry.npmjs.com#g' bun.lock
# README 注入真实游玩地址
sed "s|__SITE_URL__|https://$GH_USER.github.io/$REPO/|g; s|__REPO__|$REPO|g" README-GITHUB.md > README.md
rm -f README-GITHUB.md src/lib/db.ts   # 孤立脚手架，仓库不需要

# --- 3) 确保 origin 存在（历史 staging 可能从未配置 remote） ---
git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REMOTE"

# --- 4) 无变化则跳过（幂等；next-env.d.ts 是 dev/build 自动翻转的生成物，不作为变更） ---
git add -A
if git rev-parse -q --verify HEAD >/dev/null; then
  git restore --source=HEAD --staged --worktree -- next-env.d.ts 2>/dev/null || true
fi

# --- 4b) 工作树干净 ≠ 无事：上轮可能"已提交未推送"（推送中断留下领先提交，Task 87 实测踩坑）---
if [ -z "$(git status --porcelain)" ]; then
  if timeout 60 git fetch -q origin main 2>/dev/null; then
    AHEAD=$(git rev-list --count origin/main..HEAD 2>/dev/null)
    [ -z "$AHEAD" ] && AHEAD=1 # rev-list 失败从宽处理：直推（空推无害）
    if [ "$AHEAD" -eq 0 ]; then
      echo "✓ 源码无变化，远端已是最新：$REMOTE"
      exit 0
    fi
    echo "==> 检测到 $AHEAD 个已提交未推送的提交 —— 续推"
  else
    echo "==> fetch 失败（网络抖动），直接尝试推送存量提交"
  fi
else
  echo "==> 变更文件："
  git status --short | head -20
  git -c user.name="deploy-bot" -c user.email="deploy@users.noreply.github.com" commit -qm "$MSG"
fi

# --- 5) 推送（网络抖动重试，最多 8 分钟） ---
START=$(date +%s)
while true; do
  NOW=$(date +%s); [ $((NOW-START)) -gt 480 ] && { echo "✗ 推送超时（网络），稍后重跑本脚本即可续传"; exit 1; }
  if timeout 90 git push -q origin main 2>/tmp/sync-push-err.txt; then
    echo "✓ 已推送 main —— CI 自动部署已触发"
    echo "  提交：$(git log -1 --format=%s)"
    echo "  CI：https://github.com/$GH_USER/$REPO/actions"
    exit 0
  fi
  if grep -qE "non-fast-forward|rejected" /tmp/sync-push-err.txt; then
    echo "✗ 远端有本地没有的提交（非快进）。请检查 $REMOTE 或用 push-github.sh 全量重置。"; exit 1
  fi
  echo "  网络重试 @$((NOW-START))s …"; sleep 3
done
