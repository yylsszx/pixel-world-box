// PWB Unity Port — Items/ItemCatalog.cs (U3)
// 102 件装备(items.ts 生成逻辑移植:名字词表×槽位×稀有度,种子确定性)。
using System.Collections.Generic;
using PWB.Core;
using UnityEngine;

namespace PWB.Items
{
    public enum ItemSlot : byte { Wep = 0, Arm = 1, Hlm = 2, Shd = 3, Bts = 4, Rng = 5, Amu = 6 }

    public sealed class ItemDef
    {
        public string Key, Name, Desc;
        public ItemSlot Slot;
        public int Rarity;          // 0普通 1精良 2稀有 3史诗 4传说
        public float Dmg, Armor, Crit, Lifesteal;
    }

    public static class ItemCatalog
    {
        public static readonly ItemDef[] All = Build();
        public static readonly string[] RarityNames = { "普通", "精良", "稀有", "史诗", "传说" };
        public static readonly Color32[] RarityColors =
        {
            new Color32(200,200,200,255), new Color32(120,220,120,255), new Color32(90,160,255,255),
            new Color32(190,110,255,255), new Color32(255,170,50,255),
        };

        static ItemDef[] Build()
        {
            var rng = new Rng(20250101);
            var l = new List<ItemDef>(102);

            string[] wepA = { "铁", "钢", "秘银", "龙骨", "晨曦", "暮色", "霜刃", "焰吻", "风暴", "王国" };
            string[] wepB = { "短剑", "长剑", "战斧", "巨锤", "长矛", "弯刀", "连弩", "法杖" };
            string[] armA = { "皮", "锁甲", "板甲", "符文", "树人" };
            string[] armB = { "胸甲", "战袍", "外衣", "护心" };
            string[] hlmA = { "皮盔", "钢盔", "王冠", "法师帽", "骸骨面甲" };
            string[] shdA = { "木盾", "铁盾", "鸢盾", "龙鳞盾" };
            string[] btsA = { "布靴", "皮靴", "钢靴", "疾风之靴" };
            string[] rngA = { "铜戒", "银戒", "金戒", "宝石戒指" };
            string[] amuA = { "木符", "银坠", "圣徽", "凤凰之羽", "九头蛇之眼" };
            string[] suffix = { "", "", "", "·利", "·韧", "·古老", "·炽热", "·寒霜", "·迅捷", "·守护" };

            System.Func<string[], string> pick = arr => arr[rng.Range(0, arr.Length - 1)];

            for (int i = 0; i < 102; i++)
            {
                // 槽位分布:武器 30/甲 20/盔 12/盾 12/靴 10/戒 8/符 10
                int roll = rng.Range(0, 99);
                ItemSlot slot = roll < 30 ? ItemSlot.Wep : roll < 50 ? ItemSlot.Arm : roll < 62 ? ItemSlot.Hlm
                    : roll < 74 ? ItemSlot.Shd : roll < 84 ? ItemSlot.Bts : roll < 92 ? ItemSlot.Rng : ItemSlot.Amu;
                // 稀有度:普通 40/精良 30/稀有 18/史诗 9/传说 3
                int rr = rng.Range(0, 99);
                int rarity = rr < 40 ? 0 : rr < 70 ? 1 : rr < 88 ? 2 : rr < 97 ? 3 : 4;
                float q = 1f + rarity * 0.55f;

                string name, desc;
                var it = new ItemDef { Slot = slot, Rarity = rarity };
                switch (slot)
                {
                    case ItemSlot.Wep:
                        name = pick(wepA) + pick(wepB); it.Dmg = rng.Range(3f, 7f) * q; it.Crit = rng.Value() * 0.06f * q;
                        desc = string.Format("伤害+{0:F0}", it.Dmg); break;
                    case ItemSlot.Arm:
                        name = pick(armA) + pick(armB); it.Armor = rng.Range(2f, 5f) * q;
                        desc = string.Format("护甲+{0:F0}", it.Armor); break;
                    case ItemSlot.Hlm:
                        name = pick(hlmA); it.Armor = rng.Range(1f, 3f) * q; it.Crit = rng.Value() * 0.03f * q;
                        desc = string.Format("护甲+{0:F0}", it.Armor); break;
                    case ItemSlot.Shd:
                        name = pick(shdA); it.Armor = rng.Range(2f, 6f) * q;
                        desc = string.Format("护甲+{0:F0}", it.Armor); break;
                    case ItemSlot.Bts:
                        name = pick(btsA); it.Armor = rng.Range(0.5f, 2f) * q;
                        desc = string.Format("轻护+{0:F1}", it.Armor); break;
                    case ItemSlot.Rng:
                        name = pick(rngA); it.Crit = rng.Value() * 0.1f * q; it.Lifesteal = rng.Value() * 0.08f * q;
                        desc = "暴击/吸血加成"; break;
                    default:
                        name = pick(amuA); it.Lifesteal = rng.Value() * 0.12f * q; it.Dmg = rng.Range(0f, 3f) * q;
                        desc = "生命汲取"; break;
                }
                name += pick(suffix);
                it.Name = name; it.Desc = desc;
                it.Key = "item_" + i;
                l.Add(it);
            }
            return l.ToArray();
        }

        /// <summary>按宝箱档位 roll 一件(tier1 普通+/tier2 精良+/tier3 史诗+)。</summary>
        public static ItemDef RollChest(Rng rng, int tier)
        {
            int min = tier >= 3 ? 3 : tier == 2 ? 1 : 0;
            for (int k = 0; k < 24; k++)
            {
                var it = All[rng.Range(0, All.Length - 1)];
                if (it.Rarity >= min) return it;
            }
            return All[0];
        }
    }
}
