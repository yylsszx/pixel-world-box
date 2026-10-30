// ============================================================================
// gen-neurodefs.mjs —— M-U7n 批次三甲「神经决策域」权重机械转写器（零手抄）
// 蓝本：src/lib/game/neuro.ts（dequantize L25-43 / fwd L108-121 / neuroStance L185-203 /
//       neuroFlight L209-233——flightMode 'rl' 默认走 NEURO_FLIGHT_RL）+
//       neuro-weights.ts（NEURO_ACC/STANCE/FLIGHT Int8 量化表）+ neuro-flight-rl.ts（NEURO_FLIGHT_RL）。
// 产物双写：
//   ① unity/pixel-world-box/Assets/Scripts/Wb/WbNeuro.cs —— C# 头结构 + 反量化 + Fwd/Stance/Flight
//     （f32 权重存储 + f64 累积 + tanh f64 + hid/out f32 存储——与 JS Float32Array 语义逐位同构）
//   ② scripts/unity-migration/golden/neuro_weights.json —— transcript 镜像数据源 + NUnit 交叉锁定
// 运行：bun scripts/unity-migration/gen-neurodefs.mjs
// ============================================================================
import { NEURO_ACC, NEURO_STANCE, NEURO_FLIGHT } from '../../src/lib/game/neuro-weights.ts';
import { NEURO_FLIGHT_RL } from '../../src/lib/game/neuro-flight-rl.ts';
import { writeFileSync } from 'node:fs';

const HEADS = { acc: NEURO_ACC, stance: NEURO_STANCE, flightBc: NEURO_FLIGHT, flightRl: NEURO_FLIGHT_RL };

// ---- ② 黄金 JSON（transcript 数据源；NUnit 交叉锁定同源） ----
const json = JSON.stringify(HEADS);
writeFileSync(new URL('./golden/neuro_weights.json', import.meta.url), json);

// ---- ① C# 生成（Int8 表 + 量化scale 原样嵌入——数值零手抄） ----
const arr = (a) => `new int[]{ ${a.join(',')} }`;
const num = (v) => JSON.stringify(v);   // JS number → C# double 字面量同形（0.0144204 等十进制短形）
const headInit = (name, spec, comment) => `
        /// <summary>${comment}</summary>
        public static readonly WbNeuroHead ${name} = Head(
            new int[]{ ${spec.arch.join(',')} },
            w1q: ${arr(spec.w1q)},
            b1q: ${arr(spec.b1q)},
            w2q: ${arr(spec.w2q)},
            b2q: ${arr(spec.b2q)},
            sw1: ${num(spec.sw1)}, sb1: ${num(spec.sb1)}, sw2: ${num(spec.sw2)}, sb2: ${num(spec.sb2)});`;

const cs = `// ============================================================================
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
${headInit('HAcc', HEADS.acc, '① 近战命中头 NEURO_ACC（neuro-weights.ts；批次三乙 melee 域消费）')}
${headInit('HStance', HEADS.stance, '② 战斗姿态头 NEURO_STANCE（12 特征 → 4 类：0 追击/1 坚守/2 风筝/3 脱离）')}
${headInit('HFlightBc', HEADS.flightBc, '③ 战或逃 BC 行为克隆头 NEURO_FLIGHT（policy 教师 99% 一致——非默认源）')}
${headInit('FlightRl', HEADS.flightRl, "③ 战或逃 RL 强化头 NEURO_FLIGHT_RL（neuroStats.flightMode='rl' 引擎默认——neuro.ts L51/L137）")}

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
`;
writeFileSync('/home/z/my-project/unity/pixel-world-box/Assets/Scripts/Wb/WbNeuro.cs', cs);
console.log('neuro_weights.json', (json.length / 1024).toFixed(1) + 'KB', '| WbNeuro.cs', (cs.length / 1024).toFixed(1) + 'KB');
console.log('heads: acc', HEADS.acc.arch.join('x'), '| stance', HEADS.stance.arch.join('x'), '| flightBc', HEADS.flightBc.arch.join('x'), '| flightRl', HEADS.flightRl.arch.join('x'));
console.log('=== gen-neurodefs 完成 ===');
