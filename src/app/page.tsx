'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// The game engine touches DOM (canvas) — skip SSR entirely
const GameShell = dynamic(() => import('@/components/game/GameShell').then((m) => m.GameShell), {
  ssr: false,
  loading: () => <BootLoader />,
});

// ============================================================
// Task 79 · 首载体验拟物化（BootLoader）
// ------------------------------------------------------------
// 引擎 chunk 约 2.7MB（gzip 后约 0.6MB），首次访问 GitHub Pages
// 下载 + 解析约 10~35s（视网络）。旧版只有一行「正在创造世界…」
// + 一枚转圈——玩家无法分辨「在下载」还是「卡死了」。
//
// 新版三件套：
//   ① 阶段化真实文案（连接→下载→编译→编织时间），按真实耗时切换；
//   ② 像素分格进度条：缓动逼近估计值 + 每个资源真实到达时 bump；
//   ③ 缓存提示（首次 vs 复访文案不同）+ Service Worker 注册，
//      二次访问起静态资源全命中本地缓存，秒开且离线可玩。
// ============================================================

const STAGES: { t: number; label: string }[] = [
  { t: 0, label: '连接世界服务器…' },
  { t: 1200, label: '下载世界引擎…' },
  { t: 5200, label: '编译世界法则…' },
  { t: 11000, label: '编织时间之河…' },
];

function BootLoader() {
  const [pct, setPct] = useState(0);
  const [stage, setStage] = useState(0);
  const [tips, setTips] = useState('');
  const targetRef = useRef(4);
  const shownRef = useRef(0);
  const arriveRef = useRef(0); // 真实到货的资源数

  useEffect(() => {
    // —— Service Worker：production 才注册（dev 注册会干扰 HMR）——
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      navigator.serviceWorker.register(`${bp}/sw.js`).catch(() => {});
    }
    // —— 复访检测：performance 有零传输条目（缓存命中特征）→ 缓存提示 ——
    const probeTimer = window.setTimeout(() => {
      try {
        const revisit =
          performance.getEntriesByType('navigation').some((n) => (n as PerformanceResourceTiming).transferSize === 0) ||
          performance.getEntriesByType('resource').some((r) => (r as PerformanceResourceTiming).transferSize === 0 && (r as PerformanceResourceTiming).decodedBodySize > 0);
        setTips(revisit ? '缓存命中 · 即将完成' : '首次加载后浏览器永久缓存 · 下次秒开');
      } catch {
        setTips('');
      }
    }, 300);

    // —— 真实资源到货计数（每个 JS chunk 完成 bump 一格）——
    let po: PerformanceObserver | null = null;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name.endsWith('.js') || e.name.endsWith('.css')) {
            arriveRef.current += 1;
            targetRef.current = Math.min(88, targetRef.current + 6);
          }
        }
      });
      po.observe({ type: 'resource', buffered: true });
    } catch {
      /* 老浏览器降级：纯缓动 */
    }

    const t0 = performance.now();
    const timer = window.setInterval(() => {
      const el = performance.now() - t0;
      // 阶段切换（真实耗时驱动）
      let s = 0;
      for (let i = 0; i < STAGES.length; i++) if (el >= STAGES[i].t) s = i;
      setStage(s);
      // 估计值缓动爬升：前 3 秒快、之后渐慢、20s 后贴住 92% 等 chunk
      const estimate = el < 3000 ? 6 + el * 0.03 : Math.min(92, 15 + Math.log10(el / 400) * 26);
      targetRef.current = Math.max(targetRef.current, estimate);
      // 追踪缓动
      shownRef.current += (targetRef.current - shownRef.current) * 0.18;
      setPct(Math.round(shownRef.current));
    }, 120);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(probeTimer);
      po?.disconnect();
    };
  }, []);

  const blocks = 12;
  const lit = Math.max(1, Math.round((pct / 100) * blocks));

  return (
    <div className="flex h-dvh w-full items-center justify-center bg-[#0d1b2e]">
      <div className="flex w-[min(320px,84vw)] flex-col items-center gap-4">
        <div className="flex h-10 items-end gap-[3px]" aria-hidden>
          {Array.from({ length: blocks }, (_, i) => (
            <div
              key={i}
              className={`w-[14px] transition-colors duration-150 ${
                i < lit
                  ? i >= blocks - 2
                    ? 'bg-amber-300 shadow-[0_0_8px_rgba(252,211,77,0.6)]'
                    : i % 3 === 1
                      ? 'bg-amber-400'
                      : 'bg-amber-500'
                  : 'bg-amber-900/30'
              }`}
              style={{ height: i < lit ? 12 + ((i * 7) % 22) : 12 }}
            />
          ))}
        </div>
        <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-amber-300">
          {STAGES[stage].label}
        </p>
        <p className="font-mono text-[10px] tracking-widest text-amber-100/50">
          {pct}%{tips ? ` · ${tips}` : ''}
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  return <GameShell />;
}
