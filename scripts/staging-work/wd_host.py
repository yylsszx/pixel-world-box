#!/usr/bin/env python3
# M-U7g: WbGameHost.cs 演示地形退役 → WbWorldgen 真地形落位
import io
p = '/tmp/gh-repo-staging/unity/pixel-world-box/Assets/Scripts/Host/WbGameHost.cs'
src = io.open(p, encoding='utf-8').read()

# ① 头注更新（演示地形条目 → 真地形落位）
old_h = """// 演示地形（宿主域标注）：noise.ts 地形生成链未译（独立切片）——本壳用确定性 value-noise 占位
//   （两八度 + 阈值映射 12 地形），仅保证 Unity 可跑验收与渲染链视觉验证，非蓝本不进对账面。"""
new_h = """// 真地形落位（M-U7g）：WbWorldgen.GenerateWorld（M-U7f' 黄金链）直灌 + WbWorldgen.RebuildWaterTiers
//   （水深域 L1011-1050 机械翻译，黄金 waterdepth.json 4 场景 + 镜像 4/4 + Test27）——演示 value-noise
//   占位退役。域口径：pre-river（蓝本 generate L939 seedRivers 刻河属 nature.ts 未译域，河网切片落位
//   时宿主须刻河后重算水深）；gen.spawnAnimals → spawnUnit（L936）留 unitsTick 切片接线。"""
assert src.count(old_h) == 1, 'H %d' % src.count(old_h)
src = src.replace(old_h, new_h)

# ② seed 字段注记
old_seed = "        public uint seed = 20261029;                  // 演示地形种子（宿主域）"
new_seed = "        public uint seed = 20261029;                  // worldgen 种子（蓝本 generate(seed) 域——gen-waterdepth S1 同源）"
assert src.count(old_seed) == 1, 'SEED %d' % src.count(old_seed)
src = src.replace(old_seed, new_seed)

# ③ NewWorld：GenDemoTerrain → ApplyWorldGen（蓝本 generate() L775-779 + L949 衔接同构）
old_nw = """            for (int i = 0; i < St.owner.Length; i++) St.owner[i] = -1;
            GenDemoTerrain();"""
new_nw = """            for (int i = 0; i < St.owner.Length; i++) St.owner[i] = -1;
            ApplyWorldGen();"""
assert src.count(old_nw) == 1, 'NW %d' % src.count(old_nw)
src = src.replace(old_nw, new_nw)

# ④ 方法注记
old_doc = "        /// <summary>世界构建 + 演示地形（noise.ts 切片前的宿主占位——确定性可复现）</summary>"
new_doc = "        /// <summary>世界构建 + 真地形落位（M-U7g：GenerateWorld + 水深全量重算；蓝本 generate L771-952 宿主等价）</summary>"
assert src.count(old_doc) == 1, 'DOC %d' % src.count(old_doc)
src = src.replace(old_doc, new_doc)

# ⑤ 演示地形方法体退役 → 真地形装配
old_gen = src[src.index('        // ---------------- 演示地形'):src.index('    }\n}') ]
new_gen = """        // ---------------- 真地形落位（M-U7g：WbWorldgen 黄金链直灌；蓝本 generate L775-779/L949 同构） ----------------
        void ApplyWorldGen()
        {
            WbWorldGenResult gen = PixelWorldBox.Wb.WbWorldgen.GenerateWorld(unchecked((int)seed));
            System.Array.Copy(gen.Terrain, St.terrain, St.terrain.Length);   // L776 this.terrain = gen.terrain
            System.Array.Copy(gen.Variant, St.variant, St.variant.Length);   // L777 this.variant = gen.variant
            // temp/moist（L778-779）渲染域不消费——overlay 温湿图自有黄金链直灌，宿主不暂存
            PixelWorldBox.Wb.WbWorldgen.RebuildWaterTiers(St.terrain, St.waterTier);   // L949 rebuildWaterTiers（pre-river 域）
            // gen.SpawnAnimals → spawnUnit（L936）留 unitsTick 切片（unitsTick 主体未译——M-U7 余量）
        }
"""
src = src.replace(old_gen, new_gen)
io.open(p, 'w', encoding='utf-8').write(src)
print('OK WbGameHost rewired, lines now:', len(io.open(p, encoding='utf-8').readlines()))
