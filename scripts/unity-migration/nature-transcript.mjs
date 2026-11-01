// ============================================================================
// nature-transcript.mjs —— M-U17「板块构造与地质演变域」零引擎镜像
//   蓝本 nature.ts：initPlates L93-131（独立流 mulberry32(seed^0x51ab7)）/
//   recomputePlates L132-166（Voronoi 抖动 valueNoise + boundary Set 插入序）/
//   seasonCheck L213-241（全图 dirty + 四宣告 toast/addEvent）/ tectonicTick
//   L781-828（漂移 DK=0.55 + 期 4 recompute + 应力法线投影 + 热点增压 + 释压≤2 +
//   灰烬兜底）/ releaseQuake L831-881（半径 6 聚合 + 里氏震级 log2 + 海啸双支 +
//   余震）/ geologyTick L882-1061（造山链/岛弧/侵蚀三支/热点喷发+ashF 注入/
//   裂谷拉张）+ engine.ts natureQuake L10561-10590（fx quake/塌毁/地裂/伤亡）。
//   随件：mulberry32（noise.ts L5-12）/ valueNoise+hash2（noise.ts L14-33）/
//   setTerrain 级联子集（真蓝本 L975-1013——markDirty L983/riverTiles 删 L994/
//   frozen/flood/wet/regrow delete/fireSet add/radiate delete——tool2/tool3 子集
//   并集）+ Fx 2 掷面（engine L9793-9797 seed+dir——quake fx 消费）+ addEvent
//   （unshift + cap 80）+ toast 收集 + tsunami/volcano 生成器最小镜像（黄金
//   fx/terrain 面——M-U16 译件蓝本 L10780-10785/L10746-10777 子集）。
// 协议：fixture 注入（terrain0/plate0/stress0 gz 字节面 + plateC0/drift0/heat0/
//   hotXY0 全列 + boundary 由 plate0 经镜像 recomputePlates 重建——确定性同构）
//   + rngA 尾置清零 + calls 直调（nt.* 前缀 nature 域）+ 步进快照逐位对账。
// 红证（纪律②）: NAT_RED=quake 禁释放检查（tectonicTick L819 stress<26 恒真）
//   → S4-S7 FAIL（counters.quakes=0）；NAT_RED=volc 禁热点喷发（L990 门恒假）
//   → S10 FAIL（eruptions=0）→ 还原复绿 12/12。
// 运行：bun scripts/unity-migration/nature-transcript.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const W = 256, H = 160, N = W * H;
const AW = Math.floor(W / 8), AH = Math.floor(H / 8), CELL = 8;   // nature.ts L17-19
const idx = (x, y) => y * W + x;
const NAT_RED = process.env.NAT_RED ?? '';

// mulberry32（noise.ts L5-12 机械重写）
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(x, y, seed) {               // noise.ts L14-19 机械重写
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
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64'));
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };
function f32md5(f32) { return md5hex(new Uint8Array(f32.buffer.slice(0))); }
function u16md5(arr) {
  const u16 = new Uint16Array(arr.length);
  for (let i = 0; i < arr.length; i++) u16[i] = arr[i];
  return md5hex(new Uint8Array(u16.buffer));
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ---- 镜像引擎（fixture 注入 + nature 域直调——黄金回放载体） ----
class NatEng {
  constructor(sc) {
    const fx = sc.fixture;
    this.tickCount = sc.tickCount;
    this.shake = 0;
    this.rngA = 0;
    this.baseSeed = sc.baseSeed;
    this.terrain = new Uint8Array(gunzip(fx.terrain0));
    this.plate = new Uint8Array(gunzip(fx.plate0));
    const stressBuf = gunzip(fx.stress0);
    this.stress = new Float32Array(stressBuf.buffer, 0, stressBuf.length >> 2);
    // 大气壳（initPlates fill 面——镜像端同构：moist 0.35 fill / ashF·rainCell·floodAcc 零）
    this.moist = new Float32Array(AW * AH);
    this.ashF = new Float32Array(AW * AH);
    this.rainCell = new Uint8Array(AW * AH);
    this.floodAcc = new Float32Array(AW * AH);
    this.moist.fill(0.35);
    this.ash = 0;
    this.stormSeq = 1;
    this.pSystems = [];
    this.storms = [];
    this.natCounters = new Array(10).fill(0);
    this.rqX = []; this.rqY = []; this.rqM = []; this.rqYear = [];
    this.lastSeason = -1;
    this.snowmanChronDone = false;
    this.iceChronDone = false;
    this.thawChronDone = false;
    this.seasonOffset = fx.seasonOffset0 ?? 0;
    this.yearF = 0;
    this.dirty = new Set();
    this.propsDirty = new Set();
    this.effects = [];
    this.worldEvents = [];
    this.units = [];
    this.building = new Uint8Array(N);
    this.buildings = [];
    this.bIdx = new Map();
    this.bHp = new Map();
    this.damagedSet = new Set();
    this.riverTiles = new Set();
    this.riverDir = new Uint8Array(N);
    this.waterTier = new Uint8Array(N);
    this.road = new Uint8Array(N);
    this.owner = new Int16Array(N).fill(-1);
    this.fireSet = new Set();
    this.fire = new Uint8Array(N);
    this.frozen = new Set();
    this.flood = new Map();
    this.wet = new Map();
    this.regrow = new Map();
    this.radiate = new Uint8Array(N);
    this.radSet = new Map();
    this.glacier = new Uint8Array(N);
    this.laws = { seasons: true, tectonics: true, atmosphere: true, naturalDisasters: true };
    this.onToast = null;
    this.eventSeq = 1;
    this.natureSeed = this.baseSeed;

    // nature 域基座：plate0 注入 + recomputePlates 重建 boundary（插入序同构）
    this.plateN = fx.plateN0;
    this.plateCx = fx.plateC0.slice(0, this.plateN).map((h) => f64of(h));
    this.plateCy = fx.plateC0.slice(this.plateN).map((h) => f64of(h));
    this.drift = fx.drift0.map((h) => { const b = Buffer.from(h, 'hex'); return { dx: b.readDoubleLE(0), dy: b.readDoubleLE(8) }; });
    this.plateEpoch = 0;
    // boundary 直接注入（fixture boundary0 全列表 u16 LE——S11 单格化手术面固化；插入序=gen 端 [...boundary] 序）
    this.boundary = new Set();
    {
      const bb = gunzip(fx.boundary0);
      const u16 = new Uint16Array(bb.buffer, bb.byteOffset, bb.byteLength >> 1);
      for (let k = 0; k < u16.length; k++) this.boundary.add(u16[k]);
    }
    // 热点直接注入（fixture hotXY0 全列表——免独立流重掷）
    this.hotspots = fx.hotXY0.map(([x, y], k) => ({ x, y, heat: f64of(fx.heat0[k] ?? '0000000000000000') }));
    // stress 直写面（pre 钩子产物已固化在 stress0）
    this.countersKey = ['quakes', 'quakesBig', 'eruptions', 'uplifts', 'erosions', 'cyclones', 'tsunamis', 'floods', 'blizzards', 'droughts'];
    // 建筑面 + 单位面注入（pre 钩子 mkBuilding/mkUnitAt 动态面——attackBuilding 门/伤亡循环消费）
    this.building.set ? null : null;
    {
      const bb = gunzip(fx.building0);
      for (let k = 0; k < bb.length; k++) if (bb[k]) this.building[k] = bb[k];
      for (const uo of fx.units0) {
        this.units.push({ id: uo.id, race: uo.race, civ: -1, x: uo.x, y: uo.y, hp: uo.hp, maxHp: uo.maxHp, hurtN: null, dead: 0, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0, infected: false, gene: null });
      }
    }
  }

  // boundary 从 plate0 面扫描重建（蓝本 L147-158 边界扫描段——plate 面已注入不重算；
  // S11 boundary 单格化手术面经 plate0 固化后由此同构恢复）
  rebuildBoundaryFromPlate() {
    this.boundary.clear();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const p = this.plate[i];
        if ((x > 0 && this.plate[i - 1] !== p) || (x < W - 1 && this.plate[i + 1] !== p) || (y > 0 && this.plate[i - W] !== p) || (y < H - 1 && this.plate[i + W] !== p)) {
          this.boundary.add(i);
        } else if (this.stress[i] > 0) {
          this.stress[i] = 0;
        }
      }
    }
  }

  Rng() {
    this.rngA = (this.rngA + 0x6d2b79f5) | 0;
    let t = Math.imul(this.rngA ^ (this.rngA >>> 15), 1 | this.rngA);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // fx（engine L9793-9797 子集——恒 2 掷 seed+dir；r 默认 1）
  Fx(kind, x, y, ttl, opts) {
    const o = opts ?? {};
    const e = {
      kind, x, y, ttl,
      seed: Math.floor(this.Rng() * 65536),
      dir: this.Rng() * Math.PI * 2,
      r: o.r ?? 1, age: 0,
      x0: o.x0 ?? x, y0: o.y0 ?? y,
      quiet: o.quiet ?? false, dmg: o.dmg,
    };
    this.effects.push(e);
    return e;
  }
  addEvent(kind, text, opts) {
    const o = opts ?? {};
    this.worldEvents.unshift({ kind, text, colorHex: o.colorHex, x: o.x, y: o.y, id: this.eventSeq++ });
    if (this.worldEvents.length > 80) this.worldEvents.pop();
  }
  toast(text, tone) { if (this.onToast) this.onToast({ id: this.toastSeqSeq(), text, tone }); }
  toastSeqSeq() { return this._tseq = (this._tseq ?? 0) + 1; }

  markDirty(i) {                                            // engine markDirty 镜像（本格 + 4 邻十字）
    this.dirty.add(i);
    const x = i % W, y = (i / W) | 0;
    if (x > 0) this.dirty.add(i - 1);
    if (x < W - 1) this.dirty.add(i + 1);
    if (y > 0) this.dirty.add(i - W);
    if (y < H - 1) this.dirty.add(i + W);
  }
  landForDepth(t) { return t !== T.DEEP && t !== T.WATER && t !== T.ICE; }   // engine L1017-1019
  waterTierAt(i) {                                            // engine waterTierAt 镜像
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
  refreshWaterTierAround(i) {                                  // engine refreshWaterTierAround 镜像（7x7 窗水域 tier 变化 → dirty）
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
  setTerrain(i, t) {                     // setTerrain 级联全镜像（真蓝本 L975-1013——ambTouch 渲染候选面非 dirty 略）
    const prev = this.terrain[i];
    if (prev === t) return;               // L971 同值早退
    this.terrain[i] = t;                 // L972
    this.markDirty(i);                   // L983 markDirty（本格+4邻十字）
    this.propsDirty.add(i);              // L984 无条件
    this.regrow.delete(i);               // L986
    if (prev === T.ICE) this.frozen.delete(i);      // L989 prev ICE 贴花失效
    if (t === T.ICE) this.frozen.add(i);            // L990
    if (t !== T.WATER) this.flood.delete(i);        // L991（门 t!==WATER——DEEP 不删）
    if (t !== T.SAND) this.wet.delete(i);           // L992
    if (!(t === T.WATER || t === T.DEEP) && this.riverDir[i] > 0) { this.riverDir[i] = 0; this.riverTiles.delete(i); }   // L995-998
    if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }   // L999-1002
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.owner[i] >= 0) { this.owner[i] = -1; this.markDirty(i); }   // L1003-1006
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.building[i] > 0) this.destroyBuilding(i);   // L1007-1010
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.road[i] > 0) this.road[i] = 0;   // L1011-1012
    this.refreshWaterTierAround(i);      // L1013 水深场局部重算
  }
  destroyBuilding(i) {                   // engine destroyBuilding 镜像（bIdx 交换删除 + smoke fx 2 掷）
    const bi = this.bIdx.get(i);
    if (bi === undefined) return;
    const b = this.buildings[bi];
    const last = this.buildings.pop();
    if (bi < this.buildings.length) { this.buildings[bi] = last; this.bIdx.set(last.i, bi); }
    this.bIdx.delete(i);
    this.building[i] = 0;
    this.bHp.delete(i);
    this.damagedSet.delete(i);
    this.Fx('smoke', b.x, b.y, 36, { r: 1.5 });
  }

  // ---- nature.ts L132-166 recomputePlates（镜像） ----
  recomputePlates() {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let best = 0, bestD = Infinity;
        for (let p = 0; p < this.plateN; p++) {
          const jit = valueNoise(x / 22, y / 22, this.natureSeed + 900 + p * 37) * 34 - 17;   // L140
          const d = (x + jit - this.plateCx[p]) ** 2 + (y - this.plateCy[p]) ** 2;             // L141
          if (d < bestD) { bestD = d; best = p; }                                              // L142
        }
        this.plate[y * W + x] = best;                                                          // L144
      }
    }
    this.boundary.clear();                                                                     // L147
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;                                                                   // L150
        const p = this.plate[i];                                                               // L151
        if ((x > 0 && this.plate[i - 1] !== p) || (x < W - 1 && this.plate[i + 1] !== p) || (y > 0 && this.plate[i - W] !== p) || (y < H - 1 && this.plate[i + W] !== p)) {
          this.boundary.add(i);                                                                // L154
        } else if (this.stress[i] > 0) {
          this.stress[i] = 0;                                                                  // L156
        }
      }
    }
  }

  // ---- nature.ts L213-241 seasonCheck（镜像） ----
  seasonCheck() {
    const s = this.NatureSeason();                                                              // L214
    if (s !== this.lastSeason) {                                                                // L215
      const first = this.lastSeason < 0;                                                        // L216
      this.lastSeason = s;                                                                      // L217
      if (s !== 3) this.iceChronDone = false;                                                    // L218
      if (s !== 3) this.snowmanChronDone = false;                                                // L219
      if (s !== 0) this.thawChronDone = false;                                                   // L220
      for (let i = 0; i < W * H; i++) {                                                          // L222
        this.dirty.add(i);                                                                      // L223
        if (this.terrain[i] === T.FOREST) this.propsDirty.add(i);                                // L224
      }
      if (first) return;                                                                         // L227
      if (s === 0) {                                                                             // L229
        this.toast('春回大地——草木返青，万物复苏，树人开始了春播', 'good');                          // L230
        this.addEvent('season', '春回大地：万物复苏，草木返青（生物节律 · 春播加成）');               // L231
      } else if (s === 1) {                                                                      // L232
        this.toast('盛夏来临——烈日当空，野火更易燎原', 'info');                                     // L233
        this.addEvent('season', '盛夏来临：烈日当空，野火更易燎原（火险上升）');                      // L234
      } else if (s === 2) {                                                                      // L235
        this.toast('秋色渐染——金风送爽，林梢染红，大地进入收获的季节', 'info');                       // L236
        this.addEvent('season', '秋色渐染：金风送爽，林梢染红（草木生长放缓）');                     // L237
      } else {                                                                                   // L238
        this.toast('寒冬降临——霜封大地，蛇虫蛰伏，亡灵在长夜中愈发活跃', 'danger');                   // L239
        this.addEvent('season', '寒冬降临：霜封大地，蛇虫蛰伏，死灵在长夜中愈发活跃');                // L240
      }
    }
  }
  NatureSeason() {   // nature.ts L160-163 getter 镜像（SEASON_YEARS=2）
    if (!this.laws.seasons) return 1;
    let s = (Math.floor(this.yearF / 2) + this.seasonOffset) % 4;
    return s < 0 ? s + 4 : s;
  }

  // ---- nature.ts L781-828 tectonicTick（镜像） ----
  tectonicTick() {
    if (!this.laws.tectonics) return;                                                           // L783
    this.plateEpoch++;                                                                          // L785
    const DK = 0.55;                                                                            // L786
    for (let p = 0; p < this.plateN; p++) {                                                      // L787
      this.plateCx[p] = Math.max(16, Math.min(W - 16, this.plateCx[p] + this.drift[p].dx * DK)); // L788
      this.plateCy[p] = Math.max(10, Math.min(H - 10, this.plateCy[p] + this.drift[p].dy * DK)); // L789
    }
    if (this.plateEpoch % 4 === 0) this.recomputePlates();                                       // L791
    const acc = 0.85;                                                                            // L793
    for (const i of this.boundary) {                                                             // L794
      const x = i % W;                                                                          // L795
      const y = (i / W) | 0;                                                                    // L796
      const p = this.plate[i];                                                                   // L797
      let np = p, ndx = 0, ndy = 0;                                                              // L799-800
      if (x > 0 && this.plate[i - 1] !== p) { np = this.plate[i - 1]; ndx = -1; }                 // L801
      else if (x < W - 1 && this.plate[i + 1] !== p) { np = this.plate[i + 1]; ndx = 1; }         // L802
      else if (y > 0 && this.plate[i - W] !== p) { np = this.plate[i - W]; ndy = -1; }            // L803
      else if (y < H - 1 && this.plate[i + W] !== p) { np = this.plate[i + W]; ndy = 1; }         // L804
      if (np === p) continue;                                                                    // L806
      const dA = this.drift[p];                                                                   // L807
      const dB = this.drift[np];                                                                  // L808
      const conv = (dB.dx - dA.dx) * ndx + (dB.dy - dA.dy) * ndy;                                 // L810
      if (conv > 0) this.stress[i] += conv * acc * 1.6;                                          // L811
      else this.stress[i] = Math.max(0, this.stress[i] + conv * 0.5);                             // L812
    }
    for (const h of this.hotspots) h.heat = Math.min(3, h.heat + 0.09 + (this.stress[h.y * W + h.x] || 0) * 0.008);   // L815
    let done = 0;                                                                                // L817
    for (const i of this.boundary) {                                                             // L818
      if (NAT_RED === 'quake') continue;   // 红证旋钮：禁释放检查（L819 stress<26 恒真镜像）
      if (this.stress[i] < 26) continue;                                                          // L819（ep 默认 26）
      this.releaseQuake(i);                                                                       // L820
      if (++done >= 2) break;                                                                     // L821
    }
    if (!this.laws.atmosphere && this.ash > 0) {                                                  // L824
      this.ash = Math.max(0, this.ash * 0.9 - 0.006);                                            // L825
      this.ashF.fill(this.ash);                                                                   // L826
    }
  }

  // ---- nature.ts L831-881 releaseQuake（镜像） ----
  releaseQuake(i) {
    const x = i % W;                                                                             // L834
    const y = (i / W) | 0;                                                                       // L835
    let energy = 0;                                                                              // L836
    const zapped = [];                                                                            // L837
    for (let yy = Math.max(0, y - 6); yy <= Math.min(H - 1, y + 6); yy++) {                        // L838
      for (let xx = Math.max(0, x - 6); xx <= Math.min(W - 1, x + 6); xx++) {                      // L839
        const j = yy * W + xx;                                                                    // L840
        if (!this.boundary.has(j)) continue;                                                      // L841
        if (Math.hypot(xx - x, yy - y) > 6) continue;                                             // L842
        if (this.stress[j] > 26 * 0.7) {                                                          // L843
          energy += this.stress[j];                                                                // L844
          zapped.push(j);                                                                          // L845
        }
      }
    }
    for (const j of zapped) this.stress[j] = 0;                                                  // L848
    if (energy < 10) return;                                                                     // L849
    const m = Math.min(8.8, 4.2 + Math.log2(1 + energy) * 0.42);                                 // L852
    this.natCounters[0]++;                                                                        // L853
    if (m >= 6.5) this.natCounters[1]++;                                                          // L854
    this.rqX.unshift(x); this.rqY.unshift(y); this.rqM.unshift(Math.round(m * 10) / 10); this.rqYear.unshift(Math.floor(this.yearF));   // L855
    if (this.rqX.length > 6) { this.rqX.pop(); this.rqY.pop(); this.rqM.pop(); this.rqYear.pop(); }   // L856
    this.natureQuake(x + 0.5, y + 0.5, m);                                                        // L857
    const ti = y * W + x;                                                                        // L860
    const t = this.terrain[ti];                                                                   // L861
    if ((t === T.WATER || t === T.DEEP) && m >= 6.8) {                                            // L862
      this.tsunami(x, y, 4 + (m - 6.8) * 4);                                                      // L863
      this.natCounters[6]++;                                                                      // L864
    } else if (m >= 7.4 && this.Rng() < 0.35) {                                                    // L865
      let coast = false;                                                                          // L866
      for (let k = 0; k < 4 && !coast; k++) {                                                      // L867
        const xx = x + (k === 0 ? -4 : k === 1 ? 4 : 0);                                          // L868
        const yy = y + (k === 2 ? -4 : k === 3 ? 4 : 0);                                          // L869
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                                      // L870
        if (this.terrain[yy * W + xx] === T.WATER || this.terrain[yy * W + xx] === T.DEEP) coast = true;   // L871
      }
      if (coast) { this.tsunami(x, y, 4); this.natCounters[6]++; }                                 // L873
    }
    if (m >= 6 && this.Rng() < 0.4) {                                                             // L876
      for (const j of zapped) if (this.Rng() < 0.3) this.stress[j] = 26 * 0.4 * this.Rng();       // L878
    }
  }

  // ---- engine.ts L10561-10590 natureQuake（镜像） ----
  natureQuake(x, y, m) {
    /* onSound?.('quake') 宿主面 */                                                                // L10562
    this.lastCatX = x; this.lastCatY = y; this.lastCatTick = this.tickCount;                      // L10564
    const r = Math.round(2 + (m - 4.4) * 4.2);                                                    // L10565
    const dur = Math.round(24 + (m - 4.4) * 34);                                                  // L10566
    this.Fx('quake', x, y, dur, { r });                                                            // L10567
    this.shake = Math.min(14, Math.round(3 + (m - 4.4) * 4.5));                                    // L10568
    const intensity = (m - 4.4) / 4.8;                                                             // L10569
    const rr = Math.ceil(r);                                                                      // L10571
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {                                        // L10572
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {                                      // L10573
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                                      // L10574
        const d = Math.hypot(xx + 0.5 - x, yy + 0.5 - y);                                          // L10575
        if (d > r) continue;                                                                       // L10576
        const i = idx(xx, yy);                                                                      // L10577
        const falloff = 1 - d / (r + 0.5);                                                          // L10578
        if (this.building[i] > 0 && this.Rng() < 0.32 * intensity * falloff) this.attackBuilding(i, 40 + 90 * intensity);   // L10579
        if (m >= 7 && this.Rng() < 0.05 * intensity * falloff) {                                   // L10580
          const t = this.terrain[i];                                                                // L10581
          if (t === T.GRASS || t === T.FOREST) this.setTerrain(i, T.BURNT);                          // L10582
        }
      }
    }
    for (const u of this.units) {                                                                  // L10586
      if (u.dead) continue;                                                                        // L10587
      const d = Math.hypot(u.x - x, u.y - y);                                                      // L10588
      if (d > r + 1) continue;                                                                     // L10589
      const dmg = (12 + 70 * intensity) * Math.max(0.2, 1 - d / (r + 1));                          // L10590
      u.hp -= dmg;                                                                                 // L10591
      u.hurtN = 20;                                                                                // L10592
      if (u.hp <= 0) u.dead = true;                                                                 // L10593
    }
    this.addEvent('geo', `里氏 ${m.toFixed(1)} 级强震撼动了大地${m >= 7 ? '，山川易色，屋舍成墟' : m >= 6 ? '，墙垣迸裂' : ''}`, { x, y });   // L10595
    if (m >= 7) this.toast(`${m.toFixed(1)} 级强震！`, 'danger');                                   // L10596
  }
  attackBuilding(i, dmg) {   // engine L4452-4467 镜像（零 rng——hit fx 2 掷；摧毁支 destroyBuilding smoke 2 掷——bHp/def.hp 面）
    const kind = this.building[i];
    if (kind === 0) return;
    let hp = this.bHp.get(i) ?? 70;   // BUILDING_DEFS[1].hp=70（house——黄金 S4 门全不中未触达摧毁面；受损支在位）
    hp -= dmg;
    const x = i % W, y = (i / W) | 0;
    if (hp <= 0) {
      this.destroyBuilding(i);   // onBuildingDestroyed byCiv=-1 天灾零战争结算 → destroyBuilding
    } else {
      this.bHp.set(i, hp);
      this.damagedSet.add(i);
      this.Fx('hit', x + 0.5, y + 0.5, 6);
    }
  }

  // volcano 生成器镜像（engine L10746-10777 全对齐）
  volcano(x, y, power = 1) {
    const pw = Math.max(1, Math.min(3, power));                                                    // L10747
    const cx = Math.max(2, Math.min(W - 3, Math.floor(x)));                                         // L10748
    const cy = Math.max(2, Math.min(H - 3, Math.floor(y)));                                         // L10749
    for (let dy = -2; dy <= 2; dy++) {                                                              // L10752 锥体
      for (let dx = -2; dx <= 2; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(dx, dy) <= 2.3) this.setTerrain(idx(xx, yy), T.MOUNTAIN);
      }
    }
    this.setTerrain(idx(cx, cy), T.LAVA);                                                            // L10760 山口
    if (pw >= 2) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.setTerrain(idx(cx + dx, cy + dy), T.LAVA); }   // L10761 十字
    if (pw >= 3) { for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.setTerrain(idx(cx + dx, cy + dy), T.LAVA); }   // L10764 3x3
    const ring = 3.5 * pw;                                                                            // L10767
    for (let k = 0; k < 8; k++) {                                                                      // L10768 引燃圈
      const ang = (k / 8) * Math.PI * 2;
      const j = idx(Math.floor(cx + Math.cos(ang) * ring), Math.floor(cy + Math.sin(ang) * ring));
      if (j >= 0 && j < W * H) this.ignite(j);
    }
    this.Fx('volcano', cx + 0.5, cy + 0.5, 110);                                                       // L10772（无 opts——r 默认 1）
    this.shake = Math.max(this.shake, 6 + pw * 2);                                                     // L10773（直写 max 非 min）
    this.addEvent('volcano', pw > 1 ? `大地震颤，一座火山拔地而起，熔岩以烈度 ${pw} 喷薄而出` : '大地震颤，一座火山拔地而起，岩浆喷薄而出', { x: cx, y: cy });   // L10775 kind=volcano
  }
  ignite(i) {                                                                                          // engine L1075-1081 镜像
    const t = this.terrain[i];
    if (this.fire[i] > 0) return;
    if (!(t === T.GRASS || t === T.FOREST) && this.building[i] === 0) return;
    this.fire[i] = 150 + Math.floor(this.Rng() * 90);
    this.fireSet.add(i);
  }
  tsunami(x, y, r) {                                                                                   // engine L10780-10785 镜像
    const rr = Math.max(6, Math.min(30, r * 2.5));                                                      // L10781
    this.Fx('tsunami', x, y, 42, { r: rr });
    this.addEvent('tsunami', '滔天巨浪涌来，漫过了低地与海岸线', { x, y });                                    // L10784（无 shake 面）
  }

  // ---- nature.ts L882-1061 geologyTick（镜像） ----
  geologyTick() {
    if (!this.laws.tectonics) return;                                                               // L884
    // 1. 造山带
    for (let tr = 0; tr < 2; tr++) {                                                                 // L886
      const cand = [];                                                                              // L887
      for (const i of this.boundary) if (this.stress[i] > 9) cand.push(i);                           // L888
      if (cand.length === 0) break;                                                                  // L889
      const start = cand[Math.floor(this.Rng() * cand.length)];                                      // L891
      let cur = start;                                                                              // L892
      let dirX = 0, dirY = 0, mount = 0;                                                             // L893-894
      const steps = 5 + Math.floor(this.Rng() * 6);                                                  // L895
      for (let s = 0; s < steps; s++) {                                                              // L896
        const t = this.terrain[cur];                                                                 // L897
        if (t === T.HILL) {                                                                          // L898
          if (this.Rng() < 0.5) { this.setTerrain(cur, T.MOUNTAIN); this.natCounters[3]++; mount++; } // L899
        } else if (t === T.GRASS || t === T.FOREST) {                                                 // L900
          if (this.Rng() < 0.35) { this.setTerrain(cur, T.HILL); this.natCounters[3]++; }             // L901
        }
        let best = -1, bestDot = -2;                                                                  // L904-905
        const cx0 = cur % W;                                                                         // L906
        const cy0 = (cur / W) | 0;                                                                    // L907
        for (let dy = -1; dy <= 1; dy++) {                                                            // L908
          for (let dx = -1; dx <= 1; dx++) {                                                          // L909
            if (dx === 0 && dy === 0) continue;                                                        // L910
            const xx = cx0 + dx;                                                                       // L911
            const yy = cy0 + dy;                                                                       // L912
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                                      // L913
            const j = yy * W + xx;                                                                      // L914
            if (!this.boundary.has(j)) continue;                                                        // L915
            if (dx === -dirX && dy === -dirY) continue;                                                 // L916
            const dl = Math.hypot(dx, dy);                                                              // L917
            const dot = (dx * dirX + dy * dirY) / (dl * (Math.hypot(dirX, dirY) || 1));                 // L918
            if (dot > bestDot) { bestDot = dot; best = j; }                                             // L919
          }
        }
        if (best < 0) break;                                                                            // L921
        dirX = (best % W) - cx0;                                                                        // L922
        dirY = ((best / W) | 0) - cy0;                                                                   // L923
        cur = best;                                                                                     // L924
      }
      if (mount >= 4 && this.natCounters[3] % 10 < 2) {                                                 // L927
        this.addEvent('geo', '沿着会聚边界的缝合线，一条新的山脉链正缓缓隆起——未来它将截断信风制造荒漠', { x: start % W, y: (start / W) | 0 });   // L928
      }
    }
    // 1b. 岛弧
    if (this.Rng() < 0.12) {                                                                           // L943
      const cand = [];                                                                                // L944
      for (const i of this.boundary) {                                                                 // L945
        if (this.stress[i] < 6) continue;                                                              // L946
        const t = this.terrain[i];                                                                     // L947
        if (t !== T.WATER && t !== T.DEEP) continue;                                                    // L948
        cand.push(i);                                                                                  // L949
      }
      if (cand.length > 0) {                                                                            // L951
        const i = cand[Math.floor(this.Rng() * cand.length)];                                           // L952
        const x = i % W;                                                                               // L953
        const y = (i / W) | 0;                                                                          // L954
        this.setTerrain(i, T.MOUNTAIN);                                                                 // L955
        for (let k = 0; k < 4; k++) {                                                                    // L956
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);                                               // L957
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);                                               // L958
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                                          // L959
          const nt = this.terrain[yy * W + xx];                                                          // L960
          if ((nt === T.WATER || nt === T.DEEP) && this.Rng() < 0.7) this.setTerrain(yy * W + xx, T.SAND);   // L960
        }
        this.natCounters[3]++;                                                                           // L962
        this.addEvent('geo', '深海之下，俯冲带搓出的火山终于升出海面——一座新的火山岛在浪花中诞生', { x, y });       // L963
      }
    }
    // 2. 侵蚀与沉积
    for (let tr = 0; tr < 4; tr++) {                                                                     // L967
      const x = 1 + Math.floor(this.Rng() * (W - 2));                                                    // L968
      const y = 1 + Math.floor(this.Rng() * (H - 2));                                                    // L969
      const i = y * W + x;                                                                               // L970
      const t = this.terrain[i];                                                                          // L971
      if (t === T.MOUNTAIN && this.Rng() < 0.22) {                                                        // L972
        let lower = false;                                                                                // L974
        for (let k = 0; k < 4 && !lower; k++) {                                                            // L975
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);                                                 // L976
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);                                                 // L977
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                                            // L978
          const nt = this.terrain[yy * W + xx];                                                            // L979
          if (nt !== T.MOUNTAIN && nt !== T.LAVA) lower = true;                                            // L980
        }
        if (lower) { this.setTerrain(i, T.HILL); this.natCounters[4]++; }                                   // L981
      } else if (t === T.WATER) {                                                                          // L983
        let landN = 0;                                                                                     // L985
        for (let k = 0; k < 4; k++) {                                                                       // L986
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);                                                 // L987
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);                                                 // L988
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                                            // L989
          const nt = this.terrain[yy * W + xx];                                                            // L990
          if (nt !== T.WATER && nt !== T.DEEP) landN++;                                                    // L991
        }
        if (landN >= 3 && this.Rng() < 0.3) { this.setTerrain(i, T.SAND); this.natCounters[4]++; }          // L993
      } else if (t === T.LAVA && this.Rng() < 0.4) {                                                       // L994
        this.setTerrain(i, T.BURNT);                                                                       // L995
      }
    }
    // 3. 火山热点喷发
    for (const h of this.hotspots) {                                                                       // L989
      if (NAT_RED === 'volc') continue;   // 红证旋钮：禁热点喷发（L990 门恒假镜像）
      if (h.heat < 2.6 || this.Rng() > 0.3) continue;                                                       // L990
      h.heat = 0.4;                                                                                        // L991
      const pw = (this.stress[h.y * W + h.x] || 0) > 14 ? 3 : 2;                                            // L992
      this.volcano(h.x, h.y, pw);                                                                          // L993
      this.natCounters[2]++;                                                                                // L994
      const cell = this.cellOf(h.x, h.y);                                                                    // L996
      const inject = (pw === 3 ? 0.55 : 0.3) * (1 - this.ashF[cell]);                                        // L997
      this.ashF[cell] = Math.min(1, this.ashF[cell] + inject);                                              // L998
      const cxx = cell % AW;                                                                                // L999
      const cyy = (cell / AW) | 0;                                                                          // L1000
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {                                           // L1001
        const nx = cxx + ox;                                                                                // L1002
        const ny = cyy + oy;                                                                                // L1003
        if (nx < 0 || ny < 0 || nx >= AW || ny >= AH) continue;                                             // L1004
        this.ashF[ny * AW + nx] = Math.min(1, this.ashF[ny * AW + nx] + inject * 0.4);                      // L1005
      }
      const before = this.ash;                                                                              // L1008
      let sum = 0;                                                                                          // L1009
      for (let k = 0; k < AW * AH; k++) sum += this.ashF[k];                                                // L1010
      this.ash = sum / (AW * AH);                                                                            // L1010
      if (before < 0.3 && this.ash >= 0.3) {                                                                // L1012
        this.addEvent('geo', '「无夏之年」——火山灰遮蔽了天空，阳光变得苍白，霜线向赤道蔓延，田畴将歉收数年', {});
        this.toast('火山冬降临：全球气候骤冷', 'danger');                                                       // L1014
      } else if (pw === 3) {                                                                                // L1015
        this.addEvent('geo', '剧烈的普林尼式喷发把火山灰送上高空，灰云开始随风漂散', { x: h.x, y: h.y });              // L1016
      }
      const pHere = this.plate[Math.min(W * H - 1, Math.max(0, h.y * W + h.x))];                             // L1019
      h.x = Math.max(4, Math.min(W - 5, Math.round(h.x - this.drift[pHere].dx * 5)));                        // L1020
      h.y = Math.max(4, Math.min(H - 5, Math.round(h.y - this.drift[pHere].dy * 5)));                        // L1021
    }
    // 4. 裂谷拉张
    if (this.Rng() < 0.35) {                                                                                // L1024
      const bl = [...this.boundary];                                                                        // L1025
      const i = bl[Math.floor(this.Rng() * bl.length)];                                                      // L1026
      if (i != null) {                                                                                      // L1026
        const p = this.plate[i];                                                                            // L1027
        const x = i % W;                                                                                    // L1028
        const y = (i / W) | 0;                                                                              // L1029
        let np = p;                                                                                          // L1030
        if (x > 0 && this.plate[i - 1] !== p) np = this.plate[i - 1];                                        // L1031
        else if (x < W - 1 && this.plate[i + 1] !== p) np = this.plate[i + 1];                               // L1032
        else if (y > 0 && this.plate[i - W] !== p) np = this.plate[i - W];                                   // L1033
        else if (y < H - 1 && this.plate[i + W] !== p) np = this.plate[i + W];                               // L1034
        const conv = (this.drift[np].dx - this.drift[p].dx) + (this.drift[np].dy - this.drift[p].dy);        // L1036
        if (conv < -0.2) {                                                                                   // L1037
          const t = this.terrain[i];                                                                          // L1038
          if (t === T.MOUNTAIN && this.Rng() < 0.3) { this.setTerrain(i, T.HILL); this.natCounters[4]++; }    // L1039
          else if (t === T.HILL && this.Rng() < 0.18) { this.setTerrain(i, T.GRASS); this.natCounters[4]++; } // L1040
          else if (t === T.GRASS && this.Rng() < 0.1) {                                                        // L1041
            let waterAdj = 0;                                                                                  // L1043
            for (let k = 0; k < 4; k++) {                                                                       // L1044
              const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);                                                  // L1045
              const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);                                                  // L1046
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                                             // L1047
              const nt = this.terrain[yy * W + xx];                                                              // L1048
              if (nt === T.WATER || nt === T.DEEP) waterAdj++;                                                  // L1049
            }
            if (waterAdj > 0) {                                                                                  // L1052
              this.setTerrain(i, T.WATER);                                                                        // L1053
              this.addEvent('geo', '裂谷的拉张撕开了陆缘，海水涌入新的地堑', { x, y });                                  // L1054
            }
          }
        }
      }
    }
  }
  cellOf(x, y) {                                                                                            // L350-355 镜像
    const cx = clamp((x / CELL) | 0, 0, AW - 1);
    const cy = clamp((y / CELL) | 0, 0, AH - 1);
    return cy * AW + cx;
  }
  dumpNature() {
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
      ash: f64hex(this.ash),
      rainCellMd5: md5hex(this.rainCell),
      counters: this.natCounters,
      recentQuakes: this.rqX.map((x, k) => ({ x, y: this.rqY[k], m: f64hex(this.rqM[k]), year: this.rqYear[k] })),
      lastSeason: this.lastSeason,
      epoch: this.plateEpoch,
      yearF: f64hex(this.yearF),
      stormSeq: this.stormSeq,
    };
  }
}

function f64of(hex) { const b = Buffer.from(hex, 'hex'); return b.readDoubleLE(0); }

// ---- 黄金回放 + 逐步对账 ----
const golden = JSON.parse(readFileSync(new URL('./golden/nature.json', import.meta.url), 'utf8'));
let pass = 0;
for (const sc of golden.scenarios) {
  const eng = new NatEng(sc);
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });
  eng.rngA = sc.seed >>> 0;
  let ok = true;
  const diffs = [];
  const cmp = (path, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) { ok = false; diffs.push(`${path}: ${JSON.stringify(a).slice(0, 90)} ≠ ${JSON.stringify(b).slice(0, 90)}`); } };
  for (let si = 0; si < sc.stepsSnap.length; si++) {
    const call = sc.stepsSnap[si];
    if (call.preYear !== undefined && call.preYear !== null) eng.yearF = call.preYear;   // season 场景年相推进（stepsSnap 固化值直赋）
    const [obj, fn] = call.fn.startsWith('nt.') ? [eng, call.fn.slice(3)] : [eng, call.fn];
    obj[fn](...call.args);
    const snap = sc.stepsSnap[si];
    cmp(`s${si}.rngA`, (eng.rngA >>> 0).toString(16).padStart(8, '0'), snap.rngA);
    cmp(`s${si}.terrainMd5`, md5hex(eng.terrain), snap.terrainMd5);
    cmp(`s${si}.fxCount`, eng.effects.length, snap.fxCount);
    cmp(`s${si}.eventsCount`, eng.worldEvents.length, snap.eventsCount);
    cmp(`s${si}.shake`, eng.shake, snap.shake);
    cmp(`s${si}.dirtyN`, eng.dirty.size, snap.dirtyN);
    cmp(`s${si}.propsDirtyN`, eng.propsDirty.size, snap.propsDirtyN);
    const nat = eng.dumpNature();
    for (const k of ['plateN', 'plateMd5', 'plateC', 'drift', 'boundaryN', 'boundaryMd5', 'stressMd5', 'hotspots', 'moistMd5', 'ashFMd5', 'ash', 'rainCellMd5', 'counters', 'recentQuakes', 'lastSeason', 'epoch', 'yearF', 'stormSeq']) {
      cmp(`s${si}.nat.${k}`, nat[k], snap.nat[k]);
    }
  }
  // 终态对账
  cmp('terrain', md5hex(eng.terrain), md5hex(Buffer.from(gunzip(sc.terrain))));
  cmp('nat', eng.dumpNature(), sc.nat);
  cmp('fx', eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null, age: e.age, quiet: e.quiet ? 1 : 0 })), sc.fx);
  cmp('events', eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null })), sc.events);
  cmp('units', eng.units.map((u) => ({ id: u.id, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), hurt: f64hex(u.hurtN ?? 0), dead: u.dead ? 1 : 0 })), sc.units);
  cmp('toasts', toasts, sc.toasts);
  if (ok) { pass++; console.log(`  ${sc.key}: PASS (${sc.totalDraws} 掷)`); }
  else { console.log(`  ${sc.key}: FAIL\n    ${diffs.slice(0, 4).join('\n    ')}`); }
}
console.log(`nature transcript: ${pass}/${golden.scenarios.length} 场景逐位 ${pass === golden.scenarios.length ? 'ALL PASS' : 'FAIL'}`);
