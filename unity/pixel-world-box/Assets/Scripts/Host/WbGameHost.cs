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
// 演示地形（宿主域标注）：noise.ts 地形生成链未译（独立切片）——本壳用确定性 value-noise 占位
//   （两八度 + 阈值映射 12 地形），仅保证 Unity 可跑验收与渲染链视觉验证，非蓝本不进对账面。
// sim 接线：engine.tick() 编排层未译（M-U 系列母体编排，独立切片）——本壳暴露 TickDelegate
//   注入点（已译子域 CivsTick/ArmyTick/EconomyTick 等由宿主装配时按需接线；默认 null = 纯渲染漫游）。
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
        public uint seed = 20261029;                  // 演示地形种子（宿主域）

        [Header("Scene")]
        public SpriteRenderer terrainRenderer;        // 空则 Awake 自动建
        public WbCameraRig rig;

        /// <summary>sim 子域接线点（engine.tick() 编排层未译——M-U7 下一切片；默认纯渲染）</summary>
        public System.Action<PixelWorldBox.Wb.WbWorld> TickDelegate;

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

        /// <summary>世界构建 + 演示地形（noise.ts 切片前的宿主占位——确定性可复现）</summary>
        public void NewWorld()
        {
            World = new PixelWorldBox.Wb.WbWorld();
            St = new PixelWorldBox.Wb.WbRenderState
            {
                camX = 128, camY = 80, camZoom = 4.5,   // engine.ts L681
                fxDayNight = true, fxHpBars = true,     // engine fxPrefs 默认（L271 域）
            };
            for (int i = 0; i < St.owner.Length; i++) St.owner[i] = -1;
            GenDemoTerrain();
            _frame = PixelWorldBox.Wb.WbTerrainFull.Bake(St);
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
            if (TickDelegate != null) TickDelegate(World);
        }

        void UploadFrame()
        {
            if (_frame != null) _tex.LoadRawTextureData(_frame);
            _tex.Apply(false);
        }

        // ---------------- 演示地形（宿主占位：确定性 value-noise 两八度 + 阈值映射） ----------------
        void GenDemoTerrain()
        {
            int W = PixelWorldBox.Wb.WbWorld.W, H = PixelWorldBox.Wb.WbWorld.H;
            uint s = seed;
            System.Func<double, double, double> vnoise = (x, y) =>
            {
                // 整数格 value noise（确定性 LCG 哈希 + 平滑插值）——宿主演示域，非蓝本
                int xi = (int)System.Math.Floor(x), yi = (int)System.Math.Floor(y);
                double fx = x - xi, fy = y - yi;
                double sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
                double h(int a, int b)
                {
                    uint k = (uint)(a * 374761393 + b * 668265263) ^ s;
                    k = (k ^ (k >> 13)) * 1274126177u;
                    return (k >> 8) / (double)(1u << 24);
                }
                return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy)
                     + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy;
            };
            for (int y = 0; y < H; y++)
            {
                for (int x = 0; x < W; x++)
                {
                    int i = y * W + x;
                    double n = vnoise(x / 22.0, y / 22.0) * 0.65 + vnoise(x / 9.0, y / 9.0) * 0.35;
                    byte t;
                    if (n < 0.34) t = 0;              // DEEP
                    else if (n < 0.42) t = 1;         // WATER
                    else if (n < 0.47) t = 2;         // SAND
                    else if (n < 0.62) t = 3;         // GRASS
                    else if (n < 0.72) t = 4;         // FOREST
                    else if (n < 0.80) t = 5;         // HILL
                    else t = 6;                        // MOUNTAIN
                    St.terrain[i] = t;
                    St.variant[i] = (byte)((x * 31 + y * 17 + (int)(n * 100)) & 255);
                    St.waterTier[i] = t == 1 ? (byte)(2 - (int)((n - 0.34) * 30))
                                    : t == 0 ? (byte)(3 + (int)((0.34 - n) * 30)) : (byte)0;
                    if (St.waterTier[i] > 5) St.waterTier[i] = 5;
                }
            }
        }
    }
}
