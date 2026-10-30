#!/usr/bin/env python3
# M-U7g: 向 staging WbWorldgen.cs 追加水深段（机械翻译 engine.ts L1011-1050）
import io
p = '/tmp/gh-repo-staging/unity/pixel-world-box/Assets/Scripts/Wb/WbWorldgen.cs'
src = io.open(p, encoding='utf-8').read()
anchor = """            return new WbWorldGenResult { Terrain = terrain, Variant = variant, Temp = temp, Moist = moist, SpawnAnimals = spawnAnimals };
        }
    }
}"""
assert src.count(anchor) == 1, 'anchor not unique: %d' % src.count(anchor)
block = """            return new WbWorldGenResult { Terrain = terrain, Variant = variant, Temp = temp, Moist = moist, SpawnAnimals = spawnAnimals };
        }

        // ================= 水深分级域（M-U7g：engine.ts L1011-1050 宿主接力机械翻译） =================
        // 蓝本为 Engine 实例方法（this.terrain 消费）——C# 宿主域等价 = terrain byte[] 参数化
        // （同 WbOverlay/WbMinimap 域函数形态）。消费序锚：蓝本 generate() L775 generateWorld →
        // L936 spawnAnimals → L939 nature.seedRivers（刻河，nature.ts 未译域）→ L949 rebuildWaterTiers
        // ——本域黄金锚定 pre-river（gen-waterdepth.mjs 4 场景，waterTierAt 真方法直调）；
        // 河网切片落位时宿主接线须刻河后再 RebuildWaterTiers。
        // 验证链：golden/waterdepth.json → waterdepth-transcript.mjs 镜像 4/4 → NUnit Test27。

        // 蓝本 landForDepth（L1011-1013）：地形是否为「陆地」（水深计算用：冰面视作水面、岩浆视作海岸）
        public static bool LandForDepth(byte t)
        {
            return t != WbConstants.T_DEEP && t != WbConstants.T_WATER && t != WbConstants.T_ICE;
        }

        // 蓝本 waterTierAt（L1016-1036）：单水格水深分级（WATER: 0 浅礁/1 近岸/2 开阔；DEEP: 3 陆架/4 深渊）
        public static byte WaterTierAt(byte[] terrain, int i)
        {
            int W = WbConstants.W, H = WbConstants.H;
            byte t = terrain[i];
            int x = i % W;
            int y = i / W;   // JS (i/W)|0——i 非负整除同构
            if (t == WbConstants.T_DEEP)
            {
                for (int dy = -1; dy <= 1; dy++)
                {
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        int xx = x + dx, yy = y + dy;
                        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                        if (terrain[yy * W + xx] == WbConstants.T_WATER) return 3;   // 邻普通水 = 陆架
                    }
                }
                return 4;   // 深渊
            }
            if (t != WbConstants.T_WATER) return 0;
            // 普通水：切比雪夫距离 1/2/3 内有陆地 → 浅礁/近岸/开阔
            for (int r = 1; r <= 3; r++)
            {
                bool land = false;
                for (int dy = -r; dy <= r && !land; dy++)
                {
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (Math.Max(Math.Abs(dx), Math.Abs(dy)) != r) continue;   // 只查外环
                        int xx = x + dx, yy = y + dy;
                        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                        if (LandForDepth(terrain[yy * W + xx])) { land = true; break; }
                    }
                }
                if (land) return (byte)(r - 1);
            }
            return 2;
        }

        // 蓝本 rebuildWaterTiers（L1048-1050）：全量重算水深场（generate 时一次性）
        public static void RebuildWaterTiers(byte[] terrain, byte[] waterTier)
        {
            for (int i = 0; i < terrain.Length; i++) waterTier[i] = WaterTierAt(terrain, i);
        }
    }
}"""
io.open(p, 'w', encoding='utf-8').write(src.replace(anchor, block))
print('OK WbWorldgen.cs waterdepth section appended, lines now:', len(io.open(p, encoding='utf-8').readlines()))
