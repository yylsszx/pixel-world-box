// ============ 统治者议会 · 类型契约 ============
// 架构铁律（修改任何一层前先读）：
//   L1 世界状态服务 digest.ts —— 唯一真相源裁剪器（变化量+告警+地名锚点）
//   L2 决策 Agent prompt.ts/parse.ts —— AI 只输出意图 JSON，不碰执行
//   L3 仲裁层 arbiter.ts —— 纯代码：冲突检测/合法性校验/危险拦截/汇总汇报
//   L4 执行器 executor.ts —— 纯代码：解析地名→校验参数→执行→回读验证→日志
//   L5 汇报层 reporter.ts —— 模板填槽 ≤15 字，禁止自由文本
// 硬约束：AI 不得输出 region_id / 坐标 / 工具名——地名解析必须在 geo.ts（代码层）。
// 新增动作六步：白名单枚举 → schema → 解析规则 → 执行器 → 汇报模板 → 提示词登记
// （提示词的权柄清单由 whitelist+schema 自动生成，天然同步；其余四处必须手工同步）。

/** 统治者角色（议会席位） */
export type RulerRole = 'warlord' | 'calamity' | 'creator' | 'steward';

/** 动作白名单枚举（新增动作 = 在这里加一枚，然后同步 schema/parse/executor/reporter） */
export type RulerAction =
  // — 战争统帅 —
  | 'declare_war'      // 宣战 {a,b,reason}
  | 'make_peace'       // 议和 {a,b}
  | 'form_alliance'    // 结盟 {a,b}
  | 'issue_directive'  // 国策旨意 {kingdom,kind,target?,param?}
  // — 天灾使者 —
  | 'divine_strike'    // 天罚 {power,place,scale}
  | 'heal_land'        // 净化 {place,size}
  | 'bless_land'       // 祝福 {place,size}
  // — 造物主教 —
  | 'spawn_species'    // 造物 {name,form,hp,dmg,...}
  | 'hybridize'        // 融合 {a,b}
  | 'spawn_creatures'  // 放生 {race,count,place}
  // — 内政执政官 —
  | 'boost_kingdom'    // 天赐 {kingdom,what,amount}
  | 'terraform';       // 塑地 {terrain,place,size}

/** 危险等级：high=需复述确认（或多席同议+自动放行开关）；medium=冷却门控；low=直行 */
export type DangerLevel = 'low' | 'medium' | 'high';

/** 出错/受阻时定位在哪一层——不同层修法不同，别一上来改提示词 */
export type RulerLayer = '决策' | '仲裁' | '地名解析' | '执行' | '回读';

/** 一条结构化意图（AI 原始输出经 parse.ts 规范化后） */
export interface RulerIntent {
  /** 提出者席位 */
  agent: RulerRole;
  action: RulerAction;
  /** 仅含 schema 声明过的键；值已按范围/枚举规范化 */
  params: Record<string, string | number | boolean>;
  /** AI 的一句动机（≤24 字，仅入面板流，绝不进汇报模板） */
  why?: string;
}

/** 意图在管线中的处置结果（喂给 UI 的时间线） */
export type IntentStatus =
  | '待确认' // 危险动作，等造物主批复
  | '执行中' // 已落地，回读验证排队中（延迟生效类）
  | '已验证' // 回读通过——以世界状态为准，非 AI 自述
  | '受阻'   // 仲裁驳回（越权/冲突/冷却/预算/否决）
  | '失败';  // 地名解析失败 / 执行抛错 / 回读不符

/** 汇报流里的动作键：正常为白名单动作；决策层故障（LLM 失败等）用 'none' 占位 */
export type FeedAction = RulerAction | 'none';

export interface CouncilFeedItem {
  id: number;
  year: number;
  agent: RulerRole;
  action: FeedAction;
  /** 模板填槽汇报（≤15 字）；受阻/失败也走模板 */
  report: string;
  status: IntentStatus;
  /** 终态定位层（待确认/执行中为当前所处层） */
  layer: RulerLayer;
  /** 机器可读细节：驳回原因/解析候选/回读数据（面板展开行） */
  detail: string;
  /** AI 动机（为什么做） */
  why?: string;
  /** 目标坐标（已验证落地后可点击跳转） */
  at?: [number, number];
  ts: number;
}

/** 危险动作的待确认条目（复述确认协议） */
export interface CouncilPendingItem {
  id: number;
  feedId: number;
  year: number;
  agent: RulerRole;
  action: RulerAction;
  /** 复述：模板填槽后的既成预演（≤15 字） */
  restatement: string;
  params: Record<string, string | number | boolean>;
  danger: DangerLevel;
  /** 多席同议标记（≥2 席提出同一签名） */
  coSigned: boolean;
  why?: string;
}

/** 席位运行态（面板席位卡） */
export interface CouncilAgentStatus {
  enabled: boolean;
  /** 静观 | 决断中 | 已献策 | 沉默 | 出错 */
  phase: '静观' | '决断中' | '已献策' | '沉默' | '出错';
  /** 最近一次献策的动作数 */
  lastCount: number;
  /** 最近一次参与的年份 */
  lastYear: number;
  /** 累计：执行成功 / 受阻 / 失败 */
  done: number;
  blocked: number;
  failed: number;
}

/** 世界状态服务的地名锚点（代码生成、代码解析；AI 只引用 label） */
export interface GeoAnchor {
  label: string;
  x: number;
  y: number;
  /** 建议作用半径（火场/辐射区按范围给出） */
  radius?: number;
}

/** 一次议会召开的全部上下文（digest 快照 + 锚点表，供 geo/executor 使用） */
export interface ConveneContext {
  year: number;
  anchors: GeoAnchor[];
  /** 本次召开的完整快照（digest 内部已消费；executor 回读需要基线） */
  snapshot: import('./digest').WorldSnapshot;
}
