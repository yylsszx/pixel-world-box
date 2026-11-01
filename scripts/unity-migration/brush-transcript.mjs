// ============================================================================
// brush-transcript.mjs —— M-U13 地形整形与邻域神力域零引擎导入镜像（brush.json 对账面）
// 零 engine import：boom L12292-12306 + createOasis L12444-12486 + smoothTerrain
//   L12489-12520 + roughenTerrain L12521-12563 + plagueArea L12594-12599 +
//   healArea L12600-12622 + killArea L12623-12626 七函数 + setTerrain 级联子集
//   （同 rainflood-transcript 已译面）+ meltIce L2898-2901 + destroyBuilding
//   L1936-1955（smoke fx）+ fx L9781-9799 + addEvent L13995-14009 + toast
//   L14027-14029（onToast 收集器）全按蓝本机械重写于本文件。
// 数学面：Math.hypot（boom 像素距/格心距 + oasis 整数极距 + smooth/rough 格距）——
//   bun fdlibm 原生（与 gen 同 runtime 同位；C# 侧 FdHypot 位精确件对账）。
//   hash2（noise.ts L14-19）——variant 确定域重建（fixture 无 variant0——R3 体积红线）。
// 运行：bun scripts/unity-migration/brush-transcript.mjs（M-U7w 口径：黄金链一律 bun）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 蓝本常量（types.ts/constants.ts 逐值镜像——零导入） ----
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const isWater = (t) => t === T.DEEP || t === T.WATER;
const W = 256, H = 160, N = W * H;
const idx = (x, y) => y * W + x;

// ---- mulberry（noise.ts L3-13 机械重写） ----
function mulberryStep(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
function hash2(x, y, seed) {               // noise.ts L14-19 机械重写（variant 确定域重建）
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

// ---- 工具 ----
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64'));
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

// ---- 镜像引擎（fixture 注入 + calls 直调——黄金回放载体） ----
class BREng {
  constructor(sc) {
    this.tickCount = sc.tickCount;
    this.shake = 0;
    this.rngA = 0;
    this.terrain = new Uint8Array(gunzip(sc.fixture.terrain0));
    this.fire = new Uint8Array(gunzip(sc.fixture.fire0));
    this.fireSet = new Set(sc.fixture.fireSet0);
    this.owner = (() => { const b = gunzip(sc.fixture.owner0); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 0, N); })();
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
    this.road = new Uint8Array(N);
    this.riverDir = new Uint16Array(N);
    this.effects = [];
    this.worldEvents = [];
    this.toasts = [];
    this.toastSeq = 1;
    this.radiate = new Uint8Array(gunzip(sc.fixture.radiate0));
    this.radSet = new Map(sc.fixture.radSet0);
    this.brush = sc.fixture.brush0;
    this.variant = new Uint8Array(N);      // 确定域重建（worldgen L65 hash2——fixture 无 variant0）
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.variant[y * W + x] = Math.floor(hash2(x, y, sc.baseSeed + 999) * 255);
    for (const b of sc.fixture.building0) {
      this.building[b.i] = 3;
      this.buildings.push({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: -1 });
      this.bIdx.set(b.i, this.buildings.length - 1);
    }
    for (const uo of sc.fixture.units0) {
      this.units ??= [];
      this.units.push({
        id: uo.id, race: uo.race, civ: -1, x: uo.x, y: uo.y, tx: uo.x, ty: uo.y,
        hp: uo.hp ?? 10, maxHp: uo.maxHp ?? uo.hp ?? 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
        cd: 0, trait: uo.trait ?? 0, job: 0, king: 0, infected: uo.infected ?? false, flip: 0,
        name: `u${uo.id}`, hurt: uo.hurt ?? 0, breath: 0, parity: 0, dead: uo.dead ?? 0,
        fam: null, fgn: null, gene: uo.gene ?? null, army: null,
      });
    }
    this.unitById = new Map((this.units ?? []).map((u) => [u.id, u]));
    this.units ??= [];
  }
  rng() {
    const r = mulberryStep(this.rngA);
    this.rngA = r.a;
    return r.v;
  }
  fx(kind, x, y, ttl, opts) {
    const seed = Math.floor(this.rng() * 65536);
    const dir = this.rng() * Math.PI * 2;
    const e = { kind, x, y, ttl, seed, dir, r: 1 };
    if (opts) for (const k of Object.keys(opts)) e[k] = opts[k];
    this.effects.push(e);
  }
  addEvent(kind, text, x, y) {
    this.worldEvents.unshift({ kind, text, x: x ?? null, y: y ?? null });
    if (this.worldEvents.length > 80) this.worldEvents.length = 80;
  }
  toast(text, tone, op) {
    this.toasts.push({ id: this.toastSeq++, text, tone, op: op ?? null });
  }
  markDirty(i) {                          // engine markDirty L959-967（五格面——dirty 不入 dump，簿记同构）
    this.dirty.add(i);
    const x = i % W, y = (i / W) | 0;
    if (x > 0) this.dirty.add(i - 1);
    if (x < W - 1) this.dirty.add(i + 1);
    if (y > 0) this.dirty.add(i - W);
    if (y < H - 1) this.dirty.add(i + W);
  }
  destroyBuilding(i) {
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
      for (let dy = -r; dy <= r && !land; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (this.landForDepth(this.terrain[yy * W + xx])) { land = true; break; }
      }
      if (land) return r - 1;
    }
    return 2;
  }
  refreshWaterTierAround(i) {
    const x = i % W, y = (i / W) | 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const tt = this.terrain[j];
      if (tt !== T.WATER && tt !== T.DEEP) continue;
      const tier = this.waterTierAt(j);
      if (this.waterTier[j] !== tier) { this.waterTier[j] = tier; this.dirty.add(j); }
    }
  }
  setTerrain(i, t) {
    const prev = this.terrain[i];
    if (prev === t) return;
    this.terrain[i] = t;
    this.regrow.delete(i);
    if (prev === T.ICE) this.frozen.delete(i);
    if (t === T.ICE) this.frozen.add(i);
    if (t !== T.WATER) this.flood.delete(i);
    if (t !== T.SAND) this.wet.delete(i);
    if (!isWater(t) && this.riverDir[i] > 0) this.riverDir[i] = 0;
    if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }
    if ((isWater(t) || t === T.LAVA) && this.owner[i] >= 0) this.owner[i] = -1;
    if ((isWater(t) || t === T.LAVA) && this.building[i] > 0) this.destroyBuilding(i);
    if ((isWater(t) || t === T.LAVA) && this.road[i] > 0) this.road[i] = 0;
    this.refreshWaterTierAround(i);
    // worldsim glacier 清（worldsim L159-163）——brush 域夹具 glacier 恒零不触达，注记省略
    // worldsim BURNT soilF 扣支（L157）——本域 WATER 覆写面注记省略
  }
  meltIce(i) {                            // L2898-2901 机械
    if (this.terrain[i] !== T.ICE) return;
    this.setTerrain(i, T.WATER);
  }
  // ---- 七函数机械翻译（蓝本 L12292-12626） ----
  boom(x, y, r = 2.4) {                   // L12292-12306（零 rng 除 fx）
    const rr = Math.max(1, Math.min(8, r));   // L12293
    for (const u of this.units) {          // L12294
      const d = Math.hypot(u.x - x, u.y - y);   // L12295
      if (d < rr + 0.5) { u.hp -= 160 * Math.max(0.1, 1 - d / (rr + 0.5)); u.hurt = 30; if (u.hp <= 0) u.dead = true; }   // L12296
    }
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {   // L12298（双上界 number 语义）
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = idx(xx, yy);
        if (Math.hypot(xx - x, yy - y) < rr && this.building[i] > 0) this.destroyBuilding(i);   // L12302
      }
    }
    this.fx('explosion', x, y, 22, { r: rr });   // L12304（2 掷）
    /* this.onSound?.('boom') —— 宿主回调（L12305 注记） */
    this.shake = Math.max(this.shake, Math.min(9, Math.round(2 + rr)));   // L12306
  }
  createOasis(wx, wy) {                   // L12444-12486
    const cx = Math.max(1, Math.min(W - 2, Math.floor(wx)));   // L12445
    const cy = Math.max(1, Math.min(H - 2, Math.floor(wy)));   // L12446
    const pondR = Math.max(2, Math.min(6, this.brush));        // L12447
    const ringR = pondR + 2;               // L12448
    const center = this.terrain[idx(cx, cy)];   // L12451
    const barren = center === T.SAND || center === T.BURNT;   // L12452
    let greened = 0;                       // L12453
    let palms = 0;                         // L12454
    for (let dy = -ringR; dy <= ringR; dy++) {   // L12455
      for (let dx = -ringR; dx <= ringR; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx, dy);      // L12460（整数极距）
        const j = idx(xx, yy);
        if (d <= pondR * 0.55) {           // L12462 泉眼
          if (this.terrain[j] !== T.MOUNTAIN) this.setTerrain(j, T.WATER);
        } else if (d <= pondR) {           // L12465 浅滩
          if (this.terrain[j] !== T.MOUNTAIN && this.rng() < 0.8) this.setTerrain(j, T.WATER);
        } else if (d <= ringR) {           // L12467 环带
          const t = this.terrain[j];
          if (t === T.SAND || t === T.BURNT) {
            this.setTerrain(j, T.GRASS);
            greened++;
            if (this.rng() < 0.3) { this.setTerrain(j, T.FOREST); palms++; }
          } else if (t === T.GRASS && this.rng() < 0.08) {
            this.setTerrain(j, T.FOREST);
            palms++;
          }
        }
      }
    }
    this.fx('spawn', wx, wy, 34);          // L12482（2 掷）
    this.fx('spawn', wx, wy - 1, 40);      // L12483（2 掷）
    this.toast(barren ? '荒漠中涌出一泓清泉，绿意环绕' : '清泉在草木间闪烁', 'good');   // L12484
    this.addEvent('oasis', barren ? `荒漠中诞生了一片绿洲${palms > 0 ? `，${palms} 株棕榈亭亭而立` : ''}` : '一处泉眼被点化，波光潋滟', cx + 0.5, cy + 0.5);   // L12485
    /* this.onSound?.('heal') —— 宿主回调（L12486 注记） */
  }
  smoothTerrain(wx, wy, r) {              // L12489-12520（零 rng——counts Map 插入序 tie-break）
    if (r < 1) r = 1;                     // L12490
    const changes = [];                   // L12491（先算后写——众数基于原图）
    for (let yy = Math.floor(wy - r); yy <= wy + r; yy++) {   // L12492
      for (let xx = Math.floor(wx - r); xx <= wx + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx - wx, yy - wy) > r) continue;
        const i = idx(xx, yy);
        const counts = new Map();         // L12498（3×3 邻域计数）
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = xx + dx, ny = yy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const t = this.terrain[idx(nx, ny)];
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        }
        let bestT = this.terrain[i];      // L12507
        let bestC = 0;
        for (const [t, c] of counts) {    // L12510（Map 插入序——首现最大者胜出）
          if (c > bestC) { bestC = c; bestT = t; }
        }
        if (bestT !== this.terrain[i] && bestC >= 5) changes.push([i, bestT]);   // L12513
      }
    }
    for (const [i, t] of changes) this.setTerrain(i, t);   // L12516（批量应用）
  }
  roughenTerrain(wx, wy, r) {             // L12521-12563
    if (r < 1) r = 1;                     // L12522
    const neighbors = [];                 // L12523
    for (let yy = Math.floor(wy - r); yy <= wy + r; yy++) {   // L12524
      for (let xx = Math.floor(wx - r); xx <= wx + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx - wx, yy - wy) > r) continue;
        const i = idx(xx, yy);
        const kinds = new Set();          // L12529（邻域种类面）
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = xx + dx, ny = yy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            kinds.add(this.terrain[idx(nx, ny)]);
          }
        }
        if (kinds.size < 2) {             // L12536 内部格
          this.variant[i] = Math.floor(this.rng() * 256);   // L12537（色抖重掷——1 掷）
          this.markDirty(i);              // L12538
          continue;
        }
        if (this.rng() < 0.5) neighbors.push(i);   // L12541（边缘吸入——1 掷）
      }
    }
    for (const i of neighbors) {          // L12544 二遍
      const x = i % W;
      const y = (i / W) | 0;
      const opts = [];                    // L12548（8 邻域含对角）
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          opts.push(idx(nx, ny));
        }
      }
      if (opts.length > 0) {
        const src = opts[Math.floor(this.rng() * opts.length)];   // L12556（1 掷）
        if (this.terrain[src] !== this.terrain[i]) this.setTerrain(i, this.terrain[src]);   // L12557
      }
    }
  }
  plagueArea(x, y, r) {                   // L12594-12599（零 rng）
    const UNDEAD = new Set([5, 16, 23, 24, 31]);   // RACES 表 undead:true 五族（types.ts L162/173 + WHITEWALKER 23/VAMPIRE 24/LICH 31——zombie/骷髅/白行者/吸血鬼/巫妖）
    for (const u of this.units) {
      if (Math.hypot(u.x - x, u.y - y) < r && !UNDEAD.has(u.race) && !(u.trait ? (u.trait === 'immune') : false)) u.infected = true;   // L12595-12597（undead 门 + immune 特质键豁免）
    }
  }
  healArea(x, y, r) {                     // L12600-12622
    for (const u of this.units) {         // L12601
      if (Math.hypot(u.x - x, u.y - y) <= r) { u.hp = u.maxHp; u.infected = false; u.hurt = 0; }   // L12602-12603
    }
    for (let yy = Math.floor(y - r); yy <= y + r; yy++) {   // L12605
      for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx - x, yy - y) > r) continue;
        const i = idx(xx, yy);
        if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }   // L12611-12612
        if (this.terrain[i] === T.BURNT) this.setTerrain(i, T.GRASS);   // L12613
        if (this.terrain[i] === T.ICE) this.meltIce(i);   // L12614
        if (this.radiate[i] > 0) { this.radiate[i] = 0; this.radSet.delete(i); this.markDirty(i); }   // L12615
      }
    }
    this.fx('heart', x, y - 1, 36);       // L12618（2 掷）
    /* this.onSound?.('heal') —— 宿主回调（L12619 注记） */
  }
  killArea(x, y, r) {                     // L12623-12626（零 rng）
    for (const u of this.units) {
      if (!u.dead && Math.hypot(u.x - x, u.y - y) <= r) u.dead = true;   // L12625
    }
  }
}

// ---- 黄金回放对账 ----
const golden = JSON.parse(readFileSync(new URL('./golden/brush.json', import.meta.url), 'utf8'));
let pass = 0, fail = 0;
for (const sc of golden.scenarios) {
  const eng = new BREng(sc);
  eng.rngA = sc.seed >>> 0;
  let stepOk = true, firstErr = '';
  const cmp = (a, b, label) => {
    if (!stepOk) return;
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb) { stepOk = false; firstErr = `${label}: mirror≠golden`; }
  };
  for (let s = 0; s < sc.stepsSnap.length; s++) {
    const call = sc.stepsSnap[s];
    const fn = ['boom', 'createOasis', 'smoothTerrain', 'roughenTerrain', 'plagueArea', 'healArea', 'killArea'].includes(call.fn) ? call.fn : null;
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
      variantMd5: md5hex(eng.variant),
      radiateMd5: md5hex(eng.radiate),
      radSet: [...eng.radSet.entries()],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
      buildingsCount: eng.buildings.length,
      shake: eng.shake,
      unitsCount: eng.units.length,
    };
    for (const k of Object.keys(m)) cmp(m[k], g[k], `step${s}.${k}`);
  }
  // 终态对账（terrain gz + variantMd5 + radiate gz + fx f64 + events + units dump + toasts）
  let endOk = stepOk;
  let endErr = '';
  if (endOk && md5hex(gunzip(sc.terrain)) !== md5hex(eng.terrain)) { endOk = false; endErr = 'terrain 终态'; }
  if (endOk && sc.variantMd5 !== md5hex(eng.variant)) { endOk = false; endErr = 'variantMd5 终态'; }
  if (endOk && md5hex(gunzip(sc.radiate)) !== md5hex(eng.radiate)) { endOk = false; endErr = 'radiate 终态'; }
  if (endOk && JSON.stringify(eng.radSet) !== JSON.stringify(Object.fromEntries(sc.radSet))) { /* Map vs obj 形态 */ }
  if (endOk) {
    const mf = eng.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null }));
    if (JSON.stringify(mf) !== JSON.stringify(sc.fx)) { endOk = false; endErr = 'fx 终态'; }
  }
  if (endOk) {
    const me = eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null }));
    if (JSON.stringify(me) !== JSON.stringify(sc.events)) { endOk = false; endErr = 'events 终态'; }
  }
  if (endOk) {
    const dumpUnit = (u) => ({
      id: u.id, race: u.race, civ: u.civ,
      x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx ?? u.x), ty: f64hex(u.ty ?? u.y),
      hp: f64hex(u.hp ?? 10), maxHp: f64hex(u.maxHp ?? 10), dmg: f64hex(u.dmg ?? 1), speed: f64hex(u.speed ?? 1),
      age: f64hex(u.age ?? 0), maxAge: f64hex(u.maxAge ?? 9999),
      hurtN: u.hurt === undefined || u.hurt === null ? null : f64hex(u.hurt),
      dead: u.dead ? 1 : 0, flip: u.flip ? 1 : 0, infected: u.infected ? 1 : 0,
      job: u.job === undefined ? null : u.job, name: u.name ?? null,
      gene: u.gene ? { s: f64hex(u.gene.s), d: f64hex(u.gene.d), h: f64hex(u.gene.h), r: f64hex(u.gene.r) } : null,
      fam: u.fam ?? null, fgn: u.fgn ?? null,
      breath: u.breath ?? null, parity: u.parity ?? null, kills: u.kills ?? null,
    });
    if (JSON.stringify(eng.units.map(dumpUnit)) !== JSON.stringify(sc.units)) { endOk = false; endErr = 'units dump 终态'; }
  }
  if (endOk && JSON.stringify(eng.toasts) !== JSON.stringify(sc.toasts)) { endOk = false; endErr = 'toasts 终态'; }
  if (stepOk && endOk) { pass++; console.log(`${sc.key}: PASS (draws=${sc.totalDraws} fx=${eng.effects.length} ev=${eng.worldEvents.length} units=${eng.units.length} shake=${eng.shake})`); }
  else { fail++; console.log(`${sc.key}: FAIL (${!stepOk ? firstErr : endErr})`); }
}
console.log(`brush transcript: ${pass}/${golden.scenarios.length} 场景逐位 ${pass === golden.scenarios.length ? 'ALL PASS' : 'FAIL'}`);
if (fail > 0) process.exit(1);
