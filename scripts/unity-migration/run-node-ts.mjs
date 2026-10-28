#!/usr/bin/env node
// node 运行器：注册 .ts resolve 钩子后动态加载目标脚本
// 用法: node scripts/unity-migration/run-node-ts.mjs <script.mjs>
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

register('./ts-resolve.mjs', import.meta.url);

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node run-node-ts.mjs <script.mjs>');
  process.exit(1);
}
// 动态 import 的目标模块 import.meta.main=false —— env 标记放行其主流程；
// WB_GEN_TARGET 目标感知：库模块（gen-units-scan/gen-units-combat 被 import 时）不得触发各自 main
process.env.WB_GEN_MAIN = '1';
process.env.WB_GEN_TARGET = path.basename(arg);
await import(pathToFileURL(path.resolve(arg)).href);
