// render5-transcript.mjs — M-U7a 渲染接线 I 镜像对账（render5.json 88 场景 direct 模式全档逐位）
// 复用 render-transcript 的 unitScene 双模式（direct=true → mrr* 直调，bail 契约翻转为 sprites op 展开）
// —— mrr* 家族 = render2/3/4-transcript 已验证镜像（M-U5a/b/c 三链），render5 对账面 = 分发语义零漂移
// 跑法：node scripts/unity-migration/render5-transcript.mjs（全绿输出 RENDER5 MIRROR PASS，退出码 0）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unitScene } from './render-transcript.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLD = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/render5.json'), 'utf-8'));

let pass = 0, fail = 0;
const fails = [];
for (const sc of GOLD.scenarios) {
  const L = unitScene(sc.in, true);   // direct 模式：bail 点替换为 mrr* 直调（对齐 C# WbRender 接线后语义）
  const got = JSON.stringify(L.ops);
  const exp = JSON.stringify(sc.ops);
  if (got === exp) { pass++; continue; }
  fail++;
  if (process.env.R5_VERBOSE) console.error(`  [SCENE-FAIL] ${sc.name} M=${L.ops.length} G=${sc.ops.length}`);
  // 定位首个差异 op
  const A = JSON.parse(got), B = JSON.parse(exp);
  let bad = `op 数 ${A.length} vs ${B.length}`;
  for (let k = 0; k < Math.min(A.length, B.length); k++) {
    if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) {
      bad = `op[${k}] ${A[k].o} vs ${B[k].o}\n    got:  ${JSON.stringify(A[k]).slice(0, 220)}\n    gold: ${JSON.stringify(B[k]).slice(0, 220)}`;
      break;
    }
  }
  fails.push(`${sc.name}: ${bad}`);
}

console.log(`M-U7a 直调镜像逐位对账: ${pass}/${pass + fail} 场景 ${fail === 0 ? 'ALL PASS' : 'FAIL'}`);
for (const f of fails.slice(0, 8)) console.error('  [FAIL]', f);
if (fail > 0) process.exit(1);
console.log('RENDER5 MIRROR PASS');
