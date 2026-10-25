'use client';
// ============ EyeProvidence（Task 70 移动端沉浸式神明 UI）：神界之眼 ============
// 右上角常驻水晶球（活体小地图）→ 点击展开全屏「神界俯瞰图」。
// 俯瞰图同时是移动端控制中心：原 OmniBar 的全部入口（速度 / 搜索 / 纪事 / 帮助 /
// 存档 / 12 面板网格）迁入此处 —— 移动端顶部从此只剩「一粒岁月沙漏 + 一颗神界之眼」，
// 左下角统计胶囊删除（信息改由俯瞰图的统计行承载）。
import { useEffect, useRef, useState } from 'react';
import { renderMinimap } from '@/lib/game/render';
import { getEngine, useGameStore } from '@/store/gameStore';
import { RACES } from '@/lib/game/types';
import { RACE_DOT } from '@/lib/game/constants';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SpeedDialContent, fmtSpeed } from './SpeedDial';
import {
  Clock, Flower2, Sun, Leaf, CloudSnow, Users, Swords, Flame, PawPrint,
  Pause, Play, FastForward, ChevronsRight, Gauge, Search, ScrollText, CircleHelp, Save,
  LayoutGrid, Crown, MountainSnow, UsersRound, GitBranch, Network, BrainCircuit,
  Sparkles, BookOpen, Zap, Trophy, X, Eye,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** 文明四族键（俯瞰图种族分布行只列文明，野生动物计入统计行） */
const CIV_KEYS = ['human', 'elf', 'dwarf', 'orc'];
/** 季节 0-3 → 图标（春花/夏阳/秋叶/冬雪，与 WorldCluster SeasonBadge 同源） */
const SEASON_ICONS = [Flower2, Sun, Leaf, CloudSnow] as const;
/** 季节 0-3 → 复古四色 */
const SEASON_CLS = ['text-[#a7b97e]', 'text-[#e6ba6c]', 'text-[#d97e55]', 'text-[#7fa9ab]'] as const;

/** 俯瞰图控制行的 12 面板入口（panelId 与 TopBar 移动端面板网格一致；造物图鉴走 toggleCodex） */
const PANELS: { label: string; icon: LucideIcon; open: () => void }[] = [
  { label: '王国榜', icon: Crown, open: () => useGameStore.getState().openMobilePanel('kingdoms') },
  { label: '生态进化', icon: Leaf, open: () => useGameStore.getState().openMobilePanel('eco') },
  { label: '自然引擎', icon: MountainSnow, open: () => useGameStore.getState().openMobilePanel('nature') },
  { label: '种族图鉴', icon: UsersRound, open: () => useGameStore.getState().openMobilePanel('race') },
  { label: '进化图谱', icon: GitBranch, open: () => useGameStore.getState().openMobilePanel('evo') },
  { label: '社会涌现', icon: Network, open: () => useGameStore.getState().openMobilePanel('societal') },
  { label: '神经核心', icon: BrainCircuit, open: () => useGameStore.getState().openMobilePanel('neuro') },
  { label: '神谕 AI', icon: Sparkles, open: () => useGameStore.getState().openMobilePanel('oracle') },
  { label: '造物图鉴', icon: BookOpen, open: () => useGameStore.getState().toggleCodex() },
  { label: '触发器', icon: Zap, open: () => useGameStore.getState().openMobilePanel('triggers') },
  { label: '成就殿堂', icon: Trophy, open: () => useGameStore.getState().openMobilePanel('ach') },
  { label: '世界纪事', icon: ScrollText, open: () => useGameStore.getState().openMobilePanel('chronicle') },
];

/** 控制行速度段（与 OmniBar 运输段同档：暂停/常速/三倍/极速） */
const TRANSPORTS: { v: number; icon: LucideIcon; label: string }[] = [
  { v: 0, icon: Pause, label: '暂停' },
  { v: 1, icon: Play, label: '常速' },
  { v: 3, icon: FastForward, label: '三倍速' },
  { v: 8, icon: ChevronsRight, label: '极速' },
];

/** 控制钮通用底样式（未激活态）：40px 方钮 + 复古暖色描边 */
const CTRL_IDLE =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(214,178,120,0.2)] bg-[rgba(50,42,31,0.5)] text-[#a2957c] transition-colors active:scale-95';
/** 控制钮激活态（当前速度档）：金框金底 */
const CTRL_ON =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[rgba(239,195,119,0.65)] bg-[rgba(217,163,90,0.16)] text-[#efc377] transition-colors active:scale-95';

/** 统计行芯片：图标 + 文案，复古暖色描边圆胶囊 */
function Chip({ icon: Icon, iconCls, textCls, children }: { icon: LucideIcon; iconCls?: string; textCls?: string; children: React.ReactNode }) {
  return (
    <span className={`flex items-center gap-1 rounded-full border border-[rgba(214,178,120,0.2)] bg-[rgba(50,42,31,0.5)] px-2.5 py-1 text-[11px] font-bold ${textCls ?? 'text-[#cfc2a6]'}`}>
      <Icon className={`h-3.5 w-3.5 ${iconCls ?? 'text-[#e6ba6c]'}`} aria-hidden />
      {children}
    </span>
  );
}

/** —— A. 常驻水晶球：64px 圆形玻璃壳 + 活体小地图（100ms 节流重绘） —— */
function ProvidenceOrb({ casting, onOpen }: { casting: boolean; onOpen: () => void }) {
  const cvRef = useRef<HTMLCanvasElement>(null);

  // 水晶球活体小地图：rAF 循环 + 100ms 节流（贴帧率、后台标签自动暂停，比 setInterval 温和）
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const engine = getEngine();
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 100) return; // 100ms 一帧：64px 球面上 10fps 足够「活」
      last = t;
      renderMinimap(engine, ctx, 128, 80, { w: 128, h: 80 });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    // 施法隐身挂在本根上（根自身持有 pointer-events-auto，su-cast-hide 才能真正收走触控）
    <div className={`pointer-events-auto absolute right-2 top-2 z-30 sm:hidden ${casting ? 'su-cast-hide' : 'su-cast-show'}`}>
      <button
        type="button"
        onClick={onOpen}
        aria-label="神界之眼：打开俯瞰图"
        className="su-orb relative block h-16 w-16 transition-transform active:scale-95"
      >
        <canvas
          ref={cvRef}
          width={128}
          height={80}
          className="absolute inset-0 h-full w-full"
          style={{ imageRendering: 'pixelated', borderRadius: 9999 }}
        />
        {/* 右下角微型 Eye 角标：暗示可点，不遮地图主体（地图本身即内容） */}
        <Eye className="absolute bottom-0.5 right-0.5 h-3 w-3 text-[#e6ba6c]/80" aria-hidden />
      </button>
    </div>
  );
}

/** —— B. 全屏俯瞰图：统计行 + 大地图（点击跳转）+ 种族分布 + 控制中心 —— */
function GodViewOverlay({ onClose }: { onClose: () => void }) {
  const stats = useGameStore((s) => s.stats);
  const speed = useGameStore((s) => s.speed);
  const [panelsOpen, setPanelsOpen] = useState(false);
  // 无极调速盘（控制行 Gauge 钮展开；打开时不关闭俯瞰图）
  const [dialOpen, setDialOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 320, h: 200 });

  // 大地图适配：世界 256×160 = 1.6 宽高比，宽受限取宽、高受限按 1.6 反推（ResizeObserver 跟随容器）
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const cw = wrap.clientWidth;
      const ch = wrap.clientHeight;
      if (cw <= 0 || ch <= 0) return;
      const w = Math.min(cw, ch * 1.6);
      setSize({ w: Math.max(80, Math.floor(w)), h: Math.max(50, Math.floor(w / 1.6)) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // 大地图重绘：挂载/改尺寸立即绘一次 + 300ms 节奏刷新（移动端够顺滑且省电）
  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const engine = getEngine();
    // 视口框用主画布真实视口近似（画布满屏铺底，innerWidth/Height 即主视口尺寸）
    const view = { w: window.innerWidth, h: window.innerHeight };
    const draw = () => renderMinimap(engine, ctx, cv.width, cv.height, view);
    draw();
    const timer = window.setInterval(draw, 300);
    return () => window.clearInterval(timer);
  }, [size.w, size.h]);

  // Esc 关闭（物理键盘平板/外接键盘的顺手出口）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 点击大地图：屏幕坐标 → 世界坐标，镜头跳转并解除跟随，随即收起俯瞰回到主视口
  const jump = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const engine = getEngine();
    engine.cam.x = ((e.clientX - rect.left) / rect.width) * 256;
    engine.cam.y = ((e.clientY - rect.top) / rect.height) * 160;
    engine.followId = null;
    onClose();
  };

  // 野生动物总数：byRace 中 RACES 定义 isCiv=false 的种族求和（与 WorldCluster 同源逻辑）
  const wildTotal = stats
    ? Object.entries(stats.byRace).reduce((a, [k, v]) => {
        const def = Object.values(RACES).find((r) => r.key === k);
        return def && !def.isCiv ? a + v : a;
      }, 0)
    : 0;
  // 文明四族分布（0 人口不占位）
  const raceEntries = stats
    ? Object.entries(stats.byRace).filter(([k]) => CIV_KEYS.includes(k))
    : [];
  const season = stats?.nature ? stats.nature.season % 4 : null;

  return (
    <div className="fixed inset-0 z-40 bg-[rgba(13,11,7,0.9)] backdrop-blur-[14px]" role="dialog" aria-label="神界俯瞰图">
      <div className="flex h-full flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {/* 1. 标题行 */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="game-title text-[15px] font-bold text-[#e6ba6c]">神界俯瞰</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭俯瞰图"
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[rgba(214,178,120,0.2)] bg-[rgba(50,42,31,0.5)] text-[#a2957c] transition-colors hover:border-[rgba(214,178,120,0.4)] hover:text-[#f1e8d6] active:scale-95"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* 2. 统计行（原左下角统计胶囊的信息迁入此处） */}
        {stats && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Chip icon={Clock}>
              <span className="font-mono tabular-nums">{stats.year}</span> 年
            </Chip>
            {season != null && stats.nature && (
              <Chip icon={SEASON_ICONS[season]} iconCls={SEASON_CLS[season]}>
                {stats.nature.seasonName}
              </Chip>
            )}
            <Chip icon={Users}>
              <span className="font-mono tabular-nums">{stats.totalPop}</span>
            </Chip>
            {stats.warsCount > 0 && (
              <Chip icon={Swords} iconCls="text-[#d97e55]" textCls="text-[#d97e55]">
                <span className="font-mono tabular-nums">{stats.warsCount}</span>
              </Chip>
            )}
            {stats.fires > 0 && (
              <Chip icon={Flame} iconCls="text-[#dd8f5e]" textCls="text-[#dd8f5e]">
                <span className="font-mono tabular-nums">{stats.fires}</span>
              </Chip>
            )}
            <Chip icon={PawPrint} iconCls="text-[#a2957c]">
              <span className="font-mono tabular-nums">{wildTotal}</span>
            </Chip>
          </div>
        )}

        {/* 3. 大地图（点击任意处跳转视野并收起） */}
        <div ref={wrapRef} className="flex min-h-0 flex-1 items-center justify-center py-2">
          <canvas
            ref={cvRef}
            width={size.w}
            height={size.h}
            onClick={jump}
            className="cursor-pointer rounded-[10px] border border-[rgba(214,178,120,0.22)]"
            style={{ width: size.w, height: size.h, imageRendering: 'pixelated' }}
            aria-label="神界俯瞰大地图，点击任意位置跳转视野"
          />
        </div>

        {/* 4. 种族分布行（文明四族色点 + 人口） */}
        {stats && raceEntries.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {raceEntries.map(([k, v]) => {
              const race = Object.values(RACES).find((r) => r.key === k);
              if (!race || v === 0) return null;
              return (
                <span
                  key={k}
                  className="flex items-center gap-1.5 rounded-full border border-[rgba(214,178,120,0.2)] bg-[rgba(50,42,31,0.5)] px-2.5 py-1 text-[11px] font-bold text-[#cfc2a6]"
                >
                  <span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-black/40" style={{ backgroundColor: RACE_DOT[k] }} aria-hidden />
                  {race.name}
                  <span className="font-mono tabular-nums text-[#8f836a]">{v}</span>
                </span>
              );
            })}
          </div>
        )}

        {/* 5. 控制行（原 OmniBar 移动端入口全迁移：速度 / 搜索 / 纪事 / 帮助 / 存档 / 面板网格） */}
        <div className="game-scroll-x flex items-center gap-1.5 overflow-x-auto py-2">
          {TRANSPORTS.map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => useGameStore.getState().setSpeed(t.v)}
              aria-pressed={speed === t.v}
              aria-label={t.label}
              className={speed === t.v ? CTRL_ON : CTRL_IDLE}
            >
              <t.icon className="h-4 w-4" aria-hidden />
            </button>
          ))}
          {/* 无极调速：打数字 / 滑条 / 预设档（非四档值时亮金并显示实时倍率） */}
          <button
            type="button"
            onClick={() => setDialOpen((v) => !v)}
            aria-label={`无极调速（当前 ${fmtSpeed(speed)}）`}
            aria-expanded={dialOpen}
            className={`${![0, 1, 3, 8].includes(speed) ? CTRL_ON : CTRL_IDLE} gap-1 px-2`}
          >
            <Gauge className="h-4 w-4" aria-hidden />
            <span className="font-mono text-[11px] font-bold tabular-nums">{fmtSpeed(speed)}</span>
          </button>
          {dialOpen && (
            <div className="su-panel su-gaze-in relative my-1 w-full" style={{ borderRadius: 14 }}>
              <SpeedDialContent />
            </div>
          )}
          <span className="h-6 w-px shrink-0 bg-[rgba(214,178,120,0.18)]" aria-hidden />
          <button
            type="button"
            aria-label="搜索一切"
            onClick={() => {
              useGameStore.getState().setPaletteOpen(true);
              onClose();
            }}
            className={CTRL_IDLE}
          >
            <Search className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="世界纪事"
            onClick={() => {
              useGameStore.getState().toggleChronicle();
              onClose();
            }}
            className={CTRL_IDLE}
          >
            <ScrollText className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="帮助"
            onClick={() => {
              useGameStore.getState().toggleHelp();
              onClose();
            }}
            className={CTRL_IDLE}
          >
            <CircleHelp className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="保存世界"
            onClick={() => {
              useGameStore.getState().openSaveDialog('save');
              onClose();
            }}
            className={CTRL_IDLE}
          >
            <Save className="h-4 w-4" aria-hidden />
          </button>
          <span className="h-6 w-px shrink-0 bg-[rgba(214,178,120,0.18)]" aria-hidden />
          {/* 面板网格：12 面板入口（Popover 上弹；点选后关浮层 + 关俯瞰） */}
          <Popover open={panelsOpen} onOpenChange={setPanelsOpen}>
            <PopoverTrigger asChild>
              <button type="button" aria-label="全部面板" className={CTRL_IDLE}>
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="su-panel grid w-64 grid-cols-2 gap-1 p-2">
              {PANELS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    p.open();
                    setPanelsOpen(false);
                    onClose();
                  }}
                  className="flex items-center gap-2 rounded-[9px] border border-[rgba(214,178,120,0.14)] bg-[rgba(50,42,31,0.5)] px-2.5 py-2.5 text-left transition-colors hover:border-[rgba(214,178,120,0.35)] hover:bg-[rgba(62,53,39,0.7)]"
                >
                  <p.icon className="h-3.5 w-3.5 shrink-0 text-[#e6ba6c]" aria-hidden />
                  <span className="text-[11px] font-semibold text-[#f1e8d6]">{p.label}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

export function EyeProvidence() {
  const godView = useGameStore((s) => s.godView);
  const setGodView = useGameStore((s) => s.setGodView);
  const casting = useGameStore((s) => s.casting);

  return (
    <>
      <ProvidenceOrb casting={casting} onOpen={() => setGodView(true)} />
      {godView && <GodViewOverlay onClose={() => setGodView(false)} />}
    </>
  );
}
