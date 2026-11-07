#!/usr/bin/env bash
# ============================================================
# push-web.sh —— 网页版打磨轮统一推送链（幂等，每轮必跑）
# 用法：bash scripts/push-web.sh "本轮提交信息"
#
# 链路：未提交改动 → 本地提交 → sync-github.sh 白名单快照推远端 main
#       → GitHub Actions（deploy.yml）自动静态导出 → 推 gh-pages → Pages 上线
# 特性：
#   · 工作区干净时跳过提交不造空提交；远端零差时 sync 报 SYNC_SKIP 幂等退出
#   · 推送后回查最近 3 次 CI 运行状态（公开仓库 API 免认证）
#   · CI 失败即下一轮最高优先修复项（export-static 是发布门禁）
# ============================================================
set -eu
cd "$(dirname "$0")/.."
MSG="${1:-web polish: styling & feature iteration}"

# ---- 0) 凭证自愈（沙箱回收会吞 ~/.git-credentials，缺失则提示人工恢复） ----
if [ ! -s "$HOME/.git-credentials" ]; then
  echo "[PUSH-WEB] ⚠️ ~/.git-credentials 缺失——按 worklog/任务卡片中的凭证恢复协议重写后重试" >&2
  exit 1
fi

# ---- 1) 未提交改动 → 提交 ----
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -qm "$MSG"
  echo "[PUSH-WEB] 本地提交：$MSG"
else
  echo "[PUSH-WEB] 工作区干净，跳过提交"
fi

# ---- 2) 白名单快照推远端 main（幂等） ----
bash scripts/sync-github.sh

# ---- 3) CI 状态回查（最近 3 次） ----
echo "[PUSH-WEB] 最新 CI 运行状态："
curl -fsSL --retry 3 --max-time 30 \
  "https://api.github.com/repos/yylsszx/pixel-world-box/actions/runs?per_page=3" 2>/dev/null | \
  python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    runs = d.get('workflow_runs', [])[:3]
    if not runs:
        print('  （暂无运行记录）')
    for r in runs:
        print(f\"  {r['created_at']} {r['status']}/{r.get('conclusion')} — {r['head_branch']}@{r['head_sha'][:7]}\")
except Exception as e:
    print('  API 查询失败（网络瞬断可忽略，重试即愈）：', e)
" || echo "  （API 不可达——CI 仍在跑，可下轮复查）"
echo "[PUSH-WEB] 完成。CI 将自动构建并更新 https://yylsszx.github.io/pixel-world-box/ （约 2-4 分钟）"
