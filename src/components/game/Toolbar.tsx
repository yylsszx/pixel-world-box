'use client';
// ============ Super Dock（Task 68 超级 UI）：底部 macOS 工具坞 ============
// Tab 分类 + 工具条合并为单行玻璃坞；指针精细设备上工具钮按距离磁力放大
// （macOS Dock 放大曲线）。让位带（栈级 padding，永不遮挡其他 UI）：
// - 世界罗盘开 → sm:pl-[208px]（左下罗盘左缘16+宽184+隙8）
// - 纪事面板开 → sm:pr-[280px]（右下纪事宽264+隙16）
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import { TAB_META, TOOLS, TOOL_BY_ID, RACE_TOOL, ITEM_TOOL } from '@/lib/game/constants';
import type { ToolTab, ToolParam, ToolDef } from '@/lib/game/constants';
import { ITEM_COUNT, RARITY_META } from '@/lib/game/items';
import { ITEM_DEFS, RACES } from '@/lib/game/types';
import { creationTools, subscribeCreations, listCreations, removeCreation, patchCreation, parseCreationTool, CRE_TINTS, type CreationEntry, type SpeciesCreation } from '@/lib/game/creations';
import { PixelIcon } from './PixelIcon';
import { HScroll } from './HScroll';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Minus, Plus, RotateCcw, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const tabIcons: Record<ToolTab, string> = {
  creatures: 'human',
  animals: 'wolf',
  terrain: 'mountain',
  disasters: 'fire',
  powers: 'heal',
  items: 'chest',
};

type ItemCat = 'chest' | 'all' | 'wep' | 'arm' | 'hlm' | 'shd' | 'bts' | 'rng' | 'amu';
const ITEM_CATS: { id: ItemCat; label: string; icon: string }[] = [
  { id: 'chest', label: '宝箱', icon: 'chest' },
  { id: 'all', label: '全部', icon: 'chest3' },
  { id: 'wep', label: '武器', icon: 'sword2' },
  { id: 'arm', label: '护甲', icon: 'armor2' },
  { id: 'hlm', label: '头盔', icon: 'iron_helm' },
  { id: 'shd', label: '盾牌', icon: 'iron_shield' },
  { id: 'bts', label: '靴子', icon: 'leather_boots' },
  { id: 'rng', label: '戒指', icon: 'ring' },
  { id: 'amu', label: '护符', icon: 'holy_symbol' },
];

/** 参数值展示（tick → 秒；小步进保留一位小数） */
function fmtParam(p: ToolParam, v: number): string {
  if (p.fmt === 'sec') return `${(v / 15).toFixed(1)}s`;
  return p.step < 1 ? v.toFixed(1) : String(Math.round(v));
}

/** —— NumEdit（Task 71 无极数值面板）：点击变输入框的数字调节原子件 ——
 *  · 平时是等宽字体值按钮（触屏友好）；点击后变身输入框（打数字直接设定）
 *  · 两侧 −/+ 步进钮（触屏免键盘微调）；回车/失焦提交，Esc 取消
 *  · 提交时钳制 [min,max] 并吸附 step 网格，非法输入静默回退 */
export function NumEdit({
  value, min, max, step, onCommit, ariaLabel, fmt, w = 'w-16',
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  ariaLabel: string;
  fmt?: (v: number) => string;
  w?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const clampSnap = (raw: number): number => {
    const snapped = min + Math.round((raw - min) / step) * step;
    return Math.max(min, Math.min(max, Math.round(snapped * 1e6) / 1e6));
  };
  const commit = () => {
    if (draft == null) return;
    const n = parseFloat(draft);
    if (Number.isFinite(n)) {
      // 打数字 = 精确设定：只钳制边界，不吸附 step 网格（用户输入 999 就是 999）
      const v = Math.max(min, Math.min(max, Math.round(n * 1e6) / 1e6));
      if (v !== value) onCommit(v);
    }
    setDraft(null);
  };
  const nudge = (dir: 1 | -1) => {
    const v = clampSnap(value + dir * step);
    if (v !== value) onCommit(v);
  };
  const display = fmt ? fmt(value) : String(Math.round(value * 100) / 100);
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={`${ariaLabel} 减一档`}
        onClick={() => nudge(-1)}
        className="flex h-5 w-5 items-center justify-center rounded-[5px] border border-[rgba(214,178,120,0.2)] bg-[rgba(50,42,31,0.6)] text-[#a2957c] transition-colors hover:border-[rgba(214,178,120,0.45)] hover:text-[#f1e8d6] active:scale-90"
      >
        <Minus className="h-2.5 w-2.5" aria-hidden />
      </button>
      {draft != null ? (
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          autoFocus
          onFocus={(e) => e.target.select()}
          value={draft}
          aria-label={ariaLabel}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setDraft(null);
            e.stopPropagation(); // 不外泄给游戏键位（空格暂停/数字键调速）
          }}
          className={`${w} h-6 rounded-[6px] border border-[#c8964a] bg-[rgba(19,16,9,0.75)] px-1.5 text-center font-mono text-[11px] font-bold text-[#efc377] outline-none`
          }
        />
      ) : (
        <button
          type="button"
          aria-label={`${ariaLabel}（点击打数字设定）`}
          title="点击打数字设定"
          onClick={() => setDraft(String(Math.round(value * 100) / 100))}
          className={`${w} h-6 rounded-[6px] border border-[rgba(214,178,120,0.25)] bg-[rgba(19,16,9,0.55)] px-1.5 text-center font-mono text-[11px] font-bold tabular-nums text-[#e6ba6c] transition-colors hover:border-[rgba(214,178,120,0.5)] hover:text-[#efc377] active:scale-95`
          }
        >
          {display}
        </button>
      )}
      <button
        type="button"
        aria-label={`${ariaLabel} 加一档`}
        onClick={() => nudge(1)}
        className="flex h-5 w-5 items-center justify-center rounded-[5px] border border-[rgba(214,178,120,0.2)] bg-[rgba(50,42,31,0.6)] text-[#a2957c] transition-colors hover:border-[rgba(214,178,120,0.45)] hover:text-[#f1e8d6] active:scale-90"
      >
        <Plus className="h-2.5 w-2.5" aria-hidden />
      </button>
    </span>
  );
}

/** —— 原始数据字段元信息（与引擎 editRaceDef / editItemDef 的钳制区间同步） —— */
const RACE_STAT_FIELDS: { key: keyof Pick<SpeciesCreation, 'hp' | 'dmg' | 'speed' | 'repro' | 'maxAge'>; label: string; min: number; max: number; step: number }[] = [
  { key: 'hp', label: '生命', min: 1, max: 99999, step: 10 },
  { key: 'dmg', label: '攻击', min: 0, max: 500, step: 1 },
  { key: 'speed', label: '速度', min: 0.005, max: 0.3, step: 0.005 },
  { key: 'repro', label: '繁衍', min: 0, max: 0.02, step: 0.001 },
  { key: 'maxAge', label: '寿限', min: 1, max: 9999, step: 1 },
];
const ITEM_STAT_FIELDS: { key: 'dmg' | 'hp' | 'speedMul' | 'regen' | 'armor' | 'crit' | 'lifesteal' | 'thorns' | 'ranged'; label: string; min: number; max: number; step: number }[] = [
  { key: 'dmg', label: '攻击', min: 0, max: 500, step: 1 },
  { key: 'hp', label: '生命', min: 0, max: 999, step: 1 },
  { key: 'speedMul', label: '攻速', min: 0.5, max: 3, step: 0.01 },
  { key: 'regen', label: '回春', min: 0, max: 20, step: 0.5 },
  { key: 'armor', label: '护甲', min: 0, max: 60, step: 1 },
  { key: 'crit', label: '暴击', min: 0, max: 60, step: 1 },
  { key: 'lifesteal', label: '吸血', min: 0, max: 50, step: 1 },
  { key: 'thorns', label: '反伤', min: 0, max: 40, step: 1 },
  { key: 'ranged', label: '射程', min: 0, max: 20, step: 0.5 },
];

/** 数据编辑区小节标题（放置参数 / 原始数据两节共用） */
function SectionHead({ title, sub, onReset, resetLabel }: { title: string; sub: string; onReset?: () => void; resetLabel?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[rgba(214,178,120,0.14)] pb-1.5">
      <span className="flex items-baseline gap-1.5">
        <span className="text-[11px] font-bold tracking-widest text-[#e6ba6c]">{title}</span>
        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#75694f]">{sub}</span>
      </span>
      {onReset && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label={resetLabel ?? '恢复默认'}
          title={resetLabel ?? '恢复默认'}
          className="h-5 w-5 rounded-md text-[#75694f] hover:bg-[rgba(62,53,39,0.7)] hover:text-[#f1e8d6]"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
        </Button>
      )}
    </div>
  );
}

/** 造物体形族系/模板种族 → 像素图标（与 Inspector raceIcon 同源；动态种按 form/baseKey 映射） */
const CRE_BASE_ICON: Record<string, string> = {
  human: 'human', elf: 'elf', dwarf: 'dwarf', orc: 'orc', bandit: 'bandit',
  zombie: 'zombie', sheep: 'sheep', wolf: 'wolf', bear: 'bear', dragon: 'dragon',
  deer: 'deer', penguin: 'penguin', camel: 'camel', scorpion: 'scorpion',
  snake: 'snake', snowwolf: 'snowwolf', skeleton: 'skeleton', demon: 'demon', mage: 'mage',
  // v5 全新造物体形族系扩展（巨魔/食人魔/白行者/吸血鬼/克拉肯/沙虫/蛇怪）
  troll: 'demon', ogre: 'demon', whitewalker: 'whitewalker', vampire: 'vampire',
  kraken: 'kraken', sandworm: 'sandworm', basilisk: 'snake', person: 'human',
};

/** 造物条目 → 图标名（物种优先按体形族系 form，田条目按 baseKey；神物按形制 art；武器用剑） */
function creIcon(e: CreationEntry): string {
  if (e.kind === 'species') return CRE_BASE_ICON[e.form ?? e.baseKey] ?? 'wolf';
  if (e.kind === 'item') return e.art;
  return 'sword2';
}

/** 放置参数面板 + 原始数据编辑器（Task 71 无极数值面板）：选中带参数/数据的工具时出现在工具坞上方。
 *  · 放置参数（数量/半径/强度/持续）：滑条 + NumEdit（点值打数字，−/+ 步进）
 *  · 生物原始数据（hp/dmg/速度/繁衍/寿限）：打数字直改种族出厂定义，波及存量个体并随档保存
 *  · 物品原始数据（攻击/生命/攻速/护甲…）：打数字直改物品定义，全世界掉落同步生效
 *  cre: 工具查动态表（Task 70 起导出：移动端神之手势盘 DivineDial 复用同一面板） */
export function ParamPanel({ toolId, creTools }: { toolId: string; creTools: ToolDef[] }) {
  const toolParams = useGameStore((s) => s.toolParams);
  const setToolParam = useGameStore((s) => s.setToolParam);
  const resetToolParam = useGameStore((s) => s.resetToolParam);
  // 引擎原地改写 RACES/ITEM_DEFS（引用不变）→ 本地 rev 计数器强制重渲染读新值
  const [rev, setRev] = useState(0);
  const bump = () => setRev((n) => n + 1);
  const defs = TOOL_BY_ID[toolId]?.params ?? creTools.find((t) => t.id === toolId)?.params;
  const label = TOOL_BY_ID[toolId]?.label ?? creTools.find((t) => t.id === toolId)?.label ?? '';

  // —— 数据编辑目标解析：内置种族工具 / 造物种族工具 / 物品工具 ——
  const raceId = RACE_TOOL[toolId]; // 内置生物（human/elf/wolf…）
  const creUid = parseCreationTool(toolId); // 图鉴造物（cre:xxx）
  const creEntry: SpeciesCreation | null = creUid
    ? ((listCreations().find((e) => e.uid === creUid && e.kind === 'species') as SpeciesCreation | undefined) ?? null)
    : null;
  const itemKind = ITEM_TOOL[toolId]; // 宝物（item_xxx / 三档宝箱 → 宝箱无数值面板）
  const itemDef = itemKind && !itemKind.startsWith('chest') ? ITEM_DEFS[itemKind] : undefined;
  const engine = getEngine();
  const raceDef = raceId != null ? RACES[raceId] : undefined;
  // Task 72 遗留收口：cre: 造物在本世界已注册种族（放置过至少一次）→ 编辑改走引擎 editRaceDef，
  // 已降临个体同步生效 + 随档（dyn 元组实时读 RACES）；从未放置 → 仅改图鉴模板
  const creRaceId = creEntry && engine ? engine.creationRaceIdOf(creEntry.uid) : null;

  const hasParams = !!defs?.length;
  const hasRaceData = !!(raceDef || creEntry);
  const hasItemData = !!itemDef;
  if (!hasParams && !hasRaceData && !hasItemData) return null;

  return (
    <div className="su-panel pointer-events-auto su-rise game-scroll flex w-[min(320px,92vw)] max-h-[62dvh] flex-col gap-0.5 overflow-y-auto p-2">
      {hasParams && (
        <>
          <SectionHead title={label} sub="放置参数" onReset={() => resetToolParam(toolId)} resetLabel="恢复默认参数" />
          {defs!.map((p) => {
            const v = toolParams[toolId]?.[p.key] ?? p.def;
            return (
              <div key={p.key} className="flex items-center gap-2 py-0.5">
                <span className="w-[52px] shrink-0 text-[10px] font-semibold tracking-wide text-[#a2957c]">{p.label}</span>
                <Slider
                  value={[v]}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  onValueChange={(nv) => setToolParam(toolId, p.key, nv[0])}
                  className="min-w-0 flex-1"
                  aria-label={`${label}${p.label}参数`}
                />
                <NumEdit
                  value={v}
                  min={p.min}
                  max={p.max}
                  step={p.step}
                  onCommit={(nv) => setToolParam(toolId, p.key, nv)}
                  ariaLabel={`${label}${p.label}`}
                  fmt={(x) => fmtParam(p, x)}
                  w={p.fmt === 'sec' ? 'w-[52px]' : 'w-12'}
                />
              </div>
            );
          })}
        </>
      )}

      {/* —— 生物原始数据：内置种族走引擎 editRaceDef（波及存量 + 随档）；图鉴造物已注册同路，未注册改模板 —— */}
      {hasRaceData && (
        <div className={hasParams ? 'mt-1.5' : ''}>
          <SectionHead
            title={creEntry ? creEntry.name : raceDef!.name}
            sub="原始数据"
            onReset={
              (raceId != null && engine?.raceOrigOf(raceId)) || (creRaceId != null && engine?.raceOrigOf(creRaceId))
                ? () => {
                    engine.resetRaceDef(raceId ?? creRaceId!);
                    bump();
                  }
                : undefined
            }
            resetLabel="恢复出厂（含现存个体）"
          />
          <div className="grid grid-cols-2 gap-x-3">
            {RACE_STAT_FIELDS.map((f) => {
              const cur = creEntry ? creEntry[f.key] : raceDef![f.key];
              return (
                <div key={f.key} className="flex items-center justify-between gap-1 py-0.5">
                  <span className="text-[10px] font-semibold tracking-wide text-[#a2957c]">{f.label}</span>
                  <NumEdit
                    value={cur}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    w={f.key === 'repro' || f.key === 'speed' ? 'w-14' : 'w-12'}
                    fmt={(x) => (f.step < 0.01 ? x.toFixed(3) : f.step < 1 ? x.toFixed(2) : String(Math.round(x)))}
                    ariaLabel={`${creEntry ? creEntry.name : raceDef!.name}${f.label}`}
                    onCommit={(v) => {
                      if (creEntry) {
                        if (creRaceId != null && engine) engine.editRaceDef(creRaceId, { [f.key]: v }); // 已注册：波及存量 + 图鉴回写（editRaceDef 内部联动）
                        else patchCreation(creEntry.uid, { [f.key]: v });
                        bump(); // localStorage 订阅也会触发父级刷新，本地 bump 立即回显
                      } else if (engine && raceId != null) {
                        engine.editRaceDef(raceId, { [f.key]: v });
                        bump();
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-0.5 text-[9px] leading-tight text-[#75694f]">
            {creEntry
              ? creRaceId != null
                ? '改写图鉴造物模板：本世界已降临个体同步生效，并随存档保存'
                : '改写图鉴造物模板：新放置的个体按新数据诞生（本世界尚未降临）'
              : '改写种族出厂定义：现存个体同步生效，并随存档保存'}
          </p>
        </div>
      )}

      {/* —— 物品原始数据：引擎 editItemDef（全世界掉落同步 + 图鉴神物联动） —— */}
      {hasItemData && (
        <div className={hasParams ? 'mt-1.5' : ''}>
          <SectionHead
            title={itemDef!.name}
            sub="原始数据"
            onReset={
              engine?.itemOrigOf(itemKind!)
                ? () => {
                    engine.resetItemDef(itemKind!);
                    bump();
                  }
                : undefined
            }
            resetLabel="恢复出厂"
          />
          <div className="grid grid-cols-2 gap-x-3">
            {ITEM_STAT_FIELDS.map((f) => {
              const cur = (itemDef as unknown as Record<string, number | undefined>)[f.key];
              if (cur == null) return null; // 该物品没有的属性不占行
              return (
                <div key={f.key} className="flex items-center justify-between gap-1 py-0.5">
                  <span className="text-[10px] font-semibold tracking-wide text-[#a2957c]">{f.label}</span>
                  <NumEdit
                    value={cur}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    w={f.step < 1 ? 'w-14' : 'w-12'}
                    fmt={(x) => (f.step < 1 ? x.toFixed(2) : String(Math.round(x)))}
                    ariaLabel={`${itemDef!.name}${f.label}`}
                    onCommit={(v) => {
                      if (engine) {
                        engine.editItemDef(itemKind!, { [f.key]: v });
                        bump();
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
          <p className="mt-0.5 text-[9px] leading-tight text-[#75694f]">改写物品出厂定义：全世界新掉落同步生效，并随存档保存</p>
        </div>
      )}
    </div>
  );
}

export function Toolbar() {
  const { tool, tab, brush, itemCat, viewMode, setTool, setTab, setBrush, setItemCat, toggleViewMode } = useGameStore();
  const showNote = useGameStore((s) => s.showNote);
  // 让位带感知：世界罗盘/纪事开关决定栈级左右 padding（工具坞永不遮挡左下罗盘/右下纪事）
  const showMinimap = useGameStore((s) => s.showMinimap);
  const showChronicle = useGameStore((s) => s.showChronicle);
  // 造物图鉴（跨会话持久）：订阅变更（神谕 save_creation / 图鉴编辑器实时刷新）
  const creations = useSyncExternalStore(subscribeCreations, listCreations);
  const creTools = useMemo(() => creationTools(), [creations]);
  let tools = TOOLS.filter((t) => t.tab === tab);
  // 造物工具注入：pinned 物种 → 生物页/动物页；pinned 神物 → 宝物页「全部」分类
  if (tab === 'creatures' || tab === 'animals') {
    tools = [...tools, ...creTools.filter((t) => t.tab === tab)];
  }
  // 宝物标签页：按分类筛选（102 件物品 + 3 档宝箱）；造物神物归入「全部」
  if (tab === 'items' && itemCat === 'all') {
    tools = [...tools, ...creTools.filter((t) => t.tab === 'items')];
  } else if (tab === 'items' && itemCat !== 'all') {
    tools = itemCat === 'chest'
      ? TOOLS.filter((t) => t.tab === 'items' && !t.id.startsWith('item_'))
      : TOOLS.filter((t) => t.tab === 'items' && t.id.startsWith('item_') && ITEM_DEFS[t.id.slice(5)]?.slot === itemCat);
  }
  const activeDef = TOOL_BY_ID[tool] ?? creTools.find((t) => t.id === tool);
  // 参数泡判定：带放置参数，或可编辑原始数据（生物/宝物工具）都显示（ParamPanel 内部再分流）
  const hasParamPanel =
    tool !== 'select' &&
    !!(
      activeDef?.params?.length ||
      RACE_TOOL[tool] !== undefined ||
      (parseCreationTool(tool) != null) ||
      (ITEM_TOOL[tool] != null && !ITEM_TOOL[tool].startsWith('chest'))
    );
  const showBrush = tool !== 'select' && (TOOL_BY_ID[tool]?.brush || tool === 'plague' || tool === 'river' || tool === 'oasis');
  const isItems = tab === 'items';
  // 物品按钮：按稀有度染色边框
  const rarityBorder = (id: string): string => {
    if (!id.startsWith('item_')) return '';
    const def = ITEM_DEFS[id.slice(5)];
    if (!def) return '';
    return RARITY_META[def.rarity].color;
  };

  // —— macOS Dock 磁力放大：指针精细设备 + 未开减少动效时，按横向距离放大工具钮 ——
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dockRef.current;
    if (!el) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>('[data-mag]'));
    const onMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        for (const it of items()) {
          const r = it.getBoundingClientRect();
          const d = Math.abs(e.clientX - (r.left + r.width / 2));
          const s = Math.max(0, 1 - d / 130);
          it.style.setProperty('--su-mag', (1 + 0.36 * s * s).toFixed(3));
        }
      });
    };
    const reset = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      for (const it of items()) it.style.setProperty('--su-mag', '1');
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', reset);
    return () => {
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', reset);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // —— 数字键 4-9 快速切换六大分类：1/2/3 已被速度控制占用（keymap.ts:43 注册 + GameCanvas 实现），
  //     冲突回避取空闲数字段 4-9（Shift/Alt+数字为镜头书签，带修饰键一律跳过）；统一键位注册表
  //     src/lib/ui/keymap.ts 仅为文档展示层（无功能分发器），故分发在本地实现、展示待其补充 ——
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const m = /^Digit([4-9])$/.exec(e.code); // e.code 识别不受输入法影响
      if (!m) return;
      const meta = TAB_META[Number(m[1]) - 4];
      if (meta) setTab(meta.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTab]);

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={`pointer-events-none absolute bottom-0 left-0 right-0 z-20 hidden flex-col items-center gap-1 px-2 pb-2 sm:flex ${
          showMinimap ? 'sm:pl-[208px]' : ''
        } ${showChronicle ? 'sm:pr-[280px]' : ''}`}
      >
        {/* 观察模式：收起工具与参数，只留分类骨架（纯净看世界） */}
        {!viewMode && (
          <>
            {/* 放置参数面板（数量/半径/强度/持续）：随选中工具切换 */}
            {hasParamPanel && <ParamPanel toolId={tool} creTools={creTools} />}

            {/* 笔刷宽度（滑条 + NumEdit 打数字） */}
            {showBrush && (
              <div className="su-panel pointer-events-auto flex su-rise w-[290px] max-w-full items-center gap-3 px-3 py-1.5">
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#a2957c]">{tool === 'river' ? '河宽' : tool === 'oasis' ? '泉眼' : '笔刷'}</span>
                <Slider
                  value={[brush]}
                  min={1}
                  max={10}
                  step={1}
                  onValueChange={(v) => setBrush(v[0])}
                  className="min-w-0 flex-1"
                  aria-label={tool === 'river' ? '河道宽度' : tool === 'oasis' ? '绿洲半径' : '笔刷大小'}
                />
                <NumEdit
                  value={brush}
                  min={1}
                  max={10}
                  step={1}
                  w="w-10"
                  onCommit={(v) => setBrush(v)}
                  ariaLabel={tool === 'river' ? '河道宽度' : tool === 'oasis' ? '绿洲半径' : '笔刷大小'}
                />
              </div>
            )}
          </>
        )}

        {/* —— 工具坞：观察钮 | 分类段 | 工具横滑（磁力放大）单行合一 —— */}
        <div ref={dockRef} className="su-dock su-rise pointer-events-auto flex max-w-full items-center gap-1">
          {/* 观察模式开关（车道首端常驻） */}
          <button
            type="button"
            onClick={() => {
              setTool('select');
              toggleViewMode();
            }}
            aria-pressed={viewMode}
            aria-label={viewMode ? '退出观察模式' : '观察模式（收起工具栏）'}
            title={viewMode ? '退出观察模式' : '观察模式（收起工具，纯净看世界）'}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border px-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              viewMode
                ? 'border-[#a7b97e] bg-[rgba(167,185,126,0.16)] text-[#bcc98e]'
                : 'border-[rgba(214,178,120,0.22)] bg-[rgba(19,16,9,0.45)] text-[#a2957c] hover:border-[rgba(214,178,120,0.4)] hover:text-[#f1e8d6]'
            }`}
          >
            <PixelIcon icon="select" size={16} />
            <span className="hidden sm:inline">{viewMode ? '退出观察' : '观察'}</span>
          </button>

          <span className="su-vline" aria-hidden />

          {/* 分类段（六页签，macOS 分段胶囊形态） */}
          {TAB_META.map((t, i) => {
            const active = tab === t.id;
            return (
              <Tooltip key={t.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setTab(t.id)}
                    aria-pressed={active}
                    aria-label={t.label}
                    data-on={active ? 'true' : 'false'}
                    className={`su-seg-btn h-9 shrink-0 gap-1.5 px-2 sm:px-2.5 ${active ? '' : 'border border-transparent'}`}
                  >
                    <PixelIcon icon={tabIcons[t.id]} size={15} />
                    <span className={`hidden text-[11px] font-semibold sm:inline ${active ? '' : 'opacity-80'}`}>{t.label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs text-[#f1e8d6]">{t.label} · 数字键 {i + 4}</TooltipContent>
              </Tooltip>
            );
          })}

          <span className="su-vline" aria-hidden />

          {/* 工具横滑（观察模式收起；磁力放大：data-mag + su-dock-item） */}
          {!viewMode && (
            <HScroll className="game-scroll-x flex items-end gap-1 overflow-x-auto overscroll-x-contain py-2">
              {isItems && (
                <>
                  {ITEM_CATS.map((c) => {
                    const active = itemCat === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setItemCat(c.id)}
                        aria-pressed={active}
                        className={`mb-0.5 flex h-9 shrink-0 items-center gap-1 rounded-[10px] border px-1.5 text-[10px] font-semibold tracking-wide transition-colors ${
                          active
                            ? 'border-[#c8964a] bg-[rgba(217,163,90,0.16)] text-[#e6ba6c]'
                            : 'border-[rgba(214,178,120,0.16)] bg-[rgba(50,42,31,0.55)] text-[#8f836a] hover:border-[rgba(214,178,120,0.36)] hover:text-[#f1e8d6]'
                        }`}
                      >
                        <PixelIcon icon={c.icon} size={14} />
                        {c.label}
                      </button>
                    );
                  })}
                  <span className="mb-2 shrink-0 font-mono text-[10px] text-[#75694f]">{ITEM_COUNT} 件</span>
                  <span className="su-vline !my-1" aria-hidden />
                </>
              )}
              {tools.map((t) => {
                const active = tool === t.id;
                const rb = rarityBorder(t.id);
                const creUid = parseCreationTool(t.id);
                const creEntry = creUid ? (listCreations().find((e) => e.uid === creUid) ?? null) : null;
                const creTint = creEntry && creEntry.kind === 'species' ? CRE_TINTS[Math.max(0, Math.min(7, creEntry.tintIdx | 0))] : null;
                return (
                  <Tooltip key={t.id}>
                    <TooltipTrigger asChild>
                      <div className="group/cre relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setTool(t.id)}
                          aria-pressed={active}
                          aria-label={t.label}
                          data-mag
                          className={`su-dock-item flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-[11px] border transition-colors ${
                            active
                              ? 'border-[#c8964a] bg-[rgba(217,163,90,0.18)] shadow-[0_0_0_1px_rgba(217,163,90,0.35)]'
                              : rb
                                ? 'border-transparent bg-[rgba(50,42,31,0.55)] hover:bg-[rgba(62,53,39,0.75)]'
                                : creTint
                                  ? 'border-[rgba(214,178,120,0.18)] bg-[rgba(50,42,31,0.5)] hover:border-[rgba(214,178,120,0.4)] hover:bg-[rgba(62,53,39,0.72)]'
                                  : 'border-[rgba(214,178,120,0.16)] bg-[rgba(50,42,31,0.5)] hover:border-[rgba(214,178,120,0.4)] hover:bg-[rgba(62,53,39,0.72)]'
                          }`}
                          style={!active && (rb || creTint) ? { borderColor: rb || creTint || undefined } : undefined}
                        >
                          <PixelIcon icon={creEntry ? creIcon(creEntry) : t.icon} size={22} />
                          {creTint && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: creTint }} aria-hidden />}
                          <span
                            className="max-w-[46px] truncate text-[8.5px] font-bold uppercase tracking-wide"
                            style={{ color: active ? '#efc377' : rb || creTint || '#a2957c' }}
                          >
                            {t.label}
                          </span>
                          {/* 活动指示点（macOS Dock 圆点） */}
                          {active && <span className="absolute -bottom-[5px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-[#efc377] shadow-[0_0_6px_rgba(239,195,119,0.8)]" aria-hidden />}
                        </button>
                        {/* 造物条目：悬停出现删除 ×（从图鉴永久移除） */}
                        {creUid && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const ent = listCreations().find((x) => x.uid === creUid);
                              if (ent && removeCreation(creUid)) {
                                if (tool === t.id) setTool('select');
                                showNote(`造物「${ent.name}」已从图鉴移除`, 'info');
                              }
                            }}
                            aria-label={`从图鉴移除 ${t.label}`}
                            title="从图鉴永久移除（可重新创造）"
                            className="absolute -right-1 -top-1 z-10 hidden h-4 w-4 items-center justify-center rounded-full border border-[rgba(217,126,85,0.7)] bg-[#1d1712] text-[#e39a7b] transition-colors hover:bg-[rgba(217,126,85,0.3)] hover:text-[#f0dcae] group-hover/cre:flex"
                          >
                            <X className="h-2.5 w-2.5" aria-hidden />
                          </button>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="border border-[rgba(214,178,120,0.26)] bg-[#1d1712]/95 text-xs text-[#f1e8d6]">
                      <p className="font-bold" style={{ color: rb || creTint || '#e6ba6c' }}>{t.label}{creEntry ? ' · 图鉴造物' : ''}</p>
                      <p className="max-w-44 text-[#a2957c]">{t.desc}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </HScroll>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
