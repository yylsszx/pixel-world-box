#!/bin/bash
# ============================================================
# Task 78：一键 GitHub Pages 部署
# 用法:  bash .zscripts/push-github.sh <用户名> <token> [仓库名]
# 前置:  GitHub Personal Access Token（classic，repo 权限）
# 产物:  https://<用户名>.github.io/<仓库名>/
#
# 流程:
#   1. 组装源码仓（白名单 + 全新历史，~5MB，不含沙箱内部状态）
#   2. GitHub API 建远端仓库（已存在则复用）
#   3. 推 main 分支（源码永久备份 + 可重建）
#   4. 静态导出 out/（export-static.sh，basePath=/仓库名）
#   5. 推 gh-pages 分支（纯静态产物 + .nojekyll）
#   6. GitHub API 开启 Pages（source=gh-pages:/）
#   7. 探活直到 200（GitHub Pages 首次构建 ~1-2 分钟）
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

GH_USER="${1:?用法: push-github.sh <GitHub用户名> <token> [仓库名]}"
GH_TOKEN="${2:?缺少 token（第 2 参数）}"
REPO="${3:-pixel-world-box}"
BASE_PATH="/$REPO"
API="https://api.github.com"
AUTH="Authorization: token $GH_TOKEN"
STAGING="/tmp/gh-repo-staging"
PAGES_DIR="/tmp/gh-pages-staging"
URL="https://$GH_USER.github.io/$REPO/"

echo "==> [1/7] 组装源码仓（白名单，全新历史）"
rm -rf "$STAGING"
mkdir -p "$STAGING/.zscripts"
# 源码与配置
for item in src public prisma rust-core README-GITHUB.md package.json bun.lock tsconfig.json tailwind.config.ts postcss.config.mjs components.json eslint.config.mjs next-env.d.ts next.config.ts; do
  [ -e "$item" ] && cp -r "$item" "$STAGING/"
done
# 只带走静态导出脚本（其余 .zscripts 是沙箱部署链，外部无意义）
cp .zscripts/export-static.sh "$STAGING/.zscripts/"
# lockfile 换回官方 registry（沙箱镜像源是区域加速；国际仓库用 npmjs，路径一致直接换域名）
sed -i 's#registry\.npmmirror\.com#registry.npmjs.com#g' "$STAGING/bun.lock"
# README（带真实游玩地址）
sed "s|__SITE_URL__|$URL|g; s|__REPO__|$REPO|g" README-GITHUB.md > "$STAGING/README.md"
rm -f "$STAGING/README-GITHUB.md"
# 沙箱内部产物清理
rm -rf "$STAGING/src/lib/db.ts"   # 孤立脚手架（无引用），静态仓不需要 Prisma

echo "==> [2/7] 创建远端仓库 $GH_USER/$REPO（公开）"
code=$(curl -s -o /tmp/gh-create.json -w "%{http_code}" -X POST -H "$AUTH" \
  -H "Accept: application/vnd.github+json" "$API/user/repos" \
  -d "{\"name\":\"$REPO\",\"description\":\"Pixel World Box — 像素上帝模拟器（纯前端 WorldBox 复刻：创造世界、播撒文明、降下天灾）\",\"private\":false,\"has_wiki\":false,\"has_projects\":false,\"auto_init\":false}")
if [ "$code" = "201" ]; then
  echo "    仓库已创建"
elif [ "$code" = "422" ]; then
  echo "    仓库已存在，复用"
else
  echo "    FATAL: 建仓失败 HTTP $code"; cat /tmp/gh-create.json; exit 1
fi

echo "==> [3/7] 推 main 分支（源码备份）"
(
  cd "$STAGING"
  git init -q -b main
  git add -A
  git -c user.name="deploy-bot" -c user.email="deploy@users.noreply.github.com" \
    commit -qm "Pixel World Box — static deploy $(date -u +%FT%TZ)"
  git push -q --force "https://$GH_USER:$GH_TOKEN@github.com/$GH_USER/$REPO.git" main
)
echo "    main 已推送"

echo "==> [4/7] 静态导出（basePath=$BASE_PATH）"
bash .zscripts/export-static.sh "$BASE_PATH"

echo "==> [5/7] 推 gh-pages 分支（静态产物）"
rm -rf "$PAGES_DIR"
mkdir -p "$PAGES_DIR"
cp -r out/. "$PAGES_DIR/"
touch "$PAGES_DIR/.nojekyll"
(
  cd "$PAGES_DIR"
  git init -q -b gh-pages
  git add -A
  git -c user.name="deploy-bot" -c user.email="deploy@users.noreply.github.com" \
    commit -qm "static export $(date -u +%FT%TZ)"
  git push -q --force "https://$GH_USER:$GH_TOKEN@github.com/$GH_USER/$REPO.git" gh-pages
)
echo "    gh-pages 已推送"

echo "==> [6/7] 开启 GitHub Pages（source: gh-pages 分支根目录）"
# 幂等：已开启则先关再开（防止此前配置成 GitHub Actions 源）
curl -sf -X DELETE -H "$AUTH" "$API/repos/$GH_USER/$REPO/pages" >/dev/null 2>&1 || true
sleep 2
code=$(curl -s -o /tmp/gh-pages.json -w "%{http_code}" -X POST -H "$AUTH" \
  -H "Accept: application/vnd.github+json" "$API/repos/$GH_USER/$REPO/pages" \
  -d '{"source":{"branch":"gh-pages","path":"/"}}')
if [ "$code" = "201" ] || [ "$code" = "202" ]; then
  echo "    Pages 已开启"
else
  echo "    Pages API 返回 HTTP $code（可能已开启，继续探活）"; cat /tmp/gh-pages.json || true
fi

echo "==> [7/7] 探活 $URL （GitHub Pages 首次构建约 1-2 分钟）"
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL" || echo 000)
  if [ "$code" = "200" ]; then
    echo ""
    echo "=============================================="
    echo "  ✅ 部署成功，永久网址："
    echo "  $URL"
    echo "  仓库：https://github.com/$GH_USER/$REPO"
    echo "=============================================="
    exit 0
  fi
  echo "    [$i/40] HTTP $code — 15s 后重试 …"
  sleep 15
done
echo "⚠️  探活超时（GitHub Pages 偶发慢启动）。请 2 分钟后手动访问：$URL"
exit 1
