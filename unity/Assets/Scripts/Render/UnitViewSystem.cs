// PWB Unity Port — Render/UnitViewSystem.cs (U4)
// 单位视图池(契约 §6):1200 个槽位(体+血条底/血条/王冠 4 个 SpriteRenderer)Start 预建隐藏;
// 每帧(非 tick)插值 lerp(Last→X, TimeSystem.TickAlpha);翻转;hp<max 显白底红条;
// King 头顶金冠;死亡/移除单位按 id 差分回收(Dictionary<int,Slot> + 帧戳)。
// groundItems 同池思路独立小池 400(item_meat/item_chest1-3/装备按稀有度染色 fx_dot)。
// ISystem.Tick 为空实现(视觉由 LateUpdate 驱动;注册序见 GameBootstrap)。
using System.Collections.Generic;
using PWB.Core;
using PWB.Units;
using UnityEngine;

namespace PWB.Render
{
    public sealed class UnitViewSystem : MonoBehaviour, ISystem
    {
        public static UnitViewSystem Instance;

        private const int UnitPool = 1200;
        private const int ItemPool = 400;

        private sealed class Slot
        {
            public GameObject Go;
            public SpriteRenderer Body, HpBg, HpFg, Crown;
            public int Stamp;
        }

        private sealed class ItemSlot
        {
            public SpriteRenderer Sr;
            public int Stamp;
        }

        private readonly Dictionary<int, Slot> _byId = new Dictionary<int, Slot>(1024);
        private readonly List<Slot> _free = new List<Slot>(UnitPool);
        private readonly List<int> _gc = new List<int>(256);

        private readonly Dictionary<Items.GroundItem, ItemSlot> _items = new Dictionary<Items.GroundItem, ItemSlot>(128);
        private readonly List<ItemSlot> _ifree = new List<ItemSlot>(ItemPool);
        private readonly List<Items.GroundItem> _igc = new List<Items.GroundItem>(128);

        private Sprite[] _raceSpr;
        private bool _warned;

        void Awake()
        {
            Instance = this;
            SpriteFactory.EnsureAll();
            _raceSpr = new Sprite[Core.RaceId.Count];
            for (int i = 0; i < _raceSpr.Length; i++)
            {
                string key = RaceCatalog.Get(i).Key;
                Sprite s;
                _raceSpr[i] = SpriteFactory.S.TryGetValue(key, out s) ? s : SpriteFactory.S["human"];
            }
        }

        void Start()
        {
            for (int n = 0; n < UnitPool; n++)
            {
                var go = new GameObject("uv");
                var body = (SpriteRenderer)go.AddComponent(typeof(SpriteRenderer));

                var bgGo = new GameObject("hpb");
                bgGo.transform.SetParent(go.transform, false);
                var bg = (SpriteRenderer)bgGo.AddComponent(typeof(SpriteRenderer));
                bg.sprite = SpriteFactory.S["hp"];
                bg.color = new Color32(236, 236, 236, 235);
                bg.transform.localPosition = new Vector3(0f, -0.55f, 0f);
                bg.transform.localScale = new Vector3(4.4f, 1.1f, 1f);

                var fgGo = new GameObject("hpf");
                fgGo.transform.SetParent(go.transform, false);
                var fg = (SpriteRenderer)fgGo.AddComponent(typeof(SpriteRenderer));
                fg.sprite = SpriteFactory.S["hp"];
                fg.color = new Color32(216, 52, 44, 255);
                fg.transform.localPosition = new Vector3(0f, -0.55f, 0f);
                fg.transform.localScale = new Vector3(4.4f, 1.1f, 1f);

                var crGo = new GameObject("crown");
                crGo.transform.SetParent(go.transform, false);
                var cr = (SpriteRenderer)crGo.AddComponent(typeof(SpriteRenderer));
                cr.sprite = SpriteFactory.S["crown"];
                cr.transform.localPosition = new Vector3(0f, 0.62f, 0f);

                go.SetActive(false);
                _free.Add(new Slot { Go = go, Body = body, HpBg = bg, HpFg = fg, Crown = cr });
            }

            var root = new GameObject("Items");
            for (int n = 0; n < ItemPool; n++)
            {
                var go = new GameObject("it");
                go.transform.SetParent(root.transform, false);
                var sr = (SpriteRenderer)go.AddComponent(typeof(SpriteRenderer));
                go.SetActive(false);
                _ifree.Add(new ItemSlot { Sr = sr });
            }
        }

        /// <summary>ISystem 占位(渲染在 LateUpdate;GameBootstrap 注册序需要)。</summary>
        public void Tick(World w) { }

        void LateUpdate()
        {
            var w = World.Instance;
            if (w == null) return;
            float a = TimeSystem.Instance != null ? TimeSystem.Instance.TickAlpha : 1f;
            int fc = Time.frameCount;

            // —— 单位 ——
            var units = w.units;
            for (int i = 0; i < units.Count; i++)
            {
                var u = units[i];
                if (u.Dead) continue;
                Slot s;
                if (!_byId.TryGetValue(u.Id, out s))
                {
                    if (_free.Count == 0)
                    {
                        if (!_warned) { _warned = true; Debug.LogWarning("UnitView 池耗尽(>1200 可见单位)"); }
                        continue;
                    }
                    s = _free[_free.Count - 1];
                    _free.RemoveAt(_free.Count - 1);
                    s.Go.SetActive(true);
                    _byId[u.Id] = s;
                }
                s.Stamp = fc;

                // tick 间插值(held 单位 Last=X,自然无插值)
                float x = u.LastX + (u.X - u.LastX) * a;
                float y = u.LastY + (u.Y - u.LastY) * a;
                s.Go.transform.position = new Vector3(x, y, 0f);

                var body = s.Body;
                int race = u.Race;
                Sprite spr = race >= 0 && race < _raceSpr.Length ? _raceSpr[race] : _raceSpr[0];
                if (body.sprite != spr) body.sprite = spr;
                bool flip = u.Flip;
                if (body.flipX != flip) body.flipX = flip;

                int ord = 40 + (World.H - 1 - (int)y);   // 按 y 排序(下者后画)
                body.sortingOrder = ord;

                bool hurt = u.MaxHp > 0f && u.Hp < u.MaxHp - 0.001f;
                s.HpBg.enabled = hurt;
                s.HpFg.enabled = hurt;
                if (hurt)
                {
                    float frac = Mathf.Clamp01(u.Hp / u.MaxHp);
                    s.HpFg.transform.localScale = new Vector3(Mathf.Max(0.15f, 4.4f * frac), 1.1f, 1f);
                    s.HpFg.transform.localPosition = new Vector3(-0.41f * (1f - frac), -0.55f, 0f);
                    s.HpBg.sortingOrder = ord + 1;
                    s.HpFg.sortingOrder = ord + 2;
                }

                bool king = u.King;
                s.Crown.enabled = king;
                if (king) s.Crown.sortingOrder = ord + 3;
            }

            // 回收:帧戳过期 = 本帧未覆盖(死亡已被 UnitsSystem 移除或池释放)
            _gc.Clear();
            foreach (var kv in _byId)
                if (kv.Value.Stamp != fc) _gc.Add(kv.Key);
            for (int i = 0; i < _gc.Count; i++)
            {
                Slot s;
                if (!_byId.TryGetValue(_gc[i], out s)) continue;
                s.Go.SetActive(false);
                _free.Add(s);
                _byId.Remove(_gc[i]);
            }

            // —— 地面物品 ——
            var items = w.groundItems;
            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                ItemSlot s;
                if (!_items.TryGetValue(it, out s))
                {
                    if (_ifree.Count == 0) continue;
                    s = _ifree[_ifree.Count - 1];
                    _ifree.RemoveAt(_ifree.Count - 1);
                    s.Sr.gameObject.SetActive(true);
                    _items[it] = s;
                }
                s.Stamp = fc;

                s.Sr.transform.position = new Vector3(it.X, it.Y, 0f);
                s.Sr.color = Color32.white;
                if (it.Kind == Items.GroundItem.Meat)
                {
                    s.Sr.sprite = SpriteFactory.S["item_meat"];
                    s.Sr.transform.localScale = new Vector3(1.5f, 1.5f, 1f);
                }
                else if (it.Kind == Items.GroundItem.Chest)
                {
                    s.Sr.sprite = SpriteFactory.S[it.Tier >= 3 ? "item_chest3" : it.Tier == 2 ? "item_chest2" : "item_chest"];
                    s.Sr.transform.localScale = new Vector3(1.5f, 1.5f, 1f);
                }
                else
                {
                    // 掉落装备:fx_dot 按稀有度染色
                    s.Sr.sprite = SpriteFactory.S["fx_dot"];
                    var cat = Items.ItemCatalog.All;
                    s.Sr.color = it.ItemIndex >= 0 && it.ItemIndex < cat.Length
                        ? Items.ItemCatalog.RarityColors[cat[it.ItemIndex].Rarity]
                        : new Color32(230, 230, 230, 255);
                    s.Sr.transform.localScale = new Vector3(7f, 7f, 1f);
                }
                s.Sr.sortingOrder = 30 + (World.H - 1 - (int)it.Y);
            }

            _igc.Clear();
            foreach (var kv in _items)
                if (kv.Value.Stamp != fc) _igc.Add(kv.Key);
            for (int i = 0; i < _igc.Count; i++)
            {
                ItemSlot s;
                if (!_items.TryGetValue(_igc[i], out s)) continue;
                s.Sr.transform.localScale = Vector3.one;
                s.Sr.gameObject.SetActive(false);
                _ifree.Add(s);
                _items.Remove(_igc[i]);
            }
        }
    }
}
