#!/usr/bin/env python3
# inject-repro.py —— M-U16：RStats 41 族 repro 列注入（types.ts L157-197 逐行机械对位；字段只加）
import io, re, sys

REPRO = [
    ("人类", 0.006), ("精灵", 0.005), ("矮人", 0.005), ("兽人", 0.006), ("强盗", 0.0006),
    ("僵尸", 0.0), ("绵羊", 0.004), ("狼", 0.004), ("熊", 0.002), ("巨龙", 0.0),
    ("鹿", 0.003), ("企鹅", 0.004), ("骆驼", 0.002), ("蝎子", 0.005), ("蛇", 0.0035),
    ("雪狼", 0.004), ("骷髅", 0.0), ("恶魔", 0.0), ("法师", 0.0), ("蜥蜴人", 0.0058),
    ("哥布林", 0.0092), ("巨魔", 0.0), ("食人魔", 0.0), ("白行者", 0.0), ("吸血鬼", 0.0),
    ("克拉肯", 0.0), ("沙虫", 0.0), ("蛇怪", 0.0), ("天使", 0.0), ("凤凰", 0.0),
    ("树人", 0.0), ("巫妖", 0.0), ("九头蛇", 0.0), ("鸡", 0.011), ("猪", 0.008),
    ("兔", 0.014), ("狐", 0.004), ("鱼", 0.016), ("蟹", 0.007), ("龟", 0.003),
    ("鲨鱼", 0.002),
]

PATH = "/home/z/my-project/unity/pixel-world-box/Assets/Scripts/Wb/WbBail.cs"
src = io.open(PATH, encoding="utf-8").read()

# 定位 RStats 数组体
start = src.index("public static readonly RaceStat[] RStats = new RaceStat[41]")
end = src.index("};", start)
body = src[start:end]

lines = body.split("\n")
out = []
injected = 0
entry_idx = 0
for ln in lines:
    if "new RaceStat{ name=" in ln and "repro = " not in ln:
        if entry_idx >= len(REPRO):
            sys.exit(f"RStats 条目多于 41：idx={entry_idx}")
        name, val = REPRO[entry_idx]
        if f'name="{name}"' not in ln:
            sys.exit(f"序失配 idx={entry_idx}: 期望 {name}，行内: {ln.strip()[:60]}")
        vs = ("0" if val == 0 else repr(val))
        # 条目行可带尾注释（// L157 HUMAN）—— 在最后一个 '}' 前插入 repro
        idx = ln.rfind("}")
        assert idx > 0, ln[-40:]
        head = ln[:idx].rstrip()
        if head.endswith(","):
            head = head[:-1]
        ln = head + ", repro = " + vs + " " + ln[idx:]
        injected += 1
        entry_idx += 1
    out.append(ln)

if injected != 41:
    sys.exit(f"注入数 {injected} ≠ 41")
src = src[:start] + "\n".join(out) + src[end:]
io.open(PATH, "w", encoding="utf-8").write(src)
print(f"OK: 41 条 repro 注入完毕（首条 {REPRO[0]}，末条 {REPRO[-1]}）")
