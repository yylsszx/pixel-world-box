// ============================================================
// WbTool3Tests.cs — M-U16 切片四「神力生成器域」+ M-U19 特质域 + M-U20 river runtime 黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/tool3.json（15 场景）
//   由 scripts/unity-migration/gen-tool3.mjs 生成（真引擎 GameEngine 构造 +
//   手术式夹具直写〔terrain/fire/radiate/units 瘦直写 + brush/五成就计数直写〕+
//   rngA 尾置清零起流 + calls 直调 / ticks 步进（tickCount++ 头 + effectsTick——
//   主循环 L2508 序）混合链；det 双跑字节级一致；M-U20 md5 07ece0b7）。
//   蓝本 engine.ts：22 神力生成器 acidRain L10737-10743 / volcano L10746-10777 /
//   tsunami L10780-10785 / blizzard L10788-10795 / meteorShower L10798-10812 /
//   locust L10815-10820 / drought L10823-10829 / rainCloud L10834-10842 /
//   blessArea L10845-10858 / curseArea L10861-10871 / loveArea L10874-10885 /
//   mutateArea L10888-10906（M-U19：civ 0.3 reroll/0.25 jumpGene 0.12 + wild
//   baseGene/jumpGene 0.2 + fx 每命中单位 2 掷）/ teleportArea L10908-10923
//   （randomLandSpot L11026-11036）/ wrathStorm L10926-10932 / holyStorm
//   L10936-10943 / plasmaCannon L10947-10955 / annihilationLight L10959-10967 /
//   sandstorm L10972-10977 / typhoon L10980-10985 / sinkhole L10988-10996 /
//   iceAge L10999-11006 / famineCloud L11009-11014 / blackhole L11017-11023 +
//   meteor L12277-12283 + applyTool case L13342-13455 + effectsTick 消费端四支
//   volcano L9857-9882 / wrath L10029-10035 / holystorm L10036-10073 / typhoon
//   L10097-10125；M-U19 特质域 rerollTrait L11037-11057 / baseGene L11059-11066 /
//   jumpGene L11085-11103 / rollTrait L1473-1476 + TRAITS types.ts L264-276 /
//   JOBS L296-305；M-U20 river runtime carveRiver L12312-12420 / carveLake
//   L12425-12441 / setTerrain 级联 L975-1013 / soilMulAt worldsim.ts L168-170。
// 镜像: tool3-transcript.mjs 零引擎导入 15/15 ALL PASS（bun 口径——红证四旋钮
//   TOOL3_RED=cap / lava / mutate / river——river 禁 setTerrain 级联直写语义
//   → river-runtime fireMd5 FAIL → 复绿 15/15）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 15/15 → 本文件 NUnit C# 全链
//   重放（22 生成器全译件 + ApplyTool 25 case + EffectsTick 消费端四支 +
//   Lightning M-U15 复用 + SetTerrain 全级联 + FxHook 2 掷 + AddEvent colorHex
//   + M-U19 MutateArea/RerollTrait/JumpGene）逐位对账。
// 对账面: 每步 rngA/terrain/fire/radiate md5 + fireSet/frozen/regrow/flood/wet/
//   radSet 序 + fxCount/eventsCount/buildingsCount/shake/stats 五联/unitsCount +
//   tick 步 fx(kind/age/x/y/dir)/units(id/hp/hurt/dead/x/y)/dirty 排序列 +
//   终态 terrain/radiate gz 逐字节 + variantMd5 + fx 全列（x0/y0/age/quiet/dmg）
//   + events 全列（colorHex）+ units dump 全字段位级（M-U19：trait/gene 四维）
//   + toasts 全列。
// 直测面: volcano 锥体 21 格/引燃圈 8 点/灼烧环 + pw 三档 + bless/curse/love/
//   teleport 四瞬态 + repro 门 + cap 门 13 族 + blackhole 计数先于 cap + iceAge
//   笔刷联动缺省 + holystorm 审判/缓愈/驱瘟 + M-U19 rerollTrait 乘数卸除/上装
//   + jumpGene 铛位 0.5/2 恰等 + baseGene 空表零掷 + dead/界外双 skip +
//   M-U20 river runtime 级联（火墙全灭/regrow 删/owner 清/flood 删/绿洲成林）。
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
    public class WbTool3Tests
    {
        private static string FindTool3()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "tool3.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "tool3.json"),
                "tool3.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: tool3.json");
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

        /// <summary>瘦单位直写（gen-tool3 mkUnit 协议同构）</summary>
        private static void MkUnit(WbWorld w, JObject uo)
        {
            int id = uo.Value<int>("id");
            double hp = uo.Value<double?>("hp") ?? 10.0;
            var u = new WbU
            {
                id = id,
                race = uo.Value<int>("race"),
                civ = -1,
                x = uo.Value<double>("x"), y = uo.Value<double>("y"),
                tx = uo.Value<double>("x"), ty = uo.Value<double>("y"),
                hp = hp, maxHp = uo.Value<double?>("maxHp") ?? hp, dmg = 1, speed = 1,
                ageF = 0, maxAgeF = 9999.0, kills = 0,
                name = "u" + id,
                hurtN = uo.Value<double?>("hurt") ?? 0.0,
                breathN = 0,
                parity = 0,
                dead = uo.Value<int?>("dead") ?? 0,
                infected = uo.Value<bool?>("infected") ?? false ? 1 : 0,
                flip = 0,
                traitName = uo["trait"] != null && uo["trait"].Type == JTokenType.String ? uo.Value<string>("trait") : null,
                jobC = uo["job"] != null ? uo.Value<int>("job") : 0,   // M-U19：jumpGene JOBS[job] 消费面（fixture units0 job 直写面）
                geneC = uo["gene"] is JObject gj ? new WbGene { s = gj.Value<double>("s"), d = gj.Value<double>("d"), h = gj.Value<double>("h"), r = gj.Value<double>("r") } : null,   // M-U19：preset gene 直写面
                famC = null, fgnC = null,
            };
            w.units.Add(u);
            w.unitById[u.id] = u;
        }

        /// <summary>直测最小世界（terrain 默认全 DEEP——直测自刷 GRASS 全域 fill；owner 构造器已 fill(-1)）</summary>
        private static WbWorld FreshWorld(uint seed)
        {
            var w = new WbWorld();
            Array.Clear(w.fire, 0, w.fire.Length);
            w.fireSet.Clear(); w.fireSetList.Clear();
            w.frozen.Clear(); w.frozenList.Clear(); w.flood.Clear(); w.wet.Clear(); w.regrow.Clear();
            w.units.Clear(); w.unitById.Clear();
            w.unitSeq = 1; w.eventSeq = 1;
            w.effects.Clear(); w.worldEvents.Clear();
            Array.Clear(w.building, 0, w.building.Length);
            w.buildings.Clear(); w.bIdx.Clear();
            Array.Clear(w.radiate, 0, w.radiate.Length);
            w.radSet.Clear();
            w.shake = 0;
            w.brush = 3;                                   // L688 默认
            w.statNukes = 0;                               // L230-234 成就计数五联清零
            w.statMeteorShowers = 0;
            w.statPlasmas = 0;
            w.statAnnihilations = 0;
            w.statBlackholes = 0;
            w.tickCount = 1000;
            w.rngA = seed;
            return w;
        }

        /// <summary>C# 全链重放：gen-tool3 手术一（瞬态层清零）+ 手术二（直写相 + variant Hash2 重建）+ 手术三（rngA 起流）→ 调用方执行 steps</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            // —— 手术一：瞬态层清零（gen-tool3 buildScenario 同构；owner 构造器已 fill(-1)）——
            Array.Clear(w.fire, 0, w.fire.Length);
            w.fireSet.Clear(); w.fireSetList.Clear();
            w.frozen.Clear(); w.frozenList.Clear(); w.flood.Clear(); w.wet.Clear(); w.regrow.Clear();
            w.units.Clear(); w.unitById.Clear();
            w.unitSeq = 1; w.familySeq = 1; w.eventSeq = 1;
            w.wildCount.Clear(); w.families.Clear();
            w.effects.Clear(); w.worldEvents.Clear();
            Array.Clear(w.building, 0, w.building.Length);
            w.buildings.Clear(); w.bIdx.Clear();
            Array.Clear(w.road, 0, w.road.Length);
            Array.Clear(w.riverDir, 0, w.riverDir.Length);
            w.riverTiles.Clear(); w.riverTilesList.Clear();
            Array.Clear(w.waterTier, 0, w.waterTier.Length);
            Array.Clear(w.radiate, 0, w.radiate.Length);
            w.radSet.Clear();
            w.dirty.Clear();
            w.shake = 0;
            w.brush = fx.Value<int>("brush0");                // L688 直写面（iceAge 笔刷联动缺省消费面）
            w.statNukes = 0;                                  // L230-234 成就计数五联直写清零
            w.statMeteorShowers = 0;
            w.statPlasmas = 0;
            w.statAnnihilations = 0;
            w.statBlackholes = 0;
            w.yearF = fx.Value<double>("yearF0");
            w.tickCount = sc.Value<int>("tickCount");
            // —— 手术二：直写相（terrain/soil/regrow/flood/fire/radiate/units）——
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            w.soilF = GunzipB64(fx.Value<string>("soil0"));
            foreach (var t in (JArray)fx["regrow0"]) w.regrow[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var t in (JArray)fx["flood0"]) w.flood[t[0].Value<int>()] = t[1].Value<long>();
            foreach (var t in (JArray)fx["fireSet0"]) { w.fireSet.Add(t.Value<int>()); w.fireSetList.Add(t.Value<int>()); }
            byte[] fb = GunzipB64(fx.Value<string>("fire0"));
            System.Buffer.BlockCopy(fb, 0, w.fire, 0, fb.Length);
            byte[] rb = GunzipB64(fx.Value<string>("radiate0"));
            System.Buffer.BlockCopy(rb, 0, w.radiate, 0, rb.Length);
            foreach (var t in (JArray)fx["radSet0"]) w.radSet[t[0].Value<int>()] = t[1].Value<int>();
            foreach (var uo in (JArray)fx["units0"]) MkUnit(w, (JObject)uo);
            // variant 确定域重建（worldgen L65 hash2(x,y,baseSeed+999)——fixture 无 variant0 面协议，R3 红线）
            int baseSeed = sc.Value<int>("baseSeed");
            for (int yy = 0; yy < WbWorld.H; yy++)
                for (int xx = 0; xx < WbWorld.W; xx++)
                    w.variant[yy * WbWorld.W + xx] = (byte)System.Math.Floor(WbNoise.Hash2(xx, yy, baseSeed + 999) * 255.0);
            // —— 手术三：rngA 尾置清零起流 ——
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        /// <summary>parms 解包（蓝本 params?: Record&lt;string,number&gt;——JSON 数字域 double）</summary>
        private static Dictionary<string, double> ParseParms(JToken p)
        {
            if (p == null || p.Type != JTokenType.Object) return null;
            var d = new Dictionary<string, double>();
            foreach (var kv in (JObject)p) d[kv.Key] = kv.Value.Value<double>();
            return d;
        }

        /// <summary>stats 五联对账（engine L230-234——[nukes, meteorShowers, plasmas, annihilations, blackholes]）</summary>
        private static void AssertStats(WbWorld w, JArray goldStats, string label)
        {
            var got = new List<int> { w.statNukes, w.statMeteorShowers, w.statPlasmas, w.statAnnihilations, w.statBlackholes };
            Assert.That(got, Is.EqualTo(goldStats.ToObject<List<int>>()), $"stats {label}");
        }

        /// <summary>步进快照公共 16 面对账（gen-tool3 snapCommon 协议同构）</summary>
        private static void AssertCommon(WbWorld w, JObject g, string key, int s)
        {
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{s}");
            Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{s}");
            Assert.That(Md5Hex(w.fire), Is.EqualTo(g.Value<string>("fireMd5")), $"fireMd5 {key} S{s}");
            Assert.That(w.fireSetList, Is.EqualTo(g["fireSet"].ToObject<List<int>>()), $"fireSet 序 {key} S{s}");
            Assert.That(w.fireSet.SetEquals(w.fireSetList), $"fireSet 集合=镜像 {key} S{s}");
            var goldFlood = new List<string>();
            foreach (var t in (JArray)g["flood"]) goldFlood.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotFlood = new List<string>();
            foreach (var kv in w.flood) gotFlood.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotFlood, Is.EqualTo(goldFlood), $"flood 序 {key} S{s}");
            var goldRegrow = new List<string>();
            foreach (var t in (JArray)g["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotRegrow = new List<string>();
            foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 序 {key} S{s}");
            var goldWet = new List<string>();
            foreach (var t in (JArray)g["wet"]) goldWet.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
            var gotWet = new List<string>();
            foreach (var kv in w.wet) gotWet.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotWet, Is.EqualTo(goldWet), $"wet 序 {key} S{s}");
            Assert.That(new List<int>(w.frozenList.Count > 0 || w.frozen.Count > 0 ? w.frozenList : new List<int>(w.frozen)), Is.EqualTo(g["frozen"].ToObject<List<int>>()), $"frozen 序 {key} S{s}");
            Assert.That(Md5Hex(w.radiate), Is.EqualTo(g.Value<string>("radiateMd5")), $"radiateMd5 {key} S{s}");
            var goldRad = new List<string>();
            foreach (var t in (JArray)g["radSet"]) goldRad.Add($"{t[0].Value<int>()}:{t[1].Value<int>()}");
            var gotRad = new List<string>();
            foreach (var kv in w.radSet) gotRad.Add($"{kv.Key}:{kv.Value}");
            Assert.That(gotRad, Is.EqualTo(goldRad), $"radSet 序 {key} S{s}");
            Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{s}");
            Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{s}");
            Assert.That(w.buildings.Count, Is.EqualTo(g.Value<int>("buildingsCount")), $"buildingsCount {key} S{s}");
            Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{s}");
            AssertStats(w, (JArray)g["stats"], $"{key} S{s}");
            Assert.That(w.units.Count, Is.EqualTo(g.Value<int>("unitsCount")), $"unitsCount {key} S{s}");
        }

        /// <summary>终态 units dump 全字段位级对账（gen-tool3 dumpUnit 协议同构——bless/curse/fert 三瞬态扩展）</summary>
        private static void AssertUnitsDump(WbWorld w, JArray goldUnits, string key)
        {
            Assert.That(w.units.Count, Is.EqualTo(goldUnits.Count), $"units count {key}");
            for (int k = 0; k < goldUnits.Count; k++)
            {
                var e = (JObject)goldUnits[k];
                var u = w.units[k];
                Assert.That(u.id, Is.EqualTo(e.Value<int>("id")), $"u.id {key}#{k}");
                Assert.That(u.race, Is.EqualTo(e.Value<int>("race")), $"u.race {key}#{k}");
                Assert.That(u.civ, Is.EqualTo(e.Value<int>("civ")), $"u.civ {key}#{k}");
                Assert.That(F64Hex(u.x), Is.EqualTo(e.Value<string>("x")), $"u.x {key}#{k}");
                Assert.That(F64Hex(u.y), Is.EqualTo(e.Value<string>("y")), $"u.y {key}#{k}");
                Assert.That(F64Hex(u.tx), Is.EqualTo(e.Value<string>("tx")), $"u.tx {key}#{k}");
                Assert.That(F64Hex(u.ty), Is.EqualTo(e.Value<string>("ty")), $"u.ty {key}#{k}");
                Assert.That(F64Hex(u.hp), Is.EqualTo(e.Value<string>("hp")), $"u.hp {key}#{k}");
                Assert.That(F64Hex(u.maxHp), Is.EqualTo(e.Value<string>("maxHp")), $"u.maxHp {key}#{k}");
                Assert.That(F64Hex(u.hurtN ?? 0.0), Is.EqualTo(e.Value<string>("hurtN")), $"u.hurtN {key}#{k}");
                Assert.That(u.dead != 0 ? 1 : 0, Is.EqualTo(e.Value<int>("dead")), $"u.dead {key}#{k}");
                Assert.That(u.infected, Is.EqualTo(e.Value<int>("infected")), $"u.infected {key}#{k}");
                Assert.That(u.bless, Is.EqualTo(e["bless"].Type == JTokenType.Null ? 0 : e.Value<int>("bless")), $"u.bless {key}#{k}");
                Assert.That(u.curse, Is.EqualTo(e["curse"].Type == JTokenType.Null ? 0 : e.Value<int>("curse")), $"u.curse {key}#{k}");
                Assert.That(u.fert, Is.EqualTo(e["fert"].Type == JTokenType.Null ? 0 : e.Value<int>("fert")), $"u.fert {key}#{k}");
                Assert.That(u.name, Is.EqualTo(e.Value<string>("name")), $"u.name {key}#{k}");
                Assert.That(u.jobC ?? 0, Is.EqualTo(e.Value<int?>("job") ?? 0), $"u.job {key}#{k}");   // M-U19：engine u.job 消费面
                Assert.That(u.traitName, Is.EqualTo(e["trait"] == null || e["trait"].Type == JTokenType.Null ? null : e.Value<string>("trait")), $"u.trait {key}#{k}");   // M-U19
                Assert.That(F64Hex(u.dmg), Is.EqualTo(e.Value<string>("dmg")), $"u.dmg {key}#{k}");       // M-U19：jumpGene/rerollTrait dmg 写面
                Assert.That(F64Hex(u.speed), Is.EqualTo(e.Value<string>("speed")), $"u.speed {key}#{k}");   // M-U19：speed 写面
                if (e["gene"] == null || e["gene"].Type == JTokenType.Null) Assert.That(u.geneC, Is.Null, $"u.gene null {key}#{k}");   // M-U19：gene 四维位级
                else
                {
                    Assert.That(u.geneC, Is.Not.Null, $"u.gene nonnull {key}#{k}");
                    Assert.That(F64Hex(u.geneC.s), Is.EqualTo(e["gene"].Value<string>("s")), $"u.gene.s {key}#{k}");
                    Assert.That(F64Hex(u.geneC.d), Is.EqualTo(e["gene"].Value<string>("d")), $"u.gene.d {key}#{k}");
                    Assert.That(F64Hex(u.geneC.h), Is.EqualTo(e["gene"].Value<string>("h")), $"u.gene.h {key}#{k}");
                    Assert.That(F64Hex(u.geneC.r), Is.EqualTo(e["gene"].Value<string>("r")), $"u.gene.r {key}#{k}");
                }
            }
        }

        [Test]
        public void Test48_Tool3_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindTool3()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(15));
            foreach (var scTok in scens)
            {
                var sc = (JObject)scTok;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                var snaps = (JArray)sc["stepsSnap"];
                for (int k = 0; k < snaps.Count; k++)
                {
                    var g = (JObject)snaps[k];
                    string fn = g.Value<string>("fn");
                    if (fn == "applyTool")
                    {
                        var args = (JArray)g["args"];
                        string toolId = args[0].Value<string>();
                        double wx = args[1].Value<double>(), wy = args[2].Value<double>();
                        var parms = args.Count >= 4 ? ParseParms(args[3]) : null;
                        WbBailRelay.ApplyTool(w, toolId, wx, wy, parms);
                    }
                    else
                    {
                        Assert.That(fn, Is.EqualTo("effectsTick"), $"fn {key} S{k}");
                        w.tickCount++;                        // gen 步进协议：tickCount++ 头（主循环 L2508 序）
                        WbBailRelay.EffectsTick(w);
                    }
                    AssertCommon(w, g, key, k);
                    if (fn == "effectsTick")
                    {
                        // tick 步 fx 列（kind/age/x/y/dir）
                        var goldFx = (JArray)g["fx"];
                        Assert.That(w.effects.Count, Is.EqualTo(goldFx.Count), $"tick fx count {key} S{k}");
                        for (int q = 0; q < goldFx.Count; q++)
                        {
                            var e = (JObject)goldFx[q];
                            var f = w.effects[q];
                            Assert.That(f.kind, Is.EqualTo(e.Value<string>("kind")), $"tick fx kind {key} S{k}#{q}");
                            Assert.That(f.age, Is.EqualTo(e.Value<double>("age")), $"tick fx age {key} S{k}#{q}");
                            Assert.That(F64Hex(f.x), Is.EqualTo(e.Value<string>("x")), $"tick fx x {key} S{k}#{q}");
                            Assert.That(F64Hex(f.y), Is.EqualTo(e.Value<string>("y")), $"tick fx y {key} S{k}#{q}");
                            Assert.That(F64Hex(f.dir), Is.EqualTo(e.Value<string>("dir")), $"tick fx dir {key} S{k}#{q}");
                        }
                        // tick 步 units 列（id/hp/hurt/dead/x/y）
                        var goldU = (JArray)g["units"];
                        Assert.That(w.units.Count, Is.EqualTo(goldU.Count), $"tick units count {key} S{k}");
                        for (int q = 0; q < goldU.Count; q++)
                        {
                            var e = (JObject)goldU[q];
                            var u = w.units[q];
                            Assert.That(u.id, Is.EqualTo(e.Value<int>("id")), $"tick u.id {key} S{k}#{q}");
                            Assert.That(F64Hex(u.hp), Is.EqualTo(e.Value<string>("hp")), $"tick u.hp {key} S{k}#{q}");
                            Assert.That(F64Hex(u.hurtN ?? 0.0), Is.EqualTo(e.Value<string>("hurt")), $"tick u.hurt {key} S{k}#{q}");
                            Assert.That(u.dead != 0 ? 1 : 0, Is.EqualTo(e.Value<int>("dead")), $"tick u.dead {key} S{k}#{q}");
                            Assert.That(F64Hex(u.x), Is.EqualTo(e.Value<string>("x")), $"tick u.x {key} S{k}#{q}");
                            Assert.That(F64Hex(u.y), Is.EqualTo(e.Value<string>("y")), $"tick u.y {key} S{k}#{q}");
                        }
                        // tick 步 dirty 排序列
                        var goldDirty = g["dirty"].ToObject<List<int>>();
                        var gotDirty = w.dirty.OrderBy(x => x).ToList();
                        Assert.That(gotDirty, Is.EqualTo(goldDirty), $"tick dirty {key} S{k}");
                    }
                }
                // 终态：terrain/radiate gz 逐字节 + variantMd5 + regrow 序 + shake + stats 五联
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("terrain")), w.terrain, $"terrain 终态 {key}");
                CollectionAssert.AreEqual(GunzipB64(sc.Value<string>("radiate")), w.radiate, $"radiate 终态 {key}");
                Assert.That(Md5Hex(w.variant), Is.EqualTo(sc.Value<string>("variantMd5")), $"variantMd5 终态 {key}");
                var goldRegrow = new List<string>();
                foreach (var t in (JArray)sc["regrow"]) goldRegrow.Add($"{t[0].Value<int>()}:{t[1].Value<long>()}");
                var gotRegrow = new List<string>();
                foreach (var kv in w.regrow) gotRegrow.Add($"{kv.Key}:{kv.Value}");
                Assert.That(gotRegrow, Is.EqualTo(goldRegrow), $"regrow 终态序 {key}");
                Assert.That(w.shake, Is.EqualTo(sc.Value<double>("shake")), $"shake 终态 {key}");
                AssertStats(w, (JArray)sc["stats"], $"{key} 终态");
                var goldRad2 = new List<string>();
                foreach (var t in (JArray)sc["radSet"]) goldRad2.Add($"{t[0].Value<int>()}:{t[1].Value<int>()}");
                var gotRad2 = new List<string>();
                foreach (var kv in w.radSet) gotRad2.Add($"{kv.Key}:{kv.Value}");
                Assert.That(gotRad2, Is.EqualTo(goldRad2), $"radSet 终态序 {key}");
                // 终态 fx 全列（kind/x/y/x0/y0/ttl/seed/dir/r/age/quiet/dmg 位级）
                var goldFxAll = (JArray)sc["fx"];
                Assert.That(w.effects.Count, Is.EqualTo(goldFxAll.Count), $"fx count {key}");
                for (int k = 0; k < goldFxAll.Count; k++)
                {
                    var e = (JObject)goldFxAll[k];
                    var f = w.effects[k];
                    Assert.That(f.kind, Is.EqualTo(e.Value<string>("kind")), $"fx kind {key}#{k}");
                    Assert.That(f.seed, Is.EqualTo(e.Value<int>("seed")), $"fx seed {key}#{k}");
                    Assert.That(F64Hex(f.x), Is.EqualTo(e.Value<string>("x")), $"fx x {key}#{k}");
                    Assert.That(F64Hex(f.y), Is.EqualTo(e.Value<string>("y")), $"fx y {key}#{k}");
                    Assert.That(F64Hex(f.x0), Is.EqualTo(e.Value<string>("x0")), $"fx x0 {key}#{k}");
                    Assert.That(F64Hex(f.y0), Is.EqualTo(e.Value<string>("y0")), $"fx y0 {key}#{k}");
                    Assert.That(F64Hex(f.ttl), Is.EqualTo(e.Value<string>("ttl")), $"fx ttl {key}#{k}");
                    Assert.That(F64Hex(f.dir), Is.EqualTo(e.Value<string>("dir")), $"fx dir {key}#{k}");
                    double gr = e["r"].Type == JTokenType.Float || e["r"].Type == JTokenType.Integer ? e.Value<double>("r") : 1.0;
                    Assert.That(f.r, Is.EqualTo(gr), $"fx r {key}#{k}");
                    Assert.That(f.age, Is.EqualTo(e.Value<double>("age")), $"fx age {key}#{k}");
                    Assert.That(f.quiet ? 1 : 0, Is.EqualTo(e.Value<int>("quiet")), $"fx quiet {key}#{k}");
                    if (e["dmg"].Type == JTokenType.Null) Assert.That(f.dmg.HasValue, Is.False, $"fx dmg null {key}#{k}");
                    else Assert.That(F64Hex(f.dmg ?? 0.0), Is.EqualTo(e.Value<string>("dmg")), $"fx dmg {key}#{k}");
                }
                // 终态 events 全列（含 colorHex——annihilationLight '#ff4d4d' 面）
                var goldEv = (JArray)sc["events"];
                Assert.That(w.worldEvents.Count, Is.EqualTo(goldEv.Count), $"events count {key}");
                for (int k = 0; k < goldEv.Count; k++)
                {
                    var e = (JObject)goldEv[k];
                    var ev = w.worldEvents[k];
                    Assert.That(ev.kind, Is.EqualTo(e.Value<string>("kind")), $"ev kind {key}#{k}");
                    Assert.That(ev.text, Is.EqualTo(e.Value<string>("text")), $"ev text {key}#{k}");
                    if (e["colorHex"].Type == JTokenType.Null) Assert.That(ev.colorHex, Is.Null, $"ev colorHex null {key}#{k}");
                    else Assert.That(ev.colorHex, Is.EqualTo(e.Value<string>("colorHex")), $"ev colorHex {key}#{k}");
                    if (e["x"].Type == JTokenType.Null) Assert.That(ev.x.HasValue, Is.False, $"ev x null {key}#{k}");
                    else Assert.That(ev.x, Is.EqualTo(e.Value<double?>("x")), $"ev x {key}#{k}");
                    if (e["y"].Type == JTokenType.Null) Assert.That(ev.y.HasValue, Is.False, $"ev y null {key}#{k}");
                    else Assert.That(ev.y, Is.EqualTo(e.Value<double?>("y")), $"ev y {key}#{k}");
                }
                AssertUnitsDump(w, (JArray)sc["units"], key);
                var goldToasts = (JArray)sc["toasts"];
                Assert.That(w.toasts.Count, Is.EqualTo(goldToasts.Count), $"toasts count {key}");
                for (int k = 0; k < goldToasts.Count; k++)
                {
                    var e = (JObject)goldToasts[k];
                    Assert.That(w.toasts[k].text, Is.EqualTo(e.Value<string>("text")), $"toast text {key}#{k}");
                    Assert.That(w.toasts[k].tone, Is.EqualTo(e.Value<string>("tone")), $"toast tone {key}#{k}");
                    Assert.That(w.toasts[k].id, Is.EqualTo(e.Value<int>("id")), $"toast id {key}#{k}");
                }
            }
        }

        /// <summary>直测一：volcano 锥体 21 格/山口 LAVA/引燃圈 8 点/灼烧环 0.8/tick + pw 三档 shake + 边缘钳位</summary>
        [Test]
        public void Test48_Tool3_VolcanoConeRing()
        {
            // —— S1 同源：默认参 pw=1 + 30 tick 消费端（u900 d=1 灼烧死 / u901 d=4 环外幸存）——
            var w = FreshWorld(0x0C610001);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            MkUnit(w, new JObject { ["id"] = 900, ["race"] = WbConstants.R_SHEEP, ["x"] = 101.0, ["y"] = 60.0, ["hp"] = 20.0, ["maxHp"] = 20.0 });
            MkUnit(w, new JObject { ["id"] = 901, ["race"] = WbConstants.R_SHEEP, ["x"] = 104.0, ["y"] = 60.0, ["hp"] = 200.0, ["maxHp"] = 200.0 });
            w.rngA = 0x0C610001;
            WbBailRelay.ApplyTool(w, "volcano", 100, 60);
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_LAVA), "山口 LAVA（L10759）");
            int cone = 0;
            for (int dy = -2; dy <= 2; dy++) for (int dx = -2; dx <= 2; dx++)
                if (WbMath.FdHypot(dx, dy) <= 2.3 && w.terrain[(60 + dy) * WbWorld.W + (100 + dx)] == WbWorld.T_MOUNTAIN) cone++;
            Assert.That(cone, Is.EqualTo(20), "锥体 hypot≤2.3 = 21 格 MOUNTAIN（5x5 去四角）减山口 1 格被 LAVA 覆写（L10759 后写胜）= 20");
            Assert.That(w.fireSet.Count, Is.EqualTo(8), "引燃圈 8 点全点燃（L10768-10772）");
            Assert.That(w.shake, Is.EqualTo(8.0), "shake=max(0,6+1×2)=8");
            Assert.That(w.worldEvents[0].text, Is.EqualTo("大地震颤，一座火山拔地而起，岩浆喷薄而出"), "pw=1 纪事文本分叉");
            for (int k = 0; k < 30; k++) { w.tickCount++; WbBailRelay.EffectsTick(w); }
            Assert.That(w.units[0].dead != 0, Is.True, "u900 d=1 灼烧环 hp20-0.8/tick 死亡");
            Assert.That(F64Hex(w.units[0].hurtN ?? 0.0), Is.EqualTo("0000000000002840"), "hurtN=12 位级（S1 黄金同源）");
            Assert.That(F64Hex(w.units[1].hp), Is.EqualTo("0000000000006940"), "u901 d=4 环外 hp=200 幸存（S1 黄金位级）");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("fd2256cd"), "28 掷 rng 链终态位级（S1 黄金同源）");
            // —— S2 同源：pw=3 十字 + 3x3 熔岩湖 + ring=10.5 + shake 12 封顶 ——
            w = FreshWorld(0x0C610002);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            MkUnit(w, new JObject { ["id"] = 910, ["race"] = WbConstants.R_SHEEP, ["x"] = 110.0, ["y"] = 70.0, ["hp"] = 200.0, ["maxHp"] = 200.0 });
            w.rngA = 0x0C610002;
            WbBailRelay.ApplyTool(w, "volcano", 100, 60, new Dictionary<string, double> { { "power", 3.0 } });
            Assert.That(w.terrain[60 * WbWorld.W + 101], Is.EqualTo(WbWorld.T_LAVA), "十字熔岩（pw≥2 支）");
            Assert.That(w.terrain[60 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_LAVA), "山口 LAVA");
            Assert.That(w.terrain[50 * WbWorld.W + 100], Is.EqualTo(WbWorld.T_GRASS), "ring=10.5 引燃圈外 GRASS 不变");
            Assert.That(w.fireSet.Count, Is.EqualTo(8), "引燃圈 8 点");
            Assert.That(w.shake, Is.EqualTo(12.0), "shake=max(0,6+3×2)=12");
            Assert.That(w.worldEvents[0].text, Is.EqualTo("大地震颤，一座火山拔地而起，熔岩以烈度 3 喷薄而出"), "pw>1 纪事文本分叉");
            Assert.That(F64Hex(w.units[0].hp), Is.EqualTo("0000000000006940"), "u910 d≈14.1 环外幸存 hp=200（S2 黄金位级）");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("5013c394"), "10 掷 rng 链终态位级（S2 黄金同源）");
            // —— S11 同源：(1,1) 边缘双钳 cx,cy=2,2 + 引燃圈 j wrap 卫门 ——
            w = FreshWorld(0x0C61000B);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            w.rngA = 0x0C61000B;
            WbBailRelay.ApplyTool(w, "volcano", 1, 1);
            Assert.That(w.terrain[2 * WbWorld.W + 2], Is.EqualTo(WbWorld.T_LAVA), "(1,1)→cx,cy=2,2 双钳山口");
            foreach (int i in w.fireSet) { Assert.That(i, Is.InRange(0, WbWorld.W * WbWorld.H - 1), "fireSet 全在界内（j wrap 卫门 L10771）"); }
            Assert.That(F64Hex(w.effects[0].x), Is.EqualTo("0000000000000440"), "fx 坐标 cx+0.5=2.5（S11 黄金位级）");
            Assert.That(F64Hex(w.effects[0].y), Is.EqualTo("0000000000000440"), "fx 坐标 cy+0.5=2.5");
            for (int k = 0; k < 8; k++) { w.tickCount++; WbBailRelay.EffectsTick(w); }   // S11 ticks=8：age6 外溢 2 掷（黄金 totalDraws=9=7+2）
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("e2e849a8"), "9 掷 rng 链终态位级（S11 黄金同源）");
        }

        /// <summary>直测二：bless/curse/love/teleport 四瞬态 + repro 门 + teleport 迁移位级</summary>
        [Test]
        public void Test48_Tool3_AreaPowers()
        {
            // —— S6 同源：四单位四神力（bless hp→70 + bless/curse/fert 三瞬态叠印 + teleport 迁移）——
            var w = FreshWorld(0x0C610006);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            MkUnit(w, new JObject { ["id"] = 930, ["race"] = WbConstants.R_SHEEP, ["x"] = 99.0, ["y"] = 60.0, ["hp"] = 20.0, ["maxHp"] = 100.0, ["infected"] = true });
            MkUnit(w, new JObject { ["id"] = 931, ["race"] = WbConstants.R_SHEEP, ["x"] = 101.0, ["y"] = 60.0, ["hp"] = 100.0, ["maxHp"] = 100.0 });
            MkUnit(w, new JObject { ["id"] = 932, ["race"] = WbConstants.R_SHEEP, ["x"] = 100.5, ["y"] = 61.0, ["hp"] = 100.0, ["maxHp"] = 100.0 });
            MkUnit(w, new JObject { ["id"] = 933, ["race"] = WbConstants.R_SHEEP, ["x"] = 100.0, ["y"] = 59.0, ["hp"] = 100.0, ["maxHp"] = 100.0 });
            w.rngA = 0x0C610006;
            WbBailRelay.ApplyTool(w, "bless", 100, 60);
            Assert.That(F64Hex(w.unitById[930].hp), Is.EqualTo("0000000000805140"), "bless hp=min(100,20+50)=70 位级（L10850）");
            Assert.That(w.unitById[930].bless, Is.EqualTo(600), "bless=600 瞬态（L10851）");
            Assert.That(w.unitById[930].infected, Is.EqualTo(0), "驱瘟 infected→false（L10852）");
            Assert.That(w.unitById[931].bless, Is.EqualTo(600), "满血单位亦得 bless 瞬态（环内无条件）");
            WbBailRelay.ApplyTool(w, "curse", 100, 60);
            Assert.That(w.unitById[930].curse, Is.EqualTo(500), "curse=500 瞬态（L10866）");
            WbBailRelay.ApplyTool(w, "love", 100, 60);
            Assert.That(w.unitById[930].fert, Is.EqualTo(500), "fert=500 瞬态（L10880）");
            WbBailRelay.ApplyTool(w, "teleport", 100, 60);
            Assert.That(F64Hex(w.unitById[933].x), Is.EqualTo("0000000000605a40"), "teleport 落点位级（S6 黄金同源 randomLandSpot 106.5）");
            Assert.That(F64Hex(w.unitById[933].tx), Is.EqualTo(F64Hex(w.unitById[933].x)), "tx 同步落点（L10917）");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("cfd9f622"), "44 掷 rng 链终态位级（S6 黄金同源）");
            // —— repro 门隔离直测：DEMON repro=0 —— 环内唯一单位亦跳过且零掷（L10878 RaceStat.repro 消费切片）——
            var w2 = FreshWorld(0x0C619105);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w2.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            MkUnit(w2, new JObject { ["id"] = 934, ["race"] = WbConstants.R_DEMON, ["x"] = 100.0, ["y"] = 60.0, ["hp"] = 100.0, ["maxHp"] = 100.0 });
            uint rngBeforeLove = w2.rngA;
            WbBailRelay.ApplyTool(w2, "love", 100, 60);
            Assert.That(w2.unitById[934].fert, Is.EqualTo(0), "DEMON repro=0 门跳过（L10878）");
            Assert.That(w2.rngA, Is.EqualTo(rngBeforeLove), "repro 门先于 0.5 门——零掷零 fx（L10878→L10882 序）");
        }

        /// <summary>直测三：静态四神力 + 13 族 cap 门 + blackhole 计数先于 cap + iceAge 笔刷联动缺省</summary>
        [Test]
        public void Test48_Tool3_CapsBlackhole()
        {
            // —— S7 同源：sinkhole r=3/iceage r=10/famine r=6/blackhole r=8 + shake 7 + statBlackholes ——
            var w = FreshWorld(0x0C610007);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            w.rngA = 0x0C610007;
            WbBailRelay.ApplyTool(w, "sinkhole", 100, 60);
            WbBailRelay.ApplyTool(w, "iceage", 100, 60);
            WbBailRelay.ApplyTool(w, "famine", 100, 60);
            WbBailRelay.ApplyTool(w, "blackhole", 100, 60);
            Assert.That(w.effects.Count, Is.EqualTo(4), "四神力 fx 单发");
            Assert.That(w.effects[0].kind, Is.EqualTo("sinkhole"));
            Assert.That(w.effects[0].r, Is.EqualTo(3.0), "sinkhole rr=max(3,brush=3)=3");
            Assert.That(w.effects[1].kind, Is.EqualTo("iceage"));
            Assert.That(w.effects[1].r, Is.EqualTo(10.0), "iceAge rP null → max(6,brush×2+4)=10（L13448 笔刷联动缺省）");
            Assert.That(w.effects[2].kind, Is.EqualTo("famine"));
            Assert.That(w.effects[2].r, Is.EqualTo(6.0), "famine rP null → JS 默认参 6");
            Assert.That(w.effects[3].kind, Is.EqualTo("blackhole"));
            Assert.That(w.effects[3].r, Is.EqualTo(8.0), "blackhole rP null → JS 默认参 8");
            Assert.That(w.shake, Is.EqualTo(7.0), "sinkhole shake=max(0,7)=7");
            Assert.That(w.statBlackholes, Is.EqualTo(1), "statBlackholes 成就计数");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("75bccfaf"), "8 掷 rng 链终态位级（S7 黄金同源）");
            // —— iceAge 笔刷联动隔离直测：brush=5 → max(6,5×2+4)=14；radius=2 → max(6,2)=6 下钳 ——
            w = FreshWorld(0x0C619101);
            w.brush = 5;
            WbBailRelay.ApplyTool(w, "iceage", 100, 60);
            Assert.That(w.effects[0].r, Is.EqualTo(14.0), "brush=5 → max(6,14)=14（L13448 笔刷联动缺省）");
            w = FreshWorld(0x0C619104);
            WbBailRelay.ApplyTool(w, "iceage", 100, 60, new Dictionary<string, double> { { "radius", 2.0 } });
            Assert.That(w.effects[0].r, Is.EqualTo(6.0), "rP=2 → max(6,2)=6 下钳");
            // —— blackhole 计数先于 cap：×3 施放 → fx 2（cap 2 门）+ statBlackholes=3（L11018 计数在门前）——
            w = FreshWorld(0x0C619102);
            WbBailRelay.ApplyTool(w, "blackhole", 100, 60);
            WbBailRelay.ApplyTool(w, "blackhole", 120, 60);
            WbBailRelay.ApplyTool(w, "blackhole", 140, 60);
            int bh = 0;
            foreach (var f in w.effects) if (f.kind == "blackhole") bh++;
            Assert.That(bh, Is.EqualTo(2), "blackhole cap 2 门（第三只拒入）");
            Assert.That(w.statBlackholes, Is.EqualTo(3), "statBlackholes=3 计数先于 cap 门（拒绝施放仍计数）");
            // —— acidrain cap 6 门：×7 施放 → 6 acid fx（第七只零掷拒面）——
            w = FreshWorld(0x0C619103);
            uint rng0 = w.rngA;
            WbBailRelay.ApplyTool(w, "acidrain", 100, 60);
            uint rngAfter1 = w.rngA;
            Assert.That(rngAfter1, Is.Not.EqualTo(rng0), "首施 2 掷（fx seed+dir）");
            for (int k = 0; k < 6; k++) WbBailRelay.ApplyTool(w, "acidrain", 100, 60);
            int acid = 0;
            foreach (var f in w.effects) if (f.kind == "acid") acid++;
            Assert.That(acid, Is.EqualTo(6), "acidrain cap 6 门");
            uint rngBefore7 = w.rngA;
            WbBailRelay.ApplyTool(w, "acidrain", 100, 60);
            Assert.That(w.rngA, Is.EqualTo(rngBefore7), "第七施零掷拒面（count>=6 早退 L10740）");
        }

        /// <summary>直测四：holystorm 消费端 30 tick 审判/缓愈/驱瘟/浇火/净辐/复苏全链位级</summary>
        [Test]
        public void Test48_Tool3_HolyStormTicks()
        {
            // —— S12 同源：恶魔审判 0.4/tick + 绵羊缓愈 0.15/tick + 驱瘟 + BURNT 复苏 + 辐射场保留 ——
            var w = FreshWorld(0x0C61000C);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            w.terrain[63 * WbWorld.W + 100] = WbWorld.T_BURNT;                       // S12 terrain 直写相
            w.fire[60 * WbWorld.W + 103] = 100; w.fireSet.Add(60 * WbWorld.W + 103); w.fireSetList.Add(60 * WbWorld.W + 103);
            w.radiate[60 * WbWorld.W + 98] = 1; w.radSet[60 * WbWorld.W + 98] = 1500;   // tickCount+500
            MkUnit(w, new JObject { ["id"] = 950, ["race"] = WbConstants.R_DEMON, ["x"] = 100.5, ["y"] = 60.5, ["hp"] = 100.0, ["maxHp"] = 100.0 });
            MkUnit(w, new JObject { ["id"] = 951, ["race"] = WbConstants.R_SHEEP, ["x"] = 99.0, ["y"] = 60.0, ["hp"] = 90.0, ["maxHp"] = 100.0, ["infected"] = true });
            MkUnit(w, new JObject { ["id"] = 952, ["race"] = WbConstants.R_SHEEP, ["x"] = 102.0, ["y"] = 61.0, ["hp"] = 100.0, ["maxHp"] = 100.0 });
            w.rngA = 0x0C61000C;
            WbBailRelay.ApplyTool(w, "holystorm", 100, 60);
            Assert.That(w.effects[0].kind, Is.EqualTo("holystorm"));
            Assert.That(w.effects[0].r, Is.EqualTo(4.0), "rr=max(4,brush=3)=4 下钳");
            for (int k = 0; k < 30; k++) { w.tickCount++; WbBailRelay.EffectsTick(w); }
            Assert.That(F64Hex(w.unitById[950].hp), Is.EqualTo("f4ffffffffff5540"), "恶魔审判 hp=100-0.4×30 累积浮点位级（S12 黄金同源）");
            Assert.That(F64Hex(w.unitById[950].hurtN ?? 0.0), Is.EqualTo("0000000000002440"), "hurtN=10 位级（L10062）");
            Assert.That(F64Hex(w.unitById[951].hp), Is.EqualTo("0c00000000a05740"), "无辜缓愈 hp=90+0.15×30 累积浮点位级（S12 黄金同源）");
            Assert.That(w.unitById[951].infected, Is.EqualTo(0), "圣光驱瘟 infected→false（L10070）");
            Assert.That(F64Hex(w.unitById[952].hp), Is.EqualTo("0000000000005940"), "满血单位不缓愈 hp=100 位级（L10066 门）");
            Assert.That(w.effects.Count((f) => f.kind == "holystorm"), Is.EqualTo(1), "holystorm 云存续（ttl=200 > 30 tick）");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("30af3b5e"), "202 掷 rng 链终态位级（S12 黄金同源）");
        }

        /// <summary>直测五（M-U19）：mutateArea 特质域——rerollTrait 乘数卸除/上装 + jumpGene 钳位 0.5/2 恰等 + baseGene 空表零掷 + dead/界外双 skip 位级</summary>
        [Test]
        public void Test48_Tool3_MutateTrait()
        {
            // —— S13 同源：civ 面（u960 giant→reroll 0.3 HIT + jumpGene 0.25 HIT job2 战士乘数；u961 reroll MISS + jump HIT 且 gene.s 门 miss 恒 1 钉面；u962 dead skip；u963 界外 skip）——
            var w = FreshWorld(0x00000144);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            MkUnit(w, new JObject { ["id"] = 960, ["race"] = 0, ["x"] = 99.5, ["y"] = 60.0, ["hp"] = 200.0, ["maxHp"] = 200.0, ["trait"] = "giant", ["job"] = 2 });
            MkUnit(w, new JObject { ["id"] = 961, ["race"] = 0, ["x"] = 101.0, ["y"] = 60.5, ["hp"] = 60.0, ["maxHp"] = 60.0 });
            MkUnit(w, new JObject { ["id"] = 962, ["race"] = WbConstants.R_SHEEP, ["x"] = 100.0, ["y"] = 59.0, ["hp"] = 16.0, ["maxHp"] = 16.0, ["dead"] = 1 });
            MkUnit(w, new JObject { ["id"] = 963, ["race"] = 0, ["x"] = 112.0, ["y"] = 60.0, ["hp"] = 60.0, ["maxHp"] = 60.0 });
            w.rngA = 0x00000144;
            WbBailRelay.ApplyTool(w, "mutate", 100, 60);
            Assert.That(w.unitById[960].traitName, Is.EqualTo("strong"), "u960 reroll 后 trait=strong（rollTrait 12 键集——S13 黄金同源）");
            Assert.That(F64Hex(w.unitById[960].maxHp), Is.EqualTo("0000000000405240"), "u960 maxHp=round(60×1×1.3×0.931851)=73 位级（jumpGene 重算 L11098）");
            Assert.That(F64Hex(w.unitById[960].hp), Is.EqualTo("0000000000405240"), "u960 hp=min(73,111)=73 位级（L11099）");
            Assert.That(F64Hex(w.unitById[960].dmg), Is.EqualTo("3e93ed3d681d2d40"), "u960 dmg=8×1.4×1.35×0.962793=14.557 位级（L11100）");
            Assert.That(F64Hex(w.unitById[960].speed), Is.EqualTo("ab51991ce7f0b63f"), "u960 speed=0.09×1×1.05×0.94829=0.0896 位级（L11101）");
            Assert.That(F64Hex(w.unitById[960].geneC.s), Is.EqualTo("d1b3d9d16358ee3f"), "u960 gene.s 位级");
            Assert.That(F64Hex(w.unitById[961].geneC.s), Is.EqualTo("000000000000f03f"), "u961 gene.s 恰等 1.0（0.6 门 miss 维恒等钉面——{1,1,1,1} 起步）");
            Assert.That(F64Hex(w.unitById[961].maxHp), Is.EqualTo("0000000000004d40"), "u961 maxHp=round(60×0.962656)=58 位级（无特质无 job 乘数支）");
            Assert.That(w.unitById[961].traitName, Is.Null, "u961 reroll 0.3 门 MISS——trait 未动");
            Assert.That(w.unitById[962].geneC, Is.Null, "u962 dead skip——gene 未创建（L10891 先于 isCiv/分支）");
            Assert.That(F64Hex(w.unitById[962].hp), Is.EqualTo("0000000000003040"), "u962 dead hp=16 不变");
            Assert.That(w.unitById[963].geneC, Is.Null, "u963 d=12>r=3 界外 skip");
            Assert.That(F64Hex(w.unitById[963].hp), Is.EqualTo("0000000000004e40"), "u963 界外 hp=60 不变");
            Assert.That(w.effects.Count((f) => f.kind == "mutate"), Is.EqualTo(2), "fx mutate 每命中单位 2 掷（u960/u961——门 miss 亦掷 L10901）");
            Assert.That(w.effects[0].seed, Is.EqualTo(37508), "fx seed 位级");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("3c13703c"), "24 掷 rng 链终态位级（S13 黄金同源）");
            // —— S14 同源：wild 面 3 连发（u970 preset gene s 钳位 2.0 恰等；u971 baseGene 空表零掷 {1,1,1,1}；u972 wolf 捕食者重算）——
            w = FreshWorld(0x00000027);
            for (int yy = 0; yy < WbWorld.H; yy++) for (int xx = 0; xx < WbWorld.W; xx++) w.terrain[yy * WbWorld.W + xx] = WbWorld.T_GRASS;
            MkUnit(w, new JObject { ["id"] = 970, ["race"] = WbConstants.R_SHEEP, ["x"] = 100.0, ["y"] = 60.0, ["hp"] = 16.0, ["maxHp"] = 16.0,
                ["gene"] = new JObject { ["s"] = 1.3, ["d"] = 0.8, ["h"] = 1.1, ["r"] = 0.9 } });
            MkUnit(w, new JObject { ["id"] = 971, ["race"] = WbConstants.R_SHEEP, ["x"] = 101.0, ["y"] = 60.0, ["hp"] = 16.0, ["maxHp"] = 16.0 });
            MkUnit(w, new JObject { ["id"] = 972, ["race"] = WbConstants.R_WOLF, ["x"] = 99.0, ["y"] = 60.5, ["hp"] = 34.0, ["maxHp"] = 34.0 });
            w.rngA = 0x00000027;
            for (int k = 0; k < 3; k++) WbBailRelay.ApplyTool(w, "mutate", 100, 60);
            Assert.That(F64Hex(w.unitById[970].geneC.s), Is.EqualTo("0000000000000040"), "u970 gene.s 恰触钳位 2.0（Math.min 恰等面——3 连发逼近）");
            Assert.That(F64Hex(w.unitById[970].maxHp), Is.EqualTo("0000000000003240"), "u970 maxHp=round(16×1.1)=18 位级");
            Assert.That(F64Hex(w.unitById[970].speed), Is.EqualTo("dbf97e6abc74b33f"), "u970 speed=0.038×2.0=0.076 位级（s 钳位传导重算）");
            Assert.That(F64Hex(w.unitById[971].geneC.r), Is.EqualTo("000000000000f03f"), "u971 gene.r 恒等 1.0（baseGene {1,1,1,1} 起步 + r 维门 miss 钉面）");
            Assert.That(F64Hex(w.unitById[972].maxHp), Is.EqualTo("0000000000003e40"), "u972 maxHp=round(34×0.876787)=30 位级（wolf hp34 基准）");
            Assert.That(F64Hex(w.unitById[972].dmg), Is.EqualTo("8127636520882940"), "u972 dmg=10×1.276587=12.766 位级（wolf dmg10 基准）");
            Assert.That(w.effects.Count((f) => f.kind == "mutate"), Is.EqualTo(9), "3 单位 × 3 连发 fx=9");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("b43a4d0f"), "72 掷 rng 链终态位级（S14 黄金同源）");
        }

        /// <summary>直测六（M-U20）：applyTool case "river" runtime 语义——carveRiver BFS 绕山 + 加权选路 + setTerrain 全级联（火墙灭/regrow 删/owner 清/flood 删）+ 绿洲成林 + fx/toast/event 尾面</summary>
        [Test]
        public void Test48_Tool3_RiverRuntime()
        {
            // —— S15 同源：ReplayScenario 全量手术（terrain0/soil0/fire0/regrow0/flood0/radSet0 + variant Hash2 重建）——
            // soilF/variant 等派生面必须与黄金一致：soilMulAt 差异 → 成林门命中差异 → 掷流分配漂移 → 异路径（M-U20 机制发现）
            var goldRiver = JObject.Parse(System.IO.File.ReadAllText(FindTool3()));
            var riverSc = (JObject)goldRiver["scenarios"].First(t => t.Value<string>("key") == "river-runtime");
            var w = ReplayScenario(riverSc);            // ReplayScenario 尾置 rngA = sc.seed（0x000000A0）
            byte[] ownB = GunzipB64(riverSc["fixture"].Value<string>("owner0"));   // owner0 直装（ReplayScenario 不还原 owner——fixture (26,59)/(26,60)=3 拥有面，owner 清除支断言真实化；级联零 rng 纯簿记）
            System.Buffer.BlockCopy(ownB, 0, w.owner, 0, ownB.Length);
            WbBailRelay.ApplyTool(w, "river", 30, 60);
            Assert.That(w.fireSet.Count, Is.EqualTo(0), "火墙 9 格全灭（setTerrain L997 级联——runtime 语义钉面）");
            Assert.That(w.regrow.Count, Is.EqualTo(1), "regrow 删减 3/4（L985 级联——仅 (20,62) 幸存）");
            Assert.That(w.regrow.ContainsKey(62 * WbWorld.W + 20), Is.True, "幸存格 (20,62) 位级（S15 黄金 15892）");
            Assert.That(w.owner[60 * WbWorld.W + 26] == -1 || w.owner[59 * WbWorld.W + 26] == -1, Is.True, "owner 清除支（L1000-1003 级联）");
            Assert.That(w.flood.Count, Is.EqualTo(0), "flood 删净（L990 灌溉 GRASS 支级联）");
            Assert.That(w.effects.Count((f) => f.kind == "spawn"), Is.EqualTo(1), "fx spawn 尾面（L12385）");
            Assert.That(w.effects[0].seed, Is.EqualTo(22436), "fx spawn seed 位级（S15 黄金同源）");
            Assert.That(F64Hex(w.effects[0].x), Is.EqualTo("0000000000003e40"), "fx x=30.5 位级");
            Assert.That(F64Hex(w.effects[0].y), Is.EqualTo("0000000000004e40"), "fx y=60.5 位级");
            Assert.That(w.worldEvents[0].kind, Is.EqualTo("river"), "event kind");
            Assert.That(w.worldEvents[0].text, Is.EqualTo("一条大河诞生了，蜿蜒流向大海"), "reached 入海支 event 文（L12387）");
            Assert.That(w.worldEvents[0].x, Is.EqualTo(30.5), "event x=sx+0.5 位级");
            Assert.That(w.toasts.Count, Is.EqualTo(1), "toast 宿主回调面（L12386）");
            Assert.That(w.toasts[0].text, Is.EqualTo("一条大河蜿蜒入海"), "toast 文（reached 支）");
            Assert.That(w.toasts[0].id, Is.EqualTo(1), "toastSeq L181 初值 1");
            int forest = 0;
            for (int y = 50; y <= 70; y++) for (int x = 5; x <= 30; x++) if (w.terrain[y * WbWorld.W + x] == WbWorld.T_FOREST) forest++;
            Assert.That(forest, Is.GreaterThanOrEqualTo(1), "成林门 ≥1（L12378 rng<0.05×soilMulAt）");
            Assert.That(w.riverTiles.Count, Is.GreaterThan(0), "riverTiles 流向场记录（L12365）");
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo("a6fce2f1"), "365 掷 rng 链终态位级（S15 黄金同源）");
        }
    }
}
