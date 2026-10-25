'use client';
// ============ 开发者模式面板（30+ 功能 · 双层：文明级 / 开发级） ============
// 文明级：触发文明自行达成的目标（旨意/军团/动员/灭国战争——可能失败）
// 开发级：直接干预世界与单位（瞬发效果）
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { RACES, JOBS, TRAITS } from '@/lib/game/types';
import type { Unit, DirectiveKind, WorldLaws } from '@/lib/game/types';
import { GOV_DEFS as GOV_DEVS } from '@/lib/game/tech';
import { PixelIcon } from './PixelIcon';
import { InlineNote } from './InlineNote';
import { Button } from '@/components/ui/button';
import {
  X, Terminal, Gauge, Swords, Landmark, Globe2, UserCog, Sparkles, Eraser,
  Crown, Flag, Scroll, TrendingUp, Users, Shield, Zap, Heart, Crosshair, Package,
  Flame, Scissors, Wrench, BadgeCheck, BadgeX, Ban, ScrollText,
  Radiation, Rocket, Plane, Bomb, Orbit, Cpu, Flame as Flame2, FlaskConical, Dna,
  MountainSnow, Tornado, Snowflake, Flower2, Sun, Leaf, Waves,
} from 'lucide-react';
import { GameEngine } from '@/lib/game/engine';

/** 武器架构 v2 组件名（与引擎 WC_* 表同步展示） */
const WC_PAYLOAD_NAME = GameEngine.WC_PAYLOAD.map((x) => x.name);
const WC_DELIVERY_NAME = GameEngine.WC_DELIVERY.map((x) => x.name);
const WC_GUIDE_NAME = GameEngine.WC_GUIDE.map((x) => x.name);
const WC_POWER_NAME = GameEngine.WC_POWER.map((x) => x.name);

interface DevInfo {
  year: number;
  tick: number;
  tickMs: number;
  units: number;
  buildings: number;
  effects: number;
  civs: number;
  wars: number;
  totalWars: number;
  items: number;
  triggers: number;
  fires: number;
  seed: number;
  armies: number;
  directives: number;
  firesOut?: number;
  repairsDone?: number;
  damaged?: number;
  techsKnown?: number;
  researching?: number;
  // —— 涌现层 ——
  emergentWeapons?: number;
  emergentKills?: number;
  dynSpecies?: number;
}

interface EngineWindow extends Window {
  __wbEngine?: {
    devStats(): DevInfo;
    devSetUnit(id: number, patch: Partial<Unit>): unknown;
    devSpawnChampion(race?: number, job?: number): Unit | null;
    devForceWar(a: number, b: number): boolean;
    devForcePeace(a: number, b: number): boolean;
    devPeaceAll(): void;
    devAnnexCiv(a: number, b: number): boolean;
    devKillCiv(id: number): boolean;
    devAddGold(id: number, n: number): boolean;
    devClearFires(): void;
    devClearUnits(): void;
    devJumpYears(n: number): void;
    getUnitInfo(id: number): Record<string, unknown> | null;
    frameCount: number;
    // —— 军团 ——
    devFormArmy(civId: number, targetCiv?: number): unknown;
    devDisbandArmy(armyId: number): boolean;
    devSetMorale(armyId: number, v: number): boolean;
    devForceRout(armyId: number): boolean;
    // —— 旨意 ——
    devDecree(civId: number, kind: DirectiveKind, param?: number, target?: number): unknown;
    devRevokeDecree(id: number): boolean;
    // —— 动员 ——
    devMobilize(civId: number, years?: number): boolean;
    devDemobilize(civId: number): boolean;
    // —— 战争 ——
    devTotalWar(a: number, b: number): boolean;
    devWorldWar(): number;
    // —— 终极世界大战 ——
    devUltimateWar(): boolean;
    devWwTruce(years?: number): number;
    devWwResume(): number;
    devWwEnd(): boolean;
    // —— 现代武器 ——
    devModernize(): number;
    // —— 未来武器 ——
    devTranscend(): number;
    // —— 涌现层 ——
    emergentForgeTick(): void;
    evolutionTick(): void;
    emergentWeapons: Map<number, { id: number; civ: number; name: string; gen: number; dtype: number; delivery: number; dmg: number; radius: number; kills: number; fired: number; wonder: boolean; retired: boolean; rad: boolean; terra: boolean; bornYear: number; pl?: number; dl?: number; gd?: number; pw?: number; q?: [number, number, number, number]; inter?: number }>;
    dynRaces: Map<number, { parent: number; bornYear: number }>;
    civs: { id: number; name: string; colorHex: string }[];
    speciate(race: number, base: unknown, avg: unknown, pop: number): boolean;
    ecoRaces(): number[];
    units: { dead: boolean; race: number }[];
    // —— 自然引擎 ——
    nature: { season: number; seasonName: string; ash: number; plates: number; quakeRisk: number; storms: { name: string }[]; counters: { quakes: number; eruptions: number; uplifts: number; cyclones: number } };
    devQuake(): boolean;
    devVolcano(): boolean;
    devCyclone(): boolean;
    devNextSeason(): number;
    // —— 武器架构 v2 ——
    doctrineOf(civId: number): { precision: number; saturation: number; terror: number; attrition: number };
    defenseOf(civId: number): { point: number; armor: number; evade: number };
    // —— 单位 ——
    devKillUnit(id: number): boolean;
    devHealUnit(id: number): boolean;
    devTeleportUnit(id: number, x: number, y: number): boolean;
    devEquipUnit(id: number): boolean;
    devSpawnRace(race: number, n: number): number;
    // —— 世界 ——
    devAddKnowledge(civId: number, n: number): boolean;
    devResearch(civId: number): string | null;
    devSetGov(civId: number, gov: number): boolean;
    devRenewBuildings(): number;
    devRainFire(n: number): number;
    devCullHalf(): number;
    devClearDecals(): number;
    devSetLaw(law: keyof WorldLaws, v: boolean): boolean;
    cam: { x: number; y: number };
  };
}

function getEng() {
  return (window as EngineWindow).__wbEngine ?? null;
}

/** 旨意种类 UI 配置（label + 是否需要目标文明 + 是否需要参数） */
const DECREE_KINDS: { kind: DirectiveKind; label: string; needTarget: boolean; needParam: boolean; hint: string }[] = [
  { kind: 'annihilate', label: '灭国令', needTarget: true, needParam: false, hint: '持续灭国战争摧毁目标（可能失败）' },
  { kind: 'conquer', label: '攻城令', needTarget: true, needParam: false, hint: '攻陷目标王都' },
  { kind: 'expand', label: '扩张令', needTarget: false, needParam: true, hint: '领土达到 N 格' },
  { kind: 'wealth', label: '富国令', needTarget: false, needParam: true, hint: '财富达到 N' },
  { kind: 'wisdom', label: '启智令', needTarget: false, needParam: true, hint: '知识达到 N' },
  { kind: 'populate', label: '人口令', needTarget: false, needParam: true, hint: '人口达到 N' },
  { kind: 'legion', label: '军团令', needTarget: false, needParam: true, hint: '保有 N 支现役军团' },
  { kind: 'build', label: '建城令', needTarget: false, needParam: true, hint: '房屋达到 N 座' },
  { kind: 'unify', label: '统一令', needTarget: false, needParam: false, hint: '成为世界唯一强权' },
  { kind: 'mobilize', label: '总动员', needTarget: false, needParam: true, hint: '全民皆兵，斩获 N 敌军' },
  { kind: 'alliance', label: '联盟令', needTarget: true, needParam: false, hint: '与目标关系 ≥ 60' },
  { kind: 'temple', label: '信仰令', needTarget: false, needParam: false, hint: '建成一座神殿' },
];

/** 军团状态 → 中文 */
const ARMY_STATE_ZH: Record<string, string> = {
  rally: '集结', march: '行军', battle: '会战', siege: '围城', retreat: '溃退',
};

/** 单位编辑器行 */
function NumField({ label, value, onSet, min, max, step }: { label: string; value: number; onSet: (v: number) => void; min: number; max: number; step?: number }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onSet(Number(e.target.value))}
        className="h-6 w-16 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-right font-mono text-[10px] text-zinc-200 focus:border-amber-500 focus:outline-none"
      />
    </label>
  );
}

function DevBtn({ onClick, tone = 'default', children, disabled }: { onClick: () => void; tone?: 'default' | 'red' | 'green' | 'amber' | 'sky' | 'purple' | 'cyan'; children: React.ReactNode; disabled?: boolean }) {
  const tones: Record<string, string> = {
    default: 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
    red: 'border-red-800 bg-red-950/40 text-red-400 hover:bg-red-900/40',
    green: 'border-emerald-800 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/40',
    amber: 'border-amber-700/60 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20',
    sky: 'border-sky-800/60 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20',
    purple: 'border-purple-800/60 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20',
    cyan: 'border-cyan-700/60 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20',
  };
  return (
    <Button variant="outline" size="sm" disabled={disabled} onClick={onClick} className={`h-7 px-2 text-[10px] font-bold ${tones[tone]}`}>
      {children}
    </Button>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Swords; children: React.ReactNode }) {
  return (
    <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
      <Icon className="h-3 w-3" aria-hidden />
      {children}
    </p>
  );
}

export function DevPanel() {
  const { devMode, showDev, selUnit, toggleDevPanel, select, stats, jumpTo, showNote } = useGameStore();
  const jumpToast = (text: string) => showNote(text, 'good');
  const [tab, setTab] = useState<'civ' | 'dev'>('civ');
  const [info, setInfo] = useState<DevInfo | null>(null);
  const [fps, setFps] = useState(0);
  const [unit, setUnit] = useState<Record<string, unknown> | null>(null);
  const [civA, setCivA] = useState(-1);
  const [civB, setCivB] = useState(-1);
  // 旨意表单
  const [decCiv, setDecCiv] = useState(-1);
  const [decKind, setDecKind] = useState<DirectiveKind>('annihilate');
  const [decParam, setDecParam] = useState(0);
  const [decTarget, setDecTarget] = useState(-1);
  // 军团/生成表单
  const [armyCiv, setArmyCiv] = useState(-1);
  const [armyTarget, setArmyTarget] = useState(-1);
  const [mobYears, setMobYears] = useState(20);
  const [spawnRace, setSpawnRace] = useState(0);
  const [spawnN, setSpawnN] = useState(5);
  // 科技与政体表单
  const [resCiv, setResCiv] = useState(-1);
  const [govCiv, setGovCiv] = useState(-1);
  const [govKind, setGovKind] = useState(0);
  const frameRef = useRef({ last: 0, count: 0, fps: 0 });

  useEffect(() => {
    if (!devMode || !showDev) return;
    const read = () => {
      const eng = getEng();
      if (!eng) return;
      setInfo(eng.devStats());
      // FPS：按引擎 frameCount 差分
      const fr = frameRef.current;
      const now = performance.now();
      if (fr.last > 0 && now > fr.last) {
        const inst = ((eng.frameCount - fr.count) * 1000) / (now - fr.last);
        fr.fps = fr.fps * 0.8 + inst * 0.2;
      }
      fr.count = eng.frameCount;
      fr.last = now;
      setFps(Math.round(fr.fps));
      if (selUnit != null) setUnit(eng.getUnitInfo(selUnit));
      else setUnit(null);
    };
    const first = window.setTimeout(read, 0);
    const timer = window.setInterval(read, 600);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [devMode, showDev, selUnit]);

  if (!devMode || !showDev) return null;

  const eng = getEng();
  const u = unit as unknown as {
    id: number; name: string; hp: number; maxHp: number; dmg: number; speed: number; kills: number;
    job?: number; trait?: string | null; raceName?: string; race: number;
  } | null;
  const raceKeys = Object.entries(RACES).filter(([, d]) => d.isCiv);
  const civs = stats?.civs ?? [];
  const armies = stats?.armies ?? [];
  const directives = stats?.directives ?? [];
  /** 终极世界大战快照（引擎 statsTick 同步） */
  const ww = stats?.worldWar ?? null;
  const decMeta = DECREE_KINDS.find((d) => d.kind === decKind);

  // 面板内容（桌面/移动双分支共用，不复制两份）
  const body = (
    <>
      <InlineNote />
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
          <Terminal className="h-3.5 w-3.5" aria-hidden />
          开发者模式
          <span className="rounded-sm bg-amber-500/15 px-1 text-[9px] text-amber-300">41 功能</span>
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleDevPanel}
          aria-label="关闭开发者面板"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-200"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      {/* 双层切换：文明级 / 开发级 */}
      <div className="mb-2 grid grid-cols-2 gap-1">
        <Button
          size="sm"
          onClick={() => setTab('civ')}
          className={`h-7 border text-[10px] font-bold ${tab === 'civ' ? 'border-purple-500 bg-purple-500/15 text-purple-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
        >
          <Crown className="mr-1 h-3 w-3" aria-hidden />
          文明级
        </Button>
        <Button
          size="sm"
          onClick={() => setTab('dev')}
          className={`h-7 border text-[10px] font-bold ${tab === 'dev' ? 'border-amber-500 bg-amber-500/15 text-amber-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
        >
          <Zap className="mr-1 h-3 w-3" aria-hidden />
          开发级
        </Button>
      </div>

      <div className="flex max-h-[calc(100dvh-330px)] flex-col gap-2 overflow-y-auto pr-0.5 sm:max-h-[calc(100dvh-170px)]" style={{ scrollbarWidth: 'thin' }}>
        {tab === 'civ' ? (
          <>
            {/* —— 王国控制台（文明级） —— */}
            <section className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2">
              <SectionTitle icon={Landmark}>王国控制台</SectionTitle>
              {civs.length < 2 ? (
                <p className="text-[10px] text-zinc-500">至少需要两个王国</p>
              ) : (
                <div className="grid gap-1">
                  <div className="flex gap-1">
                    <select
                      value={civA}
                      onChange={(e) => setCivA(Number(e.target.value))}
                      aria-label="王国 A"
                      className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      <option value={-1}>王国 A…</option>
                      {civs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select
                      value={civB}
                      onChange={(e) => setCivB(Number(e.target.value))}
                      aria-label="王国 B"
                      className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      <option value={-1}>王国 B…</option>
                      {civs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <DevBtn tone="red" disabled={civA < 0 || civB < 0} onClick={() => eng?.devForceWar(civA, civB)}>宣战</DevBtn>
                    <DevBtn tone="red" disabled={civA < 0 || civB < 0} onClick={() => eng?.devTotalWar(civA, civB)}>灭国战争</DevBtn>
                    <DevBtn tone="green" disabled={civA < 0 || civB < 0} onClick={() => eng?.devForcePeace(civA, civB)}>停战</DevBtn>
                    <DevBtn tone="amber" disabled={civA < 0 || civB < 0} onClick={() => eng?.devAnnexCiv(civA, civB)}>吞并</DevBtn>
                    <DevBtn disabled={civB < 0} onClick={() => eng?.devKillCiv(civB)}>灭国 B</DevBtn>
                    <DevBtn tone="amber" disabled={civB < 0} onClick={() => eng?.devAddGold(civB, 100)}>B +100 金</DevBtn>
                    <DevBtn tone="sky" disabled={civB < 0} onClick={() => eng?.devAddKnowledge(civB, 100)}>B +100 学</DevBtn>
                    <DevBtn tone="sky" onClick={() => eng?.devPeaceAll()}>世界和平</DevBtn>
                    <DevBtn tone="red" onClick={() => eng?.devWorldWar()}>世界大战</DevBtn>
                  </div>
                </div>
              )}
            </section>

            {/* —— 科技与政体（文明级：科技研发/社会体系干预） —— */}
            <section className="rounded-sm border border-emerald-900/60 bg-zinc-900/70 p-2">
              <SectionTitle icon={Sparkles}>科技与政体</SectionTitle>
              {civs.length < 1 ? (
                <p className="text-[10px] text-zinc-500">需要至少一个王国</p>
              ) : (
                <div className="grid gap-1">
                  <div className="flex gap-1">
                    <select
                      value={resCiv}
                      onChange={(e) => setResCiv(Number(e.target.value))}
                      aria-label="科研王国"
                      className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      <option value={-1}>科研王国…</option>
                      {civs.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.techCount} 项）</option>)}
                    </select>
                    <DevBtn
                      tone="green"
                      disabled={resCiv < 0}
                      onClick={() => { const k = eng?.devResearch(resCiv); if (k) jumpToast(`科技突破：${k}`); }}
                    >
                      立即完成研究
                    </DevBtn>
                  </div>
                  <div className="flex gap-1">
                    <select
                      value={govCiv}
                      onChange={(e) => setGovCiv(Number(e.target.value))}
                      aria-label="政体王国"
                      className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      <option value={-1}>政体王国…</option>
                      {civs.map((c) => <option key={c.id} value={c.id}>{c.name}（{c.govName}）</option>)}
                    </select>
                    <select
                      value={govKind}
                      onChange={(e) => setGovKind(Number(e.target.value))}
                      aria-label="政体类型"
                      className="h-6 w-24 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      {GOV_DEVS.map((g, i) => <option key={g.key} value={i}>{g.name}</option>)}
                    </select>
                    <DevBtn
                      tone="purple"
                      disabled={govCiv < 0}
                      onClick={() => { if (eng?.devSetGov(govCiv, govKind)) jumpToast('政体已变革'); }}
                    >
                      变革
                    </DevBtn>
                  </div>
                  <p className="text-[9px] leading-tight text-zinc-500">
                    国民灭火 {info?.firesOut ?? 0} 次 · 修复 {info?.repairsDone ?? 0} 次 · 受损建筑 {info?.damaged ?? 0} · 世界累计科技 {info?.techsKnown ?? 0} 项（{info?.researching ?? 0} 国在研）
                  </p>
                </div>
              )}
            </section>

            {/* —— 文明旨意（文明级核心：文明自行达成，可能失败） —— */}
            <section className="rounded-sm border border-purple-900/60 bg-zinc-900/70 p-2">
              <SectionTitle icon={Scroll}>文明旨意（自行达成 · 可能失败）</SectionTitle>
              {civs.length < 1 ? (
                <p className="text-[10px] text-zinc-500">需要至少一个王国</p>
              ) : (
                <div className="grid gap-1">
                  <div className="flex gap-1">
                    <select
                      value={decCiv}
                      onChange={(e) => setDecCiv(Number(e.target.value))}
                      aria-label="旨意王国"
                      className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      <option value={-1}>王国…</option>
                      {civs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select
                      value={decKind}
                      onChange={(e) => setDecKind(e.target.value as DirectiveKind)}
                      aria-label="旨意类型"
                      className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      {DECREE_KINDS.map((d) => <option key={d.kind} value={d.kind}>{d.label}</option>)}
                    </select>
                  </div>
                  {decMeta?.needTarget && (
                    <select
                      value={decTarget}
                      onChange={(e) => setDecTarget(Number(e.target.value))}
                      aria-label="旨意目标王国"
                      className="h-6 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      <option value={-1}>目标王国…</option>
                      {civs.filter((c) => c.id !== decCiv).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {decMeta?.needParam && (
                    <NumField label="目标值" value={decParam} min={1} max={9999} onSet={setDecParam} />
                  )}
                  {decMeta && (
                    <p className="text-[9px] leading-tight text-zinc-500">{decMeta.hint}（文明将倾力自行达成）</p>
                  )}
                  <DevBtn
                    tone="purple"
                    disabled={decCiv < 0 || (decMeta?.needTarget && decTarget < 0)}
                    onClick={() => eng?.devDecree(decCiv, decKind, decParam, decMeta?.needTarget ? decTarget : undefined)}
                  >
                    <ScrollText className="mr-1 h-3 w-3" aria-hidden />
                    颁布旨意
                  </DevBtn>
                  {/* 现行旨意列表 */}
                  {directives.length > 0 && (
                    <div className="mt-1 grid gap-1">
                      {directives.map((d) => (
                        <div key={d.id} className={`rounded-sm border px-1.5 py-1 ${d.status === 'active' ? 'border-purple-900/60 bg-purple-500/5' : d.status === 'success' ? 'border-emerald-900/60 bg-emerald-500/5' : 'border-rose-900/60 bg-rose-500/5'}`}>
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate text-[9px] font-bold text-zinc-300">
                              {d.status === 'active' && <Scroll className="mr-0.5 inline h-2.5 w-2.5 text-purple-400" aria-hidden />}
                              {d.status === 'success' && <BadgeCheck className="mr-0.5 inline h-2.5 w-2.5 text-emerald-400" aria-hidden />}
                              {d.status === 'failed' && <BadgeX className="mr-0.5 inline h-2.5 w-2.5 text-rose-400" aria-hidden />}
                              {d.civName}
                            </p>
                            {d.status === 'active' && (
                              <button
                                onClick={() => eng?.devRevokeDecree(d.id)}
                                className="shrink-0 text-[9px] text-zinc-500 hover:text-zinc-200"
                                aria-label="撤销旨意"
                              >
                                <Ban className="h-2.5 w-2.5" aria-hidden />
                              </button>
                            )}
                          </div>
                          <p className="truncate text-[9px] leading-tight text-zinc-500" title={d.text}>{d.text}</p>
                          {d.status === 'active' && (
                            <div className="mt-0.5 flex items-center gap-1">
                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                                <div
                                  className={`h-full ${d.progress > 0.6 ? 'bg-emerald-500' : d.progress > 0.3 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                  style={{ width: `${Math.min(100, Math.round(d.progress * 100))}%` }}
                                />
                              </div>
                              <span className="w-16 shrink-0 text-right font-mono text-[9px] text-zinc-500">
                                {d.deadlineYear > 0 ? `${d.deadlineYear} 年限` : '无限期'}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* —— 军团控制台 —— */}
            <section className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2">
              <SectionTitle icon={Flag}>军团方阵</SectionTitle>
              <div className="grid gap-1">
                <div className="flex gap-1">
                  <select
                    value={armyCiv}
                    onChange={(e) => setArmyCiv(Number(e.target.value))}
                    aria-label="军团王国"
                    className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                  >
                    <option value={-1}>王国…</option>
                    {civs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select
                    value={armyTarget}
                    onChange={(e) => setArmyTarget(Number(e.target.value))}
                    aria-label="进军目标"
                    className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                  >
                    <option value={-1}>目标（可选）…</option>
                    {civs.filter((c) => c.id !== armyCiv).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-1">
                  <DevBtn tone="amber" disabled={armyCiv < 0} onClick={() => eng?.devFormArmy(armyCiv, armyTarget >= 0 ? armyTarget : undefined)}>组建军团</DevBtn>
                  <DevBtn tone="red" onClick={() => eng?.devWorldWar()}>全球开战+建团</DevBtn>
                </div>
                {/* 现役军团列表 */}
                {armies.length > 0 ? (
                  <div className="mt-1 grid max-h-32 gap-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                    {armies.map((a) => (
                      <div key={a.id} className="rounded-sm border border-zinc-800 bg-zinc-900 px-1.5 py-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="truncate text-[9px] font-bold text-zinc-300">
                            <Flag className="mr-0.5 inline h-2.5 w-2.5 text-amber-400" aria-hidden />
                            {a.name}
                            <span className="ml-1 font-normal text-zinc-500">{a.size}/{a.size0}人</span>
                          </p>
                          <span className={`shrink-0 rounded-sm px-1 text-[8px] font-bold ${a.state === 'battle' ? 'bg-red-500/20 text-red-300' : a.state === 'retreat' ? 'bg-zinc-700 text-zinc-400' : a.state === 'siege' ? 'bg-orange-500/20 text-orange-300' : 'bg-sky-500/20 text-sky-300'}`}>
                            {ARMY_STATE_ZH[a.state] ?? a.state}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={`h-full ${a.morale > 50 ? 'bg-emerald-500' : a.morale > 35 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${Math.min(100, a.morale)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[8px] text-zinc-500">士气{a.morale} 斩{a.kills}</span>
                        </div>
                        <div className="mt-0.5 flex gap-1">
                          <button onClick={() => eng?.devSetMorale(a.id, 100)} className="rounded-sm border border-emerald-800/60 bg-emerald-500/10 px-1 text-[8px] font-bold text-emerald-400 hover:bg-emerald-500/20">满士气</button>
                          <button onClick={() => eng?.devForceRout(a.id)} className="rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[8px] font-bold text-zinc-400 hover:bg-zinc-700">强制溃退</button>
                          <button onClick={() => eng?.devDisbandArmy(a.id)} className="rounded-sm border border-rose-800/60 bg-rose-500/10 px-1 text-[8px] font-bold text-rose-400 hover:bg-rose-500/20">解散</button>
                          <button
                            onClick={() => jumpTo(a.x, a.y)}
                            className="rounded-sm border border-sky-800/60 bg-sky-500/10 px-1 text-[8px] font-bold text-sky-300 hover:bg-sky-500/20"
                            aria-label="跳转到军团"
                          >
                            <Crosshair className="h-2.5 w-2.5" aria-hidden />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[9px] text-zinc-600">暂无现役军团（战时自动组建）</p>
                )}
              </div>
            </section>

            {/* —— 总动员 —— */}
            <section className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2">
              <SectionTitle icon={Users}>总动员</SectionTitle>
              <div className="grid gap-1">
                <div className="flex items-center gap-1">
                  <select
                    value={decCiv}
                    onChange={(e) => setDecCiv(Number(e.target.value))}
                    aria-label="动员王国"
                    className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                  >
                    <option value={-1}>王国…</option>
                    {civs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <NumField label="年限" value={mobYears} min={1} max={99} onSet={setMobYears} />
                </div>
                <div className="flex gap-1">
                  <DevBtn tone="red" disabled={decCiv < 0} onClick={() => eng?.devMobilize(decCiv, mobYears)}>全民皆兵</DevBtn>
                  <DevBtn tone="green" disabled={decCiv < 0} onClick={() => eng?.devDemobilize(decCiv)}>解甲归田</DevBtn>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            {/* —— 终极世界大战（开发级核心：不死不休的死战模式） —— */}
            <section className="rounded-sm border border-red-900/70 bg-zinc-900/70 p-2">
              <SectionTitle icon={Radiation}>终极世界大战</SectionTitle>
              {ww ? (
                <div className="mb-1.5 rounded-sm border border-red-900/60 bg-red-950/20 p-1.5">
                  {ww.phase === 'running' ? (
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <p className="flex items-center gap-1 text-[10px] font-bold text-red-300">
                          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
                          战火燃烧 · 第 {ww.years} 年
                        </p>
                        <span className="font-mono text-[9px] text-zinc-500">{ww.alive}/{ww.belligerents} 国</span>
                      </div>
                      {ww.frenzy && (
                        <p className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-amber-300">
                          <Zap className="h-2.5 w-2.5 animate-pulse" aria-hidden />
                          终局狂热——仅存三强倾尽武库，反物质已解禁
                        </p>
                      )}
                      <div className="mt-1 grid grid-cols-3 gap-x-2 font-mono text-[9px] text-zinc-400">
                        <span>阵亡 <b className="text-red-300">{ww.kills}</b></span>
                        <span>停战 <b className="text-amber-300">{ww.truces}</b></span>
                        <span>核爆 <b className="text-yellow-300">{ww.nukes}</b></span>
                      </div>
                      {(ww.lasers > 0 || ww.drones > 0 || ww.orbitals > 0 || ww.plasmas > 0 || ww.antimatters > 0) && (
                        <div className="mt-0.5 grid grid-cols-3 gap-x-2 font-mono text-[9px] text-zinc-400">
                          <span>激光 <b className="text-cyan-300">{ww.lasers}</b></span>
                          <span>蜂群 <b className="text-teal-300">{ww.drones}</b></span>
                          <span>轨道 <b className="text-sky-300">{ww.orbitals}</b></span>
                          <span>等离子 <b className="text-emerald-300">{ww.plasmas}</b></span>
                          <span>湮灭 <b className="text-fuchsia-300">{ww.antimatters}</b></span>
                          <span>未来国 <b className="text-cyan-200">{ww.futureCivs}</b></span>
                        </div>
                      )}
                      {ww.emergent > 0 && (
                        <div className="mt-0.5 grid grid-cols-3 gap-x-2 font-mono text-[9px] text-zinc-400">
                          <span className="col-span-3">涌现武器发射 <b className="text-fuchsia-300">{ww.emergent}</b>（非预设程序化铸造）</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold text-emerald-300">已终战 · 持续 {ww.years} 年</p>
                      <p className="text-[9px] leading-tight text-zinc-500">{ww.winnerName ? `胜者「${ww.winnerName}」` : '无胜者'} · {ww.endText}</p>
                    </>
                  )}
                  {ww.fallen.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ww.fallen.map((f) => (
                        <span
                          key={f.name}
                          className="rounded-sm border border-zinc-800 bg-zinc-900 px-1 text-[8px] leading-4 line-through"
                          style={{ color: f.colorHex }}
                          title={`${f.name} 已退出大战`}
                        >
                          {f.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mb-1.5 text-[9px] leading-tight text-zinc-500">
                  全部在世国家互宣死战——直到只剩一国或全部灭亡才终战；中途可暂时停战（到期战端自动重燃）。现代军备国将倾泻火炮/空袭/核弹。
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                <DevBtn
                  tone="red"
                  disabled={civs.length < 2 || ww?.phase === 'running'}
                  onClick={() => { if (eng?.devUltimateWar()) jumpToast('终极世界大战爆发：不死不休'); }}
                >
                  <Radiation className="mr-1 h-3 w-3" aria-hidden />
                  引燃终极世界大战
                </DevBtn>
                {ww?.phase === 'running' && (
                  <>
                    <DevBtn tone="green" onClick={() => { eng?.devWwTruce(12); }}>全球停战 12 年</DevBtn>
                    <DevBtn tone="amber" onClick={() => { eng?.devWwResume(); }}>重启战端</DevBtn>
                    <DevBtn onClick={() => { eng?.devWwEnd(); }}>神谕终止</DevBtn>
                  </>
                )}
              </div>
            </section>

            {/* —— 现代武器（工业时代军备） —— */}
            <section className="rounded-sm border border-orange-900/60 bg-zinc-900/70 p-2">
              <SectionTitle icon={Rocket}>现代武器</SectionTitle>
              <p className="mb-1.5 text-[9px] leading-tight text-zinc-500">
                工业时代科技（火药→原子能）将军备推入火器/现代级：<Plane className="inline h-2.5 w-2.5 text-orange-300" aria-hidden /> 步枪齐射 · <Bomb className="inline h-2.5 w-2.5 text-orange-300" aria-hidden /> 火炮轰击 · 空袭轰炸 · 核导弹——战时自动运用。
              </p>
              <div className="flex flex-wrap gap-1">
                <DevBtn
                  tone="amber"
                  disabled={civs.length < 1}
                  onClick={() => { const n = eng?.devModernize() ?? 0; if (n > 0) jumpToast(`工业革命降临：${n} 项现代科技`); }}
                >
                  <Rocket className="mr-1 h-3 w-3" aria-hidden />
                  全文明工业革命
                </DevBtn>
              </div>
              {civs.length > 0 && (
                <div className="mt-1.5 grid max-h-24 gap-0.5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                  {civs.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-1 text-[9px]">
                      <span className="truncate" style={{ color: c.colorHex }}>{c.name}</span>
                      <span className={`shrink-0 font-mono ${c.armament >= 6 ? 'text-cyan-300' : c.armament >= 5 ? 'text-orange-300' : c.armament >= 4 ? 'text-yellow-300' : 'text-zinc-500'}`}>
                        {c.armamentName}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* —— 未来武器（未来时代军备：定向能/蜂群/轨道/机甲/等离子/反物质） —— */}
            <section className="rounded-sm border border-cyan-900/60 bg-zinc-900/70 p-2">
              <SectionTitle icon={Orbit}>未来武器</SectionTitle>
              <p className="mb-1.5 text-[9px] leading-tight text-zinc-500">
                未来时代科技（电子计算→反物质）将军备推入未来级：<Zap className="inline h-2.5 w-2.5 text-cyan-300" aria-hidden /> 激光炮台 · 无人机蜂群 · <Orbit className="inline h-2.5 w-2.5 text-cyan-300" aria-hidden /> 轨道天罚 · <Cpu className="inline h-2.5 w-2.5 text-cyan-300" aria-hidden /> 机甲军团 · 等离子炮 · 反物质湮灭（终局狂热解禁）。战术 AI 让军团会评估会战、合围、驰援与战术撤退。
              </p>
              <div className="flex flex-wrap gap-1">
                <DevBtn
                  tone="cyan"
                  disabled={civs.length < 1}
                  onClick={() => { const n = eng?.devTranscend() ?? 0; if (n > 0) jumpToast(`未来革命降临：${n} 项未来科技`); }}
                >
                  <Orbit className="mr-1 h-3 w-3" aria-hidden />
                  全文明未来革命
                </DevBtn>
              </div>
              <p className="mt-1 text-[8px] leading-tight text-zinc-600">
                组合技：未来革命 + 引燃终极世界大战 = 星际战争级末世景观（终局狂热阶段反物质倾泻）。
              </p>
            </section>

            {/* —— 自然引擎（板块/四季/大气/风暴天灾：开发者驱动） —— */}
            <section className="rounded-sm border border-teal-900/60 bg-zinc-900/70 p-2">
              <SectionTitle icon={MountainSnow}>自然引擎</SectionTitle>
              <p className="mb-1.5 text-[9px] leading-tight text-zinc-500">
                板块构造（{eng?.nature.plates ?? 6} 板块漂移积应力 → 地震/造山/裂谷/火山）· 四季轮转（每季 {2} 年：春催繁衍 冬压火苗 冰缘涨落）· 大气环流（信风/西风带平流湿气 → 迎风雨/雨影荒漠）· 气旋在暖洋孕育随风漂移登陆肆虐，火山灰注入平流层即「无夏之年」。当前：{eng?.nature.seasonName ?? '夏'}季 / 地震{eng?.nature.counters.quakes ?? 0} 次 / 喷发{eng?.nature.counters.eruptions ?? 0} 次 / 气旋{eng?.nature.counters.cyclones ?? 0} 个。
              </p>
              <div className="flex flex-wrap gap-1">
                <DevBtn tone="red" onClick={() => { if (eng?.devQuake()) jumpToast('板块应力强制释放：强震来袭（可能掀海啸）'); }}>
                  <Zap className="mr-1 h-3 w-3" aria-hidden />
                  强制地震
                </DevBtn>
                <DevBtn tone="red" onClick={() => { if (eng?.devVolcano()) jumpToast('火山热点大喷发：火山灰注入平流层（无夏之年将至）'); }}>
                  <Flame2 className="mr-1 h-3 w-3" aria-hidden />
                  强制喷发
                </DevBtn>
                <DevBtn tone="cyan" onClick={() => { if (eng?.devCyclone()) jumpToast('强气旋在镜头附近的暖洋上瞬息成形'); }}>
                  <Tornado className="mr-1 h-3 w-3" aria-hidden />
                  生成气旋
                </DevBtn>
                <DevBtn onClick={() => { const s = eng?.devNextSeason() ?? 1; jumpToast(`季节快进：现在是「${['春', '夏', '秋', '冬'][s]}季`); }}>
                  <Leaf className="mr-1 h-3 w-3" aria-hidden />
                  下一季
                </DevBtn>
              </div>
              <p className="mt-1 text-[8px] leading-tight text-zinc-600">
                顶栏「山岳」按钮打开自然引擎面板：板块图/风场图/风暴追踪/地质纪事全览。
              </p>
            </section>

            {/* —— 涌现纪事（Emergence Layer：突破预设的不可预测发展） —— */}
            <section className="rounded-sm border border-fuchsia-900/60 bg-zinc-900/70 p-2">
              <SectionTitle icon={FlaskConical}>涌现纪事</SectionTitle>
              <p className="mb-1.5 text-[9px] leading-tight text-zinc-500">
                武器架构 v2：每件武器 = 装药×投送×制导×供能 四槽组件拼装（7×5×5×5 = 875 种架构×品质向量）。军备学说由实战漂移（精确/饱和/恐吓/消耗四流派分流），敌国防御（点防/装甲/疏散）随挨打演化，下一代武器对抗性选型 —— 攻防螺旋带记忆。生物棘轮 ≥ 32% 漂移即<Dna className="inline h-2.5 w-2.5 text-lime-300" aria-hidden /> 种化新物种。
              </p>
              <div className="flex flex-wrap gap-1">
                <DevBtn
                  tone="red"
                  onClick={() => { eng?.emergentForgeTick(); jumpToast('涌现锻造：交战国铸造/迭代/仿制一波武器'); }}
                >
                  <FlaskConical className="mr-1 h-3 w-3" aria-hidden />
                  驱动涌现锻造
                </DevBtn>
                <DevBtn
                  onClick={() => { eng?.evolutionTick(); jumpToast('进化评估：棘轮/阈值特质/种化检查一次'); }}
                >
                  <Dna className="mr-1 h-3 w-3" aria-hidden />
                  驱动进化评估
                </DevBtn>
              </div>
              {eng && eng.emergentWeapons.size > 0 && (
                <div className="mt-1.5 grid max-h-32 gap-0.5 overflow-y-auto" style={{ scrollbarWidth: 'thin' }} aria-label="涌现武器谱系">
                  {[...eng.emergentWeapons.values()].sort((a, b) => b.kills - a.kills).slice(0, 10).map((w) => {
                    const arch = w.pl != null ? `${WC_PAYLOAD_NAME[w.pl] ?? '?'}·${WC_DELIVERY_NAME[w.dl ?? 0] ?? '?'}·${WC_GUIDE_NAME[w.gd ?? 1] ?? '?'}·${WC_POWER_NAME[w.pw ?? 0] ?? '?'}` : null;
                    return (
                      <div key={w.id} className="text-[9px]">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-zinc-300">
                            {w.retired ? <s className="text-zinc-600">{w.name}</s> : w.name}
                            {w.wonder && <b className="ml-0.5 text-yellow-300">★</b>}
                            {w.gen > 1 && <span className="ml-0.5 text-zinc-500">G{w.gen}</span>}
                          </span>
                          <span className="shrink-0 font-mono text-zinc-500">
                            {eng.civs[w.civ]?.name ?? '?'} · 威{Math.round(w.dmg)} · {w.fired}射/{w.kills}杀{w.inter ? `/${w.inter}拦` : ''}
                          </span>
                        </div>
                        {arch && !w.retired && <p className="truncate pl-1 text-[8px] text-fuchsia-400/70">{arch}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 军备学说 + 防御套件（武器架构 v2：攻防螺旋实时状态） */}
              {eng && civs.length > 0 && eng.emergentWeapons.size > 0 && (
                <div className="mt-1.5 grid gap-0.5" aria-label="军备学说与防御">
                  {civs.slice(0, 6).map((c) => {
                    const doc = eng.doctrineOf(c.id);
                    const def = eng.defenseOf(c.id);
                    const dominant = doc.terror > doc.saturation && doc.terror > doc.precision && doc.terror > doc.attrition ? '恐吓' : doc.saturation > doc.precision && doc.saturation > doc.attrition ? '饱和' : doc.precision > doc.attrition ? '精确' : '消耗';
                    return (
                      <div key={c.id} className="flex items-center gap-1.5 text-[8px] leading-4">
                        <span className="w-16 shrink-0 truncate text-zinc-400">{c.name}</span>
                        <span className="shrink-0 border border-fuchsia-800/60 bg-fuchsia-900/20 px-1 font-bold text-fuchsia-300">{dominant}</span>
                        <span className="flex min-w-0 flex-1 items-center gap-1 font-mono text-zinc-500">
                          <span title="点防">防{Math.round(def.point)}</span>
                          <span title="装甲">甲{Math.round(def.armor)}</span>
                          <span title="疏散诱饵">散{Math.round(def.evade)}</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {eng && eng.dynRaces.size > 0 && (
                <div className="mt-1 flex flex-wrap gap-1" aria-label="动态物种">
                  {[...eng.dynRaces.entries()].map(([id, info]) => {
                    const name = (RACES as Record<number, { name: string }>)[id]?.name ?? `物种${id}`;
                    const n = eng.units.reduce((m, u) => m + (u.dead || u.race !== id ? 0 : 1), 0);
                    return (
                      <span key={id} className="rounded-sm border border-lime-800/60 bg-lime-900/20 px-1 text-[8px] leading-4 text-lime-300" title={`源自 ${(RACES as Record<number, { name: string }>)[info.parent]?.name ?? '?'} · 现存 ${n} 头`}>
                        <Dna className="mr-0.5 inline h-2 w-2" aria-hidden />
                        {name} · {n}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>

            {/* —— 性能统计 —— */}
            <section className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2">
              <SectionTitle icon={Gauge}>性能 · 世界</SectionTitle>
              {info ? (
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[10px] text-zinc-400">
                  <span>FPS <b className={fps < 30 ? 'text-red-400' : 'text-emerald-400'}>{fps}</b></span>
                  <span>tick <b className="text-zinc-200">{info.tickMs}ms</b></span>
                  <span>单位 <b className="text-zinc-200">{info.units}</b></span>
                  <span>建筑 <b className="text-zinc-200">{info.buildings}</b></span>
                  <span>特效 <b className="text-zinc-200">{info.effects}</b></span>
                  <span>王国 <b className="text-zinc-200">{info.civs}</b></span>
                  <span>军团 <b className="text-amber-300">{info.armies}</b></span>
                  <span>旨意 <b className="text-purple-300">{info.directives}</b></span>
                  <span>战争 <b className={info.totalWars > 0 ? 'text-red-400' : 'text-zinc-200'}>{info.wars}</b></span>
                  <span>火情 <b className="text-zinc-200">{info.fires}</b></span>
                  <span>灭火 <b className="text-sky-300">{info.firesOut ?? 0}</b></span>
                  <span>修复 <b className="text-orange-300">{info.repairsDone ?? 0}</b></span>
                  <span>受损 <b className="text-zinc-200">{info.damaged ?? 0}</b></span>
                  <span>涌现武器 <b className="text-fuchsia-300">{info.emergentWeapons ?? 0}</b>（杀敌 {info.emergentKills ?? 0}）</span>
                  <span>动态物种 <b className="text-lime-300">{info.dynSpecies ?? 0}</b></span>
                  <span>科技 <b className="text-emerald-300">{info.techsKnown ?? 0}</b>（{info.researching ?? 0} 在研）</span>
                  <span>物品 <b className="text-zinc-200">{info.items}</b></span>
                  <span>触发器 <b className="text-zinc-200">{info.triggers}</b></span>
                  <span className="col-span-2">tick #{info.tick} · 年 {info.year} · seed {info.seed}</span>
                </div>
              ) : (
                <p className="text-[10px] text-zinc-500">引擎加载中…</p>
              )}
            </section>

            {/* —— 单位编辑器 + 单位工具 —— */}
            {u && (
              <section className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2">
                <SectionTitle icon={UserCog}>单位编辑 · {u.name}</SectionTitle>
                <div className="grid gap-1">
                  <NumField label="生命" value={Math.round(u.hp)} min={1} max={99999} onSet={(v) => eng?.devSetUnit(u.id, { hp: v })} />
                  <NumField label="生命上限" value={Math.round(u.maxHp)} min={1} max={99999} onSet={(v) => eng?.devSetUnit(u.id, { maxHp: v })} />
                  <NumField label="伤害" value={Math.round(u.dmg)} min={0} max={9999} onSet={(v) => eng?.devSetUnit(u.id, { dmg: v })} />
                  <NumField label="速度" value={Number(u.speed.toFixed(3))} min={0.01} max={1} step={0.01} onSet={(v) => eng?.devSetUnit(u.id, { speed: v })} />
                  <NumField label="击杀" value={u.kills} min={0} max={9999} onSet={(v) => eng?.devSetUnit(u.id, { kills: v })} />
                  <label className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                    <span>职业</span>
                    <select
                      value={u.job ?? 0}
                      onChange={(e) => eng?.devSetUnit(u.id, { job: Number(e.target.value) })}
                      className="h-6 w-20 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      {JOBS.map((j, i) => (
                        <option key={j.key} value={i}>{j.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                    <span>特质</span>
                    <select
                      value={u.trait ?? ''}
                      onChange={(e) => eng?.devSetUnit(u.id, { trait: e.target.value || null })}
                      className="h-6 w-20 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                    >
                      <option value="">无</option>
                      {Object.entries(TRAITS).map(([k, t]) => (
                        <option key={k} value={k}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <DevBtn tone="green" onClick={() => eng?.devHealUnit(u.id)}><Heart className="mr-1 h-3 w-3" aria-hidden />治愈</DevBtn>
                    <DevBtn tone="sky" onClick={() => eng?.devTeleportUnit(u.id, eng?.cam.x ?? 0, eng?.cam.y ?? 0)}><Crosshair className="mr-1 h-3 w-3" aria-hidden />传送至镜头</DevBtn>
                    <DevBtn tone="amber" onClick={() => eng?.devEquipUnit(u.id)}><Package className="mr-1 h-3 w-3" aria-hidden />神装</DevBtn>
                    <DevBtn tone="red" onClick={() => eng?.devKillUnit(u.id)}>击杀</DevBtn>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <DevBtn
                      tone="amber"
                      onClick={() => {
                        if (!eng) return;
                        const iu = eng.devSpawnChampion(u.race, u.job ?? 2);
                        if (iu) select(iu.id, null);
                      }}
                    >
                      <Sparkles className="mr-1 h-3 w-3" aria-hidden />
                      神装分身
                    </DevBtn>
                  </div>
                </div>
              </section>
            )}

            {/* —— 冠军与种族生成 —— */}
            <section className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2">
              <SectionTitle icon={Swords}>生成（镜头中心）</SectionTitle>
              <div className="flex flex-wrap gap-1">
                {raceKeys.slice(0, 4).map(([rid, d]) => (
                  <DevBtn
                    key={rid}
                    onClick={() => {
                      const iu = eng?.devSpawnChampion(Number(rid), 2);
                      if (iu) select(iu.id, null);
                    }}
                  >
                    <PixelIcon icon={d.key} size={12} />
                    {d.name}战士
                  </DevBtn>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <select
                  value={spawnRace}
                  onChange={(e) => setSpawnRace(Number(e.target.value))}
                  aria-label="生成种族"
                  className="h-6 flex-1 rounded-sm border border-zinc-700 bg-zinc-800 px-1 text-[10px] text-zinc-200"
                >
                  {Object.entries(RACES).map(([rid, d]) => <option key={rid} value={Number(rid)}>{d.name}</option>)}
                </select>
                <NumField label="数量" value={spawnN} min={1} max={30} onSet={setSpawnN} />
                <DevBtn onClick={() => eng?.devSpawnRace(spawnRace, spawnN)}>生成</DevBtn>
              </div>
            </section>

            {/* —— 世界工具 —— */}
            <section className="rounded-sm border border-zinc-800 bg-zinc-900/70 p-2">
              <SectionTitle icon={Globe2}>世界工具</SectionTitle>
              <div className="flex flex-wrap gap-1">
                <DevBtn onClick={() => eng?.devClearFires()}>灭火清辐射</DevBtn>
                <DevBtn tone="sky" onClick={() => eng?.devRenewBuildings()}><Wrench className="mr-1 h-3 w-3" aria-hidden />修复全建筑</DevBtn>
                <DevBtn onClick={() => eng?.devJumpYears(10)}>+10 年</DevBtn>
                <DevBtn onClick={() => eng?.devJumpYears(1)}>+1 年</DevBtn>
                <DevBtn tone="red" onClick={() => eng?.devRainFire(8)}><Flame className="mr-1 h-3 w-3" aria-hidden />火雨 ×8</DevBtn>
                <DevBtn tone="amber" onClick={() => eng?.devCullHalf()}><Scissors className="mr-1 h-3 w-3" aria-hidden />减半众生</DevBtn>
                <DevBtn onClick={() => eng?.devClearDecals()}>清血迹尸骸</DevBtn>
                <DevBtn tone="red" onClick={() => eng?.devClearUnits()}>
                  <Eraser className="mr-1 h-3 w-3" aria-hidden />
                  抹灭众生
                </DevBtn>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* 桌面分支 —— SideDock 面板舱（几何/玻璃壳由坞负责，保留 amber 开发者风格） */}
      {showDev && (
        <div className="su-dock-panel w-72 flex-col overflow-y-auto game-scroll border-2 border-amber-600/70 bg-zinc-950/95 p-2.5">
          {body}
        </div>
      )}
      {/* 移动端分支 —— 无 Sheet 特例：原 max-sm: 几何转普通类，顶栏下缘对齐 top-60 */}
      <div className="pointer-events-auto absolute left-2 right-2 top-[60px] z-30 max-h-[calc(100dvh-316px)] overflow-y-auto game-scroll border-2 border-amber-600/70 bg-zinc-950/95 p-2.5 su-panel sm:hidden">
        {body}
      </div>
    </>
  );
}
