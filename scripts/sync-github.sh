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
git commit -q -m "update $TS"
PUSH_OK=0
for i in 1 2 3; do
  if timeout 150 git push origin main 2>/tmp/sync-push.err; then PUSH_OK=1; break; fi
  echo "push retry $i: $(tail -1 /tmp/sync-push.err)"; sleep 8
done
if [ "$PUSH_OK" != "1" ]; then echo "SYNC_FAIL: push 三连败（本地提交在库，下轮自愈续推）"; exit 1; fi
echo "SYNC_OK: $(git rev-parse --short HEAD) → origin/main（白名单 $(git diff --name-only HEAD~1 HEAD | wc -l) 文件）"
