// PWB Unity Port — Items/GroundItem.cs (U3)
// 地面物品:肉/宝箱/装备(types.ts GroundItem 简化)。
namespace PWB.Items
{
    public sealed class GroundItem
    {
        public const byte Meat = 0, Chest = 1, Gear = 2;
        public byte Kind;
        public float X, Y;
        public int Tier;       // 宝箱 1-3
        public int ItemIndex;  // Gear → ItemCatalog.All 索引
    }
}
