// WbGameHost.cs — M-U7 整合 b：世界宿主装配薄壳（宿主域，Unity only；Unity 可跑验收入口）
// ============================================================
// 装配拓扑：
//   本壳（GameObject + WbGameHost + WbCameraRig）→ Texture2D(2048×1280 RGBA32) ← TerrainFull.Bake
//   Sprite（PPU=8 → 256×160 世界单位，1 tile = 1 单位）→ SpriteRenderer → Camera.main（正交）。
//   M-U7i UnitScene 精灵层播放接线：WbRender.UnitScene（M-U7a 直调产 op 流，Test18/20 黄金面）→
//   WbHostCanvas.PlayOps（Test24 语义面）逐帧合成 2048×1280 透明单位层 → 第二 SpriteRenderer
//   （terrain 之上，同 y 翻转协议）；St.civs 引用同步 + St.terrainAt 相机中心 tile 直灌（黄金单 tile
//   协议同构）+ St.frameCount 逐帧推进（sun/恐慌闪烁周期）。演示单位为宿主占位（退役条件 =
//   spawnUnit 宿主接线落位〔updateUnit 切片随件〕）。
//   M-U7j 性能域：地形层脏瓦片增量机制（engine.ts flushDirty 域机械翻译 = WbFrameFlush）——
//   持久缓冲 + dirty Set 早退门（L14017）+ SetPixels32 脏盒部分上传（putImageData 脏矩形 L14286
//   同构）+ tick 后 St 渲染面差分标脏桥（蓝本 mutation 位点内联 markDirty 的 C# 分体桥）。
//   旧版每帧全烘 2,621,440 px + 10MB 重分配上传（性能域欠账）——净帧零烘零上传。
//   M-U7k 河域：generate() L905-949 宿主等价全链——SoilInit（worldsim L125）→ spawnUnit 重放
//   （L936，M-U3h 译件）→ SeedRivers（nature.ts L1094-1108，nature.rng 独立流）→
//   RebuildWaterTiers（L949）；engine.rngA = (seed ^ 0x9e3779b9)>>>0（L773）同流续抽。
//   SpawnDemoUnits 演示占位退役（M-U7i 注记退役条件达成——真动物即 gen.SpawnAnimals 重放）。
// 蓝本锚：
//   - TICK_MS = 66（constants.ts L8，~15tps）
//   - frame() 主循环：acc 累计 + 逐 tick 让出 + 30 步硬上限（engine.ts L2708-2732 机械对齐；
//     帧预算实测域（performance.now 消费）不进本壳——宿主域简化为步数上限同构）
//   - cam 初值 (128, 80, 4.5)（engine.ts L681）
// 真地形落位（M-U7g）：WbWorldgen.GenerateWorld（M-U7f' 黄金链）直灌 + WbWorldgen.RebuildWaterTiers
//   （水深域 L1011-1050 机械翻译，黄金 waterdepth.json 4 场景 + 镜像 4/4 + Test27）——演示 value-noise
//   占位退役。域口径：pre-river（蓝本 generate L939 seedRivers 刻河属 nature.ts 未译域，河网切片落位
//   时宿主须刻河后重算水深）；gen.spawnAnimals → spawnUnit（L936）留 unitsTick 切片接线。
// sim 接线：engine.tick() 母体编排已译（M-U7c' WbTickOrch——黄金 tick_orch.json 61 槽位对账面全绿）。
//   本壳默认装配已译子域真调（RebuildCivBuildCounts/Civs/Tech/Economy/Society/Alliance/Directive/Army
//   ——空世界安全：域函数顶展 w.civs 空表 no-op）；其余槽位留空待后续切片填肉。
//   TickDelegate 保留为调试/自定义注入点（优先级低于 Orch 默认装配）。
// ============================================================
using System.Collections.Generic;
using UnityEngine;

namespace PixelWorldBox.Host
{
    public class WbGameHost : MonoBehaviour
    {
        public const int TickMs = 66;                 // constants.ts L8
        public const int MaxStepsPerFrame = 30;       // engine.ts L2728 硬上限

        [Header("World")]
        public int speed = 0;                         // 0 = 暂停（engine this.speed 语义）
        public uint seed = 20261029;                  // worldgen 种子（蓝本 generate(seed) 域——gen-waterdepth S1 同源）

        [Header("Scene")]
        public SpriteRenderer terrainRenderer;        // 空则 Awake 自动建
        public WbCameraRig rig;

        /// <summary>sim 子域接线点（调试/自定义注入；默认走 Orch 装配——见 WireOrch）</summary>
        public System.Action<PixelWorldBox.Wb.WbWorld> TickDelegate;

        /// <summary>tick() 母体编排骨架（M-U7c'；61 调度槽）——NewWorld 时装配</summary>
        public PixelWorldBox.Wb.WbTickOrch Orch;

        public PixelWorldBox.Wb.WbWorld World { get; private set; }
        public PixelWorldBox.Wb.WbRenderState St { get; private set; }

        [Header("Unit Layer (M-U7i)")]
        public SpriteRenderer unitRenderer;           // 空则 EnsureScene 自动建（terrain 之上）

        [Header("Props Layer (M-U7y)")]
        public SpriteRenderer propsRenderer;          // 空则 EnsureScene 自动建（terrain 与 units 之间——蓝本 propsCanvas 层序）

        Texture2D _tex;
        Texture2D _unitTex;
        Texture2D _propsTex;                          // 道具层持久纹理（M-U7y——terrain 同规格 2048×1280）
        PixelWorldBox.Wb.WbHostCanvas _propsCanvas;   // 道具层持久栅格（蓝本 propsCanvas 同构；scale(2) 基变换一次）
        float _acc;
        byte[] _frame;                                // 地形层持久缓冲（M-U7j：分配一次，flush 就地更新）
        readonly HashSet<int> _dirty = new HashSet<int>();   // 脏瓦片集（engine.ts L708 dirty 语义）
        readonly HashSet<int> _propsDirty = new HashSet<int>();   // 道具层脏集（engine.ts L709 propsDirty 语义——单 tile 标记）
        // St 渲染面差分快照（M-U7j 宿主桥：域函数为纯对账面不带 markDirty 记账 → tick 后差分标脏）
        byte[] _shTerrain, _shVariant, _shWaterTier, _shGlacier, _shSnowman;   // _shSnowman：M-U7y props 差分源（L3046/L3070 位点）
        int[] _shRoad, _shOwner;
        double[] _shRadiate;
        int _shSeason = int.MinValue; double _shAsh = double.NaN; long _shCivSig = long.MinValue;
        PixelWorldBox.Wb.WbHostCanvas _canvas;        // 单位层持久栅格（canvas 语义：clear 增量机同构）

        void Awake()
        {
            NewWorld();
            EnsureScene();
        }

        /// <summary>世界构建 + 真地形落位（M-U7g：GenerateWorld + 水深全量重算；蓝本 generate L771-952 宿主等价）</summary>
        public void NewWorld()
        {
            World = new PixelWorldBox.Wb.WbWorld();
            St = new PixelWorldBox.Wb.WbRenderState
            {
                camX = 128, camY = 80, camZoom = 4.5,   // engine.ts L681
                fxDayNight = true, fxHpBars = true,     // engine fxPrefs 默认（L271 域）
            };
            for (int i = 0; i < St.owner.Length; i++) St.owner[i] = -1;
            ApplyWorldGen();
            _frame = new byte[PixelWorldBox.Wb.WbTerrainFull.PW * PixelWorldBox.Wb.WbTerrainFull.PH * 4];   // M-U7j：持久缓冲分配一次
            MarkAllTerrainDirty();                    // engine.ts L950 generate 全量失效
            FlushTerrain();                           // 全量首烘（L951 generate→flushDirty 同构）
            // —— M-U7y props 层首烘（蓝本 newWorld L15892 propsCtx 全清 + L15906-15908 全量 propsDirty→flushProps 同构）——
            if (_propsCanvas == null)
            {
                _propsCanvas = new PixelWorldBox.Wb.WbHostCanvas(
                    PixelWorldBox.Wb.WbTerrainFull.PW, PixelWorldBox.Wb.WbTerrainFull.PH);
                _propsCanvas.SetTransform(2, 0, 0, 2, 0, 0);   // 用户 4px 格 → 设备 8px 格（蓝本 propsCtx ×2 变换永不重置 L750 同构）
            }
            else
            {
                System.Array.Clear(_propsCanvas.Px, 0, _propsCanvas.Px.Length);   // L15892 clearRect 全清同构（重建世界）
            }
            MarkAllPropsDirty();                      // L952/L15907 全量失效
            FlushProps();                             // 全量首烘（L953/L15908 flushProps 同构）
            SnapshotRenderFace();                     // 差分桥基线
            _canvas = null;                           // 新世界 → 单位层栅格重建（clear 机状态随世界）
            WireOrch();
        }

        /// <summary>
        /// 编排骨架装配（M-U7c'）：已译子域真调，未译槽位留空（no-op）。
        /// 空世界安全：域函数顶层遍历 w.civs/w.armies 空表 → no-op（demo 无文明）。
        /// </summary>
        void WireOrch()
        {
            Orch = new PixelWorldBox.Wb.WbTickOrch { w = World };
            Orch.D[PixelWorldBox.Wb.WbTickOrch.REBUILD_CIV_BUILD_COUNTS] = () => PixelWorldBox.Wb.WbCivSim.RebuildCivBuildCounts(World);
            Orch.D[PixelWorldBox.Wb.WbTickOrch.CIVS] = () => PixelWorldBox.Wb.WbCivSim.CivsTick(World);
            Orch.D[PixelWorldBox.Wb.WbTickOrch.TECH] = () => PixelWorldBox.Wb.WbCivSim.TechTick(World);
            Orch.D[PixelWorldBox.Wb.WbTickOrch.ECONOMY] = () => PixelWorldBox.Wb.WbCivSim.EconomyTick(World);
            Orch.D[PixelWorldBox.Wb.WbTickOrch.SOCIETY] = () => PixelWorldBox.Wb.WbCivSim.SocietyTick(World);
            Orch.D[PixelWorldBox.Wb.WbTickOrch.ALLIANCE] = () => PixelWorldBox.Wb.WbCivSim.AllianceTick(World);
            Orch.D[PixelWorldBox.Wb.WbTickOrch.DIRECTIVE] = () => PixelWorldBox.Wb.WbCivSim.DirectiveTick(World);
            Orch.D[PixelWorldBox.Wb.WbTickOrch.ARMY] = () => PixelWorldBox.Wb.WbCivSim.ArmyTick(World);
        }

        void EnsureScene()
        {
            if (rig == null) rig = Camera.main != null
                ? Camera.main.GetComponent<WbCameraRig>()
                : null;
            if (rig == null)
            {
                var rigGo = new GameObject("WbCameraRig");
                rig = rigGo.AddComponent<WbCameraRig>();
            }
            if (terrainRenderer == null)
            {
                var go = new GameObject("WbTerrain");
                terrainRenderer = go.AddComponent<SpriteRenderer>();
            }
            if (_tex == null)
            {
                _tex = new Texture2D(
                    PixelWorldBox.Wb.WbTerrainFull.PW, PixelWorldBox.Wb.WbTerrainFull.PH,
                    TextureFormat.RGBA32, false);
                _tex.filterMode = FilterMode.Point;     // imageSmoothingEnabled=false 同构（render.ts L1284）
                var sprite = Sprite.Create(_tex, new Rect(0, 0, _tex.width, _tex.height),
                    new Vector2(0.5f, 0.5f), 8f);       // PPU=8 → 2048px = 256 单位 = tile 一一对应
                terrainRenderer.sprite = sprite;
                terrainRenderer.transform.position = new Vector3(128f, 80f, 0f);
                // WbWorld y=0 = 北 → 纹理行 0 朝上（几何 y 翻转；SpriteRenderer Cull Off 双面安全）
                terrainRenderer.transform.localScale = new Vector3(1f, -1f, 1f);
            }
            if (_unitTex == null)
            {
                _unitTex = new Texture2D(
                    PixelWorldBox.Wb.WbTerrainFull.PW, PixelWorldBox.Wb.WbTerrainFull.PH,
                    TextureFormat.RGBA32, false);
                _unitTex.filterMode = FilterMode.Point;
                var usprite = Sprite.Create(_unitTex, new Rect(0, 0, _unitTex.width, _unitTex.height),
                    new Vector2(0.5f, 0.5f), 8f);
                if (unitRenderer == null)
                {
                    var go = new GameObject("WbUnits");
                    unitRenderer = go.AddComponent<SpriteRenderer>();
                }
                unitRenderer.sprite = usprite;
                unitRenderer.transform.position = new Vector3(128f, 80f, -1f);   // terrain 之上（z 负近相机）
                unitRenderer.transform.localScale = new Vector3(1f, -1f, 1f);    // 同 y 翻转协议
            }
            if (_propsTex == null)
            {
                _propsTex = new Texture2D(
                    PixelWorldBox.Wb.WbTerrainFull.PW, PixelWorldBox.Wb.WbTerrainFull.PH,
                    TextureFormat.RGBA32, false);
                _propsTex.filterMode = FilterMode.Point;
                var psprite = Sprite.Create(_propsTex, new Rect(0, 0, _propsTex.width, _propsTex.height),
                    new Vector2(0.5f, 0.5f), 8f);       // PPU=8 同地形层
                if (propsRenderer == null)
                {
                    var go = new GameObject("WbProps");
                    propsRenderer = go.AddComponent<SpriteRenderer>();
                }
                propsRenderer.sprite = psprite;
                propsRenderer.transform.position = new Vector3(128f, 80f, -0.5f);   // terrain 与 units 之间（蓝本 propsCanvas 层序）
                propsRenderer.transform.localScale = new Vector3(1f, -1f, 1f);      // 同 y 翻转协议
                // NewWorld 先于 EnsureScene（Awake 序）——首烘像素已在 _propsCanvas.Px，纹理后建须全量补上载
                if (_propsCanvas != null) { _propsTex.LoadRawTextureData(_propsCanvas.Px); _propsTex.Apply(false); }
            }
            UploadFrame();
        }

        /// <summary>渲染态相机/纪元同步（M-U7i：rig 值 → St 黄金协议字段）</summary>
        void SyncRenderState()
        {
            if (rig != null) { St.camX = rig.camX; St.camY = rig.camY; St.camZoom = rig.zoom; }
            St.frameCount++;
            int ccx = System.Math.Clamp((int)System.Math.Floor(St.camX), 0, PixelWorldBox.Wb.WbWorld.W - 1);
            int ccy = System.Math.Clamp((int)System.Math.Floor(St.camY), 0, PixelWorldBox.Wb.WbWorld.H - 1);
            St.terrainAt = St.terrain[ccy * PixelWorldBox.Wb.WbWorld.W + ccx];   // 黄金单 tile 协议同构（相机中心 tile）
            St.civs = World.civs;                                                 // 疆域混色源引用同步
        }

        /// <summary>UnitScene 精灵层（M-U7i）：op 流产出（Test18/20 黄金面同源）→ PlayOps 合成 → 纹理上载</summary>
        void RenderUnits()
        {
            if (_unitTex == null) return;
            if (_canvas == null) _canvas = new PixelWorldBox.Wb.WbHostCanvas(
                PixelWorldBox.Wb.WbTerrainFull.PW, PixelWorldBox.Wb.WbTerrainFull.PH);
            _canvas.RegisterSource("terrain", _frame, PixelWorldBox.Wb.WbTerrainFull.PW, PixelWorldBox.Wb.WbTerrainFull.PH);
            var L = new PixelWorldBox.Wb.WbDrawList();
            PixelWorldBox.Wb.WbRender.UnitScene(St, World.units, L);
            _canvas.PlayOps(L);
            _unitTex.LoadRawTextureData(_canvas.Px);
            _unitTex.Apply(false);
        }

        void Update()
        {
            // frame() 步进调度（engine.ts L2708-2732 同构：acc 累计 + 上限让出）
            if (speed > 0)
            {
                _acc += Time.deltaTime * 1000f * speed;
                int steps = 0;
                while (_acc >= TickMs)
                {
                    TickHost();
                    _acc -= TickMs;
                    if (++steps >= MaxStepsPerFrame) { _acc = Mathf.Min(_acc, TickMs - 1); break; }
                }
            }
            // 渲染派发（M-U7j 脏瓦片增量：engine.ts render L1232 帧首 flushDirty 同构——
            // 净帧早退零烘零上传；脏帧只烘脏瓦片 + SetPixels32 脏盒部分上传）
            SyncRenderState();
            SyncTerrainDiffs();
            FlushTerrain();
            FlushProps();                              // M-U7y：蓝本 render 帧首 flushProps 同构（L14300 早退门）
            RenderUnits();
        }

        void TickHost()
        {
            // 编排骨架优先（M-U7c' 装配）；TickDelegate 为调试注入点
            if (Orch != null) Orch.Tick();
            else if (TickDelegate != null) TickDelegate(World);
        }

        /// <summary>全量上传（仅 EnsureScene/NewWorld 一次；运行期走 UploadBox 脏盒）</summary>
        void UploadFrame()
        {
            if (_frame != null) _tex.LoadRawTextureData(_frame);
            _tex.Apply(false);
        }

        // ---------------- 地形层增量 flush（M-U7j：engine.ts flushDirty 域宿主接位） ----------------

        /// <summary>flushDirty 宿主消费（render.ts L1232 帧首同构）：脏帧 → 逐脏瓦片重烘 + 盒上传；净帧零成本</summary>
        void FlushTerrain()
        {
            if (_frame == null) return;
            var box = PixelWorldBox.Wb.WbFrameFlush.FlushDirty(St, _frame, _dirty);
            if (box.Any) UploadBox(box, _tex, _frame);              // putImageData 脏矩形（L14286）↔ SetPixels32
        }

        /// <summary>flushProps 宿主消费（M-U7y；蓝本 render 帧首 flushProps 同构）：脏帧 → 逐脏瓦片
        /// PropsPaint（op 流 + bails 真实现展开）+ 盒上传；净帧零成本</summary>
        void FlushProps()
        {
            if (_propsCanvas == null) return;
            var box = PixelWorldBox.Wb.WbFrameFlush.FlushProps(St, _propsCanvas, _propsDirty);
            if (box.Any) UploadBox(box, _propsTex, _propsCanvas.Px);   // L14416-14422 盒换算同构
        }

        /// <summary>蓝本 markDirty 位点显式接线 API（engine.ts L959-967）——未来域切片的等价内联记账入口</summary>
        public void MarkTileDirty(int i) => PixelWorldBox.Wb.WbFrameFlush.MarkDirty(_dirty, i);
        public void MarkAllTerrainDirty() => PixelWorldBox.Wb.WbFrameFlush.MarkAllDirty(_dirty);

        /// <summary>蓝本 propsDirty 位点显式接线 API（M-U7y；engine.ts L978/L1926/L3046/L3070）——
        //  未来域切片（修路/雪人/地形编辑器）的等价内联记账入口</summary>
        public void MarkPropsTileDirty(int i) => PixelWorldBox.Wb.WbFrameFlush.MarkPropsDirty(_propsDirty, i);
        public void MarkAllPropsDirty() => PixelWorldBox.Wb.WbFrameFlush.MarkAllPropsDirty(_propsDirty);

        /// <summary>SetPixels32 脏盒部分上传（旧版净帧亦全拷 10MB → 仅脏帧盒区域拷贝；行序与
        /// LoadRawTextureData 同底起——row 0 = 纹理 v0，与既有 y 翻转协议一致）</summary>
        void UploadBox(PixelWorldBox.Wb.WbFrameFlush.FlushBox b, Texture2D tex, byte[] buf)
        {
            if (tex == null || buf == null) return;
            var c32 = new Color32[b.Width * b.Height];
            for (int r = 0; r < b.Height; r++)
            {
                int src = ((b.Y + r) * PixelWorldBox.Wb.WbTerrainFull.PW + b.X) * 4;
                for (int c = 0; c < b.Width; c++, src += 4)
                    c32[r * b.Width + c] = new Color32(buf[src], buf[src + 1], buf[src + 2], buf[src + 3]);
            }
            tex.SetPixels32(b.X, b.Y, b.Width, b.Height, c32);
            tex.Apply(false);
        }

        /// <summary>
        /// St 渲染面差分标脏桥（M-U7j）：蓝本 mutation 位点在 engine 类内联 markDirty；
        /// C# 域函数为纯对账面不带渲染记账——宿主在 tick 后对 TerrainBake 消费面
        /// （terrain/variant/waterTier/glacier/road/owner/radiate + season/ash/civs 混色源）差分，
        /// 逐变更瓦片 MarkDirty（四邻语义自动覆盖邻读域），全局参变化 MarkAll（L9730 全量先例）。
        /// 净帧成本 = 7 数组比较（~286KB 读）≈ 全烘的万分之几，无分配。
        /// </summary>
        void SyncTerrainDiffs()
        {
            if (_shTerrain == null) return;           // NewWorld 前无快照（首烘已全量）
            DiffBytes(St.terrain, _shTerrain, true);  // 逐变更瓦片 MarkDirty（部分失效保脏盒最小）+ props 双标脏（L978 setTerrain 位点）
            DiffBytes(St.variant, _shVariant, false);
            DiffBytes(St.waterTier, _shWaterTier, false);
            DiffBytes(St.glacier, _shGlacier, false);
            DiffInts(St.road, _shRoad, true);         // 修路位点双标脏（蓝本 L1926-1927 dirty+propsDirty 双记账）
            DiffInts(St.owner, _shOwner, false);
            DiffDoubles(St.radiate, _shRadiate);
            DiffBytes(St.snowman, _shSnowman, false, true);   // M-U7y 雪人差分：props-only（蓝本 L3046/L3070 位点——无地形记账）
            // 全局参（季节/火山灰/疆域混色源）→ 全量失效（engine.ts L9730 全量先例）；
            // props 无季节失效位点（蓝本 Organic per-tile 刷新——WbFrameFlush 头注伪影保真）
            if (St.season != _shSeason || St.ash != _shAsh || CivSig() != _shCivSig)
                PixelWorldBox.Wb.WbFrameFlush.MarkAllDirty(_dirty);
            SnapshotRenderFace();                     // 快照前滚（逐瓦片路径已在 Diff 内就地更新）
        }

        bool DiffBytes(byte[] cur, byte[] sh, bool propsToo) { return DiffBytes(cur, sh, true, propsToo); }

        bool DiffBytes(byte[] cur, byte[] sh, bool terrainToo, bool propsToo)
        {
            bool ch = false;
            for (int i = 0; i < cur.Length; i++)
            {
                if (cur[i] == sh[i]) continue;
                if (terrainToo) PixelWorldBox.Wb.WbFrameFlush.MarkDirty(_dirty, i);   // 四邻标脏（蓝本 markDirty 语义）
                if (propsToo) PixelWorldBox.Wb.WbFrameFlush.MarkPropsDirty(_propsDirty, i);   // M-U7y 蓝本双记账位点（setTerrain L977-978）
                sh[i] = cur[i]; ch = true;
            }
            return ch;
        }

        bool DiffInts(int[] cur, int[] sh, bool propsToo)
        {
            bool ch = false;
            for (int i = 0; i < cur.Length; i++)
            {
                if (cur[i] == sh[i]) continue;
                PixelWorldBox.Wb.WbFrameFlush.MarkDirty(_dirty, i);
                if (propsToo) PixelWorldBox.Wb.WbFrameFlush.MarkPropsDirty(_propsDirty, i);   // M-U7y 修路位点（L1926-1927）
                sh[i] = cur[i]; ch = true;
            }
            return ch;
        }

        bool DiffDoubles(double[] cur, double[] sh)
        {
            bool ch = false;
            for (int i = 0; i < cur.Length; i++)
            {
                if (cur[i].Equals(sh[i])) continue;   // NaN 安全（NaN≠NaN 避免永久假脏）
                PixelWorldBox.Wb.WbFrameFlush.MarkDirty(_dirty, i);
                sh[i] = cur[i]; ch = true;
            }
            return ch;
        }

        /// <summary>civ 混色源签名（count + color[0..2] + alive）——变化即全量失效（疆域混色全局域）</summary>
        long CivSig()
        {
            long h = 1469598103934665603L;
            var civs = St.civs;
            if (civs == null) return h;
            void Mix(long v) { h = (h ^ v) * 1099511628211L; }
            Mix(civs.Count);
            for (int k = 0; k < civs.Count; k++)
            {
                var c = civs[k];
                if (c == null) { Mix(-1); continue; }
                Mix(c.alive ? 1 : 0);
                if (c.color != null)
                {
                    Mix(c.color[0]);
                    Mix(c.color.Length > 1 ? c.color[1] : 0);
                    Mix(c.color.Length > 2 ? c.color[2] : 0);
                }
            }
            return h;
        }

        /// <summary>快照 St 渲染消费面（差分桥基准态；逐瓦片路径已在 Diff 内就地前滚）</summary>
        void SnapshotRenderFace()
        {
            if (_shTerrain == null)
            {
                _shTerrain = new byte[St.terrain.Length]; _shVariant = new byte[St.variant.Length];
                _shWaterTier = new byte[St.waterTier.Length]; _shGlacier = new byte[St.glacier.Length];
                _shRoad = new int[St.road.Length]; _shOwner = new int[St.owner.Length];
                _shRadiate = new double[St.radiate.Length];
                _shSnowman = new byte[St.snowman.Length];   // M-U7y props 差分基线
            }
            System.Array.Copy(St.terrain, _shTerrain, _shTerrain.Length);
            System.Array.Copy(St.variant, _shVariant, _shVariant.Length);
            System.Array.Copy(St.waterTier, _shWaterTier, _shWaterTier.Length);
            System.Array.Copy(St.glacier, _shGlacier, _shGlacier.Length);
            System.Array.Copy(St.road, _shRoad, _shRoad.Length);
            System.Array.Copy(St.owner, _shOwner, _shOwner.Length);
            System.Array.Copy(St.radiate, _shRadiate, _shRadiate.Length);
            System.Array.Copy(St.snowman, _shSnowman, _shSnowman.Length);   // M-U7y
            _shSeason = St.season; _shAsh = St.ash; _shCivSig = CivSig();
        }

        // ---------------- 真地形落位（M-U7g/M-U7k：WbWorldgen 黄金链直灌；蓝本 generate L771-952 宿主等价） ----------------
        void ApplyWorldGen()
        {
            PixelWorldBox.Wb.WbWorldGenResult gen = PixelWorldBox.Wb.WbWorldgen.GenerateWorld(unchecked((int)seed));
            System.Array.Copy(gen.Terrain, St.terrain, St.terrain.Length);   // L776 this.terrain = gen.terrain
            System.Array.Copy(gen.Variant, St.variant, St.variant.Length);   // L777 this.variant = gen.variant
            // temp/moist（L778-779）渲染域不消费——overlay 温湿图自有黄金链直灌，宿主不暂存
            // —— M-U7k 河域：generate() L905-949 宿主等价全链（蓝本序保真）——
            PixelWorldBox.Wb.WbWorldgen.SoilInit(St.terrain, World.soilF);   // worldsim initFromTerrain L125（soilF = SOIL_BASE[t] ?? 128）
            World.rngA = (uint)(unchecked((int)seed) ^ unchecked((int)0x9e3779b9u));   // L773 engine.rngA 起流
            World.unitSeq = 1; World.toastSeq = 1; World.eventSeq = 1;              // L919-924 计数器重置段（civSeq 0——civilian 域未触达）
            foreach (var a in gen.SpawnAnimals)                              // L936 spawnUnit 逐只重放（M-U3h 译件；silent 恒真）
                PixelWorldBox.Wb.WbBailRelay.SpawnUnit(World, a.Race, a.X, a.Y, new PixelWorldBox.Wb.WbBailRelay.WbSpawnOpts { silent = true });
            World.RebuildBuckets();                                          // 桶层一次性重建（蓝本懒重建；静态世界一次等价）
            PixelWorldBox.Wb.WbWorldgen.SeedRivers(World, St.terrain, gen.Moist, unchecked((int)seed));   // L941 nature.seedRivers（M-U7k 译件）
            PixelWorldBox.Wb.WbWorldgen.RebuildWaterTiers(St.terrain, St.waterTier);   // L949 rebuildWaterTiers（post-river 全量）
        }
    }
}
