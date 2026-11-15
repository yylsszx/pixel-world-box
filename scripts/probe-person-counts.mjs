// 探针：#100 文明七杰新身形 fillRect 次数与首色序列（gen-render2 sanity 真值校准用）
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const SP = jiti('/home/z/my-project/pixel-world-box/src/lib/game/sprites.ts');

const mk = (o) => ({
  id: 1, name: 'U', race: 0, civ: -1, x: 40, y: 30, rx: 40, ry: 30,
  flip: false, lx: undefined, ly: undefined,
  wep: null, arm: null, hlm: null, bts: null, shd: null, rng: null, amu: null,
  atk: 0, trait: null, age: 20, maxAge: 100,
  hurt: 0, hp: 60, maxHp: 60, job: 0, infected: false, dead: 0, mount: 0, sleep: 0,
  ...o,
});
function count(fn, u, t = 1000, civColor = [59, 125, 216]) {
  let n = 0;
  const ctx = new Proxy(
    { fillStyle: null },
    {
      get: (tc, k) => (k === 'fillRect' ? () => { n++; } : k === 'canvas' ? null : undefined),
      set: (tc, k, v) => { if (k === 'fillStyle') tc.fillStyle = v; return true; },
    },
  );
  fn(ctx, u, civColor, t);
  return n;
}
const CIV = [59, 125, 216];
const cases = [
  ['P01 human civ 静止', () => count(SP.drawPerson, mk({}), 1000, CIV)],
  ['P02 human civ flip', () => count(SP.drawPerson, mk({ flip: true }), 1000, CIV)],
  ['P03 human nociv', () => count(SP.drawPerson, mk({}), 1000, null)],
  ['P10 goblin', () => count(SP.drawPerson, mk({ race: 20 }), 1000, CIV)],
  ['P11 zombie', () => count(SP.drawPerson, mk({ race: 5 }), 1000, CIV)],
  ['P12 elf', () => count(SP.drawPerson, mk({ race: 1 }), 1000, CIV)],
  ['P13 dwarf', () => count(SP.drawPerson, mk({ race: 2 }), 1000, CIV)],
  ['P14 orc', () => count(SP.drawPerson, mk({ race: 3 }), 1000, CIV)],
  ['P15 bandit', () => count(SP.drawPerson, mk({ race: 4 }), 1000, CIV)],
  ['P16 lizard tailup t1016', () => count(SP.drawPerson, mk({ race: 19 }), 1016, CIV)],
  ['P17 elder', () => count(SP.drawPerson, mk({ age: 90, maxAge: 100 }), 1000, CIV)],
  ['P18 move step0', () => count(SP.drawPerson, mk({ lx: 39.5, ly: 30 }), 1000, CIV)],
  ['P19 move step1', () => count(SP.drawPerson, mk({ lx: 39.5, ly: 30 }), 1004, CIV)],
  ['P20 breath t1016', () => count(SP.drawPerson, mk({}), 1016, CIV)],
  ['P21 musket atk', () => count(SP.drawPerson, mk({ wep: 'musket', atk: 5 }), 1000, CIV)],
  ['P22 laser shield t1008', () => count(SP.drawPerson, mk({ wep: 'laser_rifle', arm: 'energy_shield' }), 1008, CIV)],
  ['P23 sword atk', () => count(SP.drawPerson, mk({ wep: 'sword', atk: 5 }), 1000, CIV)],
  ['P24 armor2', () => count(SP.drawPerson, mk({ arm: 'armor2' }), 1000, CIV)],
  ['P25 armor1', () => count(SP.drawPerson, mk({ arm: 'armor1' }), 1000, CIV)],
  ['P26 job1', () => count(SP.drawPerson, mk({ job: 1 }), 1000, CIV)],
  ['P32 infected lowhp', () => count(SP.drawPerson, mk({ infected: true, hp: 20 }), 1000, CIV)],
];
for (const [name, f] of cases) console.log(name, '=', f());

// 色值序列（P01 前 6 op 的 fillStyle；P24 甲片首色；P13 须色）
function seqOf(u, t = 1000, civColor = CIV) {
  const seq = [];
  const ctx = new Proxy(
    { fillStyle: null },
    {
      get: (tc, k) => (k === 'fillRect' ? () => { seq.push(tc.fillStyle); } : k === 'canvas' ? null : undefined),
      set: (tc, k, v) => { if (k === 'fillStyle') tc.fillStyle = v; return true; },
    },
  );
  SP.drawPerson(ctx, u, civColor, t);
  return seq;
}
console.log('P01 前6色 =', JSON.stringify(seqOf(mk({})).slice(0, 6)));
console.log('P03 nociv 前6色 =', JSON.stringify(seqOf(mk({}), 1000, null).slice(0, 6)));
console.log('P13 dwarf 色含须#c96a15 =', seqOf(mk({ race: 2 })).includes('#c96a15'));
console.log('P14 orc 色含獠牙#f2ead8 =', seqOf(mk({ race: 3 })).includes('#f2ead8'));
console.log('P15 bandit 色含兜帽#3a342c =', seqOf(mk({ race: 4 })).includes('#3a342c'));
console.log('P24 armor2 含#cfd4da =', seqOf(mk({ arm: 'armor2' })).includes('#cfd4da'));
console.log('P33 vis 全标记数 =', (() => {
  // vis 涌现全标记走 RACES[100].vis（gen-render2 同源）—— 直接借 types 的 RACES
  const T = jiti('/home/z/my-project/pixel-world-box/src/lib/game/types.ts');
  const u = mk({ race: 100 });
  if (!T.RACES[100]?.vis) return 'RACES[100] 无 vis';
  return count(SP.drawPerson, u, 1000, CIV);
})());
