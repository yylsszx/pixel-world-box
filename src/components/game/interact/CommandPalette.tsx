'use client';
// ============ 命令面板（Ctrl+K，Task 45-b） ============
// 全屏半透明遮罩 + 居中搜索框（现代 IDE 风格）。索引：
//   全部工具（名+分类，选中即切换）/ 面板开关（纪事·王国·生态·成就·神谕…）
//   / 速度控制（暂停·1x·3x·8x）/ 存读档入口 / 设置中心 / 帮助 / 回主菜单
//   / 镜头跳转各王国首都（实况列出王国名，平滑飞行）。
// 搜索：中文子串优先 + 子序列兜底；↑↓ 选择、Enter 执行、Esc 关闭、分组标题、空态提示。
// 执行全部走 gameStore 既有 action 与引擎公开只读调用，不改引擎。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { TOOLS, TAB_META, TOOL_BY_ID } from '@/lib/game/constants';
import { flyTo } from '@/lib/ui/camera';
import type { LucideIcon } from 'lucide-react';
import { Search, Command, Pause, Play, FastForward, ChevronsRight, Gauge, Save, FolderOpen, SlidersHorizontal, BookOpen, House, Crown, Wrench } from 'lucide-react';

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  group: string;
  keywords?: string;
  icon: LucideIcon;
  run: () => void;
}

/** 中文子串优先 + 子序列兜底的模糊匹配；0 = 不命中 */
function matchScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx >= 0) return 100 - Math.min(50, idx); // 子串命中：越靠前分越高
  let ti = 0;
  let hit = 0;
  let need = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    need++;
    const f = t.indexOf(ch, ti);
    if (f < 0) return 0;
    ti = f + 1;
    hit++;
  }
  return hit === need && need > 0 ? 30 : 0; // 全部字符按序出现（子序列）
}

/** 命令索引（打开面板时构建一次：工具静态表 + 王国实况） */
function buildCommands(): Cmd[] {
  const st = useGameStore.getState();
  const engine = getEngine();
  const cmds: Cmd[] = [];

  // —— 全部工具（含 102 件宝物）：选中即切换（切到对应分类页 + 选中工具） ——
  const tabName = (tab: string) => TAB_META.find((t) => t.id === tab)?.label ?? tab;
  for (const t of TOOLS) {
    cmds.push({
      id: `tool:${t.id}`,
      label: t.label,
      hint: `工具 · ${tabName(t.tab)}`,
      group: '工具',
      keywords: `${t.desc} ${t.tab}`,
      icon: Command,
      run: () => {
        const s = useGameStore.getState();
        s.setTab(t.tab);
        s.setTool(t.id);
        s.showInteractNote(`已切换工具：${t.label}`, 'good');
      },
    });
  }

  // —— 面板开关 ——
  const panels: [string, string, () => void][] = [
    ['世界纪事', '事件流编年史', () => st.toggleChronicle()],
    ['王国榜', '王国排行与战争态势', () => st.toggleKingdoms()],
    ['生态与进化', '种群基因与承载链', () => st.toggleEco()],
    ['成就', '跨世界元进度', () => st.toggleAch()],
    ['自然引擎', '板块·大气·四季', () => st.toggleNature()],
    ['进化图谱', '五系谱系树', () => st.toggleEvo()],
    ['种族名录', '性格与关系矩阵', () => st.toggleRace()],
    ['神经核心', 'NeuroCore 决策仪表', () => st.toggleNeuro()],
    ['社会涌现', '恐慌·血仇·家族', () => st.toggleSocietal()],
    ['神谕', 'AI 大模型融入', () => st.toggleOracle()],
    ['事件触发器', '像素级事件编排', () => st.toggleTriggers()],
    ['世界法典', '帮助与机制全书', () => st.toggleHelp()],
  ];
  for (const [label, hint, run] of panels) {
    cmds.push({ id: `panel:${label}`, label, hint, group: '面板', keywords: 'panel 面板 开关', icon: BookOpen, run });
  }

  // —— 时间与速度 ——
  cmds.push({ id: 'speed:pause', label: '暂停 / 继续', hint: '空格', group: '时间与速度', icon: Pause, run: () => st.togglePause() });
  cmds.push({ id: 'speed:1', label: '速度 1x', hint: '键 1', group: '时间与速度', icon: Play, run: () => st.setSpeed(1) });
  cmds.push({ id: 'speed:3', label: '速度 3x', hint: '键 2', group: '时间与速度', icon: FastForward, run: () => st.setSpeed(3) });
  cmds.push({ id: 'speed:8', label: '速度 8x', hint: '键 3', group: '时间与速度', icon: ChevronsRight, run: () => st.setSpeed(8) });
  // 无极调速预设（打数字入口在 TopBar Gauge 钮 / 长按岁月沙漏）
  for (const v of [0.5, 2, 5, 12, 16, 20]) {
    cmds.push({ id: `speed:${v}`, label: `速度 ${v}x`, hint: '无极档', group: '时间与速度', icon: Gauge, run: () => st.setSpeed(v) });
  }

  // —— 存读档 ——
  cmds.push({ id: 'save:save', label: '保存世界', hint: '多槽位', group: '存档', icon: Save, run: () => st.openSaveDialog('save') });
  cmds.push({ id: 'save:load', label: '读取存档', hint: '多槽位管理', group: '存档', icon: FolderOpen, run: () => st.openSaveDialog('load') });
  cmds.push({ id: 'save:slot1', label: '快速保存 · 槽位 1', group: '存档', icon: Save, run: () => useGameStore.getState().saveToSlot('slot0') });
  cmds.push({ id: 'save:slot2', label: '快速保存 · 槽位 2', group: '存档', icon: Save, run: () => useGameStore.getState().saveToSlot('slot1') });
  cmds.push({ id: 'save:slot3', label: '快速保存 · 槽位 3', group: '存档', icon: Save, run: () => useGameStore.getState().saveToSlot('slot2') });

  // —— 镜头：各王国首都（实况列出；平滑飞行 ~400ms） ——
  for (const c of engine.civs) {
    if (!c.alive || c.capital < 0) continue;
    const cx = engine.tileX(c.capital) + 0.5;
    const cy = engine.tileY(c.capital) + 0.5;
    cmds.push({
      id: `cam:civ${c.id}`,
      label: `镜头 · ${c.name}`,
      hint: '飞往王都',
      group: '镜头',
      keywords: 'capital 王国 首都 跳转',
      icon: Crown,
      run: () => flyTo({ x: cx, y: cy, zoom: Math.max(6, engine.cam.zoom) }, 400),
    });
  }

  // —— 界面与设置 ——
  cmds.push({ id: 'ui:settings', label: '设置中心', hint: '音频 / 性能 / 画面效果', group: '界面与设置', icon: SlidersHorizontal, run: () => st.toggleSettings() });
  cmds.push({ id: 'ui:perf', label: '性能 HUD', hint: 'FPS / 模拟 / 渲染仪表', group: '界面与设置', icon: Wrench, run: () => st.togglePerfHud() });
  cmds.push({ id: 'ui:minimap', label: '小地图开关', group: '界面与设置', icon: Command, run: () => st.toggleMinimap() });
  cmds.push({ id: 'ui:cinema', label: '摄影模式', hint: 'C · 隐藏全部界面', group: '界面与设置', icon: Command, run: () => st.toggleCinema() });
  cmds.push({ id: 'ui:newworld', label: '生成新世界', group: '界面与设置', icon: Command, run: () => st.newWorld() });
  cmds.push({ id: 'ui:title', label: '回主菜单', hint: '保留世界运行', group: '界面与设置', icon: House, run: () => st.showTitle() });

  return cmds;
}

/** 外层：开/关路由 —— 打开时重挂载 PaletteBody（索引重建 = 王国实况最新，状态全部归零） */
export function CommandPalette() {
  const paletteOpen = useGameStore((s) => s.paletteOpen);
  if (!paletteOpen) return null;
  return <PaletteBody />;
}

function PaletteBody() {
  const setPaletteOpen = useGameStore((s) => s.setPaletteOpen);
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  // 每次打开重挂载 → useState 初始化器重建索引（含王国首都实况）
  const [cmds] = useState<Cmd[]>(buildCommands);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // 当前工具标记（工具组里高亮实况）
  const curTool = useGameStore((s) => s.tool);

  // 上屏后聚焦（autofocus 在受控重挂载场景不可靠）
  useEffect(() => {
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  // 过滤 + 排序（子串 > 子序列；同分保持注册顺序）
  const filtered = useMemo(() => {
    if (!query.trim()) return cmds;
    const out: { cmd: Cmd; score: number }[] = [];
    for (const c of cmds) {
      const s = matchScore(query, `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`);
      if (s > 0) out.push({ cmd: c, score: matchScore(query, c.label) > 0 ? s + 50 : s });
    }
    out.sort((a, b) => b.score - a.score);
    return out.map((o) => o.cmd);
  }, [query, cmds]);

  // 选中项越界回夹（渲染期夹取，不另起 effect）
  const selIdx = Math.min(sel, filtered.length - 1);
  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selIdx]);

  const runCmd = (c: Cmd) => {
    setPaletteOpen(false);
    c.run();
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(filtered.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtered[selIdx];
      if (c) runCmd(c);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setPaletteOpen(false);
    }
  };

  const toolDef = TOOL_BY_ID[curTool];

  let lastGroup = '';
  return (
    <div
      className="fixed inset-0 z-[75] flex items-start justify-center bg-[rgba(19,16,9,0.62)] p-3 pt-[12vh] backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        className="su-panel su-rise flex max-h-[64vh] w-[calc(100vw-1.5rem)] flex-col overflow-hidden sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索框（输入字号移动端 16px：防 iOS Safari 聚焦自动放大页面，Task 69-b） */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[rgba(214,178,120,0.18)] px-3.5 py-3">
          <Search className="h-4 w-4 shrink-0 text-[#e6ba6c]" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={onInputKey}
            placeholder="搜索命令：工具 / 面板 / 速度 / 存档 / 镜头…"
            aria-label="搜索命令"
            className="min-w-0 flex-1 bg-transparent text-base text-[#f1e8d6] placeholder:text-[#6f6549] focus:outline-none sm:text-sm"
          />
          <span className="su-kbd shrink-0">Esc</span>
        </div>
        {/* 结果列表 */}
        <div ref={listRef} className="game-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-[11px] text-zinc-500">
              没有匹配的命令 — 试试「陨石」「王国」「速度」「保存」
            </p>
          ) : (
            filtered.slice(0, 60).map((c, i) => {
              const showHeader = c.group !== lastGroup;
              lastGroup = c.group;
              const active = i === selIdx;
              const isCurTool = c.id === `tool:${curTool}`;
              return (
                <div key={c.id}>
                  {showHeader && (
                    <p className="mt-1.5 px-2 pb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-600 first:mt-0">
                      {c.group}
                    </p>
                  )}
                  <button
                    type="button"
                    data-sel={active}
                    onMouseEnter={() => setSel(i)}
                    onClick={() => runCmd(c)}
                    className={`flex h-11 w-full items-center gap-2.5 rounded-[10px] border px-2.5 text-left transition-colors ${
                      active ? 'border-[rgba(200,150,74,0.55)] bg-[rgba(217,163,90,0.14)]' : 'border-transparent hover:bg-[rgba(62,53,39,0.55)]'
                    }`}
                  >
                    <c.icon className={`h-4 w-4 shrink-0 ${active ? 'text-amber-300' : 'text-zinc-500'}`} aria-hidden />
                    <span className={`min-w-0 flex-1 truncate text-[12px] font-bold ${active ? 'text-amber-100' : 'text-zinc-200'}`}>
                      {c.label}
                    </span>
                    {isCurTool && (
                      <span className="shrink-0 rounded-sm border border-amber-400/60 bg-amber-400/15 px-1 text-[9px] font-bold text-amber-200">
                        当前
                      </span>
                    )}
                    {c.hint && !isCurTool && (
                      <span className="hidden shrink-0 truncate text-[10px] text-zinc-500 sm:block">{c.hint}</span>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
        {/* 底部状态行 */}
        <div className="flex shrink-0 items-center justify-between border-t border-[rgba(214,178,120,0.18)] px-3.5 py-2 text-[10px] text-[#8f836a]">
          <span>
            {filtered.length > 60 ? `前 60 / ${filtered.length} 条` : `${filtered.length} 条命令`}
            {toolDef && !query.trim() ? ` · 当前工具：${toolDef.label}` : ''}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="su-kbd">↑↓</span>
            <span className="su-kbd">↵</span>
            <span className="font-mono">选择 / 执行</span>
          </span>
        </div>
      </div>
    </div>
  );
}
