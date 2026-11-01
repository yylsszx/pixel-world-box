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

/** 检测是否为 iOS Safari（iOS 上 WebGPU 不可用，需回退到 WASM/CPU） */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** 加载或复用本地生成管线（text-generation），带设备 fallback */
async function getLocalPipeline(
  modelId: string,
  opts: { forceCpu?: boolean },
): Promise<Awaited<ReturnType<typeof import('@xenova/transformers').pipeline>>> {
  const { pipeline, env } = await loadTransformers();

  // 允许从远程 CDN 下载模型（移动端必需）
  env.allowRemoteModels = true;
  env.allowLocalModels = false;

  const key = `${modelId}:${opts.forceCpu ? 'cpu' : 'auto'}`;
  if (pipelineCache.has(key)) return pipelineCache.get(key)!;

  // 设备选择策略：
  // - forceCpu=true：不传 device_type，让 transformers.js 用 CPU/WASM
  // - iOS Safari：不传 device_type（WebGPU 不可用，会自动回退）
  // - 其他：先尝试 WebGPU，失败则自动回退
  const deviceOptions: Array<{ device_type?: string }> = [
    opts.forceCpu || isIOS() ? {} : { device_type: 'webgpu' },
    {}, // 让 transformers.js 自动选择（WASM/CPU）
  ];

  let lastErr: unknown = null;
  for (const opt of deviceOptions) {
    try {
      const pipe = await pipeline('text-generation', modelId, {
        quantized: true,
        ...opt,
      });
      pipelineCache.set(key, pipe);
      return pipe;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw lastErr ?? new Error('无法加载本地模型管线');
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
  env.allowRemoteModels = true;
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
    // 给移动端更友好的错误提示
    if (err.includes('WebGPU') || err.includes('gpu')) {
      err = '本地模型需 WebGPU 支持，当前浏览器/设备不兼容。建议：开启「强制 CPU」模式，或改用云端厂商（DeepSeek/OpenAI 等）。';
    } else if (err.includes('fetch') || err.includes('download') || err.includes('network')) {
      err = '模型下载失败（约 350MB）。请确保连接 Wi-Fi，并稍后重试。';
    } else if (err.includes('undefined') || err.includes('null')) {
      err = '模型加载失败：浏览器环境不兼容。建议：开启「强制 CPU」模式，或改用云端厂商。';
    }
  }

  return { content: content.join(''), reasoning, err };
}
