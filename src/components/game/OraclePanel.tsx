'use client';
// ============ 神谕 Agent 控制台（开发者级 AI Agent Harness） ============
// 原生世界底层全机制、层层向上像素级覆盖全游戏的 Agent 控制台：
//   多厂商模型接入（内置 Z.ai / OpenAI 兼容 / Anthropic）+ 61 工具七层权柄（L0 世界内核→L6 元控制）
//   多轮循环（runOracleAgentTurn 编排，工具在活引擎上零延迟执行）+ markdown 神谕石板渲染
//   + 机制热插拔管理视图（触发器 cron/事件/条件 × 33 动作 DSL，事件即时响应）。
// 桌面左侧栏（与王国榜/生态/成就同列互斥）+ 移动端底部抽屉。
import { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { useGameStore, getEngine } from '@/store/gameStore';
import type { OracleMode, OracleMsg, CondExpr } from '@/lib/game/types';
import type { AgentChatMessage, AgentToolResult, OracleProviderConfig, ProviderKind } from '@/lib/oracle/types';
import { runOracleAgentTurn, type AgentTurnResult } from '@/lib/oracle/agent';
import { runConnectivityTest, validateProviderConfig, runDshSessionTurn, type DshSnapshot } from '@/lib/oracle/direct-client';
import { executeOracleTool } from '@/lib/oracle/bridge';
import { loadDshOn, storeDshOn, loadOrCreateSessionId, rotateSessionId } from '@/lib/oracle/session';
import { renderToolCatalog, AGENT_TOOLS } from '@/lib/oracle/tools';
import { buildSystemPrompt } from '@/lib/oracle/prompt';
import { buildNativeToolParams } from '@/lib/oracle/native-tools';
import {
  PERM_LEVELS, TIER_LABEL, loadPermSettings, savePermSettings,
  DEFAULT_PERM_SETTINGS, type OraclePermSettings, type PermTier,
} from '@/lib/oracle/permissions';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Sparkles, X, ScrollText, ChartLine, Eye, SendHorizontal, Eraser, BrainCircuit,
  Scale, Search, Zap, Square, Trash2, Cpu, FlaskConical, Crown, Swords, CloudLightning, Database,
  Shield, ShieldAlert, Lock, LockOpen, CheckCircle2, Ban,
} from 'lucide-react';

// ---------------- 基础常量 ----------------

// dsh 桥动作行前缀（server.mjs bridgeLine action-request 恒定前缀）：
// 每个 {r} 事件恰为一行——OraclePanel 逐行解析后经 executeOracleTool 在活引擎上真执行
const DSH_ACTION_MARK = '[bridge] 动作待执行 ';

const MODE_ICON: Record<OracleMode, typeof ScrollText> = {
  narrate: ScrollText,
  analyze: ChartLine,
  prophesy: Eye,
  create: FlaskConical,
  ask: SendHorizontal,
};

const MODE_BADGE: Record<OracleMode, string> = {
  narrate: 'border-amber-400/50 bg-amber-400/10 text-amber-300',
  analyze: 'border-teal-400/50 bg-teal-400/10 text-teal-300',
  prophesy: 'border-violet-400/50 bg-violet-400/10 text-violet-300',
  create: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300',
  ask: 'border-zinc-500/60 bg-zinc-700/40 text-zinc-300',
};

const MODE_LABEL: Record<OracleMode, string> = {
  narrate: '史官纪事',
  analyze: '局势研判',
  prophesy: '神谕预言',
  create: '造物主',
  ask: '问答',
};

const MODE_HINT: Record<OracleMode, string> = {
  narrate: '调取实况写编年史',
  analyze: '列国战力与走向',
  prophesy: '三条先知预言',
  create: '创造物种/武器/神物并永久铭刻图鉴',
  ask: '自由发问',
};

/** 模式按钮的预设指令文案（点击即发起 agent 会话）；create 模式默认领一个「自由创造」开放指令 */
const MODE_PROMPT: Record<'narrate' | 'analyze' | 'prophesy' | 'create', string> = {
  narrate: '请以史官口吻，调取工具获取世界实况后，把近期纪事写成编年史',
  analyze: '请研判当前局势：调取列国与战争数据，给出国力对比与走向',
  prophesy: '请以先知口吻给出恰好 3 条预言（至少一条崛起一条危机），须基于工具实况',
  create: '进入造物主模式：先 list_creations 查看我的永久图鉴，然后自由创造——一个有叙事张力的新物种（spawn_species 降临 + save_creation pin 铭刻）、或一件神铸武器、或一件神物，并为它写一段神话背景',
};

const SEASONS = ['春', '夏', '秋', '冬'] as const;

// ---------------- 厂商预设 ----------------

interface ProviderPreset {
  key: string;
  label: string;
  config: OracleProviderConfig;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  { key: 'builtin', label: '内置 Z.ai', config: { kind: 'builtin', label: '内置 Z.ai' } },
  { key: 'openai', label: 'OpenAI', config: { kind: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' } },
  { key: 'deepseek', label: 'DeepSeek', config: { kind: 'openai', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' } },
  { key: 'kimi', label: 'Kimi', config: { kind: 'openai', label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-128k' } },
  { key: 'qwen', label: '通义千问', config: { kind: 'openai', label: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' } },
  { key: 'glm', label: '智谱GLM·需中继', config: { kind: 'openai', label: '智谱GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.6' } },
  { key: 'openrouter', label: 'OpenRouter', config: { kind: 'openai', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' } },
  { key: 'ollama', label: 'Ollama 本地', config: { kind: 'openai', label: 'Ollama 本地', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1' } },
  { key: 'anthropic', label: 'Anthropic', config: { kind: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-5-5' } },
  { key: 'gemini-flash', label: 'Gemini Flash', config: { kind: 'gemini', label: 'Gemini Flash', baseUrl: '', model: 'gemini-3.8-flash' } },
  { key: 'gemini-argon', label: 'Gemini Argon', config: { kind: 'gemini', label: 'Gemini Argon', baseUrl: '', model: 'gemini-4-argon' } },
  { key: 'custom', label: '自定义', config: { kind: 'openai', label: '自定义（OpenAI 兼容）', baseUrl: '', model: '' } },
  { key: 'local-qwen05b', label: '本地 Qwen-0.5B', config: { kind: 'local', label: '本地 Qwen-0.5B', model: 'XENova/qwen2.5-0.5b-instruct', temperature: 0.7 } },
];

const PROVIDER_STORE_KEY = 'oracle-provider-v1';
const DEFAULT_PROVIDER: OracleProviderConfig = { kind: 'builtin', label: '内置 Z.ai' };

/** 从 localStorage 恢复 provider 配置（防御式：坏 JSON / 非法 kind 一律回默认） */
function loadProvider(): OracleProviderConfig {
  try {
    const raw = localStorage.getItem(PROVIDER_STORE_KEY);
    if (!raw) return DEFAULT_PROVIDER;
    const p = JSON.parse(raw) as OracleProviderConfig;
    if (p && (p.kind === 'builtin' || p.kind === 'openai' || p.kind === 'anthropic' || p.kind === 'gemini' || p.kind === 'local')) {
      return { kind: p.kind as ProviderKind, label: p.label, baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model, temperature: p.temperature, forceCpu: p.forceCpu, relayUrl: p.relayUrl };
    }
  } catch {
    /* 坏存档回默认 */
  }
  return DEFAULT_PROVIDER;
}

/** 当前配置命中的预设 key（用于预设网格高亮） */
function matchPresetKey(p: OracleProviderConfig): string {
  if (p.kind === 'builtin') return 'builtin';
  if (p.kind === 'anthropic') return 'anthropic';
  if (p.kind === 'gemini') {
    return p.model?.includes('argon') ? 'gemini-argon' : p.model?.trim() ? 'gemini-flash' : 'custom';
  }
  if (p.kind === 'local') {
    for (const pre of PROVIDER_PRESETS) {
      if (pre.key !== 'custom' && pre.config.kind === 'local' && pre.config.model === p.model) return pre.key;
    }
    return 'custom';
  }
  for (const pre of PROVIDER_PRESETS) {
    if (pre.key !== 'custom' && pre.config.kind === 'openai' && p.baseUrl && pre.config.baseUrl === p.baseUrl) return pre.key;
  }
  return 'custom';
}

// ---------------- 工具卡片 ----------------

/** 工具三分类：查询（teal）/ 行动（rose）/ 法则（fuchsia） */
function toolCategory(name: string): 'query' | 'act' | 'law' {
  if (name === 'create_law' || name === 'manage_agent_laws' || name === 'update_law') return 'law';
  if (name === 'find_units' || name === 'search_units' || name === 'get_introspection') return 'query';
  if (name.startsWith('get_')) return 'query';
  return 'act';
}

const TOOL_ICON = { query: Search, act: Zap, law: Scale } as const;
const TOOL_COLOR = { query: 'text-teal-400', act: 'text-rose-400', law: 'text-fuchsia-400' } as const;

/** 工具卡片数据（历史消息与实时流共用；ok=null 表示执行中） */
interface ToolCardData {
  name: string;
  args: unknown;
  ok: boolean | null;
  summary: string;
}

function ToolCard({ name, args, ok, summary }: ToolCardData) {
  const cat = toolCategory(name);
  const Icon = TOOL_ICON[cat];
  let argsJson = '';
  try {
    argsJson = JSON.stringify(args) ?? '';
  } catch {
    argsJson = String(args);
  }
  return (
    <div
      title={argsJson}
      className="flex min-w-0 items-center gap-1 rounded-sm border border-zinc-700/70 bg-zinc-800/60 px-1.5 py-0.5 transition-colors hover:border-zinc-500"
    >
      <Icon className={`h-3 w-3 shrink-0 ${TOOL_COLOR[cat]}`} aria-hidden />
      <span className="shrink-0 font-mono text-[10px] font-bold text-zinc-300">{name}</span>
      {ok === true && <span className="shrink-0 text-[10px] font-bold text-emerald-400" aria-label="执行成功">✓</span>}
      {ok === false && <span className="shrink-0 text-[10px] font-bold text-red-400" aria-label="执行失败">✗</span>}
      {ok === null && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-300" aria-label="执行中" aria-hidden />}
      {summary && <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-zinc-500">{summary}</span>}
    </div>
  );
}

/** 一组工具卡片（神谕气泡上方） */
function ToolCards({ tools }: { tools: ToolCardData[] }) {
  if (!tools.length) return null;
  return (
    <div className="ml-1 flex w-full max-w-[92%] flex-col gap-1">
      {tools.map((t, i) => (
        <ToolCard key={`${t.name}-${i}`} {...t} />
      ))}
    </div>
  );
}

// ---------------- markdown 神谕石板渲染 ----------------

/** 递归提取 React 子节点的纯文本（td 数字右对齐判定用） */
function childText(c: unknown): string {
  if (c == null || typeof c === 'boolean') return '';
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.map(childText).join('');
  if (typeof c === 'object' && 'props' in (c as Record<string, unknown>)) {
    return childText((c as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

/** 纯数字单元格（如 1234 / 45% / -1.5）→ mono 右对齐 */
function isNumericCell(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 12 && /^[-+]?[\d.,]+%?$/.test(t);
}

/** 专门化的石板风格组件映射（深色像素风：琥珀小节题/石板表格/teal 行内码；禁 indigo/blue） */
const MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <p className="mt-2 flex items-start gap-1 text-[11px] font-bold tracking-wider text-amber-300">
      <span className="shrink-0 text-amber-400" aria-hidden>▸</span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  ),
  h2: ({ children }) => (
    <p className="mt-2 flex items-start gap-1 text-[11px] font-bold tracking-wider text-amber-300">
      <span className="shrink-0 text-amber-400" aria-hidden>▸</span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  ),
  h3: ({ children }) => (
    <p className="mt-2 flex items-start gap-1 text-[11px] font-bold tracking-wider text-amber-300">
      <span className="shrink-0 text-amber-400" aria-hidden>▸</span>
      <span className="min-w-0 break-words">{children}</span>
    </p>
  ),
  p: ({ children }) => <p className="mt-1 text-[11px] leading-relaxed break-words text-zinc-100 first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-1 list-disc space-y-0.5 pl-4 marker:text-amber-400/70">{children}</ul>,
  ol: ({ children }) => <ol className="mt-1 list-decimal space-y-0.5 pl-4 marker:text-amber-400/70">{children}</ol>,
  li: ({ children }) => <li className="text-[11px] leading-relaxed break-words text-zinc-100">{children}</li>,
  table: ({ children }) => (
    <div className="my-1 w-full overflow-x-auto">
      <table className="w-full border-collapse text-[10px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-zinc-700 bg-amber-400/85 px-1 py-0.5 text-left align-top font-bold break-words text-zinc-900">{children}</th>
  ),
  td: ({ children }) => {
    const numeric = isNumericCell(childText(children));
    return (
      <td className={`border border-zinc-700 px-1 py-0.5 align-top break-words text-zinc-300 ${numeric ? 'text-right font-mono tabular-nums' : ''}`}>
        {children}
      </td>
    );
  },
  code: ({ className, children }) => {
    const block = (className && className.includes('language-')) || childText(children).includes('\n');
    if (block) return <code className="font-mono text-[10px] text-zinc-300">{children}</code>;
    return <code className="rounded-sm border border-zinc-700 bg-zinc-800 px-1 font-mono text-[10px] break-words text-teal-300">{children}</code>;
  },
  pre: ({ children }) => (
    <pre className="mt-1 overflow-x-auto border-2 border-zinc-700 bg-zinc-900 p-2 font-mono text-[10px] leading-relaxed text-zinc-300">{children}</pre>
  ),
  strong: ({ children }) => <strong className="font-bold text-amber-200">{children}</strong>,
  blockquote: ({ children }) => <blockquote className="mt-1 border-l-2 border-amber-500/50 pl-2 [&_p]:text-zinc-400">{children}</blockquote>,
  hr: () => <hr className="my-2 border-zinc-700" />,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-[11px] break-all text-amber-300 underline underline-offset-2">
      {children}
    </a>
  ),
  del: ({ children }) => <del className="text-zinc-500">{children}</del>,
  img: ({ alt }) => <span className="rounded-sm border border-zinc-700 bg-zinc-800 px-1 font-mono text-[9px] text-zinc-500">[图 {alt || '图片'}]</span>,
};

function OracleMarkdown({ text }: { text: string }) {
  return (
    <div className="min-w-0">
      <Markdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}

// ---------------- 气泡 ----------------

/** 造物主气泡（右，石色，纯文本） */
function UserBubble({ text, mode }: { text: string; mode: OracleMode }) {
  const Icon = MODE_ICON[mode];
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-sm border-2 border-zinc-600/80 bg-zinc-700/50 px-2.5 py-1.5">
        <p className="flex items-center justify-end gap-1 text-[9px] font-bold tracking-wider text-zinc-400 uppercase">
          造物主
          <span className={`inline-flex shrink-0 items-center gap-0.5 rounded-sm border px-1 py-px ${MODE_BADGE[mode]}`}>
            <Icon className="h-2.5 w-2.5" aria-hidden />
            {MODE_LABEL[mode]}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed break-words whitespace-pre-wrap text-zinc-200">{text}</p>
      </div>
    </div>
  );
}

/** 神谕气泡（左，琥珀描边，markdown 石板 + 上方工具卡片组） */
function OracleBubble({ msg }: { msg: OracleMsg }) {
  const Icon = MODE_ICON[msg.mode];
  return (
    <div className="flex flex-col items-start gap-1">
      {msg.tools && msg.tools.length > 0 && <ToolCards tools={msg.tools} />}
      <div className="max-w-[92%] rounded-sm border-2 border-amber-500/25 bg-zinc-800/70 px-2.5 py-1.5 shadow-[0_2px_0_rgba(0,0,0,0.4)]">
        <p className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-amber-300/90 uppercase">
          <Sparkles className="h-2.5 w-2.5" aria-hidden />
          神谕
          <span className={`ml-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-sm border px-1 py-px ${MODE_BADGE[msg.mode]}`}>
            <Icon className="h-2.5 w-2.5" aria-hidden />
            {MODE_LABEL[msg.mode]}
          </span>
        </p>
        <div className="mt-0.5">
          <OracleMarkdown text={msg.text} />
        </div>
      </div>
    </div>
  );
}

// ---------------- 实时流（agent 循环阶段展示） ----------------

interface LiveToolCard extends ToolCardData {
  ok: boolean | null;
}

interface LiveState {
  /** gaze=凝视世界 / invoke=调动神力 / whisper=低语中 */
  phase: 'gaze' | 'invoke' | 'whisper';
  /** invoke 阶段正在执行的工具名（顿号连接） */
  invoking: string;
  text: string;
  reason: string;
  tools: LiveToolCard[];
  mode: OracleMode;
}

/** 工具结果摘要（实时卡片用，紧凑截断） */
function briefResult(r: AgentToolResult): string {
  if (!r.ok) return `✗ ${r.error ?? '执行失败'}`;
  try {
    const s = JSON.stringify(r.data);
    return s.length > 90 ? `${s.slice(0, 90)}…` : s;
  } catch {
    return '✓';
  }
}

function LiveBubble({ live }: { live: LiveState }) {
  const phaseText =
    live.phase === 'gaze' ? '凝视世界…' : live.phase === 'invoke' ? `调动神力：${live.invoking}…` : '低语中…';
  return (
    <div className="flex flex-col items-start gap-1" aria-live="polite">
      {live.tools.length > 0 && <ToolCards tools={live.tools} />}
      <div className="max-w-[92%] rounded-sm border-2 border-amber-500/25 bg-zinc-800/70 px-2.5 py-1.5 shadow-[0_2px_0_rgba(0,0,0,0.4)]">
        <p className="flex items-center gap-1 text-[9px] font-bold tracking-wider text-amber-300/90 uppercase">
          <Sparkles className="h-2.5 w-2.5 animate-pulse" aria-hidden />
          神谕
          <span className={`ml-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-sm border px-1 py-px ${MODE_BADGE[live.mode]}`}>
            {MODE_LABEL[live.mode]}
          </span>
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" aria-hidden />
        </p>
        {live.reason && (
          <div
            className="mt-1 max-h-24 overflow-y-auto rounded-sm border border-violet-400/20 bg-violet-400/5 px-1.5 py-1"
            style={{ scrollbarWidth: 'thin' }}
          >
            <p className="text-[9px] leading-relaxed break-words text-violet-300/60">{live.reason.slice(-400)}</p>
          </div>
        )}
        {live.text ? (
          <p className="mt-0.5 text-[11px] leading-relaxed break-words whitespace-pre-wrap text-zinc-100">
            {live.text}
            <span className="ml-0.5 inline-block h-3 w-[5px] animate-pulse bg-amber-300/80 align-middle" aria-hidden />
          </p>
        ) : (
          <p className="mt-1 flex min-w-0 items-center gap-1 text-[10px] font-bold text-zinc-400">
            {live.phase === 'invoke' ? (
              <Zap className="h-3 w-3 shrink-0 animate-pulse text-rose-400" aria-hidden />
            ) : (
              <Sparkles className="h-3 w-3 shrink-0 animate-pulse text-amber-300" aria-hidden />
            )}
            <span className="min-w-0 truncate">{phaseText}</span>
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------- 空状态引导 ----------------

function Empty({ onPick }: { onPick: (m: 'narrate' | 'analyze' | 'prophesy' | 'create' | 'ask', question?: string) => void }) {
  /** 开发者级快捷指令（演示神谕的真实操作力；v5 全新造物范式——禁模板） */
  const DEV_TASKS: { icon: typeof Sparkles; label: string; prompt: string }[] = [
    {
      icon: FlaskConical,
      label: '铸生灵',
      prompt: '从零设计一个全新物种「霜骸」：熊形体形、双角背棘荧光、冷色血统，hp 680/攻 42/寿 300 年，捕食者且敌视文明，降临 3 只并 save_creation pin 入图鉴上放置面板，为它写一段起源神话',
    },
    {
      icon: Crown,
      label: '铸一国',
      prompt: '创建一个兽人王国，让它向当前人口最多的人类国家宣战，然后报告战况',
    },
    {
      icon: Swords,
      label: '造英雄',
      prompt: '找到击杀数最高的单位，赐名「界域之刃」，把它的生命上限与攻击力拉到当前三倍，并跟随镜头锁定它',
    },
    {
      icon: CloudLightning,
      label: '大审判',
      prompt: '在相机中心投下一颗核弹（nuke，威力最大），然后用 get_tile 报告当地的辐射与死伤',
    },
  ];
  return (
    <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-fuchsia-400/40 bg-fuchsia-400/10">
        <Sparkles className="h-5 w-5 text-fuchsia-300" aria-hidden />
      </div>
      <p className="text-[11px] font-bold text-zinc-200">唤醒神谕 Agent</p>
      <p className="max-w-[30ch] text-[10px] leading-relaxed text-zinc-500">
        我原生于这个世界的底层机制，层层向上直至像素——{AGENT_TOOLS.length} 项工具、七层权柄，从一格里地块到一个新机制，皆听凭差遣。
      </p>
      <div className="mt-1 grid w-full grid-cols-3 gap-1.5">
        {(['narrate', 'analyze', 'prophesy'] as const).map((m) => {
          const Icon = MODE_ICON[m];
          return (
            <button
              key={m}
              type="button"
              onClick={() => onPick(m)}
              title={MODE_HINT[m]}
              aria-label={MODE_LABEL[m]}
              className="flex min-w-0 flex-col items-center gap-1 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/50 px-1 py-2 transition-colors hover:border-amber-400/50 hover:bg-amber-400/10"
            >
              <Icon className="h-4 w-4 shrink-0 text-amber-300/90" aria-hidden />
              <span className="w-full truncate text-center text-[10px] font-bold text-zinc-300">{MODE_LABEL[m]}</span>
            </button>
          );
        })}
      </div>
      {/* 造物主模式：独立大入口（创造 + 图鉴闭环） */}
      <button
        type="button"
        onClick={() => onPick('create')}
        title={MODE_HINT.create}
        className="mt-1.5 flex w-full items-center gap-2 rounded-sm border-2 border-emerald-500/50 bg-emerald-500/10 px-2.5 py-2 transition-colors hover:border-emerald-400 hover:bg-emerald-400/20"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-emerald-400/50 bg-emerald-400/15">
          <FlaskConical className="h-4 w-4 text-emerald-300" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col items-start">
          <span className="text-[11px] font-bold tracking-wide text-emerald-300">造物主模式</span>
          <span className="w-full truncate text-left text-[9px] text-zinc-500">创造物种/武器/神物 · 永久图鉴 · 可唤醒再编辑</span>
        </span>
      </button>
      <div className="mt-1 w-full border-t-2 border-zinc-800 pt-2">
        <p className="mb-1.5 text-[9px] font-bold tracking-widest text-fuchsia-300/80 uppercase">开发者级指令</p>
        <div className="grid w-full grid-cols-2 gap-1.5">
          {DEV_TASKS.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => onPick('ask', t.prompt)}
              title={t.prompt}
              className="flex min-w-0 items-center gap-1.5 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/50 px-1.5 py-1.5 text-left transition-colors hover:border-fuchsia-400/50 hover:bg-fuchsia-400/10"
            >
              <t.icon className="h-3.5 w-3.5 shrink-0 text-fuchsia-300/90" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-zinc-300">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------- 厂商配置 Popover ----------------

function ProviderConfig({ provider, onApply }: { provider: OracleProviderConfig; onApply: (p: OracleProviderConfig) => void }) {
  const [test, setTest] = useState<{ state: 'idle' | 'testing' | 'ok' | 'fail'; msg?: string }>({ state: 'idle' });
  const activeKey = matchPresetKey(provider);
  const isBuiltin = provider.kind === 'builtin';
  const isLocal = provider.kind === 'local';
  // v0.83 防坑警示：GLM 端点不支持浏览器 CORS——选中且未配中继时给显眼提示（用户实测高频掉坑点）
  const needsRelayWarn = provider.kind === 'openai' && (provider.baseUrl ?? '').includes('bigmodel.cn') && !provider.relayUrl?.trim();

  /** 测试连通：走 routeCallModel 全路由（中继→本站后端→浏览器直连），与真实对话完全同路径 */
  const runTest = useCallback(async () => {
    setTest({ state: 'testing' });
    const r = await runConnectivityTest(provider);
    setTest(r.ok ? { state: 'ok' } : { state: 'fail', msg: r.msg ?? '无响应' });
  }, [provider]);

  const inputCls =
    'h-6 w-full rounded-sm border-2 border-zinc-700 bg-zinc-800 px-1.5 font-mono text-[10px] text-zinc-100 placeholder:text-zinc-600 focus:border-amber-400/50 focus:outline-none';
  const labelCls = 'text-[9px] font-bold tracking-wider text-zinc-500 uppercase';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-bold tracking-wider text-zinc-300 uppercase">厂商接入</p>
      {/* 预设网格（单选） */}
      <div className="grid grid-cols-2 gap-1">
        {PROVIDER_PRESETS.map((pre) => {
          const active = activeKey === pre.key;
          return (
            <button
              key={pre.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (active) return; // 重复点击不清空已填密钥
                setTest({ state: 'idle' });
                onApply({
                  kind: pre.config.kind,
                  label: pre.config.label,
                  baseUrl: pre.config.baseUrl,
                  model: pre.config.model,
                  apiKey: '',
                  temperature: provider.temperature,
                  relayUrl: provider.relayUrl, // 中继后端跨预设保留（换厂商不必重填）
                });
              }}
              className={`min-w-0 truncate rounded-sm border-2 px-1 py-1 text-[9px] font-bold transition-colors ${
                active
                  ? 'border-amber-400/60 bg-amber-400/10 text-amber-200'
                  : 'border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              {pre.label}
            </button>
          );
        })}
      </div>

      {/* GLM 无中继警示（v0.83）：预设点选即提示，不等失败 */}
      {needsRelayWarn && (
        <p className="rounded-sm border border-red-400/40 bg-red-400/10 px-1.5 py-1 text-[9px] leading-relaxed text-red-300">
          智谱开放平台不支持浏览器直连（无 CORS 头，必报错）——请在下方「中继后端」填 oracle-server 地址
          （Sealos 一键部署，见仓库 oracle-server/README.md），否则无法使用；或改选 DeepSeek / Kimi / 通义千问。
        </p>
      )}

      {/* 端点配置（内置 Z.ai 免密钥，仅温度） */}
      {isBuiltin || isLocal ? (
        <p className="rounded-sm border border-teal-400/30 bg-teal-400/5 px-1.5 py-1 text-[9px] leading-relaxed text-teal-300/80">
          {isLocal
            ? '本地模型在浏览器端直接运行（transformers.js），无需服务端与密钥；首次使用会下载模型权重（约几百 MB），随后浏览器缓存离线可用。注意：需支持 WebAssembly 的系统浏览器（Safari/Chrome）；WPS/微信等内嵌浏览器可能不兼容，报初始化错误时请换系统浏览器打开。'
            : '内置 Z.ai 经后端直连，无需密钥；静态托管下需部署中继后端（见下）。'}
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>Base URL</span>
            <input
              value={provider.baseUrl ?? ''}
              onChange={(e) => onApply({ ...provider, baseUrl: e.target.value })}
              placeholder={
                provider.kind === 'gemini'
                  ? 'https://generativelanguage.googleapis.com（可留空）'
                  : provider.kind === 'anthropic'
                    ? 'https://api.anthropic.com'
                    : 'https://api.example.com/v1'
              }
              spellCheck={false}
              className={inputCls}
              aria-label="API Base URL"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>模型</span>
            <input
              value={provider.model ?? ''}
              onChange={(e) => onApply({ ...provider, model: e.target.value })}
              placeholder={
                provider.kind === 'gemini'
                  ? 'gemini-3.8-flash / gemini-4-argon / gemini-3.1-pro'
                  : provider.kind === 'anthropic'
                    ? 'claude-sonnet-5-5 / claude-opus-5-5'
                    : 'model-name'
              }
              spellCheck={false}
              className={inputCls}
              aria-label="模型名"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>API Key</span>
            <input
              type="password"
              value={provider.apiKey ?? ''}
              onChange={(e) => onApply({ ...provider, apiKey: e.target.value })}
              placeholder={provider.kind === 'gemini' ? 'AIza…（Google AI Studio 申请）' : 'sk-…'}
              spellCheck={false}
              autoComplete="off"
              className={inputCls}
              aria-label="API 密钥"
            />
          </label>
        </div>
      )}

      {/* 中继后端（corsDirect 直连 Sealos oracle-server；静态托管接入无 CORS 厂商端点与内置 Z.ai 的唯一通路） */}
      {!isLocal && (
        <label className="flex flex-col gap-0.5">
          <span className={labelCls}>中继后端（可选）</span>
          <input
            value={provider.relayUrl ?? ''}
            onChange={(e) => onApply({ ...provider, relayUrl: e.target.value || undefined })}
            placeholder="http://<sealos-host>:8787"
            spellCheck={false}
            className={inputCls}
            aria-label="中继后端地址"
          />
          <span className="text-[8px] leading-relaxed text-zinc-600">
            填入后所有云端请求改经该后端转发（内网网关可填 /api/oracle/agent?XTransformPort=8787）；留空则自动路由：本站后端 → 浏览器直连厂商。
          </span>
          {/* 大陆直连提示（时代深化/v7 原生接入适配）：三家大陆厂商浏览器直连；Anthropic/Gemini 官方支持浏览器 CORS（需可访问国际网络） */}
          <span className="mt-1 rounded-sm border border-teal-800/60 bg-teal-500/10 px-1.5 py-1 text-[8px] leading-relaxed text-teal-300">
            大陆直连：DeepSeek / Kimi / 通义千问三家的 API 支持浏览器 CORS——选择对应预设并填入 API Key 即可直连使用，无需中继后端与自定义域名（智谱 GLM 不支持 CORS 不在此列）。Anthropic（claude-sonnet-5-5 等）与 Google Gemini（gemini-3.8-flash / gemini-4-argon）官方端点同样支持浏览器直连与原生函数调用，但需可访问国际网络；大陆线路建议填中继后端转发（需新版 oracle-server）。
          </span>
        </label>
      )}

      <label className="flex flex-col gap-0.5">
        <span className={labelCls}>温度 Temperature（可选）</span>
        <input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={provider.temperature ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onApply({ ...provider, temperature: v === '' ? undefined : Number(v) });
          }}
          placeholder="默认（不下发）"
          className={inputCls}
          aria-label="采样温度"
        />
      </label>

      {/* 本地模型专用配置 */}
      {isLocal && (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>模型标识符</span>
            <input
              value={provider.model ?? ''}
              onChange={(e) => onApply({ ...provider, model: e.target.value || undefined })}
              placeholder="XENova/qwen2.5-0.5b-instruct"
              spellCheck={false}
              className={inputCls}
              aria-label="本地模型标识符"
            />
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={provider.forceCpu === true}
              onChange={(e) =>
                onApply({ ...provider, forceCpu: e.target.checked })
              }
              className="w-3 h-3 rounded border-zinc-600 bg-zinc-800 text-amber-400 focus:ring-amber-400"
            />
            <span className="text-[9px] text-zinc-300">
              强制 CPU（关闭 WebGPU，兼容性更好但更慢）
            </span>
          </label>
          <p className="rounded-sm border border-amber-400/30 bg-amber-400/5 px-1.5 py-1 text-[9px] leading-relaxed text-amber-300/80">
            推荐模型：Qwen2.5-0.5B-Instruct（0.5B 参数，4 位量化 ~350MB）。移动端首次加载需下载模型，建议 Wi-Fi 下进行；后续浏览器会缓存，离线可用。
          </p>
        </div>
      )}

      {/* 测试连通（仅云端厂商） */}
      {!isLocal && (
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void runTest()}
            disabled={test.state === 'testing'}
            aria-label="测试厂商连通性"
            className="h-6 min-w-0 flex-1 gap-1 rounded-sm border-2 border-teal-400/40 bg-teal-400/10 px-1 text-[10px] font-bold text-teal-300 transition-colors hover:bg-teal-400/20 hover:text-teal-200 disabled:opacity-40"
          >
            <FlaskConical className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">{test.state === 'testing' ? '测试中…' : '测试连通'}</span>
          </Button>
        {test.state === 'ok' && (
          <span className="shrink-0 rounded-sm border border-emerald-400/50 bg-emerald-400/10 px-1 py-0.5 text-[9px] font-bold text-emerald-300">
            ✓ 连通
          </span>
        )}
        {test.state === 'fail' && (
          <span
            className="min-w-0 max-w-[110px] shrink-0 truncate rounded-sm border border-red-400/50 bg-red-400/10 px-1 py-0.5 text-[9px] font-bold text-red-300"
            title={test.msg}
          >
            ✗ {test.msg ?? '失败'}
          </span>
        )}
      </div>
      )}

      <p className="text-[8px] leading-relaxed text-zinc-600">
        apiKey 仅存本浏览器 localStorage；云端请求按「中继后端 → 本站后端 → 浏览器直连」路由转发至厂商——不出现在日志与世界存档中。
      </p>
    </div>
  );
}

// ---------------- Agent 法则管理视图 ----------------

interface LawItem {
  id: string;
  name: string;
  desc: string;
  enabled: boolean;
  createdYear: number;
  durationYears: number | null;
  everyYears: number;
  chance: number;
  season: number | null;
  actions: string[];
  fired: number;
  /** v2：触发器三态 + 事件/条件明细 + 全局计数器 */
  triggerKind: 'cron' | 'event' | 'condition';
  event?: string;
  cond?: CondExpr | null;
  counters?: Record<string, number>;
}

/** 条件树 → 紧凑中文串（pop>600 / 且(pop>600, glacierArea<5)） */
function condText(c: CondExpr | null | undefined): string {
  if (!c) return '';
  switch (c.op) {
    case 'and':
    case 'or':
      return `${c.op === 'and' ? '且' : '或'}(${(c.sub ?? []).map(condText).join(', ')})`;
    case 'not':
      return `非(${condText(c.sub)})`;
    case 'gt':
    case 'lt':
    case 'gte':
    case 'lte':
    case 'eq': {
      const sym = c.op === 'gt' ? '>' : c.op === 'lt' ? '<' : c.op === 'gte' ? '≥' : c.op === 'lte' ? '≤' : '=';
      return `${c.stat}${sym}${c.value}`;
    }
  }
}

const TRIGGER_BADGE: Record<LawItem['triggerKind'], { label: string; cls: string }> = {
  cron: { label: '周期', cls: 'border-zinc-500/50 bg-zinc-600/30 text-zinc-300' },
  event: { label: '事件', cls: 'border-amber-400/40 bg-amber-400/10 text-amber-300' },
  condition: { label: '条件', cls: 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' },
};

const SEASON_BADGE = [
  'border-teal-400/40 bg-teal-400/10 text-teal-300',
  'border-amber-400/40 bg-amber-400/10 text-amber-300',
  'border-orange-400/40 bg-orange-400/10 text-orange-300',
  'border-violet-400/40 bg-violet-400/10 text-violet-300',
] as const;

function LawsView() {
  const [laws, setLaws] = useState<LawItem[] | null>(null);
  /** 即时刷新句柄（toggle/remove 后立刻拉取，不等 1s 轮询） */
  const pullRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const pull = () => {
      try {
        setLaws(
          getEngine()
            .agentLaws.list()
            .map((l) => ({ ...l, season: l.season ?? null })),
        );
      } catch {
        /* 引擎未就绪：保持上次快照 */
      }
    };
    pull();
    const t = window.setInterval(pull, 1000);
    pullRef.current = pull;
    return () => {
      window.clearInterval(t);
      pullRef.current = () => undefined;
    };
  }, []);

  return (
    <div
      className="game-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:max-h-[calc(100dvh-430px)]"
      style={{ scrollbarWidth: 'thin' }}
      aria-label="Agent 法则列表"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Scale className="h-3.5 w-3.5 shrink-0 text-fuchsia-300" aria-hidden />
        <p className="min-w-0 truncate text-[11px] font-bold tracking-wider text-zinc-200 uppercase">神谕机制 · 热插拔</p>
      </div>
      <p className="mb-2 text-[9px] text-zinc-500">触发器 × 条件 × 动作 DSL · 事件即时响应 · 周期/条件每 120 tick 结算</p>

      {laws !== null && laws.length > 0 && (() => {
        const ctrs = laws[0]?.counters ?? {};
        const entries = Object.entries(ctrs);
        return entries.length > 0 ? (
          <div className="mb-2 rounded-sm border-2 border-zinc-700/80 bg-zinc-800/50 px-2 py-1.5" aria-label="机制计数器">
            <p className="text-[8px] font-bold tracking-wider text-zinc-500 uppercase">计数器</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {entries.map(([k, v]) => (
                <span key={k} className="shrink-0 rounded-sm border border-cyan-400/30 bg-cyan-400/10 px-1 font-mono text-[8px] text-cyan-300">
                  {k}={v}
                </span>
              ))}
            </div>
          </div>
        ) : null;
      })()}

      {laws === null ? (
        <p className="px-1 py-4 text-center text-[10px] text-zinc-600">读取法则中…</p>
      ) : laws.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-2 py-6 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-sm border-2 border-fuchsia-400/30 bg-fuchsia-400/5">
            <Scale className="h-4 w-4 text-fuchsia-300/70" aria-hidden />
          </div>
          <p className="max-w-[30ch] text-[10px] leading-relaxed text-zinc-500">
            神谕尚未书写任何机制——让它为你热插拔一条（周期降陨石 / 王国覆灭时在废墟召唤巨龙 / 人口超阈时降饥荒）
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {laws.map((l) => (
            <div key={l.id} className="rounded-sm border-2 border-zinc-700/80 bg-zinc-800/50 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <Switch_ checked={l.enabled} id={l.id} name={l.name} onToggle={() => pullRef.current()} />
                <span className="min-w-0 flex-1 text-[11px] font-bold break-words text-zinc-200">{l.name}</span>
                <span className="shrink-0 font-mono text-[9px] text-zinc-600">{l.id}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    getEngine().agentLaws.remove(l.id);
                    pullRef.current();
                  }}
                  aria-label={`删除法则「${l.name}」`}
                  title="删除法则（param 修改自动还原）"
                  className="h-5 w-5 shrink-0 border-2 border-transparent text-zinc-600 hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-400"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                </Button>
              </div>
              <p className="mt-0.5 text-[9px] leading-snug break-words text-zinc-500">{l.desc}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span
                  className={`shrink-0 rounded-sm border px-1 text-[8px] font-bold ${TRIGGER_BADGE[l.triggerKind]?.cls ?? TRIGGER_BADGE.cron.cls}`}
                  title={
                    l.triggerKind === 'event'
                      ? `监听世界事件 ${l.event ?? '?'}（触发时动作缺省坐标 = 事件发生地）`
                      : l.triggerKind === 'condition'
                        ? '条件满足时触发（everyYears 为重触发冷却）'
                        : '周期触发'
                  }
                >
                  {TRIGGER_BADGE[l.triggerKind]?.label ?? '周期'}
                </span>
                {l.triggerKind === 'cron' && (
                  <>
                    <span className="shrink-0 rounded-sm border border-zinc-600/70 bg-zinc-700/40 px-1 text-[8px] font-bold text-zinc-400">
                      每 {l.everyYears} 年
                    </span>
                    <span className="shrink-0 rounded-sm border border-zinc-600/70 bg-zinc-700/40 px-1 text-[8px] font-bold text-zinc-400">
                      概率 {Math.round(l.chance * 100)}%
                    </span>
                    {l.season != null && (
                      <span
                        className={`shrink-0 rounded-sm border px-1 text-[8px] font-bold ${SEASON_BADGE[l.season] ?? SEASON_BADGE[0]}`}
                      >
                        {SEASONS[l.season] ?? '?'}季限定
                      </span>
                    )}
                  </>
                )}
                {l.triggerKind === 'event' && (
                  <span className="min-w-0 truncate rounded-sm border border-amber-400/30 bg-amber-400/5 px-1 font-mono text-[8px] text-amber-200/90">
                    on {l.event ?? '?'} · 冷却{l.everyYears}年
                  </span>
                )}
                {l.triggerKind === 'condition' && (
                  <span className="min-w-0 truncate rounded-sm border border-cyan-400/30 bg-cyan-400/5 px-1 font-mono text-[8px] text-cyan-200/90" title={condText(l.cond)}>
                    {condText(l.cond) || '（无条件）'}
                  </span>
                )}
                <span className="shrink-0 rounded-sm border border-zinc-600/70 bg-zinc-700/40 px-1 text-[8px] font-bold text-zinc-400">
                  已触发 {l.fired} 次
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {l.actions.map((k, i) => (
                  <span
                    key={`${l.id}-a${i}`}
                    className="shrink-0 rounded-sm border border-fuchsia-400/30 bg-fuchsia-400/10 px-1 font-mono text-[8px] text-fuchsia-300"
                  >
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 法则启用开关（像素风 mini switch） */
function Switch_({ checked, id, name, onToggle }: { checked: boolean; id: string; name: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={`${checked ? '停用' : '启用'}法则「${name}」`}
      title={checked ? '点击停用（param 修改自动还原）' : '点击启用'}
      onClick={() => {
        getEngine().agentLaws.toggle(id, !checked);
        onToggle();
      }}
      className={`relative h-4 w-8 shrink-0 rounded-full border-2 transition-colors ${
        checked ? 'border-amber-400/70 bg-amber-400/20' : 'border-zinc-600 bg-zinc-800'
      }`}
    >
      <span
        className={`absolute top-0 h-2.5 w-2.5 rounded-full transition-all ${
          checked ? 'left-[15px] bg-amber-300' : 'left-0 bg-zinc-500'
        }`}
        aria-hidden
      />
    </button>
  );
}

// ---------------- 权限中心（v5：把整个游戏当电脑的可调权限位） ----------------

/** 权限位阶颜色系（read→write→mech→ui→root 递进） */
const TIER_CLS: Record<PermTier, string> = {
  read: 'border-sky-400/50 bg-sky-400/10 text-sky-300',
  write: 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300',
  mech: 'border-fuchsia-400/50 bg-fuchsia-400/10 text-fuchsia-300',
  ui: 'border-violet-400/50 bg-violet-400/10 text-violet-300',
  root: 'border-red-400/60 bg-red-400/15 text-red-300',
};

const VERDICT_META: Record<string, { label: string; cls: string }> = {
  ok: { label: '✓', cls: 'text-emerald-400' },
  fail: { label: '✗', cls: 'text-red-400' },
  deny: { label: '权限拦截', cls: 'text-amber-400' },
  approve: { label: '已批准', cls: 'text-emerald-300' },
  reject: { label: '已拒绝', cls: 'text-red-300' },
};

/** 权限中心视图：五档等级滑选 + ROOT 解锁 + 位阶批准开关 + 行为审计流 */
function PermView({ perm, onChange }: { perm: OraclePermSettings; onChange: (p: OraclePermSettings) => void }) {
  const oracleAudit = useGameStore((s) => s.oracleAudit);
  const clearAudit = useGameStore((s) => s.clearOracleAudit);
  const autoApprove = useGameStore((s) => s.oracleAutoApprove);
  const setAutoApprove = useGameStore((s) => s.setOracleAutoApprove);

  const setLevel = (lv: number): void => {
    if (lv === 4 && !perm.rootAck) return; // ROOT 须先勾选解锁
    onChange({ ...perm, level: lv });
  };
  const toggleConfirm = (tier: PermTier): void => {
    const has = perm.confirm.includes(tier);
    onChange({ ...perm, confirm: has ? perm.confirm.filter((t) => t !== tier) : [...perm.confirm, tier] });
  };

  return (
    <div className="game-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-2 py-2 sm:max-h-[calc(100dvh-430px)]" style={{ scrollbarWidth: 'thin' }}>
      {/* 等级选择：把整个游戏当电脑——五档权限 */}
      <section aria-label="权限等级">
        <h3 className="mb-1 text-[10px] font-black tracking-wider text-amber-300">权限等级（把游戏当作一台电脑）</h3>
        <div className="space-y-1">
          {PERM_LEVELS.map((lv) => {
            const active = perm.level === lv.level;
            const locked = lv.level === 4 && !perm.rootAck;
            return (
              <button
                key={lv.level}
                type="button"
                onClick={() => setLevel(lv.level)}
                disabled={locked}
                aria-pressed={active}
                title={lv.desc}
                className={`flex w-full items-start gap-1.5 rounded-sm border-2 px-1.5 py-1 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? 'border-amber-400/70 bg-amber-400/15'
                    : 'border-zinc-700/60 bg-zinc-800/40 hover:border-amber-400/40 hover:bg-zinc-800'
                }`}
              >
                <span className={`mt-px shrink-0 rounded-sm border px-1 text-[9px] font-black ${lv.level === 4 ? 'border-red-400/60 bg-red-400/10 text-red-300' : 'border-zinc-600 bg-zinc-700/40 text-zinc-300'}`}>
                  L{lv.level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[10px] font-bold ${active ? 'text-amber-200' : 'text-zinc-300'}`}>
                    {lv.name}{locked ? '（未解锁）' : ''}
                  </span>
                  <span className="block text-[9px] leading-snug text-zinc-500">{lv.desc}</span>
                </span>
                {lv.level === 4 && perm.rootAck && <LockOpen className="h-3 w-3 shrink-0 text-red-300" aria-label="ROOT 已解锁" />}
                {locked && <Lock className="h-3 w-3 shrink-0 text-zinc-500" aria-label="ROOT 未解锁" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* ROOT 解锁与批准开关 */}
      <section aria-label="ROOT 解锁与批准策略" className="space-y-1.5">
        <h3 className="text-[10px] font-black tracking-wider text-amber-300">ROOT 与批准策略</h3>
        <button
          type="button"
          onClick={() => onChange({ ...perm, rootAck: !perm.rootAck, level: !perm.rootAck ? 4 : Math.min(perm.level, 3) })}
          aria-pressed={perm.rootAck}
          className={`flex w-full items-start gap-1.5 rounded-sm border-2 px-1.5 py-1 text-left transition-colors ${
            perm.rootAck
              ? 'border-red-400/60 bg-red-400/15'
              : 'border-zinc-700/60 bg-zinc-800/40 hover:border-red-400/40'
          }`}
        >
          <ShieldAlert className={`mt-px h-3.5 w-3.5 shrink-0 ${perm.rootAck ? 'text-red-300' : 'text-zinc-500'}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className={`block text-[10px] font-bold ${perm.rootAck ? 'text-red-200' : 'text-zinc-300'}`}>
              {perm.rootAck ? 'ROOT 已解锁' : '解锁 ROOT 根权限'}
            </span>
            <span className="block text-[9px] leading-snug text-zinc-500">
              神谕获得 run_script 根壳：任意 JavaScript 直写引擎内核（创造无工具覆盖的新机制/实时改写游戏规则）。
              关闭即收回。根壳禁浏览器外联（fetch/localStorage 等），同步死循环会被拒绝，但大计算仍可能卡顿页面——请自行斟酌。
            </span>
          </span>
        </button>
        <div className="rounded-sm border-2 border-zinc-700/60 bg-zinc-800/40 px-1.5 py-1">
          <p className="text-[9px] font-bold text-zinc-400">执行前须经我批准的位阶：</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {(['read', 'write', 'mech', 'ui', 'root'] as const).map((tier) => {
              const on = perm.confirm.includes(tier);
              const unlocked = PERM_LEVELS[perm.level].tiers.includes(tier) && (tier !== 'root' || perm.rootAck);
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => toggleConfirm(tier)}
                  aria-pressed={on}
                  disabled={!unlocked}
                  title={on ? `点击取消「${TIER_LABEL[tier]}」逐次批准` : `点击开启「${TIER_LABEL[tier]}」逐次批准`}
                  className={`rounded-sm border-2 px-1.5 py-0.5 text-[9px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    on ? TIER_CLS[tier] : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'
                  }`}
                >
                  {TIER_LABEL[tier]}·{on ? '批准' : '自动'}
                </button>
              );
            })}
          </div>
          <label className="mt-1.5 flex cursor-pointer items-center gap-1 text-[9px] text-zinc-400">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} className="h-3 w-3 accent-amber-400" />
            本回合免确认（agent 任务全程放行待批准位阶；回合结束自动复位）
          </label>
        </div>
      </section>

      {/* 行为审计流 */}
      <section aria-label="神谕行为审计">
        <div className="mb-1 flex items-center gap-1.5">
          <h3 className="text-[10px] font-black tracking-wider text-amber-300">行为审计</h3>
          <span className="rounded-sm border border-zinc-600 bg-zinc-800 px-1 text-[9px] font-bold text-zinc-400">{oracleAudit.length}</span>
          {oracleAudit.length > 0 && (
            <Button
              variant="ghost" size="sm"
              onClick={clearAudit}
              aria-label="清空审计流"
              className="ml-auto h-5 gap-1 rounded-sm border-2 border-transparent px-1 text-[9px] font-bold text-zinc-500 hover:text-zinc-200"
            >
              <Eraser className="h-3 w-3" aria-hidden /> 清空
            </Button>
          )}
        </div>
        {oracleAudit.length === 0 ? (
          <p className="rounded-sm border-2 border-dashed border-zinc-700/60 px-2 py-2 text-center text-[9px] text-zinc-500">
            神谕每次工具调用的权限判定与结果都会记录在此
          </p>
        ) : (
          <ul className="space-y-1">
            {oracleAudit.slice(-30).reverse().map((e, i) => (
              <li key={`${e.ts}-${i}`} className="flex items-center gap-1 rounded-sm border-2 border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5">
                <span className="shrink-0 font-mono text-[8px] text-zinc-600">{new Date(e.ts).toISOString().slice(11, 19)}</span>
                <span className={`shrink-0 rounded-sm border px-1 text-[8px] font-bold ${TIER_CLS[e.tier]}`}>{TIER_LABEL[e.tier]}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-zinc-300">{e.name}</span>
                <span className={`shrink-0 text-[8px] font-bold ${VERDICT_META[e.verdict]?.cls ?? 'text-zinc-400'}`}>{VERDICT_META[e.verdict]?.label ?? e.verdict}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------- 面板主体 ----------------

function OracleBody() {
  const { oracleMsgs, oracleBusy, addOracleMsg, clearOracle, setOracleBusy } = useGameStore();
  /** 权限审批队列（v5：位阶开启「执行前批准」时挂起等待——审批条渲染源） */
  const oracleApproval = useGameStore((s) => s.oracleApproval);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** 深度思考开关（UI 状态保留：agent 循环当前固定 deep:false，厂商侧 reasoning 流已就绪） */
  const [deep, setDeep] = useState(false);
  /** 视图切换：chat=会话流 / laws=Agent 法则管理 / perm=权限中心 */
  const [view, setView] = useState<'chat' | 'laws' | 'perm'>('chat');
  /** 当前厂商配置（localStorage 'oracle-provider-v1' 持久化） */
  const [provider, setProvider] = useState<OracleProviderConfig>(DEFAULT_PROVIDER);
  const [cfgOpen, setCfgOpen] = useState(false);
  /** dsh 持久会话面（M-O4 相三前端接线，localStorage 持久化）：中继后端专属——服务端权威历史 */
  const [dshOn, setDshOn] = useState(false);
  /** 神谕权限设置（v5：五档可调 + 位阶批准开关 + ROOT 解锁；localStorage 'oracle-perm-v5'） */
  const [perm, setPerm] = useState<OraclePermSettings>(DEFAULT_PERM_SETTINGS);
  useEffect(() => {
    setPerm(loadPermSettings());
  }, []);
  /** 持久会话 id（localStorage 恢复 → 切后台/刷新续跑的服务端历史锚点） */
  const [sessionId, setSessionId] = useState('');
  /** agent 运行中的实时流（阶段/工具卡/思考流/逐 token 正文） */
  const [live, setLive] = useState<LiveState | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 恢复持久化的厂商配置与 dsh 会话面
  useEffect(() => {
    setProvider(loadProvider());
    setDshOn(loadDshOn());
    setSessionId(loadOrCreateSessionId());
  }, []);

  /** 切换 dsh 持久会话面并持久化 */
  const toggleDsh = useCallback((next: boolean) => {
    setDshOn(next);
    storeDshOn(next);
  }, []);

  /** 清空会话 = 气泡清空 + sessionId 轮换（重开会话；旧会话在服务端留档可回放） */
  const handleClear = useCallback(() => {
    clearOracle();
    setSessionId(rotateSessionId());
  }, [clearOracle]);

  /** 更新并持久化厂商配置 */
  const applyProvider = useCallback((next: OracleProviderConfig) => {
    setProvider(next);
    try {
      localStorage.setItem(PROVIDER_STORE_KEY, JSON.stringify(next));
    } catch {
      /* 存储配额/隐私模式：内存态仍生效 */
    }
  }, []);

  // 新消息 / 流式增量 / 视图切换时滚到底部
  useEffect(() => {
    if (view !== 'chat') return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [oracleMsgs.length, oracleBusy, live?.text, live?.reason, live?.tools.length, view]);

  /** 核心：组装 agent 会话历史 → runOracleAgentTurn 多轮工具循环（活引擎执行） */
  const askAgent = useCallback(
    async (mode: OracleMode, question?: string) => {
      const st = useGameStore.getState();
      if (st.oracleBusy) return;
      const preset = MODE_PROMPT[mode as keyof typeof MODE_PROMPT];
      const userText = (question ?? '').trim() || preset;
      if (!userText) return;
      // v6 预检：配置缺失就地拦截（custom 空字段不再走到发送后才报错/误报离线）
      const verr = validateProviderConfig(provider);
      if (verr) {
        setError(verr);
        setCfgOpen(true); // 直接打开厂商接入引导补全
        return;
      }
      // dsh 持久会话面非静默守卫：该面仅存在于中继后端（oracle-server）——无中继时给出可行动引导，
      // 绝不静默降级为无状态直连（那会让用户误以为历史已持久）
      if (dshOn && !provider.relayUrl?.trim()) {
        setError('dsh 持久会话需要中继后端：请在「厂商接入 → 中继后端」填 oracle-server 地址，或关闭「持久」开关回默认面');
        setCfgOpen(true);
        return;
      }
      // 历史快照须在 addOracleMsg 之前取（否则本轮 user 消息会重复入列）
      // v3：历史压缩带工具回执摘要——模型跨轮记得自己干过什么，复合任务可续接
      // dsh 持久会话面：历史由服务端事件日志权威投影，前端不组历史（仅发本回合 user）
      const history: AgentChatMessage[] = dshOn
        ? []
        : [
            { role: 'assistant', content: buildSystemPrompt(renderToolCatalog(), { native: false, perm }) },
            ...st.oracleMsgs.slice(-8).map((m): AgentChatMessage => ({
              role: m.role === 'user' ? 'user' : 'assistant',
              content:
                m.role === 'oracle' && m.tools?.length
                  ? `${m.text}\n（系统记忆标注，供你回顾上一轮操作，勿在回答中复述：${m.tools.map((t) => `${t.name}${t.ok ? '✓' : '✗'}`).join(' ')}）`
                  : m.text,
            })),
            { role: 'user', content: userText },
          ];
      addOracleMsg({ role: 'user', text: userText, mode });
      setView('chat');
      setOracleBusy(true);
      setError(null);
      setLive({ phase: 'gaze', invoking: '', text: '', reason: '', tools: [], mode });
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        // dsh 持久会话面（中继专属）：单回合直发——服务端权威历史 + 服务端工具轮；
        // 默认面：客户端多轮工具循环（活引擎零延迟执行）
        const sid = sessionId || loadOrCreateSessionId();
        if (sid !== sessionId) setSessionId(sid);
        // 挂账②：dsh 面每回合喂世界快照（wb_world_digest/wb_query_chronicle 真实数据源，
        // 仅文本叙事 digest≤1200 字+纪事≤8 行，禁 dump 结构化对象）；引擎未就绪则省略（服务端工具回未接入引导）
        const eng = getEngine();
        let snapshot: DshSnapshot | undefined;
        if (eng) {
          const dg = executeOracleTool(eng, 'get_world_digest', {});
          const ev = executeOracleTool(eng, 'get_events', { limit: 8 });
          const chronicle =
            ev.ok && ev.data && Array.isArray((ev.data as { events?: unknown }).events)
              ? ((ev.data as { events: Array<{ year?: number; text?: string; at?: string | null }> }).events)
                  .map((e) => `${e.year != null ? `第${e.year}年 ` : ''}${e.text ?? ''}${e.at ? `（${e.at}）` : ''}`.trim())
                  .filter((t) => t.length > 0)
                  .slice(0, 8)
              : [];
          const digest = dg.ok && dg.data && typeof (dg.data as { digest?: unknown }).digest === 'string'
            ? ((dg.data as { digest: string }).digest).slice(0, 1200)
            : '';
          if (digest || chronicle.length) snapshot = { digest: digest || undefined, chronicle: chronicle.length ? chronicle : undefined };
        }
        // {r} 动作行真执行：wb_spawn/wb_weather 受理的动作经桥下达，逐行解析后在活引擎上执行，
        // 结果以工具卡入流（失败以 ✗ 摘要呈现——与默认面工具卡同形状，非静默）
        const runDshAction = (line: string) => {
          if (!eng) return;
          const rest = line.slice(DSH_ACTION_MARK.length);
          const sp = rest.indexOf(' ');
          if (sp <= 0) return;
          const name = rest.slice(0, sp).trim();
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(rest.slice(sp + 1)) as Record<string, unknown>;
          } catch {
            return;
          }
          const r = executeOracleTool(eng, name, args);
          setLive((prev) =>
            prev
              ? {
                  ...prev,
                  phase: 'invoke',
                  invoking: name,
                  tools: [...prev.tools, { name, args, ok: r.ok, summary: briefResult(r) }],
                }
              : prev,
          );
        };
        const res: AgentTurnResult = dshOn
          ? await runDshSessionTurn(provider, sid, userText, {
              signal: ac.signal,
              onDelta: (d) => {
                if (d.reason?.startsWith(DSH_ACTION_MARK)) runDshAction(d.reason);
                setLive((prev) =>
                  prev
                    ? {
                        ...prev,
                        phase: d.text ? 'whisper' : prev.phase,
                        text: prev.text + (d.text ?? ''),
                        reason: prev.reason + (d.reason ?? ''),
                      }
                    : prev,
                );
              },
            }, snapshot).then((r) => ({
              // dsh 面结果归一为回合形状：工具轮在服务端执行，前端零工具事件（桥过程已随 {r} 入思考流）
              content: r.content,
              toolEvents: [],
              turns: 1,
              error: r.err || undefined,
              reasoning: r.reasoning || undefined,
            }))
          : await runOracleAgentTurn(
              provider,
              history,
              {
                signal: ac.signal,
                onDelta: (d) =>
                  setLive((prev) =>
                    prev
                      ? {
                          ...prev,
                          phase: d.text ? 'whisper' : prev.phase,
                          text: prev.text + (d.text ?? ''),
                          reason: prev.reason + (d.reason ?? ''),
                        }
                      : prev,
                  ),
              onToolCalls: (calls) =>
                setLive((prev) =>
                  prev
                    ? {
                        ...prev,
                        phase: 'invoke',
                        invoking: calls.map((c) => c.name).join('、'),
                        tools: [...prev.tools, ...calls.map((c) => ({ name: c.name, args: c.args, ok: null, summary: '' }))],
                      }
                    : prev,
                ),
              onToolResult: (call, r) =>
                setLive((prev) => {
                  if (!prev) return prev;
                  let done = false;
                  const tools = prev.tools.map((t) => {
                    if (!done && t.ok === null && t.name === call.name) {
                      done = true;
                      return { ...t, ok: r.ok, summary: briefResult(r) };
                    }
                    return t;
                  });
                  return { ...prev, tools };
                }),
              },
              400, // 超级演化轮：取消轮数限制（400 = 事实上无限；agent 内置同签名失败/无进展双守卫防失控）
              deep,
              {
                // v5 Root Agent：权限闸门 + 原生函数调用（v7 三协议：openai tool_calls /
                // anthropic tool_use / gemini functionCall 直连时下发结构化 tools，
                // 中继/本站后端/local 自动回退旧 JSON 协议）
                perms: perm,
                nativeTools:
                  (provider.kind === 'openai' || provider.kind === 'anthropic' || provider.kind === 'gemini') &&
                  !provider.relayUrl?.trim() &&
                  !dshOn
                    ? buildNativeToolParams(PERM_LEVELS[perm.level].tiers)
                    : undefined,
                systemPromptNative: buildSystemPrompt(renderToolCatalog(), { native: true, perm }),
              },
            );
        addOracleMsg({
          role: 'oracle',
          text: res.content || `神谕沉默了${res.error ? `（${res.error}）` : ''}——世界仍在运转，请再问一次。`,
          mode,
          tools: res.toolEvents.length > 0 ? res.toolEvents : undefined,
          reasoning: res.reasoning || undefined,
        });
        if (res.error) setError(res.error);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        addOracleMsg({ role: 'oracle', text: `神谕的凝视被阻断（${msg}）。世界仍在运转——请稍后再问。`, mode });
      } finally {
        setOracleBusy(false);
        setLive(null);
        abortRef.current = null;
        // v5：回合结束——免确认复位；挂起的审批作废（拒绝）
        const gst = useGameStore.getState();
        if (gst.oracleAutoApprove) gst.setOracleAutoApprove(false);
        if (gst.oracleApproval) gst.resolveOracleApproval(false);
      }
    },
    [provider, addOracleMsg, setOracleBusy, deep, dshOn, sessionId, perm],
  );

  /** 中止当前 agent 循环 */
  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /** 神谕唤醒指令消费（图鉴编辑器「唤醒神谕」等入口）：面板打开且 pending 存在 → 自动以 create 模式发出 */
  const oraclePending = useGameStore((s) => s.oraclePending);
  const setOraclePending = useGameStore((s) => s.setOraclePending);
  useEffect(() => {
    if (!oraclePending || oracleBusy) return;
    const text = oraclePending;
    setOraclePending(null);
    void askAgent('create', text);
  }, [oraclePending, oracleBusy, askAgent, setOraclePending]);

  /** 自由问答提交（Enter 发送 / Shift+Enter 换行） */
  const submit = useCallback(() => {
    const q = input.trim();
    if (!q || useGameStore.getState().oracleBusy) return;
    setInput('');
    void askAgent('ask', q);
  }, [input, askAgent]);

  const chipLabel = `${provider.label ?? provider.kind}${provider.model ? ` · ${provider.model}` : ''}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 控制行一：四模式（照旧两行布局防 320px 溢出；造物主模式 emerald 系） */}
      <div className="flex items-center gap-1.5 border-b-2 border-zinc-800 px-2 py-1.5">
        {(['narrate', 'analyze', 'prophesy'] as const).map((m) => {
          const Icon = MODE_ICON[m];
          return (
            <Button
              key={m}
              variant="ghost"
              size="sm"
              disabled={oracleBusy}
              onClick={() => void askAgent(m)}
              title={MODE_HINT[m]}
              aria-label={MODE_LABEL[m]}
              className="h-7 min-w-0 flex-1 gap-1 rounded-sm border-2 border-zinc-700/70 bg-zinc-800/50 px-1 text-[10px] font-bold text-zinc-300 transition-colors hover:border-amber-400/50 hover:bg-amber-400/10 hover:text-amber-200 disabled:opacity-40"
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{MODE_LABEL[m]}</span>
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          disabled={oracleBusy}
          onClick={() => void askAgent('create')}
          title={MODE_HINT.create}
          aria-label={MODE_LABEL.create}
          className="h-7 min-w-0 flex-1 gap-1 rounded-sm border-2 border-emerald-500/50 bg-emerald-500/10 px-1 text-[10px] font-bold text-emerald-300 transition-colors hover:border-emerald-400 hover:bg-emerald-400/20 disabled:opacity-40"
        >
          <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">造物主</span>
        </Button>
      </div>

      {/* 控制行二：厂商芯片 / 深思 / 法则管理 / 清空 */}
      <div className="flex items-center gap-1.5 border-b-2 border-zinc-800 px-2 py-1">
        <Popover open={cfgOpen} onOpenChange={setCfgOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-haspopup="dialog"
              title="厂商与模型配置"
              className="h-6 min-w-0 flex-1 gap-1 rounded-sm border-2 border-teal-400/30 bg-zinc-800/50 px-1.5 text-[9px] font-bold text-teal-300 transition-colors hover:border-teal-400/60 hover:bg-teal-400/10"
            >
              <Cpu className="h-3 w-3 shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{chipLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-72 rounded-sm border-2 border-zinc-700 bg-zinc-900/95 p-2.5 shadow-[0_4px_0_rgba(0,0,0,0.6)]"
          >
            <ProviderConfig provider={provider} onApply={applyProvider} />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeep((v) => !v)}
          disabled={oracleBusy}
          aria-pressed={deep}
          aria-label="深度思考"
          title={deep ? '深度思考已开启：模型先推理后行动，复杂任务更稳（耗时稍长）' : '开启深度思考：先推理后行动，复杂任务更稳（耗时稍长）'}
          className={`h-6 shrink-0 gap-1 rounded-sm border-2 px-1.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${
            deep
              ? 'border-violet-400/60 bg-violet-400/15 text-violet-300'
              : 'border-zinc-700/70 bg-zinc-800/50 text-zinc-400 hover:border-violet-400/40 hover:text-violet-300'
          }`}
        >
          <BrainCircuit className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="shrink-0">深思</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView((v) => (v === 'perm' ? 'chat' : 'perm'))}
          aria-pressed={view === 'perm'}
          aria-label="权限中心"
          title={`权限中心：当前 L${perm.level} ${PERM_LEVELS[perm.level].name}${perm.rootAck ? '（ROOT 已解锁）' : '（ROOT 未解锁）'}——五档可调权限位阶`}
          className={`h-6 shrink-0 gap-1 rounded-sm border-2 px-1.5 text-[10px] font-bold transition-colors ${
            view === 'perm'
              ? 'border-amber-400/60 bg-amber-400/15 text-amber-300'
              : perm.level >= 4 && perm.rootAck
                ? 'border-red-400/50 bg-red-400/10 text-red-300 hover:border-red-400/70'
                : 'border-zinc-700/70 bg-zinc-800/50 text-zinc-400 hover:border-amber-400/40 hover:text-amber-300'
          }`}
        >
          {perm.level >= 4 ? <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />}
          <span className="shrink-0">L{perm.level}·{PERM_LEVELS[perm.level].name}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView((v) => (v === 'laws' ? 'chat' : 'laws'))}
          aria-pressed={view === 'laws'}
          aria-label="Agent 法则管理"
          title="Agent 法则管理（神谕书写的活机制）"
          className={`h-6 shrink-0 gap-1 rounded-sm border-2 px-1.5 text-[10px] font-bold transition-colors ${
            view === 'laws'
              ? 'border-fuchsia-400/60 bg-fuchsia-400/15 text-fuchsia-300'
              : 'border-zinc-700/70 bg-zinc-800/50 text-zinc-400 hover:border-fuchsia-400/40 hover:text-fuchsia-300'
          }`}
        >
          <Scale className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="shrink-0">法则</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleDsh(!dshOn)}
          disabled={oracleBusy}
          aria-pressed={dshOn}
          aria-label="dsh 持久会话"
          title={
            dshOn
              ? 'dsh 持久会话已开启：历史由 oracle-server 权威投影（JSONL 落盘 + compaction），切后台/刷新续跑；清空按钮轮换新会话'
              : '开启 dsh 持久会话（需中继后端）：服务端权威历史——100 轮不失忆、切后台/刷新续跑'
          }
          className={`h-6 shrink-0 gap-1 rounded-sm border-2 px-1.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${
            dshOn
              ? 'border-sky-400/60 bg-sky-400/15 text-sky-300'
              : 'border-zinc-700/70 bg-zinc-800/50 text-zinc-400 hover:border-sky-400/40 hover:text-sky-300'
          }`}
        >
          <Database className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="shrink-0">持久</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={oracleBusy || oracleMsgs.length === 0}
          onClick={handleClear}
          aria-label="清空神谕会话（dsh 持久会话开启时同时轮换新会话）"
          title="清空会话"
          className="h-6 w-7 shrink-0 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30"
        >
          <Eraser className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      {/* 消息流 / 法则管理 / 权限中心（同槽切换） */}
      {view === 'laws' ? (
        <LawsView />
      ) : view === 'perm' ? (
        <PermView perm={perm} onChange={(p) => { setPerm(p); savePermSettings(p); }} />
      ) : (
        <div
          ref={scrollRef}
          role="log"
          aria-label="神谕会话流"
          className="game-scroll min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2 sm:max-h-[calc(100dvh-430px)]"
          style={{ scrollbarWidth: 'thin' }}
        >
          {oracleMsgs.length === 0 && !oracleBusy ? (
            <Empty onPick={(m, q) => void askAgent(m, q)} />
          ) : (
            <>
              {oracleMsgs.map((m) => (m.role === 'user' ? <UserBubble key={m.id} text={m.text} mode={m.mode} /> : <OracleBubble key={m.id} msg={m} />))}
              {oracleBusy && live && <LiveBubble live={live} />}
            </>
          )}
        </div>
      )}

      {/* 权限审批条：位阶开启「执行前批准」时，agent 挂起等这一行裁决（允许/拒绝/免确认） */}
      {oracleApproval && (
        <div className="border-t-2 border-amber-400/40 bg-amber-400/10 px-2 py-1.5">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 animate-pulse text-amber-300" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-amber-200" title={`${oracleApproval.name} 参数：${JSON.stringify(oracleApproval.args).slice(0, 300)}`}>
              待批准：{oracleApproval.name}（{TIER_LABEL[oracleApproval.tier]}位阶）
            </span>
            <Button
              variant="ghost" size="sm"
              onClick={() => useGameStore.getState().resolveOracleApproval(true)}
              className="h-6 shrink-0 gap-1 rounded-sm border-2 border-emerald-400/60 bg-emerald-400/15 px-1.5 text-[10px] font-bold text-emerald-300 hover:bg-emerald-400/25"
            >
              <CheckCircle2 className="h-3 w-3" aria-hidden /> 允许
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => useGameStore.getState().resolveOracleApproval(false)}
              className="h-6 shrink-0 gap-1 rounded-sm border-2 border-red-400/60 bg-red-400/10 px-1.5 text-[10px] font-bold text-red-300 hover:bg-red-400/25"
            >
              <Ban className="h-3 w-3" aria-hidden /> 拒绝
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => useGameStore.getState().setOracleAutoApprove(true)}
              title="本次任务全程放行该位阶（回合结束自动复位）"
              className="h-6 shrink-0 gap-1 rounded-sm border-2 border-zinc-600 bg-zinc-800/60 px-1.5 text-[10px] font-bold text-zinc-300 hover:bg-zinc-700"
            >
              <LockOpen className="h-3 w-3" aria-hidden /> 免确认
            </Button>
          </div>
          <p className="mt-1 line-clamp-2 font-mono text-[9px] leading-snug break-words text-amber-200/70">
            {JSON.stringify(oracleApproval.args).slice(0, 220)}
          </p>
        </div>
      )}

      {/* 错误行 */}
      {error && (
        <p className="border-t-2 border-red-500/20 bg-red-500/10 px-2 py-1 text-[9px] font-bold break-words text-red-300/90">
          上次请求失败：{error}
        </p>
      )}

      {/* 输入区：造物主发问 / agent 运行中切换为中止 */}
      <div className="flex items-end gap-1.5 border-t-2 border-zinc-800 px-2 py-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          maxLength={500}
          placeholder={oracleBusy ? '神谕 Agent 运行中…' : '向神谕下令——查数据、改世界、写机制（Enter 发送）…'}
          aria-label="向神谕提问"
          className="min-h-[38px] flex-1 resize-none rounded-sm border-2 border-zinc-700/80 bg-zinc-800/70 px-2 py-1.5 text-[11px] leading-snug text-zinc-100 placeholder:text-zinc-500 focus:border-amber-400/50 focus:outline-none disabled:opacity-50"
          disabled={oracleBusy}
        />
        {oracleBusy ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={abort}
            aria-label="中止神谕"
            title="中止当前 Agent 循环"
            className="h-9 w-9 shrink-0 animate-pulse border-2 border-red-400/50 bg-red-400/10 text-red-300 transition-colors hover:bg-red-400/20 hover:text-red-200"
          >
            <Square className="h-3.5 w-3.5" aria-hidden />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={submit}
            disabled={!input.trim()}
            aria-label="发送提问"
            title="发送（Enter）"
            className="h-9 w-9 shrink-0 border-2 border-amber-400/40 bg-amber-400/10 text-amber-300 transition-colors hover:bg-amber-400/20 hover:text-amber-200 disabled:border-zinc-700/60 disabled:bg-zinc-800/40 disabled:text-zinc-500"
          >
            <SendHorizontal className="h-4 w-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}

export function OraclePanel() {
  const { showOracle, toggleOracle, mobilePanel, openMobilePanel, oracleMsgs } = useGameStore();
  const count = oracleMsgs.length;

  return (
    <>
      {/* 桌面左侧栏 —— 顶栏神谕按钮触发（与王国榜/生态/成就同列互斥） */}
      {showOracle && (
        <div
          className="su-dock-panel w-80 flex-col"
          role="complementary"
          aria-label="神谕 Agent 面板"
        >
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold tracking-widest text-zinc-300 uppercase">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
              <span className="shrink-0">神谕</span>
              <span className="shrink-0 rounded-sm border border-fuchsia-400/50 bg-fuchsia-400/10 px-1 py-px text-[8px] font-bold tracking-normal text-fuchsia-300">
                神谕 AGENT
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="font-mono text-[10px] font-bold text-zinc-500">{count}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleOracle}
                aria-label="关闭神谕面板"
                className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col border-2 border-zinc-700/90 bg-zinc-900/95">
            <OracleBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'oracle'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[58vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex min-w-0 items-center gap-1.5 text-left text-[12px] font-bold tracking-widest text-zinc-200 uppercase">
              <Sparkles className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
              <span className="shrink-0">神谕</span>
              <span className="shrink-0 rounded-sm border border-fuchsia-400/50 bg-fuchsia-400/10 px-1 py-px text-[8px] font-bold tracking-normal text-fuchsia-300">
                神谕 AGENT
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] font-bold text-zinc-500">{count}</span>
            </SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <OracleBody />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
