// M-O4 相一：dsh 运行时装配器——从 third_party/deepseek-harness 池装配「保留六组 +
// 依赖闭包 + 底座豁免」到 oracle-server/dsh-runtime/（gitignored，不入库；R3 隔离纪律）
// 用法：
//   node scripts/oracle-dsh/pack-runtime.mjs --dry-run   # 只审计：闭包决策 + 裸依赖清单
//   node scripts/oracle-dsh/pack-runtime.mjs             # 实装配（禁载冲突守门即停）
// 蓝本：docs/ORACLE_V2.md §4/§8 步骤5 + docs/deepseek-harness-adaptation.md §4 方案A
// 纪律：白名单注册（不改 dsh 源码）；禁载能力组绝不入装配树（守门即停，禁静默放行）。
import { readFileSync, existsSync, readdirSync, mkdirSync, cpSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..', '..')
const DSH_ROOT = process.env.DSH_ROOT
  ? path.resolve(process.env.DSH_ROOT)
  : path.join(projectRoot, 'third_party', 'deepseek-harness')
const OUT_ROOT = path.join(projectRoot, 'oracle-server', 'dsh-runtime')
const DRY = process.argv.includes('--dry-run')

function isPkgDir(d) {
  return !path.basename(d).startsWith('.') && existsSync(path.join(d, 'package.json'))
}
const listPkgDirs = (dir) => readdirSync(dir, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => path.join(dir, e.name))
  .filter(isPkgDir)

// ---- 保留六组（提示词恒定段：core/context/subagent/skill/llm-deepseek/cordis）----
// llm-deepseek 组 = packages/llm/llm-deepseek（dsh-llm 基座与 deepseek-llm-api-extensions
// 由闭包自动补齐）；cordis 组 = vendor/ 全家（cordis/cosmokit/schemastery/插件件）
// ---- 种子排除（包级，审计在案 2026-11-02）：外部 CLI 桥接与重型二进制依赖，
// 违反 §5 判据①（容器 1GB 预算）与隔离纪律；闭包若被硬依赖仍会拉回并触发冲突守门 ----
const SEED_EXCLUDE = new Set([
  'packages/subagent/subagent-acp',          // 外部 ACP 协议 CLI 桥（@agentclientprotocol/sdk）
  'packages/subagent/subagent-claude-code',  // 外部 Claude Code CLI 桥（claude-agent-sdk 二进制级）
  'packages/subagent/subagent-codex',        // 外部 Codex CLI 桥（@openai/codex 二进制级）
  'packages/subagent/subagent-dsh-sdk',      // SDK 子代理桥（牵出 subprocess 链；PWB 用 in-process 产物）
  'packages/skill/skill-office',             // LibreOffice 二进制依赖（@deepseek-ai/libreoffice-kit）
  'packages/core/tool-executor-ptc',         // PTC 执行器（PWB 用 native 执行器；牵出 ptc-runtime/sandbox 链）
  'packages/context/tmux-context',           // tmux 终端上下文（PWB 无 tmux 能力面，牵出 shell 链）
])

const SEED_DIRS = [
  ...listPkgDirs(path.join(DSH_ROOT, 'packages', 'core')),
  ...listPkgDirs(path.join(DSH_ROOT, 'packages', 'context')),
  ...listPkgDirs(path.join(DSH_ROOT, 'packages', 'subagent')),
  ...listPkgDirs(path.join(DSH_ROOT, 'packages', 'skill')),
  path.join(DSH_ROOT, 'packages', 'llm', 'llm-deepseek'),
  ...listPkgDirs(path.join(DSH_ROOT, 'vendor')),
].filter(d => !SEED_EXCLUDE.has(path.relative(DSH_ROOT, d)))

// ---- 禁载能力组（组级，ORACLE_V2 §4 纪律映射：host/fs/shell/terminal/subprocess/ssh/
// browser-use/computer-use/web/e2b + 隔离推理排除的 client/bundle/api/boot/mcp/
// sandbox/experimental 等）——闭包触达未豁免包即冲突报错，禁静默放行。
const HARD_DENY = [
  'packages/shell', 'packages/web', 'packages/browser-use', 'packages/computer-use',
  'packages/ssh', 'packages/terminal', 'packages/subprocess', 'packages/host',
  'packages/fs', 'packages/mcp', 'packages/sandbox', 'packages/experimental',
  'packages/client', 'packages/bundle', 'packages/api', 'packages/boot',
  'packages/workspace', 'packages/jobs', 'packages/plan', 'packages/lsp',
  'packages/document', 'packages/office', 'packages/deliverables', 'packages/ptc-runtime',
  'packages/workflow', 'packages/interaction', 'packages/credentials', 'packages/identity',
  'packages/telemetry', 'packages/feedback', 'packages/guard', 'packages/goal',
  'packages/schedule', 'packages/todo', 'packages/spill', 'packages/attachment',
  'packages/session-query', 'packages/preset', 'packages/storage', 'packages/test-support',
  'packages/acp', 'packages/typert', 'packages/compaction/compaction-image-offload',
]
// ---- 底座豁免（包级）：非能力面、被保留组硬依赖的库件，逐项审计在案
// （dry-run 裁决 2026-11-02；能力面 tool-fs/tool-web 等工具仍由注册层禁载）----
const SUBSTRATE_ALLOW = new Set([
  'packages/fs/fs',                      // fs 底座库（能力面 tool-fs/tool-fs-search/str-replace-editor 仍禁）
  'packages/attachment/attachment',      // 附件类型模型（llm-deepseek 硬依赖）
  'packages/identity/anonymous-user-id', // 匿名设备 ID（llm-deepseek 硬依赖，无能力面）
  'packages/typert/protocol',            // llm 类型协议（dsh-llm 硬依赖）
  'packages/workspace/workspace',        // workspace 模型（core/agent、subagent 硬依赖）
  'packages/boot/config-editor',         // 配置编辑模型（agent-default-model 硬依赖）
  'packages/interaction/user-approval',  // 审批策略接口（tools/subagent 硬依赖；无注册即惰性）
  'packages/interaction/user-questions', // 提问接口（sdk/protocol 硬依赖）
  'packages/interaction/commands',       // 命令模型（compaction/sdk/protocol 硬依赖）
  'packages/session-query/session-query', // 会话查询接口（不失忆检索路径；sqlite 实现仍禁）
  'packages/spill/spill',                // 溢出协议接口（session-reference 硬依赖；spill-local 仍禁）
  'packages/preset/agent-preset-registry', // 预设注册表模型（subagent/tool-subagent 硬依赖）
  'packages/fs/fs-patch',                // fs 补丁模型（fs/fs 硬依赖）
  'packages/sandbox/sandbox',            // 沙箱策略接口（subagent/fs 硬依赖；执行体 local 仍禁）
  'packages/sandbox/sandbox-policy',     // 沙箱策略模型（subagent 硬依赖）
  'packages/storage/storage-domain',     // 存储域接口（projection-cache 硬依赖；json/sqlite 实现仍禁）
  'packages/interaction/permission-presets', // 权限预设模型（subagent 硬依赖）
  'packages/storage/storage',            // 存储接口根（workspace 硬依赖；实现件仍禁）
  'packages/boot/hmr',                   // HMR 生命周期模型（config-editor 硬依赖）
  'packages/boot/app-boot',              // 应用生命周期模型（config-editor/preset-registry 硬依赖；host webserver 仍禁）
  'packages/ptc-runtime/ptc-runtime',    // PTC 协议模型（agent 执行器注册表硬依赖；ptc-runtime-node 执行体仍禁，且 native 执行器才注册）
  'packages/todo/tool-todo',             // todo 工具模型（session-query 硬依赖；agent 任务追踪 benign）
  'packages/shell/shell',                // shell 接口模型（permission-presets 硬依赖；tool-bash/bash-local/pwsh 等执行体仍禁）
  'packages/boot/cmdline',               // 命令行解析模型（hmr 硬依赖）
  'packages/compaction/compaction-image-offload', // 图片卸载策略（session-format-catalog 硬依赖；无注册即惰性）
  'packages/subprocess/subprocess',      // 子进程接口模型（shell/shell 硬依赖；subprocess-local/win32 执行体仍禁）
])
// ---- 幽灵依赖 stub：池内无声明且源码零 import 的 manifest 残留（grep 实证在案）——
// 合成空 meta 包满足 manifest 完整性；若未来真实 import 出现，tsx 解析失败即显性报错 ----
const PHANTOM_STUBS = new Set([
  '@deepseek-ai/dsh', // sdk/client 声明依赖但池内无声明（根包实名 dsh-root）且源码零 import
])
// ---- 装配时依赖剔除：凡装配树不存在的 workspace:* 依赖一律剔除（pnpm 对 devDeps 中的
// workspace 残留同样强校验；运行面由闭包保证，真实运行时 import 若被误剔会由冒烟显性抓出）。
// 已知案例：agent-loop-testkit（4 包声明、0 源码 import）、compaction-basic（image-offload devDep）

// ---- 池内包名→目录映射（vendor 单层布局 + packages 双层布局，与 hook-register 同构）----
const nameToDir = new Map()
for (const groupRoot of [path.join(DSH_ROOT, 'packages'), path.join(DSH_ROOT, 'vendor')]) {
  for (const l1 of readdirSync(groupRoot, { withFileTypes: true })) {
    if (!l1.isDirectory()) continue
    const p1 = path.join(groupRoot, l1.name)
    const pkg1 = path.join(p1, 'package.json')
    if (existsSync(pkg1)) {
      try {
        const name = JSON.parse(readFileSync(pkg1, 'utf8')).name
        if (typeof name === 'string' && !nameToDir.has(name)) nameToDir.set(name, p1)
      } catch { /* 跳过坏声明 */ }
    }
    for (const l2 of readdirSync(p1, { withFileTypes: true })) {
      if (!l2.isDirectory()) continue
      const pkgJson = path.join(p1, l2.name, 'package.json')
      if (!existsSync(pkgJson)) continue
      try {
        const name = JSON.parse(readFileSync(pkgJson, 'utf8')).name
        if (typeof name === 'string' && !nameToDir.has(name)) nameToDir.set(name, path.join(p1, l2.name))
      } catch { /* 跳过坏声明 */ }
    }
  }
}

function workspaceDeps(pkgDir) {
  const manifest = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
  const out = []
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = manifest[field]
    if (!deps || typeof deps !== 'object') continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && spec.startsWith('workspace')) out.push(name)
    }
  }
  return out
}

function denyReason(dir) {
  const rel = path.relative(DSH_ROOT, dir)
  if (SUBSTRATE_ALLOW.has(rel)) return null
  return HARD_DENY.find(prefix => rel === prefix || rel.startsWith(prefix + '/')) || null
}

// BFS 闭包：从种子出发，只沿 workspace 依赖边扩展；触禁即记冲突
const kept = new Map()     // name -> dir
const external = new Set() // 非工作区裸依赖（运行时根安装清单）
const phantoms = new Set() // 幽灵依赖（合成 stub 清单）
const conflicts = []       // {from, name, dir, reason}
const queue = [...SEED_DIRS]
for (const seed of SEED_DIRS) {
  const m = JSON.parse(readFileSync(path.join(seed, 'package.json'), 'utf8'))
  kept.set(m.name, seed)
}
while (queue.length) {
  const dir = queue.shift()
  for (const dep of workspaceDeps(dir)) {
    if (kept.has(dep)) continue
    if (PHANTOM_STUBS.has(dep)) { phantoms.add(dep); continue }
    const depDir = nameToDir.get(dep)
    if (!depDir) { conflicts.push({ from: path.relative(DSH_ROOT, dir), name: dep, dir: '(池外)', reason: 'workspace 依赖在池内无声明且非已知幽灵' }); continue }
    const reason = denyReason(depDir)
    if (reason) { conflicts.push({ from: path.relative(DSH_ROOT, dir), name: dep, dir: path.relative(DSH_ROOT, depDir), reason }); continue }
    kept.set(dep, depDir)
    queue.push(depDir)
  }
  const manifest = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
  for (const field of ['dependencies', 'peerDependencies']) {
    const deps = manifest[field]
    if (!deps || typeof deps !== 'object') continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && !spec.startsWith('workspace')) external.add(`${name}@${spec}`)
    }
  }
}

// ---- 审计输出 ----
console.log(`[pack] 池内包总数：${nameToDir.size}`)
console.log(`[pack] 装配闭包：${kept.size} 包（保留六组 + 依赖底座 + 豁免 ${SUBSTRATE_ALLOW.size}）`)
for (const [name, dir] of [...kept].sort()) console.log(`  + ${name}  <-  ${path.relative(DSH_ROOT, dir)}`)
console.log(`[pack] 外部裸依赖（运行时根安装）：${external.size} 项`)
if (external.size) for (const e of [...external].sort()) console.log(`  . ${e}`)
if (phantoms.size) for (const p of phantoms) console.log(`  ~ 幽灵依赖 stub：${p}（池内无声明且源码零 import）`)
if (conflicts.length) {
  console.error(`\n[pack] ✗ 禁载冲突 ${conflicts.length} 处（闭包触达能力组——需人工裁决，禁静默放行）：`)
  for (const c of conflicts) console.error(`  ! ${c.name}  <-  ${c.dir}  （被 ${c.from} 依赖；命中禁载 ${c.reason}）`)
  process.exit(2)
}

if (DRY) { console.log('\n[pack] dry-run 审计完毕（未写盘）'); process.exit(0) }

// ---- 实装配：镜像池内相对布局 + 生成 workspace 根 + 幽灵 stub ----
rmSync(OUT_ROOT, { recursive: true, force: true })
for (const dir of kept.values()) {
  const dest = path.join(OUT_ROOT, path.relative(DSH_ROOT, dir))
  mkdirSync(path.dirname(dest), { recursive: true })
  cpSync(dir, dest, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src)
      if (base === 'node_modules' || base === 'tests' || base === 'dist' || base === '.turbo') return false
      return true
    },
  })
}
for (const p of phantoms) {
  const stubDir = path.join(OUT_ROOT, 'packages', 'meta', 'stub-' + p.replace('@deepseek-ai/', '').replaceAll('/', '-'))
  mkdirSync(stubDir, { recursive: true })
  writeFileSync(path.join(stubDir, 'package.json'), JSON.stringify({ name: p, version: '0.0.0-stub', private: true, description: '幽灵依赖 stub——pack-runtime.mjs 合成（池内无声明且源码零 import）' }, null, 2) + '\n')
}
// 装配清单变换：剔除装配树不存在的 workspace 依赖（泛化规则 + 审计清单）
const depDropped = []
for (const dir of kept.values()) {
  const mfPath = path.join(OUT_ROOT, path.relative(DSH_ROOT, dir), 'package.json')
  if (!existsSync(mfPath)) continue
  const mf = JSON.parse(readFileSync(mfPath, 'utf8'))
  let touched = false
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
    const deps = mf[field]
    if (!deps || typeof deps !== 'object') continue
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec === 'string' && spec.startsWith('workspace') && !kept.has(name) && !phantoms.has(name)) {
        delete deps[name]
        depDropped.push(`${path.relative(DSH_ROOT, dir)}  ✂ ${name}`)
        touched = true
      }
    }
  }
  if (touched) writeFileSync(mfPath, JSON.stringify(mf, null, 2) + '\n')
}
if (depDropped.length) {
  console.log(`[pack] 剔除装配树外 workspace 依赖 ${depDropped.length} 处（运行面由闭包保证，冒烟把关）：`)
  for (const d of depDropped) console.log(`  ✂ ${d}`)
}
const rootManifest = {
  name: 'pwb-dsh-runtime',
  private: true,
  packageManager: 'pnpm@11.28.5',
  devDependencies: { tsx: '^4.23.13' },
  description: 'PWB 神谕 V2 运行时装配（保留六组 + 依赖闭包；由 scripts/oracle-dsh/pack-runtime.mjs 生成，勿手改）',
}
mkdirSync(OUT_ROOT, { recursive: true })
// 装配树根：极简 package.json + 仅含两种布局 glob 的 pnpm-workspace.yaml
// （池内 native/benchmarks/website 等 glob 不适用于装配树）
writeFileSync(path.join(OUT_ROOT, 'package.json'), JSON.stringify(rootManifest, null, 2) + '\n')
writeFileSync(path.join(OUT_ROOT, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*/*\n  - vendor/*\n')
// tsconfig 随池保留（tsx 源码直消费路线的路径语义）
if (existsSync(path.join(DSH_ROOT, 'tsconfig.json'))) cpSync(path.join(DSH_ROOT, 'tsconfig.json'), path.join(OUT_ROOT, 'tsconfig.json'))
console.log(`\n[pack] ✓ 装配完成：${OUT_ROOT}（${kept.size} 包；node_modules/tests/dist 已剔除）`)
console.log('[pack] 下一步：cd oracle-server/dsh-runtime && pnpm install --ignore-scripts && bash ../../scripts/oracle-dsh/run-runtime-smoke.sh')
