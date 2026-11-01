// ============================================================================
// tool2-transcript.mjs —— M-U15 切片二「三神力创建函数 + nuke/river 调用面」零引擎镜像
//   蓝本 engine.ts：lightning L10507-10531 / earthquake L10532-10544 /
//   spawnTornado L10725-10737 / applyTool case L13333-13356（五 case）/
//   carveRiver L12312-12415（runtime 体——setTerrain 级联 + w.brush 参化 +
//   toast 双文本 + 事件坐标）/ carveLake L12417-12431 / nuke L12255-12260 +
//   explode L10450-10499（M-U10c 译件随件）/ ignite L1078-1085。
// 纪律：零引擎 import（typed 数组天然镜像 JS OOB 语义——terrain[i]=undefined 读、
//   fire[i]=x 定型数组 OOB 写静默丢弃、fireSet.add 负索引容忍——S4 边缘钉面）。
// 红证（纪律②）: TOOL2_RED=ring 禁 lightning 单位环 L10518 → S1/S3 FAIL；
//   TOOL2_RED=cap 禁 tornado 全局上限 L10729 → S7 FAIL → 还原复绿 12/12。
// 运行：bun scripts/unity-migration/tool2-transcript.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const W = 256, H = 160, N = W * H;
const isWater = (t) => t === T.DEEP || t === T.WATER;
const idx = (x, y) => y * W + x;
const RIVER_DIRS = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]];   // engine L63-65
const FLAMMABLE = new Set([T.GRASS, T.FOREST]);          // constants.ts FLAMMABLE（ignite L1075 门）
const TOOL2_RED = process.env.TOOL2_RED ?? '';

function mulberryStep(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
function encodeRiverDir(dx, dy) {          // engine L62-71 机械
  for (let k = 0; k < 8; k++) {
    if (RIVER_DIRS[k][0] === Math.sign(dx) && RIVER_DIRS[k][1] === Math.sign(dy)) return k + 1;
  }
  return 0;
}
function soilMulAt(soilF, j) {             // worldsim.ts L168-170 机械
  return 0.6 + (soilF[j] / 255) * 0.8;
}
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64'));
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

// TOOL_BY_ID 键集子集（本切片 case 五键——守卫全 210 键面 tool.json 链已覆盖，对黄金场景行为等价）
const TOOL_BY_ID_KEYS = new Set(['lightning', 'tornado', 'earthquake', 'nuke', 'river']);
const parseCreationTool = (toolId) => (toolId.startsWith('cre:') ? toolId.slice(4) : null);   // creations.ts L243-245

// ---- 镜像引擎（fixture 注入 + applyTool 直调——黄金回放载体） ----
class BREng {
  constructor(sc) {
    this.tickCount = sc.tickCount;
    this.shake = 0;
    this.rngA = 0;
    this.statNukes = 0;                    // engine L230
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
    this.riverDir = new Uint8Array(N);     // engine L257 Uint8Array（0 非河 / 1-8 八向）
    this.riverTiles = new Set();           // engine L259 Set（插入序=Set 迭代序）
    this.effects = [];
    this.worldEvents = [];
    this.toasts = [];
    this.toastSeq = 1;
    this.radiate = new Uint8Array(gunzip(sc.fixture.radiate0));
    this.radSet = new Map(sc.fixture.radSet0);
    this.brush = sc.fixture.brush0;        // L688 类字段（carveRiver 参化消费面）
    this.variant = new Uint8Array(N);      // 确定域重建（worldgen L65 hash2——fixture 无 variant0）
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.variant[y * W + x] = Math.floor(hash2(x, y, sc.baseSeed + 999) * 255);
    for (const b of sc.fixture.building0) {
      this.building[b.i] = 3;
      this.buildings.push({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: -1 });
      this.bIdx.set(b.i, this.buildings.length - 1);
    }
    for (const e0 of sc.fixture.effects0 ?? []) {   // 直写游荡云族（tornado-cap 计数消费——gen 手术二同构）
      this.effects.push({ kind: e0.kind, x: e0.x, y: e0.y, ttl: 100, age: 0, seed: 1, dir: 0, r: e0.kind === 'quake' ? 8 : undefined });
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
  fx(kind, x, y, ttl, opts) {              // engine fx L13990 子集（seed/dir 2 掷 + r=opts?.r ?? 1）
    const seed = Math.floor(this.rng() * 65536);
    const dir = this.rng() * Math.PI * 2;
    const e = { kind, x, y, ttl, seed, dir, r: 1 };
    if (opts) for (const k of Object.keys(opts)) e[k] = opts[k];
    this.effects.push(e);
  }
  addEvent(kind, text, opts) {             // engine addEvent L13995-14009 子集（unshift + cap 80 + x/y 归一）
    this.worldEvents.unshift({ kind, text, x: (opts && opts.x) ?? null, y: (opts && opts.y) ?? null });
    if (this.worldEvents.length > 80) this.worldEvents.length = 80;
  }
  toast(text, tone, op) {
    this.toasts.push({ id: this.toastSeq++, text, tone, op: op ?? null });
  }
  markDirty(i) {                           // engine markDirty L959-967（五格面——dirty 不入 dump，簿记同构）
    this.dirty.add(i);
    const x = i % W, y = (i / W) | 0;
    if (x > 0) this.dirty.add(i - 1);
    if (x < W - 1) this.dirty.add(i + 1);
    if (y > 0) this.dirty.add(i - W);
    if (y < H - 1) this.dirty.add(i + W);
  }
  destroyBuilding(i) {                     // engine destroyBuilding 子集（smoke 2 掷——M-U10c 随件）
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
  waterTierAt(i) {                         // engine L1016-1045 机械（setTerrain 级联消费）
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
  setTerrain(i, t) {                       // engine setTerrain L969-1009 级联子集（S11/S12 WATER 覆写面——regrow/owner/fire/riverDir/waterTier）
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
  }
  ignite(i) {                              // engine ignite L1078-1085 机械（typed 数组天然 OOB 容忍——S4 钉面）
    const t = this.terrain[i];
    if (this.fire[i] > 0) return;
    if (!FLAMMABLE.has(t) && this.building[i] === 0) return;
    this.fire[i] = 150 + Math.floor(this.rng() * 90);
    this.fireSet.add(i);
  }
  isLand(t) {                              // constants.ts L70-72 机械（explode 消费）
    return t !== T.DEEP && t !== T.WATER && t !== T.LAVA;
  }
  // ---- M-U15 三神力创建函数机械翻译 ----
  lightning(x, y, count = 1, power = 1) {  // engine L10507-10531
    /* this.onSound?.('thunder') —— 宿主回调（连击只播一次） */
    const n = Math.max(1, Math.min(12, Math.floor(count)));   // L10509
    const pw = Math.max(0.5, Math.min(3, power));             // L10510
    for (let k = 0; k < n; k++) {                             // L10511
      const lx = n > 1 ? x + (this.rng() - 0.5) * Math.max(2, n) : x;   // L10513（首击 n>1 亦散布）
      const ly = n > 1 ? y + (this.rng() - 0.5) * Math.max(2, n) : y;   // L10514
      this.fx('bolt', lx, ly, 10);                            // L10515（2 掷）
      for (const u of this.units) {                           // L10516（无 dead 过滤——机械保持）
        const d = Math.hypot(u.x - lx, u.y - ly);             // L10517（fdlibm）
        if (d < 1.9 && TOOL2_RED !== 'ring') { u.hp -= 95 * pw; u.hurt = 30; if (u.hp <= 0) u.dead = true; }   // L10518（红证旋钮：TOOL2_RED=ring 禁单位环伤）
      }
      const i = idx(Math.floor(lx), Math.floor(ly));          // L10519（idx 无钳——负 fy OOB 面 typed 数组天然容忍）
      this.ignite(i);                                         // L10520
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {      // L10522
        const xx = Math.floor(lx) + dx;                       // L10523
        const yy = Math.floor(ly) + dy;                       // L10524
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; // L10525（先界外后掷）
        if (this.rng() < 0.5) this.ignite(idx(xx, yy));       // L10526（1 掷/格）
      }
    }
    this.shake = Math.max(this.shake, 4);                     // L10530（max 不覆写）
  }
  earthquake(x, y, r = 9, power = 1) {     // engine L10532-10544
    /* this.onSound?.('quake') —— 宿主回调 */
    const rr = Math.max(3, Math.min(24, r));                  // L10534
    const pw = Math.max(0.5, Math.min(3, power));             // L10535
    this.fx('quake', x, y, Math.max(30, Math.floor(90 * pw)), { r: rr });   // L10537（opts {r:rr}）
    this.shake = Math.min(12, Math.round(8 * pw));            // L10538（JS Math.round .5 上取整；直写非 max）
  }
  spawnTornado(x, y, count = 1) {          // engine L10725-10737
    const n = Math.max(1, Math.min(6, Math.floor(count)));    // L10726
    const cur = this.effects.filter((e) => e.kind === 'tornado').length;   // L10727（filter 快照）
    for (let k = 0; k < n; k++) {                             // L10728
      if (cur + k >= 6 && TOOL2_RED !== 'cap') break;                                // L10729（全局上限防刷屏；红证旋钮：TOOL2_RED=cap 禁）
      const ox = k === 0 ? 0 : (this.rng() - 0.5) * Math.max(4, n * 2);   // L10730（k=0 零掷）
      const oy = k === 0 ? 0 : (this.rng() - 0.5) * Math.max(4, n * 2);   // L10731
      this.fx('tornado', x + ox, y + oy, 340);                // L10732（ttl=340）
    }
  }
  nuke(x, y, power = 1) {                  // engine L12255-12260 机械（M-U10c 译件随件）
    this.statNukes++;
    const r = Math.max(3, Math.min(24, 7 * power));
    this.explode(x, y, r, { terrain: true, lava: true, nuke: true });
  }
  wwCountKill(u) {                         // engine wwCountKill L8690 子集（killCredit 恒 null 桩形——M-U3c 同构）
  }
  explode(x, y, r, opts) {                 // engine explode L10450-10499 机械（nuke 支全译——M-U10c 译件随件）
    /* this.onSound?.(nuke ? 'nuke' : 'boom') —— 宿主回调 */
    for (let yy = Math.floor(y - r); yy <= y + r; yy++) {
      for (let xx = Math.floor(x - r); xx <= x + r; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(xx - x, yy - y);
        if (d > r) continue;
        const i = idx(xx, yy);
        if (this.building[i] > 0) this.destroyBuilding(i);
        if (opts && opts.terrain && this.isLand(this.terrain[i])) {
          if (opts && opts.lava && d < 1.8) this.setTerrain(i, T.LAVA);
          else if (this.terrain[i] !== T.MOUNTAIN) this.setTerrain(i, T.BURNT);
          if (d > r * 0.55 && this.rng() < 0.3) this.ignite(i);
        }
      }
    }
    for (const u of this.units) {
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < r + 0.8) {
        u.hp -= 300 * Math.max(0.15, 1 - d / (r + 0.8));
        u.hurt = 30;
        if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
      }
    }
    this.shake = Math.max(this.shake, opts && opts.nuke ? 14 : 8);
    this.fx('explosion', x, y, 26, { r });
    for (let s = 0; s < 6; s++) {
      this.fx('smoke', x + this.rng() * r - r / 2, y + this.rng() * r - r / 2, 34);
    }
    if (opts && opts.nuke) {
      this.fx('flash', x, y, 14);
      this.fx('mushroom', x, y, 90);
      this.addEvent('nuke', '蘑菇云在大地上升起，幸存者将长久铭记这一天', { x, y });
      for (let yy = Math.floor(y - 5); yy <= y + 5; yy++) {
        for (let xx = Math.floor(x - 5); xx <= x + 5; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (Math.hypot(xx - x, yy - y) < 5) {
            const i = idx(xx, yy);
            this.radiate[i] = 1;
            this.radSet.set(i, this.tickCount + 2400);
            this.markDirty(i);
          }
        }
      }
    }
  }
  carveLake(cx, cy, r) {                   // engine carveLake L12417-12431（runtime 体——setTerrain 级联）
    for (let dy = -r - 1; dy <= r + 1; dy++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx, dy);      // L12421（整数极距 fdlibm）
        if (d <= r) {
          this.setTerrain(idx(xx, yy), T.WATER);   // L12403（山区淹没山体——级联）
        } else if (d <= r + 1) {
          const j = idx(xx, yy);
          if (this.terrain[j] === T.SAND || this.terrain[j] === T.BURNT) this.setTerrain(j, T.GRASS);   // L12406 湖畔绿洲
        }
      }
    }
    this.fx('spawn', cx + 0.5, cy + 0.5, 30);   // L12410（2 掷）
  }
  carveRiver(wx, wy, widthOverride) {      // engine carveRiver L12312-12415（runtime 体——w.brush 参化 + toast 双文本 + 事件坐标）
    const sx = Math.max(0, Math.min(W - 1, Math.floor(wx)));              // L12313
    const sy = Math.max(0, Math.min(H - 1, Math.floor(wy)));              // L12314
    const start = idx(sx, sy);                                            // L12315
    if (isWater(this.terrain[start])) return false;                       // L12316（零掷早退）
    // BFS：从所有水格出发计算每格到水的步数（绕开山脉）
    const dist = new Int32Array(N).fill(-1);
    const queue = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let i = 0; i < N; i++) {
      if (isWater(this.terrain[i])) { dist[i] = 0; queue[qt++] = i; }
    }
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % W, y = (i / W) | 0;
      const d = dist[i];
      if (x > 0 && dist[i - 1] === -1 && this.terrain[i - 1] !== T.MOUNTAIN) { dist[i - 1] = d + 1; queue[qt++] = i - 1; }
      if (x < W - 1 && dist[i + 1] === -1 && this.terrain[i + 1] !== T.MOUNTAIN) { dist[i + 1] = d + 1; queue[qt++] = i + 1; }
      if (y > 0 && dist[i - W] === -1 && this.terrain[i - W] !== T.MOUNTAIN) { dist[i - W] = d + 1; queue[qt++] = i - W; }
      if (y < H - 1 && dist[i + W] === -1 && this.terrain[i + W] !== T.MOUNTAIN) { dist[i + W] = d + 1; queue[qt++] = i + W; }
    }
    if (dist[start] === -1) {                                             // L12322-12328 山脉环抱 → 内流湖
      this.carveLake(sx, sy, Math.max(2, this.brush));                    // L12323（this.brush 参化）
      this.toast('群山环抱的洼地积水成湖', 'info');                        // L12324（toast——零 rng）
      this.addEvent('river', '群山之间诞生了一泓内流湖', { x: sx + 0.5, y: sy + 0.5 });   // L12325
      /* this.onSound?.('heal') —— 宿主回调 */
      return true;
    }
    const width = widthOverride != null ? widthOverride : Math.max(0, Math.floor((this.brush - 1) / 2));   // L12332（this.brush 参化）
    const visited = new Uint8Array(N);
    let cx = sx, cy = sy, carved = 0, reached = false;
    for (let steps = 0; steps < 400; steps++) {                           // L12337
      const i = idx(cx, cy);
      if (visited[i]) break;                                              // L12339 防绕圈（零掷）
      visited[i] = 1;
      if (dist[i] === 0) { reached = true; break; }                       // L12341 抵海（零掷）
      const curD = dist[i];
      const cands = [], wts = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = idx(xx, yy);
        if (dist[j] < 0 || dist[j] >= curD) continue;
        cands.push(j);
        wts.push(1 / (1 + (curD - dist[j]) * 0.5));                       // L12355
      }
      if (cands.length === 0) { this.carveLake(cx, cy, Math.max(2, width + 1)); break; }   // L12358-12361
      let total = 0;
      for (const w of wts) total += w;
      let r = this.rng() * total;                                         // L12365（1 掷/步）
      let pick = cands[0];
      for (let k = 0; k < cands.length; k++) { r -= wts[k]; if (r <= 0) { pick = cands[k]; break; } }
      const nx = pick % W, ny = (pick / W) | 0;
      const dirCode = encodeRiverDir(nx - cx, ny - cy);                   // L12370
      for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) {   // L12372-12385
        if (dx * dx + dy * dy > width * width + 0.5) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = idx(xx, yy);
        if (this.terrain[j] === T.MOUNTAIN) continue;                     // L12378 河绕山
        if (this.terrain[j] !== T.WATER) { this.setTerrain(j, T.WATER); carved++; }   // L12379（级联）
        if (dirCode > 0) {
          this.riverDir[j] = dirCode;
          this.riverTiles.add(j);                                         // L12382（Set.add 重复 no-op → 插入序）
        }
      }
      const ir = width + 1;                                               // L12386-12397 沿岸灌溉
      for (let dy = -ir; dy <= ir; dy++) for (let dx = -ir; dx <= ir; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = idx(xx, yy);
        const t = this.terrain[j];
        if (t === T.SAND || t === T.BURNT) this.setTerrain(j, T.GRASS);
        else if (t === T.GRASS && this.rng() < 0.05 * soilMulAt(this.soilF, j)) this.setTerrain(j, T.FOREST);   // L12395（&& 短路 1 掷/GRASS 格）
      }
      cx = nx; cy = ny;                                                   // L12398-12399
    }
    if (carved > 0) {                                                     // L12401-12407
      this.fx('spawn', wx, wy, 30);                                       // L12402（2 掷）
      this.toast(reached ? '一条大河蜿蜒入海' : '河流在洼地尽头积成了湖', 'info');   // L12403（toast 文 ≠ 事件文异构）
      this.addEvent('river', reached ? '一条大河诞生了，蜿蜒流向大海' : '一条河在洼地尽头汇成了湖', { x: sx + 0.5, y: sy + 0.5 });   // L12404
      /* this.onSound?.('heal') —— 宿主回调 */
      return true;
    }
    return false;                                                         // L12408
  }
  // ---- applyTool 大分发器切片二（骨架 M-U14 译件 + 五 case 点亮） ----
  applyTool(toolId, wx, wy, parms) {        // engine L13230-13420
    if (!TOOL_BY_ID_KEYS.has(toolId) && !parseCreationTool(toolId)) return;   // L13233（守卫）
    const pv = (k, d) => (parms && typeof parms[k] === 'number' && Number.isFinite(parms[k]) ? parms[k] : d);   // L13235-13238
    const rRaw = pv('radius', NaN);         // L13239
    const r = Number.isFinite(rRaw) ? rRaw : this.brush;              // L13240（笔刷回退）
    const rP = Number.isFinite(rRaw) ? rRaw : undefined;              // L13241
    const count = Math.max(1, Math.floor(pv('count', 1)));            // L13242
    const countP = parms && 'count' in parms ? count : undefined;     // L13243
    const power = pv('power', 1);           // L13244
    const powerP = parms && 'power' in parms ? power : undefined;     // L13245
    const duration = Math.max(20, Math.floor(pv('duration', 0)));     // L13246
    const durationP = parms && 'duration' in parms ? duration : undefined;   // L13247
    switch (toolId) {                       // L13297
      case 'lightning': this.lightning(wx, wy, countP, powerP); break;   // L13333-13335
      case 'tornado': this.spawnTornado(wx, wy, countP); break;          // L13336-13338
      case 'earthquake': this.earthquake(wx, wy, rP ?? 9, powerP); break;   // L13339-13341（rP ?? 9）
      case 'nuke': this.nuke(wx, wy, powerP); break;                     // L13351-13353
      case 'river': this.carveRiver(wx, wy); break;                      // L13354-13356
      default: break;                         // L13427-13428
    }
  }
}

function hash2(x, y, seed) {               // noise.ts L14-19 机械重写（variant 确定域重建）
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

// ---- 黄金回放对账 ----
const golden = JSON.parse(readFileSync(new URL('./golden/tool2.json', import.meta.url), 'utf8'));
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
    if (call.fn !== 'applyTool') throw new Error(`${sc.key}: 未知调用 ${call.fn}`);
    eng.applyTool(call.args[0], call.args[1], call.args[2], call.args[3]);
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
      riverDirMd5: md5hex(eng.riverDir),
      riverTiles: [...eng.riverTiles],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
      buildingsCount: eng.buildings.length,
      shake: eng.shake,
      statNukes: eng.statNukes,
      unitsCount: eng.units.length,
    };
    for (const k of Object.keys(m)) cmp(m[k], g[k], `step${s}.${k}`);
  }
  // 终态对账
  let endOk = stepOk;
  let endErr = '';
  if (endOk && md5hex(gunzip(sc.terrain)) !== md5hex(eng.terrain)) { endOk = false; endErr = 'terrain 终态'; }
  if (endOk && sc.variantMd5 !== md5hex(eng.variant)) { endOk = false; endErr = 'variantMd5 终态'; }
  if (endOk && md5hex(gunzip(sc.radiate)) !== md5hex(eng.radiate)) { endOk = false; endErr = 'radiate 终态'; }
  if (endOk && sc.statNukes !== eng.statNukes) { endOk = false; endErr = 'statNukes 终态'; }
  if (endOk && JSON.stringify([...eng.riverTiles]) !== JSON.stringify(sc.riverTiles)) { endOk = false; endErr = 'riverTiles 终态'; }
  if (endOk && sc.riverDirMd5 !== md5hex(eng.riverDir)) { endOk = false; endErr = 'riverDirMd5 终态'; }
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
  if (stepOk && endOk) { pass++; console.log(`${sc.key}: PASS (draws=${sc.totalDraws} fx=${eng.effects.length} ev=${eng.worldEvents.length} units=${eng.units.length} shake=${eng.shake} nukes=${eng.statNukes})`); }
  else { fail++; console.log(`${sc.key}: FAIL (${!stepOk ? firstErr : endErr})`); }
}
console.log(`tool2 transcript: ${pass}/${golden.scenarios.length} 场景逐位 ${pass === golden.scenarios.length ? 'ALL PASS' : 'FAIL'}`);
if (fail > 0) process.exit(1);
