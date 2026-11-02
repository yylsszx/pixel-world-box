// M-U27 零漂移验证：旧 tool3.json（HEAD）前 40 场景与新文件逐字节深比较
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const old = JSON.parse(execSync('git show HEAD:scripts/unity-migration/golden/tool3.json', { encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 }));
const nw = JSON.parse(readFileSync('/home/z/my-project/scripts/unity-migration/golden/tool3.json', 'utf8'));
if (old.scenarios.length !== 40) throw new Error(`旧场景数 ${old.scenarios.length} ≠ 40`);
if (nw.scenarios.length !== 48) throw new Error(`新场景数 ${nw.scenarios.length} ≠ 48`);
for (let i = 0; i < 40; i++) {
  const a = JSON.stringify(old.scenarios[i]);
  const b = JSON.stringify(nw.scenarios[i]);
  if (a !== b) throw new Error(`场景 ${i}（${old.scenarios[i].key}）漂移！`);
}
// meta 面只允许 scenarioCount 变化 + 域描述追加（不比对——协议面）
console.log('旧 40 场景逐字节零漂移 PASS；新 8 场景 key:', nw.scenarios.slice(40).map((s) => s.key).join(' '));
