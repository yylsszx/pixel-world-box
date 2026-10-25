'use client';
// ============ 终极世界大战 HUD（顶部战况横幅） ============
// Task 68 车道感知几何（永不遮挡其他 UI）：
// - OmniBar（全宽）下缘 ≈56px → 横幅 sm:top-[60px] 紧贴其下；
// - 移动端（Task 70）：左上统计胶囊已删（神明 UI 接管），横幅上移 top-[64px]（岁月沙漏胶囊之下）；
// - 侧边坞开启（神谕等最宽 w-80：8+48+1+320=377）→ 锚点 sm:left-[392px]；坞关仅导航轨 → sm:left-[64px]；
// - 右侧面板（文明详情 w-72 / 触发器 / 检查器）打开 → 锚点 sm:right-[296px]；
// - 内层 mx-auto 在让位后的自由区间内居中。
// running：红框脉冲横幅（存活/阵亡/停战/核爆实时战况）
// ended：终战结算横幅（胜者/同归于尽 + 终战檄文），可手动关闭；新一轮大战（startTick 变化）自动复位
import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Radiation, Crown, Skull, X, Zap, Orbit } from 'lucide-react';

export function WorldWarHud() {
  const stats = useGameStore((s) => s.stats);
  const devMode = useGameStore((s) => s.devMode);
  const toggleDevPanel = useGameStore((s) => s.toggleDevPanel);
  // 车道感知：左列面板（神谕/王国榜/生态/自然/进化/社会/种族/神经/成就/开发者）
  const leftOpen = useGameStore(
    (s) =>
      s.showKingdoms || s.showEco || s.showAch || s.showNature || s.showEvo ||
      s.showRace || s.showNeuro || s.showSocietal || s.showOracle || s.showDev,
  );
  // 车道感知：右列面板（文明详情 / 触发器 / 单位·文明检查器）
  const rightOpen = useGameStore(
    (s) => s.civPanelCiv != null || s.showTriggers || s.selUnit != null || s.selCiv != null,
  );
  const ww = stats?.worldWar ?? null;
  /** 终战横幅关闭标记（存开战 tick：新一轮大战 startTick 变化 → 自动重新展示） */
  const [dismissedTick, setDismissedTick] = useState(-1);

  if (!ww) return null;
  if (ww.phase === 'ended' && dismissedTick === ww.startTick) return null;

  const openConsole = () => {
    if (devMode) toggleDevPanel();
  };

  /** 锚层：全宽定位带（pointer-events-none），内层内容在让位后的自由区间居中 */
  const anchorCls = `pointer-events-none absolute left-2 right-2 top-[64px] z-20 sm:top-[60px]${
    leftOpen ? ' sm:left-[392px]' : ' sm:left-[64px]'
  }${rightOpen ? ' sm:right-[296px]' : ''}`;

  if (ww.phase === 'running') {
    return (
      <div className={anchorCls}>
        <button
          type="button"
          onClick={openConsole}
          aria-label={`终极世界大战进行中，第 ${ww.years} 年，存活 ${ww.alive} 个参战国`}
          title={devMode ? '点击打开开发者面板 · 大战控制台' : '终极世界大战进行中（不死不休）'}
          className="pointer-events-auto mx-auto flex w-fit flex-col items-center gap-0.5 rounded-sm border-2 border-red-600/80 bg-zinc-950/90 px-3 py-1.5 text-center shadow-[0_3px_0_rgba(0,0,0,0.6)] animate-pulse"
        >
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
            <Radiation className="h-3.5 w-3.5 text-red-400" aria-hidden />
            终极世界大战 · 第 {ww.years} 年
            {ww.frenzy && <Zap className="h-3.5 w-3.5 animate-pulse text-amber-300" aria-label="终局狂热" />}
            <Radiation className="h-3.5 w-3.5 text-red-400" aria-hidden />
          </span>
          {ww.frenzy && (
            <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-amber-300">
              <Zap className="h-2.5 w-2.5" aria-hidden />
              终局狂热 · 反物质解禁
            </span>
          )}
          <span className="flex flex-wrap items-center justify-center gap-x-2 font-mono text-[9px] text-zinc-400">
            <span>存活 <b className="text-red-300">{ww.alive}</b>/{ww.belligerents} 国</span>
            <span>阵亡 <b className="text-red-400">{ww.kills}</b></span>
            <span>停战 <b className="text-amber-300">{ww.truces}</b></span>
            <span>核爆 <b className="text-yellow-300">{ww.nukes}</b></span>
            {ww.modernCivs > 0 && <span>现代军备 <b className="text-orange-300">{ww.modernCivs}</b> 国</span>}
            {ww.futureCivs > 0 && (
              <span className="flex items-center gap-0.5">
                <Orbit className="h-2.5 w-2.5 text-cyan-300" aria-hidden />
                未来军备 <b className="text-cyan-300">{ww.futureCivs}</b> 国
              </span>
            )}
            {ww.antimatters > 0 && <span className="text-fuchsia-300">湮灭 <b>{ww.antimatters}</b></span>}
            {ww.emergent > 0 && <span className="text-fuchsia-300">涌现武器 <b>{ww.emergent}</b></span>}
          </span>
        </button>
      </div>
    );
  }

  // —— ended：终战结算横幅 ——
  return (
    <div className={anchorCls}>
      <div
        role="status"
        className="pointer-events-auto mx-auto flex w-[min(100%,26rem)] flex-col gap-0.5 rounded-sm border-2 border-amber-600/80 bg-zinc-950/92 px-3 py-1.5 shadow-[0_3px_0_rgba(0,0,0,0.6)]"
      >
        <div className="flex items-center justify-between gap-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
            {ww.winnerName ? <Crown className="h-3.5 w-3.5 text-amber-400" aria-hidden /> : <Skull className="h-3.5 w-3.5 text-zinc-400" aria-hidden />}
            终极世界大战终局 · 持续 {ww.years} 年
          </p>
          <button
            type="button"
            onClick={() => setDismissedTick(ww.startTick)}
            aria-label="关闭终战横幅"
            className="shrink-0 text-zinc-500 transition-colors hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
        <p className="text-[9px] leading-tight text-zinc-400">
          {ww.winnerName ? <>胜者 <b className="text-amber-300">「{ww.winnerName}」</b> · </> : <>无胜者 · </>}
          {ww.endText}
        </p>
        {ww.fallen.length > 0 && (
          <p className="truncate text-[8px] text-zinc-600" title={ww.fallen.map((f) => f.name).join('、')}>
            陨落：{ww.fallen.map((f) => f.name).join('、')}
          </p>
        )}
      </div>
    </div>
  );
}
