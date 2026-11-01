// ============================================================================
// probe-mutate-seed.mjs —— M-U19 mutateArea 特质域种子标定探针（M-U18 scan 系先例）
//   蓝本 engine.ts mutateArea L10888-10906 / rerollTrait L11037-11057 /
//   jumpGene L11085-11103 / rollTrait L1467-1470 / baseGene L11029-11031。
//   jiti 真引擎直调 mutateArea（terrain 无关——纯单位环域），扫种子定门序：
//   S13（civ 面）：u960 reroll 0.3 门 HIT + jumpGene 0.25 门 HIT（giant 旧特质
//     全乘数卸载/上新 + job2 战士乘数重算）；u961 reroll MISS + jump HIT 且
//     ≥1 维门 MISS（基因恰 {1,1,1,1} 起步——miss 维恒等 1 钉面）。
//   S14（wild 面）：3 连发跨 3 单位（ preset gene / baseGene 空表 / 捕食者 wolf），
//     至少 1 维触及钳位边界（Math.max(0.5,·) 或 Math.min(2,·) 恰等）。
//   掷流协议同 gen-tool3：rngA 尾置清零起流；fx 恒 2 掷（命中单位）。
// 运行：bun scripts/unity-migration/probe-mutate-seed.mjs
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    if (k === 'createImageData' || k === 'getImageData')
      return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    return typeof k === 'string' ? noop : undefined;
  },
  set: () => true,
});
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
const { R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

// gen-tool3 mkUnit 同构（瘦直写——mutate 域只消费 dead/x/y/race/trait/job/gene）
function mkUnit(eng, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.x, ty: o.y,
    hp: o.hp ?? 10, maxHp: o.maxHp ?? o.hp ?? 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
    cd: 0, trait: o.trait ?? 0, job: o.job ?? 0, king: 0, infected: false, flip: 0,
    name: `u${o.id}`, hurt: 0, breath: 0, parity: 0, dead: o.dead ?? 0,
    fam: null, fgn: null, gene: o.gene ?? null, army: null,
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}

function freshUnit(eng, o) {
  const u = mkUnit(eng, o);
  return u;
}

// —— S13 civ 面门序判据 ——
function checkS13(eng) {
  const a = eng.unitById.get(960), b = eng.unitById.get(961);
  if (a.trait !== 'giant' && typeof a.trait === 'string' && a.gene) {          // reroll HIT（旧 giant 已卸）
    if (b.trait === 0 || b.trait === null) {                                    // reroll MISS（无特质单位特质未动）
      if (b.gene) {                                                             // jump HIT
        const misses = [b.gene.s, b.gene.d, b.gene.h, b.gene.r].filter((v) => v === 1).length;
        if (misses >= 1) return true;                                           // ≥1 维门 MISS（{1,1,1,1} 起步 miss 维恒等 1）
      }
    }
  }
  return false;
}

// —— S14 wild 面钳位判据：3 单位 × 3 连发后至少 1 维恰触 0.5 / 2 ——
function checkS14(eng) {
  let clamped = 0;
  for (const id of [970, 971, 972]) {
    const u = eng.unitById.get(id);
    if (!u.gene) return false;
    for (const v of [u.gene.s, u.gene.d, u.gene.h, u.gene.r]) if (v === 0.5 || v === 2) clamped++;
  }
  return clamped >= 1;
}

function probe(spec) {
  const eng = new GameEngine(spec.baseSeed);
  eng.terrain.fill(3);                                     // GRASS（mutate 域不消费 terrain——惯例 fill）
  eng.units.length = 0;
  eng.unitById.clear();
  eng.effects.length = 0;
  for (const uo of spec.units) freshUnit(eng, uo);
  const hits = [];
  for (let seed = spec.seed0; seed < spec.seed0 + 400000; seed++) {
    eng.rngA = seed >>> 0;
    eng.effects.length = 0;
    for (const u of eng.units) { u.gene = u.id === 970 ? { s: 1.3, d: 0.8, h: 1.1, r: 0.9 } : null; u.trait = u.id === 960 ? 'giant' : 0; u.hp = u.maxHp = u.id === 960 ? 200 : u.id === 971 || u.id === 970 ? 16 : 34; }
    for (let k = 0; k < (spec.calls ?? 1); k++) eng.mutateArea(100, 60, 3);
    if (spec.check(eng)) { hits.push(seed); if (hits.length >= 3) break; }
  }
  return hits;
}

// S13：HUMAN=0 civ（job2 warrior）×2 + 死羊 + 界外（skip 分支零掷不影响门序——掷流只由活环内单位驱动）
const s13 = probe({
  baseSeed: 20261213, seed0: 1, calls: 1,
  units: [
    { id: 960, race: R.HUMAN, x: 99.5, y: 60, hp: 200, maxHp: 200, trait: 'giant', job: 2 },
    { id: 961, race: R.HUMAN, x: 101, y: 60.5, hp: 60, maxHp: 60 },
    { id: 962, race: R.SHEEP, x: 100, y: 59, hp: 16, maxHp: 16, dead: 1 },
    { id: 963, race: R.HUMAN, x: 112, y: 60, hp: 60, maxHp: 60 },
  ],
  check: checkS13,
});
// S14：SHEEP preset gene + SHEEP 空表 baseGene + WOLF 捕食者——3 连发钳位逼近
const s14 = probe({
  baseSeed: 20261214, seed0: 1, calls: 3,
  units: [
    { id: 970, race: R.SHEEP, x: 100, y: 60, hp: 16, maxHp: 16, gene: { s: 1.3, d: 0.8, h: 1.1, r: 0.9 } },
    { id: 971, race: R.SHEEP, x: 101, y: 60, hp: 16, maxHp: 16 },
    { id: 972, race: R.WOLF, x: 99, y: 60.5, hp: 34, maxHp: 34 },
  ],
  check: checkS14,
});
console.log('S13 mutate-civ 种子:', s13.slice(0, 3).map((s) => '0x' + (s >>> 0).toString(16).toUpperCase().padStart(8, '0')).join(' '), `(${s13.length} 命中)`);
console.log('S14 mutate-wild 种子:', s14.slice(0, 3).map((s) => '0x' + (s >>> 0).toString(16).toUpperCase().padStart(8, '0')).join(' '), `(${s14.length} 命中)`);
if (!s13.length || !s14.length) { console.error('标定失败——门序判据过窄'); process.exit(1); }
