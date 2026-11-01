# 部署到 Vercel（免费非静态托管，无需信用卡）

本分支 `feat/oracle-vercel-hosting` 专门适配 Vercel 等支持 Serverless 函数的非静态托管平台。

## 核心改动

| 改动项 | 说明 |
|--------|------|
| `next.config.ts` | 默认使用 `output: "standalone"`，API Routes（`/api/oracle/agent` 等）正常工作，支持 SSE 流式输出 |
| `src/lib/oracle/zai-provider.ts` | 客户端直接通过 `fetch` 调用 z.ai REST API，无需 Node.js SDK，浏览器端即可运行 |
| `src/lib/oracle/local-provider.ts` | 本地模型推理（transformers.js），带 SSR 保护，仅在浏览器端加载 |
| `src/lib/oracle/agent.ts` | 新增 `builtin` 分支，调用 `callZaiModel` 直接连接 z.ai 云平台 |

## 一、在 Vercel 上部署（推荐）

### 1. 推送代码到 GitHub

```bash
# 在新分支上提交
git add -A
git commit -m "feat: 适配 Vercel 非静态托管，启用 API Routes"
git push origin feat/oracle-vercel-hosting
```

### 2. Vercel 控制台部署

1. 登录 [Vercel](https://vercel.com)（可用 GitHub 账号直接登录，**无需信用卡**）
2. 点击 **Add New Project → Import Git Repository**
3. 选择 `yylsszx/pixel-world-box` 仓库
4. Framework Preset 选择 **Next.js**
5. Build Command 保持默认：`next build`（或 `bash .zscripts/build.sh`）
6. Output Directory 保持默认：`.next`
7. 点击 **Deploy**

### 3. 配置环境变量（可选）

在 Vercel 项目设置 → **Settings → Environment Variables** 中添加：

| 变量名 | 示例值 | 说明 |
|--------|--------|------|
| `Z_API_KEY` | `sk-zai-xxx` | z.ai API Key，如需服务端代理 Z.ai |
| `OPENAI_API_KEY` | `sk-xxx` | OpenAI API Key |
| `ANTHROPIC_API_KEY` | `sk-ant-xxx` | Claude API Key |

> 提示：如果不配置服务端 Key，用户可以在游戏面板的「厂商配置」里手动填写各平台的 API Key，前端直连云平台。

## 二、访问游戏

部署成功后，Vercel 会分配一个域名，例如：
```
https://pixel-world-box-xxx.vercel.app
```

在平板浏览器打开该域名，即可直接使用神谕 AI。

## 三、启用神谕 AI 步骤

1. 打开游戏页面
2. **硬刷新页面**（关闭标签页重新打开，清除缓存）
3. 点击左侧栏 **「神谕」**（🧠）
4. 点击右上角厂商配置按钮
5. 选择任意厂商预设：
   - **内置 Z.ai** → 需填 API Key（从 https://platform.z.ai 获取）
   - **Z.ai 免费(GLM-Flash)** → 完全免费模型 GLM-4.7-Flash
   - **OpenRouter 免费路由** → `openrouter/free` 随机免费模型
   - **NVIDIA NIM 免费** → nemotron-3.5-lightning-30b-a3b
   - **Groq 免费层** → llama-3.1-8b-instant
   - **GitHub Models 免费** → meta-llama-3.1-8b-instruct
   - **Google Gemini 免费** → gemini-1.5-flash-latest
   - **Agnes** → Base URL 和模型名留空，待你填写
   - **自定义（OpenAI 兼容）** → 自行填写任意 OpenAI 兼容端点
6. 输入问题发送，神谕 AI 立即回答

## 四、与 GitHub Pages 静态部署的区别

| 特性 | GitHub Pages（静态） | Vercel（非静态，本分支） |
|------|---------------------|------------------------|
| 部署成本 | 免费 | 免费（Hobby 层） |
| 是否需信用卡 | 否 | 否 |
| API Routes | ❌ 不支持 | ✅ 支持 |
| SSE 流式输出 | ❌ 不支持 | ✅ 支持 |
| 内置 Z.ai 服务端代理 | ❌ 不可用 | ✅ 可用 |
| 前端直连云端模型 | ✅ 可用 | ✅ 可用 |
| 会话持久化 | ❌ 仅内存 | ⚠️ 需额外接数据库 |

## 五、已知限制

1. **本地模型（Qwen-0.5B）在 iOS Safari 上不可用**：iOS Safari 不支持 WebGPU，加载 350MB 量化模型易崩溃。建议在平板上使用云端免费模型（Z.ai / Groq / GitHub Models 等）。
2. **会话历史未持久化**：页面刷新后对话记录会丢失。如需持久化，需额外接 Vercel KV 或外部数据库。
3. **API Key 前端明文**：如果用户在面板填写 API Key，会以明文存储在浏览器 localStorage。如需更安全，可在服务端配置环境变量并代理请求。

## 六、切回 GitHub Pages 静态部署

如需切回静态部署，使用 `main` 分支并运行：

```bash
STATIC_EXPORT=1 EXPORT_BASE_PATH="/pixel-world-box" bash .zscripts/export-static.sh
```

生成的 `out/` 目录可部署到 GitHub Pages `gh-pages` 分支。