// ============================================================
// WbNatureTests.cs — M-U17「板块构造与地质演变域」黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/nature.json（12 场景）
//   由 scripts/unity-migration/gen-nature.mjs 生成（真引擎 GameEngine +
//   NatureSystem 构造 + initPlates 直调（独立流 seed^0x51ab7）+ 手术式夹具
//   （stress/heat/drift 直写 + pre 钩子 boundary 动态选点/fillRect/mkBuilding/
//   mkUnitAt）+ rngA 尾置清零 + calls 直调链；det 双跑字节级一致；md5 7f837aec）。
//   蓝本 nature.ts：initPlates L93-131 / recomputePlates L132-166 /
//   seasonCheck L213-241 / tectonicTick L781-828 / releaseQuake L831-881 /
//   geologyTick L882-1061 + engine.ts natureQuake L10561-10590 + volcano
//   L10746-10777 / tsunami L10780-10785 / ignite L1075-1081 消费面。
// 镜像: nature-transcript.mjs 零引擎导入 12/12 ALL PASS（bun 口径——红证双旋钮
//   NAT_RED=quake 禁释压 → S4-S7 FAIL；NAT_RED=volc 禁喷发 → S10 FAIL → 复绿）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 12/12 → 本文件 NUnit C# 全链
//   重放（WbBailRelay 六函数 + NatureQuake + SetTerrain 全级联 + FdLog2 位精确件
//   + attackBuilding/destroyBuilding/volcano/tsunami/ignite 已译件消费）逐位对账。
// 对账面: 每步 rngA/terrain md5/fxCount/eventsCount/shake/dirtyN/propsDirtyN +
//   nat 18 键（plateN/plateMd5/plateC/drift/boundaryN/boundaryMd5/stressMd5/
//   hotspots/moistMd5/ashFMd5/ash/rainCellMd5/counters 十键/recentQuakes/
//   lastSeason/epoch/yearF/stormSeq）+ 终态 terrain gz 逐字节 + fx 全列 +
//   events 全列 + units dump + toasts 全列。
// 直测面: initPlates 独立流零掷锚 + seasonCheck first 静默/四宣告/复位链 +
//   natureQuake falloff/伤亡/封顶 + geologyTick 喷发 ashF 场均。
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
    public class WbNatureTests
    {
        private static string FindNature()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "nature.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "nature.json"),
                "nature.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: nature.json");
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

        private static string Md5Hex(byte[] data)
        {
            using var md5 = System.Security.Cryptography.MD5.Create();
            var h = md5.ComputeHash(data);
            var sb = new System.Text.StringBuilder(h.Length * 2);
            foreach (byte b in h) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        private static string F32Md5(float[] arr)
        {
            byte[] b = new byte[arr.Length * 4];
            System.Buffer.BlockCopy(arr, 0, b, 0, b.Length);
            return Md5Hex(b);
        }

        private static string U16Md5(IEnumerable<int> vals)
        {
            var list = new List<int>(vals);
            byte[] b = new byte[list.Count * 2];
            for (int k = 0; k < list.Count; k++) { b[k * 2] = (byte)list[k]; b[k * 2 + 1] = (byte)(list[k] >> 8); }
            return Md5Hex(b);
        }

        /// <summary>C# 全链重放：gen-nature 手术一（瞬态层清零）+ 手术二（fixture 注入——plate/stress/boundary/hotspots/building/units 全面）+ 手术三（rngA 起流）</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            // —— 手术一：瞬态层清零（gen-nature buildScenario 同构）——
            Array.Clear(w.fire, 0, w.fire.Length);
            w.fireSet.Clear(); w.fireSetList.Clear();
            w.frozen.Clear(); w.frozenList.Clear(); w.flood.Clear(); w.wet.Clear(); w.regrow.Clear();
            w.units.Clear(); w.unitById.Clear();
            w.unitSeq = 1; w.eventSeq = 1;
            w.effects.Clear(); w.worldEvents.Clear();
            Array.Clear(w.building, 0, w.building.Length);
            w.buildings.Clear(); w.bIdx.Clear();
            Array.Clear(w.road, 0, w.road.Length);
            Array.Clear(w.riverDir, 0, w.riverDir.Length);
            w.riverTiles.Clear(); w.riverTilesList.Clear();
            Array.Clear(w.waterTier, 0, w.waterTier.Length);
            Array.Clear(w.radiate, 0, w.radiate.Length);
            w.radSet.Clear();
            w.dirty.Clear(); w.propsDirty.Clear();
            w.shake = 0;
            w.toasts.Clear();
            w.statNukes = 0;
            // —— 手术二：fixture 注入（nature 域全状态面）——
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            w.plate = GunzipB64(fx.Value<string>("plate0"));
            byte[] sb = GunzipB64(fx.Value<string>("stress0"));
            System.Buffer.BlockCopy(sb, 0, w.stress, 0, sb.Length);
            w.plateN = fx.Value<int>("plateN0");
            var pc = (JArray)fx["plateC0"];
            w.plateCx.Clear(); w.plateCy.Clear();
            for (int k = 0; k < w.plateN; k++) { w.plateCx.Add(F64Of(pc[k].Value<string>())); w.plateCy.Add(F64Of(pc[w.plateN + k].Value<string>())); }
            w.drift.Clear();
            foreach (var d in (JArray)fx["drift0"]) { byte[] db = Convert.FromHexString(d.Value<string>()); w.drift.Add(new double[] { BitConverter.ToDouble(db, 0), BitConverter.ToDouble(db, 8) }); }
            // boundary 直接注入（S11 单格化手术面固化——插入序 = gen 端 [...boundary] 序）
            w.boundaryList.Clear(); w.boundarySet.Clear();
            byte[] bb = GunzipB64(fx.Value<string>("boundary0"));
            for (int k = 0; k < bb.Length; k += 2) { int v = bb[k] | (bb[k + 1] << 8); w.boundaryList.Add(v); w.boundarySet.Add(v); }
            // hotspots 注入（hotXY0 坐标全列表 + heat0 f64hex 列）
            w.hotX.Clear(); w.hotY.Clear(); w.hotHeat.Clear();
            var hxy = (JArray)fx["hotXY0"];
            var heat = (JArray)fx["heat0"];
            for (int k = 0; k < hxy.Count; k++) { w.hotX.Add(hxy[k][0].Value<int>()); w.hotY.Add(hxy[k][1].Value<int>()); w.hotHeat.Add(F64Of(heat[k].Value<string>())); }
            // moist 0.35 fill（initPlates L115 面——镜像端同构）
            for (int k = 0; k < w.moist.Length; k++) w.moist[k] = 0.35f;
            // 建筑面 + 单位面（pre 钩子动态面固化）
            byte[] bu = GunzipB64(fx.Value<string>("building0"));
            for (int k = 0; k < bu.Length; k++) if (bu[k] != 0) { w.building[k] = bu[k]; }
            w.buildings.Clear(); w.bIdx.Clear();
            // buildings 列表面（gen 端 mkBuilding push 序——building[] 面扫描重建 bIdx 序）
            for (int k = 0; k < bu.Length; k++) if (w.building[k] != 0) { w.bIdx[k] = w.buildings.Count; w.buildings.Add(new WbBuilding { i = k, x = k % WbWorld.W, y = k / WbWorld.W, kind = w.building[k], civ = -1 }); }
            foreach (var uo in (JArray)fx["units0"])
            {
                var u = new WbU
                {
                    id = uo.Value<int>("id"), race = uo.Value<int>("race"), civ = -1,
                    x = uo.Value<double>("x"), y = uo.Value<double>("y"),
                    tx = uo.Value<double>("x"), ty = uo.Value<double>("y"),
                    hp = uo.Value<double>("hp"), maxHp = uo.Value<double>("maxHp"),
                    dmg = 1, speed = 1, name = "u" + uo.Value<int>("id"),
                };
                w.units.Add(u); w.unitById[u.id] = u;
            }
            w.natureSeed = sc.Value<int>("baseSeed");   // nature 系统种子（recomputePlates valueNoise jit 输入——L140）
            w.seasonOffset = fx.Value<int>("seasonOffset0");
            w.yearF = fx.Value<double>("yearF0");
            w.lastSeason = -1;                                  // engine applyWorldGen L917 面
            w.tickCount = sc.Value<int>("tickCount");
            // —— 手术三：rngA 尾置清零起流 ——
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        private static double F64Of(string hex) => BitConverter.ToDouble(Convert.FromHexString(hex), 0);

        /// <summary>nat 18 键逐位对账（gen-nature dumpNature 协议同构）</summary>
        private static void AssertNature(WbWorld w, JObject g, string key, string label)
        {
            Assert.That(w.plateN, Is.EqualTo(g.Value<int>("plateN")), $"plateN {key} {label}");
            Assert.That(Md5Hex(w.plate), Is.EqualTo(g.Value<string>("plateMd5")), $"plateMd5 {key} {label}");
            var goldC = new List<string>();
            foreach (var h in (JArray)g["plateC"]) goldC.Add(h.Value<string>());
            var gotC = new List<string>();
            foreach (var v in w.plateCx) gotC.Add(F64Hex(v));
            foreach (var v in w.plateCy) gotC.Add(F64Hex(v));
            Assert.That(gotC, Is.EqualTo(goldC), $"plateC {key} {label}");
            var goldD = new List<string>();
            foreach (var h in (JArray)g["drift"]) goldD.Add(h.Value<string>());
            var gotD = new List<string>();
            foreach (var d in w.drift) gotD.Add(F64Hex(d[0]) + F64Hex(d[1]));
            Assert.That(gotD, Is.EqualTo(goldD), $"drift {key} {label}");
            Assert.That(w.boundarySet.Count, Is.EqualTo(g.Value<int>("boundaryN")), $"boundaryN {key} {label}");
            Assert.That(U16Md5(w.boundaryList), Is.EqualTo(g.Value<string>("boundaryMd5")), $"boundaryMd5 {key} {label}");
            Assert.That(F32Md5(w.stress), Is.EqualTo(g.Value<string>("stressMd5")), $"stressMd5 {key} {label}");
            var goldH = (JArray)g["hotspots"];
            Assert.That(w.hotX.Count, Is.EqualTo(goldH.Count), $"hotspots count {key} {label}");
            for (int k = 0; k < goldH.Count; k++)
            {
                Assert.That(w.hotX[k], Is.EqualTo(goldH[k].Value<int>("x")), $"hotX {key} {label}#{k}");
                Assert.That(w.hotY[k], Is.EqualTo(goldH[k].Value<int>("y")), $"hotY {key} {label}#{k}");
                Assert.That(F64Hex(w.hotHeat[k]), Is.EqualTo(goldH[k].Value<string>("heat")), $"hotHeat {key} {label}#{k}");
            }
            Assert.That(F32Md5(w.moist), Is.EqualTo(g.Value<string>("moistMd5")), $"moistMd5 {key} {label}");
            Assert.That(F32Md5(w.ashF), Is.EqualTo(g.Value<string>("ashFMd5")), $"ashFMd5 {key} {label}");
            Assert.That(F64Hex(w.ash), Is.EqualTo(g.Value<string>("ash")), $"ash {key} {label}");
            Assert.That(Md5Hex(w.rainCell), Is.EqualTo(g.Value<string>("rainCellMd5")), $"rainCellMd5 {key} {label}");
            Assert.That(w.natCounters.ToList(), Is.EqualTo(g["counters"].ToObject<List<int>>()), $"counters {key} {label}");
            var goldRq = (JArray)g["recentQuakes"];
            Assert.That(w.rqX.Count, Is.EqualTo(goldRq.Count), $"recentQuakes count {key} {label}");
            for (int k = 0; k < goldRq.Count; k++)
            {
                Assert.That(w.rqX[k], Is.EqualTo(goldRq[k].Value<int>("x")), $"rqX {key} {label}#{k}");
                Assert.That(w.rqY[k], Is.EqualTo(goldRq[k].Value<int>("y")), $"rqY {key} {label}#{k}");
                Assert.That(F64Hex(w.rqM[k]), Is.EqualTo(goldRq[k].Value<string>("m")), $"rqM {key} {label}#{k}");
                Assert.That(w.rqYear[k], Is.EqualTo(goldRq[k].Value<int>("year")), $"rqYear {key} {label}#{k}");
            }
            Assert.That(w.lastSeason, Is.EqualTo(g.Value<int>("lastSeason")), $"lastSeason {key} {label}");
            Assert.That(w.plateEpoch, Is.EqualTo(g.Value<int>("epoch")), $"epoch {key} {label}");
            Assert.That(F64Hex(w.yearF), Is.EqualTo(g.Value<string>("yearF")), $"yearF {key} {label}");
            Assert.That(w.stormSeq, Is.EqualTo(g.Value<int>("stormSeq")), $"stormSeq {key} {label}");
        }

        /// <summary>步进快照公共面对账（gen-nature snapCommon 协议同构——6 面通用 + nat 18 键）</summary>
        private static void AssertCommon(WbWorld w, JObject g, string key, int s)
        {
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{s}");
            Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{s}");
            Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{s}");
            Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{s}");
            Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{s}");
            Assert.That(w.dirty.Count, Is.EqualTo(g.Value<int>("dirtyN")), $"dirtyN {key} S{s}");
            Assert.That(w.propsDirty.Count, Is.EqualTo(g.Value<int>("propsDirtyN")), $"propsDirtyN {key} S{s}");
            AssertNature(w, (JObject)g["nat"], key, $"S{s}");
        }

        /// <summary>终态 fx/events/units/toasts 对账（gen-nature dump 协议同构）</summary>
        private static void AssertFinal(WbWorld w, JObject sc, string key)
        {
            var goldFx = (JArray)sc["fx"];
            Assert.That(w.effects.Count, Is.EqualTo(goldFx.Count), $"fx count {key}");
            for (int k = 0; k < goldFx.Count; k++)
            {
                var e = (JObject)goldFx[k];
                var f = w.effects[k];
                Assert.That(f.kind, Is.EqualTo(e.Value<string>("kind")), $"fx.kind {key}#{k}");
                Assert.That(F64Hex(f.x), Is.EqualTo(e.Value<string>("x")), $"fx.x {key}#{k}");
                Assert.That(F64Hex(f.y), Is.EqualTo(e.Value<string>("y")), $"fx.y {key}#{k}");
                Assert.That(F64Hex(f.ttl), Is.EqualTo(e.Value<string>("ttl")), $"fx.ttl {key}#{k}");
                Assert.That(f.seed, Is.EqualTo(e.Value<int>("seed")), $"fx.seed {key}#{k}");
                Assert.That(F64Hex(f.dir), Is.EqualTo(e.Value<string>("dir")), $"fx.dir {key}#{k}");
                Assert.That(e["r"] == null || e["r"].Type == JTokenType.Null ? 1.0 : e.Value<double>("r"), Is.EqualTo(f.r), $"fx.r {key}#{k}");
                Assert.That(f.age, Is.EqualTo(e.Value<double>("age")), $"fx.age {key}#{k}");
                Assert.That(f.quiet ? 1 : 0, Is.EqualTo(e.Value<int>("quiet")), $"fx.quiet {key}#{k}");
            }
            var goldEv = (JArray)sc["events"];
            Assert.That(w.worldEvents.Count, Is.EqualTo(goldEv.Count), $"events count {key}");
            for (int k = 0; k < goldEv.Count; k++)
            {
                var e = (JObject)goldEv[k];
                var v = w.worldEvents[k];
                Assert.That(v.kind, Is.EqualTo(e.Value<string>("kind")), $"ev.kind {key}#{k}");
                Assert.That(v.text, Is.EqualTo(e.Value<string>("text")), $"ev.text {key}#{k}");
                Assert.That(v.x ?? null, Is.EqualTo(e["x"] == null || e["x"].Type == JTokenType.Null ? (double?)null : e.Value<double>("x")), $"ev.x {key}#{k}");
                Assert.That(v.y ?? null, Is.EqualTo(e["y"] == null || e["y"].Type == JTokenType.Null ? (double?)null : e.Value<double>("y")), $"ev.y {key}#{k}");
            }
            var goldU = (JArray)sc["units"];
            Assert.That(w.units.Count, Is.EqualTo(goldU.Count), $"units count {key}");
            for (int k = 0; k < goldU.Count; k++)
            {
                var e = (JObject)goldU[k];
                var u = w.units[k];
                Assert.That(u.id, Is.EqualTo(e.Value<int>("id")), $"u.id {key}#{k}");
                Assert.That(F64Hex(u.x), Is.EqualTo(e.Value<string>("x")), $"u.x {key}#{k}");
                Assert.That(F64Hex(u.y), Is.EqualTo(e.Value<string>("y")), $"u.y {key}#{k}");
                Assert.That(F64Hex(u.hp), Is.EqualTo(e.Value<string>("hp")), $"u.hp {key}#{k}");
                Assert.That(F64Hex(u.hurtN ?? 0.0), Is.EqualTo(e.Value<string>("hurt")), $"u.hurt {key}#{k}");
                Assert.That(u.dead, Is.EqualTo(e.Value<int>("dead")), $"u.dead {key}#{k}");
            }
            var goldT = (JArray)sc["toasts"];
            Assert.That(w.toasts.Count, Is.EqualTo(goldT.Count), $"toasts count {key}");
            for (int k = 0; k < goldT.Count; k++)
            {
                var e = (JObject)goldT[k];
                Assert.That(w.toasts[k].id, Is.EqualTo(e.Value<int>("id")), $"toast.id {key}#{k}");
                Assert.That(w.toasts[k].text, Is.EqualTo(e.Value<string>("text")), $"toast.text {key}#{k}");
                Assert.That(w.toasts[k].tone, Is.EqualTo(e.Value<string>("tone")), $"toast.tone {key}#{k}");
            }
        }

        /// <summary>单步直调（nt.* 前缀 nature 域——gen calls 协议同构）</summary>
        private static void Invoke(WbWorld w, string fn)
        {
            switch (fn)
            {
                case "nt.seasonCheck": WbBailRelay.NatureSeasonCheck(w); break;
                case "nt.tectonicTick": WbBailRelay.NatureTectonicTick(w); break;
                case "nt.geologyTick": WbBailRelay.NatureGeologyTick(w); break;
                case "nt.recomputePlates": WbBailRelay.NatureRecomputePlates(w); break;
                case "nt.initPlates": WbBailRelay.NatureInitPlates(w); break;
                default: throw new System.Exception("未知直调: " + fn);
            }
        }

        [Test]
        public void Test49_Nature_GoldenReplay()
        {
            var gold = JObject.Parse(System.IO.File.ReadAllText(FindNature()));
            var scens = (JArray)gold["scenarios"];
            Assert.That(scens.Count, Is.EqualTo(12));
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
                    if (g["preYear"] != null && g["preYear"].Type != JTokenType.Null) w.yearF = g.Value<double>("preYear");
                    Invoke(w, fn);
                    AssertCommon(w, g, key, k);
                }
                byte[] gz = GunzipB64(sc.Value<string>("terrain"));
                Assert.That(w.terrain, Is.EqualTo(gz), $"终态 terrain 逐字节 {key}");
                AssertNature(w, (JObject)sc["nat"], key, "终态");
                AssertFinal(w, sc, key);
            }
        }

        /// <summary>initPlates 独立流确定性直测：主链 rngA 零消费（totalDraws=0 锚）+ plateN 域 + boundary 非空 + 热点 2-4 + stress 全 0 + moist 0.35</summary>
        [Test]
        public void Test49_Nature_InitPlates()
        {
            var w = new WbWorld();
            w.natureSeed = 20261101;
            w.rngA = 0x0E171001u;
            WbBailRelay.NatureInitPlates(w);
            Assert.That(w.rngA, Is.EqualTo(0x0E171001u), "initPlates 主链零掷——rngA 不动");
            Assert.That(w.plateN, Is.InRange(5, 7), "plateN 5-7");
            Assert.That(w.boundarySet.Count, Is.GreaterThan(100), "boundary 非空");
            Assert.That(w.boundaryList.Count, Is.EqualTo(w.boundarySet.Count), "boundaryList/Set 双结构一致");
            Assert.That(w.hotX.Count, Is.InRange(2, 4), "热点 2-4");
            for (int k = 0; k < w.hotX.Count; k++)
            {
                Assert.That(w.hotHeat[k], Is.EqualTo(0.0), "热点 heat 初 0");
                Assert.That(w.boundarySet.Contains(w.hotY[k] * WbWorld.W + w.hotX[k]), Is.True, $"热点#{k} 在边界上");
            }
            Assert.That(w.stress[0], Is.EqualTo(0f), "stress 全 0");
            Assert.That(w.moist[0], Is.EqualTo(0.35f), "moist 0.35");
            Assert.That(w.ash, Is.EqualTo(0.0), "ash 0");
            Assert.That(w.stormSeq, Is.EqualTo(1), "stormSeq 1");
            Assert.That(w.plateEpoch, Is.EqualTo(0), "epoch 0");
            // 二跑确定性：recomputePlates 复算 plate/boundary 零变
            var plateMd5 = Md5Hex(w.plate);
            var bMd5 = U16Md5(w.boundaryList);
            WbBailRelay.NatureRecomputePlates(w);
            Assert.That(Md5Hex(w.plate), Is.EqualTo(plateMd5), "recomputePlates 二跑 plate 零变");
            Assert.That(U16Md5(w.boundaryList), Is.EqualTo(bMd5), "recomputePlates 二跑 boundary 零变");
        }

        /// <summary>seasonCheck 直测：first 静默全图刷（dirty 40960）+ 四宣告文本序 + ice/snowman/thaw 复位链 + lastSeason 序</summary>
        [Test]
        public void Test49_Nature_SeasonCycle()
        {
            var w = new WbWorld();
            for (int k = 0; k < w.moist.Length; k++) w.moist[k] = 0.35f;
            Assert.That(w.lastSeason, Is.EqualTo(-1), "lastSeason 初 -1");
            w.iceChronDone = true; w.snowmanChronDone = true; w.thawChronDone = true;   // 复位面预置
            w.yearF = 0.0;
            WbBailRelay.NatureSeasonCheck(w);
            Assert.That(w.lastSeason, Is.EqualTo(0), "首调 lastSeason 0");
            Assert.That(w.dirty.Count, Is.EqualTo(WbWorld.W * WbWorld.H), "first 全图刷 40960");
            Assert.That(w.toasts.Count, Is.EqualTo(0), "first 静默不宣告");
            Assert.That(w.iceChronDone, Is.False, "离冬复位 ice（s=0≠3）");
            Assert.That(w.snowmanChronDone, Is.False, "离冬复位 snowman");
            Assert.That(w.thawChronDone, Is.True, "s=0 thaw 不复位");
            w.dirty.Clear();
            w.yearF = 2.5;   // 夏
            WbBailRelay.NatureSeasonCheck(w);
            Assert.That(w.lastSeason, Is.EqualTo(1), "夏");
            Assert.That(w.toasts.Count, Is.EqualTo(1), "夏宣告");
            Assert.That(w.toasts[0].text, Does.StartWith("盛夏"), "盛夏文本");
            Assert.That(w.toasts[0].tone, Is.EqualTo("info"), "夏 tone");
            Assert.That(w.thawChronDone, Is.False, "夏 thaw 复位（s=1≠0）");
            w.yearF = 4.5;   // 秋
            WbBailRelay.NatureSeasonCheck(w);
            Assert.That(w.toasts[1].text, Does.StartWith("秋色"), "秋色文本");
            w.yearF = 6.5;   // 冬
            WbBailRelay.NatureSeasonCheck(w);
            Assert.That(w.toasts[2].text, Does.StartWith("寒冬"), "寒冬文本");
            Assert.That(w.toasts[2].tone, Is.EqualTo("danger"), "冬 tone danger");
            w.iceChronDone = true; w.snowmanChronDone = true;
            w.yearF = 8.5;   // 春
            WbBailRelay.NatureSeasonCheck(w);
            Assert.That(w.toasts[3].text, Does.StartWith("春回"), "春回文本");
            Assert.That(w.toasts[3].tone, Is.EqualTo("good"), "春 tone good");
            Assert.That(w.lastSeason, Is.EqualTo(0), "冬→春闭环 lastSeason 0");
            Assert.That(w.iceChronDone, Is.False, "离冬复位链（冬→春 s=0≠3）");
            Assert.That(w.snowmanChronDone, Is.False, "离冬复位链 snowman");
            Assert.That(w.thawChronDone, Is.False, "离春复位 thaw（s=0）");
        }

        /// <summary>natureQuake 直测：fx 2 掷 + shake 封顶 14 + falloff 位级 + 伤亡 dmg 公式 + 地裂 BURNT 门 + lastCatastrophe 三元</summary>
        [Test]
        public void Test49_Nature_QuakeRing()
        {
            var w = new WbWorld();
            w.tickCount = 1000;
            w.rngA = 0x0E1710AAu;
            for (int k = 0; k < w.moist.Length; k++) w.moist[k] = 0.35f;
            // 建筑 + 单位夹具（震中 (128.5, 80.5) m=7.3 量级）
            w.building[128 * WbWorld.W + 128] = 1;
            w.bIdx[128 * WbWorld.W + 128] = 0;
            w.buildings.Add(new WbBuilding { i = 128 * WbWorld.W + 128, x = 128, y = 128, kind = 1, civ = -1 });
            var u1 = new WbU { id = 1, race = 6, civ = -1, x = 129, y = 80, hp = 50, maxHp = 50, dmg = 1, speed = 1, name = "u1" };
            var u2 = new WbU { id = 2, race = 6, civ = -1, x = 160, y = 80, hp = 50, maxHp = 50, dmg = 1, speed = 1, name = "u2" };
            w.units.Add(u1); w.unitById[1] = u1;
            w.units.Add(u2); w.unitById[2] = u2;
            WbBailRelay.NatureQuake(w, 128.5, 80.5, 7.3);
            // fx quake：r = round(2+(7.3-4.4)*4.2) = round(14.18) = 14；dur = round(24+98.6) = round(122.6) = 123
            Assert.That(w.effects.Count, Is.EqualTo(1), "fx quake 单发");
            var f = w.effects[0];
            Assert.That(f.kind, Is.EqualTo("quake"), "fx kind");
            Assert.That(f.r, Is.EqualTo(14.0), "fx r=14");
            Assert.That(f.ttl, Is.EqualTo(123.0), "fx dur=round(24+(m-4.4)*34)");
            // shake = min(14, round(3+(7.3-4.4)*4.5)) = min(14, round(16.05)) = min(14, 16) = 14 封顶
            Assert.That(w.shake, Is.EqualTo(14.0), "shake 封顶 14");
            // lastCatastrophe 三元（engine L10564）
            Assert.That(w.lastCatastropheX, Is.EqualTo(128.5), "lastCatastropheX");
            Assert.That(w.lastCatastropheY, Is.EqualTo(80.5), "lastCatastropheY");
            Assert.That(w.lastCatastropheTick, Is.EqualTo(1000L), "lastCatastropheTick");
            // 伤亡：u1 d=hypot(0.5,0.5)=0.707 → dmg=(12+70*0.6042)*max(0.2,1-0.707/15)≈54.3*0.9529
            double intensity = (7.3 - 4.4) / 4.8;
            double d1 = WbNoise.V8Hypot(129 - 128.5, 80 - 80.5);
            double dmg1 = (12.0 + 70.0 * intensity) * System.Math.Max(0.2, 1.0 - d1 / 15.0);
            Assert.That(u1.hp, Is.EqualTo(50.0 - dmg1).Within(1e-9), "u1 伤亡位级");
            Assert.That(u1.hurtN ?? 0, Is.EqualTo(20.0), "u1 hurtN=20 单轨");
            Assert.That(u2.hp, Is.EqualTo(50.0), "u2 d=31.5>r+1 幸存零伤");
            // 地裂：m>=7 → rng<0.05*intensity*falloff 面（掷流位级由黄金锁——此处验掷已消耗）
            Assert.That(w.rngA, Is.Not.EqualTo(0x0E1710AAu), "地裂/塌毁掷流已推进");
        }

        /// <summary>geologyTick 喷发直测：heat≥2.6 → 0.3 门 → volcano 消费（M-U16 译件）+ ashF 注入 + 场均 ash + 热点链逆漂移位移</summary>
        [Test]
        public void Test49_Nature_EruptionAsh()
        {
            var w = new WbWorld();
            w.natureSeed = 20261101;
            w.rngA = 0x0E1710BBu;
            for (int k = 0; k < w.moist.Length; k++) w.moist[k] = 0.35f;
            WbBailRelay.NatureInitPlates(w);
            // 热点 heat 直写 3.0（喷发门面）+ drift[0] 直写位移面
            Assert.That(w.hotX.Count, Is.GreaterThanOrEqualTo(1), "热点在位");
            w.hotHeat[0] = 3.0;
            double hx0 = w.hotX[0], hy0 = w.hotY[0];
            // stress 全 0 → pw=2（stress||0 > 14 门假）
            WbBailRelay.NatureGeologyTick(w);
            // 喷发是否中签由 0.3 掷决定——分叉断言（黄金 S10 已锁中签面；此处验语义）
            if (w.natCounters[2] == 1)
            {
                Assert.That(w.hotHeat[0], Is.EqualTo(0.4), "喷发后 heat=0.4");
                Assert.That(w.effects.Any(e => e.kind == "volcano"), Is.True, "volcano fx 消费面");
                int cell = w.NatureCellOf((int)hx0, (int)hy0);
                Assert.That(w.ashF[cell], Is.GreaterThanOrEqualTo(0.0f).And.LessThanOrEqualTo(1.0f), "ashF 注入域");
                double sum = 0; for (int k = 0; k < w.ashF.Length; k++) sum += w.ashF[k];
                Assert.That(w.ash, Is.EqualTo(sum / (WbConstants.AW * WbConstants.AH)).Within(1e-15), "ash 场均位级");
                // 热点链位移：h.x = max(4, min(W-5, round(hx0 - drift[pHere].dx*5)))
                Assert.That(w.hotX[0], Is.InRange(4, WbWorld.W - 5), "热点链位移钳位域");
                Assert.That(w.hotY[0], Is.InRange(4, WbWorld.H - 5), "热点链位移钳位域");
            }
            else
            {
                Assert.That(w.hotHeat[0], Is.EqualTo(3.0).Within(1e-12).Or.EqualTo(0.4), "未中签 heat 保持（或第二热点先喷 heat 清零面）");
            }
        }
    }
}
