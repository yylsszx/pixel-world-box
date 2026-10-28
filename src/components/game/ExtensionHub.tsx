'use client';
// ============ 扩展中心（Task 55 · 神谕一等公民的管理台） ============
// 双标签工坊：
//   · 插件（DeepSeek harness 式能力包）：内置三包 + 神谕铸造 + 玩家导入；开关/卸载/导出/唤醒神谕铸造
//   · Mod（Claude 式规则模组）：参数补丁+脚本钩子的世界改造包；开关/卸载/导出/唤醒神谕安装
// 桌面左侧栏（与王国榜/神谕同列互斥）+ 移动端底部抽屉。
// 数据源全部 useSyncExternalStore 直连 localStorage 库（mods.ts/plugins.ts），引擎无关。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useWwBanner } from './WorldWarHud';
import { subscribeMods, modsSnapshot, toggleMod, removeMod, type GameMod, MOD_HOOK_EVENTS } from '@/lib/game/mods';
import { subscribePlugins, pluginsSnapshot, togglePlugin, uninstallPlugin, registerPlugin, type OraclePlugin } from '@/lib/oracle/plugins';
import { effectiveOracleTools } from '@/lib/oracle/plugins';
import { subscribePowerPacks, powerPacksSnapshot, togglePowerPack, type PowerPack } from '@/lib/oracle/powerPacks';
import { downloadArtifact, readArtifactFile } from '@/lib/game/artifacts';
import { getEngineParam, listEngineParams } from '@/lib/game/engineParams';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { LucideIcon } from 'lucide-react';
import {
  X, Puzzle, Package, Sparkles, Boxes, Trash2, Download, Upload, ChevronDown, ChevronRight,
  Wrench, Braces, Gauge, Clock, ShieldCheck, Zap, Crown, User, Layers, Power,
} from 'lucide-react';

// ---------------- 小组件 ----------------

function AuthorBadge({ author, builtin }: { author: string; builtin?: boolean }) {
  if (builtin) {
    return (
      <span className="flex shrink-0 items-center gap-0.5 rounded-sm border border-zinc-600 bg-zinc-700/30 px-1 py-px text-[8px] font-bold text-zinc-400">
        <ShieldCheck className="h-2.5 w-2.5" aria-hidden /> 内置
      </span>
    );
  }
  if (author === 'oracle') {
    return (
      <span className="flex shrink-0 items-center gap-0.5 rounded-sm border border-fuchsia-400/50 bg-fuchsia-400/10 px-1 py-px text-[8px] font-bold text-fuchsia-300">
        <Sparkles className="h-2.5 w-2.5" aria-hidden /> 神谕铸造
      </span>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5 rounded-sm border border-teal-500/50 bg-teal-500/10 px-1 py-px text-[8px] font-bold text-teal-300">
      <User className="h-2.5 w-2.5" aria-hidden /> 玩家
    </span>
  );
}

/** 参数补丁摘要：war.declareRate 2.5 → 「宣战倾向 2.5」 */
function ParamChips({ params }: { params: Record<string, number> }) {
  const entries = Object.entries(params);
  if (entries.length === 0) return null;
  const metas = listEngineParams();
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {entries.slice(0, 6).map(([path, v]) => {
        const meta = metas.find((m) => m.path === path);
        const def = meta ? getEngineParam(path) : null;
        const changed = def != null && Math.abs(def.value - v) < 1e-9;
        return (
          <span
            key={path}
            title={`${path}：默认 ${meta ? defaultLabel(metas, path) : '?'} → ${v}`}
            className={`rounded-sm border px-1 py-px font-mono text-[8px] font-bold ${changed ? 'border-amber-400/60 bg-amber-400/10 text-amber-200' : 'border-zinc-700 bg-zinc-800/60 text-zinc-400'}`}
          >
            {meta?.label ?? path} {v}
          </span>
        );
      })}
      {entries.length > 6 && <span className="text-[8px] text-zinc-500">+{entries.length - 6}</span>}
    </div>
  );
}
function defaultLabel(metas: { path: string; value: number }[], path: string): string {
  return String(metas.find((m) => m.path === path)?.value ?? '?');
}

// ---------------- 插件卡片 ----------------

function PluginCard({ p, onNote }: { p: OraclePlugin; onNote: (t: string, tone: 'good' | 'danger' | 'info') => void }) {
  const [open, setOpen] = useState(false);
  const engineToolCount = effectiveOracleTools().length;
  return (
    <div className={`rounded-sm border-2 p-2 transition-colors ${p.enabled ? 'border-zinc-700 bg-zinc-800/50' : 'border-zinc-800 bg-zinc-900/40 opacity-75'}`}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '收起工具清单' : '展开工具清单'}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <Boxes className="h-3.5 w-3.5 shrink-0 text-amber-300/90" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-200" title={p.desc}>{p.name}</span>
        <span className="shrink-0 font-mono text-[9px] font-bold text-zinc-500">v{p.version}</span>
        <AuthorBadge author={p.author} builtin={p.builtin} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const ok = downloadArtifact('wb-plugin', p.name, p);
                onNote(ok ? `已导出「${p.name}」` : '导出失败', ok ? 'good' : 'danger');
              }}
              aria-label="导出插件"
              className="h-6 w-6 rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-teal-300"
            >
              <Download className="h-3 w-3" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">导出为 artifact 文件（可分享/备份）</TooltipContent>
        </Tooltip>
        {!p.builtin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const r = uninstallPlugin(p.id);
                  onNote(r.ok ? `已卸载「${p.name}」` : r.error ?? '卸载失败', r.ok ? 'good' : 'danger');
                }}
                aria-label="卸载插件"
                className="h-6 w-6 rounded-sm text-zinc-500 hover:bg-red-500/15 hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" aria-hidden />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">卸载（内置插件只能关闭）</TooltipContent>
          </Tooltip>
        )}
        <Switch checked={p.enabled} onCheckedChange={(v) => togglePlugin(p.id, v)} aria-label={`开关插件 ${p.name}`} />
      </div>
      <p className="mt-0.5 pl-6.5 text-[9px] leading-relaxed text-zinc-500">{p.desc}</p>
      <div className="mt-1 flex items-center gap-2 pl-6.5">
        <span className="font-mono text-[9px] font-bold text-zinc-500">{p.tools.length} 工具</span>
        <span className="font-mono text-[9px] text-zinc-600">{p.enabled ? '已注入神谕权柄' : '未注入'}</span>
      </div>
      {open && (
        <div className="mt-1.5 ml-6.5 space-y-1 border-l-2 border-zinc-700/60 pl-2">
          {p.tools.map((t) => (
            <div key={t.name} className="rounded-sm bg-zinc-900/70 p-1.5">
              <p className="flex items-center gap-1 font-mono text-[10px] font-bold text-amber-200/90">
                <Wrench className="h-2.5 w-2.5 shrink-0" aria-hidden />
                {t.name}
                <span className="ml-auto text-[8px] font-normal text-zinc-600">{Object.keys(t.args ?? {}).length} 参数</span>
              </p>
              <p className="mt-0.5 text-[9px] leading-relaxed text-zinc-500">{t.desc}</p>
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-[8px] font-bold text-zinc-600 hover:text-zinc-400">查看沙箱脚本</summary>
                <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-sm bg-zinc-950/80 p-1.5 font-mono text-[8px] leading-relaxed text-zinc-400" style={{ scrollbarWidth: 'thin' }}>
{t.script}
                </pre>
              </details>
            </div>
          ))}
          <p className="pt-0.5 text-[8px] text-zinc-600">开启后神谕工具目录：{engineToolCount} 项（含全部启用插件）</p>
        </div>
      )}
    </div>
  );
}

// ---------------- 权柄包卡片（一切皆插件 · 系统级） ----------------

function PowerPackCard({ p, onNote }: { p: PowerPack; onNote: (t: string, tone: 'good' | 'danger' | 'info') => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-sm border-2 p-2 transition-colors ${p.enabled ? 'border-zinc-700 bg-zinc-800/50' : 'border-red-900/60 bg-zinc-900/40 opacity-80'}`}>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? '收起工具清单' : '展开工具清单'}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
        </button>
        <span className={`flex h-5 w-7 shrink-0 items-center justify-center rounded-sm border font-mono text-[9px] font-bold ${p.enabled ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
          {p.id}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-200">{p.name}</span>
        <span className="shrink-0 font-mono text-[9px] font-bold text-zinc-500">{p.tools.length} 工具</span>
        <Switch
          checked={p.enabled}
          onCheckedChange={(v) => {
            const r = togglePowerPack(p.id, v);
            if (!r.ok) onNote(r.error ?? '操作失败', 'danger');
            else onNote(v ? `已装回【${p.id} ${p.name}】` : `已拆除【${p.id} ${p.name}】——${p.risk}`, v ? 'good' : 'info');
          }}
          aria-label={`权柄包 ${p.id} ${p.name} 开关`}
        />
      </div>
      <p className="mt-0.5 pl-6.5 text-[9px] leading-relaxed text-zinc-500">
        {p.desc}
        {!p.enabled && <span className="ml-1 text-red-300/80">〔已拆除：{p.risk}〕</span>}
      </p>
      {open && (
        <div className="mt-1.5 ml-6.5 flex flex-wrap gap-1 border-l-2 border-zinc-700/60 pl-2">
          {p.tools.map((t) => (
            <span key={t} className="rounded-sm border border-zinc-700 bg-zinc-900/70 px-1 font-mono text-[8px] text-zinc-400">{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- Mod 卡片 ----------------

function ModCard({ m, onNote }: { m: GameMod; onNote: (t: string, tone: 'good' | 'danger' | 'info') => void }) {
  return (
    <div className={`rounded-sm border-2 p-2 transition-colors ${m.enabled ? 'border-teal-700/70 bg-teal-950/20' : 'border-zinc-800 bg-zinc-900/40 opacity-75'}`}>
      <div className="flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5 shrink-0 text-teal-300/90" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-200" title={m.desc}>{m.name}</span>
        <AuthorBadge author={m.author} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const ok = downloadArtifact('wb-mod', m.name, m);
                onNote(ok ? `已导出「${m.name}」` : '导出失败', ok ? 'good' : 'danger');
              }}
              aria-label="导出 Mod"
              className="h-6 w-6 rounded-sm text-zinc-500 hover:bg-zinc-800 hover:text-teal-300"
            >
              <Download className="h-3 w-3" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">导出为 artifact 文件（可分享/备份）</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const r = removeMod(m.id);
                onNote(r.ok ? `已卸载「${m.name}」（参数还原默认）` : r.error ?? '卸载失败', r.ok ? 'good' : 'danger');
              }}
              aria-label="卸载 Mod"
              className="h-6 w-6 rounded-sm text-zinc-500 hover:bg-red-500/15 hover:text-red-300"
            >
              <Trash2 className="h-3 w-3" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">卸载并还原参数</TooltipContent>
        </Tooltip>
        <Switch checked={m.enabled} onCheckedChange={(v) => toggleMod(m.id, v)} aria-label={`开关 Mod ${m.name}`} />
      </div>
      <p className="mt-0.5 pl-6 text-[9px] leading-relaxed text-zinc-500">{m.desc || '（无描述）'}</p>
      <ParamChips params={m.params} />
      {m.hooks.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1 pl-6">
          {m.hooks.map((h, i) => (
            <span key={i} className={`flex items-center gap-0.5 rounded-sm border px-1 py-px font-mono text-[8px] font-bold ${h.event === 'tick' || h.event === 'year' ? 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300' : 'border-amber-500/50 bg-amber-500/10 text-amber-300'}`} title={h.script.slice(0, 160)}>
              {h.event === 'year' ? <Clock className="h-2.5 w-2.5" aria-hidden /> : h.event === 'tick' ? <Gauge className="h-2.5 w-2.5" aria-hidden /> : <Zap className="h-2.5 w-2.5" aria-hidden />}
              {h.event === 'tick' ? '周期钩子' : h.event === 'year' ? '每年钩子' : `on ${h.event}`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------- 主体 ----------------

type HubTab = 'plugins' | 'mods' | 'packs';

function HubBody() {
  const [tab, setTab] = useState<HubTab>('plugins');
  const setOraclePending = useGameStore((s) => s.setOraclePending);
  const openOracle = useGameStore((s) => s.openOracle);
  const showNote = useGameStore((s) => s.showNote);
  const fileRef = useRef<HTMLInputElement>(null);
  // 外部库订阅（与引擎解耦的 localStorage 真源；pluginsSnapshot/modsSnapshot 引用稳定防无限重渲染）
  const plugins = useSyncExternalStore(subscribePlugins, pluginsSnapshot, pluginsSnapshot);
  const mods = useSyncExternalStore(subscribeMods, modsSnapshot, modsSnapshot);
  const packs = useSyncExternalStore(subscribePowerPacks, powerPacksSnapshot, powerPacksSnapshot);
  const [importing, setImporting] = useState(false);

  const onNote = useCallback((t: string, tone: 'good' | 'danger' | 'info') => showNote(t, tone), [showNote]);

  /** 唤醒神谕（定向注入指令 → 神谕面板以对应模式自动发送） */
  const wakeOracle = useCallback(
    (prompt: string) => {
      setOraclePending(prompt);
      openOracle();
    },
    [setOraclePending, openOracle],
  );

  /** 导入 artifact（自动识别 wb-plugin / wb-mod / 其它类型提示去对应面板导入） */
  const onImportFile = useCallback(
    async (file: File) => {
      setImporting(true);
      try {
        const r = await readArtifactFile(file);
        if (!r.ok) {
          onNote(r.error, 'danger');
          return;
        }
        const env = r.env;
        if (env.kind === 'wb-plugin') {
          const p = env.payload as Partial<OraclePlugin> & { name?: string; tools?: { name?: string; desc?: string; args?: OraclePlugin['tools'][number]['args']; script?: string }[] };
          if (!p?.name || !Array.isArray(p.tools) || p.tools.length === 0) {
            onNote('插件 artifact 缺少 name 或 tools', 'danger');
            return;
          }
          // v9 修复：导入时保留 args 参数定义（旧版丢 args 导致导入插件失去参数 schema）
          const res = registerPlugin({
            name: p.name,
            desc: p.desc,
            version: p.version,
            author: 'player',
            enabled: true,
            tools: p.tools.map((t) => ({ name: t.name ?? '', desc: t.desc ?? '', args: t.args, script: t.script ?? '' })),
          });
          if (!res.ok) onNote(res.error, 'danger');
          else {
            setTab('plugins');
            onNote(`已导入插件「${res.plugin.name}」（${res.plugin.tools.length} 工具）`, 'good');
          }
        } else if (env.kind === 'wb-mod') {
          const m = env.payload as Partial<GameMod> & { name?: string };
          if (!m?.name) {
            onNote('Mod artifact 缺少 name', 'danger');
            return;
          }
          // 经 addMod 走完整校验（参数键/钩子纪律）
          const { addMod } = await import('@/lib/game/mods');
          const res = addMod({
            name: m.name,
            desc: m.desc,
            author: 'player',
            enabled: false, // 导入的 Mod 默认关——玩家查验后自行开启
            params: m.params,
            hooks: m.hooks,
          });
          if (!res.ok) onNote(res.error, 'danger');
          else {
            setTab('mods');
            onNote(`已导入 Mod「${res.mod.name}」（默认关闭，查验后开启）`, 'good');
          }
        } else if (env.kind === 'wb-creation' || env.kind === 'wb-creations') {
          onNote('这是造物图鉴 artifact——请到「造物图鉴」面板导入', 'info');
        } else if (env.kind === 'wb-world') {
          onNote('这是世界存档 artifact——请到存档对话框导入', 'info');
        }
      } finally {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [onNote],
  );

  const enabledPlugins = plugins.filter((p) => p.enabled);
  const enabledTools = enabledPlugins.reduce((s, p) => s + p.tools.length, 0);
  const activeMods = mods.filter((m) => m.enabled);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 三标签切换 */}
        <div className="flex shrink-0 items-center gap-1 border-b-2 border-zinc-800 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setTab('plugins')}
            aria-pressed={tab === 'plugins'}
            className={`flex h-7 items-center gap-1 rounded-sm border-2 px-2 text-[10px] font-bold transition-colors ${tab === 'plugins' ? 'border-amber-400/70 bg-amber-400/10 text-amber-200' : 'border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Puzzle className="h-3.5 w-3.5" aria-hidden />
            插件
            <span className="font-mono text-[8px] text-zinc-500">{plugins.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('mods')}
            aria-pressed={tab === 'mods'}
            className={`flex h-7 items-center gap-1 rounded-sm border-2 px-2 text-[10px] font-bold transition-colors ${tab === 'mods' ? 'border-teal-400/70 bg-teal-400/10 text-teal-200' : 'border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Package className="h-3.5 w-3.5" aria-hidden />
            Mod 工坊
            <span className="font-mono text-[8px] text-zinc-500">{mods.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('packs')}
            aria-pressed={tab === 'packs'}
            title="一切皆插件：九层系统权柄包拆装（deepseek harness 式）"
            className={`flex h-7 items-center gap-1 rounded-sm border-2 px-2 text-[10px] font-bold transition-colors ${tab === 'packs' ? 'border-fuchsia-400/70 bg-fuchsia-400/10 text-fuchsia-200' : 'border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            权柄
            <span className="font-mono text-[8px] text-zinc-500">{packs.filter((p) => !p.enabled).length > 0 ? `${packs.filter((p) => !p.enabled).length}拆` : '9'}</span>
          </button>
          <span className="ml-auto font-mono text-[8px] text-zinc-600">
            {tab === 'plugins' ? `${enabledTools} 工具已注入` : tab === 'mods' ? `${activeMods.length} 生效中` : `目录 ${effectiveOracleTools().length} 工具`}
          </span>
        </div>

        {/* 内容区 */}
        <div className="game-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2" style={{ scrollbarWidth: 'thin' }}>
          {tab === 'plugins' ? (
            <>
              <div className="rounded-sm border-2 border-fuchsia-500/30 bg-fuchsia-500/5 p-2">
                <p className="flex items-center gap-1 text-[10px] font-bold text-fuchsia-200">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  神谕的一等公民权柄
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">
                  插件是神谕的动态能力包：注册即成为正式工具（进目录、进原生调用）。内置三包开箱即用；也可以让神谕现场铸造——它会自己写工具定义与沙箱脚本。
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <Button
                    size="sm"
                    onClick={() => wakeOracle('用 register_plugin 铸造一个实用插件（工具名/参数/脚本你自己设计——建议铸造「王国体检」kingdom_checkup：一键诊断任意王国的财政/军备/稳定/外交风险并给出处方）。铸完简要汇报工具用法。')}
                    className="h-7 rounded-sm border-2 border-fuchsia-400/50 bg-fuchsia-400/10 px-2 text-[9px] font-bold text-fuchsia-200 hover:bg-fuchsia-400/20"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden />
                    唤醒神谕铸造
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={importing}
                    className="h-7 rounded-sm border-2 border-zinc-700 bg-zinc-800/50 px-2 text-[9px] font-bold text-zinc-300 hover:bg-zinc-800"
                  >
                    <Upload className="h-3 w-3" aria-hidden />
                    {importing ? '导入中…' : '导入插件文件'}
                  </Button>
                </div>
              </div>
              {plugins.map((p) => (
                <PluginCard key={p.id} p={p} onNote={onNote} />
              ))}
              {plugins.length === 0 && <p className="py-4 text-center text-[10px] text-zinc-600">还没有插件——唤醒神谕铸造第一个</p>}
            </>
          ) : tab === 'packs' ? (
            <>
              <div className="rounded-sm border-2 border-fuchsia-500/30 bg-fuchsia-500/5 p-2">
                <p className="flex items-center gap-1 text-[10px] font-bold text-fuchsia-200">
                  <Power className="h-3.5 w-3.5" aria-hidden />
                  一切皆插件 · 九层权柄包
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">
                  deepseek harness 哲学：神谕的核心权柄也按层拆装。拆除的层从目录/schema 彻底消失——目录更小更准、消耗更低；常驻元工具（自省/拆装）永不下线，随时可装回。
                </p>
              </div>
              {packs.map((p) => (
                <PowerPackCard key={p.id} p={p} onNote={onNote} />
              ))}
            </>
          ) : (
            <>
              <div className="rounded-sm border-2 border-teal-500/30 bg-teal-500/5 p-2">
                <p className="flex items-center gap-1 text-[10px] font-bold text-teal-200">
                  <Braces className="h-3.5 w-3.5" aria-hidden />
                  规则模组：改写世界基调
                </p>
                <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">
                  Mod = 参数补丁 + 周期钩子的持久化改造包：启用即生效、跨会话保留、卸载自动还原。适合「永冬纪元」「战争地狱」这类持续基调。
                </p>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                  <Button
                    size="sm"
                    onClick={() => wakeOracle('用 install_mod 给这个世界设计并安装一个有主题的规则 Mod（主题你按当前世界实况挑——如永冬纪元/黄金时代/战争地狱/瘟疫末世；参数补丁+至少一个 year 钩子）。装完说明这个 Mod 会带来什么。')}
                    className="h-7 rounded-sm border-2 border-teal-400/50 bg-teal-400/10 px-2 text-[9px] font-bold text-teal-200 hover:bg-teal-400/20"
                  >
                    <Sparkles className="h-3 w-3" aria-hidden />
                    唤醒神谕安装
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={importing}
                    className="h-7 rounded-sm border-2 border-zinc-700 bg-zinc-800/50 px-2 text-[9px] font-bold text-zinc-300 hover:bg-zinc-800"
                  >
                    <Upload className="h-3 w-3" aria-hidden />
                    {importing ? '导入中…' : '导入 Mod 文件'}
                  </Button>
                </div>
              </div>
              {mods.map((m) => (
                <ModCard key={m.id} m={m} onNote={onNote} />
              ))}
              {mods.length === 0 && <p className="py-4 text-center text-[10px] text-zinc-600">还没有 Mod——唤醒神谕安装第一个</p>}
            </>
          )}
        </div>
        {/* 隐藏的文件选择器（两个标签共用） */}
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
          }}
          aria-label="导入 artifact 文件"
        />
      </div>
    </TooltipProvider>
  );
}

export function ExtensionHub() {
  const showExt = useGameStore((s) => s.showExt);
  const toggleExt = useGameStore((s) => s.toggleExt);
  const mobilePanel = useGameStore((s) => s.mobilePanel);
  const openMobilePanel = useGameStore((s) => s.openMobilePanel);
  const hudTop = useGameStore((s) => s.hudTop);
  // 62-b：底部预留协议——常态 158px（8+小地图100+8+迷你条36+6）/ 战况条在屏 190px，与 WorldHud 角标柱同源（Task 63：角标柱仅左缘 8→16，垂直链不变）
  const wwBanner = useWwBanner();
  // Task 63：编组条在屏且水平投影侵入左栏区（left < 304 = 8+最宽 w-72）时让位到其顶沿（hudGroup 协议左栏接入）
  const hudGroup = useGameStore((s) => s.hudGroup);
  const groupClear = hudGroup && hudGroup.left < 304 ? hudGroup.clear : 0;
  const pluginCount = useSyncExternalStore(subscribePlugins, () => pluginsSnapshot().length, () => 0);
  const modCount = useSyncExternalStore(subscribeMods, () => modsSnapshot().length, () => 0);

  return (
    <>
      {/* 桌面左侧栏 —— 顶栏扩展中心按钮触发（与王国榜/神谕同列互斥） */}
      {showExt && (
        <div
          className="pointer-events-auto absolute left-2 z-10 hidden w-[21rem] flex-col shadow-[0_4px_0_rgba(0,0,0,0.6)] sm:flex"
          style={{ top: hudTop, maxHeight: `calc(100dvh - ${hudTop + Math.max(wwBanner ? 190 : 158, groupClear)}px)` }}
          role="complementary"
          aria-label="扩展中心面板"
        >
          <div className="flex items-center justify-between border-2 border-b-0 border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <Puzzle className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
              <span className="shrink-0">扩展中心</span>
              <span className="shrink-0 rounded-sm border border-amber-400/50 bg-amber-400/10 px-1 py-px text-[8px] font-bold tracking-normal text-amber-300">
                {pluginCount} 插件 · {modCount} Mod
              </span>
            </span>
            <Button variant="ghost" size="icon" onClick={toggleExt} aria-label="关闭扩展中心" className="h-6 w-6 rounded-sm hover:bg-zinc-800">
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-2 border-t-0 border-zinc-700/90 bg-zinc-900/95">
            <HubBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'ext'} onOpenChange={(v) => { if (!v) openMobilePanel('none'); }}>
        <SheetContent
          side="bottom"
          className="flex h-[62dvh] flex-col rounded-t-lg border-2 border-zinc-700 bg-zinc-900 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))] [&>button]:hidden"
        >
          <SheetHeader className="border-b border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-sm font-bold text-zinc-200">
              <Puzzle className="h-4 w-4 text-amber-300" aria-hidden />
              扩展中心
              <span className="rounded-sm border border-amber-400/50 bg-amber-400/10 px-1 text-[9px] font-bold text-amber-300">
                {pluginCount} 插件 · {modCount} Mod
              </span>
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <HubBody />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
