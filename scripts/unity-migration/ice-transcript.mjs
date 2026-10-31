// ============================================================================
// ice-transcript.mjs —— M-U9a 冰域零引擎导入镜像（ice.json 对账面）
// 零 engine import：iceTick L2902-3031 + meltIce L2892-2895 + setTerrain 贴花级联
//   L981-984 + nature.iceMul L341-345（ash=0 域）全部按蓝本机械重写于本文件。
// 夹具自黄金 ice.json（gen-ice.mjs 产物）：terrain/tempMap/fire gz + frozen/flood/wet
//   序列 + laws/yearF/tickCount + spawn 调用 + raceFlags（纪事扫描输入面）。
// 掷链：mulberry32 纯数学（noise.ts L3-13 同构）自黄金 seed 起流，逐步 rngA 终态对账。
// 对账面：逐步快照（rngA/terrainMd5/frozen 序/flood/wet 序/fxCount/eventsCount 逐位）
//   + 终态 fx 全列（kind/x/y/ttl/seed/dir f64 位级）+ events 全列（kind/text/x/y）。
// 运行：bun scripts/unity-migration/ice-transcript.mjs（M-U7w 口径：黄金链一律 bun）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 蓝本常量（types.ts T 逐值镜像——零导入） ----
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const isWater = (t) => t === T.DEEP || t === T.WATER;   // constants.ts L67-69 语义闸门
const W = 256, H = 160, N = W * H;
const idx = (x, y) => y * W + x;
const SEASON_YEARS = 2;                                   // nature.ts L21

// ---- mulberry32（noise.ts L3-13 公式逐行同构——engine rng 类字段箭头 L728-733 同链） ----
function mulberryDraw(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const ungz = (b64) => new Uint8Array(zlib.gunzipSync(Buffer.from(b64, 'base64')));

// ---- 零引擎镜像世界（蓝本 engine 字段面的夹具子集） ----
class MirrorWorld {
  constructor(sc) {
    this.terrain = ungz(sc.fixture.terrain0);       // 直写相后/setTerrain 直调前（镜像重放 setCalls 前态）
    this.tempMap = ungz(sc.fixture.temp0);
    this.fire = ungz(sc.fixture.fire0);
    this.fireSet = new Set(sc.fixture.fireSet0);
    this.frozen = new Set();
    this.flood = new Map();
    this.wet = new Map();
    this.units = [];                    // 纪事扫描行 {x, y, dead, boat, aquatic, flying}（x/y 已 tile 化）
    this.effects = [];
    this.worldEvents = [];
    this.eventSeq = 1;
    this.yearF = sc.yearF;
    this.tickCount = sc.tickCount;
    this.seasons = sc.seasons;
    this.ash = 0;                       // nature.ts L78 默认（大气灰烬生产面未译恒 0 域）
    this.iceChronDone = false;          // nature.ts L178/180 默认（fresh 引擎净态）
    this.thawChronDone = false;
    this.rngA = sc.seed >>> 0;
  }
  season() {                            // nature.ts L160-163 getter 同构
    if (!this.seasons) return 1;
    let s = Math.floor(this.yearF / SEASON_YEARS) % 4;
    return s < 0 ? s + 4 : s;
  }
  iceMul() {                            // nature.ts L341-345 机械（ash=0 域；夏 0.55/冬 1.8/春秋 1——冰缘扩张系数，非 fireMul 夏 1.3）
    const s = this.season();
    let m = s === 3 ? 1.8 : s === 1 ? 0.55 : 1;
    return m;                           // rainCell 雨区项大气域未译——ash 同域恒 0
  }
  rng() {
    const r = mulberryDraw(this.rngA);
    this.rngA = r.a;
    return r.v;
  }
  fx(kind, x, y, ttl) {                 // engine fx L9781-9799（2 掷：seed+dir；cap 620 夹具不触达）
    const seed = Math.floor(this.rng() * 65536);
    const dir = this.rng() * Math.PI * 2;
    this.effects.push({ kind, x, y, ttl, seed, dir });
  }
  addEvent(kind, text, x, y) {          // engine addEvent L13995-14009（unshift + cap 80）
    this.worldEvents.unshift({ kind, text, x: x ?? null, y: y ?? null });
    if (this.worldEvents.length > 80) this.worldEvents.length = 80;
  }
  setTerrain(i, t) {                    // engine L969-1007 机械（夹具零值域：riverDir/owner/building/road 恒零——分支结构性不触达，注记省略）
    const prev = this.terrain[i];
    if (prev === t) return;             // L971 同值早退
    this.terrain[i] = t;                // L972
    // L979 regrow.delete——regrow 夹具恒空（冰域零交叠——regrow 域 M-U8b 已译件侧同样空表）
    if (prev === T.ICE) this.frozen.delete(i);        // L981
    if (t === T.ICE) this.frozen.add(i);              // L982
    if (t !== T.WATER) this.flood.delete(i);          // L983
    if (t !== T.SAND) this.wet.delete(i);             // L984
    if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }   // L990-993 火焰奄灭
  }
  meltIce(i) {                          // engine L2892-2895
    if (this.terrain[i] !== T.ICE) return;
    this.setTerrain(i, T.WATER);
  }
  iceTick() {                           // engine L2902-3031 机械翻译（零引擎镜像主体）
    // 1. 热源消融 + 暖气候消融
    if (this.frozen.size > 0) {
      for (const i of [...this.frozen]) {
        const x = i % W;
        const y = (i / W) | 0;
        let hot = false;
        for (let k = 0; k < 4; k++) {
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (this.terrain[j] === T.LAVA || this.fire[j] > 0) { hot = true; break; }
        }
        if (hot) { this.meltIce(i); continue; }                       // L2916
        if (this.season() === 0) {                                    // L2919 春汛解冻
          const latF2 = Math.abs(y / H - 0.5) * 2;
          if (latF2 < 0.62 && this.rng() < 0.06 + 0.28 * (1 - latF2)) {
            this.meltIce(i);
            if (this.rng() < 0.2) this.fx('water', x + 0.5, y + 0.5, 26);       // L2924 融滴
            if (!this.thawChronDone) {                                          // L2926 落冰湖纪事
              let fell = false;
              for (const u of this.units) {
                if (u.dead || u.boat) continue;
                if (u.aquatic || u.flying) continue;
                if ((u.x | 0) === x && (u.y | 0) === y) { fell = true; break; }
              }
              if (fell) {
                this.thawChronDone = true;
                this.addEvent('geo', '春汛冰消——冰面上的行人随碎裂的冰层跌入湖水，春寒刺骨', x, y);
              }
            }
            continue;
          }
        }
        const meltP = 0.012 * this.iceMul();                          // L2943 暖气候消融
        if (this.rng() < meltP && this.tempMap[i] > 96) this.meltIce(i);
      }
    }
    // 2. 极地自然冻结
    const freezeN = Math.round(14 * this.iceMul());
    for (let k = 0; k < freezeN; k++) {
      const x = 1 + Math.floor(this.rng() * (W - 2));
      const y = 1 + Math.floor(this.rng() * (H - 2));
      const i = idx(x, y);
      if (this.terrain[i] !== T.SNOW) continue;
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      const d = dirs[Math.floor(this.rng() * 4)];
      const j = idx(x + d[0], y + d[1]);
      if (j >= 0 && j < N) {
        const t = this.terrain[j];
        if (t === T.WATER && this.rng() < 0.3) this.setTerrain(j, T.ICE);
        else if (t === T.DEEP && this.rng() < 0.04) this.setTerrain(j, T.ICE);
      }
    }
    // 2b. 冬季大封冻
    if (this.season() === 3) {
      let frozeN = 0;
      for (let k = 0; k < 1100; k++) {
        const x = 1 + Math.floor(this.rng() * (W - 2));
        const y = 1 + Math.floor(this.rng() * (H - 2));
        const i = idx(x, y);
        const t = this.terrain[i];
        if (t !== T.WATER && t !== T.DEEP) continue;
        const latF = Math.abs(y / H - 0.5) * 2;
        if (t === T.WATER) {
          if (latF < 0.26) continue;
          let shore = false;
          for (let q = 0; q < 4 && !shore; q++) {
            const xx = x + (q === 0 ? -1 : q === 1 ? 1 : 0);
            const yy = y + (q === 2 ? -1 : q === 3 ? 1 : 0);
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const tt = this.terrain[idx(xx, yy)];
            if (tt !== T.WATER && tt !== T.DEEP) shore = true;
          }
          if (this.rng() < Math.min(0.9, (latF - 0.24) * (shore ? 0.9 : 0.3))) {
            this.setTerrain(i, T.ICE);
            frozeN++;
            if (this.rng() < 0.25) this.fx('frost', x + 0.5, y + 0.5, 36);      // L2992 封冻闪晶
          }
        } else if (latF >= 0.5 && this.rng() < (latF - 0.5) * 0.22) { this.setTerrain(i, T.ICE); frozeN++; }
      }
      if (frozeN >= 12 && !this.iceChronDone) {
        this.iceChronDone = true;
        this.addEvent('geo', '千里冰封——寒潮封住了北地的湖泽，冰面覆霜可行走，鱼群潜入未冻的深水', undefined, undefined);
      }
    }
    // 3. 海啸洪水退潮
    if (this.flood.size > 0) {
      for (const [i, at] of [...this.flood]) {
        if (this.tickCount < at) continue;
        this.flood.delete(i);
        if (this.terrain[i] !== T.WATER) continue;
        const x = i % W;
        const y = (i / W) | 0;
        let natural = false;
        for (let k = 0; k < 4 && !natural; k++) {
          const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
          const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (isWater(this.terrain[j]) && !this.flood.has(j)) natural = true;
        }
        if (!natural) {
          this.setTerrain(i, T.SAND);
          this.wet.set(i, this.tickCount + 220);
        }
      }
    }
    // 4. 湿沙干透
    if (this.wet.size > 0) {
      for (const [i, at] of [...this.wet]) {
        if (this.tickCount >= at) this.wet.delete(i);
      }
    }
  }
}

// ---- 对账主循环 ----
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/ice.json'), 'utf8'));
const eq = (a, b, path_) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${path_} 漂移\n  镜像: ${JSON.stringify(a)}\n  黄金: ${JSON.stringify(b)}`);
};

let pass = 0;
for (const sc of gold.scenarios) {
  const m = new MirrorWorld(sc);
  // 夹具重建（gen-ice fixture 通道——手术序保真：直写相 → setCalls 相；frozen0=tile 索引序/flood0/wet0=[i,at] 序）
  for (const i of sc.fixture.frozen0) m.frozen.add(i);
  for (const [i, at] of sc.fixture.flood0) m.flood.set(i, at);
  for (const [i, at] of sc.fixture.wet0) m.wet.set(i, at);
  for (const [x, y, t] of sc.fixture.setCalls) m.setTerrain(idx(x, y), t);   // S5 级联直调面（手术序）
  for (const u of sc.fixture.units) m.units.push(u);                          // 纪事扫描行
  // iceTick 步进 + 逐步快照对账
  for (let k = 0; k < sc.steps; k++) {
    m.iceTick();
    const g = sc.stepsSnap[k];
    eq((m.rngA >>> 0).toString(16).padStart(8, '0'), g.rngA, `${sc.key} S${k} rngA`);
    eq(md5hex(m.terrain), g.terrainMd5, `${sc.key} S${k} terrainMd5`);
    eq([...m.frozen], g.frozen, `${sc.key} S${k} frozen 序`);
    eq([...m.flood.entries()], g.flood, `${sc.key} S${k} flood 序`);
    eq([...m.wet.entries()], g.wet, `${sc.key} S${k} wet 序`);
    eq(m.effects.length, g.fxCount, `${sc.key} S${k} fxCount`);
    eq(m.worldEvents.length, g.eventsCount, `${sc.key} S${k} eventsCount`);
  }
  // 终态全列对账
  eq(m.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir) })), sc.fx, `${sc.key} fx 全列`);
  eq(m.worldEvents, sc.events, `${sc.key} events 全列`);
  console.log(`${sc.key}: 逐位 PASS (steps=${sc.steps} draws=${sc.totalDraws} frozen=${m.frozen.size})`);
  pass++;
}
console.log(`ice-transcript: ${pass}/${gold.scenarios.length} 场景 ALL PASS（零引擎导入镜像 · 掷值链闭合 · 事件流逐位）`);
