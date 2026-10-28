// ============================================================================
// gen-tanhprobe.mjs —— M-U2c 前置探针：Math.tanh / Math.exp 跨语言位精确验证
// 问题（Task 142 遗留）：现役网页默认开神经网络（neuroStats.enabled=true），
//   fwd() 隐层 Math.tanh(s) 结果存入 Float32Array（f32 舍入）——C# 若用
//   System.Math.Tanh，f64 末位差是否被 f32 舍入吸收？sigmoid 的 Math.exp
//   无 f32 缓冲（p 直接 f64 参与 rng 比较）——必须 f64 位精确。
// 方法（两级）：
//   A 级：tanh/exp 在覆盖域上的 f64 位模式网格（bun glibc vs .NET）；
//   B 级：真实 Int8 量化权重（neuro-weights.ts + neuro-flight-rl.ts）反量化后
//         全链 fwd()（f64 累积→tanh→f32 hid→f32 out→sigmoid p），随机特征向量
//         （mulberry32 种子驱动，覆盖真实值域）端到端位模式比对。
// 判据：
//   全绿 → C# 链锁 System.Math.Tanh/Exp（Task 143 平台 libm 决策先例）；
//   A 级 f64 有差但 B 级 f32/p 全同 → f32 吸收实证（p 依赖 exp f64 仍须全同）；
//   B 级有差 → fdlibm tanh/exp 移植（~250 行）。
// 运行：bun scripts/unity-migration/gen-tanhprobe.mjs
// 输出：scripts/unity-migration/golden-tanhprobe.json
// ============================================================================
import { NEURO_ACC, NEURO_STANCE, NEURO_FLIGHT } from '../../src/lib/game/neuro-weights.ts';
import { NEURO_FLIGHT_RL } from '../../src/lib/game/neuro-flight-rl.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { writeFileSync } from 'node:fs';

// ---- 反量化（neuro.ts dequantize 三行机械镜像；B 级同时回显 f32 权重位模式供 C# 校验反量化路径） ----
const dq = (q, s) => { const w = new Float32Array(q.length); for (let i = 0; i < q.length; i++) w[i] = q[i] * s; return w; };

const bits64 = (x) => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, x); return b.getBigUint64(0).toString(16).padStart(16, '0'); };
const bits32 = (x) => { const b = new DataView(new ArrayBuffer(4)); b.setFloat32(0, x); return b.getUint32(0).toString(16).padStart(8, '0'); };

const json = { meta: { node: 'bun', desc: 'M-U2c tanh/exp probe' } };

// ============ A 级：f64 网格 ============
// tanh：[-8,8] step 5e-4（32001 点）+ 特征值（0/±1e-8/±1e-15/±1e15/±Inf——s 域远窄但边界全测）
const tanhGrid = [];
for (let x = -8; x <= 8.0001; x += 5e-4) tanhGrid.push(bits64(Math.tanh(x)));
const tanhSpecial = [0, 1e-8, -1e-8, 1e-15, -1e-15, 1e15, -1e15, Infinity, -Infinity, 0.5, -0.5, 1, -1].map((x) => bits64(Math.tanh(x)));
json.tanh = { input: 'grid -8..8 step 5e-4 + specials', grid: tanhGrid, specials: tanhSpecial };

// exp：[-30,30] step 1e-3（60001 点）+ 特征值（sigmoid 输入域 ±2 为主；±700/±745/±746/±710 溢出/下溢边界）
const expGrid = [];
for (let x = -30; x <= 30.001; x += 1e-3) expGrid.push(bits64(Math.exp(x)));
const expSpecial = [0, -0, 1e-8, -1e-8, 700, -700, 709, 710, -745, -746, Infinity, -Infinity, 2, -2, -0.5, 0.5].map((x) => bits64(Math.exp(x)));
json.exp = { input: 'grid -30..30 step 1e-3 + specials', grid: expGrid, specials: expSpecial };

// ============ B 级：真实权重全链 fwd() ============
// 特征值域（贴近引擎真实分布）：
//   acc  nIn=10 : [0,1]×6 kills/敏捷/旗标×4 + [0,1]×2 林/山 → 全部 [0,1]∪[0,2]
//   stance nIn=12 : hp 比率/伤势/敌我比率等 ∈ [0,1]∪[-1,1]
//   flight nIn=9  : hp 比率/距离/劣势 ∈ [0,1]
// 统一采样：f[i] = (r*2-1) 的绝对值域混合——直接 [0,2] 与 [-1,1] 交替覆盖（超集覆盖真实域）
const heads = {
  acc: { spec: NEURO_ACC, nVec: 4000 },
  stance: { spec: NEURO_STANCE, nVec: 4000 },
  flight: { spec: NEURO_FLIGHT, nVec: 4000 },
  flightRL: { spec: NEURO_FLIGHT_RL, nVec: 4000 },
};

const fwdChain = (spec, f) => {
  const [nIn, nH, nOut] = spec.arch;
  const w1 = dq(spec.w1q, spec.sw1), b1 = dq(spec.b1q, spec.sb1);
  const w2 = dq(spec.w2q, spec.sw2), b2 = dq(spec.b2q, spec.sb2);
  const hid = new Float32Array(nH), out = new Float32Array(nOut);
  for (let t = 0; t < nH; t++) {
    let s = b1[t];
    for (let i = 0; i < nIn; i++) s += f[i] * w1[i * nH + t];
    hid[t] = Math.tanh(s);
  }
  for (let j = 0; j < nOut; j++) {
    let s = b2[j];
    for (let t = 0; t < nH; t++) s += hid[t] * w2[t * nOut + j];
    out[j] = s;
  }
  return { hid, out };
};

for (const [name, { spec, nVec }] of Object.entries(heads)) {
  const [nIn, nH, nOut] = spec.arch;
  const rng = mulberry32(0x5eed + nIn * 7919 + nH * 104729);
  // 反量化权重 f32 位模式回显（C# 侧先验校验 dequantize 路径）
  const w1f = dq(spec.w1q, spec.sw1), b1f = dq(spec.b1q, spec.sb1);
  const w2f = dq(spec.w2q, spec.sw2), b2f = dq(spec.b2q, spec.sb2);
  const vecs = [];
  for (let v = 0; v < nVec; v++) {
    const f = [];
    for (let i = 0; i < nIn; i++) {
      const r = rng();
      f.push(v % 3 === 0 ? r * 2 : r);        // [0,2] 与 [0,1] 交替；再加负值分支
      if (v % 7 === 0) f[i] = f[i] * 2 - 1;   // [-1,1] 分支
    }
    const { hid, out } = fwdChain(spec, f);
    const entry = { f: f.map((x) => bits64(x)), hid: Array.from(hid, bits32), out: Array.from(out, bits32) };
    if (name === 'acc') entry.p = bits64(1 / (1 + Math.exp(-out[0])));   // sigmoid（f64 直接参与 rng 比较）
    vecs.push(entry);
  }
  json['head_' + name] = {
    arch: spec.arch, nVec,
    // spec 回显（q/s 真值——C# 侧重算反量化并先验校验 f32 位模式，零硬编码）
    w1q: spec.w1q, b1q: spec.b1q, w2q: spec.w2q, b2q: spec.b2q,
    sw1: bits64(spec.sw1), sb1: bits64(spec.sb1), sw2: bits64(spec.sw2), sb2: bits64(spec.sb2),
    w1: Array.from(w1f, bits32), b1: Array.from(b1f, bits32),
    w2: Array.from(w2f, bits32), b2: Array.from(b2f, bits32),
    vecs,
  };
}

const out = 'scripts/unity-migration/golden-tanhprobe.json';
writeFileSync(out, JSON.stringify(json));
const total = json.tanh.grid.length + json.exp.grid.length + Object.values(heads).reduce((a, h) => a + h.nVec, 0);
console.log(`OK ${out} tanhGrid=${json.tanh.grid.length} expGrid=${json.exp.grid.length} vecs=${Object.values(heads).reduce((a, h) => a + h.nVec, 0)} bytes=${JSON.stringify(json).length}`);
