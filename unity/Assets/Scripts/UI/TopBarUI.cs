// PWB Unity Port — UI/TopBarUI.cs (U4)
// 顶栏(IMGUI,契约 §6):左 = 纪元{YearF:F0}年/季节/人口/王国数/战争数;中 = 速度 0暂停/1x/3x/8x
// (写 TimeSystem.Instance.Speed);右 = 「新世界」按钮(MapGen.Generate 换 rng 新种子)。
// 新世界重置:旧王国领土 owner 复位 + 内部字典经 All 视图清空(避免 U2 迭代中 Remove 的隐患)、
// units/groundItems/building/fire/wet 清零、EventBus 清空 → Generate → MapRenderer.RepaintAll。
// 统计字符串每 10 帧重算一次缓存(OnGUI 每帧多次调用)。
using System.Collections.Generic;
using PWB.Civ;
using PWB.Core;
using UnityEngine;

namespace PWB.UI
{
    public sealed class TopBarUI : MonoBehaviour
    {
        private static readonly string[] SpeedLabels = { "⏸ 暂停", "1x", "3x", "8x" };
        private static readonly int[] Speeds = { 0, 1, 3, 8 };

        private Texture2D _bg;
        private string _stat = "";
        private int _lastCalc = -10;

        public static Rect Rect { get { return new Rect(0f, 0f, Screen.width, 40f); } }

        void Awake()
        {
            _bg = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            _bg.SetPixel(0, 0, new Color(0f, 0f, 0f, 0.55f));
            _bg.Apply(false, false);
        }

        void Update()
        {
            if (Time.frameCount - _lastCalc < 10) return;
            _lastCalc = Time.frameCount;
            var w = World.Instance;
            if (w == null) return;
            var ts = TimeSystem.Instance;

            int pop = 0;
            for (int i = 0; i < w.units.Count; i++) if (!w.units[i].Dead) pop++;
            int wars = 0;
            for (int i = 0; i < w.kingdoms.Count; i++) wars += w.kingdoms[i].AtWarWith.Count;
            wars /= 2;

            _stat = string.Format("纪元 {0:F0} 年 · {1} · 人口 {2} · 王国 {3} · 战争 {4}",
                ts != null ? ts.YearF : 0f,
                ts != null ? TimeSystem.SeasonNames[ts.Season] : "-",
                pop, w.kingdoms.Count, wars);
        }

        void OnGUI()
        {
            var ts = TimeSystem.Instance;
            GUI.DrawTexture(Rect, _bg);
            GUILayout.BeginArea(new Rect(8f, 4f, Screen.width - 16f, 32f));
            GUILayout.BeginHorizontal();

            GUILayout.Label(_stat);

            GUILayout.FlexibleSpace();

            if (ts != null)
            {
                int cur = 0;
                for (int i = 0; i < Speeds.Length; i++) if (Speeds[i] == ts.Speed) { cur = i; break; }
                int picked = GUILayout.SelectionGrid(cur, SpeedLabels, SpeedLabels.Length);
                if (picked != cur) ts.Speed = Speeds[picked];
            }

            GUILayout.FlexibleSpace();

            if (GUILayout.Button("新世界", GUILayout.Width(80f))) NewWorld();

            GUILayout.EndHorizontal();
            GUILayout.EndArea();
        }

        // ================= 新世界 =================

        private void NewWorld()
        {
            var w = World.Instance;
            if (w == null) return;

            // 1) 旧王国:领土复位,再经 All 视图清空内部字典(避免 U2 ExpandAndBuild 迭代中 Remove)
            var ks = KingdomSystem.Instance;
            if (ks != null)
            {
                foreach (var kv in ks.All)
                    for (int i = 0; i < kv.Value.Tiles.Count; i++)
                        w.owner[kv.Value.Tiles[i]] = -1;
                var dict = ks.All as Dictionary<int, Kingdom>;
                if (dict != null) dict.Clear();
            }
            w.kingdoms.Clear();
            w.units.Clear();
            w.groundItems.Clear();
            for (int i = 0; i < World.Size; i++) { w.fire[i] = 0; w.building[i] = 0; w.wet[i] = 0; w.owner[i] = -1; }
            w.events.Clear();

            // 2) 换新种子重生成(World.Instance.rng 取种子,任务指定)
            uint seed = (uint)w.rng.Range(1, int.MaxValue - 1);
            PWB.Map.MapGen.Generate(w, seed, GameBootstrap.DefaultTemplate);
            w.events.Emit("geo", "新世界诞生了");

            // 3) 渲染层整图重绘(建筑层/单位池由各自差分扫描自动收敛)
            if (Render.MapRenderer.Instance != null) Render.MapRenderer.Instance.RepaintAll();
        }
    }
}
