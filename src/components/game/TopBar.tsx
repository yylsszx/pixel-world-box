'use client';
// ============ Top bar: world stats + speed + save/sound/display controls ============
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { FxPrefs } from '@/lib/game/types';
import { sfx } from '@/lib/game/sfx';
import { GAME_VERSION, CHANGELOG } from '@/lib/game/version';
import { PerfHud } from './PerfHud';
import { HScroll } from './HScroll';
import { SpeedDial, fmtSpeed } from './SpeedDial';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Pause, Play, FastForward, ChevronsRight, Check, Undo2, Redo, Biohazard, Gauge, RefreshCw, CircleHelp, Map as MapIcon, Clock, Users, Swords, Flame, Save, FolderOpen, Volume2, VolumeX, Crown, ScrollText, Sailboat, SlidersHorizontal, Hash, Zap, Waves, Sparkles, Layers, Snowflake, Thermometer, Droplets, Flag, TreePine, Scale, Baby, TrendingUp, Ghost, Swords as SwordsIcon, Skull as SkullIcon, Rocket, Terminal, Bone, Heart, Leaf, Camera, Trophy, MountainSnow, CloudRain, Sun, CloudSnow, Flower2, Tornado, GitBranch, Handshake, UsersRound, BrainCircuit, Network, Activity, ImageDown, Music, Gamepad2, History, ChevronDown, House, BookOpen, Orbit, Search, LayoutGrid, Gavel } from 'lucide-react';
import type { OverlayMode, WorldLaws } from '@/lib/game/types';
import { RACES } from '@/lib/game/types';
import { ICONS, RACE_DOT } from '@/lib/game/constants';
import { undo, redo, undoDepth, redoDepth } from '@/lib/ui/undo';
import { PixelIcon } from './PixelIcon';

/** 画面效果设置行：图标 + 名称 + 说明 + 开关 */
function FxPrefRow({
  label,
  desc,
  icon: Icon,
  checked,
  onToggle,
}: {
  label: string;
  desc: string;
  icon: typeof Zap;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 px-2.5 py-2">
      <Icon className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-zinc-200">{label}</p>
        <p className="text-[9px] leading-tight text-zinc-500">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={label} className="data-[state=checked]:bg-amber-500" />
    </div>
  );
}

function FxDensityRow({
  value,
  onChange,
}: {
  value: 0 | 1 | 2;
  onChange: (v: 0 | 1 | 2) => void;
}) {
  const opts: { v: 0 | 1 | 2; label: string; hint: string }[] = [
    { v: 0, label: '精简', hint: '战斗最清爽' },
    { v: 1, label: '标准', hint: '平衡画面与流畅' },
    { v: 2, label: '华丽', hint: '天灾全特效' },
  ];
  return (
    <div className="flex items-center gap-2.5 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 px-2.5 py-2">
      <Sparkles className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-zinc-200">特效密度</p>
        <p className="text-[9px] leading-tight text-zinc-500">同屏特效上限，8x 大战防卡顿</p>
      </div>
      <div className="flex shrink-0 overflow-hidden rounded-sm border-2 border-zinc-600" role="group" aria-label="特效密度">
        {opts.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            title={o.hint}
            className={`px-1.5 py-1 text-[10px] font-bold transition-colors ${
              value === o.v ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** 地图覆盖模式选项定义：图标 + 名称 + 说明（与世界地图的整体视觉风格一致） */
const OVERLAY_OPTS: { id: OverlayMode; label: string; desc: string; icon: typeof Layers; dot?: string }[] = [
  { id: 'none', label: '无', desc: '默认地形视图', icon: MapIcon },
  { id: 'political', label: '政治版图', desc: '王国领土与国界', icon: Flag, dot: 'linear-gradient(135deg,#e05048 50%,#4a90d8 50%)' },
  { id: 'alliance', label: '联盟阵营', desc: '阵营势力范围与盟界', icon: Handshake, dot: 'linear-gradient(135deg,#14b8a6 50%,#52525b 50%)' },
  { id: 'temperature', label: '温度', desc: '寒带 → 热带色带', icon: Thermometer, dot: 'linear-gradient(90deg,#4a7fd6,#7db8e0,#e0c050,#e07830,#d04030)' },
  { id: 'moisture', label: '湿度', desc: '干旱 → 湿润色带', icon: Droplets, dot: 'linear-gradient(90deg,#d6b878,#b0a860,#80a060,#50a090,#3878c0)' },
  { id: 'density', label: '人口密度', desc: '稀疏 → 稠密热力', icon: Users, dot: 'linear-gradient(90deg,#1d4e89,#2e86ab,#7fb069,#f2c14e,#d64530)' },
  { id: 'biome', label: '生物群落', desc: '冰原/苔原/森林/草原/沙漠/雨林', icon: TreePine, dot: 'linear-gradient(135deg,#dce8f2 33%,#a8c56a 33% 66%,#3f9d4f 66%)' },
];

/** 世界法则行：图标 + 名称 + 说明 + 开关（与画面效果行同风格）
 *  key 放宽为 keyof WorldLaws | 'zombieVirus'：僵尸病毒为引擎侧并行新增法则（契约默认开），
 *  引擎落地前后本表均可编译；读取侧对缺失字段按 true 显示（见法则 Popover 的 checked 取值） */
const LAW_DEFS: { key: keyof WorldLaws | 'zombieVirus'; label: string; desc: string; icon: typeof Zap }[] = [
  { key: 'wars', label: '战争', desc: '王国接壤时可以宣战；关闭后新战争被阻止', icon: SwordsIcon },
  { key: 'cityGrowth', label: '城市扩张', desc: '王国领土逐格向外生长', icon: TrendingUp },
  { key: 'reproduction', label: '繁衍', desc: '文明与野生动物生息繁衍', icon: Baby },
  { key: 'banditRaids', label: '强盗袭击', desc: '荒野深处周期性集结强盗团伙', icon: SkullIcon },
  { key: 'dragonSpawns', label: '巨龙降临', desc: '巨龙周期性自然降临世界（每 75 年）', icon: Flame },
  { key: 'zombieInfect', label: '僵尸感染', desc: '被僵尸咬死的生物会变成僵尸', icon: Ghost },
  { key: 'undeadRise', label: '亡者复生', desc: '死者有小概率化作骷髅复生', icon: Ghost },
  { key: 'zombieVirus', label: '僵尸病毒', desc: '瘟疫可能异变为僵尸病毒，感染并在世界迅速蔓延', icon: Biohazard },
  { key: 'rebels', label: '叛乱', desc: '大国度可能爆发分裂独立运动', icon: Rocket },
  // —— 自然引擎法则（板块/大气/四季/天灾） ——
  { key: 'tectonics', label: '板块构造', desc: '板块漂移积累应力：地震/造山/裂谷/火山喷发', icon: MountainSnow },
  { key: 'atmosphere', label: '大气环流', desc: '风场/湿度平流/云雨与气旋孕育', icon: Waves },
  { key: 'seasons', label: '四季轮转', desc: '春夏秋冬色调/生长/火险/冰缘变化（每季 2 年）', icon: Sun },
  { key: 'naturalDisasters', label: '天灾自演', desc: '气旋登陆/干旱/沙暴/暴雪/洪水自然发生', icon: Tornado },
];

function LawRow({
  lawKey,
  label,
  desc,
  icon: Icon,
  checked,
  onToggle,
}: {
  lawKey: string;
  label: string;
  desc: string;
  icon: typeof Zap;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 px-2.5 py-2">
      <Icon className={`h-4 w-4 shrink-0 ${checked ? 'text-amber-300' : 'text-zinc-600'}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-zinc-200">{label}</p>
        <p className="text-[9px] leading-tight text-zinc-500">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onToggle} aria-label={`${label}法则`} className="data-[state=checked]:bg-teal-500" data-law={lawKey} />
    </div>
  );
}

function OverlayModeRow({
  mode,
  current,
  onSelect,
}: {
  mode: OverlayMode;
  current: OverlayMode;
  onSelect: (m: OverlayMode) => void;
}) {
  const o = OVERLAY_OPTS.find((x) => x.id === mode)!;
  const active = current === mode;
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      aria-checked={active}
      role="menuitemradio"
      aria-roledescription="地图模式选项"
      className={`flex w-full items-center gap-2.5 rounded-sm border-2 px-2.5 py-2 text-left transition-colors ${
        active ? 'border-amber-400 bg-amber-400/15' : 'border-zinc-700/80 bg-zinc-800/60 hover:border-zinc-500 hover:bg-zinc-700/60'
      }`}
    >
      {o.dot ? (
        <span className="h-4 w-4 shrink-0 rounded-[2px] border border-black/40" style={{ background: o.dot }} aria-hidden />
      ) : (
        <o.icon className={`h-4 w-4 shrink-0 ${active ? 'text-amber-300' : 'text-zinc-400'}`} aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[11px] font-bold ${active ? 'text-amber-200' : 'text-zinc-200'}`}>{o.label}</span>
        <span className="block text-[9px] leading-tight text-zinc-500">{o.desc}</span>
      </span>
      {active && <Check className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />}
    </button>
  );
}

/** 设置中心分节标题：小字 amber 大写间距（任务 42-e 规范） */
function SectionHeader({ icon: Icon, label }: { icon: typeof Zap; label: string }) {
  return (
    <p className="flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-amber-300">
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </p>
  );
}

/** 音频节滑杆行：标签 + 滑杆 + 百分比；环境音乐行额外带播放/停止小按钮 */
function VolumeRow({
  label,
  value,
  onChange,
  musicOn,
  onToggleMusic,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  musicOn?: boolean;
  onToggleMusic?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 px-2 py-1.5">
      {onToggleMusic && (
        <button
          type="button"
          onClick={onToggleMusic}
          aria-label={musicOn ? '停止环境音乐' : '播放环境音乐'}
          aria-pressed={musicOn}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border-2 transition-colors ${
            musicOn ? 'border-amber-400 bg-amber-400/15 text-amber-300' : 'border-zinc-600 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
          }`}
        >
          {musicOn ? <Music className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
        </button>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-bold text-zinc-200">{label}</p>
        <Slider
          value={[value]}
          min={0}
          max={1}
          step={0.01}
          onValueChange={(v) => onChange(v[0] ?? 0)}
          aria-label={`${label}音量滑杆`}
          className="h-1.5 w-full cursor-pointer py-2 [&_[data-slot=slider-range]]:bg-amber-400 [&_[data-slot=slider-thumb]]:border-amber-400 [&_[data-slot=slider-thumb]]:bg-zinc-900"
        />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-[10px] font-bold text-zinc-400">{Math.round(value * 100)}%</span>
    </div>
  );
}

/** 设置中心内容：音频 / 性能 / 画面效果 / 关于（四节布局；每次打开 Popover 重新挂载，音量自 sfx 实况初始化） */
function SettingsContent() {
  const perfHud = useGameStore((s) => s.perfHud);
  const togglePerfHud = useGameStore((s) => s.togglePerfHud);
  const musicOn = useGameStore((s) => s.musicOn);
  const toggleMusic = useGameStore((s) => s.toggleMusic);
  const fxPrefs = useGameStore((s) => s.fxPrefs);
  const setFxPrefs = useGameStore((s) => s.setFxPrefs);
  const [vol, setVol] = useState(() => sfx.getVolumes());
  const [logOpen, setLogOpen] = useState(false);

  const setVolume = (key: 'master' | 'sfx' | 'music') => (v: number) => {
    setVol((cur) => ({ ...cur, [key]: v }));
    sfx.setVolumes({ [key]: v }); // 即时生效 + sfx 内部持久化 wb_vol
  };
  // 用 store 实时状态合并（避免快速连续切换时闭包旧值互相覆盖）
  const setPref = (key: keyof FxPrefs) => (v: boolean) => setFxPrefs({ ...useGameStore.getState().fxPrefs, [key]: v });
  const setDensity = (v: 0 | 1 | 2) => setFxPrefs({ ...useGameStore.getState().fxPrefs, fxDensity: v });

  return (
    <div className="grid gap-3">
      {/* —— 音频节 —— */}
      <section className="grid gap-1.5">
        <SectionHeader icon={Volume2} label="音频" />
        <VolumeRow label="主音量" value={vol.master} onChange={setVolume('master')} />
        <VolumeRow label="音效" value={vol.sfx} onChange={setVolume('sfx')} />
        <VolumeRow label="环境音乐" value={vol.music} onChange={setVolume('music')} musicOn={musicOn} onToggleMusic={toggleMusic} />
      </section>

      {/* —— 性能节 ——（后续节顶部 hairline 分割线：VLM 建议的模块化认知强化） */}
      <section className="grid gap-1.5 border-t border-zinc-800 pt-2.5">
        <SectionHeader icon={Activity} label="性能" />
        <FxPrefRow label="性能 HUD" desc="左上角实时仪表：FPS / 模拟 / 渲染耗时 / 单位数" icon={Activity} checked={perfHud} onToggle={togglePerfHud} />
        <p className="px-1 text-[9px] leading-tight text-zinc-600">仪表随世界规模波动，供性能调参参考；顶栏心电图按钮亦可切换</p>
      </section>

      {/* —— 画面效果节（既有） —— */}
      <section className="grid gap-1.5 border-t border-zinc-800 pt-2.5">
        <SectionHeader icon={SlidersHorizontal} label="画面效果" />
        <div className="grid gap-1.5">
          <FxPrefRow label="伤害数字" desc="战斗命中的浮动伤害（含毒素标记）" icon={Hash} checked={fxPrefs.dmgNumbers} onToggle={setPref('dmgNumbers')} />
          <FxPrefRow label="战争前线红闪" desc="交战地点的红色脉冲标记" icon={Zap} checked={fxPrefs.battleFlash} onToggle={setPref('battleFlash')} />
          <FxPrefRow label="血迹残留" desc="受击飞溅与死亡血泊，随时间淡出" icon={Droplets} checked={fxPrefs.blood} onToggle={setPref('blood')} />
          <FxPrefRow label="尸骸与石像" desc="死亡后短暂留存的骸骨/石化残像" icon={Bone} checked={fxPrefs.corpses} onToggle={setPref('corpses')} />
          <FxPrefRow label="单位血条" desc="受损单位头顶的红绿血条" icon={Heart} checked={fxPrefs.hpBars} onToggle={setPref('hpBars')} />
          <FxPrefRow label="河流水流动画" desc="河面的波光与粼点流动" icon={Waves} checked={fxPrefs.riverFlow} onToggle={setPref('riverFlow')} />
          <FxPrefRow label="环境氛围粒子" desc="海岸浪花/飘雪/扬尘/岩浆气泡/冰面闪熠" icon={Snowflake} checked={fxPrefs.ambience} onToggle={setPref('ambience')} />
          <FxPrefRow label="昼夜光影" desc="日夜循环色调/建筑灯火/火焰岩浆辉光/方向阴影/云影" icon={Sun} checked={fxPrefs.dayNight} onToggle={setPref('dayNight')} />
          <FxDensityRow value={fxPrefs.fxDensity ?? 1} onChange={setDensity} />
        </div>
      </section>

      {/* —— 关于节 —— */}
      <section className="grid gap-1.5 border-t border-zinc-800 pt-2.5">
        <SectionHeader icon={Gamepad2} label="关于" />
        <div className="flex items-center gap-2 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 px-2.5 py-2">
          <Gamepad2 className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-zinc-200">像素世界盒子</p>
            <p className="text-[9px] leading-tight text-zinc-500">纯本地运行的像素沙盒上帝模拟器</p>
          </div>
          <span className="shrink-0 rounded-sm border border-amber-400/70 bg-amber-400/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-200">{GAME_VERSION}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setLogOpen((v) => !v);
            sfx.ui('toggle');
          }}
          aria-expanded={logOpen}
          className="flex h-9 items-center gap-1.5 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/60 px-2.5 text-[11px] font-bold text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-700/60"
        >
          <History className="h-3.5 w-3.5 text-amber-300" aria-hidden />
          查看更新日志
          <ChevronDown className={`ml-auto h-3.5 w-3.5 text-zinc-500 transition-transform ${logOpen ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {logOpen && (
          <div className="game-scroll max-h-44 overflow-y-auto rounded-sm border-2 border-zinc-700/80 bg-zinc-900/80 p-2">
            {CHANGELOG.map((entry) => (
              <div key={entry.ver} className="mb-2 last:mb-0">
                <p className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[10px] font-bold text-amber-300">{entry.ver}</span>
                  <span className="font-mono text-[9px] text-zinc-600">{entry.date}</span>
                </p>
                <ul className="mt-0.5 grid gap-0.5">
                  {entry.items.map((item, i) => (
                    <li key={i} className="flex gap-1 text-[9px] leading-relaxed text-zinc-400">
                      <span className="text-zinc-600" aria-hidden>·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** 截图当前主画布 → PNG 下载（文件名带年份与时间戳）；返回给浮层的反馈文案 */
function screenshotWorld(): { text: string; tone: 'good' | 'danger' } {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-wb-main-canvas]');
  if (!canvas) return { text: '截图失败：未找到游戏画面', tone: 'danger' };
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    const ts = new Date();
    const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}-${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`;
    a.href = url;
    a.download = `pixel-world-第${useGameStore.getState().stats?.year ?? 0}年-${stamp}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { text: '截图已保存 — 摄影模式 C 可截取无 UI 纯净画面', tone: 'good' };
  } catch (err) {
    console.error('[WB-SHOT]', err);
    return { text: '截图失败：无法导出画布', tone: 'danger' };
  }
}

/* ═══════════════════════════════════════════════════════════════
   OmniBar（Task 68 超级 UI）：顶部统一指挥胶囊
   三簇布局 — 左：品牌 + 世界实况（纪元·季节·人口·战争·火情·船队）
            中：速度运输段（macOS 分段胶囊）
            右：⌘K 搜索 + 工具簇（摄影/存档/截图/设置/法则/地图…）
   面板入口已迁 SuperRail（左导航栏）；移动端收进「面板网格」弹出层。
   ═══════════════════════════════════════════════════════════════ */

/** 季节徽标（四色复古调） */
const SEASON_META: { icon: typeof Sun; cls: string }[] = [
  { icon: Flower2, cls: 'text-[#a7b97e]' },
  { icon: Sun, cls: 'text-[#e6ba6c]' },
  { icon: Leaf, cls: 'text-[#d97e55]' },
  { icon: CloudSnow, cls: 'text-[#7fa9ab]' },
];

/** 紧凑统计位：图标 + 等宽数字 */
function StatBit({ icon: Icon, value, cls, title }: { icon: typeof Users; value: string | number; cls?: string; title: string }) {
  return (
    <span className="flex items-center gap-1" title={title}>
      <Icon className={`h-3.5 w-3.5 ${cls ?? 'text-[#a2957c]'}`} aria-hidden />
      <span className="font-mono text-[12px] font-semibold tabular-nums text-[#f1e8d6]">{value}</span>
    </span>
  );
}

/** 图标工具钮（黄铜态 + 弹簧微交互；disabled 用于无历史的撤销/重做等条件性动作） */
function IB({
  label, tip, onClick, on, children, className, disabled,
}: {
  label: string; tip: string; onClick: () => void; on?: boolean; children: React.ReactNode; className?: string; disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          aria-pressed={on}
          data-on={on ? 'true' : 'false'}
          disabled={disabled}
          aria-disabled={disabled || undefined}
          className={`su-ibtn ${disabled ? 'pointer-events-none opacity-40' : ''} ${className ?? ''}`}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs text-[#f1e8d6]">{tip}</TooltipContent>
    </Tooltip>
  );
}

export function TopBar() {
  const {
    speed, setSpeed, newWorld, toggleHelp, toggleMinimap, openSaveDialog,
    soundOn, toggleSound, offlineAI, toggleOfflineAI, openMobilePanel, overlayMode, setOverlayMode,
    laws, setLaw, devMode, toggleDevMode, toggleDevPanel, showDev,
    toggleCinema, perfHud, togglePerfHud, showTitle, showSettings, toggleSettings,
    toggleCodex, showCodex, setPaletteOpen,
  } = useGameStore();
  const stats = useGameStore((s) => s.stats);

  // —— 撤销/重做：与 GameCanvas Ctrl+Z/Y 同一底层调用（lib/ui/undo），栈深轮询驱动禁用态 ——
  const [hist, setHist] = useState({ u: undoDepth(), r: redoDepth() });
  useEffect(() => {
    const iv = window.setInterval(() => setHist({ u: undoDepth(), r: redoDepth() }), 500);
    return () => window.clearInterval(iv);
  }, []);
  const doUndo = () => {
    const label = undo();
    setHist({ u: undoDepth(), r: redoDepth() });
    useGameStore.getState().showInteractNote(label ? `已撤销：${label}` : '没有可撤销的神力操作', label ? 'good' : 'info');
  };
  const doRedo = () => {
    const label = redo();
    setHist({ u: undoDepth(), r: redoDepth() });
    useGameStore.getState().showInteractNote(label ? `已重做：${label}` : '没有可重做的操作', label ? 'good' : 'info');
  };

  // —— 种族构成 chips：人口前 4 的文明种族（数据源与 WorldCluster 罗盘同源 stats.byRace；
  //     经 RaceDef.isCiv 过滤 → 新增动物种族/沼泽群系自动不进入顶栏，无需随契约改动） ——
  const raceChips = (() => {
    if (!stats) return [];
    const byKey = new Map(Object.values(RACES).map((r) => [r.key, r] as const));
    return Object.entries(stats.byRace)
      .map(([key, pop]) => ({ key, pop, def: byKey.get(key) }))
      .filter((e) => e.def?.isCiv === true && e.pop > 0)
      .sort((a, b) => b.pop - a.pop)
      .slice(0, 4);
  })();

  const fxPrefs = useGameStore((s) => s.fxPrefs);
  const allOff = !fxPrefs.dmgNumbers && !fxPrefs.battleFlash && !fxPrefs.riverFlow && !fxPrefs.ambience && !fxPrefs.blood && !fxPrefs.corpses && !fxPrefs.hpBars && !fxPrefs.dayNight;

  // —— 截图等瞬时反馈浮层（就地展示 3.5s 自消） ——
  const [flash, setFlash] = useState<{ id: number; text: string; tone: 'good' | 'danger' } | null>(null);
  // —— 无极调速盘开合（受控）：打开时强制收起触发钮 Tooltip，防两者叠压（Task 72 遗留收口） ——
  const [gaugeDialOpen, setGaugeDialOpen] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const notify = (text: string, tone: 'good' | 'danger') => {
    const id = Date.now();
    setFlash({ id, text, tone });
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), 3500);
  };
  useEffect(() => () => {
    if (flashTimer.current != null) window.clearTimeout(flashTimer.current);
  }, []);

  const seasonMeta = stats?.nature ? SEASON_META[stats.nature.season % 4] : null;
  const transports: { v: 0 | 1 | 3 | 8; icon: typeof Play; label: string; tip: string }[] = [
    { v: 0, icon: Pause, label: '暂停', tip: '暂停 (空格)' },
    { v: 1, icon: Play, label: '1x', tip: '常速 (1)' },
    { v: 3, icon: FastForward, label: '3x', tip: '三倍 (2)' },
    { v: 8, icon: ChevronsRight, label: '8x', tip: '极速 (3)' },
  ];
  // 移动端面板网格（12 入口：打开底部抽屉 / 图鉴直开）
  const mobilePanels: { label: string; icon: typeof Crown; run: () => void }[] = [
    { label: '王国榜', icon: Crown, run: () => openMobilePanel('kingdoms') },
    { label: '生态进化', icon: Leaf, run: () => openMobilePanel('eco') },
    { label: '自然引擎', icon: MountainSnow, run: () => openMobilePanel('nature') },
    { label: '种族图鉴', icon: UsersRound, run: () => openMobilePanel('race') },
    { label: '进化图谱', icon: GitBranch, run: () => openMobilePanel('evo') },
    { label: '社会涌现', icon: Network, run: () => openMobilePanel('societal') },
    { label: '神经核心', icon: BrainCircuit, run: () => openMobilePanel('neuro') },
    { label: '神谕 AI', icon: Sparkles, run: () => openMobilePanel('oracle') },
    { label: '统治者议会', icon: Gavel, run: () => openMobilePanel('council') },
    { label: '造物图鉴', icon: BookOpen, run: () => toggleCodex() },
    { label: '触发器', icon: Zap, run: () => openMobilePanel('triggers') },
    { label: '成就殿堂', icon: Trophy, run: () => openMobilePanel('ach') },
    { label: '世界纪事', icon: ScrollText, run: () => openMobilePanel('chronicle') },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      {/* Task 70：移动端由神明 UI 四件套接管（岁月沙漏/神界之眼），OmniBar 桌面专属 */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-20 hidden flex-col items-center gap-1.5 p-2 sm:flex">
        {/* —— 指挥胶囊 —— */}
        <HScroll className="su-capsule su-rise game-scroll-x pointer-events-auto flex h-12 w-full items-center gap-1.5 overflow-x-auto overscroll-x-contain px-2">
          {/* ◆ 左簇：品牌 + 世界实况 */}
          <span className="flex shrink-0 items-center gap-2 pl-0.5 pr-1" aria-label="像素世界盒">
            <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-[rgba(217,163,90,0.45)] bg-gradient-to-b from-[#3e3527] to-[#262019] shadow-[inset_0_1px_0_rgba(241,232,214,0.1)]">
              <Orbit className="h-4 w-4 text-[#e6ba6c]" aria-hidden />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-[11px] font-bold tracking-[0.18em] text-[#e6ba6c]">WORLD·BOX</span>
              <span className="mt-[3px] text-[8px] font-medium tracking-[0.28em] text-[#75694f]">OBSERVATORY</span>
            </span>
          </span>
          <span className="su-vline" aria-hidden />

          {/* 实况（桌面全量） */}
          {stats && (
            <span className="hidden shrink-0 items-center gap-3 md:flex" role="status" aria-label="世界实况">
              <StatBit icon={Clock} value={`${stats.year} 年`} title={`纪元 · 第 ${stats.year} 年`} />
              {stats.nature && seasonMeta && (
                <StatBit icon={seasonMeta.icon} value={stats.nature.seasonName} cls={seasonMeta.cls} title={`自然引擎 · ${stats.nature.seasonName}季`} />
              )}
              <StatBit icon={Users} value={stats.totalPop} title="总人口" />
              {raceChips.map((e) => (
                <span key={e.key} className="flex items-center gap-1" title={`${e.def!.name}人口`}>
                  {ICONS[e.key] ? (
                    <PixelIcon icon={e.key} size={13} />
                  ) : (
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] border border-black/40"
                      style={{ backgroundColor: RACE_DOT[e.key] ?? '#a2957c' }}
                      aria-hidden
                    />
                  )}
                  <span className="font-mono text-[12px] font-semibold tabular-nums text-[#f1e8d6]">{e.pop}</span>
                </span>
              ))}
              {stats.warsCount > 0 && <StatBit icon={Swords} value={stats.warsCount} cls="text-[#d97e55]" title="进行中的战争" />}
              {stats.fires > 0 && <StatBit icon={Flame} value={stats.fires} cls="text-[#dd8f5e]" title="燃烧中的地块" />}
              {stats.boats > 0 && <StatBit icon={Sailboat} value={stats.boats} cls="text-[#7fa9ab]" title="航行中的殖民船" />}
            </span>
          )}
          {/* 实况（小平板精简：纪元 + 人口） */}
          {stats && (
            <span className="flex shrink-0 items-center gap-2.5 md:hidden" role="status" aria-label="世界实况">
              <StatBit icon={Clock} value={stats.year} title={`纪元 · 第 ${stats.year} 年`} />
              <StatBit icon={Users} value={stats.totalPop} title="总人口" />
              {stats.warsCount > 0 && <StatBit icon={Swords} value={stats.warsCount} cls="text-[#d97e55]" title="进行中的战争" />}
            </span>
          )}
          <span className="su-vline" aria-hidden />

          {/* ◆ 中簇：速度运输段（四档 + 无极 Gauge 钮；非档位值时 Gauge 亮金并显示实时倍率） */}
          <div className="su-segment shrink-0" role="group" aria-label="时间流速">
            {transports.map((t) => (
              <Tooltip key={t.v}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setSpeed(t.v)}
                    aria-pressed={speed === t.v}
                    aria-label={t.label}
                    data-on={speed === t.v ? 'true' : 'false'}
                    className="su-seg-btn"
                  >
                    <t.icon className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs text-[#f1e8d6]">{t.tip}</TooltipContent>
              </Tooltip>
            ))}
            <Tooltip open={gaugeDialOpen ? false : undefined}>
              <TooltipTrigger asChild>
                <div className="flex items-center">
                  <SpeedDial
                    side="bottom"
                    open={gaugeDialOpen}
                    onOpenChange={setGaugeDialOpen}
                    triggerLabel={`无极调速（当前 ${fmtSpeed(speed)}）`}
                    triggerCls={`su-seg-btn gap-1 ${![0, 1, 3, 8].includes(speed) ? 'text-[#efc377]' : ''}`}
                    triggerContent={
                      <>
                        <Gauge className="h-3.5 w-3.5" aria-hidden />
                        {![0, 1, 3, 8].includes(speed) && (
                          <span className="font-mono text-[10px] font-bold tabular-nums">{fmtSpeed(speed)}</span>
                        )}
                      </>
                    }
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs text-[#f1e8d6]">无极调速 — 打数字或拖滑条任意倍率（Alt+↑/↓ 微调）</TooltipContent>
            </Tooltip>
          </div>
          <span className="su-vline" aria-hidden />

          {/* ◆ 右簇：⌘K 搜索 + 工具（ml-auto 右贴边，与左侧品牌簇呼应成完整应用框架） */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="打开命令面板"
                className="ml-auto flex h-9 shrink-0 items-center gap-2 rounded-[10px] border border-[rgba(214,178,120,0.22)] bg-[rgba(19,16,9,0.45)] px-3 text-[#75694f] transition-colors hover:border-[rgba(214,178,120,0.4)] hover:text-[#a2957c] active:scale-[0.97]"
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden text-[11px] font-medium sm:inline">搜索一切…</span>
                <span className="su-kbd">⌘K</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs text-[#f1e8d6]">命令面板 — 工具 / 面板 / 速度 / 存档 / 镜头跳转，一切皆可搜（触屏同样可点）</TooltipContent>
          </Tooltip>

          {/* 移动端：面板网格 + 纪事 */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="面板导航" className="su-ibtn sm:hidden">
                    <LayoutGrid className="h-4 w-4" aria-hidden />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs text-[#f1e8d6]">全部面板</TooltipContent>
            </Tooltip>
            <PopoverContent side="bottom" align="end" className="su-panel grid w-64 grid-cols-2 gap-1 p-2">
              {mobilePanels.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => p.run()}
                  className="flex items-center gap-2 rounded-[9px] border border-[rgba(214,178,120,0.14)] bg-[rgba(50,42,31,0.5)] px-2.5 py-2 text-left transition-colors hover:border-[rgba(214,178,120,0.35)] hover:bg-[rgba(62,53,39,0.7)]"
                >
                  <p.icon className="h-3.5 w-3.5 shrink-0 text-[#e6ba6c]" aria-hidden />
                  <span className="text-[11px] font-semibold text-[#f1e8d6]">{p.label}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <IB label="摄影模式" tip="摄影模式 — 隐藏全部界面，纯净观察世界 (C)" onClick={toggleCinema} className="shrink-0">
            <Camera className="h-4 w-4" aria-hidden />
          </IB>
          <IB label="保存世界" tip="保存世界（3 槽位；每 60 秒自动存档）" onClick={() => openSaveDialog('save')} className="shrink-0">
            <Save className="h-4 w-4" aria-hidden />
          </IB>
          <IB label="读取存档" tip="读取存档（多槽位管理）" onClick={() => openSaveDialog('load')} className="shrink-0">
            <FolderOpen className="h-4 w-4" aria-hidden />
          </IB>
          <IB
            label="截图"
            tip="截图 — 当前画面存为 PNG（摄影模式 C 可截纯净画面）"
            onClick={() => { const r = screenshotWorld(); notify(r.text, r.tone); }}
            className="shrink-0"
          >
            <ImageDown className="h-4 w-4" aria-hidden />
          </IB>

          <IB label="撤销" tip="撤销上一步神力 / 地形操作 (Ctrl+Z)" onClick={doUndo} disabled={hist.u === 0} className="shrink-0">
            <Undo2 className="h-4 w-4" aria-hidden />
          </IB>
          <IB label="重做" tip="重做 (Ctrl+Shift+Z 或 Ctrl+Y)" onClick={doRedo} disabled={hist.r === 0} className="shrink-0">
            <Redo className="h-4 w-4" aria-hidden />
          </IB>

          <IB label={soundOn ? '关闭音效' : '开启音效'} tip={`音效 ${soundOn ? '开' : '关'}`} onClick={toggleSound} on={soundOn} className="shrink-0">
            {soundOn ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          </IB>
          <IB label={offlineAI ? '离线AI:开' : '离线AI:关'} tip="离线战略AI（无外部API时接管文明决策）" onClick={toggleOfflineAI} on={offlineAI} className="shrink-0">
            <BrainCircuit className="h-4 w-4" aria-hidden />
          </IB>

          {/* 设置中心 */}
          <Popover open={showSettings} onOpenChange={(o) => { if (o !== showSettings) toggleSettings(); }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="设置中心" data-on={allOff ? 'true' : 'false'} className="su-ibtn shrink-0">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs text-[#f1e8d6]">设置中心 — 音频 / 性能 / 画面效果 / 关于</TooltipContent>
            </Tooltip>
            <PopoverContent side="bottom" align="end" className="su-panel game-scroll max-h-[70dvh] w-[17.5rem] max-w-[calc(100vw-1.25rem)] overflow-y-auto p-2">
              <SettingsContent />
            </PopoverContent>
          </Popover>

          {/* 世界法则 */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="世界法则" data-on={Object.values(laws).some((v) => !v) ? 'true' : 'false'} className="su-ibtn shrink-0">
                    <Scale className="h-4 w-4" aria-hidden />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs text-[#f1e8d6]">世界法则 — 定制这个世界的运行规则</TooltipContent>
            </Tooltip>
            <PopoverContent side="bottom" align="end" className="su-panel game-scroll max-h-[70dvh] w-64 overflow-y-auto p-2">
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-[#e6ba6c]">
                <Scale className="h-3 w-3" aria-hidden />
                世界法则
              </p>
              <div className="grid gap-1.5">
                {LAW_DEFS.map((law) => (
                  <LawRow
                    key={law.key}
                    lawKey={law.key}
                    label={law.label}
                    desc={law.desc}
                    icon={law.icon}
                    checked={(laws as unknown as Partial<Record<string, boolean>>)[law.key] ?? true}
                    onToggle={(v) => setLaw(law.key as keyof WorldLaws, v)}
                  />
                ))}
              </div>
              <p className="mt-1.5 px-1 text-[9px] text-[#75694f]">法则随存档保存；开关立即生效</p>
            </PopoverContent>
          </Popover>

          {/* 地图覆盖模式 */}
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="地图模式" aria-pressed={overlayMode !== 'none'} data-on={overlayMode !== 'none' ? 'true' : 'false'} className="su-ibtn shrink-0">
                    <Layers className="h-4 w-4" aria-hidden />
                  </button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs text-[#f1e8d6]">地图模式（政治 / 温度 / 湿度 / 密度 / 群落）</TooltipContent>
            </Tooltip>
            <PopoverContent side="bottom" align="end" className="su-panel game-scroll max-h-[70dvh] w-56 overflow-y-auto p-2">
              <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-[#e6ba6c]">
                <Layers className="h-3 w-3" aria-hidden />
                地图模式
              </p>
              <div className="grid gap-1.5" role="menu" aria-label="地图覆盖模式">
                {OVERLAY_OPTS.map((o) => (
                  <OverlayModeRow key={o.id} mode={o.id} current={overlayMode} onSelect={setOverlayMode} />
                ))}
              </div>
              <p className="mt-1.5 px-1 text-[9px] text-[#75694f]">覆盖层会同步显示在小地图上；选择会自动保存</p>
            </PopoverContent>
          </Popover>

          <IB label="小地图开关" tip="小地图" onClick={toggleMinimap} className="shrink-0">
            <MapIcon className="h-4 w-4" aria-hidden />
          </IB>
          <IB label="生成新世界" tip="新世界" onClick={newWorld} className="shrink-0">
            <RefreshCw className="h-4 w-4" aria-hidden />
          </IB>

          <span className="su-vline" aria-hidden />

          <IB label="开发者模式" tip="开发者模式 — 性能统计 / 单位编辑 / 王国控制台" onClick={() => { if (!devMode) toggleDevMode(); else toggleDevPanel(); }} on={devMode && showDev} className="shrink-0">
            <Terminal className="h-4 w-4" aria-hidden />
          </IB>
          <IB label="性能 HUD" tip="性能 HUD — FPS / 模拟 / 渲染实时仪表" onClick={togglePerfHud} on={perfHud} className="shrink-0">
            <Activity className="h-4 w-4" aria-hidden />
          </IB>
          <IB label="回到主菜单" tip="主菜单" onClick={() => { sfx.ui('close'); showTitle(); }} className="shrink-0">
            <House className="h-4 w-4" aria-hidden />
          </IB>
          <IB label="帮助" tip="帮助 (H)" onClick={toggleHelp} className="shrink-0">
            <CircleHelp className="h-4 w-4" aria-hidden />
          </IB>
        </HScroll>

        {/* 截图等瞬时反馈浮层（胶囊下方居中，3.5s 自消） */}
        {flash && (
          <div
            role="status"
            className={`su-chip su-rise pointer-events-none z-30 -mt-0.5 whitespace-nowrap px-3.5 py-1.5 text-[11px] font-semibold tracking-wide ${
              flash.tone === 'good' ? 'text-[#f0dcae]' : 'text-[#e39a7b]'
            }`}
          >
            {flash.text}
          </div>
        )}

        {/* 性能 HUD（自锚定左上角；摄影模式下随 TopBar 挂卸） */}
        <PerfHud />
      </div>
    </TooltipProvider>
  );
}
