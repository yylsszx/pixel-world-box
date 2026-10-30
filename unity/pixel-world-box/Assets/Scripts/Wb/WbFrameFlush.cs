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
    }
}
