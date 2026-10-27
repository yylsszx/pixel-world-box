// ============================================================
// WbMath.cs — fdlibm 数学与 JS 语义工具（M-U1）
// 蓝本: rust-core/src/jsmath.rs（逐行机械翻译，纪律①）
//   - hi/lo/set_hi/xor_hi: jsmath.rs L9-33
//   - fd_hypot:            jsmath.rs L270-349（fdlibm e_hypot.c 移植，
//     已对 netlib 参考实现 20 万样本 0 位差——lib.rs 头注释 L9）
//   - js_min/js_max:       jsmath.rs L706-727（NaN 传染语义，勿用 System.Math）
//   - truthy_f:            units.rs L189-191（JS 真值语义：NaN 与 0 为 falsy）
// 位精确要求: System.Math.Sqrt 映射硬件 sqrtsd（IEEE 754 正确舍入），
// 与 Rust f64::sqrt / JS Math.sqrt 位级一致。
// ============================================================
using System;

namespace PixelWorldBox.Wb
{
    public static class WbMath
    {
        // ---------------- 位操作（jsmath.rs L9-33） ----------------
        public static ulong Bits(double x) => BitConverter.DoubleToInt64Bits(x);
        public static double FromBits(ulong b) => BitConverter.Int64BitsToDouble(unchecked((long)b));

        /// jsmath.rs L10-13
        public static int Hi(double x) => unchecked((int)((uint)(Bits(x) >> 32)));

        /// jsmath.rs L14-16
        public static uint Lo(double x) => unchecked((uint)Bits(x));

        /// jsmath.rs L17-20
        public static double SetHi(double x, int h)
        {
            ulong b = Bits(x);
            b = (b & 0xFFFFFFFFUL) | (((ulong)(uint)h) << 32);
            return FromBits(b);
        }

        // ---------------- hypot（jsmath.rs L270-349 逐行） ----------------
        public static double FdHypot(double x, double y)
        {
            double a = x, b = y;
            int ha = Hi(x) & 0x7fffffff;
            int hb = Hi(y) & 0x7fffffff;
            if (hb > ha)
            {
                (a, b) = (b, a);
                (ha, hb) = (hb, ha);
            }
            a = SetHi(a, ha);
            b = SetHi(b, hb);
            if (ha - hb > 0x3c00000)
            {
                return a + b;
            }
            int k = 0;
            if (ha > 0x5f300000)
            {
                if (ha >= 0x7ff00000)
                {
                    double w = a + b;
                    if (((uint)(ha & 0xfffff) | Lo(a)) == 0)
                    {
                        w = a;
                    }
                    if (((uint)hb ^ 0x7ff00000u) | Lo(b) == 0)
                    {
                        w = b;
                    }
                    return w;
                }
                ha -= 0x25800000;
                hb -= 0x25800000;
                k += 600;
                a = SetHi(a, ha);
                b = SetHi(b, hb);
            }
            if (hb < 0x20b00000)
            {
                if (hb <= 0x000fffff)
                {
                    if ((uint)hb | Lo(b) == 0)
                    {
                        return a;
                    }
                    double t1 = SetHi(0.0, 0x7fd00000);
                    b *= t1;
                    a *= t1;
                    k -= 1022;
                }
                else
                {
                    ha += 0x25800000;
                    hb += 0x25800000;
                    k -= 600;
                    a = SetHi(a, ha);
                    b = SetHi(b, hb);
                }
            }
            double w2 = a - b;
            double t1b, t2;
            if (w2 > b)
            {
                t1b = SetHi(0.0, ha);
                t2 = a - t1b;
                w2 = Math.Sqrt(t1b * t1b - (b * (-b) - t2 * (a + t1b)));
            }
            else
            {
                a = a + a;
                double y1 = SetHi(0.0, hb);
                double y2 = b - y1;
                t1b = SetHi(0.0, ha + 0x00100000);
                t2 = a - t1b;
                w2 = Math.Sqrt(t1b * y1 - (w2 * (-w2) - (t1b * y2 + t2 * b)));
            }
            if (k != 0)
            {
                double t1c = 1.0;
                t1c = SetHi(t1c, Hi(t1c) + (k << 20));
                return t1c * w2;
            }
            return w2;
        }

        // ---------------- JS 语义工具（jsmath.rs L706-727） ----------------
        /// JS Math.min（NaN 传染）—— jsmath.rs L708-716
        public static double JsMin(double a, double b)
        {
            if (double.IsNaN(a) || double.IsNaN(b)) return double.NaN;
            return a < b ? a : b;
        }

        /// JS Math.max（NaN 传染）—— jsmath.rs L719-727
        public static double JsMax(double a, double b)
        {
            if (double.IsNaN(a) || double.IsNaN(b)) return double.NaN;
            return a > b ? a : b;
        }

        /// JS 真值语义（f64 列）：NaN(=undefined) 与 0 为 falsy —— units.rs L189-191
        public static bool TruthyF(double v) => v == v && v != 0.0;

        /// JS Math.floor 语义等价（C# Math.Floor 对 NaN/Inf 传播一致）
        public static int FloorI(double v) => (int)Math.Floor(v);
    }
}
