'use client';
// ============ Ecology Panel: 生物进化与生态竞争面板（桌面左侧栏 + 移动端底部抽屉） ============
// 展示：生态状态/承载链（植被-食草-食肉）+ 各物种种群趋势/历史曲线 + 亚种命名 + 基因四维漂移
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { SpeciesEco } from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Leaf, X, TrendingUp, TrendingDown, Dna, Sprout,
  SquareStack, PawPrint, TriangleAlert, CircleCheck, Wind,
} from 'lucide-react';

/** 生态状态徽章 */
const ECO_STATE_META: Record<string, { label: string; cls: string; icon: typeof Leaf }> = {
  overgrass: { label: '植被富余', cls: 'border-emerald-500 bg-emerald-500/15 text-emerald-300', icon: Sprout },
  balanced: { label: '生态平衡', cls: 'border-lime-500 bg-lime-500/15 text-lime-300', icon: CircleCheck },
  overgraze: { label: '过度啃食', cls: 'border-amber-500 bg-amber-500/15 text-amber-300', icon: TriangleAlert },
  collapse: { label: '生态崩溃', cls: 'border-red-500 bg-red-500/15 text-red-300', icon: TriangleAlert },
};

/** 基因四维元信息 */
const GENE_DIMS: { key: keyof SpeciesEco['gene']; label: string; color: string }[] = [
  { key: 's', label: '速度', color: 'bg-sky-400' },
  { key: 'd', label: '杀伤', color: 'bg-red-400' },
  { key: 'h', label: '体魄', color: 'bg-amber-400' },
  { key: 'r', label: '繁衍', color: 'bg-emerald-400' },
];

/** 基因条：显示相对基线的偏移（-50%..+50% 映射到左右各半条） */
function GeneBar({ label, value, base, color }: { label: string; value: number; base: number; color: string }) {
  const drift = (value - base) / base; // -1..1
  const pct = Math.max(-50, Math.min(50, drift * 100)); // ±50% 截断
  const w = Math.min(50, Math.abs(pct)); // 条宽（百分比）
  const positive = pct >= 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-7 shrink-0 text-[9px] font-bold text-zinc-500">{label}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-sm border border-zinc-700/70 bg-zinc-800">
        {/* 中心基线 */}
        <span className="absolute left-1/2 top-0 h-full w-px bg-zinc-600" aria-hidden />
        {/* 漂移条（左负右正） */}
        <span
          className={`absolute top-0 h-full ${color}`}
          style={positive ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
          aria-hidden
        />
      </div>
      <span
        className={`w-11 shrink-0 text-right font-mono text-[9px] font-bold ${
          positive ? 'text-lime-300' : drift < -0.02 ? 'text-red-400' : 'text-zinc-500'
        }`}
      >
        {drift >= 0 ? '+' : ''}{(drift * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/** 种群历史曲线：canvas 折线 + 渐变填充 + 最新点亮点（近 ~120 年采样） */
function PopSpark({ hist, color }: { hist: number[]; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 108;
    const h = 22;
    cv.width = w * dpr;
    cv.height = h * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (hist.length < 2) return;
    const max = Math.max(1, ...hist);
    const px = (i: number) => 1 + (i / (hist.length - 1)) * (w - 2);
    const py = (v: number) => h - 2 - (v / max) * (h - 4);
    // 淡色横向网格（读数辅助）
    ctx.strokeStyle = 'rgba(63, 63, 70, 0.55)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([2, 2]);
    for (const gy of [h * 0.33, h * 0.66]) {
      ctx.beginPath();
      ctx.moveTo(1, gy);
      ctx.lineTo(w - 1, gy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 渐变填充
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, `${color}4d`);
    grad.addColorStop(1, `${color}00`);
    ctx.beginPath();
    ctx.moveTo(px(0), h - 1);
    for (let i = 0; i < hist.length; i++) ctx.lineTo(px(i), py(hist[i]));
    ctx.lineTo(px(hist.length - 1), h - 1);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // 折线
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const x = px(i);
      const y = py(hist[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 最新点亮点
    const lx = px(hist.length - 1);
    const ly = py(hist[hist.length - 1]);
    ctx.beginPath();
    ctx.arc(lx, ly, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [hist, color]);
  return <canvas ref={ref} style={{ width: 108, height: 22 }} aria-hidden />;
}

/** 物种卡：种群 + 趋势 + 世代/亚种 + 历史曲线 + 基因漂移四条 */
function SpeciesCard({ sp }: { sp: SpeciesEco }) {
  const trendUp = sp.trend > 0;
  const trendFlat = Math.abs(sp.trend) < 1;
  const extinct = sp.pop === 0 && sp.hist?.some((v) => v > 0);
  return (
    <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
      <div className="mb-1.5 flex items-baseline gap-2">
        <p className="text-[11px] font-bold text-zinc-200">{sp.name}</p>
        <span className="font-mono text-[10px] font-bold text-amber-300">{sp.pop}</span>
        {!trendFlat && !extinct && (
          <span
            className={`flex items-center gap-0.5 font-mono text-[9px] font-bold ${
              trendUp ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {trendUp ? <TrendingUp className="h-3 w-3" aria-hidden /> : <TrendingDown className="h-3 w-3" aria-hidden />}
            {trendUp ? '+' : ''}{sp.trend}%
          </span>
        )}
        {extinct && (
          <span className="font-mono text-[9px] font-bold text-zinc-600 line-through">灭绝</span>
        )}
        {sp.gen > 0 && (
          <span className="ml-auto flex items-center gap-0.5 rounded-sm bg-lime-500/10 px-1 text-[9px] font-bold text-lime-300">
            <Dna className="h-3 w-3" aria-hidden />
            第 {sp.gen} 代
          </span>
        )}
      </div>
      {/* 亚种命名行（棘轮推进后显示） */}
      {sp.sub && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="rounded-sm border border-lime-500/40 bg-lime-500/10 px-1 text-[9px] font-bold text-lime-300">亚种</span>
          <span className="text-[10px] font-bold tracking-wide text-zinc-300">{sp.name} → {sp.sub}</span>
        </div>
      )}
      {/* 涌现特质徽章（基因维度均值突破阈值） */}
      {sp.beh && sp.beh.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          <span className="rounded-sm border border-fuchsia-500/40 bg-fuchsia-500/10 px-1 text-[9px] font-bold text-fuchsia-300" title="基因维度均值突破物种常态时涌现的具名行为">涌现</span>
          {sp.beh.map((b) => (
            <span key={b} className="rounded-sm border border-fuchsia-500/30 bg-fuchsia-500/5 px-1 text-[9px] font-bold text-fuchsia-200/90">{b}</span>
          ))}
        </div>
      )}
      {/* 种群历史曲线（≥2 个采样点才绘制） */}
      {sp.hist && sp.hist.length >= 2 && (
        <div className="mb-1.5 flex items-center gap-1.5 overflow-hidden rounded-sm bg-zinc-900/70 px-1 py-0.5">
          <PopSpark hist={sp.hist} color="#facc15" />
          <span className="ml-auto shrink-0 font-mono text-[8px] font-bold text-zinc-600">{sp.hist.length}年</span>
        </div>
      )}
      <div className="grid gap-0.5">
        {GENE_DIMS.map((g) => (
          <GeneBar key={g.key} label={g.label} value={sp.gene[g.key]} base={sp.base[g.key]} color={g.color} />
        ))}
      </div>
    </div>
  );
}

/** 面板主体（桌面与移动端共用） */
function EcoBody() {
  const stats = useGameStore((s) => s.stats);
  const species = stats?.species ?? [];
  const grass = stats?.grass ?? 0;
  const herb = stats?.herbivores ?? 0;
  const pred = stats?.predators ?? 0;
  const ecoState = stats?.ecoState ?? 'balanced';
  const capacity = Math.round(grass * 1.6);
  const load = capacity > 0 ? Math.min(2, herb / capacity) : 0;
  const meta = ECO_STATE_META[ecoState] ?? ECO_STATE_META.balanced;
  const StateIcon = meta.icon;

  return (
    <div className="game-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      {/* 生态状态 + 承载链总览 */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-lime-300">
            <Leaf className="h-3.5 w-3.5" aria-hidden />
            生态圈
          </p>
          <span className={`flex items-center gap-1 border px-1.5 py-0.5 text-[9px] font-bold ${meta.cls}`}>
            <StateIcon className="h-3 w-3" aria-hidden />
            {meta.label}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1 text-center">
          <div className="rounded-sm bg-zinc-900/70 p-1">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-zinc-500">
              <Sprout className="h-3 w-3 text-emerald-400" aria-hidden />
              植被
            </p>
            <p className="font-mono text-xs font-black text-emerald-300">{grass}</p>
          </div>
          <div className="rounded-sm bg-zinc-900/70 p-1">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-zinc-500">
              <SquareStack className="h-3 w-3 text-amber-400" aria-hidden />
              食草
            </p>
            <p className="font-mono text-xs font-black text-amber-300">{herb}</p>
          </div>
          <div className="rounded-sm bg-zinc-900/70 p-1">
            <p className="flex items-center justify-center gap-0.5 text-[9px] font-bold text-zinc-500">
              <PawPrint className="h-3 w-3 text-red-400" aria-hidden />
              食肉
            </p>
            <p className="font-mono text-xs font-black text-red-300">{pred}</p>
          </div>
        </div>
        {/* 载畜压力条（herbivores / capacity，1.0 处警戒线） */}
        <div className="mt-2">
          <div className="mb-0.5 flex items-center justify-between text-[9px] font-bold">
            <span className="text-zinc-500">载畜压力</span>
            <span className="font-mono text-zinc-400">{herb} / {capacity}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-sm bg-zinc-800">
            <div
              className={`h-full transition-all ${
                load > 1.15 ? 'bg-red-500' : load > 0.85 ? 'bg-amber-400' : 'bg-lime-400'
              }`}
              style={{ width: `${Math.min(100, load * 50)}%` }}
            />
            <span className="absolute left-1/2 top-0 h-full w-px bg-zinc-500" aria-hidden />
          </div>
        </div>
      </div>

      {/* 物种列表 */}
      {species.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
            <PawPrint className="h-6 w-6 text-zinc-700" aria-hidden />
          </span>
          <p className="text-center text-[11px] leading-relaxed text-zinc-500">
            荒野还没有野生动物——从「动物」页签放一些，<br />
            <span className="text-zinc-600">观察它们的进化与竞争</span>
          </p>
        </div>
      ) : (
        <div className="grid gap-2">
          {species.map((sp) => (
            <SpeciesCard key={sp.race} sp={sp} />
          ))}
        </div>
      )}

      {/* 说明脚注 */}
      <p className="flex items-start gap-1.5 border-t border-zinc-800 pt-1.5 text-[9px] leading-relaxed text-zinc-600">
        <Wind className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        基因随繁衍遗传变异，环境施压（雪地选体魄/沙地选速度/森林选杀伤/草原选繁衍）；种群均值漂移超过 12%
        即棘轮进化为新世代并命名亚种（环境×性状，如「霜狼·健硕」）。「基因突变」神力可加速这一进程（对文明生物亦有基因化选育效果）。
      </p>
    </div>
  );
}

export function EcologyPanel() {
  const { showEco, toggleEco, mobilePanel, openMobilePanel } = useGameStore();
  const count = useGameStore((s) => s.stats?.species.length ?? 0);
  return (
    <>
      {/* 桌面左侧栏 —— 仅顶栏生态按钮触发时出现，主界面无常驻折叠条（与王国榜同列互斥） */}
      {showEco && (
        <div className="su-dock-panel w-60 flex-col">
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <Leaf className="h-3.5 w-3.5 text-lime-300" aria-hidden />
              生态与进化
              <span className="font-mono text-[10px] text-zinc-500">{count}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleEco}
              aria-label="关闭生态面板"
              className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex max-h-[calc(100dvh-96px-33px)] min-h-[220px] flex-col border-2 border-zinc-700/90 bg-zinc-900/95">
            <EcoBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'eco'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[52vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <Leaf className="h-4 w-4 text-lime-300" aria-hidden />
              生态与进化
              <span className="ml-auto font-mono text-[10px] font-bold text-zinc-500">{count} 物种</span>
            </SheetTitle>
          </SheetHeader>
          <EcoBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
