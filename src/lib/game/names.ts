// ============ Name generation for units & kingdoms ============
import type { RaceId } from './types';
import { mulberry32 } from './noise';

export const FIRST: Record<number, string[]> = {
  0: ['Alric', 'Berta', 'Corin', 'Dahlia', 'Edwin', 'Faye', 'Gareth', 'Hilda', 'Ivan', 'Jora', 'Kelvin', 'Lyra', 'Marcus', 'Nora', 'Osric', 'Petra'],
  1: ['Aelar', 'Briel', 'Caelum', 'Dain', 'Elowen', 'Faelis', 'Galad', 'Haldir', 'Ithil', 'Laucian', 'Mirelle', 'Naivara', 'Orophin', 'Priami', 'Riardon', 'Sylvar'],
  2: ['Adrik', 'Balgor', 'Brunhild', 'Dolgrim', 'Durik', 'Edvana', 'Farga', 'Grimli', 'Harbek', 'Ingvar', 'Karrak', 'Morgran', 'Norgra', 'Oskar', 'Thrain', 'Ulfgar'],
  3: ['Ashgar', 'Brug', 'Durok', 'Gashnak', 'Grum', 'Hargor', 'Kargh', 'Mok', 'Nargul', 'Ogrum', 'Rukk', 'Shagrat', 'Thokk', 'Uglok', 'Vrag', 'Zugor'],
  4: ['Raven', 'Vex', 'Crow', 'Shade', 'Fang', 'Dirk', 'Whisper', 'Krait'],
  5: ['Rot', 'Shamble', 'Gnaw', 'Groan', 'Lurch', 'Decay'],
  6: ['Wooly', 'Fluff', 'Baaald', 'Shears', 'Cloud', 'Tumble'],
  7: ['Fenrir', 'Grey', 'Howl', 'Fang', 'Shadow', 'Nip'],
  8: ['Bruno', 'Kodiak', 'Ursa', 'Grizzle', 'Paw', 'Claw'],
  9: ['Smaug', 'Ancalagon', 'Glaurung', 'Firnaki', 'Vermithor', 'Balerion'],
  10: ['Bambi', 'Fawn', 'Dash', 'Clover', 'Willow', 'Bramble', 'Hazel', 'Sorrel'],
  11: ['Pingu', 'Waddle', 'Chilly', 'Tux', 'Frostie', 'Pebble', 'Skipper', 'Noot'],
  12: ['Sahara', 'Dune', 'Humpy', 'Oasis', 'Sandy', 'Caravan', 'Mirage', 'Nabd'],
  13: ['Sting', 'Venom', 'Skitter', 'Pincer', 'Sable', 'Rust', 'Barb', 'Flick'],
  14: ['Hiss', 'Coil', 'Slither', 'Sidewind', 'Mamba', 'Viper', 'Rattle', 'Adder'],
  15: ['Frost', 'Blizzard', 'Avalanche', 'Snowcap', 'Glacia', 'Arctic', 'Polar', 'Yuki', 'Tundra', 'Rime'],
  16: ['Bones', 'Rattle', 'Marrow', 'Creak', 'Skull', 'Grin', 'Clatter', 'Dust', 'Hollow', 'Grim'],
  17: ['Azgor', 'Balroth', 'Mephisto', 'Vulgrim', 'Xaroth', 'Infernus', 'Malgor', 'Pyros', 'Zagan', 'Nihil'],
  18: ['Zarkon', 'Merlyn', 'Alazar', 'Drahcir', 'Vexis', 'Ozric', 'Thulsa', 'Ravenor', 'Kaldor', 'Sarquiss'],
  19: ['Sszar', 'Hsska', 'Zsthax', 'Kressh', 'Vissith', 'Slithis', 'Grix', 'Xessk', 'Thassk', 'Narsss', 'Skarn', 'Veshk'],
  20: ['Grizzik', 'Snik', 'Zog', 'Nix', 'Rikt', 'Pob', 'Grib', 'Skab', 'Wix', 'Trug', 'Miz', 'Krag', 'Splug', 'Yark'],
  21: ['Grolk', 'Ungo', 'Karnn', 'Brogg', 'Zull', 'Morgg', 'Durn', 'Skalgg', 'Hrukk', 'Vorn', 'Tuskarr', 'Grumb'],
  22: ['Gnash', 'Chomper', 'Bruuz', 'Gulp', 'Mawg', 'Krunch', 'Slogg', 'Bite', 'Gorge', 'Tumm', 'Snack', 'Devour'],
  23: ['Kael', 'Noctis', 'Vhorn', 'Icethorn', 'Sorrow', 'Winterborn', 'Grim', 'Pale', 'Nihils', 'Rime', 'Hoarfrost', 'Shiver'],
  24: ['Dracul', 'Carmilla', 'Alucard', 'Nosferu', 'Vlad', 'Lestat', 'Sanguine', 'Nocturn', 'Vesper', 'Morwenna', 'Bloodwyn', 'Duskryn'],
  25: ['Nessie', 'Abyssus', 'Scylla', 'Charyb', 'Tentacl', 'Inkblot', 'Maelstr', 'Leviath', 'Briney', 'Krakenor', 'Drench', 'Umiboz'],
  26: ['Shai', 'Hulud', 'Ggrukkk', 'Wyrmoid', 'Sandst', 'Dunerig', 'Tremorr', 'Borewor', 'Grainma', 'Siftjaw', 'Cyclura', 'Migon'],
  27: ['Medusae', 'Cockatri', 'Gorgon', 'Basilio', 'Sserqet', 'Venomax', 'Stareye', 'Scalecr', 'Hissra', 'Stonega', 'Najar', 'Sibyl'],
};

const KINGDOM_PRE = ['Iron', 'Storm', 'Ember', 'Frost', 'Gold', 'Silver', 'Thorn', 'Wolfs', 'Raven', 'Oak', 'Star', 'Sun', 'Moon', 'Stone', 'Wind', 'Mist', 'Dawn', 'Dusk', 'Crystal', 'Thunder'];
const KINGDOM_SUF = ['hold', 'gard', 'fell', 'mere', 'burg', 'haven', 'shire', 'crest', 'vale', 'watch', 'forge', 'rest', 'moor', 'spire', 'reach'];
const BANNERS = ['狮', '狼', '鹰', '鹿', '熊', '龙', '蛇', '鱼', '虎', '鸦', '马', '牛', '羊', '狐', '豹', '鲸'];

// ---------------- 军团命名（军队方阵体系） ----------------
const ARMY_PRE = ['苍', '黑', '白', '血', '铁', '烈', '寒', '金', '银', '怒', '晨', '暮', '风', '雷', '霜', '焰'];
const ARMY_MID = ['狼', '鹰', '狮', '龙', '熊', '鸦', '虎', '鹿', '蛇', '蝎', '犀', '鲨'];
const ARMY_SUF = ['军团', '方阵', '铁卫', '战团', '军团', '远征军', '兵团'];
/** 兵种后缀（按组建方成分量选：步卒/弓手/混编） */
const ARMY_JOB_SUF = ['步卒军团', '箭雨方阵', '混编战团'];

/** 军团名：`{苍狼}{军团}` 式两段命名；同国多军团自然编号 */
export function armyName(rand: () => number, seq: number): string {
  const pre = ARMY_PRE[Math.floor(rand() * ARMY_PRE.length)];
  const mid = ARMY_MID[Math.floor(rand() * ARMY_MID.length)];
  const suf = ARMY_SUF[Math.floor(rand() * ARMY_SUF.length)];
  const base = `${pre}${mid}${suf}`;
  return seq <= 1 ? base : `${base}·${roman(seq)}`;
}

/** 会战地名：战役纪事用（「血谷」「白滩」式地名 + 战役级称谓） */
const FIELD_PRE = ['血', '白', '黑', '灰', '赤', '金', '寒', '荒', '雾', '断'];
const FIELD_SUF = ['谷', '滩', '原', '桥', '坡', '林', '渡', '丘', '河湾', '隘口'];
export function battleFieldName(rand: () => number): string {
  return `${FIELD_PRE[Math.floor(rand() * FIELD_PRE.length)]}${FIELD_SUF[Math.floor(rand() * FIELD_SUF.length)]}`;
}

/** 军团名（兵种风格版）：根据成员职业占比选后缀 */
export function armyNameByJobs(rand: () => number, seq: number, archerRatio: number): string {
  const pre = ARMY_PRE[Math.floor(rand() * ARMY_PRE.length)];
  const mid = ARMY_MID[Math.floor(rand() * ARMY_MID.length)];
  let suf: string;
  if (archerRatio > 0.66) suf = ARMY_JOB_SUF[1];
  else if (archerRatio < 0.25) suf = ARMY_JOB_SUF[0];
  else suf = ARMY_JOB_SUF[2];
  const base = `${pre}${mid}${suf}`;
  return seq <= 1 ? base : `${base}·${roman(seq)}`;
}

export function unitName(race: RaceId, rand: () => number): string {
  const pool = FIRST[race] ?? FIRST[0];
  return pool[Math.floor(rand() * pool.length)];
}

/** 小写罗马数字（1-40；超出直接返回数字字符串） */
export function roman(n: number): string {
  if (n < 1 || n > 40) return String(n);
  const table: [number, string][] = [
    [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  let v = n;
  for (const [val, sym] of table) {
    while (v >= val) { out += sym; v -= val; }
  }
  return out.toUpperCase();
}

export function civName(rand: () => number): { name: string; banner: string } {
  const pre = KINGDOM_PRE[Math.floor(rand() * KINGDOM_PRE.length)];
  const suf = KINGDOM_SUF[Math.floor(rand() * KINGDOM_SUF.length)];
  const banner = BANNERS[Math.floor(rand() * BANNERS.length)];
  return { name: `${pre}${suf}`, banner };
}

export function makeRng(seed: number) {
  return mulberry32(seed);
}
