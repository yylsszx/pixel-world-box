'use client';
// ============ TimeCapsule（Task 70 移动端沉浸式神明 UI）：岁月沙漏 ============
// 移动端顶部只留这一粒居中半透明胶囊（灵动岛范式），指挥权全部收拢：
//   · 内容：沙漏 + 纪元年份 + 播放/暂停圆钮（+ ≠1× 时的倍速微标签，可点开无极调速盘）
//   · 双指捏合胶囊 = 无极连调时间流速（速度随指距连续缩放 0.1–20；彻底捏拢归 0 暂停，
//     暂停时张开从 1× 起步；流光数字节流闪现）
//   · 长按胶囊（450ms）= 呼出无极调速盘（打数字 / 滑条 / 预设档）
//   · 世界大事件（war/danger/good 级）→ 胶囊泛红呼吸 + 微震，内容临时替换为事件行，
//     点击飞往纪事面板看详情（store.pulse，4.2s 自动消散）
//   · 施法期间整体淡出只留画布（su-cast-hide）；大事件优先于施法隐身（剧变必须被看见）
// 为什么不用 su-gaze-in 浮现动画：根容器靠 left-1/2 + -translate-x-1/2 居中，
//   su-gaze-in 自带 translate(-50%) 会与定位 transform 打架，故不挂浮现动画。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Hourglass, Pause, Play, Swords, Flame, Sparkles, Gauge } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { SpeedDialContent, fmtSpeed } from './SpeedDial';
import type { ToastMsg } from '@/lib/game/types';

/** 无极调速范围（与 SpeedDial 同源；彻底捏拢低于 0.1 归 0=暂停，暂停中张开从 1× 起步） */
const SPEED_FLOOR = 0.1;
const SPEED_CEIL = 20;
/** 流光数字重闪间隔（ms）：连调时每 150ms 刷新一次读数，避免每 move 事件 setState 风暴 */
const FLARE_THROTTLE = 150;
/** 长按呼出调速盘阈值（ms）与位移容差（px） */
const DIAL_PRESS_MS = 450;
const DIAL_MOVE_TOL = 10;

/** 大事件 tone → 图标与暖色（peace/info 为类型完备兜底；pushPulse 已滤 info） */
const PULSE_META: Record<ToastMsg['tone'], { Icon: LucideIcon; cls: string }> = {
  war: { Icon: Swords, cls: 'text-[#d97e55]' },
  danger: { Icon: Flame, cls: 'text-[#dd8f5e]' },
  good: { Icon: Sparkles, cls: 'text-[#a7b97e]' },
  peace: { Icon: Sparkles, cls: 'text-[#a7b97e]' },
  info: { Icon: Sparkles, cls: 'text-[#a7b97e]' },
};

export function TimeCapsule() {
  const stats = useGameStore((s) => s.stats);
  const speed = useGameStore((s) => s.speed);
  const pulse = useGameStore((s) => s.pulse);
  const casting = useGameStore((s) => s.casting);

  // 胶囊本尊的 DOM 引用：捏合监听与微震重播共用（提前声明保持声明序在 effect 之前）
  const capRef = useRef<HTMLDivElement>(null);

  // —— 流光数字：换挡瞬间在胶囊上方闪现大号金色档位（key 变化触发 su-flare 重播） ——
  const [flare, setFlare] = useState<{ id: number; text: string } | null>(null);
  const flareSeq = useRef(0);
  const flareTimer = useRef<number | null>(null);
  const showFlare = useCallback((text: string) => {
    const id = ++flareSeq.current;
    setFlare({ id, text });
    if (flareTimer.current != null) window.clearTimeout(flareTimer.current);
    // 800ms 后清空：su-flare 动画 0.9s 上浮渐隐，稍早回收避免尾帧残影
    flareTimer.current = window.setTimeout(() => setFlare((f) => (f?.id === id ? null : f)), 800);
  }, []);
  useEffect(
    () => () => {
      if (flareTimer.current != null) window.clearTimeout(flareTimer.current);
    },
    [],
  );

  // —— 大事件微震：pulse.id 变化瞬间「摘类 → 强制 reflow → 挂回」让 su-shake 从头重播 ——
  // 为什么命令式操作 classList 而不用 setState：effect 里同步 setState 会触发级联渲染
  //   （react-hooks/set-state-in-effect 红线），纯 DOM 类切换零重渲染、ref 稳定不重挂监听。
  const pulseId = pulse?.id ?? null;
  useEffect(() => {
    const el = capRef.current;
    if (!el) return;
    el.classList.remove('su-shake');
    if (pulseId == null) return; // 事件消散：顺手满扫残留类（动画早已自然结束）
    void el.offsetWidth; // 强制 reflow：确保重新挂类时 CSS 动画从第 0 帧重播
    el.classList.add('su-shake');
  }, [pulseId]);

  // —— 双指捏合无极调速：原生非 passive 监听 ——
  // 为什么不用 React onTouchMove：React 在根节点把 touchmove 注册成 passive 监听，
  //   合成事件里 preventDefault 会静默失效（HScroll 已踩过同款 wheel 坑）；
  //   拦截浏览器捏合缩放必须真正 preventDefault，所以挂原生 { passive: false }。
  //   内联 touchAction:'none' 是 CSS 层保险，双保险确保手势完全归本组件所有。
  // 无极连调：base = 上一 move 的指距，speed ← speed × (d/base) 指数跟踪指距——
  //   手指张多快速度就升多快，无档位概念；流光数字 150ms 节流刷新。
  useEffect(() => {
    const el = capRef.current;
    if (!el) return;
    let base: number | null = null;
    let lastFlare = 0;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const applySpeed = (v: number) => {
      const st = useGameStore.getState();
      st.setSpeed(v);
      const now = performance.now();
      if (now - lastFlare >= FLARE_THROTTLE) {
        lastFlare = now;
        showFlare(fmtSpeed(v));
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2) {
        base = null; // 手指数变了 → 基线作废，等下一次标准双指重建
        return;
      }
      e.preventDefault();
      const d = dist(e.touches);
      if (base == null || d <= 0) {
        base = d;
        return;
      }
      const ratio = d / base;
      if (Math.abs(ratio - 1) < 0.012) return; // 死区：指距微频抖不累积
      const st = useGameStore.getState();
      if (st.speed <= 0) {
        // 暂停中张开 → 从 1× 起步（0 × 任何数仍是 0，需特判）；捏拢保持暂停
        if (ratio > 1.06) applySpeed(1);
      } else {
        let next = st.speed * ratio;
        if (next < SPEED_FLOOR) next = ratio < 0.97 ? 0 : SPEED_FLOOR; // 彻底捏拢 → 暂停
        applySpeed(Math.min(SPEED_CEIL, Math.round(next * 100) / 100));
      }
      base = d;
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) base = null;
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [showFlare]);

  const pulseMeta = pulse ? PULSE_META[pulse.tone] : null;
  // 施法隐身：大事件优先于施法隐身（世界剧变必须被看见）。
  // 为什么挂在胶囊元素而不是根容器上：pointer-events:none 无法压制子元素显式声明的
  //   pointer-events:auto，隐身时胶囊会「看不见但点得到」；胶囊本尊持有 auto，直接挂它才真隐。
  const castCls = casting && !pulse ? 'su-cast-hide' : 'su-cast-show';

  // —— 长按胶囊 450ms（位移 <10px）→ 呼出无极调速盘；轻点仍是暂停（time-gap 兜底双保险） ——
  const [dialOpen, setDialOpen] = useState(false);
  const pressT = useRef<number | null>(null);
  const pressXY = useRef({ x: 0, y: 0 });
  const longFired = useRef(false);
  const clearDialPress = () => {
    if (pressT.current != null) {
      window.clearTimeout(pressT.current);
      pressT.current = null;
    }
  };
  useEffect(() => () => clearDialPress(), []);

  return (
    <div className="pointer-events-none absolute left-1/2 top-2 z-30 -translate-x-1/2 sm:hidden">
      {/* relative 壳：流光数字/调速盘的定位锚（独立于胶囊，避免微震时跟着抖） */}
      <div className="relative">
        {flare && (
          <span
            key={flare.id}
            className="su-flare absolute -top-9 left-1/2 text-2xl font-black text-[#efc377] drop-shadow-[0_0_10px_rgba(239,195,119,0.6)]"
          >
            {flare.text}
          </span>
        )}
        {dialOpen && (
          <>
            {/* 点击胶囊外任意处收起调速盘（贴在 pointer-events-none 根上的全屏捕层） */}
            <button
              type="button"
              aria-label="收起调速盘"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setDialOpen(false)}
            />
            <div className="su-panel su-gaze-in absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2" style={{ borderRadius: 14 }}>
              <SpeedDialContent onSet={() => {/* 连调不关盘 */}} />
            </div>
          </>
        )}
        <div
          ref={capRef}
          role="status"
          aria-label="岁月沙漏：纪元与时间流速（轻点暂停 / 长按无极调速 / 双指捏合连调）"
          style={{ touchAction: 'none', borderRadius: 9999 }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (!t || dialOpen) return;
            longFired.current = false;
            pressXY.current = { x: t.clientX, y: t.clientY };
            clearDialPress();
            pressT.current = window.setTimeout(() => {
              pressT.current = null;
              longFired.current = true;
              if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
                try {
                  navigator.vibrate(18);
                } catch {
                  /* 忽略不支持 */
                }
              }
              setDialOpen(true);
            }, DIAL_PRESS_MS);
          }}
          onTouchMove={(e) => {
            const t = e.touches[0];
            if (!t) return;
            // 位移超容差 → 这是滑动/捏合意图，取消长按（不与调速手势打架）
            if (Math.hypot(t.clientX - pressXY.current.x, t.clientY - pressXY.current.y) > DIAL_MOVE_TOL) clearDialPress();
          }}
          onTouchEnd={() => {
            clearDialPress();
            // 长按刚开过盘 → 吞掉本次 click（否则浏览器补发的点击会把刚开的盘当暂停开关触发后又被外层误关）
            window.setTimeout(() => {
              longFired.current = false;
            }, 120);
          }}
          onClick={() => {
            if (longFired.current || dialOpen) return;
            // 大事件态：整枚胶囊是「飞往纪事」的入口；平时：整枚胶囊都是暂停开关（触控目标最大化）
            const st = useGameStore.getState();
            if (pulse) st.toggleChronicle();
            else st.togglePause();
          }}
          className={`su-glass pointer-events-auto flex h-11 items-center gap-2.5 px-4 ${castCls} ${pulse ? 'su-pulse-red' : ''}`}
        >
          {pulse && pulseMeta ? (
            /* —— 大事件行：tone 图标 + 截断文案，替代常规内容（灵动岛扩张） —— */
            <>
              <pulseMeta.Icon className={`h-4 w-4 shrink-0 ${pulseMeta.cls}`} aria-hidden />
              <span className="max-w-[180px] truncate text-[11px] font-bold text-[#f1e8d6]">{pulse.text}</span>
            </>
          ) : (
            /* —— 常规行：沙漏 + 纪元 + 倍速徽标（≠1× 时显示，点击开无极调速盘）+ 播放/暂停圆钮 —— */
            <>
              <Hourglass className="h-4 w-4 shrink-0 text-[#e6ba6c]" aria-hidden />
              <span className="flex items-baseline gap-1 text-[11px] font-bold tracking-wider text-[#f1e8d6]">
                纪元
                <span className="font-mono text-[13px] font-bold tabular-nums">{stats ? stats.year : '—'}</span>
                年
              </span>
              {speed !== 1 && (
                <button
                  type="button"
                  aria-label={`当前流速 ${fmtSpeed(speed)}，点按打开无极调速`}
                  onClick={(e) => {
                    e.stopPropagation(); // 不触发胶囊整体的暂停开关
                    setDialOpen((v) => !v);
                  }}
                  className="flex items-center gap-0.5 rounded-full bg-[rgba(217,163,90,0.16)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#efc377] transition-transform active:scale-95"
                >
                  {fmtSpeed(speed)}
                  <Gauge className="h-2.5 w-2.5 opacity-70" aria-hidden />
                </button>
              )}
              <button
                type="button"
                aria-label={speed === 0 ? '继续时间流逝' : '暂停时间流逝'}
                onClick={(e) => {
                  e.stopPropagation(); // 胶囊整体已是开关，按钮只做去重防双触发
                  useGameStore.getState().togglePause();
                }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(214,178,120,0.28)] bg-[rgba(19,16,9,0.45)] transition-transform active:scale-95"
              >
                {speed === 0 ? (
                  <Play className="h-3.5 w-3.5 text-[#a7b97e]" aria-hidden />
                ) : (
                  <Pause className="h-3.5 w-3.5 text-[#e6ba6c]" aria-hidden />
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
