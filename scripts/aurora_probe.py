#!/usr/bin/env python3
"""极光可视性探针：对比北光帘带内/带外的 G 通道异常（绿加性合成应在带内抬升 G-R 差）"""
from PIL import Image

img = Image.open('/home/z/my-project/download/aurora-north3.png').convert('RGB')
# 屏幕坐标：map 顶 ~190，北带 tiles 11-23 × zoom7 → screen 267-351
# 取左侧远洋区（无地形干扰）：x 70-380
def rowstat(y0, y1, x0=70, x1=380):
    gr_sum = 0
    n = 0
    for y in range(y0, y1, 2):
        for x in range(x0, x1, 4):
            r, g, b = img.getpixel((x, y))
            gr_sum += (g - r)
            n += 1
    return gr_sum / max(n, 1)

band = rowstat(270, 350)      # 极光带内
above = rowstat(200, 260)     # 带上方（tiles 1.4-10）
below = rowstat(360, 430)     # 带下方（tiles 24-34）
print(f"G-R band={band:.2f} above={above:.2f} below={below:.2f}")

# 垂直剖面：每 10px 行的 G-R 均值（看是否有带状隆起）
for y in range(195, 450, 15):
    print(f"y={y} tiles~{(y-190)/7:.1f} G-R={rowstat(y, y+8):.2f}")
