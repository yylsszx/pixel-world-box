'use client';

import dynamic from 'next/dynamic';

// The game engine touches DOM (canvas) — skip SSR entirely
const GameShell = dynamic(() => import('@/components/game/GameShell').then((m) => m.GameShell), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh w-full items-center justify-center bg-[#0d1b2e]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-sm border-2 border-amber-400 border-t-transparent" />
        <p className="font-mono text-xs font-bold uppercase tracking-[0.3em] text-amber-300">正在创造世界…</p>
      </div>
    </div>
  ),
});

export default function Home() {
  return <GameShell />;
}
