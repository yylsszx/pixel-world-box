'use client';
// ============ Kingdoms ranking panel: 王国排行榜（桌面左侧栏 + 移动端底部抽屉） ============
import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { RACES, CASUS_META } from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Crown, X, Users, Landmark, Home, Swords, Crosshair, ChartLine, Network, Coins, Flag, Skull, BookOpen, Target, HeartPulse, Bot, BrainCircuit, Handshake } from 'lucide-react';
import { CivHistoryChart } from './HistoryChart';
import { DiplomacyGraph } from './DiplomacyGraph';

type SortKey = 'pop' | 'tiles' | 'houses' | 'gold' | 'army';

const SORTS: { key: SortKey; label: string; icon: typeof Users }[] = [
  { key: 'pop', label: '人口', icon: Users },
  { key: 'tiles', label: '领土', icon: Landmark },
  { key: 'houses', label: '房屋', icon: Home },
  { key: 'gold', label: '财富', icon: Coins },
  { key: 'army', label: '军队', icon: Swords },
];

interface CivRow {
  id: number;
  name: string;
  race: number;
  colorHex: string;
  pop: number;
  tiles: number;
  houses: number;
  wars: string[];
  capital: { x: number; y: number } | null;
  gold?: number;
  knowledge?: number;
  army?: number;
  techCount?: number;
  govName?: string;
  allianceId?: number;
  allianceName?: string;
}

function KingdomRow({
  civ,
  sortKey,
  selected,
  onSelect,
  onOpenDetail,
  alColor,
}: {
  civ: CivRow;
  sortKey: SortKey;
  selected: boolean;
  onSelect: (c: CivRow) => void;
  onOpenDetail: (c: CivRow) => void;
  alColor?: string;
}) {
  const race = RACES[civ.race];
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(civ)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(civ); } }}
      aria-label={`查看王国 ${civ.name}`}
      className={`flex w-full cursor-pointer items-center gap-2 border-b border-zinc-800/80 px-2 py-1.5 text-left transition-colors last:border-b-0 ${
        selected ? 'bg-zinc-800/80 shadow-[inset_2px_0_0_#fbbf24]' : 'hover:bg-zinc-800/60'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 translate-y-[0.5px] border border-black/40"
            style={{ backgroundColor: civ.colorHex }}
            aria-hidden
          />
          <span className="truncate text-[11px] font-bold text-zinc-200">{civ.name}</span>
          {civ.allianceName && (
            <span
              className="flex shrink-0 items-center gap-0.5 rounded-sm border px-1 text-[8px] font-bold leading-[14px]"
              style={{
                borderColor: `${alColor ?? '#14b8a6'}66`,
                backgroundColor: `${alColor ?? '#14b8a6'}1f`,
                color: alColor ?? '#2dd4bf',
              }}
              title={`所属联盟：${civ.allianceName}（攻守同盟，荣辱与共）`}
            >
              <Flag className="h-2 w-2" aria-hidden />
              {civ.allianceName.length > 4 ? civ.allianceName.slice(0, 4) : civ.allianceName}
            </span>
          )}
          {civ.wars.length > 0 && (
            <span className="ml-auto flex shrink-0 items-center gap-0.5 text-[9px] font-bold text-red-400" title={`交战：${civ.wars.join('、')}`}>
              <Swords className="h-3 w-3" aria-hidden />
              {civ.wars.length}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] font-bold tabular-nums text-zinc-500">
          <span className="min-w-0 truncate text-zinc-400">{civ.govName ?? race?.name ?? '未知'}</span>
          <span className="flex shrink-0 items-center gap-0.5">
            <Users className="h-2.5 w-2.5" aria-hidden />
            {civ.pop}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <Landmark className="h-2.5 w-2.5" aria-hidden />
            {civ.tiles}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            <Home className="h-2.5 w-2.5" aria-hidden />
            {civ.houses}
          </span>
          {(civ.army ?? 0) > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-red-400/80">
              <Swords className="h-2.5 w-2.5" aria-hidden />
              {civ.army}
            </span>
          )}
          {(civ.gold ?? 0) > 0 && (
            <span className="flex shrink-0 items-center gap-0.5 text-yellow-400/80">
              <Coins className="h-2.5 w-2.5" aria-hidden />
              {civ.gold}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5">
        {(civ.techCount ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 font-mono text-[8px] font-bold text-emerald-400/90" title={`已研发 ${civ.techCount} 项科技`}>
            <BookOpen className="h-2.5 w-2.5" aria-hidden />
            {civ.techCount}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenDetail(civ); }}
          aria-label={`打开 ${civ.name} 的科技与社会详情`}
          title="科技树与社会详情"
          className="flex h-5 w-5 items-center justify-center rounded-sm border border-zinc-700 bg-zinc-800/80 text-zinc-400 transition-colors hover:border-amber-400 hover:text-amber-300"
        >
          <BookOpen className="h-3 w-3" aria-hidden />
        </button>
        <span className="font-mono text-[10px] font-bold tabular-nums text-amber-300/90">
          {sortKey === 'pop' ? civ.pop : sortKey === 'tiles' ? civ.tiles : sortKey === 'houses' ? civ.houses : sortKey === 'gold' ? civ.gold ?? 0 : civ.army ?? 0}
        </span>
      </span>
    </div>
  );
}

function KingdomsBody() {
  const { stats, selCiv, selectCiv, jumpTo, mobilePanel, openMobilePanel, openCivPanel } = useGameStore();
  const [sortKey, setSortKey] = useState<SortKey>('pop');
  const [showChart, setShowChart] = useState(false);
  const [showDiplo, setShowDiplo] = useState(false);
  const [showWars, setShowWars] = useState(false);
  const isMobileSheet = mobilePanel === 'kingdoms';
  const warList = stats?.warList ?? [];
  const armies = stats?.armies ?? [];

  const civs = useMemo(() => {
    const list = (stats?.civs ?? []) as CivRow[];
    return [...list].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number));
  }, [stats, sortKey]);

  // 联盟色卡：allianceId → 阵营色（徽章着色）
  const alColorMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const al of (stats?.alliances ?? []) as { id: number; colorHex: string }[]) m.set(al.id, al.colorHex);
    return m;
  }, [stats]);

  const handleSelect = (c: CivRow) => {
    selectCiv(c.id);
    if (c.capital) jumpTo(c.capital.x, c.capital.y);
    if (isMobileSheet) openMobilePanel('none'); // 移动端：选中即收起抽屉
  };

  const handleOpenDetail = (c: CivRow) => {
    selectCiv(c.id);
    openCivPanel(c.id);
    if (isMobileSheet) openMobilePanel('civ'); // 移动端：切到文明详情抽屉
  };

  return (
    <>
      {/* 排序切换 + 兴衰曲线/外交/战况开关 —— 两行布局（240px 面板容纳不下 8 键单行） */}
      <div className="border-b-2 border-zinc-800 px-1.5 py-1">
        {/* 第一行：排序维度（5 键，图标缩小 + 文字截断保护） */}
        <div className="flex items-center gap-1" role="group" aria-label="王国排序维度">
          {SORTS.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant="ghost"
              size="sm"
              onClick={() => setSortKey(key)}
              aria-pressed={sortKey === key}
              title={`按${label}排序`}
              className={`h-6 min-w-0 flex-1 gap-0.5 rounded-sm px-0.5 text-[10px] font-bold ${
                sortKey === key ? 'border-2 border-amber-400 bg-amber-400/15 text-amber-200' : 'border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
              }`}
            >
              <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />
              <span className="truncate">{label}</span>
            </Button>
          ))}
        </div>
        {/* 第二行：数据视图工具（战况/曲线/图谱） */}
        <div className="mt-1 flex items-center gap-1">
          <span className="shrink-0 pr-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-600" aria-hidden>
            视图
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowWars((v) => !v)}
            aria-pressed={showWars}
            aria-label="战况面板"
            title="战况：进行中战争（分数/伤亡）与现役军团"
            className={`h-6 flex-1 justify-center rounded-sm px-0 ${
              showWars ? 'border-2 border-red-400 bg-red-400/15 text-red-200' : 'border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            <Flag className="h-3 w-3" aria-hidden />
            <span className="text-[9px]">战况</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowChart((v) => !v)}
            aria-pressed={showChart}
            aria-label="王国兴衰曲线"
            title="王国兴衰曲线（每 5 年采样的人口曲线）"
            className={`h-6 flex-1 justify-center rounded-sm px-0 ${
              showChart ? 'border-2 border-teal-400 bg-teal-400/15 text-teal-200' : 'border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            <ChartLine className="h-3 w-3" aria-hidden />
            <span className="text-[9px]">曲线</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDiplo((v) => !v)}
            aria-pressed={showDiplo}
            aria-label="王国外交图谱"
            title="王国外交图谱（战争红/友好绿连线）"
            className={`h-6 flex-1 justify-center rounded-sm px-0 ${
              showDiplo ? 'border-2 border-rose-400 bg-rose-400/15 text-rose-200' : 'border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'
            }`}
          >
            <Network className="h-3 w-3" aria-hidden />
            <span className="text-[9px]">图谱</span>
          </Button>
        </div>
      </div>

      {/* 战况面板（可折叠）：战争详情 + 现役军团 */}
      {showWars && (
        <div className="game-scroll max-h-56 overflow-y-auto border-b-2 border-zinc-800 px-2 py-1.5">
          {warList.length === 0 && armies.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-3">
              <Handshake className="h-7 w-7 text-zinc-700" aria-hidden />
              <p className="text-center text-[10px] leading-relaxed text-zinc-500">
                天下太平 — 无进行中战争与军团<br />
                <span className="text-zinc-600">邻国相接、仇恨积深，或由神谕与开发者而燃战火</span>
              </p>
            </div>
          ) : (
            <>
              {warList.map((w, i) => {
                const goalPct = w.goal > 0
                  ? Math.min(100, Math.round((w.goalNow / Math.max(1, w.goal)) * 100))
                  : Math.min(100, Math.max(0, w.goalNow));
                const sust = (s: number) => (s < 25 ? 'bg-red-500' : s < 45 ? 'bg-orange-400' : 'bg-emerald-400');
                return (
                  <div key={`war-${i}`} className="mb-1.5 rounded-sm border border-zinc-800 bg-zinc-900/80 px-1.5 py-1" title={w.reasonText || undefined}>
                    <p className="flex items-center gap-1 text-[10px] font-bold">
                      <span className="min-w-0 truncate" style={{ color: w.colorA }}>{w.aggressor === w.a ? '▸' : ''}{w.nameA}</span>
                      <Swords className="h-2.5 w-2.5 shrink-0 text-red-400" aria-hidden />
                      <span className="min-w-0 truncate" style={{ color: w.colorB }}>{w.aggressor === w.b ? '▸' : ''}{w.nameB}</span>
                      {w.total && w.reason !== 'annex' && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-sm bg-red-500/20 px-1 text-[8px] font-bold text-red-300">
                          <Skull className="h-2.5 w-2.5" aria-hidden />
                          灭国战
                        </span>
                      )}
                      {!w.total && <span className="shrink-0 font-mono text-[9px] text-zinc-500">{w.years} 年</span>}
                      <span
                        className={`ml-auto flex shrink-0 items-center rounded-sm border px-1 text-[8px] font-bold ${CASUS_META[w.reason]?.badge ?? 'border-zinc-600 bg-zinc-700/40 text-zinc-300'}`}
                        aria-label={`开战理由：${w.reasonLabel}`}
                      >
                        {w.reasonLabel}
                      </span>
                    </p>
                    {/* 战争目的进度（目的达成即停战） */}
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-[8px] text-zinc-500">
                      <Target className="h-2 w-2 shrink-0 text-amber-400/80" aria-hidden />
                      <span className="shrink-0">{w.goalLabel}</span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="h-full bg-amber-400/80" style={{ width: `${goalPct}%` }} />
                      </div>
                      <span className="shrink-0 text-amber-300/90">{w.goal > 0 ? `${Math.min(w.goalNow, w.goal)}/${w.goal}` : `${goalPct}%`}</span>
                    </div>
                    {/* 双方战争承受力（跌破 25 即无力支撑 → 被迫停战） */}
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-[8px] text-zinc-500">
                      <HeartPulse className="h-2 w-2 shrink-0 text-zinc-500" aria-hidden />
                      <span className="shrink-0" title="A 侧战争承受力（伤亡/烽火/战局折损）">{w.sustainA}</span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800" aria-label="双方战争承受力">
                        <div className={`h-full ${sust(w.sustainA)}`} style={{ width: `${Math.min(100, w.sustainA)}%` }} />
                      </div>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                        <div className={`h-full ${sust(w.sustainB)}`} style={{ width: `${Math.min(100, w.sustainB)}%` }} />
                      </div>
                      <span className="shrink-0" title={`B 侧承受力`}>{w.sustainB}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-[9px] text-zinc-400">
                      <span className="text-amber-300">{w.scoreA}</span>
                      <div className="flex h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                        <div className="h-full" style={{ width: `${(w.scoreA / Math.max(1, w.scoreA + w.scoreB)) * 100}%`, backgroundColor: w.colorA }} />
                        <div className="h-full" style={{ width: `${(w.scoreB / Math.max(1, w.scoreA + w.scoreB)) * 100}%`, backgroundColor: w.colorB }} />
                      </div>
                      <span className="text-amber-300">{w.scoreB}</span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[8px] text-zinc-600">
                      <span>伤亡 {w.casA} ↔ {w.casB}</span>
                      <span className="text-orange-400/70" title="双方拆毁建筑数">拆屋 {w.razedA ?? 0} ↔ {w.razedB ?? 0}</span>
                    </p>
                  </div>
                );
              })}
              {armies.map((a) => {
                // 士气色阶：≥70 昂扬 / 40-70 稳住 / <40 动摇（与引擎溃退阈值呼应）
                const mColor = a.morale >= 70 ? 'bg-emerald-400' : a.morale >= 40 ? 'bg-amber-400' : 'bg-red-400';
                const lossesPct = a.size0 > 0 ? Math.min(100, Math.round((a.losses / a.size0) * 100)) : 0;
                return (
                <button
                  key={`army-${a.id}`}
                  type="button"
                  onClick={() => jumpTo(a.x, a.y)}
                  className="mb-1 w-full rounded-sm border border-zinc-800 bg-zinc-900/80 px-1.5 py-1 text-left hover:bg-zinc-800"
                  aria-label={`跳转到军团 ${a.name}，士气 ${a.morale}，${a.size} 人`}
                >
                  <p className="flex items-center gap-1">
                    <Flag className="h-3 w-3 shrink-0 text-amber-400" aria-hidden />
                    <span className="truncate text-[10px] font-bold text-zinc-200">{a.name}</span>
                    <span className="shrink-0 font-mono text-[9px] text-zinc-500">{a.size}人</span>
                    {a.mech && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-sm bg-yellow-500/15 px-0.5 text-[8px] font-bold text-yellow-300" title="军团机械化（机器人学）：行军加速 · 会战强化">
                        <Bot className="h-2 w-2" aria-hidden />机甲
                      </span>
                    )}
                    {a.ai && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-sm bg-cyan-500/15 px-0.5 text-[8px] font-bold text-cyan-300" title="战术 AI（奇点智能）：会战评估 · 主动驰援 · 战术撤退">
                        <BrainCircuit className="h-2 w-2" aria-hidden />AI
                      </span>
                    )}
                    <span
                      className={`ml-auto shrink-0 rounded-sm px-1 text-[8px] font-bold ${
                        a.state === 'battle' ? 'bg-red-500/20 text-red-300' : a.state === 'retreat' ? 'bg-zinc-700 text-zinc-400' : a.state === 'siege' ? 'bg-orange-500/20 text-orange-300' : 'bg-sky-500/20 text-sky-300'
                      }`}
                    >
                      {{ rally: '集结', march: '行军', battle: '会战', siege: '围城', retreat: '溃退' }[a.state] ?? a.state}
                    </span>
                  </p>
                  {/* 士气条（作战行为系统核心指标：崩至低位 → 溃退） */}
                  <span className="mt-0.5 flex items-center gap-1 font-mono text-[8px] text-zinc-500" title={`军团士气 ${a.morale}/100`}>
                    <HeartPulse className="h-2 w-2 shrink-0" aria-hidden />
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-valuenow={a.morale} aria-valuemin={0} aria-valuemax={100} aria-label="军团士气">
                      <span className={`block h-full ${mColor}`} style={{ width: `${Math.max(2, Math.min(100, a.morale))}%` }} />
                    </span>
                    <span className="shrink-0 tabular-nums">{a.morale}</span>
                  </span>
                  {/* 战绩行：击杀 / 战损（集结以来折损） */}
                  {(a.kills > 0 || a.losses > 0) && (
                    <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[8px] text-zinc-600">
                      <span className="flex items-center gap-0.5 text-red-400/80" title="军团累计击杀"><Skull className="h-2 w-2" aria-hidden />{a.kills}</span>
                      <span className="h-1 w-6 overflow-hidden rounded-full bg-zinc-800" title={`战损 ${a.losses}/${a.size0}（${lossesPct}%）`}>
                        <span className="block h-full bg-red-400/60" style={{ width: `${lossesPct}%` }} />
                      </span>
                      <span title="军团累计战损（占集结规模比例）">损 {a.losses}{a.size0 > 0 ? `/${a.size0}` : ''}</span>
                    </span>
                  )}
                </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* 外交图谱（可折叠） */}
      {showDiplo && <DiplomacyGraph />}

      {/* 兴衰历史曲线（可折叠） */}
      {showChart && <CivHistoryChart />}

      {/* 榜单 */}
      <div className="game-scroll max-h-[38vh] overflow-y-auto sm:max-h-[40vh]">
        {civs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6">
            <span className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
              <Crown className="h-6 w-6 text-zinc-700" aria-hidden />
            </span>
            <p className="text-center text-[11px] leading-relaxed text-zinc-500">
              还没有王国——从工具栏放置一个智慧种族，<br />看他们建立文明
            </p>
            <p className="font-mono text-[9px] text-zinc-700">人类 · 精灵 · 矮人 · 兽人 · 蜥蜴人 · 哥布林</p>
          </div>
        ) : (
          civs.map((c) => (
            <KingdomRow
              key={c.id}
              civ={c}
              sortKey={sortKey}
              selected={selCiv === c.id}
              onSelect={handleSelect}
              onOpenDetail={handleOpenDetail}
              alColor={c.allianceId != null && c.allianceId >= 0 ? alColorMap.get(c.allianceId) : undefined}
            />
          ))
        )}
      </div>

      {/* 联盟阵营概览：凝聚力条 + 成员旗 + 共战次数 */}
      {(stats?.alliances ?? []).length > 0 && (
        <div className="border-t-2 border-zinc-800 px-1.5 py-1.5">
          <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-teal-300">
            <Network className="h-2.5 w-2.5" aria-hidden />
            联盟阵营 · {(stats?.alliances ?? []).length}
          </p>
          <ul className="flex flex-col gap-1">
            {(stats?.alliances ?? []).map((al) => (
              <li
                key={al.id}
                className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-1.5 py-1"
                title={`${al.name}：${al.members.map((m) => m.name).join('、')}（成立于第 ${al.formedYear} 年，共同作战 ${al.warsTogether} 次）`}
              >
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 shrink-0 border border-black/40" style={{ backgroundColor: al.colorHex }} aria-hidden />
                  <span className="truncate text-[10px] font-bold" style={{ color: al.colorHex }}>{al.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-[9px] text-zinc-500">{al.members.length} 国</span>
                  {al.warsTogether > 0 && (
                    <span className="flex shrink-0 items-center gap-0.5 text-[9px] font-bold text-red-400/90">
                      <Swords className="h-2.5 w-2.5" aria-hidden />
                      {al.warsTogether}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-1">
                  <span className="w-[26px] shrink-0 text-[8px] text-zinc-600">凝聚</span>
                  <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${Math.max(4, al.cohesion)}%`, background: al.cohesion >= 60 ? '#2dd4bf' : al.cohesion >= 30 ? '#fbbf24' : '#f87171' }}
                    />
                  </span>
                  <span className="w-[22px] shrink-0 text-right font-mono text-[8px] text-zinc-500">{al.cohesion}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {civs.length > 0 && (
        <p className="flex items-center gap-1 border-t border-zinc-800 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
          <Crosshair className="h-2.5 w-2.5" aria-hidden />
          点击王国查看详情并跳转首都
        </p>
      )}
    </>
  );
}

export function KingdomsPanel() {
  const { stats, showKingdoms, toggleKingdoms, mobilePanel, openMobilePanel } = useGameStore();
  const count = stats?.civs.length ?? 0;

  return (
    <>
      {/* 桌面左侧栏 —— 仅顶栏王国榜按钮触发时出现，主界面无常驻折叠条 */}
      {showKingdoms && (
        <div className="su-dock-panel w-60 flex-col overflow-y-auto game-scroll">
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <Crown className="h-3.5 w-3.5 text-amber-300" aria-hidden />
              王国榜
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[10px] font-bold text-zinc-500">{count}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleKingdoms}
                aria-label="关闭王国榜面板"
                className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </span>
          </div>
          <div className="border-2 border-zinc-700/90 bg-zinc-900/95">
            <KingdomsBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'kingdoms'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="h-[44vh] rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <Crown className="h-4 w-4 text-amber-300" aria-hidden />
              王国榜
              <span className="ml-auto font-mono text-[10px] font-bold text-zinc-500">{count}</span>
            </SheetTitle>
          </SheetHeader>
          <KingdomsBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
