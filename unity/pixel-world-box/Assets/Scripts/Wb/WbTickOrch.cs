// ============================================================================
// WbTickOrch.cs —— M-U7c' engine.tick() 母体编排（engine.ts L2501-2655 机械同构）
//
// 对账面 = 61 调度点的触发序列（黄金 tick_orch.json 台账协议）：
//   · 调度点 = 可注入委托槽 D[]（宿主装配真实域函数 / NUnit 注入记录器）；
//     未装配槽位（null）为静默 no-op —— 编排骨架的翻译主体是结构本身
//     （顺序 + 节律门 + 状态操作），与「已译子域真调、未译子域留空」解耦。
//   · 深度守卫协议（gen ①）：台账只记 tick 体直接调度——嵌套内部调用
//     （worldWarTick→statsTick engine L8485 先例）双侧不记。骨架槽位为纯
//     委托调用无内部再派发，协议天然成立。
//   · lich 节律 season===3?8:12（L2604）：season = NatureSeason()
//     （nature.ts L160-163 getter 的 WbWorld 既有转写；laws.seasons=true
//     黄金前提 + seasonOffset=0）。
//   · 状态面（非调度、同构保留）：lx/ly 与 lax/lay 插值快照、yearF 累加
//     （f64 位型由黄金 yearFHex 审计对账）、panicNoteCd 递减、density
//     overlayDirty 门、shake *= 0.88。perf 分段剖析（tS..tE EMA）属宿主
//     性能域不进骨架（WbGameHost 帧调度域）。
// ============================================================================
using System;
using System.Collections.Generic;

namespace PixelWorldBox.Wb
{
    /// <summary>
    /// tick() 母体编排骨架 —— 蓝本 engine.ts GameEngine.tick L2501-2655。
    /// 槽位索引 = 黄金 manifest 序（tick_orch.json meta.manifest，NUnit 逐位对账锚）。
    /// </summary>
    public sealed class WbTickOrch
    {
        public WbWorld w;

        /// <summary>61 调度槽（Action，宿主/NUnit 注入；null = 未装配 no-op）</summary>
        public readonly Action[] D = new Action[61];

        // ---- 槽位索引（= 黄金 manifest 序；命名 = manifest 名转 PascalCase）----
        public const int FIRE = 0;                    // fireTick          L2517
        public const int REBUILD_BUCKETS = 1;         // rebuildBuckets    L2519
        public const int UNITS = 2;                   // unitsTick         L2521
        public const int PANIC = 3;                   // panicTick         L2524 %60===0
        public const int REBUILD_CIV_BUILD_COUNTS = 4; // rebuildCivBuildCounts L2526 %5 前半
        public const int CIVS = 5;                    // civsTick          L2526 %5 后半
        public const int EFFECTS = 6;                 // effectsTick       L2528（civs 块之后）
        public const int RAD = 7;                     // radTick           L2532 %30===0
        public const int FRONT = 8;                   // frontTick         L2533 %30===0
        public const int ECONOMY = 9;                 // economyTick       L2535 %120===0
        public const int TRADE = 10;                  // tradeTick         L2537 %40===0
        public const int DEFENSE = 11;                // defenseTick       L2538 %10===0
        public const int TEMPLE = 12;                 // templeTick        L2539 %120===0
        public const int BARRACKS = 13;               // barracksTick      L2540 %200===0
        public const int BANDIT_RAID = 14;            // banditRaidTick    L2542 %900===0
        public const int DRAGON_SPAWN = 15;           // dragonSpawnTick   L2543 %3000===0
        public const int REGROW = 16;                 // regrowTick        L2544 %60 前半
        public const int STATS = 17;                  // statsTick         L2544 %60 后半
        public const int CHECK_TRIGGERS = 18;         // checkTriggers     L2546 %8===0
        public const int DECALS = 19;                 // decalsTick        L2548 %2===0
        public const int FP = 20;                     // fpTick            L2550 %2===0
        public const int ICE = 21;                    // iceTick           L2552 %40===0
        public const int SNOWMAN = 22;                // snowmanTick       L2554 %80===16
        public const int HISTORY = 23;                // historyTick       L2555 %200===0
        public const int VICTORY = 24;                // victoryTick       L2556 %150===0
        public const int WAR = 25;                    // warTick           L2557 %200===0
        public const int WORLD_WAR = 26;              // worldWarTick      L2559 %30===0
        public const int ARMY = 27;                   // armyTick          L2561 %5===0
        public const int WAR_INFO = 28;               // warInfoTick       L2563 %100===0
        public const int DIRECTIVE = 29;              // directiveTick     L2565 %30===0
        public const int TECH = 30;                   // techTick          L2567 %120===5
        public const int SOCIETY = 31;                // societyTick       L2569 %150===7
        public const int ALLIANCE = 32;               // allianceTick      L2571 %300===23
        public const int ARMORY = 33;                 // armoryTick        L2573 %240===13
        public const int ECO = 34;                    // ecoTick           L2575 %120===9
        public const int EVOLUTION = 35;              // evolutionTick     L2577 %600===11
        public const int SAMPLE_HISTORY = 36;         // sampleHistory     L2579 %300===17
        public const int ACHIEVEMENTS = 37;           // achievementsTick  L2581 %600===19
        public const int NATURE_ATM = 38;             // nature.atmTick    L2583 %10===3
        public const int NATURE_STORM = 39;           // nature.stormTick  L2585 %40===5
        public const int NATURE_HYDRO = 40;           // nature.hydroTick  L2587 %120===9
        public const int NATURE_SEASON_CHECK = 41;    // nature.seasonCheck L2589 %40===0
        public const int NATURE_TECTONIC = 42;        // nature.tectonicTick L2591 %240===21
        public const int NATURE_GEOLOGY = 43;         // nature.geologyTick L2593 %600===31
        public const int WORLDSIM_OCEAN = 44;         // worldsim.oceanTick L2595 %120===15
        public const int ANGEL_AURA = 45;             // angelAuraTick     L2598 %3===0
        public const int PHOENIX_ASH = 46;            // phoenixAshTick    L2600 len>0（黄金窗口恒假）
        public const int ENT_GROVE = 47;              // entGroveTick      L2602 %10===0
        public const int LICH_RAISE = 48;             // lichRaiseTick     L2605 %(season===3?8:12)===0
        public const int HYDRA_REGEN = 49;            // hydraRegenTick    L2606 %30===0
        public const int BEACHED_AQUATIC = 50;        // beachedAquaticTick L2608 每 tick
        public const int WILDLIFE_REBOUND = 51;       // wildlifeReboundTick L2610 %600===61
        public const int PREDATOR_HUNT = 52;          // predatorHuntTick  L2612 %20===7
        public const int SHARK_BREED = 53;            // sharkBreedTick    L2614 %240===13
        public const int WORLDSIM_TEMP = 54;          // worldsim.tempTick  L2616 %120===27
        public const int WORLDSIM_GLACIER = 55;       // worldsim.glacierTick L2618 %240===33
        public const int WORLDSIM_HYDRO = 56;         // worldsim.hydroTick L2620 %600===41
        public const int WORLDSIM_COAST = 57;         // worldsim.coastTick L2622 %600===47
        public const int WORLDSIM_BIOME = 58;         // worldsim.biomeTick L2624 %600===53
        public const int WBB_TOUCH_META = 59;         // WBB.touchMeta      L2626 %120===57 前半
        public const int AGENT_LAWS_TICK = 60;        // agentLaws.tick     L2626 %120===57 后半

        /// <summary>槽位名（= 黄金 manifest 名；NUnit/宿主装配对照表）</summary>
        public static readonly string[] SlotNames =
        {
            "fireTick", "rebuildBuckets", "unitsTick", "panicTick", "rebuildCivBuildCounts", "civsTick",
            "effectsTick", "radTick", "frontTick", "economyTick", "tradeTick", "defenseTick", "templeTick",
            "barracksTick", "banditRaidTick", "dragonSpawnTick", "regrowTick", "statsTick", "checkTriggers",
            "decalsTick", "fpTick", "iceTick", "snowmanTick", "historyTick", "victoryTick", "warTick",
            "worldWarTick", "armyTick", "warInfoTick", "directiveTick", "techTick", "societyTick",
            "allianceTick", "armoryTick", "ecoTick", "evolutionTick", "sampleHistory", "achievementsTick",
            "nature.atmTick", "nature.stormTick", "nature.hydroTick", "nature.seasonCheck",
            "nature.tectonicTick", "nature.geologyTick", "worldsim.oceanTick", "angelAuraTick",
            "phoenixAshTick", "entGroveTick", "lichRaiseTick", "hydraRegenTick", "beachedAquaticTick",
            "wildlifeReboundTick", "predatorHuntTick", "sharkBreedTick", "worldsim.tempTick",
            "worldsim.glacierTick", "worldsim.hydroTick", "worldsim.coastTick", "worldsim.biomeTick",
            "WBB.touchMeta", "agentLaws.tick",
        };

        /// <summary>槽位分发（未装配 = no-op；装配即语义 —— 台账协议的 C# 消费端）</summary>
        private void Go(int slot)
        {
            Action d = D[slot];
            if (d != null) d();
        }

        /// <summary>
        /// tick() 母体 —— engine.ts L2501-2655 机械翻译（行号锚同槽位表）。
        /// </summary>
        public void Tick()
        {
            w.tickCount++;                                             // L2504
            // 渲染插值快照（L2506-2508）：本 tick 起始位 → 帧间 lx→x 插值
            for (int i = 0; i < w.units.Count; i++) { WbU u = w.units[i]; u.lx = u.x; u.ly = u.y; }
            // 军旗插值快照（L2509-2511）：行军在 civsTick（每 5 tick），帧间 lax→x 插值补滑
            for (int i = 0; i < w.armies.Count; i++) { WbArmy a = w.armies[i]; a.lax = a.x; a.lay = a.y; }
            w.yearF += 1.0 / WbConstants.YEAR_TICKS;                   // L2515
            Go(FIRE);                                                  // L2517
            Go(REBUILD_BUCKETS);                                       // L2519
            Go(UNITS);                                                 // L2521
            // 涌现社会内核：恐慌雪崩监测（每 60 tick ≈ 1.5 年采样）
            if (w.tickCount % 60 == 0) Go(PANIC);                      // L2524
            if (w.panicNoteCd > 0) w.panicNoteCd--;                    // L2525
            if (w.tickCount % 5 == 0) { Go(REBUILD_CIV_BUILD_COUNTS); Go(CIVS); } // L2526
            Go(EFFECTS);                                               // L2528
            // 密度热力图（L2530）：单位会移动，每 30 tick 刷新（density 模式门）
            if (w.overlayMode == "density" && w.tickCount % 30 == 0) w.overlayDirty = true;
            if (w.tickCount % 30 == 0) Go(RAD);                        // L2532
            if (w.tickCount % 30 == 0) Go(FRONT);                      // L2533
            if (w.tickCount % 120 == 0) Go(ECONOMY);                   // L2535
            if (w.tickCount % 40 == 0) Go(TRADE);                      // L2537
            if (w.tickCount % 10 == 0) Go(DEFENSE);                    // L2538
            if (w.tickCount % 120 == 0) Go(TEMPLE);                    // L2539
            if (w.tickCount % 200 == 0) Go(BARRACKS);                  // L2540
            if (w.tickCount % 900 == 0) Go(BANDIT_RAID);               // L2542
            if (w.tickCount % 3000 == 0) Go(DRAGON_SPAWN);             // L2543
            if (w.tickCount % 60 == 0) { Go(REGROW); Go(STATS); }      // L2544
            if (w.tickCount % 8 == 0) Go(CHECK_TRIGGERS);              // L2546
            if (w.tickCount % 2 == 0) Go(DECALS);                      // L2548
            if (w.tickCount % 2 == 0) Go(FP);                          // L2550
            if (w.tickCount % 40 == 0) Go(ICE);                        // L2552
            if (w.tickCount % 80 == 16) Go(SNOWMAN);                   // L2554
            if (w.tickCount % 200 == 0) Go(HISTORY);                   // L2555
            if (w.tickCount % 150 == 0) Go(VICTORY);                   // L2556
            if (w.tickCount % 200 == 0) Go(WAR);                       // L2557
            if (w.tickCount % 30 == 0) Go(WORLD_WAR);                  // L2559
            if (w.tickCount % 5 == 0) Go(ARMY);                        // L2561
            if (w.tickCount % 100 == 0) Go(WAR_INFO);                  // L2563
            if (w.tickCount % 30 == 0) Go(DIRECTIVE);                  // L2565
            if (w.tickCount % 120 == 5) Go(TECH);                      // L2567
            if (w.tickCount % 150 == 7) Go(SOCIETY);                   // L2569
            if (w.tickCount % 300 == 23) Go(ALLIANCE);                 // L2571
            if (w.tickCount % 240 == 13) Go(ARMORY);                   // L2573
            if (w.tickCount % 120 == 9) Go(ECO);                       // L2575
            if (w.tickCount % 600 == 11) Go(EVOLUTION);                // L2577
            if (w.tickCount % 300 == 17) Go(SAMPLE_HISTORY);           // L2579
            if (w.tickCount % 600 == 19) Go(ACHIEVEMENTS);             // L2581
            if (w.tickCount % 10 == 3) Go(NATURE_ATM);                 // L2583
            if (w.tickCount % 40 == 5) Go(NATURE_STORM);               // L2585
            if (w.tickCount % 120 == 9) Go(NATURE_HYDRO);              // L2587
            if (w.tickCount % 40 == 0) Go(NATURE_SEASON_CHECK);        // L2589
            if (w.tickCount % 240 == 21) Go(NATURE_TECTONIC);          // L2591
            if (w.tickCount % 600 == 31) Go(NATURE_GEOLOGY);           // L2593
            if (w.tickCount % 120 == 15) Go(WORLDSIM_OCEAN);           // L2595
            if (w.tickCount % 3 == 0) Go(ANGEL_AURA);                  // L2598
            if (w.phoenixAshes.Count > 0) Go(PHOENIX_ASH);             // L2600
            if (w.tickCount % 10 == 0) Go(ENT_GROVE);                  // L2602
            // 巫妖复生节律（季节 × 万物）：寒冬死潮加速（12→8 tick）
            if (w.tickCount % (w.NatureSeason() == 3 ? 8 : 12) == 0) Go(LICH_RAISE); // L2605
            if (w.tickCount % 30 == 0) Go(HYDRA_REGEN);                // L2606
            Go(BEACHED_AQUATIC);                                       // L2608 每 tick
            if (w.tickCount % 600 == 61) Go(WILDLIFE_REBOUND);         // L2610
            if (w.tickCount % 20 == 7) Go(PREDATOR_HUNT);              // L2612
            if (w.tickCount % 240 == 13) Go(SHARK_BREED);              // L2614
            if (w.tickCount % 120 == 27) Go(WORLDSIM_TEMP);            // L2616
            if (w.tickCount % 240 == 33) Go(WORLDSIM_GLACIER);         // L2618
            if (w.tickCount % 600 == 41) Go(WORLDSIM_HYDRO);           // L2620
            if (w.tickCount % 600 == 47) Go(WORLDSIM_COAST);           // L2622
            if (w.tickCount % 600 == 53) Go(WORLDSIM_BIOME);           // L2624
            // v40：Agent 法则结算（每 120 tick：神谕书写的活机制触发器×动作）
            if (w.tickCount % 120 == 57) { Go(WBB_TOUCH_META); Go(AGENT_LAWS_TICK); } // L2626
            w.shake *= 0.88;                                           // L2628
            // （L2630-2654 perf EMA/分段剖析 —— 宿主性能域，不进骨架）
        }
    }
}
