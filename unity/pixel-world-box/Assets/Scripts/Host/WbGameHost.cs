// WbGameHost.cs — M-U7 整合 b：世界宿主装配薄壳（宿主域，Unity only；Unity 可跑验收入口）
// ============================================================
// 装配拓扑：
//   本壳（GameObject + WbGameHost + WbCameraRig）→ Texture2D(2048×1280 RGBA32) ← TerrainFull.Bake
//   Sprite（PPU=8 → 256×160 世界单位，1 tile = 1 单位）→ SpriteRenderer → Camera.main（正交）。
//   WbHostCanvas op 播放器已就位（Wb 域，NUnit Test24 六测试 + verify 段 25）——UnitScene 精灵层
//   播放接线留 M-U7 下一切片（本壳先通地形全链）。
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

        Texture2D _tex;
        float _acc;
        byte[] _frame;                                // TerrainFull 输出复用缓冲

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
            UploadFrame();
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
            _frame = PixelWorldBox.Wb.WbTerrainFull.Bake(St);
            UploadFrame();
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
