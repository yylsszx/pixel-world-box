'use client';
// ============ Race Panel: 种族图鉴（桌面左侧栏 + 移动端底部抽屉） ============
// 种族系统 v2：六大文明种族 + 无限种化动态物种的完整名录 ——
// 种族关系矩阵（世仇/盟好的外交底色）/ 性格八维（外交·好战·贪婪·虔诚·勤勉·奥术·繁衍·包容）/
// 原型速写 / 夜视标记 / 灭绝墓碑 / 王国归属统计
import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Footprints, Users, X, Skull, Moon, Dna, Swords } from 'lucide-react';

/** 性格维度中文标签（顺序与 stats.races[].persona 字段一致） */
const PERSONA_KEYS: { key: keyof NonNullable<RaceRow['persona']>; label: string; color: string }[] = [
  { key: 'diplo', label: '外交', color: '#5fe8ff' },
  { key: 'aggr', label: '好战', color: '#ff6b6b' },
  { key: 'greed', label: '贪婪', color: '#ffd93d' },
  { key: 'piety', label: '虔诚', color: '#c4b5fd' },
  { key: 'industry', label: '勤勉', color: '#fbbf24' },
  { key: 'arcane', label: '奥术', color: '#6fd66f' },
  { key: 'growth', label: '繁衍', color: '#f472b6' },
  { key: 'harmony', label: '包容', color: '#34d399' },
];

type RaceRow = {
  id: number;
  key: string;
  name: string;
  isCiv: boolean;
  pop: number;
  kingdoms: number;
  archetype: string;
  persona: { diplo: number; aggr: number; greed: number; piety: number; industry: number; arcane: number; growth: number; harmony: number } | null;
  nightsight: boolean;
  dynamic: boolean;
  parentName: string | null;
  extinct: boolean;
};

type Filter = 'civ' | 'wild' | 'dyn';

/** 关系值 → 矩阵格子底色（深红世仇 → 深绿盟好） */
function relColor(v: number): string {
  if (v >= 40) return 'bg-emerald-600/80';
  if (v >= 15) return 'bg-emerald-700/45';
  if (v > -15) return 'bg-zinc-800';
  if (v > -40) return 'bg-red-900/60';
  return 'bg-red-700/80';
}

function relTag(v: number): string {
  if (v <= -40) return '世仇';
  if (v < -15) return '敌意';
  if (v < 15) return '中性';
  if (v < 40) return '友善';
  return '盟好';
}

/** 单张种族卡：名称/人口/王国数 + 原型 + 性格条 + 标记 */
function RaceCard({ r }: { r: RaceRow }) {
  return (
    <li className={`rounded-sm border p-2 ${r.extinct ? 'border-zinc-800 bg-zinc-900/40 opacity-60' : r.isCiv ? 'border-zinc-700/80 bg-zinc-900/70' : 'border-zinc-800/60 bg-zinc-900/40'}`}>
      <div className="flex items-baseline justify-between gap-1">
        <span className="flex min-w-0 items-center gap-1">
          <span className={`truncate text-[11px] font-bold ${r.extinct ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}>{r.name}</span>
          {r.nightsight && (
            <span className="shrink-0 rounded-sm border border-indigo-400/40 bg-indigo-950/50 px-1 text-[8px] font-bold text-indigo-300" title="黑暗视觉：夜战无减益">
              <Moon className="inline h-2.5 w-2.5" aria-hidden /> 夜视
            </span>
          )}
          {r.dynamic && (
            <span className="shrink-0 rounded-sm border border-lime-500/40 bg-lime-950/50 px-1 text-[8px] font-bold text-lime-300" title={`种化自${r.parentName ?? '?'}`}>
              <Dna className="inline h-2.5 w-2.5" aria-hidden /> 新种
            </span>
          )}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-zinc-400">
          {r.extinct ? '已灭绝' : `${r.pop} 口`}
        </span>
      </div>
      <p className="mt-0.5 truncate text-[9px] leading-tight text-zinc-500" title={r.archetype}>{r.archetype}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[9px] text-zinc-600">{r.isCiv ? `${r.kingdoms} 国` : '野生'}</span>
        {r.extinct && (
          <span className="flex items-center gap-0.5 text-[9px] font-bold text-zinc-600">
            <Skull className="h-2.5 w-2.5" aria-hidden /> 灭绝
          </span>
        )}
      </div>
      {r.persona && (
        <div className="mt-1.5 grid grid-cols-4 gap-x-2 gap-y-1">
          {PERSONA_KEYS.map((p) => {
            const v = r.persona![p.key];
            return (
              <div key={p.key} className="flex items-center gap-1" title={`${p.label} ${v}`}>
                <span className="w-[22px] shrink-0 text-[8px] text-zinc-500">{p.label}</span>
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <span className="block h-full rounded-full" style={{ width: `${Math.max(4, v)}%`, background: p.color }} />
                </span>
              </div>
            );
          })}
        </div>
      )}
    </li>
  );
}

function RaceBody() {
  const stats = useGameStore((s) => s.stats);
  const [filter, setFilter] = useState<Filter>('civ');
  const [hoverRel, setHoverRel] = useState<{ a: string; b: string; v: number } | null>(null);

  const races = (stats?.races ?? []) as RaceRow[];
  const raceRelations = stats?.raceRelations ?? [];
  const year = stats?.year ?? 0;

  // 关系矩阵用种族：文明种族且现存人口 > 0（含主要动态种）
  const matrixRaces = useMemo(() => races.filter((r) => r.isCiv && r.pop > 0).slice(0, 10), [races]);
  const relMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of raceRelations) m.set(`${x.a}-${x.b}`, x.v);
    return m;
  }, [raceRelations]);

  const shown = useMemo(() => {
    if (filter === 'civ') return races.filter((r) => r.isCiv);
    if (filter === 'wild') return races.filter((r) => !r.isCiv);
    return races.filter((r) => r.dynamic);
  }, [races, filter]);

  const civTotal = races.filter((r) => r.isCiv).reduce((s, r) => s + r.pop, 0);
  const dynCount = races.filter((r) => r.dynamic).length;
  const extinctCount = races.filter((r) => r.extinct).length;

  const FILTERS: { k: Filter; label: string; n: number }[] = [
    { k: 'civ', label: '文明种族', n: races.filter((r) => r.isCiv).length },
    { k: 'wild', label: '野生动物', n: races.filter((r) => !r.isCiv).length },
    { k: 'dyn', label: '种化新种', n: dynCount },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* 统计头 */}
      <div className="grid grid-cols-3 gap-1 border-b border-zinc-800 bg-zinc-900/60 p-1.5">
        <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-1.5 py-1 text-center">
          <div className="font-mono text-[13px] font-bold text-zinc-100">{civTotal}</div>
          <div className="text-[8px] text-zinc-500">文明人口</div>
        </div>
        <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-1.5 py-1 text-center">
          <div className="font-mono text-[13px] font-bold text-lime-300">{dynCount}</div>
          <div className="text-[8px] text-zinc-500">种化物种</div>
        </div>
        <div className="rounded-sm border border-zinc-800 bg-zinc-950/60 px-1.5 py-1 text-center">
          <div className="font-mono text-[13px] font-bold text-zinc-400">{extinctCount}</div>
          <div className="text-[8px] text-zinc-500">已灭绝</div>
        </div>
      </div>

      {/* 种族关系矩阵 */}
      {matrixRaces.length >= 2 && (
        <div className="border-b border-zinc-800 p-2">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            <Swords className="h-3 w-3 text-red-400" aria-hidden /> 种族关系矩阵
          </p>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0 text-[9px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-zinc-900" />
                  {matrixRaces.map((c) => (
                    <th key={c.id} className="px-0.5 pb-0.5 font-normal text-zinc-500" title={c.name}>{c.name.slice(0, 2)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixRaces.map((row) => (
                  <tr key={row.id}>
                    <th className="sticky left-0 max-w-[64px] truncate bg-zinc-900 pr-1 text-right font-normal text-zinc-400" title={row.name}>{row.name}</th>
                    {matrixRaces.map((col) => {
                      if (row.id === col.id) return <td key={col.id} className="h-4 w-4 border border-zinc-900 bg-zinc-700/40" title="同族" />;
                      const k = row.id < col.id ? `${row.id}-${col.id}` : `${col.id}-${row.id}`;
                      const v = relMap.get(k) ?? 0;
                      return (
                        <td
                          key={col.id}
                          className={`h-4 w-4 cursor-crosshair border border-zinc-900/80 ${relColor(v)} transition-transform hover:scale-125`}
                          title={`${row.name} ↔ ${col.name}：${v > 0 ? '+' : ''}${v}（${relTag(v)}）`}
                          onMouseEnter={() => setHoverRel({ a: row.name, b: col.name, v })}
                          onMouseLeave={() => setHoverRel(null)}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 h-3 text-[9px] text-zinc-500">
            {hoverRel ? `${hoverRel.a} ↔ ${hoverRel.b}：${hoverRel.v > 0 ? '+' : ''}${hoverRel.v}（${relTag(hoverRel.v)}）` : '悬停格点查看种族间看法 · 战争撕裂/贸易亲善/联盟交融'}
          </p>
        </div>
      )}

      {/* 过滤器 */}
      <div className="flex gap-1 border-b border-zinc-800 p-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k)}
            aria-pressed={filter === f.k}
            className={`flex-1 rounded-sm border px-1 py-0.5 text-[9px] font-bold transition-colors ${
              filter === f.k
                ? 'border-teal-500/60 bg-teal-500/15 text-teal-200'
                : 'border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
            }`}
          >
            {f.label} {f.n}
          </button>
        ))}
      </div>

      {/* 种族卡列表 */}
      <ul className="flex flex-col gap-1 p-1.5">
        {shown.length === 0 ? (
          <li className="flex flex-col items-center gap-1.5 py-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
              <Footprints className="h-5 w-5 text-zinc-700" aria-hidden />
            </span>
            <p className="text-center text-[10px] leading-relaxed text-zinc-500">
              此分类下暂无种族——<br />
              <span className="text-zinc-600">换一个页签，或用「基因突变」神力孕育新种</span>
            </p>
          </li>
        ) : (
          shown.map((r) => <RaceCard key={r.id} r={r} />)
        )}
      </ul>

      {/* 脚注 */}
      <p className="border-t border-zinc-800 p-1.5 text-[9px] leading-relaxed text-zinc-600">
        第 {year} 年 · 性格驱动外交/经济/军事/社会行为（兽人难交朋友，精灵长于奥术）；
        种族间王国的战争与贸易真实改变整个种族对彼此的看法；多族王国的稳定度取决于主种族的包容性。
      </p>
    </div>
  );
}

export function RacePanel() {
  const { showRace, toggleRace, mobilePanel, openMobilePanel } = useGameStore();
  return (
    <>
      {/* 桌面左侧栏 */}
      {showRace && (
        <div className="su-dock-panel w-72 flex-col">
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <Users className="h-3.5 w-3.5 text-teal-300" aria-hidden />
              种族图鉴
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleRace}
              aria-label="关闭种族面板"
              className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex max-h-[calc(100dvh-96px-33px)] min-h-[260px] flex-col border-2 border-zinc-700/90 bg-zinc-900/95">
            <RaceBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'race'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[58vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <Users className="h-4 w-4 text-teal-300" aria-hidden />
              种族图鉴
            </SheetTitle>
          </SheetHeader>
          <RaceBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
