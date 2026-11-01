// ============================================================
// WbTool2Tests.cs — M-U15 切片二「三神力创建函数 + nuke/river 调用面」黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/tool2.json（12 场景）
//   由 scripts/unity-migration/gen-tool2.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔terrain/owner/regrow/flood/fire/buildings/soil/radiate/units/
//   effects + brush/statNukes 直写〕+ rngA 尾置清零起流 + calls 序直调
//   〔applyTool 大分发器切片二——lightning/tornado/earthquake/nuke/river 五 case〕
//   每调用步进快照；det 双跑字节级一致；md5 2e7259fa）。
//   蓝本 engine.ts lightning L10507-10531 / earthquake L10532-10544 /
//   spawnTornado L10725-10737 / applyTool L13333-13356 / carveRiver L12312-12415
//   （runtime 体——w.brush 参化 + toast 双文本 + 事件坐标 sx+0.5）/
//   carveLake L12417-12431 / nuke L12255-12260 / explode L10450-10499。
// 镜像: tool2-transcript.mjs 零引擎导入 12/12 ALL PASS（bun 口径——typed 数组天然
//   OOB 容忍 = JS undefined 读/静默丢弃写语义；红证：TOOL2_RED=ring 禁 L10518 单位环
//   → 4 lightning 场景 units dump FAIL；TOOL2_RED=cap 禁 L10729 全局上限 →
//   tornado-cap FAIL → 复绿 12/12——向量有效触达实证）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 12/12 → 本文件 NUnit C# 全链重放
//   （Lightning/Earthquake/SpawnTornado 全译件 + ApplyTool 五 case + Nuke L2919 +
//   Explode M-U10c + CarveRiver M-U7k 参化件 + SetTerrain 全级联 + FxOptHook +
//   Toast/AddEvent 事件流）逐位对账。
// 对账面: 每调用步进 rngA/terrain/fire/variant/radiate/riverDir md5 + fireSet 插入序 +
//   riverTiles 插入序 + flood/regrow/wet/radSet entries 序 + fxCount/eventsCount/
//   buildingsCount/shake/statNukes/unitsCount + 终态 terrain/radiate gz 逐字节 +
//   fx 全列 + events 全列（含 x/y 坐标）+ units dump 全字段位级 + toasts 全列。
// 直测面: lightning 单位环 d<1.9 + OOB 负索引 + pw 钳 + tornado 全局 6 上限 +
//   quake JsRound shake 双端钳 + nuke statNukes/蘑菇云 + river 参化内流湖/早退。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbTool2Tests
    {
        private static string FindTool2()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "tool2.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "tool2.json"),
                "tool2.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: tool2.json");
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

        /// <summary>瘦单位直写（gen-tool2 mkUnit 协议同构）</summary>
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
            Array.Clear(w.riverDir, 0, w.riverDir.Length);
            w.riverTiles.Clear(); w.riverTilesList.Clear();
            w.shake = 0;
            w.brush = 3;                                   // L688 默认
            w.statNukes = 0;                               // L230 成就计数清零
            w.rngA = seed;
            return w;
        }

        /// <summary>C# 全链重放：gen-tool2 手术一（瞬态层清零）+ 手术二（直写相 + variant Hash2 重建 + effects 直写）+ 手术三（rngA 起流）→ 调用方执行 applyTool</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            // —— 手术一：瞬态层清零（gen-tool2 buildScenario 同构；owner 构造器已 fill(-1)）——
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
            w.riverTiles.Clear(); w.riverTilesList.Clear();
            Array.Clear(w.waterTier, 0, w.waterTier.Length);
            Array.Clear(w.radiate, 0, w.radiate.Length);
            w.radSet.Clear();
            w.shake = 0;
            w.brush = fx.Value<int>("brush0");                // L688 直写面（carveRiver 参化消费面）
            w.statNukes = 0;                                  // L230 直写面（nuke 成就计数）
            w.yearF = fx.Value<double>("yearF0");
            w.tickCount = sc.Value<int>("tickCount");
            // —— 手术二：直写相（terrain/soil/regrow/flood/fire/buildings/radiate/units/effects）——
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
            foreach (var e0 in (JArray)fx["effects0"])   // 直写游荡云族（tornado-cap 计数消费——gen 手术二同构）
            {
                var eo = (JObject)e0;
                string kind = eo.Value<string>("kind");
                w.effects.Add(new WbFx { kind = kind, x = eo.Value<double>("x"), y = eo.Value<double>("y"), ttl = 100, age = 0, seed = 1, dir = 0, r = kind == "quake" ? 8.0 : 1.0 });
            }
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

        /// <summary>步进快照对账（gen-tool2 每调用步进协议同构——applyTool 大分发器路由）</summary>
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
            Assert.That(Md5Hex(w.riverDir), Is.EqualTo(g.Value<string>("riverDirMd5")), $"riverDirMd5 {key} S{s}");
            Assert.That(w.riverTilesList, Is.EqualTo(g["riverTiles"].ToObject<List<int>>()), $"riverTiles 插入序 {key} S{s}");
            Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{s}");
            Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{s}");
            Assert.That(w.buildings.Count, Is.EqualTo(g.Value<int>("buildingsCount")), $"buildingsCount {key} S{s}");
            Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{s}");
            Assert.That(w.statNukes, Is.EqualTo(g.Value<int>("statNukes")), $"statNukes {key} S{s}");
            Assert.That(w.units.Count, Is.EqualTo(g.Value<int>("unitsCount")), $"unitsCount {key} S{s}");
        }

        /// <summary>终态 units dump 全字段位级对账（gen-tool2 dumpUnit 协议同构）</summary>
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
        public void Test47_Tool2_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindTool2()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(12));
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                var snaps = (JArray)sc["stepsSnap"];
                for (int k = 0; k < snaps.Count; k++) StepAndAssert(w, (JObject)snaps[k], key, k);
                // 终态：terrain/radiate gz 逐字节 + variantMd5 + regrow 序 + shake + statNukes + riverTiles/riverDir
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("radiate")), w.radiate, $"radiate 终态 {key}");
                Assert.That(Md5Hex(w.variant), Is.EqualTo(sc.Value<string>("variantMd5")), $"variantMd5 终态 {key}");
                var goldRegrow = new List<string>();
                foreach (var t in (JArray)sc["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
                var gotRegrow = new List<string>();
                foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
                Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 终态序 {key}");
                Assert.That(w.shake, Is.EqualTo(sc.Value<double>("shake")), $"shake 终态 {key}");
                Assert.That(w.statNukes, Is.EqualTo(sc.Value<int>("statNukes")), $"statNukes 终态 {key}");
                Assert.That(Md5Hex(w.riverDir), Is.EqualTo(sc.Value<string>("riverDirMd5")), $"riverDirMd5 终态 {key}");
                Assert.That(w.riverTilesList, Is.EqualTo(sc["riverTiles"].ToObject<List<int>>()), $"riverTiles 终态序 {key}");
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
                // 终态 events 全列（含 x/y 坐标——carveRiver sx+0.5 面）+ units dump + toasts 全列
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

        /// <summary>直测一：lightning 单位环 d<1.9 + pw 钳 + OOB 负索引入集（idx 无钳 JS 语义镜像）+ shake=max 面</summary>
        [Test]
        public void Test47_Tool2_LightningRingEdge()
        {
            // —— 单击默认参：u0 d=0 环内 95×pw=95 伤 + u1 d=2.5 环外不动 + hurtN=30 + shake=max 4 ——
            var w = FreshWorld(0x0B610001);
            for (int yy = 56; yy <= 64; yy++) for (int xx = 96; xx <= 104; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            w.units.Add(new WbU { id = 1, race = WbConstants.R_SHEEP, civ = -1, x = 100, y = 60, tx = 100, ty = 60, hp = 200, maxHp = 200, dmg = 1, speed = 1, ageF = 0, maxAgeF = 9999, jobC = 0, name = "u1", dead = 0, infected = 0, flip = 0 });
            w.units.Add(new WbU { id = 2, race = WbConstants.R_SHEEP, civ = -1, x = 102.5, y = 60, tx = 102.5, ty = 60, hp = 200, maxHp = 200, dmg = 1, speed = 1, ageF = 0, maxAgeF = 9999, jobC = 0, name = "u2", dead = 0, infected = 0, flip = 0 });
            w.unitById[1] = w.units[0]; w.unitById[2] = w.units[1];
            WbBailRelay.ApplyTool(w, "lightning", 100, 60);
            Assert.That(F64Hex(w.units[0].hp), Is.EqualTo(F64Hex(105.0)), "d=0 环内 hp 200-95=105（S1 黄金位级）");
            Assert.That(w.units[0].hurtN ?? 0.0, Is.EqualTo(30.0), "hurt 语义域 hurtN=30（L10518）");
            Assert.That(F64Hex(w.units[1].hp), Is.EqualTo(F64Hex(200.0)), "d=2.5 环外不动（严格 < 1.9）");
            Assert.That(w.shake, Is.EqualTo(4.0), "shake=max(0,4)=4（max 不覆写）");
            Assert.That(w.fire[60 * WbWorld.W + 100] > 0, "中心点燃 fire>0");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("4f13c393"), "10 掷 rng 链终态位级（S1 黄金同源）");
            // —— pw 上钳：power=10 → 95×3=285 ——
            w = FreshWorld(0x0B610101);
            for (int yy = 56; yy <= 64; yy++) for (int xx = 96; xx <= 104; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            w.units.Add(new WbU { id = 3, race = WbConstants.R_SHEEP, civ = -1, x = 100, y = 60, tx = 100, ty = 60, hp = 300, maxHp = 300, dmg = 1, speed = 1, ageF = 0, maxAgeF = 9999, jobC = 0, name = "u3", dead = 0, infected = 0, flip = 0 });
            w.unitById[3] = w.units[0];
            WbBailRelay.ApplyTool(w, "lightning", 100, 60, new Dictionary<string, double> { { "power", 10.0 } });
            Assert.That(F64Hex(w.units[0].hp), Is.EqualTo(F64Hex(15.0)), "pw=min(3,10)=3 上钳（95×3=285，300-285=15）");
            // —— OOB 负索引：靶 (3,0.4) count=12 → 散布 ly<0 → ignite 负 i 入 fireSet（terrain/fire/building
            //    读 undefined → 合取门不过 → 1 掷消费 + fire[i] OOB 写丢弃 + fireSet.add(i)——JS 语义显式镜像）——
            w = FreshWorld(0x0B610004);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;   // S4 fill:'grass' 全域同构
            WbBailRelay.ApplyTool(w, "lightning", 3, 0.4, new Dictionary<string, double> { { "count", 12.0 }, { "power", 3.0 } });
            Assert.That(w.effects.Count, Is.EqualTo(12), "12 bolt fx");
            Assert.That(w.fireSetList.Exists((i) => i < 0), "fireSet 负索引入集（S4 黄金 OOB 分支镜像）");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("9252ec3c"), "88 掷 rng 链终态位级（S4 黄金同源）");
        }

        /// <summary>直测二：tornado 全局 6 上限（filter 快照 + cur+k>=6 break）+ quake JsRound shake 双端钳</summary>
        [Test]
        public void Test47_Tool2_TornadoCapQuake()
        {
            // —— tornado cap：预置 5 只 tornado → count=3 只补 1（cur=5 快照，k=1 break）——
            var w = FreshWorld(0x0B610007);
            for (int k = 0; k < 5; k++) w.effects.Add(new WbFx { kind = "tornado", x = 90 + k * 5, y = 50, ttl = 100, age = 0, seed = 1, dir = 0, r = 1.0 });
            WbBailRelay.ApplyTool(w, "tornado", 100, 60, new Dictionary<string, double> { { "count", 3.0 } });
            int tornadoes = 0;
            foreach (var f in w.effects) if (f.kind == "tornado") tornadoes++;
            Assert.That(tornadoes, Is.EqualTo(6), "全局 6 上限（5 预置 + 1 补）");
            Assert.That(w.effects[5].kind, Is.EqualTo("tornado"));
            Assert.That(w.effects[5].x, Is.EqualTo(100.0), "k=0 精确落点零散布掷");
            Assert.That(w.effects[5].ttl, Is.EqualTo(340.0), "ttl=340 长命云族");
            // —— quake 默认参：rP null → rr=9 + ttl=floor(90)=90 + shake=min(12,JsRound(8))=8 ——
            w = FreshWorld(0x0B610008);
            WbBailRelay.ApplyTool(w, "earthquake", 100, 60);
            Assert.That(w.effects.Count, Is.EqualTo(1), "quake fx 单发");
            Assert.That(w.effects[0].kind, Is.EqualTo("quake"));
            Assert.That(F64Hex(w.effects[0].ttl), Is.EqualTo(F64Hex(90.0)), "ttl=max(30,floor(90×1))=90 位级");
            Assert.That((double?)w.effects[0].r, Is.EqualTo(9.0), "opts {r:rr=9}");
            Assert.That(w.shake, Is.EqualTo(8.0), "shake=min(12,JsRound(8))=8（直写非 max）");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("e5b7f3f2"), "2 掷（fx seed+dir）终态位级（S8 黄金同源）");
            // —— quake 双端钳：radius=2 → rr=max(3,2)=3；radius=40 → rr=24；power=5 → shake=12 封顶 ——
            w = FreshWorld(0x0B610009);
            WbBailRelay.ApplyTool(w, "earthquake", 100, 60, new Dictionary<string, double> { { "radius", 2.0 }, { "power", 5.0 } });
            Assert.That((double?)w.effects[0].r, Is.EqualTo(3.0), "rr=max(3,rP=2)=3 下钳");
            Assert.That(F64Hex(w.effects[0].ttl), Is.EqualTo(F64Hex(270.0)), "ttl=max(30,floor(90×3))=270");
            Assert.That(w.shake, Is.EqualTo(12.0), "shake=min(12,JsRound(24))=12 封顶");
            WbBailRelay.ApplyTool(w, "earthquake", 110, 60, new Dictionary<string, double> { { "radius", 40.0 }, { "power", 0.2 } });
            Assert.That((double?)w.effects[1].r, Is.EqualTo(24.0), "rr=min(24,rP=40)=24 上钳");
            Assert.That(F64Hex(w.effects[1].ttl), Is.EqualTo(F64Hex(45.0)), "ttl=max(30,floor(45))=45");
            Assert.That(w.shake, Is.EqualTo(4.0), "shake=min(12,JsRound(4))=4 直写覆写（非 max）");
        }

        /// <summary>直测三：nuke statNukes/蘑菇云/建筑摧毁 + river 参化内流湖/早退零掷/行走 riverTiles 序</summary>
        [Test]
        public void Test47_Tool2_NukeRiverBrush()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindTool2()));
            // —— nuke：power=2 → r=max(3,min(24,14))=14 + statNukes 0→1 + 建筑环内摧毁 + 蘑菇云纪事 ——
            var w = FreshWorld(0x0B61000A);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;   // S10 fill:'grass' 全域同构（外圈 ignite 掷流依赖）
            w.building[60 * WbWorld.W + 101] = 3;
            w.buildings.Add(new WbBuilding { i = 60 * WbWorld.W + 101, x = 101, y = 60, kind = 3, civ = -1 });
            w.bIdx[60 * WbWorld.W + 101] = 0;
            w.building[60 * WbWorld.W + 115] = 3;
            w.buildings.Add(new WbBuilding { i = 60 * WbWorld.W + 115, x = 115, y = 60, kind = 3, civ = -1 });
            w.bIdx[60 * WbWorld.W + 115] = 1;
            WbBailRelay.ApplyTool(w, "nuke", 100, 60, new Dictionary<string, double> { { "power", 2.0 } });
            Assert.That(w.statNukes, Is.EqualTo(1), "statNukes++ 成就计数（L12256）");
            Assert.That(w.buildings.Count, Is.EqualTo(1), "d=1 建筑摧毁 / d=15 环外幸存");
            Assert.That(w.buildings[0].i, Is.EqualTo(60 * WbWorld.W + 115), "幸存建筑 = (115,60)");
            Assert.That(w.shake, Is.EqualTo(14.0), "shake=max(0,14)=14（nuke 支）");
            Assert.That(w.worldEvents.Count, Is.EqualTo(1), "蘑菇云纪事");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("35802446"), "460 掷 explode 级联终态位级（S10 黄金同源）");
            // —— river 参化内流湖：brush=5 无水 → carveLake max(2,5)=5（参化面——brush=3 时 r=3 对照）——
            w = FreshWorld(0x0B61000C);
            w.brush = 5;
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;   // S12 fill:'grass' 全域同构（BFS 无水面 → 内流湖支）
            WbBailRelay.ApplyTool(w, "river", 100, 60);
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_WATER), "湖心 WATER");
            Assert.That(w.terrain[54 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_GRASS), "d=6 r+1 环带幸存 GRASS（d≤5 才 WATER——参化 r=5 位证）");
            Assert.That(w.toasts.Count, Is.EqualTo(1), "群山环抱 toast（M-U15 补译面）");
            Assert.That(w.toasts[0].text, Is.EqualTo("群山环抱的洼地积水成湖"), "toast 文");
            Assert.That(w.worldEvents[0].x, Is.EqualTo(100.5), "事件坐标 sx+0.5（runtime addEvent 恒带 {x,y}）");
            uint rngAfterLake = w.rngA;
            WbBailRelay.ApplyTool(w, "river", 100, 60);   // 早退：isWater(terrain[start]) → false 零掷零写
            Assert.That(w.rngA, Is.EqualTo(rngAfterLake), "早退零掷（isWater 门 L12316）");
            // —— river 行走：pond 直写 + brush=3 → riverTilesList 插入序非空 + riverDir 写入 + 入海 toast ——
            w = FreshWorld(0x0B61000B);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            for (int yy = 58; yy <= 62; yy++) for (int xx = 18; xx <= 22; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_WATER;
            // soilF 黄金注入——JS 构造器 soilF 由 worldgen 地形衍生（非后续 fill 重衍），FOREST 转化 → 后续灌溉掷数分叉，故须与 S11 夹具位级同源
            byte[] goldSoil = GunzipB64(gold["scenarios"].Children().First(s => s.Value<string>("key") == "river-walk")["fixture"].Value<string>("soil0"));
            System.Buffer.BlockCopy(goldSoil, 0, w.soilF, 0, goldSoil.Length);
            WbBailRelay.ApplyTool(w, "river", 100, 60);
            Assert.That(w.riverTilesList.Count, Is.EqualTo(236), "riverTiles 插入序 236 项（S11 黄金同源）");
            Assert.That(w.riverTilesList[0], Is.EqualTo(15204), "首项 = (100,59)（首步加权随机向上——刻河 cross 首格，S11 黄金位证）");
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_WATER), "起点已 WATER");
            bool hasDir = false;
            foreach (var d in w.riverDir) if (d > 0) { hasDir = true; break; }
            Assert.That(hasDir, "riverDir 八向写入（水流方向面）");
            Assert.That(w.toasts[w.toasts.Count - 1].text, Is.EqualTo("一条大河蜿蜒入海"), "reached 入海 toast");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("c35d022e"), "1207 掷加权随机走终态位级（S11 黄金同源）");
        }
    }
}
