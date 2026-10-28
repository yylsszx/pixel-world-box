// WbMinimap.cs — M-U7e minimap 小地图战略层（蓝本 render.ts renderMinimap L3535-3579 机械翻译，纪律①）
// 蓝本契约（op 序）：
//   fillRect(DEEP_BG '#0d1b2e' 0,0,mw,mh) → drawImage(terrainCanvas→'terrain' blit 符号) →
//   [overlayMode≠'none' → dirty 时 redrawOverlay（宿主域）→ drawImage(overlayCanvas→'overlay' @ alpha 0.62)] →
//   单位点（def.isCiv && civ≥0 && civs[civ]?.alive → colorHex；否则 ZOMBIE '#64c95d'/DRAGON '#cf3f2e'/default '#f2ead8'；
//     boat 2×2（-1 偏移）否则 1×1；**蓝本无 dead 过滤——死单位照画**）→
//   建筑金点 '#ffd93d' → 燃烧格橙点 '#ff9b2d'（(fi%256)/256, (fi/256|0)/160）→ 活跃战线红点 '#ff4030' →
//   视口框 strokeRect('rgba(255,255,255,0.8)', 1, zx-zw/2, zy-zh/2, zw, zh)。
// 对账边界：drawImage 以符号 blit op 进 op 流（{o:'drawImage', a:[x,y,mw,mh], s:[srcTag:'terrain'|'overlay', alpha]}）——
//     canvas 间像素合成不进对账面（M-U4 syncStatic/M-U7d overlay 先例）；imageSmoothingEnabled 采样器状态为宿主域；
//     overlayDirty→redrawOverlay 触发语义以黄金 meta.redrawCalled 对账（重绘本体属 overlay 层 M-U7d 域）。
// 宿主协议：fireSet/activeBattles 以插入序 List 注入（蓝本 Set/Map 迭代序 = 插入序；C# HashSet/Dictionary 迭代序
//     不保证——宿主侧持有插入序快照）；buildings 以 [x,y] f64 对注入。
// 验证链：golden/minimap.json（gen-minimap.mjs 直跑 render.ts renderMinimap 真实现）→ minimap-transcript.mjs
//     （本文件 JS 镜像）→ verify 段 22 → WbGoldenTests.Test22_Minimap_Golden（用户侧 Unity Test Runner）。
using System;
using System.Collections.Generic;

namespace PixelWorldBox.Wb
{
    /// <summary>minimap 输入宿主包（blit 参数 + 战略层集合插入序 + 视口）</summary>
    public class WbMinimapHost
    {
        public int mw, mh;                    // minimap canvas 尺寸
        public double viewW, viewH;           // renderMinimap 第 5 参 view {w,h}
        public string overlayMode;            // engine.overlayMode（'none' 跳过 overlay blit）
        public List<int> fireSet;             // engine.fireSet 插入序（Set<number> 迭代序快照）
        public List<int> battles;             // engine.activeBattles.keys() 插入序（Map 迭代序快照）
        public List<double[]> buildings;      // engine.buildings 的 b.x/b.y（f64 对，插入序）
    }

    public static class WbMinimap
    {
        public const int W = 256, H = 160;
        const string DEEP_BG = "#0d1b2e";     // render.ts L10

        /// <summary>def.isCiv 解析（蓝本 RACES[u.race].isCiv 单表查询的 C# 分体等价——M-U7c RdefHost 协议同构：
        /// 基表 41 静态族优先，动态种族落 RdefHost；RACES[race] undefined 域蓝本为 TypeError，黄金保证 race 有效）</summary>
        static bool IsCivOf(WbRenderState st, int race)
        {
            if (WbRenderTables.RDEF.TryGetValue(race, out var d)) return d.isCiv;
            if (st.RdefHost != null)
            {
                var dd = st.RdefHost(race);
                if (dd != null) return dd.isCiv;
            }
            return false;
        }

        /// <summary>renderMinimap 机械翻译（minimap 层 op 流；每场景前宿主清 L）</summary>
        public static void RenderMinimap(WbRenderState st, List<WbU> units, WbMinimapHost h, WbDrawList L)
        {
            int mw = h.mw, mh = h.mh;
            L.Fill(DEEP_BG, 0, 0, mw, mh);
            L.Blit("terrain", 1, 0, 0, mw, mh);            // drawImage(engine.terrainCanvas, 0, 0, mw, mh)
            if (h.overlayMode != null && h.overlayMode != "none")
            {
                // if (engine.overlayDirty) engine.redrawOverlay() —— 触发事实以黄金 meta.redrawCalled 对账（宿主域）
                L.Blit("overlay", 0.62, 0, 0, mw, mh);     // globalAlpha=0.62 → drawImage(overlayCanvas) → globalAlpha=1
            }
            // units as dots（色决策：isCiv && civ 有效 && 国在世 → 国色；否则 zombie/dragon/default）
            foreach (var u in units)
            {
                string col;
                if (IsCivOf(st, u.race) && u.civ >= 0 && u.civ < st.civs.Count && st.civs[u.civ] != null && st.civs[u.civ].alive)
                    col = st.civs[u.civ].colorHex;
                else
                    col = u.race == WbConstants.R_ZOMBIE ? "#64c95d" : u.race == WbConstants.R_DRAGON ? "#cf3f2e" : "#f2ead8";
                // 殖民船 2×2 点（-1 偏移）更易追踪，普通 1×1
                if (u.boat != 0) L.Fill(col, (u.x / 256) * mw - 1, (u.y / 160) * mh - 1, 2, 2);
                else L.Fill(col, (u.x / 256) * mw, (u.y / 160) * mh, 1, 1);
            }
            // —— P1：小地图战略层 —— 建筑（金点）/ 燃烧格（橙点）/ 活跃战线（红点）
            if (h.buildings != null)
                foreach (var b in h.buildings)
                    L.Fill("#ffd93d", (b[0] / 256) * mw, (b[1] / 160) * mh, 1, 1);
            if (h.fireSet != null)
                foreach (int fi in h.fireSet)
                    L.Fill("#ff9b2d", ((fi % 256) / 256.0) * mw, ((fi / 256) / 160.0) * mh, 1, 1);
            //   蓝本 (((fi / 256) | 0) / 160)：fi 非负 int，C# 整数除法 ≡ JS |0 截断（域内等价）
            if (h.battles != null)
                foreach (int bi in h.battles)
                    L.Fill("#ff4030", ((bi % 256) / 256.0) * mw, ((bi / 256) / 160.0) * mh, 1, 1);
            // viewport rect
            double zx = (st.camX / 256) * mw;
            double zy = (st.camY / 160) * mh;
            double zw = (h.viewW / st.camZoom / 256) * mw;
            double zh = (h.viewH / st.camZoom / 160) * mh;
            L.Stroke("rgba(255,255,255,0.8)", 1, zx - zw / 2, zy - zh / 2, zw, zh);
        }
    }
}
