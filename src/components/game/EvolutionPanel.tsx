'use client';
// ============ Evolution Panel: 涌现进化图谱（桌面左侧栏 + 移动端底部抽屉） ============
// 五系谱系统一视图：物种（无限链式种化·视觉基因组）/ 武器（血系迭代·缴获仿制）/
// 科技（静态树穷尽后的无限涌现发明）/ 特质（极端基因分化）/ 理念（社会涌现·文化扩散）
// 交互：分类过滤 → SVG 时间轴谱系图（节点点击看详情）→ 涌现大事纪列表
import { useEffect, useMemo, useState } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import type { EvoKind, EvoNode } from '@/lib/game/emergence';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dna, X, GitBranch, FlaskConical, Sparkles, Lightbulb, Crown, CircleDot } from 'lucide-react';

/** 谱系分类元信息（图标/主色/泳道序） */
const KIND_META: Record<EvoKind, { name: string; color: string; icon: typeof Dna; order: number }> = {
  species: { name: '物种', color: '#6fd66f', icon: Dna, order: 0 },
  weapon: { name: '武器', color: '#ff9e5f', icon: Sparkles, order: 1 },
  tech: { name: '科技', color: '#5fe8ff', icon: FlaskConical, order: 2 },
  trait: { name: '特质', color: '#ff5fd2', icon: CircleDot, order: 3 },
  society: { name: '理念', color: '#ffd93d', icon: Lightbulb, order: 4 },
};

type Filter = 'all' | EvoKind;

/** 图谱数据快照（1s 轮询引擎） */
interface GraphSnapshot {
  nodes: EvoNode[];
  counts: Record<EvoKind, number>;
  dynSpecies: number;
  dynWeapons: number;
  emTechs: number;
  dynTraits: number;
  emIdeas: number;
  year: number;
}

const EMPTY: GraphSnapshot = { nodes: [], counts: { species: 0, weapon: 0, tech: 0, trait: 0, society: 0 }, dynSpecies: 0, dynWeapons: 0, emTechs: 0, dynTraits: 0, emIdeas: 0, year: 0 };

/** 单节点在图中的几何信息 */
interface Placed {
  node: EvoNode;
  x: number;
  y: number;
  lane: number;
}

/** SVG 谱系图：x = 年份（时间轴），y = 分类泳道（同类内按到达顺序错行防重叠） */
function EvoGraph({ nodes, filter, selected, onSelect }: { nodes: EvoNode[]; filter: Filter; selected: number | null; onSelect: (id: number) => void }) {
  const W = 560;
  const H = 240;
  const PAD_L = 14;
  const PAD_R = 14;
  const { placed, maxYear, nodeById } = useMemo(() => {
    const vis = nodes.filter((n) => filter === 'all' || n.kind === filter);
    const maxY = Math.max(10, ...vis.map((n) => n.year));
    const map = new Map<number, Placed>();
    // 泳道：每类一行；类内同年附近（±6 年）错开半行
    const laneUse: Record<string, number[]> = {};
    const placedAll: Placed[] = [];
    const sorted = [...vis].sort((a, b) => a.year - b.year || a.id - b.id);
    for (const n of sorted) {
      const meta = KIND_META[n.kind];
      const used = (laneUse[n.kind] ??= []);
      let sub = 0;
      while (used[sub] !== undefined && used[sub] > n.year - 14) sub++;
      used[sub] = n.year;
      const p: Placed = { node: n, x: 0, y: 0, lane: sub };
      placedAll.push(p);
      map.set(n.id, p);
    }
    for (const p of placedAll) {
      const t = maxY > 0 ? p.node.year / maxY : 0;
      p.x = PAD_L + t * (W - PAD_L - PAD_R);
      p.y = 26 + KIND_META[p.node.kind].order * 42 + (p.lane % 2 === 1 ? 14 : 0);
    }
    return { placed: placedAll, maxYear: maxY, nodeById: map };
  }, [nodes, filter]);

  const xOf = (y: number) => PAD_L + (maxYear > 0 ? y / maxYear : 0) * (W - PAD_L - PAD_R);

  return (
    <div className="relative rounded-sm border border-zinc-800 bg-[#0a0f18]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="涌现进化谱系图">
        {/* 泳道标签 + 分隔线 */}
        {(Object.keys(KIND_META) as EvoKind[]).map((k) => {
          const m = KIND_META[k];
          return (
            <g key={k}>
              <line x1={PAD_L} x2={W - PAD_R} y1={26 + m.order * 42 + 20} y2={26 + m.order * 42 + 20} stroke="#1c222e" strokeWidth={1} />
              <text x={PAD_L} y={22 + m.order * 42} fill={m.color} fontSize={9} fontWeight={700} opacity={0.75}>
                {m.name}
              </text>
            </g>
          );
        })}
        {/* 时间轴刻度（每 ~1/5 段） */}
        {[0.2, 0.4, 0.6, 0.8].map((f) => (
          <g key={f}>
            <line x1={xOf(Math.round(maxYear * f))} x2={xOf(Math.round(maxYear * f))} y1={12} y2={H - 8} stroke="#141a24" strokeWidth={1} strokeDasharray="2 4" />
            <text x={xOf(Math.round(maxYear * f)) + 2} y={H - 2} fill="#52525b" fontSize={7} fontFamily="monospace">
              {Math.round(maxYear * f)}年
            </text>
          </g>
        ))}
        {/* 谱系边（父 → 子贝塞尔） */}
        {placed.filter((p) => p.node.parent != null && nodeById.has(p.node.parent)).map((p) => {
          const q = nodeById.get(p.node.parent!)!;
          const mx = (q.x + p.x) / 2;
          const active = selected === p.node.id || selected === q.node.id;
          return (
            <path
              key={`e${p.node.id}`}
              d={`M ${q.x} ${q.y} C ${mx} ${q.y}, ${mx} ${p.y}, ${p.x} ${p.y}`}
              fill="none"
              stroke={active ? KIND_META[p.node.kind].color : '#2a3140'}
              strokeWidth={active ? 1.6 : 1}
              opacity={active ? 0.95 : 0.55}
            />
          );
        })}
        {/* 节点 */}
        {placed.map((p) => {
          const n = p.node;
          const m = KIND_META[n.kind];
          const isSel = selected === n.id;
          const r = isSel ? 4.5 : n.year === 0 ? 3 : 3.5;
          const fill = n.kind === 'species' || n.kind === 'weapon' ? (n.colorHex || m.color) : m.color;
          return (
            <g key={n.id} className="cursor-pointer" onClick={() => onSelect(n.id)}>
              {isSel && <circle cx={p.x} cy={p.y} r={7.5} fill="none" stroke={m.color} strokeWidth={1} opacity={0.7} />}
              <circle cx={p.x} cy={p.y} r={r} fill={fill} opacity={n.alive ? 1 : 0.45} stroke="#0a0f18" strokeWidth={0.8}>
                <title>{`${n.name}（${m.name}·${n.year}年）`}</title>
              </circle>
              {/* 选中/重大节点标注 */}
              {isSel && (
                <text x={p.x} y={p.y - 9} fill={m.color} fontSize={9} fontWeight={700} textAnchor="middle">
                  {n.name.length > 10 ? `${n.name.slice(0, 10)}…` : n.name}
                </text>
              )}
            </g>
          );
        })}
        {placed.length === 0 && (
          <text x={W / 2} y={H / 2} fill="#52525b" fontSize={10} textAnchor="middle">
            还没有涌现记录 — 时间会孕育一切
          </text>
        )}
      </svg>
    </div>
  );
}

/** 节点详情卡 */
function NodeDetail({ node, nodes }: { node: EvoNode; nodes: EvoNode[] }) {
  const m = KIND_META[node.kind];
  const parent = node.parent != null ? nodes.find((n) => n.id === node.parent) : null;
  return (
    <div className="rounded-sm border border-zinc-800 bg-zinc-900/80 p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold" style={{ borderColor: `${m.color}55`, color: m.color, background: `${m.color}12` }}>
          <m.icon className="h-2.5 w-2.5" aria-hidden />
          {m.name}
        </span>
        <span className="text-[11px] font-bold text-zinc-100">{node.name}</span>
        <span className="ml-auto font-mono text-[9px] text-zinc-500">{node.year === 0 ? '创世' : `${node.year} 年`}</span>
      </div>
      {parent && (
        <p className="mt-1 text-[9px] text-zinc-500">
          源自 <span className="font-bold" style={{ color: KIND_META[parent.kind].color }}>{parent.name}</span> 的谱系分化
        </p>
      )}
      {node.detail && <p className="mt-1 text-[10px] leading-relaxed text-zinc-400">{node.detail}</p>}
      {node.stat && (
        <p className="mt-1 font-mono text-[9px] font-bold" style={{ color: m.color }}>{node.stat}</p>
      )}
      {node.meta && (
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(node.meta).slice(0, 6).map(([k, v]) => (
            <span key={k} className="rounded-sm bg-zinc-800 px-1 py-px font-mono text-[8px] text-zinc-500">{k}:{String(v)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function EvoBody() {
  const [snap, setSnap] = useState<GraphSnapshot>(EMPTY);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const pull = () => {
      try {
        const g = getEngine().getEvoGraph();
        setSnap({ nodes: g.nodes, counts: g.counts, dynSpecies: g.dynSpecies, dynWeapons: g.dynWeapons, emTechs: g.emTechs, dynTraits: g.dynTraits, emIdeas: g.emIdeas, year: g.year });
      } catch { /* 引擎未就绪 */ }
    };
    pull();
    const t = window.setInterval(pull, 1000);
    return () => window.clearInterval(t);
  }, []);

  const selNode = selected != null ? snap.nodes.find((n) => n.id === selected) ?? null : null;
  const recent = useMemo(() => [...snap.nodes].filter((n) => n.year > 0).sort((a, b) => b.year - a.year || b.id - a.id).slice(0, 40), [snap.nodes]);
  const chips: { key: Filter; label: string; n: number; color: string; tip: string }[] = [
    { key: 'all', label: '全部', n: snap.nodes.filter((x) => x.year > 0).length, color: '#a1a1aa', tip: '全部涌现记录' },
    { key: 'species', label: '物种', n: snap.dynSpecies, color: KIND_META.species.color, tip: '种化诞生的新物种（可链式再分化）' },
    { key: 'weapon', label: '武器', n: snap.dynWeapons, color: KIND_META.weapon.color, tip: '涌现铸造的全新武器血系' },
    { key: 'tech', label: '科技', n: snap.emTechs, color: KIND_META.tech.color, tip: '科技树穷尽后涌现的无限发明' },
    { key: 'trait', label: '特质', n: snap.dynTraits, color: KIND_META.trait.color, tip: '极端基因分化出的新特质' },
    { key: 'society', label: '理念', n: snap.emIdeas, color: KIND_META.society.color, tip: '文化丰盈涌现的治国理念' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
      {/* 五系统计（悬停有口径说明） */}
      <div className="grid grid-cols-5 gap-1">
        {chips.slice(1).map((c) => {
          const Icon = KIND_META[c.key as EvoKind].icon;
          return (
            <div key={c.key} title={c.tip} className="flex flex-col items-center gap-0.5 rounded-sm border border-zinc-800 bg-zinc-900/70 px-1 py-1.5">
              <Icon className="h-3.5 w-3.5" style={{ color: c.color }} aria-hidden />
              <span className="font-mono text-[13px] font-bold leading-none tabular-nums" style={{ color: c.color }}>{c.n}</span>
              <span className="text-[8px] text-zinc-500">{c.label}</span>
            </div>
          );
        })}
      </div>

      {snap.nodes.length === 0 ? (
        /* 谱系完全空白：大图标 + 虚线谱系骨架示意（无数据也保有「图谱」的视觉概念） */
        <div className="flex flex-1 flex-col items-center justify-center gap-2.5 px-3 py-6">
          <svg viewBox="0 0 120 44" className="h-11 w-[120px] opacity-80" aria-hidden>
            <g stroke="#3f3f46" strokeWidth="1" strokeDasharray="3 3" fill="none">
              <path d="M8 36 L34 22 M34 22 L60 34 M34 22 L60 8 M60 8 L88 18 M60 34 L88 30 M88 18 L112 6 M88 30 L112 38" />
            </g>
            <g fill="#52525b">
              <circle cx="8" cy="36" r="2.5" />
              <circle cx="34" cy="22" r="3" fill="#71717a" />
              <circle cx="60" cy="8" r="2.5" />
              <circle cx="60" cy="34" r="2" />
              <circle cx="88" cy="18" r="3" fill="#71717a" />
              <circle cx="88" cy="30" r="2" />
              <circle cx="112" cy="6" r="2.5" fill="#fbbf24" opacity="0.5" />
              <circle cx="112" cy="38" r="2" />
            </g>
          </svg>
          <p className="text-center text-[11px] leading-relaxed text-zinc-500">
            谱系尚未萌发——放养生物任其繁衍、让文明点满科技、<br />
            或燃起战火锻造武器，谱系自会生长
          </p>
          <p className="font-mono text-[9px] text-zinc-600">{snap.year} 年 · 时间会孕育一切</p>
        </div>
      ) : (
        <>
      {/* 过滤器 */}
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            aria-pressed={filter === c.key}
            className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-bold transition-colors ${
              filter === c.key ? 'border-zinc-500 bg-zinc-700/60 text-zinc-100' : 'border-zinc-800 bg-zinc-900/60 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
            }`}
          >
            {c.label} <span className="font-mono">{c.n}</span>
          </button>
        ))}
      </div>

      {/* 谱系图 */}
      <EvoGraph nodes={snap.nodes} filter={filter} selected={selected} onSelect={(id) => setSelected((p) => (p === id ? null : id))} />

      {/* 选中详情 */}
      {selNode && <NodeDetail node={selNode} nodes={snap.nodes} />}

      {/* 涌现大事纪（新 → 旧，可滚动） */}
      <div>
        <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
          <Crown className="h-3 w-3" aria-hidden />
          涌现大事纪（{snap.year} 年）
        </p>
        {recent.length === 0 ? (
          <p className="rounded-sm border border-dashed border-zinc-800 p-2 text-center text-[10px] leading-relaxed text-zinc-600">
            尚无涌现事件——放养生物任其繁衍、让文明点满科技、或燃起战火锻造武器，谱系自会生长
          </p>
        ) : (
          <ul className="max-h-56 space-y-0.5 overflow-y-auto pr-1 [scrollbar-color:#3f3f46_transparent] [scrollbar-width:thin]">
            {recent.map((n) => {
              const m = KIND_META[n.kind];
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(n.id)}
                    className={`flex w-full items-start gap-1.5 rounded-sm px-1.5 py-1 text-left transition-colors ${selected === n.id ? 'bg-zinc-700/50' : 'hover:bg-zinc-800/60'}`}
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: n.colorHex || m.color, opacity: n.alive ? 1 : 0.4 }} aria-hidden />
                    <span className="w-8 shrink-0 font-mono text-[8px] leading-4 tabular-nums text-zinc-600">{n.year}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[10px] font-bold text-zinc-200">{n.name}</span>
                      <span className="block truncate text-[9px] text-zinc-500">{n.detail}</span>
                    </span>
                    <span className="shrink-0 rounded-sm bg-zinc-800 px-1 text-[8px] font-bold" style={{ color: m.color }}>{m.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
        </>
      )}

      {/* 脚注 */}
      <p className="border-t border-zinc-800 pt-1.5 text-[9px] leading-relaxed text-zinc-600">
        所有系统的无限涌现谱系：物种链式种化（外观随视觉基因组真实变异）· 武器血系迭代与缴获仿制 ·
        科技树穷尽后的无限涌现发明 · 极端基因分化新特质 · 文化丰盈涌现治国理念。
      </p>
    </div>
  );
}

export function EvolutionPanel() {
  const { showEvo, toggleEvo, mobilePanel, openMobilePanel } = useGameStore();
  return (
    <>
      {/* 桌面左侧栏 */}
      {showEvo && (
        <div className="su-dock-panel w-72 flex-col">
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <GitBranch className="h-3.5 w-3.5 text-violet-300" aria-hidden />
              涌现进化图谱
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleEvo}
              aria-label="关闭涌现图谱"
              className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex max-h-[calc(100dvh-96px-33px)] min-h-[260px] flex-col border-2 border-zinc-700/90 bg-zinc-900/95">
            <EvoBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'evo'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[58vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <GitBranch className="h-4 w-4 text-violet-300" aria-hidden />
              涌现进化图谱
            </SheetTitle>
          </SheetHeader>
          <EvoBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
