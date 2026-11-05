// ============ M-O4 相三：dsh 会话记忆引擎（回合事件机 + 投影回放 + compaction 双策略） ============
// 职责：把 oracle-server 的 dsh 会话面从「单回合无状态」升格为「服务端权威持久会话」——
//       ① 回合事件机：按 dsh 事件词汇（turn/start、user/message、assistant/message、tool/call、
//          tool/result、turn/end）逐事件落盘到 ctx.sessionPersistence（JSONL 后端）；
//       ② 投影回放：dsh 官方 foldSurface 折叠事件日志 → 表面节点 → 推导 OpenAI 线消息
//          （tool_calls 由 tool/call 事件回注 assistant——与相二直连形态逐字节等价）；
//       ③ compaction 双策略（dsh compaction 事件协议，词汇级复用禁自造）：
//          - tool-result-pruner：compaction/prune 计价 → 紧随单节点 tool/result 重写（只改 content，
//            assertToolResultRewrite 硬约束）；
//          - compaction-basic：compaction/start → compaction/summary（叙事化纪要，禁 dump JSON）→
//            紧随 replace 型 user/message 节点 → compaction/end（邻接协议）。
//       事件溯源：表面被压缩不代表失忆——全量事件永远在日志里（100 轮不失忆 = 表面预算内含锚点 + 日志全量）。
// 本模块必须在 dsh-hook 注册之后首次 import（runtime-boot.mjs 挂载序：tsx → dsh-hook → pwb 五件 → 本文件）。
import { foldSurface } from '@deepseek-ai/dsh-session';
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session';
import { textOfContent as textOf, textFromFrontendContent } from './dsh-wire-text.mjs';

export { textFromFrontendContent };

/** 文本内容块（dsh ContentBlock: {type:'text', text}） */
const textBlock = (text) => ({ type: 'text', text });

/** 截断到 n 字（叙事化引用上限） */
const clip = (s, n) => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1))}…`);

let compactionCounter = 0;
const newCompactionId = () => `comp-${Date.now().toString(36)}-${(compactionCounter += 1)}`;

/** 单会话运行态 */
class SessionState {
  constructor(id, handle) {
    this.id = id;
    this.handle = handle; // JsonlWriteHandle（进程内单写者）
    this.events = []; // 逻辑日志镜像（append 后同步 push，免重读）
    this.turn = 0; // 最后一个 turn/start 的 turn 号
  }
}

export class SessionMemory {
  /**
   * @param {import('@deepseek-ai/cordis').Context} app - cordis 上下文（ctx.sessionPersistence 由 runtime-boot 装配）
   * @param {{ budgetChars?: number, keepTail?: number, pruneKeep?: number }} options
   */
  constructor(app, options = {}) {
    this.app = app;
    this.budgetChars = options.budgetChars ?? 24_000; // 与中继 MAX_CONTENT_CHARS 同量级
    this.keepTail = options.keepTail ?? 8; // compaction-basic 保留尾部表面节点数
    this.pruneKeep = options.pruneKeep ?? 6; // tool-result-pruner 保留最近工具结果数
    /** @type {Map<string, SessionState>} */
    this.states = new Map();
  }

  _store() {
    const store = this.app.sessionPersistence;
    if (!store) throw new Error('ctx.sessionPersistence 未就位（runtime-boot 未装配持久化后端）');
    return store;
  }

  /**
   * 就绪会话（存在则写打开续写，不存在则创建）；恢复 turn 计数与日志镜像。
   * 幂等：同一进程内重复调用返回既有运行态。
   */
  async ensureSession(sessionId) {
    let state = this.states.get(sessionId);
    if (state) return state;
    const store = this._store();
    const existing = await store.stat(sessionId);
    const handle = existing
      ? await store.open(sessionId, 'write')
      : await store.create({
        version: SESSION_FORMAT_VERSION,
        id: sessionId,
        createdAt: Date.now(),
        isSeeded: false,
      });
    state = new SessionState(sessionId, handle);
    const { events } = await handle.read(0);
    state.events = events;
    for (const ev of events) {
      if (ev.type === 'turn/start' && Number.isSafeInteger(ev.data?.turn)) state.turn = Math.max(state.turn, ev.data.turn);
    }
    this.states.set(sessionId, state);
    return state;
  }

  /** 是否已知会话（供预检与统计） */
  has(sessionId) {
    return this.states.has(sessionId);
  }

  /** 镜像对账：句柄游标与镜像长度漂移时全量重读（外部进程写入/异常恢复鲁棒性） */
  async _resync(state) {
    if (state.handle.nextSeq === state.events.length) return;
    const { events } = await state.handle.read(0);
    state.events = events;
    state.turn = 0;
    for (const ev of state.events) {
      if (ev.type === 'turn/start' && Number.isSafeInteger(ev.data?.turn)) state.turn = Math.max(state.turn, ev.data.turn);
    }
  }

  /**
   * 开新回合：turn/start + user/message（服务端权威——前端 messages 仅取本回合输入）。
   * @returns {{ turn: number }}
   */
  async beginTurn(sessionId, userText) {
    const state = await this.ensureSession(sessionId);
    await this._resync(state);
    state.turn += 1;
    const turn = state.turn;
    const stamp = state.events.length;
    const turnStart = { type: 'turn/start', seq: stamp, time: Date.now(), data: { turn } };
    const userEv = {
      type: 'user/message',
      seq: stamp + 1,
      time: Date.now(),
      data: { id: `m-${stamp + 1}`, role: 'user', source: { kind: 'user' }, content: [textBlock(userText)] },
      surfaceOp: 'append',
    };
    await state.handle.append([turnStart, userEv]);
    state.events.push(turnStart, userEv);
    return { turn };
  }

  /**
   * 投影回放 → OpenAI 线消息（dsh foldSurface 折叠 + tool/call 回注 tool_calls）。
   * 返回不含 system 的对话体；system 提示由调用方每次现组装（纪事近况逐回合刷新）。
   */
  wireMessages(sessionId) {
    const state = this.states.get(sessionId);
    if (!state) return [];
    const fold = foldSurface(state.events);
    const bySeq = new Map(state.events.map((ev) => [ev.seq, ev]));
    const callById = new Map();
    for (const ev of state.events) {
      if (ev.type === 'tool/call' && ev.data?.callId) callById.set(ev.data.callId, ev.data);
    }
    const msgs = [];
    let lastAssistant = null;
    for (const seq of fold.nodes) {
      const ev = bySeq.get(seq);
      if (!ev) continue;
      if (ev.type === 'user/message') {
        msgs.push({ role: 'user', content: textOf(ev.data?.content) });
      } else if (ev.type === 'assistant/message') {
        const m = { role: 'assistant', content: textOf(ev.data?.message?.content) || null };
        msgs.push(m);
        lastAssistant = m;
      } else if (ev.type === 'tool/result') {
        const toolCallId = ev.data?.message?.toolCallId;
        const call = toolCallId ? callById.get(toolCallId) : undefined;
        if (lastAssistant) {
          if (!Array.isArray(lastAssistant.tool_calls)) lastAssistant.tool_calls = [];
          lastAssistant.tool_calls.push({
            id: toolCallId,
            type: 'function',
            function: { name: call?.name ?? 'unknown', arguments: call?.arguments ?? '{}' },
          });
        }
        msgs.push({ role: 'tool', tool_call_id: toolCallId, content: textOf(ev.data?.message?.content) });
      }
    }
    return msgs;
  }

  /** 工具轮落盘：assistant（tool_calls 轮）+ 逐 callId 的 tool/call（日志件） */
  async recordAssistantToolCalls(sessionId, turn, calls, text, provider) {
    const state = this.states.get(sessionId);
    if (!state) return;
    await this._resync(state);
    const stamp = state.events.length;
    const asstEv = {
      type: 'assistant/message',
      seq: stamp,
      time: Date.now(),
      data: {
        turn,
        step: 1,
        message: {
          id: `m-${stamp}`,
          role: 'assistant',
          source: { kind: 'model', provider: provider?.label || provider?.model || 'openai', model: provider?.model || 'unknown' },
          content: text ? [textBlock(text)] : [],
        },
        stream: [],
      },
      surfaceOp: 'append',
    };
    const callEvs = calls.map((c, i) => ({
      type: 'tool/call',
      seq: stamp + 1 + i,
      time: Date.now(),
      data: { turn, step: 1, callId: c.id || `call_${c.index ?? i}`, name: c.name, arguments: c.arguments || '{}' },
    }));
    await state.handle.append([asstEv, ...callEvs]);
    state.events.push(asstEv, ...callEvs);
  }

  /** 工具结果落盘：tool/result（OpenAI tool 角色等价；content 与直连面推送字节一致） */
  async recordToolResults(sessionId, turn, pairs) {
    const state = this.states.get(sessionId);
    if (!state || !pairs.length) return;
    await this._resync(state);
    const stamp = state.events.length;
    const batch = pairs.map((p, i) => ({
      type: 'tool/result',
      seq: stamp + i,
      time: Date.now(),
      data: {
        turn,
        step: 1,
        message: {
          id: `m-${stamp + i}`,
          role: 'tool',
          source: { kind: 'tool', callId: p.callId },
          toolCallId: p.callId,
          content: [textBlock(p.content)],
        },
      },
      surfaceOp: 'append',
    }));
    await state.handle.append(batch);
    state.events.push(...batch);
  }

  /** 收回合：终文 assistant（有文本才落）+ turn/end + compaction 双策略（预算超限才动）。 */
  async endTurn(sessionId, turn, finalText, provider) {
    const state = this.states.get(sessionId);
    if (!state) return { compacted: false, pruned: 0 };
    await this._resync(state);
    const stamp = state.events.length;
    const batch = [];
    if (finalText) {
      batch.push({
        type: 'assistant/message',
        seq: stamp + batch.length,
        time: Date.now(),
        data: {
          turn,
          step: 1,
          message: {
            id: `m-${stamp + batch.length}`,
            role: 'assistant',
            source: { kind: 'model', provider: provider?.label || provider?.model || 'openai', model: provider?.model || 'unknown' },
            content: [textBlock(finalText)],
          },
          stream: [],
        },
        surfaceOp: 'append',
      });
    }
    batch.push({ type: 'turn/end', seq: stamp + batch.length, time: Date.now(), data: { turn, reason: { kind: 'completed' } } });
    await state.handle.append(batch);
    state.events.push(...batch);
    const pruned = await this._pruneToolResults(state);
    const compacted = await this._compactBasic(state);
    return { compacted, pruned };
  }

  /** 表面预算核算：回放线消息的总字符（content + tool_calls） */
  _surfaceChars(sessionId) {
    const msgs = this.wireMessages(sessionId);
    let total = 0;
    for (const m of msgs) {
      total += typeof m.content === 'string' ? m.content.length : 0;
      if (Array.isArray(m.tool_calls)) total += JSON.stringify(m.tool_calls).length;
    }
    return total;
  }

  /**
   * 策略一 tool-result-pruner：超出保留数的旧 tool/result 节点重写为叙事化占位。
   * dsh 协议：compaction/prune 计价事件 → 紧随单节点 tool/result replace（只改 content——
   * assertToolResultRewrite 要求 id/source/toolCallId/turn/step 逐字段相等）。
   * @returns {number} 修剪节点数
   */
  async _pruneToolResults(state) {
    const fold = foldSurface(state.events);
    const bySeq = new Map(state.events.map((ev) => [ev.seq, ev]));
    const resultNodes = fold.nodes.filter((seq) => bySeq.get(seq)?.type === 'tool/result');
    if (resultNodes.length <= this.pruneKeep) return 0;
    const toPrune = resultNodes.slice(0, resultNodes.length - this.pruneKeep);
    let pruned = 0;
    for (const seq of toPrune) {
      const original = bySeq.get(seq);
      const stubText = `[已修剪] 第 ${original.data?.turn ?? '?'} 轮工具结果——完整输出仍在事件日志（seq ${seq}），近期结论见会话纪要`;
      const stamp = state.events.length;
      const callId = original.data?.message?.toolCallId ?? original.data?.message?.source?.callId ?? `call_${seq}`;
      const pruneEv = {
        type: 'compaction/prune',
        seq: stamp,
        time: Date.now(),
        data: {
          shadowedRange: { start: seq, end: seq },
          shadowedSeqs: [seq],
          shadowedTokenCount: Math.ceil(textOf(original.data?.message?.content).length / 4),
        },
      };
      const replacement = {
        type: 'tool/result',
        seq: stamp + 1,
        time: Date.now(),
        data: {
          turn: original.data.turn,
          step: original.data.step,
          message: { ...original.data.message, content: [textBlock(stubText)] },
        },
        surfaceOp: { op: 'replace', startSeq: seq, endSeq: seq },
        sourceEventSeqs: [seq],
      };
      await state.handle.append([pruneEv, replacement]);
      state.events.push(pruneEv, replacement);
      pruned += 1;
    }
    return pruned;
  }
  /**
   * 策略二 compaction-basic：表面总字符超预算 → 最旧区间整体替换为一枚叙事化纪要节点。
   * dsh 协议：compaction/start（锁）→ compaction/summary（纪要+计价）→ 紧随 replace 型
   * user/message（sourceEventSeqs 覆盖全部被影节点）→ compaction/end（解锁）。
   * 系统头保护：本面不落 system/message 事件，node 0 恒为 user/message，可安全入区间。
   * @returns {boolean} 是否发生压缩
   */
  async _compactBasic(state) {
    if (this._surfaceChars(state.id) <= this.budgetChars) return false;
    const fold = foldSurface(state.events);
    const bySeq = new Map(state.events.map((ev) => [ev.seq, ev]));
    if (fold.nodes.length <= this.keepTail + 4) return false; // 太薄不压
    const span = fold.nodes.slice(0, fold.nodes.length - this.keepTail);
    const startSeq = span[0];
    const endSeq = span[span.length - 1];
    // —— 叙事化纪要（禁 dump JSON：按轮取意图→回应→工具计数，逐条限幅） ——
    const turns = new Map();
    for (const seq of span) {
      const ev = bySeq.get(seq);
      if (!ev) continue;
      // 纪要节点跳过逐轮归并（由下方整段承继，防二次截断）
      if (ev.type === 'user/message' && textOf(ev.data?.content).startsWith('［会话纪要')) continue;
      const turn = ev.data?.turn;
      const slot = turns.get(turn) ?? { user: '', assistant: '', tools: [] };
      if (ev.type === 'user/message' && !slot.user) slot.user = textOf(ev.data?.content);
      else if (ev.type === 'assistant/message' && ev.data?.message?.content?.length && !slot.assistant) {
        slot.assistant = textOf(ev.data.message.content);
      } else if (ev.type === 'tool/call') slot.tools.push(ev.data?.name ?? '?');
      turns.set(turn, slot);
    }
    const lines = [];
    for (const [turn, slot] of [...turns.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))) {
      const toolNote = slot.tools.length ? `（工具×${slot.tools.length}: ${[...new Set(slot.tools)].slice(0, 3).join(',')}）` : '';
      lines.push(`第${turn ?? '?'}轮：用户「${clip(slot.user, 60)}」→助手「${clip(slot.assistant, 60)}」${toolNote}`);
    }
    // 前次压缩的纪要节点整段承继（叙事化嵌套不截断）——多级压缩下早期锚点零丢失，
    // 这是「100 轮不失忆」的关键不变量；turns 迭代已按同判别跳过纪要节点
    for (const seq of span) {
      const ev = bySeq.get(seq);
      if (ev?.type !== 'user/message') continue;
      const text = textOf(ev.data?.content);
      if (text.startsWith('［会话纪要')) lines.push(text);
    }
    const firstTurn = turns.size ? [...turns.keys()].sort((a, b) => (a ?? 0) - (b ?? 0))[0] : '?';
    const summaryText = [
      `［会话纪要 · 第${firstTurn}轮起共 ${turns.size} 轮（第 ${state.turn} 轮之前的早期区间）］`,
      ...lines,
      `（以上为叙事化摘要；被影区间 ${span.length} 个表面节点的全文事件仍完整保存在日志中，可按 seq 溯源。）`,
    ].join('\n');
    const compactionId = newCompactionId();
    const stamp = state.events.length;
    const startEv = { type: 'compaction/start', seq: stamp, time: Date.now(), data: { compactionId, turn: null } };
    const summaryEv = {
      type: 'compaction/summary',
      seq: stamp + 1,
      time: Date.now(),
      data: {
        compactionId,
        summary: [textBlock(summaryText)],
        shadowedRange: { start: startSeq, end: endSeq },
        shadowedSeqs: span.slice(),
        shadowedTokenCount: Math.ceil(summaryText.length / 4),
        provider: 'pwb-template',
        model: 'narrative-v1',
      },
    };
    const replaceEv = {
      type: 'user/message',
      seq: stamp + 2,
      time: Date.now(),
      data: { id: `m-${stamp + 2}`, role: 'user', source: { kind: 'user' }, content: [textBlock(summaryText)] },
      surfaceOp: { op: 'replace', startSeq, endSeq },
      sourceEventSeqs: span.slice(),
    };
    const endEv = { type: 'compaction/end', seq: stamp + 3, time: Date.now(), data: { compactionId, turn: null } };
    await state.handle.append([startEv, summaryEv, replaceEv, endEv]);
    state.events.push(startEv, summaryEv, replaceEv, endEv);
    return true;
  }

  /** 会话统计（healthz 面） */
  async stats() {
    try {
      const list = await this._store().list();
      return { backend: 'jsonl', sessions: list.length, open_writers: this.states.size };
    } catch {
      return { backend: 'jsonl', sessions: -1, open_writers: this.states.size };
    }
  }

  /** 优雅退出：flush + 关闭全部写句柄 */
  async dispose() {
    for (const state of this.states.values()) {
      try { await state.handle.close(); } catch { /* 幂等 */ }
    }
    this.states.clear();
  }
}

export default SessionMemory;
