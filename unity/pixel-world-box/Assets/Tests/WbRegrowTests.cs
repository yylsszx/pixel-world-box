// ============================================================
// WbRegrowTests.cs — M-U8b sim 域：regrowTick 焦土复苏时钟语义面（NUnit）
// 蓝本锚：engine.ts regrowTick L2830-2840——WbBailRelay.RegrowTick 机械翻译件
//   （SetTerrain 后位）；L979 regrow.delete 级联支路自本切片点亮（M-U8a no-op 注记消亡）；
//   WbTickOrch REGROW 槽（16，%60 前半 L2544）宿主接线 WbGameHost.WireOrch。
// 黄金链定性：regrowTick 全域零 rng/零 nature/worldsim 消费（生产面 fireTick L2825/
//   过度啃食 L12116/rainRegrow L10663 未译——到期表载入后纯删面）——零新黄金
//   （M-U7y flushProps / M-U8a setTerrain 先例），本套件直测时钟语义 +
//   既有黄金 replay 全量回归（md5 fd09587b 不变即零漂移实证）。
// 蓝本冗余门 L2835（terrain===BURNT && owner>=0 || terrain===BURNT）：两侧同含
//   BURNT——与 terrain===BURNT 逻辑等价；机械保持不化简（纪律①），
//   Test32_UnownedBurnt 钉住该保持（防误"化简"为 owner>=0 门）。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System.Collections.Generic;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbRegrowTests
    {
        const byte T_GRASS = WbWorld.T_GRASS, T_FOREST = WbWorld.T_FOREST,
                   T_BURNT = WbWorld.T_BURNT, T_WATER = WbWorld.T_WATER;

        static WbWorld MakeWorld() => new WbWorld();

        // ---------------- 空表早退门（L2831） ----------------

        [Test]
        public void Test32_EmptyMap_EarlyReturn_NoMutation()
        {
            var w = MakeWorld();
            w.tickCount = 6000;
            int i = 7 * WbWorld.W + 9;
            w.terrain[i] = T_BURNT; w.owner[i] = 3;                   // 场上地形在场——空表则零触达
            WbBailRelay.RegrowTick(w);                                     // L2831 return
            Assert.That(w.terrain[i], Is.EqualTo(T_BURNT));           // 零写入
            Assert.That(w.owner[i], Is.EqualTo(3));
            Assert.That(w.regrow, Is.Empty);
        }

        // ---------------- 到期复绿（L2833-2836：>= 门 + 出账 + setTerrain 级联） ----------------

        [Test]
        public void Test32_DueBurnt_Regrows_Grass()
        {
            var w = MakeWorld();
            w.tickCount = 1000;
            int i = 40 * WbWorld.W + 58;
            w.terrain[i] = T_BURNT;
            w.regrow[i] = 999;                                        // at=999 <= tick=1000（边界内侧）
            WbBailRelay.RegrowTick(w);
            Assert.That(w.terrain[i], Is.EqualTo(T_GRASS));           // L2836 setTerrain(GRASS)
            Assert.That(w.regrow, Does.Not.Contain(i));               // L2834 出账
        }

        [Test]
        public void Test32_AtEqualsTickBoundary_Regrows()
        {
            var w = MakeWorld();                                      // >= 门边界：at == tick 即到期
            w.tickCount = 1600;
            int i = 41 * WbWorld.W + 58;
            w.terrain[i] = T_BURNT;
            w.regrow[i] = 1600;
            WbBailRelay.RegrowTick(w);
            Assert.That(w.terrain[i], Is.EqualTo(T_GRASS));
            Assert.That(w.regrow, Is.Empty);
        }

        [Test]
        public void Test32_NotDue_Held()
        {
            var w = MakeWorld();
            w.tickCount = 1000;
            int i = 42 * WbWorld.W + 58;
            w.terrain[i] = T_BURNT;
            w.regrow[i] = 1001;                                       // at > tick——未到期
            WbBailRelay.RegrowTick(w);
            Assert.That(w.terrain[i], Is.EqualTo(T_BURNT));           // 地形不动
            Assert.That(w.regrow[i], Is.EqualTo((long)1001));         // 计时保留
        }

        // ---------------- 蓝本冗余门（L2835——非 BURNT 到期项只出账不翻地形） ----------------

        [Test]
        public void Test32_DueNonBurnt_EntryDropped_TerrainKept()
        {
            var w = MakeWorld();                                      // 计时表与地形脱钩形态（save 迁移/覆写竞态语义面）
            w.tickCount = 1000;
            int i = 43 * WbWorld.W + 58;
            w.terrain[i] = T_FOREST;                                  // 到期但非焦土
            w.regrow[i] = 500;
            WbBailRelay.RegrowTick(w);
            Assert.That(w.regrow, Does.Not.Contain(i));               // L2834 出账照走
            Assert.That(w.terrain[i], Is.EqualTo(T_FOREST));          // L2835 门败——森林不翻草
        }

        [Test]
        public void Test32_UnownedBurnt_Regrows()
        {
            var w = MakeWorld();                                      // 冗余门钉子：owner=-1 的焦土仍复绿
            w.tickCount = 1000;                                       // （L2835 右支 || terrain===BURNT 兜底——防误化简为 owner 门）
            int i = 44 * WbWorld.W + 58;
            w.terrain[i] = T_BURNT; w.owner[i] = -1;
            w.regrow[i] = 500;
            WbBailRelay.RegrowTick(w);
            Assert.That(w.terrain[i], Is.EqualTo(T_GRASS));
            Assert.That(w.regrow, Is.Empty);
        }

        // ---------------- 混合批次（插入序快照二段式——到期/未到期同表共存） ----------------

        [Test]
        public void Test32_MixedBatch_DueProcessed_NotDueKept()
        {
            var w = MakeWorld();
            w.tickCount = 2000;
            int a = 40 * WbWorld.W + 60, b = 40 * WbWorld.W + 61, c = 40 * WbWorld.W + 62, d = 40 * WbWorld.W + 63;
            w.terrain[a] = T_BURNT; w.terrain[b] = T_BURNT; w.terrain[c] = T_BURNT; w.terrain[d] = T_BURNT;
            w.regrow[a] = 1999;                                       // 到期（插序 1）
            w.regrow[b] = 5000;                                       // 未到期
            w.regrow[c] = 2000;                                       // 到期（边界 ==，插序 3）
            w.regrow[d] = 2001;                                       // 未到期
            WbBailRelay.RegrowTick(w);
            Assert.That(w.terrain[a], Is.EqualTo(T_GRASS));           // 快照序处理：a/c 复绿
            Assert.That(w.terrain[c], Is.EqualTo(T_GRASS));
            Assert.That(w.terrain[b], Is.EqualTo(T_BURNT));           // b/d 保留
            Assert.That(w.terrain[d], Is.EqualTo(T_BURNT));
            Assert.That(w.regrow.Keys, Is.EquivalentTo(new[] { b, d }));
            Assert.That(w.regrow[b], Is.EqualTo((long)5000));
            Assert.That(w.regrow[d], Is.EqualTo((long)2001));
        }

        // ---------------- SetTerrain L979 支路（M-U8b 点亮——覆写作废计时） ----------------

        [Test]
        public void Test32_SetTerrain_WaterOverwrite_DropsRegrow()
        {
            var w = MakeWorld();
            int i = 45 * WbWorld.W + 58;
            w.terrain[i] = T_BURNT;
            w.regrow[i] = 3000;
            WbBailRelay.SetTerrain(w, i, T_WATER);                    // L979 regrow.Remove
            Assert.That(w.terrain[i], Is.EqualTo(T_WATER));
            Assert.That(w.regrow, Does.Not.Contain(i));               // 计时随覆写作废——水淹地不再复苏
        }

        [Test]
        public void Test32_SetTerrain_SameValueEarlyExit_KeepsRegrow()
        {
            var w = MakeWorld();                                      // L971 同值早退 → 级联零触达（L979 亦不达）
            int i = 46 * WbWorld.W + 58;
            w.terrain[i] = T_BURNT;
            w.regrow[i] = 3000;
            WbBailRelay.SetTerrain(w, i, T_BURNT);
            Assert.That(w.regrow[i], Is.EqualTo((long)3000));         // 计时保留
        }

        // ---------------- WbTickOrch REGROW 槽（16）接线 + %60 节律门（L2544 前半） ----------------

        [Test]
        public void Test32_OrchRegrowSlot_FiresAtMod60()
        {
            var w = MakeWorld();
            var orch = new WbTickOrch { w = w };
            orch.D[WbTickOrch.REGROW] = () => WbBailRelay.RegrowTick(w);   // 宿主 WireOrch 同形（M-U8b）
            int i = 47 * WbWorld.W + 58;
            w.terrain[i] = T_BURNT;
            w.regrow[i] = 60;                                         // tick 60 到期
            w.tickCount = 59;                                         // Tick() 首行 ++ → 60 → %60==0 触发
            orch.Tick();
            Assert.That(w.terrain[i], Is.EqualTo(T_GRASS));           // REGROW 槽真调落地
            Assert.That(w.regrow, Is.Empty);
            int j = 47 * WbWorld.W + 59;
            w.terrain[j] = T_BURNT;
            w.regrow[j] = 61;                                         // tick 61 到期——专钉节律门（若门破每 tick 触发即翻）
            orch.Tick();                                              // 60→61：%60!=0 → REGROW 不触发
            Assert.That(w.terrain[j], Is.EqualTo(T_BURNT));           // 已到期但节律未到——地形不动
            w.tickCount = 119;
            orch.Tick();                                              // →120：%60==0 → 补触发
            Assert.That(w.terrain[j], Is.EqualTo(T_GRASS));
            Assert.That(w.regrow, Is.Empty);
        }
    }
}
