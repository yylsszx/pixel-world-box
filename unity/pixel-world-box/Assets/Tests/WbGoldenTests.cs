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
using System.Linq;
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

        /// 通用黄金 JSON 加载（Test10/11 共用；路径候选与 WbCivTickPath 同构）
        /// ⚠ M-U3g 缺陷修复：Test10 一直引用本助手但未定义（沙箱无 dotnet 未暴露），此处补落。
        private static T LoadJson<T>(string fileName)
        {
            string[] candidates =
            {
                "Assets/StreamingAssets/WbGolden/" + fileName,
                Path.Combine(TestContext.CurrentContext.TestDirectory, "Assets/StreamingAssets/WbGolden/" + fileName),
                Path.Combine(Directory.GetParent("Assets").FullName, "Assets/StreamingAssets/WbGolden/" + fileName),
            };
            string path = candidates[0];
            foreach (var c in candidates) if (File.Exists(c)) { path = c; break; }
            Assert.IsTrue(File.Exists(path), $"golden json not found: {path}");
            return JsonConvert.DeserializeObject<T>(File.ReadAllText(path));
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

    // ================= M-U2c 战斗树黄金（Test6） =================
    public class CombatGrudgeIn { public int oid; public double gv; }
    public class CombatUnitIn
    {
        public int slot; public int? id; public int race; public int? civ;
        public double x, y; public double? hp, maxhp, dmg, kills, food, panic, fleet, cvn, cd, breath;
        public bool? inf, boat; public int? job, trait;
        public List<int> gear; public List<CombatGrudgeIn> grudges;
    }
    public class CombatRectIn { public int t, x0, y0, x1, y1; }
    public class CombatTerrainIn { public int? @base; public List<CombatRectIn> rects; public List<List<int>> fire; public List<List<int>> road; }
    public class CombatCivIn { public int? mkt, plague, archer, range; }
    public class CombatInput
    {
        public long seed; public int ticks; public int? fxp, laws, nctl; public double? dayph;
        public List<List<double>> neuw; public CombatTerrainIn terrain;
        public List<CombatCivIn> civs; public List<List<int>> atwar;
        public List<CombatUnitIn> units; public List<List<int>> terrProbe;
    }
    public class CombatUnitOut
    {
        public int slot, race, dead, hasPanic, inf, boat, flip, glen;
        public string x, y, tx, ty, hp, panic, fleet, cd, atk, hurt, food, kills, breath, age;
        public List<int> gids; public List<string> gvals;
    }
    public class CombatTickOut
    {
        public int rc; public long rng, tick, actN, dlistN; public uint batchR, bailK;
        public string cnt4, cvpop0; public int wildZombie, wildSheep, fireN;
        public List<long> neuCall; public List<CombatUnitOut> units; public string actHex; public List<byte> terr;
    }
    public class CombatScenario { public string name; public long seed; public CombatInput input; public Newtonsoft.Json.Linq.JToken output; }
    public class CombatBoot
    {
        public Dictionary<string, List<double>> tbr; public Dictionary<string, int> raceFlags;
        public Dictionary<string, int> tbf0, tbf1; public List<double> tbj;
        public Dictionary<string, List<double>> tbi; public int tbin;
        public List<uint> gunbm, beambm;
    }
    public class CombatGoldenMeta { public List<double> eps; public CombatBoot boot; }
    public class CombatGoldenFile { public CombatGoldenMeta meta; public List<CombatScenario> scenarios; }

    [TestFixture]
    public class WbCombatGoldenTests
    {
        private CombatGoldenFile _golden;
        private WbGoldenFixture _fx;

        [OneTimeSetUp]
        public void Load()
        {
            string path = FindGolden();
            Assert.IsTrue(File.Exists(path), $"combat golden json not found: {path}");
            _golden = JsonConvert.DeserializeObject<CombatGoldenFile>(File.ReadAllText(path));
        }

        private static string FindGolden()
        {
            string[] candidates =
            {
                "Assets/StreamingAssets/WbGolden/units_combat.json",
                Path.Combine(TestContext.CurrentContext.TestDirectory, "Assets/StreamingAssets/WbGolden/units_combat.json"),
            };
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return candidates[0];
        }

        [SetUp]
        public void Setup() => _fx = new WbGoldenFixture();

        /// 引导表灌入（gen meta.boot 转储 = wbspatial packTables 宿主协议的位精确镜像；
        /// C# 侧无法 import TS 真表——纪律②的沙箱外延续：真值随黄金 JSON 分发，零手抄）
        private void ApplyBoot(CombatBoot b)
        {
            var A = _fx.Arena;
            foreach (var kv in b.tbr)
                for (int c = 0; c < 12; c++)
                    A.SetF64(WbConstants.OFF_TBR, int.Parse(kv.Key) * 12 + c, kv.Value[c]);
            foreach (var kv in b.raceFlags) A.SetU8(WbConstants.OFF_RACE_FLAGS, int.Parse(kv.Key), (byte)kv.Value);
            foreach (var kv in b.tbf0) A.SetU8(WbConstants.OFF_TBF, int.Parse(kv.Key) * 2, (byte)kv.Value);
            foreach (var kv in b.tbf1) A.SetU8(WbConstants.OFF_TBF, int.Parse(kv.Key) * 2 + 1, (byte)kv.Value);
            for (int c = 0; c < b.tbj.Count; c++) A.SetF64(WbConstants.OFF_TBJ, c, b.tbj[c]);
            foreach (var kv in b.tbi)
                for (int c = 0; c < 12; c++)
                    A.SetF64(WbConstants.OFF_TBI, int.Parse(kv.Key) * 12 + c, kv.Value[c]);
            A.SetI32(WbConstants.OFF_TBIN, 0, b.tbin);
            for (int w = 0; w < 4; w++)
            {
                A.SetU32(WbConstants.OFF_GUNBM, w, b.gunbm[w]);
                A.SetU32(WbConstants.OFF_BEAMBM, w, b.beambm[w]);
            }
        }

        private void PutUnitCombat(CombatUnitIn u)
        {
            var A = _fx.Arena;
            A.SetU32(WbConstants.OFF_UID, u.slot, unchecked((uint)(u.id ?? u.slot)));
            A.SetU32(WbConstants.OFF_URACE, u.slot, (uint)u.race);
            A.SetU32(WbConstants.OFF_UCELL, u.slot, (uint)((int)Math.Floor(u.y / 4.0) * WbConstants.W + (int)Math.Floor(u.x / 4.0)));
            A.SetF64(WbConstants.OFF_UX, u.slot, u.x);
            A.SetF64(WbConstants.OFF_UY, u.slot, u.y);
            A.SetF64(WbConstants.OFF_UTX, u.slot, u.x);
            A.SetF64(WbConstants.OFF_UTY, u.slot, u.y);
            A.SetF64(WbConstants.OFF_USPEED, u.slot, 0.08);
            A.SetF64(WbConstants.OFF_UHP, u.slot, u.hp ?? 100);
            A.SetF64(WbConstants.OFF_UMAXHP, u.slot, u.maxhp ?? 100);
            A.SetF64(WbConstants.OFF_UMAXAGE, u.slot, 9999);
            A.SetF64(WbConstants.OFF_UAGE, u.slot, 0);
            A.SetF64(WbConstants.OFF_UDMG, u.slot, u.dmg ?? 5);
            A.SetF64(WbConstants.OFF_UKILLS, u.slot, u.kills ?? 0);
            A.SetF64(WbConstants.OFF_UCHILL, u.slot, 0);
            A.SetF64(WbConstants.OFF_UCURSE, u.slot, 0);
            A.SetF64(WbConstants.OFF_UBLESS, u.slot, 0);
            A.SetF64(WbConstants.OFF_UFERT, u.slot, 0);
            A.SetF64(WbConstants.OFF_UDETOUR, u.slot, 0);
            A.SetF64(WbConstants.OFF_UHURT, u.slot, 0);
            A.SetF64(WbConstants.OFF_UATK, u.slot, 0);
            A.SetF64(WbConstants.OFF_UCD, u.slot, u.cd ?? 0);
            A.SetF64(WbConstants.OFF_UBREATH, u.slot, u.breath ?? 0);
            A.SetF64(WbConstants.OFF_UFD, u.slot, u.food ?? double.NaN);
            A.SetF64(WbConstants.OFF_UCVN, u.slot, u.cvn ?? 0);
            A.SetF64(WbConstants.OFF_UFLEET, u.slot, u.fleet ?? 0);
            A.SetI32(WbConstants.OFF_UCIV, u.slot, u.civ ?? -1);
            A.SetI32(WbConstants.OFF_UJOB, u.slot, u.job ?? -1);
            A.SetI32(WbConstants.OFF_UARMY, u.slot, -1);
            A.SetI32(WbConstants.OFF_UFAM, u.slot, -1);
            A.SetI32(WbConstants.OFF_UFGN, u.slot, -1);
            A.SetI32(WbConstants.OFF_USTK, u.slot, 0);
            A.SetI32(WbConstants.OFF_UTRAIT, u.slot, u.trait ?? -1);
            A.SetU8(WbConstants.OFF_UDEAD, u.slot, 0);
            A.SetU8(WbConstants.OFF_UHASPANIC, u.slot, (byte)(u.panic.HasValue ? 1 : 0));
            A.SetF64(WbConstants.OFF_UPANIC, u.slot, u.panic ?? 0);
            A.SetU8(WbConstants.OFF_UINF, u.slot, (byte)(u.inf == true ? 1 : 0));
            A.SetU8(WbConstants.OFF_UBOAT, u.slot, (byte)(u.boat == true ? 1 : 0));
            A.SetU8(WbConstants.OFF_UFLIP, u.slot, 0);
            A.SetF64(WbConstants.OFF_ULX, u.slot, double.NaN); // 出生未移动语义（gen putUnitC 同款）
            A.SetF64(WbConstants.OFF_ULY, u.slot, double.NaN);
            for (int g = 0; g < 4; g++) A.SetF64(WbConstants.OFF_UGENE, u.slot * 4 + g, 1);
            for (int g = 0; g < 7; g++) A.SetI32(WbConstants.OFF_UGEAR, u.slot * 7 + g, u.gear != null && g < u.gear.Count ? u.gear[g] : -1);
            for (int g = 0; g < 8; g++) { A.SetI32(WbConstants.OFF_UGIDS, u.slot * 8 + g, -1); A.SetF64(WbConstants.OFF_UGVAL, u.slot * 8 + g, 0); }
            if (u.grudges != null)
            {
                for (int g = 0; g < u.grudges.Count && g < 8; g++)
                {
                    A.SetI32(WbConstants.OFF_UGIDS, u.slot * 8 + g, u.grudges[g].oid);
                    A.SetF64(WbConstants.OFF_UGVAL, u.slot * 8 + g, u.grudges[g].gv);
                }
                A.SetI32(WbConstants.OFF_UGLN, u.slot, Math.Min(u.grudges.Count, 8));
            }
            else
            {
                A.SetI32(WbConstants.OFF_UGLN, u.slot, -1);
            }
        }

        private void SetupWorld(CombatInput inp)
        {
            _fx.InitWorld(inp.seed, inp.fxp ?? 0);
            _fx.SetEps(_golden.meta.eps);
            var A = _fx.Arena;
            A.SetU8(WbConstants.OFF_LAWS, 0, (byte)(inp.laws ?? 0));
            if (inp.dayph.HasValue) A.SetF64(WbConstants.OFF_DAYPH, 0, inp.dayph.Value);
            if (inp.nctl.HasValue) A.SetU8(WbConstants.OFF_NCTL, 0, (byte)inp.nctl.Value);
            if (inp.neuw != null)
                foreach (var iv in inp.neuw) A.SetF64(WbConstants.OFF_NEUW, (int)iv[0], iv[1]);
            if (inp.terrain != null)
            {
                var tr = new GoldenTerrain { @base = inp.terrain.@base };
                if (inp.terrain.rects != null)
                    tr.rects = inp.terrain.rects.ConvertAll(r => new GoldenRect { t = r.t, x0 = r.x0, y0 = r.y0, x1 = r.x1, y1 = r.y1 });
                if (inp.terrain.fire != null) tr.fire = inp.terrain.fire;
                if (inp.terrain.road != null) tr.road = inp.terrain.road;
                _fx.FillTerrain(tr);
            }
            ApplyBoot(_golden.meta.boot);
            if (inp.civs != null)
            {
                A.SetI32(WbConstants.OFF_CIVN, 0, inp.civs.Count);
                for (int i = 0; i < inp.civs.Count; i++)
                {
                    var c = inp.civs[i];
                    A.SetU8(WbConstants.OFF_CVAL, i, 1);
                    if (c.mkt.HasValue) A.SetI32(WbConstants.OFF_CVMKT, i, c.mkt.Value);
                    if (c.plague.HasValue) A.SetF64(WbConstants.OFF_CVTECH, i * 24 + 14, c.plague.Value);
                    if (c.archer.HasValue) A.SetF64(WbConstants.OFF_CVTECH, i * 24 + 13, c.archer.Value);
                    if (c.range.HasValue) A.SetF64(WbConstants.OFF_CVTECH, i * 24 + 15, c.range.Value);
                }
            }
            if (inp.atwar != null)
                foreach (var ab in inp.atwar)
                {
                    A.SetU8(WbConstants.OFF_ATWAR, ab[0] * 64 + ab[1], 1);
                    A.SetU8(WbConstants.OFF_ATWAR, ab[1] * 64 + ab[0], 1);
                }
            foreach (var u in inp.units) PutUnitCombat(u);
            A.PackEnd((uint)inp.units.Count);
        }

        [TestCase(0)]  [TestCase(1)]  [TestCase(2)]  [TestCase(3)]  [TestCase(4)]
        [TestCase(5)]  [TestCase(6)]  [TestCase(7)]  [TestCase(8)]  [TestCase(9)]
        [TestCase(10)] [TestCase(11)] [TestCase(12)] [TestCase(13)] [TestCase(14)]
        [TestCase(15)] [TestCase(16)] [TestCase(17)] [TestCase(18)] [TestCase(19)]
        [TestCase(20)] [TestCase(21)] [TestCase(22)] [TestCase(23)] [TestCase(24)]
        [TestCase(25)] [TestCase(26)] [TestCase(27)] [TestCase(28)]
        public void Combat_Replay_BitExactParity(int index)
        {
            var sc = _golden.scenarios[index];
            var inp = sc.input;
            SetupWorld(inp);
            var ticks = sc.output.ToObject<List<CombatTickOut>>();
            for (int t = 0; t < ticks.Count; t++)
            {
                int rc = WbUnits.UnitsBatch(0, 0);
                var want = ticks[t];
                Assert.AreEqual(want.rc, rc, $"{sc.name} tick{t} rc");
                Assert.AreEqual((ulong)want.rng, _fx.Arena.U64At(WbConstants.OFF_RNGS, 0), $"{sc.name} tick{t} RNG");
                Assert.AreEqual((ulong)want.tick, _fx.Arena.U64At(WbConstants.OFF_TICK, 0), $"{sc.name} tick{t} TICK");
                Assert.AreEqual((int)want.actN, _fx.Arena.I32At(WbConstants.OFF_ACTN, 0), $"{sc.name} tick{t} ACTN");
                Assert.AreEqual((int)want.dlistN, _fx.Arena.I32At(WbConstants.OFF_DLISTN, 0), $"{sc.name} tick{t} DLISTN");
                Assert.AreEqual(want.batchR, _fx.Arena.U32At(WbConstants.OFF_BATCHR, 0), $"{sc.name} tick{t} BATCHR");
                Assert.AreEqual(want.bailK, _fx.Arena.U32At(WbConstants.OFF_BAILK, 0), $"{sc.name} tick{t} BAILK");
                Assert.AreEqual(WbGoldenTests.Bits(want.cnt4), _fx.Arena.U64At(WbConstants.OFF_CNT, 4), $"{sc.name} tick{t} CNT[4]");
                Assert.AreEqual(want.wildZombie, _fx.Arena.I32At(WbConstants.OFF_WILD, 5), $"{sc.name} tick{t} WILD[zombie]");
                Assert.AreEqual(want.wildSheep, _fx.Arena.I32At(WbConstants.OFF_WILD, 6), $"{sc.name} tick{t} WILD[sheep]");
                Assert.AreEqual(WbGoldenTests.Bits(want.cvpop0), _fx.Arena.U64At(WbConstants.OFF_CVPOP, 0), $"{sc.name} tick{t} CVPOP[0]");
                Assert.AreEqual(want.fireN, _fx.Arena.I32At(WbConstants.OFF_FIREN, 0), $"{sc.name} tick{t} FIREN");
                for (int nc = 0; nc < 3; nc++)
                    Assert.AreEqual((ulong)want.neuCall[nc], _fx.Arena.U32At(WbConstants.OFF_NEUCALL, nc), $"{sc.name} tick{t} NEUCALL[{nc}]");
                var actBase = _fx.Arena.Offs[WbConstants.OFF_ACT];
                int actLen = Math.Min((int)want.actN, 512);
                string actHex = WbGoldenFixture.Hex(_fx.Arena.Arena, actBase, actLen);
                Assert.AreEqual(want.actHex ?? "", actHex, $"{sc.name} tick{t} ACT bytes");
                foreach (var eu in want.units)
                {
                    int s = eu.slot;
                    Assert.AreEqual(eu.race, (int)_fx.Arena.U32At(WbConstants.OFF_URACE, s), $"{sc.name} tick{t} u{s} race");
                    Assert.AreEqual(eu.dead, _fx.Arena.U8At(WbConstants.OFF_UDEAD, s), $"{sc.name} tick{t} u{s} dead");
                    Assert.AreEqual(eu.hasPanic, _fx.Arena.U8At(WbConstants.OFF_UHASPANIC, s), $"{sc.name} tick{t} u{s} hasPanic");
                    Assert.AreEqual(eu.inf, _fx.Arena.U8At(WbConstants.OFF_UINF, s), $"{sc.name} tick{t} u{s} inf");
                    Assert.AreEqual(eu.boat, _fx.Arena.U8At(WbConstants.OFF_UBOAT, s), $"{sc.name} tick{t} u{s} boat");
                    Assert.AreEqual(eu.flip, _fx.Arena.U8At(WbConstants.OFF_UFLIP, s), $"{sc.name} tick{t} u{s} flip");
                    Assert.AreEqual(eu.glen, _fx.Arena.I32At(WbConstants.OFF_UGLN, s), $"{sc.name} tick{t} u{s} GLEN");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.x), _fx.Arena.U64At(WbConstants.OFF_UX, s), $"{sc.name} tick{t} u{s} x");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.y), _fx.Arena.U64At(WbConstants.OFF_UY, s), $"{sc.name} tick{t} u{s} y");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.tx), _fx.Arena.U64At(WbConstants.OFF_UTX, s), $"{sc.name} tick{t} u{s} tx");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.ty), _fx.Arena.U64At(WbConstants.OFF_UTY, s), $"{sc.name} tick{t} u{s} ty");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.hp), _fx.Arena.U64At(WbConstants.OFF_UHP, s), $"{sc.name} tick{t} u{s} hp");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.panic), _fx.Arena.U64At(WbConstants.OFF_UPANIC, s), $"{sc.name} tick{t} u{s} panic");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.fleet), _fx.Arena.U64At(WbConstants.OFF_UFLEET, s), $"{sc.name} tick{t} u{s} fleet");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.cd), _fx.Arena.U64At(WbConstants.OFF_UCD, s), $"{sc.name} tick{t} u{s} cd");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.atk), _fx.Arena.U64At(WbConstants.OFF_UATK, s), $"{sc.name} tick{t} u{s} atk");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.hurt), _fx.Arena.U64At(WbConstants.OFF_UHURT, s), $"{sc.name} tick{t} u{s} hurt");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.food), _fx.Arena.U64At(WbConstants.OFF_UFD, s), $"{sc.name} tick{t} u{s} food");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.kills), _fx.Arena.U64At(WbConstants.OFF_UKILLS, s), $"{sc.name} tick{t} u{s} kills");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.breath), _fx.Arena.U64At(WbConstants.OFF_UBREATH, s), $"{sc.name} tick{t} u{s} breath");
                    Assert.AreEqual(WbGoldenTests.Bits(eu.age), _fx.Arena.U64At(WbConstants.OFF_UAGE, s), $"{sc.name} tick{t} u{s} age");
                    for (int g = 0; g < 8; g++)
                    {
                        Assert.AreEqual(eu.gids[g], _fx.Arena.I32At(WbConstants.OFF_UGIDS, s * 8 + g), $"{sc.name} tick{t} u{s} GIDS[{g}]");
                        Assert.AreEqual(WbGoldenTests.Bits(eu.gvals[g]), _fx.Arena.U64At(WbConstants.OFF_UGVAL, s * 8 + g), $"{sc.name} tick{t} u{s} GVAL[{g}]");
                    }
                }
                if (want.terr != null && inp.terrProbe != null)
                    for (int pr = 0; pr < inp.terrProbe.Count; pr++)
                    {
                        int px = inp.terrProbe[pr][0], py = inp.terrProbe[pr][1];
                        Assert.AreEqual(want.terr[pr], _fx.Arena.U8At(WbConstants.OFF_TERR, py * WbConstants.W + px), $"{sc.name} tick{t} terr[{px},{py}]");
                    }
                // 宿主协议步进（gen tick 间语义：parity 翻转 + 活单位 UCELL/UPAR 重排 + repack）
                _fx.Arena.SetU8(WbConstants.OFF_PAR, 0, (byte)(_fx.Arena.U8At(WbConstants.OFF_PAR, 0) ^ 1));
                foreach (var u in inp.units)
                {
                    if (_fx.Arena.U8At(WbConstants.OFF_UDEAD, u.slot) != 0) continue;
                    double x = _fx.Arena.F64At(WbConstants.OFF_UX, u.slot);
                    double y = _fx.Arena.F64At(WbConstants.OFF_UY, u.slot);
                    _fx.Arena.SetU32(WbConstants.OFF_UCELL, u.slot, (uint)((int)Math.Floor(y / 4.0) * WbConstants.W + (int)Math.Floor(x / 4.0)));
                    _fx.Arena.SetU8(WbConstants.OFF_UPAR, u.slot, _fx.Arena.U8At(WbConstants.OFF_PAR, 0));
                }
                _fx.Arena.PackEnd((uint)inp.units.Count);
            }
        }
    }

    // ============================================================
    // Test7 — M-U2d spawn/繁衍/拾取/家族黄金回放（26 场景全字段逐位）
    // 驱动协议：USEQ 差值追踪 live + 宿主重排含新 slot + PackEnd(liveN)
    // 引导表：boot 复用 units_combat meta.boot；TRAITS/FIRST/NEUTRAL_MODS 随本黄金 meta 分发
    // ============================================================
    public class WbSpawnGoldenTests
    {
        private JObject _golden;
        private WbGoldenFixture _fx;

        [OneTimeSetUp]
        public void Load()
        {
            string path = FindGolden();
            Assert.IsTrue(File.Exists(path), $"spawn golden json not found: {path}");
            _golden = JObject.Parse(File.ReadAllText(path));
        }

        private static string FindGolden()
        {
            string[] candidates =
            {
                "Assets/StreamingAssets/WbGolden/units_spawn.json",
                Path.Combine(TestContext.CurrentContext.TestDirectory, "Assets/StreamingAssets/WbGolden/units_spawn.json"),
            };
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return candidates[0];
        }

        [SetUp]
        public void Setup() => _fx = new WbGoldenFixture();

        private static double BitsOf(string hex) => BitConverter.Int64BitsToDouble(unchecked((long)Convert.ToUInt64(hex.Replace("0x", ""), 16)));

        private void ApplyTraits(JObject meta)
        {
            var A = _fx.Arena;
            // TRAITS 真表键序（meta.traits = [[dmg,hp,spd]×n]；fill(1) 后覆写 = wbspatial L977-994）
            for (int i = 0; i < 32; i++) { A.SetF64(WbConstants.OFF_TRDMG, i, 1); A.SetF64(WbConstants.OFF_TRHP, i, 1); A.SetF64(WbConstants.OFF_TRSPD, i, 1); }
            var traits = (JArray)meta["traits"];
            for (int i = 0; i < traits.Count; i++)
            {
                A.SetF64(WbConstants.OFF_TRDMG, i, traits[i][0].Value<double>());
                A.SetF64(WbConstants.OFF_TRHP, i, traits[i][1].Value<double>());
                A.SetF64(WbConstants.OFF_TRSPD, i, traits[i][2].Value<double>());
            }
            A.SetI32(WbConstants.OFF_TRN, 0, traits.Count);
        }

        private void ApplyFirstPool(JObject meta)
        {
            var A = _fx.Arena;
            // FIRST 名池 24B 定长条目 [len u8][bytes ×23]（wbspatial L726-750 宿主协议）
            var enc = System.Text.Encoding.UTF8;
            int cur = 0;
            var pool = (JObject)meta["firstPool"];
            foreach (var prop in pool.Properties())
            {
                int race = int.Parse(prop.Name);
                var names = (JArray)prop.Value;
                if (names.Count == 0) continue;
                if (cur + names.Count * 24 > 16384) continue;
                A.SetU32(WbConstants.OFF_FRSTOFF, race, (uint)cur);
                A.SetU32(WbConstants.OFF_FRSTN, race, (uint)names.Count);
                foreach (var nm in names)
                {
                    byte[] b = enc.GetBytes(nm.Value<string>());
                    int n = Math.Min(b.Length, 23);
                    A.SetU8(WbConstants.OFF_FRSTP, cur, (byte)n);
                    for (int i = 0; i < n; i++) A.SetU8(WbConstants.OFF_FRSTP, cur + 1 + i, b[i]);
                    cur += 24;
                }
            }
        }

        private void SetupWorld(JObject inp)
        {
            var A = _fx.Arena;
            var meta = (JObject)_golden["meta"];
            _fx.InitWorld(inp["seed"].Value<int>(), inp["fxp"]?.Value<int>() ?? 0);
            _fx.SetEps(meta["eps"].ToObject<List<double>>());
            A.SetI32(WbConstants.OFF_MISC, 0, 4096);
            A.SetI32(WbConstants.OFF_MISC, 1, 4096); // wild 预算（gen initWorldSp 同款）
            for (int r = 0; r < 512; r++) A.SetI32(WbConstants.OFF_WILDCAP, r, 4096); // cap 放开（测试基建）
            A.SetU8(WbConstants.OFF_LAWS, 0, (byte)(inp["laws"]?.Value<int>() ?? 0));
            if (inp["dayph"] != null) A.SetF64(WbConstants.OFF_DAYPH, 0, inp["dayph"].Value<double>());
            if (inp["reprm"] != null) A.SetF64(WbConstants.OFF_REPRM, 0, inp["reprm"].Value<double>());
            if (inp["terrain"] != null)
            {
                var tr = new GoldenTerrain { @base = inp["terrain"]["base"].Value<int>() };
                if (inp["terrain"]["rects"] != null)
                    tr.rects = inp["terrain"]["rects"].ToObject<List<GoldenRect>>();
                if (inp["terrain"]["fire"] != null) tr.fire = inp["terrain"]["fire"].ToObject<List<int[]>>();
                if (inp["terrain"]["road"] != null) tr.road = inp["terrain"]["road"].ToObject<List<int[]>>();
                _fx.FillTerrain(tr);
            }
            // boot 表复用 units_combat（TBR/RACE_FLAGS/TBF/TBJ/TBI 全槽真值——C# 无法 import TS）
            string combatPath = Path.Combine(Path.GetDirectoryName(FindGolden()), "units_combat.json");
            var combat = JObject.Parse(File.ReadAllText(combatPath));
            var boot = combat["meta"]["boot"];
            foreach (var kv in (JObject)boot["tbr"])
                for (int c = 0; c < 12; c++)
                    A.SetF64(WbConstants.OFF_TBR, int.Parse(kv.Key) * 12 + c, kv.Value[c].Value<double>());
            foreach (var kv in (JObject)boot["raceFlags"]) A.SetU8(WbConstants.OFF_RACE_FLAGS, int.Parse(kv.Key), (byte)kv.Value.Value<int>());
            foreach (var kv in (JObject)boot["tbf0"]) A.SetU8(WbConstants.OFF_TBF, int.Parse(kv.Key) * 2, (byte)kv.Value.Value<int>());
            foreach (var kv in (JObject)boot["tbf1"]) A.SetU8(WbConstants.OFF_TBF, int.Parse(kv.Key) * 2 + 1, (byte)kv.Value.Value<int>());
            var tbj = (JArray)boot["tbj"];
            for (int c = 0; c < tbj.Count; c++) A.SetF64(WbConstants.OFF_TBJ, c, tbj[c].Value<double>());
            foreach (var kv in (JObject)boot["tbi"])
                for (int c = 0; c < 12; c++)
                    A.SetF64(WbConstants.OFF_TBI, int.Parse(kv.Key) * 12 + c, kv.Value[c].Value<double>());
            A.SetI32(WbConstants.OFF_TBIN, 0, boot["tbin"].Value<int>());
            for (int w = 0; w < 4; w++)
            {
                A.SetU32(WbConstants.OFF_GUNBM, w, boot["gunbm"][w].Value<uint>());
                A.SetU32(WbConstants.OFF_BEAMBM, w, boot["beambm"][w].Value<uint>());
            }
            ApplyTraits(meta);
            ApplyFirstPool(meta);
            if (inp["civs"] != null)
            {
                var nm = meta["neutralMods"];
                A.SetI32(WbConstants.OFF_CIVN, 0, inp["civs"].Count());
                int ci = 0;
                foreach (var c in inp["civs"])
                {
                    A.SetU8(WbConstants.OFF_CVAL, ci, 1);
                    // CVTECH = NEUTRAL_MODS 中性基线（gen 同款；TC_REPRO=0 乘零链防线）
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 0, c["techDmg"]?.Value<double>() ?? nm["dmg"].Value<double>());
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 1, c["techHp"]?.Value<double>() ?? nm["hp"].Value<double>());
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 2, nm["bhp"].Value<double>());
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 5, c["techRepro"]?.Value<double>() ?? nm["repro"].Value<double>());
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 9, nm["repair"].Value<double>());
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 13, nm["archer"].Value<double>());
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 14, nm["plague"].Value<double>());
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 15, nm["range"].Value<double>());
                    A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + 18, c["techIdea"]?.Value<double>() ?? 0);
                    if (c["pop"] != null) A.SetF64(WbConstants.OFF_CVPOP, ci, c["pop"].Value<double>());
                    if (c["pc"] != null) A.SetF64(WbConstants.OFF_CVPC, ci, c["pc"].Value<double>());
                    if (c["gov"] != null) A.SetI32(WbConstants.OFF_CVGOV, ci, c["gov"].Value<int>());
                    if (c["dir"] != null) A.SetU8(WbConstants.OFF_CVDIR, ci, (byte)c["dir"].Value<int>());
                    if (c["mkt"] != null) A.SetI32(WbConstants.OFF_CVMKT, ci, c["mkt"].Value<int>());
                    ci++;
                }
            }
            if (inp["atwar"] != null)
                foreach (var ab in inp["atwar"])
                {
                    A.SetU8(WbConstants.OFF_ATWAR, ab[0].Value<int>() * 64 + ab[1].Value<int>(), 1);
                    A.SetU8(WbConstants.OFF_ATWAR, ab[1].Value<int>() * 64 + ab[0].Value<int>(), 1);
                }
            if (inp["fams"] != null)
            {
                int fi = 0;
                foreach (var f in inp["fams"])
                {
                    A.SetI32(WbConstants.OFF_FMID, fi, f["id"].Value<int>());
                    A.SetI32(WbConstants.OFF_FMRACE, fi, f["race"]?.Value<int>() ?? 0);
                    for (int k = 0; k < 6; k++) A.SetF64(WbConstants.OFF_FMNUM, fi * 6 + k, f["num"] != null && k < f["num"].Count() ? f["num"][k].Value<double>() : 0);
                    if (f["pre"] != null) A.SetU16(WbConstants.OFF_FMNAME, fi * 2, (ushort)f["pre"].Value<int>());
                    if (f["post"] != null) A.SetU16(WbConstants.OFF_FMNAME, fi * 2 + 1, (ushort)f["post"].Value<int>());
                    fi++;
                }
                A.SetI32(WbConstants.OFF_FAMN, 0, inp["fams"].Count());
            }
            if (inp["wilds"] != null) foreach (var w in inp["wilds"]) A.SetI32(WbConstants.OFF_WILD, w[0].Value<int>(), w[1].Value<int>());
            if (inp["wildcaps"] != null) foreach (var w in inp["wildcaps"]) A.SetI32(WbConstants.OFF_WILDCAP, w[0].Value<int>(), w[1].Value<int>());
            if (inp["moncaps"] != null) foreach (var w in inp["moncaps"]) A.SetI32(WbConstants.OFF_MONCAP, w[0].Value<int>(), w[1].Value<int>());
            if (inp["spb"] != null)
                foreach (var sp in inp["spb"])
                {
                    for (int k = 0; k < 4; k++) A.SetF64(WbConstants.OFF_SPB, sp[0].Value<int>() * 4 + k, sp[1][k].Value<double>());
                    A.SetU8(WbConstants.OFF_SPBH, sp[0].Value<int>(), 1);
                }
            if (inp["cnt5"] != null) A.SetF64(WbConstants.OFF_CNT, 5, inp["cnt5"].Value<double>());
            if (inp["items"] != null)
            {
                int ii = 0;
                foreach (var it in inp["items"])
                {
                    A.SetI32(WbConstants.OFF_ITMK, ii, it["k"].Value<int>());
                    A.SetF64(WbConstants.OFF_ITMXY, ii * 2, it["x"].Value<double>());
                    A.SetF64(WbConstants.OFF_ITMXY, ii * 2 + 1, it["y"].Value<double>());
                    ii++;
                }
                A.SetI32(WbConstants.OFF_ITMN, 0, inp["items"].Count());
            }
            foreach (var u in inp["units"]) PutUnitSpawn(u);
            A.PackEnd((uint)inp["units"].Count());
        }

        private void PutUnitSpawn(JToken u)
        {
            var A = _fx.Arena;
            int slot = u["slot"].Value<int>();
            A.SetU32(WbConstants.OFF_UID, slot, unchecked((uint)(u["id"]?.Value<int>() ?? slot)));
            A.SetU32(WbConstants.OFF_URACE, slot, (uint)u["race"].Value<int>());
            A.SetU32(WbConstants.OFF_UCELL, slot, (uint)((int)Math.Floor(u["y"].Value<double>() / 4.0) * WbConstants.W + (int)Math.Floor(u["x"].Value<double>() / 4.0)));
            A.SetF64(WbConstants.OFF_UX, slot, u["x"].Value<double>());
            A.SetF64(WbConstants.OFF_UY, slot, u["y"].Value<double>());
            A.SetF64(WbConstants.OFF_UTX, slot, u["tx"]?.Value<double>() ?? u["x"].Value<double>());
            A.SetF64(WbConstants.OFF_UTY, slot, u["ty"]?.Value<double>() ?? u["y"].Value<double>());
            A.SetF64(WbConstants.OFF_USPEED, slot, u["speed"]?.Value<double>() ?? 0.08);
            A.SetF64(WbConstants.OFF_UHP, slot, u["hp"]?.Value<double>() ?? 100);
            A.SetF64(WbConstants.OFF_UMAXHP, slot, u["maxhp"]?.Value<double>() ?? 100);
            A.SetF64(WbConstants.OFF_UMAXAGE, slot, u["maxage"]?.Value<double>() ?? 9999);
            A.SetF64(WbConstants.OFF_UAGE, slot, 0);
            A.SetF64(WbConstants.OFF_UDMG, slot, u["dmg"]?.Value<double>() ?? 5);
            A.SetF64(WbConstants.OFF_UKILLS, slot, u["kills"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UCHILL, slot, 0);
            A.SetF64(WbConstants.OFF_UCURSE, slot, u["curse"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UBLESS, slot, 0);
            A.SetF64(WbConstants.OFF_UFERT, slot, u["fert"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UDETOUR, slot, 0);
            A.SetF64(WbConstants.OFF_UHURT, slot, 0);
            A.SetF64(WbConstants.OFF_UATK, slot, 0);
            A.SetF64(WbConstants.OFF_UCD, slot, u["cd"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UBREATH, slot, u["breath"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UFD, slot, u["food"] != null ? u["food"].Value<double>() : double.NaN);
            A.SetF64(WbConstants.OFF_UCVN, slot, u["cvn"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UFLEET, slot, u["fleet"]?.Value<double>() ?? 0);
            A.SetI32(WbConstants.OFF_UCIV, slot, u["civ"]?.Value<int>() ?? -1);
            A.SetI32(WbConstants.OFF_UJOB, slot, u["job"]?.Value<int>() ?? -1);
            A.SetI32(WbConstants.OFF_UARMY, slot, -1);
            A.SetI32(WbConstants.OFF_USTK, slot, 0);
            A.SetI32(WbConstants.OFF_UTRAIT, slot, u["trait"]?.Value<int>() ?? -1);
            A.SetU8(WbConstants.OFF_UDEAD, slot, 0);
            A.SetU8(WbConstants.OFF_UHASPANIC, slot, (byte)(u["panic"] != null ? 1 : 0));
            if (u["panic"] != null) A.SetF64(WbConstants.OFF_UPANIC, slot, u["panic"].Value<double>());
            A.SetU8(WbConstants.OFF_UINF, slot, (byte)(u["inf"] == true ? 1 : 0));
            A.SetU8(WbConstants.OFF_UBOAT, slot, (byte)(u["boat"] == true ? 1 : 0));
            A.SetU8(WbConstants.OFF_UFLIP, slot, 0);
            A.SetF64(WbConstants.OFF_ULX, slot, double.NaN);
            A.SetF64(WbConstants.OFF_ULY, slot, double.NaN);
            if (u["gene"] != null) { for (int g = 0; g < 4; g++) A.SetF64(WbConstants.OFF_UGENE, slot * 4 + g, u["gene"][g].Value<double>()); }
            else { for (int g = 0; g < 4; g++) A.SetF64(WbConstants.OFF_UGENE, slot * 4 + g, 1); }
            for (int g = 0; g < 7; g++) A.SetI32(WbConstants.OFF_UGEAR, slot * 7 + g, u["gear"] != null && g < u["gear"].Count() ? u["gear"][g].Value<int>() : -1);
            if (u["name"] != null)
            {
                byte[] b = System.Text.Encoding.UTF8.GetBytes(u["name"].Value<string>());
                int n = Math.Min(b.Length, 31);
                for (int i = 0; i < 32; i++) A.SetU8(WbConstants.OFF_UNAME, slot * 32 + i, i < n ? b[i] : (byte)0);
                A.SetU8(WbConstants.OFF_UNAME, slot * 32 + 31, (byte)n);
            }
            for (int g = 0; g < 8; g++) { A.SetI32(WbConstants.OFF_UGIDS, slot * 8 + g, -1); A.SetF64(WbConstants.OFF_UGVAL, slot * 8 + g, 0); }
            if (u["grudges"] != null)
            {
                for (int g = 0; g < ((JArray)u["grudges"]).Count && g < 8; g++)
                {
                    A.SetI32(WbConstants.OFF_UGIDS, slot * 8 + g, u["grudges"][g]["oid"].Value<int>());
                    A.SetF64(WbConstants.OFF_UGVAL, slot * 8 + g, u["grudges"][g]["gv"].Value<double>());
                }
                A.SetI32(WbConstants.OFF_UGLN, slot, Math.Min(((JArray)u["grudges"]).Count, 8));
            }
            else A.SetI32(WbConstants.OFF_UGLN, slot, -1);
            A.SetI32(WbConstants.OFF_UFAM, slot, u["fam"]?.Value<int>() ?? -1);
            A.SetI32(WbConstants.OFF_UFGN, slot, u["fgn"]?.Value<int>() ?? -1);
        }

        private static string NameOf(byte[] arena, int baseOff, int slot)
        {
            int len = arena[baseOff + slot * 32 + 31];
            var chars = new char[len];
            for (int i = 0; i < len; i++) chars[i] = (char)arena[baseOff + slot * 32 + i];
            return new string(chars);
        }

        [TestCase(0)]  [TestCase(1)]  [TestCase(2)]  [TestCase(3)]  [TestCase(4)]
        [TestCase(5)]  [TestCase(6)]  [TestCase(7)]  [TestCase(8)]  [TestCase(9)]
        [TestCase(10)] [TestCase(11)] [TestCase(12)] [TestCase(13)] [TestCase(14)]
        [TestCase(15)] [TestCase(16)] [TestCase(17)] [TestCase(18)] [TestCase(19)]
        [TestCase(20)] [TestCase(21)] [TestCase(22)] [TestCase(23)] [TestCase(24)] [TestCase(25)]
        public void Spawn_Replay_BitExactParity(int index)
        {
            var sc = (JObject)_golden["scenarios"][index];
            var inp = (JObject)sc["input"];
            var name = sc["name"].Value<string>();
            int n0 = inp["units"].Count();
            SetupWorld(inp);
            var A = _fx.Arena;
            uint useq0 = A.U32At(WbConstants.OFF_USEQ, 0);
            int liveN = n0;
            A.PackEnd((uint)liveN);
            var ticks = (JArray)sc["output"];
            for (int t = 0; t < ticks.Count; t++)
            {
                var want = (JObject)ticks[t];
                int rc = WbUnits.UnitsBatch(0, 0);
                uint spawnedU = A.U32At(WbConstants.OFF_USEQ, 0) - useq0;
                int spawned = (int)spawnedU;
                liveN = n0 + spawned;
                Assert.AreEqual(want["rc"].Value<int>(), rc, $"{name} tick{t} rc");
                Assert.AreEqual(want["spawned"].Value<int>(), spawned, $"{name} tick{t} spawned(USEQ 差值)");
                Assert.AreEqual((ulong)want["rng"].Value<uint>(), A.U64At(WbConstants.OFF_RNGS, 0), $"{name} tick{t} RNG");
                Assert.AreEqual((ulong)want["tick"].Value<uint>(), A.U64At(WbConstants.OFF_TICK, 0), $"{name} tick{t} TICK");
                Assert.AreEqual((ulong)want["useq"].Value<uint>(), A.U64At(WbConstants.OFF_USEQ, 0), $"{name} tick{t} USEQ");
                Assert.AreEqual((int)want["actN"], A.I32At(WbConstants.OFF_ACTN, 0), $"{name} tick{t} ACTN");
                Assert.AreEqual((int)want["dlistN"], A.I32At(WbConstants.OFF_DLISTN, 0), $"{name} tick{t} DLISTN");
                Assert.AreEqual(want["batchR"].Value<uint>(), A.U32At(WbConstants.OFF_BATCHR, 0), $"{name} tick{t} BATCHR");
                Assert.AreEqual(want["bailK"].Value<uint>(), A.U32At(WbConstants.OFF_BAILK, 0), $"{name} tick{t} BAILK");
                for (int k = 0; k < 5; k++)
                    Assert.AreEqual(BitsOf(want["bailP"][k].ToString()), A.U64At(WbConstants.OFF_BAILP, k), $"{name} tick{t} BAILP[{k}]");
                Assert.AreEqual(want["famn"].Value<int>(), A.I32At(WbConstants.OFF_FAMN, 0), $"{name} tick{t} FAMN");
                Assert.AreEqual(want["famseq"].Value<int>(), A.I32At(WbConstants.OFF_FMSEQ, 0), $"{name} tick{t} FMSEQ");
                Assert.AreEqual(want["itmn"].Value<int>(), A.I32At(WbConstants.OFF_ITMN, 0), $"{name} tick{t} ITMN");
                Assert.AreEqual(BitsOf(want["cvpop0"].ToString()), A.U64At(WbConstants.OFF_CVPOP, 0), $"{name} tick{t} CVPOP[0]");
                Assert.AreEqual(BitsOf(want["cnt4"].ToString()), A.U64At(WbConstants.OFF_CNT, 4), $"{name} tick{t} CNT[4]");
                Assert.AreEqual(BitsOf(want["cnt5"].ToString()), A.U64At(WbConstants.OFF_CNT, 5), $"{name} tick{t} CNT[5]");
                Assert.AreEqual(BitsOf(want["grass"].ToString()), A.U64At(WbConstants.OFF_GRASS, 0), $"{name} tick{t} GRASS");
                Assert.AreEqual(want["wildSheep"].Value<int>(), A.I32At(WbConstants.OFF_WILD, 6), $"{name} tick{t} WILD[sheep]");
                Assert.AreEqual(want["wildZombie"].Value<int>(), A.I32At(WbConstants.OFF_WILD, 5), $"{name} tick{t} WILD[zombie]");
                Assert.AreEqual(want["wildSkeleton"].Value<int>(), A.I32At(WbConstants.OFF_WILD, 16), $"{name} tick{t} WILD[skeleton]");
                // 家族表逐位
                var wantFams = (JArray)want["fams"];
                for (int r = 0; r < wantFams.Count; r++)
                {
                    var wf = (JObject)wantFams[r];
                    Assert.AreEqual(wf["id"].Value<int>(), A.I32At(WbConstants.OFF_FMID, r), $"{name} tick{t} FM[{r}] id");
                    Assert.AreEqual(wf["race"].Value<int>(), A.I32At(WbConstants.OFF_FMRACE, r), $"{name} tick{t} FM[{r}] race");
                    for (int k = 0; k < 6; k++)
                        Assert.AreEqual(BitsOf(wf["num"][k].ToString()), A.U64At(WbConstants.OFF_FMNUM, r * 6 + k), $"{name} tick{t} FM[{r}] num[{k}]");
                    Assert.AreEqual((ushort)wf["name"][0].Value<int>(), A.U16At(WbConstants.OFF_FMNAME, r * 2), $"{name} tick{t} FM[{r}] pre");
                    Assert.AreEqual((ushort)wf["name"][1].Value<int>(), A.U16At(WbConstants.OFF_FMNAME, r * 2 + 1), $"{name} tick{t} FM[{r}] post");
                }
                // 物品表逐位
                var wantItems = (JArray)want["items"];
                for (int i = 0; i < wantItems.Count; i++)
                {
                    var wi = (JObject)wantItems[i];
                    Assert.AreEqual(wi["k"].Value<int>(), A.I32At(WbConstants.OFF_ITMK, i), $"{name} tick{t} ITM[{i}] k");
                    Assert.AreEqual(BitsOf(wi["x"].ToString()), A.U64At(WbConstants.OFF_ITMXY, i * 2), $"{name} tick{t} ITM[{i}] x");
                    Assert.AreEqual(BitsOf(wi["y"].ToString()), A.U64At(WbConstants.OFF_ITMXY, i * 2 + 1), $"{name} tick{t} ITM[{i}] y");
                }
                // ACT 缓冲
                var actBase = A.Offs[WbConstants.OFF_ACT];
                int actLen = Math.Min((int)want["actN"], 1024);
                Assert.AreEqual(want["actHex"]?.Value<string>() ?? "", WbGoldenFixture.Hex(A.Arena, actBase, actLen), $"{name} tick{t} ACT bytes");
                // 单位全字段逐位（初始 + 新 spawn slot）
                var wantUnits = (JArray)want["units"];
                foreach (var eu in wantUnits)
                {
                    int s = eu["slot"].Value<int>();
                    Assert.AreEqual(eu["race"].Value<uint>(), A.U32At(WbConstants.OFF_URACE, s), $"{name} tick{t} u{s} race");
                    Assert.AreEqual(eu["uid"].Value<uint>(), A.U32At(WbConstants.OFF_UID, s), $"{name} tick{t} u{s} uid");
                    Assert.AreEqual(eu["dead"].Value<int>(), A.U8At(WbConstants.OFF_UDEAD, s), $"{name} tick{t} u{s} dead");
                    Assert.AreEqual(eu["hasPanic"].Value<int>(), A.U8At(WbConstants.OFF_UHASPANIC, s), $"{name} tick{t} u{s} hasPanic");
                    Assert.AreEqual(eu["inf"].Value<int>(), A.U8At(WbConstants.OFF_UINF, s), $"{name} tick{t} u{s} inf");
                    Assert.AreEqual(eu["boat"].Value<int>(), A.U8At(WbConstants.OFF_UBOAT, s), $"{name} tick{t} u{s} boat");
                    Assert.AreEqual(eu["flip"].Value<int>(), A.U8At(WbConstants.OFF_UFLIP, s), $"{name} tick{t} u{s} flip");
                    Assert.AreEqual(eu["par"].Value<int>(), A.U8At(WbConstants.OFF_UPAR, s), $"{name} tick{t} u{s} par");
                    Assert.AreEqual(eu["civ"].Value<int>(), A.I32At(WbConstants.OFF_UCIV, s), $"{name} tick{t} u{s} civ");
                    Assert.AreEqual(eu["job"].Value<int>(), A.I32At(WbConstants.OFF_UJOB, s), $"{name} tick{t} u{s} job");
                    Assert.AreEqual(eu["trait"].Value<int>(), A.I32At(WbConstants.OFF_UTRAIT, s), $"{name} tick{t} u{s} trait");
                    Assert.AreEqual(eu["fam"].Value<int>(), A.I32At(WbConstants.OFF_UFAM, s), $"{name} tick{t} u{s} fam");
                    Assert.AreEqual(eu["fgn"].Value<int>(), A.I32At(WbConstants.OFF_UFGN, s), $"{name} tick{t} u{s} fgn");
                    Assert.AreEqual(eu["gln"].Value<int>(), A.I32At(WbConstants.OFF_UGLN, s), $"{name} tick{t} u{s} gln");
                    Assert.AreEqual(eu["army"].Value<int>(), A.I32At(WbConstants.OFF_UARMY, s), $"{name} tick{t} u{s} army");
                    Assert.AreEqual(eu["cell"].Value<uint>(), A.U32At(WbConstants.OFF_UCELL, s), $"{name} tick{t} u{s} cell");
                    Assert.AreEqual(eu["stx"].Value<int>(), A.I32At(WbConstants.OFF_USTK, s), $"{name} tick{t} u{s} stx");
                    foreach (var fld in new[]
                    {
                        new[] { "x", WbConstants.OFF_UX }, new[] { "y", WbConstants.OFF_UY },
                        new[] { "tx", WbConstants.OFF_UTX }, new[] { "ty", WbConstants.OFF_UTY },
                        new[] { "lx", WbConstants.OFF_ULX }, new[] { "ly", WbConstants.OFF_ULY },
                        new[] { "hp", WbConstants.OFF_UHP }, new[] { "maxhp", WbConstants.OFF_UMAXHP },
                        new[] { "dmg", WbConstants.OFF_UDMG }, new[] { "speed", WbConstants.OFF_USPEED },
                        new[] { "age", WbConstants.OFF_UAGE }, new[] { "maxage", WbConstants.OFF_UMAXAGE },
                        new[] { "kills", WbConstants.OFF_UKILLS }, new[] { "cd", WbConstants.OFF_UCD },
                        new[] { "breath", WbConstants.OFF_UBREATH }, new[] { "hurt", WbConstants.OFF_UHURT },
                        new[] { "food", WbConstants.OFF_UFD }, new[] { "cvn", WbConstants.OFF_UCVN },
                        new[] { "fleet", WbConstants.OFF_UFLEET }, new[] { "bless", WbConstants.OFF_UBLESS },
                        new[] { "curse", WbConstants.OFF_UCURSE }, new[] { "fert", WbConstants.OFF_UFERT },
                        new[] { "detour", WbConstants.OFF_UDETOUR }, new[] { "atk", WbConstants.OFF_UATK },
                        new[] { "chill", WbConstants.OFF_UCHILL },
                    })
                        Assert.AreEqual(BitsOf(eu[fld[0]].ToString()), A.U64At(fld[1], s), $"{name} tick{t} u{s} {fld[0]}");
                    for (int g = 0; g < 4; g++)
                        Assert.AreEqual(BitsOf(eu["gene"][g].ToString()), A.U64At(WbConstants.OFF_UGENE, s * 4 + g), $"{name} tick{t} u{s} gene[{g}]");
                    for (int g = 0; g < 32; g++)
                        Assert.AreEqual(eu["name"][g].Value<int>(), A.U8At(WbConstants.OFF_UNAME, s * 32 + g), $"{name} tick{t} u{s} name[{g}]");
                    for (int g = 0; g < 7; g++)
                        Assert.AreEqual(eu["gear"][g].Value<int>(), A.I32At(WbConstants.OFF_UGEAR, s * 7 + g), $"{name} tick{t} u{s} gear[{g}]");
                }
                // 宿主协议步进（parity 翻转 + 活单位 UCELL/UPAR 重排含新 slot + PackEnd(liveN)）
                A.SetU8(WbConstants.OFF_PAR, 0, (byte)(A.U8At(WbConstants.OFF_PAR, 0) ^ 1));
                for (int s = 0; s < liveN; s++)
                {
                    if (A.U8At(WbConstants.OFF_UDEAD, s) != 0) continue;
                    double x = A.F64At(WbConstants.OFF_UX, s);
                    double y = A.F64At(WbConstants.OFF_UY, s);
                    A.SetU32(WbConstants.OFF_UCELL, s, (uint)((int)Math.Floor(y / 4.0) * WbConstants.W + (int)Math.Floor(x / 4.0)));
                    A.SetU8(WbConstants.OFF_UPAR, s, A.U8At(WbConstants.OFF_PAR, 0));
                }
                A.PackEnd((uint)liveN);
            }
        }
    }    // ============================================================
    // Test8 — M-U3a civ/建筑辅助族黄金回放（30 场景全字段逐位）
    // 布置协议：TBHP(meta) + OWN 全表 -1 + CIV/CVTECH + BLDN/BLDI/BLDXY/BLDC/BLDHP/
    //   BLDK/OWN + FIREG/FIREN + DMGL/DMGN + CNT 预置 + PackEnd 重建 BIDX
    // 引导表：boot 复用 units_combat meta.boot（同 Test7 先例）
    // ⚠ 2026-10-27 10:46 本类曾被并行 cron agent 覆写丢失，本处为重落盘（内容同源）
    // ============================================================
    public class WbCivGoldenTests
    {
        private JObject _golden;
        private WbGoldenFixture _fx;

        [OneTimeSetUp]
        public void Load()
        {
            string path = FindGolden();
            Assert.IsTrue(File.Exists(path), $"civ golden json not found: {path}");
            _golden = JObject.Parse(File.ReadAllText(path));
        }

        private static string FindGolden()
        {
            string[] candidates =
            {
                "Assets/StreamingAssets/WbGolden/units_civ.json",
                Path.Combine(TestContext.CurrentContext.TestDirectory, "Assets/StreamingAssets/WbGolden/units_civ.json"),
            };
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return candidates[0];
        }

        [SetUp]
        public void Setup() => _fx = new WbGoldenFixture();

        private static double BitsOf(string hex) => BitConverter.Int64BitsToDouble(unchecked((long)Convert.ToUInt64(hex.Replace("0x", ""), 16)));

        private void SetupWorld(JObject inp)
        {
            var A = _fx.Arena;
            var meta = (JObject)_golden["meta"];
            _fx.InitWorld(inp["seed"].Value<int>(), inp["fxp"]?.Value<int>() ?? 0);
            _fx.SetEps(meta["eps"].ToObject<List<double>>());
            if (inp["terrain"] != null)
            {
                var tr = new GoldenTerrain { @base = inp["terrain"]["base"].Value<int>() };
                if (inp["terrain"]["rects"] != null) tr.rects = inp["terrain"]["rects"].ToObject<List<GoldenRect>>();
                _fx.FillTerrain(tr);
            }
            // boot 表复用 units_combat（TBR/RACE_FLAGS/TBF/TBJ/TBI 全槽真值）
            string combatPath = Path.Combine(Path.GetDirectoryName(FindGolden()), "units_combat.json");
            var combat = JObject.Parse(File.ReadAllText(combatPath));
            var boot = combat["meta"]["boot"];
            foreach (var kv in (JObject)boot["tbr"])
                for (int c = 0; c < 12; c++)
                    A.SetF64(WbConstants.OFF_TBR, int.Parse(kv.Key) * 12 + c, kv.Value[c].Value<double>());
            foreach (var kv in (JObject)boot["raceFlags"]) A.SetU8(WbConstants.OFF_RACE_FLAGS, int.Parse(kv.Key), (byte)kv.Value.Value<int>());
            foreach (var kv in (JObject)boot["tbf0"]) A.SetU8(WbConstants.OFF_TBF, int.Parse(kv.Key) * 2, (byte)kv.Value.Value<int>());
            foreach (var kv in (JObject)boot["tbf1"]) A.SetU8(WbConstants.OFF_TBF, int.Parse(kv.Key) * 2 + 1, (byte)kv.Value.Value<int>());
            var tbj = (JArray)boot["tbj"];
            for (int c = 0; c < tbj.Count; c++) A.SetF64(WbConstants.OFF_TBJ, c, tbj[c].Value<double>());
            foreach (var kv in (JObject)boot["tbi"])
                for (int c = 0; c < 12; c++)
                    A.SetF64(WbConstants.OFF_TBI, int.Parse(kv.Key) * 12 + c, kv.Value[c].Value<double>());
            A.SetI32(WbConstants.OFF_TBIN, 0, boot["tbin"].Value<int>());
            // TBHP（meta 随黄金分发；k=1..10——城墙 11 不灌，宿主循环原样）
            foreach (var kv in (JObject)meta["tbhp"])
                A.SetF64(WbConstants.OFF_TBHP, int.Parse(kv.Key), kv.Value.Value<double>());
            // OWN 全表 -1（engine Int16Array.fill(-1) 宿主语义）
            for (int i = 0; i < WbConstants.W * WbConstants.H; i++) A.SetU16(WbConstants.OFF_OWN, i, unchecked((ushort)-1));
            // 文明表（CVTECH [2]=bhp/[9]=repair，缺省 1 = NEUTRAL_MODS）
            var civsIn = (JArray)(inp["civs"] ?? new JArray());
            A.SetI32(WbConstants.OFF_CIVN, 0, civsIn.Count);
            for (int ci = 0; ci < civsIn.Count; ci++)
            {
                var c = (JObject)civsIn[ci];
                A.SetU8(WbConstants.OFF_CVAL, ci, (byte)(c["alive"] != null && c["alive"].Value<bool>() ? 1 : (c["alive"] != null ? 0 : 1)));
                if (c["cap"] != null) A.SetI32(WbConstants.OFF_CVCAP, ci, c["cap"].Value<int>());
                if (c["mkt"] != null) A.SetI32(WbConstants.OFF_CVMKT, ci, c["mkt"].Value<int>());
                A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + WbConstants.TC_BHP, c["bhp"]?.Value<double>() ?? 1);
                A.SetF64(WbConstants.OFF_CVTECH, ci * 24 + WbConstants.TC_REPAIR, c["repair"]?.Value<double>() ?? 1);
            }
            if (inp["atwar"] != null)
                foreach (var ab in inp["atwar"])
                {
                    A.SetU8(WbConstants.OFF_ATWAR, ab[0].Value<int>() * 64 + ab[1].Value<int>(), 1);
                    A.SetU8(WbConstants.OFF_ATWAR, ab[1].Value<int>() * 64 + ab[0].Value<int>(), 1);
                }
            double techBhp = civsIn.Count > 0 && civsIn[0]["bhp"] != null ? civsIn[0]["bhp"].Value<double>() : 1;
            // 建筑表（WP_BLD 协议：行序 = BLDI 序；tile 落 BLDK/OWN）
            var bldsIn = (JArray)(inp["blds"] ?? new JArray());
            A.SetI32(WbConstants.OFF_BLDN, 0, bldsIn.Count);
            for (int r = 0; r < bldsIn.Count; r++)
            {
                var b = (JObject)bldsIn[r];
                int bx = b["x"].Value<int>(), by = b["y"].Value<int>(), kind = b["kind"].Value<int>(), bc = b["civ"].Value<int>();
                int tile = by * WbConstants.W + bx;
                A.SetI32(WbConstants.OFF_BLDI, r, tile);
                A.SetI32(WbConstants.OFF_BLDXY, r * 2, bx);
                A.SetI32(WbConstants.OFF_BLDXY, r * 2 + 1, by);
                A.SetI32(WbConstants.OFF_BLDC, r, bc);
                double hp = b["hp"] != null
                    ? b["hp"].Value<double>()
                    : Math.Round(A.F64At(WbConstants.OFF_TBHP, kind) * techBhp); // 宿主 bHp.get ?? round(def.hp*bhp)
                A.SetF64(WbConstants.OFF_BLDHP, r, hp);
                A.SetU8(WbConstants.OFF_BLDK, tile, (byte)kind);
                A.SetU16(WbConstants.OFF_OWN, tile, (ushort)bc);
            }
            // 火格（FIREG + FIREN 计数）
            if (inp["fires"] != null)
            {
                foreach (var f in inp["fires"]) A.SetU8(WbConstants.OFF_FIREG, f.Value<int>(), 1);
                A.SetI32(WbConstants.OFF_FIREN, 0, inp["fires"].Count());
            }
            // 损坏集（DMGL 有序 + DMGN）
            if (inp["damaged"] != null)
            {
                int di = 0;
                foreach (var d in inp["damaged"]) A.SetI32(WbConstants.OFF_DMGL, di++, d.Value<int>());
                A.SetI32(WbConstants.OFF_DMGN, 0, inp["damaged"].Count());
            }
            // CNT 预置（[0]=firesOut/[1]=firesOutLast/[2]=repairsDone/[3]=repairLast）
            if (inp["cnt"] != null)
                for (int k = 0; k < 4; k++)
                    if (inp["cnt"][k] != null) A.SetF64(WbConstants.OFF_CNT, k, inp["cnt"][k].Value<double>());
            foreach (var u in inp["units"]) PutUnitCiv(u);
            A.PackEnd((uint)inp["units"].Count());
        }

        private void PutUnitCiv(JToken u)
        {
            var A = _fx.Arena;
            int slot = u["slot"].Value<int>();
            A.SetU32(WbConstants.OFF_UID, slot, unchecked((uint)(u["id"]?.Value<int>() ?? slot)));
            A.SetU32(WbConstants.OFF_URACE, slot, (uint)u["race"].Value<int>());
            A.SetU32(WbConstants.OFF_UCELL, slot, (uint)((int)Math.Floor(u["y"].Value<double>() / 4.0) * WbConstants.W + (int)Math.Floor(u["x"].Value<double>() / 4.0)));
            A.SetF64(WbConstants.OFF_UX, slot, u["x"].Value<double>());
            A.SetF64(WbConstants.OFF_UY, slot, u["y"].Value<double>());
            A.SetF64(WbConstants.OFF_UTX, slot, u["tx"]?.Value<double>() ?? u["x"].Value<double>());
            A.SetF64(WbConstants.OFF_UTY, slot, u["ty"]?.Value<double>() ?? u["y"].Value<double>());
            A.SetF64(WbConstants.OFF_USPEED, slot, u["speed"]?.Value<double>() ?? 0.08);
            A.SetF64(WbConstants.OFF_UHP, slot, u["hp"]?.Value<double>() ?? 100);
            A.SetF64(WbConstants.OFF_UMAXHP, slot, u["maxhp"]?.Value<double>() ?? 100);
            A.SetF64(WbConstants.OFF_UMAXAGE, slot, 9999);
            A.SetF64(WbConstants.OFF_UAGE, slot, 0);
            A.SetF64(WbConstants.OFF_UDMG, slot, u["dmg"]?.Value<double>() ?? 5);
            A.SetF64(WbConstants.OFF_UKILLS, slot, u["kills"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UCHILL, slot, 0);
            A.SetF64(WbConstants.OFF_UCURSE, slot, u["curse"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UBLESS, slot, 0);
            A.SetF64(WbConstants.OFF_UFERT, slot, 0);
            A.SetF64(WbConstants.OFF_UDETOUR, slot, 0);
            A.SetF64(WbConstants.OFF_UHURT, slot, 0);
            A.SetF64(WbConstants.OFF_UATK, slot, 0);
            A.SetF64(WbConstants.OFF_UCD, slot, u["cd"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UBREATH, slot, u["breath"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UFD, slot, u["food"] != null ? u["food"].Value<double>() : double.NaN);
            A.SetF64(WbConstants.OFF_UCVN, slot, u["cvn"]?.Value<double>() ?? 0);
            A.SetF64(WbConstants.OFF_UFLEET, slot, u["fleet"]?.Value<double>() ?? 0);
            A.SetI32(WbConstants.OFF_UCIV, slot, u["civ"]?.Value<int>() ?? -1);
            A.SetI32(WbConstants.OFF_UJOB, slot, u["job"]?.Value<int>() ?? -1);
            A.SetI32(WbConstants.OFF_UARMY, slot, -1);
            A.SetI32(WbConstants.OFF_UFAM, slot, -1);
            A.SetI32(WbConstants.OFF_UFGN, slot, -1);
            A.SetI32(WbConstants.OFF_USTK, slot, 0);
            A.SetI32(WbConstants.OFF_UTRAIT, slot, u["trait"]?.Value<int>() ?? -1);
            A.SetU8(WbConstants.OFF_UDEAD, slot, 0);
            A.SetU8(WbConstants.OFF_UHASPANIC, slot, (byte)(u["panic"] != null ? 1 : 0));
            if (u["panic"] != null) A.SetF64(WbConstants.OFF_UPANIC, slot, u["panic"].Value<double>());
            A.SetU8(WbConstants.OFF_UINF, slot, (byte)(u["inf"] == true ? 1 : 0));
            A.SetU8(WbConstants.OFF_UBOAT, slot, (byte)(u["boat"] == true ? 1 : 0));
            A.SetU8(WbConstants.OFF_UFLIP, slot, 0);
            A.SetF64(WbConstants.OFF_ULX, slot, double.NaN);
            A.SetF64(WbConstants.OFF_ULY, slot, double.NaN);
            for (int g = 0; g < 4; g++) A.SetF64(WbConstants.OFF_UGENE, slot * 4 + g, 1);
            for (int g = 0; g < 7; g++) A.SetI32(WbConstants.OFF_UGEAR, slot * 7 + g, u["gear"] != null && g < u["gear"].Count() ? u["gear"][g].Value<int>() : -1);
            for (int g = 0; g < 8; g++) { A.SetI32(WbConstants.OFF_UGIDS, slot * 8 + g, -1); A.SetF64(WbConstants.OFF_UGVAL, slot * 8 + g, 0); }
            if (u["grudges"] != null)
            {
                for (int g = 0; g < ((JArray)u["grudges"]).Count && g < 8; g++)
                {
                    A.SetI32(WbConstants.OFF_UGIDS, slot * 8 + g, u["grudges"][g]["oid"].Value<int>());
                    A.SetF64(WbConstants.OFF_UGVAL, slot * 8 + g, u["grudges"][g]["gv"].Value<double>());
                }
                A.SetI32(WbConstants.OFF_UGLN, slot, Math.Min(((JArray)u["grudges"]).Count, 8));
            }
            else A.SetI32(WbConstants.OFF_UGLN, slot, -1);
        }

        [TestCase(0)]  [TestCase(1)]  [TestCase(2)]  [TestCase(3)]  [TestCase(4)]
        [TestCase(5)]  [TestCase(6)]  [TestCase(7)]  [TestCase(8)]  [TestCase(9)]
        [TestCase(10)] [TestCase(11)] [TestCase(12)] [TestCase(13)] [TestCase(14)]
        [TestCase(15)] [TestCase(16)] [TestCase(17)] [TestCase(18)] [TestCase(19)]
        [TestCase(20)] [TestCase(21)] [TestCase(22)] [TestCase(23)] [TestCase(24)]
        [TestCase(25)] [TestCase(26)] [TestCase(27)] [TestCase(28)] [TestCase(29)]
        public void Civ_Replay_BitExactParity(int index)
        {
            var sc = (JObject)_golden["scenarios"][index];
            var inp = (JObject)sc["input"];
            var name = sc["name"].Value<string>();
            SetupWorld(inp);
            var A = _fx.Arena;
            var ticks = (JArray)sc["output"];
            for (int t = 0; t < ticks.Count; t++)
            {
                var want = (JObject)ticks[t];
                int rc = WbUnits.UnitsBatch(0, 0);
                Assert.AreEqual(want["rc"].Value<int>(), rc, $"{name} tick{t} rc");
                Assert.AreEqual((ulong)want["rng"].Value<uint>(), A.U64At(WbConstants.OFF_RNGS, 0), $"{name} tick{t} RNG");
                Assert.AreEqual((ulong)want["tick"].Value<uint>(), A.U64At(WbConstants.OFF_TICK, 0), $"{name} tick{t} TICK");
                Assert.AreEqual((int)want["actN"], A.I32At(WbConstants.OFF_ACTN, 0), $"{name} tick{t} ACTN");
                Assert.AreEqual((int)want["dlistN"], A.I32At(WbConstants.OFF_DLISTN, 0), $"{name} tick{t} DLISTN");
                Assert.AreEqual(want["batchR"].Value<uint>(), A.U32At(WbConstants.OFF_BATCHR, 0), $"{name} tick{t} BATCHR");
                Assert.AreEqual(want["bailK"].Value<uint>(), A.U32At(WbConstants.OFF_BAILK, 0), $"{name} tick{t} BAILK");
                // 火
                Assert.AreEqual(want["fireN"].Value<int>(), A.I32At(WbConstants.OFF_FIREN, 0), $"{name} tick{t} FIREN");
                if (want["fireG"] != null)
                    for (int k = 0; k < want["fireG"].Count(); k++)
                        Assert.AreEqual((int)want["fireG"][k], A.U8At(WbConstants.OFF_FIREG, inp["fireProbe"][k].Value<int>()), $"{name} tick{t} FIREG[{k}]");
                // 建筑表逐位
                Assert.AreEqual(want["bldn"].Value<int>(), A.I32At(WbConstants.OFF_BLDN, 0), $"{name} tick{t} BLDN");
                var wantBlds = (JArray)want["blds"];
                for (int r = 0; r < wantBlds.Count; r++)
                {
                    var wb2 = (JObject)wantBlds[r];
                    Assert.AreEqual(wb2["tile"].Value<int>(), A.I32At(WbConstants.OFF_BLDI, r), $"{name} tick{t} BLD[{r}] tile");
                    Assert.AreEqual(wb2["civ"].Value<int>(), A.I32At(WbConstants.OFF_BLDC, r), $"{name} tick{t} BLD[{r}] civ");
                    Assert.AreEqual(BitsOf(wb2["hp"].ToString()), A.U64At(WbConstants.OFF_BLDHP, r), $"{name} tick{t} BLD[{r}] hp");
                }
                // BIDX 探针
                if (want["bidx"] != null)
                    for (int k = 0; k < want["bidx"].Count(); k++)
                        Assert.AreEqual(want["bidx"][k].Value<int>(), A.I32At(WbConstants.OFF_BIDX, inp["bidxProbe"][k].Value<int>()), $"{name} tick{t} BIDX[{k}]");
                // 损坏集
                Assert.AreEqual(want["dmgn"].Value<int>(), A.I32At(WbConstants.OFF_DMGN, 0), $"{name} tick{t} DMGN");
                for (int k = 0; k < want["dmgl"].Count(); k++)
                    Assert.AreEqual(want["dmgl"][k].Value<int>(), A.I32At(WbConstants.OFF_DMGL, k), $"{name} tick{t} DMGL[{k}]");
                // CNT 计数器
                for (int k = 0; k < 4; k++)
                    Assert.AreEqual(BitsOf(want["cnt"][k].ToString()), A.U64At(WbConstants.OFF_CNT, k), $"{name} tick{t} CNT[{k}]");
                // 文明财富
                Assert.AreEqual(BitsOf(want["cvgld0"].ToString()), A.U64At(WbConstants.OFF_CVGLD, 0), $"{name} tick{t} CVGLD[0]");
                Assert.AreEqual(BitsOf(want["cvgld1"].ToString()), A.U64At(WbConstants.OFF_CVGLD, 1), $"{name} tick{t} CVGLD[1]");
                // ACT 缓冲
                var actBase = A.Offs[WbConstants.OFF_ACT];
                int actLen = Math.Min((int)want["actN"], 512);
                Assert.AreEqual(want["actHex"]?.Value<string>() ?? "", WbGoldenFixture.Hex(A.Arena, actBase, actLen), $"{name} tick{t} ACT bytes");
                // 单位字段逐位
                var wantUnits = (JArray)want["units"];
                foreach (var eu in wantUnits)
                {
                    int s = eu["slot"].Value<int>();
                    Assert.AreEqual(eu["race"].Value<uint>(), A.U32At(WbConstants.OFF_URACE, s), $"{name} tick{t} u{s} race");
                    Assert.AreEqual(eu["dead"].Value<int>(), A.U8At(WbConstants.OFF_UDEAD, s), $"{name} tick{t} u{s} dead");
                    Assert.AreEqual(eu["job"].Value<int>(), A.I32At(WbConstants.OFF_UJOB, s), $"{name} tick{t} u{s} job");
                    Assert.AreEqual(eu["flip"].Value<int>(), A.U8At(WbConstants.OFF_UFLIP, s), $"{name} tick{t} u{s} flip");
                    foreach (var fld in new[]
                    {
                        new[] { "x", WbConstants.OFF_UX }, new[] { "y", WbConstants.OFF_UY },
                        new[] { "tx", WbConstants.OFF_UTX }, new[] { "ty", WbConstants.OFF_UTY },
                        new[] { "cd", WbConstants.OFF_UCD }, new[] { "atk", WbConstants.OFF_UATK },
                        new[] { "cvn", WbConstants.OFF_UCVN }, new[] { "dmg", WbConstants.OFF_UDMG },
                        new[] { "hp", WbConstants.OFF_UHP },
                    })
                        Assert.AreEqual(BitsOf(eu[fld[0]].ToString()), A.U64At(fld[1], s), $"{name} tick{t} u{s} {fld[0]}");
                }
                // 宿主协议步进（parity 翻转 + UCELL/UPAR 重排 + PackEnd）
                A.SetU8(WbConstants.OFF_PAR, 0, (byte)(A.U8At(WbConstants.OFF_PAR, 0) ^ 1));
                foreach (var u in inp["units"])
                {
                    int s = u["slot"].Value<int>();
                    if (A.U8At(WbConstants.OFF_UDEAD, s) != 0) continue;
                    double x = A.F64At(WbConstants.OFF_UX, s);
                    double y = A.F64At(WbConstants.OFF_UY, s);
                    A.SetU32(WbConstants.OFF_UCELL, s, (uint)((int)Math.Floor(y / 4.0) * WbConstants.W + (int)Math.Floor(x / 4.0)));
                    A.SetU8(WbConstants.OFF_UPAR, s, A.U8At(WbConstants.OFF_PAR, 0));
                }
                A.PackEnd((uint)inp["units"].Count());
            }
        }
    }

    // ============================================================
    // Test 9 — M-U3b civsTick 领土与建造核 黄金回放（gen-units-civtick.mjs）
    // 蓝本: engine.ts civsTick 族（WbWorld 托管态 + WbCivSim 机械翻译）
    // 回放: 夹具重放（terrainRle/laws/civs+owner/units+补王/buildings/rel/tension/met/rngA0/eventSeq0）
    //       → 每 tick（%5==0 rebuild → CivsTick）→ trace 全字段逐位
    // ============================================================
    [TestFixture]
    public class WbCivTickGoldenTests
    {
        private static JObject LoadCivTick()
        {
            string path = WbCivTickPath("units_civtick.json");
            Assert.IsTrue(File.Exists(path), $"golden json not found: {path}");
            return JsonConvert.DeserializeObject<JObject>(File.ReadAllText(path));
        }

        private static string WbCivTickPath(string fileName)
        {
            string[] candidates =
            {
                "Assets/StreamingAssets/WbGolden/" + fileName,
                Path.Combine(TestContext.CurrentContext.TestDirectory, "Assets/StreamingAssets/WbGolden/" + fileName),
                Path.Combine(Directory.GetParent("Assets").FullName, "Assets/StreamingAssets/WbGolden/" + fileName),
            };
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return candidates[0];
        }

        /// double → 8 字节小端 hex（gen f64hex 同构：DataView LE）
        private static string F64Hex(double v)
        {
            long bits = BitConverter.DoubleToInt64Bits(v);
            var sb = new StringBuilder(16);
            for (int i = 0; i < 8; i++) sb.Append(((byte)(bits >> (i * 8))).ToString("x2"));
            return sb.ToString();
        }

        private static string JHex(JToken tok) => tok == null || tok.Type == JTokenType.Null ? F64Hex(0) : tok.ToString();

        [Test]
        public void Test9_CivTick_Golden()
        {
            var golden = LoadCivTick();
            var meta = golden["meta"];
            Assert.AreEqual(256, meta["W"].Value<int>(), "meta W");
            Assert.AreEqual(160, meta["H"].Value<int>(), "meta H");
            Assert.AreEqual(4, meta["houseCap"].Value<int>(), "meta HOUSE_CAP");
            var scenarios = (JArray)golden["scenarios"];
            Assert.AreEqual(57, scenarios.Count, "scenario count");
            foreach (var sc in scenarios) RunScenario(sc);
        }

        private void RunScenario(JObject sc)
        {
            string name = sc["name"].ToString();
            WbCivSim.ClearTechModCache(); // 静态科技缓存跨场景污染防护（transcript techModCache.clear 同构）
            var w = new WbWorld();

            // —— rngA0 / 序列初值（generate 残留对齐）——
            w.rngA = unchecked((uint)sc["rngA0"].Value<long>());
            w.eventSeq = sc["eventSeq0"].Value<int>();
            w.toastSeq = sc["toastSeq0"].Value<int>();

            // —— terrain RLE 解码（generate 底图 + paint 夹具）——
            var rle = (JArray)sc["terrainRle"];
            int pos = 0;
            for (int k = 0; k < rle.Count; k += 2)
            {
                byte v = (byte)rle[k].Value<int>();
                int run = rle[k + 1].Value<int>();
                for (int j = 0; j < run && pos < WbWorld.W * WbWorld.H; j++) w.terrain[pos++] = v;
            }
            Assert.AreEqual(WbWorld.W * WbWorld.H, pos, $"{name} terrain RLE 全量覆盖");

            // —— laws 覆写 ——
            var laws = sc["laws"];
            w.laws.wars = laws["wars"].Value<bool>();
            w.laws.cityGrowth = laws["cityGrowth"].Value<bool>();
            w.laws.rebels = laws["rebels"].Value<bool>();

            // —— civ 夹具（gen mkCiv 同构）——
            var civs = (JArray)sc["fixture"]["civs"];
            foreach (var c in civs)
            {
                var civ = new WbCiv
                {
                    id = c["id"].Value<int>(),
                    name = c["name"]?.ToString() ?? $"C{c["id"].Value<int>()}",
                    race = c["race"]?.Value<int>() ?? 0,
                    pop = c["pop"]?.Value<int>() ?? 0,
                    houses = c["houses"]?.Value<int>() ?? 0,
                    capital = c["capital"]?.Value<int>() ?? -1,
                    alive = c["alive"] == null || c["alive"].Value<bool>(),
                    gold = c["gold"]?.Value<double>() ?? 0,
                    knowledge = c["knowledge"]?.Value<double>() ?? 0,
                    kingId = (c["kingId"] == null || c["kingId"].Type == JTokenType.Null) ? (int?)null : c["kingId"].Value<int>(),
                    armyCd = (c["armyCd"] == null || c["armyCd"].Type == JTokenType.Null) ? (int?)null : c["armyCd"].Value<int>(),
                    kingName = c["kingName"]?.ToString() ?? "K",
                    banner = c["banner"]?.ToString() ?? "B",
                    colonizeCd = c["colonizeCd"]?.Value<int>() ?? 0,
                    stability = c["stability"]?.Value<double>() ?? 70,
                    culture = c["culture"]?.Value<double>() ?? 0,
                    militarism = c["militarism"]?.Value<double>() ?? 30,
                    gov = c["gov"]?.Value<int>() ?? 0,
                };
                if (c["popZeroTick"] != null && c["popZeroTick"].Type != JTokenType.Null) civ.popZeroTick = c["popZeroTick"].Value<int>();
                if (c["mobilizeUntil"] != null && c["mobilizeUntil"].Type != JTokenType.Null) civ.mobilizeUntil = c["mobilizeUntil"].Value<double>();
                // M-U3f：research/researchP 夹具（CVT49 知识注入完成场景）
                if (c["research"] != null && c["research"].Type != JTokenType.Null) civ.research = c["research"].ToString();
                if (c["researchP"] != null && c["researchP"].Type != JTokenType.Null) civ.researchP = c["researchP"].Value<double>();
                if (c["techs"] != null && c["techs"].Type != JTokenType.Null)
                    foreach (var t in (JArray)c["techs"]) civ.techs.Add(t.ToString());
                if (c["ideas"] != null && c["ideas"].Type != JTokenType.Null)
                {
                    civ.ideas = new List<string>();
                    foreach (var t in (JArray)c["ideas"]) civ.ideas.Add(t.ToString());
                }
                if (c["tiles"] != null) foreach (var t in (JArray)c["tiles"]) civ.tiles.Add(t.Value<int>());
                if (c["frontier"] != null) foreach (var f in (JArray)c["frontier"]) civ.frontier.Add(f.Value<int>());
                w.civs.Add(civ);
                while (w.civs.Count <= civ.id) w.civs.Add(null); // dense 补洞
                if (w.civs[civ.id] == null) w.civs[civ.id] = civ; // dense 直索引（engine L1595 同构）
                w.civSeq = System.Math.Max(w.civSeq, civ.id + 1); // gen mkCiv civSeq 游标同步（createCiv id 不撞车）
                // owner 同步（gen mkCiv 夹具语义）
                foreach (int i in civ.tiles) w.owner[i] = (short)civ.id;
            }

            // —— units 夹具 ——
            var units = (JArray)sc["fixture"]["units"];
            foreach (var u in units) PutWorldUnit(w, u);

            // —— 在位王补夹具（gen runScenario 同构：pop>0 alive 且无王 → id 1000+ 殿后；noAutoKing 场景跳过）——
            if (sc["fixture"]["noAutoKing"] == null || sc["fixture"]["noAutoKing"].Type == JTokenType.Null || !sc["fixture"]["noAutoKing"].Value<bool>())
            {
            int kingSeq = 1000;
            foreach (var civ in w.civs)
            {
                if (civ == null || !civ.alive || civ.pop <= 0) continue;
                if (civ.kingId != null && civ.kingId != -1) continue;
                int wid = kingSeq++;
                int t0 = civ.tiles.Count > 0 ? civ.tiles[0] : 0;
                PutWorldUnit(w, new JObject
                {
                    ["id"] = wid,
                    ["civ"] = civ.id,
                    ["x"] = t0 % 256 + 0.5,
                    ["y"] = (t0 / 256 | 0) + 0.5,
                    ["king"] = 1,
                });
                civ.kingId = wid;
            }
            }

            // —— directives/alliances/wars 夹具（M-U3c）——
            if (sc["fixture"]["directives"] != null)
                foreach (var d in (JArray)sc["fixture"]["directives"])
                {
                    w.directives.Add(new WbDirective
                    {
                        id = d["id"]?.Value<int>() ?? w.directives.Count,
                        civ = d["civ"].Value<int>(),
                        kind = d["kind"].ToString(),
                        target = (d["target"] == null || d["target"].Type == JTokenType.Null) ? (int?)null : d["target"].Value<int>(),
                        param = d["param"]?.Value<int>() ?? 0,
                        status = d["status"]?.ToString() ?? "active",
                        startTick = d["startTick"]?.Value<int>() ?? 0,
                        deadlineTick = d["deadlineTick"]?.Value<int>() ?? 0,
                        text = d["text"]?.ToString() ?? "",
                    });
                    w.dirSeq = System.Math.Max(w.dirSeq, d["id"]?.Value<int>() != null ? d["id"].Value<int>() + 1 : w.directives.Count); // gen mkDirective 游标同步
                }
            if (sc["fixture"]["alliances"] != null)
                foreach (var al in (JArray)sc["fixture"]["alliances"])
                {
                    var a2 = new WbAlliance
                    {
                        id = al["id"].Value<int>(),
                        name = al["name"]?.ToString() ?? $"A{al["id"].Value<int>()}",
                        leader = al["leader"]?.Value<int>() ?? al["members"][0].Value<int>(),
                        cohesion = al["cohesion"]?.Value<double>() ?? 55,
                        formedTick = al["formedTick"]?.Value<long>() ?? 0,
                        formedYear = al["formedYear"]?.Value<int>() ?? 0,
                        warsTogether = al["warsTogether"]?.Value<int>() ?? 0,
                        colorHex = al["colorHex"]?.ToString() ?? "#14b8a6",
                        bonded = al["bonded"] != null && al["bonded"].Type != JTokenType.Null && al["bonded"].Value<bool>(),
                    };
                    foreach (var m in (JArray)al["members"]) a2.members.Add(m.Value<int>());
                    w.alliances.Add(a2);
                    foreach (int m in a2.members) w.allianceOf[m] = a2.id;
                }
            if (sc["fixture"]["wars"] != null)
                foreach (var wd in (JArray)sc["fixture"]["wars"])
                    w.warData[wd["key"].ToString()] = new WbWarData
                    {
                        key = wd["key"].ToString(),
                        a = wd["a"].Value<int>(), b = wd["b"].Value<int>(),
                        startTick = wd["startTick"]?.Value<int>() ?? 0,
                        startYear = wd["startYear"]?.Value<int>() ?? 0,
                        total = wd["total"]?.Value<bool>() ?? false,
                        giveUpAt = wd["giveUpAt"]?.Value<int>() ?? 0,
                        reason = wd["reason"]?.ToString() ?? "border",
                        reasonText = wd["reasonText"]?.ToString() ?? "",
                        aggressor = wd["aggressor"]?.Value<int>() ?? 0,
                        goal = wd["goal"]?.Value<int>() ?? 0,
                        popA0 = wd["popA0"]?.Value<int>() ?? 0,
                        popB0 = wd["popB0"]?.Value<int>() ?? 0,
                        lastActiveTick = wd["lastActiveTick"]?.Value<int>() ?? 0,
                    };

            // —— M-U3f armies/emIdeas/homogeneity/seasonOffset 夹具（gen runScenario 同构）——
            if (sc["fixture"]["armies"] != null)
                foreach (var ar in (JArray)sc["fixture"]["armies"])
                {
                    var a = new WbArmy
                    {
                        id = ar["id"].Value<int>(), civ = ar["civ"].Value<int>(),
                        name = ar["name"]?.ToString() ?? $"A{ar["id"].Value<int>()}",
                        leaderId = ar["leaderId"]?.Value<int>() ?? -1,
                        x = ar["x"]?.Value<double>() ?? 0, y = ar["y"]?.Value<double>() ?? 0,
                        tx = ar["tx"]?.Value<double>() ?? ar["x"]?.Value<double>() ?? 0,
                        ty = ar["ty"]?.Value<double>() ?? ar["y"]?.Value<double>() ?? 0,
                        state = ar["state"]?.ToString() ?? "rally", morale = ar["morale"]?.Value<double>() ?? 1,
                        kills = ar["kills"]?.Value<double>() ?? 0, losses = ar["losses"]?.Value<double>() ?? 0,
                        tactical = ar["tactical"]?.Value<bool>() ?? false,
                    };
                    if (ar["members"] != null) foreach (var m in (JArray)ar["members"]) a.members.Add(m.Value<int>());
                    w.armies.Add(a);
                }
            if (sc["fixture"]["emIdeas"] != null)
                foreach (var id_ in (JArray)sc["fixture"]["emIdeas"])
                {
                    var idea = new WbIdea { key = id_["key"].ToString(), name = id_["name"]?.ToString() ?? $"I{id_["key"]}", desc = id_["desc"]?.ToString() ?? "", mods = new WbIdeaMods() };
                    var md = id_["mods"];
                    if (md != null)
                    {
                        if (md["gold"] != null && md["gold"].Type != JTokenType.Null) idea.mods.gold = md["gold"].Value<double>();
                        if (md["stab"] != null && md["stab"].Type != JTokenType.Null) idea.mods.stab = md["stab"].Value<double>();
                        if (md["mil"] != null && md["mil"].Type != JTokenType.Null) idea.mods.mil = md["mil"].Value<double>();
                        if (md["know"] != null && md["know"].Type != JTokenType.Null) idea.mods.know = md["know"].Value<double>();
                        if (md["repro"] != null && md["repro"].Type != JTokenType.Null) idea.mods.repro = md["repro"].Value<double>();
                        if (md["wear"] != null && md["wear"].Type != JTokenType.Null) idea.mods.wear = md["wear"].Value<double>();
                    }
                    w.emIdeas[idea.key] = idea;
                    if (idea.key.StartsWith("id") && int.TryParse(idea.key.Substring(2), out int nId))
                        w.ideaSeq = System.Math.Max(w.ideaSeq, nId + 1);
                }
            if (sc["fixture"]["homogeneity"] != null)
                foreach (var h in (JArray)sc["fixture"]["homogeneity"])
                    w.civHomogeneity[h[0].Value<int>()] = h[1].Value<double>();
            if (sc["fixture"]["seasonOffset"] != null && sc["fixture"]["seasonOffset"].Type != JTokenType.Null)
                w.seasonOffset = sc["fixture"]["seasonOffset"].Value<int>();

            // —— rel/tension/met/buildings 夹具 ——
            if (sc["fixture"]["rel"] != null)
                foreach (var r in (JArray)sc["fixture"]["rel"])
                {
                    int a = r[0].Value<int>(), b = r[1].Value<int>(), v = r[2].Value<int>();
                    w.rel[WbWorld.PairKey(a, b)] = v;
                }
            if (sc["fixture"]["tension"] != null)
                foreach (var r in (JArray)sc["fixture"]["tension"])
                {
                    int a = r[0].Value<int>(), b = r[1].Value<int>(), v = r[2].Value<int>();
                    w.tension[WbWorld.PairKey(a, b)] = v;
                }
            if (sc["fixture"]["met"] != null)
                foreach (var m in (JArray)sc["fixture"]["met"]) w.met.Add(m.ToString());
            if (sc["fixture"]["buildings"] != null)
                foreach (var b in (JArray)sc["fixture"]["buildings"])
                {
                    // gen mkBuilding0 同构（不经 buildBuilding：rng/连路无扰动，黄金基线由夹具定）
                    int i = b[0].Value<int>(), kind = b[1].Value<int>(), civId = b[2].Value<int>();
                    var bb = new WbBuilding { i = i, x = i % WbWorld.W, y = i / WbWorld.W, kind = kind, civ = civId };
                    w.buildings.Add(bb);
                    w.bIdx[i] = w.buildings.Count - 1;
                    w.building[i] = (byte)kind;
                    w.bHp[i] = WbCivSim.BUILDING_DEFS[kind].hp;
                    var civ = WbCivSim.CivAt(w, civId);
                    if (civ != null && kind != WbCivSim.BUILD_KINDS.WALL) civ.houses++;
                }

            // —— 驱动 + 逐 tick 断言 ——
            w.tickCount = sc["startTick"].Value<int>();
            var traces = (JArray)sc["traces"];
            bool hostTicks = sc["fixture"]["hostTicks"] != null && sc["fixture"]["hostTicks"].Type != JTokenType.Null && sc["fixture"]["hostTicks"].Value<bool>();
            var issues = (JArray)(sc["fixture"]["issue"] ?? new JArray());
            var funds = (JArray)(sc["fixture"]["fund"] ?? new JArray());
            for (int t = 0; t < traces.Count; t++)
            {
                var want = (JObject)traces[t];
                if (w.tickCount % 5 == 0) WbCivSim.RebuildCivBuildCounts(w);
                WbCivSim.CivsTick(w);
                if (hostTicks)
                {
                    // M-U3d/M-U3e 宿主子系统协议：issue（civsTick 后任意时点）→ fund 直调 → %30 旨意 → %120 科技 → %300 联盟
                    foreach (var iss in issues)
                        if (iss["at"].Value<int>() == t)
                            WbCivSim.IssueDirective(w, iss["civ"].Value<int>(), iss["kind"].ToString(), iss["param"]?.Value<int>() ?? 0,
                                (iss["target"] == null || iss["target"].Type == JTokenType.Null) ? (int?)null : iss["target"].Value<int>());
                    foreach (var fd in funds)
                        if (fd["at"].Value<int>() == t)
                            WbCivSim.FundResearch(w, WbCivSim.CivAt(w, fd["civ"].Value<int>()), fd["points"].Value<double>());
                    if (w.tickCount % 120 == 0) WbCivSim.EconomyTick(w); // engine L2535（M-U3f：directiveTick 前）
                    if (w.tickCount % 30 == 0) WbCivSim.DirectiveTick(w);
                    if (w.tickCount % 120 == 5) WbCivSim.TechTick(w);
                    if (w.tickCount % 150 == 7) WbCivSim.SocietyTick(w); // engine L2569（M-U3f：techTick 后 allianceTick 前）
                    if (w.tickCount % 300 == 23) WbCivSim.AllianceTick(w);
                }
                w.tickCount++;
                AssertTrace(w, want, name, t);
            }
        }

        private static void PutWorldUnit(WbWorld w, JObject o)
        {
            var u = new WbU
            {
                id = o["id"].Value<int>(),
                race = o["race"]?.Value<int>() ?? 0,
                civ = o["civ"]?.Value<int>() ?? -1,
                x = o["x"].Value<double>(),
                y = o["y"].Value<double>(),
                tx = o["x"].Value<double>(),
                ty = o["y"].Value<double>(),
                hp = o["hp"]?.Value<double>() ?? 10,
                maxHp = o["hp"]?.Value<double>() ?? 10,
                job = o["job"]?.Value<int>() ?? 0,
                king = o["king"]?.Value<int>() ?? 0,
                dead = o["dead"]?.Value<int>() ?? 0,
                boat = o["boat"]?.Value<int>() ?? 0,
                caravan = o["caravan"]?.Value<int>() ?? 0,
                name = $"u{o["id"].Value<int>()}",
            };
            w.units.Add(u);
            w.unitById[u.id] = u;
        }

        private static void AssertTrace(WbWorld w, JObject want, string name, int t)
        {
            string ctx = $"{name} tick{t}";
            Assert.AreEqual((uint)want["rngA"].Value<long>(), w.rngA, $"{ctx} rngA");
            Assert.AreEqual(want["tickCount"].Value<int>(), w.tickCount, $"{ctx} tickCount");
            Assert.AreEqual(want["statCivsFallen"].Value<int>(), w.statCivsFallen, $"{ctx} statCivsFallen");

            // civs 全字段（数组序 + tiles/frontier 逐元素）
            var wantCivs = (JArray)want["civs"];
            var liveCivs = new List<WbCiv>();
            foreach (var c in w.civs) if (c != null) liveCivs.Add(c);
            Assert.AreEqual(wantCivs.Count, liveCivs.Count, $"{ctx} civs count");
            for (int c = 0; c < wantCivs.Count; c++)
            {
                var wc = (JObject)wantCivs[c];
                var gc = liveCivs[c];
                Assert.AreEqual(wc["id"].Value<int>(), gc.id, $"{ctx} civ{id} id");
                string cid = $"{ctx} civ{gc.id}";
                Assert.AreEqual(wc["pop"].Value<int>(), gc.pop, $"{cid} pop");
                Assert.AreEqual(wc["houses"].Value<int>(), gc.houses, $"{cid} houses");
                Assert.AreEqual(wc["capital"].Value<int>(), gc.capital, $"{cid} capital");
                Assert.AreEqual(wc["alive"].Value<bool>(), gc.alive, $"{cid} alive");
                Assert.AreEqual(wc["gold"].Type == JTokenType.Null ? 0 : wc["gold"].Value<double>(), gc.gold ?? 0, 1e-9, $"{cid} gold");
                Assert.AreEqual(wc["knowledge"].Type == JTokenType.Null ? 0 : wc["knowledge"].Value<double>(), gc.knowledge ?? 0, 1e-9, $"{cid} knowledge");
                Assert.AreEqual(wc["colonizeCd"].Type == JTokenType.Null ? 0 : wc["colonizeCd"].Value<int>(), gc.colonizeCd, $"{cid} colonizeCd");
                if (wc["popZeroTick"].Type == JTokenType.Null) Assert.IsFalse(gc.popZeroTick.HasValue, $"{cid} popZeroTick null");
                else Assert.AreEqual(wc["popZeroTick"].Value<int>(), gc.popZeroTick.Value, $"{cid} popZeroTick");
                if (wc["mobilizeUntil"].Type == JTokenType.Null) Assert.IsFalse(gc.mobilizeUntil.HasValue, $"{cid} mobilizeUntil null");
                else Assert.AreEqual(wc["mobilizeUntil"].Value<double>(), gc.mobilizeUntil.Value, 1e-9, $"{cid} mobilizeUntil");
                Assert.AreEqual(wc["stability"].Type == JTokenType.Null ? 70 : wc["stability"].Value<double>(), gc.stability, 1e-9, $"{cid} stability");
                Assert.AreEqual(wc["culture"].Type == JTokenType.Null ? 0 : wc["culture"].Value<double>(), gc.culture, 1e-9, $"{cid} culture");
                if (wc["militarism"].Type == JTokenType.Null) Assert.IsFalse(gc.militarism.HasValue, $"{cid} militarism null");
                else Assert.AreEqual(wc["militarism"].Value<double>(), gc.militarism.Value, 1e-9, $"{cid} militarism");
                // M-U3f：经济/社会域四字段 + ideas 断言
                Assert.AreEqual(wc["income"].Type == JTokenType.Null ? 0 : wc["income"].Value<int>(), gc.income, $"{cid} income");
                Assert.AreEqual(wc["expense"].Type == JTokenType.Null ? 0 : wc["expense"].Value<double>(), gc.expense, 1e-9, $"{cid} expense");
                Assert.AreEqual(wc["festivalCd"].Type == JTokenType.Null ? 0 : wc["festivalCd"].Value<int>(), gc.festivalCd, $"{cid} festivalCd");
                Assert.AreEqual(wc["govYear"].Type == JTokenType.Null ? 0 : wc["govYear"].Value<int>(), gc.govYear, $"{cid} govYear");
                if (wc["ideas"] == null || wc["ideas"].Type == JTokenType.Null) Assert.IsNull(gc.ideas, $"{cid} ideas null");
                else
                {
                    var wid2 = (JArray)wc["ideas"];
                    Assert.AreEqual(wid2.Count, gc.ideas.Count, $"{cid} ideas count");
                    for (int k = 0; k < wid2.Count; k++) Assert.AreEqual(wid2[k].ToString(), gc.ideas[k], $"{cid} ideas[{k}]");
                }
                // M-U3e：research/researchP/techs 断言
                if (wc["research"] == null || wc["research"].Type == JTokenType.Null) Assert.IsNull(gc.research, $"{cid} research null");
                else Assert.AreEqual(wc["research"].ToString(), gc.research, $"{cid} research");
                Assert.AreEqual(wc["researchP"] == null || wc["researchP"].Type == JTokenType.Null ? 0 : wc["researchP"].Value<double>(), gc.researchP, 1e-9, $"{cid} researchP");
                var wtks = (JArray)wc["techs"];
                Assert.AreEqual(wtks.Count, gc.techs.Count, $"{cid} techs count");
                for (int k = 0; k < wtks.Count; k++) Assert.AreEqual(wtks[k].ToString(), gc.techs[k], $"{cid} techs[{k}]");
                // kingId undefined/-1 语义分离断言移至 M-U3c 段（下方 null→false / 值→相等）
                Assert.AreEqual(wc["name"].ToString(), gc.name, $"{cid} name");
                // tiles / frontier 逐元素
                var wt = (JArray)wc["tiles"];
                Assert.AreEqual(wt.Count, gc.tiles.Count, $"{cid} tiles count");
                for (int k = 0; k < wt.Count; k++) Assert.AreEqual(wt[k].Value<int>(), gc.tiles[k], $"{cid} tiles[{k}]");
                var wf = (JArray)wc["frontier"];
                Assert.AreEqual(wf.Count, gc.frontier.Count, $"{cid} frontier count");
                for (int k = 0; k < wf.Count; k++) Assert.AreEqual(wf[k].Value<int>(), gc.frontier[k], $"{cid} frontier[{k}]");
            }

            // buildings 全量
            var wantB = (JArray)want["buildings"];
            Assert.AreEqual(wantB.Count, w.buildings.Count, $"{ctx} buildings count");
            for (int b = 0; b < wantB.Count; b++)
            {
                var wb = (JObject)wantB[b];
                Assert.AreEqual(wb["i"].Value<int>(), w.buildings[b].i, $"{ctx} bld{b} i");
                Assert.AreEqual(wb["kind"].Value<int>(), w.buildings[b].kind, $"{ctx} bld{b} kind");
                Assert.AreEqual(wb["civ"].Value<int>(), w.buildings[b].civ, $"{ctx} bld{b} civ");
            }

            // bHp / civBuildCounts / marketIdx
            var wantHp = (JArray)want["bHp"];
            Assert.AreEqual(wantHp.Count, w.bHp.Count, $"{ctx} bHp count");
            var hpSorted = new List<KeyValuePair<int, double>>(w.bHp);
            hpSorted.Sort((a, b) => a.Key.CompareTo(b.Key)); // JS Map 迭代序 = 插入序；C# Dict 无序 → 键序对账（黄金插入序即键增序近似——回放重放插入序）
            for (int k = 0; k < wantHp.Count; k++)
                Assert.AreEqual(wantHp[k][0].Value<int>(), hpSorted[k].Key, $"{ctx} bHp[{k}] key");
            var wantCounts = (JArray)want["civBuildCounts"];
            Assert.AreEqual(wantCounts.Count, w.civBuildCounts.Count, $"{ctx} civBuildCounts count");
            foreach (var kv in WantCountsDict(want))
            {
                int[] arr;
                Assert.IsTrue(w.civBuildCounts.TryGetValue(int.Parse(kv.Key), out arr), $"{ctx} civBuildCounts[{kv.Key}] exists");
                for (int k = 0; k < kv.Value.Count; k++) Assert.AreEqual(kv.Value[k].Value<int>(), arr[k], $"{ctx} civBuildCounts[{kv.Key}][{k}]");
            }
            var wantMkt = (JArray)want["marketIdx"];
            Assert.AreEqual(wantMkt.Count, w.marketIdx.Count, $"{ctx} marketIdx count");

            // 数组 diff（owner/building/road/occCiv）
            AssertDiff(want["ownerDiff"], i => w.owner[i], $"{ctx} ownerDiff");
            AssertDiff(want["buildingDiff"], i => w.building[i], $"{ctx} buildingDiff");
            AssertDiff(want["roadDiff"], i => w.road[i], $"{ctx} roadDiff");
            AssertDiff(want["occCivDiff"], i => w.occCiv[i], $"{ctx} occCivDiff");

            // dirty/propsDirty
            AssertSet((JArray)want["dirty"], w.dirty, $"{ctx} dirty");
            AssertSet((JArray)want["propsDirty"], w.propsDirty, $"{ctx} propsDirty");

            // effects 全字段（f64 hex 逐位）
            var wantFx = (JArray)want["effects"];
            Assert.AreEqual(wantFx.Count, w.effects.Count, $"{ctx} effects count");
            for (int e = 0; e < wantFx.Count; e++)
            {
                var we = (JObject)wantFx[e];
                var ge = w.effects[e];
                Assert.AreEqual(we["kind"].ToString(), ge.kind, $"{ctx} fx{e} kind");
                Assert.AreEqual(JHex(we["x"]), F64Hex(ge.x), $"{ctx} fx{e} x bits");
                Assert.AreEqual(JHex(we["y"]), F64Hex(ge.y), $"{ctx} fx{e} y bits");
                Assert.AreEqual(JHex(we["ttl"]), F64Hex(ge.ttl), $"{ctx} fx{e} ttl bits");
                Assert.AreEqual((int)we["seed"], ge.seed, $"{ctx} fx{e} seed");
                Assert.AreEqual(JHex(we["dir"]), F64Hex(ge.dir), $"{ctx} fx{e} dir bits");
            }

            // newEvents（id/year/kind/text/colorHex/x/y bits）
            var wantEv = (JArray)want["newEvents"];
            Assert.AreEqual(wantEv.Count, w.worldEvents.Count, $"{ctx} newEvents count");
            for (int e = 0; e < wantEv.Count; e++)
            {
                var we = (JObject)wantEv[e];
                // worldEvents unshift：新在前 —— want newEvents 按产生序 → 对齐 worldEvents 尾部
                var ge = w.worldEvents[w.worldEvents.Count - wantEv.Count + e];
                Assert.AreEqual(we["id"].Value<int>(), ge.id, $"{ctx} ev{e} id");
                Assert.AreEqual(we["kind"].ToString(), ge.kind, $"{ctx} ev{e} kind");
                Assert.AreEqual(we["text"].ToString(), ge.text, $"{ctx} ev{e} text");
                if (we["x"].Type == JTokenType.Null) Assert.IsFalse(ge.x.HasValue, $"{ctx} ev{e} x null");
                else Assert.AreEqual(JHex(we["x"]), F64Hex(ge.x.Value), $"{ctx} ev{e} x bits");
            }

            // toasts
            var wantToast = (JArray)want["toasts"];
            Assert.AreEqual(wantToast.Count, w.toasts.Count, $"{ctx} toasts count");
            for (int e = 0; e < wantToast.Count; e++)
            {
                var wt2 = (JObject)wantToast[e];
                Assert.AreEqual(wt2["id"].Value<int>(), w.toasts[e].id, $"{ctx} toast{e} id");
                Assert.AreEqual(wt2["text"].ToString(), w.toasts[e].text, $"{ctx} toast{e} text");
                Assert.AreEqual(wt2["tone"].ToString(), w.toasts[e].tone, $"{ctx} toast{e} tone");
            }
            w.toasts.Clear(); // onToast 回调每 tick 清空语义（gen toasts.splice(0)）

            // tension/rel/met
            var wantTen = (JArray)want["tension"];
            Assert.AreEqual(wantTen.Count, w.tension.Count, $"{ctx} tension count");
            var wantRel = (JArray)want["rel"];
            Assert.AreEqual(wantRel.Count, w.rel.Count, $"{ctx} rel count");
            foreach (var r in wantRel)
            {
                Assert.IsTrue(w.rel.ContainsKey(r[0].ToString()), $"{ctx} rel[{r[0]}] exists");
                Assert.AreEqual(r[1].Value<double>(), w.rel[r[0].ToString()], 1e-12, $"{ctx} rel[{r[0]}] value(f64)");
            }
            var wantMet = (JArray)want["met"];
            Assert.AreEqual(wantMet.Count, w.met.Count, $"{ctx} met count");

            // —— M-U3c 扩展段 ——
            // civ 追加字段：kingId undefined/-1 语义分离 + armyCd
            for (int c = 0; c < wantCivs.Count; c++)
            {
                var wc = (JObject)wantCivs[c];
                var gc = liveCivs[c];
                string cid = $"{ctx} civ{gc.id}";
                if (wc["kingId"].Type == JTokenType.Null) Assert.IsFalse(gc.kingId.HasValue, $"{cid} kingId null(undefined)");
                else Assert.AreEqual(wc["kingId"].Value<int>(), gc.kingId.Value, $"{cid} kingId");
                if (wc["armyCd"] != null && wc["armyCd"].Type != JTokenType.Null)
                    Assert.AreEqual(wc["armyCd"].Value<int>(), gc.armyCd ?? 0, $"{cid} armyCd");
                if (wc["mergedInto"] != null && wc["mergedInto"].Type != JTokenType.Null)
                    Assert.AreEqual(wc["mergedInto"].Value<int>(), gc.mergedInto ?? -999, $"{cid} mergedInto");
            }

            // units 全字段（f64 hex 逐位）
            var wantUnits = (JArray)want["units"];
            Assert.AreEqual(wantUnits.Count, w.units.Count, $"{ctx} units count");
            for (int u = 0; u < wantUnits.Count; u++)
            {
                var wu = (JObject)wantUnits[u];
                var gu = w.units[u];
                string uid = $"{ctx} unit[{u}]";
                Assert.AreEqual(wu["id"].Value<int>(), gu.id, $"{uid} id");
                Assert.AreEqual(wu["name"].ToString(), gu.name, $"{uid} name");
                Assert.AreEqual(wu["race"].Value<int>(), gu.race, $"{uid} race");
                Assert.AreEqual(wu["civ"].Value<int>(), gu.civ, $"{uid} civ");
                Assert.AreEqual(JHex(wu["x"]), F64Hex(gu.x), $"{uid} x bits");
                Assert.AreEqual(JHex(wu["y"]), F64Hex(gu.y), $"{uid} y bits");
                Assert.AreEqual(JHex(wu["tx"]), F64Hex(gu.tx), $"{uid} tx bits");
                Assert.AreEqual(JHex(wu["ty"]), F64Hex(gu.ty), $"{uid} ty bits");
                Assert.AreEqual(JHex(wu["hp"]), F64Hex(gu.hp), $"{uid} hp bits");
                Assert.AreEqual(JHex(wu["maxHp"]), F64Hex(gu.maxHp), $"{uid} maxHp bits");
                Assert.AreEqual(JHex(wu["dmg"]), F64Hex(gu.dmg), $"{uid} dmg bits");
                Assert.AreEqual(JHex(wu["speed"]), F64Hex(gu.speed), $"{uid} speed bits");
                Assert.AreEqual(wu["job"].Value<int>(), gu.job, $"{uid} job");
                Assert.AreEqual(wu["king"].Value<int>(), gu.king, $"{uid} king");
                Assert.AreEqual(wu["boat"].Value<int>(), gu.boat, $"{uid} boat");
                Assert.AreEqual(wu["boatTTL"].Value<int>(), gu.boatTTL, $"{uid} boatTTL");
                Assert.AreEqual(wu["dead"].Value<int>(), gu.dead, $"{uid} dead");
            }

            // warData（键序对账——JS Map 插入序 vs C# Dict 无序）
            var wantWars = (JArray)want["warData"];
            Assert.AreEqual(wantWars.Count, w.warData.Count, $"{ctx} warData count");
            var warKeys = new List<string>(w.warData.Keys);
            warKeys.Sort(string.CompareOrdinal);
            for (int k = 0; k < wantWars.Count; k++)
            {
                var wwd = (JObject)wantWars[k];
                var gwd = w.warData[warKeys[k]];
                string wid = $"{ctx} war[{warKeys[k]}]";
                Assert.AreEqual(wwd["a"].Value<int>(), gwd.a, $"{wid} a");
                Assert.AreEqual(wwd["b"].Value<int>(), gwd.b, $"{wid} b");
                Assert.AreEqual(wwd["startTick"].Value<int>(), gwd.startTick, $"{wid} startTick");
                Assert.AreEqual(wwd["total"].Value<bool>(), gwd.total, $"{wid} total");
                Assert.AreEqual(wwd["aggressor"].Value<int>(), gwd.aggressor, $"{wid} aggressor");
                Assert.AreEqual(wwd["reason"].ToString(), gwd.reason, $"{wid} reason");
                Assert.AreEqual(wwd["reasonText"].ToString(), gwd.reasonText, $"{wid} reasonText");
                Assert.AreEqual(wwd["goal"].Value<int>(), gwd.goal, $"{wid} goal");
                Assert.AreEqual(wwd["giveUpAt"].Value<int>(), gwd.giveUpAt, $"{wid} giveUpAt");
                Assert.AreEqual(wwd["popA0"].Value<int>(), gwd.popA0, $"{wid} popA0");
                Assert.AreEqual(wwd["popB0"].Value<int>(), gwd.popB0, $"{wid} popB0");
                Assert.AreEqual(wwd["lastActiveTick"].Value<int>(), gwd.lastActiveTick, $"{wid} lastActiveTick");
            }

            // raceRel（f64 逐位；键序对账）
            var wantRaceRel = (JArray)want["raceRel"];
            Assert.AreEqual(wantRaceRel.Count, w.raceRel.Count, $"{ctx} raceRel count");
            var rrKeys = new List<string>(w.raceRel.Keys);
            rrKeys.Sort(string.CompareOrdinal);
            for (int k = 0; k < wantRaceRel.Count; k++)
            {
                var rr = wantRaceRel[k];
                Assert.AreEqual(rr[0].ToString(), rrKeys[k], $"{ctx} raceRel[{k}] key");
                Assert.AreEqual(rr[1].Value<double>(), w.raceRel[rrKeys[k]], 1e-12, $"{ctx} raceRel[{rrKeys[k]}] value");
            }

            // totalWars/warHistory/statWars/civSeq
            var wantTotal = ((JArray)want["totalWars"]).Select(x => x.ToString()).OrderBy(x => x, string.CompareOrdinal).ToList();
            var gotTotal = w.totalWars.OrderBy(x => x, string.CompareOrdinal).ToList();
            Assert.AreEqual(wantTotal.Count, gotTotal.Count, $"{ctx} totalWars count");
            for (int k = 0; k < wantTotal.Count; k++) Assert.AreEqual(wantTotal[k], gotTotal[k], $"{ctx} totalWars[{k}]");
            var wantHist = (JArray)want["warHistory"];
            Assert.AreEqual(wantHist.Count, w.warHistory.Count, $"{ctx} warHistory count");
            for (int k = 0; k < wantHist.Count; k++) Assert.AreEqual(wantHist[k].Value<int>(), w.warHistory[k], $"{ctx} warHistory[{k}]");
            Assert.AreEqual(want["statWars"].Value<int>(), w.statWars, $"{ctx} statWars");
            Assert.AreEqual(want["civSeq"].Value<int>(), w.civSeq, $"{ctx} civSeq");

            // alliances 全字段
            var wantAl = (JArray)want["alliances"];
            Assert.AreEqual(wantAl.Count, w.alliances.Count, $"{ctx} alliances count");
            var alOrder = w.alliances.OrderBy((a) => a.id).ToList();
            for (int k = 0; k < wantAl.Count; k++)
            {
                var wal = (JObject)wantAl[k];
                var gal = alOrder[k];
                string aid = $"{ctx} alliance[{gal.id}]";
                Assert.AreEqual(wal["name"].ToString(), gal.name, $"{aid} name");
                Assert.AreEqual(wal["leader"].Value<int>(), gal.leader, $"{aid} leader");
                Assert.AreEqual(wal["cohesion"].Value<double>(), gal.cohesion, 1e-9, $"{aid} cohesion(f64)");
                Assert.AreEqual(wal["formedTick"].Value<long>(), gal.formedTick, $"{aid} formedTick");
                Assert.AreEqual(wal["warsTogether"].Value<int>(), gal.warsTogether, $"{aid} warsTogether");
                if (wal["bonded"] != null && wal["bonded"].Type != JTokenType.Null)
                    Assert.AreEqual(wal["bonded"].Value<bool>(), gal.bonded, $"{aid} bonded");
                Assert.AreEqual(((JArray)wal["members"]).Count, gal.members.Count, $"{aid} members count");
                for (int m = 0; m < gal.members.Count; m++)
                    Assert.AreEqual(((JArray)wal["members"])[m].Value<int>(), gal.members[m], $"{aid} members[{m}]");
            }

            // directives 全字段（含 finishDirective 结算态）
            var wantDir = (JArray)want["directives"];
            Assert.AreEqual(wantDir.Count, w.directives.Count, $"{ctx} directives count");
            var dirOrder = w.directives.OrderBy((d) => d.id).ToList();
            for (int k = 0; k < wantDir.Count; k++)
            {
                var wdd = (JObject)wantDir[k];
                var gdd = dirOrder[k];
                string did = $"{ctx} directive[{gdd.id}]";
                Assert.AreEqual(wdd["civ"].Value<int>(), gdd.civ, $"{did} civ");
                Assert.AreEqual(wdd["kind"].ToString(), gdd.kind, $"{did} kind");
                if (wdd["target"].Type == JTokenType.Null) Assert.IsFalse(gdd.target.HasValue, $"{did} target null");
                else Assert.AreEqual(wdd["target"].Value<int>(), gdd.target.Value, $"{did} target");
                Assert.AreEqual(wdd["status"].ToString(), gdd.status, $"{did} status");
                Assert.AreEqual(wdd["param"]?.Value<int>() ?? 0, gdd.param, $"{did} param");
                Assert.AreEqual(wdd["deadlineTick"]?.Value<int>() ?? 0, gdd.deadlineTick, $"{did} deadlineTick");
                Assert.AreEqual(wdd["startTick"]?.Value<int>() ?? 0, gdd.startTick, $"{did} startTick");
                if (wdd["endTick"].Type == JTokenType.Null) Assert.IsFalse(gdd.endTick.HasValue, $"{did} endTick null");
                else Assert.AreEqual(wdd["endTick"].Value<int>(), gdd.endTick.Value, $"{did} endTick");
                if (wdd["endText"].Type == JTokenType.Null) Assert.IsTrue(string.IsNullOrEmpty(gdd.endText), $"{did} endText null");
                else Assert.AreEqual(wdd["endText"].ToString(), gdd.endText, $"{did} endText");
            }

            // evoNodes（society/物种图谱——id 序对账）
            var wantEvo = (JArray)want["evoNodes"];
            Assert.AreEqual(wantEvo.Count, w.evoNodes.Count, $"{ctx} evoNodes count");
            var evoOrder = w.evoNodes.OrderBy((n) => n.id).ToList();
            for (int k = 0; k < wantEvo.Count; k++)
            {
                var wen = (JObject)wantEvo[k];
                var gen = evoOrder[k];
                string eid = $"{ctx} evo[{gen.id}]";
                Assert.AreEqual(wen["kind"].ToString(), gen.kind, $"{eid} kind");
                Assert.AreEqual(wen["name"].ToString(), gen.name, $"{eid} name");
                if (wen["parent"].Type == JTokenType.Null) Assert.IsFalse(gen.parent.HasValue, $"{eid} parent null");
                else Assert.AreEqual(wen["parent"].Value<int>(), gen.parent.Value, $"{eid} parent");
                Assert.AreEqual(wen["year"].Value<int>(), gen.year, $"{eid} year");
                Assert.AreEqual(wen["detail"].ToString(), gen.detail, $"{eid} detail");
                if (wen["stat"].Type == JTokenType.Null) Assert.IsTrue(string.IsNullOrEmpty(gen.stat), $"{eid} stat null");
                else Assert.AreEqual(wen["stat"].ToString(), gen.stat, $"{eid} stat");
            }

            // —— M-U3e 扩展段：emTechs（涌现科技注册表全字段）——
            var wantEm = (JArray)want["emTechs"];
            Assert.AreEqual(wantEm.Count, w.emTechs.Count, $"{ctx} emTechs count");
            var emOrder = w.emTechs.Values.OrderBy((t) => t.gen).ToList();
            for (int k = 0; k < wantEm.Count; k++)
            {
                var wem = (JObject)wantEm[k];
                var gem = emOrder[k];
                string emid = $"{ctx} emTech[{gem.key}]";
                Assert.AreEqual(wem["name"].ToString(), gem.name, $"{emid} name");
                Assert.AreEqual(wem["cat"].ToString(), gem.cat, $"{emid} cat");
                Assert.AreEqual(wem["cost"].Value<double>(), gem.cost, 1e-9, $"{emid} cost");
                Assert.AreEqual(wem["gen"].Value<int>(), gem.gen, $"{emid} gen");
                Assert.AreEqual(wem["desc"].ToString(), gem.desc, $"{emid} desc");
                var weff = (JArray)wem["effects"];
                Assert.AreEqual(weff.Count, gem.effects.Count, $"{emid} effects count");
                for (int e = 0; e < weff.Count; e++)
                {
                    Assert.AreEqual(weff[e][0].ToString(), gem.effects[e].k, $"{emid} effects[{e}].k");
                    Assert.AreEqual(weff[e][1].Value<double>(), gem.effects[e].v, 1e-12, $"{emid} effects[{e}].v");
                }
            }

            // —— M-U3f 扩展段：armies（economyTick 军饷/欠饷消费域）——
            var wantAr = (JArray)want["armies"];
            Assert.AreEqual(wantAr.Count, w.armies.Count, $"{ctx} armies count");
            for (int k = 0; k < wantAr.Count; k++)
            {
                var war = (JObject)wantAr[k];
                var gar = w.armies[k];
                string arid = $"{ctx} army[{gar.id}]";
                Assert.AreEqual(war["id"].Value<int>(), gar.id, $"{arid} id");
                Assert.AreEqual(war["civ"].Value<int>(), gar.civ, $"{arid} civ");
                Assert.AreEqual(war["name"].ToString(), gar.name, $"{arid} name");
                Assert.AreEqual(war["leaderId"].Value<int>(), gar.leaderId, $"{arid} leaderId");
                Assert.AreEqual(war["state"].ToString(), gar.state, $"{arid} state");
                Assert.AreEqual(war["morale"].Value<double>(), gar.morale, 1e-9, $"{arid} morale");
                Assert.AreEqual(war["members"].Count(), gar.members.Count, $"{arid} members count");
            }

            // —— M-U3f 扩展段：emIdeas（涌现理念注册表全字段）——
            var wantId = (JArray)want["emIdeas"];
            Assert.AreEqual(wantId.Count, w.emIdeas.Count, $"{ctx} emIdeas count");
            for (int k = 0; k < wantId.Count; k++)
            {
                var wid = (JObject)wantId[k];
                var gid = w.emIdeas[wid["key"].ToString()];
                string idid = $"{ctx} idea[{gid.key}]";
                Assert.AreEqual(wid["key"].ToString(), gid.key, $"{idid} key");
                Assert.AreEqual(wid["name"].ToString(), gid.name, $"{idid} name");
                Assert.AreEqual(wid["desc"].ToString(), gid.desc, $"{idid} desc");
                if (wid["mods"]["gold"] == null || wid["mods"]["gold"].Type == JTokenType.Null) Assert.IsFalse(gid.mods.gold.HasValue, $"{idid} mods.gold null");
                else Assert.AreEqual(wid["mods"]["gold"].Value<double>(), gid.mods.gold.Value, 1e-12, $"{idid} mods.gold");
                if (wid["mods"]["stab"] == null || wid["mods"]["stab"].Type == JTokenType.Null) Assert.IsFalse(gid.mods.stab.HasValue, $"{idid} mods.stab null");
                else Assert.AreEqual(wid["mods"]["stab"].Value<double>(), gid.mods.stab.Value, 1e-12, $"{idid} mods.stab");
                if (wid["mods"]["mil"] == null || wid["mods"]["mil"].Type == JTokenType.Null) Assert.IsFalse(gid.mods.mil.HasValue, $"{idid} mods.mil null");
                else Assert.AreEqual(wid["mods"]["mil"].Value<double>(), gid.mods.mil.Value, 1e-12, $"{idid} mods.mil");
                if (wid["mods"]["know"] == null || wid["mods"]["know"].Type == JTokenType.Null) Assert.IsFalse(gid.mods.know.HasValue, $"{idid} mods.know null");
                else Assert.AreEqual(wid["mods"]["know"].Value<double>(), gid.mods.know.Value, 1e-12, $"{idid} mods.know");
                if (wid["mods"]["repro"] == null || wid["mods"]["repro"].Type == JTokenType.Null) Assert.IsFalse(gid.mods.repro.HasValue, $"{idid} mods.repro null");
                else Assert.AreEqual(wid["mods"]["repro"].Value<double>(), gid.mods.repro.Value, 1e-12, $"{idid} mods.repro");
                if (wid["mods"]["wear"] == null || wid["mods"]["wear"].Type == JTokenType.Null) Assert.IsFalse(gid.mods.wear.HasValue, $"{idid} mods.wear null");
                else Assert.AreEqual(wid["mods"]["wear"].Value<double>(), gid.mods.wear.Value, 1e-12, $"{idid} mods.wear");
            }
        }

        private static Dictionary<string, JArray> WantCountsDict(JObject want)
        {
            var d = new Dictionary<string, JArray>();
            foreach (var kv in (JObject)want["civBuildCounts"])
                d[kv.Key] = (JArray)kv.Value;
            return d;
        }

        private static void AssertDiff(JToken diff, Func<int, int> get, string ctx)
        {
            var arr = (JArray)diff;
            foreach (var d in arr)
                Assert.AreEqual(d[1].Value<int>(), get(d[0].Value<int>()), $"{ctx}[{d[0]}]");
        }

        private static void AssertSet(JArray want, HashSet<int> got, string ctx)
        {
            Assert.AreEqual(want.Count, got.Count, $"{ctx} count");
            foreach (var v in want) Assert.IsTrue(got.Contains(v.Value<int>()), $"{ctx} contains {v}");
        }

        // ================================================================
        // Test10 —— M-U3g 军团域黄金回放（units_army.json 16 场景全字段逐位）
        // 蓝本链：engine.ts armyTick 直跑（gen-units-army）→ WbCivSim.cs 机械翻译 → 本回放
        // 平行链：army-transcript.mjs JS 镜像 16/16 ALL PASS（verify 段 10）
        // ================================================================

        private class ArmyCtx { public WbWorld w; }

        [Test]
        public void Test10_ArmyTick_Golden()
        {
            var golden = LoadJson<Newtonsoft.Json.Linq.JObject>("units_army.json");
            var meta = golden["meta"];
            Assert.AreEqual(256, meta["W"].Value<int>(), "meta W");
            Assert.AreEqual(160, meta["H"].Value<int>(), "meta H");
            Assert.AreEqual(6, meta["armyMin"].Value<int>(), "meta ARMY_MIN");
            Assert.AreEqual(24, meta["armyMax"].Value<int>(), "meta ARMY_MAX");
            var scenarios = (Newtonsoft.Json.Linq.JArray)golden["scenarios"];
            Assert.AreEqual(16, scenarios.Count, "scenario count");
            foreach (var sc in scenarios) RunArmyScenario(sc);
        }

        private void RunArmyScenario(Newtonsoft.Json.Linq.JObject sc)
        {
            string name = sc["name"].ToString();
            var w = new WbWorld();
            w.rngA = unchecked((uint)sc["rngA0"].Value<long>());
            w.toastSeq = sc["toastSeq0"].Value<int>();
            // eventSeq 归位在 setup 特判后（gen runScenario 同序：setup(embark) → eventSeq0 快照）

            // terrain RLE
            var rle = (Newtonsoft.Json.Linq.JArray)sc["terrainRle"];
            int pos = 0;
            for (int k = 0; k < rle.Count; k += 2)
            {
                byte v = (byte)rle[k].Value<int>();
                int run = rle[k + 1].Value<int>();
                for (int j = 0; j < run && pos < WbWorld.W * WbWorld.H; j++) w.terrain[pos++] = v;
            }

            var fx = sc["fixture"];
            // paint
            if (fx["paint"] != null)
                foreach (var p in (Newtonsoft.Json.Linq.JArray)fx["paint"])
                {
                    int x0 = p[0].Value<int>(), y0 = p[1].Value<int>(), x1 = p[2].Value<int>(), y1 = p[3].Value<int>(), t = p[4].Value<int>();
                    for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) w.terrain[y * WbWorld.W + x] = (byte)t;
                }
            // civs
            foreach (var c in (Newtonsoft.Json.Linq.JArray)fx["civs"])
            {
                var civ = new WbCiv
                {
                    id = c["id"].Value<int>(),
                    name = c["name"]?.ToString() ?? $"C{c["id"].Value<int>()}",
                    race = c["race"]?.Value<int>() ?? 0,
                    pop = c["pop"]?.Value<int>() ?? 0,
                    houses = c["houses"]?.Value<int>() ?? 0,
                    capital = c["capital"]?.Value<int>() ?? -1,
                    alive = c["alive"] == null || c["alive"].Value<bool>(),
                    gold = c["gold"]?.Value<double>() ?? 0,
                    knowledge = c["knowledge"]?.Value<double>() ?? 0,
                    kingName = c["kingName"]?.ToString() ?? "K",
                    banner = c["banner"]?.ToString() ?? "B",
                    colorHex = c["colorHex"]?.ToString() ?? "#c83c3c",
                    stability = c["stability"]?.Value<double>() ?? 70,
                    militarism = c["militarism"]?.Value<double>() ?? 30,
                    gov = c["gov"]?.Value<int>() ?? 0,
                };
                if (c["kingId"] != null && c["kingId"].Type != Newtonsoft.Json.Linq.JTokenType.Null) civ.kingId = c["kingId"].Value<int>();
                if (c["armyCd"] != null && c["armyCd"].Type != Newtonsoft.Json.Linq.JTokenType.Null) civ.armyCd = c["armyCd"].Value<int>();
                if (c["techs"] != null && c["techs"].Type != Newtonsoft.Json.Linq.JTokenType.Null)
                    foreach (var t in (Newtonsoft.Json.Linq.JArray)c["techs"]) civ.techs.Add(t.ToString());
                foreach (var t in (Newtonsoft.Json.Linq.JArray)c["tiles"]) civ.tiles.Add(t.Value<int>());
                w.civs.Add(civ);
                while (w.civs.Count <= civ.id) w.civs.Add(null);
                if (w.civs[civ.id] == null) w.civs[civ.id] = civ;
                w.civSeq = System.Math.Max(w.civSeq, civ.id + 1);
                foreach (int i in civ.tiles) w.owner[i] = (short)civ.id;
            }
            // units
            foreach (var u in (Newtonsoft.Json.Linq.JArray)fx["units"]) PutArmyUnit(w, u);
            // rel / buildings / civBuildCounts / directives / wars / armies
            if (fx["rel"] != null)
                foreach (var r in (Newtonsoft.Json.Linq.JArray)fx["rel"])
                {
                    int a = r[0].Value<int>(), b = r[1].Value<int>(), v = r[2].Value<int>();
                    w.rel[a < b ? $"{a}-{b}" : $"{b}-{a}"] = v;
                }
            if (fx["buildings"] != null)
                foreach (var b in (Newtonsoft.Json.Linq.JArray)fx["buildings"])
                {
                    int i = b[0].Value<int>(), kind = b[1].Value<int>(), civ = b[2].Value<int>();
                    w.buildings.Add(new WbBuilding { i = i, x = i % WbWorld.W, y = i / WbWorld.W, kind = kind, civ = civ });
                    w.building[i] = (byte)kind;
                    w.bHp[i] = WbCivSim.BUILDING_DEFS[kind].hp;
                    var cw = w.civs[civ];
                    if (cw != null && kind != WbCivSim.BUILD_KINDS.WALL) cw.houses++;
                }
            if (fx["civBuildCounts"] != null)
                foreach (var cb in (Newtonsoft.Json.Linq.JArray)fx["civBuildCounts"])
                {
                    var arr = new int[12];
                    int k = 0;
                    foreach (var v in (Newtonsoft.Json.Linq.JArray)cb[1]) arr[k++] = v.Value<int>();
                    w.civBuildCounts[cb[0].Value<int>()] = arr;
                }
            if (fx["directives"] != null)
                foreach (var d in (Newtonsoft.Json.Linq.JArray)fx["directives"])
                {
                    w.directives.Add(new WbDirective
                    {
                        id = d["id"]?.Value<int>() ?? w.directives.Count,
                        civ = d["civ"].Value<int>(), kind = d["kind"].ToString(),
                        target = (d["target"] == null || d["target"].Type == Newtonsoft.Json.Linq.JTokenType.Null) ? (int?)null : d["target"].Value<int>(),
                        param = d["param"]?.Value<int>() ?? 0,
                        status = d["status"]?.ToString() ?? "active",
                        startTick = d["startTick"]?.Value<int>() ?? 0,
                        deadlineTick = d["deadlineTick"]?.Value<int>() ?? 0,
                        text = d["text"]?.ToString() ?? "",
                    });
                    w.dirSeq = System.Math.Max(w.dirSeq, (d["id"]?.Value<int>() ?? w.directives.Count) + 1);
                }
            if (fx["wars"] != null)
                foreach (var wd in (Newtonsoft.Json.Linq.JArray)fx["wars"])
                {
                    w.warData[wd["key"].ToString()] = new WbWarData
                    {
                        key = wd["key"].ToString(), a = wd["a"].Value<int>(), b = wd["b"].Value<int>(),
                        startTick = wd["startTick"]?.Value<int>() ?? 0, startYear = 0, total = false,
                        scoreA = wd["scoreA"]?.Value<double>() ?? 0, scoreB = wd["scoreB"]?.Value<double>() ?? 0,
                        exA = wd["exA"]?.Value<double>() ?? 0, exB = wd["exB"]?.Value<double>() ?? 0,
                        casA = wd["casA"]?.Value<double>() ?? 0, casB = wd["casB"]?.Value<double>() ?? 0,
                        battles = wd["battles"]?.Value<int>() ?? 0,
                        giveUpAt = wd["giveUpAt"]?.Value<int>() ?? 0,
                        reason = wd["reason"]?.ToString() ?? "border", reasonText = "",
                        aggressor = wd["aggressor"]?.Value<int>() ?? 0,
                        goal = wd["goal"]?.Value<int>() ?? 0, goalNow = 0,
                        occA = wd["occA"]?.Value<int>() ?? 0, occB = wd["occB"]?.Value<int>() ?? 0,
                        popA0 = wd["popA0"]?.Value<int>() ?? 0, popB0 = wd["popB0"]?.Value<int>() ?? 0,
                        lastActiveTick = wd["lastActiveTick"]?.Value<int>() ?? 0,
                    };
                }
            foreach (var ar in (Newtonsoft.Json.Linq.JArray)fx["armies"]) PutArmy(w, ar);
            // —— setup 特判（gen 无法序列化函数 → 名称分发；ARM15 成员预置 boat → embark 零 rng）——
            if (name == "ARM15-naval-crossing") WbCivSim.ArmyEmbark(w, w.armies[0]);
            w.tickCount = sc["startTick"].Value<int>();
            w.effects.Clear();
            w.worldEvents.Clear();
            w.eventSeq = sc["eventSeq0"].Value<int>();   // gen 同款：setup 后事件基线归位

            // —— 逐 tick 驱动 + 断言 ——
            var traces = (Newtonsoft.Json.Linq.JArray)sc["traces"];
            for (int k = 0; k < traces.Count; k++)
            {
                if (w.tickCount % 5 == 0) WbCivSim.ArmyTick(w);   // 宿主协议 engine L2561
                w.tickCount++;
                var want = (Newtonsoft.Json.Linq.JObject)traces[k];
                Assert.AreEqual(want["rngA"].Value<long>(), (long)w.rngA, $"{name} t{k} rngA");
                // armies 全字段逐位
                var wantArmies = (Newtonsoft.Json.Linq.JArray)want["armies"];
                Assert.AreEqual(wantArmies.Count, w.armies.Count, $"{name} t{k} armies n");
                for (int i = 0; i < wantArmies.Count; i++)
                {
                    var wa = (Newtonsoft.Json.Linq.JObject)wantArmies[i];
                    var ga = FindArmy(w, wa["id"].Value<int>());
                    Assert.IsNotNull(ga, $"{name} t{k} army {wa["id"]}");
                    ArmyHexEq(wa["x"], ga.x, $"{name} t{k} army{i} x");
                    ArmyHexEq(wa["y"], ga.y, $"{name} t{k} army{i} y");
                    ArmyHexEq(wa["tx"], ga.tx, $"{name} t{k} army{i} tx");
                    ArmyHexEq(wa["ty"], ga.ty, $"{name} t{k} army{i} ty");
                    ArmyHexEq(wa["morale"], ga.morale, $"{name} t{k} army{i} morale");
                    Assert.AreEqual(wa["state"].ToString(), ga.state, $"{name} t{k} army{i} state");
                    Assert.AreEqual(wa["leaderId"].Value<int>(), ga.leaderId, $"{name} t{k} army{i} leaderId");
                    Assert.AreEqual(wa["kills"].Value<double>(), ga.kills, $"{name} t{k} army{i} kills");
                    Assert.AreEqual(wa["losses"].Value<double>(), ga.losses, $"{name} t{k} army{i} losses");
                    Assert.AreEqual(wa["name"].ToString(), ga.name, $"{name} t{k} army{i} name");
                    if (wa["naval"] != null) Assert.IsTrue(ga.naval, $"{name} t{k} army{i} naval");
                    if (wa["supplyWarned"] != null) Assert.IsTrue(ga.supplyWarned, $"{name} t{k} army{i} supplyWarned");
                    if (wa["battleSize0"] != null && wa["battleSize0"].Type != Newtonsoft.Json.Linq.JTokenType.Null)
                        Assert.AreEqual(wa["battleSize0"].Value<int>(), ga.battleSize0 ?? -1, $"{name} t{k} army{i} battleSize0");
                    if (wa["clashWith"] != null && wa["clashWith"].Type != Newtonsoft.Json.Linq.JTokenType.Null)
                        Assert.AreEqual(wa["clashWith"].Value<int>(), ga.clashWith ?? -1, $"{name} t{k} army{i} clashWith");
                }
                // units 关键字段（编队阵位/levy 换算/boat/army 回填/dead）
                var wantUnits = (Newtonsoft.Json.Linq.JArray)want["units"];
                Assert.AreEqual(wantUnits.Count, w.units.Count, $"{name} t{k} units n");
                for (int i = 0; i < wantUnits.Count; i++)
                {
                    var wu = (Newtonsoft.Json.Linq.JObject)wantUnits[i];
                    var gu = w.unitById[wu["id"].Value<int>()];
                    Assert.IsNotNull(gu, $"{name} t{k} unit {wu["id"]}");
                    ArmyHexEq(wu["tx"], gu.tx, $"{name} t{k} unit{wu["id"]} tx");
                    ArmyHexEq(wu["ty"], gu.ty, $"{name} t{k} unit{wu["id"]} ty");
                    ArmyHexEq(wu["hp"], gu.hp, $"{name} t{k} unit{wu["id"]} hp");
                    Assert.AreEqual(wu["job"].Value<int>(), gu.job, $"{name} t{k} unit{wu["id"]} job");
                    Assert.AreEqual(wu["dead"].Value<int>(), gu.dead, $"{name} t{k} unit{wu["id"]} dead");
                    Assert.AreEqual(wu["boat"].Value<int>(), gu.boat, $"{name} t{k} unit{wu["id"]} boat");
                    int wantArmy = (wu["army"] == null || wu["army"].Type == Newtonsoft.Json.Linq.JTokenType.Null) ? -1 : wu["army"].Value<int>();
                    int gotArmy = gu.army is int iv ? iv : -1;
                    Assert.AreEqual(wantArmy, gotArmy, $"{name} t{k} unit{wu["id"]} army");
                }
                // 记分与事件
                var wantWars = (Newtonsoft.Json.Linq.JArray)want["warData"];
                Assert.AreEqual(wantWars.Count, w.warData.Count, $"{name} t{k} warData n");
                foreach (var ww in wantWars)
                {
                    var gw = w.warData[ww["key"].ToString()];
                    Assert.AreEqual(ww["scoreA"].Value<double>(), gw.scoreA, $"{name} t{k} {ww["key"]} scoreA");
                    Assert.AreEqual(ww["scoreB"].Value<double>(), gw.scoreB, $"{name} t{k} {ww["key"]} scoreB");
                    Assert.AreEqual(ww["battles"].Value<int>(), gw.battles, $"{name} t{k} {ww["key"]} battles");
                }
                var wantEv = (Newtonsoft.Json.Linq.JArray)want["newEvents"];
                Assert.AreEqual(wantEv.Count, w.worldEvents.Count, $"{name} t{k} events n");
                for (int i = 0; i < wantEv.Count; i++)
                    Assert.AreEqual(wantEv[i]["kind"].ToString(), w.worldEvents[i].kind, $"{name} t{k} ev{i} kind");
                ArmyHexEq(want["shake"], w.shake, $"{name} t{k} shake");
                Assert.AreEqual(want["corpses"].Count(), w.corpses.Count, $"{name} t{k} corpses n");
            }
        }

        private static WbArmy FindArmy(WbWorld w, int id)
        {
            foreach (var a in w.armies) if (a.id == id) return a;
            return null;
        }

        private static void ArmyHexEq(object wantHex, double got, string ctx)
        {
            if (wantHex == null || wantHex.Type == Newtonsoft.Json.Linq.JTokenType.Null) return;
            byte[] b = new byte[8];
            for (int i = 0; i < 8; i++) b[i] = Convert.ToByte(wantHex.ToString().Substring(i * 2, 2), 16);
            double want = BitConverter.ToDouble(b, 0);
            Assert.AreEqual(want, got, $"{ctx}（f64 bits 逐位）");
        }

        /// gen mkUnit 同构（army 域夹具形态：wep object/boat/boatTTL/lx/ly/kills）
        private void PutArmyUnit(WbWorld w, Newtonsoft.Json.Linq.JObject u)
        {
            var uu = new WbU
            {
                id = u["id"].Value<int>(), race = u["race"]?.Value<int>() ?? 0, civ = u["civ"]?.Value<int>() ?? -1,
                x = u["x"].Value<double>(), y = u["y"].Value<double>(), tx = u["x"].Value<double>(), ty = u["y"].Value<double>(),
                hp = u["hp"]?.Value<double>() ?? 10, maxHp = u["hp"]?.Value<double>() ?? 10,
                dmg = u["dmg"]?.Value<double>() ?? 1, speed = u["speed"]?.Value<double>() ?? 1,
                age = 0, maxAge = 9999, kills = u["kills"]?.Value<int>() ?? 0,
                cd = 0, job = u["job"]?.Value<int>() ?? 0, king = 0, infected = 0, flip = 0,
                name = u["name"]?.ToString() ?? $"u{u["id"].Value<int>()}",
                hurt = 0, breath = 0, parity = 0, dead = u["dead"]?.Value<int>() ?? 0,
                boat = u["boat"]?.Value<int>() ?? 0, boatTTL = u["boatTTL"]?.Value<int>() ?? 0, caravan = 0,
                wep = u["wep"] != null ? (object)u["wep"].ToString() : 0,
                lx = u["lx"]?.Value<double>() ?? u["x"].Value<double>(), ly = u["ly"]?.Value<double>() ?? u["y"].Value<double>(),
                atk = 0, army = null, gene = null, food = 0, fam = 0, fgn = 0,
            };
            w.units.Add(uu);
            w.unitById[uu.id] = uu;
        }

        /// gen mkArmy 同构（状态机扩展字段全集 + 成员 army 回填）
        private void PutArmy(WbWorld w, Newtonsoft.Json.Linq.JObject ar)
        {
            var a = new WbArmy
            {
                id = ar["id"].Value<int>(), civ = ar["civ"].Value<int>(),
                name = ar["name"]?.ToString() ?? $"A{ar["id"].Value<int>()}",
                leaderId = ar["leaderId"] != null ? ar["leaderId"].Value<int>() : (ar["members"].Count() > 0 ? ar["members"][0].Value<int>() : -1),
                x = ar["x"]?.Value<double>() ?? 0, y = ar["y"]?.Value<double>() ?? 0,
                tx = ar["tx"]?.Value<double>() ?? (ar["x"]?.Value<double>() ?? 0), ty = ar["ty"]?.Value<double>() ?? (ar["y"]?.Value<double>() ?? 0),
                state = ar["state"]?.ToString() ?? "rally", morale = ar["morale"]?.Value<double>() ?? 1,
                kills = ar["kills"]?.Value<double>() ?? 0, losses = ar["losses"]?.Value<double>() ?? 0,
                tactical = ar["tactical"]?.Value<bool>() ?? false,
                naval = ar["naval"]?.Value<bool>() ?? false,
                ambush = ar["ambush"]?.Value<bool>() ?? false,
                formedTick = ar["formedTick"]?.Value<int>() ?? 0,
                size0 = ar["size0"]?.Value<int>() ?? (ar["members"] != null ? ar["members"].Count() : 0),
                evalTick = ar["evalTick"]?.Value<int>() ?? 0,
                targetCiv = ar["targetCiv"]?.Value<int>() ?? -1,
                rot = ar["rot"]?.Value<double>() ?? 0,
            };
            if (ar["clashWith"] != null && ar["clashWith"].Type != Newtonsoft.Json.Linq.JTokenType.Null) a.clashWith = ar["clashWith"].Value<int>();
            if (ar["battleSize0"] != null && ar["battleSize0"].Type != Newtonsoft.Json.Linq.JTokenType.Null) a.battleSize0 = ar["battleSize0"].Value<int>();
            if (ar["marchPushTick"] != null && ar["marchPushTick"].Type != Newtonsoft.Json.Linq.JTokenType.Null) a.marchPushTick = ar["marchPushTick"].Value<int>();
            if (ar["battleSince"] != null && ar["battleSince"].Type != Newtonsoft.Json.Linq.JTokenType.Null) a.battleSince = ar["battleSince"].Value<int>();
            if (ar["reinforced"] != null && ar["reinforced"].Type != Newtonsoft.Json.Linq.JTokenType.Null) a.reinforced = ar["reinforced"].Value<int>();
            foreach (var m in (Newtonsoft.Json.Linq.JArray)ar["members"]) a.members.Add(m.Value<int>());
            w.armies.Add(a);
            foreach (int uid in a.members) if (w.unitById.TryGetValue(uid, out var u)) u.army = a.id;
            w.armySeq = System.Math.Max(w.armySeq, a.id + 1);
        }

        // ================================================================
        // Test11 —— M-U4 渲染 I 黄金回放（render.json 102 场景三段逐位）
        //   地形 39 × 8×8 RGBA 烘焙（flushDirty 全数学链）＋ 道具 15 命令流（flushProps）＋ 单位 48 决策流（render 单位循环）
        // 蓝本链：engine.ts flushDirty/flushProps + render.ts render 直跑（gen-render.mjs）→ WbRender.cs 机械翻译 → 本回放
        // 平行链：render-transcript.mjs JS 镜像 186/186 ALL PASS（verify 段 11）
        // 样式协议：fillRect→s=[fillStyle]；strokeRect→s=[strokeStyle,lineWidth(double)]；其余 op s=null
        // ================================================================

        private static double HexToF64(string hex)
        {
            byte[] b = new byte[8];
            for (int i = 0; i < 8; i++) b[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
            return BitConverter.ToDouble(b, 0);
        }
        private static double JHexD(Newtonsoft.Json.Linq.JToken tok)
        {
            if (tok == null || tok.Type == Newtonsoft.Json.Linq.JTokenType.Null) return 0;
            return HexToF64(tok.ToString());
        }

        private static void AssertOpsEqual(Newtonsoft.Json.Linq.JArray want, WbDrawList got, string ctx)
        {
            Assert.AreEqual(want.Count, got.ops.Count, ctx + " op 数");
            for (int k = 0; k < want.Count; k++)
            {
                var wop = want[k];
                var gop = got.ops[k];
                Assert.AreEqual(wop["o"].ToString(), gop.o, ctx + $" op[{k}] opcode");
                var wa = (Newtonsoft.Json.Linq.JArray)wop["a"];
                Assert.AreEqual(wa.Count, gop.a.Length, ctx + $" op[{k}] 参数数");
                for (int j = 0; j < wa.Count; j++)
                    Assert.AreEqual(JHex(wa[j]), WbRender.F64Hex(gop.a[j]), ctx + $" op[{k}].a[{j}]（f64 bits）");
                var ws = wop["s"];
                if (ws == null || ws.Type == Newtonsoft.Json.Linq.JTokenType.Null)
                {
                    Assert.IsNull(gop.s, ctx + $" op[{k}] s=null");
                }
                else
                {
                    Assert.IsNotNull(gop.s, ctx + $" op[{k}] s 非空");
                    var sarr = (Newtonsoft.Json.Linq.JArray)ws;
                    Assert.AreEqual(sarr.Count, gop.s.Length, ctx + $" op[{k}] s 元素数");
                    for (int j = 0; j < sarr.Count; j++)
                    {
                        if (sarr[j].Type == Newtonsoft.Json.Linq.JTokenType.String)
                            Assert.AreEqual(sarr[j].ToString(), (string)gop.s[j], ctx + $" op[{k}].s[{j}] 样式串");
                        else
                            Assert.AreEqual(sarr[j].Value<double>(), (double)gop.s[j], ctx + $" op[{k}].s[{j}] lineWidth");
                    }
                }
            }
        }

        private static void AssertBailsEqual(Newtonsoft.Json.Linq.JArray want, WbDrawList got, string ctx)
        {
            Assert.AreEqual(want.Count, got.bails.Count, ctx + " bail 数");
            for (int k = 0; k < want.Count; k++)
            {
                var wb = want[k];
                var gb = got.bails[k];
                Assert.AreEqual(wb["fn"].ToString(), gb.fn, ctx + $" bail[{k}] fn");
                var wa = (Newtonsoft.Json.Linq.JArray)wb["a"];
                Assert.AreEqual(wa.Count, gb.a.Length, ctx + $" bail[{k}] 基元数");
                for (int j = 0; j < wa.Count; j++)
                {
                    string wv = wa[j].Type == Newtonsoft.Json.Linq.JTokenType.Null ? null : wa[j].ToString();
                    Assert.AreEqual(wv ?? "", gb.a[j] ?? "", ctx + $" bail[{k}].a[{j}]（f64 bits hex/null）");
                }
            }
        }

        [Test]
        public void Test11_Render_Golden()
        {
            var golden = LoadJson<Newtonsoft.Json.Linq.JObject>("render.json");
            var terrain = (Newtonsoft.Json.Linq.JArray)golden["terrain"];
            var props = (Newtonsoft.Json.Linq.JArray)golden["props"];
            var units = (Newtonsoft.Json.Linq.JArray)golden["units"];
            Assert.AreEqual(39, terrain.Count, "terrain 场景数");
            Assert.AreEqual(15, props.Count, "props 场景数");
            Assert.AreEqual(48, units.Count, "unit 场景数");
            foreach (var sc in terrain) RunTerrainScenario((Newtonsoft.Json.Linq.JObject)sc);
            foreach (var sc in props) RunPropsScenario((Newtonsoft.Json.Linq.JObject)sc);
            foreach (var sc in units) RunUnitScenario((Newtonsoft.Json.Linq.JObject)sc);
        }

        private WbRenderState NewRenderState()
        {
            var st = new WbRenderState();
            for (int i = 0; i < WbRender.W * WbRender.H; i++) st.owner[i] = -1;
            return st;
        }

        private void RunTerrainScenario(Newtonsoft.Json.Linq.JObject sc)
        {
            string name = sc["name"].ToString();
            var tiles = (Newtonsoft.Json.Linq.JArray)sc["tiles"];
            var st = NewRenderState();
            foreach (var tl in tiles)
            {
                var inp = tl["in"];
                int i = inp["i"].Value<int>();
                st.terrain[i] = (byte)inp["t"].Value<int>();
                st.variant[i] = (byte)inp["variant"].Value<int>();
                st.waterTier[i] = (byte)inp["waterTier"].Value<int>();
                st.road[i] = inp["road"].Value<int>();
                st.owner[i] = inp["owner"].Value<int>();
                st.radiate[i] = inp["radiate"].Value<double>();
                st.season = inp["season"].Value<int>();
                st.ash = JHexD(inp["ash"]);
                st.glacier[i] = (byte)inp["glacier"].Value<int>();
                // 邻居地形（软边/坡向/海岸泡沫域）
                int x = i % WbRender.W, y = i / WbRender.W;
                if (x > 0) st.terrain[i - 1] = (byte)inp["nL"].Value<int>();
                if (x < WbRender.W - 1) st.terrain[i + 1] = (byte)inp["nR"].Value<int>();
                if (y > 0) st.terrain[i - WbRender.W] = (byte)inp["nT"].Value<int>();
                if (y < WbRender.H - 1) st.terrain[i + WbRender.W] = (byte)inp["nB"].Value<int>();
                if (x > 0 && y > 0) st.terrain[i - WbRender.W - 1] = (byte)inp["nTL"].Value<int>();
                if (x < WbRender.W - 1 && y < WbRender.H - 1) st.terrain[i + WbRender.W + 1] = (byte)inp["nBR"].Value<int>();
                // 邻居 owner（疆域边界域；-9 = 画外哨兵不灌）
                if (x > 0) st.owner[i - 1] = inp["oL"].Value<int>();
                if (x < WbRender.W - 1) st.owner[i + 1] = inp["oR"].Value<int>();
                if (y > 0) st.owner[i - WbRender.W] = inp["oT"].Value<int>();
                if (y < WbRender.H - 1) st.owner[i + WbRender.W] = inp["oB"].Value<int>();
                if (inp["civColor"] != null && inp["civColor"].Type != Newtonsoft.Json.Linq.JTokenType.Null)
                {
                    int o = inp["owner"].Value<int>();
                    while (st.civs.Count <= o) st.civs.Add(null);
                    if (st.civs[o] == null)
                        st.civs[o] = new WbCiv
                        {
                            id = o,
                            color = inp["civColor"].Values<int>().ToArray(),
                            colorHex = "#000000",
                            alive = true,
                        };
                }
                var px = new byte[256];
                WbRender.TerrainBake(st, i, px);
                var sb = new StringBuilder(512);
                foreach (var b in px) sb.Append(b.ToString("x2"));
                Assert.AreEqual(tl["rgba"].ToString(), sb.ToString(), name + $" tile {i} 8×8 RGBA 逐位");
            }
        }

        private void RunPropsScenario(Newtonsoft.Json.Linq.JObject sc)
        {
            string name = sc["name"].ToString();
            var inp = sc["in"];
            int i = inp["i"].Value<int>();
            var st = NewRenderState();
            st.terrain[i] = (byte)inp["t"].Value<int>();
            st.variant[i] = (byte)inp["variant"].Value<int>();
            st.road[i] = inp["road"].Value<int>();
            st.snowman[i] = (byte)inp["snowman"].Value<int>();
            st.season = inp["season"].Value<int>();
            var L = new WbDrawList();
            WbRender.PropsBake(st, i, L);
            AssertOpsEqual((Newtonsoft.Json.Linq.JArray)sc["ops"], L, name);
            AssertBailsEqual((Newtonsoft.Json.Linq.JArray)sc["bails"], L, name);
        }

        private void RunUnitScenario(Newtonsoft.Json.Linq.JObject sc)
        {
            string name = sc["name"].ToString();
            var inp = sc["in"];
            var st = NewRenderState();
            st.terrainAt = (byte)inp["terrainAt"].Value<int>();
            st.camX = JHexD(inp["cam"]["x"]);
            st.camY = JHexD(inp["cam"]["y"]);
            st.camZoom = JHexD(inp["cam"]["zoom"]);
            st.frameCount = inp["frameCount"].Value<long>();
            st.fxDayNight = inp["fxPrefs"]["dayNight"].Value<bool>();
            st.fxHpBars = inp["fxPrefs"]["hpBars"].Value<bool>();
            st.selectedId = inp["selectedId"].Value<int>();
            if (inp["civs"] != null && inp["civs"].Type != Newtonsoft.Json.Linq.JTokenType.Null)
                foreach (var c in (Newtonsoft.Json.Linq.JArray)inp["civs"])
                {
                    int cid = c["id"].Value<int>();
                    while (st.civs.Count <= cid) st.civs.Add(null);
                    st.civs[cid] = new WbCiv
                    {
                        id = cid,
                        color = c["color"] != null && c["color"].Type != Newtonsoft.Json.Linq.JTokenType.Null
                            ? c["color"].Values<int>().ToArray() : new[] { 0, 0, 0 },
                        colorHex = c["colorHex"]?.ToString() ?? "#000000",
                        alive = c["alive"] == null || c["alive"].Value<bool>(),
                    };
                }
            var units = new List<WbU>();
            foreach (var q in (Newtonsoft.Json.Linq.JArray)inp["units"])
            {
                var u = new WbU
                {
                    id = q["id"].Value<int>(),
                    race = q["race"].Value<int>(),
                    civ = q["civ"].Value<int>(),
                    x = JHexD(q["x"]),
                    y = JHexD(q["y"]),
                    flip = q["flip"].Value<int>(),
                    atk = (int)JHexD(q["atk"]),
                    age = q["age"].Value<int>(),
                    hurt = q["hurt"].Value<int>(),
                    hp = JHexD(q["hp"]),
                    maxHp = JHexD(q["maxHp"]),
                    boat = q["boat"].Value<int>(),
                    caravan = q["caravan"].Value<int>(),
                    king = q["king"].Value<int>(),
                };
                if (q["rx"] != null && q["rx"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.rx = JHexD(q["rx"]);
                if (q["ry"] != null && q["ry"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.ry = JHexD(q["ry"]);
                if (q["dpx"] != null && q["dpx"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.dpx = JHexD(q["dpx"]);
                if (q["dpy"] != null && q["dpy"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.dpy = JHexD(q["dpy"]);
                if (q["lx"] != null && q["lx"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.lx = JHexD(q["lx"]);
                if (q["ly"] != null && q["ly"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.ly = JHexD(q["ly"]);
                if (q["panic"] != null && q["panic"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.panic = JHexD(q["panic"]);
                if (q["wep"] != null && q["wep"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.wep = q["wep"].ToString();
                if (q["trait"] != null && q["trait"].Type != Newtonsoft.Json.Linq.JTokenType.Null) u.traitName = q["trait"].ToString();
                units.Add(u);
            }
            var L = new WbDrawList();
            WbRender.UnitScene(st, units, L);
            AssertOpsEqual((Newtonsoft.Json.Linq.JArray)sc["ops"], L, name);
            AssertBailsEqual((Newtonsoft.Json.Linq.JArray)sc["bails"], L, name);
        }

        // ============================================================
        // Test12: M-U5a 渲染 II —— sprites 12 函数像素画（WbSprites.cs）
        // 黄金: render2.json 128 场景（gen-render2.mjs 直录 src/lib/game/sprites.ts 真实现，
        //       bail 契约展开为完整 op 序列）。逐 op 逐位（opcode/参数 f64 bits/样式串）。
        // ============================================================
        [Test]
        public void Test12_Sprites_Golden()
        {
            var golden = LoadJson<Newtonsoft.Json.Linq.JObject>("render2.json");
            var scens = (Newtonsoft.Json.Linq.JArray)golden["scens"];
            Assert.AreEqual(128, scens.Count, "sprites 场景数");
            foreach (var sc in scens) RunSpritesScenario((Newtonsoft.Json.Linq.JObject)sc);
        }

        private static bool JHas(Newtonsoft.Json.Linq.JToken tok)
        {
            return tok != null && tok.Type != Newtonsoft.Json.Linq.JTokenType.Null;
        }

        private void RunSpritesScenario(Newtonsoft.Json.Linq.JObject sc)
        {
            string name = sc["name"].ToString();
            string fn = sc["fn"].ToString();
            var inp = (Newtonsoft.Json.Linq.JObject)sc["in"];
            var L = new WbDrawList();
            if (fn == "drawTree")
            {
                WbSprites.DrawTree(L, inp["x"].Value<double>(), inp["y"].Value<double>(),
                    inp["variant"].Value<int>(), inp["season"].Value<int>());
            }
            else if (fn == "drawMountainProp")
            {
                double? elev = JHas(inp["elev"]) ? (double?)JHexD(inp["elev"]) : null;
                double? cold = JHas(inp["cold"]) ? (double?)JHexD(inp["cold"]) : null;
                WbSprites.DrawMountainProp(L, inp["x"].Value<double>(), inp["y"].Value<double>(),
                    inp["variant"].Value<int>(), elev, cold);
            }
            else
            {
                var u = RebuildSpriteU((Newtonsoft.Json.Linq.JObject)inp["u"]);
                WbVis vis = JHas(inp["raceVis"]) ? JsonConvert.DeserializeObject<WbVis>(inp["raceVis"].ToString()) : null;
                int[] civColor = null;
                if (JHas(inp["civColor"])) civColor = inp["civColor"].Values<int>().ToArray();
                if (fn == "drawPerson") WbSprites.DrawPerson(L, u, vis, civColor, inp["t"].Value<int>());
                else if (fn == "drawPersonFine") WbSprites.DrawPersonFine(L, u, vis, civColor, inp["t"].Value<int>(), inp["crown"].Value<int>() != 0);
                else if (fn == "drawQuadFine") WbSprites.DrawQuadFine(L, u, inp["kind"].ToString(), inp["t"].Value<int>(), inp["crown"].Value<int>() != 0);
                else if (fn == "drawBoat") WbSprites.DrawBoat(L, u, civColor, inp["frame"].Value<int>());
                else if (fn == "drawCaravan") WbSprites.DrawCaravan(L, u, civColor, inp["frame"].Value<int>());
                else if (fn == "drawSheep") WbSprites.DrawSheep(L, u);
                else if (fn == "drawWolf") WbSprites.DrawWolf(L, u);
                else if (fn == "drawSnowWolf") WbSprites.DrawSnowWolf(L, u);
                else if (fn == "drawBear") WbSprites.DrawBear(L, u);
                else if (fn == "drawDeer") WbSprites.DrawDeer(L, u);
                else Assert.Fail("未知精灵函数 " + fn);
            }
            AssertOpsEqual((Newtonsoft.Json.Linq.JArray)sc["ops"], L, name);
        }

        // ============================================================
        // Test13: M-U5b 渲染 III —— frame 驱动物种精灵 20 族（WbSprites.cs 扩展）
        // 黄金: render3.json 113 场景（gen-render3.mjs 直录 sprites.ts 真实现）。
        // ============================================================
        [Test]
        public void Test13_Species_Golden()
        {
            var golden = LoadJson<Newtonsoft.Json.Linq.JObject>("render3.json");
            var scens = (Newtonsoft.Json.Linq.JArray)golden["scens"];
            Assert.AreEqual(113, scens.Count, "物种精灵场景数");
            foreach (var sc in scens) RunSpeciesScenario((Newtonsoft.Json.Linq.JObject)sc);
        }

        private void RunSpeciesScenario(Newtonsoft.Json.Linq.JObject sc)
        {
            string name = sc["name"].ToString();
            string fn = sc["fn"].ToString();
            var inp = (Newtonsoft.Json.Linq.JObject)sc["in"];
            var u = RebuildSpriteU((Newtonsoft.Json.Linq.JObject)inp["u"]);
            if (JHas(inp["u"]) && inp["u"]["id"] != null) u.id = inp["u"]["id"].Value<int>();
            if (inp["u"]["cd"] != null) u.cd = inp["u"]["cd"].Value<int>();
            if (inp["u"]["gen"] != null) u.gen = inp["u"]["gen"].Value<int>();
            int frame = inp["frame"].Value<int>();
            var L = new WbDrawList();
            if (fn == "drawDragon") WbSprites.DrawDragon(L, u, frame);
            else if (fn == "drawPenguin") WbSprites.DrawPenguin(L, u, frame);
            else if (fn == "drawCamel") WbSprites.DrawCamel(L, u, frame);
            else if (fn == "drawScorpion") WbSprites.DrawScorpion(L, u, frame);
            else if (fn == "drawSnake") WbSprites.DrawSnake(L, u, frame);
            else if (fn == "drawSkeleton") WbSprites.DrawSkeleton(L, u, frame);
            else if (fn == "drawDemon") WbSprites.DrawDemon(L, u, frame);
            else if (fn == "drawAngel") WbSprites.DrawAngel(L, u, frame);
            else if (fn == "drawPhoenix") WbSprites.DrawPhoenix(L, u, frame);
            else if (fn == "drawEnt") WbSprites.DrawEnt(L, u, frame);
            else if (fn == "drawLich") WbSprites.DrawLich(L, u, frame);
            else if (fn == "drawTroll") WbSprites.DrawTroll(L, u, frame);
            else if (fn == "drawOgre") WbSprites.DrawOgre(L, u, frame);
            else if (fn == "drawWhiteWalker") WbSprites.DrawWhiteWalker(L, u, frame);
            else if (fn == "drawVampire") WbSprites.DrawVampire(L, u, frame);
            else if (fn == "drawKraken") WbSprites.DrawKraken(L, u, frame);
            else if (fn == "drawSandworm") WbSprites.DrawSandworm(L, u, frame);
            else if (fn == "drawBasilisk") WbSprites.DrawBasilisk(L, u, frame);
            else if (fn == "drawHydra") WbSprites.DrawHydra(L, u, frame);
            else if (fn == "drawMage") WbSprites.DrawMage(L, u, frame);
            else Assert.Fail("未知物种函数 " + fn);
            AssertOpsEqual((Newtonsoft.Json.Linq.JArray)sc["ops"], L, name);
        }

        // render2.json in.u 重建（dumpU 逆变换；f64 hex → double；渲染域字段映射 WbU）
        private WbU RebuildSpriteU(Newtonsoft.Json.Linq.JObject q)
        {
            var u = new WbU
            {
                race = q["race"].Value<int>(),
                civ = q["civ"].Value<int>(),
                id = q["id"] != null ? q["id"].Value<int>() : 1,
                cd = q["cd"] != null ? q["cd"].Value<int>() : 0,
                gen = q["gen"] != null ? q["gen"].Value<int>() : 0,
                x = JHexD(q["x"]),
                y = JHexD(q["y"]),
                flip = q["flip"].Value<int>(),
                atk = (int)JHexD(q["atk"]),
                age = q["age"].Value<int>(),
                maxAge = q["maxAge"].Value<int>(),
                hurt = q["hurt"].Value<int>(),
                hp = JHexD(q["hp"]),
                maxHp = JHexD(q["maxHp"]),
                job = q["job"].Value<int>(),
                infected = q["infected"].Value<int>(),
                king = q["king"].Value<int>(),
            };
            if (JHas(q["rx"])) u.rx = JHexD(q["rx"]);
            if (JHas(q["ry"])) u.ry = JHexD(q["ry"]);
            if (JHas(q["dpx"])) u.dpx = JHexD(q["dpx"]);
            if (JHas(q["dpy"])) u.dpy = JHexD(q["dpy"]);
            if (JHas(q["lx"])) u.lx = JHexD(q["lx"]);
            if (JHas(q["ly"])) u.ly = JHexD(q["ly"]);
            if (JHas(q["wep"])) u.wep = q["wep"].ToString();
            if (JHas(q["arm"])) u.armS = q["arm"].ToString();
            if (JHas(q["hlm"])) u.hlmS = q["hlm"].ToString();
            if (JHas(q["trait"])) u.traitName = q["trait"].ToString();
            return u;
        }

        // ============================================================
        // Test14: M-U5c 渲染 IV 余域 —— 八新动物/建筑/掉落物/火/龙卷/涌现域（WbSprites.cs 余域扩展）
        // 黄金: render4.json 111 场景（gen-render4.mjs 直录 sprites.ts 真实现）。
        // ============================================================
        [Test]
        public void Test14_Render4_Golden()
        {
            var golden = LoadJson<Newtonsoft.Json.Linq.JObject>("render4.json");
            var scens = (Newtonsoft.Json.Linq.JArray)golden["scens"];
            Assert.AreEqual(111, scens.Count, "渲染 IV 余域场景数");
            foreach (var sc in scens) RunRender4Scenario((Newtonsoft.Json.Linq.JObject)sc);
        }

        private static WbVisCache RebuildVisCache(Newtonsoft.Json.Linq.JObject d)
        {
            return new WbVisCache
            {
                body = d["body"].ToString(),
                dark = d["dark"].ToString(),
                light = d["light"].ToString(),
                accent = d["accent"].ToString(),
                size = JHexD(d["size"]),
                bulk = JHexD(d["bulk"]),
                horns = d["horns"].Value<int>(),
                spikes = d["spikes"].Value<int>(),
                mane = d["mane"].Value<int>(),
                tail = d["tail"].Value<int>(),
                ears = d["ears"].Value<int>(),
                glow = d["glow"].Value<int>(),
                pattern = d["pattern"].Value<int>(),
                crest = d["crest"].Value<int>(),
            };
        }

        private void RunRender4Scenario(Newtonsoft.Json.Linq.JObject sc)
        {
            string name = sc["name"].ToString();
            string fn = sc["fn"].ToString();
            var inp = (Newtonsoft.Json.Linq.JObject)sc["in"];
            var L = new WbDrawList();
            if (fn == "drawBuilding")
            {
                var b = (Newtonsoft.Json.Linq.JObject)inp["b"];
                WbSprites.DrawBuilding(L, JHexD(b["x"]), JHexD(b["y"]), b["kind"].Value<int>(),
                    inp["color"].Values<int>().ToArray(), inp["tier"].Value<int>(), JHexD(inp["hpRatio"]));
            }
            else if (fn == "drawItem")
            {
                string defSlot = null, defArt = null, main = null;
                int defRarity = 0;
                if (JHas(inp["def"]))
                {
                    var def = (Newtonsoft.Json.Linq.JObject)inp["def"];
                    defSlot = def["slot"].ToString();
                    defRarity = def["rarity"].Value<int>();
                    defArt = JHas(def["art"]) ? def["art"].ToString() : null;
                    main = JHas(inp["main"]) ? inp["main"].ToString() : null;
                }
                WbSprites.DrawItem(L, JHexD(inp["x"]), JHexD(inp["y"]), inp["kind"].ToString(),
                    inp["id"].Value<int>(), inp["frame"].Value<int>(), defSlot, defRarity, defArt, main);
            }
            else if (fn == "drawFire")
            {
                WbSprites.DrawFire(L, JHexD(inp["x"]), JHexD(inp["y"]), inp["i"].Value<int>(), inp["frame"].Value<int>());
            }
            else if (fn == "drawTornado")
            {
                WbSprites.DrawTornado(L, JHexD(inp["x"]), JHexD(inp["y"]), inp["frame"].Value<int>());
            }
            else if (fn == "drawEmergentCreature" || fn == "drawEmergentMonster")
            {
                var u = RebuildSpriteU((Newtonsoft.Json.Linq.JObject)inp["u"]);
                var vc = RebuildVisCache((Newtonsoft.Json.Linq.JObject)inp["vc"]);
                if (fn == "drawEmergentCreature") WbSprites.DrawEmergentCreature(L, u, vc, inp["t"].Value<int>());
                else WbSprites.DrawEmergentMonster(L, u, vc, inp["shape"].ToString(), inp["t"].Value<int>());
            }
            else
            {
                var u = RebuildSpriteU((Newtonsoft.Json.Linq.JObject)inp["u"]);
                if (fn == "drawChicken") WbSprites.DrawChicken(L, u, inp["frame"].Value<int>());
                else if (fn == "drawPig") WbSprites.DrawPig(L, u, inp["frame"].Value<int>());
                else if (fn == "drawRabbit") WbSprites.DrawRabbit(L, u, inp["frame"].Value<int>());
                else if (fn == "drawFox") WbSprites.DrawFox(L, u, inp["frame"].Value<int>());
                else if (fn == "drawFish") WbSprites.DrawFish(L, u, inp["frame"].Value<int>());
                else if (fn == "drawCrab") WbSprites.DrawCrab(L, u, inp["frame"].Value<int>());
                else if (fn == "drawTurtle") WbSprites.DrawTurtle(L, u, inp["frame"].Value<int>());
                else if (fn == "drawShark") WbSprites.DrawShark(L, u, inp["frame"].Value<int>());
                else Assert.Fail("未知渲染 IV 函数 " + fn);
            }
            AssertOpsEqual((Newtonsoft.Json.Linq.JArray)sc["ops"], L, name);
        }

        // ============================================================
        // Test15: M-U6a 存档编解码核心 —— B64/RLE/Hash2/Reseed/CamClamp/OccClamp/RowsToUnits/Validate（WbSave.cs）
        // 黄金: save.json 13 场景组（gen-save.mjs 真引擎 serialize/applySave 直录 + validateSaveData + hash2 直调）。
        // 对账纪律: rngA 为 applySave 尾链推进值（M-U6b 域）不在此锁 —— 重播种公式由 H-math reseed 表锁定。
        // ============================================================
        [Test]
        public void Test15_Save_Golden()
        {
            var golden = LoadJson<Newtonsoft.Json.Linq.JObject>("save.json");
            var scens = (Newtonsoft.Json.Linq.JArray)golden["scenarios"];
            Assert.AreEqual(13, scens.Count, "存档编解码场景组数");
            int W = golden["meta"]["W"].Value<int>();
            int H = golden["meta"]["H"].Value<int>();
            var ufields = ((Newtonsoft.Json.Linq.JArray)golden["meta"]["unitFields"]).Select(t => t.ToString()).ToArray();
            foreach (var scT in scens)
            {
                var sc = (Newtonsoft.Json.Linq.JObject)scT;
                string name = sc["name"].ToString();
                if (name.StartsWith("S-"))
                {
                    var save = (Newtonsoft.Json.Linq.JObject)sc["save"];
                    var raw = (Newtonsoft.Json.Linq.JObject)sc["raw"];
                    // RLE round-trip：解码黄金 → 引擎内数组 hex 逐位；编码引擎内数组 → 黄金字串逐位
                    var fields = new[] { "terrain", "owner", "building", "fire", "radiate", "river", "road" };
                    foreach (var f in fields)
                    {
                        var svTok = save[f];
                        if (svTok == null || svTok.Type != JTokenType.String) continue;
                        string sv = svTok.ToString();
                        if (sv.Length == 0) continue; // variant 空串跳过（v2 不存）
                        int expect = f == "owner" ? W * H * 2 : W * H;
                        byte[] dec = WbSave.RleDecode(sv, expect);
                        Assert.AreEqual(raw[f].ToString(), Hex(dec, 0, dec.Length), $"{name} {f} RleDecode 逐位");
                        string enc = WbSave.RleEncode(HexToBytes(raw[f].ToString()));
                        Assert.AreEqual(sv, enc, $"{name} {f} RleEncode round-trip");
                    }
                    // 列式单位行：RowsToUnits 协议 + round-trip 重建 == 黄金 u
                    var uArr = (Newtonsoft.Json.Linq.JArray)save["u"];
                    var units = WbSave.RowsToUnits(uArr);
                    var units41 = (Newtonsoft.Json.Linq.JArray)sc["units41"];
                    Assert.AreEqual(units41.Count, units.Count, $"{name} rowsToUnits 行数");
                    var rebuilt = new Newtonsoft.Json.Linq.JArray();
                    var headerArr = new Newtonsoft.Json.Linq.JArray();
                    foreach (var hf in ufields) headerArr.Add(hf);
                    rebuilt.Add(headerArr);
                    foreach (var dict in units)
                    {
                        var row = new Newtonsoft.Json.Linq.JArray();
                        foreach (var hf in ufields)
                            row.Add(dict.ContainsKey(hf) ? (JToken)dict[hf] : JToken.Parse("null"));
                        rebuilt.Add(row);
                    }
                    Assert.AreEqual(save["u"].ToString(Formatting.None), rebuilt.ToString(Formatting.None), $"{name} rows round-trip 逐位");
                    // 语义锚（S-fixture 注入 id=10000 行）：wep 对象字段深值
                    if (name == "S-fixture-777")
                    {
                        var row10k = units41.First(r => ((Newtonsoft.Json.Linq.JArray)r)[0].Value<int>() == 10000);
                        var wepTok = ((Newtonsoft.Json.Linq.JArray)row10k)[ufields.ToList().IndexOf("wep")];
                        Assert.AreEqual("Emergent Blade", wepTok["name"].ToString(), "注入单位 wep 对象字段");
                    }
                }
                else if (name.StartsWith("A-"))
                {
                    int seed = sc["scalarSeed"].Value<int>();
                    // variant 重算逐位（hash2 链）
                    byte[] variant = WbSave.RecomputeVariant(W, H, seed);
                    Assert.AreEqual(sc["variant"].ToString(), Hex(variant, 0, variant.Length), $"{name} RecomputeVariant 逐位");
                    // cam 谓词 + clamp
                    var camIn = sc["camIn"];
                    bool finite = camIn != null && camIn.Type == JTokenType.Object
                        && WbSave.CamFinite(JHexD(camIn["x"]), JHexD(camIn["y"]), camIn["zoom"].ToString() == "NaN" ? double.NaN : JHexD(camIn["zoom"]));
                    Assert.AreEqual(sc["camApplied"].Value<bool>(), finite, $"{name} CamFinite 谓词");
                    if (finite && sc["camApplied"].Value<bool>())
                    {
                        double rawZoom = camIn["zoom"].ToString() == "NaN" ? double.NaN : JHexD(camIn["zoom"]);
                        Assert.AreEqual(sc["cam"]["zoom"].ToString(), F64Hex(WbSave.CamZoomClamp(rawZoom)), $"{name} CamZoomClamp");
                    }
                    // occ clamp 逐行（注入表与 gen-save 硬编码同源；civ 存活 = 0/1 两文明）
                    if (name == "A-occ-clamp")
                    {
                        int[][] injected = new[] { new[] { 0, 0, 0 }, new[] { 1, 0, 1 }, new[] { 2, 0, 50 }, new[] { 3, 0, 99 }, new[] { 4, 0, 100 }, new[] { 5, 0, 150 }, new[] { 6, 9, 10 }, new[] { 7, 0, -5 }, new[] { -1, 0, 10 }, new[] { W * H, 0, 10 }, new[] { 8, 1, 3 }, new[] { 9, 0, 98 } };
                        var goldOcc = new Dictionary<int, int[]>();
                        foreach (var r in (Newtonsoft.Json.Linq.JArray)sc["occ"])
                        {
                            var row = (Newtonsoft.Json.Linq.JArray)r;
                            goldOcc[row[0].Value<int>()] = new[] { row[0].Value<int>(), row[1].Value<int>(), row[2].Value<int>() };
                        }
                        foreach (var inj in injected)
                        {
                            bool alive = inj[1] == 0 || inj[1] == 1;
                            int? got = WbSave.OccAccept(inj[0], inj[1], inj[2], alive, W * H);
                            if (got == null) Assert.IsFalse(goldOcc.ContainsKey(inj[0]), $"{name} occ i={inj[0]} 应跳过");
                            else
                            {
                                Assert.IsTrue(goldOcc.ContainsKey(inj[0]), $"{name} occ i={inj[0]} 应收录");
                                Assert.AreEqual(got.Value, goldOcc[inj[0]][2], $"{name} occ i={inj[0]} clamp 值");
                            }
                        }
                    }
                }
                else if (name == "H-math")
                {
                    foreach (var r in (Newtonsoft.Json.Linq.JArray)sc["hash2"])
                    {
                        var row = (Newtonsoft.Json.Linq.JArray)r;
                        double got = WbSave.Hash2(row[0].Value<int>(), row[1].Value<int>(), row[2].Value<int>());
                        Assert.AreEqual(row[3].ToString(), F64Hex(got), $"hash2({row[0]},{row[1]},{row[2]}) f64 逐位");
                    }
                    foreach (var r in (Newtonsoft.Json.Linq.JArray)sc["reseed"])
                    {
                        var row = (Newtonsoft.Json.Linq.JArray)r;
                        uint got = WbSave.ReseedRng(row[0].Value<int>(), row[1].Value<int>());
                        Assert.AreEqual(row[2].ToString(), "0x" + got.ToString("x8"), $"ReseedRng({row[0]},{row[1]})");
                    }
                }
                else if (name == "V-validate")
                {
                    foreach (var cT in (Newtonsoft.Json.Linq.JArray)sc["cases"])
                    {
                        var c = (Newtonsoft.Json.Linq.JObject)cT;
                        string got = WbSave.ValidateSaveData(c["input"]);
                        var expectTok = c["expect"];
                        string expect = expectTok == null || expectTok.Type == JTokenType.Null ? null : expectTok.ToString();
                        Assert.AreEqual(expect ?? "null", got ?? "null", $"validate {c["name"]}");
                    }
                }
                else Assert.Fail("未知场景组 " + name);
            }
        }

        private static byte[] HexToBytes(string hex)
        {
            var b = new byte[hex.Length / 2];
            for (int i = 0; i < b.Length; i++) b[i] = Convert.ToByte(hex.Substring(i * 2, 2), 16);
            return b;
        }
    }

    // ============================================================
    // M-U6b 存档容器恢复全链黄金回放（save2.json：R 容器恢复 / X 抛错文案 / W unitsToRows 写向）
    // C# 第三链：镜像（181 断言逐位）+ gen sanity（54+det）已双绿；本链做结构性 + 抽样位级对账
    // ============================================================
    public class WbSaveRestoreGoldenTests
    {
        private JObject _gold;
        private JObject _lifted;

        private static string FindGolden2(string fileName)
        {
            var candidates = new[]
            {
                System.IO.Path.Combine("Assets", "StreamingAssets", "WbGolden", fileName),
                System.IO.Path.Combine("..", "..", "StreamingAssets", "WbGolden", fileName),
                fileName,
            };
            foreach (var p in candidates) if (System.IO.File.Exists(p)) return p;
            throw new System.IO.FileNotFoundException("黄金文件未找到: " + fileName);
        }

        [OneTimeSetUp]
        public void Load()
        {
            _gold = JObject.Parse(System.IO.File.ReadAllText(FindGolden2("save2.json")));
            _lifted = (JObject)_gold["lifted"];
        }

        private WbSaveHost MkHost()
        {
            // 每场景重建（host Races/ItemDefs 为 C# 注册表克隆源，跨场景无污染）
            var h = new WbSaveHost();
            foreach (var kv in (JObject)_lifted["races"]) h.Races[kv.Key] = (JObject)((JObject)kv.Value).DeepClone();
            foreach (var kv in (JObject)_lifted["itemDefs"]) h.ItemDefs[kv.Key] = (JObject)((JObject)kv.Value).DeepClone();
            foreach (var kv in (JObject)_lifted["slotField"]) h.SlotField[kv.Key] = kv.Value.ToString();
            foreach (var t in (JArray)_lifted["toolIds"]) h.ToolIds.Add(t.ToString());
            foreach (var t in (JArray)_lifted["techKeys"]) h.TechKeys.Add(t.ToString());
            foreach (var t in (JArray)_lifted["techCats"]) h.TechCats.Add(t.ToString());
            foreach (var t in (JArray)_lifted["actionKinds"]) h.ActionKinds.Add(t.ToString());
            foreach (var t in (JArray)_lifted["eventKinds"]) h.EventKinds.Add(t.ToString());
            h.DynTints = ((JArray)_lifted["dynTints"]).Select(t => t.ToString()).ToArray();
            h.AllianceColors = ((JArray)_lifted["allianceColors"]).Select(t => t.ToString()).ToArray();
            h.StormNames = ((JArray)_lifted["stormNames"]).Select(t => t.ToString()).ToArray();
            h.BaseCivRaces = ((JArray)_lifted["baseCivRaces"]).Select(t => (int)t).ToArray();
            h.WaterT = ((JArray)_lifted["waterT"]).Select(t => (int)t).ToArray();
            h.IceT = _lifted["iceT"].Value<int>();
            h.ZombieR = _lifted["zombieR"].Value<int>();
            h.AshCells = _lifted["ashCells"].Value<int>();
            h.DefaultLaws = (JObject)_lifted["defaultLaws"].DeepClone();
            foreach (var t in (JArray)_gold["casusTable"]) h.CasusTable.Add((JArray)t.DeepClone());
            return h;
        }

        private static double BitsOf2(string hex) => BitConverter.Int64BitsToDouble(unchecked((long)Convert.ToUInt64(hex, 16)));

        private JObject ScenarioInput(string name) => (JObject)_gold["inputs"][name].DeepClone();

        [Test]
        public void Test16_SaveRestore_Golden()
        {
            var scenByName = new System.Collections.Generic.Dictionary<string, JObject>();
            foreach (var sc in (JArray)_gold["scenarios"]) scenByName[(string)sc["name"]] = (JObject)sc;

            // —— R-legacy：容器恢复全分支 richest 场景 ——
            var hostL = MkHost();
            foreach (var row in (JArray)scenByName["R-legacy"]["techMods"])
                hostL.TechMods.Add(new[] { row[0].Value<double>(), BitsOf2(row[1].ToString()), BitsOf2(row[2].ToString()) });
            var stL = WbSave2.ApplySave(ScenarioInput("R-legacy"), hostL);
            var gL = scenByName["R-legacy"];
            Assert.AreEqual(gL["scalars"]["seed"].Value<int>(), stL.Seed);
            Assert.AreEqual(gL["scalars"]["tickCount"].Value<int>(), stL.TickCount);
            Assert.AreEqual(gL["scalars"]["eventSeq"].Value<int>(), stL.EventSeq);
            Assert.AreEqual(gL["scalars"]["armySeq"].Value<int>(), stL.ArmySeq);
            Assert.AreEqual(gL["scalars"]["dynSeq"].Value<int>(), stL.DynSeq);
            Assert.AreEqual(gL["scalars"]["weapSeq"].Value<int>(), stL.WeapSeq);
            Assert.AreEqual(gL["scalars"]["traitSeq"].Value<int>(), stL.TraitSeq);
            Assert.AreEqual(gL["scalars"]["allianceSeq"].Value<int>(), stL.AllianceSeq);
            Assert.AreEqual(gL["scalars"]["emTechSeq"].Value<int>(), stL.EmTechSeq);
            Assert.AreEqual(gL["scalars"]["ideaSeq"].Value<int>(), stL.IdeaSeq);
            Assert.AreEqual(gL["scalars"]["rngA"].ToString(), "0x" + stL.RngA.ToString("x8"), "rngA（重播种+visFromGene 消耗链）");
            Assert.AreEqual(gL["units41"].Count(), stL.Units.Count, "units41 行数（999 护栏丢弃）");
            Assert.IsFalse(stL.UnitById.ContainsKey(10050), "未知种族 999 丢弃");
            var dynIds = stL.DynRaces.Keys.OrderBy(x => x).ToList();
            CollectionAssert.AreEqual(new[] { 100, 101, 102 }, dynIds, "dyn races 重注册集（103 父种丢失丢弃）");
            Assert.IsTrue(stL.CivRaces.Contains(102), "102 文明亚种入 CIV_RACES");
            Assert.AreEqual("#a0ff8f", stL.RacesOut[102]["dynTint"].ToString(), "tintIdx 9 → clamp 7");
            Assert.IsTrue(JToken.DeepEquals(gL["dyn"]["races"][2]["def"]["vis"], WbSave2.VisToTuple(stL.RacesOut[102]["vis"])), "102 vis 元组逐位");
            Assert.IsNotNull(stL.RacesOut[101]["vis"]["root"], "101 缺 vis → visFromGene 兜底");
            Assert.AreEqual(2, (int)stL.EmergentWeapons[5]["pl"], "武器 5 dtype1 fire>0.4 → pl 2");
            Assert.AreEqual(6, (int)stL.EmergentWeapons[6]["pl"], "武器 6 dtype 9→4 → pl 6");
            Assert.AreEqual(1, stL.Doctrines.Count, "dctr 损坏行跳过");
            Assert.AreEqual(1.5, stL.Doctrines[2][0], 1e-12, "doctrine precision 无 clamp 真值");
            Assert.AreEqual(1, stL.Defenses.Count);
            Assert.AreEqual(0.0, stL.Defenses[1][0], 1e-12, "point -3 → clamp 0");
            Assert.AreEqual(999.0, stL.Defenses[1][1], 1e-12, "armor 999 不设上限");
            // 军团对账倒序怪味：army2/army1 后处理改写存活单位 u.army 残留
            Assert.AreEqual(1, stL.Armies.Count, "仅 army4 存活");
            Assert.AreEqual(4, (int)stL.UnitById[10001]["army"], "10001 → army4");
            Assert.AreEqual(2, (int)stL.UnitById[10005]["army"], "10005 → army2 残留（倒序对账怪味）");
            Assert.AreEqual(1, (int)stL.UnitById[10002]["army"], "10002 → army1 残留（army1 解散）");
            // warData normalize + casusText 宿主查表
            Assert.AreEqual("", stL.WarData["0|5"]["reasonText"].ToString(), "死文明行 reasonText '' 兜底");
            Assert.AreEqual("annex", stL.WarData["0|5"]["reason"].ToString());
            Assert.AreEqual(gL["warData"].First(w => (string)w["key"] == "0|1")["reasonText"].ToString(), stL.WarData["0|1"]["reasonText"].ToString(), "casusText 查表逐字");
            // 联盟 + 工坊
            Assert.AreEqual(2, stL.Alliances.Count);
            Assert.AreEqual("#84cc16", stL.Alliances[1]["colorHex"].ToString(), "色值兜底 ALLIANCE_COLORS[3]");
            Assert.AreEqual("长老", stL.RacesOut[2]["name"].ToString(), "rmods race2 name 补丁");
            Assert.AreEqual(1.0, stL.RacesOut[4]["hp"].Value<double>(), "rmods race4 hp -5 → clamp 1");
            Assert.IsTrue(stL.ItemMods.ContainsKey("sword1"), "imods sword1 补丁");
            CollectionAssert.AreEqual(new[] { "uid-1", "uid-2" }, stL.CreationRaceIds.Keys.OrderBy(k => k).ToList(), "creg 注册（999 跳过）");
            // 自然恢复：stormSeq spread 含损坏行 id+1（L15690 先于恢复循环）
            Assert.AreEqual(10, stL.Nature.StormSeq, "stormSeq = max(1,5,8,9,10)");
            Assert.AreEqual(2, stL.Nature.Storms.Count, "短风暴行跳过");
            Assert.AreEqual("轩岚", stL.Nature.Storms[0]["name"].ToString(), "STORM_NAME_AT(7)");
            Assert.AreEqual(0.1, stL.Nature.Storms[1]["strength"].Value<double>(), 1e-12, "strength 0.05 → clamp 0.1");
            Assert.AreEqual(3, stL.Nature.PlateEpoch, "plateEpoch 透传");
            Assert.IsNotNull(stL.Nature.PlateCx, "板块恢复分支命中（pcx 长度=plateN）");
            var expectCx = ((JArray)gL["expectPlateCx"]).Select(t => t.Value<double>()).ToArray();
            CollectionAssert.AreEqual(expectCx, stL.Nature.PlateCx, "plateCx 钳制面（宿主 recomputePlates 钩子前）");
            Assert.AreEqual(640, hostL.AshCells, "灰烬场格数 AW×AH=32×20");
            Assert.AreEqual(2, stL.Nature.AshF.Count, "ashF 越界行（ci=640）剔除");
            Assert.AreEqual("running", stL.WorldWar["phase"].ToString());
            CollectionAssert.AreEqual(new[] { 0, 1, 3 }, stL.WorldWar["belligerents"].Select(t => (int)t).ToArray(), "belligerents typeof number 过滤（3.5 → 3）");
            Assert.AreEqual(-600, stL.WwNuke, "wwTimers 复位");
            Assert.AreEqual(0, stL.Shake, "瞬态清空");

            // —— R-v1：trk/job legacy 迁移 ——
            var hostV1 = MkHost();
            foreach (var row in (JArray)scenByName["R-v1"]["techMods"])
                hostV1.TechMods.Add(new[] { row[0].Value<double>(), BitsOf2(row[1].ToString()), BitsOf2(row[2].ToString()) });
            var stV1 = WbSave2.ApplySave(ScenarioInput("R-v1"), hostV1);
            Assert.AreEqual("sword1", stV1.UnitById[20001]["wep"].ToString(), "trk → wep 迁移");
            Assert.AreEqual(0, (int)stV1.UnitById[20002]["job"], "job 缺省 0");

            // —— units41 全量逐位（42 列直读协议；unitsToRows 同构）——
            foreach (var name in new[] { "R-fixture", "R-legacy", "R-v1" })
            {
                var host = MkHost();
                foreach (var row in (JArray)scenByName[name]["techMods"])
                    host.TechMods.Add(new[] { row[0].Value<double>(), BitsOf2(row[1].ToString()), BitsOf2(row[2].ToString()) });
                var st = WbSave2.ApplySave(ScenarioInput(name), host);
                var rows = WbSave2.UnitsToRows(st.Units);
                var expect = (JArray)scenByName[name]["units41"];
                Assert.AreEqual(expect.Count, rows.Count - 1, $"{name} units41 行数");
                for (int i = 0; i < expect.Count; i++)
                    Assert.IsTrue(JToken.DeepEquals(expect[i], rows[i + 1]), $"{name} units41 行 {i} 逐位");
            }

            // —— W 组：unitsToRows 写方向（serialize save.u 对账）——
            foreach (var name in new[] { "W-fixture", "W-legacy" })
            {
                var host = MkHost();
                var st = WbSave2.ApplySave(ScenarioInput(name), host);
                var rows = WbSave2.UnitsToRows(st.Units);
                Assert.IsTrue(JToken.DeepEquals((JArray)scenByName[name]["save"]["u"], rows), $"{name} save.u 42 列逐位");
            }

            // —— X 组：rowToTrigger 抛错文案逐字 ——
            foreach (var name in new[] { "X-trigger-len", "X-trigger-cond", "X-trigger-condkind", "X-trigger-action" })
            {
                var host = MkHost();
                Exception caught = null;
                try { WbSave2.ApplySave(ScenarioInput(name), host); }
                catch (Exception e) { caught = e; }
                Assert.IsNotNull(caught, $"{name} 应抛错");
                Assert.AreEqual(scenByName[name]["threw"].ToString(), caught.Message, $"{name} 文案逐字");
            }
        }
    }
}
