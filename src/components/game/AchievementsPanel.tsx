'use client';
// ============ Achievements Panel: 成就墙（桌面左侧栏 + 移动端底部抽屉） ============
// 跨世界元进度：27 项成就（文明/战争/科技/传奇/天灾/进化/季节），青铜→传说四档稀有度
// 解锁 → 纪事播报 + 本面板亮灯 + localStorage 永久保存；未解锁展示进度条
import { useGameStore } from '@/store/gameStore';
import { ACHIEVEMENTS, TIER_META, type AchievementDef } from '@/lib/game/achievements';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Trophy, X, Lock, Flag, Castle, Users, Crown, Skull, Swords, Lightbulb, Scroll, Landmark, Biohazard, Droplets, Hammer, Radiation, Orbit, Sparkles, Dna, Flame, Handshake, Sun, Ghost } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** 成就图标映射（definitions 用字符串键，UI 侧映射 lucide 组件） */
const ICONS: Record<string, LucideIcon> = {
  flag: Flag, castle: Castle, users: Users, crown: Crown, skull: Skull,
  swords: Swords, lightbulb: Lightbulb, scroll: Scroll,
  landmark: Landmark, biohazard: Biohazard, droplets: Droplets, hammer: Hammer,
  radiation: Radiation, orbit: Orbit, sparkles: Sparkles, dna: Dna, flame: Flame,
  handshake: Handshake, sun: Sun, ghost: Ghost,
};

/** 稀有度排序权重（解锁优先，其次按稀有度降序） */
const TIER_ORDER: Record<string, number> = { legend: 0, gold: 1, silver: 2, bronze: 3 };

/** 单张成就卡：图标 + 名称 + 描述 + 稀有度徽章 + 解锁年份/进度条 */
function AchCard({ def, year, progress }: { def: AchievementDef; year?: number; progress?: number }) {
  const Icon = ICONS[def.icon] ?? Trophy;
  const tier = TIER_META[def.tier];
  const unlocked = year != null;
  const pct = unlocked || !def.goal || progress == null ? 0 : Math.min(100, Math.round((progress / def.goal) * 100));
  return (
    <div
      className={`rounded-sm border-2 p-2 transition-colors ${
        unlocked
          ? `border-zinc-600 bg-zinc-800/70 ring-1 ${tier.ring}`
          : 'border-zinc-800 bg-zinc-900/50 opacity-70'
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border-2 ${
            unlocked ? tier.cls : 'border-zinc-700 bg-zinc-800/60 text-zinc-600'
          }`}
          aria-hidden
        >
          {unlocked ? <Icon className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <p className={`truncate text-[11px] font-bold ${unlocked ? 'text-zinc-100' : 'text-zinc-500'}`}>
              {def.name}
            </p>
            <span className={`ml-auto shrink-0 border px-1 text-[8px] font-bold leading-4 ${tier.cls}`}>{tier.label}</span>
          </div>
          <p className="mt-0.5 break-words text-[9px] leading-relaxed text-zinc-500">{def.desc}</p>
          {unlocked ? (
            <p className="mt-1 flex items-center gap-1 font-mono text-[9px] font-bold text-yellow-300">
              <Trophy className="h-3 w-3" aria-hidden />
              {year} 年解锁
            </p>
          ) : def.goal && progress != null && progress > 0 ? (
            <div className="mt-1.5">
              <div className="mb-0.5 flex justify-between font-mono text-[8px] font-bold text-zinc-600">
                <span>{progress}</span>
                <span>{def.goal}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-zinc-800">
                <div className="h-full bg-zinc-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 面板主体（桌面与移动端共用） */
function AchBody() {
  const stats = useGameStore((s) => s.stats);
  const achMeta = useGameStore((s) => s.achMeta);
  // 元进度合并：localStorage 永久解锁 + 当前世界引擎快照（解锁中尚未落盘的）
  const unlocked: Record<string, number> = { ...achMeta };
  for (const { id, year } of stats?.unlockedAch ?? []) {
    if (unlocked[id] == null) unlocked[id] = year;
  }
  const progress = { ...(stats?.achProgress ?? {}) };
  const total = ACHIEVEMENTS.length;
  const got = ACHIEVEMENTS.filter((a) => unlocked[a.id] != null).length;
  // 排序：已解锁在前（按稀有度降序），未解锁按稀有度降序（近在咫尺的先看到）
  const sorted = [...ACHIEVEMENTS].sort((a, b) => {
    const ua = unlocked[a.id] != null ? 0 : 1;
    const ub = unlocked[b.id] != null ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
  });

  return (
    <div className="game-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      {/* 总览：解锁进度 */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-yellow-300">
            <Trophy className="h-3.5 w-3.5" aria-hidden />
            成就殿堂
          </p>
          <span className="font-mono text-[11px] font-black text-zinc-300">
            {got}<span className="text-zinc-600"> / {total}</span>
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-zinc-800">
          <div
            className="h-full bg-gradient-to-r from-yellow-600 to-yellow-300 transition-all"
            style={{ width: `${Math.round((got / total) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-[9px] leading-relaxed text-zinc-600">
          成就跨世界永久保存 — 每一次解锁都会在纪事中铭刻，换新世界也不会失去。
        </p>
      </div>

      {/* 成就墙：无任何解锁时先给一段空态引导（跨世界永久保存，老玩家不会看到） */}
      {got === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-sm border-2 border-dashed border-zinc-800 bg-zinc-900/50 px-3 py-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
            <Trophy className="h-6 w-6 text-zinc-700" aria-hidden />
          </span>
          <p className="text-center text-[11px] leading-relaxed text-zinc-500">
            尚无成就解锁——第一个王国、屠龙、青铜时代……<br />
            <span className="text-zinc-600">成就检测自动进行，无需任何操作</span>
          </p>
        </div>
      )}

      {/* 成就墙 */}
      <div className="grid gap-1.5">
        {sorted.map((a) => (
          <AchCard key={a.id} def={a} year={unlocked[a.id]} progress={progress[a.id]} />
        ))}
      </div>
    </div>
  );
}

export function AchievementsPanel() {
  const { showAch, toggleAch, mobilePanel, openMobilePanel } = useGameStore();
  const achMeta = useGameStore((s) => s.achMeta);
  const count = ACHIEVEMENTS.filter((a) => achMeta[a.id] != null).length;
  return (
    <>
      {/* 桌面左侧栏 —— 仅顶栏奖杯按钮触发时出现（与王国榜/生态同列互斥） */}
      {showAch && (
        <div className="su-dock-panel w-60 flex-col">
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <Trophy className="h-3.5 w-3.5 text-yellow-300" aria-hidden />
              成就
              <span className="font-mono text-[10px] text-zinc-500">{count}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleAch}
              aria-label="关闭成就面板"
              className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex max-h-[calc(100dvh-96px-33px)] min-h-[220px] flex-col border-2 border-zinc-700/90 bg-zinc-900/95">
            <AchBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'ach'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[52vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <Trophy className="h-4 w-4 text-yellow-300" aria-hidden />
              成就殿堂
              <span className="ml-auto font-mono text-[10px] font-bold text-zinc-500">{count} / {ACHIEVEMENTS.length}</span>
            </SheetTitle>
          </SheetHeader>
          <AchBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
