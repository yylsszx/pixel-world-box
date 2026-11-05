// ============ 神谕 · dsh 持久会话面前端接线（M-O4 相三挂账①） ============
// 服务端权威历史：oracle-server v1.2 body.dsh.sessionId——事件溯源 JSONL 落盘 + compaction。
// 前端职责仅三件：sessionId 生成/持久化（localStorage）、重开轮换；请求面组装见 direct-client.ts。
// 切后台/刷新续跑的锚点：sessionId 存 localStorage——UI 气泡可失，服务端历史不失，
// 重开后同 sessionId 续发即从事件日志投影回放（100 轮不失忆验收链的前端半边）。

const DSH_ON_KEY = 'oracle-dsh-on-v1';
const DSH_SESSION_KEY = 'oracle-dsh-session-v1';

/** sessionId 形状面（与 oracle-server server.mjs 守卫同规：1–64 位 [A-Za-z0-9._-]） */
export function isValidSessionId(id: string): boolean {
  return /^[A-Za-z0-9._-]{1,64}$/.test(id);
}

/** 新会话 id：s-<base36 时间戳>-<base36 随机>——恒匹配服务端形状守卫 */
export function createSessionId(now = Date.now()): string {
  const rand = Math.floor(Math.random() * 36 ** 10).toString(36);
  return `s-${now.toString(36)}-${rand}`;
}

/** localStorage 不可用时的内存降级（node/SSR/隐私模式）：镜像写入保证会话内自洽 */
const memStore = new Map<string, string>();

/** localStorage 安全读写（隐私模式/配额/非浏览器环境降级为内存态） */
function safeGet(key: string): string {
  try {
    const v = globalThis.localStorage?.getItem(key);
    if (v !== null && v !== undefined) return v;
  } catch {
    /* 读取失败 → 内存降级 */
  }
  return memStore.get(key) ?? '';
}

function safeSet(key: string, v: string): void {
  try {
    globalThis.localStorage?.setItem(key, v);
  } catch {
    /* 写入失败（配额/隐私模式）→ 内存降级 */
  }
  memStore.set(key, v);
}

/** dsh 持久会话开关（localStorage 持久化；默认关——中继后端专属面） */
export function loadDshOn(): boolean {
  return safeGet(DSH_ON_KEY) === '1';
}

export function storeDshOn(on: boolean): void {
  safeSet(DSH_ON_KEY, on ? '1' : '0');
}

/** 恢复持久 sessionId（切后台/刷新续跑锚点）；无或损坏则新生成并落盘 */
export function loadOrCreateSessionId(): string {
  const prev = safeGet(DSH_SESSION_KEY);
  if (prev && isValidSessionId(prev)) return prev;
  const id = createSessionId();
  safeSet(DSH_SESSION_KEY, id);
  return id;
}

/** 重开会话（清空气泡时调用）：轮换新 id——旧会话仍在服务端留档，可审计可回放 */
export function rotateSessionId(): string {
  const id = createSessionId();
  safeSet(DSH_SESSION_KEY, id);
  return id;
}
