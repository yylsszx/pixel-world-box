// ============================================================
// WbAgentLawTests.cs — M-U28 Agent 法则系统 v2 结算面黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/agentlaws.json（12 场景 + 纯函数 28 向量）
//   由 scripts/unity-migration/gen-agentlaws.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔法则/计数器注入 + spawnUnit 真调用 + fireSet 直写〕+ rngA 尾置
//   清零起流 + agentLaws.tick() 直调步进；det 双跑字节级一致）。
// 验证链（纪律④）: 黄金向量(真实现) → det 双跑 → 本文件 NUnit C# 全链重放
//   （夹具灌注 → SpawnUnit 重放 → 法则注入 → agentLaws.Tick 逐步）逐位对账 → 网页 parity。
// 对账面: 逐步 rngA 终态 + terrain md5 + laws 状态序（id/enabled/fired/lastYear）+
//   counters 插入序 + eventsCount/fxCount + fireSet 插入序 + 终态 fx/events/units/
//   params/reverts 全列（f64 位级）+ 纯函数 evalCond/resolveRace 全分支。
// 切片边界: create/update/normalizeTrigger/normalizeLaw/list 属工具/存档面下一轮
//   （法则夹具直写注入，不经 create——gen-power radSet 先例）。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbAgentLawTests
    {
        private static string FindGolden()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "agentlaws.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "agentlaws.json"),
                "agentlaws.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: agentlaws.json");
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

        private static bool Has(JToken j, string k) => j[k] != null && j[k].Type != JTokenType.Null;

        private static WbCondExpr CondFromJ(JObject j)
        {
            var c = new WbCondExpr { op = j.Value<string>("op") };
            if (c.op == "and" || c.op == "or")
            {
                foreach (var s in (JArray)j["sub"]) c.sub.Add(CondFromJ((JObject)s));
            }
            else if (c.op == "not")
            {
                c.subOne = CondFromJ((JObject)j["sub"]);
            }
            else
            {
                c.stat = j.Value<string>("stat");
                c.value = j.Value<double>("value");
            }
            return c;
        }

        private static WbLawAction ActionFromJ(JObject j)
        {
            var a = new WbLawAction { kind = j.Value<string>("kind") };
            if (Has(j, "x")) a.x = j.Value<double>("x");
            if (Has(j, "y")) a.y = j.Value<double>("y");
            if (Has(j, "power")) a.power = j.Value<double>("power");
            if (Has(j, "count")) a.count = j.Value<double>("count");
            if (Has(j, "radius")) a.radius = j.Value<double>("radius");
            if (Has(j, "weather")) a.weather = j.Value<string>("weather");
            if (Has(j, "race")) a.race = j.Value<string>("race");
            if (Has(j, "terrain")) a.terrain = j.Value<string>("terrain");
            if (Has(j, "path")) a.path = j.Value<string>("path");
            if (Has(j, "text")) a.text = j.Value<string>("text");
            if (Has(j, "action")) a.action = j.Value<string>("action");
            if (Has(j, "target")) a.target = j.Value<string>("target");
            if (Has(j, "name")) a.name = j.Value<string>("name");
            if (Has(j, "op")) a.op = j.Value<string>("op");
            if (Has(j, "value")) a.value = j.Value<double>("value");
            return a;
        }

        private static WbAgentLaw LawFromJ(JObject j)
        {
            var law = new WbAgentLaw
            {
                id = j.Value<string>("id"),
                name = j.Value<string>("name"),
                desc = j.Value<string>("desc"),
                enabled = j.Value<bool>("enabled"),
                createdYear = j.Value<double>("createdYear"),
                durationYears = Has(j, "durationYears") ? j.Value<double>("durationYears") : (double?)null,
                fired = j.Value<int>("fired"),
                lastYear = j.Value<double>("lastYear"),
            };
            var tg = (JObject)j["trigger"];
            var t = new WbMechTrigger { kind = tg.Value<string>("kind") };
            if (Has(tg, "everyYears")) t.everyYears = tg.Value<double>("everyYears");
            if (Has(tg, "chance")) t.chance = tg.Value<double>("chance");
            if (Has(tg, "season")) t.season = (int)tg.Value<double>("season");
            if (Has(tg, "event")) t.@event = tg.Value<string>("event");
            if (Has(tg, "eventCooldownYears")) t.eventCooldownYears = tg.Value<double>("eventCooldownYears");
            if (tg["cond"] != null && tg["cond"].Type == JTokenType.Object) t.cond = CondFromJ((JObject)tg["cond"]);
            law.trigger = t;
            foreach (var at in (JArray)j["actions"]) law.actions.Add(ActionFromJ((JObject)at));
            if (j["revert"] != null && j["revert"].Type == JTokenType.Object)
                foreach (var p in ((JObject)j["revert"]).Properties()) law.revert[p.Name] = p.Value.Value<double>();
            return law;
        }

        /// <summary>C# 全链重放：参数表复位 → 夹具灌注 → SpawnUnit 重放（rngA 起流前）→ 法则/计数器注入</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            string key = sc.Value<string>("key");
            WbEngineParams.Reset();                                         // gen 场景间复位同构（det 前置）
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            w.soilF = GunzipB64(fx.Value<string>("soilF0"));
            w.fire = GunzipB64(fx.Value<string>("fire0"));
            var fireSet0 = fx["fireSet0"].ToObject<List<int>>();
            w.fireSet = new HashSet<int>(fireSet0);
            w.fireSetList = new List<int>(fireSet0);                        // 插入序镜像（JS Set 迭代序）
            w.globalTemp = BitConverter.ToDouble(Convert.FromHexString(fx.Value<string>("globalTempHex")), 0);
            w.seaLevel = BitConverter.ToDouble(Convert.FromHexString(fx.Value<string>("seaLevelHex")), 0);
            w.glacierTiles = fx.Value<int>("glacierTiles");
            // spawn 重放（M-U3h 译件——rngA 起流前，掷数不入结算链）
            foreach (var s in (JArray)fx["spawn0"])
            {
                var so = (JObject)s;
                byte[] xb = Convert.FromHexString(so.Value<string>("x"));
                byte[] yb = Convert.FromHexString(so.Value<string>("y"));
                double sx = BitConverter.ToDouble(xb, 0), sy = BitConverter.ToDouble(yb, 0);
                var u = WbBailRelay.SpawnUnit(w, so.Value<int>("race"), sx, sy, new WbBailRelay.WbSpawnOpts { silent = true });
                Assert.That(u, Is.Not.Null, $"spawn 重放 {key}");
            }
            // 法则/计数器手术式直写注入（create/normalizeTrigger 属工具/存档面下一轮）
            foreach (var lt in (JArray)sc["laws"]) w.agentLaws.laws.Add(LawFromJ((JObject)lt));
            foreach (var p in ((JObject)sc["counters0"]).Properties()) w.agentLaws.counters[p.Name] = p.Value.Value<double>();
            // 季节/时钟面（gen 手术一同期——结算相位门输入）
            w.laws.seasons = sc.Value<bool>("seasons");
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            // rngA 尾置起流（gen 协议——结算掷链自 seed 纯净起流）
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        [Test]
        public void Test34_AgentLaws_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(12));
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                int steps = sc.Value<int>("steps");
                var snaps = (JArray)sc["stepsSnap"];
                for (int k = 0; k < steps; k++)
                {
                    w.agentLaws.Tick();
                    var g = (JObject)snaps[k];
                    Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{k}");
                    Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{k}");
                    // laws 状态序（id/enabled/fired/lastYear——到期移除 splice 后序对账）
                    var goldLaws = g["lawsState"].ToObject<List<JObject>>();
                    Assert.That(w.agentLaws.laws.Count, Is.EqualTo(goldLaws.Count), $"laws count {key} S{k}");
                    for (int i = 0; i < goldLaws.Count; i++)
                    {
                        var gl = goldLaws[i];
                        var cl = w.agentLaws.laws[i];
                        Assert.That(cl.id, Is.EqualTo(gl.Value<string>("id")), $"law id {key} S{i}#{i}");
                        Assert.That(cl.enabled, Is.EqualTo(gl.Value<bool>("enabled")), $"law enabled {key} S{k}#{i}");
                        Assert.That(cl.fired, Is.EqualTo(gl.Value<int>("fired")), $"law fired {key} S{k}#{i}");
                        Assert.That(F64Hex(cl.lastYear), Is.EqualTo(F64Hex(gl.Value<double>("lastYear"))), $"law lastYear {key} S{k}#{i}");
                    }
                    // counters 插入序（JS 对象键序 = C# Dictionary 无删序）
                    var goldCtr = g["counters"].ToObject<List<JArray>>();
                    var gotCtr = new List<string>();
                    foreach (var kv in w.agentLaws.counters) gotCtr.Add($"{kv.Key}:{F64Hex(kv.Value)}");
                    var expCtr = new List<string>();
                    foreach (var t in goldCtr) expCtr.Add($"{t[0].Value<string>()}:{t[1].Value<string>()}");   // 黄金 t[1] 已是 f64hex 串——直接对账（禁经 double 往返）
                    Assert.That(gotCtr, Is.EqualTo(expCtr), $"counters 序 {key} S{k}");
                    Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{k}");
                    Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{k}");
                    Assert.That(w.fireSetList, Is.EqualTo(g["fireSet"].ToObject<List<int>>()), $"fireSet 插入序 {key} S{k}");   // JS Set 迭代序 = fireSetList 镜像（IgniteE 四写点同步）
                    Assert.That(w.fireSet.SetEquals(w.fireSetList), $"fireSet 集合=镜像 {key} S{k}");
                }
                // 终态 fx 全列（kind/x/y/ttl/seed/dir f64 位级）
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
                }
                // 终态 events 全列（kind/text/x/y——中文文案逐字节）
                var goldEv = (JArray)sc["events"];
                Assert.That(w.worldEvents.Count, Is.EqualTo(goldEv.Count), $"events count {key}");
                for (int k = 0; k < goldEv.Count; k++)
                {
                    var e = (JObject)goldEv[k];
                    var ev = w.worldEvents[k];
                    Assert.That(ev.kind, Is.EqualTo(e.Value<string>("kind")), $"event kind {key}#{k}");
                    Assert.That(ev.text, Is.EqualTo(e.Value<string>("text")), $"event text {key}#{k}");
                    double? gx = e["x"].Type == JTokenType.Null ? (double?)null : e["x"].Value<double>();
                    double? gy = e["y"].Type == JTokenType.Null ? (double?)null : e["y"].Value<double>();
                    Assert.That(ev.x, Is.EqualTo(gx), $"event x {key}#{k}");
                    Assert.That(ev.y, Is.EqualTo(gy), $"event y {key}#{k}");
                }
                // 终态 units 全列（x/y/hp f64 位级 + dead）
                var goldU = (JArray)sc["units"];
                Assert.That(w.units.Count, Is.EqualTo(goldU.Count), $"units count {key}");
                for (int k = 0; k < goldU.Count; k++)
                {
                    var e = (JObject)goldU[k];
                    var u = w.units[k];
                    Assert.That(F64Hex(u.x), Is.EqualTo(e.Value<string>("x")), $"unit x {key}#{k}");
                    Assert.That(F64Hex(u.y), Is.EqualTo(e.Value<string>("y")), $"unit y {key}#{k}");
                    Assert.That(F64Hex(u.hp), Is.EqualTo(e.Value<string>("hp")), $"unit hp {key}#{k}");
                    Assert.That(u.dead, Is.EqualTo(e.Value<int>("dead")), $"unit dead {key}#{k}");
                }
                // 终态参数注册表（REG 序——param 动作/还原账本可观测面）
                var goldP = (JArray)sc["params"];
                Assert.That(WbEngineParams.Reg.Count, Is.EqualTo(goldP.Count), $"params count {key}");
                for (int k = 0; k < goldP.Count; k++)
                {
                    var e = (JObject)goldP[k];
                    Assert.That(WbEngineParams.Reg[k].path, Is.EqualTo(e.Value<string>("path")), $"param path {key}#{k}");
                    Assert.That(F64Hex(WbEngineParams.Reg[k].value), Is.EqualTo(e.Value<string>("valueHex")), $"param value {key}#{k}");
                }
                // 终态 revert 账本（per law）
                var goldR = (JArray)sc["reverts"];
                Assert.That(w.agentLaws.laws.Count, Is.EqualTo(goldR.Count), $"reverts laws {key}");
                for (int k = 0; k < goldR.Count; k++)
                {
                    var e = (JObject)goldR[k];
                    Assert.That(w.agentLaws.laws[k].id, Is.EqualTo(e.Value<string>("id")), $"revert id {key}#{k}");
                    var got = new List<string>();
                    foreach (var kv in w.agentLaws.laws[k].revert) got.Add($"{kv.Key}:{F64Hex(kv.Value)}");
                    var exp = new List<string>();
                    foreach (var t in (JArray)e["revert"]) exp.Add($"{t[0].Value<string>()}:{t[1].Value<string>()}");   // 黄金 t[1] 已是 f64hex 串
                    Assert.That(got, Is.EqualTo(exp), $"revert 账本 {key}#{k}");
                }
                // 终态 terrain/fire gz 逐字节
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("fire")), w.fire, $"fire 终态 {key}");
            }
        }

        // ---------------- 纯函数对账（evalCond L125-143 + resolveRace L70-87） ----------------

        [Test]
        public void Test34_AgentLaws_PureVectors()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            var pure = (JObject)gold["pure"];
            var stat = new Dictionary<string, double> { { "pop", 10 }, { "wars", 0 }, { "counter:k", 3.5 }, { "temp", -2.25 } };
            Func<string, double> statFn = (k) => stat.TryGetValue(k, out double v) ? v : double.NaN;
            int nCond = 0;
            foreach (var t in (JArray)pure["evalCond"])
            {
                var c = CondFromJ((JObject)t["c"]);
                bool expected = t.Value<bool>("expected");
                Assert.That(WbAgentLaws.EvalCond(c, statFn), Is.EqualTo(expected), $"evalCond #{nCond}");
                nCond++;
            }
            Assert.That(nCond, Is.EqualTo(13));
            int nRace = 0;
            foreach (var t in (JArray)pure["resolveRace"])
            {
                int? expected = t["expected"].Type == JTokenType.Null ? (int?)null : t.Value<int>("expected");
                Assert.That(WbAgentLaws.ResolveRace(t.Value<string>("name")), Is.EqualTo(expected), $"resolveRace #{nRace} {t.Value<string>("name")}");
                nRace++;
            }
            Assert.That(nRace, Is.EqualTo(15));
        }

        // ---------------- 槽 60 节律（WbTickOrch AGENT_LAWS_TICK %120===57 后半门） ----------------

        [Test]
        public void Test34_OrchAgentLawsSlot_FiresAtMod120_57()
        {
            var w = new WbWorld();
            WbEngineParams.Reset();
            var orch = new WbTickOrch { w = w };
            orch.D[WbTickOrch.AGENT_LAWS_TICK] = () => w.agentLaws.Tick();   // 宿主 WireOrch 同形（M-U28）
            w.agentLaws.laws.Add(new WbAgentLaw
            {
                id = "L1", name = "节律钉", desc = "槽 60 相位",
                trigger = new WbMechTrigger { kind = "cron", everyYears = 1, chance = 1 },
                actions = new List<WbLawAction> { new WbLawAction { kind = "counter", name = "搏", op = "add", value = 1 } },
            });
            w.yearF = 1.5;
            w.tickCount = 56;                                                // Tick() 首行 ++ → 57 → %120==57 触发
            orch.Tick();
            Assert.That(w.agentLaws.counters.TryGetValue("搏", out double v1) && v1 == 1, Is.True, "%120===57 相位触发");
            w.tickCount = 57;                                                // → 58 → 不触发（相位窗只有 1 tick）
            orch.Tick();
            Assert.That(w.agentLaws.counters["搏"], Is.EqualTo(1), "相位窗外不触发");
            w.tickCount = 176;                                               // → 177 = 120+57 → 相位再中
            w.yearF = 2.5;                                                   // 年轮门：year 1→2（lastYear=1 → 1≥1 过门——结算间隔按年不按 tick）
            orch.Tick();
            Assert.That(w.agentLaws.counters["搏"], Is.EqualTo(2), "下一周期相位再触发");
        }

        // ---------------- 语义不变量（预算 ≤6 / 零法则零开销 / 重入保护） ----------------

        [Test]
        public void Test34_AgentLaws_SemanticInvariants()
        {
            // 零法则零开销：Tick 顶层早退（蓝本 L525——throw-free 面即证）
            var w = new WbWorld();
            Assert.DoesNotThrow(() => w.agentLaws.Tick());
            // 预算封顶：budget-6 场景——8 条同资格法则恰 6 条 fire（golden 已逐位对账，此处语义复述）
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            foreach (var scTok in (JArray)gold["scenarios"])
            {
                var sc = (JObject)scTok;
                if (sc.Value<string>("key") != "budget-6") continue;
                var w2 = ReplayScenario(sc);
                w2.agentLaws.Tick();
                int firedCount = 0;
                foreach (var l in w2.agentLaws.laws) if (l.fired > 0) firedCount++;
                Assert.That(firedCount, Is.LessThanOrEqualTo(6), "单次结算全局 fire 预算 ≤6");
                Assert.That(firedCount, Is.EqualTo(6), "8 条资格法则恰 6 条命中");
            }
            // 重入保护：fire 期间 addEvent 不级联 onEvent（firing 旗标）——
            // announce 动作在 fire 内 addEvent('oracle')，若重入保护失效，
            // event-cascade 场景的掷链会被打乱（golden rngA 已逐位对账兜底）。
            // 到期移除零播报：expiry-revert 场景 events 恰 1（消散纪事，无废止播报）——同上兜底。
        }
    }
}
