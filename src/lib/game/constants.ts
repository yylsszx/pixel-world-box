// ============ WorldBox Replica — Constants, Palette, Tools & Pixel Icons ============
import { T, R } from './types';
import { ALL_ITEMS, RARITY_META, SLOT_NAMES, buildItemIcons, rollItem } from './items';

export const W = 256; // world width in tiles
export const H = 160; // world height in tiles
export const TILE_PX = 4; // pixels per tile in the world (dynamic) canvas — 超细粒度：WorldBox 级 4px/格
export const TICK_MS = 66; // ~15 sim ticks per second
export const YEAR_TICKS = 40; // 1 game year per 40 ticks (~2.7s at 1x)
export const MAX_UNITS = 2400;
/** 野生动物独立生态预算：文明人口不抢占（与 MAX_UNITS 分轨，防长时程生态灭绝） */
export const MAX_WILDLIFE = 900;
/** 纯水生物种独立海洋配额（鱼/龟/鲨/蟹及演化后裔）：与陆地预算分轨 ——
 *  全球预算曾被速繁陆生物种（羊 cap 240 等）饱和占用，鱼繁衍被封顶、远洋鲨鱼寻不到猎物（Task 95 长时程实测）。
 *  取值 = 各水生物种 cap 之和（鱼 280 + 龟 90 + 蟹 90 + 鲨 40 = 500）+ 20 余量：
 *  内核侧繁衍只认 wildcap 表（每物种 cap）+ 全局上界，此值仅约束 TS 侧投放（玩家/迁徙/引擎通道）
 *  在物种 cap 之外的总闸；水生单位不再计入 MAX_WILDLIFE（总上界 = MAX_UNITS + MAX_WILDLIFE + 本值） */
export const MAX_WILDLIFE_AQUATIC = 520;
export const MAX_DRAGONS = 4;
/** 恶魔同屏上限（岩浆 Boss） */
export const MAX_DEMONS = 2;
/** 新智慧巨怪同屏上限（巨魔/食人魔/白行者/吸血鬼） */
export const MAX_TROLLS = 5;
export const MAX_KRAKENS = 3;
export const MAX_SANDWORMS = 3;
export const MAX_BASILISKS = 6;
export const MAX_OGRES = 5;
export const MAX_WHITEWALKERS = 6;
/** 九头蛇同屏上限（斩首分裂会瞬时 +2，从严控制防刷屏） */
export const MAX_HYDRAS = 6;
export const MAX_VAMPIRES = 8;
/** 地面物品上限（防止刷屏） */
export const MAX_ITEMS = 200;
export const SPEEDS = [0, 1, 3, 8];
export const HOUSE_CAP = 4; // population per house

// ---------- terrain base colors ----------
export const TERRAIN_RGB: [number, number, number][] = [
  [31, 62, 107], // DEEP
  [56, 113, 163], // WATER
  [222, 203, 141], // SAND
  [104, 152, 60], // GRASS
  [72, 116, 50], // FOREST (ground under trees)
  [130, 137, 96], // HILL
  [122, 122, 126], // MOUNTAIN
  [228, 235, 240], // SNOW
  [235, 90, 30], // LAVA
  [66, 58, 51], // BURNT
  [172, 210, 228], // ICE（冰面：冻结的水）
  [88, 96, 50], // SWAMP（沼泽：浑浊的绿褐湿地）
];

// ---------- 水深分层调色（深度打磨：近岸浅礁 → 陆架 → 深渊的色彩纵深） ----------
/** 普通水面按距岸距离分级：0 浅礁（绿松石）/ 1 近岸 / 2 开阔海域 */
export const WATER_TIER_RGB: [number, number, number][] = [
  [106, 194, 182], [79, 149, 171], [56, 113, 163],
];
/** 深海按邻接关系分级：3 陆架（邻普通水）/ 4 深渊 */
export const DEEP_TIER_RGB: [number, number, number][] = [
  [43, 87, 133], [30, 58, 102],
];
/** 可融合的软土地形（群系边缘抖动过渡用：山/岩浆/冰除外；末位 = 沼泽） */
export const SOFT_TERRAIN = [false, false, true, true, true, true, false, true, false, true, false, true];

export const FLAMMABLE: number[] = [T.GRASS, T.FOREST];

export function isWater(t: number) {
  return t === T.DEEP || t === T.WATER;
}
export function isLand(t: number) {
  return t !== T.DEEP && t !== T.WATER && t !== T.LAVA;
}
export function walkable(t: number) {
  return t !== T.DEEP && t !== T.WATER && t !== T.MOUNTAIN && t !== T.LAVA;
}
export function buildable(t: number) {
  return t === T.GRASS || t === T.SAND || t === T.HILL || t === T.SNOW || t === T.BURNT || t === T.FOREST;
}

// ---------- civilization banner colors ----------
export const CIV_COLORS: [number, number, number][] = [
  [219, 62, 47], [255, 176, 32], [64, 182, 133], [214, 84, 200],
  [240, 238, 232], [255, 106, 76], [146, 200, 62], [230, 140, 200],
  [120, 200, 200], [240, 170, 60], [200, 220, 120], [250, 100, 150],
];

// ---------- pixel icon palette (single chars) ----------
export const PIX: Record<string, string | null> = {
  '.': null,
  k: '#14100c', K: '#3a342c',
  w: '#f2ead8', f: '#f7f9fb',
  c: '#d9a066', C: '#b57742',
  g: '#4f9e3a', G: '#2c5e24',
  n: '#c98d5a', N: '#6e4a2b',
  r: '#cf3f2e', R: '#8c2317',
  o: '#ff9b2d', O: '#c96a15',
  y: '#ffd93d', Y: '#c9a02a',
  b: '#4d9fd6', B: '#2b6fae',
  m: '#8d8d8d', M: '#575757',
  s: '#e3cf96', S: '#c4ad74',
  z: '#7fa93c', Z: '#5a7a2c',
  v: '#64c95d',
  e: '#9ad06a',
  d: '#37333b', D: '#1f1d24',
  p: '#d556c0',
  t: '#3fb5a3',
  // 稀有度调色（物品图标生成用：q/Q 普通 u/U 精良 i/I 稀有 x/X 史诗 a/A 传说）
  q: '#a8a29e', Q: '#78716c',
  u: '#6fd66f', U: '#4bb54b',
  i: '#5ba8e0', I: '#3a7fb0',
  x: '#b56cf0', X: '#8a4bd0',
  a: '#ffb020', A: '#c9a02a',
};

/**
 * 8x8 pixel-art bitmaps for every tool button.
 * Rows of chars mapped through PIX palette.
 */
export const ICONS: Record<string, string[]> = {
  select: [
    'kk......', 'kwwk....', 'kwfwk...', 'kwffwk..',
    'kwwffk..', 'kwkfwk..', 'k..kwk..', '....k...',
  ],
  human: [
    '...cc...', '..cccc..', '..ckck..', '...cc...',
    '..rrrr..', '.rrrrrr.', '..rr.rr.', '..N..N..',
  ],
  elf: [
    '...ee...', '..eeee..', '..ekek..', '...ee...',
    'GGGGGG..', 'GgGGgG..', '.GG..G..', '.G...G..',
  ],
  dwarf: [
    '..NNNN..', '..cccc..', '..ckck..', '..NNNN..',
    '.yyyyy..', 'yyyyyyy.', '..yy.yy.', '..N..N..',
  ],
  orc: [
    '..zzzz..', '.zzzzzz.', '.zkzkzk.', '..zzzz..',
    'DDDDDD..', 'DDDDDDD.', '..DD.DD.', '..N..N..',
  ],
  bandit: [
    '..kkkk..', '.kkkkkk.', '.kccck..', '..kccck.',
    'DDDDDD..', 'DDDDDDD.', '..DD.DD.', '..D..D..',
  ],
  zombie: [
    '..zzzz..', '.zzzzzz.', '.zkzkzk.', '..zzzz..',
    'zzzzzz..', 'zZzZzZ..', '..zz.zz.', '..Z..Z..',
  ],
  sheep: [
    '........', '.ffffff.', 'ffffffff', 'ffMffff.',
    'Mffffff.', 'kffffff.', '..f..f..', '........',
  ],
  wolf: [
    '........', '........', 'M..k....', 'MMMkkk..',
    'MMMMMMm.', 'mMMMMMM.', '..m..m..', '........',
  ],
  snowwolf: [
    '........', '........', 'f..k....', 'fffkkk..',
    'ffffffm.', 'mffffff.', '..m..b..', '........',
  ],
  bear: [
    'NN..NN..', 'NNNNNN..', 'NkNNkN..', 'NNNNNN..',
    'NNNNNNN.', 'NNNNNNN.', '..NN.NN.', '..N..N..',
  ],
  dragon: [
    'D..D.D..', '.DDDDD..', 'DyDDDDD.', '.DDDDDD.',
    'D.DDDD.D', '..rrr...', '..r.r...', '..D..D..',
  ],
  deer: [
    '..y..y..', '.y....y.', '.yN..Ny.', '..NNNN..',
    '...NN...', '..NNNN..', '.NNNNNN.', '..N..N..',
  ],
  penguin: [
    '..kkk...', '..kwk...', '..kok...', '.kkkkk..',
    '.kfffk..', '.kfffk..', '..kkk...', '..o.o...',
  ],
  camel: [
    '.....ss.', '....sSs.', '..ss.s..',
    '.sssss..', 'ssSsSss.', '.sssss..',
    '..s..s..', '..S..S..',
  ],
  scorpion: [
    '.....R..', '....RR..', 'k...R...', 'kk.RR...',
    'kkkk....', 'kkkk....', 'k.kk.k..', '........',
  ],
  river: [
    '..gBBg..', '..gBbg..', '..gBBBg.',
    '...gBBbg', '...gBBBg', '..gBBBg.',
    '..gBBg..', '..gBBg..',
  ],
  raise: [
    '........', '...ss...', '..ssss..', '.ggggg..',
    '.ggggg..', 'ggggggg.', 'NNNNNNN.', '........',
  ],
  water: [
    '........', '........', '.bbbb...', 'bBBBBb..',
    'bBbbbBb.', '.bBBBb..', '..bbbb..', '........',
  ],
  sand: [
    '........', '........', '..ssss..', '.sSsSss.',
    'sssSsss.', '.ssssSs.', '..ssss..', '........',
  ],
  grass: [
    '........', '...g....', '.g.g.g..', '..ggg...',
    'ggggggg.', '.gggggg.', '..g..g..', '........',
  ],
  forest: [
    '..GG....', '.GGGG...', 'GGGGGG..', '.GGGG...',
    '..NN....', '..NN....', '.GGGG...', '........',
  ],
  mountain: [
    '...ww...', '..mmmm..', '..mmmm..', '.mmMMmm.',
    '.mmMMmm.', 'mmMmmMmm', 'mMMMMMMm', '........',
  ],
  snow: [
    '........', '.ffffff.', 'ffwffwf.', 'ffffffff',
    'ffffff..', '.ffff...', '........', '........',
  ],
  lava: [
    '........', '.oooo...', 'oyoooO..', 'ooOOoo..',
    'OOooOO..', '.OOOO...', '........', '........',
  ],
  fire: [
    '...y....', '..yoy...', '..oyyo..', '.oyyyo..',
    '.oyoyo..', 'oooyoO..', '.oOOo...', '..OO....',
  ],
  lightning: [
    '...yy...', '..yyy...', '..yy....', '.yyyyy..',
    '...yy...', '...yy...', '..yy....', '.yy.....',
  ],
  tornado: [
    'wwwwww..', '.wwww...', 'mmmmmm..', '.mmmm...',
    'MMMMMM..', '.MMMM...', 'MMMMMM..', '..MM....',
  ],
  earthquake: [
    '........', '..ss....', '.s..s...', '..ssss..',
    '.ss..s..', 's..ss...', '.ss.s...', '........',
  ],
  meteor: [
    '...y....', '..yo....', '.yo.....', 'oo......',
    '.oooo...', 'oooooo..', 'ooOOoo..', '.OOOO...',
  ],
  nuke: [
    '..kyk...', '.kyyyk..', 'ky.oyk..', 'kyyoyy..',
    '.kyyy...', '..kyk...', '..yy....', '........',
  ],
  plague: [
    '..vvvv..', '.vvvvvv.', '.vkvvkv.', '.vvvvvv.',
    '..vvvv..', '..v..v..', '.vv..vv.', '........',
  ],
  acidrain: [
    '.vv.vv..', 'vv.vv.v.', '.v.vv.v.', '........',
    '.v.vv.v.', 'v.vv.v..', '.vv.vv..', 'v.v..v..',
  ],
  heal: [
    '...ww...', '...ww...', '.wwwwww.', '.wwwwww.',
    '...ww...', '...ww...', '..rrrr..', '........',
  ],
  kill: [
    '..wwww..', '.wwwwww.', '.wkwwkw.', '.wwwwww.',
    '..wwww..', '..w.ww..', '.ww..ww.', '........',
  ],
  boom: [
    'y...y...', '.y.y....', '..o.....', 'yoooy...',
    'oooooo..', '.ooooo..', 'y.oo.y..', '...y....',
  ],
  oasis: [
    '...ww...', '..BGGB..', '.BGGGGB.', 'BGGwwGGB',
    'BGwwwwG.', 'BGGwwGG.', '.BGGGG..', '..BBBB..',
  ],
  smooth: [
    '..mm....', '.mmmm...', '.mMMmm..', 'mMMMMMm.',
    'mMwwMMm.', '.mmMMmm.', '..mmmm..', '...mm...',
  ],
  rough: [
    'm..M..m.', '.M..m..M', 'm.M.m.M.', '.m.M.m..',
    'M.m.M.m.', '.m.M.m.M', 'm.M.m.M.', '.M.m...m',
  ],
  snake: [
    '.....rr.', '....GG..', '..GGG...', '.GG.....',
    '..GG....', '...GGG..', '.....GG.', '..GG....',
  ],
  skeleton: [
    '..wwww..', '.wwwwww.', '.wkwwkw.', '..wwww..',
    '..w..w..', '.w.ww.w.', '..w..w..', '..w..w..',
  ],
  demon: [
    'r..y.r..', 'rrryrr..', '.rrrrr..', 'ryyryy..',
    '.rrrrr..', 'rrrrrrr.', '.r.rr.r.', '.r...r..',
  ],
  angel: [
    'f......f', 'ff.yy.ff', 'ffwccwff', '.fwwwwf.',
    '..wwwwy.', '..wyywy.', '..w..w..', '..y..y..',
  ],
  phoenix: [
    '..r.y...', '.ryyor..', 'ryoooyr.', '.yoooy..',
    '.yoyyoy.', '..yoyoy.', '...r.r..', '..y.y...',
  ],
  ent: [
    '.ggggg..', 'gGgggGg.', '.ggkgg..', '..GGG...',
    '.NnNnN..', '.NnNnN..', '.NnNnN..', '..N.N...',
  ],
  lich: [
    '..dddd..', '.dffffd.', '.dfvfvf.', '.dffffd.',
    'ddDDDDdd', '.dDppDd.', '.dDppDd.', '.d.d.d..',
  ],
  hydra: [
    '.g..g..g', 'gy..y..y', '.g..g..g', '.G.GG.G.',
    '..GGGG..', '.GGgGGg.', '.GGGGGG.', '..r..r..',
  ],
  mage: [
    '....k...', '...kkk..', '..kkkkk.', '...vww..',
    '...vww..', '..vvvv..', '.vvvvvv.', '..y.vy..',
  ],
  lizard: [
    '...ggg..', '..ggggg.', '..gygyg.', '...gg...',
    '..GGGG..', '.gGGGGg.', '..G..G..', '..g.gg..',
  ],
  goblin: [
    '.g...g..', 'ggg.ggg.', '.zzzzz..', '.zrzrz..',
    '..zzz...', '.ZZZZZ..', '..Z.Z...', '..z.z...',
  ],
  troll: [
    '..GGG...', '.GGGGG..', '.GkGkG..', '.GGwGG..',
    'GGGGGGG.', 'GGGGGGG.', '.G...G..', '.G...G..',
  ],
  whitewalker: [
    '.f.f.f..', '.ffffff.', '.fbfbf..', '..fff...',
    '.BBBBB..', 'BBBBBBB.', '..B.B...', '..B.B...',
  ],
  ogre: [
    '..nnn...', '.nnnnn..', '.nknkn..', '..nwn...',
    '.NNNNN..', 'NNNNNNN.', 'NNNNNNN.', '.N...N..',
  ],
  vampire: [
    '..kkk...', '.kkkkk..', '.krkrk..', '..www...',
    '.dwwwd..', '.dddddd.', '.dddddd.', '..d..d..',
  ],
  kraken: [
    '..ppp...', '.ppppp..', '.pwpwp..', '..ppp...',
    'p.p.p.p.', '.p.p.p..', 'p..p..p.', '........',
  ],
  sandworm: [
    '..sssk..', '.sKKss..', '.ssss...', '..sSs...',
    '...ss...', '..sSs...', '...ss...', '........',
  ],
  basilisk: [
    '..GG....', '.GGgG...', '..Grg...', '...G....',
    '..G.....', '.GG.....', '..GG....', '....GG..',
  ],
  ice: [
    '...f....', '..fff...', '.ftftf..', '..fff...',
    '...f....', '...t....', '........', '........',
  ],
  volcano: [
    '...oo...', '..oyyo..', '...ss...', '..sSSs..',
    '.sSsRSs.', '.ssSsss.', 'sSSSSSss', 'ssssssss',
  ],
  tsunami: [
    '........', '..b.....', '.bBb....', '.bBBb..b',
    'bBBBb.bB', 'BBBBbBbB', '.BBBBBB.', '..BBBB..',
  ],
  blizzard: [
    '...f....', '.f.f.f..', '..fff...', 'ffffff..',
    '..fff...', '.f.f.f..', '...f....', '........',
  ],
  meteorshower: [
    'y...y...', '.o...y..', '..o...o.', '...O..o.',
    '.OO...O.', 'OOO.....', '.OO.O...', 'O.O.....',
  ],
  locust: [
    '........', '.y.o.y..', 'o.y.y.o.', '.y.o.y..',
    'y.o.y.o.', '.yy.yy..', '..oo.o..', '........',
  ],
  drought: [
    '...yy...', '.y.yy.y.', '..yyyy..', '.y.yy.y.',
    '...SS...', '..S..S..', '..SSSS..', '..S..S..',
  ],
  // —— 神力扩充（7）——
  rain: [
    '..BBB...', '.BBbBB..', 'bBBBbB..', '........',
    '.b..b.b.', 'b..b....', '.b..b.b.', '..b...b.',
  ],
  bless: [
    '...y....', '..ywy...', '...y....', 'y..y..y.',
    '.yywyy..', '...y....', '...y....', '........',
  ],
  curse: [
    '..ppp...', '.ppppp..', '.pwpwp..', '..ppp...',
    '..p.p...', '..ppp...', '.p.p.p..', '........',
  ],
  love: [
    '..p..p..', '.pppppp.', '.prrrrp.', '..prrp..',
    '...pp...', '..p.p...', '.p...p..', '........',
  ],
  mutate: [
    '..g..G..', '.gG..g..', '..gG.G..', '.G..g...',
    '..g..G..', '.gG..g..', '..g.G...', '........',
  ],
  teleport: [
    '....t...', '..t..t..', '...tt...', '.tttttt.',
    '...tt...', '..t..t..', '....t...', '........',
  ],
  wrath: [
    '.kkkkk..', 'kkkkkkk.', 'kyykkkk.', '........',
    '..y.....', '.yy.....', 'y.y.....', '........',
  ],
  holystorm: [
    '..ffff..', '.ffyyf..', 'ffyyyyf.', 'fyywyyf.',
    '.fyyyyf.', '..ffyf..', '...w.w..', '....w...',
  ],
  // —— 天灾扩充（6）——
  sandstorm: [
    '..ss....', '.sSSs...', 'sS..Ss..', 'sS..sSs.',
    '.sSSs...', '..ss..s.', '.s..s...', '........',
  ],
  typhoon: [
    '..bb....', '.bBBb...', 'bB..Bb..', 'bB.bBb..',
    '.bBBb...', '..bb..b.', '.b..b...', '........',
  ],
  sinkhole: [
    '..mmm...', '.m...m..', 'm..k..m.', 'm.k.k.m.',
    'm..k..m.', '.m.k.m..', '..mmm...', '........',
  ],
  iceage: [
    '...f....', '.f.f.f..', '..fff...', 'ffw.wff.',
    '..fff...', '.f.f.f..', '...f....', '........',
  ],
  famine: [
    '..ddd...', '.dDDDd..', 'dDDDDD..', '........',
    '.d..d...', '.dd.d...', '..d..d..', '........',
  ],
  blackhole: [
    '..ppp...', '.pkkkp..', 'pkkkkkp.', 'pkkkkkp.',
    'pkkkkkp.', '.pkkkp..', '..ppp...', '........',
  ],
  chest: [
    '........', '.NNNNNN.', '.NnnnnN.', '.NNyyNN.',
    '.NyyNyN.', '.NNNNNN.', '..N..N..', '........',
  ],
  sword1: [
    '......m.', '.....mm.', '....mm..', '...mm...',
    '..mm....', '..MM....', '.NMM....', '..N.....',
  ],
  sword2: [
    '......w.', '.....wm.', '....wm..', '...wm...',
    '..wm....', '.ywm....', '.yyM....', '..N.....',
  ],
  sword3: [
    '......y.', '.....yY.', '....yY..', '...yY...',
    '..yY....', '.oyY....', '.ooM....', '..N.....',
  ],
  armor: [
    '........', '.mm..mm.', '.mmmmmm.', '.mwmmmm.',
    '.mmmmmm.', '..mmmm..', '..mMMm..', '........',
  ],
  boots: [
    '........', '..NN....', '..NN....', '..NN....',
    '..NN....', '..NNN...', '.NNNN...', '........',
  ],
  ring: [
    '........', '...oo...', '..o..o..', '..o..o..',
    '...oo...', '...y....', '........', '........',
  ],
  chest2: [
    '........', '.NNNNNN.', '.NnnnnN.', '.NiiiiN.',
    '.NiNNiN.', '.NiiiiN.', '.NNNNNN.', '..N..N..',
  ],
  chest3: [
    '........', '.NNNNNN.', '.NnnnnN.', '.NaaaaN.',
    '.NaNnNaN.', '.NaaaaN.', '.NNNNNN.', '..N..N..',
  ],
  // —— 八新动物（陆地四 + 水生四）——
  chicken: [
    '........', '...ww...', '..wwkw..', '.wwwww..',
    '.wwwww..', '..wwww.o', '..w.....', '...y....',
  ],
  pig: [
    '........', '..nnn...', '.nnnnn..', '.nknkn..',
    '.nnwnn..', '.nnnnnN.', '..N..N..', '........',
  ],
  rabbit: [
    '..w..w..', '..w..w..', '..wwww..', '.wwkww..',
    '.wwwww..', '..wwww..', '...w.w..', '........',
  ],
  fox: [
    '...o....', '..ooo...', '..okoo..', '.ooooo..',
    '.ooooof.', 'ooo.oo..', '..o..o..', '..O..O..',
  ],
  fish: [
    '........', '........', '..bbb...', '.bbkbb.b',
    'bbbbbbBb', '.bbbbb..', '..bbb...', '........',
  ],
  crab: [
    '........', '.r...r..', '..r.r...', '.rrrrr..',
    'rrkRkrr.', 'rrrrrrr.', '.r.r.r..', '........',
  ],
  turtle: [
    '........', '..GGG...', '.GzGzG..', 'GzGGkzG.',
    '.GGGGG..', '.G...G..', 'z.....z.', '........',
  ],
  shark: [
    '........', '...m....', '..mmmm..', '.mmmkmm.',
    'mmmmmmm.', '.mmmmmm.', 'm.mm.m..', '........',
  ],
  // —— 沼泽 / 洪水 / 神之手指 ——
  swamp: [
    'ZZ..gg..', '.ZZgG...', 'ggZZGg..', '.zZZzg..',
    'GgZZgg..', '.zZZZg..', 'gg.zZ...', '........',
  ],
  flood: [
    '........', '.b.bb.b.', 'bBbBbBb.', 'bBBBBBb.',
    '.bBBBBb.', 'bBBbBBb.', '.bBBBb..', '..bbb...',
  ],
  finger: [
    '....ww..', '...wkw..', '...www..', '...www..',
    '..wwww..', '.ywwww..', '.yyww...', '.yy.....',
  ],
};

// 102 件物品的 8x8 图标（模板 × 稀有度调色）：合并进 ICONS
Object.assign(ICONS, buildItemIcons());

// ---------- tools ----------
export type ToolTab = 'creatures' | 'animals' | 'terrain' | 'disasters' | 'powers' | 'items';

/**
 * 工具可调参数（放置参数系统）：每个元素可根据自身属性声明多项参数。
 * - count    数量：一次施放生成的个体数（生物/宝物/陨石群/雷电连击/龙卷风）
 * - radius   半径：影响范围（格）——非笔刷类区域工具的独立范围调节
 * - power    强度：伤害/塌毁/喷发的倍率
 * - duration 持续：云系/风暴的存活 tick 数（15 tick = 1 秒，展示时自动折算秒）
 */
export interface ToolParam {
  key: 'count' | 'radius' | 'power' | 'duration';
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** 数值展示格式：sec = tick 折算为秒 */
  fmt?: 'sec';
}

/** 参数默认值提取（引擎/商店初始化用） */
export function defaultParams(defs?: ToolParam[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (defs) for (const p of defs) out[p.key] = p.def;
  return out;
}

export interface ToolDef {
  id: string;
  label: string;
  desc: string;
  tab: ToolTab;
  icon: string; // key in ICONS
  brush?: boolean; // uses brush radius & continuous paint
  single?: boolean; // fires once per click (never on drag)
  /** 可调参数（选中工具时在工具栏上方展示滑条） */
  params?: ToolParam[];
}

export const TOOLS: ToolDef[] = [
  // creatures
  { id: 'human', label: '人类', desc: '建立王国、建造房屋、繁衍生息', tab: 'creatures', icon: 'human' },
  { id: 'elf', label: '精灵', desc: '长寿而优雅，森林的宠儿', tab: 'creatures', icon: 'elf' },
  { id: 'dwarf', label: '矮人', desc: '坚韧的矿工，寿命悠长', tab: 'creatures', icon: 'dwarf' },
  { id: 'orc', label: '兽人', desc: '好战的绿皮部落', tab: 'creatures', icon: 'orc' },
  { id: 'bandit', label: '强盗', desc: '敌视一切文明，四处劫掠', tab: 'creatures', icon: 'bandit' },
  { id: 'skeleton', label: '骷髅', desc: '不朽的亡灵武士，永不衰老', tab: 'creatures', icon: 'skeleton' },
  { id: 'mage', label: '法师', desc: '从远处抛射火球的神秘术士', tab: 'creatures', icon: 'mage' },
  { id: 'demon', label: '恶魔', desc: '熔岩中诞生的灾厄，免疫火焰', tab: 'creatures', icon: 'demon', single: true },
  { id: 'lizard', label: '蜥蜴人', desc: '沼泽与沙地的鳞裔文明，可建立蜥蜴王国', tab: 'creatures', icon: 'lizard' },
  { id: 'goblin', label: '哥布林', desc: '弱小却繁殖极快的绿皮部落，人海战术', tab: 'creatures', icon: 'goblin' },
  { id: 'troll', label: '巨魔', desc: '再生力惊人的山岭巨怪，独来独往', tab: 'creatures', icon: 'troll', single: true },
  { id: 'ogre', label: '食人魔', desc: '挥舞巨棒的愚蠢饕餮，一击粉碎', tab: 'creatures', icon: 'ogre', single: true },
  { id: 'whitewalker', label: '白行者', desc: '寒冰之主：途经之地霜冻，被害者化为骷髅', tab: 'creatures', icon: 'whitewalker', single: true },
  { id: 'vampire', label: '吸血鬼', desc: '以血为食的永夜贵族，攻击可回血', tab: 'creatures', icon: 'vampire', single: true },
  { id: 'kraken', label: '克拉肯', desc: '深海巨怪：触手袭击海岸、拖拽船只入深渊', tab: 'creatures', icon: 'kraken', single: true },
  { id: 'sandworm', label: '沙虫', desc: '沙漠巨虫：沙下潜行，吞噬小型生物', tab: 'creatures', icon: 'sandworm', single: true },
  { id: 'basilisk', label: '蛇怪', desc: '毒牙与石化凝视：被它盯住的猎物化为石像', tab: 'creatures', icon: 'basilisk', single: true },
  { id: 'angel', label: '天使', desc: '光明使者：圣光治愈凡间众生，圣剑专为亡灵与恶魔出鞘', tab: 'creatures', icon: 'angel', single: true },
  { id: 'phoenix', label: '凤凰', desc: '浴火神鸟：烈焰为羽，陨落后自灰烬中重生（至多三次）', tab: 'creatures', icon: 'phoenix', single: true },
  { id: 'ent', label: '树人', desc: '森林守护者：播撒种子令森林扩张，为林间生灵扑灭火魔', tab: 'creatures', icon: 'ent', single: true },
  { id: 'lich', label: '巫妖', desc: '死灵领主：将战场尸骸复生为骷髅，编入永夜的亡者军团', tab: 'creatures', icon: 'lich', single: true },
  { id: 'hydra', label: '九头蛇', desc: '斩首不死的沼泽巨蟒：被杀时断颈萌发两条幼蛇；唯有火焰烧灼方能阻止再生', tab: 'creatures', icon: 'hydra', single: true },
  // animals
  { id: 'sheep', label: '绵羊', desc: '温顺可爱，会咩咩叫', tab: 'animals', icon: 'sheep' },
  { id: 'wolf', label: '狼', desc: '成群猎食绵羊', tab: 'animals', icon: 'wolf' },
  { id: 'bear', label: '熊', desc: '领地意识极强的猛兽', tab: 'animals', icon: 'bear' },
  { id: 'dragon', label: '巨龙', desc: '喷吐烈焰的灾厄之翼', tab: 'animals', icon: 'dragon', single: true },
  { id: 'zombie', label: '僵尸', desc: '被咬死的单位会变成僵尸', tab: 'animals', icon: 'zombie' },
  { id: 'deer', label: '鹿', desc: '机敏的食草动物，喜欢草地', tab: 'animals', icon: 'deer' },
  { id: 'penguin', label: '企鹅', desc: '雪原上的蹒跚居民', tab: 'animals', icon: 'penguin' },
  { id: 'camel', label: '骆驼', desc: '沙漠之舟，驼峰里装满韧性', tab: 'animals', icon: 'camel' },
  { id: 'scorpion', label: '蝎子', desc: '带毒刺的沙漠小猎手，蜇中会染病', tab: 'animals', icon: 'scorpion' },
  { id: 'snake', label: '蛇', desc: '沙漠的毒牙猎手，咬中毒发', tab: 'animals', icon: 'snake' },
  { id: 'snowwolf', label: '雪狼', desc: '极地冰原的白色猎手，追猎企鹅', tab: 'animals', icon: 'snowwolf' },
  { id: 'chicken', label: '鸡', desc: '村落草地间的家禽，咕咕哒', tab: 'animals', icon: 'chicken' },
  { id: 'pig', label: '猪', desc: '圈边打滚的杂食家畜，浑身是宝（掉肉）', tab: 'animals', icon: 'pig' },
  { id: 'rabbit', label: '兔', desc: '草地与林缘的机敏小兽，繁殖飞快', tab: 'animals', icon: 'rabbit' },
  { id: 'fox', label: '狐', desc: '林间赤色猎手，捕食兔与鸡', tab: 'animals', icon: 'fox' },
  { id: 'fish', label: '鱼', desc: '群游的小鱼：5-10 结队巡游，鲨鱼与水岸住民的美餐', tab: 'animals', icon: 'fish' },
  { id: 'crab', label: '蟹', desc: '横行邻水沙滩的甲壳小将', tab: 'animals', icon: 'crab' },
  { id: 'turtle', label: '龟', desc: '海洋中缓慢游荡的长寿浮游者', tab: 'animals', icon: 'turtle' },
  { id: 'shark', label: '鲨鱼', desc: '海洋顶级掠食者：捕食鱼群与落水的游泳者', tab: 'animals', icon: 'shark' },
  // terrain
  { id: 'raise', label: '陆地', desc: '抬升地形：水→沙滩→草地', tab: 'terrain', icon: 'raise', brush: true },
  { id: 'water', label: '海洋', desc: '淹没大地，单位会溺水', tab: 'terrain', icon: 'water', brush: true },
  { id: 'sand', label: '沙滩', desc: '铺设金色的沙', tab: 'terrain', icon: 'sand', brush: true },
  { id: 'grass', label: '草地', desc: '铺设生机勃勃的草', tab: 'terrain', icon: 'grass', brush: true },
  { id: 'forest', label: '森林', desc: '种下树木（可燃烧）', tab: 'terrain', icon: 'forest', brush: true },
  { id: 'mountain', label: '山脉', desc: '不可通行的巍峨高山', tab: 'terrain', icon: 'mountain', brush: true },
  { id: 'snow', label: '雪地', desc: '铺上皑皑白雪', tab: 'terrain', icon: 'snow', brush: true },
  { id: 'ice', label: '冰面', desc: '冻结的水面：可行走，遇火与暖气候会消融', tab: 'terrain', icon: 'ice', brush: true },
  { id: 'swamp', label: '沼泽', desc: '浑浊的绿褐湿地：单位迟缓，火焰不蔓延，不生草木', tab: 'terrain', icon: 'swamp', brush: true },
  { id: 'lava', label: '岩浆', desc: '滚烫的熔岩，触之即死', tab: 'terrain', icon: 'lava', brush: true },
  { id: 'river', label: '河流', desc: '开凿一条蜿蜒入海的河，沿岸化作绿洲', tab: 'terrain', icon: 'river', single: true },
  { id: 'oasis', label: '绿洲', desc: '在沙漠中点出一泓清泉与草木葱茏的环带', tab: 'terrain', icon: 'oasis', single: true },
  { id: 'smooth', label: '平滑', desc: '抚平海岸与地形的锋利边缘', tab: 'terrain', icon: 'smooth', brush: true },
  { id: 'rough', label: '粗糙', desc: '打碎地形边缘，制造嶙峋的纹理', tab: 'terrain', icon: 'rough', brush: true },
  // disasters
  { id: 'fire', label: '火焰', desc: '点燃大地，火焰会蔓延', tab: 'disasters', icon: 'fire', brush: true },
  { id: 'lightning', label: '闪电', desc: '天降雷霆，引燃周围', tab: 'disasters', icon: 'lightning', params: [
    { key: 'count', label: '连击数', min: 1, max: 12, step: 1, def: 1 },
    { key: 'power', label: '强度', min: 0.5, max: 3, step: 0.5, def: 1 },
  ] },
  { id: 'tornado', label: '龙卷风', desc: '移动的毁灭漩涡', tab: 'disasters', icon: 'tornado', single: true, params: [
    { key: 'count', label: '数量', min: 1, max: 6, step: 1, def: 1 },
  ] },
  { id: 'earthquake', label: '地震', desc: '大地震颤，建筑崩塌', tab: 'disasters', icon: 'earthquake', single: true, params: [
    { key: 'radius', label: '波及半径', min: 4, max: 18, step: 1, def: 9 },
    { key: 'power', label: '烈度', min: 0.5, max: 3, step: 0.5, def: 1 },
  ] },
  { id: 'meteor', label: '陨石', desc: '从天而降的燃烧巨石', tab: 'disasters', icon: 'meteor', single: true, params: [
    { key: 'count', label: '数量', min: 1, max: 8, step: 1, def: 1 },
  ] },
  { id: 'nuke', label: '核弹', desc: '蘑菇云与辐射之地', tab: 'disasters', icon: 'nuke', single: true, params: [
    { key: 'power', label: '当量', min: 0.4, max: 3, step: 0.2, def: 1 },
  ] },
  { id: 'plague', label: '瘟疫', desc: '在生物间传染的恶疾', tab: 'disasters', icon: 'plague', brush: false },
  { id: 'acidrain', label: '酸雨', desc: '凝聚腐蚀性的雨云：持续伤害生物、枯萎植被、蚀损建筑', tab: 'disasters', icon: 'acidrain', params: [
    { key: 'radius', label: '半径', min: 4, max: 16, step: 1, def: 5 },
    { key: 'duration', label: '持续', min: 60, max: 420, step: 20, def: 150, fmt: 'sec' },
  ] },
  { id: 'volcano', label: '火山', desc: '大地隆起火山：喷发熔岩弹与火海，岩浆四溢', tab: 'disasters', icon: 'volcano', single: true, params: [
    { key: 'power', label: '喷发烈度', min: 1, max: 3, step: 1, def: 1 },
  ] },
  { id: 'tsunami', label: '海啸', desc: '滔天巨浪漫过海岸：淹没低地、冲毁建筑（浪级可调）', tab: 'disasters', icon: 'tsunami', single: true, params: [
    { key: 'radius', label: '浪级', min: 1, max: 12, step: 1, def: 3 },
  ] },
  { id: 'blizzard', label: '暴风雪', desc: '游荡的冰暴：冻结大地为雪原，生物被寒霜减速冻伤', tab: 'disasters', icon: 'blizzard', params: [
    { key: 'radius', label: '半径', min: 5, max: 15, step: 1, def: 6 },
    { key: 'duration', label: '持续', min: 80, max: 400, step: 20, def: 190, fmt: 'sec' },
  ] },
  { id: 'meteorshower', label: '陨石雨', desc: '一连串燃烧陨石轮番轰击区域', tab: 'disasters', icon: 'meteorshower', single: true, params: [
    { key: 'count', label: '陨石数', min: 3, max: 24, step: 1, def: 7 },
    { key: 'radius', label: '散布半径', min: 4, max: 18, step: 1, def: 5 },
  ] },
  { id: 'locust', label: '蝗灾', desc: '游荡的蝗群：吞噬一切植被与农田', tab: 'disasters', icon: 'locust', single: true, params: [
    { key: 'radius', label: '虫群半径', min: 3, max: 10, step: 1, def: 5 },
    { key: 'duration', label: '持续', min: 100, max: 480, step: 20, def: 240, fmt: 'sec' },
  ] },
  { id: 'drought', label: '干旱', desc: '灼热旱魃笼罩：草枯为沙、林化为烬、浅水蒸发', tab: 'disasters', icon: 'drought', params: [
    { key: 'radius', label: '半径', min: 5, max: 16, step: 1, def: 6 },
    { key: 'duration', label: '持续', min: 80, max: 400, step: 20, def: 200, fmt: 'sec' },
  ] },
  { id: 'sandstorm', label: '沙尘暴', desc: '游荡的沙暴：草化为沙、生物迷失风中', tab: 'disasters', icon: 'sandstorm', single: true, params: [
    { key: 'radius', label: '半径', min: 3, max: 12, step: 1, def: 6 },
    { key: 'duration', label: '持续', min: 100, max: 480, step: 20, def: 280, fmt: 'sec' },
  ] },
  { id: 'typhoon', label: '台风', desc: '海上生成的狂暴气旋：裹挟狂风暴雨与雷电', tab: 'disasters', icon: 'typhoon', single: true, params: [
    { key: 'radius', label: '风眼半径', min: 4, max: 14, step: 1, def: 6 },
    { key: 'duration', label: '持续', min: 100, max: 480, step: 20, def: 240, fmt: 'sec' },
  ] },
  { id: 'sinkhole', label: '深渊天坑', desc: '大地塌陷成湖：范围内的一切坠入深渊（半径可调）', tab: 'disasters', icon: 'sinkhole', single: true, params: [
    { key: 'radius', label: '塌陷半径', min: 3, max: 12, step: 1, def: 4 },
  ] },
  { id: 'iceage', label: '冰河寒潮', desc: '极寒穹顶降临：大地冻结为雷原冰盖（半径可调）', tab: 'disasters', icon: 'iceage', single: true, params: [
    { key: 'radius', label: '冰穹半径', min: 6, max: 24, step: 1, def: 12 },
    { key: 'duration', label: '持续', min: 200, max: 700, step: 20, def: 420, fmt: 'sec' },
  ] },
  { id: 'famine', label: '饥荒', desc: '灰色贫瘠之云：生灵饿殍、田园荒芜、绝育断代', tab: 'disasters', icon: 'famine', single: true, params: [
    { key: 'radius', label: '半径', min: 3, max: 12, step: 1, def: 6 },
    { key: 'duration', label: '持续', min: 100, max: 480, step: 20, def: 260, fmt: 'sec' },
  ] },
  { id: 'blackhole', label: '黑洞', desc: '吞噬一切的时空陷阱：万物被吸入后化为斋灭', tab: 'disasters', icon: 'blackhole', single: true, params: [
    { key: 'radius', label: '引力半径', min: 4, max: 16, step: 1, def: 8 },
    { key: 'duration', label: '存续', min: 60, max: 260, step: 10, def: 130, fmt: 'sec' },
  ] },
  { id: 'flood', label: '洪水', desc: '神力放水：目标区域漫成泽国，数秒后退去', tab: 'disasters', icon: 'flood', single: true, params: [
    { key: 'radius', label: '泛滥半径', min: 2, max: 12, step: 1, def: 5 },
  ] },
  // powers
  { id: 'heal', label: '治疗', desc: '治愈、灭火、复苏大地', tab: 'powers', icon: 'heal', brush: true },
  { id: 'kill', label: '死亡之指', desc: '抹除范围内的生物', tab: 'powers', icon: 'kill', brush: true },
  { id: 'boom', label: '爆炸', desc: '小规模爆破', tab: 'powers', icon: 'boom', params: [
    { key: 'radius', label: '爆炸半径', min: 1, max: 8, step: 0.2, def: 2.4 },
  ] },
  { id: 'rain', label: '唤雨', desc: '甘霖云：浇灭火焰、洗净辐射、复苏焦土为草原', tab: 'powers', icon: 'rain', brush: true, params: [
    { key: 'duration', label: '持续', min: 60, max: 400, step: 20, def: 200, fmt: 'sec' },
  ] },
  { id: 'bless', label: '神恩祝福', desc: '金光加身：伤害提升、伤口念合（持续一段时间）', tab: 'powers', icon: 'bless', brush: true },
  { id: 'curse', label: '神罚诅咒', desc: '紫霾缠身：行动迟缓、日渐衰弱', tab: 'powers', icon: 'curse', brush: true },
  { id: 'love', label: '爱之甘霖', desc: '爱心化雨：受泽者繁衍欲望大增', tab: 'powers', icon: 'love', brush: true },
  { id: 'mutate', label: '基因突变', desc: '乱流改写基因：加速生物进化（也可能劣化）', tab: 'powers', icon: 'mutate', brush: true },
  { id: 'teleport', label: '空间传送', desc: '扭曲空间：范围内生物被随机传送至世界某处', tab: 'powers', icon: 'teleport', brush: true },
  { id: 'wrath', label: '天罚风暴', desc: '怒云压城：雷暴持续轰击区域（半径可调）', tab: 'powers', icon: 'wrath', single: true, params: [
    { key: 'radius', label: '雷域半径', min: 4, max: 14, step: 1, def: 5 },
    { key: 'duration', label: '持续', min: 60, max: 300, step: 10, def: 180, fmt: 'sec' },
  ] },
  { id: 'finger', label: '神之手指', desc: '按住抓起最近的生物跟随指针，甩出掷飞（落地眩晕受伤）', tab: 'powers', icon: 'finger', single: true },
  { id: 'holystorm', label: '圣光风暴', desc: '金色圣云游荡：审判亡灵恶魔巨龙，治愈无辜生灵，浇灭火焰复苏焦土（半径可调）', tab: 'powers', icon: 'holystorm', single: true, params: [
    { key: 'radius', label: '圣域半径', min: 4, max: 14, step: 1, def: 5 },
    { key: 'duration', label: '持续', min: 60, max: 300, step: 10, def: 200, fmt: 'sec' },
  ] },
  // items（宝物：3 档宝箱 + 全量 102 件物品工具，由下方程序化生成）
  { id: 'chest', label: '宝箱', desc: '掉落一件随机宝物（普通为主），等待生物拾取', tab: 'items', icon: 'chest', single: true },
  { id: 'chest2', label: '秘银宝箱', desc: '掉落一件精良以上的宝物', tab: 'items', icon: 'chest2', single: true },
  { id: 'chest3', label: '神话宝箱', desc: '掉落一件史诗或传说宝物', tab: 'items', icon: 'chest3', single: true },
];

// —— 102 件物品 → 工具（按槽位分类标签：wep 武器 / arm 护甲 / hlm 头盔 / shd 盾牌 / bts 靴 / rng 戒 / amu 符）
for (const it of ALL_ITEMS) {
  const rar = RARITY_META[it.rarity];
  TOOLS.push({
    id: `item_${it.key}`,
    label: it.name,
    desc: `${rar.name} · ${SLOT_NAMES[it.slot]} · ${it.desc}`,
    tab: 'items',
    icon: it.key,
    single: true,
  });
}

// —— 宝物工具（三档宝箱 + 102 件物品）：掉落数量 ——
for (const t of TOOLS) {
  if (t.tab === 'items' && !t.params) {
    t.params = [{ key: 'count', label: '数量', min: 1, max: 8, step: 1, def: 1 }];
  }
}

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

export const RACE_TOOL: Record<string, number> = {
  human: R.HUMAN, elf: R.ELF, dwarf: R.DWARF, orc: R.ORC,
  bandit: R.BANDIT, zombie: R.ZOMBIE, sheep: R.SHEEP, wolf: R.WOLF,
  bear: R.BEAR, dragon: R.DRAGON, deer: R.DEER, penguin: R.PENGUIN, camel: R.CAMEL, scorpion: R.SCORPION, snake: R.SNAKE, snowwolf: R.SNOWWOLF,
  skeleton: R.SKELETON, demon: R.DEMON, mage: R.MAGE,
  lizard: R.LIZARD, goblin: R.GOBLIN, troll: R.TROLL, ogre: R.OGRE, whitewalker: R.WHITEWALKER, vampire: R.VAMPIRE,
  kraken: R.KRAKEN, sandworm: R.SANDWORM, basilisk: R.BASILISK, angel: R.ANGEL, phoenix: R.PHOENIX, ent: R.ENT, lich: R.LICH, hydra: R.HYDRA,
  chicken: R.CHICKEN, pig: R.PIG, rabbit: R.RABBIT, fox: R.FOX,
  fish: R.FISH, crab: R.CRAB, turtle: R.TURTLE, shark: R.SHARK,
};

// —— 生物工具：统一挂「数量」参数（巨型异兽上限 8，普通生物上限 20）——
for (const t of TOOLS) {
  if (RACE_TOOL[t.id] !== undefined && !t.params) {
    const big = !!t.single;
    t.params = [{ key: 'count', label: '数量', min: 1, max: big ? 8 : 20, step: 1, def: 1 }];
  }
}

/** 宝物工具 id → 物品种类（applyTool 分发用；含全量 102 件） */
export const ITEM_TOOL: Record<string, string> = { chest2: 'chest2', chest3: 'chest3' };
for (const it of ALL_ITEMS) ITEM_TOOL[`item_${it.key}`] = it.key;

// 旧版工具 id 兼容（旧存档触发器 action / 旧物品工具引用 'sword1' 等裸键）
for (const legacy of ['sword1', 'sword2', 'sword3', 'armor1', 'armor2', 'boots', 'ring']) {
  ITEM_TOOL[legacy] = legacy;
  const src = TOOL_BY_ID[`item_${legacy}`];
  if (src) TOOL_BY_ID[legacy] = src;
}

/** 宝箱工具 → 掉落参数（稀有度区间） */
export const CHEST_TIERS: Record<string, { min: number; max: number; label: string }> = {
  chest: { min: 0, max: 4, label: '宝箱' },
  chest2: { min: 1, max: 4, label: '秘银宝箱' },
  chest3: { min: 3, max: 4, label: '神话宝箱' },
};

/** 随机掉落器（供 engine 直接调用） */
export function rollChestItem(tier: string, rng: () => number): string {
  const t = CHEST_TIERS[tier];
  return t ? rollItem(rng, { minRarity: t.min, maxRarity: t.max }) : rollItem(rng);
}

export const TAB_META: { id: ToolTab; label: string }[] = [
  { id: 'creatures', label: '智慧生物' },
  { id: 'animals', label: '动物' },
  { id: 'terrain', label: '地形' },
  { id: 'disasters', label: '天灾' },
  { id: 'powers', label: '神力' },
  { id: 'items', label: '宝物' },
];

// race dot colors for the stats bar (keyed by race key)
export const RACE_DOT: Record<string, string> = {
  human: '#d9a066', elf: '#9ad06a', dwarf: '#ffb020', orc: '#7fa93c',
  bandit: '#3a342c', zombie: '#64c95d', sheep: '#f2ead8', wolf: '#8d8d8d',
  bear: '#6e4a2b', dragon: '#cf3f2e', deer: '#c98d5a', penguin: '#f2ead8', camel: '#e3cf96', scorpion: '#8c2317', snake: '#4a8f3c', snowwolf: '#d4dde4',
  skeleton: '#d9d6cf', demon: '#e0432e', mage: '#9b59d0',
  lizard: '#4f9e3a', goblin: '#7fa93c', troll: '#2c5e24', ogre: '#c98d5a', whitewalker: '#7fc4e8', vampire: '#8a2f4f',
  kraken: '#d556c0', sandworm: '#c4ad74', basilisk: '#5a7a2c',
  chicken: '#f2ead8', pig: '#e8b4b8', rabbit: '#e6e2d8', fox: '#e07b39',
  fish: '#5ba8e0', crab: '#cf3f2e', turtle: '#4f9e3a', shark: '#575757',
};
