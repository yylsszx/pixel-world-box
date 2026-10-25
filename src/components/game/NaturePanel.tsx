'use client';
// ============ Nature Panel: 自然引擎面板（板块构造/四季/大气/风暴天灾） ============
// 桌面左侧栏 + 移动端底部抽屉；板块图/风场由引擎实况直接绘制（1.5s 刷新）
import { useCallback, useEffect, useRef } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  MountainSnow, X, Flower2, Sun, Leaf, CloudSnow, Tornado, Waves,
  Thermometer, Droplets, Cloud, Activity, TriangleAlert, Mountain, Zap, Wind, Hourglass,
} from 'lucide-react';
import type { NatureSnapshot, SeasonRhythm, WorldEvent } from '@/lib/game/types';

/** 板块配色（7 板块上限） */
const PLATE_COLORS = ['#c96a4a', '#4a9ec9', '#8a6ac9', '#5ac96e', '#c9b04a', '#c94a8a', '#4ac9b0'];

/** 季节元数据 */
const SEASON_META = [
  { label: '春', icon: Flower2, cls: 'text-lime-300', bar: 'bg-lime-400', border: 'border-lime-500' },
  { label: '夏', icon: Sun, cls: 'text-yellow-300', bar: 'bg-yellow-400', border: 'border-yellow-500' },
  { label: '秋', icon: Leaf, cls: 'text-orange-300', bar: 'bg-orange-400', border: 'border-orange-500' },
  { label: '冬', icon: CloudSnow, cls: 'text-cyan-300', bar: 'bg-cyan-400', border: 'border-cyan-500' },
];

/** 当季节律徽章色调（Task 101）：good 生机 / info 中性 / danger 危机 */
const RHYTHM_TONE: Record<SeasonRhythm['tone'], string> = {
  good: 'border-lime-600 bg-lime-500/15 text-lime-300',
  info: 'border-cyan-600 bg-cyan-500/15 text-cyan-300',
  danger: 'border-red-600 bg-red-500/15 text-red-300',
};

/** 地震风险等级元数据 */
const QUAKE_RISK_META = [
  { label: '平静', cls: 'border-emerald-600 bg-emerald-500/15 text-emerald-300' },
  { label: '酝酿', cls: 'border-lime-600 bg-lime-500/15 text-lime-300' },
  { label: '高危', cls: 'border-amber-600 bg-amber-500/15 text-amber-300' },
  { label: '临界', cls: 'border-red-600 bg-red-500/15 text-red-300' },
];

/** 自然事件类型集合（近自然纪事过滤） */
const NATURE_KINDS = new Set(['geo', 'volcano', 'tsunami', 'blizzard', 'drought', 'sandstorm', 'typhoon', 'iceage', 'flood']);

/** 板块构造图：地形暗底 + 板块色罩 + 边界应力热 + 热点 + 震中环 + 漂移箭头 */
function PlateMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const eng = getEngine();
    const nat = eng.nature;
    const W = 256;
    const H = 160;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 224;
    const h = 140;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 逐 tile 像素写入离屏 ImageData（256×160 → 直接缩放绘制）
    const img = ctx.createImageData(W, H);
    const plateCentroids: [number, number, number][] = Array.from({ length: nat.plateN }, () => [0, 0, 0]);
    for (let i = 0; i < W * H; i++) {
      const t = eng.terrain[i];
      const p = nat.plate[i];
      const pc = plateCentroids[p];
      if (pc) { pc[0] += i % W; pc[1] += (i / W) | 0; pc[2]++; }
      const isWater = t === 0 || t === 1;
      // 暗色底（陆地灰阶 / 海洋深蓝）
      let r = isWater ? 22 : 66;
      let g = isWater ? 34 : 68;
      let b = isWater ? 52 : 70;
      if (t === 7 || t === 10) { r = 110; g = 118; b = 126; } // 雪/冰亮底
      // 板块色罩（低饱和 45%）
      const col = PLATE_COLORS[p % PLATE_COLORS.length];
      const pr = parseInt(col.slice(1, 3), 16);
      const pg = parseInt(col.slice(3, 5), 16);
      const pb = parseInt(col.slice(5, 7), 16);
      r = r * 0.55 + pr * 0.45;
      g = g * 0.55 + pg * 0.45;
      b = b * 0.55 + pb * 0.45;
      // 边界应力热（红热强度 = 应力/阈值）
      const s = nat.stress[i];
      if (nat.boundary.has(i) && s > 0.5) {
        const heat = Math.min(1, s / 26);
        r = r * (1 - heat) + 255 * heat;
        g = g * (1 - heat) + 70 * heat;
        b = b * (1 - heat) + 40 * heat;
      }
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    // 离屏合成
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    off.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(off, 0, 0, w, h);
    // 热点（橙色三角标记）
    ctx.fillStyle = '#ff9e3d';
    for (const hsp of nat.hotspots) {
      const px = (hsp.x / W) * w;
      const py = (hsp.y / H) * h;
      ctx.beginPath();
      ctx.moveTo(px, py - 3);
      ctx.lineTo(px - 3, py + 2.5);
      ctx.lineTo(px + 3, py + 2.5);
      ctx.closePath();
      ctx.fill();
    }
    // 近期震中（红色同心环）
    ctx.strokeStyle = 'rgba(255,70,50,0.9)';
    ctx.lineWidth = 1;
    for (const q of nat.recentQuakes) {
      const px = (q.x / W) * w;
      const py = (q.y / H) * h;
      const rr = 2 + Math.max(0, q.m - 5);
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 1, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4632';
      ctx.fill();
    }
    // 板块漂移箭头（各板块质心处）
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    for (let p = 0; p < nat.plateN; p++) {
      const pc = plateCentroids[p];
      if (!pc || pc[2] < 30) continue;
      const cx = ((pc[0] / pc[2]) / W) * w;
      const cy = ((pc[1] / pc[2]) / H) * h;
      const d = nat.drift[p];
      if (!d) continue;
      const len = 4 + Math.hypot(d.dx, d.dy) * 9;
      const ang = Math.atan2(d.dy, d.dx);
      const ex = cx + Math.cos(ang) * len;
      const ey = cy + Math.sin(ang) * len;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      // 箭头头部
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex - Math.cos(ang - 0.5) * 3.5, ey - Math.sin(ang - 0.5) * 3.5);
      ctx.lineTo(ex - Math.cos(ang + 0.5) * 3.5, ey - Math.sin(ang + 0.5) * 3.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }
  }, []);
  useEffect(() => {
    draw();
    const t = setInterval(draw, 1500);
    return () => clearInterval(t);
  }, [draw]);
  return (
    <canvas
      ref={ref}
      className="w-full rounded-sm border border-black/50"
      style={{ imageRendering: 'pixelated', aspectRatio: '256/160' }}
      role="img"
      aria-label="板块构造图：板块颜色 / 边界应力热 / 热点与近期震中"
    />
  );
}

/** 大气风场图：纬向三环 + 气压中心(H/L) + 急流带 + ITCZ 辐合带 + 风暴位置 */
function WindMap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const cv = ref.current;
    if (!cv) return;
    const eng = getEngine();
    const nat = eng.nature;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = 224;
    const h = 120;
    if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const itcz = nat.itczLat;
    // 底：纬度带条纹（信风/西风带标注感；边界随 ITCZ 摆动）
    const AH = 20;
    for (let cy = 0; cy < AH; cy++) {
      const lat = cy / (AH - 1);
      const latA = Math.abs(lat - itcz) * 2;
      const west = latA < 0.32 || latA > 0.72;
      ctx.fillStyle = west ? 'rgba(56,110,140,0.18)' : 'rgba(110,140,90,0.18)';
      ctx.fillRect(0, (cy / AH) * h, w, h / AH);
    }
    // 急流带高亮（副热带/副极锋两支——西风带里的高速走廊）
    for (const off of [0.19, 0.31]) {
      for (const sgn of [-1, 1]) {
        ctx.fillStyle = 'rgba(255,238,170,0.13)';
        ctx.fillRect(0, (itcz + sgn * off) * h - 2.5, w, 5);
      }
    }
    // ITCZ 赤道辐合带虚线（随季节南北摆动——季风的引擎）
    ctx.strokeStyle = 'rgba(120,220,200,0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, itcz * h);
    ctx.lineTo(w, itcz * h);
    ctx.stroke();
    ctx.setLineDash([]);
    // 风矢量（每 2 格采样一支箭；风速渐变配色）
    const AW = 32;
    ctx.lineWidth = 1;
    for (let cy = 0; cy < AH; cy += 2) {
      for (let cx = 0; cx < AW; cx += 2) {
        const [u, v] = nat.windAt(cx, cy);
        const px = ((cx + 1) / AW) * w;
        const py = ((cy + 1) / AH) * h;
        const mag = Math.hypot(u, v);
        const len = 3 + Math.min(7, mag * 6);
        const ang = Math.atan2(v, u);
        const strong = mag > 1.1;
        ctx.strokeStyle = strong ? 'rgba(255,224,140,0.95)' : 'rgba(150,220,240,0.85)';
        ctx.fillStyle = strong ? 'rgba(255,224,140,0.95)' : 'rgba(150,220,240,0.95)';
        const ex = px + Math.cos(ang) * len;
        const ey = py + Math.sin(ang) * len;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(ang - 0.55) * 2.5, ey - Math.sin(ang - 0.55) * 2.5);
        ctx.lineTo(ex - Math.cos(ang + 0.55) * 2.5, ey - Math.sin(ang + 0.55) * 2.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    // 气压中心：低压 L（红旋涡·生雨助产风暴）/ 高压 H（蓝旋涡·晴燥）
    for (const ps of nat.pSystems) {
      const px = (ps.x / 256) * w;
      const py = (ps.y / 160) * h;
      const isL = ps.kind === 0;
      ctx.strokeStyle = isL ? 'rgba(255,120,110,0.95)' : 'rgba(130,170,255,0.95)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(px, py, 3 + ps.str * 2, 0, Math.PI * 1.35);
      ctx.stroke();
      ctx.fillStyle = isL ? '#ff8878' : '#88aaff';
      ctx.font = 'bold 7px monospace';
      ctx.fillText(isL ? 'L' : 'H', px + 4, py - 3);
    }
    // 活跃风暴位置（旋转标记）
    for (const st of nat.storms) {
      const px = (st.x / 256) * w;
      const py = (st.y / 160) * h;
      ctx.strokeStyle = st.kind === 'blizzard' ? 'rgba(190,230,250,0.95)' : 'rgba(255,170,90,0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = st.kind === 'blizzard' ? '#bde6fa' : '#ffaa5a';
      ctx.fill();
    }
  }, []);
  useEffect(() => {
    draw();
    const t = setInterval(draw, 1500);
    return () => clearInterval(t);
  }, [draw]);
  return (
    <canvas
      ref={ref}
      className="w-full rounded-sm border border-black/50 bg-zinc-900"
      style={{ aspectRatio: '224/120' }}
      role="img"
      aria-label="大气风场图：纬向三环环流、气压中心、急流带与风暴位置"
    />
  );
}

/** 风暴行：名称 + 类型徽章 + 强度条 + 跳转 */
function StormRow({ st }: { st: NatureSnapshot['storms'][number] }) {
  const jumpTo = useGameStore((s) => s.jumpTo);
  const pct = Math.min(100, (st.strength / 1.6) * 100);
  const danger = st.strength > 0.7;
  return (
    <button
      type="button"
      onClick={() => jumpTo(st.x, st.y)}
      className="flex w-full items-center gap-2 rounded-sm border border-zinc-700/70 bg-zinc-800/50 px-2 py-1.5 text-left transition-colors hover:border-teal-500 hover:bg-zinc-700/50"
      aria-label={`跳转到风暴「${st.name}」`}
    >
      <Tornado className={`h-3.5 w-3.5 shrink-0 ${st.kind === 'blizzard' ? 'text-cyan-300' : 'text-teal-300'}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[11px] font-bold text-zinc-200">{st.name}</span>
          <span className={`shrink-0 border px-1 text-[8px] font-bold ${st.kind === 'blizzard' ? 'border-cyan-600 bg-cyan-500/15 text-cyan-300' : 'border-teal-600 bg-teal-500/15 text-teal-300'}`}>
            {st.kind === 'blizzard' ? '冰暴' : '气旋'}
          </span>
          {st.landed && <span className="shrink-0 text-[8px] font-bold text-orange-400">已登陆</span>}
        </span>
        <span className="mt-1 flex h-1.5 overflow-hidden rounded-sm bg-zinc-800">
          <span className={`h-full ${danger ? 'bg-red-400' : st.strength > 0.45 ? 'bg-amber-400' : 'bg-teal-400'}`} style={{ width: `${pct}%` }} />
        </span>
      </span>
      <span className={`shrink-0 font-mono text-[10px] font-bold ${danger ? 'text-red-300' : 'text-zinc-400'}`}>{st.strength.toFixed(2)}</span>
    </button>
  );
}

/** 面板主体（桌面侧栏与移动抽屉共用） */
function NatureBody() {
  const stats = useGameStore((s) => s.stats);
  const events = useGameStore((s) => s.events);
  const nat = stats?.nature;
  const seasonMeta = SEASON_META[nat?.season ?? 1];
  const SeasonIcon = seasonMeta.icon;
  const quakeMeta = QUAKE_RISK_META[nat?.quakeRisk ?? 0];
  const natureEvents: WorldEvent[] = events.filter((e) => NATURE_KINDS.has(e.kind)).slice(0, 7);

  return (
    <div className="game-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      {/* —— 四季轮转 —— */}
      <div className={`rounded-sm border-2 ${seasonMeta.border} bg-zinc-800/60 p-2`}>
        <div className="mb-1.5 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
            <SeasonIcon className={`h-3.5 w-3.5 ${seasonMeta.cls}`} aria-hidden />
            四季轮转
          </p>
          <span className={`text-lg font-black leading-none ${seasonMeta.cls}`}>{nat?.seasonName ?? '夏'}</span>
        </div>
        {/* 季节进度 + 四季刻度（Task 100：当前季段内嵌本季年进度填充——进度随 yearF 连续生长，换季即满格交棒下一段） */}
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-sm" aria-label="季节进度">
          {SEASON_META.map((s, i) => {
            const cur = i === (nat?.season ?? 1);
            const pct = cur ? Math.min(100, Math.max(0, ((nat?.seasonYearIn ?? 0) / (nat?.seasonYears || 2)) * 100)) : 0;
            return (
              <span key={s.label} className={`relative h-full flex-1 ${cur ? 'bg-zinc-700' : 'bg-zinc-700/60'}`} title={`${s.label}季${cur ? ` · 第 ${(nat?.seasonYearIn ?? 0).toFixed(1)} / ${nat?.seasonYears ?? 2} 年` : ''}`}>
                {cur && <span className={`absolute inset-y-0 left-0 ${s.bar}`} style={{ width: `${pct}%` }} />}
              </span>
            );
          })}
        </div>
        <p className="mt-1 text-[9px] text-zinc-500">
          本季 {(nat?.seasonYearIn ?? 0).toFixed(1)}/{nat?.seasonYears ?? 2} 年 · 每季 {nat?.seasonYears ?? 2} 年一轮 · 春催繁衍 冬压火苗
        </p>
        {/* 当季节律（Task 101）：引擎实况计算——种族灭绝的节律自动退场，火险/繁衍等气候节律常驻 */}
        {(nat?.rhythms?.length ?? 0) > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1" aria-label="当季节律">
            {nat!.rhythms.map((r) => (
              <span
                key={r.label}
                title={r.desc}
                className={`cursor-help border px-1.5 py-0.5 text-[9px] font-bold ${RHYTHM_TONE[r.tone]}`}
              >
                {r.label}
              </span>
            ))}
          </div>
        )}
        {/* 火山灰警示 */}
        {(nat?.ash ?? 0) > 0.1 && (
          <p className="mt-1.5 flex items-center gap-1 border border-stone-600 bg-stone-500/15 px-1.5 py-1 text-[9px] font-bold text-stone-300">
            <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
            火山灰遮蔽 {(nat!.ash * 100).toFixed(0)}% —— 天光苍白，霜线南侵，田畴歉收
          </p>
        )}
      </div>

      {/* —— 板块构造 —— */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
            <Mountain className="h-3.5 w-3.5 text-orange-300" aria-hidden />
            板块构造
          </p>
          <span className={`border px-1.5 py-0.5 text-[9px] font-bold ${quakeMeta.cls}`}>应力{quakeMeta.label}</span>
        </div>
        <PlateMap />
        <div className="mt-1.5 grid grid-cols-4 gap-1 text-center">
          {[
            { label: '板块', v: nat?.plates ?? 0 },
            { label: '地震', v: nat?.counters.quakes ?? 0 },
            { label: '强震', v: nat?.counters.quakesBig ?? 0 },
            { label: '喷发', v: nat?.counters.eruptions ?? 0 },
          ].map((x) => (
            <div key={x.label} className="rounded-sm bg-zinc-900/70 p-1">
              <p className="text-[9px] font-bold text-zinc-500">{x.label}</p>
              <p className="font-mono text-xs font-black text-zinc-200">{x.v}</p>
            </div>
          ))}
        </div>
        {/* 近期震中 */}
        {(nat?.recentQuakes.length ?? 0) > 0 && (
          <div className="mt-1.5 grid gap-0.5">
            {nat!.recentQuakes.slice(0, 3).map((q, i) => (
              <p key={i} className="flex items-center gap-1 text-[9px] text-zinc-500">
                <Zap className={`h-2.5 w-2.5 shrink-0 ${q.m >= 7 ? 'text-red-400' : q.m >= 6 ? 'text-amber-400' : 'text-zinc-500'}`} aria-hidden />
                第 {q.year} 年 · M{q.m.toFixed(1)}
              </p>
            ))}
          </div>
        )}
        <p className="mt-1 text-[9px] leading-relaxed text-zinc-600">
          {nat?.plates ?? 6} 大板块持续漂移：会聚边界积聚应力（红热），释放即地震，可掀海啸；离散边界撕裂陆缘成海。
        </p>
      </div>

      {/* —— 大气环流 —— */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
            <Waves className="h-3.5 w-3.5 text-teal-300" aria-hidden />
            大气环流
          </p>
          <span className="flex items-center gap-2 text-[9px] font-bold text-zinc-500">
            <span className="flex items-center gap-0.5" title="云覆盖率">
              <Cloud className="h-3 w-3 text-zinc-400" aria-hidden />
              {Math.round((nat?.cloudCover ?? 0) * 100)}%
            </span>
            <span className="flex items-center gap-0.5" title="平均湿度">
              <Droplets className="h-3 w-3 text-sky-400" aria-hidden />
              {Math.round((nat?.humidity ?? 0) * 100)}%
            </span>
            <span className="flex items-center gap-0.5" title="气压系统：低压/高压中心数">
              <Wind className="h-3 w-3 text-teal-400" aria-hidden />
              L{(nat?.pressure.filter((p) => p.kind === 0).length ?? 0)}/H{(nat?.pressure.filter((p) => p.kind === 1).length ?? 0)}
            </span>
          </span>
        </div>
        <WindMap />
        {/* 气压与环流解读 */}
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
          {[
            { label: '低压中心', v: `${nat?.pressure.filter((p) => p.kind === 0).length ?? 0}`, cls: 'text-red-300', tip: '低压生雨助产风暴' },
            { label: '急流', v: `×${(nat?.jet ?? 1).toFixed(2)}`, cls: 'text-amber-300', tip: '冬季强夏季弱' },
            { label: '辐合带', v: `${(nat?.itcz ?? 0.5) > 0.52 ? '偏北' : (nat?.itcz ?? 0.5) < 0.48 ? '偏南' : '居中'}`, cls: 'text-teal-300', tip: 'ITCZ 随季节摆动' },
          ].map((x) => (
            <div key={x.label} className="rounded-sm bg-zinc-900/70 p-1" title={x.tip}>
              <p className="text-[9px] font-bold text-zinc-500">{x.label}</p>
              <p className={`font-mono text-xs font-black ${x.cls}`}>{x.v}</p>
            </div>
          ))}
        </div>
        {/* 活跃风暴 */}
        {(nat?.storms.length ?? 0) > 0 ? (
          <div className="mt-1.5 grid gap-1">
            {nat!.storms.map((st) => <StormRow key={st.id} st={st} />)}
          </div>
        ) : (
          <p className="mt-1.5 text-center text-[9px] text-zinc-600">暖洋高湿处可能孕育气旋 —— 目前洋面平静</p>
        )}
        <p className="mt-1 text-[9px] leading-relaxed text-zinc-600">
          气压中心驱动风场（北半球 L 逆时针/H 顺时针）；急流是西风带的高速走廊；辐合带随季节摆动——信风与季风随之转向。迎风坡多雨，山背雨影成荒漠；野火顺风延烧。
        </p>
      </div>

      {/* —— 深时引擎（Task 40：连续场耦合 · 地质纪涌现） —— */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
            <Hourglass className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
            深时引擎
          </p>
          <span className="shrink-0 text-[8px] font-bold tracking-wide text-zinc-500">连续场耦合 · 地质纪涌现</span>
        </div>
        {(() => {
          const dt = nat?.deepTime;
          if (!dt) {
            return (
              <p className="text-center text-[9px] leading-relaxed text-zinc-600">
                深时的齿轮尚未转动 —— 生成世界后，侵蚀、沉积、冰川与海平面将在世纪尺度改写大地
              </p>
            );
          }
          const quiet = dt.glacierArea === 0 && dt.eroded === 0 && dt.deposited === 0 && dt.biomeDrift === 0;
          return (
            <>
              <div className="grid grid-cols-3 gap-1 text-center">
                {[
                  { label: '全球均温', v: dt.globalTemp.toFixed(2), cls: 'text-amber-300', tip: '相对温标：0.6 赤道 / −0.5 极地，负值约=冰点以下' },
                  { label: '海平面', v: `${dt.seaLevel >= 0 ? '+' : ''}${dt.seaLevel.toFixed(2)}m`, cls: dt.seaLevel >= 0 ? 'text-sky-300' : 'text-teal-300', tip: '全球均温驱动：正=海侵 / 负=海退' },
                  { label: '冰川覆盖', v: `${(dt.glacierArea * 100).toFixed(2)}%`, cls: 'text-cyan-200', tip: '冰量 >80 的冰盖格占比' },
                  { label: '上升流渔场', v: `${dt.upwelling}`, cls: 'text-teal-300', tip: '赤道东侧与大陆西岸的冷水上翻粗格数' },
                  { label: '土壤均肥', v: `${dt.soilAvg}`, cls: 'text-lime-300', tip: '0-255：沃土复苏快四成、贫土慢一半' },
                  { label: '强流占比', v: `${(dt.currentsStrong * 100).toFixed(0)}%`, cls: 'text-violet-300', tip: '西边界强化指示：流速超阈的洋面占比' },
                  { label: '累计侵蚀', v: dt.eroded.toFixed(2), cls: 'text-amber-300', tip: '水力刻谷总量（海拔单位）' },
                  { label: '累计沉积', v: dt.deposited.toFixed(2), cls: 'text-orange-300', tip: '泛滥平原与三角洲的泥沙落淤总量' },
                  { label: '群系漂移', v: `${dt.biomeDrift}`, cls: 'text-violet-300', tip: '气候错配驱动的累计群系迁移格数' },
                ].map((x) => (
                  <div key={x.label} className="min-w-0 rounded-sm bg-zinc-900/70 p-1" title={x.tip}>
                    <p className="truncate text-[9px] font-bold text-zinc-500">{x.label}</p>
                    <p className={`truncate font-mono text-[10px] font-black ${x.cls}`}>{x.v}</p>
                  </div>
                ))}
              </div>
              {quiet && (
                <p className="mt-1 text-center text-[9px] text-zinc-600">深时的齿轮才刚刚开始转动 —— 世纪尺度自有耐心</p>
              )}
              <p className="mt-1 text-[9px] leading-relaxed text-zinc-600">
                连续海拔被雨水按流量与坡度真实刻蚀，泥沙在平缓低地与河口积成沃野；风与科氏力拧出西向强化的环流，暖流蒸腾、寒流凉岸；极寒累积冰盖、均温牵动海平面——雨影荒漠与雪线进退都是规则交互的自然结果。
              </p>
            </>
          );
        })()}
      </div>

      {/* —— 地质与气象计数 —— */}
      <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-2">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-300">
          <Activity className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          自然纪事
        </p>
        <div className="grid grid-cols-5 gap-1 text-center">
          {[
            { label: '造山', v: nat?.counters.uplifts ?? 0 },
            { label: '侵蚀', v: nat?.counters.erosions ?? 0 },
            { label: '气旋', v: nat?.counters.cyclones ?? 0 },
            { label: '海啸', v: nat?.counters.tsunamis ?? 0 },
            { label: '洪水', v: nat?.counters.floods ?? 0 },
          ].map((x) => (
            <div key={x.label} className="rounded-sm bg-zinc-900/70 p-1">
              <p className="text-[9px] font-bold text-zinc-500">{x.label}</p>
              <p className="font-mono text-xs font-black text-zinc-200">{x.v}</p>
            </div>
          ))}
        </div>
        {/* 自然事件流 */}
        {natureEvents.length > 0 ? (
          <div className="mt-1.5 grid max-h-28 gap-0.5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }} aria-label="自然事件流">
            {natureEvents.map((e) => (
              <p key={e.id} className="flex items-start gap-1 text-[9px] leading-relaxed text-zinc-400">
                <Thermometer className="mt-0.5 h-2.5 w-2.5 shrink-0 text-teal-400" aria-hidden />
                <span className="min-w-0 flex-1">第 {e.year} 年 · {e.text}</span>
              </p>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-center text-[9px] text-zinc-600">大地尚且安分 —— 板块仍在暗中角力</p>
        )}
      </div>
    </div>
  );
}

export function NaturePanel() {
  const { showNature, toggleNature, mobilePanel, openMobilePanel } = useGameStore();
  const stormCount = useGameStore((s) => s.stats?.nature.storms.length ?? 0);
  return (
    <>
      {/* 桌面左侧栏 —— 顶栏自然引擎按钮触发（与王国榜/生态/成就同列互斥） */}
      {showNature && (
        <div className="su-dock-panel w-60 flex-col">
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <MountainSnow className="h-3.5 w-3.5 text-teal-300" aria-hidden />
              自然引擎
              {stormCount > 0 && (
                <span className="rounded-sm border border-teal-600 bg-teal-500/15 px-1 text-[8px] font-bold text-teal-300">{stormCount} 风暴</span>
              )}
            </span>
            <Button variant="ghost" size="icon" onClick={toggleNature} aria-label="关闭自然引擎面板" className="h-6 w-6 rounded-sm hover:bg-zinc-800">
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-2 border-t-0 border-zinc-700/90 bg-zinc-900/95">
            <NatureBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'nature'} onOpenChange={(v) => !v && openMobilePanel('none')}>
        <SheetContent
          side="bottom"
          className="flex h-[58dvh] flex-col rounded-t-lg border-2 border-zinc-700 bg-zinc-900 p-0 [&>button]:hidden"
        >
          <SheetHeader className="border-b border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-sm font-bold text-zinc-200">
              <MountainSnow className="h-4 w-4 text-teal-300" aria-hidden />
              自然引擎
              {stormCount > 0 && (
                <span className="rounded-sm border border-teal-600 bg-teal-500/15 px-1 text-[9px] font-bold text-teal-300">{stormCount} 风暴</span>
              )}
            </SheetTitle>
          </SheetHeader>
          <NatureBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
