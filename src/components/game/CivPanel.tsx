'use client';
// ============ CivPanel: 文明详情面板（科技树可视化 + 社会体系四维） ============
// 数据源：engine.getCivInfo 轮询（含 techs/research/gov/stability/culture/militarism/income/expense）
// 布局：桌面右侧固定面板 / 移动端底部抽屉 —— 三个页签：概览 · 科技树 · 社会
import { useEffect, useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { RACES, BUILDING_DEFS } from '@/lib/game/types';
import { TECHS, TECH_BY_KEY, TECH_CATS, ERAS, GOV_DEFS } from '@/lib/game/tech';
import type { TechCat } from '@/lib/game/tech';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  X, Crown, Users, Landmark, Home, Coins, BookOpen, Swords, Crosshair, FlaskConical,
  Lightbulb, Lock, Check, ChevronRight, Scale, Coins as CoinsIcon, Palette, Shield,
  TrendingUp, TrendingDown, Sparkles, PartyPopper, Scroll, Castle, TriangleAlert, Sword,
} from 'lucide-react';

interface CivInfo {
  id: number;
  name: string;
  raceName: string;
  colorHex: string;
  pop: number;
  tiles: number;
  houses: number;
  houseCap: number;
  kingName: string;
  gold: number;
  knowledge: number;
  army: number;
  builds: { kind: number; n: number }[];
  wars: string[];
  capitalPos: { x: number; y: number } | null;
  techs: string[];
  techCount: number;
  research: string | null;
  researchP: number;
  researchNeed: number;
  gov: number;
  govName: string;
  govDesc: string;
  govBonus: string;
  govYear: number;
  stability: number;
  culture: number;
  militarism: number;
  income: number;
  expense: number;
  // —— 军备/房屋阶位（科技深度绑定）——
  armament: number;
  armamentName: string;
  /** 持械率：全国国民持有制式武器的比例（军备时代的真实兑现度） */
  armedRate: number;
  /** 已采纳的涌现理念名列表（文化结晶） */
  ideas: string[];
  houseTier: number;
  houseTierName: string;
}

interface EngineWindow extends Window {
  __wbEngine?: {
    getCivInfo(id: number): CivInfo | null;
    jumpTo(x: number, y: number): void;
  };
}

function getEng() {
  return (window as EngineWindow).__wbEngine ?? null;
}

type Tab = 'overview' | 'tech' | 'society';

/** 稳定度 → 颜色分档 */
function stabTone(v: number) {
  if (v >= 70) return { bar: 'bg-emerald-400', text: 'text-emerald-300', label: '繁荣安定' };
  if (v >= 45) return { bar: 'bg-lime-400', text: 'text-lime-300', label: '尚且安稳' };
  if (v >= 25) return { bar: 'bg-amber-400', text: 'text-amber-300', label: '动荡不安' };
  return { bar: 'bg-red-500', text: 'text-red-400', label: '风雨飘摇' };
}

/** 军国主义 → 描述 */
function milLabel(v: number) {
  if (v >= 75) return '战争狂热';
  if (v >= 55) return '崇尚武力';
  if (v >= 35) return '居安思危';
  if (v >= 18) return '厌战平和';
  return '不设武备';
}

/** 水平数值条（0-100 / 自定义 max） */
function StatBar({ value, max, tone, height }: { value: number; max: number; tone: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden border border-zinc-700 bg-zinc-800" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max}>
      <div className={`${tone} transition-[width] duration-500`} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, height: height ?? 8 }} />
    </div>
  );
}

/** 科技卡：状态（已研/在研/可研/锁定）+ 成本 + 效果 + 依赖 */
function TechCard({ techKey, owned, research, progress }: { techKey: string; owned: boolean; research: boolean; progress: number }) {
  const def = TECH_BY_KEY[techKey];
  if (!def) return null;
  const cat = TECH_CATS.find((c) => c.key === def.cat);
  const state = owned ? 'done' : research ? 'active' : 'lock';
  return (
    <div
      className={`rounded-sm border-2 px-1.5 py-1 ${
        state === 'done'
          ? 'border-emerald-700/70 bg-emerald-950/40'
          : state === 'active'
            ? 'border-amber-500/80 bg-amber-950/30 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]'
            : 'border-zinc-700/70 bg-zinc-900/70'
      }`}
    >
      <div className="flex items-center gap-1">
        <span className="h-2 w-2 shrink-0 border border-black/40" style={{ backgroundColor: cat?.dot }} aria-hidden />
        <span className={`truncate text-[10px] font-bold ${state === 'done' ? 'text-emerald-300' : state === 'active' ? 'text-amber-200' : 'text-zinc-400'}`}>
          {def.name}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-0.5 font-mono text-[8px] text-zinc-500" title={`研究成本 ${def.cost} 知识`}>
          <BookOpen className="h-2.5 w-2.5" aria-hidden />
          {def.cost}
        </span>
        {state === 'done' && <Check className="h-3 w-3 shrink-0 text-emerald-400" aria-hidden />}
        {state === 'lock' && <Lock className="h-2.5 w-2.5 shrink-0 text-zinc-600" aria-hidden />}
      </div>
      <p className="mt-0.5 line-clamp-2 text-[8px] leading-tight text-zinc-500">{def.desc}</p>
      {state === 'active' && (
        <div className="mt-1">
          <div className="mb-0.5 flex justify-between font-mono text-[8px] text-amber-300/90">
            <span>研究中</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <StatBar value={progress * 100} max={100} tone="bg-amber-400" height={4} />
        </div>
      )}
      {state === 'lock' && def.deps.length > 0 && (
        <p className="mt-0.5 truncate text-[8px] text-zinc-600" title={`前置：${def.deps.join('、')}`}>
          需 {def.deps.map((d) => TECH_BY_KEY[d]?.name ?? d).join('·')}
        </p>
      )}
    </div>
  );
}

/** 科技树页：研究领域头卡 + 分类过滤 + 4 纪元分区 */
function TechTab({ civ }: { civ: CivInfo }) {
  const [cat, setCat] = useState<TechCat | 'all'>('all');
  const owned = useMemo(() => new Set(civ.techs), [civ.techs]);
  const research = civ.research;
  const progress = research && civ.researchNeed > 0 ? Math.min(1, civ.researchP / civ.researchNeed) : 0;
  const researching = research ? TECH_BY_KEY[research] : null;
  const list = useMemo(() => (cat === 'all' ? TECHS : TECHS.filter((t) => t.cat === cat)), [cat]);
  // 纪元进度：已研科技落入各纪元的数量
  const eraDone = ERAS.map((_, i) => TECHS.filter((t) => t.era === i && owned.has(t.key)).length);
  const eraTotal = ERAS.map((_, i) => TECHS.filter((t) => t.era === i).length);

  return (
    <div className="flex flex-col gap-2">
      {/* 当前研究 */}
      <div className="rounded-sm border-2 border-amber-600/60 bg-gradient-to-b from-amber-950/50 to-zinc-900/80 px-2 py-2">
        {researching ? (
          <>
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
              <FlaskConical className="h-3.5 w-3.5 shrink-0 animate-pulse" aria-hidden />
              <span className="truncate">正在研究：{researching.name}</span>
            </p>
            <p className="mt-0.5 text-[9px] leading-tight text-zinc-400">{researching.desc}</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <StatBar value={progress * 100} max={100} tone="bg-amber-400" height={10} />
              <span className="shrink-0 font-mono text-[9px] font-bold text-amber-300">{Math.round(progress * 100)}%</span>
            </div>
            <p className="mt-0.5 font-mono text-[8px] text-zinc-500">
              已投入 {Math.floor(civ.researchP)} / {researching.cost} 知识 · 尚需 {Math.max(0, researching.cost - Math.floor(civ.researchP))}
            </p>
          </>
        ) : (
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-400">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {civ.techCount >= TECHS.length ? '全科技树已点亮 —— 文明的巅峰' : '等待学者们选定下一个课题…'}
          </p>
        )}
      </div>

      {/* 分类过滤 */}
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="科技领域过滤">
        <button
          type="button"
          onClick={() => setCat('all')}
          aria-pressed={cat === 'all'}
          className={`border-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${cat === 'all' ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-zinc-700 bg-zinc-800/80 text-zinc-500 hover:text-zinc-300'}`}
        >
          全部 {civ.techCount}/{TECHS.length}
        </button>
        {TECH_CATS.map((c) => {
          const n = TECHS.filter((t) => t.cat === c.key && owned.has(t.key)).length;
          const tot = TECHS.filter((t) => t.cat === c.key).length;
          const active = cat === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setCat(c.key)}
              aria-pressed={active}
              className={`flex items-center gap-1 border-2 px-1.5 py-0.5 text-[9px] font-bold ${active ? 'border-zinc-300 bg-zinc-700 text-zinc-100' : 'border-zinc-700 bg-zinc-800/80 text-zinc-500 hover:text-zinc-300'}`}
            >
              <span className="h-2 w-2 border border-black/40" style={{ backgroundColor: c.dot }} aria-hidden />
              {c.name} {n}/{tot}
            </button>
          );
        })}
      </div>

      {/* 纪元分区 */}
      {ERAS.map((era, i) => {
        const techsOfEra = list.filter((t) => t.era === i);
        if (techsOfEra.length === 0) return null;
        return (
          <section key={era.name} className="rounded-sm border-2 border-zinc-800 bg-zinc-900/60">
            <header className="flex items-center gap-1.5 border-b-2 border-zinc-800 px-2 py-1">
              <span className={`text-[10px] font-bold uppercase tracking-widest ${era.color}`}>{era.name}</span>
              <span className="text-[8px] text-zinc-600">{era.sub}</span>
              <span className="ml-auto font-mono text-[8px] text-zinc-500">{eraDone[i]}/{eraTotal[i]}</span>
            </header>
            <div className="grid grid-cols-2 gap-1.5 p-1.5 lg:grid-cols-3">
              {techsOfEra.map((t) => (
                <TechCard key={t.key} techKey={t.key} owned={owned.has(t.key)} research={research === t.key} progress={progress} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** 社会页：政治 / 经济 / 文化 / 军事 四体系 */
function SocietyTab({ civ }: { civ: CivInfo }) {
  const govDef = GOV_DEFS[civ.gov] ?? GOV_DEFS[0];
  const builds = new Map(civ.builds.map((b) => [b.kind, b.n]));
  const net = civ.income - civ.expense;
  const st = stabTone(civ.stability);
  // 政体演进提示（下一档条件）
  const govHints: string[] = [];
  if (civ.gov < 1) govHints.push('人口 ≥ 25 → 君主制');
  if (civ.gov < 2) govHints.push('神殿 + 神学 + 文化 50 → 神权制');
  if (civ.gov < 3) govHints.push('人口 ≥ 60 + 成文法典 + 知识 40 → 共和制');
  if (civ.gov < 4) govHints.push('人口 ≥ 120 + 军国主义 ≥ 55 + 军团军制 → 帝国制');

  return (
    <div className="flex flex-col gap-2">
      {/* —— 政治 —— */}
      <section className="rounded-sm border-2 border-violet-800/60 bg-zinc-900/70">
        <header className="flex items-center gap-1.5 border-b-2 border-zinc-800 px-2 py-1">
          <Landmark className="h-3.5 w-3.5 text-violet-300" aria-hidden />
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-violet-200">政治 · 政体</h4>
        </header>
        <div className="px-2 py-1.5">
          <p className="flex items-center gap-1.5 text-[12px] font-bold text-zinc-100">
            <Castle className="h-4 w-4 shrink-0 text-violet-300" aria-hidden />
            {govDef.name}
            <span className="ml-auto font-mono text-[8px] font-normal text-zinc-500">{civ.govYear} 年确立</span>
          </p>
          <p className="mt-0.5 text-[9px] leading-tight text-zinc-400">{govDef.desc}</p>
          <p className="mt-1 rounded-sm border border-violet-800/50 bg-violet-950/30 px-1.5 py-0.5 text-[9px] font-bold text-violet-200">{govDef.bonus}</p>
          <div className="mt-2">
            <p className="mb-0.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              <span>稳定度</span>
              <span className={`font-mono ${st.text}`}>{civ.stability} · {st.label}</span>
            </p>
            <StatBar value={civ.stability} max={100} tone={st.bar} />
          </div>
          {govHints.length > 0 && (
            <div className="mt-1.5 border-t border-zinc-800 pt-1.5">
              <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">
                <ChevronRight className="h-2.5 w-2.5" aria-hidden />
                政体演进之路
              </p>
              {govHints.map((h) => (
                <p key={h} className="mt-0.5 truncate text-[9px] text-zinc-500" title={h}>{h}</p>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* —— 经济 —— */}
      <section className="rounded-sm border-2 border-yellow-800/60 bg-zinc-900/70">
        <header className="flex items-center gap-1.5 border-b-2 border-zinc-800 px-2 py-1">
          <CoinsIcon className="h-3.5 w-3.5 text-yellow-300" aria-hidden />
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-yellow-200">经济 · 国库</h4>
        </header>
        <div className="px-2 py-1.5">
          <p className="flex items-center gap-1 text-[11px] font-bold text-zinc-100">
            <Coins className="h-3.5 w-3.5 text-yellow-300" aria-hidden />
            国库 {civ.gold} 金
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px]">
            <span className="flex items-center gap-1 text-zinc-400">
              <TrendingUp className="h-2.5 w-2.5 text-emerald-400" aria-hidden />
              岁入 <b className="font-mono text-emerald-300">{civ.income}</b>
            </span>
            <span className="flex items-center gap-1 text-zinc-400">
              <TrendingDown className="h-2.5 w-2.5 text-red-400" aria-hidden />
              岁出 <b className="font-mono text-red-300">{civ.expense}</b>
            </span>
          </div>
          <div className="mt-1">
            <StatBar value={civ.income} max={Math.max(1, civ.income + civ.expense)} tone="bg-emerald-400" height={5} />
            <StatBar value={civ.expense} max={Math.max(1, civ.income + civ.expense)} tone="bg-red-500" height={5} />
          </div>
          <p className={`mt-1 font-mono text-[9px] font-bold ${net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            盈余 {net >= 0 ? '+' : ''}{Math.round(net * 10) / 10} 金 / 期
          </p>
          <p className="mt-1.5 text-[8px] leading-relaxed text-zinc-500">
            岁入来自税基与集市×{builds.get(9) ?? 0}、港口×{builds.get(7) ?? 0}、神殿×{builds.get(10) ?? 0}；
            岁出为军团军饷与城堡箭塔维护。国库见底时军团士气滑落。
          </p>
        </div>
      </section>

      {/* —— 文化 —— */}
      <section className="rounded-sm border-2 border-fuchsia-800/60 bg-zinc-900/70">
        <header className="flex items-center gap-1.5 border-b-2 border-zinc-800 px-2 py-1">
          <Palette className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden />
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-fuchsia-200">文化 · 风物</h4>
        </header>
        <div className="px-2 py-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-100">
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden />
            文化积淀 {civ.culture} 点
          </p>
          <p className="mt-1 text-[9px] leading-relaxed text-zinc-400">
            神殿×{builds.get(10) ?? 0} 与图书馆×{builds.get(8) ?? 0} 涵养文化；文化丰盈时举国庆典（
            <PartyPopper className="inline h-2.5 w-2.5 align-[-2px] text-amber-300" aria-hidden />
            稳定 +3），并反哺学术产出（上限 +50%）。
          </p>
          <p className="mt-1 text-[8px] text-zinc-500">学术反哺：知识产出 +{Math.min(50, Math.round(civ.culture * 0.2))}%</p>
        </div>
      </section>

      {/* —— 军事 —— */}
      <section className="rounded-sm border-2 border-red-800/60 bg-zinc-900/70">
        <header className="flex items-center gap-1.5 border-b-2 border-zinc-800 px-2 py-1">
          <Swords className="h-3.5 w-3.5 text-red-300" aria-hidden />
          <h4 className="text-[10px] font-bold uppercase tracking-widest text-red-200">军事 · 武备</h4>
        </header>
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-1 text-[11px] font-bold text-zinc-100">
            <Shield className="h-3.5 w-3.5 text-red-300" aria-hidden />
            常备军 {civ.army} 人
            {civ.wars.length > 0 && (
              <span className="ml-auto flex items-center gap-1 rounded-sm bg-red-500/20 px-1 py-0.5 text-[8px] font-bold text-red-300">
                <TriangleAlert className="h-2.5 w-2.5" aria-hidden />
                交战 {civ.wars.length}
              </span>
            )}
          </div>
          <div className="mt-1.5">
            <p className="mb-0.5 flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              <span>军国主义</span>
              <span className="font-mono text-red-300">{civ.militarism} · {milLabel(civ.militarism)}</span>
            </p>
            <StatBar value={civ.militarism} max={100} tone="bg-red-500" />
          </div>
          <p className="mt-1.5 text-[8px] leading-relaxed text-zinc-500">
            战争与胜利推高军国主义（宣战更频繁、军团更多）；和平岁月逐渐偃武。兵营×{builds.get(5) ?? 0} 持续训练战士。
          </p>
          {civ.wars.length > 0 && (
            <div className="mt-1 rounded-sm border border-red-900/60 bg-red-950/30 px-1.5 py-1">
              {civ.wars.map((w) => (
                <p key={w} className="truncate text-[9px] text-zinc-300">{w}</p>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/** 概览页 */
function OverviewTab({ civ, onJumpCapital }: { civ: CivInfo; onJumpCapital: () => void }) {
  const research = civ.research ? TECH_BY_KEY[civ.research] : null;
  const progress = research ? Math.min(1, civ.researchP / Math.max(1, civ.researchNeed)) : 0;
  const st = stabTone(civ.stability);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-sm border-2 border-zinc-800 bg-zinc-900/60 px-2 py-2 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1"><Users className="h-3 w-3 text-zinc-500" aria-hidden />人口 <b className="font-mono text-zinc-200">{civ.pop}</b><span className="text-zinc-600">/{civ.houseCap}</span></span>
        <span className="flex items-center gap-1"><Landmark className="h-3 w-3 text-zinc-500" aria-hidden />领土 <b className="font-mono text-zinc-200">{civ.tiles}</b></span>
        <span className="flex items-center gap-1"><Home className="h-3 w-3 text-zinc-500" aria-hidden />房屋 <b className="font-mono text-zinc-200">{civ.houses}</b></span>
        <span className="flex items-center gap-1"><Coins className="h-3 w-3 text-zinc-500" aria-hidden />国库 <b className="font-mono text-yellow-300">{civ.gold}</b></span>
        <span className="flex items-center gap-1"><BookOpen className="h-3 w-3 text-zinc-500" aria-hidden />知识 <b className="font-mono text-sky-300">{civ.knowledge}</b></span>
        <span className="flex items-center gap-1"><Swords className="h-3 w-3 text-zinc-500" aria-hidden />常备军 <b className="font-mono text-red-300">{civ.army}</b></span>
      </div>

      {/* 当前研究速览 */}
      <div className="rounded-sm border-2 border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
        <p className="flex items-center gap-1 text-[10px] font-bold text-zinc-300">
          <Lightbulb className="h-3 w-3 text-amber-300" aria-hidden />
          科技 {civ.techCount}/{TECHS.length}
        </p>
        {research ? (
          <div className="mt-1">
            <p className="truncate text-[9px] text-zinc-400">在研：{research.name}</p>
            <StatBar value={progress * 100} max={100} tone="bg-amber-400" height={5} />
          </div>
        ) : (
          <p className="mt-0.5 text-[9px] text-zinc-500">{civ.techCount >= TECHS.length ? '科技树已全点亮' : '暂无在研课题'}</p>
        )}
        {/* 军备与房居阶位（科技深度绑定的可视化） */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="flex items-center gap-0.5 rounded-sm border border-orange-700/70 bg-orange-500/10 px-1.5 py-0.5 text-[9px] font-bold text-orange-300">
            <Sword className="h-3 w-3" aria-hidden />
            {civ.armamentName}
          </span>
          {civ.armament >= 1 && (
            <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-500" title="军械库随科技自动武装国民（国库出资，军备档位越高产能越大）">
              持械率 <b className={civ.armedRate >= 60 ? 'text-emerald-300' : civ.armedRate >= 30 ? 'text-amber-300' : 'text-zinc-400'}>{civ.armedRate}%</b>
            </span>
          )}
          <span className="flex items-center gap-0.5 rounded-sm border border-stone-600 bg-stone-500/10 px-1.5 py-0.5 text-[9px] font-bold text-stone-300">
            <Home className="h-3 w-3" aria-hidden />
            {civ.houseTierName}
          </span>
        </div>
        {/* 已采纳的涌现理念（文化结晶——真实影响经济/稳定/军国/厌战六轴） */}
        {civ.ideas.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Sparkles className="h-3 w-3 shrink-0 text-fuchsia-300" aria-hidden />
            {civ.ideas.map((nm) => (
              <span key={nm} className="rounded-sm border border-fuchsia-800/70 bg-fuchsia-500/10 px-1.5 py-0.5 text-[9px] font-bold text-fuchsia-300" title="涌现理念：文化丰盈时自然酝酿 / 异邦思想传入">
                {nm}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 社会速览 */}
      <div className="flex flex-col gap-1.5 rounded-sm border-2 border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
        <p className="flex items-center justify-between text-[9px] font-bold text-zinc-500">
          <span>政体</span>
          <span className="text-violet-300">{civ.govName}</span>
        </p>
        <p className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-zinc-500">
          <span>稳定度</span>
          <span className={`font-mono ${st.text}`}>{civ.stability}</span>
        </p>
        <StatBar value={civ.stability} max={100} tone={st.bar} height={5} />
        <p className="mb-0.5 flex items-center justify-between text-[9px] font-bold text-zinc-500">
          <span>军国主义</span>
          <span className="font-mono text-red-300">{civ.militarism}</span>
        </p>
        <StatBar value={civ.militarism} max={100} tone="bg-red-500" height={5} />
      </div>

      {/* 建筑 */}
      {civ.builds.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-sm border-2 border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
          {civ.builds.map((b) => (
            <span key={b.kind} className="rounded-sm border border-zinc-700 bg-zinc-800/70 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400">
              {BUILDING_DEFS[b.kind]?.name ?? '?'} ×{b.n}
            </span>
          ))}
        </div>
      )}

      {civ.capitalPos && (
        <Button
          variant="outline"
          size="sm"
          onClick={onJumpCapital}
          className="h-7 border-zinc-700 bg-zinc-800 px-2 text-[10px] font-bold uppercase text-zinc-300 hover:bg-zinc-700"
        >
          <Crosshair className="mr-1 h-3 w-3" aria-hidden />
          前往首都
        </Button>
      )}
    </div>
  );
}

/** 面板主体（桌面/移动共用）：页签 + 轮询数据 */
function CivPanelBody({ civId, onClose }: { civId: number; onClose: () => void }) {
  const { jumpTo } = useGameStore();
  const [civ, setCiv] = useState<CivInfo | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    const read = () => setCiv(getEng()?.getCivInfo(civId) ?? null);
    const first = window.setTimeout(read, 0);
    const timer = window.setInterval(read, 700);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [civId]);

  if (!civ) {
    return <p className="px-3 py-6 text-center text-[11px] text-zinc-600">这个王国已不存在于世上…</p>;
  }
  const race = Object.values(RACES).find((r) => r.name === civ.raceName);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 文明头卡 */}
      <div className="relative border-b-2 border-zinc-800 bg-zinc-900/95 px-2 py-2">
        <div className="flex items-center gap-2 pr-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-zinc-700 bg-zinc-800">
            <Crown className="h-5 w-5" style={{ color: civ.colorHex }} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-zinc-100">{civ.name}</p>
            <p className="truncate text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              {race?.name ?? civ.raceName}王国 · {civ.govName} · 国王 {civ.kingName}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="关闭文明面板"
            className="absolute right-1 top-1 h-6 w-6 text-zinc-500 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>

      {/* 页签 */}
      <div className="flex gap-1 border-b-2 border-zinc-800 bg-zinc-900/90 px-1.5 py-1" role="tablist" aria-label="文明详情页签">
        {([
          { key: 'overview', label: '概览', icon: Scroll },
          { key: 'tech', label: '科技树', icon: Lightbulb },
          { key: 'society', label: '社会', icon: Scale },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex h-6 flex-1 items-center justify-center gap-1 border-2 text-[10px] font-bold uppercase tracking-wide ${
              tab === key ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-zinc-700 bg-zinc-800/80 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* 内容区（内部滚动） */}
      <div className="game-scroll min-h-0 flex-1 overflow-y-auto bg-zinc-950/40 p-2">
        {tab === 'overview' && <OverviewTab civ={civ} onJumpCapital={() => civ.capitalPos && jumpTo(civ.capitalPos.x, civ.capitalPos.y)} />}
        {tab === 'tech' && <TechTab civ={civ} />}
        {tab === 'society' && <SocietyTab civ={civ} />}
      </div>
    </div>
  );
}

export function CivPanel() {
  const { civPanelCiv, openCivPanel, mobilePanel, openMobilePanel, showChronicle } = useGameStore();
  const isMobileSheet = mobilePanel === 'civ';
  const sheetCiv = isMobileSheet ? civPanelCiv ?? null : null;

  return (
    <>
      {/* 桌面右侧固定面板（移动端隐藏，由底部抽屉承载）；Task 67：贴右上角 top-64，高度动态让位（纪事开→停在其上方，关→停在工具条上方） */}
      {civPanelCiv != null && !isMobileSheet && (
        <div
          className={`pointer-events-auto absolute right-2 top-[60px] z-20 hidden w-72 flex-col border-2 border-zinc-700/90 bg-zinc-900/95 shadow-[0_4px_0_rgba(0,0,0,0.6)] sm:flex su-panel ${
            showChronicle ? 'max-h-[calc(100dvh-496px)]' : 'max-h-[calc(100dvh-192px)]'
          }`}
        >
          <CivPanelBody civId={civPanelCiv} onClose={() => openCivPanel(null)} />
        </div>
      )}
      {/* 移动端底部抽屉 */}
      <Sheet open={isMobileSheet && sheetCiv != null} onOpenChange={(o) => { if (!o) { openMobilePanel('none'); openCivPanel(null); } }}>
        <SheetContent side="bottom" className="flex h-[72dvh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <SheetHeader className="sr-only">
            <SheetTitle>文明详情</SheetTitle>
          </SheetHeader>
          {sheetCiv != null && <CivPanelBody civId={sheetCiv} onClose={() => { openMobilePanel('none'); openCivPanel(null); }} />}
        </SheetContent>
      </Sheet>
    </>
  );
}
