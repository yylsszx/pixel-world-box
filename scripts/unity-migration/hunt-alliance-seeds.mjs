// 联盟域种子寻优器（跑完即弃——选定种子烘焙进 gen 文件）
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R } from '../../src/lib/game/types.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';

const mkEng = (civSpecs, seed, env = {}) => {
  const eng = Object.create(GameEngine.prototype);
  eng.civs = [];
  for (const cv of civSpecs) eng.civs[cv.id] = { ...cv, tiles: [1, 2, 3, 4], frontier: [], houses: 0, alive: cv.alive !== false, colorHex: '#ccc', ideas: [], culture: cv.culture };
  eng.met = new Set(); eng.rel = new Map(); eng.tension = new Map(); eng.raceRel = new Map();
  eng.warData = new Map(); eng.totalWars = new Set(); eng.warShame = new Map();
  eng.warHistory = []; eng.lastDeclareAt = new Map(); eng.allianceWarCd = new Map();
  eng.alliances = []; eng.allianceOf = new Map(); eng.allianceSeq = env.allianceSeq ?? 1;
  eng.directives = []; eng.armies = []; eng.emergentWeapons = new Map();
  eng.ideaModCache = new Map(); eng.emIdeas = new Map();
  eng.occSet = new Set(); eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };
  eng.laws = { wars: env.lawsWars !== false }; eng.tickCount = env.tick ?? 0; eng.yearF = 25;
  eng.eventSeq = 0; eng.toastSeq = 0; eng.statWars = 0;
  eng.lastCatastrophe = { tick: env.catTick ?? -1e9, x: -1, y: -1 };
  eng.zombieOutbreakNoted = !!env.zombieOutbreak;
  eng.units = env.units ?? [];
  eng.tileX = (i) => i % 256; eng.tileY = (i) => (i / 256) | 0;
  const raw = mulberry32(seed);
  eng.rng = () => raw();
  eng.addEvent = (kind, text) => eng._evts.push({ kind, text });
  eng._evts = [];
  eng.toast = () => {}; eng.onSound = null;
  return eng;
};
const civ = (id, name, race, o = {}) => ({ id, name, race, pop: o.pop ?? 20, gold: o.gold ?? 50, militarism: o.mil ?? 30, gov: 0, capital: o.cap ?? 5000 + id * 100, culture: o.culture });
const setrel = (eng, a, b, v) => eng.rel.set(a < b ? `${a}-${b}` : `${b}-${a}`, v);
const met = (eng, a, b) => eng.met.add(a < b ? `${a}-${b}` : `${b}-${a}`);

// ---- S2 atick-born：atick ② 过门诞生（2 拍窗口） ----
let s2 = null;
for (let s = 1; s < 40000 && s2 === null; s++) {
  const eng = mkEng([civ(0, 'A', R.HUMAN, { pop: 30 }), civ(1, 'B', R.ELF, { pop: 26 }), civ(3, 'D', R.ORC, { mil: 68 }), civ(4, 'E', R.LIZARD)], s, { tick: 600, catTick: 500 });
  met(eng, 0, 1); setrel(eng, 0, 1, 60); met(eng, 3, 0);
  eng.declareWar(3, 0, 'border');
  setrel(eng, 1, 3, -50); eng.declareWar(3, 1, 'border');
  eng.allianceTick();
  if (eng.alliances.length !== 1) continue;           // 第一拍诞生
  eng.allianceTick();
  if (eng.alliances.length === 1 && eng._evts.some((e) => e.text.includes('缔结'))) s2 = s;
}
console.log('S2 atick-born seed =', s2);

// ---- S3 atick-join：orc 世仇拒（rng<0.7）+ 蜥蜴人 join 过门（0.0425）同拍 ----
let s3 = null;
for (let s = 1; s < 60000 && s3 === null; s++) {
  const eng = mkEng([civ(0, 'A', R.HUMAN, { pop: 30 }), civ(1, 'B', R.ELF), civ(3, 'D', R.ORC, { mil: 68 }), civ(4, 'E', R.LIZARD)], s, { tick: 900 });
  eng.formAlliance(eng.civs[0], eng.civs[1]);
  setrel(eng, 0, 4, 50); setrel(eng, 1, 4, 30); met(eng, 0, 4); met(eng, 1, 4);
  setrel(eng, 0, 3, 50);
  eng.raceRel.set('0-3', -40);                        // 世仇注入 → rr<-35 拒掷
  met(eng, 0, 3);
  eng.allianceTick();
  const rej = eng._evts.some((e) => e.text.includes('被拒'));
  const join = eng._evts.some((e) => e.text.includes('加入') && e.text.includes('「E」'));
  if (rej && join) s3 = s;
}
console.log('S3 atick-join seed =', s3);

// ---- S8 aid-trade：互助 rng<0.4 过门（转移 15 事件） ----
let s8 = null;
for (let s = 1; s < 40000 && s8 === null; s++) {
  const eng = mkEng([civ(0, 'A', R.HUMAN, { gold: 90, culture: 85 }), civ(1, 'B', R.ELF, { gold: 60, culture: 90 }), civ(2, 'C', R.DWARF, { gold: 250 }), civ(3, 'D', R.ORC, { gold: 25, mil: 68 })], s, { tick: 2400, units: [{ dead: false, race: 9, civ: -1, caravan: 0 }] });
  eng.formAlliance(eng.civs[0], eng.civs[1]);
  eng.formAlliance(eng.civs[2], eng.civs[3]);
  setrel(eng, 1, 3, -50); eng.declareWar(3, 1, 'border');
  eng.allianceTick();
  const aid = eng._evts.some((e) => e.text.includes('雪中送炭'));
  // 防御级联连环：3→1(外) → 0→3(防御) → 2→0(内层防御) → 1→2(再防御，atWar(3,1) 终止)
  // 金币：0=90-9  1=60-9  2=250-9(内层动员)-15(援助)  3=25-9+15
  if (aid && eng.civs[3].gold === 31 && eng.civs[2].gold === 226 && eng.civs[0].gold === 81 && eng.civs[1].gold === 51) s8 = s;
}
console.log('S8 aid-trade seed =', s8);

// ---- S9 dissolve-low：cohesion<25 ×0.3 解散过门 ----
let s9 = null;
for (let s = 1; s < 40000 && s9 === null; s++) {
  const eng = mkEng([civ(0, 'A', R.HUMAN), civ(1, 'B', R.ELF), civ(2, 'C', R.DWARF), civ(4, 'E', R.LIZARD)], s, { tick: 2700 });
  eng.formAlliance(eng.civs[0], eng.civs[1]);
  eng.joinAlliance(eng.alliances[0], eng.civs[2]);
  eng.joinAlliance(eng.alliances[0], eng.civs[4]);
  setrel(eng, 0, 2, 10);
  eng.leaveAlliance(1, 'betray');                     // -22 → 33
  eng.leaveAlliance(4, 'betray');                     // -22 → 11
  if (eng.alliances.length !== 1) continue;           // 成员 [0,2] 仍在盟
  eng.allianceTick();
  const dis = eng._evts.some((e) => e.text.includes('名存实亡'));
  if (dis && eng.alliances.length === 0) s9 = s;
}
console.log('S9 dissolve-low seed =', s9);
