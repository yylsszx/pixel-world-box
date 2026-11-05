// ============ M-O4 相三：dsh 会话持久化 JSONL 后端（PWB 对 dsh 缝的实现，不改 dsh 逻辑） ============
// 职责：实现 @deepseek-ai/dsh-session-persistence 的抽象 SessionPersistence（ctx.sessionPersistence 缝）——
//       事件溯源日志按会话落盘为 JSONL（行 0 = {header, inheritedEventCount} 元数据行，行 1+ = SessionEvent 逐行）。
// 选型记录（挂账① storage 选型）：**JSONL 胜出**，理由——
//       ① 零依赖（node:fs 内置，镜像构建不触网，与 server.mjs 设计铁律①一致）；
//       ② 与缝的快照语义原生对齐（SessionPersistenceSnapshot.sizeBytes 文档明言 JSONL 形态）；
//       ③ 人类可读可导出，事件溯源天然可审计；sqlite（node:sqlite）留作后补实现（接口不变，属只加不减）。
// 契约遵循（全部复用 dsh 官方校验件，禁自造）：
//       materializeCreateHeader / materializeAppendBatch / assertContiguous / validateStoredEvents /
//       assertVersion / assertStoredId + 官方错误类；append 即持久化（writeSync 整行）→ flush = fsync 屏障
//       （缝文档明示此形态合法："a backend whose append already persists ... treats flush as materialize-if-needed"）。
//       撕裂尾：写打开时截断到最近完整行；读路径只返回合法连续前缀。
// 所有权：进程内单写者（writers Map）——跨进程租约层 dsh 已预留（SessionOwnershipLostError），v1 不需要。
// 本模块必须在 dsh-hook 注册之后首次 import（runtime-boot.mjs 挂载序：tsx → dsh-hook → 本文件）。
import { closeSync, existsSync, fsyncSync, ftruncateSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeSync } from 'node:fs';
import path from 'node:path';
import { SessionPersistence } from '@deepseek-ai/dsh-session-persistence';
import {
  SessionAlreadyExistsError,
  SessionAlreadyOwnedError,
  SessionHandleClosedError,
  SessionPersistenceCorruptionError,
  SessionPersistenceNotFoundError,
  SessionReadOnlyError,
  assertContiguous,
  assertStoredId,
  assertVersion,
  materializeAppendBatch,
  materializeCreateHeader,
  validateStoredEvents,
} from '@deepseek-ai/dsh-session-persistence';

/** 把会话 id 编码为安全文件名：白名单字符保留，其余 %XX 转义（% 不在白名单，转义无歧义无碰撞）。 */
function encodeId(id) {
  return String(id).replace(/[^A-Za-z0-9._-]/g, (c) => {
    let out = '';
    for (const byte of Buffer.from(c, 'utf8')) out += `%${byte.toString(16).padStart(2, '0').toUpperCase()}`;
    return out;
  });
}

/** 读一个 JSONL 会话工件：返回 { header, inheritedEventCount, events, sizeBytes, mtimeMs, torn }；撕裂尾自动止步。 */
function readArtifact(filePath) {
  const st = statSync(filePath);
  const raw = readFileSync(filePath, 'utf8');
  const firstNl = raw.indexOf('\n');
  if (firstNl === -1) {
    return { header: null, inheritedEventCount: 0, events: [], sizeBytes: st.size, mtimeMs: st.mtimeMs, torn: true };
  }
  let header = null;
  let inheritedEventCount = 0;
  try {
    const meta = JSON.parse(raw.slice(0, firstNl).trim());
    header = meta?.header ?? null;
    inheritedEventCount = Number.isSafeInteger(meta?.inheritedEventCount) ? meta.inheritedEventCount : 0;
  } catch {
    return { header: null, inheritedEventCount: 0, events: [], sizeBytes: st.size, mtimeMs: st.mtimeMs, torn: true };
  }
  const events = [];
  let torn = false;
  const body = raw.slice(firstNl + 1);
  let pos = 0;
  while (pos < body.length) {
    const nl = body.indexOf('\n', pos);
    if (nl === -1) { torn = true; break; } // 无换行符结尾 → 撕裂尾，不入读
    const line = body.slice(pos, nl).trim();
    if (line) {
      try {
        events.push(JSON.parse(line));
      } catch {
        torn = true; // 中段坏行 → 合法连续前缀到此为止
        break;
      }
    }
    pos = nl + 1;
  }
  return { header, inheritedEventCount, events, sizeBytes: st.size, mtimeMs: st.mtimeMs, torn };
}

/** 单会话写句柄（SessionHandle 具体实现；nextSeq 为装配方定序便利，属具体后端扩展面而非缝面） */
class JsonlWriteHandle {
  /** @param {JsonlSessionPersistence} store */
  constructor(store, id, header, inheritedEventCount, fd, nextSeq) {
    this.store = store;
    this.id = id;
    this.header = header;
    this.inheritedEventCount = inheritedEventCount;
    this.access = 'write';
    this._fd = fd;
    this._nextSeq = nextSeq;
    this._closed = false;
  }

  /** 存储游标：下一个事件的 seq（装配方以 events.length 对账）。 */
  get nextSeq() {
    this._assertOpen();
    return this._nextSeq;
  }

  _assertOpen() {
    if (this._closed) throw new SessionHandleClosedError(this.id);
  }

  async read(offset = 0, length = undefined) {
    this._assertOpen();
    return this.store._readSlice(this.id, offset, length);
  }

  async append(events) {
    this._assertOpen();
    const batch = materializeAppendBatch(events);
    assertContiguous(this.id, batch, this._nextSeq);
    for (const ev of batch) {
      writeSync(this._fd, `${JSON.stringify(ev)}\n`);
      this._nextSeq += 1;
    }
  }

  async flush() {
    this._assertOpen();
    fsyncSync(this._fd);
  }

  async close() {
    if (this._closed) return;
    this._closed = true;
    try { fsyncSync(this._fd); } catch { /* 尽力而为 */ }
    try { closeSync(this._fd); } catch { /* 幂等 */ }
    this.store._writers.delete(this.id);
  }

  [Symbol.asyncDispose]() {
    return this.close();
  }
}

/** 单会话读句柄（无所有权；不持 fd，随读随开） */
class JsonlReadHandle {
  constructor(store, id, header, inheritedEventCount) {
    this.store = store;
    this.id = id;
    this.header = header;
    this.inheritedEventCount = inheritedEventCount;
    this.access = 'read';
    this._closed = false;
  }

  _assertOpen() {
    if (this._closed) throw new SessionHandleClosedError(this.id);
  }

  async read(offset = 0, length = undefined) {
    this._assertOpen();
    return this.store._readSlice(this.id, offset, length);
  }

  async append() {
    this._assertOpen();
    throw new SessionReadOnlyError(this.id, 'append');
  }

  async flush() {
    this._assertOpen();
    throw new SessionReadOnlyError(this.id, 'flush');
  }

  async close() {
    this._closed = true;
  }

  [Symbol.asyncDispose]() {
    return this.close();
  }
}

/**
 * JSONL 后端（cordis Service：super(ctx, 'sessionPersistence') 自动注册为 ctx.sessionPersistence）。
 * 目录布局：<root>/sessions/<encodeId(id)>.jsonl
 */
export class JsonlSessionPersistence extends SessionPersistence {
  /**
   * @param {import('@deepseek-ai/cordis').Context} ctx - cordis 上下文（由 runtime-boot 传入）
   * @param {{ root: string }} options - 存储根目录（PWB_STORE_ROOT）
   */
  constructor(ctx, options) {
    super(ctx, 'sessionPersistence');
    this.root = path.resolve(options?.root ?? 'pwb-store');
    this._sessionsDir = path.join(this.root, 'sessions');
    mkdirSync(this._sessionsDir, { recursive: true });
    /** @type {Map<string, JsonlWriteHandle>} 进程内写所有权 */
    this._writers = new Map();
  }

  _path(id) {
    return path.join(this._sessionsDir, `${encodeId(id)}.jsonl`);
  }

  /** 读某会话完整工件（缓存未命中即盘读）；不存在返回 undefined。 */
  _artifact(id) {
    const filePath = this._path(id);
    if (!existsSync(filePath)) return undefined;
    try {
      return { filePath, ...readArtifact(filePath) };
    } catch (e) {
      throw new SessionPersistenceCorruptionError(`session "${id}" artifact unreadable: ${String(e?.message ?? e)}`, { cause: e });
    }
  }

  /** 缝内部：按 [offset, offset+length) 读合法连续前缀切片（官方 validateStoredEvents 校验后返回 detached 值）。 */
  async _readSlice(id, offset = 0, length = undefined) {
    const art = this._artifact(id);
    if (!art || !art.header) throw new SessionPersistenceNotFoundError(id);
    assertStoredId(id, art.header);
    assertVersion(art.header, { kind: 'jsonl', path: art.filePath });
    const validated = validateStoredEvents(art.header, art.events.slice(), { kind: 'jsonl', path: art.filePath });
    const start = Math.max(0, Math.trunc(offset) || 0);
    const slice = length === undefined ? validated.slice(start) : validated.slice(start, start + Math.max(0, Math.trunc(length)));
    return { eventState: 'detached', events: slice };
  }

  /** 快照组装（stat/list 共用）；header 缺失（撕裂元数据行）视作不存在。 */
  _snapshot(id) {
    const art = this._artifact(id);
    if (!art || !art.header) return undefined;
    return {
      header: art.header,
      revision: `${art.sizeBytes}:${art.mtimeMs}`,
      eventCount: art.events.length,
      sizeBytes: art.sizeBytes,
      location: { kind: 'jsonl', path: art.filePath },
    };
  }

  async create(header, options) {
    materializeCreateHeader(header); // 先校验（lossless JSON + createdAt）
    assertVersion(header);
    if (header.isSeeded && !Number.isSafeInteger(options?.inheritedEventCount)) {
      throw new TypeError('seeded session create requires inheritedEventCount');
    }
    const id = header.id;
    if (this._writers.has(id) || this._snapshot(id) !== undefined) {
      throw new SessionAlreadyExistsError(id);
    }
    const inheritedEventCount = header.isSeeded ? options.inheritedEventCount : 0;
    const filePath = this._path(id);
    const fd = openSync(filePath, 'w');
    writeSync(fd, `${JSON.stringify({ header, inheritedEventCount })}\n`);
    const handle = new JsonlWriteHandle(this, id, header, inheritedEventCount, fd, 0);
    this._writers.set(id, handle);
    return handle;
  }

  async open(id, access) {
    const art = this._artifact(id);
    if (!art || !art.header) throw new SessionPersistenceNotFoundError(id);
    assertStoredId(id, art.header);
    assertVersion(art.header, { kind: 'jsonl', path: art.filePath });
    if (access === 'read') {
      return new JsonlReadHandle(this, id, art.header, art.inheritedEventCount);
    }
    // 写打开：单写者所有权 + 撕裂尾截断（写路径在首次 append 前修复物理尾）
    const existing = this._writers.get(id);
    if (existing && !existing._closed) throw new SessionAlreadyOwnedError(id);
    let nextSeq = art.events.length;
    if (art.torn) {
      // 重建完好内容：元数据行 + 已解析事件行
      const lines = [JSON.stringify({ header: art.header, inheritedEventCount: art.inheritedEventCount })];
      for (const ev of art.events) lines.push(JSON.stringify(ev));
      const good = Buffer.from(`${lines.join('\n')}\n`, 'utf8');
      const fd0 = openSync(art.filePath, 'r+');
      try {
        writeSync(fd0, good, 0, good.length, 0);
        ftruncateSync(fd0, good.length);
        fsyncSync(fd0);
      } finally {
        closeSync(fd0);
      }
      nextSeq = art.events.length;
    }
    const fd = openSync(this._path(id), 'a');
    const handle = new JsonlWriteHandle(this, id, art.header, art.inheritedEventCount, fd, nextSeq);
    this._writers.set(id, handle);
    return handle;
  }

  async flush() {
    // 服务级屏障：全部活跃写句柄 fsync（缝契约：与各句柄自身 flush 等价）
    for (const handle of [...this._writers.values()]) {
      try {
        await handle.flush();
      } catch { /* 单句柄失败不阻塞其余（AggregateError 语义在 v1 简化为尽力而为） */ }
    }
  }

  async stat(id) {
    return this._snapshot(id);
  }

  async list() {
    const out = [];
    for (const entry of readdirSync(this._sessionsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const id = this._decodeFilename(entry.name.slice(0, -'.jsonl'.length));
      if (id === null) continue;
      const snap = this._snapshot(id);
      if (snap) out.push(snap);
    }
    return out;
  }

  /** 文件名反解码（%XX → 字节）；非本编码产物返回 null。 */
  _decodeFilename(name) {
    if (!name.includes('%')) return /^[A-Za-z0-9._-]+$/.test(name) ? name : null;
    const bytes = [];
    for (let i = 0; i < name.length; i += 1) {
      const ch = name[i];
      if (ch === '%') {
        const hex = name.slice(i + 1, i + 3);
        if (!/^[0-9A-F]{2}$/.test(hex)) return null;
        bytes.push(parseInt(hex, 16));
        i += 2;
      } else if (/[A-Za-z0-9._-]/.test(ch)) {
        bytes.push(ch.charCodeAt(0));
      } else {
        return null;
      }
    }
    try {
      return Buffer.from(bytes).toString('utf8');
    } catch {
      return null;
    }
  }

  /** 装配方便利：关闭本进程全部写句柄（server 优雅退出调用）。 */
  async closeAll() {
    for (const handle of [...this._writers.values()]) {
      try { await handle.close(); } catch { /* 幂等 */ }
    }
  }
}

export default JsonlSessionPersistence;
