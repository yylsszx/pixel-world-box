'use client';
// ============ 王国外交图谱：王国节点 + 关系连线（战争红/敌意橙/冷淡灰/友好绿） ============
// 力导向布局（确定性：按 civ id 排序初始化，固定迭代次数），节点半径随人口缩放。
// 交互：点击节点 = 选中并跳转首都；hover 节点高亮其所有连线；战争连线带行军虚线动画。
import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Network, Swords } from 'lucide-react';

interface GraphCiv {
  id: number;
  name: string;
  race: number;
  colorHex: string;
  pop: number;
  wars: string[];
  capital: { x: number; y: number } | null;
}

interface GraphEdge {
  a: number;
  b: number;
  v: number;
}

/** 联盟阵营（stats.alliances 行） */
interface GraphAlliance {
  id: number;
  name: string;
  colorHex: string;
  leaderId: number;
  members: { id: number; name: string; colorHex: string; raceName: string; pop: number }[];
  cohesion: number;
  formedYear: number;
  warsTogether: number;
}

/** 关系分档：v < -20 战争（与引擎 atWar 阈值一致）；< 0 敌意；< 20 冷淡；>= 20 友好 */
function classifyRel(v: number): 'war' | 'rival' | 'cold' | 'warm' {
  if (v < -20) return 'war';
  if (v < 0) return 'rival';
  if (v < 20) return 'cold';
  return 'warm';
}

const REL_META: Record<ReturnType<typeof classifyRel>, { color: string; label: string; dash?: string; width: number }> = {
  war: { color: '#ef4444', label: '战争', dash: '5 3', width: 2.5 },
  rival: { color: '#f97316', label: '敌意', dash: '2 3', width: 1.6 },
  cold: { color: '#71717a', label: '冷淡', dash: '1 4', width: 1.4 },
  warm: { color: '#22c55e', label: '友好', width: 1.6 },
};

const VB_W = 232;
const VB_H = 158;

/** 简易力导向布局：确定性初始化 + 固定迭代（同 id 集合稳定复现）；盟友对额外强牵引（阵营聚簇） */
function layoutNodes(civs: GraphCiv[], edges: GraphEdge[], allyPairs: [number, number][] = []): Map<number, { x: number; y: number }> {
  const ids = [...civs].sort((a, b) => a.id - b.id).map((c) => c.id);
  const pos = new Map<number, { x: number; y: number }>();
  // 圆形初始化（1 个王国放中心）
  ids.forEach((id, i) => {
    const ang = (i / Math.max(ids.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const r = ids.length === 1 ? 0 : Math.min(VB_W, VB_H) * 0.32;
    pos.set(id, { x: VB_W / 2 + Math.cos(ang) * r * 1.1, y: VB_H / 2 + Math.sin(ang) * r });
  });
  if (ids.length <= 1) return pos;

  const edgeSet = new Set(edges.map((e) => (e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`)));
  // 力导向迭代：节点互斥 + 连线牵引 + 向心（带边距约束）
  for (let it = 0; it < 150; it++) {
    const step = 0.9 * (1 - it / 150); // 退火
    const fx = new Map<number, number>();
    const fy = new Map<number, number>();
    for (const id of ids) { fx.set(id, 0); fy.set(id, 0); }
    // 斥力（平方衰减）
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pa = pos.get(ids[i])!;
        const pb = pos.get(ids[j])!;
        let dx = pa.x - pb.x;
        let dy = pa.y - pb.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (i - j) || 1; dy = (j - i) || 1; d2 = 2; }
        const rep = 2600 / d2;
        const d = Math.sqrt(d2);
        fx.set(ids[i], fx.get(ids[i])! + (dx / d) * rep);
        fy.set(ids[i], fy.get(ids[i])! + (dy / d) * rep);
        fx.set(ids[j], fx.get(ids[j])! - (dx / d) * rep);
        fy.set(ids[j], fy.get(ids[j])! - (dy / d) * rep);
      }
    }
    // 引力（有关系的节点互相靠拢；战争关系斥开一展示空间）
    for (const e of edges) {
      if (!pos.has(e.a) || !pos.has(e.b)) continue;
      const pa = pos.get(e.a)!;
      const pb = pos.get(e.b)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy) || 1;
      const rest = classifyRel(e.v) === 'war' ? 74 : 52; // 战线拉远更醒目
      const pull = (d - rest) * 0.02;
      fx.set(e.a, fx.get(e.a)! + (dx / d) * pull);
      fy.set(e.a, fy.get(e.a)! + (dy / d) * pull);
      fx.set(e.b, fx.get(e.b)! - (dx / d) * pull);
      fy.set(e.b, fy.get(e.b)! - (dy / d) * pull * 1);
    }
    // 联盟聚簇引力：盟友间比普通友好更强地靠拢（阵营成团，一眼可辨）
    for (const [a, b] of allyPairs) {
      if (!pos.has(a) || !pos.has(b)) continue;
      const pa = pos.get(a)!;
      const pb = pos.get(b)!;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = (d - 26) * 0.05;
      fx.set(a, fx.get(a)! + (dx / d) * pull);
      fy.set(a, fy.get(a)! + (dy / d) * pull);
      fx.set(b, fx.get(b)! - (dx / d) * pull);
      fy.set(b, fy.get(b)! - (dy / d) * pull);
    }
    // 应用 + 边界约束
    for (const id of ids) {
      const p = pos.get(id)!;
      const nx = p.x + (fx.get(id) ?? 0) * step;
      const ny = p.y + (fy.get(id) ?? 0) * step;
      // 向心防漂出
      const cx = VB_W / 2;
      const cy = VB_H / 2;
      const toCx = (cx - nx) * 0.02;
      const toCy = (cy - ny) * 0.02;
      pos.set(id, {
        x: Math.max(16, Math.min(VB_W - 16, nx + toCx)),
        y: Math.max(14, Math.min(VB_H - 14, ny + toCy)),
      });
    }
  }
  void edgeSet;
  return pos;
}

export function DiplomacyGraph() {
  const { stats, selCiv, selectCiv, jumpTo, mobilePanel, openMobilePanel } = useGameStore();
  const [hoverId, setHoverId] = useState<number | null>(null);
  const isMobileSheet = mobilePanel === 'kingdoms';

  // civs/relations/布局一次性派生（内部自包含，React Compiler 可完整保留 memoization）。
  // 布局是确定性函数：几何只随节点集合与边集合（含战争态）变化 → 数值漂移不重排、无抖动。
  const { civs, relations, alliances, allyPairs, alOfCiv, pos } = useMemo(() => {
    const list = ((stats?.civs ?? []) as GraphCiv[]).slice().sort((a, b) => a.id - b.id);
    const rels = stats?.relations ?? [];
    const als = ((stats?.alliances ?? []) as GraphAlliance[]).filter(
      (al) => al.members.filter((m) => list.some((c) => c.id === m.id)).length >= 2,
    );
    const pairs: [number, number][] = [];
    const aMap = new Map<number, GraphAlliance>();
    for (const al of als) {
      const ms = al.members.map((m) => m.id).filter((id) => list.some((c) => c.id === id));
      for (let i = 0; i < ms.length; i++) {
        aMap.set(ms[i], al);
        for (let j = i + 1; j < ms.length; j++) pairs.push([ms[i], ms[j]]);
      }
    }
    return { civs: list, relations: rels, alliances: als, allyPairs: pairs, alOfCiv: aMap, pos: layoutNodes(list, rels, pairs) };
  }, [stats]);

  const byId = useMemo(() => new Map(civs.map((c) => [c.id, c])), [civs]);
  // 深度打磨：活跃贸易路线（在途商队两端）
  const tradePairs = (stats?.tradePairs ?? []) as [number, number][];
  const edgeStats = useMemo(() => {
    const counts = { war: 0, rival: 0, cold: 0, warm: 0 };
    for (const e of relations) {
      if (byId.has(e.a) && byId.has(e.b)) counts[classifyRel(e.v)]++;
    }
    return counts;
  }, [relations, byId]);

  if (civs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
          <Network className="h-6 w-6 text-zinc-700" aria-hidden />
        </span>
        <p className="text-center text-[11px] leading-relaxed text-zinc-500">
          还没有王国——外交无从谈起，<br />
          <span className="text-zinc-600">先放置智慧种族看它们建立文明</span>
        </p>
      </div>
    );
  }
  if (civs.length === 1) {
    return (
      <div className="flex flex-col items-center gap-2 px-3 py-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
          <Network className="h-6 w-6 text-zinc-700" aria-hidden />
        </span>
        <p className="text-center text-[11px] leading-relaxed text-zinc-500">
          天下只有「{civs[0].name}」一国——<br />
          <span className="text-zinc-600">放置第二个智慧种族，看它们如何相处</span>
        </p>
      </div>
    );
  }

  const nodeR = (pop: number) => Math.max(5, Math.min(10, 4.5 + Math.sqrt(pop) * 0.55));

  return (
    <div className="select-none">
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="block w-full bg-zinc-950/70" role="img" aria-label={`王国外交图谱：${civs.length} 个王国，${edgeStats.war} 场战争进行中，${alliances.length} 个联盟`}>
        {/* 联盟阵营底盘（最底层：成员包络圆 + 联盟名） */}
        {alliances.map((al) => {
          const pts = al.members.map((m) => pos.get(m.id)).filter((p): p is { x: number; y: number } => !!p);
          if (pts.length < 2) return null;
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const rad = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 13;
          const dim = hoverId !== null && !al.members.some((m) => m.id === hoverId);
          return (
            <g key={`al-${al.id}`} opacity={dim ? 0.3 : 1}>
              <circle cx={cx} cy={cy} r={rad} fill={al.colorHex} fillOpacity={0.1} stroke={al.colorHex} strokeWidth={1.4} strokeDasharray="6 3" />
              <text x={cx} y={cy - rad - 3} textAnchor="middle" fontSize={7.5} fontWeight={800} fill={al.colorHex} className="font-mono">
                {al.name.length > 8 ? al.name.slice(0, 7) + '…' : al.name}
              </text>
            </g>
          );
        })}

        {/* 联盟盟约边（青色实相连线，在普通关系边之下） */}
        {allyPairs.map(([a, b]) => {
          const pa = pos.get(a);
          const pb = pos.get(b);
          if (!pa || !pb) return null;
          const al = alOfCiv.get(a);
          const dim = hoverId !== null && hoverId !== a && hoverId !== b;
          return (
            <line
              key={`ally-${a}-${b}`}
              x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
              stroke={al?.colorHex ?? '#14b8a6'}
              strokeWidth={3}
              strokeOpacity={0.5}
              strokeLinecap="round"
              opacity={dim ? 0.2 : 1}
            />
          );
        })}

        {/* 关系连线（战争在最上层） */}
        {relations
          .slice()
          .sort((e1, e2) => (classifyRel(e2.v) === 'war' ? 1 : 0) - (classifyRel(e1.v) === 'war' ? 1 : 0))
          .map((e) => {
            const pa = pos.get(e.a);
            const pb = pos.get(e.b);
            if (!pa || !pb || !byId.has(e.a) || !byId.has(e.b)) return null;
            const cat = classifyRel(e.v);
            const meta = REL_META[cat];
            const dim = hoverId !== null && hoverId !== e.a && hoverId !== e.b;
            const mx = (pa.x + pb.x) / 2;
            const my = (pa.y + pb.y) / 2;
            return (
              <g key={`${e.a}-${e.b}`} opacity={dim ? 0.18 : 1}>
                <line
                  x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                  stroke={meta.color}
                  strokeWidth={meta.width}
                  strokeDasharray={meta.dash}
                  className={cat === 'war' ? 'wb-war-edge' : undefined}
                />
                {/* 关系值微章（hover 高亮时显示） */}
                {(hoverId === e.a || hoverId === e.b) && (
                  <g>
                    <rect x={mx - 13} y={my - 6} width={26} height={12} fill="#18181b" stroke={meta.color} strokeWidth={1} />
                    <text x={mx} y={my + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill={meta.color} className="font-mono">
                      {e.v > 0 ? '+' : ''}{e.v}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

        {/* 深度打磨：活跃贸易线（在途商队 — 金色流动虚线 + 货币徽记） */}
        {tradePairs.map(([a, b]) => {
          const pa = pos.get(a);
          const pb = pos.get(b);
          if (!pa || !pb || !byId.has(a) || !byId.has(b)) return null;
          const dim = hoverId !== null && hoverId !== a && hoverId !== b;
          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          return (
            <g key={`trade-${a}-${b}`} opacity={dim ? 0.25 : 1}>
              <line
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke="#fbbf24"
                strokeWidth={1.6}
                strokeDasharray="3 3"
                className="wb-trade-edge"
              />
              <circle cx={mx} cy={my} r={3.5} fill="#18181b" stroke="#fbbf24" strokeWidth={1} />
              <circle cx={mx} cy={my} r={1.2} fill="#fbbf24" />
            </g>
          );
        })}

        {/* 王国节点 */}
        {civs.map((c) => {
          const p = pos.get(c.id);
          if (!p) return null;
          const r = nodeR(c.pop);
          const active = hoverId === c.id;
          const selected = selCiv === c.id;
          const label = c.name.length > 6 ? c.name.slice(0, 5) + '…' : c.name;
          return (
            <g
              key={c.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer"
              onClick={() => {
                selectCiv(c.id);
                if (c.capital) jumpTo(c.capital.x, c.capital.y);
                if (isMobileSheet) openMobilePanel('none');
              }}
              onPointerEnter={() => setHoverId(c.id)}
              onPointerLeave={() => setHoverId(null)}
              opacity={hoverId !== null && !active ? 0.35 : 1}
            >
              {/* 选中光环 */}
              {selected && <circle r={r + 4} fill="none" stroke="#fbbf24" strokeWidth={2} />}
              {/* 战争硝烟描边（交战国红描边 + 脉动） */}
              {(c.wars?.length ?? 0) > 0 && <circle r={r + 2.5} fill="none" stroke="#ef4444" strokeWidth={1.5} className="wb-war-ring" />}
              <circle r={r} fill={c.colorHex} stroke="#09090b" strokeWidth={2} />
              {/* 联盟盟旗徽章（右上：阵营色小旗） */}
              {alOfCiv.has(c.id) && (() => {
                const al = alOfCiv.get(c.id)!;
                return (
                  <g transform={`translate(${r - 2}, ${-r - 2})`}>
                    <rect x={-3.5} y={-5} width={7} height={7} fill="#18181b" stroke={al.colorHex} strokeWidth={1} />
                    <path d="M-1.8,-3.4 L1.8,-3.4 L1.8,0.4 L0,-1 L-1.8,0.4 Z" fill={al.colorHex} />
                  </g>
                );
              })()}
              {/* 人口标记点（左上小方块，尺寸=人口） */}
              <rect x={-2} y={-r - 5} width={4} height={4} fill="#fbbf24" opacity={0.9} />
              <text
                y={r + 9}
                textAnchor="middle"
                fontSize={8}
                fontWeight={700}
                fill={active ? '#f4f4f5' : '#a1a1aa'}
                className="font-mono"
              >
                {label}
              </text>
              {/* 战争剑标 */}
              {(c.wars?.length ?? 0) > 0 && (
                <g transform={`translate(${r - 3}, ${-r - 1})`}>
                  <rect x={-4.5} y={-4.5} width={9} height={9} fill="#18181b" stroke="#ef4444" strokeWidth={1} />
                  <path d="M-2.5,-2.5 L2.5,2.5 M2.5,-2.5 L-2.5,2.5" stroke="#ef4444" strokeWidth={1.2} />
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {/* 图例（窄面板下 5 项必换行 —— flex-wrap 防溢出） */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-t border-zinc-800 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
        {(['war', 'rival', 'cold', 'warm'] as const).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <svg width="14" height="6" aria-hidden>
              <line x1="0" y1="3" x2="14" y2="3" stroke={REL_META[k].color} strokeWidth={2} strokeDasharray={REL_META[k].dash} />
            </svg>
            {REL_META[k].label}
            <span className="font-mono text-zinc-600">{edgeStats[k]}</span>
          </span>
        ))}
        <span className="flex items-center gap-1 text-teal-400">
          <svg width="14" height="6" aria-hidden>
            <line x1="0" y1="3" x2="14" y2="3" stroke="#14b8a6" strokeWidth={3} strokeOpacity={0.5} />
          </svg>
          盟约
          <span className="font-mono text-zinc-600">{allyPairs.length > 0 ? alliances.length : 0}</span>
        </span>
      </div>
      <p className="flex items-center gap-1 border-t border-zinc-800 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-zinc-600">
        <Swords className="h-2.5 w-2.5" aria-hidden />
        点击节点查看王国并跳转首都 · 悬停看关系值
      </p>
    </div>
  );
}
