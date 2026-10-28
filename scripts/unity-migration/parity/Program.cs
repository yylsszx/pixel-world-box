// ============================================================================
// Program.cs —— Unity 迁移对账台（Task 134 并行会话 B）：C# 移植 ↔ JS 黄金向量逐位比对
// 读 golden-vectors.json（bun 从现役 noise.ts 生成），对 unity/pixel-world-box 正典
// 工程的 WbRng/WbNoise 做逐位（bit-exact）校验（位模式比较，禁 epsilon）。
// 退出码：0 = 全绿；1 = 有漂移（打印首 N 处漂移明细）。
// ============================================================================
using System.Globalization;
using System.Text.Json;
using PixelWorldBox.Core;

var path = Path.Combine(AppContext.BaseDirectory, "../../../../golden-vectors.json");
if (!File.Exists(path)) path = "golden-vectors.json";
var doc = JsonDocument.Parse(File.ReadAllText(path));
var root = doc.RootElement;

int total = 0, fail = 0;
var fails = new List<string>();
const int MAXREPORT = 12;

static ulong Bits(double d) => BitConverter.DoubleToUInt64Bits(d);
static string Hex(ulong u) => u.ToString("x16");

void Check(string tag, double expect, double actual, string loc)
{
    total++;
    if (Bits(expect) != Bits(actual))
    {
        fail++;
        if (fails.Count < MAXREPORT)
            fails.Add($"[{tag}] {loc}: JS={expect:R}({Hex(Bits(expect))}) C#={actual:R}({Hex(Bits(actual))})");
    }
}

// ---------- 1) mulberry32 流（WbRng.Next(ref uint) —— 状态驻留调用方） ----------
foreach (var s in root.GetProperty("rng").EnumerateArray())
{
    uint seed = (uint)s.GetProperty("seed").GetInt64();
    uint a = seed;
    int i = 0;
    foreach (var d in s.GetProperty("draws").EnumerateArray())
    {
        double expect = d.GetDouble();
        double actual = WbRng.Next(ref a);
        Check("rng", expect, actual, $"seed={seed} draw#{i++}");
    }
}

// ---------- 2) hash2 网格 ----------
foreach (var c in root.GetProperty("hash2").EnumerateArray())
{
    double x = c.GetProperty("x").GetDouble();
    double y = c.GetProperty("y").GetDouble();
    double seed = c.GetProperty("seed").GetDouble();
    double expect = c.GetProperty("v").GetDouble();
    double actual = WbNoise.Hash2(x, y, seed);
    Check("hash2", expect, actual, $"x={x} y={y} seed={seed}");
}

// ---------- 3) valueNoise ----------
foreach (var c in root.GetProperty("vn").EnumerateArray())
{
    double x = c.GetProperty("x").GetDouble();
    double y = c.GetProperty("y").GetDouble();
    double seed = c.GetProperty("seed").GetDouble();
    double expect = c.GetProperty("v").GetDouble();
    double actual = WbNoise.ValueNoise(x, y, seed);
    Check("vn", expect, actual, $"x={x} y={y} seed={seed}");
}

// ---------- 4) fbm（含变参） ----------
foreach (var c in root.GetProperty("fbm").EnumerateArray())
{
    double x = c.GetProperty("x").GetDouble();
    double y = c.GetProperty("y").GetDouble();
    double seed = c.GetProperty("seed").GetDouble();
    int oc = c.TryGetProperty("octaves", out var o) ? o.GetInt32() : 5;
    int la = c.TryGetProperty("lacunarity", out var l) ? l.GetInt32() : 2;
    double ga = c.TryGetProperty("gain", out var g2) ? g2.GetDouble() : 0.5;
    double expect = c.GetProperty("v").GetDouble();
    double actual = WbNoise.Fbm(x, y, seed, oc, la, ga);
    Check("fbm", expect, actual, $"x={x} y={y} seed={seed} oc={oc} la={la} ga={ga}");
}

// ---------- 5) 地形生成（M-U1a：generateWorld 全函数逐字节对账） ----------
static byte[] B64(string s) => Convert.FromBase64String(s);


var terrainPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-terrain.json");
if (!File.Exists(terrainPath)) terrainPath = "golden-terrain.json";
var terr = JsonDocument.Parse(File.ReadAllText(terrainPath)).RootElement;

foreach (var c in terr.EnumerateArray())
{
    string name = c.GetProperty("name").GetString()!;
    double seed = c.GetProperty("seed").GetDouble();
    var pe = c.GetProperty("params");
    WbWorldGenParams? p = null;
    if (pe.ValueKind == JsonValueKind.Object)
    {
        p = new WbWorldGenParams();
        if (pe.TryGetProperty("seaBias", out var sb)) p.SeaBias = sb.GetDouble();
        if (pe.TryGetProperty("tempBias", out var tb)) p.TempBias = tb.GetDouble();
        if (pe.TryGetProperty("moistBias", out var mb)) p.MoistBias = mb.GetDouble();
        if (pe.TryGetProperty("warp", out var wp)) p.Warp = wp.GetDouble();
        if (pe.TryGetProperty("falloff", out var fo)) p.Falloff = fo.GetDouble();
        if (pe.TryGetProperty("lakes", out var lk)) p.Lakes = lk.GetInt32();
    }

    var g = WbTerrainGen.Generate(seed, p);

    void CheckArr(string tag, byte[] expect, byte[] actual)
    {
        if (expect.Length != actual.Length)
        {
            fail++; total++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] 长度不符 JS={expect.Length} C#={actual.Length}");
            return;
        }
        int bad = -1;
        for (int i = 0; i < expect.Length; i++)
            if (expect[i] != actual[i]) { bad = i; break; }
        total++;
        if (bad >= 0)
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[{tag}/{name}] 首漂移 idx={bad} ({bad % 256},{bad / 256}) JS={expect[bad]} C#={actual[bad]} 漂移数={CountDiff(expect, actual)}");
        }
    }
    static int CountDiff(byte[] a, byte[] b)
    {
        int n = 0;
        for (int i = 0; i < a.Length && i < b.Length; i++) if (a[i] != b[i]) n++;
        return n;
    }

    CheckArr("terrain", B64(c.GetProperty("terrain").GetString()!), g.Terrain);
    CheckArr("variant", B64(c.GetProperty("variant").GetString()!), g.Variant);
    CheckArr("temp", B64(c.GetProperty("temp").GetString()!), g.Temp);
    CheckArr("moist", B64(c.GetProperty("moist").GetString()!), g.Moist);

    // spawn 列表逐项比对（race/x/y 全等）
    var se = c.GetProperty("spawns").EnumerateArray().GetEnumerator();
    int si = 0;
    bool spawnMismatch = g.SpawnCount != c.GetProperty("spawns").GetArrayLength();
    while (!spawnMismatch && se.MoveNext())
    {
        var it = se.Current;
        if (it.GetArrayLength() != 3) { spawnMismatch = true; break; }
        var en = it.EnumerateArray().GetEnumerator();
        en.MoveNext(); long rJ = en.Current.GetInt64();
        en.MoveNext(); double xJ = en.Current.GetDouble();
        en.MoveNext(); double yJ = en.Current.GetDouble();
        if (si >= g.SpawnCount ||
            rJ != g.SpawnRaces[si] ||
            Bits(xJ) != Bits(g.SpawnX[si]) ||
            Bits(yJ) != Bits(g.SpawnY[si]))
        {
            spawnMismatch = true;
            if (fails.Count < MAXREPORT)
            {
                string cside = si < g.SpawnCount ? $"C#=({g.SpawnRaces[si]},{g.SpawnX[si]:R},{g.SpawnY[si]:R})" : "C#=(越界)";
                fails.Add($"[spawn/{name}] idx={si} JS=({rJ},{xJ:R},{yJ:R}) {cside}");
            }
            break;
        }
        si++;
    }
    total++;
    if (spawnMismatch) fail++;
}

// ---------- 6) 板块构造（M-U1b 切片 1：initPlates + tectonicTick + releaseQuake 逐位对账） ----------
static uint Fnv(byte[] data)
{
    uint h = 2166136261u;
    foreach (var b in data) h = (h ^ b) * 16777619u;
    return h;
}
static byte[] U32Le(uint v) => new[] { (byte)v, (byte)(v >> 8), (byte)(v >> 16), (byte)(v >> 24) };
static ulong LeHexToBits(string s)
{
    byte[] b = new byte[8];
    for (int i = 0; i < 8; i++) b[i] = Convert.ToByte(s.Substring(i * 2, 2), 16);
    return BitConverter.ToUInt64(b, 0); // JS bitHex 小端字节序 → 位模式
}
static uint FnvF32(float[] arr)
{
    byte[] buf = new byte[arr.Length * 4];
    for (int i = 0; i < arr.Length; i++)
    {
        var le = U32Le(BitConverter.SingleToUInt32Bits(arr[i]));
        Array.Copy(le, 0, buf, i * 4, 4);
    }
    return Fnv(buf);
}
static uint FnvU32List(List<int> list)
{
    byte[] buf = new byte[list.Count * 4];
    for (int i = 0; i < list.Count; i++)
    {
        var le = U32Le((uint)list[i]);
        Array.Copy(le, 0, buf, i * 4, 4);
    }
    return Fnv(buf);
}

var natPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-nature.json");
if (!File.Exists(natPath)) natPath = "golden-nature.json";
var natRoot = JsonDocument.Parse(File.ReadAllText(natPath)).RootElement;

foreach (var c in natRoot.EnumerateArray())
{
    string name = c.GetProperty("name").GetString()!;
    int seed = c.GetProperty("seed").GetInt32();
    uint engRngSeed = (uint)c.GetProperty("engRngSeed").GetInt64();
    var ini = c.GetProperty("init");
    var n = new WbNature(seed, engRngSeed);
    n.InitPlates();

    void CheckD(string tag, ulong expectBits, double actual, string loc)
    {
        total++;
        if (expectBits != BitConverter.DoubleToUInt64Bits(actual))
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[{tag}/{name}] {loc}: JS={LeHexToBits(expectBits.ToString("x16")):R}({expectBits:x16}) C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})");
        }
    }
    void CheckHexD(string tag, string jsHex, double actual, string loc) => CheckD(tag, LeHexToBits(jsHex), actual, loc);
    void CheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect} C#={actual}");
        }
    }
    void CheckU(string tag, uint expect, uint actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect:x8} C#={actual:x8}");
        }
    }

    // ---- init 状态 ----
    CheckI("init.plateN", ini.GetProperty("plateN").GetInt64(), n.PlateN, "");
    CheckU("init.plateDigest", ini.GetProperty("plateDigest").GetUInt32(), Fnv(n.Plate), "");
    CheckI("init.boundaryCount", ini.GetProperty("boundaryCount").GetInt64(), n.Boundary.Count, "");
    CheckU("init.boundaryDigest", ini.GetProperty("boundaryDigest").GetUInt32(), FnvU32List(n.Boundary), "");
    var hsJ = ini.GetProperty("hotspots");
    CheckI("init.hotspotCount", hsJ.GetArrayLength(), n.Hotspots.Count, "");
    for (int h = 0; h < Math.Min(hsJ.GetArrayLength(), n.Hotspots.Count); h++)
    {
        CheckI($"init.hotspot[{h}].x", hsJ[h][0].GetInt64(), (long)n.Hotspots[h].X, "");
        CheckI($"init.hotspot[{h}].y", hsJ[h][1].GetInt64(), (long)n.Hotspots[h].Y, "");
    }
    var cxJ = ini.GetProperty("cx").EnumerateArray().GetEnumerator();
    var cyJ = ini.GetProperty("cy").EnumerateArray().GetEnumerator();
    var ddxJ = ini.GetProperty("ddx").EnumerateArray().GetEnumerator();
    var ddyJ = ini.GetProperty("ddy").EnumerateArray().GetEnumerator();
    for (int p = 0; p < n.PlateN; p++)
    {
        if (cxJ.MoveNext()) CheckHexD("init.cx", cxJ.Current.GetString()!, n.PlateCx[p], $"p={p}");
        if (cyJ.MoveNext()) CheckHexD("init.cy", cyJ.Current.GetString()!, n.PlateCy[p], $"p={p}");
        if (ddxJ.MoveNext()) CheckHexD("init.ddx", ddxJ.Current.GetString()!, n.DriftDx[p], $"p={p}");
        if (ddyJ.MoveNext()) CheckHexD("init.ddy", ddyJ.Current.GetString()!, n.DriftDy[p], $"p={p}");
    }

    // ---- 40 构造期演化（事件流 + 应力检查点摘要） ----
    var ticksJ = new Dictionary<int, JsonElement>();
    foreach (var t in c.GetProperty("ticks").EnumerateArray())
        ticksJ[t.GetProperty("t").GetInt32()] = t.GetProperty("events");
    var stressJ = new Dictionary<int, uint>();
    foreach (var prop in c.GetProperty("stressAt").EnumerateObject())
        stressJ[int.Parse(prop.Name.TrimStart('t'))] = prop.Value.GetUInt32();

    for (int t = 1; t <= 40; t++)
    {
        n.TectonicTick(true, false, 1234.5);
        bool jsHas = ticksJ.TryGetValue(t, out var evJ);
        int evCount = jsHas ? evJ.GetArrayLength() : 0;
        total++;
        if (evCount != n.PendingQuakes.Count)
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[tick/{name}] t={t}: JS 事件数={evCount} C#={n.PendingQuakes.Count}");
        }
        else if (evCount > 0)
        {
            for (int e = 0; e < evCount; e++)
            {
                var it = evJ[e];
                string k = it[0].GetString()!;
                bool isT = k == "t";
                // 逐字段位比对（x/y 为 number，m/r 为 JS 小端 hex 位模式）
                CheckD($"ev.t{t}.e{e}.x", BitConverter.DoubleToUInt64Bits(it[1].GetDouble()), n.PendingQuakes[e].X, k);
                CheckD($"ev.t{t}.e{e}.y", BitConverter.DoubleToUInt64Bits(it[2].GetDouble()), n.PendingQuakes[e].Y, k);
                CheckD($"ev.t{t}.e{e}.m", LeHexToBits(it[3].GetString()!), n.PendingQuakes[e].M, k);
                total++;
                if (isT != n.PendingQuakes[e].IsTsunami)
                {
                    fail++;
                    if (fails.Count < MAXREPORT) fails.Add($"[ev.t{t}.e{e}/{name}] kind JS={k} C#={n.PendingQuakes[e].IsTsunami}");
                }
            }
        }
        n.PendingQuakes.Clear();
        if (stressJ.TryGetValue(t, out var sDigest))
        {
            CheckU($"stress.t{t}", sDigest, FnvF32(n.Stress), "");
        }
    }

    // ---- 终态 ----
    var fin = c.GetProperty("final");
    CheckU("fin.plateDigest", fin.GetProperty("plateDigest").GetUInt32(), Fnv(n.Plate), "");
    CheckI("fin.boundaryCount", fin.GetProperty("boundaryCount").GetInt64(), n.Boundary.Count, "");
    CheckU("fin.boundaryDigest", fin.GetProperty("boundaryDigest").GetUInt32(), FnvU32List(n.Boundary), "");
    CheckU("fin.stressDigest", fin.GetProperty("stressDigest").GetUInt32(), FnvF32(n.Stress), "");
    var fcx = fin.GetProperty("cx").EnumerateArray().GetEnumerator();
    var fcy = fin.GetProperty("cy").EnumerateArray().GetEnumerator();
    for (int p = 0; p < n.PlateN; p++)
    {
        if (fcx.MoveNext()) CheckHexD("fin.cx", fcx.Current.GetString()!, n.PlateCx[p], $"p={p}");
        if (fcy.MoveNext()) CheckHexD("fin.cy", fcy.Current.GetString()!, n.PlateCy[p], $"p={p}");
    }
    var fh = fin.GetProperty("hotHeat").EnumerateArray().GetEnumerator();
    for (int h = 0; h < n.Hotspots.Count && fh.MoveNext(); h++)
        CheckHexD($"fin.heat[{h}]", fh.Current.GetString()!, n.Hotspots[h].Heat, "");
    var cnt = fin.GetProperty("counters");
    CheckI("cnt.quakes", cnt.GetProperty("quakes").GetInt64(), n.Quakes, "");
    CheckI("cnt.quakesBig", cnt.GetProperty("quakesBig").GetInt64(), n.QuakesBig, "");
    CheckI("cnt.tsunamis", cnt.GetProperty("tsunamis").GetInt64(), n.Tsunamis, "");
    var rqJ = fin.GetProperty("recentQuakes");
    CheckI("fin.recentCount", rqJ.GetArrayLength(), n.RecentQuakes.Count, "");
    for (int q = 0; q < Math.Min(rqJ.GetArrayLength(), n.RecentQuakes.Count); q++)
    {
        CheckI($"recent[{q}].x", rqJ[q][0].GetInt64(), n.RecentQuakes[q].X, "");
        CheckI($"recent[{q}].y", rqJ[q][1].GetInt64(), n.RecentQuakes[q].Y, "");
        CheckHexD($"recent[{q}].m", rqJ[q][2].GetString()!, n.RecentQuakes[q].M, "");
        CheckI($"recent[{q}].year", rqJ[q][3].GetInt64(), n.RecentQuakes[q].Year, "");
    }
    CheckI("fin.epoch", fin.GetProperty("epoch").GetInt64(), n.PlateEpoch, "");
    CheckHexD("fin.ash", fin.GetProperty("ash").GetString()!, n.Ash, "");
    // ---- eng.rng 流指纹：终态后再抽 4 步（消耗次数不同 → 状态不同 → 尾抽必漂） ----
    var tailJ = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
    for (int i = 0; i < 4 && tailJ.MoveNext(); i++)
        CheckHexD($"rngTail[{i}]", tailJ.Current.GetString()!, WbRng.Next(ref n.EngRngState), "");
}

// ---------- 7) 大气环流（M-U1b 切片 2：atmTick 全确定性段逐位对账，Task 137） ----------
var atmPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-atmosphere.json");
if (!File.Exists(atmPath)) atmPath = "golden-atmosphere.json";
var atmRoot = JsonDocument.Parse(File.ReadAllText(atmPath)).RootElement;

foreach (var c in atmRoot.EnumerateArray())
{
    string name = c.GetProperty("name").GetString()!;
    int seed = c.GetProperty("seed").GetInt32();
    uint engRngSeed = (uint)c.GetProperty("engRngSeed").GetInt64();
    double yearF = c.GetProperty("yearF").GetDouble();
    double dayPhase = c.GetProperty("dayPhase").GetDouble();
    double moonIllum = c.GetProperty("moonIllum").GetDouble();
    double camX = c.GetProperty("camX").GetDouble();
    double camY = c.GetProperty("camY").GetDouble();

    var a = new WbNature(seed, engRngSeed);
    a.InitPlates();
    a.Moist = new float[WbConstants.AW * WbConstants.AH];
    double moistInit = c.GetProperty("init").GetProperty("moistInit").GetDouble();
    for (int i = 0; i < a.Moist.Length; i++) a.Moist[i] = (float)moistInit;
    a.Terrain = B64(c.GetProperty("terrainB64").GetString()!);
    if (c.GetProperty("terrainDigest") is var tdJ)
        CheckU("atm.terrainDigest", tdJ.GetUInt32(), Fnv(a.Terrain), "");
    if (c.GetProperty("sstPos").GetBoolean()) // 与 gen 脚本 sstPos 同式：i%11==0 → 正异常
    {
        a.SstAnom = new double[WbConstants.AW * WbConstants.AH];
        for (int i = 0; i < a.SstAnom.Length; i++) a.SstAnom[i] = i % 11 == 0 ? 0.5 : -0.25;
    }
    var ctx = new WbAtmCtx
    {
        Atmosphere = true, Seasons = true, NaturalDisasters = true,
        YearF = yearF, DayPhase = dayPhase, MoonIllum = moonIllum, CamX = camX, CamY = camY,
    };

    void CheckFlag(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect} C#={actual}");
        }
    }
    void CheckI64(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect} C#={actual}");
        }
    }
    void CheckD(string tag, ulong expectBits, double actual, string loc)
    {
        total++;
        if (expectBits != BitConverter.DoubleToUInt64Bits(actual))
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[{tag}/{name}] {loc}: JS={LeHexToBits(expectBits.ToString("x16")):R}({expectBits:x16}) C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})");
        }
    }
    void CheckHexD(string tag, string jsHex, double actual, string loc) => CheckD(tag, LeHexToBits(jsHex), actual, loc);
    void CheckU(string tag, uint expect, uint actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect:x8} C#={actual:x8}");
        }
    }

    // ---- 120 大气步：事件流 + 检查点摘要 ----
    var ticksJ = new Dictionary<int, JsonElement>();
    foreach (var t in c.GetProperty("ticks").EnumerateArray())
        ticksJ[t.GetProperty("t").GetInt32()] = t.GetProperty("events");

    for (int t = 1; t <= 120; t++)
    {
        a.AtmTick(ctx);
        bool jsHas = ticksJ.TryGetValue(t, out var evJ);
        int evCount = jsHas ? evJ.GetArrayLength() : 0;
        total++;
        if (evCount != a.PendingAtm.Count)
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[atm.t{t}/{name}] JS 事件数={evCount} C#={a.PendingAtm.Count}");
        }
        else if (evCount > 0)
        {
            for (int e = 0; e < evCount; e++)
            {
                var it = evJ[e];
                string k = it[0].GetString()!;
                var ev = a.PendingAtm[e];
                total++;
                if (k != (ev.Kind == "chron" ? "chron" : ev.Kind))
                {
                    fail++;
                    if (fails.Count < MAXREPORT) fails.Add($"[atm.t{t}.e{e}/{name}] kind JS={k} C#={ev.Kind}");
                    continue;
                }
                if (k == "chron")
                {
                    string code = it[1].GetString()!;
                    total++;
                    if (code != ev.Code)
                    {
                        fail++;
                        if (fails.Count < MAXREPORT) fails.Add($"[atm.t{t}.e{e}/{name}] code JS={code} C#={ev.Code}");
                    }
                    // x/y 可为 null（无 pos 纪事）
                    bool jsPos = it[2].ValueKind != JsonValueKind.Null;
                    CheckFlag($"atm.t{t}.e{e}.hasPos", jsPos, ev.HasPos, k);
                    if (jsPos && ev.HasPos)
                    {
                        CheckD($"atm.t{t}.e{e}.x", BitConverter.DoubleToUInt64Bits(it[2].GetDouble()), ev.X, k);
                        CheckD($"atm.t{t}.e{e}.y", BitConverter.DoubleToUInt64Bits(it[3].GetDouble()), ev.Y, k);
                    }
                }
                else
                {
                    CheckD($"atm.t{t}.e{e}.x", BitConverter.DoubleToUInt64Bits(it[1].GetDouble()), ev.X, k);
                    CheckD($"atm.t{t}.e{e}.y", BitConverter.DoubleToUInt64Bits(it[2].GetDouble()), ev.Y, k);
                }
            }
        }
        a.PendingAtm.Clear();
        // 检查点摘要（t30/60/90/120）
        string ck = "t" + t;
        if (c.GetProperty("checks").TryGetProperty(ck, out var cj))
        {
            CheckU($"atm.{ck}.moist", cj.GetProperty("moist").GetUInt32(), FnvF32(a.Moist), "");
            CheckU($"atm.{ck}.ashF", cj.GetProperty("ashF").GetUInt32(), FnvF32(a.AshF), "");
            CheckU($"atm.{ck}.rain", cj.GetProperty("rain").GetUInt32(), Fnv(a.RainCell), "");
            CheckU($"atm.{ck}.flood", cj.GetProperty("flood").GetUInt32(), FnvF32(a.FloodAcc), "");
            CheckU($"atm.{ck}.prev", cj.GetProperty("prev").GetUInt32(), Fnv(a.PrevRain), "");
            CheckHexD($"atm.{ck}.ash", cj.GetProperty("ash").GetString()!, a.Ash, "");
            CheckHexD($"atm.{ck}.windPhase", cj.GetProperty("windPhase").GetString()!, a.WindPhase, "");
            var psJ = cj.GetProperty("ps");
            total++;
            if (psJ.GetArrayLength() != a.PSystems.Count)
            {
                fail++;
                if (fails.Count < MAXREPORT) fails.Add($"[atm.{ck}/{name}] pSystems 数 JS={psJ.GetArrayLength()} C#={a.PSystems.Count}");
            }
            for (int p = 0; p < Math.Min(psJ.GetArrayLength(), a.PSystems.Count); p++)
            {
                var pj = psJ[p];
                var pc = a.PSystems[p];
                CheckI64($"atm.{ck}.ps{p}.kind", pj[0].GetInt64(), pc.Kind, "");
                CheckHexD($"atm.{ck}.ps{p}.x", pj[1].GetString()!, pc.X, "");
                CheckHexD($"atm.{ck}.ps{p}.y", pj[2].GetString()!, pc.Y, "");
                CheckHexD($"atm.{ck}.ps{p}.str", pj[4].GetString()!, pc.Str, "");
                CheckI64($"atm.{ck}.ps{p}.ttl", pj[5].GetInt64(), pc.Ttl, "");
            }
            var cnt2 = cj.GetProperty("counters");
            CheckI64($"atm.{ck}.lightning", cnt2.GetProperty("lightning").GetInt64(), a.LightningN, "");
            CheckI64($"atm.{ck}.meteors", cnt2.GetProperty("meteors").GetInt64(), a.MeteorsN, "");
            CheckI64($"atm.{ck}.eclipses", cnt2.GetProperty("eclipses").GetInt64(), a.EclipsesN, "");
            CheckI64($"atm.{ck}.bloodMoons", cnt2.GetProperty("bloodMoons").GetInt64(), a.BloodMoonsN, "");
            CheckI64($"atm.{ck}.sunShowers", cnt2.GetProperty("sunShowers").GetInt64(), a.SunShowersN, "");
            var coo = cj.GetProperty("coolers");
            CheckI64($"atm.{ck}.boltCool", coo.GetProperty("bolt").GetInt64(), a.BoltCool, "");
            CheckI64($"atm.{ck}.rainbowCool", coo.GetProperty("rainbow").GetInt64(), a.RainbowCool, "");
            CheckI64($"atm.{ck}.meteorCool", coo.GetProperty("meteor").GetInt64(), a.MeteorCool, "");
            CheckI64($"atm.{ck}.eclipseCool", coo.GetProperty("eclipse").GetInt64(), a.EclipseCool, "");
            CheckI64($"atm.{ck}.bloodMoonCool", coo.GetProperty("bloodMoon").GetInt64(), a.BloodMoonCool, "");
            CheckI64($"atm.{ck}.sunShowerCool", coo.GetProperty("sunShower").GetInt64(), a.SunShowerCool, "");
            var tt2 = cj.GetProperty("ttls");
            CheckI64($"atm.{ck}.rainbowTTL", tt2.GetProperty("rainbow").GetInt64(), a.RainbowTTL, "");
            CheckI64($"atm.{ck}.meteorTTL", tt2.GetProperty("meteor").GetInt64(), a.MeteorTTL, "");
            CheckI64($"atm.{ck}.eclipseTTL", tt2.GetProperty("eclipse").GetInt64(), a.EclipseTTL, "");
            CheckI64($"atm.{ck}.bloodMoonTTL", tt2.GetProperty("bloodMoon").GetInt64(), a.BloodMoonTTL, "");
            CheckI64($"atm.{ck}.sunShowerTTL", tt2.GetProperty("sunShower").GetInt64(), a.SunShowerTTL, "");
            var fl = cj.GetProperty("flags");
            CheckFlag($"atm.{ck}.f.bolt", fl.GetProperty("bolt").GetBoolean(), a.BoltChronDone, "");
            CheckFlag($"atm.{ck}.f.tSnow", fl.GetProperty("tSnow").GetBoolean(), a.TSnowChronDone, "");
            CheckFlag($"atm.{ck}.f.rainbow", fl.GetProperty("rainbow").GetBoolean(), a.RainbowChronDone, "");
            CheckFlag($"atm.{ck}.f.moon", fl.GetProperty("moon").GetBoolean(), a.MoonChronDone, "");
            CheckFlag($"atm.{ck}.f.meteor", fl.GetProperty("meteor").GetBoolean(), a.MeteorChronDone, "");
            CheckFlag($"atm.{ck}.f.eclipse", fl.GetProperty("eclipse").GetBoolean(), a.EclipseChronDone, "");
            CheckFlag($"atm.{ck}.f.bloodMoon", fl.GetProperty("bloodMoon").GetBoolean(), a.BloodMoonChronDone, "");
            CheckFlag($"atm.{ck}.f.sunShower", fl.GetProperty("sunShower").GetBoolean(), a.SunShowerChronDone, "");
            CheckFlag($"atm.{ck}.f.fullMoon", fl.GetProperty("fullMoon").GetBoolean(), a.FullMoonChronDone, "");
            CheckFlag($"atm.{ck}.f.boost", fl.GetProperty("boost").GetBoolean(), a.RainbowBoost, "");
            CheckFlag($"atm.{ck}.f.double", fl.GetProperty("double").GetBoolean(), a.RainbowDouble, "");
            CheckFlag($"atm.{ck}.f.moonArc", fl.GetProperty("moonArc").GetBoolean(), a.RainbowMoon, "");
            CheckFlag($"atm.{ck}.f.wished", fl.GetProperty("wished").GetBoolean(), a.MeteorWished, "");
            CheckI64($"atm.{ck}.probes", cj.GetProperty("probes").GetInt64(), a.ProbeCalls, "");
        }
    }

    // ---- 终态（全量位级） ----
    var af = c.GetProperty("final");
    CheckU("atm.fin.moist", af.GetProperty("moistDigest").GetUInt32(), FnvF32(a.Moist), "");
    CheckU("atm.fin.ashF", af.GetProperty("ashFDigest").GetUInt32(), FnvF32(a.AshF), "");
    CheckU("atm.fin.rain", af.GetProperty("rainDigest").GetUInt32(), Fnv(a.RainCell), "");
    CheckU("atm.fin.flood", af.GetProperty("floodDigest").GetUInt32(), FnvF32(a.FloodAcc), "");
    CheckU("atm.fin.prev", af.GetProperty("prevDigest").GetUInt32(), Fnv(a.PrevRain), "");
    CheckHexD("atm.fin.ash", af.GetProperty("ash").GetString()!, a.Ash, "");
    CheckHexD("atm.fin.windPhase", af.GetProperty("windPhase").GetString()!, a.WindPhase, "");
    var fps = af.GetProperty("ps");
    total++;
    if (fps.GetArrayLength() != a.PSystems.Count)
    {
        fail++;
        if (fails.Count < MAXREPORT) fails.Add($"[atm.fin/{name}] pSystems 数 JS={fps.GetArrayLength()} C#={a.PSystems.Count}");
    }
    for (int p = 0; p < Math.Min(fps.GetArrayLength(), a.PSystems.Count); p++)
    {
        var pj = fps[p];
        var pc = a.PSystems[p];
        CheckI64($"atm.fin.ps{p}.kind", pj[0].GetInt64(), pc.Kind, "");
        CheckHexD($"atm.fin.ps{p}.x", pj[1].GetString()!, pc.X, "");
        CheckHexD($"atm.fin.ps{p}.y", pj[2].GetString()!, pc.Y, "");
        CheckHexD($"atm.fin.ps{p}.str", pj[3].GetString()!, pc.Str, "");
        CheckI64($"atm.fin.ps{p}.ttl", pj[4].GetInt64(), pc.Ttl, "");
    }
    var fcnt = af.GetProperty("counters");
    CheckI64("atm.fin.lightning", fcnt.GetProperty("lightning").GetInt64(), a.LightningN, "");
    CheckI64("atm.fin.meteors", fcnt.GetProperty("meteors").GetInt64(), a.MeteorsN, "");
    CheckI64("atm.fin.eclipses", fcnt.GetProperty("eclipses").GetInt64(), a.EclipsesN, "");
    CheckI64("atm.fin.bloodMoons", fcnt.GetProperty("bloodMoons").GetInt64(), a.BloodMoonsN, "");
    CheckI64("atm.fin.sunShowers", fcnt.GetProperty("sunShowers").GetInt64(), a.SunShowersN, "");
    CheckI64("atm.fin.probes", af.GetProperty("probes").GetInt64(), a.ProbeCalls, "");
    CheckHexD("atm.fin.rainbowX", af.GetProperty("rainbowX").GetString()!, a.RainbowX, "");
    CheckHexD("atm.fin.rainbowY", af.GetProperty("rainbowY").GetString()!, a.RainbowY, "");
    CheckHexD("atm.fin.meteorDx", af.GetProperty("meteorDx").GetString()!, a.MeteorDx, "");
    CheckHexD("atm.fin.meteorDy", af.GetProperty("meteorDy").GetString()!, a.MeteorDy, "");
    CheckHexD("atm.fin.meteorX", af.GetProperty("meteorX").GetString()!, a.MeteorX, "");
    CheckHexD("atm.fin.meteorY", af.GetProperty("meteorY").GetString()!, a.MeteorY, "");
    CheckHexD("atm.fin.eclipseX", af.GetProperty("eclipseX").GetString()!, a.EclipseX, "");
    CheckHexD("atm.fin.eclipseY", af.GetProperty("eclipseY").GetString()!, a.EclipseY, "");
    CheckHexD("atm.fin.bloodMoonX", af.GetProperty("bloodMoonX").GetString()!, a.BloodMoonX, "");
    CheckHexD("atm.fin.bloodMoonY", af.GetProperty("bloodMoonY").GetString()!, a.BloodMoonY, "");
    var fcoo = af.GetProperty("coolers");
    CheckI64("atm.fin.boltCool", fcoo.GetProperty("bolt").GetInt64(), a.BoltCool, "");
    CheckI64("atm.fin.rainbowCool", fcoo.GetProperty("rainbow").GetInt64(), a.RainbowCool, "");
    CheckI64("atm.fin.meteorCool", fcoo.GetProperty("meteor").GetInt64(), a.MeteorCool, "");
    CheckI64("atm.fin.eclipseCool", fcoo.GetProperty("eclipse").GetInt64(), a.EclipseCool, "");
    CheckI64("atm.fin.bloodMoonCool", fcoo.GetProperty("bloodMoon").GetInt64(), a.BloodMoonCool, "");
    CheckI64("atm.fin.sunShowerCool", fcoo.GetProperty("sunShower").GetInt64(), a.SunShowerCool, "");
    var ftt = af.GetProperty("ttls");
    CheckI64("atm.fin.rainbowTTL", ftt.GetProperty("rainbow").GetInt64(), a.RainbowTTL, "");
    CheckI64("atm.fin.meteorTTL", ftt.GetProperty("meteor").GetInt64(), a.MeteorTTL, "");
    CheckI64("atm.fin.eclipseTTL", ftt.GetProperty("eclipse").GetInt64(), a.EclipseTTL, "");
    CheckI64("atm.fin.bloodMoonTTL", ftt.GetProperty("bloodMoon").GetInt64(), a.BloodMoonTTL, "");
    CheckI64("atm.fin.sunShowerTTL", ftt.GetProperty("sunShower").GetInt64(), a.SunShowerTTL, "");
    CheckI64("atm.fin.sunShowerMax", ftt.GetProperty("sunShowerMax").GetInt64(), a.SunShowerMax, "");
    var ffl = af.GetProperty("flags");
    CheckFlag("atm.fin.f.bolt", ffl.GetProperty("bolt").GetBoolean(), a.BoltChronDone, "");
    CheckFlag("atm.fin.f.tSnow", ffl.GetProperty("tSnow").GetBoolean(), a.TSnowChronDone, "");
    CheckFlag("atm.fin.f.rainbow", ffl.GetProperty("rainbow").GetBoolean(), a.RainbowChronDone, "");
    CheckFlag("atm.fin.f.moon", ffl.GetProperty("moon").GetBoolean(), a.MoonChronDone, "");
    CheckFlag("atm.fin.f.meteor", ffl.GetProperty("meteor").GetBoolean(), a.MeteorChronDone, "");
    CheckFlag("atm.fin.f.eclipse", ffl.GetProperty("eclipse").GetBoolean(), a.EclipseChronDone, "");
    CheckFlag("atm.fin.f.bloodMoon", ffl.GetProperty("bloodMoon").GetBoolean(), a.BloodMoonChronDone, "");
    CheckFlag("atm.fin.f.sunShower", ffl.GetProperty("sunShower").GetBoolean(), a.SunShowerChronDone, "");
    CheckFlag("atm.fin.f.fullMoon", ffl.GetProperty("fullMoon").GetBoolean(), a.FullMoonChronDone, "");
    CheckFlag("atm.fin.f.boost", ffl.GetProperty("boost").GetBoolean(), a.RainbowBoost, "");
    CheckFlag("atm.fin.f.double", ffl.GetProperty("double").GetBoolean(), a.RainbowDouble, "");
    CheckFlag("atm.fin.f.moonArc", ffl.GetProperty("moonArc").GetBoolean(), a.RainbowMoon, "");
    CheckFlag("atm.fin.f.wished", ffl.GetProperty("wished").GetBoolean(), a.MeteorWished, "");
    // ---- eng.rng 流指纹 ----
    var atailJ = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
    for (int i = 0; i < 4 && atailJ.MoveNext(); i++)
        CheckHexD($"atm.rngTail[{i}]", atailJ.Current.GetString()!, WbRng.Next(ref a.EngRngState), "");
}

// ---------- 8) 风暴生命周期（M-U1b 切片 3：stormTick 全确定性段逐位对账，Task 138） ----------
var stormPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-storms.json");
if (!File.Exists(stormPath)) stormPath = "golden-storms.json";
var stRoot = JsonDocument.Parse(File.ReadAllText(stormPath)).RootElement;

foreach (var c in stRoot.EnumerateArray())
{
    string name = c.GetProperty("name").GetString()!;
    int seed = c.GetProperty("seed").GetInt32();
    uint engRngSeed = (uint)c.GetProperty("engRngSeed").GetInt64();
    double yearF = c.GetProperty("yearF").GetDouble();
    double moistInit = c.GetProperty("moistInit").GetDouble();

    var n = new WbNature(seed, engRngSeed);
    n.InitPlates();
    for (int i = 0; i < n.Moist.Length; i++) n.Moist[i] = (float)moistInit;
    n.Terrain = B64(c.GetProperty("terrainB64").GetString()!);
    CheckU("storm.terrainDigest", c.GetProperty("terrainDigest").GetUInt32(), Fnv(n.Terrain), "");

    // 注入（激活度工程：pSystem 助产 + 强风暴；值来自 gen 脚本冻结结果）
    var inj = c.GetProperty("inj");
    if (inj.TryGetProperty("ps", out var psJ2) && psJ2.ValueKind == JsonValueKind.Object)
        n.PSystems.Add(new WbPressureSystem
        {
            X = psJ2.GetProperty("x").GetDouble(),
            Y = psJ2.GetProperty("y").GetDouble(),
            Str = psJ2.GetProperty("str").GetDouble(),
            Kind = psJ2.GetProperty("kind").GetInt32(),
            Ttl = psJ2.GetProperty("ttl").GetInt32(),
        });
    if (inj.TryGetProperty("storm", out var stJ) && stJ.ValueKind == JsonValueKind.Object)
        n.Storms.Add(new WbCyclone
        {
            Id = stJ.GetProperty("id").GetInt32(),
            X = stJ.GetProperty("x").GetDouble(),
            Y = stJ.GetProperty("y").GetDouble(),
            Strength = stJ.GetProperty("strength").GetDouble(),
            Ttl = stJ.GetProperty("ttl").GetInt32(),
            Seed = stJ.GetProperty("seed").GetInt32(),
            Kind = stJ.GetProperty("kind").GetString()!,
            Name = stJ.GetProperty("name").GetString()!,
            Landed = false,
        });
    n.StormSeq = inj.GetProperty("stormSeqNext").GetInt32();

    void CheckD(string tag, ulong expectBits, double actual, string loc)
    {
        total++;
        if (expectBits != BitConverter.DoubleToUInt64Bits(actual))
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[{tag}/{name}] {loc}: JS={LeHexToBits(expectBits.ToString("x16")):R}({expectBits:x16}) C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})");
        }
    }
    void CheckHexD(string tag, string jsHex, double actual, string loc) => CheckD(tag, LeHexToBits(jsHex), actual, loc);
    void CheckU(string tag, uint expect, uint actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect:x8} C#={actual:x8}");
        }
    }
    void CheckI64(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect} C#={actual}");
        }
    }
    void CheckStr(string tag, string expect, string actual)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}]: JS={expect} C#={actual}");
        }
    }

    var ticksJ = new Dictionary<int, JsonElement>();
    foreach (var t in c.GetProperty("ticks").EnumerateArray())
        ticksJ[t.GetProperty("t").GetInt32()] = t.GetProperty("events");

    for (int t = 1; t <= 50; t++)
    {
        n.StormTick(true, true, true, yearF);
        bool jsHas = ticksJ.TryGetValue(t, out var evJ);
        int evCount = jsHas ? evJ.GetArrayLength() : 0;
        total++;
        if (evCount != n.PendingStorms.Count)
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[storm.t{t}/{name}] JS 事件数={evCount} C#={n.PendingStorms.Count}");
        }
        else if (evCount > 0)
        {
            for (int e = 0; e < evCount; e++)
            {
                var it = evJ[e];
                string k = it[0].GetString()!;
                var ev = n.PendingStorms[e];
                bool kindOk = k == ev.Kind || (k == "sand" && ev.Kind == "sandstorm");
                total++;
                if (!kindOk)
                {
                    fail++;
                    if (fails.Count < MAXREPORT) fails.Add($"[storm.t{t}.e{e}/{name}] kind JS={k} C#={ev.Kind}");
                    continue;
                }
                if (k == "geo" || k == "toast")
                    CheckStr($"storm.t{t}.e{e}.code", it[1].GetString()!, ev.Code);
                if (k == "geo")
                {
                    CheckD($"storm.t{t}.e{e}.x", BitConverter.DoubleToUInt64Bits(it[2].GetDouble()), ev.X, k);
                    CheckD($"storm.t{t}.e{e}.y", BitConverter.DoubleToUInt64Bits(it[3].GetDouble()), ev.Y, k);
                }
                else if (k == "ravage")
                {
                    CheckI64($"storm.t{t}.e{e}.id", it[1].GetInt64(), ev.Id, k);
                    CheckD($"storm.t{t}.e{e}.x", BitConverter.DoubleToUInt64Bits(it[2].GetDouble()), ev.X, k);
                    CheckD($"storm.t{t}.e{e}.y", BitConverter.DoubleToUInt64Bits(it[3].GetDouble()), ev.Y, k);
                    CheckHexD($"storm.t{t}.e{e}.str", it[4].GetString()!, ev.Strength, k);
                    CheckStr($"storm.t{t}.e{e}.kind", it[5].GetString()!, ev.StormKind);
                }
                else if (k == "tornado")
                {
                    CheckD($"storm.t{t}.e{e}.x", BitConverter.DoubleToUInt64Bits(it[1].GetDouble()), ev.X, k);
                    CheckD($"storm.t{t}.e{e}.y", BitConverter.DoubleToUInt64Bits(it[2].GetDouble()), ev.Y, k);
                    CheckI64($"storm.t{t}.e{e}.n", it[3].GetInt64(), 1, k);
                }
                else if (k == "sand" || k == "drought") // 沙暴/干旱（排他链——toast 已在上方处理）
                {
                    CheckD($"storm.t{t}.e{e}.x", BitConverter.DoubleToUInt64Bits(it[1].GetDouble()), ev.X, k);
                    CheckD($"storm.t{t}.e{e}.y", BitConverter.DoubleToUInt64Bits(it[2].GetDouble()), ev.Y, k);
                    CheckHexD($"storm.t{t}.e{e}.r", it[3].GetString()!, ev.R, k);
                    CheckI64($"storm.t{t}.e{e}.ttl", it[4].GetInt64(), (long)ev.Ttl, k);
                }
            }
        }
        n.PendingStorms.Clear();
        // 检查点摘要（t10/25/50）
        string ck = "t" + t;
        if (c.GetProperty("checks").TryGetProperty(ck, out var cj))
        {
            var sjs = cj.GetProperty("storms");
            total++;
            if (sjs.GetArrayLength() != n.Storms.Count)
            {
                fail++;
                if (fails.Count < MAXREPORT) fails.Add($"[storm.{ck}/{name}] storms 数 JS={sjs.GetArrayLength()} C#={n.Storms.Count}");
            }
            for (int s2 = 0; s2 < Math.Min(sjs.GetArrayLength(), n.Storms.Count); s2++)
            {
                var rj = sjs[s2];
                var sc = n.Storms[s2];
                CheckI64($"storm.{ck}.s{s2}.id", rj[0].GetInt64(), sc.Id, "");
                CheckStr($"storm.{ck}.s{s2}.kind", rj[1].GetString()!, sc.Kind);
                CheckStr($"storm.{ck}.s{s2}.name", rj[2].GetString()!, sc.Name);
                CheckI64($"storm.{ck}.s{s2}.landed", rj[3].GetInt64(), sc.Landed ? 1 : 0, "");
                CheckI64($"storm.{ck}.s{s2}.ttl", rj[4].GetInt64(), sc.Ttl, "");
                CheckI64($"storm.{ck}.s{s2}.seed", rj[5].GetInt64(), sc.Seed, "");
                CheckHexD($"storm.{ck}.s{s2}.x", rj[6].GetString()!, sc.X, "");
                CheckHexD($"storm.{ck}.s{s2}.y", rj[7].GetString()!, sc.Y, "");
                CheckHexD($"storm.{ck}.s{s2}.str", rj[8].GetString()!, sc.Strength, "");
            }
            CheckU($"storm.{ck}.moist", cj.GetProperty("moist").GetUInt32(), FnvF32(n.Moist), "");
            CheckU($"storm.{ck}.rain", cj.GetProperty("rain").GetUInt32(), Fnv(n.RainCell), "");
            var cnt = cj.GetProperty("counters");
            CheckI64($"storm.{ck}.cyclones", cnt.GetProperty("cyclones").GetInt64(), n.Cyclones, "");
            CheckI64($"storm.{ck}.blizzards", cnt.GetProperty("blizzards").GetInt64(), n.Blizzards, "");
            CheckI64($"storm.{ck}.droughts", cnt.GetProperty("droughts").GetInt64(), n.Droughts, "");
            CheckI64($"storm.{ck}.seq", cj.GetProperty("seq").GetInt64(), n.StormSeq, "");
        }
    }

    // ---- 终态（全量位级） ----
    var sf = c.GetProperty("final");
    var fsjs = sf.GetProperty("storms");
    total++;
    if (fsjs.GetArrayLength() != n.Storms.Count)
    {
        fail++;
        if (fails.Count < MAXREPORT) fails.Add($"[storm.fin/{name}] storms 数 JS={fsjs.GetArrayLength()} C#={n.Storms.Count}");
    }
    for (int s2 = 0; s2 < Math.Min(fsjs.GetArrayLength(), n.Storms.Count); s2++)
    {
        var rj = fsjs[s2];
        var sc = n.Storms[s2];
        CheckI64($"storm.fin.s{s2}.id", rj[0].GetInt64(), sc.Id, "");
        CheckStr($"storm.fin.s{s2}.kind", rj[1].GetString()!, sc.Kind);
        CheckStr($"storm.fin.s{s2}.name", rj[2].GetString()!, sc.Name);
        CheckI64($"storm.fin.s{s2}.landed", rj[3].GetInt64(), sc.Landed ? 1 : 0, "");
        CheckI64($"storm.fin.s{s2}.ttl", rj[4].GetInt64(), sc.Ttl, "");
        CheckI64($"storm.fin.s{s2}.seed", rj[5].GetInt64(), sc.Seed, "");
        CheckHexD($"storm.fin.s{s2}.x", rj[6].GetString()!, sc.X, "");
        CheckHexD($"storm.fin.s{s2}.y", rj[7].GetString()!, sc.Y, "");
        CheckHexD($"storm.fin.s{s2}.str", rj[8].GetString()!, sc.Strength, "");
    }
    CheckU("storm.fin.moist", sf.GetProperty("moistDigest").GetUInt32(), FnvF32(n.Moist), "");
    CheckU("storm.fin.rain", sf.GetProperty("rainDigest").GetUInt32(), Fnv(n.RainCell), "");
    var fcnt = sf.GetProperty("counters");
    CheckI64("storm.fin.cyclones", fcnt.GetProperty("cyclones").GetInt64(), n.Cyclones, "");
    CheckI64("storm.fin.blizzards", fcnt.GetProperty("blizzards").GetInt64(), n.Blizzards, "");
    CheckI64("storm.fin.droughts", fcnt.GetProperty("droughts").GetInt64(), n.Droughts, "");
    CheckI64("storm.fin.seq", sf.GetProperty("seq").GetInt64(), n.StormSeq, "");
    // ---- eng.rng 流指纹 ----
    var stailJ = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
    for (int i = 0; i < 4 && stailJ.MoveNext(); i++)
        CheckHexD($"storm.rngTail[{i}]", stailJ.Current.GetString()!, WbRng.Next(ref n.EngRngState), "");
}

// ---------- 9) 地质 + 水文（M-U1b 切片 4：geologyTick/hydroTick 全确定性段逐位对账，Task 139） ----------
var geoPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-geohydro.json");
if (!File.Exists(geoPath)) geoPath = "golden-geohydro.json";
var geoRoot = JsonDocument.Parse(File.ReadAllText(geoPath)).RootElement;

foreach (var c in geoRoot.EnumerateArray())
{
    string name = c.GetProperty("name").GetString()!;
    int seed = c.GetProperty("seed").GetInt32();
    uint engRngSeed = (uint)c.GetProperty("engRngSeed").GetInt64();
    double moistInit = c.GetProperty("moistInit").GetDouble();
    var cfg = c.GetProperty("cfg");
    int iter = cfg.GetProperty("iter").GetInt32();
    int hydroPerIter = cfg.GetProperty("hydroPerIter").GetInt32();

    var n = new WbNature(seed, engRngSeed);
    n.InitPlates();

    void CheckD(string tag, ulong expectBits, double actual, string loc)
    {
        total++;
        if (expectBits != BitConverter.DoubleToUInt64Bits(actual))
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[{tag}/{name}] {loc}: JS={LeHexToBits(expectBits.ToString("x16")):R}({expectBits:x16}) C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})");
        }
    }
    void CheckHexD(string tag, string jsHex, double actual, string loc) => CheckD(tag, LeHexToBits(jsHex), actual, loc);
    void CheckU(string tag, uint expect, uint actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect:x8} C#={actual:x8}");
        }
    }
    void CheckI64(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] {loc}: JS={expect} C#={actual}");
        }
    }
    void CheckStr(string tag, string expect, string actual)
    {
        total++;
        if (expect != actual)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}]: JS={expect} C#={actual}");
        }
    }
    void CheckArrG(string tag, byte[] expect, byte[] actual)
    {
        if (expect.Length != actual.Length)
        {
            fail++; total++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}/{name}] 长度不符 JS={expect.Length} C#={actual.Length}");
            return;
        }
        int bad = -1, driftN = 0;
        for (int i = 0; i < expect.Length; i++)
        {
            if (expect[i] != actual[i]) { if (bad < 0) bad = i; driftN++; }
        }
        total++;
        if (bad >= 0)
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[{tag}/{name}] 首漂移 idx={bad} ({bad % 256},{bad / 256}) JS={expect[bad]} C#={actual[bad]} 漂移数={driftN}");
        }
    }

    // ---- 注入规则（与 gen-geohydro.mjs 逐条对应；cfg 驱动） ----
    int stressStep = cfg.GetProperty("stressStep").GetInt32();
    if (stressStep > 0) { int k = 0; foreach (int i in n.Boundary) { if (k % stressStep == 0) n.Stress[i] = 12.5f; k++; } }
    int stressHiStep = cfg.GetProperty("stressHiStep").GetInt32();
    if (stressHiStep > 0) { int k = 0; foreach (int i in n.Boundary) { if (k % stressHiStep == 0) n.Stress[i] = 15.0f; k++; } }
    if (cfg.GetProperty("driftOverride").GetBoolean())
        for (int p = 0; p < n.PlateN; p++) { n.DriftDx[p] = 0.3 - 0.25 * p; n.DriftDy[p] = 0.0; }
    // 地形直接采用 JS 侧注入后快照（hillInject/coastify 已烘焙在 terrainB64 内——Task 138 直取先例）；
    // 循环内 hillRenew 为演化期注入，双侧同规则复现。
    n.Terrain = B64(c.GetProperty("terrainB64").GetString()!);
    for (int i = 0; i < n.Moist.Length; i++) n.Moist[i] = (float)moistInit;
    string rainMode = cfg.GetProperty("rainMode").GetString()!;
    if (rainMode == "alt") for (int cc = 0; cc < WbConstants.AW * WbConstants.AH; cc += 2) n.RainCell[cc] = 200;
    else if (rainMode == "band") for (int cx = 0; cx < WbConstants.AW; cx++) n.RainCell[10 * WbConstants.AW + cx] = 120;
    if (cfg.TryGetProperty("riverBand", out var rbJ) && rbJ.ValueKind == JsonValueKind.Array && rbJ.GetArrayLength() == 4)
    {
        int x0 = rbJ[0].GetInt32(), y0 = rbJ[1].GetInt32(), x1 = rbJ[2].GetInt32(), y1 = rbJ[3].GetInt32();
        for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) n.RiverDir[y * WbConstants.W + x] = 1;
    }
    if (cfg.GetProperty("riverDensity").GetBoolean()) n.RiverTileCount = 901;
    string carveMode = cfg.GetProperty("carveMode").GetString()!;
    n.CarveRiver = (wx, wy, wo) =>
    {
        // 计数归 HydroTick 内部 CarveCalls（rainFireProbe ProbeCalls 先例——只计一次，勿在此重复）
        if (carveMode == "always") return true;
        return Math.Floor(wx) % 3.0 != 0.0; // 'mixed'：约 2/3 成功 → 失败重试路径
    };

    // ---- init 摘要对账（地形直取快照；stress/drift 规则复现已验） ----
    var ini = c.GetProperty("init");
    CheckU("geo.init.moist", ini.GetProperty("moistDigest").GetUInt32(), FnvF32(n.Moist), "");
    CheckU("geo.init.stress", ini.GetProperty("stressDigest").GetUInt32(), FnvF32(n.Stress), "");
    CheckU("geo.init.rain", ini.GetProperty("rainDigest").GetUInt32(), Fnv(n.RainCell), "");
    CheckU("geo.init.riverDir", ini.GetProperty("riverDirDigest").GetUInt32(), Fnv(n.RiverDir), "");
    CheckI64("geo.init.boundary", ini.GetProperty("boundaryCount").GetInt64(), n.Boundary.Count, "");
    var ihJ = ini.GetProperty("hotspots").EnumerateArray().GetEnumerator();
    for (int h = 0; h < n.Hotspots.Count && ihJ.MoveNext(); h++)
    {
        CheckHexD($"geo.init.h{h}.x", ihJ.Current[0].GetString()!, n.Hotspots[h].X, "");
        CheckHexD($"geo.init.h{h}.y", ihJ.Current[1].GetString()!, n.Hotspots[h].Y, "");
        CheckHexD($"geo.init.h{h}.heat", ihJ.Current[2].GetString()!, n.Hotspots[h].Heat, "");
    }

    // ---- 迭代演化（1 geology + hydroPerIter × hydro / 迭代；注入调度逐拍对齐） ----
    var ticksJ = new Dictionary<int, JsonElement>();
    foreach (var t in c.GetProperty("ticks").EnumerateArray())
        ticksJ[t.GetProperty("it").GetInt32()] = t.GetProperty("events");

    int ashPreheatAt = cfg.GetProperty("ashPreheatAt").GetInt32();
    string heatMode = cfg.GetProperty("heat").GetString()!;
    int hillRenew = cfg.GetProperty("hillRenew").GetInt32();

    for (int it = 1; it <= iter; it++)
    {
        if (ashPreheatAt == it) for (int k = 0; k < n.AshF.Length; k++) n.AshF[k] = 0.2999f;
        if (hillRenew > 0 && it % hillRenew == 0)
            foreach (int i in n.Boundary) { int t = n.Terrain[i]; if (t == 2 || t == 3 || t == 4) n.Terrain[i] = 5; }
        if (heatMode == "every") { foreach (var h in n.Hotspots) h.Heat = 2.8; }
        else if (heatMode == "sparse" && (it == 5 || it == 15 || it == 25)) { foreach (var h in n.Hotspots) h.Heat = 2.7; }
        else if (heatMode == "once" && it == 1) { foreach (var h in n.Hotspots) h.Heat = 3.0; }
        n.GeologyTick(true);
        for (int hh = 0; hh < hydroPerIter; hh++) n.HydroTick(true);

        bool jsHas = ticksJ.TryGetValue(it, out var evJ);
        int evCount = jsHas ? evJ.GetArrayLength() : 0;
        total++;
        if (evCount != n.PendingGeo.Count)
        {
            fail++;
            if (fails.Count < MAXREPORT)
                fails.Add($"[geo.it{it}/{name}] JS 事件数={evCount} C#={n.PendingGeo.Count}");
        }
        else if (evCount > 0)
        {
            for (int e = 0; e < evCount; e++)
            {
                var arr = evJ[e];
                string k = arr[0].GetString()!;
                var ev = n.PendingGeo[e];
                total++;
                if (k != ev.Kind)
                {
                    fail++;
                    if (fails.Count < MAXREPORT) fails.Add($"[geo.it{it}.e{e}/{name}] kind JS={k} C#={ev.Kind}");
                    continue;
                }
                if (k == "volcano")
                {
                    CheckHexD($"geo.it{it}.e{e}.x", arr[1].GetString()!, ev.X, k);
                    CheckHexD($"geo.it{it}.e{e}.y", arr[2].GetString()!, ev.Y, k);
                    CheckI64($"geo.it{it}.e{e}.pw", arr[3].GetInt64(), ev.Pw, k);
                }
                else if (k == "toast")
                {
                    CheckStr($"geo.it{it}.e{e}.code", arr[1].GetString()!, ev.Code);
                }
                else // geo / river：[kind, code, x|null, y|null]
                {
                    CheckStr($"geo.it{it}.e{e}.code", arr[1].GetString()!, ev.Code);
                    total++;
                    if (arr[2].ValueKind == JsonValueKind.Number)
                    {
                        if (!ev.HasPos)
                        {
                            fail++;
                            if (fails.Count < MAXREPORT) fails.Add($"[geo.it{it}.e{e}/{name}] JS 有位 C# 无位");
                        }
                        else
                        {
                            CheckD($"geo.it{it}.e{e}.x", BitConverter.DoubleToUInt64Bits(arr[2].GetDouble()), ev.X, k);
                            CheckD($"geo.it{it}.e{e}.y", BitConverter.DoubleToUInt64Bits(arr[3].GetDouble()), ev.Y, k);
                        }
                    }
                    else if (ev.HasPos)
                    {
                        fail++;
                        if (fails.Count < MAXREPORT) fails.Add($"[geo.it{it}.e{e}/{name}] JS 无位 C# 有位 ({ev.X},{ev.Y})");
                    }
                }
            }
        }
        n.PendingGeo.Clear();

        // 检查点摘要（t10/20/30）
        string ck = "t" + it;
        if (c.GetProperty("checks").TryGetProperty(ck, out var cj))
        {
            CheckU($"geo.{ck}.terrain", cj.GetProperty("terrainDigest").GetUInt32(), Fnv(n.Terrain), "");
            CheckI64($"geo.{ck}.uplifts", cj.GetProperty("uplifts").GetInt64(), n.Uplifts, "");
            CheckI64($"geo.{ck}.erosions", cj.GetProperty("erosions").GetInt64(), n.Erosions, "");
            CheckI64($"geo.{ck}.eruptions", cj.GetProperty("eruptions").GetInt64(), n.Eruptions, "");
            CheckHexD($"geo.{ck}.ash", cj.GetProperty("ash").GetString()!, n.Ash, "");
            CheckU($"geo.{ck}.ashF", cj.GetProperty("ashF").GetUInt32(), FnvF32(n.AshF), "");
            var hjs = cj.GetProperty("hotspots");
            for (int h = 0; h < Math.Min(hjs.GetArrayLength(), n.Hotspots.Count); h++)
            {
                CheckHexD($"geo.{ck}.h{h}.x", hjs[h][0].GetString()!, n.Hotspots[h].X, "");
                CheckHexD($"geo.{ck}.h{h}.y", hjs[h][1].GetString()!, n.Hotspots[h].Y, "");
                CheckHexD($"geo.{ck}.h{h}.heat", hjs[h][2].GetString()!, n.Hotspots[h].Heat, "");
            }
            CheckI64($"geo.{ck}.carve", cj.GetProperty("carveCalls").GetInt64(), n.CarveCalls, "");
            CheckU($"geo.{ck}.moist", cj.GetProperty("moistDigest").GetUInt32(), FnvF32(n.Moist), "");
            CheckU($"geo.{ck}.rain", cj.GetProperty("rainDigest").GetUInt32(), Fnv(n.RainCell), "");
        }
    }

    // ---- 终态（全量位级 + 只读性守卫） ----
    var sf = c.GetProperty("final");
    CheckU("geo.fin.terrain", sf.GetProperty("terrainDigest").GetUInt32(), Fnv(n.Terrain), "");
    CheckArrG("geo.fin.terrainFull", B64(sf.GetProperty("terrainB64").GetString()!), n.Terrain);
    CheckI64("geo.fin.uplifts", sf.GetProperty("uplifts").GetInt64(), n.Uplifts, "");
    CheckI64("geo.fin.erosions", sf.GetProperty("erosions").GetInt64(), n.Erosions, "");
    CheckI64("geo.fin.eruptions", sf.GetProperty("eruptions").GetInt64(), n.Eruptions, "");
    CheckHexD("geo.fin.ash", sf.GetProperty("ash").GetString()!, n.Ash, "");
    CheckU("geo.fin.ashF", sf.GetProperty("ashF").GetUInt32(), FnvF32(n.AshF), "");
    CheckU("geo.fin.stress", sf.GetProperty("stressDigest").GetUInt32(), FnvF32(n.Stress), ""); // 只读性回归守卫
    CheckU("geo.fin.moist", sf.GetProperty("moistDigest").GetUInt32(), FnvF32(n.Moist), "");
    CheckU("geo.fin.rain", sf.GetProperty("rainDigest").GetUInt32(), Fnv(n.RainCell), "");
    CheckI64("geo.fin.carve", sf.GetProperty("carveCalls").GetInt64(), n.CarveCalls, "");
    var fhJ = sf.GetProperty("hotspots").EnumerateArray().GetEnumerator();
    for (int h = 0; h < n.Hotspots.Count && fhJ.MoveNext(); h++)
    {
        CheckHexD($"geo.fin.h{h}.x", fhJ.Current[0].GetString()!, n.Hotspots[h].X, "");
        CheckHexD($"geo.fin.h{h}.y", fhJ.Current[1].GetString()!, n.Hotspots[h].Y, "");
        CheckHexD($"geo.fin.h{h}.heat", fhJ.Current[2].GetString()!, n.Hotspots[h].Heat, "");
    }
    // ---- eng.rng 流指纹 ----
    var gtailJ = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
    for (int i = 0; i < 4 && gtailJ.MoveNext(); i++)
        CheckHexD($"geo.rngTail[{i}]", gtailJ.Current.GetString()!, WbRng.Next(ref n.EngRngState), "");
}

// ==================== units-move（M-U2a Task 140：单位移动核心） ====================
var umPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-move.json");
if (!File.Exists(umPath)) umPath = "golden-units-move.json";
if (File.Exists(umPath))
{
    var umd = JsonDocument.Parse(File.ReadAllText(umPath)).RootElement;
    var umW = umd.GetProperty("w").GetInt32();
    var umTerrs = umd.GetProperty("terrains");
    var umRoads = umd.GetProperty("roads");
    var umRaces = umd.GetProperty("races");

    void UCheckD(string tag, ulong expectBits, double actual, string loc)
    {
        total++;
        if (BitConverter.DoubleToUInt64Bits(actual) != expectBits)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expectBits:x16} C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})");
        }
    }
    void UCheckHexD(string tag, string jsHex, double actual, string loc) => UCheckD(tag, LeHexToBits(jsHex), actual, loc);
    void UCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void UCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    byte[] UmGrid(JsonElement spec)
    {
        var g = new byte[umW * umd.GetProperty("h").GetInt32()];
        Array.Fill(g, (byte)spec.GetProperty("def").GetInt32());
        foreach (var p in spec.GetProperty("patches").EnumerateArray())
        {
            int x1 = p[0].GetInt32(), y1 = p[1].GetInt32(), x2 = p[2].GetInt32(), y2 = p[3].GetInt32(), t = p[4].GetInt32();
            for (int y = y1; y < y2; y++) for (int x = x1; x < x2; x++) g[y * umW + x] = (byte)t;
        }
        return g;
    }
    double UmNumOr(JsonElement o, string k, double dflt)
    {
        if (!o.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null) return dflt;
        return v.GetDouble();
    }

    foreach (var c in umd.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        var host = new WbMoveHost();
        host.Terrain = UmGrid(umTerrs[c.GetProperty("terrainIdx").GetInt32()]);
        host.Road = UmGrid(umRoads[c.GetProperty("roadIdx").GetInt32()]);
        foreach (var rp in umRaces.EnumerateObject())
        {
            int rid = int.Parse(rp.Name);
            host.RaceFlags[rid] = (byte)rp.Value.GetProperty("flags").GetInt32();
            host.Tbf[rid * 2] = (byte)rp.Value.GetProperty("tbf0").GetInt32();
            host.Tbf[rid * 2 + 1] = (byte)rp.Value.GetProperty("tbf1").GetInt32();
        }
        var envJ = c.GetProperty("env");
        var env = new WbMoveEnv();
        double illum = envJ.GetProperty("illum").GetDouble();
        void UmApplyEnv(WbMoveEnv e, JsonElement m)
        {
            foreach (var p in m.EnumerateObject())
            {
                switch (p.Name)
                {
                    case "season": e.Season = p.Value.GetInt32(); break;
                    case "bmttl": e.BloodMoonTtl = p.Value.GetDouble(); break;
                    case "eclttl": e.EclipseTtl = p.Value.GetDouble(); break;
                    case "illum": illum = p.Value.GetDouble(); break;
                    case "ambience": e.FxAmbience = p.Value.GetBoolean(); break;
                }
            }
            e.IllumOk = illum >= 0.95;
        }
        UmApplyEnv(env, envJ);
        // 城墙谓词（stub 语义：墙格集合；真墙语义属 M-U3 建筑切片）
        var wallSet = new HashSet<int>();
        foreach (var w in c.GetProperty("walls").EnumerateArray())
        {
            int x1 = w[0].GetInt32(), y1 = w[1].GetInt32(), x2 = w[2].GetInt32(), y2 = w[3].GetInt32();
            for (int y = y1; y < y2; y++) for (int x = x1; x < x2; x++) wallSet.Add(y * umW + x);
        }
        if (wallSet.Count > 0) host.WallBlocks = (tx, ty) => wallSet.Contains(ty * umW + tx);
        var atWar = new HashSet<int>();
        foreach (var a in envJ.GetProperty("atWar").EnumerateArray()) atWar.Add(a.GetInt32());
        if (atWar.Count > 0) host.CivAtWar = cv => atWar.Contains(cv);
        // 单位装载
        var usJ = c.GetProperty("units");
        int un = usJ.GetArrayLength();
        var st = new WbUnitsState(Math.Max(un, 1));
        st.LiveLen = un;
        for (int i = 0; i < un; i++)
        {
            var u = usJ[i];
            st.Race[i] = (uint)u.GetProperty("race").GetInt32();
            st.X[i] = u.GetProperty("x").GetDouble(); st.Y[i] = u.GetProperty("y").GetDouble();
            st.Tx[i] = u.GetProperty("tx").GetDouble(); st.Ty[i] = u.GetProperty("ty").GetDouble();
            st.Speed[i] = u.GetProperty("speed").GetDouble();
            st.Chill[i] = UmNumOr(u, "chill", double.NaN);
            st.Curse[i] = UmNumOr(u, "curse", double.NaN);
            st.Flip[i] = u.GetProperty("flip").GetBoolean();
            st.Civ[i] = u.GetProperty("civ").GetInt32();
            st.Job[i] = u.TryGetProperty("job", out var jj) && jj.ValueKind != JsonValueKind.Null ? jj.GetInt32() : 0;
            st.Boat[i] = (byte)UmNumOr(u, "boat", 0);
            st.Lx[i] = UmNumOr(u, "lx", st.X[i]); st.Ly[i] = UmNumOr(u, "ly", st.Y[i]);
            st.Dead[i] = u.TryGetProperty("dead", out var dd) && dd.ValueKind == JsonValueKind.True;
        }
        st.RngA = (uint)c.GetProperty("seed").GetInt32();
        // 步回放（mut/envMut 逐项回显）
        var stepsJ = c.GetProperty("steps");
        var outsJ = c.GetProperty("out");
        int prevDraws = 0, prevFx = 0, prevFleet = 0;
        int sn = 0;
        foreach (var stp in stepsJ.EnumerateArray())
        {
            if (stp.TryGetProperty("mut", out var mut))
            {
                int ms = mut.GetProperty("slot").GetInt32();
                foreach (var p in mut.EnumerateObject())
                {
                    if (p.Name == "slot") continue;
                    switch (p.Name)
                    {
                        case "chill": st.Chill[ms] = p.Value.ValueKind == JsonValueKind.Null ? double.NaN : p.Value.GetDouble(); break;
                        case "curse": st.Curse[ms] = p.Value.ValueKind == JsonValueKind.Null ? double.NaN : p.Value.GetDouble(); break;
                        case "flip": st.Flip[ms] = p.Value.GetBoolean(); break;
                        case "dead": st.Dead[ms] = p.Value.GetBoolean(); break;
                        case "x": st.X[ms] = p.Value.GetDouble(); break;
                        case "y": st.Y[ms] = p.Value.GetDouble(); break;
                        case "tx": st.Tx[ms] = p.Value.GetDouble(); break;
                        case "ty": st.Ty[ms] = p.Value.GetDouble(); break;
                        case "speed": st.Speed[ms] = p.Value.GetDouble(); break;
                        case "civ": st.Civ[ms] = p.Value.GetInt32(); break;
                        case "job": st.Job[ms] = p.Value.GetInt32(); break;
                        case "boat": st.Boat[ms] = (byte)p.Value.GetInt32(); break;
                    }
                }
            }
            if (stp.TryGetProperty("envMut", out var em)) UmApplyEnv(env, em);
            int slot = stp.GetProperty("slot").GetInt32();
            double mul = stp.GetProperty("mul").GetDouble();
            WbUnits.MoveUnit(st, host, env, slot, mul);
            var o = outsJ[sn];
            UCheckHexD($"um.{name}.s{sn}.x", o.GetProperty("x").GetString()!, st.X[slot], $"slot={slot}");
            UCheckHexD($"um.{name}.s{sn}.y", o.GetProperty("y").GetString()!, st.Y[slot], $"slot={slot}");
            UCheckHexD($"um.{name}.s{sn}.tx", o.GetProperty("tx").GetString()!, st.Tx[slot], $"slot={slot}");
            UCheckHexD($"um.{name}.s{sn}.ty", o.GetProperty("ty").GetString()!, st.Ty[slot], $"slot={slot}");
            UCheckB($"um.{name}.s{sn}.flip", o.GetProperty("flip").GetBoolean(), st.Flip[slot], $"slot={slot}");
            UCheckI($"um.{name}.s{sn}.boat", o.GetProperty("boat").GetInt32(), st.Boat[slot], $"slot={slot}");
            UCheckI($"um.{name}.s{sn}.btl", o.GetProperty("btl").GetInt32(), st.BoatTtl[slot], $"slot={slot}");
            UCheckHexD($"um.{name}.s{sn}.lx", o.GetProperty("lx").GetString()!, st.Lx[slot], $"slot={slot}");
            UCheckHexD($"um.{name}.s{sn}.ly", o.GetProperty("ly").GetString()!, st.Ly[slot], $"slot={slot}");
            UCheckI($"um.{name}.s{sn}.draws", o.GetProperty("draws").GetInt32(), st.RngDraws - prevDraws, $"slot={slot}");
            prevDraws = st.RngDraws;
            var fxJ = o.GetProperty("fx");
            int fxC = 0;
            foreach (var f in fxJ.EnumerateArray())
            {
                if (prevFx + fxC < host.PendingFx.Count)
                {
                    var pf = host.PendingFx[prevFx + fxC];
                    total++;
                    if (pf.Kind != f[0].GetString()) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[um.{name}.s{sn}.fx{fxC}] kind JS={f[0].GetString()} C#={pf.Kind}"); }
                    UCheckHexD($"um.{name}.s{sn}.fx{fxC}.x", f[1].GetString()!, pf.X, "");
                    UCheckHexD($"um.{name}.s{sn}.fx{fxC}.y", f[2].GetString()!, pf.Y, "");
                    UCheckD($"um.{name}.s{sn}.fx{fxC}.ttl", BitConverter.DoubleToUInt64Bits(f[3].GetDouble()), pf.Ttl, "");
                }
                fxC++;
            }
            UCheckI($"um.{name}.s{sn}.fxN", fxJ.GetArrayLength(), host.PendingFx.Count - prevFx, "");
            prevFx = host.PendingFx.Count;
            var flJ = o.GetProperty("fleet");
            int flC = 0;
            foreach (var f in flJ.EnumerateArray())
            {
                if (prevFleet + flC < host.PendingFleet.Count)
                {
                    var pf = host.PendingFleet[prevFleet + flC];
                    UCheckI($"um.{name}.s{sn}.fl{flC}.n", f[0].GetInt32(), pf.Fleet, "");
                    UCheckHexD($"um.{name}.s{sn}.fl{flC}.x", f[1].GetString()!, pf.X, "");
                    UCheckHexD($"um.{name}.s{sn}.fl{flC}.y", f[2].GetString()!, pf.Y, "");
                }
                flC++;
            }
            UCheckI($"um.{name}.s{sn}.fleetN", flJ.GetArrayLength(), host.PendingFleet.Count - prevFleet, "");
            prevFleet = host.PendingFleet.Count;
            sn++;
        }
        // 终态全量
        var finJ = c.GetProperty("final");
        for (int i = 0; i < un; i++)
        {
            var f = finJ[i];
            UCheckHexD($"um.{name}.fin.u{i}.x", f.GetProperty("x").GetString()!, st.X[i], "");
            UCheckHexD($"um.{name}.fin.u{i}.y", f.GetProperty("y").GetString()!, st.Y[i], "");
            UCheckHexD($"um.{name}.fin.u{i}.tx", f.GetProperty("tx").GetString()!, st.Tx[i], "");
            UCheckHexD($"um.{name}.fin.u{i}.ty", f.GetProperty("ty").GetString()!, st.Ty[i], "");
            UCheckB($"um.{name}.fin.u{i}.flip", f.GetProperty("flip").GetBoolean(), st.Flip[i], "");
            UCheckI($"um.{name}.fin.u{i}.boat", f.GetProperty("boat").GetInt32(), st.Boat[i], "");
            UCheckI($"um.{name}.fin.u{i}.btl", f.GetProperty("btl").GetInt32(), st.BoatTtl[i], "");
            UCheckHexD($"um.{name}.fin.u{i}.lx", f.GetProperty("lx").GetString()!, st.Lx[i], "");
            UCheckHexD($"um.{name}.fin.u{i}.ly", f.GetProperty("ly").GetString()!, st.Ly[i], "");
            UCheckB($"um.{name}.fin.u{i}.dead", f.GetProperty("dead").GetBoolean(), st.Dead[i], "");
        }
        // rng 流指纹
        var utail = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
        for (int i = 0; i < 4 && utail.MoveNext(); i++)
            UCheckHexD($"um.{name}.rngTail[{i}]", utail.Current.GetString()!, WbRng.Next(ref st.RngA), "");
    }
}

// ==================== units-update（M-U2a 切片 2：updateUnit 前置状态段） ====================
var uuPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-update.json");
if (!File.Exists(uuPath)) uuPath = "golden-units-update.json";
if (File.Exists(uuPath))
{
    var uud = JsonDocument.Parse(File.ReadAllText(uuPath)).RootElement;
    var uuW = uud.GetProperty("w").GetInt32();
    var uuH = uud.GetProperty("h").GetInt32();
    var uuEp = uud.GetProperty("ep");
    double epPanic = uuEp.GetProperty("panicDecay").GetDouble();
    double epGrudge = uuEp.GetProperty("grudgeDecay").GetDouble();
    double epFire = uuEp.GetProperty("fireDamage").GetDouble();
    var uuRaces = uud.GetProperty("races");

    void UuCheckN(string tag, string? jsStr, double actual, string loc)
    {
        total++;
        // NaN ↔ JS undefined/null 契约：只比 NaN 态不比位模式。
        // 课（Task 141 入档）：.NET NaN 位模式非平台稳定（本机 x64 double.NaN = 0xfff8… -NaN，
        // 非 V8/JSC 的 0x7ff8… quiet NaN）——NaN payload/符号无语义（JS undefined 无 payload 概念）。
        // JS 侧 NaN 位模式串（exp 全 1 且尾数非 0）同按 NaN 态对账。
        ulong jsBits = 0;
        bool jsIsNaN = false;
        if (jsStr != null)
        {
            jsBits = LeHexToBits(jsStr);
            jsIsNaN = (jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0;
        }
        bool cNaN = double.IsNaN(actual);
        bool jNaN = jsStr == null || jsIsNaN;
        if (cNaN && jNaN) return; // 双 NaN 态一致即通过
        if (cNaN && !jNaN)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#=NaN（应为数值）");
            return;
        }
        if (!cNaN && jNaN)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr ?? "undefined"}(NaN) C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})（应为 NaN）");
            return;
        }
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        {
            fail++;
            if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})");
        }
    }
    void UuCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void UuCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    byte[] UuGrid(JsonElement spec)
    {
        var g = new byte[uuW * uuH];
        Array.Fill(g, (byte)spec.GetProperty("def").GetInt32());
        foreach (var p in spec.GetProperty("patches").EnumerateArray())
        {
            int x1 = p[0].GetInt32(), y1 = p[1].GetInt32(), x2 = p[2].GetInt32(), y2 = p[3].GetInt32(), t = p[4].GetInt32();
            for (int y = y1; y < y2; y++) for (int x = x1; x < x2; x++) g[y * uuW + x] = (byte)t;
        }
        return g;
    }
    double UuNumOr(JsonElement o, string k, double dflt)
    {
        if (!o.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null) return dflt;
        return v.GetDouble();
    }

    foreach (var c in uud.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        var envJ = c.GetProperty("env");
        var host = new WbUpdateHost();
        // 地形（单 spec）
        host.Terrain = UuGrid(uud.GetProperty("terrainSpecs").EnumerateArray().First(t => t.GetProperty("name").GetString() == c.GetProperty("terrain").GetString()));
        foreach (var rp in uuRaces.EnumerateObject())
        {
            int rid = int.Parse(rp.Name);
            host.RaceFlags[rid] = (byte)rp.Value.GetProperty("flags").GetInt32();
            host.Tbf[rid * 2] = (byte)rp.Value.GetProperty("tbf0").GetInt32();
            host.Tbf[rid * 2 + 1] = (byte)rp.Value.GetProperty("tbf1").GetInt32();
        }
        if (envJ.TryGetProperty("fireInit", out var fireInitJ))
            foreach (var fi in fireInitJ.EnumerateObject())
            {
                var xy = fi.Name.Split(','); int fx = int.Parse(xy[0]), fy = int.Parse(xy[1]);
                host.Fire[fy * uuW + fx] = (byte)fi.Value.GetInt32();
                host.FireSet.Add(fy * uuW + fx);
            }
        if (envJ.TryGetProperty("fireSet", out var fsInitJ))
            foreach (var fsI in fsInitJ.EnumerateArray()) host.FireSet.Add(fsI.GetInt32());
        if (envJ.TryGetProperty("radiateInit", out var radiateInitJ))
            foreach (var ri in radiateInitJ.EnumerateObject())
            {
                var xy = ri.Name.Split(','); int rx = int.Parse(xy[0]), ry = int.Parse(xy[1]);
                host.Radiate[ry * uuW + rx] = (byte)ri.Value.GetInt32();
            }
        var env = new WbMoveEnv
        {
            PanicDecay = epPanic, GrudgeDecay = epGrudge, FireDamage = epFire,
            LawsUndeadRise = envJ.GetProperty("lawsRise").GetBoolean(),
            FxAmbience = envJ.GetProperty("ambience").GetBoolean(),
        };
        double gearRegen = UuNumOr(envJ, "gearRegen", 0.0);
        if (gearRegen != 0.0 || env.FxAmbience == false) { /* gearRegen 注入按需 */ }
        if (envJ.TryGetProperty("gearRegen", out var grJ) && grJ.ValueKind != JsonValueKind.Null)
            host.GearRegen = (_) => grJ.GetDouble();
        bool terrainTrack = envJ.TryGetProperty("terrainTrack", out var ttJ) && ttJ.ValueKind == JsonValueKind.True;
        // 单位装载（null → NaN 镜像；gids/gval null → null List）
        var usJ = c.GetProperty("units");
        int un = usJ.GetArrayLength();
        var st = new WbUnitsState(Math.Max(un, 1));
        st.LiveLen = un;
        for (int i = 0; i < un; i++)
        {
            var u = usJ[i];
            st.Id[i] = u.GetProperty("id").GetInt32();
            st.Race[i] = (uint)u.GetProperty("race").GetInt32();
            st.X[i] = u.GetProperty("x").GetDouble(); st.Y[i] = u.GetProperty("y").GetDouble();
            st.Tx[i] = UuNumOr(u, "tx", st.X[i]); st.Ty[i] = UuNumOr(u, "ty", st.Y[i]);
            st.Age[i] = UuNumOr(u, "age", 20.0); st.MaxAge[i] = UuNumOr(u, "maxAge", 55.0);
            st.Hp[i] = UuNumOr(u, "hp", 100.0); st.MaxHp[i] = UuNumOr(u, "maxHp", 100.0);
            st.Hurt[i] = UuNumOr(u, "hurt", double.NaN); // undefined 镜像——TS Math.max(undefined,2)=NaN 怪癖
            st.Cd[i] = UuNumOr(u, "cd", 0.0); st.Atk[i] = UuNumOr(u, "atk", 0.0);
            st.Chill[i] = UuNumOr(u, "chill", double.NaN);
            st.FleeT[i] = UuNumOr(u, "fleeT", 0.0); st.Bless[i] = UuNumOr(u, "bless", 0.0);
            st.Curse[i] = UuNumOr(u, "curse", 0.0); st.Fert[i] = UuNumOr(u, "fert", 0.0); st.Detour[i] = UuNumOr(u, "detour", 0.0);
            st.Panic[i] = UuNumOr(u, "panic", double.NaN);
            if (u.TryGetProperty("gids", out var gj) && gj.ValueKind == JsonValueKind.Array)
            {
                var gl = new List<int>(); foreach (var g0 in gj.EnumerateArray()) gl.Add(g0.GetInt32());
                st.GIds[i] = gl;
                var vl = new List<double>();
                if (u.TryGetProperty("gval", out var vj) && vj.ValueKind == JsonValueKind.Array)
                    foreach (var v0 in vj.EnumerateArray()) vl.Add(v0.GetDouble());
                st.GVal[i] = vl;
            }
            st.Food[i] = UuNumOr(u, "food", double.NaN);
            st.Stk[i] = (int)UuNumOr(u, "stk", 0.0);
            st.Sxk[i] = UuNumOr(u, "sxk", double.NaN); st.Syk[i] = UuNumOr(u, "syk", double.NaN);
            st.Infected[i] = u.TryGetProperty("infected", out var ij) && ij.ValueKind == JsonValueKind.True;
            st.Grab[i] = UuNumOr(u, "grab", 0.0);
            st.Boat[i] = (byte)UuNumOr(u, "boat", 0);
            st.Civ[i] = (int)UuNumOr(u, "civ", -1); st.Job[i] = (int)UuNumOr(u, "job", 0);
            st.TraitRegen[i] = UuNumOr(u, "traitRegen", 0.0);
        }
        st.RngA = (uint)c.GetProperty("seed").GetInt32();
        // 步回放（muts 逐项回显——out.muts 为规则化注入记录）
        var outsJ = c.GetProperty("out");
        int sn = 0;
        foreach (var o in outsJ.EnumerateArray())
        {
            foreach (var m in o.GetProperty("muts").EnumerateArray())
            {
                int ms = m.GetProperty("slot").GetInt32();
                foreach (var p in m.EnumerateObject())
                {
                    if (p.Name == "slot") continue;
                    switch (p.Name)
                    {
                        case "x": st.X[ms] = p.Value.GetDouble(); break;
                        case "y": st.Y[ms] = p.Value.GetDouble(); break;
                        case "tx": st.Tx[ms] = p.Value.GetDouble(); break;
                        case "ty": st.Ty[ms] = p.Value.GetDouble(); break;
                        case "panic": st.Panic[ms] = p.Value.ValueKind == JsonValueKind.Null ? double.NaN : p.Value.GetDouble(); break;
                        case "food": st.Food[ms] = p.Value.ValueKind == JsonValueKind.Null ? double.NaN : p.Value.GetDouble(); break;
                        case "sxk": st.Sxk[ms] = p.Value.ValueKind == JsonValueKind.Null ? double.NaN : p.Value.GetDouble(); break;
                        case "syk": st.Syk[ms] = p.Value.ValueKind == JsonValueKind.Null ? double.NaN : p.Value.GetDouble(); break;
                        case "chill": st.Chill[ms] = p.Value.ValueKind == JsonValueKind.Null ? double.NaN : p.Value.GetDouble(); break;
                        case "stk": st.Stk[ms] = (int)UuNumOr(m, "stk", 0.0); break;
                        case "infected": st.Infected[ms] = p.Value.ValueKind == JsonValueKind.True; break;
                        case "dead": st.Dead[ms] = p.Value.ValueKind == JsonValueKind.True; break;
                    }
                }
            }
            // 步前快照（terrainTrack 场景 diff 对账）
            byte[] terrBefore = terrainTrack ? (byte[])host.Terrain.Clone() : null!;
            byte[] fireBefore = terrainTrack ? (byte[])host.Fire.Clone() : null!;
            int draw0 = st.RngDraws;
            // 逐单位驱动（dead 跳过——真引擎 tick 循环语义）；false = 前置段未终结 → tail/post stub 事件
            // 事件/fx 切分记录：per-unit 对账用起止索引（驱动时即时记录，避免全局流错位）
            var usOut = o.GetProperty("units");
            int[] evtStart = new int[un + 1];
            int[] fxStart = new int[un + 1];
            evtStart[0] = host.PendingUpd.Count; fxStart[0] = host.PendingFx.Count;
            for (int i = 0; i < un; i++)
            {
                if (st.Dead[i]) { evtStart[i + 1] = evtStart[i]; fxStart[i + 1] = fxStart[i]; continue; }
                bool ended = WbUnits.UpdateUnitPre(st, host, env, i);
                if (!ended)
                {
                    host.PendingUpd.Add(new WbUpdEvent("tail", st.Id[i], 0.0, 0.0));
                    host.PendingUpd.Add(new WbUpdEvent("post", st.Id[i], 0.0, 0.0));
                }
                evtStart[i + 1] = host.PendingUpd.Count;
                fxStart[i + 1] = host.PendingFx.Count;
            }
            // 步级 rng 消耗
            UuCheckI($"uu.{name}.s{sn}.draws", o.GetProperty("draws").GetInt32(), st.RngDraws - draw0, "");
            // 步级地形/火 diff（terrainTrack 场景）
            if (terrainTrack)
            {
                var tdJ = o.GetProperty("terrDiff");
                int tdC = 0;
                foreach (var tde in tdJ.EnumerateArray())
                {
                    int idx = tde[0].GetInt32();
                    total++;
                    // 两端匹配语义：old/new 与 JS 记录一致（变化性由 JS diff 记录本身保证）
                    if (host.Terrain[idx] != (byte)tde[2].GetInt32() || terrBefore[idx] != (byte)tde[1].GetInt32())
                    { fail++; if (fails.Count < MAXREPORT) fails.Add($"[uu.{name}.s{sn}.terrDiff{tdC}] idx={idx} JS={tde[1]}→{tde[2]} C#={terrBefore[idx]}→{host.Terrain[idx]}"); }
                    tdC++;
                }
                UuCheckI($"uu.{name}.s{sn}.terrDiffN", tdJ.GetArrayLength(), tdC, "");
                var fdJ = o.GetProperty("fireDiff");
                int fdC = 0;
                foreach (var fde in fdJ.EnumerateArray())
                {
                    int idx = fde[0].GetInt32();
                    total++;
                    if (host.Fire[idx] != (byte)fde[2].GetInt32() || fireBefore[idx] != (byte)fde[1].GetInt32())
                    { fail++; if (fails.Count < MAXREPORT) fails.Add($"[uu.{name}.s{sn}.fireDiff{fdC}] idx={idx} JS={fde[1]}→{fde[2]} C#={fireBefore[idx]}→{host.Fire[idx]}"); }
                    fdC++;
                }
                UuCheckI($"uu.{name}.s{sn}.fireDiffN", fdJ.GetArrayLength(), fdC, "");
                // fireSet 全量（sorted）
                var fsJ = o.GetProperty("fireSet");
                var csharpFs = host.FireSet.OrderBy(v => v).ToList();
                UuCheckI($"uu.{name}.s{sn}.fireSetN", fsJ.GetArrayLength(), csharpFs.Count, "");
                int fsC = 0;
                foreach (var fsE in fsJ.EnumerateArray())
                {
                    UuCheckI($"uu.{name}.s{sn}.fireSet[{fsC}]", fsE.GetInt32(), fsC < csharpFs.Count ? csharpFs[fsC] : -1, "");
                    fsC++;
                }
            }
            // per-unit 状态对账
            for (int i = 0; i < un; i++)
            {
                var uo = usOut[i];
                if (uo.ValueKind != JsonValueKind.Object || !uo.TryGetProperty("age", out _))
                { UuCheckB($"uu.{name}.s{sn}.u{i}.deadSkip", true, st.Dead[i], ""); continue; }
                UuCheckN($"uu.{name}.s{sn}.u{i}.age", uo.GetProperty("age").GetString()!, st.Age[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.hp", uo.GetProperty("hp").GetString()!, st.Hp[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.maxAge", uo.GetProperty("maxAge").GetString()!, st.MaxAge[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.maxHp", uo.GetProperty("maxHp").GetString()!, st.MaxHp[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.hurt", uo.GetProperty("hurt").GetString()!, st.Hurt[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.cd", uo.GetProperty("cd").GetString()!, st.Cd[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.atk", uo.GetProperty("atk").GetString()!, st.Atk[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.chill", uo.GetProperty("chill").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("chill").GetString()!, st.Chill[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.fleeT", uo.GetProperty("fleeT").GetString()!, st.FleeT[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.bless", uo.GetProperty("bless").GetString()!, st.Bless[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.curse", uo.GetProperty("curse").GetString()!, st.Curse[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.fert", uo.GetProperty("fert").GetString()!, st.Fert[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.detour", uo.GetProperty("detour").GetString()!, st.Detour[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.panic", uo.GetProperty("panic").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("panic").GetString()!, st.Panic[i], "");
                // gids/gval
                var gidsJ = uo.GetProperty("gids");
                UuCheckB($"uu.{name}.s{sn}.u{i}.gidsNull", gidsJ.ValueKind == JsonValueKind.Null, st.GIds[i] == null, "");
                if (gidsJ.ValueKind == JsonValueKind.String)
                {
                    var expect = gidsJ.GetString()!.Split(',').Select(int.Parse).ToList();
                    UuCheckI($"uu.{name}.s{sn}.u{i}.gidsN", expect.Count, st.GIds[i]?.Count ?? -1, "");
                    for (int g = 0; g < expect.Count; g++)
                        UuCheckI($"uu.{name}.s{sn}.u{i}.gids[{g}]", expect[g], g < (st.GIds[i]?.Count ?? 0) ? st.GIds[i]![g] : -1, "");
                }
                var gvalJ = uo.GetProperty("gval");
                UuCheckB($"uu.{name}.s{sn}.u{i}.gvalNull", gvalJ.ValueKind == JsonValueKind.Null, st.GVal[i] == null, "");
                if (gvalJ.ValueKind == JsonValueKind.String)
                {
                    var expectHex = gvalJ.GetString()!.Split(',');
                    UuCheckI($"uu.{name}.s{sn}.u{i}.gvalN", expectHex.Length, st.GVal[i]?.Count ?? -1, "");
                    for (int g = 0; g < expectHex.Length; g++)
                        UuCheckN($"uu.{name}.s{sn}.u{i}.gval[{g}]", expectHex[g], g < (st.GVal[i]?.Count ?? 0) ? st.GVal[i]![g] : double.NaN, "");
                }
                UuCheckN($"uu.{name}.s{sn}.u{i}.food", uo.GetProperty("food").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("food").GetString()!, st.Food[i], "");
                UuCheckI($"uu.{name}.s{sn}.u{i}.stk", uo.GetProperty("stk").GetInt32(), st.Stk[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.sxk", uo.GetProperty("sxk").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("sxk").GetString()!, st.Sxk[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.syk", uo.GetProperty("syk").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("syk").GetString()!, st.Syk[i], "");
                UuCheckB($"uu.{name}.s{sn}.u{i}.infected", uo.GetProperty("infected").GetBoolean(), st.Infected[i], "");
                UuCheckB($"uu.{name}.s{sn}.u{i}.dead", uo.GetProperty("dead").GetBoolean(), st.Dead[i], "");
                UuCheckI($"uu.{name}.s{sn}.u{i}.grab", uo.GetProperty("grab").GetInt32(), (long)st.Grab[i], "");
                UuCheckI($"uu.{name}.s{sn}.u{i}.boat", uo.GetProperty("boat").GetInt32(), st.Boat[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.x", uo.GetProperty("x").GetString()!, st.X[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.y", uo.GetProperty("y").GetString()!, st.Y[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.tx", uo.GetProperty("tx").GetString()!, st.Tx[i], "");
                UuCheckN($"uu.{name}.s{sn}.u{i}.ty", uo.GetProperty("ty").GetString()!, st.Ty[i], "");
                // per-unit 事件流（evt 切分对齐——含 tail/post stub 事件）
                var evtJ = uo.GetProperty("evt");
                UuCheckI($"uu.{name}.s{sn}.u{i}.evtN", evtJ.GetArrayLength(), evtStart[i + 1] - evtStart[i], "");
                int evC = 0;
                foreach (var e in evtJ.EnumerateArray())
                {
                    int ei = evtStart[i] + evC;
                    if (ei < evtStart[i + 1])
                    {
                        var pe = host.PendingUpd[ei];
                        total++;
                        if (pe.Kind != e[0].GetString()) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[uu.{name}.s{sn}.u{i}.evt{evC}] kind JS={e[0].GetString()} C#={pe.Kind}"); }
                        var kindStr = e[0].GetString();
                        if (kindStr == "rise")
                        {
                            UuCheckN($"uu.{name}.s{sn}.u{i}.evt{evC}.x", e[1].GetString()!, pe.X, "");
                            UuCheckN($"uu.{name}.s{sn}.u{i}.evt{evC}.y", e[2].GetString()!, pe.Y, "");
                        }
                        else
                        {
                            UuCheckI($"uu.{name}.s{sn}.u{i}.evt{evC}.id", e[1].GetInt32(), pe.Id, "");
                        }
                    }
                    evC++;
                }
                // per-unit fx（bless/curse 金光/紫霾）
                var fxJ = uo.GetProperty("fx");
                UuCheckI($"uu.{name}.s{sn}.u{i}.fxN", fxJ.GetArrayLength(), fxStart[i + 1] - fxStart[i], "");
                int fxC = 0;
                foreach (var f in fxJ.EnumerateArray())
                {
                    int fi2 = fxStart[i] + fxC;
                    if (fi2 < fxStart[i + 1])
                    {
                        var pf = host.PendingFx[fi2];
                        total++;
                        if (pf.Kind != f[0].GetString()) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[uu.{name}.s{sn}.u{i}.fx{fxC}] kind JS={f[0].GetString()} C#={pf.Kind}"); }
                        UuCheckN($"uu.{name}.s{sn}.u{i}.fx{fxC}.x", f[1].GetString()!, pf.X, "");
                        UuCheckN($"uu.{name}.s{sn}.u{i}.fx{fxC}.y", f[2].GetString()!, pf.Y, "");
                    }
                    fxC++;
                }
            }
            sn++;
        }
        // 终态全量
        var finJ = c.GetProperty("final");
        for (int i = 0; i < un; i++)
        {
            var f = finJ[i];
            UuCheckN($"uu.{name}.fin.u{i}.age", f.GetProperty("age").GetString()!, st.Age[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.hp", f.GetProperty("hp").GetString()!, st.Hp[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.hurt", f.GetProperty("hurt").GetString()!, st.Hurt[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.cd", f.GetProperty("cd").GetString()!, st.Cd[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.atk", f.GetProperty("atk").GetString()!, st.Atk[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.fleeT", f.GetProperty("fleeT").GetString()!, st.FleeT[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.bless", f.GetProperty("bless").GetString()!, st.Bless[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.curse", f.GetProperty("curse").GetString()!, st.Curse[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.fert", f.GetProperty("fert").GetString()!, st.Fert[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.detour", f.GetProperty("detour").GetString()!, st.Detour[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.panic", f.GetProperty("panic").ValueKind == JsonValueKind.Null ? null : f.GetProperty("panic").GetString()!, st.Panic[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.food", f.GetProperty("food").ValueKind == JsonValueKind.Null ? null : f.GetProperty("food").GetString()!, st.Food[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.sxk", f.GetProperty("sxk").ValueKind == JsonValueKind.Null ? null : f.GetProperty("sxk").GetString()!, st.Sxk[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.syk", f.GetProperty("syk").ValueKind == JsonValueKind.Null ? null : f.GetProperty("syk").GetString()!, st.Syk[i], "");
            UuCheckI($"uu.{name}.fin.u{i}.stk", f.GetProperty("stk").GetInt32(), st.Stk[i], "");
            UuCheckB($"uu.{name}.fin.u{i}.infected", f.GetProperty("infected").GetBoolean(), st.Infected[i], "");
            UuCheckB($"uu.{name}.fin.u{i}.dead", f.GetProperty("dead").GetBoolean(), st.Dead[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.x", f.GetProperty("x").GetString()!, st.X[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.y", f.GetProperty("y").GetString()!, st.Y[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.tx", f.GetProperty("tx").GetString()!, st.Tx[i], "");
            UuCheckN($"uu.{name}.fin.u{i}.ty", f.GetProperty("ty").GetString()!, st.Ty[i], "");
        }
        // rng 流指纹
        var uutail = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
        for (int i = 0; i < 4 && uutail.MoveNext(); i++)
            UuCheckN($"uu.{name}.rngTail[{i}]", uutail.Current.GetString()!, WbRng.Next(ref st.RngA), "");
    }
}

// ---------- 11) 网格与扫描（M-U2b：rebuildBuckets 幽灵清理/懒清空 + isEnemyFast LUT + 扫描环出口链逐位对账，Task 142） ----------
var ubPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-buckets.json");
if (!File.Exists(ubPath)) ubPath = "golden-units-buckets.json";
if (File.Exists(ubPath))
{
    var ubd = JsonDocument.Parse(File.ReadAllText(ubPath)).RootElement;
    int ubW = ubd.GetProperty("w").GetInt32();
    var ubRaces = ubd.GetProperty("races");
    var ubEp = ubd.GetProperty("ep");
    double ubPanicDecay = ubEp.GetProperty("panicDecay").GetDouble();
    double ubGrudgeDecay = ubEp.GetProperty("grudgeDecay").GetDouble();
    double ubFire = ubEp.GetProperty("fireDamage").GetDouble();
    double ubPanicRout = ubEp.GetProperty("panicRout").GetDouble();

    // NaN 态对账（Task 141 课：.NET NaN 位模式非平台稳定——只比态不比位；JS 侧位模式串
    // exp 全 1+尾数非 0 同判 NaN；null/undefined 同按 NaN 态）。
    static ulong UbLeHexToBits(string h)
    {
        ulong v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | Convert.ToUInt64(h.Substring(i * 2, 2), 16);
        return v;
    }
    void UbCheckN(string tag, string? jsStr, double actual, string loc)
    {
        total++;
        ulong jsBits = 0; bool jsIsNaN = false;
        if (jsStr != null)
        {
            jsBits = UbLeHexToBits(jsStr);
            jsIsNaN = (jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0;
        }
        bool cNaN = double.IsNaN(actual);
        bool jNaN = jsStr == null || jsIsNaN;
        if (cNaN && jNaN) return;
        if (cNaN && !jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#=NaN（应为数值）"); return; }
        if (!cNaN && jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr ?? "undefined"}(NaN) C#={actual:R}（应为 NaN）"); return; }
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})"); }
    }
    void UbCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void UbCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }

    byte[] UbGrid(JsonElement spec)
    {
        var g = new byte[ubW * 160];
        Array.Fill(g, (byte)spec.GetProperty("def").GetInt32());
        foreach (var p in spec.GetProperty("patches").EnumerateArray())
        {
            int x1 = p[0].GetInt32(), y1 = p[1].GetInt32(), x2 = p[2].GetInt32(), y2 = p[3].GetInt32(), t = p[4].GetInt32();
            for (int y = y1; y < y2; y++) for (int x = x1; x < x2; x++) g[y * ubW + x] = (byte)t;
        }
        return g;
    }

    void UbLoadUnit(WbUnitsState st, int i, JsonElement u)
    {
        double NumOr(string k, double dflt)
        {
            if (!u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null) return dflt;
            return v.GetDouble();
        }
        st.Id[i] = u.TryGetProperty("id", out var idJ) ? idJ.GetInt32() : i + 1;
        st.Race[i] = (uint)u.GetProperty("race").GetInt32();
        st.X[i] = u.GetProperty("x").GetDouble(); st.Y[i] = u.GetProperty("y").GetDouble();
        st.Tx[i] = NumOr("tx", st.X[i]); st.Ty[i] = NumOr("ty", st.Y[i]);
        st.Age[i] = NumOr("age", 20.0); st.MaxAge[i] = NumOr("maxAge", 55.0);
        st.Hp[i] = NumOr("hp", 100.0); st.MaxHp[i] = NumOr("maxHp", 100.0);
        st.Dmg[i] = NumOr("dmg", 0.0);
        st.Kills[i] = (int)NumOr("kills", 0.0);
        st.Hurt[i] = NumOr("hurt", double.NaN);
        st.Cd[i] = NumOr("cd", 0.0); st.Atk[i] = NumOr("atk", 0.0);
        st.Chill[i] = NumOr("chill", double.NaN);
        st.FleeT[i] = NumOr("fleeT", 0.0); st.Bless[i] = NumOr("bless", 0.0);
        st.Curse[i] = NumOr("curse", 0.0); st.Fert[i] = NumOr("fert", 0.0); st.Detour[i] = NumOr("detour", 0.0);
        st.Panic[i] = NumOr("panic", double.NaN);
        if (u.TryGetProperty("gids", out var gj) && gj.ValueKind == JsonValueKind.Array)
        {
            var gl = new List<int>(); foreach (var g0 in gj.EnumerateArray()) gl.Add(g0.GetInt32());
            st.GIds[i] = gl;
            var vl = new List<double>();
            if (u.TryGetProperty("gval", out var vj) && vj.ValueKind == JsonValueKind.Array)
                foreach (var v0 in vj.EnumerateArray()) vl.Add(v0.GetDouble());
            st.GVal[i] = vl;
        }
        st.Food[i] = NumOr("food", double.NaN);
        st.Stk[i] = (int)NumOr("stk", 0.0);
        st.Sxk[i] = NumOr("sxk", double.NaN); st.Syk[i] = NumOr("syk", double.NaN);
        st.Infected[i] = u.TryGetProperty("infected", out var ij) && ij.ValueKind == JsonValueKind.True;
        st.Grab[i] = NumOr("grab", 0.0);
        st.Boat[i] = (byte)NumOr("boat", 0);
        st.Civ[i] = (int)NumOr("civ", -1); st.Job[i] = (int)NumOr("job", 0);
        st.Speed[i] = NumOr("speed", 0.1);
        st.Caravan[i] = (int)NumOr("caravan", 0);
        if (u.TryGetProperty("dead", out var dj) && dj.ValueKind == JsonValueKind.True) st.Dead[i] = true;
    }

    void UbSetupRaces(WbUpdateHost host, JsonElement racesJ, JsonElement? dynJ = null)
    {
        foreach (var rp in racesJ.EnumerateObject())
        {
            int rid = int.Parse(rp.Name);
            host.RaceFlags[rid] = (byte)rp.Value.GetProperty("flags").GetInt32();
            host.Tbf[rid * 2] = (byte)rp.Value.GetProperty("tbf0").GetInt32();
            host.Tbf[rid * 2 + 1] = (byte)rp.Value.GetProperty("tbf1").GetInt32();
            var reach = rp.Value.GetProperty("reach");
            host.RaceReach[rid] = reach.ValueKind == JsonValueKind.Null ? double.NaN : reach.GetDouble();
        }
        if (dynJ is { ValueKind: JsonValueKind.Array })
        {
            var table = new Dictionary<uint, WbDynRace>();
            foreach (var d in dynJ.Value.EnumerateArray())
                table[(uint)d[0].GetInt32()] = new WbDynRace((byte)d[1].GetInt32(), (uint)d[2].GetInt32());
            host.DynRaces = table;
        }
    }

    Func<int, int, bool> UbAtWar(Dictionary<string, double> rel) => (a, b) =>
    {
        string key = a < b ? $"{a}-{b}" : $"{b}-{a}";
        return rel.TryGetValue(key, out var v) && v < -20.0;
    };

    void UbCheckBuckets(string tag, JsonElement expect, WbGridState grid)
    {
        var expectArr = expect.EnumerateArray().ToList();
        var actual = new List<(int ci, List<int> slots)>();
        for (int ci = 0; ci < grid.Buckets.Length; ci++)
            if (grid.Buckets[ci].Count > 0) actual.Add((ci, new List<int>(grid.Buckets[ci])));
        UbCheckI($"{tag}.bucketsN", expectArr.Count, actual.Count, "");
        for (int i = 0; i < Math.Min(expectArr.Count, actual.Count); i++)
        {
            int eCi = expectArr[i][0].GetInt32();
            UbCheckI($"{tag}.b{i}.ci", eCi, actual[i].ci, "");
            var eSlots = expectArr[i][1].EnumerateArray().Select(x => x.GetInt32()).ToList();
            UbCheckI($"{tag}.b{i}.n", eSlots.Count, actual[i].slots.Count, "");
            for (int k = 0; k < Math.Min(eSlots.Count, actual[i].slots.Count); k++)
                UbCheckI($"{tag}.b{i}.s{k}", eSlots[k], actual[i].slots[k], "");
        }
    }

    void UbCheckLut(string tag, JsonElement lutJ, Dictionary<long, bool> lut)
    {
        UbCheckI($"{tag}.size", lutJ.GetProperty("size").GetInt32(), lut.Count, "");
        var keys = lut.Keys.OrderBy(k => k).ToList();
        int i = 0;
        foreach (var e in lutJ.GetProperty("entries").EnumerateArray())
        {
            long k = e[0].GetInt64();
            bool v = e[1].GetBoolean();
            if (i < keys.Count)
            {
                UbCheckI($"{tag}.k{i}", k, keys[i], "");
                UbCheckB($"{tag}.v{i}", v, lut[keys[i]], "");
            }
            i++;
        }
    }

    void UbSnapCompare(string tag, JsonElement uo, WbUnitsState st, int i)
    {
        UbCheckN($"{tag}.age", uo.GetProperty("age").GetString()!, st.Age[i], "");
        UbCheckN($"{tag}.hp", uo.GetProperty("hp").GetString()!, st.Hp[i], "");
        UbCheckN($"{tag}.hurt", uo.GetProperty("hurt").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("hurt").GetString()!, st.Hurt[i], "");
        UbCheckN($"{tag}.cd", uo.GetProperty("cd").GetString()!, st.Cd[i], "");
        UbCheckN($"{tag}.atk", uo.GetProperty("atk").GetString()!, st.Atk[i], "");
        UbCheckN($"{tag}.fleeT", uo.GetProperty("fleeT").GetString()!, st.FleeT[i], "");
        UbCheckN($"{tag}.bless", uo.GetProperty("bless").GetString()!, st.Bless[i], "");
        UbCheckN($"{tag}.curse", uo.GetProperty("curse").GetString()!, st.Curse[i], "");
        UbCheckN($"{tag}.fert", uo.GetProperty("fert").GetString()!, st.Fert[i], "");
        UbCheckN($"{tag}.detour", uo.GetProperty("detour").GetString()!, st.Detour[i], "");
        UbCheckN($"{tag}.panic", uo.GetProperty("panic").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("panic").GetString()!, st.Panic[i], "");
        UbCheckN($"{tag}.food", uo.GetProperty("food").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("food").GetString()!, st.Food[i], "");
        UbCheckN($"{tag}.sxk", uo.GetProperty("sxk").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("sxk").GetString()!, st.Sxk[i], "");
        UbCheckN($"{tag}.syk", uo.GetProperty("syk").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("syk").GetString()!, st.Syk[i], "");
        UbCheckI($"{tag}.stk", uo.GetProperty("stk").GetInt32(), st.Stk[i], "");
        UbCheckB($"{tag}.infected", uo.GetProperty("infected").GetBoolean(), st.Infected[i], "");
        UbCheckB($"{tag}.dead", uo.GetProperty("dead").GetBoolean(), st.Dead[i], "");
        UbCheckI($"{tag}.caravan", uo.GetProperty("caravan").GetInt32(), st.Caravan[i], "");
        UbCheckN($"{tag}.dmg", uo.GetProperty("dmg").GetString()!, st.Dmg[i], "");
        UbCheckI($"{tag}.kills", uo.GetProperty("kills").GetInt32(), st.Kills[i], "");
        UbCheckN($"{tag}.x", uo.GetProperty("x").GetString()!, st.X[i], "");
        UbCheckN($"{tag}.y", uo.GetProperty("y").GetString()!, st.Y[i], "");
        UbCheckN($"{tag}.tx", uo.GetProperty("tx").GetString()!, st.Tx[i], "");
        UbCheckN($"{tag}.ty", uo.GetProperty("ty").GetString()!, st.Ty[i], "");
        // gids/gval
        var gidsJ = uo.GetProperty("gids");
        UbCheckB($"{tag}.gidsNull", gidsJ.ValueKind == JsonValueKind.Null, st.GIds[i] == null, "");
        if (gidsJ.ValueKind == JsonValueKind.String)
        {
            var expect = gidsJ.GetString()!.Split(',').Select(int.Parse).ToList();
            UbCheckI($"{tag}.gidsN", expect.Count, st.GIds[i]?.Count ?? -1, "");
            for (int g = 0; g < expect.Count; g++)
                UbCheckI($"{tag}.gids[{g}]", expect[g], g < (st.GIds[i]?.Count ?? 0) ? st.GIds[i]![g] : -1, "");
        }
        var gvalJ = uo.GetProperty("gval");
        UbCheckB($"{tag}.gvalNull", gvalJ.ValueKind == JsonValueKind.Null, st.GVal[i] == null, "");
        if (gvalJ.ValueKind == JsonValueKind.String)
        {
            var expectHex = gvalJ.GetString()!.Split(',');
            UbCheckI($"{tag}.gvalN", expectHex.Length, st.GVal[i]?.Count ?? -1, "");
            for (int g = 0; g < expectHex.Length; g++)
                UbCheckN($"{tag}.gval[{g}]", expectHex[g], g < (st.GVal[i]?.Count ?? 0) ? st.GVal[i]![g] : double.NaN, "");
        }
    }

    foreach (var c in ubd.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        string mode = c.GetProperty("mode").GetString()!;
        var host = new WbUpdateHost();
        var grid = new WbGridState();
        host.Terrain = UbGrid(ubd.GetProperty("terrainSpecs").EnumerateArray().First(t => t.GetProperty("name").GetString() == c.GetProperty("terrain").GetString()));
        UbSetupRaces(host, ubRaces, mode == "matrix" ? c.GetProperty("matrix").GetProperty("dyn") : null);
        var env = new WbMoveEnv
        {
            PanicDecay = ubPanicDecay, GrudgeDecay = ubGrudgeDecay, FireDamage = ubFire,
            PanicRout = ubPanicRout,
            LawsUndeadRise = c.GetProperty("env").TryGetProperty("lawsRise", out var lr) && lr.GetBoolean(),
            FxAmbience = c.GetProperty("env").TryGetProperty("ambience", out var am) && am.GetBoolean(),
        };

        if (mode == "matrix")
        {
            var m = c.GetProperty("matrix");
            var relMap = new Dictionary<string, double>();
            foreach (var r in m.GetProperty("rel").EnumerateArray()) relMap[r[0].GetString()!] = r[1].GetDouble();
            host.AtWar = UbAtWar(relMap);
            var unitsJ = m.GetProperty("unitIndex");
            int un = unitsJ.GetArrayLength();
            var st = new WbUnitsState(Math.Max(un, 1));
            st.LiveLen = un;
            for (int i = 0; i < un; i++) UbLoadUnit(st, i, unitsJ[i]);
            var idToSlot = new Dictionary<int, int>();
            for (int i = 0; i < un; i++) idToSlot[st.Id[i]] = i;
            foreach (var op in m.GetProperty("ops").EnumerateArray())
            {
                string t = op.GetProperty("t").GetString()!;
                if (t == "herb")
                {
                    uint r = (uint)op.GetProperty("r").GetInt32();
                    UbCheckB($"ub.{name}.herb[{r}]", op.GetProperty("v").GetBoolean(), WbUnits.IsHerbivoreRace(host, r), "");
                }
                else
                {
                    int a = idToSlot[op.GetProperty("a").GetInt32()];
                    int b = idToSlot[op.GetProperty("b").GetInt32()];
                    bool actual = t == "fast" ? WbUnits.IsEnemyFast(st, host, a, b) : WbUnits.IsEnemy(st, host, a, b);
                    UbCheckB($"ub.{name}.{t}[{a},{b}]", op.GetProperty("v").GetBoolean(), actual, "");
                }
            }
            UbCheckLut($"ub.{name}", m.GetProperty("lut"), host.EnemyLut);
            continue;
        }

        var relWar = new Dictionary<string, double>();
        if (c.TryGetProperty("relWar", out var rwJ) && rwJ.ValueKind == JsonValueKind.Array)
            foreach (var r in rwJ.EnumerateArray()) relWar[r[0].GetString()!] = r[1].GetDouble();
        if (relWar.Count > 0) host.AtWar = UbAtWar(relWar);

        var specsJ = c.GetProperty("units");
        int un2 = specsJ.GetArrayLength();
        var st2 = new WbUnitsState(Math.Max(un2, 1));
        st2.LiveLen = un2;
        for (int i = 0; i < un2; i++) UbLoadUnit(st2, i, specsJ[i]);
        st2.RngA = (uint)c.GetProperty("seed").GetInt32();

        int sn2 = 0;
        foreach (var o in c.GetProperty("out").EnumerateArray())
        {
            // 步前注入（muts 规则化回显）
            if (o.TryGetProperty("muts", out var mutsJ))
                foreach (var m in mutsJ.EnumerateArray())
                {
                    int ms = m.GetProperty("slot").GetInt32();
                    if (m.TryGetProperty("x", out var mx)) st2.X[ms] = mx.GetDouble();
                    if (m.TryGetProperty("y", out var my)) st2.Y[ms] = my.GetDouble();
                }
            // 网格重建（每 tick——真引擎 tick 序）
            WbGrid.Rebuild(st2, grid);
            UbCheckI($"ub.{name}.s{sn2}.stamp", o.GetProperty("stamp").GetInt32(), grid.Stamp, "");
            var ghostsJ = o.GetProperty("ghosts").EnumerateArray().Select(x => x.GetInt32()).ToList();
            UbCheckI($"ub.{name}.s{sn2}.ghostsN", ghostsJ.Count, grid.Ghosts.Count, "");
            for (int i = 0; i < Math.Min(ghostsJ.Count, grid.Ghosts.Count); i++)
                UbCheckI($"ub.{name}.s{sn2}.ghosts[{i}]", ghostsJ[i], grid.Ghosts[i], "");
            UbCheckBuckets($"ub.{name}.s{sn2}", o.GetProperty("buckets"), grid);

            if (mode == "units")
            {
                int draw0 = st2.RngDraws;
                var usOut = o.GetProperty("units");
                int[] evtStart = new int[un2 + 1];
                int[] fxStart = new int[un2 + 1];
                evtStart[0] = host.PendingUpd.Count; fxStart[0] = host.PendingFx.Count;
                for (int i = 0; i < un2; i++)
                {
                    if (st2.Dead[i]) { evtStart[i + 1] = evtStart[i]; fxStart[i + 1] = fxStart[i]; continue; }
                    bool ended = WbUnits.UpdateUnitPre(st2, host, env, i);
                    if (!ended)
                    {
                        var exit = WbUnits.UpdateUnitScan(st2, host, env, grid, i);
                        if (exit == WbUnits.WbScanExit.ToTailPost)
                            host.PendingUpd.Add(new WbUpdEvent("tail", st2.Id[i], 0.0, 0.0));
                        if (exit != WbUnits.WbScanExit.Ended)
                            host.PendingUpd.Add(new WbUpdEvent("post", st2.Id[i], 0.0, 0.0));
                    }
                    evtStart[i + 1] = host.PendingUpd.Count;
                    fxStart[i + 1] = host.PendingFx.Count;
                }
                UbCheckI($"ub.{name}.s{sn2}.draws", o.GetProperty("draws").GetInt32(), st2.RngDraws - draw0, "");
                for (int i = 0; i < un2; i++)
                {
                    var uo = usOut[i];
                    if (uo.ValueKind != JsonValueKind.Object || !uo.TryGetProperty("age", out _))
                    { UbCheckB($"ub.{name}.s{sn2}.u{i}.deadSkip", true, st2.Dead[i], ""); continue; }
                    UbSnapCompare($"ub.{name}.s{sn2}.u{i}", uo, st2, i);
                    var evtJ = uo.GetProperty("evt");
                    UbCheckI($"ub.{name}.s{sn2}.u{i}.evtN", evtJ.GetArrayLength(), evtStart[i + 1] - evtStart[i], "");
                    int evC = 0;
                    foreach (var e in evtJ.EnumerateArray())
                    {
                        int ei = evtStart[i] + evC;
                        if (ei < evtStart[i + 1])
                        {
                            var pe = host.PendingUpd[ei];
                            total++;
                            if (pe.Kind != e[0].GetString()) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[ub.{name}.s{sn2}.u{i}.evt{evC}] kind JS={e[0].GetString()} C#={pe.Kind}"); }
                            UbCheckI($"ub.{name}.s{sn2}.u{i}.evt{evC}.id", e[1].GetInt32(), pe.Id, "");
                        }
                        evC++;
                    }
                    var fxJ = uo.GetProperty("fx");
                    UbCheckI($"ub.{name}.s{sn2}.u{i}.fxN", fxJ.GetArrayLength(), fxStart[i + 1] - fxStart[i], "");
                }
            }
            sn2++;
        }
        if (mode == "units")
        {
            var finJ = c.GetProperty("final");
            for (int i = 0; i < un2; i++) UbSnapCompare($"ub.{name}.fin.u{i}", finJ[i], st2, i);
            UbCheckLut($"ub.{name}", c.GetProperty("lut"), host.EnemyLut);
            var ubtail = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
            for (int i = 0; i < 4 && ubtail.MoveNext(); i++)
                UbCheckN($"ub.{name}.rngTail[{i}]", ubtail.Current.GetString()!, WbRng.Next(ref st2.RngA), "");
        }
    }
}

// ---------- 12) 战斗树 + 神经四头（M-U2c：近战命中/伤害乘序/暴击吸血反伤/特殊种族/击杀结算 + 网络矩阵，Task 144） ----------
var cbPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-combat.json");
if (!File.Exists(cbPath)) cbPath = "golden-units-combat.json";
if (File.Exists(cbPath))
{
    var cbd = JsonDocument.Parse(File.ReadAllText(cbPath)).RootElement;
    int cbW = cbd.GetProperty("w").GetInt32();
    var cbRaces = cbd.GetProperty("races");
    var cbEp = cbd.GetProperty("ep");
    double cbPanicDecay = cbEp.GetProperty("panicDecay").GetDouble();
    double cbGrudgeDecay = cbEp.GetProperty("grudgeDecay").GetDouble();
    double cbFire = cbEp.GetProperty("fireDamage").GetDouble();
    double cbPanicRout = cbEp.GetProperty("panicRout").GetDouble();
    byte cbWallKind = (byte)cbd.GetProperty("wallKind").GetInt32();
    var cbTraitImmune = cbd.GetProperty("traitImmune").EnumerateArray().Select(x => x.GetString()!).ToHashSet();

    static ulong CbLeHexToBits(string h)
    {
        ulong v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | Convert.ToUInt64(h.Substring(i * 2, 2), 16);
        return v;
    }
    void CbCheckN(string tag, string? jsStr, double actual, string loc)
    {
        total++;
        ulong jsBits = 0; bool jsIsNaN = false;
        if (jsStr != null)
        {
            jsBits = CbLeHexToBits(jsStr);
            jsIsNaN = (jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0;
        }
        bool cNaN = double.IsNaN(actual);
        bool jNaN = jsStr == null || jsIsNaN;
        if (cNaN && jNaN) return;
        if (cNaN && !jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#=NaN（应为数值）"); return; }
        if (!cNaN && jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr ?? "undefined"}(NaN) C#={actual:R}（应为 NaN）"); return; }
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#={actual:R}({BitConverter.DoubleToUInt64Bits(actual):x16})"); }
    }
    void CbCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void CbCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void CbCheckS(string tag, string? expect, string? actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }

    byte[] CbGrid(JsonElement spec)
    {
        var g = new byte[cbW * 160];
        Array.Fill(g, (byte)spec.GetProperty("def").GetInt32());
        foreach (var p in spec.GetProperty("patches").EnumerateArray())
        {
            int x1 = p[0].GetInt32(), y1 = p[1].GetInt32(), x2 = p[2].GetInt32(), y2 = p[3].GetInt32(), t = p[4].GetInt32();
            for (int y = y1; y < y2; y++) for (int x = x1; x < x2; x++) g[y * cbW + x] = (byte)t;
        }
        return g;
    }

    void CbSetupRaces(WbCombatHost host, JsonElement racesJ)
    {
        foreach (var rp in racesJ.EnumerateObject())
        {
            int rid = int.Parse(rp.Name);
            host.RaceFlags[rid] = (byte)rp.Value.GetProperty("flags").GetInt32();
            host.Tbf[rid * 2] = (byte)rp.Value.GetProperty("tbf0").GetInt32();
            host.Tbf[rid * 2 + 1] = (byte)rp.Value.GetProperty("tbf1").GetInt32();
            var reach = rp.Value.GetProperty("reach");
            host.RaceReach[rid] = reach.ValueKind == JsonValueKind.Null ? double.NaN : reach.GetDouble();
            host.RaceSpeed[rid] = rp.Value.GetProperty("speed").GetDouble();
        }
    }

    void CbLoadUnit(WbUnitsState st, int i, JsonElement u)
    {
        double NumOr(string k, double dflt)
        {
            if (!u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null) return dflt;
            return v.GetDouble();
        }
        string? StrOr(string k) =>
            !u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null ? null : v.GetString();
        st.Id[i] = u.TryGetProperty("id", out var idJ) ? idJ.GetInt32() : i + 1;
        st.Race[i] = (uint)u.GetProperty("race").GetInt32();
        st.X[i] = u.GetProperty("x").GetDouble(); st.Y[i] = u.GetProperty("y").GetDouble();
        st.Tx[i] = NumOr("tx", st.X[i]); st.Ty[i] = NumOr("ty", st.Y[i]);
        st.Age[i] = NumOr("age", 20.0); st.MaxAge[i] = NumOr("maxAge", 55.0);
        st.Hp[i] = NumOr("hp", 100.0); st.MaxHp[i] = NumOr("maxHp", 100.0);
        st.Dmg[i] = NumOr("dmg", 0.0);
        st.Kills[i] = (int)NumOr("kills", 0.0);
        st.Hurt[i] = NumOr("hurt", double.NaN);
        st.Cd[i] = NumOr("cd", 0.0); st.Atk[i] = NumOr("atk", 0.0);
        st.Chill[i] = NumOr("chill", double.NaN);
        st.FleeT[i] = NumOr("fleeT", 0.0); st.Bless[i] = NumOr("bless", 0.0);
        st.Curse[i] = NumOr("curse", 0.0); st.Fert[i] = NumOr("fert", 0.0); st.Detour[i] = NumOr("detour", 0.0);
        st.Panic[i] = NumOr("panic", double.NaN);
        if (u.TryGetProperty("gids", out var gj) && gj.ValueKind == JsonValueKind.Array)
        {
            var gl = new List<int>(); foreach (var g0 in gj.EnumerateArray()) gl.Add(g0.GetInt32());
            st.GIds[i] = gl;
            var vl = new List<double>();
            if (u.TryGetProperty("gval", out var vj) && vj.ValueKind == JsonValueKind.Array)
                foreach (var v0 in vj.EnumerateArray()) vl.Add(v0.GetDouble());
            st.GVal[i] = vl;
        }
        st.Food[i] = NumOr("food", double.NaN);
        st.Stk[i] = (int)NumOr("stk", 0.0);
        st.Sxk[i] = NumOr("sxk", double.NaN); st.Syk[i] = NumOr("syk", double.NaN);
        st.Infected[i] = u.TryGetProperty("infected", out var ij) && ij.ValueKind == JsonValueKind.True;
        st.Grab[i] = NumOr("grab", 0.0);
        st.Boat[i] = (byte)NumOr("boat", 0); st.BoatTtl[i] = (int)NumOr("boatTTL", 0);
        st.Civ[i] = (int)NumOr("civ", -1); st.Job[i] = (int)NumOr("job", 0);
        st.Speed[i] = NumOr("speed", 0.1);
        st.Caravan[i] = (int)NumOr("caravan", 0);
        if (u.TryGetProperty("dead", out var dj) && dj.ValueKind == JsonValueKind.True) st.Dead[i] = true;
        // —— M-U2c 战斗域列 ——
        st.Trait[i] = StrOr("trait");
        st.Wep[i] = StrOr("wep"); st.Arm[i] = StrOr("arm"); st.Hlm[i] = StrOr("hlm");
        st.Shd[i] = StrOr("shd"); st.Bts[i] = StrOr("bts"); st.RngE[i] = StrOr("rng"); st.Amu[i] = StrOr("amu");
        st.King[i] = u.TryGetProperty("king", out var kj) && kj.ValueKind == JsonValueKind.True;
        st.Fam[i] = (int)NumOr("fam", -1.0); st.Army[i] = (int)NumOr("army", -1.0);
        st.ThrT[i] = NumOr("thrT", double.NaN); st.GrabTtl[i] = NumOr("grabTTL", double.NaN);
    }

    CbSnap CbSnapTake(WbUnitsState st, int i) => new CbSnap
    {
        Race = st.Race[i], Age = st.Age[i], Hp = st.Hp[i], Hurt = st.Hurt[i], Cd = st.Cd[i], Atk = st.Atk[i],
        FleeT = st.FleeT[i], Bless = st.Bless[i], Curse = st.Curse[i], Fert = st.Fert[i], Detour = st.Detour[i],
        Panic = st.Panic[i], Food = st.Food[i], Stk = st.Stk[i], Infected = st.Infected[i], Dead = st.Dead[i],
        King = st.King[i], Fam = st.Fam[i], Army = st.Army[i], Trait = st.Trait[i], Wep = st.Wep[i], Arm = st.Arm[i],
        ThrT = st.ThrT[i], Caravan = st.Caravan[i], Dmg = st.Dmg[i], Kills = st.Kills[i],
        X = st.X[i], Y = st.Y[i], Tx = st.Tx[i], Ty = st.Ty[i],
        GIds = st.GIds[i] == null ? null : new List<int>(st.GIds[i]),
        GVal = st.GVal[i] == null ? null : new List<double>(st.GVal[i]),
    };
    void CbSnapCompare(string tag, JsonElement uo, CbSnap sp)
    {
        CbCheckI($"{tag}.race", uo.GetProperty("race").GetInt32(), (int)sp.Race, "");
        CbCheckN($"{tag}.age", uo.GetProperty("age").GetString()!, sp.Age, "");
        CbCheckN($"{tag}.hp", uo.GetProperty("hp").GetString()!, sp.Hp, "");
        CbCheckN($"{tag}.hurt", uo.GetProperty("hurt").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("hurt").GetString()!, sp.Hurt, "");
        CbCheckN($"{tag}.cd", uo.GetProperty("cd").GetString()!, sp.Cd, "");
        CbCheckN($"{tag}.atk", uo.GetProperty("atk").GetString()!, sp.Atk, "");
        CbCheckN($"{tag}.fleeT", uo.GetProperty("fleeT").GetString()!, sp.FleeT, "");
        CbCheckN($"{tag}.bless", uo.GetProperty("bless").GetString()!, sp.Bless, "");
        CbCheckN($"{tag}.curse", uo.GetProperty("curse").GetString()!, sp.Curse, "");
        CbCheckN($"{tag}.fert", uo.GetProperty("fert").GetString()!, sp.Fert, "");
        CbCheckN($"{tag}.detour", uo.GetProperty("detour").GetString()!, sp.Detour, "");
        CbCheckN($"{tag}.panic", uo.GetProperty("panic").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("panic").GetString()!, sp.Panic, "");
        CbCheckN($"{tag}.food", uo.GetProperty("food").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("food").GetString()!, sp.Food, "");
        CbCheckI($"{tag}.stk", uo.GetProperty("stk").GetInt32(), sp.Stk, "");
        CbCheckB($"{tag}.infected", uo.GetProperty("infected").GetBoolean(), sp.Infected, "");
        CbCheckB($"{tag}.dead", uo.GetProperty("dead").GetBoolean(), sp.Dead, "");
        CbCheckB($"{tag}.king", uo.GetProperty("king").GetBoolean(), sp.King, "");
        CbCheckI($"{tag}.fam", uo.GetProperty("fam").ValueKind == JsonValueKind.Null ? -1 : uo.GetProperty("fam").GetInt32(), sp.Fam, "");
        CbCheckI($"{tag}.army", uo.GetProperty("army").ValueKind == JsonValueKind.Null ? -1 : uo.GetProperty("army").GetInt32(), sp.Army, "");
        CbCheckS($"{tag}.trait", uo.GetProperty("trait").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("trait").GetString()!, sp.Trait, "");
        CbCheckS($"{tag}.wep", uo.GetProperty("wep").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("wep").GetString()!, sp.Wep, "");
        CbCheckS($"{tag}.arm", uo.GetProperty("arm").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("arm").GetString()!, sp.Arm, "");
        CbCheckN($"{tag}.thrT", uo.GetProperty("thrT").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("thrT").GetString()!, sp.ThrT, "");
        CbCheckI($"{tag}.caravan", uo.GetProperty("caravan").GetInt32(), sp.Caravan, "");
        CbCheckN($"{tag}.dmg", uo.GetProperty("dmg").GetString()!, sp.Dmg, "");
        CbCheckI($"{tag}.kills", uo.GetProperty("kills").GetInt32(), sp.Kills, "");
        CbCheckN($"{tag}.x", uo.GetProperty("x").GetString()!, sp.X, "");
        CbCheckN($"{tag}.y", uo.GetProperty("y").GetString()!, sp.Y, "");
        CbCheckN($"{tag}.tx", uo.GetProperty("tx").GetString()!, sp.Tx, "");
        CbCheckN($"{tag}.ty", uo.GetProperty("ty").GetString()!, sp.Ty, "");
        // gids/gval
        var gidsJ = uo.GetProperty("gids");
        CbCheckB($"{tag}.gidsNull", gidsJ.ValueKind == JsonValueKind.Null, sp.GIds == null, "");
        if (gidsJ.ValueKind == JsonValueKind.String)
        {
            var expect = gidsJ.GetString()!.Split(',').Select(int.Parse).ToList();
            CbCheckI($"{tag}.gidsN", expect.Count, sp.GIds?.Count ?? -1, "");
            for (int g = 0; g < expect.Count; g++)
                CbCheckI($"{tag}.gids[{g}]", expect[g], g < (sp.GIds?.Count ?? 0) ? sp.GIds![g] : -1, "");
        }
        var gvalJ = uo.GetProperty("gval");
        CbCheckB($"{tag}.gvalNull", gvalJ.ValueKind == JsonValueKind.Null, sp.GVal == null, "");
        if (gvalJ.ValueKind == JsonValueKind.String)
        {
            var expectHex = gvalJ.GetString()!.Split(',');
            CbCheckI($"{tag}.gvalN", expectHex.Length, sp.GVal?.Count ?? -1, "");
            for (int g = 0; g < expectHex.Length; g++)
                CbCheckN($"{tag}.gval[{g}]", expectHex[g], g < (sp.GVal?.Count ?? 0) ? sp.GVal![g] : double.NaN, "");
        }
    }

    void CbCheckEvt(string tag, JsonElement evtJ, List<WbUpdEvent> pending, int start, int end)
    {
        CbCheckI($"{tag}.evtN", evtJ.GetArrayLength(), end - start, "");
        int evC = 0;
        foreach (var e in evtJ.EnumerateArray())
        {
            int ei = start + evC;
            if (ei < end)
            {
                var pe = pending[ei];
                string jsKind = e[0].GetString()!;
                total++;
                if (jsKind == "ev")
                {
                    if (pe.Kind != "ev:" + e[1].GetString())
                    { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}.evt{evC}] kind JS=ev:{e[1].GetString()} C#={pe.Kind}"); }
                    var xj = e[2]; var yj = e[3];
                    CbCheckN($"{tag}.evt{evC}.x", xj.ValueKind == JsonValueKind.Null ? null : xj.GetString()!, pe.X, "");
                    CbCheckN($"{tag}.evt{evC}.y", yj.ValueKind == JsonValueKind.Null ? null : yj.GetString()!, pe.Y, "");
                }
                else if (jsKind == "rise")
                {
                    if (pe.Kind != "rise")
                    { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}.evt{evC}] kind JS=rise C#={pe.Kind}"); }
                    CbCheckN($"{tag}.evt{evC}.x", e[1].GetString()!, pe.X, "");
                    CbCheckN($"{tag}.evt{evC}.y", e[2].GetString()!, pe.Y, "");
                }
                else
                {
                    if (pe.Kind != jsKind)
                    { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}.evt{evC}] kind JS={jsKind} C#={pe.Kind}"); }
                    else CbCheckI($"{tag}.evt{evC}.id", e[1].GetInt32(), pe.Id, "");
                }
            }
            evC++;
        }
    }

    void CbCheckBattles(string tag, JsonElement battlesJ, Dictionary<int, int> battles)
    {
        var exp = battlesJ.EnumerateArray().Select(e => (e[0].GetInt32(), e[1].GetInt32())).ToList();
        var act = battles.OrderBy(kv => kv.Key).Select(kv => (kv.Key, kv.Value)).ToList();
        CbCheckI($"{tag}.n", exp.Count, act.Count, "");
        for (int i = 0; i < Math.Min(exp.Count, act.Count); i++)
        {
            CbCheckI($"{tag}.bi{i}", exp[i].Item1, act[i].Item1, "");
            CbCheckI($"{tag}.exp{i}", exp[i].Item2, act[i].Item2, "");
        }
    }

    foreach (var c in cbd.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        string mode = c.GetProperty("mode").GetString()!;

        if (mode == "matrix")
        {
            foreach (var op in c.GetProperty("matrix").EnumerateArray())
            {
                string t = op.GetProperty("t").GetString()!;
                var fJ = op.GetProperty("f");
                var f = new double[fJ.GetArrayLength()];
                int fi = 0;
                foreach (var fj in fJ.EnumerateArray())
                    f[fi++] = BitConverter.UInt64BitsToDouble(CbLeHexToBits(fj.GetString()!));
                if (t == "acc")
                    CbCheckN($"cb.{name}.acc[{fi}]", op.GetProperty("p").GetString()!, WbNeuro.Acc(f), "");
                else if (t == "stance")
                    CbCheckI($"cb.{name}.stance[{fi}]", op.GetProperty("best").GetInt32(), WbNeuro.Stance(f), "");
                else if (t == "flight")
                    CbCheckI($"cb.{name}.flight[{fi}]", op.GetProperty("best").GetInt32(), WbNeuro.Flight(f, rl: true), "");
                else if (t == "flightbc")
                    CbCheckI($"cb.{name}.flightbc[{fi}]", op.GetProperty("best").GetInt32(), WbNeuro.Flight(f, rl: false), "");
            }
            continue;
        }

        var host = new WbCombatHost();
        var grid = new WbGridState();
        host.Terrain = CbGrid(cbd.GetProperty("terrainSpecs").EnumerateArray().First(t => t.GetProperty("name").GetString() == c.GetProperty("terrain").GetString()));
        CbSetupRaces(host, cbRaces);
        var items = new Dictionary<string, WbItemDef>();
        if (c.TryGetProperty("items", out var itemsJ) && itemsJ.ValueKind == JsonValueKind.Array)
            foreach (var it in itemsJ.EnumerateArray())
            {
                double NumOf(string k) { var v = it.GetProperty(k); return v.ValueKind == JsonValueKind.Null ? 0.0 : v.GetDouble(); }
                items[it.GetProperty("key").GetString()!] = new WbItemDef
                { Armor = NumOf("armor"), Crit = NumOf("crit"), Lifesteal = NumOf("lifesteal"), Thorns = NumOf("thorns"), Regen = NumOf("regen"), Ranged = NumOf("ranged"), SpeedMul = NumOf("speedMul") };
            }
        host.ItemDefOf = k => items.TryGetValue(k, out var d) ? d : null;
        host.TraitImmuneOf = t => cbTraitImmune.Contains(t);
        var envJ = c.GetProperty("env");
        var walls = new Dictionary<int, byte>();
        if (envJ.TryGetProperty("walls", out var wallsJ))
            foreach (var w in wallsJ.EnumerateArray()) walls[w.GetInt32()] = cbWallKind;
        host.BuildingAt = i => walls.TryGetValue(i, out var k) ? k : (byte)0;
        var bCiv = new Dictionary<int, int>();
        if (envJ.TryGetProperty("bIdx", out var bIdxJ))
        {
            var bldCivs = envJ.TryGetProperty("buildings", out var blJ)
                ? blJ.EnumerateArray().Select(b => b.TryGetProperty("civ", out var cv) ? cv.GetInt32() : -1).ToList()
                : new List<int>();
            foreach (var bi2 in bIdxJ.EnumerateArray())
            {
                int tile = bi2[0].GetInt32(), bpos = bi2[1].GetInt32();
                bCiv[tile] = bpos < bldCivs.Count ? bldCivs[bpos] : -1;
            }
        }
        host.BuildingCivAt = i => bCiv.TryGetValue(i, out var cv) ? cv : -1;
        var env2 = new WbMoveEnv
        {
            PanicDecay = cbPanicDecay, GrudgeDecay = cbGrudgeDecay, FireDamage = cbFire,
            PanicRout = cbPanicRout,
            LawsUndeadRise = envJ.TryGetProperty("lawsUndeadRise", out var lr2) && lr2.GetBoolean(),
            FxAmbience = envJ.TryGetProperty("ambience", out var am2) && am2.GetBoolean(),
            // —— M-U2c 战斗域 env（黄金 JSON env 回显——真值源） ——
            Season = envJ.TryGetProperty("season", out var se2) ? se2.GetInt32() : 0,
            BloodMoonTtl = envJ.TryGetProperty("bloodMoonTtl", out var bm2) ? bm2.GetDouble() : 0.0,
            EclipseTtl = envJ.TryGetProperty("eclipseTtl", out var ec2) ? ec2.GetDouble() : 0.0,
            IllumOk = envJ.TryGetProperty("moonIllum", out var mi2) && mi2.GetDouble() >= 0.95,
            DayPhase = envJ.GetProperty("dayPhase").GetDouble(),
            LawsZombieInfect = envJ.TryGetProperty("lawsZombie", out var lz) && lz.GetBoolean(),
            FxBlood = !envJ.TryGetProperty("fxBlood", out var fb) || fb.GetBoolean(),
            FxDmgNumbers = !envJ.TryGetProperty("fxDmgNumbers", out var fd) || fd.GetBoolean(),
            FxCorpses = !envJ.TryGetProperty("fxCorpses", out var fc) || fc.GetBoolean(),
            NeuroEnabled = envJ.TryGetProperty("neuro", out var nj) && nj.GetProperty("enabled").GetBoolean(),
            FlightModeRl = !envJ.TryGetProperty("neuro", out var nj2) || nj2.GetProperty("flightMode").GetString() == "rl",
        };

        var relWar2 = new Dictionary<string, double>();
        if (c.TryGetProperty("relWar", out var rwJ2) && rwJ2.ValueKind == JsonValueKind.Array)
            foreach (var r in rwJ2.EnumerateArray()) relWar2[r[0].GetString()!] = r[1].GetDouble();
        if (relWar2.Count > 0) host.AtWar = (a, b) =>
        {
            string key = a < b ? $"{a}-{b}" : $"{b}-{a}";
            return relWar2.TryGetValue(key, out var v) && v < -20.0;
        };

        var specs2 = c.GetProperty("units");
        int un3 = specs2.GetArrayLength();
        var st3 = new WbUnitsState(Math.Max(un3, 1));
        st3.LiveLen = un3;
        for (int i = 0; i < un3; i++) CbLoadUnit(st3, i, specs2[i]);
        st3.RngA = (uint)c.GetProperty("seed").GetInt32();

        int sn3 = 0;
        foreach (var o in c.GetProperty("out").EnumerateArray())
        {
            WbGrid.Rebuild(st3, grid);
            CbCheckBattles($"cb.{name}.s{sn3}.battles0", o.GetProperty("battles0"), host.ActiveBattles);
            int draw0b = st3.RngDraws;
            var usOut2 = o.GetProperty("units");
            var snaps = new CbSnap[un3];
            int[] evtStart3 = new int[un3 + 1];
            int[] fxStart3 = new int[un3 + 1];
            int[] bloodStart = new int[un3 + 1];
            int[] corpseStart = new int[un3 + 1];
            evtStart3[0] = host.PendingUpd.Count; fxStart3[0] = host.PendingFx.Count;
            bloodStart[0] = host.PendingBlood.Count; corpseStart[0] = host.PendingCorpse.Count;
            for (int i = 0; i < un3; i++)
            {
                if (st3.Dead[i])
                {
                    evtStart3[i + 1] = evtStart3[i]; fxStart3[i + 1] = fxStart3[i];
                    bloodStart[i + 1] = bloodStart[i]; corpseStart[i + 1] = corpseStart[i];
                    continue;
                }
                bool ended = WbUnits.UpdateUnitPre(st3, host, env2, i);
                if (!ended)
                {
                    try
                    {
                        var exit = WbUnits.UpdateUnitScan(st3, host, env2, grid, i);
                        if (exit == WbUnits.WbScanExit.ToTailPost)
                            host.PendingUpd.Add(new WbUpdEvent("tail", st3.Id[i], 0.0, 0.0));
                        if (exit != WbUnits.WbScanExit.Ended)
                            host.PendingUpd.Add(new WbUpdEvent("post", st3.Id[i], 0.0, 0.0));
                    }
                    catch (Exception ex)
                    {
                        throw new Exception($"[cb.{name}.s{sn3}.u{i}] id={st3.Id[i]} race={st3.Race[i]} civ={st3.Civ[i]} hp={st3.Hp[i]} x={st3.X[i]} y={st3.Y[i]} cd={st3.Cd[i]} fleeT={st3.FleeT[i]} panic={st3.Panic[i]}: {ex.Message}");
                    }
                }
                evtStart3[i + 1] = host.PendingUpd.Count; fxStart3[i + 1] = host.PendingFx.Count;
                bloodStart[i + 1] = host.PendingBlood.Count; corpseStart[i + 1] = host.PendingCorpse.Count;
                snaps[i] = CbSnapTake(st3, i);   // ⚠ 即时刻快照（JS perU = 该单位 updateUnit 后立即采——反击会改写攻方状态）
            }
            CbCheckI($"cb.{name}.s{sn3}.draws", o.GetProperty("draws").GetInt32(), st3.RngDraws - draw0b, "");
            for (int i = 0; i < un3; i++)
            {
                var uo = usOut2[i];
                if (uo.ValueKind != JsonValueKind.Object || !uo.TryGetProperty("age", out _))
                { CbCheckB($"cb.{name}.s{sn3}.u{i}.deadSkip", true, st3.Dead[i], ""); continue; }
                CbSnapCompare($"cb.{name}.s{sn3}.u{i}", uo, snaps[i]);
                CbCheckEvt($"cb.{name}.s{sn3}.u{i}", uo.GetProperty("evt"), host.PendingUpd, evtStart3[i], evtStart3[i + 1]);
                var fxJ2 = uo.GetProperty("fx");
                CbCheckI($"cb.{name}.s{sn3}.u{i}.fxN", fxJ2.GetArrayLength(), fxStart3[i + 1] - fxStart3[i], "");
                int fxC = 0;
                foreach (var fj2 in fxJ2.EnumerateArray())
                {
                    int fi2 = fxStart3[i] + fxC;
                    if (fi2 < fxStart3[i + 1])
                    {
                        var pf = host.PendingFx[fi2];
                        total++;
                        if (pf.Kind != fj2[0].GetString())
                        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[cb.{name}.s{sn3}.u{i}.fx{fxC}] kind JS={fj2[0].GetString()} C#={pf.Kind}"); }
                        CbCheckN($"cb.{name}.s{sn3}.u{i}.fx{fxC}.x", fj2[1].GetString()!, pf.X, "");
                        CbCheckN($"cb.{name}.s{sn3}.u{i}.fx{fxC}.y", fj2[2].GetString()!, pf.Y, "");
                        total++;
                        if (BitConverter.DoubleToUInt64Bits(pf.Ttl) != BitConverter.DoubleToUInt64Bits(fj2[3].GetDouble()))
                        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[cb.{name}.s{sn3}.u{i}.fx{fxC}.ttl] JS={fj2[3].GetDouble()} C#={pf.Ttl}"); }
                    }
                    fxC++;
                }
                var blJ = uo.GetProperty("blood");
                CbCheckI($"cb.{name}.s{sn3}.u{i}.bloodN", blJ.GetArrayLength(), bloodStart[i + 1] - bloodStart[i], "");
                int blC = 0;
                foreach (var bj in blJ.EnumerateArray())
                {
                    int bi2 = bloodStart[i] + blC;
                    if (bi2 < bloodStart[i + 1])
                    {
                        var pb = host.PendingBlood[bi2];
                        CbCheckN($"cb.{name}.s{sn3}.u{i}.blood{blC}.x", bj[0].GetString()!, pb.X, "");
                        CbCheckN($"cb.{name}.s{sn3}.u{i}.blood{blC}.y", bj[1].GetString()!, pb.Y, "");
                        CbCheckI($"cb.{name}.s{sn3}.u{i}.blood{blC}.seed", bj[2].GetInt32(), pb.Seed, "");
                        CbCheckB($"cb.{name}.s{sn3}.u{i}.blood{blC}.big", bj[3].GetInt32() == 1, pb.Big, "");
                    }
                    blC++;
                }
                var cpJ = uo.GetProperty("corpse");
                CbCheckI($"cb.{name}.s{sn3}.u{i}.corpseN", cpJ.GetArrayLength(), corpseStart[i + 1] - corpseStart[i], "");
                int cpC = 0;
                foreach (var cj in cpJ.EnumerateArray())
                {
                    int ci2 = corpseStart[i] + cpC;
                    if (ci2 < corpseStart[i + 1])
                    {
                        var pc = host.PendingCorpse[ci2];
                        CbCheckN($"cb.{name}.s{sn3}.u{i}.corpse{cpC}.x", cj[0].GetString()!, pc.X, "");
                        CbCheckN($"cb.{name}.s{sn3}.u{i}.corpse{cpC}.y", cj[1].GetString()!, pc.Y, "");
                        CbCheckB($"cb.{name}.s{sn3}.u{i}.corpse{cpC}.stone", cj[2].GetInt32() == 1, pc.Stone, "");
                        CbCheckB($"cb.{name}.s{sn3}.u{i}.corpse{cpC}.undead", cj[3].GetInt32() == 1, pc.Undead, "");
                    }
                    cpC++;
                }
            }
            // 全量快照（目击恐慌/血仇外效变异对账）
            var allJ = o.GetProperty("all");
            for (int i = 0; i < un3; i++) CbSnapCompare($"cb.{name}.s{sn3}.all{i}", allJ[i], CbSnapTake(st3, i));
            CbCheckBattles($"cb.{name}.s{sn3}.battles", o.GetProperty("battles"), host.ActiveBattles);
            host.TickCount++;
            sn3++;
        }
        // 终态：final（含 race——尸变异位）+ LUT + wildCount + dragons + rng 尾抽
        var finJ2 = c.GetProperty("final");
        for (int i = 0; i < un3; i++) CbSnapCompare($"cb.{name}.fin.u{i}", finJ2[i], CbSnapTake(st3, i));
        // LUT
        var lutJ2 = c.GetProperty("lut");
        CbCheckI($"cb.{name}.lut.size", lutJ2.GetProperty("size").GetInt32(), host.EnemyLut.Count, "");
        {
            var keys2 = host.EnemyLut.Keys.OrderBy(k => k).ToList();
            int li = 0;
            foreach (var e in lutJ2.GetProperty("entries").EnumerateArray())
            {
                if (li < keys2.Count)
                {
                    CbCheckI($"cb.{name}.lut.k{li}", e[0].GetInt64(), keys2[li], "");
                    CbCheckB($"cb.{name}.lut.v{li}", e[1].GetBoolean(), host.EnemyLut[keys2[li]], "");
                }
                li++;
            }
        }
        // wildCount
        var wildJ = c.GetProperty("wild");
        CbCheckI($"cb.{name}.wildN", wildJ.GetArrayLength(), host.WildCount.Count, "");
        {
            var wkeys = host.WildCount.Keys.OrderBy(k => k).ToList();
            int wi = 0;
            foreach (var e in wildJ.EnumerateArray())
            {
                if (wi < wkeys.Count)
                {
                    CbCheckI($"cb.{name}.wild.r{wi}", e[0].GetInt32(), (int)wkeys[wi], "");
                    CbCheckI($"cb.{name}.wild.n{wi}", e[1].GetInt32(), host.WildCount[wkeys[wi]], "");
                }
                wi++;
            }
        }
        CbCheckI($"cb.{name}.dragons", c.GetProperty("dragons").GetInt32(), host.DragonsSlain, "");
        var cbtail = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
        for (int i = 0; i < 4 && cbtail.MoveNext(); i++)
            CbCheckN($"cb.{name}.rngTail[{i}]", cbtail.Current.GetString()!, WbRng.Next(ref st3.RngA), "");
    }
}

// ---------- 13) 收尸 + 地面物品闭环（M-U2d 切片 1：unitsReap/dropMeat/dropItem/tryPickup/swap-pop，Task 145） ----------
var rpPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-reap.json");
if (!File.Exists(rpPath)) rpPath = "golden-units-reap.json";
if (File.Exists(rpPath))
{
    var rpd = JsonDocument.Parse(File.ReadAllText(rpPath)).RootElement;
    int rpW = rpd.GetProperty("w").GetInt32();
    var rpEp = rpd.GetProperty("ep");
    double rpPanicDecay = rpEp.GetProperty("panicDecay").GetDouble();
    double rpGrudgeDecay = rpEp.GetProperty("grudgeDecay").GetDouble();
    double rpFire = rpEp.GetProperty("fireDamage").GetDouble();
    double rpPanicRout = rpEp.GetProperty("panicRout").GetDouble();

    static ulong RpLeHexToBits(string h)
    {
        ulong v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | Convert.ToUInt64(h.Substring(i * 2, 2), 16);
        return v;
    }
    void RpLoadUnit(WbUnitsState st, int i, JsonElement u)
    {
        double NumOr(string k, double dflt)
        {
            if (!u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null) return dflt;
            return v.GetDouble();
        }
        string? StrOr(string k) =>
            !u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null ? null : v.GetString();
        st.Id[i] = u.TryGetProperty("id", out var idJ) ? idJ.GetInt32() : i + 1;
        st.Race[i] = (uint)u.GetProperty("race").GetInt32();
        st.X[i] = u.GetProperty("x").GetDouble(); st.Y[i] = u.GetProperty("y").GetDouble();
        st.Tx[i] = NumOr("tx", st.X[i]); st.Ty[i] = NumOr("ty", st.Y[i]);
        st.Age[i] = NumOr("age", 20.0); st.MaxAge[i] = NumOr("maxAge", 55.0);
        st.Hp[i] = NumOr("hp", 100.0); st.MaxHp[i] = NumOr("maxHp", 100.0);
        st.Dmg[i] = NumOr("dmg", 0.0);
        st.Kills[i] = (int)NumOr("kills", 0.0);
        st.Hurt[i] = NumOr("hurt", double.NaN);
        st.Cd[i] = NumOr("cd", 0.0); st.Atk[i] = NumOr("atk", 0.0);
        st.Chill[i] = NumOr("chill", double.NaN);
        st.FleeT[i] = NumOr("fleeT", 0.0); st.Bless[i] = NumOr("bless", 0.0);
        st.Curse[i] = NumOr("curse", 0.0); st.Fert[i] = NumOr("fert", 0.0); st.Detour[i] = NumOr("detour", 0.0);
        st.Panic[i] = NumOr("panic", double.NaN);
        if (u.TryGetProperty("gids", out var gj) && gj.ValueKind == JsonValueKind.Array)
        {
            var gl = new List<int>(); foreach (var g0 in gj.EnumerateArray()) gl.Add(g0.GetInt32());
            st.GIds[i] = gl;
            var vl = new List<double>();
            if (u.TryGetProperty("gval", out var vj) && vj.ValueKind == JsonValueKind.Array)
                foreach (var v0 in vj.EnumerateArray()) vl.Add(v0.GetDouble());
            st.GVal[i] = vl;
        }
        st.Food[i] = NumOr("food", double.NaN);
        st.Stk[i] = (int)NumOr("stk", 0.0);
        st.Sxk[i] = NumOr("sxk", double.NaN); st.Syk[i] = NumOr("syk", double.NaN);
        st.Infected[i] = u.TryGetProperty("infected", out var ij) && ij.ValueKind == JsonValueKind.True;
        st.Grab[i] = NumOr("grab", 0.0);
        st.Boat[i] = (byte)NumOr("boat", 0); st.BoatTtl[i] = (int)NumOr("boatTTL", 0);
        st.Civ[i] = (int)NumOr("civ", -1); st.Job[i] = (int)NumOr("job", 0);
        st.Speed[i] = NumOr("speed", 0.1);
        st.Caravan[i] = (int)NumOr("caravan", 0);
        if (u.TryGetProperty("dead", out var dj) && dj.ValueKind == JsonValueKind.True) st.Dead[i] = true;
        st.Trait[i] = StrOr("trait");
        st.Wep[i] = StrOr("wep"); st.Arm[i] = StrOr("arm"); st.Hlm[i] = StrOr("hlm");
        st.Shd[i] = StrOr("shd"); st.Bts[i] = StrOr("bts"); st.RngE[i] = StrOr("rng"); st.Amu[i] = StrOr("amu");
        st.King[i] = u.TryGetProperty("king", out var kj) && kj.ValueKind == JsonValueKind.True;
        st.Fam[i] = (int)NumOr("fam", -1.0); st.Army[i] = (int)NumOr("army", -1.0);
        st.ThrT[i] = NumOr("thrT", double.NaN); st.GrabTtl[i] = NumOr("grabTTL", double.NaN);
    }
    void RpCheckN(string tag, string? jsStr, double actual, string loc)
    {
        total++;
        ulong jsBits = 0; bool jsIsNaN = false;
        if (jsStr != null)
        {
            jsBits = RpLeHexToBits(jsStr);
            jsIsNaN = (jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0;
        }
        bool cNaN = double.IsNaN(actual);
        bool jNaN = jsStr == null || jsIsNaN;
        if (cNaN && jNaN) return;
        if (cNaN && !jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#=NaN"); return; }
        if (!cNaN && jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr ?? "undefined"}(NaN) C#={actual:R}"); return; }
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#={actual:R}"); }
    }
    void RpCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void RpCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void RpCheckS(string tag, string? expect, string? actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }

    byte[] RpGrid(JsonElement spec)
    {
        var g = new byte[rpW * 160];
        Array.Fill(g, (byte)spec.GetProperty("def").GetInt32());
        foreach (var p in spec.GetProperty("patches").EnumerateArray())
        {
            int x1 = p[0].GetInt32(), y1 = p[1].GetInt32(), x2 = p[2].GetInt32(), y2 = p[3].GetInt32(), t = p[4].GetInt32();
            for (int y = y1; y < y2; y++) for (int x = x1; x < x2; x++) g[y * rpW + x] = (byte)t;
        }
        return g;
    }

    // 快照容器复用 CbSnap（字段超集——rp 快照含 name/id）
    void RpSnapTake(WbUnitsState st, int i, CbSnap sp)
    {
        sp.Race = st.Race[i]; sp.Age = st.Age[i]; sp.Hp = st.Hp[i]; sp.Hurt = st.Hurt[i]; sp.Cd = st.Cd[i]; sp.Atk = st.Atk[i];
        sp.FleeT = st.FleeT[i]; sp.Bless = st.Bless[i]; sp.Curse = st.Curse[i]; sp.Fert = st.Fert[i]; sp.Detour = st.Detour[i];
        sp.Panic = st.Panic[i]; sp.Food = st.Food[i]; sp.Stk = st.Stk[i]; sp.Infected = st.Infected[i]; sp.Dead = st.Dead[i];
        sp.King = st.King[i]; sp.Fam = st.Fam[i]; sp.Army = st.Army[i]; sp.Trait = st.Trait[i]; sp.Wep = st.Wep[i]; sp.Arm = st.Arm[i];
        sp.ThrT = st.ThrT[i]; sp.Caravan = st.Caravan[i]; sp.Dmg = st.Dmg[i]; sp.Kills = st.Kills[i];
        sp.X = st.X[i]; sp.Y = st.Y[i]; sp.Tx = st.Tx[i]; sp.Ty = st.Ty[i];
        sp.GIds = st.GIds[i] == null ? null : new List<int>(st.GIds[i]);
        sp.GVal = st.GVal[i] == null ? null : new List<double>(st.GVal[i]);
        sp.RpId = st.Id[i];   // name 不入 C#（引擎名字域切片 2）——对账按 id 对位
    }
    void RpSnapCompare(string tag, JsonElement uo, CbSnap sp)
    {
        RpCheckI($"{tag}.id", uo.GetProperty("id").GetInt32(), sp.RpId, "");
        RpCheckI($"{tag}.race", uo.GetProperty("race").GetInt32(), (int)sp.Race, "");
        RpCheckN($"{tag}.age", uo.GetProperty("age").GetString()!, sp.Age, "");
        RpCheckN($"{tag}.hp", uo.GetProperty("hp").GetString()!, sp.Hp, "");
        RpCheckN($"{tag}.cd", uo.GetProperty("cd").GetString()!, sp.Cd, "");
        RpCheckN($"{tag}.fleeT", uo.GetProperty("fleeT").GetString()!, sp.FleeT, "");
        RpCheckN($"{tag}.panic", uo.GetProperty("panic").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("panic").GetString()!, sp.Panic, "");
        RpCheckN($"{tag}.food", uo.GetProperty("food").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("food").GetString()!, sp.Food, "");
        RpCheckB($"{tag}.infected", uo.GetProperty("infected").GetBoolean(), sp.Infected, "");
        RpCheckB($"{tag}.dead", uo.GetProperty("dead").GetBoolean(), sp.Dead, "");
        RpCheckI($"{tag}.fam", uo.GetProperty("fam").ValueKind == JsonValueKind.Null ? -1 : uo.GetProperty("fam").GetInt32(), sp.Fam, "");
        RpCheckS($"{tag}.wep", uo.GetProperty("wep").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("wep").GetString()!, sp.Wep, "");
        RpCheckS($"{tag}.arm", uo.GetProperty("arm").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("arm").GetString()!, sp.Arm, "");
        RpCheckN($"{tag}.dmg", uo.GetProperty("dmg").GetString()!, sp.Dmg, "");
        RpCheckN($"{tag}.x", uo.GetProperty("x").GetString()!, sp.X, "");
        RpCheckN($"{tag}.y", uo.GetProperty("y").GetString()!, sp.Y, "");
        RpCheckN($"{tag}.tx", uo.GetProperty("tx").GetString()!, sp.Tx, "");
        RpCheckN($"{tag}.ty", uo.GetProperty("ty").GetString()!, sp.Ty, "");
        var gidsJ = uo.GetProperty("gids");
        RpCheckB($"{tag}.gidsNull", gidsJ.ValueKind == JsonValueKind.Null, sp.GIds == null, "");
        if (gidsJ.ValueKind == JsonValueKind.String)
        {
            var expect = gidsJ.GetString()!.Split(',').Select(int.Parse).ToList();
            RpCheckI($"{tag}.gidsN", expect.Count, sp.GIds?.Count ?? -1, "");
            for (int g = 0; g < expect.Count; g++)
                RpCheckI($"{tag}.gids[{g}]", expect[g], g < (sp.GIds?.Count ?? 0) ? sp.GIds![g] : -1, "");
        }
    }
    void RpCheckItems(string tag, JsonElement itemsJ, List<WbGroundItem> items)
    {
        RpCheckI($"{tag}.n", itemsJ.GetArrayLength(), items.Count, "");
        int i = 0;
        foreach (var it in itemsJ.EnumerateArray())
        {
            if (i < items.Count)
            {
                RpCheckI($"{tag}[{i}].id", it.GetProperty("id").GetInt32(), items[i].Id, "");
                RpCheckS($"{tag}[{i}].kind", it.GetProperty("kind").GetString()!, items[i].Kind, "");
                RpCheckN($"{tag}[{i}].x", it.GetProperty("x").GetString()!, items[i].X, "");
                RpCheckN($"{tag}[{i}].y", it.GetProperty("y").GetString()!, items[i].Y, "");
            }
            i++;
        }
    }

    foreach (var c in rpd.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        var host = new WbCombatHost();
        var grid = new WbGridState();
        host.Terrain = RpGrid(rpd.GetProperty("terrainSpecs").EnumerateArray().First(t => t.GetProperty("name").GetString() == c.GetProperty("terrain").GetString()));
        foreach (var rp in rpd.GetProperty("races").EnumerateObject())
        {
            int rid = int.Parse(rp.Name);
            host.RaceFlags[rid] = (byte)rp.Value.GetProperty("flags").GetInt32();
            host.Tbf[rid * 2] = (byte)rp.Value.GetProperty("tbf0").GetInt32();
            host.Tbf[rid * 2 + 1] = (byte)rp.Value.GetProperty("tbf1").GetInt32();
            var reach = rp.Value.GetProperty("reach");
            host.RaceReach[rid] = reach.ValueKind == JsonValueKind.Null ? double.NaN : reach.GetDouble();
            host.RaceSpeed[rid] = rp.Value.GetProperty("speed").GetDouble();
        }
        host.ItemDefOf = k => rpd.GetProperty("itemDefs").TryGetProperty(k, out var d)
            ? new WbItemDef
            {
                Armor = d.GetProperty("armor").GetDouble(), Crit = d.GetProperty("crit").GetDouble(),
                Lifesteal = d.GetProperty("lifesteal").GetDouble(), Thorns = d.GetProperty("thorns").GetDouble(),
                Regen = d.GetProperty("regen").GetDouble(), Ranged = d.GetProperty("ranged").GetDouble(),
                SpeedMul = d.GetProperty("speedMul").GetDouble(),
                Rank = d.GetProperty("rank").GetInt32(),
                Slot = d.GetProperty("slot").GetString()! switch { "wep" => 0, "arm" => 1, "hlm" => 2, "shd" => 3, "bts" => 4, "rng" => 5, _ => 6 },
                Dmg = d.GetProperty("dmg").GetDouble(), Hp = d.GetProperty("hp").GetDouble(),
                Rarity = d.GetProperty("rarity").GetDouble(), Name = d.GetProperty("name").GetString(),
            }
            : null;
        var poolKeys = new List<string>(); var poolR = new List<int>();
        foreach (var it in rpd.GetProperty("rollPool").EnumerateArray())
        {
            poolKeys.Add(it.GetProperty("key").GetString()!);
            poolR.Add(it.GetProperty("rarity").GetInt32());
        }
        host.RollPoolKeys = poolKeys.ToArray();
        host.RollPoolRarity = poolR.ToArray();
        host.RarityW = rpd.GetProperty("rarityW").EnumerateArray().Select(x => x.GetDouble()).ToArray();
        host.RollChestTier = tier => tier switch { "chest2" => 1, "chest3" => 3, _ => 0 };
        var envJ = c.GetProperty("env");
        var env3 = new WbMoveEnv
        {
            PanicDecay = rpPanicDecay, GrudgeDecay = rpGrudgeDecay, FireDamage = rpFire, PanicRout = rpPanicRout,
            FxAmbience = envJ.TryGetProperty("ambience", out var am3) && am3.GetBoolean(),
            Season = envJ.TryGetProperty("season", out var se3) ? se3.GetInt32() : 0,
            BloodMoonTtl = envJ.TryGetProperty("bloodMoonTtl", out var bm3) ? bm3.GetDouble() : 0.0,
            EclipseTtl = envJ.TryGetProperty("eclipseTtl", out var ec3) ? ec3.GetDouble() : 0.0,
            DayPhase = envJ.GetProperty("dayPhase").GetDouble(),
            LawsZombieInfect = envJ.TryGetProperty("lawsZombie", out var lz3) && lz3.GetBoolean(),
            LawsZombieVirus = !envJ.TryGetProperty("lawsZombieVirus", out var zv3) || zv3.GetBoolean(),
            LawsReproduction = envJ.TryGetProperty("lawsReproduction", out var lr3) && lr3.GetBoolean(),
            FxBlood = !envJ.TryGetProperty("fxBlood", out var fb3) || fb3.GetBoolean(),
            FxDmgNumbers = !envJ.TryGetProperty("fxDmgNumbers", out var fd3) || fd3.GetBoolean(),
            FxCorpses = !envJ.TryGetProperty("fxCorpses", out var fc3) || fc3.GetBoolean(),
            NeuroEnabled = envJ.TryGetProperty("neuro", out var nj3) && nj3.GetProperty("enabled").GetBoolean(),
            FlightModeRl = !envJ.TryGetProperty("neuro", out var nj4) || nj4.GetProperty("flightMode").GetString() == "rl",
        };
        if (envJ.TryGetProperty("items", out var initItems))
            foreach (var it in initItems.EnumerateArray())
                host.Items.Add(new WbGroundItem { Id = it.GetProperty("id").GetInt32(), Kind = it.GetProperty("kind").GetString()!, X = it.GetProperty("x").GetDouble(), Y = it.GetProperty("y").GetDouble() });
        host.ItemSeq = envJ.TryGetProperty("itemSeq", out var isq) ? isq.GetInt32() : 1;
        if (envJ.TryGetProperty("families", out var initFam))
            foreach (var f in initFam.EnumerateArray())
            {
                var fo = f[1];
                host.Families[fo.GetProperty("id").GetInt32()] = new WbFamily
                { Id = fo.GetProperty("id").GetInt32(), Name = fo.GetProperty("name").GetString() ?? "", Members = fo.GetProperty("members").GetInt32(), Kills = fo.GetProperty("kills").GetInt32(), Heroes = fo.GetProperty("heroes").GetInt32() };
            }
        host.FamilySeq = envJ.TryGetProperty("familySeq", out var fsq) ? fsq.GetInt32() : 1;

        var specs3 = c.GetProperty("units");
        int un4 = specs3.GetArrayLength();
        var st4 = new WbUnitsState(Math.Max(un4, 1));
        st4.LiveLen = un4;
        for (int i = 0; i < un4; i++) RpLoadUnit(st4, i, specs3[i]);
        st4.RngA = (uint)c.GetProperty("seed").GetInt32();
        // wildCount 初始（gen 按在世野生单位注入）
        for (int i = 0; i < un4; i++)
            if (!st4.Dead[i])
            {
                byte fl = host.RaceFlags[st4.Race[i]];
                if ((fl & WbConstants.FCiv) == 0) host.BumpWild(st4.Race[i], 1);
            }

        var snaps4 = new CbSnap[un4];
        int sn4 = 0;
        foreach (var o in c.GetProperty("out").EnumerateArray())
        {
            WbGrid.Rebuild(st4, grid);
            int draw0d = st4.RngDraws;
            var usOut3 = o.GetProperty("units");
            int unN = usOut3.GetArrayLength();   // ⚠ swap-pop 后数组长度逐步收缩——按步重导出（= st4.LiveLen）
            RpCheckI($"rp.{name}.s{sn4}.liveN", unN, st4.LiveLen, "");
            int[] evtStart4 = new int[unN + 1];
            int[] fxStart4 = new int[unN + 1];
            int[] bloodStart4 = new int[unN + 1];
            int[] corpseStart4 = new int[unN + 1];
            var snapsN = new CbSnap[unN];
            evtStart4[0] = host.PendingUpd.Count; fxStart4[0] = host.PendingFx.Count;
            bloodStart4[0] = host.PendingBlood.Count; corpseStart4[0] = host.PendingCorpse.Count;
            for (int i = 0; i < unN; i++)
            {
                if (st4.Dead[i])
                {
                    evtStart4[i + 1] = evtStart4[i]; fxStart4[i + 1] = fxStart4[i];
                    bloodStart4[i + 1] = bloodStart4[i]; corpseStart4[i + 1] = corpseStart4[i];
                    snapsN[i] = new CbSnap();
                    RpSnapTake(st4, i, snapsN[i]);
                    continue;
                }
                bool ended4 = WbUnits.UpdateUnitPre(st4, host, env3, i);
                if (!ended4)
                {
                    try
                    {
                        var exit4 = WbUnits.UpdateUnitScan(st4, host, env3, grid, i);
                        if (exit4 == WbUnits.WbScanExit.ToTailPost)
                            host.PendingUpd.Add(new WbUpdEvent("tail", st4.Id[i], 0.0, 0.0));
                        if (exit4 != WbUnits.WbScanExit.Ended)
                            WbUnits.UpdateUnitPost(st4, host, env3, i);   // 真实现 post（tryPickup；repro 契约关闭）
                    }
                    catch (Exception ex)
                    {
                        throw new Exception($"[rp.{name}.s{sn4}.u{i}] id={st4.Id[i]} hp={st4.Hp[i]}: {ex.Message}");
                    }
                }
                evtStart4[i + 1] = host.PendingUpd.Count; fxStart4[i + 1] = host.PendingFx.Count;
                bloodStart4[i + 1] = host.PendingBlood.Count; corpseStart4[i + 1] = host.PendingCorpse.Count;
                snapsN[i] = new CbSnap();
                RpSnapTake(st4, i, snapsN[i]);   // 即时刻快照（reap 前）
            }
            // 步末 all 快照（⚠ reap 前——gen 语义：含死单位原槽序）
            var allJ3 = o.GetProperty("all");
            RpCheckI($"rp.{name}.s{sn4}.aliveN", allJ3.GetArrayLength(), st4.LiveLen, "");
            for (int i = 0; i < st4.LiveLen; i++)
            {
                var sp2 = new CbSnap(); RpSnapTake(st4, i, sp2);
                RpSnapCompare($"rp.{name}.s{sn4}.all{i}", allJ3[i], sp2);
            }
            // —— 收尸（真实现——含 swap-pop 摘除） ——
            WbUnits.Reap(st4, host, env3, grid);
            RpCheckI($"rp.{name}.s{sn4}.draws", o.GetProperty("draws").GetInt32(), st4.RngDraws - draw0d, "");
            for (int i = 0; i < unN; i++)
            {
                var uo = usOut3[i];
                if (uo.ValueKind != JsonValueKind.Object || !uo.TryGetProperty("age", out _))
                { RpCheckB($"rp.{name}.s{sn4}.u{i}.deadSkip", true, snapsN[i].Dead, ""); continue; }
                RpSnapCompare($"rp.{name}.s{sn4}.u{i}", uo, snapsN[i]);
                var evtJ3 = uo.GetProperty("evt");
                RpCheckI($"rp.{name}.s{sn4}.u{i}.evtN", evtJ3.GetArrayLength(), evtStart4[i + 1] - evtStart4[i], "");
                int evC3 = 0;
                foreach (var e in evtJ3.EnumerateArray())
                {
                    int ei = evtStart4[i] + evC3;
                    if (ei < evtStart4[i + 1])
                    {
                        var pe = host.PendingUpd[ei];
                        string jsKind = e[0].GetString()!;
                        total++;
                        if (jsKind == "ev")
                        {
                            if (pe.Kind != "ev:" + e[1].GetString())
                            { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rp.{name}.s{sn4}.u{i}.evt{evC3}] kind JS=ev:{e[1].GetString()} C#={pe.Kind}"); }
                            var xj3 = e[2]; var yj3 = e[3];
                            RpCheckN($"rp.{name}.s{sn4}.u{i}.evt{evC3}.x", xj3.ValueKind == JsonValueKind.Null ? null : xj3.GetString()!, pe.X, "");
                            RpCheckN($"rp.{name}.s{sn4}.u{i}.evt{evC3}.y", yj3.ValueKind == JsonValueKind.Null ? null : yj3.GetString()!, pe.Y, "");
                        }
                        else if (jsKind == "rise")
                        {
                            if (pe.Kind != "rise")
                            { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rp.{name}.s{sn4}.u{i}.evt{evC3}] kind JS=rise C#={pe.Kind}"); }
                            RpCheckN($"rp.{name}.s{sn4}.u{i}.evt{evC3}.x", e[1].GetString()!, pe.X, "");
                            RpCheckN($"rp.{name}.s{sn4}.u{i}.evt{evC3}.y", e[2].GetString()!, pe.Y, "");
                        }
                        else
                        {
                            if (pe.Kind != jsKind)
                            { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rp.{name}.s{sn4}.u{i}.evt{evC3}] kind JS={jsKind} C#={pe.Kind}"); }
                            else RpCheckI($"rp.{name}.s{sn4}.u{i}.evt{evC3}.id", e[1].GetInt32(), pe.Id, "");
                        }
                    }
                    evC3++;
                }
                var fxJ3 = uo.GetProperty("fx");
                RpCheckI($"rp.{name}.s{sn4}.u{i}.fxN", fxJ3.GetArrayLength(), fxStart4[i + 1] - fxStart4[i], "");
                int fxC3 = 0;
                foreach (var fj3 in fxJ3.EnumerateArray())
                {
                    int fi3 = fxStart4[i] + fxC3;
                    if (fi3 < fxStart4[i + 1])
                    {
                        var pf = host.PendingFx[fi3];
                        total++;
                        if (pf.Kind != fj3[0].GetString())
                        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rp.{name}.s{sn4}.u{i}.fx{fxC3}] kind JS={fj3[0].GetString()} C#={pf.Kind}"); }
                        RpCheckN($"rp.{name}.s{sn4}.u{i}.fx{fxC3}.x", fj3[1].GetString()!, pf.X, "");
                        RpCheckN($"rp.{name}.s{sn4}.u{i}.fx{fxC3}.y", fj3[2].GetString()!, pf.Y, "");
                        total++;
                        if (BitConverter.DoubleToUInt64Bits(pf.Ttl) != BitConverter.DoubleToUInt64Bits(fj3[3].GetDouble()))
                        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rp.{name}.s{sn4}.u{i}.fx{fxC3}.ttl] JS={fj3[3].GetDouble()} C#={pf.Ttl}"); }
                    }
                    fxC3++;
                }
                var blJ3 = uo.GetProperty("blood");
                RpCheckI($"rp.{name}.s{sn4}.u{i}.bloodN", blJ3.GetArrayLength(), bloodStart4[i + 1] - bloodStart4[i], "");
                var cpJ3 = uo.GetProperty("corpse");
                RpCheckI($"rp.{name}.s{sn4}.u{i}.corpseN", cpJ3.GetArrayLength(), corpseStart4[i + 1] - corpseStart4[i], "");
            }
            // reap fx + items + battles（all 已在 reap 前比对）
            var fxTail = o.GetProperty("fx");
            {
                int fxBase = fxStart4[unN];
                RpCheckI($"rp.{name}.s{sn4}.reapFxN", fxTail.GetArrayLength(), host.PendingFx.Count - fxBase, "");
                int rfx = 0;
                foreach (var fj4 in fxTail.EnumerateArray())
                {
                    int fi4 = fxBase + rfx;
                    if (fi4 < host.PendingFx.Count)
                    {
                        var pf = host.PendingFx[fi4];
                        total++;
                        if (pf.Kind != fj4[0].GetString())
                        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rp.{name}.s{sn4}.reapFx{rfx}] kind JS={fj4[0].GetString()} C#={pf.Kind}"); }
                        RpCheckN($"rp.{name}.s{sn4}.reapFx{rfx}.x", fj4[1].GetString()!, pf.X, "");
                        RpCheckN($"rp.{name}.s{sn4}.reapFx{rfx}.y", fj4[2].GetString()!, pf.Y, "");
                    }
                    rfx++;
                }
            }
            RpCheckItems($"rp.{name}.s{sn4}.items", o.GetProperty("items"), host.Items);
            sn4++;
        }
        // 终态：final（swap-pop 后数组序）+ items + wild + families + itemSeq + rngTail
        var finJ3 = c.GetProperty("final");
        RpCheckI($"rp.{name}.finalN", finJ3.GetArrayLength(), st4.LiveLen, "");
        for (int i = 0; i < Math.Min(finJ3.GetArrayLength(), st4.LiveLen); i++)
        {
            var sp3 = new CbSnap(); RpSnapTake(st4, i, sp3);
            RpSnapCompare($"rp.{name}.fin.u{i}", finJ3[i], sp3);
        }
        RpCheckItems($"rp.{name}.items", c.GetProperty("items"), host.Items);
        var wildJ3 = c.GetProperty("wild");
        RpCheckI($"rp.{name}.wildN", wildJ3.GetArrayLength(), host.WildCount.Count, "");
        {
            var wkeys3 = host.WildCount.Keys.OrderBy(k => k).ToList();
            int wi3 = 0;
            foreach (var e in wildJ3.EnumerateArray())
            {
                if (wi3 < wkeys3.Count)
                {
                    RpCheckI($"rp.{name}.wild.r{wi3}", e[0].GetInt32(), (int)wkeys3[wi3], "");
                    RpCheckI($"rp.{name}.wild.n{wi3}", e[1].GetInt32(), host.WildCount[wkeys3[wi3]], "");
                }
                wi3++;
            }
        }
        var famJ = c.GetProperty("families");
        {
            var fkeys = host.Families.Keys.OrderBy(k => k).ToList();
            RpCheckI($"rp.{name}.famN", famJ.GetArrayLength(), fkeys.Count, "");
            int fi5 = 0;
            foreach (var e in famJ.EnumerateArray())
            {
                if (fi5 < fkeys.Count)
                {
                    var fe = host.Families[fkeys[fi5]];
                    RpCheckI($"rp.{name}.fam{fi5}.id", e.GetProperty("id").GetInt32(), fe.Id, "");
                    RpCheckI($"rp.{name}.fam{fi5}.members", e.GetProperty("members").GetInt32(), fe.Members, "");
                    RpCheckS($"rp.{name}.fam{fi5}.name", e.GetProperty("name").GetString()!, fe.Name, "");
                }
                fi5++;
            }
        }
        RpCheckI($"rp.{name}.itemSeq", c.GetProperty("itemSeq").GetInt32(), host.ItemSeq, "");
        var rptail = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
        for (int i = 0; i < 4 && rptail.MoveNext(); i++)
            RpCheckN($"rp.{name}.rngTail[{i}]", rptail.Current.GetString()!, WbRng.Next(ref st4.RngA), "");
    }
}

// ---------- 14) 繁衍全链 + spawnUnit（M-U2d 切片 2：TryRepro/childGene/tryEmergentTrait/
//                inventTrait/spawnUnit/newFamily/uniqueName/wildCapOf/baseGene，Task 146） ----------
var rbPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-repro.json");
if (!File.Exists(rbPath)) rbPath = "golden-units-repro.json";
if (File.Exists(rbPath))
{
    var rbd = JsonDocument.Parse(File.ReadAllText(rbPath)).RootElement;
    int rbW = rbd.GetProperty("w").GetInt32();
    var rbEp = rbd.GetProperty("ep");
    double rbPanicDecay = rbEp.GetProperty("panicDecay").GetDouble();
    double rbGrudgeDecay = rbEp.GetProperty("grudgeDecay").GetDouble();
    double rbFire = rbEp.GetProperty("fireDamage").GetDouble();
    double rbPanicRout = rbEp.GetProperty("panicRout").GetDouble();
    double rbReproMul = rbEp.GetProperty("reproMul").GetDouble();
    double rbMutationRate = rbEp.GetProperty("mutationRate").GetDouble();

    static ulong RbLeHexToBits(string h)
    {
        ulong v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | Convert.ToUInt64(h.Substring(i * 2, 2), 16);
        return v;
    }
    void RbLoadUnit(WbUnitsState st, int i, JsonElement u)
    {
        double NumOr(string k, double dflt)
        {
            if (!u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null) return dflt;
            return v.GetDouble();
        }
        string? StrOr(string k) =>
            !u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null ? null : v.GetString();
        st.Id[i] = u.TryGetProperty("id", out var idJ) ? idJ.GetInt32() : i + 1;
        st.Race[i] = (uint)u.GetProperty("race").GetInt32();
        st.X[i] = u.GetProperty("x").GetDouble(); st.Y[i] = u.GetProperty("y").GetDouble();
        st.Tx[i] = NumOr("tx", st.X[i]); st.Ty[i] = NumOr("ty", st.Y[i]);
        st.Age[i] = NumOr("age", 20.0); st.MaxAge[i] = NumOr("maxAge", 55.0);
        st.Hp[i] = NumOr("hp", 100.0); st.MaxHp[i] = NumOr("maxHp", 100.0);
        st.Dmg[i] = NumOr("dmg", 0.0);
        st.Kills[i] = (int)NumOr("kills", 0.0);
        st.Hurt[i] = NumOr("hurt", double.NaN);
        st.Cd[i] = NumOr("cd", 0.0); st.Atk[i] = NumOr("atk", 0.0);
        st.Chill[i] = NumOr("chill", double.NaN);
        st.FleeT[i] = NumOr("fleeT", 0.0); st.Bless[i] = NumOr("bless", 0.0);
        st.Curse[i] = NumOr("curse", 0.0); st.Fert[i] = NumOr("fert", 0.0); st.Detour[i] = NumOr("detour", 0.0);
        st.Panic[i] = NumOr("panic", double.NaN);
        if (u.TryGetProperty("gids", out var gj) && gj.ValueKind == JsonValueKind.Array)
        {
            var gl = new List<int>(); foreach (var g0 in gj.EnumerateArray()) gl.Add(g0.GetInt32());
            st.GIds[i] = gl;
            var vl = new List<double>();
            if (u.TryGetProperty("gval", out var vj) && vj.ValueKind == JsonValueKind.Array)
                foreach (var v0 in vj.EnumerateArray()) vl.Add(v0.GetDouble());
            st.GVal[i] = vl;
        }
        st.Food[i] = NumOr("food", double.NaN);
        st.Stk[i] = (int)NumOr("stk", 0.0);
        st.Sxk[i] = NumOr("sxk", double.NaN); st.Syk[i] = NumOr("syk", double.NaN);
        st.Infected[i] = u.TryGetProperty("infected", out var ij) && ij.ValueKind == JsonValueKind.True;
        st.Grab[i] = NumOr("grab", 0.0);
        st.Boat[i] = (byte)NumOr("boat", 0); st.BoatTtl[i] = (int)NumOr("boatTTL", 0);
        st.Civ[i] = (int)NumOr("civ", -1); st.Job[i] = (int)NumOr("job", 0);
        st.Speed[i] = NumOr("speed", 0.1);
        st.Caravan[i] = (int)NumOr("caravan", 0);
        if (u.TryGetProperty("dead", out var dj) && dj.ValueKind == JsonValueKind.True) st.Dead[i] = true;
        st.Trait[i] = StrOr("trait");
        st.Wep[i] = StrOr("wep"); st.Arm[i] = StrOr("arm"); st.Hlm[i] = StrOr("hlm");
        st.Shd[i] = StrOr("shd"); st.Bts[i] = StrOr("bts"); st.RngE[i] = StrOr("rng"); st.Amu[i] = StrOr("amu");
        st.King[i] = u.TryGetProperty("king", out var kj) && kj.ValueKind == JsonValueKind.True;
        st.Fam[i] = (int)NumOr("fam", -1.0); st.Army[i] = (int)NumOr("army", -1.0);
        st.ThrT[i] = NumOr("thrT", double.NaN); st.GrabTtl[i] = NumOr("grabTTL", double.NaN);
        // —— M-U2d 切片 2 繁衍域列 ——
        if (u.TryGetProperty("gene", out var gj2) && gj2.ValueKind == JsonValueKind.Object)
        {
            st.GeneS[i] = gj2.GetProperty("s").GetDouble(); st.GeneD[i] = gj2.GetProperty("d").GetDouble();
            st.GeneH[i] = gj2.GetProperty("h").GetDouble(); st.GeneR[i] = gj2.GetProperty("r").GetDouble();
        }
        st.Fgn[i] = (int)NumOr("fgn", 0.0);
        st.Name[i] = StrOr("name");
        st.Breath[i] = NumOr("breath", double.NaN);
        st.UParity[i] = (int)NumOr("uparity", -1.0);
        st.BeachT[i] = (int)NumOr("beachT", 0.0);
        st.Lx[i] = NumOr("lx", double.NaN); st.Ly[i] = NumOr("ly", double.NaN);   // 渲染插值起点（stub 单位 undefined → NaN 哨兵；新生 spawn 写实值）
    }
    void RbCheckN(string tag, string? jsStr, double actual, string loc)
    {
        total++;
        ulong jsBits = 0; bool jsIsNaN = false;
        if (jsStr != null)
        {
            jsBits = RbLeHexToBits(jsStr);
            jsIsNaN = (jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0;
        }
        bool cNaN = double.IsNaN(actual);
        bool jNaN = jsStr == null || jsIsNaN;
        if (cNaN && jNaN) return;
        if (cNaN && !jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#=NaN"); return; }
        if (!cNaN && jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr ?? "undefined"}(NaN) C#={actual:R}"); return; }
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#={actual:R}"); }
    }
    void RbCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void RbCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void RbCheckS(string tag, string? expect, string? actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    byte[] RbGrid(JsonElement spec)
    {
        var g = new byte[rbW * 160];
        Array.Fill(g, (byte)spec.GetProperty("def").GetInt32());
        foreach (var p in spec.GetProperty("patches").EnumerateArray())
        {
            int x1 = p[0].GetInt32(), y1 = p[1].GetInt32(), x2 = p[2].GetInt32(), y2 = p[3].GetInt32(), t = p[4].GetInt32();
            for (int y = y1; y < y2; y++) for (int x = x1; x < x2; x++) g[y * rbW + x] = (byte)t;
        }
        return g;
    }
    void RbSnapTake(WbUnitsState st, int i, CbSnap sp)
    {
        sp.Race = st.Race[i]; sp.Age = st.Age[i]; sp.Hp = st.Hp[i]; sp.Hurt = st.Hurt[i]; sp.Cd = st.Cd[i]; sp.Atk = st.Atk[i];
        sp.FleeT = st.FleeT[i]; sp.Bless = st.Bless[i]; sp.Curse = st.Curse[i]; sp.Fert = st.Fert[i]; sp.Detour = st.Detour[i];
        sp.Panic = st.Panic[i]; sp.Food = st.Food[i]; sp.Stk = st.Stk[i]; sp.Infected = st.Infected[i]; sp.Dead = st.Dead[i];
        sp.King = st.King[i]; sp.Fam = st.Fam[i]; sp.Army = st.Army[i]; sp.Trait = st.Trait[i]; sp.Wep = st.Wep[i]; sp.Arm = st.Arm[i];
        sp.ThrT = st.ThrT[i]; sp.Caravan = st.Caravan[i]; sp.Dmg = st.Dmg[i]; sp.Kills = st.Kills[i];
        sp.X = st.X[i]; sp.Y = st.Y[i]; sp.Tx = st.Tx[i]; sp.Ty = st.Ty[i];
        sp.GIds = st.GIds[i] == null ? null : new List<int>(st.GIds[i]);
        sp.GVal = st.GVal[i] == null ? null : new List<double>(st.GVal[i]);
        sp.RpId = st.Id[i];
        // —— 繁衍域扩展 ——
        sp.MaxAge = st.MaxAge[i]; sp.MaxHp = st.MaxHp[i]; sp.Speed = st.Speed[i];
        sp.Lx = st.Lx[i]; sp.Ly = st.Ly[i];
        sp.GeneS = st.GeneS[i]; sp.GeneD = st.GeneD[i]; sp.GeneH = st.GeneH[i]; sp.GeneR = st.GeneR[i];
        sp.Breath = st.Breath[i]; sp.Tdmg = st.Tdmg[i]; sp.Thp = st.Thp[i];
        sp.Fgn = st.Fgn[i]; sp.UParity = st.UParity[i]; sp.BeachT = st.BeachT[i];
        sp.Name = st.Name[i]; sp.Flip = st.Flip[i];
    }
    void RbSnapCompare(string tag, JsonElement uo, CbSnap sp)
    {
        RbCheckI($"{tag}.id", uo.GetProperty("id").GetInt32(), sp.RpId, "");
        RbCheckI($"{tag}.race", uo.GetProperty("race").GetInt32(), (int)sp.Race, "");
        RbCheckN($"{tag}.age", uo.GetProperty("age").GetString()!, sp.Age, "");
        RbCheckN($"{tag}.maxAge", uo.GetProperty("maxAge").GetString()!, sp.MaxAge, "");
        RbCheckN($"{tag}.hp", uo.GetProperty("hp").GetString()!, sp.Hp, "");
        RbCheckN($"{tag}.maxHp", uo.GetProperty("maxHp").GetString()!, sp.MaxHp, "");
        RbCheckN($"{tag}.speed", uo.GetProperty("speed").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("speed").GetString()!, sp.Speed, "");
        RbCheckN($"{tag}.dmg", uo.GetProperty("dmg").GetString()!, sp.Dmg, "");
        RbCheckN($"{tag}.cd", uo.GetProperty("cd").GetString()!, sp.Cd, "");
        RbCheckN($"{tag}.fleeT", uo.GetProperty("fleeT").GetString()!, sp.FleeT, "");
        RbCheckN($"{tag}.panic", uo.GetProperty("panic").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("panic").GetString()!, sp.Panic, "");
        RbCheckN($"{tag}.food", uo.GetProperty("food").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("food").GetString()!, sp.Food, "");
        RbCheckN($"{tag}.x", uo.GetProperty("x").GetString()!, sp.X, "");
        RbCheckN($"{tag}.y", uo.GetProperty("y").GetString()!, sp.Y, "");
        RbCheckN($"{tag}.tx", uo.GetProperty("tx").GetString()!, sp.Tx, "");
        RbCheckN($"{tag}.ty", uo.GetProperty("ty").GetString()!, sp.Ty, "");
        RbCheckN($"{tag}.lx", uo.GetProperty("lx").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("lx").GetString()!, sp.Lx, "");
        RbCheckN($"{tag}.ly", uo.GetProperty("ly").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("ly").GetString()!, sp.Ly, "");
        RbCheckB($"{tag}.infected", uo.GetProperty("infected").GetBoolean(), sp.Infected, "");
        RbCheckB($"{tag}.dead", uo.GetProperty("dead").GetBoolean(), sp.Dead, "");
        RbCheckB($"{tag}.flip", uo.GetProperty("flip").GetBoolean(), sp.Flip, "");
        RbCheckB($"{tag}.famNull", uo.GetProperty("fam").ValueKind == JsonValueKind.Null, sp.Fam < 0, "");
        if (uo.GetProperty("fam").ValueKind != JsonValueKind.Null)
            RbCheckI($"{tag}.fam", uo.GetProperty("fam").GetInt32(), sp.Fam, "");
        RbCheckI($"{tag}.fgn", uo.GetProperty("fgn").ValueKind == JsonValueKind.Null ? 0 : uo.GetProperty("fgn").GetInt32(), sp.Fgn, "");
        RbCheckS($"{tag}.trait", uo.GetProperty("trait").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("trait").GetString()!, sp.Trait, "");
        RbCheckS($"{tag}.name", uo.GetProperty("name").GetString()!, sp.Name, "");
        var geneJ = uo.GetProperty("gene");
        RbCheckB($"{tag}.geneNull", geneJ.ValueKind == JsonValueKind.Null, double.IsNaN(sp.GeneS), "");
        if (geneJ.ValueKind == JsonValueKind.Object)
        {
            RbCheckN($"{tag}.gene.s", geneJ.GetProperty("s").GetString()!, sp.GeneS, "");
            RbCheckN($"{tag}.gene.d", geneJ.GetProperty("d").GetString()!, sp.GeneD, "");
            RbCheckN($"{tag}.gene.h", geneJ.GetProperty("h").GetString()!, sp.GeneH, "");
            RbCheckN($"{tag}.gene.r", geneJ.GetProperty("r").GetString()!, sp.GeneR, "");
        }
        RbCheckN($"{tag}.breath", uo.GetProperty("breath").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("breath").GetString()!, sp.Breath, "");
        RbCheckI($"{tag}.uparity", uo.GetProperty("uparity").ValueKind == JsonValueKind.Null ? -1 : uo.GetProperty("uparity").GetInt32(), sp.UParity, "");
        var gidsJ = uo.GetProperty("gids");
        RbCheckB($"{tag}.gidsNull", gidsJ.ValueKind == JsonValueKind.Null, sp.GIds == null, "");
        if (gidsJ.ValueKind == JsonValueKind.String)
        {
            var expect = gidsJ.GetString()!.Split(',').Select(int.Parse).ToList();
            RbCheckI($"{tag}.gidsN", expect.Count, sp.GIds?.Count ?? -1, "");
            for (int g = 0; g < expect.Count; g++)
                RbCheckI($"{tag}.gids[{g}]", expect[g], g < (sp.GIds?.Count ?? 0) ? sp.GIds![g] : -1, "");
        }
    }
    void RbCheckItems(string tag, JsonElement itemsJ, List<WbGroundItem> items)
    {
        RbCheckI($"{tag}.n", itemsJ.GetArrayLength(), items.Count, "");
        int i = 0;
        foreach (var it in itemsJ.EnumerateArray())
        {
            if (i < items.Count)
            {
                RbCheckI($"{tag}[{i}].id", it.GetProperty("id").GetInt32(), items[i].Id, "");
                RbCheckS($"{tag}[{i}].kind", it.GetProperty("kind").GetString()!, items[i].Kind, "");
                RbCheckN($"{tag}[{i}].x", it.GetProperty("x").GetString()!, items[i].X, "");
                RbCheckN($"{tag}[{i}].y", it.GetProperty("y").GetString()!, items[i].Y, "");
            }
            i++;
        }
    }

    foreach (var c in rbd.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        var host = new WbCombatHost();
        var grid5 = new WbGridState();
        host.Terrain = RbGrid(rbd.GetProperty("terrainSpecs").EnumerateArray().First(t => t.GetProperty("name").GetString() == c.GetProperty("terrain").GetString()));
        foreach (var rp in rbd.GetProperty("races").EnumerateObject())
        {
            int rid = int.Parse(rp.Name);
            host.RaceFlags[rid] = (byte)rp.Value.GetProperty("flags").GetInt32();
            host.Tbf[rid * 2] = (byte)rp.Value.GetProperty("tbf0").GetInt32();
            host.Tbf[rid * 2 + 1] = (byte)rp.Value.GetProperty("tbf1").GetInt32();
            var reach = rp.Value.GetProperty("reach");
            host.RaceReach[rid] = reach.ValueKind == JsonValueKind.Null ? double.NaN : reach.GetDouble();
            host.RaceSpeed[rid] = rp.Value.GetProperty("speed").GetDouble();
            host.RaceRepro[rid] = rp.Value.GetProperty("repro").GetDouble();
            var growth = rp.Value.GetProperty("growth");
            host.RaceGrowth[rid] = growth.ValueKind == JsonValueKind.Null ? double.NaN : growth.GetDouble();
            host.RaceMaxAge[rid] = rp.Value.GetProperty("maxAge").GetDouble();
            host.RaceHp[rid] = rp.Value.GetProperty("hp").GetDouble();
            host.RaceDmg[rid] = rp.Value.GetProperty("dmg").GetDouble();
        }
        host.ItemDefOf = k => rbd.GetProperty("itemDefs").TryGetProperty(k, out var d)
            ? new WbItemDef
            {
                Armor = d.GetProperty("armor").GetDouble(), Crit = d.GetProperty("crit").GetDouble(),
                Lifesteal = d.GetProperty("lifesteal").GetDouble(), Thorns = d.GetProperty("thorns").GetDouble(),
                Regen = d.GetProperty("regen").GetDouble(), Ranged = d.GetProperty("ranged").GetDouble(),
                SpeedMul = d.GetProperty("speedMul").GetDouble(),
                Rank = d.GetProperty("rank").GetInt32(),
                Slot = d.GetProperty("slot").GetString()! switch { "wep" => 0, "arm" => 1, "hlm" => 2, "shd" => 3, "bts" => 4, "rng" => 5, _ => 6 },
                Dmg = d.GetProperty("dmg").GetDouble(), Hp = d.GetProperty("hp").GetDouble(),
                Rarity = d.GetProperty("rarity").GetDouble(), Name = d.GetProperty("name").GetString(),
            }
            : null;
        var poolKeys5 = new List<string>(); var poolR5 = new List<int>();
        foreach (var it in rbd.GetProperty("rollPool").EnumerateArray())
        {
            poolKeys5.Add(it.GetProperty("key").GetString()!);
            poolR5.Add(it.GetProperty("rarity").GetInt32());
        }
        host.RollPoolKeys = poolKeys5.ToArray();
        host.RollPoolRarity = poolR5.ToArray();
        host.RarityW = rbd.GetProperty("rarityW").EnumerateArray().Select(x => x.GetDouble()).ToArray();
        host.RollChestTier = tier => tier switch { "chest2" => 1, "chest3" => 3, _ => 0 };
        // —— 繁衍域数据面：特质表/键序/词法表/FIRST 名池 ——
        foreach (var tk in rbd.GetProperty("traitDefs").EnumerateObject())
            host.TraitDefs[tk.Name] = new WbTraitDef
            {
                HpMul = tk.Value.GetProperty("hpMul").GetDouble(),
                DmgMul = tk.Value.GetProperty("dmgMul").GetDouble(),
                SpeedMul = tk.Value.GetProperty("speedMul").GetDouble(),
                Regen = tk.Value.GetProperty("regen").GetDouble(),
                Immune = tk.Value.GetProperty("immune").GetBoolean(),
            };
        foreach (var tk in rbd.GetProperty("traitKeys").EnumerateArray())
            host.TraitKeyOrder.Add(tk.GetString()!);
        var emJ = rbd.GetProperty("em");
        host.TraitPrefix = emJ.GetProperty("traitPrefix").EnumerateArray().Select(x => x.GetString()!).ToArray();
        host.TraitBody = emJ.GetProperty("traitBody").EnumerateArray().Select(x => x.GetString()!).ToArray();
        host.FamPre = emJ.GetProperty("famPre").EnumerateArray().Select(x => x.GetString()!).ToArray();
        host.FamPost = emJ.GetProperty("famPost").EnumerateArray().Select(x => x.GetString()!).ToArray();
        foreach (var fj in rbd.GetProperty("firsts").EnumerateObject())
            host.FirstNames[int.Parse(fj.Name)] = fj.Value.EnumerateArray().Select(x => x.GetString()!).ToArray();

        var envJ5 = c.GetProperty("env");
        var env5 = new WbMoveEnv
        {
            PanicDecay = rbPanicDecay, GrudgeDecay = rbGrudgeDecay, FireDamage = rbFire, PanicRout = rbPanicRout,
            FxAmbience = envJ5.TryGetProperty("ambience", out var am5) && am5.GetBoolean(),
            Season = envJ5.TryGetProperty("season", out var se5) ? se5.GetInt32() : 0,
            BloodMoonTtl = envJ5.TryGetProperty("bloodMoonTtl", out var bm5) ? bm5.GetDouble() : 0.0,
            EclipseTtl = envJ5.TryGetProperty("eclipseTtl", out var ec5) ? ec5.GetDouble() : 0.0,
            DayPhase = envJ5.GetProperty("dayPhase").GetDouble(),
            LawsZombieInfect = envJ5.TryGetProperty("lawsZombie", out var lz5) && lz5.GetBoolean(),
            LawsZombieVirus = !envJ5.TryGetProperty("lawsZombieVirus", out var zv5) || zv5.GetBoolean(),
            LawsReproduction = !envJ5.TryGetProperty("lawsReproduction", out var lr5) || lr5.GetBoolean(),
            FxBlood = !envJ5.TryGetProperty("fxBlood", out var fb5) || fb5.GetBoolean(),
            FxDmgNumbers = !envJ5.TryGetProperty("fxDmgNumbers", out var fd5) || fd5.GetBoolean(),
            FxCorpses = !envJ5.TryGetProperty("fxCorpses", out var fc5) || fc5.GetBoolean(),
            NeuroEnabled = envJ5.TryGetProperty("neuro", out var nj5) && nj5.GetProperty("enabled").GetBoolean(),
            FlightModeRl = !envJ5.TryGetProperty("neuro", out var nj6) || nj6.GetProperty("flightMode").GetString() == "rl",
            MutationRate = rbMutationRate,
            ReproMulEp = rbReproMul,
        };
        host.YearF = envJ5.TryGetProperty("yearF", out var yf5) ? yf5.GetDouble() : 0.0;
        host.GrassTiles = envJ5.TryGetProperty("grassTiles", out var gt5) ? gt5.GetDouble() : 0.0;
        host.UnitSeq = envJ5.TryGetProperty("unitSeq", out var usq5) ? usq5.GetInt32() : 1;
        host.TraitSeq = envJ5.TryGetProperty("traitSeq", out var tsq5) ? tsq5.GetInt32() : 0;
        if (envJ5.TryGetProperty("items", out var initItems5))
            foreach (var it in initItems5.EnumerateArray())
                host.Items.Add(new WbGroundItem { Id = it.GetProperty("id").GetInt32(), Kind = it.GetProperty("kind").GetString()!, X = it.GetProperty("x").GetDouble(), Y = it.GetProperty("y").GetDouble() });
        host.ItemSeq = envJ5.TryGetProperty("itemSeq", out var isq5) ? isq5.GetInt32() : 1;
        if (envJ5.TryGetProperty("families", out var initFam5))
            foreach (var f in initFam5.EnumerateArray())
            {
                var fo = f[1];
                host.Families[fo.GetProperty("id").GetInt32()] = new WbFamily
                {
                    Id = fo.GetProperty("id").GetInt32(), Name = fo.GetProperty("name").GetString() ?? "",
                    Members = fo.GetProperty("members").GetInt32(), Kills = fo.GetProperty("kills").GetInt32(),
                    Heroes = fo.GetProperty("heroes").GetInt32(), Peak = fo.GetProperty("peak").GetInt32(),
                    Founded = fo.GetProperty("founded").GetInt32(), Founder = fo.GetProperty("founder").GetString() ?? "",
                    Milestones = fo.GetProperty("milestones").GetInt32(),
                };
            }
        host.FamilySeq = envJ5.TryGetProperty("familySeq", out var fsq5) ? fsq5.GetInt32() : 1;

        var specs5 = c.GetProperty("units");
        int un5 = specs5.GetArrayLength();
        var st5 = new WbUnitsState(un5 + 256);   // 出生余量（M-U6 布局切片做动态增长）
        st5.LiveLen = un5;
        for (int i = 0; i < un5; i++) RbLoadUnit(st5, i, specs5[i]);
        st5.RngA = (uint)c.GetProperty("seed").GetInt32();
        // wildCount 初始（gen 按在世野生单位注入 + env 显式注入合并）
        for (int i = 0; i < un5; i++)
            if (!st5.Dead[i])
            {
                byte fl = host.RaceFlags[st5.Race[i]];
                if ((fl & WbConstants.FCiv) == 0) host.BumpWild(st5.Race[i], 1);
            }
        if (envJ5.TryGetProperty("wild", out var wildInit5))
            foreach (var w in wildInit5.EnumerateArray())
                host.BumpWild((uint)w[0].GetInt32(), w[1].GetInt32());

        int sn5 = 0;
        foreach (var o in c.GetProperty("out").EnumerateArray())
        {
            WbGrid.Rebuild(st5, grid5);
            int draw0d5 = st5.RngDraws;
            var usOut5 = o.GetProperty("units");
            int unN5 = usOut5.GetArrayLength();   // ⚠ 含循环内新生（活数组增长后总长）
            var evtList5 = new List<int> { host.PendingUpd.Count };
            var fxList5 = new List<int> { host.PendingFx.Count };
            var bloodList5 = new List<int> { host.PendingBlood.Count };
            var corpseList5 = new List<int> { host.PendingCorpse.Count };
            var snapsList5 = new List<CbSnap>();
            // ⚠ 活数组循环：LiveLen 随 spawn 增长（C# 与 TS for(i<units.length) 同构）
            for (int i = 0; i < st5.LiveLen; i++)
            {
                if (st5.Dead[i])
                {
                    evtList5.Add(host.PendingUpd.Count); fxList5.Add(host.PendingFx.Count);
                    bloodList5.Add(host.PendingBlood.Count); corpseList5.Add(host.PendingCorpse.Count);
                    snapsList5.Add(new CbSnap()); RbSnapTake(st5, i, snapsList5[snapsList5.Count - 1]);
                    continue;
                }
                bool ended5 = WbUnits.UpdateUnitPre(st5, host, env5, i);
                if (!ended5)
                {
                    try
                    {
                        var exit5 = WbUnits.UpdateUnitScan(st5, host, env5, grid5, i);
                        if (exit5 == WbUnits.WbScanExit.ToTailPost)
                            host.PendingUpd.Add(new WbUpdEvent("tail", st5.Id[i], 0.0, 0.0));
                        if (exit5 != WbUnits.WbScanExit.Ended)
                            WbUnits.UpdateUnitPost(st5, host, env5, i);   // 真实现 post（拾取 + 繁衍全链）
                    }
                    catch (Exception ex)
                    {
                        throw new Exception($"[rb.{name}.s{sn5}.u{i}] id={st5.Id[i]} hp={st5.Hp[i]}: {ex.Message}");
                    }
                }
                evtList5.Add(host.PendingUpd.Count); fxList5.Add(host.PendingFx.Count);
                bloodList5.Add(host.PendingBlood.Count); corpseList5.Add(host.PendingCorpse.Count);
                snapsList5.Add(new CbSnap()); RbSnapTake(st5, i, snapsList5[snapsList5.Count - 1]);   // 即时刻快照（reap 前）
            }
            RbCheckI($"rb.{name}.s{sn5}.liveN", unN5, st5.LiveLen, "");
            RbCheckI($"rb.{name}.s{sn5}.snapN", unN5, snapsList5.Count, "");
            // 步末 all 快照（⚠ reap 前——含新生）
            var allJ5 = o.GetProperty("all");
            RbCheckI($"rb.{name}.s{sn5}.aliveN", allJ5.GetArrayLength(), st5.LiveLen, "");
            for (int i = 0; i < Math.Min(allJ5.GetArrayLength(), st5.LiveLen); i++)
            {
                var sp2 = new CbSnap(); RbSnapTake(st5, i, sp2);
                RbSnapCompare($"rb.{name}.s{sn5}.all{i}", allJ5[i], sp2);
            }
            // —— 收尸（真实现——含 swap-pop 摘除） ——
            WbUnits.Reap(st5, host, env5, grid5);
            RbCheckI($"rb.{name}.s{sn5}.draws", o.GetProperty("draws").GetInt32(), st5.RngDraws - draw0d5, "");
            for (int i = 0; i < unN5; i++)
            {
                var uo = usOut5[i];
                if (uo.ValueKind != JsonValueKind.Object || !uo.TryGetProperty("age", out _))
                { RbCheckB($"rb.{name}.s{sn5}.u{i}.deadSkip", true, snapsList5[i].Dead, ""); continue; }
                RbSnapCompare($"rb.{name}.s{sn5}.u{i}", uo, snapsList5[i]);
                var evtJ5 = uo.GetProperty("evt");
                RbCheckI($"rb.{name}.s{sn5}.u{i}.evtN", evtJ5.GetArrayLength(), evtList5[i + 1] - evtList5[i], "");
                int evC5 = 0;
                foreach (var e in evtJ5.EnumerateArray())
                {
                    int ei = evtList5[i] + evC5;
                    if (ei < evtList5[i + 1])
                    {
                        var pe = host.PendingUpd[ei];
                        string jsKind = e[0].GetString()!;
                        total++;
                        if (jsKind == "ev")
                        {
                            if (pe.Kind != "ev:" + e[1].GetString())
                            { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rb.{name}.s{sn5}.u{i}.evt{evC5}] kind JS=ev:{e[1].GetString()} C#={pe.Kind}"); }
                            var xj5 = e[2]; var yj5 = e[3];
                            RbCheckN($"rb.{name}.s{sn5}.u{i}.evt{evC5}.x", xj5.ValueKind == JsonValueKind.Null ? null : xj5.GetString()!, pe.X, "");
                            RbCheckN($"rb.{name}.s{sn5}.u{i}.evt{evC5}.y", yj5.ValueKind == JsonValueKind.Null ? null : yj5.GetString()!, pe.Y, "");
                        }
                        else
                        {
                            if (pe.Kind != jsKind)
                            { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rb.{name}.s{sn5}.u{i}.evt{evC5}] kind JS={jsKind} C#={pe.Kind}"); }
                            else RbCheckI($"rb.{name}.s{sn5}.u{i}.evt{evC5}.id", e[1].GetInt32(), pe.Id, "");
                        }
                    }
                    evC5++;
                }
                var fxJ5 = uo.GetProperty("fx");
                RbCheckI($"rb.{name}.s{sn5}.u{i}.fxN", fxJ5.GetArrayLength(), fxList5[i + 1] - fxList5[i], "");
                int fxC5 = 0;
                foreach (var fj5 in fxJ5.EnumerateArray())
                {
                    int fi5 = fxList5[i] + fxC5;
                    if (fi5 < fxList5[i + 1])
                    {
                        var pf = host.PendingFx[fi5];
                        total++;
                        if (pf.Kind != fj5[0].GetString())
                        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rb.{name}.s{sn5}.u{i}.fx{fxC5}] kind JS={fj5[0].GetString()} C#={pf.Kind}"); }
                        RbCheckN($"rb.{name}.s{sn5}.u{i}.fx{fxC5}.x", fj5[1].GetString()!, pf.X, "");
                        RbCheckN($"rb.{name}.s{sn5}.u{i}.fx{fxC5}.y", fj5[2].GetString()!, pf.Y, "");
                        total++;
                        if (BitConverter.DoubleToUInt64Bits(pf.Ttl) != BitConverter.DoubleToUInt64Bits(fj5[3].GetDouble()))
                        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rb.{name}.s{sn5}.u{i}.fx{fxC5}.ttl] JS={fj5[3].GetDouble()} C#={pf.Ttl}"); }
                    }
                    fxC5++;
                }
                var blJ5 = uo.GetProperty("blood");
                RbCheckI($"rb.{name}.s{sn5}.u{i}.bloodN", blJ5.GetArrayLength(), bloodList5[i + 1] - bloodList5[i], "");
                var cpJ5 = uo.GetProperty("corpse");
                RbCheckI($"rb.{name}.s{sn5}.u{i}.corpseN", cpJ5.GetArrayLength(), corpseList5[i + 1] - corpseList5[i], "");
            }
            // reap fx + items（all 已在 reap 前比对）
            var fxTail5 = o.GetProperty("fx");
            {
                int fxBase5 = fxList5[unN5];
                RbCheckI($"rb.{name}.s{sn5}.reapFxN", fxTail5.GetArrayLength(), host.PendingFx.Count - fxBase5, "");
                int rfx5 = 0;
                foreach (var fj6 in fxTail5.EnumerateArray())
                {
                    int fi6 = fxBase5 + rfx5;
                    if (fi6 < host.PendingFx.Count)
                    {
                        var pf = host.PendingFx[fi6];
                        total++;
                        if (pf.Kind != fj6[0].GetString())
                        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[rb.{name}.s{sn5}.reapFx{rfx5}] kind JS={fj6[0].GetString()} C#={pf.Kind}"); }
                        RbCheckN($"rb.{name}.s{sn5}.reapFx{rfx5}.x", fj6[1].GetString()!, pf.X, "");
                        RbCheckN($"rb.{name}.s{sn5}.reapFx{rfx5}.y", fj6[2].GetString()!, pf.Y, "");
                    }
                    rfx5++;
                }
            }
            RbCheckItems($"rb.{name}.s{sn5}.items", o.GetProperty("items"), host.Items);
            sn5++;
        }
        // 终态：final + items + wild + families 全量 + itemSeq + unitSeq/traitSeq/dynTraits + rngTail
        var finJ5 = c.GetProperty("final");
        RbCheckI($"rb.{name}.finalN", finJ5.GetArrayLength(), st5.LiveLen, "");
        for (int i = 0; i < Math.Min(finJ5.GetArrayLength(), st5.LiveLen); i++)
        {
            var sp3 = new CbSnap(); RbSnapTake(st5, i, sp3);
            RbSnapCompare($"rb.{name}.fin.u{i}", finJ5[i], sp3);
        }
        RbCheckItems($"rb.{name}.items", c.GetProperty("items"), host.Items);
        var wildJ5 = c.GetProperty("wild");
        RbCheckI($"rb.{name}.wildN", wildJ5.GetArrayLength(), host.WildCount.Count, "");
        {
            var wkeys5 = host.WildCount.Keys.OrderBy(k => k).ToList();
            int wi5 = 0;
            foreach (var e in wildJ5.EnumerateArray())
            {
                if (wi5 < wkeys5.Count)
                {
                    RbCheckI($"rb.{name}.wild.r{wi5}", e[0].GetInt32(), (int)wkeys5[wi5], "");
                    RbCheckI($"rb.{name}.wild.n{wi5}", e[1].GetInt32(), host.WildCount[wkeys5[wi5]], "");
                }
                wi5++;
            }
        }
        var famJ5 = c.GetProperty("families");
        {
            var fkeys5 = host.Families.Keys.OrderBy(k => k).ToList();
            RbCheckI($"rb.{name}.famN", famJ5.GetArrayLength(), fkeys5.Count, "");
            int fi7 = 0;
            foreach (var e in famJ5.EnumerateArray())
            {
                if (fi7 < fkeys5.Count)
                {
                    var fe = host.Families[fkeys5[fi7]];
                    RbCheckI($"rb.{name}.fam{fi7}.id", e.GetProperty("id").GetInt32(), fe.Id, "");
                    RbCheckI($"rb.{name}.fam{fi7}.members", e.GetProperty("members").GetInt32(), fe.Members, "");
                    RbCheckS($"rb.{name}.fam{fi7}.name", e.GetProperty("name").GetString()!, fe.Name, "");
                    RbCheckI($"rb.{name}.fam{fi7}.peak", e.GetProperty("peak").GetInt32(), fe.Peak, "");
                    RbCheckI($"rb.{name}.fam{fi7}.founded", e.GetProperty("founded").GetInt32(), fe.Founded, "");
                    RbCheckS($"rb.{name}.fam{fi7}.founder", e.GetProperty("founder").GetString()!, fe.Founder, "");
                    RbCheckI($"rb.{name}.fam{fi7}.milestones", e.GetProperty("milestones").GetInt32(), fe.Milestones, "");
                }
                fi7++;
            }
        }
        RbCheckI($"rb.{name}.itemSeq", c.GetProperty("itemSeq").GetInt32(), host.ItemSeq, "");
        RbCheckI($"rb.{name}.unitSeq", c.GetProperty("unitSeq").GetInt32(), host.UnitSeq, "");
        RbCheckI($"rb.{name}.traitSeq", c.GetProperty("traitSeq").GetInt32(), host.TraitSeq, "");
        var dynJ5 = c.GetProperty("dynTraits");
        RbCheckI($"rb.{name}.dynN", dynJ5.GetArrayLength(), host.DynTraits.Count, "");
        {
            var dkeys5 = host.DynTraits.Keys.OrderBy(k => k).ToList();
            int di5 = 0;
            foreach (var e in dynJ5.EnumerateArray())
            {
                if (di5 < dkeys5.Count)
                    RbCheckS($"rb.{name}.dyn{di5}", e.GetString()!, dkeys5[di5], "");
                di5++;
            }
        }
        var rbtail = c.GetProperty("rngTail").EnumerateArray().GetEnumerator();
        for (int i = 0; i < 4 && rbtail.MoveNext(); i++)
            RbCheckN($"rb.{name}.rngTail[{i}]", rbtail.Current.GetString()!, WbRng.Next(ref st5.RngA), "");
    }
}

// ============================================================================
// M-U3 切片 1：rel/wars 外交关系域内核（Wr 段——gen-units-wars.mjs 8 场景 65 步）
// 蓝本：diplomacyMeet / pickCasus / declareWar / makePeace / warTick / atWar /
//   civAtWar / raceRel / tension / warData / warShame / lastDeclareAt。
// 截断契约：联盟空 / directives 空 / occSet 空 / worldWar idle / 涌现武器空 /
//   lastCatastrophe 远古。事件流：PendingEvents 暂存逐条对账（id/year/kind/text/
//   colorHex/x/y）。
// ============================================================================
var wrPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-wars.json");
if (!File.Exists(wrPath)) wrPath = "golden-units-wars.json";
if (File.Exists(wrPath))
{
    var wrd = JsonDocument.Parse(File.ReadAllText(wrPath)).RootElement;
    var wrEp = wrd.GetProperty("ep");
    double wrDeclareRate = wrEp.GetProperty("declareRate").GetDouble();
    double wrTensionDecay = wrEp.GetProperty("tensionDecay").GetDouble();
    double wrMilPressure = wrEp.GetProperty("milPressure").GetDouble();

    static ulong WrLeHexToBits(string h)
    {
        ulong v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | Convert.ToUInt64(h.Substring(i * 2, 2), 16);
        return v;
    }
    void WrCheckN(string tag, string? jsStr, double actual, string loc)
    {
        total++;
        ulong jsBits = 0; bool jsIsNaN = false;
        if (jsStr != null)
        {
            jsBits = WrLeHexToBits(jsStr);
            jsIsNaN = (jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0;
        }
        bool cNaN = double.IsNaN(actual);
        bool jNaN = jsStr == null || jsIsNaN;
        if (cNaN && jNaN) return;
        if (cNaN && !jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#=NaN"); return; }
        if (!cNaN && jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr ?? "undefined"}(NaN) C#={actual:R}"); return; }
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#={actual:R}"); }
    }
    void WrCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void WrCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void WrCheckS(string tag, string? expect, string? actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    /// <summary>gold/militarism 列：bitHex|null —— null ≡ TS undefined。</summary>
    void WrCheckNOpt(string tag, string? jsStr, double? actual, string loc)
    {
        if (jsStr == null && actual == null) { total++; return; }
        WrCheckN(tag, jsStr, actual ?? double.NaN, loc);
    }

    void WrLoadCivs(WbWarsHost host, JsonElement civsJ)
    {
        host.Civs.Clear();
        foreach (var cj in civsJ.EnumerateArray())
        {
            var cv = new WbCiv
            {
                Id = cj.GetProperty("id").GetInt32(),
                Name = cj.GetProperty("name").GetString()!,
                Race = cj.GetProperty("race").GetInt32(),
                ColorHex = cj.GetProperty("colorHex").GetString()!,
                Pop = cj.GetProperty("pop").GetDouble(),
                Capital = cj.GetProperty("capital").GetInt32(),
                Alive = cj.GetProperty("alive").GetBoolean(),
            };
            var tnJ = cj.GetProperty("tilesN");
            for (int k = 0; k < tnJ.GetInt32(); k++) cv.Tiles.Add(900000 + k);   // 旧场景领土域零触达——id 无关
            var gJ = cj.GetProperty("gold");
            cv.Gold = gJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WrLeHexToBits(gJ.GetString()!));
            var mJ = cj.GetProperty("militarism");
            cv.Militarism = mJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WrLeHexToBits(mJ.GetString()!));
            var gvJ = cj.GetProperty("gov");
            cv.Gov = gvJ.ValueKind == JsonValueKind.Null ? null : gvJ.GetInt32();
            while (host.Civs.Count <= cv.Id) host.Civs.Add(null);
            host.Civs[cv.Id] = cv;
        }
    }
    void WrLoadRaceTable(WbWarsHost host, JsonElement obj, double[] target)
    {
        foreach (var prop in obj.EnumerateObject())
            target[int.Parse(prop.Name)] = prop.Value.GetDouble();
    }
    void WrCheckMapN(string tag, JsonElement jsArr, WbOrderedMap<string, double> map)
    {
        WrCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WrCheckS($"{tag}.k{i}", kv[0].GetString()!, map.Order[i], "");
                WrCheckN($"{tag}.v{i}", kv[1].GetString()!, map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WrCheckMapI(string tag, JsonElement jsArr, WbOrderedMap<string, int> map)
    {
        WrCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WrCheckS($"{tag}.k{i}", kv[0].GetString()!, map.Order[i], "");
                WrCheckI($"{tag}.v{i}", kv[1].GetInt64(), map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WrCheckMapII(string tag, JsonElement jsArr, WbOrderedMap<int, int> map)
    {
        WrCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WrCheckI($"{tag}.k{i}", kv[0].GetInt64(), map.Order[i], "");
                WrCheckI($"{tag}.v{i}", kv[1].GetInt64(), map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WrCheckWarInfo(string tag, JsonElement w, WbWarInfo wd)
    {
        WrCheckS($"{tag}.key", w.GetProperty("key").GetString()!, wd.Key, "");
        WrCheckI($"{tag}.a", w.GetProperty("a").GetInt32(), wd.A, "");
        WrCheckI($"{tag}.b", w.GetProperty("b").GetInt32(), wd.B, "");
        WrCheckI($"{tag}.startTick", w.GetProperty("startTick").GetInt64(), wd.StartTick, "");
        WrCheckI($"{tag}.startYear", w.GetProperty("startYear").GetInt64(), wd.StartYear, "");
        WrCheckB($"{tag}.total", w.GetProperty("total").GetBoolean(), wd.Total, "");
        WrCheckI($"{tag}.scoreA", w.GetProperty("scoreA").GetInt64(), (long)wd.ScoreA, "");
        WrCheckI($"{tag}.scoreB", w.GetProperty("scoreB").GetInt64(), (long)wd.ScoreB, "");
        WrCheckN($"{tag}.exA", w.GetProperty("exA").GetString()!, wd.ExA, "");
        WrCheckN($"{tag}.exB", w.GetProperty("exB").GetString()!, wd.ExB, "");
        WrCheckI($"{tag}.casA", w.GetProperty("casA").GetInt64(), wd.CasA, "");
        WrCheckI($"{tag}.casB", w.GetProperty("casB").GetInt64(), wd.CasB, "");
        WrCheckI($"{tag}.razedA", w.GetProperty("razedA").GetInt64(), wd.RazedA, "");
        WrCheckI($"{tag}.razedB", w.GetProperty("razedB").GetInt64(), wd.RazedB, "");
        WrCheckI($"{tag}.battles", w.GetProperty("battles").GetInt64(), wd.Battles, "");
        WrCheckI($"{tag}.giveUpAt", w.GetProperty("giveUpAt").GetInt64(), wd.GiveUpAt, "");
        WrCheckS($"{tag}.reason", w.GetProperty("reason").GetString()!, wd.Reason, "");
        WrCheckS($"{tag}.reasonText", w.GetProperty("reasonText").GetString()!, wd.ReasonText, "");
        WrCheckI($"{tag}.aggressor", w.GetProperty("aggressor").GetInt32(), wd.Aggressor, "");
        WrCheckI($"{tag}.goal", w.GetProperty("goal").GetInt64(), wd.Goal, "");
        WrCheckI($"{tag}.goalNow", w.GetProperty("goalNow").GetInt64(), wd.GoalNow, "");
        WrCheckI($"{tag}.occA", w.GetProperty("occA").GetInt64(), wd.OccA, "");
        WrCheckI($"{tag}.occB", w.GetProperty("occB").GetInt64(), wd.OccB, "");
        WrCheckN($"{tag}.popA0", w.GetProperty("popA0").GetString()!, wd.PopA0, "");
        WrCheckN($"{tag}.popB0", w.GetProperty("popB0").GetString()!, wd.PopB0, "");
        var laJ = w.GetProperty("lastActiveTick");
        WrCheckI($"{tag}.lastActiveTick", laJ.ValueKind == JsonValueKind.Null ? -1 : laJ.GetInt64(), wd.LastActiveTick, "");
    }
    void WrCheckEvents(string tag, JsonElement evtsJ, WbWarsHost host, int start)
    {
        WrCheckI($"{tag}.n", evtsJ.GetArrayLength(), host.PendingEvents.Count - start, "");
        for (int i = start; i < host.PendingEvents.Count; i++)
        {
            var e = evtsJ[i - start];
            var pe = host.PendingEvents[i];
            WrCheckI($"{tag}{i}.id", e.GetProperty("id").GetInt64(), pe.Id, "");
            WrCheckI($"{tag}{i}.year", e.GetProperty("year").GetInt64(), pe.Year, "");
            WrCheckS($"{tag}{i}.kind", e.GetProperty("kind").GetString()!, pe.Kind, "");
            WrCheckS($"{tag}{i}.text", e.GetProperty("text").GetString()!, pe.Text, "");
            var chJ = e.GetProperty("colorHex");
            WrCheckS($"{tag}{i}.colorHex", chJ.ValueKind == JsonValueKind.Null ? null : chJ.GetString()!, pe.ColorHex, "");
            var xJ = e.GetProperty("x"); var yJ = e.GetProperty("y");
            WrCheckNOpt($"{tag}{i}.x", xJ.ValueKind == JsonValueKind.Null ? null : xJ.GetString()!, pe.X, "");
            WrCheckNOpt($"{tag}{i}.y", yJ.ValueKind == JsonValueKind.Null ? null : yJ.GetString()!, pe.Y, "");
        }
    }

    foreach (var c in wrd.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        uint seed = (uint)c.GetProperty("seed").GetInt64();
        var envJ = c.GetProperty("env");
        var host = new WbWarsHost
        {
            LawsWars = envJ.GetProperty("lawsWars").GetBoolean(),
            TickCount = envJ.GetProperty("tick").GetInt32(),
            YearF = envJ.GetProperty("yearF").GetDouble(),
            LastCatastropheTick = envJ.GetProperty("catTick").GetInt64(),
            EpDeclareRate = wrDeclareRate, EpTensionDecay = wrTensionDecay, EpMilPressure = wrMilPressure,
        };
        WrLoadCivs(host, c.GetProperty("civs"));
        WrLoadRaceTable(host, wrd.GetProperty("raceDiplo"), host.RaceDiplo);
        WrLoadRaceTable(host, wrd.GetProperty("raceAggr"), host.RaceAggr);
        WrLoadRaceTable(host, wrd.GetProperty("raceGreed"), host.RaceGreed);
        foreach (var prop in wrd.GetProperty("raceRelBase").EnumerateObject())
            host.RaceRelBase[prop.Name] = prop.Value.GetDouble();
        var st = new WbWarsState { RngA = seed };

        var stepsJ = c.GetProperty("steps").EnumerateArray().ToArray();
        var opsJ = c.GetProperty("ops").EnumerateArray().ToArray();
        for (int si = 0; si < opsJ.Length; si++)
        {
            var op = opsJ[si];
            var o = op.GetProperty("op").GetString()!;
            int evStart = host.PendingEvents.Count;
            int draws0 = st.RngDraws;
            long? probe = null;
            switch (o)
            {
                case "meet": WbDiplomacy.DiplomacyMeet(st, host, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()); break;
                case "war":
                {
                    WbWarOpts? opts = null;
                    if (op.TryGetProperty("opts", out var optsJ) && optsJ.ValueKind == JsonValueKind.Object)
                    {
                        opts = new WbWarOpts();
                        if (optsJ.TryGetProperty("total", out var tj)) opts.Total = tj.GetBoolean();
                        if (optsJ.TryGetProperty("goal", out var gj)) opts.Goal = gj.GetInt32();
                        if (optsJ.TryGetProperty("force", out var fj)) opts.Force = fj.GetBoolean();
                        if (optsJ.TryGetProperty("quiet", out var qj)) opts.Quiet = qj.GetBoolean();
                    }
                    WbDiplomacy.DeclareWar(st, host, op.GetProperty("agg").GetInt32(), op.GetProperty("vic").GetInt32(), op.GetProperty("reason").GetString()!, opts);
                    break;
                }
                case "peace":
                {
                    int postRel = op.TryGetProperty("postRel", out var pj) ? pj.GetInt32() : 25;
                    WbDiplomacy.MakePeace(st, host, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32(), op.GetProperty("text").GetString()!, postRel);
                    break;
                }
                case "tick": WbDiplomacy.WarTick(st, host); break;
                case "setrel": st.Rel.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("v").GetDouble()); break;
                case "setten": st.Tension.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("v").GetDouble()); break;
                case "setshame": st.WarShame.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("who").GetInt32()); break;
                case "setrace": st.RaceRel.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("v").GetDouble()); break;
                case "met": st.Met.Add(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32())); break;
                case "adv": host.TickCount += op.GetProperty("n").GetInt32(); break;
                case "atwar": probe = WbDiplomacy.AtWar(st, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()) ? 1 : 0; break;
                case "civatwar": probe = WbDiplomacy.CivAtWar(st, host, op.GetProperty("civ").GetInt32()) ? 1 : 0; break;
                default: throw new Exception("op not found: " + o);
            }

            var sJ = stepsJ[si];
            string tag = $"wr.{name}.s{si}";
            WrCheckS($"{tag}.op", o, sJ.GetProperty("op").GetString()!, "");
            WrCheckI($"{tag}.draws", sJ.GetProperty("draws").GetInt64(), st.RngDraws - draws0, "");
            var probeJ = sJ.GetProperty("probe");
            long probeExpect = probeJ.ValueKind == JsonValueKind.Null ? -1 : probeJ.GetInt64();
            WrCheckI($"{tag}.probe", probeExpect, probe ?? -1, "");
            WrCheckMapN($"{tag}.rel", sJ.GetProperty("rel"), st.Rel);
            WrCheckMapN($"{tag}.tension", sJ.GetProperty("tension"), st.Tension);
            WrCheckMapN($"{tag}.raceRel", sJ.GetProperty("raceRel"), st.RaceRel);
            WrCheckMapI($"{tag}.warShame", sJ.GetProperty("warShame"), st.WarShame);
            WrCheckMapII($"{tag}.lastDeclareAt", sJ.GetProperty("lastDeclareAt"), st.LastDeclareAt);
            var metJ = sJ.GetProperty("met");
            WrCheckI($"{tag}.metN", metJ.GetArrayLength(), st.Met.Count, "");
            for (int i = 0; i < metJ.GetArrayLength() && i < st.Met.Order.Count; i++)
                WrCheckS($"{tag}.met{i}", metJ[i].GetString()!, st.Met.Order[i], "");
            var twJ = sJ.GetProperty("totalWars");
            WrCheckI($"{tag}.twN", twJ.GetArrayLength(), st.TotalWars.Count, "");
            for (int i = 0; i < twJ.GetArrayLength() && i < st.TotalWars.Order.Count; i++)
                WrCheckS($"{tag}.tw{i}", twJ[i].GetString()!, st.TotalWars.Order[i], "");
            var wdJ = sJ.GetProperty("warData");
            WrCheckI($"{tag}.wdN", wdJ.GetArrayLength(), st.WarData.Count, "");
            {
                int wi = 0;
                foreach (var w in wdJ.EnumerateArray())
                {
                    if (wi < st.WarData.Order.Count)
                        WrCheckWarInfo($"{tag}.wd{wi}", w, st.WarData.Get(st.WarData.Order[wi])!);
                    wi++;
                }
            }
            var whJ = sJ.GetProperty("warHistory");
            WrCheckI($"{tag}.whN", whJ.GetArrayLength(), st.WarHistory.Count, "");
            for (int i = 0; i < whJ.GetArrayLength() && i < st.WarHistory.Count; i++)
                WrCheckI($"{tag}.wh{i}", whJ[i].GetInt64(), st.WarHistory[i], "");
            WrCheckI($"{tag}.statWars", sJ.GetProperty("statWars").GetInt64(), host.StatWars, "");
            var goldsJ = sJ.GetProperty("golds").EnumerateArray().ToArray();
            WrCheckI($"{tag}.goldN", goldsJ.Length, host.Civs.Count, "");
            for (int i = 0; i < goldsJ.Length && i < host.Civs.Count; i++)
            {
                var gJ = goldsJ[i];
                WrCheckNOpt($"{tag}.gold{i}", gJ.ValueKind == JsonValueKind.Null ? null : gJ.GetString()!, host.Civs[i]?.Gold, "");
            }
            WrCheckEvents($"{tag}.evt", sJ.GetProperty("evts"), host, evStart);
        }
        var wrTail = c.GetProperty("tailDraws").EnumerateArray().GetEnumerator();
        for (int i = 0; i < 4 && wrTail.MoveNext(); i++)
            WrCheckN($"wr.{name}.rngTail[{i}]", wrTail.Current.GetString()!, WbRng.Next(ref st.RngA), "");
    }
}

// ============================================================================
// M-U3 切片 2：联盟域开闸（Wa 段——gen-units-alliance.mjs 9 场景 65 步）
// 蓝本：formAlliance/joinAlliance/leaveAlliance/dissolveAlliance/allianceTick 六段
//   + declareWar 集体防御/联军出击级联 + makePeace 阵营停战级联（切片 1 三段哨兵开闸）。
// 单位影子（dead/race/civ/caravan）：allianceTick ④ 龙计数+盟内商队过滤消费面。
// ============================================================================
var waPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-alliance.json");
if (!File.Exists(waPath)) waPath = "golden-units-alliance.json";
if (File.Exists(waPath))
{
    var wad = JsonDocument.Parse(File.ReadAllText(waPath)).RootElement;
    var waEp = wad.GetProperty("ep");
    double waDeclareRate = waEp.GetProperty("declareRate").GetDouble();
    double waTensionDecay = waEp.GetProperty("tensionDecay").GetDouble();
    double waMilPressure = waEp.GetProperty("milPressure").GetDouble();

    static ulong WaLeHexToBits(string h)
    {
        ulong v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | Convert.ToUInt64(h.Substring(i * 2, 2), 16);
        return v;
    }
    void WaCheckN(string tag, string? jsStr, double actual, string loc)
    {
        total++;
        ulong jsBits = 0; bool jsIsNaN = false;
        if (jsStr != null)
        {
            jsBits = WaLeHexToBits(jsStr);
            jsIsNaN = (jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0;
        }
        bool cNaN = double.IsNaN(actual);
        bool jNaN = jsStr == null || jsIsNaN;
        if (cNaN && jNaN) return;
        if (cNaN && !jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#=NaN"); return; }
        if (!cNaN && jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr ?? "undefined"}(NaN) C#={actual:R}"); return; }
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#={actual:R}"); }
    }
    void WaCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void WaCheckS(string tag, string? expect, string? actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void WaCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void WaCheckNOpt(string tag, string? jsStr, double? actual, string loc)
    {
        if (jsStr == null && actual == null) { total++; return; }
        WaCheckN(tag, jsStr, actual ?? double.NaN, loc);
    }
    void WaLoadCivs(WbWarsHost host, JsonElement civsJ)
    {
        host.Civs.Clear();
        foreach (var cj in civsJ.EnumerateArray())
        {
            var cv = new WbCiv
            {
                Id = cj.GetProperty("id").GetInt32(),
                Name = cj.GetProperty("name").GetString()!,
                Race = cj.GetProperty("race").GetInt32(),
                ColorHex = cj.GetProperty("colorHex").GetString()!,
                Pop = cj.GetProperty("pop").GetDouble(),
                Capital = cj.GetProperty("capital").GetInt32(),
                Alive = cj.GetProperty("alive").GetBoolean(),
            };
            var tnJ = cj.GetProperty("tilesN");
            for (int k = 0; k < tnJ.GetInt32(); k++) cv.Tiles.Add(900000 + k);   // 旧场景领土域零触达——id 无关
            var gJ = cj.GetProperty("gold");
            cv.Gold = gJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WaLeHexToBits(gJ.GetString()!));
            var mJ = cj.GetProperty("militarism");
            cv.Militarism = mJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WaLeHexToBits(mJ.GetString()!));
            var gvJ = cj.GetProperty("gov");
            cv.Gov = gvJ.ValueKind == JsonValueKind.Null ? null : gvJ.GetInt32();
            var cuJ = cj.GetProperty("culture");
            cv.Culture = cuJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WaLeHexToBits(cuJ.GetString()!));
            while (host.Civs.Count <= cv.Id) host.Civs.Add(null);
            host.Civs[cv.Id] = cv;
        }
    }
    void WaCheckMapN2(string tag, JsonElement jsArr, WbOrderedMap<string, double> map)
    {
        WaCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WaCheckS($"{tag}.k{i}", kv[0].GetString()!, map.Order[i], "");
                WaCheckN($"{tag}.v{i}", kv[1].GetString()!, map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WaCheckMapI2(string tag, JsonElement jsArr, WbOrderedMap<string, int> map)
    {
        WaCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WaCheckS($"{tag}.k{i}", kv[0].GetString()!, map.Order[i], "");
                WaCheckI($"{tag}.v{i}", kv[1].GetInt64(), map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WaCheckMapII2(string tag, JsonElement jsArr, WbOrderedMap<int, int> map)
    {
        WaCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WaCheckI($"{tag}.k{i}", kv[0].GetInt64(), map.Order[i], "");
                WaCheckI($"{tag}.v{i}", kv[1].GetInt64(), map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WaCheckWarData(string tag, JsonElement w, WbWarInfo wd)
    {
        WaCheckS($"{tag}.key", w.GetProperty("key").GetString()!, wd.Key, "");
        WaCheckI($"{tag}.a", w.GetProperty("a").GetInt32(), wd.A, "");
        WaCheckI($"{tag}.b", w.GetProperty("b").GetInt32(), wd.B, "");
        WaCheckI($"{tag}.startTick", w.GetProperty("startTick").GetInt64(), wd.StartTick, "");
        WaCheckI($"{tag}.startYear", w.GetProperty("startYear").GetInt64(), wd.StartYear, "");
        WaCheckB($"{tag}.total", w.GetProperty("total").GetBoolean(), wd.Total, "");
        WaCheckI($"{tag}.scoreA", w.GetProperty("scoreA").GetInt64(), (long)wd.ScoreA, "");
        WaCheckI($"{tag}.scoreB", w.GetProperty("scoreB").GetInt64(), (long)wd.ScoreB, "");
        WaCheckI($"{tag}.casA", w.GetProperty("casA").GetInt64(), wd.CasA, "");
        WaCheckI($"{tag}.casB", w.GetProperty("casB").GetInt64(), wd.CasB, "");
        WaCheckI($"{tag}.razedA", w.GetProperty("razedA").GetInt64(), wd.RazedA, "");
        WaCheckI($"{tag}.razedB", w.GetProperty("razedB").GetInt64(), wd.RazedB, "");
        WaCheckI($"{tag}.battles", w.GetProperty("battles").GetInt64(), wd.Battles, "");
        WaCheckI($"{tag}.giveUpAt", w.GetProperty("giveUpAt").GetInt64(), wd.GiveUpAt, "");
        WaCheckS($"{tag}.reason", w.GetProperty("reason").GetString()!, wd.Reason, "");
        WaCheckS($"{tag}.reasonText", w.GetProperty("reasonText").GetString()!, wd.ReasonText, "");
        WaCheckI($"{tag}.aggressor", w.GetProperty("aggressor").GetInt32(), wd.Aggressor, "");
        WaCheckI($"{tag}.goal", w.GetProperty("goal").GetInt64(), wd.Goal, "");
        WaCheckI($"{tag}.occA", w.GetProperty("occA").GetInt64(), wd.OccA, "");
        WaCheckI($"{tag}.occB", w.GetProperty("occB").GetInt64(), wd.OccB, "");
        WaCheckN($"{tag}.popA0", w.GetProperty("popA0").GetString()!, wd.PopA0, "");
        WaCheckN($"{tag}.popB0", w.GetProperty("popB0").GetString()!, wd.PopB0, "");
        WaCheckI($"{tag}.lastActiveTick", w.GetProperty("lastActiveTick").GetInt64(), wd.LastActiveTick, "");
    }
    void WaCheckEvents(string tag, JsonElement evtsJ, WbWarsHost host, int start)
    {
        WaCheckI($"{tag}.n", evtsJ.GetArrayLength(), host.PendingEvents.Count - start, "");
        for (int i = start; i < host.PendingEvents.Count; i++)
        {
            var e = evtsJ[i - start];
            var pe = host.PendingEvents[i];
            WaCheckI($"{tag}{i}.id", e.GetProperty("id").GetInt64(), pe.Id, "");
            WaCheckI($"{tag}{i}.year", e.GetProperty("year").GetInt64(), pe.Year, "");
            WaCheckS($"{tag}{i}.kind", e.GetProperty("kind").GetString()!, pe.Kind, "");
            WaCheckS($"{tag}{i}.text", e.GetProperty("text").GetString()!, pe.Text, "");
            var chJ = e.GetProperty("colorHex");
            WaCheckS($"{tag}{i}.colorHex", chJ.ValueKind == JsonValueKind.Null ? null : chJ.GetString()!, pe.ColorHex, "");
            var xJ = e.GetProperty("x"); var yJ = e.GetProperty("y");
            WaCheckNOpt($"{tag}{i}.x", xJ.ValueKind == JsonValueKind.Null ? null : xJ.GetString()!, pe.X, "");
            WaCheckNOpt($"{tag}{i}.y", yJ.ValueKind == JsonValueKind.Null ? null : yJ.GetString()!, pe.Y, "");
        }
    }
    void WaCheckAlliances(string tag, JsonElement alliJ, WbWarsHost host, WbOrderedMap<int, int> alOf, WbOrderedMap<int, int> alCd, int alSeq, JsonElement alOfJ, JsonElement alCdJ, long alSeqJs)
    {
        WaCheckI($"{tag}.n", alliJ.GetArrayLength(), host.Alliances.Count, "");
        int ai = 0;
        foreach (var a in alliJ.EnumerateArray())
        {
            if (ai < host.Alliances.Count)
            {
                var al = host.Alliances[ai];
                WaCheckI($"{tag}{ai}.id", a.GetProperty("id").GetInt32(), al.Id, "");
                WaCheckS($"{tag}{ai}.name", a.GetProperty("name").GetString()!, al.Name, "");
                var memJ = a.GetProperty("members");
                WaCheckI($"{tag}{ai}.memN", memJ.GetArrayLength(), al.Members.Count, "");
                for (int m = 0; m < memJ.GetArrayLength() && m < al.Members.Count; m++)
                    WaCheckI($"{tag}{ai}.mem{m}", memJ[m].GetInt64(), al.Members[m], "");
                WaCheckI($"{tag}{ai}.leader", a.GetProperty("leader").GetInt32(), al.Leader, "");
                WaCheckN($"{tag}{ai}.cohesion", a.GetProperty("cohesion").GetString()!, al.Cohesion, "");
                WaCheckI($"{tag}{ai}.formedTick", a.GetProperty("formedTick").GetInt64(), al.FormedTick, "");
                WaCheckI($"{tag}{ai}.formedYear", a.GetProperty("formedYear").GetInt64(), al.FormedYear, "");
                WaCheckI($"{tag}{ai}.warsTogether", a.GetProperty("warsTogether").GetInt64(), al.WarsTogether, "");
                WaCheckB($"{tag}{ai}.bonded", a.GetProperty("bonded").GetBoolean(), al.Bonded, "");
                var chJ = a.GetProperty("colorHex");
                WaCheckS($"{tag}{ai}.colorHex", chJ.ValueKind == JsonValueKind.Null ? null : chJ.GetString()!, al.ColorHex, "");
            }
            ai++;
        }
        WaCheckMapII2($"{tag}.alOf", alOfJ, alOf);
        WaCheckMapII2($"{tag}.alCd", alCdJ, alCd);
        WaCheckI($"{tag}.alSeq", alSeqJs, alSeq, "");
    }

    foreach (var c in wad.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        uint seed = (uint)c.GetProperty("seed").GetInt64();
        var envJ = c.GetProperty("env");
        var host = new WbWarsHost
        {
            LawsWars = envJ.GetProperty("lawsWars").GetBoolean(),
            TickCount = envJ.GetProperty("tick").GetInt32(),
            YearF = envJ.GetProperty("yearF").GetDouble(),
            LastCatastropheTick = envJ.GetProperty("catTick").GetInt64(),
            AllianceSeq = envJ.GetProperty("allianceSeq").GetInt32(),
            ZombieOutbreakNoted = envJ.GetProperty("zombieOutbreak").GetBoolean(),
            AllianceColors = wad.GetProperty("allianceColors").EnumerateArray().Select((x) => x.GetString()!).ToArray(),
            EpDeclareRate = waDeclareRate, EpTensionDecay = waTensionDecay, EpMilPressure = waMilPressure,
        };
        WaLoadCivs(host, c.GetProperty("civs"));
        foreach (var prop in wad.GetProperty("raceDiplo").EnumerateObject())
        { host.RaceDiplo[int.Parse(prop.Name)] = prop.Value.GetDouble(); host.RaceExists[int.Parse(prop.Name)] = true; }
        foreach (var prop in wad.GetProperty("raceIds").EnumerateArray())
            host.RaceExists[prop.GetInt32()] = true;
        foreach (var prop in wad.GetProperty("raceRelBase").EnumerateObject())
            host.RaceRelBase[prop.Name] = prop.Value.GetDouble();
        foreach (var uJ in envJ.GetProperty("units").EnumerateArray())
            host.Units.Add(new WbAlUnit { Dead = uJ.GetProperty("dead").GetBoolean(), Race = uJ.GetProperty("race").GetInt32(), Civ = uJ.GetProperty("civ").GetInt32(), Caravan = uJ.GetProperty("caravan").GetInt32() });
        var st = new WbWarsState { RngA = seed };

        var stepsJ = c.GetProperty("steps").EnumerateArray().ToArray();
        var opsJ = c.GetProperty("ops").EnumerateArray().ToArray();
        for (int si = 0; si < opsJ.Length; si++)
        {
            var op = opsJ[si];
            var o = op.GetProperty("op").GetString()!;
            int evStart = host.PendingEvents.Count;
            int draws0 = st.RngDraws;
            long? probe = null;
            switch (o)
            {
                case "meet": WbDiplomacy.DiplomacyMeet(st, host, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()); break;
                case "war":
                {
                    WbWarOpts? opts = null;
                    if (op.TryGetProperty("opts", out var optsJ) && optsJ.ValueKind == JsonValueKind.Object)
                    {
                        opts = new WbWarOpts();
                        if (optsJ.TryGetProperty("total", out var tj)) opts.Total = tj.GetBoolean();
                        if (optsJ.TryGetProperty("goal", out var gj)) opts.Goal = gj.GetInt32();
                        if (optsJ.TryGetProperty("force", out var fj)) opts.Force = fj.GetBoolean();
                        if (optsJ.TryGetProperty("quiet", out var qj)) opts.Quiet = qj.GetBoolean();
                    }
                    WbDiplomacy.DeclareWar(st, host, op.GetProperty("agg").GetInt32(), op.GetProperty("vic").GetInt32(), op.GetProperty("reason").GetString()!, opts);
                    break;
                }
                case "peace":
                {
                    int postRel = op.TryGetProperty("postRel", out var pj) ? pj.GetInt32() : 25;
                    WbDiplomacy.MakePeace(st, host, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32(), op.GetProperty("text").GetString()!, postRel);
                    break;
                }
                case "tick": WbDiplomacy.WarTick(st, host); break;
                case "atick": WbDiplomacy.AllianceTick(st, host); break;
                case "formal": WbDiplomacy.FormAlliance(st, host, host.CivAt(op.GetProperty("a").GetInt32())!, host.CivAt(op.GetProperty("b").GetInt32())!); break;
                case "joinal":
                {
                    var alId = op.GetProperty("al").GetInt32();
                    var al = host.Alliances.Find((x) => x.Id == alId);
                    WbDiplomacy.JoinAlliance(st, host, al!, host.CivAt(op.GetProperty("c").GetInt32())!);
                    break;
                }
                case "leaveal": WbDiplomacy.LeaveAlliance(st, host, op.GetProperty("c").GetInt32(), op.GetProperty("cause").GetString()!); break;
                case "disal":
                {
                    var alId = op.GetProperty("al").GetInt32();
                    var al = host.Alliances.Find((x) => x.Id == alId);
                    WbDiplomacy.DissolveAlliance(st, host, al!, op.GetProperty("text").GetString()!);
                    break;
                }
                case "setrel": st.Rel.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("v").GetDouble()); break;
                case "setten": st.Tension.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("v").GetDouble()); break;
                case "setshame": st.WarShame.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("who").GetInt32()); break;
                case "setrace": st.RaceRel.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("v").GetDouble()); break;
                case "met": st.Met.Add(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32())); break;
                case "adv": host.TickCount += op.GetProperty("n").GetInt32(); break;
                case "atwar": probe = WbDiplomacy.AtWar(st, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()) ? 1 : 0; break;
                default: throw new Exception("op not found: " + o);
            }

            var sJ = stepsJ[si];
            string tag = $"wa.{name}.s{si}";
            WaCheckS($"{tag}.op", o, sJ.GetProperty("op").GetString()!, "");
            WaCheckI($"{tag}.draws", sJ.GetProperty("draws").GetInt64(), st.RngDraws - draws0, "");
            var probeJ = sJ.GetProperty("probe");
            long probeExpect = probeJ.ValueKind == JsonValueKind.Null ? -1 : probeJ.GetInt64();
            WaCheckI($"{tag}.probe", probeExpect, probe ?? -1, "");
            WaCheckMapN2($"{tag}.rel", sJ.GetProperty("rel"), st.Rel);
            WaCheckMapN2($"{tag}.tension", sJ.GetProperty("tension"), st.Tension);
            WaCheckMapN2($"{tag}.raceRel", sJ.GetProperty("raceRel"), st.RaceRel);
            WaCheckMapI2($"{tag}.warShame", sJ.GetProperty("warShame"), st.WarShame);
            WaCheckMapII2($"{tag}.lastDeclareAt", sJ.GetProperty("lastDeclareAt"), st.LastDeclareAt);
            var metJ = sJ.GetProperty("met");
            WaCheckI($"{tag}.metN", metJ.GetArrayLength(), st.Met.Count, "");
            for (int i = 0; i < metJ.GetArrayLength() && i < st.Met.Order.Count; i++)
                WaCheckS($"{tag}.met{i}", metJ[i].GetString()!, st.Met.Order[i], "");
            var twJ = sJ.GetProperty("totalWars");
            WaCheckI($"{tag}.twN", twJ.GetArrayLength(), st.TotalWars.Count, "");
            for (int i = 0; i < twJ.GetArrayLength() && i < st.TotalWars.Order.Count; i++)
                WaCheckS($"{tag}.tw{i}", twJ[i].GetString()!, st.TotalWars.Order[i], "");
            var wdJ = sJ.GetProperty("warData");
            WaCheckI($"{tag}.wdN", wdJ.GetArrayLength(), st.WarData.Count, "");
            {
                int wi = 0;
                foreach (var w in wdJ.EnumerateArray())
                {
                    if (wi < st.WarData.Order.Count)
                        WaCheckWarData($"{tag}.wd{wi}", w, st.WarData.Get(st.WarData.Order[wi])!);
                    wi++;
                }
            }
            var whJ = sJ.GetProperty("warHistory");
            WaCheckI($"{tag}.whN", whJ.GetArrayLength(), st.WarHistory.Count, "");
            for (int i = 0; i < whJ.GetArrayLength() && i < st.WarHistory.Count; i++)
                WaCheckI($"{tag}.wh{i}", whJ[i].GetInt64(), st.WarHistory[i], "");
            WaCheckI($"{tag}.statWars", sJ.GetProperty("statWars").GetInt64(), host.StatWars, "");
            var goldsJ = sJ.GetProperty("golds").EnumerateArray().ToArray();
            {
                int gi = 0;
                foreach (var cv in host.Civs)
                {
                    if (cv == null) continue;   // 稀疏洞不入 golds（gen filter(Boolean) 同序）
                    WaCheckNOpt($"{tag}.gold{gi}", goldsJ[gi].ValueKind == JsonValueKind.Null ? null : goldsJ[gi].GetString()!, cv.Gold, "");
                    gi++;
                }
            }
            WaCheckAlliances($"{tag}.alli", sJ.GetProperty("alli"), host, st.AllianceOf, st.AllianceWarCd, host.AllianceSeq,
                sJ.GetProperty("alOf"), sJ.GetProperty("alCd"), sJ.GetProperty("alSeq").GetInt64());
            WaCheckEvents($"{tag}.evt", sJ.GetProperty("evts"), host, evStart);
        }
        var waTail = c.GetProperty("tailDraws").EnumerateArray().GetEnumerator();
        for (int i = 0; i < 4 && waTail.MoveNext(); i++)
            WaCheckN($"wa.{name}.rngTail[{i}]", waTail.Current.GetString()!, WbRng.Next(ref st.RngA), "");
    }
}

// ============================================================================
// M-U3 切片 3：warInfoTick 战争结算域（Wi 段——gen-units-warinfo.mjs 12 场景 75 步）
// 蓝本：warInfoTick 全链（财政/建档兜底/sig/wear/concludeGoalWar/concludeByScore/
//   sustainOf 崩溃/灭国放弃/升级/沉寂/跨代）+ settleFront 开闸 + claimTile 转正链
//   + onWarKill +2 接线 + 领土/建筑/占领层最小状态面。
// 快照面：warData 29 列（wearA/wearB/sigMark null ≡ TS undefined）+ 财政四元
//   （golds/stabs/exps/pops bitHex|null）+ 领土（tiles/tilesN/frontierN）+ 占领层
//   （occ 插入序）+ 建筑（bIdx 插入序/buildings/bHp）+ dirtyN + fx（seed/dir 2 抽）。
// ============================================================================
var wiPath = Path.Combine(AppContext.BaseDirectory, "../../../../golden-units-warinfo.json");
if (!File.Exists(wiPath)) wiPath = "golden-units-warinfo.json";
if (File.Exists(wiPath))
{
    var wid = JsonDocument.Parse(File.ReadAllText(wiPath)).RootElement;
    var wiEp = wid.GetProperty("ep");
    double wiDeclareRate = wiEp.GetProperty("declareRate").GetDouble();
    double wiTensionDecay = wiEp.GetProperty("tensionDecay").GetDouble();
    double wiMilPressure = wiEp.GetProperty("milPressure").GetDouble();
    var wiBHpTable = wid.GetProperty("bHp").EnumerateArray().Select(x => x.GetDouble()).ToArray();

    static ulong WiLeHexToBits(string h)
    {
        ulong v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | Convert.ToUInt64(h.Substring(i * 2, 2), 16);
        return v;
    }
    void WiCheckN(string tag, string? jsStr, double actual, string loc)
    {
        total++;
        ulong jsBits = 0; bool jsIsNaN = false;
        if (jsStr != null)
        {
            jsBits = WiLeHexToBits(jsStr);
            jsIsNaN = (jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0;
        }
        bool cNaN = double.IsNaN(actual);
        bool jNaN = jsStr == null || jsIsNaN;
        if (cNaN && jNaN) return;
        if (cNaN && !jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#=NaN"); return; }
        if (!cNaN && jNaN) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr ?? "undefined"}(NaN) C#={actual:R}"); return; }
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsStr} C#={actual:R}"); }
    }
    void WiCheckI(string tag, long expect, long actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void WiCheckB(string tag, bool expect, bool actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void WiCheckS(string tag, string? expect, string? actual, string loc)
    {
        total++;
        if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); }
    }
    void WiCheckNOpt(string tag, string? jsStr, double? actual, string loc)
    {
        if (jsStr == null && actual == null) { total++; return; }
        WiCheckN(tag, jsStr, actual ?? double.NaN, loc);
    }
    void WiCheckIOpt(string tag, JsonElement jsV, long actual, string loc)
    {
        if (jsV.ValueKind == JsonValueKind.Null) { WiCheckI(tag, -1, actual, loc); return; }
        WiCheckI(tag, jsV.GetInt64(), actual, loc);
    }

    void WiLoadCivs(WbWarsHost host, WbWarsState st, JsonElement civsJ)
    {
        host.Civs.Clear();
        foreach (var cj in civsJ.EnumerateArray())
        {
            var cv = new WbCiv
            {
                Id = cj.GetProperty("id").GetInt32(),
                Name = cj.GetProperty("name").GetString()!,
                Race = cj.GetProperty("race").GetInt32(),
                ColorHex = cj.GetProperty("colorHex").GetString()!,
                Pop = cj.GetProperty("pop").GetDouble(),
                Capital = cj.GetProperty("capital").GetInt32(),
                Alive = cj.GetProperty("alive").GetBoolean(),
            };
            foreach (var t in cj.GetProperty("tiles").EnumerateArray())
            {
                int ti = t.GetInt32();
                cv.Tiles.Add(ti);
                st.Owner[ti] = cv.Id;   // 领土预置（concludeByScore/touchesOwner 一致性前提）
                st.Terrain[ti] = WbConstants.TGrass;
            }
            var gJ = cj.GetProperty("gold");
            cv.Gold = gJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WiLeHexToBits(gJ.GetString()!));
            var mJ = cj.GetProperty("militarism");
            cv.Militarism = mJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WiLeHexToBits(mJ.GetString()!));
            var gvJ = cj.GetProperty("gov");
            cv.Gov = gvJ.ValueKind == JsonValueKind.Null ? null : gvJ.GetInt32();
            var sJ = cj.GetProperty("stability");
            cv.Stability = sJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WiLeHexToBits(sJ.GetString()!));
            var eJ = cj.GetProperty("expense");
            cv.Expense = eJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WiLeHexToBits(eJ.GetString()!));
            var muJ = cj.GetProperty("mobilizeUntil");
            cv.MobilizeUntil = muJ.ValueKind == JsonValueKind.Null ? null : BitConverter.UInt64BitsToDouble(WiLeHexToBits(muJ.GetString()!));
            while (host.Civs.Count <= cv.Id) host.Civs.Add(null);
            host.Civs[cv.Id] = cv;
        }
        // 邻域地形填草（stub 面全 GRASS——frontier push isLand 语义）
        for (int i = 0; i < host.Civs.Count; i++)
            if (host.Civs[i] != null)
                foreach (var t in host.Civs[i]!.Tiles)
                    for (int d = -1; d <= 1; d += 2)
                    {
                        int x = t % WbConstants.W, y = t / WbConstants.W;
                        if (x + d >= 0 && x + d < WbConstants.W) st.Terrain[t + d] = WbConstants.TGrass;
                        if (y + d >= 0 && y + d < WbConstants.H) st.Terrain[t + d * WbConstants.W] = WbConstants.TGrass;
                    }
    }
    void WiLoadRaceTable(WbWarsHost host, JsonElement obj, double[] target)
    {
        foreach (var prop in obj.EnumerateObject())
            target[int.Parse(prop.Name)] = prop.Value.GetDouble();
    }
    void WiCheckMapN(string tag, JsonElement jsArr, WbOrderedMap<string, double> map)
    {
        WiCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WiCheckS($"{tag}.k{i}", kv[0].GetString()!, map.Order[i], "");
                WiCheckN($"{tag}.v{i}", kv[1].GetString()!, map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WiCheckMapI(string tag, JsonElement jsArr, WbOrderedMap<string, int> map)
    {
        WiCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WiCheckS($"{tag}.k{i}", kv[0].GetString()!, map.Order[i], "");
                WiCheckI($"{tag}.v{i}", kv[1].GetInt64(), map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WiCheckMapII(string tag, JsonElement jsArr, WbOrderedMap<int, int> map)
    {
        WiCheckI($"{tag}.n", jsArr.GetArrayLength(), map.Count, "");
        int i = 0;
        foreach (var e in jsArr.EnumerateArray())
        {
            var kv = e.EnumerateArray().ToArray();
            if (i < map.Order.Count)
            {
                WiCheckI($"{tag}.k{i}", kv[0].GetInt64(), map.Order[i], "");
                WiCheckI($"{tag}.v{i}", kv[1].GetInt64(), map.Get(map.Order[i]), "");
            }
            i++;
        }
    }
    void WiCheckWarInfo(string tag, JsonElement w, WbWarInfo wd)
    {
        WiCheckS($"{tag}.key", w.GetProperty("key").GetString()!, wd.Key, "");
        WiCheckI($"{tag}.a", w.GetProperty("a").GetInt32(), wd.A, "");
        WiCheckI($"{tag}.b", w.GetProperty("b").GetInt32(), wd.B, "");
        WiCheckI($"{tag}.startTick", w.GetProperty("startTick").GetInt64(), wd.StartTick, "");
        WiCheckI($"{tag}.startYear", w.GetProperty("startYear").GetInt64(), wd.StartYear, "");
        WiCheckB($"{tag}.total", w.GetProperty("total").GetBoolean(), wd.Total, "");
        WiCheckN($"{tag}.scoreA", w.GetProperty("scoreA").GetString()!, wd.ScoreA, "");
        WiCheckN($"{tag}.scoreB", w.GetProperty("scoreB").GetString()!, wd.ScoreB, "");
        WiCheckN($"{tag}.exA", w.GetProperty("exA").GetString()!, wd.ExA, "");
        WiCheckN($"{tag}.exB", w.GetProperty("exB").GetString()!, wd.ExB, "");
        WiCheckNOpt($"{tag}.wearA", w.GetProperty("wearA").ValueKind == JsonValueKind.Null ? null : w.GetProperty("wearA").GetString()!, wd.WearA, "");
        WiCheckNOpt($"{tag}.wearB", w.GetProperty("wearB").ValueKind == JsonValueKind.Null ? null : w.GetProperty("wearB").GetString()!, wd.WearB, "");
        WiCheckI($"{tag}.casA", w.GetProperty("casA").GetInt64(), wd.CasA, "");
        WiCheckI($"{tag}.casB", w.GetProperty("casB").GetInt64(), wd.CasB, "");
        WiCheckI($"{tag}.razedA", w.GetProperty("razedA").GetInt64(), wd.RazedA, "");
        WiCheckI($"{tag}.razedB", w.GetProperty("razedB").GetInt64(), wd.RazedB, "");
        WiCheckI($"{tag}.battles", w.GetProperty("battles").GetInt64(), wd.Battles, "");
        WiCheckI($"{tag}.giveUpAt", w.GetProperty("giveUpAt").GetInt64(), wd.GiveUpAt, "");
        WiCheckS($"{tag}.reason", w.GetProperty("reason").GetString()!, wd.Reason, "");
        WiCheckS($"{tag}.reasonText", w.GetProperty("reasonText").GetString()!, wd.ReasonText, "");
        WiCheckI($"{tag}.aggressor", w.GetProperty("aggressor").GetInt32(), wd.Aggressor, "");
        WiCheckI($"{tag}.goal", w.GetProperty("goal").GetInt64(), wd.Goal, "");
        WiCheckI($"{tag}.goalNow", w.GetProperty("goalNow").GetInt64(), wd.GoalNow, "");
        WiCheckI($"{tag}.occA", w.GetProperty("occA").GetInt64(), wd.OccA, "");
        WiCheckI($"{tag}.occB", w.GetProperty("occB").GetInt64(), wd.OccB, "");
        WiCheckN($"{tag}.popA0", w.GetProperty("popA0").GetString()!, wd.PopA0, "");
        WiCheckN($"{tag}.popB0", w.GetProperty("popB0").GetString()!, wd.PopB0, "");
        WiCheckIOpt($"{tag}.sigMark", w.GetProperty("sigMark"), wd.SigMark ?? -1, "");
        WiCheckIOpt($"{tag}.lastActiveTick", w.GetProperty("lastActiveTick"), wd.LastActiveTick, "");
    }
    void WiCheckEvents(string tag, JsonElement evtsJ, WbWarsHost host, int start)
    {
        WiCheckI($"{tag}.n", evtsJ.GetArrayLength(), host.PendingEvents.Count - start, "");
        for (int i = start; i < host.PendingEvents.Count; i++)
        {
            var e = evtsJ[i - start];
            var pe = host.PendingEvents[i];
            WiCheckI($"{tag}{i}.id", e.GetProperty("id").GetInt64(), pe.Id, "");
            WiCheckI($"{tag}{i}.year", e.GetProperty("year").GetInt64(), pe.Year, "");
            WiCheckS($"{tag}{i}.kind", e.GetProperty("kind").GetString()!, pe.Kind, "");
            WiCheckS($"{tag}{i}.text", e.GetProperty("text").GetString()!, pe.Text, "");
            var chJ = e.GetProperty("colorHex");
            WiCheckS($"{tag}{i}.colorHex", chJ.ValueKind == JsonValueKind.Null ? null : chJ.GetString()!, pe.ColorHex, "");
            var xJ = e.GetProperty("x"); var yJ = e.GetProperty("y");
            WiCheckNOpt($"{tag}{i}.x", xJ.ValueKind == JsonValueKind.Null ? null : xJ.GetString()!, pe.X, "");
            WiCheckNOpt($"{tag}{i}.y", yJ.ValueKind == JsonValueKind.Null ? null : yJ.GetString()!, pe.Y, "");
        }
    }
    void WiCheckFx(string tag, JsonElement fxJ, WbWarsState st, int start)
    {
        WiCheckI($"{tag}.n", fxJ.GetArrayLength(), st.Effects.Count - start, "");
        for (int i = start; i < st.Effects.Count; i++)
        {
            var e = fxJ[i - start];
            var fe = st.Effects[i];
            WiCheckS($"{tag}{i}.kind", e.GetProperty("kind").GetString()!, fe.Kind, "");
            WiCheckN($"{tag}{i}.x", e.GetProperty("x").GetString()!, fe.X, "");
            WiCheckN($"{tag}{i}.y", e.GetProperty("y").GetString()!, fe.Y, "");
            WiCheckN($"{tag}{i}.r", e.GetProperty("r").GetString()!, fe.R, "");
            WiCheckI($"{tag}{i}.ttl", e.GetProperty("ttl").GetInt64(), fe.Ttl, "");
            WiCheckI($"{tag}{i}.seed", e.GetProperty("seed").GetInt64(), fe.Seed, "");
            WiCheckN($"{tag}{i}.dir", e.GetProperty("dir").GetString()!, fe.Dir, "");
        }
    }

    foreach (var c in wid.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        uint seed = (uint)c.GetProperty("seed").GetInt64();
        var envJ = c.GetProperty("env");
        var host = new WbWarsHost
        {
            LawsWars = envJ.GetProperty("lawsWars").GetBoolean(),
            TickCount = envJ.GetProperty("tick").GetInt32(),
            YearF = envJ.GetProperty("yearF").GetDouble(),
            Season = envJ.GetProperty("season").GetInt32(),
            EcoState = envJ.GetProperty("ecoState").GetString()!,
            EpDeclareRate = wiDeclareRate, EpTensionDecay = wiTensionDecay, EpMilPressure = wiMilPressure,
        };
        var st = new WbWarsState { RngA = seed };
        WiLoadCivs(host, st, c.GetProperty("civs"));
        WiLoadRaceTable(host, wid.GetProperty("raceDiplo"), host.RaceDiplo);
        WiLoadRaceTable(host, wid.GetProperty("raceAggr"), host.RaceAggr);
        WiLoadRaceTable(host, wid.GetProperty("raceGreed"), host.RaceGreed);
        foreach (var prop in wid.GetProperty("raceRelBase").EnumerateObject())
            host.RaceRelBase[prop.Name] = prop.Value.GetDouble();

        var stepsJ = c.GetProperty("steps").EnumerateArray().ToArray();
        var opsJ = c.GetProperty("ops").EnumerateArray().ToArray();
        for (int si = 0; si < opsJ.Length; si++)
        {
            var op = opsJ[si];
            var o = op.GetProperty("op").GetString()!;
            int evStart = host.PendingEvents.Count;
            int fxStart = st.Effects.Count;
            int draws0 = st.RngDraws;
            long? probeI = null;
            double? probeN = null;
            switch (o)
            {
                case "wtick": WbDiplomacy.WarInfoTick(st, host); break;
                case "war":
                {
                    WbWarOpts? opts = null;
                    if (op.TryGetProperty("opts", out var optsJ) && optsJ.ValueKind == JsonValueKind.Object)
                    {
                        opts = new WbWarOpts();
                        if (optsJ.TryGetProperty("total", out var tj)) opts.Total = tj.GetBoolean();
                        if (optsJ.TryGetProperty("goal", out var gj)) opts.Goal = gj.GetInt32();
                        if (optsJ.TryGetProperty("force", out var fj)) opts.Force = fj.GetBoolean();
                        if (optsJ.TryGetProperty("quiet", out var qj)) opts.Quiet = qj.GetBoolean();
                    }
                    WbDiplomacy.DeclareWar(st, host, op.GetProperty("agg").GetInt32(), op.GetProperty("vic").GetInt32(), op.GetProperty("reason").GetString()!, opts);
                    break;
                }
                case "peace":
                {
                    int postRel = op.TryGetProperty("postRel", out var pj) ? pj.GetInt32() : 25;
                    WbDiplomacy.MakePeace(st, host, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32(), op.GetProperty("text").GetString()!, postRel);
                    break;
                }
                case "adv": host.TickCount += op.GetProperty("n").GetInt32(); break;
                case "setrel": st.Rel.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("v").GetDouble()); break;
                case "met": st.Met.Add(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32())); break;
                case "setwd":
                {
                    var wd = st.WarData.Get(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()))!;
                    foreach (var prop in op.GetProperty("patch").EnumerateObject())
                    {
                        switch (prop.Name)
                        {
                            case "scoreA": wd.ScoreA = prop.Value.GetDouble(); break;
                            case "scoreB": wd.ScoreB = prop.Value.GetDouble(); break;
                            case "startTick": wd.StartTick = prop.Value.GetInt32(); break;
                            case "occA": wd.OccA = prop.Value.GetInt32(); break;
                            case "occB": wd.OccB = prop.Value.GetInt32(); break;
                            case "wearA": wd.WearA = prop.Value.GetDouble(); break;
                            case "wearB": wd.WearB = prop.Value.GetDouble(); break;
                            case "sigMark": wd.SigMark = prop.Value.GetInt32(); break;
                            case "exA": wd.ExA = prop.Value.GetDouble(); break;
                            case "exB": wd.ExB = prop.Value.GetDouble(); break;
                            case "casA": wd.CasA = prop.Value.GetInt32(); break;
                            case "casB": wd.CasB = prop.Value.GetInt32(); break;
                            case "razedA": wd.RazedA = prop.Value.GetInt32(); break;
                            case "razedB": wd.RazedB = prop.Value.GetInt32(); break;
                            case "battles": wd.Battles = prop.Value.GetInt32(); break;
                            case "giveUpAt": wd.GiveUpAt = prop.Value.GetInt32(); break;
                            case "goal": wd.Goal = prop.Value.GetInt32(); break;
                            case "aggressor": wd.Aggressor = prop.Value.GetInt32(); break;
                            case "popA0": wd.PopA0 = prop.Value.GetDouble(); break;
                            case "popB0": wd.PopB0 = prop.Value.GetDouble(); break;
                            case "lastActiveTick": wd.LastActiveTick = prop.Value.GetInt32(); break;
                            default: throw new Exception("setwd field: " + prop.Name);
                        }
                    }
                    break;
                }
                case "setciv":
                {
                    var cv = host.Civs[op.GetProperty("id").GetInt32()]!;
                    foreach (var prop in op.GetProperty("patch").EnumerateObject())
                    {
                        switch (prop.Name)
                        {
                            case "pop": cv.Pop = prop.Value.GetDouble(); break;
                            case "gold": cv.Gold = prop.Value.GetDouble(); break;
                            case "stability": cv.Stability = prop.Value.GetDouble(); break;
                            case "expense": cv.Expense = prop.Value.GetDouble(); break;
                            case "mobilizeUntil": cv.MobilizeUntil = prop.Value.GetDouble(); break;
                            case "militarism": cv.Militarism = prop.Value.GetDouble(); break;
                            case "gov": cv.Gov = prop.Value.GetInt32(); break;
                            case "houses": cv.Houses = prop.Value.GetInt32(); break;
                            default: throw new Exception("setciv field: " + prop.Name);
                        }
                    }
                    break;
                }
                case "setocc":
                {
                    int i = op.GetProperty("i").GetInt32();
                    st.OccCiv[i] = op.GetProperty("civ").GetInt32();
                    st.OccStr[i] = op.GetProperty("str").GetInt32();
                    st.OccSet.Add(i);
                    break;
                }
                case "bld":
                {
                    // buildBuilding 落成面最小镜像（kind/civ/hp/houses——城墙不计住宅）
                    int i = op.GetProperty("i").GetInt32();
                    int kind = op.GetProperty("kind").GetInt32();
                    int civId = op.GetProperty("civ").GetInt32();
                    st.Building[i] = kind;
                    st.Buildings.Add(new WbBuilding { I = i, X = i % WbConstants.W, Y = i / WbConstants.W, Kind = kind, Civ = civId });
                    st.BIdx.Set(i, st.Buildings.Count - 1);
                    st.BHp.Set(i, wiBHpTable[kind]);
                    var bcv = host.Civs[civId];
                    if (bcv != null && kind != WbConstants.BuildWall) bcv.Houses++;
                    break;
                }
                case "warkill": WbDiplomacy.OnWarKill(st, host, op.GetProperty("kc").GetInt32(), op.GetProperty("vc").GetInt32()); break;
                case "killciv": host.Civs[op.GetProperty("id").GetInt32()]!.Alive = false; break;
                case "sustain":
                {
                    var wd = st.WarData.Get(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()))!;
                    int civId = op.GetProperty("civ").GetInt32();
                    probeN = WbDiplomacy.SustainOf(st, host, host.Civs[civId]!, wd, civId == wd.A);
                    break;
                }
                case "goalnow": probeI = WbDiplomacy.WarGoalNow(st, host, st.WarData.Get(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()))!); break;
                case "goalmet": probeI = WbDiplomacy.WarGoalMet(st, host, st.WarData.Get(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()))!) ? 1 : 0; break;
                case "atwar": probeI = WbDiplomacy.AtWar(st, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()) ? 1 : 0; break;
                case "civatwar": probeI = WbDiplomacy.CivAtWar(st, host, op.GetProperty("civ").GetInt32()) ? 1 : 0; break;
                default: throw new Exception("op not found: " + o);
            }

            var sJ = stepsJ[si];
            string tag = $"wi.{name}.s{si}";
            WiCheckS($"{tag}.op", o, sJ.GetProperty("op").GetString()!, "");
            WiCheckI($"{tag}.draws", sJ.GetProperty("draws").GetInt64(), st.RngDraws - draws0, "");
            var probeJ = sJ.GetProperty("probe");
            if (probeJ.ValueKind == JsonValueKind.Null) WiCheckI($"{tag}.probe", -1, -1, "");
            else if (probeJ.ValueKind == JsonValueKind.String) WiCheckN($"{tag}.probe", probeJ.GetString()!, probeN ?? double.NaN, "");
            else WiCheckI($"{tag}.probe", probeJ.GetInt64(), probeI ?? -1, "");
            WiCheckMapN($"{tag}.rel", sJ.GetProperty("rel"), st.Rel);
            WiCheckMapN($"{tag}.tension", sJ.GetProperty("tension"), st.Tension);
            WiCheckMapN($"{tag}.raceRel", sJ.GetProperty("raceRel"), st.RaceRel);
            WiCheckMapI($"{tag}.warShame", sJ.GetProperty("warShame"), st.WarShame);
            WiCheckMapII($"{tag}.lastDeclareAt", sJ.GetProperty("lastDeclareAt"), st.LastDeclareAt);
            var metJ = sJ.GetProperty("met");
            WiCheckI($"{tag}.metN", metJ.GetArrayLength(), st.Met.Count, "");
            for (int i = 0; i < metJ.GetArrayLength() && i < st.Met.Order.Count; i++)
                WiCheckS($"{tag}.met{i}", metJ[i].GetString()!, st.Met.Order[i], "");
            var twJ = sJ.GetProperty("totalWars");
            WiCheckI($"{tag}.twN", twJ.GetArrayLength(), st.TotalWars.Count, "");
            for (int i = 0; i < twJ.GetArrayLength() && i < st.TotalWars.Order.Count; i++)
                WiCheckS($"{tag}.tw{i}", twJ[i].GetString()!, st.TotalWars.Order[i], "");
            var wdJ = sJ.GetProperty("warData");
            WiCheckI($"{tag}.wdN", wdJ.GetArrayLength(), st.WarData.Count, "");
            {
                int wi = 0;
                foreach (var w in wdJ.EnumerateArray())
                {
                    if (wi < st.WarData.Order.Count)
                        WiCheckWarInfo($"{tag}.wd{wi}", w, st.WarData.Get(st.WarData.Order[wi])!);
                    wi++;
                }
            }
            var whJ = sJ.GetProperty("warHistory");
            WiCheckI($"{tag}.whN", whJ.GetArrayLength(), st.WarHistory.Count, "");
            for (int i = 0; i < whJ.GetArrayLength() && i < st.WarHistory.Count; i++)
                WiCheckI($"{tag}.wh{i}", whJ[i].GetInt64(), st.WarHistory[i], "");
            WiCheckI($"{tag}.statWars", sJ.GetProperty("statWars").GetInt64(), host.StatWars, "");
            // 财政四元 + 领土三列（per civ——null ≡ 稀疏洞/undefined）
            string[][] colsJ = { sJ.GetProperty("golds").EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Null ? null : x.GetString()).ToArray(),
                                 sJ.GetProperty("stabs").EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Null ? null : x.GetString()).ToArray(),
                                 sJ.GetProperty("exps").EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Null ? null : x.GetString()).ToArray(),
                                 sJ.GetProperty("pops").EnumerateArray().Select(x => x.ValueKind == JsonValueKind.Null ? null : x.GetString()).ToArray() };
            Func<WbCiv, double?>[] getters = { cv => cv.Gold, cv => cv.Stability, cv => cv.Expense, cv => cv.Pop };
            for (int ci = 0; ci < 4; ci++)
            {
                WiCheckI($"{tag}.col{ci}.n", colsJ[ci].Length, host.Civs.Count, "");
                for (int i = 0; i < colsJ[ci].Length && i < host.Civs.Count; i++)
                    WiCheckNOpt($"{tag}.col{ci}[{i}]", colsJ[ci][i], host.Civs[i] == null ? null : getters[ci](host.Civs[i]!), "");
            }
            var tilesNJ = sJ.GetProperty("tilesN");
            WiCheckI($"{tag}.tilesN.n", tilesNJ.GetArrayLength(), host.Civs.Count, "");
            for (int i = 0; i < tilesNJ.GetArrayLength() && i < host.Civs.Count; i++)
            {
                var vJ = tilesNJ[i];
                WiCheckIOpt($"{tag}.tilesN[{i}]", vJ, host.Civs[i]?.TilesN ?? -1, "");
            }
            var housesJ = sJ.GetProperty("housesN");
            WiCheckI($"{tag}.housesN.n", housesJ.GetArrayLength(), host.Civs.Count, "");
            for (int i = 0; i < housesJ.GetArrayLength() && i < host.Civs.Count; i++)
            {
                var vJ = housesJ[i];
                WiCheckIOpt($"{tag}.housesN[{i}]", vJ, host.Civs[i]?.Houses ?? -1, "");
            }
            var frJ = sJ.GetProperty("frontierN");
            WiCheckI($"{tag}.frontierN.n", frJ.GetArrayLength(), host.Civs.Count, "");
            for (int i = 0; i < frJ.GetArrayLength() && i < host.Civs.Count; i++)
            {
                var vJ = frJ[i];
                WiCheckIOpt($"{tag}.frontierN[{i}]", vJ, host.Civs[i]?.Frontier.Count ?? -1, "");
            }
            var tilesJ = sJ.GetProperty("tiles");
            for (int i = 0; i < tilesJ.GetArrayLength() && i < host.Civs.Count; i++)
            {
                if (tilesJ[i].ValueKind == JsonValueKind.Null) continue;
                var tlJ = tilesJ[i];
                var cv = host.Civs[i]!;
                WiCheckI($"{tag}.tiles[{i}].n", tlJ.GetArrayLength(), cv.Tiles.Count, "");
                for (int k = 0; k < tlJ.GetArrayLength() && k < cv.Tiles.Count; k++)
                    WiCheckI($"{tag}.tiles[{i}][{k}]", tlJ[k].GetInt64(), cv.Tiles[k], "");
            }
            var occJ = sJ.GetProperty("occ");
            WiCheckI($"{tag}.occN", occJ.GetArrayLength(), st.OccSet.Count, "");
            {
                int oi = 0;
                foreach (var e in occJ.EnumerateArray())
                {
                    if (oi < st.OccSet.Order.Count)
                    {
                        int i2 = st.OccSet.Order[oi];
                        WiCheckI($"{tag}.occ{oi}.i", e.GetProperty("i").GetInt64(), i2, "");
                        WiCheckI($"{tag}.occ{oi}.civ", e.GetProperty("civ").GetInt64(), st.OccCiv[i2], "");
                        WiCheckI($"{tag}.occ{oi}.str", e.GetProperty("str").GetInt64(), st.OccStr[i2], "");
                    }
                    oi++;
                }
            }
            var biJ = sJ.GetProperty("bIdx");
            WiCheckI($"{tag}.bIdxN", biJ.GetArrayLength(), st.BIdx.Count, "");
            {
                int bi2 = 0;
                foreach (var e in biJ.EnumerateArray())
                {
                    if (bi2 < st.BIdx.Order.Count)
                    {
                        WiCheckI($"{tag}.bIdx{bi2}.i", e.GetProperty("i").GetInt64(), st.BIdx.Order[bi2], "");
                        WiCheckI($"{tag}.bIdx{bi2}.bi", e.GetProperty("bi").GetInt64(), st.BIdx.Get(st.BIdx.Order[bi2]), "");
                    }
                    bi2++;
                }
            }
            var bdJ = sJ.GetProperty("buildings");
            WiCheckI($"{tag}.bdN", bdJ.GetArrayLength(), st.Buildings.Count, "");
            {
                int bi3 = 0;
                foreach (var e in bdJ.EnumerateArray())
                {
                    if (bi3 < st.Buildings.Count)
                    {
                        var b = st.Buildings[bi3];
                        WiCheckI($"{tag}.bd{bi3}.i", e.GetProperty("i").GetInt64(), b.I, "");
                        WiCheckI($"{tag}.bd{bi3}.kind", e.GetProperty("kind").GetInt64(), b.Kind, "");
                        WiCheckI($"{tag}.bd{bi3}.civ", e.GetProperty("civ").GetInt64(), b.Civ, "");
                    }
                    bi3++;
                }
            }
            var bhpJ = sJ.GetProperty("bHp");
            WiCheckI($"{tag}.bHpN", bhpJ.GetArrayLength(), st.BHp.Count, "");
            {
                int hi = 0;
                foreach (var e in bhpJ.EnumerateArray())
                {
                    var kv = e.EnumerateArray().ToArray();
                    if (hi < st.BHp.Order.Count)
                    {
                        WiCheckI($"{tag}.bHp{hi}.i", kv[0].GetInt64(), st.BHp.Order[hi], "");
                        WiCheckN($"{tag}.bHp{hi}.v", kv[1].GetString()!, st.BHp.Get(st.BHp.Order[hi]), "");
                    }
                    hi++;
                }
            }
            WiCheckI($"{tag}.dirtyN", sJ.GetProperty("dirtyN").GetInt64(), st.Dirty.Count, "");
            WiCheckFx($"{tag}.fx", sJ.GetProperty("fx"), st, 0);
            WiCheckFx($"{tag}.fxNew", sJ.GetProperty("fxNew"), st, fxStart);
            WiCheckEvents($"{tag}.evt", sJ.GetProperty("evts"), host, evStart);
        }
        var wiTail = c.GetProperty("tailDraws").EnumerateArray().GetEnumerator();
        for (int i = 0; i < 4 && wiTail.MoveNext(); i++)
            WiCheckN($"wi.{name}.rngTail[{i}]", wiTail.Current.GetString()!, WbRng.Next(ref st.RngA), "");
    }
}

// ================== M-U3 切片 4：职业链/techMods/popCap/旨意生命周期（Jb 段） ==================
// M-U3 切片 5：Jb 段升格为双文档段（jobs + tech 同 schema 超集——旧黄金零回归 + 新增场景
// 同一批宿主/接线/op 分发；条件装载 golden 独有面 techs/emLex/industry/arcane/research）
// M-U3 切片 6：三文档段（+society——stick/sethomo/imod 升级面/govCache/emIdeas 终态）
// M-U3 切片 8：+army 军团域（form/atick/ftick/setarmy/setu + armies 全维快照面）
// M-U3 切片 9：+rebel 叛乱分裂域（wtick + civSeq + 建国三元组 race/banner/colorHex + wds/tw/wh/rel 面）
var jbDocs = new List<JsonElement>();
foreach (var jbP in new[] { "golden-units-jobs.json", "golden-units-tech.json", "golden-units-society.json", "golden-units-civtick.json", "golden-units-army.json", "golden-units-rebel.json", "golden-units-barracks.json" })
{
    var jbFull = Path.Combine(AppContext.BaseDirectory, "../../../../", jbP);
    if (!File.Exists(jbFull)) jbFull = jbP;
    if (File.Exists(jbFull)) jbDocs.Add(JsonDocument.Parse(File.ReadAllText(jbFull)).RootElement);
}
for (int jbDocI = 0; jbDocI < jbDocs.Count; jbDocI++)
{
    var jbd = jbDocs[jbDocI];
    int jbW = jbd.GetProperty("w").GetInt32();
    var jbEp = jbd.GetProperty("ep");
    double jbPanicDecay = jbEp.GetProperty("panicDecay").GetDouble();
    double jbGrudgeDecay = jbEp.GetProperty("grudgeDecay").GetDouble();
    double jbFire = jbEp.GetProperty("fireDamage").GetDouble();
    double jbPanicRout = jbEp.GetProperty("panicRout").GetDouble();
    double jbReproMul = jbEp.GetProperty("reproMul").GetDouble();
    double jbMutationRate = jbEp.GetProperty("mutationRate").GetDouble();
    var jbRaceIds = new Dictionary<string, int>();
    foreach (var p in jbd.GetProperty("raceIds").EnumerateObject()) jbRaceIds[p.Name] = p.Value.GetInt32();
    var jbJobW = jbd.GetProperty("jobs").EnumerateArray().Select(j => j.GetProperty("weight").GetDouble()).ToArray();
    var jbJobH = jbd.GetProperty("jobs").EnumerateArray().Select(j => j.GetProperty("hpMul").GetDouble()).ToArray();
    var jbJobD = jbd.GetProperty("jobs").EnumerateArray().Select(j => j.GetProperty("dmgMul").GetDouble()).ToArray();
    var jbJobS = jbd.GetProperty("jobs").EnumerateArray().Select(j => j.GetProperty("speedMul").GetDouble()).ToArray();

    static ulong JbLeHexToBits(string h)
    {
        ulong v = 0;
        for (int i = 7; i >= 0; i--) v = (v << 8) | Convert.ToUInt64(h.Substring(i * 2, 2), 16);
        return v;
    }
    static double JbHexD(string h) => BitConverter.UInt64BitsToDouble(JbLeHexToBits(h));
    byte[] JbGrid(JsonElement spec)
    {
        var g = new byte[jbW * 160];
        Array.Fill(g, (byte)spec.GetProperty("def").GetInt32());
        foreach (var p in spec.GetProperty("patches").EnumerateArray())
        {
            int x1 = p[0].GetInt32(), y1 = p[1].GetInt32(), x2 = p[2].GetInt32(), y2 = p[3].GetInt32(), t = p[4].GetInt32();
            for (int y = y1; y < y2; y++) for (int x = x1; x < x2; x++) g[y * jbW + x] = (byte)t;
        }
        return g;
    }
    void JbSnapTake(WbUnitsState st, int i, CbSnap sp)
    {
        sp.Race = st.Race[i]; sp.Age = st.Age[i]; sp.Hp = st.Hp[i]; sp.Hurt = st.Hurt[i]; sp.Cd = st.Cd[i]; sp.Atk = st.Atk[i];
        sp.Panic = st.Panic[i]; sp.Food = st.Food[i]; sp.Dead = st.Dead[i];
        sp.King = st.King[i]; sp.Fam = st.Fam[i]; sp.Trait = st.Trait[i];
        sp.Dmg = st.Dmg[i]; sp.Kills = st.Kills[i];
        sp.X = st.X[i]; sp.Y = st.Y[i]; sp.Tx = st.Tx[i]; sp.Ty = st.Ty[i];
        sp.RpId = st.Id[i]; sp.RpName = st.Name[i] ?? "";
        sp.MaxAge = st.MaxAge[i]; sp.MaxHp = st.MaxHp[i]; sp.Speed = st.Speed[i];
        sp.Lx = st.Lx[i]; sp.Ly = st.Ly[i];
        sp.GeneS = st.GeneS[i]; sp.GeneD = st.GeneD[i]; sp.GeneH = st.GeneH[i]; sp.GeneR = st.GeneR[i];
        sp.Breath = st.Breath[i]; sp.Tdmg = st.Tdmg[i]; sp.Thp = st.Thp[i];
        sp.Fgn = st.Fgn[i]; sp.UParity = st.UParity[i]; sp.BeachT = st.BeachT[i];
        sp.Flip = st.Flip[i]; sp.Civ = st.Civ[i]; sp.Job = st.Job[i];
    }
    void JbSnapCompare(string tag, JsonElement uo, CbSnap sp)
    {
        void N(string k, double actual)
        {
            var v = uo.GetProperty(k);
            string? js = v.ValueKind == JsonValueKind.Null ? null : v.GetString()!;
            total++;
            ulong jsBits = js == null ? 0 : JbLeHexToBits(js);
            bool cNaN = double.IsNaN(actual);
            bool jNaN = js == null || ((jsBits & 0x7ff0000000000000UL) == 0x7ff0000000000000UL && (jsBits & 0x000fffffffffffffUL) != 0);
            if (cNaN && jNaN) return;
            if (cNaN != jNaN || (!cNaN && BitConverter.DoubleToUInt64Bits(actual) != jsBits))
            { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}.{k}] JS={js ?? "undefined"} C#={actual:R}"); }
        }
        void I(string k, long expect, long actual)
        { total++; if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}.{k}] JS={expect} C#={actual}"); } }
        void S(string k, string? expect, string? actual)
        { total++; if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}.{k}] JS={expect} C#={actual}"); } }
        I("id", uo.GetProperty("id").GetInt32(), sp.RpId);
        I("race", uo.GetProperty("race").GetInt32(), (int)sp.Race);
        N("age", sp.Age); N("maxAge", sp.MaxAge); N("hp", sp.Hp); N("maxHp", sp.MaxHp);
        N("speed", sp.Speed); N("dmg", sp.Dmg); N("cd", sp.Cd);
        N("x", sp.X); N("y", sp.Y); N("tx", sp.Tx); N("ty", sp.Ty);
        N("lx", sp.Lx); N("ly", sp.Ly);
        var panicJ = uo.GetProperty("panic");
        if (panicJ.ValueKind != JsonValueKind.Null) N("panic", sp.Panic);
        var foodJ = uo.GetProperty("food");
        if (foodJ.ValueKind != JsonValueKind.Null) N("food", sp.Food);
        I("civ", uo.GetProperty("civ").GetInt32(), sp.Civ);
        I("job", uo.GetProperty("job").GetInt32(), sp.Job);
        var tdJ = uo.GetProperty("tdmg"); var thJ = uo.GetProperty("thp");
        if (tdJ.ValueKind != JsonValueKind.Null) N("tdmg", sp.Tdmg);
        if (thJ.ValueKind != JsonValueKind.Null) N("thp", sp.Thp);
        var geneJ = uo.GetProperty("gene");
        if (geneJ.ValueKind == JsonValueKind.Object)
        { N2(geneJ.GetProperty("s").GetString()!, sp.GeneS, $"{tag}.gene.s"); N2(geneJ.GetProperty("d").GetString()!, sp.GeneD, $"{tag}.gene.d"); N2(geneJ.GetProperty("h").GetString()!, sp.GeneH, $"{tag}.gene.h"); N2(geneJ.GetProperty("r").GetString()!, sp.GeneR, $"{tag}.gene.r"); }
        S("trait", uo.GetProperty("trait").ValueKind == JsonValueKind.Null ? null : uo.GetProperty("trait").GetString()!, sp.Trait);
        S("name", uo.GetProperty("name").GetString()!, sp.RpName);
        var famJ = uo.GetProperty("fam");
        if (famJ.ValueKind == JsonValueKind.Null) I("famNull", 1, sp.Fam < 0 ? 1 : 0);
        else I("fam", famJ.GetInt32(), sp.Fam);
        I("fgn", uo.GetProperty("fgn").ValueKind == JsonValueKind.Null ? 0 : uo.GetProperty("fgn").GetInt32(), sp.Fgn);
        I("uparity", uo.GetProperty("uparity").ValueKind == JsonValueKind.Null ? -1 : uo.GetProperty("uparity").GetInt32(), sp.UParity);
        N("breath", sp.Breath);
        I("dead", uo.GetProperty("dead").GetBoolean() ? 1 : 0, sp.Dead ? 1 : 0);
    }
    void N2(string jsHex, double actual, string tag)
    {
        total++;
        ulong jsBits = JbLeHexToBits(jsHex);
        if (BitConverter.DoubleToUInt64Bits(actual) != jsBits)
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] JS={jsHex} C#={actual:R}"); }
    }
    void JbCheckI(string tag, long expect, long actual, string loc = "")
    { total++; if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); } }
    void JbCheckN(string tag, string jsHex, double actual, string loc = "")
    {
        total++;
        if (BitConverter.DoubleToUInt64Bits(actual) != JbLeHexToBits(jsHex))
        { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={jsHex} C#={actual:R}"); }
    }
    void JbCheckS(string tag, string? expect, string? actual, string loc = "")
    { total++; if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); } }
    void JbCheckB(string tag, bool expect, bool actual, string loc = "")
    { total++; if (expect != actual) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}] {loc}: JS={expect} C#={actual}"); } }
    void JbCheckDirs(string tag, JsonElement dirsJ, WbWarsHost host)
    {
        JbCheckI($"{tag}.n", dirsJ.GetArrayLength(), host.Directives.Count, "");
        for (int i = 0; i < Math.Min(dirsJ.GetArrayLength(), host.Directives.Count); i++)
        {
            var dj = dirsJ[i]; var d = host.Directives[i];
            JbCheckI($"{tag}{i}.id", dj.GetProperty("id").GetInt32(), d.Id, "");
            JbCheckI($"{tag}{i}.civ", dj.GetProperty("civ").GetInt32(), d.Civ, "");
            JbCheckS($"{tag}{i}.kind", dj.GetProperty("kind").GetString()!, d.Kind, "");
            var tj = dj.GetProperty("target");
            JbCheckI($"{tag}{i}.target", tj.ValueKind == JsonValueKind.Null ? -1 : tj.GetInt32(), d.Target ?? -1, "");
            JbCheckI($"{tag}{i}.param", dj.GetProperty("param").GetInt32(), d.Param, "");
            JbCheckS($"{tag}{i}.status", dj.GetProperty("status").GetString()!, d.Status, "");
            JbCheckI($"{tag}{i}.startTick", dj.GetProperty("startTick").GetInt32(), d.StartTick, "");
            JbCheckI($"{tag}{i}.deadlineTick", dj.GetProperty("deadlineTick").ValueKind == JsonValueKind.Null ? -1 : dj.GetProperty("deadlineTick").GetInt32(), d.DeadlineTick, "");
            JbCheckS($"{tag}{i}.text", dj.GetProperty("text").GetString()!, d.Text, "");
            var ej = dj.GetProperty("endTick");
            JbCheckI($"{tag}{i}.endTick", ej.ValueKind == JsonValueKind.Null ? -1 : ej.GetInt32(), d.EndTick ?? -1, "");
            JbCheckS($"{tag}{i}.endText", dj.GetProperty("endText").ValueKind == JsonValueKind.Null ? null : dj.GetProperty("endText").GetString()!, d.EndText, "");
            var kj = dj.GetProperty("killCount");
            JbCheckI($"{tag}{i}.killCount", kj.ValueKind == JsonValueKind.Null ? -1 : kj.GetInt32(), d.KillCount ?? -1, "");
        }
    }
    void JbCheckCivs(string tag, JsonElement civsJ, WbWarsHost host, bool deepTiles = false)
    {
        JbCheckI($"{tag}.n", civsJ.GetArrayLength(), host.Civs.Count, "");
        for (int i = 0; i < Math.Min(civsJ.GetArrayLength(), host.Civs.Count); i++)
        {
            var cj = civsJ[i];
            var cv = host.Civs[i];
            if (cj.ValueKind == JsonValueKind.Null) { JbCheckI($"{tag}{i}.null", 1, cv == null ? 1 : 0, ""); continue; }
            if (cv == null) { JbCheckI($"{tag}{i}.nullC", 1, 0, ""); continue; }
            JbCheckI($"{tag}{i}.id", cj.GetProperty("id").GetInt32(), cv.Id, "");
            JbCheckN($"{tag}{i}.pop", cj.GetProperty("pop").GetString()!, cv.Pop);
            var gJ = cj.GetProperty("gold");
            if (gJ.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.gold", gJ.GetString()!, cv.Gold ?? double.NaN);
            else JbCheckI($"{tag}{i}.goldU", 1, cv.Gold == null ? 1 : 0, "");
            var kJ = cj.GetProperty("knowledge");
            if (kJ.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.knowledge", kJ.GetString()!, cv.Knowledge ?? double.NaN);
            else JbCheckI($"{tag}{i}.knowU", 1, cv.Knowledge == null ? 1 : 0, "");
            JbCheckI($"{tag}{i}.houses", cj.GetProperty("houses").GetInt32(), cv.Houses, "");
            JbCheckI($"{tag}{i}.alive", cj.GetProperty("alive").GetBoolean() ? 1 : 0, cv.Alive ? 1 : 0, "");
            var acJ = cj.GetProperty("armyCd");
            JbCheckI($"{tag}{i}.armyCd", acJ.ValueKind == JsonValueKind.Null ? -1 : acJ.GetInt32(), cv.ArmyCd ?? -1, "");
            var muJ = cj.GetProperty("mobilizeUntil");
            if (muJ.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.mobilizeUntil", muJ.GetString()!, cv.MobilizeUntil ?? double.NaN);
            else JbCheckI($"{tag}{i}.mobU", 1, cv.MobilizeUntil == null ? 1 : 0, "");
            var govJ = cj.GetProperty("gov");
            JbCheckI($"{tag}{i}.gov", govJ.ValueKind == JsonValueKind.Null ? -1 : govJ.GetInt32(), cv.Gov ?? -1, "");
            JbCheckI($"{tag}{i}.techsN", cj.GetProperty("techs").GetArrayLength(), cv.Techs.Count, "");
            int ti = 0;
            foreach (var t in cj.GetProperty("techs").EnumerateArray()) { JbCheckS($"{tag}{i}.tech{ti}", t.GetString()!, ti < cv.Techs.Count ? cv.Techs[ti] : null, ""); ti++; }
            JbCheckI($"{tag}{i}.ideasN", cj.GetProperty("ideas").GetArrayLength(), cv.Ideas.Count, "");
            JbCheckI($"{tag}{i}.tilesN", cj.GetProperty("tiles").GetArrayLength(), cv.Tiles.Count, "");
            JbCheckI($"{tag}{i}.frontierN", cj.GetProperty("frontier").GetArrayLength(), cv.Frontier.Count, "");
            // —— M-U3 切片 5：研究面（jobs 旧档无此四键——TryGetProperty 条件对账）——
            if (cj.TryGetProperty("research", out var rsC))
                JbCheckS($"{tag}{i}.research", rsC.ValueKind == JsonValueKind.Null ? null : rsC.GetString()!, cv.Research, "");
            if (cj.TryGetProperty("researchP", out var rpC))
            {
                if (rpC.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.researchP", rpC.GetString()!, cv.ResearchP ?? double.NaN);
                else JbCheckI($"{tag}{i}.rpU", 1, cv.ResearchP == null ? 1 : 0, "");
            }
            if (cj.TryGetProperty("income", out var inC))
            {
                if (inC.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.income", inC.GetString()!, cv.Income ?? double.NaN);
                else JbCheckI($"{tag}{i}.incomeU", 1, cv.Income == null ? 1 : 0, "");
            }
            if (cj.TryGetProperty("expense", out var exC))
            {
                if (exC.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.expense", exC.GetString()!, cv.Expense ?? double.NaN);
                else JbCheckI($"{tag}{i}.expenseU", 1, cv.Expense == null ? 1 : 0, "");
            }
            // —— M-U3 切片 6：社会面（jobs/tech 旧档无键——条件对账）——
            if (cj.TryGetProperty("stability", out var sbC))
            {
                if (sbC.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.stability", sbC.GetString()!, cv.Stability ?? double.NaN);
                else JbCheckI($"{tag}{i}.stabU", 1, cv.Stability == null ? 1 : 0, "");
            }
            if (cj.TryGetProperty("culture", out var cuC))
            {
                if (cuC.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.culture", cuC.GetString()!, cv.Culture ?? double.NaN);
                else JbCheckI($"{tag}{i}.cultU", 1, cv.Culture == null ? 1 : 0, "");
            }
            if (cj.TryGetProperty("militarism", out var mlC))
            {
                if (mlC.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.militarism", mlC.GetString()!, cv.Militarism ?? double.NaN);
                else JbCheckI($"{tag}{i}.milU", 1, cv.Militarism == null ? 1 : 0, "");
            }
            if (cj.TryGetProperty("festivalCd", out var fcC))
            {
                if (fcC.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.festivalCd", fcC.GetString()!, cv.FestivalCd ?? double.NaN);
                else JbCheckI($"{tag}{i}.festU", 1, cv.FestivalCd == null ? 1 : 0, "");
            }
            if (cj.TryGetProperty("govYear", out var gyC))
                JbCheckI($"{tag}{i}.govYear", gyC.ValueKind == JsonValueKind.Null ? -1 : gyC.GetInt32(), cv.GovYear ?? -1, "");
            // —— M-U3 切片 7：civsTick 主输出面（jobs/tech/society 旧档无键——条件对账）——
            if (cj.TryGetProperty("capital", out var cpJ7))
                JbCheckI($"{tag}{i}.capital", cpJ7.GetInt32(), cv.Capital, "");
            if (cj.TryGetProperty("kingId", out var kiJ7))
                JbCheckI($"{tag}{i}.kingId", kiJ7.ValueKind == JsonValueKind.Null ? -1 : kiJ7.GetInt32(), cv.KingId ?? -1, "");
            if (cj.TryGetProperty("kingName", out var knJ7))
                JbCheckS($"{tag}{i}.kingName", knJ7.ValueKind == JsonValueKind.Null ? null : knJ7.GetString()!, cv.KingName, "");
            if (cj.TryGetProperty("popZeroTick", out var pzJ7))
                JbCheckI($"{tag}{i}.popZeroTick", pzJ7.ValueKind == JsonValueKind.Null ? -1 : pzJ7.GetInt32(), cv.PopZeroTick ?? -1, "");
            if (cj.TryGetProperty("colonizeCd", out var ccJ7))
            {
                if (ccJ7.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}{i}.colonizeCd", ccJ7.GetString()!, cv.ColonizeCd ?? double.NaN);
                else JbCheckI($"{tag}{i}.coloU", 1, cv.ColonizeCd == null ? 1 : 0, "");
            }
            if (cj.TryGetProperty("mergedInto", out var miJ7))
                JbCheckI($"{tag}{i}.mergedInto", miJ7.ValueKind == JsonValueKind.Null ? -1 : miJ7.GetInt32(), cv.MergedInto ?? -1, "");
            // —— M-U3 切片 9：createCiv 建国三元组（jobs/tech/society/civtick/army 旧档无键——条件对账）——
            if (cj.TryGetProperty("race", out var rcJ9))
                JbCheckI($"{tag}{i}.race", rcJ9.ValueKind == JsonValueKind.Null ? -1 : rcJ9.GetInt32(), cv.Race, "");
            if (cj.TryGetProperty("banner", out var bnJ9))
                JbCheckS($"{tag}{i}.banner", bnJ9.ValueKind == JsonValueKind.Null ? null : bnJ9.GetString()!, cv.Banner, "");
            if (cj.TryGetProperty("colorHex", out var chJ9))
                JbCheckS($"{tag}{i}.colorHex", chJ9.ValueKind == JsonValueKind.Null ? null : chJ9.GetString()!, cv.ColorHex, "");
            // —— M-U3 切片 9：领土序全量对账（deepTiles——rebel 转移序即行为序；旧档计数面）——
            if (deepTiles && cj.TryGetProperty("tiles", out var tlJ9))
            {
                int t9 = 0;
                foreach (var tv in tlJ9.EnumerateArray())
                {
                    if (t9 < cv.Tiles.Count) JbCheckI($"{tag}{i}.tile{t9}", tv.GetInt32(), cv.Tiles[t9], "");
                    t9++;
                }
            }
        }
    }
    void JbCheckEvents(string tag, JsonElement evtsJ, WbWarsHost host, int start)
    {
        JbCheckI($"{tag}.n", evtsJ.GetArrayLength(), host.PendingEvents.Count - start, "");
        for (int i = start; i < host.PendingEvents.Count; i++)
        {
            var e = evtsJ[i - start];
            var pe = host.PendingEvents[i];
            JbCheckI($"{tag}{i}.id", e.GetProperty("id").GetInt64(), pe.Id, "");
            JbCheckI($"{tag}{i}.year", e.GetProperty("year").GetInt64(), pe.Year, "");
            JbCheckS($"{tag}{i}.kind", e.GetProperty("kind").GetString()!, pe.Kind, "");
            JbCheckS($"{tag}{i}.text", e.GetProperty("text").GetString()!, pe.Text, "");
            var chJ = e.GetProperty("colorHex");
            JbCheckS($"{tag}{i}.colorHex", chJ.ValueKind == JsonValueKind.Null ? null : chJ.GetString()!, pe.ColorHex, "");
            var xJ = e.GetProperty("x"); var yJ = e.GetProperty("y");
            // M-U3 切片 5：科技事件 x/y 为原始数值（civCenter 位模式）——jobs 旧档恒 null 零触达；
            // 兼容 Number 直读与 hex 位串（wars 段同构）
            if (xJ.ValueKind != JsonValueKind.Null)
            {
                double jx = xJ.ValueKind == JsonValueKind.Number ? xJ.GetDouble() : JbHexD(xJ.GetString()!);
                double cx = pe.X ?? double.NaN;
                total++;
                if (BitConverter.DoubleToUInt64Bits(jx) != BitConverter.DoubleToUInt64Bits(cx))
                { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}{i}.x] JS={jx:R} C#={cx:R}"); }
            }
            if (yJ.ValueKind != JsonValueKind.Null)
            {
                double jy = yJ.ValueKind == JsonValueKind.Number ? yJ.GetDouble() : JbHexD(yJ.GetString()!);
                double cy = pe.Y ?? double.NaN;
                total++;
                if (BitConverter.DoubleToUInt64Bits(jy) != BitConverter.DoubleToUInt64Bits(cy))
                { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{tag}{i}.y] JS={jy:R} C#={cy:R}"); }
            }
        }
    }

    void JbLoadUnit(WbUnitsState st, int i, JsonElement u)
    {
        double NumOr(string k, double dflt)
        {
            if (!u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null) return dflt;
            return v.GetDouble();
        }
        string? StrOr(string k) =>
            !u.TryGetProperty(k, out var v) || v.ValueKind == JsonValueKind.Null ? null : v.GetString();
        st.Id[i] = u.TryGetProperty("id", out var idJ) ? idJ.GetInt32() : i + 1;
        st.Race[i] = (uint)u.GetProperty("race").GetInt32();
        st.X[i] = u.GetProperty("x").GetDouble(); st.Y[i] = u.GetProperty("y").GetDouble();
        st.Tx[i] = NumOr("tx", st.X[i]); st.Ty[i] = NumOr("ty", st.Y[i]);
        st.Age[i] = NumOr("age", 20.0); st.MaxAge[i] = NumOr("maxAge", 55.0);
        st.Hp[i] = NumOr("hp", 100.0); st.MaxHp[i] = NumOr("maxHp", 100.0);
        st.Dmg[i] = NumOr("dmg", 0.0);
        st.Kills[i] = (int)NumOr("kills", 0.0);
        st.Hurt[i] = NumOr("hurt", double.NaN);
        st.Cd[i] = NumOr("cd", 0.0); st.Atk[i] = NumOr("atk", 0.0);
        st.FleeT[i] = NumOr("fleeT", 0.0); st.Bless[i] = NumOr("bless", 0.0);
        st.Curse[i] = NumOr("curse", 0.0); st.Fert[i] = NumOr("fert", 0.0); st.Detour[i] = NumOr("detour", 0.0);
        st.Panic[i] = NumOr("panic", double.NaN);
        st.Food[i] = NumOr("food", double.NaN);
        st.Sxk[i] = NumOr("sxk", double.NaN); st.Syk[i] = NumOr("syk", double.NaN);
        st.Infected[i] = u.TryGetProperty("infected", out var ij) && ij.ValueKind == JsonValueKind.True;
        st.Boat[i] = (byte)NumOr("boat", 0); st.BoatTtl[i] = (int)NumOr("boatTTL", 0);
        st.Civ[i] = (int)NumOr("civ", -1); st.Job[i] = (int)NumOr("job", 0);
        st.Speed[i] = NumOr("speed", 0.1);
        if (u.TryGetProperty("dead", out var dj) && dj.ValueKind == JsonValueKind.True) st.Dead[i] = true;
        st.Trait[i] = StrOr("trait");
        st.King[i] = u.TryGetProperty("king", out var kj) && kj.ValueKind == JsonValueKind.True;
        st.Fam[i] = (int)NumOr("fam", -1.0);
        st.Tdmg[i] = NumOr("tdmg", 1.0); st.Thp[i] = NumOr("thp", 1.0);
        if (u.TryGetProperty("gene", out var gj2) && gj2.ValueKind == JsonValueKind.Object)
        {
            st.GeneS[i] = gj2.GetProperty("s").GetDouble(); st.GeneD[i] = gj2.GetProperty("d").GetDouble();
            st.GeneH[i] = gj2.GetProperty("h").GetDouble(); st.GeneR[i] = gj2.GetProperty("r").GetDouble();
        }
        else { st.GeneS[i] = 1.0; st.GeneD[i] = 1.0; st.GeneH[i] = 1.0; st.GeneR[i] = 1.0; }
        st.Fgn[i] = (int)NumOr("fgn", 0.0);
        st.Name[i] = StrOr("name");
        st.Breath[i] = NumOr("breath", double.NaN);
        st.UParity[i] = (int)NumOr("uparity", -1.0);
        st.BeachT[i] = (int)NumOr("beachT", 0.0);
        st.Lx[i] = NumOr("lx", double.NaN); st.Ly[i] = NumOr("ly", double.NaN);
    }

    foreach (var c in jbd.GetProperty("cases").EnumerateArray())
    {
        string name = c.GetProperty("name").GetString()!;
        uint seed = (uint)c.GetProperty("seed").GetInt64();
        var envJ = c.GetProperty("env");
        var whost = new WbWarsHost
        {
            LawsWars = !envJ.TryGetProperty("lawsWars", out var lwJ) || lwJ.GetBoolean(),
            // —— M-U3 切片 7：civsTick 法则门（DEFAULT_LAWS true 同构）+ fx ambience ——
            LawsCityGrowth = !envJ.TryGetProperty("lawsCityGrowth", out var lcgJ) || lcgJ.GetBoolean(),
            LawsRebels = !envJ.TryGetProperty("lawsRebels", out var lrbJ) || lrbJ.GetBoolean(),
            FxAmbience = envJ.TryGetProperty("ambience", out var ambJ7) && ambJ7.GetBoolean(),
            TickCount = envJ.TryGetProperty("tick", out var tkJ) ? tkJ.GetInt32() : 0,
            YearF = envJ.TryGetProperty("yearF", out var yfJ) ? yfJ.GetDouble() : 0.0,
            Season = envJ.TryGetProperty("season", out var seJ) ? seJ.GetInt32() : 0,
            DirSeq = envJ.TryGetProperty("dirSeq", out var dsJ) ? dsJ.GetInt32() : 1,
            AllianceSeq = envJ.TryGetProperty("allianceSeq", out var asJ) ? asJ.GetInt32() : 1,
            IdeaSeq = envJ.TryGetProperty("ideaSeq", out var isJ) ? isJ.GetInt32() : 1,   // M-U3 切片 6（inventIdea id{seq}）
            // M-U3 切片 9：civSeq（createCiv id 分配/色板投钉权威起点——rebel 文档 env 显式）
            CivSeq = envJ.TryGetProperty("civSeq", out var csqJ) ? csqJ.GetInt32() : 0,
        };
        var wst = new WbWarsState { RngA = seed };
        // —— civs 装载（原始 spec——undefined 字段 JSON 丢键，TryGetProperty 容错） ——
        foreach (var cj in c.GetProperty("civs").EnumerateArray())
        {
            var cv = new WbCiv
            {
                Id = cj.GetProperty("id").GetInt32(),
                Name = cj.GetProperty("name").GetString()!,
                Race = cj.GetProperty("race").GetInt32(),
                ColorHex = cj.TryGetProperty("colorHex", out var ch2) ? ch2.GetString()! : "#cccccc",
                Pop = cj.GetProperty("pop").GetDouble(),
                Capital = cj.TryGetProperty("capital", out var cp2) ? cp2.GetInt32() : -1,
                Alive = !cj.TryGetProperty("alive", out var al2) || al2.GetBoolean(),
                Houses = cj.TryGetProperty("houses", out var hs2) ? hs2.GetInt32() : 0,
            };
            if (cj.TryGetProperty("gold", out var gJ) && gJ.ValueKind == JsonValueKind.Number) cv.Gold = gJ.GetDouble();
            if (cj.TryGetProperty("knowledge", out var kJ) && kJ.ValueKind == JsonValueKind.Number) cv.Knowledge = kJ.GetDouble();
            // M-U3 切片 5：研究面（TS optional——null/缺省同构 string?/double?）
            if (cj.TryGetProperty("research", out var rsJ) && rsJ.ValueKind == JsonValueKind.String) cv.Research = rsJ.GetString();
            if (cj.TryGetProperty("researchP", out var rPj) && rPj.ValueKind == JsonValueKind.Number) cv.ResearchP = rPj.GetDouble();
            if (cj.TryGetProperty("income", out var inJ) && inJ.ValueKind == JsonValueKind.Number) cv.Income = inJ.GetDouble();
            // M-U3 切片 5：pickResearch 加权四维（军国/文化/国库/稳定——jobs 旧档无 militarism/
            //   culture/stability 键——条件装载零触达；S5/S8 场景依赖——漏装即 ?? 兜底漂移）
            if (cj.TryGetProperty("militarism", out var miJ) && miJ.ValueKind == JsonValueKind.Number) cv.Militarism = miJ.GetDouble();
            if (cj.TryGetProperty("culture", out var cuJ) && cuJ.ValueKind == JsonValueKind.Number) cv.Culture = cuJ.GetDouble();
            if (cj.TryGetProperty("stability", out var stJ2) && stJ2.ValueKind == JsonValueKind.Number) cv.Stability = stJ2.GetDouble();
            // M-U3 切片 6：社会面（festivalCd/govYear——societyTick 消费/写入）
            if (cj.TryGetProperty("festivalCd", out var fcJ) && fcJ.ValueKind == JsonValueKind.Number) cv.FestivalCd = fcJ.GetDouble();
            if (cj.TryGetProperty("govYear", out var gyJ) && gyJ.ValueKind == JsonValueKind.Number) cv.GovYear = gyJ.GetInt32();
            // —— M-U3 切片 7：王权/幽灵/殖民/融合面（civsTick 消费/写入——TS optional）——
            if (cj.TryGetProperty("kingId", out var kiJ) && kiJ.ValueKind == JsonValueKind.Number) cv.KingId = kiJ.GetInt32();
            if (cj.TryGetProperty("kingName", out var knJ) && knJ.ValueKind == JsonValueKind.String) cv.KingName = knJ.GetString()!;
            if (cj.TryGetProperty("popZeroTick", out var pzJ) && pzJ.ValueKind == JsonValueKind.Number) cv.PopZeroTick = pzJ.GetInt32();
            if (cj.TryGetProperty("colonizeCd", out var ccJ) && ccJ.ValueKind == JsonValueKind.Number) cv.ColonizeCd = ccJ.GetDouble();
            if (cj.TryGetProperty("mergedInto", out var miJ2) && miJ2.ValueKind == JsonValueKind.Number) cv.MergedInto = miJ2.GetInt32();
            if (cj.TryGetProperty("armyCd", out var acJ) && acJ.ValueKind == JsonValueKind.Number) cv.ArmyCd = acJ.GetInt32();   // M-U3 切片 8（form 场景 armyCd 门）
            if (cj.TryGetProperty("gov", out var gvJ) && gvJ.ValueKind != JsonValueKind.Null) cv.Gov = gvJ.GetInt32();
            if (cj.TryGetProperty("techs", out var tcJ))
                foreach (var t in tcJ.EnumerateArray()) cv.Techs.Add(t.GetString()!);
            if (cj.TryGetProperty("ideas", out var idJ2))
                foreach (var t in idJ2.EnumerateArray()) cv.Ideas.Add(t.GetString()!);
            if (cj.TryGetProperty("tiles", out var tlJ))
                foreach (var t in tlJ.EnumerateArray())
            {
                int ti2 = t.GetInt32();
                cv.Tiles.Add(ti2);
                wst.Owner[ti2] = cv.Id;
                wst.Terrain[ti2] = WbConstants.TGrass;
            }
            // M-U3 切片 7：扩张域预置边境（swap-pop 原地变异——jobs/tech/society 旧档无键零触达）
            if (cj.TryGetProperty("frontier", out var frJ))
                foreach (var t in frJ.EnumerateArray()) cv.Frontier.Add(t.GetInt32());
            while (whost.Civs.Count <= cv.Id) whost.Civs.Add(null);
            whost.Civs[cv.Id] = cv;
        }
        // —— 种族外交面（Wa/Wi 同构 echo） ——
        var racesJb = jbd.GetProperty("races");
        foreach (var rp in racesJb.EnumerateObject())
        {
            int rid = int.Parse(rp.Name);
            whost.RaceExists[rid] = true;
            // M-U3 切片 7：isCiv 旗（crownUnit 守卫 + homogeneity 扫描）+ fall 播报词法
            if (rp.Value.TryGetProperty("flags", out var fl7)) whost.RaceIsCiv[rid] = (fl7.GetInt32() & 2) != 0;
            if (rp.Value.TryGetProperty("name", out var nm7))
            {
                if (whost.RaceNames.Length == 0) whost.RaceNames = new string[WbConstants.MaxRaces];
                whost.RaceNames[rid] = nm7.GetString()!;
            }
            // M-U3 切片 5：经济/学术种族维（NaN ≡ undefined → ?? 0.5）
            if (rp.Value.TryGetProperty("industry", out var inR) && inR.ValueKind == JsonValueKind.Number) whost.RaceIndustry[rid] = inR.GetDouble();
            if (rp.Value.TryGetProperty("arcane", out var arR) && arR.ValueKind == JsonValueKind.Number) whost.RaceArcane[rid] = arR.GetDouble();
            // M-U3 切片 6：外交/社会种族维（soc-drift war op 触达 declareWar raceRel 域 +
            //   societyTick aggr 基线引力——jobs/tech 旧档无 war op 恒 NaN 零触达）
            if (rp.Value.TryGetProperty("diplo", out var diR) && diR.ValueKind == JsonValueKind.Number) whost.RaceDiplo[rid] = diR.GetDouble();
            if (rp.Value.TryGetProperty("aggr", out var agR) && agR.ValueKind == JsonValueKind.Number) whost.RaceAggr[rid] = agR.GetDouble();
            if (rp.Value.TryGetProperty("greed", out var grR) && grR.ValueKind == JsonValueKind.Number) whost.RaceGreed[rid] = grR.GetDouble();
        }
        // —— M-U3 切片 5：科技域数据面（TECHS 全表 + 涌现词法——golden 条件装载，jobs 旧档零触达） ——
        if (jbd.TryGetProperty("techs", out var techsJ))
            foreach (var tj in techsJ.EnumerateArray())
            {
                var td = new WbTechDef
                {
                    Key = tj.GetProperty("key").GetString()!, Name = tj.GetProperty("name").GetString()!,
                    Cat = tj.GetProperty("cat").GetString()!, Era = tj.GetProperty("era").GetInt32(),
                    Cost = tj.GetProperty("cost").GetDouble(),
                    Desc = tj.GetProperty("desc").GetString()!,
                    Deps = tj.GetProperty("deps").EnumerateArray().Select(x => x.GetString()!).ToArray(),
                };
                whost.TechDefs.Add(td);
                whost.TechDefByKey[td.Key] = td;
            }
        if (jbd.TryGetProperty("emLex", out var lexJ))
        {
            whost.EmPrefix = lexJ.GetProperty("prefix").EnumerateArray().Select(x => x.GetString()!).ToArray();
            foreach (var fj in lexJ.GetProperty("fields").EnumerateArray())
                whost.EmFields.Add(new WbEmField { Name = fj.GetProperty("name").GetString()!, Cat = fj.GetProperty("cat").GetString()!, Eff = fj.GetProperty("eff").GetString()! });
            foreach (var ej in lexJ.GetProperty("effNames").EnumerateObject()) whost.EmEffNames[ej.Name] = ej.Value.GetString()!;
            whost.EmRoman = lexJ.GetProperty("roman").EnumerateArray().Select(x => x.GetString()!).ToArray();
        }
        // —— M-U3 切片 7：建筑全维表（建成播报词法名——jobs/tech/society 旧档无键零触达）——
        if (jbd.TryGetProperty("buildingDefs", out var bd7))
        {
            var bnames = new string[bd7.GetArrayLength()];
            int bni = 0;
            foreach (var b in bd7.EnumerateArray()) bnames[bni++] = b.GetProperty("name").GetString()!;
            whost.BuildingNames = bnames;
        }
        // —— M-U3 切片 6：社会域数据面（GOV_DEFS 播报词法 + IDEA 词法 + 社会种族维）——
        if (jbd.TryGetProperty("govDefs", out var gdJ))
        {
            var names = new List<string>(); var descs = new List<string>();
            foreach (var g in gdJ.EnumerateArray()) { names.Add(g.GetProperty("name").GetString()!); descs.Add(g.GetProperty("desc").GetString()!); }
            whost.GovNames = names.ToArray(); whost.GovDescs = descs.ToArray();
        }
        if (jbd.TryGetProperty("ideaLex", out var ilJ))
        {
            whost.IdeaPre = ilJ.GetProperty("pre").EnumerateArray().Select(x => x.GetString()!).ToArray();
            whost.IdeaPost = ilJ.GetProperty("post").EnumerateArray().Select(x => x.GetString()!).ToArray();
            foreach (var b in ilJ.GetProperty("body").EnumerateArray())
            {
                var ib = new WbIdeaBody { Name = b.GetProperty("name").GetString()!, Desc = b.GetProperty("desc").GetString()! };
                var bm = b.GetProperty("mods");
                if (bm.TryGetProperty("gold", out var b1)) ib.Gold = b1.GetDouble();
                if (bm.TryGetProperty("stab", out var b2)) ib.Stab = b2.GetDouble();
                if (bm.TryGetProperty("mil", out var b3)) ib.Mil = b3.GetDouble();
                if (bm.TryGetProperty("know", out var b4)) ib.Know = b4.GetDouble();
                if (bm.TryGetProperty("repro", out var b5)) ib.Repro = b5.GetDouble();
                if (bm.TryGetProperty("wear", out var b6)) ib.Wear = b6.GetDouble();
                whost.IdeaBodies.Add(ib);
            }
        }
        foreach (var rp in racesJb.EnumerateObject())
        {
            int rid2 = int.Parse(rp.Name);
            if (rp.Value.TryGetProperty("piety", out var piR) && piR.ValueKind == JsonValueKind.Number) whost.RacePiety[rid2] = piR.GetDouble();
            if (rp.Value.TryGetProperty("harmony", out var haR) && haR.ValueKind == JsonValueKind.Number) whost.RaceHarmony[rid2] = haR.GetDouble();
        }
        var raceRelBaseJ = jbd.GetProperty("raceRelBase");
        if (raceRelBaseJ.ValueKind == JsonValueKind.Object)
            foreach (var prop in raceRelBaseJ.EnumerateObject()) whost.RaceRelBase[prop.Name] = prop.Value.GetDouble();
        // —— 单位域 host/state ——
        var uhost = new WbCombatHost();
        var grid5 = new WbGridState();
        uhost.Terrain = JbGrid(jbd.GetProperty("terrainSpecs").EnumerateArray().First(t => t.GetProperty("name").GetString() == c.GetProperty("terrain").GetString()));
        // —— M-U3 切片 7：wars 域地形全量同步（扩张/建造/城墙/殖民的地形消费面——
        //    旧切片只 patch 所属格 TGrass，未所属格恒 TDeep → 扩张拒占 859 漂移根因）——
        for (int i = 0; i < wst.Terrain.Length; i++) wst.Terrain[i] = uhost.Terrain[i];
        uhost.TickCount = whost.TickCount;
        uhost.ItemDefOf = _ => null;                       // 场景契约：无物品（tryPickup items 空表短路）
        foreach (var rp in racesJb.EnumerateObject())
        {
            int rid = int.Parse(rp.Name);
            uhost.RaceFlags[rid] = (byte)rp.Value.GetProperty("flags").GetInt32();
            uhost.Tbf[rid * 2] = (byte)rp.Value.GetProperty("tbf0").GetInt32();
            uhost.Tbf[rid * 2 + 1] = (byte)rp.Value.GetProperty("tbf1").GetInt32();
            var reach = rp.Value.GetProperty("reach");
            uhost.RaceReach[rid] = reach.ValueKind == JsonValueKind.Null ? double.NaN : reach.GetDouble();
            uhost.RaceSpeed[rid] = rp.Value.GetProperty("speed").GetDouble();
            uhost.RaceRepro[rid] = rp.Value.GetProperty("repro").GetDouble();
            var growth = rp.Value.GetProperty("growth");
            uhost.RaceGrowth[rid] = growth.ValueKind == JsonValueKind.Null ? double.NaN : growth.GetDouble();
            uhost.RaceMaxAge[rid] = rp.Value.GetProperty("maxAge").GetDouble();
            uhost.RaceHp[rid] = rp.Value.GetProperty("hp").GetDouble();
            uhost.RaceDmg[rid] = rp.Value.GetProperty("dmg").GetDouble();
        }
        foreach (var tk in jbd.GetProperty("traitDefs").EnumerateObject())
            uhost.TraitDefs[tk.Name] = new WbTraitDef
            {
                HpMul = tk.Value.GetProperty("hpMul").GetDouble(),
                DmgMul = tk.Value.GetProperty("dmgMul").GetDouble(),
                SpeedMul = tk.Value.GetProperty("speedMul").GetDouble(),
                Regen = tk.Value.GetProperty("regen").GetDouble(),
                Immune = tk.Value.GetProperty("immune").GetBoolean(),
            };
        foreach (var tk in jbd.GetProperty("traitKeys").EnumerateArray()) uhost.TraitKeyOrder.Add(tk.GetString()!);
        var emJJ = jbd.GetProperty("em");
        uhost.TraitPrefix = emJJ.GetProperty("traitPrefix").EnumerateArray().Select(x => x.GetString()!).ToArray();
        uhost.TraitBody = emJJ.GetProperty("traitBody").EnumerateArray().Select(x => x.GetString()!).ToArray();
        uhost.FamPre = emJJ.GetProperty("famPre").EnumerateArray().Select(x => x.GetString()!).ToArray();
        uhost.FamPost = emJJ.GetProperty("famPost").EnumerateArray().Select(x => x.GetString()!).ToArray();
        foreach (var fj in jbd.GetProperty("firsts").EnumerateObject())
            uhost.FirstNames[int.Parse(fj.Name)] = fj.Value.EnumerateArray().Select(x => x.GetString()!).ToArray();
        uhost.JobWeights = jbJobW; uhost.JobHpMul = jbJobH; uhost.JobDmgMul = jbJobD; uhost.JobSpeedMul = jbJobS; uhost.JobN = jbJobW.Length;
        // —— 双域接线（civ 域回调 + 总动员武装回调 + 战争查询） ——
        uhost.CivAtWar = civ => WbDiplomacy.CivAtWar(wst, whost, civ);
        uhost.TechModsU = civ => WbDiplomacy.TechModsOf(wst, whost, civ);
        uhost.IdeaModsU = civ => WbDiplomacy.IdeaModsOf(wst, whost, civ);
        uhost.ActiveDirU = (civ, kind) => WbDiplomacy.ActiveDirective(whost, civ, kind) != null;
        uhost.PopCapU = civ => whost.CivAt(civ) != null ? WbDiplomacy.PopCapOf(whost, whost.CivAt(civ)!) : 0.0;
        uhost.CivAliveU = civ => whost.CivAt(civ)?.Alive ?? false;
        uhost.CivPopU = civ => whost.CivAt(civ)?.Pop ?? double.NaN;
        uhost.CivPopAddU = civ => { var c3 = whost.CivAt(civ); if (c3 != null) c3.Pop += 1; };
        uhost.CivGovU = civ => whost.CivAt(civ)?.Gov ?? 0;
        // —— 和平文明职业链宿主面（fireSet/damaged 契约空；建筑快照经 wst.Buildings） ——
        uhost.CivInfoU = civ => whost.CivAt(civ) != null ? ((int)0, (int)0, whost.CivAt(civ)!.Capital) : ((int X, int Y, int Capital)?)null;
        uhost.CivTradeGoldU = civ => { var c4 = whost.CivAt(civ); if (c4 != null) c4.Gold = (c4.Gold ?? 0) + 2; };
        uhost.BuildingsOfU = () => wst.Buildings.Select(b => (b.Civ, b.X, b.Y, b.Kind));
        // —— 单位装载 ——
        var specs5 = c.GetProperty("units");
        int un5 = specs5.GetArrayLength();
        var ust4 = new WbUnitsState(un5 + 256);
        ust4.LiveLen = un5;
        for (int i = 0; i < un5; i++) JbLoadUnit(ust4, i, specs5[i]);
        ust4.RngA = seed;
        for (int i = 0; i < un5; i++)
            if (!ust4.Dead[i])
            {
                byte fl = uhost.RaceFlags[ust4.Race[i]];
                if ((fl & WbConstants.FCiv) == 0) uhost.BumpWild(ust4.Race[i], 1);
            }
        if (envJ.TryGetProperty("wild", out var wildInit5))
            foreach (var w in wildInit5.EnumerateArray()) uhost.BumpWild((uint)w[0].GetInt32(), w[1].GetInt32());
        if (envJ.TryGetProperty("families", out var initFam5b))
            foreach (var f in initFam5b.EnumerateArray())
            {
                var fo = f[1];
                uhost.Families[fo.GetProperty("id").GetInt32()] = new WbFamily
                {
                    Id = fo.GetProperty("id").GetInt32(), Name = fo.GetProperty("name").GetString()!,
                    Founded = fo.GetProperty("founded").GetInt32(),
                    Founder = fo.GetProperty("founder").GetString()!, Members = fo.GetProperty("members").GetInt32(),
                    Heroes = fo.GetProperty("heroes").GetInt32(), Kills = fo.GetProperty("kills").GetInt32(),
                    Peak = fo.GetProperty("peak").GetInt32(), Milestones = fo.GetProperty("milestones").GetInt32(),
                };
            }
        uhost.FamilySeq = envJ.TryGetProperty("familySeq", out var fsq5b) ? fsq5b.GetInt32() : 1;
        uhost.UnitSeq = envJ.TryGetProperty("unitSeq", out var usq5b) ? usq5b.GetInt32() : 1000;   // gen makeStubEng 默认 1000
        uhost.TraitSeq = envJ.TryGetProperty("traitSeq", out var tsq5b) ? tsq5b.GetInt32() : 0;
        uhost.GrassTiles = envJ.TryGetProperty("grassTiles", out var gt5b) ? gt5b.GetDouble() : 0.0;
        uhost.YearF = whost.YearF;
        whost.MobilizeArmU = civId => WbUnits.MobilizeArmCiv(ust4, uhost, civId);   // ust4 声明后接线
        // —— M-U3 切片 5：科技回溯 + 图谱消费回调（completeTech → 单位域 SOA 循环） ——
        whost.TechRetroU = (civId, nmD, nmH) => WbUnits.TechRetro(ust4, uhost, civId, nmD, nmH);
        whost.EvoNextU = () => uhost.EvoSeq++;
        // —— M-U3 切片 7：civsTick → 单位域读写投影（全民改籍/武装化/殖民启航/加冕/homogeneity） ——
        whost.UnitCountU = () => ust4.LiveLen;
        whost.UnitViewU = i => new WbUView
        {
            Dead = ust4.Dead[i], Civ = ust4.Civ[i], Boat = ust4.Boat[i] != 0, Job = ust4.Job[i],
            King = ust4.King[i], Id = ust4.Id[i], Name = ust4.Name[i] ?? "",
            Race = (int)ust4.Race[i], X = ust4.X[i], Y = ust4.Y[i],
            Kills = ust4.Kills[i], ArmyId = ust4.Army[i], Wep = ust4.Wep[i] ?? "",
            Lx = ust4.Lx[i], Ly = ust4.Ly[i], Tx = ust4.Tx[i], Ty = ust4.Ty[i],
            BoatTtl = ust4.BoatTtl[i], Hp = ust4.Hp[i], Cd = ust4.Cd[i], Dmg = ust4.Dmg[i],
        };
        // —— M-U3 切片 8：军团域 → 单位域读写投影（编队/编入/解散/追击/机炮/齐射/舰队） ——
        whost.UnitsAllU = () =>
        {
            var arr = new WbUView[ust4.LiveLen];
            for (int i = 0; i < ust4.LiveLen; i++) arr[i] = whost.UnitViewU(i);
            return arr;
        };
        whost.IsRangedU = s => WbUnits.IsRangedMember(ust4, uhost, s);
        whost.MemberTxyU = (s, x, y) => { ust4.Tx[s] = x; ust4.Ty[s] = y; };
        whost.UnitArmySetU = (s, aid) => ust4.Army[s] = aid;
        whost.DisbandMemberU = s => { ust4.Army[s] = -1; ust4.Boat[s] = 0; ust4.BoatTtl[s] = 0; };
        whost.ChaseKillU = s =>
        {
            ust4.Hp[s] = 0; ust4.Dead[s] = true;   // JS: victim.hp = 0; victim.dead = true（hurt 不动）
            uhost.PendingCorpse.Add(new WbCorpse(ust4.X[s], ust4.Y[s], false, false));   // addCorpse(x,y,false,false)——FxCorpses 恒 true（env5 硬编码）
            WbDiplomacy.WwCountKill(whost, ust4.Civ[s]);
        };
        whost.MechHitU = (s, dmg) =>
        {
            ust4.Hp[s] -= dmg; ust4.Hurt[s] = 20;
            if (ust4.Hp[s] <= 0) { ust4.Dead[s] = true; WbDiplomacy.WwCountKill(whost, ust4.Civ[s]); }
        };
        whost.VolleyCdU = (s, cd) => { ust4.Cd[s] = cd; ust4.Atk[s] = 10; };
        whost.NavalBoardU = (s, x, y) => { ust4.Boat[s] = 1; ust4.BoatTtl[s] = 1600; };
        whost.BoatTtlFloorU = (s, v) => ust4.BoatTtl[s] = Math.Max(ust4.BoatTtl[s], (int)v);
        whost.NavalAshoreU = (s, x, y) => { ust4.Boat[s] = 0; ust4.BoatTtl[s] = 0; ust4.X[s] = x; ust4.Y[s] = y; ust4.Lx[s] = x; ust4.Ly[s] = y; };
        whost.NavalBoardAtU = (s, x, y) => { ust4.Boat[s] = 1; ust4.BoatTtl[s] = 1600; ust4.X[s] = x; ust4.Y[s] = y; ust4.Lx[s] = x; ust4.Ly[s] = y; };
        whost.NavalAshoreAtU = (s, x, y) => { ust4.Boat[s] = 0; ust4.BoatTtl[s] = 0; ust4.X[s] = x; ust4.Y[s] = y; ust4.Lx[s] = x; ust4.Ly[s] = y; };
        uhost.WarKillArmyU = armyId => WbDiplomacy.ArmyKillCredit(wst, armyId);
        // —— M-U3 切片 8：旧文档 stub 契约镜像（jobs/tech/society/civtick 黄金以 __stub__ 生成——
        //    army/rebel 文档走真实现；tryFormArmy 零 rng/零组建/仅事件标记）——
        whost.TryFormArmyHook = name.StartsWith("army-") || name.StartsWith("rebel-")
            ? null
            : (cv, tg) => { whost.AddEvent("tryFormArmy", $"__stub__{cv.Id}:{tg?.ToString() ?? "null"}", null, null, null); return null; };
        // —— M-U3 切片 9：createCiv 姓名域委托（unitName 主流 1 抽 + 在世同名扫描 + 半径 9 单点改籍）——
        whost.UnitBaseNameU = race =>
        {
            if (!uhost.FirstNames.TryGetValue(race, out var pool) || pool == null || pool.Length == 0)
                uhost.FirstNames.TryGetValue(0, out pool);
            if (pool == null || pool.Length == 0) return "?";
            return pool[(int)Math.Floor(wst.Rng() * pool.Length)];
        };
        whost.NameDupScanU = (b, bl) =>
        {
            int n9 = 0;
            for (int i9 = 0; i9 < ust4.LiveLen; i9++)
            {
                if (ust4.Dead[i9]) continue;
                string? nm9 = ust4.Name[i9];
                if (nm9 == null) continue;
                if (nm9 == b || (nm9.Length > bl && nm9[bl] == ' ' && nm9.StartsWith(b, StringComparison.Ordinal))) n9++;
            }
            return n9;
        };
        whost.UnitCivSlotU = (s, c9) => ust4.Civ[s] = c9;
        whost.KingSetU = (i, k) => ust4.King[i] = k;
        whost.SetJobSlotU = (i, j) => WbUnits.SetJob(ust4, uhost, i, j);
        whost.CivReassignU = (g, k) => WbUnits.CivReassign(ust4, g, k);
        whost.MobilizeTickU = civId => WbUnits.MobilizeArmTick(ust4, uhost, civId);
        whost.ColonyLaunchU = (i, wx, wy, tx, ty) => WbUnits.ColonyLaunch(ust4, i, wx, wy, tx, ty);
        whost.HomogeneityU = () => WbUnits.CivRacePairs(ust4, uhost);
        whost.SlotByIdU = id =>
        {
            for (int i = 0; i < ust4.LiveLen; i++) if (ust4.Id[i] == id) return i;
            return -1;
        };
        var env5 = new WbMoveEnv
        {
            PanicDecay = jbPanicDecay, GrudgeDecay = jbGrudgeDecay, FireDamage = jbFire, PanicRout = jbPanicRout,
            FxAmbience = envJ.TryGetProperty("ambience", out var am5) && am5.GetBoolean(),
            Season = whost.Season,
            BloodMoonTtl = envJ.TryGetProperty("bloodMoonTtl", out var bm5) ? bm5.GetDouble() : 0.0,
            EclipseTtl = envJ.TryGetProperty("eclipseTtl", out var ec5) ? ec5.GetDouble() : 0.0,
            DayPhase = envJ.GetProperty("dayPhase").GetDouble(),
            LawsZombieInfect = envJ.TryGetProperty("lawsZombie", out var lz5) && lz5.GetBoolean(),
            LawsZombieVirus = !envJ.TryGetProperty("lawsZombieVirus", out var zv5) || zv5.GetBoolean(),
            LawsReproduction = !envJ.TryGetProperty("lawsReproduction", out var lr5) || lr5.GetBoolean(),
            FxBlood = true, FxDmgNumbers = true, FxCorpses = true,
            NeuroEnabled = false, FlightModeRl = true,
            MutationRate = jbMutationRate, ReproMulEp = jbReproMul,
        };
        // —— emIdeas 注入（ideaModsOf 涌现面） ——
        // （op 驱动 setemidea 写入 whost.EmIdeas）

        var opsJ = c.GetProperty("ops").EnumerateArray().ToArray();
        var outJ = c.GetProperty("out").EnumerateArray().ToArray();
        try
        {
        for (int si = 0; si < opsJ.Length; si++)
        {
            var op = opsJ[si];
            var o = op.GetProperty("op").GetString()!;
            var rec = outJ[si];
            int evStart = whost.PendingEvents.Count;
            int ustDraw0 = ust4.RngDraws, wstDraw0 = wst.RngDraws;
            int fxStart5 = uhost.PendingFx.Count;
            int wstFx0 = wst.Effects.Count;   // M-U3 切片 7：真实现 fx 窗口（smoke/hammer/spawn）
            string tag = $"jb.{name}.{si}.{o}";
            switch (o)
            {
                case "spawn":
                {
                    int race = op.TryGetProperty("race", out var rj) && rj.ValueKind == JsonValueKind.Number ? rj.GetInt32() : jbRaceIds[op.GetProperty("race").GetString()!];
                    int civ = op.GetProperty("civ").GetInt32();
                    int job = op.TryGetProperty("job", out var jj) && jj.ValueKind == JsonValueKind.Number ? jj.GetInt32() : -1;
                    bool hasTrait = op.TryGetProperty("trait", out var trj) && trj.ValueKind == JsonValueKind.String;
                    string? trait = hasTrait ? trj.GetString() : null;
                    int su = WbUnits.SpawnUnit(ust4, uhost, env5, race, op.GetProperty("x").GetDouble(), op.GetProperty("y").GetDouble(),
                        civ, hasTrait, trait, false, 0, 0, 0, 0, false, -1, 0, true, job);
                    if (su >= 0)
                    {
                        var sp = new CbSnap(); JbSnapTake(ust4, su, sp);
                        var pj = rec.GetProperty("probe");
                        JbSnapCompare($"{tag}.spawn", pj, sp);
                    }
                    else JbCheckI($"{tag}.spawnNull", 1, rec.GetProperty("probe").ValueKind == JsonValueKind.Null ? 1 : 0, "");
                    break;
                }
                case "step":
                {
                    WbGrid.Rebuild(ust4, grid5);
                    var usOut5 = rec.GetProperty("units");
                    int unN5 = usOut5.GetArrayLength();
                    var snapsList5 = new List<CbSnap>();
                    var upList5 = new List<int> { uhost.PendingUpd.Count };
                    var fxList5b = new List<int> { uhost.PendingFx.Count };
                    for (int i = 0; i < ust4.LiveLen; i++)
                    {
                        if (ust4.Dead[i]) { upList5.Add(uhost.PendingUpd.Count); fxList5b.Add(uhost.PendingFx.Count); snapsList5.Add(new CbSnap()); JbSnapTake(ust4, i, snapsList5[snapsList5.Count - 1]); continue; }
                        int d0p = ust4.RngDraws;
                        bool ended5 = WbUnits.UpdateUnitPre(ust4, uhost, env5, i);
                        if (!ended5)
                        {
                            var exit5 = WbUnits.UpdateUnitScan(ust4, uhost, env5, grid5, i);
                            if (exit5 == WbUnits.WbScanExit.ToTailPost)
                                uhost.PendingUpd.Add(new WbUpdEvent("tail", ust4.Id[i], 0.0, 0.0));
                            if (exit5 != WbUnits.WbScanExit.Ended)
                                WbUnits.UpdateUnitPost(ust4, uhost, env5, i);
                        }
                        snapsList5.Add(new CbSnap()); JbSnapTake(ust4, i, snapsList5[snapsList5.Count - 1]);
                        upList5.Add(uhost.PendingUpd.Count); fxList5b.Add(uhost.PendingFx.Count);
                    }
                    JbCheckI($"{tag}.liveN", unN5, ust4.LiveLen, "");
                    var allJ5 = rec.GetProperty("all");
                    JbCheckI($"{tag}.aliveN", allJ5.GetArrayLength(), ust4.LiveLen, "");
                    for (int i = 0; i < Math.Min(allJ5.GetArrayLength(), ust4.LiveLen); i++)
                    {
                        var sp2 = new CbSnap(); JbSnapTake(ust4, i, sp2);
                        JbSnapCompare($"{tag}.all{i}", allJ5[i], sp2);
                    }
                    WbUnits.Reap(ust4, uhost, env5, grid5);
                    // perU 快照比对（即时刻——reap 前）
                    for (int i = 0; i < unN5; i++)
                    {
                        var uo = usOut5[i];
                        if (uo.ValueKind != JsonValueKind.Object || !uo.TryGetProperty("age", out _)) { JbCheckI($"{tag}.u{i}.deadSkip", 1, snapsList5[i].Dead ? 1 : 0, ""); continue; }
                        JbSnapCompare($"{tag}.u{i}", uo, snapsList5[i]);
                        var evtJ5 = uo.GetProperty("evt");
                        JbCheckI($"{tag}.u{i}.evtN", evtJ5.GetArrayLength(), upList5[i + 1] - upList5[i], "");
                        int evc5 = 0;
                        foreach (var e in evtJ5.EnumerateArray())
                        {
                            int ei = upList5[i] + evc5;
                            if (ei < upList5[i + 1])
                                JbCheckS($"{tag}.u{i}.evt{evc5}", e[0].GetString()!, ei < uhost.PendingUpd.Count ? uhost.PendingUpd[ei].Kind : "", "");
                            evc5++;
                        }
                        var fxJ5 = uo.GetProperty("fx");
                        JbCheckI($"{tag}.u{i}.fxN", fxJ5.GetArrayLength(), fxList5b[i + 1] - fxList5b[i], "");
                        int fxc5 = 0;
                        foreach (var f in fxJ5.EnumerateArray())
                        {
                            int fi2 = fxList5b[i] + fxc5;
                            if (fi2 < fxList5b[i + 1])
                            {
                                var pf = uhost.PendingFx[fi2];
                                JbCheckS($"{tag}.u{i}.fx{fxc5}", f[0].GetString()!, pf.Kind, "");
                                JbCheckN($"{tag}.u{i}.fx{fxc5}.x", f[1].GetString()!, pf.X);
                                JbCheckN($"{tag}.u{i}.fx{fxc5}.y", f[2].GetString()!, pf.Y);
                                JbCheckI($"{tag}.u{i}.fx{fxc5}.ttl", f[3].GetInt32(), (long)pf.Ttl, "");
                            }
                            fxc5++;
                        }
                    }
                    // 步级 fx（reap 窗口）+ wild + families
                    var fxJ = rec.GetProperty("fx");
                    JbCheckI($"{tag}.fxN", fxJ.GetArrayLength(), uhost.PendingFx.Count - fxStart5, "");
                    var wildJ = rec.GetProperty("wild");
                    {
                        var expect = new List<(uint, int)>();
                        foreach (var w in wildJ.EnumerateArray()) expect.Add(((uint)w[0].GetInt32(), w[1].GetInt32()));
                        JbCheckI($"{tag}.wildN", expect.Count, uhost.WildCount.Count, "");
                        foreach (var (rk, rv) in expect)
                            JbCheckI($"{tag}.wild{rk}", rv, uhost.WildCount.TryGetValue(rk, out var gv) ? gv : -1, "");
                    }
                    var famJ2 = rec.GetProperty("families");
                    JbCheckI($"{tag}.famN", famJ2.GetArrayLength(), uhost.Families.Count, "");
                    whost.TickCount++;
                    uhost.TickCount = whost.TickCount;
                    break;
                }
                case "dtick": WbDiplomacy.DirectiveTick(wst, whost); break;
                case "issue":
                {
                    int? target = op.TryGetProperty("target", out var tgJ) ? tgJ.GetInt32() : null;
                    var d = WbDiplomacy.IssueDirective(wst, whost, op.GetProperty("civ").GetInt32(), op.GetProperty("kind").GetString()!, op.TryGetProperty("param", out var pj2) ? pj2.GetInt32() : 0, target);
                    var pj = rec.GetProperty("probe");
                    JbCheckI($"{tag}.issue", pj.ValueKind == JsonValueKind.Null ? -1 : pj.GetInt32(), d?.Id ?? -1, "");
                    break;
                }
                case "rebuild": WbDiplomacy.RebuildCivBuildCounts(whost, wst.Buildings); break;
                case "bld":
                {
                    int i2 = op.GetProperty("i").GetInt32(), kind = op.GetProperty("kind").GetInt32(), civ = op.GetProperty("civ").GetInt32();
                    wst.Building[i2] = kind;
                    wst.Buildings.Add(new WbBuilding { I = i2, X = i2 % WbConstants.W, Y = i2 / WbConstants.W, Kind = kind, Civ = civ });
                    wst.BIdx.Set(i2, wst.Buildings.Count - 1);
                    wst.BHp.Set(i2, kind switch { 1 => 70, 2 => 240, 3 => 120, 4 => 40, 5 => 150, 6 => 340, 7 => 90, 8 => 110, 9 => 100, 10 => 140, 11 => 200, _ => 70 });
                    var bcv = whost.CivAt(civ);
                    if (bcv != null && kind != WbConstants.BuildWall) bcv.Houses++;
                    break;
                }
                case "setciv":
                {
                    var cv = whost.CivAt(op.GetProperty("id").GetInt32()) ?? throw new Exception("setciv: no civ");
                    foreach (var prop in op.GetProperty("patch").EnumerateObject())
                    {
                        switch (prop.Name)
                        {
                            case "gold": cv.Gold = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetDouble(); break;
                            case "knowledge": cv.Knowledge = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetDouble(); break;
                            case "houses": cv.Houses = prop.Value.GetInt32(); break;
                            case "alive": cv.Alive = prop.Value.GetBoolean(); break;
                            case "pop": cv.Pop = prop.Value.GetDouble(); break;
                            case "armyCd": cv.ArmyCd = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetInt32(); break;
                            // —— M-U3 切片 5：研究面（techs 全量替换 = JS cv[k] = v 同构）——
                            case "research": cv.Research = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetString(); break;
                            case "researchP": cv.ResearchP = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetDouble(); break;
                            case "income": cv.Income = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetDouble(); break;
                            case "festivalCd": cv.FestivalCd = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetDouble(); break;
                            case "govYear": cv.GovYear = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetInt32(); break;
                            // —— M-U3 切片 7：王权/幽灵/殖民/融合补丁（setking 域）——
                            case "kingId": cv.KingId = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetInt32(); break;
                            case "kingName": cv.KingName = prop.Value.ValueKind == JsonValueKind.Null ? "" : prop.Value.GetString()!; break;
                            case "popZeroTick": cv.PopZeroTick = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetInt32(); break;
                            case "colonizeCd": cv.ColonizeCd = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetDouble(); break;
                            case "mergedInto": cv.MergedInto = prop.Value.ValueKind == JsonValueKind.Null ? null : prop.Value.GetInt32(); break;
                            case "capital": cv.Capital = prop.Value.GetInt32(); break;
                            case "techs":
                                cv.Techs.Clear();
                                foreach (var t in prop.Value.EnumerateArray()) cv.Techs.Add(t.GetString()!);
                                break;
                            default: throw new Exception($"setciv: unknown field {prop.Name}");
                        }
                    }
                    break;
                }
                case "setocc":
                {
                    int i2 = op.GetProperty("i").GetInt32(), civ = op.GetProperty("civ").GetInt32();
                    wst.OccCiv[i2] = civ; wst.OccStr[i2] = op.GetProperty("str").GetInt32(); wst.OccSet.Add(i2);
                    if (civ >= 0 && !whost.CivAt(civ)!.Tiles.Contains(i2)) whost.CivAt(civ)!.Tiles.Add(i2);
                    break;
                }
                case "setemidea":
                {
                    // M-U3 切片 6：全字段升级（name/desc——adoptIdea spread 词法消费面；
                    // mods 缺键 ≡ TS undefined → 0 消费——ideaModsOf ?? 0 同构）
                    var idea = new WbEmIdea { Key = op.GetProperty("key").GetString()!, Name = op.TryGetProperty("name", out var nmI) ? nmI.GetString()! : op.GetProperty("key").GetString()!, Desc = op.TryGetProperty("desc", out var dsI) ? dsI.GetString()! : "" };
                    var mj = op.GetProperty("mods");
                    if (mj.TryGetProperty("gold", out var m1)) idea.Mods.Gold = m1.GetDouble();
                    if (mj.TryGetProperty("stab", out var m2)) idea.Mods.Stab = m2.GetDouble();
                    if (mj.TryGetProperty("mil", out var m3)) idea.Mods.Mil = m3.GetDouble();
                    if (mj.TryGetProperty("know", out var m4)) idea.Mods.Know = m4.GetDouble();
                    if (mj.TryGetProperty("repro", out var m5)) idea.Mods.Repro = m5.GetDouble();
                    if (mj.TryGetProperty("wear", out var m6)) idea.Mods.Wear = m6.GetDouble();
                    whost.EmIdeas.Set(idea.Key, idea);
                    break;
                }
                case "sethomo":
                    whost.CivHomogeneity.Set(op.GetProperty("civ").GetInt32(), op.GetProperty("v").GetDouble());
                    break;
                case "stick": WbDiplomacy.SocietyTick(wst, whost); break;
                case "setvict": whost.VictoryCiv = op.GetProperty("id").GetInt32(); break;
                case "setwd":
                {
                    var wd = wst.WarData.Get(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32())) ?? throw new Exception("setwd: no warData");
                    foreach (var prop in op.GetProperty("patch").EnumerateObject())
                    {
                        switch (prop.Name)
                        {
                            case "scoreA": wd.ScoreA = prop.Value.GetDouble(); break;
                            case "scoreB": wd.ScoreB = prop.Value.GetDouble(); break;
                            case "startTick": wd.StartTick = prop.Value.GetInt32(); break;
                            default: throw new Exception($"setwd: unknown field {prop.Name}");
                        }
                    }
                    break;
                }
                case "war":
                {
                    var opts = new WbWarOpts();
                    if (op.TryGetProperty("opts", out var optsJ2) && optsJ2.ValueKind == JsonValueKind.Object)
                    {
                        if (optsJ2.TryGetProperty("total", out var tj2)) opts.Total = tj2.GetBoolean();
                        if (optsJ2.TryGetProperty("goal", out var gj2)) opts.Goal = gj2.GetInt32();
                        if (optsJ2.TryGetProperty("force", out var fj2)) opts.Force = fj2.GetBoolean();
                        if (optsJ2.TryGetProperty("quiet", out var qj2)) opts.Quiet = qj2.GetBoolean();
                    }
                    WbDiplomacy.DeclareWar(wst, whost, op.GetProperty("agg").GetInt32(), op.GetProperty("vic").GetInt32(), op.GetProperty("reason").GetString()!, opts);
                    break;
                }
                case "peace": WbDiplomacy.MakePeace(wst, whost, op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32(), op.GetProperty("text").GetString()!, op.GetProperty("postRel").GetInt32()); break;
                case "adv": whost.TickCount += op.GetProperty("n").GetInt32(); uhost.TickCount = whost.TickCount; break;
                case "warkill": WbDiplomacy.OnWarKill(wst, whost, op.GetProperty("kc").GetInt32(), op.GetProperty("vc").GetInt32(), op.TryGetProperty("ka", out var ka8) ? ka8.GetInt32() : -1); break;   // M-U3 切片 8：ka = killer.army（军团战功面）
                case "killciv": whost.CivAt(op.GetProperty("id").GetInt32())!.Alive = false; break;
                case "popcap":
                {
                    var cv = whost.CivAt(op.GetProperty("civ").GetInt32());
                    var pj = rec.GetProperty("probe");
                    if (cv != null && pj.ValueKind != JsonValueKind.Null) JbCheckN($"{tag}.popcap", pj.GetString()!, WbDiplomacy.PopCapOf(whost, cv));
                    break;
                }
                case "tmod":
                {
                    int civ = op.GetProperty("civ").GetInt32();
                    var tm = WbDiplomacy.TechModsOf(wst, whost, civ);
                    var pj = rec.GetProperty("probe");
                    foreach (var prop in pj.EnumerateObject())
                    {
                        double v = prop.Name switch
                        {
                            "dmg" => tm.Dmg, "hp" => tm.Hp, "bhp" => tm.Bhp, "gold" => tm.Gold, "know" => tm.Know,
                            "repro" => tm.Repro, "col" => tm.Col, "tax" => tm.Tax, "cult" => tm.Cult, "repair" => tm.Repair,
                            "stab" => tm.Stab, "morale" => tm.Morale, "armyMax" => tm.ArmyMax, "archer" => tm.Archer,
                            "plague" => tm.Plague, "range" => tm.Range, "arty" => tm.Arty, "bomber" => tm.Bomber,
                            "nukeCap" => tm.NukeCap, "laser" => tm.Laser, "drone" => tm.Drone, "orbital" => tm.Orbital,
                            "mech" => tm.Mech, "ai" => tm.Ai, "plasma" => tm.Plasma, "antiMatter" => tm.AntiMatter,
                            _ => throw new Exception($"tmod: unknown key {prop.Name}"),
                        };
                        JbCheckN($"{tag}.tm.{prop.Name}", prop.Value.GetString()!, v);
                    }
                    break;
                }
                case "imod":
                {
                    int civ = op.GetProperty("civ").GetInt32();
                    var im = WbDiplomacy.IdeaModsOf(wst, whost, civ);
                    var pj = rec.GetProperty("probe");
                    JbCheckN($"{tag}.im.gold", pj.GetProperty("gold").GetString()!, im.Gold);
                    JbCheckN($"{tag}.im.stab", pj.GetProperty("stab").GetString()!, im.Stab);
                    JbCheckN($"{tag}.im.mil", pj.GetProperty("mil").GetString()!, im.Mil);
                    JbCheckN($"{tag}.im.know", pj.GetProperty("know").GetString()!, im.Know);
                    JbCheckN($"{tag}.im.repro", pj.GetProperty("repro").GetString()!, im.Repro);
                    JbCheckN($"{tag}.im.wear", pj.GetProperty("wear").GetString()!, im.Wear);
                    break;
                }
                case "prog":
                {
                    var d = WbDiplomacy.ActiveDirective(whost, op.GetProperty("civ").GetInt32(), op.GetProperty("kind").GetString()!);
                    var pj = rec.GetProperty("probe");
                    if (d != null && pj.ValueKind != JsonValueKind.Null)
                        JbCheckN($"{tag}.prog", pj.GetString()!, WbDiplomacy.DirectiveProgressOf(wst, whost, d));
                    else JbCheckI($"{tag}.progNull", 1, pj.ValueKind == JsonValueKind.Null && d == null ? 1 : 0, "");
                    break;
                }
                // ================== M-U3 切片 5：科技研发域 op ==================
                case "etick": WbDiplomacy.EconomyTick(wst, whost); break;
                case "ttick": WbDiplomacy.TechTick(wst, whost); break;
                case "fundres":
                {
                    double spent = WbDiplomacy.FundResearch(wst, whost, whost.CivAt(op.GetProperty("civ").GetInt32())!, op.GetProperty("points").GetDouble());
                    JbCheckN($"{tag}.fundres", rec.GetProperty("probe").GetString()!, spent);
                    break;
                }
                case "avail":
                {
                    var keys = WbDiplomacy.AvailableTechs(whost, whost.CivAt(op.GetProperty("civ").GetInt32())!).Select(t => t.Key).ToList();
                    var pj = rec.GetProperty("probe");
                    JbCheckI($"{tag}.availN", pj.GetArrayLength(), keys.Count, "");
                    int ai = 0;
                    foreach (var a in pj.EnumerateArray()) { JbCheckS($"{tag}.avail{ai}", a.GetString()!, ai < keys.Count ? keys[ai] : null, ""); ai++; }
                    break;
                }
                case "pickres":
                {
                    var pick = WbDiplomacy.PickResearch(wst, whost, whost.CivAt(op.GetProperty("civ").GetInt32())!);
                    var pj = rec.GetProperty("probe");
                    JbCheckS($"{tag}.pickres", pj.ValueKind == JsonValueKind.Null ? null : pj.GetString()!, pick, "");
                    break;
                }
                case "comptech": WbDiplomacy.CompleteTech(wst, whost, whost.CivAt(op.GetProperty("civ").GetInt32())!, op.GetProperty("key").GetString()!); break;
                case "formal":
                {
                    var al = WbDiplomacy.FormAlliance(wst, whost, whost.CivAt(op.GetProperty("a").GetInt32())!, whost.CivAt(op.GetProperty("b").GetInt32())!);
                    var pj = rec.GetProperty("probe");
                    JbCheckI($"{tag}.formal", pj.ValueKind == JsonValueKind.Null ? -1 : pj.GetInt32(), al?.Id ?? -1, "");
                    break;
                }
                case "setalpatch":
                {
                    var al = whost.Alliances.Find((a) => a.Id == op.GetProperty("id").GetInt32()) ?? throw new Exception("setalpatch: no alliance");
                    foreach (var prop in op.GetProperty("patch").EnumerateObject())
                    {
                        switch (prop.Name)
                        {
                            case "bonded": al.Bonded = prop.Value.GetBoolean(); break;
                            case "cohesion": al.Cohesion = prop.Value.GetDouble(); break;
                            case "formedTick": al.FormedTick = prop.Value.GetInt32(); break;   // M-U3 切片 7：civFuseScan 1440 拍门
                            default: throw new Exception($"setalpatch: unknown field {prop.Name}");
                        }
                    }
                    break;
                }
                case "setemtech":
                {
                    var et = new WbEmTech
                    {
                        Key = op.GetProperty("key").GetString()!, Name = op.GetProperty("name").GetString()!,
                        Cat = op.GetProperty("cat").GetString()!, Cost = op.GetProperty("cost").GetDouble(),
                        Gen = op.GetProperty("gen").GetInt32(), Desc = op.GetProperty("desc").GetString()!,
                    };
                    foreach (var e in op.GetProperty("effects").EnumerateArray())
                        et.Effects.Add((e.GetProperty("k").GetString()!, e.GetProperty("v").GetDouble()));
                    whost.EmTechs[et.Key] = et;
                    break;
                }
                case "bhps":
                {
                    var pj = rec.GetProperty("probe");
                    JbCheckI($"{tag}.bhpN", pj.GetArrayLength(), wst.BHp.Count, "");
                    int bi = 0;
                    foreach (var b in pj.EnumerateArray())
                    {
                        int bi2 = b[0].GetInt32();
                        // 插入序对账：golden bHp 为 JS Map 迭代序——WbOrderedMap.Pairs 同序
                        var pair = wst.BHp.Pairs().ElementAtOrDefault(bi);
                        JbCheckI($"{tag}.bhp{bi}.i", bi2, pair.Key, "");
                        JbCheckN($"{tag}.bhp{bi}.v", b[1].GetString()!, pair.Value);
                        bi++;
                    }
                    break;
                }
                // ================== M-U3 切片 7：civsTick 经济社会域 op ==================
                case "ctick": WbDiplomacy.RebuildCivBuildCounts(whost, wst.Buildings); WbDiplomacy.CivsTick(wst, whost); break;   // 真实引擎每 5 拍驱动序
                case "stattick": WbDiplomacy.StatsHomogeneity(wst, whost); break;   // homogeneity 重建真实现（UI 快照面截断④）
                case "wtick": WbDiplomacy.WarTick(wst, whost); break;   // M-U3 切片 9：战争域推进（rebel war 面）
                case "btick": WbGrid.Rebuild(ust4, grid5); WbDiplomacy.BarracksTick(wst, whost, grid5); break;   // M-U3 切片 10：兵营练兵（%200 调用点拍前桶已重建——显式化）
                case "laws":
                {
                    foreach (var prop in op.EnumerateObject())
                    {
                        if (prop.Name == "op") continue;
                        if (prop.Name == "cityGrowth") whost.LawsCityGrowth = prop.Value.GetBoolean();
                        if (prop.Name == "rebels") whost.LawsRebels = prop.Value.GetBoolean();
                        if (prop.Name == "wars") whost.LawsWars = prop.Value.GetBoolean();
                    }
                    break;
                }
                // —— M-U3 切片 8：外交关系注入（mergeCivs 第三方继承/清理对账面）——
                case "setrel": wst.Rel.Set(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32()), op.GetProperty("v").GetDouble()); break;
                case "met": wst.Met.Add(WbDiplomacy.PairKey(op.GetProperty("a").GetInt32(), op.GetProperty("b").GetInt32())); break;
                // —— M-U3 切片 8：军团域 op（组军/状态机/战线/补丁面）——
                case "form":
                {
                    var cv8 = whost.CivAt(op.GetProperty("civ").GetInt32())!;
                    int? tgt8 = op.TryGetProperty("target", out var t8) ? t8.GetInt32() : (int?)null;
                    var formed = WbDiplomacy.TryFormArmy(wst, whost, cv8, tgt8);
                    var probeJ8 = rec.GetProperty("probe");
                    JbCheckI($"{tag}.formProbe", probeJ8.ValueKind == JsonValueKind.Null ? -1 : probeJ8.GetInt32(), formed?.Id ?? -1, "");
                    break;
                }
                case "atick": WbDiplomacy.ArmyTick(wst, whost); break;
                case "ftick": WbDiplomacy.FrontTick(wst, whost); break;
                case "setarmy":
                {
                    var a8 = wst.Armies.Find(x => x.Id == op.GetProperty("id").GetInt32());
                    if (a8 == null) throw new Exception($"setarmy: no army {op.GetProperty("id").GetInt32()}");
                    foreach (var pp in op.GetProperty("patch").EnumerateObject())
                    {
                        switch (pp.Name)
                        {
                            case "state": a8.State = pp.Value.GetString()!; break;
                            case "x": a8.X = pp.Value.GetDouble(); break;
                            case "y": a8.Y = pp.Value.GetDouble(); break;
                            case "tx": a8.Tx = pp.Value.GetDouble(); break;
                            case "ty": a8.Ty = pp.Value.GetDouble(); break;
                            case "morale": a8.Morale = pp.Value.GetDouble(); break;
                            case "formedTick": a8.FormedTick = pp.Value.GetInt32(); break;
                            case "evalTick": a8.EvalTick = pp.Value.GetInt32(); break;
                            case "marchPushTick": a8.MarchPushTick = pp.Value.GetInt32(); break;
                            case "clashWith": a8.ClashWith = pp.Value.ValueKind == JsonValueKind.Null ? null : pp.Value.GetInt32(); break;
                            case "naval": a8.Naval = pp.Value.GetBoolean(); break;
                            default: throw new Exception($"setarmy: unknown patch {pp.Name}");
                        }
                    }
                    break;
                }
                case "setu":
                {
                    int s8 = -1;
                    int uid8 = op.GetProperty("id").GetInt32();
                    for (int i8 = 0; i8 < ust4.LiveLen; i8++) if (ust4.Id[i8] == uid8) { s8 = i8; break; }
                    if (s8 < 0) throw new Exception($"setu: no unit {uid8}");
                    foreach (var pp in op.GetProperty("patch").EnumerateObject())
                    {
                        switch (pp.Name)
                        {
                            case "dead": ust4.Dead[s8] = pp.Value.GetBoolean(); break;
                            case "x": ust4.X[s8] = pp.Value.GetDouble(); break;
                            case "y": ust4.Y[s8] = pp.Value.GetDouble(); break;
                            case "hp": ust4.Hp[s8] = pp.Value.GetDouble(); break;
                            case "job": ust4.Job[s8] = pp.Value.GetInt32(); break;
                            case "army": ust4.Army[s8] = pp.Value.GetInt32(); break;
                            case "boat": ust4.Boat[s8] = (byte)(pp.Value.GetInt32()); break;
                            case "boatTTL": ust4.BoatTtl[s8] = pp.Value.GetInt32(); break;
                            case "kills": ust4.Kills[s8] = pp.Value.GetInt32(); break;
                            default: throw new Exception($"setu: unknown patch {pp.Name}");
                        }
                    }
                    break;
                }
                default: throw new Exception($"jb unknown op: {o}");
            }
            // —— 每 op 对账：draws / dirs / civs / evts ——
            JbCheckI($"{tag}.draws", rec.GetProperty("draws").GetInt32(), (ust4.RngDraws - ustDraw0) + (wst.RngDraws - wstDraw0), "");
            JbCheckDirs($"{tag}.dirs", rec.GetProperty("dirs"), whost);
            JbCheckCivs($"{tag}.civs", rec.GetProperty("civs"), whost, deepTiles: name.StartsWith("rebel-"));
            JbCheckEvents($"{tag}.evt", rec.GetProperty("evts"), whost, evStart);
            // —— M-U3 切片 9：ctick civSeq 消费面 + wtick/ctick 叛乱战争面（tw/wh/rel）——
            if (rec.TryGetProperty("civSeq", out var csqR9))
                JbCheckI($"{tag}.civSeq", csqR9.GetInt32(), whost.CivSeq, "");
            if (rec.TryGetProperty("tw", out var twR9))
            {
                var twArr9 = twR9.EnumerateArray().Select(x => x.GetString()!).ToArray();
                JbCheckI($"{tag}.twN", twArr9.Length, wst.TotalWars.Count, "");
                int ti9 = 0;
                foreach (var tk9 in wst.TotalWars.Order)
                {
                    if (ti9 < twArr9.Length) JbCheckS($"{tag}.tw{ti9}", twArr9[ti9], tk9, "");
                    ti9++;
                }
            }
            if (rec.TryGetProperty("wh", out var whR9))
            {
                var whArr9 = whR9.EnumerateArray().Select(x => x.GetInt32()).ToArray();
                JbCheckI($"{tag}.whN", whArr9.Length, wst.WarHistory.Count, "");
                for (int wi9 = 0; wi9 < Math.Min(whArr9.Length, wst.WarHistory.Count); wi9++)
                    JbCheckI($"{tag}.wh{wi9}", whArr9[wi9], wst.WarHistory[wi9], "");
            }
            if (rec.TryGetProperty("rel", out var relR9))
            {
                JbCheckI($"{tag}.relN", relR9.GetArrayLength(), wst.Rel.Count, "");
                int ri9 = 0;
                foreach (var rv in relR9.EnumerateArray())
                {
                    var pair9 = wst.Rel.Pairs().ElementAtOrDefault(ri9);
                    JbCheckS($"{tag}.rel{ri9}.k", rv[0].GetString()!, pair9.Key, "");
                    JbCheckN($"{tag}.rel{ri9}.v", rv[1].GetString()!, pair9.Value);
                    ri9++;
                }
            }
            // —— M-U3 切片 7：ctick/stattick 扩展快照（units/homo/fallen + ctick 建筑/路/脏标/fx）——
            if (rec.TryGetProperty("units", out var unitsJ7))
            {
                JbCheckI($"{tag}.unitsN", unitsJ7.GetArrayLength(), ust4.LiveLen, "");
                for (int i = 0; i < Math.Min(unitsJ7.GetArrayLength(), ust4.LiveLen); i++)
                {
                    var sp7 = new CbSnap(); JbSnapTake(ust4, i, sp7);
                    JbSnapCompare($"{tag}.u{i}", unitsJ7[i], sp7);
                }
            }
            if (rec.TryGetProperty("homo", out var homoJ7))
            {
                JbCheckI($"{tag}.homoN", homoJ7.GetArrayLength(), whost.CivHomogeneity.Count, "");
                int hi7 = 0;
                foreach (var h in homoJ7.EnumerateArray())
                {
                    var pair = whost.CivHomogeneity.Pairs().ElementAtOrDefault(hi7);
                    JbCheckI($"{tag}.homo{hi7}.civ", h[0].GetInt32(), pair.Key, "");
                    JbCheckN($"{tag}.homo{hi7}.v", h[1].GetString()!, pair.Value);
                    hi7++;
                }
            }
            if (rec.TryGetProperty("fallen", out var fallenJ7))
                JbCheckI($"{tag}.fallen", fallenJ7.GetInt32(), whost.StatCivsFallen, "");
            // —— M-U3 切片 8：军团域快照对账（armies 全维/占领层/战争档案/军团序/播报计时器）——
            if (rec.TryGetProperty("armies", out var armiesJ8))
            {
                JbCheckI($"{tag}.armiesN", armiesJ8.GetArrayLength(), wst.Armies.Count, "");
                int ai8 = 0;
                foreach (var aj in armiesJ8.EnumerateArray())
                {
                    if (ai8 < wst.Armies.Count)
                    {
                        var a8 = wst.Armies[ai8];
                        JbCheckI($"{tag}.army{ai8}.id", aj.GetProperty("id").GetInt32(), a8.Id, "");
                        JbCheckI($"{tag}.army{ai8}.civ", aj.GetProperty("civ").GetInt32(), a8.Civ, "");
                        JbCheckS($"{tag}.army{ai8}.name", aj.GetProperty("name").GetString()!, a8.Name);
                        JbCheckI($"{tag}.army{ai8}.membersN", aj.GetProperty("members").GetArrayLength(), a8.Members.Count, "");
                        int mi8 = 0;
                        foreach (var mj in aj.GetProperty("members").EnumerateArray())
                        {
                            if (mi8 < a8.Members.Count) JbCheckI($"{tag}.army{ai8}.m{mi8}", mj.GetInt32(), a8.Members[mi8], "");
                            mi8++;
                        }
                        JbCheckI($"{tag}.army{ai8}.leaderId", aj.GetProperty("leaderId").GetInt32(), a8.LeaderId, "");
                        JbCheckN($"{tag}.army{ai8}.x", aj.GetProperty("x").GetString()!, a8.X);
                        JbCheckN($"{tag}.army{ai8}.y", aj.GetProperty("y").GetString()!, a8.Y);
                        JbCheckN($"{tag}.army{ai8}.tx", aj.GetProperty("tx").GetString()!, a8.Tx);
                        JbCheckN($"{tag}.army{ai8}.ty", aj.GetProperty("ty").GetString()!, a8.Ty);
                        JbCheckS($"{tag}.army{ai8}.state", aj.GetProperty("state").GetString()!, a8.State);
                        JbCheckI($"{tag}.army{ai8}.formedTick", aj.GetProperty("formedTick").GetInt32(), a8.FormedTick, "");
                        JbCheckI($"{tag}.army{ai8}.size0", aj.GetProperty("size0").GetInt32(), a8.Size0, "");
                        JbCheckN($"{tag}.army{ai8}.morale", aj.GetProperty("morale").GetString()!, a8.Morale);
                        JbCheckI($"{tag}.army{ai8}.targetCiv", aj.GetProperty("targetCiv").GetInt32(), a8.TargetCiv, "");
                        JbCheckN($"{tag}.army{ai8}.rot", aj.GetProperty("rot").GetString()!, a8.Rot);
                        JbCheckI($"{tag}.army{ai8}.kills", aj.GetProperty("kills").GetInt32(), a8.Kills, "");
                        JbCheckI($"{tag}.army{ai8}.losses", aj.GetProperty("losses").GetInt32(), a8.Losses, "");
                        JbCheckI($"{tag}.army{ai8}.evalTick", aj.GetProperty("evalTick").GetInt32(), a8.EvalTick, "");
                        JbCheckI($"{tag}.army{ai8}.battleSize0", aj.GetProperty("battleSize0").ValueKind == JsonValueKind.Null ? -1 : aj.GetProperty("battleSize0").GetInt32(), a8.BattleSize0 ?? -1, "");
                        JbCheckI($"{tag}.army{ai8}.marchPushTick", aj.GetProperty("marchPushTick").ValueKind == JsonValueKind.Null ? -1 : aj.GetProperty("marchPushTick").GetInt32(), a8.MarchPushTick ?? -1, "");
                        JbCheckI($"{tag}.army{ai8}.battleSince", aj.GetProperty("battleSince").ValueKind == JsonValueKind.Null ? -1 : aj.GetProperty("battleSince").GetInt32(), a8.BattleSince ?? -1, "");
                        JbCheckI($"{tag}.army{ai8}.clashWith", aj.GetProperty("clashWith").ValueKind == JsonValueKind.Null ? -1 : aj.GetProperty("clashWith").GetInt32(), a8.ClashWith ?? -1, "");
                        JbCheckB($"{tag}.army{ai8}.naval", aj.GetProperty("naval").GetBoolean(), a8.Naval);
                        JbCheckB($"{tag}.army{ai8}.ambush", aj.GetProperty("ambush").GetBoolean(), a8.Ambush);
                        JbCheckB($"{tag}.army{ai8}.tactical", aj.GetProperty("tactical").GetBoolean(), a8.Tactical);
                        JbCheckI($"{tag}.army{ai8}.reinforced", aj.GetProperty("reinforced").ValueKind == JsonValueKind.Null ? -1 : aj.GetProperty("reinforced").GetInt32(), a8.Reinforced ?? -1, "");
                        JbCheckB($"{tag}.army{ai8}.supplyWarned", aj.GetProperty("supplyWarned").GetBoolean(), a8.SupplyWarned);
                    }
                    ai8++;
                }
            }
            if (rec.TryGetProperty("occ", out var occJ8))
            {
                int occN8 = 0, occS8 = 0;
                foreach (var i8 in wst.OccSet.Order) { occN8++; occS8 += wst.OccStr[i8]; }
                JbCheckI($"{tag}.occN", occJ8.GetProperty("n").GetInt32(), occN8, "");
                JbCheckI($"{tag}.occS", occJ8.GetProperty("s").GetInt32(), occS8, "");
            }
            if (rec.TryGetProperty("wds", out var wdsJ8))
            {
                JbCheckI($"{tag}.wdsN", wdsJ8.GetArrayLength(), wst.WarData.Count, "");
                int wi8 = 0;
                foreach (var wj in wdsJ8.EnumerateArray())
                {
                    var pair8 = wst.WarData.Pairs().ElementAtOrDefault(wi8);
                    if (pair8.Value != null)
                    {
                        JbCheckS($"{tag}.wd{wi8}.k", wj.GetProperty("k").GetString()!, pair8.Key);
                        JbCheckI($"{tag}.wd{wi8}.battles", wj.GetProperty("battles").GetInt32(), pair8.Value.Battles, "");
                        JbCheckN($"{tag}.wd{wi8}.scoreA", wj.GetProperty("scoreA").GetString()!, pair8.Value.ScoreA);
                        JbCheckN($"{tag}.wd{wi8}.scoreB", wj.GetProperty("scoreB").GetString()!, pair8.Value.ScoreB);
                        JbCheckI($"{tag}.wd{wi8}.casA", wj.GetProperty("casA").GetInt32(), pair8.Value.CasA, "");
                        JbCheckI($"{tag}.wd{wi8}.casB", wj.GetProperty("casB").GetInt32(), pair8.Value.CasB, "");
                        JbCheckI($"{tag}.wd{wi8}.exA", wj.GetProperty("exA").GetInt32(), (int)pair8.Value.ExA, "");
                        JbCheckI($"{tag}.wd{wi8}.exB", wj.GetProperty("exB").GetInt32(), (int)pair8.Value.ExB, "");
                        JbCheckI($"{tag}.wd{wi8}.occA", wj.GetProperty("occA").GetInt32(), pair8.Value.OccA, "");
                        JbCheckI($"{tag}.wd{wi8}.occB", wj.GetProperty("occB").GetInt32(), pair8.Value.OccB, "");
                    }
                    wi8++;
                }
            }
            if (rec.TryGetProperty("armySeq", out var aseqJ8))
                JbCheckI($"{tag}.armySeq", aseqJ8.GetInt32(), wst.ArmySeq, "");
            if (rec.TryGetProperty("nameSeq", out var nseqJ8))
            {
                JbCheckI($"{tag}.nameSeqN", nseqJ8.GetArrayLength(), wst.ArmyNameSeq.Count, "");
                int ni8 = 0;
                foreach (var nj in nseqJ8.EnumerateArray())
                {
                    var pair8 = wst.ArmyNameSeq.Pairs().ElementAtOrDefault(ni8);
                    JbCheckI($"{tag}.nameSeq{ni8}.civ", nj[0].GetInt32(), pair8.Key, "");
                    JbCheckI($"{tag}.nameSeq{ni8}.v", nj[1].GetInt32(), pair8.Value, "");
                    ni8++;
                }
            }
            if (rec.TryGetProperty("timers", out var timersJ8))
            {
                var t8 = timersJ8.EnumerateArray().ToArray();
                JbCheckI($"{tag}.tClash", t8[0].GetInt32(), wst.LastClashEventTick, "");
                JbCheckI($"{tag}.tReinf", t8[1].GetInt32(), wst.LastReinforceEventTick, "");
                JbCheckI($"{tag}.tVolley", t8[2].GetInt32(), wst.LastVolleyEventTick, "");
            }
            if (rec.TryGetProperty("blds", out var bldsJ7))
            {
                JbCheckI($"{tag}.bldsN", bldsJ7.GetArrayLength(), wst.Buildings.Count, "");
                int bi7 = 0;
                foreach (var b in bldsJ7.EnumerateArray())
                {
                    if (bi7 < wst.Buildings.Count)
                    {
                        var bb = wst.Buildings[bi7];
                        JbCheckI($"{tag}.bld{bi7}.i", b.GetProperty("i").GetInt32(), bb.I, "");
                        JbCheckI($"{tag}.bld{bi7}.kind", b.GetProperty("kind").GetInt32(), bb.Kind, "");
                        JbCheckI($"{tag}.bld{bi7}.civ", b.GetProperty("civ").GetInt32(), bb.Civ, "");
                    }
                    bi7++;
                }
            }
            if (rec.TryGetProperty("bidx", out var bidxJ7))
            {
                JbCheckI($"{tag}.bidxN", bidxJ7.GetArrayLength(), wst.BIdx.Count, "");
                int bix7 = 0;
                foreach (var b in bidxJ7.EnumerateArray())
                {
                    var pair = wst.BIdx.Pairs().ElementAtOrDefault(bix7);
                    JbCheckI($"{tag}.bidx{bix7}", b.GetInt32(), pair.Key, "");
                    bix7++;
                }
            }
            if (rec.TryGetProperty("dirtyN", out var dirtyJ7)) JbCheckI($"{tag}.dirtyN", dirtyJ7.GetInt32(), wst.Dirty.Count, "");
            if (rec.TryGetProperty("propsN", out var propsJ7)) JbCheckI($"{tag}.propsN", propsJ7.GetInt32(), wst.PropsDirty.Count, "");
            if (rec.TryGetProperty("roadN", out var roadJ7))
            {
                int roadN7 = 0;
                for (int i = 0; i < wst.Road.Length; i++) if (wst.Road[i] != 0) roadN7++;
                JbCheckI($"{tag}.roadN", roadJ7.GetInt32(), roadN7, "");
            }
            // —— fx 真实现对账（smoke/hammer/spawn 2 抽指纹；旧档 step op 用 PendingFx 面——跳过）——
            if (rec.TryGetProperty("fx", out var fxJ7) && o != "step")
            {
                JbCheckI($"{tag}.fxN", fxJ7.GetArrayLength(), wst.Effects.Count - wstFx0, "");
                int fxi7 = 0;
                foreach (var f in fxJ7.EnumerateArray())
                {
                    if (wstFx0 + fxi7 < wst.Effects.Count)
                    {
                        var pf = wst.Effects[wstFx0 + fxi7];
                        JbCheckS($"{tag}.fx{fxi7}.kind", f.GetProperty("kind").GetString()!, pf.Kind, "");
                        JbCheckN($"{tag}.fx{fxi7}.x", f.GetProperty("x").GetString()!, pf.X);
                        JbCheckN($"{tag}.fx{fxi7}.y", f.GetProperty("y").GetString()!, pf.Y);
                        JbCheckN($"{tag}.fx{fxi7}.r", f.GetProperty("r").GetString()!, pf.R);
                        JbCheckI($"{tag}.fx{fxi7}.ttl", f.GetProperty("ttl").GetInt32(), (long)pf.Ttl, "");
                        JbCheckI($"{tag}.fx{fxi7}.seed", (long)f.GetProperty("seed").GetDouble(), pf.Seed, "");
                        JbCheckN($"{tag}.fx{fxi7}.dir", f.GetProperty("dir").GetString()!, pf.Dir);
                    }
                    fxi7++;
                }
            }
        }
        // —— 终态对账 ——
        var finJ = c.GetProperty("final");
        JbCheckI($"{name}.finalN", finJ.GetArrayLength(), ust4.LiveLen, "");
        for (int i = 0; i < Math.Min(finJ.GetArrayLength(), ust4.LiveLen); i++)
        {
            var sp = new CbSnap(); JbSnapTake(ust4, i, sp);
            JbSnapCompare($"{name}.final{i}", finJ[i], sp);
        }
        JbCheckDirs($"{name}.dirsEnd", c.GetProperty("dirs"), whost);
        JbCheckCivs($"{name}.civsEnd", c.GetProperty("civsEnd"), whost, deepTiles: name.StartsWith("rebel-"));
        // —— M-U3 切片 9：civSeq 终态（createCiv 消费——rebel 文档条件对账）——
        if (c.TryGetProperty("civSeqEnd", out var cseJ9)) JbCheckI($"{name}.civSeqEnd", cseJ9.GetInt32(), whost.CivSeq, "");
        // —— M-U3 切片 5：科技域终态（jobs 旧档无键——条件对账） ——
        if (c.TryGetProperty("evoSeq", out var evoJ)) JbCheckI($"{name}.evoSeq", evoJ.GetInt32(), uhost.EvoSeq, "");
        if (c.TryGetProperty("emTechSeq", out var emsJ)) JbCheckI($"{name}.emTechSeq", emsJ.GetInt32(), whost.EmTechSeq, "");
        if (c.TryGetProperty("emTechs", out var emtJ))
        {
            JbCheckI($"{name}.emTechsN", emtJ.GetArrayLength(), whost.EmTechs.Count, "");
            int emi = 0;
            foreach (var et in emtJ.EnumerateArray())
            {
                var key = et.GetProperty("key").GetString()!;
                if (!whost.EmTechs.TryGetValue(key, out var t)) { JbCheckS($"{name}.em{emi}.miss", key, null, ""); emi++; continue; }
                JbCheckS($"{name}.em{emi}.name", et.GetProperty("name").GetString()!, t.Name, "");
                JbCheckS($"{name}.em{emi}.cat", et.GetProperty("cat").GetString()!, t.Cat, "");
                // cost/golden 原始数值（JSON number——非位串）；C# JsRound 半值上调同构
                total++;
                double jCost = et.GetProperty("cost").GetDouble();
                if (BitConverter.DoubleToUInt64Bits(jCost) != BitConverter.DoubleToUInt64Bits(t.Cost))
                { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{name}.em{emi}.cost] JS={jCost:R} C#={t.Cost:R}"); }
                JbCheckI($"{name}.em{emi}.gen", et.GetProperty("gen").GetInt32(), t.Gen, "");
                JbCheckS($"{name}.em{emi}.desc", et.GetProperty("desc").GetString()!, t.Desc, "");
                var efJ = et.GetProperty("effects");
                JbCheckI($"{name}.em{emi}.effN", efJ.GetArrayLength(), t.Effects.Count, "");
                int efi = 0;
                foreach (var ef in efJ.EnumerateArray())
                {
                    if (efi < t.Effects.Count)
                    {
                        JbCheckS($"{name}.em{emi}.eff{efi}.k", ef[0].GetString()!, t.Effects[efi].K, "");
                        JbCheckN($"{name}.em{emi}.eff{efi}.v", ef[1].GetString()!, t.Effects[efi].V);
                    }
                    efi++;
                }
                emi++;
            }
        }
        if (c.TryGetProperty("bhpsEnd", out var bheJ))
        {
            JbCheckI($"{name}.bhpsEndN", bheJ.GetArrayLength(), wst.BHp.Count, "");
            int bei = 0;
            foreach (var b in bheJ.EnumerateArray())
            {
                var pair = wst.BHp.Pairs().ElementAtOrDefault(bei);
                JbCheckI($"{name}.bhpsEnd{bei}.i", b[0].GetInt32(), pair.Key, "");
                JbCheckN($"{name}.bhpsEnd{bei}.v", b[1].GetString()!, pair.Value);
                bei++;
            }
        }
        // —— M-U3 切片 6：社会域终态（jobs/tech 旧档无键——条件对账）——
        if (c.TryGetProperty("ideaSeq", out var isqJ)) JbCheckI($"{name}.ideaSeq", isqJ.GetInt32(), whost.IdeaSeq, "");
        if (c.TryGetProperty("govCache", out var gcJ))
        {
            JbCheckI($"{name}.govCacheN", gcJ.GetArrayLength(), whost.GovCache.Count, "");
            int gi = 0;
            foreach (var g in gcJ.EnumerateArray())
            {
                JbCheckI($"{name}.govCache{gi}.civ", g[0].GetInt32(), gi < whost.GovCache.Count ? whost.GovCache.Keys.ElementAt(gi) : -999, "");
                JbCheckI($"{name}.govCache{gi}.gov", g[1].GetInt32(), gi < whost.GovCache.Count ? whost.GovCache.Values.ElementAt(gi) : -999, "");
                gi++;
            }
        }
        if (c.TryGetProperty("lastGovEventTick", out var lgJ))
        {
            JbCheckI($"{name}.lastGovN", lgJ.GetArrayLength(), whost.LastGovEventTick.Count, "");
            int li = 0;
            foreach (var g in lgJ.EnumerateArray())
            {
                JbCheckI($"{name}.lastGov{li}.civ", g[0].GetInt32(), li < whost.LastGovEventTick.Count ? whost.LastGovEventTick.Keys.ElementAt(li) : -999, "");
                JbCheckI($"{name}.lastGov{li}.tick", g[1].GetInt32(), li < whost.LastGovEventTick.Count ? whost.LastGovEventTick.Values.ElementAt(li) : -999, "");
                li++;
            }
        }
        if (c.TryGetProperty("emIdeas", out var eiJ))
        {
            JbCheckI($"{name}.emIdeasN", eiJ.GetArrayLength(), whost.EmIdeas.Count, "");
            int eii = 0;
            foreach (var ie in eiJ.EnumerateArray())
            {
                var key = ie.GetProperty("key").GetString()!;
                if (!whost.EmIdeas.TryGet(key, out var t)) { JbCheckS($"{name}.emIdea{eii}.miss", key, null, ""); eii++; continue; }
                JbCheckS($"{name}.emIdea{eii}.name", ie.GetProperty("name").GetString()!, t.Name, "");
                JbCheckS($"{name}.emIdea{eii}.desc", ie.GetProperty("desc").GetString()!, t.Desc, "");
                var mm = ie.GetProperty("mods");
                void M(string k, double actual)
                {
                    var mv = mm.GetProperty(k);
                    if (mv.ValueKind != JsonValueKind.Null) JbCheckN($"{name}.emIdea{eii}.{k}", mv.GetString()!, actual);
                    else { total++; if (actual != 0.0) { fail++; if (fails.Count < MAXREPORT) fails.Add($"[{name}.emIdea{eii}.{k}] JS=undefined C#={actual:R}"); } }
                }
                M("gold", t.Mods.Gold); M("stab", t.Mods.Stab); M("mil", t.Mods.Mil);
                M("know", t.Mods.Know); M("repro", t.Mods.Repro); M("wear", t.Mods.Wear);
                eii++;
            }
        }
        // —— M-U3 切片 7：civsTick 终态（jobs/tech/society 旧档无键——条件对账）——
        if (c.TryGetProperty("homoEnd", out var heJ))
        {
            JbCheckI($"{name}.homoEndN", heJ.GetArrayLength(), whost.CivHomogeneity.Count, "");
            int hei = 0;
            foreach (var h in heJ.EnumerateArray())
            {
                var pair = whost.CivHomogeneity.Pairs().ElementAtOrDefault(hei);
                JbCheckI($"{name}.homoEnd{hei}.civ", h[0].GetInt32(), pair.Key, "");
                JbCheckN($"{name}.homoEnd{hei}.v", h[1].GetString()!, pair.Value);
                hei++;
            }
        }
        if (c.TryGetProperty("bldsEnd", out var beJ))
        {
            JbCheckI($"{name}.bldsEndN", beJ.GetArrayLength(), wst.Buildings.Count, "");
            int bei7 = 0;
            foreach (var b in beJ.EnumerateArray())
            {
                if (bei7 < wst.Buildings.Count)
                {
                    var bb = wst.Buildings[bei7];
                    JbCheckI($"{name}.bldsEnd{bei7}.i", b.GetProperty("i").GetInt32(), bb.I, "");
                    JbCheckI($"{name}.bldsEnd{bei7}.kind", b.GetProperty("kind").GetInt32(), bb.Kind, "");
                    JbCheckI($"{name}.bldsEnd{bei7}.civ", b.GetProperty("civ").GetInt32(), bb.Civ, "");
                }
                bei7++;
            }
        }
        if (c.TryGetProperty("bidxEnd", out var bxeJ))
        {
            JbCheckI($"{name}.bidxEndN", bxeJ.GetArrayLength(), wst.BIdx.Count, "");
            int bxi = 0;
            foreach (var b in bxeJ.EnumerateArray())
            {
                var pair = wst.BIdx.Pairs().ElementAtOrDefault(bxi);
                JbCheckI($"{name}.bidxEnd{bxi}", b.GetInt32(), pair.Key, "");
                bxi++;
            }
        }
        if (c.TryGetProperty("roadNEnd", out var reJ))
        {
            int roadN7 = 0;
            for (int i = 0; i < wst.Road.Length; i++) if (wst.Road[i] != 0) roadN7++;
            JbCheckI($"{name}.roadNEnd", reJ.GetInt32(), roadN7, "");
        }
        if (c.TryGetProperty("dirtyNEnd", out var deJ)) JbCheckI($"{name}.dirtyNEnd", deJ.GetInt32(), wst.Dirty.Count, "");
        if (c.TryGetProperty("propsNEnd", out var peJ)) JbCheckI($"{name}.propsNEnd", peJ.GetInt32(), wst.PropsDirty.Count, "");
        if (c.TryGetProperty("fallenEnd", out var feJ)) JbCheckI($"{name}.fallenEnd", feJ.GetInt32(), whost.StatCivsFallen, "");
        // —— M-U3 切片 8：军团域终态（armiesEnd/occEnd/wdsEnd/armySeqEnd/nameSeqEnd/corpsesEnd）——
        if (c.TryGetProperty("armiesEnd", out var aeJ))
        {
            JbCheckI($"{name}.armiesEndN", aeJ.GetArrayLength(), wst.Armies.Count, "");
            int aei = 0;
            foreach (var aj in aeJ.EnumerateArray())
            {
                if (aei < wst.Armies.Count)
                {
                    var a8 = wst.Armies[aei];
                    JbCheckI($"{name}.armyE{aei}.id", aj.GetProperty("id").GetInt32(), a8.Id, "");
                    JbCheckI($"{name}.armyE{aei}.civ", aj.GetProperty("civ").GetInt32(), a8.Civ, "");
                    JbCheckS($"{name}.armyE{aei}.name", aj.GetProperty("name").GetString()!, a8.Name);
                    JbCheckS($"{name}.armyE{aei}.state", aj.GetProperty("state").GetString()!, a8.State);
                    JbCheckI($"{name}.armyE{aei}.membersN", aj.GetProperty("members").GetArrayLength(), a8.Members.Count, "");
                    JbCheckI($"{name}.armyE{aei}.leaderId", aj.GetProperty("leaderId").GetInt32(), a8.LeaderId, "");
                    JbCheckN($"{name}.armyE{aei}.x", aj.GetProperty("x").GetString()!, a8.X);
                    JbCheckN($"{name}.armyE{aei}.y", aj.GetProperty("y").GetString()!, a8.Y);
                    JbCheckN($"{name}.armyE{aei}.morale", aj.GetProperty("morale").GetString()!, a8.Morale);
                    JbCheckI($"{name}.armyE{aei}.kills", aj.GetProperty("kills").GetInt32(), a8.Kills, "");
                    JbCheckI($"{name}.armyE{aei}.losses", aj.GetProperty("losses").GetInt32(), a8.Losses, "");
                    JbCheckB($"{name}.armyE{aei}.naval", aj.GetProperty("naval").GetBoolean(), a8.Naval);
                    JbCheckI($"{name}.armyE{aei}.targetCiv", aj.GetProperty("targetCiv").GetInt32(), a8.TargetCiv, "");
                }
                aei++;
            }
        }
        if (c.TryGetProperty("occEnd", out var oeJ))
        {
            int occN8 = 0, occS8 = 0;
            foreach (var i8 in wst.OccSet.Order) { occN8++; occS8 += wst.OccStr[i8]; }
            JbCheckI($"{name}.occEndN", oeJ.GetProperty("n").GetInt32(), occN8, "");
            JbCheckI($"{name}.occEndS", oeJ.GetProperty("s").GetInt32(), occS8, "");
        }
        if (c.TryGetProperty("wdsEnd", out var weJ))
        {
            JbCheckI($"{name}.wdsEndN", weJ.GetArrayLength(), wst.WarData.Count, "");
            int wei = 0;
            foreach (var wj in weJ.EnumerateArray())
            {
                var pair8 = wst.WarData.Pairs().ElementAtOrDefault(wei);
                if (pair8.Value != null)
                {
                    JbCheckI($"{name}.wdE{wei}.battles", wj.GetProperty("battles").GetInt32(), pair8.Value.Battles, "");
                    JbCheckN($"{name}.wdE{wei}.scoreA", wj.GetProperty("scoreA").GetString()!, pair8.Value.ScoreA);
                    JbCheckN($"{name}.wdE{wei}.scoreB", wj.GetProperty("scoreB").GetString()!, pair8.Value.ScoreB);
                    JbCheckI($"{name}.wdE{wei}.casA", wj.GetProperty("casA").GetInt32(), pair8.Value.CasA, "");
                    JbCheckI($"{name}.wdE{wei}.casB", wj.GetProperty("casB").GetInt32(), pair8.Value.CasB, "");
                    JbCheckI($"{name}.wdE{wei}.exA", wj.GetProperty("exA").GetInt32(), (int)pair8.Value.ExA, "");
                    JbCheckI($"{name}.wdE{wei}.exB", wj.GetProperty("exB").GetInt32(), (int)pair8.Value.ExB, "");
                    JbCheckI($"{name}.wdE{wei}.occA", wj.GetProperty("occA").GetInt32(), pair8.Value.OccA, "");
                    JbCheckI($"{name}.wdE{wei}.occB", wj.GetProperty("occB").GetInt32(), pair8.Value.OccB, "");
                }
                wei++;
            }
        }
        if (c.TryGetProperty("armySeqEnd", out var aseJ)) JbCheckI($"{name}.armySeqEnd", aseJ.GetInt32(), wst.ArmySeq, "");
        if (c.TryGetProperty("nameSeqEnd", out var nseJ))
        {
            JbCheckI($"{name}.nameSeqEndN", nseJ.GetArrayLength(), wst.ArmyNameSeq.Count, "");
            int nsei = 0;
            foreach (var nj in nseJ.EnumerateArray())
            {
                var pair8 = wst.ArmyNameSeq.Pairs().ElementAtOrDefault(nsei);
                JbCheckI($"{name}.nameSeqEnd{nsei}.civ", nj[0].GetInt32(), pair8.Key, "");
                JbCheckI($"{name}.nameSeqEnd{nsei}.v", nj[1].GetInt32(), pair8.Value, "");
                nsei++;
            }
        }
        if (c.TryGetProperty("corpsesEnd", out var ceJ))
            JbCheckI($"{name}.corpsesEnd", ceJ.GetInt32(), uhost.PendingCorpse.Count, "");
        // alliances
        {
            var alJ = c.GetProperty("alliances");
            JbCheckI($"{name}.alN", alJ.GetArrayLength(), whost.Alliances.Count, "");
            int ai = 0;
            foreach (var a in alJ.EnumerateArray())
            {
                if (ai < whost.Alliances.Count)
                {
                    var al = whost.Alliances[ai];
                    JbCheckI($"{name}.al{ai}.id", a.GetProperty("id").GetInt32(), al.Id, "");
                    JbCheckS($"{name}.al{ai}.name", a.GetProperty("name").GetString()!, al.Name, "");
                    JbCheckI($"{name}.al{ai}.leader", a.GetProperty("leader").GetInt32(), al.Leader, "");
                    JbCheckN($"{name}.al{ai}.cohesion", a.GetProperty("cohesion").GetString()!, al.Cohesion);
                    JbCheckS($"{name}.al{ai}.colorHex", a.GetProperty("colorHex").GetString()!, al.ColorHex, "");
                    JbCheckI($"{name}.al{ai}.formedTick", a.GetProperty("formedTick").GetInt32(), al.FormedTick, "");
                    JbCheckI($"{name}.al{ai}.membersN", a.GetProperty("members").GetArrayLength(), al.Members.Count, "");
                }
                ai++;
            }
        }
        // rel
        {
            var relJ = c.GetProperty("rel");
            JbCheckI($"{name}.relN", relJ.GetArrayLength(), wst.Rel.Count, "");
            int ri = 0;
            foreach (var r in relJ.EnumerateArray())
            {
                var kv = r.EnumerateArray().ToArray();
                if (ri < wst.Rel.Order.Count)
                {
                    JbCheckS($"{name}.rel{ri}.k", kv[0].GetString()!, wst.Rel.Order[ri], "");
                    JbCheckN($"{name}.rel{ri}.v", kv[1].GetString()!, wst.Rel.Get(wst.Rel.Order[ri]));
                }
                ri++;
            }
        }
        JbCheckEvents($"{name}.events", c.GetProperty("events"), whost, 0);
        // raceRel / met（formAlliance 跨种族 +9 / 首触集——插入序对账）
        {
            var rrJ = c.GetProperty("raceRel");
            JbCheckI($"{name}.rrN", rrJ.GetArrayLength(), wst.RaceRel.Count, "");
            int ri2 = 0;
            foreach (var r in rrJ.EnumerateArray())
            {
                var kv = r.EnumerateArray().ToArray();
                if (ri2 < wst.RaceRel.Order.Count)
                {
                    JbCheckS($"{name}.rr{ri2}.k", kv[0].GetString()!, wst.RaceRel.Order[ri2], "");
                    JbCheckN($"{name}.rr{ri2}.v", kv[1].GetString()!, wst.RaceRel.Get(wst.RaceRel.Order[ri2]));
                }
                ri2++;
            }
            var metJ = c.GetProperty("met");
            JbCheckI($"{name}.metN", metJ.GetArrayLength(), wst.Met.Count, "");
            int mi = 0;
            foreach (var m in metJ.EnumerateArray())
            {
                if (mi < wst.Met.Order.Count) JbCheckS($"{name}.met{mi}", m.GetString()!, wst.Met.Order[mi], "");
                mi++;
            }
        }
        // wild / families / seq
        {
            var wildJ = c.GetProperty("wild");
            JbCheckI($"{name}.wildN", wildJ.GetArrayLength(), uhost.WildCount.Count, "");
            foreach (var w in wildJ.EnumerateArray())
                JbCheckI($"{name}.wild{w[0].GetInt32()}", w[1].GetInt32(), uhost.WildCount.TryGetValue((uint)w[0].GetInt32(), out var gv) ? gv : -1, "");
            var famJ3 = c.GetProperty("families");
            JbCheckI($"{name}.famN", famJ3.GetArrayLength(), uhost.Families.Count, "");
            JbCheckI($"{name}.unitSeq", c.GetProperty("unitSeq").GetInt32(), uhost.UnitSeq, "");
            JbCheckI($"{name}.traitSeq", c.GetProperty("traitSeq").GetInt32(), uhost.TraitSeq, "");
            JbCheckI($"{name}.dirSeq", c.GetProperty("dirSeq").GetInt32(), whost.DirSeq, "");
            JbCheckI($"{name}.victoryCiv", c.GetProperty("victoryCiv").ValueKind == JsonValueKind.Null ? -1 : c.GetProperty("victoryCiv").GetInt32(), whost.VictoryCiv, "");
        }
        // —— rngTail（单流纪律：units/wars 消费互斥——双流同种子，取实际消费流） ——
        {
            bool unitsDrew = ust4.RngDraws > 0, warsDrew = wst.RngDraws > 0;
            if (unitsDrew && warsDrew) throw new Exception($"[{name}] 双 rng 流同时消费——违反单流纪律（parity 设计错误）");
            var tailJ = c.GetProperty("rngTail").EnumerateArray().ToArray();
            if (unitsDrew)
                for (int i = 0; i < 4 && i < tailJ.Length; i++) JbCheckN($"{name}.rngTail[{i}]", tailJ[i].GetString()!, WbRng.Next(ref ust4.RngA));
            else
                for (int i = 0; i < 4 && i < tailJ.Length; i++) JbCheckN($"{name}.rngTail[{i}]", tailJ[i].GetString()!, WbRng.Next(ref wst.RngA));
        }
        }
        catch (Exception ex)
        {
            throw new Exception($"[jb.{name}] {ex.Message}", ex);
        }
    }
}

Console.WriteLine($"=== Unity 迁移对账（bit-exact）===");
Console.WriteLine($"总数 {total}  通过 {total - fail}  漂移 {fail}");
foreach (var f in fails) Console.WriteLine("  " + f);
if (fail > 0 && total > fail) Console.WriteLine($"  …（仅列前 {MAXREPORT} 处）");
Environment.Exit(fail == 0 ? 0 : 1);

// —— M-U2c 即时刻快照容器（局部类型不可声明于语句块内——置于文件尾命名空间级） ——
sealed class CbSnap
{
    public uint Race; public double Age, Hp, Hurt, Cd, Atk, FleeT, Bless, Curse, Fert, Detour, Panic, Food, ThrT, Dmg, X, Y, Tx, Ty;
    public int Stk, Fam, Army, Caravan, Kills; public bool Infected, Dead, King;
    public string? Trait, Wep, Arm; public List<int>? GIds; public List<double>? GVal;
    public int RpId; public string RpName = "";
    // —— M-U2d 切片 2 繁衍域扩展 ——
    public double MaxAge, MaxHp, Speed, Lx, Ly, GeneS, GeneD, GeneH, GeneR, Breath, Tdmg, Thp;
    public int Fgn, UParity, BeachT; public string? Name; public bool Flip;
    // —— M-U3 切片 4 职业链扩展 ——
    public int Civ, Job;
}
