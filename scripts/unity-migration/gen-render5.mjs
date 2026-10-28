// gen-render5.mjs — M-U7a 渲染接线 I 黄金向量生成器（WbRender.UnitScene bail→WbSprites 直调对账）
// 真实现 = render.ts render()（单位决策链）直调 sprites.ts 真函数（**不 monkey-patch**——M-U4 bail 契约翻转为完整 op 流展开）
// 蓝本段：render.ts drawUnitSprite L2045（boat/caravan 前置分支/阴影/幼体/tiny/squash）+ drawUnitBody L2206
//         （水面门控/tryDrawFine 精绘/色点/中档 LOD/全绘 switch 26 族/default LOD 色块/金冠）
// 场景：U 组 48 场景重录（gen-render.mjs 同清单——bail 位置展开为 sprites op 序列）+ F 组补测
//       （quadFine 五族 zoom=9 / 全绘 26 族 zoom=6 覆盖含水生门控 tile）
// dump 协议：f64 → u64 bits hex；ops = {o, a:[f64hex…], s:[fillStyle, strokeStyle, lineWidth, globalAlpha]}（全展开无 bails）
// 跑法：node scripts/unity-migration/gen-render5.mjs（jiti 转译；自带 sanity + det 子进程双跑 + [GEN PASS]）
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- 无头垫片：录制版 canvas/ctx（必须在 import engine 之前挂好） ----------------
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
  putImageData(...a) { this._rec('putImageData', []); } // 不录像素数组（地形域非本轮对账面）
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
const { T, DEFAULT_LAWS } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const renderMod = await jiti.import(path.join(ROOT, 'src/lib/game/render.ts'));

const W = 256, H = 160;
const idx = (x, y) => y * W + x;

function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
// ops 切片 [n0..]（无 bail——sprites 直调全展开；style 按 op 消费归一化）
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

// ---------------- 引擎（每段一个，场景间 reset） ----------------
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

// ---------------- 单位场景（bail 翻转：sprites.ts 真函数直调，op 全展开） ----------------
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
  if (opt.u2) eng.units.push({ ...u, id: 2, x: opt.u2.x, y: opt.u2.y, race: opt.u2.race ?? u.race });
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
    in: {
      cam: { x: f64hex(eng.cam.x), y: f64hex(eng.cam.y), zoom: f64hex(eng.cam.zoom) },
      cw: 1024, ch: 640, frameCount: eng.frameCount,
      fxPrefs: { dayNight: !!opt.dayNight, hpBars: !!opt.hpBars },
      selectedId: eng.selectedId,
      civs: opt.civs ?? null,
      terrainAt: eng.terrain[idx(ux, uy)],
      units: [u, ...(opt.u2 ? [{ ...u, id: 2, x: opt.u2.x, y: opt.u2.y, race: opt.u2.race ?? u.race }] : [])].map((q) => ({
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
const WATER = { id: 1, color: [120, 80, 200], colorHex: '#7850c8' };

// —— U 组 48 场景重录（gen-render.mjs 同清单；bail 位置展开为 sprites op 序列）——
unitScenario('U01_person_mid', { civ: 0, civs: [CIV0], zoom: 4 });
unitScenario('U02_person_mid_flip', { civ: 0, civs: [CIV0], zoom: 4, flip: 1 });
unitScenario('U03_person_gait_a', { civ: 0, civs: [CIV0], zoom: 4, lx: 29.5, ly: 20, fc: 1000 });
unitScenario('U04_person_gait_b', { civ: 0, civs: [CIV0], zoom: 4, lx: 29.5, ly: 20, fc: 1008 });
unitScenario('U05_person_musket_raise', { civ: 0, civs: [CIV0], zoom: 4, wep: 'musket', atk: 5 });
unitScenario('U06_person_sword_low', { civ: 0, civs: [CIV0], zoom: 4, wep: 'sword', atk: 0 });
unitScenario('U07_person_king', { civ: 0, civs: [CIV0], zoom: 4, king: 1 });
unitScenario('U08_person_hurt', { civ: 0, civs: [CIV0], zoom: 4, hurt: 5 });
unitScenario('U09_person_dead_civ', { civ: 0, civs: [{ id: 0, color: [59, 125, 216], colorHex: '#3b7dd8', alive: false }], zoom: 4 });
unitScenario('U10_sheep_mid_hurt', { race: 6, civ: -1, zoom: 4, hurt: 3 });
unitScenario('U11_bear_mid_gait', { race: 8, civ: -1, zoom: 4, lx: 29.5, ly: 20, fc: 1000 });
unitScenario('U12_snake_mid_flip', { race: 14, civ: -1, zoom: 4, flip: 1 });
unitScenario('U13_penguin_mid', { race: 11, civ: -1, zoom: 4 });
unitScenario('U14_dot_person_civ', { civ: 0, civs: [CIV0], zoom: 2 });
unitScenario('U15_dot_person_king', { civ: 0, civs: [CIV0], zoom: 2, king: 1 });
unitScenario('U16_dot_animal_hurt', { race: 6, civ: -1, zoom: 2, hurt: 2 });
unitScenario('U17_person_fine_bail', { civ: 0, civs: [CIV0], zoom: 9 });
unitScenario('U18_sheep_fine_bail', { race: 6, civ: -1, zoom: 9 });
unitScenario('U19_person_full_bail', { civ: 0, civs: [CIV0], zoom: 6 });
unitScenario('U20_sheep_full_bail', { race: 6, civ: -1, zoom: 6 });
unitScenario('U21_boat_bail', { civ: 0, civs: [CIV0], zoom: 4, boat: 1 });
unitScenario('U22_caravan_bail', { civ: 0, civs: [CIV0], zoom: 4, caravan: 1 });
unitScenario('U23_shadow_noon', { civ: 0, civs: [CIV0], zoom: 4, dayNight: 1, fc: 480 });
unitScenario('U24_shadow_dusk_long', { civ: 0, civs: [CIV0], zoom: 4, dayNight: 1, fc: 1104 });
unitScenario('U25_shadow_off', { civ: 0, civs: [CIV0], zoom: 4, dayNight: 0 });
unitScenario('U26_shadow_dragon_fly', { race: 9, civ: -1, zoom: 4, dayNight: 1, fc: 480 });
unitScenario('U27_shadow_giant_exempt', { civ: 0, civs: [CIV0], zoom: 4, dayNight: 1, fc: 480, trait: 'giant' });
unitScenario('U28_tiny_scale', { civ: 0, civs: [CIV0], zoom: 4, trait: 'tiny' });
unitScenario('U29_juvenile_person', { civ: 0, civs: [CIV0], zoom: 4, age: 2 });
unitScenario('U30_juvenile_sheep', { race: 6, civ: -1, zoom: 4, age: 2 });
unitScenario('U31_squash_hurt20', { civ: 0, civs: [CIV0], zoom: 4, hurt: 20 });
unitScenario('U32_fish_on_land_skip', { race: 37, civ: -1, zoom: 4, terrainAt: T.GRASS });
unitScenario('U33_fish_in_water_lod', { race: 37, civ: -1, zoom: 4, terrainAt: T.WATER });
unitScenario('U33b_fish_full_bail', { race: 37, civ: -1, zoom: 6, terrainAt: T.WATER });
unitScenario('U34_crab_on_sand', { race: 38, civ: -1, zoom: 4, terrainAt: T.SAND });
unitScenario('U35_turtle_on_land_skip', { race: 39, civ: -1, zoom: 4, terrainAt: T.GRASS });
unitScenario('U36_hpbar_green', { civ: 0, civs: [CIV0], zoom: 6, hpBars: 1, hp: 48, maxHp: 60 });
unitScenario('U37_hpbar_yellow', { civ: 0, civs: [CIV0], zoom: 6, hpBars: 1, hp: 18, maxHp: 60 });
unitScenario('U38_hpbar_red', { civ: 0, civs: [CIV0], zoom: 6, hpBars: 1, hp: 6, maxHp: 60 });
unitScenario('U39_hpbar_zoomgate', { civ: 0, civs: [CIV0], zoom: 4, hpBars: 1, hp: 30, maxHp: 60 });
unitScenario('U40_panic_amber', { civ: 0, civs: [CIV0], zoom: 6, panic: 0.6 });
unitScenario('U41_panic_red_blink_on', { civ: 0, civs: [CIV0], zoom: 6, panic: 0.8, fc: 997 });
unitScenario('U42_panic_red_blink_off', { civ: 0, civs: [CIV0], zoom: 6, panic: 0.8, fc: 1002 });
unitScenario('U43_panic_with_hpbar', { civ: 0, civs: [CIV0], zoom: 6, panic: 0.6, hpBars: 1, hp: 20, maxHp: 60 });
unitScenario('U44_selected_person', { civ: 0, civs: [CIV0], zoom: 4, selected: 1 });
unitScenario('U45_selected_boat', { civ: 0, civs: [CIV0], zoom: 4, selected: 1, boat: 1 });
unitScenario('U46_cull_outside', { civ: 0, civs: [CIV0], zoom: 4, x: 200, y: 120, camX: 30, camY: 20 });
unitScenario('U47_two_units_order', { civ: 0, civs: [CIV0], zoom: 4, u2: { x: 32, y: 21, race: 6 } });

// —— F 组补测：quadFine 五族 zoom=9（U18 只覆盖 sheep）——
unitScenario('F01_wolf_fine', { race: 7, civ: -1, zoom: 9 });
unitScenario('F02_snowwolf_fine', { race: 15, civ: -1, zoom: 9 });
unitScenario('F03_bear_fine', { race: 8, civ: -1, zoom: 9 });
unitScenario('F04_deer_fine', { race: 10, civ: -1, zoom: 9 });
// —— F 组补测：全绘 26 族 zoom=6（U19 只覆盖 person；水生给 WATER/crab 给 SAND tile）——
unitScenario('F05_wolf_full', { race: 7, civ: -1, zoom: 6 });
unitScenario('F06_snowwolf_full', { race: 15, civ: -1, zoom: 6 });
unitScenario('F07_bear_full', { race: 8, civ: -1, zoom: 6 });
unitScenario('F08_deer_full', { race: 10, civ: -1, zoom: 6 });
unitScenario('F09_dragon_full', { race: 9, civ: -1, zoom: 6 });
unitScenario('F10_penguin_full', { race: 11, civ: -1, zoom: 6 });
unitScenario('F11_camel_full', { race: 12, civ: -1, zoom: 6 });
unitScenario('F12_scorpion_full', { race: 13, civ: -1, zoom: 6 });
unitScenario('F13_snake_full', { race: 14, civ: -1, zoom: 6 });
unitScenario('F14_skeleton_full', { race: 16, civ: -1, zoom: 6 });
unitScenario('F15_demon_full', { race: 17, civ: -1, zoom: 6 });
unitScenario('F16_angel_full', { race: 28, civ: -1, zoom: 6 });
unitScenario('F17_phoenix_full', { race: 29, civ: -1, zoom: 6 });
unitScenario('F18_ent_full', { race: 30, civ: -1, zoom: 6 });
unitScenario('F19_lich_full', { race: 31, civ: -1, zoom: 6 });
unitScenario('F20_hydra_full', { race: 32, civ: -1, zoom: 6 });
unitScenario('F21_mage_full', { race: 18, civ: -1, zoom: 6 });
unitScenario('F22_troll_full', { race: 21, civ: -1, zoom: 6 });
unitScenario('F23_ogre_full', { race: 22, civ: -1, zoom: 6 });
unitScenario('F24_whitewalker_full', { race: 23, civ: -1, zoom: 6 });
unitScenario('F25_vampire_full', { race: 24, civ: -1, zoom: 6 });
unitScenario('F26_kraken_full', { race: 25, civ: -1, zoom: 6, terrainAt: T.WATER });
unitScenario('F27_sandworm_full', { race: 26, civ: -1, zoom: 6 });
unitScenario('F28_basilisk_full', { race: 27, civ: -1, zoom: 6 });
unitScenario('F29_chicken_full', { race: 33, civ: -1, zoom: 6 });
unitScenario('F30_pig_full', { race: 34, civ: -1, zoom: 6 });
unitScenario('F31_rabbit_full', { race: 35, civ: -1, zoom: 6 });
unitScenario('F32_fox_full', { race: 36, civ: -1, zoom: 6 });
unitScenario('F33_fish_full_water', { race: 37, civ: -1, zoom: 6, terrainAt: T.WATER });
unitScenario('F34_crab_full_sand', { race: 38, civ: -1, zoom: 6, terrainAt: T.SAND });
unitScenario('F35_turtle_full_water', { race: 39, civ: -1, zoom: 6, terrainAt: T.WATER });
unitScenario('F36_shark_full_water', { race: 40, civ: -1, zoom: 6, terrainAt: T.DEEP });
unitScenario('F37_boat_king', { civ: 0, civs: [CIV0], zoom: 6, boat: 1, king: 1 });
unitScenario('F38_caravan_civ2', { civ: 0, civs: [CIV0, { id: 1, color: [200, 120, 40], colorHex: '#c87828' }], zoom: 6, caravan: 1, civ: 1 });
unitScenario('F39_person_fine_king_wep', { civ: 0, civs: [CIV0], zoom: 9, king: 1, wep: 'bow1', atk: 3 });
unitScenario('F40_person_full_hurt_flip', { civ: 0, civs: [CIV0], zoom: 6, hurt: 4, flip: 1 });

// ---------------- sanity 断言 ----------------
let assertN = 0, assertFail = 0;
function ok(cond, msg) {
  assertN++;
  if (!cond) { assertFail++; console.error('  [SANITY FAIL]', msg); }
}
function nRect(s) { return s.ops.filter((o) => o.o === 'fillRect').length; }
function findS(list, name) { const s = list.find((x) => x.name === name); if (!s) throw new Error('missing scenario ' + name); return s; }
{
  const fin = findS(unitScen, 'U17_person_fine_bail');
  ok(fin.ops.some((o) => o.o === 'save') && fin.ops.some((o) => o.o === 'scale'), 'U17 精绘 save/scale 包裹');
  ok(nRect(fin) > 20, `U17 personFine 展开 op>20 got ${nRect(fin)}`);
  const boat = findS(unitScen, 'U21_boat_bail');
  ok(nRect(boat) > 5, `U21 boat 展开 op>5 got ${nRect(boat)}`);
  const full = findS(unitScen, 'U19_person_full_bail');
  ok(nRect(full) >= 10, `U19 person 全绘展开 op>=10 got ${nRect(full)}`);
  const drg = findS(unitScen, 'F09_dragon_full');
  ok(nRect(drg) > 3, `F09 dragon 全绘展开 op>3 got ${nRect(drg)}`);
  const krk = findS(unitScen, 'F26_kraken_full');
  ok(nRect(krk) > 3, `F26 kraken 全绘展开 op>3 got ${nRect(krk)}`);
  const skip = findS(unitScen, 'U32_fish_on_land_skip');
  ok(nRect(skip) === 0, 'U32 鱼离水门控 0 rect');
  const fineWolf = findS(unitScen, 'F01_wolf_fine');
  ok(fineWolf.ops.some((o) => o.o === 'scale' && o.a[0] === '000000000000e03f'), 'F01 wolf quadFine scale 0.5（hex）');
  const mid = findS(unitScen, 'U01_person_mid');
  ok(nRect(mid) === 6, `U01 中档人形 6 rect got ${nRect(mid)}`);
  const dot = findS(unitScen, 'U14_dot_person_civ');
  ok(nRect(dot) === 2, `U14 色点档 2 rect（软阴影+色点）got ${nRect(dot)}`);
}

// ---------------- det 双跑（子进程隔离） ----------------
const isDetChild = process.argv.includes('--det-child');
function jsonOf() {
  return JSON.stringify({ meta: { gen: 'gen-render5.mjs' }, scenarios: unitScen });
}
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  if (isDetChild) {
    const outN = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? '1';
    const { writeFileSync: wf } = await import('node:fs');
    wf(`/tmp/render5-det${outN}.json`, jsonOf());
    process.exit(0);
  }
  const { spawnSync } = await import('node:child_process');
  const self = path.resolve(process.argv[1]);
  const r1 = spawnSync(process.execPath, [self, '--det-child', '--out=1'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const r2 = spawnSync(process.execPath, [self, '--det-child', '--out=2'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  if (r1.status !== 0 || r2.status !== 0) { console.log('[det] child fail', (r1.stderr || '').slice(-400), (r2.stderr || '').slice(-400)); process.exit(1); }
  const { readFileSync: rf } = await import('node:fs');
  const j1 = rf('/tmp/render5-det1.json', 'utf8'), j2 = rf('/tmp/render5-det2.json', 'utf8');
  const { createHash } = await import('node:crypto');
  const m1 = createHash('md5').update(j1).digest('hex');
  const m2 = createHash('md5').update(j2).digest('hex');
  const detOk = m1 === m2;
  console.log(`[det] md5=${m1} ${detOk ? '==' : '!='} ${m2}`);
  const run1 = JSON.parse(j1).scenarios;
  const byName = new Map(run1.map((s) => [s.name, s]));
  for (const a of [9, 9, 9, 9, 9, 9, 9, 9, 9]) {} // noop 占位
  // sanity 重跑（用 det 子进程产物校验一致性）
  let sFail = 0;
  const asserts = [];
  const A = (cond, msg) => { if (!cond) { sFail++; console.error('  [SANITY FAIL]', msg); } asserts.push(cond); };
  {
    const fin = findS(run1, 'U17_person_fine_bail');
    A(fin.ops.some((o) => o.o === 'save') && fin.ops.some((o) => o.o === 'scale'), 'U17 精绘 save/scale 包裹');
    A(nRect(fin) > 20, `U17 op>20 got ${nRect(fin)}`);
    const boat = findS(run1, 'U21_boat_bail');
    A(nRect(boat) > 5, `U21 op>5 got ${nRect(boat)}`);
    const full = findS(run1, 'U19_person_full_bail');
    A(nRect(full) >= 10, `U19 op>=10 got ${nRect(full)}`);
    const drg = findS(run1, 'F09_dragon_full');
    A(nRect(drg) > 3, `F09 op>3 got ${nRect(drg)}`);
    const krk = findS(run1, 'F26_kraken_full');
    A(nRect(krk) > 3, `F26 op>3 got ${nRect(krk)}`);
    const skip = findS(run1, 'U32_fish_on_land_skip');
    A(nRect(skip) === 0, 'U32 门控 0 rect');
    const fineWolf = findS(run1, 'F01_wolf_fine');
    A(fineWolf.ops.some((o) => o.o === 'scale' && o.a[0] === '000000000000e03f'), 'F01 quadFine scale 0.5（hex）');
    const mid = findS(run1, 'U01_person_mid');
    A(nRect(mid) === 6, `U01 6 rect got ${nRect(mid)}`);
    const dot = findS(run1, 'U14_dot_person_civ');
    A(nRect(dot) === 2, `U14 2 rect got ${nRect(dot)}`);
  }
  console.log(`[sanity] ${asserts.length - sFail}/${asserts.length} PASS (主进程 ${assertN - assertFail}/${assertN})`);
  const gold = {
    meta: {
      gen: 'gen-render5.mjs',
      slice: 'M-U7a 渲染接线 I（UnitScene bail→WbSprites 直调全展开）',
      bluebook: 'render.ts drawUnitSprite L2045 + drawUnitBody L2206 + tryDrawFine L2178 + 全绘 switch L2333',
      W, H,
    },
    scenarios: run1,
  };
  mkdirSync(path.join(ROOT, 'scripts/unity-migration/golden'), { recursive: true });
  mkdirSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden'), { recursive: true });
  const fp = path.join(ROOT, 'scripts/unity-migration/golden/render5.json');
  writeFileSync(fp, JSON.stringify(gold));
  writeFileSync(path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/render5.json'), JSON.stringify(gold));
  console.log(`[gen] written ${fp} (${(JSON.stringify(gold).length / 1024).toFixed(1)}KB) scenarios=${run1.length}`);
  if (!detOk || sFail) { console.log(`[GEN FAIL] det=${detOk} sanity=${sFail}`); process.exit(1); }
  console.log('[GEN PASS]');
}
export { unitScen, unitScenario, segEng, baseField, setTile, mkCanvas, dumpOpRange, f64hex };
