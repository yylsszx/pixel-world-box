// ============ 神谕 Agent 后端 · 本地模型推理（浏览器端原生，无需服务器） ============
// 使用 @xenova/transformers (transformers.js) 在浏览器端直接运行 1B 参数级 LLM。
// 适合移动设备：模型量化后 ~300-500MB，首次加载后浏览器 IndexedDB + Service Worker 缓存，离线可用。
// 零服务端依赖，适配 GitHub Pages 静态导出部署。

/** transformers.js 模块缓存（避免重复动态导入） */
let transformersModule: typeof import('@xenova/transformers') | null = null;

/** 已加载的本地生成管线缓存（按模型标识符键） */
const pipelineCache = new Map<string, Awaited<ReturnType<typeof import('@xenova/transformers').pipeline>>>();

/** 模型加载状态（用于 UI 进度反馈） */
export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error';
let modelLoadState: ModelLoadState = 'idle';
let modelLoadError: string | null = null;
const stateListeners = new Set<(state: ModelLoadState, error: string | null) => void>();

export function onModelLoadStateChange(listener: (state: ModelLoadState, error: string | null) => void) {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

function emitState(state: ModelLoadState, error: string | null = null) {
  modelLoadState = state;
  modelLoadError = error;
  for (const l of stateListeners) l(state, error);
}

/** 获取当前加载状态 */
export function getModelLoadState(): { state: ModelLoadState; error: string | null } {
  return { state: modelLoadState, error: modelLoadError };
}

/** 动态加载 transformers.js（仅浏览器端） */
async function loadTransformers(): Promise<typeof import('@xenova/transformers')> {
  if (transformersModule) return transformersModule;
  if (typeof window === 'undefined') {
    throw new Error('transformers.js 仅在浏览器端可用');
  }
  const mod = await import('@xenova/transformers');
  transformersModule = mod;
  return mod;
}

/** 获取或创建本地生成管线（text-generation，4-bit 量化） */
async function getLocalPipeline(
  modelId: string,
  opts: { forceCpu?: boolean; allowLocalModels?: boolean } = {}
): Promise<Awaited<ReturnType<typeof import('@xenova/transformers').pipeline>>> {
  const { pipeline } = await loadTransformers();
  const { env } = await loadTransformers();
  const key = `${modelId}:${opts.forceCpu ? 'cpu' : 'auto'}:${opts.allowLocalModels ? 'local' : 'cdn'}`;
  if (pipelineCache.has(key)) return pipelineCache.get(key)!;

  // 允许从本地 public/models/ 加载（离线模式）
  if (opts.allowLocalModels) {
    env.allowLocalModels = true;
    env.localModelPath = `/models/${modelId.replace(/^[^/]+\//, '')}`; // 去掉组织名前缀
  } else {
    env.allowLocalModels = false;
  }

  emitState('loading');
  try {
    const pipe = await pipeline('text-generation', modelId, { quantized: true });
    pipelineCache.set(key, pipe);
    emitState('ready');
    return pipe;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    emitState('error', err);
    throw e;
  }
}

/** 把 OpenAI 风格消息历史压成单段提示文本（本地 1B 模型不支持复杂 chat template，做简单拼接） */
function messagesToPrompt(messages: { role: string; content: string }[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : 'System';
    lines.push(`${role}: ${m.content}`);
  }
  lines.push('Assistant:');
  return lines.join('\n');
}

/** 简单的对话历史压缩（保留 system prompt + 最近 N 轮，中间用摘要替代） */
export function compactHistory(
  messages: { role: string; content: string }[],
  maxMessages = 20
): { role: string; content: string }[] {
  if (messages.length <= maxMessages) return messages;
  const systemMsg = messages[0];
  const recent = messages.slice(-maxMessages + 1);
  const summaryCount = messages.length - maxMessages;
  return [
    systemMsg,
    { role: 'assistant', content: `[系统] 已省略 ${summaryCount} 条早期消息，仅保留最近上下文。` },
    ...recent,
  ];
}

/** 在浏览器端调用本地模型；服务端返回错误 stub */
export async function callLocalModel(
  provider: { model?: string; temperature?: number; forceCpu?: boolean; allowLocalModels?: boolean },
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<{ content: string; reasoning: string; err: string }> {
  if (typeof window === 'undefined') {
    return { content: '', reasoning: '', err: '本地模型仅在浏览器端可用（SSR 环境下不可加载）' };
  }

  const modelId = provider.model ?? 'Xenova/qwen2.5-0.5b-instruct';
  const content: string[] = [];
  let reasoning = '';
  let err = '';

  try {
    const pipe = await getLocalPipeline(modelId, { forceCpu: provider.forceCpu, allowLocalModels: provider.allowLocalModels });
    const prompt = messagesToPrompt(messages);

    const output = await (pipe as any)(prompt, {
      max_new_tokens: 512,
      temperature: typeof provider.temperature === 'number' ? provider.temperature : 0.7,
      do_sample: typeof provider.temperature === 'number' ? provider.temperature > 0 : true,
      top_p: 0.9,
      return_full_text: false,
    });

    const results = Array.isArray(output) ? output : [output];
    for (const r of results) {
      const text = r?.generated_text ?? '';
      if (text) content.push(text);
    }
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  return { content: content.join(''), reasoning, err };
}

/** 预加载模型（页面启动时调用，后台下载并缓存） */
export async function preloadLocalModel(
  modelId = 'Xenova/qwen2.5-0.5b-instruct',
  opts: { forceCpu?: boolean; allowLocalModels?: boolean } = {}
): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await getLocalPipeline(modelId, opts);
  } catch {
    // 预加载失败不抛错，等实际调用时再报错
  }
}

/** 清理管线缓存（释放内存） */
export function clearPipelineCache(): void {
  pipelineCache.clear();
}
