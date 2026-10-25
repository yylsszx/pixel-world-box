'use client';
// ============ HScroll：单行横向滚动容器 ============
// Task 67「上下工具条变成可滑动的一行」基础设施：
// - 桌面：竖直滚轮位移转横向滚动（仅当容器确实可横滚时接管，并 preventDefault 防止
//   画布缩放/页面滚动被连带触发——native 监听非 passive，规避 React 合成事件 passive 限制）
// - 触屏：浏览器原生横向滑动
// - 细横滚动条样式由 game-scroll-x 提供
import { useEffect, useRef } from 'react';

export function HScroll({
  className,
  children,
  role,
  ariaLabel,
}: {
  className?: string;
  children: React.ReactNode;
  role?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return; // 无横向余量时不接管（滚轮穿透给画布缩放）
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const before = el.scrollLeft;
        el.scrollLeft = before + e.deltaY;
        if (el.scrollLeft !== before) e.preventDefault();
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div ref={ref} className={className} role={role} aria-label={ariaLabel}>
      {children}
    </div>
  );
}
