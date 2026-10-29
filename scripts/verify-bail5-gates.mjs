#!/usr/bin/env node
// M-U3h 第五批门链核验探针：从黄金 rngA0 纯数学推演 mulberry32 后续掷值，
// 断言各场景门开/关与设计一致（零 ctor 开销——比 BAIL_ONLY 重跑快千倍）。
// mulberry32 语义 = engine.ts L728 rng 闭包（Step: A+0x6d2b79f5 → imul 混合）。
import { readFileSync } from 'node:fs';

const gold = JSON.parse(readFileSync('/home/z/my-project/scripts/unity-migration/golden/units_bail.json', 'utf8'));

function mulNext(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [a, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
}
function seq(a0, n) {
  const out = [];
  let a = a0 | 0;
  for (let i = 0; i < n; i++) { const [a2, v] = mulNext(a); out.push(v); a = a2; }
  return out;
}

const FIFTH = ['D09-board-basic','D10-board-fleet','D11-board-nowater','D12-board-nodock',
  'F01-pred-hunt','F02-pred-grid','F03-fish-school','F04-fish-center-land','F05-graze',
  'F06-crab-inland','F07-aqua-roam','H01-pickup-meat','H02-pickup-gear','H03-repro-civ',
  'H04-repro-wild','H05-repro-gate-fail','I01-flying','I02-deepwater-turn','I03-sandswim','I04-blocked-reroute'];

const EXPECT = {
  // fx() 每调 2 掷（seed+dir，engine L9797）——n 含 fx 内部消费
  'D09-board-basic': { note: 'board true：链 3（ttl+x/y）+ fx spawn 2 = 5 rng', n: 5 },
  'D10-board-fleet': { note: 'board×4 链 9 + fx×4 8 = 17 rng + 纪事', n: 17 },
  'D11-board-nowater': { note: 'false 零掷', n: 0 },
  'D12-board-nodock': { note: 'false 零掷（dock 在 ttl 前）', n: 0 },
  'F01-pred-hunt': { note: '索敌门 v1<0.4 开 → prey 命中 1 rng', n: 1, checks: [[0, 'v1<0.4', (v) => v < 0.4]] },
  'F02-pred-grid': { note: '索敌门开+prey miss → 导航 tx/ty 2 掷 = 3 rng', n: 3, checks: [[0, 'v1<0.4', (v) => v < 0.4]] },
  'F03-fish-school': { note: '鱼群门 v1<0.12 开 → tx/ty 2 + 漫游门 v4≥0.02 关 = 4 rng', n: 4, checks: [[0, 'v1<0.12', (v) => v < 0.12], [3, 'v4>=0.02', (v) => v >= 0.02]] },
  'F04-fish-center-land': { note: '鱼群门开（重心陆不掷）+ 漫游 2+水生重选 8 = 11 rng', n: 11, checks: [[0, 'v1<0.12', (v) => v < 0.12]] },
  'F05-graze': { note: '索敌门关 v1>=0.4 + 漫游 wx/wy 2 + 逐草 k0 2 = 5 rng', n: 5, checks: [[0, 'v1>=0.4', (v) => v >= 0.4]] },
  'F06-crab-inland': { note: '蟹 4 重选全败 = 2+8 = 10 rng', n: 10 },
  'F07-aqua-roam': { note: '鱼群门关 v1>=0.12 + 漫游 2 + 水生重选 8 = 11 rng', n: 11, checks: [[0, 'v1>=0.12', (v) => v >= 0.12]] },
  'H01-pickup-meat': { note: '拾肉零掷 + 繁衍门 v1 关 + dmg/heart fx×2×2 = 5 rng', n: 5, checks: [[0, 'v1>=0.004', (v) => v >= 0.004]] },
  'H02-pickup-gear': { note: '拾装备零掷 + 繁衍门关 + spawn/dmg fx×2×2 = 5 rng', n: 5, checks: [[0, 'v1>=0.006', (v) => v >= 0.006]] },
  'H03-repro-civ': { note: '门1<0.006 开+门2 恒开+childGene 5+fam 关+spawn 链+heart fx = 19 rng', n: 19, checks: [[0, 'v1<0.006', (v) => v < 0.006], [7, 'v8>=0.25', (v) => v >= 0.25]] },
  'H04-repro-wild': { note: '门1<0.004 开+门2 开+childGene 5+fam 开+newFamily+spawn 链+heart = 20 rng', n: 20, checks: [[0, 'v1<0.004', (v) => v < 0.004], [7, 'v8<0.25', (v) => v < 0.25]] },
  'H05-repro-gate-fail': { note: '门1 v1<0.004 开 + 门2 短路（food=30）= 1 rng', n: 1, checks: [[0, 'v1<0.004', (v) => v < 0.004]] },
  'I01-flying': { note: 'flying 零掷', n: 0 },
  'I02-deepwater-turn': { note: '深水改向 2 rng', n: 2 },
  'I03-sandswim': { note: 'dust 门 v1<0.08 开 + fx 2 = 3 rng', n: 3, checks: [[0, 'v1<0.08', (v) => v < 0.08]] },
  'I04-blocked-reroute': { note: '阻断改向 2 rng', n: 2 },
};

let pass = 0, fail = 0;
for (const name of FIFTH) {
  const sc = gold.scenarios.find((s) => s.name === name);
  if (!sc) { console.log(`MISS ${name}`); fail++; continue; }
  const exp = EXPECT[name];
  const [rngConsumed] = countRng(sc.rngA0, sc.rngA);
  const vals = seq(sc.rngA0 >>> 0, 14);
  const chk = (exp.checks ?? []).map(([at, label, fn]) => `${label}:${fn(vals[at]) ? 'OK' : 'BAD(v=' + vals[at].toFixed(5) + ')'}`);
  const nOk = rngConsumed === exp.n;
  if (nOk && chk.every((c) => c.endsWith('OK'))) { pass++; console.log(`PASS ${name} rng=${rngConsumed}/${exp.n} ${chk.join(' ')}`); }
  else { fail++; console.log(`FAIL ${name} rng=${rngConsumed}/${exp.n} ${chk.join(' ')}  # ${exp.note}`); }
}
console.log(`\n${pass} PASS / ${fail} FAIL`);

// rng 消费次数：暴力 mulberry 反推（从 rngA0 正向迭代直到状态==rngA；零消费先判同态）
function countRng(a0, a1) {
  let a = a0 | 0, n = 0;
  const target = a1 | 0;
  if (a === target) return [0];
  while (n < 200) { a = (a + 0x6d2b79f5) | 0; n++; if (a === target) return [n]; }
  return [-1];
}

// ---------------- 选值器：为 setup 钉 rngA 找满足门链约束的状态值 ----------------
function pickA(constraints) {
  // constraints: [(v, i) => bool]（第 i 掷需满足）
  for (let base = 1; base < 2 ** 30; base += 7919) {
    const vals = seq(base, 16);
    if (constraints.every((fn, i) => fn(vals[i], i))) return base;
  }
  return null;
}
if (process.argv[2] === 'pick') {
  const picks = {
    H01: pickA([(v) => v >= 0.004]),
    H02: pickA([(v) => v >= 0.006]),
    H03: pickA([(v) => v < 0.006, , , , , , , (v) => v >= 0.25]),
    H04: pickA([(v) => v < 0.004, , , , , , , (v) => v < 0.25]),
    H05: pickA([(v) => v < 0.004]),
    F01: pickA([(v) => v < 0.4]),
    F03: pickA([(v) => v < 0.12, , , (v) => v >= 0.02]),
    F04: pickA([(v) => v < 0.12]),
  };
  for (const [k, v] of Object.entries(picks)) {
    if (v == null) { console.log(`${k}: NONE`); continue; }
    const vals = seq(v, 10);
    console.log(`${k}: ${v >>> 0}  v1..v5=${vals.slice(0, 5).map((x) => x.toFixed(5)).join(',')} v8=${vals[7]?.toFixed(5)}`);
  }
}
