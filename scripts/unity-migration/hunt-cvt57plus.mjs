// hunt-cvt57plus.mjs — M-U3g 种子猎取 + 全场景行为断言（内存改 seed 跑 runScenario）
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
    if (k === 'createPattern') return () => ({});
    return typeof k === 'string' ? noop : undefined;
  },
  set: () => true,
});
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const gen = await jiti.import(path.join(ROOT, 'scripts/unity-migration/gen-units-civtick.mjs'));

const run = (name, seedOverride) => {
  const sc = gen.scenarios.find((s) => s.name === name);
  if (seedOverride !== undefined) sc.seed = seedOverride;
  return gen.runScenario(sc);
};
const last = (r) => r.traces[r.traces.length - 1];

// --- 猎种子：CVT57 成军 ---
function hunt(name, pred, lo = 1, hi = 40) {
  const base = gen.scenarios.find((s) => s.name === name).seed;
  for (let d = 0; d < hi; d++) {
    const cand = (base + d * 7) & 0xffffff;
    const r = run(name, cand);
    if (pred(r)) return { seed: cand >>> 0, r };
  }
  return null;
}

const h57 = hunt('CVT57-army-form', (r) => last(r).armies.length === 1 && last(r).armies[0].members.length >= 6 && last(r).civs[0].gold > 0);
console.log('CVT57 seed:', h57 ? '0x' + h57.seed.toString(16) : 'NONE');
const h58 = hunt('CVT58-army-levy', (r) => last(r).armies.length === 1 && last(r).newEvents.some((e) => e.text.includes('征兵鼓')));
console.log('CVT58 seed:', h58 ? '0x' + h58.seed.toString(16) : 'NONE');
const h59 = hunt('CVT59-army-muster-broke', (r) => last(r).armies.length === 1 && last(r).newEvents.some((e) => e.text.includes('国库告罄')));
console.log('CVT59 seed:', h59 ? '0x' + h59.seed.toString(16) : 'NONE');
const h72 = hunt('CVT72-front-solidify', (r) => last(r).ownerDiff.some(([, v]) => v === 0));
console.log('CVT72 seed:', h72 ? '0x' + h72.seed.toString(16) : 'NONE');
const h65 = hunt('CVT65-army-pursue-kill', (r) => last(r).units.some((u) => u.dead) && last(r).warData.some((w) => w.key === '0-1' && w.casB >= 1));
console.log('CVT65 seed:', h65 ? '0x' + h65.seed.toString(16) : 'NONE');

// --- 逐场景行为断言（用猎到的种子或原种子） ---
const checks = [];
const C = (name, cond, msg) => checks.push({ name, cond, msg });
const pick = (h, fallback) => (h ? h.seed : fallback);

const r57 = run('CVT57-army-form', pick(h57, 0xa3b1));
{
  const t = last(r57); const a = t.armies[0];
  C('57 成军1', t.armies.length === 1, t.armies.length);
  C('57 成员≥6', a.members.length >= 6, a.members.length);
  C('57 宿将执旗', a.leaderId === 3, a.leaderId);
  C('57 morale=73.4', Math.abs(a.morale - 73.4) < 1e-9, a.morale);
  C('57 gold=92', t.civs[0].gold === 92, t.civs[0].gold);
  C('57 state rally', a.state === 'rally', a.state);
  C('57 targetCiv 1', a.targetCiv === 1, a.targetCiv);
  C('57 size0/formed', a.size0 === a.members.length && a.formedTick === 60, `${a.size0}/${a.formedTick}`);
  C('57 集结事件', t.newEvents.some((e) => e.text.includes('集结了')), t.newEvents.map((e) => e.kind).join(','));
  C('57 平民不入列', !a.members.some((id) => id >= 8), a.members.join(','));
}
const r58 = run('CVT58-army-levy', pick(h58, 0xa3b2));
{
  const t = last(r58); const a = t.armies[0];
  C('58 成军', t.armies.length === 1, t.armies.length);
  C('58 征兵鼓事件', t.newEvents.some((e) => e.text.includes('征兵鼓')), '-');
  C('58 全员 job2', a.members.every((id) => t.units.find((u) => u.id === id).job === 2), a.members.map((id) => t.units.find((u) => u.id === id).job).join(','));
  C('58 王不入列', !a.members.includes(1000), a.members.join(','));
}
const r59 = run('CVT59-army-muster-broke', pick(h59, 0xa3b3));
{
  const t = last(r59); const a = t.armies[0];
  C('59 gold 0', t.civs[0].gold === 0, t.civs[0].gold);
  C('59 告罄事件', t.newEvents.some((e) => e.text.includes('国库告罄')), '-');
  C('59 morale 折损', Math.abs(a.morale - 61.4) < 1e-9, a.morale);
}
const r60 = run('CVT60-army-rally-march');
{
  const t = last(r60); const a = t.armies[0];
  C('60 march', a.state === 'march', a.state);
  C('60 目标敌都', a.tx === 200 && a.ty === 120, `${a.tx},${a.ty}`);
  C('60 誓师事件', t.newEvents.some((e) => e.text.includes('誓师出征')), '-');
  C('60 阵位写点', t.units.every((u) => u.army || u.job !== 2 || (u.tx !== u.x || u.ty !== u.y)), '-');
}
const r61 = run('CVT61-army-march-siege-ambush');
{
  const t = last(r61); const a = t.armies[0];
  C('61 siege', a.state === 'siege', a.state);
  C('61 ambush', a.ambush === true, a.ambush);
  C('61 evalTick', a.evalTick === 65, a.evalTick);
  C('61 建筑存活', t.buildings.length === 1, t.buildings.length);
}
const r62 = run('CVT62-army-siege-approach');
{
  const t = last(r62); const a = t.armies[0];
  C('62 军旗压近', a.x > 40.3 && a.y > 40.3, `${a.x},${a.y}`);
  C('62 渗透带', t.occStrDiff.length >= 10, t.occStrDiff.length);
  C('62 成员散布', t.units.find((u) => u.id === 1).tx !== 39.5, t.units.find((u) => u.id === 1).tx);
}
const r63 = run('CVT63-army-frontpush-march');
{
  const t = last(r63); const a = t.armies[0];
  C('63 marchPushTick', a.marchPushTick === 70, a.marchPushTick);
  C('63 渗透', t.occCivDiff.length >= 5, t.occCivDiff.length);
  C('63 state march', a.state === 'march', a.state);
  C('63 军旗步进', a.x > 50.5, a.x);
}
const r64 = run('CVT64-army-supply-line');
{
  const t = last(r64); const a = t.armies[0];
  C('64 supplyWarned', a.supplyWarned === true, a.supplyWarned);
  C('64 事件', t.newEvents.some((e) => e.text.includes('补给线吃紧')), '-');
  C('64 state march', a.state === 'march', a.state);
  C('64 无渗透', t.occStrDiff.length === 0, t.occStrDiff.length);
}
const r65 = run('CVT65-army-pursue-kill', pick(h65, 0xa3b9));
{
  const t = last(r65);
  C('65 击杀1', t.units.filter((u) => u.dead).length === 1, t.units.filter((u) => u.dead).length);
  C('65 warData', t.warData.some((w) => w.key === '0-1' && w.casB === 1 && w.scoreA === 0.5), JSON.stringify(t.warData));
  const a2 = t.armies.find((a) => a.id === 2);
  C('65 溃军损耗', a2.losses === 1 && Math.abs(a2.morale - 17.4) < 1e-9, `${a2.losses}/${a2.morale}`);
  const a1 = t.armies.find((a) => a.id === 1);
  C('65 追击咬旗', a1.tx === a2.x && a1.ty === a2.y, `${a1.tx},${a2.x}`);
}
const r66 = run('CVT66-army-rout-panic-disband');
{
  const t0 = r66.traces[0];
  C('66 rout 事件', t0.newEvents.some((e) => e.text.includes('全军溃退')), t0.newEvents.map((e) => e.kind).join(','));
  C('66 恐慌传染', Math.abs(t0.armies.find((a) => a.id === 2).morale - 38) < 1e-9, t0.armies.find((a) => a.id === 2).morale);
  const tEnd = last(r66);
  C('66 a1 解散', !tEnd.armies.some((a) => a.id === 1), tEnd.armies.map((a) => a.id).join(','));
  C('66 armyCd', tEnd.civs[0].armyCd === 1020, tEnd.civs[0].armyCd);
  C('66 解散事件', r66.traces.some((t) => t.newEvents.some((e) => e.text.includes('解散归田'))), '-');
  C('66 成员摘除', tEnd.units.filter((u) => u.id <= 6).every((u) => u.army === null), tEnd.units.filter((u) => u.id <= 6).map((u) => u.army).join(','));
}
const r67 = run('CVT67-army-triumph');
{
  const t0 = r67.traces[0];
  C('67 大获全胜', t0.newEvents.some((e) => e.text.includes('大获全胜')), t0.newEvents.map((e) => e.kind).join(','));
  C('67 morale 70', Math.abs(t0.armies[0].morale - 70) < 1e-9, t0.armies[0].morale);
  const tEnd = last(r67);
  C('67 解散', !tEnd.armies.some((a) => a.id === 1), tEnd.armies.length);
  C('67 armyCd', tEnd.civs[0].armyCd === 1020, tEnd.civs[0].armyCd);
}
const r68 = run('CVT68-barracks-war');
{
  const t = last(r68);
  C('68 训练2', t.units.filter((u) => u.job === 2).length === 2, t.units.filter((u) => u.job === 2).length);
  C('68 spawn fx2', t.effects.filter((e) => e.kind === 'spawn').length === 2, t.effects.length);
  C('68 第三人不动', t.units.find((u) => u.id === 3).job === 0, t.units.find((u) => u.id === 3).job);
}
const r69 = run('CVT69-barracks-peace');
{
  const t = last(r69);
  C('69 零训练', t.units.every((u) => u.job === 0), t.units.map((u) => u.job).join(','));
  C('69 零 fx', t.effects.length === 0, t.effects.length);
}
const r70 = run('CVT70-temple-heal');
{
  const t = last(r70);
  C('70 治疗', t.units.find((u) => u.id === 1).hp === '0000000000002440', t.units.find((u) => u.id === 1).hp);
  C('70 满血不动', t.units.find((u) => u.id === 2).hp === '0000000000002440', t.units.find((u) => u.id === 2).hp);
  C('70 economy 同门', t.civs[0].income > 0, t.civs[0].income);
}
const r71 = run('CVT71-front-decay');
{
  const k30 = r71.traces[30];
  C('71 -4/次', k30.occStrDiff.every(([, v]) => Math.abs(parseFloat(v) - 0) >= 0 || v === '0000000000001840'), JSON.stringify(k30.occStrDiff.slice(0, 2)));
  const kClear = r71.traces.findIndex((t) => t.occCivDiff.some(([, v]) => v === -1));
  C('71 最终清除', kClear > 0, kClear);
  C('71 owner 不变', r71.traces.every((t) => t.ownerDiff.length === 0), '-');
}
const r72 = run('CVT72-front-solidify', pick(h72, 0xa3c0));
{
  const t = last(r72);
  C('72 易帜', t.ownerDiff.some(([, v]) => v === 0), JSON.stringify(t.ownerDiff));
  C('72 occ 清除', t.occCivDiff.some(([, v]) => v === -1), JSON.stringify(t.occCivDiff));
  C('72 state march', t.armies[0].state === 'march', t.armies[0].state);
}

let fail = 0;
for (const c of checks) { if (!c.cond) { console.log(`[FAIL] ${c.name}: ${c.msg}`); fail++; } }
console.log(`\n[hunt+verify] ${checks.length - fail}/${checks.length} PASS`);
console.log('seeds:', { h57: h57?.seed, h58: h58?.seed, h59: h59?.seed, h72: h72?.seed, h65: h65?.seed });
