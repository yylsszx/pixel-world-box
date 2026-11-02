// M-O4 相二/相三：dsh 运行时引导器（oracle-server 挂运行时的唯一入口）
// 职责：DSH_RUNTIME=1 时把 oracle-server/dsh-runtime（装配树）以「源码直消费」方式
//       挂进本进程——tsx 程序化注册（TS 转译）+ dsh-hook（@deepseek-ai/* → src/ 源码）
//       + cordis Context（SystemPrompt/ToolsService/NativeToolExecutor + pwb 五件）。
// 相三：追加会话持久化装配——JsonlSessionPersistence（ctx.sessionPersistence 缝）
//       + SessionMemory（回合事件机 + foldSurface 投影回放 + compaction 双策略）。
// 纪律：复用 dsh 源码不改逻辑（钩子组合与 scripts/oracle-dsh/run-runtime-smoke.sh 同链：
//       先 tsx 后 dsh-hook，池冒烟五步实证）；本文件不含任何游戏/厂商业务逻辑。
// 消费方：server.mjs（DSH_RUNTIME=1 门）；镜像内路径见 Dockerfile 装配层。
// 挂载序铁律：tsx → dsh-hook → 一切 @deepseek-ai/* 静态导入模块（pwb-plugins/persistence/memory）。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { register as moduleRegister } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** 预扫描装配树包清单（@deepseek-ai/* → 包目录），两层形态 packages/<ns>/<pkg>、packages/<pkg>、vendor/<pkg> */
function scanManifest(runtimeRoot) {
  const manifest = {}
  const scanRoots = [
    path.join(runtimeRoot, 'packages'),
    path.join(runtimeRoot, 'vendor'),
  ]
  for (const root of scanRoots) {
    if (!existsSync(root)) continue
    for (const l1 of readdirSync(root, { withFileTypes: true })) {
      if (!l1.isDirectory() || l1.name.startsWith('.')) continue
      const p1 = path.join(root, l1.name)
      const pkg1 = path.join(p1, 'package.json')
      if (existsSync(pkg1)) {
        try {
          const name = JSON.parse(readFileSync(pkg1, 'utf8')).name
          if (typeof name === 'string' && name.startsWith('@deepseek-ai/')) {
            manifest[name.slice('@deepseek-ai/'.length)] = p1
          }
        } catch { /* 非 JSON 包声明，跳过 */ }
      }
      for (const l2 of readdirSync(p1, { withFileTypes: true })) {
        if (!l2.isDirectory() || l2.name.startsWith('.')) continue
        const pkg2 = path.join(p1, l2.name, 'package.json')
        if (existsSync(pkg2)) {
          try {
            const name = JSON.parse(readFileSync(pkg2, 'utf8')).name
            if (typeof name === 'string' && name.startsWith('@deepseek-ai/') && !manifest[name.slice('@deepseek-ai/'.length)]) {
              manifest[name.slice('@deepseek-ai/'.length)] = path.join(p1, l2.name)
            }
          } catch { /* 同上 */ }
        }
      }
    }
  }
  return manifest
}

/** dsh-hook 物理定位：装配树 .pwb-hooks 章（pack-runtime.mjs 盖章）→ 仓内 scripts 兜底 */
function locateDshHook(runtimeRoot) {
  const stamped = path.join(runtimeRoot, '.pwb-hooks', 'dsh-hook.mjs')
  if (existsSync(stamped)) return stamped
  const repo = path.join(HERE, '..', 'scripts', 'oracle-dsh', 'dsh-hook.mjs')
  if (existsSync(repo)) return repo
  return null
}

/**
 * 挂载 dsh 运行时（幂等性由调用方保证：server.mjs 仅在 DSH_RUNTIME=1 时调用一次）。
 * 返回 { app, manifestCount, dispose }；任何一步失败即抛错（server 捕获进 healthz）。
 */
export async function bootDshRuntime({ runtimeRoot } = {}) {
  const root = runtimeRoot
    ? path.resolve(runtimeRoot)
    : path.join(HERE, 'dsh-runtime')
  if (!existsSync(path.join(root, 'package.json'))) {
    throw new Error(`装配树不存在：${root}（先 node scripts/oracle-dsh/pack-runtime.mjs）`)
  }
  if (!existsSync(path.join(root, 'node_modules'))) {
    throw new Error(`装配树未安装依赖：${root}（cd ${root} && pnpm install --ignore-scripts）`)
  }

  // ① tsx 程序化注册：TS 源码转译（物理定位避免依赖链外溢）
  const tsxApiPath = path.join(root, 'node_modules', 'tsx', 'dist', 'esm', 'api', 'index.mjs')
  if (!existsSync(tsxApiPath)) {
    throw new Error(`tsx 未随装配树安装：${tsxApiPath}`)
  }
  const tsxApi = await import(pathToFileURL(tsxApiPath).href)
  const unregisterTsx = tsxApi.register()

  // ② dsh-hook：@deepseek-ai/* 裸导入 → src/ 源码（manifest 经 data 传入钩子线程）
  const manifest = scanManifest(root)
  const manifestCount = Object.keys(manifest).length
  if (manifestCount === 0) {
    unregisterTsx?.()
    throw new Error('包清单为空：装配树 packages/ 与 vendor/ 均未发现 @deepseek-ai/* 包')
  }
  const hookPath = locateDshHook(root)
  if (!hookPath) {
    unregisterTsx?.()
    throw new Error('dsh-hook.mjs 缺失（.pwb-hooks 章与 scripts/oracle-dsh 兜底均未命中）')
  }
  moduleRegister(pathToFileURL(hookPath), {
    parentURL: pathToFileURL(import.meta.url),
    data: manifest,
  })

  // ③ cordis 启动面：SystemPrompt + ToolsService + NativeToolExecutor + pwb 五件
  //    （与 runtime-smoke ①/③ 同构；hook 链上 @deepseek-ai/* 由此起可解析）
  const { Context } = await import('@deepseek-ai/cordis')
  const SystemPrompt = (await import('@deepseek-ai/dsh-system-prompt')).default
  const { ToolsService } = await import('@deepseek-ai/dsh-tools')
  const nativeExecutorPlugin = await import('@deepseek-ai/dsh-tool-executor-native')
  const { applyAll } = await import('./pwb-plugins.mjs')

  const app = new Context()
  new SystemPrompt(app, {})
  new ToolsService(app)
  nativeExecutorPlugin.apply(app)
  const disposePwb = applyAll(app)
  if (!app.tools || !app.systemPrompt) throw new Error('ctx.tools/ctx.systemPrompt 未就位')
  if (!app.pwbTools || !app.pwbContext || !app.pwbPrompt || !app.pwbBridge || !app.pwbStore) {
    throw new Error('pwb 五件未就位')
  }

  // ④ 相三：会话持久化装配（ctx.sessionPersistence JSONL 后端 + 会话记忆引擎）
  //    存储根：PWB_STORE_ROOT 优先（镜像内 /tmp/pwb-store），缺省 os.tmpdir()/pwb-store（不污染仓）
  const storeRoot = process.env.PWB_STORE_ROOT
    ? path.resolve(process.env.PWB_STORE_ROOT)
    : path.join(os.tmpdir(), 'pwb-store')
  const { JsonlSessionPersistence } = await import('./dsh-jsonl-persistence.mjs')
  const { SessionMemory } = await import('./dsh-session-memory.mjs')
  const persistence = new JsonlSessionPersistence(app, { root: storeRoot })
  // cordis 以 fiber 过滤 getter 暴露服务（非恒等），此处只断言能力面
  if (typeof app.sessionPersistence?.create !== 'function' || typeof app.sessionPersistence?.open !== 'function') {
    throw new Error('ctx.sessionPersistence 注册失败')
  }
  const budgetChars = Number(process.env.DSH_SESSION_SURFACE_CHAR_BUDGET) || undefined
  const keepTail = Number(process.env.DSH_SESSION_COMPACT_KEEP_TAIL) || undefined
  const pruneKeep = Number(process.env.DSH_SESSION_PRUNE_KEEP) || undefined
  const memory = new SessionMemory(app, { budgetChars, keepTail, pruneKeep })

  return {
    app,
    root,
    manifestCount,
    storeRoot,
    persistence,
    memory,
    async dispose() {
      try { await memory.dispose() } catch { /* 幂等卸载 */ }
      try { await persistence.closeAll() } catch { /* 幂等卸载 */ }
      try { disposePwb() } catch { /* 幂等卸载 */ }
      try { unregisterTsx?.() } catch { /* 进程级钩子，尽力而为 */ }
    },
  }
}
