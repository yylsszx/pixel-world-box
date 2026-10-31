// ============================================================================
// power-transcript.mjs —— M-U10a effectsTick 游荡云族八种零引擎导入镜像（power.json 对账面）
// 零 engine import：effectsTick L9801-10447 八支（tornado L9805-9824 / acid L9826-9850 /
//   blizzard L9915-9948 / locust L9949-9971 / drought L9972-9996 / rainstorm L9997-10022 /
//   sandstorm L10068-10090 / famine L10170-10190）+ 到期 splice L10439-10441 +
//   activeBattles %5 清理 L10443-10447 + fx L9781-9799 + attackBuilding L4446-4462
//   （onBuildingDestroyed 天灾早退子集 L4464-4473）+ meltIce L2892-2895 + setTerrain
//   贴花级联子集（L971/972/979/981-984/990-993 + onTerrainChanged L157/159-163——
//   riverDir/owner/road/refreshWaterTier 夹具零值域结构性不触达，注记省略）+
//   markDirty L959-967 + BUILDING_DEFS hp 表（types.ts L325-337 逐值硬编码）。
// 数学面：Math.hypot 原生（bun fdlibm——与 gen 同 runtime 同位；C# 侧 FdHypot/V8Hypot
//   位精确件对账——WbPowerTests 闭合）。
// 未译 kind 注记：volcano/tsunami/wrath/holystorm/typhoon/sinkhole/iceage/blackhole/
//   quake/meteor/fireball/arrow/bullet/…（L9851-10438）——夹具 effects 仅八 kind 注入，
//   else-if 链落空语义=蓝本无匹配（C# 侧同构落空）；到期 splice 对全 kind 生效逐位。
// 运行：bun scripts/unity-migration/power-transcript.mjs（M-U7w 口径：黄金链一律 bun）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 蓝本常量（types.ts/constants.ts 逐值镜像——零导入） ----
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const W = 256, H = 160, N = W * H;
const idx = (x, y) => y * W + x;
const R = { ZOMBIE: 5, PENGUIN: 11, SNOWWOLF: 15, SKELETON: 16, DEMON: 17, WHITEWALKER: 23, ANGEL: 28 };
const BUILDING_HP = [0, 70, 240, 120, 40, 150, 340, 90, 110, 100, 140, 200];   // types.ts L325-337 逐值
const BUILD_FARM = 4;                                   // types.ts L340 BUILD_KINDS.FARM

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
    this.radiate = ungz(fx.radiate0);
    this.waterTier = ungz(fx.waterTier0);   // 水深场初始（generate 后旧地形 tier——对比基线）
    this.radSet = new Map(fx.radSet0);
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
    this.dirty = new Set();
    this.activeBattles = new Map(fx.battles0);
    this.effects = fx.fx0.map((e) => ({ kind: e.kind, x: unhex(e.x), y: unhex(e.y), r: e.r, age: e.age, ttl: e.ttl, seed: e.seed, dir: unhex(e.dir) }));
    this.units = fx.units0.map((u) => ({ id: u.id, race: u.race, x: unhex(u.x), y: unhex(u.y), hp: unhex(u.hp), maxHp: unhex(u.maxHp), hurt: u.hurt, chill: u.chill, dead: u.dead, boat: 0 }));   // boat 夹具恒 0（无船域注记）
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
  fx(kind, x, y, ttl, opts) {             // engine fx L9781-9799（2 掷：seed+dir；x0/y0/age/r 默认 + opts 覆盖——L9793-9797 spread 语义；cap 夹具不触达）
    const seed = Math.floor(this.rng() * 65536);
    const dir = this.rng() * Math.PI * 2;
    const e = { kind, x, y, x0: x, y0: y, r: 1, age: 0, ttl, seed, dir };
    if (opts) for (const k of Object.keys(opts)) e[k] = opts[k];
    this.effects.push(e);
  }
  markDirty(i) {                          // engine L959-967（中心 + 四邻）
    this.dirty.add(i);
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) this.dirty.add(i - 1);
    if (x < W - 1) this.dirty.add(i + 1);
    if (y > 0) this.dirty.add(i - W);
    if (y < H - 1) this.dirty.add(i + W);
  }
  setTerrain(i, t) {                      // engine L969-1007 机械（夹具零值域注记省略——同 fire-transcript 先例；dirty 面入 dump 故 markDirty L976 必译）
    const prev = this.terrain[i];
    if (prev === t) return;               // L971
    this.terrain[i] = t;                  // L972
    // L974 ambTouch / L975 worldsim.onTerrainChanged（soilF 零值域门不触达）——dump 外注记省略
    this.markDirty(i);                    // L976（中心 + 四邻——黄金 dirty 五格面对账）
    // L977 propsDirty——dump 外注记省略
    this.regrow.delete(i);                // L979
    if (prev === T.ICE) this.frozen.delete(i);       // L981
    if (t === T.ICE) this.frozen.add(i);             // L982
    if (t !== T.WATER) this.flood.delete(i);         // L983
    if (t !== T.SAND) this.wet.delete(i);            // L984
    if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }   // L990-993
    if (t === T.BURNT && this.soilFv(i) > 8) this.soilFw(i, this.soilFv(i) - 8);   // L157 火烧地力（soilF 夹具零值域——零值门不触达）
    // L159-163 水覆写清冰川（glacier 夹具零值域——门恒假注记省略）；L997-1001 owner/建筑面（owner 恒 -1）注记省略
    this.refreshWaterTierAround(i);       // L1007 水深场局部重算（tier 变化格 dirty.add L1066——M-U10a no-op 注记消亡）
  }
  landForDepth(t) {                       // engine L1011-1013 机械
    return t !== T.DEEP && t !== T.WATER && t !== T.ICE;
  }
  waterTierAt(i) {                        // engine L1016-1046 机械（WATER 0/1/2 浅礁/近岸/开阔；DEEP 3 陆架/4 深渊）
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
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // 只查外环
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (this.landForDepth(this.terrain[yy * W + xx])) { land = true; break; }
        }
      }
      if (land) return r - 1;
    }
    return 2;
  }
  refreshWaterTierAround(i) {             // engine L1054-1070 机械（tier 变化格 dirty.add——L1066）
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
  soilFv(i) { return 0; }                 // soilF 夹具零值域（worldsim 场未注入——恒 0 门恒假）
  soilFw(i, v) { /* 同上 */ }
  meltIce(i) {                            // engine L2892-2895 机械
    if (this.terrain[i] !== T.ICE) return;
    this.setTerrain(i, T.WATER);
  }
  destroyBuilding(i) {                    // engine L1936-1955 机械（swap-pop + smoke fx 2 掷——civ=-1 账不触）
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
  attackBuilding(i, dmg, byCiv) {         // engine L4446-4462 机械
    const kind = this.building[i];
    if (kind === 0) return;
    let hp = this.bHp.get(i) ?? BUILDING_HP[kind];
    hp -= dmg;
    const x = i % W;
    const y = (i / W) | 0;
    if (hp <= 0) {
      this.onBuildingDestroyed(i, byCiv);
    } else {
      this.bHp.set(i, hp);
      this.damagedSet.add(i);
      this.fx('hit', x + 0.5, y + 0.5, 6);
    }
  }
  onBuildingDestroyed(i, byCiv) {         // engine L4464-4473 子集（天灾早退——夹具 civ=-1 byCiv=-1 战争结算面不触达）
    const bi = this.bIdx.get(i);
    if (bi === undefined) return;
    this.destroyBuilding(i);
    if (byCiv == null || byCiv < 0) return;
  }
  effectsTick() {                         // engine L9801-10447 八支机械（未译 kind else-if 落空——夹具仅八 kind 注入）
    for (let i = this.effects.length - 1; i >= 0; i--) {   // L9802
      const e = this.effects[i];
      e.age++;                             // L9803
      if (e.kind === 'tornado') {          // L9805-9824
        e.dir += (this.rng() - 0.5) * 0.35;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.2));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.2));
        for (const u of this.units) {
          if (u.dead) continue;
          const d = Math.hypot(u.x - e.x, u.y - e.y);
          if (d < 3.2) {
            const nx = u.x + ((u.x - e.x) / (d + 0.01)) * 0.4;
            const ny = u.y + ((u.y - e.y) / (d + 0.01)) * 0.4;
            const flying = u.race === R.ANGEL;   // RACES[u.race].flying——夹具飞行种 = ANGEL（RelayDef L188）
            if (this.walkableT(this.terrain[idx(Math.floor(nx), Math.floor(ny))]) || flying) {
              u.x = Math.max(0.5, Math.min(W - 0.5, nx));
              u.y = Math.max(0.5, Math.min(H - 0.5, ny));
            }
            u.hurt = 16;
            if (d < 2.2) u.hp -= 1.2;
          }
        }
        const ti = idx(Math.floor(e.x), Math.floor(e.y));
        if (this.building[ti] > 0 && this.rng() < 0.3) this.destroyBuilding(ti);
        if (this.terrain[ti] === T.FOREST && this.rng() < 0.08) this.setTerrain(ti, T.GRASS);
      } else if (e.kind === 'acid') {      // L9826-9850
        const ar2 = e.r * e.r;
        for (const u of this.units) {
          if (u.dead) continue;
          const adx = u.x - e.x;
          const ady = u.y - e.y;
          if (adx * adx + ady * ady < ar2) {
            u.hp -= 0.3;
            u.hurt = 10;
            if (u.hp <= 0) u.dead = true;
          }
        }
        if (this.rng() < 0.9) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS && this.rng() < 0.55) this.setTerrain(j, T.BURNT);
            else if (t === T.FOREST && this.rng() < 0.35) this.setTerrain(j, T.GRASS);
            else if (t === T.SNOW && this.rng() < 0.3) this.setTerrain(j, T.GRASS);
            if (this.building[j] > 0 && this.rng() < 0.1) this.attackBuilding(j, 3, -1);
          }
        }
      } else if (e.kind === 'blizzard') {  // L9915-9948
        e.dir += (this.rng() - 0.5) * 0.3;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.12));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.12));
        const br2 = e.r * e.r;
        for (const u of this.units) {
          if (u.dead) continue;
          const bdx = u.x - e.x;
          const bdy = u.y - e.y;
          if (bdx * bdx + bdy * bdy < br2) {
            const coldBorn = u.race === R.PENGUIN || u.race === R.SNOWWOLF || u.race === R.WHITEWALKER;
            if (!coldBorn) {
              u.hp -= 0.22; u.hurt = 8; u.chill = 14;
              if (u.hp <= 0) u.dead = true;
            }
          }
        }
        if (this.rng() < 0.8) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS || t === T.BURNT) this.setTerrain(j, T.SNOW);
            else if (t === T.FOREST && this.rng() < 0.4) this.setTerrain(j, T.SNOW);
            else if (t === T.SAND && this.rng() < 0.2) this.setTerrain(j, T.SNOW);
            else if (t === T.WATER && this.rng() < 0.45) this.setTerrain(j, T.ICE);
            else if (t === T.DEEP && this.rng() < 0.06) this.setTerrain(j, T.ICE);
            if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); }
          }
        }
      } else if (e.kind === 'locust') {    // L9949-9971
        e.dir += (this.rng() - 0.5) * 0.25;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.15));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.15));
        const lr2 = e.r * e.r;
        for (const u of this.units) {
          if (u.dead) continue;
          const ldx = u.x - e.x;
          const ldy = u.y - e.y;
          if (ldx * ldx + ldy * ldy < lr2) { u.hp -= 0.06; if (u.hp <= 0) u.dead = true; }
        }
        if (this.rng() < 0.95) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS && this.rng() < 0.6) this.setTerrain(j, T.BURNT);
            else if (t === T.FOREST && this.rng() < 0.25) this.setTerrain(j, T.GRASS);
            if (this.building[j] === BUILD_FARM) this.attackBuilding(j, 4, -1);
          }
        }
      } else if (e.kind === 'drought') {   // L9972-9996（静态穹顶——零游荡零 dir 掷）
        if (this.rng() < 0.85) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS && this.rng() < 0.5) this.setTerrain(j, T.SAND);
            else if (t === T.FOREST && this.rng() < 0.3) this.setTerrain(j, T.BURNT);
            else if (t === T.WATER && this.rng() < 0.25) this.setTerrain(j, T.SAND);
            else if (t === T.ICE && this.rng() < 0.4) this.meltIce(j);
          }
        }
        const dr2 = e.r * e.r;
        for (const u of this.units) {
          if (u.dead) continue;
          const ddx2 = u.x - e.x;
          const ddy2 = u.y - e.y;
          if (ddx2 * ddx2 + ddy2 * ddy2 < dr2) {
            const heatproof = u.race === R.SKELETON || u.race === R.DEMON || u.race === R.ZOMBIE;
            if (!heatproof) { u.hp -= 0.15; u.hurt = 6; if (u.hp <= 0) u.dead = true; }
          }
        }
      } else if (e.kind === 'rainstorm') { // L9997-10022
        e.dir += (this.rng() - 0.5) * 0.2;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.1));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.1));
        if (this.rng() < 1.2) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); this.fx('water', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14); }
            else if (this.radiate[j] > 0) { this.radiate[j] = 0; this.radSet.delete(j); this.markDirty(j); }
            else if (this.terrain[j] === T.BURNT && this.rng() < 0.3) { this.setTerrain(j, T.GRASS); this.fx('water', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14); }
            else if (this.terrain[j] === T.SNOW && this.rng() < 0.1) this.setTerrain(j, T.GRASS);
          }
        }
        if (this.rng() < 0.5) {
          const rr2 = e.r * e.r;
          for (const u of this.units) {
            if (u.dead) continue;
            const rdx = u.x - e.x;
            const rdy = u.y - e.y;
            if (rdx * rdx + rdy * rdy < rr2 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 0.3);
          }
        }
      } else if (e.kind === 'sandstorm') { // L10068-10090
        e.dir += (this.rng() - 0.5) * 0.25;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.16));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.16));
        if (this.rng() < 0.9) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS && this.rng() < 0.5) this.setTerrain(j, T.SAND);
            else if (t === T.FOREST && this.rng() < 0.2) this.setTerrain(j, T.GRASS);
          }
        }
        for (const u of this.units) {
          if (u.dead) continue;
          if (Math.hypot(u.x - e.x, u.y - e.y) < e.r) {
            u.chill = 12;
            u.hp -= 0.1; u.hurt = 8;
            if (u.hp <= 0) u.dead = true;
          }
        }
      } else if (e.kind === 'famine') {    // L10170-10190
        e.dir += (this.rng() - 0.5) * 0.22;
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.12));
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.12));
        for (const u of this.units) {
          if (u.dead) continue;
          if (Math.hypot(u.x - e.x, u.y - e.y) < e.r) {
            const undead = u.race === R.ZOMBIE;   // RACES[u.race].undead——夹具亡灵种 = ZOMBIE（RelayDef L162）
            if (!undead) { u.hp -= 0.24; u.hurt = 10; if (u.hp <= 0) u.dead = true; }
          }
        }
        if (this.rng() < 0.7) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            if (this.building[j] === BUILD_FARM) this.attackBuilding(j, 4, -1);
            else if (this.terrain[j] === T.GRASS && this.rng() < 0.12) this.setTerrain(j, T.BURNT);
          }
        }
      }
      if (e.age >= e.ttl) {                // L10439-10441 到期 splice（全 kind——倒序 RemoveAt 同构）
        this.effects.splice(i, 1);
      }
    }
    // L10443-10447 activeBattles 过期清理（Map 迭代中删——JS 原生；C# 快照二段式对账）
    if (this.activeBattles.size > 0 && this.tickCount % 5 === 0) {
      for (const [k, exp] of this.activeBattles) {
        if (exp <= this.tickCount) this.activeBattles.delete(k);
      }
    }
  }
  walkableT(t) {                          // constants.ts L73-76 机械
    return t !== T.DEEP && t !== T.WATER && t !== T.MOUNTAIN && t !== T.LAVA;
  }
}

// ---- 对账主循环 ----
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/power.json'), 'utf8'));
const eq = (a, b, path_) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${path_} 漂移\n  镜像: ${JSON.stringify(a)}\n  黄金: ${JSON.stringify(b)}`);
};

let pass = 0;
for (const sc of gold.scenarios) {
  const m = new MirrorWorld(sc);
  for (let k = 0; k < sc.steps; k++) {
    m.tickCount++;
    m.effectsTick();
    const g = sc.stepsSnap[k];
    eq((m.rngA >>> 0).toString(16).padStart(8, '0'), g.rngA, `${sc.key} S${k} rngA`);
    eq(md5hex(m.terrain), g.terrainMd5, `${sc.key} S${k} terrainMd5`);
    eq(m.effects.map((e) => ({ kind: e.kind, age: e.age, x: f64hex(e.x), y: f64hex(e.y), dir: f64hex(e.dir) })), g.fx, `${sc.key} S${k} fx 全列`);
    eq(m.units.map((u) => ({ id: u.id, hp: f64hex(u.hp), hurt: u.hurt, chill: u.chill, dead: u.dead, x: f64hex(u.x), y: f64hex(u.y) })), g.units, `${sc.key} S${k} units 全列`);
    eq([...m.fireSet], g.fireSet, `${sc.key} S${k} fireSet 序`);
    eq([...m.regrow.entries()], g.regrow, `${sc.key} S${k} regrow 序`);
    eq([...m.radSet.entries()], g.radSet, `${sc.key} S${k} radSet 序`);
    eq(md5hex(m.radiate), g.radiateMd5, `${sc.key} S${k} radiateMd5`);
    eq([...m.bHp.entries()].map(([k2, v]) => [k2, f64hex(v)]), g.bHp, `${sc.key} S${k} bHp 全列`);
    eq(m.buildings.length, g.buildingsCount, `${sc.key} S${k} buildingsCount`);
    eq([...m.activeBattles.entries()], g.battles, `${sc.key} S${k} battles 序`);
    eq([...m.dirty].sort((a, b) => a - b), g.dirty, `${sc.key} S${k} dirty 序`);
    eq(m.effects.length, g.fxCount, `${sc.key} S${k} fxCount`);
    eq(m.worldEvents.length, g.eventsCount, `${sc.key} S${k} eventsCount`);
  }
  eq(m.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r, age: e.age })), sc.fx, `${sc.key} fx 终态全列`);
  eq(m.units.map((u) => ({ id: u.id, race: u.race, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), hurt: u.hurt, chill: u.chill, dead: u.dead })), sc.units, `${sc.key} units 终态全列`);
  eq([...m.regrow.entries()], sc.regrow, `${sc.key} regrow 终态`);
  eq([...m.radSet.entries()], sc.radSet, `${sc.key} radSet 终态`);
  eq(md5hex(m.radiate), sc.radiateMd5 || md5hex(ungz(sc.radiate)), `${sc.key} radiate 终态`);
  eq(m.worldEvents, sc.events, `${sc.key} events 全列`);
  console.log(`${sc.key}: 逐位 PASS (steps=${sc.steps} draws=${sc.totalDraws} fx=${m.effects.length})`);
  pass++;
}
console.log(`power-transcript: ${pass}/${gold.scenarios.length} 场景 ALL PASS（零引擎导入镜像 · 掷值链闭合 · 八支逐位）`);
