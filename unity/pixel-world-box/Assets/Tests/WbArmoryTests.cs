// ============================================================
// WbArmoryTests.cs — M-U30 武器铸造域（forge face）+ armoryTick 全件 黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/armory.json（9 场景 det 双跑字节级）
//   由 scripts/unity-migration/gen-armory.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔civ/rel/武器行/学说/防御注入 + spawnUnit 真调用〕+ rngA 尾置
//   清零起流 + ops 逐步直调〔armoryTick/forgeWeapon/fuseWeapon/forgeDivineWeapon/
//   emergentForgeTick〕+ 每步 canonical 快照）。
// 验证链（纪律④）: 黄金向量(真实现) → det 双跑 → 本文件 NUnit C# 全链重放
//   （夹具灌注 → SpawnUnit 重放 → 武器/学说/防御注入 → WbArmory 逐步直调）逐位对账
//   → 网页 parity。
// 对账面: 每步 rngA + civ gold（f64hex）+ units 装备/伤害/血量 + weapons 行 canonical
//   （可选字段 absent→null 归一 + q 向量 f64hex）+ doctrines/defenses 行（f64hex）+
//   weapSeq + fx（kind/x/y/ttl）+ events（kind/text/x/y）+ evoDelta（id≥evoSeq0 增量
//   + meta 数值 f64hex）+ evoWp 键序（数值排序——Map 插入序镜像，键单调）。
// 切片边界: 发射面（fireEmergent/emergentPayload/wwCountKill 学说反馈支路）M-U31；
//   WBB.touchMeta 槽 59 no-op 维持（M-U28 先例）。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbArmoryTests
    {
        private static string FindGolden()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "armory.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "armory.json"),
                "armory.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: armory.json");
        }

        private static string F64Hex(double v) => WbRender.F64Hex(v);   // 小写 16 字符 LE —— JS f64hex 同构

        private static void AssertJDeepTf(JToken got, JToken exp, string what)
            => Assert.That(JToken.DeepEquals(got, exp), Is.True, $"{what}: got={got.ToString(Newtonsoft.Json.Formatting.None)} exp={exp.ToString(Newtonsoft.Json.Formatting.None)}");

        // ---------------- canonical builders（镜像 gen-armory.mjs 快照协议） ----------------

        /// <summary>武器行 canonical：可选字段 absent/null → null；dmg/radius/fire/q → f64hex（可选字段存在性语义保留）</summary>
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
            foreach (var row in WbArmory.WeaponValues(w)) arr.Add(WeaponCanonTf(row));   // 插入序镜像
            return arr;
        }

        /// <summary>学说/防御行 canonical（doctrinesKeys/defensesKeys 插入序镜像——JS Map [...entries()] 序）</summary>
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

        /// <summary>meta canonical：数值整值归一（JS JSON 整值无小数点 → Integer；C# double 整值 →
        /// long Integer 同构；非整值 Float 透传——DeepEquals 数值跨型等价兜底）</summary>
        private static JObject MetaCanonTf(JToken meta)
        {
            if (meta == null || meta.Type == JTokenType.Null) return null;
            var o = new JObject();
            foreach (var p in ((JObject)meta).Properties())
            {
                if (p.Value != null && (p.Value.Type == JTokenType.Integer || p.Value.Type == JTokenType.Float))
                {
                    double v = p.Value.Value<double>();
                    o[p.Name] = v == Math.Floor(v) && !double.IsInfinity(v) && Math.Abs(v) < 9.007199254740992E15 ? (JToken)(long)v : (JToken)v;
                }
                else if (p.Value == null || p.Value.Type == JTokenType.Null)
                    o[p.Name] = JToken.Parse("null");
                else
                    o[p.Name] = p.Value;
            }
            return o;
        }

        private static JArray EvoDeltaTf(WbWorld w, int evoSeq0)
        {
            var arr = new JArray();
            foreach (var n in w.evoNodes)
            {
                if (n.id < evoSeq0) continue;
                arr.Add(new JObject
                {
                    ["id"] = n.id,
                    ["kind"] = n.kind,
                    ["name"] = n.name,
                    ["parent"] = n.parent.HasValue ? (JToken)n.parent.Value : JToken.Parse("null"),
                    ["year"] = n.year,
                    ["colorHex"] = n.colorHex,
                    ["detail"] = n.detail,
                    ["stat"] = n.stat == null ? JToken.Parse("null") : (JToken)n.stat,
                    ["meta"] = MetaCanonTf(n.meta == null ? null : JObject.FromObject(n.meta)),
                });
            }
            return arr;
        }

        private static JArray EvoWpTf(WbWorld w)
        {
            var keys = new List<int>();
            foreach (var k in w.evoIndex.Keys)
                if (k.StartsWith("wp:") && int.TryParse(k.Substring(3), out int id)) keys.Add(id);
            keys.Sort();
            var arr = new JArray();
            foreach (int id in keys) arr.Add($"wp:{id}");
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

        private static JArray FxTf(WbWorld w)
        {
            var arr = new JArray();
            foreach (var e in w.effects)
                arr.Add(new JObject { ["kind"] = e.kind, ["x"] = F64Hex(e.x), ["y"] = F64Hex(e.y), ["ttl"] = F64Hex(e.ttl) });
            return arr;
        }

        private static string UnitWepTf(WbU u) => u.wep as string ?? (u.wep == null ? null : u.wep.ToString());
        private static string UnitArmTf(WbU u) => u.armS as string ?? (u.armS == null ? null : u.armS.ToString());

        private static JObject Snapshot(WbWorld w, int evoSeq0, string opName)
        {
            var units = new JArray();
            foreach (var u in w.units)
            {
                string wepS = UnitWepTf(u);
                string armS = UnitArmTf(u);
                units.Add(new JObject
                {
                    ["wep"] = wepS == null ? JToken.Parse("null") : (JToken)wepS,
                    ["arm"] = armS == null ? JToken.Parse("null") : (JToken)armS,
                    ["dmg"] = F64Hex(u.dmg),
                    ["hp"] = F64Hex(u.hp),
                    ["maxHp"] = F64Hex(u.maxHp),
                });
            }
            var gold = new JArray();
            foreach (var c in w.civs) gold.Add(F64Hex(c.gold ?? 0));
            return new JObject
            {
                ["op"] = opName,
                ["rngA"] = w.rngA.ToString("x8"),
                ["gold"] = gold,
                ["units"] = units,
                ["weapons"] = WeaponsCanonTf(w),
                ["weapSeq"] = w.weapSeq,
                ["doctrines"] = DoctrineCanonTf(w),
                ["defenses"] = DefenseCanonTf(w),
                ["fxCount"] = w.effects.Count,
                ["fx"] = FxTf(w),
                ["events"] = EventsTf(w),
                ["evoDelta"] = EvoDeltaTf(w, evoSeq0),
                ["evoWp"] = EvoWpTf(w),
            };
        }

        // ---------------- 夹具灌注 + ops 重放 ----------------

        /// <summary>C# 全链重放：夹具灌注 → SpawnUnit 重放（rngA 起流前）→ 武器/学说/防御注入</summary>
        private static WbWorld BuildScenario(JObject sc, out int evoSeq0)
        {
            var w = new WbWorld();
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            foreach (var c in (JArray)sc["civs"])
            {
                var cj = (JObject)c;
                w.civs.Add(new WbCiv
                {
                    id = cj.Value<int>("id"),
                    name = cj.Value<string>("name"),
                    colorHex = cj.Value<string>("colorHex"),
                    alive = cj.Value<bool?>("alive") ?? true,
                    pop = cj.Value<int?>("pop") ?? 0,
                    gold = cj["gold"] != null && cj["gold"].Type != JTokenType.Null ? cj.Value<double>("gold") : (double?)null,
                    techs = cj["techs"]?.ToObject<List<string>>() ?? new List<string>(),
                    capital = -1,
                });
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
            evoSeq0 = sc.Value<int>("evoSeq0");
            w.evoSeq = evoSeq0;                                    // delta id 对齐（gen 手术基线）
            // spawn 重放（M-U3h 译件——rngA 起流前，掷数不入结算链）
            foreach (var s in (JArray)sc["spawn"])
            {
                var so = (JObject)s;
                double sx = BitConverter.ToDouble(Convert.FromHexString(so.Value<string>("x")), 0);
                double sy = BitConverter.ToDouble(Convert.FromHexString(so.Value<string>("y")), 0);
                var u = WbBailRelay.SpawnUnit(w, so.Value<int>("race"), sx, sy, new WbBailRelay.WbSpawnOpts
                {
                    silent = true,
                    civ = so["civ"] != null && so["civ"].Type != JTokenType.Null ? (int?)so.Value<int>("civ") : null,
                    job = so.Value<int?>("job") ?? 0,
                    trait = so["trait"] != null && so["trait"].Type == JTokenType.String ? so.Value<string>("trait") : "",   // '' → null 语义（零掷——gen trait:'' 同构）
                });
                Assert.That(u, Is.Not.Null, $"spawn 重放 S{sc.Value<string>("key")}");
                if (so["wep"] != null && so["wep"].Type == JTokenType.String) u.wep = so.Value<string>("wep");
                if (so["arm"] != null && so["arm"].Type == JTokenType.String) u.armS = so.Value<string>("arm");
            }
            // rngA 尾置起流（gen 协议——结算掷链自 seed 纯净起流）
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        /// <summary>ops 逐步重放 + 每步 canonical 对账</summary>
        private static void RunScenario(JObject s)
        {
            string key = s.Value<string>("key");
            var w = BuildScenario(s, out int evoSeq0);
            JObject prevForge = null;
            JObject lastRows = null;
            var steps = (JArray)s["steps"];
            int stepIdx = 0;                       // 步进游标（golden step 序 = ops 序）
            foreach (var opT in (JArray)s["ops"])
            {
                var op = (JObject)opT;
                string opName = op.Value<string>("op");
                switch (opName)
                {
                    case "armory":
                        WbArmory.ArmoryTick(w);
                        break;
                    case "forge":
                    {
                        WbCiv c = w.civs[op.Value<int>("civ")];
                        JToken pt = op["parent"];
                        JObject parent = null;
                        if (pt != null && pt.Type == JTokenType.String && pt.Value<string>() == "prev") parent = prevForge;
                        else if (pt != null && pt.Type == JTokenType.Integer) parent = WbArmory.WeaponGet(w, pt.Value<int>());
                        var r = WbArmory.ForgeWeapon(w, c, parent);
                        if (r != null) prevForge = r;
                        break;
                    }
                    case "fuse":
                    {
                        WbCiv c = w.civs[op.Value<int>("civ")];
                        var wa = WbArmory.WeaponGet(w, op.Value<int>("a"));
                        var wb = WbArmory.WeaponGet(w, op.Value<int>("b"));
                        var r = WbArmory.FuseWeapon(w, c, wa, wb);
                        if (r != null) prevForge = r;
                        break;
                    }
                    case "divine":
                        WbArmory.ForgeDivineWeapon(w, op.Value<int>("civ"), op["opts"] as JObject ?? new JObject());
                        break;
                    case "forgeTick":
                        WbArmory.EmergentForgeTick(w);
                        break;
                    case "doctrine":
                        WbArmory.DoctrineOf(w, op.Value<int>("civ"));
                        break;
                    case "defense":
                        WbArmory.DefenseOf(w, op.Value<int>("civ"));
                        break;
                    case "armament":
                        WbArmory.ArmamentOf(w, w.civs[op.Value<int>("civ")]);
                        break;
                    case "saveRows":
                        lastRows = new JObject
                        {
                            ["weapons"] = WbArmory.WeaponsRows(w),
                            ["weapSeq"] = w.weapSeq,
                            ["dctr"] = WbArmory.DctrRows(w),
                            ["ddef"] = WbArmory.DdefRows(w),
                        };
                        break;
                    case "applyRows":
                        WbArmory.ApplyDynRows(w, (JArray)lastRows["weapons"], lastRows.Value<double>("weapSeq"), (JArray)lastRows["dctr"], (JArray)lastRows["ddef"]);
                        break;
                    default:
                        throw new AssertionException($"未知 op {opName}");
                }
                // 每步 canonical 对账（golden step 序 = ops 序）
                var exp = (JObject)steps[stepIdx++];
                var got = Snapshot(w, evoSeq0, opName);
                AssertJDeepTf(got["rngA"], exp["rngA"], $"{key} {opName} rngA");
                AssertJDeepTf(got["gold"], exp["gold"], $"{key} {opName} gold");
                AssertJDeepTf(got["units"], exp["units"], $"{key} {opName} units");
                AssertJDeepTf(got["weapons"], exp["weapons"], $"{key} {opName} weapons");
                Assert.That(w.weapSeq, Is.EqualTo(exp.Value<int>("weapSeq")), $"{key} {opName} weapSeq");
                AssertJDeepTf(got["doctrines"], exp["doctrines"], $"{key} {opName} doctrines");
                AssertJDeepTf(got["defenses"], exp["defenses"], $"{key} {opName} defenses");
                Assert.That(w.effects.Count, Is.EqualTo(exp.Value<int>("fxCount")), $"{key} {opName} fxCount");
                AssertJDeepTf(got["fx"], exp["fx"], $"{key} {opName} fx");
                AssertJDeepTf(got["events"], exp["events"], $"{key} {opName} events");
                AssertJDeepTf(got["evoDelta"], exp["evoDelta"], $"{key} {opName} evoDelta");
                AssertJDeepTf(got["evoWp"], exp["evoWp"], $"{key} {opName} evoWp");
            }
        }

        [Test]
        public void Test50_Armory_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindGolden()));
            var scenarios = (JArray)gold["scenarios"];
            Assert.That(scenarios.Count, Is.EqualTo(9), "场景数（armory-head/doctrine-lazy/forge-fresh/forge-lineage/forge-gates/fuse/divine/forge-tick-war/save-rows）");
            foreach (var sc in scenarios) RunScenario((JObject)sc);
        }

        // ---------------- 槽 33 节律（WbTickOrch ARMORY %240===13 门） ----------------

        [Test]
        public void Test34b_OrchArmorySlot_FiresAtMod240_13()
        {
            var w = new WbWorld();
            var orch = new WbTickOrch { w = w };
            orch.D[WbTickOrch.ARMORY] = () => WbArmory.ArmoryTick(w);   // 宿主 WireOrch 同形（M-U30）
            // 相位窗内：tier4 国 + 无械单位 → 一 tick 武装（u.wep = musket——WEAPON_BY_TIER[4]）
            w.civs.Add(new WbCiv { id = 0, name = "焰邦", colorHex = "#ff5f3d", alive = true, pop = 20, gold = 40, techs = new List<string> { "bronze", "iron", "steel", "gunpowder" } });
            var u = WbBailRelay.SpawnUnit(w, 0, 60.5, 60.5, new WbBailRelay.WbSpawnOpts { silent = true, civ = 0, job = 0 });
            Assert.That(u, Is.Not.Null);
            w.yearF = 1.5;
            w.tickCount = 12;                                           // Tick() 首行 ++ → 13 → %240==13 触发
            orch.Tick();
            Assert.That(u.wep as string, Is.EqualTo("musket"), "%240===13 相位触发（武装落地）");
            w.tickCount = 13;                                           // → 14 → 不触发
            u.wep = null;
            orch.Tick();
            Assert.That(u.wep, Is.Null, "相位窗外不触发");
            w.tickCount = 252;                                          // → 253 = 240+13 → 相位再中
            orch.Tick();
            Assert.That(u.wep as string, Is.EqualTo("musket"), "%240===13 跨周期相位");
        }

        // ---------------- 语义不变量（M-U28 Test 语义面先例） ----------------

        [Test]
        public void Test51_Armory_Invariants()
        {
            var w = new WbWorld();
            w.civs.Add(new WbCiv { id = 0, name = "焰邦", colorHex = "#ff5f3d", alive = true, pop = 25, gold = 100000, techs = new List<string> { "bronze", "iron", "steel", "gunpowder" } });
            w.yearF = 10.0;
            // ① 上限 128：预注入 128 行 → forgeWeapon 恒 null（L8989 size>=128 门）
            for (int i = 1; i <= 128; i++)
                WbArmory.WeaponSet(w, i, JObject.Parse($"{{\"id\":{i},\"civ\":0,\"name\":\"垫{i}\",\"gen\":1,\"dtype\":1,\"delivery\":0,\"dmg\":60,\"radius\":2,\"fire\":0.2,\"rad\":false,\"terra\":false,\"morale\":10,\"wonder\":false,\"kills\":0,\"fired\":0,\"parent\":null,\"bornYear\":5,\"retired\":false,\"pl\":1,\"dl\":0,\"gd\":1,\"pw\":0,\"q\":[1,1,1,1],\"inter\":0}}"));
            w.weapSeq = 129;
            Assert.That(WbArmory.ForgeWeapon(w, w.civs[0], null), Is.Null, "L8989 上限 128 门");
            // ② active≥5 门（L8990）：退役行不入 active 计数
            var w2 = new WbWorld();
            w2.civs.Add(new WbCiv { id = 0, name = "焰邦", colorHex = "#ff5f3d", alive = true, pop = 25, gold = 100000, techs = new List<string> { "bronze", "iron", "steel", "gunpowder" } });
            w2.yearF = 10.0;
            for (int i = 1; i <= 5; i++)
                WbArmory.WeaponSet(w2, i, JObject.Parse($"{{\"id\":{i},\"civ\":0,\"name\":\"在役{i}\",\"gen\":1,\"dtype\":1,\"delivery\":0,\"dmg\":60,\"radius\":2,\"fire\":0.2,\"rad\":false,\"terra\":false,\"morale\":10,\"wonder\":false,\"kills\":0,\"fired\":0,\"parent\":null,\"bornYear\":5,\"retired\":false,\"pl\":1,\"dl\":0,\"gd\":1,\"pw\":0,\"q\":[1,1,1,1],\"inter\":0}}"));
            w2.weapSeq = 6;
            Assert.That(WbArmory.ForgeWeapon(w2, w2.civs[0], null), Is.Null, "L8990 active≥5 门");
            WbArmory.WeaponGet(w2, 5)["retired"] = true;                 // 退役 1 件 → active 4 → 可铸
            var forged = WbArmory.ForgeWeapon(w2, w2.civs[0], null);
            Assert.That(forged, Is.Not.Null, "退役让位后可铸（L8990 门解除）");
            // ③ gold 账本不透支（L9089 Math.max(0,·)）
            Assert.That(w2.civs[0].gold, Is.Not.Null.And.GreaterThanOrEqualTo(0.0), "gold 恒 ≥0");
            // ④ 融合同体/异国 null（L9124）
            var w3 = new WbWorld();
            w3.civs.Add(new WbCiv { id = 0, name = "焰邦", colorHex = "#ff5f3d", alive = true, pop = 25, gold = 100000, techs = new List<string> { "bronze", "iron", "steel", "gunpowder" } });
            w3.civs.Add(new WbCiv { id = 1, name = "岚国", colorHex = "#5fe8ff", alive = true, pop = 25, gold = 100000, techs = new List<string> { "bronze", "iron", "steel", "gunpowder" } });
            w3.yearF = 10.0;
            var wa3 = JObject.Parse("{\"id\":1,\"civ\":0,\"name\":\"甲\",\"gen\":1,\"dtype\":1,\"delivery\":0,\"dmg\":60,\"radius\":2,\"fire\":0.2,\"rad\":false,\"terra\":false,\"morale\":10,\"wonder\":false,\"kills\":0,\"fired\":5,\"parent\":null,\"bornYear\":5,\"retired\":false,\"pl\":1,\"dl\":0,\"gd\":1,\"pw\":0,\"q\":[1,1,1,1],\"inter\":0}");
            var wb3 = JObject.Parse("{\"id\":2,\"civ\":1,\"name\":\"乙\",\"gen\":1,\"dtype\":1,\"delivery\":0,\"dmg\":60,\"radius\":2,\"fire\":0.2,\"rad\":false,\"terra\":false,\"morale\":10,\"wonder\":false,\"kills\":0,\"fired\":5,\"parent\":null,\"bornYear\":5,\"retired\":false,\"pl\":1,\"dl\":0,\"gd\":1,\"pw\":0,\"q\":[1,1,1,1],\"inter\":0}");
            WbArmory.WeaponSet(w3, 1, wa3);
            WbArmory.WeaponSet(w3, 2, wb3);
            w3.weapSeq = 3;
            Assert.That(WbArmory.FuseWeapon(w3, w3.civs[0], wa3, wa3), Is.Null, "同体 null（L9124 wa.id===wb.id）");
            Assert.That(WbArmory.FuseWeapon(w3, w3.civs[0], wa3, wb3), Is.Null, "异国 null（L9124 wb.civ!==c.id）");
            // ⑤ 神铸死国 null（L9209 c?.alive 门）+ 存档行回读稳定（L15287/15605 往返）
            w3.civs[1].alive = false;
            Assert.That(WbArmory.ForgeDivineWeapon(w3, 1, new JObject()), Is.Null, "死国 null（L9209）");
            var rows1 = WbArmory.WeaponsRows(w3);
            WbArmory.ApplyDynRows(w3, rows1, w3.weapSeq, WbArmory.DctrRows(w3), WbArmory.DdefRows(w3));
            var rows2 = WbArmory.WeaponsRows(w3);
            Assert.That(JToken.DeepEquals(rows1, rows2), Is.True, "存档行面往返稳定（serialize→applySave→serialize）");
        }
    }
}
