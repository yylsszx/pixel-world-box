'use client';
// ============ 指挥模式总开关（Task 75） ============
// 右缘垂直居中的浮动胶囊开关：默认关闭 = 简洁模式（只保留 拖动平移 / 滚轮·双指缩放 /
// 工具施放 / 点选检查器 等基础操作，页面不再被误触的框选/菜单/芯片搞得乱七八糟）；
// 点击开启后解锁交互 2.0 全家（Shift·触屏框选 / 右键·长按菜单 / 长按凝视 / 悬停芯片 /
// 命令面板 / 镜头书签），关闭时由 store 统一清扫全部交互浮层与挂起态。
// 快捷键 X（GameCanvas onKeyDown）；施法期间随 HUD 淡出（su-cast-hide/show）。
import { useGameStore } from '@/store/gameStore';
import { SquareDashed } from 'lucide-react';

export function CommandModeButton() {
  const commandMode = useGameStore((s) => s.commandMode);
  const toggleCommandMode = useGameStore((s) => s.toggleCommandMode);
  const casting = useGameStore((s) => s.casting);
  return (
    <button
      type="button"
      onClick={toggleCommandMode}
      aria-pressed={commandMode}
      aria-label={
        commandMode
          ? '指挥模式已开启，点击关闭回到简洁模式（快捷键 X）'
          : '指挥模式已关闭，点击开启以解锁框选、右键菜单、命令面板等复杂操作（快捷键 X）'
      }
      title={
        commandMode
          ? '指挥模式已开启 · 点击关闭回到简洁模式（X）'
          : '指挥模式已关闭 · 点击解锁框选 / 右键菜单 / 长按凝视 / 命令面板（X）'
      }
      className={`pointer-events-auto absolute right-2 top-1/2 z-30 flex h-28 w-12 -translate-y-1/2 flex-col items-center justify-center gap-1.5 border-2 shadow-[0_3px_0_rgba(0,0,0,0.6)] transition-colors ${
        casting ? 'su-cast-hide' : 'su-cast-show'
      } ${
        commandMode
          ? 'border-amber-400 bg-amber-400/20 text-amber-200 shadow-[0_3px_0_rgba(0,0,0,0.6),0_0_14px_rgba(239,195,119,0.35)]'
          : 'border-zinc-700/90 bg-zinc-900/95 text-zinc-400 hover:border-amber-500/60 hover:text-amber-200'
      }`}
    >
      <SquareDashed className="h-5 w-5 shrink-0" aria-hidden />
      <span
        className="text-[10px] font-bold tracking-[0.25em]"
        style={{ writingMode: 'vertical-rl' }}
      >
        {commandMode ? '指挥模式' : '简洁模式'}
      </span>
      <kbd
        aria-hidden
        className="hidden shrink-0 rounded-sm border border-zinc-600 bg-zinc-800 px-1 font-mono text-[9px] leading-4 text-zinc-400 sm:block"
      >
        X
      </kbd>
    </button>
  );
}
