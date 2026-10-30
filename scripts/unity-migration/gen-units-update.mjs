// ============================================================================
// gen-units-update.mjs —— M-U7q 切片「updateUnit 批次三乙三·击杀链+龙息域」黄金向量（28 场景继承 + 击杀链 S29-S36 八场景）
// 蓝本：src/lib/game/engine.ts updateUnit（现行号 L3455 入口 → L3590 hp≤0 死亡门批次一边界；
//       扫描域 L3592-3669 批次二 → 神经决策域 L3671-3738 本切片（neuroFlight 战或逃 + neuroStance 姿态 +
//       两 flee 出口 fleeT=40/50）→ L3739+ 远程/近战执行域批次三乙哨兵 → L4110 tailJS/L4112 postJS 影子调用点），
//       rust-core/src/units.rs update_unit（L2314+，交叉核对）+ neuro.ts/neuro-weights.ts/neuro-flight-rl.ts（权重面 gen-neurodefs.mjs 机械转写）。
// M-U7q：击杀链 L3903-3957（zombify/witnessDeath/addGrudge 血仇记账/复仇 splice/家族战功/捕食进食/屠龙计数/onWarKill/legend/白行者起尸/
//       undeadRise 6%）+ 龙息 L3972-3978（R2 门 + breath 重置 + dragonBreath/ignite 真实现）——桩面补真实现依赖（building/wildCount/
//       rel·tension·warShame·warData/worldWar/armies/directives/families/civs env 注入），zombify/witnessDeath/addGrudge/onKingDeath/
//       onWarKill/dragonBreath/ignite 走 GameEngine.prototype 真实现；riseSkeleton/fx/addEvent/addCorpse 仍桩面事件捕获；toast 真实现
//       （onToast 未挂 → 静默 no-op 零掷）；collectKill/collectEnemyGone 在线采集模块域真调用（引擎外会话 state，黄金未捕获面）。
//       snapU 字段只加：race/civ/speed/breath/king（zombify 原地转种 + 龙息域 breath 镜像）；post 态 dump（statDragons/civs/families/
//       rel/tension/warShame/warData/directives —— NUnit Test30 post 对账面）。
// 直接 import 现役 engine.ts（真实现，非复制），以 Object.create(GameEngine.prototype)
// + stub 字段面驱动真 updateUnit；批次一场景空 buckets 截断，扫描场景 env.scanReal：
//  布桶（units 序 push 重建同构）+ isEnemyFast 原型真实现包装（'scan' 调用日志 [aId,bId,0|1] 事件流）。
// TailJS/PostJS 以实例方法遮蔽 stub（切片 3/4 域，事件流契约）；三逃离门的 moveUnit 以
//  'mv' [uId, mul] 事件流 stub（移动执行语义属 M-U3h moveUnit 切片——扫描切片契约=选敌/tx·ty/mul 决策）。
// 引擎侧效应（grabbedTick/updateBoat/riseSkeleton/spreadPlague/fx）以事件流捕获。
// 截断契约（对 rng 消耗断点敏感，场景设计须遵守）：
//  ① 批次一场景（S1-S8）单位 panic 注入恒 ≤0.55（contagious 掷骰属扫描段）；扫描场景 S9-S13 解锁；
//  ② civ=-1（isCiv 种族亦然）→ peaceful 职业链整段跳过（L4112 门 u.civ>=0→现 L3937）；
//     扫描场景例外：S12 商队 human civ=1 经 L3641 商队逃离门提前 return，不触达职业域；
//  ③ fireSet/damagedSet 空且单位非消防相关 → 消防域 && 短路零抽；
//  ④ WB.setEnabled(false) → 扫描走 JS 桶路径（WB.active() 分支不译=C# WbBail JS 接力域同构）；
//  ⑤ 扫描场景 enemy 非空时必须经三逃离门（L3641 商队/L3652 fleeT/L3662 恐慌溃逃）或神经域出口（L3694 战或逃 fleeT=40/
//     L3730 姿态脱离 fleeT=50）退出，或敌距 ≥ reach fall-through else 路径；触达 L3739+ 远程/近战哨兵即设计错误。
// 运行：bun scripts/unity-migration/gen-units-update.mjs
// 输出：scripts/unity-migration/golden/units_update.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/units_update.json（双写）
// ============================================================================
import { GameEngine } from '../../src/lib/game/engine.ts';
import { RACES, R, TRAITS, JOBS, BUILDING_DEFS } from '../../src/lib/game/types.ts';
import { WB } from '../../src/lib/wasm/wbspatial.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { ep } from '../../src/lib/game/engineParams.ts';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const W = 256, H = 160;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };

/** IEEE754 小端 16 hex（位模式对账用，禁 epsilon） */
const bitHex = (d) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

WB.setEnabled(false); // 扫描走 JS 桶路径（M-U7m：批次一场景空桶 / 扫描场景 scanReal 布桶——C# WbBail=JS 接力域同构）

// ---- ep 真值随 JSON 分发（C# 不硬编码引擎参数） ----
const EP = { panicDecay: ep('social.panicDecay'), grudgeDecay: ep('social.grudgeDecay'), fireDamage: ep('fire.damage'), panicRout: ep('social.panicRout') };   // panicRout M-U7m 溃逃阈（engineParams L40 默认 0.72）

// ---- 种族挑选（真 RACES 表扫描；位字节随 JSON 回显——C# 零独立打包） ----
const pickRace = (pred, label) => {
  for (const k of Object.keys(RACES)) { const d = RACES[k]; if (pred(d)) return { id: Number(k), label }; }
  throw new Error('race not found: ' + label);
};
const RACE_PICKS = {
  human: pickRace((d) => d.isCiv && !d.flying && !d.aquatic && !d.lavaImmune, 'human'),
  sheep: pickRace((d) => !d.isCiv && !d.hostile && !d.predator && !d.undead && !d.aquatic, 'sheep'),
  wolf: pickRace((d) => d.predator && !d.undead && !d.isCiv && !d.aquatic && !d.flying, 'wolf'),
  kraken: pickRace((d) => d.aquatic && !d.beach, 'aquatic-noBeach'),
  troll: pickRace((d) => Number(d.key === 'troll'), 'troll'),
  demon: pickRace((d) => d.lavaImmune && !d.flying, 'lavaImmune'),
  ww: pickRace((d) => d.key === 'whitewalker', 'whitewalker'),
  bandit: pickRace((d) => d.hostile && !d.isCiv && !d.predator && !d.undead && !d.aquatic && !d.flying, 'bandit'),   // M-U7m S12：hostile×isCiv 敌意分支（RACES 序首命中 BANDIT id4）
  mage: pickRace((d) => d.key === 'mage', 'mage'),                                                                   // M-U7o S18/S20：race 级 rd 消费（types.ts L175 ranged{6.5,18,26}）
  sandworm: pickRace((d) => d.key === 'sandworm', 'sandworm'),                                                       // M-U7p S24：吞噬特技（reach 1.6）
  basilisk: pickRace((d) => d.key === 'basilisk', 'basilisk'),                                                       // M-U7p S22/S23：石化凝视/毒牙（reach 1.4）
  vampire: pickRace((d) => d.key === 'vampire', 'vampire'),                                                          // M-U7p S27：吮血 0.6
  zombie: pickRace((d) => d.undead && !d.flying && !d.aquatic, 'zombie'),                                            // M-U7m S11：L2095 ZOMBIE 对称敌意分支（序首命中 id5）
  bear: pickRace((d) => Number(d.key === 'bear'), 'bear'),                                                           // M-U7n S14/S17：强敌锚（dmg 19 hp 95——RStats 一致）
  dragon: pickRace((d) => Number(d.key === 'dragon'), 'dragon'),                                                     // M-U7q S34/S36：屠龙计数 + 龙息域（L2095 对称敌意 ra!==rb）
};
const packRace = (id) => {
  const d = RACES[id];
  return {
    flags: (d.hostile ? 1 : 0) | (d.isCiv ? 2 : 0) | (d.undead ? 4 : 0) | (d.predator ? 8 : 0) | (d.lavaImmune ? 16 : 0),
    tbf0: (d.flying ? 32 : 0) | (d.aquatic ? 64 : 0) | (d.sandswim ? 128 : 0),
    tbf1: (d.coldBlood ? 4 : 0) | (d.beach ? 8 : 0) | (d.nightsight ? 16 : 0),   // M-U7p：nightsight 位 16（ORC/GOBLIN——L3848 昼战减益豁免；字段只加）
    ranged: d.ranged ?? null,   // M-U7n L3705（MAGE {range 6.5, dmg 18, cd 26}——fixture 种族均 null）
    reach: d.reach ?? null,     // M-U7n L3722/L3774（KRAKEN 2.4 / SANDWORM 1.6 / BASILISK 1.4 / SHARK 1.3——?? 0.9 语义随 C#/镜像）
    speed: d.speed,             // M-U7p L3824 neuroAcc 敏捷差特征（RACES.speed 原值）
  };
};
const raceIds = {};
const raceTable = {};
for (const [k, rp] of Object.entries(RACE_PICKS)) { raceIds[k] = rp.id; raceTable[String(rp.id)] = packRace(rp.id); }
const TRAIT_REGEN = { regeneration: TRAITS.regeneration?.regen ?? 0 };

// ---- 场景地形 spec（def + 矩形补丁，C# 侧同式重建） ----
const mkTerrain = (name, def, patches) => ({ name, def, patches });
const TERRAIN_SPECS = {
  plains: mkTerrain('plains', T.GRASS, []),
  damage: mkTerrain('damage', T.GRASS, [
    [10, 10, 12, 12, T.GRASS],   // u0 火格站区（fire 注入）
    [20, 10, 22, 12, T.GRASS],   // u1 辐射格站区
    [30, 10, 32, 12, T.LAVA],    // u2/u3 岩浆站区
    [40, 10, 42, 12, T.WATER],   // u4 溺水站区
    [50, 10, 52, 12, T.GRASS],   // u5 水生窒息站区（陆格）
  ]),
  wwfield: mkTerrain('wwfield', T.GRASS, [
    [61, 57, 62, 58, T.FOREST],  // (61,57) 森林（0.4 门）——抽签可达域 x[61,64)y[57,60) 内
    [62, 57, 63, 58, T.WATER],   // (62,57) 水面（0.5 门 + 踏冰 0.6）
    [62, 58, 63, 59, T.BURNT],   // (62,58) 脚下焦土 → 直接转 SNOW
    [63, 58, 64, 59, T.SAND],    // (63,58) 沙 → 转 SNOW + 火格灭火（fire 注入）
  ]),
};

// ---- 单位构造（null ≡ undefined；traitRegen 已由真 TRAITS 表解析为数值） ----
let nextId = 1;
const U = (o) => ({
  id: o.id ?? nextId++,
  race: o.race, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
  age: o.age ?? 20, maxAge: o.maxAge ?? 55,
  hp: o.hp ?? 100, maxHp: o.maxHp ?? 100,
  hurt: o.hurt === undefined ? null : o.hurt, cd: o.cd ?? 0, atk: o.atk ?? 0,
  chill: o.chill === undefined ? null : o.chill,
  fleeT: o.fleeT ?? 0, bless: o.bless ?? 0, curse: o.curse ?? 0,
  fert: o.fert ?? 0, detour: o.detour ?? 0,
  panic: o.panic === undefined ? null : o.panic,
  gids: o.gids === undefined ? null : o.gids, gval: o.gval === undefined ? null : o.gval,
  food: o.food === undefined ? null : o.food,
  stk: o.stk === undefined ? null : o.stk,
  sxk: o.sxk === undefined ? null : o.sxk, syk: o.syk === undefined ? null : o.syk,
  infected: !!o.infected, grab: o.grab ?? 0, boat: o.boat ?? 0,
  caravan: o.caravan ?? 0,   // M-U7m L3641 商队门（TS Unit.caravan ?? 0 语义）
  dmg: o.dmg === undefined ? null : o.dmg,   // M-U7n 战斗域 myPow/foePow（TS undefined→null；snapU 条件对账）
  kills: o.kills ?? 0,       // M-U7n F_FLIGHT[8]/F_STANCE[11]（TS Unit.kills spawn 初值 0）
  civ: o.civ ?? -1, job: o.job ?? 0, flip: !!o.flip,
  king: o.king ?? 0, breath: o.breath === undefined ? null : o.breath, fam: o.fam === undefined ? null : o.fam,   // M-U7q 击杀链（弑君/龙息/家族谱系——undefined 恒 null 非触发单位）
  trait: o.trait === undefined ? null : o.trait,   // trait 字符串（TS 侧 TRAITS 表查 regen 用；C# 用 traitRegen 数值）
  traitRegen: o.trait === undefined ? 0 : (TRAIT_REGEN[o.trait] ?? 0),
});
const mkTsUnit = (spec) => {
  const u = { id: spec.id, race: spec.race, x: spec.x, y: spec.y, tx: spec.tx, ty: spec.ty };
  if (spec.age !== undefined) u.age = spec.age;
  if (spec.maxAge !== undefined) u.maxAge = spec.maxAge;
  if (spec.hp !== undefined) u.hp = spec.hp;
  if (spec.maxHp !== undefined) u.maxHp = spec.maxHp;
  if (spec.hurt !== null) u.hurt = spec.hurt; // null ≡ undefined——TS Math.max(undefined,2)=NaN 怪癖保持
  if (spec.cd !== undefined && spec.cd !== null) u.cd = spec.cd;   // M-U7o：cd=0 显式落位（真实 spawn 单位 cd 恒定义——L3742/L3757 u.cd<=0 门依赖；旧 falsy 丢弃致远程域永不施法）
  if (spec.atk) u.atk = spec.atk;
  if (spec.chill !== null) u.chill = spec.chill;
  if (spec.fleeT) u.fleeT = spec.fleeT;
  if (spec.bless) u.bless = spec.bless;
  if (spec.curse) u.curse = spec.curse;
  if (spec.fert) u.fert = spec.fert;
  if (spec.detour) u.detour = spec.detour;
  if (spec.panic !== null) u.panic = spec.panic;
  if (spec.gids !== null) { u.gIds = [...spec.gids]; u.gVal = [...spec.gval]; }
  if (spec.food !== null) u.food = spec.food;
  if (spec.infected) u.infected = true;
  if (spec.grab) u.grab = spec.grab;
  if (spec.boat) u.boat = spec.boat;
  if (spec.caravan) u.caravan = spec.caravan;   // M-U7m L3641（TS undefined ?? 0 语义→默认不设）
  if (spec.dmg !== null && spec.dmg !== undefined) u.dmg = spec.dmg;   // M-U7n（undefined 保持——战斗域消费）
  u.kills = spec.kills;                          // M-U7n（spawn 初值 0 镜像）
  u.civ = spec.civ; u.job = spec.job; u.flip = spec.flip;
  if (spec.trait !== null && spec.trait !== undefined) u.trait = spec.trait; // 真 TRAITS 表键——TS 再生路径查表依赖
  if (spec.king) u.king = spec.king;                                                     // M-U7q 弑君域 L1177（witnessDeath king 分支）
  if (spec.breath !== null && spec.breath !== undefined) u.breath = spec.breath;         // M-U7q 龙息域 L3973（undefined→NaN 门永不触达——非龙单位天然）
  if (spec.fam !== null && spec.fam !== undefined) u.fam = spec.fam;                     // M-U7q 家族战功 L3925（case2 谱系域镜像）
  return u;
};
const snapU = (u) => ({
  age: bitHex(u.age), hp: bitHex(u.hp), maxAge: bitHex(u.maxAge), maxHp: bitHex(u.maxHp),
  // hurt 不 ?? 0：undefined 保持 null——TS Math.max(undefined,2)=NaN 怪癖的位精确镜像（C# JsMax(NaN,·)=NaN 同构）
  hurt: u.hurt === undefined ? null : bitHex(u.hurt), cd: bitHex(u.cd ?? 0), atk: bitHex(u.atk ?? 0),
  chill: u.chill === undefined ? null : bitHex(u.chill),
  fleeT: bitHex(u.fleeT ?? 0), bless: bitHex(u.bless ?? 0), curse: bitHex(u.curse ?? 0),
  fert: bitHex(u.fert ?? 0), detour: bitHex(u.detour ?? 0),
  panic: u.panic === undefined ? null : bitHex(u.panic),
  gids: u.gIds === undefined ? null : u.gIds.join(','),
  gval: u.gVal === undefined ? null : u.gVal.map(bitHex).join(','),
  food: u.food === undefined ? null : bitHex(u.food),
  stk: u.stk === undefined || u.stk === 0 ? 0 : u.stk,
  sxk: u.sxk === undefined ? null : bitHex(u.sxk),
  syk: u.syk === undefined ? null : bitHex(u.syk),
  infected: !!u.infected, dead: !!u.dead, grab: u.grab ?? 0, boat: u.boat ?? 0,
  caravan: u.caravan ?? 0,   // M-U7m 商队镜像（snapU 字段只加）
  dmg: u.dmg === undefined ? null : bitHex(u.dmg),   // M-U7n 战斗域（undefined→null 条件对账）
  kills: u.kills ?? 0,       // M-U7n（spawn 初值 0）
  race: u.race, civ: u.civ,                            // M-U7q 击杀链（zombify 原地转种——snapU 字段只加；镜像侧/transcript 同位同序）
  speed: u.speed === undefined ? null : bitHex(u.speed),   // M-U7q zombify speed=0.05 L4328（undefined→null——C# speedN 镜像）
  breath: u.breath === undefined ? null : bitHex(u.breath),   // M-U7q 龙息域 L3973（undefined→null——C# breathN 镜像）
  king: !!u.king,                                       // M-U7q 弑君域（zombify king=false 写点）
  x: bitHex(u.x), y: bitHex(u.y), tx: bitHex(u.tx), ty: bitHex(u.ty),
});
// ---- stub 引擎：updateUnit 前置段 + 哨兵面 ----
function makeStubEng(env, cap) {
  const eng = Object.create(GameEngine.prototype);
  eng.terrain = new Uint8Array(W * H);
  eng.fire = new Uint8Array(W * H);
  eng.radiate = new Uint8Array(W * H);
  eng.fireSet = new Set(env.fireSet ?? []);
  eng.damagedSet = new Set();
  eng.buildings = []; eng.bIdx = new Map();   // M-U7r：buildings/bIdx 桩面真实现化（fireNear/nearestBuildingOf/warTarget 消费）
  // M-U7r：civs 数组化（civAtWar L2017 for..of 迭代——对象键升序映射数组位，indexed 访问 civs[id] 同构；S33 弑君域 indexed 面不受影响）
  eng.civs = env.civs ? Object.keys(env.civs).sort((a, b) => Number(a) - Number(b)).map((k) => env.civs[k]) : [];
  eng.bw = W / 4; eng.bh = H / 4;
  eng.buckets = Array.from({ length: eng.bw * eng.bh }, () => []);
  eng.laws = { undeadRise: env.lawsRise, zombieInfect: env.zombInf ?? true };   // M-U7q：zombieInfect L3905 门（默认 true——types.ts DEFAULT_LAWS）
  eng.fxPrefs = { get ambience() { return env.ambience; } };
  eng.fx = (kind, x, y, ttl) => cap.fx.push({ k: kind, x: bitHex(x), y: bitHex(y), ttl });
  eng.grabbedTick = (u) => cap.evt.push(['grab', u.id]);
  eng.updateBoat = (u) => cap.evt.push(['boat', u.id]);
  eng.riseSkeleton = (x, y) => cap.evt.push(['rise', bitHex(x), bitHex(y)]);
  eng.spreadPlague = (u) => cap.evt.push(['plague', u.id]);
  eng.gearBonus = () => ({ regen: env.gearRegen ?? 0, crit: 0, armor: 0, lifesteal: 0, thorns: 0, speed: 1, ranged: 0 });
  eng.setTerrain = (i, t) => { if (eng.terrain[i] === t) return; const old = eng.terrain[i]; eng.terrain[i] = t; cap.terr.push([i, old, t]); };
  // —— 扫描/尾段哨兵（场景契约：批次一场景桶空不触达；触达即设计错误） ——
  //  M-U7m：env.scanReal 时改挂原型真实现包装（'scan' [aId,bId,0|1] 调用日志事件流——
  //  isEnemyFast/isEnemy 走 GameEngine.prototype 原实现，LUT/dynRaces/rel 供真字段）
  if (env.scanReal) {
    eng.enemyLut = new Map(); eng.dynRaces = new Map(); eng.rel = new Map();   // isEnemyFast L2068 LUT + isEnemy L2124/L2061 依赖面
    eng.isEnemyFast = (a, b) => {
      const v = GameEngine.prototype.isEnemyFast.call(eng, a, b);
      cap.scan.push([a.id, b.id, v ? 1 : 0]);
      return v;
    };
    eng.moveUnit = (u2, mul) => cap.evt.push(['mv', u2.id, mul]);              // 三逃离门 moveUnit stub（'mv' 事件——执行语义属 M-U3h 切片）
  } else {
    eng.isEnemyFast = () => { throw new Error('SCAN_SENTINEL: buckets should be empty'); };
  }
  // —— M-U7o 远程域 cast 弹道接缝（弹道实体生成属 projectiles 未译域——调用面事件捕获 'fb'/'ar'/'bm'/'bl'；leadAim 真实现直调：纯数学 + 实例 rng 2 掷）——
  eng.castFireball = (u2, tx, ty, dmg) => cap.evt.push(['fb', u2.id, bitHex(tx), bitHex(ty), bitHex(dmg)]);
  eng.castArrow = (u2, tx, ty, dmg) => cap.evt.push(['ar', u2.id, bitHex(tx), bitHex(ty), bitHex(dmg)]);
  eng.castBeam = (u2, tx, ty, dmg) => cap.evt.push(['bm', u2.id, bitHex(tx), bitHex(ty), bitHex(dmg)]);
  eng.castBullet = (u2, tx, ty, dmg) => cap.evt.push(['bl', u2.id, bitHex(tx), bitHex(ty), bitHex(dmg)]);
  // —— M-U7p 近战域接缝（击杀链 L3900+ 未触达——早退特技路径；文本含命名域只对账 kind/pos）——
  eng.addEvent = (kind, text, pos) => cap.evt.push(['ev', kind, bitHex(pos?.x), bitHex(pos?.y)]);
  eng.addCorpse = (x, y, bone, petrified) => cap.evt.push(['corpse', bitHex(x), bitHex(y), bone ? 1 : 0, petrified ? 1 : 0]);
  eng.wallDefenseOf = () => 1;                                   // fixtures 无建筑——城墙域中性 1
  eng.dayPhase = () => env.dayPhase ?? 0;                        // 昼相时钟域——场景注入（dusk 窗口 0.5..0.9）
  eng.tickCount = 0;                                             // activeBattles 值 = tickCount+30（恒 30）
  eng.activeBattles = { set: (k, v) => cap.evt.push(['ab', k, v]), size: 0, delete: () => {}, *[Symbol.iterator]() {} };   // 桩面捕获 set；size<64 剩余修剪循环不触
  eng.updateUnitTailJS = (u) => { cap.evt.push(['tail', u.id]); return false; };
  eng.updateUnitPostJS = (u) => { cap.evt.push(['post', u.id]); };
  // —— M-U7q 击杀链·龙息域真实现依赖面（zombify/witnessDeath/addGrudge/onKingDeath/onWarKill/dragonBreath/ignite 走原型真实现；置尾——scanReal rel 建图后 relInit 再注入）——
  eng.building = new Uint8Array(W * H);                          // L782 building: Uint8Array（ignite L1075 建筑门——fixtures 无建筑恒 0）
  eng.wildCount = new Map();                                     // L1083 bumpWild 账本（zombify +1 真实现；无 dump 面——C# BumpWild 同构不译对账）
  eng.statDragonsSlain = 0;                                      // L229 屠龙计数（L3940 ++ 写点——post dump 对账面）
  eng.rel = new Map(); eng.tension = new Map(); eng.warShame = new Map();   // L1186-1188 弑君之仇三账本（relInit env 注入）
  for (const [k, v] of Object.entries(env.relInit ?? {})) eng.rel.set(k, v);
  eng.warData = new Map(Object.entries(env.warData ?? {}));      // L7235 战争档案（addWarScore 消费——无 entry 恒和）
  eng.worldWar = { phase: 'idle', belligerents: [], kills: 0 };  // L8711 wwCountKill 大战域（idle 直退——C# WbCivSim.WwCountKill 同构）
  eng.armies = env.armies ?? []; eng.directives = env.directives ?? [];      // L7254/L7258 军团/旨意
  eng.families = new Map(Object.entries(env.families ?? {}).map(([k, v]) => [Number(k), { ...v }]));   // L3926 家族战功（rf.kills/heroes 写点——post dump 对账面）
  eng.techModCache = new Map(); eng.emTechs = new Map();   // L4861/L4866 techModsOf 缓存面（S33 首触 L3707 bowRange——civ>=0 isCiv 场景；c.techs 空→NEUTRAL_MODS 零掷）
  // —— M-U7r peaceful 职业域真实现依赖面（fireNear/extinguishFire/damagedNear/repairBuilding/nearestBuildingOf/warTarget/civAtWar/attackBuilding 走原型真实现）——
  eng.owner = new Int16Array(W * H).fill(-1);                    // L161 owner（Int16Array fill(-1)——fireNear own 领土判定消费面）
  eng.bHp = new Map();                                           // bHp Map（attackBuilding/repairBuilding 耐久账——bld/dmg 夹具写入）
  eng.firesOut = 0;                                              // L637 灭火统计（extinguishFire ++ 写点）
  eng.repairsDone = 0;                                           // L639 修缮统计（repairBuilding ++ 写点）
  eng.lastFireOutEventTick = -2400;                              // L641 灭火播报节流（engine ctor 初值）
  eng.lastRepairEventTick = -2400;                               // L643 修缮播报节流
  return eng;
}

// ---- M-U7r peaceful 职业域夹具施加（probe 与主循环共用——bld/dmg/owner/统计节流阀属黄金基线） ----
const applyPeaceFixtures = (eng, env) => {
  for (const [k, v] of Object.entries(env.fireInit ?? {})) {   // 火场夹具（主循环 L895 原样语义——幂等双施；probe 侧首施）
    const [x, y] = k.split(',').map(Number); eng.fire[y * W + x] = v; eng.fireSet.add(y * W + x);
  }
  for (const [k, v] of Object.entries(env.radiateInit ?? {})) {
    const [x, y] = k.split(',').map(Number); eng.radiate[y * W + x] = v;
  }
  for (const [tile, kind, civ] of env.bldInit ?? []) {
    eng.building[tile] = kind;                                    // L782 building: Uint8Array（tile → kind）
    eng.bIdx.set(tile, eng.buildings.length);                     // bIdx tile→buildings 序（mkBuilding0 L130 同构）
    eng.buildings.push({ i: tile, x: tile % W, y: (tile / W) | 0, kind, civ });   // engine Building L1573 push 面同构
    eng.bHp.set(tile, Math.round((BUILDING_DEFS[kind]?.hp ?? 70) * 1));           // buildBuilding bHp 初值同构
  }
  for (const [tile, hp] of Object.entries(env.dmgInit ?? {})) { eng.damagedSet.add(Number(tile)); eng.bHp.set(Number(tile), hp); }   // damagedSet 登记 + 耐久损态
  for (const [tile, civ] of Object.entries(env.ownerInit ?? {})) eng.owner[Number(tile)] = civ;   // 领土（fireNear own 判定——远火响应门）
  if (env.firesOutInit != null) eng.firesOut = env.firesOutInit;   // 灭火播报节流阀（fireOut 事件门 ≥3）
  if (env.repairsInit != null) eng.repairsDone = env.repairsInit;  // 修缮播报节流阀（repair 事件门 ≥6）
};

// ---- 地形重建（def + 矩形补丁；CASES 求值前定义——S5 种子寻优依赖） ----
const buildGrid = (spec) => {
  const g = new Uint8Array(W * H).fill(spec.def);
  for (const [x1, y1, x2, y2, t] of spec.patches)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) g[y * W + x] = t;
  return g;
};

// ---- S5 白行者种子寻优辅助（Task 138 龙卷先例：60 拍完整迷你仿真找多分支双命中种子） ----
const WW_STEPS = 60;
const wwMut = (i, u) => {
  if (i === 30) u.y = 57.3;               // 踏水（(62,57) WATER）→ 踏冰 0.6 门
  if (i === 45) { u.x = 61.5; u.y = 57.5; } // 入森林脚下（(61,57) FOREST）→ 0.4 门激活域
};
const findWwSeed = () => {
  for (let s = 1; s < 3000; s++) {
    const cap = { fx: [], evt: [], terr: [] };
    const eng = makeStubEng({ lawsRise: false, ambience: false, gearRegen: 0, fireSet: [63 * W + 58] }, cap);
    eng.terrain.set(buildGrid(TERRAIN_SPECS.wwfield));
    eng.fire[58 * W + 63] = 200; eng.fireSet.add(58 * W + 63);
    const u = mkTsUnit({ ...U({ id: 1, race: RACE_PICKS.ww.id, x: 62.5, y: 58.5, hp: 200, maxHp: 200, civ: -1 }), race: RACE_PICKS.ww.id });
    const raw = mulberry32(s); eng.rng = () => raw();
    let forest = false, ice = false, kill = false;
    for (let i = 0; i < WW_STEPS; i++) {
      wwMut(i, u);
      const t0 = cap.terr.length;
      eng.updateUnit(u);
      for (const [idx, oldT, newT] of cap.terr.slice(t0)) {
        if (newT === T.SNOW && oldT === T.FOREST) forest = true;
        if (newT === T.ICE) ice = true;
      }
      if (eng.fire[58 * W + 63] === 0) kill = true;
    }
    if (forest && ice && kill) return s;
  }
  throw new Error('no ww seed found (forest+ice+kill)');
};
const WW_SEED = findWwSeed();

// ---- 场景定义（mut 注入随 JSON 回显——C# 按 cfg 复现，规则化注入可审计） ----
// 种子寻优辅助：扫描种子使指定步的指定抽落入门内
const findSeed = (probe, lo, hi) => {
  for (let s = lo; s <= hi; s++) if (probe(s)) return s;
  throw new Error('no seed found in range');
};

// ---- M-U7p 近战种子寻优（findWwSeed 同款：桩面迷你仿真按事件签名搜种子） ----
const meleeProbe = (spec) => {
  let lastCap = null, lastUnits = null;
  for (let s = spec.lo ?? 1; s < (spec.hi ?? 5000); s++) {
    const cap = { fx: [], evt: [], terr: [], scan: [] };
    // M-U7r：env 每种子深拷贝（pristine 协议对齐主循环 envEcho——S47 实证：probe env 与场景 env 是两个字面量，
    //  引擎原地改写 civs.gold 等累积态跨种子污染 probe 环境 → 假绿种子与 main 落盘分歧）
    const env = { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true, ...(spec.env ? JSON.parse(JSON.stringify(spec.env)) : {}) };
    const eng = makeStubEng(env, cap);
    eng.terrain.set(buildGrid(TERRAIN_SPECS[spec.terrain ?? 'plains']));
    applyPeaceFixtures(eng, env);   // M-U7r peaceful 域夹具（probe 与主循环同源）
    const units = spec.units.map((o, i) => mkTsUnit({ ...o, id: o.id ?? i + 1, race: raceIds[o.race] ?? o.race }));
    eng.units = units;   // M-U7q：witnessDeath 弑君分支遍历 this.units（eng.units 桩面必挂——主循环 L719 同构）
    for (const u of units) eng.buckets[((u.y / 4) | 0) * eng.bw + ((u.x / 4) | 0)].push(u);
    const raw = mulberry32(s); eng.rng = () => raw();
    for (let st = 0; st < (spec.steps ?? 1); st++) for (const u of units) if (!u.dead) eng.updateUnit(u);
    lastCap = cap; lastUnits = units;
    if (spec.dbg) console.error('dbg s=' + s, 'evt:', JSON.stringify(cap.evt), 'scan:', JSON.stringify(cap.scan), 'fx:', cap.fx.map((f) => f.k), 'units:', units.map((u) => ({ race: u.race, dead: !!u.dead, inf: !!u.infected, hp: u.hp, fleeT: u.fleeT })));
    if (spec.want(cap, units, eng)) return s;
  }
  console.error('probe-diag evt:', JSON.stringify(lastCap?.evt), 'fx:', lastCap?.fx.map((f) => f.k), 'units:', lastUnits?.map((u) => ({ dead: u.dead, inf: !!u.infected, hp: u.hp, fleeT: u.fleeT })));
  throw new Error('no melee seed found: ' + (spec.label ?? '?'));
};

const CASES = [
  // S1 core-timers：计时器全家桶 + 卡死自愈 + fx 门（panic≤0.55 契约、civ=-1 契约）
  {
    name: 'core-timers', terrain: 'plains', seed: 20261026,
    env: { lawsRise: false, ambience: true, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 120.5, y: 80.5, tx: 150.5, ty: 95.5, age: 20, maxAge: 55, hp: 50, maxHp: 100,
          hurt: 3, cd: 4, atk: 2, fleeT: 6, bless: 8, curse: 6, fert: 6, detour: 8,
          panic: 0.5, gids: [101, 102], gval: [0.5, 1.2], civ: -1 }),
    ],
    steps: 64,
  },
  // S2 aging-death：衰老门 + undeadRise 8% 门（种子寻优保证 u0 首拍命中 riseSkeleton）
  {
    name: 'aging-death', terrain: 'plains', seed: findSeed(
      (s) => { const r = mulberry32(s); return r() < 0.08; }, 1, 5000),
    env: { lawsRise: true, ambience: false, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 30.5, y: 30.5, age: 54.96, maxAge: 55, civ: -1 }),   // u0：1 拍后过阈 → 0.08 门首抽命中 → riseSkeleton + dead
      U({ race: 'human', x: 40.5, y: 30.5, age: 54.96, maxAge: 55, civ: -1 }),   // u1：同拍第二抽（≥0.08 概率大）→ 首拍幸存，次拍再掷
      U({ race: 'sheep', x: 50.5, y: 30.5, age: 54.96, maxAge: 55, civ: -1 }),   // u2：非 civ → 短路 0 抽直接死
      U({ race: 'human', x: 60.5, y: 30.5, age: 20, maxAge: 55, civ: -1 }),      // u3：低龄对照（全程存活）
    ],
    steps: 6,
  },
  // S3 terrain-damage：火/辐射/岩浆/溺水/窒息五连 + lavaImmune 免疫 + 死门触发
  {
    name: 'terrain-damage', terrain: 'damage', seed: 31337,
    env: { lawsRise: false, ambience: false, gearRegen: 0,
           fireInit: { '11,11': 200, '11,21': 1 }, radiateInit: { '11,21': 9 } },
    units: [
      U({ race: 'human', x: 11.5, y: 11.5, hp: 8, maxHp: 100, civ: -1 }),   // u0：火 3/拍 → 3 拍死（8→5→2→-1）
      U({ race: 'human', x: 21.5, y: 11.5, hp: 60, maxHp: 100, civ: -1 }),  // u1：火 3 + 辐射 0.5 → 持续掉血
      U({ race: 'human', x: 31.5, y: 11.5, hp: 30, maxHp: 100, civ: -1 }),  // u2：岩浆 15/拍 → 2 拍死
      U({ race: 'demon', x: 31.5, y: 10.5, hp: 100, maxHp: 100, civ: -1 }), // u3：lavaImmune → 岩浆/火双免
      U({ race: 'human', x: 41.5, y: 11.5, hp: 20, maxHp: 100, civ: -1 }),  // u4：溺水 4/拍 → 5 拍死
      U({ race: 'kraken', x: 51.5, y: 11.5, hp: 100, maxHp: 100, civ: -1 }),// u5：水生窒息 0.02/拍 hurt2
    ],
    steps: 8,
  },
  // S4 regen-food：再生三源（troll 天生/trait/civ 装备注入）+ 捕食者断粮账本
  {
    name: 'regen-food', terrain: 'plains', seed: 606,
    env: { lawsRise: false, ambience: false, gearRegen: 0.1 },
    units: [
      U({ race: 'troll', x: 70.5, y: 70.5, hp: 40, maxHp: 100, civ: -1 }),              // u0：0.35/拍回满
      U({ race: 'human', x: 80.5, y: 70.5, hp: 30, maxHp: 100, trait: 'regeneration', civ: -1 }), // u1：0.3+0.1 双源
      U({ race: 'wolf', x: 90.5, y: 70.5, hp: 100, maxHp: 100, food: 75, civ: -1 }),    // u2：75 拍耗尽 → 1.4/拍断粮
      U({ race: 'sheep', x: 100.5, y: 70.5, hp: 99.4, maxHp: 100, civ: -1 }),           // u3：非 civ 非 troll 无再生（gearBonus 不调）
    ],
    steps: 90,
  },
  // S5 whitewalker：寒霜灵气多分支（0.08 门 + 坐标 2 抽 + FOREST 0.4/水面 0.5/踏冰 0.6 条件抽）
  //    种子寻优（上方 findWwSeed）：FOREST 0.4 门 + 踏冰 0.6 门 + 火格灭火三命中
  {
    name: 'whitewalker', terrain: 'wwfield', seed: WW_SEED,
    env: { lawsRise: false, ambience: false, gearRegen: 0, fireSet: [58 * W + 63], terrainTrack: true,
           fireInit: { '63,58': 200 } },
    units: [
      U({ race: 'ww', x: 62.5, y: 58.5, hp: 200, maxHp: 200, civ: -1 }),
    ],
    steps: WW_STEPS,
    stepsArr: (() => {
      const a = Array.from({ length: WW_STEPS }, () => null);
      a[30] = { slot: 0, mut: { y: 57.3 } };               // 踏水（(62,57) WATER）→ 踏冰 0.6 门
      a[45] = { slot: 0, mut: { x: 61.5, y: 57.5 } };      // 入森林脚下（(61,57) FOREST）→ 0.4 门激活域
      return a;
    })(),
  },
  // S6 infection：感染掉血 + spreadPlague 0.02 门（种子寻优 ≥2 次命中——感染门每拍必 1 抽）
  {
    name: 'infection', terrain: 'plains', seed: findSeed((s) => {
      const r = mulberry32(s); let hits = 0;
      for (let i = 0; i < 100; i++) if (r() < 0.02) hits++;
      return hits >= 3;
    }, 1, 5000),
    env: { lawsRise: false, ambience: false, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 140.5, y: 90.5, hp: 80, maxHp: 100, infected: true, civ: -1 }),
    ],
    steps: 100,
  },
  // S7 panic-grudge：恐慌衰减至 undefined + 血仇 splice 中段移除 + 空表全清
  {
    name: 'panic-grudge', terrain: 'plains', seed: 777,
    env: { lawsRise: false, ambience: false, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 150.5, y: 100.5, tx: 180.5, ty: 110.5, panic: 0.5, gids: [7, 8, 9], gval: [0.25, 0.3, 0.35], civ: -1 }),
      U({ race: 'human', x: 160.5, y: 100.5, gids: [], gval: [], civ: -1 }),  // u1：空表首拍全清 undefined
    ],
    steps: 30,
  },
  // S8 grab-boat：神之手指分流（hurt-- 先行 / age 冻结） + 殖民船分流（age 冻结）
  {
    name: 'grab-boat', terrain: 'plains', seed: 88,
    env: { lawsRise: false, ambience: false, gearRegen: 0 },
    units: [
      U({ race: 'human', x: 170.5, y: 110.5, age: 21, hp: 90, hurt: 2, grab: 3, civ: -1 }),
      U({ race: 'human', x: 180.5, y: 110.5, age: 22, boat: 1, civ: -1 }),
    ],
    steps: 3,
  },
  // ================= M-U7m 批次二·扫描域（S9-S13；契约⑤：enemy 非空必经三逃离门退出） =================
  // S9 scan-select-flee：捕食者索敌最近选敌（无血仇 cull 路径 d2>=bestD² 跳过）+ fleeT 脱离门（panic null → 1.18）
  {
    name: 'scan-select-flee', terrain: 'plains', seed: 20261031,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'wolf', x: 30.5, y: 30.5, fleeT: 8, civ: -1 }),   // u0：捕食者——L3615 索敌 u1（d=1）→ L3620 cull u2（d=3≥bestD²=1）→ L3652 flee 门 tx/ty+1.18
      U({ race: 'sheep', x: 31.5, y: 30.5, civ: -1 }),            // u1：猎物（isEnemyFast LUT：predator×isHerbivoreRace）
      U({ race: 'sheep', x: 33.5, y: 30.5, civ: -1 }),            // u2：次近猎物（L3620 无血仇 cull 实证——不入选）
    ],
    steps: 2,
  },
  // S10 grudge-rout：血仇加权选敌（舍近求远——gVal 2.0 → wd=d×(1-0.42×min(1,gVal/2)) 反超近敌）+ 恐慌传染（狼群同伴 ally 支路）+ 溃逃门
  //    种子钉 rng<0.2（contagious=true）；gVal 血仇消磨 L3508 先于扫描（2.0→1.994，位精确随回放）；
  //    显式 id（gids [3] 引用 u2——自增 id 跨场景漂移，血仇记录必须钉 id）；
  //    传染受害者 = 狼群同伴 u4（wolf-wolf ally 支路——sheep 是 enemy 支路不传染 L3629）+ fleeT 门退出
  {
    name: 'grudge-rout', terrain: 'plains', seed: findSeed((s) => mulberry32(s)() < 0.2, 1, 5000),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ id: 1, race: 'wolf', x: 50.5, y: 70.5, panic: 0.8, gids: [3], gval: [2.0], civ: -1 }),  // u0：血仇记录 [id3]——L3624-3628 加权后 wd(远仇 3.162)≈1.838 < wd(近敌 2) → 选仇敌；L3662 溃逃 1.3 → 次拍 fleeT 门 1.32
      U({ id: 2, race: 'sheep', x: 52.5, y: 70.5, civ: -1 }),                                     // u1：近敌（id2，无血仇记录 → wd=d=2）——else 路径
      U({ id: 3, race: 'sheep', x: 53.5, y: 71.5, civ: -1 }),                                     // u2：远仇敌（id3）——加权胜出（enemy=u2，tx≈45.757 非 45.5）
      U({ id: 4, race: 'wolf', x: 51.5, y: 71.5, fleeT: 8, civ: -1 }),                            // u3：狼群同伴——u0 桶序首遇（ally 支路）→ 传染 panic=0.3168 → 自身 fleeT 门 1.18×2 拍
    ],
    steps: 2,
  },
  // S11 undead-terror：ZOMBIE 对称敌意分支（L2095 a/b 双向 return a.race!==b.race）+ 溃逃门（生者）/ fleeT 门（亡者——undead 被 L3662 排除）
  {
    name: 'undead-terror', terrain: 'plains', seed: 314159,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'human', x: 70.5, y: 70.5, panic: 0.8, civ: -1 }),     // u0：见僵尸 → L2095 敌意 → L3662 溃逃 1.3（army null / 非 undead）→ 次拍 L3652 fleeT 门 1.32（panic≥0.5）
      U({ race: 'zombie', x: 71.5, y: 70.5, fleeT: 8, civ: -1 }),      // u1：L2095 对称分支（a.race===ZOMBIE）→ enemy → 溃逃门被 undead 排除 → L3652 fleeT 门 1.18×2 拍
    ],
    steps: 2,
  },
  // S12 caravan-flee：商队遇敌夺路而逃（L3641 门——caravan>0 优先于 fleeT/溃逃）+ hostile×isCiv 敌意分支 + 溃逃门
  {
    name: 'caravan-flee', terrain: 'plains', seed: 271828,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'human', x: 110.5, y: 110.5, caravan: 1, civ: 1 }),  // u0：满载行商（civ=1）——isEnemy(bandit hostile×human isCiv) → L3641 商队门 tx/ty+1.15（不触达 L3937 职业域哨兵——契约⑤'）
      U({ race: 'bandit', x: 111.5, y: 110.5, panic: 0.8, civ: -1 }),// u1：劫匪（hostile）→ 敌意成立 → L3662 溃逃 1.3
    ],
    steps: 2,
  },
  // S13 allies-cull：同族 ally 计数 + 敌群计数（foes++ 先于 cull——d≥7 敌入选失败仍计入）+ contagious 掷骰 false 路径（rng≥0.2 零写入）
  //    u3 wolf 位于 u0 桶邻域但 d=7.07≥7（cull）且不在 u1/u2 桶邻域（d≥7 cull 或桶外）——敌方零入选，全员经 else 路径退出
  {
    name: 'allies-cull', terrain: 'plains', seed: findSeed((s) => mulberry32(s)() >= 0.2, 1, 5000),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'sheep', x: 130.5, y: 70.5, panic: 0.8, civ: -1 }),  // u0：panic 0.792>0.55 → contagious 掷骰（钉 ≥0.2 → false 零写入）；enemy=null（u3 cull）→ 溃逃门不触发（L3662 需 enemy）→ else 路径
      U({ race: 'sheep', x: 127.5, y: 70.5, civ: -1 }),              // u1：同族 ally（cell 31——u3 桶邻域外）
      U({ race: 'sheep', x: 126.5, y: 73.5, civ: -1 }),              // u2：同族 ally（cell 31——u3 桶邻域外）
      U({ race: 'wolf', x: 135.5, y: 75.5, civ: -1 }),               // u3：敌（cell 33,18）——u0 视角 foes++ 后 d²=50≥49 cull；u3 视角 u0 同样 cull、u1/u2 桶外 → enemy=null → else 路径
    ],
    steps: 2,
  },
  // ================= M-U7n 批次三甲·神经决策域（S14-S17；L3671-3738 神经 + L3964-3967 追击尾；契约：远程/弓/近战/风筝体哨兵不可达） =================
  //  敌选约束实证：狼只看食草动物（isEnemy predator×isHerbivore——熊非猎物非敌对，视野零敌）→ 强敌场景改羊/僵尸/野人对
  // S14 flight-flee：残血狼（dmg 0.2 hp 2）vs 羊 → neuroFlight=1（F[0]=0.02 + F[2]=0.45/3.45=0.130）→ L3694 fleeT=40 + 'mv' 1.2 → 次拍 L3652 fleeT 门 1.18
  {
    name: 'flight-flee', terrain: 'plains', seed: 404,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'wolf', x: 150.5, y: 80.5, hp: 2, maxHp: 100, dmg: 0.2, civ: -1 }),  // u0：残血狼（fixture dmg 低设——网络输入驱动；food 账本 69→F[1]=0.569）
      U({ race: 'sheep', x: 152.5, y: 80.5, hp: 16, maxHp: 16, dmg: 1, civ: -1 }),   // u1：羊（isEnemy predator×isHerbivore=唯一可见敌；F[5]=1）
    ],
    steps: 2,
  },
  // S15 stance-retreat：重伤野人（dmg 2 hp 5）vs 僵尸 → flight 块 isCiv 非敌对跳过（L3674 门）→ neuroStance=3 伤重脱离（F[10]=1 isCiv + F[7]=0.183）→ fleeT=50 + 'mv' 1.15
  //    gearBonus(u).ranged 消费（L3707 isCiv 短路入——gen stub ranged:0；C# GearBonusHook 置换）；僵尸自身 undead→flight 排除→stance0→追击
  {
    name: 'stance-retreat', terrain: 'plains', seed: 415,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'human', x: 160.5, y: 80.5, hp: 5, maxHp: 100, dmg: 2, civ: -1 }),   // u0：重伤野人
      U({ race: 'zombie', x: 162.5, y: 80.5, hp: 46, maxHp: 46, dmg: 6, civ: -1 }),  // u1：僵尸（L2095 对称敌意）
    ],
    steps: 2,
  },
  // S16 stance-chase：满血狼 vs 羊 → neuroFlight=0 死战 + neuroStance=0 追击接敌 → 无 rd/bow/近战（d=2≥0.9）→ L3964 追击尾：tx/ty=敌位 + 'mv' 1.25 ×2 拍
  {
    name: 'stance-chase', terrain: 'plains', seed: 426,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'wolf', x: 170.5, y: 80.5, hp: 100, maxHp: 100, dmg: 10, civ: -1 }), // u0：满血狼（F_FLIGHT[2]=0.88→0）
      U({ race: 'sheep', x: 172.5, y: 80.5, hp: 16, maxHp: 16, dmg: 1, civ: -1 }),   // u1：羊（F_FLIGHT[5]=1）
    ],
    steps: 2,
  },
  // S17 grudge-chase：血仇狼（dmg 0.5 hp 10 gval 2.0）vs 羊 → myPow ×(1+0.2×min(1,gVal/2)) L3677-3679 + L3711-3715 双头消费 → flight=0 + stance 追击 → 'mv' 1.25
  {
    name: 'grudge-chase', terrain: 'plains', seed: 437,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ id: 1, race: 'wolf', x: 180.5, y: 80.5, hp: 10, maxHp: 100, dmg: 0.5, gids: [2], gval: [2.0], civ: -1 }), // u0：血仇狼
      U({ id: 2, race: 'sheep', x: 182.5, y: 80.5, hp: 16, maxHp: 16, dmg: 1, civ: -1 }),                          // u1：仇敌羊
    ],
    steps: 2,
  },
  // ================= M-U7o 批次三乙一·远程域（S18-S20；L3739-3773 法师火球/弓手火枪能量枪 + L3958-3963 死区风筝；契约：近战/龙息/peaceful 哨兵不可达） =================
  // S18 mage-fireball：野法师（R.MAGE rd{range 6.5,dmg 18,cd 26}）vs 野人（hostile×isCiv L2103 敌意）d=2.0 ∈ (1.6,6.5]
  //    → cd 0→26 + atk=10 + 抖动 2 掷（enemy ±0.3）→ 'fb' [id,bitHex×3]；次拍 cd 26-2=24>0 零掷零事件
  //    野人 isCiv 非敌对 → flight 块跳过（L3674 门）；弱势 F[7]=0.155 → stance 3 伤重脱离 'mv' 1.15
  {
    name: 'mage-fireball', terrain: 'plains', seed: 40418,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'mage', x: 190.5, y: 80.5, hp: 50, maxHp: 50, dmg: 6, civ: -1 }),      // u0：野法师（R.MAGE 自然值 hp50/dmg6；race 级 rd 消费）
      U({ race: 'human', x: 192.5, y: 80.5, hp: 10, maxHp: 10, dmg: 1, civ: -1 }),     // u1：弱野人（F[7]=12.25/14.5=0.845 法师强势→flight 0）
    ],
    steps: 2,
  },
  // S19 archer-arrow：弓手（jobC=3 → JOBS[3].ranged=5 types.ts L300）vs 僵尸（L2095 对称敌意）d=2.5 ∈ (1.4,5]
  //    → cd 0→18 + atk=10 + leadAim 12 拍提前量 2 掷（lx/ly undefined → vx=vy=0）→ 'ar' [id,bitHex×3 dmg=6×1]
  //    mul=1（civ=-1 → L3759 isCiv&&civ>=0 假）；gun/beam=false（wep 空）；僵尸 undead → flight 排除（L3674 门）
  {
    name: 'archer-arrow', terrain: 'plains', seed: 40419,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'human', x: 200.5, y: 80.5, hp: 50, maxHp: 100, dmg: 6, job: 3, civ: -1 }),  // u0：弓手（强势 F[7]=0.845 → stance 0 非脱离）
      U({ race: 'zombie', x: 203, y: 80.5, hp: 10, maxHp: 10, dmg: 1, civ: -1 }),             // u1：弱僵尸（F[7]=0.155 → stance 3 溃逃 'mv' 1.15）
    ],
    steps: 2,
  },
  // S20 kite-deadzone：S18 同配比法师/野人（stance=2 已证）仅改间距 d=1.5 ∈ 射程死区（<1.6 无法球 / >0.9 reach 非近战）
  //    → rd 带门假 → 死区风筝 L3960-3963 拉开距离 'mv' 0.8（stance=2 且战且退——旧版一头撞进近战的根治位）
  {
    name: 'kite-deadzone', terrain: 'plains', seed: 40420,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'mage', x: 220.5, y: 80.5, hp: 50, maxHp: 50, dmg: 6, civ: -1 }),      // u0：法师（S18 同配比——F[7]=0.845 强势→flight 0 + stance 2）
      U({ race: 'human', x: 222, y: 80.5, hp: 10, maxHp: 10, dmg: 1, civ: -1 }),       // u1：弱野人（d=1.5 死区——法师带外站桩距离）
    ],
    steps: 2,
  },
  // ================= M-U7p 批次三乙二-a·近战执行主链（S21-S28；L3774-3899；契约：击杀链 L3900+ 哨兵不可达——致命路径均早退） =================
  // S21 melee-hit：狼 vs 羊 d=0.8（<reach 0.9）→ cd 门 0→14（round(14/1)）+ atk=12 + neuroAcc 命中（F_ACC 十特征）→ hit fx 中点 + hp 扣减 + activeBattles 标记
  //    gA/gD 双 null（野vs野）——零装备结算零暴击；fxPrefs blood/dmgNumbers 桩面 undefined-falsy——血溅/伤害数字零掷
  {
    name: 'melee-hit', terrain: 'plains', seed: meleeProbe({
      label: 'melee-hit', units: [
        U({ race: 'wolf', x: 240.5, y: 80.5, hp: 100, dmg: 10, civ: -1 }),
        U({ race: 'sheep', x: 241.3, y: 80.5, hp: 16, maxHp: 16, civ: -1 }),
      ],
      want: (cap) => cap.fx.some((f) => f.k === 'hit') && cap.evt.some((e) => e[0] === 'ab'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'wolf', x: 240.5, y: 80.5, hp: 100, dmg: 10, civ: -1 }),
      U({ race: 'sheep', x: 241.3, y: 80.5, hp: 16, maxHp: 16, civ: -1 }),
    ],
    steps: 2,
  },
  // S22 basilisk-petrify：蛇怪 8% 石化凝视首掷命中 → 羊当场死亡（hp=0 dead kills++）+ corpse 事件（石化 true）+ petrify ev + 早退（击杀链不触）
  {
    name: 'basilisk-petrify', terrain: 'plains', seed: meleeProbe({
      label: 'basilisk-petrify', units: [
        U({ race: 'basilisk', x: 250.5, y: 80.5, hp: 50, dmg: 5, civ: -1 }),
        U({ race: 'sheep', x: 251.3, y: 80.5, hp: 16, maxHp: 16, civ: -1 }),
      ],
      want: (cap) => cap.evt.some((e) => e[0] === 'corpse' && e[3] === 1),   // addCorpse(x,y,stone,undead)——石化 stone=true
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'basilisk', x: 250.5, y: 80.5, hp: 50, dmg: 5, civ: -1 }),
      U({ race: 'sheep', x: 251.3, y: 80.5, hp: 16, maxHp: 16, civ: -1 }),
    ],
    steps: 2,
  },
  // S23 basilisk-poison：石化首掷未中（≥0.08）→ neuroAcc 命中 → 毒牙 45% 掷中 → infected=1（hp 扣减存活）
  {
    name: 'basilisk-poison', terrain: 'plains', seed: meleeProbe({
      label: 'basilisk-poison', units: [
        U({ race: 'basilisk', x: 254.5, y: 80.5, hp: 50, dmg: 5, civ: -1 }),
        U({ race: 'sheep', x: 255.8, y: 80.5, hp: 16, maxHp: 16, civ: -1 }),
      ],
      want: (cap, us) => !cap.evt.some((e) => e[0] === 'corpse') && !!us[1].infected && cap.fx.some((f) => f.k === 'hit'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'basilisk', x: 254.5, y: 80.5, hp: 50, dmg: 5, civ: -1 }),
      U({ race: 'sheep', x: 255.8, y: 80.5, hp: 16, maxHp: 16, civ: -1 }),
    ],
    steps: 2,
  },
  // S24 sandworm-devour：沙虫 vs 残血羊（hp 5 ≤ 40%×16=6.4）→ 囫囵吞噬（零掷）：hp=0 dead kills++ + food 50+round(9.6)=60 + blood fx + 早退
  {
    name: 'sandworm-devour', terrain: 'plains', seed: 40424,
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'sandworm', x: 244.5, y: 80.5, hp: 100, dmg: 8, civ: -1 }),            // u0：沙虫（reach 1.6——d=1.5 入近战带）
      U({ race: 'sheep', x: 246, y: 80.5, hp: 5, maxHp: 16, civ: -1 }),                // u1：残血羊（≤40% 席卷门）
    ],
    steps: 2,
  },
  // S25 kraken-sink：克拉肯 vs 帆船野人（boat=1）d=2.0（<reach 2.4）→ 双倍伤害 + 30% 击沉掷中 → dead + boat=0 + explosion fx + shipwreck ev + 早退
  {
    name: 'kraken-sink', terrain: 'plains', seed: meleeProbe({
      label: 'kraken-sink', units: [
        U({ race: 'kraken', x: 236.5, y: 80.5, hp: 100, dmg: 9, civ: -1 }),
        U({ race: 'human', x: 238.5, y: 80.5, hp: 50, maxHp: 50, dmg: 1, boat: 1, civ: -1 }),
      ],
      want: (cap) => cap.evt.some((e) => e[0] === 'ev' && e[1] === 'shipwreck'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'kraken', x: 236.5, y: 80.5, hp: 100, dmg: 9, civ: -1 }),
      U({ race: 'human', x: 238.5, y: 80.5, hp: 50, maxHp: 50, dmg: 1, boat: 1, civ: -1 }),
    ],
    steps: 2,
  },
  // S26 kraken-tsunami：击沉掷未中（≥0.3）→ tsunami fx（quiet）+ 帆船野人存活（hp 50-18=32）
  {
    name: 'kraken-tsunami', terrain: 'plains', seed: meleeProbe({
      label: 'kraken-tsunami', units: [
        U({ race: 'kraken', x: 226.5, y: 80.5, hp: 100, dmg: 9, civ: -1 }),
        U({ race: 'human', x: 228.5, y: 80.5, hp: 50, maxHp: 50, dmg: 1, boat: 1, civ: -1 }),
      ],
      want: (cap) => cap.fx.some((f) => f.k === 'tsunami') && !cap.evt.some((e) => e[0] === 'ev'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'kraken', x: 226.5, y: 80.5, hp: 100, dmg: 9, civ: -1 }),
      U({ race: 'human', x: 228.5, y: 80.5, hp: 50, maxHp: 50, dmg: 1, boat: 1, civ: -1 }),
    ],
    steps: 2,
  },
  // S27 vampire-drain：吸血鬼 vs 羊 d=0.8 → 命中后吮血 hp += dmg×0.6（≤maxHp 钳）——gA null 野对零装备吸血
  {
    name: 'vampire-drain', terrain: 'plains', seed: meleeProbe({
      label: 'vampire-drain', units: [
        U({ race: 'vampire', x: 216.5, y: 80.5, hp: 20, maxHp: 140, dmg: 16, civ: -1 }),   // 吸血鬼 undead——非八对称非 predator，敌意走 hostile×isCiv L2103
        U({ race: 'human', x: 217.3, y: 80.5, hp: 50, maxHp: 50, dmg: 1, civ: -1 }),
      ],
      want: (cap, us) => cap.fx.some((f) => f.k === 'hit') && us[0].hp > 20,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'vampire', x: 216.5, y: 80.5, hp: 20, maxHp: 140, dmg: 16, civ: -1 }),
      U({ race: 'human', x: 217.3, y: 80.5, hp: 50, maxHp: 50, dmg: 1, civ: -1 }),
    ],
    steps: 2,
  },
  // ================= M-U7q 批次三乙三·击杀链（S29-S36；L3903-3957 击杀链 + L3972-3978 龙息；zombify/witnessDeath 等七助手走原型真实现） =================
  // S29 melee-kill-witness：狼杀羊（致命命中）→ kills++ + witnessDeath 目睹死亡广播（近者 panic 0.3333 + 血仇 gids/gval 记账；远者 d>6 桶环外零触达）+ 捕食者进食 food+55+round(maxHp/2)
  {
    name: 'melee-kill-witness', terrain: 'plains', seed: meleeProbe({
      label: 'melee-kill-witness', units: [
        U({ race: 'wolf', x: 20.5, y: 30.5, hp: 100, dmg: 30, civ: -1 }),
        U({ race: 'sheep', x: 21.3, y: 30.5, hp: 16, maxHp: 16, civ: -1 }),
        U({ race: 'sheep', x: 24.5, y: 30.5, civ: -1 }),   // u2：血亲目击者（d≈3.2 ≤6 且桶环内）——panic+grudge
        U({ race: 'sheep', x: 29.5, y: 30.5, civ: -1 }),   // u3：远亲对照（d≈8.2>6 且桶环外）——零恐慌零血仇
      ],
      want: (cap, us) => us[1].dead && us[2].panic > 0 && us[3].panic === undefined && (us[2].gIds?.length ?? 0) === 1,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'wolf', x: 20.5, y: 30.5, hp: 100, dmg: 30, civ: -1 }),
      U({ race: 'sheep', x: 21.3, y: 30.5, hp: 16, maxHp: 16, civ: -1 }),
      U({ race: 'sheep', x: 24.5, y: 30.5, civ: -1 }),
      U({ race: 'sheep', x: 29.5, y: 30.5, civ: -1 }),
    ],
    steps: 2,
  },
  // S30 zombify：僵尸杀野人（isCiv + laws.zombieInfect 默认 true）→ zombify 原地尸变（race→ZOMBIE civ=-1 hp40/maxHp46/dmg6/speed0.05/age0/maxAge9999 + bumpWild+1 + spawn fx）——kills/witnessDeath else 链不触达
  {
    name: 'zombify', terrain: 'plains', seed: meleeProbe({
      label: 'zombify', units: [
        U({ race: 'zombie', x: 40.5, y: 30.5, hp: 46, maxHp: 46, dmg: 6, civ: -1 }),
        U({ race: 'human', x: 41.3, y: 30.5, hp: 5, maxHp: 60, civ: -1 }),
      ],
      want: (cap, us) => us[1].race === 5 && !us[1].dead && us[1].hp === 40 && us[0].kills === 0,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'zombie', x: 40.5, y: 30.5, hp: 46, maxHp: 46, dmg: 6, civ: -1 }),
      U({ race: 'human', x: 41.3, y: 30.5, hp: 5, maxHp: 60, civ: -1 }),
    ],
    steps: 2,
  },
  // S31 revenge：血仇狼手刃仇敌（gids 钉羊 id）→ gIds/gVal splice 清账 → undefined + 12% 采样播报掷（种子钉 <0.12 → revenge ev）
  {
    name: 'revenge', terrain: 'plains', seed: meleeProbe({
      label: 'revenge', units: [
        U({ id: 1, race: 'wolf', x: 60.5, y: 30.5, hp: 100, dmg: 30, gids: [2], gval: [1.0], civ: -1 }),
        U({ id: 2, race: 'sheep', x: 61.3, y: 30.5, hp: 16, maxHp: 16, civ: -1 }),
      ],
      want: (cap, us) => cap.evt.some((e) => e[0] === 'ev' && e[1] === 'revenge') && us[0].gIds === undefined,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ id: 1, race: 'wolf', x: 60.5, y: 30.5, hp: 100, dmg: 30, gids: [2], gval: [1.0], civ: -1 }),
      U({ id: 2, race: 'sheep', x: 61.3, y: 30.5, hp: 16, maxHp: 16, civ: -1 }),
    ],
    steps: 2,
  },
  // S32 family-hero：家族武士十杀（kills=9 → 阵斩第十敌）→ rf.kills/heroes ++ + lineage ev + legend toast（宿主域静默）+ legend ev（civ=-1 → RACES 名）
  {
    name: 'family-hero', terrain: 'plains', seed: meleeProbe({
      label: 'family-hero', env: { families: { '5': { id: 5, race: 7, name: '乌木家', founder: '先祖甲', members: 3, kills: 0, heroes: 0 } } },
      units: [
        U({ race: 'wolf', x: 80.5, y: 30.5, hp: 100, dmg: 30, kills: 9, fam: 5, civ: -1 }),
        U({ race: 'sheep', x: 81.3, y: 30.5, hp: 16, maxHp: 16, civ: -1 }),
      ],
      want: (cap, us) => cap.evt.some((e) => e[0] === 'ev' && e[1] === 'lineage') && cap.evt.some((e) => e[0] === 'ev' && e[1] === 'legend') && us[0].kills === 10,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true, families: { '5': { id: 5, race: 7, name: '乌木家', founder: '先祖甲', members: 3, kills: 0, heroes: 0 } } },
    units: [
      U({ race: 'wolf', x: 80.5, y: 30.5, hp: 100, dmg: 30, kills: 9, fam: 5, civ: -1 }),
      U({ race: 'sheep', x: 81.3, y: 30.5, hp: 16, maxHp: 16, civ: -1 }),
    ],
    steps: 2,
  },
  // S33 king-slain-war：弑君之战（killer civ0 vs king victim civ1 交战中 rel -50）→ witnessDeath 弑君加权（同悲 panic+0.5 ×1.8 血仇 2.88 + rel -24/tension+30/warShame）+ onWarKill 战争结算（addWarScore kill +2 + wwCountKill idle 直退 + 总动员 killCount++）
  {
    name: 'king-slain-war', terrain: 'plains', seed: meleeProbe({
      label: 'king-slain-war', env: {
        civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, kingId: null, kingName: '', colorHex: '#ff4136' },
                '1': { id: 1, name: '炎国', alive: true, pop: 3, stability: 70, kingId: 2, kingName: '炎王', colorHex: '#e63946' } },
        relInit: { '0-1': -50 },
        warData: { '0-1': { key: '0-1', a: 0, b: 1, scoreA: 0, scoreB: 0, casA: 0, casB: 0, exA: 0, exB: 0, razedA: 0, razedB: 0 } },
        directives: [{ id: 1, civ: 0, kind: 'mobilize', status: 'active', killCount: 0 }],
      },
      units: [
        U({ id: 1, race: 'human', x: 100.5, y: 30.5, hp: 100, dmg: 30, civ: 0 }),
        U({ id: 2, race: 'human', x: 101.3, y: 30.5, hp: 10, maxHp: 60, king: true, civ: 1 }),
        U({ id: 3, race: 'human', x: 103.5, y: 30.5, hp: 60, maxHp: 60, civ: 1 }),   // u2：同悲目击者（d≈3.2 ≤14 疆内闻讯 + ≤6 血亲之殇）
      ],
      want: (cap, us) => us[1].dead && us[2].panic > 0.4 && (us[2].gIds?.length ?? 0) === 1,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, kingId: null, kingName: '', colorHex: '#ff4136' },
              '1': { id: 1, name: '炎国', alive: true, pop: 3, stability: 70, kingId: 2, kingName: '炎王', colorHex: '#e63946' } },
      relInit: { '0-1': -50 },
      warData: { '0-1': { key: '0-1', a: 0, b: 1, scoreA: 0, scoreB: 0, casA: 0, casB: 0, exA: 0, exB: 0, razedA: 0, razedB: 0 } },
      directives: [{ id: 1, civ: 0, kind: 'mobilize', status: 'active', killCount: 0 }] },
    units: [
      U({ id: 1, race: 'human', x: 100.5, y: 30.5, hp: 100, dmg: 30, civ: 0 }),
      U({ id: 2, race: 'human', x: 101.3, y: 30.5, hp: 10, maxHp: 60, king: true, civ: 1 }),
      U({ id: 3, race: 'human', x: 103.5, y: 30.5, hp: 60, maxHp: 60, civ: 1 }),
    ],
    steps: 2,
  },
  // S34 dragon-slain：屠龙（野人 vs 巨龙 L2095 对称敌意 ra!==rb）→ enemy.race===DRAGON → statDragonsSlain++（post dump 对账）
  {
    name: 'dragon-slain', terrain: 'plains', seed: meleeProbe({
      label: 'dragon-slain', units: [
        U({ race: 'human', x: 120.5, y: 30.5, hp: 100, dmg: 60, civ: -1 }),
        U({ race: 'dragon', x: 121.3, y: 30.5, hp: 5, maxHp: 900, civ: -1 }),
      ],
      want: (cap, us, eng) => us[1].dead && eng.statDragonsSlain === 1,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'human', x: 120.5, y: 30.5, hp: 100, dmg: 60, civ: -1 }),
      U({ race: 'dragon', x: 121.3, y: 30.5, hp: 5, maxHp: 900, civ: -1 }),
    ],
    steps: 2,
  },
  // S35 undead-rise：亡者复生法则（laws.undeadRise + isCiv + 6% 掷中）→ riseSkeleton 桩面 'rise' 事件（起尸 spawn 域接缝——0.12 播报掷在未译 riseSkeleton 体内）
  {
    name: 'undead-rise', terrain: 'plains', seed: meleeProbe({
      label: 'undead-rise', env: { lawsRise: true }, units: [
        U({ race: 'vampire', x: 140.5, y: 30.5, hp: 20, maxHp: 140, dmg: 16, civ: -1 }),
        U({ race: 'human', x: 141.3, y: 30.5, hp: 5, maxHp: 60, civ: -1 }),
      ],
      want: (cap) => cap.evt.some((e) => e[0] === 'rise'),
    }),
    env: { lawsRise: true, ambience: false, gearRegen: 0, scanReal: true },
    units: [
      U({ race: 'vampire', x: 140.5, y: 30.5, hp: 20, maxHp: 140, dmg: 16, civ: -1 }),
      U({ race: 'human', x: 141.3, y: 30.5, hp: 5, maxHp: 60, civ: -1 }),
    ],
    steps: 2,
  },
  // S36 dragon-breath：无敌路径龙息（L3972 race===R2 门 + breath -=2 ≤0 → 150+floor(rng×150) 重置 + dragonBreath 落点 2 掷 + 4× ignite GRASS 可燃 1 掷/枚 → fire 写点 + explosion fx；terrainTrack fireDiff 值对账）
  {
    name: 'dragon-breath', terrain: 'plains', seed: meleeProbe({
      label: 'dragon-breath', units: [
        U({ race: 'dragon', x: 160.5, y: 30.5, hp: 900, maxHp: 900, dmg: 48, breath: 2, civ: -1 }),
        U({ race: 'dragon', x: 162.5, y: 30.5, hp: 900, maxHp: 900, dmg: 48, breath: 150, civ: -1 }),   // u1：breath 充裕对照（148 不触雷）——同族 ally 保证 scan 日志非空
      ],
      want: (cap) => cap.fx.some((f) => f.k === 'explosion'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true, terrainTrack: true },
    units: [
      U({ race: 'dragon', x: 160.5, y: 30.5, hp: 900, maxHp: 900, dmg: 48, breath: 2, civ: -1 }),
      U({ race: 'dragon', x: 162.5, y: 30.5, hp: 900, maxHp: 900, dmg: 48, breath: 150, civ: -1 }),
    ],
    steps: 2,
  },
  // S28 bless-curse-dusk：狼 bless=1 curse=1 + env.dayPhase=0.7（dusk 窗口 0.5..0.9）→ dmg ×1.3×0.75×0.92（nightsight 假）——F_ACC[6]/[7] 双 1（神力/诅咒准头）
  {
    name: 'bless-curse-dusk', terrain: 'plains', seed: meleeProbe({
      label: 'bless-curse-dusk', env: { dayPhase: 0.7 }, units: [
        U({ race: 'wolf', x: 206.5, y: 80.5, hp: 100, dmg: 10, bless: 1, curse: 1, civ: -1 }),
        U({ race: 'sheep', x: 207.3, y: 80.5, hp: 16, maxHp: 16, civ: -1 }),
      ],
      want: (cap) => cap.fx.some((f) => f.k === 'hit'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true, dayPhase: 0.7 },
    units: [
      U({ race: 'wolf', x: 206.5, y: 80.5, hp: 100, dmg: 10, bless: 1, curse: 1, civ: -1 }),
      U({ race: 'sheep', x: 207.3, y: 80.5, hp: 16, maxHp: 16, civ: -1 }),
    ],
    steps: 2,
  },

  // ================= M-U7r 批次三丙·peaceful 职业域（S37-S50；L3981-4109 全译收官——updateUnit 最后一域） =================
  // 契约：单位无敌（桶内无敌 or 同族 ally）→ else 分支 → 龙息门（非龙/undefined breath 天然跳过）→ isCiv && civ>=0 职业链。
  //  真实现面：fireNear/extinguishFire/damagedNear/repairBuilding/nearestBuildingOf/warTarget/civAtWar/attackBuilding 走原型；
  //  castArrow/moveUnit/addEvent/fx 事件捕获桩；buildings/bIdx/bHp/owner/firesOut/repairsDone 夹具注入（applyPeaceFixtures）。
  // S37 fire-rush：火 2.0 格（<2.2 贴身自保门——零领土依赖）+ 0.3 门开 + dist²=4>2.89 → tx/ty=火心 + 'mv' 1.2 + 提前 return
  //  （tail/post 全跳——救灾优先契约）；fireSet 不动（rush 不灭火）。
  {
    name: 'fire-rush', terrain: 'plains', seed: meleeProbe({
      label: 'fire-rush', steps: 1, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, fireInit: { '42,40': 5 } },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
      want: (cap, us) => cap.evt.some((e) => e[0] === 'mv' && e[2] === 1.2) && !cap.evt.some((e) => e[0] === 'tail' || e[0] === 'post'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, fireInit: { '42,40': 5 } },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
    steps: 1,
  },
  // S38 fire-out：贴身火 1.0 格（<1.7²）→ extinguishFire（fire 清/fireSet 删/firesOut 1/water fx/cd=max(0,10)）→ 节流门关（firesOut<3）
  //  → 落穿全链（建筑师 job≠4 短路/路人 cd>0 短路/war 假/job 链假/0.02 门败）→ tail+post 照常。
  {
    name: 'fire-out', terrain: 'plains', seed: meleeProbe({
      label: 'fire-out', steps: 2, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, fireInit: { '41,40': 5 } },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
      want: (cap, us, eng) => eng.fireSet.size === 0 && eng.firesOut === 1 && cap.fx.some((f) => f.k === 'water')
        && cap.evt.some((e) => e[0] === 'tail') && cap.evt.some((e) => e[0] === 'post') && us[0].cd === 8,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, fireInit: { '41,40': 5 } },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
    steps: 2,
  },
  // S39 fire-out-announce：firesOutInit=3 → 灭火后 4≥3 且 0-(-2400)=2400>480 → fireOut 命名纪事（civ alive 门开）+ lastFireOutEventTick=0
  {
    name: 'fire-out-announce', terrain: 'plains', seed: meleeProbe({
      label: 'fire-out-announce', env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, fireInit: { '41,40': 5 }, firesOutInit: 3 },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
      want: (cap, us, eng) => cap.evt.some((e) => e[0] === 'ev' && e[1] === 'fireOut') && eng.firesOut === 4 && eng.lastFireOutEventTick === 0,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, fireInit: { '41,40': 5 }, firesOutInit: 3 },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
    steps: 1,
  },
  // S40 bigfire-muster：9 火格 → bigFire（>8）→ 门 0.5 + 半径 5（job0 灾情动员）→ 远火 4.0 格（≥2.2 → own 领土门——ownerInit 全 9 格）
  //  → rush（mv 1.2 + 提前 return）
  {
    name: 'bigfire-muster', terrain: 'plains', seed: meleeProbe({
      label: 'bigfire-muster', steps: 1, env: {
        civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } },
        fireInit: { '44,40': 5, '45,40': 5, '46,40': 5, '44,41': 5, '45,41': 5, '46,41': 5, '44,42': 5, '45,42': 5, '46,42': 5 },
        ownerInit: { '10284': 0, '10285': 0, '10286': 0, '10540': 0, '10541': 0, '10542': 0, '10796': 0, '10797': 0, '10798': 0 } },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
      want: (cap, us, eng) => cap.evt.some((e) => e[0] === 'mv' && e[2] === 1.2) && eng.fireSet.size === 9,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } },
      fireInit: { '44,40': 5, '45,40': 5, '46,40': 5, '44,41': 5, '45,41': 5, '46,41': 5, '44,42': 5, '45,42': 5, '46,42': 5 },
      ownerInit: { '10284': 0, '10285': 0, '10286': 0, '10540': 0, '10541': 0, '10542': 0, '10796': 0, '10797': 0, '10798': 0 } },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
    steps: 1,
  },
  // S41 idle-fallthrough：无火无损害 → 防火门 fireSet 空短路零掷 → 建筑师/路人 job 短路 → war 假 → job 链假 → 0.02 门败
  //  → tail+post（零掷穿链契约——和平无事一拍只有 1 抽）
  {
    name: 'idle-fallthrough', terrain: 'plains', seed: meleeProbe({
      label: 'idle-fallthrough', steps: 1, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } } },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
      want: (cap, us) => cap.evt.some((e) => e[0] === 'tail') && cap.evt.some((e) => e[0] === 'post') && !cap.evt.some((e) => e[0] === 'mv'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } } },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
    steps: 1,
  },
  // S42 architect-commute：建筑师 job4 + 0.2 门开 + damagedNear(14) 命中 6.0 格远本国受损宅 → dist²=36>3.24 → 赴工地（mv 1.15 + return）
  {
    name: 'architect-commute', terrain: 'plains', seed: meleeProbe({
      label: 'architect-commute', steps: 1, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } },
        bldInit: [[10286, 1, 0]], dmgInit: { '10286': 40 } },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 4, cd: 0 })],
      want: (cap, us, eng) => cap.evt.some((e) => e[0] === 'mv' && e[2] === 1.15) && !cap.evt.some((e) => e[0] === 'tail' || e[0] === 'post')
        && us[0].tx === 46.5 && eng.damagedSet.size === 1,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, bldInit: [[10286, 1, 0]], dmgInit: { '10286': 40 } },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 4, cd: 0 })],
    steps: 1,
  },
  // S43 architect-repair：受损宅 1.0 格（<1.8²）→ cd=16 + atk=10 + repairBuilding(12×repair=12)（40→52<70 done=false → hammer fx 无纪事）
  //  → 拍 2 cd 衰减后 0.02 门败（tail+post 照常）
  {
    name: 'architect-repair', terrain: 'plains', seed: meleeProbe({
      label: 'architect-repair', steps: 2, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } },
        bldInit: [[10281, 1, 0]], dmgInit: { '10281': 40 } },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 4, cd: 0 })],
      want: (cap, us, eng) => eng.bHp.get(10281) === 52 && eng.repairsDone === 1 && cap.fx.some((f) => f.k === 'hammer')
        && us[0].cd === 14 && us[0].atk === 8 && cap.evt.some((e) => e[0] === 'tail'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, bldInit: [[10281, 1, 0]], dmgInit: { '10281': 40 } },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 4, cd: 0 })],
    steps: 2,
  },
  // S44 passerby-fix：平民 job0 + 0.12 门开 + damagedNear(1.9) 命中贴身受损宅 → cd=22 + repairBuilding(3)（66→69 done=false）
  {
    name: 'passerby-fix', terrain: 'plains', seed: meleeProbe({
      label: 'passerby-fix', steps: 2, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } },
        bldInit: [[10281, 1, 0]], dmgInit: { '10281': 66 } },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
      want: (cap, us, eng) => eng.bHp.get(10281) === 69 && eng.repairsDone === 1 && cap.fx.some((f) => f.k === 'hammer') && us[0].cd === 20,
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, bldInit: [[10281, 1, 0]], dmgInit: { '10281': 66 } },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 0, cd: 0 })],
    steps: 2,
  },
  // S45 siege-melee：战士 job2 交战国（rel -50）敌宅 1.0 格 → cd=14 + atk=12 + attackBuilding(8)（70→62 + damagedSet 登记 + hit fx）
  //  → 摧毁门不触（62>0——onBuildingDestroyed 级联属 case3 bail 域 D01-D08 契约）→ 军团外 0.05/0.03 门双败
  {
    name: 'siege-melee', terrain: 'plains', seed: meleeProbe({
      label: 'siege-melee', steps: 2, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' },
                '1': { id: 1, name: '炎国', alive: true, pop: 3, stability: 70, colorHex: '#e63946' } }, relInit: { '0-1': -50 },
        bldInit: [[10281, 1, 1]] },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 2, dmg: 5, cd: 0, tx: 44.5, ty: 40.5 })],
      want: (cap, us, eng) => eng.bHp.get(10281) === 62 && eng.damagedSet.has(10281) && cap.fx.some((f) => f.k === 'hit')
        && us[0].cd === 12 && us[0].atk === 10 && !cap.evt.some((e) => e[0] === 'corpse'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' },
              '1': { id: 1, name: '炎国', alive: true, pop: 3, stability: 70, colorHex: '#e63946' } }, relInit: { '0-1': -50 },
      bldInit: [[10281, 1, 1]] },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 2, dmg: 5, cd: 0, tx: 44.5, ty: 40.5 })],
    steps: 2,
  },
  // S46 siege-archer：弓手 job3 + 近战门 1.6 miss（4.0 格）→ 0.1 门开 → enemyBuildingNear(5) 命中 → cd=18 + 'ar' 事件
  //  → 军团外 0.05/0.03 双败
  {
    name: 'siege-archer', terrain: 'plains', seed: meleeProbe({
      label: 'siege-archer', steps: 2, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' },
                '1': { id: 1, name: '炎国', alive: true, pop: 3, stability: 70, colorHex: '#e63946' } }, relInit: { '0-1': -50 },
        bldInit: [[10284, 1, 1]] },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 3, dmg: 5, cd: 0, tx: 42.5, ty: 40.5 })],
      want: (cap, us) => cap.evt.some((e) => e[0] === 'ar' && e[2] === bitHex(44.5)) && us[0].cd === 16
        && !cap.fx.some((f) => f.k === 'hit'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' },
              '1': { id: 1, name: '炎国', alive: true, pop: 3, stability: 70, colorHex: '#e63946' } }, relInit: { '0-1': -50 },
      bldInit: [[10284, 1, 1]] },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 3, dmg: 5, cd: 0, tx: 42.5, ty: 40.5 })],
    steps: 2,
  },
  // S47 merchant-trade：商人 job5 + tx=自身（dist²=0<1.44 短路零掷）→ 0.6 门开选 MARKET → 抵达判定 0.5²<2.25 → gold+2 + coin fx
  {
    name: 'merchant-trade', terrain: 'plains', seed: meleeProbe({
      label: 'merchant-trade', steps: 2, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } },
        bldInit: [[10281, 9, 0]] },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 5, cd: 0 })],
      want: (cap, us, eng) => eng.civs[0].gold === 4 && cap.fx.some((f) => f.k === 'coin'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, bldInit: [[10281, 9, 0]] },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 5, cd: 0 })],
    steps: 2,
  },
  // S48 farmer-tend：农民 job1 + 0.06 门开 → nearestBuildingOf(FARM) → tx/ty=农田周边 ±2.5（clamp 面内）
  {
    name: 'farmer-tend', terrain: 'plains', seed: meleeProbe({
      label: 'farmer-tend', steps: 1, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } },
        bldInit: [[10281, 4, 0]] },
      units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 1, cd: 0 })],
      want: (cap, us) => us[0].tx !== 40.5 && Math.abs(us[0].tx - 41) <= 2.5 && Math.abs(us[0].ty - 40) <= 2.5
        && cap.evt.some((e) => e[0] === 'tail'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' } }, bldInit: [[10281, 4, 0]] },
    units: [U({ race: 'human', x: 40.5, y: 40.5, civ: 0, job: 1, cd: 0 })],
    steps: 1,
  },
  // S49 noble-dwell：贵族 job6 + 0.06 门开 → 王都 tileX/tileY ±3（civ.capital 夹具——C# 注入面 capital）
  {
    name: 'noble-dwell', terrain: 'plains', seed: meleeProbe({
      label: 'noble-dwell', steps: 1, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136', capital: 10281 } } },
      units: [U({ race: 'human', x: 50.5, y: 50.5, civ: 0, job: 6, cd: 0 })],
      want: (cap, us) => Math.abs(us[0].tx - 41) <= 3 && Math.abs(us[0].ty - 40) <= 3 && cap.evt.some((e) => e[0] === 'tail'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136', capital: 10281 } } },
    units: [U({ race: 'human', x: 50.5, y: 50.5, civ: 0, job: 6, cd: 0 })],
    steps: 1,
  },
  // S50 war-march：0.02 门开（无职业分支命中）→ warTarget(0) 敌国建筑随机选靶（1 敌 1 抽）→ tx/ty=靶 ±2
  {
    name: 'war-march', terrain: 'plains', seed: meleeProbe({
      label: 'war-march', steps: 1, env: { civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' },
                '1': { id: 1, name: '炎国', alive: true, pop: 3, stability: 70, colorHex: '#e63946' } }, relInit: { '0-1': -50 },
        bldInit: [[10281, 1, 1]] },
      units: [U({ race: 'human', x: 50.5, y: 50.5, civ: 0, job: 0, cd: 0 })],
      want: (cap, us) => Math.abs(us[0].tx - 40) <= 2 && Math.abs(us[0].ty - 40) <= 2 && cap.evt.some((e) => e[0] === 'tail'),
    }),
    env: { lawsRise: false, ambience: false, gearRegen: 0, scanReal: true,
      civs: { '0': { id: 0, name: '赤国', alive: true, pop: 4, stability: 70, colorHex: '#ff4136' },
              '1': { id: 1, name: '炎国', alive: true, pop: 3, stability: 70, colorHex: '#e63946' } }, relInit: { '0-1': -50 },
      bldInit: [[10281, 1, 1]] },
    units: [U({ race: 'human', x: 50.5, y: 50.5, civ: 0, job: 0, cd: 0 })],
    steps: 1,
  },
];

// ---- mut 处理（数值字段 null → undefined，与 mkTsUnit 语义一致） ----
const applyMut = (u, m) => {
  for (const [k, v] of Object.entries(m)) {
    if (k === 'slot') continue;
    if (k === 'panic' || k === 'sxk' || k === 'syk' || k === 'food' || k === 'chill' || k === 'stk') {
      u[k] = v === null ? undefined : v;
    } else if (k === 'gids') {
      if (v === null) { u.gIds = undefined; u.gVal = undefined; }
      else { u.gIds = [...v]; if (u.gVal === undefined) u.gVal = v.map(() => 1); }
    } else if (k === 'gval') {
      if (v === null) { u.gVal = undefined; u.gIds = undefined; }
      else { u.gVal = [...v]; if (u.gIds === undefined) u.gIds = v.map((_, i) => 1000 + i); }
    } else if (k === 'infected') u.infected = !!v;
    else if (k === 'dead') u.dead = !!v;
    else if (k === 'flip') u.flip = !!v;
    else u[k] = v;
  }
};

// ---- 主循环：逐 case 驱动真 updateUnit ----
const out = { w: W, h: H, ep: EP, raceIds, races: raceTable, terrainSpecs: Object.values(TERRAIN_SPECS), cases: [] };
const sanity = [];
for (const c of CASES) {
  const env = { ...c.env };
  // —— M-U7q env 回显快照（必须在引擎运行前取：eng.warData/civs/families/directives 与 c.env 共享对象引用，
  //    引擎真实现结算会原地改写它们——事后快照即污染态。协议：env = 装载前态 pristine，post = 期望后态）——
  const envEcho = JSON.parse(JSON.stringify(c.env));
  const cap = { fx: [], evt: [], terr: [], scan: [] };
  const eng = makeStubEng(env, cap);
  eng.terrain.set(buildGrid(TERRAIN_SPECS[c.terrain]));
  for (const [k, v] of Object.entries(env.fireInit ?? {})) {
    const [x, y] = k.split(',').map(Number); eng.fire[y * W + x] = v; eng.fireSet.add(y * W + x);
  }
  for (const [k, v] of Object.entries(env.radiateInit ?? {})) {
    const [x, y] = k.split(',').map(Number); eng.radiate[y * W + x] = v;
  }
  applyPeaceFixtures(eng, env);   // M-U7r peaceful 职业域夹具（bld/dmg/owner/统计节流阀——probe 同源）
  const specs = c.units;
  const units = specs.map((s) => mkTsUnit({ ...s, race: raceIds[s.race] ?? s.race }));
  eng.units = units;
  if (env.scanReal) {
    // M-U7m 布桶：units 序 push（engine rebuildBuckets L3100-3101 同构——懒清空世代戳首代全清等价）
    for (const u of units) eng.buckets[((u.y / 4) | 0) * eng.bw + ((u.x / 4) | 0)].push(u);
  }
  let draws = 0;
  const raw = mulberry32(c.seed);
  eng.rng = () => { draws++; return raw(); };

  const track = !!env.terrainTrack;
  const outSteps = [];
  const snapFire = () => Array.from(eng.fire);
  const snapTerr = () => Array.from(eng.terrain);
  for (let sn = 0; sn < c.steps; sn++) {
    const stp = c.stepsArr ? c.stepsArr[sn] : null;
    const muts = [];
    if (stp?.mut) { applyMut(units[stp.slot], stp.mut); muts.push({ slot: stp.slot, ...stp.mut }); }
    if (stp?.mutAll) for (const m of stp.mutAll) { applyMut(units[m.slot], m); muts.push(m); }
    const fireBefore = track ? snapFire() : null;
    const terrBefore = track ? snapTerr() : null;
    const draw0 = draws;
    const perU = [];
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.dead) { perU.push({ dead: true }); continue; }
      const e0 = cap.evt.length, f0 = cap.fx.length, t0 = cap.terr.length, sc0 = cap.scan.length;
      eng.updateUnit(u);
      perU.push({
        ...snapU(u),
        evt: cap.evt.slice(e0).map((e) => e.map((v) => v)),
        fx: cap.fx.slice(f0).map((f) => [f.k, f.x, f.y, f.ttl]),
        terr: cap.terr.slice(t0).map((p) => [p[0], p[1], p[2]]),
        scan: cap.scan.slice(sc0).map((e) => e.map((v) => v)),   // M-U7m isEnemyFast 调用日志（[aId,bId,0|1] 事件流，字段只加）
        draws: draws - draw0 - perU.reduce((a, p) => a + (p.draws ?? 0), 0),
      });
    }
    const stepFireDiff = [];
    const stepTerrDiff = [];
    if (track) {
      const fa = snapFire(), ta = snapTerr();
      for (let i = 0; i < fa.length; i++) {
        if (fa[i] !== fireBefore[i]) stepFireDiff.push([i, fireBefore[i], fa[i]]);
        if (ta[i] !== terrBefore[i]) stepTerrDiff.push([i, terrBefore[i], ta[i]]);
      }
    }
    outSteps.push({
      muts,
      draws: draws - draw0,
      fireDiff: stepFireDiff, terrDiff: stepTerrDiff,
      units: perU,
      fireSet: [...eng.fireSet].sort((a, b) => a - b),
    });
  }
  const rngTail = [raw(), raw(), raw(), raw()].map(bitHex);
  // —— M-U7q 击杀链 post 态 dump（屠龙/文明/家族/外交三账本/战争档案/旨意——NUnit Test30 post 对账面；镜简侧 transcript 不复刻——其契约=单位/事件面） ——
  const post = {
    statDragons: eng.statDragonsSlain ?? 0,                                             // L3940 屠龙计数
    civs: Object.values(eng.civs).map((cv) => ({ id: cv.id, alive: !!cv.alive, pop: cv.pop, stability: cv.stability, kingId: cv.kingId === undefined ? null : cv.kingId, gold: cv.gold === undefined ? null : cv.gold })),   // 弑君/尸变 Civ 改写（L1673-1674/L4321）+ gold（M-U7r 商贾入库——字段只加）
    families: [...eng.families.values()].map((f) => ({ id: f.id, kills: f.kills, heroes: f.heroes })).sort((a, b) => a.id - b.id),   // L3928/L3930 家族战功
    rel: [...eng.rel.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),                 // L1186 弑君之仇（pairKey 序）
    tension: [...eng.tension.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),         // L1187
    warShame: [...eng.warShame.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),       // L1188 耻辱簿
    warData: [...eng.warData.values()].map((wd) => ({ key: wd.key, scoreA: wd.scoreA, scoreB: wd.scoreB, casA: wd.casA, casB: wd.casB, exA: wd.exA, exB: wd.exB, razedA: wd.razedA, razedB: wd.razedB })).sort((a, b) => (a.key < b.key ? -1 : 1)),   // L7250 战争分数
    directives: eng.directives.map((d) => ({ id: d.id, killCount: d.killCount ?? 0 })), // L7260 总动员战果
    // —— M-U7r peaceful 职业域 post 对账面（防灾/修缮统计 + 耐久账 + 受损登记——字段只加）——
    firesOut: eng.firesOut ?? 0,                                                        // L637 灭火统计
    repairsDone: eng.repairsDone ?? 0,                                                  // L639 修缮统计
    bhp: eng.bHp ? [...eng.bHp.entries()].sort((a, b) => a[0] - b[0]) : [],             // 耐久账（attack/repair 写点——tile 序）
    damaged: [...eng.damagedSet].sort((a, b) => a - b),                                 // 受损登记（attackBuilding 加/repairBuilding 删）
  };
  out.cases.push({
    name: c.name, terrain: c.terrain, seed: c.seed,
    // env 回显深拷贝——M-U7q S33 实证：引擎真实现原地改写 warData/civs/families/directives（{...c.env} 浅拷贝共享引用污染回显，
    //  C# 注入 pre 态后重复结算 scoreA 2→4）。协议：env = 装载前态（pristine），post = 期望后态。
    env: envEcho, units: specs.map((s) => ({ ...s, race: raceIds[s.race] ?? s.race })), steps: c.steps, out: outSteps,
    final: units.map(snapU),
    post,
    rngTail,
  });
  const evtN = cap.evt.length; const fxN = cap.fx.length;
  const riseN = cap.evt.filter((e) => e[0] === 'rise').length;
  const plagueN = cap.evt.filter((e) => e[0] === 'plague').length;
  const tailN = cap.evt.filter((e) => e[0] === 'tail').length;
  const grabN = cap.evt.filter((e) => e[0] === 'grab').length;
  const boatN = cap.evt.filter((e) => e[0] === 'boat').length;
  const fleeEndN = cap.evt.filter((e) => e[0] === 'fleeEnd').length;
  const drawSteps = outSteps.filter((o) => o.draws > 0).length;
  const terrN = cap.terr.length;
  const scanN = cap.scan.length;
  const mvN = cap.evt.filter((e) => e[0] === 'mv').length;
  const deadN = units.filter((u) => u.dead).length;
  sanity.push(`${c.name}: steps=${outSteps.length} rngSteps=${drawSteps} draws=${draws} evt=${evtN}(rise=${riseN},plague=${plagueN},tail=${tailN},grab=${grabN},boat=${boatN},fleeEnd=${fleeEndN},mv=${mvN}) fx=${fxN} terr=${terrN} scan=${scanN} dead=${deadN}/${units.length}`);
}

const json = JSON.stringify(out);
const GOLDEN1 = new URL('./golden/units_update.json', import.meta.url);
const GOLDEN2 = new URL('../../unity/pixel-world-box/Assets/StreamingAssets/WbGolden/units_update.json', import.meta.url);
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('units_update.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
console.log('=== gen-units-update 完成 ===');
for (const s of sanity) console.log('  ' + s);
