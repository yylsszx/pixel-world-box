'use client';

export const SUMMARY_OPEN_TAG = '<compacted-summary>';
export const SUMMARY_CLOSE_TAG = '</compacted-summary>';
export const COMPACTION_INSTRUCTION = [
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

export const CHECKPOINT_PREAMBLE =
  '这是自动生成的检查点，浓缩了早期对话跨度以释放上下文。' +
  '将捕获的上下文视为既定背景并在此基础上构建，直接继续后续消息的任务，无需确认此检查点.\n\n';

export function estimateTokens(text: string): number {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const other = text.length - chinese;
  return Math.ceil(chinese / 1.5 + other / 4);
}

export function extractExistingSummary(messages: { role: string; content: string }[]): string | null {
  for (const m of messages) {
    const start = m.content.indexOf(SUMMARY_OPEN_TAG);
    const end = m.content.indexOf(SUMMARY_CLOSE_TAG);
    if (start !== -1 && end !== -1) {
      return m.content.slice(start + SUMMARY_OPEN_TAG.length, end).trim();
    }
  }
  return null;
}

export function buildSummarizationPrompt(messages: { role: string; content: string }[], existingSummary: string | null): string {
  const recentMessages = messages.slice(-20);
  let prompt = '=== 对话历史（需压缩） ===\n\n';
  if (existingSummary) prompt += `[先前检查点]\n${existingSummary}\n\n---\n\n`;
  for (const m of recentMessages) {
    const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : 'System';
    prompt += `${role}: ${m.content}\n\n`;
  }
  prompt += '\n=== 压缩指令 ===\n\n';
  prompt += COMPACTION_INSTRUCTION;
  return prompt;
}
