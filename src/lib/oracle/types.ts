// ============ 神谕 Agent 后端 · 类型定义 ============
// 全能 Agent 运行时的公共契约：多厂商 provider 配置、对话消息、
// 工具调用协议（模型侧发起）与工具结果回传（客户端执行引擎后回填）。

/** 模型提供方类别：builtin=内置 z-ai-web-dev-sdk；openai=任意 OpenAI 兼容端点；anthropic=Claude 系（v7 原生 tool use）；gemini=Google Gemini（v7 原生 function calling）；local=浏览器端本地模型（transformers.js） */
export type ProviderKind = 'builtin' | 'openai' | 'anthropic' | 'gemini' | 'local';

export interface OracleProviderConfig {
  kind: ProviderKind;
  /** 显示名（如 "DeepSeek"、"Claude"、"本地 Qwen-0.5B"）——仅用于错误信息与日志 */
  label?: string;
  /** API 根地址。openai/anthropic 必填（自动归一化拼接 /chat/completions 或 /v1/messages）；gemini 可留空（默认官方 generativelanguage.googleapis.com，自动拼 /v1beta/models/{model}:streamGenerateContent）；builtin/local 忽略 */
  baseUrl?: string;
  /** API 密钥。openai（部分端点可无）/anthropic/gemini（代理可无）必填；builtin/local 忽略。绝不写入日志。 */
  apiKey?: string;
  /** 模型名。openai/anthropic/gemini 必填；local 填 transformers.js 模型标识符（如 "XENova/qwen2.5-0.5b-instruct"）或本地 public 目录下的模型子路径 */
  model?: string;
  /** 采样温度 0-2，可选 */
  temperature?: number;
  /** 本地模型：是否强制使用 CPU（回退）。默认 false，transformers.js 会自动使用 WebGPU/WASM */
  forceCpu?: boolean;
  /**
   * 神谕中继后端地址（corsDirect 直连，如 Sealos 部署的 oracle-server：http://<host>:8787）。
   * 设置后所有云端厂商请求（含 builtin）改经该后端转发——静态托管（GitHub Pages）下接入
   * 无 CORS 头厂商端点与 builtin 的唯一通路。为空时自动路由：本站后端（若有）→ 浏览器直连厂商。
   */
  relayUrl?: string;
}

/** 会话消息（v5 双协议 / v7 三协议）：
 *  · 旧协议（builtin/中继/local）：role 仅 user/assistant，工具调用以
 *    ```json {"tool_calls":…}``` 文本块承载，结果以 {"tool_results":…} 用户消息回传；
 *  · 原生函数调用（v5 openai 兼容 / v7 anthropic tool_use + gemini functionCall 直连）：
 *    assistant 消息可携带 tool_calls 结构，执行结果以 role:'tool' + tool_call_id 逐条回传
 *    ——协议层承载，无文本解析（直连层各自转译为本家原生协议）。
 *  约定不变：messages[0] 为承载系统提示词的 assistant 消息（直连层自行转 system/systemInstruction）。 */
export interface AgentChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  /** assistant 消息的原生函数调用（v5；仅原生 FC 路径使用） */
  tool_calls?: AgentToolCall[];
  /** tool 角色消息的对应调用 id（原生 FC 结果回传用） */
  tool_call_id?: string;
}

/** 模型发出的工具调用（原生 FC 由协议层解析；旧协议由前端解析 json 代码块得到） */
export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** 工具执行结果（以用户消息 {"tool_results":[...]} 的形式回传给模型） */
export interface AgentToolResult {
  id: string;
  ok: boolean;
  data: unknown;
  error?: string;
}

export interface AgentRequestBody {
  provider: OracleProviderConfig;
  /** 对话消息。约定 messages[0] 为 role:'assistant' 的系统提示词（buildSystemPrompt 产物） */
  messages: AgentChatMessage[];
  /** 深度思考：builtin / 部分 openai 模型输出 reasoning 流（r 通道） */
  deep?: boolean;
}
