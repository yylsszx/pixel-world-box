'use client';
// ============ SideDock（Task 69 超级 UI v2）：一体化侧边坞 ============
// macOS Finder 侧栏范式：48px 导航轨 + 面板舱共处同一玻璃壳，
// 面板不再是漂浮的独立盒子，而是从导航轨右侧「长」出来的一部分。
// · 面板舱 data-open 控制可见性（display:none 不卸载 React 树，
//   保证面板内部的移动端 Sheet（Radix Portal）在任何断点都活着）
// · 左面板互斥由 gameStore 的 toggle* 家族保证（一次只开一个）
// · 移动端整坞隐藏（面板入口走 OmniBar 的「面板网格」底部抽屉）
import { useGameStore } from '@/store/gameStore';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Crown, Leaf, MountainSnow, UsersRound,
  GitBranch, Network, BrainCircuit,
  Sparkles, BookOpen, Zap, Trophy, ScrollText, Gavel,
} from 'lucide-react';

/** 组强调色（激活态图标着色）：世界=石油青 · 智慧=丁香紫 · 玩家=黄铜 */
const A_WORLD = 'var(--su-petrol)';
const A_MIND = 'var(--su-lilac)';
const A_PLAYER = 'var(--su-brass)';

interface RailItem {
  key: string;
  label: string;
  hint: string;
  icon: typeof Crown;
  accent: string;
  active: boolean;
  toggle: () => void;
}

/**
 * @param children 面板组件集合（Kingdoms/Eco/Nature/Race/Evo/Societal/Neuro/Oracle/Ach/Dev）。
 * 面板各自的桌面分支以 su-dock-panel 挂进本坞的面板舱；移动端 Sheet 分支
 * 经 Radix Portal 挂到 body，不受本坞 display:none 影响。
 */
export function SideDock({ children }: { children: React.ReactNode }) {
  const s = useGameStore();

  const groups: { label: string; items: RailItem[] }[] = [
    {
      label: '世界',
      items: [
        { key: 'kingdoms', label: '王国榜', hint: '王国排行 · 战争态势 · 外交图谱', icon: Crown, accent: A_WORLD, active: s.showKingdoms, toggle: s.toggleKingdoms },
        { key: 'eco', label: '生态与进化', hint: '物种基因漂移与承载链', icon: Leaf, accent: A_WORLD, active: s.showEco, toggle: s.toggleEco },
        { key: 'nature', label: '自然引擎', hint: '板块构造 · 四季轮转 · 大气环流', icon: MountainSnow, accent: A_WORLD, active: s.showNature, toggle: s.toggleNature },
        { key: 'race', label: '种族图鉴', hint: '种族名录 · 性格八维 · 关系矩阵', icon: UsersRound, accent: A_WORLD, active: s.showRace, toggle: s.toggleRace },
      ],
    },
    {
      label: '智慧',
      items: [
        { key: 'evo', label: '涌现进化图谱', hint: '物种 / 武器 / 科技 / 特质 / 理念谱系', icon: GitBranch, accent: A_MIND, active: s.showEvo, toggle: s.toggleEvo },
        { key: 'societal', label: '社会涌现', hint: '恐慌传染 · 血仇网络 · 家族谱系', icon: Network, accent: A_MIND, active: s.showSocietal, toggle: s.toggleSocietal },
        { key: 'neuro', label: '神经决策核心', hint: '465 参数微型网络实时仪表', icon: BrainCircuit, accent: A_MIND, active: s.showNeuro, toggle: s.toggleNeuro },
      ],
    },
    {
      label: '玩家',
      items: [
        { key: 'oracle', label: '神谕 AI', hint: '全知大模型：纪事 / 研判 / 预言 / 问答', icon: Sparkles, accent: A_PLAYER, active: s.showOracle, toggle: s.toggleOracle },
        { key: 'council', label: '统治者议会', hint: 'AI 决策层：四席研判世界·意图→仲裁→执行→回读', icon: Gavel, accent: A_PLAYER, active: s.showCouncil, toggle: s.toggleCouncil },
        { key: 'codex', label: '造物图鉴', hint: '永久图书馆 · 编辑 · 唤醒神谕', icon: BookOpen, accent: A_PLAYER, active: s.showCodex, toggle: s.toggleCodex },
        { key: 'triggers', label: '事件触发器', hint: '像素级定制自动事件', icon: Zap, accent: A_PLAYER, active: s.showTriggers, toggle: s.toggleTriggers },
        { key: 'ach', label: '成就殿堂', hint: '跨世界永久成就墙', icon: Trophy, accent: A_PLAYER, active: s.showAch, toggle: s.toggleAch },
        { key: 'chronicle', label: '世界纪事', hint: '事件流编年史与分类过滤', icon: ScrollText, accent: A_PLAYER, active: s.showChronicle, toggle: s.toggleChronicle },
      ],
    },
  ];

  // 面板舱可见性 = 坞内面板（纪事/触发器/图鉴是独立浮层，不算坞舱）
  const dockOpen =
    s.showKingdoms || s.showEco || s.showNature || s.showRace ||
    s.showEvo || s.showSocietal || s.showNeuro || s.showOracle ||
    s.showAch || s.showDev || s.showCouncil;

  return (
    <div className="pointer-events-none absolute left-2 top-[60px] z-30 hidden sm:block">
      <div className="su-dock-shell su-slide-l pointer-events-auto">
        <nav className="su-dock-rail" aria-label="面板导航栏">
          {groups.map((g, gi) => (
            <div key={g.label} className="flex flex-col gap-0.5" role="group" aria-label={`${g.label}面板`}>
              {gi > 0 && <span className="su-vline mx-auto !my-1" aria-hidden />}
              {g.items.map((it) => (
                <Tooltip key={it.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={it.toggle}
                      aria-pressed={it.active}
                      aria-label={it.label}
                      className="su-dock-rail-item"
                      data-active={it.active}
                      style={it.active ? { color: it.accent } : undefined}
                    >
                      <it.icon className="h-[17px] w-[17px]" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="border border-[rgba(214,178,120,0.26)] bg-[#1d1712]/95 text-xs text-[#f1e8d6]">
                    <p className="font-semibold">{it.label}</p>
                    <p className="text-[10px] text-[#a2957c]">{it.hint}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          ))}
        </nav>
        {/* 面板舱：display:none 切换（React 树常驻，Sheet 不受影响） */}
        <div className="su-dock-zone" data-open={dockOpen} aria-hidden={!dockOpen}>
          {children}
        </div>
      </div>
    </div>
  );
}
