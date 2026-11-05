// ============================================================
// WbEmergentFireTests.cs — M-U31 发射面（fireEmergent + emergentPayload + wwCountKill）黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/emergentfire.json（14 场景 det 双跑字节级）
//   由 scripts/unity-migration/gen-emergentfire.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔civ/rel/武器行/学说/防御/军团/建筑/worldWar 注入 + spawnUnit 真调用〕+
//   rngA 尾置清零起流 + ops 逐步直调〔fireEmergent/emergentPayload/wwCountKill〕+ 每步快照）。
// 验证链（纪律④）: 黄金向量(真实现) → det 双跑 → 本文件 NUnit C# 全链重放
//   （夹具灌注 → SpawnUnit 重放 → 注入 → WbArmory/WbCivSim 逐步直调）逐位对账 → 网页 parity。
// 对账面: 每步 rngA + weapons 行 canonical（f64hex + 可选字段归一）+ doctrines/defenses
//   （f64hex + 插入序镜像）+ weapSeq + fx 全字段（kind/x/y/x0/y0/r/ttl/age/src/dmg/fire/
//   wid/col/nuke/quiet/text——发射面扩协议）+ events（kind/text/x/y）+ armies（civ/x/y/
//   morale）+ worldWar（phase/kills/emerged/belligerents）+ killCredit + radWindow 切片 +
//   radSet（tile→at）+ burntCount（焦土计数）。
// 场景册: S1 no-foes / S2 army 门未中→capital 突防 / S3 capital+ww emerged / S4 building
//   回退 / S5 no-target / S6 拦截+突防混合（explosion+spark 中段烟花 / inter 反馈 / def
//   钳 cap） / S7 wonder 播报门 / S8 multi-foes+army 真命中 / S9 rad 辐射环+无效 wid 早退 /
//   S10 terra 焦土（rng<0.7 掷/tile） / S11 morale 崩落（src 豁免/下限 5） / S12 wwkill
//   反馈四支路+双钳 0.95+q[0] 钳 1.4 / S13 全链 fire→payload→wwKill / S14 死国学说保护。
// DIVERGENCE（M-U31 入档）: ①e.r ?? w.radius 的 undefined 态生产面不可达（fx 构造 r 恒
//   数字——WbFx.r 非 null 直用）；②a.morale ?? 60 同理（armies 构建面恒写 morale）。
// 切片边界（挂账）: warTick L8049 / worldWarTick L8616 两处 fireEmergent 生产者调用点未
//   接线（warTick/worldWarTick 域本体未译——域切片时随件）。
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
    public class WbEmergentFireTests
    {
        private static string FindGolden()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "emergentfire.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "emergentfire.json"),
                "emergentfire.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: emergentfire.json");
        }

        private static string F64Hex(double v) => WbRender.F64Hex(v);   // 小写 16 字符 LE —— JS f64hex 同构

        private static void AssertJDeepTf(JToken got, JToken exp, string what)
            => Assert.That(JToken.DeepEquals(got, exp), Is.True, $"{what}: got={got.ToString(Newtonsoft.Json.Formatting.None)} exp={exp.ToString(Newtonsoft.Json.Formatting.None)}");

        // ---------------- canonical builders（镜像 gen-emergentfire.mjs 快照协议） ----------------

        private static JObject WeaponCanonTf(JObject row)
        {
            JToken TOrNull(JObject r, string k)
            {
                var t = r[k];
                return (t == null || t.Type == JTokenType.Null) ? JToken.Parse("null") : t;
            }
            JArray QTf(JObject r)
            {
                var t = r["q"];
                if (t == null || t.Type == JTokenType.Null) return null;
                var arr = new JArray();
                foreach (var e in (JArray)t) arr.Add(F64Hex(e.Value<double>()));
                return arr;
            }
            return new JObject
            {
                ["id"] = TOrNull(row, "id"),
                ["civ"] = TOrNull(row, "civ"),
                ["name"] = TOrNull(row, "name"),
                ["gen"] = TOrNull(row, "gen"),
                ["dtype"] = TOrNull(row, "dtype"),
                ["delivery"] = TOrNull(row, "delivery"),
                ["dmg"] = F64Hex(row.Value<double>("dmg")),
                ["radius"] = F64Hex(row.Value<double>("radius")),
                ["fire"] = F64Hex(row.Value<double>("fire")),
                ["rad"] = row.Value<bool?>("rad") ?? false,
                ["terra"] = row.Value<bool?>("terra") ?? false,
                ["morale"] = TOrNull(row, "morale"),
                ["wonder"] = row.Value<bool?>("wonder") ?? false,
                ["kills"] = TOrNull(row, "kills"),
                ["fired"] = TOrNull(row, "fired"),
                ["parent"] = TOrNull(row, "parent"),
                ["parent2"] = TOrNull(row, "parent2"),
                ["bornYear"] = TOrNull(row, "bornYear"),
                ["retired"] = row.Value<bool?>("retired") ?? false,
                ["pl"] = TOrNull(row, "pl"),
                ["dl"] = TOrNull(row, "dl"),
                ["gd"] = TOrNull(row, "gd"),
                ["pw"] = TOrNull(row, "pw"),
                ["q"] = QTf(row),
                ["inter"] = TOrNull(row, "inter"),
            };
        }

        private static JArray WeaponsCanonTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var row in WbArmory.WeaponValues(w)) arr.Add(WeaponCanonTf(row));
            return arr;
        }

        private static JArray DoctrineCanonTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (int id in w.doctrinesKeys)
                if (w.doctrines.TryGetValue(id, out var d))
                    arr.Add(new JArray { id, F64Hex(d.precision), F64Hex(d.saturation), F64Hex(d.terror), F64Hex(d.attrition) });
            return arr;
        }

        private static JArray DefenseCanonTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (int id in w.defensesKeys)
                if (w.defenses.TryGetValue(id, out var d))
                    arr.Add(new JArray { id, F64Hex(d.point), F64Hex(d.armor), F64Hex(d.evade) });
            return arr;
        }

        /// <summary>fx 全字段 canonical（M-U31 发射面扩协议：extras x0/y0/src/dmg/fire/wid/col）</summary>
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
                    ["age"] = e.age == Math.Floor(e.age) && Math.Abs(e.age) < 9.007199254740992E15 ? (JToken)(long)e.age : (JToken)e.age,   // 整值归一（M-U30 教训 f——JS JSON 整值 Integer）
                    ["src"] = e.src.HasValue ? (JToken)e.src.Value : JToken.Parse("null"),
                    ["dmg"] = e.dmg.HasValue ? (JToken)F64Hex(e.dmg.Value) : JToken.Parse("null"),
                    ["fire"] = e.fire.HasValue ? (JToken)e.fire.Value : JToken.Parse("null"),
                    ["wid"] = e.wid.HasValue ? (JToken)e.wid.Value : JToken.Parse("null"),
                    ["col"] = e.colorHex == null ? JToken.Parse("null") : (JToken)e.colorHex,
                    ["nuke"] = e.nuke.HasValue ? (JToken)e.nuke.Value : JToken.Parse("null"),
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
                    ["x"] = e.x.HasValue ? (JToken)e.x.Value : JToken.Parse("null"),
                    ["y"] = e.y.HasValue ? (JToken)e.y.Value : JToken.Parse("null"),
                });
            return arr;
        }

        private static JArray ArmiesTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var a in w.armies)
                arr.Add(new JObject { ["civ"] = a.civ, ["x"] = F64Hex(a.x), ["y"] = F64Hex(a.y), ["morale"] = F64Hex(a.morale) });
            return arr;
        }

        private static JObject WorldWarTf(WbWorld w)
            => new JObject
            {
                ["phase"] = w.worldWar.phase,
                ["kills"] = w.worldWar.kills,
                ["emerged"] = w.worldWar.emerged,
                ["belligerents"] = new JArray(w.worldWar.belligerents),
            };

        /// <summary>观察窗切片（radWindow [x0,y0,x1,y1] —— W=256 常量基，镜像 gen windowSlice）</summary>
        private static JArray RadWindowTf(WbWorld w, JArray radWindow)
        {
            var arr = new JArray();
            int x0 = radWindow[0].Value<int>(), y0 = radWindow[1].Value<int>(), x1 = radWindow[2].Value<int>(), y1 = radWindow[3].Value<int>();
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                    arr.Add(w.radiate[y * WbWorld.W + x]);
            return arr;
        }

        private static JArray RadSetTf(WbWorld w)
        {
            var keys = w.radSet.Keys.ToList();
            keys.Sort();
            var arr = new JArray();
            foreach (int i in keys) arr.Add(new JArray { i, w.radSet[i] });
            return arr;
        }

        private static int BurntCountTf(WbWorld w, JArray radWindow)
        {
            int x0 = radWindow[0].Value<int>(), y0 = radWindow[1].Value<int>(), x1 = radWindow[2].Value<int>(), y1 = radWindow[3].Value<int>();
            int n = 0;
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                    if (w.terrain[y * WbWorld.W + x] == WbConstants.T_BURNT) n++;
            return n;
        }

        private static JObject Snapshot(WbWorld w, string opName, JArray radWindow)
        {
            return new JObject
            {
                ["op"] = opName,
                ["rngA"] = w.rngA.ToString("x8"),
                ["weapons"] = WeaponsCanonTf(w),
                ["weapSeq"] = w.weapSeq,
                ["doctrines"] = DoctrineCanonTf(w),
                ["defenses"] = DefenseCanonTf(w),
                ["fxCount"] = w.effects.Count,
                ["fx"] = FxTf(w),
                ["events"] = EventsTf(w),
                ["armies"] = ArmiesTf(w),
                ["worldWar"] = WorldWarTf(w),
                ["killCredit"] = w.killCredit.HasValue ? (JToken)w.killCredit.Value : JToken.Parse("null"),
                ["radWindow"] = radWindow == null ? JToken.Parse("null") : (JToken)RadWindowTf(w, radWindow),
                ["radSet"] = RadSetTf(w),
                ["burntCount"] = radWindow == null ? JToken.Parse("null") : (JToken)BurntCountTf(w, radWindow),
            };
        }

        // ---------------- 夹具灌注 + ops 重放 ----------------

        /// <summary>C# 全链重放：夹具灌注 → SpawnUnit 重放（rngA 起流前）→ 军团/世界战注入</summary>
        private static WbWorld BuildScenario(JObject sc)
        {
            var w = new WbWorld();
            for (int i = 0; i < w.terrain.Length; i++) w.terrain[i] = WbConstants.T_GRASS;   // 手术一：terrain 基面 GRASS（gen 同构——默认 0=T_DEEP 深海，IsLand 门恒假）
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            foreach (var c in (JArray)sc["civs"])
            {
                var cj = (JObject)c;
                var civ = new WbCiv
                {
                    id = cj.Value<int>("id"),
                    name = cj.Value<string>("name"),
                    colorHex = cj.Value<string>("colorHex"),
                    alive = cj.Value<bool?>("alive") ?? true,
                    pop = cj.Value<int?>("pop") ?? 0,
                    gold = cj["gold"] != null && cj["gold"].Type != JTokenType.Null ? cj.Value<double>("gold") : (double?)null,
                    techs = cj["techs"]?.ToObject<List<string>>() ?? new List<string>(),
                    capital = cj["capital"] != null && cj["capital"].Type != JTokenType.Integer ? -1 : (cj["capital"]?.Type == JTokenType.Integer ? cj.Value<int>("capital") : -1),
                };
                if (cj["capital"] != null && cj["capital"].Type == JTokenType.Integer) civ.capital = cj.Value<int>("capital");
                w.civs.Add(civ);
            }
            foreach (var r in (JArray)sc["rel"])
                w.rel[r[0].Value<string>()] = r[1].Value<double>();
            foreach (var row in (JArray)sc["weapons0"])
                WbArmory.WeaponSet(w, row.Value<int>("id"), (JObject)row.DeepClone());
            w.weapSeq = sc.Value<int?>("weapSeq0") ?? 1;
            foreach (var row in (JArray)sc["doctrines0"])
                WbArmory.DoctrineSet(w, row[0].Value<int>(), new WbWorld.WbDoctrine
                {
                    precision = row[1].Value<double>(), saturation = row[2].Value<double>(),
                    terror = row[3].Value<double>(), attrition = row[4].Value<double>(),
                });
            foreach (var row in (JArray)sc["defenses0"])
                WbArmory.DefenseSet(w, row[0].Value<int>(), new WbWorld.WbDefense
                {
                    point = row[1].Value<double>(), armor = row[2].Value<double>(), evade = row[3].Value<double>(),
                });
            foreach (var b in (JArray)(sc["buildings0"] ?? new JArray()))
            {
                var bj = (JObject)b;
                w.buildings.Add(new WbBuilding { x = bj.Value<int>("x"), y = bj.Value<int>("y"), civ = bj.Value<int>("civ"), kind = 0 });
            }
            if (sc["worldWar0"] is JObject ww0)
            {
                w.worldWar.phase = ww0.Value<string>("phase");
                w.worldWar.kills = ww0.Value<int?>("kills") ?? 0;
                w.worldWar.emerged = ww0.Value<int?>("emerged") ?? 0;
                w.worldWar.belligerents = ww0["belligerents"]?.ToObject<List<int>>() ?? new List<int>();
            }
            // spawn 重放（rngA 起流前——掷数不入结算链）
            var spawnIds = new List<int>();
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
                    trait = so["trait"] != null && so["trait"].Type == JTokenType.String ? so.Value<string>("trait") : "",
                });
                Assert.That(u, Is.Not.Null, $"spawn 重放 S{sc.Value<string>("key")}");
                spawnIds.Add(u.id);
            }
            // 军团注入（spawn 后置——members 'spawn:N' 引用解析；镜像 gen buildScenario 后置协议）
            foreach (var a in (JArray)(sc["armies0"] ?? new JArray()))
            {
                var aj = (JObject)a;
                var members = new List<int>();
                foreach (var m in (JArray)(aj["members"] ?? new JArray()))
                {
                    if (m.Type == JTokenType.String && m.Value<string>().StartsWith("spawn:"))
                        members.Add(spawnIds[int.Parse(m.Value<string>().Substring(6))]);
                    else
                        members.Add(m.Value<int>());
                }
                w.armies.Add(new WbArmy
                {
                    id = aj.Value<int>("id"),
                    civ = aj.Value<int>("civ"),
                    name = aj.Value<string>("name") ?? $"军团{aj.Value<int>("id")}",
                    members = members,
                    leaderId = -1,
                    x = aj.Value<double>("x"), y = aj.Value<double>("y"),
                    tx = aj.Value<double>("x"), ty = aj.Value<double>("y"),
                    state = "rally",
                    morale = aj.Value<double?>("morale") ?? 60,
                    size0 = members.Count,
                });
            }
            // rngA 尾置起流（gen 协议）
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        /// <summary>ops 逐步重放 + 每步 canonical 对账</summary>
        private static void RunScenario(JObject s)
        {
            string key = s.Value<string>("key");
            var w = BuildScenario(s);
            JArray radWindow = s["radWindow"] as JArray;
            var steps = (JArray)s["steps"];
            int stepIdx = 0;
            foreach (var opT in (JArray)s["ops"])
            {
                var op = (JObject)opT;
                string opName = op.Value<string>("op");
                switch (opName)
                {
                    case "fire":
                        WbArmory.FireEmergent(w, w.civs[op.Value<int>("civ")], WbArmory.WeaponGet(w, op.Value<int>("wid")));
                        break;
                    case "payload":
                    {
                        var e = new WbFx
                        {
                            kind = op["fxKind"]?.Type == JTokenType.String ? op.Value<string>("fxKind") : "bolt",
                            x = op.Value<double>("x"), y = op.Value<double>("y"),
                            x0 = op.Value<double>("x"), y0 = op.Value<double>("y"),
                            r = op["r"] != null && op["r"].Type != JTokenType.Null ? op.Value<double>("r") : 1,
                            age = 0, ttl = op.Value<double?>("ttl") ?? 60, seed = 0, dir = 0,
                            wid = op["wid"] != null && op["wid"].Type != JTokenType.Null ? (int?)op.Value<int>("wid") : null,
                            src = op["src"] != null && op["src"].Type != JTokenType.Null ? (int?)op.Value<int>("src") : null,
                            dmg = op["dmg"] != null && op["dmg"].Type != JTokenType.Null ? (double?)op.Value<double>("dmg") : null,
                        };
                        WbArmory.EmergentPayload(w, e);
                        break;
                    }
                    case "wwKill":
                    {
                        if (op["killCredit"] != null && op["killCredit"].Type != JTokenType.Null)
                            w.killCredit = op.Value<int>("killCredit");
                        WbU victim;
                        if (op["victimUnit"] != null && op.Value<string>("victimUnit") == "spawn")
                            victim = w.units[op.Value<int?>("spawnIdx") ?? 0];
                        else
                            victim = new WbU { civ = op.Value<int?>("victimCiv") ?? -1, hp = 0, dead = 1 };
                        WbCivSim.WwCountKill(w, victim);
                        break;
                    }
                    case "killClear":
                        w.killCredit = null;
                        break;
                    default:
                        throw new AssertionException($"未知 op {opName}");
                }
                var exp = (JObject)steps[stepIdx++];
                var got = Snapshot(w, opName, radWindow);
                AssertJDeepTf(got["rngA"], exp["rngA"], $"{key} {opName} rngA");
                AssertJDeepTf(got["weapons"], exp["weapons"], $"{key} {opName} weapons");
                Assert.That(w.weapSeq, Is.EqualTo(exp.Value<int>("weapSeq")), $"{key} {opName} weapSeq");
                AssertJDeepTf(got["doctrines"], exp["doctrines"], $"{key} {opName} doctrines");
                AssertJDeepTf(got["defenses"], exp["defenses"], $"{key} {opName} defenses");
                Assert.That(w.effects.Count, Is.EqualTo(exp.Value<int>("fxCount")), $"{key} {opName} fxCount");
                AssertJDeepTf(got["fx"], exp["fx"], $"{key} {opName} fx");
                AssertJDeepTf(got["events"], exp["events"], $"{key} {opName} events");
                AssertJDeepTf(got["armies"], exp["armies"], $"{key} {opName} armies");
                AssertJDeepTf(got["worldWar"], exp["worldWar"], $"{key} {opName} worldWar");
                AssertJDeepTf(got["killCredit"], exp["killCredit"], $"{key} {opName} killCredit");
                if (radWindow != null)
                {
                    AssertJDeepTf(got["radWindow"], exp["radWindow"], $"{key} {opName} radWindow");
                    AssertJDeepTf(got["radSet"], exp["radSet"], $"{key} {opName} radSet");
                    AssertJDeepTf(got["burntCount"], exp["burntCount"], $"{key} {opName} burntCount");
                }
            }
        }

        [Test]
        public void Test52_EmergentFire_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            var scenarios = (JArray)gold["scenarios"];
            Assert.That(scenarios.Count, Is.EqualTo(14), "场景数（no-foes/army-miss-capital/capital-ww/building/no-target/intercept/wonder/multi-foes/rad/terra/morale/wwkill/full-chain/dead-civ）");
            foreach (var sc in scenarios) RunScenario((JObject)sc);
        }

        // ---------------- 语义不变量（M-U28/30 Test 语义面先例） ----------------

        [Test]
        public void Test53_EmergentFire_Invariants()
        {
            // ① 低速可拦 / 高速不可拦（pInt = (point/100)(1-speed·0.75)(1-sat)：轨道 speed=1.0×q1 → 1-0.75q1；
            //   q1=1.1 → 0.175 > 0 仍可拦但弱；speed>4/3 时 pInt≤0 恒突防——蓝本语义（高速投送穿透点防））
            var w = new WbWorld();
            w.civs.Add(new WbCiv { id = 0, name = "焰邦", colorHex = "#ff5f3d", alive = true, pop = 20, gold = 40, techs = new List<string>() });
            w.civs.Add(new WbCiv { id = 1, name = "岚国", colorHex = "#5fe8ff", alive = true, pop = 15, gold = 6, techs = new List<string>(), capital = 23 * WbWorld.W + 100 });
            w.rel["0-1"] = -80;
            WbArmory.WeaponSet(w, 1, JObject.Parse("{\"id\":1,\"civ\":0,\"name\":\"测试\",\"gen\":1,\"dtype\":1,\"delivery\":0,\"dmg\":60,\"radius\":2,\"fire\":0.2,\"rad\":false,\"terra\":false,\"morale\":10,\"wonder\":false,\"kills\":0,\"fired\":0,\"parent\":null,\"bornYear\":5,\"retired\":false,\"pl\":1,\"dl\":0,\"gd\":1,\"pw\":0,\"q\":[1,0.6,1,1],\"inter\":0}"));
            w.weapSeq = 2;
            WbArmory.DoctrineSet(w, 0, new WbWorld.WbDoctrine { precision = 0.4, saturation = 0.3, terror = 0.3, attrition = 0.3 });
            WbArmory.DefenseSet(w, 1, new WbWorld.WbDefense { point = 95, armor = 10, evade = 0 });
            // 火炮 speed=0.5×0.6=0.3 → pInt≈0.74：100 次发射必有拦截（fx 含 explosion）
            bool intercepted = false;
            for (int i = 0; i < 100 && !intercepted; i++)
            {
                WbArmory.FireEmergent(w, w.civs[0], WbArmory.WeaponGet(w, 1));
                intercepted = w.effects.Any(e => e.kind == "explosion");
            }
            Assert.That(intercepted, Is.True, "低速火炮可被点防拦截（100 发内必现中段烟花）");
            // ② 辐射幂等重放：同落点两次 payload → radiate 仍 40、radSet 不重复（Dictionary 覆写）
            var w2 = new WbWorld();
            w2.tickCount = 7000;
            WbArmory.WeaponSet(w2, 1, JObject.Parse("{\"id\":1,\"civ\":0,\"name\":\"辐射器\",\"gen\":1,\"dtype\":1,\"delivery\":0,\"dmg\":60,\"radius\":5,\"fire\":0,\"rad\":true,\"terra\":false,\"morale\":0,\"wonder\":false,\"kills\":0,\"fired\":0,\"parent\":null,\"bornYear\":5,\"retired\":false,\"pl\":4,\"dl\":0,\"gd\":1,\"pw\":0,\"q\":[1,1,1,1],\"inter\":0}"));
            w2.weapSeq = 2;
            var e1 = new WbFx { kind = "shell", x = 100.5, y = 60.5, x0 = 100.5, y0 = 60.5, r = 5.0, age = 0, ttl = 60, seed = 0, dir = 0, wid = 1 };
            WbArmory.EmergentPayload(w2, e1);
            int radSetN = w2.radSet.Count;
            WbArmory.EmergentPayload(w2, e1);
            Assert.That(w2.radSet.Count, Is.EqualTo(radSetN), "辐射环幂等（Dictionary 覆写不增键）");
            Assert.That(w2.radSet.Values.All(at => at == 7000 + 2400), Is.True, "radSet 到期 = tickCount+2400");
            // ③ 士气下限 5 + src 豁免（L9435-9441）
            var w3 = new WbWorld();
            WbArmory.WeaponSet(w3, 1, JObject.Parse("{\"id\":1,\"civ\":0,\"name\":\"士气器\",\"gen\":1,\"dtype\":1,\"delivery\":0,\"dmg\":60,\"radius\":3,\"fire\":0,\"rad\":false,\"terra\":false,\"morale\":30,\"wonder\":false,\"kills\":0,\"fired\":0,\"parent\":null,\"bornYear\":5,\"retired\":false,\"pl\":3,\"dl\":0,\"gd\":1,\"pw\":0,\"q\":[1,1,1,1],\"inter\":0}"));
            w3.weapSeq = 2;
            w3.armies.Add(new WbArmy { id = 0, civ = 1, x = 100.5, y = 60.5, morale = 60, members = new List<int>() });
            w3.armies.Add(new WbArmy { id = 1, civ = 0, x = 100.5, y = 61.0, morale = 60, members = new List<int>() });
            w3.armies.Add(new WbArmy { id = 2, civ = 1, x = 101.0, y = 60.8, morale = 8, members = new List<int>() });
            var e3 = new WbFx { kind = "shell", x = 100.5, y = 60.5, x0 = 100.5, y0 = 60.5, r = 3.0, age = 0, ttl = 60, seed = 0, dir = 0, wid = 1, src = 0 };
            WbArmory.EmergentPayload(w3, e3);
            Assert.That(w3.armies[0].morale, Is.EqualTo(30.0), "圆内敌军团 60-30");
            Assert.That(w3.armies[1].morale, Is.EqualTo(60.0), "src 国豁免");
            Assert.That(w3.armies[2].morale, Is.EqualTo(5.0), "下限 5（8-30 → 5）");
            // ④ killCredit 反馈：kills++ + q[0] 钳 1.4 + 学说四轴钳 0.95（wwCountKill 解桩面）
            var w4 = new WbWorld();
            w4.civs.Add(new WbCiv { id = 0, name = "焰邦", colorHex = "#ff5f3d", alive = true, pop = 20, gold = 40, techs = new List<string>() });
            WbArmory.WeaponSet(w4, 1, JObject.Parse("{\"id\":1,\"civ\":0,\"name\":\"反馈器\",\"gen\":1,\"dtype\":1,\"delivery\":0,\"dmg\":60,\"radius\":2,\"fire\":0.2,\"rad\":true,\"terra\":false,\"morale\":10,\"wonder\":false,\"kills\":10,\"fired\":7,\"parent\":null,\"bornYear\":5,\"retired\":false,\"pl\":5,\"dl\":4,\"gd\":4,\"pw\":3,\"q\":[1.395,1,1,1],\"inter\":0}"));
            w4.weapSeq = 2;
            WbArmory.DoctrineSet(w4, 0, new WbWorld.WbDoctrine { precision = 0.949, saturation = 0.949, terror = 0.949, attrition = 0.949 });
            w4.killCredit = 1;
            WbCivSim.WwCountKill(w4, new WbU { civ = -1 });   // victim.civ<0 → 无 ww 计数，反馈支路照走
            var row = WbArmory.WeaponGet(w4, 1);
            Assert.That(row.Value<int>("kills"), Is.EqualTo(11), "kills 10→11");
            Assert.That(row["q"][0].Value<double>(), Is.EqualTo(1.4), "q[0] 1.395+0.012 → 钳 1.4");
            var doc = WbArmory.DoctrineOf(w4, 0);
            Assert.That(doc.terror, Is.EqualTo(0.95), "P.rad → terror 钳 0.95");
            Assert.That(doc.precision, Is.EqualTo(0.95), "G.acc>0.7 → precision 钳 0.95");
        }
    }
}
