// ============================================================
// WbWorldsimTests.cs — M-U26「深时涌现域」黄金对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/worldsim.json（14 场景）
//   由 scripts/unity-migration/gen-worldsim.mjs 生成（真引擎 GameEngine +
//   NatureSystem initPlates + worldsim initFromTerrain 重导出 + 手术式夹具
//   （rect 面 elev/tempF/sst/psi/heatQ/cont/glacier/driftAcc/soil/moist/
//   rainCell 直写 + 标量 seaLevel/globalTemp/baselineTemp/coastNoteCd 注入）
//   + rngA 尾置清零 + calls 直调链；det 双跑字节级一致；md5 b0b3bcdb）。
//   蓝本 worldsim.ts：initFromTerrain L114-150 / onTerrainChanged L153-165 /
//   hydroTick L175-294 / tempTick L299-302 / computeTemps L304-360 /
//   oceanTick L365-481 / glacierTick L486-552 / coastTick L557-600 /
//   biomeTick L605-670。
// 镜像: worldsim-transcript.mjs 零引擎导入 14/14 ALL PASS（bun 口径——
//   红证双旋钮 WS_RED=hydro/glacier）。
// 验证链（纪律④）: 黄金向量(真引擎) → 零引擎镜像 → 本文件 NUnit C# 全链
//   重放（WbWorldsim 六门 + InitFromTerrain + OnTerrainChanged + WbBailRelay
//   SetTerrain 全级联 + NatureWindAt/CellOf/ItczLat/Season M-U9b 译件 + Fbm +
//   WbRng 独立流 + FdHypot/JsRound 位精确件）逐位对账。
// 对账面: 每步 rngA/terrain md5/fxCount/eventsCount/shake/dirtyN/propsDirtyN +
//   ws 33 键（f32 全场 elev/tNoise/flowAcc/tempF/psi/curU/curV/sst/heatQ/cont/
//   coastal + 整场 tempOverlay/waterCnt/upwell/glacier/driftAcc/soil + 标量
//   globalTemp/baselineTemp/seaLevel/eroded/deposited/biomeDrift/glacierTiles/
//   upwellingCells/strongFrac/coastNoteCd + nature 锚 season/ash/moist/
//   rainCell/yearF）+ 终态 terrain gz 逐字节 + events 文案全列。
// 直测面: atmosphere 关停零掷 / coastNoteCd 冷却门 / glacierTiles 阈值计数 /
//   soilMulAt 除子。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbWorldsimTests
    {
        private static string FindWorldsim()
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", "worldsim.json"),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", "worldsim.json"),
                "worldsim.json",
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: worldsim.json");
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

        private static string U16Md5(ushort[] arr)
        {
            byte[] b = new byte[arr.Length * 2];
            System.Buffer.BlockCopy(arr, 0, b, 0, b.Length);
            return Md5Hex(b);
        }

        /// <summary>rect 面展开（gen 端 expandRectsTile/Cell 同构——[y0,x0,y1,x1,f64hex]）</summary>
        private static void ExpandRectsTile(WbWorld w, JArray rects, float[] arr)
        {
            if (rects == null) return;
            foreach (var r in rects)
            {
                double v = F64Of(r[4].Value<string>());
                for (int y = r[0].Value<int>(); y <= r[2].Value<int>(); y++)
                    for (int x = r[1].Value<int>(); x <= r[3].Value<int>(); x++)
                        arr[y * WbWorld.W + x] = (float)v;
            }
        }

        private static void ExpandRectsCell(JArray rects, float[] arr)
        {
            if (rects == null) return;
            foreach (var r in rects)
            {
                double v = F64Of(r[4].Value<string>());
                for (int cy = r[0].Value<int>(); cy <= r[2].Value<int>(); cy++)
                    for (int cx = r[1].Value<int>(); cx <= r[3].Value<int>(); cx++)
                        arr[cy * WbConstants.AW + cx] = (float)v;
            }
        }

        private static void ExpandRectsTileB(WbWorld w, JArray rects, byte[] arr)
        {
            if (rects == null) return;
            foreach (var r in rects)
            {
                double v = F64Of(r[4].Value<string>());
                for (int y = r[0].Value<int>(); y <= r[2].Value<int>(); y++)
                    for (int x = r[1].Value<int>(); x <= r[3].Value<int>(); x++)
                        arr[y * WbWorld.W + x] = (byte)v;
            }
        }

        private static void ExpandRectsCellB(JArray rects, byte[] arr)
        {
            if (rects == null) return;
            foreach (var r in rects)
            {
                double v = F64Of(r[4].Value<string>());
                for (int cy = r[0].Value<int>(); cy <= r[2].Value<int>(); cy++)
                    for (int cx = r[1].Value<int>(); cx <= r[3].Value<int>(); cx++)
                        arr[cy * WbConstants.AW + cx] = (byte)v;
            }
        }

        /// <summary>C# 全链重放：gen-worldsim 手术面（瞬态清零 + InitFromTerrain 重导出 + rect 补丁 + 标量注入 + rngA 尾置）</summary>
        private static WbWorld ReplayScenario(JObject sc)
        {
            var fx = (JObject)sc["fixture"];
            var w = new WbWorld();
            // —— 手术一：瞬态层清零（gen buildScenario 同构）——
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
            // —— 手术二：fixture 注入（地形/建筑/水深/河向）——
            w.terrain = GunzipB64(fx.Value<string>("terrain0"));
            byte[] bu = GunzipB64(fx.Value<string>("building0"));
            for (int k = 0; k < bu.Length; k++) if (bu[k] != 0) w.building[k] = bu[k];
            byte[] wt = GunzipB64(fx.Value<string>("waterTier0"));
            System.Buffer.BlockCopy(wt, 0, w.waterTier, 0, wt.Length);
            foreach (var rd in (JArray)fx["riverDir0"]) w.riverDir[rd[0].Value<int>()] = (byte)rd[1].Value<int>();
            // laws / 年相 / ecoState
            w.laws.seasons = sc.Value<bool>("seasons");
            w.laws.atmosphere = sc.Value<bool>("atmosphere");
            w.laws.naturalDisasters = sc.Value<bool>("disasters");
            w.yearF = fx.Value<double>("yearF0");
            w.ecoState = fx.Value<string>("ecoState0");
            // nature 域种子 + initPlates（moist fill 0.35 / rainCell 0 基线——gen 同构）
            w.natureSeed = sc.Value<int>("baseSeed");
            w.windPhase = 0;
            WbBailRelay.NatureInitPlates(w);
            // worldsim 基座重导出（elev/tNoise/soilF/glacier/driftAcc/flowAcc + 标量重置）
            w.wsSeed = sc.Value<int>("baseSeed");
            WbWorldsim.InitFromTerrain(w);
            // rect 补丁展开（tile/cell 双域——C# 重放零推导注入）
            ExpandRectsTile(w, (JArray)fx["rectElev"], w.elev);
            ExpandRectsTile(w, (JArray)fx["rectTempF"], w.tempF);
            ExpandRectsCell((JArray)fx["rectSst"], w.sstAnom);
            ExpandRectsTile(w, (JArray)fx["rectPsi"], w.psi);
            ExpandRectsTile(w, (JArray)fx["rectHeatQ"], w.heatQ);
            ExpandRectsTile(w, (JArray)fx["rectCont"], w.cont);
            ExpandRectsTileB(w, (JArray)fx["rectGlacier"], w.glacier);
            ExpandRectsTileB(w, (JArray)fx["rectDriftAcc"], w.driftAcc);
            ExpandRectsTileB(w, (JArray)fx["rectSoil"], w.soilF);
            ExpandRectsCell((JArray)fx["rectMoist"], w.moist);
            ExpandRectsCellB((JArray)fx["rectRainCell"], w.rainCell);
            // glacierTiles 重算（直写面与计数一致性——gen 同构）
            if (((JArray)fx["rectGlacier"])?.Count > 0)
            {
                int gt = 0;
                for (int i = 0; i < w.glacier.Length; i++) if (w.glacier[i] > 80) gt++;
                w.glacierTiles = gt;
            }
            // 标量注入（initFromTerrain 重置后——gen 手术三直写同构）
            w.seaLevel = F64Of(fx.Value<string>("seaLevel0"));
            w.globalTemp = F64Of(fx.Value<string>("globalTemp0"));
            w.baselineTemp = F64Of(fx.Value<string>("baselineTemp0"));
            w.coastNoteCd = fx.Value<int>("coastNoteCd0");
            w.glacierTiles = fx.Value<int>("glacierTiles0");
            w.ash = F64Of(fx.Value<string>("ash0"));
            // —— 手术三：rngA 尾置清零起流（ws 流已由 InitFromTerrain 起流）——
            w.rngA = unchecked((uint)sc.Value<long>("seed"));
            return w;
        }

        /// <summary>ws 33 键逐位对账（gen dumpWorldsim 协议同构）</summary>
        private static void AssertWorldsim(WbWorld w, JObject g, string key, string label)
        {
            // —— f32 全场 LE md5 ——
            Assert.That(F32Md5(w.elev), Is.EqualTo(g.Value<string>("elevMd5")), $"elevMd5 {key} {label}");
            Assert.That(F32Md5(w.tNoise), Is.EqualTo(g.Value<string>("tNoiseMd5")), $"tNoiseMd5 {key} {label}");
            Assert.That(F32Md5(w.flowAcc), Is.EqualTo(g.Value<string>("flowAccMd5")), $"flowAccMd5 {key} {label}");
            Assert.That(F32Md5(w.tempF), Is.EqualTo(g.Value<string>("tempFMd5")), $"tempFMd5 {key} {label}");
            Assert.That(F32Md5(w.psi), Is.EqualTo(g.Value<string>("psiMd5")), $"psiMd5 {key} {label}");
            Assert.That(F32Md5(w.curU), Is.EqualTo(g.Value<string>("curUMd5")), $"curUMd5 {key} {label}");
            Assert.That(F32Md5(w.curV), Is.EqualTo(g.Value<string>("curVMd5")), $"curVMd5 {key} {label}");
            Assert.That(F32Md5(w.sstAnom), Is.EqualTo(g.Value<string>("sstMd5")), $"sstMd5 {key} {label}");
            Assert.That(F32Md5(w.heatQ), Is.EqualTo(g.Value<string>("heatQMd5")), $"heatQMd5 {key} {label}");
            Assert.That(F32Md5(w.cont), Is.EqualTo(g.Value<string>("contMd5")), $"contMd5 {key} {label}");
            Assert.That(F32Md5(w.coastal), Is.EqualTo(g.Value<string>("coastalMd5")), $"coastalMd5 {key} {label}");
            // —— 整场面 ——
            Assert.That(Md5Hex(w.tempOverlay), Is.EqualTo(g.Value<string>("tempOverlayMd5")), $"tempOverlayMd5 {key} {label}");
            Assert.That(U16Md5(w.waterCnt), Is.EqualTo(g.Value<string>("waterCntMd5")), $"waterCntMd5 {key} {label}");
            Assert.That(Md5Hex(w.upwell), Is.EqualTo(g.Value<string>("upwellMd5")), $"upwellMd5 {key} {label}");
            Assert.That(Md5Hex(w.glacier), Is.EqualTo(g.Value<string>("glacierMd5")), $"glacierMd5 {key} {label}");
            Assert.That(Md5Hex(w.driftAcc), Is.EqualTo(g.Value<string>("driftAccMd5")), $"driftAccMd5 {key} {label}");
            Assert.That(Md5Hex(w.soilF), Is.EqualTo(g.Value<string>("soilMd5")), $"soilMd5 {key} {label}");
            // —— 标量面 ——
            Assert.That(F64Hex(w.globalTemp), Is.EqualTo(g.Value<string>("globalTemp")), $"globalTemp {key} {label}");
            Assert.That(F64Hex(w.baselineTemp), Is.EqualTo(g.Value<string>("baselineTemp")), $"baselineTemp {key} {label}");
            Assert.That(F64Hex(w.seaLevel), Is.EqualTo(g.Value<string>("seaLevel")), $"seaLevel {key} {label}");
            Assert.That(F64Hex(w.eroded), Is.EqualTo(g.Value<string>("eroded")), $"eroded {key} {label}");
            Assert.That(F64Hex(w.deposited), Is.EqualTo(g.Value<string>("deposited")), $"deposited {key} {label}");
            Assert.That(w.biomeDrift, Is.EqualTo(g.Value<int>("biomeDrift")), $"biomeDrift {key} {label}");
            Assert.That(w.glacierTiles, Is.EqualTo(g.Value<int>("glacierTiles")), $"glacierTiles {key} {label}");
            Assert.That(w.upwellingCells, Is.EqualTo(g.Value<int>("upwellingCells")), $"upwellingCells {key} {label}");
            Assert.That(F64Hex(w.strongFrac), Is.EqualTo(g.Value<string>("strongFrac")), $"strongFrac {key} {label}");
            Assert.That(w.coastNoteCd, Is.EqualTo(g.Value<int>("coastNoteCd")), $"coastNoteCd {key} {label}");
            // —— nature 域锚 ——
            Assert.That(w.NatureSeason(), Is.EqualTo(g.Value<int>("season")), $"season {key} {label}");
            Assert.That(F64Hex(w.ash), Is.EqualTo(g.Value<string>("ash")), $"ash {key} {label}");
            Assert.That(F32Md5(w.moist), Is.EqualTo(g.Value<string>("moistMd5")), $"moistMd5 {key} {label}");
            Assert.That(Md5Hex(w.rainCell), Is.EqualTo(g.Value<string>("rainCellMd5")), $"rainCellMd5 {key} {label}");
            Assert.That(F64Hex(w.yearF), Is.EqualTo(g.Value<string>("yearF")), $"yearF {key} {label}");
        }

        /// <summary>步进公共面对账（snapCommon 7 面 + ws 33 键）</summary>
        private static void AssertCommon(WbWorld w, JObject g, string key, int s)
        {
            Assert.That(w.rngA.ToString("x8"), Is.EqualTo(g.Value<string>("rngA")), $"rngA {key} S{s}");
            Assert.That(Md5Hex(w.terrain), Is.EqualTo(g.Value<string>("terrainMd5")), $"terrainMd5 {key} S{s}");
            Assert.That(w.effects.Count, Is.EqualTo(g.Value<int>("fxCount")), $"fxCount {key} S{s}");
            Assert.That(w.worldEvents.Count, Is.EqualTo(g.Value<int>("eventsCount")), $"eventsCount {key} S{s}");
            Assert.That(w.shake, Is.EqualTo(g.Value<double>("shake")), $"shake {key} S{s}");
            Assert.That(w.dirty.Count, Is.EqualTo(g.Value<int>("dirtyN")), $"dirtyN {key} S{s}");
            Assert.That(w.propsDirty.Count, Is.EqualTo(g.Value<int>("propsDirtyN")), $"propsDirtyN {key} S{s}");
            AssertWorldsim(w, (JObject)g["ws"], key, $"S{s}");
        }

        /// <summary>ws 域 calls 直调分派（fn 剥 ws. 前缀——六门 + onTerrainChanged + initFromTerrain）</summary>
        private static void DispatchCall(WbWorld w, string fn, JArray args)
        {
            switch (fn)
            {
                case "ws.hydroTick": WbWorldsim.HydroTick(w); break;
                case "ws.tempTick": WbWorldsim.TempTick(w); break;
                case "ws.oceanTick": WbWorldsim.OceanTick(w); break;
                case "ws.glacierTick": WbWorldsim.GlacierTick(w); break;
                case "ws.coastTick": WbWorldsim.CoastTick(w); break;
                case "ws.biomeTick": WbWorldsim.BiomeTick(w); break;
                case "ws.onTerrainChanged": WbWorldsim.OnTerrainChanged(w, args[0].Value<int>(), (byte)args[1].Value<int>()); break;
                case "ws.initFromTerrain": WbWorldsim.InitFromTerrain(w); break;
                default: throw new System.InvalidOperationException("未知 ws call: " + fn);
            }
        }

        /// <summary>Test47 M-U26 深时涌现域 14 场景黄金回放（全链重放逐位对账）</summary>
        [Test]
        public void Test47_Worldsim_GoldenReplay()
        {
            var root = JObject.Parse(System.IO.File.ReadAllText(FindWorldsim()));
            foreach (var sc in (JArray)root["scenarios"])
            {
                string key = sc.Value<string>("key");
                var w = ReplayScenario((JObject)sc);
                var steps = (JArray)sc["stepsSnap"];
                for (int s = 0; s < steps.Count; s++)
                {
                    var st = (JObject)steps[s];
                    if (st["preYear"] != null && st["preYear"].Type != JTokenType.Null) w.yearF = st.Value<double>("preYear");
                    if (st["preAsh"] != null && st["preAsh"].Type != JTokenType.Null) w.ash = st.Value<double>("preAsh");
                    DispatchCall(w, st.Value<string>("fn"), (JArray)st["args"]);
                    AssertCommon(w, st, key, s);
                }
                // 终态 terrain gz 逐字节
                byte[] endTerrain = GunzipB64(sc.Value<string>("terrain"));
                Assert.That(w.terrain, Is.EqualTo(endTerrain), $"终态 terrain {key}");
                // 终态 events 文案全列
                var goldEvents = (JArray)sc["events"];
                Assert.That(w.worldEvents.Count, Is.EqualTo(goldEvents.Count), $"终态 events {key}");
                for (int e = 0; e < goldEvents.Count; e++)
                    Assert.That(w.worldEvents[e].text, Is.EqualTo(goldEvents[e].Value<string>("text")), $"ev#{e} {key}");
            }
        }

        /// <summary>直测一：atmosphere=false → oceanTick 顶层早退（psi/curU 零写入 + strongFrac 恒 0）</summary>
        [Test]
        public void Test48_OceanTick_AtmosphereGate()
        {
            var w = new WbWorld();
            w.laws.atmosphere = false;
            w.waterCnt[100] = 64;   // 预置大洋粗格（门后零消费）
            WbWorldsim.OceanTick(w);
            Assert.That(w.psi[100], Is.EqualTo(0f), "psi 零写入");
            Assert.That(w.curU[100], Is.EqualTo(0f), "curU 零写入");
            Assert.That(w.strongFrac, Is.EqualTo(0.0), "strongFrac 恒 0");
        }

        /// <summary>直测二：coastTick 播报冷却门（changed>0 但 coastNoteCd>0 → 静默 + 冷却递减 −600）</summary>
        [Test]
        public void Test49_CoastNote_CoolDownGate()
        {
            var w = new WbWorld();
            w.seaLevel = 0.8; w.baselineTemp = w.globalTemp;   // 零漂移
            w.coastNoteCd = 3000;
            // 30 试采样全部落在 owner>=0 格（预置全域 owner——零 changed 面）
            for (int i = 0; i < w.owner.Length; i++) w.owner[i] = 0;
            WbWorldsim.CoastTick(w);
            Assert.That(w.coastNoteCd, Is.EqualTo(2400), "冷却递减 3000−600");
            Assert.That(w.worldEvents.Count, Is.EqualTo(0), "零 changed 静默");
        }

        /// <summary>直测三：glacierTick 积累跨 80 阈值（dirty.add + glacierTiles++ 计数面）</summary>
        [Test]
        public void Test50_GlacierTileThreshold()
        {
            var w = new WbWorld();
            int i = 500;
            w.terrain[i] = WbConstants.T_GRASS;
            w.glacier[i] = 79;
            w.tempF[i] = -0.4f;   // < accTh −0.15 → 积累支
            w.elev[i] = 0.0f;
            w.wsRngState = 0x12345678u;
            WbWorldsim.GlacierTick(w);
            Assert.That(w.glacier[i], Is.GreaterThan(80), "79+2~4 跨 80 阈值");
            Assert.That(w.glacierTiles, Is.EqualTo(1), "阈值跨越计数");
            Assert.That(w.dirty.Contains(i), Is.True, "视觉冰盖重绘脏标");
        }

        /// <summary>直测四：soilMulAt 除子（M-U7k 已译件回归 + hydroTick 过牧 −2 支）</summary>
        [Test]
        public void Test51_SoilMul_OvergrazeDecay()
        {
            var w = new WbWorld();
            w.soilF[0] = 255; w.soilF[1] = 0;
            Assert.That(w.WorldsimSoilMulAt(0), Is.EqualTo(1.4).Within(1e-12), "满肥 0.6+255/255×0.8");
            Assert.That(w.WorldsimSoilMulAt(1), Is.EqualTo(0.6).Within(1e-12), "零肥 0.6");
            // 过牧支：ecoState='overgraze' + GRASS + (i&7)==0 + soilF>1 → −2
            w.ecoState = "overgraze";
            w.terrain[8] = WbConstants.T_GRASS;
            w.soilF[8] = 10;
            WbWorldsim.HydroTick(w);
            Assert.That(w.soilF[8], Is.EqualTo(9), "GRASS+1 与过牧−2 相抵净 −1");
        }
    }
}
