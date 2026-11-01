// probe-grab-throw.mjs —— M-U21 探针：S17 grab-throw 飞行路径/撞山/落点位级打印
// 判据：撞山即坠分支（L5352 tt!==MOUNTAIN 门）真实触发——u910 在山格旁停驻
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(ROOT);
const { execSync } = await import('node:child_process');

// 直接复用 gen-tool3 的引擎链：inline 构造（import 引擎 + 场景 spec 手术重放）
const { default: createEngine } = await import('./gen-tool3-helper.mjs').catch(() => ({ default: null }));
if (!createEngine) {
  console.log('helper 不存在——改走 JSON 步快照分析');
  const gold = JSON.parse(readFileSync('scripts/unity-migration/golden/tool3.json', 'utf8'));
  const sc = gold.scenarios.find((s) => s.key === 'grab-throw');
  console.log('totalDraws:', sc.totalDraws);
  let last = null;
  for (const st of sc.stepsSnap) {
    const u = (st.units ?? []).find((x) => x.id === 910);
    if (!u) continue;
    const thrT = u.thrT ?? 0, grab = u.grab ?? 0;
    // f64hex → number
    const hx = (h) => { const b = Buffer.from(h, 'hex'); return b.readDoubleLE(0); };
    const x = hx(u.x), y = hx(u.y);
    if (!last || Math.abs(last.x - x) > 1e-9 || Math.abs(last.y - y) > 1e-9 || last.thrT !== thrT) {
      console.log(`tick=${st.tick} x=${x.toFixed(4)} y=${y.toFixed(4)} thrT=${thrT} grab=${grab} hp=${hx(u.hp).toFixed(2)} hurt=${hx(u.hurt)}`);
      last = { x, y, thrT };
    }
  }
}
