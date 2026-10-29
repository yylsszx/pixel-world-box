// ============================================================
// WbBail.cs — 类名 WbBailRelay（WbRender.cs L142 已有渲染域 WbBail 结构，避让改名）
//             （M-U3h 第一批：case4 商队结算 / case5 殖民建城；第二批：case1 船全量 updateUnit 接管；
//              第三批：case2 涌现接力——inventEmergentTrait/spawnUnit/newFamily/wildCapOf 宿主域）
// 蓝本: src/lib/game/engine.ts（逐行机械翻译，纪律①）
//   wbResume L3215-3302（case1 L3219-3229 / case4 L3286-3290 / case5 L3292-3295）+ updateUnit 前奏 L3455-3464 +
//   grabbedTick L5343-5376 + updateBoat L5608-5660 + disembark L5663-5697 + findLandNear L5589-5606 +
//   caravanArrive L4770-4796 + updateUnitTailJS L4116-4260 + updateUnitPostJS L4262-4334 +
//   moveUnit L5813-5876 + wallBlocks L5804-5812 + passTile L5800-5802 + foundSettlement L5704-5739 +
//   shiftRaceRel L8054-8059 + allianceOfCiv L8061-8065 + R2=L.DRAGON L36 + atWar L2061-2064（WbCivSim 复用）
// 复用（已由 M-U3b 黄金钉住）: WbCivSim.BuildBuilding L1756 / ClaimTile L1719 / AtWar L2061 / CivAt /
//   YEAR_TICKS L1869（constants.ts L9）+ WbMath.FdHypot/FdAtan2/FdCos/FdSin/JsRound
// 桩域（第三批余域，触达即抛——黄金场景受控不可达）:
//   case3 建筑摧毁级联（onBuildingDestroyed/maybeBoardForWar/enemyBuildingNear/castArrow 链）；
//   updateUnit 主体（非船：战斗/职业/尾段）；
//   tail 捕食者索敌+鱼群结队（buckets/preyGrid 宿主结构未译）、漫游逐草/蟹/水生分支；
//   post 拾取本体 / 繁衍 boost+spawn 链；moveUnit flying/aquatic/sandswim/登船分支
// 黄金: scripts/unity-migration/gen-units-bail.mjs（28 场景：C01-C04/S01-S04/B01-B09/G01-G04/E01-E07）
//   + bail-transcript.mjs（28/28 双链）
// ============================================================
using System.Linq;

namespace PixelWorldBox.Wb
{
    public static class WbBailRelay
    {
        // ---------------- RACES 接力域子表（types.ts L157-204 机械转写，11 消费字段） ----------------
        public struct RelayDef
        {
            public bool isCiv, hostile, flying, aquatic, beach, sandswim, predator, undead, coldBlood;
            public double repro, growth;
        }

        // 41 族全表（位置序 = R 枚举序；未列出字段 = types.ts 缺省 false/0）
        public static readonly RelayDef[] RDEF = new RelayDef[41]
        {
            new RelayDef{ isCiv=true,  repro=0.006,  growth=0.5  },                                        // 0 HUMAN L157
            new RelayDef{ isCiv=true,  repro=0.005,  growth=0.3  },                                        // 1 ELF L158
            new RelayDef{ isCiv=true,  repro=0.005,  growth=0.3  },                                        // 2 DWARF L159
            new RelayDef{ isCiv=true,  repro=0.006,  growth=0.65 },                                        // 3 ORC L160
            new RelayDef{ hostile=true, repro=0.0006 },                                                    // 4 BANDIT L161
            new RelayDef{ hostile=true, undead=true },                                                     // 5 ZOMBIE L162
            new RelayDef{ repro=0.004 },                                                                   // 6 SHEEP L163
            new RelayDef{ predator=true, repro=0.004 },                                                    // 7 WOLF L164
            new RelayDef{ predator=true, repro=0.002 },                                                    // 8 BEAR L165
            new RelayDef{ hostile=true, flying=true, predator=true },                                      // 9 DRAGON L166
            new RelayDef{ repro=0.003 },                                                                   // 10 DEER L167
            new RelayDef{ repro=0.004 },                                                                   // 11 PENGUIN L168
            new RelayDef{ repro=0.002 },                                                                   // 12 CAMEL L169
            new RelayDef{ hostile=true, coldBlood=true, repro=0.005 },                                     // 13 SCORPION L170
            new RelayDef{ predator=true, coldBlood=true, repro=0.0035 },                                   // 14 SNAKE L171
            new RelayDef{ predator=true, repro=0.004 },                                                    // 15 SNOWWOLF L172
            new RelayDef{ hostile=true, undead=true },                                                     // 16 SKELETON L173
            new RelayDef{ hostile=true, predator=true },                                                   // 17 DEMON L174（lavaImmune 不入接力域）
            new RelayDef{ hostile=true },                                                                  // 18 MAGE L175
            new RelayDef{ isCiv=true, coldBlood=true, repro=0.0058, growth=0.5 },                          // 19 LIZARD L177
            new RelayDef{ isCiv=true, repro=0.0092, growth=0.85 },                                         // 20 GOBLIN L178
            new RelayDef{ hostile=true, predator=true },                                                   // 21 TROLL L179
            new RelayDef{ hostile=true, predator=true },                                                   // 22 OGRE L180
            new RelayDef{ hostile=true, undead=true },                                                     // 23 WHITEWALKER L181
            new RelayDef{ hostile=true, undead=true },                                                     // 24 VAMPIRE L182
            new RelayDef{ hostile=true, predator=true, aquatic=true },                                     // 25 KRAKEN L184
            new RelayDef{ hostile=true, predator=true, sandswim=true },                                    // 26 SANDWORM L185
            new RelayDef{ hostile=true, predator=true, coldBlood=true },                                   // 27 BASILISK L186
            new RelayDef{ flying=true },                                                                   // 28 ANGEL L188
            new RelayDef{ flying=true },                                                                   // 29 PHOENIX L189
            new RelayDef{ },                                                                               // 30 ENT L190
            new RelayDef{ hostile=true, predator=true, undead=true },                                      // 31 LICH L191
            new RelayDef{ hostile=true, predator=true, coldBlood=true },                                   // 32 HYDRA L192
            new RelayDef{ repro=0.011 },                                                                   // 33 CHICKEN L194
            new RelayDef{ repro=0.008 },                                                                   // 34 PIG L195
            new RelayDef{ repro=0.014 },                                                                   // 35 RABBIT L196
            new RelayDef{ predator=true, repro=0.004 },                                                    // 36 FOX L197
            new RelayDef{ aquatic=true, repro=0.016 },                                                     // 37 FISH L198
            new RelayDef{ aquatic=true, beach=true, repro=0.007 },                                         // 38 CRAB L199
            new RelayDef{ aquatic=true, coldBlood=true, repro=0.003 },                                     // 39 TURTLE L200
            new RelayDef{ aquatic=true, predator=true, repro=0.002 },                                      // 40 SHARK L201
        };

        private static RelayDef DefOf(int race)
        {
            if (race < 0 || race >= RDEF.Length) throw new System.InvalidOperationException($"RDEF race {race} 越界");
            return RDEF[race];
        }

        // 常量（engine R 值 + R2 别名 L36）
        private const int R_BANDIT = 4, R_SHEEP = 6, R_DRAGON = 9, R_FISH = 37, R_CRAB = 38;

        // ================= wbResume L3215-3302（Stage 2 bail 接力分派） =================
        public static void WbResume(WbWorld w, WbU u, int kind, double[] d)
        {
            switch (kind)
            {
                case 4:                                                                                                 // L3286-3290
                    // 商队抵达结算（4 rng + 外交涟漪）+ 尾段
                    CaravanArrive(w, u);
                    if (UpdateUnitTailJS(w, u)) break;
                    UpdateUnitPostJS(w, u);
                    break;
                case 5:                                                                                                 // L3292-3295
                    // 殖民建城（buildBuilding + 圈地 + 播报）—— disembark 已完成落位
                    FoundSettlement(w, u, (int)d[0]);
                    break;
                case 1:
                    // 船单位：Rust 侧 hurt-- 未标脏（bail 早退在 dirty(s) 之前）→ JS 未同步到 h-1。
                    // Task 50 修复：不再补偿——直接 JS 接管，updateUnit 执行唯一一次 hurt--，
                    // Rust 的孤儿写会被下一次重打包热列覆盖 —— 与纯 JS 路径位等。
                    UpdateUnit(w, u);
                    break;                                                                                              // L3219-3229
                case 2:
                    Case2(w, u, d);
                    break;                                                                                              // L3230-3257
                case 3:
                    throw new System.InvalidOperationException("wbResume case3 建筑摧毁级联未翻译（M-U3h 第二批域）");             // L3258-3285
                default:
                    throw new System.InvalidOperationException($"wbResume case {kind} 越界");
            }
        }

        // ================= updateUnit L3455-3464（case1 船可达前奏；主体域桩——bail kind1 契约 = 船单位） =================
        public static void UpdateUnit(WbWorld w, WbU u)
        {
            if (u.hurt > 0) u.hurt--;                                                                                    // L3457
            if ((u.grab ?? 0) > 0) { GrabbedTick(w, u); return; }                                                         // L3459
            if (u.boat != 0)                                                                                             // L3461-3464
            {
                UpdateBoat(w, u);
                return;
            }
            throw new System.InvalidOperationException("updateUnit 主体（非船域：战斗/职业/尾段）未翻译（M-U3h 第二批余域；case1 契约 = 船单位）");
        }

        // ================= grabbedTick L5343-5376（神之手指：抓取/掷飞/落地的眩晕 tick） =================
        private static void GrabbedTick(WbWorld w, WbU u)
        {
            if ((u.grab ?? 0) != 0) u.grab = (u.grab ?? 0) - 2;                                                          // L5344 if (u.grab)
            if ((u.thrT ?? 0) > 0)                                                                                       // L5345
            {
                // 抛物线飞行：水平速度衰减（空气阻力），落点即停
                u.thrT = (u.thrT ?? 0) - 2;                                                                              // L5347
                double nx = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, u.x + (u.thrVx ?? 0) * 2));             // L5348
                double ny = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, u.y + (u.thrVy ?? 0) * 2));             // L5349
                // 撞山即坠（其余地形掠过）
                byte tt = w.terrain[WbWorld.Idx((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))];                 // L5351
                if (tt != WbWorld.T_MOUNTAIN) { u.x = nx; u.y = ny; }                                                    // L5352-5353
                u.thrVx = (u.thrVx ?? 0) * 0.94;                                                                          // L5354
                u.thrVy = (u.thrVy ?? 0) * 0.94;                                                                          // L5355
                if (w.Rng() < 0.3) w.Fx("dust", u.x, u.y, 10);                                                            // L5356
                if ((u.thrT ?? 0) <= 0)                                                                                   // L5357
                {
                    // 落地：眩晕 + 按飞行距离伤害 + 尘土特效
                    double dist = WbMath.FdHypot(u.x - (u.thrX0 ?? u.x), u.y - (u.thrY0 ?? u.y));                          // L5359
                    double dmg = WbMath.JsRound(dist * 2.6);                                                               // L5360
                    u.hp -= dmg;                                                                                           // L5361
                    u.hurt = 24;                                                                                           // L5362
                    u.grab = System.Math.Max(u.grab ?? 0, 24);                                                              // L5363
                    u.thrT = 0;                                                                                            // L5364
                    for (int k = 0; k < 3; k++) w.Fx("dust", u.x + (w.Rng() - 0.5) * 1.6, u.y + (w.Rng() - 0.5) * 1.6, 20);   // L5365
                    if (w.fxDmgNumbers && dmg > 0) w.Fx("dmg", u.x, u.y - 1, 30);                                          // L5366
                    w.shake = System.Math.Max(w.shake, System.Math.Min(5, 1 + dist * 0.3));                                 // L5367
                }
                if (u.hp <= 0) u.dead = 1;                                                                                 // L5369
            }
            else if ((u.grab ?? 0) <= 0)                                                                                  // L5370
            {
                // 眩晕结束：清账归队
                u.grab = 0;                                                                                               // L5371
                u.thrVx = 0;                                                                                              // L5372
                u.thrVy = 0;                                                                                              // L5373
            }
        }

        // ================= updateBoat L5608-5660（殖民船航海：贪心绕障/超时改向/靠岸登陆） =================
        private static void UpdateBoat(WbWorld w, WbU u)
        {
            u.ageF += 2 / (double)WbCivSim.YEAR_TICKS;                                                                    // L5609
            if (u.ageF > u.maxAge) { u.dead = 1; return; }                                                                 // L5610 年迈的殖民者可能死在航程中
            u.boatTTL = u.boatTTL - 1;                                                                                     // L5611
            double dx = u.tx - u.x;
            double dy = u.ty - u.y;
            double d = WbMath.FdHypot(dx, dy);
            _ = d; // 蓝本 L5616 求而未读（后续判断均用平方/再求）——机械保序消 CS0219
            // 超时后改向最近陆地；宽限期内仍找不到岸则海难
            if (u.boatTTL <= 0)                                                                                            // L5617
            {
                if (u.boatTTL <= -600)                                                                                     // L5618
                {
                    u.dead = 1;
                    w.Fx("skull", u.x, u.y, 46);                                                                           // L5620
                    w.AddEvent("shipwreck", "一艘殖民船连同它的船员葬身了大海", null, u.x, u.y);                              // L5621
                    return;
                }
                (double x, double y)? land = FindLandNear(w, u.x, u.y, 14);                                                 // L5624
                if (land.HasValue) { u.tx = land.Value.x; u.ty = land.Value.y; }
            }
            // —— 靠岸登陆判定 —— 目标常在内陆深处：「直航前方被陆地阻断」= 已抵达面向目标的海岸
            double baseAng = WbMath.FdAtan2(u.ty - u.y, u.tx - u.x);                                                        // L5631
            int aheadX = (int)System.Math.Floor(u.x + WbMath.FdCos(baseAng) * 0.4);                                         // L5632
            int aheadY = (int)System.Math.Floor(u.y + WbMath.FdSin(baseAng) * 0.4);                                         // L5633
            bool aheadBlocked = aheadX < 0 || aheadY < 0 || aheadX >= WbWorld.W || aheadY >= WbWorld.H                      // L5634
                || !WbWorld.IsWater(w.terrain[WbWorld.Idx(aheadX, aheadY)]);
            if (aheadBlocked)                                                                                              // L5635
            {
                (double x, double y)? coast = FindLandNear(w, u.x, u.y, 2);
                if (coast.HasValue) { u.tx = coast.Value.x; u.ty = coast.Value.y; }
            }
            if (WbMath.FdHypot(u.tx - u.x, u.ty - u.y) < 2.5)                                                               // L5639
            {
                if (Disembark(w, u)) return;
                // 船边无岸（湖心等罕见情形）：改向目标周边海岸寻地登陆
                if (u.boatTTL > 0)                                                                                          // L5641
                {
                    (double x, double y)? land2 = FindLandNear(w, u.tx, u.ty, 6);
                    if (land2.HasValue) { u.tx = land2.Value.x; u.ty = land2.Value.y; }
                }
            }
            // 航行：直航角 ± 绕障偏角依次尝试（只在水面推进；船速约行军 1.4 倍）
            double step = 0.26;                                                                                             // L5647
            double[] offs = { 0, 0.7, -0.7, 1.4, -1.4, 2.6, -2.6, System.Math.PI };                                          // L5649
            foreach (double off in offs)
            {
                double ang = baseAng + off;
                double nx = u.x + WbMath.FdCos(ang) * step;
                double ny = u.y + WbMath.FdSin(ang) * step;
                if (nx < 1 || ny < 1 || nx > WbWorld.W - 2 || ny > WbWorld.H - 2) continue;                                  // L5652
                if (!WbWorld.IsWater(w.terrain[WbWorld.Idx((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))])) continue;
                u.x = nx;                                                                                                   // L5654
                u.y = ny;
                if (WbMath.FdCos(ang) != 0) u.flip = WbMath.FdCos(ang) < 0 ? 1 : 0;                                          // L5656
                return;
            }
            // 完全被围（罕见）：原地等待下一 tick
        }

        // ================= disembark L5663-5697（靠岸登陆：优先处女地 > 本国 > 战时敌岸） =================
        private static bool Disembark(WbWorld w, WbU u)
        {
            int x = (int)System.Math.Floor(u.x);                                                                            // L5664
            int y = (int)System.Math.Floor(u.y);
            int? best = null;                                                                                              // L5666
            int bestScore = 0;
            for (int dy2 = -1; dy2 <= 1; dy2++)                                                                             // L5668
            {
                for (int dx2 = -1; dx2 <= 1; dx2++)
                {
                    if (dx2 == 0 && dy2 == 0) continue;
                    int xx = x + dx2;                                                                                       // L5671
                    int yy = y + dy2;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                    int i = WbWorld.Idx(xx, yy);                                                                            // L5674
                    int t = w.terrain[i];
                    if (WbWorld.IsWater(t) || t == WbWorld.T_MOUNTAIN || t == WbWorld.T_LAVA) continue;
                    int score = 0;                                                                                          // L5677
                    if (w.owner[i] == -1 && w.building[i] == 0 && WbWorld.Buildable(t)) score = 3; // 处女地
                    else if (w.owner[i] == u.civ && u.civ >= 0) score = 2; // 回到家门
                    else if (u.civ >= 0 && w.owner[i] >= 0 && w.owner[i] != u.civ && WbCivSim.AtWar(w, u.civ, w.owner[i])) score = 1; // 战时入侵
                    if (score > bestScore) { bestScore = score; best = i; }                                                  // L5680
                }
            }
            if (best == null) return false;                                                                                 // L5682
            // WBB.touchMeta() —— boat 列 wasm 镜像写点（civ 层 no-op，同 WbCivSim 先例）                                     // L5683
            int b = best.Value;
            double lx = (b % WbWorld.W) + 0.5;                                                                              // L5684
            double ly = (b / WbWorld.W) + 0.5;
            bool wasColonist = bestScore == 3;                                                                              // L5686
            u.boat = 0;                                                                                                     // L5687
            u.boatTTL = 0;
            u.x = lx; u.y = ly; u.tx = lx; u.ty = ly;                                                                        // L5689-5690
            w.Fx("spawn", lx, ly, 30);                                                                                      // L5691
            if (wasColonist) FoundSettlement(w, u, b);                                                                       // L5692
            return true;
        }

        // ================= findLandNear L5589-5606（环扫最近可登陆地；返回 tile 中心 +0.5） =================
        private static (double x, double y)? FindLandNear(WbWorld w, double x, double y, int r)
        {
            int cx = (int)System.Math.Floor(x);
            int cy = (int)System.Math.Floor(y);
            for (int ring = 1; ring <= r; ring++)
            {
                for (int dy = -ring; dy <= ring; dy++)
                {
                    for (int dx = -ring; dx <= ring; dx++)
                    {
                        if (System.Math.Max(System.Math.Abs(dx), System.Math.Abs(dy)) != ring) continue;
                        int xx = cx + dx;
                        int yy = cy + dy;
                        if (xx < 1 || yy < 1 || xx >= WbWorld.W - 1 || yy >= WbWorld.H - 1) continue;
                        int t = w.terrain[WbWorld.Idx(xx, yy)];
                        if (!WbWorld.IsWater(t) && t != WbWorld.T_MOUNTAIN && t != WbWorld.T_LAVA) return (xx + 0.5, yy + 0.5);
                    }
                }
            }
            return null;
        }

        // ================= caravanArrive L4770-4796 =================
        public static void CaravanArrive(WbWorld w, WbU u)
        {
            WbCiv home = u.civ >= 0 ? WbCivSim.CivAt(w, u.civ) : null;
            WbCiv partner = WbCivSim.CivAt(w, u.caravan);
            // —— 联盟互连：盟内商路免税互市，收益 ×1.25 ——
            WbAlliance alC = home != null && partner != null ? WbCivSim.AllianceOfCiv(w, home.id) : null;
            double allyBonus = alC != null && partner != null && alC.members.Contains(partner.id) ? (alC.bonded ? 1.38 : 1.25) : 1;
            double val = WbMath.JsRound((6 + System.Math.Floor(w.Rng() * 9)) * allyBonus);
            if (home != null && home.alive)
            {
                home.gold = (home.gold ?? 0) + val;
                if (w.Rng() < 0.35) home.knowledge = (home.knowledge ?? 0) + 1;
            }
            if (partner != null && partner.alive)
            {
                partner.gold = (partner.gold ?? 0) + val;
                if (w.Rng() < 0.4) partner.knowledge = (partner.knowledge ?? 0) + 1;
                if (home != null && home.alive)
                {
                    string key = WbWorld.PairKey(home.id, partner.id);
                    double cur; w.rel.TryGetValue(key, out cur);
                    w.rel[key] = System.Math.Min(100, cur + 4); // 贸易升温
                    // —— 种族互连：商贸往来让两个种族渐生好感（商缘即族缘）——
                    if (home.race != partner.race) w.ShiftRaceRel(home.race, partner.race, 0.2);
                }
            }
            w.Fx("coin", u.x, u.y - 1, 30);
            if (w.Rng() < 0.3 && home != null && partner != null)
            {
                w.AddEvent("trade", $"「{home.name}」商队抵达「{partner.name}」，两市共获 {val} 金", partner.colorHex, u.x, u.y);
            }
            u.caravan = 0;
            u.job = 5;
        }

        // ================= updateUnitTailJS L4116-4260 =================
        public static bool UpdateUnitTailJS(WbWorld w, WbU u)
        {
            RelayDef def = DefOf(u.race);
            // 深度打磨：贸易商队 — 全程奔向伙伴市场，不受随机漫游覆盖；抵达即结算
            if (u.caravan > 0)                                                                                          // L4119
            {
                WbCiv pc = WbCivSim.CivAt(w, u.caravan);
                int mi = pc != null && pc.alive && w.marketIdx.TryGetValue(u.caravan, out int m) ? m : -1;              // L4121
                if (mi < 0)
                {
                    u.caravan = 0; // 伙伴亡国/市场尽毁 → 就地转为行商                                                    // L4123
                }
                else
                {
                    u.tx = (mi % WbWorld.W) + 0.5;                                                                      // L4126
                    u.ty = ((mi / WbWorld.W) | 0) + 0.5;
                    double cdx = u.x - u.tx;
                    double cdy = u.y - u.ty;
                    if (cdx * cdx + cdy * cdy < 3.24) CaravanArrive(w, u); // 1.8² 平方距离判定                            // L4130
                }
            }
            // —— 捕食者索敌（猎手嗅觉）——（buckets/preyGrid 宿主结构未译：第二批域；门控短路保 rng 协议）               // L4132
            if (def.predator && !def.undead && u.food < 70 && w.Rng() < 0.4)
                throw new System.InvalidOperationException("tail 捕食者索敌分支未翻译（M-U3h 第二批域）");
            // —— 鱼群结队 ——                                                                                           // L4177
            if (u.race == R_FISH && w.Rng() < 0.12)
                throw new System.InvalidOperationException("tail 鱼群结队分支未翻译（M-U3h 第二批域）");
            // 随机漫游触发判定（0.5² 平方距离：纯阈值比较，无需实距）                                                     // L4213
            double ndx = u.tx - u.x;
            double ndy = u.ty - u.y;
            if (u.caravan == 0 && (ndx * ndx + ndy * ndy < 0.25 || w.Rng() < 0.02))
            {
                double r = u.race == R_SHEEP ? 2.5 : u.race == R_DRAGON ? 9 : 5;   // R2 = R.DRAGON（engine L36）        // L4217
                double wx = u.x + (w.Rng() * 2 - 1) * r;
                double wy = u.y + (w.Rng() * 2 - 1) * r;
                // 饥饿捕食者的逐草而行（第二批域）                                                                      // L4221
                if (def.predator && !def.undead && u.food < 55)
                    throw new System.InvalidOperationException("tail 漫游逐草分支未翻译（M-U3h 第二批域）");
                // 蟹：滩涂限定（第二批域）                                                                              // L4230
                if (u.race == R_CRAB)
                    throw new System.InvalidOperationException("tail 蟹漫游分支未翻译（M-U3h 第二批域）");
                // 纯水生（鱼/龟/鲨）：游荡目标必须为水域（第二批域）                                                     // L4241
                else if (def.aquatic)
                    throw new System.InvalidOperationException("tail 水生漫游分支未翻译（M-U3h 第二批域）");
                u.tx = System.Math.Max(1, System.Math.Min(WbWorld.W - 2, wx));                                          // L4257
                u.ty = System.Math.Max(1, System.Math.Min(WbWorld.H - 2, wy));
            }
            MoveUnit(w, u, 1);                                                                                          // L4259
            return false;
        }

        // ================= updateUnitPostJS L4262-4334 =================
        public static void UpdateUnitPostJS(WbWorld w, WbU u)
        {
            RelayDef def = DefOf(u.race);
            // 宝物拾取（items 空 → 门短路；本体第二批域）                                                                // L4265
            if (w.items.Count > 0 && (def.isCiv || u.race == R_BANDIT || (def.predator && !def.undead)))
                throw new System.InvalidOperationException("post tryPickup 本体未翻译（M-U3h 第二批域）");
            // reproduce —— 两段式繁衍门（门掷必耗 rng；boost+spawn 链第二批域）                                          // L4271
            if (w.laws.reproduction && def.repro > 0 && !(def.aquatic && !def.beach && (u.beachT ?? 0) > 0) && w.Rng() < def.repro)
                throw new System.InvalidOperationException("post 繁衍 boost+spawn 链未翻译（M-U3h 第二批域；黄金场景 rngA0 受控此门必败）");
        }

        // ================= moveUnit L5813-5876（宿主路径；flying/aquatic/sandswim/登船桩域） =================
        public static void MoveUnit(WbWorld w, WbU u, double mul)
        {
            RelayDef def = DefOf(u.race);
            double dx = u.tx - u.x;
            double dy = u.ty - u.y;
            double d = WbMath.FdHypot(dx, dy);
            if (d < 0.05) return;                                                                                       // L5817
            // 寒冻（暴风雪）：移速锐减的踱步；诅咒：紫霾缠身寸步难行
            double step = u.speed * 2 * mul * (u.chill != 0 ? 0.55 : 1) * (u.curse != 0 ? 0.75 : 1);                    // L5820
            // 沼泽泥泞：陷足难行（移速 ×0.6）
            if (w.terrain[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))] == WbWorld.T_SWAMP) step *= 0.6;   // L5822
            // 冷血缓滞（季节节律）：寒冬降临变温生物代谢迟缓
            if (def.coldBlood && w.NatureSeason() == 3) step *= 0.6;                                                    // L5824
            // 深度打磨：道路行军加成 — 土路上的军队/商队/平民提速 45%（路网价值）
            if (w.road[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))] > 0) step *= 1.45;        // L5826
            double nx = u.x + (dx / d) * step;
            double ny = u.y + (dy / d) * step;
            if (dx != 0) u.flip = dx < 0 ? 1 : 0;                                                                       // L5830
            if (def.flying)
                throw new System.InvalidOperationException("moveUnit flying 分支未翻译（M-U3h 第二批域）");             // L5831-5835
            // 通行规则（注释见蓝本 L5837-5841）
            int cur = w.terrain[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))];                 // L5843
            if (def.aquatic)
                throw new System.InvalidOperationException("moveUnit aquatic 分支未翻译（M-U3h 第二批域）");            // L5844-5860
            if (def.sandswim)
                throw new System.InvalidOperationException("moveUnit sandswim 分支未翻译（M-U3h 第二批域）");           // L5861-5870
            bool swimming = cur == WbWorld.T_DEEP || cur == WbWorld.T_WATER;
            bool onMountain = cur == WbWorld.T_MOUNTAIN;
            // 通行判定 + 城墙阻挡（敌方陆行单位不可逾越）
            bool passX = !WallBlocks(w, (int)System.Math.Floor(nx), (int)System.Math.Floor(u.y), u, swimming)
                && PassTile(swimming, onMountain, w.terrain[WbWorld.Idx((int)System.Math.Floor(nx), (int)System.Math.Floor(u.y))]); // L5877-5878
            bool passY = !WallBlocks(w, (int)System.Math.Floor(u.x), (int)System.Math.Floor(ny), u, swimming)
                && PassTile(swimming, onMountain, w.terrain[WbWorld.Idx((int)System.Math.Floor(u.x), (int)System.Math.Floor(ny))]);
            if (passX && passY) { u.x = nx; u.y = ny; }
            else if (passX) u.x = nx;
            else if (passY) u.y = ny;
            else
                throw new System.InvalidOperationException("moveUnit 阻断分支（maybeBoardForWar/reroute）未翻译（M-U3h 第二批域）");  // L5881-5889
        }

        // wallBlocks L5804-5812（swimming 时闭包恒 false —— L5877 内联）
        private static bool WallBlocks(WbWorld w, int x, int y, WbU u, bool swimming)
        {
            if (swimming) return false;
            int i = WbWorld.Idx(x, y);
            if (w.building[i] != WbCivSim.BUILD_KINDS.WALL) return false;
            WbBuilding b = w.bIdx.TryGetValue(i, out int bi) && bi >= 0 && bi < w.buildings.Count ? w.buildings[bi] : null;
            if (b == null || b.civ == u.civ) return false; // 己方城墙自家随便走
            if (u.civ >= 0) return WbCivSim.AtWar(w, b.civ, u.civ); // 中立/盟友通行，交战国被拦
            return DefOf(u.race).hostile; // 无国籍野怪：天生敌意者被拦
        }

        // passTile L5800-5802
        private static bool PassTile(bool swimming, bool onMountain, byte t)
        {
            if (swimming) return t != WbWorld.T_LAVA && t != WbWorld.T_MOUNTAIN;
            if (onMountain) return t != WbWorld.T_DEEP && t != WbWorld.T_WATER && t != WbWorld.T_LAVA;
            return t != WbWorld.T_DEEP && t != WbWorld.T_WATER && t != WbWorld.T_MOUNTAIN && t != WbWorld.T_LAVA; // walkable L76-78
        }

        // ================= foundSettlement L5704-5739 =================
        public static void FoundSettlement(WbWorld w, WbU u, int i)
        {
            WbCiv civ = u.civ >= 0 ? WbCivSim.CivAt(w, u.civ) : null;
            if (civ == null || !civ.alive) return;
            if (w.building[i] == 0 && WbWorld.Buildable(w.terrain[i]))
            {
                WbCivSim.BuildBuilding(w, i, 1, civ.id);
            }
            int cx = i % WbWorld.W;
            int cy = i / WbWorld.W;
            for (int dy = -2; dy <= 2; dy++)
            {
                for (int dx = -2; dx <= 2; dx++)
                {
                    int xx = cx + dx;
                    int yy = cy + dy;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                    int j = WbWorld.Idx(xx, yy);
                    if (w.owner[j] == -1 && WbWorld.IsLand(w.terrain[j]) && w.terrain[j] != WbWorld.T_MOUNTAIN)
                    {
                        WbCivSim.ClaimTile(w, j, civ.id);
                    }
                }
            }
            w.AddEvent("settle", $"「{civ.name}」的殖民者在遥远的海岸建立了新定居点", civ.colorHex, cx, cy);
            w.Toast($"「{civ.name}」的殖民者发现了新大陆", "good");
            w.Fx("heart", cx, cy - 1, 40);
        }

        // ============================================================
        // ============ M-U3h 第三批 case2 涌现接力域 ==================
        // ============================================================
        // 蓝本：engine.ts wbResume case2 L3230-3257（辐射放大 cg + inventEmergentTrait + 文明/野生双分支）
        //   + inventEmergentTrait L3318-3330 + inventTrait emergence.ts L390-417
        //   + spawnUnit L1283-1465（静默可达域全译；announce/findCivNear/createCiv/rollTrait/devEquip/baseGene 桩 GUARD）
        //   + newFamily L1111-1133 + pruneFamilies L1135-1138 + familyMilestone L1139-1149
        //   + wildCapOf L2132-2159 + bumpWild L1082-1087 + wildAlive L1089-1094 + wildAliveAquatic L1096-1100
        //   + rollJob L1472-1480 + uniqueName L1522-1534 + techModsOf 最小面 L4859-4874 + govOf L8067-8070
        // 静态表：RACES 消费切片 types.ts L157-204 / TRAITS L264-276 / JOBS L296-305 / constants.ts L10-31

        // ---------------- 预算常量（constants.ts L10-31 消费切片 —— TS 侧 spawnUnit 预算；C# WbConstants.MAX_UNITS=4096 系 lib.rs 域，异源共存） ----------------
        private const int CAP_UNITS = 2400;                 // constants.ts L10 MAX_UNITS
        private const int CAP_WILDLIFE = 900;               // constants.ts L13 MAX_WILDLIFE
        private const int CAP_WILDLIFE_AQUATIC = 520;       // constants.ts L19 MAX_WILDLIFE_AQUATIC
        private const int CAP_DRAGONS = 4;                  // constants.ts L20
        private const int CAP_DEMONS = 2;                   // constants.ts L22
        private const int CAP_TROLLS = 5;                   // constants.ts L24
        private const int CAP_KRAKENS = 3;                  // constants.ts L25
        private const int CAP_SANDWORMS = 3;                // constants.ts L26
        private const int CAP_BASILISKS = 6;                // constants.ts L27
        private const int CAP_OGRES = 5;                    // constants.ts L28
        private const int CAP_WHITEWALKERS = 6;             // constants.ts L29
        private const int CAP_HYDRAS = 6;                   // constants.ts L31
        private const int CAP_VAMPIRES = 8;                 // constants.ts L32
        private const int R2_DRAGON = 9;                    // engine L36 R2 = R.DRAGON
        private const int RD_DEMON = 17;                    // engine L37 RD = R.DEMON
        private const int R_TROLL = 21, R_OGRE = 22, R_WHITEWALKER = 23, R_VAMPIRE = 24,
            R_KRAKEN = 25, R_SANDWORM = 26, R_BASILISK = 27, R_HYDRA = 32;  // engine R 值（types.ts R 枚举序）

        // ---------------- RACES 消费切片（types.ts L157-204 机械转写 —— spawnUnit/inventEmergentTrait 消费 name/hp/dmg/speed/maxAge/isCiv/undead；41 族全表位置序 = R 枚举序） ----------------
        public struct RaceStat
        {
            public string name;
            public double hp, dmg, speed;
            public int maxAge;
            public bool isCiv, undead, aquatic;   // aquatic = wildAliveAquatic L1098 消费切片
        }

        public static readonly RaceStat[] RStats = new RaceStat[41]
        {
            new RaceStat{ name="人类",   hp=60,  dmg=8,   speed=0.09,  maxAge=55,   isCiv=true  },                     // L157 HUMAN
            new RaceStat{ name="精灵",   hp=55,  dmg=9,   speed=0.1,   maxAge=90,   isCiv=true  },                     // L158 ELF
            new RaceStat{ name="矮人",   hp=78,  dmg=10,  speed=0.072, maxAge=120,  isCiv=true  },                     // L159 DWARF
            new RaceStat{ name="兽人",   hp=72,  dmg=12,  speed=0.084, maxAge=48,   isCiv=true  },                     // L160 ORC
            new RaceStat{ name="强盗",   hp=62,  dmg=11,  speed=0.093, maxAge=45 },                                    // L161 BANDIT
            new RaceStat{ name="僵尸",   hp=46,  dmg=6,   speed=0.05,  maxAge=9999, undead=true },                     // L162 ZOMBIE
            new RaceStat{ name="绵羊",   hp=16,  dmg=1,   speed=0.038, maxAge=26 },                                    // L163 SHEEP
            new RaceStat{ name="狼",     hp=34,  dmg=10,  speed=0.093, maxAge=22 },                                    // L164 WOLF
            new RaceStat{ name="熊",     hp=95,  dmg=19,  speed=0.06,  maxAge=40 },                                    // L165 BEAR
            new RaceStat{ name="巨龙",   hp=900, dmg=48,  speed=0.11,  maxAge=9999 },                                  // L166 DRAGON
            new RaceStat{ name="鹿",     hp=24,  dmg=1,   speed=0.115, maxAge=20 },                                    // L167 DEER
            new RaceStat{ name="企鹅",   hp=22,  dmg=1,   speed=0.045, maxAge=18 },                                    // L168 PENGUIN
            new RaceStat{ name="骆驼",   hp=30,  dmg=2,   speed=0.05,  maxAge=35 },                                    // L169 CAMEL
            new RaceStat{ name="蝎子",   hp=14,  dmg=5,   speed=0.055, maxAge=16 },                                    // L170 SCORPION
            new RaceStat{ name="蛇",     hp=20,  dmg=6,   speed=0.08,  maxAge=20 },                                    // L171 SNAKE
            new RaceStat{ name="雪狼",   hp=38,  dmg=11,  speed=0.088, maxAge=24 },                                    // L172 SNOWWOLF
            new RaceStat{ name="骷髅",   hp=55,  dmg=14,  speed=0.075, maxAge=9999, undead=true },                     // L173 SKELETON
            new RaceStat{ name="恶魔",   hp=600, dmg=30,  speed=0.085, maxAge=9999 },                                  // L174 DEMON
            new RaceStat{ name="法师",   hp=50,  dmg=6,   speed=0.07,  maxAge=200 },                                   // L175 MAGE
            new RaceStat{ name="蜥蜴人", hp=66,  dmg=10,  speed=0.095, maxAge=70,   isCiv=true  },                     // L177 LIZARD
            new RaceStat{ name="哥布林", hp=40,  dmg=6,   speed=0.108, maxAge=34,   isCiv=true  },                     // L178 GOBLIN
            new RaceStat{ name="巨魔",   hp=380, dmg=26,  speed=0.06,  maxAge=400 },                                   // L179 TROLL
            new RaceStat{ name="食人魔", hp=300, dmg=34,  speed=0.052, maxAge=120 },                                   // L180 OGRE
            new RaceStat{ name="白行者", hp=240, dmg=20,  speed=0.075, maxAge=9999, undead=true },                     // L181 WHITEWALKER
            new RaceStat{ name="吸血鬼", hp=140, dmg=16,  speed=0.118, maxAge=9999, undead=true },                     // L182 VAMPIRE
            new RaceStat{ name="克拉肯", hp=520, dmg=30,  speed=0.07,  maxAge=9999, aquatic=true },                                  // L184 KRAKEN
            new RaceStat{ name="沙虫",   hp=420, dmg=40,  speed=0.14,  maxAge=9999 },                                  // L185 SANDWORM
            new RaceStat{ name="蛇怪",   hp=90,  dmg=14,  speed=0.11,  maxAge=400 },                                   // L186 BASILISK
            new RaceStat{ name="天使",   hp=240, dmg=22,  speed=0.105, maxAge=9999 },                                  // L188 ANGEL
            new RaceStat{ name="凤凰",   hp=200, dmg=18,  speed=0.12,  maxAge=9999 },                                  // L189 PHOENIX
            new RaceStat{ name="树人",   hp=320, dmg=26,  speed=0.055, maxAge=9999 },                                  // L190 ENT
            new RaceStat{ name="巫妖",   hp=260, dmg=20,  speed=0.07,  maxAge=9999, undead=true },                     // L191 LICH
            new RaceStat{ name="九头蛇", hp=500, dmg=30,  speed=0.05,  maxAge=9999 },                                  // L192 HYDRA
            new RaceStat{ name="鸡",     hp=10,  dmg=1,   speed=0.05,  maxAge=14 },                                    // L194 CHICKEN
            new RaceStat{ name="猪",     hp=30,  dmg=2,   speed=0.055, maxAge=22 },                                    // L195 PIG
            new RaceStat{ name="兔",     hp=12,  dmg=1,   speed=0.13,  maxAge=12 },                                    // L196 RABBIT
            new RaceStat{ name="狐",     hp=28,  dmg=8,   speed=0.105, maxAge=18 },                                    // L197 FOX
            new RaceStat{ name="鱼",     hp=6,   dmg=0.5, speed=0.075, maxAge=10,   aquatic=true },                                    // L198 FISH
            new RaceStat{ name="蟹",     hp=16,  dmg=3,   speed=0.03,  maxAge=16,   aquatic=true },                                    // L199 CRAB
            new RaceStat{ name="龟",     hp=40,  dmg=1,   speed=0.028, maxAge=120,  aquatic=true },                                   // L200 TURTLE
            new RaceStat{ name="鲨鱼",   hp=85,  dmg=18,  speed=0.1,   maxAge=40,   aquatic=true },                                   // L201 SHARK
        };

        private static RaceStat StatOf(int race)
        {
            if (race < 0 || race >= RStats.Length) throw new System.InvalidOperationException($"RACES race {race} 越界（case2 域）");
            return RStats[race];
        }

        // ---------------- TRAITS 预设表（types.ts L264-276 机械转写 —— spawnUnit td 消费 + inventEmergentTrait TRAITS[key]=t 动态写入同一表） ----------------
        public static readonly System.Collections.Generic.Dictionary<string, WbTrait> TraitsAll = BuildTraits();

        private static System.Collections.Generic.Dictionary<string, WbTrait> BuildTraits()
        {
            var d = new System.Collections.Generic.Dictionary<string, WbTrait>();
            d["strong"] = new WbTrait { key = "strong", name = "强壮", desc = "伤害 +40%", dmgMul = 1.4, good = true };                    // L265
            d["tough"] = new WbTrait { key = "tough", name = "坚韧", desc = "生命 +35%", hpMul = 1.35, good = true };                      // L266
            d["swift"] = new WbTrait { key = "swift", name = "迅捷", desc = "速度 +30%", speedMul = 1.3, good = true };                    // L267
            d["weak"] = new WbTrait { key = "weak", name = "羸弱", desc = "伤害 -20%", dmgMul = 0.8, good = false };                       // L268
            d["sickly"] = new WbTrait { key = "sickly", name = "多病", desc = "生命 -25%", hpMul = 0.75, good = false };                   // L269
            d["genius"] = new WbTrait { key = "genius", name = "天才", desc = "可能缔造传奇", good = true };                               // L270
            d["berserk"] = new WbTrait { key = "berserk", name = "狂暴", desc = "伤害 +70%, 生命 -15%", dmgMul = 1.7, hpMul = 0.85, good = true }; // L271
            d["lucky"] = new WbTrait { key = "lucky", name = "幸运", desc = "命不该绝", good = true };                                     // L272
            d["regeneration"] = new WbTrait { key = "regeneration", name = "再生", desc = "缓慢恢复生命", regen = 0.3, good = true };      // L273
            d["giant"] = new WbTrait { key = "giant", name = "巨型", desc = "生命 +80%, 伤害 +50%, 速度 -25%", hpMul = 1.8, dmgMul = 1.5, speedMul = 0.75, giant = true, good = true }; // L274
            d["tiny"] = new WbTrait { key = "tiny", name = "侏儒", desc = "生命 -45%, 伤害 -20%, 速度 +25%", hpMul = 0.55, dmgMul = 0.8, speedMul = 1.25, tiny = true, good = true };   // L275
            d["immune"] = new WbTrait { key = "immune", name = "免疫", desc = "不会感染瘟疫与毒素", immune = true, good = true };          // L276
            return d;
        }

        // 涌现特质词表（emergence.ts L386-387）
        private static readonly string[] TraitPrefix = { "凶蛮", "钢筋", "魅影", "荒野", "苔藓", "血怒", "霜骨", "雷筋", "深渊", "星辉", "荆棘", "孤狼" };
        private static readonly string[] TraitBody = { "之爪", "之躯", "之足", "血脉", "之瞳", "之鳞" };

        // ---------------- JOBS 消费切片（types.ts L296-305 机械转写 —— rollJob weight + spawnUnit hpMul/dmgMul/speedMul；蓝本字段名 hpMul 系（WbCivSim.WbJobMul 系 setJob 相对换算切片，异源）） ----------------
        public struct JobCase2 { public double hpMul, dmgMul, speedMul, weight; }

        public static readonly JobCase2[] JobDefs = new JobCase2[8]
        {
            new JobCase2{ hpMul=1,    dmgMul=1,    speedMul=1,    weight=46 },  // L297 peasant
            new JobCase2{ hpMul=0.95, dmgMul=0.9,  speedMul=1,    weight=24 },  // L298 farmer
            new JobCase2{ hpMul=1.3,  dmgMul=1.35, speedMul=1.05, weight=14 },  // L299 warrior
            new JobCase2{ hpMul=1.05, dmgMul=1.15, speedMul=1,    weight=8  },  // L300 archer
            new JobCase2{ hpMul=1.15, dmgMul=0.95, speedMul=1.05, weight=5  },  // L301 builder
            new JobCase2{ hpMul=1,    dmgMul=0.9,  speedMul=1.2,  weight=2  },  // L302 merchant
            new JobCase2{ hpMul=1.25, dmgMul=1.1,  speedMul=1,    weight=1  },  // L303 noble
            new JobCase2{ hpMul=1.5,  dmgMul=1.5,  speedMul=1,    weight=0  },  // L305 king（weight 0 = 永不自然出生）
        };

        /// <summary>spawnUnit opts 形状（engine L1283 opts?.x optional 全切片；undefined 语义 → null/默认）</summary>
        public sealed class WbSpawnOpts
        {
            public int? civ;         // engine opts.civ（?? -1）
            public bool silent;      // engine opts.silent（case2 恒 true）
            public WbGene gene;      // engine opts.gene（case2 恒传）
            public string trait;     // engine opts.trait（!== undefined 门；'' → null 语义）
            public int? fam;         // engine opts.fam（!== undefined 门 → HasValue）
            public int? fgn;         // engine opts.fgn（?? 1）
            public int? job;         // engine opts.job（?? rollJob()）
            public bool infected;    // engine opts.infected（?? false）
            public bool gear;        // engine opts.gear（devEquip GUARD 域）
        }

        // ================= wbResume case2 体（engine L3230-3257 机械翻译） =================
        private static void Case2(WbWorld w, WbU u, double[] d)
        {
            // 涌现特质门已过（Rust 已消耗 0.06 掷骰）：发明特质 + 完成繁衍 spawn
            var cg = new WbGene { s = d[0], d = d[1], h = d[2], r = d[3] };
            // —— 超级演化 v4：辐射区演化高压锅（Rust 侧已定型 cg，JS 侧对辐射带出生的于代二次放大偏移）——
            int rIdx = WbWorld.Idx((int)System.Math.Max(0, System.Math.Min(WbWorld.W - 1, (long)u.x)), (int)System.Math.Max(0, System.Math.Min(WbWorld.H - 1, (long)u.y))); // L3234 Math.max(0, Math.min(W-1, u.x|0))——u.x≥0 恒真域，(long) 截断 ≡ JS |0
            if (w.radiate[rIdx] > 0)
            {
                WbGene pg = u.geneC ?? new WbGene();                                        // L3236 u.gene ?? {s:1,d:1,h:1,r:1}（WbGene 默认全 1）
                cg.s = WbMath.JsMax(0.5, WbMath.JsMin(2, pg.s + (cg.s - pg.s) * 2.2));      // L3238
                cg.d = WbMath.JsMax(0.5, WbMath.JsMin(2, pg.d + (cg.d - pg.d) * 2.2));
                cg.h = WbMath.JsMax(0.5, WbMath.JsMin(2, pg.h + (cg.h - pg.h) * 2.2));
                cg.r = WbMath.JsMax(0.5, WbMath.JsMin(2, pg.r + (cg.r - pg.r) * 2.2));
            }
            string traitKey = InventEmergentTrait(w, u, cg);                                // L3242
            if (d[4] >= 1)
            {
                // 文明分支（人口/上限门已在 Rust 通过）
                WbCiv civ = (u.civ >= 0 && u.civ < w.civs.Count) ? w.civs[u.civ] : null;    // L3245 this.civs[u.civ]（越界 undefined → null）
                if (civ != null && civ.alive)
                {
                    int? fam = u.famC.HasValue ? u.famC : (w.Rng() < 0.25 ? (int?)NewFamily(w, u.race, u).id : null);   // L3246
                    SpawnUnit(w, u.race, u.x + w.Rng() - 0.5, u.y + w.Rng() - 0.5, new WbSpawnOpts   // L3247-3248
                    {
                        civ = u.civ, silent = true, gene = cg, trait = traitKey, fam = fam,
                        fgn = fam.HasValue ? (u.fgnC ?? 1) + 1 : (int?)null,
                    });
                    w.Fx("heart", u.x, u.y - 1, 40);                                            // L3249
                }
            }
            else
            {
                int cap = WildCapOf(w, u.race);                                                 // L3252
                int same = w.wildCount.TryGetValue(u.race, out int sc) ? sc : 0;                // L3253 ?? 0
                if (same < cap)
                {
                    int? fam = u.famC.HasValue ? u.famC : (w.Rng() < 0.25 ? (int?)NewFamily(w, u.race, u).id : null);   // L3255
                    SpawnUnit(w, u.race, u.x + w.Rng() - 0.5, u.y + w.Rng() - 0.5, new WbSpawnOpts       // L3256-3257
                    {
                        silent = true, gene = cg, trait = traitKey, fam = fam,
                        fgn = fam.HasValue ? (u.fgnC ?? 1) + 1 : (int?)null,
                    });
                    w.Fx("heart", u.x, u.y - 1, 40);
                }
            }
        }

        // ================= inventEmergentTrait（engine L3318-3330 机械翻译） =================
        private static string InventEmergentTrait(WbWorld w, WbU parent, WbGene childGene)
        {
            WbTrait t = InventTrait(w, childGene, w.traitSeq);                              // L3319 emergence.ts L390
            t.key = $"dt{w.traitSeq}";                                                      // L3320（先取值后自增）
            w.traitSeq++;
            w.dynTraits[t.key] = t;                                                         // L3321
            TraitsAll[t.key] = t;                                                           // L3322 TRAITS[t.key] = t（全局预设表动态扩充）
            string raceName = parent.race >= 0 && parent.race < RStats.Length ? RStats[parent.race].name : "?"; // L3323 RACES[parent.race]?.name ?? '?'
            WbCivSim.RecordEvo(w, "trait", t.name, null, "#ff5fd2",                         // L3323-3324
                $"{t.desc} —— 源自「{raceName}」种群 {(int)System.Math.Floor(w.yearF)} 年的极端基因个体",
                t.desc, new System.Collections.Generic.Dictionary<string, object> { { "race", parent.race } });
            w.AddEvent("emerge", $"演化奇迹——「{raceName}」种群诞生了前所未见的个体，携带着新特质「{t.name}」（{t.desc}）", "#ff5fd2", parent.x, parent.y); // L3325-3326
            return t.key;                                                                   // L3329
        }

        // ================= inventTrait（emergence.ts L390-417 机械翻译） =================
        private static WbTrait InventTrait(WbWorld w, WbGene gene, int seq)
        {
            string prefix = TraitPrefix[(int)System.Math.Floor(w.Rng() * TraitPrefix.Length)];  // L392
            string body = TraitBody[(int)System.Math.Floor(w.Rng() * TraitBody.Length)];        // L393
            var t = new WbTrait { key = $"dt{seq}", name = prefix + body, desc = "", good = true }; // L394
            double pick = w.Rng();                                                              // L395
            if (gene.d >= 1.5 && pick < 0.4)                                                    // L396
            {
                t.dmgMul = WbMath.JsRound((1.18 + w.Rng() * 0.2) * 100) / 100;                  // L397
                if (w.Rng() < 0.4) t.hpMul = WbMath.JsRound((0.88 + w.Rng() * 0.1) * 100) / 100; // L398
            }
            else if (gene.h >= 1.5 && pick < 0.7)                                               // L399
            {
                t.hpMul = WbMath.JsRound((1.2 + w.Rng() * 0.22) * 100) / 100;                   // L400
                if (w.Rng() < 0.35) t.regen = 0.02;                                             // L401
            }
            else if (gene.s >= 1.5 && pick < 0.9)                                               // L402
            {
                t.speedMul = WbMath.JsRound((1.15 + w.Rng() * 0.18) * 100) / 100;               // L403
                if (w.Rng() < 0.4) t.dmgMul = WbMath.JsRound((1.08 + w.Rng() * 0.1) * 100) / 100; // L404
            }
            else                                                                                // L405
            {
                t.regen = WbMath.JsRound((0.015 + w.Rng() * 0.03) * 1000) / 1000;               // L406
                t.hpMul = WbMath.JsRound((1.1 + w.Rng() * 0.15) * 100) / 100;                   // L407
            }
            var bits = new System.Collections.Generic.List<string>();                           // L409-414
            if (t.dmgMul != null) bits.Add($"伤害 +{(int)WbMath.JsRound((t.dmgMul.Value - 1) * 100)}%");
            if (t.hpMul != null) bits.Add($"生命 +{(int)WbMath.JsRound((t.hpMul.Value - 1) * 100)}%");
            if (t.speedMul != null) bits.Add($"速度 +{(int)WbMath.JsRound((t.speedMul.Value - 1) * 100)}%");
            if (t.regen != null) bits.Add("缓慢再生");
            t.desc = string.Join(" ", bits) + "（涌现特质）";                                    // L415
            return t;                                                                           // L416
        }

        // ================= spawnUnit（engine L1283-1465 机械翻译；静默可达域全译；桩域 GUARD） =================
        private static WbU SpawnUnit(WbWorld w, int race, double x, double y, WbSpawnOpts o)
        {
            RaceStat st = StatOf(race);                                                         // L1285 RACES[race]（越界蓝本 undefined.hp throw ≡ StatOf throw）
            // 预算分轨：文明人口受 MAX_UNITS 限制；野生动物有独立的 MAX_WILDLIFE 生态预算
            if (st.isCiv && w.units.Count >= CAP_UNITS) return null;                            // L1293
            if (!st.isCiv)                                                                      // L1296-1300
            {
                if (st.aquatic) { if (WildAliveAquatic(w) >= CAP_WILDLIFE_AQUATIC) return null; }
                else if (WildAlive(w) >= CAP_WILDLIFE) return null;
            }
            if (race == R2_DRAGON && WildCnt(w, race) >= CAP_DRAGONS) return null;              // L1301
            if (race == RD_DEMON && WildCnt(w, race) >= CAP_DEMONS) return null;                // L1302
            if (race == R_TROLL && WildCnt(w, race) >= CAP_TROLLS) return null;                 // L1304
            if (race == R_OGRE && WildCnt(w, race) >= CAP_OGRES) return null;                   // L1305
            if (race == R_WHITEWALKER && WildCnt(w, race) >= CAP_WHITEWALKERS) return null;     // L1306
            if (race == R_VAMPIRE && WildCnt(w, race) >= CAP_VAMPIRES) return null;             // L1307
            if (race == R_KRAKEN && WildCnt(w, race) >= CAP_KRAKENS) return null;               // L1308
            if (race == R_SANDWORM && WildCnt(w, race) >= CAP_SANDWORMS) return null;           // L1309
            if (race == R_BASILISK && WildCnt(w, race) >= CAP_BASILISKS) return null;           // L1310
            if (race == R_HYDRA && WildCnt(w, race) >= CAP_HYDRAS) return null;                 // L1312
            x = WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.W - 0.5, x));                            // L1318
            y = WbMath.JsMax(0.5, WbMath.JsMin(WbWorld.H - 0.5, y));

            int civ = o != null && o.civ.HasValue ? o.civ.Value : -1;                           // L1321 ?? -1
            if (st.isCiv && civ < 0)                                                            // L1322-1325 GUARD
                throw new System.InvalidOperationException("findCivNear/createCiv 深链未转写（case2 场景 civ>=0 或野生）");

            string trait;                                                                       // L1327（!== undefined 门 → 恒传；'' → null）
            if (o != null && o.trait != null) trait = o.trait.Length > 0 ? o.trait : null;
            else throw new System.InvalidOperationException("rollTrait 未转写（case2 场景恒传 trait）"); // 0.15 门 GUARD（蓝本惰性分支）
            WbTrait td = trait != null && TraitsAll.TryGetValue(trait, out WbTrait td0) ? td0 : null;   // L1327 TRAITS[trait]
            if (o == null || o.gene == null)                                                    // L1329-1330 GUARD
                throw new System.InvalidOperationException("baseGene 深链未转写（case2 场景恒传 gene）");
            WbGene gene = o.gene;
            int job = 0;                                                                        // L1333
            if (st.isCiv && civ >= 0) job = o.job.HasValue ? o.job.Value : RollJob(w);          // L1334-1335
            JobCase2? jd = st.isCiv ? JobDefs[job] : (JobCase2?)null;                           // L1336 JOBS[job]（非文明 null）
            (double hp, double dmg)? tm = (st.isCiv && civ >= 0) ? TechModsOf2(w, civ) : ((double hp, double dmg)?)null;   // L1339
            double tH = tm?.hp ?? 1;                                                            // L1340
            double tD = tm?.dmg ?? 1;                                                           // L1341
            double maxHp = WbMath.JsRound(st.hp * (td?.hpMul ?? 1) * (jd?.hpMul ?? 1) * tH * (gene?.h ?? 1));              // L1343
            var un = new WbU
            {
                id = w.unitSeq++,                                                               // L1344
                race = race,
                civ = civ,
                x = x, y = y,
                lx = x, ly = y,                                                                 // L1347 渲染插值初值
                rx = x, ry = y,
                tx = x, ty = y,
                hp = maxHp,
                maxHp = maxHp,
                dmg = st.dmg * (td?.dmgMul ?? 1) * (jd?.dmgMul ?? 1) * tD * (GovOf(w, civ) == 4 ? 1.15 : 1) * (gene?.d ?? 1),   // L1352
                speed = st.speed * (td?.speedMul ?? 1) * (jd?.speedMul ?? 1) * (gene?.s ?? 1),  // L1353
                tDmg = tD,                                                                      // L1354 科技乘数快照
                tHp = tH,
                ageF = 0,                                                                       // L1357 age: 0（f64 域 ageF）
                maxAgeF = st.maxAge * (0.8 + w.Rng() * 0.4),                                    // L1358（f64 语义 → maxAgeF）
                kills = 0,
                cd = 0,
                traitName = trait,                                                              // L1359（u.trait string 语义）
                geneC = gene,                                                                   // L1360
                jobC = st.isCiv ? (int?)job : null,                                             // L1361（def.isCiv ? job : undefined）
                infected = o.infected ? 1 : 0,                                                  // L1362 ?? false
                flip = w.Rng() < 0.5 ? 1 : 0,                                                   // L1363
                name = UniqueName(w, race),                                                     // L1364
                hurt = 0,
                breath = 120 + (int)System.Math.Floor(w.Rng() * 160),                           // L1365
            };
            un.parity = w.unitSeq % 2;                                                          // L1366（id 自增后的 unitSeq——对象字面量求值序）
            un.dead = 0;                                                                        // L1367
            w.units.Add(un);
            w.unitById[un.id] = un;                                                             // L1370（WBB.touchRow 新行 meta 行级灌入——wasm 镜像写点，C# 侧 no-op 同先例）
            if (civ >= 0 && civ < w.civs.Count && w.civs[civ] != null) w.civs[civ].pop++;       // L1371
            if (!st.isCiv) BumpWild(w, race, 1);                                                // L1372
            // —— 家族谱系：繁殖路径继承血脉（fgn+1 代代相传）；白手起家者 6% 开宗立姓 ——
            if (o.fam.HasValue)                                                                 // L1375 opts?.fam !== undefined
            {
                un.famC = o.fam;                                                                // L1376
                un.fgnC = o.fgn ?? 1;                                                           // L1377
                if (w.families.TryGetValue(o.fam.Value, out WbFamily f))                       // L1378
                {
                    f.members++;
                    FamilyMilestone(w, f);                                                      // L1379
                }
            }
            else if (!st.undead && w.Rng() < 0.06)                                              // L1380
            {
                WbFamily f = NewFamily(w, race, un);
                un.famC = f.id;
                un.fgnC = 1;
            }
            if (o.gear)                                                                         // L1384 GUARD
                throw new System.InvalidOperationException("devEquip 未转写（case2 场景不传 gear）");
            if (!o.silent)                                                                      // L1385+ announce 域 GUARD（case2 恒 silent）
                throw new System.InvalidOperationException("spawnUnit announce 分支未转写（case2 场景恒 silent）");
            return un;                                                                          // L1465
        }

        private static int WildCnt(WbWorld w, int race) => w.wildCount.TryGetValue(race, out int v) ? v : 0;   // (this.wildCount.get(race) ?? 0) 助手

        // ================= newFamily（engine L1111-1133 机械翻译） =================
        private static WbFamily NewFamily(WbWorld w, int race, WbU founder)
        {
            string pre = WbNames.FamPre[(int)System.Math.Floor(w.Rng() * WbNames.FamPre.Length)];   // L1112
            string post = WbNames.FamPost[(int)System.Math.Floor(w.Rng() * WbNames.FamPost.Length)]; // L1113
            var f = new WbFamily
            {
                id = w.familySeq++,                                                             // L1114
                name = pre + post,
                race = race,
                founded = (int)System.Math.Floor(w.yearF),                                      // L1116
                founder = founder.name,
                members = 1, heroes = 0, kills = 0, peak = 1, milestones = 0,                   // L1117-1121
            };
            w.families[f.id] = f;                                                               // L1123
            PruneFamilies(w);                                                                   // L1124
            return f;                                                                           // L1125
        }

        // ================= pruneFamilies（engine L1135-1138 机械翻译） =================
        private static void PruneFamilies(WbWorld w)
        {
            if (w.families.Count <= 240) return;                                                // L1135 家族 LRU：超 240 时清除已绝嗣且无战功的最老 20 家
            var dead = w.families.Values.Where(f => f.members <= 0 && f.kills < 10).OrderBy(f => f.id).ToList();   // L1136
            for (int i = 0; i < 20 && i < dead.Count; i++) w.families.Remove(dead[i].id);       // L1137
        }

        // ================= familyMilestone（engine L1139-1149 机械翻译） =================
        private static void FamilyMilestone(WbWorld w, WbFamily f)
        {
            if (f.members > f.peak) f.peak = f.members;                                         // L1139
            int[] marks = { 12, 24, 40 };                                                       // L1140
            while (f.milestones < marks.Length && f.members >= marks[f.milestones])             // L1141
            {
                int m = marks[f.milestones++];                                                  // L1142
                string raceName = f.race >= 0 && f.race < RStats.Length ? RStats[f.race].name : "?";   // L1143 statOf(f.race).name
                w.AddEvent("lineage", $"{raceName}「{f.name}」家族枝繁叶茂 —— 族人已达 {m} 口（先祖 {f.founder}）");   // L1144
            }
        }

        // ================= wildCapOf（engine L2132-2159 机械翻译） =================
        private static int WildCapOf(WbWorld w, int race)
        {
            if (race == R_SHEEP) return 240;                                                    // L2133
            if (race == 7) return 90;                                                           // L2134 WOLF
            if (race == 10) return 160;                                                         // L2135 DEER
            if (race == 11) return 110;                                                         // L2136 PENGUIN
            if (race == 12) return 90;                                                          // L2137 CAMEL
            if (race == 13) return 60;                                                          // L2138 SCORPION
            if (race == 14) return 80;                                                          // L2139 SNAKE
            if (race == 15) return 70;                                                          // L2140 SNOWWOLF
            // 八新动物种群上限（鸡猪兔群居快繁；鱼群最大；鲨鱼稀缺）
            if (race == 33) return 150;                                                         // L2143 CHICKEN
            if (race == 34) return 120;                                                         // L2144 PIG
            if (race == 35) return 220;                                                         // L2145 RABBIT
            if (race == 36) return 70;                                                          // L2146 FOX
            if (race == R_FISH) return 280;                                                     // L2147 FISH
            if (race == R_CRAB) return 90;                                                      // L2148 CRAB
            if (race == 39) return 90;                                                          // L2149 TURTLE
            // 鲨鱼稀缺（Task 98 重校准 40→16）
            if (race == 40) return 16;                                                          // L2153 SHARK
            WbDynRace d = w.dynRaces.TryGetValue(race, out WbDynRace dd) ? dd : null;           // L2154
            if (d == null) return 40;                                                           // L2155
            if (d.cap != 0) return d.cap;                                                       // L2156（TS if (d.cap) falsy 门：0/undefined 同分支）
            if (d.eco == "herb") return 140;                                                    // L2157
            if (d.eco == "pred") return 60;                                                     // L2158
            if (d.eco == "neutral") return 80;                                                  // L2159
            return WildCapOf(w, d.parent);                                                      // L2160 递归
        }

        // ================= bumpWild（engine L1082-1087 机械翻译） =================
        private static void BumpWild(WbWorld w, int race, int dv)
        {
            int n = WildCnt(w, race) + dv;                                                      // L1083
            if (n > 0) w.wildCount[race] = n;                                                   // L1084
            else w.wildCount.Remove(race);                                                      // L1085
        }

        // ================= wildAlive（engine L1089-1094 机械翻译） =================
        private static int WildAlive(WbWorld w)
        {
            int n = 0;
            foreach (int v in w.wildCount.Values) n += v;                                       // L1091-1092
            return n;
        }

        // ================= wildAliveAquatic（engine L1096-1100 机械翻译） =================
        private static int WildAliveAquatic(WbWorld w)
        {
            int n = 0;
            foreach (var kv in w.wildCount)                                                     // L1097（TS Map 插入序遍历——求和无序敏感）
                if (DefOf(kv.Key).aquatic) n += kv.Value;                                       // L1098 RACES[race].aquatic（RDEF 41 表 ≡ 静态表）
            return n;
        }

        // ================= rollJob（engine L1472-1480 机械翻译） =================
        private static int RollJob(WbWorld w)
        {
            double total = 0;                                                                   // L1473
            foreach (JobCase2 j in JobDefs) total += j.weight;                                  // L1474
            double r = w.Rng() * total;                                                         // L1475
            for (int i = 0; i < JobDefs.Length; i++)                                            // L1476
            {
                r -= JobDefs[i].weight;
                if (r <= 0) return i;                                                           // L1477-1478
            }
            return 0;                                                                           // L1479
        }

        // ================= uniqueName（engine L1522-1534 机械翻译） =================
        private static string UniqueName(WbWorld w, int race)
        {
            string bas = WbNames.UnitName(race, w);                                             // L1523 unitName = names.ts L74-77（FIRST[race] ?? FIRST[0] 池）
            int bl = bas.Length;                                                                // L1524
            int n = 0;                                                                          // L1525
            foreach (WbU u in w.units)                                                          // L1526
            {
                if (u.dead != 0) continue;                                                      // L1527
                string nm = u.name;                                                             // L1528
                if (nm == bas || (nm.Length > bl && nm[bl] == ' ' && nm.StartsWith(bas))) n++;  // L1529-1530（charCodeAt(bl) === 32）
            }
            return n == 0 ? bas : $"{bas} {WbNames.Roman(n + 1)}";                              // L1532-1533
        }

        // ================= techModsOf 最小面（engine L4859-4874 场景切片机械翻译） =================
        private static (double hp, double dmg) TechModsOf2(WbWorld w, int civId)
        {
            if (civId < 0) return (1, 1);                                                       // L4860 NEUTRAL
            WbCiv c = civId < w.civs.Count ? w.civs[civId] : null;                              // L4861
            if (c != null && c.techs != null && c.techs.Count > 0)                              // L4862 GUARD
                throw new System.InvalidOperationException("techModsOf 非空 techs 未转写（case2 场景外）");
            if (w.emTechs != null && w.emTechs.Count > 0)                                       // L4864 GUARD
                throw new System.InvalidOperationException("emTechs 叠加未转写（case2 场景外）");
            return (1, 1);
        }

        // ================= govOf（engine L8067-8070 机械翻译） =================
        private static int GovOf(WbWorld w, int civId)
        {
            if (civId < 0) return 0;                                                            // L8068
            WbCiv c = civId < w.civs.Count ? w.civs[civId] : null;                              // L8069 ?.gov ?? 0
            return c != null ? c.gov : 0;
        }
    }
}
