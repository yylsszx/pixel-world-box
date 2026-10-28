// WbRender.cs — M-U4 渲染 I：地形/单位绘制管线（蓝本机械翻译，纪律①）
// 蓝本段：engine.ts flushDirty L14016-14297（地形 8×8 RGBA 烘焙：水深分层/variant 抖动/季节 tint/
//         软边抖动混合/坡向明暗/道路/疆域/辐射混合/特征聚簇）+ flushProps L14299-14440（道具层：
//         路/草/沙/丘/雪/焦土/雪人 + 树/山 bail）+ render.ts render L1246-1630（视口/清屏机/单位循环/
//         hp 条/恐慌/选中框）+ drawUnitSprite L2045 + drawUnitBody L2206（LOD 四档分发/阴影/幼体/
//         tiny/squash/中档人形/中档动物/全绘 bail）+ sunState/sunCached/drawCrown。
// 宿主协议：WbDrawList = canvas 命令流同构（fillRect/clearRect/strokeRect/save/restore/translate/scale/
//         setTransform）+ bail 契约（sprites.ts 域 = M-U5：drawTree/drawMountainProp/drawBoat/drawCaravan/
//         drawPerson(Fine)/drawQuadFine/全绘物种——宿主按 fn 名+基元参数消费精灵资产）。
//         地形段输出 8×8 RGBA 块（Tilemap 纹理数据源）；单位/道具段输出命令流（SpriteRenderer 布源）。
// 验证链：golden/render.json（gen-render.mjs 直跑 src 真实现）→ render-transcript.mjs（本文件 JS 镜像，
//         verify 段 11 十二段 ALL PASS）→ WbGoldenTests.Test11_Render_Golden（用户侧 Unity Test Runner）。
// 样式串语义：fillRect → s=[fillStyle]；strokeRect → s=[strokeStyle,lineWidth]；其余 op s=null（gen 同协议）。
// JS 语义注记：Math.round 半上取整（域内无负半界，Floor(v+0.5) 等价）；r|0 截断（(int)v）；
//         Uint8ClampedArray 写入钳制（Clamp8）；hsh 全程 u32（>>>0 = ToUint32 = mod 2^32，域内 <2^53 精确）。
using System;
using System.Collections.Generic;
using System.Globalization;

namespace PixelWorldBox.Wb
{
    // ================= 常量表（constants.ts / types.ts / render.ts 机械镜像） =================
    public static class WbRenderTables
    {
        public static readonly int[][] TERRAIN_RGB = {
            new[]{31,62,107}, new[]{56,113,163}, new[]{222,203,141}, new[]{104,152,60},
            new[]{72,116,50}, new[]{130,137,96}, new[]{122,122,126}, new[]{228,235,240},
            new[]{235,90,30}, new[]{66,58,51}, new[]{172,210,228}, new[]{88,96,50},
        };
        public static readonly int[][] WATER_TIER_RGB = {
            new[]{106,194,182}, new[]{79,149,171}, new[]{56,113,163},
        };
        public static readonly int[][] DEEP_TIER_RGB = {
            new[]{43,87,133}, new[]{30,58,102},
        };
        public static readonly bool[] SOFT_TERRAIN = { false,false,true,true,true,true,false,true,false,true,false,true };

        public class Lod { public string body, dark; public int w, h;
            public Lod(string b, string d, int w, int h) { body = b; dark = d; this.w = w; this.h = h; } }
        // render.ts L2131 ANIMAL_LOD：[body, dark, w, h]
        public static readonly Dictionary<string, Lod> ANIMAL_LOD = new Dictionary<string, Lod> {
            { "sheep",      new Lod("#d4dde4", "#575757", 3, 2) },
            { "wolf",       new Lod("#7a746b", "#3a342c", 3, 2) },
            { "snowwolf",   new Lod("#d4dde4", "#9aa8b4", 3, 2) },
            { "bear",       new Lod("#5e452c", "#3a342c", 4, 3) },
            { "deer",       new Lod("#b08054", "#6e4a2b", 3, 3) },
            { "penguin",    new Lod("#e8eef2", "#2a3440", 2, 3) },
            { "camel",      new Lod("#d8b878", "#b09050", 4, 3) },
            { "scorpion",   new Lod("#8a4a22", "#5a2f14", 3, 2) },
            { "snake",      new Lod("#5f7a3e", "#3f5528", 3, 1) },
            { "dragon",     new Lod("#9c2f26", "#5f1b15", 5, 4) },
            { "skeleton",   new Lod("#e2ded2", "#a8a294", 2, 3) },
            { "demon",      new Lod("#8a2f28", "#4a1815", 3, 3) },
            { "mage",       new Lod("#e8d5c0", "#9b59d0", 2, 3) },
            { "troll",      new Lod("#7a8a5a", "#55613c", 4, 4) },
            { "ogre",       new Lod("#a08552", "#6e5a36", 4, 4) },
            { "whitewalker",new Lod("#bcd4de", "#7d97a4", 2, 3) },
            { "vampire",    new Lod("#4a3a50", "#2c2230", 2, 3) },
            { "kraken",     new Lod("#6a4a8a", "#46305e", 4, 3) },
            { "sandworm",   new Lod("#c8ad6e", "#a08a52", 4, 2) },
            { "basilisk",   new Lod("#6a8848", "#46602e", 4, 3) },
            { "chicken",    new Lod("#f6f1e4", "#b07a3a", 2, 2) },
            { "pig",        new Lod("#e8a8a0", "#a86058", 3, 2) },
            { "rabbit",     new Lod("#b8b0a4", "#6e685e", 2, 2) },
            { "fox",        new Lod("#d97b3c", "#8a4a1c", 3, 2) },
            { "fish",       new Lod("#9fd4d8", "#5a9aa8", 2, 1) },
            { "crab",       new Lod("#d94a3a", "#8a2418", 3, 2) },
            { "turtle",     new Lod("#4a7a3a", "#2e5424", 3, 2) },
            { "shark",      new Lod("#5a6a78", "#2e3a46", 4, 2) },
        };
        // render.ts L2164 QUAD_FINE
        public static readonly Dictionary<string, string> QUAD_FINE = new Dictionary<string, string> {
            { "wolf", "wolf" }, { "snowwolf", "snowwolf" }, { "sheep", "sheep" }, { "bear", "bear" }, { "deer", "deer" },
        };
        // RACES 渲染域子集（types.ts RACES 41 族机械镜像；vis/dynTint = 涌现域，基表全 false/null）
        // M-U7b+：visG = 涌现视觉基因组（蓝本 def.vis 本体——动态种 def 由宿主 RdefHost 注入，vis=true 且 visG!=null）
        public class RDef { public string sprite; public int maxAge; public bool aquatic, flying, vis; public string dynTint;
            public WbVis visG; public bool sandswim;   // 蓝本 def.sandswim（沙虫族系巨怪形态锚）
            public RDef(string s, int ma, bool aq, bool fl, bool vis = false, string dt = null)
            { sprite = s; maxAge = ma; aquatic = aq; flying = fl; this.vis = vis; dynTint = dt; } }
        public static readonly Dictionary<int, RDef> RDEF = new Dictionary<int, RDef> {
            { 0,  new RDef("person", 55, false, false) },
            { 1,  new RDef("person", 90, false, false) },
            { 2,  new RDef("person", 120, false, false) },
            { 3,  new RDef("person", 48, false, false) },
            { 4,  new RDef("person", 45, false, false) },
            { 5,  new RDef("person", 9999, false, false) },
            { 6,  new RDef("sheep", 26, false, false) },
            { 7,  new RDef("wolf", 22, false, false) },
            { 8,  new RDef("bear", 40, false, false) },
            { 9,  new RDef("dragon", 9999, false, true) },
            { 10, new RDef("deer", 20, false, false) },
            { 11, new RDef("penguin", 18, false, false) },
            { 12, new RDef("camel", 35, false, false) },
            { 13, new RDef("scorpion", 16, false, false) },
            { 14, new RDef("snake", 20, false, false) },
            { 15, new RDef("snowwolf", 24, false, false) },
            { 16, new RDef("skeleton", 9999, false, false) },
            { 17, new RDef("demon", 9999, false, false) },
            { 18, new RDef("mage", 200, false, false) },
            { 19, new RDef("person", 70, false, false) },
            { 20, new RDef("person", 34, false, false) },
            { 21, new RDef("troll", 400, false, false) },
            { 22, new RDef("ogre", 120, false, false) },
            { 23, new RDef("whitewalker", 9999, false, false) },
            { 24, new RDef("vampire", 9999, false, false) },
            { 25, new RDef("kraken", 9999, true, false) },
            { 26, new RDef("sandworm", 9999, false, false) },
            { 27, new RDef("basilisk", 400, false, false) },
            { 28, new RDef("angel", 9999, false, true) },
            { 29, new RDef("phoenix", 9999, false, true) },
            { 30, new RDef("ent", 9999, false, false) },
            { 31, new RDef("lich", 9999, false, false) },
            { 32, new RDef("hydra", 9999, false, false) },
            { 33, new RDef("chicken", 14, false, false) },
            { 34, new RDef("pig", 22, false, false) },
            { 35, new RDef("rabbit", 12, false, false) },
            { 36, new RDef("fox", 18, false, false) },
            { 37, new RDef("fish", 10, true, false) },
            { 38, new RDef("crab", 16, true, false) },
            { 39, new RDef("turtle", 120, true, false) },
            { 40, new RDef("shark", 40, true, false) },
        };
    }

    // ================= 绘制命令流（canvas ops 同构；宿主 = Unity Tilemap/SpriteRenderer 布源） =================
    public class WbDrawOp
    {
        public string o;          // fillRect/clearRect/strokeRect/save/restore/translate/scale/setTransform
        public double[] a;        // 参数（f64 语义；测试序列化 → f64 bits hex 小端）
        public object[] s;        // 样式：fillRect→[fillStyle:string]；strokeRect→[strokeStyle:string,lineWidth:double]；其余 null
    }
    public class WbBail
    {
        public string fn;         // sprites.ts 函数名（M-U5 宿主精灵域）
        public string[] a;        // 基元参数（f64 bits hex 或 null；契约见 gen-render.mjs BAIL_ARGS）
    }
    public class WbDrawList
    {
        public List<WbDrawOp> ops = new List<WbDrawOp>();
        public List<WbBail> bails = new List<WbBail>();
        public void Fill(string style, double x, double y, double w, double h)
        { ops.Add(new WbDrawOp { o = "fillRect", a = new[] { x, y, w, h }, s = new object[] { style } }); }
        public void Clear(double x, double y, double w, double h)
        { ops.Add(new WbDrawOp { o = "clearRect", a = new[] { x, y, w, h }, s = null }); }
        public void Stroke(string style, double lw, double x, double y, double w, double h)
        { ops.Add(new WbDrawOp { o = "strokeRect", a = new[] { x, y, w, h }, s = new object[] { style, lw } }); }
        public void Bail(string fn, params string[] aHex)
        { bails.Add(new WbBail { fn = fn, a = aHex }); }
        public void Tag(string o, params double[] a)
        { ops.Add(new WbDrawOp { o = o, a = a, s = null }); }
    }

    // ================= 渲染输入状态（SOA → Tilemap/Sprite 数据源；黄金场景直灌） =================
    public class WbRenderState
    {
        public byte[] terrain;       // 256×160 地形 id（WbConstants.T 同值域）
        public byte[] variant;       // 0-255 确定性变体源
        public byte[] waterTier;     // 水深分层
        public byte[] snowman;       // 雪人装饰标记
        public int[] road;           // 道路强度（>0 混合）
        public int[] owner;          // 疆域 owner（-1 无主）
        public double[] radiate;     // 辐射强度（>0 混合）
        public byte[] glacier;       // worldsim.glacier（>80 冰川覆被 tint）
        public int season;           // nature.season（0春 1夏 2秋 3冬）
        public double ash;           // 火山灰
        public List<WbCiv> civs;     // 疆域混色源（color int[3] + alive）
        // 单位场景域
        public double camX, camY, camZoom;
        public long frameCount;
        public bool fxDayNight, fxHpBars;
        public int selectedId;
        public byte terrainAt;       // 单位所在 tile（水面门控；黄金场景单 tile 直灌）
        // 动态种族 def 宿主协议（M-U7c）：RDEF 基表只含 41 静态族；种化/读档产生的动态种族 def
        // （sprite/vis 基因组/aquatic/sandswim/flying）由宿主注入——蓝本 RACES[u.race] 单一注册表的 C# 分体等价
        public Func<int, WbRenderTables.RDef> RdefHost;

        public WbRenderState()
        {
            terrain = new byte[256 * 160]; variant = new byte[256 * 160]; waterTier = new byte[256 * 160];
            snowman = new byte[256 * 160]; road = new int[256 * 160]; owner = new int[256 * 160];
            radiate = new double[256 * 160]; glacier = new byte[256 * 160];
            civs = new List<WbCiv>();
        }
    }

    public static class WbRender
    {
        public const int W = 256, H = 160;
        public const int T_DEEP = 0, T_WATER = 1, T_SAND = 2, T_GRASS = 3, T_FOREST = 4, T_HILL = 5,
                         T_MOUNTAIN = 6, T_SNOW = 7, T_LAVA = 8, T_BURNT = 9, T_ICE = 10, T_SWAMP = 11;
        const int W2 = 1024, H2 = 640; // 用户空间（worldCanvas 设备 2048×1280 经 ×2 基变换）

        // ---------------- JS 语义工具 ----------------
        public static string F64Hex(double v)
        {
            long bits = BitConverter.DoubleToInt64Bits(v);
            byte[] b = BitConverter.GetBytes(bits); // LE 机器直接小端
            var c = new char[16];
            for (int i = 0; i < 8; i++)
            {
                c[i * 2] = HexC(b[i] >> 4); c[i * 2 + 1] = HexC(b[i] & 15);
            }
            return new string(c);
        }
        static char HexC(int v) { return v < 10 ? (char)('0' + v) : (char)('a' + v - 10); }
        static uint Imul32(uint a, uint b) { return unchecked(a * b); }
        static uint ToU32(double v) { return (uint)(ulong)v; } // 域内 0≤v<2^53 精确；>>>0 = mod 2^32
        static byte Clamp8(double v) { return v < 0 ? (byte)0 : v > 255 ? (byte)255 : (byte)(int)v; }
        static int Trunc(double v) { return (int)v; }          // JS |0 截断
        static long JsRound(double v) { return (long)Math.Floor(v + 0.5); } // JS Math.round 半上（域内无负半界）
        // JS toFixed(3)（域内 [0.15,0.24] 非负小数；ties 取大 = +0.5 floor）
        static string ToFixed3(double v) { long n = (long)Math.Floor(v * 1000.0 + 0.5); return "0." + n.ToString("D3", CultureInfo.InvariantCulture); }

        // ================= 段 1：地形烘焙（engine.ts flushDirty 机械翻译） =================
        // 输出 256 字节 = 8×8 px × RGBA —— Unity Tilemap 纹理数据源
        public static void TerrainBake(WbRenderState st, int i, byte[] px)
        {
            int x = i % W, y = i / W;
            const int WATER_LEN = 3, DEEP_LEN = 2, TR_LEN = 12;
            int t = st.terrain[i];
            int variant = st.variant[i];
            int waterTier = st.waterTier[i];
            int[] baseC;
            if (t == T_WATER) baseC = waterTier <= 2 ? (waterTier < WATER_LEN ? WbRenderTables.WATER_TIER_RGB[waterTier] : WbRenderTables.TERRAIN_RGB[1]) : WbRenderTables.TERRAIN_RGB[1];
            else if (t == T_DEEP) baseC = waterTier >= 3 ? (waterTier - 3 < DEEP_LEN ? WbRenderTables.DEEP_TIER_RGB[waterTier - 3] : WbRenderTables.TERRAIN_RGB[0]) : WbRenderTables.TERRAIN_RGB[0];
            else baseC = t < TR_LEN ? WbRenderTables.TERRAIN_RGB[t] : WbRenderTables.TERRAIN_RGB[0];
            int v = (variant % 13) - 6;
            int[] tint = NatureTint(t, y, st.season, st.ash, st.glacier[i]);
            double r = baseC[0] + v + tint[0];
            double g = baseC[1] + v + tint[1];
            double b = baseC[2] + v + tint[2];
            // 软群系边缘抖动混合（西北邻优先序 L→R→T→B；hardPair 0.5 其余 0.32）
            if (WbRenderTables.SOFT_TERRAIN[t])
            {
                int nb = -1;
                int nL = x > 0 ? st.terrain[i - 1] : -1, nR = x < W - 1 ? st.terrain[i + 1] : -1;
                int nT = y > 0 ? st.terrain[i - W] : -1, nB = y < H - 1 ? st.terrain[i + W] : -1;
                if (nL >= 0 && nL != t && WbRenderTables.SOFT_TERRAIN[nL]) nb = nL;
                else if (nR >= 0 && nR != t && WbRenderTables.SOFT_TERRAIN[nR]) nb = nR;
                else if (nT >= 0 && nT != t && WbRenderTables.SOFT_TERRAIN[nT]) nb = nT;
                else if (nB >= 0 && nB != t && WbRenderTables.SOFT_TERRAIN[nB]) nb = nB;
                if (nb >= 0 && ((variant + x + y) & 1) == 0)
                {
                    bool hardPair = (t == T_GRASS && (nb == T_SAND || nb == T_SNOW))
                        || (t == T_SAND && nb == T_GRASS) || (t == T_SNOW && nb == T_GRASS);
                    double a = hardPair ? 0.5 : 0.32;
                    int[] bc = WbRenderTables.TERRAIN_RGB[nb];
                    r = r * (1 - a) + bc[0] * a;
                    g = g * (1 - a) + bc[1] * a;
                    b = b * (1 - a) + bc[2] * a;
                }
            }
            // 坡向明暗（hillshade）：西北邻高遮光 / 东南邻高受光
            if (t == T_HILL || t == T_MOUNTAIN)
            {
                int nTL = x > 0 && y > 0 ? st.terrain[i - W - 1] : -1;
                int nBR = x < W - 1 && y < H - 1 ? st.terrain[i + W + 1] : -1;
                int slope = 0;
                if (x > 0 && y > 0) slope += Elev(nTL);
                if (x < W - 1 && y < H - 1) slope -= Elev(nBR);
                if (slope > 0) { double k = Math.Min(0.16, slope * 0.08); r *= 1 - k; g *= 1 - k; b *= 1 - k; }
                else if (slope < 0) { double k = Math.Min(0.12, -slope * 0.06); r += 30 * k; g += 30 * k; b += 26 * k; }
            }
            // 道路混色
            if (st.road[i] > 0) { r = r * 0.5 + 178 * 0.5; g = g * 0.5 + 156 * 0.5; b = b * 0.5 + 114 * 0.5; }
            // 疆域混色（边界 0.45 / 内部 0.22）
            int o = st.owner[i];
            if (o >= 0)
            {
                WbCiv civ = o < st.civs.Count ? st.civs[o] : null;
                if (civ != null && civ.alive && civ.color != null)
                {
                    int oL = x > 0 ? st.owner[i - 1] : -9, oR = x < W - 1 ? st.owner[i + 1] : -9;
                    int oT = y > 0 ? st.owner[i - W] : -9, oB = y < H - 1 ? st.owner[i + W] : -9;
                    bool border = false;
                    if (x > 0 && oL != o) border = true;
                    else if (x < W - 1 && oR != o) border = true;
                    else if (y > 0 && oT != o) border = true;
                    else if (y < H - 1 && oB != o) border = true;
                    double a = border ? 0.45 : 0.22;
                    r = r * (1 - a) + civ.color[0] * a;
                    g = g * (1 - a) + civ.color[1] * a;
                    b = b * (1 - a) + civ.color[2] * a;
                }
            }
            // 辐射混色
            if (st.radiate[i] > 0) { r = r * 0.6 + 100 * 0.4; g = g * 0.6 + 230 * 0.4; b = b * 0.6 + 90 * 0.4; }
            // 8×8 平涂烘焙（fineNoise 二值细噪点 → 聚簇特征 dot）
            int r0 = Trunc(r), g0 = Trunc(g), b0 = Trunc(b);
            uint hsh = ToU32(variant * 2654435761.0 + i * 97.0);
            bool fineNoise = t == T_GRASS || t == T_FOREST || t == T_SAND;
            for (int sy = 0; sy < 8; sy++)
            {
                for (int sx = 0; sx < 8; sx++)
                {
                    int pr = r0, pg = g0, pb = b0;
                    if (fineNoise)
                    {
                        uint nz = (hsh ^ Imul32((uint)((sy << 3) | sx), 2246822519u));
                        int nzz = (int)((nz >> 10) % 20);
                        if (nzz < 3) { int d = (nzz & 1) == 0 ? 2 : -2; pr += d; pg += d; pb += d; }
                    }
                    int off = (sy * 8 + sx) * 4;
                    px[off] = Clamp8(pr); px[off + 1] = Clamp8(pg); px[off + 2] = Clamp8(pb); px[off + 3] = 255;
                }
            }
            switch (t)
            {
                case T_GRASS:
                case T_FOREST:
                {
                    int n = 1 + (int)(hsh & 1);
                    for (int k = 0; k < n; k++)
                    {
                        int sx = (int)((hsh >> (k * 3 + 2)) & 7);
                        int sy = (int)((hsh >> (k * 3 + 5)) & 6);
                        bool lit = ((hsh >> (k * 5)) & 1) == 1;
                        int dr2 = lit ? 14 : -16;
                        Dot(px, r0, g0, b0, sx, sy, dr2, Trunc(dr2 * 1.4), Trunc(dr2 * 0.4), 1, 2);
                    }
                    if (hsh % 37 == 0)
                    {
                        int fx = (int)((hsh >> 4) & 7), fy = (int)((hsh >> 9) & 7), kind = (int)((hsh >> 3) & 3);
                        if (kind == 0) Dot(px, r0, g0, b0, fx, fy, 52, -20, 18, 1, 1);
                        else if (kind == 1) Dot(px, r0, g0, b0, fx, fy, 58, 44, -24, 1, 1);
                        else Dot(px, r0, g0, b0, fx, fy, 64, 62, 54, 1, 1);
                        Dot(px, r0, g0, b0, Math.Min(7, fx + 1), fy, -6, 10, -4, 1, 1);
                    }
                    break;
                }
                case T_SAND:
                {
                    int rx = (int)((hsh >> 3) & 6), ry = (int)((hsh >> 6) & 7);
                    Dot(px, r0, g0, b0, rx, ry, -12, -9, -4, 3, 1);
                    if ((hsh & 1) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 9) & 6), (int)((hsh >> 12) & 7), -10, -7, -3, 2, 1);
                    if ((hsh & 3) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 15) & 7), (int)((hsh >> 18) & 7), 15, 12, 5, 1, 1);
                    int nL = x > 0 ? st.terrain[i - 1] : -1, nR = x < W - 1 ? st.terrain[i + 1] : -1;
                    int nT = y > 0 ? st.terrain[i - W] : -1, nB = y < H - 1 ? st.terrain[i + W] : -1;
                    bool xL = x > 0 && IsWater(nL), xR = x < W - 1 && IsWater(nR);
                    bool yT = y > 0 && IsWater(nT), yB = y < H - 1 && IsWater(nB);
                    if (xL) Dot(px, r0, g0, b0, 0, 0, -22, -16, -6, 1, 8);
                    if (xR) Dot(px, r0, g0, b0, 7, 0, -22, -16, -6, 1, 8);
                    if (yT) Dot(px, r0, g0, b0, 0, 0, -22, -16, -6, 8, 1);
                    if (yB) Dot(px, r0, g0, b0, 0, 7, -22, -16, -6, 8, 1);
                    break;
                }
                case T_WATER:
                {
                    if (waterTier <= 1 && (hsh & 3) == 0)
                        Dot(px, r0, g0, b0, (int)((hsh >> 4) & 6), (int)((hsh >> 7) & 7), 22, 30, 40, 2, 1);
                    int nL = x > 0 ? st.terrain[i - 1] : -1, nR = x < W - 1 ? st.terrain[i + 1] : -1;
                    int nT = y > 0 ? st.terrain[i - W] : -1, nB = y < H - 1 ? st.terrain[i + W] : -1;
                    bool landL = x > 0 && nL != T_WATER && nL != T_DEEP;
                    bool landR = x < W - 1 && nR != T_WATER && nR != T_DEEP;
                    bool landT = y > 0 && nT != T_WATER && nT != T_DEEP;
                    bool landB = y < H - 1 && nB != T_WATER && nB != T_DEEP;
                    if (landL || landR || landT || landB)
                    {
                        const int fo = 46, fg = 54, fb = 56;
                        if (landL) { Dot(px, r0, g0, b0, 0, (int)((hsh >> 5) & 6), fo, fg, fb, 1, 2); Dot(px, r0, g0, b0, 0, (int)(((hsh >> 8) & 5)) + 3, Trunc(fo * 0.7), Trunc(fg * 0.7), Trunc(fb * 0.7), 1, 1); }
                        if (landR) { Dot(px, r0, g0, b0, 7, (int)((hsh >> 5) & 6), fo, fg, fb, 1, 2); Dot(px, r0, g0, b0, 7, (int)(((hsh >> 8) & 5)) + 3, Trunc(fo * 0.7), Trunc(fg * 0.7), Trunc(fb * 0.7), 1, 1); }
                        if (landT) { Dot(px, r0, g0, b0, (int)((hsh >> 5) & 6), 0, fo, fg, fb, 2, 1); Dot(px, r0, g0, b0, (int)(((hsh >> 8) & 5)) + 3, 0, Trunc(fo * 0.7), Trunc(fg * 0.7), Trunc(fb * 0.7), 1, 1); }
                        if (landB) { Dot(px, r0, g0, b0, (int)((hsh >> 5) & 6), 7, fo, fg, fb, 2, 1); Dot(px, r0, g0, b0, (int)(((hsh >> 8) & 5)) + 3, 7, Trunc(fo * 0.7), Trunc(fg * 0.7), Trunc(fb * 0.7), 1, 1); }
                    }
                    break;
                }
                case T_SNOW:
                    if ((hsh & 1) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 3) & 7), (int)((hsh >> 6) & 7), 20, 20, 24, 1, 1);
                    if ((hsh & 3) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 9) & 7), (int)((hsh >> 12) & 7), 14, 15, 20, 1, 1);
                    if ((hsh & 7) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 15) & 6), (int)((hsh >> 18) & 7), -9, -8, -4, 2, 1);
                    break;
                case T_ICE:
                    if ((hsh & 3) == 0)
                    {
                        int cx = (int)((hsh >> 4) & 6), cy = (int)((hsh >> 7) & 6);
                        Dot(px, r0, g0, b0, cx, cy, -16, -20, -18, 1, 2);
                        Dot(px, r0, g0, b0, Math.Min(7, cx + 1), cy + 2, -14, -18, -16, 2, 1);
                    }
                    if ((hsh & 1) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 10) & 7), (int)((hsh >> 13) & 7), 24, 28, 32, 1, 1);
                    break;
                case T_MOUNTAIN:
                case T_HILL:
                    if (hsh % 9 < 5) { int cx = (int)((hsh >> 3) & 7), cy = (int)((hsh >> 6) & 5); Dot(px, r0, g0, b0, cx, cy, -20, -18, -16, 1, 3); }
                    if ((hsh & 3) == 0) { int cx = (int)((hsh >> 3) & 7), cy = (int)((hsh >> 6) & 5); Dot(px, r0, g0, b0, Math.Max(0, cx - 2), cy + 1, 15, 14, 12, 2, 2); }
                    if ((hsh & 15) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 12) & 7), (int)((hsh >> 15) & 7), -30, -28, -26, 1, 1);
                    break;
                case T_LAVA:
                {
                    int cx = (int)((hsh >> 3) & 5), cy = (int)((hsh >> 6) & 5);
                    Dot(px, r0, g0, b0, cx, cy, -44, -28, -6, 3, 3);
                    Dot(px, r0, g0, b0, cx + 3, cy, 56, 26, -8, 1, 2);
                    Dot(px, r0, g0, b0, cx, cy + 3, 50, 22, -8, 2, 1);
                    break;
                }
                case T_SWAMP:
                {
                    if ((hsh & 3) != 3)
                    {
                        int mx = (int)((hsh >> 3) & 5), my = (int)((hsh >> 6) & 5);
                        Dot(px, r0, g0, b0, mx, my, -14, -10, -8, 3, 2);
                        if ((hsh & 1) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 9) & 6), (int)((hsh >> 12) & 6), 10, 8, -6, 2, 1);
                    }
                    int reeds = hsh % 9 < 4 ? 1 + (int)((hsh >> 20) & 1) : 0;
                    for (int k = 0; k < reeds; k++)
                    {
                        int rx = (int)((hsh >> (k * 4 + 2)) & 7), ry = (int)((hsh >> (k * 4 + 6)) & 5);
                        bool lit = ((hsh >> (k * 7)) & 1) == 1;
                        Dot(px, r0, g0, b0, rx, ry, lit ? -26 : -40, lit ? -22 : -32, lit ? -6 : -12, 1, 3);
                    }
                    if (hsh % 16 == 0) Dot(px, r0, g0, b0, (int)((hsh >> 14) & 7), (int)((hsh >> 18) & 7), -6, -20, -10, 1, 1);
                    int nL2 = x > 0 ? st.terrain[i - 1] : -1, nR2 = x < W - 1 ? st.terrain[i + 1] : -1;
                    int nT2 = y > 0 ? st.terrain[i - W] : -1, nB2 = y < H - 1 ? st.terrain[i + W] : -1;
                    bool xLw = x > 0 && IsWater(nL2), xRw = x < W - 1 && IsWater(nR2);
                    bool yTw = y > 0 && IsWater(nT2), yBw = y < H - 1 && IsWater(nB2);
                    if (xLw || xRw || yTw || yBw)
                    {
                        if (xLw) Dot(px, r0, g0, b0, 0, 0, -20, -14, -10, 1, 8);
                        if (xRw) Dot(px, r0, g0, b0, 7, 0, -20, -14, -10, 1, 8);
                        if (yTw) Dot(px, r0, g0, b0, 0, 0, -20, -14, -10, 8, 1);
                        if (yBw) Dot(px, r0, g0, b0, 0, 7, -20, -14, -10, 8, 1);
                    }
                    break;
                }
                case T_BURNT:
                    Dot(px, r0, g0, b0, (int)((hsh >> 4) & 7), (int)((hsh >> 6) & 7), -12, -10, -6, 2, 1);
                    if ((hsh & 3) == 0) Dot(px, r0, g0, b0, (int)((hsh >> 9) & 7), (int)((hsh >> 11) & 7), 30, 10, -6, 1, 1);
                    break;
            }
        }
        static int Elev(int tt) { return tt == T_MOUNTAIN ? 2 : tt == T_HILL ? 1 : 0; }
        static bool IsWater(int tt) { return tt == T_WATER || tt == T_DEEP; }
        // dot 特征块写入器（8×8 网格 w×h 块；r0+dr 钳制写入 —— flushDirty 闭包机械翻译）
        static void Dot(byte[] px, int r0, int g0, int b0, int sx, int sy, int dr, int dg, int db, int w, int h)
        {
            int x1 = Math.Min(8, sx + w), y1 = Math.Min(8, sy + h);
            for (int yy = Math.Max(0, sy); yy < y1; yy++)
                for (int xx = Math.Max(0, sx); xx < x1; xx++)
                {
                    int off = (yy * 8 + xx) * 4;
                    px[off] = Clamp8(r0 + dr); px[off + 1] = Clamp8(g0 + dg); px[off + 2] = Clamp8(b0 + db);
                }
        }
        // nature.tint 机械翻译（glacier 覆被/季节 tint/火山灰）
        static int[] NatureTint(int t, int y, int season, double ash, byte glacier)
        {
            if (glacier > 80)
            {
                double a = Math.Min(1, (glacier - 80) / 100.0);
                return new[] { (int)Math.Round(38 + 8 * a), (int)Math.Round(40 + 9 * a), (int)Math.Round(52 + 16 * a) };
            }
            int s = season;
            if (s == 1 && ash < 0.05) return new[] { 0, 0, 0 };
            double latF = Math.Abs(y / (double)H - 0.5) * 2;
            int r = 0, g = 0, b = 0;
            if (s == 0)
            {
                if (t == T_GRASS) { r = -6; g = 22; b = -8; }
                else if (t == T_FOREST) { r = -4; g = 18; b = -6; }
            }
            else if (s == 2)
            {
                double f = 0.35 + latF * 0.4;
                if (t == T_GRASS) { r = (int)Math.Round(38 * f); g = (int)Math.Round(14 * f); b = (int)Math.Round(-30 * f); }
                else if (t == T_FOREST) { r = (int)Math.Round(44 * f); g = (int)Math.Round(4 * f); b = (int)Math.Round(-36 * f); }
                else if (t == T_HILL) { r = (int)Math.Round(14 * f); g = (int)Math.Round(2 * f); b = (int)Math.Round(-12 * f); }
            }
            else if (s == 3)
            {
                double f = Math.Max(0, latF - 0.22) * 1.25;
                if (t == T_GRASS) { r = (int)Math.Round(62 * f); g = (int)Math.Round(58 * f); b = (int)Math.Round(52 * f); }
                else if (t == T_FOREST) { r = (int)Math.Round(46 * f); g = (int)Math.Round(42 * f); b = (int)Math.Round(38 * f); }
                else if (t == T_HILL) { r = (int)Math.Round(40 * f); g = (int)Math.Round(38 * f); b = (int)Math.Round(34 * f); }
                else if (t == T_SAND) { r = (int)Math.Round(26 * f); g = (int)Math.Round(26 * f); b = (int)Math.Round(26 * f); }
            }
            if (ash > 0.05)
            {
                double a = Math.Min(1, ash);
                r -= (int)Math.Round(26 * a); g -= (int)Math.Round(22 * a); b -= (int)Math.Round(14 * a);
                if (s == 1 && latF > 0.45)
                {
                    double f = (latF - 0.45) * a * 1.8;
                    r += (int)Math.Round(40 * f); g += (int)Math.Round(38 * f); b += (int)Math.Round(36 * f);
                }
            }
            return new[] { r, g, b };
        }

        // ================= 段 2：道具烘焙（engine.ts flushProps 机械翻译） =================
        public static void PropsBake(WbRenderState st, int i, WbDrawList L)
        {
            int x = i % W, y = i / W;
            int t = st.terrain[i];
            int variant = st.variant[i];
            L.Clear(x * 4 - 2, y * 4 - 3, 9, 10);
            if (t == T_FOREST)
            {
                // M-U5 宿主精灵域：drawTree(propsCtx, x, y, variant, season)
                L.Bail("drawTree", F64Hex(x), F64Hex(y), F64Hex(variant), F64Hex(st.season));
            }
            else if (t == T_MOUNTAIN)
            {
                double polar = Math.Abs(y / (double)H - 0.5) * 2;
                double cold = Math.Min(1, polar * 1.1 + (st.season == 3 ? 0.25 : st.season == 1 ? -0.1 : 0.05));
                L.Bail("drawMountainProp", F64Hex(x), F64Hex(y), F64Hex(variant), F64Hex(150 + (variant % 50)), F64Hex(cold));
            }
            else if (st.road[i] > 0)
            {
                uint h = ToU32(variant * 2654435761.0);
                if (h % 3 == 0)
                {
                    L.Fill("rgba(120,102,74,0.85)", x * 4 + (h & 1), y * 4 + ((h >> 1) & 1), 1, 1);
                    if (h % 6 == 0) L.Fill("rgba(160,142,110,0.8)", x * 4 + 1 - (h & 1), y * 4 + 1 - ((h >> 1) & 1), 1, 1);
                }
            }
            else if (t == T_GRASS)
            {
                uint h = ToU32(variant * 2654435761.0 + i * 40503.0);
                uint m = h % 31;
                if (m < 3)
                {
                    string[] FLOWER = { "#e5696d", "#ffd93d", "#f2ead8", "#c793e8" };
                    L.Fill(FLOWER[(h >> 5) & 3], x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
                }
                else if (m < 10)
                {
                    L.Fill("rgba(44,84,28,0.6)", x * 4 + (h & 1), y * 4, 1, 2);
                    L.Fill("rgba(70,120,44,0.55)", x * 4 + 1 - (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
                }
                else if (m == 10)
                {
                    L.Fill("rgba(148,144,136,0.8)", x * 4 + (h & 1), y * 4 + ((h >> 4) & 1), 1, 1);
                }
            }
            else if (t == T_SAND)
            {
                uint h = ToU32(variant * 2654435761.0 + i * 9127.0);
                if (h % 13 == 0)
                {
                    L.Fill("rgba(238,222,168,0.55)", x * 4, y * 4 + (h & 1), 2, 1);
                    L.Fill("rgba(214,192,140,0.5)", x * 4 + (h & 1), y * 4 + 1 - (h & 1), 1, 1);
                }
                else if (h % 37 == 0)
                {
                    L.Fill("rgba(178,158,120,0.7)", x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
                }
            }
            else if (t == T_HILL)
            {
                uint h = ToU32(variant * 2654435761.0 + i * 7907.0);
                if (h % 17 == 0) L.Fill("rgba(96,104,54,0.6)", x * 4 + (h & 1), y * 4, 1, 2);
                else if (h % 41 == 0) L.Fill("rgba(118,116,110,0.7)", x * 4 + (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
            }
            else if (t == T_SNOW)
            {
                uint h = ToU32(variant * 2654435761.0 + i * 1543.0);
                if (h % 19 == 0) L.Fill("rgba(222,240,252,0.85)", x * 4 + (h & 1), y * 4 + ((h >> 3) & 1), 1, 1);
            }
            else if (t == T_BURNT)
            {
                uint h = ToU32(variant * 2654435761.0 + i * 3571.0);
                if (h % 11 == 0)
                {
                    L.Fill("rgba(28,22,18,0.7)", x * 4 + (h & 1), y * 4 + ((h >> 2) & 1), 1, 1);
                    L.Fill("rgba(28,22,18,0.7)", x * 4 + (h & 1), y * 4 + 1 - ((h >> 2) & 1), 1, 1);
                }
            }
            if (st.snowman[i] != 0)
            {
                double px = x * 4, py = y * 4;
                L.Fill("rgba(52,70,92,0.42)", px, py + 1, 1, 3);
                L.Fill("rgba(52,70,92,0.42)", px + 3, py + 1, 1, 3);
                L.Fill("rgba(52,70,92,0.42)", px + 1, py - 1, 2, 1);
                L.Fill("rgba(52,70,92,0.42)", px + 1, py + 4, 2, 1);
                L.Fill("rgba(96,74,50,0.9)", px, py + 2, 1, 1);
                L.Fill("rgba(96,74,50,0.9)", px + 3, py + 2, 1, 1);
                L.Fill("#dbe9f4", px + 1, py + 2, 2, 2);
                L.Fill("rgba(150,180,205,0.65)", px + 1, py + 3, 2, 1);
                L.Fill("#f4f9fd", px + 1, py, 2, 2);
                L.Fill("#3a3226", px + 1, py, 1, 1);
                L.Fill("#e08a3c", px + 2, py + 1, 1, 1);
            }
        }

        // ================= 段 3：单位绘制决策（render.ts render/drawUnitSprite/drawUnitBody 机械翻译） =================
        // render.ts 模块态：清屏机（lastWcClear）+ 太阳帧缓存（跨场景序确定 → 确定）
        sealed class ClearBox { public double x0, y0, x1, y1; }
        static ClearBox lastWcClear = null;
        static long sunCacheFrame = -1;
        static double sunLevel = 1, sunSx = 1, sunSy = 0.45, sunLen = 0.6;
        static string sunUnitShadowStyle = "rgba(12,9,6,0.24)";

        // engine.sunState（昼夜太阳：晨升午盛暮敛月弧破晓翻转）
        public static void SunState(double p, out double level, out double sx, out double sy, out double len)
        {
            const double DAY = 0.40, DUSK = 0.52, NIGHT_END = 0.88;
            double lv, ax, ay;
            if (p < DAY)
            {
                double t = p / DAY;
                lv = 0.35 + 0.65 * WbMath.FdSin(t * Math.PI);
                ax = -WbMath.FdCos(t * Math.PI);
                ay = 0.45;
            }
            else if (p < DUSK)
            {
                double t = (p - DAY) / (DUSK - DAY);
                lv = 0.35 * (1 - t) + 0.18 * t;
                ax = 1; ay = 0.4;
            }
            else if (p < NIGHT_END)
            {
                lv = 0.16 + 0.05 * WbMath.FdSin((p - DUSK) * Math.PI / (NIGHT_END - DUSK));
                ax = 1; ay = 0.3;
            }
            else
            {
                double t = (p - NIGHT_END) / (1 - NIGHT_END);
                lv = 0.18 + (0.35 - 0.18) * t;
                ax = 1 * (1 - t) + (-1) * t;
                ay = 0.4;
            }
            level = lv; sx = ax; sy = ay;
            len = 0.6 + 2.2 * (1 - lv);
        }
        // render.ts sunCached 帧缓存（level → 阴影色串 toFixed(3)）
        static void SunCached(long frameCount)
        {
            if (sunCacheFrame != frameCount)
            {
                double p = (frameCount % 2400) / 2400.0;
                SunState(p, out sunLevel, out sunSx, out sunSy, out sunLen);
                sunUnitShadowStyle = "rgba(12,9,6," + ToFixed3(0.15 + 0.09 * (1 - sunLevel)) + ")";
                sunCacheFrame = frameCount;
            }
        }
        // render.ts drawCrown（金冠 4 rect）
        static void DrawCrown(WbDrawList L, double cx, double baseY)
        {
            L.Fill("#e6ba6c", cx - 1, baseY, 3, 1);
            L.Fill("#e6ba6c", cx - 1, baseY - 1, 1, 1);
            L.Fill("#e6ba6c", cx + 1, baseY - 1, 1, 1);
            L.Fill("#ffe9a8", cx, baseY - 1, 1, 1);
        }

        // render() 单位场景（视口 → 清屏机 → 层 B save/scale → 单位循环 → restore）
        public static void UnitScene(WbRenderState st, List<WbU> units, WbDrawList L)
        {
            double zoom = st.camZoom;
            double halfW = 1024 / zoom / 2 + 3, halfH = 640 / zoom / 2 + 3;
            double x0 = st.camX - halfW, x1 = st.camX + halfW, y0 = st.camY - halfH, y1 = st.camY + halfH;
            L.Tag("setTransform", 2, 0, 0, 2, 0, 0);
            {
                double m = 22 * 4;
                double vx0 = Math.Max(0, Math.Floor(x0 * 4) - m);
                double vy0 = Math.Max(0, Math.Floor(y0 * 4) - m);
                double vx1 = Math.Min(W2, Math.Ceiling(x1 * 4) + m);
                double vy1 = Math.Min(H2, Math.Ceiling(y1 * 4) + m);
                if (lastWcClear != null)
                {
                    L.Clear(Math.Min(vx0, lastWcClear.x0), Math.Min(vy0, lastWcClear.y0),
                        Math.Max(vx1, lastWcClear.x1) - Math.Min(vx0, lastWcClear.x0),
                        Math.Max(vy1, lastWcClear.y1) - Math.Min(vy0, lastWcClear.y0));
                }
                else
                {
                    L.Clear(0, 0, W2, H2);
                }
                if (lastWcClear == null) lastWcClear = new ClearBox();
                lastWcClear.x0 = vx0; lastWcClear.y0 = vy0; lastWcClear.x1 = vx1; lastWcClear.y1 = vy1;
            }
            L.Tag("save");
            L.Tag("scale", 2, 2);
            bool dayNight = st.fxDayNight;
            if (dayNight) SunCached(st.frameCount);
            foreach (var u in units)
            {
                if (u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
                WbCiv civ = u.civ >= 0 && u.civ < st.civs.Count ? st.civs[u.civ] : null;
                bool civAlive = civ != null && civ.alive;
                DrawUnitSprite(L, u, st, zoom, dayNight, civAlive ? civ : null);
                // 血条（zoom≥6 受损显示）
                if (st.fxHpBars && zoom >= 6 && u.hp < u.maxHp && u.boat == 0)
                {
                    double px = u.dpx ?? (u.rx ?? u.x) * 2;
                    double py = u.dpy ?? (u.ry ?? u.y) * 2;
                    const double w = 4;
                    double ratio = Math.Max(0, u.hp / u.maxHp);
                    L.Fill("rgba(20,16,12,0.75)", px - 1, py - 6, w, 1);
                    L.Fill(ratio > 0.5 ? "#5fc65b" : ratio > 0.25 ? "#ffd93d" : "#cf3f2e", px - 1, py - 6, Math.Max(1, JsRound(w * ratio)), 1);
                }
                // 恐慌标记（≥0.55 amber / ≥0.72 红「!」占空比闪烁）
                double pk = u.panic ?? 0;
                if (pk >= 0.55 && zoom >= 6 && u.boat == 0)
                {
                    double px = u.dpx ?? (u.rx ?? u.x) * 2;
                    double py = u.dpy ?? (u.ry ?? u.y) * 2;
                    double by = (st.fxHpBars && u.hp < u.maxHp) ? py - 7 : py - 5;
                    if (pk >= 0.72)
                    {
                        if (st.frameCount % 36 < 26)
                        {
                            L.Fill("#ef4444", px, by - 3, 1, 2);
                            L.Fill("#ef4444", px, by, 1, 1);
                        }
                    }
                    else
                    {
                        L.Fill("#f59e0b", px, by - 1, 2, 2);
                    }
                }
                // 选中框（船大一号）
                if (u.id == st.selectedId)
                {
                    double px = u.dpx ?? (u.rx ?? u.x) * 2;
                    double py = u.dpy ?? (u.ry ?? u.y) * 2;
                    if (u.boat != 0) L.Stroke("rgba(255,255,255,0.9)", 1, px - 3, py - 5, 7, 8);
                    else L.Stroke("rgba(255,255,255,0.9)", 1, px - 2, py - 3, 5, 6);
                }
            }
            L.Tag("restore");
        }

        /// <summary>蓝本 civ && civ.alive ? civ.color : null（UnitScene 外层已按 u.civ 索引取 civ，alive 双重判定语义保真）</summary>
        static int[] CivColorOf(WbCiv civ) => civ != null && civ.alive ? civ.color : null;

        static void DrawUnitSprite(WbDrawList L, WbU u, WbRenderState st, double zoom, bool dayNight, WbCiv civ)
        {
            if (u.boat != 0) { WbSprites.DrawBoat(L, u, CivColorOf(civ), (int)st.frameCount); return; }   // M-U7a 接线：bail→WbSprites 直调（蓝本 drawBoat(wc, u, civ&&civ.alive?civ.color:null, fc)）
            // def 解析（蓝本 RACES[u.race]）：基表 41 静态族优先，动态种族落 RdefHost（M-U7c 接线）
            WbRenderTables.RDef def;
            if (!WbRenderTables.RDEF.TryGetValue(u.race, out def))
            {
                if (st.RdefHost == null) throw new KeyNotFoundException($"RDEF missing race {u.race} (no RdefHost)");
                def = st.RdefHost(u.race);
                if (def == null) throw new KeyNotFoundException($"RdefHost returned null for race {u.race}");
            }
            if (u.caravan > 0) { WbSprites.DrawCaravan(L, u, CivColorOf(civ), (int)st.frameCount); return; } // TS (u.caravan ?? 0) > 0；WbU.caravan int 镜像恒值等价
            double px = u.dpx ?? (u.rx ?? u.x) * 2;
            double py = u.dpy ?? (u.ry ?? u.y) * 2;
            bool isGiant = u.traitName == "giant";
            bool isTiny = u.traitName == "tiny";
            // 脚下软阴影（水生/飞行/巨人豁免；昼夜 = 太阳方位方向影）
            if (!def.aquatic && !def.flying && !isGiant)
            {
                if (dayNight)
                {
                    double sox = JsRound(sunSx * sunLen * 2);
                    double soy = JsRound(sunSy * sunLen);
                    L.Fill(sunUnitShadowStyle, px - 1 + sox, py + 2 + soy, 3, 1);
                    if (sunLen > 1.7) L.Fill(sunUnitShadowStyle, px - 1 + sox * 2, py + 2 + soy, 2, 1);
                }
                else
                {
                    L.Fill("rgba(12,9,6,0.22)", px - 1, py + 2, 3, 1);
                }
            }
            // 幼年体型（人形绝对 4 年 / 野生动物 14% 寿限；锚定脚底）
            if (!def.aquatic && !def.flying)
            {
                double jk = 1;
                if (def.sprite == "person")
                {
                    if (u.age < 4) jk = 0.76 + (u.age / 4.0) * 0.24;
                }
                else if (u.age < def.maxAge * 0.14)
                {
                    jk = 0.78 + (u.age / (def.maxAge * 0.14)) * 0.22;
                }
                if (jk < 0.995)
                {
                    ScaledBody(L, u, st, zoom, def, civ, px, py, jk);
                    return;
                }
            }
            // 侏儒特质 0.72
            if (isTiny && !def.aquatic)
            {
                ScaledBody(L, u, st, zoom, def, civ, px, py, 0.72);
                return;
            }
            // 受击挤压（squash & stretch）
            int hu = u.hurt;
            if (hu > 14 && !def.aquatic)
            {
                double k = (hu - 14) / 10.0;
                L.Tag("save");
                L.Tag("translate", px, py + 3);
                L.Tag("scale", 1 + 0.22 * k, 1 - 0.26 * k);
                L.Tag("translate", -px, -(py + 3));
                DrawUnitBody(L, u, st, zoom, def, civ);
                L.Tag("restore");
                return;
            }
            DrawUnitBody(L, u, st, zoom, def, civ);
        }
        // 锚定脚底缩放包装（save/translate/scale/translate/body/restore）
        static void ScaledBody(WbDrawList L, WbU u, WbRenderState st, double zoom, WbRenderTables.RDef def, WbCiv civ, double px, double py, double k)
        {
            L.Tag("save");
            L.Tag("translate", px, py + 3);
            L.Tag("scale", k, k);
            L.Tag("translate", -px, -(py + 3));
            DrawUnitBody(L, u, st, zoom, def, civ);
            L.Tag("restore");
        }
        // P2 水生精灵水面门控（离水不画；crab 凭 beach 特质可上滩）
        static bool OnWaterTile(WbRenderState st, WbU u, bool beachOk)
        {
            int t = st.terrainAt;
            if (t == T_WATER || t == T_DEEP) return true;
            return beachOk && t == T_SAND;
        }

        static void DrawUnitBody(WbDrawList L, WbU u, WbRenderState st, double zoom, WbRenderTables.RDef def, WbCiv civ)
        {
            double px = u.dpx ?? (u.rx ?? u.x) * 2;
            double py = u.dpy ?? (u.ry ?? u.y) * 2;
            bool king = u.king != 0;
            bool hurt = u.hurt > 0;
            string civHex = civ != null ? civ.colorHex : null;
            bool civAlive = civ != null && civ.alive;
            // 水面门控
            if (def.sprite == "fish" || def.sprite == "turtle" || def.sprite == "shark")
            {
                if (!OnWaterTile(st, u, false)) return;
            }
            else if (def.sprite == "crab" && !OnWaterTile(st, u, true))
            {
                return;
            }
            // 精绘档（zoom≥8）：×4 精细像素 = sprites.ts 域 → bail（M-U5）
            if (zoom >= 8)
            {
                double fx = JsRound(u.rx ?? u.x);
                double fy = JsRound(u.ry ?? u.y) + 1;
                double tx = JsRound(px * 2) - fx;
                double ty = JsRound(py * 2) - fy;
                bool fin = false;
                if (def.sprite == "person")
                {
                    if (u.traitName != "giant")
                    {
                        L.Tag("save");
                        L.Tag("scale", 0.5, 0.5);
                        L.Tag("translate", tx, ty);
                        WbSprites.DrawPersonFine(L, u, def.visG, CivColorOf(civ), (int)st.frameCount, king);   // M-U7a：bail→直调；M-U7c：raceVis=def.visG（蓝本 drawPersonFine 内部 RACES[race]?.vis 自查的宿主上提，静态域 null 同义）
                        L.Tag("restore");
                        fin = true;
                    }
                }
                else
                {
                    if (WbRenderTables.QUAD_FINE.ContainsKey(def.sprite) && !def.vis)
                    {
                        L.Tag("save");
                        L.Tag("scale", 0.5, 0.5);
                        L.Tag("translate", tx, ty);
                        WbSprites.DrawQuadFine(L, u, def.sprite, (int)st.frameCount, king);   // M-U7a：bail→直调（蓝本 drawQuadFine(wc, u, quad, fc, king)）
                        L.Tag("restore");
                        fin = true;
                    }
                }
                if (fin) return;
            }
            // 色点档（zoom<2.5）
            if (zoom < 2.5)
            {
                if (def.sprite == "person")
                {
                    L.Fill(civAlive ? civHex : hurt ? "#ff6b5e" : "#9a8460", px - 1, py - 2, 2, 2);
                    if (king) L.Fill("#e6ba6c", px - 1, py - 3, 2, 1);
                    return;
                }
                if (!def.vis)
                {
                    var lod = WbRenderTables.ANIMAL_LOD.ContainsKey(def.sprite) ? WbRenderTables.ANIMAL_LOD[def.sprite] : null;
                    if (lod != null)
                    {
                        L.Fill(hurt ? "#ff6b5e" : lod.body, px - (lod.w >> 1), py - lod.h, lod.w, lod.h);
                        return;
                    }
                }
            }
            // 中档 LOD（2.5–5.6）：可读迷你形态（内联绘制 = M-U4 翻译面）
            else if (zoom < 5.6)
            {
                if (def.sprite == "person")
                {
                    double f = u.flip != 0 ? -1 : 1;
                    double bx0 = f > 0 ? px : px - 1;
                    bool moving = u.lx.HasValue && (u.lx.Value != u.x || !u.ly.HasValue || u.ly.Value != u.y);
                    int g = moving ? (int)((st.frameCount >> 3) & 1) : -1;
                    if (g == 0)
                    {
                        L.Fill("#3a342c", bx0, py, 1, 2);
                        L.Fill("#3a342c", bx0 + 1, py + 1, 1, 1);
                    }
                    else if (g == 1)
                    {
                        L.Fill("#3a342c", bx0, py + 1, 1, 1);
                        L.Fill("#3a342c", bx0 + 1, py, 1, 2);
                    }
                    else
                    {
                        L.Fill("#3a342c", bx0, py, 1, 2);
                        L.Fill("#3a342c", bx0 + 1, py, 1, 2);
                    }
                    L.Fill(hurt ? "#ff6b5e" : civAlive ? civHex : "#9a8460", bx0, py - 2, 2, 2);
                    L.Fill(hurt ? "#ff6b5e" : "#d9a066", bx0 + (f > 0 ? 1 : 0), py - 3, 1, 1);
                    if (u.wep != null)
                    {
                        bool firearm = u.wep.ToString() == "musket" || u.wep.ToString() == "rifle" || u.wep.ToString() == "laser_rifle";
                        L.Fill(firearm ? "#4a4038" : "#d9d9d9", bx0 + (f > 0 ? 2 : -1), u.atk > 0 ? py - 4 : py - 2, 1, 1); // TS (u.atk ?? 0) > 0；WbU.atk int 镜像恒值等价
                    }
                    L.Fill("rgba(20,16,12,0.4)", bx0, py + 2, 2, 1);
                    if (king) DrawCrown(L, bx0 + (f > 0 ? 1 : 0), py - 4);
                    return;
                }
                if (!def.vis)
                {
                    var lod = WbRenderTables.ANIMAL_LOD.ContainsKey(def.sprite) ? WbRenderTables.ANIMAL_LOD[def.sprite] : null;
                    if (lod != null)
                    {
                        double w = lod.w, h = lod.h;
                        double hw = w >> 1;
                        double bx = px - hw, by = py - h;
                        double f = u.flip != 0 ? -1 : 1;
                        bool moving = u.lx.HasValue && (u.lx.Value != u.x || !u.ly.HasValue || u.ly.Value != u.y);
                        int g = moving ? (int)((st.frameCount >> 3) & 1) : -1;
                        string limbC = hurt ? "#cf3f2e" : lod.dark;
                        L.Fill(limbC, bx, py, 1, 1);
                        L.Fill(limbC, bx + w - 1, py, 1, 1);
                        if (g != 1) L.Fill(limbC, bx + 1, py, 1, 1);
                        if (w >= 4 && g != 0) L.Fill(limbC, bx + w - 2, py, 1, 1);
                        L.Fill(hurt ? "#ff6b5e" : lod.body, bx, by, w, h);
                        if (w >= 3) L.Fill("rgba(255,255,240,0.3)", bx + 1, by, 1, 1);
                        double headX = px + (u.flip != 0 ? -hw - 1 : hw);
                        L.Fill(limbC, headX, by + (h > 2 ? 1 : 0), 1, 1);
                        L.Fill("rgba(20,16,12,0.35)", bx, py + 1, w, 1);
                        if (king) DrawCrown(L, headX, by - 1);
                        return;
                    }
                }
            }
            // v3 涌现物种（视觉基因组）：动态种化的非人形物种走程序化生物绘制 —— 外观随进化真实变化（M-U7c 接线；蓝本 render.ts L2319-2331）
            if (def.vis && def.sprite != "person")
            {
                string mShape = def.aquatic ? "aquatic" : def.sandswim ? "worm" : (def.sprite == "basilisk" || def.sprite == "snake" || def.sprite == "dragon") ? "serpent" : null;
                var vc = WbEmergence.VisCacheFor(u.race, def.visG, def.sprite);
                if (mShape != null && vc != null) { WbSprites.DrawEmergentMonster(L, u, vc, mShape, (int)st.frameCount); return; }
                if (vc != null) { WbSprites.DrawEmergentCreature(L, u, vc, (int)st.frameCount); return; }
            }
            // 全绘档 switch → WbSprites 直调（M-U7a 接线：bail 契约翻转；蓝本 render.ts L2333 switch 逐字序）
            switch (def.sprite)
            {
                case "person": WbSprites.DrawPerson(L, u, def.visG, CivColorOf(civ), (int)st.frameCount); break;   // M-U7c：raceVis=def.visG（蓝本 drawPerson 内部 RACES[race]?.vis 自查的宿主上提）
                case "sheep": WbSprites.DrawSheep(L, u); break;
                case "wolf": WbSprites.DrawWolf(L, u); break;
                case "snowwolf": WbSprites.DrawSnowWolf(L, u); break;
                case "bear": WbSprites.DrawBear(L, u); break;
                case "deer": WbSprites.DrawDeer(L, u); break;
                case "penguin": WbSprites.DrawPenguin(L, u, (int)st.frameCount); break;
                case "camel": WbSprites.DrawCamel(L, u, (int)st.frameCount); break;
                case "scorpion": WbSprites.DrawScorpion(L, u, (int)st.frameCount); break;
                case "snake": WbSprites.DrawSnake(L, u, (int)st.frameCount); break;
                case "dragon": WbSprites.DrawDragon(L, u, (int)st.frameCount); break;
                case "skeleton": WbSprites.DrawSkeleton(L, u, (int)st.frameCount); break;
                case "demon": WbSprites.DrawDemon(L, u, (int)st.frameCount); break;
                case "angel": WbSprites.DrawAngel(L, u, (int)st.frameCount); break;
                case "phoenix": WbSprites.DrawPhoenix(L, u, (int)st.frameCount); break;
                case "ent": WbSprites.DrawEnt(L, u, (int)st.frameCount); break;
                case "lich": WbSprites.DrawLich(L, u, (int)st.frameCount); break;
                case "hydra": WbSprites.DrawHydra(L, u, (int)st.frameCount); break;
                case "mage": WbSprites.DrawMage(L, u, (int)st.frameCount); break;
                case "troll": WbSprites.DrawTroll(L, u, (int)st.frameCount); break;
                case "ogre": WbSprites.DrawOgre(L, u, (int)st.frameCount); break;
                case "whitewalker": WbSprites.DrawWhiteWalker(L, u, (int)st.frameCount); break;
                case "vampire": WbSprites.DrawVampire(L, u, (int)st.frameCount); break;
                case "kraken": WbSprites.DrawKraken(L, u, (int)st.frameCount); break;
                case "sandworm": WbSprites.DrawSandworm(L, u, (int)st.frameCount); break;
                case "basilisk": WbSprites.DrawBasilisk(L, u, (int)st.frameCount); break;
                case "chicken": WbSprites.DrawChicken(L, u, (int)st.frameCount); break;
                case "pig": WbSprites.DrawPig(L, u, (int)st.frameCount); break;
                case "rabbit": WbSprites.DrawRabbit(L, u, (int)st.frameCount); break;
                case "fox": WbSprites.DrawFox(L, u, (int)st.frameCount); break;
                case "fish": WbSprites.DrawFish(L, u, (int)st.frameCount); break;
                case "crab": WbSprites.DrawCrab(L, u, (int)st.frameCount); break;
                case "turtle": WbSprites.DrawTurtle(L, u, (int)st.frameCount); break;
                case "shark": WbSprites.DrawShark(L, u, (int)st.frameCount); break;
                default:
                {
                    // P2：未知精灵安全回退 —— 走 ANIMAL_LOD 色块（新种族接线遗漏时单位不消失、不崩溃）
                    var lod = WbRenderTables.ANIMAL_LOD.ContainsKey(def.sprite) ? WbRenderTables.ANIMAL_LOD[def.sprite] : null;
                    double lw = lod != null ? lod.w : 2, lh = lod != null ? lod.h : 2;
                    L.Fill(hurt ? "#ff6b5e" : lod != null ? lod.body : "#9a8460", px - (int)(lw >> 1), py - lh, lw, lh);
                    break;
                }
            }
            if (king && def.sprite == "person") DrawCrown(L, px, py - 4);
            if (def.dynTint != null)
            {
                L.Fill(hurt ? "#ff6b5e" : def.dynTint, px, py - 4, 1, 1);
            }
        }
        // M-U7a 接线注记：BailFnOf 已删除（全绘档 bail 契约翻转为 WbSprites 直调 switch）；
        // WbDrawList.Bail/WbBail 保留 —— 地形/道具域 drawTree/drawMountainProp 契约仍在用（M-U5 已锁签名的双链并存）
    }
}
