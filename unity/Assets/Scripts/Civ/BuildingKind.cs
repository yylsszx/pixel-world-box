// PWB Unity Port — Civ/BuildingKind.cs (U2)
// 建筑种类(契约 §4;值 = building[] 存储字节)。
namespace PWB.Civ
{
    public enum BuildingKind : byte
    {
        None = 0,
        House = 1,    // 住宅(人口容量 ×5+10)
        Capital = 2,  // 首都(建国锚点)
        Farm = 3,     // 农田(食物 3/40tick)
        Barracks = 4, // 兵营(pop>10)
        Temple = 5,   // 神庙(稳定度维护)
        Wall = 6,     // 城墙(敌阻通行+减伤)
        Market = 7,   // 市场(金币)
        Port = 8,     // 港口(预留)
    }
}
