using System;
using System.Collections.Generic;

namespace PixelWorldBox.Wb
{
    /// <summary>
    /// M-U7c tick() 编排层——engine.ts L2501-2649 tick() 母体机械翻译。
    /// 蓝本：src/lib/game/engine.ts L2501-2649（五纪律①：逐行行号锚）。
    /// trace 协议：黄金 gen-tick.mjs（引擎 intercept 实录）↔ tick-transcript.mjs（独立调度表转写）
    /// ↔ 本编排器同名 push，三链逐位。`name@tickCount`（tickCount 为 L2503 自增后值）。
    /// 已译域真调（WbCivSim 九域 + RebuildBuckets），未译域桩（push+return——桩域注明未译切片，
    /// 域行为各有自己的黄金切片；Task 133 遗留①：编排接线后 Unity 全链可跑 sim）。
    /// 性能段 L2629-2648（tickMs/perf EMA/perfWin）为宿主性能域，不进对账面，跳过（宿主侧自计）。
    /// </summary>
    public static class WbTick
    {
        /// <summary>phoenixAshes 元素——engine.ts L490 `{ x, y, t, rebirths }`（L3332 push 形态）</summary>
        public class WbPhoenixAsh
        {
            public double x;
            public double y;
            public double t;
            public double rebirths;
        }

        /// <summary>
        /// tick 母体编排（engine.ts L2501-2649）。trace 非空时记录调度序列（对账协议）；
        /// 生产宿主传 null（零开销）。
        /// </summary>
        public static void Tick(WbWorld w, List<string> trace = null)
        {
            // engine L2503
            w.tickCount++;
            // engine L2504-2509 渲染插值快照：本 tick 起始位置 → 渲染帧在 lx→x 间插值
            for (int i = 0; i < w.units.Count; i++)
            {
                WbU u = w.units[i];
                u.lx = u.x;
                u.ly = u.y;
            }
            // engine L2510-2514 军旗插值快照（Task 48-B3）：行军发生在 civsTick（每 5 tick），帧间以 lax→x 插值补滑
            for (int i = 0; i < w.armies.Count; i++)
            {
                WbArmy a = w.armies[i];
                a.lax = a.x;
                a.lay = a.y;
            }
            // engine L2515（YEAR_TICKS = 40，constants.ts L9 / WbConstants.cs L405）
            w.yearF += 1.0 / WbConstants.YEAR_TICKS;
            // engine L2517 火势（未译——M-U 余域）
            T(w, trace, "fireTick");
            // engine L2519 空间桶重建（WbWorld.RebuildBuckets——M-U3h 第五批宿主面）
            w.RebuildBuckets();
            if (trace != null) trace.Add($"rebuildBuckets@{w.tickCount}");
            // engine L2521 单位主循环（未译——updateUnit 主体 L3465-4113 战斗/职业域为最大未译单函数）
            T(w, trace, "unitsTick");
            // —— 涌现社会内核：恐慌雪崩监测（每 60 tick ≈ 1.5 年采样：峰值统计 + 雪崩事件）—— engine L2523-2524
            if (w.tickCount % 60 == 0) T(w, trace, "panicTick");
            // engine L2525
            if (w.panicNoteCd > 0) w.panicNoteCd--;
            // engine L2526（宿主协议：WbCivSim.cs L14 注——%5 门先重建分类计数再文明 tick）
            if (w.tickCount % 5 == 0)
            {
                WbCivSim.RebuildCivBuildCounts(w);
                if (trace != null) trace.Add($"rebuildCivBuildCounts@{w.tickCount}");
                WbCivSim.CivsTick(w);
                if (trace != null) trace.Add($"civsTick@{w.tickCount}");
            }
            // engine L2528 视效队列（未译——fx 消费面在 WbFx 事件流）
            T(w, trace, "effectsTick");
            // engine L2531 密度热力图：单位会移动，每 30 tick（2 年）刷新一次覆盖层
            if (w.overlayMode == "density" && w.tickCount % 30 == 0) w.overlayDirty = true;
            // engine L2532
            if (w.tickCount % 30 == 0) T(w, trace, "radTick");
            // engine L2533 动态战线周期结算（衰减/反攻/收复）
            if (w.tickCount % 30 == 0) T(w, trace, "frontTick");
            // engine L2535 深度文明系统：经济（集市/图书馆产出）→ 防御建筑（箭塔/城堡射击）→ 神殿治疗 → 兵营训练
            if (w.tickCount % 120 == 0)
            {
                WbCivSim.EconomyTick(w);
                if (trace != null) trace.Add($"economyTick@{w.tickCount}");
            }
            // engine L2537 深度打磨：国际贸易（每年一次的市场驱动商队调度）（未译——M-U3h 商队域宿主侧）
            if (w.tickCount % 40 == 0) T(w, trace, "tradeTick");
            // engine L2538
            if (w.tickCount % 10 == 0) T(w, trace, "defenseTick");
            // engine L2539
            if (w.tickCount % 120 == 0) T(w, trace, "templeTick");
            // engine L2540
            if (w.tickCount % 200 == 0) T(w, trace, "barracksTick");
            // engine L2542 世界法则驱动的周期事件：强盗袭击（22.5 年）
            if (w.tickCount % 900 == 0) T(w, trace, "banditRaidTick");
            // engine L2543 巨龙降临（75 年）
            if (w.tickCount % 3000 == 0) T(w, trace, "dragonSpawnTick");
            // engine L2544
            if (w.tickCount % 60 == 0)
            {
                T(w, trace, "regrowTick");
                T(w, trace, "statsTick");
            }
            // engine L2546 事件触发器评估（每 8 tick ≈ 0.2 年：条件响应及时且开销可忽略）
            if (w.tickCount % 8 == 0) T(w, trace, "checkTriggers");
            // engine L2548 原子级 decals：血迹/尸骸老化淡出（每 2 tick）
            if (w.tickCount % 2 == 0) T(w, trace, "decalsTick");
            // engine L2550 Task 48-B1：脚印采样（每 2 tick；确定性条件零 RNG——位等安全）
            if (w.tickCount % 2 == 0) T(w, trace, "fpTick");
            // engine L2552 冰面生态：消融（火/岩浆/暖气候）+ 极地自然冻结 + 海啸洪水退潮 + 湿沙干透（每 40 tick）
            if (w.tickCount % 40 == 0) T(w, trace, "iceTick");
            // engine L2554 冬季雪人（Task 104）：村民雪地堆雪人 / 出冬渐融（每 80 tick，与 iceTick 错峰）
            if (w.tickCount % 80 == 16) T(w, trace, "snowmanTick");
            // engine L2555 文明兴衰历史采样：每 200 tick（5 年）
            if (w.tickCount % 200 == 0) T(w, trace, "historyTick");
            // engine L2556
            if (w.tickCount % 150 == 0) T(w, trace, "victoryTick");
            // engine L2557
            if (w.tickCount % 200 == 0) T(w, trace, "warTick");
            // engine L2559 终极世界大战：终局判定/停战到期重启战端/战端重燃/现代武器部署（每 30 tick）
            if (w.tickCount % 30 == 0) T(w, trace, "worldWarTick");
            // engine L2561 军团方阵体系：状态机每 5 tick 推进（集结/行军/会战/围城/溃退）——已译 WbCivSim.ArmyTick
            if (w.tickCount % 5 == 0)
            {
                WbCivSim.ArmyTick(w);
                if (trace != null) trace.Add($"armyTick@{w.tickCount}");
            }
            // engine L2563 战争体系升级：战争分数结算/割地/亡乏（每 100 tick）
            if (w.tickCount % 100 == 0) T(w, trace, "warInfoTick");
            // engine L2565 文明旨意：进度评估/成功/失败（每 30 tick）——已译 WbCivSim.DirectiveTick
            if (w.tickCount % 30 == 0)
            {
                WbCivSim.DirectiveTick(w);
                if (trace != null) trace.Add($"directiveTick@{w.tickCount}");
            }
            // engine L2567 科技研发：选题/投入/完成（每 120 tick，与经济错峰）——已译 WbCivSim.TechTick
            if (w.tickCount % 120 == 5)
            {
                WbCivSim.TechTick(w);
                if (trace != null) trace.Add($"techTick@{w.tickCount}");
            }
            // engine L2569 社会体系：稳定度/文化/军国主义/政体演变/收支（每 150 tick）——已译 WbCivSim.SocietyTick
            if (w.tickCount % 150 == 7)
            {
                WbCivSim.SocietyTick(w);
                if (trace != null) trace.Add($"societyTick@{w.tickCount}");
            }
            // engine L2571 联盟系统：结盟/扩员/凝聚力结算/经济互助/种族关系漂移（每 300 tick ≈ 7.5 年，与外交错峰）
            // ——已译 WbCivSim.AllianceTick
            if (w.tickCount % 300 == 23)
            {
                WbCivSim.AllianceTick(w);
                if (trace != null) trace.Add($"allianceTick@{w.tickCount}");
            }
            // engine L2573 军备工坊：科技军备等级 → 自动武装国民（每 240 tick）
            if (w.tickCount % 240 == 13) T(w, trace, "armoryTick");
            // engine L2575 生态竞争：植被/食草/食肉承载力与竞争性饥饿（每 120 tick）
            if (w.tickCount % 120 == 9) T(w, trace, "ecoTick");
            // engine L2577 生物进化：种群基因均值 → 棘轮推进与亚种播报（每 600 tick）
            if (w.tickCount % 600 == 11) T(w, trace, "evolutionTick");
            // engine L2579 种群历史采样：生态面板曲线数据（每 300 tick ≈ 1 年）
            if (w.tickCount % 300 == 17) T(w, trace, "sampleHistory");
            // engine L2581 成就评估：解锁新成就 + 进度缓存（每 600 tick）
            if (w.tickCount % 600 == 19) T(w, trace, "achievementsTick");
            // —— 自然引擎（WbNature 未译——M-U 余域）——
            // engine L2583 大气环流（每 10 tick：蒸发/平流/云雨/雨影）
            if (w.tickCount % 10 == 3) T(w, trace, "nature.atmTick");
            // engine L2585 风暴生命周期 + 气候型天灾（每 40 tick）
            if (w.tickCount % 40 == 5) T(w, trace, "nature.stormTick");
            // engine L2587 水文（每 120 tick）：丰沛降雨在山地汇流成新河（大气→地貌因果链）
            if (w.tickCount % 120 == 9) T(w, trace, "nature.hydroTick");
            // engine L2589 季节轮转检测（每 40 tick；换季全图刷新色调）
            if (w.tickCount % 40 == 0) T(w, trace, "nature.seasonCheck");
            // engine L2591 板块构造（每 240 tick：应力积累/地震释放/热点增压）
            if (w.tickCount % 240 == 21) T(w, trace, "nature.tectonicTick");
            // engine L2593 地质演变（每 600 tick：造山/侵蚀/沉积/火山喷发/裂谷）
            if (w.tickCount % 600 == 31) T(w, trace, "nature.geologyTick");
            // —— 深时引擎（WbWorldSim 未译——M-U 余域）——
            // engine L2595 洋流环流（每 120 tick：风应力+科氏 Jacobi 流函数 → 西向强化暖流）
            if (w.tickCount % 120 == 15) T(w, trace, "worldsim.oceanTick");
            // —— 天使光环（引擎级通道：治愈是纯 TS 增益；每 3 tick 扫描）—— engine L2596-2598
            if (w.tickCount % 3 == 0) T(w, trace, "angelAuraTick");
            // —— 凤凰涅槃（引擎级通道：灰烬倒数到点重生）—— engine L2599-2600
            if (w.phoenixAshes.Count > 0) T(w, trace, "phoenixAshTick");
            // —— 树人播种（引擎级通道：植树/灭火是纯地形操作）—— engine L2601-2602
            if (w.tickCount % 10 == 0) T(w, trace, "entGroveTick");
            // —— 巫妖死灵复生（引擎级通道）：季节 × 万物——寒冬死潮加速（12→8 tick）—— engine L2603-2605
            if (w.tickCount % (w.NatureSeason() == 3 ? 8 : 12) == 0) T(w, trace, "lichRaiseTick");
            // engine L2606
            if (w.tickCount % 30 == 0) T(w, trace, "hydraRegenTick");
            // —— 水生搁浅整治（引擎级通道：救援必须在通道层）—— engine L2607-2608（每 tick）
            T(w, trace, "beachedAquaticTick");
            // —— 百兽迁徙（引擎级通道：灭绝野生动物的低频回归——每 600 tick ≈3.3 年掷签一支迁徙兽群）—— engine L2609-2610
            if (w.tickCount % 600 == 61) T(w, trace, "wildlifeReboundTick");
            // —— 猎手扑杀（引擎级通道：每 20 tick 一轮扑杀窗口）—— engine L2611-2612
            if (w.tickCount % 20 == 7) T(w, trace, "predatorHuntTick");
            // —— 鲨群繁衍辅助（引擎级通道：低种群地板机制——<8 启动）—— engine L2613-2614
            if (w.tickCount % 240 == 13) T(w, trace, "sharkBreedTick");
            // —— 深时引擎：动态温度场（每 120 tick）—— engine L2615-2616
            if (w.tickCount % 120 == 27) T(w, trace, "worldsim.tempTick");
            // —— 深时引擎：冰川系统（每 240 tick：积累/消融/进退——火山冬反馈环）—— engine L2617-2618
            if (w.tickCount % 240 == 33) T(w, trace, "worldsim.glacierTick");
            // —— 深时引擎：水力侵蚀与沉积（每 600 tick 与地质错峰）—— engine L2619-2620
            if (w.tickCount % 600 == 41) T(w, trace, "worldsim.hydroTick");
            // —— 深时引擎：海平面与海岸线进退（每 600 tick：全球均温驱动，有主领土绕行）—— engine L2621-2622
            if (w.tickCount % 600 == 47) T(w, trace, "worldsim.coastTick");
            // —— 深时引擎：群系漂移（每 600 tick：气候期望 vs 现状持续错配才迁移）—— engine L2623-2624
            if (w.tickCount % 600 == 53) T(w, trace, "worldsim.biomeTick");
            // —— v40：Agent 法则结算（每 120 tick：神谕书写的活机制触发器×动作；保守收口）—— engine L2625-2626
            if (w.tickCount % 120 == 57)
            {
                T(w, trace, "WBB.touchMeta"); // WASM 内核 meta 重灌哨兵（wbspatial 模块级）
                T(w, trace, "agentLaws.tick"); // AgentLawSystem 未译——神谕域（ORACLE_V2 R1 关联）
            }
            // engine L2627
            w.shake *= 0.88;
            // engine L2629-2648 性能段（tickMs/perf EMA + 500ms 窗口 simUps）——宿主性能域不进对账面，跳过
        }

        /// <summary>未译域桩：push 调度 trace 后返回（域行为各有自己的黄金切片；Task 133 遗留①余量）</summary>
        private static void T(WbWorld w, List<string> trace, string name)
        {
            if (trace != null) trace.Add($"{name}@{w.tickCount}");
        }
    }
}
