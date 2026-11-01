// ============================================================================
// eco-transcript.mjs —— M-U12 切片「ecoTick 生态承载域」零引擎导入镜像
//   镜像域：ecoTick L12096-12202（六段 + 迁徙双支）+ isHerbivoreRace L2120-2129 +
//   isPredatorRace L2169-2178 + spawnUnit 静默可达域 L1289-1465（bail-transcript
//   L595-660 已对账件移植——gene 门放宽 baseGene 空表分支）+ baseGene L11059-11063
//   （speciesBase 空表支零掷 {1,1,1,1}——有值支 GUARD）+ setTerrain 级联子集
//   （rainflood-transcript 已对账件移植）。
//   黄金：gen-eco.mjs 12 场景（bun 真引擎）——每调用步进快照逐位 + 终态全列对拍。
//   纪律②先红在案：C# 译件动工前 eco 黄金回放 FAIL（verify 段 35）。
// 运行：bun scripts/unity-migration/eco-transcript.mjs（M-U7w 口径：黄金链一律 bun）
// ============================================================================
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 蓝本常量（types.ts/constants.ts 逐值镜像——零导入） ----
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const isWater = (t) => t === T.DEEP || t === T.WATER;
const W = 256, H = 160, N = W * H;
const idx = (x, y) => y * W + x;
const R_SHEEP = 6, R_WOLF = 7, R_DEER = 10;

// ---- mulberry（noise.ts L3-13 机械重写） ----
function Rng(w) {   // engine rng L728-733（rngA 单流）
  w.rngA = (w.rngA + 0x6d2b79f5) | 0;
  let t = Math.imul(w.rngA ^ (w.rngA >>> 15), 1 | w.rngA);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const MathFloor = Math.floor;

// ---- 工具 ----
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const gunzip = (b64) => zlib.gunzipSync(Buffer.from(b64, 'base64'));
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

// ---- spawn 链闭包常量（bail-transcript L52-99 已对账件移植——触达面扩 7/10） ----
const MAX_UNITS2 = 2400, MAX_WILDLIFE2 = 900, MAX_WILDLIFE_AQUATIC2 = 520;
const AQUATIC_RACES = new Set([25, 37, 38, 39, 40]);
// 种族基础属性（types.ts L163/L164/L167 消费切片——迁徙支 spawn 三种）
const RSTAT = {
  6: { name: '绵羊', hp: 16, dmg: 1, speed: 0.038, maxAge: 26, isCiv: false, undead: false, aquatic: false },
  7: { name: '狼', hp: 34, dmg: 10, speed: 0.093, maxAge: 22, isCiv: false, undead: false, aquatic: false, predator: true },
  10: { name: '鹿', hp: 24, dmg: 1, speed: 0.115, maxAge: 20, isCiv: false, undead: false, aquatic: false },
  37: { name: '鱼', hp: 6, dmg: 0.5, speed: 0.075, maxAge: 10, isCiv: false, undead: false, aquatic: true },   // types.ts L198（L12115 aquatic 跳过面——仅读 aquatic 旗）
  40: { name: '鲨鱼', hp: 90, dmg: 16, speed: 0.1, maxAge: 30, isCiv: false, undead: false, aquatic: true, predator: true },   // types.ts L197（同上——isPredatorRace 静态支前 continue）
};
const statOf = (race) => { const s = RSTAT[race]; if (!s) throw new Error(`RSTAT race ${race} 未转写（迁徙支触达面外）`); return s; };
// names.ts FIRST L12/L13/L16 消费切片
const FIRST = {
  6: ['Wooly', 'Fluff', 'Baaald', 'Shears', 'Cloud', 'Tumble'],
  7: ['Fenrir', 'Grey', 'Howl', 'Fang', 'Shadow', 'Nip'],
  10: ['Bambi', 'Fawn', 'Dash', 'Clover', 'Willow', 'Bramble', 'Hazel', 'Sorrel'],
};
// engine L1107-1108 家族名表（family 0.06 门掷流）
const FAM_PRE = ['霜', '烬', '暴风', '血', '铁', '荆棘', '暗影', '星', '狼', '鹰', '珊瑚', '苔', '雷', '冬', '荒', '银'];
const FAM_POST = ['牙', '羽', '痕', '鬃', '棘', '誓', '歌', '爪', '翼', '须', '蹄', '岚'];
// types.ts L264-276 TRAITS 预设表（rollTrait 均匀 1 掷 + td 乘数消费）
const TRAITS_ALL = {
  strong: { key: 'strong', name: '强壮', desc: '伤害 +40%', dmgMul: 1.4, good: true },
  tough: { key: 'tough', name: '坚韧', desc: '生命 +35%', hpMul: 1.35, good: true },
  swift: { key: 'swift', name: '迅捷', desc: '速度 +30%', speedMul: 1.3, good: true },
  weak: { key: 'weak', name: '羸弱', desc: '伤害 -20%', dmgMul: 0.8, good: false },
  sickly: { key: 'sickly', name: '多病', desc: '生命 -25%', hpMul: 0.75, good: false },
  genius: { key: 'genius', name: '天才', desc: '可能缔造传奇', good: true },
  berserk: { key: 'berserk', name: '狂暴', desc: '伤害 +70%, 生命 -15%', dmgMul: 1.7, hpMul: 0.85, good: true },
  lucky: { key: 'lucky', name: '幸运', desc: '命不该绝', good: true },
  regeneration: { key: 'regeneration', name: '再生', desc: '缓慢恢复生命', regen: 0.3, good: true },
  giant: { key: 'giant', name: '巨型', desc: '生命 +80%, 伤害 +50%, 速度 -25%', hpMul: 1.8, dmgMul: 1.5, speedMul: 0.75, giant: true, good: true },
  tiny: { key: 'tiny', name: '侏儒', desc: '生命 -45%, 伤害 -20%, 速度 +25%', hpMul: 0.55, dmgMul: 0.8, speedMul: 1.25, tiny: true, good: true },
  immune: { key: 'immune', name: '免疫', desc: '不会感染瘟疫与毒素', immune: true, good: true },
};
// names.ts roman L81-91（uniqueName 去重后缀）
function Roman(n) {
  if (n < 1 || n > 40) return String(n);
  const table = [[40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '', v = n;
  for (const [val, sym] of table) { while (v >= val) { out += sym; v -= val; } }
  return out.toUpperCase();
}
// rollTrait（engine L1482-1486）
function RollTrait(w) {
  const keys = Object.keys(TRAITS_ALL);
  return keys[MathFloor(Rng(w) * keys.length)];
}
// unitName（names.ts L74-77）
function UnitNameOf(race, w) {
  const pool = FIRST[race] ?? FIRST[6];
  return pool[MathFloor(Rng(w) * pool.length)];
}
// uniqueName（engine L1522-1534）
function UniqueName(w, race) {
  const base = UnitNameOf(race, w);
  const bl = base.length;
  let n = 0;
  for (const u of w.units) {
    if (u.dead) continue;
    const nm = u.name;
    if (nm === base || (nm.length > bl && nm.charCodeAt(bl) === 32 && nm.startsWith(base))) n++;
  }
  return n === 0 ? base : `${base} ${Roman(n + 1)}`;
}
// bumpWild（engine L1085-1088）
function BumpWild(w, race, d) {
  const n = (w.wildCount.get(race) ?? 0) + d;
  if (n > 0) w.wildCount.set(race, n);
  else w.wildCount.delete(race);
}
// wildAlive（engine L1089-1094）
function WildAlive(w) { let n = 0; for (const v of w.wildCount.values()) n += v; return n; }
// wildAliveAquatic（engine L1096-1100）
function WildAliveAquatic(w) { let n = 0; for (const [race, v] of w.wildCount) if (AQUATIC_RACES.has(race)) n += v; return n; }
// newFamily（engine L1111-1133）
function NewFamily(w, race, founder) {
  const pre = FAM_PRE[MathFloor(Rng(w) * FAM_PRE.length)];
  const post = FAM_POST[MathFloor(Rng(w) * FAM_POST.length)];
  const f = { id: w.familySeq++, name: pre + post, race, founded: MathFloor(w.yearF), founder: founder.name, members: 1, heroes: 0, kills: 0, peak: 1, milestones: 0 };
  w.families.set(f.id, f);
  return f;
}
// familyMilestone（engine L1139-1149——spawn members=1 不触 12/24/40；结构保留）
function FamilyMilestone(w, f) {
  if (f.members > f.peak) f.peak = f.members;
  const marks = [12, 24, 40];
  while (f.milestones < marks.length && f.members >= marks[f.milestones]) {
    const m = marks[f.milestones++];
    const raceName = statOf(f.race).name;
    w.addEvent('lineage', `${raceName}「${f.name}」家族枝繁叶茂 —— 族人已达 ${m} 口（先祖 ${f.founder}）`);
  }
}

// ---- 镜像引擎（fixture 注入 + ecoTick 直调——黄金回放载体） ----
class EEng {
  constructor(sc) {
    const fx = sc.fixture;
    this.tickCount = sc.tickCount;
    this.yearF = fx.yearF0;
    this.shake = 0;
    this.rngA = sc.seed >>> 0;   // gen 手术三 rngA 尾置清零起流（calls 前置——步进协议同构）
    this.terrain = new Uint8Array(gunzip(fx.terrain0));
    this.regrow = new Map(fx.regrow0);
    this.building = new Uint8Array(N);
    this.buildings = [];
    this.bIdx = new Map();
    for (const b of fx.building0) {
      this.building[b.i] = b.kind;
      this.buildings.push({ i: b.i, x: b.x, y: b.y, kind: b.kind, civ: -1 });
      this.bIdx.set(b.i, this.buildings.length - 1);
    }
    this.soilF = new Uint8Array(gunzip(fx.soil0));
    this.owner = new Int16Array(N).fill(-1);
    this.road = new Uint8Array(N);
    this.fire = new Uint8Array(N);
    this.fireSet = new Set();
    this.frozen = new Set();
    this.flood = new Map();
    this.wet = new Map();
    this.riverDir = new Uint8Array(N);
    this.riverTiles = new Set();
    this.waterTier = new Uint8Array(N);
    this.glacier = new Uint8Array(N);
    this.tempMap = new Float64Array(N);
    this.units = [];
    this.unitById = new Map();
    this.unitSeq = 1;
    this.effects = [];
    this.worldEvents = [];
    this.eventSeq = 1;
    this.ecoState = fx.ecoState0;
    this.ecoLastNoteYear = fx.ecoLastNoteYear0;
    this.ecoRepopYear = fx.ecoRepopYear0;
    this.preyGrid = new Uint16Array(32 * 20);
    this.grassTiles = 1;
    this.wildCount = new Map();
    this.families = new Map();
    this.familySeq = 1;
    this.speciesBase = new Map();   // baseGene 空表支锚（gen sanity 同款——有值支 GUARD）
    this.dynRaces = new Map();      // 静态八种面触达——动态种支 GUARD
    // 瘦单位重建（gen mkUnit 协议——units0 只存生态面字段）
    for (const uo of fx.units0) {
      this.units.push({
        id: uo.id, race: uo.race, civ: -1, x: uo.x, y: uo.y, tx: uo.x, ty: uo.y,
        hp: uo.hp, maxHp: uo.hp, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
        cd: 0, trait: 0, job: 0, king: 0, infected: 0, flip: 0,
        name: `u${uo.id}`, hurt: 0, breath: 0, parity: 0, dead: uo.dead,
        gene: uo.gene, fam: null, fgn: null, army: null,
      });
      this.unitById.set(uo.id, this.units[this.units.length - 1]);
    }
  }

  addEvent(kind, text, x, y) {            // engine addEvent L13995-14009（unshift + cap 80——colorHex 面不入 dump）
    const ev = { id: this.eventSeq++, year: MathFloor(this.yearF), kind, text, colorHex: undefined, x, y };
    this.worldEvents.unshift(ev);
    if (this.worldEvents.length > 80) this.worldEvents.length = 80;
  }

  // setTerrain L969-1007 级联子集（rainflood-transcript L165-188 已对账件——M-U12 触达面：
  //   同值早退/regrow 出账 L979/flood-wet 出账/riverDir 清/fire 熄/owner 熄——ICE 与水吞支 BURNT 域不触）
  setTerrain(i, t) {
    const prev = this.terrain[i];
    if (prev === t) return;                                       // L971
    this.terrain[i] = t;                                          // L972
    this.regrow.delete(i);                                        // L979
    if (prev === T.ICE) this.frozen.delete(i);                    // L981
    if (t === T.ICE) this.frozen.add(i);                          // L982
    if (t !== T.WATER) this.flood.delete(i);                      // L983
    if (t !== T.SAND) this.wet.delete(i);                         // L984
    if (!isWater(t) && this.riverDir[i] > 0) {                    // L986
      this.riverDir[i] = 0;                                       // L987
      this.riverTiles.delete(i);                                  // L988
    }
    if (this.fire[i] > 0) {                                       // L990
      this.fire[i] = 0;                                           // L991
      this.fireSet.delete(i);                                     // L992
    }
    if ((isWater(t) || t === T.LAVA) && this.owner[i] >= 0) this.owner[i] = -1;   // L994-995
    if ((isWater(t) || t === T.LAVA) && this.building[i] > 0) throw new Error('setTerrain 水吞建筑支未转写（M-U12 域 BURNT 不触）');   // L998 GUARD
    if ((isWater(t) || t === T.LAVA) && this.road[i] > 0) this.road[i] = 0;       // L1002
    // worldsim.onTerrainChanged L153-165 观测面（rainflood M-U11 同位——M-U12 BURNT 覆写触达 L157 支）
    if (t === T.BURNT && this.soilF[i] > 8) this.soilF[i] -= 8;   // L157 火烧地力损耗（255→247——soilMulAt 除子随动）
    if ((isWater(t) || t === T.DEEP || t === T.LAVA) && this.glacier[i] > 0) this.glacier[i] = 0;   // L159-163（M-U12 BURNT 域不触，结构保留）
    // L155 elev 场（ELEV_TGT 回归）/ L164 driftAcc 场——worldsim 深时域未译注记维持（C# 同款注记）
  }

  // isHerbivoreRace L2120-2129（静态八种 + dynRaces 递归——M-U12 场景静态面触达）
  isHerbivoreRace(race) {
    if (race === R_SHEEP || race === 10 || race === 11 || race === 12) return true;   // L2121 SHEEP/DEER/PENGUIN/CAMEL
    if (race === 33 || race === 34 || race === 35 || race === 37) return true;        // L2122 CHICKEN/PIG/RABBIT/FISH
    const d = this.dynRaces.get(race);
    if (!d) return false;
    if (d.eco === 'herb') return true;
    if (d.eco) return false;
    return this.isHerbivoreRace(d.parent);
  }

  // isPredatorRace L2169-2178（五静态 + 狐/鲨 + dynRaces eco==='pred' 递归）
  isPredatorRace(race) {
    if (race === R_WOLF || race === 15 || race === 8 || race === 13 || race === 14) return true;   // L2170 WOLF/SNOWWOLF/BEAR/SCORPION/SNAKE
    if (race === 36 || race === 40) return true;                                                    // L2173 FOX/SHARK
    const d = this.dynRaces.get(race);
    if (!d) return false;
    if (d.eco === 'pred') return true;
    if (d.eco) return false;
    return this.isPredatorRace(d.parent);
  }

  // baseGene L11059-11063（speciesBase 空表支零掷——gen speciesBase.size===0 sanity 同锚）
  baseGene(race) {
    const b = this.speciesBase.get(race)?.gene;
    if (b) throw new Error('baseGene 有值支未转写（M-U12 场景 speciesBase 恒空）');
    return { s: 1, d: 1, h: 1, r: 1 };
  }

  // spawnUnit（engine L1283-1465；静默可达域全译——bail-transcript L595-660 已对账件移植 +
  //   gene 门放宽：opts.gene ?? baseGene(race)（L1319 ?? 深链——迁徙支 silent 无 gene 触达））
  SpawnUnit(race, x, y, opts) {
    const st = statOf(race);
    if (st.isCiv && this.units.length >= MAX_UNITS2) return null;
    if (!st.isCiv) {
      if (st.aquatic) { if (WildAliveAquatic(this) >= MAX_WILDLIFE_AQUATIC2) return null; }
      else if (WildAlive(this) >= MAX_WILDLIFE2) return null;
    }
    x = Math.max(0.5, Math.min(W - 0.5, x));                    // L1306 位置钳
    y = Math.max(0.5, Math.min(H - 0.5, y));
    const civ = opts?.civ ?? -1;                                 // L1307
    if (st.isCiv && civ < 0) throw new Error('findCivNear/createCiv 深链未转写（野生场景）');
    const trait = opts?.trait !== undefined ? (opts.trait || null) : (Rng(this) < 0.15 ? RollTrait(this) : null);   // L1316 三门
    const td = trait ? TRAITS_ALL[trait] : null;
    const gene = opts?.gene !== undefined ? opts.gene : this.baseGene(race);   // L1319 ?? baseGene（空表支零掷）
    let job = 0;
    if (st.isCiv && civ >= 0) job = opts?.job ?? 0;              // L1334（rollJob GUARD——野生不触）
    const maxHp = Math.round(st.hp * (td?.hpMul ?? 1) * (gene?.h ?? 1));   // L1343（野生无 jd/tm 面）
    const u = {
      id: this.unitSeq++, race, civ, x, y,
      lx: x, ly: y, rx: x, ry: y, tx: x, ty: y,
      hp: maxHp, maxHp,
      dmg: st.dmg * (td?.dmgMul ?? 1) * 1 * (gene?.d ?? 1),      // L1346（GovOf civ<0 → 1——野生面）
      speed: st.speed * (td?.speedMul ?? 1) * (gene?.s ?? 1),    // L1347
      tDmg: 1, tHp: 1,                                           // L1354（tm null → ?? 1）
      age: 0, maxAge: st.maxAge * (0.8 + Rng(this) * 0.4), kills: 0, cd: 0,
      trait, gene,
      job: st.isCiv ? job : undefined,
      infected: opts?.infected ?? false,
      flip: Rng(this) < 0.5,
      name: UniqueName(this, race),
      hurt: 0, breath: 120 + MathFloor(Rng(this) * 160), parity: this.unitSeq % 2, dead: false,
      fam: null, fgn: null,
    };
    this.units.push(u);
    this.unitById.set(u.id, u);
    if (!st.isCiv) BumpWild(this, race, 1);
    if (opts?.fam !== undefined) {
      u.fam = opts.fam;
      u.fgn = opts.fgn ?? 1;
      const f = this.families.get(opts.fam);
      if (f) { f.members++; FamilyMilestone(this, f); }
    } else if (!st.undead && Rng(this) < 0.06) {
      const f = NewFamily(this, race, u);
      u.fam = f.id;
      u.fgn = 1;
    }
    if (opts?.gear) throw new Error('devEquip 未转写（野生场景不传 gear）');
    if (!opts?.silent) throw new Error('spawnUnit announce 分支未转写（M-U12 恒 silent）');
    return u;
  }

  // ecoTick L12096-12202（六段 + 迁徙双支——逐行机械镜像）
  ecoTick() {
    // 1) 植被重算（草原+森林 = 食草承载力底座）                        // L12097
    let grass = 0;
    for (let i = 0; i < N; i++) {
      const t = this.terrain[i];                                      // L12100
      if (t === T.GRASS || t === T.FOREST) grass++;
    }
    this.grassTiles = grass;                                          // L12103
    // 2) 种群清点（同步重算猎物密度场）                                // L12104
    let herb = 0;
    let pred = 0;
    const herbivores = [];
    const predators = [];
    this.preyGrid.fill(0);                                            // L12109
    for (const u of this.units) {
      if (u.dead) continue;                                           // L12111
      const udef = statOf(u.race);                                    // L12112（RSTAT 触达面 6/7/10——扩展种 GUARD）
      if (udef.aquatic) continue;                                     // L12115
      if (this.isHerbivoreRace(u.race)) {
        herb++; herbivores.push(u);
        const gx = Math.min(31, Math.max(0, (u.x / 8) | 0));          // L12118
        const gy = Math.min(19, Math.max(0, (u.y / 8) | 0));          // L12119
        this.preyGrid[gy * 32 + gx]++;
      }
      else if (this.isPredatorRace(u.race)) { pred++; predators.push(u); }
    }
    // 3) 食草动物 vs 植被承载力（竞争性饥饿）                          // L12124
    const capacity = grass * 1.6;                                     // L12125
    if (herb > capacity) {
      const starve = Math.min(10, Math.ceil((herb - capacity) * 0.2));   // L12127
      for (let k = 0; k < starve; k++) {
        let victim = null;
        let worst = Infinity;                                         // L12131
        for (let j = 0; j < 3; j++) {
          const cand = herbivores[MathFloor(Rng(this) * herbivores.length)];   // L12133
          if (!cand || cand.dead) continue;
          const fitness = (cand.gene?.h ?? 1) * (cand.gene?.s ?? 1);  // L12135
          if (fitness < worst) { worst = fitness; victim = cand; }
        }
        if (victim) { victim.hp -= 15; victim.hurt = 20; }            // L12138
      }
      // 过度啃食：草地被啃秃（via regrow 循环自愈）                    // L12140
      if (Rng(this) < 0.6 * 1.0 && herbivores.length > 0) {           // L12141（ep('eco.grazeRate') 默认 1 内联口径同 C#）
        const grazer = herbivores[MathFloor(Rng(this) * herbivores.length)];   // L12142
        const gi = idx(Math.max(0, Math.min(W - 1, MathFloor(grazer.x))), Math.max(0, Math.min(H - 1, MathFloor(grazer.y))));   // L12143
        if (this.terrain[gi] === T.GRASS && this.building[gi] === 0) {
          this.setTerrain(gi, T.BURNT);                               // L12145（regrow 出账 L979 级联先行）
          if (!this.regrow.has(gi)) this.regrow.set(gi, this.tickCount + Math.round((Math.round(700 * 1.3) + MathFloor(Rng(this) * 900)) / (0.6 + this.soilF[gi] / 255.0 * 0.8)));   // L12146（soilMulAt L168-170 内联——C# WorldsimSoilMulAt 同构）
        }
      }
    }
    // 4) 食肉动物 vs 猎物存量                                          // L12150
    const predCap = herb / 4.5;                                       // L12151
    if (pred > predCap && predators.length > 4) {
      const starve = Math.min(8, Math.ceil((pred - predCap) * 0.25)); // L12153
      for (let k = 0; k < starve; k++) {
        const cand = predators[MathFloor(Rng(this) * predators.length)];
        if (cand && !cand.dead) { cand.hp -= 14; cand.hurt = 20; }    // L12156
      }
    }
    // 5) 状态播报（去重：状态切换时才报，冷却 15 年）                  // L12159
    const ratio = capacity > 0 ? herb / capacity : 0;                 // L12160
    const nextState = herb < 8 ? 'collapse' : ratio > 1.15 ? 'overgraze' : ratio < 0.25 ? 'overgrass' : 'balanced';   // L12161
    if (nextState !== this.ecoState && MathFloor(this.yearF) - this.ecoLastNoteYear > 15) {
      this.ecoLastNoteYear = MathFloor(this.yearF);
      const msg = nextState === 'overgrass' ? '植被繁茂而食草动物稀少 —— 大地静待新的种群'
        : nextState === 'balanced' ? '食草与捕食重回平衡，草原生生不息'
        : nextState === 'overgraze' ? `食草动物超过了植被承载力（${herb}/${Math.round(capacity)}）——饥饿蔓延`
        : '野生动物几近绝迹 —— 生态面临崩溃';
      this.addEvent('eco', msg, undefined, undefined);                // L12170
      this.ecoState = nextState;
    } else if (nextState !== this.ecoState) {
      this.ecoState = nextState; // 冷却中静默切换                     // L12173
    }
    // 6) 生态自愈（迁徙入境）                                          // L12175
    const yearNow = MathFloor(this.yearF);                            // L12177
    if (yearNow - this.ecoRepopYear > 25) {
      if (ratio < 0.22 && grass > 1800 && Rng(this) < 0.35) {
        for (let k = 0; k < 10; k++) {
          const gx = 4 + MathFloor(Rng(this) * (W - 8));              // L12182
          const gy = 4 + MathFloor(Rng(this) * (H - 8));
          const gi = gy * W + gx;
          const tt = this.terrain[gi];
          if (tt !== T.GRASS && tt !== T.FOREST) continue;
          if (this.owner[gi] >= 0 || this.building[gi] > 0) continue;
          const race = tt === T.FOREST ? R_DEER : R_SHEEP;            // L12188
          for (let n = 0; n < 5; n++) this.SpawnUnit(race, gx + Rng(this) * 2 - 1, gy + Rng(this) * 2 - 1, { silent: true });   // L12189
          this.addEvent('eco', `一群${statOf(race).name}迁徙而来，在这片丰茂的草原上落户`, gx, gy);   // L12190
          this.ecoRepopYear = yearNow;
          break;
        }
      } else if (herb > 60 && pred < 6 && herbivores.length > 0 && Rng(this) < 0.25) {
        const herd = herbivores[MathFloor(Rng(this) * herbivores.length)];   // L12196
        for (let n = 0; n < 2; n++) this.SpawnUnit(R_WOLF, herd.x + Rng(this) * 6 - 3, herd.y + Rng(this) * 6 - 3, { silent: true });   // L12197
        this.addEvent('eco', '荒野狼群循着猎物的踪迹迁徙入境', herd.x, herd.y);   // L12198
        this.ecoRepopYear = yearNow;
      }
    }
  }
}

// units dump 协议（gen dumpUnit 同构——hurtN=f64hex(u.hurt)、gene 四维）
function dumpUnit(u) {
  return {
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
  };
}

// ---------------- 黄金回放主链 ----------------
const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/eco.json'), 'utf8'));
let fail = 0;
for (const sc of golden.scenarios) {
  const w = new EEng(sc);
  try {
    // 每调用步进快照对拍
    for (let s = 0; s < sc.stepsSnap.length; s++) {
      const g = sc.stepsSnap[s];
      w.ecoTick();                                                    // M-U12 calls 恒 ecoTick 单参
      const got = {
        rngA: (w.rngA >>> 0).toString(16).padStart(8, '0'),
        terrainMd5: md5hex(w.terrain),
        grassTiles: w.grassTiles,
        preyGridMd5: md5hex(Buffer.from(w.preyGrid.buffer)),
        ecoState: w.ecoState,
        regrow: [...w.regrow.entries()],
        eventsCount: w.worldEvents.length,
        fxCount: w.effects.length,
        unitsCount: w.units.length,
      };
      const want = { rngA: g.rngA, terrainMd5: g.terrainMd5, grassTiles: g.grassTiles, preyGridMd5: g.preyGridMd5, ecoState: g.ecoState, regrow: JSON.stringify(g.regrow), eventsCount: g.eventsCount, fxCount: g.fxCount, unitsCount: g.unitsCount };
      for (const k of Object.keys(want)) {
        const gv = k === 'regrow' ? JSON.stringify(got.regrow) : got[k];
        if (String(gv) !== String(want[k])) throw new Error(`step${s} ${k}: got ${gv} want ${want[k]}`);
      }
    }
    // 终态全列对拍
    if (Buffer.compare(gunzip(sc.terrain), Buffer.from(w.terrain)) !== 0) throw new Error('terrain 终态 gz 逐字节');
    if (w.grassTiles !== sc.grassTiles) throw new Error(`grassTiles ${w.grassTiles} ≠ ${sc.grassTiles}`);
    for (let i = 0; i < 640; i++) if (w.preyGrid[i] !== sc.preyGrid[i]) throw new Error(`preyGrid[${i}] ${w.preyGrid[i]} ≠ ${sc.preyGrid[i]}`);
    if (w.ecoState !== sc.ecoState) throw new Error(`ecoState ${w.ecoState} ≠ ${sc.ecoState}`);
    if (w.ecoLastNoteYear !== sc.ecoLastNoteYear) throw new Error(`ecoLastNoteYear ${w.ecoLastNoteYear} ≠ ${sc.ecoLastNoteYear}`);
    if (w.ecoRepopYear !== sc.ecoRepopYear) throw new Error(`ecoRepopYear ${w.ecoRepopYear} ≠ ${sc.ecoRepopYear}`);
    const gotRegrow = JSON.stringify([...w.regrow.entries()]);
    if (gotRegrow !== JSON.stringify(sc.regrow)) throw new Error(`regrow 终态序 ${gotRegrow} ≠ ${JSON.stringify(sc.regrow)}`);
    if (w.units.length !== sc.units.length) throw new Error(`units 数 ${w.units.length} ≠ ${sc.units.length}`);
    for (let i = 0; i < sc.units.length; i++) {
      const gu = JSON.stringify(dumpUnit(w.units[i]));
      if (gu !== JSON.stringify(sc.units[i])) throw new Error(`units[${i}] dump ${gu.slice(0, 200)} ≠ ${JSON.stringify(sc.units[i]).slice(0, 200)}`);
    }
    if (w.worldEvents.length !== sc.events.length) throw new Error(`events 数 ${w.worldEvents.length} ≠ ${sc.events.length}`);
    for (let i = 0; i < sc.events.length; i++) {
      const e = w.worldEvents[i];
      const ge = { kind: e.kind, text: e.text, x: e.x ?? null, y: e.y ?? null };
      if (JSON.stringify(ge) !== JSON.stringify(sc.events[i])) throw new Error(`events[${i}] ${JSON.stringify(ge)} ≠ ${JSON.stringify(sc.events[i])}`);
    }
    console.log(`${sc.key}: PASS (draws=${sc.totalDraws} units=${sc.units.length} ev=${sc.events.length})`);
  } catch (e) {
    fail++;
    console.error(`${sc.key}: FAIL — ${String(e.message ?? e).slice(0, 240)}`);
  }
}
if (fail > 0) { console.error(`eco-transcript: ${fail}/${golden.scenarios.length} FAIL`); process.exit(1); }
console.log(`eco-transcript: ${golden.scenarios.length}/${golden.scenarios.length} ALL PASS`);
