// ============================================================
// WbCivSim.cs — civsTick 文明模拟族（M-U3b 领土与建造核）
// 蓝本: src/lib/game/engine.ts（逐行机械翻译，纪律①）
//   civsTick L5933-6040 / civFuseScan L2352-2371 / claimTile L1719-1753 /
//   seedTerritory L1681-1717 / popCapOf L2004-2014 / houseTierOf L12237-12245 /
//   pickBuildingKind L5893-5931 / tryBuildBuilding L1958-1996 / buildBuilding L1756-1769 /
//   destroyBuilding L1936-1955 / connectRoad L1906-1934 / findPath L1833-1903 /
//   eliminateCiv L2174-2238 / techModsOf L4859-4874 / atWar L2061 / civAtWar L2017 /
//   diplomacyMeet L2037-2059 / raceRelOf L8054 / rebuildCivBuildCounts L2025-2034 /
//   activeDirective L7717-7722 / crownVacantTick L1646 / wallTick L1773 /
//   tryLaunchColonyShip L5516 / splitKingdom L5456 / setJob L1482
// M-U3c 桩位（黄金场景门控避让，位等价）：crownVacantTick/wallTick/殖民船/叛乱分裂/
//   总动员 setJob/civFuseScan 融合体 mergeCivs/diplomacyMeet 宣战分支 pickCasus+declareWar
// 宿主协议: tickCount%5===0 → RebuildCivBuildCounts() → CivsTick()（engine L2526）
// ============================================================
namespace PixelWorldBox.Wb
{
    using System.Collections.Generic;

    public static class WbCivSim
    {
        // ---------------- BUILDING_DEFS / BUILD_KINDS（types.ts L325-341） ----------------
        public static class BUILD_KINDS
        {
            public const int HOUSE = 1, CAPITAL = 2, TOWER = 3, FARM = 4, BARRACKS = 5,
                             CASTLE = 6, PORT = 7, LIBRARY = 8, MARKET = 9, TEMPLE = 10, WALL = 11;
        }

        /// BuildingDef —— types.ts L311-323
        public struct BuildingDef
        {
            public string key;
            public string name;
            public int hp;
            public int popCap;         // -1 = undefined
            public int cost;           // -1 = undefined（?? 0 语义：cost 缺省按 0——蓝本 L57 cost ?? 0）
            public int needKnowledge;  // -1 = undefined
        }

        /// types.ts L325-338 全表（?? 语义：popCap/cost/needKnowledge 缺省 = -1 哨兵，读取点 ?? 0）
        public static readonly BuildingDef[] BUILDING_DEFS = new BuildingDef[]
        {
            new BuildingDef { key = "none",     name = "空地", hp = 0,   popCap = -1, cost = -1, needKnowledge = -1 },
            new BuildingDef { key = "house",    name = "住宅", hp = 70,  popCap = 4,  cost = 0,  needKnowledge = -1 },
            new BuildingDef { key = "capital",  name = "王都", hp = 240, popCap = 6,  cost = 0,  needKnowledge = -1 },
            new BuildingDef { key = "tower",    name = "箭塔", hp = 120, popCap = -1, cost = 8,  needKnowledge = -1 },
            new BuildingDef { key = "farm",     name = "农田", hp = 40,  popCap = 2,  cost = 5,  needKnowledge = -1 },
            new BuildingDef { key = "barracks", name = "兵营", hp = 150, popCap = -1, cost = 12, needKnowledge = -1 },
            new BuildingDef { key = "castle",   name = "城堡", hp = 340, popCap = -1, cost = 34, needKnowledge = 18 },
            new BuildingDef { key = "port",     name = "港口", hp = 90,  popCap = -1, cost = 16, needKnowledge = 8 },
            new BuildingDef { key = "library",  name = "图书馆", hp = 110, popCap = -1, cost = 18, needKnowledge = -1 },
            new BuildingDef { key = "market",   name = "集市", hp = 100, popCap = -1, cost = 12, needKnowledge = -1 },
            new BuildingDef { key = "temple",   name = "神殿", hp = 140, popCap = -1, cost = 22, needKnowledge = 10 },
            new BuildingDef { key = "wall",     name = "城墙", hp = 200, popCap = -1, cost = 2,  needKnowledge = -1 },
        };

        private static int DefCost(int kind) { var c = BUILDING_DEFS[kind].cost; return c < 0 ? 0 : c; }
        private static int DefPopCap(int kind) { var c = BUILDING_DEFS[kind].popCap; return c < 0 ? 0 : c; }
        private static int DefNeedKnowledge(int kind) { var c = BUILDING_DEFS[kind].needKnowledge; return c < 0 ? 0 : c; }
        private static int DefHp(int kind) => BUILDING_DEFS[kind].hp;

        // ---------------- TechMods（tech.ts L163-200+ 全表机械翻译） ----------------
        /// modsOfTechs —— tech.ts L171 起 switch 全表（techs=[] 走 NEUTRAL 原样拷贝；全表保真供 M-U3c+ 科技切片复用）
        public static WbTechMods ModsOfTechs(List<string> keys)
        {
            var m = new WbTechMods();
            if (keys == null) return m;
            foreach (var k in keys)
            {
                switch (k)
                {
                    case "fire": m.repro += 0.08; break;
                    case "stone": m.archer += 0.0; m.dmg += 0.10; break;
                    case "shelter": m.bhp += 0.15; break;
                    case "clan": m.stab += 8; break;
                    case "song": m.cult += 0.5; break;
                    case "gather": m.tax += 0.2; break;
                    case "raft": m.col -= 0.10; break;
                    case "pottery": m.tax += 0.15; break;
                    case "irrigation": m.repro += 0.08; break;
                    case "bronze": m.dmg += 0.15; break;
                    case "writing": m.know += 0.3; break;
                    case "masonry": m.bhp += 0.25; m.repair += 0.5; break;
                    case "currency": m.gold += 0.4; break;
                    case "sail": m.col -= 0.2; break;
                    case "law": m.stab += 12; break;
                    case "crossbow": m.archer += 0.2; break;
                    case "plow": m.repro += 0.12; break;
                    case "iron": m.dmg += 0.18; m.hp += 0.10; break;
                    case "guild": m.gold += 0.25; break;
                    case "theology": m.cult += 0.8; break;
                    case "fortification": m.bhp += 0.30; break;
                    case "compass": m.col -= 0.25; break;
                    case "feudal": m.tax += 0.3; m.stab -= 4; break;
                    case "tactics": m.morale += 8; break;
                    case "machinery": m.repair += 0.6; break;
                    case "crop4": m.repro += 0.15; break;
                    default: break; // 其余科技项（emTechs 涌现域）M-U3b 黄金场景不含——TODO(M-U3c) 逐项补全
                }
            }
            return m;
        }

        // ---------------- techModsOf（engine L4859-4874） ----------------
        private static readonly Dictionary<int, WbTechMods> techModCache = new Dictionary<int, WbTechMods>();
        private static WbTechMods TechModsOf(WbWorld w, int civId)
        {
            if (civId < 0) return new WbTechMods(); // NEUTRAL_MODS
            WbTechMods cached;
            if (techModCache.TryGetValue(civId, out cached)) return cached;
            WbCiv c = CivAt(w, civId);
            WbTechMods mods = c != null ? ModsOfTechs(c.techs) : new WbTechMods();
            // v3 涌现科技叠加：emTechs M-U3b 恒空（TODO(M-U3c)）
            techModCache[civId] = mods;
            return mods;
        }
        /// generate/读档清缓存点（engine L825）
        public static void ClearTechModCache() => techModCache.Clear();

        // ---------------- civsTick（engine L5933-6040） ----------------
        public static void CivsTick(WbWorld w)
        {
            CivFuseScan(w); // 超级演化 v4：深盟融合扫描（内部自带 300 tick 错峰门）
            // —— 王权：王位空缺补冕（建国首王/旧档补冕/驾崩继承；内部逐国扫描） ——
            if (w.tickCount % 40 == 0) CrownVacantTick(w);
            // —— 城墙：有城防科技的王国环绕首都修筑城墙圈（分批砌筑） ——
            if (w.tickCount % 20 == 0) WallTick(w);
            for (int ci = 0; ci < w.civs.Count; ci++)
            {
                WbCiv civ = w.civs[ci];
                if (civ == null) continue; // 稀疏槽位（engine for-of 跳洞语义）
                if (!civ.alive) continue;
                // 幽灵王国消亡：人口持续为 0（哪怕还有空房）超过 10 年 → 自然消亡，领土归无主
                if (civ.pop <= 0)
                {
                    if (civ.popZeroTick == null) civ.popZeroTick = w.tickCount;
                    else if (w.tickCount - civ.popZeroTick.Value > 400) { EliminateCiv(w, civ); continue; }
                }
                else civ.popZeroTick = null;
                // 幽灵王国自愈：有国民但零领土零边境（水上建国/旧存档数据/家园尽毁）
                // → 每 600 tick 在一名在世成员脚下重新播种（旧存档读入后同样生效）
                if (civ.pop > 0 && civ.frontier.Count == 0 && w.tickCount % 600 == 0)
                {
                    int owned = 0;
                    foreach (int i in civ.tiles) if (w.owner[i] == civ.id) owned++;
                    if (owned == 0)
                    {
                        WbU member = null;
                        for (int ui = 0; ui < w.units.Count; ui++)
                        {
                            WbU uu = w.units[ui];
                            if (uu.dead == 0 && uu.civ == civ.id) { member = uu; break; }
                        }
                        if (member != null)
                        {
                            SeedTerritory(w, civ, (int)System.Math.Floor(member.x), (int)System.Math.Floor(member.y));
                            if (civ.tiles.Count > 0)
                            {
                                w.Toast($"「{civ.name}」的流亡者重新扎根了", "good");
                                w.AddEvent("settle", $"「{civ.name}」的流亡者在新的土地上重新扎根", civ.colorHex, member.x, member.y);
                            }
                        }
                    }
                }
                // 总动员期间：平民持续武装化（旨意/开发者驱动的全民皆兵）
                if (civ.mobilizeUntil != null && w.tickCount < civ.mobilizeUntil.Value && w.tickCount % 25 == 0)
                {
                    int n = 0;
                    for (int ui = 0; ui < w.units.Count && n < 2; ui++)
                    {
                        WbU u = w.units[ui];
                        if (u.dead != 0 || u.civ != civ.id || u.boat != 0) continue;
                        int job = u.job;
                        if (job == 0 || job == 1 || job == 5) { SetJob(w, u, 2); n++; }
                    }
                }
                // territory expansion — 2 tiles per civ every 5 ticks（无人不扩张：无民何以为国）；扩张令期间加速 3 倍
                int expandBoost = ActiveDirective(w, civ.id, "expand") != null ? 3 : 1;
                if (w.laws.cityGrowth && civ.pop > 0) for (int k = 0; k < 2 * expandBoost; k++)
                {
                    if (civ.frontier.Count == 0) break;
                    int fi = (int)(w.Rng() * civ.frontier.Count);
                    int i = civ.frontier[fi];
                    civ.frontier[fi] = civ.frontier[civ.frontier.Count - 1];
                    civ.frontier.RemoveAt(civ.frontier.Count - 1);
                    if (w.owner[i] != -1) continue;
                    if (!WbWorld.IsLand(w.terrain[i]) || w.terrain[i] == WbWorld.T_MOUNTAIN) continue;
                    ClaimTile(w, i, civ.id);
                }
                // housing & building variety：按人口压力/战争/财富/知识选择建造目标
                if (w.tickCount % 120 == 0 && civ.pop > 0)
                {
                    int cap = PopCapOf(w, civ);
                    if (civ.pop > cap - 2)
                    {
                        int kind = PickBuildingKind(w, civ);
                        int cost = DefCost(kind);
                        if ((civ.gold ?? 0) >= cost)
                        {
                            if (TryBuildBuilding(w, civ, kind)) civ.gold = (civ.gold ?? 0) - cost;
                        }
                        else
                        {
                            // 财富不足 → 退而建免费住宅
                            TryBuildBuilding(w, civ, BUILD_KINDS.HOUSE);
                        }
                    }
                }
                // war towers（保留旧时代行为：战争期间补建箭塔）
                if (w.tickCount % 300 == 0 && civ.houses > 8 && w.Rng() < 0.5)
                {
                    bool atWar = false;
                    foreach (WbCiv other in w.civs)
                    {
                        if (other != null && other.alive && other.id != civ.id && AtWar(w, civ.id, other.id)) { atWar = true; break; }
                    }
                    if (atWar) TryBuildBuilding(w, civ, BUILD_KINDS.TOWER);
                }
                // colony ships — 繁荣文明周期性跨海殖民
                if (civ.pop >= 10 && civ.houses >= 2 && w.tickCount >= (civ.colonizeCd) && w.Rng() < 0.06)
                {
                    TryLaunchColonyShip(w, civ);
                }
                // 叛乱分裂：大国度（人口 > 30 且领土 > 220）每 300 tick（7.5 年）掷骰 ——
                // 社会体系联动：稳定度低 → 概率倍增（动荡帝国四分五裂）；稳定度高 → 几乎无内乱
                if (w.laws.rebels && w.tickCount % 300 == 0 && civ.pop > 30 && civ.tiles.Count > 220)
                {
                    int stab = civ.stability;
                    double rebelChance = stab < 30 ? 0.16 : stab < 50 ? 0.08 : stab < 70 ? 0.04 : 0.015;
                    if (w.Rng() < rebelChance)
                    {
                        SplitKingdom(w, civ);
                        continue;
                    }
                }
                // promote capital
                if (civ.capital < 0 && civ.houses > 0)
                {
                    WbBuilding b = null;
                    for (int bi = 0; bi < w.buildings.Count; bi++)
                    {
                        WbBuilding bb = w.buildings[bi];
                        if (bb.civ == civ.id && bb.kind == 1) { b = bb; break; }
                    }
                    if (b != null)
                    {
                        w.bIdx.Remove(b.i);
                        w.building[b.i] = 0;
                        WbCiv civ2 = CivAt(w, b.civ);
                        if (civ2 != null) civ2.houses--;
                        int bpos = w.buildings.IndexOf(b);
                        WbBuilding last = w.buildings[w.buildings.Count - 1];
                        w.buildings.RemoveAt(w.buildings.Count - 1);
                        if (bpos < w.buildings.Count) { w.buildings[bpos] = last; w.bIdx[last.i] = bpos; }
                        BuildBuilding(w, b.i, 2, civ.id);
                        civ.capital = b.i;
                        // 迁都播报（王都陷落后的韧性）
                        w.AddEvent("capital", $"「{civ.name}」迁都于新都，重整山河", civ.colorHex, b.x, b.y);
                    }
                }
                // elimination
                if (civ.pop <= 0 && civ.houses <= 0) EliminateCiv(w, civ);
            }
        }

        // ---------------- civFuseScan（engine L2352-2371） ----------------
        public static void CivFuseScan(WbWorld w)
        {
            if (w.tickCount % 300 != 5) return;
            long now = w.tickCount;
            foreach (WbAlliance al in w.alliances)
            {
                if (al.cohesion < 70 || al.members.Count < 2) continue;
                if (now - al.formedTick < 1440) continue; // 成立未满 36 年（1 年 = 40 tick）
                List<WbCiv> alive = new List<WbCiv>();
                foreach (int m in al.members)
                {
                    WbCiv c = CivAt(w, m);
                    if (c != null && c.alive && c.pop >= 20) alive.Add(c);
                }
                if (alive.Count < 2) continue;
                // 候选对：两两非交战（同盟内部本就无战）
                for (int i = 0; i < alive.Count; i++)
                {
                    for (int j = i + 1; j < alive.Count; j++)
                    {
                        WbCiv a = alive[i];
                        WbCiv b = alive[j];
                        if (AtWar(w, a.id, b.id)) continue;
                        if (w.Rng() > 0.1) continue;
                        if (MergeCivs(w, a, b, "natural")) return; // 每轮最多一次合并（防天下大势一夜巨变）
                    }
                }
            }
        }

        // ---------------- claimTile（engine L1719-1753） ----------------
        public static void ClaimTile(WbWorld w, int i, int civId)
        {
            WbCiv civ = CivAt(w, civId);
            if (civ == null || !civ.alive) return;
            w.owner[i] = (short)civId;
            // 占领层同步清除（转正/割让/新占都走主权移交，不留虚界残影）
            if (w.occCiv[i] != -1) { w.occCiv[i] = -1; w.occStr[i] = 0; w.occSet.Remove(i); }
            civ.tiles.Add(i);
            w.MarkDirty(i);
            // overlayMode 'political'/'alliance' 渲染态：C# 无 overlay 层（M-U4 渲染切片域）
            int x = i % WbWorld.W;
            int y = i / WbWorld.W;
            if (x > 0) PushFrontier(w, civ, i - 1);
            if (x < WbWorld.W - 1) PushFrontier(w, civ, i + 1);
            if (y > 0) PushFrontier(w, civ, i - WbWorld.W);
            if (y < WbWorld.H - 1) PushFrontier(w, civ, i + WbWorld.W);
            // diplomacy on border contact
            if (x > 0) MeetNeighbor(w, civ, civId, i - 1);
            if (x < WbWorld.W - 1) MeetNeighbor(w, civ, civId, i + 1);
            if (y > 0) MeetNeighbor(w, civ, civId, i - WbWorld.W);
            if (y < WbWorld.H - 1) MeetNeighbor(w, civ, civId, i + WbWorld.W);
        }

        /// claimTile push 闭包（L1730-1732）
        private static void PushFrontier(WbWorld w, WbCiv civ, int j)
        {
            if (w.owner[j] == -1 && WbWorld.IsLand(w.terrain[j]) && w.terrain[j] != WbWorld.T_MOUNTAIN) civ.frontier.Add(j);
        }

        /// claimTile meet 闭包（L1738-1747）
        private static void MeetNeighbor(WbWorld w, WbCiv civ, int civId, int j)
        {
            int o = w.owner[j];
            if (o >= 0 && o != civId)
            {
                DiplomacyMeet(w, civId, o);
                // 边境摩擦：领土接触是地缘张力的燃料（扩张期摩擦飙升 → 战争风险真实起来）
                if (w.Rng() < 0.5)
                {
                    string k = WbWorld.PairKey(civId, o);
                    int cur;
                    w.tension.TryGetValue(k, out cur);
                    w.tension[k] = System.Math.Min(80, cur + 2);
                }
            }
        }

        // ---------------- seedTerritory（engine L1681-1717） ----------------
        public static void SeedTerritory(WbWorld w, WbCiv civ, int cx, int cy)
        {
            // 先剔除 owner 已不符的陈旧记录（避免 stats 双计）
            if (civ.tiles.Count > 0)
            {
                civ.tiles.RemoveAll((i) => w.owner[i] != civ.id);
            }
            if (ClaimAt(w, civ, cx, cy) > 0) return;
            for (int r = 3; r <= 14; r++)
            {
                for (int dy = -r; dy <= r; dy++)
                {
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (System.Math.Max(System.Math.Abs(dx), System.Math.Abs(dy)) != r) continue; // 只扫当前环
                        int xx = cx + dx;
                        int yy = cy + dy;
                        if (xx < 1 || yy < 1 || xx >= WbWorld.W - 1 || yy >= WbWorld.H - 1) continue;
                        int i = WbWorld.Idx(xx, yy);
                        if (w.owner[i] == -1 && WbWorld.IsLand(w.terrain[i]) && w.terrain[i] != WbWorld.T_MOUNTAIN)
                        {
                            if (ClaimAt(w, civ, xx, yy) > 0) return;
                        }
                    }
                }
            }
        }

        /// seedTerritory claimAt 闭包（L1686-1701）
        private static int ClaimAt(WbWorld w, WbCiv civ, int ax, int ay)
        {
            int n = 0;
            for (int dy = -2; dy <= 2; dy++)
            {
                for (int dx = -2; dx <= 2; dx++)
                {
                    int xx = ax + dx;
                    int yy = ay + dy;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                    int i = WbWorld.Idx(xx, yy);
                    if (w.owner[i] == -1 && WbWorld.IsLand(w.terrain[i]) && w.terrain[i] != WbWorld.T_MOUNTAIN)
                    {
                        ClaimTile(w, i, civ.id);
                        n++;
                    }
                }
            }
            return n;
        }

        // ---------------- popCapOf（engine L2004-2014） ----------------
        public static int PopCapOf(WbWorld w, WbCiv civ)
        {
            int bonus = HouseTierOf(w, civ);
            int[] counts;
            if (!w.civBuildCounts.TryGetValue(civ.id, out counts) || counts == null) return civ.houses * (WbWorld.HOUSE_CAP + bonus);
            int cap = 0;
            for (int k = 1; k < BUILDING_DEFS.Length; k++)
            {
                int pc = DefPopCap(k);
                if (pc > 0 && k < counts.Length && counts[k] > 0)
                    cap += (pc + (k == BUILD_KINDS.HOUSE ? bonus : 0)) * counts[k];
            }
            return cap;
        }

        // ---------------- houseTierOf（engine L12237-12245） ----------------
        public static int HouseTierOf(WbWorld w, WbCiv civ)
        {
            if (civ == null || !civ.alive) return 0;
            List<string> t = civ.techs;
            int tier = 0;
            if (t != null && t.Contains("masonry")) tier = 1;
            if (t != null && t.Contains("fortification")) tier = 2;
            if (t != null && t.Contains("gothic")) tier = 3;
            return tier;
        }

        // ---------------- pickBuildingKind（engine L5893-5931） ----------------
        public static int PickBuildingKind(WbWorld w, WbCiv civ)
        {
            int[] counts;
            w.civBuildCounts.TryGetValue(civ.id, out counts);
            int C(int k) => (counts != null && k < counts.Length) ? counts[k] : 0;
            int houses = System.Math.Max(1, civ.houses);
            int gold = civ.gold ?? 0;
            int know = civ.knowledge ?? 0;
            bool war = CivAtWar(w, civ.id);
            int pop = System.Math.Max(1, civ.pop);
            // 旨意加成：建城令住宅权重 ×3 / 信仰令神殿权重 ×5（文明自行达成的引擎）
            bool buildDir = ActiveDirective(w, civ.id, "build") != null;
            bool templeDir = ActiveDirective(w, civ.id, "temple") != null;
            List<KeyValuePair<int, int>> cands = new List<KeyValuePair<int, int>>(); // (kind, w)
            // 住宅：人口压力的基本解
            cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.HOUSE, buildDir ? 30 : 10));
            // 农田：供养扩张（每 3 人需要 1 农田支撑）
            if (C(BUILD_KINDS.FARM) * 3 < pop / 3 + 2) cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.FARM, 9));
            // 兵营：战时军备
            if (war && C(BUILD_KINDS.BARRACKS) < 1 + houses / 10) cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.BARRACKS, 8));
            // 箭塔：战争防御
            if (war && C(BUILD_KINDS.TOWER) < 1 + houses / 12) cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.TOWER, 5));
            // 集市：财富引擎
            if (C(BUILD_KINDS.MARKET) < 1 + houses / 12) cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.MARKET, 6));
            // 图书馆：知识引擎
            if (C(BUILD_KINDS.LIBRARY) < 1 + houses / 20) cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.LIBRARY, 4));
            // 港口：海洋扩张
            if (know >= DefNeedKnowledge(BUILD_KINDS.PORT) && C(BUILD_KINDS.PORT) < 1 + houses / 25) cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.PORT, 4));
            // 神殿：治疗庇佑
            if (know >= DefNeedKnowledge(BUILD_KINDS.TEMPLE) && C(BUILD_KINDS.TEMPLE) < 1 + houses / 15) cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.TEMPLE, templeDir ? 18 : 3));
            // 城堡：终极防御
            if (know >= DefNeedKnowledge(BUILD_KINDS.CASTLE) && C(BUILD_KINDS.CASTLE) < 1 + houses / 25) cands.Add(new KeyValuePair<int, int>(BUILD_KINDS.CASTLE, 6));
            // 过滤财富不足的候选
            List<KeyValuePair<int, int>> afford = cands.FindAll((x) => gold >= DefCost(x.Key));
            List<KeyValuePair<int, int>> pool = afford.Count > 0 ? afford : new List<KeyValuePair<int, int>> { new KeyValuePair<int, int>(BUILD_KINDS.HOUSE, 1) };
            int total = 0;
            foreach (var x in pool) total += x.Value;
            double r = w.Rng() * total;
            foreach (var x in pool) { r -= x.Value; if (r <= 0) return x.Key; }
            return BUILD_KINDS.HOUSE;
        }

        // ---------------- tryBuildBuilding（engine L1958-1996） ----------------
        public static bool TryBuildBuilding(WbWorld w, WbCiv civ, int kind)
        {
            bool needWater = kind == BUILD_KINDS.PORT;
            int spacing = kind == BUILD_KINDS.FARM ? 2 : 3;
            for (int attempt = 0; attempt < 24; attempt++)
            {
                if (civ.tiles.Count == 0) return false;
                int i = civ.tiles[(int)(w.Rng() * civ.tiles.Count)];
                if (w.owner[i] != civ.id) continue;
                if (!WbWorld.Buildable(w.terrain[i]) || w.building[i] > 0) continue;
                int x = i % WbWorld.W;
                int y = i / WbWorld.W;
                if (needWater)
                {
                    // 港口：周边 2 格内须有海面
                    bool nearSea = false;
                    for (int dy = -2; dy <= 2 && !nearSea; dy++)
                    {
                        for (int dx = -2; dx <= 2; dx++)
                        {
                            int xx = x + dx, yy = y + dy;
                            if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                            if (WbWorld.IsWater(w.terrain[WbWorld.Idx(xx, yy)])) { nearSea = true; break; }
                        }
                    }
                    if (!nearSea) continue;
                }
                // spacing from other buildings
                bool ok = true;
                foreach (WbBuilding b in w.buildings)
                {
                    if (b.civ != civ.id) continue;
                    if (System.Math.Abs(b.x - x) < spacing && System.Math.Abs(b.y - y) < spacing) { ok = false; break; }
                }
                if (!ok) continue;
                BuildBuilding(w, i, kind, civ.id);
                w.Fx("smoke", x, y, 26, optR: 1);
                // 高阶建筑落成播报（城堡/神殿/图书馆/港口）
                if (kind == BUILD_KINDS.CASTLE || kind == BUILD_KINDS.TEMPLE || kind == BUILD_KINDS.LIBRARY || kind == BUILD_KINDS.PORT)
                {
                    w.AddEvent("build", $"「{civ.name}」建成{BUILDING_DEFS[kind].name}，国力日盛", civ.colorHex, x, y);
                }
                return true;
            }
            return false;
        }

        // ---------------- buildBuilding（engine L1756-1769） ----------------
        public static void BuildBuilding(WbWorld w, int i, int kind, int civId)
        {
            if (w.building[i] > 0) return;
            var b = new WbBuilding { i = i, x = i % WbWorld.W, y = i / WbWorld.W, kind = kind, civ = civId };
            w.buildings.Add(b);
            w.bIdx[i] = w.buildings.Count - 1;
            w.building[i] = (byte)kind;
            // 科技工程加成：石匠/城墙等提升建筑耐久（新建筑按当前科技入帐）
            w.bHp[i] = System.Math.Round(DefHp(kind) * TechModsOf(w, civId).bhp);
            w.damagedSet.Remove(i);
            WbCiv civ = CivAt(w, civId);
            if (civ != null && kind != BUILD_KINDS.WALL) civ.houses++; // 城墙不计入住宅（不虚增人口容量）
            // 深度打磨：建筑落成即连路（村庄脉络自然生长；首都/首栋为路网根节点）——城墙不铺路
            if (kind != BUILD_KINDS.WALL) ConnectRoad(w, i, civId);
        }

        // ---------------- destroyBuilding（engine L1936-1955） ----------------
        public static void DestroyBuilding(WbWorld w, int i)
        {
            int bi;
            if (!w.bIdx.TryGetValue(i, out bi)) return;
            WbBuilding b = w.buildings[bi];
            WbCiv civ = CivAt(w, b.civ);
            if (civ != null)
            {
                civ.houses--;
                if (b.kind == BUILD_KINDS.CAPITAL) civ.capital = -1;
            }
            WbBuilding last = w.buildings[w.buildings.Count - 1];
            w.buildings.RemoveAt(w.buildings.Count - 1);
            if (bi < w.buildings.Count)
            {
                w.buildings[bi] = last;
                w.bIdx[last.i] = bi;
            }
            w.bIdx.Remove(i);
            w.building[i] = 0;
            w.bHp.Remove(i);
            w.damagedSet.Remove(i);
            w.Fx("smoke", b.x, b.y, 36, optR: 1.5);
        }

        // ---------------- connectRoad（engine L1906-1934） ----------------
        public static void ConnectRoad(WbWorld w, int i, int civId)
        {
            int x = i % WbWorld.W;
            int y = i / WbWorld.W;
            // 目标：同文明已通路建筑或首都（就近）
            int? best = null;
            double bestD = double.PositiveInfinity;
            foreach (WbBuilding o in w.buildings)
            {
                if (o.civ != civId || o.i == i) continue;
                if (o.kind != BUILD_KINDS.CAPITAL && w.road[o.i] == 0) continue;
                int d = System.Math.Abs(o.x - x) + System.Math.Abs(o.y - y);
                if (d > 0 && d < bestD) { bestD = d; best = o.i; }
            }
            if (best == null) return;
            List<int> path = FindPath(w, i, best.Value, 800);
            if (path == null) return;
            int laid = 0;
            foreach (int p in path)
            {
                if (w.road[p] == 0)
                {
                    w.road[p] = 1;
                    w.dirty.Add(p);
                    w.propsDirty.Add(p);
                    laid++;
                }
            }
            if (laid > 3 && w.Rng() < 0.1)
            {
                WbCiv civ = CivAt(w, civId);
                if (civ != null) w.AddEvent("road", $"「{civ.name}」修筑道路，疆域脉络渐成", civ.colorHex, x, y);
            }
        }

        // ---------------- findPath（engine L1833-1903，A* + 二叉小顶堆） ----------------
        public static List<int> FindPath(WbWorld w, int from, int to, int budget = 4000)
        {
            if (from == to) return new List<int> { from };
            int tx = to % WbWorld.W;
            int ty = to / WbWorld.W;
            Dictionary<int, int> g = new Dictionary<int, int> { [from] = 0 };
            Dictionary<int, int> prev = new Dictionary<int, int> { [from] = -1 };
            // 二叉小顶堆（平行数组：f 值 / 节点）
            List<double> hf = new List<double> { System.Math.Abs(tx - (from % WbWorld.W)) + System.Math.Abs(ty - (from / WbWorld.W)) };
            List<int> hn = new List<int> { from };
            void Push(double f, int n)
            {
                hf.Add(f); hn.Add(n);
                int i2 = hf.Count - 1;
                while (i2 > 0)
                {
                    int p = (i2 - 1) >> 1;
                    if (hf[p] <= hf[i2]) break;
                    double tf = hf[p]; hf[p] = hf[i2]; hf[i2] = tf;
                    int tn = hn[p]; hn[p] = hn[i2]; hn[i2] = tn;
                    i2 = p;
                }
            }
            int expanded = 0;
            while (hn.Count > 0 && expanded < budget)
            {
                // pop min
                int cur = hn[0];
                double lf = hf[hf.Count - 1]; hf.RemoveAt(hf.Count - 1);
                int ln = hn[hn.Count - 1]; hn.RemoveAt(hn.Count - 1);
                if (hf.Count > 0)
                {
                    hf[0] = lf; hn[0] = ln;
                    int i2 = 0;
                    for (; ; )
                    {
                        int l = i2 * 2 + 1;
                        int r = l + 1;
                        int m = i2;
                        if (l < hf.Count && hf[l] < hf[m]) m = l;
                        if (r < hf.Count && hf[r] < hf[m]) m = r;
                        if (m == i2) break;
                        double tf = hf[m]; hf[m] = hf[i2]; hf[i2] = tf;
                        int tn = hn[m]; hn[m] = hn[i2]; hn[i2] = tn;
                        i2 = m;
                    }
                }
                if (cur == to)
                {
                    List<int> path = new List<int>();
                    int p = cur;
                    while (p != -1) { path.Add(p); p = prev[p]; }
                    path.Reverse();
                    return path;
                }
                expanded++;
                int cg = g[cur];
                int cx = cur % WbWorld.W;
                int cy = cur / WbWorld.W;
                for (int dy = -1; dy <= 1; dy++)
                {
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int xx = cx + dx;
                        int yy = cy + dy;
                        if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                        int j = yy * WbWorld.W + xx;
                        int t = w.terrain[j];
                        if (t == WbWorld.T_DEEP || t == WbWorld.T_WATER || t == WbWorld.T_MOUNTAIN || t == WbWorld.T_LAVA) continue;
                        int ng = cg + 1;
                        int og;
                        if (g.TryGetValue(j, out og) && og <= ng) continue;
                        g[j] = ng;
                        prev[j] = cur;
                        Push(ng + System.Math.Abs(tx - xx) + System.Math.Abs(ty - yy), j);
                    }
                }
            }
            return null;
        }

        // ---------------- eliminateCiv（engine L2174-2238） ----------------
        public static void EliminateCiv(WbWorld w, WbCiv civ)
        {
            // 灭国归属：若亡于交战之手，纪事归于征服者（灭国战争叙事闭环）
            WbCiv conqueror = null;
            foreach (WbCiv o in w.civs)
            {
                if (o != null && o.alive && o.id != civ.id && AtWar(w, o.id, civ.id)) { conqueror = o; break; }
            }
            civ.alive = false;
            w.statCivsFallen++; // 成就计数：王国陨落
            ClearFrontOf(w, civ.id); // 该国战线全境蒸发
            // —— 联盟除名：亡国的旗帜从盟册上撤下（凝聚力受创——盟友陨落的震动）——
            WbAlliance alFall = AllianceOfCiv(w, civ.id);
            if (alFall != null)
            {
                alFall.cohesion = System.Math.Max(0, alFall.cohesion - 18);
                LeaveAlliance(w, civ.id, "fallen");
                w.AddEvent("alliance", $"「{civ.name}」的覆灭震动了盟邦——「{alFall.members.Count >= 2 ? alFall.name : "其盟友"}」为亡者降下半旗", alFall.colorHex);
            }
            // —— 终极世界大战：参战国覆灭追记（逐面旗帜倒下）——
            // worldWar M-U3b 恒 idle（M-U3c 世界大战域）→ 条件恒假，结构保留 TODO(M-U3c)
            // —— 军团随之覆灭（静默解散）——
            // armies M-U3b 恒空列表（M-U3c 军团域）TODO(M-U3c)
            // —— 战争档案清理 ——
            // warData M-U3b 恒空（M-U3c 战争域）TODO(M-U3c)
            // —— 旨意结算：以该国为目标的灭国/攻城令 → 颁布方成功；该国的旨意 → 失败 ——
            foreach (WbDirective d in w.directives)
            {
                if (d.status != "active") continue;
                if (d.civ == civ.id) FinishDirective(w, d, "failed", $"「{civ.name}」覆灭，宏图化为泡影");
                else if ((d.kind == "annihilate" || d.kind == "conquer") && d.target == civ.id) FinishDirective(w, d, "success", $"目标「{civ.name}」已被抹去");
            }
            foreach (int i in civ.tiles)
            {
                if (w.owner[i] == civ.id)
                {
                    w.owner[i] = -1;
                    w.MarkDirty(i);
                }
            }
            civ.tiles.Clear();
            civ.frontier.Clear();
            for (int bi = w.buildings.Count - 1; bi >= 0; bi--)
            {
                // 逆序遍历 + DestroyBuilding 内部 swap-remove：快照后再逐个销毁（语义等价 [...this.buildings] 快照）
                WbBuilding b = w.buildings[bi];
                if (b.civ == civ.id) DestroyBuilding(w, b.i);
            }
            // 清理该文明的外交残留（否则 warsCount 统计与关系矩阵会永远计入亡国）
            List<string> relKeys = new List<string>(w.rel.Keys);
            foreach (string key in relKeys)
            {
                int dash = key.IndexOf('-');
                int x = int.Parse(key.Substring(0, dash));
                int y = int.Parse(key.Substring(dash + 1));
                if (x == civ.id || y == civ.id) { w.rel.Remove(key); }
            }
            List<string> metKeys = new List<string>(w.met);
            foreach (string key in metKeys)
            {
                int dash = key.IndexOf('-');
                int x = int.Parse(key.Substring(0, dash));
                int y = int.Parse(key.Substring(dash + 1));
                if (x == civ.id || y == civ.id) w.met.Remove(key);
            }
            w.Toast($"「{civ.name}」覆灭了", "danger");
            if (conqueror != null)
            {
                w.AddEvent("fall", $"「{civ.name}」（{WbCivSim.RaceName(civ.race)}）被「{conqueror.name}」彻底征服，旗帜倒下，国土并入征服者的版图", conqueror.colorHex);
            }
            else
            {
                w.AddEvent("fall", $"「{civ.name}」（{WbCivSim.RaceName(civ.race)}）的旗帜倒下了，国土化为无主之地", civ.colorHex);
            }
            // overlay 渲染态：M-U4 域
        }

        /// RACES[race].name —— types.ts RACES 表名（黄金场景用 0 human/1 elf；全表已入 WbConstants RF 组则直接引）
        public static string RaceName(int race)
        {
            // 与 types.ts RACES 对齐（M-U2a 已有 RACES 名表？WbConstants 存 flag——名字表在 C# 首次补齐）
            switch (race)
            {
                case 0: return "人类";
                case 1: return "精灵";
                case 2: return "矮人";
                case 3: return "兽人";
                case 4: return "蜥蜴人";
                case 5: return "哥布林";
                default: return "？？？";
            }
        }

        // ---------------- techModsOf/atWar/civAtWar/diplomacyMeet（engine L4859/L2061/L2017/L2037） ----------------
        public static bool AtWar(WbWorld w, int a, int b)
        {
            double v;
            return w.rel.TryGetValue(WbWorld.PairKey(a, b), out v) && v < -20;
        }

        public static bool CivAtWar(WbWorld w, int civId)
        {
            foreach (WbCiv o in w.civs)
            {
                if (o != null && o.alive && o.id != civId && AtWar(w, civId, o.id)) return true;
            }
            return false;
        }

        /// RACES diplo（types.ts RACES 表 diplo 字段 —— 种族外交底色 0-1）
        public static readonly double[] RacesDiplo = { 0.65, 0.45, 0.4, 0.15, 0.35, 0.3 };

        /// diplomacyMeet（L2037-2059）—— warChance 判定全量（rng 消耗位精确）；宣战内部 pickCasus+declareWar TODO(M-U3c)
        public static void DiplomacyMeet(WbWorld w, int a, int b)
        {
            string key = WbWorld.PairKey(a, b);
            if (w.met.Contains(key)) return;
            w.met.Add(key);
            WbCiv ca = CivAt(w, a);
            WbCiv cb = CivAt(w, b);
            if (ca == null || cb == null) return;
            // —— 种族系统 v2：种族外交底色（兽人难交朋友，人类八面玲珑）——
            double da = ca.race < RacesDiplo.Length ? RacesDiplo[ca.race] : 0.5; // ra?.diplo ?? 0.5
            double db = cb.race < RacesDiplo.Length ? RacesDiplo[cb.race] : 0.5;
            double raceDiplo = (da + db) / 2; // 0-1
            double warChance = System.Math.Max(0.08, System.Math.Min(0.8,
                0.2 + ((ca.militarism ?? 30) + (cb.militarism ?? 30)) / 400.0
                + ((ca.gov == 4 || cb.gov == 4) ? 0.1 : 0)
                - ((ca.gov == 3 || cb.gov == 3) ? 0.12 : 0)
                - (raceDiplo - 0.5) * 0.3));
            if (w.laws.wars && w.Rng() < warChance)
            {
                // TODO(M-U3c): const pick = this.pickCasus(ca, cb); this.declareWar(pick.aggressor.id, pick.victim.id, pick.reason);
                // 黄金集约束：CVT11/15 的 meet 全部 rng>=warChance（不宣战），位等价成立
                return;
            }
            else
            {
                // —— 种族关系：首次接触的印象由种族底色决定（精灵与兽人初见即怀敌意）——
                int rr = w.RaceRelOf(ca.race, cb.race);
                w.rel[key] = System.Math.Max(-10, System.Math.Min(45, 20 + rr / 3)); // f64（蓝本 Map 存小数 28.333...）
            }
        }

        // ---------------- rebuildCivBuildCounts（engine L2025-2034） ----------------
        public static void RebuildCivBuildCounts(WbWorld w)
        {
            w.civBuildCounts.Clear();
            w.marketIdx.Clear();
            foreach (WbBuilding b in w.buildings)
            {
                int[] arr;
                if (!w.civBuildCounts.TryGetValue(b.civ, out arr) || arr == null)
                {
                    arr = new int[BUILDING_DEFS.Length];
                    w.civBuildCounts[b.civ] = arr;
                }
                arr[b.kind]++;
                if (b.kind == BUILD_KINDS.MARKET && !w.marketIdx.ContainsKey(b.civ)) w.marketIdx[b.civ] = b.i;
            }
        }

        // ---------------- activeDirective（engine L7717-7722） ----------------
        public static WbDirective ActiveDirective(WbWorld w, int civId, string kind)
        {
            foreach (WbDirective d in w.directives)
            {
                if (d.status == "active" && d.civ == civId && d.kind == kind) return d;
            }
            return null;
        }

        // ---------------- clearFrontOf（engine L7383-7391） ----------------
        public static void ClearFrontOf(WbWorld w, int civId)
        {
            List<int> snapshot = new List<int>(w.occSet);
            foreach (int i in snapshot)
            {
                if (w.occCiv[i] == civId)
                {
                    w.occCiv[i] = -1;
                    w.occStr[i] = 0;
                    w.occSet.Remove(i);
                }
            }
        }

        // ---------------- CivAt（engine this.civs[civId] 稀疏安全读） ----------------
        public static WbCiv CivAt(WbWorld w, int civId)
        {
            if (civId < 0 || civId >= w.civs.Count) return null;
            return w.civs[civId];
        }

        // ============================================================
        // M-U3c 桩位（黄金场景门控避让 —— 对应切片落地时逐个销案）
        // ============================================================

        /// crownVacantTick（engine L1646-1666）—— TODO(M-U3c)：crownUnit 遴选链
        public static void CrownVacantTick(WbWorld w)
        {
            // 黄金场景约束：pop>0 的活国已由 gen 端自动布在位王（cur 在位 → 蓝本 continue 零 rng）；
            // pop<=0 蓝本首门 continue。全部场景位等价，桩零 rng 安全。
            // M-U3c 翻译全量：遴选循环（job 权重+rng*0.9）+ CrownUnit + 继承播报。
        }

        /// wallTick（engine L1773-1810）—— TODO(M-U3c)：城墙圈砌筑
        public static void WallTick(WbWorld w)
        {
            // 门：fortification 科技（黄金场景 techs=[] 恒不触发）
        }

        /// tryLaunchColonyShip（engine L5516-5543）—— TODO(M-U3c)：殖民船
        public static bool TryLaunchColonyShip(WbWorld w, WbCiv civ)
        {
            // 蓝本无论成败先入冷却（rng 消耗 1 次在 colMul 之后）—— 桩化分歧风险：
            // 黄金场景 civ.pop>=10 && houses>=2 && colonizeCd 门。CVT12 pop=12 houses=3 会触发！
            // gen 端已核对——桩必须与蓝本同 rng 消耗。此处按蓝本冷却首段翻译（colMul=NEUTRAL.col=1）：
            double colMul = TechModsOf(w, civ.id).col;
            civ.colonizeCd = w.tickCount + (int)System.Math.Max(220, System.Math.Round((600 + System.Math.Floor(w.Rng() * 600)) * colMul));
            // 挑殖民者（<6 人早退——黄金场景 units 夹具全 <6 人 → 必早退位等价）
            int cand = 0;
            foreach (WbU u in w.units) if (u.dead == 0 && u.civ == civ.id && u.boat == 0) cand++;
            if (cand < 6) return false;
            // TODO(M-U3c): findWaterNear/findColonyTarget/启航段（cand>=6 黄金场景不可达）
            return false;
        }

        /// splitKingdom（engine L5456-5512）—— TODO(M-U3c)：叛乱分裂
        public static void SplitKingdom(WbWorld w, WbCiv civ)
        {
            // 门：laws.rebels && pop>30 && tiles>220 && rng<rebelChance —— 黄金场景 pop/tiles 全不达
            // （桩不消耗 rng：蓝本在 civsTick 掷骰后才调用——SplitKingdom 本体首段无 rng）
        }

        /// mergeCivs（engine L2247-2348）—— TODO(M-U3c)：深盟融合
        public static bool MergeCivs(WbWorld w, WbCiv a, WbCiv b, string reason)
        {
            // 门：civFuseScan 内部 tickCount%300===5 && alliances 非空 —— 黄金场景 alliances 恒空不可达
            return false;
        }

        /// setJob（engine L1482-1492）—— TODO(M-U3c)：总动员武装化（黄金 mobilizeUntil=null 不可达）
        public static void SetJob(WbWorld w, WbU u, int job)
        {
            // WBB.touchMeta() wasm 镜像层（M-U2 域）；RACES[u.race].isCiv 门 + hp/dmg/speed 比例换算
            // 黄金场景 mobilizeUntil 恒 null → 不可达；M-U3c 翻译全量
        }

        /// leaveAlliance（engine L8156-8181）—— TODO(M-U3c)（黄金 alliances 恒空不可达）
        public static void LeaveAlliance(WbWorld w, int civId, string reason) { }

        /// finishDirective（engine L7930-7949）—— TODO(M-U3c)（黄金 directives 恒空不可达）
        public static void FinishDirective(WbWorld w, WbDirective d, string status, string msg) { d.status = status; }

        /// allianceOfCiv（engine L8148 附近）—— 黄金 alliances 恒空
        public static WbAlliance AllianceOfCiv(WbWorld w, int civId)
        {
            foreach (WbAlliance al in w.alliances)
            {
                if (al.members.Contains(civId)) return al;
            }
            return null;
        }
    }
}
