// ============================================================
// WbWorldsim.cs — M-U26「深时涌现域」全译（worldsim.ts 全域机械翻译）
// 蓝本: src/lib/game/worldsim.ts L1-710（initFromTerrain L114-150 /
//   onTerrainChanged L153-165 / soilMulAt L168-170〔WbWorld.WorldsimSoilMulAt
//   M-U7k 先译〕/ hydroTick L175-294 / tempTick L299-302 / computeTemps
//   L304-360 / oceanTick L365-481 / glacierTick L486-552 / coastTick L557-600 /
//   biomeTick L605-670；deepSnapshot L675-708 UI 快照面挂账不译）。
// 位级要点:
//   ① Float32Array 语义 = C# float[]——读出转 double 运算、写入 (float) 舍入
//     （JS TypedArray 写入自动 f32 舍入同构；fr() 显式面）。
//   ② order 稳定降序（L192 TypedArray.sort 比较器 elev[b]-elev[a]）——C# 手写
//     归并（elev 降序 + idx 升序双键全序唯一）——DIVERGENCE 记录：比较器减法
//     域 float 符号判定与双键全序位级同构。
//   ③ ws.rng 独立 mulberry 流（L117 mulberry32(seed ^ 0x3a91f7)）——
//     WbRng.Mulberry32Next(ref w.wsRngState)；主 rngA 零消费。
//   ④ ep('nature.erosionRate') 黄金驱动默认 1（engineParams REG[14] value:1）——
//     C# 内联 1.0 + DIVERGENCE 注记（M-U7m / M-U18 stormRate 先例）。
//   ⑤ Math.sqrt = IEEE754 正确舍入（JS/C# 位级一致）；Math.hypot fdlibm 域 →
//     WbMath.FdHypot 位精确件；Math.round 半上 → WbMath.JsRound。
//   ⑥ setTerrain 级联 → WbBailRelay.SetTerrain（M-U8a 全级联 + L976 钩子
//     OnTerrainChanged 本件承接——M-U9b 内联面升级）。
//   ⑦ 存档哲学（L13-14）：全部场不入存档——读档由已恢复地形+seed 重导出。
// ============================================================
namespace PixelWorldBox.Wb
{
    internal static class WbWorldsim
    {
        // worldsim.ts L26-29 ELEV_TGT（地形类别 → 海拔场目标值）
        private static double ElevTgt(byte t)
        {
            switch (t)
            {
                case WbConstants.T_DEEP: return -2.6;    // L27
                case WbConstants.T_WATER: return -1.0;   // L27
                case WbConstants.T_SAND: return 0.05;    // L27
                case WbConstants.T_GRASS: return 0.18;   // L27
                case WbConstants.T_FOREST: return 0.2;   // L27
                case WbConstants.T_HILL: return 0.5;     // L27
                case WbConstants.T_MOUNTAIN: return 0.85; // L27
                case WbConstants.T_SNOW: return 0.18;    // L28
                case WbConstants.T_LAVA: return 0.7;     // L28
                case WbConstants.T_BURNT: return 0.18;   // L28
                case WbConstants.T_ICE: return -0.9;     // L28
                default: return 0.18;                    // L124 ?? 0.18
            }
        }

        // worldsim.ts L31-34 SOIL_BASE（地形类别 → 初始土壤肥力）
        private static byte SoilBase(byte t)
        {
            switch (t)
            {
                case WbConstants.T_DEEP: return 40;      // L32
                case WbConstants.T_WATER: return 45;     // L32
                case WbConstants.T_SAND: return 64;      // L32
                case WbConstants.T_GRASS: return 142;    // L32
                case WbConstants.T_FOREST: return 152;   // L32
                case WbConstants.T_HILL: return 112;     // L32
                case WbConstants.T_MOUNTAIN: return 66;  // L33
                case WbConstants.T_SNOW: return 92;      // L33
                case WbConstants.T_LAVA: return 30;      // L33
                case WbConstants.T_BURNT: return 96;     // L33
                case WbConstants.T_ICE: return 45;       // L33
                default: return 128;                     // L125 ?? 128
            }
        }

        private const double ERODE_K = 0.011;   // L36 侵蚀强度系数
        // L37 温标注释：tempF ≈ 0.6 赤道 → −0.5 极地；<−0.15 约=冰点以下

        /// <summary>worldsim.ts L114-150 initFromTerrain——由地形类别+seed 重导出全部场（generate 与 applySave 共用）</summary>
        internal static void InitFromTerrain(WbWorld w)
        {
            int seed = w.wsSeed;                                                                                         // L116（eng.seed 承载面——C# wsSeed 字段由 applyWorldGen/黄金夹具注入 baseSeed）
            w.wsRngState = (uint)(seed ^ 0x3a91f7);                                                                      // L117（独立 mulberry 流——主 rngA 零消费）
            int n = WbWorld.W * WbWorld.H;
            for (int i = 0; i < n; i++)                                                                                  // L119
            {
                byte t = w.terrain[i];                                                                                   // L120
                int x = i % WbWorld.W;                                                                                   // L121
                int y = (i / WbWorld.W) | 0;                                                                             // L122
                // L124 连续海拔 = 类别基值 + fBm 细节（±0.16 幅——(fbm-0.5)*0.16）
                w.elev[i] = (float)((ElevTgt(t) + (WbNoise.Fbm(x / 14.0, y / 14.0, seed + 4040, 3) - 0.5) * 0.16));
                w.soilF[i] = SoilBase(t);                                                                                // L125
                w.glacier[i] = 0;                                                                                        // L126
                w.driftAcc[i] = 0;                                                                                       // L127
                w.tNoise[i] = (float)((WbNoise.Fbm(x / 40.0, y / 40.0, seed + 8080, 3) - 0.5) * 0.3);                    // L128
                w.flowAcc[i] = 0f;                                                                                       // L129
            }
            // L131-139 粗网格清零/基线
            System.Array.Clear(w.psi, 0, w.psi.Length);                                                                  // L131
            System.Array.Clear(w.curU, 0, w.curU.Length);                                                                // L132
            System.Array.Clear(w.curV, 0, w.curV.Length);                                                                // L133
            System.Array.Clear(w.sstAnom, 0, w.sstAnom.Length);                                                          // L134
            System.Array.Clear(w.heatQ, 0, w.heatQ.Length);                                                              // L135
            System.Array.Clear(w.qNext, 0, w.qNext.Length);                                                              // L136
            System.Array.Clear(w.upwell, 0, w.upwell.Length);                                                            // L137
            for (int c = 0; c < w.cont.Length; c++) w.cont[c] = 0.5f;                                                    // L138 cont.fill(0.5)
            System.Array.Clear(w.coastal, 0, w.coastal.Length);                                                          // L139
            w.eroded = 0;                                                                                                // L140
            w.deposited = 0;                                                                                             // L141
            w.biomeDrift = 0;                                                                                            // L142
            w.seaLevel = 0;                                                                                              // L143
            w.coastNoteCd = 0;                                                                                           // L144
            w.glacierTiles = 0;                                                                                          // L145
            w.upwellingCells = 0;                                                                                        // L146
            w.strongFrac = 0;                                                                                            // L147
            w.globalTemp = ComputeTemps(w);                                                                              // L148
            w.baselineTemp = w.globalTemp;                                                                               // L149
        }

        /// <summary>worldsim.ts L153-165 onTerrainChanged——setTerrain 同步钩子（WbBailRelay.SetTerrain L976 承接点）</summary>
        internal static void OnTerrainChanged(WbWorld w, int i, byte t)
        {
            double tgt = ElevTgtDefined(t) ? ElevTgt(t) : double.NaN;                                                    // L154（tgt !== undefined 面——查表命中性显式化）
            if (ElevTgtDefined(t)) w.elev[i] = (float)(w.elev[i] + (tgt - w.elev[i]) * 0.7);                             // L155（float 读→double 运算→(float) 写）
            // L157 火烧地力损耗（灰烬回田要等腐殖质慢慢累积）
            if (t == WbConstants.T_BURNT && w.soilF[i] > 8) w.soilF[i] -= 8;
            // L159-163 水面/岩浆覆写清除冰川覆被（冰盖记忆不穿越海侵）
            if ((t == WbConstants.T_WATER || t == WbConstants.T_DEEP || t == WbConstants.T_LAVA) && w.glacier[i] > 0)
            {
                if (w.glacier[i] > 80) w.glacierTiles--;                                                                 // L160
                w.glacier[i] = 0;                                                                                        // L161
                w.dirty.Add(i);                                                                                          // L162（worldsim 面单格脏——M-U9b 内联面升级位）
            }
            w.driftAcc[i] = 0;                                                                                           // L164
        }

        /// <summary>L154 tgt !== undefined 门（ELEV_TGT 查表命中性——11 类全覆盖时恒真，防御面）</summary>
        private static bool ElevTgtDefined(byte t)
        {
            return t <= WbConstants.T_ICE;   // 0..11 全注册（T.SWAMP=11 无表项——L26 表缺 SWAMP→undefined）
        }

        // ==================================================================
        // 二 + 三：水力侵蚀与沉积 + 土壤动态（每 600 tick，与 geologyTick %31 错峰）
        // ==================================================================
        /// <summary>worldsim.ts L175-294 hydroTick（槽 56 %600===41）</summary>
        internal static void HydroTick(WbWorld w)
        {
            int n = WbWorld.W * WbWorld.H;
            float[] elev = w.elev;                                                                                       // L179
            // —— 1) 降水加权：大气 moist 场（粗网格映射）× 降雨 + 河道流量加成 ——
            for (int y = 0; y < WbWorld.H; y++)                                                                          // L181
            {
                int cy = System.Math.Min(WbConstants.AH - 1, (y / 8) | 0);                                               // L182（CELL=8）
                int rowBase = cy * WbConstants.AW;                                                                       // L183
                for (int x = 0; x < WbWorld.W; x++)                                                                      // L184
                {
                    int i = y * WbWorld.W + x;                                                                           // L185
                    int c = rowBase + ((x / 8) | 0);                                                                     // L186
                    w.flowAcc[i] = (float)(0.5 + w.moist[c] * 2 + (w.rainCell[c] / 255.0) * 1.2 + (w.riverDir[i] > 0 ? 8 : 0));   // L187（f32 舍入）
                }
            }
            // —— 2) 全图海拔降序排序（Uint32Array 数值排序稳定；水格沉底成为汇）——
            //    DIVERGENCE：JS TypedArray.sort 比较器稳定 → C# 手写归并（elev 降序 + idx 升序双键全序）。
            for (int i = 0; i < n; i++) w.order[i] = (uint)i;                                                            // L191
            StableSortByElevDesc(w, n);                                                                                  // L192
            // —— 3) 流向累加：每格把累计流量传给最低邻居（8 邻域）——
            for (int k = 0; k < n; k++)                                                                                  // L194
            {
                int i = (int)w.order[k];                                                                                 // L195
                byte t = w.terrain[i];                                                                                   // L196
                if (t == WbConstants.T_DEEP || t == WbConstants.T_WATER) continue;                                       // L197 海是终点
                int x = i % WbWorld.W;                                                                                   // L198
                int y = (i / WbWorld.W) | 0;                                                                             // L199
                int best = -1;                                                                                           // L200
                double bestE = elev[i];                                                                                  // L201
                for (int dy = -1; dy <= 1; dy++)                                                                         // L202
                {
                    int yy = y + dy;                                                                                     // L203
                    if (yy < 0 || yy >= WbWorld.H) continue;                                                             // L204
                    for (int dx = -1; dx <= 1; dx++)                                                                     // L205
                    {
                        if (dx == 0 && dy == 0) continue;                                                                // L206
                        int xx = x + dx;                                                                                 // L207
                        if (xx < 0 || xx >= WbWorld.W) continue;                                                         // L208
                        int j = yy * WbWorld.W + xx;                                                                     // L209
                        if (elev[j] < bestE) { bestE = elev[j]; best = j; }                                              // L210
                    }
                }
                if (best >= 0) w.flowAcc[best] = (float)(w.flowAcc[best] + w.flowAcc[i]);                                // L213（f32 舍入——累加序由稳定序保证）
            }
            // —— 4) 侵蚀与沉积 ——
            for (int y = 0; y < WbWorld.H; y++)                                                                          // L216
            {
                for (int x = 0; x < WbWorld.W; x++)                                                                      // L217
                {
                    int i = y * WbWorld.W + x;                                                                           // L218
                    byte t = w.terrain[i];                                                                               // L219
                    if (t == WbConstants.T_DEEP || t == WbConstants.T_WATER) continue;                                   // L220
                    double minE = double.PositiveInfinity;                                                               // L221
                    for (int dy = -1; dy <= 1; dy++)                                                                     // L222
                    {
                        int yy = y + dy;                                                                                 // L223
                        if (yy < 0 || yy >= WbWorld.H) continue;                                                         // L224
                        for (int dx = -1; dx <= 1; dx++)                                                                 // L225
                        {
                            if (dx == 0 && dy == 0) continue;                                                            // L226
                            int xx = x + dx;                                                                             // L227
                            if (xx < 0 || xx >= WbWorld.W) continue;                                                     // L228
                            double e = elev[yy * WbWorld.W + xx];                                                        // L229
                            if (e < minE) minE = e;                                                                      // L230
                        }
                    }
                    double slope = elev[i] - minE;                                                                       // L233
                    double f = w.flowAcc[i];                                                                             // L234
                    if (slope > 0.05 && f > 2.5)                                                                         // L235
                    {
                        // 侵蚀：坡陡流大 → 山体被慢慢刻出谷地（单步 ≤0.02；冰川格 ×1.6 = U 谷刻痕）
                        double er = System.Math.Min(0.02, ERODE_K * 1.0 * System.Math.Sqrt(f) * slope);                  // L237（ep('nature.erosionRate') 内联 1——DIVERGENCE 注记④）
                        if (w.glacier[i] > 80) er *= 1.6;                                                                // L238
                        elev[i] = (float)(elev[i] - er);                                                                 // L239
                        w.eroded += er;                                                                                  // L240
                    }
                    else if (slope < 0.015 && f > 3 && elev[i] < 0.32)                                                   // L241
                    {
                        // 沉积：平缓低地 → 泥沙落淤 + 肥力累积（泛滥平原由此涌现）
                        elev[i] = (float)(elev[i] + System.Math.Min(0.006, 0.002 * System.Math.Sqrt(f)));                // L243
                        w.soilF[i] = (byte)System.Math.Min(255, w.soilF[i] + 2 + (int)(WbRng.Mulberry32Next(ref w.wsRngState) * 4.0));   // L244（ws 流 1 掷）
                        w.deposited += 0.004;                                                                            // L245
                    }
                }
            }
            // —— 5) 河口三角洲：riverDir>0 的入海格，邻陆优先沉积 ——
            foreach (int i in w.riverTilesList)                                                                          // L250（JS Set 迭代序——List 镜像同构）
            {
                int x = i % WbWorld.W;                                                                                   // L251
                int y = (i / WbWorld.W) | 0;                                                                             // L252
                bool mouth = false;                                                                                      // L253
                for (int k = 0; k < 4; k++)                                                                              // L254
                {
                    int xx = x + (k == 0 ? -1 : k == 1 ? 1 : 0);                                                         // L255
                    int yy = y + (k == 2 ? -1 : k == 3 ? 1 : 0);                                                         // L256
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                // L257
                    int j = yy * WbWorld.W + xx;                                                                         // L258
                    if (WbWorld.IsWater(w.terrain[j]) && !w.riverTiles.Contains(j)) mouth = true;                        // L259
                }
                if (!mouth) continue;                                                                                    // L261
                for (int k = 0; k < 4; k++)                                                                              // L262
                {
                    int xx = x + (k == 0 ? -1 : k == 1 ? 1 : 0);                                                         // L263
                    int yy = y + (k == 2 ? -1 : k == 3 ? 1 : 0);                                                         // L264
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                // L265
                    int j = yy * WbWorld.W + xx;                                                                         // L266
                    if (!WbWorld.IsWater(w.terrain[j]) && w.terrain[j] != WbConstants.T_LAVA)                            // L267
                    {
                        w.soilF[j] = (byte)System.Math.Min(255, w.soilF[j] + 3);                                         // L268
                        elev[j] = (float)(elev[j] + 0.003);                                                              // L269
                        w.deposited += 0.003;                                                                            // L270
                    }
                }
            }
            // —— 6) 土壤动态：植被腐殖质 +1 / 沙地淋失 −1 / 过牧采样 −2 ——
            bool overgraze = w.ecoState == "overgraze" || w.ecoState == "collapse";                                      // L275
            for (int i = 0; i < n; i++)                                                                                  // L276
            {
                byte t = w.terrain[i];                                                                                   // L277
                if (t == WbConstants.T_GRASS || t == WbConstants.T_FOREST)                                               // L278
                {
                    if (w.soilF[i] < 255) w.soilF[i]++;                                                                  // L279
                }
                else if (t == WbConstants.T_SAND)                                                                        // L280
                {
                    if (w.soilF[i] > 0) w.soilF[i]--;                                                                    // L281
                }
                if (overgraze && t == WbConstants.T_GRASS && (i & 7) == 0 && w.soilF[i] > 1) w.soilF[i] -= 2;            // L283
            }
            // —— 7) 连续场 → 地形类别投影（随机采样 600 格，防空间偏置；单期 ≤24 格缓变）——
            int reclassed = 0;                                                                                           // L286
            for (int k = 0; k < 600 && reclassed < 24; k++)                                                              // L287
            {
                int i = (int)(WbRng.Mulberry32Next(ref w.wsRngState) * n);                                               // L288（ws 流 1 掷）
                byte t = w.terrain[i];                                                                                   // L289
                if (t == WbConstants.T_MOUNTAIN && elev[i] < 0.52) { WbBailRelay.SetTerrain(w, i, WbConstants.T_HILL); reclassed++; }     // L290
                else if (t == WbConstants.T_HILL && elev[i] < 0.24) { WbBailRelay.SetTerrain(w, i, WbConstants.T_GRASS); reclassed++; }   // L291
                else if (t == WbConstants.T_GRASS && elev[i] > 0.62) { WbBailRelay.SetTerrain(w, i, WbConstants.T_HILL); reclassed++; }   // L292
            }
        }

        /// <summary>L192 稳定归并：elev 降序 + idx 升序双键（JS TypedArray.sort 比较器稳定同构——位级要点②）</summary>
        private static void StableSortByElevDesc(WbWorld w, int n)
        {
            uint[] src = w.order;
            uint[] buf = new uint[n];   // scratch（测试面量级一次性分配——40k）
            float[] elev = w.elev;
            for (int width = 1; width < n; width <<= 1)
            {
                for (int lo = 0; lo < n; lo += width << 1)
                {
                    int mid = System.Math.Min(lo + width, n);
                    int hi = System.Math.Min(lo + (width << 1), n);
                    int a = lo, b = mid, o = lo;
                    while (a < mid && b < hi)
                    {
                        // JS 比较器 elev[b]-elev[a]：elev[a] > elev[b] → a 先；相等 → idx 小（原序）先
                        if (elev[(int)src[a]] > elev[(int)src[b]] || (elev[(int)src[a]] == elev[(int)src[b]] && src[a] <= src[b])) buf[o++] = src[a++];
                        else buf[o++] = src[b++];
                    }
                    while (a < mid) buf[o++] = src[a++];
                    while (b < hi) buf[o++] = src[b++];
                }
                System.Array.Copy(buf, 0, src, 0, n);
            }
        }

        // ==================================================================
        // 四：动态温度场（每 120 tick：%120===27）
        // ==================================================================
        /// <summary>worldsim.ts L299-302 tempTick（槽 54）——全球均温慢 EMA</summary>
        internal static void TempTick(WbWorld w)
        {
            w.globalTemp += (ComputeTemps(w) - w.globalTemp) * 0.12;                                                     // L301
        }

        /// <summary>worldsim.ts L304-360 computeTemps——全图温度场（纬度基线+海拔递减+大陆度+灰烬+洋流）</summary>
        private static double ComputeTemps(WbWorld w)
        {
            int n = WbWorld.W * WbWorld.H;
            // 1) 粗格水格清点（一次全图遍历）
            System.Array.Clear(w.waterCnt, 0, w.waterCnt.Length);                                                        // L309
            for (int i = 0; i < n; i++)                                                                                  // L310
            {
                if (WbWorld.IsWater(w.terrain[i])) w.waterCnt[w.NatureCellOf(i % WbWorld.W, (i / WbWorld.W) | 0)]++;     // L311
            }
            // 2) 大陆度记忆（指数平滑 α=0.05）
            for (int c = 0; c < WbConstants.AW * WbConstants.AH; c++)                                                    // L314
            {
                double wf = w.waterCnt[c] / 64.0;                                                                        // L315（CELL*CELL=64）
                w.cont[c] = (float)(w.cont[c] + (1 - wf - w.cont[c]) * 0.05);                                            // L316
            }
            // 3) 陆格邻近洋流海温（4 邻粗格水格均值）
            for (int cy = 0; cy < WbConstants.AH; cy++)                                                                  // L319
            {
                for (int cx = 0; cx < WbConstants.AW; cx++)                                                              // L320
                {
                    int c = cy * WbConstants.AW + cx;                                                                    // L321
                    if (w.waterCnt[c] > 32) { w.coastal[c] = 0f; continue; }                                             // L322
                    double sumSst = 0;                                                                                   // L323（s 命名避让——L333 season int s 同方法作用域）
                    int cnt = 0;                                                                                         // L324
                    if (cx > 0 && w.waterCnt[c - 1] > 32) { sumSst += w.sstAnom[c - 1]; cnt++; }                              // L325
                    if (cx < WbConstants.AW - 1 && w.waterCnt[c + 1] > 32) { sumSst += w.sstAnom[c + 1]; cnt++; }             // L326
                    if (cy > 0 && w.waterCnt[c - WbConstants.AW] > 32) { sumSst += w.sstAnom[c - WbConstants.AW]; cnt++; }    // L327
                    if (cy < WbConstants.AH - 1 && w.waterCnt[c + WbConstants.AW] > 32) { sumSst += w.sstAnom[c + WbConstants.AW]; cnt++; }   // L328
                    w.coastal[c] = cnt > 0 ? (float)(sumSst / cnt) : 0f;                                                      // L329
                }
            }
            // 4) 全图温度场：纬度基线 + 海拔递减率 + 大陆度季节振幅 + 灰烬遮蔽 + 洋流异常
            int s = w.NatureSeason();                                                                                    // L333
            bool seasonsOn = w.laws.seasons;                                                                             // L334
            double ash = w.ash;                                                                                          // L335
            double sum = 0;                                                                                              // L336
            for (int y = 0; y < WbWorld.H; y++)                                                                          // L337
            {
                double latF = System.Math.Abs(y / (double)WbWorld.H - 0.5) * 2;                                          // L338（0 赤道 → 1 极地）
                int cy = System.Math.Min(WbConstants.AH - 1, (y / 8) | 0);                                               // L339
                int rowBase = cy * WbConstants.AW;                                                                       // L340
                for (int x = 0; x < WbWorld.W; x++)                                                                      // L341
                {
                    int i = y * WbWorld.W + x;                                                                           // L342
                    int c = rowBase + ((x / 8) | 0);                                                                     // L343
                    double tv = 0.6 - latF * 1.1 + w.tNoise[i];                                                          // L344
                    if (w.elev[i] > 0) tv -= w.elev[i] * 0.55;                                                           // L345（海拔递减率）
                    if (seasonsOn)                                                                                       // L346
                    {
                        double amp = 0.45 + w.cont[c] * 0.75;                                                            // L347（大陆度放大季节振幅）
                        tv += s == 3 ? -0.16 * amp : s == 1 ? 0.1 * amp : 0;                                             // L348
                    }
                    tv -= ash * 0.3;                                                                                     // L350（灰烬遮蔽冷却）
                    if (!WbWorld.IsWater(w.terrain[i])) tv += w.coastal[c] * 0.4;                                        // L351（湾流暖岸/寒流凉岸）
                    w.tempF[i] = (float)tv;                                                                              // L352
                    sum += tv;                                                                                           // L353
                    // 覆盖层量化（与旧 tempMap 同量纲：(t+0.5)×165——寒/温/热三档阈值不变）
                    w.tempOverlay[i] = (byte)System.Math.Max(0, System.Math.Min(255, WbMath.JsRound((tv + 0.5) * 165.0)));   // L355
                }
            }
            // L358 overlayMode 渲染覆盖层门——宿主渲染面省略（sim 位级无效应——网页渲染未译域注记）
            return sum / n;                                                                                              // L359
        }

        // ==================================================================
        // 五：洋流系统（每 120 tick：%120===15，只在水粗格）
        // ==================================================================
        /// <summary>worldsim.ts L365-481 oceanTick（槽 44）——Stommel 流函数 Jacobi + 热含量平流 + 海温异常</summary>
        internal static void OceanTick(WbWorld w)
        {
            if (!w.laws.atmosphere) return;                                                                              // L368
            int nc = WbConstants.AW * WbConstants.AH;
            // 1) 水格清点 + 风应力（640 次 windAt）
            System.Array.Clear(w.waterCnt, 0, w.waterCnt.Length);                                                        // L372
            for (int i = 0; i < WbWorld.W * WbWorld.H; i++)                                                              // L373
            {
                if (WbWorld.IsWater(w.terrain[i])) w.waterCnt[w.NatureCellOf(i % WbWorld.W, (i / WbWorld.W) | 0)]++;     // L374
            }
            for (int cy = 0; cy < WbConstants.AH; cy++)                                                                  // L376
            {
                for (int cx = 0; cx < WbConstants.AW; cx++)                                                              // L377
                {
                    int c = cy * WbConstants.AW + cx;                                                                    // L378
                    if (!IsOcean(w, c)) { w.windU[c] = 0f; w.windV[c] = 0f; continue; }                                  // L379
                    var wv2 = w.NatureWindAt(cx, cy);                                                                    // L380（(u, v) 元组）
                    w.windU[c] = (float)wv2.Item1;
                    w.windV[c] = (float)wv2.Item2;
                }
            }
            // 2) 风应力旋度 curl τ = ∂τy/∂x − ∂τx/∂y（陆格应力为 0）
            for (int cy = 0; cy < WbConstants.AH; cy++)                                                                  // L386
            {
                for (int cx = 0; cx < WbConstants.AW; cx++)                                                              // L387
                {
                    int c = cy * WbConstants.AW + cx;                                                                    // L388
                    if (!IsOcean(w, c)) { w.curlArr[c] = 0f; continue; }                                                 // L389
                    double tE = cx < WbConstants.AW - 1 && IsOcean(w, c + 1) ? w.windV[c + 1] : 0;                       // L390
                    double tW = cx > 0 && IsOcean(w, c - 1) ? w.windV[c - 1] : 0;                                        // L391
                    double tS = cy < WbConstants.AH - 1 && IsOcean(w, c + WbConstants.AW) ? w.windU[c + WbConstants.AW] : 0;   // L392
                    double tN = cy > 0 && IsOcean(w, c - WbConstants.AW) ? w.windU[c - WbConstants.AW] : 0;              // L393
                    w.curlArr[c] = (float)((tE - tW) / 2 - (tS - tN) / 2);                                               // L394
                }
            }
            // 3) Stommel 流函数 Jacobi（Gauss-Seidel 就地松弛 24 次——ψ 暖启动跨期收敛）
            const double EPS = 0.3;                                                                                      // L399
            const double BETA = 0.16;                                                                                    // L400
            for (int it = 0; it < 24; it++)                                                                              // L401
            {
                for (int cy = 1; cy < WbConstants.AH - 1; cy++)                                                          // L402
                {
                    for (int cx = 1; cx < WbConstants.AW - 1; cx++)                                                      // L403
                    {
                        int c = cy * WbConstants.AW + cx;                                                                // L404
                        if (!IsOcean(w, c)) continue;                                                                    // L405
                        double pE = IsOcean(w, c + 1) ? w.psi[c + 1] : 0;                                                // L406
                        double pW = IsOcean(w, c - 1) ? w.psi[c - 1] : 0;                                                // L407
                        double pS = IsOcean(w, c + WbConstants.AW) ? w.psi[c + WbConstants.AW] : 0;                      // L408
                        double pN = IsOcean(w, c - WbConstants.AW) ? w.psi[c - WbConstants.AW] : 0;                      // L409
                        w.psi[c] = (float)((EPS * (pE + pW + pS + pN) + (BETA / 2) * (pE - pW) - w.curlArr[c]) / (4 * EPS));   // L410
                    }
                }
            }
            // 4) 流速场：u = −∂ψ/∂y，v = +∂ψ/∂x（尺度 ×1 后夹断）
            const double CS = 1;                                                                                         // L415
            for (int cy = 0; cy < WbConstants.AH; cy++)                                                                  // L416
            {
                for (int cx = 0; cx < WbConstants.AW; cx++)                                                              // L417
                {
                    int c = cy * WbConstants.AW + cx;                                                                    // L418
                    if (!IsOcean(w, c)) { w.curU[c] = 0f; w.curV[c] = 0f; continue; }                                    // L419
                    double pE = cx < WbConstants.AW - 1 && IsOcean(w, c + 1) ? w.psi[c + 1] : 0;                         // L420
                    double pW = cx > 0 && IsOcean(w, c - 1) ? w.psi[c - 1] : 0;                                          // L421
                    double pS = cy < WbConstants.AH - 1 && IsOcean(w, c + WbConstants.AW) ? w.psi[c + WbConstants.AW] : 0;   // L422
                    double pN = cy > 0 && IsOcean(w, c - WbConstants.AW) ? w.psi[c - WbConstants.AW] : 0;                // L423
                    w.curU[c] = (float)System.Math.Max(-0.6, System.Math.Min(0.6, -(pS - pN) / 2 * CS));                 // L424
                    w.curV[c] = (float)System.Math.Max(-0.6, System.Math.Min(0.6, (pE - pW) / 2 * CS));                  // L425
                }
            }
            // 5) 热含量半拉格朗日平流（赤道暖源注入 + 缓慢衰减）
            for (int cy = 0; cy < WbConstants.AH; cy++)                                                                  // L429
            {
                double lat = cy / (double)(WbConstants.AH - 1);                                                          // L430
                double src = 0.45 * (1 - System.Math.Abs(lat - 0.5) * 2);                                                // L431
                for (int cx = 0; cx < WbConstants.AW; cx++)                                                              // L432
                {
                    int c = cy * WbConstants.AW + cx;                                                                    // L433
                    if (!IsOcean(w, c)) { w.qNext[c] = 0f; continue; }                                                   // L434
                    int sx = (int)System.Math.Max(0, System.Math.Min(WbConstants.AW - 1, WbMath.JsRound(cx - w.curU[c] * 2)));   // L435（Math.round 半上）
                    int sy = (int)System.Math.Max(0, System.Math.Min(WbConstants.AH - 1, WbMath.JsRound(cy - w.curV[c] * 2)));   // L436
                    double up = IsOcean(w, sy * WbConstants.AW + sx) ? w.heatQ[sy * WbConstants.AW + sx] : w.heatQ[c];   // L437
                    w.qNext[c] = (float)((up + src) * 0.975);                                                            // L438
                }
            }
            System.Array.Copy(w.qNext, w.heatQ, nc);                                                                     // L441（heatQ.set(qNext)）
            // 6) 海温异常 = 偏离纬圈均值（×6 放大出 ±0.3 量级的暖池/冷舌）
            for (int cy = 0; cy < WbConstants.AH; cy++)                                                                  // L443
            {
                double sum = 0;                                                                                          // L444
                int cnt = 0;                                                                                             // L445
                for (int cx = 0; cx < WbConstants.AW; cx++)                                                              // L446
                {
                    int c = cy * WbConstants.AW + cx;                                                                    // L447
                    if (IsOcean(w, c)) { sum += w.heatQ[c]; cnt++; }                                                     // L448
                }
                double zmean = cnt > 0 ? sum / cnt : 0;                                                                  // L450
                for (int cx = 0; cx < WbConstants.AW; cx++)                                                              // L451
                {
                    int c = cy * WbConstants.AW + cx;                                                                    // L452
                    if (!IsOcean(w, c)) { w.sstAnom[c] = 0f; continue; }                                                 // L453
                    w.sstAnom[c] = (float)System.Math.Max(-1.0, System.Math.Min(1.0, (w.heatQ[c] - zmean) * 6));         // L454
                }
            }
            // 7) 上升流：赤道辐合带东侧 + 大陆西岸（简化判定）→ 冷水上翻 + 渔场标记
            w.upwellingCells = 0;                                                                                        // L458
            for (int cy = 0; cy < WbConstants.AH; cy++)                                                                  // L459
            {
                double lat = cy / (double)(WbConstants.AH - 1);                                                          // L460
                for (int cx = 0; cx < WbConstants.AW; cx++)                                                              // L461
                {
                    int c = cy * WbConstants.AW + cx;                                                                    // L462
                    if (!IsOcean(w, c)) { w.upwell[c] = 0; continue; }                                                   // L463
                    bool up = System.Math.Abs(lat - w.NatureItczLat()) < 0.1 && (cx < WbConstants.AW * 0.25 || cx > WbConstants.AW * 0.75);   // L464
                    w.upwell[c] = up ? (byte)1 : (byte)0;                                                                // L465
                    if (up)                                                                                              // L466
                    {
                        w.sstAnom[c] = (float)System.Math.Max(-1.0, w.sstAnom[c] - 0.16);                                // L467
                        w.upwellingCells++;                                                                              // L468
                    }
                }
            }
            // 8) 强流占比（快照：西边界强化是否成形）
            int strong = 0;                                                                                              // L473
            int waterN = 0;                                                                                              // L474
            for (int c = 0; c < nc; c++)                                                                                 // L475
            {
                if (!IsOcean(w, c)) continue;                                                                            // L476
                waterN++;                                                                                                // L477
                if (WbMath.FdHypot(w.curU[c], w.curV[c]) > 0.35) strong++;                                               // L478（fdlibm hypot——位精确件）
            }
            w.strongFrac = waterN > 0 ? strong / (double)waterN : 0;                                                     // L480
        }

        /// <summary>L370 isOcean——粗格水格数 >32 门</summary>
        private static bool IsOcean(WbWorld w, int c)
        {
            return w.waterCnt[c] > 32;
        }

        // ==================================================================
        // 六：冰川系统（每 240 tick：%240===33——积累/消融全图结算 + 采样 300 格进退）
        // ==================================================================
        /// <summary>worldsim.ts L486-552 glacierTick（槽 55）</summary>
        internal static void GlacierTick(WbWorld w)
        {
            int n = WbWorld.W * WbWorld.H;
            // —— 1) 积累 / 消融（O(40k) 全图）：极地低地 tempF<−0.15；山地 elev>0.45 放宽到 0.02 ——
            for (int i = 0; i < n; i++)                                                                                  // L491
            {
                int g = w.glacier[i];                                                                                    // L492
                byte t = w.terrain[i];                                                                                   // L493
                if (t == WbConstants.T_DEEP || t == WbConstants.T_WATER || t == WbConstants.T_ICE || t == WbConstants.T_LAVA) continue;   // L494
                double tv = w.tempF[i];                                                                                  // L495
                double accTh = w.elev[i] > 0.45 ? 0.02 : -0.15;                                                          // L496
                if (tv < accTh)                                                                                          // L497
                {
                    int before = g;                                                                                      // L498
                    w.glacier[i] = (byte)System.Math.Min(255, g + 2 + (int)(WbRng.Mulberry32Next(ref w.wsRngState) * 3.0));   // L499（+2~4，ws 流 1 掷）
                    if (before <= 80 && w.glacier[i] > 80)                                                               // L500
                    {
                        w.dirty.Add(i);                                                                                  // L501（视觉冰盖阈值跨越 → 重绘）
                        w.glacierTiles++;                                                                                // L502
                    }
                }
                else if (tv > 0.1 && g > 0)                                                                              // L504
                {
                    // 消融（火山灰期全球降温由 tempF 的 ash 项自动反馈为扩张）
                    w.glacier[i] = (byte)System.Math.Max(0, g - 3);                                                      // L506
                    if (g > 80 && w.glacier[i] <= 80)                                                                    // L507
                    {
                        w.dirty.Add(i);                                                                                  // L508
                        w.glacierTiles--;                                                                                // L509
                    }
                }
            }
            // —— 2) 采样 300 随机格：进退结算 ——
            for (int k = 0; k < 300; k++)                                                                                // L514
            {
                int i = (int)(WbRng.Mulberry32Next(ref w.wsRngState) * n);                                               // L515（ws 流 1 掷）
                byte t = w.terrain[i];                                                                                   // L516
                if (t == WbConstants.T_DEEP || t == WbConstants.T_WATER || t == WbConstants.T_ICE || t == WbConstants.T_LAVA) continue;   // L517
                // 进：质量 >180 向低处邻居蔓延（advance）
                if (w.glacier[i] > 180)                                                                                  // L519
                {
                    int x = i % WbWorld.W;                                                                               // L520
                    int y = (i / WbWorld.W) | 0;                                                                         // L521
                    int best = -1;                                                                                       // L522
                    double bestE = w.elev[i];                                                                            // L523
                    for (int dy = -1; dy <= 1; dy++)                                                                     // L524
                    {
                        int yy = y + dy;                                                                                 // L525
                        if (yy < 0 || yy >= WbWorld.H) continue;                                                         // L526
                        for (int dx = -1; dx <= 1; dx++)                                                                 // L527
                        {
                            if (dx == 0 && dy == 0) continue;                                                            // L528
                            int xx = x + dx;                                                                             // L529
                            if (xx < 0 || xx >= WbWorld.W) continue;                                                     // L530
                            int j = yy * WbWorld.W + xx;                                                                 // L531
                            byte tj = w.terrain[j];                                                                      // L532
                            if (tj == WbConstants.T_DEEP || tj == WbConstants.T_WATER || tj == WbConstants.T_ICE || tj == WbConstants.T_LAVA) continue;   // L533
                            if (w.elev[j] < bestE) { bestE = w.elev[j]; best = j; }                                      // L534
                        }
                    }
                    if (best >= 0)                                                                                       // L537
                    {
                        int bj = w.glacier[best];                                                                        // L538
                        w.glacier[best] = (byte)System.Math.Max(bj, 40);                                                 // L539
                        if (bj <= 80 && w.glacier[best] > 80)                                                            // L540
                        {
                            w.dirty.Add(best);                                                                           // L541
                            w.glacierTiles++;                                                                            // L542
                        }
                    }
                }
                // 退：消融殆尽 → 清零（retreat，露出原地形；雪线进退交给群系漂移）
                if (w.glacier[i] > 0 && w.glacier[i] < 30)                                                               // L547
                {
                    if (w.glacier[i] > 80) w.glacierTiles--;                                                             // L548
                    w.glacier[i] = 0;                                                                                    // L549
                }
            }
        }

        // ==================================================================
        // 七：海平面与海岸线进退（每 600 tick：%600===47）
        // ==================================================================
        /// <summary>worldsim.ts L557-600 coastTick（槽 57）——全球均温驱动海岸线进退（有主领土一律绕行）</summary>
        internal static void CoastTick(WbWorld w)
        {
            // 全球均温驱动（每地质期一步，clamp ±8 米：变冷海退 / 变暖海侵）
            w.seaLevel = System.Math.Max(-8.0, System.Math.Min(8.0, w.seaLevel + (w.globalTemp - w.baselineTemp) * 0.02));   // L560
            if (w.coastNoteCd > 0) w.coastNoteCd -= 600;                                                                 // L561
            if (!w.laws.naturalDisasters) return;                                                                        // L562
            int changed = 0;                                                                                             // L563
            int noteKind = 0;                                                                                            // L564（1 海侵 / 2 海退）
            for (int k = 0; k < 30 && changed < 2; k++)                                                                  // L565
            {
                int i = (int)(WbRng.Mulberry32Next(ref w.wsRngState) * WbWorld.W * WbWorld.H);                           // L566（ws 流 1 掷）
                // 安全约束：有主领土 / 建筑 / 单位密集格一律跳过
                if (w.owner[i] >= 0 || w.building[i] > 0) continue;                                                      // L568
                int x = i % WbWorld.W;                                                                                   // L569
                int y = (i / WbWorld.W) | 0;                                                                             // L570
                int bx = System.Math.Min(WbWorld.BKW - 1, (x / 4) | 0);                                                  // L571
                int by = System.Math.Min(WbWorld.BKH - 1, (y / 4) | 0);                                                  // L572
                var bk = w.buckets[by * WbWorld.BKW + bx];                                                               // L573
                if (bk != null && bk.Count > 0) continue;                                                                // L573（length > 0 门）
                byte t = w.terrain[i];                                                                                   // L574
                bool seaN = false;                                                                                       // L575
                bool landN = false;                                                                                      // L576
                for (int d = 0; d < 4; d++)                                                                              // L577
                {
                    int xx = x + (d == 0 ? -1 : d == 1 ? 1 : 0);                                                         // L578
                    int yy = y + (d == 2 ? -1 : d == 3 ? 1 : 0);                                                         // L579
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;                                // L580
                    byte nt = w.terrain[yy * WbWorld.W + xx];                                                            // L581
                    if (nt == WbConstants.T_WATER || nt == WbConstants.T_DEEP) seaN = true;                              // L582
                    else landN = true;                                                                                   // L583
                }
                if (t == WbConstants.T_SAND && w.seaLevel > 0.5 && seaN && w.elev[i] < w.seaLevel * 0.012)               // L585
                {
                    WbBailRelay.SetTerrain(w, i, WbConstants.T_WATER);                                                        // L586（海侵：海水漫上低洼海岸——全级联）
                    changed++;                                                                                           // L587
                    if (noteKind == 0) noteKind = 1;                                                                     // L588
                }
                else if (t == WbConstants.T_WATER && w.seaLevel < -0.5 && w.waterTier[i] <= 1 && landN)                  // L589
                {
                    WbBailRelay.SetTerrain(w, i, WbConstants.T_SAND);                                                         // L590（海退：浅水露出新生滩涂）
                    changed++;                                                                                           // L591
                    if (noteKind == 0) noteKind = 2;                                                                     // L592
                }
            }
            if (changed > 0 && w.coastNoteCd <= 0)                                                                       // L595
            {
                w.coastNoteCd = 2400;                                                                                    // L596（60 年播报冷却）
                if (noteKind == 1) w.AddEvent("geo", "海水漫上了低洼的海岸，咸涩的潮水一年年向内陆蚕食");   // L597
                else if (noteKind == 2) w.AddEvent("geo", "海退了——滩涂从浪花下露出新生的沙脊");           // L598
            }
        }

        // ==================================================================
        // 八：群系漂移（每 600 tick：%600===53——全图错配累计 + 池采样迁移）
        // ==================================================================
        /// <summary>worldsim.ts L605-670 biomeTick（槽 58）</summary>
        internal static void BiomeTick(WbWorld w)
        {
            int n = WbWorld.W * WbWorld.H;
            // —— 1) 全图错配累计：与气候期望不符 → driftAcc+1（>3 = 持续 60+ 年错配）；匹配 → 衰减 ——
            //       （复用 order 作错配池 scratch——与 hydroTick %41 错峰不冲突）
            int poolN = 0;                                                                                               // L611
            for (int i = 0; i < n; i++)                                                                                  // L612
            {
                byte t = w.terrain[i];                                                                                   // L613
                // 只动软地形（山/岩浆/焦土/冰不在漂移之列）；无主无房
                if (t != WbConstants.T_GRASS && t != WbConstants.T_FOREST && t != WbConstants.T_SAND && t != WbConstants.T_SNOW) continue;   // L615
                if (w.owner[i] >= 0 || w.building[i] > 0) continue;                                                      // L616
                int x = i % WbWorld.W;                                                                                   // L617
                int y = (i / WbWorld.W) | 0;                                                                             // L618
                int c = w.NatureCellOf(x, y);                                                                            // L619
                double moist = w.moist[c];                                                                               // L620
                double tv = w.tempF[i];                                                                                  // L621
                int soil = w.soilF[i];                                                                                   // L622
                // 气候期望群系（温度 × 湿度 × 肥力三元推断）
                int want;                                                                                                // L624
                if (tv < -0.26) want = WbConstants.T_SNOW;                                                               // L625（极冷 → 苔原雪原）
                else if (tv < -0.02 && moist > 0.5) want = WbConstants.T_FOREST;                                         // L626（冷湿 → 针叶林带）
                else if (moist > 0.62 && soil > 110 && tv > 0.05) want = WbConstants.T_FOREST;                           // L627（暖湿沃土 → 森林）
                else if (moist < 0.3 && tv > 0.38 && soil < 95) want = WbConstants.T_SAND;                               // L628（热干贫土 → 荒漠）
                else want = WbConstants.T_GRASS;                                                                         // L629
                if (want == t)                                                                                           // L630
                {
                    if (w.driftAcc[i] > 0) w.driftAcc[i]--;                                                              // L631（匹配 → 错配记忆衰减）
                    continue;                                                                                            // L632
                }
                if (w.driftAcc[i] < 255) w.driftAcc[i]++;                                                                // L634
                if (w.driftAcc[i] > 3) w.order[poolN++] = (uint)i;                                                       // L635（>3 入池）
            }
            if (poolN == 0) return;                                                                                      // L637
            // —— 2) 采样 60 次迁移掷骰（从错配池随机挑——GRASS 为枢纽）——
            int migrated = 0;                                                                                            // L639
            for (int k = 0; k < 60 && migrated < 12; k++)                                                                // L640
            {
                int i = (int)w.order[(int)(WbRng.Mulberry32Next(ref w.wsRngState) * poolN)];                             // L641（ws 流 1 掷）
                if (w.driftAcc[i] <= 3) continue;                                                                        // L642（已被本轮更早的掷骰迁移过）
                byte t = w.terrain[i];                                                                                   // L643
                int x = i % WbWorld.W;                                                                                   // L644
                int y = (i / WbWorld.W) | 0;                                                                             // L645
                int c = w.NatureCellOf(x, y);                                                                            // L646
                double moist = w.moist[c];                                                                               // L647
                double tv = w.tempF[i];                                                                                  // L648
                int soil = w.soilF[i];                                                                                   // L649
                int want;                                                                                                // L650
                if (tv < -0.26) want = WbConstants.T_SNOW;                                                               // L651
                else if (tv < -0.02 && moist > 0.5) want = WbConstants.T_FOREST;                                         // L652
                else if (moist > 0.62 && soil > 110 && tv > 0.05) want = WbConstants.T_FOREST;                           // L653
                else if (moist < 0.3 && tv > 0.38 && soil < 95) want = WbConstants.T_SAND;                               // L654
                else want = WbConstants.T_GRASS;                                                                         // L655
                // 迁移一步（非 GRASS 群系互转也先经 GRASS 枢纽——缓变防跳变）
                int to = WbConstants.T_GRASS;                                                                            // L657
                if (t == WbConstants.T_GRASS) to = want;                                                                 // L658
                if (to == WbConstants.T_FOREST && soil <= 110) to = WbConstants.T_GRASS;                                 // L659（森林迁移要求 soilF>110）
                if (to != t)                                                                                             // L660
                {
                    WbBailRelay.SetTerrain(w, i, (byte)to);                                                                   // L661（全级联）
                    w.driftAcc[i] = 0;                                                                                   // L662
                    migrated++;                                                                                          // L663
                    w.biomeDrift++;                                                                                      // L664
                }
            }
            if (migrated >= 3)                                                                                           // L667
            {
                w.AddEvent("geo", $"气候在悄悄改写大地：{migrated} 处群系发生了迁移——雪线进退、荒漠化与绿化、草木演替");   // L668
            }
        }
    }
}
