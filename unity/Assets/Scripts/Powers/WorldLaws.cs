// PWB Unity Port — Powers/WorldLaws.cs (U3)
// 世界法则开关(types.ts WorldLaws 1460-1495 移植;默认值一致)。
namespace PWB.Powers
{
    public static class WorldLaws
    {
        public static bool Wars = true;        // 战争
        public static bool Expansion = true;   // 扩张
        public static bool Reproduction = true;// 繁衍
        public static bool Bandits = true;     // 强盗
        public static bool Dragons = true;     // 巨龙
        public static bool ZombieInfect = true;// 僵尸咬伤转化
        public static bool UndeadRise = true;  // 亡者复生
        public static bool Rebellion = true;   // 叛乱
        public static bool Fires = true;       // 火焰蔓延
        public static bool Seasons = true;     // 四季
        public static bool Plagues = true;     // 瘟疫
        public static bool ZombieVirus = true; // 僵尸病毒(瘟疫死亡 35% 尸变)
    }
}
