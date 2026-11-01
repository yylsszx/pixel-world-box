// M-U25 相二诊断：S36 units dump 逐字段 diff + S37 step0 rngA 对比
import { readFileSync } from 'node:fs';
const golden = JSON.parse(readFileSync(new URL('./golden/tool3.json', import.meta.url), 'utf8'));
for (const key of ['wildlife-rebound', 'rebound-fish']) {
  const sc = golden.scenarios.find((s) => s.key === key);
  console.log(`\n=== ${key} seed=0x${sc.seed.toString(16)} ticks=${sc.ticks} goldenDraws=${sc.totalDraws} ===`);
  console.log('golden step0 rngA:', sc.stepsSnap[0].rngA, ' unitsCount:', sc.stepsSnap[0].unitsCount);
  if (key === 'wildlife-rebound') {
    console.log('golden units dump:');
    for (const u of sc.units) console.log(' ', JSON.stringify(u));
    console.log('golden wildAll:', JSON.stringify(sc.wildAll));
    console.log('golden reboundLast:', JSON.stringify(sc.reboundLast));
    console.log('golden events:', JSON.stringify(sc.events));
    console.log('golden fx:', JSON.stringify(sc.fx));
  } else {
    console.log('golden step0 fx:', JSON.stringify(sc.stepsSnap[0].fx));
    console.log('golden step0 units:', JSON.stringify(sc.stepsSnap[0].units).slice(0, 400));
    console.log('golden step1 rngA:', sc.stepsSnap[1]?.rngA);
  }
}
