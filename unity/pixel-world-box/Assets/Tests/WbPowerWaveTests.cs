// ============================================================
// WbPowerWaveTests.cs — M-U10b effectsTick 波前族/静态族五 kind 直测（NUnit）
// 范围: tsunami L9877-9914 / sinkhole L10120-10147 / iceage L10148-10169 /
//   blackhole L10191-10223 / quake L10224-10236（黄金回放主面在 WbPowerTests.Test35——
//   power.json 14 场景全量逐位；本文件钉语义门与蓝本异形面）。
// 蓝本关键语义（黄金实证沉淀）:
//   ① tsunami 波前环带 [prevR,waveR) 含下界、单位带宽 [prevR,waveR+1)、眼区 d<prevR 永不淹；
//   ② 掷序面: setTerrain(WATER) 级联水吞三联（L998 建筑毁→smoke 2 掷）先于 L9898 flood 掷——
//     L9899 显式 destroyBuilding 为级联后死支（双毁防误译钉: smoke 恰 1 发）；
//   ③ sinkhole 无 flood.set（永久性水面）+ HILL 不豁免（tsunami 对照面）；
//   ④ iceage 恒真门 <1.6 掷位保持 + coldBorn 三族免疫 chill16；
//   ⑤ blackhole 零掷引力域: d<0.3 免疫拉引但奇点仍湮灭、无飞行门（ANGEL 同拉）、
//     奇点 <3.5 湮灭/<3 焦土坑（WATER·DEEP 豁免）+ fx explosion {r:3} + shake 9；
//   ⑥ quake shake=7 直写覆写（非 Max——预设高值被压平的专钉）。
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
    public class WbPowerWaveTests
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

        private static readonly string[] WaveKeys =
        {
            "power-tsunami", "power-sinkhole", "power-iceage", "power-blackhole", "power-quake",
        };

        /// <summary>C# 全链重放（WbPowerTests.ReplayScenario 同构副本——flood/shake 通道含）</summary>
        private static WbWorld ReplayScenario(JObject sc)
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
                w.buildings.Add(new WbBuilding { i = bo.Value<int>("i"), x = bo.Value<int>("x"), y = bo.Value<int>("y"), kind = bo.Value<int>("kind"), civ = -1 });
                w.bIdx[bo.Value<int>("i")] = w.buildings.Count - 1;
            }
            foreach (var t in (JArray)fx["battles0"]) w.activeBattles[t[0].Value<int>()] = t[1].Value<int>();
            foreach (var t in (JArray)fx["flood0"]) w.flood[t[0].Value<int>()] = t[1].Value<long>();
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
                });
            }
            w.laws.seasons = sc.Value<bool>("seasons");
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            w.rngA = unchecked((uint)sc.Value<int>("seed"));
            return w;
        }

        [Test]
        public void Test36_Wave_GoldenReplay_FiveKinds()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindPower()));
            var scens = gold["scenarios"].Where(t => WaveKeys.Contains(((JObject)t).Value<string>("key"))).ToList();
            Assert.That(scens.Count, Is.EqualTo(5), "波前/静态五场景在册");
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
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
                        Assert.That(F64Hex(u.x), Is.EqualTo(uo.Value<string>("x")), $"u x {key} S{k}#{q}");
                    }
                    Assert.That(w.fireSetList, Is.EqualTo(g["fireSet"].ToObject<List<int>>()), $"fireSet 序 {key} S{k}");
                    var gFlood = g["flood"].ToObject<List<List<object>>>();
                    var gotFlood = new List<string>();
                    foreach (var kv in w.flood) gotFlood.Add($"{kv.Key}:{kv.Value}");
                    Assert.That(gotFlood, Is.EqualTo(gFlood.Select(p => $"{Convert.ToInt32(p[0])}:{Convert.ToInt64(p[1])}").ToList()), $"flood 序 {key} S{k}");
                    Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{k}");
                    Assert.That(w.dirty.OrderBy(x => x).ToList(), Is.EqualTo(g["dirty"].ToObject<List<int>>()), $"dirty 序 {key} S{k}");
                }
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                var gFloodF = sc["flood"].ToObject<List<List<object>>>();
                var gotFloodF = new List<string>();
                foreach (var kv in w.flood) gotFloodF.Add($"{kv.Key}:{kv.Value}");
                Assert.That(gotFloodF, Is.EqualTo(gFloodF.Select(p => $"{Convert.ToInt32(p[0])}:{Convert.ToInt64(p[1])}").ToList()), $"flood 终态 {key}");
                Assert.That(w.shake, Is.EqualTo(sc.Value<double>("shake")), $"shake 终态 {key}");
            }
        }

        [Test]
        public void Test36_Tsunami_WaveBand_FloodLedger_EyeDry()
        {
            var w = new WbWorld();
            w.tickCount = 9000;
            int eye = 80 * WbWorld.W + 128;                          // 眼区 d=0——d<prevR 永不淹
            int hill = 80 * WbWorld.W + 131;                         // HILL d=2.5——幸存面（age2 band 内）
            int bld = 80 * WbWorld.W + 130;                          // 建筑 d=2.0——age2 band 淹+毁
            w.terrain[eye] = WbWorld.T_GRASS;
            w.terrain[hill] = WbWorld.T_HILL;
            for (int y = 77; y < 84; y++) for (int x = 126; x < 133; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            w.terrain[hill] = WbWorld.T_HILL;
            w.building[bld] = 1;
            w.buildings.Add(new WbBuilding { i = bld, x = 130, y = 80, kind = 1, civ = -1 });
            w.bIdx[bld] = 0;
            w.effects.Add(new WbFx { kind = "tsunami", x = 128.5, y = 80.5, ttl = 8, r = 8, age = 0 });
            w.rngA = 0x0A0E0Au;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                              // age1: band [1,2)——建筑 d=2.0 未及
            Assert.That(w.buildings.Count, Is.EqualTo(1), "age1 波前未及建筑（d2=4 不< waveR2=4）");
            Assert.That(w.flood.Count, Is.GreaterThan(0), "age1 环带已挂账");
            Assert.That(w.terrain[eye], Is.EqualTo(WbWorld.T_GRASS), "眼区 d<prevR 永不淹");
            Assert.That(w.shake, Is.EqualTo(6), "age1 shake=6（L9914 Max 面）");
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                              // age2: band [2,3)——建筑淹没+级联水吞
            Assert.That(w.terrain[bld], Is.EqualTo(WbWorld.T_WATER), "age2 波前没顶");
            Assert.That(w.buildings.Count, Is.EqualTo(0), "级联水吞毁建筑（L998 先于 L9898 flood 掷）");
            Assert.That(w.flood.ContainsKey(bld), Is.True, "flood 挂账在册（L9898）");
            Assert.That(w.flood[bld], Is.GreaterThanOrEqualTo(w.tickCount + 240), "挂账 ≥ tickCount+240");
            Assert.That(w.flood[bld], Is.LessThan(w.tickCount + 360), "挂账 < tickCount+360（floor(rng*120) 上界）");
            Assert.That(w.terrain[hill], Is.EqualTo(WbWorld.T_HILL), "HILL 幸存（tsunami 六亲豁免面）");
            Assert.That(w.effects.Count(f2 => f2.kind == "smoke"), Is.EqualTo(1), "smoke 恰 1 发——L9899 显式毁建筑为级联后死支（双毁防误译钉）");
        }

        [Test]
        public void Test36_Tsunami_BoatBypass_FlyingBypass()
        {
            var w = new WbWorld();
            w.tickCount = 9001;
            for (int y = 78; y < 83; y++) for (int x = 126; x < 133; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            var boat = new WbU { id = 1, race = 6, x = 130.5, y = 80.5, hp = 50, maxHp = 50, boat = 1 };    // 航海者豁免
            var angel = new WbU { id = 2, race = 28, x = 130.5, y = 81.5, hp = 50, maxHp = 50 };            // ANGEL flying 豁免
            var sheep = new WbU { id = 3, race = 6, x = 130.5, y = 79.5, hp = 50, maxHp = 50 };             // 波前 d=2.0——age2 溺
            w.units.Add(boat); w.units.Add(angel); w.units.Add(sheep);
            w.effects.Add(new WbFx { kind = "tsunami", x = 128.5, y = 80.5, ttl = 8, r = 8, age = 1 });
            w.rngA = 0x0A0E0Au;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                              // age2: band [2,3) 单位带宽 [2,4)
            Assert.That(boat.hp, Is.EqualTo(50), "boat 豁免溺水（L9906）");
            Assert.That(angel.hp, Is.EqualTo(50), "flying 豁免溺水（L9910）");
            Assert.That(sheep.hp, Is.EqualTo(-10), "非飞行非船 hp-60（L9911）");
            Assert.That(sheep.hurt, Is.EqualTo(24), "hurt 24");
            Assert.That(sheep.dead != 0, Is.True, "hp<=0 溺亡");
        }

        [Test]
        public void Test36_Sinkhole_NoFloodLedger_HillFloods()
        {
            var w = new WbWorld();
            w.tickCount = 10000;
            int hill = 80 * WbWorld.W + 130;                         // HILL d=2.0——sinkhole 不豁免
            int mountain = 80 * WbWorld.W + 131;                     // MOUNTAIN d=3.0——幸存
            for (int y = 78; y < 83; y++) for (int x = 126; x < 133; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            w.terrain[hill] = WbWorld.T_HILL;
            w.terrain[mountain] = WbWorld.T_MOUNTAIN;
            w.effects.Add(new WbFx { kind = "sinkhole", x = 128.5, y = 80.5, ttl = 12, r = 4, age = 0 });
            w.rngA = 0x0A0E0Bu;
            for (int k = 0; k < 5; k++) { w.tickCount++; WbBailRelay.EffectsTick(w); }   // age5: waveR=2.167 band [1.833,2.167)——d=2.0 触达
            Assert.That(w.terrain[hill], Is.EqualTo(WbWorld.T_WATER), "HILL 塌陷没顶（sinkhole 四亲豁免面——tsunami 对照）");
            Assert.That(w.terrain[mountain], Is.EqualTo(WbWorld.T_MOUNTAIN), "MOUNTAIN 幸存");
            Assert.That(w.flood.Count, Is.EqualTo(0), "蓝本无 flood.set——sinkhole 永久性水面语义钉（L10132-10135）");
        }

        [Test]
        public void Test36_Iceage_ColdBornImmune_Chill16()
        {
            var w = new WbWorld();
            w.tickCount = 11000;
            var penguin = new WbU { id = 1, race = WbConstants.R_PENGUIN, x = 128.5, y = 80.5, hp = 22, maxHp = 22 };
            var sheep = new WbU { id = 2, race = 6, x = 130.5, y = 80.5, hp = 16, maxHp = 16 };
            w.units.Add(penguin); w.units.Add(sheep);
            w.effects.Add(new WbFx { kind = "iceage", x = 128.5, y = 80.5, ttl = 20, r = 6, age = 0 });
            w.rngA = 0x0A0E0Cu;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(penguin.chill, Is.EqualTo(0), "coldBorn 免疫 chill（L10166-10167）");
            Assert.That(F64Hex(penguin.hp), Is.EqualTo(F64Hex(22)), "coldBorn 免疫扣血");
            Assert.That(sheep.chill, Is.EqualTo(16), "非寒地 chill 16（iceage 异表——blizzard 14 对照）");
            Assert.That(sheep.hurt, Is.EqualTo(8), "hurt 8");
        }

        [Test]
        public void Test36_Blackhole_PullGate_SingularityBurst()
        {
            var w = new WbWorld();
            w.tickCount = 12000;
            int water = 60 * WbWorld.W + 101, deep = 61 * WbWorld.W + 102;
            for (int y = 57; y < 64; y++) for (int x = 97; x < 104; x++) w.terrain[y * WbWorld.W + x] = WbWorld.T_GRASS;
            w.terrain[water] = WbWorld.T_WATER;
            w.terrain[deep] = WbWorld.T_DEEP;
            int bIn = 60 * WbWorld.W + 100;                          // d=0.5——奇点坑内毁
            w.building[bIn] = 1;
            w.buildings.Add(new WbBuilding { i = bIn, x = 100, y = 60, kind = 1, civ = -1 });
            w.bIdx[bIn] = 0;
            var near = new WbU { id = 1, race = 6, x = 100.7, y = 60.5, hp = 30, maxHp = 30 };    // d=0.2——免疫拉引
            var mid = new WbU { id = 2, race = 6, x = 101.5, y = 60.5, hp = 30, maxHp = 30 };     // d=1.0——拉引+重创
            var angel = new WbU { id = 3, race = 28, x = 101.3, y = 60.5, hp = 30, maxHp = 30 };  // d=0.8——pullR 内（无飞行门实证位）
            var far = new WbU { id = 4, race = 6, x = 108.5, y = 60.5, hp = 30, maxHp = 30 };     // d=8.0——pullR 外
            w.units.Add(near); w.units.Add(mid); w.units.Add(angel); w.units.Add(far);
            w.effects.Add(new WbFx { kind = "blackhole", x = 100.5, y = 60.5, ttl = 3, r = 6, age = 0 });
            w.rngA = 0x0A0E0Du;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                              // age1: pullR=1.74
            Assert.That(F64Hex(near.x), Is.EqualTo(F64Hex(100.7)), "d<0.3 免疫拉引（L10197 门下界）");
            Assert.That(mid.x < 101.5, Is.True, "d=1.0 被拉引趋心（L10199）");
            Assert.That(mid.hurt, Is.EqualTo(10), "hurt 10");
            Assert.That(angel.x < 101.3, Is.True, "ANGEL 同拉——blackhole 无飞行门（tsunami/sinkhole 对照面）");
            Assert.That(far.x, Is.EqualTo(108.5), "pullR 外不拉");
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                              // age2 = ttl-1: 奇点爆发
            Assert.That(near.dead != 0, Is.True, "d=0.2 奇点湮灭（免疫拉引≠免疫奇点——L10208）");
            Assert.That(mid.dead != 0, Is.True, "d<3.5 湮灭");
            Assert.That(angel.dead != 0, Is.True, "ANGEL 奇点湮灭");
            Assert.That(far.dead != 0, Is.False, "d=8.0 生还");
            Assert.That(w.buildings.Count, Is.EqualTo(0), "坑内建筑毁（L10215）");
            Assert.That(w.terrain[bIn], Is.EqualTo(WbWorld.T_BURNT), "焦土坑（L10216）");
            Assert.That(w.terrain[water], Is.EqualTo(WbWorld.T_WATER), "WATER 豁免焦土");
            Assert.That(w.terrain[deep], Is.EqualTo(WbWorld.T_DEEP), "DEEP 豁免焦土");
            Assert.That(w.effects.Any(f2 => f2.kind == "explosion"), Is.True, "fx explosion 入列（L10220）");
            Assert.That(w.shake, Is.EqualTo(9), "奇点 shake=9（L10221 Max 面）");
        }

        [Test]
        public void Test36_Quake_ShakeDirectOverwrite()
        {
            var w = new WbWorld();
            w.tickCount = 13000;
            w.shake = 9;                                             // 预设高震——直写覆写专钉
            w.effects.Add(new WbFx { kind = "quake", x = 140.5, y = 60.5, ttl = 10, r = 6, age = 0 });
            w.rngA = 0x0A0E0Eu;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.shake, Is.EqualTo(7), "shake=7 直写覆写（L10225 非 Max——蓝本机械，预设 9 被压平）");
        }
    }
}
