'use client';
// ============ 悬停信息芯片（Task 45-b） ============
// 鼠标悬停画布时旁侧 12px 的轻量信息条：单位（名字·种族·HP·王国）/ 地形（名称·坐标）。
// 数据由 GameCanvas 以 50ms 节流写入 store.hoverInfo（静止去抖防闪烁）；本组件纯展示。
import { useGameStore } from '@/store/gameStore';

export function HoverChip() {
  const hoverInfo = useGameStore((s) => s.hoverInfo);
  // 【75 门控】简洁模式不可能有悬停芯片（store 拦截写值 + 关闭时清空），防御性双保险
  const commandMode = useGameStore((s) => s.commandMode);
  if (!commandMode || !hoverInfo) return null;
  // 视口右/下缘自适应：芯片越界时翻转到左/上侧
  const flipX = hoverInfo.x > window.innerWidth - 190;
  const flipY = hoverInfo.y > window.innerHeight - 44;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-40 max-w-[180px] truncate rounded-sm border border-zinc-700/80 bg-zinc-950/85 px-1.5 py-0.5 font-mono text-[12px] leading-5 text-zinc-100 shadow-[0_2px_0_rgba(0,0,0,0.5)]"
      style={{
        left: flipX ? undefined : hoverInfo.x,
        right: flipX ? Math.max(4, window.innerWidth - hoverInfo.x + 12) : undefined,
        top: flipY ? undefined : hoverInfo.y,
        bottom: flipY ? Math.max(4, window.innerHeight - hoverInfo.y + 12) : undefined,
      }}
    >
      {hoverInfo.text}
    </div>
  );
}
