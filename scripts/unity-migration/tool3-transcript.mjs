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
//   消费）+ phoenixAshTick L13018-13032（M-U23：灰烬倒数到点重生——a.t-=2 节拍 +
//   spawnUnit silent 预算门 null 支〔S26 900 注入〕+ 重生体继承 rebirths + 双 fx +
//   toast/addEvent 尾面；runner unitsTick 通道 L2606 门镜像，旧场景零效应）
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
//   mutate 双场景 units dump hp/maxHp/dmg/speed FAIL → 还原复绿 14/14；
//   TOOL3_RED=river 禁 setTerrain 级联（世界生成直写语义）→ S15 fireMd5 FAIL；
//   TOOL3_RED=finger 禁 grabbedTick 全写面 → S16/S17 grab 场景 FAIL；
//   TOOL3_RED=reap 禁全收尸面 → 六 reap 场景 FAIL；
//   TOOL3_RED=phoenix 禁灰烬到点全写面（L13023-13029 splice/spawn/fx/toast/event）→
//   S25/S26 phoenix-rebirth 双场景 step4 ashes/units/fx FAIL → 还原复绿（M-U23）。
// 运行：bun scripts/unity-migration/tool3-transcript.mjs
// ============================================================================
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, HILL: 5, MOUNTAIN: 6, SNOW: 7, LAVA: 8, BURNT: 9, ICE: 10, SWAMP: 11 };
const R = { HUMAN: 0, ZOMBIE: 5, SKELETON: 16, SHEEP: 6, WOLF: 7, BEAR: 8, DRAGON: 9, DEER: 10, PENGUIN: 11, CAMEL: 12, SCORPION: 13, SNAKE: 14, SNOWWOLF: 15, DEMON: 17, TROLL: 21, OGRE: 22, WHITEWALKER: 23, VAMPIRE: 24, KRAKEN: 25, SANDWORM: 26, BASILISK: 27, ANGEL: 28, PHOENIX: 29, ENT: 30, LICH: 31, HYDRA: 32, CHICKEN: 33, PIG: 34, RABBIT: 35, FOX: 36, FISH: 37, CRAB: 38, TURTLE: 39, SHARK: 40 };   // M-U19：HUMAN/WOLF 入表；M-U22：reap 域八族 + isHerbivoreRace 八静态 + MONSTER_LOOT 九族（types.ts R 枚举序逐值）；M-U24：SKELETON/ENT/LICH 引擎级通道三族；M-U25：BEAR/SCORPION/SNAKE/SNOWWOLF/FOX/CRAB/TURTLE/SHARK 迁徙域 SEED 十七族补全（types.ts L38/43/44/45/78/82/84/86 逐值）；M-U27：ANGEL 光环域（types.ts L62）
const W = 256, H = 160, N = W * H;
const isWater = (t) => t === T.DEEP || t === T.WATER;
const walkable = (t) => t !== T.DEEP && t !== T.WATER && t !== T.MOUNTAIN && t !== T.LAVA;   // constants.ts L73-75
const MAX_UNITS = 2400, MAX_WILDLIFE = 900, MAX_WILDLIFE_AQUATIC = 520;   // constants.ts L10/L12/L18 预算三轨（M-U23 spawnUnitM 预算门——S26 900 注入 null 支）
const idx = (x, y) => y * W + x;
const FLAMMABLE = new Set([T.GRASS, T.FOREST]);          // constants.ts FLAMMABLE（ignite L1075 门）
const TOOL3_RED = process.env.TOOL3_RED ?? '';

// RACES 子集（types.ts L163/L174/L157/L164 逐值镜像——repro/undead/hostile/flying/lavaImmune/hp/dmg/speed/isCiv 消费面）
const RACES = {
  [R.SHEEP]: { name: '绵羊', repro: 0.004, undead: false, aquatic: false, hostile: false, flying: false, lavaImmune: false, hp: 16, dmg: 1, speed: 0.038, maxAge: 26, isCiv: false, predator: false },   // L163 SHEEP（M-U19：jumpGene 重算消费面；M-U22：reap zombie/scav 消费面；M-U25：+name〔S36 eco 纪事 `${def.name}` 消费〕+maxAge 26〔S36 迁徙羊 spawnUnitM L1352 maxAge 掷属性基〕）
  [R.DEMON]: { name: '恶魔', repro: 0, undead: false, aquatic: false, hostile: true, flying: false, lavaImmune: true, isCiv: false, predator: true },          // L174 DEMON（M-U25：+predator true/isCiv false/aquatic false——predatorHuntTick L12801 主环旗消费〔S12 tick1007 普查窗口触面〕）
  [R.HUMAN]: { name: '人类', repro: 0.006, undead: false, aquatic: false, hostile: false, flying: false, lavaImmune: false, hp: 60, dmg: 8, speed: 0.09, isCiv: true },    // L157 HUMAN（M-U19：jumpGene 属性重算消费面；M-U22：isCiv 肉门/掉落门 skip）
  [R.WOLF]:  { name: '狼', repro: 0.004, undead: false, aquatic: false, hostile: false, flying: false, lavaImmune: false, hp: 34, dmg: 10, speed: 0.093, isCiv: false, predator: true }, // L164 WOLF（M-U19：wild 捕食者重算消费面；M-U22：scav predator 面；M-U25：S34 陆生扑杀出手面）
  [R.PHOENIX]: { name: '凤凰', undead: false, aquatic: false, flying: true, isCiv: false, hp: 200, dmg: 18, speed: 0.12, maxAge: 9999 },   // L189 PHOENIX（M-U22：reap zombie 门 skip〔flying〕/凤凰涅槃支；M-U23：+hp/dmg/speed/maxAge spawnUnitM 消费面——重生体 maxHp=round(200)=200）
  [R.HYDRA]: { name: '九头蛇', undead: false, aquatic: false, flying: false, isCiv: false, predator: true, hp: 500, dmg: 30, speed: 0.05, maxAge: 9999 },   // L192 HYDRA（M-U22：斩首分裂 spawn 幼蛇属性基）
  [R.TROLL]: { undead: false, aquatic: false, flying: false, isCiv: false, predator: false },       // L173 TROLL（M-U22：MONSTER_LOOT boss 面）
  [R.PIG]: { undead: false, aquatic: false, flying: false, isCiv: false, predator: false },         // L195 PIG（M-U22：肉 +1 面）
  [R.SANDWORM]: { undead: false, aquatic: false, flying: false, isCiv: false, predator: true },     // L191 SANDWORM（M-U22：尸骸残留 skip 面——防御）
  [R.ZOMBIE]: { undead: true, aquatic: false, flying: false, isCiv: false },                        // L158 ZOMBIE（M-U22：zombify 后 dump 面）
  [R.SKELETON]: { undead: true, hostile: true, aquatic: false, flying: false, lavaImmune: false, isCiv: false, predator: false, hp: 55, dmg: 14, speed: 0.075, maxAge: 9999 },   // L173 SKELETON（M-U24：lichRaise spawnUnitM 消费面——hp/dmg/speed/maxAge 属性基 + undead family 门 skip）
  // M-U25：四 aquatic 族（beachedAquaticTick L12656-12657 aquatic/beach 旗 + predatorHuntTick L12785 普查旗 +
  //   wildlifeReboundTick L12884 def.aquatic 分轨 + wildAliveAquaticM L1104 RACES[race]?.aquatic 分账 + SEED 纪事 def.name——
  //   types.ts L195-198 属性基逐值机械转写）
  [R.FISH]: { name: '鱼', undead: false, aquatic: true, hostile: false, flying: false, lavaImmune: false, isCiv: false, predator: false, hp: 6, dmg: 0.5, speed: 0.075, maxAge: 10 },   // L195 FISH（S32/S33/S35 beached 游走/搁浅主角 + S35 扑杀猎物 + S37 迁徙撒网 spawnUnitM 属性基 + isHerbivore 八静态族）
  [R.CRAB]: { name: '蟹', undead: false, aquatic: true, beach: true, hostile: false, flying: false, lavaImmune: false, isCiv: false, predator: false, hp: 16, dmg: 3, speed: 0.03, maxAge: 16 },   // L196 CRAB（beach 两栖旗——beached L12657 skip 铁证 S32）
  [R.TURTLE]: { name: '龟', undead: false, aquatic: true, hostile: false, flying: false, lavaImmune: false, isCiv: false, predator: false, hp: 40, dmg: 1, speed: 0.028, maxAge: 120 },   // L197 TURTLE（wildAliveAquatic 分账消费面——S37 wild17 注入 5）
  [R.SHARK]: { name: '鲨鱼', undead: false, aquatic: true, hostile: false, flying: false, lavaImmune: false, isCiv: false, predator: true, hp: 85, dmg: 18, speed: 0.1, maxAge: 40 },   // L198 SHARK（S33 猎游/S35 扑杀出手/S38 breed spawnUnitM 属性基——predator+aquatic 复合旗）
  // M-U25：旧场景触达面缺键族补全（beachedAquaticTickM L12656 RACES[u.race] 全量语义——蓝本 types.ts 旗面逐值；
  //   hp/dmg/speed/maxAge 非四函数消费面省略——spawn 属性基随相应切片译件补全）
  [R.DRAGON]: { name: '巨龙', undead: false, aquatic: false, hostile: true, flying: true, lavaImmune: false, isCiv: false, predator: true },   // L166（S19-S24 reap boss 面）
  [R.OGRE]: { name: '食人魔', undead: false, aquatic: false, hostile: true, flying: false, lavaImmune: false, isCiv: false, predator: true },   // L182
  [R.WHITEWALKER]: { name: '白行者', undead: true, aquatic: false, hostile: true, flying: false, lavaImmune: false, isCiv: false, predator: false },   // L183
  [R.VAMPIRE]: { name: '吸血鬼', undead: true, aquatic: false, hostile: true, flying: false, lavaImmune: false, isCiv: false, predator: false },   // L184
  [R.KRAKEN]: { name: '克拉肯', undead: false, aquatic: true, hostile: true, flying: false, lavaImmune: false, isCiv: false, predator: true },   // L187（aquatic true——beached 水中/搁浅支触达面）
  [R.BASILISK]: { name: '蛇怪', undead: false, aquatic: false, hostile: true, flying: false, lavaImmune: false, isCiv: false, predator: true },   // L190
  [R.ENT]: { name: '树人', undead: false, aquatic: false, hostile: false, flying: false, lavaImmune: false, isCiv: false, predator: false },   // L190'（S27/S28 播种主角）
  [R.ANGEL]: { name: '天使', isCiv: false, hostile: false, flying: true, predator: false, undead: false, lavaImmune: true, hp: 240, dmg: 22, speed: 0.105, maxAge: 9999, repro: 0 },   // L188 ANGEL（M-U27：光环域主角——hostile/undead 旗治愈门消费〔S47 天使渡天使 o 循环 RACES[28] 面〕）
  [R.LICH]: { name: '巫妖', undead: true, aquatic: false, hostile: true, flying: false, lavaImmune: false, isCiv: false, predator: true },   // L191'（S29/S30 复生主角——predator 但 food 缺省 70>45 出手门 skip）
  [R.DEER]: { name: '鹿', undead: false, aquatic: false, hostile: false, flying: false, lavaImmune: false, isCiv: false, predator: false },   // L167（isHerbivore 八静态族）
  [R.PENGUIN]: { name: '企鹅', undead: false, aquatic: false, hostile: false, flying: false, lavaImmune: false, isCiv: false, predator: false },   // L168
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

// M-U22 物品掉落链消费表（items.ts TABLE L64-213 key:rarity 对 + RARITY_META w L48-54 + CHEST_TIERS L790-794 机械转写——rollItem/rollChestItem 消费面）
const ITEM_RARITY = {
  sword1: 0, sword2: 0, sword3: 3, wood_club: 0, iron_dagger: 0, katana: 2, elf_blade: 2, flame_sword: 3, ice_sword: 3, excalibur: 4,
  holy_sword: 3, battle_axe: 0, warhammer: 1, berserker_axe: 2, executioner_axe: 2, thunder_hammer: 4, storm_hammer: 3, pickaxe: 0,
  hunting_spear: 0, dragon_fang: 3, dual_blades: 2, scythe: 4, dragon_slayer: 4, short_bow: 0, long_bow: 1, crossbow: 1, elf_bow: 2,
  eagle_bow: 3, hunt_bow: 0, musket: 2, rifle: 3, laser_rifle: 4, plasma_caster: 4, wood_staff: 0, mage_staff: 1, storm_staff: 3,
  archmage_staff: 4, armor1: 0, armor2: 1, cloth_robe: 0, studded_leather: 0, chain_mail: 1, iron_plate: 1, energy_shield: 4,
  gold_armor: 2, dragon_scale: 4, mithril_mail: 3, shadow_cloak: 2, berserker_hide: 0, elf_robe: 2, bone_armor: 1, obsidian_shell: 3,
  holy_vestment: 2, emperor_robe: 3, leather_cap: 0, archer_cap: 0, iron_helm: 0, horned_helm: 0, wizard_hat: 1, knight_helm: 1,
  warlock_hood: 2, viking_helm: 1, skull_mask: 1, gold_crown: 2, dragon_skull: 3, crown_kings: 4, round_shield: 0, wood_shield: 0,
  kite_shield: 0, spiked_shield: 0, iron_shield: 1, tower_shield: 1, gold_shield: 2, holy_aegis: 3, mithril_shield: 3, dragon_shield: 4,
  worn_sandal: 0, leather_boots: 0, boots: 1, mountain_boots: 0, war_greaves: 1, iron_boots: 0, swift_greaves: 2, lava_boots: 3,
  winged_sandals: 3, phantom_boots: 4, copper_ring: 0, silver_ring: 0, ring: 1, gold_ring: 0, ruby_ring: 1, sapphire_ring: 1,
  ring_power: 2, ring_fire: 3, ring_ice: 3, ring_sage: 3, ring_void: 4, ring_immortal: 4, lucky_charm: 0, wolf_fang: 0, bear_claw: 0,
  totem_stone: 1, eagle_eye: 1, vampire_fang: 2, holy_symbol: 1, moon_pendant: 2, demon_heart: 3, phoenix_feather: 3, doom_amulet: 4, god_shard: 4,
};
const ALL_ITEM_KEYS = Object.keys(ITEM_RARITY);            // L216 ALL_ITEMS 序 = TABLE 序（key:rarity 对逐行同序转写）
const RARITY_W = [46, 26, 15, 9, 4];                       // L48-54 RARITY_META w
const CHEST_TIERS = { chest: { min: 0, max: 4 }, chest2: { min: 1, max: 4 }, chest3: { min: 3, max: 4 } };   // L790-794
const FIRST0 = ['Alric', 'Berta', 'Corin', 'Dahlia', 'Edwin', 'Faye', 'Gareth', 'Hilda', 'Ivan', 'Jora', 'Kelvin', 'Lyra', 'Marcus', 'Nora', 'Osric', 'Petra'];   // names.ts L? FIRST[0] 默认名池（HYDRA 无专池 → FIRST[0]——黄金幼蛇 Kelvin/Nora 实证）
const FIRST16 = ['Bones', 'Rattle', 'Marrow', 'Creak', 'Skull', 'Grin', 'Clatter', 'Dust', 'Hollow', 'Grim'];   // names.ts FIRST[16] SKELETON 专池（M-U24：lichRaise 骷髅名掷消费面——race 键控池表）
const FIRST6 = ['Wooly', 'Fluff', 'Baaald', 'Shears', 'Cloud', 'Tumble'];   // names.ts FIRST[6] SHEEP 专池（M-U25：S36 迁徙奠基羊名掷消费面——黄金 Cloud/Baaald/Fluff/Shears/Fluff II 实证）
const FIRST_BY_RACE = { [R.SKELETON]: FIRST16, [R.SHEEP]: FIRST6 };   // names.ts FIRST 子集（本切片消费面——SKELETON/SHEEP 专池；HYDRA/FISH/SHARK 走 FIRST0 缺省——FIRST 表键 0-27，FISH 37 无专池）
const FAM_PRE = ['霜', '烬', '暴风', '血', '铁', '荆棘', '暗影', '星', '狼', '鹰', '珊瑚', '苔', '雷', '冬', '荒', '银'];   // L1112（家族姓氏前缀 16——newFamily 词法姓）
const FAM_POST = ['牙', '羽', '痕', '鬃', '棘', '誓', '歌', '爪', '翼', '须', '蹄', '岚'];   // L1113（后缀 12）
function romanM(n) {                       // names.ts L81-94 机械转写（小写表 + toUpperCase 尾——大写罗马输出「Fluff II」黄金实证）
  if (n < 1 || n > 40) return String(n);   // L82
  const table = [[40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];   // L83-84
  let out = '';                            // L86
  let v = n;                               // L87
  for (const [val, sym] of table) {        // L88
    while (v >= val) { out += sym; v -= val; }   // L89
  }
  return out.toUpperCase();                // L93
}
const AW = 32, AH = 20, CELL = 8;          // nature.ts L17-19 大气粗网格（Math.floor(256/8)=32 / 160/8=20）
function hash2N(x, y, seed) {              // noise.ts L12-18（机械转写——windAtM 湍流噪声基元）
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const smoothN = (t) => t * t * (3 - 2 * t);   // noise.ts L20
const lerpN = (a, b, t) => a + (b - a) * t;   // noise.ts L21
function valueNoiseN(x, y, seed) {         // noise.ts L25-37（2D value noise [0,1]）
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const v00 = hash2N(xi, yi, seed);
  const v10 = hash2N(xi + 1, yi, seed);
  const v01 = hash2N(xi, yi + 1, seed);
  const v11 = hash2N(xi + 1, yi + 1, seed);
  const sx = smoothN(xf);
  const sy = smoothN(yf);
  return lerpN(lerpN(v00, v10, sx), lerpN(v01, v11, sx), sy);
}

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
    this.seed = sc.baseSeed;               // M-U24：windAtM 湍流噪声种子（nature.seed ≡ GameEngine 构造 seed ≡ baseSeed——noise.ts L371/372 seed+313/+727 消费）
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
        id: uo.id, race: uo.race, civ: uo.civ ?? -1, x: uo.x, y: uo.y, tx: uo.x, ty: uo.y,
        hp: uo.hp ?? 10, maxHp: uo.maxHp ?? uo.hp ?? 10, dmg: 1, speed: 1, age: 0, maxAge: 9999, kills: 0,
        cd: 0, trait: uo.trait ?? 0, job: uo.job ?? 0, king: uo.king ?? 0, infected: uo.infected ?? false, flip: 0,   // M-U19：job 直写面；M-U22：king 直写面（onKingDeath 消费）
        name: `u${uo.id}`, hurt: uo.hurt ?? 0, breath: 0, parity: 0, dead: uo.dead ?? 0,
        ...(uo.grab !== undefined ? { grab: uo.grab } : {}),   // M-U21：grab 直写面（999 常驻冻结）
        ...(uo.wep !== undefined ? { wep: uo.wep } : {}),           // M-U22：武器槽（reap 0.35 掉落门）
        ...(uo.rebirths !== undefined ? { rebirths: uo.rebirths } : {}),   // M-U22：凤凰涅槃计数
        ...(uo.gen !== undefined ? { gen: uo.gen } : {}),           // M-U22：九头蛇世代
        ...(uo.caravan !== undefined ? { caravan: uo.caravan } : {}),     // M-U22：商队（rel 降温面）
        ...(uo.food !== undefined ? { food: uo.food } : {}),        // M-U22：饥饿（scav 面）
        ...(uo.fam !== undefined ? { fam: uo.fam } : {}),           // M-U22：家族（members-- 面）
        ...(uo.fleeT !== undefined ? { fleeT: uo.fleeT } : {}),     // M-U25：逃亡倒数（beachedAquaticTick L12661 让位门——S32 u984/S33 u994）
        ...(uo.beachTid !== undefined ? { beachTargetId: uo.beachTid } : {}),   // M-U25：猎游粘性目标预设（L12675 tid>=0 支——夹具条件键同构）
        fgn: null, gene: uo.gene ? { s: uo.gene.s, d: uo.gene.d, h: uo.gene.h, r: uo.gene.r } : null, army: null,   // gene 深拷贝（gen mkUnit 同构；fam 条件键置前防固定键覆盖——gen mkUnit 同序）
      });
    }
    this.unitById = new Map(this.units.map((u) => [u.id, u]));
    // M-U22：reap 收尸域状态面（fixture 快照注入——civ/family 瘦夹具 + unitSeq 起点锚）
    this.unitSeq = sc.fixture.unitSeq0 ?? 1;        // engine L179 unitSeq = 1（worldgen spawn 推进后快照——幼蛇 id/parity 位级锚）
    this.familySeq = sc.fixture.familySeq0 ?? 1;    // M-U25：familySeq 起点快照（L213 类字段初值 1——worldgen 播撒 fam 门命中推进；S37 尾 6 鱼 fam=27 位级锚——newFamilyM id 先取后增消费面）
    this.items = [];                                // engine L489 items
    this.itemSeq = 1;                               // engine L508
    this.phoenixAshes = [];                         // engine L492
    this.corpses = [];                              // engine L490
    this.blood = [];                                // engine L488
    this.civs = (sc.fixture.civs0 ?? []).map((c) => ({ ...c }));   // M-U22：civ 瘦夹具
    this.families = new Map((sc.fixture.families0 ?? []).map((f) => [f.id, { ...f }]));   // M-U22：family 瘦夹具
    this.rel = new Map();                           // engine rel（商队降温面）
    this.wildCount = new Map();                     // engine L440 wildCount（bumpWild 账本——黄金不 dump 断言但掷流无关，账面对齐）
    for (const [r, n] of (sc.fixture.wild0 ?? [])) this.wildCount.set(r, n);   // M-U23：wildCount 手术注入（wildAlive=Σvalues——spawnUnit L1300 预算门 null 支）
    for (const a of (sc.fixture.ashes0 ?? [])) this.phoenixAshes.push({ ...a });   // M-U23：灰烬瘦夹具（倒数窗口——零掷纯写）
    for (const c of (sc.fixture.corpses0 ?? [])) this.corpses.push({ ...c });   // M-U24：尸体瘦夹具（lichRaise r=4 最陈旧选择——零掷纯写）
    for (const [bx, by, bv] of (sc.fixture.building0 ?? [])) this.building[by * W + bx] = bv;   // M-U24：建筑瘦夹具（entGrove L13068 门——零掷纯写）
    this.natureSeason = sc.fixture.season0 ?? 0;    // M-U24：season 夹具（gen eng.nature.season 派生值快照——yearF/2%4 getter 同构消费面；lichRaise 冬 %8 门）
    this.yearF = sc.fixture.yearF0 ?? 0;            // L413 yearF 快照（newFamily founded=floor(yearF) 消费面——families 无断言面，保守同构）
    this.laws = { zombieVirus: true, reproduction: sc.fixture.repro0 ?? true };   // engine laws 子集（zombie 门——黄金默认 true；M-U25：reproduction 法则门〔wildlifeReboundTick L12841 / sharkBreedTick L12996——构造默认 true，repro0 夹具 S39 false〕）
    this.reboundLast = new Map(sc.fixture.rebound0 ?? []);   // M-U25：迁徙权重表（engine L495 类字段原生空表——rebound0 夹具 ago 权重消费面 L12871）
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
  fireTickM() {                              // L2778-2834 机械转写（M-U24：S27/S28 步进窗首触火夹具——空桩退役）
    if (this.fireSet.size === 0) return;     // L2779
    const done = [];                         // L2781（fireDone 复用列表——镜像一次一 tick 分配等价）
    for (const i of this.fireSet) {          // L2783（Set 迭代——蔓延点燃格同 tick 续访，JS Set 语义与引擎同构）
      if (this.terrain[i] === T.ICE) throw new Error('fireTickM 镜像窗口外 ICE 融冰域触达（夹具违例——覆盖域守卫）');   // L2785-2790
      this.fire[i] -= 5;                     // L2791
      if (this.fire[i] <= 0) { done.push(i); continue; }   // L2792
      if (this.building[i] > 0 && this.fire[i] < 100) { this.destroyBuilding(i); done.push(i); continue; }   // L2793-2796
      if (this.rng() < 0.4) {                // L2798（蔓延门 1 掷/燃烧格）
        const x = i % W;                     // L2799
        const y = (i / W) | 0;               // L2800
        const wcell = this.cellOfM(x, y);    // L2802
        const [wu, wv] = this.windAtM(wcell % AW, (wcell / AW) | 0);   // L2803
        for (let dy = -1; dy <= 1; dy++) {   // L2804
          for (let dx = -1; dx <= 1; dx++) { // L2805
            if (dx === 0 && dy === 0) continue;   // L2806
            const xx = x + dx;               // L2807
            const yy = y + dy;               // L2808
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L2809
            const j = idx(xx, yy);           // L2810
            if (this.terrain[j] === T.ICE) throw new Error('fireTickM 镜像窗口外邻格融冰域触达（夹具违例——覆盖域守卫）');   // L2812
            const t = this.terrain[j];       // L2813
            let p = (this.building[j] > 0 ? 0.25 : t === T.FOREST ? 0.13 : t === T.GRASS ? 0.05 : t === T.SNOW ? 0.008 : 0) * this.fireMulM(j) * 1;   // L2814（ep fire.spreadMul=1 默认值内联——M-U7m 先例）
            const dl = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;   // L2816（查表替代 hypot）
            const wproj = (wu * dx + wv * dy) / dl;   // L2817
            p *= wproj > 0.35 ? 2.1 : wproj < -0.35 ? 0.4 : 1;   // L2818（顺风 ×2.1 / 逆风 ×0.4）
            if (p > 0 && this.rng() < p) this.ignite(j);   // L2819（p>0 短路——非燃格零掷）
          }
        }
      }
    }
    for (const i of done) {                  // L2824（burnout 尾链）
      this.fireSet.delete(i);                // L2825
      this.fire[i] = 0;                      // L2826
      const t = this.terrain[i];             // L2827
      if (t === T.FOREST || t === T.GRASS) { // L2828
        this.setTerrain(i, T.BURNT);         // L2829
        this.regrow.set(i, this.tickCount + Math.round((700 + Math.floor(this.rng() * 900)) / (this.regrowMulM() * this.soilMulAt(i))));   // L2831（ep eco.regrowBase=700 内联 + 1 掷）
      }
    }
  }
  cellOfM(x, y) {                            // nature.ts L350-354（大气粗格换算）
    const cx = Math.min(AW - 1, Math.max(0, (x / CELL) | 0));
    const cy = Math.min(AH - 1, Math.max(0, (y / CELL) | 0));
    return cy * AW + cx;
  }
  itczLatM() {                               // nature.ts L338-342（ITCZ 季节摆动——laws.seasons 恒 true 窗口）
    const s = this.natureSeason;
    return 0.5 + (s === 1 ? 0.062 : s === 0 ? 0.034 : s === 2 ? -0.026 : -0.062);
  }
  jetMulM() {                                // nature.ts L344-347（急流强度季节调制）
    const s = this.natureSeason;
    return s === 3 ? 1.35 : s === 1 ? 0.85 : 1;
  }
  fireMulM(i) {                              // nature.ts L309-317（镜像窗口 glacier≡0〔gen 手术一 fill(0)〕/rainCell≡0〔initPlates fill(0) + atmTick 未跑实证〕——季节面机械保持）
    const s = this.natureSeason;
    return s === 3 ? 0.45 : s === 2 ? 0.8 : s === 0 ? 1.0 : 1.3;
  }
  regrowMulM() {                             // nature.ts L320-324（植被复苏系数——春 0.65/夏 0.9/秋 1.15/冬 2.0）
    const s = this.natureSeason;
    return s === 0 ? 0.65 : s === 1 ? 0.9 : s === 2 ? 1.15 : 2.0;
  }
  windAtM(cx, cy) {                          // nature.ts L356-401（风矢量——pSystems/storms 构造期空表 + windPhase≡0〔L63 初值，atmTick L432 未跑〕窗口实证）
    const lat = cy / (AH - 1);               // L357（0 北极 → 1 南极）
    const itcz = this.itczLatM();            // L358
    const latA = Math.abs(lat - itcz) * 2;   // L359
    let u;                                   // L361
    if (latA < 0.32) u = -0.55 + latA * 0.9; // L362（信风带西向）
    else if (latA < 0.72) u = 0.75 - (latA - 0.32) * 0.35;   // L363（西风带东向）
    else u = -0.45 + (latA - 0.72) * 1.6;    // L364（极风带西向）
    const jet = this.jetMulM();              // L366
    const g1 = Math.exp(-((latA - 0.38) ** 2) / 0.005);   // L367
    const g2 = Math.exp(-((latA - 0.62) ** 2) / 0.0098);  // L368
    u += (g1 * 0.55 + g2 * 0.95) * jet;      // L369
    const n = valueNoiseN(cx / 6, cy / 6, this.seed + 313) - 0.5;    // L371（windPhase≡0 化简——同名噪声明）
    const n2 = valueNoiseN(cx / 9, cy / 9, this.seed + 727) - 0.5;   // L372
    u += n * 0.5;                            // L373
    const v = n2 * 0.35;                     // L374
    // L376-397 pSystems/storms 气旋环流——双表构造期空 + 窗口内无风暴生成零效应（机械保持省略——覆盖域守卫语义）
    return [u, v];                           // L400
  }
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
    this.unitsReap();                        // L3215（M-U22 接线——收尸域全函数）
  }
  // ---- M-U25 引擎级通道四件套镜像（蓝本 L12652-13014 机械转写——调用面：runner effectsTick/unitsTick
  //        步进通道 L2614/L2616/L2618/L2620 门〔蓝本门原样〕。辅助：findWaterNearM L5552-5586 零掷纯扫描；
  //        WB.syncDead 宿主桥接面无头 no-op——掷流零差异）----
  findWaterNearM(x, y, r) {                  // L5552-5586 机械转写（零掷纯扫描——搁浅归海导向消费面）
    const cx = Math.floor(x);                // L5553
    const cy = Math.floor(y);                // L5554
    for (let ring = 1; ring <= r; ring++) {  // L5555
      for (let dy = -ring; dy <= ring; dy++) {   // L5556
        for (let dx = -ring; dx <= ring; dx++) {   // L5557
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;   // L5558（只看当前环）
          const xx = cx + dx;                  // L5559
          const yy = cy + dy;                  // L5560
          if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) continue;   // L5561
          const i = idx(xx, yy);               // L5562
          if (!isWater(this.terrain[i])) continue;   // L5563
          let waterN = 0;                      // L5564
          for (let ny = -1; ny <= 1; ny++) {   // L5565
            for (let nx = -1; nx <= 1; nx++) {   // L5566
              if (nx === 0 && ny === 0) continue;   // L5567（自身不计）
              if (isWater(this.terrain[idx(xx + nx, yy + ny)])) waterN++;   // L5568
            }
          }
          if (waterN >= 5) return { x: xx + 0.5, y: yy + 0.5 };   // L5570（≥5 邻水实心水体）
        }
      }
    }
    return null;                             // L5585
  }
  beachedAquaticTickM() {                    // L12652-12753 机械转写（M-U25：水生搁浅整治引擎级通道——逐 tick 无门）
    if (TOOL3_RED === 'beached') return;     // 红证旋钮：禁全写面（游走 tx/ty 采样 + 搁浅 beachT/hurt/dead/归海 + 猎游目标全缺 → S32/S33 stepBeach 断言面 FAIL）
    const retarget = this.tickCount % 20 === 0;   // L12653（目标采样每 20 tick 一次；断言逐 tick 廉价）
    for (const u of this.units) {            // L12654
      if (u.dead) continue;                  // L12655
      const def = RACES[u.race];             // L12656
      if (!def.aquatic || def.beach) continue;   // L12657（纯水生——蟹 beach 两栖 skip）
      const ti = idx(Math.floor(u.x), Math.floor(u.y));   // L12658
      if (isWater(this.terrain[ti])) {       // L12659（水中支）
        u.beachT = 0;                        // L12660（窒息计数清零——键置 0：dumpUnit 条件键面）
        if ((u.fleeT ?? 0) > 0) { u.beachTx = undefined; u.beachTy = undefined; continue; }   // L12661（逃亡交给内核 AI）
        if (def.predator) {                  // L12662（捕食者猎游支）
          if (retarget || u.beachTx == null || u.beachTy == null) {   // L12669
            let tgt = null;                  // L12674
            const tid = (u.beachTargetId ?? -1);   // L12675（粘性目标 id——缺省 -1）
            if (tid >= 0) {                  // L12676
              const cand = this.units.find((q) => q.id === tid && !q.dead);   // L12677
              if (cand && !RACES[cand.race].isCiv) {   // L12678
                const cj = Math.floor(cand.y) * W + Math.floor(cand.x);   // L12679
                const dx = cand.x - u.x, dy = cand.y - u.y;   // L12680
                if (isWater(this.terrain[cj]) && dx * dx + dy * dy <= 1600) tgt = cand;   // L12681（≤40 格粘住 + 实体水门）
              }
            }
            if (!tgt) {                      // L12684（散签初选）
              const cands = [];              // L12685
              for (const q of this.units) {  // L12686
                if (q.dead || q.race === u.race) continue;   // L12687
                if (RACES[q.race].isCiv || !this.isHerbivoreRaceM(q.race)) continue;   // L12688（镜像方法名映射 isHerbivoreRace→isHerbivoreRaceM）
                const qx = Math.floor(q.x), qy = Math.floor(q.y);   // L12689
                const qj = qy * W + qx;      // L12690
                if (!isWater(this.terrain[qj])) continue;   // L12691（只追水中猎物）
                let wn = 0;                  // L12694（实体水过滤：≥5 邻水）
                for (let ny = -1; ny <= 1; ny++) for (let nx = -1; nx <= 1; nx++) {   // L12695
                  const xx = qx + nx, yy = qy + ny;   // L12696
                  if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L12697
                  if (isWater(this.terrain[yy * W + xx])) wn++;   // L12698
                }
                if (wn < 6) continue;        // L12700（自身 3x3 含自身 ≥6——岸边浅洼排除）
                const dx = q.x - u.x, dy = q.y - u.y;   // L12701
                cands.push({ q, d2: dx * dx + dy * dy });   // L12702
              }
              if (cands.length > 0) {        // L12704
                cands.sort((a, b) => a.d2 - b.d2);   // L12705（最近排序）
                const top = cands.slice(0, Math.min(6, cands.length));   // L12706（top6）
                const pick = top[Math.floor(this.rng() * top.length)];   // L12707（抽签 1 掷）
                tgt = pick.q;                // L12708
              }
            }
            u.beachTargetId = tgt ? tgt.id : undefined;   // L12711
            if (tgt) { u.beachTx = tgt.x; u.beachTy = tgt.y; }   // L12712
            else { u.beachTx = undefined; u.beachTy = undefined; }   // L12713
          } else if (u.beachTargetId != null) {   // L12714（粘性目标的逐 tick 坐标刷新）
            const tgt = this.units.find((q) => q.id === u.beachTargetId && !q.dead);   // L12716（死亡支 tgt null 不清 beachTx——陈旧保持蓝本语义 S35）
            if (tgt) { u.beachTx = tgt.x; u.beachTy = tgt.y; }   // L12717
          }
          if (u.beachTx != null && u.beachTy != null) { u.tx = u.beachTx; u.ty = u.beachTy; }   // L12719（逐 tick 断言）
          continue;                          // L12720
        }
        u.beachTx = undefined; u.beachTy = undefined;   // L12722（非捕食者逐 tick 清空——蓝本真相：L12723 门恒真逐 tick 重采样，与「每 20 tick 重采样」注释不符——C# 机械翻译按代码不按注释）
        if (retarget || u.beachTx == null) {   // L12723（恒真）
          const far = this.rng() < 0.25;     // L12726（25% 远散布 1 掷）
          const spread = far ? 14 : 6;       // L12727
          for (let k = 0; k < 8; k++) {      // L12728（8 试实体水）
            const wx = Math.max(1, Math.min(W - 2, Math.floor(u.x + (this.rng() * 2 - 1) * spread)));   // L12729（2 掷/试）
            const wy = Math.max(1, Math.min(H - 2, Math.floor(u.y + (this.rng() * 2 - 1) * spread)));   // L12730
            const j = wy * W + wx;           // L12731
            if (!isWater(this.terrain[j])) continue;   // L12732
            let wn = 0;                      // L12733（邻水环扫——蓝本无界外检查：typed 数组 OOB undefined → isWater false 同构）
            for (let ny = -1; ny <= 1; ny++) for (let nx = -1; nx <= 1; nx++) {   // L12734
              if (isWater(this.terrain[j + ny * W + nx])) wn++;   // L12735
            }
            if (wn >= 6) { u.beachTx = wx + 0.5; u.beachTy = wy + 0.5; break; }   // L12737（含自身 ≥6 实体水）
          }
        }
        if (u.beachTx != null && u.beachTy != null) { u.tx = u.beachTx; u.ty = u.beachTy; }   // L12740
        continue;                            // L12741
      }
      // —— 搁浅：窒息 + 归海导向 ——     // L12743
      u.beachT = (u.beachT ?? 0) + 1;        // L12744（窒息计数逐 tick）
      u.hurt = Math.max(u.hurt, 2);          // L12745（挣扎受伤——int 轨）
      if (retarget || u.beachTx == null) {   // L12746
        const w = this.findWaterNearM(u.x, u.y, 16);   // L12747（r=16 环扫零掷）
        if (w) { u.beachTx = w.x; u.beachTy = w.y; }   // L12748
      }
      if (u.beachTx != null && u.beachTy != null) { u.tx = u.beachTx; u.ty = u.beachTy; }   // L12750
      if ((u.beachT ?? 0) >= 15) u.dead = true;   // L12751（窒息终局交常规收尸）
    }
  }
  predatorHuntTickM() {                      // L12764-12833 机械转写（M-U25：猎手扑杀引擎级通道——%20===7 门在 runner）
    if (TOOL3_RED === 'hunt') return;        // 红证旋钮：禁扑杀全写面（prey.dead/food/fx 全缺 → S34/S35 FAIL）
    let preyAlive = 0;                       // L12769（猎物存量普查 O(n)）
    let fishAlive = 0;                       // L12770
    for (const q of this.units) {            // L12771
      if (!q.dead && !RACES[q.race].isCiv && this.isHerbivoreRaceM(q.race)) {   // L12772
        preyAlive++;                         // L12773
        if (RACES[q.race].aquatic) fishAlive++;   // L12774
      }
    }
    let hungryAqua = 0;                      // L12781（水生预算随饿鲨规模伸缩）
    for (const p of this.units) {            // L12782
      if (p.dead) continue;                  // L12783
      const pd = RACES[p.race];              // L12784
      if (pd.predator && pd.aquatic && !pd.undead && !pd.isCiv && (p.food ?? 70) <= 300) hungryAqua++;   // L12785
    }
    let capLand = 8;                         // L12788（分级预算：>150 满额）
    let capAqua = Math.min(10, Math.max(4, Math.ceil(hungryAqua * 0.75)));   // L12789（4-10 弹性）
    if (preyAlive <= 150) { capLand = 4; capAqua = Math.ceil(capAqua / 2); }   // L12790（减半）
    if (preyAlive <= 60) { capLand = 2; capAqua = Math.max(1, Math.ceil(capAqua / 4)); }   // L12791（收缩）
    if (preyAlive <= 25) { capLand = 0; capAqua = 0; }   // L12792（生态保护期禁猎）
    capAqua = Math.min(capAqua, Math.max(1, Math.round(fishAlive / 28)));   // L12795（猎物存量平滑耦合）
    let killsLand = 0;                       // L12796
    let killsAqua = 0;                       // L12797
    for (const p of this.units) {            // L12798
      if (p.dead) continue;                  // L12799
      const pd = RACES[p.race];              // L12800
      if (!pd.predator || pd.undead || pd.isCiv) continue;   // L12801
      if (pd.aquatic ? killsAqua >= capAqua : killsLand >= capLand) continue;   // L12802（弹性预算）
      if ((p.food ?? 70) > (pd.aquatic ? 300 : 45)) continue;   // L12806（出手门双轨——?? 70 缺省）
      let prey = null;                       // L12807
      let bd = pd.aquatic ? 196 : 2.56;      // L12808（扑杀窗口：陆 r=1.6 / 水 r=14 深海突袭抽象）
      for (const q of this.units) {          // L12811
        if (q.dead || (q.grab ?? 0) > 0) continue;   // L12812（神明手中之物不捕）
        if (RACES[q.race].isCiv || !this.isHerbivoreRaceM(q.race)) continue;   // L12813
        const dx = q.x - p.x, dy = q.y - p.y;   // L12814
        const d2 = dx * dx + dy * dy;        // L12815
        if (d2 < bd) { bd = d2; prey = q; }  // L12816（最近严格 <）
      }
      if (!prey) continue;                   // L12818
      prey.dead = true;                      // L12819
      // L12820 WB.syncDead(prey)——WASM 镜像宿主桥接（无头 no-op——后续扫描 units 数组序消费同构）
      this.fx('blood', prey.x, prey.y, 14);  // L12821（血泊 2 掷）
      if (pd.aquatic) {                      // L12822
        killsAqua++;                         // L12823
        this.fx('water', prey.x, prey.y, 16);   // L12826（深海突袭水花 2 掷）
      } else {
        killsLand++;                         // L12828
      }
      p.food = Math.min(400, (p.food ?? 0) + 25);   // L12830（扑杀即刻进食）
      if ((p.food ?? 0) >= 380) break;       // L12831（吃饱收手——前置 355>300 出手门不可达：防御死码注记）
    }
  }
  wildlifeReboundTickM() {                   // L12840-12989 机械转写（M-U25：百兽迁徙引擎级通道——%600===61 门在 runner）
    if (TOOL3_RED === 'rebound') return;     // 红证旋钮：禁迁徙全写面（spawn/wildCount/reboundLast/fx/event 全缺 → S36/S37 FAIL）
    if (!this.laws.reproduction) return;     // L12841（神明关闭繁衍法则——世界静寂 S39）
    const isW = (t) => t === T.DEEP || t === T.WATER;   // L12844
    const SEED = [                        // L12845-12863（奠基者名单十七族——与 worldgen trySpawn 播撒对齐）
      { race: R.SHEEP, n: [3, 5], habitat: (t) => t === T.GRASS },       // L12846
      { race: R.WOLF, n: [2, 3], habitat: (t) => t === T.FOREST },       // L12847
      { race: R.BEAR, n: [1, 2], habitat: (t) => t === T.FOREST },       // L12848
      { race: R.DEER, n: [2, 4], habitat: (t) => t === T.GRASS },        // L12849
      { race: R.PENGUIN, n: [2, 3], habitat: (t) => t === T.SNOW },      // L12850
      { race: R.CAMEL, n: [2, 3], habitat: (t) => t === T.SAND },        // L12851
      { race: R.SCORPION, n: [2, 3], habitat: (t) => t === T.SAND },     // L12852
      { race: R.SNAKE, n: [2, 3], habitat: (t) => t === T.SAND },        // L12853
      { race: R.SNOWWOLF, n: [2, 3], habitat: (t) => t === T.SNOW },     // L12854
      { race: R.CHICKEN, n: [3, 5], habitat: (t) => t === T.GRASS },     // L12855
      { race: R.PIG, n: [2, 4], habitat: (t) => t === T.GRASS },         // L12856
      { race: R.RABBIT, n: [3, 5], habitat: (t) => t === T.GRASS || t === T.FOREST },   // L12857
      { race: R.FOX, n: [1, 2], habitat: (t) => t === T.FOREST },        // L12858
      { race: R.FISH, n: [4, 7], habitat: isW },                          // L12859
      { race: R.CRAB, n: [2, 3], habitat: (t) => t === T.SAND },          // L12860
      { race: R.TURTLE, n: [2, 3], habitat: isW },                        // L12861
      { race: R.SHARK, n: [1, 2], habitat: isW },                         // L12862
    ];
    const extinct = SEED.filter((s) => (this.wildCount.get(s.race) ?? 0) === 0);   // L12865（灭绝名单 O(1) 分种族计数）
    if (extinct.length === 0) return;        // L12866
    if (this.rng() > 0.6) return;            // L12867（掷签门 1 掷——并非每轮都迁来 S40）
    const weights = extinct.map((s) => {     // L12870（加权：灭绝越久权重越高 1→5 封顶）
      const last = this.reboundLast.get(s.race);   // L12871
      const ago = last === undefined ? Number.MAX_SAFE_INTEGER : this.tickCount - last;   // L12872
      return 1 + Math.min(4, ago / 2400);    // L12873
    });
    const totalW = weights.reduce((a, b) => a + b, 0);   // L12875
    let pick = this.rng() * totalW;          // L12876（加权掷签 1 掷）
    let idx2 = extinct.length - 1;           // L12877（蓝本局部 let idx 遮蔽全局 idx 函数——镜像改名 idx2 防转写歧义，语义同构：尾元 fallback）
    for (let i = 0; i < extinct.length; i++) {   // L12878
      pick -= weights[i];                    // L12879
      if (pick <= 0) { idx2 = i; break; }    // L12880
    }
    const seed = extinct[idx2];              // L12882
    const def = RACES[seed.race];            // L12883
    const aquatic = !!def.aquatic;           // L12884
    if (aquatic ? this.wildAliveAquaticM() >= MAX_WILDLIFE_AQUATIC - 8 : this.wildAliveM() >= MAX_WILDLIFE - 8) return;   // L12886（预算分轨：水生掷签看海洋配额）
    if (seed.race === R.SHARK) {             // L12889（鲨鱼特例：锚定一条活鱼落位）
      const fishes = this.units.filter((q) => !q.dead && q.race === R.FISH);   // L12890
      if (fishes.length > 0) {              // L12891
        let placed = 0;                      // L12892
        const n = seed.n[0] + Math.floor(this.rng() * (seed.n[1] - seed.n[0] + 1));   // L12893（1 掷群规模）
        for (let k = 0; k < n; k++) {        // L12894
          const f = fishes[Math.floor(this.rng() * fishes.length)];   // L12895（1 掷锚鱼）
          for (let t2 = 0; t2 < 8; t2++) {   // L12896
            const jx = Math.max(0.5, Math.min(W - 0.5, f.x + (this.rng() * 3 - 1.5)));   // L12897（1 掷抖动）
            const jy = Math.max(0.5, Math.min(H - 0.5, f.y + (this.rng() * 3 - 1.5)));   // L12898（1 掷抖动）
            const j = Math.floor(jy) * W + Math.floor(jx);   // L12899
            if (!isWater(this.terrain[j])) continue;   // L12900（诞崽落水门同构）
            if (this.spawnUnitM(R.SHARK, jx, jy, { silent: true })) placed++;   // L12901
            break;                           // L12902
          }
        }
        if (placed > 0) {                    // L12905
          this.reboundLast.set(seed.race, this.tickCount);   // L12906
          this.fx('spawn', fishes[0].x, fishes[0].y, 46);   // L12907（2 掷）
          this.addEvent('eco', `洋流送来了远方的族群——${def.name}循着鱼群的踪迹重新游回了这片海域`, { x: fishes[0].x, y: fishes[0].y });   // L12908
        }
        return;                              // L12910
      }
      // 无鱼可锚（海洋真空）→ 落回通用随机采样   // L12912
    }
    if (seed.race === R.FISH) {              // L12917（鱼群补种撒网式落位特例）
      const spots = [];                      // L12918
      for (let tries = 0; tries < 260 && spots.length < 3; tries++) {   // L12919（260 试三锚）
        const x = 2 + Math.floor(this.rng() * (W - 4));   // L12920（1 掷）
        const y = 2 + Math.floor(this.rng() * (H - 4));   // L12921（1 掷）
        const i = y * W + x;                 // L12922
        if (!seed.habitat(this.terrain[i])) continue;   // L12923
        let ok = true;                       // L12924
        for (const s of spots) {             // L12925（锚间 ≥18 格）
          const dx = s.x - x, dy = s.y - y;  // L12926
          if (dx * dx + dy * dy < 324) { ok = false; break; }   // L12927
        }
        if (!ok) continue;                   // L12929
        spots.push({ x, y });                // L12930
      }
      let placed = 0;                        // L12932
      for (const s of spots) {               // L12933
        const n = 2 + Math.floor(this.rng() * 2);   // L12934（每锚 2-3 尾 1 掷）
        for (let k = 0; k < n; k++) {        // L12935
          for (let t2 = 0; t2 < 8; t2++) {   // L12936
            const jx = s.x + (this.rng() * 2.5 - 1.25), jy = s.y + (this.rng() * 2.5 - 1.25);   // L12937（±1.25 抖动 2 掷）
            const j = Math.max(0, Math.min(W * H - 1, Math.floor(jy) * W + Math.floor(jx)));   // L12938（j 钳 [0, W*H-1]）
            if (!seed.habitat(this.terrain[j])) continue;   // L12939
            if (this.spawnUnitM(R.FISH, jx, jy, { silent: true })) placed++;   // L12940
            break;                           // L12941
          }
        }
      }
      if (placed > 0) {                      // L12945
        this.reboundLast.set(seed.race, this.tickCount);   // L12946
        const s0 = spots[0];                 // L12947
        this.fx('spawn', s0.x + 0.5, s0.y + 0.5, 46);   // L12948（2 掷）
        this.addEvent('eco', `洋流送来了远方的族群——${def.name}重新出现在这片水域`, { x: s0.x + 0.5, y: s0.y + 0.5 });   // L12949
      }
      return;                                // L12951
    }
    for (let tries = 0; tries < 140; tries++) {   // L12953（通用支：140 试栖息地采样）
      const x = 2 + Math.floor(this.rng() * (W - 4));   // L12954（1 掷）
      const y = 2 + Math.floor(this.rng() * (H - 4));   // L12955（1 掷）
      const i = y * W + x;                   // L12956
      if (!seed.habitat(this.terrain[i])) continue;   // L12957
      if (seed.race === R.CRAB) {            // L12958（蟹需 r=2 内有水）
        let w = 0;                           // L12959
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {   // L12960
          const nx = x + dx, ny = y + dy;    // L12961
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;   // L12962
          if (isWater(this.terrain[ny * W + nx])) w++;   // L12963
        }
        if (w === 0) continue;               // L12965
      }
      const n = seed.n[0] + Math.floor(this.rng() * (seed.n[1] - seed.n[0] + 1));   // L12968（1 掷群规模）
      let placed = 0;                        // L12969
      for (let k = 0; k < n; k++) {          // L12970（奠基者逐只采样）
        for (let t2 = 0; t2 < 10; t2++) {    // L12971
          const jx = x + (this.rng() * 3 - 1.5), jy = y + (this.rng() * 3 - 1.5);   // L12972（±1.5 抖动 2 掷）
          const j = Math.max(0, Math.min(W * H - 1, Math.floor(jy) * W + Math.floor(jx)));   // L12973
          if (!seed.habitat(this.terrain[j])) continue;   // L12974
          const nu = this.spawnUnitM(seed.race, jx, jy, { silent: true });   // L12975（spawnUnit silent 6 掷链）
          if (nu) placed++;                  // L12976
          break;                             // L12977
        }
      }
      if (placed === 0) continue;            // L12980（落点全数失败 → 换个点再试）
      this.reboundLast.set(seed.race, this.tickCount);   // L12981
      this.fx('spawn', x + 0.5, y + 0.5, 46);   // L12982（2 掷）
      const msg = aquatic                    // L12983（双文本）
        ? `洋流送来了远方的族群——${def.name}重新出现在这片水域`
        : `远方的兽群跋涉而来——${def.name}重新踏上了这片大地`;
      this.addEvent('eco', msg, { x: x + 0.5, y: y + 0.5 });   // L12986
      return;                                // L12987（每轮至多一支兽群迁入）
    }
  }
  sharkBreedTickM() {                        // L12995-13014 机械转写（M-U25：鲨群繁衍辅助引擎级通道——%240===13 门在 runner）
    if (TOOL3_RED === 'breed') return;       // 红证旋钮：禁繁衍全写面（pup/food/fx 全缺 → S38 FAIL）
    if (!this.laws.reproduction) return;     // L12996（神明关闭繁衍法则时静默）
    const sharks = this.units.filter((u) => !u.dead && u.race === R.SHARK);   // L12997
    if (sharks.length === 0 || sharks.length >= 8) return;   // L12998（种群地板 0<len<8）
    const mother = sharks.find((s) => (s.food ?? 0) > 220);   // L12999（肥鲨母体）
    if (!mother) return;                     // L13000
    for (let t = 0; t < 8; t++) {            // L13001（8 试落水门）
      const jx = Math.max(0.5, Math.min(W - 0.5, mother.x + (this.rng() * 3 - 1.5)));   // L13002（1 掷抖动）
      const jy = Math.max(0.5, Math.min(H - 0.5, mother.y + (this.rng() * 3 - 1.5)));   // L13003（1 掷抖动）
      const j = Math.floor(jy) * W + Math.floor(jx);   // L13004
      if (!isWater(this.terrain[j])) continue;   // L13005（诞崽必须落水）
      const pup = this.spawnUnitM(R.SHARK, jx, jy, { silent: true });   // L13006（spawnUnit silent 6 掷链）
      if (pup) {                             // L13007
        mother.food = Math.max(0, (mother.food ?? 0) - 60);   // L13008（妊娠成本）
        this.fx('spawn', jx, jy, 30);        // L13009（2 掷）
        this.fx('water', jx, jy, 18);        // L13010（诞崽水花 2 掷）
      }
      break;                                 // L13012（至多一崽）
    }
  }
  // ---- M-U27 angelAuraTick L13138-13161（天使光环引擎级通道：治愈周围无辜生灵〔含国民/动物〕
  //        + 驱散瘟疫——phase=(tickCount/3)|0 相位门 (phase+id*13)%50===0〔id 按位错开防同帧扎堆〕；
  //        治愈内环门序：dead/o===a → hostile/undead〔只渡无辜者〕→ hp满&&!infected → d²>12.25
  //        〔r=3.5²〕→ hp<maxHp 支 min(maxHp,hp+max(10,maxHp*0.25))+bless16 → infected 支清+bless20
  //        → healed 上限 10 break → 本体 bless34 + onSound heal〔宿主 no-op〕。
  //        调用面：runner L2604 %3 门〔phoenixAshTick 前——L2604<L2606 蓝本序；旧 40 场景无 ANGEL 族外层环零效应零掷〕）----
  angelAuraTick() {
    if (TOOL3_RED === 'aura') return;          // 红证旋钮：禁扫描全写面（S43-S48 hp/infected/fx/rngA FAIL）
    const phase = (this.tickCount / 3) | 0;    // L13139
    for (const a of this.units) {              // L13140
      if (a.dead || a.race !== R.ANGEL) continue;   // L13141
      if ((phase + a.id * 13) % 50 !== 0) continue; // L13142（S42 相位拒）
      let healed = 0;                          // L13143
      for (const o of this.units) {            // L13144
        if (o.dead || o === a) continue;       // L13145（自遇 skip——S47 随行）
        const od = RACES[o.race];              // L13146
        if (od.hostile || od.undead) continue; // L13147（S46 敌对/亡灵拒——只渡无辜者）
        if (o.hp >= o.maxHp && !o.infected) continue;   // L13148（S43 满血拒——S44 感染羊不拒）
        const dxo = o.x - a.x;                 // L13149
        const dyo = o.y - a.y;                 // L13150
        if (dxo * dxo + dyo * dyo > 12.25) continue;    // L13151（S46 圈外拒——r=3.5²）
        if (o.hp < o.maxHp) {                  // L13152
          o.hp = Math.min(o.maxHp, o.hp + Math.max(10, o.maxHp * 0.25));   // L13153（S43 hp 5→15 位级）
          this.fx('bless', o.x, o.y, 16);      // L13154
        }
        if (o.infected) { o.infected = false; this.fx('bless', o.x, o.y, 20); }   // L13156（S44/S45 清瘟面）
        if (++healed >= 10) break;             // L13157（S48 cap10——第 11 只未触）
      }
      if (healed > 0) { this.fx('bless', a.x, a.y, 34); /* L13159 onSound?.('heal')——宿主音效 no-op（黄金窗口无消费面） */ }   // L13159
    }
  }
  // ---- M-U23 phoenixAshTick L13018-13032（凤凰涅槃引擎级通道：灰烬倒数到点重生机械转写——
  //        调用面：runner unitsTick 步进通道 L2606 门〔len>0 蓝本门原样，旧场景 ashes 空门假零效应〕----
  phoenixAshTick() {
    for (let i = this.phoenixAshes.length - 1; i >= 0; i--) {   // L13019 逆序环
      const a = this.phoenixAshes[i];        // L13020
      a.t -= 2;                              // L13021（与 cd 同款节拍：1 tick = 2 单位）
      if (a.t > 0) continue;                 // L13022
      if (TOOL3_RED === 'phoenix') continue; // 红证旋钮：禁到点全写面（splice/spawn/fx/toast/event 全缺 → S25/S26 step4 ashes/units/fx FAIL）
      this.phoenixAshes.splice(i, 1);        // L13023
      const nu = this.spawnUnitM(R.PHOENIX, a.x, a.y, { silent: true });   // L13024（预算门 null 支——S26 实证）
      if (nu) nu.rebirths = a.rebirths;      // L13025（重生体继承涅槃计数）
      this.fx('spawn', a.x, a.y, 46);        // L13026
      this.fx('fireball', a.x, a.y - 1, 30); // L13027
      this.toast('凤凰在灰烬中重生了', 'info');   // L13028
      this.addEvent('phoenix', '烈焰冲天而起——凤凰自灰烬中振翼重生', { x: a.x, y: a.y });   // L13029
      // L13030 onSound?.('phoenix')——宿主音效 no-op（黄金窗口无消费面）
    }
  }
  // ---- M-U24 hydraRegenTick L13038-13047（九头蛇回血引擎级通道：season===3 冬眠 return +
  //        hp<maxHp 支 hp=min(maxHp, hp+maxHp×0.02) + hurt=0 再生清创——u.dead 支 tick 通道
  //        不可达〔unitsReap 先于门摘净死单位〕。调用面：runner L2612 %30 门）----
  hydraRegenTick() {
    if (TOOL3_RED === 'hydra') return;         // 红证旋钮：禁回血全写面（S31 hp 100 恒值 → step units hp FAIL）
    if (this.natureSeason === 3) return;       // L13039（冬眠：霜降之日，多头蛇的再生之泉一并封冻——S28 面）
    for (const u of this.units) {              // L13040
      if (u.dead || u.race !== R.HYDRA) continue;   // L13041
      if (u.hp < u.maxHp) {                    // L13042
        u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.02);   // L13043（300×0.02=6.0 f64 精确）
        u.hurt = 0;                            // L13044（再生中不残留受创闪红）
      }
    }
  }
  // ---- M-U24 entGroveTick L13055-13097（树人播种引擎级通道：①播种 2 采样/树人 ang/rr 2 掷
  //        + building 门 + 界外 j 门 + 地形门 GRASS 0.22pm/BURNT 0.45pm/SAND 0.06pm 短路掷
  //        〔pm 春 1.3；sn===3 冬蛰整支 skip〕+ setTerrain(FOREST) 级联 + spark fx ≤6；
  //        ②扑火 r=2.5 零掷；声门 planted>0&&rng<0.35 掷位保留〔onSound 宿主 no-op——掷位不丢〕。
  //        调用面：runner L2608 %10 门）----
  entGroveTick() {
    if (TOOL3_RED === 'grove') return;         // 红证旋钮：禁播种+扑火+声门掷全写面（S27 rngA/terrainMd5 FAIL + S28 扑火面 FAIL）
    let planted = 0;                           // L13056
    const sn = this.natureSeason;              // L13057（季节节律：春播冬蛰——一次采样，循环内共用）
    for (const u of this.units) {              // L13058
      if (u.dead || u.race !== R.ENT) continue;   // L13059
      if (sn !== 3) {                          // L13061（蛰伏：冬雪封地时树人收拢枝桠——S28 零掷支）
        const pm = sn === 0 ? 1.3 : 1;         // L13062（春播热情：种子在暖雨里更敢扎根）
        for (let k = 0; k < 2; k++) {          // L13063
          const ang = this.rng() * Math.PI * 2;   // L13064
          const rr = 1 + this.rng() * 2.5;     // L13065
          const j = idx(Math.floor(u.x + Math.cos(ang) * rr), Math.floor(u.y + Math.sin(ang) * rr));   // L13066
          if (j < 0 || j >= W * H) continue;   // L13067（S27 u902 落 (-2,0) 界外支）
          if (this.building[j] > 0) continue;  // L13068（S27 u901 落 (108,65) 建筑盘支）
          const t = this.terrain[j];           // L13069
          if ((t === T.GRASS && this.rng() < 0.22 * pm) || (t === T.BURNT && this.rng() < 0.45 * pm) || (t === T.SAND && this.rng() < 0.06 * pm)) {   // L13070（短路 || 各一掷）
            this.setTerrain(j, T.FOREST);      // L13071（级联——regrow.delete/fire 灭/refreshWaterTierAround 面）
            planted++;                         // L13072
            if (planted <= 6) this.fx('spark', (j % W) + 0.5, ((j / W) | 0) + 0.5, 14);   // L13073
          }
        }
      }
      const ex = Math.floor(u.x);              // L13078
      const ey = Math.floor(u.y);              // L13079
      for (let dy = -2; dy <= 2; dy++) {       // L13080
        for (let dx = -2; dx <= 2; dx++) {     // L13081
          if (dx * dx + dy * dy > 6.25) continue;   // L13082（r=2.5²）
          const xx = ex + dx;                  // L13083
          const yy = ey + dy;                  // L13084
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;   // L13085
          const j = idx(xx, yy);               // L13086
          if (this.fire[j] > 0) {              // L13087
            this.fire[j] = 0;                  // L13088
            this.fireSet.delete(j);            // L13089
            this.fx('water', xx + 0.5, yy + 0.5, 12);   // L13090
          }
        }
      }
    }
    if (planted > 0 && this.rng() < 0.35) { /* L13096 onSound?.('ent')——宿主音效 no-op（声门掷位保留——掷流不丢） */ }
  }
  // ---- M-U24 lichRaiseTick L13105-13131（巫妖复生引擎级通道：骷髅计数 >40 顶层 return +
  //        尸体 r=4 stone skip + 最陈旧 c.age>bestAge 选择 + spawnUnit(SKELETON,silent) 5 掷链
  //        〔trait/maxAge/flip/名 FIRST16/breath——undead family 门 skip〕+ corpses.splice +
  //        fx skull y-1 26 / smoke 16 + addEvent lich events<3 门。!nu null 支挂账（S26 同构
  //        语义——SKELETON 2400 注入不经济）。调用面：runner L2611 %12〔冬 %8〕门）----
  lichRaiseTick() {
    if (TOOL3_RED === 'lich') return;          // 红证旋钮：禁复生全写面（S29 rngA/units/corpses FAIL）
    let skeletons = 0;                         // L13106
    for (const s of this.units) if (!s.dead && s.race === R.SKELETON) skeletons++;   // L13107
    if (skeletons > 40) return;                // L13108（S30 41 骷髅上限门——尸体保留零掷）
    let events = 0;                            // L13109
    for (const l of this.units) {              // L13110（for..of 访问 spawn 追加尾元——race≠LICH skip，与引擎同构）
      if (l.dead || l.race !== R.LICH) continue;   // L13111
      let best = -1;                           // L13112
      let bestAge = -1;                        // L13113
      for (let i = 0; i < this.corpses.length; i++) {   // L13114
        const c = this.corpses[i];             // L13115
        if (c.stone) continue;                 // L13116（石像：灵魂被封在石壳里——S29 c2 支）
        const dx = c.x - l.x;                  // L13117
        const dy = c.y - l.y;                  // L13118
        if (dx * dx + dy * dy > 16) continue;  // L13119（4²——S29 c3 支）
        if (c.age > bestAge) { bestAge = c.age; best = i; }   // L13120（最陈旧选择）
      }
      if (best < 0) continue;                  // L13122
      const c = this.corpses[best];            // L13123
      const nu = this.spawnUnitM(R.SKELETON, c.x, c.y, { silent: true });   // L13124（5 掷链——S29 黄金同源）
      if (!nu) continue;                       // L13125（种族上限等分支：尸体保留，下轮再试——挂账）
      this.corpses.splice(best, 1);            // L13126
      this.fx('skull', c.x, c.y - 1, 26);      // L13127
      this.fx('smoke', c.x, c.y, 16);          // L13128
      if (events < 3) { this.addEvent('lich', '骸骨应声而起——巫妖的死灵术将亡者重新编入军团', { x: c.x, y: c.y }); events++; }   // L13129
    }
  }
  // ---- M-U22 unitsReap L3321-3472（死亡收尸 Stage 2：逆序环五主支 + 常规收尸尾链机械转写） ----
  bumpWild(race, d) {                        // L1088-1092（Map 删后重插末尾枚举序——黄金无 dump 账面对齐）
    const n = (this.wildCount.get(race) ?? 0) + d;
    if (n > 0) this.wildCount.set(race, n); else this.wildCount.delete(race);
  }
  wildAliveM() {                             // L1572-1576（wildAlive = ΣwildCount.values——spawnUnit L1300 消费）
    let n = 0;
    for (const v of this.wildCount.values()) n += v;
    return n;
  }
  wildAliveAquaticM() {                      // 水生配额（镜像窗口 race 面全非 aquatic——不可达防御面）
    let n = 0;
    for (const [race, v] of this.wildCount) if (RACES[race] && RACES[race].aquatic) n += v;
    return n;
  }
  isHerbivoreRaceM(race) {                   // L2126-2134 子集（dynRaces 恒空——八静态族判定面）
    return race === R.SHEEP || race === R.DEER || race === R.PENGUIN || race === R.CAMEL
      || race === R.CHICKEN || race === R.PIG || race === R.RABBIT || race === R.FISH;
  }
  toast(text, tone, op) {                    // L14027-14030（onToast 宿主回调收集器——M-U20 先例）
    this.toasts.push({ id: this.toastSeq++, text, tone, op: op ?? null });
  }
  addCorpseM(x, y, stone, undead) {          // L2877-2881（fxPrefs.corpses 默认 true——无门同构）
    this.corpses.push({ x, y, age: 0, stone, undead });
    if (this.corpses.length > 240) this.corpses.splice(0, this.corpses.length - 240);   // CORPSE_MAX L2857
  }
  addBloodM(x, y, big) {                     // L2871-2875（fxPrefs.blood 门 + seed 掷）
    if (!this.fxPrefs.blood) return;
    this.blood.push({ x, y, age: 0, seed: Math.floor(this.rng() * 65536), big });
    if (this.blood.length > 420) this.blood.splice(0, this.blood.length - 420);   // BLOOD_MAX L2855
  }
  onKingDeath(u) {                           // L1675-1686 机械转写
    const civ = this.civs[u.civ];            // L1676
    u.king = false;                          // L1677
    if (!civ || !civ.alive) return;          // L1678
    if (civ.kingId === u.id) civ.kingId = -1;   // L1679
    civ.stability = Math.max(0, (civ.stability ?? 70) - 18);   // L1680
    this.addEvent('king', `「${civ.name}」的国王 ${civ.kingName} 驾崩了——举国缟素，王位悬而未决`, { colorHex: civ.colorHex, x: u.x, y: u.y });   // L1681
    this.toast(`「${civ.name}」国王驾崩，朝野震动`, 'danger');   // L1682
  }
  zombify(u) {                               // L4323-4346 机械转写
    if (u.king && u.civ >= 0) this.onKingDeath(u);   // L4325（王位等同驾崩）
    if (u.civ >= 0 && this.civs[u.civ]) this.civs[u.civ].pop--;   // L4326
    if (!RACES[u.race].isCiv) this.bumpWild(u.race, -1);   // L4327
    u.race = R.ZOMBIE;                       // L4328
    u.civ = -1;                              // L4329
    u.hp = 40;                               // L4330
    u.maxHp = 46;                            // L4331
    u.dmg = 6;                               // L4332
    u.speed = 0.05;                          // L4333
    u.age = 0;                               // L4334
    u.maxAge = 9999;                         // L4335
    u.infected = false;                      // L4336
    u.dead = false;                          // L4337
    u.boat = 0;                              // L4338
    u.boatTTL = 0;                           // L4339
    u.king = false;                          // L4340
    u.grab = 0; u.thrT = 0;                  // L4341（神之手指账目清零）
    this.bumpWild(R.ZOMBIE, 1);              // L4343
    this.fx('spawn', u.x, u.y, 30);          // L4344
  }
  newFamilyM(race, u) {                      // L1117-1136 机械转写（词法姓氏 FAM_PRE×FAM_POST 2 掷——S37 尾 6 鱼 0.06 fam 门首触暴露：旧 hydra 双 MISS 未触达注记的零掷实现即漂移源，已按蓝本补掷）
    const pre = FAM_PRE[Math.floor(this.rng() * FAM_PRE.length)];      // L1118（1 掷——16 前缀池）
    const post = FAM_POST[Math.floor(this.rng() * FAM_POST.length)];   // L1119（1 掷——12 后缀池）
    const f = { id: this.familySeq ?? 1, race, name: pre + post, founder: u.name, founded: Math.floor(this.yearF ?? 0), members: 1, heroes: 0, kills: 0, peak: 1, milestones: 0 };   // L1121-1132（families 无断言面）
    this.familySeq = (this.familySeq ?? 1) + 1;   // L1121 id 先取后增同构
    this.families.set(f.id, f);            // L1133
    // L1139 pruneFamilies：size ≤ 240 早退（镜像窗口族数 ≤ 2 恒零效应——结构性省略零漂移）
    return f;                              // L1135
  }
  spawnUnitM(race, x, y, opts) {             // L1289+ 机械转写（silent + 无 civ/gear 面——hydra 幼蛇/凤凰重生消费面）
    const def = RACES[race];
    if (!def) return null;                   // L1290（RACES 缺键防御）
    if (def.isCiv && this.units.length >= MAX_UNITS) return null;   // L1293（文明预算——镜像窗口无 civ spawn 不可达）
    if (!def.isCiv) {                        // L1296-1298 预算三轨
      if (def.aquatic) { if (this.wildAliveAquaticM() >= MAX_WILDLIFE_AQUATIC) return null; }   // L1297（水生独立配额）
      else if (this.wildAliveM() >= MAX_WILDLIFE) return null;        // L1298（含僵尸——S26 900 注入 null 支：先于 trait 掷 L1322）
    }
    x = Math.max(0.5, Math.min(W - 0.5, x));   // L1315
    y = Math.max(0.5, Math.min(H - 0.5, y));   // L1316
    // L1319 trait 门：opts.trait undefined → 0.15 门 1 掷（+rollTrait 命中再 1 掷——黄金双 MISS）
    const trait = (opts && opts.trait !== undefined) ? (opts.trait || null) : (this.rng() < 0.15 ? this.rollTrait() : null);
    const td = trait ? TRAITS[trait] : null;   // L1320
    const gene = this.baseGene(race);          // L1334（speciesBase 空表分支零掷恒 {1,1,1,1}——M-U19 同构）
    const maxHp = Math.round(def.hp * (td ? td.hpMul ?? 1 : 1) * (gene ? gene.h : 1));   // L1346（jd/tH 空面 ×1）
    const id = this.unitSeq++;               // L1339（先取后增）
    const u = {
      id, race, civ: -1, x, y,
      lx: x, ly: y, rx: x, ry: y,            // L1343-1344（渲染插值初值）
      tx: x, ty: y,
      hp: maxHp,
      maxHp,
      dmg: def.dmg * (td ? td.dmgMul ?? 1 : 1) * (gene ? gene.d : 1),   // L1348（govOf 空面 ×1）
      speed: def.speed * (td ? td.speedMul ?? 1 : 1) * (gene ? gene.s : 1),   // L1349
      tDmg: 1, tHp: 1,                        // L1350-1351（tm 空面）
      age: 0,
      maxAge: def.maxAge * (0.8 + this.rng() * 0.4),   // L1352（1 掷——999×(0.8+rng×0.4)）
      kills: 0,
      cd: 0,
      trait,
      gene,
      job: undefined,
      infected: false,                       // L1356（opts?.infected ?? false）
      flip: this.rng() < 0.5,                // L1357（1 掷）
      name: this.uniqueNameM(race),          // L1358（unitName 1 掷 + 重名扫描零掷）
      hurt: 0,
      breath: 120 + Math.floor(this.rng() * 160),   // L1360（1 掷）
      parity: this.unitSeq % 2,              // L1361（parity 写面唯 spawnUnit——unitSeq 增后取模）
      dead: false,
    };
    // L1364-1365 push + touchRow（批内核行级——单源 no-op）+ unitById
    this.units.push(u);
    this.unitById.set(u.id, u);
    if (!def.isCiv) this.bumpWild(race, 1);   // L1369（野生动物分种族计数）
    // L1371-1378 家族谱系（silent 幼蛇：opts.fam undefined → else if !def.undead && rng<0.06 1 掷）
    if (opts && opts.fam !== undefined) {
      u.fam = opts.fam;
      u.fgn = opts.fgn ?? 1;
      const f = this.families.get(opts.fam);
      if (f) f.members++;
    } else if (!def.undead && this.rng() < 0.06) {
      const f = this.newFamilyM(race, u);
      u.fam = f.id;
      u.fgn = 1;
    }
    // L1390-1417 silent 跳宣告面（DRAGON/DEMON/ANGEL toast+event+fx——silent 短路零写零掷）
    return u;
  }
  uniqueNameM(race) {                        // L1528-1538 全同构（M-U25：unitName 掷 + 重名扫描 startsWith 前缀面 + roman 尾——S36 五羊 Fluff/Fluff II 重名触达实证）
    const pool = FIRST_BY_RACE[race] ?? FIRST0;   // names.ts L76-78（pool = FIRST[race] ?? FIRST[0]——SKELETON FIRST16 / SHEEP FIRST6；HYDRA/FISH/SHARK → FIRST0）
    const base = pool[Math.floor(this.rng() * pool.length)];   // L1529 unitName（1 掷）
    const bl = base.length;                  // L1531（长度+首字符判定免拼接——蓝本 Task 42-a 同构）
    let n = 0;                               // L1532
    for (const p of this.units) {            // L1533-1536 重名扫描（dead skip）
      if (p.dead) continue;                  // L1534
      const nm = p.name;                     // L1535
      if (nm === base || (nm.length > bl && nm.charCodeAt(bl) === 32 && nm.startsWith(base))) n++;   // L1536（「Fluff II」≡ Fluff 重名——前缀+空格面）
    }
    return n === 0 ? base : `${base} ${romanM(n + 1)}`;   // L1537（大写罗马尾——romanM 同构）
  }
  dropItem(kind, wx, wy) {                   // L5190-5213 机械转写
    if (this.items.length >= 256) {          // L5191（MAX_ITEMS L2849）
      this.toast('大地上的宝物太多了，等它们被拾取后再丢吧', 'info');   // L5192（op 缺省）
      return null;                           // L5193
    }
    let x = wx, y = wy;                      // L5194
    if (isWater(this.terrain[idx(Math.floor(wx), Math.floor(wy))])) {   // L5195
      const land = this.findLandNearM(wx, wy, 5);   // L5196
      if (!land) { this.toast('宝物沉入了大海——附近没有陆地', 'danger', true); return null; }   // L5197-5199
      x = land.x; y = land.y;                // L5200-5201
    }
    const item = { id: this.itemSeq++, kind, x, y };   // L5202
    this.items.push(item);                   // L5203
    this.fx('spawn', x, y, 30);              // L5204
    return item;                             // L5206（onSound place 宿主 no-op）
  }
  findLandNearM(x0, y0, r) {                 // L5589-5606 子集（环扫最近可登陆地——dropItem/dropMeat 消费面）
    for (let rad = 0; rad <= r; rad++) {
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
        const xx = Math.floor(x0) + dx, yy = Math.floor(y0) + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const t = this.terrain[yy * W + xx];
        if (!isWater(t) && t !== T.MOUNTAIN) return { x: xx + 0.5, y: yy + 0.5 };
      }
    }
    return null;
  }
  dropMeat(wx, wy, n) {                      // L5385-5402 机械转写
    const cnt = Math.max(1, Math.min(3, Math.round(n)));   // L5386
    for (let k = 0; k < cnt; k++) {          // L5387
      if (this.items.length >= 256 - 6) return;   // L5388（留少量余量）
      const px = Math.max(0.5, Math.min(W - 0.5, wx + (this.rng() - 0.5) * 1.6));   // L5389
      const py = Math.max(0.5, Math.min(H - 0.5, wy + (this.rng() - 0.5) * 1.6));   // L5390
      if (isWater(this.terrain[idx(Math.floor(px), Math.floor(py))])) {   // L5391
        const land = this.findLandNearM(px, py, 3);   // L5392
        if (!land) continue;                 // L5393（沉海喂鱼）
        this.items.push({ id: this.itemSeq++, kind: 'meat', x: land.x, y: land.y });   // L5394
      } else {
        this.items.push({ id: this.itemSeq++, kind: 'meat', x: px, y: py });   // L5396
      }
    }
  }
  rollItem(rng, opts) {                      // items.ts L226-240 机械转写
    const min = (opts && opts.minRarity !== undefined) ? opts.minRarity : 0;   // L227
    const max = (opts && opts.maxRarity !== undefined) ? opts.maxRarity : 4;   // L228
    let total = 0;                           // L229
    const pool = [];                         // L231
    for (const key of ALL_ITEM_KEYS) {       // L230（ALL_ITEMS 序 = TABLE 序）
      const def = ITEM_RARITY[key];
      if (def < min || def > max) continue;  // L232
      pool.push({ k: key, w: RARITY_W[def] });   // L233-234
      total += RARITY_W[def];                // L235
    }
    if (pool.length === 0) return 'sword1';  // L236-237
    let r = rng() * total;                   // L238
    for (const p of pool) { r -= p.w; if (r <= 0) return p.k; }   // L239
    return pool[pool.length - 1].k;          // L240
  }
  rollChestItem(tier, rng) {                 // constants.ts L797-800 机械转写
    const t = CHEST_TIERS[tier];
    return t ? this.rollItem(rng, { minRarity: t.min, maxRarity: t.max }) : this.rollItem(rng);
  }
  unitsReap() {                              // L3321-3472 机械转写（逆序环五主支 + 常规收尸尾链）
    if (TOOL3_RED === 'reap') return;        // 红证旋钮：TOOL3_RED=reap 禁全收尸面（缺陷面 = 死单位永不清理/掉落/纪事链缺失 → 六 reap 场景 FAIL → 复绿）
    const MONSTER_LOOT = new Set([R.DRAGON, R.KRAKEN, R.SANDWORM, R.BASILISK, R.TROLL, R.OGRE, R.WHITEWALKER, R.VAMPIRE, R.DEMON]);   // L6924
    for (let i = this.units.length - 1; i >= 0; i--) {   // L3322
      const u = this.units[i];               // L3323
      if (!u.dead) continue;                 // L3324
      // —— 僵尸病毒：瘟疫致死 35% 尸变 ——
      if (u.infected && this.laws.zombieVirus !== false && !RACES[u.race].undead && !RACES[u.race].aquatic && !RACES[u.race].flying && this.rng() < 0.35) {   // L3326
        u.infected = false;                  // L3327
        this.zombify(u);                     // L3328
        continue;                            // L3329
      }
      // —— 王权：国王驾崩 ——
      if (u.king && u.civ >= 0) this.onKingDeath(u);   // L3331
      // —— 凤凰：浴火重生 ——
      if (u.race === R.PHOENIX && (u.rebirths ?? 0) < 3) {   // L3335
        const ashTtl = this.natureSeason === 3 ? Math.round(240 * 1.5) : 240;   // L3337（PHOENIX_ASH_TTL L2867）
        this.phoenixAshes.push({ x: u.x, y: u.y, t: ashTtl, rebirths: (u.rebirths ?? 0) + 1 });   // L3338
        this.addEvent('phoenix', `凤凰陨落成灰——余烬仍在闪烁，传说它将自火中归来（第 ${(u.rebirths ?? 0) + 1} 次涅槃）`, { x: u.x, y: u.y });   // L3339
        this.fx('smoke', u.x, u.y, 30);      // L3340
        this.unitById.delete(u.id);          // L3341
        this.bumpWild(u.race, -1);           // L3342
        const last = this.units.pop();       // L3344
        if (i < this.units.length) { this.units[i] = last; }   // L3344（WBB.touchRow 批内核行触碰——单源 no-op）
        continue;                            // L3345
      }
      if (u.race === R.PHOENIX) {            // L3347
        this.addEvent('phoenix', '火种熄灭——这只凤凰耗尽了所有涅槃，化作永恒的灰烬', { x: u.x, y: u.y });   // L3348
      }
      // —— 九头蛇：斩首分裂 ——
      if (u.race === R.HYDRA && (u.gen ?? 0) < 2) {   // L3352
        const ti = ((u.y | 0) * W) + (u.x | 0);   // L3353
        const seared = this.fire[ti] > 0 || this.terrain[ti] === T.LAVA;   // L3354
        if (!seared) {                       // L3355
          const g = (u.gen ?? 0) + 1;        // L3356
          const born = [];                   // L3357
          for (const [dx, dy] of [[-1.3, 0.5], [1.3, -0.5]]) {   // L3358
            const nu = this.spawnUnitM(R.HYDRA, u.x + dx, u.y + dy, { silent: true });   // L3359
            if (nu) {
              nu.gen = g;                    // L3361
              nu.maxHp = Math.round(nu.maxHp * 0.6);   // L3362
              nu.hp = nu.maxHp;              // L3363
              born.push(nu);                 // L3364
            }
          }
          if (born.length > 0) {             // L3367
            this.addEvent('hydra', born.length > 1
              ? `九头蛇被斩首——断颈处竟萌发出 ${born.length} 条幼蛇，每一颗都在嘶鸣（第 ${g} 世代）`
              : `九头蛇倒下了——仅剩的一颗断颈仍萌发出一条幼蛇（第 ${g} 世代）`, { x: u.x, y: u.y });   // L3368-3370
            this.fx('smoke', u.x, u.y, 36);  // L3371
            this.fx('blood', u.x, u.y, 20);  // L3372
            this.shake = Math.max(this.shake, 3);   // L3373
            this.unitById.delete(u.id);      // L3375
            this.bumpWild(u.race, -1);       // L3376
            const last = this.units.pop();   // L3377
            if (i < this.units.length) { this.units[i] = last; }   // L3378
            continue;                        // L3379
          }
          this.addEvent('hydra', '九头蛇倒下了——但世上九头蛇已经太多，断颈静寂，再无新生', { x: u.x, y: u.y });   // L3383
        } else {
          this.addEvent('hydra', '烈焰烧灼了断颈——被火焚灭的九头蛇再也无法萌生新的头颅', { x: u.x, y: u.y });   // L3385
        }
      }
      if (u.race === R.HYDRA && (u.gen ?? 0) >= 2) {   // L3389
        this.addEvent('hydra', '最后一颗头颅垂下了——这条熬过两次斩首的老蛇终于真正死去', { x: u.x, y: u.y });   // L3390
      }
      // L3392 collectUnitDead —— 在线采集遥测 no-op
      if (u.civ >= 0 && this.civs[u.civ]) this.civs[u.civ].pop--;   // L3393
      if (u.fam != null) {                   // L3395
        const df = this.families.get(u.fam); // L3396
        if (df) df.members--;                // L3397
      }
      this.fx('skull', u.x, u.y, 46);        // L3398
      if ((u.caravan ?? 0) > 0) {            // L3400
        const home = u.civ >= 0 ? this.civs[u.civ] : null;   // L3401
        const partner = this.civs[u.caravan];   // L3402
        if (home && partner && home.alive && partner.alive) {   // L3403
          const key = home.id < partner.id ? `${home.id}-${partner.id}` : `${partner.id}-${home.id}`;   // L3404 pairKey L34
          this.rel.set(key, Math.max(-100, (this.rel.get(key) ?? 0) - 6));   // L3405
          this.addEvent('trade', `「${home.name}」的商队在途中遇袭，贸易中断`, { colorHex: home.colorHex, x: u.x, y: u.y });   // L3406
        }
      }
      const undead = RACES[u.race].undead;   // L3410
      if (u.race !== R.SANDWORM) {           // L3411
        this.addCorpseM(u.x, u.y, false, undead);   // L3412（fxPrefs.corpses 默认 true）
        if (this.fxPrefs.blood && !undead) this.addBloodM(u.x, u.y, true);   // L3413
      }
      if (!RACES[u.race].isCiv && !MONSTER_LOOT.has(u.race) && !RACES[u.race].undead && this.rng() < 0.85) {   // L3419
        this.dropMeat(u.x, u.y, 1 + this.rng() * 2 + (u.race === R.PIG ? 1 : 0));   // L3420
      }
      if (this.isHerbivoreRaceM(u.race) && !RACES[u.race].isCiv) {   // L3427
        let best = null;                     // L3428
        let bestHunger = 0;                  // L3429
        for (const p of this.units) {        // L3430
          if (p.dead) continue;              // L3431
          const pd = RACES[p.race];          // L3432
          if (!pd.predator || pd.undead || pd.isCiv) continue;   // L3433
          const dx = p.x - u.x, dy = p.y - u.y;   // L3434
          if (dx * dx + dy * dy > 36) continue;   // L3435
          const hunger = 80 - (p.food ?? 0); // L3436
          if (hunger <= bestHunger) continue;   // L3437
          bestHunger = hunger;               // L3438
          best = p;                          // L3439
        }
        if (best) best.food = Math.min(400, (best.food ?? 0) + 55 + Math.round(u.maxHp * 0.5));   // L3441
      }
      if (this.items.length < 170) {         // L3444
        const boss = MONSTER_LOOT.has(u.race);   // L3445
        if (u.wep && this.rng() < 0.35) {    // L3446
          this.dropItem(u.wep, u.x, u.y);    // L3447
        } else if (boss && this.rng() < 0.5) {   // L3448
          this.dropItem(this.rollChestItem('chest2', () => this.rng()), u.x, u.y);   // L3449（箭头包装保 this——蓝本 this.rng 直传方法引用同语义）
          this.addEvent('loot', '巨怪倒下的地方散落着宝藏——静待有缘人', { x: u.x, y: u.y });   // L3450
        } else if (!RACES[u.race].isCiv && !boss && this.rng() < 0.05) {   // L3451
          this.dropItem(this.rollChestItem('chest', () => this.rng()), u.x, u.y);   // L3452
        }
      }
      this.unitById.delete(u.id);            // L3454
      if (!RACES[u.race].isCiv) this.bumpWild(u.race, -1);   // L3455
      const last2 = this.units.pop();        // L3456
      if (i < this.units.length) { this.units[i] = last2; }   // L3457
    }
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
const SCEN = process.env.TOOL3_SCEN ?? '';   // 诊断基建：单场景过滤（env-gated 零默认效应）
for (const sc of golden.scenarios) {
  if (SCEN && sc.key !== SCEN) continue;
  const eng = new BREng(sc);
  eng.rngA = sc.seed >>> 0;
  let stepOk = true, firstErr = '';
  const cmp = (a, b, label) => {
    if (!stepOk) return;
    const ja = JSON.stringify(a), jb = JSON.stringify(b);
    if (ja !== jb) { stepOk = false; firstErr = `${label}: mirror=${ja.length > 220 ? ja.slice(0, 220) + '…' : ja} golden=${jb.length > 220 ? jb.slice(0, 220) + '…' : jb}`; }   // M-U25：双值诊断输出
  };
  for (let s = 0; s < sc.stepsSnap.length; s++) {
    const call = sc.stepsSnap[s];
    if (call.fn === 'applyTool') eng.applyTool(call.args[0], call.args[1], call.args[2], call.args[3]);
    else if (call.fn === 'beginGrab') eng.beginGrab(call.args[0], call.args[1]);             // M-U21：三 API 直调
    else if (call.fn === 'moveGrab') eng.moveGrab(call.args[0], call.args[1]);
    else if (call.fn === 'endGrab') eng.endGrab(call.args[0], call.args[1]);
    else if (call.fn === 'unitsTick') { eng.tickCount++; eng.fireTickM(); eng.rebuildBucketsM(); eng.unitsTick(); eng.effectsTick(); if (eng.tickCount % 3 === 0) eng.angelAuraTick(); if (eng.phoenixAshes.length > 0) eng.phoenixAshTick(); if (eng.tickCount % 10 === 0) eng.entGroveTick(); if (eng.tickCount % (eng.natureSeason === 3 ? 8 : 12) === 0) eng.lichRaiseTick(); if (eng.tickCount % 30 === 0) eng.hydraRegenTick(); eng.beachedAquaticTickM(); if (eng.tickCount % 600 === 61) eng.wildlifeReboundTickM(); if (eng.tickCount % 20 === 7) eng.predatorHuntTickM(); if (eng.tickCount % 240 === 13) eng.sharkBreedTickM(); }   // M-U21+M-U23+M-U24：主循环 L2523-2528 + L2606/L2608/L2611/L2612 截断镜像（灰烬门旧场景零效应；三新门旧窗口 %10/%12/%30 全不触零漂移）+ M-U25：L2614/L2616/L2618/L2620 四门接线（beached 逐 tick 无门 + 三条件门蓝本门原样——stepUnits 场景 gen 端同序跑四门零效应实证：旧 31 场景无 aquatic 族/唯一饿捕食者 S24 food:30 窗口 1001 不触/LICH-HYDRA predator 但 food 缺省 70>45 出手门 skip）+ M-U27：L2604 %3 门接线（phoenixAshTick 前——蓝本序；旧 40 场景无 ANGEL 族外层环零效应零掷）
    else if (call.fn === 'effectsTick') { eng.tickCount++; eng.effectsTick(); if (eng.tickCount % 3 === 0) eng.angelAuraTick(); if (eng.phoenixAshes.length > 0) eng.phoenixAshTick(); if (eng.tickCount % 10 === 0) eng.entGroveTick(); if (eng.tickCount % (eng.natureSeason === 3 ? 8 : 12) === 0) eng.lichRaiseTick(); if (eng.tickCount % 30 === 0) eng.hydraRegenTick(); eng.beachedAquaticTickM(); if (eng.tickCount % 600 === 61) eng.wildlifeReboundTickM(); if (eng.tickCount % 20 === 7) eng.predatorHuntTickM(); if (eng.tickCount % 240 === 13) eng.sharkBreedTickM(); }   // M-U25：gen 步进循环 L340-381 全序同构（effectsTick → L2604 天使光环 M-U27 接线 → L2606 灰烬门 → L2608/L2611/L2612 三门 → L2614/L2616/L2618/L2620 四门——旧 31 场景八门零效应窗口实证：phoenix ashes 空/%10 entGrove 无 ENT/%12 lich corpses 空→零掷/%30 hydra 无 HYDRA/beached 无 aquatic 族/rebound %600===61 旧窗口 1001-1050 不触/hunt 普查零掷/breed 不触——镜像端不接门与接门掷流等价，本轮补齐严格同构防未来漂移；M-U27 L2604 同款——旧 40 无 ANGEL 零效应）
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
      ...(call.ashes !== undefined ? { ashes: eng.phoenixAshes.map((a) => ({ x: f64hex(a.x), y: f64hex(a.y), t: a.t, rebirths: a.rebirths })) } : {}),   // M-U23：stepAsh 条件面（倒数每步位级）
    };
    for (const k of Object.keys(m)) cmp(m[k], call[k], `step${s}.${k}`);
    if (call.fn === 'effectsTick' || call.fn === 'unitsTick') {   // M-U21：unitsTick 步同列快照
      const mf = eng.effects.map((e) => ({ kind: e.kind, age: e.age, x: f64hex(e.x), y: f64hex(e.y), dir: f64hex(e.dir) }));
      cmp(mf, call.fx, `step${s}.fx`);
      const mu = eng.units.map((u) => ({
        id: u.id, hp: f64hex(u.hp), hurt: f64hex(u.hurt ?? 0), dead: u.dead ? 1 : 0, x: f64hex(u.x), y: f64hex(u.y),
        ...(call.units[0]?.grab !== undefined ? { grab: u.grab ?? 0, thrT: u.thrT ?? 0 } : {}),   // M-U21：条件面
        // M-U25：stepBeach 场景条件扩展面（S32/S33/S35——units[0] 可能是羊群无 beachT 键，some() 检测同构 gen 端 spec.stepBeach 全单位条件展开）
        ...(call.units.some((q) => q.beachT !== undefined) ? { tx: f64hex(u.tx ?? u.x), ty: f64hex(u.ty ?? u.y), beachT: u.beachT ?? null, btx: u.beachTx ?? null, bty: u.beachTy ?? null, btid: u.beachTargetId ?? null } : {}),
        // M-U27：stepAura 场景条件扩展面（infected 旗步内位级——S41-S48 八场景全单位展开）
        ...(call.units[0]?.infected !== undefined ? { infected: u.infected ? 1 : 0 } : {}),
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
      ...(u.rebirths !== undefined ? { rebirths: u.rebirths } : {}),   // M-U22：凤凰涅槃计数（条件键）
      ...(u.gen !== undefined ? { gen: u.gen } : {}),                   // M-U22：九头蛇世代
      ...(u.caravan !== undefined ? { caravan: u.caravan } : {}),       // M-U22：商队
      ...(u.food !== undefined ? { food: u.food } : {}),                // M-U22：饥饿（scav 写面）
      ...(u.wep !== undefined ? { wep: u.wep } : {}),                   // M-U22：武器槽
      ...(u.fleeT !== undefined ? { fleeT: u.fleeT } : {}),             // M-U25：逃亡倒数（beached 让位门）
      ...(u.beachT !== undefined ? { beachT: u.beachT } : {}),          // M-U25：搁浅窒息计数（水中支键置 0 / 搁浅支 ++——动态键条件面同构 gen dumpUnit）
      ...(u.beachTx !== undefined ? { beachTx: u.beachTx } : {}),       // M-U25：归海/猎游目标 x（undefined 赋值 ≡ 无键——JSON 同构）
      ...(u.beachTy !== undefined ? { beachTy: u.beachTy } : {}),       // M-U25：归海/猎游目标 y
      ...(u.beachTargetId !== undefined ? { beachTid: u.beachTargetId } : {}),   // M-U25：猎游粘性目标
    });
    if (JSON.stringify(eng.units.map(dumpUnit)) !== JSON.stringify(sc.units)) {
      endOk = false; endErr = 'units dump 终态';
      if (process.env.TOOL3_TRACE) {   // 诊断基建：终态 units 首差异字段定位（env-gated）
        const A = eng.units.map(dumpUnit), B = sc.units;
        for (let i = 0; i < Math.max(A.length, B.length); i++) {
          if (JSON.stringify(A[i]) !== JSON.stringify(B[i])) {
            const ua = A[i] ?? {}, ub = B[i] ?? {};
            for (const k of new Set([...Object.keys(ua), ...Object.keys(ub)])) {
              if (JSON.stringify(ua[k]) !== JSON.stringify(ub[k])) console.error(`[trace] unit#${i} id=${ua.id ?? ub.id} ${k}: mirror=${JSON.stringify(ua[k])} golden=${JSON.stringify(ub[k])}`);
            }
            break;
          }
        }
      }
    }
  }
  if (endOk && JSON.stringify(eng.toasts) !== JSON.stringify(sc.toasts)) { endOk = false; endErr = 'toasts 终态'; }
  // M-U22：reapDump 六域终态对账（items/ash/贴花/civ/family/rel——条件键仅新场景携带）
  if (endOk && sc.items != null) {
    const mi = { itemSeq: eng.itemSeq, items: eng.items.map((it) => ({ id: it.id, kind: it.kind, x: f64hex(it.x), y: f64hex(it.y) })) };
    if (JSON.stringify(mi) !== JSON.stringify({ itemSeq: sc.itemSeq, items: sc.items })) { endOk = false; endErr = 'items 终态'; }
  }
  if (endOk && sc.ashes != null) {
    const ma = eng.phoenixAshes.map((a) => ({ x: f64hex(a.x), y: f64hex(a.y), t: a.t, rebirths: a.rebirths }));
    if (JSON.stringify(ma) !== JSON.stringify(sc.ashes)) { endOk = false; endErr = 'ashes 终态'; }
  }
  if (endOk && sc.corpses != null) {
    const mc = eng.corpses.map((c) => ({ x: f64hex(c.x), y: f64hex(c.y), age: c.age, stone: c.stone ? 1 : 0, undead: c.undead ? 1 : 0 }));
    if (JSON.stringify(mc) !== JSON.stringify(sc.corpses)) { endOk = false; endErr = 'corpses 终态'; }
  }
  if (endOk && sc.blood != null) {
    const mb = eng.blood.map((b) => ({ x: f64hex(b.x), y: f64hex(b.y), age: b.age, seed: b.seed, big: b.big ? 1 : 0 }));
    if (JSON.stringify(mb) !== JSON.stringify(sc.blood)) { endOk = false; endErr = 'blood 终态'; }
  }
  if (endOk && sc.civs != null) {
    const mcv = eng.civs.map((c) => ({ id: c.id, name: c.name, pop: c.pop, stability: f64hex(c.stability), kingId: c.kingId ?? null }));
    if (JSON.stringify(mcv) !== JSON.stringify(sc.civs)) { endOk = false; endErr = 'civs 终态'; }
  }
  if (endOk && sc.families != null) {
    const mf2 = eng.families === undefined ? [] : [...eng.families.entries()].map(([fid, f]) => ({ id: fid, members: f.members }));
    if (JSON.stringify(mf2) !== JSON.stringify(sc.families)) { endOk = false; endErr = 'families 终态'; }
  }
  if (endOk && sc.rel != null) {
    const mr = [...eng.rel.entries()].map(([k, v]) => ({ k, v: f64hex(v) }));
    if (JSON.stringify(mr) !== JSON.stringify(sc.rel)) { endOk = false; endErr = 'rel 终态'; }
  }
  // M-U25：迁徙/繁衍域终态条件双键（wildCount 全量 + reboundLast 权重表——S36/S37/S38/S39/S40 wildAll 场景；
  //   Map 枚举序 = 注入序/bumpWild 删后重插末尾——镜像端 bumpWild 已同构）
  if (endOk && sc.wildAll != null) {
    if (JSON.stringify([...eng.wildCount.entries()]) !== JSON.stringify(sc.wildAll)) { endOk = false; endErr = 'wildAll 终态'; }
    else if (JSON.stringify([...eng.reboundLast.entries()]) !== JSON.stringify(sc.reboundLast)) { endOk = false; endErr = 'reboundLast 终态'; }
  }
  if (stepOk && endOk) { pass++; console.log(`${sc.key}: PASS (draws=${sc.totalDraws} fx=${eng.effects.length} ev=${eng.worldEvents.length} units=${eng.units.length} shake=${eng.shake} stats=${JSON.stringify([eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes])})`); }
  else { fail++; console.log(`${sc.key}: FAIL (${!stepOk ? firstErr : endErr})`); }
}
console.log(`tool3 transcript: ${pass}/${golden.scenarios.length} 场景逐位 ${pass === golden.scenarios.length ? 'ALL PASS' : 'FAIL'}`);
if (fail > 0) process.exit(1);
