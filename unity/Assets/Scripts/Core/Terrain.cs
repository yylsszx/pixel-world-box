// PWB Unity Port — Core/Terrain.cs (U1)
// 地形枚举(契约 §3,值 = types.ts T 常量,亦为 terrain[] 存储字节)
// + 静态表 TerrainInfo(IsLand/Burnable/RGB 十二色 —— 移植 constants.ts TERRAIN_RGB 30-42 行,数值不改)
// + RaceId 种族常量表(契约 §3,值 = types.ts R 常量;U2 的 RaceCatalog / U3 的 RACE_TOOL 依赖)。
using UnityEngine;

namespace PWB.Core
{
    public enum Terrain : byte
    {
        Deep = 0,     // 深海
        Water = 1,    // 浅海/河流
        Sand = 2,     // 沙滩/沙漠
        Grass = 3,    // 草地(可燃)
        Forest = 4,   // 森林(可燃)
        Hill = 5,     // 丘陵
        Mountain = 6, // 山脉(不可通行)
        Snow = 7,     // 雪原
        Lava = 8,     // 岩浆
        Burnt = 9,    // 焦土
        Ice = 10,     // 冰面(可行走,遇热消融)
        Swamp = 11,   // 沼泽(可行走迟缓,不燃)
    }

    /// <summary>地形静态判定与调色板(数值逐行对照 constants.ts,不得改动)。</summary>
    public static class TerrainInfo
    {
        // TERRAIN_RGB(constants.ts 32-45 行):Deep..Swamp 十二色
        public static readonly Color32[] Rgb =
        {
            new Color32(31, 62, 107, 255),    // DEEP
            new Color32(56, 113, 163, 255),   // WATER
            new Color32(222, 203, 141, 255),  // SAND
            new Color32(104, 152, 60, 255),   // GRASS
            new Color32(72, 116, 50, 255),    // FOREST(树下地面)
            new Color32(130, 137, 96, 255),   // HILL
            new Color32(122, 122, 126, 255),  // MOUNTAIN
            new Color32(228, 235, 240, 255),  // SNOW
            new Color32(235, 90, 30, 255),    // LAVA
            new Color32(66, 58, 51, 255),     // BURNT
            new Color32(172, 210, 228, 255),  // ICE(冰面:冻结的水)
            new Color32(88, 96, 50, 255),     // SWAMP(浑浊绿褐湿地)
        };

        /// <summary>isLand(constants.ts 65 行):非水非岩浆即为陆(冰面/沼泽算陆地)。</summary>
        public static bool IsLand(Terrain t)
        {
            return t != Terrain.Deep && t != Terrain.Water && t != Terrain.Lava;
        }

        /// <summary>isWater:深海或浅水。</summary>
        public static bool IsWater(Terrain t)
        {
            return t == Terrain.Deep || t == Terrain.Water;
        }

        /// <summary>Burnable = FLAMMABLE(constants.ts 59 行):仅草/林可燃(火蔓延判定用)。</summary>
        public static bool Burnable(Terrain t)
        {
            return t == Terrain.Grass || t == Terrain.Forest;
        }
    }

    /// <summary>种族 id 常量(契约 §3 冻结;= types.ts R 枚举值,存档兼容口径)。</summary>
    public static class RaceId
    {
        public const int Human = 0, Elf = 1, Dwarf = 2, Orc = 3, Bandit = 4, Zombie = 5, Sheep = 6,
            Wolf = 7, Bear = 8, Dragon = 9, Deer = 10, Penguin = 11, Camel = 12, Scorpion = 13,
            Snake = 14, Snowwolf = 15, Skeleton = 16, Demon = 17, Mage = 18, Lizard = 19, Goblin = 20,
            Troll = 21, Ogre = 22, Whitewalker = 23, Vampire = 24, Kraken = 25, Sandworm = 26,
            Basilisk = 27, Angel = 28, Phoenix = 29, Ent = 30, Lich = 31, Hydra = 32, Chicken = 33,
            Pig = 34, Rabbit = 35, Fox = 36, Fish = 37, Crab = 38, Turtle = 39, Shark = 40;
        public const int Count = 41;
    }
}
