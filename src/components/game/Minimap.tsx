'use client';
// ============ Minimap: terrain overview + viewport + click-to-jump ============
// Task 66 原版几何：贴左下角（left-4 + bottom-2），统计柱（WorldHud）叠在本图上方
// 组成竖列：小地图（下，贴底）+ WorldHud（上， bottom-[130px]）+ 隙 10px
import { useEffect, useRef } from 'react';
import { renderMinimap } from '@/lib/game/render';
import { getEngine, useGameStore } from '@/store/gameStore';

const MW = 160;
const MH = 100;

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const showMinimap = useGameStore((s) => s.showMinimap);

  useEffect(() => {
    if (!showMinimap) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const engine = getEngine();
    let timer = 0;
    const draw = () => {
      const wrap = wrapRef.current;
      const w = wrap?.clientWidth ?? MW;
      const h = wrap?.clientHeight ?? MH;
      renderMinimap(engine, ctx, w, h, { w, h });
    };
    draw();
    timer = window.setInterval(draw, 400);
    return () => window.clearInterval(timer);
  }, [showMinimap]);

  if (!showMinimap) return null;

  const jump = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const engine = getEngine();
    engine.cam.x = ((e.clientX - rect.left) / rect.width) * 256;
    engine.cam.y = ((e.clientY - rect.top) / rect.height) * 160;
    engine.followId = null;
  };

  return (
    <div
      ref={wrapRef}
      className="pointer-events-auto absolute bottom-2 left-4 z-10 hidden rounded-sm border-2 border-zinc-700/90 bg-zinc-900/95 p-1 shadow-[0_3px_0_rgba(0,0,0,0.6)] sm:block"
      style={{ width: MW + 12, height: MH + 12 }}
    >
      <canvas
        ref={ref}
        width={MW}
        height={MH}
        onMouseDown={jump}
        className="h-full w-full cursor-pointer"
        style={{ imageRendering: 'pixelated' }}
        aria-label="小地图，点击跳转视野"
      />
    </div>
  );
}
