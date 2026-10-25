'use client';
// ============ 神之手势盘 DivineDial（Task 70 移动端沉浸式神明 UI） ============
// 移动端底部施法区改造为「半隐藏抽屉」形态：
// - 平时：屏幕底部只留一枚发光的「神之印记」圆钮（su-seal 黄铜呼吸光晕），地图延伸到手机最底边
// - 唤出：点按 / 上滑印记 → 半透明大圆角抽屉升起（su-drawer 毛玻璃底板）
// - 分类：不用文字用图腾（lucide 图标 + su-totem 符文石），点图腾散开具体工具（su-scatter）
// - 收起：选完工具 260ms 自动收起（让选中反馈先被看见）/ 点地图收起（GameCanvas 侧处理）/
//         抽屉顶部拖动条下滑收起
// - 施法中：整套 HUD 淡出（su-cast-hide，世界独占视野）；抽屉打开时不隐身（选工具不算施法）
// 桌面端（≥640px）继续用 Super Dock（Toolbar.tsx），本组件 sm:hidden 互不干扰。
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useGameStore } from '@/store/gameStore';
import { TAB_META, TOOLS, TOOL_BY_ID, RACE_TOOL, ITEM_TOOL } from '@/lib/game/constants';
import type { ToolTab } from '@/lib/game/constants';
import { ITEM_COUNT, RARITY_META } from '@/lib/game/items';
import { ITEM_DEFS } from '@/lib/game/types';
import {
  creationTools, subscribeCreations, listCreations, parseCreationTool, CRE_TINTS,
  type CreationEntry,
} from '@/lib/game/creations';
import { PixelIcon } from './PixelIcon';
import { ParamPanel } from './Toolbar';
import { Sparkles, Eye, Sprout, PawPrint, Mountain, Zap, Gem, ChevronUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/** 图腾 → lucide 图标映射：分类不用文字，图腾语义一眼可辨
 *  （生命树=智慧生物 / 兽爪=动物 / 山川=地形 / 闪电=天灾 / 星芒=神力 / 宝石=宝物） */
const TOTEM_ICONS: Record<ToolTab, LucideIcon> = {
  creatures: Sprout,
  animals: PawPrint,
  terrain: Mountain,
  disasters: Zap,
  powers: Sparkles,
  items: Gem,
};

/** 印记上滑唤出阈值（px）：起点 y − 当前 y 超过它才算手势，过滤滚动误触 */
const SWIPE_UP_OPEN = 28;
/** 拖动条下滑收回阈值（px）：当前 y − 起点 y 超过它才收抽屉 */
const SWIPE_DOWN_CLOSE = 30;
/** 选中工具后延迟收回（ms）：金框选中反馈先被看见，抽屉再隐回印记 */
const PICK_CLOSE_DELAY = 260;

/** 宝物分类 chips（Toolbar.tsx 未导出此表且本任务禁改其他文件 → 同源拷贝，行为与 Super Dock 一致） */
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

/** 造物体形族系/模板种族 → 像素图标（与 Toolbar / Inspector raceIcon 同源拷贝；动态种按 form/baseKey 映射） */
const CRE_BASE_ICON: Record<string, string> = {
  human: 'human', elf: 'elf', dwarf: 'dwarf', orc: 'orc', bandit: 'bandit',
  zombie: 'zombie', sheep: 'sheep', wolf: 'wolf', bear: 'bear', dragon: 'dragon',
  deer: 'deer', penguin: 'penguin', camel: 'camel', scorpion: 'scorpion',
  snake: 'snake', snowwolf: 'snowwolf', skeleton: 'skeleton', demon: 'demon', mage: 'mage',
  // v5 全新造物体形族系扩展（巨魔/食人魔/白行者/吸血鬼/克拉肯/沙虫/蛇怪）
  troll: 'demon', ogre: 'demon', whitewalker: 'whitewalker', vampire: 'vampire',
  kraken: 'kraken', sandworm: 'sandworm', basilisk: 'snake', person: 'human',
};

/** 造物条目 → 图标名（物种按体形族系 form，神物按形制 art，武器用剑） */
function creIcon(e: CreationEntry): string {
  if (e.kind === 'species') return CRE_BASE_ICON[e.form ?? e.baseKey] ?? 'wolf';
  if (e.kind === 'item') return e.art;
  return 'sword2';
}

export function DivineDial() {
  const { tool, tab, itemCat, setTool, setTab, setItemCat } = useGameStore();
  const divineOpen = useGameStore((s) => s.divineOpen);
  const setDivineOpen = useGameStore((s) => s.setDivineOpen);
  const casting = useGameStore((s) => s.casting);

  // —— 造物图鉴（跨会话持久）：订阅外部存储，变更时重算动态工具表（与 Toolbar 同源） ——
  const creations = useSyncExternalStore(subscribeCreations, listCreations);
  const creTools = useMemo(() => creationTools(), [creations]);

  // —— 一次性引导气泡：从未打开过抽屉时在印记旁提示「神之印记」，点击后永久消失 ——
  // 标记放在唤出事件处理器里而非 useEffect（effect 内同步 setState 会触发级联渲染，
  // 且本组件是 divineOpen 的唯一写入 true 方，事件路径完备）
  const [everOpened, setEverOpened] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  // —— 手势起点用 ref 而非 state：手势过程不需要触发重渲染，避免拖动中整棵树刷新 ——
  const sealStartY = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  // 上滑手势吞掉后续 click（触屏滑动结束浏览器仍会补发 click，不拦截会把刚打开的抽屉又 toggle 关掉）
  const swipedUp = useRef(false);

  // —— 选中工具后的延迟收回 timer：卸载时必须清理（防泄漏 + 防「已关的抽屉被残留 timer 弹状态」） ——
  const closeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  // —— 工具过滤：完全复刻 Super Dock 的页内清单逻辑（静态 TOOLS + 动态造物注入 + 宝物分类筛选） ——
  let tools = TOOLS.filter((t) => t.tab === tab);
  // 造物工具注入：pinned 物种 → 生物页/动物页
  if (tab === 'creatures' || tab === 'animals') {
    tools = [...tools, ...creTools.filter((t) => t.tab === tab)];
  }
  // 宝物页：按分类筛选（113 件物品 + 3 档宝箱）；造物神物归入「全部」
  if (tab === 'items' && itemCat === 'all') {
    tools = [...tools, ...creTools.filter((t) => t.tab === 'items')];
  } else if (tab === 'items' && itemCat !== 'all') {
    tools = itemCat === 'chest'
      ? TOOLS.filter((t) => t.tab === 'items' && !t.id.startsWith('item_'))
      : TOOLS.filter((t) => t.tab === 'items' && t.id.startsWith('item_') && ITEM_DEFS[t.id.slice(5)]?.slot === itemCat);
  }
  const activeDef = TOOL_BY_ID[tool] ?? creTools.find((t) => t.id === tool);
  // 参数泡判定：带放置参数，或可编辑原始数据（生物/宝物工具）都显示（Task 71 数据编辑；ParamPanel 内部再分流）
  const hasParamPanel =
    tool !== 'select' &&
    !!(
      TOOL_BY_ID[tool]?.params?.length ||
      creTools.find((t) => t.id === tool)?.params?.length ||
      RACE_TOOL[tool] !== undefined ||
      parseCreationTool(tool) != null ||
      (ITEM_TOOL[tool] != null && !ITEM_TOOL[tool].startsWith('chest'))
    );

  const isItems = tab === 'items';
  // 物品按钮按稀有度染色边框（与 Dock 同规则：金框优先级最高，稀有度仅作非选中态描边）
  const rarityBorder = (id: string): string => {
    if (!id.startsWith('item_')) return '';
    const def = ITEM_DEFS[id.slice(5)];
    if (!def) return '';
    return RARITY_META[def.rarity].color;
  };

  /** 选中工具：立刻金框高亮 + 延迟收抽屉（反馈与沉浸两全：既看得见选中，又不用手动关） */
  const pickTool = (id: string) => {
    setTool(id);
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      // 防御：期间用户若已手动重开抽屉，不要替他关上
      if (useGameStore.getState().divineOpen) setDivineOpen(false);
    }, PICK_CLOSE_DELAY);
  };

  /** 唤出手势盘：打开即永久记住（一次性引导气泡自此不再出现） */
  const openDivine = () => {
    setEverOpened(true);
    setDivineOpen(true);
  };

  return (
    <div
      className={`sm:hidden pointer-events-none absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center ${
        // 施法中整体淡出（世界独占视野）；但抽屉打开时不隐身——选工具不算施法
        casting && !divineOpen ? 'su-cast-hide' : 'su-cast-show'
      }`}
    >
      {/* —— 参数泡：抽屉收起 + 非 observe + 带参数工具 → 浮在印记上方（ParamPanel 自带 su-panel/su-rise） —— */}
      {!divineOpen && hasParamPanel && (
        <div className="mb-1.5">
          <ParamPanel toolId={tool} creTools={creTools} />
        </div>
      )}

      {/* —— 图腾抽屉：divineOpen 时升起（su-rise 入场动效 + su-drawer 毛玻璃大圆角底板） —— */}
      {divineOpen && (
        <div
          aria-label="施法手势盘"
          className="su-drawer su-rise pointer-events-auto w-full px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          {/* 顶部拖动条：视觉是 36×4 细柄，触控热区放大到全宽 h-9（下滑收回手势入口） */}
          <div
            className="flex h-9 items-center justify-center"
            onTouchStart={(e) => {
              dragStartY.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchMove={(e) => {
              const y0 = dragStartY.current;
              const y = e.touches[0]?.clientY;
              if (y0 != null && y != null && y - y0 > SWIPE_DOWN_CLOSE) {
                dragStartY.current = null; // 触发一次后清零，防连续 move 重复 set
                setDivineOpen(false);
              }
            }}
            onTouchEnd={() => {
              dragStartY.current = null;
            }}
          >
            <span className="h-1 w-9 rounded-full bg-[rgba(214,178,120,0.25)]" aria-hidden />
          </div>

          {/* 选中工具速览：抽屉顶部常显当前工具名 + 一行描述（260ms 自动收回前仍可辨认所选）；
              造物/动态工具若无描述字段则回退显示所属分类名 */}
          {tool !== 'select' && activeDef && (
            <div className="mb-1 flex items-center gap-2.5 px-1">
              <PixelIcon icon={activeDef.icon} size={20} className="shrink-0" />
              <div className="min-w-0">
                <p className="truncate text-[11px] font-bold tracking-widest text-[#efc377]">{activeDef.label}</p>
                <p className="truncate text-[9px] leading-tight text-[#a2957c]">
                  {activeDef.desc || TAB_META.find((t) => t.id === activeDef.tab)?.label}
                </p>
              </div>
            </div>
          )}

          {/* 图腾行：观察图腾置首 + 六分类图腾（无文字；窄屏自动换行） */}
          <div className="flex flex-wrap items-center justify-center gap-3.5">
            {/* 观察图腾：回到纯看世界，选完即收（观察没有"选中反馈"可看，无需延迟） */}
            <button
              type="button"
              onClick={() => {
                setTool('select');
                setDivineOpen(false);
              }}
              aria-pressed={tool === 'select'}
              aria-label="观察"
              data-on={tool === 'select' ? 'true' : 'false'}
              className="su-totem h-14 w-14"
            >
              <Eye className="h-6 w-6" aria-hidden />
            </button>
            {TAB_META.map((t) => {
              const active = tab === t.id;
              const Icon = TOTEM_ICONS[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  aria-pressed={active}
                  aria-label={t.label}
                  data-on={active ? 'true' : 'false'}
                  className="su-totem h-14 w-14"
                >
                  <Icon className="h-6 w-6" aria-hidden />
                </button>
              );
            })}
          </div>

          {/* 宝物页分类 chips：横滑紧凑条（h-8），随行显示件数 */}
          {isItems && (
            <div className="game-scroll-x mb-2 mt-3 flex gap-1 overflow-x-auto">
              {ITEM_CATS.map((c) => {
                const active = itemCat === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setItemCat(c.id)}
                    aria-pressed={active}
                    className={`flex h-8 shrink-0 items-center gap-1 rounded-[9px] border px-1.5 text-[10px] font-semibold tracking-wide transition-colors ${
                      active
                        ? 'border-[#c8964a] bg-[rgba(217,163,90,0.16)] text-[#e6ba6c]'
                        : 'border-[rgba(214,178,120,0.16)] bg-[rgba(50,42,31,0.55)] text-[#8f836a]'
                    }`}
                  >
                    <PixelIcon icon={c.icon} size={13} />
                    {c.label}
                  </button>
                );
              })}
              <span className="shrink-0 self-center pl-1 font-mono text-[10px] text-[#75694f]">{ITEM_COUNT} 件</span>
            </div>
          )}

          {/* 工具散开区：key 绑 tab+itemCat，切图腾时重挂载 → su-scatter 散开动画重放 */}
          <div
            key={`${tab}-${itemCat}`}
            className="su-scatter game-scroll mt-3 grid max-h-[34dvh] grid-cols-6 gap-1.5 overflow-y-auto"
          >
            {tools.map((t) => {
              const active = tool === t.id;
              const rb = rarityBorder(t.id);
              const creUid = parseCreationTool(t.id);
              const creEntry = creUid ? (creations.find((e) => e.uid === creUid) ?? null) : null;
              const creTint = creEntry && creEntry.kind === 'species' ? CRE_TINTS[Math.max(0, Math.min(7, creEntry.tintIdx | 0))] : null;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTool(t.id)}
                  aria-pressed={active}
                  aria-label={t.label}
                  className={`relative flex h-13 w-full flex-col items-center justify-center gap-0.5 rounded-[11px] border transition-colors ${
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
                  {/* 造物种族色点：与图鉴染色一致的识别标记 */}
                  {creTint && <span className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: creTint }} aria-hidden />}
                  <span
                    className="max-w-[52px] truncate text-[8.5px] font-bold uppercase tracking-wide"
                    style={{ color: active ? '#efc377' : rb || creTint || '#a2957c' }}
                  >
                    {t.label}
                  </span>
                  {/* 活动指示点（与 Dock 同语言，放右上角避免压到下一行工具） */}
                  {active && <span className="absolute right-1 top-1 h-1 w-1 rounded-full bg-[#efc377] shadow-[0_0_6px_rgba(239,195,119,0.8)]" aria-hidden />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* —— 神之印记：唯一常驻元素（抽屉打开时沉到抽屉下方，仍是 toggle 收回钮） —— */}
      <div className="pb-[max(0.6rem,env(safe-area-inset-bottom))]">
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              // 上滑手势刚开过抽屉：吞掉浏览器补发的 click，防止把刚开的抽屉又关掉
              if (swipedUp.current) {
                swipedUp.current = false;
                return;
              }
              if (divineOpen) setDivineOpen(false);
              else openDivine();
            }}
            onTouchStart={(e) => {
              swipedUp.current = false;
              sealStartY.current = e.touches[0]?.clientY ?? null;
            }}
            onTouchMove={(e) => {
              const y0 = sealStartY.current;
              const y = e.touches[0]?.clientY;
              if (y0 != null && y != null && y0 - y > SWIPE_UP_OPEN) {
                sealStartY.current = null; // 触发一次后清零，防连续 move 重复 set
                swipedUp.current = true;
                openDivine();
              }
            }}
            onTouchEnd={() => {
              sealStartY.current = null;
            }}
            aria-label="神之印记：打开施法手势盘"
            aria-expanded={divineOpen}
            className="su-seal pointer-events-auto flex h-14 w-14 items-center justify-center"
            style={
              // 选中具体工具时金色描边强化（inline style 覆盖 su-seal 默认边框色；
              // 不用 box-shadow——它被 su-seal-glow 呼吸动画持续接管，改了会被动画盖掉）
              tool !== 'select'
                ? { borderColor: '#efc377', outline: '2px solid rgba(239,195,119,0.45)', outlineOffset: '2px' }
                : undefined
            }
          >
            {tool === 'select' ? (
              <Sparkles className="h-6 w-6 text-[#e6ba6c]" aria-hidden />
            ) : (
              <PixelIcon icon={activeDef?.icon ?? 'select'} size={26} />
            )}
          </button>

          {/* 一次性引导气泡：从未打开过抽屉时出现，点击永久消失（新玩家引导，老玩家不打扰） */}
          {!divineOpen && !everOpened && !hintDismissed && (
            <button
              type="button"
              onClick={() => setHintDismissed(true)}
              aria-label="提示：点按或上滑神之印记打开施法手势盘"
              className="su-rise pointer-events-auto absolute bottom-0 left-full ml-2.5 flex h-11 items-center gap-1 whitespace-nowrap rounded-full border border-[rgba(214,178,120,0.45)] bg-[rgba(29,23,18,0.92)] px-3.5 text-[11px] font-bold tracking-widest text-[#e6ba6c] shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              神之印记
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
