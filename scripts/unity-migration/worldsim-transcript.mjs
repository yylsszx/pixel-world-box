// ============================================================================
// worldsim-transcript.mjs —— M-U26「深时涌现域」零引擎镜像（纪律②链三）
//   蓝本 worldsim.ts 全域：initFromTerrain L114-150 / onTerrainChanged L153-165 /
//   soilMulAt L168-170 / hydroTick L175-294 / tempTick L299-302 / computeTemps
//   L304-360 / oceanTick L365-481 / glacierTick L486-552 / coastTick L557-600 /
//   biomeTick L605-670 + 消费面：engine.ts setTerrain L969-1007（M-U8a 全级联）/
//   waterTierAt L1016-1046 / refreshWaterTierAround L1054-1070（M-U10a）/
//   nature.ts cellOf L350-354 / windAt L356-420 / season L160-164 / itczLat
//   L336-341 / noise.ts hash2/valueNoise/fbm。
//   零 engine import：全机械重写 + golden fixture 注入（rect 面展开）。
//   数学面：Math.cos/sin/hypot/exp/sqrt（bun 同源——gen 端 bun 口径一致）。
//   稳定排序：order.sort 比较器降序——TypedArray sort 稳定（gen 端同源）。
//   红证双旋钮：WS_RED=hydro（禁侵蚀支）→ hydro-erode FAIL；
//              WS_RED=glacier（禁积累支）→ glacier-adv FAIL → 还原复绿。
// 运行：bun scripts/unity-migration/worldsim-transcript.mjs（bun 口径）
// ============================================================================
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WS_RED = process.env.WS_RED || null;

// ---- 常量（constants.ts/types.ts 机械面） ----
const W = 256, H = 160, N = W * H, AW = 32, AH = 20, CELL = 8;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const SEASON_YEARS = 2;   // nature.ts L21
const idx = (x, y) => y * W + x;
const isWater = (t) => t === T.DEEP || t === T.WATER;   // constants.ts L67-69

// worldsim.ts L26-34 查表面
const ELEV_TGT = { 0: -2.6, 1: -1.0, 2: 0.05, 3: 0.18, 4: 0.2, 5: 0.5, 6: 0.85, 7: 0.18, 8: 0.7, 9: 0.18, 10: -0.9 };
const SOIL_BASE = { 0: 40, 1: 45, 2: 64, 3: 142, 4: 152, 5: 112, 6: 66, 7: 92, 8: 30, 9: 96, 10: 45 };

// ---- 工具 ----
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64'));
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const f32md5 = (f32) => md5hex(new Uint8Array(f32.buffer.slice(0)));
function f64hex(v) { const b = Buffer.alloc(8); b.writeDoubleLE(v, 0); return b.toString('hex'); }
function f64of(hex) { return Buffer.from(hex, 'hex').readDoubleLE(0); }
const fr = Math.fround;
function mulberry32(a) {   // noise.ts mulberry32 机械面
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, seed) {               // noise.ts L14-19 机械重写（nature2-transcript 绿版对拷）
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function valueNoise(x, y, seed) {          // noise.ts L25-33 机械重写
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const v00 = hash2(xi, yi, seed), v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed), v11 = hash2(xi + 1, yi + 1, seed);
  const sx = smooth(xf), sy = smooth(yf);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}
function fbm(x, y, seed, octaves = 5, lacunarity = 2, gain = 0.5) {   // noise.ts L36-50 机械重写
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + o * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// ---- 零引擎镜像（WsMirror——worldsim 域 + 消费面） ----
class WsMirror {
  constructor(sc) {
    const fx = sc.fixture;
    // 场面（fixture 注入）
    this.terrain = new Uint8Array(gunzip(fx.terrain0));
    this.building = new Uint8Array(gunzip(fx.building0));
    this.waterTier = new Uint8Array(gunzip(fx.waterTier0));
    this.owner = new Int16Array(N).fill(-1);
    this.road = new Uint8Array(N);
    this.fire = new Uint8Array(N);
    this.regrow = new Map();
    this.frozen = new Set();
    this.flood = new Map();
    this.wet = new Set();
    this.riverDir = new Uint8Array(N);
    for (const [i, v] of fx.riverDir0 ?? []) this.riverDir[i] = v;
    this.riverTiles = new Set();
    this.dirty = new Set();
    this.propsDirty = new Set();
    this.units = [];
    this.buckets = [];
    this.bw = Math.ceil(W / 4); this.bh = Math.ceil(H / 4);
    // laws / 全局面
    this.laws = { seasons: sc.seasons !== false, atmosphere: sc.atmosphere !== false, naturalDisasters: sc.disasters !== false };
    this.ecoState = fx.ecoState0 ?? 'balanced';
    this.yearF = fx.yearF0;   // JSON number 往返保真（gen fixture 直写 number）
    this.overlayMode = null; this.overlayDirty = false;   // 渲染覆盖层门（computeTemps L358——镜像恒 null 不触发）
    this.events = [];
    this.seed = fx.wsSeed0;
    // worldsim 面
    this.elev = new Float32Array(N);
    this.tNoise = new Float32Array(N);
    this.flowAcc = new Float32Array(N);
    this.order = new Uint32Array(N);
    this.soilF = new Uint8Array(N);
    this.tempF = new Float32Array(N);
    this.tempOverlay = new Uint8Array(N);
    this.psi = new Float32Array(AW * AH);
    this.curU = new Float32Array(AW * AH);
    this.curV = new Float32Array(AW * AH);
    this.sstAnom = new Float32Array(AW * AH);
    this.heatQ = new Float32Array(AW * AH);
    this.upwell = new Uint8Array(AW * AH);
    this.cont = new Float32Array(AW * AH);
    this.coastal = new Float32Array(AW * AH);
    this.waterCnt = new Uint16Array(AW * AH);
    this.windU = new Float32Array(AW * AH);
    this.windV = new Float32Array(AW * AH);
    this.curlArr = new Float32Array(AW * AH);
    this.qNext = new Float32Array(AW * AH);
    this.strongFrac = 0;
    this.upwellingCells = 0;
    this.glacier = new Uint8Array(N);
    this.glacierTiles = fx.glacierTiles0 ?? 0;
    this.seaLevel = f64of(fx.seaLevel0);
    this.driftAcc = new Uint8Array(N);
    this.globalTemp = f64of(fx.globalTemp0);
    this.baselineTemp = f64of(fx.baselineTemp0);
    this.eroded = 0;
    this.deposited = 0;
    this.biomeDrift = 0;
    this.coastNoteCd = fx.coastNoteCd0 ?? 0;
    this.wsSeed = fx.wsSeed0;
    // nature 面（消费面注入——rect 展开）
    //   initPlates 基线：moist.fill(0.35)/rainCell.fill(0)（gen 端 initPlates 同构）
    this.moist = new Float32Array(AW * AH).fill(0.35);
    this.rainCell = new Uint8Array(AW * AH);
    this.ash = f64of(fx.ash0);
    this.seasonOffset = 0;
    this.natureSeed = fx.wsSeed0;
    this.windPhase = 0;
    this.pSystems = [];
    this.storms = [];
    // —— InitFromTerrain 重算基座（elev/tNoise/soilF/glacier/driftAcc——黄金 gen 端同构）——
    //   注意：initFromTerrain 内部重置 seaLevel/globalTemp/baselineTemp/coastNoteCd——
    //   之后重注入 fixture 标量（gen 端手术三直写在 initFromTerrain 之后同构）
    const injSea = f64of(fx.seaLevel0), injGt = f64of(fx.globalTemp0), injBt = f64of(fx.baselineTemp0);
    const injCd = fx.coastNoteCd0 ?? 0, injTiles = fx.glacierTiles0 ?? 0;
    this.initFromTerrain();
    this.seaLevel = injSea;
    this.globalTemp = injGt;
    this.baselineTemp = injBt;
    this.coastNoteCd = injCd;
    this.glacierTiles = injTiles;
    // —— rect 补丁展开（fixture 直写面——C# 重放同构；tile/cell 双域）——
    this.expandRectsTile(fx.rectElev, this.elev);
    this.expandRectsTile(fx.rectTempF, this.tempF);
    this.expandRectsCell(fx.rectSst, this.sstAnom);
    this.expandRectsTile(fx.rectPsi, this.psi);
    this.expandRectsTile(fx.rectHeatQ, this.heatQ);
    this.expandRectsTile(fx.rectCont, this.cont);
    this.expandRectsTile(fx.rectGlacier, this.glacier);
    this.expandRectsTile(fx.rectDriftAcc, this.driftAcc);
    this.expandRectsTile(fx.rectSoil, this.soilF);
    this.expandRectsCell(fx.rectMoist, this.moist);
    this.expandRectsCell(fx.rectRainCell, this.rainCell);
    if ((fx.rectGlacier ?? []).length > 0) {
      let gt = 0;
      for (let i = 0; i < N; i++) if (this.glacier[i] > 80) gt++;
      this.glacierTiles = gt;
    }
    // ws 独立流（initFromTerrain L117 重置——mulberry32(seed ^ 0x3a91f7)）
    this.rng = mulberry32((fx.wsSeed0 ^ 0x3a91f7) | 0);
  }

  expandRectsTile(rects, arr) {
    for (const [y0, x0, y1, x1, hex] of rects ?? []) {
      const v = f64of(hex);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) arr[y * W + x] = fr(v);
    }
  }

  expandRectsCell(rects, arr) {
    for (const [cy0, cx0, cy1, cx1, hex] of rects ?? []) {
      const v = f64of(hex);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) arr[cy * 32 + cx] = fr(v);
    }
  }

  // ====== nature 消费面镜像（nature2-transcript 绿版对拷） ======
  get season() {   // nature.ts L160-164
    if (!this.laws.seasons) return 1;
    const s = (Math.floor(this.yearF / SEASON_YEARS) + this.seasonOffset) % 4;
    return s < 0 ? s + 4 : s;
  }
  get itczLat() {   // nature.ts L336-341
    if (!this.laws.seasons) return 0.5;
    const s = this.season;
    return 0.5 + (s === 1 ? 0.062 : s === 0 ? 0.034 : s === 2 ? -0.026 : -0.062);
  }
  cellOf(x, y) {   // nature.ts L350-354
    const cx = Math.min(AW - 1, Math.max(0, Math.floor(x / CELL)));
    const cy = Math.min(AH - 1, Math.max(0, Math.floor(y / CELL)));
    return cy * AW + cx;
  }
  windAt(cx, cy) {   // nature.ts L356-420（对拷——pSystems/storms 空——worldsim 场景零消费）
    const lat = cy / (AH - 1);
    const itcz = this.itczLat;
    const latA = Math.abs(lat - itcz) * 2;
    let u;
    if (latA < 0.32) u = -0.55 + latA * 0.9;
    else if (latA < 0.72) u = 0.75 - (latA - 0.32) * 0.35;
    else u = -0.45 + (latA - 0.72) * 1.6;
    const jet = this.season === 3 ? 1.35 : this.season === 1 ? 0.85 : 1;
    const g1 = Math.exp(-((latA - 0.38) * (latA - 0.38)) / 0.005);
    const g2 = Math.exp(-((latA - 0.62) * (latA - 0.62)) / 0.0098);
    u += (g1 * 0.55 + g2 * 0.95) * jet;
    const n = valueNoise(cx / 6 + this.windPhase, cy / 6 - this.windPhase * 0.6, this.natureSeed + 313) - 0.5;
    const n2 = valueNoise(cx / 9 - this.windPhase * 0.7, cy / 9 + this.windPhase * 0.4, this.natureSeed + 727) - 0.5;
    u += n * 0.5;
    let v = n2 * 0.35;
    for (const ps of this.pSystems) {
      const dx = cx - ps.x / CELL;
      const dy = cy - ps.y / CELL;
      const d = Math.hypot(dx, dy);
      if (d < 7 && d > 0.3) {
        const nh = lat < 0.5 ? 1 : -1;
        const sw = (ps.str * 1.35) / (d * 0.8 + 1);
        const sgn = ps.kind === 0 ? 1 : -1;
        u += (-dy / d) * nh * sw * sgn + (dx / d) * sw * (ps.kind === 0 ? -0.22 : 0.16);
        v += (dx / d) * nh * sw * sgn + (dy / d) * sw * (ps.kind === 0 ? -0.22 : 0.16);
      }
    }
    for (const st of this.storms) {
      const sx = st.x / CELL, sy = st.y / CELL;
      const dx = cx - sx, dy = cy - sy;
      const d = Math.hypot(dx, dy);
      if (d < 5 && d > 0.4) {
        const pull = (st.strength * 1.6) / (d * d + 1) * 0.8;
        u += (-dy / d) * pull;
        v += (dx / d) * pull;
      }
    }
    return [u, v];
  }

  // ====== 消费面镜像（engine M-U8a/M-U10a 译本对拷） ======
  markDirty(i) {   // 中心+四邻（M-U10a 面——dirty 五格）
    const x = i % W, y = (i / W) | 0;
    this.dirty.add(i);
    if (x > 0) this.dirty.add(i - 1);
    if (x < W - 1) this.dirty.add(i + 1);
    if (y > 0) this.dirty.add(i - W);
    if (y < H - 1) this.dirty.add(i + W);
  }
  addEvent(kind, text) { this.events.push({ kind, text, x: null, y: null }); }   // coast/biome 纪事（无坐标面）
  waterTierAt(i) {   // engine L1016-1046
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
          const tt = this.terrain[yy * W + xx];
          if (tt !== T.DEEP && tt !== T.WATER && tt !== T.ICE) { land = true; break; }
        }
      }
      if (land) return r - 1;
    }
    return 2;
  }
  refreshWaterTierAround(i) {   // engine L1054-1070
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
  setTerrain(i, t) {   // engine L969-1007 全级联（M-U8a 译本对拷——worldsim 消费面）
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
    if (!isWater(t) && this.riverDir[i] > 0) { this.riverDir[i] = 0; this.riverTiles.delete(i); }
    if (this.fire[i] > 0) { this.fire[i] = 0; }
    if ((isWater(t) || t === T.LAVA) && this.owner[i] >= 0) this.owner[i] = -1;
    if ((isWater(t) || t === T.LAVA) && this.building[i] > 0) this.building[i] = 0;
    if ((isWater(t) || t === T.LAVA) && this.road[i] > 0) this.road[i] = 0;
    this.refreshWaterTierAround(i);
    this.onTerrainChanged(i, t);   // L976（级联尾置语义等价——C# WbBail SetTerrain 同构注记）
  }

  // ====== worldsim 域机械重写 ======
  initFromTerrain() {   // L114-150
    const seed = this.seed;
    const rng0 = mulberry32((seed ^ 0x3a91f7) | 0);   // L117（流重置——局部哑流，掷面零消费）
    void rng0;
    for (let i = 0; i < N; i++) {
      const t = this.terrain[i];
      const x = i % W;
      const y = (i / W) | 0;
      this.elev[i] = fr((ELEV_TGT[t] ?? 0.18) + (fbm(x / 14, y / 14, seed + 4040, 3) - 0.5) * 0.16);   // L124
      this.soilF[i] = SOIL_BASE[t] ?? 128;                                                             // L125
      this.glacier[i] = 0;                                                                             // L126
      this.driftAcc[i] = 0;                                                                            // L127
      this.tNoise[i] = fr((fbm(x / 40, y / 40, seed + 8080, 3) - 0.5) * 0.3);                          // L128
      this.flowAcc[i] = 0;                                                                             // L129
    }
    this.psi.fill(0); this.curU.fill(0); this.curV.fill(0); this.sstAnom.fill(0); this.heatQ.fill(0);
    this.qNext.fill(0); this.upwell.fill(0);
    this.cont.fill(0.5);
    this.coastal.fill(0);
    this.eroded = 0; this.deposited = 0; this.biomeDrift = 0;
    this.seaLevel = 0; this.coastNoteCd = 0; this.glacierTiles = 0; this.upwellingCells = 0; this.strongFrac = 0;
    this.globalTemp = this.computeTemps();   // L148
    this.baselineTemp = this.globalTemp;     // L149
  }

  onTerrainChanged(i, t) {   // L153-165
    const tgt = ELEV_TGT[t];
    if (tgt !== undefined) this.elev[i] = fr(this.elev[i] + (tgt - this.elev[i]) * 0.7);   // L155
    if (t === T.BURNT && this.soilF[i] > 8) this.soilF[i] -= 8;                            // L157
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.glacier[i] > 0) {          // L159
      if (this.glacier[i] > 80) this.glacierTiles--;                                       // L160
      this.glacier[i] = 0;                                                                 // L161
      this.dirty.add(i);                                                                   // L162（worldsim 面单格脏）
    }
    this.driftAcc[i] = 0;                                                                  // L164
  }

  soilMulAt(i) { return 0.6 + (this.soilF[i] / 255) * 0.8; }   // L168-170

  hydroTick() {   // L175-294
    if (WS_RED === 'hydro') { /* 红证旋钮：跳过侵蚀/沉积结算——场景应 FAIL */ }
    const N2 = N;
    const elev = this.elev;
    // —— 1) 降水加权 ——
    for (let y = 0; y < H; y++) {
      const cy = Math.min(AH - 1, (y / CELL) | 0);
      const rowBase = cy * AW;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = rowBase + ((x / CELL) | 0);
        this.flowAcc[i] = fr(0.5 + this.moist[c] * 2 + (this.rainCell[c] / 255) * 1.2 + (this.riverDir[i] > 0 ? 8 : 0));   // L187
      }
    }
    // —— 2) 全图海拔降序排序（稳定） ——
    for (let i = 0; i < N2; i++) this.order[i] = i;
    this.order.sort((a, b) => elev[b] - elev[a]);   // L192（TypedArray 稳定降序）
    // —— 3) 流向累加 ——
    for (let k = 0; k < N2; k++) {
      const i = this.order[k];
      const t = this.terrain[i];
      if (t === T.DEEP || t === T.WATER) continue;
      const x = i % W;
      const y = (i / W) | 0;
      let best = -1;
      let bestE = elev[i];
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx;
          if (elev[j] < bestE) { bestE = elev[j]; best = j; }
        }
      }
      if (best >= 0) this.flowAcc[best] = fr(this.flowAcc[best] + this.flowAcc[i]);   // L213
    }
    // —— 4) 侵蚀与沉积 ——
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const t = this.terrain[i];
        if (t === T.DEEP || t === T.WATER) continue;
        let minE = Infinity;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const e = elev[yy * W + xx];
            if (e < minE) minE = e;
          }
        }
        const slope = elev[i] - minE;
        const f = this.flowAcc[i];
        if (slope > 0.05 && f > 2.5) {
          if (WS_RED === 'hydro') continue;   // 红证旋钮
          let er = Math.min(0.02, 0.011 * 1 * Math.sqrt(f) * slope);   // L237（ERODE_K=0.011 × ep=1）
          if (this.glacier[i] > 80) er *= 1.6;
          elev[i] = fr(elev[i] - er);
          this.eroded += er;
        } else if (slope < 0.015 && f > 3 && elev[i] < 0.32) {
          elev[i] = fr(elev[i] + Math.min(0.006, 0.002 * Math.sqrt(f)));   // L243
          this.soilF[i] = Math.min(255, this.soilF[i] + 2 + ((this.rng() * 4) | 0));   // L244（ws 流）
          this.deposited += 0.004;
        }
      }
    }
    // —— 5) 河口三角洲 ——
    for (const i of this.riverTiles) {
      const x = i % W;
      const y = (i / W) | 0;
      let mouth = false;
      for (let k = 0; k < 4; k++) {
        const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (isWater(this.terrain[j]) && !this.riverTiles.has(j)) mouth = true;
      }
      if (!mouth) continue;
      for (let k = 0; k < 4; k++) {
        const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        if (!isWater(this.terrain[j]) && this.terrain[j] !== T.LAVA) {
          this.soilF[j] = Math.min(255, this.soilF[j] + 3);
          elev[j] = fr(elev[j] + 0.003);
          this.deposited += 0.003;
        }
      }
    }
    // —— 6) 土壤动态 ——
    const overgraze = this.ecoState === 'overgraze' || this.ecoState === 'collapse';
    for (let i = 0; i < N2; i++) {
      const t = this.terrain[i];
      if (t === T.GRASS || t === T.FOREST) { if (this.soilF[i] < 255) this.soilF[i]++; }
      else if (t === T.SAND) { if (this.soilF[i] > 0) this.soilF[i]--; }
      if (overgraze && t === T.GRASS && (i & 7) === 0 && this.soilF[i] > 1) this.soilF[i] -= 2;
    }
    // —— 7) 连续场 → 地形类别投影 ——
    let reclassed = 0;
    for (let k = 0; k < 600 && reclassed < 24; k++) {
      const i = (this.rng() * N2) | 0;
      const t = this.terrain[i];
      if (t === T.MOUNTAIN && elev[i] < 0.52) { this.setTerrain(i, T.HILL); reclassed++; }
      else if (t === T.HILL && elev[i] < 0.24) { this.setTerrain(i, T.GRASS); reclassed++; }
      else if (t === T.GRASS && elev[i] > 0.62) { this.setTerrain(i, T.HILL); reclassed++; }
    }
  }

  tempTick() {   // L299-302
    this.globalTemp += (this.computeTemps() - this.globalTemp) * 0.12;
  }

  computeTemps() {   // L304-360
    // 1) 粗格水格清点
    this.waterCnt.fill(0);
    for (let i = 0; i < N; i++) {
      if (isWater(this.terrain[i])) this.waterCnt[this.cellOf(i % W, (i / W) | 0)]++;
    }
    // 2) 大陆度记忆
    for (let c = 0; c < AW * AH; c++) {
      const wf = this.waterCnt[c] / (CELL * CELL);
      this.cont[c] = fr(this.cont[c] + (1 - wf - this.cont[c]) * 0.05);   // L316
    }
    // 3) 陆格邻近洋流海温
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (this.waterCnt[c] > 32) { this.coastal[c] = 0; continue; }
        let s = 0, n = 0;
        if (cx > 0 && this.waterCnt[c - 1] > 32) { s += this.sstAnom[c - 1]; n++; }
        if (cx < AW - 1 && this.waterCnt[c + 1] > 32) { s += this.sstAnom[c + 1]; n++; }
        if (cy > 0 && this.waterCnt[c - AW] > 32) { s += this.sstAnom[c - AW]; n++; }
        if (cy < AH - 1 && this.waterCnt[c + AW] > 32) { s += this.sstAnom[c + AW]; n++; }
        this.coastal[c] = n > 0 ? fr(s / n) : 0;
      }
    }
    // 4) 全图温度场
    const s = this.season;
    const seasonsOn = this.laws.seasons;
    const ash = this.ash;
    let sum = 0;
    for (let y = 0; y < H; y++) {
      const latF = Math.abs(y / H - 0.5) * 2;
      const cy = Math.min(AH - 1, (y / CELL) | 0);
      const rowBase = cy * AW;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const c = rowBase + ((x / CELL) | 0);
        let tv = 0.6 - latF * 1.1 + this.tNoise[i];
        if (this.elev[i] > 0) tv -= this.elev[i] * 0.55;
        if (seasonsOn) {
          const amp = 0.45 + this.cont[c] * 0.75;
          tv += s === 3 ? -0.16 * amp : s === 1 ? 0.1 * amp : 0;
        }
        tv -= ash * 0.3;
        if (!isWater(this.terrain[i])) tv += this.coastal[c] * 0.4;
        this.tempF[i] = fr(tv);
        sum += tv;
        this.tempOverlay[i] = Math.max(0, Math.min(255, Math.round((tv + 0.5) * 165)));
      }
    }
    if (this.overlayMode === 'temperature' || this.overlayMode === 'biome') this.overlayDirty = true;   // L358（渲染面——镜像恒 null 不触发）
    return sum / N;
  }

  oceanTick() {   // L365-481
    if (!this.laws.atmosphere) return;
    const NC = AW * AH;
    const isOcean = (c) => this.waterCnt[c] > 32;
    // 1) 水格清点 + 风应力
    this.waterCnt.fill(0);
    for (let i = 0; i < N; i++) {
      if (isWater(this.terrain[i])) this.waterCnt[this.cellOf(i % W, (i / W) | 0)]++;
    }
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.windU[c] = 0; this.windV[c] = 0; continue; }
        const [wu, wv] = this.windAt(cx, cy);
        this.windU[c] = fr(wu);
        this.windV[c] = fr(wv);
      }
    }
    // 2) 风应力旋度
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.curlArr[c] = 0; continue; }
        const tE = cx < AW - 1 && isOcean(c + 1) ? this.windV[c + 1] : 0;
        const tW = cx > 0 && isOcean(c - 1) ? this.windV[c - 1] : 0;
        const tS = cy < AH - 1 && isOcean(c + AW) ? this.windU[c + AW] : 0;
        const tN = cy > 0 && isOcean(c - AW) ? this.windU[c - AW] : 0;
        this.curlArr[c] = fr((tE - tW) / 2 - (tS - tN) / 2);
      }
    }
    // 3) Stommel Jacobi（Gauss-Seidel 24 it）
    const EPS = 0.3, BETA = 0.16;
    for (let it = 0; it < 24; it++) {
      for (let cy = 1; cy < AH - 1; cy++) {
        for (let cx = 1; cx < AW - 1; cx++) {
          const c = cy * AW + cx;
          if (!isOcean(c)) continue;
          const pE = isOcean(c + 1) ? this.psi[c + 1] : 0;
          const pW = isOcean(c - 1) ? this.psi[c - 1] : 0;
          const pS = isOcean(c + AW) ? this.psi[c + AW] : 0;
          const pN = isOcean(c - AW) ? this.psi[c - AW] : 0;
          this.psi[c] = fr((EPS * (pE + pW + pS + pN) + (BETA / 2) * (pE - pW) - this.curlArr[c]) / (4 * EPS));   // L410
        }
      }
    }
    // 4) 流速场
    const CS = 1;
    for (let cy = 0; cy < AH; cy++) {
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.curU[c] = 0; this.curV[c] = 0; continue; }
        const pE = cx < AW - 1 && isOcean(c + 1) ? this.psi[c + 1] : 0;
        const pW = cx > 0 && isOcean(c - 1) ? this.psi[c - 1] : 0;
        const pS = cy < AH - 1 && isOcean(c + AW) ? this.psi[c + AW] : 0;
        const pN = cy > 0 && isOcean(c - AW) ? this.psi[c - AW] : 0;
        this.curU[c] = fr(Math.max(-0.6, Math.min(0.6, -(pS - pN) / 2 * CS)));
        this.curV[c] = fr(Math.max(-0.6, Math.min(0.6, (pE - pW) / 2 * CS)));
      }
    }
    // 5) 热含量半拉格朗日平流
    for (let cy = 0; cy < AH; cy++) {
      const lat = cy / (AH - 1);
      const src = 0.45 * (1 - Math.abs(lat - 0.5) * 2);
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.qNext[c] = 0; continue; }
        const sx = Math.max(0, Math.min(AW - 1, Math.round(cx - this.curU[c] * 2)));
        const sy = Math.max(0, Math.min(AH - 1, Math.round(cy - this.curV[c] * 2)));
        const up = isOcean(sy * AW + sx) ? this.heatQ[sy * AW + sx] : this.heatQ[c];
        this.qNext[c] = fr((up + src) * 0.975);
      }
    }
    this.heatQ.set(this.qNext);
    // 6) 海温异常 = 偏离纬圈均值
    for (let cy = 0; cy < AH; cy++) {
      let sum = 0, n = 0;
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (isOcean(c)) { sum += this.heatQ[c]; n++; }
      }
      const zmean = n > 0 ? sum / n : 0;
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.sstAnom[c] = 0; continue; }
        this.sstAnom[c] = fr(Math.max(-1, Math.min(1, (this.heatQ[c] - zmean) * 6)));
      }
    }
    // 7) 上升流
    this.upwellingCells = 0;
    for (let cy = 0; cy < AH; cy++) {
      const lat = cy / (AH - 1);
      for (let cx = 0; cx < AW; cx++) {
        const c = cy * AW + cx;
        if (!isOcean(c)) { this.upwell[c] = 0; continue; }
        const up = Math.abs(lat - this.itczLat) < 0.1 && (cx < AW * 0.25 || cx > AW * 0.75);
        this.upwell[c] = up ? 1 : 0;
        if (up) {
          this.sstAnom[c] = fr(Math.max(-1, this.sstAnom[c] - 0.16));
          this.upwellingCells++;
        }
      }
    }
    // 8) 强流占比
    let strong = 0, waterN = 0;
    for (let c = 0; c < NC; c++) {
      if (!isOcean(c)) continue;
      waterN++;
      if (Math.hypot(this.curU[c], this.curV[c]) > 0.35) strong++;
    }
    this.strongFrac = waterN > 0 ? strong / waterN : 0;
  }

  glacierTick() {   // L486-552
    // —— 1) 积累 / 消融 ——
    for (let i = 0; i < N; i++) {
      const g = this.glacier[i];
      const t = this.terrain[i];
      if (t === T.DEEP || t === T.WATER || t === T.ICE || t === T.LAVA) continue;
      const tv = this.tempF[i];
      const accTh = this.elev[i] > 0.45 ? 0.02 : -0.15;
      if (tv < accTh) {
        if (WS_RED === 'glacier') continue;   // 红证旋钮
        const before = g;
        this.glacier[i] = Math.min(255, g + 2 + ((this.rng() * 3) | 0));
        if (before <= 80 && this.glacier[i] > 80) { this.dirty.add(i); this.glacierTiles++; }
      } else if (tv > 0.1 && g > 0) {
        this.glacier[i] = Math.max(0, g - 3);
        if (g > 80 && this.glacier[i] <= 80) { this.dirty.add(i); this.glacierTiles--; }
      }
    }
    // —— 2) 采样 300 进退 ——
    for (let k = 0; k < 300; k++) {
      const i = (this.rng() * N) | 0;
      const t = this.terrain[i];
      if (t === T.DEEP || t === T.WATER || t === T.ICE || t === T.LAVA) continue;
      if (this.glacier[i] > 180) {
        const x = i % W, y = (i / W) | 0;
        let best = -1;
        let bestE = this.elev[i];
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const j = yy * W + xx;
            const tj = this.terrain[j];
            if (tj === T.DEEP || tj === T.WATER || tj === T.ICE || tj === T.LAVA) continue;
            if (this.elev[j] < bestE) { bestE = this.elev[j]; best = j; }
          }
        }
        if (best >= 0) {
          const bj = this.glacier[best];
          this.glacier[best] = Math.max(bj, 40);
          if (bj <= 80 && this.glacier[best] > 80) { this.dirty.add(best); this.glacierTiles++; }
        }
      }
      if (this.glacier[i] > 0 && this.glacier[i] < 30) {
        if (this.glacier[i] > 80) this.glacierTiles--;
        this.glacier[i] = 0;
      }
    }
  }

  coastTick() {   // L557-600
    this.seaLevel = Math.max(-8, Math.min(8, this.seaLevel + (this.globalTemp - this.baselineTemp) * 0.02));
    if (this.coastNoteCd > 0) this.coastNoteCd -= 600;
    if (!this.laws.naturalDisasters) return;
    let changed = 0;
    let noteKind = 0;
    for (let k = 0; k < 30 && changed < 2; k++) {
      const i = (this.rng() * W * H) | 0;
      if (this.owner[i] >= 0 || this.building[i] > 0) continue;
      const x = i % W, y = (i / W) | 0;
      const bx = Math.min(this.bw - 1, (x / 4) | 0);
      const by = Math.min(this.bh - 1, (y / 4) | 0);
      const bk = this.buckets[by * this.bw + bx];
      if (bk && bk.length > 0) continue;
      const t = this.terrain[i];
      let seaN = false, landN = false;
      for (let d = 0; d < 4; d++) {
        const xx = x + (d === 0 ? -1 : d === 1 ? 1 : 0);
        const yy = y + (d === 2 ? -1 : d === 3 ? 1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const nt = this.terrain[yy * W + xx];
        if (nt === T.WATER || nt === T.DEEP) seaN = true;
        else landN = true;
      }
      if (t === T.SAND && this.seaLevel > 0.5 && seaN && this.elev[i] < this.seaLevel * 0.012) {
        this.setTerrain(i, T.WATER);
        changed++;
        noteKind = noteKind === 0 ? 1 : noteKind;
      } else if (t === T.WATER && this.seaLevel < -0.5 && this.waterTier[i] <= 1 && landN) {
        this.setTerrain(i, T.SAND);
        changed++;
        noteKind = noteKind === 0 ? 2 : noteKind;
      }
    }
    if (changed > 0 && this.coastNoteCd <= 0) {
      this.coastNoteCd = 2400;
      if (noteKind === 1) this.addEvent('geo', '海水漫上了低洼的海岸，咸涩的潮水一年年向内陆蚕食');
      else if (noteKind === 2) this.addEvent('geo', '海退了——滩涂从浪花下露出新生的沙脊');
    }
  }

  biomeTick() {   // L605-670
    // —— 1) 全图错配累计 ——
    let poolN = 0;
    for (let i = 0; i < N; i++) {
      const t = this.terrain[i];
      if (t !== T.GRASS && t !== T.FOREST && t !== T.SAND && t !== T.SNOW) continue;
      if (this.owner[i] >= 0 || this.building[i] > 0) continue;
      const x = i % W, y = (i / W) | 0;
      const c = this.cellOf(x, y);
      const moist = this.moist[c];
      const tv = this.tempF[i];
      const soil = this.soilF[i];
      let want;
      if (tv < -0.26) want = T.SNOW;
      else if (tv < -0.02 && moist > 0.5) want = T.FOREST;
      else if (moist > 0.62 && soil > 110 && tv > 0.05) want = T.FOREST;
      else if (moist < 0.3 && tv > 0.38 && soil < 95) want = T.SAND;
      else want = T.GRASS;
      if (want === t) {
        if (this.driftAcc[i] > 0) this.driftAcc[i]--;
        continue;
      }
      if (this.driftAcc[i] < 255) this.driftAcc[i]++;
      if (this.driftAcc[i] > 3) this.order[poolN++] = i;
    }
    if (poolN === 0) return;
    // —— 2) 采样 60 迁移掷骰 ——
    let migrated = 0;
    for (let k = 0; k < 60 && migrated < 12; k++) {
      const i = this.order[(this.rng() * poolN) | 0];
      if (this.driftAcc[i] <= 3) continue;
      const t = this.terrain[i];
      const x = i % W, y = (i / W) | 0;
      const c = this.cellOf(x, y);
      const moist = this.moist[c];
      const tv = this.tempF[i];
      const soil = this.soilF[i];
      let want;
      if (tv < -0.26) want = T.SNOW;
      else if (tv < -0.02 && moist > 0.5) want = T.FOREST;
      else if (moist > 0.62 && soil > 110 && tv > 0.05) want = T.FOREST;
      else if (moist < 0.3 && tv > 0.38 && soil < 95) want = T.SAND;
      else want = T.GRASS;
      let to = T.GRASS;
      if (t === T.GRASS) to = want;
      if (to === T.FOREST && soil <= 110) to = T.GRASS;
      if (to !== t) {
        this.setTerrain(i, to);
        this.driftAcc[i] = 0;
        migrated++;
        this.biomeDrift++;
      }
    }
    if (migrated >= 3) {
      this.addEvent('geo', `气候在悄悄改写大地：${migrated} 处群系发生了迁移——雪线进退、荒漠化与绿化、草木演替`);
    }
  }

  // dump 对账面（与 gen dumpWorldsim 同键）
  dump(eng0) {
    return {
      elevMd5: f32md5(this.elev),
      tNoiseMd5: f32md5(this.tNoise),
      flowAccMd5: f32md5(this.flowAcc),
      tempFMd5: f32md5(this.tempF),
      psiMd5: f32md5(this.psi),
      curUMd5: f32md5(this.curU),
      curVMd5: f32md5(this.curV),
      sstMd5: f32md5(this.sstAnom),
      heatQMd5: f32md5(this.heatQ),
      contMd5: f32md5(this.cont),
      coastalMd5: f32md5(this.coastal),
      tempOverlayMd5: md5hex(this.tempOverlay),
      waterCntMd5: md5hex(new Uint8Array(new Uint16Array(this.waterCnt).buffer)),
      upwellMd5: md5hex(this.upwell),
      glacierMd5: md5hex(this.glacier),
      driftAccMd5: md5hex(this.driftAcc),
      soilMd5: md5hex(this.soilF),
      globalTemp: f64hex(this.globalTemp),
      baselineTemp: f64hex(this.baselineTemp),
      seaLevel: f64hex(this.seaLevel),
      eroded: f64hex(this.eroded),
      deposited: f64hex(this.deposited),
      biomeDrift: this.biomeDrift,
      glacierTiles: this.glacierTiles,
      upwellingCells: this.upwellingCells,
      strongFrac: f64hex(this.strongFrac),
      coastNoteCd: this.coastNoteCd,
      season: this.season,
      ash: f64hex(this.ash),
      moistMd5: f32md5(this.moist),
      rainCellMd5: md5hex(this.rainCell),
      yearF: f64hex(this.yearF),
    };
  }
}

// ---- 主流程：逐场景重放对账 ----
const GOLDEN = path.join(ROOT, 'scripts/unity-migration/golden/worldsim.json');
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
let pass = 0, fail = 0;
const failKeys = [];
for (const sc of golden.scenarios) {
  const m = new WsMirror(sc);
  let ok = true;
  const bad = [];
  // 年相（fixture yearF0——season 推导消费面）
  m.yearF = sc.fixture.yearF0;   // JSON number 往返保真
  for (let s = 0; s < sc.stepsSnap.length; s++) {
    const st = sc.stepsSnap[s];
    if (st.preYear !== null && st.preYear !== undefined) m.yearF = st.preYear;
    if (st.preAsh !== null && st.preAsh !== undefined) m.ash = st.preAsh;
    const fn = st.fn.startsWith('ws.') ? st.fn.slice(3) : st.fn;   // ws. 前缀剥除（镜像类即 worldsim 本体）
    m[fn](...(st.args ?? []));
    const g = st.ws;
    const d = m.dump();
    for (const k of Object.keys(g)) {
      if (JSON.stringify(d[k]) !== JSON.stringify(g[k])) { ok = false; bad.push(`s${s} ${st.fn} ws.${k}`); }
    }
    if (m.terrainMd5Check && false) void 0;
    // terrain/rngA/dirty 面（snapCommon）
    const terrainMd5 = md5hex(m.terrain);
    if (terrainMd5 !== st.terrainMd5) { ok = false; bad.push(`s${s} terrainMd5`); }
    if (m.dirty.size !== st.dirtyN) { ok = false; bad.push(`s${s} dirtyN ${m.dirty.size}≠${st.dirtyN}`); }
    if (m.propsDirty.size !== st.propsDirtyN) { ok = false; bad.push(`s${s} propsDirtyN`); }
    if (m.events.length !== st.eventsCount) { ok = false; bad.push(`s${s} eventsCount ${m.events.length}≠${st.eventsCount}`); }
  }
  // 终态 terrain gz
  const endTerrain = gunzip(sc.terrain);
  let tEq = endTerrain.length === m.terrain.length;
  if (tEq) for (let i = 0; i < m.terrain.length; i++) if (endTerrain[i] !== m.terrain[i]) { tEq = false; break; }
  if (!tEq) { ok = false; bad.push('终态 terrain 字节面'); }
  // events 文案
  if (m.events.length !== sc.events.length) { ok = false; bad.push(`终态 events ${m.events.length}≠${sc.events.length}`); }
  else for (let e = 0; e < m.events.length; e++) if (m.events[e].text !== sc.events[e].text) { ok = false; bad.push(`ev${e} 文案`); }
  if (ok) { pass++; console.log(`  PASS ${sc.key}`); }
  else { fail++; failKeys.push(sc.key); console.log(`  FAIL ${sc.key} —— ${bad.slice(0, 4).join('; ')}`); }
}
console.log(`worldsim transcript: ${pass}/${golden.scenarios.length} 场景逐位 ${fail === 0 ? 'ALL PASS' : 'FAIL'}`);
if (fail > 0) process.exit(1);
