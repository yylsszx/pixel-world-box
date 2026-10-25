'use client';
// ============ 事件触发器面板（像素级精细化事件控制及触发） ============
// 条件（年份/周期/人口/王国/战争/火势/单位/区域进入/手动）× 动作（全量 30+ 工具）× 像素级位置
import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { RACES, COND_KINDS, describeCond } from '@/lib/game/types';
import type { TriggerCond, TriggerDef } from '@/lib/game/types';
import { TOOLS, TOOL_BY_ID, TAB_META } from '@/lib/game/constants';
import type { ToolTab } from '@/lib/game/constants';
import { PixelIcon } from './PixelIcon';
import { InlineNote } from './InlineNote';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Crosshair, Zap, Trash2, Play, MapPin, Plus, X, ChevronUp, ChevronDown } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

/** 条件参数输入子表单：根据 kind 渲染参数控件 */
function CondFields({ cond, onChange }: { cond: TriggerCond; onChange: (c: TriggerCond) => void }) {
  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const inputCls = 'w-16 rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-[11px] font-bold text-zinc-100 focus:border-amber-400 focus:outline-none';
  switch (cond.kind) {
    case 'time':
      return (
        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
          年份 ≥
          <input
            type="number" inputMode="numeric" min={1} max={9999} value={cond.year}
            onChange={(e) => onChange({ kind: 'time', year: num(e.target.value, 1, 9999, 1) })}
            className={inputCls} aria-label="目标年份"
          />
          年
        </span>
      );
    case 'every':
      return (
        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
          每
          <input
            type="number" inputMode="numeric" min={1} max={999} value={cond.years}
            onChange={(e) => onChange({ kind: 'every', years: num(e.target.value, 1, 999, 5) })}
            className={inputCls} aria-label="周期年数"
          />
          年
        </span>
      );
    case 'pop':
      return (
        <span className="flex flex-wrap items-center gap-1 text-[10px] text-zinc-400">
          <select
            value={cond.race}
            onChange={(e) => onChange({ kind: 'pop', race: Number(e.target.value), count: cond.count })}
            className="rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1 py-0.5 text-[10px] font-bold text-zinc-200 focus:border-amber-400 focus:outline-none"
            aria-label="种族"
          >
            <option value={-1}>总人口</option>
            {Object.entries(RACES).map(([id, def]) => (
              <option key={id} value={id}>{def.name}</option>
            ))}
          </select>
          ≥
          <input
            type="number" inputMode="numeric" min={1} max={2400} value={cond.count}
            onChange={(e) => onChange({ kind: 'pop', race: cond.race, count: num(e.target.value, 1, 2400, 50) })}
            className={inputCls} aria-label="人口阈值"
          />
        </span>
      );
    case 'kingdomPop':
    case 'kingdomTiles':
      return (
        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
          ≥
          <input
            type="number" inputMode="numeric" min={1} max={99999} value={cond.count}
            onChange={(e) => onChange({ kind: cond.kind, count: num(e.target.value, 1, 99999, 100) })}
            className={inputCls} aria-label={cond.kind === 'kingdomPop' ? '王国人口阈值' : '王国领土阈值'}
          />
        </span>
      );
    case 'wars':
    case 'fires':
    case 'unitCount':
      return (
        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
          ≥
          <input
            type="number" inputMode="numeric" min={1} max={9999} value={cond.count}
            onChange={(e) => onChange({ kind: cond.kind, count: num(e.target.value, 1, 9999, cond.kind === 'wars' ? 1 : 30) })}
            className={inputCls} aria-label="阈值"
          />
        </span>
      );
    case 'enter':
      return (
        <span className="flex items-center gap-1 text-[10px] text-zinc-400">
          <select
            value={cond.race}
            onChange={(e) => onChange({ kind: 'enter', race: Number(e.target.value) })}
            className="rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1 py-0.5 text-[10px] font-bold text-zinc-200 focus:border-amber-400 focus:outline-none"
            aria-label="进入区域的种族"
          >
            <option value={-1}>任意生物</option>
            {Object.entries(RACES).map(([id, def]) => (
              <option key={id} value={id}>{def.name}</option>
            ))}
          </select>
        </span>
      );
    case 'hand':
      return <span className="text-[10px] text-zinc-500">无需参数</span>;
  }
}

/** 动作选择器：按工具分类分组 + PixelIcon 图标 */
function ActionSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const cur = TOOL_BY_ID[value];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="选择触发动作"
        className="flex w-full items-center gap-1.5 rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1.5 py-1 text-left hover:border-amber-400/70"
      >
        {cur ? <PixelIcon icon={cur.icon} size={14} /> : null}
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-200">{cur?.label ?? '选择动作'}</span>
        {open ? <ChevronUp className="h-3 w-3 text-zinc-500" aria-hidden /> : <ChevronDown className="h-3 w-3 text-zinc-500" aria-hidden />}
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-sm border-2 border-zinc-600 bg-zinc-900/98 p-1 shadow-[0_4px_0_rgba(0,0,0,0.7)]">
          {TAB_META.map((tab) => (
            <div key={tab.id} className="mb-1">
              <p className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">{tab.label}</p>
              <div className="grid grid-cols-2 gap-0.5">
                {TOOLS.filter((t) => t.tab === (tab.id as ToolTab) && !t.id.startsWith('item_')).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onChange(t.id); setOpen(false); }}
                    className={`flex items-center gap-1 rounded-sm px-1 py-0.5 text-left hover:bg-zinc-700 ${value === t.id ? 'bg-amber-400/20' : ''}`}
                    title={t.desc}
                  >
                    <PixelIcon icon={t.icon} size={12} />
                    <span className="truncate text-[10px] font-bold text-zinc-300">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 新建触发器表单（内联展开） */
function NewTriggerForm({ onClose }: { onClose: () => void }) {
  const { addTrigger, startPick } = useGameStore();
  const [name, setName] = useState('');
  const [condKind, setCondKind] = useState<TriggerCond['kind']>('time');
  const [cond, setCond] = useState<TriggerCond>({ kind: 'time', year: 10 });
  const [action, setAction] = useState('meteor');
  const [brush, setBrush] = useState(3);
  const [x, setX] = useState(128);
  const [y, setY] = useState(80);
  const [r, setR] = useState(6);
  const [once, setOnce] = useState(true);
  const [cd, setCd] = useState(5);

  const pickKind = (k: TriggerCond['kind']) => {
    setCondKind(k);
    // 切换类型时给一个合理默认值
    const def: Record<TriggerCond['kind'], TriggerCond> = {
      time: { kind: 'time', year: Math.max(1, Math.floor(useGameStore.getState().stats?.year ?? 0) + 10) },
      every: { kind: 'every', years: 5 },
      pop: { kind: 'pop', race: -1, count: 50 },
      kingdomPop: { kind: 'kingdomPop', count: 100 },
      kingdomTiles: { kind: 'kingdomTiles', count: 200 },
      wars: { kind: 'wars', count: 1 },
      fires: { kind: 'fires', count: 30 },
      unitCount: { kind: 'unitCount', count: 300 },
      enter: { kind: 'enter', race: -1 },
      hand: { kind: 'hand' },
    };
    setCond(def[k]);
  };

  const label = TOOL_BY_ID[action]?.label ?? action;
  const inputCls = 'w-16 rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-[11px] font-bold text-zinc-100 focus:border-amber-400 focus:outline-none';

  const submit = () => {
    const finalName = name.trim() || `${label}·${describeCond(cond)}`;
    addTrigger({ name: finalName, cond, action, brush, x: x + 0.5, y: y + 0.5, r, enabled: true, once, cd });
    onClose();
  };

  return (
    <div className="rounded-sm border-2 border-amber-500/60 bg-zinc-900/95 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
          <Plus className="h-3 w-3" aria-hidden /> 新建触发器
        </p>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="取消新建" className="h-6 w-6 border-2 border-transparent hover:bg-zinc-800">
          <X className="h-3 w-3" aria-hidden />
        </Button>
      </div>
      <div className="grid gap-1.5">
        {/* 名称 */}
        <input
          type="text" value={name} maxLength={16}
          onChange={(e) => setName(e.target.value)}
          placeholder={`触发器名称（默认：${label}·条件）`}
          className="w-full rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1.5 py-1 text-[11px] font-bold text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
          aria-label="触发器名称"
        />
        {/* 条件 */}
        <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-1.5">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">触发条件</p>
          <select
            value={condKind}
            onChange={(e) => pickKind(e.target.value as TriggerCond['kind'])}
            className="mb-1 w-full rounded-sm border-2 border-zinc-600 bg-zinc-800 px-1 py-1 text-[11px] font-bold text-zinc-200 focus:border-amber-400 focus:outline-none"
            aria-label="条件类型"
          >
            {COND_KINDS.map((k) => (
              <option key={k.kind} value={k.kind}>{k.label}</option>
            ))}
          </select>
          <CondFields cond={cond} onChange={setCond} />
          <p className="mt-0.5 text-[9px] leading-tight text-zinc-600">{COND_KINDS.find((k) => k.kind === condKind)?.hint}</p>
        </div>
        {/* 动作 */}
        <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-1.5">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">触发动作</p>
          <ActionSelect value={action} onChange={setAction} />
          <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
            笔刷半径
            <input
              type="number" inputMode="numeric" min={1} max={10} value={brush}
              onChange={(e) => { const n = Math.floor(Number(e.target.value)); setBrush(Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : 3); }}
              className={inputCls} aria-label="动作笔刷半径"
            />
          </div>
        </div>
        {/* 位置（像素级） */}
        <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-1.5">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">像素级位置</p>
          <div className="flex flex-wrap items-center gap-1 text-[10px] text-zinc-400">
            <span>X</span>
            <input
              type="number" inputMode="numeric" min={0} max={255} value={x}
              onChange={(e) => { const n = Math.floor(Number(e.target.value)); setX(Number.isFinite(n) ? Math.max(0, Math.min(255, n)) : 128); }}
              className={inputCls} aria-label="X 坐标"
            />
            <span>Y</span>
            <input
              type="number" inputMode="numeric" min={0} max={159} value={y}
              onChange={(e) => { const n = Math.floor(Number(e.target.value)); setY(Number.isFinite(n) ? Math.max(0, Math.min(159, n)) : 80); }}
              className={inputCls} aria-label="Y 坐标"
            />
            <Button
              variant="ghost" size="sm"
              onClick={() => startPick((px, py) => { setX(px); setY(py); })}
              className="h-6 gap-1 border-2 border-teal-500/60 px-1.5 text-[10px] font-bold text-teal-300 hover:bg-teal-500/15"
              aria-label="从地图选点"
            >
              <Crosshair className="h-3 w-3" aria-hidden /> 地图选点
            </Button>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
            区域半径
            <input
              type="number" inputMode="numeric" min={1} max={40} value={r}
              onChange={(e) => { const n = Math.floor(Number(e.target.value)); setR(Number.isFinite(n) ? Math.max(1, Math.min(40, n)) : 6); }}
              className={inputCls} aria-label="区域半径"
            />
            <span className="text-zinc-600">（进入区域检测）</span>
          </div>
        </div>
        {/* 重复策略 */}
        <div className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 p-1.5">
          <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-zinc-500">重复策略</p>
          <div className="flex items-center gap-2">
            <Switch checked={once} onCheckedChange={setOnce} aria-label="只触发一次" className="data-[state=checked]:bg-amber-500" />
            <span className="text-[10px] font-bold text-zinc-300">{once ? '触发一次后自动移除' : '可重复触发'}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-zinc-400">
            冷却
            <input
              type="number" inputMode="numeric" min={0} max={999} value={cd}
              onChange={(e) => { const n = Math.floor(Number(e.target.value)); setCd(Number.isFinite(n) ? Math.max(0, Math.min(999, n)) : 5); }}
              className={inputCls} aria-label="冷却年数"
            />
            年
            <span className="text-zinc-600">（0 = 最短间隔约半年）</span>
          </div>
        </div>
        <Button
          onClick={submit}
          className="h-8 gap-1 rounded-sm border-2 border-amber-400 bg-amber-400/20 text-[12px] font-bold text-amber-200 hover:bg-amber-400/35"
          aria-label="创建触发器"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden /> 创建触发器
        </Button>
      </div>
    </div>
  );
}

/** 单个触发器卡片 */
function TriggerCard({ t }: { t: TriggerDef }) {
  const { removeTrigger, updateTrigger, manualTrigger, jumpTo } = useGameStore();
  const tool = TOOL_BY_ID[t.action];
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`rounded-sm border-2 p-1.5 ${t.enabled ? 'border-zinc-700/80 bg-zinc-800/60' : 'border-zinc-800 bg-zinc-900/60 opacity-75'}`}>
      <div className="flex items-center gap-1.5">
        {tool ? <PixelIcon icon={tool.icon} size={16} /> : null}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[11px] font-bold ${t.enabled ? 'text-zinc-100' : 'text-zinc-500'}`}>{t.name}</p>
          <p className="truncate text-[9px] leading-tight text-zinc-500">
            {describeCond(t.cond)} → {tool?.label ?? t.action}
            {t.fired > 0 && <span className="ml-1 text-amber-400/80">已触发 {t.fired} 次</span>}
          </p>
        </div>
        <Switch
          checked={t.enabled}
          onCheckedChange={(v) => updateTrigger(t.id, { enabled: v })}
          aria-label={`启用 ${t.name}`}
          className="data-[state=checked]:bg-amber-500"
        />
      </div>
      <div className="mt-1 flex items-center gap-1">
        <Button
          variant="ghost" size="sm"
          onClick={() => manualTrigger(t.id)}
          className="h-6 gap-1 border-2 border-amber-500/50 px-1.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/15"
          aria-label={`手动触发 ${t.name}`}
        >
          <Play className="h-2.5 w-2.5" aria-hidden /> 触发
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => jumpTo(t.x, t.y)}
          className="h-6 gap-1 border-2 border-teal-500/50 px-1.5 text-[10px] font-bold text-teal-300 hover:bg-teal-500/15"
          aria-label={`跳转到 ${t.name} 的位置`}
        >
          <MapPin className="h-2.5 w-2.5" aria-hidden /> ({Math.floor(t.x)},{Math.floor(t.y)})
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => setExpanded((e) => !e)}
          className="ml-auto h-6 border-2 border-transparent px-1.5 text-[10px] font-bold text-zinc-400 hover:bg-zinc-700"
          aria-expanded={expanded}
          aria-label={expanded ? '收起详情' : '展开详情'}
        >
          {expanded ? <ChevronUp className="h-3 w-3" aria-hidden /> : <ChevronDown className="h-3 w-3" aria-hidden />}
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={() => removeTrigger(t.id)}
          className="h-6 border-2 border-transparent px-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/15"
          aria-label={`删除 ${t.name}`}
        >
          <Trash2 className="h-3 w-3" aria-hidden />
        </Button>
      </div>
      {expanded && (
        <div className="mt-1 grid gap-1 rounded-sm border border-zinc-700/60 bg-zinc-900/80 p-1.5 text-[9px] text-zinc-500">
          <p>触发位置：({Math.floor(t.x)}, {Math.floor(t.y)})，区域半径 {t.r}，笔刷 {t.brush}</p>
          <p>策略：{t.once ? '一次性（触发后自动移除）' : '可重复'}，冷却 {t.cd} 年，下次可触发年份 {Math.floor(t.nextFireYear) || '立即'}</p>
          <p className="text-zinc-600">{tool?.desc}</p>
        </div>
      )}
    </div>
  );
}

/** 触发器主体（列表 + 新建表单；桌面侧栏与移动端抽屉共用） */
function TriggersBody() {
  const { triggers, picking, cancelPick } = useGameStore();
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {picking && (
        <div className="border-b-2 border-teal-500/50 bg-teal-500/10 px-2 py-1.5">
          <p className="text-[10px] font-bold text-teal-300">正在选点：点击地图任意位置</p>
          <Button variant="ghost" size="sm" onClick={cancelPick} className="mt-0.5 h-6 gap-1 border-2 border-teal-500/50 px-1.5 text-[10px] font-bold text-teal-300 hover:bg-teal-500/15" aria-label="取消选点">
            <X className="h-3 w-3" aria-hidden /> 取消选点
          </Button>
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1 p-1.5">
        <div className="grid gap-1.5">
          {triggers.length === 0 && !creating && (
            <div className="flex flex-col items-center gap-2 px-3 py-6">
              <span className="flex h-12 w-12 items-center justify-center rounded-sm border-2 border-zinc-800 bg-zinc-900/70">
                <Zap className="h-6 w-6 text-zinc-700" aria-hidden />
              </span>
              <p className="text-center text-[11px] leading-relaxed text-zinc-500">
                还没有触发器——设定条件与动作，<br />
                <span className="text-zinc-600">让世界按你的剧本运转（年份、人口、战争、区域进入……）</span>
              </p>
            </div>
          )}
          {triggers.map((t) => (
            <TriggerCard key={t.id} t={t} />
          ))}
          {creating && <NewTriggerForm onClose={() => setCreating(false)} />}
        </div>
      </ScrollArea>
      {!creating && (
        <div className="border-t-2 border-zinc-700/80 p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]">
          <Button
            onClick={() => setCreating(true)}
            className="h-8 w-full gap-1 rounded-sm border-2 border-amber-400/70 bg-amber-400/15 text-[12px] font-bold text-amber-200 hover:bg-amber-400/30"
            aria-label="新建触发器"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> 新建触发器
          </Button>
        </div>
      )}
    </div>
  );
}

/** 触发器面板（桌面右侧侧栏 + 移动端底部抽屉） */
export function TriggersPanel() {
  const { triggers, showTriggers, toggleTriggers, mobilePanel, openMobilePanel, showChronicle } = useGameStore();
  const count = triggers.length;
  return (
    <>
      {/* 桌面右侧侧栏 —— 仅顶栏触发器按钮触发时出现；Task 67：贴右上角 top-64，高度动态让位纪事/工具条 */}
      {showTriggers && (
        <div
          className={`pointer-events-auto absolute right-2 top-[60px] z-10 hidden w-64 flex-col shadow-[0_4px_0_rgba(0,0,0,0.6)] sm:flex su-panel ${
            showChronicle ? 'max-h-[calc(100dvh-496px)]' : 'max-h-[calc(100dvh-192px)]'
          }`}
        >
          <div className="flex items-center justify-between border-2 border-b-0 border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <Zap className="h-3.5 w-3.5 text-amber-300" aria-hidden />
              事件触发器
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-[10px] font-bold text-zinc-500">{count}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTriggers}
                aria-label="关闭触发器面板"
                className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </span>
          </div>
          <div className="flex max-h-[calc(100dvh-96px-33px)] flex-col border-2 border-zinc-700/90 bg-zinc-900/95">
            <div className="px-2 pt-2"><InlineNote /></div>
            <TriggersBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'triggers'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[52vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <Zap className="h-4 w-4 text-amber-300" aria-hidden />
              事件触发器
              <span className="ml-auto font-mono text-[10px] font-bold text-zinc-500">{count}</span>
            </SheetTitle>
          </SheetHeader>
          <TriggersBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
