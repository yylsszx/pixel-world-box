'use client';
// ============ SmartHub：智能洞察中枢（UI 超级智能化 · Task 61-c） ============
// 商业级「智能助手」入口：底部工具栏 Tab 行末端的紫色星辉按钮 + 上浮洞察面板。
// 规则引擎见 src/lib/game/insights.ts（15s 全量体检：战争/野火/瘟疫/濒危/外交/
// 崛起/科技/新物种/神经进化/风暴/闲置陪伴），本组件只负责：
//   ① 轮询 + 「新」徽标（零弹窗打扰——承接 Task 59 去通知弹窗的产品决策）
//   ② 洞察卡片渲染 + 一键处置动作解释执行（runInsightAction，命令面板共用）
// 交互协议：
//   - 按钮徽标只在面板关闭时累计（fresh 洞察计数），打开即清零
//   - 面板带全屏透明点击捕获层（fixed）：点世界任意处优雅关闭
//   - 检查器（Inspector）打开时桌面端面板右移让位（right-2 ⇄ right-[236px]）
//   - 新手引导未完成时不渲染（Onboarding 优先）
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { flyTo } from '@/lib/ui/camera';
import { collectInsights, type Insight, type InsightAction } from '@/lib/game/insights';
import {
  Sparkles, Swords, Flame, Biohazard, Users, CloudRain, PawPrint, Handshake,
  Crown, Lightbulb, Dna, Brain, Tornado, X, RefreshCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** 洞察语义图标表（规则引擎字符串 → lucide 组件；命令面板推荐位共用） */
export const INSIGHT_ICONS: Record<string, LucideIcon> = {
  swords: Swords, flame: Flame, biohazard: Biohazard, users: Users, cloudrain: CloudRain,
  pawprint: PawPrint, handshake: Handshake, crown: Crown, lightbulb: Lightbulb,
  dna: Dna, brain: Brain, tornado: Tornado, sparkles: Sparkles,
};

/** 色调样式（边框/图标/徽片） */
const TONE_CLS: Record<Insight['tone'], { border: string; icon: string; chip: string; dot: string }> = {
  danger: { border: 'border-red-800/70', icon: 'text-red-400', chip: 'bg-red-500/15 text-red-300', dot: 'bg-red-400' },
  warn: { border: 'border-amber-700/70', icon: 'text-amber-300', chip: 'bg-amber-500/15 text-amber-300', dot: 'bg-amber-400' },
  info: { border: 'border-teal-700/70', icon: 'text-teal-300', chip: 'bg-teal-500/15 text-teal-300', dot: 'bg-teal-400' },
  good: { border: 'border-emerald-700/70', icon: 'text-emerald-300', chip: 'bg-emerald-500/15 text-emerald-300', dot: 'bg-emerald-400' },
};

/** 面板名 → (已开?) / 开启 action（互斥逻辑由 store 的 toggle 链处理） */
const PANEL_STATE: Record<NonNullable<InsightAction['panel']>, (s: ReturnType<typeof useGameStore.getState>) => boolean> = {
  kingdoms: (s) => s.showKingdoms,
  eco: (s) => s.showEco,
  nature: (s) => s.showNature,
  evo: (s) => s.showEvo,
  neuro: (s) => s.showNeuro,
  chronicle: (s) => s.showChronicle,
  race: (s) => s.showRace,
  societal: (s) => s.showSocietal,
};
const PANEL_TOGGLE: Record<NonNullable<InsightAction['panel']>, (s: ReturnType<typeof useGameStore.getState>) => void> = {
  kingdoms: (s) => s.toggleKingdoms(),
  eco: (s) => s.toggleEco(),
  nature: (s) => s.toggleNature(),
  evo: (s) => s.toggleEvo(),
  neuro: (s) => s.toggleNeuro(),
  chronicle: (s) => s.toggleChronicle(),
  race: (s) => s.toggleRace(),
  societal: (s) => s.toggleSocietal(),
};

const DIVINE_NAMES: Record<string, string> = {
  heal: '神恩净化', bless: '神恩祝福', rain_cloud: '天降甘霖',
};

/** 一键处置动作解释执行（SmartHub 与命令面板情境推荐共用） */
export function runInsightAction(a: InsightAction): void {
  const st = useGameStore.getState();
  switch (a.kind) {
    case 'panel': {
      if (!a.panel) return;
      if (!PANEL_STATE[a.panel](st)) PANEL_TOGGLE[a.panel](st); // 已开则聚焦不动
      break;
    }
    case 'fly': {
      if (a.x == null || a.y == null) return;
      flyTo({ x: a.x, y: a.y });
      break;
    }
    case 'divine': {
      if (!a.tool || a.x == null || a.y == null) return;
      getEngine().applyTool(a.tool, a.x, a.y);
      st.showNote(`已施放「${DIVINE_NAMES[a.tool] ?? a.tool}」`, 'good');
      break;
    }
    case 'oracle': {
      if (!a.prompt) return;
      st.setOraclePending(a.prompt);
      st.openOracle();
      break;
    }
    case 'speed': {
      if (a.speed == null) return;
      st.setSpeed(a.speed);
      st.showNote(`时间流速 ×${a.speed}`, 'info');
      break;
    }
    case 'civ': {
      if (a.civId == null) return;
      st.openCivPanel(a.civId);
      break;
    }
    case 'note': {
      if (a.text) st.showNote(a.text, 'info');
      break;
    }
  }
}

export function SmartHub() {
  const onboardingDone = useGameStore((s) => s.onboardingDone);
  const inspOpen = useGameStore((s) => s.selUnit != null || s.selCiv != null);
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [newCount, setNewCount] = useState(0);
  // 面板开合的 ref 镜像（轮询回调判「是否累计徽标」用；只在事件处理器中写）
  const openRef = useRef(false);
  // 用户最近交互时刻（闲置陪伴规则的数据源；被动监听零开销）
  const lastActRef = useRef(Date.now());

  const poll = useCallback(() => {
    let eng: ReturnType<typeof getEngine> | null = null;
    try { eng = getEngine(); } catch { eng = null; }
    if (!eng) return;
    const list = collectInsights(eng, { idleMs: Date.now() - lastActRef.current });
    setInsights(list);
    if (!openRef.current) {
      const n = list.reduce((acc, i) => acc + (i.fresh ? 1 : 0), 0);
      if (n > 0) setNewCount((c) => Math.min(99, c + n));
    }
  }, []);

  // 15s 全量体检 + 立即首轮（setInterval 回调内 setState 合法；非渲染期）
  useEffect(() => {
    poll();
    const t = window.setInterval(poll, 15_000);
    return () => window.clearInterval(t);
  }, [poll]);

  // 交互心跳：指针/键盘任一活动刷新闲置计时
  useEffect(() => {
    const bump = () => { lastActRef.current = Date.now(); };
    window.addEventListener('pointerdown', bump, { passive: true });
    window.addEventListener('keydown', bump);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
    };
  }, []);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); openRef.current = false; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openHub = () => {
    setOpen(true);
    openRef.current = true;
    setNewCount(0);
    poll(); // 打开立即刷新（不等多下一轮）
  };
  const closeHub = () => {
    setOpen(false);
    openRef.current = false;
  };

  if (!onboardingDone) return null;
  const badge = newCount > 0 && !open;

  return (
    <>
      {/* —— 智能中枢按钮（Tab 行末位；紫罗兰 AI 身份色，与琥珀色工具 Tab 区分） —— */}
      <div className="relative ml-0.5 flex h-11 items-center border-l-2 border-zinc-700/60 pl-1">
        <button
          type="button"
          onClick={() => (open ? closeHub() : openHub())}
          aria-pressed={open}
          aria-label={`智能洞察${badge ? `（${newCount} 条新洞察）` : '：世界状态实时分析与一键处置'}`}
          title="智能洞察：世界状态实时分析与一键处置"
          className={`flex h-11 items-center gap-1.5 border-2 px-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors sm:px-3.5 ${
            open
              ? 'border-violet-400 bg-violet-400/15 text-violet-200 shadow-[0_0_0_1px_rgba(167,139,250,0.4)]'
              : 'border-zinc-700 bg-zinc-900/95 text-zinc-300 hover:border-violet-500/70 hover:text-violet-300'
          }`}
        >
          <Sparkles className={`h-4 w-4 ${badge ? 'animate-pulse text-violet-300' : ''}`} aria-hidden />
          <span className="hidden sm:inline">洞察</span>
        </button>
        {badge && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border border-zinc-900 bg-violet-400 px-0.5 font-mono text-[9px] font-bold text-zinc-950 shadow-[0_1px_0_rgba(0,0,0,0.6)]">
            {newCount > 9 ? '9+' : newCount}
          </span>
        )}
      </div>

      {/* —— 洞察面板（挂 Toolbar 容器：上浮于工具栏之上；fixed 捕获层点世界任意处关闭） —— */}
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={closeHub} aria-hidden />
          <div
            role="dialog"
            aria-label="智能洞察面板"
            className={`pointer-events-auto absolute bottom-full z-40 mb-1.5 w-[min(92vw,380px)] ${inspOpen ? 'right-2 sm:right-[236px]' : 'right-2'}`}
          >
            <div className="flex max-h-[min(56vh,460px)] flex-col rounded-sm border-2 border-violet-800/80 bg-zinc-950/97 shadow-[0_6px_0_rgba(0,0,0,0.65)]">
              {/* 头部 */}
              <div className="flex shrink-0 items-center gap-1.5 border-b-2 border-violet-900/60 px-2.5 py-1.5">
                <Sparkles className="h-3.5 w-3.5 text-violet-300" aria-hidden />
                <span className="text-[11px] font-bold uppercase tracking-wider text-violet-200">智能洞察</span>
                <span className="text-[9px] text-zinc-500">世界状态实时分析</span>
                <button
                  type="button"
                  onClick={poll}
                  aria-label="立即刷新"
                  title="立即刷新"
                  className="ml-auto flex h-6 w-6 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={closeHub}
                  aria-label="关闭"
                  className="flex h-6 w-6 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>

              {/* 洞察卡片流 */}
              <div className="game-scroll min-h-0 flex-1 overflow-y-auto p-2">
                {insights.length === 0 ? (
                  <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                    <Sparkles className="h-6 w-6 text-zinc-600" aria-hidden />
                    <p className="text-[11px] font-bold text-zinc-400">世界风平浪静</p>
                    <p className="text-[10px] leading-snug text-zinc-600">
                      没有需要留意的态势——生灵繁衍、文明演化，一切都在轨道上。
                      有事发生时，这里会亮起徽标。
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {insights.map((ins) => {
                      const Icon = INSIGHT_ICONS[ins.icon] ?? Sparkles;
                      const tone = TONE_CLS[ins.tone];
                      return (
                        <article
                          key={ins.id}
                          className={`rounded-sm border-2 bg-zinc-900/95 p-2 ${tone.border}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <Icon className={`h-3.5 w-3.5 shrink-0 ${tone.icon}`} aria-hidden />
                            <h3 className="min-w-0 truncate text-[11px] font-bold text-zinc-100">{ins.title}</h3>
                            {ins.fresh && (
                              <span className={`shrink-0 rounded-sm px-1 py-px text-[8px] font-bold uppercase ${tone.chip}`}>新</span>
                            )}
                            <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                          </div>
                          <p className="mt-0.5 text-[10px] leading-snug text-zinc-400">{ins.desc}</p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {ins.actions.map((a, i) => (
                              <button
                                key={a.label}
                                type="button"
                                onClick={() => runInsightAction(a)}
                                title={a.kind === 'divine' ? '对世界直接施放' : a.kind === 'oracle' ? '交给 AI 神谕执行' : undefined}
                                className={`h-6 rounded-sm border px-1.5 text-[9px] font-bold transition-colors ${
                                  i === 0
                                    ? 'border-violet-500/70 bg-violet-500/15 text-violet-200 hover:border-violet-400 hover:bg-violet-500/25'
                                    : 'border-zinc-700 bg-zinc-800/70 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                                }`}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 底部提示 */}
              <div className="shrink-0 border-t border-zinc-800/80 px-2.5 py-1 text-[9px] text-zinc-600">
                每 15 秒自动体检 · 点世界任意处关闭 · <span className="font-bold text-zinc-500">Ctrl+K</span> 命令面板也能搜到建议
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
