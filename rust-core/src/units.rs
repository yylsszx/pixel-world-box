// ============ units.rs — unitsTick 批处理内核（Stage 2 主体） ============
// updateUnit / moveUnit / spawnUnit / updateBoat / 战斗树 / 职业 AI / 繁衍 / 拾取
// 的位精确移植。行号注释对应 engine.ts。
//
// 返回码：wb_units_batch → 1 完成 / 2 bail（见 BAIL 区）/ 3 动作溢出（TS 接管剩余）

#![allow(clippy::too_many_arguments)]
use crate::*;
use crate::jsmath::*;

// ---------------- 动作 opcode ----------------
pub const ACT_FX: u8 = 1;
pub const ACT_FX_EVICT: u8 = 2;
pub const ACT_SND: u8 = 3;
pub const ACT_EVT: u8 = 4;
pub const ACT_TOAST: u8 = 5;
pub const ACT_TERRAIN: u8 = 6;
pub const ACT_IGNITE: u8 = 7;
pub const ACT_FIRE_CLEAR: u8 = 8;
pub const ACT_BHP: u8 = 9;
pub const ACT_DMG_ADD: u8 = 10;
pub const ACT_DMG_DEL: u8 = 11;
pub const ACT_CIV: u8 = 12;
pub const ACT_SPAWN: u8 = 13;
pub const ACT_FAM_NEW: u8 = 14;
pub const ACT_FAM_MILE: u8 = 15;
pub const ACT_FAM_ONKILL: u8 = 16;
pub const ACT_BATTLE: u8 = 17;
pub const ACT_WARKILL: u8 = 18;
pub const ACT_ITEM_DEL: u8 = 19;
pub const ACT_CNT: u8 = 20;
pub const ACT_TELEM: u8 = 21;
pub const ACT_CORPSE: u8 = 22;
pub const ACT_BLOOD: u8 = 23;

// fx kind 注册表（TS 桥接侧同表）
pub const FX_BLESS: u8 = 1;
pub const FX_CURSE: u8 = 2;
pub const FX_WATER: u8 = 3;
pub const FX_HAMMER: u8 = 4;
pub const FX_HIT: u8 = 5;
pub const FX_SPAWN: u8 = 6;
pub const FX_SKULL: u8 = 7;
pub const FX_EXPLOSION: u8 = 8;
pub const FX_BLOOD: u8 = 9;
pub const FX_DMG: u8 = 10;
pub const FX_HEART: u8 = 11;
pub const FX_COIN: u8 = 12;
pub const FX_DUST: u8 = 13;
pub const FX_TSUNAMI: u8 = 14;
pub const FX_FIREBALL: u8 = 15;
pub const FX_ARROW: u8 = 16;
pub const FX_BULLET: u8 = 17;
pub const FX_LASER: u8 = 18;

#[inline(always)]
fn fx_is_minor(kind: u8) -> bool {
    matches!(kind, FX_HIT | FX_SPAWN | FX_HEART | FX_SKULL | FX_ARROW | FX_COIN | FX_BLOOD | FX_DUST | FX_BULLET | FX_DMG)
}

// textOp 注册（fx 'dmg' 文案）
pub const TXT_NONE: u8 = 0;
pub const TXT_DEVOUR: u8 = 1;   // 吞噬
pub const TXT_PETRIFY: u8 = 2;  // 石化
pub const TXT_POISON: u8 = 3;   // 毒
pub const TXT_MISS: u8 = 4;     // 闪
pub const TXT_NUM: u8 = 5;      // (暴)-N（f0=dmg, f1=crit?1:0）
pub const TXT_ITEM: u8 = 6;     // 物品名（arg=itemDefId）

// EVT kind 注册
pub const EVT_SHIPWRECK: u8 = 1;
pub const EVT_PETRIFY: u8 = 2;
pub const EVT_REVENGE: u8 = 3;
pub const EVT_LEGEND: u8 = 4;
pub const EVT_LINEAGE_HERO: u8 = 5;
pub const EVT_LINEAGE_FLORISH: u8 = 6; // f0 = m
pub const EVT_FIREOUT: u8 = 7;
pub const EVT_REPAIR: u8 = 8;
pub const EVT_WAR_FLEET: u8 = 9; // f0 = fleet
pub const EVT_SKELETON: u8 = 10;

// SND kind 注册
pub const SND_PLACE: u8 = 1;
pub const SND_COIN: u8 = 2;

// TOAST kind 注册
pub const TOAST_KILLS10: u8 = 1;

// 遥测 kind
pub const TL_FLEE_END: u8 = 1;
pub const TL_DECISION: u8 = 2; // f[0..8]=特征 f9=act f10/f11=logp
pub const TL_ENEMY_GONE: u8 = 3;
pub const TL_KILL: u8 = 4; // f0 = enemyMaxHp

// bail kind
pub const BAIL_BOAT: u32 = 1;
pub const BAIL_EMERGENT: u32 = 2;
pub const BAIL_ATTACK_DEST: u32 = 3;
pub const BAIL_CARAVAN: u32 = 4;
pub const BAIL_BOAT_SETTLE: u32 = 5;
pub const BAIL_FXOVER: u32 = 6;

// ep 索引
const EP_REPRO: usize = 0;
const EP_FIRE_DMG: usize = 4;
const EP_MUT: usize = 8;
const EP_PANIC_DECAY: usize = 9;
const EP_PANIC_ROUT: usize = 10;
const EP_GRUDGE_DECAY: usize = 11;

// laws 位
const LAW_REPRO: u8 = 1;
const LAW_ZINFECT: u8 = 2;
const LAW_UNDEAD_RISE: u8 = 4;

// fxPrefs 位
const FXP_DMGNUM: u8 = 1;
const FXP_AMB: u8 = 2;
const FXP_BLOOD: u8 = 4;
const FXP_CORPSES: u8 = 8;

// tech 索引（CVTECH）
const TC_DMG: usize = 0;
const TC_HP: usize = 1;
const TC_BHP: usize = 2;
const TC_REPRO: usize = 5;
const TC_REPAIR: usize = 9;
const TC_ARCHER: usize = 13;
const TC_PLAGUE: usize = 14;
const TC_RANGE: usize = 15;
const TC_IDEA_REPRO: usize = 18;

// TBR 索引（种族表）
const RB_HP: usize = 0;
const RB_DMG: usize = 1;
const RB_SPEED: usize = 2;
const RB_MAXAGE: usize = 3;
const RB_REPRO: usize = 4;
const RB_REACH: usize = 5;
const RB_GROWTH: usize = 6;
const RB_RNG_RANGE: usize = 7;
const RB_RNG_DMG: usize = 8;
const RB_RNG_CD: usize = 9;
// TBF[1] 位
const RF2_LAVAIMM: u8 = 1;
const RF2_NIGHTSIGHT: u8 = 2;

// TBJ 索引（职业）
const JB_HP: usize = 0;
const JB_DMG: usize = 1;
const JB_SPD: usize = 2;
const JB_W: usize = 3;
const JB_RNG: usize = 4;

// TBI 索引（物品）
const IT_ARMOR: usize = 0;
const IT_CRIT: usize = 1;
const IT_LIFE: usize = 2;
const IT_THORNS: usize = 3;
const IT_REGEN: usize = 4;
const IT_RNG: usize = 5;
const IT_SPDMUL: usize = 6;
const IT_DMG: usize = 7;
const IT_HP: usize = 8;
const IT_RANK: usize = 9;
const IT_RARITY: usize = 10;
const IT_SLOT: usize = 11;

// TBT 位（地形掩码）
#[inline(always)]
fn t_walkable(t: u8) -> bool { u8_at(OFF_TBT, t as usize) & 1 != 0 }
#[inline(always)]
fn t_is_water(t: u8) -> bool { u8_at(OFF_TBT, t as usize) & 2 != 0 }
#[inline(always)]
fn t_flammable(t: u8) -> bool { u8_at(OFF_TBT, t as usize) & 4 != 0 }

// ---------------- 批处理上下文 ----------------
struct Ctx {
    act_cur: usize, // 动作游标
    overflow: bool,
    bw: i32,
    bh: i32,
    parity: u8,
}

// ---------------- 基础工具 ----------------
/// JS 真值语义（f64 列）：NaN(=undefined) 与 0 为 falsy
#[inline(always)]
fn truthy_f(v: f64) -> bool {
    v == v && v != 0.0
}
#[inline(always)]
fn idx(x: i32, y: i32) -> usize {
    (y * W + x) as usize
}
#[inline(always)]
fn tile_x(i: usize) -> i32 {
    (i % W as usize) as i32
}
#[inline(always)]
fn tile_y(i: usize) -> i32 {
    (i / W as usize) as i32
}

#[inline(always)]
fn rng_next() -> f64 {
    let mut a = u32_at(OFF_RNGS, 0);
    let v = mulberry32_next(&mut a);
    set_u32_at(OFF_RNGS, 0, a);
    v
}

#[inline(always)]
fn ep(i: usize) -> f64 {
    f64_at(OFF_EPS, i)
}

#[inline(always)]
fn race_flag(r: usize) -> u8 {
    u8_at(OFF_RACE_FLAGS, r)
}
#[inline(always)]
fn race_flag2(r: usize) -> u8 {
    u8_at(OFF_TBF, r * 2 + 1)
}
#[inline(always)]
fn is_civ(r: usize) -> bool { race_flag(r) & F_CIV != 0 }
#[inline(always)]
fn is_hostile(r: usize) -> bool { race_flag(r) & F_HOSTILE != 0 }
#[inline(always)]
fn is_undead(r: usize) -> bool { race_flag(r) & F_UNDEAD != 0 }
#[inline(always)]
fn is_predator(r: usize) -> bool { race_flag(r) & F_PREDATOR != 0 }

#[inline(always)]
fn dirty(slot: usize) {
    let bit = 1u8 << (slot & 7);
    let byte = slot >> 3;
    if u8_at(OFF_DIRTY, byte) & bit == 0 {
        set_u8_at(OFF_DIRTY, byte, u8_at(OFF_DIRTY, byte) | bit);
        let n = i32_at(OFF_DLISTN, 0);
        if (n as usize) < MAX_UNITS {
            set_u32_at(OFF_DLIST, n as usize, slot as u32);
            set_i32_at(OFF_DLISTN, 0, n + 1);
        }
    }
}

// ---------------- 动作发射 ----------------
impl Ctx {
    #[inline(always)]
    fn act_reserve(&mut self, bytes: usize) -> Option<usize> {
        let cur = self.act_cur;
        if cur + bytes > ACT_CAP {
            self.overflow = true;
            return None;
        }
        self.act_cur = cur + bytes;
        Some(cur)
    }
    #[inline(always)]
    fn act_u8(&mut self, pos: usize, v: u8) {
        set_u8_at(OFF_ACT, pos, v);
    }
    #[inline(always)]
    fn act_u32(&mut self, pos: usize, v: u32) {
        let off = off_of(OFF_ACT);
        unsafe {
            let p = state().arena.as_mut_ptr().add(off + pos) as *mut u32;
            p.write_unaligned(v);
        }
    }
    #[inline(always)]
    fn act_i32(&mut self, pos: usize, v: i32) {
        self.act_u32(pos, v as u32);
    }
    #[inline(always)]
    fn act_f64(&mut self, pos: usize, v: f64) {
        let off = off_of(OFF_ACT);
        unsafe {
            let p = state().arena.as_mut_ptr().add(off + pos) as *mut f64;
            p.write_unaligned(v);
        }
    }
}


#[allow(clippy::too_many_arguments)]
fn fx(ctx: &mut Ctx, kind: u8, x: f64, y: f64, ttl: f64, r: f64, x0: f64, y0: f64, dmg: f64, src_civ: i32, quiet: bool, text_op: u8, text_arg: u32, has_opts: bool) -> bool {
    fx_impl(ctx, kind, x, y, ttl, r, x0, y0, dmg, src_civ, quiet, text_op, text_arg, has_opts)
}

fn fx_impl(ctx: &mut Ctx, kind: u8, x: f64, y: f64, ttl: f64, r: f64, x0: f64, y0: f64, dmg: f64, src: i32, quiet: bool, text_op: u8, text_arg: u32, has_opts: bool) -> bool {
    let density = u8_at(OFF_FXP, 0) >> 4;
    let cap: i32 = match density {
        0 => 260,
        2 => 1500,
        _ => 620,
    };
    let len = i32_at(OFF_FXLEN, 0);
    let mut minor_n = i32_at(OFF_FXMINN, 0);
    let mut evict_victim: i32 = -1;
    if len >= cap {
        if minor_n > 0 {
            evict_victim = i32_at(OFF_FXMIN, 0);
        }
        if evict_victim >= 0 {
            for i in 0..(minor_n - 1) as usize {
                let v = i32_at(OFF_FXMIN, i + 1);
                set_i32_at(OFF_FXMIN, i, if v > evict_victim { v - 1 } else { v });
            }
            set_i32_at(OFF_FXMINN, 0, minor_n - 1);
            minor_n -= 1;
            if let Some(p) = ctx.act_reserve(8) {
                ctx.act_u8(p, ACT_FX_EVICT);
                ctx.act_i32(p + 4, evict_victim);
            }
        } else if fx_is_minor(kind) {
            return false;
        }
    }
    let _seed = rng_next();
    let _dir = rng_next();
    if fx_is_minor(kind) {
        let mut insert_at = minor_n as usize;
        for i in 0..minor_n as usize {
            if i32_at(OFF_FXMIN, i) > len {
                insert_at = i;
                break;
            }
        }
        let mut i = minor_n as usize;
        while i > insert_at {
            set_i32_at(OFF_FXMIN, i, i32_at(OFF_FXMIN, i - 1));
            i -= 1;
        }
        if (minor_n as usize) < FXMIN_CAP {
            set_i32_at(OFF_FXMIN, insert_at, len);
            set_i32_at(OFF_FXMINN, 0, minor_n + 1);
        }
    }
    set_i32_at(OFF_FXLEN, 0, len + 1);
    if let Some(p) = ctx.act_reserve(76) {
        ctx.act_u8(p, ACT_FX);
        ctx.act_u8(p + 1, kind);
        ctx.act_u8(p + 2, quiet as u8);
        ctx.act_u8(p + 3, text_op);
        ctx.act_u32(p + 4, text_arg);
        ctx.act_i32(p + 8, src);
        ctx.act_f64(p + 16, ttl);
        ctx.act_f64(p + 24, x);
        ctx.act_f64(p + 32, y);
        ctx.act_f64(p + 40, r);
        ctx.act_f64(p + 48, if has_opts { x0 } else { f64::NAN });
        ctx.act_f64(p + 56, if has_opts { y0 } else { f64::NAN });
        ctx.act_f64(p + 64, if has_opts { dmg } else { f64::NAN });
    }
    true
}

// ---------------- 世界镜像变更 ----------------
fn set_terrain(ctx: &mut Ctx, i: usize, t: u8) {
    let prev = u8_at(OFF_TERR, i);
    if prev == t {
        return;
    }
    set_u8_at(OFF_TERR, i, t);
    // fire 清除（setTerrain 内联语义）
    if u8_at(OFF_FIREG, i) > 0 {
        set_u8_at(OFF_FIREG, i, 0);
        let n = i32_at(OFF_FIREN, 0);
        if n > 0 {
            set_i32_at(OFF_FIREN, 0, n - 1);
        }
    }
    if let Some(p) = ctx.act_reserve(8) {
        ctx.act_u8(p, ACT_TERRAIN);
        ctx.act_i32(p + 1, i as i32);
        ctx.act_u8(p + 5, t);
    }
}

fn ignite(ctx: &mut Ctx, i: usize) {
    let t = u8_at(OFF_TERR, i);
    if u8_at(OFF_FIREG, i) > 0 {
        return;
    }
    if !t_flammable(t) && u8_at(OFF_BLDK, i) == 0 {
        return;
    }
    let val = (150.0 + (rng_next() * 90.0).floor()) as u8;
    set_u8_at(OFF_FIREG, i, val);
    set_i32_at(OFF_FIREN, 0, i32_at(OFF_FIREN, 0) + 1);
    if let Some(p) = ctx.act_reserve(8) {
        ctx.act_u8(p, ACT_IGNITE);
        ctx.act_i32(p + 1, i as i32);
        ctx.act_u8(p + 5, val);
    }
}

fn fire_clear(ctx: &mut Ctx, i: usize) {
    if u8_at(OFF_FIREG, i) == 0 && i32_at(OFF_FIREN, 0) >= 0 {
        // 仅当有火才清（与 extinguishFire 无条件清一致：JS 直接 fire[i]=0）
    }
    if u8_at(OFF_FIREG, i) > 0 {
        let n = i32_at(OFF_FIREN, 0);
        if n > 0 {
            set_i32_at(OFF_FIREN, 0, n - 1);
        }
    }
    set_u8_at(OFF_FIREG, i, 0);
    if let Some(p) = ctx.act_reserve(8) {
        ctx.act_u8(p, ACT_FIRE_CLEAR);
        ctx.act_i32(p + 1, i as i32);
    }
}

fn civ_delta(ctx: &mut Ctx, field: u8, civ: i32, d: f64) {
    if civ < 0 {
        return;
    }
    let c = civ as usize;
    if c >= MAX_CIVS {
        return;
    }
    let id = [OFF_CVPOP, OFF_CVHOU, OFF_CVGLD][field as usize];
    set_f64_at(id, c, f64_at(id, c) + d);
    if let Some(p) = ctx.act_reserve(16) {
        ctx.act_u8(p, ACT_CIV);
        ctx.act_u8(p + 1, field);
        ctx.act_i32(p + 4, civ);
        ctx.act_f64(p + 8, d);
    }
}

fn bump_wild(race: usize, d: i32) {
    let n = i32_at(OFF_WILD, race) + d;
    set_i32_at(OFF_WILD, race, if n > 0 { n } else { 0 });
}

fn wild_alive() -> i32 {
    let mut n = 0;
    for r in 0..MAX_RACES {
        n += i32_at(OFF_WILD, r);
    }
    n
}

// ---------------- 神经推理（三头 + 教师） ----------------
// NEUW 布局：ACC@0(10×16+16 + 16×1+1=193) STANCE@256(12×16+16+16×4+4=260) FBC@576(9×16+16+16×2+2=178) FRL@768
const NW_ACC: usize = 0;
const NW_STANCE: usize = 256;
const NW_FBC: usize = 576;
const NW_FRL: usize = 768;

fn fwd_tanh_acc(w: usize, n_in: usize, n_h: usize, n_out: usize, f: &[f64]) -> Vec<f64> {
    // 与 neuro.ts fwd 位精确：hid/out 均为 Float32Array（存储即 f32 舍入！）
    let mut hid = vec![0f64; n_h];
    let mut out = vec![0f64; n_out];
    for t in 0..n_h {
        let mut s = f64_at(OFF_NEUW, w + n_in * n_h + t); // b1[t]
        for i in 0..n_in {
            s += f[i] * f64_at(OFF_NEUW, w + i * n_h + t);
        }
        hid[t] = fd_tanh(s) as f32 as f64; // f32 舍入（Float32Array 语义）
    }
    let w2base = w + n_in * n_h + n_h; // w2 起点
    for j in 0..n_out {
        let mut s = f64_at(OFF_NEUW, w2base + n_h * n_out + j); // b2[j]
        for t in 0..n_h {
            s += hid[t] * f64_at(OFF_NEUW, w2base + t * n_out + j);
        }
        out[j] = s as f32 as f64; // f32 舍入
    }
    out
}

// 教师函数（neuroStats.enabled=false 时）——与 neuro.ts teacher* 一致
fn teacher_acc(f: &[f64; 10]) -> f64 {
    let skill = f[0];
    let agi = f[1];
    let cover = if f[8] > 0.5 { 0.12 } else { 0.0 } + if f[9] > 0.5 { 0.1 } else { 0.0 };
    let base = 0.78 + skill * 0.15 - agi * 0.2 - cover;
    js_max(0.35, js_min(0.97, base))
}
fn teacher_stance(f: &[f64; 12]) -> usize {
    if f[1] < 0.28 && f[7] < 0.42 { return 3; }
    if f[7] > 0.62 && (f[3] > 0.5 || f[6] > 0.5) { return 2; }
    if f[0] > 0.7 && f[7] > 0.5 { return 1; }
    0
}
fn teacher_flight(f: &[f64; 9]) -> usize {
    if f[1] > 0.72 && f[2] < 0.4 { return 1; }
    if f[1] > 0.55 && f[2] < 0.5 && f[0] < 0.45 { return 1; }
    if f[2] < 0.25 && f[5] > 0.5 { return 1; }
    0
}

fn neuro_acc(f: &[f64; 10]) -> f64 {
    let n = u32_at(OFF_NEUCALL, 0) + 1;
    set_u32_at(OFF_NEUCALL, 0, n);
    if u8_at(OFF_NCTL, 0) & 1 == 0 {
        return teacher_acc(f);
    }
    let out = fwd_tanh_acc(NW_ACC, 10, 16, 1, f);
    1.0 / (1.0 + fd_exp(-out[0]))
}
fn neuro_stance(f: &[f64; 12]) -> usize {
    let n = u32_at(OFF_NEUCALL, 1) + 1;
    set_u32_at(OFF_NEUCALL, 1, n);
    if u8_at(OFF_NCTL, 0) & 1 == 0 {
        return teacher_stance(f);
    }
    let out = fwd_tanh_acc(NW_STANCE, 12, 10, 4, f);
    let mut best = 0usize;
    for j in 1..out.len() {
        if out[j] > out[best] {
            best = j;
        }
    }
    best
}
/// 返回 (action, logp0, logp1)
fn neuro_flight(f: &[f64; 9]) -> (usize, f64, f64) {
    let n = u32_at(OFF_NEUCALL, 2) + 1;
    set_u32_at(OFF_NEUCALL, 2, n);
    if u8_at(OFF_NCTL, 0) & 1 == 0 {
        return (teacher_flight(f), 0.0, 0.0);
    }
    let mode = (u8_at(OFF_NCTL, 0) >> 1) & 3;
    let w = if mode == 1 { NW_FRL } else { NW_FBC };
    let out = fwd_tanh_acc(w, 9, 8, 2, f);
    let m = js_max(out[0], out[1]);
    let e0 = fd_exp(out[0] - m);
    let e1 = fd_exp(out[1] - m);
    let z = e0 + e1;
    let l0 = (e0 / z).ln();
    let l1 = (e1 / z).ln();
    (if out[1] > out[0] { 1 } else { 0 }, l0, l1)
}

// ---------------- 装备 / 物品 ----------------
struct GearBonus {
    armor: f64,
    crit: f64,
    lifesteal: f64,
    thorns: f64,
    regen: f64,
    ranged: f64,
    speed: f64,
}
const GEAR_EMPTY: GearBonus = GearBonus { armor: 0.0, crit: 0.0, lifesteal: 0.0, thorns: 0.0, regen: 0.0, ranged: 0.0, speed: 1.0 };

fn gear_bonus(s: usize) -> GearBonus {
    let mut any = false;
    for k in 0..7 {
        if i32_at(OFF_UGEAR, s * 7 + k) >= 0 {
            any = true;
            break;
        }
    }
    if !any {
        return GEAR_EMPTY;
    }
    let mut g = GearBonus { armor: 0.0, crit: 0.0, lifesteal: 0.0, thorns: 0.0, regen: 0.0, ranged: 0.0, speed: 1.0 };
    for k in 0..7 {
        let item = i32_at(OFF_UGEAR, s * 7 + k);
        if item < 0 {
            continue;
        }
        let d = item as usize;
        if d >= MAX_ITEMDEFS || d as i32 >= i32_at(OFF_TBIN, 0) {
            continue;
        }
        g.armor += f64_at(OFF_TBI, d * 12 + IT_ARMOR);
        g.crit += f64_at(OFF_TBI, d * 12 + IT_CRIT);
        g.lifesteal += f64_at(OFF_TBI, d * 12 + IT_LIFE);
        g.thorns += f64_at(OFF_TBI, d * 12 + IT_THORNS);
        g.regen += f64_at(OFF_TBI, d * 12 + IT_REGEN);
        g.ranged = js_max(g.ranged, f64_at(OFF_TBI, d * 12 + IT_RNG));
        g.speed *= f64_at(OFF_TBI, d * 12 + IT_SPDMUL);
    }
    g.armor = js_min(60.0, g.armor);
    g.speed = js_max(0.85, js_min(1.12, g.speed));
    g
}

// ---------------- 单位访问器 ----------------
macro_rules! u_f64 {
    ($col:expr, $s:expr) => {
        f64_at($col, $s)
    };
}
#[inline(always)]
fn u_has_panic(s: usize) -> bool { u8_at(OFF_UHASPANIC, s) != 0 }
#[inline(always)]
fn u_panic0(s: usize) -> f64 { if u_has_panic(s) { f64_at(OFF_UPANIC, s) } else { 0.0 } }
#[inline(always)]
fn u_glen(s: usize) -> i32 { i32_at(OFF_UGLN, s) } // -1 null / ≥0 len
#[inline(always)]
fn u_has_food(s: usize) -> bool { !u_f64!(OFF_UFD, s).is_nan() }
#[inline(always)]
fn u_food0(s: usize) -> f64 { let v = u_f64!(OFF_UFD, s); if v.is_nan() { 70.0 } else { v } }
#[inline(always)]
fn u_caravan0(s: usize) -> f64 { let v = u_f64!(OFF_UCVN, s); if v.is_nan() { 0.0 } else { v } }
#[inline(always)]
fn u_job0(s: usize) -> i32 { let j = i32_at(OFF_UJOB, s); if j < 0 { 0 } else { j } }

// 恐慌写入（含 flag）
#[inline(always)]
fn set_panic(s: usize, v: f64) {
    set_u8_at(OFF_UHASPANIC, s, 1);
    set_f64_at(OFF_UPANIC, s, v);
    dirty(s);
}
#[inline(always)]
fn clear_panic(s: usize) {
    set_u8_at(OFF_UHASPANIC, s, 0);
    dirty(s);
}

// ---------------- 桶扫描（批内版：含追加单位） ----------------
struct ScanOut {
    enemy: i32,
    best_d: f64,
    enemy_d: f64,
    allies: u32,
    foes: u32,
    overflow: bool,
    panic_writes: u32, // 写入数（镜像已就位，无需回传列表）
}

fn bucket_scan(ctx: &mut Ctx, s: usize, contagious: bool, cx: i32, cy: i32, uxx: f64, uyy: f64) -> ScanOut {
    let st = state();
    let bw = ctx.bw;
    let bh = ctx.bh;
    let u_civ = i32_at(OFF_UCIV, s);
    let u_race = u32_at(OFF_URACE, s);
    let upanic0v = u_panic0(s);
    let gl = u_glen(s);
    let has_g = gl >= 0;
    let gn = if gl > 0 { gl as usize } else { 0 };

    let mut out = ScanOut { enemy: -1, best_d: 7.0, enemy_d: 7.0, allies: 0, foes: 0, overflow: false, panic_writes: 0 };

    let cs = st.offs[OFF_CELL_START as usize] as usize;
    let ci = st.offs[OFF_CELL_ITEMS as usize] as usize;
    let live = st.live_len as usize;

    let mut visit = |ctx: &mut Ctx, o: usize, out: &mut ScanOut| {
        if u8_at(OFF_UDEAD, o) != 0 || o == s {
            return;
        }
        let ddx = f64_at(OFF_UX, o) - uxx;
        let ddy = f64_at(OFF_UY, o) - uyy;
        if is_enemy_slot(s, o) {
            out.foes += 1;
            let d2 = ddx * ddx + ddy * ddy;
            if !has_g && d2 >= out.best_d * out.best_d {
                return;
            }
            let d = d2.sqrt();
            let mut wd = d;
            if has_g {
                let oid = u32_at(OFF_UID, o);
                let mut gi: i32 = -1;
                for t in 0..gn {
                    if i32_at(OFF_UGIDS, s * UG_CAP + t) as u32 == oid {
                        gi = t as i32;
                        break;
                    }
                }
                if gi >= 0 {
                    let gv = f64_at(OFF_UGVAL, s * UG_CAP + gi as usize);
                    wd = d * (1.0 - 0.42 * js_min(1.0, gv / 2.0));
                }
            }
            if wd < out.best_d {
                out.best_d = wd;
                out.enemy = o as i32;
                out.enemy_d = d;
            }
        } else if if u_civ >= 0 {
            i32_at(OFF_UCIV, o) == u_civ
        } else {
            u32_at(OFF_URACE, o) == u_race
        } {
            out.allies += 1;
            if contagious {
                let o_panic = u_panic0(o);
                if o_panic < upanic0v - 0.15 && ddx * ddx + ddy * ddy < 16.0 {
                    let np = js_min(1.0, o_panic + upanic0v * 0.4);
                    set_panic(o, np);
                    out.panic_writes += 1;
                }
            }
        }
    };

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
                visit(ctx, o, &mut out);
            }
            bx += 1;
        }
        by += 1;
    }
    // NOTE：JS 侧 this.buckets 每 tick 初重建 —— 本批新生单位不在桶中（与 JS 行为一致：扫描不可见）
    let _ = live;
    out
}

// ---------------- 追加单位（spawn 的 arena 侧） ----------------
fn arena_append() -> usize {
    let st = state();
    let slot = st.live_len as usize;
    if slot >= MAX_UNITS {
        return usize::MAX;
    }
    st.live_len += 1;
    if slot as u32 >= st.n {
        st.n = (slot + 1) as u32;
    }
    slot
}

// cell 计算（与 TS rebuildBuckets 同式）
#[inline(always)]
fn calc_cell(x: f64, y: f64, bw: i32, bh: i32) -> u32 {
    let cx = js_min(bw as f64 - 1.0, js_max(0.0, (x / 4.0).floor())) as i32;
    let cy = js_min(bh as f64 - 1.0, js_max(0.0, (y / 4.0).floor())) as i32;
    (cy * bw + cx) as u32
}

// ---------------- 罗马数字（names.ts roman 位精确） ----------------
fn roman_bytes(n: i32, out: &mut [u8]) -> usize {
    // JS: n<1||n>40 → String(n)；表 [[40,'xl'],[10,'x'],[9,'ix'],[5,'v'],[4,'iv'],[1,'i']] 大写
    if n < 1 || n > 40 {
        // 实际 n ≥ 2 才有后缀（n+1 ≥ 3）——异常分支写十进制
        return write_dec(n, out);
    }
    let mut v = n;
    let mut len = 0usize;
    let table: [(i32, &str); 6] = [(40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")];
    for (val, sym) in table {
        while v >= val {
            for b in sym.bytes() {
                out[len] = b;
                len += 1;
            }
            v -= val;
        }
    }
    len
}
fn write_dec(n: i32, out: &mut [u8]) -> usize {
    let s = n.to_string();
    let b = s.as_bytes();
    let l = b.len().min(out.len());
    out[..l].copy_from_slice(&b[..l]);
    l
}

// ---------------- 名字生成（uniqueName 位精确） ----------------
fn unique_name(race: usize, slot_hint: usize) -> ([u8; 32], u8, bool) {
    // 返回 (name bytes, len, ok)
    let off = u32_at(OFF_FRSTOFF, race) as usize;
    let cnt = u32_at(OFF_FRSTN, race) as usize;
    let pick = ((rng_next() * cnt as f64).floor() as usize).min(cnt.saturating_sub(1));
    let mut base = [0u8; 32];
    let mut bl = 0usize;
    if cnt > 0 && off + pick * 24 + 24 <= 16384 {
        // 定长 24B 条目：[len u8][bytes ×23]
        let entry_len = u8_at(OFF_FRSTP, off + pick * 24) as usize;
        for i in 0..entry_len.min(23) {
            base[i] = u8_at(OFF_FRSTP, off + pick * 24 + 1 + i);
        }
        bl = entry_len.min(23);
    }
    // 重名统计：nm === base || (nm.length > bl && nm[bl] == 32 && startsWith(base))
    let live = state().live_len as usize;
    let mut n = 0i32;
    for o in 0..live {
        if u8_at(OFF_UDEAD, o) != 0 {
            continue;
        }
        let nlen = name_len(o);
        let mut same = nlen == bl;
        if same {
            for i in 0..bl {
                if name_byte(o, i) != base[i] {
                    same = false;
                    break;
                }
            }
        } else if nlen > bl && name_byte(o, bl) == 32 {
            let mut pre = true;
            for i in 0..bl {
                if name_byte(o, i) != base[i] {
                    pre = false;
                    break;
                }
            }
            same = pre;
        }
        if same {
            n += 1;
        }
    }
    let _ = slot_hint;
    let mut out = [0u8; 32];
    let mut len = bl;
    out[..bl].copy_from_slice(&base[..bl]);
    if n > 0 {
        if len < 31 {
            out[len] = b' ';
            len += 1;
        }
        let mut tmp = [0u8; 16];
        let rl = roman_bytes(n + 1, &mut tmp);
        for i in 0..rl {
            if len < 32 {
                out[len] = tmp[i];
                len += 1;
            }
        }
    }
    (out, len as u8, true)
}

#[inline(always)]
fn name_len(s: usize) -> usize {
    u8_at(OFF_UNAME, s * 32 + 31) as usize // 约定：第 32 字节存长度
}
#[inline(always)]
fn name_byte(s: usize, i: usize) -> u8 {
    u8_at(OFF_UNAME, s * 32 + i)
}

// ---------------- 家族 ----------------
fn family_find(id: i32) -> i32 {
    let n = i32_at(OFF_FAMN, 0);
    for i in 0..n.max(0) as usize {
        if i >= MAX_FAM {
            break;
        }
        if i32_at(OFF_FMID, i) == id {
            return i as i32;
        }
    }
    -1
}

fn prune_families() {
    let n = i32_at(OFF_FAMN, 0);
    if n <= 240 {
        return;
    }
    // [...values].filter(members<=0 && kills<10).sort(by id) 删最老 20
    let mut dead: Vec<(i32, usize)> = Vec::new(); // (id, row)
    for i in 0..n.max(0) as usize {
        if i >= MAX_FAM {
            break;
        }
        let m = f64_at(OFF_FMNUM, i * 6);
        let k = f64_at(OFF_FMNUM, i * 5 + 1);
        if m <= 0.0 && k < 10.0 {
            dead.push((i32_at(OFF_FMID, i), i));
        }
    }
    dead.sort_by_key(|x| x.0);
    let mut del = 0;
    for (id, row) in dead.iter() {
        if del >= 20 {
            break;
        }
        // 标记删除：id 置 -1（TS 侧动作删除；Rust 侧 id=-1 视为空位）
        set_i32_at(OFF_FMID, *row, -1);
        // TS 重放由 FAM_PRUNE 动作驱动 —— 简化：TS 在写回时同步（见桥接）。
        let _ = id;
        del += 1;
    }
    // 压缩（保持顺序）
    let mut w = 0usize;
    for r in 0..(n.max(0) as usize).min(MAX_FAM) {
        if i32_at(OFF_FMID, r) != -1 {
            if w != r {
                for k in 0..6 {
                    set_f64_at(OFF_FMNUM, w * 6 + k, f64_at(OFF_FMNUM, r * 6 + k));
                }
                set_i32_at(OFF_FMID, w, i32_at(OFF_FMID, r));
                set_i32_at(OFF_FMRACE, w, i32_at(OFF_FMRACE, r));
                set_u16_at(OFF_FMNAME, w * 2, u16_at(OFF_FMNAME, r * 2));
                set_u16_at(OFF_FMNAME, w * 2 + 1, u16_at(OFF_FMNAME, r * 2 + 1));
            }
            w += 1;
        }
    }
    set_i32_at(OFF_FAMN, 0, w as i32);
}

fn new_family(ctx: &mut Ctx, race: usize, founder_slot: usize) -> i32 {
    let pre_i = (rng_next() * 16.0).floor() as usize & 15;
    let post_i = (rng_next() * 12.0).floor() as usize % 12;
    let id = i32_at(OFF_FMSEQ, 0);
    set_i32_at(OFF_FMSEQ, 0, id + 1);
    let row = i32_at(OFF_FAMN, 0);
    if row as usize >= MAX_FAM {
        return -1;
    }
    let founded = f64_at(OFF_CNT, 5).floor(); // CNT[5] = yearF（pack 写入）
    set_i32_at(OFF_FMID, row as usize, id);
    set_i32_at(OFF_FMRACE, row as usize, race as i32);
    for k in 0..6 {
        set_f64_at(OFF_FMNUM, row as usize * 6 + k, 0.0);
    }
    set_f64_at(OFF_FMNUM, row as usize * 6, 1.0); // members
    set_f64_at(OFF_FMNUM, row as usize * 6 + 3, 1.0); // peak
    set_f64_at(OFF_FMNUM, row as usize * 6 + 5, founded); // founded
    set_u16_at(OFF_FMNAME, row as usize * 2, pre_i as u16);
    set_u16_at(OFF_FMNAME, row as usize * 2 + 1, post_i as u16);
    set_i32_at(OFF_FAMN, 0, row + 1);
    prune_families();
    // 动作：TS 构造 Family（founder 名从 JS 单位取）
    if let Some(p) = ctx.act_reserve(32) {
        ctx.act_u8(p, ACT_FAM_NEW);
        ctx.act_i32(p + 4, id);
        ctx.act_i32(p + 8, race as i32);
        ctx.act_u8(p + 12, pre_i as u8);
        ctx.act_u8(p + 13, post_i as u8);
        ctx.act_f64(p + 16, founded);
        ctx.act_i32(p + 24, founder_slot as i32);
    }
    id
}

fn family_milestone(ctx: &mut Ctx, row: usize) {
    // members 已 ++；peak 更新 + 12/24/40 一次性播报
    let members = f64_at(OFF_FMNUM, row * 6);
    let peak = f64_at(OFF_FMNUM, row * 5 + 2);
    if members > peak {
        set_f64_at(OFF_FMNUM, row * 6 + 2, members);
    }
    let marks = [12.0f64, 24.0, 40.0];
    let mut ms = f64_at(OFF_FMNUM, row * 5 + 3);
    let mut fired: Vec<f64> = Vec::new();
    while (ms as usize) < marks.len() && members >= marks[ms as usize] {
        fired.push(marks[ms as usize]);
        ms += 1.0;
    }
    set_f64_at(OFF_FMNUM, row * 6 + 4, ms);
    for m in fired {
        if let Some(p) = ctx.act_reserve(48) {
            ctx.act_u8(p, ACT_EVT);
            ctx.act_u8(p + 1, EVT_LINEAGE_FLORISH);
            ctx.act_i32(p + 4, i32_at(OFF_FMID, row));
            ctx.act_f64(p + 16, m);
        }
    }
}

// ---------------- 传染 / 目击 / 记仇 ----------------
fn spread_plague(ctx: &mut Ctx, s: usize) {
    let live = state().live_len as usize;
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    for o in 0..live {
        if o == s || u8_at(OFF_UINF, o) != 0 || u8_at(OFF_UDEAD, o) != 0 {
            continue;
        }
        if is_undead(u32_at(OFF_URACE, o) as usize) {
            continue;
        }
        let tr = i32_at(OFF_UTRAIT, o);
        if tr >= 0 && (u8_at(OFF_TRFL, tr as usize) & 4) != 0 {
            continue;
        }
        let dx = f64_at(OFF_UX, o) - ux;
        let dy = f64_at(OFF_UY, o) - uy;
        if fd_hypot(dx, dy) < 1.8 {
            let oc = i32_at(OFF_UCIV, o);
            if oc >= 0 {
                if rng_next() < f64_at(OFF_CVTECH, oc as usize * 24 + TC_PLAGUE) {
                    set_u8_at(OFF_UINF, o, 1);
                    dirty(o);
                    break;
                }
            }
        }
    }
    let _ = ctx;
}

fn add_grudge(w: usize, killer_id: u32, victim_civ: i32, victim_fam: i32) {
    let mut v = 1.0;
    let wc = i32_at(OFF_UCIV, w);
    if victim_civ >= 0 && wc == victim_civ {
        v = 1.6;
    }
    let wf = i32_at(OFF_UFAM, w);
    if wf >= 0 && wf == victim_fam {
        v = 2.6;
    }
    let mut gl = u_glen(w);
    if gl < 0 {
        gl = 0;
    }
    // 查重
    let mut found = -1i32;
    for i in 0..gl as usize {
        if i32_at(OFF_UGIDS, w * UG_CAP + i) as u32 == killer_id {
            found = i as i32;
            break;
        }
    }
    if found >= 0 {
        let nv = js_min(3.0, f64_at(OFF_UGVAL, w * UG_CAP + found as usize) + v * 0.6);
        set_f64_at(OFF_UGVAL, w * UG_CAP + found as usize, nv);
    } else {
        // JS：满 4 条时 splice 挤最弱 + push 尾部（顺序语义保真）
        let n = gl as usize;
        if n < 4 {
            set_i32_at(OFF_UGIDS, w * UG_CAP + n, killer_id as i32);
            set_f64_at(OFF_UGVAL, w * UG_CAP + n, v);
            set_i32_at(OFF_UGLN, w, n as i32 + 1);
        } else {
            let m = n.min(UG_CAP);
            let mut wi = 0usize;
            for i in 1..m {
                if f64_at(OFF_UGVAL, w * UG_CAP + i) < f64_at(OFF_UGVAL, w * UG_CAP + wi) {
                    wi = i;
                }
            }
            let mut k = wi;
            while k + 1 < m {
                set_i32_at(OFF_UGIDS, w * UG_CAP + k, i32_at(OFF_UGIDS, w * UG_CAP + k + 1));
                set_f64_at(OFF_UGVAL, w * UG_CAP + k, f64_at(OFF_UGVAL, w * UG_CAP + k + 1));
                k += 1;
            }
            set_i32_at(OFF_UGIDS, w * UG_CAP + m - 1, killer_id as i32);
            set_f64_at(OFF_UGVAL, w * UG_CAP + m - 1, v);
        }
    }
    dirty(w);
}

fn witness_death(ctx: &mut Ctx, killer: usize, victim: usize) {
    let vx = f64_at(OFF_UX, victim);
    let vy = f64_at(OFF_UY, victim);
    let bw = ctx.bw;
    let bh = ctx.bh;
    let cx = js_min(bw as f64 - 1.0, js_max(0.0, (vx / 4.0).floor())) as i32;
    let cy = js_min(bh as f64 - 1.0, js_max(0.0, (vy / 4.0).floor())) as i32;
    let fierce = js_min(3.0, f64_at(OFF_UKILLS, killer) / 6.0);
    let killer_id = u32_at(OFF_UID, killer);
    let victim_civ = i32_at(OFF_UCIV, victim);
    let victim_race = u32_at(OFF_URACE, victim);
    let victim_fam = i32_at(OFF_UFAM, victim);
    let killer_kills = f64_at(OFF_UKILLS, killer);

    let st = state();
    let cs = st.offs[OFF_CELL_START as usize] as usize;
    let ci = st.offs[OFF_CELL_ITEMS as usize] as usize;
    let live = st.live_len as usize;

    let mut visit = |o: usize| {
        if u8_at(OFF_UDEAD, o) != 0 || o == killer || o == victim {
            return;
        }
        let kin = if victim_civ >= 0 {
            i32_at(OFF_UCIV, o) == victim_civ
        } else {
            u32_at(OFF_URACE, o) == victim_race
        };
        if !kin {
            return;
        }
        if fd_hypot(f64_at(OFF_UX, o) - vx, f64_at(OFF_UY, o) - vy) > 6.0 {
            return;
        }
        let wr = u32_at(OFF_URACE, o) as usize;
        if is_undead(wr) {
            return;
        }
        let mut inc = 0.32 + 0.08 * fierce + if killer_kills >= 10.0 { 0.12 } else { 0.0 };
        let wf = i32_at(OFF_UFAM, o);
        if wf >= 0 && wf == victim_fam {
            inc += 0.15;
        }
        let wtr = i32_at(OFF_UTRAIT, o);
        let is_berserk = wtr >= 0 && u8_at(OFF_TRFL, wtr as usize) & 64 != 0; // bit6 = berserk（约定）
        if is_berserk || u8_at(OFF_MLOOT, wr) != 0 {
            inc *= 0.35;
        }
        if i32_at(OFF_UARMY, o) >= 0 {
            inc *= 0.4;
        }
        set_panic(o, js_min(1.0, u_panic0(o) + inc));
        add_grudge(o, killer_id, victim_civ, victim_fam);
    };

    let mut by = cy - 2;
    while by <= cy + 2 {
        if by < 0 || by >= bh {
            by += 1;
            continue;
        }
        let mut bx = cx - 2;
        while bx <= cx + 2 {
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
                visit(o);
            }
            bx += 1;
        }
        by += 1;
    }
    let _ = live;
}

// ---------------- 建筑查询 ----------------
fn at_war(a: i32, b: i32) -> bool {
    if a < 0 || b < 0 || a == b {
        return false;
    }
    u8_at(OFF_ATWAR, a as usize * MAX_CIVS + b as usize) != 0
}

fn civ_at_war(c: i32) -> bool {
    let n = i32_at(OFF_CIVN, 0);
    for b in 0..n.max(0) as usize {
        if b >= MAX_CIVS {
            break;
        }
        if b as i32 == c {
            continue;
        }
        if u8_at(OFF_CVAL, b) != 0 && at_war(c, b as i32) {
            return true;
        }
    }
    false
}

fn bldg_row_of_tile(i: usize) -> i32 {
    i32_at(OFF_BIDX, i)
}

fn fire_near(s: usize, r: f64) -> i32 {
    if i32_at(OFF_FIREN, 0) == 0 {
        return -1;
    }
    let cx = f64_at(OFF_UX, s).floor() as i32;
    let cy = f64_at(OFF_UY, s).floor() as i32;
    let rr = r.ceil() as i32;
    let mut best = -1i32;
    let mut best_d = r + 0.5;
    let uciv = i32_at(OFF_UCIV, s);
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let mut dy = -rr;
    while dy <= rr {
        let mut dx = -rr;
        while dx <= rr {
            let xx = cx + dx;
            let yy = cy + dy;
            if xx < 0 || yy < 0 || xx >= W || yy >= H {
                dx += 1;
                continue;
            }
            let i = idx(xx, yy);
            if u8_at(OFF_FIREG, i) == 0 {
                dx += 1;
                continue;
            }
            let d = fd_hypot(xx as f64 + 0.5 - ux, yy as f64 + 0.5 - uy);
            if d >= best_d {
                dx += 1;
                continue;
            }
            let own = uciv >= 0 && (i16_at(OFF_OWN, i) == uciv as i16 || (u8_at(OFF_BLDK, i) > 0 && {
                let row = bldg_row_of_tile(i);
                row >= 0 && i32_at(OFF_BLDC, row as usize) == uciv
            }));
            if own || d < 2.2 {
                best_d = d;
                best = i as i32;
            }
            dx += 1;
        }
        dy += 1;
    }
    best
}

fn extinguish_fire(ctx: &mut Ctx, i: usize, by_slot: usize) {
    fire_clear(ctx, i);
    let fires_out = f64_at(OFF_CNT, 0) + 1.0;
    set_f64_at(OFF_CNT, 0, fires_out);
    let fxp = u8_at(OFF_FXP, 0);
    let _ = fxp;
    fx(ctx, FX_WATER, (i % W as usize) as f64 + 0.5, (i / W as usize) as f64 + 0.5, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
    // 节流播报：firesOut≥3 且距上次 >480 tick
    let tick = i32_at(OFF_TICK, 0);
    let last = f64_at(OFF_CNT, 1);
    if fires_out >= 3.0 && (tick as f64 - last) > 480.0 {
        set_f64_at(OFF_CNT, 1, tick as f64);
        let civ = i32_at(OFF_UCIV, by_slot);
        if civ >= 0 && u8_at(OFF_CVAL, civ as usize) != 0 {
            if let Some(p) = ctx.act_reserve(48) {
                ctx.act_u8(p, ACT_EVT);
                ctx.act_u8(p + 1, EVT_FIREOUT);
                ctx.act_i32(p + 4, civ);
                ctx.act_f64(p + 32, (i % W as usize) as f64 + 0.5);
                ctx.act_f64(p + 40, (i / W as usize) as f64 + 0.5);
            }
        }
    }
}

fn damaged_near(s: usize, r: f64) -> i32 {
    let n = i32_at(OFF_DMGN, 0);
    if n == 0 {
        return -1;
    }
    let uciv = i32_at(OFF_UCIV, s);
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let mut best = -1i32;
    let mut best_d = r;
    for k in 0..n.max(0) as usize {
        if k >= MAX_BLD {
            break;
        }
        let i = i32_at(OFF_DMGL, k) as usize;
        let row = bldg_row_of_tile(i);
        if row < 0 {
            continue;
        }
        if i32_at(OFF_BLDC, row as usize) != uciv {
            continue;
        }
        let bx = i32_at(OFF_BLDXY, row as usize * 2) as f64 + 0.5;
        let by = i32_at(OFF_BLDXY, row as usize * 2 + 1) as f64 + 0.5;
        let d = fd_hypot(bx - ux, by - uy);
        if d < best_d {
            best_d = d;
            best = i as i32;
        }
    }
    best
}

fn enemy_building_near(s: usize, r: f64) -> i32 {
    let cx = f64_at(OFF_UX, s).floor() as i32;
    let cy = f64_at(OFF_UY, s).floor() as i32;
    let rr = r.ceil() as i32;
    let mut best = -1i32;
    let mut best_d = r + 0.5;
    let uciv = i32_at(OFF_UCIV, s);
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let mut dy = -rr;
    while dy <= rr {
        let mut dx = -rr;
        while dx <= rr {
            let xx = cx + dx;
            let yy = cy + dy;
            if xx < 0 || yy < 0 || xx >= W || yy >= H {
                dx += 1;
                continue;
            }
            let i = idx(xx, yy);
            let bk = u8_at(OFF_BLDK, i);
            if bk == 0 {
                dx += 1;
                continue;
            }
            let row = bldg_row_of_tile(i);
            if row < 0 {
                dx += 1;
                continue;
            }
            let bc = i32_at(OFF_BLDC, row as usize);
            if bc == uciv {
                dx += 1;
                continue;
            }
            if uciv >= 0 && !at_war(uciv, bc) {
                dx += 1;
                continue;
            }
            let d = fd_hypot(xx as f64 - ux, yy as f64 - uy);
            if d < best_d {
                best_d = d;
                best = i as i32;
            }
            dx += 1;
        }
        dy += 1;
    }
    best
}

fn nearest_enemy_building(s: usize) -> i32 {
    let n = i32_at(OFF_BLDN, 0).max(0) as usize;
    let uciv = i32_at(OFF_UCIV, s);
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let mut best = -1i32;
    let mut best_d = f64::INFINITY;
    for r in 0..n.min(MAX_BLD) {
        let bc = i32_at(OFF_BLDC, r);
        if bc == uciv {
            continue;
        }
        if uciv < 0 || !at_war(uciv, bc) {
            continue;
        }
        let bx = i32_at(OFF_BLDXY, r * 2) as f64;
        let by = i32_at(OFF_BLDXY, r * 2 + 1) as f64;
        let d = fd_hypot(bx - ux, by - uy);
        if d < best_d {
            best_d = d;
            best = r as i32;
        }
    }
    best
}

fn nearest_building_of(s: usize, kind: i32) -> i32 {
    let n = i32_at(OFF_BLDN, 0).max(0) as usize;
    let uciv = i32_at(OFF_UCIV, s);
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let mut best = -1i32;
    let mut best_d = f64::INFINITY;
    for r in 0..n.min(MAX_BLD) {
        if i32_at(OFF_BLDC, r) != uciv {
            continue;
        }
        let bk = u8_at(OFF_BLDK, i32_at(OFF_BLDI, r) as usize) as i32;
        if bk != kind {
            continue;
        }
        let bx = i32_at(OFF_BLDXY, r * 2) as f64;
        let by = i32_at(OFF_BLDXY, r * 2 + 1) as f64;
        let d = fd_hypot(bx - ux, by - uy);
        if d < best_d {
            best_d = d;
            best = r as i32;
        }
    }
    best
}

fn war_target(civ: i32) -> i32 {
    let n = i32_at(OFF_BLDN, 0).max(0) as usize;
    let mut enemies: Vec<i32> = Vec::new();
    for r in 0..n.min(MAX_BLD) {
        let bc = i32_at(OFF_BLDC, r);
        if bc != civ && at_war(civ, bc) {
            enemies.push(r as i32);
        }
    }
    if enemies.is_empty() {
        return -1;
    }
    let pick = (rng_next() * enemies.len() as f64).floor() as usize;
    enemies[pick.min(enemies.len() - 1)]
}

fn repair_building(ctx: &mut Ctx, i: usize, amount: f64) -> bool {
    let row = bldg_row_of_tile(i);
    if row < 0 {
        return false;
    }
    let row = row as usize;
    let kind = u8_at(OFF_BLDK, i) as usize;
    let max = js_round(f64_at(OFF_TBHP, kind) * f64_at(OFF_CVTECH, i32_at(OFF_BLDC, row) as usize * 24 + TC_BHP));
    let mut hp = f64_at(OFF_BLDHP, row);
    if hp == 0.0 && f64_at(OFF_BLDHP, row) == 0.0 {
        // bHp 缺省 = max（Map miss 语义：?? def.hp*bhp —— pack 时已写入 max）
    }
    hp = js_min(max, hp + amount);
    set_f64_at(OFF_BLDHP, row, hp);
    if let Some(p) = ctx.act_reserve(16) {
        ctx.act_u8(p, ACT_BHP);
        ctx.act_i32(p + 1, i as i32);
        ctx.act_f64(p + 8, hp);
    }
    let rd = f64_at(OFF_CNT, 2) + 1.0;
    set_f64_at(OFF_CNT, 2, rd);
    let bx = i32_at(OFF_BLDXY, row * 2) as f64 + 0.5;
    let by = i32_at(OFF_BLDXY, row * 2 + 1) as f64 + 0.2;
    fx(ctx, FX_HAMMER, bx, by, 14.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
    let done = hp >= max;
    if done {
        // damagedSet.delete
        dmg_set_del(i);
        fx(ctx, FX_SPAWN, i32_at(OFF_BLDXY, row * 2) as f64 + 0.5, i32_at(OFF_BLDXY, row * 2 + 1) as f64 + 0.5, 22.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
        let tick = i32_at(OFF_TICK, 0);
        if rd >= 6.0 && (tick as f64 - f64_at(OFF_CNT, 3)) > 720.0 {
            set_f64_at(OFF_CNT, 3, tick as f64);
            let civ = i32_at(OFF_BLDC, row);
            if civ >= 0 && u8_at(OFF_CVAL, civ as usize) != 0 {
                if let Some(p) = ctx.act_reserve(48) {
                    ctx.act_u8(p, ACT_EVT);
                    ctx.act_u8(p + 1, EVT_REPAIR);
                    ctx.act_i32(p + 4, civ);
                    ctx.act_f64(p + 32, bx);
                    ctx.act_f64(p + 40, i32_at(OFF_BLDXY, row * 2 + 1) as f64 + 0.5);
                }
            }
        }
    }
    done
}

fn dmg_set_add(ctx: &mut Ctx, i: usize) {
    let n = i32_at(OFF_DMGN, 0);
    for k in 0..n.max(0) as usize {
        if i32_at(OFF_DMGL, k) == i as i32 {
            return; // Set 语义
        }
    }
    if (n as usize) < MAX_BLD {
        set_i32_at(OFF_DMGL, n as usize, i as i32);
        set_i32_at(OFF_DMGN, 0, n + 1);
        if let Some(p) = ctx.act_reserve(8) {
            ctx.act_u8(p, ACT_DMG_ADD);
            ctx.act_i32(p + 1, i as i32);
        }
    }
}

fn dmg_set_del(i: usize) {
    let n = i32_at(OFF_DMGN, 0);
    for k in 0..n.max(0) as usize {
        if i32_at(OFF_DMGL, k) == i as i32 {
            // 有序删除（保持其余顺序）
            for m in k..(n - 1) as usize {
                set_i32_at(OFF_DMGL, m, i32_at(OFF_DMGL, m + 1));
            }
            set_i32_at(OFF_DMGN, 0, n - 1);
            // TS 侧同步由 ACT_DMG_DEL 动作驱动 —— 调用方发射
            return;
        }
    }
}

/// attackBuilding：hp ≤ 0 时返回 Err(()) → 上层 BAIL_ATTACK_DEST
fn attack_building(ctx: &mut Ctx, i: usize, dmg: f64) -> Result<(), ()> {
    let kind = u8_at(OFF_BLDK, i);
    if kind == 0 {
        return Ok(());
    }
    let row = bldg_row_of_tile(i);
    if row < 0 {
        return Ok(());
    }
    let row = row as usize;
    let hp = f64_at(OFF_BLDHP, row) - dmg;
    if hp <= 0.0 {
        Err(()) // BAIL：onBuildingDestroyed 级联（占领 rng/吞并/道路）
    } else {
        set_f64_at(OFF_BLDHP, row, hp);
        if let Some(p) = ctx.act_reserve(16) {
            ctx.act_u8(p, ACT_BHP);
            ctx.act_i32(p + 1, i as i32);
            ctx.act_f64(p + 8, hp);
        }
        dmg_set_add(ctx, i);
        fx(ctx, FX_HIT, (i % W as usize) as f64 + 0.5, (i / W as usize) as f64 + 0.5, 6.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
        Ok(())
    }
}

// ---------------- 寻地 / 登船 ----------------
fn find_land_near(x: f64, y: f64, r: i32) -> (bool, f64, f64) {
    let cx = x.floor() as i32;
    let cy = y.floor() as i32;
    for ring in 1..=r {
        let mut dy = -ring;
        while dy <= ring {
            let mut dx = -ring;
            while dx <= ring {
                if js_max((dx).abs() as f64, (dy).abs() as f64) != ring as f64 {
                    dx += 1;
                    continue;
                }
                let xx = cx + dx;
                let yy = cy + dy;
                if xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1 {
                    dx += 1;
                    continue;
                }
                let t = u8_at(OFF_TERR, idx(xx, yy));
                if !t_is_water(t) && t != T_MOUNTAIN && t != T_LAVA {
                    return (true, xx as f64 + 0.5, yy as f64 + 0.5);
                }
                dx += 1;
            }
            dy += 1;
        }
    }
    (false, 0.0, 0.0)
}

fn find_water_near(x: f64, y: f64, r: i32) -> (bool, f64, f64) {
    let cx = x.floor() as i32;
    let cy = y.floor() as i32;
    for ring in 1..=r {
        let mut dy = -ring;
        while dy <= ring {
            let mut dx = -ring;
            while dx <= ring {
                if js_max((dx).abs() as f64, (dy).abs() as f64) != ring as f64 {
                    dx += 1;
                    continue;
                }
                let xx = cx + dx;
                let yy = cy + dy;
                if xx < 0 || yy < 0 || xx >= W || yy >= H {
                    dx += 1;
                    continue;
                }
                if t_is_water(u8_at(OFF_TERR, idx(xx, yy))) {
                    return (true, xx as f64 + 0.5, yy as f64 + 0.5);
                }
                dx += 1;
            }
            dy += 1;
        }
    }
    (false, 0.0, 0.0)
}

fn maybe_board_for_war(ctx: &mut Ctx, s: usize) -> bool {
    if u8_at(OFF_UBOAT, s) != 0 || !is_civ(u32_at(OFF_URACE, s) as usize) {
        return false;
    }
    let job = u_job0(s);
    if job != 2 && job != 3 {
        return false;
    }
    let uciv = i32_at(OFF_UCIV, s);
    if uciv < 0 || !civ_at_war(uciv) {
        return false;
    }
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let tx = f64_at(OFF_UTX, s);
    let ty = f64_at(OFF_UTY, s);
    let dx = tx - ux;
    let dy = ty - uy;
    let d = fd_hypot(dx, dy);
    if d < 8.0 {
        return false;
    }
    let samples = js_max(1.0, d.floor());
    let mut water = 0i32;
    let mut sk = 1.0f64;
    while sk <= samples {
        let xx = (ux + (dx * sk) / d).floor() as i32;
        let yy = (uy + (dy * sk) / d).floor() as i32;
        if xx >= 0 && yy >= 0 && xx < W && yy < H {
            if t_is_water(u8_at(OFF_TERR, idx(xx, yy))) {
                water += 1;
            }
        }
        sk += 1.0;
    }
    if water as f64 / samples < 0.45 {
        return false;
    }
    let cur = u8_at(OFF_TERR, idx(ux.floor() as i32, uy.floor() as i32));
    if t_is_water(cur) {
        return false;
    }
    let (found, dockx, docky) = find_water_near(ux, uy, 4);
    if !found {
        return false;
    }
    let ttl = 700.0 + (rng_next() * 300.0).floor();
    let shared_tx = tx;
    let shared_ty = ty;
    let mut board = |ctx: &mut Ctx, o: usize| {
        set_u8_at(OFF_UBOAT, o, 1);
        set_i32_at(OFF_UBTL, o, ttl as i32);
        let nx = dockx + (rng_next() - 0.5) * 1.2;
        let ny = docky + (rng_next() - 0.5) * 1.2;
        set_f64_at(OFF_UX, o, nx);
        set_f64_at(OFF_UY, o, ny);
        set_f64_at(OFF_ULX, o, nx);
        set_f64_at(OFF_ULY, o, ny);
        set_f64_at(OFF_UTX, o, shared_tx);
        set_f64_at(OFF_UTY, o, shared_ty);
        dirty(o);
        fx(ctx, FX_SPAWN, nx, ny, 24.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
    };
    board(ctx, s);
    let mut fleet = 1i32;
    let live = state().live_len as usize;
    for o in 0..live {
        if fleet >= 4 {
            break;
        }
        if o == s || u8_at(OFF_UDEAD, o) != 0 || u8_at(OFF_UBOAT, o) != 0 || i32_at(OFF_UCIV, o) != uciv {
            continue;
        }
        let ojob = u_job0(o);
        if ojob != 2 && ojob != 3 {
            continue;
        }
        if fd_hypot(f64_at(OFF_UX, o) - ux, f64_at(OFF_UY, o) - uy) > 6.0 {
            continue;
        }
        board(ctx, o);
        fleet += 1;
    }
    if fleet >= 3 {
        if let Some(p) = ctx.act_reserve(48) {
            ctx.act_u8(p, ACT_EVT);
            ctx.act_u8(p + 1, EVT_WAR_FLEET);
            ctx.act_i32(p + 4, uciv);
            ctx.act_f64(p + 16, fleet as f64);
            ctx.act_f64(p + 32, ux);
            ctx.act_f64(p + 40, uy);
        }
        // 修正：上面 reserve(24) 不够 —— 重发（reserve 已推进，用 32）
    }
    true
}

// ---------------- moveUnit（4491-4553 位精确） ----------------
fn move_unit(ctx: &mut Ctx, s: usize, mul: f64) {
    let race = u32_at(OFF_URACE, s) as usize;
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let tx = f64_at(OFF_UTX, s);
    let ty = f64_at(OFF_UTY, s);
    let dx = tx - ux;
    let dy = ty - uy;
    let d = fd_hypot(dx, dy);
    if d < 0.05 {
        return;
    }
    let mut step = f64_at(OFF_USPEED, s) * 2.0 * mul * (if truthy_f(u_f64!(OFF_UCHILL, s)) { 0.55 } else { 1.0 }) * (if truthy_f(u_f64!(OFF_UCURSE, s)) { 0.75 } else { 1.0 });
    if u8_at(OFF_ROAD, idx(ux.floor() as i32, uy.floor() as i32)) > 0 {
        step *= 1.45;
    }
    let nx = ux + (dx / d) * step;
    let ny = uy + (dy / d) * step;
    if dx != 0.0 {
        set_u8_at(OFF_UFLIP, s, (dx < 0.0) as u8);
    }
    if race_flag(race) & 32 != 0 {
        // flying（TBF? —— flying 在 RACE_FLAGS 无位 —— 用 TBF[0] bit5）
    }
    if u8_at(OFF_TBF, race * 2) & 32 != 0 {
        set_f64_at(OFF_UX, s, js_max(0.5, js_min(W as f64 - 0.5, nx)));
        set_f64_at(OFF_UY, s, js_max(0.5, js_min(H as f64 - 0.5, ny)));
        dirty(s);
        return;
    }
    let cur = u8_at(OFF_TERR, idx(ux.floor() as i32, uy.floor() as i32));
    if u8_at(OFF_TBF, race * 2) & 64 != 0 {
        // aquatic
        let nt = u8_at(OFF_TERR, idx(nx.floor() as i32, ny.floor() as i32));
        if nt == T_DEEP || nt == T_WATER {
            set_f64_at(OFF_UX, s, nx);
            set_f64_at(OFF_UY, s, ny);
        } else {
            set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, ux + (rng_next() * 2.0 - 1.0) * 8.0)));
            set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, uy + (rng_next() * 2.0 - 1.0) * 8.0)));
        }
        dirty(s);
        return;
    }
    if u8_at(OFF_TBF, race * 2) & 128 != 0 {
        // sandswim
        let nt = u8_at(OFF_TERR, idx(nx.floor() as i32, ny.floor() as i32));
        if nt == T_SAND || nt == T_GRASS || nt == T_BURNT {
            set_f64_at(OFF_UX, s, nx);
            set_f64_at(OFF_UY, s, ny);
        } else {
            set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, ux + (rng_next() * 2.0 - 1.0) * 6.0)));
            set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, uy + (rng_next() * 2.0 - 1.0) * 6.0)));
        }
        if u8_at(OFF_FXP, 0) & FXP_AMB != 0 && rng_next() < 0.08 {
            fx(ctx, FX_DUST, f64_at(OFF_UX, s), f64_at(OFF_UY, s) + 0.5, 12.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
        }
        dirty(s);
        return;
    }
    let swimming = cur == T_DEEP || cur == T_WATER;
    let on_mountain = cur == T_MOUNTAIN;
    let pass_x = pass_tile(swimming, on_mountain, u8_at(OFF_TERR, idx(nx.floor() as i32, uy.floor() as i32)));
    let pass_y = pass_tile(swimming, on_mountain, u8_at(OFF_TERR, idx(ux.floor() as i32, ny.floor() as i32)));
    if pass_x && pass_y {
        set_f64_at(OFF_UX, s, nx);
        set_f64_at(OFF_UY, s, ny);
    } else if pass_x {
        set_f64_at(OFF_UX, s, nx);
    } else if pass_y {
        set_f64_at(OFF_UY, s, ny);
    } else {
        if maybe_board_for_war(ctx, s) {
            dirty(s);
            return;
        }
        set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, ux + (rng_next() * 2.0 - 1.0) * 6.0)));
        set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, uy + (rng_next() * 2.0 - 1.0) * 6.0)));
    }
    dirty(s);
}

fn pass_tile(swimming: bool, on_mountain: bool, t: u8) -> bool {
    if swimming {
        return t != T_LAVA && t != T_MOUNTAIN;
    }
    if on_mountain {
        return t != T_DEEP && t != T_WATER && t != T_LAVA;
    }
    t_walkable(t)
}

// ---------------- zombify（原地变僵尸） ----------------
fn zombify(ctx: &mut Ctx, s: usize) {
    let race = u32_at(OFF_URACE, s) as usize;
    let civ = i32_at(OFF_UCIV, s);
    if civ >= 0 {
        civ_delta(ctx, 0, civ, -1.0);
    }
    if !is_civ(race) {
        bump_wild(race, -1);
    }
    set_u32_at(OFF_URACE, s, R_ZOMBIE as u32);
    set_i32_at(OFF_UCIV, s, -1);
    set_f64_at(OFF_UHP, s, 40.0);
    set_f64_at(OFF_UMAXHP, s, 46.0);
    set_f64_at(OFF_UDMG, s, 6.0);
    set_f64_at(OFF_USPEED, s, 0.05);
    set_f64_at(OFF_UAGE, s, 0.0);
    set_f64_at(OFF_UMAXAGE, s, 9999.0);
    set_u8_at(OFF_UINF, s, 0);
    set_u8_at(OFF_UDEAD, s, 0);
    set_u8_at(OFF_UBOAT, s, 0);
    set_i32_at(OFF_UBTL, s, 0);
    bump_wild(R_ZOMBIE, 1);
    fx(ctx, FX_SPAWN, f64_at(OFF_UX, s), f64_at(OFF_UY, s), 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
    dirty(s);
}

// ---------------- riseSkeleton ----------------
fn rise_skeleton(ctx: &mut Ctx, x: f64, y: f64) {
    let spawned = spawn_unit(ctx, R_SKELETON, x, y, -1, None, false, -1, -1, -1, -1);
    if spawned != usize::MAX {
        fx(ctx, FX_SPAWN, x, y, 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
        if rng_next() < 0.12 {
            if let Some(p) = ctx.act_reserve(48) {
                ctx.act_u8(p, ACT_EVT);
                ctx.act_u8(p + 1, EVT_SKELETON);
                ctx.act_f64(p + 32, x);
                ctx.act_f64(p + 40, y);
            }
        }
    }
}

// ---------------- spawnUnit（1009-1145 位精确；批内路径全 silent + 已知 civ/无 gear） ----------------
/// 返回新 slot 或 usize::MAX（失败）
#[allow(clippy::too_many_arguments)]
fn spawn_unit(ctx: &mut Ctx, race: usize, x: f64, y: f64, civ: i32, gene: Option<[f64; 4]>, infected: bool, job: i32, trait_id: i32, fam: i32, fgn: i32) -> usize {
    // —— 预算（civ→MAX_UNITS；wild→MAX_WILDLIFE + 巨怪上限）——
    let live = state().live_len as usize;
    if is_civ(race) && live >= i32_at(OFF_MISC, 0).max(0) as usize {
        return usize::MAX;
    }
    if !is_civ(race) && wild_alive() >= i32_at(OFF_MISC, 1).max(0) {
        return usize::MAX;
    }
    let mon_cap = i32_at(OFF_MONCAP, race);
    if mon_cap > 0 && i32_at(OFF_WILD, race) >= mon_cap {
        return usize::MAX;
    }
    let x = js_max(0.5, js_min(W as f64 - 0.5, x));
    let y = js_max(0.5, js_min(H as f64 - 0.5, y));

    // trait：未指定 → 15% 掷骰 + rollTrait
    let trait_id = if trait_id >= -1 {
        // -1 = 未指定（JS undefined）；-2 = 显式 null
        if trait_id == -1 {
            if rng_next() < 0.15 {
                let n = i32_at(OFF_TRN, 0).max(0);
                if n > 0 {
                    let pick = (rng_next() * n as f64).floor() as usize;
                    pick.min(n as usize - 1) as i32
                } else {
                    -2
                }
            } else {
                -2
            }
        } else {
            -2
        }
    } else {
        trait_id
    };
    let td_dmg = if trait_id >= 0 { f64_at(OFF_TRDMG, trait_id as usize) } else { 1.0 };
    let td_hp = if trait_id >= 0 { f64_at(OFF_TRHP, trait_id as usize) } else { 1.0 };
    let td_spd = if trait_id >= 0 { f64_at(OFF_TRSPD, trait_id as usize) } else { 1.0 };

    // gene：未指定 → baseGene（speciesBase 有则 4 rng）
    let gene = if let Some(g) = gene { g } else if u8_at(OFF_SPBH, race) != 0 {
        let j = |b: f64| js_max(0.5, js_min(2.0, b * (1.0 + (rng_next() - 0.5) * 0.1)));
        [
            j(f64_at(OFF_SPB, race * 4)),
            j(f64_at(OFF_SPB, race * 4 + 1)),
            j(f64_at(OFF_SPB, race * 4 + 2)),
            j(f64_at(OFF_SPB, race * 4 + 3)),
        ]
    } else {
        [1.0, 1.0, 1.0, 1.0]
    };

    // job：civ → rollJob
    let job = if is_civ(race) && civ >= 0 {
        if job >= 0 {
            job
        } else {
            let mut total = 0f64;
            for i in 0..7 {
                total += f64_at(OFF_TBJ, i * 5 + JB_W);
            }
            let mut r = rng_next() * total;
            let mut picked = 0usize;
            for i in 0..7 {
                r -= f64_at(OFF_TBJ, i * 5 + JB_W);
                if r <= 0.0 {
                    picked = i;
                    break;
                }
            }
            picked as i32
        }
    } else {
        -1
    };
    let jd_hp = if is_civ(race) { f64_at(OFF_TBJ, job.max(0) as usize * 5 + JB_HP) } else { 1.0 };
    let jd_dmg = if is_civ(race) { f64_at(OFF_TBJ, job.max(0) as usize * 5 + JB_DMG) } else { 1.0 };
    let jd_spd = if is_civ(race) { f64_at(OFF_TBJ, job.max(0) as usize * 5 + JB_SPD) } else { 1.0 };

    // 科技快照
    let (t_hp, t_dmg) = if is_civ(race) && civ >= 0 {
        (f64_at(OFF_CVTECH, civ as usize * 24 + TC_HP), f64_at(OFF_CVTECH, civ as usize * 24 + TC_DMG))
    } else {
        (1.0, 1.0)
    };
    let gov15 = if civ >= 0 && i32_at(OFF_CVGOV, civ as usize) == 4 { 1.15 } else { 1.0 };

    let max_hp = js_round(f64_at(OFF_TBR, race * 12 + RB_HP) * td_hp * jd_hp * t_hp * gene[2]);
    let dmg = f64_at(OFF_TBR, race * 12 + RB_DMG) * td_dmg * jd_dmg * t_dmg * gov15 * gene[1];
    let speed = f64_at(OFF_TBR, race * 12 + RB_SPEED) * td_spd * jd_spd * gene[0];
    let id = u32_at(OFF_USEQ, 0);
    set_u32_at(OFF_USEQ, 0, id + 1);
    let max_age = f64_at(OFF_TBR, race * 12 + RB_MAXAGE) * (0.8 + rng_next() * 0.4);
    let flip = rng_next() < 0.5;
    let (name, name_len, _) = unique_name(race, usize::MAX);
    let breath = 120.0 + (rng_next() * 160.0).floor();

    let slot = arena_append();
    if slot == usize::MAX {
        return usize::MAX;
    }
    let s = slot;
    set_u32_at(OFF_UID, s, id);
    set_u32_at(OFF_URACE, s, race as u32);
    set_i32_at(OFF_UCIV, s, civ);
    set_f64_at(OFF_UX, s, x);
    set_f64_at(OFF_UY, s, y);
    set_f64_at(OFF_ULX, s, x);
    set_f64_at(OFF_ULY, s, y);
    set_f64_at(OFF_UTX, s, x);
    set_f64_at(OFF_UTY, s, y);
    set_f64_at(OFF_UHP, s, max_hp as f64);
    set_f64_at(OFF_UMAXHP, s, max_hp as f64);
    set_f64_at(OFF_UDMG, s, dmg);
    set_f64_at(OFF_USPEED, s, speed);
    set_f64_at(OFF_UAGE, s, 0.0);
    set_f64_at(OFF_UMAXAGE, s, max_age);
    set_f64_at(OFF_UKILLS, s, 0.0);
    set_f64_at(OFF_UCD, s, 0.0);
    set_i32_at(OFF_UTRAIT, s, trait_id);
    set_i32_at(OFF_UJOB, s, if is_civ(race) { job } else { -1 });
    set_u8_at(OFF_UINF, s, infected as u8);
    set_u8_at(OFF_UFLIP, s, flip as u8);
    set_f64_at(OFF_UBREATH, s, breath);
    set_u8_at(OFF_UPAR, s, ((id + 1) % 2) as u8); // JS: parity = unitSeq%2（id 为自增前值）
    set_u8_at(OFF_UDEAD, s, 0);
    set_f64_at(OFF_UHURT, s, 0.0);
    for k in 0..4 {
        set_f64_at(OFF_UGENE, s * 4 + k, gene[k]);
    }
    for k in 0..32 {
        set_u8_at(OFF_UNAME, s * 32 + k, name[k]);
    }
    set_u8_at(OFF_UNAME, s * 32 + 31, name_len);
    for k in 0..7 {
        set_i32_at(OFF_UGEAR, s * 7 + k, -1);
    }
    set_i32_at(OFF_UGLN, s, -1);
    set_i32_at(OFF_UFAM, s, -1);
    set_i32_at(OFF_UFGN, s, -1);
    set_f64_at(OFF_UFD, s, f64::NAN);
    set_f64_at(OFF_UCVN, s, f64::NAN);
    set_i32_at(OFF_UARMY, s, -1);
    set_u8_at(OFF_UHASPANIC, s, 0);
    set_u8_at(OFF_UBOAT, s, 0);
    set_i32_at(OFF_UBTL, s, 0);
    set_u32_at(OFF_UCELL, s, calc_cell(x, y, ctx.bw, ctx.bh));
    // 瞬态字段清零（行可能残留上一世界数据）
    set_i32_at(OFF_USTK, s, i32::MIN); // undefined 哨兵
    set_f64_at(OFF_UATK, s, f64::NAN);
    set_f64_at(OFF_UCHILL, s, f64::NAN);
    set_f64_at(OFF_UFLEET, s, f64::NAN);
    set_f64_at(OFF_UBLESS, s, f64::NAN);
    set_f64_at(OFF_UCURSE, s, f64::NAN);
    set_f64_at(OFF_UFERT, s, f64::NAN);
    set_f64_at(OFF_UDETOUR, s, f64::NAN);
    set_f64_at(OFF_USXK, s, f64::NAN);
    set_f64_at(OFF_USYK, s, f64::NAN);
    // tDmg/tHp 存 UATK/UCHILL? 不 —— 放 USTK? 不可（语义）。放 UGENE 后? 简化：TS 写回时从 SPAWN 动作读
    // （SPAWN 动作携带 tDmg/tHp）

    if civ >= 0 && (civ as usize) < i32_at(OFF_CIVN, 0).max(0) as usize {
        civ_delta(ctx, 0, civ, 1.0);
    }
    if !is_civ(race) {
        bump_wild(race, 1);
    }

    // —— 家族 ——
    let mut fam_final = fam;
    if fam >= 0 {
        set_i32_at(OFF_UFAM, s, fam);
        set_i32_at(OFF_UFGN, s, if fgn >= 0 { fgn } else { 1 });
        let row = family_find(fam);
        if row >= 0 {
            let m = f64_at(OFF_FMNUM, row as usize * 6) + 1.0;
            set_f64_at(OFF_FMNUM, row as usize * 6, m);
            family_milestone(ctx, row as usize);
            if let Some(p) = ctx.act_reserve(16) {
                ctx.act_u8(p, ACT_FAM_MILE);
                ctx.act_i32(p + 4, fam);
            }
        }
    } else if !is_undead(race) && rng_next() < 0.06 {
        let nid = new_family(ctx, race, s);
        if nid >= 0 {
            fam_final = nid;
            set_i32_at(OFF_UFAM, s, nid);
            set_i32_at(OFF_UFGN, s, 1);
        }
    }

    dirty(s);

    // —— SPAWN 动作（TS 构造 JS Unit 对象；全字段预计算，0 rng）——
    if let Some(p) = ctx.act_reserve(256) {
        ctx.act_u8(p, ACT_SPAWN);
        ctx.act_u32(p + 4, id);
        ctx.act_u32(p + 8, race as u32);
        ctx.act_i32(p + 12, civ);
        ctx.act_f64(p + 16, x);
        ctx.act_f64(p + 24, y);
        ctx.act_f64(p + 32, max_hp as f64);
        ctx.act_f64(p + 40, dmg);
        ctx.act_f64(p + 48, speed);
        ctx.act_f64(p + 56, max_age);
        ctx.act_f64(p + 64, breath);
        ctx.act_i32(p + 72, trait_id);
        ctx.act_i32(p + 76, if is_civ(race) { job } else { -1 });
        ctx.act_u8(p + 80, flip as u8);
        ctx.act_u8(p + 81, ((id + 1) % 2) as u8);
        ctx.act_u8(p + 82, infected as u8);
        ctx.act_i32(p + 84, fam_final);
        ctx.act_i32(p + 88, i32_at(OFF_UFGN, s));
        ctx.act_f64(p + 96, t_dmg);
        ctx.act_f64(p + 104, t_hp);
        ctx.act_f64(p + 112, gene[0]);
        ctx.act_f64(p + 120, gene[1]);
        ctx.act_f64(p + 128, gene[2]);
        ctx.act_f64(p + 136, gene[3]);
        ctx.act_u8(p + 144, name_len);
        for k in 0..32 {
            ctx.act_u8(p + 145 + k, name[k]);
        }
    }
    s
}

// ---------------- updateBoat（4299-4354） ----------------
fn update_boat(ctx: &mut Ctx, s: usize) -> Result<(), u32> {
    let age = f64_at(OFF_UAGE, s) + 2.0 / 40.0;
    set_f64_at(OFF_UAGE, s, age);
    if age > f64_at(OFF_UMAXAGE, s) {
        set_u8_at(OFF_UDEAD, s, 1);
        dirty(s);
        return Ok(());
    }
    let ttl = i32_at(OFF_UBTL, s) - 1;
    set_i32_at(OFF_UBTL, s, ttl);

    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let tx = f64_at(OFF_UTX, s);
    let ty = f64_at(OFF_UTY, s);
    let dx = tx - ux;
    let dy = ty - uy;
    let _d = fd_hypot(dx, dy);

    if ttl <= 0 {
        if ttl <= -600 {
            set_u8_at(OFF_UDEAD, s, 1);
            dirty(s);
            fx(ctx, FX_SKULL, ux, uy, 46.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
            if let Some(p) = ctx.act_reserve(48) {
                ctx.act_u8(p, ACT_EVT);
                ctx.act_u8(p + 1, EVT_SHIPWRECK);
                ctx.act_f64(p + 32, ux);
                ctx.act_f64(p + 40, uy);
            }
            return Ok(());
        }
        let (found, lx, ly) = find_land_near(ux, uy, 14);
        if found {
            set_f64_at(OFF_UTX, s, lx);
            set_f64_at(OFF_UTY, s, ly);
        }
    }

    let base_ang = fd_atan2(f64_at(OFF_UTY, s) - uy, f64_at(OFF_UTX, s) - ux);
    let ahead_x = (ux + fd_cos(base_ang) * 0.4).floor() as i32;
    let ahead_y = (uy + fd_sin(base_ang) * 0.4).floor() as i32;
    let ahead_blocked = ahead_x < 0 || ahead_y < 0 || ahead_x >= W || ahead_y >= H || !t_is_water(u8_at(OFF_TERR, idx(ahead_x, ahead_y)));
    if ahead_blocked {
        let (found, cx2, cy2) = find_land_near(ux, uy, 2);
        if found {
            set_f64_at(OFF_UTX, s, cx2);
            set_f64_at(OFF_UTY, s, cy2);
        }
    }
    if fd_hypot(f64_at(OFF_UTX, s) - ux, f64_at(OFF_UTY, s) - uy) < 2.5 {
        match disembark(ctx, s) {
            Ok(true) => return Ok(()),
            Ok(false) => {
                if i32_at(OFF_UBTL, s) > 0 {
                    let (found, lx, ly) = find_land_near(f64_at(OFF_UTX, s), f64_at(OFF_UTY, s), 6);
                    if found {
                        set_f64_at(OFF_UTX, s, lx);
                        set_f64_at(OFF_UTY, s, ly);
                    }
                }
            }
            Err(e) => return Err(e),
        }
    }

    let step = 0.26;
    for off in [0.0f64, 0.7, -0.7, 1.4, -1.4, 2.6, -2.6, core::f64::consts::PI] {
        let ang = base_ang + off;
        let nx = ux + fd_cos(ang) * step;
        let ny = uy + fd_sin(ang) * step;
        if nx < 1.0 || ny < 1.0 || nx > W as f64 - 2.0 || ny > H as f64 - 2.0 {
            continue;
        }
        if !t_is_water(u8_at(OFF_TERR, idx(nx.floor() as i32, ny.floor() as i32))) {
            continue;
        }
        set_f64_at(OFF_UX, s, nx);
        set_f64_at(OFF_UY, s, ny);
        if fd_cos(ang) != 0.0 {
            set_u8_at(OFF_UFLIP, s, (fd_cos(ang) < 0.0) as u8);
        }
        dirty(s);
        return Ok(());
    }
    dirty(s);
    Ok(())
}

/// disembark：Ok(true) 登陆成功 / Ok(false) 无岸 / Err(5) 需殖民建城（BAIL）
fn disembark(ctx: &mut Ctx, s: usize) -> Result<bool, u32> {
    let x = f64_at(OFF_UX, s).floor() as i32;
    let y = f64_at(OFF_UY, s).floor() as i32;
    let uciv = i32_at(OFF_UCIV, s);
    let mut best: i32 = -1;
    let mut best_score = 0i32;
    let mut dy = -1;
    while dy <= 1 {
        let mut dx = -1;
        while dx <= 1 {
            if dx == 0 && dy == 0 {
                dx += 1;
                continue;
            }
            let xx = x + dx;
            let yy = y + dy;
            if xx < 0 || yy < 0 || xx >= W || yy >= H {
                dx += 1;
                continue;
            }
            let i = idx(xx, yy);
            let t = u8_at(OFF_TERR, i);
            if t_is_water(t) || t == T_MOUNTAIN || t == T_LAVA {
                dx += 1;
                continue;
            }
            let mut score = 0i32;
            let owner = i16_at(OFF_OWN, i);
            let buildable = u8_at(OFF_TBT, t as usize) & 8 != 0;
            if owner == -1 && u8_at(OFF_BLDK, i) == 0 && buildable {
                score = 3;
            } else if owner == uciv as i16 && uciv >= 0 {
                score = 2;
            } else if uciv >= 0 && owner >= 0 && owner as i32 != uciv && at_war(uciv, owner as i32) {
                score = 1;
            }
            if score > best_score {
                best_score = score;
                best = i as i32;
            }
            dx += 1;
        }
        dy += 1;
    }
    if best < 0 {
        return Ok(false);
    }
    let lx = tile_x(best as usize) as f64 + 0.5;
    let ly = tile_y(best as usize) as f64 + 0.5;
    let was_colonist = best_score == 3;
    set_u8_at(OFF_UBOAT, s, 0);
    set_i32_at(OFF_UBTL, s, 0);
    set_f64_at(OFF_UX, s, lx);
    set_f64_at(OFF_UY, s, ly);
    set_f64_at(OFF_UTX, s, lx);
    set_f64_at(OFF_UTY, s, ly);
    dirty(s);
    fx(ctx, FX_SPAWN, lx, ly, 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
    if was_colonist {
        // foundSettlement 级联 → BAIL（data: tile）
        set_f64_at(OFF_BAILP, 0, best as f64);
        return Err(BAIL_BOAT_SETTLE);
    }
    Ok(true)
}

// ---------------- updateUnit 主体（2370-3147 位精确移植） ----------------
/// 返回 Err(bail) 时：BAIL 区已填好（含 slot），上层停止批处理
fn update_unit(ctx: &mut Ctx, s: usize) -> Result<(), u32> {
    let race = u32_at(OFF_URACE, s) as usize;
    let fxp = u8_at(OFF_FXP, 0);
    let laws = u8_at(OFF_LAWS, 0);

    // hurt--（L2372）
    if f64_at(OFF_UHURT, s) > 0.0 {
        set_f64_at(OFF_UHURT, s, f64_at(OFF_UHURT, s) - 1.0);
    }
    // 殖民船分流（L2374）——BAIL：TS 从 updateUnit 接管（hurt 已减）
    if u8_at(OFF_UBOAT, s) != 0 {
        return Err(BAIL_BOAT);
    }
    dirty(s);

    // age（L2378）
    let age = f64_at(OFF_UAGE, s) + 2.0 / 40.0;
    set_f64_at(OFF_UAGE, s, age);
    if age > f64_at(OFF_UMAXAGE, s) {
        if laws & LAW_UNDEAD_RISE != 0 && is_civ(race) && rng_next() < 0.08 {
            rise_skeleton(ctx, f64_at(OFF_UX, s), f64_at(OFF_UY, s));
        }
        set_u8_at(OFF_UDEAD, s, 1);
        return Ok(());
    }
    // cd / atk / chill（L2384-2387）
    if f64_at(OFF_UCD, s) > 0.0 {
        set_f64_at(OFF_UCD, s, f64_at(OFF_UCD, s) - 2.0);
    }
    if truthy_f(f64_at(OFF_UATK, s)) {
        set_f64_at(OFF_UATK, s, f64_at(OFF_UATK, s) - 2.0);
    }
    if truthy_f(f64_at(OFF_UCHILL, s)) {
        set_f64_at(OFF_UCHILL, s, f64_at(OFF_UCHILL, s) - 1.0);
    }
    // fleeT（L2388）
    if truthy_f(f64_at(OFF_UFLEET, s)) {
        set_f64_at(OFF_UFLEET, s, f64_at(OFF_UFLEET, s) - 2.0);
        if f64_at(OFF_UFLEET, s) <= 0.0 {
            if u8_at(OFF_COLEN, 0) != 0 {
                if let Some(p) = ctx.act_reserve(16) {
                    ctx.act_u8(p, ACT_TELEM);
                    ctx.act_u8(p + 1, TL_FLEE_END);
                    ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                    ctx.act_i32(p + 8, i32_at(OFF_TICK, 0));
                }
            }
        }
    }
    // bless（L2394）
    if truthy_f(f64_at(OFF_UBLESS, s)) {
        set_f64_at(OFF_UBLESS, s, f64_at(OFF_UBLESS, s) - 2.0);
        let hp = f64_at(OFF_UHP, s);
        let maxhp = f64_at(OFF_UMAXHP, s);
        if hp > 0.0 && hp < maxhp {
            set_f64_at(OFF_UHP, s, js_min(maxhp, hp + 0.06));
        }
        if fxp & FXP_AMB != 0 && rng_next() < 0.02 {
            fx(ctx, FX_BLESS, f64_at(OFF_UX, s), f64_at(OFF_UY, s) - 0.6, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
        }
    }
    // curse（L2399）
    if truthy_f(f64_at(OFF_UCURSE, s)) {
        set_f64_at(OFF_UCURSE, s, f64_at(OFF_UCURSE, s) - 2.0);
        set_f64_at(OFF_UHP, s, f64_at(OFF_UHP, s) - 0.05);
        set_f64_at(OFF_UHURT, s, js_max(f64_at(OFF_UHURT, s), 4.0));
        if fxp & FXP_AMB != 0 && rng_next() < 0.02 {
            fx(ctx, FX_CURSE, f64_at(OFF_UX, s), f64_at(OFF_UY, s) - 0.6, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
        }
    }
    // fert / detour（L2405/2408）
    if truthy_f(f64_at(OFF_UFERT, s)) {
        set_f64_at(OFF_UFERT, s, f64_at(OFF_UFERT, s) - 2.0);
    }
    if truthy_f(f64_at(OFF_UDETOUR, s)) {
        set_f64_at(OFF_UDETOUR, s, f64_at(OFF_UDETOUR, s) - 2.0);
    }
    // 恐慌衰减（L2410）
    if u_has_panic(s) {
        let p = f64_at(OFF_UPANIC, s) - ep(EP_PANIC_DECAY);
        if p <= 0.0 {
            clear_panic(s);
        } else {
            set_f64_at(OFF_UPANIC, s, p);
        }
    }
    // 血仇衰减（L2414）
    let gl = u_glen(s);
    if gl >= 0 {
        let mut alive = false;
        let mut gi = 0usize;
        while gi < u_glen(s).max(0) as usize {
            let v = f64_at(OFF_UGVAL, s * UG_CAP + gi) - ep(EP_GRUDGE_DECAY);
            set_f64_at(OFF_UGVAL, s * UG_CAP + gi, v);
            if v < 0.3 {
                // JS splice(gi)：前移 + 长度减一；gi 不增（下轮处理移入者）
                let len = u_glen(s) as usize;
                let mut m = gi;
                while m + 1 < len {
                    set_i32_at(OFF_UGIDS, s * UG_CAP + m, i32_at(OFF_UGIDS, s * UG_CAP + m + 1));
                    set_f64_at(OFF_UGVAL, s * UG_CAP + m, f64_at(OFF_UGVAL, s * UG_CAP + m + 1));
                    m += 1;
                }
                set_i32_at(OFF_UGLN, s, (len - 1) as i32);
            } else {
                alive = true;
                gi += 1;
            }
        }
        if u_glen(s) == 0 {
            set_i32_at(OFF_UGLN, s, -1); // JS: !alive → undefined
        }
        dirty(s);
    }
    // 卡死自愈（L2426-2447）
    {
        let ux = f64_at(OFF_UX, s);
        let uy = f64_at(OFF_UY, s);
        let fdx = f64_at(OFF_UTX, s) - ux;
        let fdy = f64_at(OFF_UTY, s) - uy;
        let far_t = fdx * fdx + fdy * fdy > 6.25;
        if far_t {
            let sxk = f64_at(OFF_USXK, s);
            let syk = f64_at(OFF_USYK, s);
            if sxk.is_nan() || syk.is_nan() {
                set_f64_at(OFF_USXK, s, ux);
                set_f64_at(OFF_USYK, s, uy);
            }
            let sdx = ux - f64_at(OFF_USXK, s);
            let sdy = uy - if f64_at(OFF_USYK, s).is_nan() { uy } else { f64_at(OFF_USYK, s) };
            if sdx * sdx + sdy * sdy > 0.64 {
                set_i32_at(OFF_USTK, s, 0);
                set_f64_at(OFF_USXK, s, ux);
                set_f64_at(OFF_USYK, s, uy);
            } else {
                let stk = if i32_at(OFF_USTK, s) == i32::MIN { 0 } else { i32_at(OFF_USTK, s) } + 1;
                set_i32_at(OFF_USTK, s, stk);
                if stk > 36 {
                    set_i32_at(OFF_USTK, s, 0);
                    set_f64_at(OFF_USXK, s, ux);
                    set_f64_at(OFF_USYK, s, uy);
                    set_f64_at(OFF_UDETOUR, s, 60.0);
                    set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, ux + (rng_next() * 2.0 - 1.0) * 9.0)));
                    set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, uy + (rng_next() * 2.0 - 1.0) * 9.0)));
                }
            }
        } else if i32_at(OFF_USTK, s) != 0 && i32_at(OFF_USTK, s) != i32::MIN {
            set_i32_at(OFF_USTK, s, 0);
            set_f64_at(OFF_USXK, s, ux);
            set_f64_at(OFF_USYK, s, uy);
        }
    }
    // 地形伤害（L2449-2453）
    let ti = idx(f64_at(OFF_UX, s).floor() as i32, f64_at(OFF_UY, s).floor() as i32);
    if u8_at(OFF_FIREG, ti) > 0 && race_flag2(race) & RF2_LAVAIMM == 0 {
        set_f64_at(OFF_UHP, s, f64_at(OFF_UHP, s) - ep(EP_FIRE_DMG));
        set_f64_at(OFF_UHURT, s, 20.0);
    }
    if u8_at(OFF_RAD, ti) > 0 {
        set_f64_at(OFF_UHP, s, f64_at(OFF_UHP, s) - 0.5);
        set_f64_at(OFF_UHURT, s, 20.0);
    }
    if u8_at(OFF_TERR, ti) == T_LAVA && race_flag2(race) & RF2_LAVAIMM == 0 {
        set_f64_at(OFF_UHP, s, f64_at(OFF_UHP, s) - 15.0);
        set_f64_at(OFF_UHURT, s, 20.0);
    }
    if race_flag(race) & 32 == 0 /* !flying */ && u8_at(OFF_TBF, race * 2) & 64 == 0 /* !aquatic */ && race != R_WHITEWALKER && t_is_water(u8_at(OFF_TERR, ti)) {
        set_f64_at(OFF_UHP, s, f64_at(OFF_UHP, s) - 4.0);
        set_f64_at(OFF_UHURT, s, 20.0);
    }
    // 感染（L2454）
    if u8_at(OFF_UINF, s) != 0 {
        set_f64_at(OFF_UHP, s, f64_at(OFF_UHP, s) - 0.15);
        if rng_next() < 0.02 {
            spread_plague(ctx, s);
        }
    }
    // 再生（L2459）
    {
        let hp = f64_at(OFF_UHP, s);
        let maxhp = f64_at(OFF_UMAXHP, s);
        if hp > 0.0 && hp < maxhp {
            let gb = if is_civ(race) { Some(gear_bonus(s)) } else { None };
            let tr = i32_at(OFF_UTRAIT, s);
            let mut rg = if tr >= 0 { f64_at(OFF_TRREG, tr as usize) } else { 0.0 };
            if let Some(g) = gb.as_ref() {
                rg += g.regen;
            }
            if race == 21 {
                rg += 0.35; // TROLL
            }
            if rg > 0.0 {
                set_f64_at(OFF_UHP, s, js_min(maxhp, hp + rg));
            }
        }
    }
    // 捕食者饥饿（L2465）
    if is_predator(race) && !is_undead(race) {
        let food = u_food0(s) - 1.0;
        set_f64_at(OFF_UFD, s, food);
        if food <= 0.0 {
            set_f64_at(OFF_UHP, s, f64_at(OFF_UHP, s) - 1.4);
            set_f64_at(OFF_UHURT, s, js_max(f64_at(OFF_UHURT, s), 3.0));
        }
    }
    // 白行者寒霜（L2470-2484）
    if race == R_WHITEWALKER {
        if rng_next() < 0.08 {
            let jx = (f64_at(OFF_UX, s) + rng_next() * 3.0 - 1.5).floor() as i32;
            let jy = (f64_at(OFF_UY, s) + rng_next() * 3.0 - 1.5).floor() as i32;
            if jx >= 0 && jy >= 0 && jx < W && jy < H {
                let j = idx(jx, jy);
                let t = u8_at(OFF_TERR, j);
                if t == T_GRASS || t == T_BURNT || t == T_SAND {
                    set_terrain(ctx, j, T_SNOW);
                } else if t == T_FOREST && rng_next() < 0.4 {
                    set_terrain(ctx, j, T_SNOW);
                } else if t_is_water(t) && rng_next() < 0.5 {
                    set_terrain(ctx, j, T_ICE);
                }
                if u8_at(OFF_FIREG, j) > 0 {
                    set_u8_at(OFF_FIREG, j, 0);
                    let n = i32_at(OFF_FIREN, 0);
                    if n > 0 {
                        set_i32_at(OFF_FIREN, 0, n - 1);
                    }
                    if let Some(p) = ctx.act_reserve(5) {
                        ctx.act_u8(p, ACT_FIRE_CLEAR);
                        ctx.act_i32(p + 1, j as i32);
                    }
                }
            }
        }
        if t_is_water(u8_at(OFF_TERR, ti)) && rng_next() < 0.6 {
            set_terrain(ctx, ti, T_ICE);
        }
    }
    if f64_at(OFF_UHP, s) <= 0.0 {
        set_u8_at(OFF_UDEAD, s, 1);
        return Ok(());
    }

    // —— 扫描（L2487-2549）——
    let ux = f64_at(OFF_UX, s);
    let uy = f64_at(OFF_UY, s);
    let upanic = u_panic0(s);
    let contagious = upanic > 0.55 && rng_next() < 0.2;
    let cx = js_min(ctx.bw as f64 - 1.0, js_max(0.0, (ux / 4.0).floor())) as i32;
    let cy = js_min(ctx.bh as f64 - 1.0, js_max(0.0, (uy / 4.0).floor())) as i32;
    let sc = bucket_scan(ctx, s, contagious, cx, cy, ux, uy);
    let enemy = if sc.enemy >= 0 { sc.enemy as usize } else { usize::MAX };
    let best_d = sc.best_d;
    let enemy_d = sc.enemy_d;
    let allies = sc.allies;
    let foes = sc.foes;

    // 商队遇敌逃逸（L2551）
    if enemy != usize::MAX && u_caravan0(s) > 0.0 {
        let ex = f64_at(OFF_UX, enemy);
        let ey = f64_at(OFF_UY, enemy);
        let ang = fd_atan2(f64_at(OFF_UY, s) - ey, f64_at(OFF_UX, s) - ex);
        set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + fd_cos(ang) * 4.0)));
        set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + fd_sin(ang) * 4.0)));
        move_unit(ctx, s, 1.15);
        return Ok(());
    }
    // 脱离冷却逃逸（L2562）
    if enemy != usize::MAX && f64_at(OFF_UFLEET, s) > 0.0 {
        let ang = fd_atan2(f64_at(OFF_UY, s) - f64_at(OFF_UY, enemy), f64_at(OFF_UX, s) - f64_at(OFF_UX, enemy));
        set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + fd_cos(ang) * 5.0)));
        set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + fd_sin(ang) * 5.0)));
        move_unit(ctx, s, if u_panic0(s) >= 0.5 { 1.32 } else { 1.18 });
        return Ok(());
    }
    // 恐慌溃逃（L2572）
    if enemy != usize::MAX && u_panic0(s) >= ep(EP_PANIC_ROUT) && i32_at(OFF_UARMY, s) < 0 && !is_undead(race) {
        set_f64_at(OFF_UFLEET, s, 60.0);
        let ang = fd_atan2(f64_at(OFF_UY, s) - f64_at(OFF_UY, enemy), f64_at(OFF_UX, s) - f64_at(OFF_UX, enemy));
        set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + fd_cos(ang) * 5.0)));
        set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + fd_sin(ang) * 5.0)));
        move_unit(ctx, s, 1.3);
        return Ok(());
    }
    // 战或逃神经（L2584）
    if enemy != usize::MAX && (!is_civ(race) || is_hostile(race)) && !is_undead(race) {
        let mut my_pow = f64_at(OFF_UDMG, s) + f64_at(OFF_UHP, s) / 8.0;
        let gl2 = u_glen(s);
        if gl2 > 0 {
            let eid = u32_at(OFF_UID, enemy);
            let mut gi = -1i32;
            for t in 0..gl2 as usize {
                if i32_at(OFF_UGIDS, s * UG_CAP + t) as u32 == eid {
                    gi = t as i32;
                    break;
                }
            }
            if gi >= 0 {
                my_pow *= 1.0 + 0.2 * js_min(1.0, f64_at(OFF_UGVAL, s * UG_CAP + gi as usize) / 2.0);
            }
        }
        let foe_pow = f64_at(OFF_UDMG, enemy) + f64_at(OFF_UHP, enemy) / 8.0;
        let mut f = [0f64; 9];
        f[0] = js_max(0.0, f64_at(OFF_UHP, s)) / f64_at(OFF_UMAXHP, s);
        f[1] = if is_predator(race) { js_max(0.0, js_min(1.0, 1.0 - u_food0(s) / 160.0)) } else { 0.5 };
        f[2] = my_pow / (my_pow + foe_pow);
        f[3] = js_max(0.0, f64_at(OFF_UHP, enemy)) / f64_at(OFF_UMAXHP, enemy);
        f[4] = js_min(12.0, enemy_d) / 12.0;
        f[5] = if is_herbivore(u32_at(OFF_URACE, enemy) as u32) { 1.0 } else { 0.0 };
        f[6] = js_min(3.0, js_max(0.0, foes as f64 - 1.0)) / 3.0;
        f[7] = if u8_at(OFF_MLOOT, race) != 0 { 1.0 } else { 0.0 };
        f[8] = js_min(20.0, f64_at(OFF_UKILLS, s)) / 20.0;
        let (fl_act, l0, l1) = neuro_flight(&f);
        if u8_at(OFF_COLEN, 0) != 0 {
            if let Some(p) = ctx.act_reserve(104) {
                ctx.act_u8(p, ACT_TELEM);
                ctx.act_u8(p + 1, TL_DECISION);
                ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                ctx.act_i32(p + 8, i32_at(OFF_TICK, 0));
                for k in 0..9 {
                    ctx.act_f64(p + 16 + k * 8, f[k]);
                }
                ctx.act_u8(p + 88, fl_act as u8);
                ctx.act_f64(p + 96, l0);
            }
        }
        if fl_act == 1 {
            set_f64_at(OFF_UFLEET, s, 40.0);
            let ang = fd_atan2(f64_at(OFF_UY, s) - f64_at(OFF_UY, enemy), f64_at(OFF_UX, s) - f64_at(OFF_UX, enemy));
            set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + fd_cos(ang) * 5.0)));
            set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + fd_sin(ang) * 5.0)));
            move_unit(ctx, s, 1.2);
            return Ok(());
        }
    }

    let mut skip_tail = false;
    let uciv = i32_at(OFF_UCIV, s);
    if enemy != usize::MAX {
        // —— 接敌战斗树（L2614-2875；无 return 的子路径落入 POST）——
        let erace = u32_at(OFF_URACE, enemy) as usize;
        let rd_range = f64_at(OFF_TBR, race * 12 + RB_RNG_RANGE);
        let rd_dmg = f64_at(OFF_TBR, race * 12 + RB_RNG_DMG);
        let rd_cd = f64_at(OFF_TBR, race * 12 + RB_RNG_CD);
        let has_rd = rd_range != 0.0;
        let job = u_job0(s);
        let uciv = i32_at(OFF_UCIV, s);
        let job_ranged = if job == 3 { f64_at(OFF_TBJ, 3 * 5 + JB_RNG) } else { 0.0 };
        let gear_rng = if is_civ(race) { gear_bonus(s).ranged } else { 0.0 };
        let tech_rng = if is_civ(race) && uciv >= 0 { f64_at(OFF_CVTECH, uciv as usize * 24 + TC_RANGE) } else { 0.0 };
        let bow_range = (if job_ranged != 0.0 { job_ranged } else { gear_rng }) + tech_rng;

        // 姿态网络
        let mut my_pow = f64_at(OFF_UDMG, s) + f64_at(OFF_UHP, s) / 8.0;
        let gl2 = u_glen(s);
        if gl2 > 0 {
            let eid = u32_at(OFF_UID, enemy);
            let mut gi = -1i32;
            for t in 0..gl2 as usize {
                if i32_at(OFF_UGIDS, s * UG_CAP + t) as u32 == eid {
                    gi = t as i32;
                    break;
                }
            }
            if gi >= 0 {
                my_pow *= 1.0 + 0.2 * js_min(1.0, f64_at(OFF_UGVAL, s * UG_CAP + gi as usize) / 2.0);
            }
        }
        let foe_pow = f64_at(OFF_UDMG, enemy) + f64_at(OFF_UHP, enemy) / 8.0;
        let reach = f64_at(OFF_TBR, race * 12 + RB_REACH);
        let reach = if reach == 0.0 { 0.9 } else { reach };
        let mut fs = [0f64; 12];
        fs[0] = js_min(12.0, enemy_d) / 12.0;
        fs[1] = js_max(0.0, f64_at(OFF_UHP, s)) / f64_at(OFF_UMAXHP, s);
        fs[2] = js_max(0.0, f64_at(OFF_UHP, enemy)) / f64_at(OFF_UMAXHP, enemy);
        fs[3] = if has_rd || bow_range > 0.0 { 1.0 } else { 0.0 };
        fs[4] = js_min(8.0, if has_rd { rd_range } else { bow_range }) / 8.0;
        fs[5] = js_min(2.0, reach) / 2.0;
        fs[6] = if has_rd { 1.0 } else { 0.0 };
        fs[7] = my_pow / (my_pow + foe_pow);
        fs[8] = js_min(4.0, allies as f64) / 4.0;
        fs[9] = if i32_at(OFF_UARMY, s) >= 0 { 1.0 } else { 0.0 };
        fs[10] = if is_civ(race) { 1.0 } else { 0.0 };
        fs[11] = js_min(20.0, f64_at(OFF_UKILLS, s)) / 20.0;
        let stance = neuro_stance(&fs);

        if stance == 3 {
            set_f64_at(OFF_UFLEET, s, 50.0);
            let ang = fd_atan2(f64_at(OFF_UY, s) - f64_at(OFF_UY, enemy), f64_at(OFF_UX, s) - f64_at(OFF_UX, enemy));
            set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + fd_cos(ang) * 6.0)));
            set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + fd_sin(ang) * 6.0)));
            move_unit(ctx, s, 1.15);
            return Ok(());
        }
        let wep = i32_at(OFF_UGEAR, s * 7 + 0);
        if has_rd && enemy_d > 1.6 && enemy_d <= rd_range {
            // 法师火球
            if f64_at(OFF_UCD, s) <= 0.0 {
                set_f64_at(OFF_UCD, s, rd_cd);
                set_f64_at(OFF_UATK, s, 10.0);
                let tx = f64_at(OFF_UX, enemy) + rng_next() * 0.6 - 0.3;
                let ty = f64_at(OFF_UY, enemy) + rng_next() * 0.6 - 0.3;
                fx(ctx, FX_FIREBALL, js_max(0.5, js_min(W as f64 - 0.5, tx)), js_max(0.5, js_min(H as f64 - 0.5, ty)), 16.0, rd_dmg, f64_at(OFF_UX, s), f64_at(OFF_UY, s), rd_dmg, -1, false, TXT_NONE, 0, true);
            }
            if stance == 2 {
                let ang = fd_atan2(f64_at(OFF_UY, s) - f64_at(OFF_UY, enemy), f64_at(OFF_UX, s) - f64_at(OFF_UX, enemy));
                set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + fd_cos(ang) * 3.0)));
                set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + fd_sin(ang) * 3.0)));
                move_unit(ctx, s, 0.6);
            }
        } else if bow_range > 0.0 && enemy_d > 1.4 && enemy_d <= bow_range {
            // 弓手/火枪
            let gun = wep >= 0 && item_is_gun(wep);
            let beam = wep >= 0 && item_is_beam(wep);
            if f64_at(OFF_UCD, s) <= 0.0 {
                set_f64_at(OFF_UCD, s, if beam { 12.0 } else if gun { 15.0 } else { 18.0 });
                set_f64_at(OFF_UATK, s, 10.0);
                let mul = if is_civ(race) && uciv >= 0 { f64_at(OFF_CVTECH, uciv as usize * 24 + TC_ARCHER) } else { 1.0 };
                // 弹道预测
                let ttl = if beam { 8.0 } else if gun { 5.0 } else { 12.0 };
                let elx = f64_at(OFF_ULX, enemy);
                let ely = f64_at(OFF_ULY, enemy);
                let vx = f64_at(OFF_UX, enemy) - if elx.is_nan() { f64_at(OFF_UX, enemy) } else { elx };
                let vy = f64_at(OFF_UY, enemy) - if ely.is_nan() { f64_at(OFF_UY, enemy) } else { ely };
                let aim_x = js_max(0.5, js_min(W as f64 - 0.5, f64_at(OFF_UX, enemy) + vx * ttl + rng_next() * 0.4 - 0.2));
                let aim_y = js_max(0.5, js_min(H as f64 - 0.5, f64_at(OFF_UY, enemy) + vy * ttl + rng_next() * 0.4 - 0.2));
                let dmg = f64_at(OFF_UDMG, s) * mul;
                let kind = if beam { FX_LASER } else if gun { FX_BULLET } else { FX_ARROW };
                let d2 = if beam { f64_at(OFF_UDMG, s) * 0.75 * mul } else { dmg };
                fx(ctx, kind, aim_x, aim_y, if beam { 8.0 } else if gun { 5.0 } else { 12.0 }, 1.0, f64_at(OFF_UX, s), f64_at(OFF_UY, s), d2, uciv, false, TXT_NONE, 0, true);
                if !beam && gun && rng_next() < 0.12 {
                    if let Some(p) = ctx.act_reserve(8) {
                        ctx.act_u8(p, ACT_SND);
                        ctx.act_u8(p + 1, SND_PLACE);
                    }
                }
            }
            if stance == 2 {
                let ang = fd_atan2(f64_at(OFF_UY, s) - f64_at(OFF_UY, enemy), f64_at(OFF_UX, s) - f64_at(OFF_UX, enemy));
                set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + fd_cos(ang) * 3.0)));
                set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + fd_sin(ang) * 3.0)));
                move_unit(ctx, s, 0.7);
            }
        } else if enemy_d < reach {
            // 近战
            if f64_at(OFF_UCD, s) <= 0.0 {
                let wspeed = if is_civ(race) { gear_bonus(s).speed } else { 1.0 };
                set_f64_at(OFF_UCD, s, js_round(14.0 / wspeed));
                set_f64_at(OFF_UATK, s, 12.0);
                // 克拉肯触手（L2691）
                if race == R_KRAKEN && u8_at(OFF_UBOAT, enemy) != 0 {
                    set_f64_at(OFF_UHP, enemy, f64_at(OFF_UHP, enemy) - f64_at(OFF_UDMG, s) * 2.0);
                    set_f64_at(OFF_UHURT, enemy, 20.0);
                    if rng_next() < 0.3 {
                        set_u8_at(OFF_UDEAD, enemy, 1);
                        set_u8_at(OFF_UBOAT, enemy, 0);
                        dirty(enemy);
                        fx(ctx, FX_EXPLOSION, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy), 16.0, 1.6, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, true);
                        if let Some(p) = ctx.act_reserve(12) {
                            ctx.act_u8(p, ACT_EVT);
                            ctx.act_u8(p + 1, EVT_SHIPWRECK);
                            ctx.act_i32(p + 4, u32_at(OFF_UID, enemy) as i32);
                        }
                    } else {
                        fx(ctx, FX_TSUNAMI, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy), 12.0, 2.5, 0.0, 0.0, 0.0, -1, true, TXT_NONE, 0, true);
                    }
                    dirty(s);
                    return Ok(());
                }
                // 沙虫吞噬（L2706）
                if race == R_SANDWORM && f64_at(OFF_UHP, enemy) <= f64_at(OFF_UMAXHP, enemy) * 0.4 {
                    set_f64_at(OFF_UHP, enemy, 0.0);
                    set_u8_at(OFF_UDEAD, enemy, 1);
                    dirty(enemy);
                    set_f64_at(OFF_UKILLS, s, f64_at(OFF_UKILLS, s) + 1.0);
                    set_f64_at(OFF_UFD, s, js_min(160.0, u_food0(s) + 50.0 + js_round(f64_at(OFF_UMAXHP, enemy) * 0.6)));
                    fx(ctx, FX_BLOOD, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy), 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
                    if fxp & FXP_DMGNUM != 0 {
                        fx(ctx, FX_DMG, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy), 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_DEVOUR, 0, false);
                    }
                    dirty(s);
                    return Ok(());
                }
                // 蛇怪石化（L2717）
                if race == R_BASILISK && rng_next() < 0.08 {
                    set_f64_at(OFF_UHP, enemy, 0.0);
                    set_u8_at(OFF_UDEAD, enemy, 1);
                    dirty(enemy);
                    set_f64_at(OFF_UKILLS, s, f64_at(OFF_UKILLS, s) + 1.0);
                    // addCorpse(stone=true, undead=erace undead)
                    if fxp & FXP_CORPSES != 0 {
                        if let Some(p) = ctx.act_reserve(20) {
                            ctx.act_u8(p, ACT_CORPSE);
                            ctx.act_f64(p + 8, f64_at(OFF_UX, enemy));
                            ctx.act_f64(p + 16, f64_at(OFF_UY, enemy));
                            ctx.act_u8(p + 4, 1);
                            ctx.act_u8(p + 5, is_undead(erace) as u8);
                        }
                    }
                    if let Some(p) = ctx.act_reserve(48) {
                        ctx.act_u8(p, ACT_EVT);
                        ctx.act_u8(p + 1, EVT_PETRIFY);
                        ctx.act_i32(p + 4, u32_at(OFF_UID, enemy) as i32);
                        ctx.act_f64(p + 32, f64_at(OFF_UX, enemy));
                        ctx.act_f64(p + 40, f64_at(OFF_UY, enemy));
                    }
                    if fxp & FXP_DMGNUM != 0 {
                        fx(ctx, FX_DMG, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy), 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_PETRIFY, 0, false);
                    }
                    dirty(s);
                    return Ok(());
                }
                // 命中网络（L2730）
                {
                    let eix = idx(
                        js_max(0.0, js_min(W as f64 - 1.0, f64_at(OFF_UX, enemy))).floor() as i32,
                        js_max(0.0, js_min(H as f64 - 1.0, f64_at(OFF_UY, enemy))).floor() as i32,
                    );
                    let etr = i32_at(OFF_UTRAIT, enemy);
                    let mut fa = [0f64; 10];
                    fa[0] = js_min(20.0, f64_at(OFF_UKILLS, s)) / 20.0;
                    fa[1] = js_min(0.5, js_max(0.0, (f64_at(OFF_TBR, erace * 12 + RB_SPEED) - f64_at(OFF_TBR, race * 12 + RB_SPEED)) * 7.0)) * 2.0;
                    fa[2] = if etr >= 0 && u8_at(OFF_TRFL, etr as usize) & 2 != 0 { 1.0 } else { 0.0 };
                    fa[3] = if etr >= 0 && u8_at(OFF_TRFL, etr as usize) & 16 != 0 { 1.0 } else { 0.0 }; // swift（bit4 约定）
                    fa[4] = if etr >= 0 && u8_at(OFF_TRFL, etr as usize) & 1 != 0 { 1.0 } else { 0.0 };
                    fa[5] = if i32_at(OFF_UTRAIT, s) >= 0 && u8_at(OFF_TRFL, i32_at(OFF_UTRAIT, s) as usize) & 2 != 0 { 1.0 } else { 0.0 };
                    fa[6] = if truthy_f(f64_at(OFF_UBLESS, s)) { 1.0 } else { 0.0 };
                    fa[7] = if truthy_f(f64_at(OFF_UCURSE, s)) { 1.0 } else { 0.0 };
                    fa[8] = if u8_at(OFF_TERR, eix) == T_FOREST { 1.0 } else { 0.0 };
                    fa[9] = if u8_at(OFF_TERR, eix) == T_MOUNTAIN { 1.0 } else { 0.0 };
                    let p_acc = neuro_acc(&fa);
                    if rng_next() > js_max(0.35, js_min(0.97, p_acc)) {
                        if fxp & FXP_DMGNUM != 0 && rng_next() < 0.55 {
                            fx(ctx, FX_DMG, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy) - 0.4, 20.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_MISS, 0, false);
                        }
                        dirty(s);
                        return Ok(());
                    }
                }
                // 装备战斗结算（L2749-2801）
                let ga = if is_civ(race) { Some(gear_bonus(s)) } else { None };
                let gd = if is_civ(erace) { Some(gear_bonus(enemy)) } else { None };
                let mut dmg = f64_at(OFF_UDMG, s) * (0.8 + rng_next() * 0.4) * (if truthy_f(f64_at(OFF_UBLESS, s)) { 1.3 } else { 1.0 }) * (if truthy_f(f64_at(OFF_UCURSE, s)) { 0.75 } else { 1.0 });
                let dp = f64_at(OFF_DAYPH, 0);
                if dp > 0.5 && dp < 0.9 && race_flag2(race) & RF2_NIGHTSIGHT == 0 {
                    dmg *= 0.92;
                }
                let mut crit = false;
                if let Some(g) = ga.as_ref() {
                    if g.crit > 0.0 && rng_next() * 100.0 < g.crit {
                        dmg *= 2.2;
                        crit = true;
                    }
                }
                if let Some(g) = gd.as_ref() {
                    if g.armor > 0.0 {
                        dmg *= 1.0 - g.armor / 100.0;
                    }
                }
                set_f64_at(OFF_UHP, enemy, f64_at(OFF_UHP, enemy) - dmg);
                set_f64_at(OFF_UHURT, enemy, 20.0);
                dirty(enemy);
                fx(ctx, FX_HIT, (f64_at(OFF_UX, s) + f64_at(OFF_UX, enemy)) / 2.0, (f64_at(OFF_UY, s) + f64_at(OFF_UY, enemy)) / 2.0, 6.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
                if fxp & FXP_BLOOD != 0 && dmg >= 5.0 && rng_next() < 0.5 {
                    // addBlood（内部 +1 rng seed）
                    let _seed = rng_next();
                    if let Some(p) = ctx.act_reserve(24) {
                        ctx.act_u8(p, ACT_BLOOD);
                        ctx.act_u8(p + 1, 0);
                        ctx.act_f64(p + 8, f64_at(OFF_UX, enemy));
                        ctx.act_f64(p + 16, f64_at(OFF_UY, enemy));
                    }
                }
                let etr = i32_at(OFF_UTRAIT, enemy);
                let enemy_immune = etr >= 0 && u8_at(OFF_TRFL, etr as usize) & 4 != 0;
                if race == R_BASILISK && rng_next() < 0.45 && u8_at(OFF_UINF, enemy) == 0 && !enemy_immune {
                    set_u8_at(OFF_UINF, enemy, 1);
                    if fxp & FXP_DMGNUM != 0 {
                        fx(ctx, FX_DMG, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_POISON, 0, false);
                    }
                }
                if fxp & FXP_DMGNUM != 0 && (crit || dmg >= 12.0 || rng_next() < 0.4) {
                    fx(ctx, FX_DMG, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy), 26.0, 1.0, 0.0, 0.0, dmg, -1, false, TXT_NUM, crit as u32, true);
                }
                if race == R_VAMPIRE && f64_at(OFF_UHP, s) > 0.0 {
                    set_f64_at(OFF_UHP, s, js_min(f64_at(OFF_UMAXHP, s), f64_at(OFF_UHP, s) + dmg * 0.6));
                    if fxp & FXP_DMGNUM != 0 && rng_next() < 0.4 {
                        fx(ctx, FX_HEART, f64_at(OFF_UX, s), f64_at(OFF_UY, s) - 0.5, 18.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
                    }
                }
                if let Some(g) = ga.as_ref() {
                    if g.lifesteal > 0.0 && f64_at(OFF_UHP, s) > 0.0 {
                        set_f64_at(OFF_UHP, s, js_min(f64_at(OFF_UMAXHP, s), f64_at(OFF_UHP, s) + (dmg * g.lifesteal) / 100.0));
                    }
                }
                if let Some(g) = gd.as_ref() {
                    if g.thorns > 0.0 {
                        set_f64_at(OFF_UHP, s, f64_at(OFF_UHP, s) - g.thorns);
                        set_f64_at(OFF_UHURT, s, 14.0);
                        if f64_at(OFF_UHP, s) <= 0.0 {
                            set_u8_at(OFF_UDEAD, s, 1);
                        }
                    }
                }
                // 蝎/蛇毒（L2793/2798）
                if race == R_SCORPION && rng_next() < 0.3 && u8_at(OFF_UINF, enemy) == 0 && !enemy_immune {
                    set_u8_at(OFF_UINF, enemy, 1);
                    if fxp & FXP_DMGNUM != 0 {
                        fx(ctx, FX_DMG, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_POISON, 0, false);
                    }
                }
                if race == R_SNAKE && rng_next() < 0.3 && u8_at(OFF_UINF, enemy) == 0 && !enemy_immune {
                    set_u8_at(OFF_UINF, enemy, 1);
                    if fxp & FXP_DMGNUM != 0 {
                        fx(ctx, FX_DMG, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_POISON, 0, false);
                    }
                }
                // 战场标记（L2803）
                let bi = idx(f64_at(OFF_UX, enemy).floor() as i32, f64_at(OFF_UY, enemy).floor() as i32);
                if let Some(p) = ctx.act_reserve(16) {
                    ctx.act_u8(p, ACT_BATTLE);
                    ctx.act_i32(p + 4, bi as i32);
                    ctx.act_i32(p + 8, i32_at(OFF_TICK, 0) + 30);
                }
                // 击杀结算（L2811-2863）
                if f64_at(OFF_UHP, enemy) <= 0.0 {
                    let zomb = race == R_ZOMBIE && is_civ(erace) && laws & LAW_ZINFECT != 0;
                    if zomb {
                        zombify(ctx, enemy);
                    } else {
                        set_u8_at(OFF_UDEAD, enemy, 1);
                        dirty(enemy);
                        let kills = f64_at(OFF_UKILLS, s) + 1.0;
                        set_f64_at(OFF_UKILLS, s, kills);
                        witness_death(ctx, s, enemy);
                        // 复仇（L2823）
                        let gl3 = u_glen(s);
                        if gl3 > 0 {
                            let eid = u32_at(OFF_UID, enemy);
                            let mut rgi = -1i32;
                            for t in 0..gl3 as usize {
                                if i32_at(OFF_UGIDS, s * UG_CAP + t) as u32 == eid {
                                    rgi = t as i32;
                                    break;
                                }
                            }
                            if rgi >= 0 {
                                // splice(rgi)
                                let mut m = rgi as usize;
                                while m + 1 < gl3 as usize {
                                    set_i32_at(OFF_UGIDS, s * UG_CAP + m, i32_at(OFF_UGIDS, s * UG_CAP + m + 1));
                                    set_f64_at(OFF_UGVAL, s * UG_CAP + m, f64_at(OFF_UGVAL, s * UG_CAP + m + 1));
                                    m += 1;
                                }
                                set_i32_at(OFF_UGLN, s, gl3 - 1);
                                if rng_next() < 0.12 {
                                    if let Some(p) = ctx.act_reserve(48) {
                                        ctx.act_u8(p, ACT_EVT);
                                        ctx.act_u8(p + 1, EVT_REVENGE);
                                        ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                                        ctx.act_i32(p + 8, eid as i32);
                                        ctx.act_f64(p + 32, f64_at(OFF_UX, s));
                                        ctx.act_f64(p + 40, f64_at(OFF_UY, s));
                                    }
                                }
                            }
                        }
                        // 家族战功（L2833）
                        let ufam = i32_at(OFF_UFAM, s);
                        if ufam >= 0 {
                            let row = family_find(ufam);
                            if row >= 0 {
                                let k = f64_at(OFF_FMNUM, row as usize * 5 + 1) + 1.0;
                                set_f64_at(OFF_FMNUM, row as usize * 6 + 1, k);
                                if kills == 10.0 {
                                    set_f64_at(OFF_FMNUM, row as usize * 6 + 1, f64_at(OFF_FMNUM, row as usize * 6 + 1) + 1.0); // heroes
                                }
                                if let Some(p) = ctx.act_reserve(16) {
                                    ctx.act_u8(p, ACT_FAM_ONKILL);
                                    ctx.act_i32(p + 4, ufam);
                                    ctx.act_i32(p + 8, u32_at(OFF_UID, s) as i32);
                                    ctx.act_i32(p + 12, kills as i32);
                                }
                            }
                        }
                        // 采集（L2844）
                        if u8_at(OFF_COLEN, 0) != 0 {
                            if let Some(p) = ctx.act_reserve(16) {
                                ctx.act_u8(p, ACT_TELEM);
                                ctx.act_u8(p + 1, TL_KILL);
                                ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                                ctx.act_f64(p + 8, f64_at(OFF_UMAXHP, enemy));
                            }
                        }
                        // 捕食者进食（L2846）
                        if is_predator(race) && !is_undead(race) {
                            set_f64_at(OFF_UFD, s, js_min(160.0, u_food0(s) + 55.0 + js_round(f64_at(OFF_UMAXHP, enemy) * 0.5)));
                        }
                        // 屠龙计数（L2848）
                        if erace == R_DRAGON {
                            set_f64_at(OFF_CNT, 4, f64_at(OFF_CNT, 4) + 1.0);
                        }
                        // 战争簿记（L2850 → 动作）
                        if let Some(p) = ctx.act_reserve(16) {
                            ctx.act_u8(p, ACT_WARKILL);
                            ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                            ctx.act_i32(p + 8, u32_at(OFF_UID, enemy) as i32);
                        }
                        // 十杀传奇（L2851）
                        if kills == 10.0 {
                            if let Some(p) = ctx.act_reserve(16) {
                                ctx.act_u8(p, ACT_TOAST);
                                ctx.act_u8(p + 1, TOAST_KILLS10);
                                ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                            }
                            if let Some(p) = ctx.act_reserve(48) {
                                ctx.act_u8(p, ACT_EVT);
                                ctx.act_u8(p + 1, EVT_LEGEND);
                                ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                                ctx.act_f64(p + 32, f64_at(OFF_UX, s));
                                ctx.act_f64(p + 40, f64_at(OFF_UY, s));
                            }
                        }
                        // 白行者击杀复活（L2856）
                        if race == R_WHITEWALKER && is_civ(erace) {
                            rise_skeleton(ctx, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy));
                        }
                        // 亡者复生法则（L2860）
                        if laws & LAW_UNDEAD_RISE != 0 && is_civ(erace) && rng_next() < 0.06 {
                            rise_skeleton(ctx, f64_at(OFF_UX, enemy), f64_at(OFF_UY, enemy));
                        }
                    }
                }
            }
            // 近战分支（enemyD < reach）：TS L2684-2865 —— 仅 cd 门控的战斗结算，无移动
            // （JS 语义：近战后落入 POST 拾取/繁衍 —— 不 return）
            dirty(s);
            skip_tail = true;
        } else if stance == 2 && (has_rd || bow_range > 0.0) {
            // 射程死区（L2866）
            let ang = fd_atan2(f64_at(OFF_UY, s) - f64_at(OFF_UY, enemy), f64_at(OFF_UX, s) - f64_at(OFF_UX, enemy));
            set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + fd_cos(ang) * 3.0)));
            set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + fd_sin(ang) * 3.0)));
            move_unit(ctx, s, 0.8);
        } else {
            if !truthy_f(f64_at(OFF_UDETOUR, s)) {
                set_f64_at(OFF_UTX, s, f64_at(OFF_UX, enemy));
                set_f64_at(OFF_UTY, s, f64_at(OFF_UY, enemy));
            }
            move_unit(ctx, s, 1.25);
        }
        dirty(s);
        skip_tail = true; // 接敌路径不走尾段，但落入 POST（拾取/繁衍）
    }

    // —— 和平分支尾（L2876-3146；仅无敌时执行）——
    if !skip_tail {
    if u8_at(OFF_COLEN, 0) != 0 {
        if let Some(p) = ctx.act_reserve(12) {
            ctx.act_u8(p, ACT_TELEM);
            ctx.act_u8(p + 1, TL_ENEMY_GONE);
            ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
            ctx.act_i32(p + 8, i32_at(OFF_TICK, 0));
        }
    }
    // 巨龙吐息（L2880）
    if race == R_DRAGON {
        let b = f64_at(OFF_UBREATH, s) - 2.0;
        set_f64_at(OFF_UBREATH, s, b);
        if b <= 0.0 {
            set_f64_at(OFF_UBREATH, s, 150.0 + (rng_next() * 150.0).floor());
            dragon_breath(ctx, s);
        }
    }
    let job = u_job0(s);
    if is_civ(race) && uciv >= 0 {
        let warring = civ_at_war(uciv);
        // 防灾（L2893）
        let firen = i32_at(OFF_FIREN, 0);
        let big_fire = firen > 8;
        let has_army = i32_at(OFF_UARMY, s) >= 0;
        if !has_army && firen > 0 && rng_next() < (if big_fire { 0.5 } else { 0.3 }) {
            let radius = if job == 4 { if big_fire { 7.0 } else { 4.5 } } else if big_fire { 5.0 } else { 3.0 };
            let fi = fire_near(s, radius);
            if fi >= 0 {
                let fxp2 = (fi % W) as f64 + 0.5;
                let fyp = (fi / W) as f64 + 0.5;
                let cdx = fxp2 - f64_at(OFF_UX, s);
                let cdy = fyp - f64_at(OFF_UY, s);
                if cdx * cdx + cdy * cdy < 2.89 {
                    extinguish_fire(ctx, fi as usize, s);
                    set_f64_at(OFF_UCD, s, js_max(f64_at(OFF_UCD, s), 10.0));
                } else {
                    set_f64_at(OFF_UTX, s, fxp2);
                    set_f64_at(OFF_UTY, s, fyp);
                    move_unit(ctx, s, 1.2);
                    return Ok(());
                }
            }
        }
        // 建筑师修缮（L2913）
        if !has_army && job == 4 && f64_at(OFF_UCD, s) <= 0.0 && rng_next() < 0.2 {
            let di = damaged_near(s, 14.0);
            if di >= 0 {
                let row = bldg_row_of_tile(di as usize);
                if row >= 0 {
                    let bx = i32_at(OFF_BLDXY, row as usize * 2) as f64 + 0.5;
                    let by = i32_at(OFF_BLDXY, row as usize * 2 + 1) as f64 + 0.5;
                    let bdx = bx - f64_at(OFF_UX, s);
                    let bdy = by - f64_at(OFF_UY, s);
                    if bdx * bdx + bdy * bdy < 3.24 {
                        set_f64_at(OFF_UCD, s, 16.0);
                        set_f64_at(OFF_UATK, s, 10.0);
                        let amount = 12.0 * f64_at(OFF_CVTECH, uciv as usize * 24 + TC_REPAIR);
                        repair_building(ctx, di as usize, amount);
                    } else {
                        set_f64_at(OFF_UTX, s, bx);
                        set_f64_at(OFF_UTY, s, by);
                        move_unit(ctx, s, 1.15);
                        return Ok(());
                    }
                }
            }
        }
        // 路过修缮（L2932）
        if !has_army && job != 2 && job != 3 && f64_at(OFF_UCD, s) <= 0.0 && i32_at(OFF_DMGN, 0) > 0 && rng_next() < 0.12 {
            let di = damaged_near(s, 1.9);
            if di >= 0 {
                set_f64_at(OFF_UCD, s, 22.0);
                repair_building(ctx, di as usize, 3.0);
            }
        }
        // 战争 AI（L2940-2973）
        if warring && (job == 2 || job == 3) {
            let in_army = has_army;
            if f64_at(OFF_UCD, s) <= 0.0 {
                let bi = enemy_building_near(s, 1.6);
                if bi >= 0 {
                    set_f64_at(OFF_UCD, s, 14.0);
                    set_f64_at(OFF_UATK, s, 12.0);
                    if attack_building(ctx, bi as usize, f64_at(OFF_UDMG, s) * 1.6).is_err() {
                        // BAIL：建筑摧毁级联（data: tile, byCiv；单位 cd/atk 已置）
                        set_f64_at(OFF_BAILP, 0, bi as f64);
                        set_f64_at(OFF_BAILP, 1, uciv as f64);
                        return Err(BAIL_ATTACK_DEST);
                    }
                }
            }
            if job == 3 && f64_at(OFF_UCD, s) <= 0.0 && rng_next() < 0.1 {
                let bi = enemy_building_near(s, f64_at(OFF_TBJ, 3 * 5 + JB_RNG));
                if bi >= 0 {
                    set_f64_at(OFF_UCD, s, 18.0);
                    let tx = (bi % W) as f64 + 0.5;
                    let ty = (bi / W) as f64 + 0.5;
                    fx(ctx, FX_ARROW, tx, ty, 12.0, 1.0, f64_at(OFF_UX, s), f64_at(OFF_UY, s), f64_at(OFF_UDMG, s), uciv, false, TXT_NONE, 0, true);
                }
            }
            if !in_army {
                if rng_next() < 0.05 && maybe_board_for_war(ctx, s) {
                    dirty(s);
                    return Ok(());
                }
                {
                    let tdx = f64_at(OFF_UTX, s) - f64_at(OFF_UX, s);
                    let tdy = f64_at(OFF_UTY, s) - f64_at(OFF_UY, s);
                    if tdx * tdx + tdy * tdy < 1.44 || rng_next() < 0.03 {
                        let tgt = nearest_enemy_building(s);
                        if tgt >= 0 {
                            set_f64_at(OFF_UTX, s, i32_at(OFF_BLDXY, tgt as usize * 2) as f64 + rng_next() * 2.0 - 1.0);
                            set_f64_at(OFF_UTY, s, i32_at(OFF_BLDXY, tgt as usize * 2 + 1) as f64 + rng_next() * 2.0 - 1.0);
                        }
                    }
                }
            }
        } else if job == 1 && rng_next() < 0.06 {
            // 农民（L2974）
            let f = nearest_building_of(s, 4); // BUILD_KINDS.FARM
            if f >= 0 {
                set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, i32_at(OFF_BLDXY, f as usize * 2) as f64 + rng_next() * 5.0 - 2.5)));
                set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, i32_at(OFF_BLDXY, f as usize * 2 + 1) as f64 + rng_next() * 5.0 - 2.5)));
            }
        } else if job == 5 {
            // 商人（L2981-3000）：近抵达或 3% → 选目标建筑（60% 集市/40% 王都）+ 抖动；距建筑 <1.5 入账
            let civ_ok = uciv >= 0 && (uciv as usize) < i32_at(OFF_CIVN, 0).max(0) as usize;
            {
                let tdx = f64_at(OFF_UTX, s) - f64_at(OFF_UX, s);
                let tdy = f64_at(OFF_UTY, s) - f64_at(OFF_UY, s);
                if civ_ok && (tdx * tdx + tdy * tdy < 1.44 || rng_next() < 0.03) {
                    let kind_pick = if rng_next() < 0.6 { 9 } else { 2 }; // MARKET / CAPITAL
                    let m = nearest_building_of(s, kind_pick);
                    if m >= 0 {
                        let mx = i32_at(OFF_BLDXY, m as usize * 2) as f64;
                        let my = i32_at(OFF_BLDXY, m as usize * 2 + 1) as f64;
                        set_f64_at(OFF_UTX, s, mx + rng_next() * 2.0 - 1.0);
                        set_f64_at(OFF_UTY, s, my + rng_next() * 2.0 - 1.0);
                        let mdx = f64_at(OFF_UX, s) - mx;
                        let mdy = f64_at(OFF_UY, s) - my;
                        if mdx * mdx + mdy * mdy < 2.25 {
                            civ_delta(ctx, 2, uciv, 2.0);
                            fx(ctx, FX_COIN, f64_at(OFF_UX, s), f64_at(OFF_UY, s) - 1.0, 24.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
                        }
                    }
                }
            }
        } else if job == 6 && rng_next() < 0.06 {
            // 贵族（L3001）
            let cap = i32_at(OFF_CVCAP, uciv as usize);
            if cap >= 0 {
                let cx2 = (cap % W) as f64;
                let cy2 = (cap / W) as f64;
                set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, cx2 + rng_next() * 6.0 - 3.0)));
                set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, cy2 + rng_next() * 6.0 - 3.0)));
            }
        } else if rng_next() < 0.02 {
            // march to war（L3010）
            let tgt = war_target(uciv);
            if tgt >= 0 {
                set_f64_at(OFF_UTX, s, i32_at(OFF_BLDXY, tgt as usize * 2) as f64 + rng_next() * 4.0 - 2.0);
                set_f64_at(OFF_UTY, s, i32_at(OFF_BLDXY, tgt as usize * 2 + 1) as f64 + rng_next() * 4.0 - 2.0);
            }
        }
        // 商队（L3017）
        if u_caravan0(s) > 0.0 {
            let pc = u_caravan0(s) as i32;
            let mi = i32_at(OFF_CVMKT, pc as usize);
            let pc_alive = pc >= 0 && (pc as usize) < MAX_CIVS && u8_at(OFF_CVAL, pc as usize) != 0;
            if !pc_alive || mi < 0 {
                set_f64_at(OFF_UCVN, s, 0.0);
            } else {
                set_f64_at(OFF_UTX, s, (mi % W) as f64 + 0.5);
                set_f64_at(OFF_UTY, s, (mi / W) as f64 + 0.5);
                let cdx = f64_at(OFF_UX, s) - f64_at(OFF_UTX, s);
                let cdy = f64_at(OFF_UY, s) - f64_at(OFF_UTY, s);
                if cdx * cdx + cdy * cdy < 3.24 {
                    // caravanArrive → BAIL（rare：外交流血/联盟/知识）
                    set_f64_at(OFF_BAILP, 0, 1.0);
                    return Err(BAIL_CARAVAN);
                }
            }
        }
    }
    // 捕食者索敌（L3031）
    if is_predator(race) && !is_undead(race) && u_food0(s) < 70.0 && rng_next() < 0.4 {
        let hx = js_min(ctx.bw as f64 - 1.0, js_max(0.0, (f64_at(OFF_UX, s) / 4.0).floor())) as i32;
        let hy = js_min(ctx.bh as f64 - 1.0, js_max(0.0, (f64_at(OFF_UY, s) / 4.0).floor())) as i32;
        let mut prey: i32 = -1;
        let mut prey_d2 = 26.0 * 26.0;
        // 13×13 桶扫描
        let st = state();
        let cs2 = st.offs[OFF_CELL_START as usize] as usize;
        let ci2 = st.offs[OFF_CELL_ITEMS as usize] as usize;
        let live = st.live_len as usize;
        let mut by = hy - 6;
        while by <= hy + 6 {
            if by < 0 || by >= ctx.bh {
                by += 1;
                continue;
            }
            let mut bx = hx - 6;
            while bx <= hx + 6 {
                if bx < 0 || bx >= ctx.bw {
                    bx += 1;
                    continue;
                }
                let cell = (by * ctx.bw + bx) as usize;
                let (start, end) = unsafe {
                    let p1 = st.arena.as_ptr().add(cs2 + cell * 4) as *const u32;
                    let p2 = st.arena.as_ptr().add(cs2 + (cell + 1) * 4) as *const u32;
                    (p1.read_unaligned(), p2.read_unaligned())
                };
                let mut k = start;
                while k < end {
                    let o = unsafe {
                        let p = st.arena.as_ptr().add(ci2 + k as usize * 4) as *const u32;
                        p.read_unaligned()
                    } as usize;
                    k += 1;
                    if u8_at(OFF_UDEAD, o) != 0 || o == s {
                        continue;
                    }
                    if !is_herbivore(u32_at(OFF_URACE, o) as u32) {
                        continue;
                    }
                    let pdx = f64_at(OFF_UX, o) - f64_at(OFF_UX, s);
                    let pdy = f64_at(OFF_UY, o) - f64_at(OFF_UY, s);
                    let pd2 = pdx * pdx + pdy * pdy;
                    if pd2 < prey_d2 {
                        prey_d2 = pd2;
                        prey = o as i32;
                    }
                }
                bx += 1;
            }
            by += 1;
        }
        if prey >= 0 && !truthy_f(f64_at(OFF_UDETOUR, s)) {
            set_f64_at(OFF_UTX, s, f64_at(OFF_UX, prey as usize));
            set_f64_at(OFF_UTY, s, f64_at(OFF_UY, prey as usize));
            move_unit(ctx, s, 1.15);
            return Ok(());
        }
        if !truthy_f(f64_at(OFF_UDETOUR, s)) {
            // 猎物密度场导航（L3052）
            let gx = js_min(31.0, js_max(0.0, (f64_at(OFF_UX, s) / 8.0).floor())) as i32;
            let gy = js_min(19.0, js_max(0.0, (f64_at(OFF_UY, s) / 8.0).floor())) as i32;
            let mut best_cell = -1i32;
            let mut best_score = 0f64;
            let mut cy2 = 0.max(gy - 3);
            while cy2 <= 19.min(gy + 3) {
                let mut cx2 = 0.max(gx - 3);
                while cx2 <= 31.min(gx + 3) {
                    let c = u16_at(OFF_PREY, (cy2 * 32 + cx2) as usize) as f64;
                    if c > 0.0 {
                        let d = fd_hypot(cx2 as f64 - gx as f64, cy2 as f64 - gy as f64);
                        if d >= 0.9 {
                            let score = c / (1.0 + d * 0.8);
                            if score > best_score {
                                best_score = score;
                                best_cell = cy2 * 32 + cx2;
                            }
                        }
                    }
                    cx2 += 1;
                }
                cy2 += 1;
            }
            if best_cell >= 0 {
                set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, (best_cell % 32) as f64 * 8.0 + 4.0 + (rng_next() * 4.0 - 2.0))));
                set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, ((best_cell / 32) as f64) * 8.0 + 4.0 + (rng_next() * 4.0 - 2.0))));
                move_unit(ctx, s, 1.15);
                return Ok(());
            }
        }
    }
    // 随机漫游（L3074）
    {
        let ndx = f64_at(OFF_UTX, s) - f64_at(OFF_UX, s);
        let ndy = f64_at(OFF_UTY, s) - f64_at(OFF_UY, s);
        if u_caravan0(s) == 0.0 && (ndx * ndx + ndy * ndy < 0.25 || rng_next() < 0.02) {
            let r = if race == R_SHEEP { 2.5 } else if race == R_DRAGON { 9.0 } else { 5.0 };
            let mut wx = f64_at(OFF_UX, s) + (rng_next() * 2.0 - 1.0) * r;
            let mut wy = f64_at(OFF_UY, s) + (rng_next() * 2.0 - 1.0) * r;
            if is_predator(race) && !is_undead(race) && u_food0(s) < 55.0 {
                for _k in 0..3 {
                    let gx = f64_at(OFF_UX, s) + (rng_next() * 2.0 - 1.0) * 14.0;
                    let gy = f64_at(OFF_UY, s) + (rng_next() * 2.0 - 1.0) * 14.0;
                    let gj = idx(js_max(0.0, js_min(W as f64 - 1.0, gx)).floor() as i32, js_max(0.0, js_min(H as f64 - 1.0, gy)).floor() as i32);
                    let tt = u8_at(OFF_TERR, gj);
                    if (tt == T_GRASS || tt == T_FOREST) && u8_at(OFF_BLDK, gj) == 0 {
                        wx = gx;
                        wy = gy;
                        break;
                    }
                }
            }
            set_f64_at(OFF_UTX, s, js_max(1.0, js_min(W as f64 - 2.0, wx)));
            set_f64_at(OFF_UTY, s, js_max(1.0, js_min(H as f64 - 2.0, wy)));
        }
        move_unit(ctx, s, 1.0);
    }
    } // —— skip_tail 守卫结束（POST 对敌我两路径开放）——

    // 拾取（L3097）
    if i32_at(OFF_ITMN, 0) > 0 && (is_civ(race) || race == R_BANDIT) {
        try_pickup(ctx, s);
    }
    // 繁衍（L3102-3146）
    if laws & LAW_REPRO != 0 {
        let repro = f64_at(OFF_TBR, race * 12 + RB_REPRO);
        if repro > 0.0 && rng_next() < repro {
            let mut boost = 1.0f64;
            if is_civ(race) && uciv >= 0 && u8_at(OFF_CVDIR, uciv as usize) & 1 != 0 {
                boost *= 1.8;
            }
            if is_civ(race) && uciv >= 0 {
                boost *= f64_at(OFF_CVTECH, uciv as usize * 24 + TC_REPRO) * (1.0 + f64_at(OFF_CVTECH, uciv as usize * 24 + TC_IDEA_REPRO));
            }
            if truthy_f(f64_at(OFF_UFERT, s)) {
                boost *= 2.5;
            }
            let gr = f64_at(OFF_UGENE, s * 4 + 3);
            boost *= if gr.is_nan() { 1.0 } else { gr };
            if u_panic0(s) >= 0.5 {
                boost *= 0.3;
            }
            if is_civ(race) {
                boost *= 0.85 + f64_at(OFF_TBR, race * 12 + RB_GROWTH) * 0.3;
            }
            boost *= f64_at(OFF_REPRM, 0);
            if is_civ(race) && uciv >= 0 && civ_at_war(uciv) {
                boost *= 0.55;
            }
            if !is_civ(race) && !is_predator(race) {
                boost *= 0.75 + js_min(0.75, f64_at(OFF_GRASS, 0) / 16000.0);
            }
            if is_predator(race) {
                boost *= 1.6 + js_min(1.4, js_max(0.0, (u_food0(s) - 40.0) / 85.0));
            }
            boost *= ep(EP_REPRO);
            let food_ok = !is_predator(race) || u_food0(s) > 40.0;
            if food_ok && rng_next() < boost {
                if is_civ(race) {
                    let civ_alive = uciv >= 0 && (uciv as usize) < MAX_CIVS && u8_at(OFF_CVAL, uciv as usize) != 0;
                    let pop_ok = civ_alive && f64_at(OFF_CVPOP, uciv as usize) < f64_at(OFF_CVPC, uciv as usize) + 6.0;
                    let live = state().live_len as usize;
                    if pop_ok && live < i32_at(OFF_MISC, 0).max(0) as usize {
                        let cg = child_gene(s);
                        // 涌现特质门（tryEmergentTrait）——极端基因才进入
                        if emergent_gate(s, &cg) {
                            // BAIL：TS 接管涌现特质 + 后续
                            for k in 0..4 {
                                set_f64_at(OFF_BAILP, k, cg[k]);
                            }
                            set_f64_at(OFF_BAILP, 4, 1.0);
                            return Err(BAIL_EMERGENT);
                        }
                        let (fam2, fgn2) = fam_for_child(ctx, s, race);
                        spawn_unit(ctx, race, f64_at(OFF_UX, s) + rng_next() - 0.5, f64_at(OFF_UY, s) + rng_next() - 0.5, uciv, Some(cg), false, -1, -1, fam2, fgn2);
                        fx(ctx, FX_HEART, f64_at(OFF_UX, s), f64_at(OFF_UY, s) - 1.0, 40.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
                    }
                } else {
                    let cap = i32_at(OFF_WILDCAP, race) as f64;
                    let same = i32_at(OFF_WILD, race) as f64;
                    if same < cap {
                        let cg = child_gene(s);
                        if emergent_gate(s, &cg) {
                            for k in 0..4 {
                                set_f64_at(OFF_BAILP, k, cg[k]);
                            }
                            set_f64_at(OFF_BAILP, 4, 0.0);
                            return Err(BAIL_EMERGENT);
                        }
                        let (fam2, fgn2) = fam_for_child(ctx, s, race);
                        spawn_unit(ctx, race, f64_at(OFF_UX, s) + rng_next() - 0.5, f64_at(OFF_UY, s) + rng_next() - 0.5, -1, Some(cg), false, -1, -1, fam2, fgn2);
                        fx(ctx, FX_HEART, f64_at(OFF_UX, s), f64_at(OFF_UY, s) - 1.0, 40.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
                    }
                }
            }
        }
    }
    Ok(())
}

/// 物品位图（pack 写入：GUNBM/BEAMBM u32×4 = 128 位）
#[inline(always)]
fn item_is_gun(item: i32) -> bool {
    let b = item as usize;
    u32_at(OFF_GUNBM, b >> 5) & (1u32 << (b & 31)) != 0
}
#[inline(always)]
fn item_is_beam(item: i32) -> bool {
    let b = item as usize;
    u32_at(OFF_BEAMBM, b >> 5) & (1u32 << (b & 31)) != 0
}

fn dragon_breath(ctx: &mut Ctx, s: usize) {
    let tx = js_max(1.0, js_min(W as f64 - 2.0, f64_at(OFF_UX, s) + (rng_next() * 2.0 - 1.0) * 8.0));
    let ty = js_max(1.0, js_min(H as f64 - 2.0, f64_at(OFF_UY, s) + (rng_next() * 2.0 - 1.0) * 8.0));
    for _k in 0..4 {
        let xx = (tx + rng_next() * 3.0 - 1.5).floor() as i32;
        let yy = (ty + rng_next() * 3.0 - 1.5).floor() as i32;
        if xx < 0 || yy < 0 || xx >= W || yy >= H {
            continue;
        }
        ignite(ctx, idx(xx, yy));
    }
    fx(ctx, FX_EXPLOSION, tx, ty, 16.0, 1.6, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, true);
}

/// 繁衍家族预掷：u.fam 有 → 继承（fgn+1）；无 → 25% 开宗（newFamily 2 rng）；否则 undefined（spawn 内 6% 分支）
fn fam_for_child(ctx: &mut Ctx, s: usize, race: usize) -> (i32, i32) {
    let fam = i32_at(OFF_UFAM, s);
    if fam >= 0 {
        let fgn0 = i32_at(OFF_UFGN, s);
        return (fam, if fgn0 < 0 { 2 } else { fgn0 + 1 }); // JS: (u.fgn ?? 1) + 1
    }
    if rng_next() < 0.25 {
        let nid = new_family(ctx, race, s);
        if nid >= 0 {
            let fgn0 = i32_at(OFF_UFGN, s);
            return (nid, if fgn0 < 0 { 2 } else { fgn0 + 1 }); // JS: (u.fgn ?? 1) + 1 —— 与继承分支同式
        }
    }
    (-1, -1)
}

fn child_gene(s: usize) -> [f64; 4] {
    let g = [
        f64_at(OFF_UGENE, s * 4),
        f64_at(OFF_UGENE, s * 4 + 1),
        f64_at(OFF_UGENE, s * 4 + 2),
        f64_at(OFF_UGENE, s * 4 + 3),
    ];
    let mr = ep(EP_MUT);
    let mut gene = [0f64; 4];
    for k in 0..4 {
        let v = if g[k].is_nan() { 1.0 } else { g[k] };
        gene[k] = js_max(0.5, js_min(2.0, v * (1.0 + (rng_next() - 0.5) * mr)));
    }
    let gx = js_max(0.0, js_min(W as f64 - 1.0, f64_at(OFF_UX, s))).floor() as i32;
    let gy = js_max(0.0, js_min(H as f64 - 1.0, f64_at(OFF_UY, s))).floor() as i32;
    let t = u8_at(OFF_TERR, idx(gx, gy));
    if t == T_SNOW || t == T_ICE {
        gene[2] = js_min(2.0, gene[2] * (1.0 + rng_next() * 0.05));
    } else if t == T_SAND {
        gene[0] = js_min(2.0, gene[0] * (1.0 + rng_next() * 0.05));
    } else if t == T_FOREST {
        gene[1] = js_min(2.0, gene[1] * (1.0 + rng_next() * 0.05));
    } else if t == T_GRASS {
        gene[3] = js_min(2.0, gene[3] * (1.0 + rng_next() * 0.04));
    }
    gene
}

/// tryEmergentTrait 前置门：cg.d/h/s ≥ 1.5 → 掷 0.06（命中 → true=需 BAIL）
fn emergent_gate(_s: usize, cg: &[f64; 4]) -> bool {
    // tryEmergentTrait L7506：extreme = d/h/s ≥ 1.5；!extreme || dynTraits.size ≥ 24 || rng > 0.06 → null
    // rng 仅在 extreme && size<24 时消耗（短路求值）
    let extreme = cg[1] >= 1.5 || cg[2] >= 1.5 || cg[0] >= 1.5;
    if !extreme {
        return false;
    }
    if i32_at(OFF_MISC, 2) >= 24 {
        return false;
    }
    !(rng_next() > 0.06)
}

fn try_pickup(ctx: &mut Ctx, s: usize) {
    let fxp = u8_at(OFF_FXP, 0);
    let n = i32_at(OFF_ITMN, 0);
    let mut i = n - 1;
    while i >= 0 {
        let it = i as usize;
        if it >= MAX_ITEMS {
            i -= 1;
            continue;
        }
        let kind = i32_at(OFF_ITMK, it);
        if kind < 0 || kind >= i32_at(OFF_TBIN, 0) {
            i -= 1;
            continue;
        }
        let ix = f64_at(OFF_ITMXY, it * 2);
        let iy = f64_at(OFF_ITMXY, it * 2 + 1);
        if (ix - f64_at(OFF_UX, s)).abs() > 0.9 || (iy - f64_at(OFF_UY, s)).abs() > 0.9 {
            i -= 1;
            continue;
        }
        let d = kind as usize;
        let slot = f64_at(OFF_TBI, d * 12 + IT_SLOT) as usize;
        if slot > 6 {
            i -= 1;
            continue;
        }
        let cur = i32_at(OFF_UGEAR, s * 7 + slot);
        let cur_rank = if cur >= 0 { f64_at(OFF_TBI, cur as usize * 12 + IT_RANK) } else { -1.0 };
        let rank = f64_at(OFF_TBI, d * 12 + IT_RANK);
        if cur_rank >= rank {
            i -= 1;
            continue;
        }
        // 换装：卸旧
        if cur >= 0 {
            let old = cur as usize;
            let odmg = f64_at(OFF_TBI, old * 12 + IT_DMG);
            let ohp = f64_at(OFF_TBI, old * 12 + IT_HP);
            let ospd = f64_at(OFF_TBI, old * 12 + IT_SPDMUL);
            if odmg != 0.0 {
                set_f64_at(OFF_UDMG, s, js_max(1.0, f64_at(OFF_UDMG, s) - odmg));
            }
            if ohp != 0.0 {
                set_f64_at(OFF_UMAXHP, s, js_max(1.0, f64_at(OFF_UMAXHP, s) - ohp));
            }
            if ospd != 0.0 {
                set_f64_at(OFF_USPEED, s, f64_at(OFF_USPEED, s) / ospd);
            }
        }
        set_i32_at(OFF_UGEAR, s * 7 + slot, kind);
        let ndmg = f64_at(OFF_TBI, d * 12 + IT_DMG);
        let nhp = f64_at(OFF_TBI, d * 12 + IT_HP);
        let nspd = f64_at(OFF_TBI, d * 12 + IT_SPDMUL);
        if ndmg != 0.0 {
            set_f64_at(OFF_UDMG, s, f64_at(OFF_UDMG, s) + ndmg);
        }
        if nhp != 0.0 {
            set_f64_at(OFF_UMAXHP, s, f64_at(OFF_UMAXHP, s) + nhp);
            set_f64_at(OFF_UHP, s, js_min(f64_at(OFF_UMAXHP, s), f64_at(OFF_UHP, s) + nhp));
        }
        if nspd != 0.0 {
            set_f64_at(OFF_USPEED, s, f64_at(OFF_USPEED, s) * nspd);
        }
        // items.splice(i, 1)（倒序 splice —— 直接标记删除并前移）
        let m = i;
        let total = i32_at(OFF_ITMN, 0);
        let mut k2 = m;
        while k2 + 1 < total {
            set_i32_at(OFF_ITMK, k2 as usize, i32_at(OFF_ITMK, k2 as usize + 1));
            set_f64_at(OFF_ITMXY, k2 as usize * 2, f64_at(OFF_ITMXY, k2 as usize * 2 + 2));
            set_f64_at(OFF_ITMXY, k2 as usize * 2 + 1, f64_at(OFF_ITMXY, k2 as usize * 2 + 3));
            k2 += 1;
        }
        set_i32_at(OFF_ITMN, 0, total - 1);
        if let Some(p) = ctx.act_reserve(16) {
            ctx.act_u8(p, ACT_ITEM_DEL);
            ctx.act_i32(p + 4, i);
        }
        fx(ctx, FX_SPAWN, f64_at(OFF_UX, s), f64_at(OFF_UY, s), 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
        if let Some(p) = ctx.act_reserve(8) {
            ctx.act_u8(p, ACT_SND);
            ctx.act_u8(p + 1, SND_COIN);
        }
        if fxp & FXP_DMGNUM != 0 {
            fx(ctx, FX_DMG, f64_at(OFF_UX, s), f64_at(OFF_UY, s) - 1.2, 34.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_ITEM, kind as u32, false);
        }
        let rarity = f64_at(OFF_TBI, d * 12 + IT_RARITY);
        if rarity >= 3.0 {
            // toast（TS 侧由 itemDef id 查名）—— ACT_TOAST 扩展 kind=2 拾取
            if let Some(p) = ctx.act_reserve(16) {
                ctx.act_u8(p, ACT_TOAST);
                ctx.act_u8(p + 1, 2);
                ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                ctx.act_i32(p + 8, kind);
            }
        }
        if rarity == 4.0 {
            if let Some(p) = ctx.act_reserve(48) {
                ctx.act_u8(p, ACT_EVT);
                ctx.act_u8(p + 1, 11); // EVT_LOOT_PICKUP
                ctx.act_i32(p + 4, u32_at(OFF_UID, s) as i32);
                ctx.act_i32(p + 8, kind);
                ctx.act_f64(p + 32, f64_at(OFF_UX, s));
                ctx.act_f64(p + 40, f64_at(OFF_UY, s));
            }
        }
        dirty(s);
        i -= 1;
    }
}

// ---------------- 批驱动 ----------------
#[no_mangle]
pub extern "C" fn wb_units_batch(from: u32, limit: u32) -> u32 {
    let st = state();
    let parity = u8_at(OFF_PAR, 0);
    let mut ctx = Ctx {
        act_cur: 0,
        overflow: false,
        bw: st.bw as i32,
        bh: st.bh as i32,
        parity,
    };
    let mut i = from as usize;
    let lim = if limit == 0 { u32::MAX } else { from + limit };
    let mut processed: u32 = 0;
    let mut iter_guard: u64 = 0;
    loop {
        iter_guard += 1;
        if iter_guard > 30000 {
            // 诊断：主循环异常（活长度失控/单位处理风暴）
            set_f64_at(OFF_BAILP, 0, st.live_len as f64);
            set_f64_at(OFF_BAILP, 1, i as f64);
            set_u32_at(OFF_BATCHR, 0, 5);
            return 5;
        }
        let live = st.live_len as usize;
        if i >= live || (from as u64) + (processed as u64) >= lim as u64 {
            break;
        }
        if u8_at(OFF_UPAR, i) == parity && u8_at(OFF_UDEAD, i) == 0 {
            processed += 1;
            match update_unit(&mut ctx, i) {
                Ok(()) => {}
                Err(kind) => {
                    // BAIL 登记
                    set_u32_at(OFF_BAILK, 0, kind);
                    set_u32_at(OFF_BAILS, 0, i as u32);
                    set_u32_at(OFF_BAILL, 0, kind);
                    // 动作游标写回
                    set_i32_at(OFF_ACTN, 0, ctx.act_cur as i32);
                    set_u32_at(OFF_BATCHR, 0, 2);
                    return 2;
                }
            }
        }
        i += 1;
    }
    set_i32_at(OFF_ACTN, 0, ctx.act_cur as i32);
    if ctx.overflow {
        set_u32_at(OFF_BATCHR, 0, 3);
        return 3;
    }
    set_u32_at(OFF_BATCHR, 0, 1);
    1
}

/// 追加单位后通知（TS 侧 JS spawn 的行已 pack → 更新 live_len）
#[no_mangle]
pub extern "C" fn wb_grow(n: u32) {
    let st = state();
    st.live_len = n;
    if n > st.n {
        st.n = n;
    }
}
