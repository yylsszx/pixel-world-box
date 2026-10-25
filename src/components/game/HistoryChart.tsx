'use client';
// ============ Civ rise & fall history chart: 王国兴衰曲线（SVG 像素风，人口/领土/房屋三维度） ============
// 悬停交互：十字线 + 各王国当年数值提示（按最近采样点取值）
import { useMemo, useState } from 'react';
import { getEngine, useGameStore } from '@/store/gameStore';
import { RACES } from '@/lib/game/types';
import { Crosshair, Users, Landmark, Home } from 'lucide-react';

/** 维度定义：label + 从采样点取值（旧存档 2 元组 → 领土/房屋回退 0） */
const DIMS = [
  { key: 'pop', label: '人口', icon: Users, get: (p: number[]) => p[1] },
  { key: 'tiles', label: '领土', icon: Landmark, get: (p: number[]) => p[2] ?? 0 },
  { key: 'houses', label: '房屋', icon: Home, get: (p: number[]) => p[3] ?? 0 },
] as const;
type DimKey = (typeof DIMS)[number]['key'];

interface CivSeries {
  id: number;
  name: string;
  colorHex: string;
  raceName: string;
  alive: boolean;
  pop: number;
  points: number[][];
}

const W = 260;
const H = 92;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 12;

/**
 * 兴衰曲线：直接读引擎 civ.history 采样点（含已灭亡王国）。
 * 依赖 stats（每次 statsTick 更新）驱动重绘，避免额外订阅。
 */
export function CivHistoryChart() {
  const stats = useGameStore((s) => s.stats);
  const [dim, setDim] = useState<DimKey>('pop');
  const getVal = DIMS.find((d) => d.key === dim)!.get;
  /** 悬停状态：viewBox 坐标 + 年份 + 相对容器的像素位置（ tooltip 定位用） */
  const [hover, setHover] = useState<{ x: number; year: number; px: number; rectW: number } | null>(null);

  const { series, yearMin, yearMax, valMax, hasLegacy } = useMemo(() => {
    // 取值函数在 memo 内定义（避免闭包外部函数导致 React Compiler 无法保留 memoization）
    const valOf = (p: number[]) => (dim === 'pop' ? p[1] : dim === 'tiles' ? (p[2] ?? 0) : (p[3] ?? 0));
    const eng = getEngine();
    const list: CivSeries[] = [];
    let legacy = false;
    for (const c of eng.civs) {
      const h = c.history ?? [];
      if (h.length < 2) continue; // 少于 2 点画不出线
      if (h.some((p) => p.length < 4)) legacy = true; // 旧存档 2 元组
      list.push({
        id: c.id,
        name: c.name,
        colorHex: c.colorHex,
        raceName: RACES[c.race]?.name ?? '?',
        alive: c.alive,
        pop: c.pop,
        points: h,
      });
    }
    let yMin = Infinity;
    let yMax = -Infinity;
    let vMax = 0;
    for (const s of list) {
      for (const p of s.points) {
        if (p[0] < yMin) yMin = p[0];
        if (p[0] > yMax) yMax = p[0];
        const v = valOf(p);
        if (v > vMax) vMax = v;
      }
    }
    return { series: list, yearMin: Number.isFinite(yMin) ? yMin : 0, yearMax: Number.isFinite(yMax) ? yMax : 0, valMax: Math.max(1, vMax), hasLegacy: legacy };
  }, [stats, dim]);

  // 悬停行数据：各王国最近采样点的当年值（取值函数在 memo 内定义，避免闭包外部函数；必须在早退前调用以维持钩子顺序）
  const hoverRows = useMemo(() => {
    if (!hover || series.length === 0) return [];
    const valOf = (p: number[]) => (dim === 'pop' ? p[1] : dim === 'tiles' ? (p[2] ?? 0) : (p[3] ?? 0));
    const rows: { s: (typeof series)[number]; year: number; val: number }[] = [];
    for (const s of series) {
      let best: number[] | null = null;
      let bd = Infinity;
      for (const p of s.points) {
        const d = Math.abs(p[0] - hover.year);
        if (d < bd) { bd = d; best = p; }
      }
      if (best) rows.push({ s, year: best[0], val: valOf(best) });
    }
    return rows.sort((a, b) => b.val - a.val);
  }, [hover, series, dim]);

  if (series.length === 0) {
    return (
      <div className="flex items-center justify-center gap-1.5 border-b-2 border-zinc-800 bg-zinc-950/50 px-2 py-3">
        <p className="text-[10px] text-zinc-600">历史数据积累中 — 快进几年后回来查看王国兴衰</p>
      </div>
    );
  }

  // 坐标变换（留边）
  const xOf = (year: number) => PAD_L + ((year - yearMin) / Math.max(1, yearMax - yearMin)) * (W - PAD_L - PAD_R);
  const yOf = (v: number) => H - PAD_B - (v / valMax) * (H - PAD_T - PAD_B);

  // X 轴刻度：约 5 段，取整百
  const yearStep = Math.max(5, Math.ceil((yearMax - yearMin) / 5 / 25) * 25 || 25);
  const xTicks: number[] = [];
  for (let y = Math.ceil(yearMin / yearStep) * yearStep; y <= yearMax; y += yearStep) xTicks.push(y);
  // Y 轴刻度：50% 一条
  const yTicks = [0, Math.round(valMax / 2), valMax];

  return (
    <div className="border-b-2 border-zinc-800 bg-zinc-950/50">
      {/* 维度切换（人口/领土/房屋） */}
      <div className="flex items-center gap-1 px-1.5 pt-1.5">
        {DIMS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setDim(key)}
            aria-pressed={dim === key}
            className={`flex h-5 flex-1 items-center justify-center gap-0.5 rounded-sm border-2 text-[9px] font-bold uppercase tracking-wide transition-colors ${
              dim === key ? 'border-teal-400 bg-teal-400/15 text-teal-200' : 'border-transparent text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400'
            }`}
          >
            <Icon className="h-2.5 w-2.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-24 w-full cursor-crosshair touch-none"
          preserveAspectRatio="none"
          role="img"
          aria-label={`王国${DIMS.find((d) => d.key === dim)!.label}兴衰曲线，从 ${yearMin} 年到 ${yearMax} 年`}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            if (rect.width < 2) return;
            const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setHover({
              x: PAD_L + frac * (W - PAD_L - PAD_R),
              year: Math.round(yearMin + frac * Math.max(1, yearMax - yearMin)),
              px: e.clientX - rect.left,
              rectW: rect.width,
            });
          }}
          onPointerLeave={() => setHover(null)}
        >
        {/* 网格 */}
        {xTicks.map((y) => (
          <line key={`x${y}`} x1={xOf(y)} y1={PAD_T} x2={xOf(y)} y2={H - PAD_B} stroke="#2a2f38" strokeWidth="0.5" />
        ))}
        {yTicks.map((v) => (
          <line key={`y${v}`} x1={PAD_L} y1={yOf(v)} x2={W - PAD_R} y2={yOf(v)} stroke="#2a2f38" strokeWidth="0.5" strokeDasharray="2 2" />
        ))}
        {/* X 轴年份标签 */}
        {xTicks.map((y) => (
          <text key={`xl${y}`} x={xOf(y)} y={H - 3} fill="#71717a" fontSize="6.5" textAnchor="middle" fontFamily="ui-monospace, monospace">
            {y}
          </text>
        ))}
        {/* Y 轴数值标签（顶部与中部） */}
        <text x={PAD_L + 1} y={yOf(valMax) + 5} fill="#71717a" fontSize="6.5" fontFamily="ui-monospace, monospace">
          {valMax}
        </text>
        {yTicks[1] > 0 && (
          <text x={PAD_L + 1} y={yOf(yTicks[1]) + 5} fill="#71717a" fontSize="6.5" fontFamily="ui-monospace, monospace">
            {yTicks[1]}
          </text>
        )}
        {/* 各王国曲线 */}
        {series.map((s) => {
          const pts = s.points.map((p) => `${xOf(p[0]).toFixed(1)},${yOf(getVal(p)).toFixed(1)}`).join(' ');
          const last = s.points[s.points.length - 1];
          const ex = xOf(last[0]);
          const ey = yOf(getVal(last));
          return (
            <g key={s.id} opacity={s.alive ? 1 : 0.55}>
              <polyline points={pts} fill="none" stroke={s.colorHex} strokeWidth="1.4" strokeLinejoin="round" />
              {s.alive ? (
                <rect x={ex - 1.5} y={ey - 1.5} width="3" height="3" fill={s.colorHex} />
              ) : (
                // 灭亡标记：十字叉
                <>
                  <line x1={ex - 2.5} y1={ey - 2.5} x2={ex + 2.5} y2={ey + 2.5} stroke="#ef4444" strokeWidth="1.2" />
                  <line x1={ex - 2.5} y1={ey + 2.5} x2={ex + 2.5} y2={ey - 2.5} stroke="#ef4444" strokeWidth="1.2" />
                </>
              )}
            </g>
          );
        })}
        {/* 悬停十字线 + 各线采样点标记 */}
        {hover && (
          <g pointerEvents="none">
            <line x1={hover.x} y1={PAD_T} x2={hover.x} y2={H - PAD_B} stroke="#fbbf24" strokeWidth="0.7" opacity="0.85" />
            {hoverRows.map((r) => (
              <rect key={`hv${r.s.id}`} x={xOf(r.year) - 1.5} y={yOf(r.val) - 1.5} width="3" height="3" fill={r.s.colorHex} stroke="#09090b" strokeWidth="0.6" />
            ))}
          </g>
        )}
        </svg>
        {/* 悬停数值提示（跟随光标，限制在图内） */}
        {hover && hoverRows.length > 0 && (
          <div
            className="pointer-events-none absolute top-1 z-10 w-[104px] border-2 border-zinc-600 bg-zinc-950/95 p-1 shadow-[0_2px_0_rgba(0,0,0,0.6)]"
            style={{ left: Math.max(0, Math.min(hover.px + 10, hover.rectW - 106)) }}
          >
            <p className="mb-0.5 border-b border-zinc-700/80 pb-0.5 font-mono text-[9px] font-bold text-amber-300">{hover.year} 年</p>
            <div className="game-scroll max-h-20 overflow-y-auto">
              {hoverRows.map((r) => (
                <p key={`tt${r.s.id}`} className="flex items-center gap-1 text-[9px] font-bold leading-4">
                  <span className="inline-block h-1.5 w-1.5 shrink-0 border border-black/40" style={{ backgroundColor: r.s.colorHex }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-zinc-300">{r.s.name}</span>
                  <span className="font-mono text-zinc-500">{r.val}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* 图例 */}
      <div className="game-scroll max-h-16 overflow-y-auto px-2 py-1">
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5">
          {series.map((s) => (
            <span key={s.id} className="flex items-center gap-1 text-[9px] font-bold">
              <span className="inline-block h-2 w-2 border border-black/40" style={{ backgroundColor: s.colorHex }} aria-hidden />
              <span className={s.alive ? 'text-zinc-400' : 'text-zinc-600 line-through'}>{s.name}</span>
              <span className="font-mono text-zinc-600">{s.alive ? getVal(s.points[s.points.length - 1]) : '亡'}</span>
            </span>
          ))}
        </div>
      </div>
      <p className="flex items-center gap-1 border-t border-zinc-800/70 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-zinc-600">
        <Crosshair className="h-2.5 w-2.5" aria-hidden />
        每 5 年采样 · 红叉 = 已灭亡 · 纵轴为{DIMS.find((d) => d.key === dim)!.label}
        {hasLegacy && dim !== 'pop' && ' · 旧存档缺此维度数据'}
      </p>
    </div>
  );
}
