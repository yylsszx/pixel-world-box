'use client';
// ============ World Chronicle: 世界纪事事件流面板（桌面右下 + 移动端底部抽屉） ============
// 支持按事件类型过滤（全部/王国/战争/天灾/传奇/大地）
import { useEffect, useMemo, useRef } from 'react';
import { useGameStore, EVENT_CATEGORY, type EventFilter } from '@/store/gameStore';
import type { WorldEvent, WorldEventKind } from '@/lib/game/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollText, X, Flag, Swords, Handshake, Skull, Crown, Flame, Award, Biohazard, Radiation, Sparkles, Star, Ship, Home, Waves, Castle, CloudLightning, Trophy, Mountain, Droplets, Sword, Ghost, Flame as FlameIcon, Zap as ZapIcon, Hammer, Landmark, Coins, Gem, CloudRain, Snowflake, Bug, Sun, MountainSnow, Cloudy, Sparkle, PersonStanding, Eye, FlagTriangleRight, Swords as SwordsIcon, TrendingDown, Map, Landmark as LandmarkIcon, Scroll, BadgeCheck, BadgeX, Lightbulb, TriangleAlert, PartyPopper, Megaphone, CloudDrizzle, Dna, Orbit, Wind, Tornado, CircleDot, Snowflake as SnowIcon, Wheat, Leaf, FlaskConical, Route, Users, HeartCrack, Network, Wand2, TreePine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** 事件类型的图标与主题色 */
export const KIND_META: Record<WorldEventKind, { icon: LucideIcon; color: string }> = {
  found: { icon: Flag, color: 'text-amber-300' },
  king: { icon: Crown, color: 'text-amber-300' },
  angel: { icon: Sparkle, color: 'text-sky-200' },
  phoenix: { icon: FlameIcon, color: 'text-orange-400' },
  ent: { icon: TreePine, color: 'text-emerald-300' },
  lich: { icon: Ghost, color: 'text-violet-300' },
  hydra: { icon: Bug, color: 'text-lime-400' },
  holystorm: { icon: Sun, color: 'text-amber-200' },
  war: { icon: Swords, color: 'text-red-400' },
  peace: { icon: Handshake, color: 'text-emerald-400' },
  fall: { icon: Skull, color: 'text-orange-400' },
  unify: { icon: Crown, color: 'text-amber-200' },
  dragon: { icon: Flame, color: 'text-red-500' },
  legend: { icon: Award, color: 'text-amber-400' },
  plague: { icon: Biohazard, color: 'text-emerald-500' },
  zombie: { icon: Biohazard, color: 'text-lime-500' },
  nuke: { icon: Radiation, color: 'text-yellow-300' },
  meteor: { icon: Sparkles, color: 'text-orange-300' },
  battle: { icon: Star, color: 'text-red-400' },
  colonize: { icon: Ship, color: 'text-teal-300' },
  settle: { icon: Home, color: 'text-emerald-300' },
  shipwreck: { icon: Waves, color: 'text-red-300' },
  river: { icon: Waves, color: 'text-sky-300' },
  oasis: { icon: Droplets, color: 'text-teal-300' },
  rebel: { icon: Castle, color: 'text-rose-400' },
  bandit: { icon: Sword, color: 'text-orange-400' },
  demon: { icon: FlameIcon, color: 'text-red-500' },
  skeleton: { icon: Ghost, color: 'text-zinc-300' },
  trigger: { icon: ZapIcon, color: 'text-amber-400' },
  siege: { icon: Hammer, color: 'text-red-400' },
  capture: { icon: Landmark, color: 'text-amber-400' },
  sack: { icon: Castle, color: 'text-red-500' },
  totalwar: { icon: Swords, color: 'text-red-500' },
  loot: { icon: Gem, color: 'text-yellow-300' },
  build: { icon: Landmark, color: 'text-emerald-300' },
  acidrain: { icon: CloudRain, color: 'text-lime-400' },
  volcano: { icon: MountainSnow, color: 'text-orange-500' },
  tsunami: { icon: Waves, color: 'text-sky-400' },
  blizzard: { icon: Snowflake, color: 'text-cyan-300' },
  locust: { icon: Bug, color: 'text-amber-500' },
  drought: { icon: Sun, color: 'text-yellow-400' },
  meteorshower: { icon: Sparkle, color: 'text-orange-400' },
  whitewalker: { icon: Cloudy, color: 'text-cyan-200' },
  vampire: { icon: PersonStanding, color: 'text-rose-400' },
  kraken: { icon: Waves, color: 'text-fuchsia-400' },
  sandworm: { icon: Bug, color: 'text-amber-600' },
  basilisk: { icon: Eye, color: 'text-lime-600' },
  petrify: { icon: Eye, color: 'text-stone-400' },
  // —— 军团方阵与战争体系 ——
  army: { icon: FlagTriangleRight, color: 'text-amber-300' },
  clash: { icon: SwordsIcon, color: 'text-red-400' },
  rout: { icon: TrendingDown, color: 'text-zinc-400' },
  cession: { icon: Map, color: 'text-orange-300' },
  occupy: { icon: LandmarkIcon, color: 'text-amber-400' },
  capital: { icon: Castle, color: 'text-yellow-300' },
  decree: { icon: Scroll, color: 'text-purple-300' },
  decreeOk: { icon: BadgeCheck, color: 'text-emerald-300' },
  decreeFail: { icon: BadgeX, color: 'text-rose-400' },
  // —— 战争理由体系 ——
  casus: { icon: Megaphone, color: 'text-red-300' },
  collapse: { icon: TrendingDown, color: 'text-zinc-300' },
  // —— 科技研发与社会体系 ——
  tech: { icon: Lightbulb, color: 'text-emerald-300' },
  gov: { icon: Landmark, color: 'text-violet-300' },
  riot: { icon: TriangleAlert, color: 'text-rose-400' },
  festival: { icon: PartyPopper, color: 'text-amber-300' },
  fireOut: { icon: Droplets, color: 'text-sky-300' },
  repair: { icon: Hammer, color: 'text-orange-300' },
  // —— 神力/天灾扩充 ——
  rain: { icon: CloudDrizzle, color: 'text-sky-300' },
  sandstorm: { icon: Wind, color: 'text-amber-500' },
  typhoon: { icon: Tornado, color: 'text-teal-300' },
  sinkhole: { icon: CircleDot, color: 'text-stone-400' },
  iceage: { icon: SnowIcon, color: 'text-cyan-200' },
  famine: { icon: Wheat, color: 'text-yellow-700' },
  blackhole: { icon: Orbit, color: 'text-violet-400' },
  wrath: { icon: CloudLightning, color: 'text-yellow-300' },
  // —— 生物进化与生态竞争 ——
  evolve: { icon: Dna, color: 'text-lime-300' },
  eco: { icon: Leaf, color: 'text-green-400' },
  // —— 成就系统 ——
  achieve: { icon: Trophy, color: 'text-yellow-300' },
  // —— 终极世界大战 ——
  worldwar: { icon: Radiation, color: 'text-red-500' },
  superweapon: { icon: ZapIcon, color: 'text-cyan-300' },
  // —— 涌现纪事（程序化武器/种化/阈值特质） ——
  emerge: { icon: FlaskConical, color: 'text-fuchsia-300' },
  // —— 自然引擎（板块地震/造山/气旋/火山冬） ——
  geo: { icon: Mountain, color: 'text-teal-300' },
  // —— 深度打磨：道路修筑/国际贸易商队 ——
  road: { icon: Route, color: 'text-amber-200' },
  trade: { icon: Coins, color: 'text-yellow-200' },
  // —— 联盟系统（结盟/入盟/叛盟/解散/集体防御） ——
  alliance: { icon: Handshake, color: 'text-teal-300' },
  // —— 种族系统 v2（种族灭绝） ——
  extinct: { icon: Skull, color: 'text-zinc-400' },
  // —— 涌现社会内核：兽群溃逃雪崩 / 血仇得报 / 家族里程碑 ——
  panic: { icon: Users, color: 'text-amber-500' },
  revenge: { icon: HeartCrack, color: 'text-rose-400' },
  lineage: { icon: Network, color: 'text-violet-300' },
  // —— v40：神谕 Agent（法则书写/宣告/热改参数） ——
  oracle: { icon: Wand2, color: 'text-fuchsia-300' },
  // —— 季节 × 万物（换季宣告/生物节律） ——
  season: { icon: Sun, color: 'text-amber-200' },
};

/** 过滤分类的元信息（图标 + 标签 + 主题色） */
const FILTER_META: Record<EventFilter, { icon: LucideIcon; label: string; active: string }> = {
  all: { icon: ScrollText, label: '全部', active: 'border-amber-400 bg-amber-400/15 text-amber-300' },
  kingdom: { icon: Castle, label: '王国', active: 'border-amber-400 bg-amber-400/15 text-amber-300' },
  war: { icon: Swords, label: '战争', active: 'border-red-400 bg-red-400/15 text-red-300' },
  disaster: { icon: CloudLightning, label: '天灾', active: 'border-orange-400 bg-orange-400/15 text-orange-300' },
  legend: { icon: Trophy, label: '传奇', active: 'border-yellow-400 bg-yellow-400/15 text-yellow-300' },
  world: { icon: Mountain, label: '大地', active: 'border-teal-400 bg-teal-400/15 text-teal-300' },
};
const FILTER_ORDER: EventFilter[] = ['all', 'kingdom', 'war', 'disaster', 'legend', 'world'];

/** 事件行内分类徽章色调（战争红 / 生态绿 / 社会紫 / 自然青 / 王国琥珀 / 传奇金） */
const CAT_BADGE: Record<string, string> = {
  kingdom: 'border-amber-600/50 bg-amber-400/10 text-amber-300/90',
  war: 'border-red-600/50 bg-red-400/10 text-red-300/90',
  disaster: 'border-orange-600/50 bg-orange-400/10 text-orange-300/90',
  legend: 'border-yellow-600/50 bg-yellow-400/10 text-yellow-300/90',
  world: 'border-teal-600/50 bg-teal-400/10 text-teal-300/90',
};

/** 过滤标签行（桌面面板与移动端抽屉共用） — 带各类别计数 */
export function FilterRow() {
  const { events, eventFilter, setEventFilter } = useGameStore();
  const counts = useMemo(() => {
    const c: Record<EventFilter, number> = { all: events.length, kingdom: 0, war: 0, disaster: 0, legend: 0, world: 0 };
    for (const ev of events) c[EVENT_CATEGORY[ev.kind] ?? 'world']++;
    return c;
  }, [events]);
  return (
    <div className="flex flex-wrap items-center gap-1 border-b-2 border-zinc-800 bg-zinc-900/80 px-1.5 py-1" role="tablist" aria-label="纪事分类过滤">
      {FILTER_ORDER.map((f) => {
        const meta = FILTER_META[f];
        const Icon = meta.icon;
        const active = eventFilter === f;
        return (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setEventFilter(f)}
            className={`flex items-center gap-1 border-2 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
              active ? meta.active : 'border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
            }`}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {meta.label}
            <span className={`font-mono text-[8px] ${active ? 'opacity-90' : 'text-zinc-500'}`}>{counts[f]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 单条事件行 — 桌面面板与移动端抽屉共用：时间戳 + 分类徽章对齐；图标色即事件类型色 */
export function EventRow({ ev, onJump }: { ev: WorldEvent; onJump: () => void }) {
  const meta = KIND_META[ev.kind] ?? KIND_META.battle;
  const Icon = meta.icon;
  const canJump = ev.x != null && ev.y != null;
  const cat = EVENT_CATEGORY[ev.kind] ?? 'world';
  const catMeta = FILTER_META[cat];
  return (
    <button
      type="button"
      onClick={onJump}
      disabled={!canJump}
      className={`flex w-full items-start gap-1.5 border-b border-zinc-800/80 px-2 py-1.5 text-left transition-colors last:border-b-0 ${
        canJump ? 'cursor-pointer hover:bg-zinc-800/60' : 'cursor-default'
      }`}
      aria-label={`事件：${ev.text}${canJump ? '，点击跳转' : ''}`}
    >
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${meta.color}`} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="mb-0.5 flex items-center gap-1.5">
          <span className="shrink-0 font-mono text-[9px] font-bold tabular-nums tracking-wider text-zinc-400">
            {ev.year}年
          </span>
          <span
            className={`shrink-0 rounded-sm border px-1 text-[8px] font-bold leading-[13px] ${CAT_BADGE[cat] ?? CAT_BADGE.world}`}
            aria-label={`事件分类：${catMeta.label}`}
          >
            {catMeta.label}
          </span>
          {ev.colorHex && (
            <span
              className="ml-auto inline-block h-2 w-2 shrink-0 border border-black/40"
              style={{ backgroundColor: ev.colorHex }}
              aria-hidden
            />
          )}
        </span>
        <span className="block text-[11px] leading-snug text-zinc-300">{ev.text}</span>
      </span>
    </button>
  );
}

/** 事件列表主体（带新事件自动滚顶逻辑） */
function EventList({ events, jumpToEvent }: { events: WorldEvent[]; jumpToEvent: (e: WorldEvent) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  // 新事件到来时若用户接近顶部则自动滚动到顶（不抢占用户向下翻阅历史）
  const lastCountRef = useRef(0);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    if (events.length > lastCountRef.current && vp.scrollTop < 40) {
      vp.scrollTop = 0;
    }
    lastCountRef.current = events.length;
  }, [events]);

  return (
    <div
      ref={viewportRef}
      className="game-scroll max-h-[min(232px,calc(100dvh-290px))] overflow-y-auto border-2 border-t-0 border-zinc-700/90 bg-zinc-900/90 pb-2 shadow-[0_3px_0_rgba(0,0,0,0.6)]"
      role="log"
      aria-label="世界纪事列表"
    >
      {events.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-3 py-6">
          <span className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
            <ScrollText className="h-6 w-6 text-zinc-700" aria-hidden />
          </span>
          <p className="text-center text-[11px] leading-relaxed text-zinc-500">
            这片世界的历史尚未开始书写——<br />
            <span className="text-zinc-600">建国、战争、天灾与传奇都将铭刻于此</span>
          </p>
        </div>
      ) : (
        events.slice(0, 80).map((ev) => (
          <EventRow key={ev.id} ev={ev} onJump={() => jumpToEvent(ev)} />
        ))
      )}
    </div>
  );
}

export function Chronicle() {
  const { events, showChronicle, toggleChronicle, jumpToEvent, mobilePanel, openMobilePanel, eventFilter } = useGameStore();
  const filtered = useMemo(
    () => (eventFilter === 'all' ? events : events.filter((e) => (EVENT_CATEGORY[e.kind] ?? 'world') === eventFilter)),
    [events, eventFilter],
  );

  return (
    <>
      {/* 桌面面板（窄屏隐藏，改由底部抽屉承载）—— 仅顶栏纪事按钮触发时出现，主界面无常驻折叠条 */}
      {showChronicle && (
        <div className="pointer-events-auto absolute bottom-[132px] right-2 z-10 hidden w-[264px] flex-col sm:flex sm:bottom-[124px] su-panel">
          {/* header */}
          <div className="flex items-center justify-between border-2 border-b-0 border-zinc-700/90 bg-zinc-900/95 px-2 py-1 shadow-[0_3px_0_rgba(0,0,0,0.6)]">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <ScrollText className="h-3.5 w-3.5 text-amber-300" aria-hidden />
              世界纪事
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[10px] font-bold text-zinc-500">{events.length}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleChronicle}
                aria-label="关闭纪事面板"
                className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </span>
          </div>
          <FilterRow />
          <EventList events={filtered} jumpToEvent={jumpToEvent} />
        </div>
      )}

      {/* 移动端底部抽屉（由顶栏纪事按钮触发） */}
      <Sheet open={mobilePanel === 'chronicle'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="h-[46vh] rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <ScrollText className="h-4 w-4 text-amber-300" aria-hidden />
              世界纪事
              <span className="ml-auto font-mono text-[10px] font-bold text-zinc-500">{events.length} 条</span>
            </SheetTitle>
          </SheetHeader>
          <FilterRow />
          <div className="game-scroll max-h-[34vh] overflow-y-auto pb-2">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-3 py-5">
                <ScrollText className="h-7 w-7 text-zinc-700" aria-hidden />
                <p className="text-center text-[11px] leading-relaxed text-zinc-500">
                  该分类下暂无事件——<br />
                  <span className="text-zinc-600">切到「全部」看这个世界的全部动静</span>
                </p>
              </div>
            ) : (
              filtered.slice(0, 80).map((ev) => (
                <EventRow key={ev.id} ev={ev} onJump={() => { jumpToEvent(ev); openMobilePanel('none'); }} />
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
