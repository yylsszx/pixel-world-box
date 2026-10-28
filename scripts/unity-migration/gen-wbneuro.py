#!/usr/bin/env python3
# gen-wbneuro.py —— 从 golden-tanhprobe.json（真实现求值回显）机械生成 WbNeuro.cs 权重表
# 铁律：位模式换算由本脚本完成（python struct 权威），零手抄
import json, struct

d = json.load(open('scripts/unity-migration/golden-tanhprobe.json'))

def le_f64(hexstr):
    return struct.unpack('>d', bytes.fromhex(hexstr))[0]   # ⚠ tanhprobe bits64 为 DataView 默认大端

def cdouble(x):
    # 用十六进制位模式字面量保证位精确（避免十进制往返舍入）
    bits = struct.unpack('<Q', struct.pack('<d', x))[0]
    return f"0x{bits:016X}UL"

heads = {'acc': 'Acc', 'stance': 'Stance', 'flight': 'Flight', 'flightRL': 'FlightRl'}
lines = []
lines.append('// ============================================================================')
lines.append('// WbNeuro.cs — 神经决策核心四头（Unity 迁移 M-U2c）')
lines.append('// 蓝本：src/lib/game/neuro.ts dequantize（L25-43）/ fwd（L108-121）/ neuroAcc（L166-182）/')
lines.append('//       neuroStance（L185-203）/ neuroFlight（L209-234）+ neuro-weights.ts /')
lines.append('//       neuro-flight-rl.ts（Int8 量化权重真值——由 gen-tanhprobe.mjs 回显、本文件由')
lines.append('//       scripts/unity-migration/gen-wbneuro.py 机械生成，零手抄）。')
lines.append('//')
lines.append('// 位精确要点（tanh 探针 300594/300594 全绿——gen-tanhprobe.mjs + probe-tanh/）：')
lines.append('//  - Math.Tanh/Exp 平台 libm 链锁（bun≡.NET A 级网格 32014+60017 位全同——Task 143')
lines.append('//    atan2/cos/sin 先例复用；浏览器 V8 fdlibm 分叉风险属 M-U7 量化债）。')
lines.append('//  - ⚠ JS Float32Array 读出值参与算术一律 f64 提升（f64 乘加），仅 store 时 f32 舍入；')
lines.append("//    C# float×float 是 f32 单舍入乘法——严禁（探针首版 float[] 14247 项漂移实证）。")
lines.append('//    全链 double[] 承载 f32 舍入值：Deq 用 (double)(float)(q*s)，hid/out 用 (double)(float)。')
lines.append('//  - 采样计时/审计（timedFwd/seq%97）纯统计零引擎效应——不镜像（截断契约⑥）。')
lines.append('//  - flightMode：\'rl\'（现役网页默认，flightRLHead）与 \'bc\'（H_FLIGHT）双头齐备。')
lines.append('// ============================================================================')
lines.append('')
lines.append('using System;')
lines.append('')
lines.append('namespace PixelWorldBox.Core')
lines.append('{')
lines.append('    public static class WbNeuro')
lines.append('    {')
for key, nm in heads.items():
    h = d['head_' + key]
    nIn, nH, nOut = h['arch']
    q = lambda name: ', '.join(str(v) for v in h[name])
    lines.append(f'        // —— {key}：arch [{nIn},{nH},{nOut}]（Int8 逐张量量化；真值=neuro-weights.ts 回显） ——')
    lines.append(f'        static readonly int[] {nm}W1q = {{ {q("w1q")} }};')
    lines.append(f'        static readonly int[] {nm}B1q = {{ {q("b1q")} }};')
    lines.append(f'        static readonly int[] {nm}W2q = {{ {q("w2q")} }};')
    lines.append(f'        static readonly int[] {nm}B2q = {{ {q("b2q")} }};')
    for sc in ('sw1', 'sb1', 'sw2', 'sb2'):
        lines.append(f'        static readonly double {nm}S{sc[1:]} = (double)BitConverter.UInt64BitsToDouble({cdouble(le_f64(h[sc]))});')
    lines.append('')
# scratch + dequantized tables
lines.append('        // —— 反量化（dequantize L25-43 位精确：q*s f64 乘 → f32 舍入 → f64 承载） ——')
for key, nm in heads.items():
    h = d['head_' + key]
    nIn, nH, nOut = h['arch']
    lines.append(f'        static readonly double[] {nm}W1 = Deq({nm}W1q, {nm}Sw1);')
    lines.append(f'        static readonly double[] {nm}B1 = Deq({nm}B1q, {nm}Sb1);')
    lines.append(f'        static readonly double[] {nm}W2 = Deq({nm}W2q, {nm}Sw2);')
    lines.append(f'        static readonly double[] {nm}B2 = Deq({nm}B2q, {nm}Sb2);')
lines.append('')
lines.append('        static double[] Deq(int[] q, double s)')
lines.append('        {')
lines.append('            var w = new double[q.Length];')
lines.append('            for (int i = 0; i < q.Length; i++) w[i] = (double)(float)(q[i] * s);')
lines.append('            return w;')
lines.append('        }')
lines.append('')
lines.append('        // —— 各头 scratch（单线程引擎：模块级复用，零分配热路径——neuro.ts 同构） ——')
for key, nm in heads.items():
    h = d['head_' + key]
    nIn, nH, nOut = h['arch']
    lines.append(f'        static readonly double[] {nm}Hid = new double[{nH}];')
    lines.append(f'        static readonly double[] {nm}Out = new double[{nOut}];')
lines.append('')
lines.append('        /// <summary>fwd（neuro.ts L108-121 位精确）：f64 累积 → tanh → f32 舍入 → f64 承载；')
lines.append('        /// 二层 f64 累积 → f32 舍入。权重/隐层读出值均以 f64 参与乘加（Float32Array 语义）。</summary>')
lines.append('        static void Fwd(double[] f, int nIn, int nH, int nOut, double[] w1, double[] b1, double[] w2, double[] b2, double[] hid, double[] o)')
lines.append('        {')
lines.append('            for (int t = 0; t < nH; t++)')
lines.append('            {')
lines.append('                double s = b1[t];')
lines.append('                for (int i = 0; i < nIn; i++) s += f[i] * w1[i * nH + t];')
lines.append('                hid[t] = (double)(float)Math.Tanh(s);')
lines.append('            }')
lines.append('            for (int j = 0; j < nOut; j++)')
lines.append('            {')
lines.append('                double s = b2[j];')
lines.append('                for (int t = 0; t < nH; t++) s += hid[t] * w2[t * nOut + j];')
lines.append('                o[j] = (double)(float)s;')
lines.append('            }')
lines.append('        }')
lines.append('')
lines.append('        /// <summary>① 近战命中概率（neuroAcc L166-182：sigmoid 输出 [0,1]；引擎侧再钳制 0.35..0.97）。</summary>')
lines.append('        public static double Acc(double[] f)')
lines.append('        {')
lines.append('            Fwd(f, 10, 16, 1, AccW1, AccB1, AccW2, AccB2, AccHid, AccOut);')
lines.append('            return 1 / (1 + Math.Exp(-AccOut[0]));')
lines.append('        }')
lines.append('')
lines.append('        /// <summary>② 战斗姿态（neuroStance L185-203：0 追击/1 坚守/2 且战且退/3 伤重脱离——argmax）。</summary>')
lines.append('        public static int Stance(double[] f)')
lines.append('        {')
lines.append('            Fwd(f, 12, 10, 4, StanceW1, StanceB1, StanceW2, StanceB2, StanceHid, StanceOut);')
lines.append('            int best = 0;')
lines.append('            for (int j = 1; j < StanceOut.Length; j++) if (StanceOut[j] > StanceOut[best]) best = j;')
lines.append('            return best;')
lines.append('        }')
lines.append('')
lines.append('        /// <summary>③ 战或逃（neuroFlight L209-234：0 死战/1 脱离——argmax；rl=真值头）。</summary>')
lines.append('        public static int Flight(double[] f, bool rl)')
lines.append('        {')
lines.append('            if (rl) { Fwd(f, 9, 8, 2, FlightRlW1, FlightRlB1, FlightRlW2, FlightRlB2, FlightRlHid, FlightRlOut); return FlightRlOut[1] > FlightRlOut[0] ? 1 : 0; }')
lines.append('            Fwd(f, 9, 8, 2, FlightW1, FlightB1, FlightW2, FlightB2, FlightHid, FlightOut);')
lines.append('            return FlightOut[1] > FlightOut[0] ? 1 : 0;')
lines.append('        }')
lines.append('    }')
lines.append('}')

open('unity/pixel-world-box/Assets/Scripts/Core/WbNeuro.cs', 'w').write('\n'.join(lines) + '\n')
print('WbNeuro.cs written,', len(lines), 'lines')
