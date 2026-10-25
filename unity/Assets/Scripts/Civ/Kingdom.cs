// PWB Unity Port — Civ/Kingdom.cs (U2)
// 王国实体(契约 §4)。国色 = CIV_COLORS 轮换(constants.ts)。
using System.Collections.Generic;

namespace PWB.Civ
{
    public sealed class Kingdom
    {
        public int Id;
        public string Name;
        public string ColorHex;        // 展示/地图色
        public int CapitalX, CapitalY;
        public int Pop;                // 缓存人口(Tick 重算)
        public readonly List<int> Tiles = new List<int>(); // 领土 tile idx
        public int Houses, Farms, Walls, Others;
        public float Food = 50f;
        public float Gold = 20f;
        public float Stability = 70f;
        public int KingId = -1;
        public string KingName = "";
        public readonly HashSet<int> AtWarWith = new HashSet<int>();
        public int BornYear;
        public float WarWeariness;     // 厌战累计(伤亡)
    }
}
