// PWB Unity Port — Map/TileDefs.cs (U1)
// 逐 tile 调色(供 U4 MapRenderer 直绘纹理调用):基础色(TerrainInfo.Rgb = constants.ts TERRAIN_RGB)
// + 确定性哈希变体(±6);Water 4 帧波光(亮带随帧移位);Water/Deep 近岸分层
// (WATER_TIER_RGB / DEEP_TIER_RGB,constants.ts 47-55 行);Sand 邻水湿暗;Forest 深绿树冠;
// Swamp 芦苇亮点;Mountain 裂纹;Ice 闪晶;Burnt 暗点;Lava 帧动画亮斑。热路径零分配、无分支字符串。
using UnityEngine;

namespace PWB.Map
{
    public static class TileDefs
    {
        /// <summary>tile 调色主入口。t=地形,w=世界(邻域查询用),x/y=tile 坐标,frame=水/岩浆动画帧 0-3。</summary>
        public static Color32 TileColor(PWB.Core.Terrain t, PWB.Core.World w, int x, int y, int frame)
        {
            int dv = (int)(NoiseUtil.Hash01(x, y, 1234) * 13f) - 6; // 确定性变体 -6..+6
            int r, g, b;
            switch (t)
            {
                case PWB.Core.Terrain.Deep:
                    {
                        // 深蓝分层:邻普通水 → 陆架色(43,87,133);否则深渊两色按哈希(30,58,102 / 31,62,107)
                        if (NeighborIs(w, x, y, PWB.Core.Terrain.Water)) { r = 43; g = 87; b = 133; }
                        else if (NoiseUtil.Hash01(x, y, 77) < 0.5f) { r = 30; g = 58; b = 102; }
                        else { r = 31; g = 62; b = 107; }
                        break;
                    }
                case PWB.Core.Terrain.Water:
                    {
                        // 三级近岸分层(WATER_TIER_RGB):邻陆浅礁 / 对角近岸 / 开阔海域
                        bool reef = NeighborLand(w, x, y);
                        bool near = reef || DiagonalLand(w, x, y);
                        if (reef) { r = 106; g = 194; b = 182; }
                        else if (near) { r = 79; g = 149; b = 171; }
                        else { r = 56; g = 113; b = 163; }
                        // 4 帧波光:亮带位置随帧移位(确定性,无状态)
                        if (((x + y * 3 + frame * 5) & 31) < 2) { r += 14; g += 16; b += 12; }
                        break;
                    }
                case PWB.Core.Terrain.Sand:
                    {
                        r = 222; g = 203; b = 141;
                        if (NeighborWater(w, x, y)) { r -= 18; g -= 20; b -= 14; } // 邻水湿沙变暗
                        break;
                    }
                case PWB.Core.Terrain.Grass:
                    {
                        r = 104; g = 152; b = 60;
                        if (NoiseUtil.Hash01(x, y, 66) < 0.12f) g += 10; // 草叶亮点
                        break;
                    }
                case PWB.Core.Terrain.Forest:
                    {
                        // 草底 + 深绿冠:哈希树冠覆盖约 45% 像素
                        if (NoiseUtil.Hash01(x, y, 88) < 0.45f) { r = 52; g = 92; b = 38; }
                        else { r = 72; g = 116; b = 50; }
                        break;
                    }
                case PWB.Core.Terrain.Hill:
                    {
                        r = 130; g = 137; b = 96;
                        if (NoiseUtil.Hash01(x, y, 99) < 0.2f) { r -= 14; g -= 14; b -= 10; } // 山脊纹
                        break;
                    }
                case PWB.Core.Terrain.Mountain:
                    {
                        r = 122; g = 122; b = 126;
                        float h = NoiseUtil.Hash01(x, y, 111);
                        if (h < 0.18f) { r -= 24; g -= 24; b -= 26; }        // 裂纹暗缝
                        else if (h > 0.93f) { r += 14; g += 14; b += 16; }   // 峰棱高光
                        break;
                    }
                case PWB.Core.Terrain.Snow:
                    {
                        r = 228; g = 235; b = 240;
                        if (NoiseUtil.Hash01(x, y, 122) < 0.12f) { r += 8; g += 6; b += 4; }
                        break;
                    }
                case PWB.Core.Terrain.Lava:
                    {
                        r = 235; g = 90; b = 30;
                        float h = NoiseUtil.Hash01(x, y, 133);
                        if (h < 0.25f) { r -= 40; g -= 30; b -= 16; }                     // 冷凝壳
                        else if (((x * 7 + y * 3 + frame * 9) & 15) < 2) { r += 20; g += 24; b += 12; } // 流动亮斑
                        break;
                    }
                case PWB.Core.Terrain.Burnt:
                    {
                        r = 66; g = 58; b = 51;
                        if (NoiseUtil.Hash01(x, y, 144) < 0.3f) { r -= 10; g -= 10; b -= 9; } // 灰烬暗点
                        break;
                    }
                case PWB.Core.Terrain.Ice:
                    {
                        r = 172; g = 210; b = 228;
                        float h = NoiseUtil.Hash01(x, y, 155);
                        if (h < 0.12f) { r += 18; g += 16; b += 12; }       // 闪晶
                        else if (h < 0.27f) { r -= 12; g -= 14; b -= 16; }  // 冰纹裂隙
                        break;
                    }
                case PWB.Core.Terrain.Swamp:
                    {
                        r = 88; g = 96; b = 50;
                        float h = NoiseUtil.Hash01(x, y, 166);
                        if (h < 0.15f) { g += 20; b -= 4; }                 // 芦苇亮点
                        else if (h > 0.75f) { r -= 8; g -= 6; }             // 浑浊泥斑
                        break;
                    }
                default:
                    r = 31; g = 62; b = 107; // 兜底:深海
                    break;
            }
            return new Color32(Clamp8(r + dv), Clamp8(g + dv), Clamp8(b + dv), 255);
        }

        private static byte Clamp8(int v)
        {
            if (v < 0) return 0;
            if (v > 255) return 255;
            return (byte)v;
        }

        /// <summary>4 向邻格中是否存在指定地形。</summary>
        private static bool NeighborIs(PWB.Core.World w, int x, int y, PWB.Core.Terrain t)
        {
            const int W = PWB.Core.World.W, H = PWB.Core.World.H;
            byte want = (byte)t;
            return (x > 0 && w.terrain[y * W + x - 1] == want)
                || (x < W - 1 && w.terrain[y * W + x + 1] == want)
                || (y > 0 && w.terrain[(y - 1) * W + x] == want)
                || (y < H - 1 && w.terrain[(y + 1) * W + x] == want);
        }

        private static bool NeighborWater(PWB.Core.World w, int x, int y)
        {
            return NeighborIs(w, x, y, PWB.Core.Terrain.Water) || NeighborIs(w, x, y, PWB.Core.Terrain.Deep);
        }

        /// <summary>4 向邻陆(浅礁判定)。</summary>
        private static bool NeighborLand(PWB.Core.World w, int x, int y)
        {
            return LandAt(w, x - 1, y) || LandAt(w, x + 1, y) || LandAt(w, x, y - 1) || LandAt(w, x, y + 1);
        }

        /// <summary>对角邻陆(近岸判定)。</summary>
        private static bool DiagonalLand(PWB.Core.World w, int x, int y)
        {
            return LandAt(w, x - 1, y - 1) || LandAt(w, x + 1, y - 1) || LandAt(w, x - 1, y + 1) || LandAt(w, x + 1, y + 1);
        }

        private static bool LandAt(PWB.Core.World w, int x, int y)
        {
            if (x < 0 || y < 0 || x >= PWB.Core.World.W || y >= PWB.Core.World.H) return false;
            return PWB.Core.TerrainInfo.IsLand((PWB.Core.Terrain)w.terrain[y * PWB.Core.World.W + x]);
        }
    }
}
