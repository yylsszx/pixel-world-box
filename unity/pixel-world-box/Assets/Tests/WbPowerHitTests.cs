// ============================================================
// WbPowerHitTests.cs — M-U10c effectsTick 命中族三 kind + explode 消费面直测（NUnit）
// 范围: meteor L10237-10239 / fireball L10240-10254 / arrow·bullet L10255-10294 +
//   explode L10450-10499（黄金回放主面在 WbPowerTests.Test35——power.json 18 场景全量逐位；
//   本文件钉语义门与蓝本异形面）。
// 蓝本关键语义（黄金实证沉淀）:
//   ① meteor age>=ttl 门 → explode(4.2,{terrain:true}) + 非quiet 入纪事（quiet 弹抑事件——
//     衍生弹体面；explode 副产物 explosion+smoke×6 常驻至自身 ttl 到期）；
//   ② explode 地形环：isLand 门（DEEP/WATER/LAVA 整格跳过含 ignite 门掷）+ MOUNTAIN 不烧但
//     ignite 门掷照走（FLAMMABLE 门内掷免）+ 单位环无 dead 跳过（蓝本异形——机械保持钉）；
//   ③ fireball：MAGE 自身免疫（race===R.MAGE 跳过）+ hp-=e.r（r=伤害位面）+ ignite 建筑
//     格门（building[fi]>0 不烧——战争不纵火）与空地正面支（fire=150+floor(rng*90)）；
//   ④ arrow·bullet：3×3 桶环最近命中（<1.1，dead 跳过）+ 友军豁免（civ===src——src undefined
//     语义不豁免任何单位）+ gearBonus armor 减伤（链甲 8 → dmg*0.92 位精确）+ dmgNumbers
//     双支（>=10 短路无掷 / <10 掷 0.3）+ kill→wwCountKill（killCredit 恒 null + worldWar
//     idle 直跳）+ 建筑支五重门（bIdx OOB undefined 镜像 / 自军免 / 非战 rel 免）。
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
    public class WbPowerHitTests
    {
        private static string FindPower()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "power.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "power.json"),
                "power.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: power.json");
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

        private static string F64Hex(double v) => WbRender.F64Hex(v);

        private static double F64FromHex(string hex)
        {
            byte[] b = Convert.FromHexString(hex);
            return BitConverter.ToDouble(b, 0);
        }

        private static string Md5Hex(byte[] data)
        {
            using var md5 = System.Security.Cryptography.MD5.Create();
            var h = md5.ComputeHash(data);
            var sb = new System.Text.StringBuilder(h.Length * 2);
            foreach (byte b in h) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        private static readonly string[] HitKeys =
        {
            "power-meteor", "power-fireball", "power-arrow", "power-bullet-misc",
        };

        /// <summary>C# 全链重放（WbPowerTests.ReplayScenario 同构副本——M-U10c 全通道含）</summary>
        private static (WbWorld w, Dictionary<int, double> gearArmor) ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            w.fire = GunzipB64(fx.Value<string>("fire0"));
            w.fireSet = new HashSet<int>(fx["fireSet0"].ToObject<List<int>>());
            w.fireSetList = fx["fireSet0"].ToObject<List<int>>();
            w.dirty.Clear();
            w.radiate = GunzipB64(fx.Value<string>("radiate0"));
            w.waterTier = GunzipB64(fx.Value<string>("waterTier0"));
            foreach (var t in (JArray)fx["radSet0"]) w.radSet[t[0].Value<int>()] = t[1].Value<int>();
            foreach (var t in (JArray)fx["regrow0"]) w.regrow[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var i in fx["frozen0"].ToObject<List<int>>()) { w.frozen.Add(i); w.frozenList.Add(i); }
            foreach (var b in (JArray)fx["building0"])
            {
                var bo = (JObject)b;
                w.building[bo.Value<int>("i")] = (byte)bo.Value<int>("kind");
                w.buildings.Add(new WbBuilding { i = bo.Value<int>("i"), x = bo.Value<int>("x"), y = bo.Value<int>("y"), kind = bo.Value<int>("kind"), civ = bo["civ"] != null ? bo.Value<int>("civ") : -1 });
                w.bIdx[bo.Value<int>("i")] = w.buildings.Count - 1;
            }
            foreach (var t in (JArray)(fx["orphanB0"] ?? new JArray())) w.building[t[0].Value<int>()] = (byte)t[1].Value<int>();
            foreach (var t in (JArray)(fx["rel0"] ?? new JArray())) w.rel[t[0].Value<string>()] = t[1].Value<double>();
            foreach (var t in (JArray)fx["battles0"]) w.activeBattles[t[0].Value<int>()] = t[1].Value<int>();
            foreach (var t in (JArray)fx["flood0"]) w.flood[t[0].Value<int>()] = t[1].Value<long>();
            var gearArmor = new Dictionary<int, double>();
            foreach (var e in (JArray)fx["fx0"])
            {
                var eo = (JObject)e;
                w.effects.Add(new WbFx
                {
                    kind = eo.Value<string>("kind"),
                    x = F64FromHex(eo.Value<string>("x")),
                    y = F64FromHex(eo.Value<string>("y")),
                    r = eo.Value<double>("r"),
                    age = eo.Value<double>("age"),
                    ttl = eo.Value<double>("ttl"),
                    seed = eo.Value<int>("seed"),
                    dir = F64FromHex(eo.Value<string>("dir")),
                    src = eo["src"] != null && eo["src"].Type != JTokenType.Null ? (int?)eo.Value<int>("src") : null,
                    dmg = eo["dmg"] != null && eo["dmg"].Type != JTokenType.Null ? (double?)eo.Value<double>("dmg") : null,
                    quiet = eo.Value<bool?>("quiet") ?? false,
                });
            }
            foreach (var u in (JArray)fx["units0"])
            {
                var uo = (JObject)u;
                w.units.Add(new WbU
                {
                    id = uo.Value<int>("id"),
                    race = uo.Value<int>("race"),
                    x = F64FromHex(uo.Value<string>("x")),
                    y = F64FromHex(uo.Value<string>("y")),
                    hp = F64FromHex(uo.Value<string>("hp")),
                    maxHp = F64FromHex(uo.Value<string>("maxHp")),
                    hurt = uo.Value<int>("hurt"),
                    chill = uo.Value<int>("chill"),
                    dead = uo.Value<bool>("dead") ? 1 : 0,
                    civ = uo["civ"] != null ? uo.Value<int>("civ") : -1,
                });
                if (uo["gbArmor"] != null) gearArmor[uo.Value<int>("id")] = uo.Value<double>("gbArmor");
            }
            w.RebuildBuckets();
            w.laws.seasons = sc.Value<bool>("seasons");
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            w.rngA = unchecked((uint)sc.Value<int>("seed"));
            return (w, gearArmor);
        }

        [Test]
        public void Test37_Hit_GoldenReplay_FourKinds()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindPower()));
            var scens = gold["scenarios"].Where(t => HitKeys.Contains(((JObject)t).Value<string>("key"))).ToList();
            Assert.That(scens.Count, Is.EqualTo(4), "命中族四场景在册");
            var gear0 = WbBailRelay.GearBonusHook;
            try
            {
                foreach (var scTok in scens)
                {
                    var sc = (JObject)scTok;
                    string key = sc.Value<string>("key");
                    var (w, gearArmor) = ReplayScenario(sc);
                    WbBailRelay.GearBonusHook = (ww, u) => new WbGearBonus { armor = gearArmor.TryGetValue(u.id, out var a) ? a : 0, speed = 1 };
                    int steps = sc.Value<int>("steps");
                    var snaps = (JArray)sc["stepsSnap"];
                    for (int k = 0; k < steps; k++)
                    {
                        w.tickCount++;
                        WbBailRelay.EffectsTick(w);
                        var g = (JObject)snaps[k];
                        Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{k}");
                        Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{k}");
                        var gFx = (JArray)g["fx"];
                        Assert.That(w.effects.Count, Is.EqualTo(gFx.Count), $"fxCount {key} S{k}");
                        for (int q = 0; q < gFx.Count; q++)
                        {
                            var eo = (JObject)gFx[q];
                            var f = w.effects[q];
                            Assert.That(f.kind, Is.EqualTo(eo.Value<string>("kind")), $"fx kind {key} S{k}#{q}");
                            Assert.That(F64Hex(f.x), Is.EqualTo(eo.Value<string>("x")), $"fx x {key} S{k}#{q}");
                            Assert.That(F64Hex(f.y), Is.EqualTo(eo.Value<string>("y")), $"fx y {key} S{k}#{q}");
                            Assert.That(F64Hex(f.dir), Is.EqualTo(eo.Value<string>("dir")), $"fx dir {key} S{k}#{q}");
                        }
                        var gU = (JArray)g["units"];
                        Assert.That(w.units.Count, Is.EqualTo(gU.Count), $"unitsCount {key} S{k}");
                        for (int q = 0; q < gU.Count; q++)
                        {
                            var uo = (JObject)gU[q];
                            var u = w.units[q];
                            Assert.That(F64Hex(u.hp), Is.EqualTo(uo.Value<string>("hp")), $"u hp {key} S{k}#{q}");
                            Assert.That(u.hurt, Is.EqualTo(uo.Value<int>("hurt")), $"u hurt {key} S{k}#{q}");
                            Assert.That(u.dead != 0, Is.EqualTo(uo.Value<bool>("dead")), $"u dead {key} S{k}#{q}");
                        }
                        Assert.That(w.fireSetList, Is.EqualTo(g["fireSet"].ToObject<List<int>>()), $"fireSet 序 {key} S{k}");
                        var gBhp = g["bHp"].ToObject<List<List<object>>>();
                        var gotBhp = new List<string>();
                        foreach (int bk in w.bHpKeys) gotBhp.Add($"{bk}:{F64Hex(w.bHp[bk])}");
                        Assert.That(gotBhp, Is.EqualTo(gBhp.Select(p => $"{Convert.ToInt32(p[0])}:{(string)p[1]}").ToList()), $"bHp {key} S{k}");
                        Assert.That(w.buildings.Count, Is.EqualTo(g.Value<int>("buildingsCount")), $"buildingsCount {key} S{k}");
                        Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{k}");
                        Assert.That(w.dirty.OrderBy(x => x).ToList(), Is.EqualTo(g["dirty"].ToObject<List<int>>()), $"dirty 序 {key} S{k}");
                        Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{k}");
                    }
                    // 终态：terrain md5 + events 全列（meteor 纪事面）
                    CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                    var gEv = (JArray)sc["events"];
                    Assert.That(w.worldEvents.Count, Is.EqualTo(gEv.Count), $"events 终态 {key}");
                    for (int k2 = 0; k2 < gEv.Count; k2++)
                    {
                        var eo2 = (JObject)gEv[k2];
                        var ev2 = w.worldEvents[k2];
                        Assert.That(ev2.kind, Is.EqualTo(eo2.Value<string>("kind")), $"events kind {key}#{k2}");
                        Assert.That(ev2.text, Is.EqualTo(eo2.Value<string>("text")), $"events text {key}#{k2}");
                        Assert.That(ev2.x, Is.EqualTo(eo2["x"] != null && eo2["x"].Type != JTokenType.Null ? (double?)eo2.Value<double>("x") : null), $"events x {key}#{k2}");
                        Assert.That(ev2.y, Is.EqualTo(eo2["y"] != null && eo2["y"].Type != JTokenType.Null ? (double?)eo2.Value<double>("y") : null), $"events y {key}#{k2}");
                    }
                }
            }
            finally
            {
                WbBailRelay.GearBonusHook = gear0;
            }
        }

        [Test]
        public void Test37_Meteor_QuietGate_ExplodeStillFires()
        {
            var w = new WbWorld();
            w.tickCount = 14000;
            for (int y = 58; y < 63; y++) for (int x = 98; x < 103; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var sheep = new WbU { id = 1, race = 6, x = 100.5, y = 60.5, hp = 500, maxHp = 500 };
            w.units.Add(sheep);
            w.effects.Add(new WbFx { kind = "meteor", x = 100.5, y = 60.5, ttl = 1, age = 0, quiet = true });
            w.rngA = 0x0A0E0Fu;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                              // age1: explode + quiet 抑事件
            Assert.That(w.worldEvents.Count, Is.EqualTo(0), "quiet 弹不入纪事（L10239 抑面）");
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_BURNT), "explode 照常触发（quiet 只抑事件）");
            Assert.That(w.shake, Is.EqualTo(8), "shake max 8（L10478）");
            Assert.That(sheep.hurt, Is.EqualTo(30), "单位环 hurt 30（L10471）");
            Assert.That(F64Hex(sheep.hp), Is.EqualTo(F64Hex(200)), "d=0 → 300*max(0.15,1-0/5)=300（L10470）");
            Assert.That(w.effects.Count(f2 => f2.kind == "smoke"), Is.EqualTo(6), "smoke ×6（L10480-10482）");
            Assert.That(w.effects.Any(f2 => f2.kind == "explosion"), Is.True, "fx explosion {r:4.2}（L10479）");
        }

        [Test]
        public void Test37_Explode_DeadUnitsNotSkipped()
        {
            var w = new WbWorld();                                    // 蓝本异形钉：explode 单位环无 dead 跳过（L10467 机械）
            w.tickCount = 14001;
            for (int y = 58; y < 63; y++) for (int x = 98; x < 103; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var deadUnit = new WbU { id = 1, race = 6, x = 100.5, y = 60.5, hp = 40, maxHp = 50, dead = 1 };
            w.units.Add(deadUnit);
            w.effects.Add(new WbFx { kind = "meteor", x = 100.5, y = 60.5, ttl = 1, age = 0, quiet = true });
            w.rngA = 0x0A0E0Fu;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(deadUnit.hurt, Is.EqualTo(30), "dead 单位仍被扫（L10467 无 dead 跳过——机械保持）");
            Assert.That(F64Hex(deadUnit.hp), Is.EqualTo(F64Hex(-260)), "dead 单位仍扣血 40-300");
            Assert.That(deadUnit.dead, Is.EqualTo(1), "dead 保持 1（hp<=0 支幂等——不触发二次入账面）");
        }

        [Test]
        public void Test37_Fireball_MageImmune_BuildingIgniteGate()
        {
            var w = new WbWorld();
            w.tickCount = 15000;
            for (int y = 58; y < 63; y++) for (int x = 98; x < 103; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            int bld = 60 * WbWorld.W + 100;                           // 建筑格落点——ignite 门钉
            w.building[bld] = 1;
            w.buildings.Add(new WbBuilding { i = bld, x = 100, y = 60, kind = 1, civ = -1 });
            w.bIdx[bld] = 0;
            var sheep = new WbU { id = 1, race = 6, x = 100.5, y = 60.5, hp = 50, maxHp = 50 };
            var mage = new WbU { id = 2, race = WbConstants.R_MAGE, x = 100.5, y = 61.0, hp = 50, maxHp = 50 };
            w.units.Add(sheep); w.units.Add(mage);
            w.effects.Add(new WbFx { kind = "fireball", x = 100.5, y = 60.5, ttl = 1, age = 0, r = 18 });
            w.rngA = 0x0A0E10u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(F64Hex(sheep.hp), Is.EqualTo(F64Hex(32)), "溅射 hp-=e.r（L10246——r=伤害位面）");
            Assert.That(sheep.hurt, Is.EqualTo(20), "hurt 20");
            Assert.That(F64Hex(mage.hp), Is.EqualTo(F64Hex(50)), "MAGE 自身免疫（L10243 race 门）");
            Assert.That(mage.hurt, Is.EqualTo(0), "MAGE hurt 不触");
            Assert.That(w.fireSet.Contains(bld), Is.False, "建筑格不点燃（L10254 门——战争不纵火）");
            Assert.That(w.effects.Any(f2 => f2.kind == "explosion"), Is.True, "fx explosion {r:0.9}（L10251）");
        }

        [Test]
        public void Test37_Arrow_FriendlyExempt_ArmorReduction()
        {
            var w = new WbWorld();
            w.tickCount = 16000;
            for (int y = 78; y < 83; y++) for (int x = 198; x < 203; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var friend = new WbU { id = 1, race = 0, x = 200.5, y = 80.5, hp = 50, maxHp = 50, civ = 1 };   // 友军（civ===src）
            var geared = new WbU { id = 2, race = 0, x = 200.9, y = 80.5, hp = 50, maxHp = 50, civ = 2 };   // 敌军带甲
            w.units.Add(friend); w.units.Add(geared);
            w.rel["1-2"] = -30;
            w.effects.Add(new WbFx { kind = "arrow", x = 200.5, y = 80.5, ttl = 1, age = 0, r = 1, src = 1, dmg = 6 });
            w.RebuildBuckets();
            w.rngA = 0x0A0E11u;
            var gear0 = WbBailRelay.GearBonusHook;
            try
            {
                WbBailRelay.GearBonusHook = (ww, u) => new WbGearBonus { armor = u.id == 2 ? 8 : 0, speed = 1 };   // 链甲 armor=8（gen 快照同构）
                w.tickCount++;
                WbBailRelay.EffectsTick(w);
                Assert.That(F64Hex(friend.hp), Is.EqualTo(F64Hex(50)), "友军豁免（L10266 civ===src）");
                Assert.That(friend.hurt, Is.EqualTo(0), "友军零伤");
                Assert.That(F64Hex(geared.hp), Is.EqualTo(F64Hex(44.48)), "armor 减伤位精确 6*(1-8/100)=5.52 → 44.48（L10276）");
                Assert.That(geared.hurt, Is.EqualTo(20), "hurt 20");
                Assert.That(F64Hex(geared.hp) == F64Hex(44.48) && geared.hp == 50 - 6 * (1 - 8.0 / 100), Is.True, "位级一致性（f64 6*(1-0.08)）");
            }
            finally
            {
                WbBailRelay.GearBonusHook = gear0;
            }
        }

        [Test]
        public void Test37_Arrow_UndefinedSrc_HitsCivToo()
        {
            var w = new WbWorld();                                    // src undefined 语义：不豁免任何单位（L10266 !== undefined 门）
            w.tickCount = 16001;
            for (int y = 78; y < 83; y++) for (int x = 198; x < 203; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var sheep = new WbU { id = 1, race = 6, x = 200.5, y = 80.5, hp = 5, maxHp = 50 };
            w.units.Add(sheep);
            w.effects.Add(new WbFx { kind = "arrow", x = 200.5, y = 80.5, ttl = 1, age = 0, r = 1, dmg = 12 });   // src 缺位
            w.RebuildBuckets();
            w.rngA = 0x0A0E11u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(sheep.dead != 0, Is.True, "src undefined → 无豁免 → 命中（12 ≥ 5 → dead）");
            Assert.That(F64Hex(sheep.hp), Is.EqualTo(F64Hex(-7)), "final=12（非 civ 免 gearBonus——L10275 isCiv 门）");
            Assert.That(w.effects.Any(f2 => f2.kind == "dmg"), Is.True, "dmgNumbers final>=10 短路必发（L10280）");
        }

        [Test]
        public void Test37_Bullet_OrphanBuilding_NonWarRel()
        {
            var w = new WbWorld();                                    // 建筑支五重门（L10288-10291）
            w.tickCount = 17000;
            for (int y = 58; y < 63; y++) for (int x = 98; x < 103; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            int orphan = 60 * WbWorld.W + 100;                        // 孤儿建筑格：building>0 无 bIdx 记录
            w.building[orphan] = 1;
            int farm = 60 * WbWorld.W + 102;                          // FARM civ=2 + 非战 rel=10
            w.building[farm] = 4;
            w.buildings.Add(new WbBuilding { i = farm, x = 102, y = 60, kind = 4, civ = 2 });
            w.bIdx[farm] = 0;
            w.rel["1-2"] = 10;                                        // 非战（atWar <-20 门 false）
            w.effects.Add(new WbFx { kind = "bullet", x = 100.5, y = 60.5, ttl = 1, age = 0, r = 1, src = 3, dmg = 8 });
            w.effects.Add(new WbFx { kind = "bullet", x = 102.5, y = 60.5, ttl = 1, age = 0, r = 1, src = 1, dmg = 8 });
            w.RebuildBuckets();
            w.rngA = 0x0A0E12u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.bHp.ContainsKey(orphan), Is.False, "孤儿建筑格 skip（L10289 bIdx OOB → undefined 镜像）");
            Assert.That(w.bHp.ContainsKey(farm), Is.False, "非战 rel skip（L10290 atWar false——零写面）");
            Assert.That(w.damagedSet.Count, Is.EqualTo(0), "damagedSet 零写面");
            Assert.That(w.buildings.Count, Is.EqualTo(1), "建筑零摧毁");
        }

        // ================= Test38：M-U10d shell/missile 直测（shellBurst L9595-9620 + shell L10295-10301 + missile L10302-10310 + Nuke L12255-12260） =================

        [Test]
        public void Test38_ShellBurst_FalloffClamp_NoSrcExempt()
        {
            var w = new WbWorld();                                    // 单位环无 src 豁免（L9596-9607 蓝本无门——己军同溅射钉）
            w.tickCount = 18000;
            for (int y = 58; y < 63; y++) for (int x = 98; x < 103; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var near = new WbU { id = 1, race = 6, x = 100.5, y = 60.5, hp = 50, maxHp = 50 };          // d=0 → dmg 全额
            var ownTroop = new WbU { id = 2, race = 0, x = 100.5, y = 61.5, hp = 50, maxHp = 50, civ = 1 };   // 己军 civ===src d=1.0
            w.units.Add(near); w.units.Add(ownTroop);
            w.effects.Add(new WbFx { kind = "shell", x = 100.5, y = 60.5, ttl = 1, age = 0, r = 1, src = 1, dmg = 40, fire = 0 });
            w.rngA = 0x0A0E13u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(near.dead, Is.EqualTo(0), "d=0 → 40 全额 → hp 10 幸存（40×1=40）");
            Assert.That(F64Hex(near.hp), Is.EqualTo(F64Hex(10)), "d=0 falloff=1 位精确");
            Assert.That(F64Hex(ownTroop.hp), Is.EqualTo(F64Hex(50 - 40 * (1 - 1.0 / (1 + 0.4)))), "己军 d=1.0 falloff=1-1/1.4 → 40×(1-1/1.4)（无 src 豁免——同构表达式位级 f64）");
            Assert.That(ownTroop.hurt, Is.EqualTo(24), "hurt 24（L9601）");
            Assert.That(w.killCredit, Is.Null, "killCredit 恒 null（shell 无 wid——L10297 ?? null）");
        }

        [Test]
        public void Test38_Shell_BuildingRing_NoFriendlyGate()
        {
            var w = new WbWorld();                                    // 建筑环无友军门（L9614——己方住宅同账钉）+ shake min(5,1+r)
            w.tickCount = 18001;
            for (int y = 58; y < 63; y++) for (int x = 98; x < 103; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            int foe = 60 * WbWorld.W + 100;                           // 敵住宅 civ=2
            int own = 61 * WbWorld.W + 100;                           // 己方住宅 civ=1（与 src 同军）
            w.building[foe] = 1; w.building[own] = 1;
            w.buildings.Add(new WbBuilding { i = foe, x = 100, y = 60, kind = 1, civ = 2 });
            w.bIdx[foe] = 0;
            w.buildings.Add(new WbBuilding { i = own, x = 100, y = 61, kind = 1, civ = 1 });
            w.bIdx[own] = 1;
            w.effects.Add(new WbFx { kind = "shell", x = 100.5, y = 60.5, ttl = 1, age = 0, r = 1.6, src = 1, dmg = 30, fire = 0 });
            w.rngA = 0x0A0E13u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(F64Hex(w.bHp[foe]), Is.EqualTo(F64Hex(43)), "敵宅 70-30*0.9=43（L9614）");
            Assert.That(F64Hex(w.bHp[own]), Is.EqualTo(F64Hex(43)), "己宅同账 43（无友军门——机械保持）");
            Assert.That(w.damagedSet.Contains(foe) && w.damagedSet.Contains(own), Is.True, "damagedSet 双登记（attackBuilding hp>0 支）");
            Assert.That(w.effects.Count(f2 => f2.kind == "hit"), Is.EqualTo(2), "hit fx ×2（attackBuilding 双账——2 掷注入相）");
            Assert.That(w.shake, Is.EqualTo(2.6), "shake=min(5,1+1.6)=2.6（L9619）");
            Assert.That(w.fireSet.Count, Is.EqualTo(0), "fire:0 → ignite 门短路零掷（!!e.fire 假语义）");
        }

        [Test]
        public void Test38_Shell_WidKillCreditRoundtrip()
        {
            var w = new WbWorld();                                    // killCredit 归属/复位往返（L10297/L10299/L10300）+ 稀疏 boom 掷
            w.tickCount = 18002;
            for (int y = 68; y < 73; y++) for (int x = 128; x < 133; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            w.effects.Add(new WbFx { kind = "shell", x = 130.5, y = 70.5, ttl = 1, age = 0, r = 1, wid = 7, dmg = 10, fire = 0 });
            w.rngA = 0x0A0E13u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.killCredit, Is.Null, "终态 null（L10300 复位——wid 面记账即撤）");
            Assert.That(w.statNukes, Is.EqualTo(0), "statNukes 零写（shell 不触 Nuke）");
            Assert.That(w.effects.Any(f2 => f2.kind == "explosion"), Is.True, "fx explosion（L9618）");
        }

        [Test]
        public void Test38_Missile_RazeCascade_SiegeEvent()
        {
            var w = new WbWorld();                                    // 常规导弹 → FARM 摧毁 → onBuildingDestroyed raze 支（L4464-4498 war 结算面）
            w.tickCount = 19000;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            int farm = 60 * WbWorld.W + 100;
            w.building[farm] = 4;
            w.buildings.Add(new WbBuilding { i = farm, x = 100, y = 60, kind = 4, civ = 1 });
            w.bIdx[farm] = 0;
            w.rel["1-2"] = -30;
            w.civs.Add(null);                                         // civs[0] 稀疏位（黄金 civs0 通道同构）
            w.civs.Add(new WbCiv { id = 1, name = "青禾部落", colorHex = "#40a060", alive = true });
            w.civs.Add(new WbCiv { id = 2, name = "熔铁部族", colorHex = "#c04040", alive = true });
            var sheep = new WbU { id = 1, race = 6, x = 98.5, y = 58.5, hp = 50, maxHp = 50 };
            var human = new WbU { id = 2, race = 0, x = 100.5, y = 60.5, hp = 50, maxHp = 50, civ = 1 };
            w.units.Add(sheep); w.units.Add(human);
            w.effects.Add(new WbFx { kind = "missile", x = 100.5, y = 60.5, ttl = 1, age = 0, r = 2.8, src = 2, dmg = 60 });
            w.rngA = 0x0A0E16u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.buildings.Count, Is.EqualTo(0), "FARM 40-60*0.9=-14 → 摧毁（swap-pop 三账清）");
            Assert.That(w.bHp.Count, Is.EqualTo(0), "bHp 出账（destroyBuilding）");
            Assert.That(w.damagedSet.Count, Is.EqualTo(0), "damagedSet 出账");
            Assert.That(w.worldEvents.Count, Is.EqualTo(1), "raze 支 siege 纪事（capture 0.45 门未中——seed 钉）");
            Assert.That(w.worldEvents[0].kind, Is.EqualTo("siege"), "siege kind（L4496）");
            Assert.That(w.worldEvents[0].text, Is.EqualTo("「熔铁部族」的军队摧毁了「青禾部落」的农田"), "命名域文本（BUILD_NAME[4]=农田）");
            Assert.That(F64Hex(sheep.hp), Is.EqualTo(F64Hex(35)), "falloff 钳 0.25 支（60×0.25=15 → 35——d=2.828≥2.4）");
            Assert.That(human.dead != 0, Is.True, "d=0 → 60 全额 → dead（wwCountKill 桩形）");
            Assert.That(w.shake, Is.EqualTo(3.8), "shake=min(5,1+2.8)=3.8");
            Assert.That(w.killCredit, Is.Null, "killCredit 恒 null（missile 常规无 wid）");
            Assert.That(w.statNukes, Is.EqualTo(0), "statNukes 零写");
        }

        [Test]
        public void Test38_Missile_Nuke_MushroomRadiation()
        {
            var w = new WbWorld();                                    // 核弹头 → 蘑菇云（L10304-10306 nuke 门 + Nuke L12255 + explode 核域支）
            w.tickCount = 20000;
            for (int y = 53; y < 68; y++) for (int x = 93; x < 108; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            w.terrain[60 * WbWorld.W + 104] = WbWorld.T_MOUNTAIN;     // 幸存面（d=3.54 ≥1.8 非 LAVA + MOUNTAIN 非 BURNT）
            w.terrain[60 * WbWorld.W + 97] = WbWorld.T_WATER;         // isLand 整格跳（无 BURNT 无掷）
            var center = new WbU { id = 1, race = 6, x = 100.5, y = 60.5, hp = 250, maxHp = 500 };
            var mid = new WbU { id = 2, race = 6, x = 107.5, y = 60.5, hp = 500, maxHp = 500 };
            var far = new WbU { id = 3, race = 6, x = 110.5, y = 60.5, hp = 500, maxHp = 500 };
            w.units.Add(center); w.units.Add(mid); w.units.Add(far);
            w.effects.Add(new WbFx { kind = "missile", x = 100.5, y = 60.5, ttl = 1, age = 0, r = 0, dmg = 0, nuke = 1 });
            w.rngA = 0x0A0E15u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.statNukes, Is.EqualTo(1), "statNukes=1（L12256 成就计数）");
            Assert.That(w.worldEvents.Count, Is.EqualTo(2), "双 nuke 纪事（missile 支 + explode 核域支）");
            Assert.That(w.worldEvents[0].kind, Is.EqualTo("nuke"), "unshift 序：explode 后发先至（L10486）");
            Assert.That(w.worldEvents[0].text, Is.EqualTo("蘑菇云在大地上升起，幸存者将长久铭记这一天"), "explode 核域支纪事文本");
            Assert.That(w.worldEvents[1].text, Is.EqualTo("蘑菇云在战场上升起——核打击命中"), "missile 支纪事（L10305）");
            Assert.That(w.shake, Is.EqualTo(14), "shake=14（L10478 核域支 max）");
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_LAVA), "LAVA 内环（d=0.707<1.8——lava:true）");
            Assert.That(w.terrain[60 * WbWorld.W + 104], Is.EqualTo(WbWorld.T_MOUNTAIN), "MOUNTAIN 幸存（L10462 else-if）");
            Assert.That(w.terrain[60 * WbWorld.W + 97], Is.EqualTo(WbWorld.T_WATER), "WATER isLand 整格跳（L10460）");
            Assert.That(w.radSet.Count, Is.GreaterThan(70), "radSet 11×11<5 辐射圈（L10487-10497）");
            Assert.That(w.radiate[60 * WbWorld.W + 100], Is.EqualTo(1), "radiate=1 染毒");
            Assert.That(center.dead != 0, Is.True, "d=0 → 300 全额 → dead");
            Assert.That(F64Hex(mid.hp), Is.EqualTo(F64Hex(455)), "falloff 钳 0.15 支（300×0.15=45 → 455——d=7.0≥6.63）");
            Assert.That(F64Hex(far.hp), Is.EqualTo(F64Hex(500)), "d=10>r+0.8=7.8 出环");
            Assert.That(w.killCredit, Is.Null, "killCredit 恒 null（missile 核支无 wid 面）");
        }
    }
}
