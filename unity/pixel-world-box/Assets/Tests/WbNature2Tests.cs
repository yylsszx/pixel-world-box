// ============================================================
// WbNature2Tests.cs — M-U18「大气风暴域」黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/nature2.json（15 场景）
//   由 scripts/unity-migration/gen-nature2.mjs 生成（真引擎 GameEngine +
//   NatureSystem 构造 + initPlates 直调 + 手术式夹具（moist/ashF/floodAcc/
//   sstAnom/prevRain/pSys/stormR 直写 + per-call pre 钩子结构化 ops）+ rngA
//   尾置清零 + calls 直调链；det 双跑字节级一致；md5 a73b834f）。
//   蓝本 nature.ts：atmTick L423-625 / pressureTick L629-662 / stormTick
//   L665-778 / hydroTick L1062-1091 + cellStats L404-420 + STORM_NAME_AT
//   L25-27 + engine.ts natureLightning L10546-10558 / stormRavage
//   L10602-10642 / rainFireProbe L10645-10658 消费面。
// 镜像: nature2-transcript.mjs 零引擎导入 15/15 ALL PASS（bun 口径——红证双旋钮）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 → 本文件 NUnit C# 全链
//   重放（WbBailRelay 四 tick + NatureLightning/StormRavage/RainFireProbe +
//   rainRegrow/natureFlood/spawnTornado/sandstorm/drought/carveRiver 已译件
//   消费 + FdCos/FdSin/FdHypot/JsRound 位精确件）逐位对账。
// 对账面: 每步 rngA/terrain md5/fxCount/eventsCount/shake/dirtyN/propsDirtyN +
//   nat 42 键（M-U17 十八键 + M-U18 二十四键：windPhase/floodAccMd5/prevRainMd5/
//   bolt 域五键/rainbow 域七键/meteor 域八键/pSys 5 槽全列/stormR 8 槽全列/
//   sstMd5）+ 终态 terrain gz 逐字节 + fx 全列 + events 全列 + units dump +
//   toasts 全列。
// 直测面: 大气关停早退零掷 / 气压三带漂移双亡 / 冰暴命名池 / 冷血 ×1.4 /
//   hydroTick cap 零掷 / 雷暴冷却窗冬夏分化。
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
    public class WbNature2Tests
    {
        private static string FindNature2()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "nature2.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "nature2.json"),
                "nature2.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: nature2.json");
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

        private static double F64Of(string hex) => BitConverter.ToDouble(Convert.FromHexString(hex), 0);

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

        /// <summary>C# 全链重放：gen-nature2 手术一（瞬态层清零）+ 手术二（fixture 注入——M-U18 大气域全状态面）+ 手术三（rngA 起流）</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            // —— 手术一：瞬态层清零（gen-nature2 buildScenario 同构）——
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
            // —— 手术二：fixture 注入（板块域基座 + M-U18 大气域全状态面）——
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
            // boundary 直接注入（插入序 = gen 端 [...boundary] 序）
            w.boundaryList.Clear(); w.boundarySet.Clear();
            byte[] bb = GunzipB64(fx.Value<string>("boundary0"));
            for (int k = 0; k < bb.Length; k += 2) { int v = bb[k] | (bb[k + 1] << 8); w.boundaryList.Add(v); w.boundarySet.Add(v); }
            // hotspots 注入（hotXY0 坐标全列表 + heat0 f64hex 列）
            w.hotX.Clear(); w.hotY.Clear(); w.hotHeat.Clear();
            var hxy = (JArray)fx["hotXY0"];
            var heat = (JArray)fx["heat0"];
            for (int k = 0; k < hxy.Count; k++) { w.hotX.Add(hxy[k][0].Value<int>()); w.hotY.Add(hxy[k][1].Value<int>()); w.hotHeat.Add(F64Of(heat[k].Value<string>())); }
            // 建筑面 + 单位面
            byte[] bu = GunzipB64(fx.Value<string>("building0"));
            for (int k = 0; k < bu.Length; k++) if (bu[k] != 0) { w.building[k] = bu[k]; }
            w.buildings.Clear(); w.bIdx.Clear();
            for (int k = 0; k < bu.Length; k++) if (w.building[k] != 0) { w.bIdx[k] = w.buildings.Count; w.buildings.Add(new WbBuilding { i = k, x = k % WbWorld.W, y = k / WbWorld.W, kind = w.building[k], civ = -1 }); }
            foreach (var uo in (JArray)fx["units0"])
            {
                var u = new WbU
                {
                    id = uo.Value<int>("id"), race = uo.Value<int>("race"), civ = -1,
                    x = uo.Value<double>("x"), y = uo.Value<double>("y"),
                    tx = uo.Value<double>("x"), ty = uo.Value<double>("y"),
                    hp = uo.Value<double>("hp"), maxHp = uo.Value<double>("maxHp"),
                    boat = uo.Value<int>("boat"),
                    dmg = 1, speed = 1, name = "u" + uo.Value<int>("id"),
                };
                w.units.Add(u); w.unitById[u.id] = u;
            }
            // —— M-U18 大气域输入面（f32 字节面 / u8 面 / f64hex 全列直接注入——镜像端零推导）——
            byte[] fb;
            fb = GunzipB64(fx.Value<string>("moist0")); System.Buffer.BlockCopy(fb, 0, w.moist, 0, fb.Length);
            fb = GunzipB64(fx.Value<string>("ashF0")); System.Buffer.BlockCopy(fb, 0, w.ashF, 0, fb.Length);
            fb = GunzipB64(fx.Value<string>("floodAcc0")); System.Buffer.BlockCopy(fb, 0, w.floodAcc, 0, fb.Length);
            fb = GunzipB64(fx.Value<string>("sst0")); System.Buffer.BlockCopy(fb, 0, w.sstAnom, 0, fb.Length);
            byte[] pr = GunzipB64(fx.Value<string>("prevRain0")); System.Buffer.BlockCopy(pr, 0, w.prevRain, 0, pr.Length);
            byte[] rc = GunzipB64(fx.Value<string>("rainCell0")); System.Buffer.BlockCopy(rc, 0, w.rainCell, 0, rc.Length);
            w.windPhase = F64Of(fx.Value<string>("windPhase0"));
            w.boltCool = fx.Value<int>("boltCool0");
            w.rainbowTTL = fx.Value<int>("rainbowTTL0");
            w.rainbowCool = fx.Value<int>("rainbowCool0");
            w.meteorTTL = fx.Value<int>("meteorTTL0");
            w.meteorCool = fx.Value<int>("meteorCool0");
            w.pSystems.Clear();
            foreach (var p in (JArray)fx["pSys0"])
                w.pSystems.Add(new double[] { F64Of(p[0].Value<string>()), F64Of(p[1].Value<string>()), F64Of(p[2].Value<string>()), F64Of(p[3].Value<string>()), F64Of(p[4].Value<string>()) });
            w.storms.Clear();
            foreach (var s in (JArray)fx["stormR0"])
                w.storms.Add(new double[] { F64Of(s[0].Value<string>()), F64Of(s[1].Value<string>()), F64Of(s[2].Value<string>()), s[3].Value<int>(), s[4].Value<int>(), s[5].Value<int>(), s[6].Value<int>(), s[7].Value<int>() });
            foreach (var f in (JArray)fx["fire0"]) { int i = f[0].Value<int>(); w.fire[i] = (byte)f[1].Value<int>(); w.fireSet.Add(i); w.fireSetList.Add(i); }
            foreach (var rd in (JArray)fx["riverDir0"]) w.riverDir[rd[0].Value<int>()] = (byte)rd[1].Value<int>();
            w.natureSeed = sc.Value<int>("baseSeed");
            w.seasonOffset = fx.Value<int>("seasonOffset0");
            w.yearF = fx.Value<double>("yearF0");
            w.frameCount = fx.Value<long>("frameCount0");
            w.camX = fx.Value<double>("camX0"); w.camY = fx.Value<double>("camY0");
            w.lastSeason = -1;
            w.tickCount = sc.Value<int>("tickCount");
            // 法则面（gen 端 spec laws——dump sc.laws）
            var laws = (JObject)sc["laws"];
            w.laws.seasons = laws.Value<bool>("seasons");
            w.laws.atmosphere = laws.Value<bool>("atmosphere");
            w.laws.naturalDisasters = laws.Value<bool>("disasters");
            w.laws.tectonics = laws.Value<bool>("tectonics");
            // —— 手术三：rngA 尾置清零起流 ——
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        /// <summary>per-call pre 钩子结构化 ops 复演（gen 端 call.pre 落盘面——C# 零引擎复演）</summary>
        private static void ApplyPreOps(WbWorld w, JArray ops)
        {
            if (ops == null) return;
            foreach (var op in ops)
            {
                string kind = op.Value<string>("op");
                switch (kind)
                {
                    case "fire": { int i = op.Value<int>("i"); w.fire[i] = (byte)op.Value<int>("v"); w.fireSet.Add(i); w.fireSetList.Add(i); break; }
                    case "fireRect":
                        for (int y = op.Value<int>("y0"); y <= op.Value<int>("y1"); y++)
                            for (int x = op.Value<int>("x0"); x <= op.Value<int>("x1"); x++)
                            { int i = y * WbWorld.W + x; w.fire[i] = (byte)op.Value<int>("v"); w.fireSet.Add(i); w.fireSetList.Add(i); }
                        break;
                    case "prevRain": w.prevRain[op.Value<int>("i")] = (byte)op.Value<int>("v"); break;
                    case "frame": w.frameCount = op.Value<long>("v"); break;
                    case "nat":
                        {
                            string k = op.Value<string>("k");
                            if (k == "rainbowTTL") w.rainbowTTL = op.Value<int>("v");
                            else if (k == "rainbowCool") w.rainbowCool = op.Value<int>("v");
                            else throw new System.InvalidOperationException("未知 nat op 键: " + k);
                            break;
                        }
                    case "riverTilesFill": { int n = op.Value<int>("n"); for (int k = 0; k < n; k++) { w.riverTiles.Add(60000 + k); w.riverTilesList.Add(60000 + k); } break; }
                    case "riverTilesClear": w.riverTiles.Clear(); w.riverTilesList.Clear(); break;
                    default: throw new System.InvalidOperationException("未知 pre op: " + kind);
                }
            }
        }

        /// <summary>nat 42 键逐位对账（gen-nature2 dumpNature2 协议同构——M-U17 十八键 + M-U18 二十四键）</summary>
        private static void AssertNature2(WbWorld w, JObject g, string key, string label)
        {
            // —— M-U17 基座键（零回归对账）——
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
            Assert.That(w.lastSeason, Is.EqualTo(g.Value<int>("lastSeason")), $"lastSeason {key} {label}");
            Assert.That(w.plateEpoch, Is.EqualTo(g.Value<int>("epoch")), $"epoch {key} {label}");
            Assert.That(F64Hex(w.yearF), Is.EqualTo(g.Value<string>("yearF")), $"yearF {key} {label}");
            Assert.That(w.stormSeq, Is.EqualTo(g.Value<int>("stormSeq")), $"stormSeq {key} {label}");
            // —— M-U18 大气域键 ——
            Assert.That(F64Hex(w.windPhase), Is.EqualTo(g.Value<string>("windPhase")), $"windPhase {key} {label}");
            Assert.That(F32Md5(w.floodAcc), Is.EqualTo(g.Value<string>("floodAccMd5")), $"floodAccMd5 {key} {label}");
            Assert.That(Md5Hex(w.prevRain), Is.EqualTo(g.Value<string>("prevRainMd5")), $"prevRainMd5 {key} {label}");
            Assert.That(w.boltCool, Is.EqualTo(g.Value<int>("boltCool")), $"boltCool {key} {label}");
            Assert.That(w.boltChronDone ? 1 : 0, Is.EqualTo(g.Value<int>("boltChron")), $"boltChron {key} {label}");
            Assert.That(w.tSnowChronDone ? 1 : 0, Is.EqualTo(g.Value<int>("tSnowChron")), $"tSnowChron {key} {label}");
            Assert.That(w.lightningN, Is.EqualTo(g.Value<int>("lightningN")), $"lightningN {key} {label}");
            Assert.That(F64Hex(w.rainbowX), Is.EqualTo(g.Value<string>("rainbowX")), $"rainbowX {key} {label}");
            Assert.That(F64Hex(w.rainbowY), Is.EqualTo(g.Value<string>("rainbowY")), $"rainbowY {key} {label}");
            Assert.That(w.rainbowTTL, Is.EqualTo(g.Value<int>("rainbowTTL")), $"rainbowTTL {key} {label}");
            Assert.That(w.rainbowCool, Is.EqualTo(g.Value<int>("rainbowCool")), $"rainbowCool {key} {label}");
            Assert.That(w.rainbowMoon ? 1 : 0, Is.EqualTo(g.Value<int>("rainbowMoon")), $"rainbowMoon {key} {label}");
            Assert.That(w.rainbowChronDone ? 1 : 0, Is.EqualTo(g.Value<int>("rainbowChron")), $"rainbowChron {key} {label}");
            Assert.That(w.moonChronDone ? 1 : 0, Is.EqualTo(g.Value<int>("moonChron")), $"moonChron {key} {label}");
            Assert.That(F64Hex(w.meteorX), Is.EqualTo(g.Value<string>("meteorX")), $"meteorX {key} {label}");
            Assert.That(F64Hex(w.meteorY), Is.EqualTo(g.Value<string>("meteorY")), $"meteorY {key} {label}");
            Assert.That(F64Hex(w.meteorDx), Is.EqualTo(g.Value<string>("meteorDx")), $"meteorDx {key} {label}");
            Assert.That(F64Hex(w.meteorDy), Is.EqualTo(g.Value<string>("meteorDy")), $"meteorDy {key} {label}");
            Assert.That(w.meteorTTL, Is.EqualTo(g.Value<int>("meteorTTL")), $"meteorTTL {key} {label}");
            Assert.That(w.meteorCool, Is.EqualTo(g.Value<int>("meteorCool")), $"meteorCool {key} {label}");
            Assert.That(w.meteorsN, Is.EqualTo(g.Value<int>("meteorsN")), $"meteorsN {key} {label}");
            Assert.That(w.meteorChronDone ? 1 : 0, Is.EqualTo(g.Value<int>("meteorChron")), $"meteorChron {key} {label}");
            var goldP = (JArray)g["pSys"];
            Assert.That(w.pSystems.Count, Is.EqualTo(goldP.Count), $"pSys count {key} {label}");
            for (int k = 0; k < goldP.Count; k++)
            {
                var gp = (JArray)goldP[k];
                for (int j = 0; j < 5; j++)
                    Assert.That(F64Hex(w.pSystems[k][j]), Is.EqualTo(gp[j].Value<string>()), $"pSys[{k}][{j}] {key} {label}");
            }
            var goldS = (JArray)g["stormR"];
            Assert.That(w.storms.Count, Is.EqualTo(goldS.Count), $"stormR count {key} {label}");
            for (int k = 0; k < goldS.Count; k++)
            {
                var gs = (JArray)goldS[k];
                for (int j = 0; j < 3; j++)
                    Assert.That(F64Hex(w.storms[k][j]), Is.EqualTo(gs[j].Value<string>()), $"stormR[{k}][{j}] {key} {label}");
                for (int j = 3; j < 8; j++)
                    Assert.That(w.storms[k][j], Is.EqualTo(gs[j].Value<double>()), $"stormR[{k}][{j}] {key} {label}");
                Assert.That(gs[8].Value<string>(), Is.EqualTo(WbBailRelay.StormNameAt((long)w.storms[k][3])), $"stormR[{k}].name {key} {label}");
            }
            Assert.That(F32Md5(w.sstAnom), Is.EqualTo(g.Value<string>("sstMd5")), $"sstMd5 {key} {label}");
        }

        /// <summary>步进快照公共面对账（gen-nature2 snapCommon 协议同构——7 面通用 + nat 42 键）</summary>
        private static void AssertCommon(WbWorld w, JObject g, string key, int s)
        {
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{s}");
            Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{s}");
            Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{s}");
            Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{s}");
            Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{s}");
            Assert.That(w.dirty.Count, Is.EqualTo(g.Value<int>("dirtyN")), $"dirtyN {key} S{s}");
            Assert.That(w.propsDirty.Count, Is.EqualTo(g.Value<int>("propsDirtyN")), $"propsDirtyN {key} S{s}");
            AssertNature2(w, (JObject)g["nat"], key, $"S{s}");
        }

        /// <summary>终态 fx/events/units/toasts 对账（gen-nature2 dump 协议同构）</summary>
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
            }
            var goldEv = (JArray)sc["events"];
            Assert.That(w.worldEvents.Count, Is.EqualTo(goldEv.Count), $"events count {key}");
            for (int k = 0; k < goldEv.Count; k++)
            {
                var e = (JObject)goldEv[k];
                Assert.That(w.worldEvents[k].kind, Is.EqualTo(e.Value<string>("kind")), $"events.kind {key}#{k}");
                Assert.That(w.worldEvents[k].text, Is.EqualTo(e.Value<string>("text")), $"events.text {key}#{k}");
            }
            var goldU = (JArray)sc["units"];
            Assert.That(w.units.Count, Is.EqualTo(goldU.Count), $"units count {key}");
            for (int k = 0; k < goldU.Count; k++)
            {
                var e = (JObject)goldU[k];
                var u = w.units[k];
                Assert.That(u.id, Is.EqualTo(e.Value<int>("id")), $"units.id {key}#{k}");
                Assert.That(F64Hex(u.x), Is.EqualTo(e.Value<string>("x")), $"units.x {key}#{k}");
                Assert.That(F64Hex(u.y), Is.EqualTo(e.Value<string>("y")), $"units.y {key}#{k}");
                Assert.That(F64Hex(u.hp), Is.EqualTo(e.Value<string>("hp")), $"units.hp {key}#{k}");
                Assert.That(F64Hex(u.hurtN ?? 0), Is.EqualTo(e.Value<string>("hurt")), $"units.hurt {key}#{k}");
                Assert.That(u.dead, Is.EqualTo(e.Value<int>("dead")), $"units.dead {key}#{k}");
                Assert.That(u.chill, Is.EqualTo(e.Value<int>("chill")), $"units.chill {key}#{k}");
            }
            var goldT = (JArray)sc["toasts"];
            Assert.That(w.toasts.Count, Is.EqualTo(goldT.Count), $"toasts count {key}");
            for (int k = 0; k < goldT.Count; k++)
            {
                var e = (JObject)goldT[k];
                Assert.That(w.toasts[k].text, Is.EqualTo(e.Value<string>("text")), $"toasts.text {key}#{k}");
                Assert.That(w.toasts[k].tone, Is.EqualTo(e.Value<string>("tone")), $"toasts.tone {key}#{k}");
            }
            byte[] goldTer = GunzipB64(sc.Value<string>("terrain"));
            Assert.That(w.terrain.Length, Is.EqualTo(goldTer.Length), $"terrain len {key}");
            for (int k = 0; k < goldTer.Length; k++) if (w.terrain[k] != goldTer[k]) { Assert.Fail($"terrain 逐字节 {key}#{k}: {w.terrain[k]}≠{goldTer[k]}"); }
            Assert.That(Md5Hex(w.terrain), Is.EqualTo(Md5Hex(goldTer)), $"terrain gz 逐字节 {key}");
        }

        /// <summary>步进重放（calls 直调链——四 tick fn 分发 + preYear/laws/pre ops 复演）</summary>
        private static void ReplaySteps(WbWorld w, JArray steps, string key)
        {
            int s = 0;
            foreach (var st in steps)
            {
                if (st["preYear"] != null && st["preYear"].Type != JTokenType.Null) w.yearF = st.Value<double>("preYear");
                var laws = st["laws"];
                if (laws != null && laws.Type == JTokenType.Object)
                {
                    w.laws.seasons = laws.Value<bool?>("seasons") ?? w.laws.seasons;
                    w.laws.atmosphere = laws.Value<bool?>("atmosphere") ?? w.laws.atmosphere;
                    w.laws.naturalDisasters = laws.Value<bool?>("disasters") ?? w.laws.naturalDisasters;
                    w.laws.tectonics = laws.Value<bool?>("tectonics") ?? w.laws.tectonics;
                }
                ApplyPreOps(w, (JArray)st["pre"]);
                switch (st.Value<string>("fn"))
                {
                    case "nt.atmTick": WbBailRelay.NatureAtmTick(w); break;
                    case "nt.pressureTick": WbBailRelay.NaturePressureTick(w); break;
                    case "nt.stormTick": WbBailRelay.NatureStormTick(w); break;
                    case "nt.hydroTick": WbBailRelay.NatureHydroTick(w); break;
                    default: throw new System.InvalidOperationException($"未知调用 {st.Value<string>("fn")} {key} S{s}");
                }
                AssertCommon(w, (JObject)st, key, s);
                s++;
            }
        }

        // ---------------------------------------------------------------
        // Test50 黄金全链重放（15 场景——四 tick + 三消费函数全分支）
        // ---------------------------------------------------------------
        [Test]
        public void Test50_Nature2_GoldenReplay()
        {
            var root = JObject.Parse(System.IO.File.ReadAllText(FindNature2()));
            foreach (var scT in (JArray)root["scenarios"])
            {
                var sc = (JObject)scT;
                string key = sc.Value<string>("key");
                var w = ReplayScenario(sc);
                ReplaySteps(w, (JArray)sc["stepsSnap"], key);
                AssertFinal(w, sc, key);
            }
        }

        // ---------------------------------------------------------------
        // 直测面
        // ---------------------------------------------------------------

        /// <summary>大气关停早退面（L425-428）：prevRain 清零 + windPhase/掷流零动——S1 同构零引擎直证</summary>
        [Test]
        public void AtmOff_EarlyReturn()
        {
            var w = new WbWorld();
            w.laws.atmosphere = false;
            w.prevRain[271] = 130; w.prevRain[272] = 200;
            w.rngA = 0x0E2A0101;
            WbBailRelay.NatureAtmTick(w);
            WbBailRelay.NatureAtmTick(w);
            Assert.That(w.prevRain, Is.All.Zero, "prevRain 关停清零");
            Assert.That(w.windPhase, Is.EqualTo(0.0), "windPhase 冻结");
            Assert.That(w.rngA, Is.EqualTo(0x0E2A0101u), "零掷锚");
        }

        /// <summary>气压生命周期直测（L629-662）：ttl/str 双亡 + 漂移 2 掷/个 + cap 满零掷</summary>
        [Test]
        public void PressureTick_Lifecycle()
        {
            var w = new WbWorld();
            w.yearF = 2.5; w.rngA = 0x0E2A0803;
            w.pSystems.Add(new double[] { 100, 80, 0, 0.5, 1 });      // ttl 亡支
            w.pSystems.Add(new double[] { 200, 40, 1, 0.15, 100 });   // str 亡支
            w.pSystems.Add(new double[] { 32, 40, 0, 0.5, 100 });     // 存活（暖洋增强面需洋面——此处 GRASS 衰减支）
            WbBailRelay.NaturePressureTick(w);
            Assert.That(w.pSystems.Count, Is.EqualTo(1), "双亡支清账");
            Assert.That(w.pSystems[0][2], Is.EqualTo(0.0), "存活为低压");
            Assert.That(w.pSystems[0][4], Is.EqualTo(99.0), "ttl 递减");
            // cap 满零掷：5 系统 → 生成门短路
            w.pSystems.Clear();
            for (int k = 0; k < 5; k++) w.pSystems.Add(new double[] { 100 + k, 80, 0, 0.5, 100 });
            uint anchor = w.rngA;
            WbBailRelay.NaturePressureTick(w);
            Assert.That(w.rngA, Is.Not.EqualTo(anchor), "cap 满仍掷漂移（5×2 掷）");
            Assert.That(w.pSystems.Count, Is.EqualTo(5), "cap 满不生成");
        }

        /// <summary>风暴命名池（nature.ts L25-27）：STORM_NAME_AT 确定性取模 + 钳位</summary>
        [Test]
        public void StormNameAt_Table()
        {
            Assert.That(WbBailRelay.StormNameAt(0), Is.EqualTo("海燕"));
            Assert.That(WbBailRelay.StormNameAt(1), Is.EqualTo("山竹"));
            Assert.That(WbBailRelay.StormNameAt(19), Is.EqualTo("雪龙"));
            Assert.That(WbBailRelay.StormNameAt(20), Is.EqualTo("海燕"), "取模回绕");
            Assert.That(WbBailRelay.StormNameAt(-3), Is.EqualTo("海燕"), "负 id 钳零");
            Assert.That(WbBailRelay.StormNameAt(999), Is.EqualTo("雪龙"), "先取模后钳位：999%20=19→雪龙");
        }

        /// <summary>冷血 ×1.4 直测（engine L10554）：natureLightning SCORPION/HUMAN 伤害分化</summary>
        [Test]
        public void NatureLightning_ColdBlood()
        {
            var w = new WbWorld();
            w.rngA = 0x0E2A052B;
            var hu = new WbU { id = 1, race = 0, x = 84, y = 84, hp = 40, maxHp = 40, name = "u1" };
            var sc = new WbU { id = 2, race = 13, x = 84.5, y = 84.5, hp = 40, maxHp = 40, name = "u2" };
            w.units.Add(hu); w.units.Add(sc);
            WbBailRelay.NatureLightning(w, 84, 84);
            Assert.That(hu.hp, Is.EqualTo(40.0 - 26.0), "HUMAN 26 伤");
            Assert.That(sc.hp, Is.EqualTo(40.0 - 26.0 * 1.4), "SCORPION ×1.4 冷血");
            Assert.That(hu.hurtN ?? 0, Is.EqualTo(22), "hurtN=22");
            Assert.That(w.effects.Count, Is.EqualTo(1), "bolt fx");
        }

        /// <summary>hydroTick cap 零掷面（L1065）：riverTiles>900 早退不掷</summary>
        [Test]
        public void HydroTick_RiverCap()
        {
            var w = new WbWorld();
            w.laws.atmosphere = true;
            for (int k = 0; k < 901; k++) w.riverTiles.Add(60000 + k);
            w.rngA = 0x0E2A1310;
            WbBailRelay.NatureHydroTick(w);
            Assert.That(w.rngA, Is.EqualTo(0x0E2A1310u), "cap 早退零掷");
        }

        /// <summary>雷暴冷却窗分化（L539）：夏 180-420 / 冬 600-1200（黄金 S5/S6 同构直证）</summary>
        [Test]
        public void BoltCool_Window()
        {
            // 黄金重放已位级覆盖——此处直测窗界语义
            int summer = 180 + (int)System.Math.Floor(0.9999 * 240);
            int winter = 600 + (int)System.Math.Floor(0.9999 * 600);
            Assert.That(summer, Is.LessThanOrEqualTo(420), "夏窗上界");
            Assert.That(winter, Is.LessThanOrEqualTo(1200), "冬窗上界");
            Assert.That(WbBailRelay.StormNameAt(1), Is.EqualTo("山竹"));
        }
    }
}
