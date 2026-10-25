// ============ wbcore — 像素世界盒子 WASM 模拟内核 v2 ============
// Stage 1（Task 45-a）：9 桶敌我扫描（位精确，已验证）
// Stage 2（本版）：unitsTick 全量批处理移植 —— updateUnit/moveUnit/spawnUnit/
//   updateBoat/战斗树/职业 AI/繁衍/拾取 + mulberry32 RNG 位精确推进 +
//   fx 虚拟队列 + 动作回放协议 + 稀疏路径 bail（JS 接力）
//
// 设计铁律：
//   1. RNG：mulberry32 状态驻留 arena —— Rust 消耗后写回，TS 流无缝续接（位精确）
//   2. 超越函数：自带 fdlibm（jsmath.rs，已对 netlib 参考实现 200000 样本 0 位差）
//      → WASM 路径跨平台确定性（不再依赖浏览器 libm）
//   3. 副作用：视觉/播报/遥测 → 动作缓冲（TS 按序回放）；
//      模拟态（地形/火/建筑血量/感染/恐慌）→ Rust 镜像即刻生效 + 动作同步 TS
//   4. 稀疏复杂路径（建筑摧毁级联/涌现特质/商队结算/殖民建城/船单位）→ bail：
//      停批 → TS 回放已有动作 + 写回脏行 + 同步 RNG → JS 接力该单位 → 全量重打包 → 续批
//   5. 迭代序 = JS for-of 活数组语义（含批内 push 的新生单位）
//
// ABI：raw C（无 wasm-bindgen）——TS 侧 glue 见 src/lib/wasm/wbspatial.ts

#![allow(clippy::missing_safety_doc)]
#![allow(clippy::too_many_arguments)]

pub mod jsmath;
pub mod units;

// ---------------- 常量 ----------------
pub const MAX_RACES: usize = 512;
pub const MAX_CIVS: usize = 64;
pub const PANIC_CAP: usize = 32;
pub const GRUDGE_CAP: usize = 32;
pub const MAX_UNITS: usize = 4096;
pub const TILES: usize = 40960;
pub const MAX_FAM: usize = 256;
pub const MAX_BLD: usize = 1024;
pub const MAX_ITEMS: usize = 256;
pub const MAX_TRAITS: usize = 32;
pub const MAX_ITEMDEFS: usize = 128;
pub const ACT_CAP: usize = 262144;
pub const FXMIN_CAP: usize = 1600;
pub const UG_CAP: usize = 8; // JS gIds 实际上限 4，取 8 冗余

// 种族标志位（pack 时由 TS RACES 表写入；Stage 1 兼容）
pub const F_HOSTILE: u8 = 1;
pub const F_CIV: u8 = 2;
pub const F_UNDEAD: u8 = 4;
pub const F_PREDATOR: u8 = 8;
pub const F_HERBIVORE: u8 = 16;

// R 常量（types.ts 对齐）
pub const R_ZOMBIE: usize = 5;
pub const R_BEAR: usize = 8;
pub const R_DRAGON: usize = 9;
pub const R_SCORPION: usize = 13;
pub const R_SNAKE: usize = 14;
pub const R_SKELETON: usize = 16;
pub const R_DEMON: usize = 17;
pub const R_MAGE: usize = 18;
pub const R_WHITEWALKER: usize = 23;
pub const R_VAMPIRE: usize = 24;
pub const R_KRAKEN: usize = 25;
pub const R_SANDWORM: usize = 26;
pub const R_BASILISK: usize = 27;
pub const R_BANDIT: usize = 4;
pub const R_SHEEP: usize = 6;

// 地形枚举（constants.ts T）
pub const T_DEEP: u8 = 0;
pub const T_WATER: u8 = 1;
pub const T_SAND: u8 = 2;
pub const T_GRASS: u8 = 3;
pub const T_FOREST: u8 = 4;
pub const T_HILL: u8 = 5;
pub const T_MOUNTAIN: u8 = 6;
pub const T_SNOW: u8 = 7;
pub const T_LAVA: u8 = 8;
pub const T_BURNT: u8 = 9;
pub const T_ICE: u8 = 10;

pub const W: i32 = 256;
pub const H: i32 = 160;

// ---------------- Stage 1 结果结构（兼容保留） ----------------
#[repr(C)]
pub struct ScanResult {
    pub enemy_slot: i32,
    pub overflow: i32,
    pub best_d: f64,
    pub enemy_d: f64,
    pub allies: u32,
    pub foes: u32,
    pub panic_n: u32,
    pub _pad: u32,
    pub panic_slots: [u32; PANIC_CAP],
    pub panic_vals: [f64; PANIC_CAP],
}
const RESULT_BYTES: usize = core::mem::size_of::<ScanResult>();

// ---------------- arena 区域 id（u32；offs 表索引） ----------------
// Stage 1（0-17 保留不动）
pub const OFF_UX: u32 = 0;
pub const OFF_UY: u32 = 1;
pub const OFF_UPANIC: u32 = 2;
pub const OFF_GVALS: u32 = 3;
pub const OFF_UCIV: u32 = 4;
pub const OFF_URACE: u32 = 5;
pub const OFF_UID: u32 = 6;
pub const OFF_UCELL: u32 = 7;
pub const OFF_GIDS: u32 = 8;
pub const OFF_CELL_START: u32 = 9;
pub const OFF_CELL_ITEMS: u32 = 10;
pub const OFF_RACE_FLAGS: u32 = 11;
pub const OFF_DYN_PARENT: u32 = 12;
pub const OFF_ATWAR: u32 = 13;
pub const OFF_UDEAD: u32 = 14;
pub const OFF_UHASPANIC: u32 = 15;
pub const OFF_RESULT: u32 = 16;
pub const OFF_CELL_CURSOR: u32 = 17;
// Stage 2 单位列
pub const OFF_UTX: u32 = 18;
pub const OFF_UTY: u32 = 19;
pub const OFF_UHP: u32 = 20;
pub const OFF_UMAXHP: u32 = 21;
pub const OFF_UDMG: u32 = 22;
pub const OFF_USPEED: u32 = 23;
pub const OFF_UAGE: u32 = 24;
pub const OFF_UMAXAGE: u32 = 25;
pub const OFF_UKILLS: u32 = 26;
pub const OFF_UCD: u32 = 27;
pub const OFF_UFD: u32 = 28;
pub const OFF_UBREATH: u32 = 29;
pub const OFF_ULX: u32 = 30;
pub const OFF_ULY: u32 = 31;
pub const OFF_USXK: u32 = 32;
pub const OFF_USYK: u32 = 33;
pub const OFF_USTK: u32 = 34;
pub const OFF_UATK: u32 = 35;
pub const OFF_UCHILL: u32 = 36;
pub const OFF_UFLEET: u32 = 37;
pub const OFF_UBLESS: u32 = 38;
pub const OFF_UCURSE: u32 = 39;
pub const OFF_UFERT: u32 = 40;
pub const OFF_UDETOUR: u32 = 41;
pub const OFF_UHURT: u32 = 42;
pub const OFF_UJOB: u32 = 43;
pub const OFF_UTRAIT: u32 = 44;
pub const OFF_UINF: u32 = 45;
pub const OFF_UFLIP: u32 = 46;
pub const OFF_UPAR: u32 = 47;
pub const OFF_UBOAT: u32 = 48;
pub const OFF_UBTL: u32 = 49;
pub const OFF_UCVN: u32 = 50;
pub const OFF_UARMY: u32 = 51;
pub const OFF_UGEAR: u32 = 52; // i32 × 7/单位（wep arm hlm shd bts rng amu，-1 无）
pub const OFF_UGENE: u32 = 53; // f64 × 4/单位
pub const OFF_UFAM: u32 = 54;
pub const OFF_UFGN: u32 = 55;
pub const OFF_UNAME: u32 = 56; // u8 × 32/单位
pub const OFF_UGLN: u32 = 57;
pub const OFF_UGIDS: u32 = 58; // i32 × 8/单位
pub const OFF_UGVAL: u32 = 59; // f64 × 8/单位
// 世界网格
pub const OFF_TERR: u32 = 60;
pub const OFF_FIREG: u32 = 61;
pub const OFF_RAD: u32 = 62;
pub const OFF_ROAD: u32 = 63;
pub const OFF_BLDK: u32 = 64;
pub const OFF_OWN: u32 = 65;
pub const OFF_BIDX: u32 = 66; // i32 × TILES（tile→building 行号，-1；pack 后 Rust 重建）
// 文明
pub const OFF_CIVN: u32 = 67;
pub const OFF_CVPOP: u32 = 68;
pub const OFF_CVHOU: u32 = 69;
pub const OFF_CVGLD: u32 = 70;
pub const OFF_CVCAP: u32 = 71;
pub const OFF_CVAL: u32 = 72;
pub const OFF_CVGOV: u32 = 73;
pub const OFF_CVTECH: u32 = 74; // f64 × 24/civ
pub const OFF_CVDIR: u32 = 75; // bit0 populate
pub const OFF_CVPC: u32 = 76; // popCapOf 预算
pub const OFF_CVMKT: u32 = 77; // marketIdx
// 家族
pub const OFF_FAMN: u32 = 78;
pub const OFF_FMID: u32 = 79;
pub const OFF_FMRACE: u32 = 80;
pub const OFF_FMNUM: u32 = 81; // f64 × 5（members kills peak milestones founded）
pub const OFF_FMSEQ: u32 = 82;
pub const OFF_FMNAME: u32 = 83; // u16 × 2（pre/post 词表索引）
// 建筑
pub const OFF_BLDN: u32 = 84;
pub const OFF_BLDI: u32 = 85;
pub const OFF_BLDXY: u32 = 86; // i32 × 2
pub const OFF_BLDC: u32 = 87;
pub const OFF_BLDHP: u32 = 88;
pub const OFF_BLDDMG: u32 = 89;
// 物品
pub const OFF_ITMN: u32 = 90;
pub const OFF_ITMK: u32 = 91;
pub const OFF_ITMXY: u32 = 92; // f64 × 2
// 神经
pub const OFF_NEUW: u32 = 93; // f64 × 2048（ACC@0 STANCE@256 FBC@576 FRL@768）
pub const OFF_NCTL: u32 = 94; // bit0 enabled; bits1-2 flightMode(0=bc 1=rl)
// 标量
pub const OFF_RNGS: u32 = 95;
pub const OFF_TICK: u32 = 96;
pub const OFF_FRAME: u32 = 97;
pub const OFF_PAR: u32 = 98;
pub const OFF_USEQ: u32 = 99;
pub const OFF_EPS: u32 = 100; // f64 × 16
pub const OFF_LAWS: u32 = 101;
pub const OFF_FXP: u32 = 102;
pub const OFF_FXLEN: u32 = 103;
pub const OFF_FXMIN: u32 = 104; // i32 × 1600（有序次要特效索引）
pub const OFF_FXMINN: u32 = 105;
pub const OFF_WILD: u32 = 106;
pub const OFF_GRASS: u32 = 107;
pub const OFF_DAYPH: u32 = 108;
pub const OFF_REPRM: u32 = 109;
pub const OFF_PREY: u32 = 110; // u16 × 640
pub const OFF_SPB: u32 = 111; // f64 × 4/race
pub const OFF_SPBH: u32 = 112;
pub const OFF_TRN: u32 = 113;
pub const OFF_TRDMG: u32 = 114;
pub const OFF_TRHP: u32 = 115;
pub const OFF_TRSPD: u32 = 116;
pub const OFF_TRREG: u32 = 117;
pub const OFF_TRFL: u32 = 118; // bit0 giant bit1 tiny bit2 immune
pub const OFF_CNT: u32 = 119; // f64 × 16 计数器
// 动作 / bail / 脏行
pub const OFF_ACT: u32 = 120;
pub const OFF_ACTN: u32 = 121;
pub const OFF_BAILK: u32 = 122;
pub const OFF_BAILS: u32 = 123;
pub const OFF_BAILL: u32 = 124;
pub const OFF_BAILP: u32 = 125; // f64 × 8
pub const OFF_DIRTY: u32 = 126;
pub const OFF_DLIST: u32 = 127; // u32 × MAX_UNITS
pub const OFF_DLISTN: u32 = 128;
pub const OFF_BATCHR: u32 = 129; // u32 × 8
// 引导表（boot 时 TS 灌入；FIRST 名池 / 家族词表 / 物品 / 种族 / 职业 / 地形掩码）
pub const OFF_TBR: u32 = 130; // f64 × 12/race
pub const OFF_TBF: u32 = 131; // u8 × 2/race（flags2）
pub const OFF_TBJ: u32 = 132; // f64 × 5/job
pub const OFF_TBI: u32 = 133; // f64 × 12/itemdef
pub const OFF_TBIN: u32 = 134;
pub const OFF_FRSTOFF: u32 = 135;
pub const OFF_FRSTN: u32 = 136;
pub const OFF_FRSTP: u32 = 137; // u8 × 16384 名字字节池
pub const OFF_FAMP: u32 = 138; // u8 × 1024（pre[i]@i*24 post[i]@384+i*24）
pub const OFF_TBT: u32 = 139; // u8 × 16（地形掩码：[t]=bit0 walkable bit1 water bit2 flammable bit3 buildable）
pub const OFF_MLOOT: u32 = 140;
pub const OFF_NEUCALL: u32 = 141; // u32 × 3
pub const OFF_COLEN: u32 = 142; // 采集器开关
pub const OFF_DMGL: u32 = 143; // i32 × 1024 damagedSet 有序镜像
pub const OFF_DMGN: u32 = 144;
pub const OFF_FIREN: u32 = 145; // fireSet 计数
pub const OFF_WILDCAP: u32 = 146; // u32/race
pub const OFF_MONCAP: u32 = 147; // u32/race（巨怪上限）
pub const OFF_MISC: u32 = 148; // i32 × 8（[0]MAX_UNITS [1]MAX_WILDLIFE）
pub const OFF_TBHP: u32 = 149; // f64 × 16（BUILDING_DEFS hp/kind 索引）
pub const OFF_GUNBM: u32 = 150; // u32 × 4（物品 gun 位图 128 位）
pub const OFF_BEAMBM: u32 = 151; // u32 × 4（物品 beam 位图）

pub const N_REGIONS: usize = 154; // 152/153 预留（调试区已移除）

// ---------------- 状态 ----------------
pub struct State {
    pub bw: u32,
    pub bh: u32,
    pub cells: u32,
    pub n: u32,
    pub arena: Vec<u8>,
    pub offs: [u32; N_REGIONS],
    pub inited: bool,
    // 批处理瞬态
    pub live_len: u32, // 批内活长度（含 Rust 追加）
    pub pack_len: u32, // 本次 pack 时的 n（TS 数组长度）
}

static mut STATE: Option<State> = None;

#[inline]
pub fn state() -> &'static mut State {
    unsafe {
        let ptr = &raw mut STATE;
        (*ptr).as_mut().expect("wbcore: init first")
    }
}

// ---------------- arena 视图帮助（Stage 1 兼容 + 泛化） ----------------
#[inline(always)]
pub fn off_of(id: u32) -> usize {
    let st = state();
    st.offs[id as usize] as usize
}
#[inline(always)]
pub fn u64_at(id: u32, idx: usize) -> u64 {
    let off = off_of(id);
    unsafe { let p = state().arena.as_ptr().add(off + idx * 8) as *const u64; p.read_unaligned() }
}
#[inline(always)]
pub fn set_u64_at(id: u32, idx: usize, v: u64) {
    let off = off_of(id);
    unsafe { let p = state().arena.as_mut_ptr().add(off + idx * 8) as *mut u64; p.write_unaligned(v); }
}
#[inline(always)]
pub fn u32_at(id: u32, idx: usize) -> u32 {
    let off = off_of(id);
    unsafe { let p = state().arena.as_ptr().add(off + idx * 4) as *const u32; p.read_unaligned() }
}
#[inline(always)]
pub fn set_u32_at(id: u32, idx: usize, v: u32) {
    let off = off_of(id);
    unsafe { let p = state().arena.as_mut_ptr().add(off + idx * 4) as *mut u32; p.write_unaligned(v); }
}
#[inline(always)]
pub fn i32_at(id: u32, idx: usize) -> i32 {
    u32_at(id, idx) as i32
}
#[inline(always)]
pub fn set_i32_at(id: u32, idx: usize, v: i32) {
    set_u32_at(id, idx, v as u32)
}
#[inline(always)]
pub fn u16_at(id: u32, idx: usize) -> u16 {
    let off = off_of(id);
    unsafe { let p = state().arena.as_ptr().add(off + idx * 2) as *const u16; p.read_unaligned() }
}
#[inline(always)]
pub fn set_u16_at(id: u32, idx: usize, v: u16) {
    let off = off_of(id);
    unsafe { let p = state().arena.as_mut_ptr().add(off + idx * 2) as *mut u16; p.write_unaligned(v); }
}
#[inline(always)]
pub fn u8_at(id: u32, idx: usize) -> u8 {
    state().arena[off_of(id) + idx]
}
#[inline(always)]
pub fn set_u8_at(id: u32, idx: usize, v: u8) {
    let off = off_of(id);
    state().arena[off + idx] = v;
}
#[inline(always)]
pub fn f64_at(id: u32, idx: usize) -> f64 {
    f64::from_bits(u64_at(id, idx))
}
#[inline(always)]
pub fn set_f64_at(id: u32, idx: usize, v: f64) {
    set_u64_at(id, idx, v.to_bits());
}
#[inline(always)]
pub fn i16_at(id: u32, idx: usize) -> i16 {
    u16_at(id, idx) as i16
}

// ---------------- 敌意判定（Stage 1 原样，改为新访问器） ----------------
pub fn is_herbivore(mut r: u32) -> bool {
    for _ in 0..32 {
        if u8_at(OFF_RACE_FLAGS, r as usize) & F_HERBIVORE != 0 {
            return true;
        }
        let p = i32_at(OFF_DYN_PARENT, r as usize);
        if p < 0 {
            return false;
        }
        r = p as u32;
    }
    false
}

pub fn is_enemy_full(a: usize, b: usize) -> bool {
    let ra = u32_at(OFF_URACE, a) as usize;
    let rb = u32_at(OFF_URACE, b) as usize;
    let fa = u8_at(OFF_RACE_FLAGS, ra);
    let fb = u8_at(OFF_RACE_FLAGS, rb);
    if fa & F_UNDEAD != 0 && fb & F_UNDEAD != 0 {
        return false;
    }
    if ra == R_ZOMBIE || rb == R_ZOMBIE {
        return ra != rb;
    }
    if ra == R_SKELETON || rb == R_SKELETON {
        return ra != rb;
    }
    if ra == R_WHITEWALKER || rb == R_WHITEWALKER {
        return ra != rb;
    }
    if ra == R_DRAGON || rb == R_DRAGON {
        return ra != rb;
    }
    if ra == R_DEMON || rb == R_DEMON {
        return ra != rb;
    }
    if ra == R_KRAKEN || rb == R_KRAKEN {
        return ra != rb;
    }
    if ra == R_SANDWORM || rb == R_SANDWORM {
        return ra != rb;
    }
    if ra == R_BASILISK || rb == R_BASILISK {
        return ra != rb;
    }
    if fa & F_HOSTILE != 0 && fb & F_CIV != 0 {
        return true;
    }
    if fb & F_HOSTILE != 0 && fa & F_CIV != 0 {
        return true;
    }
    if fa & F_PREDATOR != 0 && is_herbivore(rb as u32) {
        return true;
    }
    if fa & F_PREDATOR != 0 && ra == R_BEAR && fb & F_CIV != 0 {
        return true;
    }
    if ra == R_SCORPION && is_herbivore(rb as u32) {
        return true;
    }
    if ra == R_SNAKE && (is_herbivore(rb as u32) || rb == R_SCORPION) {
        return true;
    }
    let ca = i32_at(OFF_UCIV, a);
    let cb = i32_at(OFF_UCIV, b);
    if ca >= 0 && cb >= 0 && ca != cb {
        return u8_at(OFF_ATWAR, (ca as usize) * MAX_CIVS + cb as usize) != 0;
    }
    false
}

pub fn is_enemy_slot(a: usize, b: usize) -> bool {
    if i32_at(OFF_UCIV, a) < 0 && i32_at(OFF_UCIV, b) < 0 {
        let ra = u32_at(OFF_URACE, a) as usize;
        let rb = u32_at(OFF_URACE, b) as usize;
        let key = ra * MAX_RACES + rb;
        match lut_get(key) {
            1 => false,
            2 => true,
            _ => {
                let r = is_enemy_full(a, b);
                lut_set(key, if r { 2 } else { 1 });
                r
            }
        }
    } else {
        is_enemy_full(a, b)
    }
}

static mut LUT_OFF: usize = 0;

fn lut_get(key: usize) -> u8 {
    unsafe {
        let p = &raw const LUT_OFF;
        state().arena[*p + key]
    }
}
fn lut_set(key: usize, v: u8) {
    unsafe {
        let p = &raw mut LUT_OFF;
        let off = *p;
        state().arena[off + key] = v;
    }
}

// ---------------- 导出 ABI ----------------

#[no_mangle]
pub extern "C" fn wb_version() -> u32 {
    2
}

#[no_mangle]
pub extern "C" fn wb_init(bw: u32, bh: u32, max_units: u32) -> u32 {
    if bw == 0 || bh == 0 || bw > 4096 || bh > 4096 || max_units == 0 || max_units as usize > MAX_UNITS {
        return 0;
    }
    let cells = bw as usize * bh as usize;
    let nu = MAX_UNITS;
    let mut off = 0usize;
    let mut offs = [0u32; N_REGIONS];
    macro_rules! place {
        ($id:expr, $bytes:expr) => {{
            offs[$id as usize] = off as u32;
            off += $bytes;
        }};
    }
    // —— 8 字节对齐辅助 ——
    macro_rules! align8 {
        () => {{
            off = (off + 7) & !7;
        }};
    }
    // Stage 1
    align8!();
    place!(OFF_UX, nu * 8);
    place!(OFF_UY, nu * 8);
    place!(OFF_UPANIC, nu * 8);
    place!(OFF_GVALS, GRUDGE_CAP * 8);
    place!(OFF_UCIV, nu * 4);
    place!(OFF_URACE, nu * 4);
    place!(OFF_UID, nu * 4);
    place!(OFF_UCELL, nu * 4);
    place!(OFF_GIDS, GRUDGE_CAP * 4);
    place!(OFF_CELL_START, (cells + 1) * 4);
    place!(OFF_CELL_ITEMS, nu * 4);
    place!(OFF_RACE_FLAGS, MAX_RACES);
    let lut_off = (off + 7) & !7;
    unsafe {
        let p = &raw mut LUT_OFF;
        *p = lut_off;
    }
    off = lut_off + MAX_RACES * MAX_RACES;
    place!(OFF_DYN_PARENT, MAX_RACES * 4);
    place!(OFF_ATWAR, MAX_CIVS * MAX_CIVS);
    place!(OFF_UDEAD, nu);
    place!(OFF_UHASPANIC, nu);
    align8!();
    let res_off = off;
    offs[OFF_RESULT as usize] = res_off as u32;
    off += RESULT_BYTES;
    place!(OFF_CELL_CURSOR, (cells + 1) * 4);
    // Stage 2 单位列
    align8!();
    align8!();
    place!(OFF_UTX, nu * 8);
    align8!();
    place!(OFF_UTY, nu * 8);
    align8!();
    place!(OFF_UHP, nu * 8);
    align8!();
    place!(OFF_UMAXHP, nu * 8);
    align8!();
    place!(OFF_UDMG, nu * 8);
    align8!();
    place!(OFF_USPEED, nu * 8);
    align8!();
    place!(OFF_UAGE, nu * 8);
    align8!();
    place!(OFF_UMAXAGE, nu * 8);
    align8!();
    place!(OFF_UKILLS, nu * 8);
    align8!();
    place!(OFF_UCD, nu * 8);
    align8!();
    place!(OFF_UFD, nu * 8);
    align8!();
    place!(OFF_UBREATH, nu * 8);
    align8!();
    place!(OFF_ULX, nu * 8);
    align8!();
    place!(OFF_ULY, nu * 8);
    align8!();
    place!(OFF_USXK, nu * 8);
    align8!();
    place!(OFF_USYK, nu * 8);
    align8!();
    place!(OFF_USTK, nu * 4);
    align8!();
    place!(OFF_UATK, nu * 8);
    align8!();
    place!(OFF_UCHILL, nu * 8);
    align8!();
    place!(OFF_UFLEET, nu * 8);
    align8!();
    place!(OFF_UBLESS, nu * 8);
    align8!();
    place!(OFF_UCURSE, nu * 8);
    align8!();
    place!(OFF_UFERT, nu * 8);
    align8!();
    place!(OFF_UDETOUR, nu * 8);
    align8!();
    place!(OFF_UHURT, nu * 8);
    align8!();
    place!(OFF_UJOB, nu * 4);
    align8!();
    place!(OFF_UTRAIT, nu * 4);
    align8!();
    place!(OFF_UINF, nu);
    align8!();
    place!(OFF_UFLIP, nu);
    align8!();
    place!(OFF_UPAR, nu);
    align8!();
    place!(OFF_UBOAT, nu);
    align8!();
    place!(OFF_UBTL, nu * 4);
    align8!();
    place!(OFF_UCVN, nu * 4);
    align8!();
    place!(OFF_UARMY, nu * 4);
    align8!();
    place!(OFF_UGEAR, nu * 7 * 4);
    align8!();
    place!(OFF_UGENE, nu * 4 * 8);
    align8!();
    place!(OFF_UFAM, nu * 4);
    align8!();
    place!(OFF_UFGN, nu * 4);
    align8!();
    place!(OFF_UNAME, nu * 32);
    align8!();
    place!(OFF_UGLN, nu * 4);
    align8!();
    place!(OFF_UGIDS, nu * UG_CAP * 4);
    align8!();
    place!(OFF_UGVAL, nu * UG_CAP * 8);
    // 世界网格
    align8!();
    place!(OFF_TERR, TILES);
    align8!();
    place!(OFF_FIREG, TILES);
    align8!();
    place!(OFF_RAD, TILES);
    align8!();
    place!(OFF_ROAD, TILES);
    align8!();
    place!(OFF_BLDK, TILES);
    align8!();
    align8!();
    place!(OFF_OWN, TILES * 2);
    align8!();
    place!(OFF_BIDX, TILES * 4);
    // 文明
    align8!();
    place!(OFF_CIVN, 4);
    align8!();
    place!(OFF_CVPOP, MAX_CIVS * 8);
    align8!();
    place!(OFF_CVHOU, MAX_CIVS * 8);
    align8!();
    place!(OFF_CVGLD, MAX_CIVS * 8);
    align8!();
    place!(OFF_CVCAP, MAX_CIVS * 4);
    align8!();
    place!(OFF_CVAL, MAX_CIVS);
    align8!();
    place!(OFF_CVGOV, MAX_CIVS * 4);
    align8!();
    place!(OFF_CVTECH, MAX_CIVS * 24 * 8);
    align8!();
    place!(OFF_CVDIR, MAX_CIVS);
    align8!();
    place!(OFF_CVPC, MAX_CIVS * 8);
    align8!();
    place!(OFF_CVMKT, MAX_CIVS * 4);
    // 家族
    align8!();
    place!(OFF_FAMN, 4);
    align8!();
    place!(OFF_FMID, MAX_FAM * 4);
    align8!();
    place!(OFF_FMRACE, MAX_FAM * 4);
    align8!();
    place!(OFF_FMNUM, MAX_FAM * 6 * 8);
    align8!();
    place!(OFF_FMSEQ, 4);
    align8!();
    place!(OFF_FMNAME, MAX_FAM * 2 * 2);
    // 建筑
    align8!();
    place!(OFF_BLDN, 4);
    align8!();
    place!(OFF_BLDI, MAX_BLD * 4);
    align8!();
    place!(OFF_BLDXY, MAX_BLD * 2 * 4);
    align8!();
    place!(OFF_BLDC, MAX_BLD * 4);
    align8!();
    place!(OFF_BLDHP, MAX_BLD * 8);
    align8!();
    place!(OFF_BLDDMG, MAX_BLD);
    // 物品
    align8!();
    place!(OFF_ITMN, 4);
    align8!();
    place!(OFF_ITMK, MAX_ITEMS * 4);
    align8!();
    place!(OFF_ITMXY, MAX_ITEMS * 2 * 8);
    // 神经
    align8!();
    place!(OFF_NEUW, 2048 * 8);
    align8!();
    place!(OFF_NCTL, 1);
    // 标量
    align8!();
    place!(OFF_RNGS, 4);
    align8!();
    place!(OFF_TICK, 4);
    align8!();
    place!(OFF_FRAME, 4);
    align8!();
    place!(OFF_PAR, 1);
    align8!();
    place!(OFF_USEQ, 4);
    align8!();
    place!(OFF_EPS, 16 * 8);
    align8!();
    place!(OFF_LAWS, 1);
    align8!();
    place!(OFF_FXP, 1);
    align8!();
    place!(OFF_FXLEN, 4);
    align8!();
    place!(OFF_FXMIN, FXMIN_CAP * 4);
    align8!();
    place!(OFF_FXMINN, 4);
    align8!();
    place!(OFF_WILD, MAX_RACES * 4);
    align8!();
    place!(OFF_GRASS, 8);
    align8!();
    place!(OFF_DAYPH, 8);
    align8!();
    place!(OFF_REPRM, 8);
    align8!();
    place!(OFF_PREY, 640 * 2);
    align8!();
    place!(OFF_SPB, MAX_RACES * 4 * 8);
    align8!();
    place!(OFF_SPBH, MAX_RACES);
    align8!();
    place!(OFF_TRN, 4);
    align8!();
    place!(OFF_TRDMG, MAX_TRAITS * 8);
    align8!();
    place!(OFF_TRHP, MAX_TRAITS * 8);
    align8!();
    place!(OFF_TRSPD, MAX_TRAITS * 8);
    align8!();
    place!(OFF_TRREG, MAX_TRAITS * 8);
    align8!();
    place!(OFF_TRFL, MAX_TRAITS);
    align8!();
    place!(OFF_CNT, 16 * 8);
    // 动作 / bail / 脏行
    align8!();
    place!(OFF_ACT, ACT_CAP);
    align8!();
    place!(OFF_ACTN, 4);
    align8!();
    place!(OFF_BAILK, 4);
    align8!();
    place!(OFF_BAILS, 4);
    align8!();
    place!(OFF_BAILL, 4);
    align8!();
    place!(OFF_BAILP, 8 * 8);
    align8!();
    place!(OFF_DIRTY, (MAX_UNITS + 7) / 8);
    align8!();
    place!(OFF_DLIST, MAX_UNITS * 4);
    align8!();
    place!(OFF_DLISTN, 4);
    align8!();
    place!(OFF_BATCHR, 8 * 4);
    // 引导表
    align8!();
    place!(OFF_TBR, MAX_RACES * 12 * 8);
    align8!();
    place!(OFF_TBF, MAX_RACES * 2);
    align8!();
    place!(OFF_TBJ, 7 * 5 * 8);
    align8!();
    place!(OFF_TBI, MAX_ITEMDEFS * 12 * 8);
    align8!();
    place!(OFF_TBIN, 4);
    align8!();
    place!(OFF_FRSTOFF, MAX_RACES * 4);
    align8!();
    place!(OFF_FRSTN, MAX_RACES * 4);
    align8!();
    place!(OFF_FRSTP, 16384);
    align8!();
    place!(OFF_FAMP, 1024);
    align8!();
    place!(OFF_TBT, 16);
    align8!();
    place!(OFF_MLOOT, MAX_RACES);
    align8!();
    place!(OFF_NEUCALL, 3 * 4);
    align8!();
    place!(OFF_COLEN, 1);
    align8!();
    place!(OFF_DMGL, MAX_BLD * 4);
    align8!();
    place!(OFF_DMGN, 4);
    align8!();
    place!(OFF_FIREN, 4);
    align8!();
    place!(OFF_WILDCAP, MAX_RACES * 4);
    align8!();
    place!(OFF_MONCAP, MAX_RACES * 4);
    align8!();
    place!(OFF_MISC, 32 * 4);
    align8!();
    place!(OFF_GUNBM, 4 * 4);
    align8!();
    place!(OFF_BEAMBM, 4 * 4);
    align8!();
    place!(OFF_TBHP, 16 * 8);

    let mut arena = vec![0u8; off];
    // dyn_parent 全 -1
    let dp = offs[OFF_DYN_PARENT as usize] as usize;
    unsafe {
        for i in 0..MAX_RACES {
            let p = arena.as_mut_ptr().add(dp + i * 4) as *mut i32;
            p.write_unaligned(-1);
        }
    }
    // BIDX 全 -1
    let bi = offs[OFF_BIDX as usize] as usize;
    unsafe {
        for i in 0..TILES {
            let p = arena.as_mut_ptr().add(bi + i * 4) as *mut i32;
            p.write_unaligned(-1);
        }
    }
    // UGEAR 全 -1（Rust 侧默认；pack 会覆盖）
    let ug = offs[OFF_UGEAR as usize] as usize;
    unsafe {
        for i in 0..nu * 7 {
            let p = arena.as_mut_ptr().add(ug + i * 4) as *mut i32;
            p.write_unaligned(-1);
        }
    }

    let st = State {
        bw,
        bh,
        cells: cells as u32,
        n: 0,
        arena,
        offs,
        inited: true,
        live_len: 0,
        pack_len: 0,
    };
    unsafe {
        let ptr = &raw mut STATE;
        *ptr = Some(st);
    }
    1
}

#[no_mangle]
pub extern "C" fn wb_reset() {
    let st = state();
    st.n = 0;
    let dp = st.offs[OFF_DYN_PARENT as usize] as usize;
    let lut;
    unsafe {
        for i in 0..MAX_RACES {
            let p = st.arena.as_mut_ptr().add(dp + i * 4) as *mut i32;
            p.write_unaligned(-1);
        }
        lut = *(&raw const LUT_OFF);
    }
    for i in 0..MAX_RACES * MAX_RACES {
        st.arena[lut + i] = 0;
    }
    let aw = st.offs[OFF_ATWAR as usize] as usize;
    for i in 0..MAX_CIVS * MAX_CIVS {
        st.arena[aw + i] = 0;
    }
    let cs = st.offs[OFF_CELL_START as usize] as usize;
    unsafe {
        for i in 0..(st.cells as usize + 1) {
            let p = st.arena.as_mut_ptr().add(cs + i * 4) as *mut u32;
            p.write_unaligned(0);
        }
    }
    // Stage 2：批处理相关区域清零（脏表/动作/家族/建筑等由 pack 重建）
    set_i32_at(OFF_ACTN, 0, 0);
    set_i32_at(OFF_DLISTN, 0, 0);
    set_i32_at(OFF_BAILK, 0, 0);
    set_u32_at(OFF_FAMN, 0, 0);
    set_u32_at(OFF_BLDN, 0, 0);
    set_u32_at(OFF_ITMN, 0, 0);
    set_u32_at(OFF_DMGN, 0, 0);
    set_u32_at(OFF_FIREN, 0, 0);
}

/// pack 完成（Stage 1 兼容）：构建 counting-sort 网格
#[no_mangle]
pub extern "C" fn wb_pack_end(n: u32) {
    let st = state();
    let n = (n as usize).min(MAX_UNITS);
    st.n = n as u32;
    st.pack_len = n as u32;
    st.live_len = n as u32;
    let cells = st.cells as usize;
    let cs = st.offs[OFF_CELL_START as usize] as usize;
    unsafe {
        for i in 0..=cells {
            let p = st.arena.as_mut_ptr().add(cs + i * 4) as *mut u32;
            p.write_unaligned(0);
        }
    }
    for s in 0..n {
        let c = u32_at(OFF_UCELL, s) as usize;
        if c >= cells {
            continue;
        }
        unsafe {
            let p = st.arena.as_mut_ptr().add(cs + c * 4) as *mut u32;
            let v = p.read_unaligned();
            p.write_unaligned(v + 1);
        }
    }
    let mut acc = 0u32;
    for i in 0..cells {
        unsafe {
            let p = st.arena.as_mut_ptr().add(cs + i * 4) as *mut u32;
            let v = p.read_unaligned();
            p.write_unaligned(acc);
            acc += v;
        }
    }
    unsafe {
        let p = st.arena.as_mut_ptr().add(cs + cells * 4) as *mut u32;
        p.write_unaligned(acc);
    }
    let cc = st.offs[OFF_CELL_CURSOR as usize] as usize;
    unsafe {
        let src = st.arena.as_ptr().add(cs) as *const u32;
        let dst = st.arena.as_mut_ptr().add(cc) as *mut u32;
        std::ptr::copy_nonoverlapping(src, dst, cells + 1);
    }
    let ci = st.offs[OFF_CELL_ITEMS as usize] as usize;
    for s in 0..n {
        let c = u32_at(OFF_UCELL, s) as usize;
        if c >= cells {
            continue;
        }
        unsafe {
            let p = st.arena.as_mut_ptr().add(cc + c * 4) as *mut u32;
            let dst = p.read_unaligned();
            p.write_unaligned(dst + 1);
            let q = st.arena.as_mut_ptr().add(ci + dst as usize * 4) as *mut u32;
            q.write_unaligned(s as u32);
        }
    }
    // Stage 2 pack 尾工：BIDX 重建（tile→建筑行号）
    let bn = i32_at(OFF_BLDN, 0).max(0) as usize;
    let bidx = st.offs[OFF_BIDX as usize] as usize;
    unsafe {
        for i in 0..TILES {
            let p = st.arena.as_mut_ptr().add(bidx + i * 4) as *mut i32;
            p.write_unaligned(-1);
        }
        for r in 0..bn.min(MAX_BLD) {
            let t = i32_at(OFF_BLDI, r);
            if t >= 0 && (t as usize) < TILES {
                let p = st.arena.as_mut_ptr().add(bidx + t as usize * 4) as *mut i32;
                p.write_unaligned(r as i32);
            }
        }
    }
    // 脏表 / 动作清零（新 tick 开始）
    set_i32_at(OFF_ACTN, 0, 0);
    set_i32_at(OFF_DLISTN, 0, 0);
    set_i32_at(OFF_BAILK, 0, 0);
    let dirty = st.offs[OFF_DIRTY as usize] as usize;
    for i in 0..(MAX_UNITS + 7) / 8 {
        st.arena[dirty + i] = 0;
    }
}

/// Stage 1 兼容：9 桶扫描（单单位模式——JS 回退路径使用）
#[no_mangle]
pub extern "C" fn wb_scan(slot: u32, cx: i32, cy: i32, contagious: u32, g_len: i32) -> u32 {
    let st = state();
    let s = slot as usize;
    if s >= st.n as usize {
        return 0;
    }
    let bw = st.bw as i32;
    let bh = st.bh as i32;

    let uxx = f64_at(OFF_UX, s);
    let uyy = f64_at(OFF_UY, s);
    let u_civ = i32_at(OFF_UCIV, s);
    let u_race = u32_at(OFF_URACE, s);
    let u_has_panic = u8_at(OFF_UHASPANIC, s);
    let u_panic = f64_at(OFF_UPANIC, s);
    let upanic0 = if u_has_panic != 0 { u_panic } else { 0.0 };
    let has_g = g_len >= 0;
    let gn = if g_len > 0 { g_len as usize } else { 0 };

    let mut enemy: i32 = -1;
    let mut best_d = 7f64;
    let mut enemy_d = 7f64;
    let mut allies = 0u32;
    let mut foes = 0u32;
    let mut panic_n = 0u32;
    let mut overflow = 0i32;
    let mut panic_slots = [0u32; PANIC_CAP];
    let mut panic_vals = [0f64; PANIC_CAP];

    let cs = st.offs[OFF_CELL_START as usize] as usize;
    let ci = st.offs[OFF_CELL_ITEMS as usize] as usize;

    let mut by = cy - 1;
    while by <= cy + 1 {
        if by < 0 || by >= bh {
            by += 1;
            continue;
        }
        let mut bx = cx - 1;
        while bx <= cx + 1 {
            if bx < 0 || bx >= bw {
                bx += 1;
                continue;
            }
            let cell = (by * bw + bx) as usize;
            let (start, end) = unsafe {
                let p1 = st.arena.as_ptr().add(cs + cell * 4) as *const u32;
                let p2 = st.arena.as_ptr().add(cs + (cell + 1) * 4) as *const u32;
                (p1.read_unaligned(), p2.read_unaligned())
            };
            let mut k = start;
            while k < end {
                let o = unsafe {
                    let p = st.arena.as_ptr().add(ci + k as usize * 4) as *const u32;
                    p.read_unaligned()
                } as usize;
                k += 1;
                if u8_at(OFF_UDEAD, o) != 0 || o == s {
                    continue;
                }
                let ddx = f64_at(OFF_UX, o) - uxx;
                let ddy = f64_at(OFF_UY, o) - uyy;
                if is_enemy_slot(s, o) {
                    foes += 1;
                    let d2 = ddx * ddx + ddy * ddy;
                    if !has_g && d2 >= best_d * best_d {
                        continue;
                    }
                    let d = d2.sqrt();
                    let mut wd = d;
                    if has_g {
                        let oid = u32_at(OFF_UID, o);
                        let mut gi: i32 = -1;
                        for t in 0..gn {
                            if i32_at(OFF_GIDS, t) as u32 == oid {
                                gi = t as i32;
                                break;
                            }
                        }
                        if gi >= 0 {
                            let gv = f64_at(OFF_GVALS, gi as usize);
                            wd = d * (1.0 - 0.42 * jsmath::js_min(1.0, gv / 2.0));
                        }
                    }
                    if wd < best_d {
                        best_d = wd;
                        enemy = o as i32;
                        enemy_d = d;
                    }
                } else if if u_civ >= 0 {
                    i32_at(OFF_UCIV, o) == u_civ
                } else {
                    u32_at(OFF_URACE, o) == u_race
                } {
                    allies += 1;
                    if contagious != 0 {
                        let o_has = u8_at(OFF_UHASPANIC, o);
                        let o_panic = if o_has != 0 { f64_at(OFF_UPANIC, o) } else { 0.0 };
                        if o_panic < upanic0 - 0.15 && ddx * ddx + ddy * ddy < 16.0 {
                            let np = jsmath::js_min(1.0, o_panic + upanic0 * 0.4);
                            set_u8_at(OFF_UHASPANIC, o, 1);
                            set_f64_at(OFF_UPANIC, o, np);
                            if (panic_n as usize) < PANIC_CAP {
                                panic_slots[panic_n as usize] = o as u32;
                                panic_vals[panic_n as usize] = np;
                                panic_n += 1;
                            } else {
                                overflow = 1;
                            }
                        }
                    }
                }
            }
            bx += 1;
        }
        by += 1;
    }

    let ro = st.offs[OFF_RESULT as usize] as usize;
    unsafe {
        let rp = st.arena.as_mut_ptr().add(ro) as *mut ScanResult;
        (*rp).enemy_slot = enemy;
        (*rp).overflow = overflow;
        (*rp).best_d = best_d;
        (*rp).enemy_d = enemy_d;
        (*rp).allies = allies;
        (*rp).foes = foes;
        (*rp).panic_n = panic_n;
        (*rp)._pad = 0;
        (*rp).panic_slots = panic_slots;
        (*rp).panic_vals = panic_vals;
    }
    if overflow != 0 {
        return 2;
    }
    1
}

// ---------------- 变异同步（Stage 1 兼容，TS 在变异点调用） ----------------

#[no_mangle]
pub extern "C" fn wb_sync_pos(slot: u32, x: f64, y: f64) {
    let st = state();
    if slot as usize >= st.n as usize {
        return;
    }
    set_f64_at(OFF_UX, slot as usize, x);
    set_f64_at(OFF_UY, slot as usize, y);
}

#[no_mangle]
pub extern "C" fn wb_sync_dead(slot: u32, dead: u32) {
    let st = state();
    if slot as usize >= st.n as usize {
        return;
    }
    set_u8_at(OFF_UDEAD, slot as usize, dead as u8);
}

#[no_mangle]
pub extern "C" fn wb_sync_panic(slot: u32, has: u32, val: f64) {
    let st = state();
    if slot as usize >= st.n as usize {
        return;
    }
    set_u8_at(OFF_UHASPANIC, slot as usize, has as u8);
    set_f64_at(OFF_UPANIC, slot as usize, val);
}

#[no_mangle]
pub extern "C" fn wb_sync_full(slot: u32, id: u32, x: f64, y: f64, civ: i32, race: u32, dead: u32, has_panic: u32, panic: f64) {
    let st = state();
    if slot as usize >= st.n as usize {
        return;
    }
    let s = slot as usize;
    set_u32_at(OFF_UID, s, id);
    set_f64_at(OFF_UX, s, x);
    set_f64_at(OFF_UY, s, y);
    set_i32_at(OFF_UCIV, s, civ);
    set_u32_at(OFF_URACE, s, race);
    set_u8_at(OFF_UDEAD, s, dead as u8);
    set_u8_at(OFF_UHASPANIC, s, has_panic as u8);
    set_f64_at(OFF_UPANIC, s, panic);
}

#[no_mangle]
pub extern "C" fn wb_off(id: u32) -> u32 {
    let st = state();
    st.offs[id as usize]
}

#[no_mangle]
pub extern "C" fn wb_arena_ptr() -> *const u8 {
    let st = state();
    st.arena.as_ptr()
}

#[no_mangle]
pub extern "C" fn wb_max_units() -> u32 {
    MAX_UNITS as u32
}
