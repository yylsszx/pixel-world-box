#!/usr/bin/env node
// node 运行器：注册 .ts resolve 钩子后动态加载目标脚本
// 用法: node scripts/unity-migration/run-node-ts.mjs <script.mjs>
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

register('./ts-resolve.mjs', import.meta.url);

// 动态 import 的目标模块 import.meta.main=false —— env 标记放行其主流程
process.env.WB_GEN_MAIN = '1';

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node run-node-ts.mjs <script.mjs>');
  process.exit(1);
}
await import(pathToFileURL(path.resolve(arg)).href);
