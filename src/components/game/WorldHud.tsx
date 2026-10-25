'use client';
// ============ World HUD（左下角统计柱）：纪元/季节/人口/各物种人口 三合一 ============
// Task 66 原版还原（用户原版截图 Screenshot_20261018-165952 精确测量）：
// - 竖列顺序：统计柱在【上】、小地图在【下】（小地图贴左下角，统计柱叠其上方）
// - 左缘 left-4（16px），宽 w-[172px]（与小地图外框 160+8+4 完全同宽 → 整齐竖列）
// - 位置固定 bottom-[130px]（小地图 bottom-2 + 外框高 112 + 隙 10）
// - 内容（原版行式布局，每行图标金色+白字）：
//     行1：时钟 + 「纪元 X 年」+ 右端方形折叠钮（ChevronDown）
//     行2：季节图标 + 季节名（四色）+ 风暴/火山灰警示（活跃才显示）
//     行3：人口图标 + 总人口 + 战争/殖民船/火情指示（>0 才显示）
//     分隔线 + 野生动物胶囊（圆角描边、灰字）
// - 折叠钮展开种族明细（默认收起 = 原版截图形态）
import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { RACES } from '@/lib/game/types';
import { RACE_DOT } from '@/lib/game/constants';
import { Clock, Users, Swords, Tornado, CloudRain, Flower2, Sun, Leaf, CloudSnow, PawPrint, Sailboat, Flame, ChevronDown } from 'lucide-react';

const CIV_KEYS = ['human', 'elf', 'dwarf', 'orc'];

/** 季节图标 + 配色（与自然引擎四态对齐；图标金色系，原版风格） */
function SeasonBadge({ season, name }: { season: number; name: string }) {
  const cls =
    season === 3 ? 'text-cyan-200' : season === 0 ? 'text-lime-200' : season === 2 ? 'text-orange-200' : 'text-yellow-200';
  const Icon = season === 0 ? Flower2 : season === 1 ? Sun : season === 2 ? Leaf : CloudSnow;
  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-bold tracking-wider ${cls}`} title={`自然引擎 · ${name}季`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {name}
    </span>
  );
}

export function WorldHud() {
  const stats = useGameStore((s) => s.stats);
  /** 种族明细折叠态（默认收起 = 原版截图形态；ChevronDown 展开四大文明明细） */
  const [expanded, setExpanded] = useState(false);

  if (!stats) return null;

  // —— 人口构成：四大文明 + 野生动物（从 RACES 派生，新物种自动纳入）——
  const raceEntries = Object.entries(stats.byRace).filter(([k]) => CIV_KEYS.includes(k));
  const wildTotal = Object.entries(stats.byRace).reduce((a, [k, v]) => {
    const def = Object.values(RACES).find((r) => r.key === k);
    return def && !def.isCiv ? a + v : a;
  }, 0);

  return (
    <div
      className="pointer-events-auto absolute left-2 top-[64px] z-10 flex w-[172px] flex-col rounded-sm border-2 border-zinc-700/90 bg-zinc-900/95 px-2 py-1.5 shadow-[0_3px_0_rgba(0,0,0,0.6)] sm:bottom-[130px] sm:left-4 sm:top-auto"
      role="status"
      aria-label="世界概览：纪元、季节与人口"
    >
      {/* 行1：纪元 + 折叠钮（方形小按钮，ChevronDown） */}
      <div className="flex items-center justify-between gap-1 py-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-zinc-200">
          <Clock className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          纪元 {stats.year} 年
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? '收起种族明细' : '展开种族明细'}
          title={expanded ? '收起种族明细' : '展开种族明细（四大文明人口）'}
          className="hidden h-5 w-5 shrink-0 items-center justify-center border border-zinc-700 bg-zinc-800/80 text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200 sm:flex"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>

      {/* 行2：季节 + 风暴/火山灰警示（活跃才显示） */}
      {stats.nature && (
        <div className="flex items-center justify-between gap-1 py-0.5">
          <SeasonBadge season={stats.nature.season} name={stats.nature.seasonName} />
          <span className="flex items-center gap-1.5">
            {stats.nature.storms.length > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-teal-300" title={`活跃风暴：${stats.nature.storms.map((st) => st.name).join('、')}`}>
                <Tornado className="h-3 w-3" aria-hidden />
                {stats.nature.storms.length}
              </span>
            )}
            {stats.nature.ash > 0.15 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-stone-300" title={`火山灰遮蔽 ${(stats.nature.ash * 100).toFixed(0)}% —— 无夏之年`}>
                <CloudRain className="h-3 w-3" aria-hidden />
                {(stats.nature.ash * 100).toFixed(0)}%
              </span>
            )}
          </span>
        </div>
      )}

      {/* 行3：总人口 + 战争/殖民船/火情（>0 才显示，原版信息量） */}
      <div className="flex items-center justify-between gap-1 py-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-zinc-200">
          <Users className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          {stats.totalPop}
        </span>
        <span className="flex items-center gap-1.5">
          {stats.warsCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-400" title="进行中的战争">
              <Swords className="h-3 w-3" aria-hidden />
              {stats.warsCount}
            </span>
          )}
          {stats.boats > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-teal-300" title="航行中的殖民船">
              <Sailboat className="h-3 w-3" aria-hidden />
              {stats.boats}
            </span>
          )}
          {stats.fires > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-400" title="燃烧中的地块">
              <Flame className="h-3 w-3" aria-hidden />
              {stats.fires}
            </span>
          )}
        </span>
      </div>

      {/* 分隔线 */}
      <div className="my-1 h-px bg-zinc-800" aria-hidden />

      {/* 野生动物胶囊（原版形态：圆角描边 + 灰字居中） */}
      {wildTotal > 0 && (
        <span className="mb-0.5 flex items-center justify-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-800/70 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
          <PawPrint className="h-3 w-3" aria-hidden />
          野生动物 {wildTotal}
        </span>
      )}

      {/* 种族明细（折叠钮展开；四大文明 + 动态种按人口展示；移动端隐藏——明细走种族图鉴抽屉，保证横幅让位几何稳定） */}
      {expanded && (
        <div className="hidden flex-col gap-0.5 py-0.5 sm:flex">
          {raceEntries.map(([k, v]) => {
            const race = Object.values(RACES).find((r) => r.key === k);
            if (!race || v === 0) return null;
            return (
              <span key={k} className="flex items-center justify-between gap-1 text-[10px] font-bold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 border border-black/40" style={{ backgroundColor: RACE_DOT[k] }} aria-hidden />
                  {race.name}
                </span>
                <span className="font-mono text-zinc-400">{v}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
