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
                    // —— M-U3e：余下 24 项全量补齐（tech.ts L201-226 逐字保真） ——
                    case "printing": m.know += 0.5; m.cult += 0.3; break;
                    case "banking": m.gold += 0.35; break;
                    case "astronomy": m.col -= 0.3; break;
                    case "medicine": m.plague -= 0.45; break;
                    case "gothic": m.bhp += 0.25; m.repair += 0.6; break;
                    case "republic": m.stab += 15; m.gold += 0.2; break;
                    case "steel": m.dmg += 0.2; m.hp += 0.12; break;
                    case "legion": m.armyMax += 2; m.morale += 6; break;
                    case "steam": m.bhp += 0.4; m.repair += 0.8; break;
                    case "gunpowder": m.dmg += 0.25; break;
                    case "assembly": m.gold += 0.6; break;
                    case "sanitation": m.repro += 0.12; m.plague -= 0.3; break;
                    case "rifling": m.range += 2.5; m.archer += 0.3; break;
                    case "explosives": m.dmg += 0.15; m.arty += 1; break;
                    case "flight": m.bomber += 1; break;
                    case "atomic": m.nukeCap += 1; break;
                    case "electronics": m.know += 0.6; break;
                    case "singularity": m.ai += 1; m.stab += 10; m.know += 0.4; break;
                    case "robotics": m.mech += 1; m.repair += 1.0; m.bhp += 0.4; break;
                    case "lasers": m.laser += 1; m.dmg += 0.2; break;
                    case "drones": m.drone += 1; break;
                    case "orbital": m.orbital += 1; break;
                    case "plasma": m.plasma += 1; m.dmg += 0.15; break;
                    case "antimatter": m.antiMatter += 1; break;
                    default: break; // 未知 key（emTechs 涌现科技走 ApplyEmTechMods 叠加域，不入静态表）
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
            // v3：涌现科技效果叠加（emergence.ts applyEmTechMods —— 无限发明 → 无限叠加的小加成）
            if (c != null && w.emTechs.Count > 0)
            {
                foreach (string key in c.techs)
                {
                    if (w.emTechs.TryGetValue(key, out WbEmTech em) && em != null) WbTech.ApplyEmTechMods(mods, em);
                }
            }
            techModCache[civId] = mods;
            return mods;
        }
        /// generate/读档清缓存点（engine L825）
        public static void ClearTechModCache() => techModCache.Clear();

        // ==================== M-U3e 科技研发域（engine L4884-5017） ====================

        /// 文明中心坐标（事件定位用）（engine L4998-5006）
        public static double CivCenterX(WbWorld w, WbCiv c)
        {
            if (c.capital >= 0) return WbWorld.TileX(c.capital) + 0.5;
            return c.tiles.Count > 0 ? WbWorld.TileX(c.tiles[(c.tiles.Count / 2) | 0]) : WbWorld.W / 2;
        }
        public static double CivCenterY(WbWorld w, WbCiv c)
        {
            if (c.capital >= 0) return WbWorld.TileY(c.capital) + 0.5;
            return c.tiles.Count > 0 ? WbWorld.TileY(c.tiles[(c.tiles.Count / 2) | 0]) : WbWorld.H / 2;
        }

        /// 文明可研究科技列表（未拥有且前置齐备）（engine L4884-4887）
        public static List<WbTechDef> AvailableTechs(WbCiv c)
        {
            var owned = new HashSet<string>(c.techs ?? new List<string>());
            var mi = new List<WbTechDef>();
            foreach (var t in WbTech.Techs)
                if (!owned.Contains(t.key) && AllDepsOwned(t.deps, owned)) mi.Add(t);
            return mi;
        }
        private static bool AllDepsOwned(string[] deps, HashSet<string> owned)
        {
            foreach (string d in deps) if (!owned.Contains(d)) return false;
            return true;
        }

        /// 文明自动选题：偏好与国家气质相关（engine L4890-4916）
        public static string PickResearch(WbWorld w, WbCiv c)
        {
            List<WbTechDef> avail = AvailableTechs(c);
            if (avail.Count == 0) return null;
            // 偏好加权：军国主义/文化/国库影响选题倾向（真实的国家路径分化）
            double mil = (c.militarism ?? 30) / 100.0;
            double cul = System.Math.Min(1, (c.culture) / 120.0);
            double rich = System.Math.Min(1, (c.gold ?? 0) / 200.0);
            double[] wt = new double[avail.Count];
            double total = 0;
            for (int i = 0; i < avail.Count; i++)
            {
                double b = 1;
                WbTechDef t = avail[i];
                if (t.cat == "military") b *= 0.5 + mil * 1.6;
                if (t.cat == "culture") b *= 0.5 + cul * 1.6;
                if (t.cat == "econ") b *= 0.6 + rich * 1.4;
                if (t.cat == "civic") b *= 0.7 + (100 - (c.stability)) / 150.0;
                if (t.cat == "naval") b *= 0.7;
                if (t.cat == "agri") b *= 0.8 + System.Math.Min(0.8, c.pop / 100.0);
                if (t.cat == "eng") b *= 0.9;
                wt[i] = b;
                total += b;
            }
            double roll = w.Rng() * total;
            for (int i = 0; i < avail.Count; i++)
            {
                roll -= wt[i];
                if (roll <= 0) return avail[i].key;
            }
            return avail[avail.Count - 1].key;
        }

        /// 知识注入研究：完成返回实际消耗量（engine L4920-4948）
        public static double FundResearch(WbWorld w, WbCiv c, double points)
        {
            if (points <= 0) return 0;
            if (c.research == null)
            {
                string pick = PickResearch(w, c) ?? InventEmTech(w, c);
                if (pick == null) return 0;
                c.research = pick;
                c.researchP = 0;
                WbTechDef? def0 = WbTech.ByKey(pick);
                WbEmTech em0 = null;
                w.emTechs.TryGetValue(pick, out em0);
                w.AddEvent("tech", $"「{c.name}」的学者们开始研究「{(def0.HasValue ? def0.Value.name : (em0 != null ? em0.name : pick))}」", c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
            }
            WbTechDef? defN = WbTech.ByKey(c.research);
            if (!defN.HasValue && !w.emTechs.ContainsKey(c.research)) { c.research = null; return 0; }
            double cost = defN.HasValue ? defN.Value.cost : w.emTechs[c.research].cost;
            double start = c.researchP;
            // —— 联盟互连：盟友已掌握的科技 → 技术交流使研究效率 ×1.2（盟内知识扩散）——
            WbAlliance alF = AllianceOfCiv(w, c.id);
            double diffusion = 1;
            if (alF != null)
            {
                foreach (int m in alF.members)
                {
                    if (m == c.id) continue;
                    WbCiv mc = CivAt(w, m);
                    if (mc != null && mc.alive && mc.techs != null && mc.techs.Contains(c.research)) { diffusion = alF.bonded ? 1.32 : 1.2; break; }
                }
            }
            c.researchP = start + points * diffusion;
            if (c.researchP >= cost)
            {
                CompleteTech(w, c, c.research);
                return System.Math.Max(0, cost - start); // 实际消耗 = 完成缺口（余量回流国库）
            }
            return points;
        }

        /// 科技完成：入帐 + 纪事 + 加成缓存重建（engine L4951-4996）
        public static void CompleteTech(WbWorld w, WbCiv c, string key)
        {
            c.techs.Add(key);
            WbTechDef? def = WbTech.ByKey(key);
            WbEmTech em = null;
            w.emTechs.TryGetValue(key, out em);
            c.research = null;
            c.researchP = 0;
            techModCache.Remove(c.id);
            // —— 科技回溯：研发完成即刻惠及全军现役单位（按新旧乘数差重算）——
            {
                WbTechMods nm = TechModsOf(w, c.id); // 缓存已删，重算即新值
                if (nm.dmg != 1 || nm.hp != 1)
                {
                    foreach (WbU u in w.units)
                    {
                        if (u.dead != 0 || u.civ != c.id) continue;
                        double rd = nm.dmg / (u.tDmg ?? 1);
                        double rh = nm.hp / (u.tHp ?? 1);
                        if (rd != 1) u.dmg = System.Math.Max(1, u.dmg * rd);
                        if (rh != 1)
                        {
                            double ratio = u.hp / u.maxHp;
                            u.maxHp = System.Math.Max(1, WbMath.JsRound(u.maxHp * rh));
                            u.hp = System.Math.Min(u.maxHp, System.Math.Max(1, WbMath.JsRound(u.maxHp * ratio)));
                        }
                        u.tDmg = nm.dmg;
                        u.tHp = nm.hp;
                    }
                }
            }
            w.AddEvent("tech", $"「{c.name}」研发出「{(def.HasValue ? def.Value.name : (em != null ? em.name : key))}」—— {(def.HasValue ? def.Value.desc : (em != null ? em.desc : ""))}", c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
            // 大科技里程碑提示（涌现科技每 5 项提示一次，防刷屏）
            if ((def.HasValue && def.Value.era >= 2) || (em != null && em.gen % 5 == 0))
            {
                w.Toast($"「{c.name}」掌握了「{(def.HasValue ? def.Value.name : (em != null ? em.name : key))}」", "info");
                // onSound('era') —— 纪元跃迁钟声（M-U4 域）
            }
            // 现有建筑随工程科技升级耐久上限（老房加固——立即重建受损映射）
            if (def.HasValue && (def.Value.key == "masonry" || def.Value.key == "fortification" || def.Value.key == "gothic"))
            {
                double mul = TechModsOf(w, c.id).bhp;
                foreach (WbBuilding b in w.buildings)
                {
                    if (b.civ != c.id) continue;
                    double baseHp = BUILDING_DEFS[b.kind].hp;
                    double max = WbMath.JsRound(baseHp * mul);
                    double cur;
                    w.BhpSet(b.i, System.Math.Min(max, (w.bHp.TryGetValue(b.i, out cur) ? cur : baseHp) + baseHp * 0.25));
                }
            }
        }

        /// 涌现科技发明（静态树穷尽后的无限延伸）（engine L8794-8803）
        public static string InventEmTech(WbWorld w, WbCiv c)
        {
            if (w.emTechs.Count >= 60) return null; // 注册表软上限（防超长局内存膨胀；效果仍可叠加）
            WbEmTech t = WbTech.InventTech(w, (c.militarism ?? 30) / 100.0, System.Math.Min(1, (c.culture) / 120.0), System.Math.Min(1, (c.gold ?? 0) / 200.0), w.emTechSeq);
            t.key = $"em{w.emTechSeq++}";
            w.emTechs[t.key] = t;
            RecordEvo(w, "tech", t.name, null, c.colorHex, $"{t.desc}（{c.name} 的第 {t.gen} 项涌现发明）", t.desc, null);
            w.AddEvent("emerge", $"「{c.name}」的学者穷尽了既有典籍，开创出前所未有的学问——「{t.name}」（{t.desc}）", c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
            w.Toast($"「{c.name}」发明了「{t.name}」", "good");
            return t.key;
        }

        /// 科技 tick：每 120 tick 一次（engine L5009-5017；无收入文明的慢速自然积累）
        public static void TechTick(WbWorld w)
        {
            foreach (WbCiv c in w.civs)
            {
                if (c == null || !c.alive || c.pop <= 0) continue;
                // 无图书馆的小文明：口传心授的自然积累（每 tick 段 0-1 点，人口越大越多）
                if (c.research == null && (c.knowledge ?? 0) < 40 && w.Rng() < 0.35)
                {
                    FundResearch(w, c, w.Rng() < 0.5 ? 1 : 0); // 确定性 RNG（Math.random 会破坏同种子复现）
                }
            }
        }


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
                    double stab = civ.stability; // M-U3f stability double 化
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
            double gold = civ.gold ?? 0; // M-U3f gold double 化
            double know = civ.knowledge ?? 0; // M-U3f knowledge double 化
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
            w.BhpSet(i, System.Math.Round(DefHp(kind) * TechModsOf(w, civId).bhp));
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
            w.BhpDel(i);
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
                w.AddEvent("alliance", $"「{civ.name}」的覆灭震动了盟邦——「{(alFall.members.Count >= 2 ? alFall.name : "其盟友")}」为亡者降下半旗", alFall.colorHex);
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
            // 建筑拆毁（engine.ts L2219-2222）：[...this.buildings] 正序快照逐个销毁 ——
            // ⚠️ 逆序+swap-remove 仅等价"删谁"，不等价 fx smoke 产出序（黄金 fx[0]=首个正序位）——2026-10-29 修正
            List<WbBuilding> elimBSnap = new List<WbBuilding>(w.buildings);
            foreach (WbBuilding b in elimBSnap)
                if (b.civ == civ.id) DestroyBuilding(w, b.i);
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

        /// RACES diplo/aggr（types.ts RACES 表字段 —— 种族外交底色/好战度 0-1）
        /// M-U3d 修复：仅 6 族定义 diplo（HUMAN/ELF/DWARF/ORC/LIZARD=19/GOBLIN=20），
        /// BANDIT(4)/ZOMBIE(5) 无字段 → ?? 0.5 回退；旧数组按序索引曾把 4/5 错配 0.35/0.3
        public static readonly Dictionary<int, double> RacesDiplo = new Dictionary<int, double>
        {
            { 0, 0.65 }, { 1, 0.45 }, { 2, 0.4 }, { 3, 0.15 }, { 19, 0.35 }, { 20, 0.3 },
        };
        public static double RaceDiploOf(int race) => RacesDiplo.TryGetValue(race, out double v) ? v : 0.5;
        public static readonly Dictionary<int, double> RacesAggr = new Dictionary<int, double>
        {
            { 0, 0.4 }, { 1, 0.25 }, { 2, 0.5 }, { 3, 0.9 }, { 19, 0.5 }, { 20, 0.55 },
        };
        public static double RaceAggrOf(int race) => RacesAggr.TryGetValue(race, out double v) ? v : 0.5;

        /// RACES 社会属性四表（M-U3f：economyTick industry/arcane + societyTick piety/harmony 消费域）
        /// 同 RacesDiplo 模式：仅 isCiv 六族有值，其余 ?? 0.5 回退（蓝本 rpE?.industry ?? 0.5）
        public static readonly Dictionary<int, double> RacesIndustry = new Dictionary<int, double>
        {
            { 0, 0.6 }, { 1, 0.3 }, { 2, 0.9 }, { 3, 0.3 }, { 19, 0.45 }, { 20, 0.4 },
        };
        public static double RaceIndustryOf(int race) => RacesIndustry.TryGetValue(race, out double v) ? v : 0.5;
        public static readonly Dictionary<int, double> RacesArcane = new Dictionary<int, double>
        {
            { 0, 0.35 }, { 1, 0.85 }, { 2, 0.4 }, { 3, 0.15 }, { 19, 0.45 }, { 20, 0.3 },
        };
        public static double RaceArcaneOf(int race) => RacesArcane.TryGetValue(race, out double v) ? v : 0.5;
        public static readonly Dictionary<int, double> RacesPiety = new Dictionary<int, double>
        {
            { 0, 0.4 }, { 1, 0.75 }, { 2, 0.35 }, { 3, 0.25 }, { 19, 0.5 }, { 20, 0.2 },
        };
        public static double RacePietyOf(int race) => RacesPiety.TryGetValue(race, out double v) ? v : 0.5;
        public static readonly Dictionary<int, double> RacesHarmony = new Dictionary<int, double>
        {
            { 0, 0.7 }, { 1, 0.5 }, { 2, 0.45 }, { 3, 0.25 }, { 19, 0.4 }, { 20, 0.35 },
        };
        public static double RaceHarmonyOf(int race) => RacesHarmony.TryGetValue(race, out double v) ? v : 0.5;

        /// GOV_DEFS（tech.ts L242-248）—— setGov 播报用（M-U3f）
        public class WbGovDef
        {
            public string key;
            public string name;
            public string desc;
        }
        public static readonly WbGovDef[] GovDefs = new WbGovDef[]
        {
            new WbGovDef { key = "tribal", name = "部落制", desc = "长老围坐篝火议事，血脉即律法" },
            new WbGovDef { key = "monarchy", name = "君主制", desc = "王冠与权杖，世袭的秩序" },
            new WbGovDef { key = "theocracy", name = "神权制", desc = "神谕高过王令，祭司执掌尘世" },
            new WbGovDef { key = "republic", name = "共和制", desc = "市民的广场与选票" },
            new WbGovDef { key = "empire", name = "帝国制", desc = "铁蹄与大道，万邦来朝" },
        };

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
            double da = RaceDiploOf(ca.race); // ra?.diplo ?? 0.5
            double db = RaceDiploOf(cb.race);
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
                al.cohesion = System.Math.Max(0, al.cohesion - 22);
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
                al.cohesion = System.Math.Max(0, al.cohesion - 8);
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

        // ==================== M-U3d 联盟系统 + 旨意颁布（engine L7725-7927 / L8076-8361） ====================

        public const int YEAR_TICKS = 40;   // constants.ts L9（1 游戏年 = 40 tick）

        /// DIRECTIVE_META 全表（engine L7725-7738）—— label 子表既有（DirectiveLabel），补 years/param
        public static readonly Dictionary<string, int> DirectiveYears = new Dictionary<string, int>
        {
            { "annihilate", 120 }, { "conquer", 80 }, { "expand", 60 }, { "wealth", 50 }, { "wisdom", 60 },
            { "populate", 60 }, { "legion", 30 }, { "build", 60 }, { "unify", 0 }, { "mobilize", 20 },
            { "alliance", 40 }, { "temple", 60 },
        };
        public static readonly Dictionary<string, int> DirectiveParam = new Dictionary<string, int>
        {
            { "annihilate", 0 }, { "conquer", 0 }, { "expand", 160 }, { "wealth", 300 }, { "wisdom", 200 },
            { "populate", 80 }, { "legion", 2 }, { "build", 20 }, { "unify", 0 }, { "mobilize", 30 },
            { "alliance", 0 }, { "temple", 0 },
        };

        /// 文明政体 id（engine L4877-4881，缓存直读）
        public static int GovOf(WbWorld w, int civId)
        {
            if (civId < 0) return 0;
            WbCiv c = CivAt(w, civId);
            return c != null ? c.gov : 0;
        }

        /// 联盟命名：盟主首都方位 × 本质词（engine L8076-8087）
        public static string AllianceNameFor(WbWorld w, WbCiv leader)
        {
            string region = "中原";
            if (leader.capital >= 0)
            {
                double dx = WbWorld.TileX(leader.capital) / (double)WbWorld.W - 0.5;
                double dy = WbWorld.TileY(leader.capital) / (double)WbWorld.H - 0.5;
                if (System.Math.Abs(dx) < 0.16 && System.Math.Abs(dy) < 0.16) region = "中原";
                else if (System.Math.Abs(dy) >= System.Math.Abs(dx)) region = dy < 0 ? "北境" : "南疆";
                else region = dx < 0 ? "西陲" : "东海";
            }
            string[] essence = { "同盟", "公约", "誓约", "协定", "协约", "阵营" };
            return region + essence[(int)(w.Rng() * 6)];
        }

        /// 缔结联盟（a 为发起者/首任盟主）（engine L8090-8121）
        public static WbAlliance FormAlliance(WbWorld w, WbCiv a, WbCiv b)
        {
            if (a == null || b == null) return null;
            if (w.allianceOf.ContainsKey(a.id) || w.allianceOf.ContainsKey(b.id)) return null;
            if (w.alliances.Count >= 4) return null;
            WbAlliance al = new WbAlliance
            {
                id = w.allianceSeq++,
                name = AllianceNameFor(w, a),
                members = new List<int> { a.id, b.id },
                leader = a.id,
                cohesion = 55,
                formedTick = w.tickCount,
                formedYear = (int)System.Math.Floor(w.yearF),
                warsTogether = 0,
                colorHex = WbWorld.AllianceColors[(w.allianceSeq - 2) % WbWorld.AllianceColors.Length],
            };
            w.alliances.Add(al);
            w.allianceOf[a.id] = al.id;
            w.allianceOf[b.id] = al.id;
            // 成员关系即刻升温（盟约即承诺）
            string pk = WbWorld.PairKey(a.id, b.id);
            double cur;
            w.rel[pk] = System.Math.Max(60, w.rel.TryGetValue(pk, out cur) ? cur : 0);
            w.met.Add(pk);
            // 跨种族结盟 → 两个种族对彼此的看法缓改善（种族互连）
            w.ShiftRaceRel(a.race, b.race, 9);
            w.AddEvent("alliance", $"「{a.name}」与「{b.name}」缔结「{al.name}」——攻守同盟，荣辱与共", al.colorHex,
                a.capital >= 0 ? WbWorld.TileX(a.capital) : (double?)null,
                a.capital >= 0 ? WbWorld.TileY(a.capital) : (double?)null);
            w.Toast($"「{al.name}」成立", "good");
            // onSound('heal') —— 音效宿主回调（M-U4 域）
            if (w.overlayMode == "alliance") w.overlayDirty = true;
            return al;
        }

        /// 加入联盟（种族世仇审查：与盟主种族关系 < -35 的种族难以入盟）（engine L8124-8153）
        public static bool JoinAlliance(WbWorld w, WbAlliance al, WbCiv c)
        {
            if (al == null || c == null) return false;
            if (al.members.Count >= 5 || w.allianceOf.ContainsKey(c.id)) return false;
            WbCiv leader = CivAt(w, al.leader);
            if (leader == null || !leader.alive) return false;
            double rr = w.RaceRelOf(c.race, leader.race);
            if (rr < -35)
            {
                if (w.Rng() < 0.7)
                {
                    w.AddEvent("alliance", $"「{c.name}」申请加入「{al.name}」被拒——千年的种族世仇不是一纸盟约能化解的", al.colorHex);
                    return false;
                }
            }
            al.members.Add(c.id);
            w.allianceOf[c.id] = al.id;
            foreach (int m in al.members.ToArray())
            {
                if (m == c.id) continue;
                WbCiv mc = CivAt(w, m);
                if (mc == null || !mc.alive) continue;
                string k = WbWorld.PairKey(m, c.id);
                double rv;
                w.rel[k] = System.Math.Max(52, w.rel.TryGetValue(k, out rv) ? rv : 0);
                w.ShiftRaceRel(mc.race, c.race, 4);
                w.met.Add(k);
            }
            w.AddEvent("alliance", $"「{c.name}」加入「{al.name}」——盟旗之下多了一支力量", al.colorHex,
                c.capital >= 0 ? WbWorld.TileX(c.capital) : (double?)null,
                c.capital >= 0 ? WbWorld.TileY(c.capital) : (double?)null);
            if (w.overlayMode == "alliance") w.overlayDirty = true;
            return true;
        }

        /// 理念加成汇总（engine L8833-8851）（缓存：采纳时失效；emIdeas 涌现域 M-U3e+，空表 → 全零）
        public static WbIdeaMods IdeaModsOf(WbWorld w, int civId)
        {
            if (civId < 0) return new WbIdeaMods();
            WbIdeaMods cached;
            if (w.ideaModCache.TryGetValue(civId, out cached)) return cached;
            WbCiv c = CivAt(w, civId);
            WbIdeaMods mi = new WbIdeaMods();
            if (c != null && c.ideas != null)
            {
                foreach (string key in c.ideas)
                {
                    WbIdea idea;
                    if (!w.emIdeas.TryGetValue(key, out idea) || idea == null || idea.mods == null) continue;
                    mi.gold = (mi.gold ?? 0) + (idea.mods.gold ?? 0);
                    mi.stab = (mi.stab ?? 0) + (idea.mods.stab ?? 0);
                    mi.mil = (mi.mil ?? 0) + (idea.mods.mil ?? 0);
                    mi.know = (mi.know ?? 0) + (idea.mods.know ?? 0);
                    mi.repro = (mi.repro ?? 0) + (idea.mods.repro ?? 0);
                    mi.wear = (mi.wear ?? 0) + (idea.mods.wear ?? 0);
                }
            }
            w.ideaModCache[civId] = mi;
            return mi;
        }

        // ==================== M-U3f 经济/社会域（engine L4800-5136 + L8806-8830 机械翻译，纪律①） ====================

        /// engine economyTick L4800-4854（每 %120===0；宿主门在驱动循环 —— NUnit/gen 同序）
        public static void EconomyTick(WbWorld w)
        {
            foreach (WbCiv c in w.civs.ToArray())
            {
                if (c == null || !c.alive || c.pop <= 0) continue;
                int[] counts;
                w.civBuildCounts.TryGetValue(c.id, out counts);
                if (counts == null) continue;
                int markets = counts[BUILD_KINDS.MARKET];
                int libraries = counts[BUILD_KINDS.LIBRARY];
                int temples = counts[BUILD_KINDS.TEMPLE];
                int ports = counts[BUILD_KINDS.PORT];
                // 旨意加成：富国令财富产出 ×2 / 启智令知识产出 ×2（文明自行达成的引擎）
                int wealthBoost = ActiveDirective(w, c.id, "wealth") != null ? 2 : 1;
                int wisdomBoost = ActiveDirective(w, c.id, "wisdom") != null ? 2 : 1;
                // —— 科技/社会加成：税基×tech.tax×政体 / 经济×tech.gold / 知识×tech.know（文化反哺）——
                WbTechMods tm = TechModsOf(w, c.id);
                WbIdeaMods im = IdeaModsOf(w, c.id); // v3：涌现理念加成（经济/知识）
                int gov = GovOf(w, c.id);
                double cultKnow = 1 + System.Math.Min(0.5, c.culture * 0.002); // 文化反哺学术（上限 +50%）
                double govTaxMul = gov == 1 ? 1.1 : gov == 2 ? 1.0 : gov == 3 ? 1.0 : gov == 4 ? 1.05 : 1;
                // —— 种族互连：勤勉种族的税基更丰厚（矮人的工坊永不熄火）——
                double industryMul = 0.8 + RaceIndustryOf(c.race) * 0.4;
                // —— 季节互连：冬季雪封商路，集市与港口收入 ×0.9 ——
                double winterMul = w.NatureSeason() == 3 ? 0.9 : 1;
                int taxBase = (int)System.Math.Floor(c.pop * 0.05 * tm.tax * govTaxMul);
                // —— 财富饱和：囤积低效（官僚损耗随库藏膨胀 → 净入账递减 —— 软上限防数万金通胀） ——
                double hoard = c.gold ?? 0;
                double drag = 1 / (1 + hoard / 900);
                // —— 联盟互连：盟友间商贸一体化，关税减免 ×1.15（盟内市场优先繁荣）——
                WbAlliance alE = AllianceOfCiv(w, c.id);
                double allyTrade = alE != null && alE.members.Count >= 2 ? (alE.bonded ? 1.25 : 1.15) : 1;
                int income = (int)System.Math.Max(0, WbMath.JsRound((markets * 3 + temples * 1 + ports * 2 + taxBase) * wealthBoost * tm.gold * (gov == 3 ? 1.25 : 1) * (1 + (im.gold ?? 0)) * industryMul * winterMul * allyTrade * drag));
                // —— 军团军饷：现役军团成员人均 0.12 金/tick 段（军国主义高涨的国家咬牙供养）——
                double upkeep = 0;
                foreach (WbArmy a in w.armies)
                {
                    if (a.civ == c.id && a.state != "retreat") upkeep += a.members.Count * 0.12; // 军饷（战时大军是吞金兽）
                }
                upkeep += counts[BUILD_KINDS.CASTLE] * 0.5 + counts[BUILD_KINDS.TOWER] * 0.15; // 城防维护
                c.income = income;
                c.expense = WbMath.JsRound(upkeep * 10) / 10;
                c.gold = System.Math.Max(0, (c.gold ?? 0) + income - upkeep);
                // —— 军饷欠饷：国库见底 → 军团士气滑落（帝国过度扩张的代价）——
                if ((c.gold ?? 0) <= 0 && upkeep > 2)
                {
                    foreach (WbArmy a in w.armies)
                    {
                        if (a.civ == c.id) a.morale = System.Math.Max(0, a.morale - 0.5);
                    }
                }
                // —— 知识：种族奥术天赋（精灵的魔法学术）× 冬季蛰居苦读（×1.05 反向补偿）——
                double arcaneMul = 0.8 + RaceArcaneOf(c.race) * 0.45;
                double knowGain = WbMath.JsRound((libraries * 2 + (c.pop > 20 ? 1 : 0)) * wisdomBoost * tm.know * cultKnow * (gov == 2 ? 1.15 : 1) * (1 + (im.know ?? 0)) * arcaneMul * (w.NatureSeason() == 3 ? 1.05 : 1));
                // 知识优先投入研究（科技研发体系），余量入国库知识存量（解锁建筑）
                double spent = FundResearch(w, c, knowGain);
                c.knowledge = (c.knowledge ?? 0) + (knowGain - spent); // M-U3f 去 int 截断（diffusion 后余量小数）
            }
        }

        /// engine recentVictory L5088-5094（战争分数结算中最近 200-300 tick 窗口内取胜）
        public static bool RecentVictory(WbWorld w, int civId)
        {
            foreach (WbWarData wd in w.warData.Values)
            {
                int winner = wd.scoreA > wd.scoreB ? wd.a : wd.b;
                if (winner == civId && w.tickCount - wd.startTick < 300 && w.tickCount - wd.startTick > 200) return true;
            }
            return false;
        }

        /// engine setGov L5097-5108（政体变革含播报）
        public static void SetGov(WbWorld w, WbCiv c, int gov, string cause)
        {
            if (c.gov == gov) return;
            c.gov = gov;
            c.govYear = (int)System.Math.Floor(w.yearF);
            w.govCache[c.id] = gov;
            WbGovDef g = GovDefs[gov];
            string text = cause == "revolution"
                ? $"革命席卷「{c.name}」！王冠坠地，{g.name}在废墟上建立"
                : $"「{c.name}」确立了{g.name}（{g.desc}）";
            w.AddEvent("gov", text, c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
            w.Toast($"「{c.name}」改制为{g.name}", "info");
        }

        /// engine tryGovEvolve L5111-5136（门槛达成 → 概率跃迁；升序判定：帝国 > 共和 > 神权 > 君主）
        public static void TryGovEvolve(WbWorld w, WbCiv c)
        {
            int last;
            if (!w.lastGovEventTick.TryGetValue(c.id, out last)) last = -4000;
            if (w.tickCount - last < 2000) return; // 变革冷却（≥50 年）
            var owned = new HashSet<string>(c.techs ?? new List<string>());
            int gov = c.gov;
            int[] counts;
            w.civBuildCounts.TryGetValue(c.id, out counts);
            int temples = counts != null ? counts[BUILD_KINDS.TEMPLE] : 0;
            bool canMonarchy = gov < 1 && c.pop >= 25;
            bool canTheocracy = gov < 2 && temples >= 1 && owned.Contains("theology") && c.culture > 50;
            bool canRepublic = gov != 3 && c.pop >= 60 && (owned.Contains("law") || owned.Contains("printing")) && (c.knowledge ?? 0) >= 40 && (c.stability) < 55;
            bool canEmpire = gov != 4 && c.pop >= 120 && (c.militarism ?? 30) >= 55 && (owned.Contains("legion") || owned.Contains("tactics"));
            if (canEmpire && w.Rng() < 0.25)
            {
                w.lastGovEventTick[c.id] = w.tickCount;
                SetGov(w, c, 4, "evolve");
            }
            else if (canRepublic && w.Rng() < 0.18)
            {
                w.lastGovEventTick[c.id] = w.tickCount;
                SetGov(w, c, 3, "evolve");
            }
            else if (canTheocracy && w.Rng() < 0.15)
            {
                w.lastGovEventTick[c.id] = w.tickCount;
                SetGov(w, c, 2, "evolve");
            }
            else if (canMonarchy && w.Rng() < 0.2)
            {
                w.lastGovEventTick[c.id] = w.tickCount;
                SetGov(w, c, 1, "evolve");
            }
        }

        /// engine adoptIdea L8806-8830（50% 全新发明 / 50% 邻国理念文化扩散）
        public static void AdoptIdea(WbWorld w, WbCiv c)
        {
            List<WbIdea> known = new List<WbIdea>();
            foreach (WbIdea i in w.emIdeas.Values)
            {
                if (c.ideas == null || !c.ideas.Contains(i.key)) known.Add(i);
            }
            WbIdea idea = null;
            bool spread = false;
            if (known.Count > 0 && w.Rng() < 0.5)
            {
                // 文化扩散：优先采纳文化强国的理念（文明间的思想传播）
                idea = known[(int)(w.Rng() * known.Count)];
                spread = true;
            }
            else if (w.emIdeas.Count < 48)
            {
                idea = WbTech.InventIdea(w, w.ideaSeq);
                idea.key = $"id{w.ideaSeq++}";
                w.emIdeas[idea.key] = idea;
            }
            else if (known.Count > 0)
            {
                idea = known[(int)(w.Rng() * known.Count)];
                spread = true;
            }
            if (idea == null) return;
            if (c.ideas == null) c.ideas = new List<string>();
            c.ideas.Add(idea.key);
            w.ideaModCache.Remove(c.id);
            RecordEvo(w, "society", idea.name, null, c.colorHex,
                spread ? $"{idea.desc}（自邻邦传入「{c.name}」）" : $"{idea.desc}（{c.name} 独创）", idea.desc,
                new Dictionary<string, object> { { "civ", c.id } });
            w.AddEvent("emerge", spread
                ? $"「{c.name}」的使节带回了异邦的思想——「{idea.name}」开始在朝野流传（{idea.desc}）"
                : $"「{c.name}」酝酿出新的治国理念——「{idea.name}」（{idea.desc}）", c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
        }

        /// engine societyTick L5021-5085（每 %150===7：稳定度/文化/军国主义/节日/理念采纳/政体演变/危机）
        public static void SocietyTick(WbWorld w)
        {
            foreach (WbCiv c in w.civs.ToArray())
            {
                if (c == null || !c.alive || c.pop <= 0) continue;
                int[] counts;
                w.civBuildCounts.TryGetValue(c.id, out counts);
                int temples = counts != null ? counts[BUILD_KINDS.TEMPLE] : 0;
                int libraries = counts != null ? counts[BUILD_KINDS.LIBRARY] : 0;
                WbTechMods tm2 = TechModsOf(w, c.id);
                WbIdeaMods im2 = IdeaModsOf(w, c.id); // v3：涌现理念加成（稳定/军国/厌战）
                int gov = GovOf(w, c.id);
                // —— 稳定度：战争损耗 / 领土过大 / 税负 vs 神殿安抚 / 文化繁荣 / 科技治理 ——
                double stab = c.stability;
                bool atWar = CivAtWar(w, c.id);
                stab += atWar ? -1.2 : 0.6;
                if (c.tiles.Count > 120) stab -= 0.4; // 过度扩张
                stab += temples * 0.15 + c.culture * 0.001;
                stab += tm2.stab / 50; // 法律/共和科技的治理红利
                stab += (im2.stab ?? 0) * 0.45; // 涌现理念：民本/铁律的治理实效
                stab += gov == 1 ? 0.2 : gov == 2 ? 0.12 : gov == 3 ? 0.25 : gov == 4 ? -0.15 : 0;
                // —— 种族互连：多族王国的种族张力（包容种族多元化更稳 / 排外种族动荡）——
                double homo;
                if (!w.civHomogeneity.TryGetValue(c.id, out homo)) homo = 1;
                if (homo < 0.9) stab += (RaceHarmonyOf(c.race) - 0.45) * 20 * (0.9 - homo);
                // —— 联盟互连：盟约的安全感（凝聚力高的联盟成员更安定）——
                WbAlliance alS = AllianceOfCiv(w, c.id);
                if (alS != null && !atWar) stab += System.Math.Min(1.2, alS.cohesion * 0.012);
                c.stability = System.Math.Max(0, System.Math.Min(100, stab));
                // —— 文化积累：神殿 + 节日 + 科技乘数 + 种族虔诚（精灵的仪式与信仰）——
                double cultGain = (temples * 0.8 + 0.4 + libraries * 0.3) * (0.7 + RacePietyOf(c.race) * 0.6) * tm2.cult * (gov == 2 ? 1.4 : 1);
                c.culture = c.culture + cultGain;
                // —— 军国主义：战争推高 / 胜利强化 / 和平消退 + 种族好战基线引力（血蹄永不停步）——
                double mil = c.militarism ?? 30;
                mil += atWar ? 0.9 : -0.5;
                mil += (im2.mil ?? 0) * 3; // 涌现理念：军功爵推高 / 偃武主义拉低
                if (RecentVictory(w, c.id)) mil += 1.2;
                mil += (RaceAggrOf(c.race) * 100 - mil) * 0.01; // 向种族基线缓漂（每十年约 10% 靠近）
                c.militarism = System.Math.Max(0, System.Math.Min(100, mil));
                // —— 节日：文化丰盈时举国庆典（稳定度小振作 + 纪事）——
                int fest = c.festivalCd;
                if (fest > 0)
                {
                    c.festivalCd = fest - 1;
                }
                else if (c.culture > 40 && w.Rng() < 0.3)
                {
                    c.festivalCd = 10;
                    c.culture = c.culture - 20;
                    c.stability = System.Math.Min(100, c.stability + 3);
                    w.AddEvent("festival", $"「{c.name}」举国欢庆丰年祭，鼓乐与篝火彻夜不息", c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
                }
                // —— v3：涌现理念采纳（文化丰盈时酝酿新思想 / 异邦思想传入） ——
                if ((c.ideas != null ? c.ideas.Count : 0) < 3 && c.culture > 60 && w.Rng() < 0.15)
                {
                    AdoptIdea(w, c);
                }
                // —— 政体演变：满足门槛且概率变革（革命式跃迁）——
                TryGovEvolve(w, c);
                // —— 危机：稳定度 < 18 → 动乱（叛乱分裂既有系统）/ 妥协变革 ——
                if (c.stability < 18 && w.Rng() < 0.25)
                {
                    if (c.pop > 25 && (c.knowledge ?? 0) > 30 && c.gov != 3)
                    {
                        // 启蒙革命：直接进入共和制（翻身求稳）
                        SetGov(w, c, 3, "revolution");
                    }
                    else
                    {
                        w.AddEvent("riot", $"「{c.name}」爆发了暴动——粮仓被劫，贵族的宅邸火光冲天", c.colorHex, CivCenterX(w, c), CivCenterY(w, c));
                        c.stability = System.Math.Min(40, c.stability + 12); // 动乱宣泄后回升
                        c.gold = System.Math.Max(0, (c.gold ?? 0) - 15);
                    }
                }
            }
        }

        /// 联盟主循环（每 300 tick ≈ 7.5 年）：对账 → 结盟 → 扩员 → 凝聚力 → 经济互助 → 种族关系漂移（engine L8193-8361）
        public static void AllianceTick(WbWorld w)
        {
            // —— ① 对账：灭亡成员除名 + 盟主继任 + 成员互战判叛 ——
            foreach (WbAlliance al in w.alliances.ToArray())
            {
                foreach (int m in al.members.ToArray())
                {
                    WbCiv c = CivAt(w, m);
                    if (c == null || !c.alive || c.pop <= 0) LeaveAlliance(w, m, "fallen");
                }
                if (!w.alliances.Contains(al)) continue;
                // 成员互战：挑起方（军国主义更高者）被判叛徒逐出
                for (int i = 0; i < al.members.Count; i++)
                {
                    for (int j = i + 1; j < al.members.Count; j++)
                    {
                        int x = al.members[i];
                        int y = al.members[j];
                        if (!AtWar(w, x, y)) continue;
                        WbCiv cx = CivAt(w, x);
                        WbCiv cy = CivAt(w, y);
                        int traitor = ((cx != null ? cx.militarism ?? 30 : 30) >= (cy != null ? cy.militarism ?? 30 : 30)) ? x : y;
                        LeaveAlliance(w, traitor, "betray");
                    }
                }
                if (!w.alliances.Contains(al)) continue;
                if (!al.members.Contains(al.leader))
                {
                    int best = al.members.Count > 0 ? al.members[0] : 0;
                    int bestPop = -1;
                    foreach (int m in al.members)
                    {
                        WbCiv c = CivAt(w, m);
                        if (c != null && c.pop > bestPop) { bestPop = c.pop; best = m; }
                    }
                    al.leader = best;
                    WbCiv bc = CivAt(w, best);
                    w.AddEvent("alliance", $"「{al.name}」盟主易位，「{(bc != null ? bc.name : "?")}」执掌盟务", al.colorHex);
                }
            }
            List<WbCiv> alive = new List<WbCiv>();
            foreach (WbCiv c in w.civs) if (c != null && c.alive && c.pop > 0) alive.Add(c);
            // —— ② 新联盟诞生：高关系 + 种族外交亲和 + 共同敌人（3 倍加成）+ 大灾同病相怜 ——
            if (w.alliances.Count < 4 && alive.Count >= 2)
            {
                List<WbCiv> free = new List<WbCiv>();
                foreach (WbCiv c in alive) if (!w.allianceOf.ContainsKey(c.id)) free.Add(c);
                for (int i = 0; i < free.Count && w.alliances.Count < 4; i++)
                {
                    for (int j = i + 1; j < free.Count; j++)
                    {
                        WbCiv ca = free[i];
                        WbCiv cb = free[j];
                        if (w.allianceOf.ContainsKey(ca.id) || w.allianceOf.ContainsKey(cb.id)) continue;
                        string key = WbWorld.PairKey(ca.id, cb.id);
                        if (!w.met.Contains(key)) continue;
                        double v;
                        double rv = w.rel.TryGetValue(key, out v) ? v : 0;
                        if (rv < 55 || AtWar(w, ca.id, cb.id)) continue;
                        double diploMul = 0.5 + (RaceDiploOf(ca.race) + RaceDiploOf(cb.race)) / 2;
                        // 共同敌人：两国正与同一第三国交战（同仇敌忾是结盟最强催化剂）
                        bool commonFoe = false;
                        foreach (WbWarData wd in w.warData.Values)
                        {
                            if ((AtWar(w, ca.id, wd.a) && AtWar(w, cb.id, wd.a)) || (AtWar(w, ca.id, wd.b) && AtWar(w, cb.id, wd.b))) { commonFoe = true; break; }
                        }
                        // 大灾同病相怜：近 250 tick 内世界刚遭大灾
                        bool catast = w.tickCount - w.lastCatastropheTick < 250;
                        double p = 0.05 * diploMul * (commonFoe ? 3.2 : 1) * (catast ? 1.6 : 1);
                        if (w.Rng() < p)
                        {
                            WbCiv leader = ca.pop >= cb.pop ? ca : cb;
                            WbCiv other = leader == ca ? cb : ca;
                            FormAlliance(w, leader, other);
                            break; // 本轮一个新联盟足矣（防一夜之间全球站队）
                        }
                    }
                }
            }
            // —— ③ 扩员：联盟邀请关系良好的无盟国（种族世仇审查在 JoinAlliance 内）——
            foreach (WbAlliance al in w.alliances.ToArray())
            {
                if (al.members.Count >= 5) continue;
                WbCiv leader = CivAt(w, al.leader);
                if (leader == null || !leader.alive) continue;
                foreach (WbCiv c in alive)
                {
                    if (al.members.Count >= 5) break;
                    if (w.allianceOf.ContainsKey(c.id) || al.members.Contains(c.id)) continue;
                    double v;
                    double rv = w.rel.TryGetValue(WbWorld.PairKey(al.leader, c.id), out v) ? v : 0;
                    if (rv < 45) continue;
                    // 至少一半现有成员对候选者非敌意
                    int okCount = 0;
                    foreach (int m in al.members)
                    {
                        double mv;
                        if ((w.rel.TryGetValue(WbWorld.PairKey(m, c.id), out mv) ? mv : 0) > 5) okCount++;
                    }
                    if (okCount < (al.members.Count + 1) / 2) continue;
                    double p = 0.05 * (0.5 + RaceDiploOf(c.race));
                    if (w.Rng() < p) JoinAlliance(w, al, c);
                }
            }
            // —— ④ 凝聚力结算：成员关系/共同敌人/天灾同仇/军人干政/贸易活跃/理念分歧 ——
            int dragons = 0;
            foreach (WbU u in w.units) if (u.dead == 0 && u.race == 9) dragons++; // R.DRAGON = 9
            foreach (WbAlliance al in w.alliances.ToArray())
            {
                List<WbCiv> ms = new List<WbCiv>();
                foreach (int m in al.members)
                {
                    WbCiv c = CivAt(w, m);
                    if (c != null && c.alive) ms.Add(c);
                }
                if (ms.Count < 2) continue;
                double dh = 0.5; // 存在即巩固
                double relSum = 0;
                int relN = 0;
                for (int i = 0; i < ms.Count; i++)
                {
                    for (int j = i + 1; j < ms.Count; j++)
                    {
                        double rv;
                        relSum += w.rel.TryGetValue(WbWorld.PairKey(ms[i].id, ms[j].id), out rv) ? rv : 0;
                        relN++;
                    }
                }
                double relAvg = relN > 0 ? relSum / relN : 50;
                if (relAvg < 30) dh -= 1.5; // 貌合神离
                // 共同敌人：≥2 成员与同一敌国交战 → 同仇敌忾
                bool common = false;
                foreach (WbWarData wd in w.warData.Values)
                {
                    int n = 0;
                    foreach (WbCiv m in ms) if (AtWar(w, m.id, wd.a) || AtWar(w, m.id, wd.b)) n++;
                    if (n >= 2) { common = true; break; }
                }
                if (common) dh += 0.8; // 同仇敌忾
                if (dragons > 0 || w.zombieOutbreakNoted) dh += 0.5; // 巨龙/亡灵天灾下的同仇敌忾
                double milSum = 0;
                foreach (WbCiv c in ms) milSum += c.militarism ?? 30;
                double milAvg = milSum / ms.Count;
                if (milAvg > 60) dh -= 0.8; // 军人干政：黩武盟友难约束
                // 盟内贸易活跃 → 商缘即盟缘
                int tradeN = 0;
                foreach (WbU u in w.units)
                {
                    if (u.dead != 0 || (u.caravan) <= 0) continue;
                    if (al.members.Contains(u.civ) && al.members.Contains(u.caravan)) tradeN++;
                }
                if (tradeN > 0) dh += 0.4;
                // 理念分歧：军功爵（mil>0.3）拉低 / 偃武（mil<-0.2）提振
                foreach (WbCiv m in ms)
                {
                    WbIdeaMods im = IdeaModsOf(w, m.id);
                    if (im.mil > 0.3) dh -= 0.15;
                    if (im.mil < -0.2) dh += 0.15;
                }
                al.cohesion = System.Math.Max(0, System.Math.Min(100, al.cohesion + dh));
                // —— 袍泽纽带：共战 3 次解锁阵营红利（盟内贸易再 +10%/研究扩散再 +12%）——
                if (al.warsTogether >= 3 && !al.bonded)
                {
                    al.bonded = true;
                    al.cohesion = System.Math.Min(100, al.cohesion + 8);
                    w.AddEvent("alliance", $"「{al.name}」的盟军在血与火中淬炼出袍泽纽带——盟内商路与学术交流全面深化", al.colorHex);
                    w.Toast($"「{al.name}」缔结袍泽纽带", "good");
                }
                if (al.cohesion < 25 && w.Rng() < 0.3)
                {
                    DissolveAlliance(w, al, $"「{al.name}」凝聚力涣散、貌合神离，盟约名存实亡");
                }
            }
            // —— ⑤ 经济互助：金库见底的成员获得富盟友雪中送炭 ——
            foreach (WbAlliance al in w.alliances.ToArray())
            {
                foreach (int m in al.members.ToArray())
                {
                    WbCiv c = CivAt(w, m);
                    if (c == null || !c.alive || (c.gold ?? 0) >= 30) continue;
                    WbCiv rich = null;
                    foreach (int x in al.members)
                    {
                        WbCiv xc = CivAt(w, x);
                        if (xc != null && xc.alive && (xc.gold ?? 0) > 200) { rich = xc; break; }
                    }
                    if (rich != null && w.Rng() < 0.4)
                    {
                        rich.gold = (rich.gold ?? 0) - 15;
                        c.gold = (c.gold ?? 0) + 15;
                        w.AddEvent("trade", $"「{rich.name}」雪中送炭：15 金驰援困顿的盟邦「{c.name}」", al.colorHex);
                    }
                }
            }
            // —— ⑥ 种族关系漂移：盟内跨种族交融 +0.15/轮（文化均 >80 额外 +0.1）；交战种族 -0.3/轮 ——
            foreach (WbAlliance al in w.alliances.ToArray())
            {
                for (int i = 0; i < al.members.Count; i++)
                {
                    for (int j = i + 1; j < al.members.Count; j++)
                    {
                        WbCiv cx = CivAt(w, al.members[i]);
                        WbCiv cy = CivAt(w, al.members[j]);
                        if (cx == null || !cx.alive || cy == null || !cy.alive || cx.race == cy.race) continue;
                        bool cultured = (cx.culture) > 80 && (cy.culture) > 80;
                        w.ShiftRaceRel(cx.race, cy.race, 0.15 + (cultured ? 0.1 : 0));
                    }
                }
            }
            List<WbWarData> wds = new List<WbWarData>(w.warData.Values);
            foreach (WbWarData wd in wds)
            {
                WbCiv ca = CivAt(w, wd.a);
                WbCiv cb = CivAt(w, wd.b);
                if (ca != null && ca.alive && cb != null && cb.alive && ca.race != cb.race) w.ShiftRaceRel(ca.race, cb.race, -0.3);
            }
        }

        /// 颁布文明旨意（文明自行达成，可能失败）（engine L7741-7760）
        public static WbDirective IssueDirective(WbWorld w, int civId, string kind, int param = 0, int? target = null)
        {
            WbCiv civ = CivAt(w, civId);
            if (civ == null || !civ.alive) return null;
            int activeN = 0;
            foreach (WbDirective x in w.directives) if (x.civ == civId && x.status == "active") activeN++;
            if (activeN >= 2) return null;
            if (ActiveDirective(w, civId, kind) != null) return null;
            int years = DirectiveYears.TryGetValue(kind, out int yy) ? yy : 0;
            int metaParam = DirectiveParam.TryGetValue(kind, out int pp) ? pp : 0;
            int p = param > 0 ? param : metaParam;
            WbDirective d = new WbDirective
            {
                id = w.dirSeq++, civ = civId, kind = kind, target = target,
                param = p, status = "active",
                startTick = w.tickCount,
                deadlineTick = years > 0 ? w.tickCount + years * YEAR_TICKS : 0,
                text = DescribeDirective(w, civ, kind, p, target),
            };
            w.directives.Add(d);
            ApplyDirectiveImpulse(w, d, civ);
            w.AddEvent("decree", d.text, civ.colorHex);
            w.Toast($"「{civ.name}」奉神谕：{DirectiveLabel[kind]}", "info");
            return d;
        }

        /// describeDirective（engine L7762-7780）—— 文案逐字保真（「同叢」= U+53E2 蓝本原文）
        public static string DescribeDirective(WbWorld w, WbCiv civ, string kind, int p, int? target)
        {
            int years = DirectiveYears.TryGetValue(kind, out int y) ? y : 0;
            string lim = years > 0 ? $"（{years} 年内）" : "";
            string tn = target != null ? (CivAt(w, target.Value)?.name ?? "?") : "";
            switch (kind)
            {
                case "annihilate": return $"「{civ.name}」奉旨灭国：「{tn}」必须被从大地上抹去{lim}";
                case "conquer": return $"「{civ.name}」奉旨攻城：王师须攻陷「{tn}」的王都{lim}";
                case "expand": return $"「{civ.name}」奉旨扩张：领土须达 {p} 格{lim}";
                case "wealth": return $"「{civ.name}」奉旨富国：国库须达 {p} 财富{lim}";
                case "wisdom": return $"「{civ.name}」奉旨启智：知识须达 {p}{lim}";
                case "populate": return $"「{civ.name}」奉旨繁衍：人口须达 {p}{lim}";
                case "legion": return $"「{civ.name}」奉旨建军：须同时保有 {p} 支现役军团{lim}";
                case "build": return $"「{civ.name}」奉旨营建：房屋须达 {p} 座{lim}";
                case "unify": return $"「{civ.name}」奉旨统一：须成为这个世界唯一的强权";
                case "mobilize": return $"「{civ.name}」奉旨总动员：全民皆兵，限期斩获 {p} 名敌军{lim}";
                case "alliance": return $"「{civ.name}」奉旨结盟：须与「{tn}」缔结盟好{lim}";
                case "temple": return $"「{civ.name}」奉旨立信：须建成一座神殿{lim}";
            }
            return null;
        }

        /// 旨意颁布瞬间的文明行为驱动（让文明"自己去达成"）（engine L7783-7835）
        public static void ApplyDirectiveImpulse(WbWorld w, WbDirective d, WbCiv civ)
        {
            switch (d.kind)
            {
                case "annihilate":
                    {
                        if (d.target == null) break;
                        // 圣战：神谕宣战（灭国战争——不死不休，攻方可能失败）
                        WbWarData wd = DeclareWar(w, d.civ, d.target.Value, "holy", true, 0, true);
                        if (wd != null) wd.giveUpAt = d.deadlineTick + 800;
                        TryFormArmy(w, civ, d.target.Value);
                        break;
                    }
                case "conquer":
                    {
                        if (d.target == null) break;
                        // 圣战：神谕宣战（目的=神谕战果 45 分，攻陷王都即达成）
                        DeclareWar(w, d.civ, d.target.Value, "holy", false, 45, true);
                        TryFormArmy(w, civ, d.target.Value);
                        break;
                    }
                case "mobilize":
                    {
                        civ.mobilizeUntil = w.tickCount + (d.deadlineTick - w.tickCount) * 0.8;
                        int armed = 0;
                        foreach (WbU u in w.units.ToArray())
                        {
                            if (u.dead != 0 || u.civ != civ.id) continue;
                            int job = u.job;
                            if (job == 0 || job == 1 || job == 5) { SetJob(w, u, 2); armed++; }
                        }
                        w.AddEvent("war", $"「{civ.name}」总动员！{armed} 名国民放下锄头拿起长剑", civ.colorHex);
                        break;
                    }
                case "legion":
                    {
                        civ.armyCd = 0;
                        TryFormArmy(w, civ, null);
                        if (CivAtWar(w, civ.id)) TryFormArmy(w, civ, null);
                        break;
                    }
                case "alliance":
                    {
                        if (d.target == null) break;
                        string key = WbWorld.PairKey(d.civ, d.target.Value);
                        w.met.Add(key);
                        double cur;
                        double cv = w.rel.TryGetValue(key, out cur) ? cur : 0;
                        if (cv < -20) MakePeace(w, d.civ, d.target.Value, $"「{civ.name}」奉神谕与「{CivAt(w, d.target.Value)?.name}」化干戈为玉帛", 40);
                        else w.rel[key] = System.Math.Max(cv, 45);
                        // —— 联盟系统：神谕直接促成真联盟（攻守同盟实体，非数值友谊）——
                        WbCiv t = CivAt(w, d.target.Value);
                        WbAlliance myAl = AllianceOfCiv(w, civ.id);
                        WbAlliance tAl = AllianceOfCiv(w, d.target.Value);
                        if (t != null && t.alive && myAl == null && tAl == null)
                            FormAlliance(w, civ.pop >= t.pop ? civ : t, civ.pop >= t.pop ? t : civ);
                        else if (t != null && t.alive && myAl != null && tAl == null)
                            JoinAlliance(w, myAl, t);
                        break;
                    }
                default:
                    break; // 扩张/富国/启智/人口/建城/统一/信仰：由各系统周期 hook 持续加成
            }
        }

        /// makePeace 哨兵（engine L7607-7663）—— settleFront/割地/阵营停战依赖（M-U3e 战争结算域）
        /// 位等价保障：golden CVT36 rel=10 ≥ -20 恒走 else 支路；本桩可达即爆 = 桩域外行为不可静默漂移
        public static void MakePeace(WbWorld w, int a, int b, string text, int postRel = 25)
        {
            throw new System.NotImplementedException("TODO(M-U3e): makePeace/settleFront 未翻译 —— golden 场景恒不可达（哨兵）");
        }

        /// 旨意进度评估（每 30 tick）（engine L7838-7852）
        public static void DirectiveTick(WbWorld w)
        {
            for (int i = w.directives.Count - 1; i >= 0; i--)
            {
                WbDirective d = w.directives[i];
                if (d.status != "active")
                {
                    // 已结算的旨意保留 200 tick 供 UI 展示后清理
                    if (d.endTick != null && w.tickCount - d.endTick.Value > 200) w.directives.RemoveAt(i);
                    continue;
                }
                WbCiv civ = CivAt(w, d.civ);
                if (civ == null || !civ.alive) { FinishDirective(w, d, "failed", $"「{(civ != null ? civ.name : "")}」覆灭，宏图化为泡影"); continue; }
                (bool done, string msg) r = EvalDirective(w, d, civ);
                if (r.done) { FinishDirective(w, d, "success", r.msg); continue; }
                if (d.deadlineTick > 0 && w.tickCount > d.deadlineTick) { FinishDirective(w, d, "failed", r.msg); continue; }
            }
        }

        /// 单条旨意条件评估：done=达成；msg=结算文案（engine L7855-7927）
        public static (bool done, string msg) EvalDirective(WbWorld w, WbDirective d, WbCiv civ)
        {
            switch (d.kind)
            {
                case "annihilate":
                    {
                        WbCiv t = d.target != null ? CivAt(w, d.target.Value) : null;
                        bool gone = t == null || !t.alive;
                        // 注：t=null 时蓝本模板渲染 "undefined"（JS 语义）——golden 恒 target != null，桩域外
                        return (gone, gone ? $"「{(t != null ? t.name : null)}」已被从大地上抹去" : $"期限已至，「{t.name}」仍在顽抗，灭国宏业功亏一篑");
                    }
                case "conquer":
                    {
                        WbCiv t = d.target != null ? CivAt(w, d.target.Value) : null;
                        if (t == null || !t.alive) return (true, $"「{(t != null ? t.name : null)}」已亡国，王都早已易主");
                        WbWarData wd;
                        double s = 0;
                        if (w.warData.TryGetValue(WbWorld.PairKey(d.civ, d.target.Value), out wd) && wd != null)
                            s = wd.a == d.civ ? wd.scoreA : wd.scoreB;
                        return (s >= 45, s >= 45 ? $"「{t.name}」的王都陷落了" : $"期限已至，「{t.name}」的王都仍屹立不倒");
                    }
                case "expand":
                    {
                        int tiles = 0;
                        foreach (int i in civ.tiles) if (w.owner[i] == civ.id) tiles++;
                        return (tiles >= d.param, tiles >= d.param ? $"领土已达 {tiles} 格" : $"期限已至，领土仅 {tiles} 格（目标 {d.param}）");
                    }
                case "wealth":
                    {
                        double g = civ.gold ?? 0; // M-U3f gold double 化（wealth 评估）
                        return (g >= d.param, g >= d.param ? $"国库充盈（{g} 财富）" : $"期限已至，国库仅 {g} 财富");
                    }
                case "wisdom":
                    {
                        double k = civ.knowledge ?? 0; // M-U3f knowledge double 化（wisdom 评估）
                        return (k >= d.param, k >= d.param ? $"知识渊博（{k}）" : $"期限已至，知识仅 {k}");
                    }
                case "populate":
                    {
                        int pp = System.Math.Max(0, civ.pop);
                        return (pp >= d.param, pp >= d.param ? $"人丁兴旺（{pp} 人口）" : $"期限已至，人口仅 {pp}");
                    }
                case "legion":
                    {
                        int n = 0;
                        foreach (WbArmy a in w.armies) if (a.civ == civ.id) n++;
                        return (n >= d.param, n >= d.param ? $"{n} 支军团同时现役" : $"期限已至，现役军团仅 {n} 支");
                    }
                case "build":
                    {
                        int h = civ.houses;
                        return (h >= d.param, h >= d.param ? $"城郭连绵（{h} 座房屋）" : $"期限已至，房屋仅 {h} 座");
                    }
                case "unify":
                    {
                        bool done = w.victoryCiv == civ.id;
                        return (done, done ? $"世界已归于「{civ.name}」的旌旗之下" : "统一大业未竟");
                    }
                case "mobilize":
                    {
                        int kc = d.killCount ?? 0;
                        return (kc >= d.param, kc >= d.param ? $"总动员战果辉煌（斩获 {kc}）" : $"动员期限已至，斩获仅 {kc}");
                    }
                case "alliance":
                    {
                        // 种族系统 v2 + 联盟系统：旨意的「缔结盟好」现在是真联盟（阵营实体）
                        WbCiv t = d.target != null ? CivAt(w, d.target.Value) : null;
                        WbCiv me = CivAt(w, d.civ);
                        if (t != null && me != null && t.alive && me.alive)
                        {
                            WbAlliance myAl = AllianceOfCiv(w, me.id);
                            WbAlliance tAl = AllianceOfCiv(w, t.id);
                            if (myAl != null && myAl.id == (tAl != null ? tAl.id : -1))
                                return (true, $"与「{t.name}」同叢「{myAl.name}」盟旗之下");
                            if (myAl == null && tAl == null && FormAlliance(w, me.pop >= t.pop ? me : t, me.pop >= t.pop ? t : me) != null)
                                return (true, $"与「{t.name}」缔结了攻守同盟");
                            if (myAl != null && tAl == null && JoinAlliance(w, myAl, t))
                                return (true, $"「{t.name}」加入了「{myAl.name}」");
                        }
                        double v = -100;
                        if (d.target != null)
                        {
                            double rv;
                            v = w.rel.TryGetValue(WbWorld.PairKey(d.civ, d.target.Value), out rv) ? rv : -100;
                        }
                        return (v >= 60, v >= 60
                            ? $"与「{CivAt(w, d.target ?? 0)?.name}」缔结盟好"
                            : $"期限已至，两国仍未同心（关系 {System.Math.Round(v)}）");
                    }
                case "temple":
                    {
                        int[] cnt;
                        int nn = 0;
                        if (w.civBuildCounts.TryGetValue(civ.id, out cnt) && cnt != null) nn = cnt[BUILD_KINDS.TEMPLE];
                        return (nn > 0, nn > 0 ? "神殿落成，钟声悠扬" : "期限已至，神殿仍是空中楼阁");
                    }
            }
            return (false, null);
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
                    civ.gold = System.Math.Max(0, (civ.gold ?? 0) - 60); // M-U3f 去 int 截断
                    foreach (WbArmy a in w.armies) if (a.civ == civ.id) a.morale = System.Math.Max(25, a.morale - 10);
                    w.AddEvent("decreeFail", $"神谕落空：「{civ.name}」——{msg}", civ.colorHex);
                    w.Toast($"「{civ.name}」未能达成{DirectiveLabel[d.kind]}", "danger");
                }
            }
        }

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

        // ================================================================
        // M-U3g 军团域（armyTick 状态机全链）
        // 蓝本: engine.ts tryFormArmy L6052-6140 / civRallyPoint L6143-6154 /
        //   pickWarEnemy L6157-6176 / nearestStandable L6179-6191 / formationPos L6194-6209 /
        //   armyTick L6212-6304 / electLeader L6307-6316 / armyRally L6318-6337 /
        //   armyMarchTarget L6340-6359 / armyMarch L6361-6471 / armyBattle L6473-6643 /
        //   armySiege L6645-6697 / armyRetreat L6699-6735 / declareClash L6738-6757 /
        //   nearestEnemyArmy L6760-6769 / nearestEnemyBuildingOf L6772-6782 /
        //   crossesWater L6785-6799 / armyEmbark L6802-6825 / armyDisembark L6828-6847 /
        //   routArmy L6850-6873 / disbandArmy L6876-6898 / frontPush L7270-7303 /
        //   frontSolidify L7306-7316 / leadAim L4351-4358 / isRangedMember L4361-4365 /
        //   castArrow L4368-4370 / castBullet L4374-4377 / castBeam L4381-4393 /
        //   launchMech L9551-9556 / setJob L1482 / addCorpse L2871 / wwCountKill L8690
        // 宿主协议: tickCount%5===0 → ArmyTick()（engine L2561）
        // ================================================================

        /// engine GameEngine.ARMY_MIN/MAX/SPEED/CD（L6044-6049）
        public const int ARMY_MIN = 6;
        public const int ARMY_MAX = 24;
        public const double ARMY_SPEED = 0.05;
        public const int ARMY_CD = 900;
        public const int CORPSE_MAX = 240;   // engine GameEngine.CORPSE_MAX（L2857）

        private static bool WalkableT(int t) => t != WbWorld.T_DEEP && t != WbWorld.T_WATER && t != WbWorld.T_MOUNTAIN && t != WbWorld.T_LAVA;  // constants.ts L73-76
        private static int IdxOf(int x, int y) => y * WbWorld.W + x;                                    // constants.ts 同款
        private static int TileX(int i) => i % WbWorld.W;                                               // engine L1548
        private static int TileY(int i) => i / WbWorld.W;                                               // engine L1549

        /// engine tryFormArmy L6052-6140（M-U3d 前半保留 + M-U3g 编成全量补全）
        public static WbArmy TryFormArmy(WbWorld w, WbCiv civ, int? targetCiv)
        {
            // WBB.touchMeta() —— army 列 wasm 镜像写点（civ 层 no-op）
            if (civ == null || !civ.alive || civ.pop < 10) return null;
            if (w.tickCount < (civ.armyCd ?? 0)) return null;
            int legionParam = 2;
            WbDirective leg = ActiveDirective(w, civ.id, "legion");
            if (leg != null) legionParam = System.Math.Max(3, leg.param);
            double aggr = RaceAggrOf(civ.race);
            int armyCap = (int)System.Math.Round((legionParam + TechModsOf(w, civ.id).armyMax + (GovOf(w, civ.id) == 4 ? 1 : 0)) * (0.75 + aggr * 0.5));
            armyCap = System.Math.Max(1, armyCap);
            int own = 0;
            foreach (WbArmy a in w.armies) if (a.civ == civ.id) own++;
            if (own >= armyCap) return null;
            // 目标敌国：指定或取交战中最近且尚有建筑者（L6058-6064）
            int enemyId = targetCiv ?? -1;
            if (enemyId < 0)
            {
                WbCiv e = PickWarEnemy(w, civ.id);
                if (e == null) return null;
                enemyId = e.id;
            }
            else
            {
                WbCiv ec0 = CivAt(w, enemyId);
                if (ec0 == null || !ec0.alive || !AtWar(w, civ.id, enemyId)) return null;
            }
            // 兵员：集结点 24 格内的无军团战士/弓手；不足编时回退全国征召（L6065-6080）
            (double rx, double ry)? centerN = CivRallyPoint(w, civ);
            if (centerN == null) return null;
            (double x, double y) center = centerN.Value;
            List<WbU> near = new List<WbU>();
            List<WbU> far = new List<WbU>();
            foreach (WbU u in w.units)
            {
                if (u.dead != 0 || u.civ != civ.id || u.boat != 0 || u.army != null) continue;
                int job = u.job;
                if (job != 2 && job != 3) continue;
                if (WbMath.FdHypot(u.x - center.x, u.y - center.y) <= 24) near.Add(u); else far.Add(u);
            }
            if (near.Count < ARMY_MIN)
            {
                far.Sort((a, b) => WbMath.FdHypot(a.x - center.x, a.y - center.y).CompareTo(WbMath.FdHypot(b.x - center.x, b.y - center.y)));
                int take = System.Math.Min(far.Count, ARMY_MAX - near.Count);
                for (int i = 0; i < take; i++) near.Add(far[i]);
            }
            // —— 战时紧急征召（levy）：兵源不足时征募集结点附近的平民执戈（L6081-6097）——
            if (near.Count < ARMY_MIN && CivAtWar(w, civ.id))
            {
                List<WbU> levy = new List<WbU>();
                foreach (WbU u in w.units)
                {
                    if (levy.Count >= ARMY_MIN + 4) break;
                    if (u.dead != 0 || u.civ != civ.id || u.boat != 0 || u.army != null) continue;
                    if (u.job != 0) continue;
                    if (WbMath.FdHypot(u.x - center.x, u.y - center.y) > 20) continue;
                    levy.Add(u);
                }
                foreach (WbU u in levy) SetJob(w, u, 2);
                if (levy.Count > 0)
                {
                    w.AddEvent("army", $"「{civ.name}」敲响征兵鼓——{levy.Count} 名平民放下锄头拿起长矛", civ.colorHex, center.x, center.y);
                }
                near.AddRange(levy);
            }
            List<WbU> pool = near;
            if (pool.Count < ARMY_MIN) return null;
            // 就近入列（集结快），上限 ARMY_MAX（L6100-6102）
            pool.Sort((a, b) => WbMath.FdHypot(a.x - center.x, a.y - center.y).CompareTo(WbMath.FdHypot(b.x - center.x, b.y - center.y)));
            int memberN = System.Math.Min(pool.Count, ARMY_MAX);
            List<WbU> members = pool.GetRange(0, memberN);
            // 指挥官 = 击杀最多者（宿将执旗；严格大于——平局保首见，L6103-6105）
            WbU leader = members[0];
            foreach (WbU m in members) if (m.kills > leader.kills) leader = m;
            int seq = (w.armyNameSeq.TryGetValue(civ.id, out int sv) ? sv : 0) + 1;
            w.armyNameSeq[civ.id] = seq;
            int archerN = 0;
            foreach (WbU m in members) if (m.job == 3) archerN++;
            double archerRatio = (double)archerN / members.Count;
            string name = WbNames.ArmyNameByJobs(w, seq, archerRatio);   // rng ×2（pre/mid）
            // 军旗落点 = 兵员质心（就近可站立地块，L6110-6114）
            double sx = 0, sy = 0;
            foreach (WbU m in members) { sx += m.x; sy += m.y; }
            (int fx, int fy) flag = NearestStandable(w, (int)System.Math.Round(sx / members.Count), (int)System.Math.Round(sy / members.Count));
            WbArmy a2 = new WbArmy
            {
                id = w.armySeq++, civ = civ.id, name = name,
                members = members.ConvertAll((m) => m.id), leaderId = leader.id,
                x = flag.fx, y = flag.fy, tx = flag.fx, ty = flag.fy,
                state = "rally", formedTick = w.tickCount, size0 = members.Count,
                morale = System.Math.Min(95, 58 + leader.kills * 3),
                targetCiv = enemyId, rot = w.Rng() * System.Math.PI * 2,
                kills = 0, losses = 0, evalTick = w.tickCount,
            };
            foreach (WbU m in members) m.army = a2.id;
            // —— 组建军费（Task 34 经济闭环）：征召集结耗资；国库不足时仓促成军士气受挫（L6125-6135）——
            {
                int musterCost = 6 + (int)System.Math.Round(members.Count * 0.35);
                if ((civ.gold ?? 0) >= musterCost)
                {
                    civ.gold = (civ.gold ?? 0) - musterCost;
                }
                else
                {
                    civ.gold = 0;
                    a2.morale = System.Math.Max(20, a2.morale - 12);
                    w.AddEvent("army", $"「{civ.name}」国库告罄，{name}仓促成军——粮草不济，士气低落", civ.colorHex, a2.x, a2.y);
                }
            }
            w.armies.Add(a2);
            w.AddEvent("army", $"「{civ.name}」集结了{name}（{members.Count} 人，宿将 {leader.name} 执旗）", civ.colorHex, a2.x, a2.y);
            w.Toast($"「{civ.name}」的{name}集结完毕", "war");
            return a2;
        }

        /// engine civRallyPoint L6143-6154 —— 军团集结点：王都优先，回退国民质心
        public static (double x, double y)? CivRallyPoint(WbWorld w, WbCiv civ)
        {
            if (civ.capital >= 0) return (TileX(civ.capital), TileY(civ.capital));
            double sx = 0, sy = 0;
            int n = 0;
            foreach (WbU u in w.units)
            {
                if (u.dead != 0 || u.civ != civ.id) continue;
                sx += u.x; sy += u.y; n++;
            }
            if (n == 0) return null;
            return (sx / n, sy / n);
        }

        /// engine pickWarEnemy L6157-6176 —— 交战国中距本国最近且尚有建筑的敌国
        public static WbCiv PickWarEnemy(WbWorld w, int civId)
        {
            WbCiv me = CivAt(w, civId);
            if (me == null || !me.alive) return null;
            double px = me.capital >= 0 ? TileX(me.capital) : WbWorld.W / 2.0;
            double py = me.capital >= 0 ? TileY(me.capital) : WbWorld.H / 2.0;
            WbCiv best = null;
            double bestD = double.PositiveInfinity;
            foreach (WbCiv o in w.civs)
            {
                if (o == null || !o.alive || o.id == civId || !AtWar(w, civId, o.id)) continue;
                if (!w.civBuildCounts.TryGetValue(o.id, out int[] cnt) || cnt == null) continue;
                bool hasB = false;
                for (int k = 1; k < cnt.Length; k++) if (cnt[k] > 0) { hasB = true; break; }
                if (!hasB) continue;
                double d = o.capital >= 0 ? WbMath.FdHypot(TileX(o.capital) - px, TileY(o.capital) - py) : 100;
                if (d < bestD) { bestD = d; best = o; }
            }
            return best;
        }

        /// engine nearestStandable L6179-6191 —— 最近可站立地块（军旗落点/登陆用；只扫环）
        public static (int x, int y) NearestStandable(WbWorld w, int x, int y)
        {
            for (int r = 0; r < 6; r++)
            {
                for (int dy = -r; dy <= r; dy++)
                {
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (System.Math.Abs(dx) != r && System.Math.Abs(dy) != r) continue; // 只扫环
                        int xx = System.Math.Max(0, System.Math.Min(WbWorld.W - 1, x + dx));
                        int yy = System.Math.Max(0, System.Math.Min(WbWorld.H - 1, y + dy));
                        if (WalkableT(w.terrain[IdxOf(xx, yy)])) return (xx, yy);
                    }
                }
            }
            return (x, y);
        }

        /// engine formationPos L6194-6209 —— 编队阵位：行军=纵队（3 列拖后），其余=环形方阵（指挥官贴旗）
        public static (double x, double y) FormationPos(WbWorld w, WbArmy a, int k)
        {
            int n = a.members.Count;
            if (a.state == "march" || a.state == "retreat")
            {
                double dirAng = WbMath.FdAtan2(a.ty - a.y, a.tx - a.x);
                int per = 3;
                int row = k / per;
                int col = (k % per) - 1;
                double back = 0.9 + row * 1.15;
                double px = -WbMath.FdCos(dirAng) * back + WbMath.FdCos(dirAng + System.Math.PI / 2) * col * 1.0;
                double py = -WbMath.FdSin(dirAng) * back + WbMath.FdSin(dirAng + System.Math.PI / 2) * col * 1.0;
                return (System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, a.x + px)), System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, a.y + py)));
            }
            double ang = (k / (double)System.Math.Max(1, n)) * System.Math.PI * 2 + a.rot;
            double r = k == 0 ? 0.7 : 1.5 + (k % 3) * 0.55;
            return (System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, a.x + WbMath.FdCos(ang) * r)), System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, a.y + WbMath.FdSin(ang) * r)));
        }

        /// engine armyTick L6212-6304 —— 军团状态机主循环（每 5 tick；armies 倒序迭代 + 实时 state 判定）
        public static void ArmyTick(WbWorld w)
        {
            // WBB.touchMeta() —— army/boat meta 列收口（civ 层 no-op）
            // 战时文明周期性组建军团（L6215-6220）
            if (w.tickCount % 60 == 0)
            {
                foreach (WbCiv civ in w.civs)
                {
                    if (civ == null || !civ.alive || !CivAtWar(w, civ.id)) continue;
                    if (w.Rng() < 0.5) TryFormArmy(w, civ, null);
                }
            }
            for (int i = w.armies.Count - 1; i >= 0; i--)
            {
                WbArmy a = w.armies[i];
                WbCiv civ = CivAt(w, a.civ);
                if (civ == null || !civ.alive) { DisbandArmy(w, a, true); continue; }
                // —— 成员清点：死亡/离散者出列，士气折损（L6225-6236）——
                bool leaderDead = false;
                for (int k = a.members.Count - 1; k >= 0; k--)
                {
                    WbU u = w.unitById.TryGetValue(a.members[k], out WbU uu) ? uu : null;
                    if (u == null || u.dead != 0 || u.civ != a.civ || !object.Equals(u.army, (object)a.id))
                    {
                        int uid = a.members[k];
                        a.members.RemoveAt(k);
                        a.losses++;
                        a.morale -= 4;
                        if (uid == a.leaderId) leaderDead = true;
                    }
                }
                if (leaderDead) ElectLeader(w, a);
                // 残部不足 → 解散（L6238-6239）
                if (a.members.Count < 4) { DisbandArmy(w, a, true); continue; }
                // —— 补给线：深入敌境的军团士气缓降（机械化军团自持补给，半径更大，L6240-6258）——
                if (a.state != "retreat" && w.tickCount % 25 == 0)
                {
                    bool mech = TechModsOf(w, a.civ).mech > 0;
                    int limit = mech ? 26 : 15;
                    double near = double.PositiveInfinity;
                    foreach (WbBuilding b in w.buildings)
                    {
                        if (b.civ != a.civ) continue;
                        double d = WbMath.FdHypot(b.x - a.x, b.y - a.y);
                        if (d < near) near = d;
                        if (near < limit) break;
                    }
                    if (near > limit)
                    {
                        a.morale -= 1.2;
                        if (!a.supplyWarned && a.morale < 72)
                        {
                            a.supplyWarned = true;
                            w.AddEvent("army", $"{a.name} 深入敌境，补给线吃紧——士卒疲惫，士气日渐消磨", civ.colorHex, a.x, a.y);
                        }
                    }
                    else if (a.supplyWarned) a.supplyWarned = false;
                }
                // —— 溃退追击（Task 36）：溃退敌军进入我军锋线 6 格 → 追亡逐北（L6259-6282）——
                if (a.state != "retreat" && w.tickCount % 10 == 0)
                {
                    foreach (WbArmy o in w.armies)
                    {
                        if (o == a || o.civ == a.civ || o.state != "retreat" || !AtWar(w, a.civ, o.civ)) continue;
                        if (WbMath.FdHypot(o.x - a.x, o.y - a.y) > 6) continue;
                        if (w.Rng() < 0.4 && o.members.Count > 0)
                        {
                            WbU victim = w.unitById.TryGetValue(o.members[(int)(w.Rng() * o.members.Count)], out WbU vv) ? vv : null;
                            if (victim != null && victim.dead == 0)
                            {
                                victim.hp = 0;
                                victim.dead = 1;
                                AddCorpse(w, victim.x, victim.y, false, false);
                                WwCountKill(w, victim);
                                o.losses++;
                                o.morale = System.Math.Max(5, o.morale - 3);
                                WbWarData wd = w.warData.TryGetValue(WbWorld.PairKey(a.civ, o.civ), out WbWarData wd0) ? wd0 : null;
                                if (wd != null)
                                {
                                    if (a.civ == wd.a) { wd.casB++; wd.scoreA += 0.5; } else { wd.casA++; wd.scoreB += 0.5; }
                                }
                                if (w.Rng() < 0.12) w.AddEvent("clash", $"{a.name} 追亡逐北，溃军沿途折损（{o.name} 尚存 {o.members.Count} 人）", civ.colorHex, o.x, o.y);
                            }
                        }
                    }
                }
                // 士气崩塌 → 溃退（会战大失败的收场；方阵战术科技让军队更顽强，L6283-6285）
                double moraleFloor = 35 + TechModsOf(w, a.civ).morale;
                if (a.morale < moraleFloor && a.state != "retreat") { RoutArmy(w, a, false, false); continue; }
                // 战争结束/敌国已灭 → 凯旋归国（L6286-6291）
                WbCiv enemy = CivAt(w, a.targetCiv);
                if (a.state != "retreat" && ((enemy == null || !enemy.alive) || !AtWar(w, a.civ, a.targetCiv)))
                {
                    RoutArmy(w, a, true, false);
                    continue;
                }
                switch (a.state)
                {
                    case "rally": ArmyRally(w, a, civ); break;
                    case "march": ArmyMarch(w, a, civ); break;
                    case "battle": ArmyBattle(w, a, civ); break;
                    case "siege": ArmySiege(w, a, civ); break;
                    case "retreat": ArmyRetreat(w, a, civ); break;
                }
                // 非战斗状态缓慢回士气（整编/归途；战术/军团科技加速重整，L6299-6300）
                if (a.state == "rally" || a.state == "retreat") a.morale = System.Math.Min(100, a.morale + 0.4 + TechModsOf(w, a.civ).morale * 0.015);
                // 伤亡过半 → 士气持续下滑（惨重代价，L6301-6302）
                if (a.members.Count < a.size0 * 0.5 && (a.state == "march" || a.state == "siege")) a.morale -= 0.4;
            }
        }

        /// engine electLeader L6307-6316 —— 选举新指挥官（旧将阵亡；kills 最多者接旗）
        public static void ElectLeader(WbWorld w, WbArmy a)
        {
            WbU leader = null;
            foreach (int id in a.members)
            {
                WbU u = w.unitById.TryGetValue(id, out WbU uu) ? uu : null;
                if (u != null && (leader == null || u.kills > leader.kills)) leader = u;
            }
            a.leaderId = leader != null ? leader.id : -1;
            a.morale = System.Math.Max(20, a.morale - 8); // 主将阵亡军心动摇
            if (leader != null) w.AddEvent("army", $"{a.name} 主将阵亡，{leader.name} 接过军旗", CivAt(w, a.civ)?.colorHex, a.x, a.y);
        }

        /// engine armyRally L6318-6337 —— 集结：成员就位率 + 等待时长 → 誓师出征
        public static void ArmyRally(WbWorld w, WbArmy a, WbCiv civ)
        {
            int gathered = 0;
            for (int k = 0; k < a.members.Count; k++)
            {
                WbU u = w.unitById.TryGetValue(a.members[k], out WbU uu) ? uu : null;
                if (u == null) continue;
                (double fx, double fy) fp = FormationPos(w, a, k);
                u.tx = fp.fx; u.ty = fp.fy;
                if (WbMath.FdHypot(u.x - a.x, u.y - a.y) < 3.5) gathered++;
            }
            double ratio = (double)gathered / a.members.Count;
            long waited = w.tickCount - a.formedTick;
            if ((ratio >= 0.8 && waited > 40) || waited > 300)
            {
                (double x, double y)? tgt = ArmyMarchTarget(w, a);
                if (tgt != null)
                {
                    a.tx = tgt.Value.x; a.ty = tgt.Value.y;
                    a.state = "march";
                    w.AddEvent("army", $"{a.name} 誓师出征（{a.members.Count} 人）", civ.colorHex, a.x, a.y);
                }
            }
        }

        /// engine armyMarchTarget L6340-6359 —— 行军目标：敌国王都优先 → 最近敌建筑 → 敌土质心
        public static (double x, double y)? ArmyMarchTarget(WbWorld w, WbArmy a)
        {
            WbCiv e = CivAt(w, a.targetCiv);
            if (e == null || !e.alive) return null;
            if (e.capital >= 0) return (TileX(e.capital), TileY(e.capital));
            WbBuilding best = null;
            double bestD = double.PositiveInfinity;
            foreach (WbBuilding b in w.buildings)
            {
                if (b.civ != a.targetCiv) continue;
                double d = WbMath.FdHypot(b.x - a.x, b.y - a.y);
                if (d < bestD) { bestD = d; best = b; }
            }
            if (best != null) return (best.x, best.y);
            // —— 终极回退：敌境已无建筑 → 敌国剩余领土质心（修复 rally 卡死，L6352-6357）——
            if (e.tiles.Count > 0)
            {
                double sx = 0, sy = 0;
                foreach (int t in e.tiles) { sx += t % WbWorld.W; sy += (t / WbWorld.W) | 0; }
                return (sx / e.tiles.Count, sy / e.tiles.Count);
            }
            return null;
        }

        /// engine armyMarch L6361-6471 —— 行军：伏击标记/合击/咬定溃军/会战/登陆/渗透/军旗推进/编队跟随
        public static void ArmyMarch(WbWorld w, WbArmy a, WbCiv civ)
        {
            // WBB.touchMeta() —— 行军涉水登船 boat 列收口（civ 层 no-op）
            // —— 林间伏击：行军于森林的军团进入潜伏（接战首击士气加成，L6363-6365）——
            int hereTile = w.terrain[IdxOf((int)System.Math.Floor(a.x), (int)System.Math.Floor(a.y))];
            a.ambush = hereTile == WbWorld.T_FOREST;
            // —— 合击战术（Task 35）：附近友军已与敌接战 → 就近压上夹击（L6366-6375）——
            foreach (WbArmy o in w.armies)
            {
                if (o.civ != a.civ || o.id == a.id || o.state != "battle" || o.clashWith == null) continue;
                WbArmy f2 = null;
                foreach (WbArmy x in w.armies) if (x.id == o.clashWith.Value) { f2 = x; break; }
                if (f2 == null || !AtWar(w, a.civ, f2.civ)) continue;
                if (WbMath.FdHypot(f2.x - a.x, f2.y - a.y) < 11)
                {
                    DeclareClash(w, a, f2, civ);
                    return;
                }
            }
            // —— 溃退追击（Task 36）：优先咬住 10 格内的溃退敌军（追击不接战，L6376-6392）——
            bool chasing = false;
            {
                WbArmy routedFoe = null;
                double routedD = 10;
                foreach (WbArmy o in w.armies)
                {
                    if (o.civ == a.civ || o.state != "retreat" || !AtWar(w, a.civ, o.civ)) continue;
                    double dd = WbMath.FdHypot(o.x - a.x, o.y - a.y);
                    if (dd < routedD) { routedD = dd; routedFoe = o; }
                }
                if (routedFoe != null && !a.naval)
                {
                    chasing = true;
                    a.tx = routedFoe.x;
                    a.ty = routedFoe.y;
                }
            }
            // —— 敌军团逼近 → 会战（战术 AI 深劣势则战术转移，L6393-6403）——
            WbArmy foe = NearestEnemyArmy(w, a);
            if (foe != null && foe.state != "retreat" && WbMath.FdHypot(foe.x - a.x, foe.y - a.y) < 8)
            {
                bool ai = TechModsOf(w, a.civ).ai > 0;
                if (ai && foe.members.Count > a.members.Count * 1.8 && a.morale < 60)
                {
                    RoutArmy(w, a, false, true); // 战术智能：避其锋芒，后撤再战
                    return;
                }
                DeclareClash(w, a, foe, civ);
                return;
            }
            double d = WbMath.FdHypot(a.tx - a.x, a.ty - a.y);
            // —— 舰队抵达敌岸 → 登陆（L6405-6412）——
            if (a.naval)
            {
                bool onLand = WalkableT(w.terrain[IdxOf((int)System.Math.Floor(a.x), (int)System.Math.Floor(a.y))]);
                if (onLand && d < 8) { ArmyDisembark(w, a); a.state = "siege"; a.evalTick = w.tickCount; return; }
            }
            else if (d < 3 && !chasing)
            {
                a.state = "siege"; a.evalTick = w.tickCount;
                return;
            }
            // —— 行军渗透：途经敌境留下占领脚印（弱功率；战线随军推进，L6413-6417）——
            if (!a.naval && w.tickCount - (a.marchPushTick ?? 0) > 25)
            {
                a.marchPushTick = w.tickCount;
                FrontPush(w, a, 2, 3);
            }

            // —— 军旗推进（步频 × 士气加成 × 机械化履带加速 × 追击提速；8 向贪心绕障，L6419-6446）——
            double step = ARMY_SPEED * (0.75 + a.morale / 200) * (TechModsOf(w, a.civ).mech > 0 ? 1.4 : 1) * (chasing ? 1.5 : 1);
            if (a.naval)
            {
                a.x = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, a.x + ((a.tx - a.x) / d) * step));
                a.y = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, a.y + ((a.ty - a.y) / d) * step));
            }
            else
            {
                double bas = WbMath.FdAtan2(a.ty - a.y, a.tx - a.x);
                bool moved = false;
                double[] offs = { 0, 0.45, -0.45, 0.95, -0.95, 1.7, -1.7, System.Math.PI };
                foreach (double off in offs)
                {
                    double ang2 = bas + off;
                    double nx = a.x + WbMath.FdCos(ang2) * step;
                    double ny = a.y + WbMath.FdSin(ang2) * step;
                    if (nx < 1 || ny < 1 || nx > WbWorld.W - 2 || ny > WbWorld.H - 2) continue;
                    if (!WalkableT(w.terrain[IdxOf((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))])) continue;
                    a.x = nx; a.y = ny;
                    moved = true;
                    break;
                }
                if (!moved)
                {
                    // 四周全堵：直行前方是水且跨海 → 舰队渡海；否则原地等待（下轮重试，L6437-6445）
                    int ax = (int)System.Math.Floor(a.x + WbMath.FdCos(bas) * 1.5);
                    int ay = (int)System.Math.Floor(a.y + WbMath.FdSin(bas) * 1.5);
                    if (ax >= 0 && ay >= 0 && ax < WbWorld.W && ay < WbWorld.H && WbWorld.IsWater(w.terrain[IdxOf(ax, ay)]) && CrossesWater(w, a.x, a.y, a.tx, a.ty))
                    {
                        ArmyEmbark(w, a);
                        return;
                    }
                }
            }
            // —— 成员跟随编队（行军纵队阵位，L6447-6470）——
            for (int k = 0; k < a.members.Count; k++)
            {
                WbU u = w.unitById.TryGetValue(a.members[k], out WbU uu) ? uu : null;
                if (u == null) continue;
                (double fx, double fy) fp = FormationPos(w, a, k);
                u.tx = fp.fx; u.ty = fp.fy;
                if (a.naval)
                {
                    bool inWater = WbWorld.IsWater(w.terrain[IdxOf((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))]);
                    if (u.boat == 0 && inWater) { u.boat = 1; u.boatTTL = 1600; }
                    if (u.boat != 0)
                    {
                        u.boatTTL = System.Math.Max(u.boatTTL, 200); // 舰队补给：不海难
                        // 落后的旱鸭子跳上旗舰（距旗 < 3 直接登船）
                        if (inWater == false && WbMath.FdHypot(u.x - a.x, u.y - a.y) < 3)
                        {
                            (double wx, double wy)? ww = FindWaterNear(w, a.x, a.y, 3);
                            if (ww != null) { u.boat = 1; u.boatTTL = 1600; u.x = ww.Value.wx; u.y = ww.Value.wy; u.lx = ww.Value.wx; u.ly = ww.Value.wy; }
                        }
                    }
                }
                else if (u.boat != 0 && WbMath.FdHypot(u.x - a.x, u.y - a.y) < 4)
                {
                    // 已转陆路但仍有成员漂着 → 靠岸归队
                    u.boat = 0; u.boatTTL = 0;
                    (int sx, int sy) spos = NearestStandable(w, (int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y));
                    u.x = spos.sx; u.y = spos.sy; u.lx = spos.sx; u.ly = spos.sy;
                }
            }
        }

        /// engine armyBattle L6473-6643 —— 会战：落幕/崩溃/机炮/战线阵列/齐射/烈度/包围/增援/战术撤退
        public static void ArmyBattle(WbWorld w, WbArmy a, WbCiv civ)
        {
            WbArmy foe = a.clashWith != null ? w.armies.Find((x) => x.id == a.clashWith.Value) : null;
            // —— 会战结束：对手溃散/解散/脱离（L6475-6491）——
            if (foe == null || !w.armies.Contains(foe) || foe.state != "battle" || WbMath.FdHypot(foe.x - a.x, foe.y - a.y) > 12)
            {
                bool won = foe != null ? (foe.state == "retreat" || a.members.Count >= foe.members.Count) : true;
                a.morale = System.Math.Min(100, a.morale + (won ? 12 : 2));
                WbWarData wd = foe != null ? (w.warData.TryGetValue(WbWorld.PairKey(a.civ, foe.civ), out WbWarData wd1) ? wd1 : null) : null;
                if (wd != null && won)
                {
                    if (a.civ == wd.a) wd.scoreA += 10; else wd.scoreB += 10;
                }
                if (w.tickCount - (a.battleSince ?? w.tickCount) > 50)
                {
                    w.AddEvent("clash", $"{a.name} {(won ? $"击溃了敌军（斩获 {a.kills}）" : "且战且退")}，会战落幕", civ.colorHex, a.x, a.y);
                }
                a.clashWith = null;
                a.battleSince = null;
                if (won) a.state = "march";
                else RoutArmy(w, a, false, false); // 败方溃退（guard 去重）
                return;
            }
            WbTechMods tmA = TechModsOf(w, a.civ);
            bool ai2 = tmA.ai > 0;
            bool mech = tmA.mech > 0;
            // —— 伤亡崩溃：阵亡过半 → 战线崩溃全线溃退（L6495-6506）——
            int bs0 = a.battleSize0 ?? a.members.Count;
            if (a.members.Count <= System.Math.Max(3, bs0 / 2))
            {
                w.AddEvent("clash", $"{a.name} 伤亡过半，战线崩溃——残部溃散", civ.colorHex, a.x, a.y);
                WbWarData wd0 = w.warData.TryGetValue(WbWorld.PairKey(a.civ, foe.civ), out WbWarData wd2) ? wd2 : null;
                if (wd0 != null)
                {
                    if (foe.civ == wd0.a) wd0.scoreA += 8;
                    else wd0.scoreB += 8; // 歼灭战果：会战胜利直接折算战争分数
                }
                RoutArmy(w, a, false, false);
                return;
            }
            // —— 机械化军团：机炮周期扫射敌军团阵地（超视距火力压制，L6507-6523）——
            if (mech && w.tickCount % 20 == 0)
            {
                int hits = 0;
                foreach (int id in foe.members)
                {
                    WbU u = w.unitById.TryGetValue(id, out WbU uu) ? uu : null;
                    if (u == null || u.dead != 0) continue;
                    if (WbMath.FdHypot(u.x - foe.x, u.y - foe.y) < 3.5)
                    {
                        u.hp -= 16 + w.Rng() * 10;
                        u.hurt = 20;
                        hits++;
                        if (u.hp <= 0) { u.dead = 1; WwCountKill(w, u); }
                    }
                }
                if (hits > 0)
                {
                    double fx = foe.x + w.Rng() * 2 - 1, fy = foe.y + w.Rng() * 2 - 1;
                    WbFx e = w.Fx("bullet", fx, fy, 5, 0, a.civ);
                    if (e != null) { e.x0 = a.x; e.y0 = a.y; }
                }
            }
            // —— 战线阵列（Task 35）：近战前排压向敌旗 2.4 格列横队，弓手后排距敌 5.5 格展开（L6524-6558）——
            double fAng = WbMath.FdAtan2(foe.y - a.y, foe.x - a.x);
            double ppx = -WbMath.FdSin(fAng);
            double ppy = WbMath.FdCos(fAng);
            List<WbU> foes = new List<WbU>();
            foreach (int id in foe.members)
            {
                WbU u = w.unitById.TryGetValue(id, out WbU uu) ? uu : null;
                if (u != null && u.dead == 0) foes.Add(u);
            }
            int mCount = 0, rCount = 0;
            bool[] rangedFlags = new bool[a.members.Count];
            for (int k = 0; k < a.members.Count; k++)
            {
                WbU u = w.unitById.TryGetValue(a.members[k], out WbU uu) ? uu : null;
                bool r = u != null ? IsRangedMember(w, u) : false;
                rangedFlags[k] = r;
                if (r) rCount++;
                else mCount++;
            }
            int mi = 0, ri = 0;
            for (int k = 0; k < a.members.Count; k++)
            {
                WbU u = w.unitById.TryGetValue(a.members[k], out WbU uu) ? uu : null;
                if (u == null) continue;
                if (rangedFlags[k])
                {
                    // 远程后排：本旗后方 2.6 格列队（避开近战线，持续输出）
                    double off = (ri - (rCount - 1) / 2.0) * 1.1;
                    ri++;
                    u.tx = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, a.x - WbMath.FdCos(fAng) * 2.6 + ppx * off));
                    u.ty = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, a.y - WbMath.FdSin(fAng) * 2.6 + ppy * off));
                }
                else
                {
                    // 近战前排：压向敌旗 2.4 格接触线（横队展开）
                    double off = (mi - (mCount - 1) / 2.0) * 1.05;
                    mi++;
                    u.tx = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, foe.x - WbMath.FdCos(fAng) * 2.4 + ppx * off));
                    u.ty = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, foe.y - WbMath.FdSin(fAng) * 2.4 + ppy * off));
                }
            }
            // —— 齐射（Task 35）：后排按口令集火敌阵（弹道预测 + 同时开火，L6559-6585）——
            if (foes.Count > 0 && w.tickCount % 15 == 0)
            {
                int volleyN = 0;
                for (int k = 0; k < a.members.Count; k++)
                {
                    WbU u = w.unitById.TryGetValue(a.members[k], out WbU uu) ? uu : null;
                    if (u == null || u.dead != 0 || u.cd > 0 || !rangedFlags[k]) continue;
                    string wepKey = u.wep as string;
                    bool gun = wepKey == "musket" || wepKey == "rifle";
                    bool beam = wepKey == "laser_rifle";
                    WbU t = foes[(int)(w.Rng() * foes.Count)];
                    (double ax, double ay) aim = LeadAim(w, t, beam ? 8 : gun ? 5 : 12);
                    double mul = IsCivRace(u.race) && a.civ >= 0 ? tmA.archer : 1;
                    if (beam) CastBeam(w, u, aim.ax, aim.ay, u.dmg * 0.75 * mul);
                    else if (gun) CastBullet(w, u, aim.ax, aim.ay, u.dmg * mul);
                    else CastArrow(w, u, aim.ax, aim.ay, u.dmg * mul);
                    u.cd = beam ? 12 : gun ? 15 : 18;
                    u.atk = 10;
                    volleyN++;
                }
                if (volleyN >= 4)
                {
                    // —— 齐射震慑（Task 36）：箭如飞蝗不只是伤害（L6577-6584）——
                    foe.morale = System.Math.Max(5, foe.morale - 1.5);
                    if (w.tickCount - w.lastVolleyEventTick > 200 && w.Rng() < 0.25)
                    {
                        w.lastVolleyEventTick = w.tickCount;
                        w.AddEvent("clash", $"{a.name} 一声令下，{volleyN} 名弓手齐射——箭如飞蝗", civ.colorHex, a.x, a.y);
                    }
                }
            }
            // —— 会战烈度：兵力对比消耗士气 + 包围/增援/战术撤退（L6586-6642）——
            if (w.tickCount - a.evalTick > 25)
            {
                a.evalTick = w.tickCount;
                double myPow = a.members.Count * (1 + a.morale / 100);
                double foePow = foe.members.Count * (1 + foe.morale / 100);
                a.morale += myPow > foePow ? 2 : -4;
                // —— 伤亡-士气耦合（Task 36）——
                int bs0c = a.battleSize0 ?? a.members.Count;
                double frac = a.members.Count / (double)System.Math.Max(1, bs0c);
                if (frac < 0.8) a.morale -= (0.8 - frac) * 4;
                // —— 包围判定：≥2 支己方军团压向敌旗 → 被围方士气加速崩落 ——
                int surrounders = 0;
                foreach (WbArmy o in w.armies)
                {
                    if (o.civ != a.civ || o.state == "retreat" || o.id == a.id) continue;
                    if (WbMath.FdHypot(o.x - foe.x, o.y - foe.y) < 14) surrounders++;
                }
                if (surrounders >= 1 && WbMath.FdHypot(a.x - foe.x, a.y - foe.y) < 8)
                {
                    foe.morale = System.Math.Max(5, foe.morale - 3); // 身陷重围：士气持续崩落
                    a.morale = System.Math.Min(100, a.morale + 1);
                    if (w.Rng() < 0.06)
                    {
                        w.AddEvent("clash", $"{a.name}{(surrounders >= 2 ? $" 与 {surrounders} 支友军" : "")}完成合围——{foe.name} 身陷重围，军心动摇", civ.colorHex, foe.x, foe.y);
                    }
                }
                // —— 增援调度：劣势方呼叫本国未接战军团驰援（L6609-6631）——
                if (myPow < foePow * 0.75 && (ai2 || w.Rng() < 0.25))
                {
                    WbArmy best = null;
                    double bestD = 26;
                    foreach (WbArmy o in w.armies)
                    {
                        if (o.civ != a.civ || o.id == a.id) continue;
                        if (o.state == "battle" || o.state == "retreat") continue;
                        if (o.targetCiv != foe.civ && TechModsOf(w, o.civ).ai <= 0) continue; // 非 AI 军团只驰援同战线
                        double dd = WbMath.FdHypot(o.x - a.x, o.y - a.y);
                        if (dd < bestD) { bestD = dd; best = o; }
                    }
                    if (best != null)
                    {
                        best.targetCiv = foe.civ;
                        best.tx = a.x;
                        best.ty = a.y;
                        if (best.state == "rally") best.state = "march";
                        a.reinforced = (a.reinforced ?? 0) + 1;
                        if (w.tickCount - w.lastReinforceEventTick > 240)
                        {
                            w.lastReinforceEventTick = w.tickCount;
                            w.AddEvent("army", $"{best.name} 奉令驰援 {a.name}——合击会战之敌", civ.colorHex, a.x, a.y);
                        }
                    }
                }
                // —— 战术 AI：深劣势且军心不稳 → 战术撤退（保存建制，L6632-6636）——
                if (ai2 && myPow < foePow * 0.55 && a.morale < 55)
                {
                    RoutArmy(w, a, false, true);
                    return;
                }
                // 惨烈消耗 → 战争疲乏（加速终战，L6637-6641）
                WbWarData wdx = w.warData.TryGetValue(WbWorld.PairKey(a.civ, foe.civ), out WbWarData wd3) ? wd3 : null;
                if (wdx != null)
                {
                    wdx.exA += 1; wdx.exB += 1;
                }
            }
        }

        /// engine armySiege L6645-6697 —— 围城：迎战敌援 / 机甲突击 / 兵员散布 / 军旗压近 / 战线渗透 / 转向下一个敌国
        public static void ArmySiege(WbWorld w, WbArmy a, WbCiv civ)
        {
            if (w.tickCount - a.evalTick <= 30)
            {
                // 敌援军来袭 → 迎战
                WbArmy foe = NearestEnemyArmy(w, a);
                if (foe != null && WbMath.FdHypot(foe.x - a.x, foe.y - a.y) < 7) DeclareClash(w, a, foe, civ);
                return;
            }
            a.evalTick = w.tickCount;
            // 围城目标：旗周 12 格内最近敌建筑（L6653-6676）
            WbBuilding tgt = NearestEnemyBuildingOf(w, a);
            if (tgt != null)
            {
                // —— 机械化军团：放出机甲突击拆毁敌建筑（大型双足机甲推进 + 机炮扫射）——
                if (TechModsOf(w, a.civ).mech > 0 && w.Rng() < 0.35)
                {
                    LaunchMech(w, civ, a.x, a.y, tgt.x + 0.5, tgt.y + 0.5);
                }
                foreach (int id in a.members)
                {
                    WbU u = w.unitById.TryGetValue(id, out WbU uu) ? uu : null;
                    if (u == null) continue;
                    u.tx = tgt.x + w.Rng() * 3 - 1.5;
                    u.ty = tgt.y + w.Rng() * 3 - 1.5;
                }
                double dd = WbMath.FdHypot(tgt.x - a.x, tgt.y - a.y);
                if (dd > 5) { a.tx = tgt.x; a.ty = tgt.y; a.state = "march"; return; }
                // 军旗压近
                double step = ARMY_SPEED * 1.5;
                double nx = a.x + ((tgt.x - a.x) / dd) * step;
                double ny = a.y + ((tgt.y - a.y) / dd) * step;
                if (WalkableT(w.terrain[IdxOf((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))]) || a.naval) { a.x = nx; a.y = ny; }
                // 围城本身也在蚕食周边敌土（战线语义：压境即渗透）
                FrontPush(w, a, 2, 4);
                return;
            }
            // —— 动态战线：敌境纵深渗透（战时虚国界渐进推进，L6677-6696）——
            int pushed = FrontPush(w, a, 3, a.state == "siege" ? 6 : 8);
            if (pushed > 0)
            {
                if (w.Rng() < 0.2)
                {
                    w.AddEvent("occupy", $"{a.name} 的战线向敌境推进（渗透 {pushed} 格）", civ.colorHex, a.x, a.y);
                }
                // 继续向敌国内陆推进
                (double x, double y)? next = ArmyMarchTarget(w, a);
                if (next != null && WbMath.FdHypot(next.Value.x - a.x, next.Value.y - a.y) > 6) { a.tx = next.Value.x; a.ty = next.Value.y; a.state = "march"; }
            }
            else
            {
                // 无可占领 → 转向下一个敌国（或凯旋）
                WbCiv next2 = PickWarEnemy(w, a.civ);
                if (next2 != null)
                {
                    a.targetCiv = next2.id;
                    (double x, double y)? t = ArmyMarchTarget(w, a);
                    if (t != null) { a.tx = t.Value.x; a.ty = t.Value.y; a.state = "march"; }
                }
                else
                {
                    RoutArmy(w, a, true, false); // 凯旋归国
                }
            }
        }

        /// engine armyRetreat L6699-6735 —— 溃退/凯旋归途：直航或 8 向绕障（可泅渡涉水）+ 编队跟随
        public static void ArmyRetreat(WbWorld w, WbArmy a, WbCiv civ)
        {
            (double x, double y)? homeN = CivRallyPoint(w, civ);
            if (homeN == null) { DisbandArmy(w, a, true); return; }
            (double x, double y) home = homeN.Value;
            a.tx = home.x; a.ty = home.y;
            double d = WbMath.FdHypot(home.x - a.x, home.y - a.y);
            if (d < 3)
            {
                if (a.naval) ArmyDisembark(w, a); // 归航舰队靠岸
                DisbandArmy(w, a, false);
                return;
            }
            double step = ARMY_SPEED * 1.3;
            if (a.naval)
            {
                // 舰队归航：直航；抵达本国海岸 → 登陆走陆路归营
                a.x = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, a.x + ((home.x - a.x) / d) * step));
                a.y = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, a.y + ((home.y - a.y) / d) * step));
                if (WalkableT(w.terrain[IdxOf((int)System.Math.Floor(a.x), (int)System.Math.Floor(a.y))]) && d < 10) ArmyDisembark(w, a);
            }
            else
            {
                // 溃军归途：8 向贪心绕障（可泅渡涉水）
                double bas = WbMath.FdAtan2(home.y - a.y, home.x - a.x);
                double[] offs = { 0, 0.45, -0.45, 0.95, -0.95, 1.7, -1.7, System.Math.PI };
                foreach (double off in offs)
                {
                    double ang = bas + off;
                    double nx = a.x + WbMath.FdCos(ang) * step;
                    double ny = a.y + WbMath.FdSin(ang) * step;
                    if (nx < 1 || ny < 1 || nx > WbWorld.W - 2 || ny > WbWorld.H - 2) continue;
                    int t = w.terrain[IdxOf((int)System.Math.Floor(nx), (int)System.Math.Floor(ny))];
                    if (!WalkableT(t) && !WbWorld.IsWater(t)) continue;
                    a.x = nx; a.y = ny;
                    break;
                }
            }
            for (int k = 0; k < a.members.Count; k++)
            {
                WbU u = w.unitById.TryGetValue(a.members[k], out WbU uu) ? uu : null;
                if (u == null) continue;
                (double fx, double fy) fp = FormationPos(w, a, k);
                u.tx = fp.fx; u.ty = fp.fy;
            }
        }

        /// engine declareClash L6738-6757 —— 宣布会战（两军团相互标记，纪事播报 + 战争档案会战计数）
        public static void DeclareClash(WbWorld w, WbArmy a, WbArmy foe, WbCiv civ)
        {
            // —— 溃退之军不接战（Task 35 修复）：追击交给单位层战斗——
            if (a.state == "retreat" || foe.state == "retreat") return;
            // —— 林间伏击首击：伏击方先声夺人（士气 +10，一次性，L6742-6744）——
            if (a.ambush) { a.morale = System.Math.Min(100, a.morale + 10); a.ambush = false; }
            if (foe.ambush) { foe.morale = System.Math.Min(100, foe.morale + 10); foe.ambush = false; }
            a.state = "battle"; a.battleSince = w.tickCount; a.clashWith = foe.id;
            foe.state = "battle"; foe.battleSince = w.tickCount; foe.clashWith = a.id;
            a.battleSize0 = a.members.Count; // 会战开局兵力基准（伤亡崩溃判定）
            foe.battleSize0 = foe.members.Count;
            WbWarData wd = w.warData.TryGetValue(WbWorld.PairKey(a.civ, foe.civ), out WbWarData wd0) ? wd0 : null;
            if (wd != null) wd.battles++;
            if (w.tickCount - w.lastClashEventTick > 180)
            {
                w.lastClashEventTick = w.tickCount;
                string field = WbNames.BattleFieldName(w);
                w.AddEvent("clash", $"{a.name}（{CivAt(w, a.civ)?.name}）与 {foe.name}（{CivAt(w, foe.civ)?.name}）于{field}爆发会战", civ.colorHex, (a.x + foe.x) / 2, (a.y + foe.y) / 2);
                w.shake = System.Math.Max(w.shake, 4);
            }
        }

        /// engine nearestEnemyArmy L6760-6769 —— 最近的敌军团
        public static WbArmy NearestEnemyArmy(WbWorld w, WbArmy a)
        {
            WbArmy best = null;
            double bestD = double.PositiveInfinity;
            foreach (WbArmy o in w.armies)
            {
                if (o.civ == a.civ || !AtWar(w, a.civ, o.civ)) continue;
                double d = WbMath.FdHypot(o.x - a.x, o.y - a.y);
                if (d < bestD) { bestD = d; best = o; }
            }
            return best;
        }

        /// engine nearestEnemyBuildingOf L6772-6782 —— 旗周 12 格内最近的敌国建筑
        public static WbBuilding NearestEnemyBuildingOf(WbWorld w, WbArmy a)
        {
            WbBuilding best = null;
            double bestD = 12;
            foreach (WbBuilding b in w.buildings)
            {
                if (b.civ != a.targetCiv && !AtWar(w, a.civ, b.civ)) continue;
                if (b.civ == a.civ) continue;
                double d = WbMath.FdHypot(b.x - a.x, b.y - a.y);
                if (d < bestD) { bestD = d; best = b; }
            }
            return best;
        }

        /// engine crossesWater L6785-6799 —— 直线跨水率 ≥ 45%（渡海判定）
        public static bool CrossesWater(WbWorld w, double x0, double y0, double x1, double y1)
        {
            double dx = x1 - x0;
            double dy = y1 - y0;
            double d = WbMath.FdHypot(dx, dy);
            if (d < 4) return false;
            int water = 0;
            int samples = (int)System.Math.Max(1, System.Math.Floor(d));
            for (int s = 1; s <= samples; s++)
            {
                int xx = (int)System.Math.Floor(x0 + (dx * s) / d);
                int yy = (int)System.Math.Floor(y0 + (dy * s) / d);
                if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                if (WbWorld.IsWater(w.terrain[IdxOf(xx, yy)])) water++;
            }
            return water / (double)samples >= 0.45;
        }

        // （findWaterNear 首译保留于 M-U3d 段 L1515，IdxOf 等价重复份已并入）

        /// engine armyEmbark L6802-6825 —— 舰队渡海：军旗与成员转航海模式
        public static void ArmyEmbark(WbWorld w, WbArmy a)
        {
            // WBB.touchMeta() —— 舰队登船 boat 列收口（civ 层 no-op）
            a.naval = true;
            (double x, double y)? wpt = FindWaterNear(w, a.x, a.y, 3);
            if (wpt != null) { a.x = wpt.Value.x; a.y = wpt.Value.y; }
            int boarded = 0;
            foreach (int id in a.members)
            {
                WbU u = w.unitById.TryGetValue(id, out WbU uu) ? uu : null;
                if (u == null || u.boat != 0) continue;
                if (WbMath.FdHypot(u.x - a.x, u.y - a.y) < 5)
                {
                    (double x, double y)? ww = FindWaterNear(w, a.x, a.y, 4);
                    if (ww != null)
                    {
                        u.boat = 1; u.boatTTL = 1600;
                        u.x = ww.Value.x + w.Rng() - 0.5; u.y = ww.Value.y + w.Rng() - 0.5;
                        u.lx = u.x; u.ly = u.y;
                        boarded++;
                    }
                }
                // 远处成员：走陆路奔向旗（到旗边自动登船）
            }
            if (boarded > 0 || a.members.Count > 0)
            {
                w.AddEvent("army", $"{a.name} 登船渡海，远征敌国（舰队 {System.Math.Max(boarded, 1)} 艘）", CivAt(w, a.civ)?.colorHex, a.x, a.y);
            }
        }

        /// engine armyDisembark L6828-6847 —— 舰队登陆：全员弃船上岸
        public static void ArmyDisembark(WbWorld w, WbArmy a)
        {
            a.naval = false;
            (int x, int y) land = NearestStandable(w, (int)System.Math.Floor(a.x), (int)System.Math.Floor(a.y));
            a.x = land.x; a.y = land.y;
            int landed = 0;
            foreach (int id in a.members)
            {
                WbU u = w.unitById.TryGetValue(id, out WbU uu) ? uu : null;
                if (u == null) continue;
                if (u.boat != 0 || WbWorld.IsWater(w.terrain[IdxOf((int)System.Math.Floor(u.x), (int)System.Math.Floor(u.y))]))
                {
                    (int x, int y) s = NearestStandable(w, (int)System.Math.Floor(a.x) + (int)(w.Rng() * 6) - 3, (int)System.Math.Floor(a.y) + (int)(w.Rng() * 6) - 3);
                    u.boat = 0; u.boatTTL = 0;
                    u.x = s.x + 0.5; u.y = s.y + 0.5;
                    u.lx = u.x; u.ly = u.y;
                    landed++;
                    w.Fx("spawn", u.x, u.y, 20);
                }
            }
            a.morale = System.Math.Min(100, a.morale + 5); // 成功登陆士气大振
            if (landed > 0) w.AddEvent("army", $"{a.name} 的远征军抢滩登陆（{landed} 人上岸）", CivAt(w, a.civ)?.colorHex, a.x, a.y);
        }

        /// engine routArmy L6850-6873 —— 溃退（triumph 凯旋；tactical 战术转移；重复调用去重 + 恐慌蔓延）
        public static void RoutArmy(WbWorld w, WbArmy a, bool triumph, bool tactical)
        {
            if (a.state == "retreat") return; // 已在溃退途中：不重复触发事件/士气
            a.state = "retreat";
            a.clashWith = null;
            a.battleSince = null;
            a.morale = triumph ? System.Math.Min(100, a.morale + 10) : tactical ? System.Math.Max(45, a.morale) : System.Math.Max(30, a.morale);
            if (triumph)
            {
                w.AddEvent("army", $"{a.name} 大获全胜，凯旋归国（斩获 {a.kills}，损失 {a.losses}）", CivAt(w, a.civ)?.colorHex, a.x, a.y);
            }
            else if (tactical)
            {
                // 战术撤退（战术 AI 驱动）：保存建制，择机再战
                w.AddEvent("army", $"{a.name} 审时度势，战术转移后撤——保存建制，择机再战", CivAt(w, a.civ)?.colorHex, a.x, a.y);
            }
            else
            {
                w.AddEvent("rout", $"{a.name} 全军溃退！（尚存 {a.members.Count} 人）", CivAt(w, a.civ)?.colorHex, a.x, a.y);
                w.shake = System.Math.Max(w.shake, 3);
                // —— 恐慌蔓延：溃退传染周遭友军军心（L6864-6871）——
                foreach (WbArmy o in w.armies)
                {
                    if (o == a || o.civ != a.civ || o.state == "retreat") continue;
                    if (WbMath.FdHypot(o.x - a.x, o.y - a.y) < 10)
                    {
                        o.morale = System.Math.Max(10, o.morale - 12);
                        if (w.Rng() < 0.25) w.AddEvent("rout", $"{a.name} 的溃败动摇了 {o.name} 的军心", CivAt(w, a.civ)?.colorHex, o.x, o.y);
                    }
                }
            }
        }

        /// engine disbandArmy L6876-6898 —— 解散军团（quiet 静默；false 归营总结纪事）
        public static void DisbandArmy(WbWorld w, WbArmy a, bool quiet)
        {
            // WBB.touchMeta() —— 解散 army/boat 列收口（civ 层 no-op）
            WbCiv civ = CivAt(w, a.civ);
            foreach (int id in a.members)
            {
                WbU u = w.unitById.TryGetValue(id, out WbU uu) ? uu : null;
                if (u != null && object.Equals(u.army, (object)a.id))
                {
                    u.army = null;
                    u.boat = 0; u.boatTTL = 0;
                }
            }
            w.armies.Remove(a);
            if (civ != null) civ.armyCd = (int)w.tickCount + ARMY_CD;
            if (!quiet && civ != null)
            {
                string msg = a.tactical
                    ? $"{a.name} 战术后撤归营整补（斩获 {a.kills}，损失 {a.losses}）——军旗未倒，随时再战"
                    : $"{a.name} 解散归田（战役斩获 {a.kills}，损失 {a.losses}）";
                a.tactical = false;
                w.AddEvent("army", msg, civ.colorHex, a.x, a.y);
            }
            // 从其它军团的会战引用中摘除
            foreach (WbArmy o in w.armies) if (o.clashWith == a.id) { o.clashWith = null; if (o.state == "battle") o.state = "march"; }
        }

        /// engine frontPush L7270-7303 —— 战线渗透：距离衰减功率占领（波纹式渐变渗透带）
        public static int FrontPush(WbWorld w, WbArmy a, int radius, int power)
        {
            int cx = (int)System.Math.Floor(a.x);
            int cy = (int)System.Math.Floor(a.y);
            int pushed = 0;
            for (int dy = -radius; dy <= radius; dy++)
            {
                for (int dx = -radius; dx <= radius; dx++)
                {
                    if (dx * dx + dy * dy > radius * radius + 1) continue;
                    int xx = cx + dx;
                    int yy = cy + dy;
                    if (xx < 0 || yy < 0 || xx >= WbWorld.W || yy >= WbWorld.H) continue;
                    int i = IdxOf(xx, yy);
                    int o = w.owner[i];
                    if (o != a.targetCiv) continue; // 只渗透当前交战敌国领土
                    if (!WbWorld.IsLand(w.terrain[i]) || w.terrain[i] == WbWorld.T_MOUNTAIN) continue;
                    // 距离衰减：军团脚下满功率、边缘 1/4 功率 → 波纹式战线
                    double dist = System.Math.Sqrt(dx * dx + (double)dy * dy);
                    int pw = (int)System.Math.Max(1, System.Math.Round(power * (1 - (dist / (radius + 1)) * 0.75)));
                    if (w.occCiv[i] == a.civ)
                    {
                        int ns = (int)System.Math.Min(100, w.occStr[i] + pw + (int)System.Math.Floor(w.Rng() * 3));
                        if (ns >= 100 && w.occStr[i] < 100) FrontSolidify(w, i, a.civ);
                        else w.occStr[i] = (byte)ns;
                    }
                    else if (w.occCiv[i] == -1 || w.occStr[i] < 25)
                    {
                        // 新渗透（敌方控制的占领格需先打掉）
                        w.occCiv[i] = (sbyte)a.civ;
                        w.occStr[i] = (byte)System.Math.Max(4, System.Math.Min(30, w.occStr[i] + pw));
                        w.occSet.Add(i);
                    }
                    pushed++;
                }
            }
            return pushed;
        }

        /// engine frontSolidify L7306-7316 —— 占领转正：正式易帜 + 战功入账（城头变幻大王旗）
        public static void FrontSolidify(WbWorld w, int i, int civId)
        {
            w.occCiv[i] = -1;
            w.occStr[i] = 0;
            w.occSet.Remove(i);
            int victim = w.owner[i];
            ClaimTile(w, i, civId);
            WbWarData wd = w.warData.TryGetValue(WbWorld.PairKey(civId, victim), out WbWarData wd0) ? wd0 : null;
            if (wd != null)
            {
                if (civId == wd.a) { wd.scoreA += 1; wd.occA += 1; } else { wd.scoreB += 1; wd.occB += 1; }
            }
        }

        /// engine leadAim L4351-4358 —— 弹道预测：按目标当前速度取提前量（箭矢飞行期间目标会走 1 格余）
        public static (double x, double y) LeadAim(WbWorld w, WbU enemy, int ttl)
        {
            double vx = enemy.x - (enemy.lx ?? enemy.x);
            double vy = enemy.y - (enemy.ly ?? enemy.y);
            return (
                System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, enemy.x + vx * ttl + w.Rng() * 0.4 - 0.2)),
                System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, enemy.y + vy * ttl + w.Rng() * 0.4 - 0.2))
            );
        }

        /// engine isRangedMember L4361-4365 —— 军团成员是否为远程位
        /// 注：装备弓分支（RACES.isCiv && gearBonus(u).ranged > 0）依赖装备域——托管 WbU 装备槽未建（M-U 后续切片），
        /// 黄金夹具无装备 → 该分支恒 false，位等价（M-U3b 桩域门控避让同款协议）
        public static bool IsRangedMember(WbWorld w, WbU u)
        {
            if (u.job == 3) return true;
            string wepKey = u.wep as string;
            if (wepKey == "musket" || wepKey == "rifle" || wepKey == "laser_rifle") return true;
            return false; // 装备弓分支：黄金夹具无装备恒 false（见头注）
        }

        /// engine castArrow L4368-4370 —— 施放箭矢：命中时对单体敌人结算伤害，或轰击敌国建筑
        public static void CastArrow(WbWorld w, WbU u, double tx, double ty, double dmg)
        {
            double cx = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, tx));
            double cy = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, ty));
            WbFx e = w.Fx("arrow", cx, cy, 12, 0, u.civ);
            if (e != null) { e.x0 = u.x; e.y0 = u.y; }   // opts dmg 命中结算属 fx 宿主侧（黄金不 dump），rng 语义全在 Fx 内
        }

        /// engine castBullet L4374-4377 —— 步枪射击：高速曳光弹道 + 稀疏枪声（rng 门保真）
        public static void CastBullet(WbWorld w, WbU u, double tx, double ty, double dmg)
        {
            double cx = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, tx));
            double cy = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, ty));
            WbFx e = w.Fx("bullet", cx, cy, 5, 0, u.civ);
            if (e != null) { e.x0 = u.x; e.y0 = u.y; }
            if (w.Rng() < 0.12) { /* onSound?.('place') —— 宿主音频回调，C# 态 no-op（rng 已抽） */ }
        }

        /// engine castBeam L4381-4393 —— 相位光束射击：贯穿激光束（略过冲 1.2 格穿射目标身后）
        public static void CastBeam(WbWorld w, WbU u, double tx, double ty, double dmg)
        {
            double ex = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, tx));
            double ey = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, ty));
            // 光束略过冲 1.2 格：穿射目标身后的敌人（相位贯穿）
            double dx = ex - u.x;
            double dy = ey - u.y;
            double dl = WbMath.FdHypot(dx, dy);
            if (dl == 0) dl = 1;   // 蓝本 || 1
            double ox = System.Math.Max(0.5, System.Math.Min(WbWorld.W - 0.5, ex + (dx / dl) * 1.2));
            double oy = System.Math.Max(0.5, System.Math.Min(WbWorld.H - 0.5, ey + (dy / dl) * 1.2));
            WbFx e = w.Fx("laser", ox, oy, 8, null, u.civ);   // 蓝本 opts 无 r → fx 内默认 1
            if (e != null) { e.x0 = u.x; e.y0 = u.y; }
            if (w.Rng() < 0.08) { /* onSound?.('place') —— 宿主音频回调 no-op（rng 已抽） */ }
        }

        /// engine launchMech L9551-9556 —— 机械化军团：放出机甲突击（fx 弹道 + rng 伤害掷）
        public static void LaunchMech(WbWorld w, WbCiv c, double fromX, double fromY, double tx, double ty)
        {
            double dist = WbMath.FdHypot(tx - fromX, ty - fromY);
            if (dist < 4) return;
            int ttl = (int)System.Math.Max(40, System.Math.Min(110, System.Math.Round(dist * 1.2)));
            double dmg = 40 + w.Rng() * 10;   // dmg 入 fx opts（黄金不 dump）——rng 消耗保真
            WbFx e = w.Fx("mech", tx, ty, ttl, 2.2, c.id);
            if (e != null) { e.x0 = fromX; e.y0 = fromY; }
        }

        /// engine addCorpse L2871-2875 —— 尸体落场（fxPrefs.corpses 默认 true；cap 语义 CORPSE_MAX）
        public static void AddCorpse(WbWorld w, double x, double y, bool stone, bool undead)
        {
            // if (!this.fxPrefs.corpses) return; —— fxPrefs.corpses 默认 true（engine L271），C# 态恒 true
            w.corpses.Add(new WbCorpse { x = x, y = y, age = 0, stone = stone, undead = undead });
            if (w.corpses.Count > CORPSE_MAX) w.corpses.RemoveRange(0, w.corpses.Count - CORPSE_MAX);
        }

        /// engine wwCountKill L8690-8713 —— 击杀记账（killCredit 涌现武器域军团域恒 null；worldWar idle 直退）
        public static void WwCountKill(WbWorld w, WbU victim)
        {
            // killCredit == null（涌现武器战绩归属——M-U 后续切片；军团域恒 null 直跳）
            // worldWar.phase !== 'running' || victim.civ < 0 → return（M-U3c 起世界大战域恒 idle）
        }
    }
}
