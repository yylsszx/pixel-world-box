// ============================================================
// WbGoldenTests.cs — M-U2a 黄金向量对账（NUnit）
// 黄金数据: Assets/StreamingAssets/WbGolden/units_move.json
//   由 scripts/unity-migration/gen-units-move.mjs 生成（真实现 = wbcore.wasm，
//   双跑确定性 + 健全性断言已在生成时通过）。
// 验证链（纪律④）: 黄金向量(wasm) → 本文件 NUnit 逐位(bits 精确) → 网页 parity/冒烟。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Newtonsoft.Json;
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
        public double x, y, tx, ty;
        public double? speed, chill, curse, hp;
        public double? food;                 // 缺省 = NaN（u_has_food=false）
    }
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

        public static GoldenFile Load()
        {
            string path = FindGolden();
            Assert.IsTrue(File.Exists(path), $"golden json not found: {path}");
            return JsonConvert.DeserializeObject<GoldenFile>(File.ReadAllText(path));
        }

        private static string FindGolden()
        {
            string[] candidates =
            {
                "Assets/StreamingAssets/WbGolden/units_move.json",
                Path.Combine(TestContext.CurrentContext.TestDirectory, "Assets/StreamingAssets/WbGolden/units_move.json"),
                Path.Combine(Directory.GetParent(ApplicationDataPath()).FullName, "Assets/StreamingAssets/WbGolden/units_move.json"),
            };
            foreach (var c in candidates) if (File.Exists(c)) return c;
            return candidates[0];
        }

        // UnityEngine.Application.dataPath（EditMode TestRunner cwd = 工程根）
        private static string ApplicationDataPath() => "Assets";

        // —— 输入布置（与 gen-units-move.mjs initWorld/fillTerrain/setupRaces/putUnit 同构；
        //    offs 自算布局，黄金对账 Test 1 会先锁布局）——
        public void InitWorld(long seed, int fxp)
        {
            Arena = new WbArena();
            Assert.IsTrue(Arena.Init(WbConstants.W, WbConstants.H, WbConstants.MAX_UNITS), "wb_init failed");
            Arena.SetU32(WbConstants.OFF_RNGS, 0, unchecked((uint)seed));
            Arena.SetU8(WbConstants.OFF_LAWS, 0, 0);
            Arena.SetU8(WbConstants.OFF_FXP, 0, (byte)fxp);
            Arena.SetU32(WbConstants.OFF_ITMN, 0, 0);
            Arena.SetU8(WbConstants.OFF_COLEN, 0, 0);
            Arena.SetU8(WbConstants.OFF_NCTL, 0, 0);
            Arena.SetI32(WbConstants.OFF_MISC, 0, WbConstants.MAX_UNITS);
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
            A.SetU32(WbConstants.OFF_UID, u.slot, (uint)u.slot);
            A.SetU32(WbConstants.OFF_URACE, u.slot, (uint)u.race);
            A.SetU32(WbConstants.OFF_UCELL, u.slot, (uint)((int)u.y * WbConstants.W + (int)u.x));
            A.SetF64(WbConstants.OFF_UX, u.slot, u.x);
            A.SetF64(WbConstants.OFF_UY, u.slot, u.y);
            A.SetF64(WbConstants.OFF_UTX, u.slot, u.tx);
            A.SetF64(WbConstants.OFF_UTY, u.slot, u.ty);
            A.SetF64(WbConstants.OFF_USPEED, u.slot, u.speed ?? 0.08);
            A.SetF64(WbConstants.OFF_UHP, u.slot, u.hp ?? 100);
            A.SetF64(WbConstants.OFF_UMAXHP, u.slot, 100);
            A.SetF64(WbConstants.OFF_UMAXAGE, u.slot, 9999);
            A.SetF64(WbConstants.OFF_UAGE, u.slot, 0);
            A.SetF64(WbConstants.OFF_UDMG, u.slot, 5);
            A.SetF64(WbConstants.OFF_UCHILL, u.slot, u.chill ?? 0);
            A.SetF64(WbConstants.OFF_UCURSE, u.slot, u.curse ?? 0);
            A.SetF64(WbConstants.OFF_UFD, u.slot, u.food ?? double.NaN);
            A.SetF64(WbConstants.OFF_UCVN, u.slot, 0);
            A.SetF64(WbConstants.OFF_UFLEET, u.slot, 0);
            A.SetF64(WbConstants.OFF_UBLESS, u.slot, 0);
            A.SetF64(WbConstants.OFF_UFERT, u.slot, 0);
            A.SetF64(WbConstants.OFF_UDETOUR, u.slot, 0);
            A.SetF64(WbConstants.OFF_UHURT, u.slot, 0);
            A.SetF64(WbConstants.OFF_UATK, u.slot, 0);
            A.SetF64(WbConstants.OFF_UCD, u.slot, 0);
            A.SetF64(WbConstants.OFF_UBREATH, u.slot, 0);
            A.SetI32(WbConstants.OFF_UCIV, u.slot, -1);
            A.SetI32(WbConstants.OFF_UJOB, u.slot, -1);
            A.SetI32(WbConstants.OFF_UARMY, u.slot, -1);
            A.SetI32(WbConstants.OFF_UGLN, u.slot, -1);
            A.SetI32(WbConstants.OFF_UFAM, u.slot, -1);
            A.SetI32(WbConstants.OFF_UFGN, u.slot, -1);
            A.SetI32(WbConstants.OFF_USTK, u.slot, 0);
            A.SetU8(WbConstants.OFF_UDEAD, u.slot, 0);
            A.SetU8(WbConstants.OFF_UHASPANIC, u.slot, 0);
            A.SetU8(WbConstants.OFF_UINF, u.slot, 0);
            A.SetU8(WbConstants.OFF_UBOAT, u.slot, 0);
            A.SetU8(WbConstants.OFF_UFLIP, u.slot, 0);
            for (int g = 0; g < 4; g++) A.SetF64(WbConstants.OFF_UGENE, u.slot * 4 + g, 1);
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
                Arena.SetU32(WbConstants.OFF_UCELL, u.slot, (uint)((int)y * WbConstants.W + (int)x));
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
    }

    [TestFixture]
    public class WbGoldenTests
    {
        private GoldenFile _golden;
        private WbGoldenFixture _fx;

        [OneTimeSetUp]
        public void Load() => _golden = WbGoldenFixture.Load();

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

        private static ulong Bits(string hex)
        {
            string h = hex.StartsWith("0x") ? hex.Substring(2) : hex;
            return ulong.Parse(h, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        }
    }
}
