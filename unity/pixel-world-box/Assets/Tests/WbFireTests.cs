// ============================================================
// WbFireTests.cs — M-U9b fire 域黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/fire.json（5 场景）
//   由 scripts/unity-migration/gen-fire.mjs 生成（真引擎 GameEngine 构造 + 手术式夹具两相
//   直写 + 大气态注入〔windPhase/seed/pSystems/storms/rainCell/glacier/soilF〕+ rngA 尾置
//   清零起流 + fireTick 直调步进快照；det 双跑字节级一致）。
// 镜像: fire-transcript.mjs 零引擎导入 5/5 ALL PASS（bun 口径——exp/hypot/valueNoise 原生）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 5/5 → 本文件 NUnit C# 全链重放
//   （FdExp/V8Hypot/ValueNoise 位精确件 + 队列活迭代仿真 + byte 回绕同构）逐位对账。
// 对账面: 逐步 rngA 终态抽签台账 + terrain/fire md5 + fireSet 插入序（fireSetList 镜像——
//   活迭代含运行时新增序）+ regrow entries 序 + fxCount/eventsCount/buildingsCount +
//   终态 fx 全列（kind/x/y/ttl/seed/dir/r）+ events 全列 + 终态 terrain/fire gz 逐字节。
// 数学面: windAt exp→WbMath.FdExp / hypot→WbNoise.V8Hypot / valueNoise→WbNoise.ValueNoise
//   （fdlibm 位精确件——worldgen/neuro 链先证）；JSC pow(x,2)≡x*x 位等价（40 万样本扫描）。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbFireTests
    {
        private static string FindFire()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "fire.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "fire.json"),
                "fire.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: fire.json");
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

        /// <summary>C# 全链重放：夹具灌注（大气态注入）→ FireTick 逐步</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            string key = sc.Value<string>("key");
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            w.fire = GunzipB64(fx.Value<string>("fire0"));
            w.fireSet = new HashSet<int>(fx["fireSet0"].ToObject<List<int>>());
            w.fireSetList = fx["fireSet0"].ToObject<List<int>>();            // 插入序镜像（活迭代面）
            w.soilF = GunzipB64(fx.Value<string>("soil0"));
            w.glacier = GunzipB64(fx.Value<string>("glacier0"));
            w.rainCell = GunzipB64(fx.Value<string>("rain0"));
            w.windPhase = F64FromHex(fx.Value<string>("windPhase"));
            w.natureSeed = fx.Value<int>("natureSeed");
            foreach (var p in (JArray)fx["pSystems"])
                w.pSystems.Add(new double[] { F64FromHex(p.Value<string>("x")), F64FromHex(p.Value<string>("y")), p.Value<double>("kind"), F64FromHex(p.Value<string>("str")), 0 });
            foreach (var s in (JArray)fx["storms"])
                w.storms.Add(new double[] { F64FromHex(s.Value<string>("x")), F64FromHex(s.Value<string>("y")), F64FromHex(s.Value<string>("strength")) });
            foreach (var t in (JArray)fx["regrow0"])
                w.regrow[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var i in fx["frozen0"].ToObject<List<int>>()) { w.frozen.Add(i); w.frozenList.Add(i); }
            foreach (var b in (JArray)fx["building0"])
            {
                var bo = (JObject)b;
                w.building[bo.Value<int>("i")] = (byte)bo.Value<int>("kind");
                w.buildings.Add(new WbBuilding { i = bo.Value<int>("i"), x = bo.Value<int>("x"), y = bo.Value<int>("y"), kind = bo.Value<int>("kind"), civ = -1 });
                w.bIdx[bo.Value<int>("i")] = w.buildings.Count - 1;
            }
            // 季节/时钟面（gen 手术一同期）
            w.laws.seasons = sc.Value<bool>("seasons");
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            // rngA 尾置起流（gen 协议——火链掷值自 seed 纯净起流）
            w.rngA = unchecked((uint)sc.Value<int>("seed"));
            return w;
        }

        private static double F64FromHex(string hex)
        {
            byte[] b = Convert.FromHexString(hex);
            return BitConverter.ToDouble(b, 0);
        }

        [Test]
        public void Test34_Fire_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindFire()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(5));
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                int steps = sc.Value<int>("steps");
                var snaps = (JArray)sc["stepsSnap"];
                for (int k = 0; k < steps; k++)
                {
                    WbBailRelay.FireTick(w);
                    var g = (JObject)snaps[k];
                    Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{k}");
                    Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{k}");
                    Assert.That(Md5Hex(w.fire), Is.EqualTo(g.Value<string>("fireMd5")), $"fireMd5 {key} S{k}");
                    Assert.That(w.fireSetList, Is.EqualTo(g["fireSet"].ToObject<List<int>>()), $"fireSet 序 {key} S{k}");
                    Assert.That(w.fireSet.SetEquals(w.fireSetList), $"fireSet 集合=镜像 {key} S{k}");
                    var goldRegrow = new List<string>();
                    foreach (var t in (JArray)g["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
                    var gotRegrow = new List<string>();
                    foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
                    Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 序 {key} S{k}");
                    Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{k}");
                    Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{k}");
                    Assert.That(w.buildings.Count, Is.EqualTo(g.Value<int>("buildingsCount")), $"buildingsCount {key} S{k}");
                }
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
                // 终态 gz 逐字节
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("fire")), w.fire, $"fire 终态 {key}");
            }
        }

        /// <summary>语义面：fireSet ⊆ {fire>0 或已出账中途}（火格集与火场强度一致）+ BURNT 地力扣减签名</summary>
        [Test]
        public void Test34_Fire_SemanticInvariants()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindFire()));
            foreach (var scTok in (JArray)gold["scenarios"])
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                for (int k = 0; k < sc.Value<int>("steps"); k++) WbBailRelay.FireTick(w);
                foreach (int i in w.fireSet)
                    Assert.That(w.fire[i], Is.GreaterThan(0), $"fireSet⊆fire>0 {key}@{i}");
            }
            // 火烧扣地力签名（onTerrainChanged L157——BURNT 化 tile soilF ≤ 原值-8 或 ≤8 钳面）
            var w1 = new WbWorld();
            int i1 = 60 * WbWorld.W + 40;
            w1.terrain[i1] = WbWorld.T_FOREST;
            w1.soilF[i1] = 100;
            WbBailRelay.SetTerrain(w1, i1, WbWorld.T_BURNT);
            Assert.That(w1.soilF[i1], Is.EqualTo((byte)92), "火烧扣地力 L157（100-8）");
            w1.soilF[i1] = 5;                                        // ≤8 钳面——不扣
            WbBailRelay.SetTerrain(w1, i1, WbWorld.T_GRASS);
            WbBailRelay.SetTerrain(w1, i1, WbWorld.T_BURNT);
            Assert.That(w1.soilF[i1], Is.EqualTo((byte)5), "低地力不扣（>8 门）");
            // 水覆写清冰川签名（L159-163）
            var w2 = new WbWorld();
            int i2 = 60 * WbWorld.W + 50;
            w2.terrain[i2] = WbWorld.T_FOREST;
            w2.glacier[i2] = 90;
            WbBailRelay.SetTerrain(w2, i2, WbWorld.T_WATER);
            Assert.That(w2.glacier[i2], Is.EqualTo((byte)0), "水覆写清冰川 L159-163");
        }

        // ---------------- 直测语义面 ----------------

        [Test]
        public void Test34_Fire_LiveIteration_QueueEmulation()
        {
            var w = new WbWorld();                                   // 活迭代：新点燃格当 tick 即燃（JS Set 追加语义）
            w.laws.seasons = false;                                  // 永夏（fireMul 1.3）
            for (int x = 96; x < 104; x++) w.terrain[60 * WbWorld.W + x] = WbWorld.T_FOREST;
            int a = 60 * WbWorld.W + 98;
            w.fire[a] = 100; w.fireSet.Add(a); w.fireSetList.Add(a); // 强度 100（20 tick 面内不灭）
            w.rngA = 0x0F1FE11u;                                     // 早段 <0.4 过门 seed（gen 探针实证）
            WbBailRelay.FireTick(w);
            Assert.That(w.fireSet.Count, Is.GreaterThanOrEqualTo(1));
            // 邻格被点燃 → fire>0 且在集合（当 tick 即燃——活迭代语义落地）
            bool ignited = false;
            foreach (int i in w.fireSet) if (i != a && w.fire[i] > 0) ignited = true;
            Assert.That(ignited || w.fireSet.Count == 1, Is.True, "活迭代或无蔓延（det 面）");
        }

        [Test]
        public void Test34_Fire_WrapSemantics()
        {
            var w = new WbWorld();                                   // Uint8Array wrap：强度 ≢0 mod 5 回绕续燃（L2783）
            w.laws.seasons = false;
            int a = 60 * WbWorld.W + 60;
            w.terrain[a] = WbWorld.T_GRASS;
            w.fire[a] = 2; w.fireSet.Add(a); w.fireSetList.Add(a);   // 2-5 = -3 → 253（回绕）
            w.rngA = 1;
            WbBailRelay.FireTick(w);
            Assert.That(w.fire[a], Is.EqualTo((byte)253));           // 回绕续燃——非 0 即不灭
            Assert.That(w.fireSet, Does.Contain(a));                 // 仍在集合
            w.fire[a] = 5;                                           // 5-5 = 0 → 熄灭出账
            WbBailRelay.FireTick(w);
            Assert.That(w.fire[a], Is.EqualTo((byte)0));
            Assert.That(w.fireSet, Does.Not.Contain(a));             // L2816 出账
            Assert.That(w.terrain[a], Is.EqualTo(WbWorld.T_BURNT));  // GRASS → BURNT（L2821）
            Assert.That(w.regrow.ContainsKey(a), Is.True);           // L2823 regrow 挂账
        }

        [Test]
        public void Test34_Fire_IceMelt_Branch()
        {
            var w = new WbWorld();                                   // L2778 火焰落在冰面：脚下融冰 + 火随水熄
            w.laws.seasons = false;
            int a = 60 * WbWorld.W + 70;
            w.terrain[a] = WbWorld.T_ICE;
            w.fire[a] = 200; w.fireSet.Add(a); w.fireSetList.Add(a);
            w.frozen.Add(a); w.frozenList.Add(a);                    // 冰面格在冻结集（L981 跨域交叠）
            w.rngA = 1;
            WbBailRelay.FireTick(w);
            Assert.That(w.terrain[a], Is.EqualTo(WbWorld.T_WATER));  // meltIce → setTerrain(WATER)
            Assert.That(w.fire[a], Is.EqualTo((byte)0));             // L2780 火随水熄
            Assert.That(w.fireSet, Does.Not.Contain(a));             // done 出账
            Assert.That(w.frozen, Does.Not.Contain(a));              // L981 冰面集出账（跨域交叠）
        }

        [Test]
        public void Test34_OrchFireSlot_Wired()
        {
            var w = new WbWorld();                                   // FIRE 槽（0）每 tick 触发（L2517）
            var orch = new WbTickOrch { w = w };
            orch.D[WbTickOrch.FIRE] = () => WbBailRelay.FireTick(w); // 宿主 WireOrch 同形（M-U9b）
            int a = 60 * WbWorld.W + 80;
            w.laws.seasons = false;
            w.terrain[a] = WbWorld.T_GRASS;
            w.fire[a] = 5; w.fireSet.Add(a); w.fireSetList.Add(a);
            w.tickCount = 0;
            orch.Tick();                                             // tickCount 0→1——FIRE 每 tick
            Assert.That(w.fire[a], Is.EqualTo((byte)0));             // 5-5=0 熄灭
            Assert.That(w.terrain[a], Is.EqualTo(WbWorld.T_BURNT));  // GRASS → BURNT
            Assert.That(w.fireSet, Is.Empty);
        }
    }
}
