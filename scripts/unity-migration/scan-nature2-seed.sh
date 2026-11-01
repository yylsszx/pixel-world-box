#!/bin/bash
# scan-nature2-seed.sh —— M-U18 概率门场景种子标定（bun 真引擎逐试，sanity 过即录）
# 用法: bash scan-nature2-seed.sh [起始增量]
cd /home/z/my-project
OFF=${1:-0}
declare -A SEEDS
try() {  # try <key> <seedhex>
  local key=$1 seed=$2 envkey=$(echo "$1" | tr -d '-')
  env "N2_ONLY=$key" "N2_SEED_${envkey}=$seed" bun scripts/unity-migration/gen-nature2.mjs >/dev/null 2>&1
}
scan() { # scan <key> <basehex> [max]
  local key=$1 base=$2 max=${3:-80}
  if [ -n "${SEEDS[$key]}" ]; then echo "SKIP $key (已有 ${SEEDS[$key]})"; return; fi
  for ((k=0; k<max; k++)); do
    s=$(printf '0x%08X' $((base + k)))
    if try "$key" "$s"; then SEEDS[$key]=$s; echo "HIT $key $s (k=$k)"; return; fi
  done
  echo "MISS $key (${max} 试尽)"
}
scan bolt-day       0x0E2A0501
scan bolt-winter    0x0E2A0601
scan sky-family     0x0E2A0701
scan pressure-cycle 0x0E2A0801
scan storm-cyclone  0x0E2A0901
scan storm-blizzard 0x0E2A1001
scan blizzard-spawn 0x0E2A1601
scan storm-ravage   0x0E2A1101
scan drought-sand   0x0E2A1201
scan hydro-rivers   0x0E2A1301
echo "==== 汇总 ===="
for k in "${!SEEDS[@]}"; do echo "$k=${SEEDS[$k]}"; done
