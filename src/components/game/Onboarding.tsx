'use client';
// ============ 42-c 新手引导（首跑七步，Task 69-b 增触屏手势一步） ============
// 底部居中的引导卡（非全屏遮罩，保留上方画面可见）：一位老练神谕向新神解说基本仪轨。
// 条件渲染于 GameShell：boot==='game' && !onboardingDone。
import { useState } from 'react';
import { ChevronLeft, Clock, Grip, Hand, LayoutGrid, Pointer, Save, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/store/gameStore';
import { sfx } from '@/lib/game/sfx';

interface OnboardStep {
  icon: LucideIcon;
  title: string;
  lines: string[];
}

const STEPS: OnboardStep[] = [
  {
    icon: Hand,
    title: '你是这个世界的造物主',
    lines: [
      '欢迎，新神。这座像素沙盒里没有目标，也没有胜负——',
      '放生灵、降天灾、看文明在兴衰间轮回。',
      '世界会记住你做的每一件事。',
    ],
  },
  {
    icon: Grip,
    title: '屏幕底部是神之手',
    lines: [
      '底部的工具栏能放置生物、改造地形、投掷道具。',
      '试试选中「羊」，再到草地点上几下——',
      '生命会自己找到出路。',
    ],
  },
  {
    icon: Pointer,
    title: '指尖也是神力',
    lines: [
      '双指捏合缩放、双指拖动平移、双击就地放大；',
      '想要长按凝视、框选编组？点右侧「指挥模式」开关开启。',
      '底部神之印记可唤出图腾手势盘，右上水晶球藏着全部面板。',
    ],
  },
  {
    icon: Wand2,
    title: '顶栏的闪电与火焰',
    lines: [
      '天灾菜单里藏着陨石、火山与黑洞。',
      '建议先在小范围试验……',
      '你会在纪事里读到后果。',
    ],
  },
  {
    icon: LayoutGrid,
    title: '每扇窗都在神界之眼里',
    lines: [
      '王国、生态、进化、社会、神经、成就——',
      '每个面板都是观察这个世界的数据之窗。',
      '想偷看文明的底牌？尽管打开。',
    ],
  },
  {
    icon: Clock,
    title: '左上角的时间控制',
    lines: [
      '暂停、1x、2x、8x。',
      '嫌千年太慢？加速它，',
      '看文明在你眼前翻页。',
    ],
  },
  {
    icon: Save,
    title: '随时保存你的世界',
    lines: [
      '3 个手动槽位 + 自动存档，全部留在这个浏览器里。',
      '去创造吧——',
      '这个世界已经是你的了。',
    ],
  },
];

export function Onboarding() {
  const finishOnboarding = useGameStore((s) => s.finishOnboarding);
  const [step, setStep] = useState(0);
  const cur = STEPS[step];
  const last = step === STEPS.length - 1;
  const Icon = cur.icon;

  const go = (next: number) => {
    sfx.click();
    setStep(next);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-40" aria-label="新手引导">
      {/* 本组件作用域 keyframes：卡片入场（淡入上移）。Task 72-b 修复：水平居中改由基础类 -translate-x-1/2（translate 属性）承担，
          keyframes 只动画 translateY —— 原版动画结束后（fill-mode none）transform 归零，left-1/2 失去 -50% 偏移，
          卡片左缘贴在屏幕中线，窄屏直接半张溢出视口。translate 属性与 transform 动画可叠加，入场期间仍是「居中+上浮」。 */}
      <style>{`@keyframes wbObRise { from { opacity: 0; transform: translate(0, 14px); } to { opacity: 1; transform: translate(0, 0); } }`}</style>

      <div
        key={step}
        role="dialog"
        aria-label={`新手引导 第 ${step + 1} 步：${cur.title}`}
        className="pointer-events-auto absolute bottom-[8.75rem] left-1/2 flex w-[min(92vw,420px)] -translate-x-1/2 animate-[wbObRise_0.35s_ease-out] flex-col gap-2.5 rounded-sm border-2 border-amber-500/40 bg-zinc-900/95 p-3.5 shadow-[0_6px_0_rgba(0,0,0,0.6)] backdrop-blur-sm sm:bottom-32"
      >
        {/* 头部：图标 + 标题 + 步数 */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-amber-400/70 bg-amber-400/10">
            <Icon className="h-5 w-5 text-amber-300" aria-hidden />
          </span>
          <h2 className="flex-1 text-sm font-black text-amber-200">{cur.title}</h2>
          <span className="font-mono text-[10px] text-zinc-500">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        {/* 正文 */}
        <p className="flex flex-col gap-0.5 text-xs leading-relaxed text-zinc-300">
          {cur.lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </p>

        {/* 进度点 */}
        <div className="flex items-center justify-center gap-1.5" aria-hidden>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 ${i === step ? 'bg-amber-400' : i < step ? 'bg-amber-400/40' : 'bg-zinc-700'}`}
            />
          ))}
        </div>

        {/* 底部按钮行 */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              sfx.click();
              finishOnboarding();
            }}
            className="h-11 rounded-none border-2 border-zinc-700 px-3 text-xs font-bold text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
          >
            跳过教程
          </Button>
          <Button
            variant="ghost"
            onClick={() => go(step - 1)}
            disabled={step === 0}
            aria-label="上一步"
            className="h-11 w-11 rounded-none border-2 border-zinc-700 p-0 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            onClick={() => (last ? (sfx.click(), finishOnboarding()) : go(step + 1))}
            className="h-11 flex-1 rounded-none border-2 border-amber-300 bg-amber-400 text-sm font-black text-zinc-950 shadow-[3px_3px_0_rgba(0,0,0,0.5)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:bg-amber-300 hover:shadow-[2px_2px_0_rgba(0,0,0,0.5)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
          >
            {last ? '开始创造' : '下一步'}
          </Button>
        </div>
      </div>
    </div>
  );
}
