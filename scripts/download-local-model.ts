#!/usr/bin/env bun
// ============ 本地模型预下载脚本（说明文档） ============
// 
// 由于 Hugging Face 现在要求认证才能下载模型文件，直接下载脚本无法工作。
// 
// 推荐方案：使用浏览器端自动下载 + IndexedDB + Service Worker 缓存
// 
// 步骤：
// 1. 启动开发服务器：bun run dev
// 2. 打开测试页：http://localhost:3000/test-local-provider.html
// 3. 点击「1. 加载 transformers.js 与模型」—— 首次会自动从 CDN 下载 ~300-500MB
// 4. 待模型就绪后，测试各项功能
// 5. 断网刷新页面 —— 验证离线可用（IndexedDB + SW 双重缓存）
// 
// 如果必须预下载到 public/models/，需手动操作：
// - 在浏览器开发者工具 Application -> IndexedDB 中找到缓存的模型文件
// - 或配置 HF_TOKEN 环境变量后运行 transformers.js Node 端下载
// 
// 当前脚本仅作说明，不执行下载。

console.log('⚠️  直接下载不可用（Hugging Face 需认证）');
console.log('');
console.log('请使用浏览器端自动下载方案：');
console.log('  1. bun run dev');
console.log('  2. 打开 http://localhost:3000/test-local-provider.html');
console.log('  3. 点击「预加载模型」或「加载 transformers.js 与模型」');
console.log('  4. 首次加载会自动下载 ~300-500MB 到 IndexedDB');
console.log('  5. 后续访问离线可用（Service Worker + IndexedDB 双重缓存）');
console.log('');
console.log('如需手动预下载到 public/models/：');
console.log('  export HF_TOKEN=your_token  # 从 https://huggingface.co/settings/tokens 获取');
console.log('  bun scripts/download-local-model.ts  # 需修改脚本读取 HF_TOKEN');
