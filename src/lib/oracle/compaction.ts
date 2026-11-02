'use client';

// ============ 神谕 Agent · 对话历史压缩（独立版，移植自 dsh compaction-basic） ============
// 移植自 @deepseek-ai/dsh-compaction-basic（packages/compaction/compaction-basic/src/）
// 核心功能：checkpoint 标记、LLM 单次摘要、结构化输出、checkpoint 合并
// 适配浏览器端：无 Cordis/Context 依赖，直接使用 local-provider.ts

import type { AgentChatMessage } from './types';
import { callLocalModel } from './local-provider';

// ---- 常量（移植自 dsh-compaction-basic/src/summarizer.ts） ----

const SUMMARY_OPEN_TAG = '<compacted-summary>';
const SUMMARY_CLOSE_TAG = '</compacted-summary>';

const COMPACTION_INSTRUCTION = [
  '你是对话历史压缩引擎。将上方对话浓缩为结构化检查点，使另一模型能无损续跑。',
  '',
  '输出确切的 Markdown 结构：保留每个章节、顺序不变。用简短要点而非段落。空章节写 "(none)" —— 绝不丢弃章节。',
  '',
  '## 核心需求与意图',
  '- [用户原始与演进的目标；关键措辞逐字保留]',
  '',
  '## 关键技术概念',
  '- [涉及的技术、框架、模式、约定]',
  '',
  '## 文件与代码',
  '- [确切路径：为何重要、关键变更或片段]',
  '',
  '## 错误与修复',
  '- [错误：如何解决，以及相关用户反馈]',
  '',
  '## 待办任务',
  '- [明确要求但未完成的工作]',
  '',
  '## 当前进展',
  '- [检查点时刻正在进行的事项]',
  '',
  '## 下一步',
  '- [直接对应最近请求的单一后续动作，或 "(none)"]',
  '',
  '## 关键上下文',
  '- [决策及其理由、约束、用户偏好、开放问题、续跑所需数据]',
  '',
  '规则：',
  '- 简洁的工程英语。保留确切路径、命令、错误串、标识符、数值、函数签名、语法片段。',
  '- 忠实记录用户反馈与显式指令，尤其是纠正。',
  '- 绝不提及本压缩请求或上下文已被压缩。',
  `- 若对话已含 ${SUMMARY_OPEN_TAG} 块，说明存在先前检查点。不逐字前向传播：保留仍真实的事实，丢弃陈旧项，将新信息合并为同结构下的单一综合摘要。`,
].join('\n');

const CHECKPOINT_PREAMBLE =
  '这是自动生成的检查点，浓缩了早期对话跨度以释放上下文。' +
  '将捕获的上下文视为既定背景并在此基础上构建，直接继续后续消息的任务，无需确认此检查点。\n\n';

// ---- 类型 ----

export interface CompactionConfig {
  summarizationModel: string;
  maxTokens: number;
  temperature?: number;
  allowLocalModels?: boolean;
  forceCpu?: boolean;
}

export interface CompactionInput {
  messages: AgentChatMessage[];
  currentTurn?: number;
}

export interface CompactionResult {
  messages: AgentChatMessage[];
  compactedCount: number;
  originalTokenEstimate: number;
  compactedTokenEstimate: number;
  summaryText: string;
}

// ---- 内部工具 ----

function estimateTokens(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.length - chinese;
  return Math.ceil(chinese / 1.5 + other / 4);
}

function hasExistingCheckpoint(messages: AgentChatMessage[]): boolean {
  return messages.some(m => m.content.includes(SUMMARY_OPEN_TAG));
}

function extractExistingSummary(messages: AgentChatMessage[]): string | null {
  for (const m of messages) {
    const start = m.content.indexOf(SUMMARY_OPEN_TAG);
    const end = m.content.indexOf(SUMMARY_CLOSE_TAG);
    if (start !== -1 && end !== -1) {
      return m.content.slice(start + SUMMARY_OPEN_TAG.length, end).trim();
    }
  }
  return null;
}

function buildSummarizationPrompt(messages: { role: string; content: string }[], existingSummary: string | null): string {
  const recentMessages = messages.slice(-20);
  let prompt = '=== 对话历史（需压缩） ===\n\n';
  if (existingSummary) {
    prompt += `[先前检查点]\n${existingSummary}\n\n---\n\n`;
  }
  for (const m of recentMessages) {
    const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : 'System';
    prompt += `${role}: ${m.content}\n\n`;
  }
  prompt += '\n=== 压缩指令 ===\n\n';
  prompt += COMPACTION_INSTRUCTION;
  return prompt;
}

const COMPACTION_INSTRUCTION = [
  '你是对话历史压缩引擎。将上方对话浓缩为结构化检查点，使另一模型能无损续跑。',
  '',
  '输出确切的 Markdown 结构：保留每个章节、顺序不变。用简短要点而非段落。空章节写 "(none)" —— 绝不丢弃章节。',
  '',
  '## 核心需求与意图',
  '- [用户原始与演进的目标；关键措辞逐字保留]',
  '',
  '## 关键技术概念',
  '- [涉及的技术、框架、模式、约定]',
  '',
  '## 文件与代码',
  '- [确切路径：为何重要、关键变更或片段]',
  '',
  '## 错误与修复',
  '- [错误：如何解决，以及相关用户反馈]',
  '',
  '## 待办任务',
  '- [明确要求但未完成的工作]',
  '',
  '## 当前进展',
  '- [检查点时刻正在进行的事项]',
  '',
  '## 下一步',
  '- [直接对应最近请求的单一后续动作，或 "(none)"]',
  '',
  '## 关键上下文',
  '- [决策及其理由、约束、用户偏好、开放问题、续跑所需数据]',
  '',
  '规则：',
  '- 简洁的工程英语。保留确切路径、命令、错误串、标识符、数值、函数签名、语法片段。',
  '- 忠实记录用户反馈与显式指令，尤其是纠正。',
  '- 绝不提及本压缩请求或上下文已被压缩。',
  '- 仅输出检查点文本：不调用工具、不做其它动作。',
  '- 若对话已含 <compacted-summary> 块，说明存在先前检查点。不逐字前向传播：保留仍真实的事实，丢弃陈旧项，将新信息合并为同结构下的单一综合摘要。',
].join('\n');

const CHECKPOINT_PREAMBLE =
  '这是自动生成的检查点，浓缩了早期对话跨度以释放上下文。' +
  '将捕获的上下文视为既定背景并在此基础上构建，直接继续后续消息的任务，无需确认此检查点.\n\n';

const SUMMARY_OPEN_TAG = '<compacted-summary>';
const SUMMARY_CLOSE_TAG = '</compacted-summary>';

function estimateTokens(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.length - chinese;
  return Math.ceil(chinese / 1.5 + other / 4);
}

function extractExistingSummary(messages: { role: string; content: string }[]): string | null {
  for (const m of messages) {
    const start = m.content.indexOf('<compacted-summary>');
    const end = m.content.indexOf('</compacted-summary>');
    if (start !== -1 && end !== -1) {
      return m.content.slice(start + '<compacted-summary>'.length, end).trim();
    }
  }
  return null;
}

function buildSummarizationPrompt(messages: { role: string; content: string }[], existingSummary: string | null): string {
  const recentMessages = messages.slice(-20);
  let prompt = '=== 对话历史（需压缩） ===\n\n';
  if (existingSummary) {
    prompt += `[先前检查点]\n${existingSummary}\n\n---\n\n`;
  }
  for (const m of recentMessages) {
    const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : 'System';
    prompt += `${role}: ${m.content}\n\n`;
  }
  prompt += '\n=== 压缩指令 ===\n\n';
  prompt += COMPACTION_INSTRUCTION;
  return prompt;
}

// ---- 导出 API ----

export interface CompactionConfig {
  summarizationModel: string;
  maxTokens: number;
  temperature?: number;
  allowLocalModels?: boolean;
  forceCpu?: boolean;
}

export interface CompactionInput {
  messages: { role: string; content: string }[];
  currentTurn?: number;
}

export interface CompactionResult {
  messages: { role: string; content: string }[];
  compactedCount: number;
  originalTokenEstimate: number;
  compactedTokenEstimate: number;
  summaryText: string;
}

export async function compactHistory(
  input: CompactionInput,
  config: CompactionConfig
): Promise<CompactionResult> {
  const { messages, currentTurn } = input;
  const fullText = messages.map(m => m.content).join('\n');
  const originalTokenEstimate = estimateTokens(fullText);
  const existingSummary = extractExistingSummary(messages);
  const prompt = buildSummarizationPrompt(messages, existingSummary);

  const summaryMessages: { role: string; content: string }[] = [
    { role: 'assistant', content: '你是对话压缩引擎，输出结构化检查点。' },
    { role: 'user', content: prompt }
  ];

  const providerConfig = {
    model: config.summarizationModel,
    temperature: config.temperature ?? 0.3,
    forceCpu: config.forceCpu,
    allowLocalModels: config.allowLocalModels,
  } as const;

  const { content: summaryText, err } = await callLocalModel(
    providerConfig,
    summaryMessages
  );

  if (err) throw new Error(`摘要生成失败: ${err}`);
  if (!summaryText || !summaryText.trim()) throw new Error('摘要生成结果为空');

  const checkpointContent = `这是自动生成的检查点，浓缩了早期对话跨度以释放上下文。\n将捕获的上下文视为既定背景并在此基础上构建，直接继续后续消息的任务，无需确认此检查点.\n\n<compacted-summary>\n${summaryText.trim()}\n</compacted-summary>`;

  const systemMsg = messages[0];
  const recentMessages = messages.slice(-8);
  const compactedMessages = [systemMsg, { role: 'assistant', content: checkpointContent }, ...recentMessages];

  const compactedText = compactedMessages.map(m => m.content).join('\n');
  const compactedTokenEstimate = estimateTokens(compactedText);
  const compactedCount = messages.length - compactedMessages.length;

  return {
    messages: compactedMessages,
    compactedCount,
    originalTokenEstimate: estimateTokens(messages.map(m => m.content).join('\n')),
    compactedTokenEstimate,
    summaryText: summaryText.trim(),
  };
}

export function shouldCompact(
  messages: { role: string; content: string }[],
  thresholdTokens = 3000
): boolean {
  const totalText = messages.map(m => m.content).join('\n');
  return estimateTokens(totalText) > thresholdTokens;
}

export async function autoCompact(
  input: CompactionInput,
  config: CompactionConfig,
  thresholdTokens = 3000
): Promise<CompactionResult | { messages: { role: string; content: string }[]; skipped: true }> {
  if (!shouldCompact(input.messages, thresholdTokens)) {
    return { messages: input.messages, skipped: true };
  }
  return await compactHistory(input, config);
}

export { estimateTokens };
