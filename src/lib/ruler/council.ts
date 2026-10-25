// ============ 统治者议会 · 编排器（council） ============
// 管线：世界状态服务裁剪摘要 → 各席位 LLM 决策（只出意图）→ 仲裁 → 执行+回读 → 模板汇报汇总。
// 性能与 token：摘要只含变化量与告警；无动作即沉默（不产生汇报）；多席汇报由仲裁层汇总一次性输出。
// 危险协议：high 级意图进待确认队列（复述+造物主批复）；「双席同议自动放行」开关默认关。
// 延迟回读：陨石/地震等延迟生效神力登记 dueTick，由 tick() 轮询回读——绝不以「已施放」冒充「已生效」。
import type { GameEngine } from '@/lib/game/engine';
import { useGameStore, getEngine } from '@/store/gameStore';
import type {
  CouncilAgentStatus, CouncilFeedItem, CouncilPendingItem, ConveneContext, FeedAction, RulerIntent, RulerRole,
} from './types';
import { RULER_ROLES, cooldownKey } from './whitelist';
import { buildAnchors, buildDigest, takeSnapshot, type WorldSnapshot } from './digest';
import { parseAgentOutput } from './parse';
import { arbitrate } from './arbiter';
import { executeIntent } from './executor';
import { REPORT_TEMPLATES, reportBlocked, reportFailed } from './reporter';
import { buildRulerPrompt, buildRulerUserMessage } from './prompt';

const ALL_ROLES: RulerRole[] = ['warlord', 'calamity', 'creator', 'steward'];
const LLM_TIMEOUT_MS = 45_000;
/** 待确认条目的存续：2 次召开未批复 → 自动作罢 */
const PENDING_EXPIRY_CONVENES = 2;
/** 待确认条目的墙钟存续（毫秒）——高倍速下召开频繁，纯计数会让玩家来不及批复 */
const PENDING_EXPIRY_MS = 150_000;
/** 自动召开的最小墙钟间隔（毫秒）——高倍速下游戏年飞逝，必须以真实时间护栏护住 LLM 限流窗口 */
const AUTO_CONVENE_MIN_GAP_MS = 75_000;

export const initialCouncilAgents = (): Record<RulerRole, CouncilAgentStatus> => {
  const out = {} as Record<RulerRole, CouncilAgentStatus>;
  for (const r of ALL_ROLES) out[r] = { enabled: true, phase: '静观', lastCount: 0, lastYear: 0, done: 0, blocked: 0, failed: 0 };
  return out;
};

interface PendingVerification {
  feedId: number;
  eng: GameEngine;
  dueTick: number;
  verify: () => { ok: boolean; reason?: string };
  intent: RulerIntent;
  slots: Record<string, string | number | undefined>;
}

/** 单次 LLM 调用（SSE 全量收集，不做流式 UI——议会只在后台决断） */
async function llmOnce(systemPrompt: string, userMessage: string, signal: AbortSignal): Promise<{ text: string; err?: string }> {
  try {
    const res = await fetch('/api/oracle/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: { kind: 'builtin' },
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        deep: false,
      }),
      signal,
    });
    if (!res.ok || !res.body) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch { /* 非 JSON 错误体 */ }
      // 静态托管（GitHub Pages 等）上 /api/* 不存在：404/405 → 友好降级文案
      if (res.status === 404 || res.status === 405) {
        msg = '议会离线：此部署为纯静态托管，无 AI 后端（游戏本体不受影响）';
      }
      return { text: '', err: msg };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let text = '';
    for (;;) {
      if (signal.aborted) {
        void reader.cancel();
        return { text: '', err: '已中止' };
      }
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const ev = JSON.parse(payload) as { t?: string; err?: string };
          if (ev.t) text += ev.t;
          if (ev.err) return { text, err: ev.err };
        } catch { /* 忽略坏行 */ }
      }
    }
    return { text };
  } catch (e) {
    if (signal.aborted) return { text: '', err: '已中止' };
    return { text: '', err: e instanceof Error ? e.message : String(e) };
  }
}

export class RulerCouncil {
  private lastSnapshot: WorldSnapshot | null = null;
  private cooldowns = new Map<string, number>();
  private verifications: PendingVerification[] = [];
  private decreeQueue: string[] = [];
  private convening = false;
  private conveneNo = 0;
  private feedSeq = 1;
  private pendingSeq = 1;
  private lastConveneYear = Number.NEGATIVE_INFINITY;
  /** 待确认条目登记时的召开序号（超龄作废） */
  private pendingAge = new Map<number, number>();
  /** 待确认条目登记时间戳（墙钟超龄作废） */
  private pendingBorn = new Map<number, number>();
  /** 上次自动召开的墙钟时间（毫秒） */
  private lastAutoConveneAt = 0;

  // ---------------- 对外 API ----------------

  /** 驱动心跳（GameShell 每 4s 调一次）：回读到期的延迟验证 + 判定召开 */
  tick(): void {
    const eng = getEngine();
    if (!eng) return;
    this.flushVerifications(eng);
    const s = useGameStore.getState();
    if (!s.councilOn || s.boot !== 'game' || s.speed <= 0) return;
    // 双门控：游戏年到期 ∧ 距上次自动召开 ≥ 墙钟护栏（高倍速下防 LLM 限流风暴）
    if (eng.yearF - this.lastConveneYear >= s.councilInterval && Date.now() - this.lastAutoConveneAt >= AUTO_CONVENE_MIN_GAP_MS) {
      this.lastAutoConveneAt = Date.now();
      void this.convene('auto');
    }
  }

  /** 召开议会（auto=周期到点 / manual=造物主手动） */
  async convene(trigger: 'auto' | 'manual'): Promise<void> {
    if (this.convening) return;
    const eng = getEngine();
    const store = useGameStore.getState();
    if (!eng || store.boot !== 'game') return;
    this.convening = true;
    const phase1 = { ...store.councilAgents };
    for (const r of ALL_ROLES) {
      if (phase1[r]?.enabled) phase1[r] = { ...phase1[r], phase: '决断中' };
    }
    useGameStore.setState({ councilBusy: true, councilAgents: phase1 });

    try {
      const ctx: ConveneContext = {
        year: Math.floor(eng.yearF),
        anchors: buildAnchors(eng),
        snapshot: takeSnapshot(eng),
      };
      this.conveneNo++;
      this.lastConveneYear = eng.yearF;
      const decree = this.decreeQueue.shift() ?? null;

      // —— 各席位串行决断（并行会触发 API 429 限流；摘要按角色裁剪；沉默合法） ——
      const enabled = ALL_ROLES.filter((r) => store.councilAgents[r]?.enabled);
      const decisions: { role: RulerRole; raw: string; err?: string }[] = [];
      for (const role of enabled) {
        const digest = buildDigest(eng, role, ctx, this.lastSnapshot);
        const user = buildRulerUserMessage(digest, decree, this.conveneNo);
        let result: { text: string; err?: string };
        for (let attempt = 0; ; attempt++) {
          const ac = new AbortController();
          const timer = setTimeout(() => ac.abort(), LLM_TIMEOUT_MS);
          try {
            result = await llmOnce(buildRulerPrompt(role), user, ac.signal);
          } catch (e) {
            result = { text: '', err: e instanceof Error ? e.message : String(e) };
          } finally {
            clearTimeout(timer);
          }
          // 429 限流：退避 2.5s 重试一次（串行调用下的偶发限流）
          if (attempt === 0 && result.err && result.err.includes('429')) {
            await new Promise((res) => setTimeout(res, 2500));
            continue;
          }
          break;
        }
        decisions.push({ role, raw: result.text, err: result.err });
        // 席位状态实时回写（串行决断逐席亮灯）
        const st = { ...useGameStore.getState().councilAgents };
        if (st[role]) {
          st[role] = { ...st[role], phase: result.err ? '出错' : '已献策' };
          useGameStore.setState({ councilAgents: st });
        }
        if (role !== enabled[enabled.length - 1]) {
          await new Promise((res) => setTimeout(res, 400));
        }
      }

      // —— L2 出口：解析意图（含决策层问题记录） ——
      const intents: RulerIntent[] = [];
      const nextStatus = { ...useGameStore.getState().councilAgents };
      decisions.forEach((d) => {
        const role = d.role;
        if (d.err) {
          nextStatus[role] = { ...nextStatus[role], phase: '出错' };
          this.pushDecisionError(eng, role, `LLM 调用失败：${d.err}`);
          return;
        }
        const parsed = parseAgentOutput(role, d.raw);
        intents.push(...parsed.intents);
        if (parsed.issues.length > 0) {
          this.pushDecisionError(eng, role, parsed.issues.slice(0, 2).join('；').slice(0, 120));
        }
        nextStatus[role] = {
          ...nextStatus[role],
          phase: parsed.intents.length > 0 ? '已献策' : '沉默',
          lastCount: parsed.intents.length,
          lastYear: ctx.year,
        };
      });
      useGameStore.setState({ councilAgents: nextStatus });

      // —— L3：仲裁 ——
      const verdicts = arbitrate({
        intents,
        year: ctx.year,
        cooldowns: this.cooldowns,
        autoConsent: useGameStore.getState().councilAutoConsent,
      });

      // —— L4/L5：执行 + 汇总 ——
      let doneCount = 0;
      let blockedCount = 0;
      let failedCount = 0;
      const statDelta: Record<RulerRole, { done: number; blocked: number; failed: number }> = {
        warlord: { done: 0, blocked: 0, failed: 0 }, calamity: { done: 0, blocked: 0, failed: 0 },
        creator: { done: 0, blocked: 0, failed: 0 }, steward: { done: 0, blocked: 0, failed: 0 },
      };
      for (const v of verdicts) {
        if (v.decision === 'block') {
          this.pushOutcome(eng, v.intent, '受阻', '仲裁', reportBlocked(v.intent.action), `${v.reason ?? '仲裁驳回'}${v.coSigners.length ? `（${RULER_ROLES[v.coSigners[0]].name}同议）` : ''}`);
          blockedCount++;
          statDelta[v.intent.agent].blocked++;
          continue;
        }
        if (v.decision === 'pending') {
          this.pushPending(eng, ctx, v.intent, v.coSigners.length > 0, v.intent.why);
          continue;
        }
        const outcome = this.runIntent(eng, ctx, v.intent);
        if (outcome.ok) {
          doneCount++;
          statDelta[v.intent.agent].done++;
        } else {
          failedCount++;
          statDelta[v.intent.agent].failed++;
        }
      }

      // —— 汇总汇报（多席一次性输出；全部沉默则零输出） ——
      const finalStatus = { ...useGameStore.getState().councilAgents };
      for (const r of ALL_ROLES) {
        finalStatus[r] = {
          ...finalStatus[r],
          done: finalStatus[r].done + statDelta[r].done,
          blocked: finalStatus[r].blocked + statDelta[r].blocked,
          failed: finalStatus[r].failed + statDelta[r].failed,
          phase: finalStatus[r].phase === '决断中' ? '静观' : finalStatus[r].phase,
        };
      }
      useGameStore.setState({ councilAgents: finalStatus });
      const acted = doneCount + failedCount + blockedCount;
      if (acted > 0) {
        useGameStore.getState().pushToast(
          `统治者议会·${doneCount} 项已行${blockedCount + failedCount > 0 ? ` ·${blockedCount + failedCount} 项受阻` : ''}`,
          doneCount > 0 ? 'good' : 'danger',
          true,
        );
      }
      this.lastSnapshot = ctx.snapshot;
      this.expirePending();
      if (trigger === 'manual') {
        useGameStore.getState().pushToast(`议会已召开（第 ${this.conveneNo} 次）`, 'info', true);
      }
    } finally {
      this.convening = false;
      useGameStore.setState({ councilBusy: false });
    }
  }

  /** 造物主谕令：注入下一次召开 */
  queueDecree(text: string): void {
    const t = text.trim().slice(0, 120);
    if (t) this.decreeQueue.push(t);
  }

  /** 批复待确认意图（造物主同意） */
  confirmPending(pendingId: number): void {
    const s = useGameStore.getState();
    const item = s.councilPending.find((p) => p.id === pendingId);
    if (!item) return;
    const eng = getEngine();
    if (!eng) return;
    // 重建执行上下文（锚点重算——世界在等待期间可能已变化）
    const ctx: ConveneContext = { year: Math.floor(eng.yearF), anchors: buildAnchors(eng), snapshot: takeSnapshot(eng) };
    const intent: RulerIntent = { agent: item.agent, action: item.action, params: item.params, why: item.why };
    useGameStore.setState({ councilPending: useGameStore.getState().councilPending.filter((p) => p.id !== pendingId) });
    const outcome = this.runIntent(eng, ctx, intent);
    if (outcome.ok) {
      useGameStore.getState().pushToast(`已准奏：${item.restatement}`, 'good', true);
    }
  }

  /** 否决待确认意图 */
  rejectPending(pendingId: number): void {
    const s = useGameStore.getState();
    const item = s.councilPending.find((p) => p.id === pendingId);
    if (!item) return;
    const eng = getEngine();
    if (eng) {
      this.pushOutcome(eng, { agent: item.agent, action: item.action, params: item.params, why: item.why }, '受阻', '仲裁', reportBlocked(item.action), '造物主否决（复述未获准）');
    }
    useGameStore.setState({ councilPending: useGameStore.getState().councilPending.filter((p) => p.id !== pendingId) });
  }

  /** 世界重铸/读档：清空议会记忆 */
  reset(): void {
    this.lastSnapshot = null;
    this.cooldowns.clear();
    this.verifications = [];
    this.decreeQueue = [];
    this.lastConveneYear = Number.NEGATIVE_INFINITY;
    this.pendingAge.clear();
    this.pendingBorn.clear();
    this.lastAutoConveneAt = 0;
    this.conveneNo = 0;
  }

  // ---------------- 内部管线 ----------------

  /** 决策层故障入流（LLM 失败/解析问题——定位层=决策） */
  private pushDecisionError(eng: GameEngine, role: RulerRole, detail: string): void {
    this.pushRaw(eng, {
      agent: role, action: 'none' as FeedAction,
      report: '决断受挫', status: '失败', layer: '决策', detail, why: undefined, at: undefined,
    }, false);
  }

  /** 执行一条已放行意图：执行→回读→登记汇报→武装冷却 */
  private runIntent(eng: GameEngine, ctx: ConveneContext, intent: RulerIntent): { ok: boolean } {
    // 引擎一致性护栏：召开期间世界被重铸 → 拒绝执行
    if (getEngine() !== eng) {
      this.pushOutcome(eng, intent, '失败', '执行', reportFailed(intent.action), '世界已重铸，本策作废');
      return { ok: false };
    }
    const outcome = executeIntent(eng, ctx, intent);
    if (outcome.deferred) {
      // 延迟回读：登记验证队列，feed 置「执行中」
      this.verifications.push({
        feedId: -1,
        eng,
        dueTick: outcome.deferred.dueTick,
        verify: outcome.deferred.verify,
        intent,
        slots: outcome.slots,
      });
      const feedItem = this.pushOutcome(eng, intent, '执行中', '执行', REPORT_TEMPLATES[intent.action](outcome.slots), outcome.reason ?? '已施放，等待回读', outcome.at);
      this.verifications[this.verifications.length - 1].feedId = feedItem.id;
      return { ok: true };
    }
    this.pushOutcome(
      eng, intent,
      outcome.ok ? '已验证' : '失败',
      outcome.layer,
      outcome.ok ? REPORT_TEMPLATES[intent.action](outcome.slots) : reportFailed(intent.action),
      outcome.reason ?? '',
      outcome.at,
      outcome.ok,
    );
    if (outcome.ok) this.armCooldown(eng, intent);
    return { ok: outcome.ok };
  }

  /** 回读轮询：到点的延迟验证 → 终态 + 纪事 */
  private flushVerifications(currentEng: GameEngine): void {
    if (this.verifications.length === 0) return;
    const remain: PendingVerification[] = [];
    for (const v of this.verifications) {
      if (v.eng !== currentEng) continue; // 世界已重铸：验证作废（静默丢弃）
      if (currentEng.tickCount < v.dueTick) {
        remain.push(v);
        continue;
      }
      const res = v.verify();
      const report = REPORT_TEMPLATES[v.intent.action](v.slots);
      this.updateFeed(v.feedId, res.ok ? '已验证' : '失败', '回读', res.reason ?? '');
      if (res.ok) {
        this.armCooldown(currentEng, v.intent);
        currentEng.addEvent('oracle', `议会裁决：${report}`, {});
      }
    }
    this.verifications = remain;
  }

  private armCooldown(eng: GameEngine, intent: RulerIntent): void {
    const { key, years } = cooldownKey(intent);
    this.cooldowns.set(key, Math.floor(eng.yearF) + years);
    if (this.cooldowns.size > 200) {
      const now = Math.floor(eng.yearF);
      for (const [k, exp] of this.cooldowns) {
        if (exp <= now) this.cooldowns.delete(k);
      }
    }
  }

  private pushPending(eng: GameEngine, ctx: ConveneContext, intent: RulerIntent, coSigned: boolean, why?: string): void {
    // 复述 = 模板填槽预演（用 AI 地名原词——若解析失败会在批复执行时暴露并如实汇报）
    const restatement = REPORT_TEMPLATES[intent.action](intent.params as Record<string, string | number | undefined>);
    const feedItem = this.pushOutcome(eng, intent, '待确认', '仲裁', restatement, `高危动作${coSigned ? '（双席同议）' : ''}——等待造物主批复`);
    const item: CouncilPendingItem = {
      id: this.pendingSeq++,
      feedId: feedItem.id,
      year: ctx.year,
      agent: intent.agent,
      action: intent.action,
      restatement,
      params: intent.params,
      danger: 'high',
      coSigned,
      why,
    };
    this.pendingAge.set(item.id, this.conveneNo);
    this.pendingBorn.set(item.id, Date.now());
    useGameStore.setState({ councilPending: [...useGameStore.getState().councilPending, item].slice(-6) });
  }

  /** 待确认超龄作罢（2 次召开未批复 或 墙钟超龄——先到者为准） */
  private expirePending(): void {
    const s = useGameStore.getState();
    if (s.councilPending.length === 0) return;
    const keep: CouncilPendingItem[] = [];
    const now = Date.now();
    let changed = false;
    for (const p of s.councilPending) {
      const bornConvene = this.pendingAge.get(p.id) ?? this.conveneNo;
      const bornAt = this.pendingBorn.get(p.id) ?? now;
      if (this.conveneNo - bornConvene >= PENDING_EXPIRY_CONVENES || now - bornAt >= PENDING_EXPIRY_MS) {
        changed = true;
        this.updateFeed(p.feedId, '受阻', '仲裁', '逾期未批复，自动作罢');
        this.pendingAge.delete(p.id);
        this.pendingBorn.delete(p.id);
      } else {
        keep.push(p);
      }
    }
    if (changed) useGameStore.setState({ councilPending: keep });
  }

  /** 意图处置结果入流（含可选纪事） */
  private pushOutcome(
    eng: GameEngine,
    intent: RulerIntent,
    status: CouncilFeedItem['status'],
    layer: CouncilFeedItem['layer'],
    report: string,
    detail: string,
    at?: [number, number],
    chroniclize = false,
  ): CouncilFeedItem {
    const item = this.pushRaw(eng, {
      agent: intent.agent, action: intent.action,
      report, status, layer, detail, why: intent.why, at,
    }, chroniclize);
    return item;
  }

  private pushRaw(
    eng: GameEngine,
    draft: {
      agent: RulerRole; action: FeedAction;
      report: string; status: CouncilFeedItem['status']; layer: CouncilFeedItem['layer'];
      detail: string; why?: string; at?: [number, number];
    },
    chroniclize: boolean,
  ): CouncilFeedItem {
    const item: CouncilFeedItem = {
      id: this.feedSeq++,
      year: Math.floor(eng.yearF),
      agent: draft.agent,
      action: draft.action,
      report: draft.report,
      status: draft.status,
      layer: draft.layer,
      detail: draft.detail,
      why: draft.why,
      at: draft.at,
      ts: Date.now(),
    };
    useGameStore.setState({ councilFeed: [item, ...useGameStore.getState().councilFeed].slice(0, 60) });
    if (chroniclize && draft.status === '已验证') {
      eng.addEvent('oracle', `议会裁决：${draft.report}`, draft.at ? { x: draft.at[0], y: draft.at[1] } : {});
    }
    return item;
  }

  private updateFeed(feedId: number, status: CouncilFeedItem['status'], layer: CouncilFeedItem['layer'], detail: string): void {
    useGameStore.setState((s) => ({
      councilFeed: s.councilFeed.map((f) => (f.id === feedId ? { ...f, status, layer, detail: detail || f.detail } : f)),
    }));
  }
}

// —— 惰性单例（避免与 gameStore 的模块环引用在求值期触雷） ——
let _instance: RulerCouncil | null = null;
export function getCouncil(): RulerCouncil {
  if (!_instance) _instance = new RulerCouncil();
  return _instance;
}
