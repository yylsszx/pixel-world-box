// 探针：数新五兽精灵的 fillRect 次数（gen-render2 sanity 断言真值校准用）
import { createJiti } from 'jiti';
const jiti = createJiti(import.meta.url);
const SP = jiti('/home/z/my-project/pixel-world-box/src/lib/game/sprites.ts');

const mk = (o) => ({
  id: 1, race: 6, civ: -1, x: 10, y: 10, rx: 10, ry: 10, lx: 10, ly: 10,
  hurt: 0, flip: false, infected: false, dpx: 20, dpy: 20, ...o,
});
function count(fn, u, fc = 0) {
  let n = 0;
  const ctx = new Proxy(
    { fillStyle: null },
    {
      get: (t, k) => (k === 'fillRect' ? () => { n++; } : k === 'canvas' ? null : undefined),
      set: () => true,
    },
  );
  fn(ctx, u, fc);
  return n;
}
const cases = [
  ['S01 sheep', () => count(SP.drawSheep, mk({ race: 6 }))],
  ['S02 sheep infected', () => count(SP.drawSheep, mk({ race: 6, infected: true }))],
  ['S03 sheep flip', () => count(SP.drawSheep, mk({ race: 6, flip: true }))],
  ['S04 wolf', () => count(SP.drawWolf, mk({ race: 7 }))],
  ['S05 wolf hurt', () => count(SP.drawWolf, mk({ race: 7, hurt: 3 }))],
  ['S06 wolf flip', () => count(SP.drawWolf, mk({ race: 7, flip: true }))],
  ['S07 snowwolf', () => count(SP.drawSnowWolf, mk({ race: 15 }))],
  ['S08 snowwolf flip', () => count(SP.drawSnowWolf, mk({ race: 15, flip: true }))],
  ['S09 bear', () => count(SP.drawBear, mk({ race: 8 }))],
  ['S10 deer', () => count(SP.drawDeer, mk({ race: 10 }))],
];
for (const [name, f] of cases) console.log(name, '=', f());

// S02 感染羊的第一个色值序列（找 #b8e2b4 出现在第几个 op）
let seq = [];
{
  const ctx = new Proxy(
    { fillStyle: null },
    {
      get: (t, k) => (k === 'fillRect' ? () => { seq.push(t.fillStyle); } : k === 'canvas' ? null : undefined),
      set: (t, k, v) => { if (k === 'fillStyle') t.fillStyle = v; return true; },
    },
  );
  SP.drawSheep(ctx, mk({ race: 6, infected: true }), 0);
  console.log('S02 infected 染疫绿 #b8e2b4 首现 op =', seq.indexOf('#b8e2b4'));
}
