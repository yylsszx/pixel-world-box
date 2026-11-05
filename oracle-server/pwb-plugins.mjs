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
// M-O4 相三挂账②：真实游戏工具注册（adaptation §3 映射 oracle/tools.ts）——
//   查询类（实况/纪事）直接读 pwbContext 真数据（前端每回合喂快照，runDshSessionTurn snapshot 通道）；
//   变更类（生成/天气）= 形状校验 + 动作受理 + pwb-bridge 动作请求事件（{r} 通道随流下达，
//   浏览器 OraclePanel 逐行解析后经 executeOracleTool 在活引擎上真执行——同回合闭环，无需 WS）。
// 蓝本枚举：oracle/tools.ts spawn_creatures（count 1-50/散布 1-8/世界 256×160）+
//   bridge-ext divine_power 32 神力目录（meteor…oasis）。
const WB_WORLD_W = 256
const WB_WORLD_H = 160
const WB_POWERS = [
  'meteor', 'meteor_shower', 'quake', 'volcano', 'lightning', 'tornado', 'tsunami', 'drought',
  'flood', 'blizzard', 'sandstorm', 'typhoon', 'acid_rain', 'locust', 'famine', 'ice_age',
  'sinkhole', 'blackhole', 'wrath', 'curse', 'bless', 'love', 'heal', 'mutate', 'teleport',
  'rain_cloud', 'nuke', 'plague', 'fire', 'boom', 'river', 'oasis',
]

/** 数值参数夹取（与 bridge.ts num/clamp 同语义：NaN → 缺省） */
function wbNum(v, dflt) {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : dflt
}

export function applyPwbTools(ctx) {
  const tools = []
  const disposers = []
  const register = (tool) => {
    tools.push(tool)
    if (ctx.tools) disposers.push(ctx.tools.register(tool))
    return tool
  }
  // 健康探针（原 fixture 降级）：回显全链验证用，非游戏工具——名字/参数/回显语义恒定
  // （runtime/server-runtime/session-persistence 三冒烟与池冒烟五步先例均依赖）。
  register(normalizeTool({
    name: 'wb_echo',
    description: 'PWB runtime health probe: echoes text back to verify the tool pipeline is alive. Not a game tool.',
    parameters: { text: { type: 'string', required: true, description: 'Text to echo.' } },
    output: { schema: { type: 'array', items: { type: 'json' } }, render: (_args, value) => value },
    async execute(args) { return [{ type: 'text', text: 'echo:' + args.text }] },
  }))
  // 真实工具①：世界实况——读前端每回合喂入的快照 digest（get_world_digest 同源 narrative）
  register(normalizeTool({
    name: 'wb_world_digest',
    description: '世界实况一段式摘要（纪元/列国/战火/生态/自然/社会）。数据来自前端本回合喂入的世界快照。',
    parameters: {},
    output: { schema: { type: 'array', items: { type: 'json' } }, render: (_args, value) => value },
    async execute() {
      const snap = ctx.pwbContext?.getSnapshot?.()
      if (!snap || (!snap.digest && !snap.chronicle?.length)) {
        return [{ type: 'text', text: '（世界快照未接入：本回合前端未喂入快照——请提醒造物主在进入世界后使用「持久」面提问，届时每回合自动携带世界实况。）' }]
      }
      const parts = []
      if (snap.digest) parts.push(String(snap.digest).slice(0, 1200))
      if (snap.chronicle?.length) parts.push(`近事：${snap.chronicle.slice(-5).join('；')}`)
      return [{ type: 'text', text: parts.join('\n') || '（快照为空）' }]
    },
  }))
  // 真实工具②：纪事查询——按意图检索 pwbContext 纪事流（定位→取纪事→压 200 字，禁 dump JSON）
  register(normalizeTool({
    name: 'wb_query_chronicle',
    description: '世界纪事按意图检索：从世界事件流中查找与意图相关的近事并叙事化返回。',
    parameters: {
      intent: { type: 'string', description: '检索意图关键词（如 王国/战争/瘟疫/狼），省略=返回最近纪事' },
      limit: { type: 'number', description: '返回条数 1-10，默认 5' },
    },
    output: { schema: { type: 'array', items: { type: 'json' } }, render: (_args, value) => value },
    async execute(args) {
      const intent = typeof args.intent === 'string' ? args.intent.trim() : ''
      const limit = Math.max(1, Math.min(10, Math.round(wbNum(args.limit, 5))))
      const out = ctx.pwbContext?.narrate?.(intent, limit) ?? '（纪事流未就绪）'
      return [{ type: 'text', text: out }]
    },
  }))
  // 真实工具③：生成生物——形状校验 + 动作受理（浏览器活引擎 spawn_creatures 同参数面）
  register(normalizeTool({
    name: 'wb_spawn',
    description: '生成既有生物到世界（race 支持中文/英文种族名，如 人类/羊/狼/dragon；count 1-50）；缺省坐标=造物主相机中心。动作经桥下达浏览器引擎执行，受理即回执。',
    parameters: {
      race: { type: 'string', required: true, description: '种族名（中文或英文）' },
      count: { type: 'number', description: '数量 1-50，默认 5' },
      x: { type: 'number', description: '生成点 x（0-255，省略=相机中心）' },
      y: { type: 'number', description: '生成点 y（0-159，省略=相机中心）' },
      radius: { type: 'number', description: '散布半径 1-8，默认 2' },
    },
    output: { schema: { type: 'array', items: { type: 'json' } }, render: (_args, value) => value },
    async execute(args) {
      const race = typeof args.race === 'string' ? args.race.trim() : ''
      if (!race) return [{ type: 'text', text: '受理失败：race 必填（种族名，如 人类/羊/狼/dragon）。' }]
      const count = Math.max(1, Math.min(50, Math.round(wbNum(args.count, 5))))
      const hasXY = args.x !== undefined && args.y !== undefined
      const x = Math.max(0, Math.min(WB_WORLD_W - 1, Math.round(wbNum(args.x, WB_WORLD_W / 2))))
      const y = Math.max(0, Math.min(WB_WORLD_H - 1, Math.round(wbNum(args.y, WB_WORLD_H / 2))))
      const radius = Math.max(1, Math.min(8, Math.round(wbNum(args.radius, 2))))
      const action = { tool: 'spawn_creatures', race, count, radius }
      if (hasXY) { action.x = x; action.y = y }
      ctx.pwbBridge?.queueAction?.(action)
      const at = hasXY ? `(${x},${y})` : '相机中心'
      return [{ type: 'text', text: `已受理：生成 ${race} ×${count} @${at}（散布 ${radius}）——动作已下达浏览器引擎，结果以世界实况为准。` }]
    },
  }))
  // 真实工具④：神力/天气——32 神力枚举校验 + 动作受理（浏览器 divine_power 同参数面）
  register(normalizeTool({
    name: 'wb_weather',
    description: '神力与天气调控（32 种：meteor/quake/volcano/lightning/tornado/tsunami/flood/blizzard/sandstorm/typhoon/acid_rain/locust/famine/ice_age/wrath/curse/bless/love/heal/mutate/rain_cloud/nuke/plague/fire/boom/river/oasis 等）。动作经桥下达浏览器引擎执行。',
    parameters: {
      kind: { type: 'string', required: true, description: '神力名（32 种之一，如 rain_cloud 降雨/blizzard 暴风雪/meteor 陨石）' },
      x: { type: 'number', description: '落点 x（0-255）' },
      y: { type: 'number', description: '落点 y（0-159）' },
      radius: { type: 'number', description: '作用半径 1-40' },
      power: { type: 'number', description: '强度 0-100' },
    },
    output: { schema: { type: 'array', items: { type: 'json' } }, render: (_args, value) => value },
    async execute(args) {
      const kind = typeof args.kind === 'string' ? args.kind.trim() : ''
      if (!WB_POWERS.includes(kind)) {
        return [{ type: 'text', text: `受理失败：未知神力「${kind || '（空）'}」。可用 32 种：${WB_POWERS.join('/')}。` }]
      }
      const x = Math.max(0, Math.min(WB_WORLD_W - 1, Math.round(wbNum(args.x, WB_WORLD_W / 2))))
      const y = Math.max(0, Math.min(WB_WORLD_H - 1, Math.round(wbNum(args.y, WB_WORLD_H / 2))))
      const radius = Math.max(1, Math.min(40, Math.round(wbNum(args.radius, 6))))
      // 形状对齐浏览器执行器（bridge.ts god_power → bridge-ext divine_power）：
      //   tool=god_power（executeOracleTool 分发名），kind=神力名，power=强度 1-3
      //   （入参 0-100 映射：≥67→3 / ≥34→2 / 其余 1；省略=引擎缺省 2）
      const action = { tool: 'god_power', kind, x, y, radius }
      if (args.power !== undefined) {
        const p = Math.max(0, Math.min(100, wbNum(args.power, 50)))
        action.power = p >= 67 ? 3 : p >= 34 ? 2 : 1
      }
      ctx.pwbBridge?.queueAction?.(action)
      return [{ type: 'text', text: `已受理：神力 ${kind} @(${x},${y}) 半径 ${radius}——动作已下达浏览器引擎，结果以世界实况为准。` }]
    },
  }))
  ctx.pwbTools = { register, tools }
  return () => { for (const d of disposers) d() }
}

// ---- pwb-context：世界观察上下文（禁 dump JSON；按意图检索+叙事化）----
// 契约：定位→取纪事→压 200 字。相二接浏览器纪事流（__wbOracle 事件语义）。
export function applyPwbContext(ctx) {
  const store = { chronicle: [], snapshot: null }
  ctx.pwbContext = {
    // 世界快照写入（每回合由 server.mjs 从 body.dsh.snapshot 喂入）
    setSnapshot(snap) { store.snapshot = snap },
    // 快照读取（M-O4 相三挂账②：wb_world_digest 真实数据源；只加不减）
    getSnapshot() { return store.snapshot },
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
        '真实游戏工具：wb_world_digest（世界实况）/ wb_query_chronicle（纪事检索）/ ' +
        'wb_spawn（生成生物）/ wb_weather（神力天气）——需要世界操作时调用，受理结果以世界实况为准；' +
        'wb_echo 仅为健康探针，勿在游戏叙事中使用。回答基于世界纪事，禁 dump JSON。'
    },
  }
  return () => { delete ctx.pwbPrompt }
}

// ---- pwb-bridge：前端 ↔ 运行时事件桥（WS/HTTP 语义）----
// 契约：浏览器推世界快照/操作 → 服务端；服务端推事件流/工具结果 → 浏览器（SSE/WS）。
// 相二：与 oracle-server server.mjs 的 SSE 线协议对齐（{t}/{r}/[DONE]）。
// 挂账②：动作通道——变更类工具（wb_spawn/wb_weather）受理的动作经 queueAction 广播
//   action-request 事件（server.mjs bridgeLine → {r} 行），浏览器逐行解析后真执行；
//   actions 留痕（上限 32，drainActions 供冒烟/健康面断言）。
export function applyPwbBridge(ctx) {
  const listeners = []
  const actions = []
  ctx.pwbBridge = {
    onEvent(fn) { listeners.push(fn); return () => listeners.splice(listeners.indexOf(fn), 1) },
    emit(event) { for (const fn of listeners) fn(event) },
    // 动作受理：广播 action-request + 留痕（溢出淘汰最旧）
    queueAction(action) {
      const a = action && typeof action === 'object' ? action : { kind: String(action) }
      actions.push({ ...a, at: Date.now() })
      if (actions.length > 32) actions.shift()
      this.emit({ type: 'action-request', action: a, at: Date.now() })
      return a
    },
    // 动作留痕读取（非破坏性；drain 语义由调用方自行清空）
    pendingActions() { return actions.slice() },
    drainActions() { return actions.splice(0, actions.length) },
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
