// ============================================================
// WbTech.cs — 科技研发体系静态表 + 涌现科技发明器（M-U3e）
// 蓝本: src/lib/game/tech.ts（TECHS 全表 50 项/TechMods/modsOfTechs 由 WbCivSim 持有）
//       src/lib/game/emergence.ts（EM 词库/inventTech/applyEmTechMods —— 逐行机械翻译，纪律①）
// 特殊字符保真：desc 中的减号 '−' = U+2212（蓝本原文，python 码点核验）
// ============================================================
namespace PixelWorldBox.Wb
{
    using System.Collections.Generic;

    /// EmTechEff —— emergence.ts L282-285
    public class WbEmTechEff
    {
        public string k;
        public double v;
    }

    /// EmTech —— emergence.ts L287-296（涌现科技：静态树穷尽后的无限延伸）
    public class WbEmTech
    {
        public string key;
        public string name;
        public string cat;              // TechCat
        public double cost;
        public int gen;                 // 涌现代数（第 N 项涌现发明）
        public List<WbEmTechEff> effects = new List<WbEmTechEff>();
        public string desc;
    }

    /// TechDef —— tech.ts L8-23
    public struct WbTechDef
    {
        public string key;
        public string name;
        public string cat;              // TechCat
        public int era;                 // 0 远古 / 1 古典 / 2 中世纪 / 3 文艺复兴 / 4 工业 / 5 未来
        public double cost;             // 研究所需知识（JS number）
        public string[] deps;
        public string desc;
    }

    public static class WbTech
    {
        /// tech.ts L45-102 TECHS 全表 50 项（机械翻译逐字保真）
        public static readonly WbTechDef[] Techs = new WbTechDef[]
        {
            // —— 远古时代（0）——
            new WbTechDef { key = "fire", name = "火种", cat = "agri", era = 0, cost = 4, deps = new string[]{}, desc = "熟食烹饪：繁衍速度 +8%" },
            new WbTechDef { key = "stone", name = "石器打磨", cat = "military", era = 0, cost = 5, deps = new string[]{}, desc = "锋利石斧：战士伤害 +10%" },
            new WbTechDef { key = "shelter", name = "筑巢术", cat = "eng", era = 0, cost = 5, deps = new string[]{}, desc = "梁柱结构：建筑耐久 +15%" },
            new WbTechDef { key = "clan", name = "氏族血亲", cat = "civic", era = 0, cost = 6, deps = new string[]{}, desc = "长老议事：稳定度 +8" },
            new WbTechDef { key = "song", name = "图腾歌舞", cat = "culture", era = 0, cost = 6, deps = new string[]{}, desc = "篝火节庆：文化积累 +50%" },
            new WbTechDef { key = "gather", name = "采集术", cat = "econ", era = 0, cost = 6, deps = new string[]{}, desc = "采集储藏：人口税基 +20%" },
            new WbTechDef { key = "raft", name = "木筏", cat = "naval", era = 0, cost = 8, deps = new string[]{}, desc = "漂流远航：殖民间隔 -10%" },
            new WbTechDef { key = "pottery", name = "陶器", cat = "econ", era = 0, cost = 8, deps = new string[]{ "fire" }, desc = "储粮储水：人口税基 +15%" },
            // —— 古典时代（1）——
            new WbTechDef { key = "irrigation", name = "农耕灌溉", cat = "agri", era = 1, cost = 14, deps = new string[]{ "fire" }, desc = "沟渠引水：农田容量 +1，繁衍 +8%" },
            new WbTechDef { key = "bronze", name = "青铜冶炼", cat = "military", era = 1, cost = 16, deps = new string[]{ "stone" }, desc = "青铜兵器：全军伤害 +15%" },
            new WbTechDef { key = "writing", name = "文字", cat = "culture", era = 1, cost = 14, deps = new string[]{ "song" }, desc = "楔形刻痕：知识产出 +30%" },
            new WbTechDef { key = "masonry", name = "石匠工艺", cat = "eng", era = 1, cost = 15, deps = new string[]{ "shelter" }, desc = "凿石垒砌：建筑耐久 +25%，修复速度 +50%" },
            new WbTechDef { key = "currency", name = "铸币", cat = "econ", era = 1, cost = 15, deps = new string[]{ "gather", "pottery" }, desc = "金属通货：集市收入 +40%" },
            new WbTechDef { key = "sail", name = "帆船", cat = "naval", era = 1, cost = 18, deps = new string[]{ "raft" }, desc = "乘风破浪：殖民间隔 -20%" },
            new WbTechDef { key = "law", name = "成文法典", cat = "civic", era = 1, cost = 20, deps = new string[]{ "clan", "writing" }, desc = "律令昭彰：稳定度 +12，叛乱风险降低" },
            new WbTechDef { key = "crossbow", name = "弩机", cat = "military", era = 1, cost = 20, deps = new string[]{ "bronze" }, desc = "弩矢穿透：弓手伤害 +20%" },
            // —— 中世纪（2）——
            new WbTechDef { key = "plow", name = "重犁轮作", cat = "agri", era = 2, cost = 30, deps = new string[]{ "irrigation" }, desc = "深耕细作：繁衍速度 +12%" },
            new WbTechDef { key = "iron", name = "铁器锻造", cat = "military", era = 2, cost = 30, deps = new string[]{ "bronze" }, desc = "铁剑铁甲：全军伤害 +18%，生命 +10%" },
            new WbTechDef { key = "guild", name = "行会制度", cat = "econ", era = 2, cost = 30, deps = new string[]{ "currency" }, desc = "匠人行会：全部经济收入 +25%" },
            new WbTechDef { key = "theology", name = "神学", cat = "culture", era = 2, cost = 30, deps = new string[]{ "writing" }, desc = "经院哲学：文化积累 +80% 解锁神权政体" },
            new WbTechDef { key = "fortification", name = "城墙堡垒", cat = "eng", era = 2, cost = 32, deps = new string[]{ "masonry" }, desc = "瓮城箭楼：建筑耐久 +30%" },
            new WbTechDef { key = "compass", name = "罗盘", cat = "naval", era = 2, cost = 32, deps = new string[]{ "sail" }, desc = "指北磁针：殖民间隔 -25%" },
            new WbTechDef { key = "feudal", name = "封建采邑", cat = "civic", era = 2, cost = 34, deps = new string[]{ "law" }, desc = "分封效忠：税基 +30%（稳定 -4）" },
            new WbTechDef { key = "tactics", name = "方阵战术", cat = "military", era = 2, cost = 36, deps = new string[]{ "iron" }, desc = "进退如一：军团士气上限 +8、恢复 +50%" },
            new WbTechDef { key = "machinery", name = "机械装置", cat = "eng", era = 2, cost = 38, deps = new string[]{ "fortification" }, desc = "绞盘滑轮：修复速度 +60% 陷阱→攻城强化" },
            // —— 文艺复兴（3）——
            new WbTechDef { key = "crop4", name = "良种选育", cat = "agri", era = 3, cost = 52, deps = new string[]{ "plow" }, desc = "良种轮种：繁衍速度 +15%" },
            new WbTechDef { key = "printing", name = "活字印刷", cat = "culture", era = 3, cost = 55, deps = new string[]{ "theology" }, desc = "知识传布：知识产出 +50%，文化 +30%" },
            new WbTechDef { key = "banking", name = "银行信贷", cat = "econ", era = 3, cost = 55, deps = new string[]{ "guild" }, desc = "金库汇票：全部经济收入 +35%" },
            new WbTechDef { key = "astronomy", name = "天文航海", cat = "naval", era = 3, cost = 60, deps = new string[]{ "compass" }, desc = "星图导航：殖民间隔 -30%" },
            new WbTechDef { key = "medicine", name = "医学", cat = "culture", era = 3, cost = 58, deps = new string[]{ "printing" }, desc = "瘟疫医生：瘟疫传播 -45%" },
            new WbTechDef { key = "gothic", name = "哥特拱券", cat = "eng", era = 3, cost = 55, deps = new string[]{ "machinery" }, desc = "飞扶壁尖拱：建筑耐久 +25%，修复 +60%" },
            new WbTechDef { key = "republic", name = "共和宪政", cat = "civic", era = 3, cost = 65, deps = new string[]{ "feudal", "printing" }, desc = "市民议会：稳定 +15，收入 +20% 解锁共和政体" },
            new WbTechDef { key = "steel", name = "钢铁淬火", cat = "military", era = 3, cost = 60, deps = new string[]{ "tactics" }, desc = "板甲钢刃：全军伤害 +20%，生命 +12%" },
            new WbTechDef { key = "legion", name = "帝国军制", cat = "military", era = 3, cost = 75, deps = new string[]{ "steel" }, desc = "常备军团：军团上限 +2，士气 +6 解锁帝国政体" },
            // —— 工业时代（4）：现代武器体系 ——
            new WbTechDef { key = "steam", name = "蒸汽机", cat = "eng", era = 4, cost = 85, deps = new string[]{ "machinery" }, desc = "锅炉与活塞：建筑耐久 +40%，修复 +80%" },
            new WbTechDef { key = "gunpowder", name = "火药", cat = "military", era = 4, cost = 88, deps = new string[]{ "steel", "machinery" }, desc = "黑火药枪械：全军伤害 +25% 解锁火器军备" },
            new WbTechDef { key = "assembly", name = "流水装配", cat = "econ", era = 4, cost = 95, deps = new string[]{ "banking", "steam" }, desc = "标准化生产：全部经济收入 +60%" },
            new WbTechDef { key = "sanitation", name = "公共卫生", cat = "agri", era = 4, cost = 92, deps = new string[]{ "crop4", "medicine" }, desc = "下水道与疫苗：繁衍 +12%，瘟疫传播 -30%" },
            new WbTechDef { key = "rifling", name = "线膛枪", cat = "military", era = 4, cost = 110, deps = new string[]{ "gunpowder" }, desc = "膛线旋进：远程射程 +2.5，射击伤害 +30%" },
            new WbTechDef { key = "explosives", name = "高爆炸药", cat = "military", era = 4, cost = 125, deps = new string[]{ "gunpowder" }, desc = "苦味酸与 TNT：全军伤害 +15% 解锁火炮轰击" },
            new WbTechDef { key = "flight", name = "航空引擎", cat = "eng", era = 4, cost = 140, deps = new string[]{ "steam", "astronomy" }, desc = "双翼机凌空：解锁战时空袭轰炸" },
            new WbTechDef { key = "atomic", name = "原子能工程", cat = "military", era = 4, cost = 185, deps = new string[]{ "explosives", "flight" }, desc = "裂变之火：解锁核打击——终极世界大战的终局武器" },
            // —— 未来时代（5）：未来武器体系 ——
            new WbTechDef { key = "electronics", name = "电子计算", cat = "eng", era = 5, cost = 160, deps = new string[]{ "atomic" }, desc = "硅基心智：知识产出 +60%" },
            new WbTechDef { key = "singularity", name = "奇点智能", cat = "civic", era = 5, cost = 240, deps = new string[]{ "electronics", "republic" }, desc = "超越性 AI 治军：军团获得战术智能（会评估会战/主动增援/战术撤退），稳定 +10" },
            new WbTechDef { key = "robotics", name = "机器人学", cat = "eng", era = 5, cost = 210, deps = new string[]{ "electronics", "assembly" }, desc = "钢铁之躯：修复 +100%，建筑耐久 +40%，解锁机甲军团（行军/围城/会战全面机械化）" },
            new WbTechDef { key = "lasers", name = "定向能武器", cat = "military", era = 5, cost = 200, deps = new string[]{ "electronics", "rifling" }, desc = "光束即刀刃：全军伤害 +20%，解锁激光炮台（战时精确狙杀）" },
            new WbTechDef { key = "drones", name = "无人机蜂群", cat = "military", era = 5, cost = 240, deps = new string[]{ "robotics", "flight" }, desc = "蔽日蜂群：解锁蜂群打击（自主游猎敌军与建筑）" },
            new WbTechDef { key = "orbital", name = "轨道天基", cat = "eng", era = 5, cost = 300, deps = new string[]{ "robotics", "astronomy" }, desc = "天基动能平台：解锁轨道天罚（天顶坠落的钨棒）" },
            new WbTechDef { key = "plasma", name = "等离子体", cat = "military", era = 5, cost = 320, deps = new string[]{ "lasers", "explosives" }, desc = "物质第四态：伤害 +15%，解锁等离子炮（爆破 + 电磁脉冲击溃士气）" },
            new WbTechDef { key = "antimatter", name = "反物质工程", cat = "military", era = 5, cost = 420, deps = new string[]{ "plasma", "atomic" }, desc = "湮灭即终极：解锁反物质打击——终局狂热阶段的天启武器" },
        };

        private static readonly Dictionary<string, WbTechDef> byKey = BuildByKey();
        private static Dictionary<string, WbTechDef> BuildByKey()
        {
            var d = new Dictionary<string, WbTechDef>();
            foreach (var t in Techs) d[t.key] = t;
            return d;
        }
        public static WbTechDef? ByKey(string key)
        {
            if (key != null && byKey.TryGetValue(key, out WbTechDef v)) return v;
            return null;
        }

        // ---------------- 涌现科技词库（emergence.ts L298-326） ----------------
        private static readonly string[] EmPrefix = { "量子", "纳米", "等离子", "基因", "光子", "超导", "混沌", "灵能", "暗物质", "弦", "晶格", "磁悬浮", "熵减", "聚变", "深空", "引力" };
        private static readonly string[] EmFieldName = { "冶金学", "护盾工程", "农艺", "算术", "航海术", "财税学", "营造法式", "市场学", "战术学", "医道", "弹道学", "射艺", "礼乐", "治理术", "营缮学", "军制" };
        private static readonly string[] EmFieldCat = { "military", "eng", "agri", "culture", "naval", "econ", "eng", "econ", "military", "culture", "military", "military", "culture", "civic", "eng", "military" };
        private static readonly string[] EmFieldEff = { "dmg", "hp", "repro", "know", "col", "tax", "bhp", "gold", "morale", "plague", "range", "archer", "cult", "stab", "repair", "armyMax" };
        private static readonly string[] EmEffName = { "全军伤害", "全军生命", "建筑耐久", "经济收入", "知识产出", "繁衍速度", "殖民速度", "人口税基", "文化积累", "修复速度", "军团士气", "军团上限", "射手伤害", "瘟疫传播", "远程射程", "稳定度" };
        private static readonly string[] Roman = { "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII" };

        /// EmModKey → EM_EFF_NAME 下标（词表序 = EmEffName 序）
        private static readonly string[] EmModKeys = { "dmg", "hp", "bhp", "gold", "know", "repro", "col", "tax", "cult", "repair", "morale", "armyMax", "archer", "plague", "range", "stab" };
        private static int EffIdx(string k)
        {
            for (int i = 0; i < EmModKeys.Length; i++) if (EmModKeys[i] == k) return i;
            return -1;
        }

        /// 发明一项涌现科技（emergence.ts L329-373）：前缀 × 领域 × 代数，效果 1-2 条小加成
        public static WbEmTech InventTech(WbWorld w, double mil, double cult, double rich, int gen)
        {
            // 领域选择受国家气质加权（军国爱军事/文化人爱礼乐/富豪爱经济）
            int n = EmFieldName.Length;
            double[] wt = new double[n];
            double total = 0;
            for (int i = 0; i < n; i++)
            {
                double b = 1;
                if (EmFieldCat[i] == "military") b *= 0.5 + mil * 1.5;
                if (EmFieldCat[i] == "culture") b *= 0.5 + cult * 1.5;
                if (EmFieldCat[i] == "econ") b *= 0.6 + rich * 1.4;
                wt[i] = b;
                total += b;
            }
            double roll = w.Rng() * total;
            int field = 0;
            for (int i = 0; i < n; i++)
            {
                roll -= wt[i];
                if (roll <= 0) { field = i; break; }
            }
            string prefix = EmPrefix[(int)(w.Rng() * EmPrefix.Length)];
            string suffix = gen > 12 ? $"·{Roman[System.Math.Min(11, gen / 12)]}" : "";
            string name = $"{prefix}{EmFieldName[field]}{suffix}";
            // 效果：主效果 + 35% 概率副效果（量级随代数缓增但饱和）
            var effs = new List<WbEmTechEff>();
            effs.Add(new WbEmTechEff { k = EmFieldEff[field], v = Mag(w, EmFieldEff[field], gen) });
            if (w.Rng() < 0.35)
            {
                int other = (int)(w.Rng() * n);
                if (EmFieldEff[other] != EmFieldEff[field]) effs.Add(new WbEmTechEff { k = EmFieldEff[other], v = Mag(w, EmFieldEff[other], gen) });
            }
            string desc = "";
            for (int i = 0; i < effs.Count; i++)
            {
                if (i > 0) desc += "，";
                int ei = EffIdx(effs[i].k);
                string sign = effs[i].k == "plague" ? "\u2212" : "+"; // U+2212 蓝本原文
                double shown = WbMath.JsRound(effs[i].v * (effs[i].v < 1 ? 100 : 1));
                desc += $"{EmEffName[ei]} {sign}{WbNum2(shown)}{(effs[i].v < 1 ? "%" : "")}";
            }
            return new WbEmTech
            {
                key = $"em{gen}",
                name = name,
                cat = EmFieldCat[field],
                cost = WbMath.JsRound(110 + gen * 14 + w.Rng() * 30),
                gen = gen,
                effects = effs,
                desc = desc,
            };
        }

        private static double Mag(WbWorld w, string k, int gen)
        {
            double t = 1 + System.Math.Min(0.8, gen * 0.04);
            switch (k)
            {
                case "morale": case "armyMax": case "range": case "stab":
                    return WbMath.JsRound((2 + w.Rng() * 3) * t);
                default:
                    return WbMath.JsRound((0.05 + w.Rng() * 0.07) * t * 1000) / 1000;
            }
        }

        /// JS number → 蓝本模板字符串语义（Math.round 整数无小数点；C# double.ToString 注入一致化）
        private static string WbNum2(double v)
        {
            // 蓝本 ${Math.round(...)} —— JS 整数渲染无小数点；v 恒为整数（round 产物）
            if (v == System.Math.Floor(v)) return ((long)v).ToString();
            return v.ToString(System.Globalization.CultureInfo.InvariantCulture);
        }

        /// 涌现科技效果叠加进 TechMods（emergence.ts L376-380）
        public static void ApplyEmTechMods(WbTechMods m, WbEmTech t)
        {
            foreach (WbEmTechEff e in t.effects)
            {
                double dv = e.k == "plague" ? -System.Math.Abs(e.v) : e.v;
                switch (e.k)
                {
                    case "dmg": m.dmg += dv; break;
                    case "hp": m.hp += dv; break;
                    case "bhp": m.bhp += dv; break;
                    case "gold": m.gold += dv; break;
                    case "know": m.know += dv; break;
                    case "repro": m.repro += dv; break;
                    case "col": m.col += dv; break;
                    case "tax": m.tax += dv; break;
                    case "cult": m.cult += dv; break;
                    case "repair": m.repair += dv; break;
                    case "morale": m.morale += dv; break;
                    case "armyMax": m.armyMax += dv; break;
                    case "archer": m.archer += dv; break;
                    case "plague": m.plague += dv; break;
                    case "range": m.range += dv; break;
                    case "stab": m.stab += dv; break;
                }
            }
        }

        // ---------------- 涌现社会理念发明器（M-U3f：emergence.ts L435-470 逐行机械翻译，纪律①） ----------------

        /// WbIdeaBodyDef —— emergence.ts L437（mods optional 语义 → double?）
        public class WbIdeaBodyDef
        {
            public string name;
            public string desc;
            public double? gold, stab, mil, know, repro, wear;
        }

        /// emergence.ts L435 IDEA_PRE / L436 IDEA_POST / L437-446 IDEA_BODY（逐字保真）
        public static readonly string[] IdeaPre = { "军功爵", "重商", "垦荒", "天工", "航海", "民本", "格物", "荣耀", "万学", "大同", "无为", "铁律" };
        public static readonly string[] IdeaPost = { "主义", "律令", "学会", "改革", "之道", "运动" };
        public static readonly WbIdeaBodyDef[] IdeaBody = new WbIdeaBodyDef[]
        {
            new WbIdeaBodyDef { name = "重商", desc = "商路即国脉", gold = 0.18 },
            new WbIdeaBodyDef { name = "军功爵", desc = "斩首授田，武士阶层的上升阶梯", mil = 0.06, stab = -1 },
            new WbIdeaBodyDef { name = "民本", desc = "民为邦本，本固邦宁", stab = 3, repro = 0.05 },
            new WbIdeaBodyDef { name = "格物", desc = "致知在格物", know = 0.22 },
            new WbIdeaBodyDef { name = "垦荒", desc = "寸土不荒", repro = 0.08, gold = 0.06 },
            new WbIdeaBodyDef { name = "偃武", desc = "铸剑为犁", wear = -0.15, mil = -0.05 },
            new WbIdeaBodyDef { name = "铁律", desc = "令行禁止", stab = 4, gold = -0.05 },
            new WbIdeaBodyDef { name = "万学", desc = "百花齐放", know = 0.15, stab = 1 },
        };

        /// emergence.ts inventIdea L449-470：本体 × 后缀 ×（20% 变体前缀）—— 8×6×12 组合 + 效果微扰
        public static WbIdea InventIdea(WbWorld w, int seq)
        {
            WbIdeaBodyDef body = IdeaBody[(int)(w.Rng() * IdeaBody.Length)];
            string post = IdeaPost[(int)(w.Rng() * IdeaPost.Length)];
            string pre = w.Rng() < 0.2 ? IdeaPre[(int)(w.Rng() * IdeaPre.Length)] : "";
            WbIdeaMods mods = new WbIdeaMods();
            mods.gold = Jitter(w, body.gold, 0.08);
            mods.stab = body.stab.HasValue ? WbMath.JsRound(body.stab.Value + (w.Rng() - 0.5) * 1.5) : (double?)null;
            mods.mil = Jitter(w, body.mil, 0.02);
            mods.know = Jitter(w, body.know, 0.08);
            mods.repro = Jitter(w, body.repro, 0.03);
            mods.wear = Jitter(w, body.wear, 0.06);
            var effBits = new List<string>();
            if (mods.gold.GetValueOrDefault() != 0) effBits.Add($"收入 +{WbMath.JsRound(mods.gold.Value * 100)}%");
            if (mods.stab.GetValueOrDefault() != 0) effBits.Add($"稳定 {(mods.stab.Value > 0 ? "+" : "")}{mods.stab.Value}");
            if (mods.mil.GetValueOrDefault() != 0) effBits.Add($"军国倾向 {(mods.mil.Value > 0 ? "+" : "")}{WbMath.JsRound(mods.mil.Value * 100)}/十年");
            if (mods.know.GetValueOrDefault() != 0) effBits.Add($"知识 +{WbMath.JsRound(mods.know.Value * 100)}%");
            if (mods.repro.GetValueOrDefault() != 0) effBits.Add($"繁衍 +{WbMath.JsRound(mods.repro.Value * 100)}%");
            if (mods.wear.GetValueOrDefault() != 0) effBits.Add($"厌战 {(mods.wear.Value > 0 ? "+" : "")}{WbMath.JsRound(mods.wear.Value * 100)}%");
            return new WbIdea { key = $"id{seq}", name = $"{pre}{body.name}{post}", desc = $"{body.desc} —— {string.Join("，", effBits)}", mods = mods };
        }

        /// emergence.ts jitter L452：v === undefined → undefined；否则 round((v + (rng-0.5)*amt)*1000)/1000
        private static double? Jitter(WbWorld w, double? v, double amt)
        {
            if (!v.HasValue) return null;
            return WbMath.JsRound((v.Value + (w.Rng() - 0.5) * amt) * 1000.0) / 1000.0;
        }
    }
}
