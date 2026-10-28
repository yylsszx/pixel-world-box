// M-O1 dsh 源码解析钩子（resolve hook）
// 作用：把 @deepseek-ai/dsh-* / cordis / cosmokit / schemastery 的裸导入
//       重写到包内 src/ 源码入口（dsh 各包 exports 指向未构建的 lib/，
//       但同时暴露 ./src/*；零构建源码直消费路线，见 docs/deepseek-harness-adaptation.md §4）。
// 数据：manifest（包名 → 包目录绝对路径）由 hook-register.mjs 预扫描并经
//       module.register(url, { data }) 传入（钩子线程与主线程不共享全局）。
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync, statSync } from 'node:fs'

let manifest = {}

export function initialize(data) {
  manifest = data && typeof data === 'object' ? data : {}
}

function candidatesFor(entry) {
  return [
    entry + '.ts',
    entry + '.tsx',
    path.join(entry, 'index.ts'),
    path.join(entry, 'index.tsx'),
    entry,
  ]
}

export async function resolve(specifier, context, nextResolve) {
  if (typeof specifier === 'string' && specifier.startsWith('@deepseek-ai/')) {
    const rest = specifier.slice('@deepseek-ai/'.length)
    const slash = rest.indexOf('/')
    const name = slash === -1 ? rest : rest.slice(0, slash)
    const sub = slash === -1 ? [] : rest.slice(slash + 1).split('/')
    const pkgDir = manifest[name]
    if (pkgDir) {
      // 'dsh-x/src/foo' 形式（./src/* 导出）：sub 已含 src；否则映射到 src 入口
      const rel = sub[0] === 'src' || sub[0] === 'locale'
        ? sub.join('/')
        : ['src', ...sub].join('/')
      const base = path.join(pkgDir, rel)
      if (sub[0] === 'src' || sub.length === 0) {
        for (const cand of candidatesFor(base)) {
          if (existsSync(cand) && statSync(cand).isFile()) {
            return { url: pathToFileURL(cand).href, shortCircuit: true, format: 'module' }
          }
        }
      } else if (existsSync(base) && statSync(base).isFile()) {
        // package.json / locale json 等真实文件子路径：直取
        return { url: pathToFileURL(base).href, shortCircuit: true }
      }
      // manifest 命中但候选不存在 → 交回默认解析（lib/ 缺失时报错更可诊断）
    }
  }
  return nextResolve(specifier, context)
}
