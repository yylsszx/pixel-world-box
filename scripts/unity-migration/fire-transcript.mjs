// ============================================================================
// fire-transcript.mjs —— M-U9b fire 域零引擎导入镜像（fire.json 对账面）
// 零 engine import：fireTick L2772-2821 + ignite L1072-1078 + windAt L356-420 +
//   cellOf/fireMul/regrowMul/itczLat/jetMul（nature.ts L309-420）+ soilMulAt（worldsim
//   L168-170）+ destroyBuilding L1936-1955（smoke fx）+ setTerrain 贴花级联子集
//   （L971/972/979/981-984/990-993——riverDir/owner/building-road/refreshWaterTier
//   夹具零值域结构性不触达，注记省略）全按蓝本机械重写于本文件。
// 数学面：Math.exp/hypot 原生（bun fdlibm——与 gen 同 runtime 同位；C# 侧 FdExp/V8Hypot
//   位精确件对账——WbFireTests 闭合）；valueNoise 自 noise.ts L12-42 机械重写（纯整域算术）。
// 活迭代语义：fireSet JS Set for...of（体内 ignite add 追加项当 tick 即燃 / setTerrain
//   灭 delete 未达项跳过）——镜像与 gen 同为 JS 原生；C# 侧队列仿真对账（WbFireTests）。
// 运行：bun scripts/unity-migration/fire-transcript.mjs（M-U7w 口径：黄金链一律 bun）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 蓝本常量（types.ts/constants.ts 逐值镜像——零导入） ----
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const isWater = (t) => t === T.DEEP || t === T.WATER;   // constants.ts L67-69 语义闸门
const FLAMMABLE = [T.GRASS, T.FOREST];                  // constants.ts L65
const W = 256, H = 160, N = W * H;
const AW = Math.floor(W / 8), AH = Math.floor(H / 8), CELL = 8;   // nature.ts L17-19
const idx = (x, y) => y * W + x;
const SEASON_YEARS = 2;                                 // nature.ts L21
const EP_FIRE_SPREADMUL = 1;                            // engineParams.ts L30 fire.spreadMul value=1（内联注记——M-U7m ep 先例）
const EP_ECO_REGROWBASE = 700;                          // engineParams.ts L28 eco.regrowBase value=700

// ---- 数学件（noise.ts L12-42 机械重写——纯整域算术零 libm） ----
function hash2(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const smooth = (t) => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const v00 = hash2(xi, yi, seed);
  const v10 = hash2(xi + 1, yi, seed);
  const v01 = hash2(xi, yi + 1, seed);
  const v11 = hash2(xi + 1, yi + 1, seed);
  const sx = smooth(xf);
  const sy = smooth(yf);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}
function mulberryDraw(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };
const unhex = (h) => { const b = Buffer.from(h, 'hex'); return b.readDoubleLE(0); };
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const ungz = (b64) => new Uint8Array(zlib.gunzipSync(Buffer.from(b64, 'base64')));

// ---- 零引擎镜像世界 ----
class MirrorWorld {
  constructor(sc) {
    const fx = sc.fixture;
    this.terrain = ungz(fx.terrain0);
    this.fire = ungz(fx.fire0);
    this.fireSet = new Set(fx.fireSet0);
    this.soilF = ungz(fx.soil0);
    this.glacier = ungz(fx.glacier0);
    this.rainCell = ungz(fx.rain0);
    this.windPhase = unhex(fx.windPhase);
    this.seed = fx.natureSeed;
    this.pSystems = fx.pSystems.map((p) => ({ x: unhex(p.x), y: unhex(p.y), kind: p.kind, str: unhex(p.str) }));
    this.storms = fx.storms.map((s) => ({ x: unhex(s.x), y: unhex(s.y), strength: unhex(s.strength) }));
    this.regrow = new Map(fx.regrow0);
    this.frozen = new Set(fx.frozen0);
    this.flood = new Map();
    this.wet = new Map();
    this.buildings = fx.building0.map((b) => ({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: -1 }));
    this.bIdx = new Map(fx.building0.map((b, k) => [b.i, k]));
    this.building = new Uint8Array(N);
    for (const b of fx.building0) this.building[b.i] = b.kind;
    this.bHp = new Map();
    this.damagedSet = new Set();
    this.effects = [];
    this.worldEvents = [];
    this.yearF = sc.yearF;
    this.tickCount = sc.tickCount;
    this.seasons = sc.seasons;
    this.rngA = sc.seed >>> 0;
  }
  rng() {
    const r = mulberryDraw(this.rngA);
    this.rngA = r.a;
    return r.v;
  }
  season() {                              // nature.ts L160-163 getter 同构
    if (!this.seasons) return 1;
    let s = Math.floor(this.yearF / SEASON_YEARS) % 4;
    return s < 0 ? s + 4 : s;
  }
  itczLat() {                             // nature.ts L336-340（seasons 门 + 季节摆动）
    if (!this.seasons) return 0.5;
    const s = this.season();
    return 0.5 + (s === 1 ? 0.062 : s === 0 ? 0.034 : s === 2 ? -0.026 : -0.062);
  }
  jetMul() {                              // nature.ts L332-335
    const s = this.season();
    return s === 3 ? 1.35 : s === 1 ? 0.85 : 1;
  }
  cellOf(x, y) {                          // nature.ts L350-354
    const cx = Math.min(AW - 1, Math.max(0, (x / CELL) | 0));
    const cy = Math.min(AH - 1, Math.max(0, (y / CELL) | 0));
    return cy * AW + cx;
  }
  windAt(cx, cy) {                        // nature.ts L356-420 机械（exp/hypot 原生——bun fdlibm 与 gen 同位）
    const lat = cy / (AH - 1);
    const itcz = this.itczLat();
    const latA = Math.abs(lat - itcz) * 2;
    let u;
    if (latA < 0.32) u = -0.55 + latA * 0.9;
    else if (latA < 0.72) u = 0.75 - (latA - 0.32) * 0.35;
    else u = -0.45 + (latA - 0.72) * 1.6;
    const jet = this.jetMul();
    const g1 = Math.exp(-((latA - 0.38) ** 2) / 0.005);
    const g2 = Math.exp(-((latA - 0.62) ** 2) / 0.0098);
    u += (g1 * 0.55 + g2 * 0.95) * jet;
    const n = valueNoise(cx / 6 + this.windPhase, cy / 6 - this.windPhase * 0.6, this.seed + 313) - 0.5;
    const n2 = valueNoise(cx / 9 - this.windPhase * 0.7, cy / 9 + this.windPhase * 0.4, this.seed + 727) - 0.5;
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
      const sx = st.x / CELL;
      const sy = st.y / CELL;
      const dx = cx - sx;
      const dy = cy - sy;
      const d = Math.hypot(dx, dy);
      if (d < 5 && d > 0.4) {
        const pull = (st.strength * 1.6) / (d * d + 1) * 0.8;
        u += (-dy / d) * pull;
        v += (dx / d) * pull;
      }
    }
    return [u, v];
  }
  fireMul(i) {                            // nature.ts L309-318（glacier 门 + season + rainCell 雨区）
    if (this.glacier[i] > 80) return 0;   // L312 冰上不燃（glacier>80）
    const s = this.season();
    let m = s === 3 ? 0.45 : s === 2 ? 0.8 : s === 0 ? 1.0 : 1.3;
    const c = this.cellOf(i % W, (i / W) | 0);
    if (this.rainCell[c] > 60) m *= 0.45; // L316 雨区难燃
    return m;
  }
  regrowMul() {                           // nature.ts L320-324（春 0.65/夏 0.9/秋 1.15/冬 2.0）
    const s = this.season();
    return s === 0 ? 0.65 : s === 1 ? 0.9 : s === 2 ? 1.15 : 2.0;
  }
  soilMulAt(i) {                          // worldsim.ts L168-170（0.6 贫瘠 ↔ 1.4 沃土）
    return 0.6 + (this.soilF[i] / 255) * 0.8;
  }
  fx(kind, x, y, ttl, opts) {             // engine fx L9781-9799（2 掷：seed+dir；r:1 默认 + opts 覆盖——L9795 spread 语义；cap 夹具不触达）
    const seed = Math.floor(this.rng() * 65536);
    const dir = this.rng() * Math.PI * 2;
    const e = { kind, x, y, ttl, seed, dir, r: 1 };
    if (opts) for (const k of Object.keys(opts)) e[k] = opts[k];
    this.effects.push(e);
  }
  addEvent(kind, text, x, y) {            // engine addEvent L13995-14009（unshift + cap 80）
    this.worldEvents.unshift({ kind, text, x: x ?? null, y: y ?? null });
    if (this.worldEvents.length > 80) this.worldEvents.length = 80;
  }
  destroyBuilding(i) {                    // engine L1936-1955 机械（swap-pop + smoke fx 2 掷）
    const bi = this.bIdx.get(i);
    if (bi === undefined) return;
    const b = this.buildings[bi];
    const civ = b.civ >= 0 ? { houses: 0, capital: 0 } : null;   // civs[b.civ]——夹具 civ=-1 恒 undefined（houses/capital 账不触，注记）
    if (civ) { civ.houses--; /* capital 门——夹具零触达域 */ }
    const last = this.buildings.pop();
    if (bi < this.buildings.length) {
      this.buildings[bi] = last;
      this.bIdx.set(last.i, bi);
    }
    this.bIdx.delete(i);
    this.building[i] = 0;
    this.bHp.delete(i);
    this.damagedSet.delete(i);
    this.fx('smoke', b.x, b.y, 36, { r: 1.5 });
  }
  setTerrain(i, t) {                      // engine L969-1007 机械（夹具零值域：riverDir/owner/road/refreshWaterTier 结构性不触达——注记省略）
    const prev = this.terrain[i];
    if (prev === t) return;               // L971
    this.terrain[i] = t;                  // L972
    this.regrow.delete(i);                // L979
    if (prev === T.ICE) this.frozen.delete(i);       // L981
    if (t === T.ICE) this.frozen.add(i);             // L982
    if (t !== T.WATER) this.flood.delete(i);         // L983
    if (t !== T.SAND) this.wet.delete(i);            // L984
    if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }   // L990-993 火焰奄灭
    // worldsim.onTerrainChanged L153-165 观测面（M-U9b——火烧扣地力 regrow 除子消费）：
    if (t === T.BURNT && this.soilF[i] > 8) this.soilF[i] -= 8;           // L157 火烧地力损耗
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.glacier[i] > 0) this.glacier[i] = 0;   // L159-163 冰川覆被清除（glacierTiles/dirty 计数面——非观测域注记）
    // L155 elev 场 / L164 driftAcc 场——worldsim 域未观测面注记省略
  }
  ignite(i) {                             // engine L1072-1078 机械
    const t = this.terrain[i];
    if (this.fire[i] > 0) return;
    if (!FLAMMABLE.includes(t) && this.building[i] === 0) return;
    this.fire[i] = 150 + Math.floor(this.rng() * 90);
    this.fireSet.add(i);
  }
  fireTick() {                            // engine L2772-2821 机械（活迭代=JS Set 原生；Uint8Array wrap 原生）
    if (this.fireSet.size === 0) return;  // L2773
    const done = [];                      // L2775（fireDone 复用列表语义——镜像独立分配）
    for (const i of this.fireSet) {       // L2776（活迭代——ignite 追加项当 tick 即燃）
      if (this.terrain[i] === T.ICE) {    // L2778 火焰落在冰面：脚下融冰
        this.setTerrain(i, T.WATER);      // meltIce L2892-2895 内联（terrain 已 ICE → setTerrain WATER）
        this.fire[i] = 0;
        done.push(i);
        continue;
      }
      this.fire[i] -= 5;                  // L2783（Uint8Array wrap：≢0 mod 5 强度回绕续燃——蓝本行为）
      if (this.fire[i] <= 0) { done.push(i); continue; }                   // L2784
      if (this.building[i] > 0 && this.fire[i] < 100) {                    // L2785
        this.destroyBuilding(i);
        done.push(i);
        continue;
      }
      if (this.rng() < 0.4) {             // L2789 蔓延尝试
        const x = i % W;
        const y = (i / W) | 0;
        const wcell = this.cellOf(x, y);
        const [wu, wv] = this.windAt(wcell % AW, (wcell / AW) | 0);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = idx(xx, yy);
            if (this.terrain[j] === T.ICE) { this.setTerrain(j, T.WATER); continue; }   // L2800 火焰融冰（meltIce 内联）
            const t = this.terrain[j];
            let p = (this.building[j] > 0 ? 0.25 : t === T.FOREST ? 0.13 : t === T.GRASS ? 0.05 : t === T.SNOW ? 0.008 : 0) * this.fireMul(j) * EP_FIRE_SPREADMUL;   // L2802
            const dl = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;                             // L2804
            const wproj = (wu * dx + wv * dy) / dl;                                       // L2805
            p *= wproj > 0.35 ? 2.1 : wproj < -0.35 ? 0.4 : 1;                            // L2806
            if (p > 0 && this.rng() < p) this.ignite(j);                                  // L2807
          }
        }
      }
    }
    for (const i of done) {               // L2813 熄灭列表
      this.fireSet.delete(i);
      this.fire[i] = 0;
      const t = this.terrain[i];
      if (t === T.FOREST || t === T.GRASS) {
        this.setTerrain(i, T.BURNT);      // L2823
        // 季节影响复苏速度 × 土壤肥力 × 热参数
        this.regrow.set(i, this.tickCount + Math.round((EP_ECO_REGROWBASE + Math.floor(this.rng() * 900)) / (this.regrowMul() * this.soilMulAt(i))));   // L2825
      }
    }
  }
}

// ---- 对账主循环 ----
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/fire.json'), 'utf8'));
const eq = (a, b, path_) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${path_} 漂移\n  镜像: ${JSON.stringify(a)}\n  黄金: ${JSON.stringify(b)}`);
};

let pass = 0;
for (const sc of gold.scenarios) {
  const m = new MirrorWorld(sc);
  for (let k = 0; k < sc.steps; k++) {
    m.fireTick();
    const g = sc.stepsSnap[k];
    eq((m.rngA >>> 0).toString(16).padStart(8, '0'), g.rngA, `${sc.key} S${k} rngA`);
    eq(md5hex(m.terrain), g.terrainMd5, `${sc.key} S${k} terrainMd5`);
    eq(md5hex(m.fire), g.fireMd5, `${sc.key} S${k} fireMd5`);
    eq([...m.fireSet], g.fireSet, `${sc.key} S${k} fireSet 序`);
    eq([...m.regrow.entries()], g.regrow, `${sc.key} S${k} regrow 序`);
    eq(m.effects.length, g.fxCount, `${sc.key} S${k} fxCount`);
    eq(m.worldEvents.length, g.eventsCount, `${sc.key} S${k} eventsCount`);
    eq(m.buildings.length, g.buildingsCount, `${sc.key} S${k} buildingsCount`);
  }
  eq(m.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r })), sc.fx, `${sc.key} fx 全列`);
  eq(m.worldEvents, sc.events, `${sc.key} events 全列`);
  console.log(`${sc.key}: 逐位 PASS (steps=${sc.steps} draws=${sc.totalDraws} fireSet=${m.fireSet.size})`);
  pass++;
}
console.log(`fire-transcript: ${pass}/${gold.scenarios.length} 场景 ALL PASS（零引擎导入镜像 · 掷值链闭合 · 活迭代逐位）`);
