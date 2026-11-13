'use client';
// ============ Inspector: unit details / civilization details ============
import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { RACES, ITEM_DEFS, JOBS, BUILDING_DEFS, TRAITS } from '@/lib/game/types';
import type { ItemKind } from '@/lib/game/types';
import { TECH_BY_KEY } from '@/lib/game/tech';
import { RARITY_META, SLOT_FIELD, SLOT_ORDER, SLOT_NAMES } from '@/lib/game/items';
import { PixelIcon } from './PixelIcon';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { X, Crosshair, Skull, Flag, Sailboat, Coins, BookOpen, Swords, Lightbulb, Landmark, Sparkles, Eraser, BookMarked, Crown } from 'lucide-react';

const raceIcon: Record<string, string> = {
  human: 'human', elf: 'elf', dwarf: 'dwarf', orc: 'orc', bandit: 'bandit',
  zombie: 'zombie', sheep: 'sheep', wolf: 'wolf', bear: 'bear', dragon: 'dragon',
  deer: 'deer', penguin: 'penguin', camel: 'camel', scorpion: 'scorpion',
  snake: 'snake', snowwolf: 'snowwolf', skeleton: 'skeleton', demon: 'demon', mage: 'mage',
  lizard: 'lizard', goblin: 'goblin',
  // 契约新增动物种族（像素图标已入 ICONS 表）：单位头像不再误回退 human
  chicken: 'chicken', pig: 'pig', rabbit: 'rabbit', fox: 'fox',
  fish: 'fish', crab: 'crab', turtle: 'turtle', shark: 'shark',
};

interface UnitInfo {
  id: number; name: string; raceName: string; civName: string | null; civColor: string | null;
  hp: number; maxHp: number; kills: number; ageYears: number; infected: boolean;
  traitName: string | null; traitDesc: string | null; isCiv: boolean; race: number;
  /** 契约：在位国王旗标（引擎并行新增；缺省 undefined 视为非君主） */
  king?: boolean;
  trait?: string | null;
  jobName: string | null; jobDesc: string | null;
  boat?: number; boatTTL?: number;
  caravan?: number;
  wep?: ItemKind | null; arm?: ItemKind | null; trk?: ItemKind | null;
  hlm?: ItemKind | null; shd?: ItemKind | null; bts?: ItemKind | null; rng?: ItemKind | null; amu?: ItemKind | null;
  // —— 涌现社会内核（getUnitInfo 展开自 Unit；famName 由本组件查引擎家族注册表回填） ——
  fam?: number;
  fgn?: number;
  gIds?: number[];
  panic?: number;
  famName?: string | null;
}

interface CivInfoFull {
  id: number; name: string; raceName: string; colorHex: string; pop: number; tiles: number; houses: number;
  houseCap: number; kingName: string; wars: string[]; capitalPos: { x: number; y: number } | null;
  gold: number; knowledge: number; army: number; builds: { kind: number; n: number }[];
  techs: string[]; techCount: number; research: string | null; researchP: number; researchNeed: number;
  gov: number; govName: string; govDesc: string; govBonus: string; govYear: number;
  stability: number; culture: number; militarism: number; income: number; expense: number;
  occPushing: number; occPushAvg: number; occLosing: number;
}

export function Inspector() {
  const { selUnit, selCiv, select, selectCiv, toggleFollow, follow, openCivPanel, showChronicle } = useGameStore();
  const [unit, setUnit] = useState<UnitInfo | null>(null);
  const [civ, setCiv] = useState<CivInfoFull | null>(null);

  /** 即时重读单位信息（特质编辑后无延迟反馈） */
  const refreshUnit = () => {
    if (selUnit == null) return;
    const engine = (window as unknown as { __wbEngine?: { getUnitInfo(id: number): UnitInfo | null; families?: Map<number, { name: string }> } }).__wbEngine;
    const info = engine?.getUnitInfo(selUnit) ?? null;
    if (info) info.famName = info.fam != null ? engine?.families?.get(info.fam)?.name ?? null : null;
    setUnit(info && info.hp > 0 ? info : null);
  };

  useEffect(() => {
    if (selUnit == null) return;
    const read = () => {
      const engine = (window as unknown as { __wbEngine?: { getUnitInfo(id: number): UnitInfo | null; families?: Map<number, { name: string }> } }).__wbEngine;
      const info = engine?.getUnitInfo(selUnit) ?? null;
      if (info) info.famName = info.fam != null ? engine?.families?.get(info.fam)?.name ?? null : null;
      setUnit(info && info.hp > 0 ? info : null);
    };
    const first = window.setTimeout(read, 0);
    const timer = window.setInterval(read, 400);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [selUnit]);

  useEffect(() => {
    if (selCiv == null) return;
    const read = () => {
      const engine = (window as unknown as { __wbEngine?: { getCivInfo(id: number): CivInfoFull | null } }).__wbEngine;
      setCiv(engine?.getCivInfo(selCiv) ?? null);
    };
    const first = window.setTimeout(read, 0);
    const timer = window.setInterval(read, 800);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [selCiv]);

  const showUnit = selUnit != null && unit != null && unit.hp > 0 && unit.id === selUnit;
  const showCiv = !showUnit && selCiv != null && civ != null && civ.id === selCiv;
  if (!showUnit && !showCiv) return null;

  // —— 职业徽标解析：king 职业为引擎并行新增（JOBS 表可能尚未收录），
  //    按职业 key 或常见中文职称兜底判金，未收录时不崩溃 ——
  const jobDef = unit?.jobName ? JOBS.find((j) => j.name === unit.jobName) : undefined;
  const kingJob = !!unit && (jobDef?.key === 'king' || unit.jobName === '国王' || unit.jobName === '君主');

  return (
    <div
      className={`pointer-events-auto absolute right-2 top-[60px] z-20 flex w-56 flex-col rounded-sm border-2 border-zinc-700/90 bg-zinc-900/95 shadow-[0_4px_0_rgba(0,0,0,0.6)] su-panel ${
        showChronicle ? 'max-h-[calc(100dvh-496px)]' : 'max-h-[calc(100dvh-192px)]'
      }`}
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => { select(null, null); selectCiv(null); }}
        aria-label="关闭"
        className="absolute right-1 top-1 z-10 h-6 w-6 text-zinc-500 hover:text-zinc-200"
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </Button>
      <div className="game-scroll relative min-h-0 flex-1 overflow-y-auto p-3">

      {unit && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5 pr-5">
            <div className="flex h-12 w-12 items-center justify-center border-2 border-zinc-700 bg-zinc-800">
              <PixelIcon icon={raceIcon[RACES[unit.race].key] ?? 'human'} size={34} />
            </div>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold text-zinc-100">{unit.name}</span>
                {unit.king && (
                  <Badge
                    variant="outline"
                    className="shrink-0 gap-0.5 border-amber-500/70 bg-amber-400/10 px-1 py-0 text-[9px] font-bold text-amber-300"
                    title="在位君主：此单位是所属王国的现任国王"
                  >
                    <Crown className="h-2.5 w-2.5" aria-hidden />
                    在位君主
                  </Badge>
                )}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{unit.raceName}</p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              <span>生命</span>
              <span className="font-mono text-zinc-300">{Math.max(0, Math.ceil(unit.hp))}/{unit.maxHp}</span>
            </div>
            <Progress value={Math.max(0, (unit.hp / unit.maxHp) * 100)} className="h-2.5 border border-zinc-700 bg-zinc-800" />
          </div>

          {unit.civName && (
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-300">
              <span className="inline-block h-2.5 w-2.5 border border-black/40" style={{ backgroundColor: unit.civColor ?? '#999' }} aria-hidden />
              {unit.civName}
            </p>
          )}

          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-400">
            <span>年龄 <b className="text-zinc-200">{unit.ageYears}</b> 岁</span>
            <span>击杀 <b className="text-zinc-200">{unit.kills}</b></span>
          </div>

          {/* 职业徽标（king 职业着金色 + 金冠；其余按 JOBS 表职业色） */}
          {unit.jobName && (
            <div>
              <Badge
                variant="outline"
                className={`gap-1 text-[10px] font-bold ${kingJob ? 'border-[#e6ba6c] bg-[#e6ba6c]/10 text-[#efc377]' : ''}`}
                style={kingJob ? undefined : { borderColor: jobDef?.color, color: jobDef?.color }}
              >
                {kingJob && <Crown className="h-3 w-3" aria-hidden />}
                {unit.jobName}
              </Badge>
              {unit.jobDesc && <p className="mt-0.5 text-[10px] text-zinc-500">{unit.jobDesc}</p>}
            </div>
          )}

          {unit.traitName && (
            <div>
              <Badge variant="outline" className="border-amber-500/60 bg-amber-400/10 text-[10px] font-bold text-amber-300">
                {unit.traitName}
              </Badge>
              {unit.traitDesc && <p className="mt-0.5 text-[10px] text-zinc-500">{unit.traitDesc}</p>}
            </div>
          )}

          {/* 社会涌现：家族谱系 / 血仇 / 恐慌 —— 微观规则在个体身上的印记 */}
          <div className="flex flex-wrap items-center gap-1">
            {unit.famName ? (
              <Badge variant="outline" className="border-violet-600/60 bg-violet-400/10 text-[10px] font-bold text-violet-300" title={`家族谱系 · 第 ${unit.fgn ?? 1} 代血脉`}>
                {unit.famName}·第 {unit.fgn ?? 1} 代
              </Badge>
            ) : (
              <span className="text-[10px] text-zinc-600">无名流浪者</span>
            )}
            {(unit.gIds?.length ?? 0) > 0 && (
              <Badge variant="outline" className="border-rose-600/60 bg-rose-400/10 text-[10px] font-bold text-rose-300" title="对凶手的血仇（复仇优先索敌）">
                血仇 ×{unit.gIds?.length}
              </Badge>
            )}
            {(unit.panic ?? 0) >= 0.3 && (
              <Badge variant="outline" className="border-amber-600/60 bg-amber-400/10 text-[10px] font-bold text-amber-300" title="恐慌值（≥ 72% 即溃逃）">
                恐慌 {Math.round((unit.panic ?? 0) * 100)}%
              </Badge>
            )}
            {/* 状态徽章并入同一徽章区（与家族/血仇/恐慌对齐，避免散点布局） */}
            {unit.infected && (
              <Badge variant="outline" className="border-emerald-600 bg-emerald-400/10 text-[10px] font-bold text-emerald-400">
                感染瘟疫
              </Badge>
            )}
          </div>

          {/* 深度打磨：特质编辑器 — 上帝之刷（点选即改写天性，属性即时迁移） */}
          <div className="rounded-sm border border-violet-900/70 bg-violet-950/30 p-1.5">
            <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-violet-300">
              <Sparkles className="h-3 w-3" aria-hidden />
              上帝之刷 · 特质编辑
            </p>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => {
                  const eng = (window as unknown as { __wbEngine?: { devSetTrait(id: number, key: string | null): boolean } }).__wbEngine;
                  eng?.devSetTrait(unit.id, null);
                  refreshUnit();
                }}
                className={`flex items-center gap-0.5 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold transition-colors ${!unit.trait ? 'border-zinc-400 bg-zinc-600/60 text-zinc-100' : 'border-zinc-700 bg-zinc-800/70 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}
              >
                <Eraser className="h-2.5 w-2.5" aria-hidden />
                无特质
              </button>
              {Object.values(TRAITS).map((t) => {
                const active = unit.trait === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    title={t.desc}
                    onClick={() => {
                      const eng = (window as unknown as { __wbEngine?: { devSetTrait(id: number, key: string | null): boolean } }).__wbEngine;
                      eng?.devSetTrait(unit.id, t.key);
                      refreshUnit();
                    }}
                    className={`rounded-sm border px-1.5 py-0.5 text-[9px] font-bold transition-colors ${active
                      ? t.good
                        ? 'border-emerald-400 bg-emerald-400/20 text-emerald-300'
                        : 'border-red-400 bg-red-400/20 text-red-300'
                      : t.good
                        ? 'border-zinc-700 bg-zinc-800/70 text-zinc-400 hover:border-emerald-600 hover:text-emerald-300'
                        : 'border-zinc-700 bg-zinc-800/70 text-zinc-400 hover:border-red-700 hover:text-red-300'}`}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 造物图鉴：把这个种族铭刻进永久图书馆（跨世界保存，pin 后上放置面板） */}
          <div className="rounded-sm border border-emerald-900/70 bg-emerald-950/30 p-1.5">
            <p className="mb-1 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
              <BookMarked className="h-3 w-3" aria-hidden />
              造物图鉴 · 永久铭刻
            </p>
            <button
              type="button"
              onClick={() => {
                const eng = (window as unknown as { __wbEngine?: { saveRaceToCreation?: (rid: number, opts?: { pin?: boolean }) => { uid: string; name: string } | null } }).__wbEngine;
                const entry = eng?.saveRaceToCreation?.(unit.race, { pin: true });
                if (!entry) {
                  useGameStore.getState().showNote('铭刻失败：图鉴已满（128 条且全部固定）——在图鉴中删除部分条目后再试', 'danger');
                }
              }}
              title="把这个种族的全部属性与外貌定格进跨世界永久图鉴；固定后在放置面板随时降临任意世界"
              className="flex w-full items-center justify-center gap-1 rounded-sm border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-500/20"
            >
              <BookMarked className="h-3 w-3" aria-hidden />
              铭刻「{unit.raceName}」入图鉴
            </button>
          </div>

          {/* 装备展示（七槽位：武器/护甲/头盔/盾牌/靴/戒/符，稀有度染色） */}
          {SLOT_ORDER.some((slot) => unit[SLOT_FIELD[slot]]) && (
            <div className="grid gap-1">
              {SLOT_ORDER.map((slot) => {
                const kind = unit[SLOT_FIELD[slot]] as string | null | undefined;
                if (!kind) return null;
                const def = ITEM_DEFS[kind as string];
                if (!def) return null;
                const rar = RARITY_META[def.rarity];
                return (
                  <div key={slot} className="flex items-center gap-1.5 rounded-sm border-2 bg-zinc-800/60 px-1.5 py-1" style={{ borderColor: rar.color + '99' }}>
                    <PixelIcon icon={def.key} size={16} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold" style={{ color: rar.color }}>
                        {def.name}
                        <span className="ml-1 font-normal text-zinc-500">{SLOT_NAMES[slot]}</span>
                      </p>
                      <p className="truncate text-[9px] leading-tight text-zinc-500">{def.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {unit.boat ? (
            <Badge variant="outline" className="gap-1 border-teal-600 bg-teal-400/10 text-[10px] font-bold text-teal-300">
              <Sailboat className="h-3 w-3" aria-hidden />
              航海中 · 剩余航程约 {Math.max(0, Math.round((unit.boatTTL ?? 0) / 40))} 年
            </Badge>
          ) : null}

          {unit.caravan ? (
            <Badge variant="outline" className="gap-1 border-yellow-600 bg-yellow-400/10 text-[10px] font-bold text-yellow-300">
              <Coins className="h-3 w-3" aria-hidden />
              贸易商队 · 满载奔赴伙伴市场
            </Badge>
          ) : null}

          <div className="mt-1 flex gap-1">
            {unit.isCiv && (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleFollow}
                aria-pressed={follow}
                className="h-7 flex-1 border-zinc-700 bg-zinc-800 px-2 text-[10px] font-bold uppercase text-zinc-300 hover:bg-zinc-700"
              >
                <Crosshair className="mr-1 h-3 w-3" aria-hidden />
                {follow ? '取消跟随' : '跟随'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { (window as unknown as { __wbEngine?: { killUnit(id: number): void } }).__wbEngine?.killUnit(unit.id); select(null, null); }}
              className="h-7 flex-1 border-red-800 bg-red-950/40 px-2 text-[10px] font-bold uppercase text-red-400 hover:bg-red-900/40"
            >
              <Skull className="mr-1 h-3 w-3" aria-hidden />
              抹除
            </Button>
          </div>
        </div>
      )}

      {!unit && civ && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5 pr-5">
            <div className="flex h-12 w-12 items-center justify-center border-2 border-zinc-700 bg-zinc-800">
              <Flag className="h-6 w-6" style={{ color: civ.colorHex }} aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-zinc-100">{civ.name}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{civ.raceName}王国</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-400">
            <span>人口 <b className="text-zinc-200">{civ.pop}</b></span>
            <span>上限 <b className="text-zinc-200">{civ.houseCap}</b></span>
            <span>房屋 <b className="text-zinc-200">{civ.houses}</b></span>
            <span>领土 <b className="text-zinc-200">{civ.tiles}</b></span>
            <span className="flex items-center gap-1">国库 <b className="flex items-center gap-0.5 text-yellow-400"><Coins className="h-3 w-3" aria-hidden />{civ.gold}</b></span>
            <span>知识 <b className="flex items-center gap-0.5 text-sky-400"><BookOpen className="h-3 w-3" aria-hidden />{civ.knowledge}</b></span>
            <span className="flex items-center gap-1">军队 <b className="flex items-center gap-0.5 text-red-400"><Swords className="h-3 w-3" aria-hidden />{civ.army}</b></span>
            <span className="flex items-center gap-1">稳定 <b className="flex items-center gap-0.5 text-emerald-400"><Landmark className="h-3 w-3" aria-hidden />{civ.stability}</b></span>
          </div>

          {/* 动态战线（战时虚国界统计：渗透中/沦陷中） */}
          {(civ.occPushing > 0 || civ.occLosing > 0) && (
            <div className="rounded-sm border border-amber-600/40 bg-amber-500/10 px-2 py-1.5 text-[10px] font-bold text-amber-300/95">
              <span className="mr-1 inline-block h-2 w-2 rotate-45 border border-black/40 bg-amber-400/80" aria-hidden />
              战线推进 <b className="font-mono">{civ.occPushing}</b> 格（均强度 {civ.occPushAvg}%）
              {civ.occLosing > 0 && <span className="text-red-400"> · 沦陷中 <b className="font-mono">{civ.occLosing}</b> 格</span>}
            </div>
          )}

          {/* 政体徽标 */}
          <div>
            <Badge variant="outline" className="border-violet-600/60 bg-violet-400/10 text-[10px] font-bold text-violet-300" title={civ.govBonus}>
              {civ.govName} · {civ.govYear} 年确立
            </Badge>
          </div>

          {/* 在研科技 */}
          {civ.research ? (
            <div>
              <p className="flex items-center gap-1 text-[10px] font-bold text-zinc-300">
                <Lightbulb className="h-3 w-3 shrink-0 text-amber-300" aria-hidden />
                <span className="truncate">在研：{TECH_BY_KEY[civ.research]?.name ?? civ.research}</span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-zinc-500">{civ.techCount} 项</span>
              </p>
              <Progress value={Math.min(100, (civ.researchP / Math.max(1, civ.researchNeed)) * 100)} className="mt-1 h-1.5 border border-zinc-700 bg-zinc-800" />
            </div>
          ) : (
            <p className="flex items-center gap-1 text-[10px] font-bold text-zinc-500">
              <Lightbulb className="h-3 w-3" aria-hidden />
              科技 {civ.techCount} 项{civ.techCount >= 34 ? ' · 已登峰造极' : ''}
            </p>
          )}

          {/* 建筑分类统计 */}
          {civ.builds.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {civ.builds.map((b) => (
                <span key={b.kind} className="rounded-sm border border-zinc-700 bg-zinc-800/70 px-1.5 py-0.5 text-[9px] font-bold text-zinc-400">
                  {BUILDING_DEFS[b.kind]?.name ?? '?'} ×{b.n}
                </span>
              ))}
            </div>
          )}

          <p className="text-[11px] text-zinc-400">
            国王 <b className="text-zinc-200">{civ.kingName}</b>
          </p>

          {civ.wars.length > 0 ? (
            <div className="rounded-sm border-2 border-red-900/60 bg-red-950/30 p-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">交战中</p>
              {civ.wars.map((w) => (
                <p key={w} className="text-[11px] text-zinc-300">{w}</p>
              ))}
            </div>
          ) : (
            <Badge variant="outline" className="border-emerald-700 bg-emerald-400/10 text-[10px] font-bold text-emerald-400">
              和平时期
            </Badge>
          )}

          {civ.capitalPos && (
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const eng = (window as unknown as { __wbEngine?: { jumpTo(x: number, y: number): void } }).__wbEngine;
                  eng?.jumpTo(civ.capitalPos!.x, civ.capitalPos!.y);
                }}
                className="h-7 flex-1 border-zinc-700 bg-zinc-800 px-2 text-[10px] font-bold uppercase text-zinc-300 hover:bg-zinc-700"
              >
                <Crosshair className="mr-1 h-3 w-3" aria-hidden />
                前往首都
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openCivPanel(civ.id)}
                title="打开科技树与社会体系详情"
                className="h-7 flex-1 gap-1 border-amber-700/70 bg-amber-950/40 px-2 text-[10px] font-bold uppercase text-amber-300 hover:bg-amber-900/40"
              >
                <Landmark className="mr-1 h-3 w-3" aria-hidden />
                科技社会
              </Button>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

// helper only for typing
