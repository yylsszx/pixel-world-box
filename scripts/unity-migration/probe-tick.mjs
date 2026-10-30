// probe-tick.mjs — tick() 编排层探针：patch 完整性 + trace 协议实证（M-U7c 前置）
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let canvasSeq = 0;
class RecCtx {
  constructor(canvas) { this.canvas = canvas; this.id = canvas.__id; this.ops = []; this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.globalAlpha = 1; this.imageSmoothingEnabled = true; }
  fillRect() {} strokeRect() {} clearRect() {} save() {} restore() {} translate() {} scale() {} setTransform() {} putImageData() {} drawImage() {}
  beginPath() {} arc() {} fill() {} stroke() {} moveTo() {} lineTo() {} setLineDash() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w|0)*(h|0)*4)), width: w|0, height: h|0 }; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w|0)*(h|0)*4)), width: w|0, height: h|0 }; }
  measureText() { return { width: 0 }; } createLinearGradient() { return { addColorStop() {} }; } createRadialGradient() { return { addColorStop() {} }; }
}
function mkCanvas(w, h) { const c = { width: w, height: h, __id: ++canvasSeq }; c.getContext = () => (c.__ctx ??= new RecCtx(c)); return c; }
globalThis.document = { createElement: () => mkCanvas(0, 0), createElementNS: () => mkCanvas(0, 0), addEventListener: () => {} };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.requestAnimationFrame = () => {};
globalThis.performance = globalThis.performance ?? { now: () => 0 };

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const wbsp = await jiti.import(path.join(ROOT, 'src/lib/wasm/wbspatial.ts'));

const eng = new GameEngine(4213);
const trace = [];
const rec = (name) => (eng.tickCount, trace.push(`${name}@${eng.tickCount}`));

// patch eng 实例方法（tick 母体 L2501-2649 全部被调）
const engMethods = ['fireTick','rebuildBuckets','unitsTick','panicTick','rebuildCivBuildCounts','civsTick','effectsTick','radTick','frontTick','economyTick','tradeTick','defenseTick','templeTick','barracksTick','banditRaidTick','dragonSpawnTick','regrowTick','statsTick','checkTriggers','decalsTick','fpTick','iceTick','snowmanTick','historyTick','victoryTick','warTick','worldWarTick','armyTick','warInfoTick','directiveTick','techTick','societyTick','allianceTick','armoryTick','ecoTick','evolutionTick','sampleHistory','achievementsTick','angelAuraTick','phoenixAshTick','entGroveTick','lichRaiseTick','hydraRegenTick','beachedAquaticTick','wildlifeReboundTick','predatorHuntTick','sharkBreedTick'];
for (const m of engMethods) {
  if (typeof eng[m] !== 'function') { console.log(`MISSING eng.${m}`); continue; }
  eng[m] = function () { rec(m); };
}
// nature / worldsim / agentLaws 子对象
for (const [obj, ms] of [[eng.nature, ['atmTick','stormTick','hydroTick','seasonCheck','tectonicTick','geologyTick']], [eng.worldsim, ['oceanTick','tempTick','glacierTick','hydroTick','coastTick','biomeTick']], [eng.agentLaws, ['tick']]]) {
  for (const m of ms) {
    if (typeof obj[m] !== 'function') { console.log(`MISSING sub.${m}`); continue; }
    obj[m] = function () { rec(`${obj === eng.nature ? 'nature' : obj === eng.worldsim ? 'worldsim' : 'agentLaws'}.${m}`); };
  }
}
// WBB.touchMeta（模块级对象）
const origTouch = wbsp.WBB.touchMeta;
wbsp.WBB.touchMeta = function () { rec('WBB.touchMeta'); };

// 空世界跑 3 tick
console.log('pre:', JSON.stringify({ units: eng.units.length, civs: eng.civs.length, armies: eng.armies.length, fires: eng.fireSet.size, season: eng.nature.season, lawsSeasons: eng.laws.seasons, yearF: eng.yearF, tickCount: eng.tickCount, shake: eng.shake, panicNoteCd: eng.panicNoteCd, ashes: eng.phoenixAshes.length, overlayMode: eng.overlayMode, overlayDirty: eng.overlayDirty }));
const preFireSet = eng.fireSet.size;
for (let i = 0; i < 3; i++) eng.tick();
console.log('trace:', trace.join(' | '));
console.log('post:', JSON.stringify({ yearF: eng.yearF, tickCount: eng.tickCount, shake: eng.shake, panicNoteCd: eng.panicNoteCd, units: eng.units.length, fires: eng.fireSet.size, overlayDirty: eng.overlayDirty, touchChanged: wbsp.WBB.touchMeta !== origTouch }));
console.log('PROBE OK, trace lines =', trace.length);
