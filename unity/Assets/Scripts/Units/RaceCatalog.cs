// PWB Unity Port — Units/RaceCatalog.cs (U2)
// 41 种族全量目录。数值逐行移植 types.ts RACES 表(161-199 行 + 前段),不得改动。
// 例:Dragon hp900/dmg48/speed0.11 —— 与 TS 完全一致。
using System.Collections.Generic;

namespace PWB.Units
{
    public static class RaceCatalog
    {
        static readonly RaceDef[] _all = Build();

        public static RaceDef Get(int id) { return (id >= 0 && id < _all.Length) ? _all[id] : _all[0]; }
        public static bool IsCiv(int id) { return Get(id).IsCiv; }

        /// <summary>猎物(草食链底层):羊/鹿/企鹅/骆驼/鸡/猪/兔/鱼(engine.ts isHerbivoreRace)。</summary>
        public static bool IsHerbivore(int id)
        {
            return id == Core.RaceId.Sheep || id == Core.RaceId.Deer || id == Core.RaceId.Penguin
                || id == Core.RaceId.Camel || id == Core.RaceId.Chicken || id == Core.RaceId.Pig
                || id == Core.RaceId.Rabbit || id == Core.RaceId.Fish;
        }

        public static bool IsPredator(int id) { return Get(id).Predator; }

        /// <summary>野生动物种群上限(wildCapOf 移植;文明种族由王国房屋容量约束,返回 int.MaxValue)。</summary>
        public static int WildCap(int id)
        {
            switch (id)
            {
                case Core.RaceId.Sheep: return 380;
                case Core.RaceId.Deer: return 300;
                case Core.RaceId.Rabbit: return 320;
                case Core.RaceId.Chicken: return 300;
                case Core.RaceId.Pig: return 220;
                case Core.RaceId.Wolf: return 90;
                case Core.RaceId.Bear: return 60;
                case Core.RaceId.Fox: return 90;
                case Core.RaceId.Snowwolf: return 70;
                case Core.RaceId.Snake: return 140;
                case Core.RaceId.Scorpion: return 160;
                case Core.RaceId.Fish: return 280;
                case Core.RaceId.Crab: return 90;
                case Core.RaceId.Turtle: return 90;
                case Core.RaceId.Shark: return 40;
                case Core.RaceId.Bandit: return 24;
                case Core.RaceId.Zombie: return 400;
                case Core.RaceId.Dragon: return 4;      // MAX_DRAGONS
                case Core.RaceId.Demon: return 5;
                case Core.RaceId.Troll: return 6;
                case Core.RaceId.Ogre: return 6;
                case Core.RaceId.Whitewalker: return 6;
                case Core.RaceId.Vampire: return 8;
                case Core.RaceId.Kraken: return 3;
                case Core.RaceId.Sandworm: return 4;
                case Core.RaceId.Basilisk: return 3;
                case Core.RaceId.Hydra: return 4;       // MAX_HYDRAS
                case Core.RaceId.Angel: return 4;
                case Core.RaceId.Phoenix: return 4;
                case Core.RaceId.Ent: return 6;
                case Core.RaceId.Lich: return 4;
                default: return Get(id).IsCiv ? int.MaxValue : 200;
            }
        }

        static RaceDef[] Build()
        {
            var l = new List<RaceDef>(Core.RaceId.Count);
            // —— 文明六族(types.ts 162-165 + Lizard/Goblin 175-176)——
            l.Add(D(Core.RaceId.Human, "human", "人类", civ: true, hp: 60, dmg: 8, sp: 0.09f, age: 55, rep: 0.006f, arch: "万邦之友:善于外交与贸易的开拓者"));
            l.Add(D(Core.RaceId.Elf, "elf", "精灵", civ: true, hp: 55, dmg: 9, sp: 0.1f, age: 90, rep: 0.005f, arch: "永森守望者:长寿的奥术大师"));
            l.Add(D(Core.RaceId.Dwarf, "dwarf", "矮人", civ: true, hp: 78, dmg: 10, sp: 0.072f, age: 120, rep: 0.005f, arch: "深岩锻造者:执着的工匠"));
            l.Add(D(Core.RaceId.Orc, "orc", "兽人", civ: true, hp: 72, dmg: 12, sp: 0.084f, age: 48, rep: 0.006f, night: true, arch: "血蹄征服者:强权即公理"));
            l.Add(D(Core.RaceId.Bandit, "bandit", "强盗", hostile: true, hp: 62, dmg: 11, sp: 0.093f, age: 45, rep: 0.0006f));
            l.Add(D(Core.RaceId.Zombie, "zombie", "僵尸", hostile: true, undead: true, hp: 46, dmg: 6, sp: 0.05f, age: 9999, rep: 0f));
            // —— 野生动物(types.ts 161-170)——
            l.Add(D(Core.RaceId.Sheep, "sheep", "绵羊", hp: 16, dmg: 1, sp: 0.038f, age: 26, rep: 0.004f));
            l.Add(D(Core.RaceId.Wolf, "wolf", "狼", pred: true, hp: 34, dmg: 10, sp: 0.093f, age: 22, rep: 0.004f));
            l.Add(D(Core.RaceId.Bear, "bear", "熊", pred: true, hp: 95, dmg: 19, sp: 0.06f, age: 40, rep: 0.002f));
            l.Add(D(Core.RaceId.Dragon, "dragon", "巨龙", hostile: true, pred: true, fly: true, hp: 900, dmg: 48, sp: 0.11f, age: 9999, rep: 0f));
            l.Add(D(Core.RaceId.Deer, "deer", "鹿", hp: 24, dmg: 1, sp: 0.115f, age: 20, rep: 0.003f));
            l.Add(D(Core.RaceId.Penguin, "penguin", "企鹅", hp: 22, dmg: 1, sp: 0.045f, age: 18, rep: 0.004f));
            l.Add(D(Core.RaceId.Camel, "camel", "骆驼", hp: 30, dmg: 2, sp: 0.05f, age: 35, rep: 0.002f));
            l.Add(D(Core.RaceId.Scorpion, "scorpion", "蝎子", hostile: true, hp: 14, dmg: 5, sp: 0.055f, age: 16, rep: 0.005f));
            l.Add(D(Core.RaceId.Snake, "snake", "蛇", pred: true, hp: 20, dmg: 6, sp: 0.08f, age: 20, rep: 0.0035f));
            l.Add(D(Core.RaceId.Snowwolf, "snowwolf", "雪狼", pred: true, hp: 38, dmg: 11, sp: 0.088f, age: 24, rep: 0.004f));
            l.Add(D(Core.RaceId.Skeleton, "skeleton", "骷髅", hostile: true, undead: true, hp: 55, dmg: 14, sp: 0.075f, age: 9999, rep: 0f));
            l.Add(D(Core.RaceId.Demon, "demon", "恶魔", hostile: true, pred: true, lava: true, hp: 600, dmg: 30, sp: 0.085f, age: 9999, rep: 0f));
            l.Add(D(Core.RaceId.Mage, "mage", "法师", hostile: true, hp: 50, dmg: 6, sp: 0.07f, age: 200, rep: 0f, rr: 6.5f, rd: 18f));
            // —— 智慧双雄 + 灾厄巨怪(types.ts 175-180)——
            l.Add(D(Core.RaceId.Lizard, "lizard", "蜥蜴人", civ: true, hp: 66, dmg: 10, sp: 0.095f, age: 70, rep: 0.0058f, arch: "河泽伏击者:冷血而务实的沼泽猎手"));
            l.Add(D(Core.RaceId.Goblin, "goblin", "哥布林", civ: true, hp: 40, dmg: 6, sp: 0.108f, age: 34, rep: 0.0092f, night: true, arch: "穴居孳生者:繁殖极快"));
            l.Add(D(Core.RaceId.Troll, "troll", "巨魔", hostile: true, pred: true, hp: 380, dmg: 26, sp: 0.06f, age: 400, rep: 0f));
            l.Add(D(Core.RaceId.Ogre, "ogre", "食人魔", hostile: true, pred: true, hp: 300, dmg: 34, sp: 0.052f, age: 120, rep: 0f));
            l.Add(D(Core.RaceId.Whitewalker, "whitewalker", "白行者", hostile: true, undead: true, hp: 240, dmg: 20, sp: 0.075f, age: 9999, rep: 0f));
            l.Add(D(Core.RaceId.Vampire, "vampire", "吸血鬼", hostile: true, undead: true, hp: 140, dmg: 16, sp: 0.118f, age: 9999, rep: 0f));
            // —— 巨怪(types.ts 182-184)——
            l.Add(D(Core.RaceId.Kraken, "kraken", "克拉肯", hostile: true, pred: true, aqua: true, reach: 2.4f, hp: 520, dmg: 30, sp: 0.07f, age: 9999, rep: 0f));
            l.Add(D(Core.RaceId.Sandworm, "sandworm", "沙虫", hostile: true, pred: true, sand: true, reach: 1.6f, hp: 420, dmg: 40, sp: 0.14f, age: 9999, rep: 0f));
            l.Add(D(Core.RaceId.Basilisk, "basilisk", "蛇怪", hostile: true, pred: true, reach: 1.4f, hp: 90, dmg: 14, sp: 0.11f, age: 400, rep: 0f));
            // —— 神话种族(types.ts 186-190)——
            l.Add(D(Core.RaceId.Angel, "angel", "天使", fly: true, lava: true, hp: 240, dmg: 22, sp: 0.105f, age: 9999, rep: 0f, arch: "光明使者:圣光治愈众生,圣剑专为亡灵与恶魔出鞘"));
            l.Add(D(Core.RaceId.Phoenix, "phoenix", "凤凰", fly: true, lava: true, hp: 200, dmg: 18, sp: 0.12f, age: 9999, rep: 0f, arch: "浴火神鸟:陨落后自灰烬重生(至多三次)"));
            l.Add(D(Core.RaceId.Ent, "ent", "树人", hp: 320, dmg: 26, sp: 0.055f, age: 9999, rep: 0f, arch: "森林守护者:播撒种子令森林扩张"));
            l.Add(D(Core.RaceId.Lich, "lich", "巫妖", hostile: true, pred: true, undead: true, hp: 260, dmg: 20, sp: 0.07f, age: 9999, rep: 0f, arch: "死灵领主:将战场骸骨唤起为军团"));
            l.Add(D(Core.RaceId.Hydra, "hydra", "九头蛇", hostile: true, pred: true, hp: 500, dmg: 30, sp: 0.05f, age: 9999, rep: 0f, arch: "斩首不死:断颈萌发两条幼蛇,唯火可阻"));
            // —— 八新动物(types.ts 192-199)——
            l.Add(D(Core.RaceId.Chicken, "chicken", "鸡", hp: 10, dmg: 1, sp: 0.05f, age: 14, rep: 0.011f));
            l.Add(D(Core.RaceId.Pig, "pig", "猪", hp: 30, dmg: 2, sp: 0.055f, age: 22, rep: 0.008f));
            l.Add(D(Core.RaceId.Rabbit, "rabbit", "兔", hp: 12, dmg: 1, sp: 0.13f, age: 12, rep: 0.014f));
            l.Add(D(Core.RaceId.Fox, "fox", "狐", pred: true, hp: 28, dmg: 8, sp: 0.105f, age: 18, rep: 0.004f));
            l.Add(D(Core.RaceId.Fish, "fish", "鱼", aqua: true, hp: 6, dmg: 0.5f, sp: 0.075f, age: 10, rep: 0.016f));
            l.Add(D(Core.RaceId.Crab, "crab", "蟹", aqua: true, beach: true, hp: 16, dmg: 3, sp: 0.03f, age: 16, rep: 0.007f));
            l.Add(D(Core.RaceId.Turtle, "turtle", "龟", aqua: true, hp: 40, dmg: 1, sp: 0.028f, age: 120, rep: 0.003f));
            l.Add(D(Core.RaceId.Shark, "shark", "鲨鱼", pred: true, aqua: true, reach: 1.3f, hp: 85, dmg: 18, sp: 0.1f, age: 40, rep: 0.002f));
            return l.ToArray();
        }

        static RaceDef D(int id, string key, string name, bool civ = false, bool hostile = false,
            bool fly = false, bool pred = false, bool undead = false, bool lava = false,
            bool aqua = false, bool beach = false, bool sand = false, bool night = false,
            float reach = 0.9f, float rr = 0f, float rd = 0f,
            float hp = 0, float dmg = 0, float sp = 0, int age = 0, float rep = 0, string arch = null)
        {
            return new RaceDef
            {
                Id = id, Key = key, Name = name, IsCiv = civ, Hostile = hostile, Flying = fly,
                Predator = pred, Undead = undead, LavaImmune = lava, Aquatic = aqua, Beach = beach,
                Sandswim = sand, Nightsight = night, Reach = reach, RangedRange = rr, RangedDmg = rd,
                Hp = hp, Dmg = dmg, Speed = sp, MaxAge = age, Repro = rep, Archetype = arch,
            };
        }
    }
}
