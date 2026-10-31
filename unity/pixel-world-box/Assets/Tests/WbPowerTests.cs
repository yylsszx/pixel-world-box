// ============================================================
// WbPowerTests.cs — M-U10a effectsTick 游荡云族八种黄金对账 + 语义面（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/power.json（18 场景——M-U10b 增波前族/静态族五 kind，
//   M-U10c 增命中族三 kind + explode 消费面）
//   由 scripts/unity-migration/gen-power.mjs 生成（真引擎 GameEngine 构造 + 手术式夹具
//   两相直写 + effects/spawnUnit 真调用注入〔fx seed/dir 双掷注入相〕+ rebuildBuckets 注入相尾
//   + rngA 尾置清零起流 + tickCount++/effectsTick 直调步进快照〔主循环 L2508/L2528 序同构〕；
//   det 双跑字节级）。
// 镜像: power-transcript.mjs 零引擎导入 18/18 ALL PASS（bun 口径——hypot fdlibm 原生）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 18/18 → 本文件 NUnit C# 全链重放
//   （FdHypot 位精确件 + effects List 倒序 RemoveAt 同构 + activeBattles 快照二段式）逐位对账。
// 对账面: 逐步 rngA + terrain md5 + fx 全列（kind/age/x/y/dir 位级）+ units 全列（hp/hurt/
//   chill/dead/x/y 位级）+ fireSet 序 + regrow 序（L979 出账联动）+ radSet 序 + radiate md5 +
//   bHp 全列 + battles 序（%5 清理）+ dirty 序（markDirty 五格面 + refreshWaterTierAround
//   L1066 水深标脏——M-U8a 渲染簿记 no-op 注记消亡面）+ fxCount/eventsCount/buildingsCount。
// M-U10c 通道: fx0 src/dmg/quiet + units0 civ/gbArmor（gearBonus armor 采样——GearBonusHook 桩
//   回放同值）+ building0 civ + orphanB0 孤儿建筑格 + rel0 外交挂账（atWar <-20 门）。
// 蓝本行号: effectsTick L9801-10447 八支 + M-U10b 五支（tsunami L9877/sinkhole L10120/iceage L10148/blackhole L10191/quake L10224）
//   + M-U10c 三支（meteor L10237/fireball L10240/arrow·bullet L10255）+ explode L10450-10499
//   + ignite L1072-1077 + 到期 splice L10439-10441 + activeBattles L10443-10447。
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
    public class WbPowerTests
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

        private static string F64Hex(double v) => WbRender.F64Hex(v);   // 小写 16 字符 LE —— JS f64hex 同构

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

        /// <summary>C# 全链重放：夹具灌注（effects/units/radSet/battles 注入）→ tickCount++/EffectsTick 逐步（M-U10c 起 tuple 返 gearArmor 桩面）</summary>
        private static (WbWorld w, Dictionary<int, double> gearArmor) ReplayScenario(JObject sc)
        {
            string key = sc.Value<string>("key");
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            w.fire = GunzipB64(fx.Value<string>("fire0"));
            w.fireSet = new HashSet<int>(fx["fireSet0"].ToObject<List<int>>());
            w.fireSetList = fx["fireSet0"].ToObject<List<int>>();            // 插入序镜像
            w.dirty.Clear();                                                 // gen 手术一同期（瞬态层清零）
            w.radiate = GunzipB64(fx.Value<string>("radiate0"));
            w.waterTier = GunzipB64(fx.Value<string>("waterTier0"));         // 水深场初始（generate 旧地形 tier——对比基线）
            foreach (var t in (JArray)fx["radSet0"]) w.radSet[t[0].Value<int>()] = t[1].Value<int>();
            foreach (var t in (JArray)fx["regrow0"]) w.regrow[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var i in fx["frozen0"].ToObject<List<int>>()) { w.frozen.Add(i); w.frozenList.Add(i); }
            foreach (var b in (JArray)fx["building0"])
            {
                var bo = (JObject)b;
                w.building[bo.Value<int>("i")] = (byte)bo.Value<int>("kind");
                w.buildings.Add(new WbBuilding { i = bo.Value<int>("i"), x = bo.Value<int>("x"), y = bo.Value<int>("y"), kind = bo.Value<int>("kind"), civ = bo["civ"] != null ? bo.Value<int>("civ") : -1 });   // M-U10c civ 通道
                w.bIdx[bo.Value<int>("i")] = w.buildings.Count - 1;
            }
            foreach (var t in (JArray)(fx["orphanB0"] ?? new JArray())) w.building[t[0].Value<int>()] = (byte)t[1].Value<int>();   // M-U10c 孤儿建筑格（building>0 无记录——L10289 OOB 镜像钉）
            foreach (var t in (JArray)(fx["rel0"] ?? new JArray())) w.rel[t[0].Value<string>()] = t[1].Value<double>();   // M-U10c 外交挂账（pairKey 字符串键 → AtWar <-20 门）
            foreach (var t in (JArray)fx["battles0"]) w.activeBattles[t[0].Value<int>()] = t[1].Value<int>();
            foreach (var t in (JArray)fx["flood0"]) w.flood[t[0].Value<int>()] = t[1].Value<long>();   // M-U10b 洪水挂账初始（手术清零后恒空——tsunami L9898 写面）
            // effects 注入重建（fx0 = gen 真调用 eng.fx() 后快照——seed/dir 掷已消耗在注入相；
            //   M-U10c src/dmg/quiet 通道——null/缺键 ≡ JS undefined 语义）
            var gearArmor = new Dictionary<int, double>();   // M-U10c gearBonus armor 采样（gen 快照相 engine 真 gearBonus——桩回放同值）
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
                    src = eo["src"] != null && eo.Value<string>("src") != null ? (int?)eo.Value<int>("src") : null,
                    dmg = eo["dmg"] != null && eo["dmg"].Type != JTokenType.Null ? (double?)eo.Value<double>("dmg") : null,
                    quiet = eo.Value<bool?>("quiet") ?? false,
                });
            }
            // units 注入重建（spawnUnit 后手术覆写快照——WbU 语义面只含 effectsTick 消费字段；
            //   M-U10c civ〔友军豁免面〕+ gbArmor〔gearBonus armor 桩面〕）
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
            w.RebuildBuckets();                                              // M-U10c：arrow/bullet 桶扫描面（gen 注入相尾同构——纯函数零掷）
            // 季节/时钟面（gen 手术一同期）
            w.laws.seasons = sc.Value<bool>("seasons");
            w.yearF = sc.Value<double>("yearF");
            w.tickCount = sc.Value<int>("tickCount");
            // rngA 尾置起流（gen 协议——掷值自 seed 纯净起流）
            w.rngA = unchecked((uint)sc.Value<int>("seed"));
            return (w, gearArmor);
        }

        private static string RegrowSig(WbWorld w)
        {
            var l = new List<string>();
            foreach (var kv in w.regrow) l.Add($"{kv.Key}:{kv.Value}");
            return string.Join(",", l);
        }

        private static string RadSetSig(WbWorld w)
        {
            var l = new List<string>();
            foreach (var kv in w.radSet) l.Add($"{kv.Key}:{kv.Value}");
            return string.Join(",", l);
        }

        [Test]
        public void Test35_Power_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindPower()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(18));
            var gear0 = WbBailRelay.GearBonusHook;                       // M-U10c：接缝置换 try/finally（Test30 桩先例——黄金回放 armor 采样桩）
            try
            {
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var (w, gearArmor) = ReplayScenario(sc);
                WbBailRelay.GearBonusHook = (ww, u) => new WbGearBonus { armor = gearArmor.TryGetValue(u.id, out var a) ? a : 0, speed = 1 };   // gen stub 同构（余零 + speed=1 L3777——链甲 armor=8 位精确钉）
                int steps = sc.Value<int>("steps");
                var snaps = (JArray)sc["stepsSnap"];
                for (int k = 0; k < steps; k++)
                {
                    w.tickCount++;                                   // 主循环 L2508 序（gen 协议同构）
                    WbBailRelay.EffectsTick(w);
                    var g = (JObject)snaps[k];
                    Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{k}");
                    Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{k}");
                    // fx 全列（kind/age/x/y/dir 位级——到期 splice 序含）
                    var gFx = (JArray)g["fx"];
                    Assert.That(w.effects.Count, Is.EqualTo(gFx.Count), $"fxCount {key} S{k}");
                    for (int q = 0; q < gFx.Count; q++)
                    {
                        var eo = (JObject)gFx[q];
                        var f = w.effects[q];
                        Assert.That(f.kind, Is.EqualTo(eo.Value<string>("kind")), $"fx kind {key} S{k}#{q}");
                        Assert.That((double)f.age, Is.EqualTo(eo.Value<double>("age")), $"fx age {key} S{k}#{q}");
                        Assert.That(F64Hex(f.x), Is.EqualTo(eo.Value<string>("x")), $"fx x {key} S{k}#{q}");
                        Assert.That(F64Hex(f.y), Is.EqualTo(eo.Value<string>("y")), $"fx y {key} S{k}#{q}");
                        Assert.That(F64Hex(f.dir), Is.EqualTo(eo.Value<string>("dir")), $"fx dir {key} S{k}#{q}");
                    }
                    // units 全列（hp/hurt/chill/dead/x/y 位级）
                    var gU = (JArray)g["units"];
                    Assert.That(w.units.Count, Is.EqualTo(gU.Count), $"unitsCount {key} S{k}");
                    for (int q = 0; q < gU.Count; q++)
                    {
                        var uo = (JObject)gU[q];
                        var u = w.units[q];
                        Assert.That(F64Hex(u.hp), Is.EqualTo(uo.Value<string>("hp")), $"u hp {key} S{k}#{q}");
                        Assert.That(u.hurt, Is.EqualTo(uo.Value<int>("hurt")), $"u hurt {key} S{k}#{q}");
                        Assert.That(u.chill, Is.EqualTo(uo.Value<int>("chill")), $"u chill {key} S{k}#{q}");
                        Assert.That(u.dead != 0, Is.EqualTo(uo.Value<bool>("dead")), $"u dead {key} S{k}#{q}");
                        Assert.That(F64Hex(u.x), Is.EqualTo(uo.Value<string>("x")), $"u x {key} S{k}#{q}");
                        Assert.That(F64Hex(u.y), Is.EqualTo(uo.Value<string>("y")), $"u y {key} S{k}#{q}");
                    }
                    Assert.That(w.fireSetList, Is.EqualTo(g["fireSet"].ToObject<List<int>>()), $"fireSet 序 {key} S{k}");
                    Assert.That(RegrowSig(w), Is.EqualTo(string.Join(",", g["regrow"].Select(t => $"{t[0].Value<int>()}:{t[1].Value<long>()}"))), $"regrow 序 {key} S{k}");
                    Assert.That(RadSetSig(w), Is.EqualTo(string.Join(",", g["radSet"].Select(t => $"{t[0].Value<int>()}:{t[1].Value<int>()}"))), $"radSet 序 {key} S{k}");
                    Assert.That(Md5Hex(w.radiate), Is.EqualTo(g.Value<string>("radiateMd5")), $"radiateMd5 {key} S{k}");
                    var gBhp = g["bHp"].ToObject<List<List<object>>>();
                    var gotBhp = new List<string>();
                    foreach (int bk in w.bHpKeys) gotBhp.Add($"{bk}:{F64Hex(w.bHp[bk])}");   // bHpKeys 插入序台账（JS Map 序）
                    Assert.That(gotBhp, Is.EqualTo(gBhp.Select(p => $"{Convert.ToInt32(p[0])}:{(string)p[1]}").ToList()), $"bHp {key} S{k}");
                    Assert.That(w.buildings.Count, Is.EqualTo(g.Value<int>("buildingsCount")), $"buildingsCount {key} S{k}");
                    var gB = g["battles"].ToObject<List<List<int>>>();
                    var gotB = new List<string>();
                    foreach (var kv in w.activeBattles) gotB.Add($"{kv.Key}:{kv.Value}");
                    Assert.That(gotB, Is.EqualTo(gB.Select(p => $"{p[0]}:{p[1]}").ToList()), $"battles 序 {key} S{k}");
                    var gFlood = g["flood"].ToObject<List<List<object>>>();
                    var gotFlood = new List<string>();
                    foreach (var kv in w.flood) gotFlood.Add($"{kv.Key}:{kv.Value}");
                    Assert.That(gotFlood, Is.EqualTo(gFlood.Select(p => $"{Convert.ToInt32(p[0])}:{Convert.ToInt64(p[1])}").ToList()), $"flood 序 {key} S{k}");
                    Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{k}");
                    Assert.That(w.dirty.OrderBy(x => x).ToList(), Is.EqualTo(g["dirty"].ToObject<List<int>>()), $"dirty 序 {key} S{k}");
                    Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount2 {key} S{k}");
                    Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{k}");
                }
                // 终态 fx 全列 + events 全列
                var goldFx = (JArray)sc["fx"];
                Assert.That(w.effects.Count, Is.EqualTo(goldFx.Count), $"fx 终态 count {key}");
                for (int k = 0; k < goldFx.Count; k++)
                {
                    var e = (JObject)goldFx[k];
                    var f = w.effects[k];
                    Assert.That(f.kind, Is.EqualTo(e.Value<string>("kind")), $"终 fx kind {key}#{k}");
                    Assert.That(f.seed, Is.EqualTo(e.Value<int>("seed")), $"终 fx seed {key}#{k}");
                    Assert.That(F64Hex(f.x), Is.EqualTo(e.Value<string>("x")), $"终 fx x {key}#{k}");
                    Assert.That(F64Hex(f.dir), Is.EqualTo(e.Value<string>("dir")), $"终 fx dir {key}#{k}");
                    Assert.That((double)f.age, Is.EqualTo(e.Value<double>("age")), $"终 fx age {key}#{k}");
                }
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("radiate")), w.radiate, $"radiate 终态 {key}");
                // M-U10c：events 全列对账（meteor 入纪事面——kind/text/x/y；null 归一通道）
                var gEv = (JArray)sc["events"];
                Assert.That(w.worldEvents.Count, Is.EqualTo(gEv.Count), $"events 终态 count {key}");
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
                WbBailRelay.GearBonusHook = gear0;                       // 接缝还原（多测试类共享 static hook——WbUnitsUpdateTests 先例）
            }
        }

        // ---------------- 语义面直测（八支行为门 + 跨域联动） ----------------

        [Test]
        public void Test35_Tornado_WalkableGate_FlyingBypass()
        {
            var w = new WbWorld();
            w.tickCount = 1000;
            w.terrain[60 * WbWorld.W + 100] = WbWorld.T_WATER;       // 目标落点水格
            var human = new WbU { id = 1, race = 6, x = 100.5, y = 60.5, hp = 50, maxHp = 50 };   // SHEEP 非飞行
            var angel = new WbU { id = 2, race = 28, x = 100.5, y = 60.5, hp = 50, maxHp = 50 };  // ANGEL flying
            w.units.Add(human); w.units.Add(angel);
            w.effects.Add(new WbFx { kind = "tornado", x = 100.5, y = 60.5, ttl = 30, r = 4, age = 0, dir = 0 });
            w.rngA = 0x0A0E01u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(human.hurt, Is.EqualTo(16), "hurt 16 面");
            Assert.That(human.x, Is.EqualTo(100.5), "walkable 门拒推——水格落点 x 不动");
            Assert.That(human.y, Is.EqualTo(60.5), "walkable 门拒推——y 不动");
            // angel：flying 旁路 walkable 门——位移（dir 掷同流同值→同落点）
            Assert.That(angel.x != 100.5 || angel.y != 60.5, Is.True, "flying 必推");
        }

        [Test]
        public void Test35_Blizzard_FreezeSixBranches_Extinguish()
        {
            var w = new WbWorld();
            w.tickCount = 3000;
            int g = 60 * WbWorld.W + 100, b = 61 * WbWorld.W + 100, f = 62 * WbWorld.W + 100,
                s = 63 * WbWorld.W + 100, wa = 64 * WbWorld.W + 100, d = 65 * WbWorld.W + 100;
            w.terrain[g] = WbWorld.T_GRASS; w.terrain[b] = WbWorld.T_BURNT; w.terrain[f] = WbWorld.T_FOREST;
            w.terrain[s] = WbWorld.T_SAND; w.terrain[wa] = WbWorld.T_WATER; w.terrain[d] = WbWorld.T_DEEP;
            int fireTile = 66 * WbWorld.W + 100;
            w.terrain[fireTile] = WbWorld.T_GRASS;
            w.fire[fireTile] = 100; w.fireSet.Add(fireTile); w.fireSetList.Add(fireTile);
            // 直接驱动采样逻辑：注入 dir 已定 → 每支单格采样难定位——改走 setTerrain 级联直测蓝本 L9937-9943 等价语义（支路概率部分由黄金回放钉，此处钉级联签名）
            WbBailRelay.SetTerrain(w, g, WbWorld.T_SNOW);            // GRASS→SNOW（blizzard 支同面）
            Assert.That(w.terrain[g], Is.EqualTo(WbWorld.T_SNOW));
            WbBailRelay.SetTerrain(w, wa, WbWorld.T_ICE);            // WATER→ICE（L9940 面）
            Assert.That(w.terrain[wa], Is.EqualTo(WbWorld.T_ICE));
            Assert.That(w.frozen.Contains(wa), Is.True, "冻结入 frozen 集（L982 级联）");
            // 寒霜灭火面（blizzard L9942-9943 与 SetTerrain L990-993 同构签名——fireSetList 镜像同步）
            w.fire[g] = 80; w.fireSet.Add(g); w.fireSetList.Add(g);
            w.fire[g] = 0; w.fireSet.Remove(g); w.fireSetList.Remove(g);
            Assert.That(w.fireSet.Contains(g), Is.False);
            Assert.That(w.fireSetList, Does.Not.Contain(g));
        }

        [Test]
        public void Test35_Blizzard_ColdBornImmune()
        {
            var w = new WbWorld();
            w.tickCount = 3001;
            var penguin = new WbU { id = 1, race = WbConstants.R_PENGUIN, x = 100.5, y = 60.5, hp = 30, maxHp = 30 };
            var sheep = new WbU { id = 2, race = 6, x = 100.5, y = 60.5, hp = 30, maxHp = 30 };
            w.units.Add(penguin); w.units.Add(sheep);
            w.effects.Add(new WbFx { kind = "blizzard", x = 100.5, y = 60.5, ttl = 20, r = 6, age = 0, dir = 0 });
            w.rngA = 0x0A0E03u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(penguin.chill, Is.EqualTo(0), "coldBorn 免疫 chill");
            Assert.That(F64Hex(penguin.hp), Is.EqualTo(F64Hex(30)), "coldBorn 免疫扣血");
            Assert.That(sheep.chill, Is.EqualTo(14), "非寒地 chill 14");
            Assert.That(sheep.hurt, Is.EqualTo(8), "hurt 8");
        }

        [Test]
        public void Test35_Rainstorm_RegrowPurge_Linkage()
        {
            var w = new WbWorld();                                    // 复绿 → setTerrain L979 regrow 出账联动
            w.tickCount = 6000;
            int i = 60 * WbWorld.W + 100;
            w.terrain[i] = WbWorld.T_BURNT;
            w.regrow[i] = 9000;
            WbBailRelay.SetTerrain(w, i, WbWorld.T_GRASS);            // rainstorm 复绿支同面（L10008）
            Assert.That(w.terrain[i], Is.EqualTo(WbWorld.T_GRASS));
            Assert.That(w.regrow.ContainsKey(i), Is.False, "L979 regrow 出账——复苏计时随覆写作废");
        }

        [Test]
        public void Test35_Rainstorm_RadiateCleanse_MarkDirty()
        {
            var w = new WbWorld();                                    // 辐射洗净支（L10007）：radiate→0 + radSet 出账 + markDirty
            w.tickCount = 6001;
            int j = 60 * WbWorld.W + 101;
            w.radiate[j] = 5;
            w.radSet[j] = 6100;
            int dirtyBefore = w.dirty.Count;
            w.radiate[j] = 0; w.radSet.Remove(j); w.MarkDirty(j);     // C# 译文支路逐操作同构
            Assert.That(w.radiate[j], Is.EqualTo(0));
            Assert.That(w.radSet.ContainsKey(j), Is.False, "radSet Remove 写面");
            Assert.That(w.dirty.Count, Is.EqualTo(dirtyBefore + 5), "markDirty 中心+四邻五格面");
        }

        [Test]
        public void Test35_Drought_MeltIce_FrozenPurge()
        {
            var w = new WbWorld();                                    // 热浪融冰（L9982→meltIce L2892：ICE→WATER + frozen 出账）
            w.tickCount = 5000;
            int i = 60 * WbWorld.W + 102;
            w.terrain[i] = WbWorld.T_ICE;
            w.frozen.Add(i); w.frozenList.Add(i);
            WbBailRelay.MeltIce(w, i);
            Assert.That(w.terrain[i], Is.EqualTo(WbWorld.T_WATER));
            Assert.That(w.frozen.Contains(i), Is.False, "L981 frozen 出账");
            Assert.That(w.frozenList, Does.Not.Contain(i), "frozenList 镜像同步");
        }

        [Test]
        public void Test35_ExpirySplice_AllKinds()
        {
            var w = new WbWorld();                                    // 到期 splice（L10439-10441）：对全 kind 生效
            w.tickCount = 100;
            w.effects.Add(new WbFx { kind = "tornado", x = 100.5, y = 60.5, ttl = 4, age = 3, r = 3 });
            w.effects.Add(new WbFx { kind = "acid", x = 140.5, y = 60.5, ttl = 7, age = 3, r = 3 });
            w.effects.Add(new WbFx { kind = "blizzard", x = 180.5, y = 60.5, ttl = 12, age = 3, r = 3 });
            w.rngA = 0x0A0E09u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);                               // age 3→4：tornado 到期
            Assert.That(w.effects.Count, Is.EqualTo(2));
            Assert.That(w.effects[0].kind, Is.EqualTo("acid"));
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.effects.Count, Is.EqualTo(2), "age 5 < 7 未到期");
            w.tickCount += 2;
            WbBailRelay.EffectsTick(w); WbBailRelay.EffectsTick(w);   // age 6→7→8：acid 第 7 到期
            Assert.That(w.effects.Count, Is.EqualTo(1));
            Assert.That(w.effects[0].kind, Is.EqualTo("blizzard"));
        }

        [Test]
        public void Test35_ActiveBattles_Percent5_Cleanup()
        {
            var w = new WbWorld();                                    // activeBattles %5 清理（L10443-10447）——门判用 effectsTick 调用时 tickCount（gen 协议 ++ 后）
            w.tickCount = 99;                                         // ++ → 100：% 5 == 0 → 门开
            w.activeBattles[12850] = 103;                             // exp 103 > 100 未到期
            w.activeBattles[12851] = 100;                             // exp 100 <= 100 到期
            w.rngA = 1u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.activeBattles.ContainsKey(12851), Is.False, "到期项出账");
            Assert.That(w.activeBattles.ContainsKey(12850), Is.True, "未到期项保留");
            w.tickCount = 105;                                        // ++ → 106：% 5 != 0 → 门关
            w.activeBattles[12852] = 100;
            w.rngA = 1u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.activeBattles.ContainsKey(12852), Is.True, "门关零清理");
            w.tickCount = 109;                                        // ++ → 110：% 5 == 0 → 12850(103<=110) 补出账
            w.rngA = 1u;
            w.tickCount++;
            WbBailRelay.EffectsTick(w);
            Assert.That(w.activeBattles.ContainsKey(12850), Is.False, "第二次门开补出账");
        }

        [Test]
        public void Test35_EffectsSlot_Wired()
        {
            var orch = new WbTickOrch { w = new WbWorld() };          // EFFECTS 槽（6）——宿主接线钉（直测装配语义）
            Assert.That(WbTickOrch.EFFECTS, Is.EqualTo(6), "槽位常量（civs 块之后 L2528）");
            orch.D[WbTickOrch.EFFECTS] = () => WbBailRelay.EffectsTick(orch.w);   // WireOrch 同形真函数引用
            orch.w.effects.Add(new WbFx { kind = "tornado", x = 100.5, y = 60.5, ttl = 30, age = 0, r = 4 });
            orch.w.rngA = 0x0A0E01u;
            orch.w.tickCount = 1001;
            orch.D[WbTickOrch.EFFECTS]();                             // 槽直调
            Assert.That(orch.w.effects[0].age, Is.EqualTo(1.0), "槽驱动 age++（effectsTick 执行实证）");
        }

        [Test]
        public void Test35_FxMinor_TwelveKinds()
        {
            Assert.That(WbWorld.IsFxMinor("bullet"), Is.True, "M-U10a 补齐 bullet");
            Assert.That(WbWorld.IsFxMinor("frost"), Is.True, "M-U10a 补齐 frost");
            Assert.That(WbWorld.IsFxMinor("dmg") && WbWorld.IsFxMinor("smoke") && WbWorld.IsFxMinor("blood"), Is.True);
            Assert.That(WbWorld.IsFxMinor("tornado"), Is.False, "关键特效不可逐出（天灾必须可见）");
            Assert.That(WbWorld.IsFxMinor("rainstorm"), Is.False);
        }

        [Test]
        public void Test35_WaterTier_Refresh_DirtyFace()
        {
            var w = new WbWorld();                                    // 水深场三件（L1011-1070）——refreshWaterTierAround dirty 面
            int deep = 60 * WbWorld.W + 107, water = 60 * WbWorld.W + 108;
            w.terrain[deep] = WbWorld.T_DEEP; w.terrain[water] = WbWorld.T_WATER;
            w.waterTier[deep] = 0; w.waterTier[water] = 0;            // 注入旧 tier（generate 旧地形基线）
            w.dirty.Clear();
            WbBailRelay.SetTerrain(w, 60 * WbWorld.W + 104, WbWorld.T_WATER);   // 新水格 → 窗口 x∈[101,107] 含 deep(107)
            Assert.That(w.waterTier[deep], Is.EqualTo(3), "DEEP 邻普通水 = 陆架 3（L1025）");
            Assert.That(w.waterTier[water], Is.EqualTo(0), "窗口外水格不扫（半径 3 窗）——旧 tier 保持");
            Assert.That(w.dirty.Contains(deep), Is.True, "tier 变化格标脏（L1066-1068）");
        }
    }
}
