'use client';
// ============ 胶片带拖拽滚动 hook（Task 60） ============
// 顶部工具栏 / 底部物品栏共用交互协议（顶栏与物品栏「一样」的横滚手感）：
//  · 鼠标/笔：按住即拖动横滚；位移 <4px 视为点击不接管；拖动结束后 200ms 内的 click
//    在捕获阶段吞掉（防松手瞬间误触胶片带上的按钮）
//  · 触摸：不接管（overflow 容器原生惯性滚动更顺滑）
//  · 滚轮：deltaY 原地转横滚（悬停胶片带即可横滚，免 Shift）；deltaX 占优（触控板横扫）走原生
//  · 边缘状态：返回 canLeft / canRight（仅翻转时 setState，拖动全程至多 2 次重渲染）
//    供外层渲染「边缘渐隐」提示两侧还有内容
// API 注：ref 由调用方 useRef 传入（而非 hook 内建返回）——避免返回值携带 ref 触发
// React Compiler「渲染期访问 ref」红线；顶栏的 rightColRef 借此一行两用（hudRight 度量 + 拖拽）。
// 62-c 滚动位置记忆：传入 memoryKey 后，横向位置存入会话级 Map（刷新重置、零 I/O）；
// key 随内容切换（如 tab+分类）变化时 effect 重跑 → 自动恢复该 key 上次的位置（clamp 到新内容宽度）。
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

export interface DragScrollEdges {
  canLeft: boolean;
  canRight: boolean;
}

/** 会话级胶片带滚动位置记忆（key → scrollLeft）；切 Tab/分类回来不回最左 */
const scrollMemory = new Map<string, number>();

/** 拖拽阈值（px）：小于该位移视为点击而非拖动 */
const DRAG_THRESHOLD = 4;
/** 拖动结束后吞 click 的时间窗（ms）：浏览器在 pointerup 后即刻派发 click，远小于该值 */
const SUPPRESS_CLICK_MS = 200;

export function useDragScroll<T extends HTMLElement>(ref: RefObject<T | null>, memoryKey?: string): DragScrollEdges {
  const [edges, setEdges] = useState<DragScrollEdges>({ canLeft: false, canRight: false });
  const drag = useRef({ down: false, moved: false, startX: 0, startScroll: 0, pointerId: -1 });
  const suppressClickUntil = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 62-c：恢复上次位置（内容切换后 effect 重跑时；clamp 到新内容 scrollWidth）
    if (memoryKey !== undefined) {
      const saved = scrollMemory.get(memoryKey) ?? 0;
      if (saved > 0.5) el.scrollLeft = saved;
    }
    // 边缘状态等值守护：canLeft/canRight 均未翻转时返回原对象，React 直接跳过重渲染
    const updateEdges = () => {
      const nl = el.scrollLeft > 0.5;
      const nr = el.scrollLeft + el.clientWidth < el.scrollWidth - 0.5;
      setEdges((prev) => (prev.canLeft === nl && prev.canRight === nr ? prev : { canLeft: nl, canRight: nr }));
    };
    updateEdges();
    // 滚动位置记账（与 updateEdges 同一事件源，两个 passive 监听器互不影响）
    const saveScroll = () => {
      if (memoryKey !== undefined) scrollMemory.set(memoryKey, el.scrollLeft);
    };
    // 内容增删（切 Tab 换工具列表）不改盒尺寸，RO 抓不到 scrollWidth 变化——指针进入/按下时补测
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    el.addEventListener('scroll', updateEdges, { passive: true });
    el.addEventListener('scroll', saveScroll, { passive: true });
    el.addEventListener('pointerenter', updateEdges);

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0) return; // 触摸走原生惯性滚动
      updateEdges();
      drag.current = { down: true, moved: false, startX: e.clientX, startScroll: el.scrollLeft, pointerId: e.pointerId };
    };
    const onPointerMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.down || e.pointerId !== d.pointerId) return;
      if (e.buttons === 0) {
        // 指针已在窗外/元素外松开（pointerup 丢失）——解除粘滞拖拽
        d.down = false;
        return;
      }
      const dx = e.clientX - d.startX;
      if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
      d.moved = true;
      el.scrollLeft = d.startScroll - dx;
    };
    const onPointerUp = () => {
      if (drag.current.moved) suppressClickUntil.current = performance.now() + SUPPRESS_CLICK_MS;
      drag.current.down = false;
      drag.current.moved = false;
    };
    // 捕获阶段拦截误触 click（拖动刚结束的松手 click 会落在胶片带的按钮上）
    const onClickCapture = (e: MouseEvent) => {
      if (performance.now() < suppressClickUntil.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    // 滚轮纵转横：悬停胶片带即可横滚；无横向余量或触控板横扫（deltaX 占优）时不拦截
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth - el.clientWidth <= 0.5) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('click', onClickCapture, true);
    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      saveScroll(); // 卸载/换 key 前把当前位置落账（内容切换正是靠这里保存旧 Tab 位置）
      ro.disconnect();
      el.removeEventListener('scroll', updateEdges);
      el.removeEventListener('scroll', saveScroll);
      el.removeEventListener('pointerenter', updateEdges);
      el.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('click', onClickCapture, true);
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref, memoryKey]);

  return edges;
}
