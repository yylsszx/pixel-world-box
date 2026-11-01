#!/usr/bin/env python3
# M-U17 译件索引丢失修复补丁——单字母 [h]/[z] 索引模式重建
import io, re

P = '/home/z/my-project/unity/pixel-world-box/Assets/Scripts/Wb/WbBail.cs'
s = io.open(P, encoding='utf-8').read()

# 通用修复：w.hotHeat] → w.hotHeat[h]（L815 热点增压面）
s = s.replace('w.hotHeat] = System.Math.Min(3.0, w.hotHeat] + 0.09 + (double)w.stress[w.hotY] * WbWorld.W + w.hotX]] * 0.008)',
              'w.hotHeat[HIDX] = System.Math.Min(3.0, w.hotHeat[HIDX] + 0.09 + (double)w.stress[w.hotY[HIDX] * WbWorld.W + w.hotX[HIDX]] * 0.008)'.replace('HIDX', '[h]'))
# L992 pw 面
s = s.replace('((double)w.stress[w.hotY] * WbWorld.W + w.hotX]] > 14.0)',
              '((double)w.stress[w.hotY[HIDX] * WbWorld.W + w.hotX[HIDX]] > 14.0)'.replace('HIDX', '[h]'))
# L1016 普林尼
s = s.replace('灰云开始随风漂散", w.hotX], w.hotY]);',
              '灰云开始随风漂散", null, w.hotX[HIDX], w.hotY[HIDX]);'.replace('HIDX', '[h]'))
# hotY[h] 残余面（若有）
s = s.replace('w.hotY] * WbWorld.W + w.hotX]]', 'w.hotY[HIDX] * WbWorld.W + w.hotX[HIDX]]'.replace('HIDX', '[h]'))

io.open(P, 'w', encoding='utf-8').write(s)

# 验证
s2 = io.open(P, encoding='utf-8').read()
bad = re.findall(r'w\.hot[XY]\](?!\[)', s2)
bad2 = re.findall(r'w\.hotHeat\](?!\[)', s2)
print('残余 hotX/Y ] 异常:', len(bad), ' hotHeat ] 异常:', len(bad2))
print('hotX[h] 正常计数:', s2.count('w.hotX[h]'), ' hotY[h]:', s2.count('w.hotY[h]'), ' hotHeat[h]:', s2.count('w.hotHeat[h]'))
