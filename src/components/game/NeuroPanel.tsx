'use client';
// ============ NeuroPanel: 神经决策核心（桌面左侧栏 + 移动端底部抽屉） ============
// 465 参数三头微型神经网络的运行面板：架构可视化 / 三头实时统计（调用数·µs·一致率）/
// A-B 开关（神经判定 ↔ 教师策略回退）/ 决策速率。
// Task 37：战或逃头 PPO 强化学习证据区 —— 分歧胜率仪表（Wilson 95% CI）、
// 训练曲线 sparkline、BC↔RL 策略源切换、L1 对比与质量门徽章。1s 轮询 neuro.ts 统计。
// Task 38：在线进化区（局后训练）—— 实时学习开关/三档强度/采集与训练统计/
// 最近评估门结果/上线历史/快栈5份一键回滚/决战冻结指示。
import { useEffect, useRef, useState } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { neuroSnapshot, type NeuroSnapshot } from '@/lib/game/neuro';
import { onlineSnapshot, INTENSITY_HYPER, type OnlineSnapshot, type Intensity } from '@/lib/game/online/online-store';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  BrainCircuit, X, Target, Swords, PawPrint, Cpu, Zap, Activity, Trophy,
  ShieldCheck, TrendingUp, FlaskConical, GraduationCap, RotateCcw, Snowflake, PauseCircle, History, Dna,
} from 'lucide-react';

/** 三头图标与主色 */
const HEAD_META: Record<string, { icon: typeof Target; color: string }> = {
  acc: { icon: Target, color: '#5fe8ff' },
  stance: { icon: Swords, color: '#ffd93d' },
  flight: { icon: PawPrint, color: '#6fd66f' },
};

/** 架构示意图：三列节点（输入→隐层→输出）+ 采样连线 */
function ArchViz({ snap }: { snap: NeuroSnapshot }) {
  const arches = snap.heads.map((h) => h.arch.split('→').map(Number));
  const maxIn = Math.max(...arches.map((a) => a[0]));
  const maxHid = Math.max(...arches.map((a) => a[1]));
  const W = 248;
  const H = 74;
  const colX = [26, 124, 222];
  const dot = (n: number, max: number) => {
    const step = Math.min(9, (H - 10) / Math.max(1, max - 1));
    const y0 = H / 2 - (step * (n - 1)) / 2;
    return Array.from({ length: n }, (_, i) => y0 + i * step);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[74px] w-full" role="img" aria-label="微型网络架构示意">
      {/* 三头泳道分隔 */}
      {[0, 1, 2].map((k) => {
        const a = arches[k];
        const yIn = dot(Math.min(a[0], 6), maxIn);
        const yHid = dot(a[1], maxHid);
        const yOut = dot(a[2], 3);
        const color = Object.values(HEAD_META)[k].color;
        return (
          <g key={k} transform={`translate(0 ${(k - 1) * 0})`} opacity={0.92}>
            {/* 采样连线（隐层→输出 全连；输入→隐层 采样） */}
            {yHid.map((yh, i) =>
              yOut.map((yo, j) => <line key={`ho${i}-${j}`} x1={colX[1]} y1={yh} x2={colX[2]} y2={yo} stroke={color} strokeWidth={0.4} opacity={0.35} />),
            )}
            {yIn.map((yi, i) =>
              yHid.map((yh, j) => (i + j) % 2 === 0 ? <line key={`ih${i}-${j}`} x1={colX[0]} y1={yi} x2={colX[1]} y2={yh} stroke={color} strokeWidth={0.35} opacity={0.22} /> : null),
            )}
            {yIn.map((yi, i) => (
              <circle key={`i${i}`} cx={colX[0]} cy={yi} r={1.7} fill="#a1a1aa" />
            ))}
            {yHid.map((yh, i) => (
              <circle key={`h${i}`} cx={colX[1]} cy={yh} r={2.1} fill={color} />
            ))}
            {yOut.map((yo, j) => (
              <circle key={`o${j}`} cx={colX[2]} cy={yo} r={2.4} fill={color} stroke="#18181b" strokeWidth={0.6} />
            ))}
          </g>
        );
      })}
      <text x={colX[0]} y={H - 1} textAnchor="middle" fontSize={5.5} fill="#71717a">输入</text>
      <text x={colX[1]} y={H - 1} textAnchor="middle" fontSize={5.5} fill="#71717a">tanh 隐层</text>
      <text x={colX[2]} y={H - 1} textAnchor="middle" fontSize={5.5} fill="#71717a">输出</text>
    </svg>
  );
}

/** 分歧胜率仪表：大数字 + Wilson 95% 区间条（50% 教师等价线 / 55% 巩固线） */
function DivWinGauge({ r }: { r: NeuroSnapshot['flightRL'] }) {
  // 区间条刻度域 [0.40, 0.70] —— 覆盖 Wilson 带与两条参考线
  const LO = 0.4;
  const HI = 0.7;
  const px = (v: number) => ((v - LO) / (HI - LO)) * 100;
  const bandL = Math.max(0, px(r.divWilsonLo));
  const bandR = Math.min(100, px(r.divWilsonHi));
  const win = r.divWin;
  const lose = r.divLose;
  return (
    <div>
      <div className="flex items-end justify-between">
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-[22px] font-bold leading-none text-emerald-300">{(r.divWinRate * 100).toFixed(1)}</span>
          <span className="text-[10px] font-bold text-emerald-400">%</span>
        </div>
        <div className="text-right leading-tight">
          <div className="font-mono text-[9px] text-zinc-400">
            胜 <span className="text-emerald-400">{win}</span> / 负 <span className="text-rose-400">{lose}</span>
          </div>
          <div className="text-[8px] text-zinc-600">{(win + lose).toLocaleString()} 分歧局配对评估</div>
        </div>
      </div>
      {/* Wilson 区间条 */}
      <div className="relative mt-1.5 h-[14px]" role="img" aria-label={`分歧胜率 Wilson 95% 区间 ${(r.divWilsonLo * 100).toFixed(1)}% 到 ${(r.divWilsonHi * 100).toFixed(1)}%`}>
        <div className="absolute inset-x-0 top-[5px] h-[4px] rounded-sm bg-zinc-800" />
        {/* 50% 教师等价线 */}
        <div className="absolute top-0 h-[14px] w-px bg-zinc-500" style={{ left: `${px(0.5)}%` }} />
        <div className="absolute -top-px font-mono text-[7px] text-zinc-500" style={{ left: `${px(0.5)}%`, transform: 'translateX(-50%)' }}>50</div>
        {/* 55% 巩固线 */}
        <div className="absolute top-0 h-[14px] w-px bg-emerald-600" style={{ left: `${px(0.55)}%` }} />
        <div className="absolute -top-px font-mono text-[7px] text-emerald-500" style={{ left: `${px(0.55)}%`, transform: 'translateX(-50%)' }}>55</div>
        {/* Wilson 置信带 */}
        <div
          className="absolute top-[3px] h-[8px] rounded-sm border border-emerald-400/70 bg-emerald-400/25"
          style={{ left: `${bandL}%`, width: `${Math.max(2, bandR - bandL)}%` }}
        />
        {/* 点估计 */}
        <div
          className="absolute top-[2px] h-[10px] w-[2px] bg-emerald-200"
          style={{ left: `calc(${Math.min(99, Math.max(1, px(r.divWinRate)))}% - 1px)` }}
        />
      </div>
      <div className="mt-0.5 text-center font-mono text-[8px] text-zinc-500">
        Wilson 95% [{(r.divWilsonLo * 100).toFixed(1)}, {(r.divWilsonHi * 100).toFixed(1)}] · 下界 &gt; 50% ✦ 真超越
      </div>
    </div>
  );
}

/** PPO 训练曲线 sparkline：分歧胜率 × 迭代（55% 巩固参考线 + 最优迭代星标） */
function TrainCurve({ r }: { r: NeuroSnapshot['flightRL'] }) {
  const pts = r.curve;
  if (pts.length < 2) return null;
  const W = 248;
  const H = 44;
  const PAD = 3;
  const maxIter = Math.max(r.iterations, pts[pts.length - 1].i);
  const yLo = 0.25;
  const yHi = 0.7;
  const X = (i: number) => PAD + (i / maxIter) * (W - PAD * 2);
  const Y = (w: number) => H - PAD - ((w - yLo) / (yHi - yLo)) * (H - PAD * 2);
  const line = pts.map((p) => `${X(p.i).toFixed(1)},${Y(p.w).toFixed(1)}`).join(' ');
  const best = pts.reduce((a, b) => (b.w > a.w ? b : a), pts[0]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[44px] w-full" role="img" aria-label="PPO 训练分歧胜率曲线">
      {/* 50% / 55% 参考线 */}
      <line x1={PAD} y1={Y(0.5)} x2={W - PAD} y2={Y(0.5)} stroke="#52525b" strokeWidth={0.6} strokeDasharray="2 2" />
      <line x1={PAD} y1={Y(0.55)} x2={W - PAD} y2={Y(0.55)} stroke="#059669" strokeWidth={0.6} strokeDasharray="2 2" />
      <text x={W - PAD} y={Y(0.55) - 1.2} textAnchor="end" fontSize={5} fill="#10b981">巩固线 55%</text>
      <text x={W - PAD} y={Y(0.5) + 4.5} textAnchor="end" fontSize={5} fill="#71717a">教师 50%</text>
      {/* 面积 + 折线 */}
      <polygon points={`${X(pts[0].i)},${H - PAD} ${line} ${X(pts[pts.length - 1].i)},${H - PAD}`} fill="#34d399" opacity={0.1} />
      <polyline points={line} fill="none" stroke="#34d399" strokeWidth={1.1} strokeLinejoin="round" />
      {/* 最优迭代 */}
      <circle cx={X(best.i)} cy={Y(best.w)} r={1.8} fill="#fbbf24" />
      <text x={X(best.i)} y={Y(best.w) - 3} textAnchor="middle" fontSize={5.5} fill="#fbbf24">★ i{best.i}</text>
      {/* 轴标注 */}
      <text x={PAD} y={H - 0.5} fontSize={5} fill="#71717a">i0</text>
      <text x={W - PAD} y={H - 0.5} textAnchor="end" fontSize={5} fill="#71717a">i{maxIter}</text>
    </svg>
  );
}

function NeuroBody() {
  const [snap, setSnap] = useState<NeuroSnapshot | null>(null);
  const [onSnap, setOnSnap] = useState<OnlineSnapshot | null>(null);
  const [rate, setRate] = useState(0);
  const prevRef = useRef<{ t: number; calls: number } | null>(null);

  useEffect(() => {
    const poll = () => {
      const s = neuroSnapshot();
      setOnSnap(onlineSnapshot());
      const total = s.heads.reduce((a, h) => a + h.calls, 0);
      const now = performance.now();
      const prev = prevRef.current;
      if (prev) {
        const dt = (now - prev.t) / 1000;
        if (dt > 0.2) setRate(Math.max(0, (total - prev.calls) / dt));
      }
      prevRef.current = { t: now, calls: total };
      setSnap(s);
    };
    poll();
    const iv = setInterval(poll, 1000);
    return () => clearInterval(iv);
  }, []);

  if (!snap) return <div className="p-3 text-[10px] text-zinc-500">初始化神经核心…</div>;
  const totalCalls = snap.heads.reduce((a, h) => a + h.calls, 0);
  const liveUs = snap.heads.filter((h) => h.usPerCall > 0);
  const avgUs = liveUs.length ? liveUs.reduce((a, h) => a + h.usPerCall, 0) / liveUs.length : 0;
  const isRL = snap.flightMode === 'rl';
  const R = snap.flightRL;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5 pb-5">
      {/* 英雄卡：模型概览 */}
      <section className="rounded-sm border-2 border-teal-900/70 bg-teal-950/20 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-teal-200">
            <Cpu className="h-3.5 w-3.5" aria-hidden />
            {snap.totalParams} 参数 · Int8 量化
          </span>
          <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 font-mono text-[8px] text-zinc-400">
            {new Date(snap.trainedAt).toLocaleDateString('zh-CN')}
          </span>
        </div>
        <ArchViz snap={snap} />
        <div className="grid grid-cols-3 gap-1 px-0.5 text-center">
          <div className="rounded-sm bg-zinc-900/70 px-1 py-1">
            <div className="font-mono text-[11px] font-bold text-teal-300">{rate >= 1000 ? `${(rate / 1000).toFixed(1)}k` : Math.round(rate)}</div>
            <div className="text-[8px] text-zinc-500">决策/秒</div>
          </div>
          <div className="rounded-sm bg-zinc-900/70 px-1 py-1">
            <div className="font-mono text-[11px] font-bold text-teal-300">{avgUs > 0 ? avgUs.toFixed(2) : '—'}</div>
            <div className="text-[8px] text-zinc-500">µs/次（采样）</div>
          </div>
          <div className="rounded-sm bg-zinc-900/70 px-1 py-1">
            <div className="font-mono text-[11px] font-bold text-teal-300">{totalCalls >= 10000 ? `${(totalCalls / 1000).toFixed(0)}k` : totalCalls}</div>
            <div className="text-[8px] text-zinc-500">累计决策</div>
          </div>
        </div>
      </section>

      {/* A/B 开关 */}
      <section className="flex items-center justify-between rounded-sm border-2 border-zinc-700/80 bg-zinc-900/60 px-2.5 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-200">
            <Zap className={`h-3.5 w-3.5 ${snap.enabled ? 'text-amber-300' : 'text-zinc-600'}`} aria-hidden />
            {snap.enabled ? '神经判定生效中' : '教师策略回退中'}
          </div>
          <div className="text-[8.5px] leading-snug text-zinc-500">
            {snap.enabled ? '引擎三类热路径由微型网络判定' : 'A/B 对照：关闭网络，走规则教师策略'}
          </div>
        </div>
        <Switch
          checked={snap.enabled}
          onCheckedChange={(v) => {
            getEngine().setNeuro(v);
            setSnap(neuroSnapshot());
          }}
          aria-label="神经决策核心开关"
        />
      </section>

      {/* ══ Task 37 · 战或逃强化学习（路径B）══ */}
      <section className={`rounded-sm border-2 p-2.5 ${isRL ? 'border-emerald-800/80 bg-emerald-950/15' : 'border-zinc-700/80 bg-zinc-900/60'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-200">
            <FlaskConical className={`h-3.5 w-3.5 ${isRL ? 'text-emerald-300' : 'text-zinc-500'}`} aria-hidden />
            战或逃 · 策略源
          </span>
          {/* BC ↔ RL 分段切换（统一固定高度，双按钮严格等高对齐） */}
          <div className="flex h-[19px] overflow-hidden rounded-sm border border-zinc-700" role="group" aria-label="战或逃策略源切换">
            <button
              type="button"
              onClick={() => { getEngine().neuroSetFlightMode('rl'); setSnap(neuroSnapshot()); }}
              className={`flex h-full items-center justify-center gap-1 px-2 text-[9px] font-bold leading-none transition-colors ${isRL ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
              aria-pressed={isRL}
            >
              <FlaskConical className="h-2.5 w-2.5 shrink-0" aria-hidden />
              PPO 强化
            </button>
            <button
              type="button"
              onClick={() => { getEngine().neuroSetFlightMode('bc'); setSnap(neuroSnapshot()); }}
              className={`flex h-full items-center justify-center gap-1 px-2 text-[9px] font-bold leading-none transition-colors ${!isRL ? 'bg-teal-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
              aria-pressed={!isRL}
            >
              <GraduationCap className="h-2.5 w-2.5 shrink-0" aria-hidden />
              行为克隆
            </button>
          </div>
        </div>

        {isRL ? (
          <div className="mt-3 space-y-2">
            {/* L2 分歧胜率（核心超越证据） */}
            <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-300/90">
              <Trophy className="h-3 w-3" aria-hidden />
              分歧胜率 —— 与教师不同决策处的对局胜负
            </div>
            <DivWinGauge r={R} />
            {/* 训练曲线 */}
            <div className="flex items-center justify-between text-[9px] font-bold text-zinc-400">
              <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" aria-hidden />训练曲线</span>
              <span className="font-mono text-[8px] text-zinc-600">PPO {R.iterations} 迭代 · 96 局/迭代</span>
            </div>
            <TrainCurve r={R} />
            {/* L1 对比 + 质量门 */}
            <div className="grid grid-cols-2 gap-1">
              <div className="rounded-sm bg-zinc-900/80 px-1.5 py-1">
                <div className="text-[8px] text-zinc-600">回报（3000 局）</div>
                <div className="font-mono text-[10px] font-bold text-emerald-300">{R.rlReturn.toFixed(3)}</div>
                <div className="font-mono text-[8px] text-zinc-500">教师 {R.teacherReturn.toFixed(3)}（+{(R.rlReturn - R.teacherReturn).toFixed(3)}）</div>
              </div>
              <div className="rounded-sm bg-zinc-900/80 px-1.5 py-1">
                <div className="text-[8px] text-zinc-600">存活率</div>
                <div className="font-mono text-[10px] font-bold text-emerald-300">{(R.rlSurvival * 100).toFixed(1)}%</div>
                <div className="font-mono text-[8px] text-zinc-500">教师 {(R.teacherSurvival * 100).toFixed(1)}%</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="flex items-center gap-0.5 rounded-sm border border-emerald-800/70 bg-emerald-900/25 px-1.5 py-0.5 font-mono text-[7.5px] text-emerald-300">
                <ShieldCheck className="h-2.5 w-2.5" aria-hidden />
                必逃区一致 {(R.mustFleeAgree * 100).toFixed(1)}%
              </span>
              <span className="rounded-sm border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[7.5px] text-zinc-400">
                分歧率 {(R.divRate * 100).toFixed(1)}%
              </span>
              <span className="rounded-sm border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[7.5px] text-zinc-400">
                灰区 {(R.grayRate * 100).toFixed(1)}%
              </span>
              <span className="rounded-sm border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[7.5px] text-zinc-400">
                策略 98P
              </span>
            </div>
            <p className="text-[8px] leading-relaxed text-zinc-600">
              路径B：行为克隆初始化 → PPO 微调（KL 锚退火 + 熵退火防塌缩）→ 分歧评估。
              分歧处胜率超 50% 且置信下界过线 = 真超越教师，非「更像教师」。
            </p>
          </div>
        ) : (
          <p className="mt-1.5 text-[8.5px] leading-snug text-zinc-500">
            行为克隆版：教师策略的分段线性蒸馏（一致率 99.0%）。切换到「PPO 强化」查看强化学习版的超越证据。
          </p>
        )}
      </section>

      {/* ══ Task 38 · 在线进化（局后训练）══ */}
      <OnlineSection o={onSnap} refresh={() => setOnSnap(onlineSnapshot())} />

      {/* 三头卡片 */}
      {snap.heads.map((h) => {
        const m = HEAD_META[h.key];
        const Icon = m.icon;
        const flightRLMode = h.key === 'flight' && isRL;
        return (
          <section key={h.key} className="rounded-sm border-2 border-zinc-700/80 bg-zinc-900/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-200">
                <Icon className="h-3.5 w-3.5" style={{ color: m.color }} aria-hidden />
                {h.name}
              </span>
              <div className="flex items-center gap-1">
                {flightRLMode && (
                  <span className="rounded-sm bg-emerald-500 px-1 py-px text-[7.5px] font-bold text-zinc-950">RL</span>
                )}
                <span className="rounded-sm bg-zinc-800 px-1.5 py-0.5 font-mono text-[8.5px] font-bold" style={{ color: m.color }}>
                  {h.arch}
                </span>
              </div>
            </div>
            <p className="mt-0.5 text-[9px] leading-snug text-zinc-500">{h.desc}</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1 text-center">
              <div className="rounded-sm bg-zinc-900/80 px-1 py-1">
                <div className="font-mono text-[10px] font-bold text-zinc-200">{h.calls >= 1000 ? `${(h.calls / 1000).toFixed(1)}k` : h.calls}</div>
                <div className="text-[8px] text-zinc-600">调用</div>
              </div>
              <div className="rounded-sm bg-zinc-900/80 px-1 py-1">
                <div className="font-mono text-[10px] font-bold text-zinc-200">{h.usPerCall > 0 ? h.usPerCall.toFixed(2) : '—'}</div>
                <div className="text-[8px] text-zinc-600">µs</div>
              </div>
              <div className="rounded-sm bg-zinc-900/80 px-1 py-1">
                <div className={`font-mono text-[10px] font-bold ${h.audits >= 20 ? (h.auditPct >= 90 ? 'text-emerald-400' : 'text-amber-400') : 'text-zinc-500'}`}>
                  {h.audits >= 20 ? `${h.auditPct.toFixed(0)}%` : '—'}
                </div>
                <div className="text-[8px] text-zinc-600">{flightRLMode ? '教师重合率' : '运行一致率'}</div>
              </div>
            </div>
            <div className="mt-1 flex min-w-0 items-center justify-between gap-1 text-[8.5px]">
              <span className="flex min-w-0 items-center gap-1 text-zinc-600">
                <Activity className="h-2.5 w-2.5 shrink-0" aria-hidden />
                <span className="truncate">{flightRLMode ? '评估：' : '验证集：'}{h.valText}</span>
              </span>
              <span className="shrink-0 font-mono text-zinc-600">{h.params}P</span>
            </div>
            {flightRLMode && (
              <p className="mt-0.5 text-[7.5px] leading-snug text-zinc-600">
                与教师重合率 ≠ 决策质量：RL 版刻意在灰区改判（分歧即探索所得的增量策略）
              </p>
            )}
          </section>
        );
      })}

      {/* 脚注 */}
      <p className="border-t border-zinc-800 pt-1.5 text-[9px] leading-relaxed text-zinc-600">
        命中/姿态：行为克隆蒸馏（教师 = 专家规则，60k 样本 · Bun 手写反向传播 · Int8 量化复检）。
        战或逃：路径B 强化学习（BC 初始化 → PPO 240 迭代 → 3000 配对局分歧评估，Wilson 下界过线），
        可在游玩中开启「在线进化」持续局后训练（Worker 后台 · 四重评估门 · 可回滚）。
        每 97 次决策抽审与教师对照。关闭总开关可 A/B 对照网络与规则策略。
      </p>
    </div>
  );
}

/** ══ Task 38 在线进化区：局后训练开关/强度/统计/评估门/快照回滚 ══ */
function OnlineSection({ o, refresh }: { o: OnlineSnapshot | null; refresh: () => void }) {
  if (!o) return null;
  const stateLabel = o.paused
    ? { text: '已暂停（连续未过门）', cls: 'text-rose-300', Icon: PauseCircle }
    : o.frozen
      ? { text: '决战冻结中', cls: 'text-sky-300', Icon: Snowflake }
      : o.enabled
        ? { text: '实时进化中', cls: 'text-emerald-300', Icon: Dna }
        : { text: '已关闭', cls: 'text-zinc-500', Icon: Dna };
  const StIcon = stateLabel.Icon;
  const evalOk = o.lastEval?.passed === true;
  return (
    <section className={`rounded-sm border-2 p-2.5 ${o.enabled ? 'border-fuchsia-900/70 bg-fuchsia-950/10' : 'border-zinc-700/80 bg-zinc-900/60'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-zinc-200">
          <Dna className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" aria-hidden />
          在线进化 · 局后训练
        </span>
        <Switch
          checked={o.enabled}
          onCheckedChange={(v) => { getEngine().setOnlineFlight(v); refresh(); }}
          aria-label="在线实时学习开关"
        />
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[9px] font-bold" style={{ color: 'currentColor' }}>
        <StIcon className={`h-3 w-3 ${stateLabel.cls}`} aria-hidden />
        <span className={stateLabel.cls}>{stateLabel.text}</span>
        {o.persisted ? null : <span className="text-amber-400">· 存储降级内存态</span>}
      </div>

      {o.enabled && (
        <div className="mt-2">
          {/* 学习强度三档（固定高度分段，等高对齐） */}
          <div className="flex h-[19px] overflow-hidden rounded-sm border border-zinc-700" role="group" aria-label="学习强度">
            {(['conservative', 'balanced', 'aggressive'] as Intensity[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { getEngine().setOnlineFlightIntensity(k); refresh(); }}
                className={`flex h-full flex-1 items-center justify-center px-1.5 text-[9px] font-bold leading-none transition-colors ${o.intensity === k ? 'bg-fuchsia-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                aria-pressed={o.intensity === k}
                title={INTENSITY_HYPER[k].desc}
              >
                {INTENSITY_HYPER[k].label}
              </button>
            ))}
          </div>
          <p className="mt-0.5 text-center font-mono text-[7.5px] text-zinc-600">{INTENSITY_HYPER[o.intensity].desc}</p>

          {/* 采集与训练统计 */}
          <div className="mt-1.5 grid grid-cols-4 gap-1 text-center">
            <div className="rounded-sm bg-zinc-900/80 px-0.5 py-1">
              <div className="font-mono text-[10px] font-bold text-fuchsia-300">{fmtNum(o.sessions)}</div>
              <div className="text-[7.5px] text-zinc-600">遭遇会话</div>
            </div>
            <div className="rounded-sm bg-zinc-900/80 px-0.5 py-1">
              <div className="font-mono text-[10px] font-bold text-fuchsia-300">{fmtNum(o.episodes)}</div>
              <div className="text-[7.5px] text-zinc-600">完成回放</div>
            </div>
            <div className="rounded-sm bg-zinc-900/80 px-0.5 py-1">
              <div className="font-mono text-[10px] font-bold text-fuchsia-300">{fmtNum(o.worker?.steps ?? 0)}</div>
              <div className="text-[7.5px] text-zinc-600">训练步数</div>
            </div>
            <div className="rounded-sm bg-zinc-900/80 px-0.5 py-1">
              <div className="font-mono text-[10px] font-bold text-fuchsia-300">{o.worker?.updates ?? 0}</div>
              <div className="text-[7.5px] text-zinc-600">PPO 更新</div>
            </div>
          </div>

          {/* 最近评估门 */}
          {o.lastEval && (
            <div className={`mt-1.5 rounded-sm border px-1.5 py-1 ${evalOk ? 'border-emerald-800/70 bg-emerald-900/20' : 'border-rose-900/70 bg-rose-900/15'}`}>
              <div className="flex min-w-0 items-center justify-between gap-1 text-[8.5px] font-bold">
                <span className={`min-w-0 truncate ${evalOk ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {evalOk ? '✓ 评估门通过 · 权重已上线' : `✗ 候选被拒：${o.lastEval.reason}`}
                </span>
                <span className="shrink-0 font-mono text-zinc-500">第 {o.lastEval.updates} 次更新</span>
              </div>
              <div className="mt-0.5 grid grid-cols-3 gap-1 font-mono text-[8.5px] text-zinc-400">
                <span>必逃 {(o.lastEval.mustFlee * 100).toFixed(1)}%</span>
                <span>必战 {(o.lastEval.mustFight * 100).toFixed(1)}%</span>
                <span>分歧胜 {(o.lastEval.divWinRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          )}

          {/* 上线历史 / 拒绝统计 */}
          <div className="mt-1.5 flex items-center justify-between gap-1 text-[8.5px] text-zinc-500">
            <span className="flex min-w-0 items-center gap-1">
              <History className="h-2.5 w-2.5 shrink-0" aria-hidden />
              <span className="truncate">上线 {o.promotes.length} 次 · 拒绝 {o.rejects} 次 · 自动回退 {o.autoRollbacks}</span>
            </span>
            {o.baselineDrift !== 0 && (
              <span className={`shrink-0 font-mono ${o.baselineDrift < -0.005 ? 'text-amber-400' : 'text-zinc-500'}`}>
                基线 {(o.baselineDrift * 100).toFixed(1)}pt
              </span>
            )}
          </div>

          {/* 快照栈（一键回滚） */}
          {o.snapshotsMeta.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {o.snapshotsMeta.map((s, i) => (
                <button
                  key={s.at}
                  type="button"
                  onClick={() => { getEngine().rollbackFlightOnline(o.snapshotsMeta.length - 1 - i); refresh(); }}
                  className="flex items-center gap-0.5 rounded-sm border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[7.5px] text-zinc-400 hover:border-fuchsia-700 hover:text-fuchsia-300"
                  aria-label={`回滚到第 ${s.promoteIdx} 次上线前的权重`}
                >
                  <RotateCcw className="h-2.5 w-2.5" aria-hidden />
                  #{s.promoteIdx}
                </button>
              ))}
            </div>
          )}

          {/* 暂停提示 */}
          {o.paused && (
            <p className="mt-1.5 rounded-sm border border-rose-900/60 bg-rose-950/20 px-1.5 py-1 text-[8px] leading-snug text-rose-300">
              连续 3 次候选未过评估门，已自动回滚并暂停。可切换学习强度重启，或回滚到任一快照。
            </p>
          )}
        </div>
      )}

      {!o.enabled && (
        <p className="mt-1.5 text-[8.5px] leading-snug text-zinc-500">
          开启后：游玩中野生动物的每次遭遇战都会成为训练样本（引擎采集 &lt;0.1µs/决策），
          后台 Worker 每 256 步局后批量更新，每 10 次更新过四重评估门（必逃≥99% / 必战≥95% /
          分歧胜率不倒退 / 无 NaN）才上线新权重 —— 全程可回滚，决战时自动冻结。
        </p>
      )}
    </section>
  );
}

const fmtNum = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export function NeuroPanel() {
  const { showNeuro, toggleNeuro, mobilePanel, openMobilePanel } = useGameStore();
  return (
    <>
      {/* 桌面左侧栏 */}
      {showNeuro && (
        <div className="su-dock-panel w-72 flex-col">
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <BrainCircuit className="h-3.5 w-3.5 text-teal-300" aria-hidden />
              神经决策核心
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleNeuro}
              aria-label="关闭神经核心面板"
              className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex max-h-[calc(100dvh-96px-33px)] min-h-[300px] flex-col border-2 border-zinc-700/90 bg-zinc-900/95">
            <NeuroBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'neuro'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[58vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <BrainCircuit className="h-4 w-4 text-teal-300" aria-hidden />
              神经决策核心
            </SheetTitle>
          </SheetHeader>
          <NeuroBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
