// extract-tech-nunit.mjs —— NUnit WbUnitsTech 期望值权威换算（node 直跑真实现，零手抄）
// 段 1 = golden S3 research-complete（seed 303 全程复刻，步级快照）
// 段 2 = golden S4 tech-retro（seed 304，comptech iron 中间态 + steel 终态分拍捕获）
// 段 3 = golden S5 emtech-invent（seed 305，em0 词法/effects/cost + tmod 叠加位串）
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, TRAITS, JOBS, ALLIANCE_COLORS, RACE_REL_BASE, BUILDING_DEFS } from '../../src/lib/game/types.ts';
import { TECHS } from '../../src/lib/game/tech.ts';
import { FIRST } from '../../src/lib/game/names.ts';
import { WB } from '../../src/lib/wasm/wbspatial.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { neuroStats } from '../../src/lib/game/neuro.ts';

const W = 256, H = 160;
neuroStats.enabled = false;
WB.setEnabled(false);
const pickRace = (key) => { for (const k of Object.keys(RACES)) if (RACES[k].key === key) return Number(k); throw new Error('race'); };
const HUMAN = pickRace('human');
const bitHex = (d) => { if (Object.is(d, -0)) d = 0; const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, d, true); return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join(''); };
const bitsBE = (d) => { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, d, false); return '0x' + [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(); };

function mkEng(seed, env, civSpecs, unitSpecs, blds) {
  const eng = Object.create(GameEngine.prototype);
  eng.terrain = new Uint8Array(W * H).fill(3);
  eng.road = new Uint8Array(W * H); eng.fire = new Uint8Array(W * H); eng.radiate = new Uint8Array(W * H);
  eng.fireSet = new Set(); eng.building = new Uint8Array(W * H);
  eng.bw = W / 4; eng.bh = H / 4;
  eng.buckets = Array.from({ length: eng.bw * eng.bh }, () => []);
  eng.bucketStampArr = new Int32Array(eng.bw * eng.bh); eng.bucketStamp = 0;
  eng.ghostBuckets = []; eng.enemyLut = new Map(); eng.dynRaces = new Map();
  eng.blood = []; eng.corpses = []; eng.activeBattles = new Map(); eng.statDragonsSlain = 0;
  eng.wildCount = new Map(); eng.items = []; eng.itemSeq = 1; eng.families = new Map(); eng.familySeq = 1;
  eng.unitSeq = 1000; eng.grassTiles = 0; eng.yearF = 12;
  eng.dynTraits = new Map(); eng.traitSeq = 0; eng.evoSeq = 0; eng.evoIndex = new Map(); eng.evoNodes = []; eng.speciesBase = new Map();
  eng.unitById = new Map();
  eng.nature = { season: env.season ?? 0, bloodMoonTTL: 0, eclipseTTL: 0, reproMul() { return 1; } };
  eng.moonIllum = () => 0;
  eng.fxPrefs = { get ambience() { return false; }, get blood() { return true; }, get dmgNumbers() { return true; }, get corpses() { return true; } };
  eng.frameCount = 100; eng.tickCount = env.tick ?? 0;
  eng.laws = { undeadRise: false, zombieInfect: false, reproduction: true, zombieVirus: false, cityGrowth: true };
  eng.civs = []; eng.met = new Set(); eng.rel = new Map(); eng.tension = new Map(); eng.raceRel = new Map();
  eng.warData = new Map(); eng.totalWars = new Set(); eng.warShame = new Map(); eng.warHistory = [];
  eng.lastDeclareAt = new Map(); eng.allianceWarCd = new Map(); eng.alliances = []; eng.allianceOf = new Map();
  eng.allianceSeq = 1; eng.armies = []; eng.emergentWeapons = new Map(); eng.killCredit = null;
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 }; eng.statWars = 0;
  eng.lastCatastrophe = { tick: -1000000000, x: -1, y: -1 }; eng.ecoState = 'balanced';
  eng.owner = new Int16Array(W * H).fill(-1); eng.occCiv = new Int8Array(W * H).fill(-1);
  eng.occStr = new Uint8Array(W * H); eng.occSet = new Set();
  eng.buildings = []; eng.bIdx = new Map(); eng.bHp = new Map(); eng.damagedSet = new Set(); eng.dirty = new Set();
  eng.overlayMode = 'none'; eng.overlayDirty = false;
  eng.directives = []; eng.dirSeq = 1; eng.victoryCiv = null;
  eng.techModCache = new Map(); eng.emTechs = new Map(); eng.emTechSeq = env.emTechSeq ?? 1;
  eng.ideaModCache = new Map(); eng.emIdeas = new Map(); eng.civBuildCounts = new Map(); eng.marketIdx = new Map();
  eng.tileX = (i) => i % W; eng.tileY = (i) => (i / W) | 0;
  eng.eventSeq = 0; eng.toastSeq = 0;
  eng.grabbedTick = () => {}; eng.updateBoat = () => {}; eng.riseSkeleton = () => {}; eng.spreadPlague = () => {};
  eng.updateUnitTailJS = () => false;
  eng.toast = () => {}; eng.onSound = null;
  eng.fx = () => {};
  for (const cs of civSpecs) eng.civs[cs.id] = { ...cs, alive: true, tiles: [...(cs.tiles ?? [])], frontier: [], techs: [...(cs.techs ?? [])], ideas: [] };
  eng.units = unitSpecs.map((s) => {
    const u = { id: s.id, race: HUMAN, x: s.x, y: s.y, tx: s.x, ty: s.y, hp: s.hp, maxHp: s.maxHp, dmg: s.dmg, speed: s.speed, kills: 0, cd: 0, atk: 0, fleeT: 0, dead: !!s.dead, civ: s.civ, job: 0, boat: 0, boatTTL: 0, grab: 0, name: 'U' + s.id };
    if (s.tdmg !== undefined) u.tDmg = s.tdmg;
    if (s.thp !== undefined) u.tHp = s.thp;
    return u;
  });
  for (const b of blds) {
    eng.building[b.i] = b.kind;
    eng.buildings.push({ i: b.i, x: b.i % W, y: (b.i / W) | 0, kind: b.kind, civ: b.civ });
    eng.bIdx.set(b.i, eng.buildings.length - 1);
    eng.bHp.set(b.i, BUILDING_DEFS[b.kind].hp);
  }
  const raw = mulberry32(seed);
  let draws = 0;
  eng.rng = () => { draws++; return raw(); };
  const evts = [];
  eng.addEvent = (kind, text, opts) => evts.push({ id: eng.eventSeq++, year: Math.floor(eng.yearF), kind, text, colorHex: opts?.colorHex ?? null, x: opts?.x === undefined ? null : opts.x, y: opts?.y === undefined ? null : opts.y });
  return { eng, raw, drawsRef: { get() { return draws; }, reset() { draws = 0; } }, evts };
}

const out = [];
// —— 段 1：research-complete（seed 303）——
{
  const { eng, drawsRef, evts } = mkEng(303, { tick: 360, yearF: 9.0 },
    [{ id: 0, name: '晨风国', race: HUMAN, colorHex: '#cf3f2e', pop: 12, gold: 30, techs: ['fire'] }],
    [], [{ i: 8041, kind: 8, civ: 0 }, { i: 8042, kind: 1, civ: 0 }]);
  eng.rebuildCivBuildCounts();
  const c0 = eng.civs[0];
  const seg = { name: 'seg1', steps: [] };
  const snap = (tag) => seg.steps.push({
    tag, draws: drawsRef.get(), drawsRef: undefined,
    gold: bitHex(c0.gold), kn: c0.knowledge === undefined ? null : bitHex(c0.knowledge),
    research: c0.research ?? null, rp: c0.researchP === undefined ? null : bitHex(c0.researchP),
    income: c0.income === undefined ? null : bitHex(c0.income), expense: c0.expense === undefined ? null : bitHex(c0.expense),
    techs: [...c0.techs], bhp: [...eng.bHp.entries()].map(([i, v]) => [i, bitsBE(v)]),
    evts: evts.slice(), tmBhp: bitsBE(eng.techModsOf(0).bhp),
  });
  evts.length = 0; drawsRef.reset();
  eng.economyTick(); snap('etick');
  evts.length = 0; drawsRef.reset();
  const spent1 = eng.fundResearch(c0, 999); seg.spent1 = bitsBE(spent1); snap('fundres999');
  evts.length = 0; drawsRef.reset();
  eng.completeTech(c0, 'masonry'); snap('masonry');
  evts.length = 0; drawsRef.reset();
  eng.completeTech(c0, 'fortification'); snap('fort');
  seg.evtTexts = evts.map((e) => `${e.kind}|${e.text}|${e.colorHex}|${e.x}|${e.y}`);
  out.push(seg);
}
// —— 段 2：tech-retro（seed 304）——
{
  const units = [
    { id: 1, x: 60.5, y: 60.5, civ: 0, dmg: 10, hp: 50, maxHp: 100, speed: 0.045, tdmg: 1.1, thp: 1.0 },
    { id: 2, x: 63.5, y: 61.5, civ: 0, dmg: 8.5, hp: 66, maxHp: 66, speed: 0.045, tdmg: 1.1, thp: 1.0 },
    { id: 3, x: 66.5, y: 62.5, civ: 0, dmg: 12, hp: 20, maxHp: 80, speed: 0.045, tdmg: 1.0, thp: 1.0 },
    { id: 4, x: 120.5, y: 70.5, civ: 1, dmg: 9, hp: 40, maxHp: 90, speed: 0.045, tdmg: 1.1, thp: 1.0 },
    { id: 5, x: 68.5, y: 63.5, civ: 0, dmg: 7, hp: 30, maxHp: 70, speed: 0.045, dead: true, tdmg: 1.1, thp: 1.0 },
  ];
  const { eng, drawsRef } = mkEng(304, { tick: 480, yearF: 12.0 },
    [{ id: 0, name: '晨风国', race: HUMAN, colorHex: '#cf3f2e', pop: 3, techs: ['stone'] },
     { id: 1, name: '磐石国', race: HUMAN, colorHex: '#5ba8e0', pop: 1 }],
    units, []);
  const c0 = eng.civs[0];
  const seg = { name: 'seg2', snaps: [] };
  const snapU = (tag) => seg.snaps.push({
    tag, draws: drawsRef.get(),
    u: eng.units.map((u) => ({ id: u.id, dmg: bitsBE(u.dmg), hp: bitsBE(u.hp), maxHp: bitsBE(u.maxHp), td: u.tDmg === undefined ? null : bitsBE(u.tDmg), th: u.tHp === undefined ? null : bitsBE(u.tHp) })),
    tmDmg: bitsBE(eng.techModsOf(0).dmg), tmHp: bitsBE(eng.techModsOf(0).hp),
  });
  drawsRef.reset();
  eng.completeTech(c0, 'iron'); snapU('iron');
  drawsRef.reset();
  eng.completeTech(c0, 'steel'); snapU('steel');
  out.push(seg);
}
// —— 段 3：emtech-invent（seed 305）——
{
  const { eng, drawsRef, evts } = mkEng(305, { tick: 600, yearF: 15.0, emTechSeq: 1 },
    [{ id: 0, name: '晨风国', race: HUMAN, colorHex: '#cf3f2e', pop: 10, gold: 80, militarism: 60, culture: 40, techs: TECHS.map((t) => t.key) }],
    [{ id: 1, x: 60.5, y: 60.5, civ: 0, dmg: 10, hp: 50, maxHp: 100, speed: 0.045, tdmg: 1.0, thp: 1.0 }], []);
  const c0 = eng.civs[0];
  const seg = { name: 'seg3' };
  drawsRef.reset();
  seg.spentA = bitsBE(eng.fundResearch(c0, 50)); seg.drawsA = drawsRef.get();
  seg.researchA = c0.research ?? null; seg.rpA = bitsBE(c0.researchP ?? NaN);
  seg.evtStart = evts.map((e) => `${e.kind}|${e.text}`);
  evts.length = 0; drawsRef.reset();
  seg.spentB = bitsBE(eng.fundResearch(c0, 200)); seg.drawsB = drawsRef.get();
  seg.knB = bitsBE(c0.knowledge ?? NaN);
  seg.evtComplete = evts.map((e) => `${e.kind}|${e.text}|${e.x}|${e.y}`);
  seg.emTechs = [...eng.emTechs.entries()].map(([k, t]) => ({ key: k, name: t.name, cat: t.cat, cost: bitsBE(t.cost), gen: t.gen, effects: t.effects.map((e) => [e.k, bitsBE(e.v)]), desc: t.desc }));
  seg.evoSeq = eng.evoSeq; seg.emTechSeq = eng.emTechSeq;
  const tm = eng.techModsOf(0);
  seg.tmDmg = bitsBE(tm.dmg); seg.tmRange = bitsBE(tm.range); seg.tmHp = bitsBE(tm.hp);
  seg.u1 = { dmg: bitsBE(eng.units[0].dmg), maxHp: bitsBE(eng.units[0].maxHp), hp: bitsBE(eng.units[0].hp), td: bitsBE(eng.units[0].tDmg), th: bitsBE(eng.units[0].tHp) };
  out.push(seg);
}
console.log(JSON.stringify(out, null, 1));
