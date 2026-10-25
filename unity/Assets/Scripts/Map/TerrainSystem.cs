// PWB Unity Port — Map/TerrainSystem.cs (U1)
// 地质/气候缓变系统(MonoBehaviour+ISystem,契约 §3 注册序第 2 位):
// 每 10 tick 分带扫描(每次 1/8 地图 → 全图 80 tick 一轮,均摊开销):
//   · 冰邻温水消融 rng<0.1(岩浆/火邻冰立即融 —— engine.ts iceTick 2864-2882 行语义)
//   · 极地回冻:极圈内雪地邻水小概率结冰(engine.ts iceTick 2884-2900 行语义)
//   · 岩浆冷却 rng<0.008 → Burnt(engine.ts geologyTick 817-819 行语义)
//   · Burnt 复绿 rng<0.004 → Grass(wet>0 时 ×3 —— 雨后焦土加速返青)
using UnityEngine;

namespace PWB.Map
{
    public sealed class TerrainSystem : MonoBehaviour, PWB.Core.ISystem
    {
        public static TerrainSystem Instance;

        private const int ScanEvery = 10;   // 每 10 tick 扫一带
        private const int Bands = 8;        // 全图分 8 带
        private const int PolarBand = 8;    // 极地圈(与 MapGen 一致)

        private int _band;

        void Awake() { Instance = this; }

        public void Tick(PWB.Core.World w)
        {
            if (w.Tick % ScanEvery != 0) return;
            int rows = PWB.Core.World.H / Bands;
            int y0 = _band * rows;
            int y1 = _band == Bands - 1 ? PWB.Core.World.H : y0 + rows;
            _band = (_band + 1) % Bands;

            var terrain = w.terrain;
            var fire = w.fire;
            var rng = w.rng;
            int ww = PWB.Core.World.W;
            bool polar = y0 < PolarBand || y1 > PWB.Core.World.H - PolarBand;

            for (int y = y0; y < y1; y++)
            {
                bool polarRow = polar && (y < PolarBand || y >= PWB.Core.World.H - PolarBand);
                for (int x = 0; x < ww; x++)
                {
                    int i = y * ww + x;
                    byte t = terrain[i];
                    if (t == (byte)PWB.Core.Terrain.Ice)
                    {
                        // 热源(岩浆/火)邻冰立即融;否则邻水 rng<0.1 消融
                        if (HotNeighbor(terrain, fire, i, x, y, ww))
                        {
                            terrain[i] = (byte)PWB.Core.Terrain.Water;
                            Mark(w, x, y);
                        }
                        else if (rng.Value() < 0.1f && WaterNeighbor(terrain, i, x, y, ww))
                        {
                            terrain[i] = (byte)PWB.Core.Terrain.Water;
                            Mark(w, x, y);
                        }
                    }
                    else if (polarRow && t == (byte)PWB.Core.Terrain.Snow)
                    {
                        // 极地回冻:邻水小概率结冰
                        if (rng.Value() < 0.03f)
                        {
                            int j = FirstWaterNeighbor(terrain, i, x, y, ww);
                            if (j >= 0)
                            {
                                terrain[j] = (byte)PWB.Core.Terrain.Ice;
                                Mark(w, j % ww, j / ww);
                            }
                        }
                    }
                    else if (t == (byte)PWB.Core.Terrain.Lava)
                    {
                        if (rng.Value() < 0.008f) // 岩浆冷却成焦岩
                        {
                            terrain[i] = (byte)PWB.Core.Terrain.Burnt;
                            Mark(w, x, y);
                        }
                    }
                    else if (t == (byte)PWB.Core.Terrain.Burnt)
                    {
                        float p = 0.004f;
                        if (w.wet[i] > 0) p *= 3f; // 湿润焦土返青 ×3
                        if (rng.Value() < p)
                        {
                            terrain[i] = (byte)PWB.Core.Terrain.Grass;
                            Mark(w, x, y);
                        }
                    }
                }
            }
        }

        private static bool HotNeighbor(byte[] terrain, byte[] fire, int i, int x, int y, int w)
        {
            if (x > 0) { int j = i - 1; if (terrain[j] == (byte)PWB.Core.Terrain.Lava || fire[j] > 0) return true; }
            if (x < w - 1) { int j = i + 1; if (terrain[j] == (byte)PWB.Core.Terrain.Lava || fire[j] > 0) return true; }
            if (y > 0) { int j = i - w; if (terrain[j] == (byte)PWB.Core.Terrain.Lava || fire[j] > 0) return true; }
            if (y < PWB.Core.World.H - 1) { int j = i + w; if (terrain[j] == (byte)PWB.Core.Terrain.Lava || fire[j] > 0) return true; }
            return false;
        }

        private static bool WaterNeighbor(byte[] terrain, int i, int x, int y, int w)
        {
            if (x > 0 && terrain[i - 1] == (byte)PWB.Core.Terrain.Water) return true;
            if (x < w - 1 && terrain[i + 1] == (byte)PWB.Core.Terrain.Water) return true;
            if (y > 0 && terrain[i - w] == (byte)PWB.Core.Terrain.Water) return true;
            if (y < PWB.Core.World.H - 1 && terrain[i + w] == (byte)PWB.Core.Terrain.Water) return true;
            return false;
        }

        private static int FirstWaterNeighbor(byte[] terrain, int i, int x, int y, int w)
        {
            if (x > 0 && terrain[i - 1] == (byte)PWB.Core.Terrain.Water) return i - 1;
            if (x < w - 1 && terrain[i + 1] == (byte)PWB.Core.Terrain.Water) return i + 1;
            if (y > 0 && terrain[i - w] == (byte)PWB.Core.Terrain.Water) return i - w;
            if (y < PWB.Core.World.H - 1 && terrain[i + w] == (byte)PWB.Core.Terrain.Water) return i + w;
            return -1;
        }

        /// <summary>地形变化通知渲染层增量重绘(契约 §6 SetTileDirty)。</summary>
        private static void Mark(PWB.Core.World w, int x, int y)
        {
            var mr = Render.MapRenderer.Instance;
            if (mr != null) mr.SetTileDirty(x, y);
        }
    }
}
