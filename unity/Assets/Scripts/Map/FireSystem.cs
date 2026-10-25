// PWB Unity Port — Map/FireSystem.cs (U1)
// 野火系统(MonoBehaviour+ISystem,契约 §3 注册序第 3 位):移植 engine.ts fireTick(2734-2790 行)。
//   · 燃烧格 fire[i]>0:每 tick -1;火在冰面 → 冰融为水、火熄(engine.ts 2741-2746)
//   · 湿格(wet>0):fire 额外 -2、蔓延概率减半;wet 计数每 tick -1(雨云湿度自然蒸干)
//   · 蔓延(rng<0.4 尝试 8 邻):概率表 Forest 0.16 / Grass 0.07(建筑 0.25,engine.ts ignite 2770 行同源)
//     × 风向(固定西风:东邻 ×1.4 / 西邻 ×0.6)× 季节(夏 1.3 / 春秋 1 / 冬 0.25)× 湿(×0.5)
//   · 火焰邻冰 → 融冰不点燃(engine.ts 2768)
//   · 点燃时长 150+rng×90(engine.ts ignite 1065 行);烧尽 → Burnt
//   · 建筑着火简略:烧尽时 building=0、owner=-1(契约 §3:-1 无主)+ EventBus "fireOut"
//   · 着火地形对单位的伤害由 U2 读 w.fire 自算(契约 §4)
using UnityEngine;

namespace PWB.Map
{
    public sealed class FireSystem : MonoBehaviour, PWB.Core.ISystem
    {
        public static FireSystem Instance;

        // 蔓延概率表(任务冻结数值;TS 源:engine.ts 2770 行 0.13/0.05/0.25 × spreadMul)
        private const float PForest = 0.16f;
        private const float PGrass = 0.07f;
        private const float PBuilding = 0.25f;
        private const float SpreadGate = 0.4f;   // 每 tick 蔓延尝试门限(engine.ts 2754)

        void Awake() { Instance = this; }

        public void Tick(PWB.Core.World w)
        {
            var terrain = w.terrain;
            var fire = w.fire;
            var wet = w.wet;
            var rng = w.rng;
            int ww = PWB.Core.World.W;
            int hh = PWB.Core.World.H;

            // 季节系数(冬 0.25 / 夏 1.3 / 春秋 1;nature.ts fireMul 同源语义)
            int season = PWB.Core.TimeSystem.Instance != null ? PWB.Core.TimeSystem.Instance.Season : 1;
            float sMul = season == 1 ? 1.3f : season == 3 ? 0.25f : 1f;

            for (int i = 0; i < fire.Length; i++)
            {
                if (wet[i] > 0) wet[i] = (byte)(wet[i] - 1); // 湿度蒸干(计数)

                byte f = fire[i];
                if (f == 0) continue;

                int x = i % ww;
                int y = i / ww;

                // 火在冰面:融冰 + 熄火
                if (terrain[i] == (byte)PWB.Core.Terrain.Ice)
                {
                    terrain[i] = (byte)PWB.Core.Terrain.Water;
                    fire[i] = 0;
                    Mark(x, y);
                    continue;
                }

                int left = f - 1;
                if (wet[i] > 0) left -= 2; // 湿地加速熄灭
                if (left <= 0)
                {
                    Extinguish(w, i, x, y);
                    continue;
                }
                fire[i] = (byte)left;

                if (rng.Value() >= SpreadGate) continue;

                bool srcWet = wet[i] > 0; // 源格湿:蔓延概率减半(任务冻结)

                // 8 邻蔓延
                for (int dy = -1; dy <= 1; dy++)
                {
                    int yy = y + dy;
                    if (yy < 0 || yy >= hh) continue;
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;
                        int xx = x + dx;
                        if (xx < 0 || xx >= ww) continue;
                        int j = yy * ww + xx;

                        if (terrain[j] == (byte)PWB.Core.Terrain.Ice)
                        {
                            terrain[j] = (byte)PWB.Core.Terrain.Water; // 火焰融冰(engine.ts 2768)
                            Mark(xx, yy);
                            continue;
                        }

                        float p;
                        byte tj = terrain[j];
                        if (w.building[j] > 0) p = PBuilding;
                        else if (tj == (byte)PWB.Core.Terrain.Forest) p = PForest;
                        else if (tj == (byte)PWB.Core.Terrain.Grass) p = PGrass;
                        else continue;

                        // 固定西风(风自西向东):东邻下风 ×1.4 / 西邻上风 ×0.6
                        if (dx > 0) p *= 1.4f;
                        else if (dx < 0) p *= 0.6f;
                        p *= sMul;                      // 季节火险
                        if (srcWet || wet[j] > 0) p *= 0.5f; // 源格/目标格湿 → 概率减半

                        if (p > 0f && rng.Value() < p) Ignite(w, j, xx, yy);
                    }
                }
            }
        }

        /// <summary>点燃(engine.ts ignite 1061-1067 行):可燃地或建筑;时长 150+rng×90。</summary>
        private static void Ignite(PWB.Core.World w, int i, int x, int y)
        {
            if (w.fire[i] > 0) return;
            byte t = w.terrain[i];
            if (w.building[i] == 0 &&
                t != (byte)PWB.Core.Terrain.Grass && t != (byte)PWB.Core.Terrain.Forest) return;
            w.fire[i] = (byte)(150 + (int)(w.rng.Value() * 90f));
            Mark(x, y);
        }

        /// <summary>烧尽结算:植被 → Burnt;建筑焚毁简略(建 0/无主)+ "fireOut" 纪事。</summary>
        private static void Extinguish(PWB.Core.World w, int i, int x, int y)
        {
            w.fire[i] = 0;
            if (w.building[i] > 0)
            {
                w.building[i] = 0;
                w.owner[i] = -1;
                w.events.Emit("fireOut", "烈焰吞噬了一座建筑", x + 0.5f, y + 0.5f, null);
            }
            byte t = w.terrain[i];
            if (t == (byte)PWB.Core.Terrain.Forest || t == (byte)PWB.Core.Terrain.Grass)
            {
                w.terrain[i] = (byte)PWB.Core.Terrain.Burnt;
            }
            Mark(x, y);
        }

        private static void Mark(int x, int y)
        {
            var mr = Render.MapRenderer.Instance;
            if (mr != null) mr.SetTileDirty(x, y);
        }
    }
}
