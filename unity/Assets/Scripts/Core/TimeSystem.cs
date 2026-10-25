// PWB Unity Port — Core/TimeSystem.cs (U1)
// 固定步长时钟 + 全系统调度器。契约 §3:固定 15 TPS 累加器(Time.deltaTime 累积,
// Speed 0/1/3/8;单帧 tick 上限 30);Tick 计数;YearF=Tick/40(nature.ts YEAR_TICKS=40);
// Season=(floor(YearF/2))%4(nature.ts SEASON_YEARS=2);DayPhase=(Tick%2400)/2400f。
// 换季 EventBus.Emit("season", 四季文案 —— nature.ts seasonCheck 184-196 行原文)。
using System.Collections.Generic;
using UnityEngine;

namespace PWB.Core
{
    public sealed class TimeSystem : MonoBehaviour, ISystem
    {
        public static TimeSystem Instance;

        public const float Tps = 15f;                  // TICK_MS=66 → ~15tps(constants.ts 8 行)
        public const float Dt = 1f / Tps;
        public const int YearTicks = 40;               // YEAR_TICKS(constants.ts 9 行)
        public const int SeasonYears = 2;              // SEASON_YEARS(nature.ts 21 行)
        public const int DayTicks = 2400;              // 一昼夜 2400 tick
        public const int MaxStepsPerFrame = 30;        // 单帧步进硬上限(engine.ts 2690 同款防螺旋)

        public static readonly string[] SeasonNames = { "春", "夏", "秋", "冬" }; // nature.ts SEASON_NAMES
        // 换季文案:nature.ts seasonCheck 的 addEvent 文案(kind="season" 与 TS 一致)
        private static readonly string[] SeasonTexts =
        {
            "春回大地：万物复苏，草木返青（生物节律 · 春播加成）",
            "盛夏来临：烈日当空，野火更易燎原（火险上升）",
            "秋色渐染：金风送爽，林梢染红（草木生长放缓）",
            "寒冬降临：霜封大地，蛇虫蛰伏，死灵在长夜中愈发活跃",
        };

        /// <summary>速度档位 0/1/3/8(SPEEDS,constants.ts 28 行;UI.TopBarUI 切换)。</summary>
        public int Speed = 1;

        /// <summary>按序注册的模拟系统(GameBootstrap 注入;含自身且自身居首)。</summary>
        public List<ISystem> order;

        public int Tick { get; private set; }
        private float _acc;
        private int _lastSeason = -1;

        void Awake() { Instance = this; }

        void Update()
        {
            if (order == null || order.Count == 0) return;
            if (Speed > 0) _acc += Time.deltaTime * Speed;

            int steps = 0;
            while (_acc >= Dt)
            {
                _acc -= Dt;
                Step();
                if (++steps >= MaxStepsPerFrame) { _acc = Mathf.Min(_acc, Dt - 0.0001f); break; } // 截断积压防追赶风暴
            }
        }

        private void Step()
        {
            Tick++;
            var w = World.Instance;
            if (w == null) return;
            w.Tick = Tick;
            var sys = order;
            for (int i = 0; i < sys.Count; i++) sys[i].Tick(w); // 契约 §3 注册序:Time→Terrain→Fire→Units→...
        }

        /// <summary>游戏年份(40 tick=1 年)。</summary>
        public float YearF { get { return Tick / (float)YearTicks; } }

        /// <summary>季节 0春 1夏 2秋 3冬(一季 2 年)。</summary>
        public int Season { get { return (Tick / (YearTicks * SeasonYears)) % 4; } }

        /// <summary>昼夜相位 0-1(2400 tick/天)。</summary>
        public float DayPhase { get { return (Tick % DayTicks) / (float)DayTicks; } }

        /// <summary>tick 间插值进度(渲染层平滑用);暂停时定格 1(engine.ts 2695 同款)。</summary>
        public float TickAlpha
        {
            get { return Speed == 0 ? 1f : Mathf.Clamp01(_acc / Dt); }
        }

        /// <summary>ISystem:换季检测与宣告。开局首帧建立基线不播报(nature.ts lastSeason<0 静默)。
        /// 显式接口实现:与 Tick 计数属性同名共存。</summary>
        void ISystem.Tick(World w)
        {
            int s = Season;
            if (s == _lastSeason) return;
            bool first = _lastSeason < 0;
            _lastSeason = s;
            if (first) return;
            w.events.Emit("season", SeasonTexts[s], -1f, -1f, null);
        }
    }
}
