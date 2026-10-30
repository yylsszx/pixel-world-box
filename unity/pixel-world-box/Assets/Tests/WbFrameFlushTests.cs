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

        // ================= M-U7y props 层增量机制语义面（engine.ts flushProps 域） =================

        const int T_FOREST = WbRender.T_FOREST;   // 4
        const int T_SNOW = WbRender.T_SNOW;       // 7

        /// <summary>props 栅格：新画布 + scale(2) 基变换（宿主 NewWorld 同构——用户 4px 格 → 设备 8px 格）</summary>
        static WbHostCanvas MakePropsCanvas()
        {
            var c = new WbHostCanvas(PW, PH);
            c.SetTransform(2, 0, 0, 2, 0, 0);   // 蓝本 propsCtx ×2 变换永不重置（engine.ts L750）
            return c;
        }

        // ---------------- markPropsDirty 单 tile 语义（engine.ts L978 位点——无四邻，对照 markDirty L959-967） ----------------

        [Test]
        public void Test28_MarkPropsDirty_SingleTile_NoNeighbors()
        {
            var d = new HashSet<int>();
            WbFrameFlush.MarkPropsDirty(d, 5 * W + 5);        // 内部点 → 仅本体（蓝本 propsDirty 无四邻语义）
            Assert.That(d, Is.EquivalentTo(new[] { 5 * W + 5 }));
            d.Clear();
            WbFrameFlush.MarkPropsDirty(d, 0);                // 角点同型（无边界卫分支——纯 Add）
            Assert.That(d, Is.EquivalentTo(new[] { 0 }));
        }

        // ---------------- flushProps 早退门（engine.ts L14300） ----------------

        [Test]
        public void Test28_FlushProps_EarlyExit_NoTouch()
        {
            var st = MakeState();
            var canvas = MakePropsCanvas();
            var before = (byte[])canvas.Px.Clone();
            var d = new HashSet<int>();
            var box = WbFrameFlush.FlushProps(st, canvas, d);
            Assert.That(box.Any, Is.False);                   // 净帧零上传
            Assert.That(canvas.Px, Is.EquivalentTo(before));  // 早退门零触碰持久栅格
            Assert.That(d, Is.Empty);
        }

        // ---------------- flushProps 盒换算（engine.ts L14416-14422 安全垫 -12/-14/+22） ----------------

        [Test]
        public void Test28_FlushProps_BoxConversion_SafetyPad()
        {
            var st = MakeState();
            var canvas = MakePropsCanvas();
            var d = new HashSet<int>();
            const int tile = 40 * W + 40;                     // 内部点 tile (40,40)
            st.terrain[tile] = T_FOREST;                      // 树 tile（fill 域非平凡——保证盒来自真实 flush）
            WbFrameFlush.MarkPropsDirty(d, tile);
            var box = WbFrameFlush.FlushProps(st, canvas, d);
            // 蓝本式：bx=max(0,40*8-12)=308, by=max(0,40*8-14)=306, bx1=min(2048,40*8+22)=342, by1=342
            Assert.That(box.Any, Is.True);
            Assert.That(box.X, Is.EqualTo(308));
            Assert.That(box.Y, Is.EqualTo(306));
            Assert.That(box.Width, Is.EqualTo(34));
            Assert.That(box.Height, Is.EqualTo(36));
            Assert.That(d, Is.Empty);                         // L14415 flush 后清空
        }

        // ---------------- flushProps 树绘制 + 清除语义（clearRect 外扩 + 分支着色） ----------------

        [Test]
        public void Test28_FlushProps_TreePaint_ThenClear_WipesCanopy()
        {
            var st = MakeState();
            var canvas = MakePropsCanvas();
            var d = new HashSet<int>();
            const int tx = 50, ty = 60;
            const int tile = ty * W + tx;
            st.terrain[tile] = T_FOREST;
            WbFrameFlush.MarkPropsDirty(d, tile);
            WbFrameFlush.FlushProps(st, canvas, d);
            // 树冠溢出区（tile 上方设备行 ty*8-6 .. ty*8-1——clearRect 外扩 y*4-3 用户 ×2）非零 alpha（树冠 Fill 落地）
            bool canopyPainted = false;
            for (int y = ty * 8 - 6; y < ty * 8; y++)
                for (int x = tx * 8; x < tx * 8 + 8; x++)
                    if (canvas.Px[(y * PW + x) * 4 + 3] != 0) canopyPainted = true;
            Assert.That(canopyPainted, Is.True, "树冠溢出区应有树像素（bails 真实现展开面）");
            // 翻转 GRASS（蓝本 setTerrain→propsDirty 位点）→ 增量 flush → 冠区清零（clearRect alpha 0 语义——草饰不触达冠区）
            st.terrain[tile] = T_GRASS;
            WbFrameFlush.MarkPropsDirty(d, tile);
            WbFrameFlush.FlushProps(st, canvas, d);
            for (int y = ty * 8 - 6; y < ty * 8; y++)
                for (int x = tx * 8; x < tx * 8 + 8; x++)
                    Assert.That(canvas.Px[(y * PW + x) * 4 + 3], Is.EqualTo(0),
                        $"冠区 ({x},{y}) 翻转后应清零——clearRect(x*4-2,y*4-3,9,10) 外扩语义");
        }

        // ---------------- PropsPaint↔PropsBake 等价（bail 路由展开面） ----------------

        [Test]
        public void Test28_PropsPaint_TreeOpsEqualDirectSpriteCall()
        {
            var st = MakeState();
            const int tile = 30 * W + 30;
            st.terrain[tile] = T_FOREST;
            var canvas = MakePropsCanvas();
            var d = new HashSet<int>();
            WbFrameFlush.MarkPropsDirty(d, tile);
            WbFrameFlush.FlushProps(st, canvas, d);
            // 参照面：PropsBake bail 参数解码 → WbSprites.DrawTree 直调 fill 流（Test 黄金面同源 L3140）
            var scratch = new WbDrawList();
            WbRender.PropsBake(st, tile, scratch);
            var refList = new WbDrawList();
            foreach (var b in scratch.bails)
                WbSprites.DrawTree(refList, HexD(b.a[0]), HexD(b.a[1]), (int)HexD(b.a[2]), (int)HexD(b.a[3]));
            var refCanvas = MakePropsCanvas();
            refCanvas.PlayOps(refList);
            // 树像素域逐位一致（参照面只画树——对比域限树 Fill 覆盖面：x∈[tx8,tx8+8) 排除邻格装饰溢出，
            //  y∈[ty8-6,ty8+8) = 树冠溢出 ∪ 本格；FlushProps 路径 clearRect 后画树 ≡ 参照面空白底画树）
            for (int y = (ty8(tile) - 6); y < ty8(tile) + 8; y++)
                for (int x = tx8(tile); x < tx8(tile) + 8; x++)
                    for (int ch = 0; ch < 4; ch++)
                        Assert.That(canvas.Px[(y * PW + x) * 4 + ch],
                            Is.EqualTo(refCanvas.Px[(y * PW + x) * 4 + ch]),
                            $"树像素 ({x},{y}) ch{ch} ——PropsPaint bail 展开与 DrawTree 直调逐位等价");
        }

        static int tx8(int tile) { return (tile % W) * 8; }
        static int ty8(int tile) { return (tile / W) * 8; }
        static double HexD(string h)
        {
            long bits = 0;
            for (int i = 7; i >= 0; i--)
                bits = (bits << 8) | (long)(System.Convert.ToInt32(h[i * 2].ToString(), 16) * 16 +
                                            System.Convert.ToInt32(h[i * 2 + 1].ToString(), 16));
            return System.BitConverter.Int64BitsToDouble(bits);
        }

        // ---------------- 雪人尾支（snowman fill 落地——L3046/L3070 位点着色面） ----------------

        [Test]
        public void Test28_FlushProps_SnowmanTailBranch()
        {
            var st = MakeState();
            var canvas = MakePropsCanvas();
            var d = new HashSet<int>();
            const int tx = 70, ty = 90;
            st.terrain[ty * W + tx] = T_SNOW;
            st.snowman[ty * W + tx] = 1;                      // 蓝本 snowman 标记（RunPropsScenario 同构直灌）
            WbFrameFlush.MarkPropsDirty(d, ty * W + tx);
            WbFrameFlush.FlushProps(st, canvas, d);
            // 雪人头 #f4f9fd（user (px+1,py,2,2)→设备 (tx8+2,ty8,4,4)；煤眼 (px+1,py,1,1) 覆盖左半、
            //  胡萝卜鼻 (px+2,py+1,1,1) 覆盖右下——净白残域 = (tx8+4..tx8+6)×(ty8..ty8+2)）应含不透明白
            bool headFound = false;
            for (int y = ty * 8; y < ty * 8 + 4; y++)
                for (int x = tx * 8 + 2; x < tx * 8 + 6; x++)
                {
                    int o = (y * PW + x) * 4;
                    if (canvas.Px[o + 3] == 255 && canvas.Px[o] > 220 && canvas.Px[o + 1] > 230 && canvas.Px[o + 2] > 240) headFound = true;
                }
            Assert.That(headFound, Is.True, "雪人头 #f4f9fd 不透明白像素应落地（props 尾支）");
        }

        // ---------------- 迭代序决定论 + 增量≡全量（升序锚——WbFrameFlush 头注） ----------------

        [Test]
        public void Test28_FlushProps_OrderDeterminism_AndIncrementalEqualsFull()
        {
            var st = MakeState();
            // 局部混合地形（FOREST 簇 + SNOW 雪人 + GRASS 底——树冠交叠区序敏感域激活）
            for (int y = 20; y < 30; y++)
                for (int x = 20; x < 30; x++)
                {
                    int i = y * W + x;
                    st.terrain[i] = (byte)(((x + y) % 3 == 0) ? T_FOREST : T_GRASS);
                    st.snowman[i] = (byte)(((x * 7 + y * 13) % 11 == 0 && st.terrain[i] == T_SNOW) ? 1 : 0);
                }
            st.terrain[24 * W + 24] = T_SNOW; st.snowman[24 * W + 24] = 1;
            // 路径 A：全量（L15907 for 升序插入）
            var canvasA = MakePropsCanvas();
            var dA = new HashSet<int>();
            WbFrameFlush.MarkAllPropsDirty(dA);
            WbFrameFlush.FlushProps(st, canvasA, dA);
            // 路径 B：降序插入（迭代序对抗）+ 分块 flush（多帧增量形态）
            var canvasB = MakePropsCanvas();
            var dB = new HashSet<int>();
            for (int i = W * H - 1; i >= 0; i--) dB.Add(i);
            for (int lo = 0; lo < W * H; lo += 5000)          // 分块增量（升序块界）
            {
                dB.Clear();                                    // 仅保留当前块（升序子集——FlushProps 内部排序决定论）
                for (int i = System.Math.Min(lo + 5000, W * H) - 1; i >= lo; i--) dB.Add(i);
                WbFrameFlush.FlushProps(st, canvasB, dB);
            }
            Assert.That(canvasB.Px, Is.EqualTo(canvasA.Px),
                "降序插入 + 分块增量 ≡ 升序全量——升序迭代决定论（交叠区序敏感域覆盖）；EqualTo 逐位位置比较");
        }
    }
}
