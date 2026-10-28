// probe-races.mjs — RACES 渲染字段快查（M-U4 场景选型用）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { RACES, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
for (const k of Object.keys(RACES)) {
  const r = RACES[k];
  console.log(String(k).padStart(3), String(R[k] ?? k).padStart(2), (r.key ?? '?').padEnd(12), 'sprite=' + String(r.sprite).padEnd(10),
    'vis=' + (!!r.vis ? 1 : 0), 'aq=' + (!!r.aquatic ? 1 : 0), 'fly=' + (!!r.flying ? 1 : 0),
    'ss=' + (!!r.sandswim ? 1 : 0), 'maxAge=' + r.maxAge, 'dynTint=' + (r.dynTint ?? '-'));
}
