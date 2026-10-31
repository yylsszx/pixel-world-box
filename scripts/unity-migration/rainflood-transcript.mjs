// ============================================================================
// rainflood-transcript.mjs —— M-U11 雨洪生产域零引擎导入镜像（rainflood.json 对账面）
// 零 engine import：rainRegrow L10660-10671 + natureFlood L10673-10693 +
//   floodArea L10695-10723 三函数 + setTerrain 级联子集（L971/972/979/981-984/
//   986-989 riverDir〔夹具零值域注记省略〕/990-993 fire 熄/994-996 owner 熄/
//   998-1001 building→destroyBuilding/1002-1004 road 清/1006 refreshWaterTierAround/
//   worldsim glacier 清 L159-163——BURNT soilF 扣支 WATER 覆写不触达，注记省略）+
//   landForDepth/waterTierAt/refreshWaterTierAround 水深三件（L1012-1070）+
//   destroyBuilding L1936-1955（smoke fx）+ fx L9781-9799 + addEvent L13995-14009
//   + toast L14027-14029（onToast 收集器）全按蓝本机械重写于本文件。
// 数学面：Math.cos/sin（natureFlood 极坐标）+ Math.hypot（floodArea 圆域）——bun
//   fdlibm 原生（与 gen 同 runtime 同位；C# 侧 FdSin/FdCos/FdHypot 位精确件对账）。
// 运行：bun scripts/unity-migration/rainflood-transcript.mjs（M-U7w 口径：黄金链一律 bun）
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
const W = 256, H = 160, N = W * H;
const idx = (x, y) => y * W + x;

// ---- mulberry（noise.ts L3-13 机械重写） ----
function mulberryStep(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
function mulberryDraw(a) { return mulberryStep(a); }

// ---- 工具 ----
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64'));
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

// ---- 镜像引擎（fixture 注入 + calls 直调——黄金回放载体） ----
class RFEng {
  constructor(sc) {
    this.tickCount = sc.tickCount;
    this.shake = 0;
    this.rngA = 0;
    // fixture 直写（gen 手术一清零基线同构——零值域）
    this.terrain = new Uint8Array(gunzip(sc.fixture.terrain0));
    this.fire = new Uint8Array(gunzip(sc.fixture.fire0));
    this.fireSet = new Set(sc.fixture.fireSet0);
    this.owner = (() => { const b = gunzip(sc.fixture.owner0); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 0, N); })();
    this.road = new Uint8Array(gunzip(sc.fixture.road0));
    this.glacier = new Uint8Array(gunzip(sc.fixture.glacier0));   // worldsim.ts L90 Uint8Array
    this.soilF = new Uint8Array(gunzip(sc.fixture.soil0));
    this.waterTier = new Uint8Array(N);
    this.frozen = new Set();
    this.flood = new Map(sc.fixture.flood0);
    this.wet = new Map();
    this.regrow = new Map(sc.fixture.regrow0);
    this.building = new Uint8Array(N);
    this.buildings = [];
    this.bIdx = new Map();
    this.bHp = new Map();
    this.damagedSet = new Set();
    this.dirty = new Set();
    this.riverDir = new Uint16Array(N);   // 夹具零值域（riverDir 清支 WATER 覆写不触达——注记）
    this.effects = [];
    this.worldEvents = [];
    this.toasts = [];
    this.toastSeq = 1;
    for (const b of sc.fixture.building0) {
      this.building[b.i] = 3;
      this.buildings.push({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: -1 });
      this.bIdx.set(b.i, this.buildings.length - 1);
    }
  }
  rng() {                                 // engine rng L728-733（rngA 单流）
    const r = mulberryDraw(this.rngA);
    this.rngA = r.a;
    return r.v;
  }
  fx(kind, x, y, ttl, opts) {             // engine fx L9781-9799（2 掷：seed+dir；r:1 默认 + opts 覆盖）
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
  toast(text, tone, op) {                 // engine toast L14027-14029（onToast 宿主回调——收集器）
    this.toasts.push({ id: this.toastSeq++, text, tone, op: op ?? null });
  }
  destroyBuilding(i) {                    // engine L1936-1955 机械（swap-pop + smoke fx 2 掷）
    const bi = this.bIdx.get(i);
    if (bi === undefined) return;
    const b = this.buildings[bi];
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
  landForDepth(t) {                       // engine L1012-1014（冰视作水面、岩浆视作海岸）
    return t !== T.DEEP && t !== T.WATER && t !== T.ICE;
  }
  waterTierAt(i) {                        // engine L1015-1050（DEEP 邻水=陆架；WATER 切比雪夫 1/2/3 环查陆）
    const t = this.terrain[i];
    const x = i % W;
    const y = (i / W) | 0;
    if (t === T.DEEP) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (this.terrain[yy * W + xx] === T.WATER) return 3;
        }
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
  refreshWaterTierAround(i) {             // engine L1052-1070（半径 3 窗口水格重算 + dirty）
    const x = i % W;
    const y = (i / W) | 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const tt = this.terrain[j];
        if (tt !== T.WATER && tt !== T.DEEP) continue;
        const tier = this.waterTierAt(j);
        if (this.waterTier[j] !== tier) {
          this.waterTier[j] = tier;
          this.dirty.add(j);
        }
      }
    }
  }
  setTerrain(i, t) {                      // engine L969-1007 机械（级联全支——M-U11 域触达面扩）
    const prev = this.terrain[i];
    if (prev === t) return;               // L971
    this.terrain[i] = t;                  // L972
    this.regrow.delete(i);                // L979
    if (prev === T.ICE) this.frozen.delete(i);       // L981
    if (t === T.ICE) this.frozen.add(i);             // L982
    if (t !== T.WATER) this.flood.delete(i);         // L983
    if (t !== T.SAND) this.wet.delete(i);            // L984
    if (!isWater(t) && this.riverDir[i] > 0) {       // L986（夹具 riverDir 恒 0——结构性不触达）
      this.riverDir[i] = 0;
    }
    if (this.fire[i] > 0) {                          // L990 地形变更 → 火焰奄灭
      this.fire[i] = 0;                              // L991
      this.fireSet.delete(i);                        // L992
    }
    if ((isWater(t) || t === T.LAVA) && this.owner[i] >= 0) this.owner[i] = -1;   // L994-995
    if ((isWater(t) || t === T.LAVA) && this.building[i] > 0) this.destroyBuilding(i);   // L998-999
    if ((isWater(t) || t === T.LAVA) && this.road[i] > 0) this.road[i] = 0;      // L1002-1003
    this.refreshWaterTierAround(i);                  // L1006（水深场局部重算——S5/S6/S8 淹没触达）
    if ((isWater(t) || t === T.LAVA) && this.glacier[i] > 0) this.glacier[i] = 0;   // worldsim L159-163（glacier 清）
    // worldsim BURNT soilF 扣减支（L157）——本域全 WATER 覆写不触达，注记省略
  }
  // ---- 三函数机械翻译（蓝本 L10660-10723） ----
  rainRegrow(x0, y0) {                    // L10660-10671（雨区复苏：regrow 计时 -160 或 tick+60 下限）
    for (let k = 0; k < 4; k++) {         // L10662
      const xx = x0 + Math.floor(this.rng() * 8);   // L10663
      const yy = y0 + Math.floor(this.rng() * 8);   // L10664
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L10665
      const i = idx(xx, yy);              // L10666
      const at = this.regrow.get(i);      // L10667
      if (at != null) {                   // L10668
        this.regrow.set(i, Math.max(this.tickCount + 60, at - 160));   // L10669
        return;                           // L10670
      }
    }
  }
  natureFlood(x, y) {                     // L10673-10693（流域洪水：低地短暂没顶）
    let flooded = 0;                      // L10674
    for (let k = 0; k < 10; k++) {        // L10675
      const ang = this.rng() * Math.PI * 2;   // L10676（fdlibm cos/sin 域——C# FdSin/FdCos）
      const rr = this.rng() * 4.5;        // L10677
      const xx = Math.floor(x + Math.cos(ang) * rr);   // L10678
      const yy = Math.floor(y + Math.sin(ang) * rr);   // L10679
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L10680
      const i = idx(xx, yy);              // L10681
      const t = this.terrain[i];          // L10682
      if ((t === T.GRASS || t === T.SAND || t === T.BURNT) && !this.flood.has(i)) {   // L10683
        this.setTerrain(i, T.WATER);      // L10684（全级联）
        this.flood.set(i, this.tickCount + 180 + Math.floor(this.rng() * 120));   // L10685
        if (this.building[i] > 0) this.destroyBuilding(i);   // L10686
        flooded++;                        // L10687
      }
    }
    if (flooded >= 4) {                   // L10689
      this.addEvent('geo', '持续的暴雨漫过了河岸，洼地化作一片泽国', x, y);   // L10690
    }
  }
  floodArea(x, y, r) {                    // L10695-10723（神力洪水：目标半径内洼地漫成泽国）
    const rr = Math.max(2, Math.min(12, r));   // L10696（半径钳位 [2,12]）
    let flooded = 0;                      // L10697
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {   // L10698（双上界 y+rr number 语义）
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {   // L10699
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L10700
        if (Math.hypot(xx - x, yy - y) > rr) continue;   // L10701（fdlibm hypot——C# FdHypot）
        const i = idx(xx, yy);            // L10703
        const t = this.terrain[i];        // L10704
        if (t !== T.GRASS && t !== T.SAND && t !== T.BURNT && t !== T.SWAMP && t !== T.HILL) continue;   // L10705（五地形门）
        if (this.flood.has(i)) continue;  // L10706（flood 门）
        this.setTerrain(i, T.WATER);      // L10708（全级联）
        this.flood.set(i, this.tickCount + 180 + Math.floor(this.rng() * 180));   // L10709
        if (this.building[i] > 0) this.destroyBuilding(i);   // L10710
        flooded++;                        // L10711
      }
    }
    if (flooded > 0) {                    // L10715
      this.fx('tsunami', x, y, 30, { r: rr + 1, quiet: true });   // L10716
      this.shake = Math.max(this.shake, 3);   // L10717
      /* this.onSound?.('tsunami') —— 宿主回调（L10718 注记） */
      this.toast(`洪水漫过了大地（${flooded} 格），数秒后将退去`, 'info');   // L10719
    }
  }
}

// ---- 黄金回放对账 ----
const golden = JSON.parse(readFileSync(new URL('./golden/rainflood.json', import.meta.url), 'utf8'));
let pass = 0, fail = 0;
for (const sc of golden.scenarios) {
  const eng = new RFEng(sc);
  eng.rngA = sc.seed >>> 0;
  let stepOk = true, firstErr = '';
  const cmp = (a, b, label) => {
    if (!stepOk) return;
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb) { stepOk = false; firstErr = `${label}: mirror≠golden`; }
  };
  for (let s = 0; s < sc.stepsSnap.length; s++) {
    const call = sc.stepsSnap[s];
    const fn = ['rainRegrow', 'natureFlood', 'floodArea'].includes(call.fn) ? call.fn : null;
    if (!fn) throw new Error(`${sc.key}: 未知调用 ${call.fn}`);
    eng[fn](...call.args);
    const g = call;
    const m = {
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      terrainMd5: md5hex(eng.terrain),
      fireMd5: md5hex(eng.fire),
      fireSet: [...eng.fireSet],
      flood: [...eng.flood.entries()],
      regrow: [...eng.regrow.entries()],
      wet: [...eng.wet.entries()],
      frozen: [...eng.frozen],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
      buildingsCount: eng.buildings.length,
      shake: eng.shake,
      waterTierMd5: md5hex(eng.waterTier),
      glacierMd5: md5hex(eng.glacier),
      ownerMd5: md5hex(new Uint8Array(eng.owner.buffer)),
      roadMd5: md5hex(eng.road),
    };
    for (const k of Object.keys(m)) cmp(m[k], g[k], `step${s}.${k}`);
  }
  // 终态对账（terrain gz + fx f64 + events + toasts）
  let endOk = stepOk;
  let endErr = '';
  if (endOk) {
    if (md5hex(gunzip(sc.terrain)) !== md5hex(eng.terrain)) { endOk = false; endErr = 'terrain 终态'; }
  }
  if (endOk) {
    const mf = eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null }));
    if (JSON.stringify(mf) !== JSON.stringify(sc.fx)) { endOk = false; endErr = 'fx 终态'; }
  }
  if (endOk) {
    const me = eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null }));
    if (JSON.stringify(me) !== JSON.stringify(sc.events)) { endOk = false; endErr = 'events 终态'; }
  }
  if (endOk) {
    if (JSON.stringify(eng.toasts) !== JSON.stringify(sc.toasts)) { endOk = false; endErr = 'toasts 终态'; }
  }
  const draws = (eng.rngA >>> 0) === (sc.seed >>> 0) ? 0 : -1;
  if (stepOk && endOk) { pass++; console.log(`${sc.key}: PASS (draws=${draws >= 0 ? draws : sc.totalDraws} flood=${eng.flood.size} regrow=${eng.regrow.size} fx=${eng.effects.length} toast=${eng.toasts.length})`); }
  else { fail++; console.log(`${sc.key}: FAIL (${!stepOk ? firstErr : endErr})`); }
}
console.log(`rainflood transcript: ${pass}/${golden.scenarios.length} 场景逐位 ${pass === golden.scenarios.length ? 'ALL PASS' : 'FAIL'}`);
if (fail > 0) process.exit(1);
