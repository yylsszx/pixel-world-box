// ============================================================
// WbIceTests.cs — M-U9a 冰域黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/ice.json（5 场景）
//   由 scripts/unity-migration/gen-ice.mjs 生成（真引擎 GameEngine 构造 + 手术式夹具直写
//   两相协议〔直写相 → 快照 → setTerrain 直调相〕+ rngA 尾置清零起流 + iceTick 直调步进
//   快照；det 双跑字节级一致）。镜像: ice-transcript.mjs 零引擎导入 5/5 ALL PASS（bun 口径）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 5/5 → 本文件 NUnit C# 全链重放
//   （夹具灌注 → SpawnUnit 重放 → SetTerrain 直调 → IceTick 逐步）逐位对账 → 网页 parity。
// 对账面: 逐步 rngA 终态抽签台账 + terrain md5 + frozen 插入序（List 镜像）+ flood/wet
//   entries 序 + fxCount/eventsCount + 终态 fx 全列（kind/x/y/ttl/seed/dir f64 位级）+
//   events 全列（kind/text/x/y）+ 终态 terrain gz 逐字节。
// 掷值链定性: iceTick 全域零超越函数（floor/abs/min/round 纯算术）——JS/C# IEEE 位安全域。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbIceTests
    {
        private static string FindIce()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "ice.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "ice.json"),
                "ice.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: ice.json");
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

        /// <summary>C# 全链重放：夹具灌注 → SpawnUnit 重放（rngA 起流前）→ SetTerrain 直调 → IceTick 逐步</summary>
        private static WbWorld ReplayScenario(Newtonsoft.Json.Linq.JObject sc)
        {
            string key = sc.Value<string>("key");
            var fx = (Newtonsoft.Json.Linq.JObject)sc["fixture"];
            var w = new WbWorld();
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));            // 手术直写相终态（setTerrain 直调前）
            w.tempMap = GunzipB64(fx.Value<string>("temp0"));
            w.fire = GunzipB64(fx.Value<string>("fire0"));
            w.fireSet = new HashSet<int>(fx["fireSet0"].ToObject<List<int>>());
            w.frozen = new HashSet<int>(fx["frozen0"].ToObject<List<int>>());
            w.frozenList = fx["frozen0"].ToObject<List<int>>();             // 插入序镜像（JS Set 迭代序）
            w.flood = new Dictionary<int, long>();
            foreach (var t in (Newtonsoft.Json.Linq.JArray)fx["flood0"])
                w.flood[t[0].Value<int>()] = t[1].Value<long>();
            w.wet = new Dictionary<int, long>();
            foreach (var t in (Newtonsoft.Json.Linq.JArray)fx["wet0"])
                w.wet[t[0].Value<int>()] = t[1].Value<long>();
            // spawn 重放（M-U3h 译件——rngA 起流前，掷数不入冰链）
            foreach (var s in (Newtonsoft.Json.Linq.JArray)fx["spawn0"])
            {
                var so = (Newtonsoft.Json.Linq.JObject)s;
                byte[] xb = Convert.FromHexString(so.Value<string>("x"));
                byte[] yb = Convert.FromHexString(so.Value<string>("y"));
                double sx = BitConverter.ToDouble(xb, 0), sy = BitConverter.ToDouble(yb, 0);
                var u = WbBailRelay.SpawnUnit(w, so.Value<int>("race"), sx, sy, new WbBailRelay.WbSpawnOpts { silent = true });
                Assert.That(u, Is.Not.Null, $"spawn 重放 {key}");
            }
            // setTerrain 直调相（S5 级联面——手术序；setCalls 行 = [x, y, t] 坐标形）
            foreach (var t in (Newtonsoft.Json.Linq.JArray)fx["setCalls"])
                WbBailRelay.SetTerrain(w, t[1].Value<int>() * WbWorld.W + t[0].Value<int>(), t[2].Value<byte>());
            // 季节/时钟面（gen 手术一同期——iceTick 相位门输入）
            w.laws.seasons = sc.Value<bool>("seasons");
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            // rngA 尾置起流（gen 协议——冰链掷值自 seed 纯净起流）
            w.rngA = unchecked((uint)sc.Value<int>("seed"));
            return w;
        }

        [Test]
        public void Test33_Ice_GoldenReplay()
        {
            var gold = Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(FindIce()));
            var scens = (Newtonsoft.Json.Linq.JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(5));
            foreach (var scTok in scens)
            {
                var sc = (Newtonsoft.Json.Linq.JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                int steps = sc.Value<int>("steps");
                var snaps = (Newtonsoft.Json.Linq.JArray)sc["stepsSnap"];
                // 逐步快照逐位对账
                for (int k = 0; k < steps; k++)
                {
                    WbBailRelay.IceTick(w);
                    var g = (Newtonsoft.Json.Linq.JObject)snaps[k];
                    Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{k}");
                    Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{k}");
                    Assert.That(w.frozenList, Is.EqualTo(g["frozen"].ToObject<List<int>>()), $"frozen 序 {key} S{k}");
                    Assert.That(w.frozen.SetEquals(w.frozenList), $"frozen 集合=镜像 {key} S{k}");
                    var goldFlood = new List<string>();
                    foreach (var t in (Newtonsoft.Json.Linq.JArray)g["flood"]) goldFlood.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
                    var gotFlood = new List<string>();
                    foreach (var kv in w.flood) gotFlood.Add($"{kv.Key}:{kv.Value}");
                    Assert.That(gotFlood, Is.EqualTo(goldFlood), $"flood 序 {key} S{k}");
                    var goldWet = new List<string>();
                    foreach (var t in (Newtonsoft.Json.Linq.JArray)g["wet"]) goldWet.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
                    var gotWet = new List<string>();
                    foreach (var kv in w.wet) gotWet.Add($"{kv.Key}:{kv.Value}");
                    Assert.That(gotWet, Is.EqualTo(goldWet), $"wet 序 {key} S{k}");
                    Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{k}");
                    Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{k}");
                }
                // 终态 fx 全列（kind/x/y/ttl/seed/dir f64 位级）
                var goldFx = (Newtonsoft.Json.Linq.JArray)sc["fx"];
                Assert.That(w.effects.Count, Is.EqualTo(goldFx.Count), $"fx count {key}");
                for (int k = 0; k < goldFx.Count; k++)
                {
                    var e = (Newtonsoft.Json.Linq.JObject)goldFx[k];
                    var f = w.effects[k];
                    Assert.That(f.kind, Is.EqualTo(e.Value<string>("kind")), $"fx kind {key}#{k}");
                    Assert.That(f.seed, Is.EqualTo(e.Value<int>("seed")), $"fx seed {key}#{k}");
                    Assert.That(F64Hex(f.x), Is.EqualTo(e.Value<string>("x")), $"fx x {key}#{k}");
                    Assert.That(F64Hex(f.y), Is.EqualTo(e.Value<string>("y")), $"fx y {key}#{k}");
                    Assert.That(F64Hex(f.ttl), Is.EqualTo(e.Value<string>("ttl")), $"fx ttl {key}#{k}");
                    Assert.That(F64Hex(f.dir), Is.EqualTo(e.Value<string>("dir")), $"fx dir {key}#{k}");
                }
                // 终态 events 全列（kind/text/x/y）
                var goldEv = (Newtonsoft.Json.Linq.JArray)sc["events"];
                Assert.That(w.worldEvents.Count, Is.EqualTo(goldEv.Count), $"events count {key}");
                for (int k = 0; k < goldEv.Count; k++)
                {
                    var e = (Newtonsoft.Json.Linq.JObject)goldEv[k];
                    var ev = w.worldEvents[k];
                    Assert.That(ev.kind, Is.EqualTo(e.Value<string>("kind")), $"event kind {key}#{k}");
                    Assert.That(ev.text, Is.EqualTo(e.Value<string>("text")), $"event text {key}#{k}");
                    double? gx = e["x"].Type == Newtonsoft.Json.Linq.JTokenType.Integer ? (double?)e.Value<long>("x") : (double?)null;
                    double? gy = e["y"].Type == Newtonsoft.Json.Linq.JTokenType.Integer ? (double?)e.Value<long>("y") : (double?)null;
                    Assert.That(ev.x, Is.EqualTo(gx), $"event x {key}#{k}");
                    Assert.That(ev.y, Is.EqualTo(gy), $"event y {key}#{k}");
                }
                // 终态 terrain gz 逐字节（黄金 terrain 列 = 步进终态）
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
            }
        }

        /// <summary>语义面：frozen ⊆ {terrain==ICE}（冰面集与地形一致——融化出账/冻结入账级联闭合）+ 纪事旗标与事件一致性</summary>
        [Test]
        public void Test33_Ice_SemanticInvariants()
        {
            var gold = Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText(FindIce()));
            foreach (var scTok in (Newtonsoft.Json.Linq.JArray)gold["scenarios"])
            {
                var sc = (Newtonsoft.Json.Linq.JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                for (int k = 0; k < sc.Value<int>("steps"); k++) WbBailRelay.IceTick(w);
                foreach (int i in w.frozen)
                    Assert.That(w.terrain[i], Is.EqualTo(WbWorld.T_ICE), $"frozen⊆ICE {key}@{i}");
                bool hasGeo = false;
                foreach (var ev in w.worldEvents) if (ev.kind == "geo") hasGeo = true;
                if (hasGeo) Assert.That(w.iceChronDone || w.thawChronDone, Is.True, $"geo 纪事旗标一致性 {key}");
            }
        }

        // ---------------- 直测语义面（零掷域——rngA 不动面） ----------------

        [Test]
        public void Test33_HotProbe_Melt()
        {
            var w = new WbWorld();                                   // 热源支路：岩浆邻冰立即融（零掷支路——掷数面由黄金回放闭合）
            w.laws.seasons = false;                                  // 永夏（避开春汛门）
            int i = 60 * WbWorld.W + 100, j = 60 * WbWorld.W + 99;
            w.terrain[i] = WbWorld.T_ICE; w.terrain[j] = WbWorld.T_LAVA;
            w.frozen.Add(i); w.frozenList.Add(i);
            WbBailRelay.IceTick(w);
            Assert.That(w.terrain[i], Is.EqualTo(WbWorld.T_WATER));  // meltIce → setTerrain(WATER)
            Assert.That(w.frozen, Does.Not.Contain(i));              // L981 出账
            CollectionAssert.DoesNotContain(w.frozenList, i);        // List 镜像同步
            int k = 60 * WbWorld.W + 120;
            w.terrain[k] = WbWorld.T_ICE; w.fire[60 * WbWorld.W + 121] = 50; w.fireSet.Add(60 * WbWorld.W + 121);
            w.frozen.Add(k); w.frozenList.Add(k);                    // 火焰热源形态（fire[j]>0——L2914 右支）
            WbBailRelay.IceTick(w);
            Assert.That(w.terrain[k], Is.EqualTo(WbWorld.T_WATER));  // 热源消融
            Assert.That(w.fire[k], Is.EqualTo(0));                   // k 本身无火——灭火支路不误触
        }

        [Test]
        public void Test33_SetTerrain_DecalCascade()
        {
            var w = new WbWorld();                                   // L981-984 点亮面（M-U9a 级联）
            int a = 60 * WbWorld.W + 40, b = 60 * WbWorld.W + 41, c = 60 * WbWorld.W + 42, d = 60 * WbWorld.W + 43, e = 60 * WbWorld.W + 44;
            w.terrain[a] = WbWorld.T_ICE; w.frozen.Add(a); w.frozenList.Add(a);
            w.terrain[b] = WbWorld.T_WATER; w.flood[b] = 5000;
            w.terrain[c] = WbWorld.T_SAND; w.wet[c] = 5000;
            WbBailRelay.SetTerrain(w, a, WbWorld.T_GRASS);           // L981 ICE→GRASS frozen 出账
            Assert.That(w.frozen, Does.Not.Contain(a));
            CollectionAssert.DoesNotContain(w.frozenList, a);
            WbBailRelay.SetTerrain(w, b, WbWorld.T_ICE);             // L982 WATER→ICE frozen 入账 + L983 flood 出账
            Assert.That(w.frozen, Does.Contain(b));
            CollectionAssert.Contains(w.frozenList, b);
            Assert.That(w.flood.ContainsKey(b), Is.False);
            WbBailRelay.SetTerrain(w, c, WbWorld.T_FOREST);          // L984 非沙覆写 wet 出账
            Assert.That(w.wet.ContainsKey(c), Is.False);
            WbBailRelay.SetTerrain(w, d, WbWorld.T_GRASS);           // L983 非水覆写 flood 出账（空表 no-op 面）
            w.flood[e] = 5000; w.terrain[e] = WbWorld.T_WATER;
            WbBailRelay.SetTerrain(w, e, WbWorld.T_WATER);           // 同值早退 L971——级联零触达
            Assert.That(w.flood.ContainsKey(e), Is.True);            // 计时保留
        }

        [Test]
        public void Test33_OrchIceSlot_FiresAtMod40()
        {
            var w = new WbWorld();                                   // ICE 槽（21）%40 节律门（L2552）
            var orch = new WbTickOrch { w = w };
            orch.D[WbTickOrch.ICE] = () => WbBailRelay.IceTick(w);   // 宿主 WireOrch 同形（M-U9a）
            int i = 60 * WbWorld.W + 50, nb = 60 * WbWorld.W + 51;
            w.laws.seasons = false;                                  // 永夏 → season 1（暖候通道）
            w.terrain[i] = WbWorld.T_ICE;                            // 无邻热源 + tempMap 0 → 零融面
            w.frozen.Add(i); w.frozenList.Add(i);
            w.tickCount = 39;                                        // Tick() 首行 ++ → 40 → %40==0 触发
            orch.Tick();
            Assert.That(w.terrain[i], Is.EqualTo(WbWorld.T_ICE));    // 暖候掷未中（tempMap 0）——冰保留
            Assert.That(w.frozen, Does.Contain(i));
            w.tickCount = 59;                                        // → 60：%40!=0 → ICE 不触发
            w.terrain[nb] = WbWorld.T_LAVA;                          // 邻格热源在场——若门破每 tick 触发即融（专钉）
            orch.Tick();
            Assert.That(w.terrain[i], Is.EqualTo(WbWorld.T_ICE));    // 节律门挡住——热源支路未触达
            w.tickCount = 79;                                        // → 80：%40==0 → 补触发
            orch.Tick();
            Assert.That(w.terrain[i], Is.EqualTo(WbWorld.T_WATER));  // 热源消融落地
            Assert.That(w.frozen, Does.Not.Contain(i));
        }
    }
}
