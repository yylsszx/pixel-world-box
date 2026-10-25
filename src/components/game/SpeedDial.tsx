'use client';
// ============ SpeedDial（无极调速）：时间流速的任意值设定盘 ============
// 三入口共享：桌面 TopBar 速度段「Gauge 钮」/ 移动端岁月沙漏（长按胶囊或点倍速徽标）/
// 神界俯瞰图控制行「无极」钮。内容（SpeedDialContent）也可内嵌进任意 Popover。
//   · 数字输入：直接打数字（0–20，支持一位小数；0 = 暂停）
//   · 滑条：0.1–20 连续拖（非线性感知：低倍区步进细、高倍区步进粗——捏合手感等价）
//   · 预设档：⏸ / 0.5 / 1 / 2 / 3 / 5 / 8 / 12 / 16 / 20
// 引擎侧已有自适应步长保护（simMs 过重自动收紧单帧 tick 数），高倍速实际生效
// 以设备性能为上限 —— 面板内置实时「实际生效速率」读数（simUps 换算），保护降速时亮起明示。
import { useEffect, useRef, useState } from 'react';
import { Pause, Play, Gauge, RotateCcw, ShieldAlert } from 'lucide-react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { TICK_MS } from '@/lib/game/constants';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { sfx } from '@/lib/game/sfx';

export const SPEED_MIN = 0.1;
export const SPEED_MAX = 20;
/** 经典档位（TopBar 运输段同款）：自定义值不亮任何预设 chip */
export const SPEED_PRESETS = [0, 0.5, 1, 2, 3, 5, 8, 12, 16, 20];

/** 速度值 → 展示串（0 = ⏸；整数省小数；其余保留 ≤2 位） */
export function fmtSpeed(v: number): string {
  if (v <= 0) return '⏸';
  if (Math.abs(v - Math.round(v)) < 0.005) return `${Math.round(v)}×`;
  return `${Math.round(v * 100) / 100}×`;
}

/** —— 非线性滑条映射：滑条 0–1 ↔ 速度 0.1–20（平方曲线，低倍区占半程） ——
 *  线性滑条在 0.1–3 的常用区间只有 15% 行程，微调极难；平方映射让 0–3 占 39% 行程。 */
function sliderToSpeed(t: number): number {
  const v = SPEED_MIN + (SPEED_MAX - SPEED_MIN) * t * t;
  return Math.round(v * 100) / 100;
}
function speedToSlider(v: number): number {
  if (v <= SPEED_MIN) return 0;
  const t = Math.sqrt((v - SPEED_MIN) / (SPEED_MAX - SPEED_MIN));
  return Math.max(0, Math.min(1, t));
}

/** —— 数字输入原子件：失焦/回车提交，Esc 取消；非法输入回退当前值 —— */
function SpeedInput({ onCommit }: { onCommit: (v: number) => void }) {
  const speed = useGameStore((s) => s.speed);
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const commit = () => {
    if (draft == null) return;
    const n = parseFloat(draft);
    if (Number.isFinite(n)) onCommit(n);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoFocus
        onFocus={(e) => e.target.select()}
        value={draft ?? (speed <= 0 ? '' : String(speed))}
        placeholder="0-20"
        aria-label="自定义时间流速倍率"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          else if (e.key === 'Escape') setDraft(null);
          e.stopPropagation(); // 不外泄给游戏键位（空格暂停/数字键调速）
        }}
        className="h-7 w-16 rounded-md border border-[rgba(214,178,120,0.3)] bg-[rgba(19,16,9,0.6)] px-2 text-right font-mono text-xs font-bold text-[#efc377] outline-none focus:border-[#c8964a]"
      />
      <span className="text-[10px] font-bold text-[#a2957c]">×</span>
    </div>
  );
}

/** 无级调速面板内容（嵌入任意 Popover / 直挂 DOM） */
export function SpeedDialContent({ onSet }: { onSet?: (v: number) => void }) {
  const speed = useGameStore((s) => s.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);
  // Task 72 遗留收口：实际生效速率读数 —— simUps（每秒模拟 tick 数，引擎 500ms 窗口 EMA）
  // 换算为信义倍率（TICK_MS=66 → 1× ≈ 15.15 tps）；自适应保护降速时与设定值拉开差距即亮提示
  const [eff, setEff] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      const ups = getEngine()?.perf.simUps ?? 0;
      setEff((ups * TICK_MS) / 1000);
    }, 600);
    return () => clearInterval(iv);
  }, []);
  const throttled = speed > 0.5 && eff > 0.2 && eff < speed * 0.88;
  const apply = (v: number) => {
    setSpeed(v);
    onSet?.(v);
  };
  return (
    <div className="flex w-[248px] flex-col gap-2.5 p-1">
      {/* 当前值 + 数字输入 */}
      <div className="flex items-center justify-between">
        <span className="flex items-baseline gap-1.5">
          <Gauge className="h-3.5 w-3.5 translate-y-0.5 text-[#e6ba6c]" aria-hidden />
          <span className="text-[11px] font-bold tracking-widest text-[#e6ba6c]">时间流速</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-base font-black tabular-nums text-[#efc377]">
            {speed <= 0 ? <Pause className="h-4 w-4" aria-label="已暂停" /> : fmtSpeed(speed)}
          </span>
          <SpeedInput onCommit={apply} />
        </span>
      </div>
      {/* 连续滑条（非线性感知） */}
      <div className="flex items-center gap-2">
        <Slider
          value={[speed <= 0 ? 0 : speedToSlider(speed)]}
          min={0}
          max={1}
          step={0.002}
          onValueChange={(nv) => apply(sliderToSpeed(nv[0]))}
          aria-label="时间流速滑条"
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => apply(speed <= 0 ? 1 : 0)}
          aria-label={speed <= 0 ? '继续时间流逝' : '暂停时间流逝'}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[rgba(214,178,120,0.28)] bg-[rgba(19,16,9,0.45)] transition-transform active:scale-95"
        >
          {speed <= 0 ? <Play className="h-3 w-3 text-[#a7b97e]" aria-hidden /> : <Pause className="h-3 w-3 text-[#e6ba6c]" aria-hidden />}
        </button>
      </div>
      {/* 预设档 chips */}
      <div className="flex flex-wrap gap-1">
        {SPEED_PRESETS.map((v) => {
          const on = Math.abs(speed - v) < 0.005;
          return (
            <button
              key={v}
              type="button"
              onClick={() => apply(v)}
              aria-pressed={on}
              className={`h-6 min-w-[34px] rounded-full border px-1.5 font-mono text-[10px] font-bold transition-colors ${
                on
                  ? 'border-[#c8964a] bg-[rgba(217,163,90,0.2)] text-[#efc377]'
                  : 'border-[rgba(214,178,120,0.2)] bg-[rgba(50,42,31,0.5)] text-[#a2957c] hover:border-[rgba(214,178,120,0.4)] hover:text-[#f1e8d6]'
              }`}
            >
              {v === 0 ? <Pause className="h-3 w-3" aria-hidden /> : `${v}×`}
            </button>
          );
        })}
      </div>
      {/* 实际生效速率（引擎自适应保护降速时亮起；正常满速不占行） */}
      {throttled && (
        <div
          role="status"
          className="flex items-center gap-1.5 rounded-md border border-[rgba(221,143,94,0.4)] bg-[rgba(62,42,25,0.5)] px-2 py-1"
        >
          <ShieldAlert className="h-3 w-3 shrink-0 text-[#dd8f5e]" aria-hidden />
          <span className="text-[10px] font-bold tracking-wide text-[#dd8f5e]">引擎保护中</span>
          <span className="ml-auto font-mono text-[10px] font-bold tabular-nums text-[#e6ba6c]">
            实际 {fmtSpeed(eff)}
          </span>
        </div>
      )}
      <p className="flex items-center gap-1 text-[9px] leading-tight text-[#75694f]">
        <RotateCcw className="h-2.5 w-2.5 shrink-0" aria-hidden />
        高倍速受设备性能自适应限制；捏合岁月沙漏亦可无级连调
      </p>
    </div>
  );
}

/** 自带触发钮的封装（触发钮形态由 className 定制；open 受控可选） */
export function SpeedDial({
  triggerCls,
  triggerLabel,
  triggerContent,
  side = 'bottom',
  open,
  onOpenChange,
}: {
  triggerCls?: string;
  triggerLabel?: string;
  triggerContent?: React.ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel ?? '无极调速'}
          aria-expanded={isOpen}
          className={triggerCls}
          onClick={(e) => {
            e.stopPropagation();
            sfx.click();
            setOpen(!isOpen);
          }}
        >
          {triggerContent ?? <Gauge className="h-3.5 w-3.5" aria-hidden />}
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align="center" className="su-panel w-auto p-2">
        <SpeedDialContent onSet={() => {/* 值变化不关盘：连续微调 */}} />
      </PopoverContent>
    </Popover>
  );
}
