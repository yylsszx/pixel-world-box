// 种子寻优器：为 wars 场景锁定激活度设计意图（跑完即弃，选定种子烘焙进 gen 文件）
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R } from '../../src/lib/game/types.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';

const W = 256, H = 160;
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const mkEng = (civSpecs, seed, lawsWars = true, tick = 1000) => {
  const eng = Object.create(GameEngine.prototype);
  eng.civs = [];
  for (const cv of civSpecs) eng.civs[cv.id] = { ...cv, tiles: cv.tiles ?? [1, 2, 3, 4], frontier: [], houses: 0, alive: cv.alive !== false, colorHex: '#ccc' };
  eng.met = new Set(); eng.rel = new Map(); eng.tension = new Map(); eng.raceRel = new Map();
  eng.warData = new Map(); eng.totalWars = new Set(); eng.warShame = new Map();
  eng.warHistory = []; eng.lastDeclareAt = new Map(); eng.allianceWarCd = new Map();
  eng.alliances = []; eng.allianceOf = new Map(); eng.directives = []; eng.armies = [];
  eng.emergentWeapons = new Map(); eng.occSet = new Set();
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };
  eng.laws = { wars: lawsWars }; eng.tickCount = tick; eng.yearF = 25;
  eng.eventSeq = 0; eng.toastSeq = 0; eng.statWars = 0;
  eng.lastCatastrophe = { tick: -1e9, x: -1, y: -1 };
  const raw = mulberry32(seed);
  eng.rng = () => raw();
  eng.addEvent = (kind, text) => eng._evts.push({ kind, text });
  eng._evts = [];
  eng.toast = () => {}; eng.onSound = null;
  return eng;
};
const human = (id, name, o = {}) => ({ id, name, race: R.HUMAN, pop: 30, gold: 90, militarism: 60, gov: 1, capital: 5000 + id, ...o });

// ---- S3 pick-casus：tick1 复仇 / tick2 conquest(orc agg) / tick3 plunder(elf agg) ----
const s3civs = [
  { id: 0, name: 'A', race: R.HUMAN, pop: 30, gold: 90, militarism: 50, gov: 1, capital: 5000 },
  { id: 1, name: 'B', race: R.ELF, pop: 24, gold: 200, militarism: 46, gov: 0, capital: 12000 },
  { id: 2, name: 'C', race: R.DWARF, pop: 20, gold: 150, militarism: 44, gov: 2, capital: 15000 },
  { id: 3, name: 'D', race: R.ORC, pop: 60, gold: 30, militarism: 75, gov: 4, capital: 20000 },
];
function tryS3(seed) {
  const eng = mkEng(s3civs, seed, true, 1000);
  eng.warShame.set('0-1', 0);
  eng.met.add('0-1'); eng.rel.set('0-1', 10); eng.tension.set('0-1', 60);
  eng.warTick();
  const e1 = eng._evts.filter((e) => e.kind === 'casus');
  if (e1.length !== 1 || !e1[0].text.includes('复仇') || !e1[0].text.includes('「A」')) return null;
  eng.met.add('2-3'); eng.rel.set('2-3', 10); eng.tension.set('2-3', 60);
  eng.warTick();
  const e2 = eng._evts.filter((e) => e.kind === 'casus');
  if (e2.length !== 2 || !e2[1].text.includes('开疆拓土') || !e2[1].text.includes('「D」')) return null;
  eng.tickCount += 401;
  eng.met.add('1-2'); eng.rel.set('1-2', 10); eng.tension.set('1-2', 70);
  eng.warTick();
  const e3 = eng._evts.filter((e) => e.kind === 'casus');
  if (e3.length !== 3) return null;
  const plunder = e3[2].text.includes('劫掠');
  const aggName = e3[2].text.slice(1, e3[2].text.indexOf('」'));
  if (!plunder || aggName !== 'B') return null;   // 精灵挑起劫掠战争（0.4 掷过门）
  return seed;
}
let s3 = null;
for (let s = 1; s < 20000 && s3 === null; s++) s3 = tryS3(s);
console.log('S3 pick-casus seed =', s3);

// ---- S4 wartick-drift：3 拍零引燃（纯水位漂移对照） ----
const s4civs = [
  human(0, 'A', { militarism: 30 }), { id: 1, name: 'B', race: R.ELF, pop: 24, gold: 60, militarism: 28, gov: 0, capital: 12000 },
  { id: 2, name: 'C', race: R.DWARF, pop: 20, gold: 150, militarism: 60, gov: 2, capital: 15000 },
  { id: 3, name: 'D', race: R.ORC, pop: 36, gold: 30, militarism: 58, gov: 4, capital: 20000 },
];
let s4 = null;
for (let s = 1; s < 20000 && s4 === null; s++) {
  const eng = mkEng(s4civs, s, true, 1200);
  eng.met.add('0-1'); eng.rel.set('0-1', 12); eng.tension.set('0-1', 20);
  eng.met.add('2-3'); eng.rel.set('2-3', 50); eng.tension.set('2-3', 10);
  eng.warTick(); eng.warTick(); eng.warTick();
  if (eng.warData.size === 0 && eng._evts.length === 0) s4 = s;
}
console.log('S4 wartick-drift seed =', s4);

// ---- S5 wartick-gate：同拍双引燃共享 aggressor → 400 门拒绝 → adv401 → 门开再宣 ----
const s5civs = [
  human(0, 'A', { militarism: 95 }), { id: 1, name: 'B', race: R.ELF, pop: 24, gold: 60, militarism: 10, gov: 0, capital: 12000 },
  { id: 2, name: 'C', race: R.DWARF, pop: 20, gold: 150, militarism: 12, gov: 2, capital: 15000 },
];
let s5 = null;
for (let s = 1; s < 40000 && s5 === null; s++) {
  const eng = mkEng(s5civs, s, true, 2000);
  eng.met.add('0-1'); eng.rel.set('0-1', 30); eng.tension.set('0-1', 80);
  eng.met.add('0-2'); eng.rel.set('0-2', 30); eng.tension.set('0-2', 80);
  // 计数器 rng（draws 指纹：6 抽 = 双对引燃+双 pickCasus——第二对必为 400 门拒绝而非引燃未过）
  let draws = 0;
  const rawSave = eng.rng;
  eng.rng = () => { draws++; return rawSave(); };
  eng.warTick();
  if (!eng.warData.has('0-1')) continue;              // 第一对必须引燃
  if (eng.warData.has('0-2')) continue;               // 第二对必须被 400 门拒绝
  if (draws !== 7) continue;                          // 强制拒绝路径（3+4：第二对 plunder 0.4 掷=4 抽；4 抽=引燃未过）
  const e1 = eng._evts.filter((e) => e.kind === 'casus');
  if (e1.length !== 1 || !e1[0].text.includes('「A」')) continue;   // 共享 aggressor=A
  eng.tickCount += 401;
  eng.rel.set('0-1', 50); eng.tension.set('0-1', 80);   // (0,1) 高水位门关（v>45）
  eng.rel.set('0-2', 30); eng.tension.set('0-2', 80);
  eng.warTick();
  if (!eng.warData.has('0-2')) continue;              // 401 后门开 → (0,2) 宣战
  const e2 = eng._evts.filter((e) => e.kind === 'casus');
  if (e2.length !== 2) continue;
  s5 = s;
}
console.log('S5 wartick-gate seed =', s5);
