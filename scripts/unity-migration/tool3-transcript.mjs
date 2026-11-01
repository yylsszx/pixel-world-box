// ============================================================================
// tool3-transcript.mjs —— M-U16 切片四「神力生成器域」零引擎镜像
//   蓝本 engine.ts：acidRain L10737-10743 / volcano L10746-10777 / tsunami
//   L10780-10785 / blizzard L10788-10795 / meteorShower L10798-10813 / locust
//   L10815-10822 / drought L10823-10830 / rainCloud L10834-10843 / blessArea
//   L10845-10859 / curseArea L10861-10872 / loveArea L10874-10886 /
//   teleportArea L10908-10924（randomLandSpot L11033-11043 依赖）/
//   wrathStorm L10926-10934 / holyStorm L10936-10945 / plasmaCannon
//   L10947-10957 / annihilationLight L10959-10969 / sandstorm L10972-10979 /
//   typhoon L10980-10987 / sinkhole L10988-10996 / iceAge L10999-11008 /
//   famineCloud L11030-11036 / blackhole L11017-11023 / meteor L12277-12282 +
//   applyTool case L13342-13455（meteor 内联抖动循环 + 22 委派）+ effectsTick
//   消费端四支：volcano L9857-9882 / wrath L10029-10035 / holystorm
//   L10036-10075 / typhoon L10097-10125 + lightning L10507-10531（M-U15 译件
//   随件——wrath/typhoon 消费端复用）+ fx L13990（seed/dir 2 掷 + x0/y0 默认
//   + opts 覆写——返回 e 供 meteor/meteorShower 消费端 m.x0/y0/quiet 写面）+
//   addEvent L14032（unshift + cap 80 + colorHex 面）。
// M-U19 追加：mutateArea L10888-10906（特质域：civ 0.3 reroll / 0.25 jumpGene
//   0.12 + wild baseGene/jumpGene 0.2 + fx 每命中单位 2 掷）+ rollTrait
//   L1473-1476（TRAITS keys 插入序随机抽）+ rerollTrait L11037-11057（旧乘数
//   卸除/新乘数上装）+ baseGene L11059-11066（speciesBase 空表分支零掷）+
//   jumpGene L11085-11103（四维 0.6 门重铸 + RACES×TRAITS×JOBS 属性重算）+
//   TRAITS 表 types.ts L264-276 / JOBS 表 L296-305 / RACES HUMAN L157 /
//   WOLF L164 消费切片。
// M-U20 追加：applyTool case 'river' L13354-13356（this.carveRiver(wx, wy)）+
//   carveRiver L12312-12420（BFS dist 场零掷 + 加权随机选路 1 掷/步 + 刻河/
//   灌溉 setTerrain 全级联 L975-1013 + carveLake 湖支 L12341/L12367 + fx spawn/
//   toast/addEvent 尾面 L12384-12391）+ carveLake L12425-12441（零掷圆湖 + 湖畔
//   绿洲 + fx spawn）+ encodeRiverDir L63-71（RIVER_DIRS 八向）+ toast L14027-14029
//   （onToast 宿主回调——黄金 collector 面，toastSeq L181 初值 1）+ soilMulAt
//   worldsim.ts L168-170（0.6 + soilF/255*0.8——成林门乘子）。
// 纪律：零引擎 import（fixture 注入 + 镜像回放——typed 数组天然 OOB 语义：
//   terrain[i] 越界读 undefined、fire[i]=x 越界写静默丢弃、fireSet.add 负索引
//   容忍——S11 边缘钉面：volcano 引燃圈 (1,1) 负 x 混叠 j=511 与真负 j 双面）。
// 红证（纪律②）: TOOL3_RED=cap 禁云数上限早退（acidRain L10740 等 13 族）→
//   S8 caps-composite FAIL（fx 57≠45）；TOOL3_RED=lava 禁 volcano 消费端岩浆
//   外溢 setTerrain（L9875）→ S1 volcano-default terrain md5 FAIL；
//   TOOL3_RED=mutate 禁 jumpGene 属性重算写面（L11097-11100）→ S13/S14
//   mutate 双场景 units dump hp/maxHp/dmg/speed FAIL → 还原复绿 14/14。
// 运行：bun scripts/unity-migration/tool3-transcript.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const R = { HUMAN: 0, SHEEP: 6, WOLF: 7, DRAGON: 9, DEMON: 17 };   // M-U19：HUMAN/WOLF 入表（mutate 特质域消费面）
const W = 256, H = 160, N = W * H;
const isWater = (t) => t === T.DEEP || t === T.WATER;
const walkable = (t) => t !== T.DEEP && t !== T.WATER && t !== T.MOUNTAIN && t !== T.LAVA;   // constants.ts L73-75
const idx = (x, y) => y * W + x;
const FLAMMABLE = new Set([T.GRASS, T.FOREST]);          // constants.ts FLAMMABLE（ignite L1075 门）
const TOOL3_RED = process.env.TOOL3_RED ?? '';

// RACES 子集（types.ts L163/L174/L157/L164 逐值镜像——repro/undead/hostile/flying/lavaImmune/hp/dmg/speed/isCiv 消费面）
const RACES = {
  [R.SHEEP]: { repro: 0.004, undead: false, hostile: false, flying: false, lavaImmune: false, hp: 16, dmg: 1, speed: 0.038, isCiv: false },   // L163 SHEEP（M-U19：jumpGene 重算消费面）
  [R.DEMON]: { repro: 0, undead: false, hostile: true, flying: false, lavaImmune: true },          // L174 DEMON
  [R.HUMAN]: { repro: 0.006, undead: false, hostile: false, flying: false, lavaImmune: false, hp: 60, dmg: 8, speed: 0.09, isCiv: true },    // L157 HUMAN（M-U19：jumpGene 属性重算消费面）
  [R.WOLF]:  { repro: 0.004, undead: false, hostile: false, flying: false, lavaImmune: false, hp: 34, dmg: 10, speed: 0.093, isCiv: false }, // L164 WOLF（M-U19：wild 捕食者重算消费面）
};

// TRAITS 消费切片（types.ts L264-276 机械转写——rerollTrait/jumpGene hpMul/dmgMul/speedMul 消费面；
// regen/giant/tiny/immune/good 非本切片消费面字段省略——随相应切片译件补全）
const TRAITS = {
  strong: { dmgMul: 1.4 },                                                       // L265
  tough: { hpMul: 1.35 },                                                        // L266
  swift: { speedMul: 1.3 },                                                      // L267
  weak: { dmgMul: 0.8 },                                                         // L268
  sickly: { hpMul: 0.75 },                                                       // L269
  genius: {},                                                                    // L270
  berserk: { dmgMul: 1.7, hpMul: 0.85 },                                         // L271
  lucky: {},                                                                     // L272
  regeneration: {},                                                              // L273（regen 非本切片消费面）
  giant: { hpMul: 1.8, dmgMul: 1.5, speedMul: 0.75 },                            // L274
  tiny: { hpMul: 0.55, dmgMul: 0.8, speedMul: 1.25 },                            // L275
  immune: {},                                                                    // L276
};
const TRAITS_KEYS = Object.keys(TRAITS);                   // JS Object.keys 插入序 = 预设 12（rollTrait L1474 抽取序）

// JOBS 消费切片（types.ts L296-305 机械转写——jumpGene jd 乘数支）
const JOBS = [
  { hpMul: 1, dmgMul: 1, speedMul: 1 },                     // L297 peasant
  { hpMul: 0.95, dmgMul: 0.9, speedMul: 1 },                // L298 farmer
  { hpMul: 1.3, dmgMul: 1.35, speedMul: 1.05 },             // L299 warrior
  { hpMul: 1.05, dmgMul: 1.15, speedMul: 1 },               // L300 archer（ranged 5 非本切片消费面）
  { hpMul: 1.15, dmgMul: 0.95, speedMul: 1.05 },            // L301 builder
  { hpMul: 1, dmgMul: 0.9, speedMul: 1.2 },                 // L302 merchant
  { hpMul: 1.25, dmgMul: 1.1, speedMul: 1 },                // L303 noble
  { hpMul: 1.5, dmgMul: 1.5, speedMul: 1 },                 // L305 king（weight 0 非本切片消费面）
];

function mulberryStep(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
function hash2(x, y, seed) {               // noise.ts L14-19 机械重写（variant 确定域重建——M-U13 R3 清偿同款）
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64'));
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

// TOOL_BY_ID 键集子集（本切片 23 键——守卫全 210 键面 tool.json 链已覆盖，对黄金场景行为等价）
const TOOL_BY_ID_KEYS = new Set([
  'acidrain', 'volcano', 'tsunami', 'blizzard', 'meteorshower', 'locust', 'drought', 'rain',
  'bless', 'curse', 'love', 'mutate', 'teleport', 'wrath', 'holystorm', 'plasmacannon', 'annihilate',   // M-U19：mutate 键入集
  'sandstorm', 'typhoon', 'sinkhole', 'iceage', 'famine', 'blackhole', 'meteor',
  'river',                                             // M-U20：river 键入集（runtime 语义切片）
  'finger',                                            // M-U21：finger 键入集（抓取交互域切片）
]);
const parseCreationTool = (toolId) => (toolId.startsWith('cre:') ? toolId.slice(4) : null);   // creations.ts L243-245

// RIVER_DIRS 八向表 + encodeRiverDir（engine L63-71 机械转写——M-U20 水流方向场）
const RIVER_DIRS = [
  [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1],   // L64-65
];
function encodeRiverDir(dx, dy) {          // L66-71
  for (let k = 0; k < 8; k++) {
    if (RIVER_DIRS[k][0] === Math.sign(dx) && RIVER_DIRS[k][1] === Math.sign(dy)) return k + 1;   // L67-68
  }
  return 0;                                                 // L70
}

// ---- 镜像引擎（fixture 注入 + applyTool 直调 / effectsTick 步进——黄金回放载体） ----
class BREng {
  constructor(sc) {
    this.tickCount = sc.tickCount;
    this.shake = 0;
    this.rngA = 0;
    this.brush = sc.fixture.brush0;        // L688 类字段默认 3（gen spec.brush ?? 3）
    this.statNukes = 0;                    // engine L230-234 成就计数五联
    this.statMeteorShowers = 0;
    this.statPlasmas = 0;
    this.statAnnihilations = 0;
    this.statBlackholes = 0;
    this.terrain = new Uint8Array(gunzip(sc.fixture.terrain0));
    this.fire = new Uint8Array(gunzip(sc.fixture.fire0));
    this.fireSet = new Set(sc.fixture.fireSet0);
    this.owner = (() => { const b = gunzip(sc.fixture.owner0); return new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), 0, N); })();
    this.soilF = new Uint8Array(gunzip(sc.fixture.soil0));
    this.variant = new Uint8Array(N);      // 确定域重建（worldgen L65 hash2——fixture 无 variant0，R3 体积红线）
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.variant[y * W + x] = Math.floor(hash2(x, y, sc.baseSeed + 999) * 255);
    this.waterTier = new Uint8Array(N);
    this.frozen = new Set();
    this.flood = new Map(sc.fixture.flood0);
    this.wet = new Map();
    this.regrow = new Map(sc.fixture.regrow0);
    this.radiate = new Uint8Array(gunzip(sc.fixture.radiate0));
    this.radSet = new Map(sc.fixture.radSet0);
    this.riverDir = new Uint8Array(N);
    this.riverTiles = new Set();
    this.building = new Uint8Array(N);
    this.road = new Uint8Array(N);
    this.buildings = [];
    this.bIdx = new Map();
    this.dirty = new Set();
    this.effects = [];
    this.worldEvents = [];
    this.toasts = [];
    this.toastSeq = 1;                     // engine L181 初值 1（generate L927 重置同值）
    this.grabId = null;                    // engine grabId L5290（M-U21：null = 未抓取）
    this.fxPrefs = { dmgNumbers: true, battleFlash: true, riverFlow: true, ambience: true, fxDensity: 1, blood: true, corpses: true, hpBars: true, dayNight: true };   // engine L273 默认值镜像（M-U21：grabbedTick dmgNumbers 消费面——gen 无头引擎同默认）
    this.units = [];
    for (const uo of sc.fixture.units0) {
      this.units.push({
        id: uo.id, race: uo.race, civ: -1, x: uo.x, y: uo.y, tx: uo.x, ty: uo.y,
        hp: uo.hp ?? 10, maxHp: uo.maxHp ?? uo.hp ?? 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
        cd: 0, trait: uo.trait ?? 0, job: uo.job ?? 0, king: 0, infected: uo.infected ?? false, flip: 0,   // M-U19：job 直写面（jumpGene JOBS[job] 消费）
        name: `u${uo.id}`, hurt: uo.hurt ?? 0, breath: 0, parity: 0, dead: uo.dead ?? 0,
        ...(uo.grab !== undefined ? { grab: uo.grab } : {}),   // M-U21：grab 直写面（999 常驻冻结）
        fam: null, fgn: null, gene: uo.gene ? { s: uo.gene.s, d: uo.gene.d, h: uo.gene.h, r: uo.gene.r } : null, army: null,   // gene 深拷贝（gen mkUnit 同构）
      });
    }
    this.unitById = new Map(this.units.map((u) => [u.id, u]));
  }
  rng() {
    const r = mulberryStep(this.rngA);
    this.rngA = r.a;
    return r.v;
  }
  fx(kind, x, y, ttl, opts) {              // engine fx L13990 子集（seed/dir 2 掷 + x0/y0 默认 x/y + opts 覆写——返回 e）
    const seed = Math.floor(this.rng() * 65536);
    const dir = this.rng() * Math.PI * 2;
    const e = { kind, x, y, x0: x, y0: y, r: 1, age: 0, ttl, seed, dir };
    if (opts) for (const k of Object.keys(opts)) e[k] = opts[k];
    this.effects.push(e);
    return e;
  }
  addEvent(kind, text, opts) {             // engine addEvent L14032-14040 子集（unshift + cap 80 + colorHex 面）
    this.worldEvents.unshift({ kind, text, colorHex: opts && opts.colorHex, x: opts && opts.x, y: opts && opts.y });
    if (this.worldEvents.length > 80) this.worldEvents.length = 80;
  }
  markDirty(i) {                           // engine markDirty L959-967（五格面——dirty 簿记）
    this.dirty.add(i);
    const x = i % W, y = (i / W) | 0;
    if (x > 0) this.dirty.add(i - 1);
    if (x < W - 1) this.dirty.add(i + 1);
    if (y > 0) this.dirty.add(i - W);
    if (y < H - 1) this.dirty.add(i + W);
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
  setTerrain(i, t) {                       // engine setTerrain L975-1013 级联子集（volcano MOUNTAIN/LAVA 写面 + S12 复苏 GRASS）
    const prev = this.terrain[i];
    if (prev === t) return;
    this.terrain[i] = t;
    this.markDirty(i);                     // L983（本格五格面——ambTouch L980/onTerrainChanged L982 零 rng 簿记不进模拟面）
    this.regrow.delete(i);                 // L985
    if (prev === T.ICE) this.frozen.delete(i);
    if (t === T.ICE) this.frozen.add(i);
    if (t !== T.WATER) this.flood.delete(i);
    if (t !== T.SAND) this.wet.delete(i);
    if (!isWater(t) && this.riverDir[i] > 0) { this.riverDir[i] = 0; this.riverTiles.delete(i); }   // L992-995（流向场清 + 河录删）
    if (this.fire[i] > 0) { this.fire[i] = 0; this.fireSet.delete(i); }
    if ((isWater(t) || t === T.LAVA) && this.owner[i] >= 0) { this.owner[i] = -1; this.markDirty(i); }   // L1000-1003
    if ((isWater(t) || t === T.LAVA) && this.building[i] > 0) this.destroyBuilding(i);
    if ((isWater(t) || t === T.LAVA) && this.road[i] > 0) this.road[i] = 0;
    this.refreshWaterTierAround(i);        // L1012
  }
  ignite(i) {                              // engine ignite L1078-1085 机械（typed 数组天然 OOB 容忍——S11/S5 钉面）
    const t = this.terrain[i];
    if (this.fire[i] > 0) return;
    if (!FLAMMABLE.has(t) && this.building[i] === 0) return;
    this.fire[i] = 150 + Math.floor(this.rng() * 90);
    this.fireSet.add(i);
  }
  // ---- M-U15 lightning 译件随件（wrath/typhoon 消费端复用——L10507-10531） ----
  lightning(x, y, count = 1, power = 1) {  // engine L10507-10531
    const n = Math.max(1, Math.min(12, Math.floor(count)));   // L10509
    const pw = Math.max(0.5, Math.min(3, power));             // L10510
    for (let k = 0; k < n; k++) {                             // L10511
      const lx = n > 1 ? x + (this.rng() - 0.5) * Math.max(2, n) : x;   // L10513（首击 n>1 亦散布）
      const ly = n > 1 ? y + (this.rng() - 0.5) * Math.max(2, n) : y;   // L10514
      this.fx('bolt', lx, ly, 10);                            // L10515（2 掷）
      for (const u of this.units) {                           // L10516（无 dead 过滤——机械保持）
        const d = Math.hypot(u.x - lx, u.y - ly);             // L10517（fdlibm）
        if (d < 1.9) { u.hp -= 95 * pw; u.hurt = 30; if (u.hp <= 0) u.dead = true; }   // L10518
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
  // ---- M-U16 神力生成器域机械翻译（L10737-11043 / L12277-12282） ----
  acidRain(x, y, r, ttl = 150) {             // L10737-10743
    const rr = Math.max(4, Math.min(16, r));                  // L10738
    let count = 0;                                            // L10739（filter 快照——一次遍历计数）
    for (const e of this.effects) if (e.kind === 'acid') count++;
    if (count >= 6 && TOOL3_RED !== 'cap') return;            // L10740（云数上限防刷屏；红证旋钮：TOOL3_RED=cap 禁）
    this.fx('acid', x, y, ttl, { r: rr });                    // L10741
    this.addEvent('acidrain', '一片酸雨云在天空凝聚，腐蚀着大地与生灵', { x, y });   // L10742
  }
  volcano(x, y, power = 1) {                 // L10746-10777
    const pw = Math.max(1, Math.min(3, power));               // L10747
    const cx = Math.max(2, Math.min(W - 3, Math.floor(x)));   // L10748
    const cy = Math.max(2, Math.min(H - 3, Math.floor(y)));   // L10749
    for (let dy = -2; dy <= 2; dy++) {                        // L10751（隆起火山锥——水面上喷发也先成陆基）
      for (let dx = -2; dx <= 2; dx++) {                      // L10752
        const xx = cx + dx, yy = cy + dy;                     // L10753
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; // L10754
        if (Math.hypot(dx, dy) <= 2.3) this.setTerrain(idx(xx, yy), T.MOUNTAIN);   // L10755（整数极距 fdlibm）
      }
    }
    this.setTerrain(idx(cx, cy), T.LAVA);                     // L10759（山口岩浆湖）
    if (pw >= 2) {                                            // L10760（烈度 2 → 十字熔岩）
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) this.setTerrain(idx(cx + dx, cy + dy), T.LAVA);
    }
    if (pw >= 3) {                                            // L10766（烈度 3 → 3x3 熔岩湖）
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.setTerrain(idx(cx + dx, cy + dy), T.LAVA);
    }
    const ring = 3.5 * pw;                                    // L10771（山脚引燃圈——半径随烈度扩张）
    for (let k = 0; k < 8; k++) {                             // L10772
      const ang = (k / 8) * Math.PI * 2;                      // L10773（确定性角度零掷）
      const j = idx(Math.floor(cx + Math.cos(ang) * ring), Math.floor(cy + Math.sin(ang) * ring));   // L10774（idx 无钳——负 x 混叠/真负 j 双面 S11 钉）
      if (j >= 0 && j < W * H) this.ignite(j);                // L10775（显式卫门——负索引不入 fireSet）
    }
    this.fx('volcano', cx + 0.5, cy + 0.5, 110);              // L10777（fx 2 掷——消费端锥心 e.x/e.y）
    this.shake = Math.max(this.shake, 6 + pw * 2);            // L10778
    this.addEvent('volcano', pw > 1 ? `大地震颤，一座火山拔地而起，熔岩以烈度 ${pw} 喷薄而出` : '大地震颤，一座火山拔地而起，岩浆喷薄而出', { x: cx, y: cy });   // L10780
  }
  tsunami(x, y, r) {                         // L10780-10785
    const rr = Math.max(6, Math.min(30, r * 2.5));            // L10781（笔刷即浪级）
    this.fx('tsunami', x, y, 42, { r: rr });                  // L10782
    this.addEvent('tsunami', '滔天巨浪涌来，漫过了低地与海岸线', { x, y });   // L10784
  }
  blizzard(x, y, r, ttl = 190) {             // L10788-10795
    const rr = Math.max(5, Math.min(15, r));                  // L10789
    let count = 0;                                            // L10790
    for (const e of this.effects) if (e.kind === 'blizzard') count++;
    if (count >= 4 && TOOL3_RED !== 'cap') return;            // L10791（红证旋钮同门）
    this.fx('blizzard', x, y, ttl, { r: rr });                // L10792
    this.addEvent('blizzard', '极寒的暴风雪降临，大地在冰霜下沉睡', { x, y });   // L10794
  }
  meteorShower(x, y, r, count) {             // L10798-10813
    const rr = Math.max(4, Math.min(18, r));                  // L10799
    const n = count ? Math.max(1, Math.min(24, Math.floor(count))) : 5 + Math.floor(this.rng() * 4);   // L10800（count 直取面 + 缺省 1 掷）
    for (let k = 0; k < n; k++) {                             // L10801
      const ang = this.rng() * Math.PI * 2;                   // L10802（2 掷/颗）
      const dist = this.rng() * rr;                           // L10803
      const tx = Math.max(1, Math.min(W - 2, x + Math.cos(ang) * dist));   // L10804（双钳）
      const ty = Math.max(1, Math.min(H - 2, y + Math.sin(ang) * dist));   // L10805
      const m = this.fx('meteor', tx, ty, 20 + k * 10);       // L10806（fx 2 掷 + ttl 步进 20/30/40...）
      if (m) { m.x0 = tx + 18; m.y0 = ty - 30; m.quiet = true; }   // L10807-10808（x0/y0 天顶偏移 + 衍生弹抑纪事）
    }
    this.addEvent('meteorshower', `一场陨石雨呼啸而降（${n} 颗）`, { x, y });   // L10810
    this.statMeteorShowers++;                                 // L10811（成就计数：流星如愿）
  }
  locust(x, y, r = 5, ttl = 240) {           // L10815-10822
    let count = 0;                                            // L10816
    for (const e of this.effects) if (e.kind === 'locust') count++;
    if (count >= 3 && TOOL3_RED !== 'cap') return;            // L10817
    this.fx('locust', x, y, ttl, { r: Math.max(3, Math.min(10, r)) });   // L10818
    this.addEvent('locust', '黑压压的蝗群遮天蔽日，吞噬着沿途的植被', { x, y });   // L10820
  }
  drought(x, y, r, ttl = 200) {              // L10823-10830
    const rr = Math.max(5, Math.min(16, r));                  // L10824
    let count = 0;                                            // L10825
    for (const e of this.effects) if (e.kind === 'drought') count++;
    if (count >= 4 && TOOL3_RED !== 'cap') return;            // L10826
    this.fx('drought', x, y, ttl, { r: rr });                 // L10827
    this.addEvent('drought', '灼热的旱魃笼罩大地，河流枯竭、草木焦黄', { x, y });   // L10829
  }
  rainCloud(x, y, r, ttl = 200) {            // L10834-10843
    /* WBB.touchMeta() —— Stage 3 UI 收口宿主挂点（不进模拟面） */
    const rr = Math.max(4, Math.min(14, r));                  // L10836
    let count = 0;                                            // L10837
    for (const e of this.effects) if (e.kind === 'rainstorm') count++;
    if (count >= 6 && TOOL3_RED !== 'cap') return;            // L10838（上限防刷屏）
    this.fx('rainstorm', x, y, ttl, { r: rr });               // L10840
    this.addEvent('rain', '造物主唤来了甘霖，焦土将在雨水中重生', { x, y });   // L10841
  }
  blessArea(x, y, r) {                       // L10845-10859
    let n = 0;                                                // L10846
    for (const u of this.units) {                             // L10847
      if (u.dead) continue;                                   // L10848
      if (Math.hypot(u.x - x, u.y - y) > r) continue;         // L10849（fdlibm 单位环）
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.5);         // L10850（治疗 +50%max）
      u.bless = 600;                                          // L10851（增益 600 tick）
      u.infected = false;                                     // L10852（净化疫病）
      n++;
      if (this.rng() < 0.4) this.fx('bless', u.x, u.y - 0.4, 24);   // L10854（0.4 门 1 掷 + fx 2 掷）
    }
    return n;
  }
  curseArea(x, y, r) {                       // L10861-10872
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      u.curse = 500;                                          // L10867（诅咒 500 tick）
      n++;
      if (this.rng() < 0.4) this.fx('curse', u.x, u.y - 0.4, 24);   // L10869
    }
    return n;
  }
  loveArea(x, y, r) {                        // L10874-10886
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (RACES[u.race].repro <= 0) continue;                 // L10880（繁衍门——绵羊 0.004 过 / 恶魔 0 拒）
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      u.fert = 500;                                           // L10882（繁衍增益 500 tick）
      n++;
      if (this.rng() < 0.5) this.fx('heart', u.x, u.y - 1, 36);   // L10884（0.5 门 1 掷）
    }
    return n;
  }
  mutateArea(x, y, r) {                      // L10888-10906（M-U19）
    let n = 0;                                                // L10889
    for (const u of this.units) {                             // L10890
      if (u.dead) continue;                                   // L10891
      if (Math.hypot(u.x - x, u.y - y) > r) continue;         // L10892（fdlibm 单位环）
      if (RACES[u.race].isCiv) {                              // L10893
        if (this.rng() < 0.3) { this.rerollTrait(u); n++; }   // L10894（0.3 门 1 掷 + rerollTrait rollTrait 1 掷）
        if (this.rng() < 0.25) { this.jumpGene(u, 0.12); n++; }   // L10896（0.25 门 1 掷——基因化选育·温和幅度）
      } else {                                                // L10897
        if (!u.gene) u.gene = this.baseGene(u.race);          // L10898（空表分支零掷恒 {1,1,1,1}）
        this.jumpGene(u, 0.2);                                // L10899（野生动物全幅）
        n++;                                                  // L10900
      }
      this.fx('mutate', u.x, u.y, 30);                        // L10901（fx 在 if/else 外——门双 miss 亦掷 2 掷）
    }
    return n;                                                 // L10905
  }
  teleportArea(x, y, r) {                    // L10908-10924
    let n = 0;
    for (const u of this.units) {
      if (u.dead) continue;
      if (Math.hypot(u.x - x, u.y - y) > r) continue;
      const spot = this.randomLandSpot();                     // L10915（40 试 2 掷/尝试）
      if (!spot) continue;
      this.fx('spark', u.x, u.y, 18);                         // L10917（端点双色火花一）
      u.x = spot.x; u.y = spot.y;
      u.tx = spot.x; u.ty = spot.y;
      u.lx = spot.x; u.ly = spot.y;                           // L10920（lx/ly 漫游锚——dump 不含，机械保持）
      this.fx('spark', u.x, u.y, 22);                         // L10922（端点双色火花二）
      n++;
    }
    return n;
  }
  wrathStorm(x, y, r, ttl = 180) {           // L10926-10934
    const rr = Math.max(4, Math.min(14, r));                  // L10927
    let count = 0;                                            // L10928
    for (const e of this.effects) if (e.kind === 'wrath') count++;
    if (count >= 3 && TOOL3_RED !== 'cap') return;            // L10929
    this.fx('wrath', x, y, ttl, { r: rr });                   // L10930
    this.addEvent('wrath', '神怒之云聚拢，雷霆将轮番轰击大地', { x, y });   // L10931
  }
  holyStorm(x, y, r, ttl = 200) {            // L10936-10945
    const rr = Math.max(4, Math.min(14, r));                  // L10937
    let count = 0;                                            // L10938
    for (const e of this.effects) if (e.kind === 'holystorm') count++;
    if (count >= 3 && TOOL3_RED !== 'cap') return;            // L10939（上限防刷屏——与天罚同策）
    this.fx('holystorm', x, y, ttl, { r: rr });               // L10940
    this.addEvent('holystorm', '金色的圣云自天际涌来，圣光将审判黑暗、治愈无辜', { x, y });   // L10941
  }
  plasmaCannon(x, y, dmg = 90) {             // L10947-10957
    const x0 = Math.max(2, Math.min(W - 3, x - 7));           // L10948（弹道起点双钳）
    const y0 = Math.max(2, Math.min(H - 3, y - 9));           // L10949
    const dist = Math.hypot(x - x0, y - y0);                  // L10950（fdlibm——(7,9) 定值域）
    const ttl = Math.max(45, Math.min(110, Math.round(dist * 1.5)));   // L10951（JS round .5 上取整）
    this.fx('plasma', x, y, ttl, { x0, y0, r: 3.2, dmg });    // L10952（opts 五面）
    this.statPlasmas++;                                       // L10953（成就计数：电浆洗礼）
    this.addEvent('superweapon', '苍穹被一道电光撕开——等离子光球正携 EMP 之威坠向大地', { x, y });   // L10954
  }
  annihilationLight(x, y) {                  // L10959-10969
    const x0 = Math.max(2, Math.min(W - 3, x - 8));           // L10960
    const y0 = Math.max(2, Math.min(H - 3, y - 11));          // L10961
    const dist = Math.hypot(x - x0, y - y0);                  // L10962（(8,11) 定值域）
    const ttl = Math.max(50, Math.min(130, Math.round(dist * 1.4)));   // L10963
    this.fx('antimatter', x, y, ttl, { x0, y0 });             // L10964
    this.statAnnihilations++;                                 // L10965（成就计数：湮灭纪元）
    this.addEvent('superweapon', '造物主掌心凝起一粒反物质——湮灭之光即将吞没大地，物质归零', { x, y, colorHex: '#ff4d4d' });   // L10966（colorHex 面独此一支）
  }
  sandstorm(x, y, r = 5.5, ttl = 280) {      // L10972-10979
    let count = 0;                                            // L10973
    for (const e of this.effects) if (e.kind === 'sandstorm') count++;
    if (count >= 3 && TOOL3_RED !== 'cap') return;            // L10974
    this.fx('sandstorm', x, y, ttl, { r: Math.max(3, Math.min(12, r)) });   // L10975
    this.addEvent('sandstorm', '遮天蔽日的沙暴席卷而来，绿意将被黄沙掩埋', { x, y });   // L10976
  }
  typhoon(x, y, r = 6, ttl = 240) {          // L10980-10987
    let count = 0;                                            // L10981
    for (const e of this.effects) if (e.kind === 'typhoon') count++;
    if (count >= 3 && TOOL3_RED !== 'cap') return;            // L10982
    this.fx('typhoon', x, y, ttl, { r: Math.max(4, Math.min(14, r)) });   // L10983
    this.addEvent('typhoon', '海上升起了狂暴的台风气旋，狂风暴雨将至', { x, y });   // L10984
  }
  sinkhole(x, y, r) {                        // L10988-10996
    const rr = Math.max(3, Math.min(12, r));                  // L10989
    let count = 0;                                            // L10990
    for (const e of this.effects) if (e.kind === 'sinkhole') count++;
    if (count >= 3 && TOOL3_RED !== 'cap') return;            // L10991
    this.fx('sinkhole', x, y, 80, { r: rr });                 // L10992
    this.addEvent('sinkhole', '大地震颤着塌陷下去，深渊的黑暗吞噬了一切', { x, y });   // L10993
    this.shake = Math.max(this.shake, 7);                     // L10994
  }
  iceAge(x, y, r, ttl = 420) {               // L10999-11008
    const rr = Math.max(6, Math.min(22, r));                  // L11000
    let count = 0;                                            // L11001
    for (const e of this.effects) if (e.kind === 'iceage') count++;
    if (count >= 2 && TOOL3_RED !== 'cap') return;            // L11002
    this.fx('iceage', x, y, ttl, { r: rr });                  // L11003
    this.addEvent('iceage', '极寒的冰河寒潮降临，冻上的一切将沉眠于冰封之下', { x, y });   // L11004
    this.shake = Math.max(this.shake, 4);                     // L11005
  }
  famineCloud(x, y, r = 6, ttl = 260) {      // L11030-11036
    let count = 0;                                            // L11031
    for (const e of this.effects) if (e.kind === 'famine') count++;
    if (count >= 3 && TOOL3_RED !== 'cap') return;            // L11032
    this.fx('famine', x, y, ttl, { r: Math.max(3, Math.min(12, r)) });   // L11033
    this.addEvent('famine', '灰色的饥荒之云漂来，饿殍遍野的时世开始了', { x, y });   // L11034
  }
  blackhole(x, y, r = 8, ttl = 130) {        // L11017-11023
    this.statBlackholes++;                                    // L11018（成就计数先于 cap 门——拒面亦计数 S8 钉）
    let count = 0;                                            // L11019
    for (const e of this.effects) if (e.kind === 'blackhole') count++;
    if (count >= 2 && TOOL3_RED !== 'cap') return;            // L11020
    this.fx('blackhole', x, y, ttl, { r: Math.max(4, Math.min(16, r)) });   // L11021
    this.addEvent('blackhole', '时空被撕开了一个黑洞，万物正被拉向湮灭', { x, y });   // L11022
  }
  randomLandSpot() {                         // L11033-11043
    for (let k = 0; k < 40; k++) {                            // L11034（40 次尝试）
      const x = Math.floor(this.rng() * W);                   // L11035（2 掷/尝试）
      const y = Math.floor(this.rng() * H);                   // L11036
      const t = this.terrain[idx(x, y)];
      if (t === T.GRASS || t === T.SAND || t === T.SNOW || t === T.BURNT || t === T.FOREST || t === T.HILL) return { x: x + 0.5, y: y + 0.5 };   // L11038（六地形门）
    }
    return null;
  }
  rollTrait() {                              // L1473-1476（TRAITS keys 插入序随机抽）
    const keys = TRAITS_KEYS;                                 // L1474（JS Object.keys 插入序 = 预设 12）
    return keys[Math.floor(this.rng() * keys.length)];        // L1475（1 掷）
  }
  rerollTrait(u) {                           // L11037-11057（M-U19）
    const old = u.trait ? TRAITS[u.trait] : null;             // L11038
    const key = this.rollTrait();                             // L11039（1 掷）
    const nw = key ? TRAITS[key] : null;                      // L11040
    if (old) {                                                // L11041（旧乘数卸除）
      u.maxHp = Math.max(1, Math.round(u.maxHp / (old.hpMul ?? 1)));   // L11042
      u.hp = Math.min(u.maxHp, Math.max(1, Math.round(u.hp / (old.hpMul ?? 1))));   // L11043（双钳不对称——old 支 max(1,·)）
      u.dmg /= old.dmgMul ?? 1;                               // L11044
      u.speed /= old.speedMul ?? 1;                           // L11045
    }
    if (nw) {                                                 // L11046（新乘数上装）
      u.maxHp = Math.max(1, Math.round(u.maxHp * (nw.hpMul ?? 1)));   // L11047
      u.hp = Math.min(u.maxHp, Math.round(u.hp * (nw.hpMul ?? 1)));   // L11048（nw 支无 max(1,·)——不对称面）
      u.dmg *= nw.dmgMul ?? 1;                                // L11049
      u.speed *= nw.speedMul ?? 1;                            // L11050
    }
    u.trait = key ?? null;                                    // L11053
  }
  baseGene(race) {                           // L11059-11066（speciesBase 空表分支——gen 协议恒空表零掷；演化域 L11213+ 未译）
    return { s: 1, d: 1, h: 1, r: 1 };                        // L11061（空表分支）
  }
  jumpGene(u, amount) {                      // L11085-11103（M-U19）
    const g = u.gene ?? (u.gene = { s: 1, d: 1, h: 1, r: 1 });   // L11086
    const dims = ['s', 'd', 'h', 'r'];                        // L11087（四维固定序）
    for (const dim of dims) {                                 // L11088
      if (this.rng() < 0.6) {                                 // L11089（门 1 掷/维）
        g[dim] = Math.max(0.5, Math.min(2, g[dim] * (1 + (this.rng() - 0.42) * 2 * amount)));   // L11090（命中维值 1 掷 + 0.5/2 钳位）
      }
    }
    if (TOOL3_RED === 'mutate') return;                       // 红证旋钮：禁属性重算写面（L11097-11100）
    const def = RACES[u.race];                                // L11095
    const td = u.trait ? TRAITS[u.trait] : null;              // L11096
    const jd = def.isCiv ? JOBS[u.job ?? 0] : null;           // L11097
    u.maxHp = Math.max(1, Math.round(def.hp * (td?.hpMul ?? 1) * (jd?.hpMul ?? 1) * g.h));   // L11098
    u.hp = Math.min(u.maxHp, u.hp);                           // L11099
    u.dmg = def.dmg * (td?.dmgMul ?? 1) * (jd?.dmgMul ?? 1) * g.d;   // L11100
    u.speed = def.speed * (td?.speedMul ?? 1) * (jd?.speedMul ?? 1) * g.s;   // L11101
  }
  meteor(x, y) {                             // L12277-12282
    const e = this.fx('meteor', x, y, 34);                    // L12278（fx 2 掷）
    if (e) {
      e.x0 = x + 20;                                          // L12280（天顶偏移面）
      e.y0 = y - 34;                                          // L12281（无 quiet——与陨石雨衍生弹语义分离）
    }
  }
  toast(text, tone, op) {                    // L14027-14029（M-U20：onToast 宿主回调面——黄金 collector 同构）
    this.toasts.push({ id: this.toastSeq++, text, tone, op: op ?? null });
  }
  soilMulAt(i) {                             // worldsim.ts L168-170（M-U20：土壤肥力除子——成林门乘子）
    return 0.6 + (this.soilF[i] / 255) * 0.8;                 // L169
  }
  carveRiver(wx, wy, widthOverride) {        // L12312-12420（M-U20）
    const sx = Math.max(0, Math.min(W - 1, Math.floor(wx)));   // L12313
    const sy = Math.max(0, Math.min(H - 1, Math.floor(wy)));   // L12314
    const start = idx(sx, sy);                                // L12315
    if (isWater(this.terrain[start])) return false;           // L12316（零掷）
    const N2 = W * H;                                         // L12319
    const dist = new Int32Array(N2).fill(-1);                 // L12320
    const queue = new Int32Array(N2);                         // L12321
    let qh = 0, qt = 0;                                       // L12322
    for (let i = 0; i < N2; i++) {                            // L12323
      if (isWater(this.terrain[i])) { dist[i] = 0; queue[qt++] = i; }   // L12324
    }
    while (qh < qt) {                                         // L12326（BFS 绕山——零掷）
      const i = queue[qh++];
      const x = i % W;
      const y = (i / W) | 0;
      const d = dist[i];
      if (x > 0 && dist[i - 1] === -1 && this.terrain[i - 1] !== T.MOUNTAIN) { dist[i - 1] = d + 1; queue[qt++] = i - 1; }
      if (x < W - 1 && dist[i + 1] === -1 && this.terrain[i + 1] !== T.MOUNTAIN) { dist[i + 1] = d + 1; queue[qt++] = i + 1; }
      if (y > 0 && dist[i - W] === -1 && this.terrain[i - W] !== T.MOUNTAIN) { dist[i - W] = d + 1; queue[qt++] = i - W; }
      if (y < H - 1 && dist[i + W] === -1 && this.terrain[i + W] !== T.MOUNTAIN) { dist[i + W] = d + 1; queue[qt++] = i + W; }
    }
    if (dist[start] === -1) {                                 // L12340（山脉环抱洼地 → 内流湖）
      this.carveLake(sx, sy, Math.max(2, this.brush));        // L12341
      this.toast('群山环抱的洼地积水成湖', 'info');           // L12342
      this.addEvent('river', '群山之间诞生了一泓内流湖', { x: sx + 0.5, y: sy + 0.5 });   // L12343
      return true;                                            // L12345（onSound 宿主 no-op）
    }
    const width = widthOverride != null ? widthOverride : Math.max(0, Math.floor((this.brush - 1) / 2));   // L12349（笔刷 1-2→1 宽；3-4→2 宽；5+→3 宽）
    const visited = new Uint8Array(N2);                       // L12350
    let cx = sx, cy = sy;                                     // L12351
    let carved = 0;                                           // L12352
    let reached = false;                                      // L12353
    for (let steps = 0; steps < 400; steps++) {               // L12354
      const i = idx(cx, cy);
      if (visited[i]) break;                                  // L12356（防绕圈）
      visited[i] = 1;
      if (dist[i] === 0) { reached = true; break; }           // L12358（已抵达大海）
      const curD = dist[i];                                   // L12363
      const cands = [];                                       // L12364
      const wts = [];                                         // L12365
      for (let dy = -1; dy <= 1; dy++) {                      // L12366
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (dist[j] < 0 || dist[j] >= curD) continue;
          cands.push(j);
          wts.push(1 / (1 + (curD - dist[j]) * 0.5));         // L12372（快速下降权重高）
        }
      }
      if (cands.length === 0) {                               // L12375（无下降方向洼地 → 成湖）
        this.carveLake(cx, cy, Math.max(2, width + 1));       // L12376
        break;
      }
      let total = 0;                                          // L12380
      for (const w of wts) total += w;
      let r = this.rng() * total;                             // L12382（1 掷/步——加权随机选路）
      let pick = cands[0];
      for (let k = 0; k < cands.length; k++) { r -= wts[k]; if (r <= 0) { pick = cands[k]; break; } }   // L12384
      const nx = pick % W;                                    // L12385
      const ny = (pick / W) | 0;
      const dirCode = encodeRiverDir(nx - cx, ny - cy);       // L12387（水流方向 = 行进方向）
      for (let dy = -width; dy <= width; dy++) {              // L12389（刻河道圆形绕山）
        for (let dx = -width; dx <= width; dx++) {
          if (dx * dx + dy * dy > width * width + 0.5) continue;
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          if (this.terrain[j] === T.MOUNTAIN) continue;       // L12394（河绕山不穿山）
          if (this.terrain[j] !== T.WATER) {
            if (TOOL3_RED === 'river') this.terrain[j] = T.WATER;   // 红证旋钮：禁 setTerrain 级联（世界生成直写语义）
            else this.setTerrain(j, T.WATER);                 // L12397（运行时 setTerrain 全级联）
            carved++;
          }
          if (dirCode > 0) {
            this.riverDir[j] = dirCode;                       // L12401
            this.riverTiles.add(j);                           // L12402
          }
        }
      }
      const ir = width + 1;                                   // L12406（沿岸灌溉）
      for (let dy = -ir; dy <= ir; dy++) {
        for (let dx = -ir; dx <= ir; dx++) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = idx(xx, yy);
          const t = this.terrain[j];
          if (t === T.SAND || t === T.BURNT) {                // L12411
            if (TOOL3_RED === 'river') this.terrain[j] = T.GRASS;
            else this.setTerrain(j, T.GRASS);                 // L12412（绿洲）
          } else if (t === T.GRASS && this.rng() < 0.05 * this.soilMulAt(j)) {   // L12413（&& 短路 1 掷/GRASS 格）
            if (TOOL3_RED === 'river') this.terrain[j] = T.FOREST;
            else this.setTerrain(j, T.FOREST);                // L12414（成林）
          }
        }
      }
      cx = nx; cy = ny;                                       // L12418
    }
    if (carved > 0) {                                         // L12421
      this.fx('spawn', wx, wy, 30);                           // L12422（2 掷）
      this.toast(reached ? '一条大河蜿蜒入海' : '河流在洼地尽头积成了湖', 'info');   // L12423（toast 宿主回调）
      this.addEvent('river', reached ? '一条大河诞生了，蜿蜒流向大海' : '一条河在洼地尽头汇成了湖', { x: sx + 0.5, y: sy + 0.5 });   // L12424（坐标 sx+0.5）
      return true;                                            // L12426（onSound 宿主 no-op）
    }
    return false;                                             // L12428
  }
  carveLake(cx, cy, r) {                     // L12425-12441（M-U20）
    for (let dy = -r - 1; dy <= r + 1; dy++) {                // L12426
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const d = Math.hypot(dx, dy);                         // L12430（fdlibm 整数极距）
        if (d <= r) {
          this.setTerrain(idx(xx, yy), T.WATER);              // L12432（山区点选 → 允许淹没山体）
        } else if (d <= r + 1) {
          const j = idx(xx, yy);
          if (this.terrain[j] === T.SAND || this.terrain[j] === T.BURNT) this.setTerrain(j, T.GRASS);   // L12435（湖畔绿洲）
        }
      }
    }
    this.fx('spawn', cx + 0.5, cy + 0.5, 30);                 // L12440（2 掷）
  }
  // ---- effectsTick 消费端四支（骨架 L9807-9809 倒序 + e.age++ 头 + 到期 splice L10444-10446） ----
  effectsTick() {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age++;
      if (e.kind === 'volcano') {                              // L9857-9882（熔岩弹 age%14 双掷 + 岩浆外溢 age%6 双掷 + 山脚灼烧环 0.8/tick）
        this.shake = Math.max(this.shake, 2);                  // L9859
        if (e.age % 14 === 0 && e.age < e.ttl - 20) {          // L9860（周期熔岩弹——临近熄火停喷）
          const ang = this.rng() * Math.PI * 2;                // L9861
          const rr = 2 + this.rng() * 6;                       // L9862（2 掷）
          const tx = e.x + Math.cos(ang) * rr;                 // L9863
          const ty = e.y + Math.sin(ang) * rr;                 // L9864
          if (tx > 1 && ty > 1 && tx < W - 2 && ty < H - 2) {  // L9865
            const m = this.fx('meteor', tx, ty, 24);           // L9866（fx 2 掷）
            if (m) { m.x0 = e.x + 8; m.y0 = e.y - 20; m.quiet = true; }   // L9867（锥心偏移 + 衍生弹抑纪事）
          }
        }
        if (e.age % 6 === 0) {                                 // L9870（岩浆外溢）
          const ang = this.rng() * Math.PI * 2;                // L9871
          const rr = this.rng() * 2.5;                         // L9872（2 掷）
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));   // L9873（idx 列主序——采样点恒在锥体内侵蚀成熔岩流坡面）
          if (j >= 0 && j < W * H && this.terrain[j] !== T.LAVA && !isWater(this.terrain[j]) && TOOL3_RED !== 'lava') this.setTerrain(j, T.LAVA);   // L9875（红证旋钮：TOOL3_RED=lava 禁外溢）
        }
        for (const u of this.units) {                          // L9877
          if (u.dead) continue;                                // L9878
          const vdx = u.x - e.x;                               // L9879
          const vdy = u.y - e.y;                               // L9880
          if (vdx * vdx + vdy * vdy < 6.25 && !RACES[u.race].lavaImmune) { u.hp -= 0.8; u.hurt = 12; if (u.hp <= 0) u.dead = true; }   // L9881（2.5² 平方距离；恶魔 lavaImmune 豁免）
        }
      } else if (e.kind === 'wrath') {                         // L10029-10035（age%10 雷击——lightning 译件复用）
        if (e.age % 10 === 0 && e.age < e.ttl - 12) {          // L10031
          const ang = this.rng() * Math.PI * 2;                // L10032（2 掷选点）
          const rr = this.rng() * e.r;                         // L10033
          this.lightning(e.x + Math.cos(ang) * rr, e.y + Math.sin(ang) * rr);   // L10034（count/power undefined → JS 默认参 1/1）
        }
      } else if (e.kind === 'holystorm') {                     // L10036-10075（圣光审判黑暗 + 治愈无辜 + 浇火/净辐/复苏）
        e.dir += (this.rng() - 0.5) * 0.2;                     // L10039（游荡 dir 1 掷）
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.1));   // L10040
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.1));   // L10041
        if (this.rng() < 1.2) {                                // L10042（恒真门——1.2 掷位保持）
          const ang = this.rng() * Math.PI * 2;                // L10043
          const rr = this.rng() * e.r;                         // L10044（采样双掷）
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));   // L10045（idx 列主序）
          if (j >= 0 && j < W * H) {                           // L10046
            if (this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); this.fx('water', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14); }   // L10047（浇火——fx 2 掷）
            else if (this.radiate[j] > 0) { this.radiate[j] = 0; this.radSet.delete(j); this.markDirty(j); }   // L10048（洗净辐射）
            else if (this.terrain[j] === T.BURNT && this.rng() < 0.3) { this.setTerrain(j, T.GRASS); this.fx('spark', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14); }   // L10049（复苏焦土——0.3 门 1 掷 + setTerrain 级联）
          }
        }
        const hr2 = e.r * e.r;                                 // L10052
        for (const u of this.units) {                          // L10053
          if (u.dead) continue;                                // L10054
          const hdx = u.x - e.x;                               // L10055
          const hdy = u.y - e.y;                               // L10056
          if (hdx * hdx + hdy * hdy >= hr2) continue;         // L10057
          const ud = RACES[u.race];                            // L10058
          const dark = ud.undead || u.race === R.DEMON || u.race === R.DRAGON;   // L10059（圣光审判名单：与天使圣剑同构）
          if (dark) {                                          // L10060
            u.hp -= 0.4;                                       // L10061（圣炎灼烧）
            u.hurt = 10;                                       // L10062
            if (u.hp <= 0) u.dead = true;                      // L10063
            if (this.rng() < 0.2) this.fx('spark', u.x, u.y - 0.4, 16);   // L10064（审判火花 0.2 门 1 掷）
          } else if (!ud.hostile) {                            // L10065（敌对自然巨兽既不审判也不治愈）
            if (u.hp < u.maxHp) {                              // L10066
              u.hp = Math.min(u.maxHp, u.hp + 0.15);           // L10067（微光甘霖）
              if (this.rng() < 0.08) this.fx('bless', u.x, u.y - 0.4, 18);   // L10068（缓愈浮标 0.08 门 1 掷）
            }
            if (u.infected) { u.infected = false; this.fx('bless', u.x, u.y - 0.4, 22); }   // L10070（圣光驱瘟——fx 2 掷）
          }
        }
      } else if (e.kind === 'typhoon') {                       // L10097-10125（游荡 + 狂风推拽 + 环伤 + age%36 间歇雷电 + 暴雨灭火 0.4）
        e.dir += (this.rng() - 0.5) * 0.3;                     // L10099（游荡 dir 1 掷）
        e.x = Math.max(2, Math.min(W - 3, e.x + Math.cos(e.dir) * 0.22));   // L10100
        e.y = Math.max(2, Math.min(H - 3, e.y + Math.sin(e.dir) * 0.22));   // L10101
        for (const u of this.units) {                          // L10102
          if (u.dead) continue;                                // L10103
          const d = Math.hypot(u.x - e.x, u.y - e.y);          // L10104（fdlibm）
          if (d < e.r + 1.5) {                                 // L10105
            const nx = u.x + ((u.x - e.x) / (d + 0.01)) * 0.5; // L10106（离心推拽 0.5）
            const ny = u.y + ((u.y - e.y) / (d + 0.01)) * 0.5; // L10107
            if (walkable(this.terrain[idx(Math.floor(nx), Math.floor(ny))]) || RACES[u.race].flying) {   // L10108（walkable 门 + flying 旁路）
              u.x = Math.max(0.5, Math.min(W - 0.5, nx));      // L10109（世界边框双钳）
              u.y = Math.max(0.5, Math.min(H - 0.5, ny));      // L10110
            }
            if (d < e.r) { u.hp -= 0.18; u.hurt = 12; if (u.hp <= 0) u.dead = true; }   // L10112（环伤）
          }
        }
        if (e.age % 36 === 0 && e.age < e.ttl - 15) {          // L10115（间歇雷电——水龙卷）
          const ang = this.rng() * Math.PI * 2;                // L10116（1 掷选点）
          this.lightning(e.x + Math.cos(ang) * e.r * 0.7, e.y + Math.sin(ang) * e.r * 0.7);   // L10117
        }
        if (this.rng() < 0.4) {                                // L10120（台风暴雨顺手浇熄路径上的火焰——0.4 门 1 掷）
          const ang = this.rng() * Math.PI * 2;                // L10121（采样双掷）
          const rr = this.rng() * e.r;                         // L10122
          const j = idx(Math.floor(e.x + Math.cos(ang) * rr), Math.floor(e.y + Math.sin(ang) * rr));   // L10123
          if (j >= 0 && j < W * H && this.fire[j] > 0) { this.fire[j] = 0; this.fireSet.delete(j); }   // L10124（灭火无 fx——与 holystorm 浇火异构）
        }
      }
      if (e.age >= e.ttl) {                                    // L10444-10446（到期 splice——倒序遍历安全）
        this.effects.splice(i, 1);
      }
    }
  }
  // ---- M-U21 神之手指三 API（beginGrab/moveGrab/endGrab 蓝本 L5293-5347 机械转写） +
  //      unitsTick JS 路径壳（L3117-3216——WBB 批内核无头恒 JS 路径；parity 门 + 前奏精简链
  //      + grab 早退 → grabbedTick 全链；AI 域零触达——黄金窗口截断保证：S16 u1 眙晕链
  //      10→0 恰收尾 / u2/u3 grab=999 常驻冻结 / S17 42 tick 截在 grab=3 眙晕中 / S18 4 tick
  //      眙晕中——违反即 throw（镜像覆盖域守卫））----
  beginGrab(wx, wy) {                        // L5293-5311
    let best = null;
    let bestD = 2.2 * 2.2;                   // L5295
    for (const u of this.units) {            // L5296
      if (u.dead || u.boat) continue;        // L5297
      const dx = u.x - wx;                   // L5298
      const dy = u.y - wy;                   // L5299
      const d2 = dx * dx + dy * dy;          // L5300
      if (d2 < bestD) { bestD = d2; best = u; }   // L5301
    }
    if (!best) { this.grabId = null; return false; }   // L5302-5303
    this.grabId = best.id;                   // L5304
    best.grab = 6;                           // L5305
    this.fx('spawn', best.x, best.y - 0.6, 22);   // L5306（2 掷）
    return true;                             // L5307
  }
  moveGrab(wx, wy) {                         // L5315-5327
    if (this.grabId == null) return;         // L5316
    const u = this.unitById.get(this.grabId);   // L5317
    if (!u || u.dead) { this.grabId = null; return; }   // L5318
    if ((u.thrT ?? 0) > 0) return;           // L5319（已掷出飞行中不再跟随）
    u.x = Math.max(0.5, Math.min(W - 0.5, wx));   // L5320
    u.y = Math.max(0.5, Math.min(H - 0.5, wy));   // L5321
    u.tx = u.x; u.ty = u.y;                  // L5322
    u.lx = u.x; u.ly = u.y;                  // L5323
    u.rx = u.x; u.ry = u.y;                  // L5324
    u.grab = 6;                              // L5325
  }
  endGrab(vx, vy) {                          // L5330-5347
    if (this.grabId == null) return;         // L5331
    const u = this.unitById.get(this.grabId);   // L5332
    this.grabId = null;                      // L5333（先清账——即使单位无效）
    if (!u || u.dead) return;                // L5334
    const spd = Math.hypot(vx, vy);          // L5335（fdlibm）
    if (spd < 0.35) {
      u.grab = 10;                           // L5338（轻放）
      u.thrT = 0;                            // L5339
      this.fx('dust', u.x, u.y + 0.4, 14);   // L5340（2 掷）
      return;                                // L5341
    }
    u.thrVx = vx / spd * Math.min(1.6, spd * 0.22);   // L5343
    u.thrVy = vy / spd * Math.min(1.6, spd * 0.22);   // L5344
    u.thrT = 8 + Math.min(22, Math.round(spd * 5));   // L5345
    u.thrX0 = u.x;                           // L5346
    u.thrY0 = u.y;                           // L5346
    u.grab = u.thrT + 26;                    // L5347
    u.atk = 0;                               // L5348
  }
  grabbedTick(u) {                           // L5349-5390（M-U3h 已译域镜像补全——步进面全链）
    if (TOOL3_RED === 'finger') return;      // 红证旋钮：TOOL3_RED=finger 禁 grabbedTick 全写面（缺陷面 = C# 硬译漏眙晕递减/飞行/落地链 → grab 恒值不衰减）
    if (u.grab) u.grab -= 2;                 // L5350（真值门）
    if ((u.thrT ?? 0) > 0) {                 // L5351
      u.thrT = (u.thrT ?? 0) - 2;            // L5353
      const nx = Math.max(0.5, Math.min(W - 0.5, u.x + (u.thrVx ?? 0) * 2));   // L5354
      const ny = Math.max(0.5, Math.min(H - 0.5, u.y + (u.thrVy ?? 0) * 2));   // L5355
      const tt = this.terrain[idx(Math.floor(nx), Math.floor(ny))];   // L5357
      if (tt !== T.MOUNTAIN) { u.x = nx; u.y = ny; }   // L5358-5359（撞山即坠）
      u.thrVx = (u.thrVx ?? 0) * 0.94;       // L5360
      u.thrVy = (u.thrVy ?? 0) * 0.94;       // L5361
      if (this.rng() < 0.3) this.fx('dust', u.x, u.y, 10);   // L5362（1 掷/tick）
      if ((u.thrT ?? 0) <= 0) {              // L5363
        const dist = Math.hypot(u.x - (u.thrX0 ?? u.x), u.y - (u.thrY0 ?? u.y));   // L5365（fdlibm）
        const dmg = Math.round(dist * 2.6);  // L5366
        u.hp -= dmg;                         // L5367
        u.hurt = 24;                         // L5368
        u.grab = Math.max(u.grab ?? 0, 24);  // L5369
        u.thrT = 0;                          // L5370
        for (let k = 0; k < 3; k++) this.fx('dust', u.x + (this.rng() - 0.5) * 1.6, u.y + (this.rng() - 0.5) * 1.6, 20);   // L5371（3 掷）
        if (this.fxPrefs.dmgNumbers && dmg > 0) this.fx('dmg', u.x, u.y - 1, 30, { text: `${dmg}` });   // L5372（dmgNumbers 黄金 fxPrefs 默认 false——零写）
        this.shake = Math.max(this.shake, Math.min(5, 1 + dist * 0.3));   // L5373
      }
      if (u.hp <= 0) u.dead = true;          // L5375
    } else if ((u.grab ?? 0) <= 0) {         // L5376（蓝本防御面——主循环不可达）
      u.grab = 0; u.thrVx = 0; u.thrVy = 0;  // L5377-5379
    }
  }
  fireTickM() { }                            // L2523 截断镜像（夹具无火零效应——fireSet 空顶层早退零掷零写）
  rebuildBucketsM() { }                      // L2525 零掷纯函数（桶面黄金快照不审计——C# RebuildBuckets 已位精确译件）
  unitsTick() {                              // L3117-3216 JS 路径壳
    const parity = this.tickCount % 2;       // L3118
    for (const u of this.units) {            // L3204
      if (u.parity === parity && !u.dead) {  // L3205
        // updateUnit 前奏 L3455-3464（黄金窗口触达面：hurt 递减——grab 早退前）
        if (u.hurtN !== undefined) { if (u.hurtN > 0) { u.hurtN -= 1; u.hurt = u.hurtN; } }   // L3457 hurtN 轨
        else if (u.hurt > 0) u.hurt--;       // L3457 legacy int 轨
        if ((u.grab ?? 0) > 0) { this.grabbedTick(u); continue; }   // L3465（AI 早退——黄金窗口内全部单位 grab>0）
        throw new Error(`unitsTick 镜像窗口外 AI 域触达 u${u.id}（夹具违例——黄金窗口截断保证破坏）`);   // 镜像覆盖域守卫
      }
    }
    // L3215 挂账：unitsReap 收尸域（全活零效应）
  }
  // ---- applyTool 大分发器切片四（骨架 M-U14 译件 + 天灾族 case 点亮） ----
  applyTool(toolId, wx, wy, parms) {          // engine L13230-13420
    if (!TOOL_BY_ID_KEYS.has(toolId) && !parseCreationTool(toolId)) return;   // L13233（守卫）
    const pv = (k, d) => (parms && typeof parms[k] === 'number' && Number.isFinite(parms[k]) ? parms[k] : d);   // L13235-13238
    const rRaw = pv('radius', NaN);           // L13239
    const r = Number.isFinite(rRaw) ? rRaw : this.brush;              // L13240（笔刷回退）
    const rP = Number.isFinite(rRaw) ? rRaw : undefined;              // L13241
    const count = Math.max(1, Math.floor(pv('count', 1)));            // L13242
    const countP = parms && 'count' in parms ? count : undefined;     // L13243
    const power = pv('power', 1);             // L13244
    const powerP = parms && 'power' in parms ? power : undefined;     // L13245
    const duration = Math.max(20, Math.floor(pv('duration', 0)));     // L13246
    const durationP = parms && 'duration' in parms ? duration : undefined;   // L13247
    switch (toolId) {                         // L13297
      case 'meteor': {                        // L13342-13350（内联抖动循环——n>1 门 2 掷/颗）
        const n = countP ?? 1;                // L13343（countP undefined → 1）
        for (let k = 0; k < n; k++) {         // L13344
          const ox = n > 1 ? (this.rng() - 0.5) * Math.max(3, n) : 0;   // L13345（n>1 门——单发零掷精确落点）
          const oy = n > 1 ? (this.rng() - 0.5) * Math.max(3, n) : 0;   // L13346
          this.meteor(wx + ox, wy + oy);      // L13347
        }
        break;
      }
      case 'acidrain': this.acidRain(wx, wy, Math.max(4, r), durationP); break;   // L13375-13377（max(4,r) 下钳）
      case 'volcano': this.volcano(wx, wy, powerP); break;              // L13378-13380（powerP undefined → JS 默认参 1）
      case 'tsunami': this.tsunami(wx, wy, r); break;                   // L13381-13383（笔刷即浪级）
      case 'blizzard': this.blizzard(wx, wy, Math.max(5, r), durationP); break;   // L13384-13386（max(5,r) 下钳）
      case 'meteorshower': this.meteorShower(wx, wy, Math.max(4, r), countP); break;   // L13387-13389（max(4,r) 下钳 + count 直取面）
      case 'locust': this.locust(wx, wy, rP, durationP); break;         // L13390-13392（rP undefined → JS 默认参 5）
      case 'drought': this.drought(wx, wy, Math.max(5, r), durationP); break;   // L13393-13395（max(5,r) 下钳）
      case 'rain': this.rainCloud(wx, wy, Math.max(4, r), durationP); break;    // L13406-13408（max(4,r) 下钳）
      case 'bless': this.blessArea(wx, wy, r); break;                   // L13409-13411
      case 'curse': this.curseArea(wx, wy, r); break;                    // L13412-13414
      case 'love': this.loveArea(wx, wy, r); break;                      // L13415-13417
      case 'mutate': this.mutateArea(wx, wy, r); break;                  // L13418-13420（M-U19：特质域接入）
      case 'finger': this.beginGrab(wx, wy); break;                      // L13373-13375（M-U21：抓取域接入——返回值丢弃）
      case 'teleport': this.teleportArea(wx, wy, r); break;              // L13421-13423
      case 'wrath': this.wrathStorm(wx, wy, Math.max(4, r), durationP); break;   // L13424-13426（max(4,r) 下钳）
      case 'holystorm': this.holyStorm(wx, wy, Math.max(4, r), durationP); break;   // L13427-13429（max(4,r) 下钳）
      case 'plasmacannon': this.plasmaCannon(wx, wy, powerP); break;     // L13431-13433（powerP undefined → JS 默认参 dmg 90）
      case 'annihilate': this.annihilationLight(wx, wy); break;          // L13434-13436
      case 'sandstorm': this.sandstorm(wx, wy, rP, durationP); break;    // L13438-13440（rP undefined → JS 默认参 5.5）
      case 'typhoon': this.typhoon(wx, wy, rP, durationP); break;        // L13441-13443（rP undefined → JS 默认参 6）
      case 'sinkhole': this.sinkhole(wx, wy, Math.max(3, r)); break;     // L13444-13446（max(3,r) 下钳）
      case 'iceage': this.iceAge(wx, wy, rP ?? Math.max(6, this.brush * 2 + 4), durationP); break;   // L13447-13449（rP ?? max(6,brush*2+4)——笔刷联动缺省面）
      case 'famine': this.famineCloud(wx, wy, rP, durationP); break;     // L13450-13452（rP undefined → JS 默认参 6）
      case 'blackhole': this.blackhole(wx, wy, rP, durationP); break;    // L13453-13455（rP undefined → JS 默认参 8）
      case 'river': this.carveRiver(wx, wy); break;                      // L13354-13356（M-U20：runtime 语义——widthOverride undefined → 笔刷宽度）
      default: break;                         // L13456-13457
    }
  }
}

// ---- 黄金回放对账 ----
const golden = JSON.parse(readFileSync(new URL('./golden/tool3.json', import.meta.url), 'utf8'));
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
    if (call.fn === 'applyTool') eng.applyTool(call.args[0], call.args[1], call.args[2], call.args[3]);
    else if (call.fn === 'beginGrab') eng.beginGrab(call.args[0], call.args[1]);             // M-U21：三 API 直调
    else if (call.fn === 'moveGrab') eng.moveGrab(call.args[0], call.args[1]);
    else if (call.fn === 'endGrab') eng.endGrab(call.args[0], call.args[1]);
    else if (call.fn === 'unitsTick') { eng.tickCount++; eng.fireTickM(); eng.rebuildBucketsM(); eng.unitsTick(); eng.effectsTick(); }   // M-U21：主循环 L2523-2528 截断镜像
    else if (call.fn === 'effectsTick') { eng.tickCount++; eng.effectsTick(); }
    else throw new Error(`${sc.key}: 未知调用 ${call.fn}`);
    const m = {
      rngA: (eng.rngA >>> 0).toString(16).padStart(8, '0'),
      terrainMd5: md5hex(eng.terrain),
      fireMd5: md5hex(eng.fire),
      fireSet: [...eng.fireSet],
      frozen: [...eng.frozen],
      regrow: [...eng.regrow.entries()],
      flood: [...eng.flood.entries()],
      wet: [...eng.wet.entries()],
      radiateMd5: md5hex(eng.radiate),
      radSet: [...eng.radSet.entries()],
      fxCount: eng.effects.length,
      eventsCount: eng.worldEvents.length,
      buildingsCount: eng.buildings.length,
      shake: eng.shake,
      stats: [eng.statNukes, eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes],
      unitsCount: eng.units.length,
      ...(call.grabId !== undefined ? { grabId: eng.grabId ?? null } : {}),   // M-U21：stepUnits 条件面
    };
    for (const k of Object.keys(m)) cmp(m[k], call[k], `step${s}.${k}`);
    if (call.fn === 'effectsTick' || call.fn === 'unitsTick') {   // M-U21：unitsTick 步同列快照
      const mf = eng.effects.map((e) => ({ kind: e.kind, age: e.age, x: f64hex(e.x), y: f64hex(e.y), dir: f64hex(e.dir) }));
      cmp(mf, call.fx, `step${s}.fx`);
      const mu = eng.units.map((u) => ({
        id: u.id, hp: f64hex(u.hp), hurt: f64hex(u.hurt ?? 0), dead: u.dead ? 1 : 0, x: f64hex(u.x), y: f64hex(u.y),
        ...(call.units[0]?.grab !== undefined ? { grab: u.grab ?? 0, thrT: u.thrT ?? 0 } : {}),   // M-U21：条件面
      }));
      cmp(mu, call.units, `step${s}.units`);
      cmp([...eng.dirty].sort((a, b) => a - b), call.dirty, `step${s}.dirty`);
    }
  }
  // 终态对账
  let endOk = stepOk;
  let endErr = '';
  if (endOk && md5hex(gunzip(sc.terrain)) !== md5hex(eng.terrain)) { endOk = false; endErr = 'terrain 终态'; }
  if (endOk && sc.variantMd5 !== md5hex(eng.variant)) { endOk = false; endErr = 'variantMd5 终态'; }
  if (endOk && md5hex(gunzip(sc.radiate)) !== md5hex(eng.radiate)) { endOk = false; endErr = 'radiate 终态'; }
  if (endOk && JSON.stringify([...eng.radSet.entries()]) !== JSON.stringify(sc.radSet)) { endOk = false; endErr = 'radSet 终态'; }
  if (endOk && JSON.stringify([...eng.regrow.entries()]) !== JSON.stringify(sc.regrow)) { endOk = false; endErr = 'regrow 终态'; }
  if (endOk && sc.shake !== eng.shake) { endOk = false; endErr = 'shake 终态'; }
  if (endOk && JSON.stringify([eng.statNukes, eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes]) !== JSON.stringify(sc.stats)) { endOk = false; endErr = 'stats 终态'; }
  if (endOk) {
    const mf = eng.effects.map((e) => ({
      kind: e.kind, x: f64hex(e.x), y: f64hex(e.y),
      x0: e.x0 === undefined ? null : f64hex(e.x0), y0: e.y0 === undefined ? null : f64hex(e.y0),
      ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null, age: e.age,
      quiet: e.quiet ? 1 : 0, dmg: e.dmg === undefined || e.dmg === null ? null : f64hex(e.dmg),
    }));
    if (JSON.stringify(mf) !== JSON.stringify(sc.fx)) { endOk = false; endErr = 'fx 终态'; }
  }
  if (endOk) {
    const me = eng.worldEvents.map((e) => ({ kind: e.kind, text: e.text, colorHex: e.colorHex ?? null, x: e.x ?? null, y: e.y ?? null }));
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
      bless: u.bless ?? null, curse: u.curse ?? null, fert: u.fert ?? null,
      job: u.job === undefined ? null : u.job, name: u.name ?? null,
      trait: u.trait ? u.trait : null,   // M-U19：u.trait string 语义（0 falsy → null）
      gene: u.gene ? { s: f64hex(u.gene.s), d: f64hex(u.gene.d), h: f64hex(u.gene.h), r: f64hex(u.gene.r) } : null,
      fam: u.fam ?? null, fgn: u.fgn ?? null,
      breath: u.breath ?? null, parity: u.parity ?? null, kills: u.kills ?? null,
    });
    if (JSON.stringify(eng.units.map(dumpUnit)) !== JSON.stringify(sc.units)) { endOk = false; endErr = 'units dump 终态'; }
  }
  if (endOk && JSON.stringify(eng.toasts) !== JSON.stringify(sc.toasts)) { endOk = false; endErr = 'toasts 终态'; }
  if (stepOk && endOk) { pass++; console.log(`${sc.key}: PASS (draws=${sc.totalDraws} fx=${eng.effects.length} ev=${eng.worldEvents.length} units=${eng.units.length} shake=${eng.shake} stats=${JSON.stringify([eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes])})`); }
  else { fail++; console.log(`${sc.key}: FAIL (${!stepOk ? firstErr : endErr})`); }
}
console.log(`tool3 transcript: ${pass}/${golden.scenarios.length} 场景逐位 ${pass === golden.scenarios.length ? 'ALL PASS' : 'FAIL'}`);
if (fail > 0) process.exit(1);
