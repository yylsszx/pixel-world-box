// ============================================================
// WbGoldenTests.cs — M-U2a/M-U2b 黄金向量对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/units_move.json（移动 19 场景）
//           Assets/StreamingAssets/WbGolden/units_scan.json（扫描 21 场景）
//   由 scripts/unity-migration/gen-units-{move,scan}.mjs 生成
//   （真实现 = wbcore.wasm，双跑确定性 + 健全性断言已在生成时通过）。
// 验证链（纪律④）: 黄金向量(wasm) → 本文件 NUnit 逐位(bits 精确) → 网页 parity/冒烟。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// UCELL 公式（wbspatial L298-305 权威）: cy*engine.bw+cx，bw=256 tile 宽，坐标除 4。
// ============================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    // ---- 黄金 JSON POCO ----
    internal class GoldenFile
    {
        public GoldenMeta meta;
        public List<GoldenScenario> scenarios;
    }
    internal class GoldenMeta
    {
        public int W, H, MAX_UNITS, MAX_RACES, TILES;
        public List<int> offs;
        public string nanBits;
    }
    internal class GoldenScenario
    {
        public string name;
        public long seed;
        public int fxp;
        public int ticks;
        public GoldenTerrain terrain;
        public List<List<int>> races;       // [race, flags, flags2, tbfFlags]
        public List<GoldenUnitInput> units;
        public List<GoldenTick> output;
    }
    internal class GoldenTerrain
    {
        public int? @base;
        public List<GoldenRect> rects;
        public List<List<int>> road;
        public List<List<int>> fire;
    }
    internal class GoldenRect { public int t, x0, y0, x1, y1; }
    internal class GoldenUnitInput
    {
        public int slot, race;
        public double x, y;
        public double? tx, ty;              // 缺省 = x/y（gen putUnit: u.tx ?? u.x；scan 场景多数无 tx/ty）
        public double? speed, chill, curse, hp;
        public double? food;                 // 缺省 = NaN（u_has_food=false）
        // M-U2b scan 场景扩展（gen-units-scan.mjs putUnit 字段）
        public int? id;                      // 缺省 = slot
        public int? civ;                     // 缺省 = -1（野生）
        public double? panic;                // 缺省 = 无（UHASPANIC=0）
        public bool? dead;
        public double? cvn, fleet;
        public int? glen;
        public List<GoldenGrudge> grudges;   // 单位级 grudge（批内版 bucket_scan 读 UGIDS/UGVAL）
    }
    internal class GoldenGrudge { public int oid; public double gv; }
    internal class GoldenTick
    {
        public int rc;
        public long rng, tick;
        public int actN, dlistN, batchR, bailK;
        public List<GoldenUnitOut> units;
        public string actHex;
    }
    internal class GoldenUnitOut
    {
        public int slot, race, flip, dead;
        public string x, y, tx, ty, age, hp, chill, curse, hurt; // bits hex
    }

    internal class WbGoldenFixture
    {
        public WbArena Arena;

        public static GoldenFile Load() => LoadFile<GoldenFile>("units_move.json");

        public static T LoadFile<T>(string fileName)
        {
            string path = FindGolden(fileName);
            Assert.IsTrue(File.Exists(path), $"golden json not found: {path}");
            return JsonConvert.DeserializeObject<T>(File.ReadAllText(path));
        }

        private static string FindGolden(string fileName)
        {
            string[] candidates =
            {
                "Assets/StreamingAssets/WbGolden/" + fileName,
                Path.Combine(TestContext.CurrentContext.TestDirectory, "Assets/StreamingAssets/WbGolden/" + fileName),
                Path.Combine(Directory.GetParent(ApplicationDataPath()).FullName, "Assets/StreamingAssets/WbGolden/" + fileName),
            };
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return candidates[0];
        }

        // UnityEngine.Application.dataPath（EditMode TestRunner cwd = 工程根）
        private static string ApplicationDataPath() => "Assets";

        // —— 输入布置（与 gen 脚本 initWorld/fillTerrain/setupRaces/putUnit 同构；
        //    offs 自算布局，黄金对账 Test 1 会先锁布局）——
        public void InitWorld(long seed, int fxp)
        {
            Arena = new WbArena();
            WbSim.Arena = Arena;   // 接线：WbUnits/WbCtx 全走 WbSim.Arena（static），fixture 布置必须同实例
            Assert.IsTrue(Arena.Init(WbConstants.W, WbConstants.H, WbConstants.MAX_UNITS), "wb_init failed");
            Arena.SetU32(WbConstants.OFF_RNGS, 0, unchecked((uint)seed));
            Arena.SetU8(WbConstants.OFF_LAWS, 0, 0);
            Arena.SetU8(WbConstants.OFF_FXP, 0, (byte)fxp);
            Arena.SetU32(WbConstants.OFF_ITMN, 0, 0);
            Arena.SetU8(WbConstants.OFF_COLEN, 0, 0);
            Arena.SetU8(WbConstants.OFF_NCTL, 0, 0);
            Arena.SetI32(WbConstants.OFF_MISC, 0, WbConstants.MAX_UNITS);
            // EPS 表（engineParams.ts 真值，EP_KEYS 序；panicDecay=0.008 等）
            double[] eps = { 1, 700, 1, 1, 3, 1, 0.92, 0.06, 0.08, 0.008, 0.72, 0.006, 26, 1, 1 };
            for (int i = 0; i < eps.Length; i++) Arena.SetF64(WbConstants.OFF_EPS, i, eps[i]);
            // TBT 引导表（bit0 walkable bit1 water bit2 flammable bit3 buildable）
            for (byte t = 0; t < 16; t++)
            {
                int m = 0;
                if (t <= 11 && t != 0 && t != 1 && t != 6 && t != 8) m |= 1;
                if (t == 0 || t == 1) m |= 2;
                if (t == 3 || t == 4) m |= 4;
                if (t == 3 || t == 2 || t == 5 || t == 7 || t == 9 || t == 4) m |= 8;
                Arena.SetU8(WbConstants.OFF_TBT, t, (byte)m);
            }
        }

        public void FillTerrain(GoldenTerrain spec)
        {
            int baseT = spec.@base ?? 3;
            var terr = Arena.Arena;
            int terrOff = Arena.Offs[WbConstants.OFF_TERR];
            for (int i = 0; i < WbConstants.TILES; i++) terr[terrOff + i] = (byte)baseT;
            if (spec.rects != null)
                foreach (var r in spec.rects)
                    for (int y = r.y0; y <= r.y1; y++)
                        for (int x = r.x0; x <= r.x1; x++)
                            terr[terrOff + y * WbConstants.W + x] = (byte)r.t;
            if (spec.fire != null)
                foreach (var p in spec.fire) terr[Arena.Offs[WbConstants.OFF_FIREG] + p[1] * WbConstants.W + p[0]] = 1;
            if (spec.road != null)
                foreach (var p in spec.road) terr[Arena.Offs[WbConstants.OFF_ROAD] + p[1] * WbConstants.W + p[0]] = 1;
        }

        public void SetupRaces(List<List<int>> races)
        {
            foreach (var r in races)
            {
                Arena.SetU8(WbConstants.OFF_RACE_FLAGS, r[0], (byte)r[1]);
                Arena.SetU8(WbConstants.OFF_TBF, r[0] * 2, (byte)r[3]);
                Arena.SetU8(WbConstants.OFF_TBF, r[0] * 2 + 1, (byte)r[2]);
            }
        }

        public void PutUnit(GoldenUnitInput u)
        {
            var A = Arena;
            A.SetU32(WbConstants.OFF_UID, u.slot, unchecked((uint)(u.id ?? u.slot)));
            A.SetU32(WbConstants.OFF_URACE, u.slot, (uint)u.race);
            // UCELL = cy*engine.bw+cx（wbspatial L298-305；bw=W=256 tile 宽，坐标除 4）
            A.SetU32(WbConstants.OFF_UCELL, u.slot, (uint)((int)Math.Floor(u.y / 4.0) * WbConstants.W + (int)Math.Floor(u.x / 4.0)));
            A.SetF64(WbConstants.OFF_UX, u.slot, u.x);
            A.SetF64(WbConstants.OFF_UY, u.slot, u.y);
            A.SetF64(WbConstants.OFF_UTX, u.slot, u.tx ?? u.x);
            A.SetF64(WbConstants.OFF_UTY, u.slot, u.ty ?? u.y);
            A.SetF64(WbConstants.OFF_USPEED, u.slot, u.speed ?? 0.08);
            A.SetF64(WbConstants.OFF_UHP, u.slot, u.hp ?? 100);
            A.SetF64(WbConstants.OFF_UMAXHP, u.slot, 100);
            A.SetF64(WbConstants.OFF_UMAXAGE, u.slot, 9999);
            A.SetF64(WbConstants.OFF_UAGE, u.slot, 0);
            A.SetF64(WbConstants.OFF_UDMG, u.slot, 5);
            A.SetF64(WbConstants.OFF_UCHILL, u.slot, u.chill ?? 0);
            A.SetF64(WbConstants.OFF_UCURSE, u.slot, u.curse ?? 0);
            A.SetF64(WbConstants.OFF_UFD, u.slot, u.food ?? double.NaN);
            A.SetF64(WbConstants.OFF_UCVN, u.slot, u.cvn ?? 0);
            A.SetF64(WbConstants.OFF_UFLEET, u.slot, u.fleet ?? 0);
            A.SetF64(WbConstants.OFF_UBLESS, u.slot, 0);
            A.SetF64(WbConstants.OFF_UFERT, u.slot, 0);
            A.SetF64(WbConstants.OFF_UDETOUR, u.slot, 0);
            A.SetF64(WbConstants.OFF_UHURT, u.slot, 0);
            A.SetF64(WbConstants.OFF_UATK, u.slot, 0);
            A.SetF64(WbConstants.OFF_UCD, u.slot, 0);
            A.SetF64(WbConstants.OFF_UBREATH, u.slot, 0);
            A.SetI32(WbConstants.OFF_UCIV, u.slot, u.civ ?? -1);
            A.SetI32(WbConstants.OFF_UJOB, u.slot, -1);
            A.SetI32(WbConstants.OFF_UARMY, u.slot, -1);
            A.SetI32(WbConstants.OFF_UGLN, u.slot, u.glen ?? -1);
            A.SetI32(WbConstants.OFF_UFAM, u.slot, -1);
            A.SetI32(WbConstants.OFF_UFGN, u.slot, -1);
            A.SetI32(WbConstants.OFF_USTK, u.slot, 0);
            A.SetU8(WbConstants.OFF_UDEAD, u.slot, (byte)(u.dead == true ? 1 : 0));
            A.SetU8(WbConstants.OFF_UHASPANIC, u.slot, (byte)(u.panic.HasValue ? 1 : 0));
            A.SetF64(WbConstants.OFF_UPANIC, u.slot, u.panic ?? 0);
            A.SetU8(WbConstants.OFF_UINF, u.slot, 0);
            A.SetU8(WbConstants.OFF_UBOAT, u.slot, 0);
            A.SetU8(WbConstants.OFF_UFLIP, u.slot, 0);
            for (int g = 0; g < 4; g++) A.SetF64(WbConstants.OFF_UGENE, u.slot * 4 + g, 1);
            // 单位级 grudge 清零 + 可选填充（gen putUnit 同款）
            for (int t = 0; t < 8; t++) { A.SetI32(WbConstants.OFF_UGIDS, u.slot * 8 + t, -1); A.SetF64(WbConstants.OFF_UGVAL, u.slot * 8 + t, 0); }
            if (u.grudges != null)
                for (int t = 0; t < u.grudges.Count && t < 8; t++)
                {
                    A.SetI32(WbConstants.OFF_UGIDS, u.slot * 8 + t, u.grudges[t].oid);
                    A.SetF64(WbConstants.OFF_UGVAL, u.slot * 8 + t, u.grudges[t].gv);
                }
        }

        /// 宿主协议模拟：翻转 parity + 重排 cell + repack（gen 脚本 tick 间语义）
        public void BetweenTicks(List<GoldenUnitInput> units)
        {
            Arena.SetU8(WbConstants.OFF_PAR, 0, (byte)(Arena.U8At(WbConstants.OFF_PAR, 0) ^ 1));
            foreach (var u in units)
            {
                if (Arena.U8At(WbConstants.OFF_UDEAD, u.slot) != 0) continue;
                double x = Arena.F64At(WbConstants.OFF_UX, u.slot);
                double y = Arena.F64At(WbConstants.OFF_UY, u.slot);
                // 桶索引（wbspatial L298-305）：cy*256+cx，坐标除 4
                Arena.SetU32(WbConstants.OFF_UCELL, u.slot, (uint)((int)Math.Floor(y / 4.0) * WbConstants.W + (int)Math.Floor(x / 4.0)));
                Arena.SetU8(WbConstants.OFF_UPAR, u.slot, Arena.U8At(WbConstants.OFF_PAR, 0));
            }
            Arena.PackEnd((uint)units.Count);
        }

        public static string Hex(byte[] a, int off, int n)
        {
            var sb = new StringBuilder(n * 2);
            for (int i = 0; i < n; i++) sb.Append(a[off + i].ToString("x2"));
            return sb.ToString();
        }

        // ---------------- M-U2b scan 专用（gen-units-scan.mjs 同构） ----------------

        /// EPS 真值覆盖（scan JSON meta.eps = engineParams.ep 真值——纪律②，零手抄）
        public void SetEps(List<double> eps)
        {
            for (int i = 0; i < eps.Count; i++) Arena.SetF64(WbConstants.OFF_EPS, i, eps[i]);
        }

        /// scan 场景 races 为二元组 [race, flags]（无 TBF 语义；TBF 清零与 gen setupRaces 同构）
        public void SetupRacesFlat(List<List<int>> races)
        {
            foreach (var r in races)
            {
                Arena.SetU8(WbConstants.OFF_RACE_FLAGS, r[0], (byte)r[1]);
                Arena.SetU8(WbConstants.OFF_TBF, r[0] * 2, 0);
                Arena.SetU8(WbConstants.OFF_TBF, r[0] * 2 + 1, 0);
            }
        }

        /// atwar 对表（gen runSingle: setU8(ATWAR, a*MAX_CIVS+b, 1)）
        public void SetAtWar(List<List<int>> atwar)
        {
            if (atwar == null) return;
            foreach (var p in atwar) Arena.SetU8(WbConstants.OFF_ATWAR, p[0] * WbConstants.MAX_CIVS + p[1], 1);
        }

        /// 全局 grudge 平面（单单位版 wb_scan 读 GIDS/GVALS；gen putGlobalGrudges 同构）
        public void PutGlobalGrudges(List<int> gids, List<double> gvals)
        {
            for (int t = 0; t < WbConstants.GRUDGE_CAP; t++)
            {
                Arena.SetI32(WbConstants.OFF_GIDS, t, gids != null && t < gids.Count ? gids[t] : -1);
                Arena.SetF64(WbConstants.OFF_GVALS, t, gvals != null && t < gvals.Count ? gvals[t] : 0);
            }
        }

        /// scan 场景地形（uniform base，无 rects/fire/road）
        public void FillTerrainFlat(int? baseT)
        {
            int b = baseT ?? 3;
            int terrOff = Arena.Offs[WbConstants.OFF_TERR];
            for (int i = 0; i < WbConstants.TILES; i++) Arena.Arena[terrOff + i] = (byte)b;
        }
    }

    // ---- M-U2b scan JSON POCO（gen-units-scan.mjs 输出）----
    internal class GoldenScanFile
    {
        public GoldenScanMeta meta;
        public List<GoldenScanScenario> scenarios;
    }
    internal class GoldenScanMeta
    {
        public int W, H, MAX_UNITS, MAX_RACES, TILES;
        public List<double> eps;
        public List<string> epKeys;
        public int panicCap, grudgeCap;
        public List<int> offs;
    }
    internal class GoldenScanScenario
    {
        public string name, mode;
        public long seed;
        public int fxp, ticks;
        public int? @base;
        public List<List<int>> races;
        public List<List<int>> atwar;
        public List<int> gids;
        public List<double> gvals;
        public List<GoldenUnitInput> units;
        public GoldenScanSpec scan;
        public List<GoldenScanSpec> extraScans;
        public List<int> lutProbe;
        public JToken output;               // single → GoldenScanOut | 数组；batch → List<GoldenScanTick>
    }
    internal class GoldenScanSpec { public int slot, cx, cy; public bool contagious; public int? gLen; }
    internal class GoldenScanOut
    {
        public int rc;
        public GoldenScanResult result;
        public List<GoldenLutProbe> lutProbe;
    }
    internal class GoldenScanResult
    {
        public int enemySlot, overflow;
        public string bestD, enemyD;        // bits hex
        public uint allies, foes, panicN, pad;
        public List<uint> panicSlots;
        public List<string> panicVals;      // bits hex ×32（全量，含未写零位）
    }
    internal class GoldenLutProbe { public int key; public byte v; }
    internal class GoldenScanTick
    {
        public int rc, actN, dlistN, batchR, bailK;
        public long rng, tick;
        public List<GoldenScanUnitOut> units;
    }
    internal class GoldenScanUnitOut
    {
        public int slot, race, dead, hasPanic, flip;
        public string x, y, tx, ty, panic;  // bits hex
    }

    [TestFixture]
    public class WbGoldenTests
    {
        private GoldenFile _golden;
        private GoldenScanFile _scanGolden;
        private WbGoldenFixture _fx;

        [OneTimeSetUp]
        public void Load()
        {
            _golden = WbGoldenFixture.Load();
            _scanGolden = WbGoldenFixture.LoadFile<GoldenScanFile>("units_scan.json");
        }

        [SetUp]
        public void Setup() => _fx = new WbGoldenFixture();

        // -------- Test 1：C# 布局自算 == wasm 权威 offs（纪律⑤ + 布局同构锁死） --------
        [Test]
        public void Layout_Offs_MatchWasmAuthoritative()
        {
            _fx.InitWorld(0, 0);
            Assert.AreEqual(_golden.meta.offs.Count, WbConstants.N_REGIONS, "offs 表长度");
            for (int id = 0; id < WbConstants.N_REGIONS; id++)
            {
                Assert.AreEqual(_golden.meta.offs[id], _fx.Arena.Offs[id],
                    $"offs[{id}] 不一致（C# 布局 vs wasm 权威）——lib.rs place! 序错位");
            }
        }

        // -------- Test 2：19 场景 × 每 tick 全字段 bits 逐位对账 --------
        [TestCase(0)]  [TestCase(1)]  [TestCase(2)]  [TestCase(3)]  [TestCase(4)]
        [TestCase(5)]  [TestCase(6)]  [TestCase(7)]  [TestCase(8)]  [TestCase(9)]
        [TestCase(10)] [TestCase(11)] [TestCase(12)] [TestCase(13)] [TestCase(14)]
        [TestCase(15)] [TestCase(16)] [TestCase(17)] [TestCase(18)]
        public void Scenarios_BitExactParity(int index)
        {
            var sc = _golden.scenarios[index];
            _fx.InitWorld(sc.seed, sc.fxp);
            _fx.FillTerrain(sc.terrain);
            _fx.SetupRaces(sc.races);
            foreach (var u in sc.units) _fx.PutUnit(u);
            _fx.Arena.PackEnd((uint)sc.units.Count);

            for (int t = 0; t < sc.ticks; t++)
            {
                int rc = WbUnits.UnitsBatch(0, 0);
                var expect = sc.output[t];
                Assert.AreEqual(expect.rc, rc, $"{sc.name} tick{t} rc");
                Assert.AreEqual(unchecked((uint)expect.batchR), _fx.Arena.U32At(WbConstants.OFF_BATCHR, 0), $"{sc.name} tick{t} BATCHR");
                Assert.AreEqual(unchecked((uint)expect.bailK), _fx.Arena.U32At(WbConstants.OFF_BAILK, 0), $"{sc.name} tick{t} BAILK");
                Assert.AreEqual(unchecked((ulong)expect.rng), _fx.Arena.U64At(WbConstants.OFF_RNGS, 0), $"{sc.name} tick{t} RNG 终态");
                Assert.AreEqual(unchecked((ulong)expect.tick), _fx.Arena.U64At(WbConstants.OFF_TICK, 0), $"{sc.name} tick{t} TICK");
                Assert.AreEqual(expect.actN, _fx.Arena.I32At(WbConstants.OFF_ACTN, 0), $"{sc.name} tick{t} ACTN");
                Assert.AreEqual(expect.dlistN, _fx.Arena.I32At(WbConstants.OFF_DLISTN, 0), $"{sc.name} tick{t} DLISTN");
                // 动作缓冲逐位
                int actOff = _fx.Arena.Offs[WbConstants.OFF_ACT];
                int actN = Math.Min(expect.actN, 256);
                Assert.AreEqual(expect.actHex ?? "", WbGoldenFixture.Hex(_fx.Arena.Arena, actOff, actN), $"{sc.name} tick{t} ACT 缓冲");
                // 单位字段逐位（bits 精确，非 epsilon）
                foreach (var eu in expect.units)
                {
                    Assert.AreEqual(Bits(eu.x), _fx.Arena.U64At(WbConstants.OFF_UX, eu.slot), $"{sc.name} tick{t} u{eu.slot} x");
                    Assert.AreEqual(Bits(eu.y), _fx.Arena.U64At(WbConstants.OFF_UY, eu.slot), $"{sc.name} tick{t} u{eu.slot} y");
                    Assert.AreEqual(Bits(eu.tx), _fx.Arena.U64At(WbConstants.OFF_UTX, eu.slot), $"{sc.name} tick{t} u{eu.slot} tx");
                    Assert.AreEqual(Bits(eu.ty), _fx.Arena.U64At(WbConstants.OFF_UTY, eu.slot), $"{sc.name} tick{t} u{eu.slot} ty");
                    Assert.AreEqual(Bits(eu.age), _fx.Arena.U64At(WbConstants.OFF_UAGE, eu.slot), $"{sc.name} tick{t} u{eu.slot} age");
                    Assert.AreEqual(Bits(eu.hp), _fx.Arena.U64At(WbConstants.OFF_UHP, eu.slot), $"{sc.name} tick{t} u{eu.slot} hp");
                    Assert.AreEqual(Bits(eu.chill), _fx.Arena.U64At(WbConstants.OFF_UCHILL, eu.slot), $"{sc.name} tick{t} u{eu.slot} chill");
                    Assert.AreEqual(Bits(eu.curse), _fx.Arena.U64At(WbConstants.OFF_UCURSE, eu.slot), $"{sc.name} tick{t} u{eu.slot} curse");
                    Assert.AreEqual(Bits(eu.hurt), _fx.Arena.U64At(WbConstants.OFF_UHURT, eu.slot), $"{sc.name} tick{t} u{eu.slot} hurt");
                    Assert.AreEqual(eu.flip, _fx.Arena.U8At(WbConstants.OFF_UFLIP, eu.slot), $"{sc.name} tick{t} u{eu.slot} flip");
                    Assert.AreEqual(eu.dead, _fx.Arena.U8At(WbConstants.OFF_UDEAD, eu.slot), $"{sc.name} tick{t} u{eu.slot} dead");
                }
                // 宿主协议模拟（与 gen 脚本一致）
                _fx.BetweenTicks(sc.units);
            }
        }

        // -------- Test 3：C# 侧双跑确定性（生成器侧已对 wasm 双跑，此处锁 C# 内部稳定性） --------
        [Test]
        public void CSharpSide_DeterministicDoubleRun()
        {
            var sc = _golden.scenarios[12]; // S13-mixed-batch-order（最复杂：10 单位 5 种族）
            Assert.AreEqual(RunScenarioHex(sc), RunScenarioHex(sc), "C# 双跑输出不一致");
            // 且与黄金一致
            Assert.AreEqual(RunScenarioHex(sc), GoldenScenarioHex(sc), "C# 输出与黄金不一致");
        }

        // -------- Test 4：M-U2b 单单位层 18 场景（wb_scan 直调 → ScanSingle，RESULT 424B 逐位） --------
        private GoldenScanScenario ScanSc(int index) => _scanGolden.scenarios[index];

        private void ScanFixtureSetup(GoldenScanScenario sc)
        {
            _fx.InitWorld(sc.seed, sc.fxp);
            _fx.SetEps(_scanGolden.meta.eps);                       // EPS 真值从黄金 meta 读（纪律②零手抄）
            _fx.FillTerrainFlat(sc.@base);
            _fx.SetupRacesFlat(sc.races);
            foreach (var u in sc.units) _fx.PutUnit(u);
            _fx.SetAtWar(sc.atwar);
            _fx.PutGlobalGrudges(sc.gids, sc.gvals);
            _fx.Arena.PackEnd((uint)sc.units.Count);
        }

        private void AssertScanResult(string tag, GoldenScanOut expect)
        {
            Assert.AreEqual(expect.rc, _lastScanRc, $"{tag} rc");
            var A = _fx.Arena;
            var r = expect.result;
            Assert.AreEqual(r.enemySlot, A.I32At(WbConstants.OFF_RESULT, 0), $"{tag} enemySlot");
            Assert.AreEqual(r.overflow, A.I32At(WbConstants.OFF_RESULT, 1), $"{tag} overflow");
            Assert.AreEqual(Bits(r.bestD), A.U64At(WbConstants.OFF_RESULT, 1), $"{tag} bestD bits");
            Assert.AreEqual(Bits(r.enemyD), A.U64At(WbConstants.OFF_RESULT, 2), $"{tag} enemyD bits");
            Assert.AreEqual(r.allies, A.U32At(WbConstants.OFF_RESULT, 6), $"{tag} allies");
            Assert.AreEqual(r.foes, A.U32At(WbConstants.OFF_RESULT, 7), $"{tag} foes");
            Assert.AreEqual(r.panicN, A.U32At(WbConstants.OFF_RESULT, 8), $"{tag} panicN");
            Assert.AreEqual(r.pad, A.U32At(WbConstants.OFF_RESULT, 9), $"{tag} _pad");
            for (int i = 0; i < r.panicSlots.Count; i++)
                Assert.AreEqual(r.panicSlots[i], A.U32At(WbConstants.OFF_RESULT, 10 + i), $"{tag} panicSlots[{i}]");
            for (int i = 0; i < r.panicVals.Count; i++)
                Assert.AreEqual(Bits(r.panicVals[i]), A.U64At(WbConstants.OFF_RESULT, 21 + i), $"{tag} panicVals[{i}] bits");
            // lutProbe（LUT 区基址 = align8(offs[RACE_FLAGS] + MAX_RACES)，蓝本 wb_init L505-509）
            if (expect.lutProbe != null)
            {
                int lut = (A.Offs[WbConstants.OFF_RACE_FLAGS] + WbConstants.MAX_RACES + 7) & ~7;
                foreach (var p in expect.lutProbe)
                    Assert.AreEqual(p.v, A.Arena[lut + p.key], $"{tag} LUT[{p.key}]");
            }
        }

        private int _lastScanRc;

        [TestCase(0)]  [TestCase(1)]  [TestCase(2)]  [TestCase(3)]  [TestCase(4)]
        [TestCase(5)]  [TestCase(6)]  [TestCase(7)]  [TestCase(8)]  [TestCase(9)]
        [TestCase(10)] [TestCase(11)] [TestCase(12)] [TestCase(13)] [TestCase(14)]
        [TestCase(15)] [TestCase(16)] [TestCase(17)]
        public void Scan_SingleScenarios_BitExactParity(int index)
        {
            var sc = ScanSc(index);
            Assert.AreEqual("single", sc.mode, $"{sc.name} mode");
            ScanFixtureSetup(sc);
            // scan + extraScans 逐次执行（SC16 LUT 缓存链：三次 scan 输出数组）
            var specs = new List<GoldenScanSpec> { sc.scan };
            if (sc.extraScans != null) specs.AddRange(sc.extraScans);
            var outputs = sc.output.Type == JTokenType.Array
                ? sc.output.ToObject<List<GoldenScanOut>>()
                : new List<GoldenScanOut> { sc.output.ToObject<GoldenScanOut>() };
            Assert.AreEqual(specs.Count, outputs.Count, $"{sc.name} scan 次数");
            for (int i = 0; i < specs.Count; i++)
            {
                var sp = specs[i];
                _lastScanRc = WbUnits.ScanSingle((uint)sp.slot, sp.cx, sp.cy, sp.contagious, sp.gLen ?? -1);
                AssertScanResult($"{sc.name} scan{i}", outputs[i]);
            }
        }

        // -------- Test 5：M-U2b 批处理层 3 场景（wb_units_batch 集成：rng 流 + 恐慌镜像写入） --------
        [TestCase(18)] [TestCase(19)] [TestCase(20)]
        public void Scan_BatchScenarios_BitExactParity(int index)
        {
            var sc = ScanSc(index);
            Assert.AreEqual("batch", sc.mode, $"{sc.name} mode");
            ScanFixtureSetup(sc);
            var ticks = sc.output.ToObject<List<GoldenScanTick>>();
            Assert.AreEqual(sc.ticks, ticks.Count, $"{sc.name} tick 数");
            for (int t = 0; t < sc.ticks; t++)
            {
                int rc = WbUnits.UnitsBatch(0, 0);
                var expect = ticks[t];
                Assert.AreEqual(expect.rc, rc, $"{sc.name} tick{t} rc");
                Assert.AreEqual(unchecked((ulong)expect.rng), _fx.Arena.U64At(WbConstants.OFF_RNGS, 0), $"{sc.name} tick{t} RNG 终态（rng 流逐位）");
                Assert.AreEqual(expect.actN, _fx.Arena.I32At(WbConstants.OFF_ACTN, 0), $"{sc.name} tick{t} ACTN");
                Assert.AreEqual(expect.dlistN, _fx.Arena.I32At(WbConstants.OFF_DLISTN, 0), $"{sc.name} tick{t} DLISTN");
                Assert.AreEqual(unchecked((uint)expect.batchR), _fx.Arena.U32At(WbConstants.OFF_BATCHR, 0), $"{sc.name} tick{t} BATCHR");
                Assert.AreEqual(unchecked((uint)expect.bailK), _fx.Arena.U32At(WbConstants.OFF_BAILK, 0), $"{sc.name} tick{t} BAILK");
                foreach (var eu in expect.units)
                {
                    Assert.AreEqual(Bits(eu.x), _fx.Arena.U64At(WbConstants.OFF_UX, eu.slot), $"{sc.name} tick{t} u{eu.slot} x");
                    Assert.AreEqual(Bits(eu.y), _fx.Arena.U64At(WbConstants.OFF_UY, eu.slot), $"{sc.name} tick{t} u{eu.slot} y");
                    Assert.AreEqual(Bits(eu.tx), _fx.Arena.U64At(WbConstants.OFF_UTX, eu.slot), $"{sc.name} tick{t} u{eu.slot} tx");
                    Assert.AreEqual(Bits(eu.ty), _fx.Arena.U64At(WbConstants.OFF_UTY, eu.slot), $"{sc.name} tick{t} u{eu.slot} ty");
                    Assert.AreEqual(Bits(eu.panic), _fx.Arena.U64At(WbConstants.OFF_UPANIC, eu.slot), $"{sc.name} tick{t} u{eu.slot} panic bits");
                    Assert.AreEqual(eu.hasPanic, _fx.Arena.U8At(WbConstants.OFF_UHASPANIC, eu.slot), $"{sc.name} tick{t} u{eu.slot} hasPanic");
                    Assert.AreEqual(eu.dead, _fx.Arena.U8At(WbConstants.OFF_UDEAD, eu.slot), $"{sc.name} tick{t} u{eu.slot} dead");
                    Assert.AreEqual(eu.flip, _fx.Arena.U8At(WbConstants.OFF_UFLIP, eu.slot), $"{sc.name} tick{t} u{eu.slot} flip");
                }
                _fx.BetweenTicks(sc.units);
            }
        }

        private string RunScenarioHex(GoldenScenario sc)
        {
            _fx.InitWorld(sc.seed, sc.fxp);
            _fx.FillTerrain(sc.terrain);
            _fx.SetupRaces(sc.races);
            foreach (var u in sc.units) _fx.PutUnit(u);
            _fx.Arena.PackEnd((uint)sc.units.Count);
            var sb = new StringBuilder();
            for (int t = 0; t < sc.ticks; t++)
            {
                WbUnits.UnitsBatch(0, 0);
                sb.Append(_fx.Arena.U64At(WbConstants.OFF_RNGS, 0).ToString("x16"));
                foreach (var u in sc.units)
                {
                    sb.Append(_fx.Arena.U64At(WbConstants.OFF_UX, u.slot).ToString("x16"));
                    sb.Append(_fx.Arena.U64At(WbConstants.OFF_UY, u.slot).ToString("x16"));
                }
                _fx.BetweenTicks(sc.units);
            }
            return sb.ToString();
        }

        private string GoldenScenarioHex(GoldenScenario sc)
        {
            // 逐 tick 拼黄金 hex（rng + 每单位 x/y bits）
            var sb = new StringBuilder();
            foreach (var t in sc.output)
            {
                sb.Append(unchecked((ulong)t.rng).ToString("x16"));
                foreach (var u in t.units)
                {
                    sb.Append(Bits(u.x).ToString("x16"));
                    sb.Append(Bits(u.y).ToString("x16"));
                }
            }
            return sb.ToString();
        }

        internal static ulong Bits(string hex)
        {
            string h = hex.StartsWith("0x") ? hex.Substring(2) : hex;
            return ulong.Parse(h, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        }
    }

    // ============================================================
    // M-U2b：扫描黄金向量对账（units_scan.json，21 场景）
    // 单层（wb_scan 直测）：RESULT 424B 全字段逐位 + LUT 探针
    // 批层（wb_units_batch 集成）：恐慌蔓延 rng 流与镜像写入逐位
    // ============================================================
    internal class ScanGoldenFile
    {
        public string name;
        public List<ScanScenario> scenarios;
    }
    internal class ScanScenario
    {
        public string name;
        public string mode;
        public ScanInput input;
        public Newtonsoft.Json.Linq.JToken output;   // single=对象或对象数组（extraScans）；batch=tick 数组
    }
    internal class ScanInput
    {
        public long seed;
        public int fxp;
        public int ticks;
        public int? @base;
        public List<List<int>> races;                // [race, flags]（scan 版二 元组）
        public List<GoldenUnitInput> units;
        public ScanCall scan;
        public List<ScanCall> extraScans;
        public List<int> gids;
        public List<double> gvals;
        public List<List<int>> atwar;
    }
    internal class ScanCall
    {
        public int slot, cx, cy;
        public int contagious;
        public int? gLen;
    }
    internal class ScanOutSingle
    {
        public int rc;
        public ScanResultBody result;
        public List<ScanLutProbe> lutProbe;
    }
    internal class ScanResultBody
    {
        public int enemySlot, overflow;
        public string bestD, enemyD;                 // bits hex
        public long allies, foes, panicN, pad;
        public List<long> panicSlots;
        public List<string> panicVals;               // bits hex
    }
    internal class ScanLutProbe { public long key; public int v; }
    internal class ScanTickOut
    {
        public int rc;
        public long rng, tick;
        public int actN, dlistN, batchR, bailK;
        public List<ScanUnitOut> units;
    }
    internal class ScanUnitOut
    {
        public int slot, race, flip, dead, hasPanic;
        public string x, y, tx, ty, panic;           // bits hex
    }

    [TestFixture]
    public class WbScanGoldenTests
    {
        private ScanGoldenFile _golden;
        private WbGoldenFixture _fx;

        [OneTimeSetUp]
        public void Load()
        {
            string path = FindGolden();
            Assert.IsTrue(File.Exists(path), $"scan golden json not found: {path}");
            _golden = JsonConvert.DeserializeObject<ScanGoldenFile>(File.ReadAllText(path));
        }

        private static string FindGolden()
        {
            string[] candidates =
            {
                "Assets/StreamingAssets/WbGolden/units_scan.json",
                Path.Combine(TestContext.CurrentContext.TestDirectory, "Assets/StreamingAssets/WbGolden/units_scan.json"),
            };
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return candidates[0];
        }

        [SetUp]
        public void Setup() => _fx = new WbGoldenFixture();

        private void SetupWorld(ScanInput inp)
        {
            _fx.InitWorld(inp.seed, inp.fxp);
            var terr = new GoldenTerrain { @base = inp.@base };
            _fx.FillTerrain(terr);
            // scan 版 races 为二元组 [race, flags]——复用四元组路径（flags2/tbf 缺省 0）
            _fx.SetupRaces(inp.races.ConvertAll(r => new List<int> { r[0], r.Count > 1 ? r[1] : 0, 0, 0 }));
            foreach (var u in inp.units) _fx.PutUnit(u);
            if (inp.atwar != null)
                foreach (var ab in inp.atwar) _fx.Arena.SetU8(WbConstants.OFF_ATWAR, ab[0] * 64 + ab[1], 1);
            // 平面 grudge 表（wb_scan 契约：GIDS/GVALS 预填）
            if (inp.gids != null)
                for (int t = 0; t < inp.gids.Count; t++) _fx.Arena.SetI32(WbConstants.OFF_GIDS, t, inp.gids[t]);
            if (inp.gvals != null)
                for (int t = 0; t < inp.gvals.Count; t++) _fx.Arena.SetF64(WbConstants.OFF_GVALS, t, inp.gvals[t]);
            _fx.Arena.PackEnd((uint)inp.units.Count);
        }

        // -------- 单层：RESULT 424B 全字段逐位 + LUT 探针 --------
        [TestCase(0)]  [TestCase(1)]  [TestCase(2)]  [TestCase(3)]  [TestCase(4)]
        [TestCase(5)]  [TestCase(6)]  [TestCase(7)]  [TestCase(8)]  [TestCase(9)]
        [TestCase(10)] [TestCase(11)] [TestCase(12)] [TestCase(13)] [TestCase(14)]
        [TestCase(15)] [TestCase(16)] [TestCase(17)]
        public void Single_ScanResult_BitExactParity(int index)
        {
            var sc = _golden.scenarios[index];
            if (sc.mode != "single") Assert.Ignore("非单层场景");
            SetupWorld(sc.input);
            var calls = new List<ScanCall> { sc.input.scan };
            if (sc.input.extraScans != null) calls.AddRange(sc.input.extraScans);

            var outputs = new List<ScanOutSingle>();
            var tok = sc.output;
            if (tok.Type == Newtonsoft.Json.Linq.JTokenType.Array)
                foreach (var t in tok) outputs.Add(t.ToObject<ScanOutSingle>());
            else outputs.Add(tok.ToObject<ScanOutSingle>());
            Assert.AreEqual(calls.Count, outputs.Count, $"{sc.name} 调用数与输出数不一致");

            for (int i = 0; i < calls.Count; i++)
            {
                var c = calls[i];
                int rc = WbUnits.ScanSingle((uint)c.slot, c.cx, c.cy, c.contagious != 0, c.gLen ?? -1);
                var expect = outputs[i];
                Assert.AreEqual(expect.rc, rc, $"{sc.name} call{i} rc");
                var r = expect.result;
                Assert.AreEqual(r.enemySlot, _fx.Arena.I32At(WbConstants.OFF_RESULT, 0), $"{sc.name} call{i} enemySlot");
                Assert.AreEqual(r.overflow, _fx.Arena.I32At(WbConstants.OFF_RESULT, 1), $"{sc.name} call{i} overflow");
                Assert.AreEqual(WbGoldenTests.Bits(r.bestD), _fx.Arena.U64At(WbConstants.OFF_RESULT, 1), $"{sc.name} call{i} bestD bits");
                Assert.AreEqual(WbGoldenTests.Bits(r.enemyD), _fx.Arena.U64At(WbConstants.OFF_RESULT, 2), $"{sc.name} call{i} enemyD bits");
                Assert.AreEqual((ulong)r.allies, _fx.Arena.U32At(WbConstants.OFF_RESULT, 6), $"{sc.name} call{i} allies");
                Assert.AreEqual((ulong)r.foes, _fx.Arena.U32At(WbConstants.OFF_RESULT, 7), $"{sc.name} call{i} foes");
                Assert.AreEqual((ulong)r.panicN, _fx.Arena.U32At(WbConstants.OFF_RESULT, 8), $"{sc.name} call{i} panicN");
                for (int p = 0; p < 32; p++)
                {
                    Assert.AreEqual((ulong)r.panicSlots[p], _fx.Arena.U32At(WbConstants.OFF_RESULT, 10 + p), $"{sc.name} call{i} panicSlots[{p}]");
                    Assert.AreEqual(WbGoldenTests.Bits(r.panicVals[p]), _fx.Arena.U64At(WbConstants.OFF_RESULT, 21 + p), $"{sc.name} call{i} panicVals[{p}] bits");
                }
                if (expect.lutProbe != null)
                    foreach (var lp in expect.lutProbe)
                        Assert.AreEqual(lp.v, _fx.Arena.Arena[_fx.Arena.LutOff + (int)lp.key], $"{sc.name} call{i} LUT[{lp.key}]");
            }
        }

        // -------- 批层：UnitsBatch 集成（恐慌蔓延 rng 流与镜像写入逐位） --------
        [TestCase(18)] [TestCase(19)] [TestCase(20)]
        public void Batch_ScanIntegration_BitExactParity(int index)
        {
            var sc = _golden.scenarios[index];
            if (sc.mode != "batch") Assert.Ignore("非批层场景");
            SetupWorld(sc.input);
            var ticks = sc.output.ToObject<List<ScanTickOut>>();
            for (int t = 0; t < ticks.Count; t++)
            {
                int rc = WbUnits.UnitsBatch(0, 0);
                var expect = ticks[t];
                Assert.AreEqual(expect.rc, rc, $"{sc.name} tick{t} rc");
                Assert.AreEqual((ulong)expect.rng, _fx.Arena.U64At(WbConstants.OFF_RNGS, 0), $"{sc.name} tick{t} RNG");
                Assert.AreEqual(expect.actN, _fx.Arena.I32At(WbConstants.OFF_ACTN, 0), $"{sc.name} tick{t} ACTN");
                Assert.AreEqual(expect.dlistN, _fx.Arena.I32At(WbConstants.OFF_DLISTN, 0), $"{sc.name} tick{t} DLISTN");
                Assert.AreEqual((uint)expect.batchR, _fx.Arena.U32At(WbConstants.OFF_BATCHR, 0), $"{sc.name} tick{t} BATCHR");
                foreach (var eu in expect.units)
                {
                    Assert.AreEqual(WbGoldenTests.Bits(eu.x), _fx.Arena.U64At(WbConstants.OFF_UX, eu.slot), $"{sc.name} tick{t} u{eu.slot} x");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.y), _fx.Arena.U64At(WbConstants.OFF_UY, eu.slot), $"{sc.name} tick{t} u{eu.slot} y");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.tx), _fx.Arena.U64At(WbConstants.OFF_UTX, eu.slot), $"{sc.name} tick{t} u{eu.slot} tx");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.ty), _fx.Arena.U64At(WbConstants.OFF_UTY, eu.slot), $"{sc.name} tick{t} u{eu.slot} ty");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.panic), _fx.Arena.U64At(WbConstants.OFF_UPANIC, eu.slot), $"{sc.name} tick{t} u{eu.slot} panic");
                    Assert.AreEqual(eu.hasPanic, _fx.Arena.U8At(WbConstants.OFF_UHASPANIC, eu.slot), $"{sc.name} tick{t} u{eu.slot} hasPanic");
                    Assert.AreEqual(eu.dead, _fx.Arena.U8At(WbConstants.OFF_UDEAD, eu.slot), $"{sc.name} tick{t} u{eu.slot} dead");
                    Assert.AreEqual(eu.flip, _fx.Arena.U8At(WbConstants.OFF_UFLIP, eu.slot), $"{sc.name} tick{t} u{eu.slot} flip");
                }
                _fx.BetweenTicks(sc.input.units);
            }
        }
    }
}
