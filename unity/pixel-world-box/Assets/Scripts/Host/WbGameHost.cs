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

        Texture2D _tex;
        Texture2D _unitTex;
        float _acc;
        byte[] _frame;                                // TerrainFull 输出复用缓冲
        PixelWorldBox.Wb.WbHostCanvas _canvas;        // 单位层持久栅格（canvas 语义：clear 增量机同构）
        int _demoSeq;

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
            _frame = PixelWorldBox.Wb.WbTerrainFull.Bake(St);
            _canvas = null;                           // 新世界 → 单位层栅格重建（clear 机状态随世界）
            SpawnDemoUnits();
            WireOrch();
        }

        /// <summary>演示单位（宿主占位：静态陈列供 UnitScene 精灵层视觉验收——无 unitsTick 不更新；
        /// 退役条件 = spawnUnit 宿主接线落位）</summary>
        void SpawnDemoUnits()
        {
            int[] races = { 0, 0, 6, 7, 21, 34, 33, 10 };   // 人×2/羊/狼/巨魔/猪/鸡/鹿（静态 RDEF 41 族域）
            int cx = PixelWorldBox.Wb.WbWorld.W / 2, cy = PixelWorldBox.Wb.WbWorld.H / 2;
            (int gx, int gy) = FindGrassNear(cx, cy);
            double bx = gx + 0.5, by = gy + 0.5;
            double[] offs = { 0, 0, -2.5, 1.5, 2.5, 1.5, -2, -2, 3, -1, 1.5, 2.5, -1.5, -2.5, 2, 2 };
            for (int k = 0; k < races.Length; k++)
            {
                var u = new PixelWorldBox.Wb.WbU
                {
                    id = ++_demoSeq, race = races[k], civ = -1,
                    x = System.Math.Clamp(bx + offs[k * 2], 1.5, PixelWorldBox.Wb.WbWorld.W - 1.5),
                    y = System.Math.Clamp(by + offs[k * 2 + 1], 1.5, PixelWorldBox.Wb.WbWorld.H - 1.5),
                    hp = 10, maxHp = 10, name = "demo" + _demoSeq,
                };
                u.tx = u.x; u.ty = u.y;
                World.units.Add(u);
            }
            World.RebuildBuckets();
        }

        /// <summary>宿主域：近邻草格搜索（演示单位落位；螺旋半径 12 兜底中心）</summary>
        (int, int) FindGrassNear(int cx, int cy)
        {
            for (int r = 0; r <= 12; r++)
            {
                for (int dy = -r; dy <= r; dy++)
                {
                    for (int dx = -r; dx <= r; dx++)
                    {
                        if (System.Math.Max(System.Math.Abs(dx), System.Math.Abs(dy)) != r) continue;
                        int x = cx + dx, y = cy + dy;
                        if (x < 1 || y < 1 || x >= PixelWorldBox.Wb.WbWorld.W - 1 || y >= PixelWorldBox.Wb.WbWorld.H - 1) continue;
                        if (St.terrain[y * PixelWorldBox.Wb.WbWorld.W + x] == PixelWorldBox.Wb.WbConstants.T_GRASS) return (x, y);
                    }
                }
            }
            return (cx, cy);
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
            // 渲染派发（脏标记优化属性能域——M-U7 下一切片；本壳每帧重烘保演示简单）
            SyncRenderState();
            _frame = PixelWorldBox.Wb.WbTerrainFull.Bake(St);
            UploadFrame();
            RenderUnits();
        }

        void TickHost()
        {
            // 编排骨架优先（M-U7c' 装配）；TickDelegate 为调试注入点
            if (Orch != null) Orch.Tick();
            else if (TickDelegate != null) TickDelegate(World);
        }

        void UploadFrame()
        {
            if (_frame != null) _tex.LoadRawTextureData(_frame);
            _tex.Apply(false);
        }

        // ---------------- 真地形落位（M-U7g：WbWorldgen 黄金链直灌；蓝本 generate L775-779/L949 同构） ----------------
        void ApplyWorldGen()
        {
            WbWorldGenResult gen = PixelWorldBox.Wb.WbWorldgen.GenerateWorld(unchecked((int)seed));
            System.Array.Copy(gen.Terrain, St.terrain, St.terrain.Length);   // L776 this.terrain = gen.terrain
            System.Array.Copy(gen.Variant, St.variant, St.variant.Length);   // L777 this.variant = gen.variant
            // temp/moist（L778-779）渲染域不消费——overlay 温湿图自有黄金链直灌，宿主不暂存
            PixelWorldBox.Wb.WbWorldgen.RebuildWaterTiers(St.terrain, St.waterTier);   // L949 rebuildWaterTiers（pre-river 域）
            // gen.SpawnAnimals → spawnUnit（L936）留 unitsTick 切片（unitsTick 主体未译——M-U7 余量）
        }
    }
}
