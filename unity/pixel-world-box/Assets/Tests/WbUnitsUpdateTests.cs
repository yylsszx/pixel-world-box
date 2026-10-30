// ============================================================================
// WbUnitsUpdateTests.cs —— Test30：M-U7l 批次一 + M-U7m 批次二·扫描域黄金回放（gen-units-update.mjs 13 场景）
// 蓝本：engine.ts updateUnit L3455-3590 批次一 + 扫描域 L3592-3669 批次二（isEnemyFast/isEnemy + 3×3 桶环 +
//       血仇加权 + 恐慌传染 + 三逃离门）+ 无敌壳（C# WbBailRelay.UpdateUnit）
// 协议：bitHex f64 位精确（禁 epsilon）/ 掷值链 pre→post rngA 态游走重建 / evt·fx·terr·scan 事件流捕获 /
//       muts 注入回放 / final+rngTail 终态对账 / 影子接缝十件置换（gen makeStubEng 同构：批次一八件 + M-U7m MoveUnitHook/IsEnemyFastHook）
// 黄金：Assets/StreamingAssets/WbGolden/units_update.json（scripts/unity-migration/golden/units_update.json 双写）
// ============================================================================
using NUnit.Framework;
using Newtonsoft.Json.Linq;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Wb.Tests
{
    public class WbUnitsUpdateTests
    {
        private const int W = 256, H = 160;

        // —— 影子接缝原状备份（TearDown 恢复——hook 泄漏防护）——
        private System.Action<WbWorld, WbU> _grab0, _boat0, _plague0, _post0;
        private System.Action<WbWorld, double, double> _rise0;
        private System.Func<WbWorld, WbU, bool> _tail0;
        private System.Func<WbWorld, WbU, double> _gear0;
        private System.Action<WbWorld, string, double, double, int> _fx0;
        private System.Action<WbWorld, WbU, double> _mv0;                                // M-U7m 三逃离门 moveUnit 接缝
        private System.Func<WbWorld, WbU, WbU, bool> _isef0;                             // M-U7m isEnemyFast 接缝

        private System.Collections.Generic.List<object[]> _evt;
        private System.Collections.Generic.List<object[]> _fx;
        private System.Collections.Generic.List<object[]> _scan;                         // M-U7m isEnemyFast 调用日志 [aId,bId,0|1]
        private double _gearRegen;

        [SetUp]
        public void SaveHooks()
        {
            _grab0 = WbBailRelay.GrabbedTickHook; _boat0 = WbBailRelay.UpdateBoatHook;
            _rise0 = WbBailRelay.RiseSkeletonHook; _plague0 = WbBailRelay.SpreadPlagueHook;
            _tail0 = WbBailRelay.TailJSHook; _post0 = WbBailRelay.PostJSHook;
            _gear0 = WbBailRelay.GearRegenHook; _fx0 = WbBailRelay.FxHook;
            _mv0 = WbBailRelay.MoveUnitHook; _isef0 = WbBailRelay.IsEnemyFastHook;
            _evt = new System.Collections.Generic.List<object[]>();
            _fx = new System.Collections.Generic.List<object[]>();
            _scan = new System.Collections.Generic.List<object[]>();
        }

        [TearDown]
        public void RestoreHooks()
        {
            WbBailRelay.GrabbedTickHook = _grab0; WbBailRelay.UpdateBoatHook = _boat0;
            WbBailRelay.RiseSkeletonHook = _rise0; WbBailRelay.SpreadPlagueHook = _plague0;
            WbBailRelay.TailJSHook = _tail0; WbBailRelay.PostJSHook = _post0;
            WbBailRelay.GearRegenHook = _gear0; WbBailRelay.FxHook = _fx0;
            WbBailRelay.MoveUnitHook = _mv0; WbBailRelay.IsEnemyFastHook = _isef0;
        }

        private static string FindGolden(string fileName)
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", fileName),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", fileName),
                fileName,
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: " + fileName);
        }

        /// IEEE754 小端 16 hex（位模式对账，禁 epsilon）——端序无关构造
        private static string BitHex(double d)
        {
            long bits = System.BitConverter.DoubleToInt64Bits(d);
            var sb = new System.Text.StringBuilder(16);
            for (int i = 0; i < 8; i++) sb.Append(((byte)(bits >> (i * 8))).ToString("x2"));
            return sb.ToString();
        }

        /// mulberry32 单步（WbWorld.Rng L523-531 / noise.ts mulberry32 L3-13 同式——M-U1 黄金钉面）
        private static uint MulberryStep(uint state, out double val)
        {
            unchecked
            {
                state += 0x6d2b79f5u;
                uint t = state ^ (state >> 15);
                t = t * (1u | state);
                t = (t + ((t ^ (t >> 7)) * (61u | t))) ^ t;
                val = (double)(uint)(t ^ (t >> 14)) / 4294967296.0;
                return state;
            }
        }

        /// 掷值链重建：pre→post 态游走计数（黄金 perU.draws 对账 + 每掷值并入后续状态链）
        private static int WalkCount(uint pre, uint post)
        {
            if (pre == post) return 0;                        // 零掷调用（S3/S4/S7/S8 无 rng 域）
            int n = 0; uint s = pre;
            while (n < 4096)
            {
                double v; s = MulberryStep(s, out v); n++;
                if (s == post) return n;
            }
            throw new AssertionException("rng 链未闭合 pre=" + pre.ToString("x") + " post=" + post.ToString("x"));
        }

        private static double D(JToken t) { return t == null || t.Type == JTokenType.Null ? 0 : (double)t; }
        private static int I(JToken t) { return t == null || t.Type == JTokenType.Null ? 0 : (int)t; }
        private static bool Nul(JToken t) { return t == null || t.Type == JTokenType.Null; }
        private static string NS(JToken t) { return Nul(t) ? null : (string)t; }

        private static void AssertEq(string ctx, string field, object expected, object actual)
        {
            Assert.That(actual, Is.EqualTo(expected), ctx + " · " + field);
        }

        // ---------------- 主回放：13 场景逐位（M-U7l 8 + M-U7m 扫描域 5） ----------------
        [Test]
        public void GoldenUnitsUpdate_Replay13Cases_BitExact()
        {
            var root = JObject.Parse(System.IO.File.ReadAllText(FindGolden("units_update.json")));
            // ep 交叉锁定（C# 内联字面量 0.008/0.006/3.0/0.72 —— engineParams L39/L41/L31/L40）
            AssertEq("ep", "panicDecay", 0.008, (double)root["ep"]["panicDecay"]);
            AssertEq("ep", "grudgeDecay", 0.006, (double)root["ep"]["grudgeDecay"]);
            AssertEq("ep", "fireDamage", 3.0, (double)root["ep"]["fireDamage"]);
            AssertEq("ep", "panicRout", 0.72, (double)root["ep"]["panicRout"]);   // M-U7m 溃逃阈
            var specs = (JArray)root["terrainSpecs"];
            var cases = (JArray)root["cases"];
            Assert.That(cases.Count, Is.EqualTo(13), "场景数");
            foreach (var c in cases) ReplayCase(c, specs);
        }

        private void ReplayCase(JToken c, JArray specs)
        {
            string name = (string)c["name"];
            JToken tspec = null;
            foreach (var ts in specs) if ((string)ts["name"] == (string)c["terrain"]) { tspec = ts; break; }
            Assert.That(tspec, Is.Not.Null, name + " 地形 spec");

            var w = new WbWorld();
            byte def = (byte)(int)tspec["def"];
            for (int i = 0; i < W * H; i++) w.terrain[i] = def;
            foreach (var p in (JArray)tspec["patches"])
                for (int y = (int)p[1]; y < (int)p[3]; y++)
                    for (int x = (int)p[0]; x < (int)p[2]; x++)
                        w.terrain[y * W + x] = (byte)(int)p[4];
            var env = c["env"];
            w.laws.undeadRise = (bool)env["lawsRise"];
            w.fxAmbience = (bool)env["ambience"];
            _gearRegen = Nul(env["gearRegen"]) ? 0 : (double)env["gearRegen"];
            foreach (var kv in (JObject)env["fireInit"] ?? new JObject())
            {
                var xy = kv.Key.Split(','); int idx = int.Parse(xy[1]) * W + int.Parse(xy[0]);
                w.fire[idx] = (byte)(int)kv.Value; w.fireSet.Add(idx);
            }
            foreach (var kv in (JObject)env["radiateInit"] ?? new JObject())
            {
                var xy = kv.Key.Split(','); w.radiate[int.Parse(xy[1]) * W + int.Parse(xy[0])] = (byte)(int)kv.Value;
            }

            var units = new System.Collections.Generic.List<WbU>();
            foreach (var s in (JArray)c["units"]) units.Add(MkU(name, s));
            w.units = units;
            w.rngA = (uint)(int)c["seed"];                                    // mulberry32 state0 = seed

            // —— M-U7m 扫描域：scanReal 布桶 + 双接缝置换（gen makeStubEng scanReal 同构）——
            bool scanReal = !Nul(env["scanReal"]) && (bool)env["scanReal"];
            if (scanReal)
            {
                w.RebuildBuckets();   // gen 布桶同构（units 序 push；L3100-3101 懒清空世代戳首代全清等价）
                WbBailRelay.MoveUnitHook = (ww, uu, mul) => _evt.Add(new object[] { "mv", (double)uu.id, mul });   // 'mv' 事件流
                WbBailRelay.IsEnemyFastHook = (ww, a, b) =>
                {                                                                                                    // 真实现包装 + 'scan' 调用日志
                    bool v = _isef0(ww, a, b);
                    _scan.Add(new object[] { (double)a.id, (double)b.id, v ? 1 : 0 });
                    return v;
                };
            }

            // —— 影子接缝置换（gen makeStubEng 同构）——
            WbBailRelay.GrabbedTickHook = (ww, u) => _evt.Add(new object[] { "grab", (double)u.id });
            WbBailRelay.UpdateBoatHook = (ww, u) => _evt.Add(new object[] { "boat", (double)u.id });
            WbBailRelay.RiseSkeletonHook = (ww, x, y) => _evt.Add(new object[] { "rise", BitHex(x), BitHex(y) });
            WbBailRelay.SpreadPlagueHook = (ww, u) => _evt.Add(new object[] { "plague", (double)u.id });
            WbBailRelay.TailJSHook = (ww, u) => { _evt.Add(new object[] { "tail", (double)u.id }); return false; };
            WbBailRelay.PostJSHook = (ww, u) => _evt.Add(new object[] { "post", (double)u.id });
            WbBailRelay.GearRegenHook = (ww, u) => _gearRegen;
            WbBailRelay.FxHook = (ww, k, x, y, ttl) => _fx.Add(new object[] { k, BitHex(x), BitHex(y), ttl });

            var outSteps = (JArray)c["out"];
            bool track = !Nul(env["terrainTrack"]) && (bool)env["terrainTrack"];
            int stepN = (int)c["steps"];
            _evt.Clear(); _fx.Clear(); _scan.Clear();

            for (int sn = 0; sn < stepN; sn++)
            {
                var gStep = outSteps[sn];
                // muts 注入：gen 不回传 stepsArr——经 outSteps[sn].muts 平面回显（{slot, ...mut}；applyMut L326 skip slot 同构）
                foreach (var m in (JArray)gStep["muts"]) ApplyMut(units[(int)m["slot"]], m);

                byte[] fireBefore = track ? (byte[])w.fire.Clone() : null;
                byte[] terrBefore = track ? (byte[])w.terrain.Clone() : null;
                uint rngStep0 = w.rngA;
                int stepDraws = 0;

                var gPerU = (JArray)gStep["units"];
                int eu = 0;
                for (int i = 0; i < units.Count; i++)
                {
                    var u = units[i];
                    string ctx = name + " S" + sn + " u" + i;
                    if (u.dead != 0)
                    {
                        Assert.That((bool)gPerU[eu]["dead"], Is.True, ctx + " 黄金应为 dead:true 占位");
                        eu++; continue;
                    }
                    int e0 = _evt.Count, f0 = _fx.Count, s0 = _scan.Count;
                    byte[] terrU0 = (byte[])w.terrain.Clone();
                    uint pre = w.rngA;
                    WbBailRelay.UpdateUnit(w, u);
                    int draws = WalkCount(pre, w.rngA);
                    stepDraws += draws;
                    ComparePerU(ctx, gPerU[eu], u, _evt.GetRange(e0, _evt.Count - e0),
                                _fx.GetRange(f0, _fx.Count - f0), DiffArr(terrU0, w.terrain), draws,
                                _scan.GetRange(s0, _scan.Count - s0));
                    eu++;
                }

                AssertEq(name + " S" + sn, "draws", (int)gStep["draws"], stepDraws);
                if (track)
                {
                    CompareDiff(name + " S" + sn + " fireDiff", (JArray)gStep["fireDiff"], fireBefore, w.fire);
                    CompareDiff(name + " S" + sn + " terrDiff", (JArray)gStep["terrDiff"], terrBefore, w.terrain);
                }
                var fs = new System.Collections.Generic.List<int>(w.fireSet); fs.Sort();
                var gfs = (JArray)gStep["fireSet"];
                Assert.That(fs.Count, Is.EqualTo(gfs.Count), name + " S" + sn + " fireSet 计数");
                for (int k = 0; k < fs.Count; k++) AssertEq(name + " S" + sn, "fireSet[" + k + "]", (int)gfs[k], fs[k]);
            }

            // final 终态
            var final = (JArray)c["final"];
            for (int i = 0; i < units.Count; i++) CompareSnap(name + " final u" + i, final[i], units[i]);

            // rngTail：4 掷链续跑（黄金 raw() 直接续——C# w.rngA 终态续）
            uint rs = w.rngA;
            for (int k = 0; k < 4; k++)
            {
                double v; rs = MulberryStep(rs, out v);
                AssertEq(name, "rngTail[" + k + "]", (string)c["rngTail"][k], BitHex(v));
            }
        }

        // ---------------- 单位构造（spec → WbU；null ≡ undefined） ----------------
        private static WbU MkU(string name, JToken s)
        {
            var u = new WbU();
            u.id = I(s["id"]); u.race = I(s["race"]);
            u.x = D(s["x"]); u.y = D(s["y"]);
            u.tx = Nul(s["tx"]) ? u.x : D(s["tx"]);
            u.ty = Nul(s["ty"]) ? u.y : D(s["ty"]);
            u.ageF = D(s["age"]); u.maxAgeF = D(s["maxAge"]);
            u.hp = D(s["hp"]); u.maxHp = D(s["maxHp"]);
            u.hurtN = Nul(s["hurt"]) ? (double?)null : D(s["hurt"]);
            u.cd = I(s["cd"]); u.atk = I(s["atk"]);
            u.chillN = Nul(s["chill"]) ? (int?)null : I(s["chill"]);
            u.fleeT = I(s["fleeT"]); u.bless = I(s["bless"]); u.curse = I(s["curse"]); u.fert = I(s["fert"]);
            u.detour = I(s["detour"]);
            u.panic = Nul(s["panic"]) ? (double?)null : D(s["panic"]);
            if (!Nul(s["gids"]))
            {
                u.gIdsN = new System.Collections.Generic.List<int>();
                foreach (var g in (JArray)s["gids"]) u.gIdsN.Add((int)g);
            }
            if (!Nul(s["gval"]))
            {
                u.gValN = new System.Collections.Generic.List<double>();
                foreach (var g in (JArray)s["gval"]) u.gValN.Add((double)g);
            }
            u.foodN = Nul(s["food"]) ? (double?)null : D(s["food"]);
            u.stk = Nul(s["stk"]) ? (int?)null : I(s["stk"]);
            u.sxk = Nul(s["sxk"]) ? (double?)null : D(s["sxk"]);
            u.syk = Nul(s["syk"]) ? (double?)null : D(s["syk"]);
            u.infected = (bool)s["infected"] ? 1 : 0;
            u.grab = I(s["grab"]); u.boat = I(s["boat"]);
            u.caravan = I(s["caravan"]);                                           // M-U7m L3641 商队门
            u.civ = I(s["civ"]); u.jobC = I(s["job"]); u.flip = (bool)s["flip"] ? 1 : 0;
            u.traitName = NS(s["trait"]);
            // traitRegen 交叉锁定：C# TraitsAll 表 ≡ 黄金 fixture 数值（gen L104 traitRegen 已解析）
            if (u.traitName != null)
            {
                Assert.That(WbBailRelay.TraitsAll.ContainsKey(u.traitName), Is.True, name + " TRAITS 缺键 " + u.traitName);
                var tr = WbBailRelay.TraitsAll[u.traitName].regen;
                AssertEq(name + " traitRegen", u.traitName, D(s["traitRegen"]), tr ?? 0);
            }
            return u;
        }

        // ---------------- mut 注入回放（gen applyMut L326-342 同构） ----------------
        private static void ApplyMut(WbU u, JToken m)
        {
            foreach (var prop in (JObject)m)
            {
                string k = prop.Key; var v = prop.Value;
                switch (k)
                {
                    case "slot": break;                               // gen applyMut L328 skip slot 同构
                    case "x": u.x = D(v); break;
                    case "y": u.y = D(v); break;
                    case "tx": u.tx = D(v); break;
                    case "ty": u.ty = D(v); break;
                    case "hp": u.hp = D(v); break;
                    case "age": u.ageF = D(v); break;
                    case "hurt": u.hurtN = Nul(v) ? (double?)null : D(v); break;
                    case "panic": u.panic = Nul(v) ? (double?)null : D(v); break;
                    case "sxk": u.sxk = Nul(v) ? (double?)null : D(v); break;
                    case "syk": u.syk = Nul(v) ? (double?)null : D(v); break;
                    case "food": u.foodN = Nul(v) ? (double?)null : D(v); break;
                    case "chill": u.chillN = Nul(v) ? (int?)null : I(v); break;
                    case "stk": u.stk = Nul(v) ? (int?)null : I(v); break;
                    case "gids":
                        if (Nul(v)) { u.gIdsN = null; u.gValN = null; }
                        else { u.gIdsN = new System.Collections.Generic.List<int>(); foreach (var g in (JArray)v) u.gIdsN.Add((int)g); }
                        break;
                    case "gval":
                        if (Nul(v)) { u.gValN = null; u.gIdsN = null; }
                        else { u.gValN = new System.Collections.Generic.List<double>(); foreach (var g in (JArray)v) u.gValN.Add((double)g); }
                        break;
                    case "infected": u.infected = (bool)v ? 1 : 0; break;
                    case "dead": u.dead = (bool)v ? 1 : 0; break;
                    case "flip": u.flip = (bool)v ? 1 : 0; break;
                    case "caravan": u.caravan = I(v); break;                      // M-U7m 商队门（mut 注入面预留）
                    default: throw new AssertionException("未知 mut 键: " + k);
                }
            }
        }

        // ---------------- 快照逐位对账（gen snapU L131-147 同构） ----------------
        private static void CompareSnap(string ctx, JToken g, WbU u)
        {
            AssertEq(ctx, "age", (string)g["age"], BitHex(u.ageF));
            AssertEq(ctx, "hp", (string)g["hp"], BitHex(u.hp));
            AssertEq(ctx, "maxAge", (string)g["maxAge"], BitHex(u.maxAgeF));
            AssertEq(ctx, "maxHp", (string)g["maxHp"], BitHex(u.maxHp));
            AssertEq(ctx, "hurt", NS(g["hurt"]), u.hurtN.HasValue ? BitHex(u.hurtN.Value) : null);
            AssertEq(ctx, "cd", (string)g["cd"], BitHex((double)u.cd));
            AssertEq(ctx, "atk", (string)g["atk"], BitHex((double)u.atk));
            AssertEq(ctx, "chill", NS(g["chill"]), u.chillN.HasValue ? BitHex((double)u.chillN.Value) : null);
            AssertEq(ctx, "fleeT", (string)g["fleeT"], BitHex((double)u.fleeT));
            AssertEq(ctx, "bless", (string)g["bless"], BitHex((double)u.bless));
            AssertEq(ctx, "curse", (string)g["curse"], BitHex((double)u.curse));
            AssertEq(ctx, "fert", (string)g["fert"], BitHex((double)u.fert));
            AssertEq(ctx, "detour", (string)g["detour"], BitHex((double)(u.detour ?? 0)));
            AssertEq(ctx, "panic", NS(g["panic"]), u.panic.HasValue ? BitHex(u.panic.Value) : null);
            AssertEq(ctx, "gids", NS(g["gids"]), u.gIdsN == null ? null : string.Join(",", u.gIdsN));
            AssertEq(ctx, "gval", NS(g["gval"]), u.gValN == null ? null : string.Join(",", u.gValN.ConvertAll(BitHex)));
            AssertEq(ctx, "food", NS(g["food"]), u.foodN.HasValue ? BitHex(u.foodN.Value) : null);
            AssertEq(ctx, "stk", I(g["stk"]), (u.stk.HasValue && u.stk.Value != 0) ? u.stk.Value : 0);
            AssertEq(ctx, "sxk", NS(g["sxk"]), u.sxk.HasValue ? BitHex(u.sxk.Value) : null);
            AssertEq(ctx, "syk", NS(g["syk"]), u.syk.HasValue ? BitHex(u.syk.Value) : null);
            AssertEq(ctx, "infected", (bool)g["infected"], u.infected != 0);
            AssertEq(ctx, "dead", (bool)g["dead"], u.dead != 0);
            AssertEq(ctx, "grab", I(g["grab"]), u.grab ?? 0);
            AssertEq(ctx, "boat", I(g["boat"]), u.boat);
            AssertEq(ctx, "caravan", I(g["caravan"]), u.caravan);                     // M-U7m 商队镜像（字段只加）
            AssertEq(ctx, "x", (string)g["x"], BitHex(u.x));
            AssertEq(ctx, "y", (string)g["y"], BitHex(u.y));
            AssertEq(ctx, "tx", (string)g["tx"], BitHex(u.tx));
            AssertEq(ctx, "ty", (string)g["ty"], BitHex(u.ty));
        }

        private void ComparePerU(string ctx, JToken g, WbU u,
            System.Collections.Generic.List<object[]> evt, System.Collections.Generic.List<object[]> fx,
            System.Collections.Generic.List<int[]> terr, int draws,
            System.Collections.Generic.List<object[]> scan)
        {
            CompareSnap(ctx, g, u);
            // evt 事件流（grab/boat/rise/plague/tail/post）
            var gEvt = (JArray)g["evt"];
            Assert.That(evt.Count, Is.EqualTo(gEvt.Count), ctx + " evt 计数");
            for (int i = 0; i < evt.Count; i++)
            {
                var ge = (JArray)gEvt[i]; var ae = evt[i];
                AssertEq(ctx + " evt[" + i + "]", "名", (string)ge[0], (string)ae[0]);
                for (int k = 1; k < ge.Count; k++)
                {
                    if (ge[k].Type == JTokenType.String) AssertEq(ctx + " evt[" + i + "][" + k + "]", "arg", (string)ge[k], (string)ae[k]);
                    else AssertEq(ctx + " evt[" + i + "][" + k + "]", "arg", (double)ge[k], (double)ae[k]);
                }
            }
            // fx（影子：[k, xHex, yHex, ttl]——gen perU fx 四元组同构）
            var gFx = (JArray)g["fx"];
            Assert.That(fx.Count, Is.EqualTo(gFx.Count), ctx + " fx 计数");
            for (int i = 0; i < fx.Count; i++)
            {
                var gf = (JArray)gFx[i];
                AssertEq(ctx + " fx[" + i + "]", "kind", (string)gf[0], (string)fx[i][0]);
                AssertEq(ctx + " fx[" + i + "]", "x", (string)gf[1], (string)fx[i][1]);
                AssertEq(ctx + " fx[" + i + "]", "y", (string)gf[2], (string)fx[i][2]);
                AssertEq(ctx + " fx[" + i + "]", "ttl", (int)gf[3], (int)fx[i][3]);
            }
            // terr 变更流（[[idx, old, new]]——setTerrain 影子同值早退语义）
            var gT = (JArray)g["terr"];
            Assert.That(terr.Count, Is.EqualTo(gT.Count), ctx + " terr 计数");
            for (int i = 0; i < terr.Count; i++)
            {
                var gt = (JArray)gT[i];
                AssertEq(ctx + " terr[" + i + "]", "idx", (int)gt[0], terr[i][0]);
                AssertEq(ctx + " terr[" + i + "]", "old", (int)gt[1], terr[i][1]);
                AssertEq(ctx + " terr[" + i + "]", "new", (int)gt[2], terr[i][2]);
            }
            // scan 调用日志（M-U7m：isEnemyFast [aId,bId,0|1]——gen cap.scan 包装同构）
            var gScan = (JArray)g["scan"];
            Assert.That(scan.Count, Is.EqualTo(gScan.Count), ctx + " scan 计数");
            for (int i = 0; i < scan.Count; i++)
            {
                var gs = (JArray)gScan[i];
                AssertEq(ctx + " scan[" + i + "]", "a", (double)gs[0], (double)scan[i][0]);
                AssertEq(ctx + " scan[" + i + "]", "b", (double)gs[1], (double)scan[i][1]);
                AssertEq(ctx + " scan[" + i + "]", "enemy", (int)gs[2], (int)scan[i][2]);
            }
            AssertEq(ctx, "draws", (int)g["draws"], draws);
        }

        private static System.Collections.Generic.List<int[]> DiffArr(byte[] before, byte[] after)
        {
            var d = new System.Collections.Generic.List<int[]>();
            for (int i = 0; i < before.Length; i++) if (before[i] != after[i]) d.Add(new[] { i, (int)before[i], (int)after[i] });
            return d;
        }

        private static void CompareDiff(string ctx, JArray g, byte[] before, byte[] after)
        {
            var d = DiffArr(before, after);
            Assert.That(d.Count, Is.EqualTo(g.Count), ctx + " 计数");
            for (int i = 0; i < d.Count; i++)
            {
                AssertEq(ctx + "[" + i + "]", "idx", (int)g[i][0], d[i][0]);
                AssertEq(ctx + "[" + i + "]", "old", (int)g[i][1], d[i][1]);
                AssertEq(ctx + "[" + i + "]", "new", (int)g[i][2], d[i][2]);
            }
        }

        // ---------------- 种族旗标交叉核对（gen packRace 位字节 ≡ C# RStats——7 族面） ----------------
        [Test]
        public void GoldenRaceFlags_PackedParity()
        {
            var root = JObject.Parse(System.IO.File.ReadAllText(FindGolden("units_update.json")));
            foreach (var kv in (JObject)root["races"])
            {
                int id = int.Parse(kv.Key);
                var r = kv.Value;
                var st = WbBailRelay.RStats[id];
                int flags = (int)r["flags"];
                AssertEq("race " + id, "hostile", flags & 1, st.hostile ? 1 : 0);
                AssertEq("race " + id, "isCiv", flags & 2, st.isCiv ? 2 : 0);
                AssertEq("race " + id, "undead", flags & 4, st.undead ? 4 : 0);
                AssertEq("race " + id, "predator", flags & 8, st.predator ? 8 : 0);
                AssertEq("race " + id, "lavaImmune", flags & 16, st.lavaImmune ? 16 : 0);
                int tbf0 = (int)r["tbf0"];
                AssertEq("race " + id, "flying", tbf0 & 32, st.flying ? 32 : 0);
                AssertEq("race " + id, "aquatic", tbf0 & 64, st.aquatic ? 64 : 0);
                int tbf1 = (int)r["tbf1"];
                AssertEq("race " + id, "beach", tbf1 & 8, st.beach ? 8 : 0);
                // sandswim 128 / coldBlood tbf1&4 未入 C# RaceStat（战斗/寒血域切片——位跳过注记，M-U2b）
            }
        }
    }
}
