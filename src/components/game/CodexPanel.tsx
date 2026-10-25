'use client';
// ============ 造物图鉴（Codex：神谕创造模式的永久图书馆） ============
// 深度集成闭环：神谕造物/玩家收藏 → 图鉴永久保存 → pinned 上放置面板（可删除）
//   → 全元素编辑（手动表单 + 重掷外貌 + 同步当前世界现存个体）→ 唤醒神谕 AI 再编辑。
// 三类条目：物种（模板+视觉基因组定格）/ 神铸武器（四槽+倍率）/ 神物（九属性+稀有度）。
import { useMemo, useState, useSyncExternalStore } from 'react';
import { useGameStore, getEngine } from '@/store/gameStore';
import {
  listCreations, subscribeCreations, removeCreation, patchCreation, describeCreation,
  creationToolId, CRE_TINTS, type CreationEntry, type SpeciesCreation, type WeaponCreation, type ItemCreation,
} from '@/lib/game/creations';
import { SLOT_NAMES, RARITY_META } from '@/lib/game/items';
import { RACES } from '@/lib/game/types';
import { CREATION_CAP } from '@/lib/game/creations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PixelIcon } from './PixelIcon';
import {
  BookOpen, X, Pin, PinOff, Pencil, Sparkles, Trash2, Swords, Dna, Gem, FlaskConical, Wand2, RefreshCw, Download, Crown,
} from 'lucide-react';

/** 造物体形族系/模板种族 → 像素图标（与 Toolbar 同源） */
const BASE_ICON: Record<string, string> = {
  human: 'human', elf: 'elf', dwarf: 'dwarf', orc: 'orc', bandit: 'bandit',
  zombie: 'zombie', sheep: 'sheep', wolf: 'wolf', bear: 'bear', dragon: 'dragon',
  deer: 'deer', penguin: 'penguin', camel: 'camel', scorpion: 'scorpion',
  snake: 'snake', snowwolf: 'snowwolf', skeleton: 'skeleton', demon: 'demon', mage: 'mage',
  // v5 全新造物体形族系扩展
  troll: 'demon', ogre: 'demon', whitewalker: 'whitewalker', vampire: 'vampire',
  kraken: 'kraken', sandworm: 'sandworm', basilisk: 'snake', person: 'human',
};

function creIconOf(e: CreationEntry): string {
  if (e.kind === 'species') return BASE_ICON[e.form ?? e.baseKey] ?? 'wolf';
  if (e.kind === 'item') return e.art;
  return 'sword2';
}

/** 全新造物体形族系选项（与引擎 FORM_ANCHOR 同源） */
const FORM_OPTIONS: [string, string][] = [
  ['person', '人形'], ['wolf', '狼形'], ['bear', '熊形'], ['deer', '鹿形'], ['sheep', '羊形'],
  ['penguin', '企鹅形'], ['camel', '骆驼形'], ['scorpion', '蝎形'], ['snake', '蛇形'], ['snowwolf', '雪狼形'],
  ['dragon', '龙形'], ['skeleton', '骸骨形'], ['demon', '魔形'], ['mage', '法师形'], ['troll', '巨魔形'],
  ['ogre', '食人魔形'], ['whitewalker', '白行者形'], ['vampire', '吸血鬼形'], ['kraken', '海怪形'], ['sandworm', '沙虫形'], ['basilisk', '蛇怪形'],
];

const KIND_META: Record<CreationEntry['kind'], { label: string; icon: typeof Dna; color: string }> = {
  species: { label: '物种', icon: Dna, color: 'text-emerald-300' },
  weapon: { label: '武器', icon: Swords, color: 'text-orange-300' },
  item: { label: '神物', icon: Gem, color: 'text-amber-300' },
};

type Filter = 'all' | 'species' | 'weapon' | 'item';

// ———————————————————————— 编辑器（全元素表单） ————————————————————————

/** 数值输入行：Label + Input（number）+ 单位提示 */
function NumField({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">{label}</Label>
      <Input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="h-7 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-2 font-mono text-[11px] font-bold text-zinc-100 focus:border-amber-400/50"
      />
      {unit && <span className="w-8 shrink-0 text-[9px] font-bold text-zinc-500">{unit}</span>}
    </div>
  );
}

/** 物种编辑表单：全元素（名/体形族系/野文/生命/攻击/速度/繁衍/寿限/色环/生态角色/备注）+ 世界同步 */
function SpeciesEditor({ entry, onSaved }: { entry: SpeciesCreation; onSaved: () => void }) {
  const showNote = useGameStore((s) => s.showNote);
  const [f, setF] = useState({
    name: entry.name, hp: entry.hp, dmg: entry.dmg, speed: entry.speed, repro: entry.repro,
    maxAge: entry.maxAge, wild: entry.wild, tintIdx: entry.tintIdx, note: entry.note ?? '',
    form: entry.form ?? '', predator: entry.predator ?? false, hostile: entry.hostile ?? false,
    cap: entry.cap ?? 0, archetype: entry.archetype ?? '',
  });
  const save = (opts: { rerollVis?: boolean } = {}) => {
    const name = f.name.trim().slice(0, 8);
    if (!name) { showNote('名字不能为空', 'danger'); return; }
    const next = patchCreation(entry.uid, {
      name, hp: Math.max(1, Math.round(f.hp)), dmg: Math.max(0, f.dmg),
      speed: Math.max(0.005, Math.min(0.3, f.speed)), repro: Math.max(0, Math.min(0.02, f.repro)),
      maxAge: Math.max(1, Math.round(f.maxAge)), wild: f.wild, tintIdx: f.tintIdx, note: f.note.slice(0, 40),
      form: f.form || undefined, predator: f.form ? f.predator : undefined,
      hostile: f.form ? f.hostile : undefined,
      cap: f.form && f.cap > 0 ? Math.max(4, Math.min(400, Math.round(f.cap))) : undefined,
      archetype: f.archetype.trim().slice(0, 24) || undefined,
    });
    if (!next) { showNote('保存失败：浏览器存储不可用', 'danger'); return; }
    // 深度集成：当前世界已注册此图鉴物种 → 原地改写现存个体（随存档走）
    const eng = getEngine();
    const rid = eng.creationRaceIds?.get(entry.uid);
    if (rid !== undefined) {
      eng.editRaceDef(rid, {
        name, hp: Math.max(1, Math.round(f.hp)), dmg: Math.max(0, f.dmg),
        speed: Math.max(0.005, Math.min(0.3, f.speed)), repro: Math.max(0, Math.min(0.02, f.repro)),
        maxAge: Math.max(1, Math.round(f.maxAge)), isCiv: !f.wild, hostile: f.hostile,
        ...(opts.rerollVis ? { rerollVis: 1 } : {}),
      }, { applyToExisting: true });
      showNote(`「${name}」已保存${opts.rerollVis ? '并重掷外貌' : ''}，现存个体同步改写`, 'good');
    } else {
      if (opts.rerollVis) patchCreation(entry.uid, { visT: undefined });
      showNote(`「${name}」已保存（未在本世界降临，外貌将在放置时重新演化）`, 'good');
    }
    onSaved();
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">名字</Label>
        <Input
          value={f.name}
          maxLength={8}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="h-7 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-2 text-[11px] font-bold text-zinc-100 focus:border-amber-400/50"
        />
        <span className="shrink-0 text-[9px] text-zinc-500">≤8字</span>
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">形态</Label>
        <span className="text-[10px] font-bold text-zinc-300">{f.wild ? '野生动物（不建国）' : '文明种族（可建国）'}</span>
        <Switch checked={!f.wild} onCheckedChange={(v) => setF({ ...f, wild: !v })} aria-label="文明形态开关" className="ml-auto" />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">体形</Label>
        <Select value={f.form || 'auto'} onValueChange={(v) => setF({ ...f, form: v === 'auto' ? '' : v })}>
          <SelectTrigger className="h-7 min-w-0 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 text-[11px] font-bold text-zinc-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-2 border-zinc-700 bg-zinc-900">
            <SelectItem value="auto" className="text-[11px]">（按角色随机）</SelectItem>
            {FORM_OPTIONS.map(([k, label]) => (
              <SelectItem key={k} value={k} className="text-[11px]">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PixelIcon icon={f.form ? (BASE_ICON[f.form] ?? 'wolf') : 'wolf'} size={22} />
      </div>
      {f.wild && (
        <div className="grid grid-cols-2 gap-x-3">
          <label className="flex items-center gap-2">
            <Switch checked={f.predator} onCheckedChange={(v) => setF({ ...f, predator: v })} aria-label="捕食者开关" />
            <span className="text-[10px] font-bold text-zinc-300">捕食者</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch checked={f.hostile} onCheckedChange={(v) => setF({ ...f, hostile: v })} aria-label="敌视文明开关" />
            <span className="text-[10px] font-bold text-zinc-300">敌视文明</span>
          </label>
        </div>
      )}
      {f.wild && f.form && <NumField label="种群上限" value={f.cap} onChange={(v) => setF({ ...f, cap: v })} min={4} max={400} step={1} unit="只" />}
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">原型</Label>
        <Input
          value={f.archetype}
          maxLength={24}
          placeholder="种族原型一句话（可选）"
          onChange={(e) => setF({ ...f, archetype: e.target.value })}
          className="h-7 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-2 text-[11px] text-zinc-200 focus:border-amber-400/50"
        />
      </div>
      <NumField label="生命" value={f.hp} onChange={(v) => setF({ ...f, hp: v })} min={1} max={99999} step={1} />
      <NumField label="攻击" value={f.dmg} onChange={(v) => setF({ ...f, dmg: v })} min={0} max={500} step={0.5} />
      <NumField label="速度" value={f.speed} onChange={(v) => setF({ ...f, speed: v })} min={0.005} max={0.3} step={0.005} unit="格/t" />
      <NumField label="繁衍" value={f.repro} onChange={(v) => setF({ ...f, repro: v })} min={0} max={0.02} step={0.001} />
      <NumField label="寿限" value={f.maxAge} onChange={(v) => setF({ ...f, maxAge: v })} min={1} max={9999} step={1} unit="年" />
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">色环</Label>
        <div className="flex gap-1">
          {CRE_TINTS.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => setF({ ...f, tintIdx: i })}
              aria-label={`色环 ${i + 1}`}
              aria-pressed={f.tintIdx === i}
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${f.tintIdx === i ? 'border-zinc-100' : 'border-zinc-700'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">备注</Label>
        <Input
          value={f.note}
          maxLength={40}
          placeholder="神话背景一行（可选）"
          onChange={(e) => setF({ ...f, note: e.target.value })}
          className="h-7 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-2 text-[11px] text-zinc-200 focus:border-amber-400/50"
        />
      </div>
      <div className="mt-1 flex gap-2">
        <Button
          size="sm"
          onClick={() => save()}
          className="h-8 flex-1 gap-1 rounded-sm border-2 border-emerald-500/60 bg-emerald-500/15 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> 保存图鉴
        </Button>
        <Button
          size="sm"
          onClick={() => save({ rerollVis: true })}
          title="重新随机视觉基因组（外貌大变样；已降临个体立即换装）"
          className="h-8 gap-1 rounded-sm border-2 border-violet-500/50 bg-violet-500/10 text-[11px] font-bold text-violet-300 hover:bg-violet-500/20"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> 重掷外貌
        </Button>
      </div>
    </div>
  );
}

/** 武器编辑表单：四槽 + 倍率 + 铸造到王国 */
function WeaponEditor({ entry, onSaved }: { entry: WeaponCreation; onSaved: () => void }) {
  const showNote = useGameStore((s) => s.showNote);
  const [f, setF] = useState({ name: entry.name, payload: entry.payload, delivery: entry.delivery, guide: entry.guide, powerSlot: entry.powerSlot, boost: entry.boost, note: entry.note ?? '' });
  const [forgeCiv, setForgeCiv] = useState<string>('');
  const civs = useMemo(() => getEngine().civs.filter((c) => c.alive), []);
  const save = () => {
    const name = f.name.trim().slice(0, 8);
    if (!name) { showNote('名字不能为空', 'danger'); return; }
    const next = patchCreation(entry.uid, {
      name, payload: f.payload, delivery: f.delivery, guide: f.guide, powerSlot: f.powerSlot,
      boost: Math.max(0.5, Math.min(3, f.boost)), note: f.note.slice(0, 40),
    });
    showNote(next ? `神铸武器「${name}」已保存` : '保存失败：浏览器存储不可用', next ? 'good' : 'danger');
    if (next) onSaved();
  };
  const forge = () => {
    const civId = parseInt(forgeCiv, 10);
    if (!Number.isFinite(civId)) { showNote('先选择要铸造给的王国', 'info'); return; }
    const w = getEngine().forgeCreationWeapon(entry.uid, civId);
    if (w) showNote(`「${w.name}」已铸造给 ${getEngine().civs[civId]?.name ?? '王国'}（威力 ${Math.round((w.q?.[0] ?? 0) + (w.q?.[1] ?? 0) + (w.q?.[2] ?? 0) + (w.q?.[3] ?? 0))}）`, 'good');
    else showNote('铸造失败', 'danger');
  };
  const SLOT_LABELS: [keyof typeof f, string, number][] = [
    ['payload', '装药威力', 6], ['delivery', '投送方式', 4], ['guide', '制导精度', 4], ['powerSlot', '供能放大', 4],
  ];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">名字</Label>
        <Input
          value={f.name}
          maxLength={8}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="h-7 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-2 text-[11px] font-bold text-zinc-100 focus:border-amber-400/50"
        />
      </div>
      {SLOT_LABELS.map(([k, label, mx]) => (
        <div key={k} className="flex items-center gap-2">
          <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">{label}</Label>
          <Slider
            value={[f[k] as number]}
            min={0}
            max={mx}
            step={1}
            onValueChange={(v) => setF({ ...f, [k]: v[0] })}
            className="min-w-0 flex-1"
            aria-label={label}
          />
          <span className="w-6 text-right font-mono text-[11px] font-bold text-orange-300">{f[k] as number}</span>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">倍率</Label>
        <Slider
          value={[f.boost]}
          min={0.5}
          max={3}
          step={0.05}
          onValueChange={(v) => setF({ ...f, boost: v[0] })}
          className="min-w-0 flex-1"
          aria-label="威力倍率"
        />
        <span className="w-9 text-right font-mono text-[11px] font-bold text-orange-300">×{f.boost.toFixed(2)}</span>
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">备注</Label>
        <Input
          value={f.note}
          maxLength={40}
          placeholder="神话背景一行（可选）"
          onChange={(e) => setF({ ...f, note: e.target.value })}
          className="h-7 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-2 text-[11px] text-zinc-200 focus:border-amber-400/50"
        />
      </div>
      <div className="mt-1 flex gap-2">
        <Button
          size="sm"
          onClick={save}
          className="h-8 flex-1 gap-1 rounded-sm border-2 border-emerald-500/60 bg-emerald-500/15 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
        >
          <Download className="h-3.5 w-3.5" aria-hidden /> 保存图鉴
        </Button>
      </div>
      {/* 铸造到当前世界王国（工坊联动） */}
      <div className="mt-1 rounded-sm border-2 border-orange-500/30 bg-orange-500/5 p-2">
        <p className="mb-1.5 flex items-center gap-1 text-[10px] font-bold tracking-wide text-orange-300">
          <Crown className="h-3 w-3" aria-hidden /> 铸造到当前世界的王国（立即装备现役军团）
        </p>
        <div className="flex gap-2">
          <Select value={forgeCiv} onValueChange={setForgeCiv}>
            <SelectTrigger className="h-7 min-w-0 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 text-[11px] font-bold text-zinc-200">
              <SelectValue placeholder="选择王国…" />
            </SelectTrigger>
            <SelectContent className="border-2 border-zinc-700 bg-zinc-900">
              {civs.map((c) => (
                <SelectItem key={c.id} value={String(c.id)} className="text-[11px]">
                  {c.name}（人口 {c.pop}）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={forge}
            className="h-8 shrink-0 gap-1 rounded-sm border-2 border-orange-500/60 bg-orange-500/15 text-[11px] font-bold text-orange-300 hover:bg-orange-500/25"
          >
            <Swords className="h-3.5 w-3.5" aria-hidden /> 铸造
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 神物编辑表单：槽位/稀有度/形制/九属性/描述 */
function ItemEditor({ entry, onSaved }: { entry: ItemCreation; onSaved: () => void }) {
  const showNote = useGameStore((s) => s.showNote);
  const [f, setF] = useState({
    name: entry.name, slot: entry.slot, rarity: entry.rarity, art: entry.art, desc: entry.desc,
    dmg: entry.stats.dmg ?? 0, hp: entry.stats.hp ?? 0, speedMul: entry.stats.speedMul ?? 1,
    regen: entry.stats.regen ?? 0, armor: entry.stats.armor ?? 0, crit: entry.stats.crit ?? 0,
    lifesteal: entry.stats.lifesteal ?? 0, thorns: entry.stats.thorns ?? 0, ranged: entry.stats.ranged ?? 0,
  });
  const save = () => {
    const name = f.name.trim().slice(0, 8);
    if (!name) { showNote('名字不能为空', 'danger'); return; }
    const next = patchCreation(entry.uid, {
      name, slot: f.slot, rarity: f.rarity, art: f.art, desc: f.desc.slice(0, 40),
      stats: {
        dmg: f.dmg, hp: f.hp, speedMul: f.speedMul, regen: f.regen, armor: f.armor,
        crit: f.crit, lifesteal: f.lifesteal, thorns: f.thorns, ranged: f.ranged,
      },
    });
    showNote(next ? `神物「${name}」已保存（宝物页即可放置）` : '保存失败：浏览器存储不可用', next ? 'good' : 'danger');
    if (next) onSaved();
  };
  const STAT_FIELDS: [keyof typeof f, string, number, number, number][] = [
    ['dmg', '攻击', 0, 50, 1], ['hp', '生命', 0, 200, 5], ['speedMul', '速度倍率', 0.5, 2, 0.05],
    ['regen', '回复', 0, 5, 0.1], ['armor', '护甲', 0, 30, 1], ['crit', '暴击%', 0, 50, 1],
    ['lifesteal', '吸血%', 0, 50, 1], ['thorns', '反伤', 0, 20, 1], ['ranged', '远程', 0, 12, 1],
  ];
  const ARTS: Record<string, string> = { wep: 'sword2', arm: 'armor2', hlm: 'iron_helm', shd: 'iron_shield', bts: 'leather_boots', rng: 'ring', amu: 'holy_symbol' };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">名字</Label>
        <Input
          value={f.name}
          maxLength={8}
          onChange={(e) => setF({ ...f, name: e.target.value })}
          className="h-7 min-w-0 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-2 text-[11px] font-bold text-zinc-100 focus:border-amber-400/50"
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">槽位</Label>
        <Select
          value={f.slot}
          onValueChange={(v) => setF({ ...f, slot: v as ItemCreation['slot'], art: ARTS[v] ?? f.art })}
        >
          <SelectTrigger className="h-7 min-w-0 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 text-[11px] font-bold text-zinc-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-2 border-zinc-700 bg-zinc-900">
            {Object.entries(SLOT_NAMES).map(([k, v]) => (
              <SelectItem key={k} value={k} className="text-[11px]">{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PixelIcon icon={f.art} size={22} />
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">稀有度</Label>
        <div className="flex flex-1 gap-1">
          {RARITY_META.map((r, i) => (
            <button
              key={r.name}
              type="button"
              onClick={() => setF({ ...f, rarity: i })}
              aria-label={r.name}
              aria-pressed={f.rarity === i}
              className={`flex-1 border-2 px-1 py-0.5 text-[9px] font-bold transition-colors ${
                f.rarity === i ? 'border-current' : 'border-zinc-700 text-zinc-500 hover:border-zinc-500'
              }`}
              style={f.rarity === i ? { color: r.color } : undefined}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {STAT_FIELDS.map(([k, label, mn, mx, step]) => (
          <div key={k} className="flex items-center gap-1.5">
            <Label className="w-[52px] shrink-0 text-[9px] font-bold text-zinc-400">{label}</Label>
            <Input
              type="number"
              value={f[k] as number}
              min={mn}
              max={mx}
              step={step}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) setF({ ...f, [k]: Math.max(mn, Math.min(mx, v)) });
              }}
              className="h-6 min-w-0 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-1.5 font-mono text-[10px] font-bold text-zinc-100 focus:border-amber-400/50"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Label className="w-[64px] shrink-0 text-[10px] font-bold tracking-wide text-zinc-400">描述</Label>
        <Input
          value={f.desc}
          maxLength={40}
          onChange={(e) => setF({ ...f, desc: e.target.value })}
          className="h-7 min-w-0 flex-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/70 px-2 text-[11px] text-zinc-200 focus:border-amber-400/50"
        />
      </div>
      <Button
        size="sm"
        onClick={save}
        className="mt-1 h-8 gap-1 rounded-sm border-2 border-emerald-500/60 bg-emerald-500/15 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/25"
      >
        <Download className="h-3.5 w-3.5" aria-hidden /> 保存图鉴
      </Button>
    </div>
  );
}

// ———————————————————————— 主面板 ————————————————————————

export function CodexPanel() {
  const showCodex = useGameStore((s) => s.showCodex);
  const toggleCodex = useGameStore((s) => s.toggleCodex);
  const showNote = useGameStore((s) => s.showNote);
  const setOraclePending = useGameStore((s) => s.setOraclePending);
  const openOracle = useGameStore((s) => s.openOracle);
  const setTool = useGameStore((s) => s.setTool);
  const setTab = useGameStore((s) => s.setTab);
  const [filter, setFilter] = useState<Filter>('all');
  /** 正在编辑的条目 uid（展开编辑器表单；null = 浏览模式） */
  const [editUid, setEditUid] = useState<string | null>(null);

  const creations = useSyncExternalStore(subscribeCreations, listCreations);
  const list = useMemo(
    () => (filter === 'all' ? creations : creations.filter((e) => e.kind === filter)),
    [creations, filter],
  );
  const editing = editUid !== null ? (creations.find((e) => e.uid === editUid) ?? null) : null;
  // 编辑目标被删除（图鉴其他入口）时：editing 自然为 null 回到浏览态，无需 effect

  /** 唤醒神谕编辑：把条目上下文注入神谕 create 模式并自动发送 */
  const wakeOracle = (e: CreationEntry) => {
    setOraclePending(
      `请以造物主身份再编辑我的图鉴条目——${describeCreation(e)}。用 edit_creation 原地改写它（保持 uid 不变），可以调数值、改名、改备注、pin 上放置面板；如果它是物种还可以考虑 spawn_species 让改后的形态立即降临世界。改完告诉我你做了什么以及为什么这样改更好。`,
    );
    openOracle();
    useGameStore.setState({ showCodex: false }); // 幂等直关（不依赖 toggle 读旧值，避免批处理时序抖动）
  };

  /** 快捷放置：切到对应 tab 并选中 cre: 工具 */
  const quickPlace = (e: CreationEntry) => {
    if (e.kind === 'weapon') { showNote('神铸武器通过编辑器内「铸造到王国」装备军团', 'info'); return; }
    setTab(e.kind === 'species' ? (e.wild ? 'animals' : 'creatures') : 'items');
    setTool(creationToolId(e.uid));
    toggleCodex();
    showNote(`已选中造物「${e.name}」——在世界中点击放置`, 'good');
  };

  return (
    <Dialog open={showCodex} onOpenChange={(o) => { if (!o) toggleCodex(); }}>
      <DialogContent className="flex max-h-[86dvh] w-[min(680px,94vw)] flex-col gap-0 rounded-sm border-2 border-4 border-t-4 border-zinc-700 bg-zinc-900/98 p-0 sm:max-w-[min(680px,94vw)]">
        <DialogHeader className="border-b-2 border-zinc-800 px-4 py-2.5">
          <DialogTitle className="flex items-center gap-2 pr-10 text-[13px] font-bold tracking-widest text-zinc-100 uppercase">
            {/* pr-10：给右上角 X 关闭钮（32px，top-4 right-4）留位，防右侧计数被压（Task 72-b） */}
            <BookOpen className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
            造物图鉴
            <span className="rounded-sm border border-emerald-400/50 bg-emerald-400/10 px-1.5 py-px text-[8px] font-bold tracking-normal text-emerald-300">
              永久图书馆
            </span>
            <span className="ml-auto shrink-0 font-mono text-[10px] font-bold text-zinc-500">
              {creations.length}/{CREATION_CAP}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* 筛选行 + 唤醒神谕创造（flex-wrap：<390px 窄屏芯片换行而非溢出弹窗，Task 72-b） */}
        <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-zinc-800 px-3 py-2">
          {(['all', 'species', 'weapon', 'item'] as const).map((k) => {
            const active = filter === k;
            const meta = k === 'all' ? null : KIND_META[k];
            const Icon = meta?.icon ?? BookOpen;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                aria-pressed={active}
                className={`flex h-7 items-center gap-1 border-2 px-2 text-[10px] font-bold tracking-wide transition-colors ${
                  active
                    ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                    : 'border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }`}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {k === 'all' ? `全部 ${creations.length}` : `${meta!.label} ${creations.filter((e) => e.kind === k).length}`}
              </button>
            );
          })}
          <Button
            size="sm"
            onClick={() => {
              setOraclePending('进入造物主模式：先 list_creations 查看我的永久图鉴，然后自由创造——一个有叙事张力的新物种（spawn_species 降临 + save_creation pin 铭刻上放置面板）、或一件神铸武器、或一件神物，并为它写一段神话背景');
              openOracle();
              useGameStore.setState({ showCodex: false }); // 幂等直关
            }}
            className="ml-auto h-7 gap-1 rounded-sm border-2 border-emerald-500/60 bg-emerald-500/15 px-2 text-[10px] font-bold text-emerald-300 hover:bg-emerald-500/25"
          >
            <FlaskConical className="h-3.5 w-3.5" aria-hidden />
            唤醒神谕创造
          </Button>
        </div>

        {/* 列表 / 编辑器双态 */}
        <div className="game-scroll min-h-0 flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: 'thin' }}>
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-zinc-700 bg-zinc-800/60">
                <BookOpen className="h-5 w-5 text-zinc-500" aria-hidden />
              </div>
              <p className="text-[12px] font-bold text-zinc-300">图鉴还是空的</p>
              <p className="max-w-[34ch] text-[10px] leading-relaxed text-zinc-500">
                在世界中框选生物「存为图鉴」，或唤醒神谕的造物主模式创造新物种、神铸武器与神物——
                铭刻于此的造物跨世界永久存在，pin 后显示在底部放置面板。
              </p>
            </div>
          ) : editing ? (
            /* ———— 编辑器态：全元素表单 ———— */
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditUid(null)}
                  aria-label="返回列表"
                  className="h-7 gap-1 rounded-sm border-2 border-zinc-700 bg-zinc-800/60 px-2 text-[10px] font-bold text-zinc-300 hover:border-zinc-500"
                >
                  ← 返回
                </Button>
                <span className={`flex items-center gap-1 text-[11px] font-bold ${KIND_META[editing.kind].color}`}>
                  {(() => { const I = KIND_META[editing.kind].icon; return <I className="h-3.5 w-3.5" aria-hidden />; })()}
                  编辑{KIND_META[editing.kind].label} · {editing.name}
                </span>
                <span className="ml-auto font-mono text-[9px] text-zinc-500">{editing.uid}</span>
              </div>
              {editing.kind === 'species' && <SpeciesEditor key={editing.uid} entry={editing} onSaved={() => setEditUid(null)} />}
              {editing.kind === 'weapon' && <WeaponEditor key={editing.uid} entry={editing} onSaved={() => setEditUid(null)} />}
              {editing.kind === 'item' && <ItemEditor key={editing.uid} entry={editing} onSaved={() => setEditUid(null)} />}
            </div>
          ) : (
            /* ———— 浏览态：卡片列表 ———— */
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((e) => {
                const meta = KIND_META[e.kind];
                const Icon = meta.icon;
                const tint = e.kind === 'species' ? CRE_TINTS[Math.max(0, Math.min(7, e.tintIdx | 0))] : null;
                return (
                  <div
                    key={e.uid}
                    className="flex flex-col gap-1.5 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/50 p-2 transition-colors hover:border-zinc-500"
                  >
                    <div className="flex items-start gap-2">
                      <div className="relative shrink-0">
                        <PixelIcon icon={creIconOf(e)} size={26} />
                        {tint && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ backgroundColor: tint }} aria-hidden />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-[12px] font-bold text-zinc-100">
                          {e.name}
                          <span className={`flex items-center gap-0.5 text-[9px] font-bold ${meta.color}`}>
                            <Icon className="h-2.5 w-2.5" aria-hidden />
                            {meta.label}
                          </span>
                          {e.createdBy === 'oracle' && (
                            <span title="神谕亲手缔造" aria-label="神谕造物">
                              <Sparkles className="h-2.5 w-2.5 text-fuchsia-400/80" aria-hidden />
                            </span>
                          )}
                        </p>
                        <p className="line-clamp-2 text-[9px] leading-snug text-zinc-500">{describeCreation(e)}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-sm border px-1 py-px text-[8px] font-bold ${
                          e.pinned ? 'border-amber-400/60 bg-amber-400/10 text-amber-300' : 'border-zinc-600/60 bg-zinc-700/30 text-zinc-500'
                        }`}
                        title={e.pinned ? '已上放置面板（生物/动物/宝物页可见可放置）' : '未上面板（编辑可上板）'}
                      >
                        {e.pinned ? '面板' : '入库'}
                      </span>
                    </div>
                    {/* 操作行：放置 / 编辑 / pin / 唤醒神谕 / 删除 */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => quickPlace(e)}
                        title={e.kind === 'weapon' ? '神铸武器须铸造给王国' : '选中该造物为当前放置工具'}
                        className="h-6 min-w-0 flex-1 gap-1 rounded-sm border-2 border-emerald-500/40 bg-emerald-500/10 px-1 text-[9px] font-bold text-emerald-300 hover:bg-emerald-500/20"
                      >
                        <Wand2 className="h-3 w-3 shrink-0" aria-hidden /> 放置
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => setEditUid(e.uid)}
                        aria-label={`编辑 ${e.name}`}
                        title="全元素编辑（数值/形态/外貌/备注）"
                        className="h-6 w-6 shrink-0 rounded-sm border-2 border-zinc-600/70 text-zinc-400 hover:border-teal-400/60 hover:text-teal-300"
                      >
                        <Pencil className="h-3 w-3" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => {
                          const next = patchCreation(e.uid, { pinned: !e.pinned });
                          if (next) showNote(next.pinned ? `「${next.name}」已上放置面板` : `「${next.name}」已从放置面板移下（图鉴保留）`, 'info');
                        }}
                        aria-label={e.pinned ? '从放置面板移下' : '上放置面板'}
                        title={e.pinned ? '从放置面板移下（图鉴保留）' : '上放置面板（永久显示，可删除）'}
                        className={`h-6 w-6 shrink-0 rounded-sm border-2 ${
                          e.pinned
                            ? 'border-amber-400/60 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
                            : 'border-zinc-600/70 text-zinc-400 hover:border-amber-400/60 hover:text-amber-300'
                        }`}
                      >
                        {e.pinned ? <PinOff className="h-3 w-3" aria-hidden /> : <Pin className="h-3 w-3" aria-hidden />}
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => wakeOracle(e)}
                        aria-label={`唤醒神谕编辑 ${e.name}`}
                        title="唤醒神谕 AI 以造物主模式再编辑此条目"
                        className="h-6 w-6 shrink-0 rounded-sm border-2 border-fuchsia-500/50 bg-fuchsia-500/10 text-fuchsia-300 hover:bg-fuchsia-500/25"
                      >
                        <Sparkles className="h-3 w-3" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => {
                          if (removeCreation(e.uid)) showNote(`造物「${e.name}」已永久移除`, 'info');
                        }}
                        aria-label={`删除 ${e.name}`}
                        title="从图鉴永久删除"
                        className="h-6 w-6 shrink-0 rounded-sm border-2 border-zinc-600/70 text-zinc-500 hover:border-red-400/70 hover:text-red-300"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
