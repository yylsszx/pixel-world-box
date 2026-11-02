// M-O4 相一：pwb 插件五件（pwb-tools / pwb-context / pwb-prompt / pwb-bridge / pwb-store）
// 纪律：只加不减（提示词恒定段）——本文件是 V2 服务端运行时的五件注册面；
// 相一 = 契约 + 最小实现（fixture 级），相二接 oracle-server HTTP/WS 收口。
// 蓝本：docs/ORACLE_V2.md §4 纪律映射 + docs/deepseek-harness-adaptation.md §3 映射表。
// 每个 apply(ctx) 遵循 cordis 插件签名；返回 disposer（只加不减的"减"由 disposer 承担，
// 代码层面不删除任何既有注册）。

// defineTool 规范化（钩子环境下可用；无钩子环境降级裸注册）——
// 实证：裸对象的 output.schema.items.type:'json' 被严格校验拒绝（UNSUPPORTED_SCHEMA），
// defineTool 包装后同 schema 注册通过（池冒烟五步先例）。
let defineTool = null
try { ({ defineTool } = await import('@deepseek-ai/dsh-tools')) } catch { /* 无钩子环境：相二由 server 显式注入 */ }

function normalizeTool(spec) {
  return defineTool ? defineTool(spec) : spec
}

// ---- pwb-tools：游戏工具桥（WorldBox 侧能力 → dsh native 工具）----
// 相二：从浏览器世界快照注册 spawn/天气/纪事等真实工具（adaptation §3 映射 oracle/tools.ts）
export function applyPwbTools(ctx) {
  const tools = []
  const disposers = []
  const register = (tool) => {
    tools.push(tool)
    if (ctx.tools) disposers.push(ctx.tools.register(tool))
    return tool
  }
  // fixture：冒烟回显工具（验证注册→执行全链；相二保留作健康探针）
  register(normalizeTool({
    name: 'wb_echo',
    description: 'PWB runtime fixture: echo text back as content blocks.',
    parameters: { text: { type: 'string', required: true, description: 'Text to echo.' } },
    output: { schema: { type: 'array', items: { type: 'json' } }, render: (_args, value) => value },
    async execute(args) { return [{ type: 'text', text: 'echo:' + args.text }] },
  }))
  ctx.pwbTools = { register, tools }
  return () => { for (const d of disposers) d() }
}

// ---- pwb-context：世界观察上下文（禁 dump JSON；按意图检索+叙事化）----
// 契约：定位→取纪事→压 200 字。相二接浏览器纪事流（__wbOracle 事件语义）。
export function applyPwbContext(ctx) {
  const store = { chronicle: [], snapshot: null }
  ctx.pwbContext = {
    // 世界快照写入（相二由 pwb-bridge 喂入）
    setSnapshot(snap) { store.snapshot = snap },
    // 纪事追加（相二由事件流回灌）
    pushChronicle(entry) { store.chronicle.push({ at: Date.now(), text: String(entry).slice(0, 200) }) },
    // 按意图检索 + 叙事化压缩（相一：最新 N 条拼接 ≤200 字/条）
    narrate(intent, limit = 5) {
      const hits = intent
        ? store.chronicle.filter(c => c.text.includes(intent))
        : store.chronicle
      return hits.slice(-limit).map(c => c.text).join('；') || '（暂无相关纪事）'
    },
  }
  return () => { delete ctx.pwbContext }
}

// ---- pwb-prompt：系统提示组装（oracle/prompt.ts 的服务端形态）----
// 相二：接 dsh-system-prompt 的贡献面（构造序在 ToolsService 之后）
export function applyPwbPrompt(ctx) {
  ctx.pwbPrompt = {
    // 相二：经 ctx.systemPrompt 注册片段；相一先承载静态基座
    basePrompt() {
      return '你是 Pixel World Box 的神谕——以叙事方式观察与引导这个像素世界。' +
        '回答基于 ctx.pwbContext.narrate(意图) 的世界纪事，禁 dump JSON。'
    },
  }
  return () => { delete ctx.pwbPrompt }
}

// ---- pwb-bridge：前端 ↔ 运行时事件桥（WS/HTTP 语义）----
// 契约：浏览器推世界快照/操作 → 服务端；服务端推事件流/工具结果 → 浏览器（SSE/WS）。
// 相二：与 oracle-server server.mjs 的 SSE 线协议对齐（{t}/{r}/[DONE]）。
export function applyPwbBridge(ctx) {
  const listeners = []
  ctx.pwbBridge = {
    onEvent(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1) },
    emit(event) { for (const fn of listeners) fn(event) },
    // 相二：ingestSnapshot(snapshot) → ctx.pwbContext.setSnapshot + 纪事抽取
  }
  return () => { delete ctx.pwbBridge }
}

// ---- pwb-store：会话/世界持久化（容器 fs 原生写盘，验收「切后台可续跑」）----
// 契约：dsh session-persistence 原生落盘；相二指定 Sealos 卷挂载路径。
export function applyPwbStore(ctx) {
  const root = process.env.PWB_STORE_ROOT || './.pwb-store'
  ctx.pwbStore = {
    root,
    // 相二：接 dsh-session-persistence（接口已在装配树：packages/session/session-persistence）
    async save(_session) { throw new Error('pwb-store.save 相二接线（session-persistence）') },
    async load(_id) { throw new Error('pwb-store.load 相二接线（session-persistence）') },
  }
  return () => { delete ctx.pwbStore }
}

// ---- 五件合注册 ----
export function applyAll(ctx) {
  const disposers = [
    applyPwbTools(ctx),
    applyPwbContext(ctx),
    applyPwbPrompt(ctx),
    applyPwbBridge(ctx),
    applyPwbStore(ctx),
  ]
  return () => { for (const d of disposers) try { d() } catch { /* 幂等卸载 */ } }
}
