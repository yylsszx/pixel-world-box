// ============================================================================
// WbNeuro.cs —— NeuroCore 微型神经决策核心（M-U7n 批次三甲；本文件由 scripts/unity-migration/gen-neurodefs.mjs
//               从 src/lib/game/neuro-weights.ts + neuro-flight-rl.ts 机械生成——零手抄，重跑即再生）
// 蓝本：neuro.ts dequantize L25-43（Int8 量化 × scale → Float32）+ fwd L108-121（f64 累积 + tanh f64 +
//       hid/out 存 f32——JS Float32Array 语义）+ neuroStance L185-203（argmax）+ neuroFlight L209-233
//       （flightMode 'rl' 默认 → NEURO_FLIGHT_RL 头；softmax logp 为在线采集消费面——引擎不读，不译）。
// 交叉锁定：golden/neuro_weights.json（NUnit WeightParity 测试逐值核对）。
// 教师策略回退（policy.ts teacher*）属 neuroStats.enabled=false 分支——引擎默认 enabled=true，不译（注记）。
// ============================================================================
namespace PixelWorldBox.Wb
{
    /// <summary>RTHead 消费切片（neuro.ts L13-23）——量化反解后的推理头</summary>
    public sealed class WbNeuroHead
    {
        public int nIn, nH, nOut;
        public float[] w1, b1, w2, b2;      // w1[i*nH+t] / w2[t*nOut+j]（蓝本布面同构）
        public float[] hid, outArr;          // 模块级 scratch（单线程引擎复用）
    }

    public static class WbNeuro
    {
        // dequantize L25-43：w[i] = q[i] * s（f64 乘积 → f32 存储）
        private static float[] Dq(int[] q, double s)
        {
            var w = new float[q.Length];
            for (int i = 0; i < q.Length; i++) w[i] = (float)(q[i] * s);
            return w;
        }

        private static WbNeuroHead Head(int[] arch, int[] w1q, int[] b1q, int[] w2q, int[] b2q,
                                        double sw1, double sb1, double sw2, double sb2)
        {
            var h = new WbNeuroHead { nIn = arch[0], nH = arch[1], nOut = arch[2] };
            h.w1 = Dq(w1q, sw1); h.b1 = Dq(b1q, sb1); h.w2 = Dq(w2q, sw2); h.b2 = Dq(b2q, sb2);
            h.hid = new float[h.nH]; h.outArr = new float[h.nOut];
            return h;
        }

        /// <summary>① 近战命中头 NEURO_ACC（neuro-weights.ts；批次三乙 melee 域消费）</summary>
        public static readonly WbNeuroHead HAcc = Head(
            new int[]{ 10,16,1 },
            w1q: new int[]{ 27,0,-3,4,4,-27,12,-21,-7,24,1,-44,33,1,23,-7,11,-37,-9,-37,24,-12,-24,-27,9,6,20,127,-16,-49,-2,-61,-15,-43,-3,11,32,-20,6,-13,37,3,-4,43,15,-36,29,10,-13,-18,-1,21,20,22,-26,-19,30,18,30,30,18,8,-7,5,-18,-6,-1,-4,0,4,8,-19,16,-17,-3,-30,0,26,22,22,-1,1,-19,10,-12,-8,-25,7,-10,-10,9,-17,5,12,-8,-6,-6,-9,-10,-6,-10,9,31,15,-19,21,29,-23,3,0,22,5,-20,1,20,3,30,-14,-28,27,-25,3,-23,7,32,-30,3,-11,19,-2,-22,14,21,-22,-23,-16,-12,9,1,22,-2,-16,-5,-3,22,11,-4,-27,-4,5,26,-7,-10,13,16,11,-3,-20,11,-7 },
            b1q: new int[]{ 98,50,87,61,-45,-77,19,9,-60,-13,105,127,23,-16,41,25 },
            w2q: new int[]{ 23,45,41,58,-46,-29,14,5,-31,-13,38,-127,24,43,28,67 },
            b2q: new int[]{ 127 },
            sw1: 0.0144204, sb1: 0.0056192, sw2: 0.011521, sb2: 0.0093419);

        /// <summary>② 战斗姿态头 NEURO_STANCE（12 特征 → 4 类：0 追击/1 坚守/2 风筝/3 脱离）</summary>
        public static readonly WbNeuroHead HStance = Head(
            new int[]{ 12,10,4 },
            w1q: new int[]{ 90,2,-127,2,73,-1,27,-6,-1,-4,1,49,0,1,0,7,1,14,3,4,0,0,0,1,0,0,0,1,2,-1,1,-1,2,0,-5,-1,-7,1,1,-1,-31,1,0,-14,-48,2,-14,0,-2,3,1,0,20,7,-2,0,7,3,4,-4,-7,-1,1,9,1,1,-5,0,2,4,0,-5,0,0,0,-43,2,11,3,2,0,0,0,0,0,0,0,0,-1,-1,0,14,0,1,0,-5,0,5,-2,0,0,-11,0,0,0,11,0,-2,2,1,0,0,0,0,0,0,0,-1,1,0 },
            b1q: new int[]{ 28,-64,-17,70,125,127,26,47,70,-53 },
            w2q: new int[]{ -43,87,-35,-5,30,23,23,-81,127,-111,-18,6,-4,-27,8,0,92,-52,-118,75,-28,-23,-25,79,22,-23,-51,41,53,-14,-4,-30,79,-29,-24,-26,-1,-4,8,-7 },
            b2q: new int[]{ 127,-50,-31,-46 },
            sw1: 0.281044, sb1: 0.0161662, sw2: 0.0723983, sb2: 0.0484622);

        /// <summary>③ 战或逃 BC 行为克隆头 NEURO_FLIGHT（policy 教师 99% 一致——非默认源）</summary>
        public static readonly WbNeuroHead HFlightBc = Head(
            new int[]{ 9,8,2 },
            w1q: new int[]{ -74,-63,105,-10,85,110,15,25,0,16,-1,-28,17,-34,3,-52,127,-2,-2,1,-3,0,0,-1,1,-1,0,1,0,0,-1,-1,1,-1,0,0,0,0,1,-2,51,6,-4,-9,11,-6,-59,56,2,16,6,-9,13,-14,82,-6,33,-11,35,-5,-7,8,-4,39,1,1,1,1,1,0,1,-1 },
            b1q: new int[]{ -63,29,-127,65,-72,1,21,-27 },
            w2q: new int[]{ 109,-127,-58,79,95,-121,-23,46,81,-69,49,-52,-49,53,-64,60 },
            b2q: new int[]{ 127,-127 },
            sw1: 0.123851, sb1: 0.0496234, sw2: 0.0452789, sb2: 0.000561626);

        /// <summary>③ 战或逃 RL 强化头 NEURO_FLIGHT_RL（neuroStats.flightMode='rl' 引擎默认——neuro.ts L51/L137）</summary>
        public static readonly WbNeuroHead FlightRl = Head(
            new int[]{ 9,8,2 },
            w1q: new int[]{ -73,-58,103,-4,88,113,23,30,1,17,0,-27,21,-30,7,-46,127,0,-2,5,2,5,5,1,3,2,1,0,5,3,4,4,3,4,1,-7,4,2,5,2,45,13,-11,-5,13,-3,-53,55,2,17,5,-3,15,-13,86,-3,31,-10,37,3,-3,9,-5,41,2,3,1,2,2,1,4,3 },
            b1q: new int[]{ -60,31,-127,71,-59,13,33,-13 },
            w2q: new int[]{ 109,-127,-35,57,71,-97,-36,59,68,-55,34,-37,-55,59,-64,59 },
            b2q: new int[]{ -127,127 },
            sw1: 0.124688, sb1: 0.0490805, sw2: 0.0445458, sb2: 0.00393435);

        /// <summary>fwd L108-121：hid[t]=tanh(b1[t]+Σ f[i]·w1[i·nH+t])（f64 累积）；out[j]=b2[j]+Σ hid[t]·w2[t·nOut+j]</summary>
        public static float[] Fwd(WbNeuroHead h, double[] f)
        {
            for (int t = 0; t < h.nH; t++)
            {
                double s = h.b1[t];
                for (int i = 0; i < h.nIn; i++) s += f[i] * h.w1[i * h.nH + t];
                h.hid[t] = (float)System.Math.Tanh(s);
            }
            for (int j = 0; j < h.nOut; j++)
            {
                double s = h.b2[j];
                for (int t = 0; t < h.nH; t++) s += h.hid[t] * h.w2[t * h.nOut + j];
                h.outArr[j] = (float)s;
            }
            return h.outArr;
        }

        /// <summary>neuroStance L185-203：argmax out（0 追击接敌 / 1 原地坚守 / 2 且战且退 / 3 伤重脱离）；
        ///  审计采样（seq%97/61/performance.now）为面板统计域——引擎行为面零消费，不译</summary>
        public static int NeuroStance(double[] f)
        {
            var o = Fwd(HStance, f);
            int best = 0;
            for (int j = 1; j < o.Length; j++) if (o[j] > o[best]) best = j;
            return best;
        }

        /// <summary>neuroFlight L209-233：RL 头（引擎默认 'rl'）；best = out[1] &gt; out[0] ? 1 : 0（0 死战 / 1 脱离）；
        ///  softmax flightLastLogp 为 PPO 在线采集消费面——不译；审计采样同上不译</summary>
        public static int NeuroFlight(double[] f)
        {
            var o = Fwd(FlightRl, f);
            return o[1] > o[0] ? 1 : 0;
        }
    }
}
