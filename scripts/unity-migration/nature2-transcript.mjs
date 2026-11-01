// ============================================================================
// nature2-transcript.mjs —— M-U18「大气风暴域」零引擎镜像（纪律②链三）
//   蓝本 nature.ts：atmTick L423-625 / pressureTick L629-662 / stormTick
//   L665-778 / hydroTick L1062-1091 + cellStats L404-420 + STORM_NAME_AT
//   L25-27 + windAt L356-420 + cellOf L350-354 + season L160-164 + itczLat
//   L336-341 + engine.ts natureLightning L10546-10558 / stormRavage
//   L10602-10642 / rainFireProbe L10645-10658 / rainRegrow L10660-10671 /
//   natureFlood L10673-10693 / spawnTornado L10725-10731 / drought L10823-10830 /
//   sandstorm L10972-10979 / carveRiver L12312-12415 / carveLake L12394-12411 /
//   setTerrain L975-1013 全级联 / attackBuilding L4452-4467 / destroyBuilding /
//   fx L9781-9799 / markDirty / waterTierAt / refreshWaterTierAround。
//   零 engine import：全机械重写 + golden fixture 注入（soil0 含 worldgen 派生面）。
//   数学面：Math.cos/sin/hypot/exp（bun 同源——gen 端 bun 口径一致）。
//   红证双旋钮：N2_RED=atm（禁 rainCell 落雨写）→ 雨/雷/天幕场景 FAIL；
//              N2_RED=storm（禁 stormRavage）→ 肆虐场景 FAIL → 还原复绿。
// 运行：bun scripts/unity-migration/nature2-transcript.mjs（bun 口径）
// ============================================================================
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const N2_RED = process.env.N2_RED || null;

// ---- 常量（constants.ts/types.ts 机械面） ----
const W = 256, H = 160, N = W * H, AW = 32, AH = 20, CELL = 8;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const R_PENGUIN = 11, R_SNOWWOLF = 15, R_WHITEWALKER = 23;
const idx = (x, y) => y * W + x;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const STORM_NAMES = ['海燕', '山竹', '天鸽', '榴莲', '白鹿', '烟花', '梅花', '轩岚', '玉兔', '木兰', '杜鹃', '海棠', '悟空', '电母', '海神', '冥河', '飓父', '霜牙', '凛冬', '雪龙'];   // nature.ts L25
const STORM_NAME_AT = (id) => STORM_NAMES[Math.min(STORM_NAMES.length - 1, Math.max(0, id) % STORM_NAMES.length)];   // L27（先取模后钳位）
const COLD_BLOOD = new Set([13, 14, 19, 27, 32, 39]);   // types.ts SCORPION/SNAKE/LIZARD/BASILISK/HYDRA/TURTLE（RDEF coldBlood 面）
const FLYING = new Set([9, 28, 29]);   // DRAGON L166/ANGEL L188/PHOENIX L189——RelayDef flying=true 全三族（stormRavage L10608 消费）

// ---- 工具 ----
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64'));
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const f32md5 = (f32) => md5hex(new Uint8Array(f32.buffer.slice(0)));
function f64hex(v) { const b = Buffer.alloc(8); b.writeDoubleLE(v, 0); return b.toString('hex'); }
function f64of(hex) { return Buffer.from(hex, 'hex').readDoubleLE(0); }
function u16md5(list) { const u = new Uint16Array(list.length); for (let k = 0; k < list.length; k++) u[k] = list[k]; return md5hex(new Uint8Array(u.buffer)); }
function mulberry32(a) {   // noise.ts mulberry32 机械面（rngA 主链）
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, seed) {               // noise.ts L14-19 机械重写（nature-transcript M-U17 验证绿版对拷）
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function valueNoise(x, y, seed) {          // noise.ts L25-33 机械重写（权威版对拷）
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const v00 = hash2(xi, yi, seed), v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed), v11 = hash2(xi + 1, yi + 1, seed);
  const sx = smooth(xf), sy = smooth(yf);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}

// ---- 引擎零引擎镜像（Nat2Eng） ----
class Nat2Eng {
  constructor(sc) {
    const fx = sc.fixture;
    this.baseSeed = sc.baseSeed;
    this.natureSeed = sc.baseSeed;
    this.rngA = 0;
    this.tickCount = sc.tickCount;
    this.frameCount = fx.frameCount0;
    this.yearF = fx.yearF0;
    this.camX = fx.camX0 ?? W / 2; this.camY = fx.camY0 ?? H / 2;
    this.shake = 0;
    this.statNukes = 0;
    this.eventSeq = 1;
    this.laws = { seasons: sc.laws.seasons, tectonics: sc.laws.tectonics, atmosphere: sc.laws.atmosphere, naturalDisasters: sc.laws.disasters };
    // 世界面（fixture 注入）
    this.terrain = gunzip(fx.terrain0);
    this.building = gunzip(fx.building0);
    this.soilF = gunzip(fx.soil0);
    this.road = new Uint8Array(N);
    this.owner = new Int16Array(N).fill(-1);
    this.waterTier = new Uint8Array(N);   // gen 端 waterTier 未固化（手术清零面——refreshWaterTierAround 局部重建）
    this.riverDir = new Uint8Array(N);
    for (const [i, v] of fx.riverDir0 ?? []) this.riverDir[i] = v;
    this.riverTiles = new Set();
    this.riverTilesList = [];
    this.fire = new Uint8Array(N);
    this.fireSet = new Set();
    this.fireSetList = [];
    for (const [i, v] of fx.fire0 ?? []) { this.fire[i] = v; this.fireSet.add(i); this.fireSetList.push(i); }
    this.frozen = new Set();
    this.flood = new Map();
    this.wet = new Map();
    this.regrow = new Map();
    this.dirty = new Set();
    this.propsDirty = new Set();
    this.radiate = new Uint8Array(N);
    this.radSet = new Map();
    this.glacier = new Uint8Array(N);
    this.effects = [];
    this.worldEvents = [];
    this.buildings = [];
    this.bIdx = new Map();
    this.bHp = new Map();
    this.damagedSet = new Set();
    {
      const bb = gunzip(fx.building0);
      for (let k = 0; k < bb.length; k++) if (bb[k]) { this.bIdx.set(k, this.buildings.length); this.buildings.push({ i: k, x: k % W, y: (k / W) | 0, kind: bb[k], civ: -1, hp: 10 }); }
    }
    this.units = [];
    for (const uo of fx.units0) {
      this.units.push({ id: uo.id, race: uo.race, civ: -1, x: uo.x, y: uo.y, hp: uo.hp, maxHp: uo.maxHp, hurtN: null, dead: 0, boat: uo.boat ?? 0, chill: 0, name: 'u' + uo.id });
    }
    // 板块域基座（M-U17 注入面）
    this.plateN = fx.plateN0;
    this.plate = gunzip(fx.plate0);
    this.stress = new Float32Array(Uint8Array.from(gunzip(fx.stress0)).buffer);
    this.plateCx = fx.plateC0.slice(0, this.plateN).map(f64of);
    this.plateCy = fx.plateC0.slice(this.plateN).map(f64of);
    this.drift = fx.drift0.map((h) => { const b = Buffer.from(h, 'hex'); return { dx: b.readDoubleLE(0), dy: b.readDoubleLE(8) }; });
    this.boundary = new Set();
    {
      const bb = gunzip(fx.boundary0);
      const u16 = new Uint16Array(bb.buffer, bb.byteOffset, bb.byteLength >> 1);
      for (let k = 0; k < u16.length; k++) this.boundary.add(u16[k]);
    }
    this.hotspots = fx.hotXY0.map(([x, y], k) => ({ x, y, heat: f64of(fx.heat0[k] ?? '0000000000000000') }));
    this.plateEpoch = 0;
    this.lastSeason = -1;
    this.seasonOffset = fx.seasonOffset0 ?? 0;
    this.natCounters = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.rqX = []; this.rqY = []; this.rqM = []; this.rqYear = [];
    this.lastCatastropheX = 0; this.lastCatastropheY = 0; this.lastCatastropheTick = 0;
    // —— M-U18 大气域状态（fixture 注入） ——
    this.moist = new Float32Array(Uint8Array.from(gunzip(fx.moist0)).buffer);
    this.ashF = new Float32Array(Uint8Array.from(gunzip(fx.ashF0)).buffer);
    this.floodAcc = new Float32Array(Uint8Array.from(gunzip(fx.floodAcc0)).buffer);
    this.sstAnom = new Float32Array(Uint8Array.from(gunzip(fx.sst0)).buffer);
    this.prevRain = gunzip(fx.prevRain0);
    this.rainCell = gunzip(fx.rainCell0);
    this.windPhase = f64of(fx.windPhase0);
    this.boltCool = fx.boltCool0 ?? 0;
    this.boltChronDone = false; this.tSnowChronDone = false;
    this.lightningN = 0;
    this.rainbowX = -1; this.rainbowY = -1; this.rainbowTTL = fx.rainbowTTL0 ?? 0; this.rainbowCool = fx.rainbowCool0 ?? 0;
    this.rainbowMoon = false; this.rainbowChronDone = false; this.moonChronDone = false;
    this.meteorX = -1; this.meteorY = -1; this.meteorDx = 0.7; this.meteorDy = 0.5;
    this.meteorTTL = fx.meteorTTL0 ?? 0; this.meteorCool = fx.meteorCool0 ?? 0;
    this.meteorsN = 0; this.meteorChronDone = false;
    this.pSystems = (fx.pSys0 ?? []).map((p) => ({ x: f64of(p[0]), y: f64of(p[1]), kind: f64of(p[2]), str: f64of(p[3]), ttl: f64of(p[4]) }));
    this.storms = (fx.stormR0 ?? []).map((s) => ({ x: f64of(s[0]), y: f64of(s[1]), strength: f64of(s[2]), id: s[3], ttl: s[4], seed: s[5], kind: s[6] === 1 ? 'blizzard' : 'cyclone', landed: s[7] === 1, name: STORM_NAME_AT(s[3]) }));
    this.stormSeq = 1;
    this._tseq = 0;
  }
  _rng() { const v = mulberry32(this.rngA)(); this.rngA = (this.rngA + 0x6d2b79f5) | 0; return v; }
  fx(kind, x, y, ttl, opts) {
    const o = opts ?? {};
    const e = { kind, x, y, ttl, seed: Math.floor(this._rng() * 65536), dir: this._rng() * Math.PI * 2, r: o.r ?? 1, age: 0, x0: o.x0 ?? x, y0: o.y0 ?? y, quiet: o.quiet ?? false, dmg: o.dmg };
    this.effects.push(e);
    return e;
  }
  addEvent(kind, text, opts) {
    const o = opts ?? {};
    this.worldEvents.unshift({ kind, text, colorHex: o.colorHex, x: o.x, y: o.y, id: this.eventSeq++ });
    if (this.worldEvents.length > 80) this.worldEvents.pop();
  }
  toast(text, tone) { if (this.onToast) this.onToast({ id: ++this._tseq, text, tone }); }
  markDirty(i) {
    this.dirty.add(i);
    const x = i % W, y = (i / W) | 0;
    if (x > 0) this.dirty.add(i - 1);
    if (x < W - 1) this.dirty.add(i + 1);
    if (y > 0) this.dirty.add(i - W);
    if (y < H - 1) this.dirty.add(i + W);
  }
  landForDepth(t) { return t !== T.DEEP && t !== T.WATER && t !== T.ICE; }
  waterTierAt(i) {
    const t = this.terrain[i];
    const x = i % W, y = (i / W) | 0;
    if (t === T.DEEP) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (this.terrain[yy * W + xx] === T.WATER) return 3;
      }
      return 4;
    }
    if (t !== T.WATER) return 0;
    for (let r = 1; r <= 3; r++) {
      let land = false;
      for (let dy = -r; dy <= r && !land; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (this.landForDepth(this.terrain[yy * W + xx])) { land = true; break; }
        }
      }
      if (land) return r - 1;
    }
    return 2;
  }
  refreshWaterTierAround(i) {
    const x = i % W, y = (i / W) | 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const tt = this.terrain[j];
        if (tt !== T.WATER && tt !== T.DEEP) continue;
        const tier = this.waterTierAt(j);
        if (this.waterTier[j] !== tier) { this.waterTier[j] = tier; this.dirty.add(j); }
      }
    }
  }
  setTerrain(i, t) {   // setTerrain 级联全镜像（真蓝本 L975-1013）
    const prev = this.terrain[i];
    if (prev === t) return;
    this.terrain[i] = t;
    this.markDirty(i);
    this.propsDirty.add(i);
    this.regrow.delete(i);
    if (prev === T.ICE) this.frozen.delete(i);
    if (t === T.ICE) this.frozen.add(i);
    if (t !== T.WATER) this.flood.delete(i);
    if (t !== T.SAND) this.wet.delete(i);
    if (!(t === T.WATER || t === T.DEEP) && this.riverDir[i] > 0) { this.riverDir[i] = 0; this.riverTiles.delete(i); }
    if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.owner[i] >= 0) { this.owner[i] = -1; this.markDirty(i); }
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.building[i] > 0) this.destroyBuilding(i);
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.road[i] > 0) this.road[i] = 0;
    this.refreshWaterTierAround(i);
  }
  destroyBuilding(i) {
    const bi = this.bIdx.get(i);
    if (bi === undefined) return;
    const b = this.buildings[bi];
    const last = this.buildings.pop();
    if (bi < this.buildings.length) { this.buildings[bi] = last; this.bIdx.set(last.i, bi); }
    this.bIdx.delete(i);
    this.bHp.delete(i);
    this.building[i] = 0;
    this.Fx('smoke', (i % W) + 0.5, ((i / W) | 0) + 0.5, 20);
  }
  attackBuilding(i, dmg) {   // engine L4452-4467 镜像（hit fx 2 掷；摧毁支 smoke 2 掷）
    const kind = this.building[i];
    if (kind === 0) return;
    let hp = this.bHp.get(i) ?? 70;
    hp -= dmg;
    const x = i % W, y = (i / W) | 0;
    if (hp <= 0) this.destroyBuilding(i);
    else { this.bHp.set(i, hp); this.damagedSet.add(i); this.Fx('hit', x + 0.5, y + 0.5, 6); }
  }
  Fx(kind, x, y, ttl, opts) { return this.fx(kind, x, y, ttl, opts); }
  // ---- nature.ts 域 ----
  get season() {   // L160-164
    if (!this.laws.seasons) return 1;
    const s = (Math.floor(this.yearF / 2) + this.seasonOffset) % 4;
    return s < 0 ? s + 4 : s;
  }
  get itczLat() {   // L336-341
    if (!this.laws.seasons) return 0.5;
    const s = this.season;
    return 0.5 + (s === 1 ? 0.062 : s === 0 ? 0.034 : s === 2 ? -0.026 : -0.062);
  }
  cellOf(x, y) {   // L350-354
    const cx = clamp((x / CELL) | 0, 0, AW - 1);
    const cy = clamp((y / CELL) | 0, 0, AH - 1);
    return cy * AW + cx;
  }
  windAt(cx, cy) {   // L356-420（分数格 F64 域——bun Math 同源）
    const lat = cy / (AH - 1);                                        // L357
    const itcz = this.itczLat;                                        // L358
    const latA = Math.abs(lat - itcz) * 2;                             // L359
    let u;                                                             // L361
    if (latA < 0.32) u = -0.55 + latA * 0.9;
    else if (latA < 0.72) u = 0.75 - (latA - 0.32) * 0.35;
    else u = -0.45 + (latA - 0.72) * 1.6;
    const jet = this.season === 3 ? 1.35 : this.season === 1 ? 0.85 : 1;   // L366 jetMul
    const g1 = Math.exp(-((latA - 0.38) * (latA - 0.38)) / 0.005);      // L367
    const g2 = Math.exp(-((latA - 0.62) * (latA - 0.62)) / 0.0098);     // L368
    u += (g1 * 0.55 + g2 * 0.95) * jet;                                 // L369
    const n = valueNoise(cx / 6 + this.windPhase, cy / 6 - this.windPhase * 0.6, this.natureSeed + 313) - 0.5;   // L371-372
    const n2 = valueNoise(cx / 9 - this.windPhase * 0.7, cy / 9 + this.windPhase * 0.4, this.natureSeed + 727) - 0.5;
    u += n * 0.5;                                                       // L373
    let v = n2 * 0.35;                                                  // L374
    for (const ps of this.pSystems) {                                    // L376
      const dx = cx - ps.x / CELL;                                       // L377-378
      const dy = cy - ps.y / CELL;
      const d = Math.hypot(dx, dy);                                       // L379
      if (d < 7 && d > 0.3) {                                             // L380
        const nh = lat < 0.5 ? 1 : -1;                                     // L381
        const sw = (ps.str * 1.35) / (d * 0.8 + 1);                        // L382
        const sgn = ps.kind === 0 ? 1 : -1;                                // L383
        u += (-dy / d) * nh * sw * sgn + (dx / d) * sw * (ps.kind === 0 ? -0.22 : 0.16);   // L384
        v += (dx / d) * nh * sw * sgn + (dy / d) * sw * (ps.kind === 0 ? -0.22 : 0.16);   // L385
      }
    }
    for (const st of this.storms) {                                      // L389
      const sx = st.x / CELL;                                             // L390-391
      const sy = st.y / CELL;
      const dx = cx - sx;                                                 // L392-393
      const dy = cy - sy;
      const d = Math.hypot(dx, dy);                                       // L394
      if (d < 5 && d > 0.4) {                                             // L395
        const pull = (st.strength * 1.6) / (d * d + 1) * 0.8;              // L396
        u += (-dy / d) * pull;                                             // L397
        v += (dx / d) * pull;                                              // L398
      }
    }
    return [u, v];                                                       // L400
  }
  cellStats(cx, cy) {   // L404-420
    let water = 0, elev = 0;
    const x0 = cx * CELL, y0 = cy * CELL;
    for (let y = y0; y < y0 + CELL && y < H; y++) {
      for (let x = x0; x < x0 + CELL && x < W; x++) {
        const t = this.terrain[y * W + x];
        if (t === T.DEEP || t === T.WATER) water++;
        else if (t === T.MOUNTAIN) elev += 3;
        else if (t === T.HILL) elev += 2;
        else if (t === T.LAVA) elev += 3;
        else elev += 1;
      }
    }
    const n = CELL * CELL;
    return { waterFrac: water / n, elev: elev / n };
  }
  soilMulAt(i) { return 0.6 + (this.soilF[i] / 255) * 0.8; }   // worldsim L168-170
  dayPhase() { return (this.frameCount % 2400) / 2400; }        // engine L2672-2674
  rainFireProbe(x0, y0) {   // engine L10645-10658
    for (let k = 0; k < 5; k++) {   // L10646
      const xx = x0 + Math.floor(this._rng() * 8);   // L10647
      const yy = y0 + Math.floor(this._rng() * 8);   // L10648
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L10649
      const i = idx(xx, yy);   // L10650
      if (this.fire[i] > 0) {   // L10651
        this.fire[i] = 0;   // L10652
        this.fireSet.delete(i);   // L10653
        return i;
      }
    }
    return -1;
  }
  rainRegrow(x0, y0) {   // engine L10660-10671
    for (let k = 0; k < 4; k++) {
      const xx = x0 + Math.floor(this._rng() * 8);
      const yy = y0 + Math.floor(this._rng() * 8);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = idx(xx, yy);
      const at = this.regrow.get(i);
      if (at != null) { this.regrow.set(i, Math.max(this.tickCount + 60, at - 160)); return; }
    }
  }
  natureFlood(x, y) {   // engine L10673-10693
    let flooded = 0;
    for (let k = 0; k < 10; k++) {
      const ang = this._rng() * Math.PI * 2;
      const rr = this._rng() * 4.5;
      const xx = Math.floor(x + Math.cos(ang) * rr);
      const yy = Math.floor(y + Math.sin(ang) * rr);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = idx(xx, yy);
      const t = this.terrain[i];
      if ((t === T.GRASS || t === T.SAND || t === T.BURNT) && !this.flood.has(i)) {
        this.setTerrain(i, T.WATER);
        this.flood.set(i, this.tickCount + 180 + Math.floor(this._rng() * 120));
        if (this.building[i] > 0) this.destroyBuilding(i);
        flooded++;
      }
    }
    if (flooded >= 4) this.addEvent('geo', '持续的暴雨漫过了河岸，洼地化作一片泽国', { x, y });
  }
  natureLightning(x, y) {   // engine L10546-10558
    this.fx('bolt', x, y, 10);   // L10548
    for (const u of this.units) {   // L10549
      if (u.dead) continue;   // L10550
      const d = Math.hypot(u.x - x, u.y - y);   // L10551
      if (d < 1.6) {   // L10552
        const mult = COLD_BLOOD.has(u.race) ? 1.4 : 1;   // L10554
        u.hp -= 26 * mult; u.hurtN = 22; if (u.hp <= 0) u.dead = true;   // L10555
      }
    }
  }
  spawnTornado(x, y, count = 1) {   // engine L10725-10731
    const n = Math.max(1, Math.min(6, Math.floor(count)));
    const cur = this.effects.filter((e) => e.kind === 'tornado').length;
    for (let k = 0; k < n; k++) {
      if (cur + k >= 6) break;
      const ox = k === 0 ? 0 : (this._rng() - 0.5) * Math.max(4, n * 2);
      const oy = k === 0 ? 0 : (this._rng() - 0.5) * Math.max(4, n * 2);
      this.fx('tornado', x + ox, y + oy, 340);
    }
  }
  drought(x, y, r, ttl = 200) {   // engine L10823-10830
    const rr = Math.max(5, Math.min(16, r));
    let count = 0;
    for (const e of this.effects) if (e.kind === 'drought') count++;
    if (count >= 4) return;
    this.fx('drought', x, y, ttl, { r: rr });
    this.addEvent('drought', '灼热的旱魃笼罩大地，河流枯竭、草木焦黄', { x, y });
  }
  sandstorm(x, y, r = 5.5, ttl = 280) {   // engine L10972-10979
    let count = 0;
    for (const e of this.effects) if (e.kind === 'sandstorm') count++;
    if (count >= 3) return;
    this.fx('sandstorm', x, y, ttl, { r: Math.max(3, Math.min(12, r)) });
    this.addEvent('sandstorm', '遮天蔽日的沙暴席卷而来，绿意将被黄沙掩埋', { x, y });
  }
  stormRavage(st) {   // engine L10602-10642
    if (st.strength >= 1.1) { this.lastCatastropheX = st.x; this.lastCatastropheY = st.y; this.lastCatastropheTick = this.tickCount; }   // L10603
    const r = 3 + st.strength * 7;   // L10604
    for (const u of this.units) {   // L10606
      if (u.dead || u.boat) continue;   // L10607
      if (FLYING.has(u.race)) continue;   // L10608
      const d = Math.hypot(u.x - st.x, u.y - st.y);   // L10609
      if (d < r) {   // L10610
        const dmg = (st.strength - 0.55) * 7 * (1 - d / r);   // L10611
        if (st.kind === 'blizzard') {   // L10612
          const coldBorn = u.race === R_PENGUIN || u.race === R_SNOWWOLF || u.race === R_WHITEWALKER;   // L10613
          if (!coldBorn) { u.hp -= dmg * 0.6; u.chill = 30; u.hurtN = 12; }   // L10614
        } else {
          u.hp -= dmg;   // L10616
          u.hurtN = 16;   // L10617
        }
        if (u.hp <= 0) u.dead = true;   // L10619
      }
    }
    const rr = Math.ceil(r);   // L10623
    for (let yy = Math.floor(st.y - rr); yy <= st.y + rr; yy++) {   // L10624
      for (let xx = Math.floor(st.x - rr); xx <= st.x + rr; xx++) {   // L10625
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L10626
        const d = Math.hypot(xx + 0.5 - st.x, yy + 0.5 - st.y);   // L10627
        if (d > r) continue;   // L10628
        const i = idx(xx, yy);   // L10629
        const p = 0.028 * (st.strength - 0.55) * (1 - d / r);   // L10630
        if (this.building[i] > 0 && this._rng() < p) this.attackBuilding(i, 14 + st.strength * 22);   // L10631
        const t = this.terrain[i];   // L10632
        if (st.kind === 'blizzard') {   // L10633
          if ((t === T.GRASS || t === T.BURNT) && this._rng() < 0.25) this.setTerrain(i, T.SNOW);   // L10635
          else if (t === T.WATER && this._rng() < 0.15) this.setTerrain(i, T.ICE);   // L10636
        } else if (t === T.FOREST && this._rng() < 0.02 * st.strength) {   // L10637
          this.setTerrain(i, T.GRASS);   // L10638
        }
      }
    }
  }
  pressureTick() {   // nature.ts L629-662
    const cap = 5;   // L631
    if (this.pSystems.length < cap && this._rng() < 0.06) {   // L632
      const isL = this._rng() < 0.55;   // L633
      let lat;   // L634
      if (isL) lat = this._rng() < 0.5 ? this.itczLat + (this._rng() - 0.5) * 0.16 : 0.5 + (this._rng() < 0.5 ? 1 : -1) * (0.24 + this._rng() * 0.1);   // L637
      else lat = this._rng() < 0.7 ? 0.5 + (this._rng() < 0.5 ? 1 : -1) * (0.16 + this._rng() * 0.07) : this._rng() < 0.5 ? 0.06 + this._rng() * 0.05 : 0.89 + this._rng() * 0.05;   // L640
      lat = Math.max(0.03, Math.min(0.97, lat));   // L642
      this.pSystems.push({ x: 8 + this._rng() * (W - 16), y: lat * H, kind: isL ? 0 : 1, str: 0.3 + this._rng() * 0.3, ttl: isL ? 90 + Math.floor(this._rng() * 160) : 150 + Math.floor(this._rng() * 200) });   // L643
    }
    for (let k = this.pSystems.length - 1; k >= 0; k--) {   // L645
      const ps = this.pSystems[k];
      ps.ttl--;   // L647
      const cyy = clamp((ps.y / CELL) | 0, 0, AH - 1);   // L649
      const latA = Math.abs(cyy / (AH - 1) - this.itczLat) * 2;   // L650
      const baseU = latA < 0.32 ? -0.5 : latA < 0.72 ? 0.6 : -0.35;   // L651
      ps.x = Math.max(6, Math.min(W - 6, ps.x + baseU * 2.2 + (this._rng() - 0.5) * 1.6));   // L652
      ps.y = Math.max(6, Math.min(H - 6, ps.y + (this._rng() - 0.5) * 2.2 + (ps.kind === 0 ? (ps.y < H / 2 ? -0.35 : 0.35) : 0)));   // L654
      const stC = this.cellStats(clamp((ps.x / CELL) | 0, 0, AW - 1), cyy);   // L656
      if (ps.kind === 0) ps.str += stC.waterFrac > 0.6 && this.season !== 3 ? 0.006 : -0.004;   // L657
      else ps.str += stC.waterFrac > 0.5 || this.season === 3 ? 0.0018 : -0.0028;   // L658
      ps.str = Math.max(0.15, Math.min(1, ps.str));   // L659
      if (ps.ttl <= 0 || ps.str <= 0.16) this.pSystems.splice(k, 1);   // L660
    }
  }
  atmTick() {   // nature.ts L423-625
    if (!this.laws.atmosphere) {   // L425
      this.prevRain.fill(0);   // L426
      return;   // L427
    }
    if (this.boltCool > 0) this.boltCool -= 10;   // L429
    if (this.rainbowCool > 0) this.rainbowCool -= 10;   // L430
    if (this.meteorCool > 0) this.meteorCool -= 10;   // L431
    this.windPhase += 0.012;   // L432
    const s = this.season;   // L433
    this.pressureTick();   // L435
    {   // L437-454 灰烬平流场
      const nextA = new Float32Array(AW * AH);
      let sum = 0;
      for (let cy = 0; cy < AH; cy++) {
        for (let cx = 0; cx < AW; cx++) {
          const i = cy * AW + cx;
          const [u, v] = this.windAt(cx, cy);
          const sx = clamp(Math.round(cx - u * 1.6), 0, AW - 1);   // L444
          const sy = clamp(Math.round(cy - v * 1.6), 0, AH - 1);   // L445
          let a = this.ashF[i] * 0.9 + this.ashF[sy * AW + sx] * 0.1;   // L446
          a = Math.max(0, a * 0.996 - 0.00028);   // L447
          nextA[i] = Math.min(1, a);   // L448
          sum += nextA[i];   // L449
        }
      }
      this.ashF = nextA;   // L452
      this.ash = sum / (AW * AH);   // L453
    }
    const next = new Float32Array(AW * AH);   // L455
    for (let cy = 0; cy < AH; cy++) {   // L457 蒸发+平流
      for (let cx = 0; cx < AW; cx++) {
        const i = cy * AW + cx;
        const [u, v] = this.windAt(cx, cy);
        const st = this.cellStats(cx, cy);   // L461
        let m = this.moist[i];   // L462
        if (st.waterFrac > 0.5) {   // L464
          const latA = Math.abs(cy / (AH - 1) - this.itczLat) * 2;   // L465
          let evap = (s === 1 ? 0.028 : s === 3 ? 0.012 : 0.02) * (1 + (latA > 0.28 && latA < 0.4 ? 0.3 : 0) + (latA < 0.08 ? 0.25 : 0));   // L466
          if (this.sstAnom[i] > 0) evap *= 1.15;   // L469
          m = Math.min(1, m + evap);   // L470
        }
        const sx = clamp(Math.round(cx - u * 1.6), 0, AW - 1);   // L473
        const sy = clamp(Math.round(cy - v * 1.6), 0, AH - 1);   // L474
        m = m * 0.82 + this.moist[sy * AW + sx] * 0.18;   // L475
        next[i] = m;   // L476
      }
    }
    this.moist = next;   // L479
    this.rainCell.fill(0);   // L481
    for (let cy = 0; cy < AH; cy++) {   // L482 降雨
      for (let cx = 0; cx < AW; cx++) {
        const i = cy * AW + cx;
        const st = this.cellStats(cx, cy);   // L485
        if (st.waterFrac > 0.5 || this.moist[i] <= 0.55) continue;   // L486
        const [u, v] = this.windAt(cx, cy);   // L487
        const nx = clamp(cx + (u > 0 ? 1 : -1), 0, AW - 1);   // L489
        const ny = clamp(cy + (v > 0.15 ? 1 : v < -0.15 ? -1 : 0), 0, AH - 1);   // L490
        const stN = this.cellStats(nx, ny);   // L491
        const orographic = stN.elev > st.elev + 0.5 ? 1.7 : stN.elev < st.elev - 0.5 ? 0.55 : 1;   // L492
        let rain = (this.moist[i] - 0.55) * 0.5 * orographic;   // L493
        if (s === 3) rain *= 0.7;   // L494
        if (Math.abs(cy / (AH - 1) - this.itczLat) < 0.07) rain += 0.045 + this.moist[i] * 0.05;   // L496
        for (const ps of this.pSystems) {   // L498
          if (Math.abs(cx - ps.x / CELL) < 4 && Math.abs(cy - ps.y / CELL) < 4) {   // L499
            const d = Math.hypot(cx - ps.x / CELL, cy - ps.y / CELL);   // L500
            if (d < 4) rain *= ps.kind === 0 ? 1 + ps.str * (1 - d / 4) * 0.9 : 1 - ps.str * (1 - d / 4) * 0.55;   // L501
          }
        }
        if (rain > 0) {   // L504
          this.moist[i] -= rain * 0.6;   // L505
          this.rainCell[i] = Math.min(255, Math.round(rain * 420));   // L506（N2_RED=atm 时禁写）
          if (N2_RED === 'atm') this.rainCell[i] = 0;
        }
      }
    }
    const winterBolt = s === 3;   // L511
    for (let cy = 0; cy < AH; cy++) {   // L512 降雨作用于世界
      for (let cx = 0; cx < AW; cx++) {
        const i = cy * AW + cx;
        const r = this.rainCell[i];   // L515
        if (r < 45) { this.floodAcc[i] = Math.max(0, this.floodAcc[i] - 0.03); continue; }   // L516
        if (r > 70) {   // L518
          const x0 = cx * CELL;   // L519
          const y0 = cy * CELL;   // L520
          for (let k = 0; k < 6; k++) {   // L521
            const fi = this.rainFireProbe(x0, y0);   // L522
            if (fi < 0) break;   // L523
          }
        }
        if (this._rng() < 0.3 && r > 80) this.rainRegrow(cx * CELL, cy * CELL);   // L527
        this.floodAcc[i] += (r - 60) / 4200;   // L529
        if (this.floodAcc[i] > 1 && this.laws.naturalDisasters) {   // L530
          this.floodAcc[i] = 0;   // L531
          this.natureFlood(cx * CELL + 4, cy * CELL + 4);   // L532
        }
        if (r >= 190 && this.boltCool <= 0 && this.laws.naturalDisasters && this._rng() < (winterBolt ? 0.012 : 0.05)) {   // L538
          this.boltCool = winterBolt ? 600 + Math.floor(this._rng() * 600) : 180 + Math.floor(this._rng() * 240);   // L539
          this.lightningN++;   // L540
          this.natureLightning(cx * CELL + 4, cy * CELL + 4);   // L541
          if (winterBolt) {   // L542
            if (!this.tSnowChronDone) {   // L543
              this.tSnowChronDone = true;   // L544
              this.toast('雷打雪——暴雪云中惊雷乍响，冬雷震震', 'danger');   // L545
              this.addEvent('geo', '雷打雪：罕见的冬季雷暴在暴雪云中炸响，冬雷震震（雷击对暴露的单位有危险）', { x: cx * CELL + 4, y: cy * CELL + 4 });   // L546
            }
          } else if (!this.boltChronDone) {   // L548
            this.boltChronDone = true;   // L549
            this.toast('雷暴降临——暴雨云中电光乍裂，惊雷滚过大地', 'danger');   // L550
            this.addEvent('geo', '雷暴降临：强对流暴雨中的闪电开始叩击大地（雷击对暴露的单位有危险）', { x: cx * CELL + 4, y: cy * CELL + 4 });   // L551
          }
        }
      }
    }
    if (this.rainbowTTL > 0) {   // L561-562
      this.rainbowTTL -= 10;
    } else if (this.rainbowCool <= 0) {   // L563
      const dp = this.dayPhase();   // L564
      const day = dp < 0.42;   // L565
      const deepNight = dp > 0.54 && dp < 0.86;   // L566
      if (day || deepNight) {   // L567
        const moon = deepNight;   // L568
        for (let i = 0; i < AW * AH; i++) {   // L569
          if (this.prevRain[i] >= 120 && this.rainCell[i] === 0 && this._rng() < (moon ? 0.008 : 0.02)) {   // L570
            this.rainbowTTL = 2400;   // L571
            this.rainbowCool = 5400;   // L572
            this.rainbowMoon = moon;   // L573
            this.rainbowX = (i % AW) * CELL + CELL / 2;   // L574
            this.rainbowY = ((i / AW) | 0) * CELL + CELL / 2;   // L575
            if (moon) {   // L576
              if (!this.moonChronDone) {   // L577
                this.moonChronDone = true;   // L578
                this.toast('月虹——雨歇的夜空挂起一道苍白的虹', 'good');   // L579
                this.addEvent('geo', '月虹：骤歇的暴雨在月色里留下一道苍白的虹，如梦似幻');   // L580
              }
            } else if (!this.rainbowChronDone) {   // L582
              this.rainbowChronDone = true;   // L583
              this.toast('雨过天青——一道彩虹横跨天际', 'good');   // L584
              this.addEvent('geo', '雨过天青：骤歇的暴雨在天幕留下一道彩虹');   // L585
            }
            break;   // L587
          }
        }
      }
    }
    if (this.meteorTTL > 0) {   // L596-597
      this.meteorTTL -= 10;
    } else if (this.meteorCool <= 0) {   // L598
      const p = this.dayPhase();   // L599
      if (p > 0.54 && p < 0.86) {   // L600
        let rainy = false;   // L601
        for (let i = 0; i < AW * AH; i += 4) {   // L602
          if (this.rainCell[i] > 15) { rainy = true; break; }   // L603
        }
        if (!rainy && this._rng() < 0.045) {   // L605
          this.meteorCool = 600 + Math.floor(this._rng() * 900);   // L606
          this.meteorTTL = 60;   // L607
          const ang = 0.32 + this._rng() * 0.6;   // L608
          const dir = this._rng() < 0.5 ? -1 : 1;   // L609
          this.meteorDx = Math.cos(ang) * dir;   // L610
          this.meteorDy = Math.sin(ang);   // L611
          this.meteorX = Math.min(W - 24, Math.max(24, this.camX + (this._rng() - 0.5) * 180));   // L613
          this.meteorY = Math.min(H - 56, Math.max(14, this.camY - 44 + (this._rng() - 0.5) * 70));   // L614
          this.meteorsN++;   // L615
          if (!this.meteorChronDone) {   // L616
            this.meteorChronDone = true;   // L617
            this.toast('星陨——一颗流星划过夜空', 'good');   // L618
            this.addEvent('geo', '星陨：晴朗的深夜里一颗流星倏然划过天幕，转瞬即逝');   // L619
          }
        }
      }
    }
    this.prevRain.set(this.rainCell);   // L624
  }
  stormTick() {   // nature.ts L665-778
    if (!this.laws.atmosphere) return;   // L667
    const s = this.season;   // L668
    let spawnP = (s === 1 ? 0.1 : s === 0 || s === 2 ? 0.06 : 0.08) * 1;   // L670（ep stormRate=1）
    for (const ps of this.pSystems) if (ps.kind === 0 && ps.str > 0.55) spawnP += 0.05;   // L671
    if (this.laws.naturalDisasters && this.storms.length < 3 && this._rng() < spawnP) {   // L672
      for (let tr = 0; tr < 6; tr++) {   // L673
        const cx = Math.floor(this._rng() * AW);   // L674
        const cy = Math.floor(this._rng() * AH);   // L675
        const i = cy * AW + cx;   // L676
        const st = this.cellStats(cx, cy);   // L677
        const latA = Math.abs(cy / (AH - 1) - 0.5) * 2;   // L678
        const winterPolar = s === 3 && latA > 0.68 && st.waterFrac > 0.3 && this.moist[i] > 0.5;   // L679
        const nearL = this.pSystems.some((ps) => ps.kind === 0 && ps.str > 0.6 && Math.hypot(cx - ps.x / CELL, cy - ps.y / CELL) < 3);   // L680
        const warmOcean = (st.waterFrac > 0.88 || (nearL && st.waterFrac > 0.55)) && this.moist[i] > 0.72 && Math.abs(cy / (AH - 1) - this.itczLat) < 0.2;   // L681
        if (warmOcean || winterPolar) {   // L682
          const st0 = this.storms.length >= 2 ? 0.3 : 0.38;   // L683
          const id = this.stormSeq++;   // L685
          this.storms.push({ id, x: cx * CELL + 4, y: cy * CELL + 4, strength: st0, ttl: 320 + Math.floor(this._rng() * 420), seed: Math.floor(this._rng() * 65536), kind: winterPolar ? 'blizzard' : 'cyclone', name: STORM_NAME_AT(this.stormSeq - 1), landed: false });   // L684-694
          this.natCounters[5]++;   // L695
          if (winterPolar) {   // L696
            this.addEvent('geo', `极地冰暴「${this.storms[this.storms.length - 1].name}」在寒洋上空成形，裹挟着暴雪逼近陆地`, { x: cx * CELL + 4, y: cy * CELL + 4 });   // L697
          } else {
            this.addEvent('geo', `热带气旋「${this.storms[this.storms.length - 1].name}」在暖洋上空孕育成形，螺旋云带开始收紧`, { x: cx * CELL + 4, y: cy * CELL + 4 });   // L699
            this.toast(`气旋「${this.storms[this.storms.length - 1].name}」成形`, 'info');   // L700
          }
          break;   // L702
        }
      }
    }
    for (let k = this.storms.length - 1; k >= 0; k--) {   // L707
      const st = this.storms[k];
      st.ttl -= 40;   // L709
      const [u, v] = this.windAt(st.x / CELL, st.y / CELL);   // L710
      const pole = st.y < H / 2 ? -0.22 : 0.22;   // L713
      st.x = Math.max(3, Math.min(W - 4, st.x + u * 2.6 - 0.16 + (this._rng() - 0.5) * 1.4));   // L714
      st.y = Math.max(3, Math.min(H - 4, st.y + v * 2.6 + pole + (this._rng() - 0.5) * 1.4));   // L715
      const stC = this.cellStats(Math.min(AW - 1, (st.x / CELL) | 0), Math.min(AH - 1, (st.y / CELL) | 0));   // L716
      const latA = Math.abs(st.y / H - 0.5) * 2;   // L717
      const overWarmOcean = stC.waterFrac > 0.85 && this.season !== 3;   // L718
      const overLand = stC.waterFrac < 0.4;   // L719
      if (overWarmOcean) st.strength += 0.02 + (latA < 0.3 ? 0.012 : 0);   // L721
      else if (overLand) st.strength -= 0.028 + stC.elev * 0.012;   // L722
      else st.strength -= 0.008;   // L723
      st.strength = Math.max(0.08, Math.min(1.6, st.strength));   // L724
      if (overLand && !st.landed && st.strength > 0.55) {   // L726
        st.landed = true;   // L727
        if (st.kind === 'blizzard') {   // L728
          this.addEvent('geo', `冰暴「${st.name}」登陆！狂风裹雪横扫海岸，大地在白茫中噤声`, { x: st.x, y: st.y });   // L729
          this.natCounters[8]++;   // L730
        } else {
          this.addEvent('geo', `气旋「${st.name}」登陆！狂风撕扯着沿岸的森林与屋舍`, { x: st.x, y: st.y });   // L732
          this.toast(`「${st.name}」登陆肆虐`, 'danger');   // L733
        }
      }
      if (st.strength > 0.7 && this.laws.naturalDisasters) {   // L737
        if (N2_RED !== 'storm') this.stormRavage(st);   // L738
        if (stC.elev > 1.6 && st.kind === 'cyclone' && this._rng() < 0.12) {   // L740
          this.spawnTornado(st.x, st.y, 1);   // L741
          this.addEvent('geo', `「${st.name}」撞上山岳，气流剧烈抬升——龙卷风从雨幕中俯冲而下`, { x: st.x, y: st.y });   // L742
        }
      }
      const ci = this.cellOf(st.x, st.y);   // L746
      this.moist[ci] = Math.min(1, this.moist[ci] + 0.3);   // L747
      this.rainCell[ci] = 255;   // L748
      if (st.ttl <= 0 || st.strength < 0.16) {   // L750
        if (st.landed || st.strength > 0.9) this.addEvent('geo', `风暴「${st.name}」终于耗尽了能量，云带散作细雨`, { x: st.x, y: st.y });   // L751
        this.storms.splice(k, 1);   // L752
      }
    }
    if (this.laws.naturalDisasters && (s === 1 || s === 2) && this._rng() < 0.05) {   // L756
      const cx = Math.floor(this._rng() * AW);   // L757
      const cy = Math.floor(this._rng() * AH);   // L758
      const i = cy * AW + cx;   // L759
      const st = this.cellStats(cx, cy);   // L760
      if (st.waterFrac < 0.25 && this.moist[i] < 0.14) {   // L761
        const [u, v] = this.windAt(cx, cy);   // L762
        const windSpd = Math.hypot(u, v);   // L763
        let sand = 0;   // L765
        const x0 = cx * CELL;   // L766
        const y0 = cy * CELL;   // L767
        for (let y = y0; y < y0 + CELL && y < H; y++) for (let x = x0; x < x0 + CELL && x < W; x++) if (this.terrain[y * W + x] === T.SAND) sand++;   // L768
        if (sand > 34 && windSpd > 0.5) {   // L769
          this.sandstorm(x0 + 4, y0 + 4, 5.5, 240);   // L770
          this.natCounters[9]++;   // L771
        } else if (sand < 20) {   // L772
          this.drought(x0 + 4, y0 + 4, 6 + this._rng() * 4, 220);   // L773
          this.natCounters[9]++;   // L774
        }
      }
    }
  }
  encodeRiverDir(dx, dy) {   // engine L62-71 机械面（八向码）
    if (dx === 0 && dy === 0) return 0;
    if (Math.abs(dx) > Math.abs(dy) * 2) return dx > 0 ? 1 : 5;
    if (Math.abs(dy) > Math.abs(dx) * 2) return dy > 0 ? 3 : 7;
    if (dx > 0 && dy > 0) return 2;
    if (dx > 0 && dy < 0) return 8;
    if (dx < 0 && dy > 0) return 4;
    return 6;
  }
  isWaterT(t) { return t === T.WATER || t === T.DEEP; }   // engine isWater 面
  carveLake(cx, cy, r, runtime = true) {   // engine L12394-12411
    for (let dy = -r - 1; dy <= r + 1; dy++) {   // L12396
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L12399
        const d = Math.hypot(dx, dy);   // L12400
        if (d <= r) { const j = idx(xx, yy); if (runtime) this.setTerrain(j, T.WATER); else this.terrain[j] = T.WATER; }   // L12403
        else if (d <= r + 1) {
          const j = idx(xx, yy);
          const t = this.terrain[j];
          if (t === T.SAND || t === T.BURNT) { if (runtime) this.setTerrain(j, T.GRASS); else this.terrain[j] = T.GRASS; }   // L12406
        }
      }
    }
    this.fx('spawn', cx + 0.5, cy + 0.5, 30);   // L12410（2 掷）
  }
  carveRiver(wx, wy, widthOverride) {   // engine L12312-12415（运行时面——setTerrain 全级联）
    const sx = clamp(Math.floor(wx), 0, W - 1);   // L12283
    const sy = clamp(Math.floor(wy), 0, H - 1);   // L12284
    const start = idx(sx, sy);   // L12285
    if (this.isWaterT(this.terrain[start])) return false;   // L12286
    const Nc = W * H;
    const dist = new Int32Array(Nc).fill(-1);   // L12289
    const queue = new Int32Array(Nc);   // L12290
    let qh = 0, qt = 0;
    for (let i = 0; i < Nc; i++) {   // L12291-12295
      if (this.isWaterT(this.terrain[i])) { dist[i] = 0; queue[qt++] = i; }
    }
    while (qh < qt) {   // L12296-12304 BFS
      const i = queue[qh++];
      const d = dist[i];
      const x = i % W, y = (i / W) | 0;
      if (x > 0 && dist[i - 1] === -1 && this.terrain[i - 1] !== T.MOUNTAIN) { dist[i - 1] = d + 1; queue[qt++] = i - 1; }   // L12297
      if (x < W - 1 && dist[i + 1] === -1 && this.terrain[i + 1] !== T.MOUNTAIN) { dist[i + 1] = d + 1; queue[qt++] = i + 1; }   // L12298
      if (y > 0 && dist[i - W] === -1 && this.terrain[i - W] !== T.MOUNTAIN) { dist[i - W] = d + 1; queue[qt++] = i - W; }   // L12299
      if (y < H - 1 && dist[i + W] === -1 && this.terrain[i + W] !== T.MOUNTAIN) { dist[i + W] = d + 1; queue[qt++] = i + W; }   // L12300
    }
    if (dist[start] === -1) {   // L12305-12312 内流湖
      this.carveLake(sx, sy, Math.max(2, 3));
      this.toast('群山环抱的洼地积水成湖', 'info');
      this.addEvent('river', '群山之间诞生了一泓内流湖', { x: sx + 0.5, y: sy + 0.5 });
      return true;
    }
    const width = Math.max(1, Math.min(6, widthOverride ?? 3));   // L12314
    let cx = sx, cy = sy;   // L12316
    let carved = 0;   // L12317
    let reached = false;   // L12318
    for (let step = 0; step < 600; step++) {   // L12321 步长上限
      if (this.isWaterT(this.terrain[idx(cx, cy)])) { reached = true; break; }   // L12322-12324
      let cands = [];   // L12326
      let wts = [];   // L12327
      const curD = dist[idx(cx, cy)];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx2 = cx + dx, ny2 = cy + dy;
          if (nx2 < 0 || ny2 < 0 || nx2 >= W || ny2 >= H) continue;
          const j = idx(nx2, ny2);
          if (dist[j] !== -1 && dist[j] < curD) {   // L12333-12336 下降方向
            cands.push(j);
            wts.push(1.0 / (1 + (curD - dist[j]) * 0.5));   // L12338
          }
        }
      }
      if (cands.length === 0) {   // L12341-12344
        this.carveLake(cx, cy, Math.max(2, width + 1));
        break;
      }
      let total = 0;
      for (const w2 of wts) total += w2;   // L12346-12347
      let r = this._rng() * total;   // L12348
      let pick = cands[0];   // L12349
      for (let k = 0; k < cands.length; k++) { r -= wts[k]; if (r <= 0) { pick = cands[k]; break; } }   // L12350
      const nx = pick % W;   // L12351
      const ny = (pick / W) | 0;   // L12352
      const dirCode = this.encodeRiverDir(nx - cx, ny - cy);   // L12353
      for (let dy = -width; dy <= width; dy++) {   // L12355-12368
        for (let dx = -width; dx <= width; dx++) {
          if (dx * dx + dy * dy > width * width + 0.5) continue;
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (this.terrain[j] === T.MOUNTAIN) continue;   // L12361
          if (this.terrain[j] !== T.WATER) { this.setTerrain(j, T.WATER); carved++; }   // L12362
          if (dirCode > 0) {   // L12363
            this.riverDir[j] = dirCode;   // L12364
            this.riverTiles.add(j);   // L12365
          }
        }
      }
      const ir = width + 1;   // L12369-12380
      for (let dy = -ir; dy <= ir; dy++) {
        for (let dx = -ir; dx <= ir; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          const t = this.terrain[j];
          if (t === T.SAND || t === T.BURNT) this.setTerrain(j, T.GRASS);   // L12377
          else if (t === T.GRASS && this._rng() < 0.05 * this.soilMulAt(j)) this.setTerrain(j, T.FOREST);   // L12378
        }
      }
      cx = nx; cy = ny;   // L12381-12382
    }
    if (carved > 0) {   // L12384-12390
      this.fx('spawn', wx, wy, 30);   // L12385（2 掷）
      this.toast(reached ? '一条大河蜿蜒入海' : '河流在洼地尽头积成了湖', 'info');   // L12386
      this.addEvent('river', reached ? '一条大河蜿蜒入海，奔向远方的地平线' : '河流在洼地尽头积成了湖', { x: wx, y: wy });   // L12387-12388
      return true;   // L12389
    }
    return false;   // L12392
  }
  hydroTick() {   // nature.ts L1062-1091
    if (!this.laws.atmosphere) return;   // L1064
    if (this.riverTiles.size > 900) return;   // L1065
    if (this._rng() > 0.05) return;   // L1066
    for (let tr = 0; tr < 10; tr++) {   // L1067
      const x = 4 + Math.floor(this._rng() * (W - 8));   // L1068
      const y = 4 + Math.floor(this._rng() * (H - 8));   // L1069
      const i = y * W + x;   // L1070
      const t = this.terrain[i];   // L1071
      if (t !== T.MOUNTAIN && t !== T.HILL) continue;   // L1072
      const c = this.cellOf(x, y);   // L1073
      if (this.moist[c] < 0.72 && this.rainCell[c] < 90) continue;   // L1074
      let nearRiver = false;   // L1076
      for (let dy = -3; dy <= 3 && !nearRiver; dy++) {   // L1077
        for (let dx = -3; dx <= 3 && !nearRiver; dx++) {   // L1078
          const xx = x + dx;   // L1079
          const yy = y + dy;   // L1080
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L1081
          if (this.riverDir[yy * W + xx] > 0) nearRiver = true;   // L1082
        }
      }
      if (nearRiver) continue;   // L1085
      if (this.carveRiver(x + 0.5, y + 0.5, 0)) {   // L1086
        this.addEvent('river', '丰沛的降雨在群山间汇流——一条新的河流开始向大海进发', { x, y });   // L1087
        break;   // L1088
      }
    }
  }
  dumpNature2() {   // gen dumpNature2 协议同构（42 键）
    return {
      plateN: this.plateN,
      plateMd5: md5hex(this.plate),
      plateC: [...this.plateCx, ...this.plateCy].map(f64hex),
      drift: this.drift.map((d) => f64hex(d.dx) + f64hex(d.dy)),
      boundaryN: this.boundary.size,
      boundaryMd5: u16md5([...this.boundary]),
      stressMd5: f32md5(this.stress),
      hotspots: this.hotspots.map((h) => ({ x: h.x, y: h.y, heat: f64hex(h.heat) })),
      moistMd5: f32md5(this.moist),
      ashFMd5: f32md5(this.ashF),
      ash: f64hex(this.ash ?? 0),
      rainCellMd5: md5hex(this.rainCell),
      counters: this.natCounters,
      recentQuakes: this.rqX.map((x, k) => ({ x, y: this.rqY[k], m: f64hex(this.rqM[k]), year: this.rqYear[k] })),
      lastSeason: this.lastSeason,
      epoch: this.plateEpoch,
      yearF: f64hex(this.yearF),
      stormSeq: this.stormSeq,
      windPhase: f64hex(this.windPhase),
      floodAccMd5: f32md5(this.floodAcc),
      prevRainMd5: md5hex(this.prevRain),
      boltCool: this.boltCool,
      boltChron: this.boltChronDone ? 1 : 0,
      tSnowChron: this.tSnowChronDone ? 1 : 0,
      lightningN: this.lightningN,
      rainbowX: f64hex(this.rainbowX),
      rainbowY: f64hex(this.rainbowY),
      rainbowTTL: this.rainbowTTL,
      rainbowCool: this.rainbowCool,
      rainbowMoon: this.rainbowMoon ? 1 : 0,
      rainbowChron: this.rainbowChronDone ? 1 : 0,
      moonChron: this.moonChronDone ? 1 : 0,
      meteorX: f64hex(this.meteorX),
      meteorY: f64hex(this.meteorY),
      meteorDx: f64hex(this.meteorDx),
      meteorDy: f64hex(this.meteorDy),
      meteorTTL: this.meteorTTL,
      meteorCool: this.meteorCool,
      meteorsN: this.meteorsN,
      meteorChron: this.meteorChronDone ? 1 : 0,
      pSys: this.pSystems.map((p) => [f64hex(p.x), f64hex(p.y), f64hex(p.kind), f64hex(p.str), f64hex(p.ttl)]),
      stormR: this.storms.map((s) => [f64hex(s.x), f64hex(s.y), f64hex(s.strength), s.id, s.ttl, s.seed, s.kind === 'blizzard' ? 1 : 0, s.landed ? 1 : 0, s.name]),
      sstMd5: f32md5(this.sstAnom),
    };
  }
}

// ---- 黄金回放 + 逐步对账 ----
const golden = JSON.parse(readFileSync(new URL('./golden/nature2.json', import.meta.url), 'utf8'));
let pass = 0;
for (const sc of golden.scenarios) {
  const eng = new Nat2Eng(sc);
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });
  eng.rngA = sc.seed >>> 0;
  let ok = true;
  const diffs = [];
  const cmp = (path, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; diffs.push(`${path}: ${JSON.stringify(a).slice(0, 90)} ≠ ${JSON.stringify(b).slice(0, 90)}`); } };
  for (let si = 0; si < sc.stepsSnap.length; si++) {
    const call = sc.stepsSnap[si];
    if (call.preYear !== undefined && call.preYear !== null) eng.yearF = call.preYear;
    if (call.laws) Object.assign(eng.laws, call.laws);
    for (const op of call.pre ?? []) {   // per-call pre ops 复演
      if (op.op === 'fire') { eng.fire[op.i] = op.v; eng.fireSet.add(op.i); eng.fireSetList.push(op.i); }
      else if (op.op === 'fireRect') { for (let y = op.y0; y <= op.y1; y++) for (let x = op.x0; x <= op.x1; x++) { const j = idx(x, y); eng.fire[j] = op.v; eng.fireSet.add(j); eng.fireSetList.push(j); } }
      else if (op.op === 'prevRain') eng.prevRain[op.i] = op.v;
      else if (op.op === 'frame') eng.frameCount = op.v;
      else if (op.op === 'nat') { if (op.k === 'rainbowTTL') eng.rainbowTTL = op.v; else if (op.k === 'rainbowCool') eng.rainbowCool = op.v; }
      else if (op.op === 'riverTilesFill') { for (let k = 0; k < op.n; k++) eng.riverTiles.add(60000 + k); }
      else if (op.op === 'riverTilesClear') eng.riverTiles.clear();
    }
    const fn = call.fn.startsWith('nt.') ? call.fn.slice(3) : call.fn;
    if (fn === 'atmTick') eng.atmTick();
    else if (fn === 'pressureTick') eng.pressureTick();
    else if (fn === 'stormTick') eng.stormTick();
    else if (fn === 'hydroTick') eng.hydroTick();
    else throw new Error('镜像未覆盖调用 ' + call.fn);
    const snap = call;
    cmp(`s${si}.rngA`, (eng.rngA >>> 0).toString(16).padStart(8, '0'), snap.rngA);
    cmp(`s${si}.terrainMd5`, md5hex(eng.terrain), snap.terrainMd5);
    cmp(`s${si}.fxCount`, eng.effects.length, snap.fxCount);
    cmp(`s${si}.eventsCount`, eng.worldEvents.length, snap.eventsCount);
    cmp(`s${si}.shake`, eng.shake, snap.shake);
    cmp(`s${si}.dirtyN`, eng.dirty.size, snap.dirtyN);
    cmp(`s${si}.propsDirtyN`, eng.propsDirty.size, snap.propsDirtyN);
    const nat = eng.dumpNature2();
    for (const k of Object.keys(snap.nat)) cmp(`s${si}.nat.${k}`, nat[k], snap.nat[k]);
  }
  // 终态对账
  cmp('terrain', md5hex(eng.terrain), md5hex(gunzip(sc.terrain)));
  cmp('nat', eng.dumpNature2(), sc.nat);
  cmp('fx', eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null, age: e.age, quiet: e.quiet ? 1 : 0 })), sc.fx);
  cmp('events', eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })), sc.events);
  cmp('units', eng.units.map((u) => ({ id: u.id, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), hurt: f64hex(u.hurtN ?? 0), dead: u.dead ? 1 : 0, chill: u.chill ?? 0 })), sc.units);
  cmp('toasts', toasts, sc.toasts);
  if (ok) { pass++; console.log(`  ${sc.key}: PASS (${sc.totalDraws} 掷)`); }
  else { console.log(`  ${sc.key}: FAIL\n    ${diffs.slice(0, 4).join('\n    ')}`); }
}
console.log(`nature2 transcript: ${pass}/${golden.scenarios.length} 场景逐位 ${pass === golden.scenarios.length ? 'ALL PASS' : 'FAIL'}${N2_RED ? ' [RED=' + N2_RED + ']' : ''}`);
if (pass !== golden.scenarios.length) process.exit(1);
