#!/usr/bin/env bash
# sync-github.sh —— staging 白名单组装推送（幂等/禁 force/TLS 瞬断重试即愈）
# 机制：远端 main 为白名单组装提交线（deploy-bot「update」快照流），与本地 main 无共同祖先——
# 推送 = 临时克隆远端 + git archive(HEAD) 白名单拷贝 + 快照提交 + fast-forward push。
# 本地 git 身份/凭证不参与远端线（deploy-bot 恒定署名）；凭证走 credential.helper=store。
set -u
cd "$(dirname "$0")/.."
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
STAGE=/tmp/pwb-push-stage
CLONE_OK=0
for i in 1 2 3; do
  rm -rf "$STAGE"
  if timeout 150 git clone --single-branch --branch main https://github.com/yylsszx/pixel-world-box "$STAGE" 2>/tmp/sync-clone.err; then CLONE_OK=1; break; fi
  echo "clone retry $i: $(tail -1 /tmp/sync-clone.err)"; sleep 8
done
if [ "$CLONE_OK" != "1" ]; then echo "SYNC_FAIL: clone 三连败"; exit 1; fi
git archive --format=tar -o /tmp/pwb-head.tar HEAD
tar -xf /tmp/pwb-head.tar -C "$STAGE"
cd "$STAGE"
git config user.name "deploy-bot"; git config user.email "deploy@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then echo "SYNC_SKIP: 白名单零差（幂等跳过）"; exit 0; fi

# ---- 回退防护闸（2026-11-10 #71 事故增设）----
# 事故形态：本地克隆过期 → 推送时用陈旧整树覆盖远端新成果（曾 -2584/+342 静默回退 23 轮成果）。
# 拦截：staged 净删除 >400 行且删除>新增时中止并打印 Top 回退文件；确属有意删除需 PWB_ALLOW_REVERT=1。
GUARD_INS=$(git diff --cached --numstat | awk '{s+=$1} END {print s+0}')
GUARD_DEL=$(git diff --cached --numstat | awk '{s+=$2} END {print s+0}')
if [ "$GUARD_DEL" -gt 400 ] && [ "$GUARD_DEL" -gt "$GUARD_INS" ] && [ "${PWB_ALLOW_REVERT:-0}" != "1" ]; then
  echo "SYNC_REVERT_GUARD: 疑似回退事故，已中止推送（新增 $GUARD_INS 行 / 删除 $GUARD_DEL 行）——本地克隆可能落后于远端，请先 git fetch 并合流远端新成果。"
  echo "  Top 回退文件（-删除/+新增）："
  git diff --cached --numstat | sort -t$'\t' -k2,2rn | head -8 | awk -F'\t' '{print "  -"$3"  -"$2"/+"$1}'
  echo "  确认有意为之请携 PWB_ALLOW_REVERT=1 重跑本脚本。"
  exit 1
fi
git commit -q -m "update $TS"
PUSH_OK=0
for i in 1 2 3; do
  if timeout 150 git push origin main 2>/tmp/sync-push.err; then PUSH_OK=1; break; fi
  echo "push retry $i: $(tail -1 /tmp/sync-push.err)"; sleep 8
done
if [ "$PUSH_OK" != "1" ]; then echo "SYNC_FAIL: push 三连败（本地提交在库，下轮自愈续推）"; exit 1; fi
echo "SYNC_OK: $(git rev-parse --short HEAD) → origin/main（白名单 $(git diff --name-only HEAD~1 HEAD | wc -l) 文件）"
