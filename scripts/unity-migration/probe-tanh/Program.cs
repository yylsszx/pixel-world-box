// ============================================================================
// tanhprobe —— M-U2c 前置探针 C# 侧：System.Math.Tanh/Exp 与 bun(JSC→glibc) 位精确比对
// 输入：scripts/unity-migration/golden-tanhprobe.json（gen-tanhprobe.mjs 生成）
// 判据：A 级网格逐位 + B 级真权重全链（f32 hid/out + f64 p）全绿 → 链锁平台 libm
// 运行：cd scripts/unity-migration/probe-tanh && dotnet run --release
// ============================================================================
using System.Text.Json;

var path = "/home/z/my-project/scripts/unity-migration/golden-tanhprobe.json";
var doc = JsonDocument.Parse(File.ReadAllText(path));
long checkedN = 0, drift = 0;

var sb = new System.Text.StringBuilder();

// ---- A 级：tanh 网格（复刻 bun 的 f64 步进累加序） ----
{
  var grid = doc.RootElement.GetProperty("tanh").GetProperty("grid");
  int i = 0; int localDrift = 0;
  for (double x = -8; x <= 8.0001; x += 5e-4, i++) {
    double t = Math.Tanh(x);
    string got = BitConverter.DoubleToUInt64Bits(t).ToString("x16");
    string exp = grid[i].GetString();
    checkedN++;
    if (got != exp) { localDrift++; if (localDrift <= 3) sb.AppendLine($"  tanh[{i}] x={x:R} got={got} exp={exp}"); }
  }
  var specials = doc.RootElement.GetProperty("tanh").GetProperty("specials");
  double[] sp = { 0, 1e-8, -1e-8, 1e-15, -1e-15, 1e15, -1e15, double.PositiveInfinity, double.NegativeInfinity, 0.5, -0.5, 1, -1 };
  for (int k = 0; k < sp.Length; k++) {
    string got = BitConverter.DoubleToUInt64Bits(Math.Tanh(sp[k])).ToString("x16");
    string exp = specials[k].GetString();
    checkedN++;
    if (got != exp) { localDrift++; sb.AppendLine($"  tanhSpecial[{k}] got={got} exp={exp}"); }
  }
  Console.WriteLine($"[A] tanh grid+specials: {i + sp.Length} checked, drift={localDrift}");
  if (localDrift > 0) Console.Write(sb.ToString());
  drift += localDrift; sb.Clear();
}

// ---- A 级：exp 网格 ----
{
  var grid = doc.RootElement.GetProperty("exp").GetProperty("grid");
  int i = 0; int localDrift = 0;
  for (double x = -30; x <= 30.001; x += 1e-3, i++) {
    double t = Math.Exp(x);
    string got = BitConverter.DoubleToUInt64Bits(t).ToString("x16");
    string exps = grid[i].GetString();
    checkedN++;
    if (got != exps) { localDrift++; if (localDrift <= 3) sb.AppendLine($"  exp[{i}] x={x:R} got={got} exp={exps}"); }
  }
  var specials = doc.RootElement.GetProperty("exp").GetProperty("specials");
  double[] sp = { 0, -0.0, 1e-8, -1e-8, 700, -700, 709, 710, -745, -746, double.PositiveInfinity, double.NegativeInfinity, 2, -2, -0.5, 0.5 };
  for (int k = 0; k < sp.Length; k++) {
    string got = BitConverter.DoubleToUInt64Bits(Math.Exp(sp[k])).ToString("x16");
    string exps = specials[k].GetString();
    checkedN++;
    if (got != exps) { localDrift++; sb.AppendLine($"  expSpecial[{k}] got={got} exp={exps}"); }
  }
  Console.WriteLine($"[A] exp grid+specials: {i + sp.Length} checked, drift={localDrift}");
  if (localDrift > 0) Console.Write(sb.ToString());
  drift += localDrift; sb.Clear();
}

// ---- B 级：真权重全链 fwd() ----
// C# 侧按 spec(q,s) 重算反量化并与 JSON f32 位模式先验校验，再全链前向比对
foreach (var headName in new[] { "acc", "stance", "flight", "flightRL" }) {
  var h = doc.RootElement.GetProperty("head_" + headName);
  var arch = h.GetProperty("arch"); int nIn = arch[0].GetInt32(), nH = arch[1].GetInt32(), nOut = arch[2].GetInt32();
  // spec 真值从 JSON 读取（q 数组 + f64 位模式 scales——零硬编码）
  int[] w1q = h.GetProperty("w1q").EnumerateArray().Select(e => e.GetInt32()).ToArray();
  int[] b1q = h.GetProperty("b1q").EnumerateArray().Select(e => e.GetInt32()).ToArray();
  int[] w2q = h.GetProperty("w2q").EnumerateArray().Select(e => e.GetInt32()).ToArray();
  int[] b2q = h.GetProperty("b2q").EnumerateArray().Select(e => e.GetInt32()).ToArray();
  double sw1 = BitConverter.UInt64BitsToDouble(Convert.ToUInt64(h.GetProperty("sw1").GetString(), 16));
  double sb1 = BitConverter.UInt64BitsToDouble(Convert.ToUInt64(h.GetProperty("sb1").GetString(), 16));
  double sw2 = BitConverter.UInt64BitsToDouble(Convert.ToUInt64(h.GetProperty("sw2").GetString(), 16));
  double sb2 = BitConverter.UInt64BitsToDouble(Convert.ToUInt64(h.GetProperty("sb2").GetString(), 16));
  // 先验：反量化 f32 位模式
  int dqDrift = 0;
  var w1 = Dq(w1q, sw1); var b1 = Dq(b1q, sb1);
  var w2 = Dq(w2q, sw2); var b2 = Dq(b2q, sb2);
  dqDrift += CompareF32(w1, h.GetProperty("w1"), "w1");
  dqDrift += CompareF32(b1, h.GetProperty("b1"), "b1");
  dqDrift += CompareF32(w2, h.GetProperty("w2"), "w2");
  dqDrift += CompareF32(b2, h.GetProperty("b2"), "b2");
  checkedN += w1.Length + b1.Length + w2.Length + b2.Length;
  Console.WriteLine($"[B:{headName}] dequant f32 patterns: drift={dqDrift}");
  drift += dqDrift;

  // ⚠ JS 位语义：Float32Array 读出值参与算术一律 f64 提升（f64 乘加），仅 store 时 f32 舍入；
  //   C# float×float 是 f32 单舍入乘法——严禁。全链用 double[] 承载 f32 舍入值（f32→f64 精确提升）。
  //   （首版探针 float[] 版本实测 out 层 1-2 ulp 漂移——本陷阱入档）
  var w1d = ToF64(w1); var b1d = ToF64(b1); var w2d = ToF64(w2); var b2d = ToF64(b2);
  var hid = new double[nH]; var hidBits = new uint[nH];
  var vecs = h.GetProperty("vecs");
  int localDrift = 0, vi = -1;
  double pDriftBits = 0;
  foreach (var vec in vecs.EnumerateArray()) {
    vi++;
    var fArr = vec.GetProperty("f"); var f = new double[nIn];
    for (int i = 0; i < nIn; i++) f[i] = BitConverter.UInt64BitsToDouble(Convert.ToUInt64(fArr[i].GetString(), 16));
    // fwd 链：f64 累积 → tanh → f32 store → f64 提升
    for (int t = 0; t < nH; t++) {
      double s = b1d[t];
      for (int i = 0; i < nIn; i++) s += f[i] * w1d[i * nH + t];
      hid[t] = (double)(float)Math.Tanh(s);
      hidBits[t] = BitConverter.SingleToUInt32Bits((float)hid[t]);
    }
    var outD = new double[nOut];
    for (int j = 0; j < nOut; j++) {
      double s = b2d[j];
      for (int t = 0; t < nH; t++) s += hid[t] * w2d[t * nOut + j];
      outD[j] = (double)(float)s;
    }
    // hid f32 比对
    var hidExp = vec.GetProperty("hid");
    for (int t = 0; t < nH; t++) {
      checkedN++;
      if (hidBits[t].ToString("x8") != hidExp[t].GetString()) { localDrift++; if (localDrift <= 3) sb.AppendLine($"  {headName} v{vi} hid[{t}] got={hidBits[t]:x8} exp={hidExp[t].GetString()}"); }
    }
    // out f32 比对
    var outExp = vec.GetProperty("out");
    for (int j = 0; j < nOut; j++) {
      checkedN++;
      uint ob = BitConverter.SingleToUInt32Bits((float)outD[j]);
      if (ob.ToString("x8") != outExp[j].GetString()) { localDrift++; if (localDrift <= 3) sb.AppendLine($"  {headName} v{vi} out[{j}] got={ob:x8} exp={outExp[j].GetString()}"); }
    }
    // acc 头 sigmoid p f64 比对
    if (headName == "acc") {
      checkedN++;
      double p = 1 / (1 + Math.Exp(-outD[0]));
      string pb = BitConverter.DoubleToUInt64Bits(p).ToString("x16");
      string pe = vec.GetProperty("p").GetString();
      if (pb != pe) {
        localDrift++;
        double pj = BitConverter.UInt64BitsToDouble(Convert.ToUInt64(pe, 16));
        pDriftBits = Math.Max(pDriftBits, Math.Abs(p - pj));
        if (localDrift <= 3) sb.AppendLine($"  {headName} v{vi} p got={pb} exp={pe} |dp|={Math.Abs(p - pj):R}");
      }
    }
  }
  Console.WriteLine($"[B:{headName}] fwd chain: {vecs.GetArrayLength()} vecs, drift={localDrift}" + (pDriftBits > 0 ? $" max|dp|={pDriftBits:R}" : ""));
  if (localDrift > 0) Console.Write(sb.ToString());
  drift += localDrift; sb.Clear();
}

Console.WriteLine($"== TOTAL checked={checkedN} drift={drift} => {(drift == 0 ? "ALL BIT-EXACT (platform libm chain-lock OK)" : "DRIFT FOUND")}");

static float[] Dq(int[] q, double s) { var w = new float[q.Length]; for (int i = 0; i < q.Length; i++) w[i] = (float)(q[i] * s); return w; }

static double[] ToF64(float[] a) { var w = new double[a.Length]; for (int i = 0; i < a.Length; i++) w[i] = a[i]; return w; }

static int CompareF32(float[] got, JsonElement expArr, string tag) {
  int d = 0;
  for (int i = 0; i < got.Length; i++) {
    if (BitConverter.SingleToUInt32Bits(got[i]).ToString("x8") != expArr[i].GetString()) { d++; if (d <= 3) Console.WriteLine($"  dq {tag}[{i}] got={BitConverter.SingleToUInt32Bits(got[i]):x8} exp={expArr[i].GetString()}"); }
  }
  return d;
}
