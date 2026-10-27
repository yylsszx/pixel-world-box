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
    }
}
