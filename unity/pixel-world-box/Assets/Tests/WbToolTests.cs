// ============================================================
// WbToolTests.cs — M-U14 applyTool 大分发器切片一黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/tool.json（12 场景）
//   由 scripts/unity-migration/gen-tool.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔terrain/owner/regrow/flood/fire/buildings/soil/radiate/units +
//   brush 直写——L688 r 回退消费面〕+ rngA 尾置清零起流 + calls 序直调
//   〔applyTool 大分发器——守卫/骨架/raise/九笔刷/fire/flood/七函数委派〕每调用
//   步进快照；det 双跑字节级一致；md5 ec3ad980）。蓝本 engine.ts L13230-13420。
// 镜像: tool-transcript.mjs 零引擎导入 12/12 ALL PASS（bun 口径——Math.hypot 原生
//   fdlibm；红证：TOOL_RED=forest-skip 禁 L13321-13322 双门 → S3 FAIL；
//   TOOL_RED=ignite-gate 禁 L1081 flammable 门 → S5 FAIL（fireSet 29≠20）→ 复绿——
//   向量有效触达实证；本文件编译红证 = ApplyTool 未译时 CS1061 三轮）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 12/12 → 本文件 NUnit C# 全链重放
//   （ApplyTool 切片一全译件 + SetTerrain 全级联 + IgniteE + FloodArea M-U11 +
//   七函数 M-U13 + WbCivSim.DestroyBuilding smoke 级联 + FxOptHook + Toast/AddEvent
//   事件流）逐位对账。
// 对账面: 每调用步进 rngA/terrain/fire/variant/radiate md5 + fireSet 插入序 +
//   flood/regrow/wet/radSet entries 序 + fxCount/eventsCount/buildingsCount/shake/
//   unitsCount + 终态 terrain/radiate gz 逐字节 + variantMd5 + fx 全列
//   （kind/x/y/ttl/seed/dir/r）+ events 全列 + units dump 全字段位级 + toasts 全列。
// 直测面: 守卫零掷零写 + radius-vs-brush 笔刷回退（r=brush=4 vs radius=1 圆域差分）+
//   fire 逐格点燃掷流（20 点燃 + flammable 门 + fire 值域 [150,240)）+ 委派默认参
//   （boom rP??2.4 恰等不含 + flood rP??5 81 格 + plague max(3,r) 下钳）。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbToolTests
    {
        private static string FindTool()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "tool.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "tool.json"),
                "tool.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: tool.json");
        }

        private static byte[] GunzipB64(string b64)
        {
            byte[] raw = Convert.FromBase64String(b64);
            using var ms = new System.IO.MemoryStream(raw);
            using var gz = new System.IO.Compression.GZipStream(ms, System.IO.Compression.CompressionMode.Decompress);
            using var outMs = new System.IO.MemoryStream();
            gz.CopyTo(outMs);
            return outMs.ToArray();
        }

        private static string F64Hex(double v) => WbRender.F64Hex(v);   // 小写 16 字符 LE —— JS f64hex 同构

        private static string Md5Hex(byte[] data)
        {
            using var md5 = System.Security.Cryptography.MD5.Create();
            var h = md5.ComputeHash(data);
            var sb = new System.Text.StringBuilder(h.Length * 2);
            foreach (byte b in h) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        /// <summary>瘦单位直写（gen-tool mkUnit 协议同构 + trait 字符串语义域 traitName）</summary>
        private static void MkUnit(WbWorld w, JObject uo)
        {
            int id = uo.Value<int>("id");
            double hp = uo.Value<double?>("hp") ?? 10.0;
            var u = new WbU
            {
                id = id,
                race = uo.Value<int>("race"),
                civ = -1,
                x = uo.Value<double>("x"), y = uo.Value<double>("y"),
                tx = uo.Value<double>("x"), ty = uo.Value<double>("y"),
                hp = hp, maxHp = uo.Value<double?>("maxHp") ?? hp, dmg = 1, speed = 1,
                ageF = 0, maxAgeF = 9999.0, kills = 0,
                jobC = 0,
                name = "u" + id,
                hurtN = uo.Value<double?>("hurt") ?? 0.0,
                breathN = 0,
                parity = 0,
                dead = uo.Value<int?>("dead") ?? 0,
                infected = uo.Value<bool?>("infected") ?? false ? 1 : 0,
                flip = 0,
                traitName = uo["trait"] != null && uo["trait"].Type == JTokenType.String ? uo.Value<string>("trait") : null,
                geneC = null, famC = null, fgnC = null,
            };
            w.units.Add(u);
            w.unitById[u.id] = u;
        }

        /// <summary>直测最小世界（terrain 默认全 DEEP——gen 夹具 fill:'deep' 同构；owner 构造器已 fill(-1)）</summary>
        private static WbWorld FreshWorld(uint seed)
        {
            var w = new WbWorld();
            Array.Clear(w.fire, 0, w.fire.Length);
            w.fireSet.Clear(); w.fireSetList.Clear();
            w.frozen.Clear(); w.frozenList.Clear(); w.flood.Clear(); w.wet.Clear(); w.regrow.Clear();
            w.units.Clear(); w.unitById.Clear();
            w.unitSeq = 1; w.eventSeq = 1;
            w.effects.Clear(); w.worldEvents.Clear();
            Array.Clear(w.building, 0, w.building.Length);
            w.buildings.Clear(); w.bIdx.Clear();
            Array.Clear(w.radiate, 0, w.radiate.Length);
            w.radSet.Clear();
            w.shake = 0;
            w.brush = 3;                                   // L688 默认
            w.rngA = seed;
            return w;
        }

        /// <summary>C# 全链重放：gen-tool 手术一（瞬态层清零）+ 手术二（直写相 + variant Hash2 重建）+ 手术三（rngA 起流）→ 调用方执行 applyTool</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            // —— 手术一：瞬态层清零（gen-tool buildScenario 同构；owner 构造器已 fill(-1)）——
            Array.Clear(w.fire, 0, w.fire.Length);
            w.fireSet.Clear(); w.fireSetList.Clear();
            w.frozen.Clear(); w.frozenList.Clear(); w.flood.Clear(); w.wet.Clear(); w.regrow.Clear();
            w.units.Clear(); w.unitById.Clear();
            w.unitSeq = 1; w.familySeq = 1; w.eventSeq = 1;
            w.wildCount.Clear(); w.families.Clear();
            w.effects.Clear(); w.worldEvents.Clear();
            Array.Clear(w.building, 0, w.building.Length);
            w.buildings.Clear(); w.bIdx.Clear();
            Array.Clear(w.road, 0, w.road.Length);
            Array.Clear(w.riverDir, 0, w.riverDir.Length);
            w.riverTiles.Clear();
            Array.Clear(w.waterTier, 0, w.waterTier.Length);
            Array.Clear(w.radiate, 0, w.radiate.Length);
            w.radSet.Clear();
            w.shake = 0;
            w.brush = fx.Value<int>("brush0");                // L688 直写面（r 回退消费面）
            w.yearF = fx.Value<double>("yearF0");
            w.tickCount = sc.Value<int>("tickCount");
            // —— 手术二：直写相（terrain/soil/regrow/flood/fire/buildings/radiate/units）——
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            w.soilF = GunzipB64(fx.Value<string>("soil0"));
            foreach (var t in (JArray)fx["regrow0"]) w.regrow[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var t in (JArray)fx["flood0"]) w.flood[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var t in (JArray)fx["fireSet0"]) { w.fireSet.Add(t.Value<int>()); w.fireSetList.Add(t.Value<int>()); }
            byte[] fb = GunzipB64(fx.Value<string>("fire0"));
            System.Buffer.BlockCopy(fb, 0, w.fire, 0, fb.Length);
            foreach (var b in (JArray)fx["building0"])
            {
                var bo = (JObject)b;
                w.building[bo.Value<int>("i")] = (byte)bo.Value<int>("kind");
                w.buildings.Add(new WbBuilding { i = bo.Value<int>("i"), x = bo.Value<int>("x"), y = bo.Value<int>("y"), kind = bo.Value<int>("kind"), civ = -1 });
                w.bIdx[bo.Value<int>("i")] = w.buildings.Count - 1;
            }
            byte[] rb = GunzipB64(fx.Value<string>("radiate0"));
            System.Buffer.BlockCopy(rb, 0, w.radiate, 0, rb.Length);
            foreach (var t in (JArray)fx["radSet0"]) w.radSet[t[0].Value<int>()] = t[1].Value<int>();
            foreach (var uo in (JArray)fx["units0"]) MkUnit(w, (JObject)uo);
            // variant 确定域重建（worldgen L65 hash2(x,y,baseSeed+999)——fixture 无 variant0 面协议）
            int baseSeed = sc.Value<int>("baseSeed");
            for (int yy = 0; yy < WbWorld.H; yy++)
                for (int xx = 0; xx < WbWorld.W; xx++)
                    w.variant[yy * WbWorld.W + xx] = (byte)System.Math.Floor(WbNoise.Hash2(xx, yy, baseSeed + 999) * 255.0);
            // —— 手术三：rngA 尾置清零起流 ——
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        /// <summary>parms 解包（蓝本 params?: Record&lt;string,number&gt;——JSON 数字域 double）</summary>
        private static Dictionary<string, double> ParseParms(JToken p)
        {
            if (p == null || p.Type != JTokenType.Object) return null;
            var d = new Dictionary<string, double>();
            foreach (var kv in (JObject)p) d[kv.Key] = kv.Value.Value<double>();
            return d;
        }

        /// <summary>步进快照对账（gen-tool 每调用步进协议同构——applyTool 大分发器路由）</summary>
        private static void StepAndAssert(WbWorld w, JObject g, string key, int s)
        {
            string fn = g.Value<string>("fn");
            var args = (JArray)g["args"];
            Assert.That(fn, Is.EqualTo("applyTool"), $"fn {key} S{s}");
            string toolId = args[0].Value<string>();
            double wx = args[1].Value<double>(), wy = args[2].Value<double>();
            var parms = args.Count >= 4 ? ParseParms(args[3]) : null;
            WbBailRelay.ApplyTool(w, toolId, wx, wy, parms);
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{s}");
            Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{s}");
            Assert.That(Md5Hex(w.fire), Is.EqualTo(g.Value<string>("fireMd5")), $"fireMd5 {key} S{s}");
            Assert.That(w.fireSetList, Is.EqualTo(g["fireSet"].ToObject<List<int>>()), $"fireSet 序 {key} S{s}");
            Assert.That(w.fireSet.SetEquals(w.fireSetList), $"fireSet 集合=镜像 {key} S{s}");
            var goldFlood = new List<string>();
            foreach (var t in (JArray)g["flood"]) goldFlood.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotFlood = new List<string>();
            foreach (var kv in w.flood) gotFlood.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotFlood, Is.EqualTo(goldFlood), $"flood 序 {key} S{s}");
            var goldRegrow = new List<string>();
            foreach (var t in (JArray)g["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotRegrow = new List<string>();
            foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 序 {key} S{s}");
            var goldWet = new List<string>();
            foreach (var t in (JArray)g["wet"]) goldWet.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotWet = new List<string>();
            foreach (var kv in w.wet) gotWet.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotWet, Is.EqualTo(goldWet), $"wet 序 {key} S{s}");
            Assert.That(new List<int>(w.frozenList.Count > 0 || w.frozen.Count > 0 ? w.frozenList : new List<int>(w.frozen)), Is.EqualTo(g["frozen"].ToObject<List<int>>()), $"frozen 序 {key} S{s}");
            Assert.That(Md5Hex(w.variant), Is.EqualTo(g.Value<string>("variantMd5")), $"variantMd5 {key} S{s}");
            Assert.That(Md5Hex(w.radiate), Is.EqualTo(g.Value<string>("radiateMd5")), $"radiateMd5 {key} S{s}");
            var goldRad = new List<string>();
            foreach (var t in (JArray)g["radSet"]) goldRad.Add($"{t[0].Value<int>()}:{t[1].Value<int>()}");
            var gotRad = new List<string>();
            foreach (var kv in w.radSet) gotRad.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotRad, Is.EqualTo(goldRad), $"radSet 序 {key} S{s}");
            Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{s}");
            Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{s}");
            Assert.That(w.buildings.Count, Is.EqualTo(g.Value<int>("buildingsCount")), $"buildingsCount {key} S{s}");
            Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{s}");
            Assert.That(w.units.Count, Is.EqualTo(g.Value<int>("unitsCount")), $"unitsCount {key} S{s}");
        }

        /// <summary>终态 units dump 全字段位级对账（gen-tool dumpUnit 协议同构）</summary>
        private static void AssertUnitsDump(WbWorld w, JArray goldUnits, string key)
        {
            Assert.That(w.units.Count, Is.EqualTo(goldUnits.Count), $"units count {key}");
            for (int k = 0; k < goldUnits.Count; k++)
            {
                var e = (JObject)goldUnits[k];
                var u = w.units[k];
                Assert.That(u.id, Is.EqualTo(e.Value<int>("id")), $"u.id {key}#{k}");
                Assert.That(u.race, Is.EqualTo(e.Value<int>("race")), $"u.race {key}#{k}");
                Assert.That(u.civ, Is.EqualTo(e.Value<int>("civ")), $"u.civ {key}#{k}");
                Assert.That(F64Hex(u.x), Is.EqualTo(e.Value<string>("x")), $"u.x {key}#{k}");
                Assert.That(F64Hex(u.y), Is.EqualTo(e.Value<string>("y")), $"u.y {key}#{k}");
                Assert.That(F64Hex(u.hp), Is.EqualTo(e.Value<string>("hp")), $"u.hp {key}#{k}");
                Assert.That(F64Hex(u.maxHp), Is.EqualTo(e.Value<string>("maxHp")), $"u.maxHp {key}#{k}");
                Assert.That(F64Hex(u.hurtN ?? 0.0), Is.EqualTo(e.Value<string>("hurtN")), $"u.hurtN {key}#{k}");
                Assert.That(u.dead != 0 ? 1 : 0, Is.EqualTo(e.Value<int>("dead")), $"u.dead {key}#{k}");
                Assert.That(u.infected, Is.EqualTo(e.Value<int>("infected")), $"u.infected {key}#{k}");
                Assert.That(u.name, Is.EqualTo(e.Value<string>("name")), $"u.name {key}#{k}");
            }
        }

        [Test]
        public void Test46_Tool_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindTool()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(12));
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                var snaps = (JArray)sc["stepsSnap"];
                for (int k = 0; k < snaps.Count; k++) StepAndAssert(w, (JObject)snaps[k], key, k);
                // 终态：terrain/radiate gz 逐字节 + variantMd5 + regrow 序 + shake
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("radiate")), w.radiate, $"radiate 终态 {key}");
                Assert.That(Md5Hex(w.variant), Is.EqualTo(sc.Value<string>("variantMd5")), $"variantMd5 终态 {key}");
                var goldRegrow = new List<string>();
                foreach (var t in (JArray)sc["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
                var gotRegrow = new List<string>();
                foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
                Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 终态序 {key}");
                Assert.That(w.shake, Is.EqualTo(sc.Value<double>("shake")), $"shake 终态 {key}");
                // 终态 fx 全列（kind/x/y/ttl/seed/dir/r 位级）
                var goldFx = (JArray)sc["fx"];
                Assert.That(w.effects.Count, Is.EqualTo(goldFx.Count), $"fx count {key}");
                for (int k = 0; k < goldFx.Count; k++)
                {
                    var e = (JObject)goldFx[k];
                    var f = w.effects[k];
                    Assert.That(f.kind, Is.EqualTo(e.Value<string>("kind")), $"fx kind {key}#{k}");
                    Assert.That(f.seed, Is.EqualTo(e.Value<int>("seed")), $"fx seed {key}#{k}");
                    Assert.That(F64Hex(f.x), Is.EqualTo(e.Value<string>("x")), $"fx x {key}#{k}");
                    Assert.That(F64Hex(f.y), Is.EqualTo(e.Value<string>("y")), $"fx y {key}#{k}");
                    Assert.That(F64Hex(f.ttl), Is.EqualTo(e.Value<string>("ttl")), $"fx ttl {key}#{k}");
                    Assert.That(F64Hex(f.dir), Is.EqualTo(e.Value<string>("dir")), $"fx dir {key}#{k}");
                    double? gr = e["r"].Type == JTokenType.Float || e["r"].Type == JTokenType.Integer ? (double?)e.Value<double>("r") : (double?)null;
                    Assert.That((double?)f.r, Is.EqualTo(gr ?? 1.0), $"fx r {key}#{k}");
                }
                // 终态 events 全列 + units dump + toasts 全列
                var goldEv = (JArray)sc["events"];
                Assert.That(w.worldEvents.Count, Is.EqualTo(goldEv.Count), $"events count {key}");
                for (int k = 0; k < goldEv.Count; k++)
                {
                    var e = (JObject)goldEv[k];
                    var ev = w.worldEvents[k];
                    Assert.That(ev.kind, Is.EqualTo(e.Value<string>("kind")), $"ev kind {key}#{k}");
                    Assert.That(ev.text, Is.EqualTo(e.Value<string>("text")), $"ev text {key}#{k}");
                    if (e["x"].Type == JTokenType.Null) Assert.That(ev.x, Is.Null, $"ev x null {key}#{k}");
                    else Assert.That(ev.x, Is.EqualTo(e.Value<double>("x")), $"ev x {key}#{k}");
                    if (e["y"].Type == JTokenType.Null) Assert.That(ev.y, Is.Null, $"ev y null {key}#{k}");
                    else Assert.That(ev.y, Is.EqualTo(e.Value<double>("y")), $"ev y {key}#{k}");
                }
                AssertUnitsDump(w, (JArray)sc["units"], key);
                var goldToasts = (JArray)sc["toasts"];
                Assert.That(w.toasts.Count, Is.EqualTo(goldToasts.Count), $"toasts count {key}");
                for (int k = 0; k < goldToasts.Count; k++)
                {
                    var e = (JObject)goldToasts[k];
                    Assert.That(w.toasts[k].text, Is.EqualTo(e.Value<string>("text")), $"toast text {key}#{k}");
                    Assert.That(w.toasts[k].tone, Is.EqualTo(e.Value<string>("tone")), $"toast tone {key}#{k}");
                    Assert.That(w.toasts[k].id, Is.EqualTo(e.Value<int>("id")), $"toast id {key}#{k}");
                }
            }
        }

        /// <summary>直测一：守卫零掷零写 + radius-vs-brush 笔刷回退（r=brush=4 vs radius=1 圆域差分）</summary>
        [Test]
        public void Test46_Tool_GuardBrushFallback()
        {
            // —— 守卫：未知工具 early return 零掷零写（S1 黄金签名 C# 侧）——
            var w = FreshWorld(0x0B600001);
            uint rng0 = w.rngA;
            WbBailRelay.ApplyTool(w, "no-such-tool", 100, 60);
            WbBailRelay.ApplyTool(w, "cre:", 100, 60);   // cre: 前缀过守卫（ParseCreationTool ""——切片一 switch 无 case → no-op 零掷）
            Assert.That(w.rngA, Is.EqualTo(rng0), "守卫零掷（rngA 不动）");
            Assert.That(w.effects.Count, Is.EqualTo(0), "守卫零 fx");
            Assert.That(w.toasts.Count, Is.EqualTo(0), "守卫零 toast");
            // —— radius-vs-brush：water 工具 r=brush=4 → d=3.5 格入水；radius=1 → d=3.5 格不入 ——
            w = FreshWorld(0x0B600101);
            w.terrain[60 * WbWorld.W + 100] = WbWorld.T_GRASS;   // (100,60) GRASS
            w.terrain[60 * WbWorld.W + 103] = WbWorld.T_GRASS;   // (103,60) d=3.5 探针
            w.brush = 4;                                          // L688 直写面
            WbBailRelay.ApplyTool(w, "water", 100, 60);           // r = IsFinite(NaN)?NaN:brush = 4
            Assert.That(w.terrain[60 * WbWorld.W + 103], Is.EqualTo(WbWorld.T_WATER), "brush 回退 r=4（d=3.5 入域）");
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_WATER), "中心入水");
            w = FreshWorld(0x0B600102);
            w.terrain[60 * WbWorld.W + 100] = WbWorld.T_GRASS;
            w.terrain[60 * WbWorld.W + 103] = WbWorld.T_GRASS;
            w.brush = 4;
            WbBailRelay.ApplyTool(w, "water", 100, 60, new Dictionary<string, double> { { "radius", 1.0 } });   // rP=1 覆写
            Assert.That(w.terrain[60 * WbWorld.W + 103], Is.EqualTo(WbWorld.T_GRASS), "radius 参数覆写（d=3.5 出域）");
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_WATER), "radius=1 中心入水");
            // —— rP null → 委派默认参面（flood rP??5——81 格与 S7 黄金签名同源）——
            w = FreshWorld(0x0B600103);
            for (int yy = 55; yy <= 65; yy++) for (int xx = 95; xx <= 105; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            WbBailRelay.ApplyTool(w, "flood", 100, 60);           // rP=null → 5（L13363 ?? 面）
            Assert.That(w.flood.Count, Is.EqualTo(81), "flood rP??5 默认域 81 格");
        }

        /// <summary>直测二：fire 逐格点燃掷流（20 点燃 20 掷 + flammable 门 + fire 值域 [150,240) + 恰等内含）</summary>
        [Test]
        public void Test46_Tool_FireIgniteRng()
        {
            var w = FreshWorld(0x0B600005);
            for (int yy = 56; yy <= 64; yy++) for (int xx = 96; xx <= 104; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            for (int yy = 59; yy <= 61; yy++) for (int xx = 99; xx <= 101; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_WATER;
            w.building[60 * WbWorld.W + 103] = 3;   // (103,60) 建筑——GRASS 可燃且 building>0 不过 L1081 门（蓝本建筑可燃语义）
            w.buildings.Add(new WbBuilding { i = 60 * WbWorld.W + 103, x = 103, y = 60, kind = 3, civ = -1 });
            w.bIdx[60 * WbWorld.W + 103] = 0;
            w.brush = 3;
            WbBailRelay.ApplyTool(w, "fire", 100, 60);
            Assert.That(w.fireSet.Count, Is.EqualTo(20), "20 点燃（r=3 圆 29 格 − 9 水格）");
            Assert.That(w.fire[60 * WbWorld.W + 99], Is.EqualTo(0), "水格零点燃（flammable 门）");
            Assert.That(w.fire[60 * WbWorld.W + 103] >= 150 && w.fire[60 * WbWorld.W + 103] < 240, "建筑格点燃 fire 值域 [150,240)（1 掷 150+floor(rng*90)）");
            Assert.That(w.fire[64 * WbWorld.W + 100], Is.EqualTo(0), "d=4 环外零点燃");
            uint expectRngA = 0x92c58729;             // S5 黄金 stepsSnap[0].rngA（20 掷链终态位证）
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo(expectRngA.ToString("x8")), "20 掷 rng 链终态位级（gen-tool 黄金同源）");
        }

        /// <summary>直测三：委派默认参（boom rP??2.4 恰等不含 + plague max(3,r) 下钳 + smooth r=brush 零掷）</summary>
        [Test]
        public void Test46_Tool_DelegateDefaults()
        {
            // —— boom rP null → 2.4（JS 默认参面）：u2 d=2.9 恰等不含不动 + u1 d=1.5 亡 ——
            var w = FreshWorld(0x0B60000B);
            w.units.Add(new WbU { id = 1, race = WbConstants.R_SHEEP, civ = -1, x = 100, y = 60, tx = 100, ty = 60, hp = 50, maxHp = 50, dmg = 1, speed = 1, ageF = 0, maxAgeF = 9999, jobC = 0, name = "u1", dead = 0, infected = 0, flip = 0 });
            w.units.Add(new WbU { id = 2, race = WbConstants.R_SHEEP, civ = -1, x = 102.9, y = 60, tx = 102.9, ty = 60, hp = 50, maxHp = 50, dmg = 1, speed = 1, ageF = 0, maxAgeF = 9999, jobC = 0, name = "u2", dead = 0, infected = 0, flip = 0 });
            w.unitById[1] = w.units[0]; w.unitById[2] = w.units[1];
            WbBailRelay.ApplyTool(w, "boom", 100, 60);
            Assert.That(w.units[0].dead, Is.EqualTo(1), "d=0 fatal（falloff 160）");
            Assert.That(F64Hex(w.units[1].hp), Is.EqualTo(F64Hex(50.0)), "u2 d=2.9 恰等不含（严格 < L12296）hp 不动");
            Assert.That(w.shake, Is.EqualTo(4.0), "shake=min(9,round(2+2.4))=4");
            // —— plague max(3,r) 下钳：brush=1 → r=3——d=2.5 非免疫感染（r=1 时出域）——
            w = FreshWorld(0x0B600008);
            w.brush = 1;
            w.units.Add(new WbU { id = 3, race = WbConstants.R_SHEEP, civ = -1, x = 102.5, y = 60, tx = 102.5, ty = 60, hp = 10, maxHp = 10, dmg = 1, speed = 1, ageF = 0, maxAgeF = 9999, jobC = 0, name = "u3", dead = 0, infected = 0, flip = 0 });
            w.unitById[3] = w.units[0];
            WbBailRelay.ApplyTool(w, "plague", 100, 60);
            Assert.That(w.units[0].infected, Is.EqualTo(1), "max(3,brush=1)=3 下钳（d=2.5 入域感染）");
            // —— smooth 零掷确定域：SAND 孤点 GRASS 海抹平（S6 黄金签名 C# 侧 + radius 覆写零掷）——
            w = FreshWorld(0x0B600006);
            for (int yy = 55; yy <= 65; yy++) for (int xx = 95; xx <= 105; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            w.terrain[60 * WbWorld.W + 100] = WbWorld.T_SAND;
            w.terrain[61 * WbWorld.W + 100] = WbWorld.T_SAND;
            w.terrain[60 * WbWorld.W + 101] = WbWorld.T_SAND;
            uint rng1 = w.rngA;
            WbBailRelay.ApplyTool(w, "smooth", 100, 60);          // r=brush=3
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_GRASS), "SAND 孤点众数抹平");
            Assert.That(w.rngA, Is.EqualTo(rng1), "smooth 零掷（rngA 不动）");
            WbBailRelay.ApplyTool(w, "smooth", 100, 60, new Dictionary<string, double> { { "radius", 5.0 } });   // rP=5 覆写——全域 GRASS 零变更
            Assert.That(w.rngA, Is.EqualTo(rng1), "radius 覆写零掷面");
        }
    }
}
