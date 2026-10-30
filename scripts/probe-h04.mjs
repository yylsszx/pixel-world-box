#!/usr/bin/env node
// H04-repro-wild 掷值序探针：monkey-patch eng.rng 打印 (i, v, 调用点) 序——定位 C# 与 JS 的 rng 消费序分歧
import { createJiti } from 'jiti';
import path from 'node:path';
const ROOT = '/home/z/my-project';
const noop = () => {};
const stubCtx = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return null;
  if (k === 'createImageData' || k === 'getImageData') return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4,(w|0)*(h|0)*4)), width: w|0, height: h|0 });
  if (k === 'measureText') return () => ({ width: 0 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  if (k === 'createPattern') return () => ({});
  return typeof k === 'string' ? noop : undefined; }, set: () => true });
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = { createElement: (t) => (t === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }), addEventListener: noop, getElementById: () => null };
globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));

const GRASS = T.GRASS;
const eng = new GameEngine(0x5f23);
eng.civs.length = 0; eng.units.length = 0; eng.unitById.clear();
  eng.civs.push({ id: 0, name: 'C0', race: 0, pop: 2, tiles: [10640], frontier: [], houses: 0, capital: 10640, alive: true, gold: 0, knowledge: 0, colorHex: '#c83c3c', techs: [] }); eng.civs[0] = eng.civs[0];
eng.laws = { ...DEFAULT_LAWS };
eng.rngA = 300923;
// 夹具（对齐 gen H04）
eng.effects.length = 0; eng.dirty.clear(); eng.propsDirty.clear();
eng.worldEvents.length = 0; eng.__lastEventId = eng.eventSeq;
eng.families.clear(); eng.familySeq = 0; eng.wildCount.clear();
eng.dynTraits.clear(); eng.traitSeq = 0; eng.evoNodes.length = 0; eng.evoSeq = 0; eng.evoIndex.clear();
eng.wildCount.set(6, 3); eng.directives.push({id:0,civ:0,kind:'populate',target:null,param:0,status:'active',startTick:0});
eng.grassTiles = 8000;
const u5 = { id: 5, race: 0, civ: 0, x: 40.5, y: 40.5, tx: 40.5, ty: 40.5, hp: 10, maxHp: 10, dmg: 1, speed: 1,
  age: 0, maxAge: 9999, kills: 0, cd: 0, trait: 0, job: 0, king: 0, infected: 0, flip: 0, name: 'u5',
  hurt: 0, breath: 0, parity: 0, dead: 0, boat: 0, boatTTL: 0, caravan: 0, wep: 0, arm: 0, hlm: 0, shd: 0, bts: 0, rng: 0, amu: 0,
  fam: undefined, fgn: undefined, gene: { s: 1.1, d: 1.0, h: 1.0, r: 1.2 } };
eng.units.push(u5); eng.unitById.set(5, u5); eng.unitSeq = 6;

// monkey-patch rng：记录 (i, v, 调用点栈尾)
const logs = [];
let i = 0;
const origRng = eng.rng.bind(eng);
eng.rng = () => {
  const v = origRng();
  const st = new Error().stack.split('\n')[2] || '';
  logs.push([i++, v.toFixed(5), st.trim().slice(0, 90)]);
  return v;
};
eng.updateUnitPostJS(u5);
for (const [idx, v, where] of logs) console.log(`#${idx} v=${v}  ${where}`);
console.log('rngA POST:', eng.rngA >>> 0);
const child = eng.units.find((u) => u.id >= 6);
console.log('child.trait:', child ? child.trait : null);
console.log('TRAITS keys:', JSON.stringify(Object.keys((await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'))).TRAITS)));
