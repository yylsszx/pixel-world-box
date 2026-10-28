// M-O1 dsh 冒烟入口注册器：预扫描包清单 → 注册解析钩子（data 传入钩子线程）
// 用法：node --import tsx --import scripts/oracle-dsh/hook-register.mjs scripts/oracle-dsh/smoke.mjs
//       （cwd 任意；DSH_ROOT 缺省 third_party/deepseek-harness）
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..', '..')
const DSH_ROOT = process.env.DSH_ROOT
  ? path.resolve(process.env.DSH_ROOT)
  : path.join(projectRoot, 'third_party', 'deepseek-harness')

if (!existsSync(path.join(DSH_ROOT, 'package.json'))) {
  console.error(`✗ DSH_ROOT 不存在：${DSH_ROOT}（先克隆 deepseek-harness，见 docs/deepseek-harness-adaptation.md §1）`)
  process.exit(1)
}

// 预扫描：packages/<ns>/<pkg>、packages/<pkg>、vendor/<pkg> 三层形态
const manifest = {}
const scanRoots = [
  path.join(DSH_ROOT, 'packages'),
  path.join(DSH_ROOT, 'vendor'),
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
        if (typeof name === 'string' && name.startsWith('@deepseek-ai/')) manifest[name.slice('@deepseek-ai/'.length)] = p1
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

const count = Object.keys(manifest).length
if (count === 0) {
  console.error('✗ 包清单为空：packages/ 与 vendor/ 均未发现 @deepseek-ai/* 包')
  process.exit(1)
}

register(new URL('./dsh-hook.mjs', import.meta.url), {
  parentURL: pathToFileURL(import.meta.url),
  data: manifest,
})
console.error(`[dsh-hook] manifest 就绪：${count} 包（DSH_ROOT=${DSH_ROOT}）`)
