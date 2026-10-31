// ============ 神谕 Agent 后端 · 类型定义 ============
// 全能 Agent 运行时的公共契约：多厂商 provider 配置、对话消息、
// 工具调用协议（模型侧发起）与工具结果回传（客户端执行引擎后回填）。

/** 模型提供方类别：builtin=内置 z-ai-web-dev-sdk；openai=任意 OpenAI 兼容端点；anthropic=Claude 系；local=浏览器端本地模型（transformers.js） */
export type ProviderKind = 'builtin' | 'openai' | 'anthropic' | 'local';

export interface OracleProviderConfig {
  kind: ProviderKind;
  /** 显示名（如 "DeepSeek"、"Claude"、"本地 Qwen-0.5B"）——仅用于错误信息与日志 */
  label?: string;
  /** API 根地址。openai/anthropic 必填（自动归一化拼接 /chat/completions 或 /v1/messages）；builtin/local 忽略 */
  baseUrl?: string;
  /** API 密钥。openai/anthropic 必填；builtin/local 忽略。绝不写入日志。 */
  apiKey?: string;
  /** 模型名。openai/anthropic 必填；local 填 transformers.js 模型标识符（如 "XENova/qwen2.5-0.5b-instruct"）或本地 public 目录下的模型子路径 */
  model?: string;
  /** 采样温度 0-2，可选 */
  temperature?: number;
  /** 本地模型：是否强制使用 CPU（回退）。默认 false，transformers.js 会自动使用 WebGPU/WASM */
  forceCpu?: boolean;
}

export interface AgentChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** 模型发出的工具调用（由前端解析 json 代码块中的 tool_calls 得到，执行后回传） */
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
