// ============================================================
// WbSetTerrainTests.cs — M-U8a sim 域：setTerrain 地形簿记全级联语义面（NUnit）
// 蓝本锚：engine.ts setTerrain L969-1007——WbBailRelay.SetTerrain 机械翻译件（WallDefenseOf 后位）。
//   白行者寒霜灵气 4 写点重接（L3577/L3578/L3579/L3588——M-U7k「L950 簿记 no-op 域」注记消亡）。
// 黄金链定性：级联在 units-update 链内零消费面（fire 灭火为白行者显式支路 L3581 非级联；
//   riverDir/regrow/frozen 消费域均不在 updateUnit）——零新黄金（M-U7y flushProps 先例），
//   本套件直测级联语义 + 既有黄金 replay 全量回归（md5 fd09587b 不变即零漂移实证）。
// 语义闸门（constants.ts L67-69）：isWater(t)=DEEP||WATER——ICE 非水，冻 ICE 不触发
//   owner/建筑/道路三联（WATER/LAVA 覆写才触发）；riverDir 清除非水覆写即触发。
// Unity 侧执行: Window > General > Test Runner（EditMode）。
// ============================================================
using System.Collections.Generic;
using NUnit.Framework;
using PixelWorldBox.Wb;

namespace PixelWorldBox.Tests
{
    public class WbSetTerrainTests
    {
        const byte T_DEEP = WbWorld.T_DEEP, T_WATER = WbWorld.T_WATER, T_SAND = WbWorld.T_SAND,
                   T_GRASS = WbWorld.T_GRASS, T_BURNT = WbWorld.T_BURNT, T_SNOW = WbWorld.T_SNOW,
                   T_LAVA = WbWorld.T_LAVA, T_ICE = WbWorld.T_ICE;

        static WbWorld MakeWorld() => new WbWorld();

        // ---------------- 同值早退门（L971——级联零触达） ----------------

        [Test]
        public void Test31_SameValueEarlyExit_NoCascade()
        {
            var w = MakeWorld();
            int i = 5 * WbWorld.W + 5;
            w.terrain[i] = T_SNOW;
            w.fire[i] = 120; w.fireSet.Add(i);                       // 火场在场——早退则灭火支路不得触达
            WbBailRelay.SetTerrain(w, i, T_SNOW);                         // prev==t → return
            Assert.That(w.terrain[i], Is.EqualTo(T_SNOW));
            Assert.That(w.fire[i], Is.EqualTo(120));                 // 火未熄——早退门挡住级联
            Assert.That(w.fireSet, Does.Contain(i));
        }

        // ---------------- riverDir 清除支路（L986-989——非水覆写即清） ----------------

        [Test]
        public void Test31_RiverDirCleared_NonWaterOverwrite()
        {
            var w = MakeWorld();
            int i = 40 * WbWorld.W + 58;
            w.terrain[i] = T_WATER;
            w.riverDir[i] = 3; w.riverTiles.Add(i); w.riverTilesList.Add(i);   // 河道在场（dir 3 = 八向之一）
            WbBailRelay.SetTerrain(w, i, T_SNOW);                         // 非水覆写
            Assert.That(w.terrain[i], Is.EqualTo(T_SNOW));
            Assert.That(w.riverDir[i], Is.EqualTo(0));               // L987 流向场清
            Assert.That(w.riverTiles, Does.Not.Contain(i));          // L988 成员集出账
            CollectionAssert.DoesNotContain(w.riverTilesList, i);    // 插入序镜像同步（Worldgen L536 增补纪律删除侧）
        }

        [Test]
        public void Test31_RiverDirKept_WaterOverwrite()
        {
            var w = MakeWorld();
            int i = 40 * WbWorld.W + 59;
            w.terrain[i] = T_GRASS;
            w.riverDir[i] = 5; w.riverTiles.Add(i); w.riverTilesList.Add(i);
            WbBailRelay.SetTerrain(w, i, T_WATER);                        // 水覆写（水工具画的普通水不算河，不补录也不清）
            Assert.That(w.riverDir[i], Is.EqualTo(5));               // isWater(t) → 清除支路不触达
            Assert.That(w.riverTiles, Does.Contain(i));
        }

        // ---------------- 灭火支路（L990-993） ----------------

        [Test]
        public void Test31_FireExtinguished_OnTerrainChange()
        {
            var w = MakeWorld();
            int i = 63 * WbWorld.W + 58;                             // gen 夹具 fireSet 位先例（S? fire 场景 L330 同位）
            w.terrain[i] = T_GRASS;
            w.fire[i] = 200; w.fireSet.Add(i);
            WbBailRelay.SetTerrain(w, i, T_BURNT);
            Assert.That(w.terrain[i], Is.EqualTo(WbWorld.T_BURNT));
            Assert.That(w.fire[i], Is.EqualTo(0));                   // L991 火场强度清零
            Assert.That(w.fireSet, Does.Not.Contain(i));             // L992 火格集出账
        }

        // ---------------- 水/岩浆吞没三联（L994-1004）——owner 熄灭 + 建筑摧毁 + 道路溺断 ----------------

        [Test]
        public void Test31_WaterDrown_OwnerBuildingRoad()
        {
            var w = MakeWorld();
            int i = 24 * WbWorld.W + 40;
            w.terrain[i] = T_GRASS;
            w.owner[i] = 2;                                          // 领土在场
            w.building[i] = 11;                                      // WALL（BUILD_KINDS.WALL）——建筑在场
            var b = new WbBuilding { i = i, x = 40, y = 24, kind = 11, civ = -1 };   // civ=-1 → CivAt null → houses 账不触
            w.buildings.Add(b); w.bIdx[i] = 0;
            w.road[i] = 5;                                           // 道路在场
            WbBailRelay.SetTerrain(w, i, T_WATER);
            Assert.That(w.owner[i], Is.EqualTo(-1));                 // L995 领土熄灭
            Assert.That(w.building[i], Is.EqualTo(0));               // L999→DestroyBuilding 建筑清
            Assert.That(w.bIdx, Does.Not.ContainKey(i));             // bIdx 出账（swap-pop 语义）
            Assert.That(w.buildings, Is.Empty);                      // 单建筑 swap-pop 后空
            Assert.That(w.road[i], Is.EqualTo(0));                   // L1003 道路溺断
            Assert.That(w.terrain[i], Is.EqualTo(T_WATER));
            Assert.That(w.effects, Is.Not.Empty);                    // DestroyBuilding smoke fx 落地
            Assert.That(w.effects[w.effects.Count - 1].kind, Is.EqualTo("smoke"));
        }

        [Test]
        public void Test31_LavaDrown_OwnerBuildingRoad()
        {
            var w = MakeWorld();
            int i = 30 * WbWorld.W + 70;
            w.terrain[i] = T_GRASS;
            w.owner[i] = 1;
            w.building[i] = 3;                                       // 非 WALL 普通建筑（级联门 building[i]>0 不分种类）
            w.buildings.Add(new WbBuilding { i = i, x = 70, y = 30, kind = 3, civ = -1 });
            w.bIdx[i] = 0;
            w.road[i] = 9;
            WbBailRelay.SetTerrain(w, i, T_LAVA);
            Assert.That(w.owner[i], Is.EqualTo(-1));                 // LAVA 同三联（isWater||LAVA）
            Assert.That(w.building[i], Is.EqualTo(0));
            Assert.That(w.road[i], Is.EqualTo(0));
            Assert.That(w.terrain[i], Is.EqualTo(T_LAVA));
        }

        // ---------------- ICE 语义闸门（isWater(ICE)=false——冻冰不触发三联，riverDir 照清） ----------------

        [Test]
        public void Test31_IceFreeze_KeepsOwnerRoad_ClearsRiverDir()
        {
            var w = MakeWorld();                                     // 寒冰之路写点形态（L3588 水面冻 ICE）
            int i = 50 * WbWorld.W + 50;
            w.terrain[i] = T_WATER;
            w.owner[i] = 3;                                          // 水域领土（极端夹具——语义闸门验证面）
            w.building[i] = 2;
            w.buildings.Add(new WbBuilding { i = i, x = 50, y = 50, kind = 2, civ = -1 });
            w.bIdx[i] = 0;
            w.road[i] = 4;
            w.riverDir[i] = 2; w.riverTiles.Add(i); w.riverTilesList.Add(i);
            WbBailRelay.SetTerrain(w, i, T_ICE);
            Assert.That(w.terrain[i], Is.EqualTo(T_ICE));
            Assert.That(w.owner[i], Is.EqualTo(3));                  // ICE 非水 → 领土保留（L994 门败）
            Assert.That(w.building[i], Is.EqualTo(2));               // 建筑保留（L998 门败）
            Assert.That(w.road[i], Is.EqualTo(4));                   // 道路保留（L1002 门败）
            Assert.That(w.riverDir[i], Is.EqualTo(0));               // 非水覆写 → riverDir 照清（L986 门中）
            Assert.That(w.riverTiles, Does.Not.Contain(i));
        }
    }
}
