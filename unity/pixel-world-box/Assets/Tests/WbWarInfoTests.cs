// ============================================================
// WbWarInfoTests.cs — M-U33 warInfoTick 域本体（warInfoTick + sustainOf +
//   warGoalNow/warGoalMet + concludeGoalWar + concludeByScore + touchesOwner +
//   settleFront + makePeace 哨兵出清）黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/warinfo.json（18 场景 det 双跑字节级）
//   由 scripts/unity-migration/gen-warinfo.mjs 生成（真引擎 GameEngine 构造 + 手术式
//   夹具直写〔civ〔gov/mobilizeUntil/stability/expense/houses〕/ rel/totalWars/warShame/
//   wwTruce/warData v2 全字段/alliances/buildings v2 三账/ecoState/season/overlayMode/
//   occ0/owner0/directives0/worldWar 注入〕+ rngA 尾置清零起流 + ops 逐步直调
//   〔wit/settle〕+ 每步快照）。
// 验证链（纪律④）: 黄金向量(真实现) → det 双跑 → 本文件 NUnit C# 全链重放
//   （夹具灌注 → WbWar.WarInfoTick/SettleFront 逐步直调 → WbCivSim.MakePeace/
//   ConcludeByScore/ConcludeGoalWar/SustainOf 消费链）逐位对账。
// 对账面: 每步 rngA + rel（f64hex）+ totalWars/warShame/wwTruce + warData canonical
//   v2（wearA/wearB/sigMark 三态 null）+ fx 全字段 + events + toasts + worldWar 全计数
//   + gold/stab/expense（f64hex）+ houses/tiles/buildings/occ（set+rows）/directives/
//   overlayDirty + statWars。
// 场景册: S19 财政四面 / S20 新战争建档 border+annex / S21 主循环双删 / S22 签名双面 /
//   S23 签名反向+popRatio+razed / S24 联盟厌战 0.85 / S25 大战崩溃停战 wwTruce /
//   S26 武器三连掷门 / S27 concludeByScore 割地全链 / S28 见好就收+旨意双失败 /
//   S29 双高厌战沉寂 / S30 仇恨燎原灭国升级 / S31 目的达成双支 / S32 终局三分支 /
//   S33 total 攻方崩溃 / S34 白平 / S36 brokenIsLoser 零割地 / S35 settleFront 直调。
// 切片边界（挂账）: setFrozen（宿主 UI 态 no-op）；warGoalLabel L7140（面板 UI 域）；
//   noteOccupied/normalizeWarInfo/addWarScore（已译件/存档域）。
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
    public class WbWarInfoTests
    {
        private static string FindGolden()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "warinfo.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "warinfo.json"),
                "warinfo.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: warinfo.json");
        }

        private static string F64Hex(double v) => WbRender.F64Hex(v);

        private static void AssertJDeep(JToken got, JToken exp, string what)
            => Assert.That(JToken.DeepEquals(got, exp), Is.True, $"{what}: got={got.ToString(Newtonsoft.Json.Formatting.None)} exp={exp.ToString(Newtonsoft.Json.Formatting.None)}");

        private static JToken NumT(double v)
            => v == Math.Floor(v) && Math.Abs(v) < 9.007199254740992E15 ? (JToken)(long)v : (JToken)v;   // 整值归一（M-U30 教训 f）

        private static JToken F64OrNull(double? v) => v.HasValue ? (JToken)F64Hex(v.Value) : JToken.Parse("null");

        // ---------------- canonical builders（镜像 gen-warinfo.mjs 快照协议） ----------------

        private static JArray RelTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var kv in w.rel) arr.Add(new JArray { kv.Key, F64Hex(kv.Value) });
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
                    ["wearA"] = F64OrNull(wd.wearA), ["wearB"] = F64OrNull(wd.wearB),
                    ["sigMark"] = F64OrNull(wd.sigMark),
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

        private static JArray BuildingsTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var b in w.buildings)
                arr.Add(new JObject { ["i"] = b.i, ["x"] = b.x, ["y"] = b.y, ["kind"] = b.kind, ["civ"] = b.civ });
            return arr;
        }

        private static JObject OccTf(WbWorld w)
        {
            var set = new JArray(w.occSet.OrderBy(x => x));
            var rows = new JArray();
            foreach (var i in w.occSet.OrderBy(x => x))
                rows.Add(new JArray { i, (int)w.occCiv[i], (int)w.occStr[i] });
            return new JObject { ["set"] = set, ["rows"] = rows };
        }

        private static JArray DirectivesTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var d in w.directives)
                arr.Add(new JObject
                {
                    ["id"] = d.id, ["civ"] = d.civ, ["kind"] = d.kind,
                    ["target"] = d.target.HasValue ? (JToken)d.target.Value : JToken.Parse("null"),
                    ["param"] = d.param, ["status"] = d.status,
                    ["startTick"] = d.startTick, ["deadlineTick"] = d.deadlineTick,
                    ["text"] = d.text,
                    ["endTick"] = d.endTick.HasValue ? (JToken)d.endTick.Value : JToken.Parse("null"),
                    ["endText"] = d.endText == null ? JToken.Parse("null") : (JToken)d.endText,
                });
            return arr;
        }

        private static JObject Snapshot(WbWorld w, string opName)
        {
            return new JObject
            {
                ["op"] = opName,
                ["rngA"] = w.rngA.ToString("x8"),
                ["rel"] = RelTf(w),
                ["totalWars"] = new JArray(w.totalWars),
                ["warShame"] = new JArray(w.warShame.Select(kv => new JArray { kv.Key, kv.Value })),
                ["wwTruce"] = new JArray(w.wwTruce.Select(kv => new JArray { kv.Key, kv.Value })),
                ["warData"] = WarDataTf(w),
                ["fxCount"] = w.effects.Count,
                ["fx"] = FxTf(w),
                ["events"] = EventsTf(w),
                ["toasts"] = ToastsTf(w),
                ["worldWar"] = WorldWarTf(w),
                ["gold"] = new JArray(w.civs.Select(c => F64Hex(c.gold ?? 0))),
                ["stab"] = new JArray(w.civs.Select(c => F64Hex(c.stability))),
                ["expense"] = new JArray(w.civs.Select(c => F64Hex(c.expense))),
                ["houses"] = new JArray(w.civs.Select(c => (JToken)c.houses)),
                ["tiles"] = new JArray(w.civs.Select(c => new JArray(c.tiles.OrderBy(x => x)))),
                ["buildings"] = BuildingsTf(w),
                ["occ"] = OccTf(w),
                ["directives"] = DirectivesTf(w),
                ["overlayDirty"] = w.overlayDirty,
                ["statWars"] = w.statWars,
            };
        }

        // ---------------- 夹具灌注 ----------------

        private static WbWorld BuildScenario(JObject sc)
        {
            WbCivSim.ClearTechModCache();   // 蓝本 per-instance cache（engine L825 generate 清点）——C# static 跨场景清缓存等价
            var w = new WbWorld();
            for (int i = 0; i < w.terrain.Length; i++) w.terrain[i] = WbConstants.T_GRASS;
            for (int i = 0; i < w.owner.Length; i++) w.owner[i] = -1;
            for (int i = 0; i < w.building.Length; i++) w.building[i] = 0;
            for (int i = 0; i < w.occCiv.Length; i++) w.occCiv[i] = -1;
            w.bIdx.Clear();
            w.occSet.Clear();
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            w.laws.wars = sc.Value<bool?>("lawsWars") ?? true;
            w.statWars = 0;
            w.toastSeq = 1;
            w.overlayDirty = false;
            w.overlayMode = sc.Value<string>("overlayMode0") ?? "none";
            w.ecoState = sc.Value<string>("ecoState0") ?? "balanced";
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
                    gov = cj.Value<int?>("gov") ?? 0,
                    mobilizeUntil = cj["mobilizeUntil"] != null && cj["mobilizeUntil"].Type != JTokenType.Null ? cj.Value<double>("mobilizeUntil") : (double?)null,
                    stability = cj.Value<double?>("stability") ?? 70,
                    expense = cj.Value<double?>("expense") ?? 0,
                    houses = cj.Value<int?>("houses") ?? 0,
                };
                foreach (var t in (JArray)(cj["tiles"] ?? new JArray())) civ.tiles.Add(t.Value<int>());
                w.civs.Add(civ);
            }
            foreach (var r in (JArray)(sc["rel"] ?? new JArray()))
                w.rel[r[0].Value<string>()] = r[1].Value<double>();
            foreach (var k in (JArray)(sc["totalWars0"] ?? new JArray())) w.totalWars.Add(k.Value<string>());
            foreach (var r in (JArray)(sc["warShame0"] ?? new JArray())) w.warShame[r[0].Value<string>()] = r[1].Value<int>();
            foreach (var r in (JArray)(sc["wwTruce0"] ?? new JArray())) w.wwTruce[r[0].Value<string>()] = r[1].Value<long>();
            foreach (var wd0 in (JArray)(sc["warData0"] ?? new JArray()))
            {
                var o = (JObject)wd0;
                int a = o.Value<int>("a"), b = o.Value<int>("b");
                w.warData[o.Value<string>("key")] = new WbWarData
                {
                    key = o.Value<string>("key"), a = a, b = b,
                    startTick = o.Value<int?>("startTick") ?? w.tickCount,
                    startYear = o.Value<int?>("startYear") ?? (int)Math.Floor(w.yearF),
                    total = o.Value<bool?>("total") ?? false,
                    scoreA = o.Value<double?>("scoreA") ?? 0, scoreB = o.Value<double?>("scoreB") ?? 0,
                    exA = o.Value<double?>("exA") ?? 0, exB = o.Value<double?>("exB") ?? 0,
                    casA = o.Value<double?>("casA") ?? 0, casB = o.Value<double?>("casB") ?? 0,
                    razedA = o.Value<double?>("razedA") ?? 0, razedB = o.Value<double?>("razedB") ?? 0,
                    battles = o.Value<int?>("battles") ?? 0,
                    giveUpAt = o.Value<int?>("giveUpAt") ?? 0,
                    reason = o.Value<string>("reason") ?? "border",
                    reasonText = o.Value<string>("reasonText") ?? "",
                    aggressor = o.Value<int?>("aggressor") ?? a,
                    goal = o.Value<int?>("goal") ?? 0,
                    occA = o.Value<int?>("occA") ?? 0, occB = o.Value<int?>("occB") ?? 0,
                    popA0 = o.Value<int?>("popA0") ?? 0, popB0 = o.Value<int?>("popB0") ?? 0,
                    lastActiveTick = o.Value<int?>("lastActiveTick") ?? w.tickCount,
                    wearA = o["wearA"] != null && o["wearA"].Type != JTokenType.Null ? (double?)o.Value<double>("wearA") : null,
                    wearB = o["wearB"] != null && o["wearB"].Type != JTokenType.Null ? (double?)o.Value<double>("wearB") : null,
                    sigMark = o["sigMark"] != null && o["sigMark"].Type != JTokenType.Null ? (double?)o.Value<double>("sigMark") : null,
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
            foreach (var bj in (JArray)(sc["buildings0"] ?? new JArray()))
            {
                var o = (JObject)bj;
                int x = o.Value<int>("x"), y = o.Value<int>("y");
                int t = y * WbWorld.W + x;
                w.building[t] = (byte)o.Value<int>("kind");
                w.bIdx[t] = w.buildings.Count;
                w.buildings.Add(new WbBuilding { i = t, x = x, y = y, kind = o.Value<int>("kind"), civ = o.Value<int>("civ") });
            }
            foreach (var r in (JArray)(sc["occ0"] ?? new JArray()))
            {
                int i = r[0].Value<int>();
                w.occCiv[i] = (sbyte)r[1].Value<int>();
                w.occStr[i] = (byte)r[2].Value<int>();
                w.occSet.Add(i);
            }
            foreach (var r in (JArray)(sc["owner0"] ?? new JArray()))
                w.owner[r[0].Value<int>()] = (short)r[1].Value<int>();
            foreach (var dj in (JArray)(sc["directives0"] ?? new JArray()))
            {
                var o = (JObject)dj;
                w.directives.Add(new WbDirective
                {
                    id = o.Value<int>("id"), civ = o.Value<int>("civ"), kind = o.Value<string>("kind"),
                    target = o["target"] != null && o["target"].Type != JTokenType.Null ? (int?)o.Value<int>("target") : null,
                    param = o.Value<int?>("param") ?? 0,
                    status = o.Value<string>("status"),
                    startTick = o.Value<int?>("startTick") ?? 0,
                    deadlineTick = o.Value<int?>("deadlineTick") ?? 0,
                    text = o.Value<string>("text") ?? "",
                });
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
                    case "wit": WbWar.WarInfoTick(w); stepName = "wit"; break;
                    case "settle":
                        WbWar.SettleFront(w, op.Value<int>("a"), op.Value<int>("b"));
                        stepName = $"settle:{op.Value<int>("a")},{op.Value<int>("b")}";
                        break;
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
        public void Test56_WarInfo_GoldenReplay()
        {
            var root = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            var manifest = (JArray)root["meta"]["manifest"];
            Assert.That(manifest.Count, Is.EqualTo(18), "场景数（S19-S36）");
            var scenarios = (JArray)root["scenarios"];
            for (int i = 0; i < manifest.Count; i++)
            {
                var s = (JObject)scenarios[i];
                Assert.That(s.Value<string>("key"), Is.EqualTo(manifest[i].Value<string>()), $"场景序 {i} 对齐 manifest");
                RunScenario(s);
            }
        }

        [Test]
        public void Test57_WarInfo_Invariants()
        {
            var root = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            var scenarios = ((JArray)root["scenarios"]).ToDictionary(x => x.Value<string>("key"), x => (JObject)x);

            // S19 战争财政：gold 扣 + expense 记账 + 破产 stability -0.8 + pop0/非交战 skip
            {
                var w = BuildScenario((JObject)scenarios["S19"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.civs[0].gold.Value, Is.EqualTo(35.0), "S19 gold 40-5");
                Assert.That(w.civs[0].expense, Is.EqualTo(5.0), "S19 expense 5");
                Assert.That(w.civs[2].gold.Value, Is.EqualTo(0.0), "S19 破产 gold=0");
                Assert.That(w.civs[2].stability, Is.EqualTo(69.2).Within(1e-9), "S19 stability -0.8");
                Assert.That(w.civs[3].gold.Value, Is.EqualTo(9.0), "S19 pop0 skip");
                Assert.That(w.civs[4].gold.Value, Is.EqualTo(10.0), "S19 非交战 skip");
            }
            // S20 新战争建档：border/annex 分支 + aggressor by pop + statWars + 签名首进 rel-2
            {
                var w = BuildScenario((JObject)scenarios["S20"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.warData["0-1"].reason, Is.EqualTo("border"), "S20 border 补档");
                Assert.That(w.warData["0-2"].reason, Is.EqualTo("annex"), "S20 annex 深仇");
                Assert.That(w.warData["0-2"].total, Is.True, "S20 annex total");
                Assert.That(w.totalWars.Contains("0-2"), Is.True, "S20 totalWars 记账");
                Assert.That(w.statWars, Is.EqualTo(2), "S20 statWars 双档");
                Assert.That(w.rel["0-1"], Is.EqualTo(-32.0), "S20 签名首进 rel-2");
                Assert.That(w.warData["0-1"].reasonText, Does.Contain("边境土地纠葛"), "S20 casusText 原文");
            }
            // S21 主循环双删：死国删 + rel≥-20 停战删
            {
                var w = BuildScenario((JObject)scenarios["S21"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.warData.Count, Is.EqualTo(0), "S21 warData 双删");
            }
            // S22 签名双面：sigMark 缺省首进 gained0 / 预载 gained5 kw1 厌战方向
            {
                var w = BuildScenario((JObject)scenarios["S22"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.warData["0-1"].sigMark.Value, Is.EqualTo(15.0), "S22 sigMark 定基");
                Assert.That(w.warData["0-2"].sigMark.Value, Is.EqualTo(15.0), "S22 sigMark 更新");
                Assert.That(w.warData["0-2"].wearB.Value, Is.EqualTo(3.4).Within(1e-9), "S22 wearB +1.2+2.2");
                Assert.That(w.rel["0-1"], Is.EqualTo(-52.0), "S22 rel-2 双键");
            }
            // S25 大战崩溃停战：wwTruce 5600 + truces 1 + rel 5
            {
                var w = BuildScenario((JObject)scenarios["S25"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.warData.Count, Is.EqualTo(0), "S25 停战删档");
                Assert.That(w.wwTruce["0-1"], Is.EqualTo(5600L), "S25 wwTruce 记账");
                Assert.That(w.worldWar.truces, Is.EqualTo(1), "S25 truces 计数");
                Assert.That(w.rel["0-1"], Is.EqualTo(5.0), "S25 postRel 5");
            }
            // S26 武器三连掷门：arty 发射 shell 弹道 + laser/drone 门拒
            {
                var w = BuildScenario((JObject)scenarios["S26"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.effects.Count(e => e.kind == "shell"), Is.EqualTo(1), "S26 火炮弹道");
                Assert.That(w.effects.Count(e => e.kind == "laser" || e.kind == "drone"), Is.EqualTo(0), "S26 laser/drone 门拒");
            }
            // S27 concludeByScore：割地 4 格 + 建筑转帜 + houses 账 + overlayDirty
            {
                var w = BuildScenario((JObject)scenarios["S27"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.civs[0].tiles.Count, Is.EqualTo(6), "S27 割地 4 格入账");
                Assert.That(w.civs[0].houses, Is.EqualTo(1), "S27 房屋转帜");
                Assert.That(w.civs[1].houses, Is.EqualTo(0), "S27 塔毁 houses--");
                Assert.That(w.buildings.Count, Is.EqualTo(1), "S27 swap-pop 删塔");
                Assert.That(w.overlayDirty, Is.True, "S27 political overlay 脏标");
                Assert.That(w.warShame["0-1"], Is.EqualTo(1), "S27 耻辱簿");
            }
            // S30 仇恨燎原：annex 升级 + giveUpAt 8600 + totalWars
            {
                var w = BuildScenario((JObject)scenarios["S30"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.warData["0-1"].total, Is.True, "S30 total 升级");
                Assert.That(w.warData["0-1"].giveUpAt, Is.EqualTo(8600), "S30 giveUpAt +3600");
                Assert.That(w.warData["0-1"].reasonText, Does.Contain("灭国战争"), "S30 annex 檄文");
            }
            // S32 终局三分支：rel -5/10/8 三态
            {
                var w = BuildScenario((JObject)scenarios["S32"]);
                WbWar.WarInfoTick(w);
                Assert.That(w.rel["0-1"], Is.EqualTo(-5.0), "S32 灭国放弃 rel-5");
                Assert.That(w.rel["0-2"], Is.EqualTo(10.0), "S32 劳师糜饷 rel10");
                Assert.That(w.rel["1-2"], Is.EqualTo(8.0), "S32 世代期限 rel8");
            }
            // S35 settleFront：割让 1 + 归还 2 + frontSolidify score/occ 入账
            {
                var w = BuildScenario((JObject)scenarios["S35"]);
                WbWar.SettleFront(w, 0, 1);
                Assert.That(w.occSet.Count, Is.EqualTo(0), "S35 占领层清空");
                Assert.That(w.owner[12850], Is.EqualTo(0), "S35 割让易帜");
                Assert.That(w.civs[0].tiles, Does.Contain(12850), "S35 tiles 入账");
                Assert.That(w.warData["0-1"].scoreA, Is.EqualTo(1.0), "S35 scoreA+1");
                Assert.That(w.warData["0-1"].occA, Is.EqualTo(1), "S35 occA+1");
            }
            // sustainOf 直调面：全项加减 + 钳 [0,100]（S25 状态直演——gov4/mobilize/season3/eco collapse）
            //   wd 引用先取（ww 崩溃支路 makePeace 删档后 stale 引用仍可算——蓝本对象语义）
            {
                var w = BuildScenario((JObject)scenarios["S25"]);
                var wd = w.warData["0-1"];
                WbWar.WarInfoTick(w);
                double sA = WbWar.SustainOf(w, w.civs[0], wd, true);
                double sB = WbWar.SustainOf(w, w.civs[1], wd, false);
                Assert.That(sA, Is.EqualTo(82.15).Within(1e-9), "S25 sustainOf 支撑面全项");
                Assert.That(sB, Is.EqualTo(0.0), "S25 sustainOf 钳 0 下限");
            }
        }
    }
}
