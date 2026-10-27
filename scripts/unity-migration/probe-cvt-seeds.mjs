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

// ==================== M-U3d 联盟系统 + 旨意颁布 ====================
// CVT26：结盟诞生（alliances 出现 id=1 新盟）
const s26 = probe('CVT26-form-alliance', (r) => r.traces[0].alliances.length === 1);
// CVT27：扩员成功（members 3 人）
const s27 = probe('CVT27-join-alliance', (r) => r.traces[0].alliances[0] && r.traces[0].alliances[0].members.length === 3);
// CVT30：al1 凝聚力涣散解散（只剩 al0 一个盟）
const s30 = probe('CVT30-cohesion-two-als', (r) => r.traces[0].alliances.length === 1 && r.traces[0].alliances[0].bonded === true);
// CVT31：经济互助发生（gold 10 → 25）
const s31 = probe('CVT31-aid-drift', (r) => r.traces[0].civs.find((c) => c.id === 0).gold === 25);
// CVT38：口传心授命中（research 非 null —— rng<0.35 且 rng<0.5 双门）
const s38 = probe('CVT38-tech-tick-natural', (r) => r.traces[0].civs[0].research != null);

// ==================== M-U3f 经济/社会域 ====================
// CVT52：理念扩散三连门（festival rng≥0.3 跳过 + idea rng<0.15 + adoptIdea rng<0.5 known 分支）
const s52 = probe('CVT52-society-adopt-idea', (r) => {
  const c = r.traces[0].civs[0];
  return JSON.stringify(c.ideas) === '["id0"]' && r.traces[0].emIdeas.length === 1;
});
// CVT54：危机暴动门（crisis rng<0.25 且 pop≤25 走 riot 支）
const s54 = probe('CVT54-society-riot', (r) => r.traces[0].newEvents.some((e) => e.kind === 'riot'));

console.log(JSON.stringify({ s20, s21, s22, s24, s26, s27, s30, s31, s38, s52, s54 }));
