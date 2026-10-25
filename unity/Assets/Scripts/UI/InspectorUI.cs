// PWB Unity Port — UI/InspectorUI.cs (U4)
// 检查器(IMGUI,契约 §6):public TryPick(tx,ty) 由 PwbInput 观察模式点击转发——
// 3 格内最近活单位 → 单位面板;否则 owner>=0 → 王国面板;否则空点关闭(面板开时)/地形名;
// 右侧 300×420 半透明面板(手写布局游标,只用白名单 GUI.Label/Button/DrawTexture):
// 名字/种族/HP 条/年龄/击杀/所属国(色块+名)/King 徽记/装备概览/职业。
// 王国面板:名/人口/领土/粮/金/稳定度/在战列表/king 名。选中对象死亡自动关闭。
using PWB.Civ;
using PWB.Core;
using PWB.Units;
using UnityEngine;

namespace PWB.UI
{
    public sealed class InspectorUI : MonoBehaviour
    {
        public static InspectorUI Instance;

        private const int W = 300, H = 420;
        private static readonly string[] JobNames = { "平民", "战士", "农民", "国王" };
        private static readonly string[] TerrainNames =
        {
            "深海", "浅海", "沙滩", "草地", "森林", "丘陵", "山脉", "雪原", "岩浆", "焦土", "冰面", "沼泽",
        };

        private Unit _selUnit;
        private Kingdom _selKingdom;
        private int _selTerrainX = -1, _selTerrainY = -1;

        private Texture2D _bg, _white;
        private float _y;               // 布局游标

        public static bool IsOpen
        {
            get { return Instance != null && (Instance._selUnit != null || Instance._selKingdom != null || Instance._selTerrainX >= 0); }
        }

        public static Rect Rect
        {
            get
            {
                int h = Mathf.Min(H, Screen.height - 232);
                return new Rect(Screen.width - W - 10f, 222f, W, h);
            }
        }

        void Awake()
        {
            Instance = this;
            _bg = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            _bg.SetPixel(0, 0, new Color(0f, 0f, 0f, 0.68f));
            _bg.Apply(false, false);
            _white = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            _white.SetPixel(0, 0, new Color(1f, 1f, 1f, 1f));
            _white.Apply(false, false);
        }

        /// <summary>PwbInput 观察模式转发:3 格内最近活单位 → 单位;owner → 王国;空点关闭。</summary>
        public void TryPick(int tx, int ty)
        {
            if (ToolbarUI.PointerOverUi) return;     // UI 上的点击不拾取(ToolbarUI 每帧维护)
            var w = World.Instance;
            if (w == null) return;

            // 最近单位(3 格内)
            Unit best = null;
            float bd = 9f;
            var units = w.units;
            for (int i = 0; i < units.Count; i++)
            {
                var u = units[i];
                if (u.Dead) continue;
                float dx = u.X - tx, dy = u.Y - ty;
                float d2 = dx * dx + dy * dy;
                if (d2 < bd) { bd = d2; best = u; }
            }
            _selKingdom = null;
            _selTerrainX = -1;
            if (best != null) { _selUnit = best; return; }
            _selUnit = null;

            // 王国
            if (w.InBounds(tx, ty))
            {
                short o = w.owner[w.Idx(tx, ty)];
                if (o >= 0)
                {
                    var ks = KingdomSystem.Instance;
                    var k = ks != null ? ks.Get(o) : null;
                    if (k != null) { _selKingdom = k; return; }
                }
            }

            // 空点:面板开 → 关闭;未开 → 地形信息
            if (IsOpen) { Close(); return; }
            _selTerrainX = tx;
            _selTerrainY = ty;
        }

        private void Close()
        {
            _selUnit = null;
            _selKingdom = null;
            _selTerrainX = -1;
        }

        void OnGUI()
        {
            if (_selUnit != null && _selUnit.Dead) _selUnit = null;    // 死亡自动关
            if (!IsOpen) return;

            var r = Rect;
            GUI.DrawTexture(r, _bg);
            _y = r.y + 8f;

            if (_selUnit != null) DrawUnit(r, _selUnit);
            else if (_selKingdom != null) DrawKingdom(r, _selKingdom);
            else DrawTerrain(r);

            if (GUI.Button(new Rect(r.x + 8f, r.yMax - 28f, r.width - 16f, 22f), "× 关闭")) Close();
        }

        // —— 手写布局小部件 ——

        private void Line(string s)
        {
            GUI.Label(new Rect(Rect.x + 10f, _y, Rect.width - 20f, 20f), s);
            _y += 22f;
        }

        private void Title(string s)
        {
            GUI.Label(new Rect(Rect.x + 10f, _y, Rect.width - 20f, 24f), s);
            _y += 28f;
        }

        private void Gap(float g) { _y += g; }

        private void Bar(float frac, Color32 c)
        {
            var r = new Rect(Rect.x + 12f, _y, Rect.width - 24f, 8f);
            Color old = GUI.color;
            GUI.color = new Color(0.1f, 0.1f, 0.1f, 0.95f);
            GUI.DrawTexture(r, _white);
            GUI.color = (Color)c;
            var f = new Rect(r.x, r.y, r.width * Mathf.Clamp01(frac), r.height);
            if (f.width > 1f) GUI.DrawTexture(f, _white);
            GUI.color = old;
            _y += 12f;
        }

        private void ChipLine(string hex, string text)
        {
            Color c = HexToColor(hex);
            Color old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(new Rect(Rect.x + 12f, _y + 3f, 14f, 12f), _white);
            GUI.color = old;
            GUI.Label(new Rect(Rect.x + 32f, _y, Rect.width - 42f, 20f), text);
            _y += 22f;
        }

        private static Color HexToColor(string hex)
        {
            if (hex == null || hex.Length < 7 || hex[0] != '#') return Color.gray;
            float nr = HexVal(hex[1]) * 16f + HexVal(hex[2]);
            float ng = HexVal(hex[3]) * 16f + HexVal(hex[4]);
            float nb = HexVal(hex[5]) * 16f + HexVal(hex[6]);
            return new Color(nr / 255f, ng / 255f, nb / 255f, 1f);
        }

        private static float HexVal(char c)
        {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return 0f;
        }

        // —— 三个面板 ——

        private void DrawUnit(Rect r, Unit u)
        {
            var def = RaceCatalog.Get(u.Race);
            Title(string.IsNullOrEmpty(u.Name) ? def.Name : u.Name);
            Line("种族:" + def.Name + (u.Infected ? "(感染)" : ""));
            Line(string.Format("HP {0:F0} / {1:F0}", u.Hp, u.MaxHp));
            Bar(u.MaxHp > 0f ? u.Hp / u.MaxHp : 0f, new Color32(216, 52, 44, 255));
            Line(string.Format("年龄 {0} / {1}    击杀 {2}", u.Age, def.MaxAge >= 9999 ? "不朽" : def.MaxAge.ToString(), u.Kills));
            Line("职业:" + (u.Job >= 0 && u.Job < JobNames.Length ? JobNames[u.Job] : "-"));

            Gap(4f);
            if (u.Civ >= 0)
            {
                var ks = KingdomSystem.Instance;
                var k = ks != null ? ks.Get(u.Civ) : null;
                if (k != null) ChipLine(k.ColorHex, "所属国:" + k.Name);
                else Line("所属国:#" + u.Civ);
            }
            else Line("所属国:无(野外)");

            if (u.King) Line("👑 在位君主");

            Gap(6f);
            Line("—— 装备/状态 ——");
            Line(string.Format("伤害倍率 ×{0:F2}    护甲 +{1:F0}", u.DmgMul, u.ArmorBuff));
            if (u.Held) Line("被神之手指抓取中");
            if (u.PanicT > 0f) Line("恐慌逃散中");
            if (u.Rebirths > 0) Line(string.Format("凤凰涅槃 ×{0}", u.Rebirths));
            if (u.Gen > 0) Line(string.Format("九头蛇第 {0} 代", u.Gen));

            if (def.Archetype != null)
            {
                Gap(8f);
                Line(def.Archetype);
            }
        }

        private void DrawKingdom(Rect r, Kingdom k)
        {
            ChipLine(k.ColorHex, k.Name);
            Line(string.Format("建国于第 {0} 年 · 首都 ({1},{2})", k.BornYear, k.CapitalX, k.CapitalY));
            Gap(4f);
            Line("人口:" + k.Pop);
            Line("领土:" + k.Tiles.Count + " 格");
            Line(string.Format("粮库 {0:F0}    金库 {1:F0}", k.Food, k.Gold));
            Bar(k.Stability / 100f, new Color32(90, 170, 235, 255));
            Line(string.Format("稳定度 {0:F0}/100", k.Stability));
            Line(string.Format("建筑 宅{0} 农{1} 墙{2} 其他{3}", k.Houses, k.Farms, k.Walls, k.Others));
            Gap(4f);
            Line("国王:" + (string.IsNullOrEmpty(k.KingName) ? "(悬而未决)" : k.KingName));

            Gap(6f);
            if (k.AtWarWith.Count == 0) Line("在战:无(和平)");
            else
            {
                Line("在战:");
                var ks = KingdomSystem.Instance;
                int shown = 0;
                foreach (var e in k.AtWarWith)
                {
                    var ek = ks != null ? ks.Get(e) : null;
                    Line(" · " + (ek != null ? ek.Name : "#" + e));
                    if (++shown >= 6) { Line(" …"); break; }
                }
            }
        }

        private void DrawTerrain(Rect r)
        {
            var w = World.Instance;
            Title("地形");
            Line(string.Format("坐标 ({0}, {1})", _selTerrainX, _selTerrainY));
            if (w != null && w.InBounds(_selTerrainX, _selTerrainY))
            {
                int i = w.Idx(_selTerrainX, _selTerrainY);
                int t = w.terrain[i];
                Line("类型:" + (t >= 0 && t < TerrainNames.Length ? TerrainNames[t] : "#" + t));
                if (w.fire[i] > 0) Line("燃烧中");
                if (w.building[i] != 0) Line("建筑:#" + w.building[i]);
                Line("归属:" + (w.owner[i] < 0 ? "无主之地" : "王国 #" + w.owner[i]));
            }
            Gap(6f);
            Line("点击单位或王国领土查看详情");
        }
    }
}
