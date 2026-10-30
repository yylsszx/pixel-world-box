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

        // ================= 河域（M-U7k：engine.ts carveRiver L12282-12392 + carveLake L12394-12411 +
        // encodeRiverDir L62-71 + fx spawn 2 掷 L9781-9799 + nature.ts seedRivers L1094-1108 宿主接力） =================
        // 域口径：generate() L941 seedRivers 时点宿主接力（蓝本 generate L905-949 序：worldsim initFromTerrain
        // soilF 段 → L936 spawnUnit 逐只 → L941 seedRivers → L949 rebuildWaterTiers）；engine.rngA =
        // (seed ^ 0x9e3779b9)>>>0（L773）由宿主起流，spawnUnit 重放 + carveRiver/fx 同流续抽。
        // setTerrain 簿记（amb/frozen/flood/wet/fire/owner/building/markDirty）在世界生成域均为 no-op
        // （空表/全 -1/L950 dirty 全量兜底）——terrain 直写等价（M-U7g 宿主接力先例）。
        static readonly int[] SoilBase = { 40, 45, 64, 142, 152, 112, 66, 92, 30, 96, 45 };   // worldsim.ts L31-34 [T.DEEP..T.ICE]；SWAMP 等 → ?? 128
        const int Brush = 3;                                                                   // engine.ts L686 brush = 3（世界生成期无笔刷 UI）
        static readonly (int, int)[] RiverDirs = { (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1) };   // L63-65

        static bool IsWaterT(int t) => t == WbConstants.T_DEEP || t == WbConstants.T_WATER;    // constants.ts L67-69

        /// <summary>worldsim.ts L168-170 soilMulAt（soilF/255 → 0.6..1.4 肥力乘数）</summary>
        public static double SoilMulAt(WbWorld w, int j) => 0.6 + w.soilF[j] / 255.0 * 0.8;

        /// <summary>worldsim.ts initFromTerrain L125 段（SOIL_BASE[t] ?? 128——世界生成期土壤肥力初值）</summary>
        public static void SoilInit(byte[] terrain, byte[] soilF)
        {
            for (int i = 0; i < terrain.Length; i++)
            {
                int t = terrain[i];
                soilF[i] = (byte)(t < SoilBase.Length ? SoilBase[t] : 128);
            }
        }

        /// <summary>engine.ts L62-71 encodeRiverDir（RIVER_DIRS L63-65 八向 + Math.sign 匹配）</summary>
        public static int EncodeRiverDir(int dx, int dy)
        {
            for (int k = 0; k < 8; k++)
                if (RiverDirs[k].Item1 == Math.Sign(dx) && RiverDirs[k].Item2 == Math.Sign(dy)) return k + 1;
            return 0;
        }

        /// <summary>engine.ts L9781-9799 fx（世界生成可达域：spawn kind；L9794 seed+dir 恒 2 掷；
        /// cap 620 = FX_CAPS[1] 满载逐出域世界生成不触达——fx 总数 ≤ 数十）</summary>
        static void FxSpawn(WbWorld w, double x, double y, double ttl)
        {
            w.effects.Add(new WbFx
            {
                kind = "spawn", x = x, y = y, x0 = x, y0 = y, r = 1, age = 0, ttl = ttl,
                seed = (int)Math.Floor(w.Rng() * 65536), dir = w.Rng() * Math.PI * 2,          // L9794 2 掷（Task 138 基本单位）
            });
        }

        /// <summary>engine.ts L12394-12411 carveLake（内流湖/火山口湖；山区淹没山体 + 湖畔绿洲）</summary>
        public static void CarveLake(WbWorld w, byte[] terrain, int cx, int cy, int r)
        {
            int W = WbConstants.W, H = WbConstants.H;
            for (int dy = -r - 1; dy <= r + 1; dy++)                                               // L12396
            {
                for (int dx = -r - 1; dx <= r + 1; dx++)
                {
                    int xx = cx + dx, yy = cy + dy;
                    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                          // L12399
                    double d = WbNoise.V8Hypot(dx, dy);                                            // L12400（V8 hypot 语义——sqrt 72/289 整数格点分歧）
                    if (d <= r)
                    {
                        terrain[yy * W + xx] = WbConstants.T_WATER;                                // L12403
                    }
                    else if (d <= r + 1)
                    {
                        int j = yy * W + xx;
                        if (terrain[j] == WbConstants.T_SAND || terrain[j] == WbConstants.T_BURNT) terrain[j] = WbConstants.T_GRASS;   // L12406
                    }
                }
            }
            FxSpawn(w, cx + 0.5, cy + 0.5, 30);                                                    // L12410（2 掷）
        }

        /// <summary>engine.ts L12282-12392 carveRiver（BFS 距水场 + 加权随机下降游走 + 圆形刻蚀绕山 + 沿岸灌溉）</summary>
        public static bool CarveRiver(WbWorld w, byte[] terrain, byte[] moistMap, double wx, double wy, int? widthOverride)
        {
            int W = WbConstants.W, H = WbConstants.H, N = W * H;
            int sx = (int)Math.Max(0, Math.Min(W - 1, Math.Floor(wx)));                            // L12283
            int sy = (int)Math.Max(0, Math.Min(H - 1, Math.Floor(wy)));                            // L12284
            int start = sy * W + sx;                                                               // L12285
            if (IsWaterT(terrain[start])) return false;                                            // L12286（零掷）
            int[] dist = new int[N];                                                               // L12289 Int32Array
            for (int i = 0; i < N; i++) dist[i] = -1;
            int[] queue = new int[N];                                                              // L12290
            int qh = 0, qt = 0;
            for (int i = 0; i < N; i++)
                if (IsWaterT(terrain[i])) { dist[i] = 0; queue[qt++] = i; }                        // L12292-12294
            while (qh < qt)                                                                        // L12295-12304（山体阻断 → 绕山而行）
            {
                int i = queue[qh++];
                int x = i % W, y = i / W;
                int d = dist[i];
                if (x > 0 && dist[i - 1] == -1 && terrain[i - 1] != WbConstants.T_MOUNTAIN) { dist[i - 1] = d + 1; queue[qt++] = i - 1; }
                if (x < W - 1 && dist[i + 1] == -1 && terrain[i + 1] != WbConstants.T_MOUNTAIN) { dist[i + 1] = d + 1; queue[qt++] = i + 1; }
                if (y > 0 && dist[i - W] == -1 && terrain[i - W] != WbConstants.T_MOUNTAIN) { dist[i - W] = d + 1; queue[qt++] = i - W; }
                if (y < H - 1 && dist[i + W] == -1 && terrain[i + W] != WbConstants.T_MOUNTAIN) { dist[i + W] = d + 1; queue[qt++] = i + W; }
            }
            if (dist[start] == -1)                                                                 // L12305-12312（山脉环抱洼地 → 内流湖）
            {
                CarveLake(w, terrain, sx, sy, Math.Max(2, Brush));                                 // L12307
                w.AddEvent("river", "群山之间诞生了一泓内流湖");                                    // L12309（toast/onSound 宿主 UI 域不译——零 rng）
                return true;
            }
            int width = widthOverride.HasValue ? widthOverride.Value : Math.Max(0, (Brush - 1) / 2);   // L12315（自然河 genesis 传 0 单宽涓流）
            byte[] visited = new byte[N];                                                          // L12316
            int cx = sx, cy = sy, carved = 0;
            bool reached = false;
            for (int steps = 0; steps < 400; steps++)                                              // L12320
            {
                int i = cy * W + cx;                                                               // L12321
                if (visited[i] != 0) break;                                                        // L12322 防绕圈（零掷）
                visited[i] = 1;
                if (dist[i] == 0) { reached = true; break; }                                       // L12324 抵海（零掷）
                int curD = dist[i];                                                                // L12327
                var cands = new List<int>(); var wts = new List<double>();                         // L12328-12329
                for (int dy = -1; dy <= 1; dy++)
                {
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int xx = cx + dx, yy = cy + dy;
                        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                        int j = yy * W + xx;
                        if (dist[j] < 0 || dist[j] >= curD) continue;                              // L12336 只降不升
                        cands.Add(j);
                        wts.Add(1.0 / (1 + (curD - dist[j]) * 0.5));                               // L12338 快降权重高 → 蜿蜒
                    }
                }
                if (cands.Count == 0) { CarveLake(w, terrain, cx, cy, Math.Max(2, width + 1)); break; }   // L12341-12344 洼地成湖
                double total = 0;
                foreach (double wt in wts) total += wt;                                            // L12346-12347
                double r = w.Rng() * total;                                                        // L12348（1 掷）
                int pick = cands[0];                                                               // L12349
                for (int k = 0; k < cands.Count; k++) { r -= wts[k]; if (r <= 0) { pick = cands[k]; break; } }   // L12350
                int nx = pick % W, ny = pick / W;                                                  // L12351-12352
                int dirCode = EncodeRiverDir(nx - cx, ny - cy);                                    // L12353
                for (int dy = -width; dy <= width; dy++)                                           // L12355-12368 刻河道（圆形绕山）
                {
                    for (int dx = -width; dx <= width; dx++)
                    {
                        if (dx * dx + dy * dy > width * width + 0.5) continue;
                        int xx = cx + dx, yy = cy + dy;
                        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                        int j = yy * W + xx;
                        if (terrain[j] == WbConstants.T_MOUNTAIN) continue;                        // L12361 河绕山不穿山
                        if (terrain[j] != WbConstants.T_WATER) { terrain[j] = WbConstants.T_WATER; carved++; }   // L12362
                        if (dirCode > 0)
                        {
                            w.riverDir[j] = (byte)dirCode;                                         // L12364
                            if (w.riverTiles.Add(j)) w.riverTilesList.Add(j);                      // L12365（Set.add 重复 no-op → 插入序等价）
                        }
                    }
                }
                int ir = width + 1;                                                                // L12369-12380 沿岸灌溉
                for (int dy = -ir; dy <= ir; dy++)
                {
                    for (int dx = -ir; dx <= ir; dx++)
                    {
                        int xx = cx + dx, yy = cy + dy;
                        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
                        int j = yy * W + xx;
                        int t = terrain[j];
                        if (t == WbConstants.T_SAND || t == WbConstants.T_BURNT) terrain[j] = WbConstants.T_GRASS;            // L12377 绿洲
                        else if (t == WbConstants.T_GRASS && w.Rng() < 0.05 * SoilMulAt(w, j)) terrain[j] = WbConstants.T_FOREST;   // L12378（&& 短路 1 掷/GRASS 格）
                    }
                }
                cx = nx; cy = ny;                                                                  // L12381-12382
            }
            if (carved > 0)                                                                        // L12384-12390
            {
                FxSpawn(w, wx, wy, 30);                                                            // L12385（2 掷）
                w.AddEvent("river", reached ? "一条大河诞生了，蜿蜒流向大海" : "一条河在洼地尽头汇成了湖");   // L12387
                return true;
            }
            return false;                                                                          // L12391
        }

        /// <summary>nature.ts L1094-1108 seedRivers（世界生成期自然河网——湿润高地源头刻 8-13 条河；
        /// nature.rng = mulberry32(seed ^ 0x7ea12d)（L89）独立流，与 engine.rngA 双流并轨）</summary>
        public static void SeedRivers(WbWorld w, byte[] terrain, byte[] moistMap, int seed)
        {
            uint natA = (uint)(seed ^ 0x7ea12d);                                                   // L89
            double Nat() => WbNoise.Mulberry32Next(ref natA);
            int n = 8 + (int)Math.Floor(Nat() * 6);                                                // L1096（nature 流 1 掷）
            int carved = 0;
            for (int tr = 0; tr < n * 16 && carved < n; tr++)                                      // L1098
            {
                int x = 6 + (int)Math.Floor(Nat() * (WbConstants.W - 12));                         // L1099（2 掷/try）
                int y = 6 + (int)Math.Floor(Nat() * (WbConstants.H - 12));                         // L1100
                int i = y * WbConstants.W + x;
                int t = terrain[i];
                if (t != WbConstants.T_MOUNTAIN && t != WbConstants.T_HILL) continue;              // L1103
                if (moistMap[i] < 115) continue;                                                   // L1104（115/255 ≈ 0.45 干旱门）
                if (CarveRiver(w, terrain, moistMap, x + 0.5, y + 0.5, 0)) carved++;               // L1105
            }
            if (carved > 0) w.AddEvent("river", $"这个年轻的世界有了自己的河网——{carved} 条大河从山地奔向海洋");   // L1107
        }
    }
}
