// Task 134：Unity 迁移黄金向量生成器（一次性工装，不入库）
// 产出：mulberry32 序列 + fdHypot 位模式 → C# 测试数组格式
// 源：noise.ts mulberry32（同源复制）+ engine.ts fdHypot（同源复制，与 jsmath.rs fd_hypot 同算法）
const buf = new ArrayBuffer(8);
const f64 = new Float64Array(buf);
const u32 = new Uint32Array(buf);
const hex = (v: number) => (v >>> 0).toString(16).padStart(8, '0');
const bitsOf = (v: number) => { f64[0] = v; return `0x${hex(u32[1])}${hex(u32[0])}`; };

// ---- mulberry32（noise.ts 同源）----
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- fdHypot（engine.ts 同源）----
const _hypF64 = new Float64Array(2);
const _hypU32 = new Uint32Array(_hypF64.buffer);
function hypHi(v: number): number { _hypF64[0] = v; return _hypU32[1]; }
function hypLo(v: number): number { _hypF64[0] = v; return _hypU32[0]; }
function hypSetHi(v: number, h: number): number { _hypF64[0] = v; _hypU32[1] = h; return _hypF64[0]; }
function fdHypot(x: number, y: number): number {
  let a = x, b = y;
  let ha = hypHi(x) & 0x7fffffff;
  let hb = hypHi(y) & 0x7fffffff;
  if (hb > ha) { const ta = a; a = b; b = ta; const th = ha; ha = hb; hb = th; }
  a = hypSetHi(a, ha); b = hypSetHi(b, hb);
  if (ha - hb > 0x3c00000) return a + b;
  let k = 0;
  if (ha > 0x5f300000) {
    if (ha >= 0x7ff00000) {
      let w = a + b;
      if (((ha & 0xfffff) | hypLo(a)) === 0) w = a;
      if ((((hb ^ 0x7ff00000) | hypLo(b)) >>> 0) === 0) w = b;
      return w;
    }
    ha -= 0x25800000; hb -= 0x25800000; k += 600;
    a = hypSetHi(a, ha); b = hypSetHi(b, hb);
  }
  if (hb < 0x20b00000) {
    if (hb <= 0x000fffff) {
      if (((hb | hypLo(b)) >>> 0) === 0) return a;
      const t1 = hypSetHi(0, 0x7fd00000);
      b *= t1; a *= t1; k -= 1022;
    } else {
      ha += 0x25800000; hb += 0x25800000; k -= 600;
      a = hypSetHi(a, ha); b = hypSetHi(b, hb);
    }
  }
  const w = a - b;
  let w2: number;
  if (w > b) {
    const t1 = hypSetHi(0, ha);
    const t2 = a - t1;
    w2 = Math.sqrt(t1 * t1 - (b * (-b) - t2 * (a + t1)));
  } else {
    a = a + a;
    const y1 = hypSetHi(0, hb);
    const y2 = b - y1;
    const t1 = hypSetHi(0, ha + 0x00100000);
    const t2 = a - t1;
    w2 = Math.sqrt(t1 * y1 - (w * (-w) - (t1 * y2 + t2 * b)));
  }
  if (k !== 0) {
    const t1 = hypSetHi(1, (0x3ff00000 + (k << 20)) >>> 0);
    return t1 * w2;
  }
  return w2;
}

// ---- 生成 C# 数组 ----
const out: string[] = [];
out.push('// 黄金向量（由 tools/golden-gen.ts 生成——JS 位精确基准，Unity C# 侧逐位比对）');
for (const seed of [20261026, 7, 0]) {
  const rng = mulberry32(seed);
  const vals: string[] = [];
  for (let i = 0; i < 8; i++) vals.push(bitsOf(rng()));
  out.push(`RNG seed=${seed}: [${vals.join(', ')}]`);
}
const hypCases: [number, number][] = [
  [3, 4],
  [12.55, 8.04],
  [182.5 - 169.9529, 148.5 - 156.463], // tick6 鱼 423 实景
  [1e308, 1e308],
  [5e-324, 5e-324],
  [1e300, 1e-300],
  [12.6, 0],
  [0.1, 0.7],
];
out.push('');
out.push('HYPOT cases (x, y) -> bits:');
for (const [x, y] of hypCases) out.push(`(${bitsOf(x)}, ${bitsOf(y)}) -> ${bitsOf(fdHypot(x, y))}`);
out.push('');
out.push('V8 对照（证明黄金向量必要性——Math.hypot 与 fdlibm 的 ULP 差异样本）:');
for (const [x, y] of [[12.55, 8.04], [0.1, 0.7], [1e300, 1e-300]] as [number, number][]) {
  const same = bitsOf(Math.hypot(x, y)) === bitsOf(fdHypot(x, y));
  out.push(`Math.hypot(${x},${y}) ${same ? '== fdlibm' : `!= fdlibm (V8 ${bitsOf(Math.hypot(x, y))} vs fd ${bitsOf(fdHypot(x, y))})`}`);
}
console.log(out.join('\n'));
