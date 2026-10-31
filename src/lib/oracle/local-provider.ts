// ============ 神谕 Agent 后端 · 本地模型推理（浏览器端原生，无需服务器） ============
// 使用 @xenova/transformers (transformers.js) 在浏览器端直接运行 1B 参数级 LLM。
// 适合移动设备：模型量化后 ~300-500MB，首次加载后浏览器 IndexedDB 缓存，离线可用。
// 零服务端依赖，适配 GitHub Pages 静态导出部署。

let transformers: typeof import('@xenova/transformers') | null = null;

async function loadTransformers() {
  if (transformers) return transformers;
  const mod = await import('@xenova/transformers');
  transformers = mod;
  return mod;
}

/** 服务端环境下的空 stub（避免 SSR 时加载浏览器专用模块） */
async function callLocalModelStub(): Promise<{ content: string; reasoning: string; err: string }> {
  return { content: '', reasoning: '', err: '本地模型仅在浏览器端可用（SSR 环境下不可加载）' };
}

/** 已加载的本地生成管线缓存（按模型标识符键） */
const pipelineCache = new Map<string, Awaited<ReturnType<typeof import('@xenova/transformers').pipeline>>>();

/** 加载或复用本地生成管线（text-generation） */
async function getLocalPipeline(
  modelId: string,
  opts: { forceCpu?: boolean },
): Promise<Awaited<ReturnType<typeof import('@xenova/transformers').pipeline>>> {
  const { pipeline } = await loadTransformers();
  const key = `${modelId}:${opts.forceCpu ? 'cpu' : 'auto'}`;
  if (pipelineCache.has(key)) return pipelineCache.get(key)!;

  // quantized: true 启用 4 位量化，显著减小体积并加速推理
  const pipe = await pipeline('text-generation', modelId, { quantized: true });
  pipelineCache.set(key, pipe);
  return pipe;
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

/** 在浏览器端调用本地模型；服务端返回错误 stub */
export async function callLocalModel(
  provider: { model?: string; temperature?: number; forceCpu?: boolean },
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<{ content: string; reasoning: string; err: string }> {
  if (typeof window === 'undefined') return callLocalModelStub();

  const { env } = await loadTransformers();
  // transformers.js 从 Hugging Face CDN 下载模型；如需完全离线，可把模型文件放入 public/models/<name>
  // 并把 model 字段设为相对路径（如 '/models/qwen2.5-0.5b-instruct'）
  env.allowLocalModels = false;

  const modelId = provider.model ?? 'XENova/qwen2.5-0.5b-instruct';
  const content: string[] = [];
  let reasoning = '';
  let err = '';

  try {
    const pipe = await getLocalPipeline(modelId, { forceCpu: provider.forceCpu });
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
