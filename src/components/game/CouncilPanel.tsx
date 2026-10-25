'use client';
// ============ CouncilPanel：统治者议会（AI 决策层操控台） ============
// 架构：AI 控制决策，代码控制确定性。本面板是 L1-L5 管线的观测与干预面：
//   · 总开关/周期/双席同议（设置持久化 wb_council_v1）
//   · 四席运行卡（战争统帅/天灾使者/造物主教/内政执政官）
//   · 待确认队列：高危动作复述确认（同意=执行+回读，否决=驳回）
//   · 裁决流：每条意图带「层」徽章（决策/仲裁/地名解析/执行/回读）——错误先定位层
//   · 谕令输入：注入下一次召开（优先级最高）
// CouncilDriver：议会驱动心跳（4s 轮询回读到期的延迟验证 + 周期召开判定）。
import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { getCouncil } from '@/lib/ruler/council';
import { RULER_ROLES } from '@/lib/ruler/whitelist';
import { parseAgentOutput } from '@/lib/ruler/parse';
import { arbitrate } from '@/lib/ruler/arbiter';
import { executeIntent } from '@/lib/ruler/executor';
import { buildAnchors, buildDigest, takeSnapshot } from '@/lib/ruler/digest';
import { resolveKingdom, resolvePlace } from '@/lib/ruler/geo';
import type { CouncilAgentStatus, CouncilFeedItem, CouncilPendingItem, RulerRole } from '@/lib/ruler/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Gavel, Swords, Flame, Dna, Landmark, X, Play, ChevronRight, ChevronDown,
  ShieldAlert, Check, Ban, Loader2, ScrollText,
} from 'lucide-react';

const ROLE_ICON: Record<RulerRole, typeof Swords> = {
  warlord: Swords, calamity: Flame, creator: Dna, steward: Landmark,
};
const ROLE_ACCENT: Record<RulerRole, string> = {
  warlord: 'text-rose-300', calamity: 'text-orange-300', creator: 'text-emerald-300', steward: 'text-amber-300',
};

const STATUS_STYLE: Record<CouncilFeedItem['status'], string> = {
  已验证: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  执行中: 'border-amber-500/40 bg-amber-500/10 text-amber-300 animate-pulse',
  待确认: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  受阻: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400',
  失败: 'border-red-500/40 bg-red-500/10 text-red-300',
};
const LAYER_STYLE: Record<CouncilFeedItem['layer'], string> = {
  决策: 'text-rose-300/80', 仲裁: 'text-amber-300/80', 地名解析: 'text-sky-300/80',
  执行: 'text-orange-300/80', 回读: 'text-teal-300/80',
};

/** 单条裁决行（层徽章 + 汇报 + 详情可展开） */
function FeedRow({ item }: { item: CouncilFeedItem }) {
  const [open, setOpen] = useState(false);
  const jumpTo = useGameStore((s) => s.jumpTo);
  const actionLabel = item.action === 'none' ? '议会' : item.action;
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
        aria-expanded={open}
        aria-label={`裁决详情：${item.report}`}
      >
        <span className={`shrink-0 rounded border px-1 py-px text-[10px] font-bold ${STATUS_STYLE[item.status]}`}>
          {item.status}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-200" title={item.report}>
          {item.report}
        </span>
        <span className="shrink-0 text-[9px] tabular-nums text-zinc-500">{item.year}年</span>
        {open ? <ChevronDown className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden /> : <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" aria-hidden />}
      </button>
      {open && (
        <div className="border-t border-zinc-800/80 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-400">
          <p>
            <span className="text-zinc-500">席位</span> {RULER_ROLES[item.agent].name}
            <span className="mx-1 text-zinc-700">·</span>
            <span className="text-zinc-500">层</span> <span className={`font-semibold ${LAYER_STYLE[item.layer]}`}>{item.layer}</span>
            <span className="mx-1 text-zinc-700">·</span>
            <span className="text-zinc-500">动作</span> {actionLabel}
          </p>
          {item.why && <p><span className="text-zinc-500">动机</span> {item.why}</p>}
          {item.detail && <p><span className="text-zinc-500">详情</span> {item.detail}</p>}
          {item.at && (
            <button
              type="button"
              onClick={() => jumpTo(item.at![0], item.at![1])}
              className="mt-1 inline-flex items-center gap-1 rounded border border-zinc-700 px-1.5 py-px text-[10px] text-zinc-300 hover:border-amber-600/60 hover:text-amber-200"
            >
              跳转 ({item.at[0]},{item.at[1]})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** 待确认卡（高危动作 · 复述确认协议） */
function PendingCard({ p }: { p: CouncilPendingItem }) {
  const confirm = useGameStore((s) => s.councilConfirm);
  const reject = useGameStore((s) => s.councilReject);
  return (
    <div className="rounded-md border border-violet-600/50 bg-violet-950/40 p-2">
      <div className="flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-violet-200" title={p.restatement}>
          复述：{p.restatement}
        </span>
        {p.coSigned && <span className="shrink-0 rounded border border-violet-500/50 px-1 text-[9px] font-bold text-violet-300">双席同议</span>}
      </div>
      <p className="mt-1 text-[10px] text-zinc-400">
        {RULER_ROLES[p.agent].name}提议 · {p.year}年{p.why ? ` · ${p.why}` : ''}
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <Button
          size="sm"
          onClick={() => confirm(p.id)}
          className="h-6 flex-1 gap-1 border-2 border-emerald-600/60 bg-emerald-900/60 px-2 text-[10px] font-bold text-emerald-200 hover:bg-emerald-800/80"
        >
          <Check className="h-3 w-3" aria-hidden /> 准奏
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => reject(p.id)}
          className="h-6 flex-1 gap-1 border-2 border-zinc-700 px-2 text-[10px] font-bold text-zinc-400 hover:border-red-700/60 hover:text-red-300"
        >
          <Ban className="h-3 w-3" aria-hidden /> 否决
        </Button>
      </div>
    </div>
  );
}

/** 席位卡 */
function AgentCard({ role, st, onToggle }: { role: RulerRole; st: CouncilAgentStatus; onToggle: () => void }) {
  const Icon = ROLE_ICON[role];
  return (
    <div className={`rounded-md border p-2 ${st.enabled ? 'border-zinc-700 bg-zinc-900/70' : 'border-zinc-800 bg-zinc-950/60 opacity-55'}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${st.enabled ? ROLE_ACCENT[role] : 'text-zinc-600'}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-zinc-200">{RULER_ROLES[role].name}</span>
        <Switch checked={st.enabled} onCheckedChange={onToggle} aria-label={`${RULER_ROLES[role].name}席位开关`} className="scale-75" />
      </div>
      <p className="mt-0.5 truncate text-[9px] text-zinc-500">{RULER_ROLES[role].title} · {RULER_ROLES[role].domain}</p>
      <div className="mt-1 flex items-center gap-1 text-[9px] tabular-nums">
        <span
          className={`rounded px-1 py-px font-bold ${
            st.phase === '决断中' ? 'bg-amber-500/15 text-amber-300'
            : st.phase === '已献策' ? 'bg-emerald-500/15 text-emerald-300'
            : st.phase === '出错' ? 'bg-red-500/15 text-red-300'
            : 'bg-zinc-700/40 text-zinc-400'
          }`}
        >
          {st.phase}
        </span>
        <span className="text-zinc-500">行{st.done}</span>
        <span className="text-zinc-600">阻{st.blocked}</span>
        <span className="text-zinc-600">败{st.failed}</span>
      </div>
    </div>
  );
}

function CouncilBody() {
  const s = useGameStore();
  const [decree, setDecree] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);
  const roles: RulerRole[] = ['warlord', 'calamity', 'creator', 'steward'];
  const enabledCount = roles.filter((r) => s.councilAgents[r].enabled).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 game-scroll">
      {/* 总控 */}
      <div className="rounded-md border border-zinc-700/80 bg-zinc-900/70 p-2">
        <div className="flex items-center gap-2">
          <Switch checked={s.councilOn} onCheckedChange={s.setCouncilOn} aria-label="AI 统治总开关" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold text-zinc-200">AI 统治 {s.councilOn ? '运转中' : '已停摆'}</p>
            <p className="text-[9px] text-zinc-500">
              {s.councilOn ? `每 ${s.councilInterval} 年自动召开 · ${enabledCount}/4 席在朝` : '开启后议会周期性研判世界并自主献策'}
            </p>
          </div>
          <Button
            size="sm"
            onClick={s.councilConveneNow}
            disabled={s.councilBusy || !s.councilOn}
            className="h-7 shrink-0 gap-1 border-2 border-amber-600/60 bg-amber-900/50 px-2 text-[10px] font-bold text-amber-200 hover:bg-amber-800/70 disabled:opacity-50"
          >
            {s.councilBusy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
            {s.councilBusy ? '决断中' : '立即召开'}
          </Button>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[9px] text-zinc-500">
          <label className="flex items-center gap-1" htmlFor="council-interval">
            周期
            <select
              id="council-interval"
              value={s.councilInterval}
              onChange={(e) => s.setCouncilInterval(Number(e.target.value))}
              className="rounded border border-zinc-700 bg-zinc-800 px-1 py-px text-[10px] text-zinc-300"
            >
              {[10, 15, 25, 40].map((v) => (
                <option key={v} value={v}>{v} 年</option>
              ))}
            </select>
          </label>
          <label className="ml-auto flex items-center gap-1" htmlFor="council-consent">
            双席同议自动放行
            <Switch checked={s.councilAutoConsent} onCheckedChange={s.setCouncilAutoConsent} id="council-consent" className="scale-[0.65]" />
          </label>
        </div>
      </div>

      {/* 待确认（高危复述确认协议） */}
      {s.councilPending.length > 0 && (
        <section aria-label="待确认的高危意图">
          <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-violet-300">
            <ShieldAlert className="h-3 w-3" aria-hidden /> 待批复 {s.councilPending.length}
          </p>
          <div className="flex flex-col gap-1.5">
            {s.councilPending.map((p) => <PendingCard key={p.id} p={p} />)}
          </div>
        </section>
      )}

      {/* 四席 */}
      <section aria-label="议会席位">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">议会席位</p>
        <div className="grid grid-cols-2 gap-1.5">
          {roles.map((r) => (
            <AgentCard key={r} role={r} st={s.councilAgents[r]} onToggle={() => s.toggleCouncilAgent(r)} />
          ))}
        </div>
      </section>

      {/* 谕令 */}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!decree.trim()) return;
          s.councilDecree(decree.trim());
          setDecree('');
        }}
      >
        <Input
          value={decree}
          onChange={(e) => setDecree(e.target.value)}
          placeholder="造物主谕令（下次召开生效）…"
          aria-label="造物主谕令"
          maxLength={120}
          className="h-7 border-zinc-700 bg-zinc-900 text-[11px] text-zinc-200 placeholder:text-zinc-600"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!decree.trim()}
          className="h-7 shrink-0 border-2 border-amber-600/60 bg-amber-900/50 px-2 text-[10px] font-bold text-amber-200 hover:bg-amber-800/70 disabled:opacity-40"
        >
          降谕
        </Button>
      </form>

      {/* 裁决流 */}
      <section className="flex min-h-[120px] flex-1 flex-col" aria-label="议会裁决流">
        <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          <ScrollText className="h-3 w-3" aria-hidden /> 裁决流（{s.councilFeed.length}）
        </p>
        <div ref={feedRef} className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-0.5 game-scroll">
          {s.councilFeed.length === 0 ? (
            <p className="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-center text-[10px] text-zinc-600">
              {s.councilOn ? '议会静观其变——无变化不献策' : '开启 AI 统治后，裁决将在此逐条留痕'}
            </p>
          ) : (
            s.councilFeed.map((f) => <FeedRow key={f.id} item={f} />)
          )}
        </div>
      </section>

      {/* 架构说明（调试原则可视为产品的一部分） */}
      <p className="rounded-md border border-zinc-800/70 bg-zinc-950/40 px-2 py-1.5 text-[9px] leading-relaxed text-zinc-600">
        AI 只出意图（白名单枚举+地名），代码负责地名解析→校验→执行→回读验证；汇报为模板填槽（≤15字）。
        出错先看「层」徽章：决策/仲裁/地名解析/执行/回读——不同层修法不同。
      </p>
    </div>
  );
}

/** 议会驱动心跳：永远常驻（不随面板开合卸载）——回读轮询 + 周期召开判定
 *  附 QA 钩子 __wbCouncil（与 __wbEngine 同款约定）：分层直测决策/仲裁/执行/回读管线 */
export function CouncilDriver() {
  useEffect(() => {
    const iv = setInterval(() => getCouncil().tick(), 4000);
    const w = window as unknown as Record<string, unknown>;
    w.__wbCouncil = {
      getCouncil,
      parseAgentOutput,
      arbitrate,
      executeIntent,
      buildAnchors,
      takeSnapshot,
      buildDigest,
      resolvePlace,
      resolveKingdom,
      getFeed: () => useGameStore.getState().councilFeed,
      getPending: () => useGameStore.getState().councilPending,
    };
    return () => {
      clearInterval(iv);
      delete w.__wbCouncil;
    };
  }, []);
  return null;
}

export function CouncilPanel() {
  const showCouncil = useGameStore((s) => s.showCouncil);
  const toggleCouncil = useGameStore((s) => s.toggleCouncil);
  const mobilePanel = useGameStore((s) => s.mobilePanel);
  const openMobilePanel = useGameStore((s) => s.openMobilePanel);
  return (
    <>
      {/* 桌面坞面板 */}
      {showCouncil && (
        <div className="su-dock-panel w-80 flex-col">
          <div className="flex items-center justify-between border-b rounded-t-[13px] border-zinc-700/90 bg-zinc-900/95 px-2 py-1">
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-zinc-300">
              <Gavel className="h-3.5 w-3.5 text-violet-300" aria-hidden />
              统治者议会
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCouncil}
              aria-label="关闭统治者议会面板"
              className="h-6 w-6 border-2 border-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
          <div className="flex max-h-[calc(100dvh-96px-33px)] min-h-[420px] flex-col border-2 border-t-0 border-zinc-700/90 bg-zinc-900/95">
            <CouncilBody />
          </div>
        </div>
      )}

      {/* 移动端底部抽屉 */}
      <Sheet open={mobilePanel === 'council'} onOpenChange={(o) => { if (!o) openMobilePanel('none'); }}>
        <SheetContent side="bottom" className="flex h-[62vh] flex-col rounded-t-md border-2 border-t-4 border-zinc-700 bg-zinc-900/95 p-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="border-b-2 border-zinc-800 px-3 py-2">
            <SheetTitle className="flex items-center gap-1.5 text-left text-[12px] font-bold uppercase tracking-widest text-zinc-200">
              <Gavel className="h-4 w-4 text-violet-300" aria-hidden />
              统治者议会
            </SheetTitle>
          </SheetHeader>
          <CouncilBody />
        </SheetContent>
      </Sheet>
    </>
  );
}
