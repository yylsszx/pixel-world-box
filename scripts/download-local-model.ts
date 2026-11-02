#!/usr/bin/env bun
// ============ 本地模型预下载脚本 ============
// 把 Xenova/qwen2.5-0.5b-instruct 量化模型文件下载到 public/models/
// 运行：bun scripts/download-local-model.ts

import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL_ID = 'Xenova/qwen2.5-0.5b-instruct';
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'models', 'qwen2.5-0.5b-instruct');

// transformers.js 需要的文件列表（量化版）
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
  'onnx/model_quantized.onnx_data',
  'special_tokens_map.json',
];

async function downloadFile(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}: ${url}`);
  const buf = await res.arrayBuffer();
  await writeFile(dest, Buffer.from(buf));
  console.log(`✓ ${dest} (${(buf.byteLength / 1024 / 1024).toFixed(2)} MB)`);
}

async function main() {
  console.log(`下载 ${MODEL_ID} 量化模型到 ${OUT_DIR}...`);
  await mkdir(OUT_DIR, { recursive: true });

  for (const file of FILES) {
    const url = `${BASE_URL}/${file}`;
    const dest = join(OUT_DIR, file);
    await mkdir(join(dest, '..'), { recursive: true });
    try {
      await downloadFile(url, dest);
    } catch (e) {
      console.error(`✗ ${file}: ${e}`);
      process.exit(1);
    }
  }
  console.log('\n✅ 所有文件下载完成！');
  console.log(`模型路径: /models/qwen2.5-0.5b-instruct`);
}

main();