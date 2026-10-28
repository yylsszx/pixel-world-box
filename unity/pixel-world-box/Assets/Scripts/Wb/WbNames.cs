// ============================================================
// WbNames.cs — src/lib/game/names.ts 机械翻译（M-U3c）
// 蓝本: names.ts FIRST/KINGDOM_PRE/KINGDOM_SUF/BANNERS + roman/unitName/civName
// 纪律①: 只从蓝本机械翻译，不从记忆重写。表内容逐项对照 names.ts L8-38。
// ============================================================
namespace PixelWorldBox.Wb
{
    using System.Collections.Generic;

    public static class WbNames
    {
        /// names.ts FIRST L8-36 —— 每种族名池（28 族全量；缺池回退 FIRST[0]）
        public static readonly Dictionary<int, string[]> First = BuildFirst();
        private static Dictionary<int, string[]> BuildFirst()
        {
            var d = new Dictionary<int, string[]>
            {
                [0] = new[] { "Alric", "Berta", "Corin", "Dahlia", "Edwin", "Faye", "Gareth", "Hilda", "Ivan", "Jora", "Kelvin", "Lyra", "Marcus", "Nora", "Osric", "Petra" },
                [1] = new[] { "Aelar", "Briel", "Caelum", "Dain", "Elowen", "Faelis", "Galad", "Haldir", "Ithil", "Laucian", "Mirelle", "Naivara", "Orophin", "Priami", "Riardon", "Sylvar" },
                [2] = new[] { "Adrik", "Balgor", "Brunhild", "Dolgrim", "Durik", "Edvana", "Farga", "Grimli", "Harbek", "Ingvar", "Karrak", "Morgran", "Norgra", "Oskar", "Thrain", "Ulfgar" },
                [3] = new[] { "Ashgar", "Brug", "Durok", "Gashnak", "Grum", "Hargor", "Kargh", "Mok", "Nargul", "Ogrum", "Rukk", "Shagrat", "Thokk", "Uglok", "Vrag", "Zugor" },
                [4] = new[] { "Raven", "Vex", "Crow", "Shade", "Fang", "Dirk", "Whisper", "Krait" },
                [5] = new[] { "Rot", "Shamble", "Gnaw", "Groan", "Lurch", "Decay" },
                [6] = new[] { "Wooly", "Fluff", "Baaald", "Shears", "Cloud", "Tumble" },
                [7] = new[] { "Fenrir", "Grey", "Howl", "Fang", "Shadow", "Nip" },
                [8] = new[] { "Bruno", "Kodiak", "Ursa", "Grizzle", "Paw", "Claw" },
                [9] = new[] { "Smaug", "Ancalagon", "Glaurung", "Firnaki", "Vermithor", "Balerion" },
                [10] = new[] { "Bambi", "Fawn", "Dash", "Clover", "Willow", "Bramble", "Hazel", "Sorrel" },
                [11] = new[] { "Pingu", "Waddle", "Chilly", "Tux", "Frostie", "Pebble", "Skipper", "Noot" },
                [12] = new[] { "Sahara", "Dune", "Humpy", "Oasis", "Sandy", "Caravan", "Mirage", "Nabd" },
                [13] = new[] { "Sting", "Venom", "Skitter", "Pincer", "Sable", "Rust", "Barb", "Flick" },
                [14] = new[] { "Hiss", "Coil", "Slither", "Sidewind", "Mamba", "Viper", "Rattle", "Adder" },
                [15] = new[] { "Frost", "Blizzard", "Avalanche", "Snowcap", "Glacia", "Arctic", "Polar", "Yuki", "Tundra", "Rime" },
                [16] = new[] { "Bones", "Rattle", "Marrow", "Creak", "Skull", "Grin", "Clatter", "Dust", "Hollow", "Grim" },
                [17] = new[] { "Azgor", "Balroth", "Mephisto", "Vulgrim", "Xaroth", "Infernus", "Malgor", "Pyros", "Zagan", "Nihil" },
                [18] = new[] { "Zarkon", "Merlyn", "Alazar", "Drahcir", "Vexis", "Ozric", "Thulsa", "Ravenor", "Kaldor", "Sarquiss" },
                [19] = new[] { "Sszar", "Hsska", "Zsthax", "Kressh", "Vissith", "Slithis", "Grix", "Xessk", "Thassk", "Narsss", "Skarn", "Veshk" },
                [20] = new[] { "Grizzik", "Snik", "Zog", "Nix", "Rikt", "Pob", "Grib", "Skab", "Wix", "Trug", "Miz", "Krag", "Splug", "Yark" },
                [21] = new[] { "Grolk", "Ungo", "Karnn", "Brogg", "Zull", "Morgg", "Durn", "Skalgg", "Hrukk", "Vorn", "Tuskarr", "Grumb" },
                [22] = new[] { "Gnash", "Chomper", "Bruuz", "Gulp", "Mawg", "Krunch", "Slogg", "Bite", "Gorge", "Tumm", "Snack", "Devour" },
                [23] = new[] { "Kael", "Noctis", "Vhorn", "Icethorn", "Sorrow", "Winterborn", "Grim", "Pale", "Nihils", "Rime", "Hoarfrost", "Shiver" },
                [24] = new[] { "Dracul", "Carmilla", "Alucard", "Nosferu", "Vlad", "Lestat", "Sanguine", "Nocturn", "Vesper", "Morwenna", "Bloodwyn", "Duskryn" },
                [25] = new[] { "Nessie", "Abyssus", "Scylla", "Charyb", "Tentacl", "Inkblot", "Maelstr", "Leviath", "Briney", "Krakenor", "Drench", "Umiboz" },
                [26] = new[] { "Shai", "Hulud", "Ggrukkk", "Wyrmoid", "Sandst", "Dunerig", "Tremorr", "Borewor", "Grainma", "Siftjaw", "Cyclura", "Migon" },
                [27] = new[] { "Medusae", "Cockatri", "Gorgon", "Basilio", "Sserqet", "Venomax", "Stareye", "Scalecr", "Hissra", "Stonega", "Najar", "Sibyl" },
            };
            return d;
        }

        /// names.ts KINGDOM_PRE L36
        public static readonly string[] KingdomPre = { "Iron", "Storm", "Ember", "Frost", "Gold", "Silver", "Thorn", "Wolfs", "Raven", "Oak", "Star", "Sun", "Moon", "Stone", "Wind", "Mist", "Dawn", "Dusk", "Crystal", "Thunder" };
        /// names.ts KINGDOM_SUF L37
        public static readonly string[] KingdomSuf = { "hold", "gard", "fell", "mere", "burg", "haven", "shire", "crest", "vale", "watch", "forge", "rest", "moor", "spire", "reach" };
        /// names.ts BANNERS L38
        public static readonly string[] Banners = { "狮", "狼", "鹰", "鹿", "熊", "龙", "蛇", "鱼", "虎", "鸦", "马", "牛", "羊", "狐", "豹", "鲸" };

        /// names.ts roman L81-91 —— 小写罗马数字（1-40；超出直接返回数字字符串），出参大写
        public static string Roman(int n)
        {
            if (n < 1 || n > 40) return n.ToString();
            int[] vals = { 40, 10, 9, 5, 4, 1 };
            string[] syms = { "xl", "x", "ix", "v", "iv", "i" };
            string belong = "";
            int v = n;
            for (int i = 0; i < vals.Length; i++)
            {
                while (v >= vals[i]) { belong += syms[i]; v -= vals[i]; }
            }
            return belong.ToUpper();
        }

        /// names.ts unitName L74-77 —— pool[Math.floor(rand() * pool.length)]；缺池回退 FIRST[0]
        public static string UnitName(int race, WbWorld w)
        {
            string[] pool;
            if (!First.TryGetValue(race, out pool) || pool == null) pool = First[0];
            return pool[(int)System.Math.Floor(w.Rng() * pool.Length)];
        }

        /// names.ts civName L94-98 —— 前后缀+纹章三掷（各消耗一次 rng）
        public static (string name, string banner) CivName(WbWorld w)
        {
            string pre = KingdomPre[(int)System.Math.Floor(w.Rng() * KingdomPre.Length)];
            string suf = KingdomSuf[(int)System.Math.Floor(w.Rng() * KingdomSuf.Length)];
            string banner = Banners[(int)System.Math.Floor(w.Rng() * Banners.Length)];
            return (pre + suf, banner);
        }

        // ---------------- 军团命名（names.ts L40-78；M-U3g 军团域） ----------------
        /// names.ts L40-44 六表逐字保真
        public static readonly string[] ArmyPre = { "苍", "黑", "白", "血", "铁", "烈", "寒", "金", "银", "怒", "晨", "暮", "风", "雷", "霜", "焰" };
        public static readonly string[] ArmyMid = { "狼", "鹰", "狮", "龙", "熊", "鸦", "虎", "鹿", "蛇", "蝎", "犀", "鲨" };
        public static readonly string[] ArmySuf = { "军团", "方阵", "铁卫", "战团", "军团", "远征军", "兵团" };
        /// 兵种后缀（按组建方成分量选：步卒/弓手/混编）
        public static readonly string[] ArmyJobSuf = { "步卒军团", "箭雨方阵", "混编战团" };
        /// 会战地名（names.ts L54-56）
        public static readonly string[] FieldPre = { "血", "白", "黑", "灰", "赤", "金", "寒", "荒", "雾", "断" };
        public static readonly string[] FieldSuf = { "谷", "滩", "原", "桥", "坡", "林", "渡", "丘", "河湾", "隘口" };

        /// names.ts armyName L46-53 —— `{苍狼}{军团}` 式两段命名；同国多军团自然编号
        public static string ArmyName(WbWorld w, int seq)
        {
            string pre = ArmyPre[(int)System.Math.Floor(w.Rng() * ArmyPre.Length)];
            string mid = ArmyMid[(int)System.Math.Floor(w.Rng() * ArmyMid.Length)];
            string suf = ArmySuf[(int)System.Math.Floor(w.Rng() * ArmySuf.Length)];
            string bas = pre + mid + suf;
            return seq <= 1 ? bas : bas + "·" + Roman(seq);
        }

        /// names.ts battleFieldName L59-61 —— 战役纪事地名（一掷 rng）
        public static string BattleFieldName(WbWorld w)
        {
            return FieldPre[(int)System.Math.Floor(w.Rng() * FieldPre.Length)] + FieldSuf[(int)System.Math.Floor(w.Rng() * FieldSuf.Length)];
        }

        /// names.ts armyNameByJobs L64-77 —— 根据成员职业占比选后缀（两掷 rng + 后缀分支零 rng）
        public static string ArmyNameByJobs(WbWorld w, int seq, double archerRatio)
        {
            string pre = ArmyPre[(int)System.Math.Floor(w.Rng() * ArmyPre.Length)];
            string mid = ArmyMid[(int)System.Math.Floor(w.Rng() * ArmyMid.Length)];
            string suf;
            if (archerRatio > 0.66) suf = ArmyJobSuf[1];
            else if (archerRatio < 0.25) suf = ArmyJobSuf[0];
            else suf = ArmyJobSuf[2];
            string bas = pre + mid + suf;
            return seq <= 1 ? bas : bas + "·" + Roman(seq);
        }
    }
}
