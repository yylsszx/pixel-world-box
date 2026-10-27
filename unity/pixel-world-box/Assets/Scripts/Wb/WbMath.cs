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

        /// JS Math.round：向 +∞ 取半（floor(x+0.5) 语义；|x| < 2^52 域内等价）—— jsmath.rs L703-705
        public static double JsRound(double x) => Math.Floor(x + 0.5);

        /// jsmath.rs L23-26（xor_hi：最高 32 位异或）
        public static double XorHi(double x, int h)
        {
            ulong b = Bits(x);
            int cur = unchecked((int)((uint)(b >> 32)));
            return SetHi(x, cur ^ h);
        }

        // ---------------- exp（jsmath.rs L29-108 逐行；fdlibm e_exp.c） ----------------
        private const double E_ONE = 1.0;
        private static readonly double[] E_HALF = { 0.5, -0.5 };
        private const double E_HUGE = 1.0e+300;
        private const double E_TWOM1000 = 9.33263618503218878990e-302;
        private const double E_O_THRESHOLD = 7.09782712893383973096e+02;
        private const double E_U_THRESHOLD = -7.45133219101941108420e+02;
        private static readonly double[] E_LN2_HI = { 6.93147180369123816490e-01, -6.93147180369123816490e-01 };
        private static readonly double[] E_LN2_LO = { 1.90821492927058770002e-10, -1.90821492927058770002e-10 };
        private const double E_INVLN2 = 1.44269504088896338700e+00;
        private const double E_P1 = 1.66666666666666019037e-01;
        private const double E_P2 = -2.77777777770155933842e-03;
        private const double E_P3 = 6.61375632143793436117e-05;
        private const double E_P4 = -1.65339022054652515390e-06;
        private const double E_P5 = 4.13813679705723846039e-08;

        /// jsmath.rs L44-108（位精确 exp；C# (long)(double) 截断 = Rust as i32 语义）
        public static double FdExp(double x)
        {
            double y;
            double hi_ = 0.0, lo_ = 0.0;
            int k, xsb;
            uint uhx = (uint)(Hi(x));
            xsb = (int)(uhx >> 31) & 1;
            int hx = (int)(uhx & 0x7fffffff);
            if (hx >= 0x40862E42)
            {
                if (hx >= 0x7ff00000)
                {
                    if (((uint)(hx & 0xfffff) | Lo(x)) != 0) return x + x;
                    return xsb == 0 ? x : 0.0;
                }
                if (x > E_O_THRESHOLD) return E_HUGE * E_HUGE;
                if (x < E_U_THRESHOLD) return E_TWOM1000 * E_TWOM1000;
            }
            if (hx > 0x3fd62e42)
            {
                if (hx < 0x3ff0a2b2)
                {
                    hi_ = x - E_LN2_HI[xsb];
                    lo_ = E_LN2_LO[xsb];
                    k = 1 - xsb - xsb;
                }
                else
                {
                    k = (int)(E_INVLN2 * x + E_HALF[xsb]);   // JS/Rust as-i32 截断语义
                    double t = k;
                    hi_ = x - t * E_LN2_HI[0];
                    lo_ = t * E_LN2_LO[0];
                }
                x = hi_ - lo_;
            }
            else if (hx < 0x3e300000)
            {
                if (E_HUGE + x > E_ONE) return E_ONE + x;
                k = 0;
            }
            else
            {
                k = 0;
            }
            double t2 = x * x;
            double c = x - t2 * (E_P1 + t2 * (E_P2 + t2 * (E_P3 + t2 * (E_P4 + t2 * E_P5))));
            if (k == 0)
            {
                return E_ONE - ((x * c) / (c - 2.0) - x);
            }
            y = E_ONE - ((lo_ - (x * c) / (2.0 - c)) - hi_);
            if (k >= -1021)
            {
                return SetHi(y, unchecked((int)((uint)Hi(y) + ((uint)k << 20))));
            }
            double y2 = SetHi(y, unchecked((int)((uint)Hi(y) + ((uint)(k + 1000) << 20))));
            return y2 * E_TWOM1000;
        }

        // ---------------- expm1（jsmath.rs L110-226 逐行；fdlibm s_expm1.c） ----------------
        private const double X_ONE = 1.0;
        private const double X_HUGE = 1.0e+300;
        private const double X_TINY = 1.0e-300;
        private const double X_O_THRESHOLD = 7.09782712893383973096e+02;
        private const double X_LN2_HI = 6.93147180369123816490e-01;
        private const double X_LN2_LO = 1.90821492927058770002e-10;
        private const double X_INVLN2 = 1.44269504088896338700e+00;
        private const double X_Q1 = -3.33333333333331316428e-02;
        private const double X_Q2 = 1.58730158725481460165e-03;
        private const double X_Q3 = -7.93650757867487942473e-05;
        private const double X_Q4 = 4.00821782732936239552e-06;
        private const double X_Q5 = -2.01099218183624371326e-07;

        /// jsmath.rs L124-226
        public static double FdExpm1(double x)
        {
            double y;
            int k;
            long bhx = Bits(x);
            int xsb = unchecked((int)((ulong)bhx >> 63)) & 1;   // hx & 0x80000000 → 符号位
            y = xsb == 0 ? x : -x;
            int hx = (int)((uint)bhx >> 32) & 0x7fffffff;
            if (hx >= 0x4043687A)
            {
                if (hx >= 0x40862E42)
                {
                    if (hx >= 0x7ff00000)
                    {
                        if (((uint)(hx & 0xfffff) | Lo(x)) != 0) return x + x;
                        return xsb == 0 ? x : -1.0;
                    }
                    if (x > X_O_THRESHOLD) return X_HUGE * X_HUGE;
                }
                if (xsb != 0)
                {
                    if (x + X_TINY < 0.0) return X_TINY - X_ONE;
                }
            }
            double hi_, lo_;
            double c = 0.0;
            if (hx > 0x3fd62e42)
            {
                if (hx < 0x3ff0a2b2)
                {
                    if (xsb == 0) { hi_ = x - X_LN2_HI; lo_ = X_LN2_LO; k = 1; }
                    else { hi_ = x + X_LN2_HI; lo_ = -X_LN2_LO; k = -1; }
                }
                else
                {
                    k = (int)(X_INVLN2 * x + (xsb == 0 ? 0.5 : -0.5));
                    double t = k;
                    hi_ = x - t * X_LN2_HI;
                    lo_ = t * X_LN2_LO;
                }
                x = hi_ - lo_;
                c = (hi_ - x) - lo_;
            }
            else if (hx < 0x3c900000)
            {
                double t = X_HUGE + x;
                return x - (t - (X_HUGE + x));
            }
            else
            {
                k = 0;
            }
            double hfx = 0.5 * x;
            double hxs = x * hfx;
            double r1 = X_ONE + hxs * (X_Q1 + hxs * (X_Q2 + hxs * (X_Q3 + hxs * (X_Q4 + hxs * X_Q5))));
            double t2 = 3.0 - r1 * hfx;
            double e = hxs * ((r1 - t2) / (6.0 - x * t2));
            if (k == 0)
            {
                return x - (x * e - hxs);
            }
            e = x * (e - c) - c;
            e -= hxs;
            if (k == -1) return 0.5 * (x - e) - 0.5;
            if (k == 1)
            {
                if (x < -0.25) return -2.0 * (e - (x + 0.5));
                return X_ONE + 2.0 * (x - e);
            }
            if (k <= -2 || k > 56)
            {
                y = X_ONE - (e - x);
                y = SetHi(y, unchecked((int)((uint)Hi(y) + ((uint)k << 20))));
                return y - X_ONE;
            }
            double t3 = X_ONE;
            if (k < 20)
            {
                t3 = SetHi(t3, unchecked((int)(0x3ff00000u - (0x200000u >> k))));
                y = t3 - (e - x);
                y = SetHi(y, unchecked((int)((uint)Hi(y) + ((uint)k << 20))));
            }
            else
            {
                t3 = SetHi(t3, unchecked((int)(((uint)0x3ff - (uint)k) << 20)));
                y = x - (e + t3);
                y += X_ONE;
                y = SetHi(y, unchecked((int)((uint)Hi(y) + ((uint)k << 20))));
            }
            return y;
        }

        // ---------------- tanh（jsmath.rs L228-267 逐行；fdlibm s_tanh.c） ----------------
        private const double T_ONE = 1.0;
        private const double T_TWO = 2.0;
        private const double T_TINY = 1.0e-300;

        /// jsmath.rs L233-267
        public static double FdTanh(double x)
        {
            double t, z;
            int jx = Hi(x);
            uint ix = (uint)jx & 0x7fffffff;
            if (ix >= 0x7ff00000)
            {
                if (jx >= 0) return T_ONE / x + T_ONE;
                return T_ONE / x - T_ONE;
            }
            if (ix < 0x40360000)
            {
                if (ix < 0x3c800000) return x * (T_ONE + x);
                if (ix >= 0x3ff00000)
                {
                    t = FdExpm1(T_TWO * Math.Abs(x));
                    z = T_ONE - T_TWO / (t + T_TWO);
                }
                else
                {
                    t = FdExpm1(-T_TWO * Math.Abs(x));
                    z = -t / (t + T_TWO);
                }
            }
            else
            {
                z = T_ONE - T_TINY;
            }
            return jx >= 0 ? z : -z;
        }

        // ---------------- atan（jsmath.rs L351-439 逐行；fdlibm s_atan.c） ----------------
        private static readonly double[] A_ATANHI = {
            4.63647609000806093515e-01, 7.85398163397448278999e-01,
            9.82793723247329054082e-01, 1.57079632679489655800e+00,
        };
        private static readonly double[] A_ATANLO = {
            2.26987774529616870924e-17, 3.06161699786838301793e-17,
            1.39033110312309984516e-17, 6.12323399573676603587e-17,
        };
        private static readonly double[] A_AT = {
            3.33333333333329318027e-01, -1.99999999998764832476e-01,
            1.42857142725034663711e-01, -1.11111104054623557880e-01,
            9.09088713343650656196e-02, -7.69187620504482999495e-02,
            6.66107313738753120669e-02, -5.83357013379057348645e-02,
            4.97687799461593236017e-02, -3.65315727442169155270e-02,
            1.62858201153657823623e-02,
        };
        private const double A_ONE = 1.0;
        private const double A_HUGE = 1.0e+300;

        /// jsmath.rs L380-439
        public static double FdAtan(double x)
        {
            double w, s1, s2, z;
            int id;
            int hx = Hi(x);
            uint ix = (uint)hx & 0x7fffffff;
            if (ix >= 0x44100000)
            {
                if (ix > 0x7ff00000 || (ix == 0x7ff00000 && Lo(x) != 0)) return x + x;
                return hx > 0 ? A_ATANHI[3] + A_ATANLO[3] : -A_ATANHI[3] - A_ATANLO[3];
            }
            if (ix < 0x3fdc0000)
            {
                if (ix < 0x3e200000)
                {
                    if (A_HUGE + x > A_ONE) return x;
                }
                id = -1;
            }
            else
            {
                x = Math.Abs(x);
                if (ix < 0x3ff30000)
                {
                    if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - A_ONE) / (2.0 + x); }
                    else { id = 1; x = (x - A_ONE) / (x + A_ONE); }
                }
                else if (ix < 0x40038000)
                {
                    id = 2;
                    x = (x - 1.5) / (A_ONE + 1.5 * x);
                }
                else
                {
                    id = 3;
                    x = -1.0 / x;
                }
            }
            z = x * x;
            w = z * z;
            s1 = z * (A_AT[0] + w * (A_AT[2] + w * (A_AT[4] + w * (A_AT[6] + w * (A_AT[8] + w * A_AT[10])))));
            s2 = w * (A_AT[1] + w * (A_AT[3] + w * (A_AT[5] + w * (A_AT[7] + w * A_AT[9]))));
            if (id < 0)
            {
                return x - x * (s1 + s2);
            }
            z = A_ATANHI[id] - ((x * (s1 + s2) - A_ATANLO[id]) - x);
            return hx < 0 ? -z : z;
        }

        // ---------------- atan2（jsmath.rs L441-522 逐行；fdlibm e_atan2.c） ----------------
        private const double AT2_ZERO = 0.0;
        private const double AT2_TINY = 1.0e-300;
        private const double AT2_PI_O_4 = 7.8539816339744827900e-01;
        private const double AT2_PI_O_2 = 1.5707963267948965580e+00;
        private const double AT2_PI = 3.1415926535897931160e+00;
        private const double AT2_PI_LO = 1.2246467991473531772e-16;

        /// jsmath.rs L449-522
        public static double FdAtan2(double y, double x)
        {
            double z;
            int hx = Hi(x);
            uint ix = (uint)hx & 0x7fffffff;
            uint lx = Lo(x);
            int hy = Hi(y);
            uint iy = (uint)hy & 0x7fffffff;
            uint ly = Lo(y);
            if ((ix | ((lx | (uint)-(int)lx) >> 31)) > 0x7ff00000
                || (iy | ((ly | (uint)-(int)ly) >> 31)) > 0x7ff00000)
            {
                return x + y;
            }
            if ((((uint)hx - 0x3ff00000u) | lx) == 0)
            {
                return FdAtan(y);
            }
            int m = ((int)((uint)hy >> 31) & 1) | ((int)(((uint)hx >> 30)) & 2);
            if ((iy | ly) == 0)
            {
                switch (m)
                {
                    case 0:
                    case 1: return y;
                    case 2: return AT2_PI + AT2_TINY;
                    default: return -AT2_PI - AT2_TINY;
                }
            }
            if ((ix | lx) == 0)
            {
                return hy < 0 ? -AT2_PI_O_2 - AT2_TINY : AT2_PI_O_2 + AT2_TINY;
            }
            if (ix == 0x7ff00000)
            {
                if (iy == 0x7ff00000)
                {
                    switch (m)
                    {
                        case 0: return AT2_PI_O_4 + AT2_TINY;
                        case 1: return -AT2_PI_O_4 - AT2_TINY;
                        case 2: return 3.0 * AT2_PI_O_4 + AT2_TINY;
                        default: return -3.0 * AT2_PI_O_4 - AT2_TINY;
                    }
                }
                switch (m)
                {
                    case 0: return AT2_ZERO;
                    case 1: return -AT2_ZERO;
                    case 2: return AT2_PI + AT2_TINY;
                    default: return -AT2_PI - AT2_TINY;
                }
            }
            if (iy == 0x7ff00000)
            {
                return hy < 0 ? -AT2_PI_O_2 - AT2_TINY : AT2_PI_O_2 + AT2_TINY;
            }
            int k = unchecked((int)(iy - ix)) >> 20;
            if (k > 60)
            {
                z = AT2_PI_O_2 + 0.5 * AT2_PI_LO;
            }
            else if (hx < 0 && k < -60)
            {
                z = 0.0;
            }
            else
            {
                z = FdAtan(Math.Abs(y / x));
            }
            switch (m)
            {
                case 0: return z;
                case 1: return XorHi(z, unchecked((int)0x80000000u));
                case 2: return AT2_PI - (z - AT2_PI_LO);
                default: return (z - AT2_PI_LO) - AT2_PI;
            }
        }

        // ---------------- sin / cos（jsmath.rs L524-698 逐行；fdlibm k_sin/k_cos/rem_pio2） ----------------
        private const double S_HALF = 5.00000000000000000000e-01;
        private const double S_S1 = -1.66666666666666324348e-01;
        private const double S_S2 = 8.33333333332248946124e-03;
        private const double S_S3 = -1.98412698298579493134e-04;
        private const double S_S4 = 2.75573137070700676789e-06;
        private const double S_S5 = -2.50507602534068634195e-08;
        private const double S_S6 = 1.58969099521155010221e-10;

        private static double KSin(double x, double y, int iy)
        {
            uint ix = (uint)Hi(x) & 0x7fffffff;
            if (ix < 0x3e400000)
            {
                if (Math.Truncate(x) == 0.0) return x;
            }
            double z = x * x;
            double v = z * x;
            double r = S_S2 + z * (S_S3 + z * (S_S4 + z * (S_S5 + z * S_S6)));
            if (iy == 0) return x + v * (S_S1 + z * r);
            return x - ((z * (S_HALF * y - v * r) - y) - v * S_S1);
        }

        private const double C_ONE = 1.00000000000000000000e+00;
        private const double C_C1 = 4.16666666666666019037e-02;
        private const double C_C2 = -1.38888888888741095749e-03;
        private const double C_C3 = 2.48015872894767294178e-05;
        private const double C_C4 = -2.75573143513906633035e-07;
        private const double C_C5 = 2.08757232129817482790e-09;
        private const double C_C6 = -1.13596475577881948265e-11;

        private static double KCos(double x, double y)
        {
            uint ix = (uint)Hi(x) & 0x7fffffff;
            if (ix < 0x3e400000)
            {
                if (Math.Truncate(x) == 0.0) return C_ONE;
            }
            double z = x * x;
            double r = z * (C_C1 + z * (C_C2 + z * (C_C3 + z * (C_C4 + z * (C_C5 + z * C_C6)))));
            if (ix < 0x3FD33333)
            {
                return C_ONE - (0.5 * z - (z * r - x * y));
            }
            double qx = ix > 0x3fe90000 ? 0.28125 : SetHi(0.0, unchecked((int)ix - 0x00200000));
            double hz = 0.5 * z - qx;
            double a = C_ONE - qx;
            return a - (hz - (z * r - x * y));
        }

        private const double RP_HALF = 5.00000000000000000000e-01;
        private const double RP_PIO2_1 = 1.57079632673412561417e+00;
        private const double RP_PIO2_1T = 6.07710050650619224932e-11;
        private const double RP_PIO2_2 = 6.07710050630396597660e-11;
        private const double RP_PIO2_2T = 2.02226624879595063154e-21;
        private const double RP_PIO2_3 = 2.02226624871116645580e-21;
        private const double RP_PIO2_3T = 8.47842766036889956997e-32;
        private const double RP_INVPIO2 = 6.36619772367581382433e-01;
        private static readonly uint[] RP_NPIO2_HW = {
            0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C,
            0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C,
            0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A,
            0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
            0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
            0x404858EB, 0x404921FB,
        };

        /// jsmath.rs L600-676（中幅 rem_pio2；游戏值域 |x| ≤ 8，大幅分支不可达）
        private static int RemPio2Med(double x, double[] y)
        {
            int hx = Hi(x);
            uint ix = (uint)hx & 0x7fffffff;
            if (ix <= 0x3fe921fb)
            {
                y[0] = x;
                y[1] = 0.0;
                return 0;
            }
            if (ix < 0x4002d97c)
            {
                double z;
                if (hx > 0)
                {
                    z = x - RP_PIO2_1;
                    if (ix != 0x3ff921fb)
                    {
                        y[0] = z - RP_PIO2_1T;
                        y[1] = (z - y[0]) - RP_PIO2_1T;
                    }
                    else
                    {
                        z -= RP_PIO2_2;
                        y[0] = z - RP_PIO2_2T;
                        y[1] = (z - y[0]) - RP_PIO2_2T;
                    }
                    return 1;
                }
                z = x + RP_PIO2_1;
                if (ix != 0x3ff921fb)
                {
                    y[0] = z + RP_PIO2_1T;
                    y[1] = (z - y[0]) + RP_PIO2_1T;
                }
                else
                {
                    z += RP_PIO2_2;
                    y[0] = z + RP_PIO2_2T;
                    y[1] = (z - y[0]) + RP_PIO2_2T;
                }
                return -1;
            }
            if (ix <= 0x413921fb)
            {
                double t = Math.Abs(x);
                int n = (int)(t * RP_INVPIO2 + RP_HALF);
                double fn = n;
                double r = t - fn * RP_PIO2_1;
                double w = fn * RP_PIO2_1T;
                if (n < 32 && ix != RP_NPIO2_HW[n - 1])
                {
                    y[0] = r - w;
                }
                else
                {
                    uint j = ix >> 20;
                    y[0] = r - w;
                    int i = (int)j - ((int)(((uint)Hi(y[0])) >> 20) & 0x7ff);
                    if (i > 16)
                    {
                        t = r;
                        w = fn * RP_PIO2_2;
                        r = t - w;
                        w = fn * RP_PIO2_2T - ((t - r) - w);
                        y[0] = r - w;
                        i = (int)j - ((int)(((uint)Hi(y[0])) >> 20) & 0x7ff);
                        if (i > 49)
                        {
                            double t2 = r;
                            double w2 = fn * RP_PIO2_3;
                            double r2 = t2 - w2;
                            double w3 = fn * RP_PIO2_3T - ((t2 - r2) - w2);
                            y[0] = r2 - w3;
                        }
                    }
                }
                y[1] = (r - y[0]) - w;
                if (hx < 0)
                {
                    y[0] = -y[0];
                    y[1] = -y[1];
                    return -n;
                }
                return n;
            }
            y[0] = x;
            y[1] = 0.0;
            return 0;
        }

        /// jsmath.rs L678-687
        public static double FdSin(double x)
        {
            double[] y = { 0.0, 0.0 };
            int n = RemPio2Med(x, y);
            switch (n & 3)
            {
                case 0: return KSin(y[0], y[1], 1);
                case 1: return KCos(y[0], y[1]);
                case 2: return -KSin(y[0], y[1], 1);
                default: return -KCos(y[0], y[1]);
            }
        }

        /// jsmath.rs L689-698
        public static double FdCos(double x)
        {
            double[] y = { 0.0, 0.0 };
            int n = RemPio2Med(x, y);
            switch (n & 3)
            {
                case 0: return KCos(y[0], y[1]);
                case 1: return -KSin(y[0], y[1], 1);
                case 2: return -KCos(y[0], y[1]);
                default: return KSin(y[0], y[1], 1);
            }
        }
    }
}
