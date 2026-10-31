// ============================================================================
// power-transcript.mjs —— M-U10a 游荡云族八种 + M-U10b 波前族/静态族五 kind + M-U10c 命中族三 kind
// 零引擎导入：effectsTick L9801-10447 八支（tornado L9805-9824 / acid L9826-9850 /
//   blizzard L9915-9948 / locust L9949-9971 / drought L9972-9996 / rainstorm L9997-10022 /
//   sandstorm L10068-10090 / famine L10170-10190）
//   + M-U10b 五支（tsunami L9877-9914 / sinkhole L10120-10147 / iceage L10148-10169 /
//   blackhole L10191-10223 / quake L10224-10236）
//   + M-U10c 三支（meteor L10237-10239 / fireball L10240-10254 / arrow·bullet L10255-10294）
//   + explode L10450-10499（terrain/nuke 全译——nuke 支夹具不触达注记）+ ignite L1072-1077
//   + 到期 splice L10439-10441 + activeBattles %5 清理 L10443-10447 + fx L9781-9799 +
//   attackBuilding L4446-4462
//   （onBuildingDestroyed 天灾早退子集 L4464-4473）+ meltIce L2892-2895 + setTerrain
//   贴花级联子集（L971/972/976/979/981-984/983 flood/990-993 + onTerrainChanged L157/159-163——
//   riverDir/owner/road/refreshWaterTier 夹具零值域结构性不触达，注记省略）+
//   markDirty L959-967 + BUILDING_DEFS hp 表（types.ts L325-337 逐值硬编码）。
// 数学面：Math.hypot 原生（bun fdlibm——与 gen 同 runtime 同位；sinkhole/iceage/blackhole
//   同消费面；C# 侧 FdHypot/V8Hypot 位精确件对账——WbPowerTests 闭合）。
// 未译 kind 注记：volcano/wrath/holystorm/typhoon/…war 面
//   （L9851-10295-10438）——else-if 链落空语义=蓝本无匹配（C# 侧同构落空）；到期 splice 对全 kind 生效逐位。
// 震屏面：shake 字段镜像（tsunami age1=6/sinkhole %2=4/quake=7 直写/blackhole=9——
//   onSound 宿主回调黄金受控 undefined no-op）。
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
const R = { HUMAN: 0, SHEEP: 6, ZOMBIE: 5, PENGUIN: 11, SNOWWOLF: 15, SKELETON: 16, DEMON: 17, MAGE: 18, WHITEWALKER: 23, ANGEL: 28 };
const CIV_RACES = new Set([R.HUMAN, 1, 2, 3, 19, 20]);   // types.ts RACES isCiv 六族（HUMAN/ELF/DWARF/ORC/LIZARD/GOBLIN——L157-160/177-178）
const FLAMMABLE = new Set([T.GRASS, T.FOREST]);          // constants.ts FLAMMABLE（ignite L1075 门——M-U7q 消费面）
const BUILDING_HP = [0, 70, 240, 120, 40, 150, 340, 90, 110, 100, 140, 200];   // types.ts L325-337 逐值
const BUILD_FARM = 4;                                   // types.ts L340 BUILD_KINDS.FARM
const BUILD_CAPITAL = 2;                                // types.ts L340 BUILD_KINDS.CAPITAL
const CAPTURABLE = new Set([1, 4, 9, 5, 7]);            // types.ts L343（HOUSE/FARM/MARKET/BARRACKS/PORT——M-U10d raze 级联门）
const BUILD_NAME = ['空地', '住宅', '王都', '箭塔', '农田', '兵营', '城堡', '港口', '图书馆', '集市', '神殿', '城墙'];   // C# BuildName 同源（types.ts BUILDING_DEFS name）

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
    this.buildings = fx.building0.map((b) => ({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: b.civ ?? -1 }));   // M-U10c civ 通道（箭矢建筑战争面）
    this.bIdx = new Map(fx.building0.map((b, k) => [b.i, k]));
    this.building = new Uint8Array(N);
    for (const b of fx.building0) this.building[b.i] = b.kind;
    for (const [i, kind] of fx.orphanB0 ?? []) this.building[i] = kind;   // M-U10c 孤儿建筑格（building>0 无记录——L10289 undefined 镜像钉）
    this.rel = new Map(fx.rel0 ?? []);     // M-U10c 外交挂账（pairKey 字符串键 → atWar L2061-2064）
    this.bHp = new Map();
    this.damagedSet = new Set();
    this.dirty = new Set();
    this.activeBattles = new Map(fx.battles0);
    this.effects = fx.fx0.map((e) => { const ex = unhex(e.x), ey = unhex(e.y); return { kind: e.kind, x: ex, y: ey, x0: e.x0 !== undefined ? unhex(e.x0) : ex, y0: e.y0 !== undefined ? unhex(e.y0) : ey, r: e.r, age: e.age, ttl: e.ttl, seed: e.seed, dir: unhex(e.dir), src: e.src ?? undefined, dmg: e.dmg ?? undefined, quiet: e.quiet === true, wid: e.wid ?? undefined, nuke: e.nuke ?? undefined, fire: e.fire ?? undefined }; });   // M-U10c src/dmg/quiet + M-U10d wid/nuke/fire 通道 + M-U10e 稀疏 x0/y0（缺键 ≡ fx() 默认 x0=x/y0=y L9793-9797）
    this.units = fx.units0.map((u) => ({ id: u.id, race: u.race, x: unhex(u.x), y: unhex(u.y), hp: unhex(u.hp), maxHp: unhex(u.maxHp), hurt: u.hurt, chill: u.chill, dead: u.dead, boat: 0, civ: u.civ ?? -1, gbArmor: u.gbArmor ?? 0 }));   // boat 夹具恒 0（无船域注记）；civ/gbArmor M-U10c 通道
    this.rebuildBuckets();                 // M-U10c：arrow/bullet 桶扫描面（gen 注入相尾同构——纯函数零掷）
    this.worldEvents = [];
    this.shake = 0;                         // 震屏（effectsTick 四 kind 写面——S 基线 0）
    this.civs = [];                         // M-U10d（civs0 最小语义面——raze 级联 alive/name/colorHex 消费）
    for (const c of fx.civs0 ?? []) this.civs[c.id] = { id: c.id, name: c.name, alive: true, colorHex: c.colorHex, tiles: [] };
    this.warData = new Map();               // 战争建档表（夹具恒空——addWarScore L7236 早退语义钉）
    this.lastSiegeEventTick = 0;            // engine L521 初值（siege 纪事节流阀）
    this.killCredit = null;                 // engine L615（shell/missile wid 归属面——终态复位钉 L10297/L10300）
    this.statNukes = 0;                     // engine L230（nuke 成就计数——Nuke L12256 写点）
    this.fxPrefs = { dmgNumbers: true };    // engine L271 fxPrefs 默认（dmgNumbers 门——arrow dmg 数字面）
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
    // L159-163 水覆写清冰川（glacier 夹具零值域——门恒假注记省略）
    // L994-997 owner 熄灭（owner 夹具域——数组非对账面 + markDirty 同值幂等；M-U10b 水吞面注记升级）
    if ((t === T.WATER || t === T.DEEP || t === T.LAVA) && this.building[i] > 0) this.destroyBuilding(i);   // L998-1000 水吞建筑（smoke 2 掷——先于调用方 flood.set 掷序！tsunami 黄金实证）
    // L1002-1004 road 溺断（road 夹具恒 0 域——结构性不触达注记）
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
  onBuildingDestroyed(i, byCiv) {         // engine L4464-4498（M-U10d 扩：raze 支全译——capture/annex 支夹具外 loud-fail 注记）
    const bi = this.bIdx.get(i);
    if (bi === undefined) return;
    const b = this.buildings[bi];
    const kind = b.kind;
    const victimCiv = b.civ;
    this.destroyBuilding(i);
    if (byCiv == null || byCiv < 0 || byCiv === victimCiv) return;   // L4472 天灾/己方摧毁：无战争结算
    const attacker = this.civs[byCiv];
    const victim = this.civs[victimCiv];
    if (!attacker || !attacker.alive || !victim || !victim.alive) return;   // L4475
    if (!this.atWar(byCiv, victimCiv)) return;                       // L4476
    if (CAPTURABLE.has(kind) && this.rng() < 0.45) {                 // L4478 占领支（45%）
      // capture 支（buildBuilding+annexTiles+warScore 8+capture 纪事+spawn fx）——S20 seed 钉 raze 支不触达；
      //   触达即夹具越界（须扩镜像镜像面）→ loud-fail 防静默漂移
      throw new Error(`onBuildingDestroyed capture 支触达（kind=${kind}）——M-U10e 候选：扩 civs env + annexTiles 镜像`);
    }
    if (kind === BUILD_CAPITAL) {
      // sackCapital 支（L4488-4491）——夹具无王都（kind∈{1,4}），触达即越界 loud-fail
      throw new Error(`onBuildingDestroyed sackCapital 支触达——M-U10e 候选`);
    }
    this.addWarScore(byCiv, victimCiv, 5, 'raze');                   // L4493（warData 空表早退——零写面）
    if (this.tickCount - this.lastSiegeEventTick > 150) {            // L4494 节流纪事
      this.lastSiegeEventTick = this.tickCount;                      // L4495
      this.addEvent('siege', `「${attacker.name}」的军队摧毁了「${victim.name}」的${BUILD_NAME[kind]}`, { colorHex: attacker.colorHex, x: b.x, y: b.y });   // L4496
    }
  }
  addWarScore(byCiv, victimCiv, pts, kind) {   // engine L7234-7245 机械（warData 夹具恒空——wd 早退即全语义）
    const wd = this.warData.get(byCiv < victimCiv ? `${byCiv}-${victimCiv}` : `${victimCiv}-${byCiv}`);
    if (!wd) return;
    const isA = wd.a === byCiv;
    if (isA) wd.scoreA += pts; else wd.scoreB += pts;
    if (kind === 'kill') {
      if (isA) { wd.casB += 1; wd.exB += 1; } else { wd.casA += 1; wd.exA += 1; }
    } else if (kind === 'raze' || kind === 'capture') {
      if (isA) wd.razedA += 1; else wd.razedB += 1;
    }
  }
  shellBurst(x, y, r, dmg, fire = false, src = -1) {   // engine L9595-9620 机械（M-U10d——单位环无 src 豁免/建筑环无友军门/ignite 四重门短路）
    for (const u of this.units) {
      if (u.dead) continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < r + 0.4) {
        u.hp -= dmg * Math.max(0.25, 1 - d / (r + 0.4));
        u.hurt = 24;
        if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
      }
    }
    const rr = Math.ceil(r);
    for (let yy = Math.floor(y - rr); yy <= y + rr; yy++) {
      for (let xx = Math.floor(x - rr); xx <= x + rr; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (Math.hypot(xx + 0.5 - x, yy + 0.5 - y) > r) continue;   // 格中心距（与 explode 角距异构注记）
        const i = idx(xx, yy);
        if (this.building[i] > 0) this.attackBuilding(i, dmg * 0.9, src);
        if (fire && this.isLand(this.terrain[i]) && this.terrain[i] !== T.MOUNTAIN && this.rng() < 0.45) this.ignite(i);
      }
    }
    this.fx('explosion', x, y, 16, { r });
    this.shake = Math.max(this.shake, Math.min(5, 1 + r));
  }
  nuke(x, y, power = 1) {                // engine L12255-12260 机械（statNukes++ + 当量钳 + explode 核域支）
    this.statNukes++;
    const r = Math.max(3, Math.min(24, 7 * power));
    this.explode(x, y, r, { terrain: true, lava: true, nuke: true });
  }
  emergentPayload(e) {                   // engine L9397-9436 桩形（emergentWeapons 恒空表——L9399 早退即全语义；铸造域入链按锚补译）
  }
  rebuildBuckets() {                      // engine L3081-3104 机械（懒清空世代戳为性能优化——全清语义等价，桶内容=本世代全量 units 按 (x/4,y/4) 分桶，桶内序=units 序）
    const bw = 64, bh = 40;               // engine L717-718 ceil(W/4)/ceil(H/4)——C# BKW/BKH 同源
    this.buckets = Array.from({ length: bw * bh }, () => []);
    for (const u of this.units) {
      let cx = (u.x / 4) | 0;
      let cy = (u.y / 4) | 0;
      if (cx > bw - 1) cx = bw - 1; else if (cx < 0) cx = 0;
      if (cy > bh - 1) cy = bh - 1; else if (cy < 0) cy = 0;
      this.buckets[cy * bw + cx].push(u);
    }
  }
  addEvent(kind, text, opts) {            // engine addEvent L13996 子集（unshift；cap 80 夹具不触达；x/y null 归一——events 全列对账面）
    this.worldEvents.unshift({ kind, text, x: (opts && opts.x) ?? null, y: (opts && opts.y) ?? null });
  }
  ignite(i) {                             // engine ignite L1072-1077 机械（FLAMMABLE 门 + fire=150+floor(rng*90) 1 掷 + fireSet 入账）
    const t = this.terrain[i];
    if (this.fire[i] > 0) return;
    if (!FLAMMABLE.has(t) && this.building[i] === 0) return;
    this.fire[i] = 150 + Math.floor(this.rng() * 90);
    this.fireSet.add(i);
  }
  atWar(a, b) {                           // engine atWar L2061-2064 机械（pairKey 字符串键——engine L34；v < -20 门）
    const v = this.rel.get(a < b ? `${a}-${b}` : `${b}-${a}`);
    return v !== undefined && v < -20;
  }
  gearBonus(u) {                          // gearBonus L1498-1520 桩形（engine 真 gearBonus(u).armor 于 gen 快照相采样入 units0.gbArmor——链甲 armor=8 位精确钉；余零同 GEAR_EMPTY L1496）
    return { armor: u.gbArmor || 0, crit: 0, lifesteal: 0, thorns: 0, regen: 0, ranged: 0, speed: 1 };
  }
  isLand(t) {                             // constants.ts L70-72 机械（explode 消费——DEEP/WATER/LAVA 非陆；landForDepth L1011 含 ICE 异表注记）
    return t !== T.DEEP && t !== T.WATER && t !== T.LAVA;
  }
  explode(x, y, r, opts) {                // engine explode L10450-10499 机械（nuke 支全译——夹具 terrain 支触达，nuke 支不触达注记）
    // onSound?.(nuke ? 'nuke' : 'boom') —— 宿主回调（黄金受控 undefined no-op 同 gen 端）
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
  wwCountKill(u) {                        // engine wwCountKill L8690 子集（killCredit 恒 null + worldWar idle 直跳——M-U3c 起大战域恒 idle，同 C# WbCivSim.WwCountKill 桩形）
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
      } else if (e.kind === 'tsunami') {   // L9877-9914（M-U10b 波前族）
        const t = e.age / e.ttl;
        const waveR = 1 + t * e.r;
        const prevR = 1 + ((e.age - 1) / e.ttl) * e.r;
        const prevR2 = prevR * prevR;      // 波前判定平方半径（两处循环共用——免三角函数）
        const waveR2 = waveR * waveR;
        const waveRu2 = (waveR + 1) * (waveR + 1);
        for (let yy = Math.floor(e.y - waveR); yy <= e.y + waveR; yy++) {
          for (let xx = Math.floor(e.x - waveR); xx <= e.x + waveR; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const ddx = xx + 0.5 - e.x;
            const ddy = yy + 0.5 - e.y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 >= prevR2 && d2 < waveR2) {
              const j = idx(xx, yy);
              const tt = this.terrain[j];
              // 山脉/丘陵/岩浆/冰面幸存；低地化为汪洋（洪水退潮——湿沙→沙滩）
              if (tt !== T.MOUNTAIN && tt !== T.HILL && tt !== T.WATER && tt !== T.DEEP && tt !== T.LAVA && tt !== T.ICE) {
                this.setTerrain(j, T.WATER);
                this.flood.set(j, this.tickCount + 240 + Math.floor(this.rng() * 120)); // 逐瓦片掷 6~9 年后退潮（setTerrain 级联水吞毁建筑之后——L998 先于 L9898 的掷序黄金实证）
                if (this.building[j] > 0) this.destroyBuilding(j);
              }
            }
          }
        }
        // 波前生物：溺水（非飞行/航海者）
        for (const u of this.units) {
          if (u.dead || u.boat) continue;
          const udx = u.x - e.x;
          const udy = u.y - e.y;
          const ud2 = udx * udx + udy * udy;
          if (ud2 >= prevR2 && ud2 < waveRu2 && u.race !== R.ANGEL) {   // RACES[u.race].flying——夹具飞行种 = ANGEL
            u.hp -= 60; u.hurt = 24; if (u.hp <= 0) u.dead = true;
          }
        }
        if (e.age === 1) this.shake = Math.max(this.shake, 6);
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
      } else if (e.kind === 'sinkhole') {  // L10120-10147（M-U10b 波前族——环状渐进塌陷）
        const t = e.age / e.ttl;
        const waveR = 0.5 + t * e.r;
        const prevR = 0.5 + ((e.age - 1) / e.ttl) * e.r;
        for (let yy = Math.floor(e.y - waveR); yy <= e.y + waveR; yy++) {
          for (let xx = Math.floor(e.x - waveR); xx <= e.x + waveR; xx++) {
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const d = Math.hypot(xx + 0.5 - e.x, yy + 0.5 - e.y);
            if (d >= prevR && d < waveR) {
              const j = idx(xx, yy);
              const tt = this.terrain[j];
              if (tt !== T.MOUNTAIN && tt !== T.WATER && tt !== T.DEEP && tt !== T.LAVA) {   // HILL 不豁免——tsunami 对照面
                this.setTerrain(j, T.WATER);
                if (this.building[j] > 0) this.destroyBuilding(j);
                // 蓝本无 flood.set——sinkhole 永久性水面（语义钉）
              }
            }
          }
        }
        if (e.age % 2 === 0) this.shake = Math.max(this.shake, 4);
        // 塌陷波前生物：坠落重伤
        for (const u of this.units) {
          if (u.dead || u.boat) continue;
          const d = Math.hypot(u.x - e.x, u.y - e.y);
          if (d >= prevR && d < waveR + 0.5 && u.race !== R.ANGEL) {
            u.hp -= 55; u.hurt = 24; if (u.hp <= 0) u.dead = true;
          }
        }
      } else if (e.kind === 'iceage') {    // L10148-10169（M-U10b 静态族——恒真门掷位保持）
        if (this.rng() < 1.6) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));
          if (j >= 0 && j < W * H) {
            const t = this.terrain[j];
            if (t === T.GRASS || t === T.BURNT || t === T.SAND) this.setTerrain(j, T.SNOW);
            else if (t === T.FOREST && this.rng() < 0.5) this.setTerrain(j, T.SNOW);
            else if (t === T.WATER && this.rng() < 0.55) this.setTerrain(j, T.ICE);
            else if (t === T.DEEP && this.rng() < 0.08) this.setTerrain(j, T.ICE);
            if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); }
          }
        }
        for (const u of this.units) {
          if (u.dead) continue;
          if (Math.hypot(u.x - e.x, u.y - e.y) < e.r) {
            const coldBorn = u.race === R.PENGUIN || u.race === R.SNOWWOLF || u.race === R.WHITEWALKER;
            if (!coldBorn) { u.hp -= 0.26; u.hurt = 8; u.chill = 16; if (u.hp <= 0) u.dead = true; }
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
      } else if (e.kind === 'blackhole') { // L10191-10223（M-U10b 静态族——零掷引力域）
        const pullR = e.r * Math.min(1, e.age / 50 + 0.25);
        for (const u of this.units) {
          if (u.dead) continue;
          const d = Math.hypot(u.x - e.x, u.y - e.y);
          if (d < pullR && d > 0.3) {
            const pull = Math.min(1.1, 0.35 + (pullR - d) * 0.12);
            u.x += ((e.x - u.x) / d) * pull;
            u.y += ((e.y - u.y) / d) * pull;
            u.hurt = 10;
            if (d < 1.2) { u.hp -= 1.5; if (u.hp <= 0) u.dead = true; }
          }
        }
        if (e.age >= e.ttl - 1) {
          // 奇点爆发：内圈湮灭 + 焦土坑
          for (const u of this.units) {
            if (!u.dead && Math.hypot(u.x - e.x, u.y - e.y) < 3.5) u.dead = true;
          }
          for (let yy = Math.floor(e.y - 3); yy <= e.y + 3; yy++) {
            for (let xx = Math.floor(e.x - 3); xx <= e.x + 3; xx++) {
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              const j = idx(xx, yy);
              if (Math.hypot(xx + 0.5 - e.x, yy + 0.5 - e.y) < 3) {
                if (this.building[j] > 0) this.destroyBuilding(j);
                if (this.terrain[j] !== T.WATER && this.terrain[j] !== T.DEEP) this.setTerrain(j, T.BURNT);
              }
            }
          }
          this.fx('explosion', e.x, e.y, 26, { r: 3 });
          this.shake = Math.max(this.shake, 9);
          // onSound?.('boom') —— 宿主回调（黄金受控 undefined no-op 同 gen 端）
        }
      } else if (e.kind === 'quake') {     // L10224-10236（M-U10b 静态族——shake=7 直写非 max）
        this.shake = 7;
        if (this.rng() < 0.35) {
          const ang = this.rng() * Math.PI * 2;
          const rr = this.rng() * e.r;
          const xx = Math.floor(e.x + Math.cos(ang) * rr);
          const yy = Math.floor(e.y + Math.sin(ang) * rr);
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
            const j = idx(xx, yy);
            if (this.building[j] > 0) this.destroyBuilding(j);
            else if ((this.terrain[j] === T.GRASS || this.terrain[j] === T.FOREST) && this.rng() < 0.3) this.setTerrain(j, T.BURNT);
          }
        }
      } else if (e.kind === 'meteor') {    // L10237-10239（M-U10c 命中族：age>=ttl → explode + 非quiet 入纪事）
        if (e.age >= e.ttl) {
          this.explode(e.x, e.y, 4.2, { terrain: true });
          if (!e.quiet) this.addEvent('meteor', '一颗燃烧的陨石轰然坠地', { x: e.x, y: e.y });
        }
      } else if (e.kind === 'fireball') {  // L10240-10254（M-U10c：溅射 hp-=e.r〔r=伤害位面〕+ MAGE 豁免 + ignite 建筑门）
        if (e.age >= e.ttl) {
          for (const u of this.units) {
            if (u.dead || u.race === R.MAGE) continue;
            const d = Math.hypot(u.x - e.x, u.y - e.y);
            if (d < 1.15) {
              u.hp -= e.r;
              u.hurt = 20;
              if (u.hp <= 0) u.dead = true;
            }
          }
          this.fx('explosion', e.x, e.y, 14, { r: 0.9 });
          const fi = idx(Math.floor(e.x), Math.floor(e.y));
          if (fi >= 0 && fi < W * H && this.building[fi] === 0) this.ignite(fi);
        }
      } else if (e.kind === 'arrow' || e.kind === 'bullet') {   // L10255-10294（M-U10c：桶扫描最近命中 + gearBonus armor 减伤 + 建筑战争面）
        if (e.age >= e.ttl) {
          let hit = null;
          let hitD = 1.1;
          const bw = 64, bh = 40;          // engine L717-718——C# BKW/BKH 同源
          const abx = Math.min(bw - 1, Math.max(0, Math.floor(e.x / 4)));
          const aby = Math.min(bh - 1, Math.max(0, Math.floor(e.y / 4)));
          for (let by = aby - 1; by <= aby + 1; by++) {
            for (let bx = abx - 1; bx <= abx + 1; bx++) {
              if (bx < 0 || by < 0 || bx >= bw || by >= bh) continue;
              for (const o of this.buckets[by * bw + bx]) {
                if (o.dead) continue;
                if (e.src !== undefined && o.civ === e.src) continue;
                const d = Math.hypot(o.x - e.x, o.y - e.y);
                if (d < hitD) { hitD = d; hit = o; }
              }
            }
          }
          if (hit) {
            const dmg = e.dmg ?? 6;
            const gD = CIV_RACES.has(hit.race) ? this.gearBonus(hit) : null;
            const final = gD && gD.armor > 0 ? dmg * (1 - gD.armor / 100) : dmg;
            hit.hp -= final;
            hit.hurt = 20;
            this.fx('hit', e.x, e.y, 6);
            if (this.fxPrefs.dmgNumbers && (final >= 10 || this.rng() < 0.3)) this.fx('dmg', hit.x, hit.y, 24, { text: '-' + Math.round(final) });
            if (hit.hp <= 0) {
              hit.dead = true;
              this.wwCountKill(hit);       // 大战阵亡计数（killCredit 恒 null + worldWar idle 直跳）
            }
          } else {
            const fi = idx(Math.floor(e.x), Math.floor(e.y));
            if (fi >= 0 && fi < W * H && this.building[fi] > 0) {
              const b = this.buildings[this.bIdx.get(fi) ?? -1];   // OOB → undefined 镜像（孤儿建筑格钉）
              if (b && e.src !== undefined && b.civ !== e.src && b.civ >= 0 && e.src >= 0 && this.atWar(e.src, b.civ)) {
                this.attackBuilding(fi, (e.dmg ?? 6) * 0.8, e.src);
              }
            }
          }
        }
      } else if (e.kind === 'shell' && e.age >= e.ttl) {   // L10295-10301（M-U10d：炮弹落地——killCredit 归属/复位 + wid 面 + 稀疏 boom 掷）
        this.killCredit = e.wid ?? null;
        this.shellBurst(e.x, e.y, e.r || 1.6, e.dmg ?? 30, !!e.fire, e.src ?? -1);
        if (e.wid != null) this.emergentPayload(e);
        this.killCredit = null;
        if (this.rng() < 0.2) { /* onSound?.('boom') 宿主回调 no-op（掷骰流消费） */ }
      } else if (e.kind === 'missile' && e.age >= e.ttl) { // L10302-10310（M-U10d：导弹命中——核弹头蘑菇云/常规大威力爆破+纵火）
        if (e.nuke && e.nuke > 0) {
          this.addEvent('nuke', '蘑菇云在战场上升起——核打击命中', { x: e.x, y: e.y });
          this.nuke(e.x, e.y, e.nuke);
        } else {
          this.shellBurst(e.x, e.y, e.r || 2.8, e.dmg ?? 60, true, e.src ?? -1);
          // onSound?.('boom') —— 宿主回调 no-op 同 gen 端
        }
      } else if (e.kind === 'airstrike') {                 // L10311-10322（M-U10e：轰炸机沿航线周期投弹 + 终点收尾爆破——无 killCredit 写面蓝本异形，与 drone 对位）
        const at = Math.min(1, e.age / e.ttl);
        const ax = e.x0 + (e.x - e.x0) * at;               // x0 ?? e.x——fx() 恒置 x0=x，?? 支不可达（镜像同构直读）
        const ay = e.y0 + (e.y - e.y0) * at;
        if (e.age > 6 && e.age % 16 === 0 && at < 0.92) {
          this.shellBurst(ax, ay, 1.2, 22, this.rng() < 0.4, e.src ?? -1);   // fire 实参掷——门过方掷
        }
        if (e.age >= e.ttl) {
          this.shellBurst(e.x, e.y, e.r || 1.8, e.dmg ?? 30, true, e.src ?? -1);
          // onSound?.('boom') —— 宿主回调 no-op 同 gen 端
        }
      } else if (e.kind === 'laser' && e.age >= e.ttl) {   // L10323-10353（M-U10f：激光命中光束线杀伤——点-线段距离<0.75 + 焦点末段全伤 + dmgNumbers 门 text 携带）
        const lsx = e.x0 ?? e.x;
        const lsy = e.y0 ?? e.y;
        const ldx = e.x - lsx;
        const ldy = e.y - lsy;
        const llen = Math.hypot(ldx, ldy) || 1;            // 0 假语义回退 1（除零护栏——退化面 S26 钉）
        const lux = ldx / llen;
        const luy = ldy / llen;
        const ldmg = e.dmg ?? 30;
        this.killCredit = e.wid ?? null;
        for (const u of this.units) {
          if (u.dead) continue;
          if (e.src !== undefined && u.civ === e.src) continue;
          const px = u.x - lsx;
          const py = u.y - lsy;
          const t = Math.max(0, Math.min(llen, px * lux + py * luy));   // 投影钳 [0,llen]——乘加序同构
          const d = Math.hypot(px - lux * t, py - luy * t);
          if (d < 0.75) {
            const final = t / llen > 0.85 ? ldmg : ldmg * 0.7;   // 焦点（弹道末段）全伤
            u.hp -= final;
            u.hurt = 22;
            this.fx('hit', u.x, u.y, 6);
            if (this.fxPrefs.dmgNumbers && this.rng() < 0.4) this.fx('dmg', u.x, u.y, 24, { text: '-' + Math.round(final) });   // dmgNumbers 门短路先掷——真引擎默认 true L271 面真吞掷
            if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
          }
        }
        if (e.wid != null) this.emergentPayload(e);
        this.killCredit = null;
        this.fx('explosion', e.x, e.y, 10, { r: 0.8 });
      } else if (e.kind === 'drone') {                     // L10353-10368（M-U10e：无人机蜂群游猎扫射 + 终点集束——killCredit wid 往返 + emergentPayload 门）
        const dt = Math.min(1, e.age / e.ttl);
        const dxp = e.x0 + (e.x - e.x0) * dt;
        const dyp = e.y0 + (e.y - e.y0) * dt;
        if (e.age > 8 && e.age % 12 === 0 && dt < 0.92) {
          this.killCredit = e.wid ?? null;
          this.shellBurst(dxp, dyp, 1.0, e.dmg ?? 14, false, e.src ?? -1);   // fire 恒 false——零 ignite 掷
          this.killCredit = null;
        }
        if (e.age >= e.ttl) {
          this.killCredit = e.wid ?? null;
          this.shellBurst(e.x, e.y, e.r || 2.6, (e.dmg ?? 14) * 2.6, true, e.src ?? -1);   // 集束 (dmg??14)*2.6 f64 位级
          if (e.wid != null) this.emergentPayload(e);
          this.killCredit = null;
          // onSound?.('boom') —— 宿主回调 no-op 同 gen 端
        }
      } else if (e.kind === 'mech') {                      // L10394-10414（M-U10e：机甲突击机炮扫射 + 终点爆破——src 豁免前置距离门前短路）
        const mt = Math.min(1, e.age / e.ttl);
        const mx = e.x0 + (e.x - e.x0) * mt;
        const my = e.y0 + (e.y - e.y0) * mt;
        if (e.age > 6 && e.age % 12 === 0 && mt < 0.9) {
          for (const u of this.units) {
            if (u.dead) continue;
            if (e.src !== undefined && u.civ === e.src) continue;
            if (Math.hypot(u.x - mx, u.y - my) < 2.4) {
              u.hp -= 14 + this.rng() * 8;                 // 圈内每单位 1 掷
              u.hurt = 20;
              if (u.hp <= 0) { u.dead = true; this.wwCountKill(u); }
            }
          }
          this.fx('bullet', mx + this.rng() * 2 - 1, my + this.rng() * 2 - 1, 5, { x0: mx, y0: my, src: e.src, r: 0, dmg: 0 });   // 曳光面：坐标 2 掷 + seed/dir 2 掷
        }
        if (e.age >= e.ttl) {
          this.shellBurst(e.x, e.y, e.r || 2.2, e.dmg ?? 45, false, e.src ?? -1);   // fire 恒 false
          // onSound?.('boom') —— 宿主回调 no-op 同 gen 端
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
    eq([...m.flood.entries()], g.flood, `${sc.key} S${k} flood 序`);
    eq(m.shake, g.shake, `${sc.key} S${k} shake`);
    eq([...m.dirty].sort((a, b) => a - b), g.dirty, `${sc.key} S${k} dirty 序`);
    eq(m.effects.length, g.fxCount, `${sc.key} S${k} fxCount`);
    eq(m.worldEvents.length, g.eventsCount, `${sc.key} S${k} eventsCount`);
  }
  eq(m.effects.map((e) => ({ kind: e.kind, x: f64hex(e.x), y: f64hex(e.y), ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r, age: e.age })), sc.fx, `${sc.key} fx 终态全列`);
  eq(m.units.map((u) => ({ id: u.id, race: u.race, x: f64hex(u.x), y: f64hex(u.y), hp: f64hex(u.hp), maxHp: f64hex(u.maxHp), hurt: u.hurt, chill: u.chill, dead: u.dead })), sc.units, `${sc.key} units 终态全列`);
  eq([...m.regrow.entries()], sc.regrow, `${sc.key} regrow 终态`);
  eq([...m.radSet.entries()], sc.radSet, `${sc.key} radSet 终态`);
  eq([...m.flood.entries()], sc.flood, `${sc.key} flood 终态`);
  eq(m.shake, sc.shake, `${sc.key} shake 终态`);
  eq(md5hex(m.radiate), sc.radiateMd5 || md5hex(ungz(sc.radiate)), `${sc.key} radiate 终态`);
  eq(m.worldEvents, sc.events, `${sc.key} events 全列`);
  eq(m.killCredit, sc.kc ?? null, `${sc.key} killCredit 终态`);
  eq(m.statNukes, sc.statN ?? 0, `${sc.key} statNukes 终态`);
  console.log(`${sc.key}: 逐位 PASS (steps=${sc.steps} draws=${sc.totalDraws} fx=${m.effects.length})`);
  pass++;
}
console.log(`power-transcript: ${pass}/${gold.scenarios.length} 场景 ALL PASS（零引擎导入镜像 · 掷值链闭合 · 八支+五支+命中族+war 面逐位）`);
