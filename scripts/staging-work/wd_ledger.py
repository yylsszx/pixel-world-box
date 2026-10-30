#!/usr/bin/env python3
# M-U7g: UNITY_MIGRATION.md 台账追加 M-U7g 行
import io
p = '/tmp/gh-repo-staging/docs/UNITY_MIGRATION.md'
src = io.open(p, encoding='utf-8').read()
lines = src.split('\n')
# M-U7f' 行后插入
idx = next(i for i, l in enumerate(lines) if l.startswith('| M-U7f\' |'))
row = """| M-U7g | 集成 g（水深分级域 + 宿主真地形落位·演示地形退役）：**engine.ts L1011-1050 宿主接力机械翻译**——WbWorldgen.LandForDepth（L1011-1013 冰面视作水面/岩浆视作海岸）+ WaterTierAt（L1016-1036 WATER 0 浅礁/1 近岸/2 开阔 外环切比雪夫 r=1..3 只查外环找陆→r-1；DEEP 邻普通水=3 陆架/否则 4 深渊）+ RebuildWaterTiers（L1048-1050 全量重算）；域形态 = Engine 实例方法 → terrain byte[] 参数化（同 WbOverlay/WbMinimap 宿主接力例）+ **WbGameHost 真地形落位**（ApplyWorldGen：GenerateWorld→St.terrain/St.variant Array.Copy（蓝本 generate L776-777）+ RebuildWaterTiers（L949 同构）；temp/moist L778-779 渲染域不消费不暂存；**演示 value-noise 占位 GenDemoTerrain 退役删除**——域口径 pre-river：蓝本 generate L939 seedRivers 刻河属 nature.ts 未译域，河网切片落位时宿主须刻河后重算；spawnAnimals→spawnUnit（L936）留 unitsTick 切片）+ 黄金 gen-waterdepth.mjs 4 场景 20.2KB（S1 宿主种子 20261029/S2 42/S3 987654/S4 群群岛 seaBias 0.15；**双层自洽：eng.waterTier≡waterTierAt 全索引（引擎内部完整面）+ eng.terrain 换装 pre-river 真方法直调≡原型借用调用（调用面等价）**；值域 ⊆0..4+0/2/3/4 全场景必现分布 sanity；det 子进程双跑 md5 712deab2；gzB64 双写 golden/+StreamingAssets）+ waterdepth-transcript.mjs 零引擎导入镜像 4/4 全 PASS（40960 格逐位 ×4）+ verify 段 28（回放+gen det 复跑+分布台账+双写 md5）+ NUnit Test27（terrain 逐字节与 Test26 worldgen 链交叉锁定 → RebuildWaterTiers 逐位 → 分布断言） | engine.ts L1011-1050 + generate L771-952 衔接 | ✅ 本轮 |"""
lines.insert(idx + 1, row)
io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('OK ledger M-U7g row at line', idx + 2)
