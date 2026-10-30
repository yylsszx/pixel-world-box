// ============================================================
// WbNoise.cs — M-U7f' 程序化世界生成噪声基元（value noise fBm 域）
// 蓝本: src/lib/game/noise.ts L3-52（mulberry32/hash2/valueNoise/fbm）逐行机械翻译
//       + Math.hypot 的 V8 语义等价（worldgen.ts L102 湖泊圈地依赖——sqrt 直接替换在
//       72/289 整数格点上 1ulp 分歧，必须复刻 V8 的 max 归一化 + Kahan 补偿平方和算法，
//       node 实测 57 万随机样本 + 7225 圈地域样本零位分歧）
// 复用: mulberry32 = WbRng.Mulberry32Next（M-U1，jsmath.rs L730-736 同源位精确）；
//       hash2 = WbSave.Hash2（M-U6a，JS double 乘语义三坑已黄金锁定——单实现不重写）
// dump: scripts/unity-migration/gen-worldgen.mjs 黄金 worldgen.json（7 场景 gzB64 协议）
// ============================================================
namespace PixelWorldBox.Wb
{
    using System;

    public static class WbNoise
    {
        // ---------------- mulberry32 闭包包装（noise.ts L3-12） ----------------
        // JS: 工厂返回闭包持有 a 状态。C# 用 ref uint 状态等价——调用方持有 randA 局部量。
        public static double Mulberry32Next(ref uint a) => WbRng.Mulberry32Next(ref a);

        // ---------------- hash2（noise.ts L14-19） ----------------
        // 单实现原则：语义驻留 WbSave.Hash2（M-U6a 已按 JS double 乘语义翻译并黄金锁定 42 点）
        public static double Hash2(int x, int y, int seed) => WbSave.Hash2(x, y, seed);

        // ---------------- smooth / lerp（noise.ts L21-22） ----------------
        private static double Smooth(double t) => t * t * (3 - 2 * t);
        private static double Lerp(double a, double b, double t) => a + (b - a) * t;

        // ---------------- 2D value noise（noise.ts L25-37） ----------------
        // 输入可为负（domain warp 使 x*freq 负值可达）——hash2 走 JS ToInt32 语义负数安全
        public static double ValueNoise(double x, double y, int seed)
        {
            double xi = Math.Floor(x);
            double yi = Math.Floor(y);
            double xf = x - xi;
            double yf = y - yi;
            int xiI = (int)xi, yiI = (int)yi;
            double v00 = Hash2(xiI, yiI, seed);
            double v10 = Hash2(xiI + 1, yiI, seed);
            double v01 = Hash2(xiI, yiI + 1, seed);
            double v11 = Hash2(xiI + 1, yiI + 1, seed);
            double sx = Smooth(xf);
            double sy = Smooth(yf);
            return Lerp(Lerp(v00, v10, sx), Lerp(v01, v11, sx), sy);
        }

        // ---------------- fractal Brownian motion（noise.ts L40-52） ----------------
        // 缺省: octaves=5, lacunarity=2, gain=0.5（蓝本签名缺省）
        public static double Fbm(double x, double y, int seed, int octaves = 5, double lacunarity = 2, double gain = 0.5)
        {
            double amp = 1;
            double freq = 1;
            double sum = 0;
            double norm = 0;
            for (int o = 0; o < octaves; o++)
            {
                sum += amp * ValueNoise(x * freq, y * freq, seed + o * 1013);
                norm += amp;
                amp *= gain;
                freq *= lacunarity;
            }
            return sum / norm;
        }

        // ---------------- V8 Math.hypot(dx, dy) 语义等价 ----------------
        // V8 实测逆向（node 57 万随机样本 + 7225 圈地域样本零位分歧）：
        // max 归一化 + Kahan 补偿平方和（带符号除 + v*v + 补偿项 |sum|>=|v2] 分支）。
        // 直接 Math.Sqrt(dx*dx+dy*dy) 在 72/289 整数格点 1ulp 分歧 → 湖泊圈地边界格翻转。
        public static double V8Hypot(double dx, double dy)
        {
            double ax = Math.Abs(dx), ay = Math.Abs(dy);
            double max = ax > ay ? ax : ay;
            if (max == 0) return 0;
            if (double.IsPositiveInfinity(max)) return double.PositiveInfinity;
            double sum = 0, compensation = 0;
            double v1 = dx / max, v2 = dy / max;
            // 两元素 Kahan 循环展开（JS 版 for-of 序：先 dx/max 后 dy/max）
            {
                if (v1 != 0)
                {
                    double sq = v1 * v1;
                    double t = sum + sq;
                    if (Math.Abs(sum) >= Math.Abs(sq)) compensation += (sum - t) + sq;
                    else compensation += (sq - t) + sum;
                    sum = t;
                }
                if (v2 != 0)
                {
                    double sq = v2 * v2;
                    double t = sum + sq;
                    if (Math.Abs(sum) >= Math.Abs(sq)) compensation += (sum - t) + sq;
                    else compensation += (sq - t) + sum;
                    sum = t;
                }
            }
            return max * Math.Sqrt(sum + compensation);
        }
    }
}
