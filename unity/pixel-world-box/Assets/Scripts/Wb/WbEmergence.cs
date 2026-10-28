using System;
using System.Collections.Generic;

namespace PixelWorldBox.Wb
{
    /// <summary>
    /// emergence.ts 涌现视觉域宿主生产（M-U7b 机械翻译，蓝本 emergence.ts L172-237）：
    /// SPRITE_BASE 父种色板 + visCacheFor 渲染缓存生产/失效。
    /// 蓝本契约：
    ///   ① visCacheFor(race, vis, sprite)：!vis → null；缓存命中即返（怪癖：同 race 后续 vis/sprite 参数被忽略）；
    ///     base = SPRITE_BASE[sprite] ?? SPRITE_BASE.wolf；body/dark/light/accent 四色 ShiftColor；
    ///     accent 基色 pattern===2 选 light 否则 dark，lumBias = glow ? 0.3 : 0.02；
    ///     size/bulk/horns/tail/ears/pattern 直传，spikes/mane/glow/crest 经 !! 布尔化（C# int 0/1）；
    ///     glow 覆盖 accent '#7df9ff'（在缓存 set 之前）；缓存 set 后返回。
    ///   ② invalidateVisCache(race?)：race 缺省全清，否则删除单键。
    /// </summary>
    public static class WbEmergence
    {
        /// <summary>emergence.ts SPRITE_BASE：各精灵族系基础体色（父种色板 —— 视觉基因在其上漂移）</summary>
        public static readonly Dictionary<string, string[]> SPRITE_BASE = new Dictionary<string, string[]>
        {
            { "sheep", new[] { "#f2ead8", "#575757", "#fffaf0" } },
            { "wolf", new[] { "#8d8d8d", "#3a342c", "#c8c8c8" } },
            { "snowwolf", new[] { "#eef2f5", "#d4dde4", "#ffffff" } },
            { "bear", new[] { "#6e4a2b", "#3a342c", "#9a6f45" } },
            { "deer", new[] { "#a5794f", "#5b3d24", "#d1a878" } },
            { "penguin", new[] { "#2b3a4a", "#14100c", "#f2f6fa" } },
            { "camel", new[] { "#c49a5c", "#8a6432", "#e8c890" } },
            { "scorpion", new[] { "#7a4a20", "#3a2410", "#b0763a" } },
            { "snake", new[] { "#4a7a3a", "#2a4a20", "#7aa85c" } },
            { "person", new[] { "#d9a066", "#3a342c", "#f2d0a0" } },
        };

        /// <summary>SPRITE_BASE[sprite] ?? SPRITE_BASE.wolf（未知族系回退 wolf）</summary>
        public static string[] SpriteBaseOf(string sprite)
        {
            string[] v;
            if (sprite != null && SPRITE_BASE.TryGetValue(sprite, out v)) return v;
            return SPRITE_BASE["wolf"];
        }

        /// <summary>emergence.ts visCacheMap：渲染缓存（模块级，race → VisCache）</summary>
        private static readonly Dictionary<int, WbVisCache> visCacheMap = new Dictionary<int, WbVisCache>();

        /// <summary>取/建某动态物种的渲染缓存（base = 根族系色板；emergence.ts visCacheFor 逐行机械翻译）</summary>
        public static WbVisCache VisCacheFor(int race, WbVis vis, string sprite)
        {
            if (vis == null) return null;
            WbVisCache hit;
            if (visCacheMap.TryGetValue(race, out hit)) return hit;
            string[] b = SpriteBaseOf(sprite);
            WbVisCache vc = new WbVisCache();
            vc.body = WbSprites.ShiftColor(b[0], vis);
            vc.dark = WbSprites.ShiftColor(b[1], vis, -0.04);
            vc.light = WbSprites.ShiftColor(b[2], vis, 0.05);
            vc.accent = WbSprites.ShiftColor(vis.pattern == 2 ? b[2] : b[1], vis, vis.glow != 0 ? 0.3 : 0.02);
            vc.size = vis.size;
            vc.bulk = vis.bulk;
            vc.horns = vis.horns;
            vc.spikes = vis.spikes != 0 ? 1 : 0;
            vc.mane = vis.mane != 0 ? 1 : 0;
            vc.tail = vis.tail;
            vc.ears = vis.ears;
            vc.glow = vis.glow != 0 ? 1 : 0;
            vc.pattern = vis.pattern;
            vc.crest = vis.crest != 0 ? 1 : 0;
            if (vis.glow != 0) vc.accent = "#7df9ff";
            visCacheMap[race] = vc;
            return vc;
        }

        /// <summary>使某物种渲染缓存失效（种化/读档后调用；race 缺省全清 —— emergence.ts invalidateVisCache）</summary>
        public static void InvalidateVisCache(int? race = null)
        {
            if (race == null) visCacheMap.Clear();
            else visCacheMap.Remove(race.Value);
        }
    }
}
