// ============================================================
// WbWarTests.cs — M-U32 大战域本体（warTick + worldWarTick + wwWeaponsTick + endWorldWar +
//   devUltimateWar + launch 八件）黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/war.json（18 场景 det 双跑字节级）
//   由 scripts/unity-migration/gen-war.mjs 生成（真引擎 GameEngine 构造 + 手术式夹具直写
//   〔civ〔militarism〕/rel/met/tension/totalWars/warData/warHistory/lastDeclareAt/wwTruce/
//   warShame/lastCatastrophe/alliances/武器池/worldWar 注入 + spawnUnit 真调用〕+
//   rngA 尾置清零起流 + ops 逐步直调〔wt/wwt/endww/devww/fire/launch〕+ 每步快照）。
// 验证链（纪律④）: 黄金向量(真实现) → det 双跑 → 本文件 NUnit C# 全链重放
//   （夹具灌注 → WbWar 逐步直调 → WbCivSim.DeclareWar/PickCasus 消费链）逐位对账。
// 对账面: 每步 rngA + rel（插入序+f64hex）+ tension（整值归一）+ totalWars/met（Set 序）+
//   warHistory + lastDeclareAt/wwTruce/warShame + warData canonical + fx 全字段 + events +
//   toasts（text/tone）+ worldWar 全计数（phase/startTick/belligerents/pop0/kills/fallen/
//   truces/nukes/lasers/drones/orbitals/plasmas/antimatters/emerged/winner/endText）+
//   weapons canonical + gold + shake + statWars + 冷却四 tick + deadCount。
// 场景册: S1 神谕止战 / S2 神谕软化 / S3 冻结+钳 / S4 和平面三键 / S5 宣战全链 /
//   S6 emergent 常规发射 / S7 自然引燃+devUltimateWar / S8 引燃冷却早退 / S9 终局胜者 /
//   S10 同归于尽 / S11 停战到期重燃 / S12 frenzy 盟约撕裂 / S13 联盟终局 / S14 launch 基础串 /
//   S15 火炮建筑面 / S18 火炮单位回退 / S16 激光 12 采样 / S17 wwWeaponsTick 全武器链。
// 切片边界（挂账）: devWwTruce/devWwResume/devWwEnd L8648-8693（战线域依赖）；statsTick
//   L13568（双侧不记协议）；launchMech L9557（机甲域）。
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
    public class WbWarTests
    {
        private static string FindGolden()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "war.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "war.json"),
                "war.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: war.json");
        }

        private static string F64Hex(double v) => WbRender.F64Hex(v);

        private static void AssertJDeep(JToken got, JToken exp, string what)
            => Assert.That(JToken.DeepEquals(got, exp), Is.True, $"{what}: got={got.ToString(Newtonsoft.Json.Formatting.None)} exp={exp.ToString(Newtonsoft.Json.Formatting.None)}");

        private static JToken NumT(double v)
            => v == Math.Floor(v) && Math.Abs(v) < 9.007199254740992E15 ? (JToken)(long)v : (JToken)v;   // 整值归一（M-U30 教训 f）

        // ---------------- canonical builders（镜像 gen-war.mjs 快照协议） ----------------

        private static JArray RelTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var kv in w.rel) arr.Add(new JArray { kv.Key, F64Hex(kv.Value) });
            return arr;
        }

        private static JArray TensionTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var kv in w.tension) arr.Add(new JArray { kv.Key, NumT(kv.Value) });
            return arr;
        }

        private static JArray WarDataTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var wd in w.warData.Values)
                arr.Add(new JObject
                {
                    ["key"] = wd.key, ["a"] = wd.a, ["b"] = wd.b,
                    ["startTick"] = wd.startTick, ["startYear"] = wd.startYear,
                    ["total"] = wd.total,
                    ["scoreA"] = NumT(wd.scoreA), ["scoreB"] = NumT(wd.scoreB),
                    ["exA"] = NumT(wd.exA), ["exB"] = NumT(wd.exB),
                    ["casA"] = NumT(wd.casA), ["casB"] = NumT(wd.casB),
                    ["razedA"] = NumT(wd.razedA), ["razedB"] = NumT(wd.razedB),
                    ["battles"] = wd.battles,
                    ["giveUpAt"] = wd.giveUpAt,
                    ["reason"] = wd.reason, ["reasonText"] = wd.reasonText,
                    ["aggressor"] = wd.aggressor,
                    ["goal"] = wd.goal, ["goalNow"] = wd.goalNow,
                    ["occA"] = wd.occA, ["occB"] = wd.occB,
                    ["popA0"] = wd.popA0, ["popB0"] = wd.popB0,
                    ["lastActiveTick"] = wd.lastActiveTick,
                });
            return arr;
        }

        private static JArray FxTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var e in w.effects)
                arr.Add(new JObject
                {
                    ["kind"] = e.kind,
                    ["x"] = F64Hex(e.x), ["y"] = F64Hex(e.y),
                    ["x0"] = F64Hex(e.x0), ["y0"] = F64Hex(e.y0),
                    ["r"] = F64Hex(e.r), ["ttl"] = F64Hex(e.ttl),
                    ["age"] = e.age == Math.Floor(e.age) && Math.Abs(e.age) < 9.007199254740992E15 ? (JToken)(long)e.age : (JToken)e.age,
                    ["src"] = e.src.HasValue ? (JToken)e.src.Value : JToken.Parse("null"),
                    ["dmg"] = e.dmg.HasValue ? (JToken)F64Hex(e.dmg.Value) : JToken.Parse("null"),
                    ["fire"] = e.fire.HasValue ? (JToken)e.fire.Value : JToken.Parse("null"),
                    ["wid"] = e.wid.HasValue ? (JToken)e.wid.Value : JToken.Parse("null"),
                    ["col"] = e.colorHex == null ? JToken.Parse("null") : (JToken)e.colorHex,
                    ["nuke"] = e.nuke.HasValue ? NumT(e.nuke.Value) : JToken.Parse("null"),
                    ["quiet"] = e.quiet,
                    ["text"] = e.text == null ? JToken.Parse("null") : (JToken)e.text,
                });
            return arr;
        }

        private static JArray EventsTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var e in w.worldEvents)
                arr.Add(new JObject
                {
                    ["kind"] = e.kind,
                    ["text"] = e.text,
                    ["x"] = e.x.HasValue ? NumT(e.x.Value) : JToken.Parse("null"),
                    ["y"] = e.y.HasValue ? NumT(e.y.Value) : JToken.Parse("null"),
                });
            return arr;
        }

        private static JArray ToastsTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var t in w.toasts) arr.Add(new JObject { ["text"] = t.text, ["tone"] = t.tone });
            return arr;
        }

        private static JArray WeaponsCanonTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (int id in w.emergentWeaponKeys)
                if (w.emergentWeapons.TryGetValue(id, out var r))
                {
                    JToken TOrNull(string k)
                    {
                        var t = r[k];
                        return (t == null || t.Type == JTokenType.Null) ? JToken.Parse("null") : t;
                    }
                    JArray QTf()
                    {
                        var t = r["q"];
                        if (t == null || t.Type == JTokenType.Null) return null;
                        var qa = new JArray();
                        foreach (var e in (JArray)t) qa.Add(F64Hex(e.Value<double>()));
                        return qa;
                    }
                    arr.Add(new JObject
                    {
                        ["id"] = TOrNull("id"), ["civ"] = TOrNull("civ"), ["name"] = TOrNull("name"),
                        ["gen"] = TOrNull("gen"), ["dtype"] = TOrNull("dtype"), ["delivery"] = TOrNull("delivery"),
                        ["dmg"] = F64Hex(r.Value<double>("dmg")), ["radius"] = F64Hex(r.Value<double>("radius")),
                        ["fire"] = F64Hex(r.Value<double>("fire")),
                        ["rad"] = r.Value<bool?>("rad") ?? false, ["terra"] = r.Value<bool?>("terra") ?? false,
                        ["morale"] = TOrNull("morale"), ["wonder"] = r.Value<bool?>("wonder") ?? false,
                        ["kills"] = TOrNull("kills"), ["fired"] = TOrNull("fired"),
                        ["parent"] = TOrNull("parent"), ["parent2"] = TOrNull("parent2"),
                        ["bornYear"] = TOrNull("bornYear"), ["retired"] = r.Value<bool?>("retired") ?? false,
                        ["pl"] = TOrNull("pl"), ["dl"] = TOrNull("dl"), ["gd"] = TOrNull("gd"), ["pw"] = TOrNull("pw"),
                        ["q"] = QTf() == null ? JToken.Parse("null") : (JToken)QTf(),
                        ["inter"] = TOrNull("inter"),
                    });
                }
            return arr;
        }

        private static JObject WorldWarTf(WbWorld w)
        {
            var pop0 = new JArray();
            foreach (var k in w.worldWar.pop0.Keys.OrderBy(x => x)) pop0.Add(new JArray { k.ToString(), w.worldWar.pop0[k] });   // JS Object.keys 字符串键
            var fallen = new JArray();
            foreach (var f in w.worldWar.fallen) fallen.Add(new JArray { f.id, f.name, f.colorHex });
            return new JObject
            {
                ["phase"] = w.worldWar.phase,
                ["startTick"] = w.worldWar.startTick,
                ["startYear"] = w.worldWar.startYear,
                ["endTick"] = w.worldWar.endTick,
                ["belligerents"] = new JArray(w.worldWar.belligerents),
                ["pop0"] = pop0,
                ["kills"] = w.worldWar.kills,
                ["fallen"] = fallen,
                ["truces"] = w.worldWar.truces,
                ["nukes"] = w.worldWar.nukes, ["lasers"] = w.worldWar.lasers,
                ["drones"] = w.worldWar.drones, ["orbitals"] = w.worldWar.orbitals,
                ["plasmas"] = w.worldWar.plasmas, ["antimatters"] = w.worldWar.antimatters,
                ["emerged"] = w.worldWar.emerged,
                ["winner"] = w.worldWar.winner.HasValue ? (JToken)w.worldWar.winner.Value : JToken.Parse("null"),
                ["endText"] = w.worldWar.endText ?? "",
            };
        }

        private static JObject Snapshot(WbWorld w, string opName)
        {
            return new JObject
            {
                ["op"] = opName,
                ["rngA"] = w.rngA.ToString("x8"),
                ["rel"] = RelTf(w),
                ["tension"] = TensionTf(w),
                ["totalWars"] = new JArray(w.totalWars),
                ["met"] = new JArray(w.met),
                ["warHistory"] = new JArray(w.warHistory),
                ["lastDeclareAt"] = new JArray(w.lastDeclareAt.Select(kv => new JArray { kv.Key, kv.Value })),
                ["wwTruce"] = new JArray(w.wwTruce.Select(kv => new JArray { kv.Key, kv.Value })),
                ["warShame"] = new JArray(w.warShame.Select(kv => new JArray { kv.Key, kv.Value })),
                ["warData"] = WarDataTf(w),
                ["fxCount"] = w.effects.Count,
                ["fx"] = FxTf(w),
                ["events"] = EventsTf(w),
                ["toasts"] = ToastsTf(w),
                ["worldWar"] = WorldWarTf(w),
                ["weapons"] = WeaponsCanonTf(w),
                ["gold"] = new JArray(w.civs.Select(c => F64Hex(c.gold ?? 0))),
                ["shake"] = F64Hex(w.shake),
                ["statWars"] = w.statWars,
                ["wwIgniteTick"] = w.wwIgniteTick,
                ["wwLastNukeTick"] = w.wwLastNukeTick,
                ["wwLastAntiTick"] = w.wwLastAntiTick,
                ["wwFrenzyAnnounced"] = w.wwFrenzyAnnounced,
                ["deadCount"] = w.units.Count(u => u.dead != 0),
            };
        }

        // ---------------- 夹具灌注 ----------------

        private static WbWorld BuildScenario(JObject sc)
        {
            WbCivSim.ClearTechModCache();   // 蓝本 per-instance cache（engine L825 generate 清点）——C# static 跨场景清缓存等价
            var w = new WbWorld();
            for (int i = 0; i < w.terrain.Length; i++) w.terrain[i] = WbConstants.T_GRASS;
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            w.laws.wars = sc.Value<bool?>("lawsWars") ?? true;
            var cat = sc["catast"];
            if (cat is JObject co)
            {
                w.lastCatastropheX = co.Value<double?>("x") ?? -1;
                w.lastCatastropheY = co.Value<double?>("y") ?? -1;
                w.lastCatastropheTick = co.Value<long?>("tick") ?? -999999;
            }
            w.wwIgniteTick = sc.Value<long?>("wwIgniteTick0") ?? -400;
            w.wwLastNukeTick = sc.Value<long?>("wwLastNukeTick0") ?? -600;
            w.wwLastAntiTick = sc.Value<long?>("wwLastAntiTick0") ?? -1200;
            w.wwFrenzyAnnounced = sc.Value<long?>("wwFrenzyAnnounced0") ?? -1;
            w.statWars = 0;
            w.toastSeq = 1;
            foreach (var cj in (JArray)sc["civs"])
            {
                var civ = new WbCiv
                {
                    id = cj.Value<int>("id"),
                    name = cj.Value<string>("name"),
                    colorHex = cj.Value<string>("colorHex"),
                    alive = cj.Value<bool?>("alive") ?? true,
                    pop = cj.Value<int?>("pop") ?? 0,
                    gold = cj["gold"] != null && cj["gold"].Type != JTokenType.Null ? cj.Value<double>("gold") : (double?)null,
                    techs = cj["techs"]?.ToObject<List<string>>() ?? new List<string>(),
                    capital = cj.Value<int?>("capital") ?? -1,
                    militarism = cj.Value<double?>("militarism") ?? 30,
                };
                w.civs.Add(civ);
            }
            foreach (var r in (JArray)(sc["rel"] ?? new JArray()))
                w.rel[r[0].Value<string>()] = r[1].Value<double>();
            foreach (var k in (JArray)(sc["met0"] ?? new JArray())) w.met.Add(k.Value<string>());
            foreach (var r in (JArray)(sc["tension0"] ?? new JArray())) w.tension[r[0].Value<string>()] = r[1].Value<double>();
            foreach (var k in (JArray)(sc["totalWars0"] ?? new JArray())) w.totalWars.Add(k.Value<string>());
            foreach (var r in (JArray)(sc["warShame0"] ?? new JArray())) w.warShame[r[0].Value<string>()] = r[1].Value<int>();
            foreach (var v in (JArray)(sc["warHistory0"] ?? new JArray())) w.warHistory.Add(v.Value<int>());
            foreach (var r in (JArray)(sc["lastDeclareAt0"] ?? new JArray())) w.lastDeclareAt[r[0].Value<int>()] = r[1].Value<long>();
            foreach (var r in (JArray)(sc["wwTruce0"] ?? new JArray())) w.wwTruce[r[0].Value<string>()] = r[1].Value<long>();
            foreach (var wd0 in (JArray)(sc["warData0"] ?? new JArray()))
            {
                var o = (JObject)wd0;
                int a = o.Value<int>("a"), b = o.Value<int>("b");
                WbCiv ca = a < w.civs.Count ? w.civs[a] : null;
                WbCiv cb = b < w.civs.Count ? w.civs[b] : null;
                w.warData[o.Value<string>("key")] = new WbWarData
                {
                    key = o.Value<string>("key"), a = a, b = b,
                    startTick = o.Value<int?>("startTick") ?? w.tickCount,
                    startYear = o.Value<int?>("startYear") ?? (int)Math.Floor(w.yearF),
                    total = o.Value<bool?>("total") ?? false,
                    scoreA = o.Value<double?>("scoreA") ?? 0, scoreB = o.Value<double?>("scoreB") ?? 0,
                    reason = o.Value<string>("reason") ?? "border",
                    reasonText = o.Value<string>("reasonText") ?? "",
                    aggressor = o.Value<int?>("aggressor") ?? a,
                    goal = o.Value<int?>("goal") ?? 0,
                    popA0 = o.Value<int?>("popA0") ?? 0, popB0 = o.Value<int?>("popB0") ?? 0,   // gen 协议：预注入行保持显式值（JS ensureWarData 既有行直返不重算）
                    lastActiveTick = o.Value<int?>("lastActiveTick") ?? w.tickCount,
                };
            }
            foreach (var alj in (JArray)(sc["alliances0"] ?? new JArray()))
            {
                var o = (JObject)alj;
                var al = new WbAlliance
                {
                    id = o.Value<int>("id"), name = o.Value<string>("name"),
                    members = o["members"]?.ToObject<List<int>>() ?? new List<int>(),
                    leader = o.Value<int>("leader"), cohesion = o.Value<double>("cohesion"),
                    formedTick = o.Value<long?>("formedTick") ?? 0, formedYear = o.Value<int?>("formedYear") ?? 0,
                    warsTogether = o.Value<int?>("warsTogether") ?? 0, colorHex = o.Value<string>("colorHex"),
                };
                w.alliances.Add(al);
                foreach (var m in al.members) w.allianceOf[m] = al.id;
            }
            foreach (var row in (JArray)(sc["weapons0"] ?? new JArray()))
                WbArmory.WeaponSet(w, row.Value<int>("id"), (JObject)row.DeepClone());
            w.weapSeq = sc.Value<int?>("weapSeq0") ?? 1;
            foreach (var b in (JArray)(sc["buildings0"] ?? new JArray()))
            {
                var bj = (JObject)b;
                w.buildings.Add(new WbBuilding { x = bj.Value<int>("x"), y = bj.Value<int>("y"), civ = bj.Value<int>("civ"), kind = 0 });
            }
            if (sc["worldWar0"] is JObject ww0)
            {
                w.worldWar.phase = ww0.Value<string>("phase");
                w.worldWar.startTick = ww0.Value<int?>("startTick") ?? 0;
                w.worldWar.startYear = ww0.Value<int?>("startYear") ?? 0;
                w.worldWar.endTick = ww0.Value<int?>("endTick") ?? 0;
                w.worldWar.belligerents = ww0["belligerents"]?.ToObject<List<int>>() ?? new List<int>();
                if (ww0["pop0"] is JObject p0)
                    foreach (var kv in p0) w.worldWar.pop0[int.Parse(kv.Key)] = kv.Value.Value<int>();
                w.worldWar.kills = ww0.Value<int?>("kills") ?? 0;
                w.worldWar.truces = ww0.Value<int?>("truces") ?? 0;
                w.worldWar.nukes = ww0.Value<int?>("nukes") ?? 0;
                w.worldWar.lasers = ww0.Value<int?>("lasers") ?? 0;
                w.worldWar.drones = ww0.Value<int?>("drones") ?? 0;
                w.worldWar.orbitals = ww0.Value<int?>("orbitals") ?? 0;
                w.worldWar.plasmas = ww0.Value<int?>("plasmas") ?? 0;
                w.worldWar.antimatters = ww0.Value<int?>("antimatters") ?? 0;
                w.worldWar.emerged = ww0.Value<int?>("emerged") ?? 0;
                w.worldWar.winner = ww0["winner"] != null && ww0["winner"].Type == JTokenType.Integer ? (int?)ww0.Value<int>("winner") : null;
                w.worldWar.endText = ww0.Value<string>("endText") ?? "";
            }
            // spawn 重放（rngA 起流前）
            foreach (var s in (JArray)(sc["spawn"] ?? new JArray()))
            {
                var so = (JObject)s;
                double sx = BitConverter.ToDouble(Convert.FromHexString(so.Value<string>("x")), 0);
                double sy = BitConverter.ToDouble(Convert.FromHexString(so.Value<string>("y")), 0);
                var u = WbBailRelay.SpawnUnit(w, so.Value<int>("race"), sx, sy, new WbBailRelay.WbSpawnOpts
                {
                    silent = true,
                    civ = so["civ"] != null && so["civ"].Type != JTokenType.Null ? (int?)so.Value<int>("civ") : null,
                    job = so.Value<int?>("job") ?? 0,
                    trait = "",
                });
                Assert.That(u, Is.Not.Null, $"spawn 重放 S{sc.Value<string>("key")}");
            }
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        // ---------------- ops 逐步重放 + 每步 canonical 对账 ----------------

        private static void RunScenario(JObject s)
        {
            string key = s.Value<string>("key");
            var w = BuildScenario(s);
            var steps = (JArray)s["steps"];
            int stepIdx = 0;
            foreach (var opT in (JArray)s["ops"])
            {
                var op = (JObject)opT;
                string opName = op.Value<string>("op");
                string stepName;
                switch (opName)
                {
                    case "wt": WbWar.WarTick(w); stepName = "wt"; break;
                    case "wwt": WbWar.WorldWarTick(w); stepName = "wwt"; break;
                    case "endww":
                    {
                        bool winnerNull = op["winner"] == null || op["winner"].Type == JTokenType.Null;
                        WbWar.EndWorldWar(w, winnerNull ? null : w.civs[op.Value<int>("winner")], op.Value<bool?>("divine") ?? false);
                        stepName = winnerNull ? "endww:null" : $"endww:{op.Value<int>("winner")}";
                        break;
                    }
                    case "devww": WbWar.DevUltimateWar(w); stepName = "devww"; break;
                    case "wwalive": WbWar.WwAliveBelligerents(w); stepName = "wwalive"; break;
                    case "fire":
                        WbArmory.FireEmergent(w, w.civs[op.Value<int>("civ")], WbArmory.WeaponGet(w, op.Value<int>("wid")));
                        stepName = $"fire:{op.Value<int>("wid")}";
                        break;
                    case "launch":
                    {
                        var c = w.civs[op.Value<int>("civ")];
                        WbCiv foe = op["foe"] != null && op["foe"].Type != JTokenType.Null ? w.civs[op.Value<int>("foe")] : null;
                        string fn = op.Value<string>("fn");
                        switch (fn)
                        {
                            case "artillery": WbWar.LaunchArtillery(w, c, foe); break;
                            case "airstrike": WbWar.LaunchAirstrike(w, c, op.Value<double>("tx"), op.Value<double>("ty")); break;
                            case "missile": WbWar.LaunchMissile(w, c, op.Value<double>("tx"), op.Value<double>("ty"), op.Value<double?>("nukePower") ?? 0); break;
                            case "laser": WbWar.LaunchLaser(w, c, foe); break;
                            case "drone": WbWar.LaunchDroneSwarm(w, c, op.Value<double>("tx"), op.Value<double>("ty")); break;
                            case "orbital": WbWar.LaunchOrbital(w, c, op.Value<double>("tx"), op.Value<double>("ty")); break;
                            case "plasma": WbWar.LaunchPlasma(w, c, op.Value<double>("tx"), op.Value<double>("ty")); break;
                            case "antimatter": WbWar.LaunchAntimatter(w, c, op.Value<double>("tx"), op.Value<double>("ty")); break;
                            default: throw new AssertionException($"S{key}: 未知 launch {fn}");
                        }
                        stepName = $"launch:{fn}";
                        break;
                    }
                    default: throw new AssertionException($"S{key}: 未知 op {opName}");
                }
                var got = Snapshot(w, stepName);
                AssertJDeep(got, steps[stepIdx], $"S{key} step{stepIdx}({stepName})");
                stepIdx++;
            }
            Assert.That(stepIdx, Is.EqualTo(steps.Count), $"S{key} 步数");
        }

        // ---------------- NUnit 入口 ----------------

        [Test]
        public void Test54_War_GoldenReplay()
        {
            var root = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            var manifest = (JArray)root["meta"]["manifest"];
            Assert.That(manifest.Count, Is.EqualTo(18), "场景数（S1-S18）");
            var scenarios = (JArray)root["scenarios"];
            for (int i = 0; i < manifest.Count; i++)
            {
                var s = (JObject)scenarios[i];
                Assert.That(s.Value<string>("key"), Is.EqualTo(manifest[i].Value<string>()), $"场景序 {i} 对齐 manifest");
                RunScenario(s);
            }
        }

        [Test]
        public void Test55_War_Invariants()
        {
            var root = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            var scenarios = ((JArray)root["scenarios"]).ToDictionary(x => x.Value<string>("key"), x => (JObject)x);

            // S1 神谕止战：rel=30 停战 + totalWars/warData 双清 + peace 事件
            {
                var w = BuildScenario((JObject)scenarios["S1"]);
                WbWar.WarTick(w);
                Assert.That(w.rel["0-1"], Is.EqualTo(30.0), "S1 停战 rel=30");
                Assert.That(w.totalWars.Count, Is.EqualTo(0), "S1 totalWars 清");
                Assert.That(w.warData.Count, Is.EqualTo(0), "S1 warData 清");
            }
            // S3 冻结钳位：max(-96, v-0.5) 两步 -51/-96
            {
                var w = BuildScenario((JObject)scenarios["S3"]);
                WbWar.WarTick(w); WbWar.WarTick(w);
                Assert.That(w.rel["0-1"], Is.EqualTo(-51.0), "S3 两步冻结");
                Assert.That(w.rel["0-2"], Is.EqualTo(-96.0), "S3 钳 -96");
            }
            // S5 宣战全链：warData 建档 + warHistory cap24 + lastDeclareAt 节奏阀 + gold 扣
            {
                var w = BuildScenario((JObject)scenarios["S5"]);
                WbWar.WarTick(w);
                Assert.That(w.warData.Count, Is.EqualTo(1), "S5 warData 建档");
                Assert.That(w.warHistory, Is.EqualTo(new List<int> { 5000 }), "S5 宣战流水");
                Assert.That(w.lastDeclareAt.ContainsKey(0), Is.True, "S5 节奏阀记账");
                Assert.That(w.warData["0-1"].reason, Is.EqualTo("border"), "S5 casus border");
                Assert.That(w.rel["0-1"] < -20, Is.True, "S5 宣战后 rel 跌破 -20");
            }
            // S7 引燃：phase running + belligerents 3 + shake 10 + 三对 totalWars
            {
                var w = BuildScenario((JObject)scenarios["S7"]);
                WbWar.WorldWarTick(w);
                Assert.That(w.worldWar.phase, Is.EqualTo("running"), "S7 引燃");
                Assert.That(w.worldWar.belligerents.Count, Is.EqualTo(3), "S7 全员参战");
                Assert.That(w.shake >= 10.0, Is.True, "S7 shake≥10");
                Assert.That(w.worldWar.pop0.Count, Is.EqualTo(3), "S7 pop0 快照");
            }
            // S9/S10 终局：winner/null 双分支 + wwTruce 清
            {
                var w9 = BuildScenario((JObject)scenarios["S9"]);
                WbWar.WorldWarTick(w9);
                Assert.That(w9.worldWar.phase, Is.EqualTo("ended"), "S9 ended");
                Assert.That(w9.worldWar.winner.Value, Is.EqualTo(0), "S9 winner=0");
                var w10 = BuildScenario((JObject)scenarios["S10"]);
                WbWar.WorldWarTick(w10);
                Assert.That(w10.worldWar.winner.HasValue, Is.False, "S10 同归于尽 null");
            }
            // S12 frenzy 撕裂：同盟 dissolveAlliance 后 alliances 空 + 三对宣战
            {
                var w = BuildScenario((JObject)scenarios["S12"]);
                WbWar.WorldWarTick(w);
                Assert.That(w.alliances.Count, Is.EqualTo(0), "S12 联盟撕裂");
                Assert.That(w.warData.Count, Is.EqualTo(3), "S12 三对互宣");
                Assert.That(w.wwFrenzyAnnounced, Is.EqualTo(4000), "S12 frenzy 去重记账（WW_RUN 默认 startTick）");
            }
            // S17 全武器链：nukes=1 + shell 弹道入 fx
            {
                var w = BuildScenario((JObject)scenarios["S17"]);
                WbWar.WorldWarTick(w); WbWar.WorldWarTick(w);
                Assert.That(w.worldWar.nukes, Is.EqualTo(1), "S17 核弹计数");
                Assert.That(w.effects.Count(e => e.kind == "missile" && e.nuke > 0), Is.EqualTo(1), "S17 核导弹弹道");
                Assert.That(w.effects.Count(e => e.kind == "shell"), Is.EqualTo(2), "S17 火炮弹道双发");
            }
            // launchMissile 核常分叉：nukePower>0 → r=0/dmg=0
            {
                var w = BuildScenario((JObject)scenarios["S14"]);
                WbWar.LaunchMissile(w, w.civs[0], 100.5, 60.5, 1.8);
                var e = w.effects.Last();
                Assert.That(e.kind, Is.EqualTo("missile"));
                Assert.That(e.r, Is.EqualTo(0.0), "核弹头 r=0");
                Assert.That(e.dmg.Value, Is.EqualTo(0.0), "核弹头 dmg=0");
                Assert.That(e.nuke.Value, Is.EqualTo(1.8), "nuke 当量透传");
            }
        }
    }
}
