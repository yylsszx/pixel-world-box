// gen-render7.mjs — M-U7c 渲染接线 II 黄金向量生成器：visCacheFor 接入 UnitScene 动态种族绘制路径
// 真实现 = render.ts render() 直调（RACES 动态注入 → 涌现分支 L2319-2331 → sprites.ts drawEmergent* 全展开）
// 蓝本锚：render.ts drawUnitBody L2206（水生门控/tryDrawFine 精绘（quad && !def.vis 守卫——动态种 zoom≥8 不走精绘）/
//         色点档 !def.vis 门/中档 !def.vis 门/涌现分支/全绘 switch）+ emergence.ts visCacheFor L207。
// 场景：E 组 creature 10（zoom 四档/king/hurt-flip/gait/影子/penguin/bear 基）+ M 组 monster 5
//       （aquatic/worm/serpent×3 含 flying 影子豁免）+ G 组门控 3（person vis 落 switch/fish 离水空流/fish 在水 creature）。
// dump 协议：ops = gen-render5 同款（f64 小端）；rdefs = raceId → {sprite,aquatic,sandswim,flying,maxAge,vis}
//       （vis = JSON.stringify(genome) 原始数字串——gen-render2 raceVis 契约，Newtonsoft/JSON.parse 短表示往返位精确）。
// 陷阱预案（gen-render6 教训）：动态 race id 全局唯一（9101+）→ visCacheMap 跨场景零碰撞（真实缓存语义保留）；
//       RACES 仅追加新 id 不动基表（gen 进程内注册表零污染）；dump rdefs 与执行侧同源（注入对象即 dump 对象）。
// 跑法：node scripts/unity-migration/gen-render7.mjs（自带 sanity + det 子进程双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片：录制版 canvas/ctx（必须在 import engine 之前挂好；gen-render5 同款） ----------------
let canvasSeq = 0;

class RecCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.id = canvas.__id;
    this.ops = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = true;
    this.font = '';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
  }
  _rec(o, args) {
    this.ops.push({ o, a: args, c: this.id, s: [this.fillStyle, this.strokeStyle, this.lineWidth, this.globalAlpha], tag: null });
  }
  fillRect(...a) { this._rec('fillRect', a); }
  strokeRect(...a) { this._rec('strokeRect', a); }
  clearRect(...a) { this._rec('clearRect', a); }
  save() { this._rec('save', []); }
  restore() { this._rec('restore', []); }
  translate(...a) { this._rec('translate', a); }
  scale(...a) { this._rec('scale', a); }
  setTransform(...a) { this._rec('setTransform', a); }
  putImageData(...a) { this._rec('putImageData', []); }
  drawImage(...a) { this._rec('drawImage', a); }
  beginPath() {}
  arc() {}
  fill() {}
  stroke() {}
  moveTo() {}
  lineTo() {}
  setLineDash() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; }
  getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 }; }
  measureText() { return { width: 0 }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
}
function mkCanvas(w, h) {
  const c = { width: w, height: h, __id: ++canvasSeq };
  c.getContext = () => { if (!c.__ctx) c.__ctx = new RecCtx(c); return c.__ctx; };
  return c;
}
globalThis.document = {
  createElement: () => mkCanvas(0, 0),
  createElementNS: () => mkCanvas(0, 0),
  addEventListener: () => {},
};
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.requestAnimationFrame = () => {};

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const { GameEngine } = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const { T, DEFAULT_LAWS, RACES } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { visFromGene, mutateVis } = await jiti.import(path.join(ROOT, 'src/lib/game/emergence.ts'));
const renderMod = await jiti.import(path.join(ROOT, 'src/lib/game/render.ts'));

const W = 256, H = 160;
const idx = (x, y) => y * W + x;

// ---------------- mulberry32（基因组固定 rng；gen-render6 同源公式） ----------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function dumpOpRange(ctx, n0) {
  const out = [];
  for (let k = n0; k < ctx.ops.length; k++) {
    const op = ctx.ops[k];
    let s = null;
    if (op.o === 'fillRect') s = [op.s[0]];
    else if (op.o === 'strokeRect') s = [op.s[1], op.s[2]];
    out.push({ o: op.o, a: op.a.map((v) => (typeof v === 'number' ? f64hex(v) : v)), s });
  }
  return out;
}

// ---------------- 引擎（gen-render5 同款段引擎） ----------------
let SEG_ENG = null;
function segEng() {
  if (!SEG_ENG) {
    SEG_ENG = new GameEngine(123);
    SEG_ENG.civs.length = 0;
    SEG_ENG.units.length = 0;
    SEG_ENG.unitById.clear();
    SEG_ENG.laws = { ...DEFAULT_LAWS };
    SEG_ENG.overlayMode = 'none';
    if (!SEG_ENG.worldsim) SEG_ENG.worldsim = { glacier: new Uint8Array(W * H) };
    if (!SEG_ENG.worldsim.glacier) SEG_ENG.worldsim.glacier = new Uint8Array(W * H);
  }
  const eng = SEG_ENG;
  eng.effects.length = 0;
  eng.buildings.length = 0;
  eng.armies.length = 0;
  eng.items.length = 0;
  eng.blood.length = 0;
  eng.corpses.length = 0;
  eng.phoenixAshes.length = 0;
  if (eng.footprints) eng.footprints.length = 0;
  if (eng.flocks) eng.flocks.length = 0;
  eng.fireSet.clear();
  eng.occSet.clear();
  if (eng.activeBattles) eng.activeBattles.clear();
  if (eng.riverTiles) eng.riverTiles.clear();
  eng.wet.clear();
  eng.dirty.clear();
  eng.propsDirty.clear();
  eng.selectedId = 0;
  eng.shake = 0;
  eng.nature.ash = 0;
  eng.nature.seasonOffset = 0;
  eng.yearF = 0;
  eng.laws = { ...DEFAULT_LAWS, seasons: true };
  eng.civs.length = 0;
  eng.units.length = 0;
  eng.worldsim.glacier.fill(0);
  return eng;
}
function baseField(eng) {
  eng.terrain.fill(T.GRASS);
  eng.waterTier.fill(0);
  eng.road.fill(0);
  eng.owner.fill(-1);
  eng.radiate.fill(0);
  eng.snowman.fill(0);
  for (let i = 0; i < W * H; i++) eng.variant[i] = (i * 7 + 3) & 255;
}
function setTile(eng, i, o) {
  if (o.t !== undefined) eng.terrain[i] = o.t;
  if (o.variant !== undefined) eng.variant[i] = o.variant;
  if (o.waterTier !== undefined) eng.waterTier[i] = o.waterTier;
  if (o.road !== undefined) eng.road[i] = o.road;
  if (o.owner !== undefined) eng.owner[i] = o.owner;
  if (o.radiate !== undefined) eng.radiate[i] = o.radiate;
  if (o.snowman !== undefined) eng.snowman[i] = o.snowman;
}

// ---------------- 动态种族注册（RACES 追加；dump 与执行同源） ----------------
let dynSeq = 9100;
function regDyn(sprite, genome, flags = {}) {
  const id = ++dynSeq;
  const def = {
    key: 'dyn_' + id, name: 'DynRace' + id, isCiv: false, hostile: false, predator: false,
    undead: false, lavaImmune: false, sprite, maxAge: flags.maxAge ?? 9999,
    aquatic: !!flags.aquatic, flying: !!flags.flying, sandswim: !!flags.sandswim, vis: genome,
  };
  RACES[id] = def;
  return { id, dump: { sprite, aquatic: def.aquatic ? 1 : 0, sandswim: def.sandswim ? 1 : 0, flying: def.flying ? 1 : 0, maxAge: def.maxAge, vis: JSON.stringify(genome) } };
}

// ---------------- 单位场景（gen-render5 同款；rdefs 注入 dump） ----------------
const unitScen = [];
function unitScenario(name, opt) {
  const eng = segEng();
  baseField(eng);
  if (opt.civs) for (const c of opt.civs) eng.civs[c.id] = { id: c.id, color: c.color, colorHex: c.colorHex, alive: c.alive !== false };
  const ux = opt.x ?? 30, uy = opt.y ?? 20;
  const u = {
    id: 1, name: 'U', race: opt.race ?? 0, civ: opt.civ ?? -1,
    x: ux, y: uy, rx: opt.rx, ry: opt.ry, dpx: opt.dpx, dpy: opt.dpy,
    flip: opt.flip ? 1 : 0, lx: opt.lx, ly: opt.ly, wep: opt.wep ?? null, atk: opt.atk ?? 0,
    trait: opt.trait ?? null, age: opt.age ?? 20, hurt: opt.hurt ?? 0,
    hp: opt.hp ?? 60, maxHp: opt.maxHp ?? 60, panic: opt.panic, boat: opt.boat ? 1 : 0,
    caravan: opt.caravan ?? 0, king: opt.king ? 1 : 0, dead: 0, job: 0,
  };
  eng.units.push(u);
  if (opt.terrainAt !== undefined) setTile(eng, idx(ux, uy), { t: opt.terrainAt, waterTier: 0 });
  eng.cam = { x: opt.camX ?? ux, y: opt.camY ?? uy, zoom: opt.zoom ?? 4 };
  eng.frameCount = opt.fc ?? 1000;
  eng.fxPrefs = { fxDensity: 1, ambience: false, riverFlow: false, dayNight: !!opt.dayNight, hpBars: !!opt.hpBars, battleFlash: false, blood: true, corpses: true, dmgNumbers: true };
  eng.selectedId = opt.selected ? 1 : 0;
  const screen = mkCanvas(1024, 640).getContext();
  const n0 = eng.worldCtx.ops.length;
  renderMod.render(eng, screen, 1024, 640);
  unitScen.push({
    name,
    rdefs: opt.rdefs ?? null,
    in: {
      cam: { x: f64hex(eng.cam.x), y: f64hex(eng.cam.y), zoom: f64hex(eng.cam.zoom) },
      cw: 1024, ch: 640, frameCount: eng.frameCount,
      fxPrefs: { dayNight: !!opt.dayNight, hpBars: !!opt.hpBars },
      selectedId: eng.selectedId,
      civs: opt.civs ?? null,
      terrainAt: eng.terrain[idx(ux, uy)],
      units: [u].map((q) => ({
        id: q.id, race: q.race, civ: q.civ, x: f64hex(q.x), y: f64hex(q.y),
        rx: q.rx === undefined ? null : f64hex(q.rx), ry: q.ry === undefined ? null : f64hex(q.ry),
        dpx: q.dpx === undefined ? null : f64hex(q.dpx), dpy: q.dpy === undefined ? null : f64hex(q.dpy),
        flip: q.flip, lx: q.lx === undefined ? null : f64hex(q.lx), ly: q.ly === undefined ? null : f64hex(q.ly),
        wep: q.wep ?? null, atk: f64hex(q.atk ?? 0), trait: q.trait ?? null, age: q.age,
        hurt: q.hurt, hp: f64hex(q.hp), maxHp: f64hex(q.maxHp), panic: q.panic === undefined || q.panic === null ? null : f64hex(q.panic),
        boat: q.boat, caravan: q.caravan, king: q.king,
      })),
    },
    ops: dumpOpRange(eng.worldCtx, n0),
  });
}

const CIV0 = { id: 0, color: [59, 125, 216], colorHex: '#3b7dd8' };

// ============================================================
// 基因组（真实现 visFromGene/mutateVis 链 + 手写钳制边界）
// ============================================================
const rngA = mulberry32(0x7c11e5);
const gA = visFromGene(3, { s: 1, d: 1.3, h: 1.15, r: 1 }, rngA);          // 高杀伤根预设（有角有刺域）
const gB = mutateVis(mutateVis(gA, 3, rngA, 1), 3, rngA, 1);               // 二代漂移
const gC = visFromGene(7, { s: 0.9, d: 1.1, h: 1, r: 1.2 }, rngA);         // 低杀根预设
const gClamp = { root: 1, hue: 40, lum: 1.28, size: 1.45, bulk: 1, horns: 2, spikes: 1, mane: 0, tail: 1, ears: 1, glow: 1, pattern: 2, crest: 1 }; // 钳制+双门边界

// ============================================================
// E 组：creature（mShape=null → DrawEmergentCreature）
// ============================================================
{
  const r1 = regDyn('wolf', gA);
  unitScenario('E01_creature_wolf_z6', { race: r1.id, zoom: 6, rdefs: { [r1.id]: r1.dump } });
}
{
  const r = regDyn('wolf', gB);
  unitScenario('E02_creature_wolf_z2', { race: r.id, zoom: 2, rdefs: { [r.id]: r.dump } });   // 色点档 !def.vis 落全绘涌现
}
{
  const r = regDyn('wolf', gC);
  unitScenario('E03_creature_wolf_z4', { race: r.id, zoom: 4, rdefs: { [r.id]: r.dump } });   // 中档 !def.vis 落全绘涌现
}
{
  const r = regDyn('wolf', gClamp);
  unitScenario('E04_creature_wolf_z9', { race: r.id, zoom: 9, rdefs: { [r.id]: r.dump } });   // 精绘 quad&&!vis 不中 → 涌现全绘（钳制+glow+pattern2 边界）
}
{
  const r = regDyn('wolf', gA);
  unitScenario('E05_creature_king', { race: r.id, zoom: 6, king: 1, rdefs: { [r.id]: r.dump } });
}
{
  const r = regDyn('wolf', gB);
  unitScenario('E06_creature_hurt_flip', { race: r.id, zoom: 6, hurt: 5, flip: 1, rdefs: { [r.id]: r.dump } });
}
{
  const r = regDyn('wolf', gA);
  unitScenario('E07_creature_gait', { race: r.id, zoom: 6, lx: 29.5, ly: 20, fc: 1008, rdefs: { [r.id]: r.dump } });
}
{
  const r = regDyn('penguin', gC);
  unitScenario('E08_creature_penguin_z6', { race: r.id, zoom: 6, rdefs: { [r.id]: r.dump } });
}
{
  const r = regDyn('wolf', gA);
  unitScenario('E09_creature_shadow', { race: r.id, zoom: 6, dayNight: 1, fc: 480, rdefs: { [r.id]: r.dump } });   // 影子域+涌现共存
}
{
  const r = regDyn('bear', gB);
  unitScenario('E10_creature_bear_age40', { race: r.id, zoom: 6, age: 40, rdefs: { [r.id]: r.dump } });
}

// ============================================================
// M 组：monster（mShape 三态 → DrawEmergentMonster）
// ============================================================
{
  const r = regDyn('penguin', gA, { aquatic: true });
  unitScenario('M01_monster_aquatic', { race: r.id, zoom: 6, rdefs: { [r.id]: r.dump } });
}
{
  const r = regDyn('sandworm', gB, { sandswim: true });
  unitScenario('M02_monster_worm', { race: r.id, zoom: 6, rdefs: { [r.id]: r.dump } });
}
{
  const r = regDyn('basilisk', gA);
  unitScenario('M03_monster_serpent_basilisk', { race: r.id, zoom: 6, rdefs: { [r.id]: r.dump } });
}
{
  const r = regDyn('snake', gB);
  unitScenario('M04_monster_serpent_snake', { race: r.id, zoom: 6, rdefs: { [r.id]: r.dump } });   // static snake 有 LOD——def.vis 跳过
}
{
  const r = regDyn('dragon', gA, { flying: true });
  unitScenario('M05_monster_dragon_fly', { race: r.id, zoom: 6, dayNight: 1, fc: 480, rdefs: { [r.id]: r.dump } });   // flying 影子豁免+涌现
}

// ============================================================
// G 组：门控（person vis 落 switch / fish 离水空流 / fish 在水 creature）
// ============================================================
{
  const r = regDyn('person', gA);
  unitScenario('G01_gate_person_vis', { race: r.id, civ: 0, civs: [CIV0], zoom: 6, rdefs: { [r.id]: r.dump } });   // 涌现跳过 → switch DrawPerson（基因组 root 肤色）
}
{
  const r = regDyn('person', gB);
  unitScenario('G04_gate_person_fine', { race: r.id, civ: 0, civs: [CIV0], zoom: 9, rdefs: { [r.id]: r.dump } });  // 精绘档 person（无 vis 门）→ DrawPersonFine 基因组肤色
}
{
  const r = regDyn('fish', gA, { aquatic: true });
  unitScenario('G02_gate_fish_dry', { race: r.id, zoom: 6, terrainAt: T.GRASS, rdefs: { [r.id]: r.dump } });       // P2 门控 return → 空流
}
{
  const r = regDyn('fish', gB, { aquatic: true });
  unitScenario('G03_gate_fish_water', { race: r.id, zoom: 6, terrainAt: T.WATER, rdefs: { [r.id]: r.dump } });     // 门控过 → creature
}

// ============================================================
// sanity 断言
// ============================================================
let assertN = 0, assertFail = 0;
function ok(cond, msg) { assertN++; if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); } }
function findS(n) { return unitScen.find((s) => s.name === n); }

{
  // 涌现分支确实触发：E01 ops 非空且含 fillRect（DrawEmergentCreature 展开）
  const e1 = findS('E01_creature_wolf_z6');
  ok(e1.ops.length > 0 && e1.ops.some((o) => o.o === 'fillRect'), 'E01 涌现 creature 非空展开');
  // 门控：G02 离水空流（无 fillRect——putImageData 属地形域，判 fillRect 计数）
  const g2 = findS('G02_gate_fish_dry');
  ok(!g2.ops.some((o) => o.o === 'fillRect'), 'G02 离水无单位 op');
  // G03 在水：有 fillRect
  ok(findS('G03_gate_fish_water').ops.some((o) => o.o === 'fillRect'), 'G03 在水有单位 op');
  // person vis 门控：G01 走 DrawPerson（op 流非空）
  ok(findS('G01_gate_person_vis').ops.some((o) => o.o === 'fillRect'), 'G01 person vis 落 switch 有 op');
  // monster 三形态 op 流非空且 creature 与 monster op 数不同（形态差异）
  const m1 = findS('M01_monster_aquatic').ops.filter((o) => o.o === 'fillRect').length;
  const e1f = e1.ops.filter((o) => o.o === 'fillRect').length;
  ok(m1 > 0 && m1 !== e1f, 'M01 aquatic monster 形态差异');
  // E04 钳制边界：非空
  ok(findS('E04_creature_wolf_z9').ops.length > 0, 'E04 精绘落涌现非空');
  // 场景规模：19（E10 + M5 + G4）
  ok(unitScen.length === 19, '场景数 19');
  ok(Object.keys(RACES).filter((k) => Number(k) >= 9101).length === 19, '动态种 19 注册');
}
console.log('[GEN RENDER7] scen=' + unitScen.length);
console.log('[GEN RENDER7] sanity ' + (assertN - assertFail) + '/' + assertN + (assertFail === 0 ? ' PASS' : ' FAIL'));
if (assertFail > 0 && !process.env.WB_GEN7_KEEPFAIL) process.exit(1);

// ---------------- det 双跑（/tmp 文件字节级对比） ----------------
const snap1 = JSON.stringify(unitScen);
const CHILD = process.argv.includes('--detchild');
if (CHILD) {
  mkdirSync('/tmp', { recursive: true });
  writeFileSync('/tmp/wb-det-child7.json', snap1);
  process.exit(0);
}
mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
const outPath = path.join(ROOT, 'scripts/unity-migration/golden/render7.json');
writeFileSync(outPath, JSON.stringify({ meta: { gen: 'gen-render7.mjs', note: 'M-U7c 渲染接线 II 黄金：visCacheFor 接入 UnitScene 动态种族绘制路径（涌现分支/精绘 quad&&!vis 守卫/水生门控/person 门控）' }, scenarios: unitScen }));
const { createHash } = await import('node:crypto');
const { execFileSync } = await import('node:child_process');
const selfPath = fileURLToPath(import.meta.url);
execFileSync(process.execPath, [selfPath, '--detchild'], { stdio: ['ignore', 'ignore', 'inherit'] });
const childSnap = readFileSync('/tmp/wb-det-child7.json', 'utf8');
if (childSnap !== snap1) { console.error('[GEN RENDER7] det 双跑不一致'); process.exit(1); }
console.log('[GEN RENDER7] det 双跑字节级一致 md5=' + createHash('md5').update(snap1).digest('hex'));
console.log('[GEN RENDER7] golden/render7.json ' + (snap1.length / 1024).toFixed(1) + 'KB 快照规模');
console.log('[GEN PASS]');
