'use client';
// ============ 性能 HUD（Task 42-e）：左上角等宽字体小仪表，500ms 低频轮询引擎 perf 字段 ============
// 数据源：engine.perf { simMs, simUps, drawMs, fps }（42-a 的 EMA 仪表，挂引擎实例不走 zustand，
// 防高频更新引发重渲染风暴）+ engine.units.length（同 devStats 的 units 口径）。
import { useEffect, useState } from 'react';
import { getEngine, useGameStore } from '@/store/gameStore';
import { spriteCacheStats } from '@/lib/game/render';

/** 采样快照（轮询产物，非响应式） */
interface PerfSnap {
  fps: number;
  simMs: number;
  simUps: number;
  drawMs: number;
  units: number;
  sprcEntries: number;
  sprcHitRate: number;
}

const EMPTY: PerfSnap = { fps: 0, simMs: 0, simUps: 0, drawMs: 0, units: 0, sprcEntries: 0, sprcHitRate: 0 };

/** FPS 档位配色：>50 绿 / 30-50 黄 / <30 红 */
function fpsClass(fps: number): string {
  if (fps >= 50) return 'text-emerald-400';
  if (fps >= 30) return 'text-yellow-400';
  return 'text-red-400';
}

export function PerfHud() {
  const perfHud = useGameStore((s) => s.perfHud);
  const [snap, setSnap] = useState<PerfSnap>(EMPTY);

  // 500ms 低频轮询：绝不逐帧 setState（engine.perf 本身就是 EMA，低频读数足够平滑）
  useEffect(() => {
    if (!perfHud) return;
    const poll = () => {
      const eng = getEngine();
      const p = eng.perf;
      const sprcTotal = spriteCacheStats.hits + spriteCacheStats.misses;
      setSnap({
        fps: p.fps, simMs: p.simMs, simUps: p.simUps, drawMs: p.drawMs, units: eng.units.length,
        sprcEntries: spriteCacheStats.entries,
        sprcHitRate: sprcTotal > 0 ? spriteCacheStats.hits / sprcTotal : 0, // #93 精灵缓存命中率（稳定后应 >95%）
      });
    };
    poll(); // 打开立即出数，不等首个 500ms
    const timer = window.setInterval(poll, 500);
    return () => window.clearInterval(timer);
  }, [perfHud]);

  if (!perfHud) return null;

  return (
    <div
      aria-label="性能仪表"
      className="pointer-events-none absolute left-2 top-[200px] z-[5] select-none rounded-sm border-2 border-zinc-700/90 bg-zinc-950/85 px-2 py-1.5 font-mono text-[10px] leading-[1.5] text-zinc-300 shadow-[0_3px_0_rgba(0,0,0,0.6)] sm:left-auto sm:right-2 sm:top-[60px]"
    >
      <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">PERF</p>
      <p>
        FPS <span className={`font-bold ${fpsClass(snap.fps)}`}>{snap.fps.toFixed(0)}</span>
      </p>
      <p>
        SIM <span className="font-bold text-zinc-100">{snap.simMs.toFixed(2)}</span> ms
      </p>
      <p>
        UPS <span className="font-bold text-zinc-100">{snap.simUps.toFixed(0)}</span>/s
      </p>
      <p>
        DRAW <span className="font-bold text-zinc-100">{snap.drawMs.toFixed(2)}</span> ms
      </p>
      <p>
        UNITS <span className="font-bold text-zinc-100">{snap.units}</span>
      </p>
      <p>
        SPRC <span className="font-bold text-zinc-100">{snap.sprcEntries}</span> ·{' '}
        <span className={`font-bold ${snap.sprcHitRate >= 0.95 ? 'text-emerald-400' : 'text-yellow-400'}`}>
          {(snap.sprcHitRate * 100).toFixed(0)}%
        </span>
      </p>
    </div>
  );
}
