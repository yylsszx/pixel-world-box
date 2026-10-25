'use client';
// ============ Smart Hint（Task 68 超级 UI）：智能情境洞察芯片 ============
// 类「智能助手」的世界感知层：从世界实况（战争/火情/灰烬/风暴/人口）派生
// 上下文洞察 + 一键动作；无事件时轮换高价值操作提示。
// 出现位置：桌面工具坞上方居中 / 移动端工具坞上方；参数面板弹出时让位隐藏。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Flame, Swords, CloudRain, Tornado, Sailboat, Sprout, Command, Camera, Sparkles, MousePointerClick, SquareDashed, X, Lightbulb } from 'lucide-react';

interface HintAction {
  label: string;
  run: () => void;
}
interface Hint {
  id: string;
  icon: typeof Flame;
  text: string;
  tone: 'brass' | 'rust' | 'petrol' | 'sage';
  actions?: HintAction[];
}

const TONE_CLS: Record<Hint['tone'], string> = {
  brass: 'text-[#e6ba6c]',
  rust: 'text-[#d97e55]',
  petrol: 'text-[#8fb9ba]',
  sage: 'text-[#bcc98e]',
};

/** 轮换操作提示（无紧急事件时的智能推荐；【75】随指挥模式自适应） */
function idleHints(commandMode: boolean): Hint[] {
  const s = useGameStore.getState();
  if (!commandMode) {
    // 简洁模式：把「开启指挥模式」作为首位推荐（其余进阶提示等开启后再轮换）
    return [
      { id: 'tip:commandmode', icon: SquareDashed, text: '指挥模式未开启 —— 框选编组 / 右键菜单 / 长按凝视 / 命令面板等进阶操作已收起', tone: 'brass', actions: [{ label: '开启指挥模式', run: () => s.toggleCommandMode() }] },
      { id: 'tip:cinema', icon: Camera, text: '摄影模式：隐去全部界面，纯净欣赏你的世界', tone: 'brass', actions: [{ label: '进入摄影模式', run: () => s.toggleCinema() }] },
      { id: 'tip:oracle', icon: Sparkles, text: '唤醒神谕 —— 让 AI 为这个世界创造全新的物种与神器', tone: 'brass', actions: [{ label: '唤醒神谕', run: () => s.toggleOracle() }] },
    ];
  }
  return [
    { id: 'tip:palette', icon: Command, text: '一切皆可搜索 —— 工具 · 面板 · 速度 · 存档 · 镜头跳转', tone: 'brass', actions: [{ label: '打开命令面板', run: () => s.setPaletteOpen(true) }] },
    { id: 'tip:cinema', icon: Camera, text: '摄影模式：隐去全部界面，纯净欣赏你的世界', tone: 'brass', actions: [{ label: '进入摄影模式', run: () => s.toggleCinema() }] },
    { id: 'tip:oracle', icon: Sparkles, text: '唤醒神谕 —— 让 AI 为这个世界创造全新的物种与神器', tone: 'brass', actions: [{ label: '唤醒神谕', run: () => s.toggleOracle() }] },
    { id: 'tip:context', icon: MousePointerClick, text: '右键任意单位打开身份菜单；悬停查看生平芯片', tone: 'petrol' },
    { id: 'tip:group', icon: SquareDashed, text: 'Shift 框选单位，编组军团发起集团冲锋', tone: 'petrol' },
  ];
}

export function SmartHint() {
  const stats = useGameStore((s) => s.stats);
  const boot = useGameStore((s) => s.boot);
  const cinema = useGameStore((s) => s.cinema);
  const tool = useGameStore((s) => s.tool);
  const viewMode = useGameStore((s) => s.viewMode);
  const commandMode = useGameStore((s) => s.commandMode); // 【75】简洁模式推荐开启指挥模式

  const [idx, setIdx] = useState(0);
  const dismissed = useRef<Set<string>>(new Set());

  /** 事件洞察（优先）+ 轮换提示（兜底） */
  const hints = useMemo<Hint[]>(() => {
    const live: Hint[] = [];
    const st = useGameStore.getState();
    if (stats) {
      if (stats.fires > 5) {
        live.push({
          id: `evt:fires:${stats.fires > 30 ? 'big' : 'small'}`,
          icon: Flame,
          text: `火焰正在 ${stats.fires} 处地块蔓延，火势可能失控`,
          tone: 'rust',
          actions: [{ label: '治疗之雨', run: () => { st.setTab('powers'); st.setTool('heal'); } }],
        });
      }
      if (stats.warsCount > 0) {
        live.push({
          id: 'evt:wars',
          icon: Swords,
          text: `战火连绵 —— ${stats.warsCount} 场战争进行中`,
          tone: 'rust',
          actions: [{ label: '王国榜', run: () => st.toggleKingdoms() }],
        });
      }
      if (stats.nature && stats.nature.ash > 0.15) {
        live.push({
          id: 'evt:ash',
          icon: CloudRain,
          text: `火山灰遮蔽 ${(stats.nature.ash * 100).toFixed(0)}% 天空 —— 无夏之年，作物将歉收`,
          tone: 'petrol',
          actions: [{ label: '自然引擎', run: () => st.toggleNature() }],
        });
      }
      if (stats.nature && stats.nature.storms.length > 0) {
        live.push({
          id: 'evt:storm',
          icon: Tornado,
          text: `${stats.nature.storms.length} 场风暴正在肆虐大陆`,
          tone: 'petrol',
          actions: [{ label: '自然引擎', run: () => st.toggleNature() }],
        });
      }
      if (stats.boats > 0) {
        live.push({ id: 'evt:boats', icon: Sailboat, text: `${stats.boats} 艘殖民船正在跨洋航行，寻找新大陆`, tone: 'petrol' });
      }
      if (stats.totalPop === 0 && stats.year > 3) {
        live.push({
          id: 'evt:dead',
          icon: Sprout,
          text: '世界一片死寂 —— 播下第一颗文明的种子？',
          tone: 'sage',
          actions: [{ label: '放置人类', run: () => { st.setTab('creatures'); st.setTool('human'); } }],
        });
      }
    }
    return [...live, ...idleHints(commandMode)];
  }, [stats, commandMode]);

  // 轮换：未被关闭的提示池中每 12s 前进一格
  const pool = hints.filter((h) => !dismissed.current.has(h.id));
  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => i + 1), 12000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => { setIdx((i) => i + 1); }, [hints.length]);

  if (!stats || boot !== 'game' || cinema) return null;
  if (tool !== 'select' || viewMode) return null; // 参数面板/观察模式让位
  if (!pool.length) return null;

  const hint = pool[idx % pool.length];
  const dismiss = () => {
    dismissed.current.add(hint.id);
    setIdx((i) => i + 1);
  };

  return (
    <div
      key={hint.id}
      className="su-chip su-rise pointer-events-auto absolute bottom-24 left-1/2 z-20 flex max-w-[calc(100vw-1.25rem)] -translate-x-1/2 items-center gap-2.5 py-1.5 pl-3 pr-2 !border-[rgba(217,163,90,0.45)] !bg-[linear-gradient(180deg,rgba(58,49,37,0.93),rgba(36,29,22,0.95))] sm:bottom-[100px]"
      role="status"
      aria-label="智能洞察"
    >
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
        <span className={`su-breathe absolute inset-0 rounded-full ${hint.tone === 'rust' ? 'bg-[#d97e55]' : hint.tone === 'petrol' ? 'bg-[#7fa9ab]' : hint.tone === 'sage' ? 'bg-[#a7b97e]' : 'bg-[#d9a35a]'}`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${hint.tone === 'rust' ? 'bg-[#d97e55]' : hint.tone === 'petrol' ? 'bg-[#7fa9ab]' : hint.tone === 'sage' ? 'bg-[#a7b97e]' : 'bg-[#d9a35a]'}`} />
      </span>
      <hint.icon className={`h-3.5 w-3.5 shrink-0 ${TONE_CLS[hint.tone]}`} aria-hidden />
      <p className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-[#f1e8d6]">
        <span className="mr-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#75694f]">洞察</span>
        {hint.text}
      </p>
      {hint.actions?.map((a) => (
        <button key={a.label} type="button" onClick={a.run} className="su-chip-action">
          {a.label}
        </button>
      ))}
      <button
        type="button"
        onClick={dismiss}
        aria-label="关闭此洞察"
        title="关闭（将轮换到下一条）"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#75694f] transition-colors hover:bg-[rgba(62,53,39,0.7)] hover:text-[#f1e8d6]"
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
      <Lightbulb className="hidden" aria-hidden />
    </div>
  );
}
