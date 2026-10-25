// PWB Unity Port — UI/ToolbarUI.cs (U4)
// 底部工具栏(IMGUI,契约 §6):三段 = 六 tab SelectionGrid(观察/生物/地形/天灾/神力/宝物)
// → 当前 tab 工具网格(Powers.ToolSystem.Tools 过滤,列数 Clamp(1,10),label=ToolDef.Label)
// → 参数行(笔刷 1-10 滑条 / 生物数量 1-8 滑条 / 当前工具名)。背景半透明黑(1×1 alpha 纹理)。
// 另:Update 里汇总指针是否悬停任一 UI 区域 → PointerOverUi,并把 PwbInput.ObserveMode
// 置为 (overUI || tab==观察),使 UI 上的点击不会被 PwbInput 派发成世界工具操作(PwbInput 为 U1 只读)。
using System.Collections.Generic;
using PWB.Core;
using PWB.Powers;
using UnityEngine;

namespace PWB.UI
{
    public sealed class ToolbarUI : MonoBehaviour
    {
        private static readonly string[] Tabs = { "观察", "生物", "地形", "天灾", "神力", "宝物" };

        /// <summary>指针悬停任一 UI 区域(供 InspectorUI.TryPick 抑制穿透拾取)。</summary>
        public static bool PointerOverUi;

        private readonly List<ToolDef> _cur = new List<ToolDef>(48);
        private string[] _labels = new string[0];
        private int _curTab = -1;
        private int _curCount = -1;

        private Texture2D _bg;
        private Rect _rect;

        void Awake()
        {
            _bg = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            _bg.SetPixel(0, 0, new Color(0f, 0f, 0f, 0.62f));
            _bg.Apply(false, false);
        }

        void Update()
        {
            var ts = ToolSystem.Instance;
            if (ts == null) return;

            // UI 命中汇总(y 翻转到 GUI 坐标系)
            float my = Screen.height - Input.mousePosition.y;
            float mx = Input.mousePosition.x;
            bool over = _rect.width > 0f && mx >= _rect.x && mx <= _rect.xMax && my >= _rect.y && my <= _rect.yMax;
            if (!over)
            {
                var tb = TopBarUI.Rect;
                over = mx >= tb.x && mx <= tb.xMax && my >= tb.y && my <= tb.yMax;
            }
            if (!over)
            {
                var mm = MinimapUI.Rect;
                over = mx >= mm.x && mx <= mm.xMax && my >= mm.y && my <= mm.yMax;
            }
            if (!over && InspectorUI.IsOpen)
            {
                var ip = InspectorUI.Rect;
                over = mx >= ip.x && mx <= ip.xMax && my >= ip.y && my <= ip.yMax;
            }
            PointerOverUi = over;
            PwbInput.ObserveMode = over || ts.Tab == ToolTab.Observe;
        }

        private void Rebuild(int tab)
        {
            _cur.Clear();
            var all = ToolSystem.Tools;
            for (int i = 0; i < all.Count; i++)
                if (all[i].Tab == (ToolTab)tab) _cur.Add(all[i]);
            _labels = new string[_cur.Count];
            for (int i = 0; i < _cur.Count; i++) _labels[i] = _cur[i].Label;
            _curTab = tab;
            _curCount = all.Count;
        }

        void OnGUI()
        {
            var ts = ToolSystem.Instance;
            if (ts == null) return;
            int tab = (int)ts.Tab;
            if (tab < 0 || tab >= Tabs.Length) tab = 0;
            if (_curTab != tab || _curCount != ToolSystem.Tools.Count) Rebuild(tab);
            int n = _cur.Count;
            if (n == 0) return;

            int cols = Mathf.Clamp(n, 1, 10);
            int rows = (n + cols - 1) / cols;
            int h = 30 + 30 + rows * 28 + 18;
            _rect = new Rect(6f, Screen.height - h - 6f, Screen.width - 12f, h);

            GUI.DrawTexture(_rect, _bg);
            GUILayout.BeginArea(_rect);

            // —— tab 行 ——
            int clicked = GUILayout.SelectionGrid(tab, Tabs, 6);
            if (clicked != tab)
            {
                tab = clicked;
                Rebuild(tab);
                ts.SetTool((ToolTab)tab, _cur[0].Id);   // 切页签默认选该页第一个工具
            }

            // —— 工具网格 ——
            int sel = -1;
            for (int i = 0; i < n; i++) if (_cur[i].Id == ts.Tool) { sel = i; break; }
            int picked = GUILayout.SelectionGrid(sel, _labels, cols);
            if (picked >= 0 && picked != sel) ts.SetTool((ToolTab)tab, _cur[picked].Id);

            // —— 参数行 ——
            GUILayout.BeginHorizontal();
            if (tab != (int)ToolTab.Observe)
            {
                GUILayout.Label("笔刷", GUILayout.Width(34f));
                int b = (int)GUILayout.HorizontalSlider(ts.Brush, 1f, 10f, GUILayout.Width(140f));
                if (b != ts.Brush) ts.Brush = b;
                GUILayout.Label(ts.Brush.ToString(), GUILayout.Width(22f));
            }
            if (tab == (int)ToolTab.Creatures)
            {
                GUILayout.Label("数量", GUILayout.Width(34f));
                int c = (int)GUILayout.HorizontalSlider(ts.Count, 1f, 8f, GUILayout.Width(110f));
                if (c != ts.Count) ts.Count = c;
                GUILayout.Label(ts.Count.ToString(), GUILayout.Width(22f));
            }
            GUILayout.FlexibleSpace();
            string label = ts.Tool;
            for (int i = 0; i < n; i++) if (_cur[i].Id == ts.Tool) { label = _cur[i].Label; break; }
            GUILayout.Label("当前:" + label);
            GUILayout.EndHorizontal();

            GUILayout.EndArea();
        }
    }
}
