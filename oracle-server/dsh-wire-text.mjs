// ============ 线文本辅助（零依赖小模块；server.mjs 顶层可安全静态导入） ============
// 说明：dsh-session-memory.mjs 依赖 @deepseek-ai/* 裸导入（必须 dsh-hook 注册后求值），
//       而 server.mjs 在 hook 注册前就要做 sessionId 预检的文本归一——故本辅助独立成文件，
//       双方共用同一实现（单一事实源），且不携带任何 dsh 依赖。

/** 内容块 → 纯文本（只投影 text 块；image/file 块 v1 不投影） */
export function textOfContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
}

/** 前端消息 content（string 或分块数组）→ 纯文本（禁 dump JSON：分块只取文本部分） */
export function textFromFrontendContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return textOfContent(content);
  return '';
}
