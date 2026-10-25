// PWB Unity Port — Items/GroundItemSystem.cs (U3)
// 地面物品:掉落/宝箱/拾取(动物掉肉、宝箱开装备 buff、肉恢复饥饿)。
using System.Collections.Generic;
using PWB.Core;
using UnityEngine;

namespace PWB.Items
{
    public sealed class GroundItemSystem : MonoBehaviour, ISystem
    {
        public static GroundItemSystem Instance;
        const int Cap = 400;

        void Awake() { Instance = this; }

        public void DropMeat(float x, float y, int n)
        {
            var w = World.Instance; if (w == null) return;
            for (int k = 0; k < n; k++) Add(w, new GroundItem { Kind = GroundItem.Meat, X = x + w.rng.Range(-0.8f, 0.8f), Y = y + w.rng.Range(-0.8f, 0.8f) });
        }

        public void SpawnChest(World w, int tx, int ty, int tier)
        {
            Add(w, new GroundItem { Kind = GroundItem.Chest, X = tx + 0.5f, Y = ty + 0.5f, Tier = tier });
            w.events.Emit("loot", tier >= 3 ? "神话宝箱落地——散着禁忌的光" : tier == 2 ? "秘银宝箱落地,铰链轻响" : "宝箱落地,等待有缘人", tx, ty);
        }

        public void DropItem(World w, float x, float y, int itemIndex)
        {
            Add(w, new GroundItem { Kind = GroundItem.Gear, X = x, Y = y, ItemIndex = itemIndex });
        }

        static void Add(World w, GroundItem it)
        {
            w.groundItems.Add(it);
            if (w.groundItems.Count > Cap) w.groundItems.RemoveAt(0); // LRU
        }

        public void Tick(World w)
        {
            if ((w.Tick & 3) != 1) return; // 每 4 tick 拾取扫描
            var units = w.units;
            for (int gi = w.groundItems.Count - 1; gi >= 0; gi--)
            {
                var it = w.groundItems[gi];
                for (int i = 0; i < units.Count; i++)
                {
                    var u = units[i];
                    if (u.Dead || u.Held) continue;
                    var def = Units.RaceCatalog.Get(u.Race);
                    float dx = u.X - it.X, dy = u.Y - it.Y;
                    if (dx * dx + dy * dy > 1.44f) continue;

                    if (it.Kind == GroundItem.Meat)
                    {
                        if (!def.IsCiv) u.Food = Mathf.Min(100f, u.Food + 40f);   // 捕食者/动物进食
                        else
                        {
                            u.Food = Mathf.Min(100f, u.Food + 20f);
                            if (u.Civ >= 0 && Civ.KingdomSystem.Instance != null)
                                Civ.KingdomSystem.Instance.AddFood(u.Civ, 1f);    // 文明入库
                        }
                        w.groundItems.RemoveAt(gi);
                        break;
                    }
                    if (it.Kind == GroundItem.Chest)
                    {
                        var item = ItemCatalog.RollChest(w.rng, it.Tier);
                        Equip(u, item, w);
                        w.groundItems.RemoveAt(gi);
                        break;
                    }
                    if (it.Kind == GroundItem.Gear)
                    {
                        Equip(u, ItemCatalog.All[Mathf.Clamp(it.ItemIndex, 0, ItemCatalog.All.Length - 1)], w);
                        w.groundItems.RemoveAt(gi);
                        break;
                    }
                }
            }
        }

        static void Equip(Units.Unit u, ItemDef item, World w)
        {
            u.DmgMul += item.Dmg * 0.01f;        // dmg+X → 乘区
            u.ArmorBuff += item.Armor * 0.5f;
            u.Hp = Mathf.Min(u.MaxHp, u.Hp + item.Lifesteal * 40f);
            w.events.Emit("loot", string.Format("{0} 拾起了[{1}]{2}", u.Name, ItemCatalog.RarityNames[item.Rarity], item.Name), u.X, u.Y);
            if (Render.FxSystem.Instance != null) Render.FxSystem.Instance.Spawn("spark", u.X, u.Y, 0.8f);
        }
    }
}
