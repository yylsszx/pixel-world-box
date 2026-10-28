// node ESM resolve 钩子：扩展名缺失的相对 import 自动尝试 .ts
// 背景：src/lib/game/types.ts 含值重导出 `export {...} from './items'`，
// 裸 node type-stripping 不擦除值导入 → ERR_MODULE_NOT_FOUND。
// 配合 run-node-ts.mjs 使用（register 必须先于受影响模块求值）。
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.(ts|js|mjs|json)$/.test(specifier)) {
      try {
        return await next(specifier + '.ts', context);
      } catch {
        // 透传原始错误
      }
    }
    throw e;
  }
}
