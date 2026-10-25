'use client';
// ============ World Cluster（Task 68 超级 UI）：世界罗盘 ============
// 原左下角「统计柱 + 小地图」两件浮层 → 整合为一座玻璃罗盘：
//   头部（纪元·季节·人口·警示）+ 展开种族明细 + 全域地图（点击跳转）。
// 让位协议：宽 184（=左缘16+184+隙8 → 工具坞让位带 208）；
//   面板 max-h 预算按本壳全展开高度（~260）推得 calc(100dvh-352px)。
// 移动端：统计胶囊置于 OmniBar 之下（罗盘地图桌面专属，与旧小地图一致）。
import { useEffect, useRef, useState } from 'react';
import { renderMinimap } from '@/lib/game/render';
import { getEngine, useGameStore } from '@/store/gameStore';
import { RACES } from '@/lib/game/types';
import { RACE_DOT } from '@/lib/game/constants';
import { Clock, Users, Swords, Tornado, CloudRain, Flower2, Sun, Leaf, CloudSnow, PawPrint, Sailboat, Flame, ChevronDown } from 'lucide-react';

const MW = 160;
const MH = 100;
const CIV_KEYS = ['human', 'elf', 'dwarf', 'orc'];

/** 季节图标 + 复古四色 */
function SeasonBadge({ season, name }: { season: number; name: string }) {
  const cls =
    season === 3 ? 'text-[#7fa9ab]' : season === 0 ? 'text-[#a7b97e]' : season === 2 ? 'text-[#d97e55]' : 'text-[#e6ba6c]';
  const Icon = season === 0 ? Flower2 : season === 1 ? Sun : season === 2 ? Leaf : CloudSnow;
  return (
    <span className={`flex items-center gap-1.5 text-[11px] font-bold tracking-wider ${cls}`} title={`自然引擎 · ${name}季`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {name}
    </span>
  );
}

/** 统计头部（桌面罗盘头 / 移动端胶囊共用内容） */
function ClusterHeader({ expanded, setExpanded }: { expanded: boolean; setExpanded: (v: boolean) => void }) {
  const stats = useGameStore((s) => s.stats);
  if (!stats) return null;

  const raceEntries = Object.entries(stats.byRace).filter(([k]) => CIV_KEYS.includes(k));
  const wildTotal = Object.entries(stats.byRace).reduce((a, [k, v]) => {
    const def = Object.values(RACES).find((r) => r.key === k);
    return def && !def.isCiv ? a + v : a;
  }, 0);

  return (
    <>
      {/* 行1：纪元 + 折叠钮 */}
      <div className="flex items-center justify-between gap-1 py-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[#f1e8d6]">
          <Clock className="h-3.5 w-3.5 text-[#e6ba6c]" aria-hidden />
          纪元 <span className="font-mono tabular-nums">{stats.year}</span> 年
        </span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? '收起种族明细' : '展开种族明细'}
          title={expanded ? '收起种族明细' : '展开种族明细（四大文明人口）'}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded-md border border-[rgba(214,178,120,0.22)] bg-[rgba(50,42,31,0.55)] text-[#8f836a] transition-colors hover:border-[rgba(214,178,120,0.4)] hover:text-[#f1e8d6] sm:flex"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </div>

      {/* 行2：季节 + 风暴/火山灰警示 */}
      {stats.nature && (
        <div className="flex items-center justify-between gap-1 py-0.5">
          <SeasonBadge season={stats.nature.season} name={stats.nature.seasonName} />
          <span className="flex items-center gap-1.5">
            {stats.nature.storms.length > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#8fb9ba]" title={`活跃风暴：${stats.nature.storms.map((st) => st.name).join('、')}`}>
                <Tornado className="h-3 w-3" aria-hidden />
                {stats.nature.storms.length}
              </span>
            )}
            {stats.nature.ash > 0.15 && (
              <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#c9bda2]" title={`火山灰遮蔽 ${(stats.nature.ash * 100).toFixed(0)}% —— 无夏之年`}>
                <CloudRain className="h-3 w-3" aria-hidden />
                {(stats.nature.ash * 100).toFixed(0)}%
              </span>
            )}
          </span>
        </div>
      )}

      {/* 行3：总人口 + 战争/殖民船/火情 */}
      <div className="flex items-center justify-between gap-1 py-0.5">
        <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-[#f1e8d6]">
          <Users className="h-3.5 w-3.5 text-[#e6ba6c]" aria-hidden />
          <span className="font-mono tabular-nums">{stats.totalPop}</span>
        </span>
        <span className="flex items-center gap-1.5">
          {stats.warsCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#d97e55]" title="进行中的战争">
              <Swords className="h-3 w-3" aria-hidden />
              {stats.warsCount}
            </span>
          )}
          {stats.boats > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#8fb9ba]" title="航行中的殖民船">
              <Sailboat className="h-3 w-3" aria-hidden />
              {stats.boats}
            </span>
          )}
          {stats.fires > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#dd8f5e]" title="燃烧中的地块">
              <Flame className="h-3 w-3" aria-hidden />
              {stats.fires}
            </span>
          )}
        </span>
      </div>

      {/* 分隔线 */}
      <div className="my-1 h-px bg-[rgba(214,178,120,0.14)]" aria-hidden />

      {/* 野生动物胶囊 */}
      {wildTotal > 0 && (
        <span className="mb-0.5 flex items-center justify-center gap-1.5 rounded-full border border-[rgba(214,178,120,0.18)] bg-[rgba(50,42,31,0.5)] px-2 py-0.5 text-[10px] font-bold text-[#a2957c]">
          <PawPrint className="h-3 w-3" aria-hidden />
          野生动物 <span className="font-mono tabular-nums">{wildTotal}</span>
        </span>
      )}

      {/* 种族明细（折叠展开；上限滚动防挤爆面板预算） */}
      {expanded && (
        <div className="game-scroll hidden max-h-[56px] flex-col gap-0.5 overflow-y-auto py-0.5 sm:flex">
          {raceEntries.map(([k, v]) => {
            const race = Object.values(RACES).find((r) => r.key === k);
            if (!race || v === 0) return null;
            return (
              <span key={k} className="flex items-center justify-between gap-1 text-[10px] font-bold text-[#cfc2a6]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[2px] border border-black/40" style={{ backgroundColor: RACE_DOT[k] }} aria-hidden />
                  {race.name}
                </span>
                <span className="font-mono text-[#8f836a]">{v}</span>
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}

export function WorldCluster() {
  const showMinimap = useGameStore((s) => s.showMinimap);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLCanvasElement>(null);

  // 小地图渲染（400ms 节流重绘；showMinimap 关闭时挂起）
  useEffect(() => {
    if (!showMinimap) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const engine = getEngine();
    const draw = () => renderMinimap(engine, ctx, MW, MH, { w: MW, h: MH });
    draw();
    const timer = window.setInterval(draw, 400);
    return () => window.clearInterval(timer);
  }, [showMinimap]);

  const jump = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const engine = getEngine();
    engine.cam.x = ((e.clientX - rect.left) / rect.width) * 256;
    engine.cam.y = ((e.clientY - rect.top) / rect.height) * 160;
    engine.followId = null;
  };

  return (
    <>
      {/* —— 桌面：世界罗盘（统计头 + 全域图，一座玻璃壳） —— */}
      <div
        className="su-panel pointer-events-auto absolute bottom-2 left-2 z-10 hidden w-[184px] flex-col gap-0 p-2 sm:flex"
        role="status"
        aria-label="世界罗盘：纪元、季节、人口与全域地图"
      >
        <ClusterHeader expanded={expanded} setExpanded={setExpanded} />
        {showMinimap && (
          <div className="relative mt-1 overflow-hidden rounded-[9px] border border-[rgba(214,178,120,0.22)]">
            <canvas
              ref={ref}
              width={MW}
              height={MH}
              onMouseDown={jump}
              className="block h-auto w-full cursor-pointer"
              style={{ imageRendering: 'pixelated' }}
              aria-label="全域地图，点击跳转视野"
            />
            <span className="su-map-sheen" aria-hidden />
          </div>
        )}
      </div>
      {/* Task 70：移动端统计胶囊已删 —— 世界实况改由岁月沙漏（纪元）+ 神界之眼展开图（全量统计）
          + 神之视界（长按透视）承载，主画面留给大陆本身 */}
    </>
  );
}
