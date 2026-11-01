// M-U25 S37 掷数反解：从 seed 走到两侧终态各需几掷
function mulberryStep(a) {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
function chainDraws(startState, finalState) {
  let a = startState | 0;
  for (let k = 0; k < 5_000_000; k++) {
    a = mulberryStep(a).a;
    if ((a >>> 0) === (finalState >>> 0)) return k + 1;
  }
  throw new Error('链未达');
}
const seed = 0x00000155 >>> 0;
console.log('黄金 step0 ddb304a0:', chainDraws(seed, 0xddb304a0), '掷');
console.log('镜像 step0 035c10b6:', chainDraws(seed, 0x035c10b6), '掷');
console.log('黄金 step1 8ac197da:', chainDraws(seed, 0x8ac197da), '掷（累计）');
