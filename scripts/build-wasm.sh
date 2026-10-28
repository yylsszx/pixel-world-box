#!/usr/bin/env bash
# Task 130：wbcore.wasm 重建管线（rustup 工具链恢复后首次重建）
# 用法：bash scripts/build-wasm.sh
set -uo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
cd /home/z/my-project/rust-core || exit 1

echo "[1/4] cargo build --release --target wasm32-unknown-unknown"
cargo build --release --target wasm32-unknown-unknown 2>&1 | tail -15
BUILD=${PIPESTATUS[0]}
if [ "$BUILD" != "0" ]; then
  echo "[FAIL] cargo build exit=$BUILD"
  exit 1
fi

SRC="target/wasm32-unknown-unknown/release/wbcore.wasm"
if [ ! -f "$SRC" ]; then
  echo "[FAIL] 产物缺失：$SRC"
  exit 1
fi

echo "[2/4] 产物尺寸对比"
ls -la "$SRC"
ls -la /home/z/my-project/public/wasm/wbcore.wasm

echo "[3/4] 部署 → public/wasm/wbcore.wasm"
cp "$SRC" /home/z/my-project/public/wasm/wbcore.wasm

echo "[4/4] 版本导出自检（需 wasm-tools/xxd 抽查 magic）"
head -c 8 "$SRC" | od -A x -t x1 | head -1
echo "[OK] wbcore.wasm 重建并部署完成"
