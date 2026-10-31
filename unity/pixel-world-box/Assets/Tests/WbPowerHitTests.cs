// ============================================================
// WbPowerHitTests.cs — M-U10c effectsTick 命中族三 kind + explode 消费面直测（NUnit）
// 范围: meteor L10237-10239 / fireball L10240-10254 / arrow·bullet L10255-10294 +
//   explode L10450-10499（黄金回放主面在 WbPowerTests.Test35——power.json 26 场景全量逐位；
//   本文件钉语义门与蓝本异形面）+ M-U10d shell/missile + M-U10e airstrike/drone/mech
//   + M-U10f laser L10323-10353（光束线杀伤四几何支/dmgNumbers 门短路/退化 llen||1 护栏）。
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
                double ex0 = F64FromHex(eo.Value<string>("x")), ey0 = F64FromHex(eo.Value<string>("y"));
                w.effects.Add(new WbFx
                {
                    kind = eo.Value<string>("kind"),
                    x = ex0,
                    y = ey0,
                    x0 = eo["x0"] != null && eo["x0"].Type != JTokenType.Null ? F64FromHex(eo.Value<string>("x0")) : ex0,   // M-U10e 稀疏 x0/y0（HitKeys 四 kind 不消费——防御性对齐 WbPowerTests 同构）
                    y0 = eo["y0"] != null && eo["y0"].Type != JTokenType.Null ? F64FromHex(eo.Value<string>("y0")) : ey0,
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

        // ================= Test39：M-U10e airstrike/drone/mech 直测（L10311-10322/L10353-10368/L10394-10414 + FxOptHook src 缝隙清偿钉） =================

        [Test]
        public void Test39_Airstrike_Trajectory_PeriodicFinale()
        {
            var w = new WbWorld();                                    // 航线插值周期投弹（age16 at=16/18 位级）+ S2 空转零掷 + S3 终点
            w.tickCount = 21000;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var sheep = new WbU { id = 1, race = 6, x = 100.5, y = 60.5, hp = 50, maxHp = 50, civ = 2 };
            w.units.Add(sheep);
            w.effects.Add(new WbFx { kind = "airstrike", x = 100.5, y = 60.5, x0 = 96.5, y0 = 56.5, ttl = 18, age = 15, src = 1, dmg = 30, r = 1.4 });
            w.rngA = 0x0A0E17u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // age 16：at=16/18=0.889<0.92 → 周期 shellBurst(ax,ay,1.2,22,fire?,1)
            double ax16 = 96.5 + (100.5 - 96.5) * (16.0 / 18.0), ay16 = 56.5 + (60.5 - 56.5) * (16.0 / 18.0);
            var exp1 = w.effects.Single(f => f.kind == "explosion");
            Assert.That(F64Hex(exp1.x), Is.EqualTo(F64Hex(ax16)), "周期弹落点 = 航线插值位精确（L10313）");
            Assert.That(F64Hex(exp1.y), Is.EqualTo(F64Hex(ay16)), "ay 同构");
            Assert.That(exp1.r, Is.EqualTo(1.2), "周期弹 r=1.2（L10316）");
            Assert.That(sheep.hp, Is.LessThan(50), "周期弹 d=0.628<1.6 入环减伤");
            uint rngAfterS1 = w.rngA;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // age 17：17%16≠0 → 空转零掷
            Assert.That(w.rngA, Is.EqualTo(rngAfterS1), "S2 零掷（合取门短路——rngA 不动）");
            Assert.That(w.effects.Count(f2 => f2.kind == "explosion"), Is.EqualTo(1), "S2 无新弹");
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // age 18：终点 shellBurst(100.5,60.5,1.4,30,true) + splice
            Assert.That(w.effects.Any(f2 => f2.kind == "airstrike"), Is.False, "终点 splice（L10439）");
            var exp2 = w.effects.First(f2 => f2.kind == "explosion" && f2.r == 1.4);   // 终点弹判别面（r=1.4 ≠ 周期弹 1.2）
            Assert.That(F64Hex(exp2.x), Is.EqualTo(F64Hex(100.5)), "终点弹落点 = e.x（L10319）");
            Assert.That(exp2.r, Is.EqualTo(1.4), "r||1.8——r=1.4 真值保真");
            Assert.That(w.shake, Is.EqualTo(2.4), "shake=min(5,1+1.4)=2.4（两弹 max）");

            var w2 = new WbWorld();                                   // r=0 falsy → 终点 r||1.8 回退支（L10319）
            w2.tickCount = 21001;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w2.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var mid = new WbU { id = 1, race = 6, x = 102.5, y = 60.5, hp = 50, maxHp = 50 };   // d=2.0：>1.8 出 r1.4 环 / <2.2 入 r1.8 环（判别带）
            w2.units.Add(mid);
            w2.effects.Add(new WbFx { kind = "airstrike", x = 100.5, y = 60.5, ttl = 18, age = 17, src = 1, dmg = 30, r = 0 });
            w2.rngA = 0x0A0E17u;
            w2.tickCount++;
            WbBailRelay.EffectsTick(w2);
            Assert.That(mid.hp, Is.LessThan(50), "r=0 → ||1.8 回退：d=2.0 < 2.2 入环（回退支位证——r1.4 时 2.0>1.8 出环）");
        }

        [Test]
        public void Test39_Drone_KillCreditRoundtrip_EmergentGate()
        {
            var w = new WbWorld();                                    // 终点集束 (dmg??14)*2.6 位级 + fire=true ignite + wid=7 killCredit 往返/emergentPayload 桩门
            w.tickCount = 22000;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var mid = new WbU { id = 1, race = 6, x = 100.5, y = 61.5, hp = 50, maxHp = 50 };   // d=1.0 < 3.0 入环
            w.units.Add(mid);
            w.effects.Add(new WbFx { kind = "drone", x = 100.5, y = 60.5, x0 = 96.5, y0 = 56.5, ttl = 14, age = 13, src = 1, dmg = 14, r = 2.6, wid = 7 });
            w.rngA = 0x0A0E18u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // age 14：14%12≠0 零周期 → 终点集束
            Assert.That(F64Hex(mid.hp), Is.EqualTo(F64Hex(50 - (14 * 2.6) * (1 - 1.0 / (2.6 + 0.4)))), "集束 dmg=(dmg??14)*2.6 falloff d=1.0 位精确（L10364→L9600）");
            Assert.That(mid.hurt, Is.EqualTo(24), "hurt 24（shellBurst 面）");
            Assert.That(w.fireSet.Count, Is.GreaterThan(0), "终点 fire=true → GRASS ignite（seed 0x0A0E18 钉 14 格）");
            Assert.That(w.radSet.Count, Is.EqualTo(0), "emergentPayload 桩早退零写（wid=7 门过——铸域空表 L9399）");
            Assert.That(w.killCredit, Is.Null, "killCredit 终态 null（L10363 set → L10366 复位往返）");
            Assert.That(w.effects.Any(f2 => f2.kind == "drone"), Is.False, "终点 splice");

            var w2 = new WbWorld();                                   // 周期支 fire 恒 false → GRASS 零 ignite（L10359）
            w2.tickCount = 22001;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w2.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            w2.effects.Add(new WbFx { kind = "drone", x = 100.5, y = 60.5, x0 = 96.5, y0 = 56.5, ttl = 14, age = 11, src = 1, dmg = 14, r = 2.6, wid = 7 });
            w2.rngA = 0x0A0E18u;
            w2.tickCount++;
            WbBailRelay.EffectsTick(w2);                              // age 12：12%12===0 && dt=0.857<0.92 → 周期 shellBurst(…,1.0,14,false,…)
            Assert.That(w2.fireSet.Count, Is.EqualTo(0), "周期 fire=false → 零 ignite 掷零入账（L10359）");
            Assert.That(w2.shake, Is.EqualTo(2.0), "shake=min(5,1+1.0)=2.0（周期弹 r=1.0）");
        }

        [Test]
        public void Test39_Mech_SrcExemptZeroDraw_BulletOFace()
        {
            var wA = new WbWorld();                                   // A 世界：友军+敌军+界外三单位
            wA.tickCount = 23000;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) wA.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var humanA = new WbU { id = 1, race = 0, x = 100.0, y = 60.0, hp = 50, maxHp = 50, civ = 1 };   // 圈内 civ===src → 豁免前置
            var sheepA = new WbU { id = 2, race = 6, x = 100.5, y = 60.5, hp = 50, maxHp = 50 };            // 圈内 d=0.808 → 1 掷
            var farA = new WbU { id = 3, race = 6, x = 105.5, y = 70.5, hp = 50, maxHp = 50 };              // d≈11.9 出环 → 零掷
            wA.units.Add(humanA); wA.units.Add(sheepA); wA.units.Add(farA);
            wA.effects.Add(new WbFx { kind = "mech", x = 100.5, y = 60.5, x0 = 96.5, y0 = 56.5, ttl = 14, age = 11, src = 1, dmg = 45, r = 2.2 });
            wA.rngA = 0x0A0E19u;
            wA.tickCount++;
            WbBailRelay.EffectsTick(wA);                              // age 12：周期机炮扫射
            var wB = new WbWorld();                                   // B 世界：无友军（对照——掷链同构证豁免零掷）
            wB.tickCount = 23000;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) wB.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var sheepB = new WbU { id = 2, race = 6, x = 100.5, y = 60.5, hp = 50, maxHp = 50 };
            var farB = new WbU { id = 3, race = 6, x = 105.5, y = 70.5, hp = 50, maxHp = 50 };
            wB.units.Add(sheepB); wB.units.Add(farB);
            wB.effects.Add(new WbFx { kind = "mech", x = 100.5, y = 60.5, x0 = 96.5, y0 = 56.5, ttl = 14, age = 11, src = 1, dmg = 45, r = 2.2 });
            wB.rngA = 0x0A0E19u;
            wB.tickCount++;
            WbBailRelay.EffectsTick(wB);
            Assert.That(humanA.hp, Is.EqualTo(50), "友军豁免零伤（L10401 前置）");
            Assert.That(wA.rngA, Is.EqualTo(wB.rngA), "豁免零掷位证：含友军世界 rngA ≡ 不含世界（距离门前短路——若豁免后置则多 1 掷）");
            Assert.That(F64Hex(sheepA.hp), Is.EqualTo(F64Hex(sheepB.hp)), "敌军减伤不受友军在场影响（掷流同构）");
            Assert.That(farA.hp, Is.EqualTo(50), "d>2.4 出环零掷零伤");
            double mx12 = 96.5 + (100.5 - 96.5) * (12.0 / 14.0), my12 = 56.5 + (60.5 - 56.5) * (12.0 / 14.0);
            var bullet = wA.effects.Single(f2 => f2.kind == "bullet");
            Assert.That(F64Hex(bullet.x0), Is.EqualTo(F64Hex(mx12)), "曳光 o 面 x0=mx 插值位精确（L10408）");
            Assert.That(F64Hex(bullet.y0), Is.EqualTo(F64Hex(my12)), "y0=my 同构");
            Assert.That(bullet.src.HasValue && bullet.src.Value == 1, Is.True, "曳光 src=e.src（FxOptHook src 缝隙清偿面）");
            Assert.That(bullet.r, Is.EqualTo(0), "r:0");
            Assert.That(bullet.dmg.HasValue && bullet.dmg.Value == 0, Is.True, "dmg:0");
            wA.tickCount++;
            WbBailRelay.EffectsTick(wA);                              // age 13：13%12≠0 空转
            wA.tickCount++;
            WbBailRelay.EffectsTick(wA);                              // age 14：终点 shellBurst 无 src 豁免 → 友军同账（M-U10d 异形再钉）
            Assert.That(F64Hex(humanA.hp), Is.EqualTo(F64Hex(50 - 45 * (1 - WbMath.FdHypot(0.5, 0.5) / (2.2 + 0.4)))), "终点 shellBurst 无 src 豁免：d=0.707 falloff 位级（L10411→L9600）");
            Assert.That(sheepA.dead != 0, Is.True, "d=0 → 45 全额 → dead");
        }

        [Test]
        public void Test39_FxSeam_SrcRepair_CastShapeExempt()
        {
            var w = new WbWorld();                                    // M-U10e 缝隙清偿钉：FxOptHook src 参 → WbFx.src（M-U7s 期仅写 civ 槽——弹支豁免消费面失联）
            w.tickCount = 24000;
            for (int y = 58; y < 63; y++) for (int x = 98; x < 103; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var friendly = new WbU { id = 1, race = 0, x = 102.2, y = 60.5, hp = 50, maxHp = 50, civ = 1 };   // 距弹着 0.3（若无豁免则被误伤）
            var foe = new WbU { id = 2, race = 6, x = 103.0, y = 60.5, hp = 50, maxHp = 50, civ = 2 };       // 距弹着 0.5
            w.units.Add(friendly); w.units.Add(foe);
            WbBailRelay.FxOptHook(w, "bullet", 102.5, 60.5, 1, 100.5, 60.5, 1, 0.0, 8.0);   // 模拟 castBullet 生成面（src=civ1——L4375 opts）
            var bullet = w.effects.Single(f2 => f2.kind == "bullet");
            Assert.That(bullet.src.HasValue && bullet.src.Value == 1, Is.True, "缝隙修复：FxOptHook src 参落 WbFx.src（原仅写 civ 槽）");
            Assert.That(bullet.civ.HasValue && bullet.civ.Value == 1, Is.True, "civ 槽写入保留（渲染铁律字段只加不改）");
            w.RebuildBuckets();
            w.rngA = 0x0A0E12u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // 弹 expiry：桶扫描最近命中——友军豁免后命中敌军
            Assert.That(friendly.hp, Is.EqualTo(50), "豁免生效：civ===src 友军零伤（L10266）");
            Assert.That(F64Hex(foe.hp), Is.EqualTo(F64Hex(42)), "敌军命中 50-8=42（dmg=8 无 armor）");
            Assert.That(foe.hurt, Is.EqualTo(20), "hurt 20（L10278）");
        }

        // ================= Test40：M-U10f laser 直测（L10323-10353——光束线杀伤四几何支 + dmgNumbers 门短路位证 + 退化 llen||1 护栏 + 豁免/dead 前置零掷位证 + 空转零掷） =================

        /// mulberry32 状态推进（noise.ts L3-13——每次 rng() 消费状态 +0x6D2B79F5；uint 环绕 ≡ JS |0 位型）
        private static uint MulAdv(uint a, int n) { while (n-- > 0) a = a + 0x6D2B79F5u; return a; }

        [Test]
        public void Test40_Laser_BeamGeometry_GoldenMirror()
        {
            // 黄金 S25 镜像（seed 0x0A0E1A 同流）：四几何支位级 + 豁免/dead 跳过 + dmg fx 归属 + killCredit 往返
            var w = new WbWorld();
            w.tickCount = 24000;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            double L = WbMath.FdHypot(4, 4), ux = 4 / L, uy = 4 / L;   // 蓝本同式：llen=hypot(4,4)、lux=luy=4/llen（L10329-L10331）
            var u0 = new WbU { id = 1, race = 0, x = 96.5 + ux * 2.5, y = 56.5 + uy * 2.5, hp = 50, maxHp = 50 };    // 线上中段：0.7× 支
            var u1 = new WbU { id = 2, race = 0, x = 96.5 + ux * 5.4, y = 56.5 + uy * 5.4, hp = 50, maxHp = 50 };    // 焦点末段 t/llen≈0.955>0.85：全伤支
            var u2 = new WbU { id = 3, race = 0, x = 100.5 + ux * 0.5, y = 60.5 + uy * 0.5, hp = 50, maxHp = 50 };   // 终点外投影钳 llen → 比值 1：全伤支
            var u3 = new WbU { id = 4, race = 0, x = 96.5 - ux * 0.5, y = 56.5 - uy * 0.5, hp = 50, maxHp = 50 };    // 起点外投影钳 0 → 比值 0：0.7× 支
            var u4 = new WbU { id = 5, race = 0, x = 110.5, y = 70.5, hp = 50, maxHp = 50 };                         // 远离线 d≈14.14：零掷零伤
            var u5 = new WbU { id = 6, race = 0, x = 96.5 + ux * 3.5, y = 56.5 + uy * 3.5, hp = 50, maxHp = 50, civ = 1 };   // src=1 豁免前置
            var u6 = new WbU { id = 7, race = 0, x = 96.5 + ux * 2.0, y = 56.5 + uy * 2.0, hp = 10, maxHp = 50, dead = 1 };  // dead 跳过（L10335）
            w.units.Add(u0); w.units.Add(u1); w.units.Add(u2); w.units.Add(u3); w.units.Add(u4); w.units.Add(u5); w.units.Add(u6);
            w.effects.Add(new WbFx { kind = "laser", x = 100.5, y = 60.5, ttl = 10, x0 = 96.5, y0 = 56.5, src = 1, dmg = 30, wid = 7, age = 9 });
            w.rngA = 0x0A0E1Au;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // age 9→10 = ttl：光束命中（黄金 S25 同 16 掷流）
            Assert.That(F64Hex(u0.hp), Is.EqualTo(F64Hex(50 - 30 * 0.7)), "线上中段 0.7×支位级（t/llen≈0.44≤0.85 → ldmg*0.7——L10342）");
            Assert.That(F64Hex(u1.hp), Is.EqualTo(F64Hex(20)), "焦点末段全伤支位级（t/llen≈0.955>0.85 → ldmg——L10342）");
            Assert.That(F64Hex(u2.hp), Is.EqualTo(F64Hex(20)), "终点外投影钳 llen → 比值 1 全伤支位级（L10339 Math.min 面）");
            Assert.That(F64Hex(u3.hp), Is.EqualTo(F64Hex(50 - 30 * 0.7)), "起点外投影钳 0 → 比值 0 的 0.7×支位级（L10339 Math.max 面）");
            Assert.That(u4.hp, Is.EqualTo(50), "远离线零伤零掷（d=hypot(10,10)≥0.75——L10341 距离门）");
            Assert.That(u5.hp, Is.EqualTo(50), "src 豁免零伤（civ===src——L10336 距离门前短路）");
            Assert.That(u6.hp == 10 && u6.dead != 0, Is.True, "dead=1 循环头跳过（L10335）——hp/dead 不动");
            Assert.That(u0.hurt, Is.EqualTo(22), "hurt=22（L10344）");
            Assert.That(w.killCredit == null, Is.True, "killCredit wid=7 往返复位（L10333 写/L10351 复位）");
            Assert.That(w.effects.Count(f => f.kind == "hit"), Is.EqualTo(4), "hit fx ×4（每命中单位 1 枚——L10345）");
            Assert.That(w.effects.Count(f => f.kind == "dmg"), Is.EqualTo(1), "dmg fx ×1（dmgNumbers 门真引擎默认 true L271——u3 roll 0.3951<0.4 掷中）");
            var dmg = w.effects.Single(f => f.kind == "dmg");
            Assert.That(F64Hex(dmg.x) == F64Hex(u3.x) && F64Hex(dmg.y) == F64Hex(u3.y), Is.True, "dmg fx 归属 u3（fx('dmg',u.x,u.y)——L10346）");
            Assert.That(dmg.text, Is.EqualTo("-21"), "text '-'+Math.round(30*0.7)='-21'（L10346 text 携带面——M-U3h 第五批维度）");
            var boom = w.effects.Single(f => f.kind == "explosion");
            Assert.That(boom.r, Is.EqualTo(0.8), "终点小爆破 {r:0.8}（L10352）");
            Assert.That(w.rngA, Is.EqualTo(0xd2c1ad6au), "final rngA ≡ 黄金 S25（16 掷流位级闭合——4×hit2+4×roll+dmg fx2+explosion2）");
        }

        [Test]
        public void Test40_Laser_Degenerate_LlenGuard()
        {
            // 黄金 S26 镜像（seed 0x0A0E1B 同流）：无 x0/y0/src/dmg/wid 夹具——fx() 默认 x0=x → ldx=ldy=0 → llen=0||1=1 护栏支
            var w = new WbWorld();
            w.tickCount = 25000;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var a = new WbU { id = 1, race = 0, x = 101.0, y = 61.0, hp = 50, maxHp = 50 };   // d=hypot(0.5,0.5)≈0.707<0.75：命中
            var b = new WbU { id = 2, race = 0, x = 101.5, y = 60.5, hp = 50, maxHp = 50 };   // d=hypot(1.0,0)=1.0≥0.75：零掷零伤
            w.units.Add(a); w.units.Add(b);
            w.effects.Add(new WbFx { kind = "laser", x = 100.5, y = 60.5, ttl = 8, x0 = 100.5, y0 = 60.5, age = 7 });   // x0=x/y0=y 直写 ≡ fx() 默认（fixture 稀疏缺键同构）
            w.rngA = 0x0A0E1Bu;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // age 7→8 = ttl：退化点爆（黄金 S26 同 7 掷流）
            Assert.That(F64Hex(a.hp), Is.EqualTo(F64Hex(50 - 30 * 0.7)), "llen=0||1=1 回退 + lux=luy=0 → t=0 → 0.7×支 + ldmg ?? 30 缺位钉（L10329/L10332）");
            Assert.That(b.hp, Is.EqualTo(50), "d=1.0≥0.75 距离门零伤（L10341）");
            Assert.That(w.killCredit == null, Is.True, "killCredit ?? null 双写往返（L10333/L10351——wid 缺位）");
            Assert.That(w.effects.Count(f => f.kind == "hit"), Is.EqualTo(1), "hit fx ×1（L10345）");
            Assert.That(w.effects.Single(f => f.kind == "dmg").text, Is.EqualTo("-21"), "dmg fx text（S26 roll 掷中——同 '-21'）");
            Assert.That(w.effects.Single(f => f.kind == "explosion").r, Is.EqualTo(0.8), "explosion {r:0.8}（L10352）");
            Assert.That(w.rngA, Is.EqualTo(0xfc3a63ceu), "final rngA ≡ 黄金 S26（7 掷流位级闭合）");
        }

        [Test]
        public void Test40_Laser_DmgNumbersGate_ShortCircuitBitProof()
        {
            // dmgNumbers 门短路位证：门真 → 恰 1 roll 掷（+掷中 2 fx 掷）；门假 → 零掷——同种子对照世界 rngA 差恰 3/1 掷
            double L = WbMath.FdHypot(4, 4), ux = 4 / L, uy = 4 / L;
            WbWorld MkWorld(bool dmgNumbers, uint seed)
            {
                var w2 = new WbWorld();
                w2.tickCount = 24000;
                for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w2.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
                w2.units.Add(new WbU { id = 1, race = 0, x = 96.5 + ux * 2.5, y = 56.5 + uy * 2.5, hp = 50, maxHp = 50 });
                w2.effects.Add(new WbFx { kind = "laser", x = 100.5, y = 60.5, ttl = 10, x0 = 96.5, y0 = 56.5, dmg = 30, age = 9 });
                w2.fxDmgNumbers = dmgNumbers;                        // 真引擎 fxPrefs.dmgNumbers 默认 true L271——门面直控
                w2.rngA = seed;
                w2.tickCount++;
                WbBailRelay.EffectsTick(w2);
                return w2;
            }
            // 支 1：seed 0x0A0E23（首 roll 0.3951<0.4 掷中——mulberry 前置预演钉）
            var wA = MkWorld(true, 0x0A0E23u);
            var wB = MkWorld(false, 0x0A0E23u);
            Assert.That(wA.effects.Count(f => f.kind == "dmg"), Is.EqualTo(1), "门真+掷中 → dmg fx 发射（L10346）");
            Assert.That(wA.effects.Single(f => f.kind == "dmg").text, Is.EqualTo("-21"), "text '-21'（final=30*0.7 → Math.round=21）");
            Assert.That(wB.effects.Count(f => f.kind == "dmg"), Is.EqualTo(0), "门假 → 零发射（短路——L10346 && 左支）");
            Assert.That(F64Hex(wA.units[0].hp), Is.EqualTo(F64Hex(wB.units[0].hp)), "hp 与 fx 门无关（u.hp -= final 在掷前）");
            Assert.That(MulAdv(wB.rngA, 3), Is.EqualTo(wA.rngA), "rngA 差恰 3 掷（roll 1 + dmg fx seed/dir 2）——门真多掷位证");
            // 支 2：seed 0x0A0E22（首 roll ≥0.4 不掷中）
            var wA2 = MkWorld(true, 0x0A0E22u);
            var wB2 = MkWorld(false, 0x0A0E22u);
            Assert.That(wA2.effects.Count(f => f.kind == "dmg"), Is.EqualTo(0), "门真+未掷中 → 零发射（40% 门反面）");
            Assert.That(wB2.effects.Count(f => f.kind == "dmg"), Is.EqualTo(0), "门假 → 零发射");
            Assert.That(MulAdv(wB2.rngA, 1), Is.EqualTo(wA2.rngA), "rngA 差恰 1 掷（roll 本身）——短路消耗位证（门假零掷）");
        }

        [Test]
        public void Test40_Laser_ExemptDeadSkip_IdleZeroDraw()
        {
            // 豁免/dead 前置零掷对照世界位证（Test39 mech 先例同构）+ 空转步零掷
            double L = WbMath.FdHypot(4, 4), ux = 4 / L, uy = 4 / L;
            WbWorld MkWorld(bool withUnits, uint seed)
            {
                var w2 = new WbWorld();
                w2.tickCount = 24000;
                for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) w2.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
                if (withUnits)
                {
                    w2.units.Add(new WbU { id = 1, race = 0, x = 96.5 + ux * 3.5, y = 56.5 + uy * 3.5, hp = 50, maxHp = 50, civ = 1 });   // src=1 豁免（线上）
                    w2.units.Add(new WbU { id = 2, race = 0, x = 96.5 + ux * 2.0, y = 56.5 + uy * 2.0, hp = 10, maxHp = 50, dead = 1 });  // dead 跳过（线上）
                }
                w2.effects.Add(new WbFx { kind = "laser", x = 100.5, y = 60.5, ttl = 10, x0 = 96.5, y0 = 56.5, src = 1, dmg = 30, age = 9 });
                w2.rngA = seed;
                w2.tickCount++;
                WbBailRelay.EffectsTick(w2);
                return w2;
            }
            var wE1 = MkWorld(true, 0x0A0E1Au);
            var wE2 = MkWorld(false, 0x0A0E1Au);                      // 同种子无单位对照——豁免/dead 若误耗掷则 rngA 必异
            Assert.That(wE1.rngA, Is.EqualTo(wE2.rngA), "豁免+dead 世界 rngA ≡ 无单位世界——二跳过面距离门前零掷位证（L10335/L10336）");
            Assert.That(wE1.effects.Count(f => f.kind == "explosion"), Is.EqualTo(1), "终点小爆破常在（L10352）");
            Assert.That(wE1.units[0].hp, Is.EqualTo(50), "豁免单位零伤");
            Assert.That(wE1.units[1].hp == 10 && wE1.units[1].dead != 0, Is.True, "dead 单位 hp/dead 不动");
            // 空转步：age 7→8 <ttl——无周期相单调到期（laser 仅 ttl 单发——空转零掷）
            var wI = new WbWorld();
            wI.tickCount = 24000;
            for (int y = 56; y < 65; y++) for (int x = 96; x < 105; x++) wI.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            wI.units.Add(new WbU { id = 1, race = 0, x = 96.5 + ux * 2.5, y = 56.5 + uy * 2.5, hp = 50, maxHp = 50 });
            wI.effects.Add(new WbFx { kind = "laser", x = 100.5, y = 60.5, ttl = 10, x0 = 96.5, y0 = 56.5, src = 1, dmg = 30, age = 7 });
            wI.rngA = 0x0A0E1Au;
            wI.tickCount++;
            WbBailRelay.EffectsTick(wI);                              // age 7→8：空转
            Assert.That(wI.rngA, Is.EqualTo(0x0A0E1Au), "空转步零掷——rngA 不动（age<ttl 无支触达）");
            Assert.That(wI.units[0].hp == 50 && wI.units[0].hurt == 0, Is.True, "空转单位零伤零 hurt");
            Assert.That(wI.effects.Count, Is.EqualTo(1), "laser 未 splice 未产 fx（age<ttl——L10439 门未开）");
        }

        // ================= Test41：M-U10g orbital 直测（L10370-10388——ttl 到期单发：shellBurst(4.5,120,fire) + 焦化环 rng<0.8 四门短路 + superweapon 纪事 + shake=9 + 山/水/界外零掷 + 空转零掷） =================

        [Test]
        public void Test41_Orbital_GoldenMirror()
        {
            // 黄金 S27 镜像（seed 0x0A0E1C 同流，两步 tick ≡ stepsSnap 逐位）：全支位级 + fireSet=4 + 纪事 + killCredit 往返
            var w = new WbWorld();
            w.tickCount = 26000;
            for (int i = 0; i < w.terrain.Length; i++) w.terrain[i] = WbWorld.T_GRASS;   // gen 手术一全图 GRASS 同构（焦化环 xx∈[96..105]/yy∈[56..65] 与 fire 面 rr=5 域均须陆地掷面）
            w.terrain[58 * WbWorld.W + 98] = WbWorld.T_MOUNTAIN; w.terrain[58 * WbWorld.W + 99] = WbWorld.T_MOUNTAIN;   // 山格：isLand true 但 MOUNTAIN 豁免——fire/焦化双面零掷
            w.terrain[62 * WbWorld.W + 102] = WbWorld.T_MOUNTAIN; w.terrain[62 * WbWorld.W + 103] = WbWorld.T_MOUNTAIN;
            w.terrain[61 * WbWorld.W + 97] = WbWorld.T_WATER; w.terrain[61 * WbWorld.W + 98] = WbWorld.T_WATER;         // 水格：isLand false——双面零掷
            w.terrain[59 * WbWorld.W + 103] = WbWorld.T_WATER; w.terrain[59 * WbWorld.W + 104] = WbWorld.T_WATER;
            var u0 = new WbU { id = 1, race = 0, x = 100.5, y = 60.5, hp = 50, maxHp = 50 };    // 中心 d=0 → 120 伤死
            var u1 = new WbU { id = 2, race = 0, x = 104.5, y = 64.5, hp = 50, maxHp = 50 };    // d=hypot(4,4)=5.657≥4.9 零伤
            var u2 = new WbU { id = 3, race = 0, x = 101.5, y = 60.5, hp = 50, maxHp = 50, dead = 1 };   // dead 循环头跳过
            var u3 = new WbU { id = 4, race = 0, x = 100.5, y = 61.5, hp = 50, maxHp = 50 };    // d=1 → 120*(1-1/4.9) 死
            w.units.Add(u0); w.units.Add(u1); w.units.Add(u2); w.units.Add(u3);
            w.effects.Add(new WbFx { kind = "orbital", x = 100.5, y = 60.5, ttl = 12, src = 1, wid = 7, age = 10 });
            w.rngA = 0x0A0E1Cu;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // k0：age 10→11 <12 空转（黄金 stepsSnap[0].rngA=000a0e1c=seed 自身）
            Assert.That(w.rngA, Is.EqualTo(0x0A0E1Cu), "k0 空转零掷位证——rngA ≡ seed（无周期相单调到期，黄金 S27 步 0 同值）");
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // k1：age 11→12 = ttl：轨道天罚（黄金 S27 同 156 掷流）
            Assert.That(u0.dead != 0, Is.True, "中心单位 shellBurst 120 伤死（d=0——L9599 无 src 豁免）");
            Assert.That(u3.dead != 0, Is.True, "近点单位死（d=1 → 120*(1-1/4.9)≈95.51>50——L9601 falloff）");
            Assert.That(F64Hex(u1.hp), Is.EqualTo(F64Hex(50)), "远点零伤（d=5.657≥r+0.4=4.9——L9600 距离门）");
            Assert.That(u2.hp == 50 && u2.dead == 1, Is.True, "dead=1 数值型保持（M-U10f 教训面——注入直写非 wwCountKill 置位）");
            Assert.That(w.killCredit == null, Is.True, "killCredit wid=7 往返复位（L10373 写/L10386 复位）");
            Assert.That(w.shake, Is.EqualTo(9), "shake=9（L10387 Max 覆盖 shellBurst 内 min(5,1+4.5)=5——强震屏）");
            Assert.That(w.fireSet.Count, Is.EqualTo(4), "ignite 正面支 fireSet=4（fire 门 rng<0.45 掷中 4 格——黄金位级）");
            Assert.That(w.worldEvents.Count, Is.EqualTo(1), "superweapon 纪事 ×1（L10384）");
            Assert.That(w.worldEvents[0].kind, Is.EqualTo("superweapon"), "纪事 kind（unshift/Insert(0) 同构）");
            Assert.That(w.worldEvents[0].text, Is.EqualTo("天罚降临——钨棒轰然砸穿大地，留下焦黑的弹坑"), "纪事文本位级（L10384）");
            Assert.That(w.worldEvents[0].x.HasValue && w.worldEvents[0].x.Value == 100.5 && w.worldEvents[0].y.Value == 60.5, Is.True, "纪事坐标 opts {x,y}（L10384）");
            Assert.That(w.effects.Count(f => f.kind == "explosion"), Is.EqualTo(1), "fx 终态仅 explosion（orbital 到期 splice——L10439）");
            Assert.That(w.terrain[58 * WbWorld.W + 98], Is.EqualTo(WbWorld.T_MOUNTAIN), "山格焦化零写（L10379 MOUNTAIN 短路——isLand 过但 !==MOUNTAIN 断）");
            Assert.That(w.terrain[61 * WbWorld.W + 97], Is.EqualTo(WbWorld.T_WATER), "水格焦化零写（isLand false 首门断）");
            Assert.That(w.rngA, Is.EqualTo(0x86885f68u), "final rngA ≡ 黄金 S27（156 掷流位级闭合——fire 门+ignite+焦化环+explosion）");
        }

        [Test]
        public void Test41_OrbitalEdge_GoldenMirror()
        {
            // 黄金 S28 镜像（seed 0x0A0E1D 同流）：贴边负裁剪支 + 左半 WATER 零掷 + wid/src 缺省 + falloff 位精确
            var w = new WbWorld();
            w.tickCount = 27000;
            for (int i = 0; i < w.terrain.Length; i++) w.terrain[i] = WbWorld.T_GRASS;
            for (int y = 0; y < 9; y++) for (int x = 0; x < 3; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_WATER;   // 左半水域（含负裁剪区——xx∈[-2..2] 零掷）
            var u0 = new WbU { id = 1, race = 0, x = 2.5, y = 2.5, hp = 50, maxHp = 50 };       // 中心（WATER 上）——shellBurst 单位环无地形门照样吃伤
            var u1 = new WbU { id = 2, race = 0, x = 5.5, y = 2.5, hp = 50, maxHp = 50 };       // d=3 → 幸存
            w.units.Add(u0); w.units.Add(u1);
            w.effects.Add(new WbFx { kind = "orbital", x = 2.5, y = 2.5, ttl = 12, age = 10 });   // wid/src 缺省——killCredit ??null 往返 + shellBurst src ?? -1
            w.rngA = 0x0A0E1Du;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // k0 空转（黄金 stepsSnap[0].rngA=000a0e1d）
            Assert.That(w.rngA, Is.EqualTo(0x0A0E1Du), "k0 空转零掷位证（黄金 S28 步 0 同值）");
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // k1：到期触发（黄金 S28 同 58 掷流）
            Assert.That(u0.dead != 0, Is.True, "WATER 上中心单位死（shellBurst 单位环无 isLand 门——L9597-9607）");
            Assert.That(F64Hex(u1.hp), Is.EqualTo(F64Hex(50 - 120 * (1 - 3 / 4.9))), "右缘 falloff 位精确（d=3 → 120*max(0.25, 1-3/4.9)——L9601）");
            Assert.That(w.killCredit == null, Is.True, "wid null → killCredit ??null 双写往返（L10373/L10386）+ emergentPayload 门不触达（L10385）");
            Assert.That(w.shake, Is.EqualTo(9), "shake=9（同 S27 覆盖语义）");
            Assert.That(w.fireSet.Count, Is.EqualTo(3), "右半 GRASS ignite fireSet=3（左半 WATER 零掷——isLand 短路位证）");
            Assert.That(w.worldEvents.Count == 1 && w.worldEvents[0].kind == "superweapon" && w.worldEvents[0].x.Value == 2.5 && w.worldEvents[0].y.Value == 2.5, Is.True, "贴边纪事坐标（L10384 opts {x,y}）");
            Assert.That(w.terrain[2 * WbWorld.W + 1], Is.EqualTo(WbWorld.T_WATER), "左半水格零写（负裁剪 + isLand 双零掷面）");
            Assert.That(w.rngA, Is.EqualTo(0xbbe3af9fu), "final rngA ≡ 黄金 S28（58 掷流位级闭合）");
        }

        [Test]
        public void Test41_Orbital_ScorchGate_ExemptZeroWrite()
        {
            // 山/水豁免对照位证：同种子双世界——差异格世界掷面少 8+ 掷（每差异格 fire 门 1 + 焦化环 1），rngA 必异 + 差异格零写零入账
            WbWorld MkWorld(bool withDiff, uint seed)
            {
                var w2 = new WbWorld();
                w2.tickCount = 26000;
                for (int i = 0; i < w2.terrain.Length; i++) w2.terrain[i] = WbWorld.T_GRASS;
                if (withDiff)
                {
                    w2.terrain[58 * WbWorld.W + 98] = WbWorld.T_MOUNTAIN; w2.terrain[58 * WbWorld.W + 99] = WbWorld.T_MOUNTAIN;
                    w2.terrain[61 * WbWorld.W + 97] = WbWorld.T_WATER; w2.terrain[61 * WbWorld.W + 98] = WbWorld.T_WATER;
                }
                w2.effects.Add(new WbFx { kind = "orbital", x = 100.5, y = 60.5, ttl = 12, src = 1, wid = 7, age = 11 });
                w2.rngA = seed;
                w2.tickCount++;
                WbBailRelay.EffectsTick(w2);                          // 单步到期（age 11→12）
                return w2;
            }
            var wA = MkWorld(false, 0x0A0E2Au);                       // 全 GRASS 对照
            var wB = MkWorld(true, 0x0A0E2Au);                        // 2 山 + 2 水差异格
            Assert.That(wB.rngA, Is.Not.EqualTo(wA.rngA), "差异格世界 rngA ≠ 全 GRASS 世界——四格×双面（fire+焦化）掷面缺失位证");
            Assert.That(MulAdv(wB.rngA, 4), Is.Not.EqualTo(wA.rngA), "掷面差 >4 掷（下限位证——fire 门 4 + 焦化环 4 起步，ignite 内掷另计）");
            Assert.That(wB.terrain[58 * WbWorld.W + 98] == WbWorld.T_MOUNTAIN && wB.terrain[61 * WbWorld.W + 97] == WbWorld.T_WATER, Is.True, "差异格 terrain 零写（豁免短路——L10379 双门）");
            Assert.That(wB.fireSet.Contains(58 * WbWorld.W + 98) || wB.fireSet.Contains(61 * WbWorld.W + 97), Is.False, "差异格 fireSet 零入账（fire 门 isLand/MOUNTAIN 短路零掷）");
            Assert.That(wA.effects.Count(f => f.kind == "explosion"), Is.EqualTo(1), "对照世界 explosion 常在（shellBurst fx 面）");
            Assert.That(wB.worldEvents.Count, Is.EqualTo(1), "纪事与地形无关恒发（L10384 无条件面）");
        }

        [Test]
        public void Test41_Orbital_IdleStepZeroDraw()
        {
            // 空转步零掷位证：age 10→11 <ttl——无周期相（laser 同构）；orbital 分支 age>=ttl 门未开
            var w = new WbWorld();
            w.tickCount = 26000;
            for (int i = 0; i < w.terrain.Length; i++) w.terrain[i] = WbWorld.T_GRASS;
            w.units.Add(new WbU { id = 1, race = 0, x = 100.5, y = 60.5, hp = 50, maxHp = 50 });
            w.effects.Add(new WbFx { kind = "orbital", x = 100.5, y = 60.5, ttl = 12, src = 1, wid = 7, age = 10 });
            w.rngA = 0x0A0E1Cu;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // age 10→11：空转
            Assert.That(w.rngA, Is.EqualTo(0x0A0E1Cu), "空转步零掷——rngA 不动（age<ttl 无支触达）");
            Assert.That(w.units[0].hp == 50 && w.units[0].hurt == 0 && w.units[0].dead == 0, Is.True, "空转单位零伤零 hurt 零死亡");
            Assert.That(w.effects.Count, Is.EqualTo(1), "orbital 未 splice 未产 fx（age<ttl——L10439 门未开）");
            Assert.That(w.worldEvents.Count, Is.EqualTo(0), "空转无纪事（L10384 在到期支内）");
            Assert.That(w.shake, Is.EqualTo(0), "空转零震屏（L10387/L9619 均在支内）");
        }
    }
}
