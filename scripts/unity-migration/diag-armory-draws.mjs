// diag-armory-draws.mjs —— S1 分步掷数核账（chainDraws 相邻 rngA 反解）
import { readFileSync } from 'node:fs';
const g = JSON.parse(readFileSync(new URL('./golden/armory.json', import.meta.url), 'utf8'));
const step = (a) => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return a; };
function chainDraws(s0, s1) {
  if ((s0 >>> 0) === (s1 >>> 0)) return 0;
  let a = s0 | 0;
  for (let k = 0; k < 5000000; k++) { a = step(a); if ((a >>> 0) === (s1 >>> 0)) return k + 1; }
  throw new Error('链断裂');
}
for (const s of g.scenarios) {
  let acc = s.seed >>> 0;
  const parts = [];
  for (const st of s.steps) {
    const d = chainDraws(acc, parseInt(st.rngA, 16));
    parts.push(`${st.op}:${d}`);
    acc = parseInt(st.rngA, 16);
  }
  console.log(`S${s.key} [${parts.join(' ')}] total=${s.totalDraws}`);
}
