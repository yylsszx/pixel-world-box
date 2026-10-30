// ============================================================
// WbWorldgen.cs — M-U7f' 程序化世界生成（大陆/生物群系/野生动物撒布全链）
// 蓝本: src/lib/game/worldgen.ts L6-257 + noise.ts（经 WbNoise）逐行机械翻译
// 蓝本锚: WorldGenParams 模板参数 L15-28（全可选，缺省=经典随机世界）/ heightAt
//         domain-warp fBm + edge falloff L31-46 / generateWorld 主体 L48-257：
//         六档海陆阈值 + 气候场量化 L62-91 / 湖泊 sprinkle L93-106（V8Hypot 圈地）/
//         沼泽斑片 L108-134（高湿+低海拔+邻水洼地+斑块噪声）/ trySpawn 15 组 L211-232 /
//         trySpawnSpread 猎场 k-center 最远点采样 L166-209（Task 98）/ 鲨鱼锚定鱼群
//         L235-249（8 次重试落水）/ land sanity 递归重掷 seed+1337 L251-254（尾递归→循环等价）
// 语义备忘: ①params?.seaBias ?? 0——params 存在但字段未给时同样走 ?? 右侧；lakes 缺省
//         消耗一次 rand（3+floor(rand*4)）而显式 0 不消耗（?? 语义）；②蓝本 L155
//         `R[race] === undefined ? race : race` 恒等式（蓝本原样，两分支同值）→ C# 恒 race；
//         ③Math.hypot 必须 WbNoise.V8Hypot（sqrt 72/289 整数格点 1ulp 分歧）；
//         ④spawnAnimals x/y 保持 double 原值（floor 只用于索引）。
// dump: scripts/unity-migration/gen-worldgen.mjs 黄金 worldgen.json（7 场景 gzB64 协议，
//       md5 21dea60b）+ worldgen-transcript.mjs 镜像 + verify 段 + NUnit Test26
// ============================================================
namespace PixelWorldBox.Wb
{
    using System;
    using System.Collections.Generic;

    /// 世界模板参数（worldgen.ts L15-28——全可选，缺省 = 经典随机世界）
    public sealed class WbWorldGenParams
    {
        /// 海平面偏移：正 = 更多海洋（群岛），负 = 更多陆地（盘古大陆）——L16-17
        public double? SeaBias;
        /// 温度偏置：负 = 冰河期，正 = 温室纪 —— L18-19
        public double? TempBias;
        /// 湿度偏置：负 = 干旱，正 = 湿润 —— L20-21
        public double? MoistBias;
        /// 地形破碎度（domain warp 强度倍率）—— L22-23
        public double? Warp;
        /// 边缘衰减强度 —— L24-25
        public double? Falloff;
        /// 湖泊数量（缺省随机 3-6，缺省路径消耗一次 rand）—— L26-27
        public int? Lakes;
    }

    /// 单个野生动物出世记录（L11：{ race, x, y }，x/y double 原值）
    public sealed class WbSpawnAnimal
    {
        public int Race;
        public double X, Y;
        public WbSpawnAnimal(int race, double x, double y) { Race = race; X = x; Y = y; }
    }

    /// 生成结果（L6-12）
    public sealed class WbWorldGenResult
    {
        public byte[] Terrain;      // W*H
        public byte[] Variant;      // per-tile color variation hash 0..255（L8）
        public byte[] Temp;         // 0-255 气温场（L9）
        public byte[] Moist;        // 0-255 湿度场（L10）
        public List<WbSpawnAnimal> SpawnAnimals;
    }

    public static class WbWorldgen
    {
        // ---------------- heightAt（L31-46） ----------------
        // main heightmap: domain-warped fBm with edge falloff → continents & islands
        private static double HeightAt(int x, int y, int seed, double warp, double falloff)
        {
            double nx = x / (double)WbConstants.W;
            double ny = y / (double)WbConstants.H;
            // domain warp（L35-36）
            double wx = WbNoise.Fbm(nx * 3 + 5.2, ny * 3 + 1.3, seed + 77, 3) - 0.5;
            double wy = WbNoise.Fbm(nx * 3 + 1.7, ny * 3 + 9.2, seed + 133, 3) - 0.5;
            double h = WbNoise.Fbm(nx * 4.4 + wx * 1.4 * warp, ny * 4.4 + wy * 1.4 * warp, seed, 6);
            // edge falloff so the map is surrounded by ocean（L38-42）
            double dx = (nx - 0.5) * 2;
            double dy = (ny - 0.5) * 2;
            double d = Math.Sqrt(dx * dx + dy * dy);
            h -= Math.Max(0, (d - 0.55) * falloff);
            // gentle contrast push（L43-44）
            h = Math.Max(0, Math.Min(1, (h - 0.28) * 1.55 + 0.28));
            return h;
        }

        // ---------------- 入口（L48-257 尾递归 → 循环等价） ----------------
        // 蓝本 L254 `return generateWorld(seed + 1337, params)` 为尾递归——C# 循环等价变换
        // （每轮全量重建四场 + 动物表 + rand 状态 = 新 mulberry32(seed')，语义逐位一致）
        public static WbWorldGenResult GenerateWorld(int seed, WbWorldGenParams parms = null)
        {
            while (true)
            {
                WbWorldGenResult res = GenOnce(seed, parms);
                // sanity: ensure at least some land（L252-253——i+=7 步进采样）
                int land = 0;
                for (int i = 0; i < res.Terrain.Length; i += 7) if (res.Terrain[i] >= WbConstants.T_SAND) land++;
                if (land < 400) { seed += 1337; continue; }
                return res;
            }
        }

        private static WbWorldGenResult GenOnce(int seed, WbWorldGenParams parms)
        {
            // rand 闭包（L49）——C# 局部函数捕获状态量
            uint randA = (uint)seed;
            double Rand() => WbNoise.Mulberry32Next(ref randA);

            byte[] terrain = new byte[WbConstants.W * WbConstants.H];
            byte[] variant = new byte[WbConstants.W * WbConstants.H];
            byte[] temp = new byte[WbConstants.W * WbConstants.H];
            byte[] moist = new byte[WbConstants.W * WbConstants.H];

            // 模板参数（L54-60——?? 缺省语义；lakes 缺省消耗 rand）
            double seaBias = parms?.SeaBias ?? 0;
            double tempBias = parms?.TempBias ?? 0;
            double moistBias = parms?.MoistBias ?? 0;
            double warp = parms?.Warp ?? 1;
            double falloff = parms?.Falloff ?? 0.9;
            int lakeCount = parms?.Lakes ?? 3 + (int)Math.Floor(Rand() * 4);

            // 主循环（L62-91）
            for (int y = 0; y < WbConstants.H; y++)
            {
                for (int x = 0; x < WbConstants.W; x++)
                {
                    int i = y * WbConstants.W + x;
                    variant[i] = (byte)Math.Floor(WbNoise.Hash2(x, y, seed + 999) * 255);

                    double h = HeightAt(x, y, seed, warp, falloff) - seaBias;
                    // climate（L69-71）
                    double lat = Math.Abs(y / (double)WbConstants.H - 0.5) * 2; // 0 equator, 1 pole
                    double tempF = 1 - lat * 1.25 + (WbNoise.Fbm(x / 48.0, y / 48.0, seed + 555, 3) - 0.5) * 0.35 + tempBias;
                    double moistF = Math.Min(1, Math.Max(0, WbNoise.Fbm(x / 36.0 + 8, y / 36.0 + 3, seed + 321, 4) + moistBias));

                    byte t;
                    if (h < 0.30) t = WbConstants.T_DEEP;
                    else if (h < 0.42) t = WbConstants.T_WATER;
                    else if (h < 0.46) t = WbConstants.T_SAND;
                    else if (h < 0.70) t = WbConstants.T_GRASS;
                    else if (h < 0.80) t = WbConstants.T_HILL;
                    else t = WbConstants.T_MOUNTAIN;

                    if (t == WbConstants.T_GRASS)
                    {
                        if (tempF < 0.26) t = WbConstants.T_SNOW;
                        else if (moistF > 0.60 && tempF > 0.3) t = WbConstants.T_FOREST;
                        else if (tempF > 0.82 && moistF < 0.42) t = WbConstants.T_SAND;
                    }
                    terrain[i] = t;
                    // 气候场量化存储（L87-89——同 seed 确定性 → 读档直接重算不入存档）
                    temp[i] = (byte)Math.Max(0, Math.Min(255, WbMath.JsRound((tempF + 0.08) * 165)));
                    moist[i] = (byte)Math.Max(0, Math.Min(255, WbMath.JsRound(moistF * 255)));
                }
            }

            // sprinkle small lakes（L93-106）——V8Hypot 圈地（dd<=r 边界格语义）
            for (int l = 0; l < lakeCount; l++)
            {
                double cx = 20 + Rand() * (WbConstants.W - 40);
                double cy = 16 + Rand() * (WbConstants.H - 32);
                double r = 2 + Rand() * 3;
                for (int y = (int)Math.Floor(cy - r - 1); y <= cy + r + 1; y++)
                {
                    for (int x = (int)Math.Floor(cx - r - 1); x <= cx + r + 1; x++)
                    {
                        if (x < 0 || y < 0 || x >= WbConstants.W || y >= WbConstants.H) continue;
                        double dd = WbNoise.V8Hypot(x - cx, y - cy);
                        if (dd <= r && terrain[y * WbConstants.W + x] >= WbConstants.T_SAND) terrain[y * WbConstants.W + x] = WbConstants.T_WATER;
                    }
                }
            }

            // —— 沼泽斑片：高湿度 + 低海拔 + 邻水洼地（L108-134）——
            bool NearWater(int x, int y, int r)
            {
                for (int dy = -r; dy <= r; dy++)
                {
                    for (int dx = -r; dx <= r; dx++)
                    {
                        int xx = x + dx, yy = y + dy;
                        if (xx < 0 || yy < 0 || xx >= WbConstants.W || yy >= WbConstants.H) continue;
                        byte tt = terrain[yy * WbConstants.W + xx];
                        if (tt == WbConstants.T_WATER || tt == WbConstants.T_DEEP) return true;
                    }
                }
                return false;
            }
            for (int y = 1; y < WbConstants.H - 1; y++)
            {
                for (int x = 1; x < WbConstants.W - 1; x++)
                {
                    int i = y * WbConstants.W + x;
                    if (terrain[i] != WbConstants.T_GRASS) continue;
                    double h = HeightAt(x, y, seed, warp, falloff) - seaBias;
                    if (h >= 0.56) continue; // 只落在低海拔洼地（L125）
                    double m = Math.Min(1, Math.Max(0, WbNoise.Fbm(x / 36.0 + 8, y / 36.0 + 3, seed + 321, 4) + moistBias));
                    if (m < 0.60) continue; // 高湿度（L127）
                    // 斑块噪声：只有噪声峰区成沼（L128-130）
                    double patch = WbNoise.Fbm(x / 13.0 + 41, y / 13.0 + 23, seed + 777, 3);
                    if (patch < 0.55) continue;
                    if (!NearWater(x, y, 2)) continue; // 邻水洼地
                    terrain[i] = WbConstants.T_SWAMP;
                }
            }

            // wildlife（L136-249）
            var spawnAnimals = new List<WbSpawnAnimal>();
            // trySpawn（L138-160）
            void TrySpawn(int race, int count, int groupLo, int groupHi, byte need, int nearWaterR = 0)
            {
                int placed = 0;
                int guard = 0;
                while (placed < count && guard++ < count * 60)
                {
                    double x = Rand() * WbConstants.W;
                    double y = Rand() * WbConstants.H;
                    int i = (int)Math.Floor(y) * WbConstants.W + (int)Math.Floor(x);
                    if (terrain[i] == need && (nearWaterR <= 0 || NearWater((int)Math.Floor(x), (int)Math.Floor(y), nearWaterR)))
                    {
                        spawnAnimals.Add(new WbSpawnAnimal(race, x, y));
                        placed++;
                        // pack mates（L149-157）
                        int n = groupLo + (int)Math.Floor(Rand() * (groupHi - groupLo + 1));
                        for (int m = 1; m < n; m++)
                        {
                            double mx = x + (Rand() - 0.5) * 5;
                            double my = y + (Rand() - 0.5) * 5;
                            int mi = (int)Math.Floor(my) * WbConstants.W + (int)Math.Floor(mx);
                            if (mx >= 0 && my >= 0 && mx < WbConstants.W && my < WbConstants.H && terrain[mi] == need)
                            {
                                // 蓝本 L155 `R[race] === undefined ? race : race` 恒等式（两分支同值）→ 恒 race
                                spawnAnimals.Add(new WbSpawnAnimal(race, mx, my));
                            }
                        }
                    }
                }
            }
            // trySpawnSpread（L166-209）——猎场网络均匀撒布（Task 98 最远点采样 greedy k-center）
            void TrySpawnSpread(int race, int count, int groupLo, int groupHi, int[] needs)
            {
                var cand = new List<int>();
                for (int i = 0; i < terrain.Length; i++) if (Array.IndexOf(needs, (int)terrain[i]) >= 0) cand.Add(i);
                if (cand.Count == 0) return;
                // nearest[i] = 候选 i 到最近已选锚点的距离平方（增量更新）
                var nearest = new double[cand.Count];
                for (int i = 0; i < nearest.Length; i++) nearest[i] = double.PositiveInfinity;
                var px = new List<int>();
                var py = new List<int>();
                void SeedAt(int ci)
                {
                    int cx = ci % WbConstants.W;
                    int cy = ci / WbConstants.W;   // (ci/W)|0 非负整除
                    px.Add(cx);
                    py.Add(cy);
                    for (int i = 0; i < cand.Count; i++)
                    {
                        int dxi = cand[i] % WbConstants.W - cx;
                        int dyi = cand[i] / WbConstants.W - cy;
                        int d2 = dxi * dxi + dyi * dyi;
                        if (d2 < nearest[i]) nearest[i] = d2;
                    }
                }
                SeedAt((int)Math.Floor(Rand() * cand.Count)); // 首锚随机：打破 k-center 平局对称性
                for (int k = 1; k < count; k++)
                {
                    int best = -1;
                    double bestD = -1;
                    for (int i = 0; i < cand.Count; i++)
                    {
                        if (nearest[i] > bestD) { bestD = nearest[i]; best = i; }
                    }
                    if (best < 0 || bestD <= 0) break; // 全图已覆盖（理论不可达）→ 提前收手
                    SeedAt(cand[best]);
                }
                for (int p = 0; p < px.Count; p++)
                {
                    spawnAnimals.Add(new WbSpawnAnimal(race, px[p] + 0.5, py[p] + 0.5));
                    int n = groupLo + (int)Math.Floor(Rand() * (groupHi - groupLo + 1));
                    for (int m = 1; m < n; m++)
                    {
                        double mx = px[p] + (Rand() - 0.5) * 5;
                        double my = py[p] + (Rand() - 0.5) * 5;
                        if (mx < 0 || my < 0 || mx >= WbConstants.W || my >= WbConstants.H) continue;
                        int mi = (int)Math.Floor(my) * WbConstants.W + (int)Math.Floor(mx);
                        if (Array.IndexOf(needs, (int)terrain[mi]) >= 0)
                        {
                            spawnAnimals.Add(new WbSpawnAnimal(race, mx, my));
                        }
                    }
                }
            }

            // 撒布序（L211-232——rand 流即契约，序不可动）
            TrySpawn(WbConstants.R_SHEEP, 24, 4, 7, WbConstants.T_GRASS);      // 羊：草原大群
            TrySpawn(WbConstants.R_WOLF, 9, 2, 4, WbConstants.T_FOREST);
            TrySpawn(WbConstants.R_BEAR, 5, 1, 1, WbConstants.T_FOREST);
            TrySpawn(WbConstants.R_DEER, 14, 3, 5, WbConstants.T_GRASS);       // 鹿：草地群落
            TrySpawn(WbConstants.R_PENGUIN, 8, 2, 4, WbConstants.T_SNOW);      // 企鹅：雪原群落
            TrySpawn(WbConstants.R_CAMEL, 6, 2, 4, WbConstants.T_SAND);        // 骆驼：沙漠群落
            TrySpawn(WbConstants.R_SCORPION, 8, 2, 3, WbConstants.T_SAND);     // 蝎子：沙漠穴居猎手
            TrySpawn(WbConstants.R_SNAKE, 7, 2, 3, WbConstants.T_SAND);        // 蛇：沙漠猎手
            TrySpawn(WbConstants.R_SNOWWOLF, 8, 2, 4, WbConstants.T_SNOW);     // 雪狼：极地冰原
            // —— 八新动物播撒（L220-225）——
            TrySpawn(WbConstants.R_CHICKEN, 10, 3, 5, WbConstants.T_GRASS);    // 鸡：村落式小群
            TrySpawn(WbConstants.R_PIG, 8, 3, 5, WbConstants.T_GRASS);         // 猪：掉肉大户
            TrySpawn(WbConstants.R_RABBIT, 12, 3, 6, WbConstants.T_GRASS);     // 兔：草地群穴
            TrySpawn(WbConstants.R_RABBIT, 5, 2, 4, WbConstants.T_FOREST);     // 兔：林缘亦有
            TrySpawn(WbConstants.R_FOX, 6, 1, 2, WbConstants.T_FOREST);        // 狐：森林猎手
            // 鱼：猎场网络均匀撒布（L229——26 锚覆盖式铺满全部海域含深海）
            TrySpawnSpread(WbConstants.R_FISH, 26, 5, 9, new[] { (int)WbConstants.T_WATER, (int)WbConstants.T_DEEP });
            TrySpawn(WbConstants.R_CRAB, 10, 2, 4, WbConstants.T_SAND, 2);     // 蟹：限邻水沙滩（2 格内有水）
            TrySpawn(WbConstants.R_TURTLE, 9, 2, 4, WbConstants.T_DEEP);       // 龟：海洋游荡
            TrySpawn(WbConstants.R_SHARK, 6, 1, 2, WbConstants.T_DEEP);        // 鲨鱼：深海独行猎手

            // 鲨鱼锚定鱼群（L235-249——8 次重试落水，失败留守原深水点）
            {
                WbSpawnAnimal[] fishSpots = spawnAnimals.FindAll((a) => a.Race == WbConstants.R_FISH).ToArray();
                foreach (WbSpawnAnimal a in spawnAnimals)
                {
                    if (a.Race != WbConstants.R_SHARK || fishSpots.Length == 0) continue;
                    // 落点水域校验（L239-241）：±1.5 抖动可能落在岸上——8 次重试都落水失败则留守
                    WbSpawnAnimal f = fishSpots[(int)Math.Floor(Rand() * fishSpots.Length)];
                    for (int t = 0; t < 8; t++)
                    {
                        double jx = Math.Max(0.5, Math.Min(WbConstants.W - 0.5, f.X + (Rand() * 3 - 1.5)));
                        double jy = Math.Max(0.5, Math.Min(WbConstants.H - 0.5, f.Y + (Rand() * 3 - 1.5)));
                        byte jt = terrain[(int)Math.Floor(jy) * WbConstants.W + (int)Math.Floor(jx)];
                        if (jt == WbConstants.T_WATER || jt == WbConstants.T_DEEP) { a.X = jx; a.Y = jy; break; }
                    }
                }
            }

            return new WbWorldGenResult { Terrain = terrain, Variant = variant, Temp = temp, Moist = moist, SpawnAnimals = spawnAnimals };
        }
    }
}
