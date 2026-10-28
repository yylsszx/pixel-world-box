// WbOverlay.cs — M-U7d overlay 政治版图层（蓝本 engine.ts redrawOverlay L2374-2496 机械翻译，纪律①）
// 蓝本契约（六入口五模式）：
//   clearRect(0,0,1024,640) 后按 mode 分发：
//   ① political：owner 染色（civ.colorHex 4×4）+ 国界黑边 #09090b（左/右 2×4、上/下 4×2——x2/y2 预判与四向独立判定）；
//     无主/死国/空位跳过。
//   ② alliance：成员领地着联盟色（allianceOf.get(o) 查 alColor，未登记色兜底 #71717a），无盟国 #52525b；
//     阵营界 groupId = allianceOf.get(o) ?? -(o+1)*1001（无盟国按 civ 唯一分组）；gn 邻格：无主/死国 → 同组（无界）。
//   ③ density：4×4 tile 分桶（bw=64/bh=40）在世单位计数；五档色带 band = ≤1/≤3/≤7/≤14/其余；16×16 块染色；0 桶跳过。
//   ④ biome：逐 tile 六色矩阵——地形覆盖 DEEP #16324f/WATER #2d6a8f/MOUNTAIN #8a8f98/LAVA #7a1f14/BURNT #4a3b2f；
//     陆地温度×湿度（cold <90 / hot ≥165 / wet ≥128）→ 冰原/苔原/沙漠/雨林/针叶林/草原；**×2 pitch（块 4×4 重叠）**。
//   ⑤ temperature/humidity：五档色带（src/52 下界，钳 4）；只染陆地（DEEP/WATER 跳过）；海面统一暗染 rgba 一层。
// 宿主协议：overlayCanvas 的 alpha 0.62 合成（主管线 blit）与 minimap 缩放 blit 属宿主合成域（M-U4 syncStatic 先例，
//     canvas 间 drawImage 不进对账面）；overlayDirty 门控为宿主侧状态（RedrawOverlay 本体无条件重绘——蓝本同）。
// 验证链：golden/overlay.json（gen-overlay.mjs 直跑 src 真实现）→ overlay-transcript.mjs（本文件 JS 镜像）→
//     verify 段 21 → WbGoldenTests.Test21_Overlay_Golden（用户侧 Unity Test Runner）。
using System;
using System.Collections.Generic;

namespace PixelWorldBox.Wb
{
    /// <summary>overlay 输入宿主包（alliance 域阵营表 + 温湿场；owner/terrain/civs 在 WbRenderState）</summary>
    public class WbOverlayHost
    {
        public string mode;                                  // political/alliance/density/biome/temperature/humidity
        public List<WbAl> alliances;                         // 联盟表（id → 联盟色）
        public Dictionary<int, int> allianceOf;              // civId → 联盟 id
        public byte[] tempOverlay;                           // worldsim.tempOverlay（W*H，0-255）
        public byte[] moistMap;                              // engine.moistMap（W*H，0-255）
    }

    public class WbAl { public int id; public string colorHex; }

    public static class WbOverlay
    {
        public const int W = 256, H = 160;
        public static readonly int BW = (W + 3) / 4;         // Math.ceil(W/4) = 64
        public static readonly int BH = (H + 3) / 4;         // Math.ceil(H/4) = 40

        /// <summary>redrawOverlay 机械翻译（overlay 层 op 流；每场景前宿主清 L——蓝本 clearRect 首行）</summary>
        public static void RedrawOverlay(WbRenderState st, List<WbU> units, WbOverlayHost h, WbDrawList L)
        {
            L.Clear(0, 0, W * 4, H * 4);
            string mode = h.mode;
            if (mode == "political")
            {
                int[] owner = st.owner;
                for (int i = 0; i < W * H; i++)
                {
                    int o = owner[i];
                    if (o < 0) continue;
                    var civ = st.civs[o];
                    if (civ == null || !civ.alive) continue;
                    int x = i % W;
                    int y = i / W;
                    int px = x * 4;
                    int py = y * 4;
                    L.Fill(civ.colorHex, px, py, 4, 4);
                    // 国界描边：与邻格归属不同处画黑边（x2/y2 预判在描边前计算——蓝本序保真）
                    bool x2 = x < W - 1 && owner[i + 1] != o;
                    bool y2 = y < H - 1 && owner[i + W] != o;
                    if (x > 0 && owner[i - 1] != o) L.Fill("#09090b", px, py, 2, 4);
                    if (x2) L.Fill("#09090b", px + 2, py, 2, 4);
                    if (y > 0 && owner[i - W] != o) L.Fill("#09090b", px, py, 4, 2);
                    if (y2) L.Fill("#09090b", px, py + 2, 4, 2);
                }
            }
            else if (mode == "alliance")
            {
                // —— 联盟势力版图：成员领土着联盟色，无盟国灰暗，阵营间/无盟国间画黑界 ——
                var alColor = new Dictionary<int, string>();
                foreach (var al in h.alliances) alColor[al.id] = al.colorHex;
                int[] owner = st.owner;
                Func<int, int> groupId = (o) => h.allianceOf != null && h.allianceOf.TryGetValue(o, out var aid) ? aid : -(o + 1) * 1001;
                for (int i = 0; i < W * H; i++)
                {
                    int o = owner[i];
                    if (o < 0) continue;
                    var civ = st.civs[o];
                    if (civ == null || !civ.alive) continue;
                    int x = i % W;
                    int y = i / W;
                    int px = x * 4;
                    int py = y * 4;
                    int alId = h.allianceOf != null && h.allianceOf.TryGetValue(o, out var a2) ? a2 : (int?)null;
                    string fill = alId.HasValue ? (alColor.TryGetValue(alId.Value, out var c2) ? c2 : "#71717a") : "#52525b";
                    L.Fill(fill, px, py, 4, 4);
                    int g = groupId(o);
                    Func<int, int> gn = (j) =>
                    {
                        int o2 = owner[j];
                        if (o2 < 0 || st.civs[o2] == null || !st.civs[o2].alive) return g;
                        return groupId(o2);
                    };
                    if (x > 0 && gn(i - 1) != g) L.Fill("#09090b", px, py, 2, 4);
                    if (x < W - 1 && gn(i + 1) != g) L.Fill("#09090b", px + 2, py, 2, 4);
                    if (y > 0 && gn(i - W) != g) L.Fill("#09090b", px, py, 4, 2);
                    if (y < H - 1 && gn(i + W) != g) L.Fill("#09090b", px, py + 2, 4, 2);
                }
            }
            else if (mode == "density")
            {
                // 人口密度热力图：按 4x4 tile 分桶统计在世单位，五档色带（稀→密）
                var counts = new int[BW * BH];
                foreach (var u in units)
                {
                    if (u.dead != 0) continue;
                    int bx = Math.Min(BW - 1, Math.Max(0, (int)(u.x / 4)));
                    int by = Math.Min(BH - 1, Math.Max(0, (int)(u.y / 4)));
                    counts[by * BW + bx]++;
                }
                string[] ramp = { "#1d4e89", "#2e86ab", "#7fb069", "#f2c14e", "#d64530" };
                for (int by = 0; by < BH; by++)
                {
                    for (int bx = 0; bx < BW; bx++)
                    {
                        int n = counts[by * BW + bx];
                        if (n == 0) continue;
                        int band = n <= 1 ? 0 : n <= 3 ? 1 : n <= 7 ? 2 : n <= 14 ? 3 : 4;
                        L.Fill(ramp[band], bx * 16, by * 16, 16, 16);
                    }
                }
            }
            else if (mode == "biome")
            {
                // 生物群落分布图：温度 × 湿度 六群落；山地/岩浆/焦土按地形覆盖；海洋按深浅分染（×2 pitch）
                byte[] terrain = st.terrain;
                byte[] temp = h.tempOverlay;
                byte[] moist = h.moistMap;
                for (int i = 0; i < W * H; i++)
                {
                    int t = terrain[i];
                    int px = (i % W) * 2;
                    int py = (i / W) * 2;
                    string col;
                    if (t == WbRender.T_DEEP) col = "#16324f";
                    else if (t == WbRender.T_WATER) col = "#2d6a8f";
                    else if (t == WbRender.T_MOUNTAIN) col = "#8a8f98";
                    else if (t == WbRender.T_LAVA) col = "#7a1f14";
                    else if (t == WbRender.T_BURNT) col = "#4a3b2f";
                    else
                    {
                        bool cold = temp[i] < 90;
                        bool hot = temp[i] >= 165;
                        bool wet = moist[i] >= 128;
                        if (cold && !wet) col = "#dce8f2";           // 冰原（寒+干）
                        else if (cold && wet) col = "#9db8c9";       // 苔原（寒+湿）
                        else if (hot && !wet) col = "#e3c17a";       // 沙漠（热+干）
                        else if (hot && wet) col = "#3f9d4f";        // 雨林（热+湿）
                        else if (wet) col = "#2f7d4a";               // 针叶林/密林（温+湿）
                        else col = "#a8c56a";                        // 草原（温+干）
                    }
                    L.Fill(col, px, py, 4, 4);
                }
            }
            else
            {
                // 温度/湿度：五档色带，只染陆地（海洋保持原样以区分"无效区"）+ 海面统一暗染
                bool isTemp = mode == "temperature";
                string[] ramp = isTemp
                    ? new[] { "#4a7fd6", "#7db8e0", "#e0c050", "#e07830", "#d04030" }
                    : new[] { "#d6b878", "#b0a860", "#80a060", "#50a090", "#3878c0" };
                byte[] src = isTemp ? h.tempOverlay : h.moistMap;
                L.Fill(isTemp ? "rgba(20,40,70,0.35)" : "rgba(60,50,30,0.35)", 0, 0, W * 4, H * 4);
                byte[] terrain = st.terrain;
                for (int i = 0; i < W * H; i++)
                {
                    int t = terrain[i];
                    if (t == WbRender.T_DEEP || t == WbRender.T_WATER) continue;
                    int band = Math.Min(4, (int)(src[i] / 52));
                    L.Fill(ramp[band], (i % W) * 4, (i / W) * 4, 4, 4);
                }
            }
        }
    }
}
