// ============================================================
// WbFrameFlushTests.cs — M-U7j 性能域：地形层脏瓦片增量机制语义面（NUnit）
// 蓝本锚：engine.ts flushDirty 域（L708/L950/L959-967/L14016-14296）——
//   WbFrameFlush.cs 机械翻译件。tile 重着色复用 WbRender.TerrainBake（Test18/20 黄金面同源），
//   本套件锁定脏簿记骨架语义：markDirty 四邻 / 早退门 / 盒换算 / 增量 flush ≡ 全量 Bake 自证。
// 宿主域语义件先例（M-U7b WbHostCanvas Test24）：不进黄金对账面，NUnit 语义面 + 全量回归。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System.Collections.Generic;
using System.Diagnostics;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbFrameFlushTests
    {
        const int T_GRASS = WbRender.T_GRASS;   // 3
        const int T_SAND = WbRender.T_SAND;     // 2
        const int W = WbFrameFlush.W, H = WbFrameFlush.H, PW = WbFrameFlush.PW, PH = WbFrameFlush.PH;

        /// <summary>合成渲染态：纯 GRASS 场 + 确定性 variant（细噪点/装饰点域激活），其余零值</summary>
        static WbRenderState MakeState()
        {
            var st = new WbRenderState();
            for (int i = 0; i < W * H; i++)
            {
                st.terrain[i] = T_GRASS;
                st.variant[i] = (byte)((i * 7 + 13) & 255);   // 确定性变体（0-255 全值域滚动）
                st.owner[i] = -1;
            }
            return st;
        }

        /// <summary>引用实现：全量烘焙（逐 tile 同源 TerrainBake——增量机制的自证基准）</summary>
        static byte[] ReferenceBake(WbRenderState st) => WbTerrainFull.Bake(st);

        // ---------------- markDirty 四邻语义（engine.ts L959-967） ----------------

        [Test]
        public void Test28_MarkDirty_Interior_FiveTiles()
        {
            var d = new HashSet<int>();
            WbFrameFlush.MarkDirty(d, 5 * W + 5);             // 内部点 → 本体 + 四邻
            Assert.That(d, Is.EquivalentTo(new[] {
                5 * W + 5, 5 * W + 4, 5 * W + 6, 4 * W + 5, 6 * W + 5 }));
        }

        [Test]
        public void Test28_MarkDirty_Corners_EdgeGuards()
        {
            var d = new HashSet<int>();
            WbFrameFlush.MarkDirty(d, 0);                     // (0,0) 西北角：无 i-1/i-W
            Assert.That(d, Is.EquivalentTo(new[] { 0, 1, W }));
            d.Clear();
            WbFrameFlush.MarkDirty(d, W * H - 1);             // (W-1,H-1) 东南角：无 i+1/i+W
            Assert.That(d, Is.EquivalentTo(new[] { W * H - 1, W * H - 2, W * (H - 1) - 1 }));
            d.Clear();
            WbFrameFlush.MarkDirty(d, 0 * W + (W - 1));       // 东北角 (W-1,0)：仅本体/西/南
            Assert.That(d, Is.EquivalentTo(new[] { W - 1, W - 2, 2 * W - 1 }));
        }

        // ---------------- flushDirty 早退门（engine.ts L14017） ----------------

        [Test]
        public void Test28_FlushDirty_EmptyEarlyExit_ZeroCost()
        {
            var st = MakeState();
            var px = new byte[PW * PH * 4];
            var d = new HashSet<int>();
            var box = WbFrameFlush.FlushDirty(st, px, d);
            Assert.That(box.Any, Is.False);                   // 净帧：无盒 → 宿主跳过上传
            Assert.That(d.Count, Is.EqualTo(0));
            foreach (byte b in px) Assert.That(b, Is.EqualTo(0));   // 持久缓冲零触碰
        }

        // ---------------- 增量 flush ≡ 全量 Bake 自证（单路径同源） ----------------

        [Test]
        public void Test28_FlushDirty_SingleTile_RegionMatchesBake()
        {
            var st = MakeState();
            var full = ReferenceBake(st);
            var px = new byte[PW * PH * 4];
            var d = new HashSet<int>();
            int i = 100 * W + 120;                            // 内部瓦片
            d.Add(i);                                         // 直加（单瓦片语义——绕过 MarkDirty 四邻）
            var box = WbFrameFlush.FlushDirty(st, px, d);
            Assert.That(box.Any, Is.True);
            Assert.That(box.X, Is.EqualTo(120 * 8));          // L14285 盒换算
            Assert.That(box.Y, Is.EqualTo(100 * 8));
            Assert.That(box.Width, Is.EqualTo(8));
            Assert.That(box.Height, Is.EqualTo(8));
            // 该 8×8 区域 ≡ 全量 Bake 同区域（单路径自证）
            for (int sy = 0; sy < 8; sy++)
                for (int sx = 0; sx < 8; sx++)
                {
                    int o = (((100 * 8) + sy) * PW + 120 * 8 + sx) * 4;
                    Assert.That(px[o], Is.EqualTo(full[o]), $"tile R ch ({sx},{sy})");
                    Assert.That(px[o + 1], Is.EqualTo(full[o + 1]), $"tile G ch ({sx},{sy})");
                    Assert.That(px[o + 2], Is.EqualTo(full[o + 2]), $"tile B ch ({sx},{sy})");
                    Assert.That(px[o + 3], Is.EqualTo(255));
                }
            // 区域外零触碰（增量语义）
            int outside = ((50 * 8) * PW + 50 * 8) * 4;
            Assert.That(px[outside], Is.EqualTo(0));
            Assert.That(px[outside + 2], Is.EqualTo(0));
            Assert.That(d.Count, Is.EqualTo(0));              // L14283 clear
            // 二次 flush = 净帧（Set 语义）
            var box2 = WbFrameFlush.FlushDirty(st, px, d);
            Assert.That(box2.Any, Is.False);
        }

        [Test]
        public void Test28_FlushDirty_MarkAllEqualsFullBake_ByteIdentical()
        {
            var st = MakeState();
            var full = ReferenceBake(st);
            var px = new byte[PW * PH * 4];
            var d = new HashSet<int>();
            WbFrameFlush.MarkAllDirty(d);                     // L950 全量失效
            Assert.That(d.Count, Is.EqualTo(W * H));
            var box = WbFrameFlush.FlushDirty(st, px, d);
            Assert.That(box.Any, Is.True);
            Assert.That(box.X, Is.EqualTo(0));
            Assert.That(box.Y, Is.EqualTo(0));
            Assert.That(box.Width, Is.EqualTo(PW));
            Assert.That(box.Height, Is.EqualTo(PH));
            CollectionAssert.AreEqual(full, px);              // 全量路径逐位 ≡ WbTerrainFull.Bake
        }

        // ---------------- 四邻标脏覆盖（软群系边缘混合 + 装饰点邻读） ----------------

        [Test]
        public void Test28_MarkDirty_NeighborBlend_RebakedRegionMatchesRebake()
        {
            var st = MakeState();
            var px = new byte[PW * PH * 4];
            var d = new HashSet<int>();
            // 初烘：GRASS 场全量（持久缓冲语义）
            WbFrameFlush.MarkAllDirty(d);
            WbFrameFlush.FlushDirty(st, px, d);
            // 变异：中心 tile GRASS→SAND（hardPair 0.5 混合 + 装饰点读邻 terrain）
            int ci = 80 * W + 40;
            st.terrain[ci] = T_SAND;
            WbFrameFlush.MarkDirty(d, ci);                    // L959-967：本体 + 四邻
            Assert.That(d.Count, Is.EqualTo(5));
            var box = WbFrameFlush.FlushDirty(st, px, d);
            Assert.That(box.Any, Is.True);
            // 宿主上传盒覆盖 5 tile 邻域（3×3 tile 包围盒）
            Assert.That(box.X, Is.EqualTo(39 * 8));
            Assert.That(box.Y, Is.EqualTo(79 * 8));
            Assert.That(box.Width, Is.EqualTo(3 * 8));
            Assert.That(box.Height, Is.EqualTo(3 * 8));
            // 变异后全量重烘引用 → 邻域区域逐位一致（四邻标脏完整性）
            var ref2 = ReferenceBake(st);
            for (int ty = 79; ty <= 81; ty++)
                for (int tx = 39; tx <= 41; tx++)
                    for (int sy = 0; sy < 8; sy++)
                        for (int sx = 0; sx < 8; sx++)
                        {
                            int o = ((ty * 8 + sy) * PW + tx * 8 + sx) * 4;
                            Assert.That(px[o], Is.EqualTo(ref2[o]), $"ch R tile({tx},{ty}) px({sx},{sy})");
                            Assert.That(px[o + 1], Is.EqualTo(ref2[o + 1]));
                            Assert.That(px[o + 2], Is.EqualTo(ref2[o + 2]));
                        }
        }

        // ---------------- 全局参失效路径（engine.ts L9730 全量先例） ----------------

        [Test]
        public void Test28_SeasonChange_MarkAll_EqualsRebake()
        {
            var st = MakeState();
            var px = new byte[PW * PH * 4];
            var d = new HashSet<int>();
            WbFrameFlush.MarkAllDirty(d);
            WbFrameFlush.FlushDirty(st, px, d);               // 初烘（夏？季节 0 起）
            st.season = 2;                                    // 秋 → tint 全场变化（宿主桥 MarkAll 语义）
            WbFrameFlush.MarkAllDirty(d);
            WbFrameFlush.FlushDirty(st, px, d);
            CollectionAssert.AreEqual(ReferenceBake(st), px); // 全局参后全量 ≡ 重烘
        }

        // ---------------- 性能量化（非断言——净帧成本比写入输出） ----------------

        [Test]
        public void Test28_PerfMicrobench_CleanFrameVsFullBake()
        {
            var st = MakeState();
            var px = new byte[PW * PH * 4];
            var d = new HashSet<int>();
            // 预热（JIT）
            WbFrameFlush.MarkAllDirty(d); WbFrameFlush.FlushDirty(st, px, d);
            var sw = Stopwatch.StartNew();
            for (int k = 0; k < 20; k++) ReferenceBake(st);   // 旧形态：每帧全烘 2.6M px
            sw.Stop();
            double bakeMs = sw.Elapsed.TotalMilliseconds / 20.0;
            sw.Restart();
            for (int k = 0; k < 100000; k++) WbFrameFlush.FlushDirty(st, px, d);   // 净帧早退
            sw.Stop();
            double cleanMs = sw.Elapsed.TotalMilliseconds / 100000.0;
            for (int k = 0; k < 16; k++) d.Add(k * 97 + 1001);
            sw.Restart();
            for (int k = 0; k < 1000; k++) { for (int j = 0; j < 16; j++) d.Add(j * 97 + 1001); WbFrameFlush.FlushDirty(st, px, d); }
            sw.Stop();
            double flush16Ms = sw.Elapsed.TotalMilliseconds / 1000.0;
            TestContext.Out.WriteLine(
                $"[M-U7j perf] full Bake = {bakeMs:F3} ms | clean-flush early-exit = {cleanMs * 1000:F1} us " +
                $"(净帧省 {bakeMs / (cleanMs + 1e-9):F0}× bake + 10MB 上传) | 16-tile flush = {flush16Ms:F3} ms");
            Assert.That(cleanMs, Is.LessThan(bakeMs));        // 净帧必然远廉（方向性断言，非定时脆断）
        }
    }
}
