// probe-cvt-seeds.mjs — M-U3c 场景种子猎取器（复用 gen-units-civtick runScenario，零同源复制）
// 目标：为 CVT20/21/22/24 找到命中目标分支的种子（colony 启航 / 叛乱分裂 / 深盟融合 / 外交宣战）
// 跑法：node scripts/unity-migration/probe-cvt-seeds.mjs
import { runScenario, scenarios } from './gen-units-civtick.mjs';

function probe(name, pred, tries = 300) {
  const sc = scenarios.find((s) => s.name === name);
  if (!sc) { console.log(`[probe] ${name}: scenario not found`); return null; }
  for (let k = 0; k < tries; k++) {
    const seed = (sc.seed + k * 0x9e37) >>> 0;
    const r = runScenario({ ...sc, seed });
    if (pred(r)) {
      console.log(`[probe] ${name}: seed=0x${seed.toString(16)} hit at k=${k}`);
      return seed;
    }
  }
  console.log(`[probe] ${name}: NO HIT in ${tries} tries`);
  return null;
}

// CVT20：殖民船启航（有单位 boat=1 且 boatTTL=1200 且落在水面上）
const s20 = probe('CVT20-colony-launch', (r) => r.traces[0].units.some((u) => u.boat === 1 && u.boatTTL === 1200));
// CVT21：叛军王国建成（civs 长度 2 且 warData rebel）
const s21 = probe('CVT21-rebel-split', (r) => r.traces[0].civs.length === 2 && r.traces[0].warData.some((w) => w.reason === 'rebel'));
// CVT22：深盟融合发生（civ1 alive=false mergedInto=0）
const s22 = probe('CVT22-merge-fuse', (r) => { const g = r.traces[0].civs.find((c) => c.id === 1); return g && g.alive === false && g.mergedInto === 0; });
// CVT24：宣战发生（warData border 出现）
const s24 = probe('CVT24-diplomacy-war', (r) => r.traces[r.traces.length - 1].warData.some((w) => w.reason === 'border'));

console.log(JSON.stringify({ s20, s21, s22, s24 }));
