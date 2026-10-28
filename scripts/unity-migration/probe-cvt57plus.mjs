// probe-cvt57plus.mjs — M-U3g 场景行为探针（检查黄金轨迹关键产物是否符合设计意图）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/units_civtick.json'), 'utf8'));
const by = new Map(gold.scenarios.map((s) => [s.name, s]));
const last = (r) => r.traces[r.traces.length - 1];
const f = (hex) => hex; // hex 字符串直接展示

const show = (name, fn) => {
  try { console.log(name, '→', fn()); } catch (e) { console.log(name, '→ ERR', e.message); }
};

// CVT57 组军
show('CVT57 armies', () => {
  const t = last(by.get('CVT57-army-form'));
  return JSON.stringify({ n: t.armies.length, a: t.armies[0] ? { id: t.armies[0].id, name: t.armies[0].name, members: t.armies[0].members, leader: t.armies[0].leaderId, morale: t.armies[0].morale, state: t.armies[0].state, size0: t.armies[0].size0, targetCiv: t.armies[0].targetCiv, formed: t.armies[0].formedTick, gold: t.civs[0].gold, ev: t.newEvents.map((e) => e.kind + ':' + e.text.slice(0, 30)) } : null });
});
// CVT58 levy
show('CVT58 levy', () => {
  const t = last(by.get('CVT58-army-levy'));
  const a = t.armies[0];
  const jobs = t.units.filter((u) => a && a.members.includes(u.id)).map((u) => u.job);
  return JSON.stringify({ n: t.armies.length, members: a?.members.length, jobs, ev: t.newEvents.map((e) => e.text.slice(0, 36)) });
});
// CVT59 broke
show('CVT59 broke', () => {
  const t = last(by.get('CVT59-army-muster-broke'));
  const a = t.armies[0];
  return JSON.stringify({ gold: t.civs[0].gold, morale: a?.morale, ev: t.newEvents.map((e) => e.text.slice(0, 34)) });
});
// CVT60 rally→march
show('CVT60 march', () => {
  const t = last(by.get('CVT60-army-rally-march'));
  const a = t.armies[0];
  return JSON.stringify({ state: a?.state, tx: a?.tx, ty: a?.ty, ev: t.newEvents.map((e) => e.text.slice(0, 30)), m1tx: t.units.find((u) => u.id === 1)?.tx });
});
// CVT61 ambush + siege
show('CVT61 siege', () => {
  const t = last(by.get('CVT61-army-march-siege-ambush'));
  const a = t.armies[0];
  return JSON.stringify({ state: a?.state, ambush: a?.ambush, evalTick: a?.evalTick });
});
// CVT62 siege approach
show('CVT62 approach', () => {
  const t = last(by.get('CVT62-army-siege-approach'));
  const a = t.armies[0];
  return JSON.stringify({ x: a?.x, y: a?.y, occStrN: t.occStrDiff.length, occCivN: t.occCivDiff.length, m1tx: t.units.find((u) => u.id === 1)?.tx, ev: t.newEvents.length });
});
// CVT63 frontpush march
show('CVT63 push', () => {
  const t = last(by.get('CVT63-army-frontpush-march'));
  const a = t.armies[0];
  return JSON.stringify({ marchPushTick: a?.marchPushTick, occCivN: t.occCivDiff.length, occStr: t.occStrDiff.slice(0, 3), x: a?.x });
});
// CVT64 supply
show('CVT64 supply', () => {
  const t = last(by.get('CVT64-army-supply-line'));
  const a = t.armies[0];
  return JSON.stringify({ morale: a?.morale, supplyWarned: a?.supplyWarned, ev: t.newEvents.map((e) => e.text.slice(0, 32)) });
});
// CVT65 pursue kill
show('CVT65 kill', () => {
  const t = last(by.get('CVT65-army-pursue-kill'));
  const dead = t.units.filter((u) => u.dead);
  const wd = t.warData.find(([k]) => k === '0-1');
  const a2 = t.armies.find((a) => a.id === 2);
  return JSON.stringify({ dead: dead.map((u) => u.id), a2losses: a2?.losses, a2morale: a2?.morale, wd: wd ? wd[1].casB + '/' + wd[1].scoreA : null, ev: t.newEvents.map((e) => e.text.slice(0, 30)) });
});
// CVT66 rout panic disband
show('CVT66 rout', () => {
  const r = by.get('CVT66-army-rout-panic-disband');
  const t0 = r.traces[0];
  const tEnd = last(r);
  const kinds = r.traces.flatMap((t) => t.newEvents.map((e) => e.kind));
  const cd = tEnd.civs[0].armyCd;
  return JSON.stringify({ t0armies: t0.armies.map((a) => a.state + '/' + a.morale), panic: t0.armies[1]?.morale, endArmies: tEnd.armies.length, cd, evKinds: kinds, endEvents: tEnd.newEvents.map((e) => e.text.slice(0, 26)) });
});
// CVT67 triumph
show('CVT67 triumph', () => {
  const r = by.get('CVT67-army-triumph');
  const t0 = r.traces[0];
  const tEnd = last(r);
  return JSON.stringify({ t0morale: t0.armies[0]?.morale, t0state: t0.armies[0]?.state, endArmies: tEnd.armies.length, cd: tEnd.civs[0].armyCd, ev: t0.newEvents.map((e) => e.text.slice(0, 30)) });
});
// CVT68 barracks war
show('CVT68 barracks', () => {
  const t = last(by.get('CVT68-barracks-war'));
  return JSON.stringify({ jobs: t.units.map((u) => u.job), fxN: t.effects.length, fxKinds: t.effects.map((e) => e.kind), hp1: t.units[0].hp, dmg1: t.units[0].dmg });
});
// CVT69 peace
show('CVT69 peace', () => {
  const t = last(by.get('CVT69-barracks-peace'));
  return JSON.stringify({ jobs: t.units.map((u) => u.job), fxN: t.effects.length, rngA: t.rngA });
});
// CVT70 temple
show('CVT70 temple', () => {
  const t = last(by.get('CVT70-temple-heal'));
  return JSON.stringify({ hp: t.units.map((u) => u.hp), fx: t.effects.map((e) => e.kind), gold: t.civs[0].gold, income: t.civs[0].income });
});
// CVT71 decay
show('CVT71 decay', () => {
  const r = by.get('CVT71-front-decay');
  const s0 = r.traces[0].occStrDiff;
  const s30 = r.traces[30].occStrDiff;
  const sEnd = last(r).occStrDiff;
  const occCivEnd = last(r).occCivDiff.filter(([, v]) => v === -1);
  return JSON.stringify({ s0, s30, sEnd: sEnd.slice(0, 4), cleared: occCivEnd.length, ev: r.traces.flatMap((t) => t.newEvents.map((e) => e.kind + ':' + e.text.slice(0, 20))) });
});
// CVT72 solidify
show('CVT72 solidify', () => {
  const t = last(by.get('CVT72-front-solidify'));
  return JSON.stringify({ ownerDiff: t.ownerDiff, occCivDiff: t.occCivDiff, occStrDiff: t.occStrDiff, tiles0: t.civs.find((c) => c.id === 0).tiles.length });
});
