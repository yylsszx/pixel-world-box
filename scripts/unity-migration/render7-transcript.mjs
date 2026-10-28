// render7-transcript.mjs — M-U7c 渲染接线 II 镜像对账（render7.json 18 场景 direct 模式全档逐位）
// 复用 render-transcript 的 unitScene 双模式（direct=true → mrr* 直调；涌现分支 = M-U7c 接线 mrrDrawEmergent*）
// + setDynRdef 动态种族 def 注入（golden rdefs 重放契约：vis = JSON.stringify(genome) 原始数字串）。
// 跑法：node scripts/unity-migration/render7-transcript.mjs（全绿输出 RENDER7 MIRROR PASS，退出码 0）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unitScene, setDynRdef } from './render-transcript.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GOLD = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/render7.json'), 'utf-8'));

let pass = 0, fail = 0;
const fails = [];
for (const sc of GOLD.scenarios) {
  // 动态种族 def 注入（重放契约：genome JSON 串 → 对象；bool 0/1 → 布尔）
  const dyn = {};
  if (sc.rdefs) {
    for (const k of Object.keys(sc.rdefs)) {
      const d = sc.rdefs[k];
      dyn[k] = {
        sprite: d.sprite, maxAge: d.maxAge,
        aquatic: d.aquatic === 1, flying: d.flying === 1, sandswim: d.sandswim === 1,
        vis: d.vis == null ? false : JSON.parse(d.vis), dynTint: null,
      };
    }
  }
  setDynRdef(dyn);
  const L = unitScene(sc.in, true);   // direct 模式：涌现分支 → mrrDrawEmergent* 直调
  setDynRdef(null);                   // 场景隔离（防跨场景动态种残留）
  const got = JSON.stringify(L.ops);
  const exp = JSON.stringify(sc.ops);
  if (got === exp) { pass++; continue; }
  fail++;
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
setDynRdef(null);

console.log(`M-U7c 直调镜像逐位对账: ${pass}/${pass + fail} 场景 ${fail === 0 ? 'ALL PASS' : 'FAIL'}`);
for (const f of fails.slice(0, 8)) console.error('  [FAIL]', f);
if (fail > 0) process.exit(1);
console.log('RENDER7 MIRROR PASS');
