// WbFrameFlush.cs — M-U7j 性能域：地形层脏瓦片增量机制（engine.ts flushDirty 域机械翻译）
// ============================================================
// 蓝本锚（宿主域语义件，不进对账面——M-U7b WbHostCanvas 先例；tile 重着色复用已译
// WbRender.TerrainBake = flushDirty 逐 tile 段机械翻译〔Test18/20 黄金面同源〕，本件只译
// 脏簿记骨架，零新着色语义）：
//   - engine.ts L708  dirty: Set<number>（瓦片索引脏集）
//   - L959-967        markDirty(i)：本体 + 四邻（软群系边缘混合/装饰点读取邻 terrain →
//                     邻瓦片必须同步重烘；L963-966 边界卫）
//   - L950/L9730/L15903-15904  全量失效：世界生成 / 全局参（季节级）/ 读档重置
//   - L14016-14296    flushDirty()：L14017 size===0 早退（净帧零成本门）→ 逐脏瓦片重着色
//                     入 terrainImg.data（持久缓冲——旧版每帧全图 10MB CPU 拷贝之痛，
//                     L14020-14021 注记）→ 瓦片坐标包围盒累积（L14022-14029）→
//                     L14283 dirty.clear() → L14284-14285 盒换算设备像素
//                     {x:bminX*8, y:bminY*8, w:(bmaxX-bminX+1)*8, h:同式} →
//                     L14286 putImageData 脏矩形部分上传 → L14288-14295 terrainFlushBox
//                     并集（render 消费前多次 flush 求并）
//   - render.ts L1232 render 帧首 engine.flushDirty()；L874-877 syncStatic 消费脏盒后置 null
// 宿主接位（C# 分体架构桥）：蓝本 mutation 位点在 engine 类内联调用 markDirty；C# 域函数为
//   纯对账面不带渲染记账——宿主以「St 渲染面差分 → markDirty」桥接（WbGameHost.SyncTerrainDiffs），
//   并开放 MarkTileDirty/MarkAllDirty 显式接线 API 供未来域切片使用（等价内联记账位点）。
// 部分上传：putImageData 脏矩形（L14286）↔ Unity Texture2D.SetPixels32 盒上传（宿主域换算）。
// ============================================================
using System;
using System.Collections.Generic;

namespace PixelWorldBox.Wb
{
    public static class WbFrameFlush
    {
        public const int W = 256, H = 160;         // tile 网格（engine.ts W/H 同值域）
        public const int PW = W * 8, PH = H * 8;   // 设备像素幅面（terrainCanvas L741-742 锚）

        /// <summary>脏盒（设备像素；terrainFlushBox L713 语义——Any=false = 净帧无上传）</summary>
        public struct FlushBox
        {
            public bool Any;
            public int X, Y, Width, Height;
        }

        /// <summary>engine.ts L959-967 markDirty 机械翻译：本体 + 四邻（边界卫逐条对齐）</summary>
        public static void MarkDirty(HashSet<int> dirty, int i)
        {
            dirty.Add(i);                                   // L960
            int x = i % W;                                  // L961
            int y = i / W;                                  // L962
            if (x > 0) dirty.Add(i - 1);                    // L963
            if (x < W - 1) dirty.Add(i + 1);                // L964
            if (y > 0) dirty.Add(i - W);                    // L965
            if (y < H - 1) dirty.Add(i + W);                // L966
        }

        /// <summary>engine.ts L950/L9730/L15904 全量失效机械翻译（世界生成/全局参/读档重置）</summary>
        public static void MarkAllDirty(HashSet<int> dirty)
        {
            for (int i = 0; i < W * H; i++) dirty.Add(i);
        }

        /// <summary>
        /// engine.ts L14016-14296 flushDirty 机械翻译：逐脏瓦片重着色入持久缓冲 px
        /// （tile 重着色 = WbRender.TerrainBake 已译件，写位换算同 WbTerrainFull.Bake 内环），
        /// 包围盒累积（L14022-14029）→ clear（L14283）→ 设备像素盒换算（L14285）。
        /// 净帧（L14017 早退门）返回 Any=false——宿主跳过上传（putImageData 无脏矩形不调用）。
        /// 蓝本 L14288-14295 跨 flush 盒并集在宿主单帧单 flush 形态下不触发（并集语义由
        /// 多次 MarkDirty 后一次 flush 天然覆盖），如需跨帧并集由宿主侧持久盒承担。
        /// </summary>
        public static FlushBox FlushDirty(WbRenderState st, byte[] px, HashSet<int> dirty)
        {
            var box = default(FlushBox);
            if (dirty.Count == 0) return box;               // L14017 早退门
            int bminX = W, bminY = H, bmaxX = -1, bmaxY = -1;   // L14022
            var tile = new byte[64 * 4];                    // 8×8 px × RGBA 复用缓冲（TerrainBake 契约）
            foreach (int i in dirty)
            {
                int tx = i % W;                             // L14024
                int ty = i / W;                             // L14025
                if (tx < bminX) bminX = tx;                 // L14026
                if (tx > bmaxX) bmaxX = tx;                 // L14027
                if (ty < bminY) bminY = ty;                 // L14028
                if (ty > bmaxY) bmaxY = ty;                 // L14029
                WbRender.TerrainBake(st, i, tile);
                int gx = tx * 8, gy = ty * 8;
                for (int sy = 0; sy < 8; sy++)              // 写位 = WbTerrainFull.Bake 内环同构
                    Buffer.BlockCopy(tile, sy * 8 * 4, px, ((gy + sy) * PW + gx) * 4, 8 * 4);
            }
            dirty.Clear();                                  // L14283
            if (bmaxX >= 0)                                 // L14284
            {
                box.Any = true;
                box.X = bminX * 8;                          // L14285
                box.Y = bminY * 8;
                box.Width = (bmaxX - bminX + 1) * 8;
                box.Height = (bmaxY - bminY + 1) * 8;
            }
            return box;
        }

        // ================= M-U7y props 层增量机制（engine.ts flushProps 域宿主接位） =================
        // 蓝本锚（tile 着色复用已译件 WbRender.PropsBake = flushProps 逐 tile 段机械翻译〔props 黄金
        //   ops/bails 面 + WbSprites.DrawTree/DrawMountainProp Test 黄金面〕，本件只译脏簿记骨架 +
        //   真实现路由，零新着色语义——M-U7j 地形层同构）：
        //   - engine.ts L709  propsDirty: Set<number>（道具层脏集——单 tile 标记无四邻：
        //                     L978 setTerrain / L1926 修路 / L3046 雪人消融 / L3070 雪人堆筑；
        //                     对照地形 markDirty 四邻 L959-967——props 蓝本无四邻语义）
        //   - L952/L15906-15907  全量失效（newWorld / worldgen 重烘；L15907 for 升序插入序）
        //   - L14299-14440    flushProps()：L14300 size===0 早退门 → 逐脏 tile
        //                     clearRect(x*4-2, y*4-3, 9, 10)（用户 4px 格——外扩 2/3 px 树山溢出安全垫）
        //                     + 分支着色（FOREST→drawTree / MOUNTAIN→drawMountainProp / road / GRASS /
        //                     SAND / HILL / SNOW / BURNT + snowman 尾支 L14389-14413）→
        //                     L14415 propsDirty.clear() → L14416-14422 盒换算（设备像素安全垫
        //                     -12/-14/+22——clearRect 外扩 + 树冠溢出覆盖）→
        //                     L14423-14432 propsFlushBox 跨 flush 并集（render 消费前求并）
        // 蓝本位点注记：季节为 yearF 派生 getter（nature.ts L162）无独立失效位点——树/山季节精灵随
        //   tile 自然重触更新（Organic per-tile 刷新），宿主机械保真不补季节全量（伪影保真）。
        // 迭代序决定论：蓝本 Set=插入序（重叠 tile 的 clear/paint 交叠区序敏感）；C# HashSet 迭代序
        //   未指定 → 升序迭代（全量 pass L15907 for 升序插入 ≡ 升序迭代逐位同构；增量多 tile 相邻
        //   重叠区随升序确定——宿主域决定论锚，M-U7j 无此问题因地形 tile 间零交叠）。

        /// <summary>engine.ts L978/L1926/L3046/L3070 propsDirty 单 tile 标记机械翻译（无四邻——蓝本位点语义）</summary>
        public static void MarkPropsDirty(HashSet<int> dirty, int i) { dirty.Add(i); }

        /// <summary>engine.ts L952/L15906-15907 全量失效机械翻译（newWorld / worldgen 重烘）</summary>
        public static void MarkAllPropsDirty(HashSet<int> dirty)
        {
            for (int i = 0; i < W * H; i++) dirty.Add(i);
        }

        /// <summary>
        /// props tile 真实现绘制（M-U7y 宿主面）：PropsBake 对账面（黄金 ops/bails 锁定——RunPropsScenario）
        /// → ops 落地（clearRect + 分支 Fill 含雪人尾支——蓝本分支序）+ bails 真实现展开（M-U7a bail→
        /// WbSprites 直调先例——drawTree/drawMountainProp Fill-op 语义件，Test 黄金面锁定）。
        /// 序等价证明：FOREST/MOUNTAIN bail 支与 snowman 尾支地形互斥（雪人仅 SNOW 地形 L3070 门），
        /// ops 内序 + bails 后展开 ≡ 蓝本调用序。
        /// </summary>
        public static void PropsPaint(WbRenderState st, int i, WbHostCanvas canvas, WbDrawList scratch, WbDrawList sprites)
        {
            scratch.ops.Clear(); scratch.bails.Clear();
            WbRender.PropsBake(st, i, scratch);                       // 对账面单源（零漂移）
            canvas.PlayOps(scratch);                                  // clearRect/Fill 落地（bails 播放器契约跳过）
            sprites.ops.Clear();
            foreach (WbBail b in scratch.bails)
            {
                if (b.fn == "drawTree")                               // sprites.ts drawTree(propsCtx, x, y, variant, season)
                    WbSprites.DrawTree(sprites, HexD(b.a[0]), HexD(b.a[1]), (int)HexD(b.a[2]), (int)HexD(b.a[3]));
                else if (b.fn == "drawMountainProp")                  // sprites.ts drawMountainProp(propsCtx, x, y, variant, elev, cold)
                    WbSprites.DrawMountainProp(sprites, HexD(b.a[0]), HexD(b.a[1]), (int)HexD(b.a[2]), HexD(b.a[3]), HexD(b.a[4]));
                // 其余 fn 不存在于 props 域（PropsBail 仅两件——未知 fn 跳过同 PlayOps 不消费 bails 契约）
            }
            if (sprites.ops.Count > 0) canvas.PlayOps(sprites);
        }

        /// <summary>
        /// engine.ts L14299-14440 flushProps 机械翻译：逐脏 tile PropsPaint 入持久栅格 canvas
        /// （WbHostCanvas 2048×1280——用户 4px 格 × scale(2) 基变换 = 设备 8px 格；基变换由宿主
        /// 分配后一次性 SetTransform(2,0,0,2,0,0)——蓝本 propsCtx 变换永不重置 L750 同构），
        /// 包围盒累积（L14307-14320）→ clear（L14415）→ 设备像素盒换算（L14416-14422 安全垫）。
        /// 净帧（L14300 早退门）返回 Any=false——宿主跳过上传。蓝本 L14423-14432 propsFlushBox
        /// 跨 flush 并集在宿主单帧单 flush 形态不触发（M-U7j 地形层同构注记——并集语义由多次
        /// MarkPropsDirty 后一次 flush 天然覆盖；跨帧并集如需由宿主侧持久盒承担）。
        /// </summary>
        public static FlushBox FlushProps(WbRenderState st, WbHostCanvas canvas, HashSet<int> dirty)
        {
            var box = default(FlushBox);
            if (dirty.Count == 0) return box;                   // L14300 早退门
            var order = new List<int>(dirty); order.Sort();     // 升序迭代（决定论锚——见头注）
            int bminX = W, bminY = H, bmaxX = -1, bmaxY = -1;   // L14307-14320 tile 坐标盒累积
            var scratch = new WbDrawList();
            var sprites = new WbDrawList();
            foreach (int i in order)
            {
                int tx = i % W;                                 // L14309-14312 同构
                int ty = i / W;
                if (tx < bminX) bminX = tx;
                if (tx > bmaxX) bmaxX = tx;
                if (ty < bminY) bminY = ty;
                if (ty > bmaxY) bmaxY = ty;
                PropsPaint(st, i, canvas, scratch, sprites);
            }
            dirty.Clear();                                      // L14415
            if (bmaxX >= 0)                                     // L14416-14422 盒换算（设备像素安全垫机械翻译）
            {
                int bx = Math.Max(0, bminX * 8 - 12);
                int by = Math.Max(0, bminY * 8 - 14);
                int bx1 = Math.Min(PW, bmaxX * 8 + 22);
                int by1 = Math.Min(PH, bmaxY * 8 + 22);
                int bw = bx1 - bx, bh = by1 - by;
                if (bw > 0 && bh > 0)
                {
                    box.Any = true;
                    box.X = bx; box.Y = by; box.Width = bw; box.Height = bh;
                }
            }
            return box;
        }

        // ================= M-U7z sim→render 渲染面同步桥（蓝本单数组分体桥） =================
        // 蓝本语义：engine 单数组 sim/render 同体（this.terrain 直写即渲染可见——setTerrain L967
        //   内联 markDirty + propsDirty 记账；域内直写位点 L3567-3570 寒潮走 setTerrain 全记账链）。
        // C# 分体：sim 面 WbWorld.terrain/road/owner/radiate（域函数直写——setTerrain 簿记 no-op 域
        //   M-U7k 先例注记）vs 渲染面 WbRenderState 同名数组——宿主 tick 后逐值同步，SyncTerrainDiffs
        //   差分桥自动 MarkDirty + MarkPropsDirty 双记账（M-U7j/M-U7y 机制复用）→ 地形/props 双层点亮。
        // 升宽拷贝：w.road byte→st.road int / w.owner short→st.owner int / w.radiate byte→st.radiate double
        //   （St 面类型为渲染铁律冻结域——黄金面直灌同型；类型齐后可改引用共享 St.civs 先例 M-U7b）。
        // 桥不覆盖面（无 sim 写点）：snowman（雪人域未译）/ glacier（worldsim 未译）/ variant、
        //   waterTier（worldgen 渲染专属）——St 面维持灌注现状。
        /// <summary>逐值同步 sim 变更面 → 渲染面（净帧成本 4×40,960 拷贝 ≈ 0.1ms 级；与差分桥同频）</summary>
        public static void SyncWorldFace(WbWorld w, WbRenderState st)
        {
            for (int i = 0; i < W * H; i++)
            {
                st.terrain[i] = w.terrain[i];
                st.road[i] = w.road[i];               // byte→int 升宽
                st.owner[i] = w.owner[i];             // short→int 升宽
                st.radiate[i] = w.radiate[i];         // byte→double 升宽
            }
        }

        // f64 bits hex 解码（F64Hex 逆——bails 参数消费面；编码 WbRender.F64Hex L208 小端 16 hex 字符）
        static double HexD(string h)
        {
            long bits = 0;
            for (int i = 7; i >= 0; i--)
                bits = (bits << 8) | (long)(HexV4(h[i * 2]) * 16 + HexV4(h[i * 2 + 1]));
            return BitConverter.Int64BitsToDouble(bits);
        }
        static int HexV4(char c)
        {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'a' && c <= 'f') return c - 'a' + 10;
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            throw new FormatException("WbFrameFlush.HexD: bad hex char '" + c + "'");
        }
    }
}
