// extract-society-nunit.mjs —— NUnit WbUnitsSociety 期望值权威换算（node 直跑真实现，零手抄）
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, TRAITS, JOBS, ALLIANCE_COLORS, RACE_REL_BASE, BUILDING_DEFS } from '../../src/lib/game/types.ts';
import { TECHS, GOV_DEFS } from '../../src/lib/game/tech.ts';
import { FIRST } from '../../src/lib/game/names.ts';
import { WB } from '../../src/lib/wasm/wbspatial.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { neuroStats } from '../../src/lib/game/neuro.ts';

const W = 256, H = 160;
neuroStats.enabled = false;
WB.setEnabled(false);
const pickRace = (key) => { for (const k of Object.keys(RACES)) if (RACES[k].key === key) return Number(k); throw new Error('race'); };
const HUMAN = pickRace('human'), ORC = pickRace('orc');
const bitsBE = (d) => { const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, Object.is(d, -0) ? 0 : d, false); return '0x' + [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase(); };

function mkEng(seed, env, civSpecs, blds) {
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
  eng.unitSeq = 1000; eng.grassTiles = 0; eng.yearF = env.yearF ?? 12;
  eng.dynTraits = new Map(); eng.traitSeq = 0; eng.evoSeq = 0; eng.evoIndex = new Map(); eng.evoNodes = []; eng.speciesBase = new Map();
  eng.unitById = new Map();
  eng.nature = { season: 0, bloodMoonTTL: 0, eclipseTTL: 0, reproMul() { return 1; } };
  eng.moonIllum = () => 0;
  eng.fxPrefs = { get ambience() { return false; }, get blood() { return true; }, get dmgNumbers() { return true; }, get corpses() { return true; } };
  eng.frameCount = 100; eng.tickCount = env.tick ?? 0;
  eng.laws = { wars: true, undeadRise: false, zombieInfect: false, reproduction: true, zombieVirus: false, cityGrowth: true };
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
  eng.techModCache = new Map(); eng.emTechs = new Map(); eng.emTechSeq = 1;
  eng.ideaModCache = new Map(); eng.emIdeas = new Map(); eng.civBuildCounts = new Map(); eng.marketIdx = new Map();
  eng.ideaSeq = env.ideaSeq ?? 1;
  eng.govCache = new Map(); eng.lastGovEventTick = new Map(); eng.civHomogeneity = new Map();
  eng.tileX = (i) => i % W; eng.tileY = (i) => (i / W) | 0;
  eng.eventSeq = 0; eng.toastSeq = 0;
  eng.grabbedTick = () => {}; eng.updateBoat = () => {}; eng.riseSkeleton = () => {}; eng.spreadPlague = () => {};
  eng.updateUnitTailJS = () => false;
  eng.toast = () => {}; eng.onSound = null;
  eng.fx = () => {};
  for (const cs of civSpecs) eng.civs[cs.id] = { ...cs, alive: true, tiles: [...(cs.tiles ?? [])], frontier: [], techs: [...(cs.techs ?? [])], ideas: [...(cs.ideas ?? [])] };
  for (const b of blds ?? []) {
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
  return { eng, evts, drawsRef: { get: () => draws, reset: () => { draws = 0; } } };
}
const civSnap = (c) => ({ gov: c.gov ?? null, stab: c.stability === undefined ? null : bitsBE(c.stability), cult: c.culture === undefined ? null : bitsBE(c.culture), mil: c.militarism === undefined ? null : bitsBE(c.militarism), fest: c.festivalCd === undefined ? null : bitsBE(c.festivalCd), govYear: c.govYear ?? null, ideas: [...(c.ideas ?? [])] });

const out = [];
// —— 段 1：festival（seed 402）——civ0 culture 65 → 首拍过节 → cd 递减 → 复燃候选
{
  const { eng, evts, drawsRef } = mkEng(402, { tick: 300, yearF: 7.5 },
    [{ id: 0, name: '晨风国', race: HUMAN, colorHex: '#cf3f2e', pop: 14, culture: 65, stability: 50 }]);
  const c0 = eng.civs[0];
  const seg = { name: 'seg1', steps: [] };
  for (let t = 0; t < 15; t++) {
    drawsRef.reset();
    eng.societyTick();
    seg.steps.push({ t, draws: drawsRef.get(), ...civSnap(c0), evts: evts.splice(0).map((e) => `${e.kind}|${e.text}`) });
  }
  out.push(seg);
}
// —— 段 2：gov-evolve（seed 103 子集）——civ0 empire / civ1 republic / civ2 monarchy + 冷却封锁
{
  const { eng, evts, drawsRef } = mkEng(103, { tick: 600, yearF: 15.0 },
    [
      { id: 0, name: '晨风国', race: HUMAN, colorHex: '#cf3f2e', pop: 130, gold: 30, militarism: 60, techs: ['legion'] },
      { id: 1, name: '磐石国', race: HUMAN, colorHex: '#5ba8e0', pop: 60, gold: 30, stability: 50, knowledge: 50, techs: ['law'] },
      { id: 2, name: '孤竹国', race: HUMAN, colorHex: '#8ad0a0', pop: 25, gold: 30 },
    ]);
  const seg = { name: 'seg2', steps: [] };
  const tick = () => {
    drawsRef.reset();
    eng.societyTick();
    seg.steps.push({ draws: drawsRef.get(), civs: eng.civs.map(civSnap), evts: evts.splice(0).map((e) => `${e.kind}|${e.text}`), govCache: [...eng.govCache.entries()], lastGov: [...eng.lastGovEventTick.entries()] });
  };
  tick(); eng.tickCount += 1999; tick(); eng.tickCount += 1; tick(); eng.tickCount += 1500; tick();
  out.push(seg);
}
// —— 段 3：ideas（seed 137 子集）——spread + invention 词法/mods 位模式
{
  const { eng, evts, drawsRef } = mkEng(137, { tick: 450, yearF: 11.3, ideaSeq: 2 },
    [
      { id: 0, name: '晨风国', race: HUMAN, colorHex: '#cf3f2e', pop: 14, culture: 65, festivalCd: 2 },
      { id: 1, name: '磐石国', race: HUMAN, colorHex: '#5ba8e0', pop: 14, culture: 65, festivalCd: 2, ideas: ['id0', 'id1'] },
    ]);
  eng.emIdeas.set('id0', { key: 'id0', name: '重商主义', desc: '商路即国脉 —— 收入 +18%', mods: { gold: 0.18 } });
  eng.emIdeas.set('id1', { key: 'id1', name: '铁律律令', desc: '令行禁止 —— 稳定 +4', mods: { stab: 4, gold: -0.05 } });
  const seg = { name: 'seg3', imod0: null, imod1: null, steps: [] };
  const imod = (id) => { const m = eng.ideaModsOf(id); return { gold: bitsBE(m.gold), stab: bitsBE(m.stab), mil: bitsBE(m.mil), know: bitsBE(m.know), repro: bitsBE(m.repro), wear: bitsBE(m.wear) }; };
  seg.imod0 = imod(0);
  for (let t = 0; t < 4; t++) {
    drawsRef.reset();
    eng.societyTick();
    seg.steps.push({ t, draws: drawsRef.get(), civs: eng.civs.map(civSnap), evts: evts.splice(0).map((e) => `${e.kind}|${e.text}`) });
  }
  seg.imod0b = imod(0); seg.imod1b = imod(1);
  seg.ideaSeq = eng.ideaSeq; seg.evoSeq = eng.evoSeq;
  seg.emIdeas = [...eng.emIdeas.entries()].map(([k, t]) => ({ key: k, name: t.name, desc: t.desc, gold: t.mods.gold === undefined ? null : bitsBE(t.mods.gold), stab: t.mods.stab === undefined ? null : bitsBE(t.mods.stab), mil: t.mods.mil === undefined ? null : bitsBE(t.mods.mil), know: t.mods.know === undefined ? null : bitsBE(t.mods.know), repro: t.mods.repro === undefined ? null : bitsBE(t.mods.repro), wear: t.mods.wear === undefined ? null : bitsBE(t.mods.wear) }));
  out.push(seg);
}
console.log(JSON.stringify(out, null, 1));
