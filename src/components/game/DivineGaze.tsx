'use client';
// ============ 造物主凝视（Task 70 神谕圣装）：触摸透视气泡 ============
// 两个移动端专属的轻量信息气泡，替代传统固定信息面板：
//   · GazeBubble 神之视界 —— 长按空地浮现的地形/领土/火情一瞥（松手消散，纯展示）
//   · UnitBubble 生灵气泡 —— 触屏点选生灵的头顶气泡（名字/血量/文明情绪 + 详情入口），
//     rAF 跟随单位移动，250ms 节流刷新数据快照（位置每帧、数据低频，双频更新防重渲染风暴）
import { useEffect, useRef, useState } from 'react';
import { getEngine, useGameStore } from '@/store/gameStore';
import { RACES } from '@/lib/game/types';
import type { Unit } from '@/lib/game/types';
import { Swords, Biohazard, Hourglass, Heart, X, ScanSearch } from 'lucide-react';

/** 神之视界：长按空地的透视气泡（手指上方浮现，松手由 GameCanvas 清空） */
export function GazeBubble() {
  const gaze = useGameStore((s) => s.gaze);
  if (!gaze) return null;
  // 视口钳制：气泡宽最多 280px，靠近左右缘时收进可视区（箭头仍大致指向手指）
  const clampX = Math.min(Math.max(gaze.x, 148), Math.max(160, window.innerWidth - 148));
  return (
    <div
      className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full"
      style={{ left: clampX, top: gaze.y - 12 }}
      aria-hidden
    >
      <div
        className="su-gaze su-gaze-pop max-w-[280px] px-3 py-2 text-[11px] font-semibold leading-relaxed text-[#e6d9bd]"
        role="status"
        aria-label="神之视界"
      >
        {gaze.text}
      </div>
    </div>
  );
}

/** 生灵情绪派生（神之一瞥）：交战中 > 瘟疫 > 迟暮 > 安好 */
function moodOf(u: Unit): { icon: typeof Swords; label: string; cls: string } {
  if (u.hurt > 0) return { icon: Swords, label: '交战中', cls: 'text-[#d97e55]' };
  if (u.infected) return { icon: Biohazard, label: '染疫', cls: 'text-[#a7b97e]' };
  if (u.age > u.maxAge * 0.8) return { icon: Hourglass, label: '迟暮', cls: 'text-[#c9bda2]' };
  return { icon: Heart, label: '安好', cls: 'text-[#a7b97e]' };
}

/** 生灵气泡数据快照（rAF 回调内低频采集；不含位置 —— 位置走 ref 每帧更新）
 *  uid 跟随气泡指向的单位：id 切换后旧快照立即失效（渲染侧校验），首帧 rAF 即补上新数据 */
interface Snap {
  uid: number;
  name: string;
  raceName: string;
  civColor: string | null;
  civName: string | null;
  hp: number;
  maxHp: number;
  mood: { icon: typeof Swords; label: string; cls: string };
}

/** 生灵气泡：触屏点选生灵的头顶轻气泡（跟随移动 + HP 条 + 情绪 + 详情入口） */
export function UnitBubble() {
  const id = useGameStore((s) => s.unitBubble);
  const setUnitBubble = useGameStore((s) => s.setUnitBubble);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Snap | null>(null);

  useEffect(() => {
    if (id == null) return;
    const engine = getEngine();
    let raf = 0;
    let lastData = 0;
    // 位置每帧直改 DOM（绕过 React 重渲染）；数据 250ms 节流 setState（首帧立即采集：lastData 初始 0）
    const tick = (t: number) => {
      const u = engine.unitById.get(id);
      // 单位消亡/被清扫 → 气泡自动收起
      if (!u || u.dead) {
        useGameStore.getState().setUnitBubble(null);
        return;
      }
      const el = wrapRef.current;
      if (el) {
        // 世界 → 屏幕（与 render 同源的相机变换：视口中心 + zoom；画布全屏 ≈ 窗口尺寸）
        const cw = window.innerWidth;
        const ch = window.innerHeight;
        const zoom = engine.cam.zoom;
        const wx = u.rx ?? u.x;
        const wy = u.ry ?? u.y;
        el.style.left = `${(wx - engine.cam.x) * zoom + cw / 2}px`;
        el.style.top = `${(wy - engine.cam.y) * zoom + ch / 2 - 14}px`;
      }
      if (t - lastData > 250) {
        lastData = t;
        const race = RACES[u.race];
        const civ = u.civ >= 0 ? engine.civs[u.civ] : null;
        setSnap({
          uid: id,
          name: u.name,
          raceName: race?.name ?? '?',
          civColor: civ?.alive ? civ.colorHex : null,
          civName: civ?.alive ? civ.name : null,
          hp: u.hp,
          maxHp: u.maxHp,
          mood: moodOf(u),
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  if (id == null || !snap || snap.uid !== id) return null;
  const MoodIcon = snap.mood.icon;
  const hpPct = Math.max(0, Math.min(100, (snap.hp / snap.maxHp) * 100));
  return (
    <div
      ref={wrapRef}
      className="pointer-events-none absolute z-40 -translate-x-1/2 -translate-y-full sm:hidden"
      role="status"
      aria-label="生灵气泡"
    >
      <div className="su-gaze su-gaze-pop pointer-events-auto w-[190px] px-3 py-2">
        {/* 名字 + 文明色点 */}
        <div className="flex items-center gap-1.5">
          {snap.civColor && (
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] border border-black/40" style={{ backgroundColor: snap.civColor }} aria-hidden />
          )}
          <span className="truncate text-[12px] font-bold text-[#f1e8d6]">{snap.name}</span>
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[#8f836a]">{snap.raceName}</span>
          <button
            type="button"
            onClick={() => setUnitBubble(null)}
            aria-label="关闭生灵气泡"
            className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#75694f] transition-colors hover:bg-[rgba(62,53,39,0.7)] hover:text-[#f1e8d6]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        {/* 王国名 */}
        {snap.civName && <div className="mt-0.5 truncate text-[10px] font-semibold text-[#a2957c]">{snap.civName}</div>}
        {/* HP 条 */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-black/50">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{ width: `${hpPct}%`, background: hpPct > 55 ? 'linear-gradient(90deg,#c96a4a,#a7b97e)' : hpPct > 25 ? '#d9a35a' : '#d97e55' }}
            />
          </div>
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-[#8f836a]">
            {Math.ceil(snap.hp)}/{Math.round(snap.maxHp)}
          </span>
        </div>
        {/* 情绪 + 详情入口 */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1 text-[10px] font-bold ${snap.mood.cls}`}>
            <MoodIcon className="h-3 w-3" aria-hidden />
            {snap.mood.label}
          </span>
          <button
            type="button"
            onClick={() => {
              // 详情 = 打开检查器（复用既有信息架构，气泡只做轻量预览）
              useGameStore.getState().select(id, null);
              setUnitBubble(null);
            }}
            aria-label="查看生灵详情"
            className="flex h-7 items-center gap-1 rounded-md border border-[rgba(214,178,120,0.28)] bg-[rgba(50,42,31,0.6)] px-2 text-[10px] font-bold text-[#e6ba6c] transition-colors hover:border-[rgba(214,178,120,0.5)] hover:text-[#f0dcae]"
          >
            <ScanSearch className="h-3 w-3" aria-hidden />
            详情
          </button>
        </div>
      </div>
    </div>
  );
}
