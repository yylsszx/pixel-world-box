// ============================================================
// WbBrushTests.cs — M-U13 地形整形与邻域神力域黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/brush.json（12 场景）
//   由 scripts/unity-migration/gen-brush.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔terrain/owner/regrow/flood/fire/buildings/soil/radiate/units +
//   brush 直写；variant0 不入 fixture——Hash2 确定域 C# 重建——R3 体积红线 72.2KB〕+
//   rngA 尾置清零起流 + calls 序直调〔boom/createOasis/smoothTerrain/roughenTerrain/
//   plagueArea/healArea/killArea〕每调用步进快照；det 双跑字节级一致；
//   md5 8c139237）。蓝本 engine.ts 七函数 L12292-12626。
// 镜像: brush-transcript.mjs 零引擎导入 12/12 ALL PASS（bun 口径——Math.hypot 原生
//   fdlibm；红证：禁 boom 命中门 3 场景 units dump FAIL → 还原复绿——向量有效触达实证）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 12/12 → 本文件 NUnit C# 全链重放
//   （七函数全译件 + SetTerrain 全级联 + WbCivSim.DestroyBuilding smoke 级联 +
//   MeltIce + FxOptHook + Toast/AddEvent 事件流）逐位对账。
// 对账面: 每调用步进 rngA/terrain/fire/variant/radiate md5 + fireSet 插入序 +
//   flood/regrow/wet/radSet entries 序 + fxCount/eventsCount/buildingsCount/shake/
//   unitsCount + 终态 terrain/radiate gz 逐字节 + variantMd5 + fx 全列
//   （kind/x/y/ttl/seed/dir/r）+ events 全列 + units dump 全字段位级 + toasts 全列。
// 直测面: boom falloff 恰等不含/rr 钳位/shake 封顶 + oasis pondR 钳位三层/山幸存/
//   barren 双文本 + smooth tie-break 先现/<5 票门 + rough 内部重掷掷数位证。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbBrushTests
    {
        private static string FindBrush()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "brush.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "brush.json"),
                "brush.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: brush.json");
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

        /// <summary>瘦单位直写（gen-brush mkUnit 协议同构 + trait 字符串语义域 traitName）</summary>
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
                geneC = (uo["gene"] == null || uo["gene"].Type == JTokenType.Null)
                    ? null
                    : new WbGene
                    {
                        s = uo["gene"].Value<double?>("s") ?? 1.0,
                        d = uo["gene"].Value<double?>("d") ?? 1.0,
                        h = uo["gene"].Value<double?>("h") ?? 1.0,
                        r = uo["gene"].Value<double?>("r") ?? 1.0,
                    },
                famC = null, fgnC = null,
            };
            w.units.Add(u);
            w.unitById[u.id] = u;
        }

        /// <summary>C# 全链重放：gen-brush 手术一（瞬态层清零）+ 手术二（直写相 + variant Hash2 重建）+ 手术三（rngA 起流）→ 调用方执行七函数</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            // —— 手术一：瞬态层清零（gen-brush buildScenario 同构；owner 构造器已 fill(-1)）——
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
            w.brush = fx.Value<int>("brush0");                // L688 直写面（createOasis pondR 消费）
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

        /// <summary>步进快照对账（gen-brush 每调用步进协议同构——七函数分发）</summary>
        private static void StepAndAssert(WbWorld w, JObject g, string key, int s)
        {
            string fn = g.Value<string>("fn");
            var args = (JArray)g["args"];
            if (fn == "boom") { if (args.Count >= 3) WbBailRelay.Boom(w, args[0].Value<double>(), args[1].Value<double>(), args[2].Value<double>()); else WbBailRelay.Boom(w, args[0].Value<double>(), args[1].Value<double>()); }
            else if (fn == "createOasis") WbBailRelay.CreateOasis(w, args[0].Value<double>(), args[1].Value<double>());
            else if (fn == "smoothTerrain") WbBailRelay.SmoothTerrain(w, args[0].Value<double>(), args[1].Value<double>(), args[2].Value<double>());
            else if (fn == "roughenTerrain") WbBailRelay.RoughenTerrain(w, args[0].Value<double>(), args[1].Value<double>(), args[2].Value<double>());
            else if (fn == "plagueArea") WbBailRelay.PlagueArea(w, args[0].Value<double>(), args[1].Value<double>(), args[2].Value<double>());
            else if (fn == "healArea") WbBailRelay.HealArea(w, args[0].Value<double>(), args[1].Value<double>(), args[2].Value<double>());
            else if (fn == "killArea") WbBailRelay.KillArea(w, args[0].Value<double>(), args[1].Value<double>(), args[2].Value<double>());
            else throw new AssertionException($"未知调用 {fn}");
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

        /// <summary>终态 units dump 全字段位级对账（gen-brush dumpUnit 协议同构）</summary>
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
        public void Test45_Brush_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindBrush()));
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
                var goldToast = (JArray)sc["toasts"];
                Assert.That(w.toasts.Count, Is.EqualTo(goldToast.Count), $"toasts count {key}");
                for (int k = 0; k < goldToast.Count; k++)
                {
                    var t = (JObject)goldToast[k];
                    var tt = w.toasts[k];
                    Assert.That(tt.id, Is.EqualTo(t.Value<int>("id")), $"toast id {key}#{k}");
                    Assert.That(tt.text, Is.EqualTo(t.Value<string>("text")), $"toast text {key}#{k}");
                    Assert.That(tt.tone, Is.EqualTo(t.Value<string>("tone")), $"toast tone {key}#{k}");
                }
            }
        }

        /// <summary>Boom falloff 边界直测：恰等不含（d=2.9）/ rr 钳位双支（0.3→1 / 50→8）/ shake 封顶 9 / hp 位级</summary>
        [Test]
        public void Test45_Boom_FalloffClamp()
        {
            // 恰等不含面：rr=2.4 → 界 2.9；u2 d=2.9 恰等零伤（严格 < L12296）
            var w = new WbWorld();
            w.terrain[60 * WbWorld.W + 100] = WbConstants.T_GRASS;
            w.units.Add(new WbU { id = 1, race = WbConstants.R_SHEEP, civ = -1, x = 102.9, y = 60, hp = 50, maxHp = 50, name = "u1" });
            w.rngA = 0x0B500001u;
            WbBailRelay.Boom(w, 100, 60);
            Assert.That(w.units[0].hp, Is.EqualTo(50.0), "恰等不含零伤（d=2.9 < 2.9 假）");
            Assert.That(w.units[0].hurtN ?? 0.0, Is.EqualTo(0.0), "hurt 零写");
            Assert.That(w.shake, Is.EqualTo(4.0), "shake=min(9,round(4.4))=4");
            Assert.That(w.effects.Count, Is.EqualTo(1), "fx 单条");
            Assert.That(w.effects[0].kind, Is.EqualTo("explosion"), "fx kind");
            Assert.That(w.effects[0].r, Is.EqualTo(2.4).Within(1e-12), "fx r=rr");
            // 上钳支：rr=8 → shake=min(9,round(10))=9 封顶；d=10 界外零伤
            var w2 = new WbWorld();
            w2.terrain[60 * WbWorld.W + 100] = WbConstants.T_GRASS;
            w2.units.Add(new WbU { id = 2, race = WbConstants.R_SHEEP, civ = -1, x = 110, y = 60, hp = 50, maxHp = 50, name = "u2" });
            w2.rngA = 0x0B500002u;
            WbBailRelay.Boom(w2, 100, 60, 50);
            Assert.That(w2.shake, Is.EqualTo(9.0), "shake 封顶 9（orbital L10387 同构）");
            Assert.That(w2.units[0].hp, Is.EqualTo(50.0), "d=10 ≥ 8.5 环外零伤");
            // falloff 位级：d=1.5 hp=50-160*(1-1.5/2.9)=-27.241379310344826（黄金 S1 位级）
            var w3 = new WbWorld();
            w3.terrain[60 * WbWorld.W + 100] = WbConstants.T_GRASS;
            w3.units.Add(new WbU { id = 3, race = WbConstants.R_SHEEP, civ = -1, x = 101.5, y = 60, hp = 50, maxHp = 50, name = "u3" });
            w3.rngA = 0x0B500003u;
            WbBailRelay.Boom(w3, 100, 60);
            Assert.That(F64Hex(w3.units[0].hp), Is.EqualTo(F64Hex(50.0 - 160.0 * (1.0 - 1.5 / 2.9))), "falloff 位级");
            Assert.That(w3.units[0].dead, Is.EqualTo(1), "hp≤0 处决（bool→int 镜像）");
            Assert.That(w3.units[0].hurtN, Is.EqualTo(30.0), "hurt=30");
        }

        /// <summary>CreateOasis pondR 钳位三层直测（brush=1→2 下钳 / brush=9→6 上钳）+ 山幸存 + barren 双文本</summary>
        [Test]
        public void Test45_Oasis_RingTiers()
        {
            // 下钳支：brush=1 → pondR=2（山格幸存 + 泉眼 WATER）
            var w = new WbWorld();
            w.terrain[60 * WbWorld.W + 100] = WbConstants.T_SAND;
            w.terrain[60 * WbWorld.W + 101] = WbConstants.T_MOUNTAIN;   // 浅滩山格（d=1≤pondR*0.55? d=1>1.1 泉眼界——brush=1→pondR=2→0.55R=1.1 → (101,60) d=1 泉眼山幸存）
            w.brush = 1;
            w.rngA = 0x0B500004u;
            WbBailRelay.CreateOasis(w, 100, 60);
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbConstants.T_WATER), "中心泉眼 WATER");
            Assert.That(w.terrain[60 * WbWorld.W + 101], Is.EqualTo(WbConstants.T_MOUNTAIN), "泉眼山格幸存（L12463 门）");
            Assert.That(w.toasts[0].text, Is.EqualTo("荒漠中涌出一泓清泉，绿意环绕"), "barren 文本位级");
            // 上钳支：brush=9 → pondR=6（ringR=8）；GRASS 中心 → 非荒地文本
            var w2 = new WbWorld();
            w2.terrain[60 * WbWorld.W + 100] = WbConstants.T_GRASS;
            w2.brush = 9;
            w2.rngA = 0x0B500005u;
            WbBailRelay.CreateOasis(w2, 100, 60);
            Assert.That(w2.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbConstants.T_WATER), "GRASS 中心泉眼覆写（非山门通过）");
            Assert.That(w2.toasts[0].text, Is.EqualTo("清泉在草木间闪烁"), "非荒地文本位级");
            Assert.That(w2.worldEvents[0].text, Is.EqualTo("一处泉眼被点化，波光潋滟"), "非荒地纪事位级");
            Assert.That(w2.worldEvents[0].x, Is.EqualTo(100.5), "纪事坐标 cx+0.5");
        }

        /// <summary>Smooth 众数 tie-break 先现直测 + <5 票门 + Rough 内部重掷掷数位证（对照世界 rngA）</summary>
        [Test]
        public void Test45_SmoothRough_Modes()
        {
            // tie-break 先现面：2×2 SAND + 5 GRASS 混合 3×3（SAND 先现但 GRASS 5 票 > SAND 4 票 → GRASS 众数）
            var w = new WbWorld();
            int ci = 60 * WbWorld.W + 100;
            w.terrain[ci] = WbConstants.T_SAND;
            w.terrain[ci - 1] = WbConstants.T_SAND; w.terrain[ci + 1] = WbConstants.T_SAND; w.terrain[ci - WbWorld.W] = WbConstants.T_SAND; w.terrain[ci + WbWorld.W] = WbConstants.T_SAND;
            // 3×3 = 5 SAND（含自身）+ 4 GRASS（角）→ 众数 SAND 5 票 ≥5 且 ≠自身? 自身=SAND → bestT==terrain[i] 跳
            w.rngA = 0x0B500006u;
            WbBailRelay.SmoothTerrain(w, 100, 60, 1);
            Assert.That(w.terrain[ci], Is.EqualTo(WbConstants.T_SAND), "自身即众数零写（bestT===terrain[i] 跳）");
            // 众数抹平面：DEEP 海洋中孤 SAND → 3×3 = 8 DEEP 票 ≥5 抹平（黄金 S6 同构——默认 terrain 全 DEEP）
            var w2 = new WbWorld();
            int ci2 = 60 * WbWorld.W + 100;
            w2.terrain[ci2] = WbConstants.T_SAND;
            w2.rngA = 0x0B500007u;
            WbBailRelay.SmoothTerrain(w2, 100, 60, 2);
            Assert.That(w2.terrain[ci2], Is.EqualTo(WbConstants.T_DEEP), "孤格 8 DEEP 票众数 DEEP ≥5 抹平");
            // Rough 内部重掷位证：全 GRASS 世界 r=2 → 内部格 variant 重掷（1 掷/格）——rngA 推进位证
            var w3 = new WbWorld();
            w3.rngA = 0x0B500008u;
            WbBailRelay.RoughenTerrain(w3, 100, 60, 2);
            Assert.That(w3.rngA, Is.Not.EqualTo(0x0B500008u), "内部格 variant 重掷消费掷流（每内部格 1 掷）");
            bool variantChanged = false;
            for (int i = 0; i < w3.variant.Length; i++) if (w3.variant[i] != 0) { variantChanged = true; break; }
            Assert.That(variantChanged, Is.True, "variant 重掷写面非零（内部格 floor(rng*256)）");
            // 边缘零掷对照：kinds 恒 1 的全同格世界 + r=0 钳 1——单格内部 1 掷（对照位证：掷数=1）
            var w4 = new WbWorld();
            w4.rngA = 0x0B500009u;
            WbBailRelay.RoughenTerrain(w4, 100, 60, 0);   // r<1 → 1 钳（L12522）
            Assert.That(w4.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbConstants.T_DEEP), "r=1 单格内部零地形写（默认 DEEP 不动）");
            Assert.That(w4.rngA, Is.Not.EqualTo(0x0B500009u), "单格内部 1 掷（variant 重掷）");
        }
    }
}
