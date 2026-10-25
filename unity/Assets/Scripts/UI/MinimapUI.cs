// PWB Unity Port — UI/MinimapUI.cs (U4)
// 右上角小地图(IMGUI,契约 §6):256×160 Texture2D 每 30 帧重绘——
// 地形色 = TerrainInfo.Rgb 简化 + owner 国色 0.5 混合 + 活单位白点 + 交战国首都红点;
// GUI.DrawTexture 原尺寸绘制;点击(比例反推,y 翻转)→ CameraRig.JumpTo(x,y)。
using System.Collections.Generic;
using PWB.Civ;
using PWB.Core;
using UnityEngine;

namespace PWB.UI
{
    public sealed class MinimapUI : MonoBehaviour
    {
        public static MinimapUI Instance;

        private Texture2D _tex;
        private readonly Color32[] _buf = new Color32[World.Size];
        private readonly Dictionary<int, Color32> _kc = new Dictionary<int, Color32>(24);
        private int _lastPaint = -60;

        public static Rect Rect
        {
            get { return new Rect(Screen.width - World.W - 10f, 50f, World.W, World.H); }
        }

        void Awake()
        {
            Instance = this;
            _tex = new Texture2D(World.W, World.H, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Point,
                wrapMode = TextureWrapMode.Clamp,
            };
        }

        void OnGUI()
        {
            var w = World.Instance;
            if (w == null) return;

            if (Time.frameCount - _lastPaint >= 30)
            {
                _lastPaint = Time.frameCount;
                Paint(w);
            }

            var r = Rect;
            GUI.DrawTexture(r, _tex);

            // 点击跳转(GUI y 轴向下 → 世界 y 翻转)
            var ev = Event.current;
            if (ev != null && ev.type == EventType.MouseDown && r.Contains(ev.mousePosition))
            {
                float fx = (ev.mousePosition.x - r.x) / r.width;
                float fy = (ev.mousePosition.y - r.y) / r.height;
                var rig = CameraRig.Instance;
                if (rig != null) rig.JumpTo(fx * World.W, (1f - fy) * World.H);
                ev.Use();
            }
        }

        private void Paint(World w)
        {
            var rgb = TerrainInfo.Rgb;
            var terrain = w.terrain;
            var owner = w.owner;

            for (int i = 0; i < World.Size; i++)
            {
                Color32 c = rgb[terrain[i]];
                short o = owner[i];
                if (o >= 0) c = Color32.Lerp(c, KingdomColor(o), 0.5f);
                _buf[i] = c;
            }

            // 活单位白点
            var units = w.units;
            for (int i = 0; i < units.Count; i++)
            {
                var u = units[i];
                if (u.Dead) continue;
                int x = (int)u.X, y = (int)u.Y;
                if (x < 0 || y < 0 || x >= World.W || y >= World.H) continue;
                _buf[y * World.W + x] = new Color32(245, 245, 245, 255);
            }

            // 交战国首都红点
            for (int i = 0; i < w.kingdoms.Count; i++)
            {
                var k = w.kingdoms[i];
                if (k.AtWarWith.Count == 0) continue;
                int x = k.CapitalX, y = k.CapitalY;
                if (x < 0 || y < 0 || x >= World.W || y >= World.H) continue;
                _buf[y * World.W + x] = new Color32(255, 60, 40, 255);
            }

            _tex.SetPixels32(_buf);
            _tex.Apply(false);
        }

        private Color32 KingdomColor(int id)
        {
            Color32 c;
            if (_kc.TryGetValue(id, out c)) return c;
            var ks = KingdomSystem.Instance;
            var k = ks != null ? ks.Get(id) : null;
            if (k != null && !string.IsNullOrEmpty(k.ColorHex) && k.ColorHex.Length >= 7 && k.ColorHex[0] == '#')
            {
                try
                {
                    c = new Color32(
                        System.Convert.ToByte(k.ColorHex.Substring(1, 2), 16),
                        System.Convert.ToByte(k.ColorHex.Substring(3, 2), 16),
                        System.Convert.ToByte(k.ColorHex.Substring(5, 2), 16), 255);
                }
                catch { c = new Color32(200, 200, 200, 255); }
            }
            else c = new Color32(200, 200, 200, 255);
            _kc[id] = c;
            return c;
        }
    }
}
