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
            if (w.worldWar.phase == "running" && w.worldWar.belligerents.Contains(civ.id) && !w.worldWar.fallen.Exists((f) => f.id == civ.id))
            {
                w.worldWar.fallen.Add(new WbWwFallen { id = civ.id, name = civ.name, colorHex = civ.colorHex });
                int remain = w.worldWar.belligerents.Count - w.worldWar.fallen.Count;
                w.AddEvent("worldwar", $"「{civ.name}」退出终极世界大战——还剩 {remain} 面旗帜在战场上飘扬", civ.colorHex);
            }
            // —— 军团随之覆灭（静默解散）——
            foreach (WbArmy a2 in w.armies.ToArray()) if (a2.civ == civ.id) DisbandArmy(w, a2, true);
            // —— 战争档案清理 ——
            List<string> warKeys = new List<string>(w.warData.Keys);
            foreach (string key in warKeys)
            {
                int dash = key.IndexOf('-');
                int x = int.Parse(key.Substring(0, dash));
                int y = int.Parse(key.Substring(dash + 1));
                if (x == civ.id || y == civ.id) w.warData.Remove(key);
            }
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

        /// RACES[race].name —— types.ts RACES 全表 41 族机械翻译（历史注：M-U3b 版误将 4/5 映射
        /// 蜥蜴人/哥布林，R 枚举实为 4=bandit/5=zombie——黄金未触发，M-U3c 全表修正）
        public static string RaceName(int race)
        {
            switch (race)
            {
                case 0: return "人类";
                case 1: return "精灵";
                case 2: return "矮人";
                case 3: return "兽人";
                case 4: return "强盗";
                case 5: return "僵尸";
                case 6: return "绵羊";
                case 7: return "狼";
                case 8: return "熊";
                case 9: return "巨龙";
                case 10: return "鹿";
                case 11: return "企鹅";
                case 12: return "骆驼";
                case 13: return "蝎子";
                case 14: return "蛇";
                case 15: return "雪狼";
                case 16: return "骷髅";
                case 17: return "恶魔";
                case 18: return "法师";
                case 19: return "蜥蜴人";
                case 20: return "哥布林";
                case 21: return "巨魔";
                case 22: return "食人魔";
                case 23: return "白行者";
                case 24: return "吸血鬼";
                case 25: return "克拉肯";
                case 26: return "沙虫";
                case 27: return "蛇怪";
                case 28: return "天使";
                case 29: return "凤凰";
                case 30: return "树人";
                case 31: return "巫妖";
                case 32: return "九头蛇";
                case 33: return "鸡";
                case 34: return "猪";
                case 35: return "兔";
                case 36: return "狐";
                case 37: return "鱼";
                case 38: return "蟹";
                case 39: return "龟";
                case 40: return "鲨鱼";
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

        /// diplomacyMeet（L2037-2059）—— warChance 判定 + pickCasus+declareWar 宣战支路全量（M-U3c 销案）
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
                (string reason, WbCiv aggressor, WbCiv victim) pick = PickCasus(w, ca, cb);
                DeclareWar(w, pick.aggressor.id, pick.victim.id, pick.reason);
                return;
            }
            else
            {
                // —— 种族关系：首次接触的印象由种族底色决定（精灵与兽人初见即怀敌意）——
                double rr = w.RaceRelOf(ca.race, cb.race); // f64（raceRel Map 可存小数 → 20+rr/3 小数语义）
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
        // M-U3c 全量（本切片销案）：setJob L1482 / crownUnit L1630 / crownVacantTick L1646 /
        //   wallTick L1773 / wallDefenseOf L1812 / uniqueName L1522 / createCiv L1551 /
        //   splitKingdom L5456 / tryLaunchColonyShip L5516 / findWaterNear L5546 /
        //   findColonyTarget L5573 / mergeCivs L2247 / recordEvo L8753 / leaveAlliance L8156 /
        //   dissolveAlliance L8183 / finishDirective L7930 / declareWar L6942 / pickCasus L7046 /
        //   ensureWarData L7209 / casusText L6928 / shiftRaceRel L8061 / disbandArmy L6876
        // ============================================================

        // ---------------- 职业乘数表（types.ts JOBS L296-305 —— setJob 相对换算） ----------------
        public struct WbJobMul { public double hp, dmg, speed; }
        public static readonly WbJobMul[] JobsMul = new WbJobMul[]
        {
            new WbJobMul { hp = 1, dmg = 1, speed = 1 },          // peasant
            new WbJobMul { hp = 0.95, dmg = 0.9, speed = 1 },     // farmer
            new WbJobMul { hp = 1.3, dmg = 1.35, speed = 1.05 },  // warrior
            new WbJobMul { hp = 1.05, dmg = 1.15, speed = 1 },    // archer
            new WbJobMul { hp = 1.15, dmg = 0.95, speed = 1.05 }, // builder
            new WbJobMul { hp = 1, dmg = 0.9, speed = 1.2 },      // merchant
            new WbJobMul { hp = 1.25, dmg = 1.1, speed = 1 },     // noble
            new WbJobMul { hp = 1.5, dmg = 1.5, speed = 1 },      // king（weight 0 = 永不自然出生）
        };
        public const int JOB_KING = 7; // JOB_KEY.king（JOBS 数组序）

        /// RACES isCiv（types.ts L157+ 全表 0-40：civ 族 0/1/2/3/19/20，其余野生动物/怪物）
        public static readonly bool[] RacesIsCiv = {
            true, true, true, true,      // human/elf/dwarf/orc
            false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, // bandit..mage(4-18)
            true, true,                  // lizard(19)/goblin(20)
            false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, // troll..shark(21-40)
        };
        private static bool IsCivRace(int r) => r >= 0 && r < RacesIsCiv.Length && RacesIsCiv[r];

        /// RACES greed（civ 族贪性 L157+；其余种族无 greed 字段 → ?? 0.5）
        public static double RaceGreed(int r)
        {
            switch (r)
            {
                case 0: return 0.45; case 1: return 0.25; case 2: return 0.7;
                case 3: return 0.65; case 19: return 0.4; case 20: return 0.8;
                default: return 0.5;
            }
        }

        /// CIV_COLORS（constants.ts L100-107 —— 建国色板 12 色）
        public static readonly int[][] CivColors = {
            new[] { 219, 62, 47 }, new[] { 255, 176, 32 }, new[] { 64, 182, 133 }, new[] { 214, 84, 200 },
            new[] { 240, 238, 232 }, new[] { 255, 106, 76 }, new[] { 146, 200, 62 }, new[] { 230, 140, 200 },
            new[] { 120, 200, 200 }, new[] { 240, 170, 60 }, new[] { 200, 220, 120 }, new[] { 250, 100, 150 },
        };

        /// CASUS_LEVEL（engine L6902-6912）—— 理由烈度 → 宣战时关系跌幅
        public static readonly Dictionary<string, int> CasusLevel = new Dictionary<string, int>
        {
            ["border"] = -45, ["conquest"] = -70, ["plunder"] = -55, ["revenge"] = -65,
            ["rebel"] = -80, ["annex"] = -90, ["unify"] = -85, ["holy"] = -90, ["alliance"] = -50,
        };

        /// CASUS_META label（types.ts L688-698）—— 宣战 toast 用
        public static string CasusLabel(string reason)
        {
            switch (reason)
            {
                case "border": return "边境战争";
                case "conquest": return "征服战争";
                case "plunder": return "劫掠战争";
                case "revenge": return "复仇战争";
                case "rebel": return "叛乱战争";
                case "annex": return "灭国战争";
                case "unify": return "统一战争";
                case "holy": return "圣战";
                case "alliance": return "盟约战争";
                default: return reason;
            }
        }

        /// DIRECTIVE_META label（engine L7725-7738）—— finishDirective toast 用
        public static readonly Dictionary<string, string> DirectiveLabel = new Dictionary<string, string>
        {
            ["annihilate"] = "灭国令", ["conquer"] = "攻城令", ["expand"] = "扩张令", ["wealth"] = "富国令",
            ["wisdom"] = "启智令", ["populate"] = "人口令", ["legion"] = "军团令", ["build"] = "建城令",
            ["unify"] = "统一令", ["mobilize"] = "总动员令", ["alliance"] = "联盟令", ["temple"] = "信仰令",
        };

        /// ARMY_CD（engine L6049）
        public const int ARMY_CD = 900;

        // ---------------- setJob（engine L1482-1492） ----------------
        public static void SetJob(WbWorld w, WbU u, int job)
        {
            // WBB.touchMeta() —— job 列 wasm 镜像写点（civ 层 no-op）
            if (!IsCivRace(u.race) || job < 0 || job >= JobsMul.Length) return;
            WbJobMul oldJ = JobsMul[u.job];
            WbJobMul nw = JobsMul[job];
            u.hp = System.Math.Max(1.0, WbMath.JsRound(u.hp * nw.hp / oldJ.hp));           // 保留当前生命百分比语义：按倍率同扩 maxHp 与 hp
            u.maxHp = System.Math.Max(1.0, WbMath.JsRound(u.maxHp * nw.hp / oldJ.hp));
            u.dmg = u.dmg * nw.dmg / oldJ.dmg;
            u.speed = u.speed * nw.speed / oldJ.speed;
            u.job = job;
        }

        // ---------------- uniqueName（engine L1522-1533） ----------------
        public static string UniqueName(WbWorld w, int race)
        {
            string baseName = WbNames.UnitName(race, w);
            // Task 42-a：startsWidth(base+' ') 每单位拼临时串 → 长度+首字符判定免拼接
            int bl = baseName.Length;
            int n = 0;
            foreach (WbU u in w.units)
            {
                if (u.dead != 0) continue;
                string nm = u.name;
                if (nm == baseName || (nm.Length > bl && nm[bl] == ' ' && nm.StartsWith(baseName))) n++;
            }
            return n == 0 ? baseName : $"{baseName} {WbNames.Roman(n + 1)}";
        }

        private static bool CivNameClash(WbWorld w, string name)
        {
            foreach (WbCiv c in w.civs) if (c != null && c.alive && c.name == name) return true;
            return false;
        }

        // ---------------- createCiv（engine L1551-1628） ----------------
        public static int CreateCiv(WbWorld w, int race, double x, double y)
        {
            // 王国名去重：最多重掷 8 次，仍冲突则附罗马数字后缀
            var nb = WbNames.CivName(w);
            string name = nb.name, banner = nb.banner;
            for (int t = 0; t < 8 && CivNameClash(w, name); t++)
            {
                nb = WbNames.CivName(w); name = nb.name; banner = nb.banner;
            }
            if (CivNameClash(w, name))
            {
                int n = 1;
                while (CivNameClash(w, $"{name} {WbNames.Roman(n + 1)}")) n++;
                name = $"{name} {WbNames.Roman(n + 1)}";
            }
            int[] color = CivColors[w.civSeq % CivColors.Length];
            string colorHex = $"#{color[0]:x2}{color[1]:x2}{color[2]:x2}";
            WbCiv civ = new WbCiv
            {
                id = w.civSeq++,
                name = name,
                race = race,
                color = color,
                colorHex = colorHex,
                pop = 0,
                houses = 0,
                capital = -1,
                kingName = UniqueName(w, race),
                alive = true,
                banner = banner,
                colonizeCd = 0,
                gold = 0,
                knowledge = 0,
                techs = new List<string>(),
                research = null,
                researchP = 0,
                gov = 0,
                govYear = (int)System.Math.Floor(w.yearF),
                stability = 70,
                culture = 0,
                militarism = 30,
                income = 0,
                expense = 0,
                festivalCd = 0,
                history = new List<string>(),
            };
            w.civs.Add(civ);
            if (civ.id >= w.civs.Count) { while (w.civs.Count <= civ.id) w.civs.Add(null); }
            if (w.civs[civ.id] == null || civ.id == w.civs.Count - 1) w.civs[civ.id] = civ;
            // 注：JS push+index-set 在稀疏 id 下产生同对象双槽别名（for-of 双访）——C# List 无法别名；
            // 黄金集（CVT21 dense id=1）不受影响，稀疏建国语义属 M-U6 存档兼容域复核。

            // find capital spot（半径扩到 5：建国点贴海/贴山也能找到可建地块）
            int cap = -1;
            for (int r = 0; r <= 5 && cap < 0; r++)
            {
                for (int dy = -r; dy <= r && cap < 0; dy++)
                {
                    for (int dx = -r; dx <= r && cap < 0; dx++)
                    {
                        if (System.Math.Max(System.Math.Abs(dx), System.Math.Abs(dy)) != r) continue; // 只扫当前环
                        int xx = (int)System.Math.Floor(x) + dx;
                        int yy = (int)System.Math.Floor(y) + dy;
                        if (xx < 1 || yy < 1 || xx >= WbWorld.W - 1 || yy >= WbWorld.H - 1) continue;
                        int i = WbWorld.Idx(xx, yy);
                        if (WbWorld.Buildable(w.terrain[i]) && w.building[i] == 0) cap = i;
                    }
                }
            }
            if (cap >= 0)
            {
                BuildBuilding(w, cap, 2, civ.id);
                civ.capital = cap;
            }
            // seed territory — 以首都为圆心（比点击点更可靠）；找不到首都再退回原点
            int anchor = cap >= 0 ? cap : WbWorld.Idx((int)System.Math.Floor(x), (int)System.Math.Floor(y));
            int cx = anchor % WbWorld.W;
            int cy = anchor / WbWorld.W; // (anchor / W) | 0（anchor >= 0 等价）
            SeedTerritory(w, civ, cx, cy);
            w.Toast($"{RaceName(race)}王国「{name}」建立了", "good");
            w.AddEvent("found", $"{RaceName(race)}王国「{name}」建立了，国王 {civ.kingName} 加冕", civ.colorHex,
                cap >= 0 ? (double?)WbWorld.TileX(cap) : x, cap >= 0 ? (double?)WbWorld.TileY(cap) : y);
            return civ.id;
        }

        // ---------------- crownUnit（engine L1630-1644） ----------------
        public static void CrownUnit(WbWorld w, WbCiv civ, WbU u, bool announce)
        {
            if (!civ.alive || u.dead != 0 || u.civ != civ.id || !IsCivRace(u.race)) return;
            if (u.king != 0 && civ.kingId == u.id) return; // 已在位
            u.king = 1;
            // WBB.touchMeta() —— job/king 列 wasm 镜像写点（civ 层 no-op）
            SetJob(w, u, JOB_KING);
            civ.kingId = u.id;
            civ.kingName = u.name;
            if (announce)
            {
                w.AddEvent("king", $"{u.name} 在「{civ.name}」的臣民拥戴下加冕为王", civ.colorHex, u.x, u.y);
                w.Toast($"「{civ.name}」新王 {u.name} 加冕", "good");
            }
        }

        // ---------------- crownVacantTick（engine L1646-1666） ----------------
        public static void CrownVacantTick(WbWorld w)
        {
            foreach (WbCiv civ in w.civs)
            {
                if (civ == null || !civ.alive || civ.pop <= 0) continue;
                int? kid = civ.kingId;
                if (kid != null && kid != -1)
                {
                    WbU cur;
                    if (w.unitById.TryGetValue(kid.Value, out cur) && cur != null && cur.dead == 0 && cur.king != 0 && cur.civ == civ.id) continue; // 在位
                }
                bool succession = kid == -1; // 先王驾崩过 → 这次是继承（播报）；undefined = 旧档/新国首冕（静默）
                // 继承人遴选：贵族 > 战士/弓手 > 其他；附带少量随机（权柄与时运）
                WbU best = null;
                double bestScore = -1;
                foreach (WbU u in w.units)
                {
                    if (u.dead != 0 || u.civ != civ.id || u.boat != 0) continue;
                    int job = u.job;
                    double score = (job == 6 ? 3 : (job == 2 || job == 3) ? 2 : job == 5 ? 1.5 : 1) + w.Rng() * 0.9;
                    if (score > bestScore) { bestScore = score; best = u; }
                }
                if (best != null) CrownUnit(w, civ, best, succession);
            }
        }

        // ---------------- wallTick（engine L1773-1810） ----------------
        public static void WallTick(WbWorld w)
        {
            int cost = DefCost(BUILD_KINDS.WALL); // BUILDING_DEFS[WALL]?.cost ?? 2（表值 2）
            foreach (WbCiv civ in w.civs)
            {
                if (civ == null || !civ.alive || civ.pop < 8 || civ.capital < 0) continue;
                if (!civ.techs.Contains("fortification")) continue;
                if ((civ.gold ?? 0) < cost) continue;
                int cx = WbWorld.TileX(civ.capital);
                int cy = WbWorld.TileY(civ.capital);
                int radius = (int)System.Math.Min(5, 3 + System.Math.Floor(civ.houses / 14.0)); // 半径 3-5 随城市规模
                List<int> gaps = new List<int>();
                for (int k = 0; k < 72; k++)
                {
                    double ang = (k / 72.0) * System.Math.PI * 2;
                    int xx = (int)WbMath.JsRound(cx + WbMath.FdCos(ang) * radius);
                    int yy = (int)WbMath.JsRound(cy + WbMath.FdSin(ang) * radius);
                    if (xx < 1 || yy < 1 || xx >= WbWorld.W - 1 || yy >= WbWorld.H - 1) continue;
                    int i = WbWorld.Idx(xx, yy);
                    if (w.building[i] > 0) continue;          // 已有墙/建筑占位
                    if (w.owner[i] != civ.id) continue;       // 只在己方领土砌
                    int tt = w.terrain[i];
                    if (!WbWorld.Buildable(tt) || tt == WbWorld.T_FOREST) continue; // 城墙立于实土
                    gaps.Add(i);
                }
                // 圈完整（缺口 ≤3：海岸与山体豁口留作城门）则不再砌
                if (gaps.Count == 0 || gaps.Count <= 3) continue;
                int built = 0;
                foreach (int i in gaps)
                {
                    if (built >= 3) break;
                    if ((civ.gold ?? 0) < cost) break;
                    BuildBuilding(w, i, BUILD_KINDS.WALL, civ.id);
                    civ.gold = (civ.gold ?? 0) - cost;
                    built++;
                }
                if (built > 0)
                {
                    // fxPrefs.ambience 默认 true（engine L271）
                    int bi;
                    if (w.bIdx.TryGetValue(gaps[0], out bi) && bi >= 0 && bi < w.buildings.Count)
                    {
                        WbBuilding b0 = w.buildings[bi];
                        if (b0 != null) w.Fx("hammer", b0.x + 0.5, b0.y + 0.5, 14);
                    }
                }
            }
        }

        /// wallDefenseOf（engine L1812-1830）—— 守军城墙防御加成（M-U2c 战斗域消费端）
        public static double WallDefenseOf(WbWorld w, WbU u)
        {
            if (u.civ < 0) return 1;
            int x = (int)System.Math.Floor(u.x);
            int y = (int)System.Math.Floor(u.y);
            for (int dy = -1; dy <= 1; dy++)
            {
                for (int dx = -1; dx <= 1; dx++)
                {
                    int xx = x + dx, yy = y + dy;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                    int i = WbWorld.Idx(xx, yy);
                    if (w.building[i] != BUILD_KINDS.WALL) continue;
                    int bi;
                    if (w.bIdx.TryGetValue(i, out bi))
                    {
                        WbBuilding b = w.buildings[bi];
                        if (b != null && b.civ == u.civ) return 0.72; // 借墙而战：伤害减免 28%
                    }
                }
            }
            return 1;
        }

        // ---------------- findWaterNear（engine L5546-5571） ----------------
        public static (double x, double y)? FindWaterNear(WbWorld w, double x, double y, int r)
        {
            int cx = (int)System.Math.Floor(x);
            int cy = (int)System.Math.Floor(y);
            for (int ring = 1; ring <= r; ring++)
            {
                for (int dy = -ring; dy <= ring; dy++)
                {
                    for (int dx = -ring; dx <= ring; dx++)
                    {
                        if (System.Math.Max(System.Math.Abs(dx), System.Math.Abs(dy)) != ring) continue; // 只看当前环
                        int xx = cx + dx;
                        int yy = cy + dy;
                        if (xx < 1 || yy < 1 || xx >= WbWorld.W - 1 || yy >= WbWorld.H - 1) continue;
                        int i = WbWorld.Idx(xx, yy);
                        if (!WbWorld.IsWater(w.terrain[i])) continue;
                        int waterN = 0;
                        for (int ny = -1; ny <= 1; ny++)
                        {
                            for (int nx = -1; nx <= 1; nx++)
                            {
                                if (nx == 0 && ny == 0) continue;
                                if (WbWorld.IsWater(w.terrain[WbWorld.Idx(xx + nx, yy + ny)])) waterN++;
                            }
                        }
                        if (waterN >= 5) return (xx + 0.5, yy + 0.5);
                    }
                }
            }
            return null;
        }

        // ---------------- findColonyTarget（engine L5573-5590） ----------------
        public static (double x, double y)? FindColonyTarget(WbWorld w, double x, double y)
        {
            for (int k = 0; k < 40; k++)
            {
                double ang = w.Rng() * System.Math.PI * 2;
                double dist = 25 + w.Rng() * 60;
                int xx = (int)System.Math.Floor(x + WbMath.FdCos(ang) * dist);
                int yy = (int)System.Math.Floor(y + WbMath.FdSin(ang) * dist);
                if (xx < 2 || yy < 2 || xx >= WbWorld.W - 2 || yy >= WbWorld.H - 2) continue;
                int i = WbWorld.Idx(xx, yy);
                if (w.owner[i] == -1 && w.building[i] == 0 && WbWorld.Buildable(w.terrain[i]))
                {
                    return (xx + 0.5, yy + 0.5);
                }
            }
            return null;
        }

        // ---------------- tryLaunchColonyShip（engine L5516-5543） ----------------
        public static bool TryLaunchColonyShip(WbWorld w, WbCiv civ)
        {
            // WBB.touchMeta() —— boat 列 wasm 镜像写点（civ 层 no-op）
            // 无论成败先进入冷却，避免每 5 tick 重扫（600-1200 tick ≈ 15-30 年；航海科技缩短间隔）
            double colMul = TechModsOf(w, civ.id).col;
            civ.colonizeCd = w.tickCount + (int)System.Math.Max(220.0, WbMath.JsRound((600 + System.Math.Floor(w.Rng() * 600)) * colMul));
            // 挑一名国民充当殖民者（不要抽干小国人口）
            List<WbU> cand = new List<WbU>();
            foreach (WbU u in w.units) if (u.dead == 0 && u.civ == civ.id && u.boat == 0) cand.Add(u);
            if (cand.Count < 6) return false;
            WbU sel = cand[(int)System.Math.Floor(w.Rng() * cand.Count)];
            // 找最近的海面（半径 8 内且有足够水域，避免在小池塘启航）
            var water = FindWaterNear(w, sel.x, sel.y, 8);
            if (water == null) return false;
            // 找一块远方的无主可居住土地作为殖民目标
            var target = FindColonyTarget(w, sel.x, sel.y);
            if (target == null) return false;
            // 启航
            sel.boat = 1;
            sel.boatTTL = 1200; // 航海寿命（约 30 年）
            sel.x = water.Value.x;
            sel.y = water.Value.y;
            sel.tx = target.Value.x;
            sel.ty = target.Value.y;
            sel.hp = System.Math.Min(sel.maxHp, sel.hp + 20); // 朝圣者获得体力補充以支撑远航
            w.Fx("spawn", water.Value.x, water.Value.y, 30);
            w.AddEvent("colonize", $"「{civ.name}」的殖民船扬帆启航，驶向未知的大海", civ.colorHex, water.Value.x, water.Value.y);
            w.Toast($"「{civ.name}」的殖民船启航了", "info");
            return true;
        }

        // ---------------- splitKingdom（engine L5456-5512） ----------------
        public static void SplitKingdom(WbWorld w, WbCiv civ)
        {
            if (civ.capital < 0 || civ.tiles.Count == 0) return;
            int capX = WbWorld.TileX(civ.capital);
            int capY = WbWorld.TileY(civ.capital);
            // 找距首都最远的本国建筑作为叛乱策源地（至少 14 格）
            WbBuilding anchor = null;
            double bestD = 14;
            foreach (WbBuilding b in w.buildings)
            {
                if (b.civ != civ.id) continue;
                double d = WbMath.FdHypot(b.x - capX, b.y - capY);
                if (d > bestD) { bestD = d; anchor = b; }
            }
            if (anchor == null) return;
            // 建立叛军王国（同种族新王国，createCiv 自带建国播报）
            int newId = CreateCiv(w, civ.race, anchor.x + 0.5, anchor.y + 0.5);
            WbCiv rebel = CivAt(w, newId);
            if (rebel == null) return;
            // 转移策源地周边领土（半径 9 内的母国领土易帜）
            List<int> keep = new List<int>();
            foreach (int i in civ.tiles)
            {
                if (w.owner[i] != civ.id) continue; // 陈旧记录
                int x = WbWorld.TileX(i);
                int y = WbWorld.TileY(i);
                if (WbMath.FdHypot(x - anchor.x, y - anchor.y) <= 9)
                {
                    w.owner[i] = (short)rebel.id;
                    rebel.tiles.Add(i);
                    w.MarkDirty(i);
                }
                else keep.Add(i);
            }
            civ.tiles = keep;
            // 转移策源地建筑（含房屋账目）
            int bi;
            if (w.bIdx.TryGetValue(anchor.i, out bi))
            {
                WbBuilding b2 = w.buildings[bi];
                if (b2.civ == civ.id)
                {
                    b2.civ = rebel.id;
                    civ.houses--;
                    rebel.houses++;
                }
            }
            // 转移领土上的国民（人口账目同步）
            int moved = 0;
            foreach (WbU u in w.units)
            {
                if (u.dead != 0 || u.civ != civ.id || u.boat != 0) continue;
                if (WbMath.FdHypot(u.x - anchor.x, u.y - anchor.y) <= 9)
                {
                    u.civ = rebel.id;
                    moved++;
                }
            }
            civ.pop -= moved;
            rebel.pop += moved;
            // 叛乱即战争（宗主讨伐叛军——不死不休的叛乱战争，目的=叛军覆灭）
            DeclareWar(w, civ.id, rebel.id, "rebel", force: true);
            if (w.overlayMode == "political" || w.overlayMode == "alliance") w.overlayDirty = true;
        }

        // ---------------- mergeCivs（engine L2247-2348） ----------------
        public static bool MergeCivs(WbWorld w, WbCiv a, WbCiv b, string cause)
        {
            if (!a.alive || !b.alive || a.id == b.id) return false;
            double powerA = a.pop * 2 + (a.gold ?? 0) * 0.6 + w.armies.FindAll((x) => x.civ == a.id).Count * 30 + a.tiles.Count;
            double powerB = b.pop * 2 + (b.gold ?? 0) * 0.6 + w.armies.FindAll((x) => x.civ == b.id).Count * 30 + b.tiles.Count;
            WbCiv keep = powerA >= powerB ? a : b;
            WbCiv gone = keep == a ? b : a;
            // —— 和平转移（顺序重要：先转资产，再清战争/外交，最后关账）——
            List<int> newTiles = new List<int>();
            foreach (int i in gone.tiles)
            {
                if (w.owner[i] == gone.id)
                {
                    w.owner[i] = (short)keep.id;
                    newTiles.Add(i);
                    w.MarkDirty(i);
                }
            }
            keep.tiles.AddRange(newTiles);
            gone.tiles.Clear();
            gone.frontier.Clear();
            foreach (WbBuilding bd in w.buildings)
            {
                if (bd.civ == gone.id)
                {
                    bd.civ = keep.id;
                    if (bd.kind == 1) keep.houses++; // 住宅计数随资产转移
                }
            }
            foreach (WbU u in w.units)
            {
                if (u.dead == 0 && u.civ == gone.id) u.civ = keep.id;
            }
            // WBB.touchMeta() —— civ 列 wasm 镜像写点（王国融合的全民改籍；civ 层 no-op）
            int keepArmies = w.armies.FindAll((x) => x.civ == keep.id).Count;
            int mergedArmies = 0;
            foreach (WbArmy ar in w.armies.ToArray())
            {
                if (ar.civ != gone.id) continue;
                if (keepArmies + mergedArmies < 4)
                {
                    ar.civ = keep.id; // 军团整编：联合王朝旗号
                    mergedArmies++;
                }
                else DisbandArmy(w, ar, true); // 超编则荣散（士兵归田）
            }
            // 国库/知识/科技合并（科技并集 —— 融合的红利）
            keep.gold = (keep.gold ?? 0) + (gone.gold ?? 0);
            keep.knowledge = (keep.knowledge ?? 0) + (gone.knowledge ?? 0);
            List<string> techs = new List<string>(keep.techs);
            foreach (string t in gone.techs) if (!techs.Contains(t)) techs.Add(t);
            keep.techs = techs;
            keep.pop = keep.pop + gone.pop;
            // —— 战争清理：融合国的战争档案全数和平落幕（联合王朝不继承旧仇）——
            List<string> warKeys = new List<string>(w.warData.Keys);
            foreach (string key in warKeys)
            {
                int dash = key.IndexOf('-');
                int x = int.Parse(key.Substring(0, dash));
                int y = int.Parse(key.Substring(dash + 1));
                if (x == gone.id || y == gone.id) w.warData.Remove(key);
            }
            List<string> relKeys = new List<string>(w.rel.Keys);
            foreach (string key in relKeys)
            {
                int dash = key.IndexOf('-');
                int x = int.Parse(key.Substring(0, dash));
                int y = int.Parse(key.Substring(dash + 1));
                if (x != gone.id && y != gone.id) continue;
                int other = x == gone.id ? y : x;
                if (other == keep.id) { w.rel.Remove(key); w.totalWars.Remove(key); continue; }
                // 对第三方关系由联合王朝继承（无则采纳 / 有则取优）
                string nk = WbWorld.PairKey(keep.id, other);
                if (!w.rel.ContainsKey(nk)) w.rel[nk] = w.rel.ContainsKey(key) ? w.rel[key] : 0;
                w.rel.Remove(key);
            }
            List<string> metKeys = new List<string>(w.met);
            foreach (string key in metKeys)
            {
                int dash = key.IndexOf('-');
                int x = int.Parse(key.Substring(0, dash));
                int y = int.Parse(key.Substring(dash + 1));
                if (x == gone.id || y == gone.id)
                {
                    int other = x == gone.id ? y : x;
                    if (other != keep.id) w.met.Add(WbWorld.PairKey(keep.id, other));
                    w.met.Remove(key);
                }
            }
            // 旨意结算：融合方的宏图失败（由联合王朝继承精神）；针对融合方的灭国令成功
            foreach (WbDirective d in w.directives)
            {
                if (d.status != "active") continue;
                if (d.civ == gone.id) FinishDirective(w, d, "failed", $"「{gone.name}」并入「{keep.name}」，宏图由联合王朝继承");
                else if ((d.kind == "annihilate" || d.kind == "conquer") && d.target == gone.id) FinishDirective(w, d, "success", $"目标「{gone.name}」已成为联合王朝的一部分");
            }
            // 联盟除名（keep 留任）
            LeaveAlliance(w, gone.id, "fallen");
            // 世界大战参战资格：融合方席位由联合王朝继承
            if (w.worldWar.phase == "running" && w.worldWar.belligerents.Contains(gone.id))
            {
                int bi2 = w.worldWar.belligerents.IndexOf(gone.id);
                if (!w.worldWar.belligerents.Contains(keep.id)) w.worldWar.belligerents[bi2] = keep.id;
                else w.worldWar.belligerents.RemoveAt(bi2);
            }
            ClearFrontOf(w, gone.id); // 融合方战线蒸发（领土已易主，keep 的前线 tick 自会重建）
            // —— 关账：alive=false + mergedInto 标记（区别于灭亡：不增加 fallen 计数）——
            gone.alive = false;
            gone.mergedInto = keep.id;
            // —— 联合国名（双名和 ≤8 字用全名；否则各取前 3 字；总长 ≤14）——
            string stem = keep.name.Length + gone.name.Length <= 8 ? $"{keep.name}·{gone.name}" : $"{keep.name.Substring(0, 3)}·{gone.name.Substring(0, 3)}";
            string newName = stem + "联合王朝";
            if (newName.Length > 14) newName = newName.Substring(0, 14);
            string oldKeepName = keep.name;
            keep.name = newName;
            // —— 图谱 + 纪事 ——
            RecordEvo(w, "society", newName, null, keep.colorHex,
                $"王国融合{(cause == "oracle" ? "（神谕钦定）" : "（深盟自然融合）")}——「{oldKeepName}」与「{gone.name}」和平合并：领土 {newTiles.Count} 格 / 人口 {gone.pop} / 军团 {mergedArmies} 全量继承",
                $"人口 {keep.pop}·领土 {keep.tiles.Count}",
                new Dictionary<string, object> { ["civ"] = keep.id, ["mergedFrom"] = gone.id, ["tiles"] = newTiles.Count, ["pop"] = gone.pop });
            w.AddEvent("alliance", $"王座合璧——「{oldKeepName}」与「{gone.name}」{(cause == "oracle" ? "奉神谕" : "历经数十年深盟")}和平合并为「{newName}」（领土 {newTiles.Count} 格、军团 {mergedArmies} 支、科技并集全数继承，列国为之侧目）", keep.colorHex);
            w.Toast($"「{oldKeepName}」与「{gone.name}」合并为「{newName}」", "good");
            if (w.overlayMode == "political" || w.overlayMode == "alliance") w.overlayDirty = true;
            return true;
        }

        // ---------------- recordEvo（engine L8753-8766） ----------------
        public static int RecordEvo(WbWorld w, string kind, string name, string parentKey, string colorHex,
            string detail, string stat = null, Dictionary<string, object> meta = null)
        {
            int id = w.evoSeq++;
            int? parent = null;
            if (parentKey != null) { int p; if (w.evoIndex.TryGetValue(parentKey, out p)) parent = p; }
            w.evoNodes.Add(new WbEvoNode
            {
                id = id, kind = kind, name = name, parent = parent,
                year = (int)System.Math.Floor(w.yearF), colorHex = colorHex,
                detail = detail, stat = stat, alive = true, meta = meta,
            });
            // 图谱上限（保留最新 720 节点；prune 只影响远古细节，谱系边由 evoIndex 保真）
            if (w.evoNodes.Count > 720)
            {
                int dropN = w.evoNodes.Count - 720;
                HashSet<int> dropped = new HashSet<int>();
                for (int i = 0; i < dropN; i++) dropped.Add(w.evoNodes[i].id);
                w.evoNodes.RemoveRange(0, dropN);
                foreach (WbEvoNode n in w.evoNodes) if (n.parent != null && dropped.Contains(n.parent.Value)) n.parent = null;
            }
            return id;
        }

        // ---------------- leaveAlliance（engine L8156-8181） ----------------
        public static void LeaveAlliance(WbWorld w, int civId, string cause)
        {
            WbAlliance al = AllianceOfCiv(w, civId);
            if (al == null) return;
            al.members.RemoveAll((m) => m == civId);
            w.allianceOf.Remove(civId);
            WbCiv c = CivAt(w, civId);
            if (cause == "betray")
            {
                al.cohesion = (int)System.Math.Max(0, al.cohesion - 22);
                foreach (int m in al.members.ToArray())
                {
                    WbCiv mc = CivAt(w, m);
                    if (mc == null || !mc.alive) continue;
                    string k = WbWorld.PairKey(m, civId);
                    double rv;
                    w.rel[k] = System.Math.Min(-30, w.rel.TryGetValue(k, out rv) ? rv : 0);
                }
                if (c != null && c.alive)
                {
                    w.AddEvent("alliance", $"「{c.name}」对盟友刀兵相向，被逐出「{al.name}」——盟约的背叛者将无人再信", "#f87171");
                    w.Toast($"「{c.name}」叛盟", "danger");
                }
            }
            else if (cause == "quit" && c != null && c.alive)
            {
                al.cohesion = (int)System.Math.Max(0, al.cohesion - 8);
                w.AddEvent("alliance", $"「{c.name}」宣布退出「{al.name}」，独自面对乱世", al.colorHex);
            }
            if (al.members.Count < 2)
            {
                DissolveAlliance(w, al, $"「{al.name}」成员星散，盟约黯然作废");
            }
        }

        /// dissolveAlliance（engine L8183-8190）
        public static void DissolveAlliance(WbWorld w, WbAlliance al, string text)
        {
            foreach (int m in al.members) w.allianceOf.Remove(m);
            w.allianceWarCd.Remove(al.id);
            w.alliances.RemoveAll((x) => x.id == al.id);
            w.AddEvent("alliance", text, al.colorHex);
            if (w.overlayMode == "alliance") w.overlayDirty = true;
        }

        /// allianceOfCiv（engine L8069-8074）—— allianceOf Map 读端（蓝本 Map 语义同构）
        public static WbAlliance AllianceOfCiv(WbWorld w, int civId)
        {
            int id;
            if (!w.allianceOf.TryGetValue(civId, out id)) return null;
            foreach (WbAlliance al in w.alliances) if (al != null && al.id == id) return al;
            return null;
        }

        // ---------------- finishDirective（engine L7930-7949） ----------------
        public static void FinishDirective(WbWorld w, WbDirective d, string status, string msg)
        {
            if (d.status != "active") return;
            d.status = status;
            d.endTick = w.tickCount;
            d.endText = msg;
            WbCiv civ = CivAt(w, d.civ);
            if (civ != null && civ.alive)
            {
                if (status == "success")
                {
                    civ.gold = (civ.gold ?? 0) + 120;
                    foreach (WbArmy a in w.armies) if (a.civ == civ.id) a.morale = System.Math.Min(100, a.morale + 10);
                    w.AddEvent("decreeOk", $"神谕达成：「{civ.name}」——{msg}（国库 +120）", civ.colorHex);
                    w.Toast($"「{civ.name}」达成了{DirectiveLabel[d.kind]}", "good");
                }
                else
                {
                    civ.gold = (int)System.Math.Max(0, (civ.gold ?? 0) - 60);
                    foreach (WbArmy a in w.armies) if (a.civ == civ.id) a.morale = System.Math.Max(25, a.morale - 10);
                    w.AddEvent("decreeFail", $"神谕落空：「{civ.name}」——{msg}", civ.colorHex);
                    w.Toast($"「{civ.name}」未能达成{DirectiveLabel[d.kind]}", "danger");
                }
            }
        }

        /// disbandArmy（engine L6876-6900）—— 军团解散（mergeCivs 超编荣散/eliminateCiv 静默覆灭消费端）
        public static void DisbandArmy(WbWorld w, WbArmy a, bool quiet)
        {
            // WBB.touchMeta() —— army/boat 列 wasm 镜像写点（civ 层 no-op）
            WbCiv civ = CivAt(w, a.civ);
            foreach (int id in a.members)
            {
                WbU u;
                if (w.unitById.TryGetValue(id, out u) && u != null && u.army is int ai && ai == a.id)
                {
                    u.army = null;
                    u.boat = 0; u.boatTTL = 0;
                }
            }
            w.armies.Remove(a);
            if (civ != null) civ.armyCd = w.tickCount + ARMY_CD;
            if (!quiet && civ != null)
            {
                string msg = a.tactical
                    ? $"{a.name} 战术后撤归营整补（斩获 {WbNum(a.kills)}，损失 {WbNum(a.losses)}）——军旗未倒，随时再战"
                    : $"{a.name} 解散归田（战役斩获 {WbNum(a.kills)}，损失 {WbNum(a.losses)}）";
                a.tactical = false;
                w.AddEvent("army", msg, civ.colorHex, a.x, a.y);
            }
            // 从其它军团的会战引用中摘除
            foreach (WbArmy o in w.armies)
            {
                if (o.clashWith == a.id) { o.clashWith = null; if (o.state == "battle") o.state = "march"; }
            }
        }
        /// JS number→string 模板语义（整数不带小数点）
        private static string WbNum(double v) => v == System.Math.Floor(v) && !double.IsInfinity(v) ? ((long)v).ToString() : v.ToString();

        // ---------------- ensureWarData（engine L7209-7236） ----------------
        public static WbWarData EnsureWarData(WbWorld w, int a, int b)
        {
            string key = WbWorld.PairKey(a, b);
            WbWarData wd;
            if (w.warData.TryGetValue(key, out wd)) return wd;
            WbCiv ca = CivAt(w, a);
            WbCiv cb = CivAt(w, b);
            if (ca == null || cb == null || !ca.alive || !cb.alive) return null;
            wd = new WbWarData
            {
                key = key,
                a = System.Math.Min(a, b),
                b = System.Math.Max(a, b),
                startTick = w.tickCount,
                startYear = (int)System.Math.Floor(w.yearF),
                total = w.totalWars.Contains(key),
                scoreA = 0, scoreB = 0, exA = 0, exB = 0, casA = 0, casB = 0,
                razedA = 0, razedB = 0, battles = 0,
                giveUpAt = 0,
                reason = "border",
                reasonText = "",
                aggressor = ca.pop >= cb.pop ? a : b,
                goal = 0, goalNow = 0, occA = 0, occB = 0,
                popA0 = ca.pop, popB0 = cb.pop,
                lastActiveTick = w.tickCount,
            };
            w.warData[key] = wd;
            w.statWars++; // 成就计数：新战争建档（含旧档补录）
            return wd;
        }

        /// casusText（engine L6928-6940）—— 宣战檄文（纪事原文；「垂诞」为蓝本原样保真）
        public static string CasusText(WbWorld w, WbCiv ca, WbCiv cb, string reason, int goal)
        {
            switch (reason)
            {
                case "border": return $"「{ca.name}」以边境土地纠葛为由向「{cb.name}」宣战——旨在夺取 {goal} 格接壤疆土";
                case "conquest": return $"「{ca.name}」以开疆拓土之名向「{cb.name}」宣战——不吞并 {goal} 格国土誓不罢兵";
                case "plunder": return $"「{ca.name}」垂诞「{cb.name}」的膏腴，发动劫掠战争——须斩获 {goal} 战果方肯休战";
                case "revenge": return $"「{ca.name}」不忘旧败之耻，向「{cb.name}」掀起复仇战争——不夺回 {goal} 分优势决不收兵";
                case "rebel": return $"「{ca.name}」出兵讨伐叛离的「{cb.name}」——不将其从大地上抹去决不收兵";
                case "annex": return $"「{ca.name}」对「{cb.name}」发动灭国战争——不摧毁对方最后一座城池决不罢休";
                case "unify": return $"「{ca.name}」奉统一天下之大义向「{cb.name}」宣战——世间只能有一个强权";
                case "holy": return $"神谕既下：「{ca.name}」奉旨向「{cb.name}」发动圣战";
                case "alliance": return $"「{ca.name}」依盟约向「{cb.name}」参战——政守同盟，共赴戎机";
                default: return reason;
            }
        }

        // ---------------- declareWar（engine L6942-7043） ----------------
        public static WbWarData DeclareWar(WbWorld w, int agg, int victim, string reason,
            bool total = false, int goal = 0, bool force = false, bool quiet = false)
        {
            WbCiv ca = CivAt(w, agg);
            WbCiv cb = CivAt(w, victim);
            if (ca == null || cb == null || !ca.alive || !cb.alive || agg == victim) return null;
            if (!force && !w.laws.wars) return null; // 世界法则禁战（神谕/叛乱由 force 驱动）
            string key = WbWorld.PairKey(agg, victim);
            w.met.Add(key);
            int level = CasusLevel[reason];
            double cur;
            w.rel[key] = System.Math.Min(w.rel.TryGetValue(key, out cur) ? cur : 0, (double)level);
            // 目的定量（opts.goal 优先——神谕攻城令等自带目标）
            if (goal <= 0)
            {
                int vicTiles = cb.tiles.Count;
                switch (reason)
                {
                    case "border": goal = (int)System.Math.Max(6.0, System.Math.Min(12.0, WbMath.JsRound(vicTiles * 0.1))); break;
                    case "conquest": goal = (int)System.Math.Max(16.0, System.Math.Min(45.0, WbMath.JsRound(vicTiles * 0.25))); break;
                    case "plunder": goal = (int)System.Math.Max(24.0, System.Math.Min(44.0, WbMath.JsRound(cb.pop * 0.6))); break;
                    case "revenge": goal = 30; break;
                    default: goal = 0; break; // rebel/annex/unify/holy：摧毁敌国
                }
            }
            WbWarData wd = EnsureWarData(w, agg, victim);
            if (wd == null) return null;
            wd.reason = reason;
            wd.aggressor = agg;
            wd.goal = goal;
            wd.reasonText = CasusText(w, ca, cb, reason, goal);
            bool immortal = reason == "annex" || reason == "unify" || reason == "rebel" || total;
            if (immortal)
            {
                wd.total = true;
                w.totalWars.Add(key);
                if (wd.giveUpAt == 0) wd.giveUpAt = w.tickCount + 3600;
            }
            wd.lastActiveTick = w.tickCount;
            // —— 宣战流水（自然引燃频仍度信号）：连年烽火的积累比瞬时战争数更真实 ——
            w.warHistory.Add(w.tickCount);
            if (w.warHistory.Count > 24) w.warHistory.RemoveAt(0);
            // —— 战争动员开销（Task 34 经济闭环）：开战即烧钱（集结/军械/粮秣）——
            {
                int cost = (int)System.Math.Min(40.0, 8 + System.Math.Floor(ca.pop * 0.08));
                ca.gold = System.Math.Max(0, (ca.gold ?? 0) - cost);
            }
            if (!quiet)
            {
                w.AddEvent("casus", wd.reasonText, ca.colorHex,
                    ca.capital >= 0 ? (double?)WbWorld.TileX(ca.capital) : null,
                    ca.capital >= 0 ? (double?)WbWorld.TileY(ca.capital) : null);
                w.Toast($"「{ca.name}」对「{cb.name}」宣战：{CasusLabel(reason)}", "war");
                // this.onSound?.('horn') —— 宿主音频回调（gen 端未接线，no-op）
            }
            // —— 联盟集体防御：对成员宣战 = 与整个联盟为敌（攻守同盟的核心条款）——
            if (reason != "alliance" || force)
            {
                WbAlliance vAl = AllianceOfCiv(w, victim);
                if (vAl != null && !vAl.members.Contains(agg))
                {
                    int joined = 0;
                    foreach (int m in vAl.members.ToArray())
                    {
                        if (m == victim || m == agg) continue;
                        WbCiv mc = CivAt(w, m);
                        if (mc == null || !mc.alive || AtWar(w, m, agg)) continue;
                        if (DeclareWar(w, m, agg, "alliance", force: true, quiet: true, goal: 6) != null)
                        {
                            joined++;
                            string k = WbWorld.PairKey(m, agg);
                            double rk;
                            w.rel[k] = System.Math.Min(w.rel.TryGetValue(k, out rk) ? rk : 0, -35);
                        }
                    }
                    if (joined > 0 && !quiet)
                    {
                        vAl.warsTogether++;
                        w.AddEvent("alliance", $"集体防御条款生效：「{vAl.name}」的 {joined} 个成员国对侵略者「{ca.name}」宣战", vAl.colorHex);
                    }
                }
            }
            // —— 联军协同出击：盟友主动开战时跟随参战（每联盟 300 tick 冷却；盟友与对方关系 ≥20 则拒绝）——
            if (!force && reason != "alliance" && reason != "rebel" && w.laws.wars)
            {
                WbAlliance aAl = AllianceOfCiv(w, agg);
                long cd;
                if (aAl != null && w.tickCount - (w.allianceWarCd.TryGetValue(aAl.id, out cd) ? cd : -9000000000L) > 300)
                {
                    int joined = 0;
                    foreach (int m in aAl.members.ToArray())
                    {
                        if (m == agg) continue;
                        WbCiv mc = CivAt(w, m);
                        if (mc == null || !mc.alive || AtWar(w, m, victim)) continue;
                        double rv;
                        if ((w.rel.TryGetValue(WbWorld.PairKey(m, victim), out rv) ? rv : 0) >= 20)
                        {
                            aAl.cohesion = (int)System.Math.Max(0, aAl.cohesion - 2); // 拒绝出兵：貌合神离
                            continue;
                        }
                        if (w.Rng() < 0.6 && DeclareWar(w, m, victim, "alliance", force: true, quiet: true, goal: 6) != null)
                        {
                            joined++;
                        }
                    }
                    if (joined > 0)
                    {
                        w.allianceWarCd[aAl.id] = w.tickCount;
                        aAl.warsTogether++;
                        w.AddEvent("alliance", $"联军出击：「{aAl.name}」{joined} 个成员国响应盟主号令，共讨「{cb.name}」", aAl.colorHex);
                    }
                }
            }
            // —— 种族关系：种族间王国的战争撕裂整个种族对彼此的看法（圣战/世仇最伤）——
            w.ShiftRaceRel(ca.race, cb.race, reason == "holy" ? -4 : -2.5);
            return wd;
        }

        // ---------------- pickCasus（engine L7046-7084） ----------------
        public static (string reason, WbCiv aggressor, WbCiv victim) PickCasus(WbWorld w, WbCiv ca, WbCiv cb)
        {
            string key = WbWorld.PairKey(ca.id, cb.id);
            // 复仇：上一场战争的败方主动寻仇（败国之恨几乎必然寻机翻案）
            int shame;
            if (w.warShame.TryGetValue(key, out shame))
            {
                WbCiv agg = shame == ca.id ? ca : cb;
                WbCiv vic = shame == ca.id ? cb : ca;
                if (agg.alive && vic.alive && (agg.militarism ?? 30) >= 22 && w.Rng() < 0.6)
                {
                    return ("revenge", agg, vic);
                }
            }
            // 统一雄心 / 灭国·攻城神谕：目标就在眼前
            WbCiv[] pair = { ca, cb };
            foreach (WbCiv c in pair)
            {
                WbCiv other = c == ca ? cb : ca;
                if (ActiveDirective(w, c.id, "unify") != null && c.pop >= other.pop)
                {
                    return ("unify", c, other);
                }
                WbDirective d = ActiveDirective(w, c.id, "annihilate") ?? ActiveDirective(w, c.id, "conquer");
                if (d != null && d.target == other.id) return ("holy", c, other);
            }
            // 挑起方：军国主义更高者更主动
            WbCiv aggr = ((ca.militarism ?? 30) + w.Rng() * 34 >= (cb.militarism ?? 30) + w.Rng() * 34) ? ca : cb;
            WbCiv vic2 = aggr == ca ? cb : ca;
            double ratio = (aggr.pop + 2) / (double)(vic2.pop + 2);
            // —— 种族贪婪互连：贪婪种族（哥布林/矮人财性）的劫掠冲动更强 ——
            double greed = RaceGreed(aggr.race);
            if (ratio >= 1.6 && (aggr.militarism ?? 30) >= 42) return ("conquest", aggr, vic2);
            if ((vic2.gold ?? 0) >= 140 && (aggr.militarism ?? 30) >= 45 && (greed >= 0.55 || w.Rng() < 0.4)) return ("plunder", aggr, vic2);
            if (ratio <= 0.8 && (aggr.militarism ?? 30) >= 52 && greed >= 0.6) return ("plunder", aggr, vic2);
            return ("border", aggr, vic2);
        }
    }
}
