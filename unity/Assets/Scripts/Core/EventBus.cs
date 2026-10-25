// PWB Unity Port — Core/EventBus.cs (U1)
// 世界纪事/播报总线。契约 §3:public void Emit(kind,text,x,y,color=null) + List<string> Recent。
// Recent 为最近 200 条环形缓冲(超出淘汰最旧);结构化记录 Ev[] 环形供 UI(顶栏纪事/检查器)取数。
// Emit 为低频事件路径(建国/战争/换季/天灾),字符串操作允许;热 tick 循环禁止拼接。
using System.Collections.Generic;

namespace PWB.Core
{
    public sealed class EventBus
    {
        public const int Capacity = 200;

        /// <summary>单条事件的结构化形态(环形缓冲 Recent 的数据视图)。</summary>
        public struct Ev
        {
            public string kind;   // 契约事件 kind:found/war/peace/season/geo/fireOut/...
            public string text;   // 文案(精简版,kind 字符串与 TS 保持一致)
            public string color;  // 可选十六进制主题色(王国色等;null=无)
            public float x, y;    // 发生地 tile 坐标;全局事件传 (-1,-1)
            public int year;      // 发生年份(40 tick = 1 年)
        }

        /// <summary>最近事件文本(环形 200 条,最新在末尾)。格式:"[第N年] 文本"。</summary>
        public readonly List<string> Recent = new List<string>(Capacity);

        /// <summary>结构化环形缓冲(容量 200;Head 为下一写入位,Count 为有效条数)。</summary>
        public readonly Ev[] Ring = new Ev[Capacity];
        public int Head;
        public int Count;

        /// <summary>发一条世界事件。x/y 缺省 -1 表示无发生地(全局事件)。</summary>
        public void Emit(string kind, string text, float x = -1f, float y = -1f, string color = null)
        {
            int year = 0;
            var ts = TimeSystem.Instance;
            if (ts != null) year = (int)(ts.Tick / (float)TimeSystem.YearTicks);

            var e = new Ev { kind = kind, text = text, color = color, x = x, y = y, year = year };

            // 环形写入
            Ring[Head] = e;
            Head = Head + 1 == Capacity ? 0 : Head + 1;
            if (Count < Capacity) Count++;

            // Recent 文本视图(淘汰最旧)
            Recent.Add("[第" + year + "年] " + text);
            if (Recent.Count > Capacity) Recent.RemoveRange(0, Recent.Count - Capacity);
        }

        /// <summary>按倒序取第 back 条(0=最新)结构化事件。</summary>
        public bool TryGet(int back, out Ev ev)
        {
            ev = default;
            if (back < 0 || back >= Count) return false;
            int idx = Head - 1 - back;
            if (idx < 0) idx += Capacity;
            ev = Ring[idx];
            return true;
        }

        /// <summary>清空(重开新世界用)。</summary>
        public void Clear()
        {
            Recent.Clear();
            Head = 0;
            Count = 0;
        }
    }
}
