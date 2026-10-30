// WbHostCanvas.cs — M-U7 整合 a：canvas op 流像素合成播放器（宿主消费端，Unity 宿主渲染链最后一公里）
// ============================================================
// 对账边界（M-U4 syncStatic / M-U7d overlay / M-U7e minimap 既定裁定延伸）：
//   canvas 像素合成**不进黄金对账面**——黄金对账面只有 op 序列本身（verify 二十八段逐 op 逐位）。
//   本文件是 op 流的语义消费端（宿主域），不产生新黄金；验证 = NUnit 语义断言（变换栈/颜色解析/
//   覆盖域/alpha 合成/最近邻 blit/TerrainFull 与单 tile TerrainBake 自洽）+ verify 新段（黄金 475
//   样式串形态完备校验——全部落入本解析器覆盖的三形态，未知形态 Parse 抛异常不静默，桩域纪律）。
// 语义蓝本：MDN CanvasRenderingContext2D（source-over 合成/变换栈/最近邻采样）——
//   网页版 render.ts 消费端同构；尺寸锚：terrainCanvas = W*8 × H*8 = 2048×1280（engine.ts L741-742）、
//   overlayCanvas = W*4 × H*4 = 1024×640（engine.ts L758）；imageSmoothingEnabled=false（render.ts L1284）
//   → drawImage 最近邻采样；TICK_MS=66（constants.ts L8）仅供宿主壳引用。
// op 协议（WbRender.WbDrawList 产出端已钉）：
//   {o:'fillRect'|'clearRect'|'strokeRect', a:[x,y,w,h], s:[fillStyle] | [strokeStyle,lineWidth]}
//   {o:'drawImage', a:[dx,dy,dw,dh], s:[srcTag:'terrain'|'overlay', alpha]}
//   {o:'setTransform', a:[a,b,c,d,e,f]} {o:'translate'|'scale', a:[x,y]} {o:'save'|'restore'}
//   变换域：render.ts L1250 wc.setTransform(2,0,0,2,0,0) 基变换（1024 用户空间 → 2048 设备）；
//   屏幕侧 setTransform(zoom,0,0,zoom,...)（UnitScene 域）——本播放器实现完整 2×3 仿射栈。
// ============================================================
using System;
using System.Collections.Generic;

namespace PixelWorldBox.Wb
{
    /// <summary>2×3 仿射变换（canvas CTM 同构：x' = a*x + c*y + e; y' = b*x + d*y + f）</summary>
    public struct WbCtm
    {
        public double A, B, C, D, E, F;

        public static WbCtm Identity() { var m = default(WbCtm); m.A = 1; m.D = 1; return m; }

        /// <summary>canvas ctx.transform(a,b,c,d,e,f)：后乘（newCTM = CTM · T）——MDN 语义，
        /// 即后续绘制点先经 T 再经原 CTM。setTransform 为直接替换。</summary>
        public WbCtm Mul(double a, double b, double c, double d, double e, double f)
        {
            return new WbCtm
            {
                A = A * a + C * b,
                B = B * a + D * b,
                C = A * c + C * d,
                D = B * c + D * d,
                E = A * e + C * f + E,
                F = B * e + D * f + F,
            };
        }

        public void Apply(double x, double y, out double rx, out double ry)
        {
            rx = A * x + C * y + E;
            ry = B * x + D * y + F;
        }
    }

    /// <summary>解析后的 RGBA（canvas source-over 合成用；A ∈ [0,255]）</summary>
    public struct WbRgba
    {
        public byte R, G, B, A;
        public WbRgba(byte r, byte g, byte b, byte a) { R = r; G = g; B = b; A = a; }
    }

    /// <summary>CSS 颜色解析（黄金 475 样式串形态完备：#rrggbb / rgb(r,g,b) / rgba(r,g,b,a)）。
    /// 未知格式**抛 FormatException 不静默**（桩域触达即抛纪律——播放器遇到未覆盖形态显式失败）。</summary>
    public static class WbCssColor
    {
        public static WbRgba Parse(string s)
        {
            if (s == null) throw new FormatException("WbCssColor.Parse: null style");
            if (s.Length == 7 && s[0] == '#')
            {
                return new WbRgba(Hex2(s, 1), Hex2(s, 3), Hex2(s, 5), 255);
            }
            if (s.StartsWith("rgb(", StringComparison.Ordinal) && s.EndsWith(")", StringComparison.Ordinal))
            {
                var p = Split3(s.Substring(4, s.Length - 5));
                return new WbRgba(Ch8(p[0]), Ch8(p[1]), Ch8(p[2]), 255);
            }
            if (s.StartsWith("rgba(", StringComparison.Ordinal) && s.EndsWith(")", StringComparison.Ordinal))
            {
                var body = s.Substring(5, s.Length - 6);
                int c1 = body.IndexOf(','), c2 = body.IndexOf(',', c1 + 1), c3 = body.IndexOf(',', c2 + 1);
                if (c3 < 0) throw new FormatException("WbCssColor.Parse: bad rgba '" + s + "'");
                var aTxt = body.Substring(c3 + 1).Trim();
                double a;
                if (!double.TryParse(aTxt, System.Globalization.NumberStyles.Float,
                        System.Globalization.CultureInfo.InvariantCulture, out a))
                    throw new FormatException("WbCssColor.Parse: bad alpha '" + s + "'");
                if (a < 0) a = 0; else if (a > 1) a = 1;
                // canvas rgba alpha 0..1 → 8bit：四舍五入（0.5 → 128 等）；域内 alpha 值精度足够
                var a8 = (byte)Math.Floor(a * 255.0 + 0.5);
                var rgb = body.Substring(0, c3).Split(',');
                if (rgb.Length != 3) throw new FormatException("WbCssColor.Parse: bad rgba '" + s + "'");
                return new WbRgba(Ch8(rgb[0]), Ch8(rgb[1]), Ch8(rgb[2]), a8);
            }
            throw new FormatException("WbCssColor.Parse: unsupported style '" + s + "'");
        }

        static byte Hex2(string s, int i)
        {
            int hi = HexV(s[i]), lo = HexV(s[i + 1]);
            return (byte)(hi * 16 + lo);
        }
        static byte HexV(char c)
        {
            if (c >= '0' && c <= '9') return (byte)(c - '0');
            if (c >= 'a' && c <= 'f') return (byte)(c - 'a' + 10);
            if (c >= 'A' && c <= 'F') return (byte)(c - 'A' + 10);
            throw new FormatException("WbCssColor.Parse: bad hex char '" + c + "'");
        }
        static string[] Split3(string body)
        {
            var p = body.Split(',');
            if (p.Length != 3) throw new FormatException("WbCssColor.Parse: bad rgb body '" + body + "'");
            return p;
        }
        static byte Ch8(string t)
        {
            int v;
            if (!int.TryParse(t.Trim(), out v)) throw new FormatException("WbCssColor.Parse: bad channel '" + t + "'");
            if (v < 0) v = 0; else if (v > 255) v = 255;
            return (byte)v;
        }
    }

    /// <summary>
    /// op 流像素合成播放器（宿主消费端）。目标缓冲 = RGBA byte[]（行主序 idx=(y*W+x)*4）。
    /// Unity 侧通过 TerrainFull/PlayOps 填充后 LoadRawImageBytes 上传 Texture2D（WbGameHost 壳）。
    /// </summary>
    public class WbHostCanvas
    {
        public readonly int Width, Height;
        public readonly byte[] Px;

        WbCtm _ctm;
        readonly Stack<WbCtm> _stack = new Stack<WbCtm>();

        /// <summary>blit 源缓冲注册表（srcTag → RGBA 缓冲 + 尺寸；terrain=2048×1280 / overlay=1024×640）</summary>
        public readonly Dictionary<string, byte[]> Sources = new Dictionary<string, byte[]>();
        public readonly Dictionary<string, int> SrcW = new Dictionary<string, int>();
        public readonly Dictionary<string, int> SrcH = new Dictionary<string, int>();

        public WbHostCanvas(int width, int height)
        {
            Width = width; Height = height;
            Px = new byte[width * height * 4];
            _ctm = WbCtm.Identity();
        }

        /// <summary>注册 blit 源（RGBA 缓冲，宽×高）</summary>
        public void RegisterSource(string tag, byte[] rgba, int w, int h)
        {
            if (rgba.Length != w * h * 4)
                throw new ArgumentException("WbHostCanvas.RegisterSource: size mismatch for '" + tag + "'");
            Sources[tag] = rgba; SrcW[tag] = w; SrcH[tag] = h;
        }

        // ---------------- 变换栈（canvas save/restore/setTransform/translate/scale 同构） ----------------
        public void Save() { _stack.Push(_ctm); }
        public void Restore()
        {
            if (_stack.Count == 0) throw new InvalidOperationException("WbHostCanvas.Restore: empty stack");
            _ctm = _stack.Pop();
        }
        public void SetTransform(double a, double b, double c, double d, double e, double f)
        { _ctm = new WbCtm { A = a, B = b, C = c, D = d, E = e, F = f }; }
        public void Translate(double x, double y) { _ctm = _ctm.Mul(1, 0, 0, 1, x, y); }
        public void Scale(double x, double y) { _ctm = _ctm.Mul(x, 0, 0, y, 0, 0); }
        public WbCtm Ctm => _ctm;

        // ---------------- 矩形光栅（像素中心判定：设备像素 (px+0.5,py+0.5) ∈ 变换后矩形） ----------------
        /// <summary>fillRect（source-over；fillStyle 内嵌 alpha）。变换后矩形保持轴对齐——
        /// op 流变换只含 scale/translate（无旋转剪切，蓝本 setTransform(zoom,0,0,zoom,..)/基变换 ×2），
        /// 四角变换取包围盒即精确域。</summary>
        public void FillRect(double x, double y, double w, double h, string style)
        {
            var c = WbCssColor.Parse(style);
            FillRectRgba(x, y, w, h, ref c);
        }

        public void FillRectRgba(double x, double y, double w, double h, ref WbRgba c)
        {
            if (w <= 0 || h <= 0) return;
            double rx0, ry0, rx1, ry1, t;
            _ctm.Apply(x, y, out rx0, out ry0);
            _ctm.Apply(x + w, y + h, out rx1, out ry1);
            if (rx0 > rx1) { t = rx0; rx0 = rx1; rx1 = t; }
            if (ry0 > ry1) { t = ry0; ry0 = ry1; ry1 = t; }
            WbRgba cc = c; // lambda 不可捕获 ref 参数（CS1628）——值拷贝后捕获
            ForEachCovered(rx0, ry0, rx1, ry1, (px, py) => Blend(px, py, ref cc));
        }

        /// <summary>clearRect：置透明黑（canvas clearRect 语义 = (0,0,0,0)）</summary>
        public void ClearRect(double x, double y, double w, double h)
        {
            if (w <= 0 || h <= 0) return;
            double rx0, ry0, rx1, ry1, t;
            _ctm.Apply(x, y, out rx0, out ry0);
            _ctm.Apply(x + w, y + h, out rx1, out ry1);
            if (rx0 > rx1) { t = rx0; rx0 = rx1; rx1 = t; }
            if (ry0 > ry1) { t = ry0; ry0 = ry1; ry1 = t; }
            ForEachCovered(rx0, ry0, rx1, ry1, (px, py) =>
            {
                long i = ((long)py * Width + px) * 4;
                Px[i] = 0; Px[i + 1] = 0; Px[i + 2] = 0; Px[i + 3] = 0;
            });
        }

        /// <summary>strokeRect：边框带 = 中心线路径向两侧各扩 lineWidth/2（canvas stroke 语义）；
        /// 四条带分别光栅（角域重叠区同色反复混合——同色 source-over 幂等视觉，域内样式恒定）。</summary>
        public void StrokeRect(double x, double y, double w, double h, string style, double lineWidth)
        {
            var c = WbCssColor.Parse(style);
            double lw = lineWidth <= 0 ? 1 : lineWidth; // canvas lineWidth<=0 不绘制；域内 ≥1
            double half = lw / 2;
            // 上/下边带：y ∈ [y-half, y+half] / [y+h-half, y+h+half]；x ∈ [x-half, x+w+half]
            FillRectRgba(x - half, y - half, w + lw, lw, ref c);
            FillRectRgba(x - half, y + h - half, w + lw, lw, ref c);
            // 左/右边带：x ∈ [x-half, x+half] / [x+w-half, x+w+half]；y ∈ [y+half, y+h-half]（中段，角已由上下带覆盖）
            if (h > lw)
            {
                FillRectRgba(x - half, y + half, lw, h - lw, ref c);
                FillRectRgba(x + w - half, y + half, lw, h - lw, ref c);
            }
        }

        /// <summary>drawImage 全幅源 blit（最近邻采样 + source-over alpha 合成）。
        /// op 协议 s:[srcTag, alpha]（M-U7e 钉）；目标矩形 [dx,dx+dw)×[dy,dy+dh)，源全幅拉伸；
        /// 目标像素中心 (px+0.5) 反映射源坐标取 floor（最近邻，imageSmoothingEnabled=false 蓝本协议）。</summary>
        public void DrawImageBlit(string srcTag, double dx, double dy, double dw, double dh, double alpha)
        {
            byte[] src;
            int sw, sh;
            if (!Sources.TryGetValue(srcTag, out src))
                throw new InvalidOperationException("WbHostCanvas.DrawImageBlit: unregistered source '" + srcTag + "'");
            sw = SrcW[srcTag]; sh = SrcH[srcTag];
            if (dw <= 0 || dh <= 0) return;
            double a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
            double rx0, ry0, rx1, ry1, t;
            _ctm.Apply(dx, dy, out rx0, out ry0);
            _ctm.Apply(dx + dw, dy + dh, out rx1, out ry1);
            if (rx0 > rx1) { t = rx0; rx0 = rx1; rx1 = t; }
            if (ry0 > ry1) { t = ry0; ry0 = ry1; ry1 = t; }
            ForEachCovered(rx0, ry0, rx1, ry1, (px, py) =>
            {
                // 目标像素中心 → 源坐标（逆变换：此处 CTM 仅 scale/translate，逆 = 伴随公式；
                // 为通用性直接用 2×3 逆矩阵解析解）
                double cx = px + 0.5, cy = py + 0.5;
                double u, v;
                InvApply(cx, cy, out u, out v);
                double fx = (u - dx) / dw * sw;
                double fy = (v - dy) / dh * sh;
                int sx = (int)Math.Floor(fx), sy = (int)Math.Floor(fy);
                if (sx < 0) sx = 0; else if (sx >= sw) sx = sw - 1;
                if (sy < 0) sy = 0; else if (sy >= sh) sy = sh - 1;
                long si = ((long)sy * sw + sx) * 4;
                byte sr = src[si], sg = src[si + 1], sb = src[si + 2], sa = src[si + 3];
                // 源 alpha × blit alpha → source-over
                double ea = (sa / 255.0) * a;
                var c = new WbRgba(sr, sg, sb, (byte)Math.Floor(ea * 255.0 + 0.5));
                Blend(px, py, ref c);
            });
        }

        void InvApply(double x, double y, out double rx, out double ry)
        {
            // 2×3 仿射逆（域内 det = a*d-b*c ≠ 0；变换仅 scale/translate）
            double det = _ctm.A * _ctm.D - _ctm.B * _ctm.C;
            if (det == 0) throw new InvalidOperationException("WbHostCanvas: singular CTM");
            double dx0 = x - _ctm.E, dy0 = y - _ctm.F;
            rx = (_ctm.D * dx0 - _ctm.C * dy0) / det;
            ry = (-_ctm.B * dx0 + _ctm.A * dy0) / det;
        }

        delegate void PixelFn(int px, int py);

        /// <summary>轴对齐包围盒 × 像素中心判定 → 覆盖像素集（含边界裁剪到画布）。
        /// 中心判定：px+0.5 ∈ [x0,x1) ⇔ px ∈ [x0-0.5, x1-0.5) ⇒ start = ceil(x0-0.5)、end = ceil(x1-0.5)-1
        /// （canvas 域内坐标视觉等价；黄金不对账像素，确定性优先）</summary>
        void ForEachCovered(double x0, double y0, double x1, double y1, PixelFn fn)
        {
            int ix0 = (int)Math.Ceiling(x0 - 0.5);
            int iy0 = (int)Math.Ceiling(y0 - 0.5);
            int ix1 = (int)Math.Ceiling(x1 - 0.5) - 1;
            int iy1 = (int)Math.Ceiling(y1 - 0.5) - 1;
            if (ix0 < 0) ix0 = 0;
            if (iy0 < 0) iy0 = 0;
            if (ix1 > Width - 1) ix1 = Width - 1;
            if (iy1 > Height - 1) iy1 = Height - 1;
            for (int py = iy0; py <= iy1; py++)
                for (int px = ix0; px <= ix1; px++)
                    fn(px, py);
        }

        /// <summary>source-over 合成：out = src*a + dst*(1-a)（8bit double 中间态，确定性）</summary>
        void Blend(int px, int py, ref WbRgba c)
        {
            long i = ((long)py * Width + px) * 4;
            double sa = c.A / 255.0;
            if (sa >= 1.0)
            {
                Px[i] = c.R; Px[i + 1] = c.G; Px[i + 2] = c.B; Px[i + 3] = 255;
                return;
            }
            if (sa <= 0) return;
            double da = Px[i + 3] / 255.0;
            double oa = sa + da * (1 - sa);
            if (oa <= 0) { Px[i] = 0; Px[i + 1] = 0; Px[i + 2] = 0; Px[i + 3] = 0; return; }
            // 非预乘颜色域：合成色 = (src*a + dst*da*(1-sa)) / oa（source-over 标准式）
            double r = (c.R * sa + Px[i] * da * (1 - sa)) / oa;
            double g = (c.G * sa + Px[i + 1] * da * (1 - sa)) / oa;
            double b = (c.B * sa + Px[i + 2] * da * (1 - sa)) / oa;
            Px[i] = Cl8(r); Px[i + 1] = Cl8(g); Px[i + 2] = Cl8(b);
            Px[i + 3] = Cl8(oa * 255.0 + 0.5);
        }
        static byte Cl8(double v) { return v < 0 ? (byte)0 : v > 255 ? (byte)255 : (byte)v; }

        // ---------------- op 流消费入口 ----------------
        /// <summary>播放 WbDrawList 全部 ops（bails 域为 M-U5 精灵直调对账面，播放器不消费——
        /// 精灵像素已由 UnitScene fillRect op 承载，bails 仅黄金对账用）</summary>
        public void PlayOps(WbDrawList list)
        {
            if (list == null) return;
            foreach (var op in list.ops) PlayOp(op);
        }

        public void PlayOp(WbDrawOp op)
        {
            if (op == null || string.IsNullOrEmpty(op.o)) return;
            double[] a = op.a;
            switch (op.o)
            {
                case "fillRect":
                    FillRect(a[0], a[1], a[2], a[3], (string)op.s[0]);
                    break;
                case "clearRect":
                    ClearRect(a[0], a[1], a[2], a[3]);
                    break;
                case "strokeRect":
                    StrokeRect(a[0], a[1], a[2], a[3], (string)op.s[0],
                        op.s != null && op.s.Length > 1 && op.s[1] != null ? Convert.ToDouble(op.s[1]) : 1);
                    break;
                case "drawImage":
                    {
                        double alpha = op.s != null && op.s.Length > 1 && op.s[1] != null ? Convert.ToDouble(op.s[1]) : 1;
                        DrawImageBlit((string)op.s[0], a[0], a[1], a[2], a[3], alpha);
                        break;
                    }
                case "setTransform":
                    SetTransform(a[0], a[1], a[2], a[3], a[4], a[5]);
                    break;
                case "translate":
                    Translate(a[0], a[1]);
                    break;
                case "scale":
                    Scale(a[0], a[1]);
                    break;
                case "save":
                    Save();
                    break;
                case "restore":
                    Restore();
                    break;
                default:
                    throw new InvalidOperationException("WbHostCanvas.PlayOp: unknown op '" + op.o + "'");
            }
        }
    }

    /// <summary>
    /// 全图地形烘焙（宿主 Texture2D 数据源）：TerrainBake 256×160 逐 tile → 2048×1280 RGBA。
    /// tile (tx,ty) 的 8×8 块落位全图 (ty*8+sy, tx*8+sx)（行主序 idx=(y*2048+x)*4）。
    /// TerrainBake 为纯函数（无帧缓存消费——SunCached 属 UnitScene 域），全图组装 = 循环自证。
    /// </summary>
    public static class WbTerrainFull
    {
        public const int W = 256, H = 160;         // tile 网格（WbRender 同值域）
        public const int PW = W * 8, PH = H * 8;   // 像素幅面（terrainCanvas 尺寸锚 engine.ts L741-742）

        public static byte[] Bake(WbRenderState st)
        {
            var px = new byte[PW * PH * 4];
            var tile = new byte[64 * 4]; // 8×8 px × RGBA
            for (int ty = 0; ty < H; ty++)
            {
                for (int tx = 0; tx < W; tx++)
                {
                    WbRender.TerrainBake(st, ty * W + tx, tile);
                    int gx = tx * 8, gy = ty * 8;
                    for (int sy = 0; sy < 8; sy++)
                    {
                        int src = sy * 8 * 4;
                        int dst = ((gy + sy) * PW + gx) * 4;
                        Buffer.BlockCopy(tile, src, px, dst, 8 * 4);
                    }
                }
            }
            return px;
        }
    }
}
