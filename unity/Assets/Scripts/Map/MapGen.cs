// PWB Unity Port — Map/MapGen.cs (U1)
// 程序化世界生成:移植 src/lib/game/noise.ts(哈希值噪声 + fBm + domain warp)与 worldgen.ts 结构
// (heightAt 域扭曲 fBm + 边缘衰减 + 对比推挤 / 湖泊 / 沼泽 / trySpawn 野生动物),
// 生物群系判定按任务冻结参数(海平面 0.42、Deep<sea-0.08、温=1-|lat|·2-海拔×0.35、湿=第二 fBm、
// 极地圈 y<8||y>=H-8、火山热点 rng<0.002 半径2、河流每 20 列、湖泊 8 个)。
// 六模板:pangaea(-0.06)/archipelago(+0.08)/iceage(温-0.3)/desert(温+0.25 湿-0.3)/jungle(湿+0.3)/classic。
// 注意:C# int 乘法为 mod-2^32 截断,与 JS double 低位舍入在个别输入上可能相差 ——
// 同 seed 在 Unity 内完全确定可重放,但不承诺与 TS 版逐位同图(统计特征一致)。
using UnityEngine;

namespace PWB.Map
{
    using P = PWB.Core; // 别名缩短全限定(不 using 泛型/外部类型)

    /// <summary>噪声工具(移植 noise.ts;internal 同文件伴生)。</summary>
    internal static class NoiseUtil
    {
        // noise.ts hash2(14-19 行):32 位整型哈希 → [0,1)
        public static float Hash01(int x, int y, int seed)
        {
            unchecked
            {
                int h = x * 374761393 + y * 668265263 + seed * 1442695041;
                h = (h ^ (h >> 13)) * 1274126177;
                h = h ^ (h >> 16);
                return (uint)h * (1f / 4294967296f);
            }
        }

        private static float Smooth(float t) { return t * t * (3f - 2f * t); }
        private static float Lerp(float a, float b, float t) { return a + (b - a) * t; }

        // noise.ts valueNoise(25-37 行):2D 值噪声 [0,1]
        public static float ValueNoise(float x, float y, int seed)
        {
            int xi = Mathf.FloorToInt(x);
            int yi = Mathf.FloorToInt(y);
            float xf = x - xi;
            float yf = y - yi;
            float v00 = Hash01(xi, yi, seed);
            float v10 = Hash01(xi + 1, yi, seed);
            float v01 = Hash01(xi, yi + 1, seed);
            float v11 = Hash01(xi + 1, yi + 1, seed);
            float sx = Smooth(xf);
            float sy = Smooth(yf);
            return Lerp(Lerp(v00, v10, sx), Lerp(v01, v11, sx), sy);
        }

        // noise.ts fbm(40-52 行):分形布朗运动 [0,1]
        public static float Fbm(float x, float y, int seed, int octaves, float lacunarity = 2f, float gain = 0.5f)
        {
            float amp = 1f, freq = 1f, sum = 0f, norm = 0f;
            for (int o = 0; o < octaves; o++)
            {
                sum += amp * ValueNoise(x * freq, y * freq, seed + o * 1013);
                norm += amp;
                amp *= gain;
                freq *= lacunarity;
            }
            return sum / norm;
        }
    }

    public static class MapGen
    {
        private const int W = P.World.W, H = P.World.H;
        private const int PolarBand = 8;      // 极地圈:y<8 || y>=H-8
        private const int RiverEvery = 20;    // 每 20 列一条河
        private const int LakeCount = 8;      // 湖泊数
        private const float SeaLevel = 0.42f; // 海平面
        private const float DeepBelow = 0.08f;// 深海线 = sea-0.08

        public static void Generate(P.World w, uint seed, string template)
        {
            // —— 模板参数(worldgen.ts WorldGenParams 语义)——
            float seaBias = 0f, tempBias = 0f, moistBias = 0f;
            switch (template)
            {
                case "pangaea": seaBias = -0.06f; break;       // 盘古:更多陆地
                case "archipelago": seaBias = 0.08f; break;    // 群岛:更多海洋
                case "iceage": tempBias = -0.3f; break;        // 冰河:骤冷
                case "desert": tempBias = 0.25f; moistBias = -0.3f; break; // 沙海
                case "jungle": moistBias = 0.3f; break;        // 雨林
                default: break;                                // classic
            }
            float sea = SeaLevel + seaBias;
            var rand = new P.Rng(seed);
            int n = W * H;
            var hMap = new float[n];
            var moistMap = new float[n];

            // —— Pass1:海拔 + 基础生物群系(判定序照任务冻结)——
            for (int y = 0; y < H; y++)
            {
                for (int x = 0; x < W; x++)
                {
                    int i = y * W + x;
                    float h = HeightAt(x, y, (int)seed, 1f, 0.9f); // warp=1 falloff=0.9(经典缺省)
                    hMap[i] = h;
                    // 温度 = 1 - |纬度|·2 - 海拔×0.35 + 模板偏置
                    float temp = 1f - Mathf.Abs(y / (float)H - 0.5f) * 2f - h * 0.35f + tempBias;
                    // 湿度 = 第二 fBm(worldgen.ts 71 行同源:seed+321 / 36 格频)
                    float moist = Mathf.Clamp01(NoiseUtil.Fbm(x / 36f + 8f, y / 36f + 3f, (int)seed + 321, 4) + moistBias);
                    moistMap[i] = moist;

                    byte t;
                    if (h < sea - DeepBelow) t = (byte)P.Terrain.Deep;
                    else if (h < sea) t = (byte)P.Terrain.Water;
                    else if (temp < 0.2f) t = (byte)P.Terrain.Snow;                 // 寒带
                    else if (temp > 0.75f && moist < 0.3f) t = (byte)P.Terrain.Sand; // 沙漠化
                    else if (moist > 0.65f) t = (byte)P.Terrain.Forest;              // 多雨成林
                    else if (h > 0.75f) t = (byte)P.Terrain.Mountain;
                    else if (h > 0.6f) t = (byte)P.Terrain.Hill;
                    else t = (byte)P.Terrain.Grass;
                    w.terrain[i] = t;
                }
            }

            // —— Pass2:邻水带沙滩(陆地邻 4 向水 → Sand,后续极地圈会覆盖为 Snow/Ice)——
            for (int y = 1; y < H - 1; y++)
            {
                for (int x = 1; x < W - 1; x++)
                {
                    int i = y * W + x;
                    if (!P.TerrainInfo.IsLand((P.Terrain)w.terrain[i])) continue;
                    if (w.terrain[i - 1] <= (byte)P.Terrain.Water || w.terrain[i + 1] <= (byte)P.Terrain.Water ||
                        w.terrain[i - W] <= (byte)P.Terrain.Water || w.terrain[i + W] <= (byte)P.Terrain.Water)
                    {
                        if (w.terrain[i] != (byte)P.Terrain.Mountain) w.terrain[i] = (byte)P.Terrain.Sand; // 山崖海岸保留山体
                    }
                }
            }

            // —— 沼泽:海拔 0.44-0.55 且湿度 >0.72(仅草地/沙滩低洼 → 湿地)——
            for (int y = 1; y < H - 1; y++)
            {
                for (int x = 1; x < W - 1; x++)
                {
                    int i = y * W + x;
                    byte t = w.terrain[i];
                    if (t != (byte)P.Terrain.Grass && t != (byte)P.Terrain.Sand) continue;
                    float h = hMap[i];
                    if (h < 0.44f || h > 0.55f) continue;
                    if (moistMap[i] > 0.72f) w.terrain[i] = (byte)P.Terrain.Swamp;
                }
            }

            // —— 河流:每 20 列取该列最高山地,贪心最低邻居下切至海 ——
            var visited = new bool[n];
            for (int x = RiverEvery / 2; x < W; x += RiverEvery)
            {
                int best = -1; float bestH = 0.6f; // 源头须至少 Hill
                for (int y = 0; y < H; y++)
                {
                    int i = y * W + x;
                    byte t = w.terrain[i];
                    if ((t == (byte)P.Terrain.Mountain || t == (byte)P.Terrain.Hill) && hMap[i] > bestH)
                    {
                        bestH = hMap[i]; best = i;
                    }
                }
                if (best < 0) continue;
                CarveRiver(w, hMap, visited, best);
            }

            // —— 湖泊:撒 8 个(worldgen.ts 93-106 行算法)——
            for (int l = 0; l < LakeCount; l++)
            {
                float cx = 20f + rand.Value() * (W - 40);
                float cy = 16f + rand.Value() * (H - 32);
                float r = 2f + rand.Value() * 3f;
                int y0 = Mathf.FloorToInt(cy - r - 1f), y1 = Mathf.CeilToInt(cy + r + 1f);
                int x0 = Mathf.FloorToInt(cx - r - 1f), x1 = Mathf.CeilToInt(cx + r + 1f);
                for (int y = y0; y <= y1; y++)
                {
                    for (int x = x0; x <= x1; x++)
                    {
                        if (x < 0 || y < 0 || x >= W || y >= H) continue;
                        float dd = Mathf.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
                        int i = y * W + x;
                        if (dd <= r && w.terrain[i] >= (byte)P.Terrain.Sand) w.terrain[i] = (byte)P.Terrain.Water;
                    }
                }
            }

            // —— 火山热点:山地 rng<0.002 → 半径 2 岩浆湖 ——
            for (int i = 0; i < n; i++)
            {
                if (w.terrain[i] != (byte)P.Terrain.Mountain) continue;
                if (rand.Value() >= 0.002f) continue;
                int cx = i % W, cy = i / W;
                for (int dy = -2; dy <= 2; dy++)
                {
                    for (int dx = -2; dx <= 2; dx++)
                    {
                        if (dx * dx + dy * dy > 4) continue;
                        int xx = cx + dx, yy = cy + dy;
                        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                        if (P.TerrainInfo.IsLand((P.Terrain)w.terrain[yy * W + xx]))
                            w.terrain[yy * W + xx] = (byte)P.Terrain.Lava;
                    }
                }
            }

            // —— 极地圈:y<8 || y>=H-8 强制 Snow(陆)/Ice(水)——
            for (int y = 0; y < H; y++)
            {
                if (y >= PolarBand && y < H - PolarBand) continue;
                for (int x = 0; x < W; x++)
                {
                    byte t = w.terrain[y * W + x];
                    if (t == (byte)P.Terrain.Lava) continue; // 火山不冻
                    bool water = t == (byte)P.Terrain.Deep || t == (byte)P.Terrain.Water;
                    w.terrain[y * W + x] = water ? (byte)P.Terrain.Ice : (byte)P.Terrain.Snow;
                }
            }

            // —— 陆地健全性:样本过少换 seed 重试(worldgen.ts 183-185 行)——
            int land = 0;
            for (int i = 0; i < n; i += 7) if (w.terrain[i] >= (byte)P.Terrain.Sand) land++;
            if (land < 400)
            {
                w.units.Clear();
                Generate(w, seed + 1337u, template);
                return;
            }

            // —— 野生动物播撒(worldgen.ts trySpawn 138-160 行;数量按任务冻结)——
            TrySpawn(w, rand, P.RaceId.Sheep, 40, 4, 7, P.Terrain.Grass);
            TrySpawn(w, rand, P.RaceId.Wolf, 12, 2, 4, P.Terrain.Forest);
            TrySpawn(w, rand, P.RaceId.Bear, 8, 1, 1, P.Terrain.Forest);
            TrySpawn(w, rand, P.RaceId.Deer, 30, 3, 5, P.Terrain.Grass);
            TrySpawn(w, rand, P.RaceId.Penguin, 12, 2, 4, P.Terrain.Snow);
            TrySpawn(w, rand, P.RaceId.Camel, 8, 2, 4, P.Terrain.Sand);
            TrySpawn(w, rand, P.RaceId.Scorpion, 10, 2, 3, P.Terrain.Sand);
            TrySpawn(w, rand, P.RaceId.Snake, 10, 2, 3, P.Terrain.Sand);
            TrySpawn(w, rand, P.RaceId.Snowwolf, 8, 2, 4, P.Terrain.Snow);
            // 八新动物:鸡猪兔狐按 TS worldgen.ts 171-180 行数量
            TrySpawn(w, rand, P.RaceId.Chicken, 10, 3, 5, P.Terrain.Grass);
            TrySpawn(w, rand, P.RaceId.Pig, 8, 3, 5, P.Terrain.Grass);
            TrySpawn(w, rand, P.RaceId.Rabbit, 12, 3, 6, P.Terrain.Grass);
            TrySpawn(w, rand, P.RaceId.Rabbit, 5, 2, 4, P.Terrain.Forest);
            TrySpawn(w, rand, P.RaceId.Fox, 6, 1, 2, P.Terrain.Forest);
            // 鱼群 19 群(浅海 14 + 深海 5)/蟹 6(限邻水沙滩)/龟 6/鲨 6
            TrySpawn(w, rand, P.RaceId.Fish, 14, 5, 10, P.Terrain.Water);
            TrySpawn(w, rand, P.RaceId.Fish, 5, 4, 7, P.Terrain.Deep);
            TrySpawn(w, rand, P.RaceId.Crab, 6, 2, 4, P.Terrain.Sand, 2);
            TrySpawn(w, rand, P.RaceId.Turtle, 6, 2, 4, P.Terrain.Deep);
            TrySpawn(w, rand, P.RaceId.Shark, 6, 1, 2, P.Terrain.Deep);
            // 巨怪:Kraken 2(深海)/Sandworm 3(沙漠)/Basilisk 2(沼泽,无沼退化到沙地)
            TrySpawn(w, rand, P.RaceId.Kraken, 2, 1, 1, P.Terrain.Deep);
            TrySpawn(w, rand, P.RaceId.Sandworm, 3, 1, 1, P.Terrain.Sand);
            if (TrySpawn(w, rand, P.RaceId.Basilisk, 2, 1, 1, P.Terrain.Swamp) == 0)
                TrySpawn(w, rand, P.RaceId.Basilisk, 2, 1, 1, P.Terrain.Sand);
        }

        /// <summary>主高度场:域扭曲 fBm + 边缘衰减 + 对比推挤(worldgen.ts heightAt 31-46 行逐式移植)。</summary>
        private static float HeightAt(int x, int y, int seed, float warp, float falloff)
        {
            float nx = x / (float)W;
            float ny = y / (float)H;
            float wx = NoiseUtil.Fbm(nx * 3f + 5.2f, ny * 3f + 1.3f, seed + 77, 3) - 0.5f;
            float wy = NoiseUtil.Fbm(nx * 3f + 1.7f, ny * 3f + 9.2f, seed + 133, 3) - 0.5f;
            float h = NoiseUtil.Fbm(nx * 4.4f + wx * 1.4f * warp, ny * 4.4f + wy * 1.4f * warp, seed, 6);
            float dx = (nx - 0.5f) * 2f;
            float dy = (ny - 0.5f) * 2f;
            float d = Mathf.Sqrt(dx * dx + dy * dy);
            h -= Mathf.Max(0f, (d - 0.55f) * falloff);          // 边缘衰减环洋
            h = Mathf.Clamp01((h - 0.28f) * 1.55f + 0.28f);     // 轻对比推挤
            return h;
        }

        /// <summary>河流下切:从高山贪心走向最低邻居直至入海/陷洼成湖。</summary>
        private static void CarveRiver(P.World w, float[] hMap, bool[] visited, int start)
        {
            int cur = start;
            for (int step = 0; step < 600; step++)
            {
                byte t = w.terrain[cur];
                if (t == (byte)P.Terrain.Deep || t == (byte)P.Terrain.Water) return; // 入海
                visited[cur] = true;
                w.terrain[cur] = (byte)P.Terrain.Water;

                int cx = cur % W, cy = cur / W;
                int best = -1; float bestH = float.MaxValue;
                for (int k = 0; k < 4; k++)
                {
                    int xx = cx + (k == 0 ? -1 : k == 1 ? 1 : 0);
                    int yy = cy + (k == 2 ? -1 : k == 3 ? 1 : 0);
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                    int j = yy * W + xx;
                    if (visited[j]) continue;
                    if (hMap[j] < bestH) { bestH = hMap[j]; best = j; }
                }
                if (best < 0 || bestH >= hMap[cur]) return; // 盆地陷洼:留成湖(当前格已成水)
                cur = best;
            }
        }

        /// <summary>野生动物播撒(worldgen.ts trySpawn 138-160 行):随机点落 need 地形,同伴散布 ±2.5 格。返回放置群数。</summary>
        private static int TrySpawn(P.World w, P.Rng rand, int race, int count, int groupMin, int groupMax, P.Terrain need, int nearWaterR = 0)
        {
            byte needB = (byte)need;
            int placed = 0, guard = 0;
            while (placed < count && guard++ < count * 60)
            {
                float x = rand.Value() * W;
                float y = rand.Value() * H;
                int ix = (int)x, iy = (int)y;
                int i = iy * W + ix;
                if (w.terrain[i] == needB && (nearWaterR <= 0 || NearWater(w, ix, iy, nearWaterR)))
                {
                    MakeUnit(w, race, x, y);
                    placed++;
                    int gn = groupMin + (int)(rand.Value() * (groupMax - groupMin + 1));
                    for (int m = 1; m < gn; m++)
                    {
                        float mx = x + (rand.Value() - 0.5f) * 5f;
                        float my = y + (rand.Value() - 0.5f) * 5f;
                        if (mx < 0f || my < 0f || mx >= W || my >= H) continue;
                        if (w.terrain[(int)my * W + (int)mx] == needB) MakeUnit(w, race, mx, my);
                    }
                }
            }
            return placed;
        }

        private static bool NearWater(P.World w, int x, int y, int r)
        {
            for (int dy = -r; dy <= r; dy++)
            {
                for (int dx = -r; dx <= r; dx++)
                {
                    int xx = x + dx, yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                    byte t = w.terrain[yy * W + xx];
                    if (t == (byte)P.Terrain.Water || t == (byte)P.Terrain.Deep) return true;
                }
            }
            return false;
        }

        /// <summary>构造初始单位塞入 w.units。基础可用:id 自增/race/hp=maxHp=RaceCatalog.hp/dmg/speed/位置。
        /// TODO(U2):姓名/特质/基因/职业/捕食账本等细化初始化在 UnitsSystem 侧补齐。</summary>
        private static void MakeUnit(P.World w, int race, float x, float y)
        {
            var def = PWB.Units.RaceCatalog.Get(race);
            var u = new PWB.Units.Unit();
            u.Id = w.AllocUnitId();
            u.Race = race;
            u.Hp = def.Hp;
            u.MaxHp = def.Hp;
            u.Dmg = def.Dmg;
            u.Speed = def.Speed;
            u.X = x; u.Y = y;
            u.LastX = x; u.LastY = y;
            u.Tx = x; u.Ty = y;
            u.Civ = -1;
            u.Age = 0;
            w.units.Add(u);
        }
    }
}
