// ============================================================
// combat-transcript.mjs — WbUnits.cs（M-U2c 战斗树版）的 JS 逐行转写
// 用途：verify-csharp-port 第五段——转写 vs wasm wb_units_batch 逐位对账
// （M-U2b scan 段方法学延续：独立演化防循环论证，转写源 = C# 代码非蓝本）
// 约定：所有 f64 运算用 JS number；f32 舍入用 Math.fround（= C# (double)(float)）。
// ============================================================
import { W, H, MAX_RACES, MAX_CIVS, ID, ex, mem } from './gen-units-scan.mjs';

// —— 常量（WbConstants.cs 镜像）——
const UG_CAP = 8, MAX_UNITS = 4096, MAX_FAM = 256, MAX_ITEMDEFS = 128;
const F_CIV = 2, F_UNDEAD = 4, F_PREDATOR = 8, F_HERBIVORE = 16, F_HOSTILE = 1;
const R_BANDIT = 4, R_ZOMBIE = 5, R_SHEEP = 6, R_BEAR = 8, R_DRAGON = 9, R_SCORPION = 13, R_SNAKE = 14, R_SKELETON = 16, R_DEMON = 17, R_MAGE = 18, R_WHITEWALKER = 23, R_VAMPIRE = 24, R_KRAKEN = 25, R_SANDWORM = 26, R_BASILISK = 27;
const T_DEEP = 0, T_WATER = 1, T_SAND = 2, T_GRASS = 3, T_FOREST = 4, T_MOUNTAIN = 6, T_SNOW = 7, T_LAVA = 8, T_BURNT = 9, T_ICE = 10;
const OFF_ACT = 120, OFF_ACTN = 121, OFF_RNGS = 95, OFF_TICK = 96, OFF_EPS = 100, OFF_LAWS = 101, OFF_FXP = 102;
const ACT_CAP = 262144, FXMIN_CAP = 1600, PANIC_CAP = 32;
const ACT_FX = 1, ACT_FX_EVICT = 2, ACT_SND = 3, ACT_EVT = 4, ACT_TOAST = 5, ACT_TERRAIN = 6, ACT_IGNITE = 7, ACT_FIRE_CLEAR = 8, ACT_CIV = 12, ACT_FAM_ONKILL = 16, ACT_BATTLE = 17, ACT_WARKILL = 18, ACT_TELEM = 21, ACT_CORPSE = 22, ACT_BLOOD = 23;
const FX_BLESS = 1, FX_CURSE = 2, FX_HAMMER = 4, FX_HIT = 5, FX_SPAWN = 6, FX_EXPLOSION = 8, FX_BLOOD = 9, FX_DMG = 10, FX_HEART = 11, FX_COIN = 12, FX_DUST = 13, FX_TSUNAMI = 14, FX_FIREBALL = 15, FX_ARROW = 16, FX_BULLET = 17, FX_LASER = 18;
const TXT_NONE = 0, TXT_DEVOUR = 1, TXT_PETRIFY = 2, TXT_POISON = 3, TXT_MISS = 4, TXT_NUM = 5;
const EVT_SHIPWRECK = 1, EVT_PETRIFY = 2, EVT_REVENGE = 3, EVT_LEGEND = 4, EVT_WAR_FLEET = 9;
const BAIL_BOAT = 1;
const EP_FIRE_DMG = 4, EP_PANIC_DECAY = 9, EP_PANIC_ROUT = 10, EP_GRUDGE_DECAY = 11;
const LAW_REPRO = 1, LAW_ZINFECT = 2, LAW_UNDEAD_RISE = 4;
const FXP_DMGNUM = 1, FXP_AMB = 2, FXP_BLOOD = 4, FXP_CORPSES = 8;
const TBT_FLAMMABLE = 4;
const TBF_FLYING = 32, TBF_AQUATIC = 64, TBF_SANDSWIM = 128;
const RF2_LAVAIMM = 1, RF2_NIGHTSIGHT = 2;
const RB_SPEED = 2, RB_REACH = 5, RB_RNG_RANGE = 7, RB_RNG_DMG = 8, RB_RNG_CD = 9;
const JB_RNG = 4;
const IT_ARMOR = 0, IT_CRIT = 1, IT_LIFE = 2, IT_THORNS = 3, IT_REGEN = 4, IT_RNG = 5, IT_SPDMUL = 6;
const NW_ACC = 0, NW_STANCE = 256, NW_FBC = 576, NW_FRL = 768;

// —— 访问器（wasm 内存直读；与 C# WbArena 访问器同构）——
const AP = () => ex.wb_arena_ptr();
const OFF = (id) => ex.wb_off(id);
const u8at = (id, i) => new Uint8Array(mem.buffer, AP() + OFF(id))[i];
const setU8at = (id, i, v) => { new Uint8Array(mem.buffer, AP() + OFF(id))[i] = v & 0xff; };
const i32at = (id, i) => new DataView(mem.buffer).getInt32(AP() + OFF(id) + i * 4, true);
const u32at = (id, i) => new DataView(mem.buffer).getUint32(AP() + OFF(id) + i * 4, true);
const setI32at = (id, i, v) => new DataView(mem.buffer).setInt32(AP() + OFF(id) + i * 4, v | 0, true);
const setU32at = (id, i, v) => new DataView(mem.buffer).setUint32(AP() + OFF(id) + i * 4, v >>> 0, true);
const f64at = (id, i) => new DataView(mem.buffer).getFloat64(AP() + OFF(id) + i * 8, true);
const setF64at = (id, i, v) => new DataView(mem.buffer).setFloat64(AP() + OFF(id) + i * 8, v, true);

// —— 数学（WbMath 镜像；js_min/js_max NaN 传染）——
const jsMin = (a, b) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : a < b ? a : b);
const jsMax = (a, b) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : a > b ? a : b);
const truthyF = (v) => v === v && v !== 0;
const jsRound = (x) => Math.floor(x + 0.5);
// fdlibm 六件套（WbMath.FdExp/FdExpm1/FdTanh/FdAtan/FdAtan2/FdSin/FdCos 的 JS 镜像）
const bitsOf = (x) => new BigUint64Array(new Float64Array([x]).buffer)[0];
const fromBits = (b) => new Float64Array(new BigUint64Array([b]).buffer)[0];
const hi32 = (x) => Number((bitsOf(x) >> 32n) & 0xffffffffn) | 0;
const lo32 = (x) => Number(bitsOf(x) & 0xffffffffn) >>> 0;
function setHi(x, h) { const b = bitsOf(x); return fromBits((b & 0xffffffffn) | (BigInt(h >>> 0) << 32n)); }
function xorHi(x, h) { const cur = Number((bitsOf(x) >> 32n) & 0xffffffffn) | 0; return setHi(x, cur ^ h); }
const E_HALF = [0.5, -0.5], E_LN2_HI = [6.93147180369123816490e-01, -6.93147180369123816490e-01], E_LN2_LO = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
function fdExp(x) {
  let y, hi_ = 0.0, lo_ = 0.0, k, xsb;
  const uhx = hi32(x) >>> 0;
  xsb = (uhx >> 31) & 1;
  const hx = uhx & 0x7fffffff;
  if (hx >= 0x40862E42) {
    if (hx >= 0x7ff00000) {
      if (((hx & 0xfffff) | lo32(x)) !== 0) return x + x;
      return xsb === 0 ? x : 0.0;
    }
    if (x > 7.09782712893383973096e+02) return 1e300 * 1e300;
    if (x < -7.45133219101941108420e+02) return 9.33263618503218878990e-302 * 9.33263618503218878990e-302;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) { hi_ = x - E_LN2_HI[xsb]; lo_ = E_LN2_LO[xsb]; k = 1 - xsb - xsb; }
    else { k = (1.44269504088896338700e+00 * x + E_HALF[xsb]) | 0; const t = k; hi_ = x - t * E_LN2_HI[0]; lo_ = t * E_LN2_LO[0]; }
    x = hi_ - lo_;
  } else if (hx < 0x3e300000) {
    if (1e300 + x > 1.0) return 1.0 + x;
    k = 0;
  } else k = 0;
  const t2 = x * x;
  const c = x - t2 * (1.66666666666666019037e-01 + t2 * (-2.77777777770155933842e-03 + t2 * (6.61375632143793436117e-05 + t2 * (-1.65339022054652515390e-06 + t2 * 4.13813679705723846039e-08))));
  if (k === 0) return 1.0 - ((x * c) / (c - 2.0) - x);
  y = 1.0 - ((lo_ - (x * c) / (2.0 - c)) - hi_);
  if (k >= -1021) return setHi(y, (hi32(y) >>> 0) + (k << 20));
  const y2 = setHi(y, (hi32(y) >>> 0) + ((k + 1000) << 20));
  return y2 * 9.33263618503218878990e-302;
}
function fdExpm1(x) {
  let y, k;
  const bhx = bitsOf(x);
  const xsb = Number(bhx >> 63n) & 1;
  y = xsb === 0 ? x : -x;
  const hx = Number(bhx >> 32n) & 0x7fffffff;
  if (hx >= 0x4043687A) {
    if (hx >= 0x40862E42) {
      if (hx >= 0x7ff00000) {
        if (((hx & 0xfffff) | lo32(x)) !== 0) return x + x;
        return xsb === 0 ? x : -1.0;
      }
      if (x > 7.09782712893383973096e+02) return 1e300 * 1e300;
    }
    if (xsb !== 0 && x + 1e-300 < 0.0) return 1e-300 - 1.0;
  }
  let hi_, lo_, c = 0.0;
  if (hx > 0x3fd62e42) {
    if (hx < 0x3ff0a2b2) {
      if (xsb === 0) { hi_ = x - 6.93147180369123816490e-01; lo_ = 1.90821492927058770002e-10; k = 1; }
      else { hi_ = x + 6.93147180369123816490e-01; lo_ = -1.90821492927058770002e-10; k = -1; }
    } else {
      k = (1.44269504088896338700e+00 * x + (xsb === 0 ? 0.5 : -0.5)) | 0;
      const t = k; hi_ = x - t * 6.93147180369123816490e-01; lo_ = t * 1.90821492927058770002e-10;
    }
    x = hi_ - lo_;
    c = (hi_ - x) - lo_;
  } else if (hx < 0x3c900000) {
    const t = 1e300 + x;
    return x - (t - (1e300 + x));
  } else k = 0;
  const hfx = 0.5 * x, hxs = x * hfx;
  const r1 = 1.0 + hxs * (-3.33333333333331316428e-02 + hxs * (1.58730158725481460165e-03 + hxs * (-7.93650757867487942473e-05 + hxs * (4.00821782732936239552e-06 + hxs * -2.01099218183624371326e-07))));
  const t2 = 3.0 - r1 * hfx;
  let e = hxs * ((r1 - t2) / (6.0 - x * t2));
  if (k === 0) return x - (x * e - hxs);
  e = x * (e - c) - c;
  e -= hxs;
  if (k === -1) return 0.5 * (x - e) - 0.5;
  if (k === 1) {
    if (x < -0.25) return -2.0 * (e - (x + 0.5));
    return 1.0 + 2.0 * (x - e);
  }
  if (k <= -2 || k > 56) {
    y = 1.0 - (e - x);
    y = setHi(y, (hi32(y) >>> 0) + (k << 20));
    return y - 1.0;
  }
  let t3 = 1.0;
  if (k < 20) {
    t3 = setHi(t3, 0x3ff00000 - (0x200000 >> k));
    y = t3 - (e - x);
    y = setHi(y, (hi32(y) >>> 0) + (k << 20));
  } else {
    t3 = setHi(t3, ((0x3ff - k) << 20));
    y = x - (e + t3);
    y += 1.0;
    y = setHi(y, (hi32(y) >>> 0) + (k << 20));
  }
  return y;
}
function fdTanh(x) {
  let t, z;
  const jx = hi32(x);
  const ix = (jx >>> 0) & 0x7fffffff;
  if (ix >= 0x7ff00000) {
    if (jx >= 0) return 1.0 / x + 1.0;
    return 1.0 / x - 1.0;
  }
  if (ix < 0x40360000) {
    if (ix < 0x3c800000) return x * (1.0 + x);
    if (ix >= 0x3ff00000) { t = fdExpm1(2.0 * Math.abs(x)); z = 1.0 - 2.0 / (t + 2.0); }
    else { t = fdExpm1(-2.0 * Math.abs(x)); z = -t / (t + 2.0); }
  } else z = 1.0 - 1e-300;
  return jx >= 0 ? z : -z;
}
const A_ATANHI = [4.63647609000806093515e-01, 7.85398163397448278999e-01, 9.82793723247329054082e-01, 1.57079632679489655800e+00];
const A_ATANLO = [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17];
const A_AT = [3.33333333333329318027e-01, -1.99999999998764832476e-01, 1.42857142725034663711e-01, -1.11111104054623557880e-01, 9.09088713343650656196e-02, -7.69187620504482999495e-02, 6.66107313738753120669e-02, -5.83357013379057348645e-02, 4.97687799461593236017e-02, -3.65315727442169155270e-02, 1.62858201153657823623e-02];
function fdAtan(x) {
  let w, s1, s2, z, id;
  const hx = hi32(x);
  const ix = (hx >>> 0) & 0x7fffffff;
  if (ix >= 0x44100000) {
    if (ix > 0x7ff00000 || (ix === 0x7ff00000 && lo32(x) !== 0)) return x + x;
    return hx > 0 ? A_ATANHI[3] + A_ATANLO[3] : -A_ATANHI[3] - A_ATANLO[3];
  }
  if (ix < 0x3fdc0000) {
    if (ix < 0x3e200000 && 1e300 + x > 1.0) return x;
    id = -1;
  } else {
    x = Math.abs(x);
    if (ix < 0x3ff30000) {
      if (ix < 0x3fe60000) { id = 0; x = (2.0 * x - 1.0) / (2.0 + x); }
      else { id = 1; x = (x - 1.0) / (x + 1.0); }
    } else if (ix < 0x40038000) { id = 2; x = (x - 1.5) / (1.0 + 1.5 * x); }
    else { id = 3; x = -1.0 / x; }
  }
  z = x * x;
  w = z * z;
  s1 = z * (A_AT[0] + w * (A_AT[2] + w * (A_AT[4] + w * (A_AT[6] + w * (A_AT[8] + w * A_AT[10])))));
  s2 = w * (A_AT[1] + w * (A_AT[3] + w * (A_AT[5] + w * (A_AT[7] + w * A_AT[9]))));
  if (id < 0) return x - x * (s1 + s2);
  z = A_ATANHI[id] - ((x * (s1 + s2) - A_ATANLO[id]) - x);
  return hx < 0 ? -z : z;
}
const AT2_TINY = 1e-300, AT2_PI_O_4 = 7.8539816339744827900e-01, AT2_PI_O_2 = 1.5707963267948965580e+00, AT2_PI = 3.1415926535897931160e+00, AT2_PI_LO = 1.2246467991473531772e-16;
function fdAtan2(y, x) {
  let z;
  const hx = hi32(x), ix = (hx >>> 0) & 0x7fffffff, lx = lo32(x);
  const hy = hi32(y), iy = (hy >>> 0) & 0x7fffffff, ly = lo32(y);
  if ((ix | ((lx | (0 - lx) >>> 0) >> 31)) > 0x7ff00000 || (iy | ((ly | (0 - ly) >>> 0) >> 31)) > 0x7ff00000) return x + y;
  if ((((hx >>> 0) - 0x3ff00000) | lx) === 0) return fdAtan(y);
  const m = ((hy >>> 31) & 1) | (((hx >>> 30)) & 2);
  if ((iy | ly) === 0) {
    if (m === 0 || m === 1) return y;
    return m === 2 ? AT2_PI + AT2_TINY : -AT2_PI - AT2_TINY;
  }
  if ((ix | lx) === 0) return hy < 0 ? -AT2_PI_O_2 - AT2_TINY : AT2_PI_O_2 + AT2_TINY;
  if (ix === 0x7ff00000) {
    if (iy === 0x7ff00000) {
      if (m === 0) return AT2_PI_O_4 + AT2_TINY;
      if (m === 1) return -AT2_PI_O_4 - AT2_TINY;
      return m === 2 ? 3.0 * AT2_PI_O_4 + AT2_TINY : -3.0 * AT2_PI_O_4 - AT2_TINY;
    }
    if (m === 0) return 0.0;
    if (m === 1) return -0.0;
    return m === 2 ? AT2_PI + AT2_TINY : -AT2_PI - AT2_TINY;
  }
  if (iy === 0x7ff00000) return hy < 0 ? -AT2_PI_O_2 - AT2_TINY : AT2_PI_O_2 + AT2_TINY;
  const k = ((iy - ix) | 0) >> 20;
  if (k > 60) z = AT2_PI_O_2 + 0.5 * AT2_PI_LO;
  else if (hx < 0 && k < -60) z = 0.0;
  else z = fdAtan(Math.abs(y / x));
  if (m === 0) return z;
  if (m === 1) return xorHi(z, 0x80000000);
  if (m === 2) return AT2_PI - (z - AT2_PI_LO);
  return (z - AT2_PI_LO) - AT2_PI;
}
const S_HALF = 0.5, S_S1 = -1.66666666666666324348e-01, S_S2 = 8.33333333332248946124e-03, S_S3 = -1.98412698298579493134e-04, S_S4 = 2.75573137070700676789e-06, S_S5 = -2.50507602534068634195e-08, S_S6 = 1.58969099521155010221e-10;
function kSin(x, y, iy) {
  const ix = (hi32(x) >>> 0) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0.0) return x;
  const z = x * x, v = z * x;
  const r = S_S2 + z * (S_S3 + z * (S_S4 + z * (S_S5 + z * S_S6)));
  if (iy === 0) return x + v * (S_S1 + z * r);
  return x - ((z * (S_HALF * y - v * r) - y) - v * S_S1);
}
const C_C1 = 4.16666666666666019037e-02, C_C2 = -1.38888888888741095749e-03, C_C3 = 2.48015872894767294178e-05, C_C4 = -2.75573143513906633035e-07, C_C5 = 2.08757232129817482790e-09, C_C6 = -1.13596475577881948265e-11;
function kCos(x, y) {
  const ix = (hi32(x) >>> 0) & 0x7fffffff;
  if (ix < 0x3e400000 && Math.trunc(x) === 0.0) return 1.0;
  const z = x * x;
  const r = z * (C_C1 + z * (C_C2 + z * (C_C3 + z * (C_C4 + z * (C_C5 + z * C_C6)))));
  if (ix < 0x3FD33333) return 1.0 - (0.5 * z - (z * r - x * y));
  const qx = ix > 0x3fe90000 ? 0.28125 : setHi(0.0, ix - 0x00200000);
  const hz = 0.5 * z - qx;
  const a = 1.0 - qx;
  return a - (hz - (z * r - x * y));
}
const RP_PIO2_1 = 1.57079632673412561417e+00, RP_PIO2_1T = 6.07710050650619224932e-11, RP_PIO2_2 = 6.07710050630396597660e-11, RP_PIO2_2T = 2.02226624879595063154e-21, RP_PIO2_3 = 2.02226624871116645580e-21, RP_PIO2_3T = 8.47842766036889956997e-32, RP_INVPIO2 = 6.36619772367581382433e-01;
const RP_NPIO2_HW = [0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C, 0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB];
function remPio2Med(x, y) {
  const hx = hi32(x);
  const ix = (hx >>> 0) & 0x7fffffff;
  if (ix <= 0x3fe921fb) { y[0] = x; y[1] = 0.0; return 0; }
  if (ix < 0x4002d97c) {
    let z;
    if (hx > 0) {
      z = x - RP_PIO2_1;
      if (ix !== 0x3ff921fb) { y[0] = z - RP_PIO2_1T; y[1] = (z - y[0]) - RP_PIO2_1T; }
      else { z -= RP_PIO2_2; y[0] = z - RP_PIO2_2T; y[1] = (z - y[0]) - RP_PIO2_2T; }
      return 1;
    }
    z = x + RP_PIO2_1;
    if (ix !== 0x3ff921fb) { y[0] = z + RP_PIO2_1T; y[1] = (z - y[0]) + RP_PIO2_1T; }
    else { z += RP_PIO2_2; y[0] = z + RP_PIO2_2T; y[1] = (z - y[0]) + RP_PIO2_2T; }
    return -1;
  }
  if (ix <= 0x413921fb) {
    let t = Math.abs(x);
    const n = (t * RP_INVPIO2 + 0.5) | 0;
    const fn = n;
    let r = t - fn * RP_PIO2_1;
    let w = fn * RP_PIO2_1T;
    if (n < 32 && ix !== RP_NPIO2_HW[n - 1]) {
      y[0] = r - w;
    } else {
      const j = ix >> 20;
      y[0] = r - w;
      let i = j - (((hi32(y[0]) >>> 0) >> 20) & 0x7ff);
      if (i > 16) {
        t = r;
        w = fn * RP_PIO2_2;
        r = t - w;
        w = fn * RP_PIO2_2T - ((t - r) - w);
        y[0] = r - w;
        i = j - (((hi32(y[0]) >>> 0) >> 20) & 0x7ff);
        if (i > 49) {
          const t2 = r;
          const w2 = fn * RP_PIO2_3;
          const r2 = t2 - w2;
          const w3 = fn * RP_PIO2_3T - ((t2 - r2) - w2);
          y[0] = r2 - w3;
        }
      }
    }
    y[1] = (r - y[0]) - w;
    if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
    return n;
  }
  y[0] = x; y[1] = 0.0;
  return 0;
}
function fdSin(x) { const y = [0, 0]; const n = remPio2Med(x, y); switch (n & 3) { case 0: return kSin(y[0], y[1], 1); case 1: return kCos(y[0], y[1]); case 2: return -kSin(y[0], y[1], 1); default: return -kCos(y[0], y[1]); } }
function fdCos(x) { const y = [0, 0]; const n = remPio2Med(x, y); switch (n & 3) { case 0: return kCos(y[0], y[1]); case 1: return -kSin(y[0], y[1], 1); case 2: return -kCos(y[0], y[1]); default: return kSin(y[0], y[1], 1); } }
// fd_hypot（WbMath.FdHypot 镜像，M-U2a 已对账 20 万样本——此处直接复用算法）
function fdHypot(x, y) {
  let a = x, b = y, ha = (hi32(x) >>> 0) & 0x7fffffff, hb = (hi32(y) >>> 0) & 0x7fffffff, k = 0;
  if (hb > ha) { [a, b] = [b, a]; [ha, hb] = [hb, ha]; }
  a = setHi(a, ha); b = setHi(b, hb);
  if (ha - hb > 0x3c00000) return a + b;
  if (ha > 0x5f300000) {
    if (ha >= 0x7ff00000) {
      let w = a + b;
      if (((ha & 0xfffff) | lo32(a)) === 0) w = a;
      if (((hb ^ 0x7ff00000) | lo32(b)) === 0) w = b;
      return w;
    }
    ha -= 0x25800000; hb -= 0x25800000; k += 600;
    a = setHi(a, ha); b = setHi(b, hb);
  }
  if (hb < 0x20b00000) {
    if (hb <= 0x000fffff) {
      if ((hb | lo32(b)) === 0) return a;
      const t1 = setHi(0.0, 0x7fd00000);
      b *= t1; a *= t1; k -= 1022;
    } else {
      ha += 0x25800000; hb += 0x25800000; k -= 600;
      a = setHi(a, ha); b = setHi(b, hb);
    }
  }
  let w = a - b, t1, t2;
  if (w > b) {
    t1 = setHi(0.0, ha);
    t2 = a - t1;
    w = Math.sqrt(t1 * t1 - (b * (-b) - t2 * (a + t1)));
  } else {
    a = a + a;
    const y1 = setHi(0.0, hb);
    const y2 = b - y1;
    t1 = setHi(0.0, ha + 0x00100000);
    t2 = a - t1;
    w = Math.sqrt(t1 * y1 - (w * (-w) - (t1 * y2 + t2 * b)));
  }
  if (k !== 0) {
    let t3 = 1.0;
    t3 = setHi(t3, (hi32(t3) >>> 0) + (k << 20));
    return t3 * w;
  }
  return w;
}

// —— 引擎内建状态 ——
let actCur = 0, overflow = false, ctxBw = 256, ctxBh = 160, parity = 0;
function actReserve(bytes) {
  const cur = actCur;
  if (cur + bytes > ACT_CAP) { overflow = true; return null; }
  actCur = cur + bytes;
  return cur;
}
// ACT 记录为字节偏移布局（u8@0/u32@4/f64@16..）——直写字节，勿用元素索引访问器
const actBase = () => AP() + OFF(OFF_ACT);
const actU8 = (p, v) => { new Uint8Array(mem.buffer, actBase())[p] = v & 0xff; };
const actU32raw = (p, v) => new DataView(mem.buffer).setUint32(actBase() + p, v >>> 0, true);
const actI32 = (p, v) => actU32raw(p, v | 0);
const actF64 = (p, v) => new DataView(mem.buffer).setFloat64(actBase() + p, v, true);
function rngNext() { let a = u32at(OFF_RNGS, 0); a = (a + 0x6d2b79f5) >>> 0; let t = (a ^ (a >>> 15)); t = Math.imul(t, 1 | a) >>> 0; const t2 = ((t + (Math.imul((t ^ (t >>> 7)), 61 | t) >>> 0)) ^ t) >>> 0; setU32at(OFF_RNGS, 0, a); return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296; }
const ep = (i) => f64at(OFF_EPS, i);
const raceFlag = (r) => u8at(11 /* RACE_FLAGS */, r);
const raceFlag2 = (r) => u8at(131 /* OFF_TBF */, r * 2 + 1);
const isCiv = (r) => (raceFlag(r) & F_CIV) !== 0;
const isHostile = (r) => (raceFlag(r) & F_HOSTILE) !== 0;
const isUndead = (r) => (raceFlag(r) & F_UNDEAD) !== 0;
const isPredator = (r) => (raceFlag(r) & F_PREDATOR) !== 0;
function isHerbivore(r) {
  for (let i = 0; i < 32; i++) {
    if ((u8at(11, r) & F_HERBIVORE) !== 0) return true;
    const p = i32at(12 /* OFF_DYN_PARENT */, r);
    if (p < 0) return false;
    r = p >>> 0;
  }
  return false;
}
function dirty(s) {
  const bit = 1 << (s & 7), byt = s >> 3;
  if ((u8at(126 /* OFF_DIRTY */, byt) & bit) === 0) {
    setU8at(126, byt, u8at(126, byt) | bit);
    const n = i32at(128 /* OFF_DLISTN */, 0);
    if (n >>> 0 < MAX_UNITS) { setU32at(127 /* OFF_DLIST */, n, s >>> 0); setI32at(128, 0, n + 1); }
  }
}
const uHasPanic = (s) => u8at(15 /* OFF_UHASPANIC */, s) !== 0;
const uPanic0 = (s) => (uHasPanic(s) ? f64at(2 /* OFF_UPANIC */, s) : 0.0);
const uGlen = (s) => i32at(57 /* OFF_UGLN */, s);
const uFood0 = (s) => { const v = f64at(28 /* OFF_UFD */, s); return Number.isNaN(v) ? 70.0 : v; };
const uCaravan0 = (s) => { const v = f64at(50 /* OFF_UCVN */, s); return Number.isNaN(v) ? 0.0 : v; };
const uJob0 = (s) => { const j = i32at(43 /* OFF_UJOB */, s); return j < 0 ? 0 : j; };
function setPanic(s, v) { setU8at(15, s, 1); setF64at(2, s, v); dirty(s); }
function clearPanic(s) { setU8at(15, s, 0); dirty(s); }
function atWar(a, b) { if (a < 0 || b < 0 || a === b) return false; return u8at(13 /* OFF_ATWAR */, a * MAX_CIVS + b) !== 0; }
function civAtWar(c) {
  const n = i32at(67 /* OFF_CIVN */, 0);
  for (let b = 0; b < Math.max(n, 0); b++) {
    if (b >= MAX_CIVS) break;
    if (b === c) continue;
    if (u8at(72 /* OFF_CVAL */, b) !== 0 && atWar(c, b)) return true;
  }
  return false;
}
// LUT 敌我（lib.rs L456-461；lut_off = align8(RACE_FLAGS_off + 512)）
const lutOff = () => (OFF(11) + MAX_RACES + 7) & ~7;
const lutGet = (key) => new Uint8Array(mem.buffer, AP() + lutOff())[key];
const lutSet = (key, v) => { new Uint8Array(mem.buffer, AP() + lutOff())[key] = v; };
function isEnemyFull(a, b) {
  const ra = u32at(5, a) >>> 0, rb = u32at(5, b) >>> 0;
  const fa = u8at(11, ra), fb = u8at(11, rb);
  if ((fa & F_UNDEAD) !== 0 && (fb & F_UNDEAD) !== 0) return false;
  if (ra === R_ZOMBIE || rb === R_ZOMBIE) return ra !== rb;
  if (ra === R_SKELETON || rb === R_SKELETON) return ra !== rb;
  if (ra === R_WHITEWALKER || rb === R_WHITEWALKER) return ra !== rb;
  if (ra === R_DRAGON || rb === R_DRAGON) return ra !== rb;
  if (ra === R_DEMON || rb === R_DEMON) return ra !== rb;
  if (ra === R_KRAKEN || rb === R_KRAKEN) return ra !== rb;
  if (ra === R_SANDWORM || rb === R_SANDWORM) return ra !== rb;
  if (ra === R_BASILISK || rb === R_BASILISK) return ra !== rb;
  if ((fa & F_HOSTILE) !== 0 && (fb & F_CIV) !== 0) return true;
  if ((fb & F_HOSTILE) !== 0 && (fa & F_CIV) !== 0) return true;
  if ((fa & F_PREDATOR) !== 0 && isHerbivore(rb)) return true;
  if ((fa & F_PREDATOR) !== 0 && ra === R_BEAR && (fb & F_CIV) !== 0) return true;
  if (ra === R_SCORPION && isHerbivore(rb)) return true;
  if (ra === R_SNAKE && (isHerbivore(rb) || rb === R_SCORPION)) return true;
  const ca = i32at(4, a), cb = i32at(4, b);
  if (ca >= 0 && cb >= 0 && ca !== cb) return u8at(13, ca * MAX_CIVS + cb) !== 0;
  return false;
}
function isEnemySlot(a, b) {
  if (i32at(4, a) < 0 && i32at(4, b) < 0) {
    const ra = u32at(5, a) >>> 0, rb = u32at(5, b) >>> 0;
    const key = ra * MAX_RACES + rb;
    const hit = lutGet(key);
    if (hit === 1) return false;
    if (hit === 2) return true;
    const r = isEnemyFull(a, b);
    lutSet(key, r ? 2 : 1);
    return r;
  }
  return isEnemyFull(a, b);
}
const idx = (x, y) => y * W + x;
function setTerrain(ctxUnused, i, t) {
  const prev = u8at(60 /* OFF_TERR */, i);
  if (prev === t) return;
  setU8at(60, i, t);
  if (u8at(61 /* OFF_FIREG */, i) > 0) {
    setU8at(61, i, 0);
    const n = i32at(145 /* OFF_FIREN */, 0);
    if (n > 0) setI32at(145, 0, n - 1);
  }
  const p = actReserve(8);
  if (p !== null) { actU8(p, ACT_TERRAIN); actI32(p + 1, i); actU8(p + 5, t); }
}
function ignite(ctxUnused, i) {
  const t = u8at(60, i);
  if (u8at(61, i) > 0) return;
  if ((u8at(139 /* OFF_TBT */, t) & TBT_FLAMMABLE) === 0 && u8at(64 /* OFF_BLDK */, i) === 0) return;
  const val = (150.0 + Math.floor(rngNext() * 90.0)) & 0xff;
  setU8at(61, i, val);
  setI32at(145, 0, i32at(145, 0) + 1);
  const p = actReserve(8);
  if (p !== null) { actU8(p, ACT_IGNITE); actI32(p + 1, i); actU8(p + 5, val); }
}
const fxIsMinor = (kind) => kind === FX_HIT || kind === FX_SPAWN || kind === FX_HEART || kind === 7 || kind === FX_ARROW || kind === FX_COIN || kind === FX_BLOOD || kind === FX_DUST || kind === FX_BULLET || kind === FX_DMG;
function fx(ctxUnused, kind, x, y, ttl, r, x0, y0, dmg, srcCiv, quiet, textOp, textArg, hasOpts) {
  const density = u8at(102 /* OFF_FXP */, 0) >> 4;
  const cap = density === 0 ? 260 : density === 2 ? 1500 : 620;
  const len = i32at(103 /* OFF_FXLEN */, 0);
  let minorN = i32at(105 /* OFF_FXMINN */, 0);
  let evictVictim = -1;
  if (len >= cap) {
    if (minorN > 0) evictVictim = i32at(104 /* OFF_FXMIN */, 0);
    if (evictVictim >= 0) {
      for (let i = 0; i < minorN - 1; i++) {
        const v = i32at(104, i + 1);
        setI32at(104, i, v > evictVictim ? v - 1 : v);
      }
      setI32at(105, 0, minorN - 1);
      minorN -= 1;
      const p = actReserve(8);
      if (p !== null) { actU8(p, ACT_FX_EVICT); actI32(p + 4, evictVictim); }
    } else if (fxIsMinor(kind)) return false;
  }
  rngNext(); rngNext();
  if (fxIsMinor(kind)) {
    let insertAt = minorN;
    for (let i = 0; i < minorN; i++) {
      if (i32at(104, i) > len) { insertAt = i; break; }
    }
    let i2 = minorN;
    while (i2 > insertAt) { setI32at(104, i2, i32at(104, i2 - 1)); i2 -= 1; }
    if (minorN < FXMIN_CAP) { setI32at(104, insertAt, len); setI32at(105, 0, minorN + 1); }
  }
  setI32at(103, 0, len + 1);
  const q = actReserve(76);
  if (q !== null) {
    actU8(q, ACT_FX); actU8(q + 1, kind); actU8(q + 2, quiet ? 1 : 0); actU8(q + 3, textOp);
    actU32raw(q + 4, textArg >>> 0);
    actI32(q + 8, srcCiv);
    actF64(q + 16, ttl); actF64(q + 24, x); actF64(q + 32, y); actF64(q + 40, r);
    actF64(q + 48, hasOpts ? x0 : NaN); actF64(q + 56, hasOpts ? y0 : NaN); actF64(q + 64, hasOpts ? dmg : NaN);
  }
  return true;
}
function findWaterNear(x, y, r) {
  const cx = Math.floor(x), cy = Math.floor(y);
  for (let ring = 1; ring <= r; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if ((u8at(139, u8at(60, idx(xx, yy))) & 2) !== 0) return [true, xx + 0.5, yy + 0.5];
      }
    }
  }
  return [false, 0.0, 0.0];
}
function maybeBoardForWar(ctxUnused, s) {
  if (u8at(48 /* OFF_UBOAT */, s) !== 0 || !isCiv(u32at(5, s))) return false;
  const job = uJob0(s);
  if (job !== 2 && job !== 3) return false;
  const uciv = i32at(4, s);
  if (uciv < 0 || !civAtWar(uciv)) return false;
  const ux = f64at(0, s), uy = f64at(1, s), tx = f64at(18, s), ty = f64at(19, s);
  const dx = tx - ux, dy = ty - uy;
  const d = fdHypot(dx, dy);
  if (d < 8.0) return false;
  const samples = jsMax(1.0, Math.floor(d));
  let water = 0;
  for (let sk = 1.0; sk <= samples; sk += 1.0) {
    const xx = Math.floor(ux + (dx * sk) / d), yy = Math.floor(uy + (dy * sk) / d);
    if (xx >= 0 && yy >= 0 && xx < W && yy < H && (u8at(139, u8at(60, idx(xx, yy))) & 2) !== 0) water += 1;
  }
  if (water / samples < 0.45) return false;
  const cur = u8at(60, idx(Math.floor(ux), Math.floor(uy)));
  if ((u8at(139, cur) & 2) !== 0) return false;
  const [found, dockx, docky] = findWaterNear(ux, uy, 4);
  if (!found) return false;
  const ttl = 700.0 + Math.floor(rngNext() * 300.0);
  const sharedTx = tx, sharedTy = ty;
  const board = (o) => {
    setU8at(48, o, 1);
    setI32at(49 /* OFF_UBTL */, o, ttl | 0);
    const nx = dockx + (rngNext() - 0.5) * 1.2;
    const ny = docky + (rngNext() - 0.5) * 1.2;
    setF64at(0, o, nx); setF64at(1, o, ny);
    setF64at(30 /* OFF_ULX */, o, nx); setF64at(31 /* OFF_ULY */, o, ny);
    setF64at(18, o, sharedTx); setF64at(19, o, sharedTy);
    dirty(o);
    fx(null, FX_SPAWN, nx, ny, 24.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
  };
  board(s);
  let fleet = 1;
  const live = i32at(99 /* OFF_USEQ */, 0) >= 0 ? u32at(99, 0) : 0; // 占位；live_len 由宿主维护——见下
  void live;
  // live_len 语义：批内即 MAX 遍历上限（wasm state().live_len）——C# 同为 WbSim.Arena.LiveLen
  const liveLen = liveLenOf();
  for (let o = 0; o < liveLen; o++) {
    if (fleet >= 4) break;
    if (o === s || u8at(14, o) !== 0 || u8at(48, o) !== 0 || i32at(4, o) !== uciv) continue;
    const ojob = uJob0(o);
    if (ojob !== 2 && ojob !== 3) continue;
    if (fdHypot(f64at(0, o) - ux, f64at(1, o) - uy) > 6.0) continue;
    board(o);
    fleet += 1;
  }
  if (fleet >= 3) {
    const p = actReserve(48);
    if (p !== null) {
      actU8(p, ACT_EVT); actU8(p + 1, EVT_WAR_FLEET); actI32(p + 4, uciv);
      actF64(p + 16, fleet); actF64(p + 32, ux); actF64(p + 40, uy);
    }
  }
  return true;
}
// live_len：wasm 无直接导出——以 DLIST 前值不可靠；改用 UBAR 扫描不可行。等价实现：
// 宿主 gen 脚本布置后 live = units.length（pack_end(n) 的 n）；转录端由 unitsBatch 传入。
let LIVE_LEN = 0;
function liveLenOf() { return LIVE_LEN; }
function moveUnit(ctxUnused, s, mul) {
  const race = u32at(5, s) >>> 0;
  const ux = f64at(0, s), uy = f64at(1, s), tx = f64at(18, s), ty = f64at(19, s);
  const dx = tx - ux, dy = ty - uy;
  const d = fdHypot(dx, dy);
  if (d < 0.05) return;
  let step = f64at(23, s) * 2.0 * mul
    * (truthyF(f64at(36 /* OFF_UCHILL */, s)) ? 0.55 : 1.0)
    * (truthyF(f64at(39 /* OFF_UCURSE */, s)) ? 0.75 : 1.0);
  if (u8at(63 /* OFF_ROAD */, idx(Math.floor(ux), Math.floor(uy))) > 0) step *= 1.45;
  const nx = ux + (dx / d) * step, ny = uy + (dy / d) * step;
  if (dx !== 0.0) setU8at(46 /* OFF_UFLIP */, s, dx < 0.0 ? 1 : 0);
  if ((u8at(131, race * 2) & TBF_FLYING) !== 0) {
    setF64at(0, s, jsMax(0.5, jsMin(W - 0.5, nx)));
    setF64at(1, s, jsMax(0.5, jsMin(H - 0.5, ny)));
    dirty(s);
    return;
  }
  const cur = u8at(60, idx(Math.floor(ux), Math.floor(uy)));
  if ((u8at(131, race * 2) & TBF_AQUATIC) !== 0) {
    const nt = u8at(60, idx(Math.floor(nx), Math.floor(ny)));
    if (nt === T_DEEP || nt === T_WATER) { setF64at(0, s, nx); setF64at(1, s, ny); }
    else {
      setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, ux + (rngNext() * 2.0 - 1.0) * 8.0)));
      setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, uy + (rngNext() * 2.0 - 1.0) * 8.0)));
    }
    dirty(s);
    return;
  }
  if ((u8at(131, race * 2) & TBF_SANDSWIM) !== 0) {
    const nt = u8at(60, idx(Math.floor(nx), Math.floor(ny)));
    if (nt === T_SAND || nt === T_GRASS || nt === T_BURNT) { setF64at(0, s, nx); setF64at(1, s, ny); }
    else {
      setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, ux + (rngNext() * 2.0 - 1.0) * 6.0)));
      setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, uy + (rngNext() * 2.0 - 1.0) * 6.0)));
    }
    if ((u8at(102, 0) & FXP_AMB) !== 0 && rngNext() < 0.08) fx(null, FX_DUST, f64at(0, s), f64at(1, s) + 0.5, 12.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
    dirty(s);
    return;
  }
  const swimming = cur === T_DEEP || cur === T_WATER;
  const onMountain = cur === T_MOUNTAIN;
  const passTile = (sw, om, t) => sw ? (t !== T_LAVA && t !== T_MOUNTAIN) : om ? (t !== T_DEEP && t !== T_WATER && t !== T_LAVA) : (u8at(139, t) & 1) !== 0;
  const passX = passTile(swimming, onMountain, u8at(60, idx(Math.floor(nx), Math.floor(uy))));
  const passY = passTile(swimming, onMountain, u8at(60, idx(Math.floor(ux), Math.floor(ny))));
  if (passX && passY) { setF64at(0, s, nx); setF64at(1, s, ny); }
  else if (passX) setF64at(0, s, nx);
  else if (passY) setF64at(1, s, ny);
  else {
    if (maybeBoardForWar(null, s)) { dirty(s); return; }
    setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, ux + (rngNext() * 2.0 - 1.0) * 6.0)));
    setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, uy + (rngNext() * 2.0 - 1.0) * 6.0)));
  }
  dirty(s);
}
// —— 神经（WbUnits 镜像）——
function fwdTanhAcc(w, nIn, nH, nOut, f) {
  const hid = new Array(nH).fill(0), out = new Array(nOut).fill(0);
  for (let t = 0; t < nH; t++) {
    let s = f64at(93 /* OFF_NEUW */, w + nIn * nH + t);
    for (let i = 0; i < nIn; i++) s += f[i] * f64at(93, w + i * nH + t);
    hid[t] = Math.fround(fdTanh(s));
  }
  const w2 = w + nIn * nH + nH;
  for (let j = 0; j < nOut; j++) {
    let s = f64at(93, w2 + nH * nOut + j);
    for (let t = 0; t < nH; t++) s += hid[t] * f64at(93, w2 + t * nOut + j);
    out[j] = Math.fround(s);
  }
  return out;
}
const teacherAcc = (f) => { const cover = (f[8] > 0.5 ? 0.12 : 0) + (f[9] > 0.5 ? 0.1 : 0); return jsMax(0.35, jsMin(0.97, 0.78 + f[0] * 0.15 - f[1] * 0.2 - cover)); };
const teacherStance = (f) => (f[1] < 0.28 && f[7] < 0.42 ? 3 : f[7] > 0.62 && (f[3] > 0.5 || f[6] > 0.5) ? 2 : f[0] > 0.7 && f[7] > 0.5 ? 1 : 0);
const teacherFlight = (f) => (f[1] > 0.72 && f[2] < 0.4 ? 1 : f[1] > 0.55 && f[2] < 0.5 && f[0] < 0.45 ? 1 : f[2] < 0.25 && f[5] > 0.5 ? 1 : 0);
function neuroAcc(f) {
  setU32at(141 /* OFF_NEUCALL */, 0, (u32at(141, 0) + 1) >>> 0);
  if ((u8at(94 /* OFF_NCTL */, 0) & 1) === 0) return teacherAcc(f);
  const out = fwdTanhAcc(NW_ACC, 10, 16, 1, f);
  return 1.0 / (1.0 + fdExp(-out[0]));
}
function neuroStance(f) {
  setU32at(141, 1, (u32at(141, 1) + 1) >>> 0);
  if ((u8at(94, 0) & 1) === 0) return teacherStance(f);
  const out = fwdTanhAcc(NW_STANCE, 12, 10, 4, f);
  let best = 0;
  for (let j = 1; j < out.length; j++) if (out[j] > out[best]) best = j;
  return best;
}
function neuroFlight(f) {
  setU32at(141, 2, (u32at(141, 2) + 1) >>> 0);
  if ((u8at(94, 0) & 1) === 0) return [teacherFlight(f), 0.0, 0.0];
  const mode = (u8at(94, 0) >> 1) & 3;
  const w = mode === 1 ? NW_FRL : NW_FBC;
  const out = fwdTanhAcc(w, 9, 8, 2, f);
  const m = jsMax(out[0], out[1]);
  const e0 = fdExp(out[0] - m), e1 = fdExp(out[1] - m), z = e0 + e1;
  return [out[1] > out[0] ? 1 : 0, Math.log(e0 / z), Math.log(e1 / z)];
}
function gearBonusOf(s) {
  let any = false;
  for (let k = 0; k < 7; k++) if (i32at(52 /* OFF_UGEAR */, s * 7 + k) >= 0) { any = true; break; }
  if (!any) return { armor: 0, crit: 0, lifesteal: 0, thorns: 0, regen: 0, ranged: 0, speed: 1.0 };
  const g = { armor: 0, crit: 0, lifesteal: 0, thorns: 0, regen: 0, ranged: 0, speed: 1.0 };
  for (let k = 0; k < 7; k++) {
    const item = i32at(52, s * 7 + k);
    if (item < 0) continue;
    const d = item;
    if (d >= MAX_ITEMDEFS || d >= i32at(134 /* OFF_TBIN */, 0)) continue;
    g.armor += f64at(133 /* OFF_TBI */, d * 12 + IT_ARMOR);
    g.crit += f64at(133, d * 12 + IT_CRIT);
    g.lifesteal += f64at(133, d * 12 + IT_LIFE);
    g.thorns += f64at(133, d * 12 + IT_THORNS);
    g.regen += f64at(133, d * 12 + IT_REGEN);
    g.ranged = jsMax(g.ranged, f64at(133, d * 12 + IT_RNG));
    g.speed *= f64at(133, d * 12 + IT_SPDMUL);
  }
  g.armor = jsMin(60.0, g.armor);
  g.speed = jsMax(0.85, jsMin(1.12, g.speed));
  return g;
}
const itemIsGun = (item) => (u32at(150 /* OFF_GUNBM */, item >> 5) & (1 << (item & 31))) !== 0;
const itemIsBeam = (item) => (u32at(151 /* OFF_BEAMBM */, item >> 5) & (1 << (item & 31))) !== 0;
function civDelta(ctxUnused, field, civ, d) {
  if (civ < 0) return;
  if (civ >= MAX_CIVS) return;
  const id = field === 0 ? 68 : field === 1 ? 69 : 70;
  setF64at(id, civ, f64at(id, civ) + d);
  const p = actReserve(16);
  if (p !== null) { actU8(p, ACT_CIV); actU8(p + 1, field); actI32(p + 4, civ); actF64(p + 8, d); }
}
function bumpWild(race, d) { const n = i32at(106 /* OFF_WILD */, race) + d; setI32at(106, race, n > 0 ? n : 0); }
function familyFindSp(id) {
  const n = i32at(78 /* OFF_FAMN */, 0);
  for (let i = 0; i < Math.max(n, 0); i++) {
    if (i >= MAX_FAM) break;
    if (i32at(79 /* OFF_FMID */, i) === id) return i;
  }
  return -1;
}
function spreadPlague(ctxUnused, s) {
  const live = liveLenOf();
  const ux = f64at(0, s), uy = f64at(1, s);
  for (let o = 0; o < live; o++) {
    if (o === s || u8at(45 /* OFF_UINF */, o) !== 0 || u8at(14, o) !== 0) continue;
    if (isUndead(u32at(5, o) >>> 0)) continue;
    const tr = i32at(44 /* OFF_UTRAIT */, o);
    if (tr >= 0 && (u8at(118 /* OFF_TRFL */, tr) & 4) !== 0) continue;
    const dx = f64at(0, o) - ux, dy = f64at(1, o) - uy;
    if (fdHypot(dx, dy) < 1.8) {
      const oc = i32at(4, o);
      if (oc >= 0 && rngNext() < f64at(74 /* OFF_CVTECH */, oc * 24 + 14)) {
        setU8at(45, o, 1);
        dirty(o);
        break;
      }
    }
  }
}
function addGrudge(w, killerId, victimCiv, victimFam) {
  let v = 1.0;
  const wc = i32at(4, w);
  if (victimCiv >= 0 && wc === victimCiv) v = 1.6;
  const wf = i32at(54 /* OFF_UFAM */, w);
  if (wf >= 0 && wf === victimFam) v = 2.6;
  let gl = uGlen(w);
  if (gl < 0) gl = 0;
  let found = -1;
  for (let i = 0; i < gl; i++) {
    if ((u32at(58 /* OFF_UGIDS */, w * UG_CAP + i) >>> 0) === killerId) { found = i; break; }
  }
  if (found >= 0) {
    setF64at(59 /* OFF_UGVAL */, w * UG_CAP + found, jsMin(3.0, f64at(59, w * UG_CAP + found) + v * 0.6));
  } else {
    const n = gl;
    if (n < 4) {
      setI32at(58, w * UG_CAP + n, killerId | 0);
      setF64at(59, w * UG_CAP + n, v);
      setI32at(57, w, n + 1);
    } else {
      const m = Math.min(n, UG_CAP);
      let wi = 0;
      for (let i = 1; i < m; i++) if (f64at(59, w * UG_CAP + i) < f64at(59, w * UG_CAP + wi)) wi = i;
      let k2 = wi;
      while (k2 + 1 < m) {
        setI32at(58, w * UG_CAP + k2, i32at(58, w * UG_CAP + k2 + 1));
        setF64at(59, w * UG_CAP + k2, f64at(59, w * UG_CAP + k2 + 1));
        k2 += 1;
      }
      setI32at(58, w * UG_CAP + m - 1, killerId | 0);
      setF64at(59, w * UG_CAP + m - 1, v);
    }
  }
  dirty(w);
}
function witnessDeath(ctxUnused, killer, victim) {
  const vx = f64at(0, victim), vy = f64at(1, victim);
  const bw = ctxBw, bh = ctxBh;
  const cx = Math.floor(jsMin(bw - 1.0, jsMax(0.0, Math.floor(vx / 4.0))));
  const cy = Math.floor(jsMin(bh - 1.0, jsMax(0.0, Math.floor(vy / 4.0))));
  const fierce = jsMin(3.0, f64at(26 /* OFF_UKILLS */, killer) / 6.0);
  const killerId = u32at(6 /* OFF_UID */, killer) >>> 0;
  const victimCiv = i32at(4, victim);
  const victimRace = u32at(5, victim) >>> 0;
  const victimFam = i32at(54, victim);
  const killerKills = f64at(26, killer);
  const visit = (o) => {
    if (u8at(14, o) !== 0 || o === killer || o === victim) return;
    const kin = victimCiv >= 0 ? i32at(4, o) === victimCiv : (u32at(5, o) >>> 0) === victimRace;
    if (!kin) return;
    if (fdHypot(f64at(0, o) - vx, f64at(1, o) - vy) > 6.0) return;
    const wr = u32at(5, o) >>> 0;
    if (isUndead(wr)) return;
    let inc = 0.32 + 0.08 * fierce + (killerKills >= 10.0 ? 0.12 : 0.0);
    const wf = i32at(54, o);
    if (wf >= 0 && wf === victimFam) inc += 0.15;
    const wtr = i32at(44, o);
    const isBerserk = wtr >= 0 && (u8at(118, wtr) & 64) !== 0;
    if (isBerserk || u8at(140 /* OFF_MLOOT */, wr) !== 0) inc *= 0.35;
    if (i32at(51 /* OFF_UARMY */, o) >= 0) inc *= 0.4;
    setPanic(o, jsMin(1.0, uPanic0(o) + inc));
    addGrudge(o, killerId, victimCiv, victimFam);
  };
  for (let by = cy - 2; by <= cy + 2; by++) {
    if (by < 0 || by >= bh) continue;
    for (let bx = cx - 2; bx <= cx + 2; bx++) {
      if (bx < 0 || bx >= bw) continue;
      const cell = by * bw + bx;
      const start = i32at(9 /* OFF_CELL_START */, cell);
      const end = i32at(9, cell + 1);
      for (let k = start; k < end; k++) {
        const o = u32at(10 /* OFF_CELL_ITEMS */, k) >>> 0;
        visit(o);
      }
    }
  }
}
function zombify(ctxUnused, s) {
  const race = u32at(5, s) >>> 0;
  const civ = i32at(4, s);
  if (civ >= 0) civDelta(null, 0, civ, -1.0);
  if (!isCiv(race)) bumpWild(race, -1);
  setU32at(5, s, R_ZOMBIE);
  setI32at(4, s, -1);
  setF64at(20, s, 40.0); setF64at(21, s, 46.0); setF64at(22, s, 6.0); setF64at(23, s, 0.05);
  setF64at(24, s, 0.0); setF64at(25, s, 9999.0);
  setU8at(45, s, 0); setU8at(14, s, 0); setU8at(48, s, 0);
  setI32at(49, s, 0);
  bumpWild(R_ZOMBIE, 1);
  fx(null, FX_SPAWN, f64at(0, s), f64at(1, s), 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
  dirty(s);
}
// ---------------- M-U2d 转写：spawn 辅助 + spawnUnit（WbUnits.cs M-U2d 段镜像） ----------------
const TC_HP = 1, TC_DMG = 0, TC_REPRO = 5, TC_IDEA_REPRO = 18;
const JB_HP = 0, JB_DMG = 1, JB_SPD = 2, JB_W = 3;
const RB_HP = 0, RB_DMG = 1, RB_MAXAGE = 3, RB_REPRO = 4, RB_GROWTH = 6;
const IT_SLOT = 11, IT_RANK = 9, IT_DMG = 7, IT_HP = 8, IT_RARITY = 10; // IT_SPDMUL=6 沿用 M-U2c 头部定义
const ACT_SPAWN = 13, ACT_FAM_NEW = 14, ACT_FAM_MILE = 15, ACT_ITEM_DEL = 19;
const EVT_LINEAGE_FLORISH = 6, EVT_SKELETON = 10, EVT_LOOT_PICKUP = 11;
const EP_REPRO = 0, EP_MUT = 8;
const BAIL_EMERGENT = 2;
const OFF_UBREATH = 29, OFF_USEQ = 99, OFF_REPRM = 109, OFF_SPB = 111, OFF_SPBH = 112;
const OFF_TRN = 113, OFF_TRDMG = 114, OFF_TRHP = 115, OFF_TRSPD = 116;
const OFF_CNT = 119, OFF_BAILP = 125, OFF_UNAME = 56, OFF_UGEAR = 52, OFF_UTRAIT = 44;
const OFF_CVGOV = 73, OFF_CVPOP = 68, OFF_CVPC = 76, OFF_CVAL2 = 72, OFF_CVDIR = 75, OFF_CIVN2 = 67;
const OFF_FAMN = 78, OFF_FMID = 79, OFF_FMRACE = 80, OFF_FMNUM = 81, OFF_FMSEQ = 82, OFF_FMNAME = 83;
const OFF_ITMK = 91, OFF_ITMXY = 92, OFF_TBIN = 134, OFF_TBI = 133;
const OFF_FRSTOFF = 135, OFF_FRSTN = 136, OFF_FRSTP = 137;
const OFF_WILDCAP = 146, OFF_MONCAP = 147, OFF_MISC = 148, OFF_WILD2 = 106, OFF_GRASS2 = 107;
const MAX_ITEMS = 256; // MAX_FAM 沿用头部定义
const MAX_FAM_ROWS = MAX_FAM;

const wildAlive = () => { let n = 0; for (let r = 0; r < 512; r++) n += i32at(OFF_WILD2, r); return n; };
const calcCell = (x, y, bw, bh) => {
  const cx = jsMin(bw - 1.0, jsMax(0.0, Math.floor(x / 4.0))) | 0;
  const cy = jsMin(bh - 1.0, jsMax(0.0, Math.floor(y / 4.0))) | 0;
  return ((cy * bw + cx) >>> 0);
};
function arenaAppend() {
  const slot = LIVE_LEN;
  if (slot >= MAX_UNITS) return -1;
  LIVE_LEN = slot + 1;
  return slot;
}
function romanBytes(n, outBuf) {
  if (n < 1 || n > 40) return writeDec(n, outBuf);
  let v = n, len = 0;
  const table = [[40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  for (const [val, sym] of table) {
    while (v >= val) {
      for (const b of sym.split('').map((c) => c.charCodeAt(0))) { outBuf[len] = b; len += 1; }
      v -= val;
    }
  }
  return len;
}
function writeDec(n, outBuf) {
  const b = String(n).split('').map((c) => c.charCodeAt(0));
  const l = Math.min(b.length, outBuf.length);
  for (let i = 0; i < l; i++) outBuf[i] = b[i];
  return l;
}
const nameLen = (s) => u8at(OFF_UNAME, s * 32 + 31);
const nameByte = (s, i) => u8at(OFF_UNAME, s * 32 + i);
function uniqueName(race) {
  const off = u32at(OFF_FRSTOFF, race);
  const cnt = u32at(OFF_FRSTN, race);
  const pick = Math.min(Math.floor(rngNext() * cnt), Math.max(cnt, 1) - 1);
  const base = new Uint8Array(32);
  let bl = 0;
  if (cnt > 0 && off + pick * 24 + 24 <= 16384) {
    const entryLen = u8at(OFF_FRSTP, off + pick * 24);
    const copyN = Math.min(entryLen, 23);
    for (let i = 0; i < copyN; i++) base[i] = u8at(OFF_FRSTP, off + pick * 24 + 1 + i);
    bl = copyN;
  }
  // 重名统计：nm === base || (nm.length > bl && nm[bl] == 32 && startsWith(base))
  const liveN = LIVE_LEN;
  let n = 0;
  for (let o = 0; o < liveN; o++) {
    if (u8at(14, o) !== 0) continue;
    const nlen = nameLen(o);
    let same = nlen === bl;
    if (same) {
      for (let i = 0; i < bl; i++) { if (nameByte(o, i) !== base[i]) { same = false; break; } }
    } else if (nlen > bl && nameByte(o, bl) === 32) {
      let pre = true;
      for (let i = 0; i < bl; i++) { if (nameByte(o, i) !== base[i]) { pre = false; break; } }
      same = pre;
    }
    if (same) n += 1;
  }
  const out = new Uint8Array(32);
  let len = bl;
  for (let i = 0; i < bl; i++) out[i] = base[i];
  if (n > 0) {
    if (len < 31) { out[len] = 32; len += 1; }
    const tmp = new Uint8Array(16);
    const rl = romanBytes(n + 1, tmp);
    for (let i = 0; i < rl; i++) { if (len < 32) { out[len] = tmp[i]; len += 1; } }
  }
  return { name: out, len };
}
function familyFindM2d(id) {
  const n = i32at(OFF_FAMN, 0);
  for (let i = 0; i < Math.max(n, 0); i++) {
    if (i >= MAX_FAM) break;
    if (i32at(OFF_FMID, i) === id) return i;
  }
  return -1;
}
function pruneFamilies() {
  const n = i32at(OFF_FAMN, 0);
  if (n <= 240) return;
  const dead = [];
  for (let i = 0; i < Math.max(n, 0); i++) {
    if (i >= MAX_FAM) break;
    const m = f64at(OFF_FMNUM, i * 6);
    const k = f64at(OFF_FMNUM, i * 5 + 1); // 蓝本 stride 混用原样保真
    if (m <= 0.0 && k < 10.0) dead.push({ id: i32at(OFF_FMID, i), row: i });
  }
  dead.sort((a, b) => a.id - b.id);
  let del = 0;
  for (const { row } of dead) {
    if (del >= 20) break;
    setI32at(OFF_FMID, row, -1);
    del += 1;
  }
  let w = 0;
  for (let r = 0; r < Math.min(Math.max(n, 0), MAX_FAM); r++) {
    if (i32at(OFF_FMID, r) !== -1) {
      if (w !== r) {
        for (let k = 0; k < 6; k++) setF64at(OFF_FMNUM, w * 6 + k, f64at(OFF_FMNUM, r * 6 + k));
        setI32at(OFF_FMID, w, i32at(OFF_FMID, r));
        setI32at(OFF_FMRACE, w, i32at(OFF_FMRACE, r));
        setI32at(OFF_FMNAME, w, i32at(OFF_FMNAME, r)); // FMNAME u16×2/行：一次 i32 搬运整行（字节 r*4..r*4+3）
      }
      w += 1;
    }
  }
  setI32at(OFF_FAMN, 0, w);
}
function newFamily(ctxUnused, race, founderSlot) {
  const preI = Math.floor(rngNext() * 16.0) & 15;
  const postI = Math.floor(rngNext() * 12.0) % 12;
  const id = i32at(OFF_FMSEQ, 0);
  setI32at(OFF_FMSEQ, 0, id + 1);
  const row = i32at(OFF_FAMN, 0);
  if (row >= MAX_FAM) return -1;
  const founded = Math.floor(f64at(OFF_CNT, 5)); // CNT[5] = yearF
  setI32at(OFF_FMID, row, id);
  setI32at(OFF_FMRACE, row, race);
  for (let k = 0; k < 6; k++) setF64at(OFF_FMNUM, row * 6 + k, 0.0);
  setF64at(OFF_FMNUM, row * 6, 1.0);
  setF64at(OFF_FMNUM, row * 6 + 3, 1.0);
  setF64at(OFF_FMNUM, row * 6 + 5, founded);
  setI32at(OFF_FMNAME, row, (preI & 0xffff) | ((postI & 0xffff) << 16)); // FMNAME u16×2/行：LE 打包（蓝本 set_u16_at(row*2)/(row*2+1) 同字节）
  setI32at(OFF_FAMN, 0, row + 1);
  pruneFamilies();
  const p = actReserve(32);
  if (p !== null) {
    actU8(p, ACT_FAM_NEW); actI32(p + 4, id); actI32(p + 8, race);
    actU8(p + 12, preI); actU8(p + 13, postI); actF64(p + 16, founded); actI32(p + 24, founderSlot);
  }
  return id;
}
function familyMilestone(ctxUnused, row) {
  // 蓝本读*5写*6 stride 混用原样保真
  const members = f64at(OFF_FMNUM, row * 6);
  const peak = f64at(OFF_FMNUM, row * 5 + 2);
  if (members > peak) setF64at(OFF_FMNUM, row * 6 + 2, members);
  const marks = [12.0, 24.0, 40.0];
  let ms = f64at(OFF_FMNUM, row * 5 + 3);
  const fired = [];
  while (ms < marks.length && members >= marks[ms]) { fired.push(marks[ms]); ms += 1.0; }
  setF64at(OFF_FMNUM, row * 6 + 4, ms);
  for (const m of fired) {
    const p = actReserve(48);
    if (p !== null) {
      actU8(p, ACT_EVT); actU8(p + 1, EVT_LINEAGE_FLORISH);
      actI32(p + 4, i32at(OFF_FMID, row)); actF64(p + 16, m);
    }
  }
}
/// spawn_unit（units.rs L1813-2041；WbUnits.SpawnUnit 镜像）——返回新 slot 或 -1
function spawnUnit(race, x, y, civ, gene, infected, job, traitIdIn, fam, fgn) {
  // —— 预算 ——
  if (isCiv(race) && LIVE_LEN >= Math.max(i32at(OFF_MISC, 0), 0)) return -1;
  if (!isCiv(race) && wildAlive() >= Math.max(i32at(OFF_MISC, 1), 0)) return -1;
  const monCap = i32at(OFF_MONCAP, race);
  if (monCap > 0 && i32at(OFF_WILD2, race) >= monCap) return -1;
  x = jsMax(0.5, jsMin(W - 0.5, x));
  y = jsMax(0.5, jsMin(H - 0.5, y));
  // trait：未指定 → 15% 掷骰
  let traitId = traitIdIn;
  if (traitId >= -1) {
    if (traitId === -1) {
      if (rngNext() < 0.15) {
        const n = Math.max(i32at(OFF_TRN, 0), 0);
        if (n > 0) {
          const pick = Math.floor(rngNext() * n);
          traitId = Math.min(pick, n - 1);
        } else traitId = -2;
      } else traitId = -2;
    } else traitId = -2;
  }
  const tdDmg = traitId >= 0 ? f64at(OFF_TRDMG, traitId) : 1.0;
  const tdHp = traitId >= 0 ? f64at(OFF_TRHP, traitId) : 1.0;
  const tdSpd = traitId >= 0 ? f64at(OFF_TRSPD, traitId) : 1.0;
  // gene：未指定 → baseGene（speciesBase 有则 4 rng）
  let g;
  if (gene !== null && gene !== undefined) {
    g = gene;
  } else if (u8at(OFF_SPBH, race) !== 0) {
    const j = (b) => jsMax(0.5, jsMin(2.0, b * (1.0 + (rngNext() - 0.5) * 0.1)));
    g = [j(f64at(OFF_SPB, race * 4)), j(f64at(OFF_SPB, race * 4 + 1)), j(f64at(OFF_SPB, race * 4 + 2)), j(f64at(OFF_SPB, race * 4 + 3))];
  } else {
    g = [1.0, 1.0, 1.0, 1.0];
  }
  // job：civ → rollJob
  let jobV = job;
  if (isCiv(race) && civ >= 0) {
    if (jobV >= 0) {
      // 保持
    } else {
      let total = 0;
      for (let i = 0; i < 7; i++) total += f64at(132, i * 5 + JB_W);
      let r = rngNext() * total;
      let picked = 0;
      for (let i = 0; i < 7; i++) {
        r -= f64at(132, i * 5 + JB_W);
        if (r <= 0.0) { picked = i; break; }
      }
      jobV = picked;
    }
  } else jobV = -1;
  const jdHp = isCiv(race) ? f64at(132, Math.max(jobV, 0) * 5 + JB_HP) : 1.0;
  const jdDmg = isCiv(race) ? f64at(132, Math.max(jobV, 0) * 5 + JB_DMG) : 1.0;
  const jdSpd = isCiv(race) ? f64at(132, Math.max(jobV, 0) * 5 + JB_SPD) : 1.0;
  // 科技快照
  let tHp, tDmg;
  if (isCiv(race) && civ >= 0) {
    tHp = f64at(74, civ * 24 + TC_HP);
    tDmg = f64at(74, civ * 24 + TC_DMG);
  } else { tHp = 1.0; tDmg = 1.0; }
  const gov15 = civ >= 0 && i32at(OFF_CVGOV, civ) === 4 ? 1.15 : 1.0;
  const maxHp = jsRound(f64at(130, race * 12 + RB_HP) * tdHp * jdHp * tHp * g[2]);
  const dmg = f64at(130, race * 12 + RB_DMG) * tdDmg * jdDmg * tDmg * gov15 * g[1];
  const speed = f64at(130, race * 12 + RB_SPEED) * tdSpd * jdSpd * g[0];
  const id = u32at(OFF_USEQ, 0);
  setU32at(OFF_USEQ, 0, id + 1);
  const maxAge = f64at(130, race * 12 + RB_MAXAGE) * (0.8 + rngNext() * 0.4);
  const flip = rngNext() < 0.5;
  const { name, len: nameLenV } = uniqueName(race);
  const breath = 120.0 + Math.floor(rngNext() * 160.0);
  const slot = arenaAppend();
  if (slot === -1) return -1;
  const s = slot;
  setU32at(6, s, id);
  setU32at(5, s, race);
  setI32at(4, s, civ);
  setF64at(0, s, x); setF64at(1, s, y);
  setF64at(30, s, x); setF64at(31, s, y);   // ULX/ULY
  setF64at(18, s, x); setF64at(19, s, y);
  setF64at(20, s, maxHp); setF64at(21, s, maxHp);
  setF64at(22, s, dmg); setF64at(23, s, speed);
  setF64at(24, s, 0.0); setF64at(25, s, maxAge);
  setF64at(26, s, 0.0); setF64at(27, s, 0.0);
  setI32at(OFF_UTRAIT, s, traitId);
  setI32at(43, s, isCiv(race) ? jobV : -1);
  setU8at(45, s, infected ? 1 : 0);
  setU8at(46, s, flip ? 1 : 0);
  setF64at(OFF_UBREATH, s, breath);
  setU8at(47, s, (id + 1) % 2); // JS: parity = unitSeq%2（id 为自增前值）
  setU8at(14, s, 0);
  setF64at(42, s, 0.0);
  for (let k = 0; k < 4; k++) setF64at(53, s * 4 + k, g[k]);
  for (let k = 0; k < 32; k++) setU8at(OFF_UNAME, s * 32 + k, name[k]);
  setU8at(OFF_UNAME, s * 32 + 31, nameLenV);
  for (let k = 0; k < 7; k++) setI32at(OFF_UGEAR, s * 7 + k, -1);
  setI32at(57, s, -1);
  setI32at(54, s, -1); setI32at(55, s, -1);
  setF64at(28, s, NaN); setF64at(50, s, NaN);
  setI32at(51, s, -1);
  setU8at(15, s, 0);
  setU8at(48, s, 0);
  setI32at(49, s, 0);
  setU32at(7, s, calcCell(x, y, ctxBw, ctxBh));
  // 瞬态字段清零
  setI32at(34, s, -2147483648); // undefined 哨兵
  setF64at(35, s, NaN); setF64at(36, s, NaN); setF64at(37, s, NaN); setF64at(38, s, NaN);
  setF64at(39, s, NaN); setF64at(40, s, NaN); setF64at(41, s, NaN);
  setF64at(32, s, NaN); setF64at(33, s, NaN); // USXK/USYK
  if (civ >= 0 && civ < Math.max(i32at(OFF_CIVN2, 0), 0)) civDelta(null, 0, civ, 1.0);
  if (!isCiv(race)) bumpWild(race, 1);
  // —— 家族 ——
  let famFinal = fam;
  if (fam >= 0) {
    setI32at(54, s, fam);
    setI32at(55, s, fgn >= 0 ? fgn : 1);
    const row = familyFindM2d(fam);
    if (row >= 0) {
      const m = f64at(OFF_FMNUM, row * 6) + 1.0;
      setF64at(OFF_FMNUM, row * 6, m);
      familyMilestone(null, row);
      const p = actReserve(16);
      if (p !== null) { actU8(p, ACT_FAM_MILE); actI32(p + 4, fam); }
    }
  } else if (!isUndead(race) && rngNext() < 0.06) {
    const nid = newFamily(null, race, s);
    if (nid >= 0) {
      famFinal = nid;
      setI32at(54, s, nid);
      setI32at(55, s, 1);
    }
  }
  dirty(s);
  // —— SPAWN 动作 ——
  const p = actReserve(256);
  if (p !== null) {
    actU8(p, ACT_SPAWN);
    actU32raw(p + 4, id);
    actU32raw(p + 8, race);
    actI32(p + 12, civ);
    actF64(p + 16, x); actF64(p + 24, y);
    actF64(p + 32, maxHp); actF64(p + 40, dmg); actF64(p + 48, speed);
    actF64(p + 56, maxAge); actF64(p + 64, breath);
    actI32(p + 72, traitId);
    actI32(p + 76, isCiv(race) ? jobV : -1);
    actU8(p + 80, flip ? 1 : 0);
    actU8(p + 81, (id + 1) % 2);
    actU8(p + 82, infected ? 1 : 0);
    actI32(p + 84, famFinal);
    actI32(p + 88, i32at(55, s));
    actF64(p + 96, tDmg); actF64(p + 104, tHp);
    actF64(p + 112, g[0]); actF64(p + 120, g[1]); actF64(p + 128, g[2]); actF64(p + 136, g[3]);
    actU8(p + 144, nameLenV);
    for (let k = 0; k < 32; k++) actU8(p + 145 + k, name[k]);
  }
  return s;
}
function riseSkeleton(ctxUnused, x, y) {
  const spawned = spawnUnit(R_SKELETON, x, y, -1, null, false, -1, -1, -1, -1);
  if (spawned !== -1) {
    fx(null, FX_SPAWN, x, y, 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
    if (rngNext() < 0.12) {
      const p = actReserve(48);
      if (p !== null) { actU8(p, ACT_EVT); actU8(p + 1, EVT_SKELETON); actF64(p + 32, x); actF64(p + 40, y); }
    }
  }
}
function famForChild(s, race) {
  const fam = i32at(54, s);
  if (fam >= 0) {
    const fgn0 = i32at(55, s);
    return [fam, fgn0 < 0 ? 2 : fgn0 + 1];
  }
  if (rngNext() < 0.25) {
    const nid = newFamily(null, race, s);
    if (nid >= 0) {
      const fgn0 = i32at(55, s);
      return [nid, fgn0 < 0 ? 2 : fgn0 + 1];
    }
  }
  return [-1, -1];
}
function childGene(s) {
  const g = [f64at(53, s * 4), f64at(53, s * 4 + 1), f64at(53, s * 4 + 2), f64at(53, s * 4 + 3)];
  const mr = ep(EP_MUT);
  const gene = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const v = Number.isNaN(g[k]) ? 1.0 : g[k];
    gene[k] = jsMax(0.5, jsMin(2.0, v * (1.0 + (rngNext() - 0.5) * mr)));
  }
  const gx = Math.floor(jsMax(0.0, jsMin(W - 1.0, f64at(0, s))));
  const gy = Math.floor(jsMax(0.0, jsMin(H - 1.0, f64at(1, s))));
  const t = u8at(60, gy * W + gx);
  if (t === T_SNOW || t === T_ICE) gene[2] = jsMin(2.0, gene[2] * (1.0 + rngNext() * 0.05));
  else if (t === T_SAND) gene[0] = jsMin(2.0, gene[0] * (1.0 + rngNext() * 0.05));
  else if (t === T_FOREST) gene[1] = jsMin(2.0, gene[1] * (1.0 + rngNext() * 0.05));
  else if (t === T_GRASS) gene[3] = jsMin(2.0, gene[3] * (1.0 + rngNext() * 0.04));
  return gene;
}
function emergentGate(cg) {
  const extreme = cg[1] >= 1.5 || cg[2] >= 1.5 || cg[0] >= 1.5;
  if (!extreme) return false;
  if (i32at(OFF_MISC, 2) >= 24) return false;
  return !(rngNext() > 0.06);
}
function tryPickup(s) {
  const fxp = u8at(102, 0);
  const n = i32at(90, 0);
  let i = n - 1;
  while (i >= 0) {
    const it = i;
    if (it >= MAX_ITEMS) { i -= 1; continue; }
    const kind = i32at(OFF_ITMK, it);
    if (kind < 0 || kind >= i32at(OFF_TBIN, 0)) { i -= 1; continue; }
    const ix = f64at(OFF_ITMXY, it * 2);
    const iy = f64at(OFF_ITMXY, it * 2 + 1);
    if (Math.abs(ix - f64at(0, s)) > 0.9 || Math.abs(iy - f64at(1, s)) > 0.9) { i -= 1; continue; }
    const d = kind;
    const slot = f64at(OFF_TBI, d * 12 + IT_SLOT) | 0;
    if (slot > 6) { i -= 1; continue; }
    const cur = i32at(OFF_UGEAR, s * 7 + slot);
    const curRank = cur >= 0 ? f64at(OFF_TBI, cur * 12 + IT_RANK) : -1.0;
    const rank = f64at(OFF_TBI, d * 12 + IT_RANK);
    if (curRank >= rank) { i -= 1; continue; }
    if (cur >= 0) {
      const old = cur;
      const odmg = f64at(OFF_TBI, old * 12 + IT_DMG);
      const ohp = f64at(OFF_TBI, old * 12 + IT_HP);
      const ospd = f64at(OFF_TBI, old * 12 + IT_SPDMUL);
      if (odmg !== 0.0) setF64at(22, s, jsMax(1.0, f64at(22, s) - odmg));
      if (ohp !== 0.0) setF64at(21, s, jsMax(1.0, f64at(21, s) - ohp));
      if (ospd !== 0.0) setF64at(23, s, f64at(23, s) / ospd);
    }
    setI32at(OFF_UGEAR, s * 7 + slot, kind);
    const ndmg = f64at(OFF_TBI, d * 12 + IT_DMG);
    const nhp = f64at(OFF_TBI, d * 12 + IT_HP);
    const nspd = f64at(OFF_TBI, d * 12 + IT_SPDMUL);
    if (ndmg !== 0.0) setF64at(22, s, f64at(22, s) + ndmg);
    if (nhp !== 0.0) {
      setF64at(21, s, f64at(21, s) + nhp);
      setF64at(20, s, jsMin(f64at(21, s), f64at(20, s) + nhp));
    }
    if (nspd !== 0.0) setF64at(23, s, f64at(23, s) * nspd);
    const total = i32at(90, 0);
    let k2 = i;
    while (k2 + 1 < total) {
      setI32at(OFF_ITMK, k2, i32at(OFF_ITMK, k2 + 1));
      setF64at(OFF_ITMXY, k2 * 2, f64at(OFF_ITMXY, (k2 + 1) * 2));
      setF64at(OFF_ITMXY, k2 * 2 + 1, f64at(OFF_ITMXY, (k2 + 1) * 2 + 1));
      k2 += 1;
    }
    setI32at(90, 0, total - 1);
    const p = actReserve(16);
    if (p !== null) { actU8(p, ACT_ITEM_DEL); actI32(p + 4, i); }
    fx(null, FX_SPAWN, f64at(0, s), f64at(1, s), 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
    const p2 = actReserve(8);
    if (p2 !== null) { actU8(p2, ACT_SND); actU8(p2 + 1, 2 /* SND_COIN */); }
    if ((fxp & FXP_DMGNUM) !== 0) fx(null, FX_DMG, f64at(0, s), f64at(1, s) - 1.2, 34.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_ITEM, kind >>> 0, false);
    const rarity = f64at(OFF_TBI, d * 12 + IT_RARITY);
    if (rarity >= 3.0) {
      const p3 = actReserve(16);
      if (p3 !== null) { actU8(p3, ACT_TOAST); actU8(p3 + 1, 2); actI32(p3 + 4, u32at(6, s) | 0); actI32(p3 + 8, kind); }
    }
    if (rarity === 4.0) {
      const p4 = actReserve(48);
      if (p4 !== null) {
        actU8(p4, ACT_EVT); actU8(p4 + 1, EVT_LOOT_PICKUP);
        actI32(p4 + 4, u32at(6, s) | 0); actI32(p4 + 8, kind);
        actF64(p4 + 32, f64at(0, s)); actF64(p4 + 40, f64at(1, s));
      }
    }
    dirty(s);
    i -= 1;
  }
}
// —— 和平尾 civ 段建筑辅助骨架（与 C# M-U2d 同构；SP 黄金场景门控外）——
function warTargetSp(civ) {
  const n = Math.max(i32at(84 /* OFF_BLDN */, 0), 0);
  const enemies = [];
  for (let r = 0; r < Math.min(n, 1024); r++) {
    const bc = i32at(87 /* OFF_BLDC */, r);
    if (bc !== civ && atWar(civ, bc)) enemies.push(r);
  }
  if (enemies.length === 0) return -1;
  const pick = Math.floor(rngNext() * enemies.length);
  return enemies[Math.min(pick, enemies.length - 1)];
}
// —— 建筑辅助族（units.rs L401-419 + L1187-1517；M-U3a 全量，镜像 C# WbUnits）——
function fireClear(ctxUnused, i) { // L401-416
  if (u8at(61 /* OFF_FIREG */, i) > 0) {
    const n = i32at(145 /* OFF_FIREN */, 0);
    if (n > 0) setI32at(145, 0, n - 1);
  }
  setU8at(61, i, 0);
  const p = actReserve(8);
  if (p !== null) { actU8(p, 8 /* ACT_FIRE_CLEAR */); actI32(p + 1, i); }
}
function fireNear(s, r) { // L1187-1233
  if (i32at(145 /* OFF_FIREN */, 0) === 0) return -1;
  const cx = Math.floor(f64at(0 /* OFF_UX */, s));
  const cy = Math.floor(f64at(1 /* OFF_UY */, s));
  const rr = Math.ceil(r);
  let best = -1; let bestD = r + 0.5;
  const uciv = i32at(4 /* OFF_UCIV */, s);
  const ux = f64at(0, s), uy = f64at(1, s);
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= ctxBw || yy >= ctxBh) continue;
      const i = yy * ctxBw + xx;
      if (u8at(61 /* OFF_FIREG */, i) === 0) continue;
      const d = fdHypot(xx + 0.5 - ux, yy + 0.5 - uy);
      if (d >= bestD) continue;
      const own = uciv >= 0 && (new DataView(mem.buffer).getInt16(AP() + OFF(65 /* OFF_OWN */) + i * 2, true) === uciv
        || (u8at(64 /* OFF_BLDK */, i) > 0 && (() => { const row = i32at(66 /* OFF_BIDX */, i); return row >= 0 && i32at(87 /* OFF_BLDC */, row) === uciv; })()));
      if (own || d < 2.2) { bestD = d; best = i; }
    }
  }
  return best;
}
function extinguishFire(ctxUnused, i, bySlot) { // L1234-1258
  fireClear(null, i);
  const firesOut = f64at(119 /* OFF_CNT */, 0) + 1.0;
  setF64at(119, 0, firesOut);
  void u8at(102 /* OFF_FXP */, 0); // 蓝本 fxp 读取后弃用
  fx(null, 3 /* FX_WATER */, (i % ctxBw) + 0.5, Math.floor(i / ctxBw) + 0.5, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, 0 /* TXT_NONE */, 0, false);
  const tick = i32at(96 /* OFF_TICK */, 0);
  const last = f64at(119 /* OFF_CNT */, 1);
  if (firesOut >= 3.0 && (tick - last) > 480.0) {
    setF64at(119, 1, tick);
    const civ = i32at(4 /* OFF_UCIV */, bySlot);
    if (civ >= 0 && u8at(72 /* OFF_CVAL */, civ) !== 0) {
      const p = actReserve(48);
      if (p !== null) {
        actU8(p, 4 /* ACT_EVT */); actU8(p + 1, 7 /* EVT_FIREOUT */);
        actI32(p + 4, civ);
        actF64(p + 32, (i % ctxBw) + 0.5);
        actF64(p + 40, Math.floor(i / ctxBw) + 0.5);
      }
    }
  }
}
function damagedNear(s, r) { // L1259-1291
  const n = i32at(144 /* OFF_DMGN */, 0);
  if (n === 0) return -1;
  const uciv = i32at(4 /* OFF_UCIV */, s);
  const ux = f64at(0, s), uy = f64at(1, s);
  let best = -1; let bestD = r;
  for (let k = 0; k < n; k++) {
    if (k >= 1024 /* MAX_BLD */) break;
    const i = i32at(143 /* OFF_DMGL */, k);
    const row = i32at(66 /* OFF_BIDX */, i);
    if (row < 0) continue;
    if (i32at(87 /* OFF_BLDC */, row) !== uciv) continue;
    const bx = i32at(86 /* OFF_BLDXY */, row * 2) + 0.5;
    const by = i32at(86, row * 2 + 1) + 0.5;
    const d = fdHypot(bx - ux, by - uy);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}
function enemyBuildingNear(s, r) { // L1292-1342
  const cx = Math.floor(f64at(0 /* OFF_UX */, s));
  const cy = Math.floor(f64at(1 /* OFF_UY */, s));
  const rr = Math.ceil(r);
  let best = -1; let bestD = r + 0.5;
  const uciv = i32at(4 /* OFF_UCIV */, s);
  const ux = f64at(0, s), uy = f64at(1, s);
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= ctxBw || yy >= ctxBh) continue;
      const i = yy * ctxBw + xx;
      const bk = u8at(64 /* OFF_BLDK */, i);
      if (bk === 0) continue;
      const row = i32at(66 /* OFF_BIDX */, i);
      if (row < 0) continue;
      const bc = i32at(87 /* OFF_BLDC */, row);
      if (bc === uciv) continue;
      if (uciv >= 0 && !atWar(uciv, bc)) continue;
      const d = fdHypot(xx - ux, yy - uy); // 裸格坐标
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}
function nearestEnemyBuilding(s) { // L1343-1368
  const n = Math.max(i32at(84 /* OFF_BLDN */, 0), 0);
  const uciv = i32at(4 /* OFF_UCIV */, s);
  const ux = f64at(0, s), uy = f64at(1, s);
  let best = -1; let bestD = Infinity;
  for (let r = 0; r < Math.min(n, 1024 /* MAX_BLD */); r++) {
    const bc = i32at(87 /* OFF_BLDC */, r);
    if (bc === uciv) continue;
    if (uciv < 0 || !atWar(uciv, bc)) continue;
    const bx = i32at(86 /* OFF_BLDXY */, r * 2);
    const by = i32at(86, r * 2 + 1);
    const d = fdHypot(bx - ux, by - uy);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}
function nearestBuildingOf(s, kind) { // L1369-1394
  const n = Math.max(i32at(84 /* OFF_BLDN */, 0), 0);
  const uciv = i32at(4 /* OFF_UCIV */, s);
  const ux = f64at(0, s), uy = f64at(1, s);
  let best = -1; let bestD = Infinity;
  for (let r = 0; r < Math.min(n, 1024 /* MAX_BLD */); r++) {
    if (i32at(87 /* OFF_BLDC */, r) !== uciv) continue;
    const bk = u8at(64 /* OFF_BLDK */, i32at(85 /* OFF_BLDI */, r));
    if (bk !== kind) continue;
    const bx = i32at(86 /* OFF_BLDXY */, r * 2);
    const by = i32at(86, r * 2 + 1);
    const d = fdHypot(bx - ux, by - uy);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}
function repairBuilding(ctxUnused, i, amount) { // L1411-1457
  const row = i32at(66 /* OFF_BIDX */, i);
  if (row < 0) return false;
  const kind = u8at(64 /* OFF_BLDK */, i);
  const max = jsRound(f64at(149 /* OFF_TBHP */, kind) * f64at(74 /* OFF_CVTECH */, i32at(87 /* OFF_BLDC */, row) * 24 + 2 /* TC_BHP */));
  let hp = f64at(88 /* OFF_BLDHP */, row);
  hp = jsMin(max, hp + amount);
  setF64at(88, row, hp);
  const p = actReserve(16);
  if (p !== null) { actU8(p, 9 /* ACT_BHP */); actI32(p + 1, i); actF64(p + 8, hp); }
  const rd = f64at(119 /* OFF_CNT */, 2) + 1.0;
  setF64at(119, 2, rd);
  const bx = i32at(86 /* OFF_BLDXY */, row * 2) + 0.5;
  const by = i32at(86, row * 2 + 1) + 0.2;
  fx(null, 4 /* FX_HAMMER */, bx, by, 14.0, 1.0, 0.0, 0.0, 0.0, -1, false, 0, 0, false);
  const done = hp >= max;
  if (done) {
    dmgSetDel(i);
    fx(null, 6 /* FX_SPAWN */, i32at(86, row * 2) + 0.5, i32at(86, row * 2 + 1) + 0.5, 22.0, 1.0, 0.0, 0.0, 0.0, -1, false, 0, 0, false);
    const tick = i32at(96 /* OFF_TICK */, 0);
    if (rd >= 6.0 && (tick - f64at(119 /* OFF_CNT */, 3)) > 720.0) {
      setF64at(119, 3, tick);
      const civ = i32at(87 /* OFF_BLDC */, row);
      if (civ >= 0 && u8at(72 /* OFF_CVAL */, civ) !== 0) {
        const q = actReserve(48);
        if (q !== null) {
          actU8(q, 4 /* ACT_EVT */); actU8(q + 1, 8 /* EVT_REPAIR */);
          actI32(q + 4, civ);
          actF64(q + 32, bx);
          actF64(q + 40, i32at(86, row * 2 + 1) + 0.5);
        }
      }
    }
  }
  return done;
}
function dmgSetAdd(ctxUnused, i) { // L1459-1473
  const n = i32at(144 /* OFF_DMGN */, 0);
  for (let k = 0; k < n; k++) {
    if (i32at(143 /* OFF_DMGL */, k) === i) return; // Set 语义
  }
  if (n < 1024 /* MAX_BLD */) {
    setI32at(143, n, i);
    setI32at(144, 0, n + 1);
    const p = actReserve(8);
    if (p !== null) { actU8(p, 10 /* ACT_DMG_ADD */); actI32(p + 1, i); }
  }
}
function dmgSetDel(i) { // L1475-1489
  const n = i32at(144 /* OFF_DMGN */, 0);
  for (let k = 0; k < n; k++) {
    if (i32at(143 /* OFF_DMGL */, k) === i) {
      for (let m = k; m < n - 1; m++) setI32at(143, m, i32at(143, m + 1));
      setI32at(144, 0, n - 1);
      return;
    }
  }
}
function attackBuilding(ctxUnused, i, dmg) { // L1491-1517
  const kind = u8at(64 /* OFF_BLDK */, i);
  if (kind === 0) return true;
  const row = i32at(66 /* OFF_BIDX */, i);
  if (row < 0) return true;
  const hp = f64at(88 /* OFF_BLDHP */, row) - dmg;
  if (hp <= 0.0) return false; // Err → 上层 BAIL_ATTACK_DEST
  setF64at(88, row, hp);
  const p = actReserve(16);
  if (p !== null) { actU8(p, 9 /* ACT_BHP */); actI32(p + 1, i); actF64(p + 8, hp); }
  dmgSetAdd(null, i);
  fx(null, 5 /* FX_HIT */, (i % ctxBw) + 0.5, Math.floor(i / ctxBw) + 0.5, 6.0, 1.0, 0.0, 0.0, 0.0, -1, false, 0, 0, false);
  return true;
}
function dragonBreath(ctxUnused, s) {
  const tx = jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + (rngNext() * 2.0 - 1.0) * 8.0));
  const ty = jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + (rngNext() * 2.0 - 1.0) * 8.0));
  for (let k = 0; k < 4; k++) {
    const xx = Math.floor(tx + rngNext() * 3.0 - 1.5), yy = Math.floor(ty + rngNext() * 3.0 - 1.5);
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    ignite(null, idx(xx, yy));
  }
  fx(null, FX_EXPLOSION, tx, ty, 16.0, 1.6, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, true);
}
// —— bucket_scan 批内版（M-U2b 转写延续）——
function bucketScan(ctxUnused, s, contagious, cx, cy, uxx, uyy) {
  const bw = ctxBw, bh = ctxBh;
  const uCiv = i32at(4, s);
  const uRace = u32at(5, s) >>> 0;
  const upanic0v = uPanic0(s);
  const gl = uGlen(s);
  const hasG = gl >= 0;
  const gn = gl > 0 ? gl : 0;
  const o = { enemy: -1, bestD: 7.0, enemyD: 7.0, allies: 0, foes: 0, overflow: false, panicWrites: 0 };
  const visit = (other) => {
    if (u8at(14, other) !== 0 || other === s) return;
    const ddx = f64at(0, other) - uxx, ddy = f64at(1, other) - uyy;
    if (isEnemySlot(s, other)) {
      o.foes += 1;
      const d2 = ddx * ddx + ddy * ddy;
      if (!hasG && d2 >= o.bestD * o.bestD) return;
      const d = Math.sqrt(d2);
      let wd = d;
      if (hasG) {
        const oid = u32at(6, other) >>> 0;
        let gi = -1;
        for (let t = 0; t < gn; t++) if ((u32at(58, s * UG_CAP + t) >>> 0) === oid) { gi = t; break; }
        if (gi >= 0) wd = d * (1.0 - 0.42 * jsMin(1.0, f64at(59, s * UG_CAP + gi) / 2.0));
      }
      if (wd < o.bestD) { o.bestD = wd; o.enemy = other; o.enemyD = d; }
    } else if (uCiv >= 0 ? i32at(4, other) === uCiv : (u32at(5, other) >>> 0) === uRace) {
      o.allies += 1;
      if (contagious) {
        const oPanic = uPanic0(other);
        if (oPanic < upanic0v - 0.15 && ddx * ddx + ddy * ddy < 16.0) {
          setPanic(other, jsMin(1.0, oPanic + upanic0v * 0.4));
          o.panicWrites += 1;
        }
      }
    }
  };
  for (let by = cy - 1; by <= cy + 1; by++) {
    if (by < 0 || by >= bh) continue;
    for (let bx = cx - 1; bx <= cx + 1; bx++) {
      if (bx < 0 || bx >= bw) continue;
      const cell = by * bw + bx;
      const start = i32at(9, cell) >>> 0;
      const end = i32at(9, cell + 1) >>> 0;
      for (let k = start; k < end; k++) {
        const other = u32at(10, k) >>> 0;
        visit(other);
      }
    }
  }
  return o;
}

// —— update_unit 全量转写（WbUnits.UpdateUnit 镜像；返回 0=Ok / bail kind）——
function updateUnit(s) {
  const race = u32at(5, s) >>> 0;
  const fxp = u8at(102, 0);
  const laws = u8at(101, 0);
  if (f64at(42 /* OFF_UHURT */, s) > 0.0) setF64at(42, s, f64at(42, s) - 1.0);
  if (u8at(48, s) !== 0) return BAIL_BOAT;
  dirty(s);
  let age = f64at(24, s) + 2.0 / 40.0;
  setF64at(24, s, age);
  if (age > f64at(25, s)) {
    if ((laws & LAW_UNDEAD_RISE) !== 0 && isCiv(race) && rngNext() < 0.08) riseSkeleton(null, f64at(0, s), f64at(1, s));
    setU8at(14, s, 1);
    return 0;
  }
  if (f64at(27 /* OFF_UCD */, s) > 0.0) setF64at(27, s, f64at(27, s) - 2.0);
  if (truthyF(f64at(35 /* OFF_UATK */, s))) setF64at(35, s, f64at(35, s) - 2.0);
  if (truthyF(f64at(36, s))) setF64at(36, s, f64at(36, s) - 1.0);
  if (truthyF(f64at(37 /* OFF_UFLEET */, s))) {
    setF64at(37, s, f64at(37, s) - 2.0);
    if (f64at(37, s) <= 0.0 && u8at(142 /* OFF_COLEN */, 0) !== 0) {
      const p = actReserve(16);
      if (p !== null) { actU8(p, ACT_TELEM); actU8(p + 1, 1); actI32(p + 4, u32at(6, s) | 0); actI32(p + 8, i32at(96, 0)); }
    }
  }
  if (truthyF(f64at(38 /* OFF_UBLESS */, s))) {
    setF64at(38, s, f64at(38, s) - 2.0);
    const hp = f64at(20, s), maxhp = f64at(21, s);
    if (hp > 0.0 && hp < maxhp) setF64at(20, s, jsMin(maxhp, hp + 0.06));
    if ((fxp & FXP_AMB) !== 0 && rngNext() < 0.02) fx(null, FX_BLESS, f64at(0, s), f64at(1, s) - 0.6, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
  }
  if (truthyF(f64at(39, s))) {
    setF64at(39, s, f64at(39, s) - 2.0);
    setF64at(20, s, f64at(20, s) - 0.05);
    setF64at(42, s, jsMax(f64at(42, s), 4.0));
    if ((fxp & FXP_AMB) !== 0 && rngNext() < 0.02) fx(null, FX_CURSE, f64at(0, s), f64at(1, s) - 0.6, 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
  }
  if (truthyF(f64at(40 /* OFF_UFERT */, s))) setF64at(40, s, f64at(40, s) - 2.0);
  if (truthyF(f64at(41 /* OFF_UDETOUR */, s))) setF64at(41, s, f64at(41, s) - 2.0);
  if (uHasPanic(s)) {
    const p = f64at(2, s) - ep(EP_PANIC_DECAY);
    if (p <= 0.0) clearPanic(s);
    else setF64at(2, s, p);
  }
  // 血仇衰减（L2288-2315）
  const gl = uGlen(s);
  if (gl >= 0) {
    let alive = false, gi = 0;
    while (gi < Math.max(uGlen(s), 0)) {
      const v = f64at(59, s * UG_CAP + gi) - ep(EP_GRUDGE_DECAY);
      setF64at(59, s * UG_CAP + gi, v);
      if (v < 0.3) {
        const len = uGlen(s);
        let m = gi;
        while (m + 1 < len) {
          setI32at(58, s * UG_CAP + m, i32at(58, s * UG_CAP + m + 1));
          setF64at(59, s * UG_CAP + m, f64at(59, s * UG_CAP + m + 1));
          m += 1;
        }
        setI32at(57, s, len - 1);
      } else { alive = true; gi += 1; }
    }
    if (uGlen(s) === 0) setI32at(57, s, -1);
    dirty(s);
  }
  // 地形伤害（L2342-2367）
  const ti = idx(Math.floor(f64at(0, s)), Math.floor(f64at(1, s)));
  if (u8at(61, ti) > 0 && (raceFlag2(race) & RF2_LAVAIMM) === 0) { setF64at(20, s, f64at(20, s) - ep(EP_FIRE_DMG)); setF64at(42, s, 20.0); }
  if (u8at(62 /* OFF_RAD */, ti) > 0) { setF64at(20, s, f64at(20, s) - 0.5); setF64at(42, s, 20.0); }
  if (u8at(60, ti) === T_LAVA && (raceFlag2(race) & RF2_LAVAIMM) === 0) { setF64at(20, s, f64at(20, s) - 15.0); setF64at(42, s, 20.0); }
  if ((raceFlag(race) & 32) === 0 && (u8at(131, race * 2) & 64) === 0 && race !== R_WHITEWALKER && (u8at(139, u8at(60, ti)) & 2) !== 0) { setF64at(20, s, f64at(20, s) - 4.0); setF64at(42, s, 20.0); }
  if (u8at(45, s) !== 0) {
    setF64at(20, s, f64at(20, s) - 0.15);
    if (rngNext() < 0.02) spreadPlague(null, s);
  }
  {
    const hp = f64at(20, s), maxhp = f64at(21, s);
    if (hp > 0.0 && hp < maxhp) {
      const gb = isCiv(race) ? gearBonusOf(s) : null;
      const tr = i32at(44, s);
      let rg = tr >= 0 ? f64at(117 /* OFF_TRREG */, tr) : 0.0;
      if (gb) rg += gb.regen;
      if (race === 21) rg += 0.35;
      if (rg > 0.0) setF64at(20, s, jsMin(maxhp, hp + rg));
    }
  }
  if (isPredator(race) && !isUndead(race)) {
    const food = uFood0(s) - 1.0;
    setF64at(28, s, food);
    if (food <= 0.0) { setF64at(20, s, f64at(20, s) - 1.4); setF64at(42, s, jsMax(f64at(42, s), 3.0)); }
  }
  if (race === R_WHITEWALKER) {
    if (rngNext() < 0.08) {
      const jx = Math.floor(f64at(0, s) + rngNext() * 3.0 - 1.5);
      const jy = Math.floor(f64at(1, s) + rngNext() * 3.0 - 1.5);
      if (jx >= 0 && jy >= 0 && jx < W && jy < H) {
        const j = idx(jx, jy);
        const t = u8at(60, j);
        if (t === T_GRASS || t === T_BURNT || t === T_SAND) setTerrain(null, j, T_SNOW);
        else if (t === T_FOREST && rngNext() < 0.4) setTerrain(null, j, T_SNOW);
        else if ((u8at(139, t) & 2) !== 0 && rngNext() < 0.5) setTerrain(null, j, T_ICE);
        if (u8at(61, j) > 0) {
          setU8at(61, j, 0);
          const n = i32at(145, 0);
          if (n > 0) setI32at(145, 0, n - 1);
          const p = actReserve(5);
          if (p !== null) { actU8(p, ACT_FIRE_CLEAR); actI32(p + 1, j); }
        }
      }
    }
    if ((u8at(139, u8at(60, ti)) & 2) !== 0 && rngNext() < 0.6) setTerrain(null, ti, T_ICE);
  }
  if (f64at(20, s) <= 0.0) { setU8at(14, s, 1); return 0; }

  // —— 扫描（L2444-2456）——
  const ux = f64at(0, s), uy = f64at(1, s);
  const upanic = uPanic0(s);
  const contagious = upanic > 0.55 && rngNext() < 0.2;
  const cx = Math.floor(jsMin(ctxBw - 1.0, jsMax(0.0, Math.floor(ux / 4.0))));
  const cy = Math.floor(jsMin(ctxBh - 1.0, jsMax(0.0, Math.floor(uy / 4.0))));
  const sc = bucketScan(null, s, contagious, cx, cy, ux, uy);
  const enemy = sc.enemy;
  let skipTail = false;
  if (enemy >= 0) {
    // 商队遇敌逃逸
    if (uCaravan0(s) > 0.0) {
      const ang = fdAtan2(f64at(1, s) - f64at(1, enemy), f64at(0, s) - f64at(0, enemy));
      setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + fdCos(ang) * 4.0)));
      setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + fdSin(ang) * 4.0)));
      moveUnit(null, s, 1.15);
      return 0;
    }
    if (f64at(37, s) > 0.0) {
      const ang = fdAtan2(f64at(1, s) - f64at(1, enemy), f64at(0, s) - f64at(0, enemy));
      setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + fdCos(ang) * 5.0)));
      setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + fdSin(ang) * 5.0)));
      moveUnit(null, s, uPanic0(s) >= 0.5 ? 1.32 : 1.18);
      return 0;
    }
    if (uPanic0(s) >= ep(EP_PANIC_ROUT) && i32at(51, s) < 0 && !isUndead(race)) {
      setF64at(37, s, 60.0);
      const ang = fdAtan2(f64at(1, s) - f64at(1, enemy), f64at(0, s) - f64at(0, enemy));
      setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + fdCos(ang) * 5.0)));
      setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + fdSin(ang) * 5.0)));
      moveUnit(null, s, 1.3);
      return 0;
    }
    if ((!isCiv(race) || isHostile(race)) && !isUndead(race)) {
      let myPow = f64at(22, s) + f64at(20, s) / 8.0;
      const gl2 = uGlen(s);
      if (gl2 > 0) {
        const eid = u32at(6, enemy) >>> 0;
        let gi = -1;
        for (let t = 0; t < gl2; t++) if ((u32at(58, s * UG_CAP + t) >>> 0) === eid) { gi = t; break; }
        if (gi >= 0) myPow *= 1.0 + 0.2 * jsMin(1.0, f64at(59, s * UG_CAP + gi) / 2.0);
      }
      const foePow = f64at(22, enemy) + f64at(20, enemy) / 8.0;
      const f = new Array(9);
      f[0] = jsMax(0.0, f64at(20, s)) / f64at(21, s);
      f[1] = isPredator(race) ? jsMax(0.0, jsMin(1.0, 1.0 - uFood0(s) / 160.0)) : 0.5;
      f[2] = myPow / (myPow + foePow);
      f[3] = jsMax(0.0, f64at(20, enemy)) / f64at(21, enemy);
      f[4] = jsMin(12.0, sc.enemyD) / 12.0;
      f[5] = isHerbivore(u32at(5, enemy) >>> 0) ? 1.0 : 0.0;
      f[6] = jsMin(3.0, jsMax(0.0, sc.foes - 1.0)) / 3.0;
      f[7] = u8at(140, race) !== 0 ? 1.0 : 0.0;
      f[8] = jsMin(20.0, f64at(26, s)) / 20.0;
      const [flAct, l0] = neuroFlight(f);
      if (u8at(142, 0) !== 0) {
        const p = actReserve(104);
        if (p !== null) {
          actU8(p, ACT_TELEM); actU8(p + 1, 2); actI32(p + 4, u32at(6, s) | 0); actI32(p + 8, i32at(96, 0));
          for (let k = 0; k < 9; k++) actF64(p + 16 + k * 8, f[k]);
          actU8(p + 88, flAct); actF64(p + 96, l0);
        }
      }
      if (flAct === 1) {
        setF64at(37, s, 40.0);
        const ang = fdAtan2(f64at(1, s) - f64at(1, enemy), f64at(0, s) - f64at(0, enemy));
        setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + fdCos(ang) * 5.0)));
        setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + fdSin(ang) * 5.0)));
        moveUnit(null, s, 1.2);
        return 0;
      }
    }
    // 接敌战斗树
    {
      const erace = u32at(5, enemy) >>> 0;
      const rdRange = f64at(130 /* OFF_TBR */, race * 12 + RB_RNG_RANGE);
      const rdDmg = f64at(130, race * 12 + RB_RNG_DMG);
      const rdCd = f64at(130, race * 12 + RB_RNG_CD);
      const hasRd = rdRange !== 0.0;
      const job = uJob0(s);
      const ucivB = i32at(4, s);
      const jobRanged = job === 3 ? f64at(132 /* OFF_TBJ */, 3 * 5 + JB_RNG) : 0.0;
      const gearRng = isCiv(race) ? gearBonusOf(s).ranged : 0.0;
      const techRng = isCiv(race) && ucivB >= 0 ? f64at(74, ucivB * 24 + 15) : 0.0;
      const bowRange = (jobRanged !== 0.0 ? jobRanged : gearRng) + techRng;
      let myPowB = f64at(22, s) + f64at(20, s) / 8.0;
      const gl2b = uGlen(s);
      if (gl2b > 0) {
        const eidB = u32at(6, enemy) >>> 0;
        let giB = -1;
        for (let t = 0; t < gl2b; t++) if ((u32at(58, s * UG_CAP + t) >>> 0) === eidB) { giB = t; break; }
        if (giB >= 0) myPowB *= 1.0 + 0.2 * jsMin(1.0, f64at(59, s * UG_CAP + giB) / 2.0);
      }
      const foePowB = f64at(22, enemy) + f64at(20, enemy) / 8.0;
      let reach = f64at(130, race * 12 + RB_REACH);
      reach = reach === 0.0 ? 0.9 : reach;
      const fs = new Array(12);
      fs[0] = jsMin(12.0, sc.enemyD) / 12.0;
      fs[1] = jsMax(0.0, f64at(20, s)) / f64at(21, s);
      fs[2] = jsMax(0.0, f64at(20, enemy)) / f64at(21, enemy);
      fs[3] = hasRd || bowRange > 0.0 ? 1.0 : 0.0;
      fs[4] = jsMin(8.0, hasRd ? rdRange : bowRange) / 8.0;
      fs[5] = jsMin(2.0, reach) / 2.0;
      fs[6] = hasRd ? 1.0 : 0.0;
      fs[7] = myPowB / (myPowB + foePowB);
      fs[8] = jsMin(4.0, sc.allies) / 4.0;
      fs[9] = i32at(51, s) >= 0 ? 1.0 : 0.0;
      fs[10] = isCiv(race) ? 1.0 : 0.0;
      fs[11] = jsMin(20.0, f64at(26, s)) / 20.0;
      const stance = neuroStance(fs);
      if (stance === 3) {
        setF64at(37, s, 50.0);
        const ang = fdAtan2(f64at(1, s) - f64at(1, enemy), f64at(0, s) - f64at(0, enemy));
        setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + fdCos(ang) * 6.0)));
        setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + fdSin(ang) * 6.0)));
        moveUnit(null, s, 1.15);
        return 0;
      }
      const wep = i32at(52, s * 7 + 0);
      if (hasRd && sc.enemyD > 1.6 && sc.enemyD <= rdRange) {
        if (f64at(27, s) <= 0.0) {
          setF64at(27, s, rdCd);
          setF64at(35, s, 10.0);
          const tx2 = f64at(0, enemy) + rngNext() * 0.6 - 0.3;
          const ty2 = f64at(1, enemy) + rngNext() * 0.6 - 0.3;
          fx(null, FX_FIREBALL, jsMax(0.5, jsMin(W - 0.5, tx2)), jsMax(0.5, jsMin(H - 0.5, ty2)), 16.0, rdDmg, f64at(0, s), f64at(1, s), rdDmg, -1, false, TXT_NONE, 0, true);
        }
        if (stance === 2) {
          const ang = fdAtan2(f64at(1, s) - f64at(1, enemy), f64at(0, s) - f64at(0, enemy));
          setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + fdCos(ang) * 3.0)));
          setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + fdSin(ang) * 3.0)));
          moveUnit(null, s, 0.6);
        }
      } else if (bowRange > 0.0 && sc.enemyD > 1.4 && sc.enemyD <= bowRange) {
        const gun = wep >= 0 && itemIsGun(wep);
        const beam = wep >= 0 && itemIsBeam(wep);
        if (f64at(27, s) <= 0.0) {
          setF64at(27, s, beam ? 12.0 : gun ? 15.0 : 18.0);
          setF64at(35, s, 10.0);
          const mul = isCiv(race) && ucivB >= 0 ? f64at(74, ucivB * 24 + 13) : 1.0;
          const ttl = beam ? 8.0 : gun ? 5.0 : 12.0;
          const elx = f64at(30, enemy), ely = f64at(31, enemy);
          const vx = f64at(0, enemy) - (Number.isNaN(elx) ? f64at(0, enemy) : elx);
          const vy = f64at(1, enemy) - (Number.isNaN(ely) ? f64at(1, enemy) : ely);
          const aimX = jsMax(0.5, jsMin(W - 0.5, f64at(0, enemy) + vx * ttl + rngNext() * 0.4 - 0.2));
          const aimY = jsMax(0.5, jsMin(H - 0.5, f64at(1, enemy) + vy * ttl + rngNext() * 0.4 - 0.2));
          const dmg = f64at(22, s) * mul;
          const kind = beam ? FX_LASER : gun ? FX_BULLET : FX_ARROW;
          const d2v = beam ? f64at(22, s) * 0.75 * mul : dmg;
          fx(null, kind, aimX, aimY, beam ? 8.0 : gun ? 5.0 : 12.0, 1.0, f64at(0, s), f64at(1, s), d2v, ucivB, false, TXT_NONE, 0, true);
          if (!beam && gun && rngNext() < 0.12) {
            const p = actReserve(8);
            if (p !== null) { actU8(p, ACT_SND); actU8(p + 1, 1); }
          }
        }
        if (stance === 2) {
          const ang = fdAtan2(f64at(1, s) - f64at(1, enemy), f64at(0, s) - f64at(0, enemy));
          setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + fdCos(ang) * 3.0)));
          setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + fdSin(ang) * 3.0)));
          moveUnit(null, s, 0.7);
        }
      } else if (sc.enemyD < reach) {
        if (f64at(27, s) <= 0.0) {
          const wspeed = isCiv(race) ? gearBonusOf(s).speed : 1.0;
          setF64at(27, s, jsRound(14.0 / wspeed));
          setF64at(35, s, 12.0);
          if (race === R_KRAKEN && u8at(48, enemy) !== 0) {
            setF64at(20, enemy, f64at(20, enemy) - f64at(22, s) * 2.0);
            setF64at(42, enemy, 20.0);
            if (rngNext() < 0.3) {
              setU8at(14, enemy, 1);
              setU8at(48, enemy, 0);
              dirty(enemy);
              fx(null, FX_EXPLOSION, f64at(0, enemy), f64at(1, enemy), 16.0, 1.6, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, true);
              const p = actReserve(12);
              if (p !== null) { actU8(p, ACT_EVT); actU8(p + 1, EVT_SHIPWRECK); actI32(p + 4, u32at(6, enemy) | 0); }
            } else fx(null, FX_TSUNAMI, f64at(0, enemy), f64at(1, enemy), 12.0, 2.5, 0.0, 0.0, 0.0, -1, true, TXT_NONE, 0, true);
            dirty(s);
            return 0;
          }
          if (race === R_SANDWORM && f64at(20, enemy) <= f64at(21, enemy) * 0.4) {
            setF64at(20, enemy, 0.0);
            setU8at(14, enemy, 1);
            dirty(enemy);
            setF64at(26, s, f64at(26, s) + 1.0);
            setF64at(28, s, jsMin(160.0, uFood0(s) + 50.0 + jsRound(f64at(21, enemy) * 0.6)));
            fx(null, FX_BLOOD, f64at(0, enemy), f64at(1, enemy), 16.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
            if ((fxp & FXP_DMGNUM) !== 0) fx(null, FX_DMG, f64at(0, enemy), f64at(1, enemy), 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_DEVOUR, 0, false);
            dirty(s);
            return 0;
          }
          if (race === R_BASILISK && rngNext() < 0.08) {
            setF64at(20, enemy, 0.0);
            setU8at(14, enemy, 1);
            dirty(enemy);
            setF64at(26, s, f64at(26, s) + 1.0);
            if ((fxp & FXP_CORPSES) !== 0) {
              const p = actReserve(20);
              if (p !== null) {
                actU8(p, ACT_CORPSE);
                actF64(p + 8, f64at(0, enemy)); actF64(p + 16, f64at(1, enemy));
                actU8(p + 4, 1); actU8(p + 5, isUndead(erace) ? 1 : 0);
              }
            }
            const q = actReserve(48);
            if (q !== null) {
              actU8(q, ACT_EVT); actU8(q + 1, EVT_PETRIFY); actI32(q + 4, u32at(6, enemy) | 0);
              actF64(q + 32, f64at(0, enemy)); actF64(q + 40, f64at(1, enemy));
            }
            if ((fxp & FXP_DMGNUM) !== 0) fx(null, FX_DMG, f64at(0, enemy), f64at(1, enemy), 30.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_PETRIFY, 0, false);
            dirty(s);
            return 0;
          }
          {
            const eix = idx(Math.floor(jsMax(0.0, jsMin(W - 1.0, f64at(0, enemy)))), Math.floor(jsMax(0.0, jsMin(H - 1.0, f64at(1, enemy)))));
            const etrH = i32at(44, enemy);
            const fa = new Array(10);
            fa[0] = jsMin(20.0, f64at(26, s)) / 20.0;
            fa[1] = jsMin(0.5, jsMax(0.0, (f64at(130, erace * 12 + RB_SPEED) - f64at(130, race * 12 + RB_SPEED)) * 7.0)) * 2.0;
            fa[2] = etrH >= 0 && (u8at(118, etrH) & 2) !== 0 ? 1.0 : 0.0;
            fa[3] = etrH >= 0 && (u8at(118, etrH) & 16) !== 0 ? 1.0 : 0.0;
            fa[4] = etrH >= 0 && (u8at(118, etrH) & 1) !== 0 ? 1.0 : 0.0;
            fa[5] = i32at(44, s) >= 0 && (u8at(118, i32at(44, s)) & 2) !== 0 ? 1.0 : 0.0;
            fa[6] = truthyF(f64at(38, s)) ? 1.0 : 0.0;
            fa[7] = truthyF(f64at(39, s)) ? 1.0 : 0.0;
            fa[8] = u8at(60, eix) === T_FOREST ? 1.0 : 0.0;
            fa[9] = u8at(60, eix) === T_MOUNTAIN ? 1.0 : 0.0;
            const pAcc = neuroAcc(fa);
            if (rngNext() > jsMax(0.35, jsMin(0.97, pAcc))) {
              if ((fxp & FXP_DMGNUM) !== 0 && rngNext() < 0.55) fx(null, FX_DMG, f64at(0, enemy), f64at(1, enemy) - 0.4, 20.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_MISS, 0, false);
              dirty(s);
              return 0;
            }
          }
          const ga = isCiv(race) ? gearBonusOf(s) : null;
          const gd = isCiv(erace) ? gearBonusOf(enemy) : null;
          let dmg = f64at(22, s) * (0.8 + rngNext() * 0.4)
            * (truthyF(f64at(38, s)) ? 1.3 : 1.0)
            * (truthyF(f64at(39, s)) ? 0.75 : 1.0);
          const dp = f64at(108 /* OFF_DAYPH */, 0);
          if (dp > 0.5 && dp < 0.9 && (raceFlag2(race) & RF2_NIGHTSIGHT) === 0) dmg *= 0.92;
          let crit = false;
          if (ga) {
            if (ga.crit > 0.0 && rngNext() * 100.0 < ga.crit) { dmg *= 2.2; crit = true; }
          }
          if (gd && gd.armor > 0.0) dmg *= 1.0 - gd.armor / 100.0;
          setF64at(20, enemy, f64at(20, enemy) - dmg);
          setF64at(42, enemy, 20.0);
          dirty(enemy);
          fx(null, FX_HIT, (f64at(0, s) + f64at(0, enemy)) / 2.0, (f64at(1, s) + f64at(1, enemy)) / 2.0, 6.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
          if ((fxp & FXP_BLOOD) !== 0 && dmg >= 5.0 && rngNext() < 0.5) {
            const _seed = rngNext(); void _seed;
            const p = actReserve(24);
            if (p !== null) {
              actU8(p, ACT_BLOOD); actU8(p + 1, 0);
              actF64(p + 8, f64at(0, enemy)); actF64(p + 16, f64at(1, enemy));
            }
          }
          const etr = i32at(44, enemy);
          const enemyImmune = etr >= 0 && (u8at(118, etr) & 4) !== 0;
          if (race === R_BASILISK && rngNext() < 0.45 && u8at(45, enemy) === 0 && !enemyImmune) {
            setU8at(45, enemy, 1);
            if ((fxp & FXP_DMGNUM) !== 0) fx(null, FX_DMG, f64at(0, enemy), f64at(1, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_POISON, 0, false);
          }
          if ((fxp & FXP_DMGNUM) !== 0 && (crit || dmg >= 12.0 || rngNext() < 0.4)) {
            fx(null, FX_DMG, f64at(0, enemy), f64at(1, enemy), 26.0, 1.0, 0.0, 0.0, dmg, -1, false, TXT_NUM, crit ? 1 : 0, true);
          }
          if (race === R_VAMPIRE && f64at(20, s) > 0.0) {
            setF64at(20, s, jsMin(f64at(21, s), f64at(20, s) + dmg * 0.6));
            if ((fxp & FXP_DMGNUM) !== 0 && rngNext() < 0.4) fx(null, FX_HEART, f64at(0, s), f64at(1, s) - 0.5, 18.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
          }
          if (ga && ga.lifesteal > 0.0 && f64at(20, s) > 0.0) {
            setF64at(20, s, jsMin(f64at(21, s), f64at(20, s) + (dmg * ga.lifesteal) / 100.0));
          }
          if (gd && gd.thorns > 0.0) {
            setF64at(20, s, f64at(20, s) - gd.thorns);
            setF64at(42, s, 14.0);
            if (f64at(20, s) <= 0.0) setU8at(14, s, 1);
          }
          if (race === R_SCORPION && rngNext() < 0.3 && u8at(45, enemy) === 0 && !enemyImmune) {
            setU8at(45, enemy, 1);
            if ((fxp & FXP_DMGNUM) !== 0) fx(null, FX_DMG, f64at(0, enemy), f64at(1, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_POISON, 0, false);
          }
          if (race === R_SNAKE && rngNext() < 0.3 && u8at(45, enemy) === 0 && !enemyImmune) {
            setU8at(45, enemy, 1);
            if ((fxp & FXP_DMGNUM) !== 0) fx(null, FX_DMG, f64at(0, enemy), f64at(1, enemy) - 0.8, 26.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_POISON, 0, false);
          }
          const bi = idx(Math.floor(f64at(0, enemy)), Math.floor(f64at(1, enemy)));
          const pb = actReserve(16);
          if (pb !== null) { actU8(pb, ACT_BATTLE); actI32(pb + 4, bi); actI32(pb + 8, i32at(96, 0) + 30); }
          if (f64at(20, enemy) <= 0.0) {
            const zomb = race === R_ZOMBIE && isCiv(erace) && (laws & LAW_ZINFECT) !== 0;
            if (zomb) zombify(null, enemy);
            else {
              setU8at(14, enemy, 1);
              dirty(enemy);
              const kills = f64at(26, s) + 1.0;
              setF64at(26, s, kills);
              witnessDeath(null, s, enemy);
              const gl3 = uGlen(s);
              if (gl3 > 0) {
                const eid = u32at(6, enemy) >>> 0;
                let rgi = -1;
                for (let t = 0; t < gl3; t++) if ((u32at(58, s * UG_CAP + t) >>> 0) === eid) { rgi = t; break; }
                if (rgi >= 0) {
                  let m = rgi;
                  while (m + 1 < gl3) {
                    setI32at(58, s * UG_CAP + m, i32at(58, s * UG_CAP + m + 1));
                    setF64at(59, s * UG_CAP + m, f64at(59, s * UG_CAP + m + 1));
                    m += 1;
                  }
                  setI32at(57, s, gl3 - 1);
                  if (rngNext() < 0.12) {
                    const p = actReserve(48);
                    if (p !== null) {
                      actU8(p, ACT_EVT); actU8(p + 1, EVT_REVENGE);
                      actI32(p + 4, u32at(6, s) | 0); actI32(p + 8, eid | 0);
                      actF64(p + 32, f64at(0, s)); actF64(p + 40, f64at(1, s));
                    }
                  }
                }
              }
              const ufam = i32at(54, s);
              if (ufam >= 0) {
                const row = familyFind(ufam);
                if (row >= 0) {
                  const k = f64at(81 /* OFF_FMNUM */, row * 5 + 1) + 1.0;
                  setF64at(81, row * 6 + 1, k);
                  if (kills === 10.0) setF64at(81, row * 6 + 1, f64at(81, row * 6 + 1) + 1.0);
                  const p = actReserve(16);
                  if (p !== null) { actU8(p, ACT_FAM_ONKILL); actI32(p + 4, ufam); actI32(p + 8, u32at(6, s) | 0); actI32(p + 12, kills | 0); }
                }
              }
              if (u8at(142, 0) !== 0) {
                const p = actReserve(16);
                if (p !== null) { actU8(p, ACT_TELEM); actU8(p + 1, 4); actI32(p + 4, u32at(6, s) | 0); actF64(p + 8, f64at(21, enemy)); }
              }
              if (isPredator(race) && !isUndead(race)) setF64at(28, s, jsMin(160.0, uFood0(s) + 55.0 + jsRound(f64at(21, enemy) * 0.5)));
              if (erace === R_DRAGON) setF64at(119 /* OFF_CNT */, 4, f64at(119, 4) + 1.0);
              const pw = actReserve(16);
              if (pw !== null) { actU8(pw, ACT_WARKILL); actI32(pw + 4, u32at(6, s) | 0); actI32(pw + 8, u32at(6, enemy) | 0); }
              if (kills === 10.0) {
                const p = actReserve(16);
                if (p !== null) { actU8(p, ACT_TOAST); actU8(p + 1, 1); actI32(p + 4, u32at(6, s) | 0); }
                const q = actReserve(48);
                if (q !== null) {
                  actU8(q, ACT_EVT); actU8(q + 1, EVT_LEGEND); actI32(q + 4, u32at(6, s) | 0);
                  actF64(q + 32, f64at(0, s)); actF64(q + 40, f64at(1, s));
                }
              }
              if (race === R_WHITEWALKER && isCiv(erace)) riseSkeleton(null, f64at(0, enemy), f64at(1, enemy));
              if ((laws & LAW_UNDEAD_RISE) !== 0 && isCiv(erace) && rngNext() < 0.06) riseSkeleton(null, f64at(0, enemy), f64at(1, enemy));
            }
          }
        }
      } else if (stance === 2 && (hasRd || bowRange > 0.0)) {
        const ang = fdAtan2(f64at(1, s) - f64at(1, enemy), f64at(0, s) - f64at(0, enemy));
        setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, f64at(0, s) + fdCos(ang) * 3.0)));
        setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, f64at(1, s) + fdSin(ang) * 3.0)));
        moveUnit(null, s, 0.8);
      } else {
        if (!truthyF(f64at(41, s))) {
          setF64at(18, s, f64at(0, enemy));
          setF64at(19, s, f64at(1, enemy));
        }
        moveUnit(null, s, 1.25);
      }
      dirty(s);
      skipTail = true;
    }
  }
  if (!skipTail) {
    if (u8at(142, 0) !== 0) {
      const p = actReserve(12);
      if (p !== null) { actU8(p, ACT_TELEM); actU8(p + 1, 3); actI32(p + 4, u32at(6, s) | 0); actI32(p + 8, i32at(96, 0)); }
    }
    if (race === R_DRAGON) {
      const b = f64at(29 /* OFF_UBREATH */, s) - 2.0;
      setF64at(29, s, b);
      if (b <= 0.0) {
        setF64at(29, s, 150.0 + Math.floor(rngNext() * 150.0));
        dragonBreath(null, s);
      }
    }
    const ucivT = i32at(4, s);
    if (isCiv(race) && ucivT >= 0) {
      // 和平尾 civ 段（units.rs L2976-3141 骨架；与 C# M-U2d 同构）
      const job = (() => { const j = i32at(43, s); return j < 0 ? 0 : j; })(); // u_job0
      const warring = civAtWar(ucivT);
      const firen = i32at(145 /* OFF_FIREN */, 0);
      const bigFire = firen > 8;
      const hasArmy = i32at(51 /* OFF_UARMY */, s) >= 0;
      if (!hasArmy && firen > 0 && rngNext() < (bigFire ? 0.5 : 0.3)) {
        const radius = job === 4 ? (bigFire ? 7.0 : 4.5) : bigFire ? 5.0 : 3.0;
        const fi = fireNear(s, radius); // TODO(M-U3) 全量 → -1
        if (fi >= 0) {
          const fxp2 = (fi % W) + 0.5;
          const fyp = Math.floor(fi / W) + 0.5; // C# 整除语义（fi/W 需 floor；曾遭并行 agent 覆写回退，重落）
          const cdx = fxp2 - f64at(0, s);
          const cdy = fyp - f64at(1, s);
          if (cdx * cdx + cdy * cdy < 2.89) {
            extinguishFire(null, fi, s); // TODO(M-U3) 全量
            setF64at(27, s, jsMax(f64at(27, s), 10.0));
          } else {
            setF64at(18, s, fxp2);
            setF64at(19, s, fyp);
            moveUnit(null, s, 1.2);
            return 0;
          }
        }
      }
      if (!hasArmy && job === 4 && f64at(27, s) <= 0.0 && rngNext() < 0.2) {
        const di = damagedNear(s, 14.0); // TODO(M-U3) 全量 → -1
        if (di >= 0) {
          const row = i32at(66 /* OFF_BIDX */, di);
          if (row >= 0) {
            const bx = i32at(86 /* OFF_BLDXY */, row * 2) + 0.5;
            const by = i32at(86, row * 2 + 1) + 0.5;
            const bdx = bx - f64at(0, s);
            const bdy = by - f64at(1, s);
            if (bdx * bdx + bdy * bdy < 3.24) {
              setF64at(27, s, 16.0);
              setF64at(35, s, 10.0);
              repairBuilding(null, di, 12.0 * f64at(74, ucivT * 24 + TC_REPRO * 0 + 9 /* TC_REPAIR */)); // TODO(M-U3) 全量
            } else {
              setF64at(18, s, bx);
              setF64at(19, s, by);
              moveUnit(null, s, 1.15);
              return 0;
            }
          }
        }
      }
      if (!hasArmy && job !== 2 && job !== 3 && f64at(27, s) <= 0.0 && i32at(144 /* OFF_DMGN */, 0) > 0 && rngNext() < 0.12) {
        const di = damagedNear(s, 1.9); // TODO(M-U3) 全量 → -1
        if (di >= 0) {
          setF64at(27, s, 22.0);
          repairBuilding(null, di, 3.0);
        }
      }
      if (warring && (job === 2 || job === 3)) {
        const inArmy = hasArmy;
        if (f64at(27, s) <= 0.0) {
          const bi = enemyBuildingNear(s, 1.6); // TODO(M-U3) 全量 → -1
          if (bi >= 0) {
            setF64at(27, s, 14.0);
            setF64at(35, s, 12.0);
            if (!attackBuilding(null, bi, f64at(22, s) * 1.6)) {
              setF64at(125, 0, bi);
              setF64at(125, 1, ucivT);
              return 3 /* BAIL_ATTACK_DEST */;
            }
          }
        }
        if (job === 3 && f64at(27, s) <= 0.0 && rngNext() < 0.1) {
          const bi = enemyBuildingNear(s, f64at(132, 3 * 5 + 4 /* JB_RNG */));
          if (bi >= 0) {
            setF64at(27, s, 18.0);
            fx(null, FX_ARROW, (bi % W) + 0.5, Math.floor(bi / W) + 0.5, 12.0, 1.0, f64at(0, s), f64at(1, s), f64at(22, s), ucivT, false, TXT_NONE, 0, true);
          }
        }
        if (!inArmy) {
          if (rngNext() < 0.05 && maybeBoardForWar(null, s)) {
            dirty(s);
            return 0;
          }
          const tdx = f64at(18, s) - f64at(0, s);
          const tdy = f64at(19, s) - f64at(1, s);
          if (tdx * tdx + tdy * tdy < 1.44 || rngNext() < 0.03) {
            const tgt = nearestEnemyBuilding(s); // TODO(M-U3) 全量 → -1
            if (tgt >= 0) {
              setF64at(18, s, i32at(86, tgt * 2) + rngNext() * 2.0 - 1.0);
              setF64at(19, s, i32at(86, tgt * 2 + 1) + rngNext() * 2.0 - 1.0);
            }
          }
        }
      } else if (job === 1 && rngNext() < 0.06) {
        const f = nearestBuildingOf(s, 4); // FARM；TODO(M-U3) 全量 → -1
        if (f >= 0) {
          setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, i32at(86, f * 2) + rngNext() * 5.0 - 2.5)));
          setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, i32at(86, f * 2 + 1) + rngNext() * 5.0 - 2.5)));
        }
      } else if (job === 5) {
        const civOk = ucivT >= 0 && ucivT < Math.max(i32at(67, 0), 0);
        const tdx = f64at(18, s) - f64at(0, s);
        const tdy = f64at(19, s) - f64at(1, s);
        if (civOk && (tdx * tdx + tdy * tdy < 1.44 || rngNext() < 0.03)) {
          const kindPick = rngNext() < 0.6 ? 9 : 2;
          const m = nearestBuildingOf(s, kindPick); // TODO(M-U3) 全量 → -1
          if (m >= 0) {
            const mx = i32at(86, m * 2);
            const my = i32at(86, m * 2 + 1);
            setF64at(18, s, mx + rngNext() * 2.0 - 1.0);
            setF64at(19, s, my + rngNext() * 2.0 - 1.0);
            const mdx = f64at(0, s) - mx;
            const mdy = f64at(1, s) - my;
            if (mdx * mdx + mdy * mdy < 2.25) {
              civDelta(null, 2, ucivT, 2.0);
              fx(null, FX_COIN, f64at(0, s), f64at(1, s) - 1.0, 24.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
            }
          }
        }
      } else if (job === 6 && rngNext() < 0.06) {
        const cap = i32at(71 /* OFF_CVCAP */, ucivT);
        if (cap >= 0) {
          setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, (cap % W) + rngNext() * 6.0 - 3.0)));
          setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, Math.floor(cap / W) + rngNext() * 6.0 - 3.0)));
        }
      } else if (rngNext() < 0.02) {
        const tgt = warTargetSp(ucivT); // march to war（全量：无建筑 → -1）
        if (tgt >= 0) {
          setF64at(18, s, i32at(86, tgt * 2) + rngNext() * 4.0 - 2.0);
          setF64at(19, s, i32at(86, tgt * 2 + 1) + rngNext() * 4.0 - 2.0);
        }
      }
      // 商队（L3122-3140）
      if (uCaravan0(s) > 0.0) {
        const pc = uCaravan0(s) | 0;
        const mi = i32at(77 /* OFF_CVMKT */, pc);
        const pcAlive = pc >= 0 && pc < 64 && u8at(72, pc) !== 0;
        if (!pcAlive || mi < 0) {
          setF64at(50, s, 0.0);
        } else {
          setF64at(18, s, (mi % W) + 0.5);
          setF64at(19, s, Math.floor(mi / W) + 0.5);
          const cdx = f64at(0, s) - f64at(18, s);
          const cdy = f64at(1, s) - f64at(19, s);
          if (cdx * cdx + cdy * cdy < 3.24) {
            setF64at(125, 0, 1.0);
            return 4 /* BAIL_CARAVAN */;
          }
        }
      }
    }
    // 捕食者索敌
    if (isPredator(race) && !isUndead(race) && uFood0(s) < 70.0 && rngNext() < 0.4) {
      const hx = Math.floor(jsMin(ctxBw - 1.0, jsMax(0.0, Math.floor(f64at(0, s) / 4.0))));
      const hy = Math.floor(jsMin(ctxBh - 1.0, jsMax(0.0, Math.floor(f64at(1, s) / 4.0))));
      let prey = -1, preyD2 = 26.0 * 26.0;
      for (let by = hy - 6; by <= hy + 6; by++) {
        if (by < 0 || by >= ctxBh) continue;
        for (let bx = hx - 6; bx <= hx + 6; bx++) {
          if (bx < 0 || bx >= ctxBw) continue;
          const cell = by * ctxBw + bx;
          const start = i32at(9, cell);
          const end = i32at(9, cell + 1);
          for (let k = start; k < end; k++) {
            const o = u32at(10, k) >>> 0;
            if (u8at(14, o) !== 0 || o === s) continue;
            if (!isHerbivore(u32at(5, o) >>> 0)) continue;
            const pdx = f64at(0, o) - ux, pdy = f64at(1, o) - uy;
            const pd2 = pdx * pdx + pdy * pdy;
            if (pd2 < preyD2) { preyD2 = pd2; prey = o; }
          }
        }
      }
      if (prey >= 0 && !truthyF(f64at(41, s))) {
        setF64at(18, s, f64at(0, prey));
        setF64at(19, s, f64at(1, prey));
        moveUnit(null, s, 1.15);
        return 0;
      }
      if (!truthyF(f64at(41, s))) {
        const gx = Math.floor(jsMin(31.0, jsMax(0.0, Math.floor(ux / 8.0))));
        const gy = Math.floor(jsMin(19.0, jsMax(0.0, Math.floor(uy / 8.0))));
        let bestCell = -1, bestScore = 0.0;
        for (let cy2 = Math.max(0, gy - 3); cy2 <= Math.min(19, gy + 3); cy2++) {
          for (let cx2 = Math.max(0, gx - 3); cx2 <= Math.min(31, gx + 3); cx2++) {
            const c = u32at(110 /* OFF_PREY */, cy2 * 32 + cx2) & 0xffff;
            if (c > 0.0) {
              const dd = fdHypot(cx2 - gx, cy2 - gy);
              if (dd >= 0.9) {
                const score = c / (1.0 + dd * 0.8);
                if (score > bestScore) { bestScore = score; bestCell = cy2 * 32 + cx2; }
              }
            }
          }
        }
        if (bestCell >= 0) {
          setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, (bestCell % 32) * 8.0 + 4.0 + (rngNext() * 4.0 - 2.0))));
          setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, Math.floor(bestCell / 32) * 8.0 + 4.0 + (rngNext() * 4.0 - 2.0))));
          moveUnit(null, s, 1.15);
          return 0;
        }
      }
    }
    // 随机漫游
    {
      const ndx = f64at(18, s) - f64at(0, s), ndy = f64at(19, s) - f64at(1, s);
      if (uCaravan0(s) === 0.0 && (ndx * ndx + ndy * ndy < 0.25 || rngNext() < 0.02)) {
        const r = race === R_SHEEP ? 2.5 : race === R_DRAGON ? 9.0 : 5.0;
        let wx = f64at(0, s) + (rngNext() * 2.0 - 1.0) * r;
        let wy = f64at(1, s) + (rngNext() * 2.0 - 1.0) * r;
        if (isPredator(race) && !isUndead(race) && uFood0(s) < 55.0) {
          for (let k = 0; k < 3; k++) {
            const gx = f64at(0, s) + (rngNext() * 2.0 - 1.0) * 14.0;
            const gy = f64at(1, s) + (rngNext() * 2.0 - 1.0) * 14.0;
            const gj = idx(Math.floor(jsMax(0.0, jsMin(W - 1.0, gx))), Math.floor(jsMax(0.0, jsMin(H - 1.0, gy))));
            const tt = u8at(60, gj);
            if ((tt === T_GRASS || tt === T_FOREST) && u8at(64, gj) === 0) { wx = gx; wy = gy; break; }
          }
        }
        setF64at(18, s, jsMax(1.0, jsMin(W - 2.0, wx)));
        setF64at(19, s, jsMax(1.0, jsMin(H - 2.0, wy)));
      }
      moveUnit(null, s, 1.0);
    }
  }
  // 拾取（M-U2d 全量）
  if (i32at(90 /* OFF_ITMN */, 0) > 0 && (isCiv(race) || race === R_BANDIT)) tryPickup(s);
  // 繁衍（M-U2d 全量；L3267-3340）
  if ((laws & LAW_REPRO) !== 0) {
    const repro = f64at(130, race * 12 + RB_REPRO);
    if (repro > 0.0 && rngNext() < repro) {
      const uciv2 = i32at(4, s);
      let boost = 1.0;
      if (isCiv(race) && uciv2 >= 0 && (u8at(OFF_CVDIR, uciv2) & 1) !== 0) boost *= 1.8;
      if (isCiv(race) && uciv2 >= 0) boost *= f64at(74, uciv2 * 24 + TC_REPRO) * (1.0 + f64at(74, uciv2 * 24 + TC_IDEA_REPRO));
      if (truthyF(f64at(40, s))) boost *= 2.5;
      const gr = f64at(53, s * 4 + 3);
      boost *= Number.isNaN(gr) ? 1.0 : gr;
      if (uPanic0(s) >= 0.5) boost *= 0.3;
      if (isCiv(race)) boost *= 0.85 + f64at(130, race * 12 + RB_GROWTH) * 0.3;
      boost *= f64at(OFF_REPRM, 0);
      if (isCiv(race) && uciv2 >= 0 && civAtWar(uciv2)) boost *= 0.55;
      if (!isCiv(race) && !isPredator(race)) boost *= 0.75 + jsMin(0.75, f64at(OFF_GRASS2, 0) / 16000.0);
      if (isPredator(race)) boost *= 1.6 + jsMin(1.4, jsMax(0.0, (uFood0(s) - 40.0) / 85.0));
      boost *= ep(EP_REPRO);
      const foodOk = !isPredator(race) || uFood0(s) > 40.0;
      if (foodOk && rngNext() < boost) {
        if (isCiv(race)) {
          const civAlive = uciv2 >= 0 && uciv2 < 64 && u8at(OFF_CVAL2, uciv2) !== 0;
          const popOk = civAlive && f64at(OFF_CVPOP, uciv2) < f64at(OFF_CVPC, uciv2) + 6.0;
          if (popOk && LIVE_LEN < Math.max(i32at(OFF_MISC, 0), 0)) {
            const cg = childGene(s);
            if (emergentGate(cg)) {
              for (let k = 0; k < 4; k++) setF64at(OFF_BAILP, k, cg[k]);
              setF64at(OFF_BAILP, 4, 1.0);
              return BAIL_EMERGENT;
            }
            const [fam2, fgn2] = famForChild(s, race);
            spawnUnit(race, f64at(0, s) + rngNext() - 0.5, f64at(1, s) + rngNext() - 0.5, uciv2, cg, false, -1, -1, fam2, fgn2);
            fx(null, FX_HEART, f64at(0, s), f64at(1, s) - 1.0, 40.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
          }
        } else {
          const cap = i32at(OFF_WILDCAP, race);
          const same = i32at(OFF_WILD2, race);
          if (same < cap) {
            const cg = childGene(s);
            if (emergentGate(cg)) {
              for (let k = 0; k < 4; k++) setF64at(OFF_BAILP, k, cg[k]);
              setF64at(OFF_BAILP, 4, 0.0);
              return BAIL_EMERGENT;
            }
            const [fam2, fgn2] = famForChild(s, race);
            spawnUnit(race, f64at(0, s) + rngNext() - 0.5, f64at(1, s) + rngNext() - 0.5, -1, cg, false, -1, -1, fam2, fgn2);
            fx(null, FX_HEART, f64at(0, s), f64at(1, s) - 1.0, 40.0, 1.0, 0.0, 0.0, 0.0, -1, false, TXT_NONE, 0, false);
          }
        }
      }
    }
  }
  return 0;
}

// —— units_batch 转写（lib.rs L3542-3595 语义）——
function unitsBatch(from, limit, liveLen) {
  parity = u8at(98 /* OFF_PAR */, 0);
  actCur = 0; overflow = false; ctxBw = 256; ctxBh = 160;
  LIVE_LEN = liveLen;
  let i = from;
  const lim = limit === 0 ? Number.MAX_SAFE_INTEGER : from + limit;
  let processed = 0;
  let iterGuard = 0;
  while (true) {
    iterGuard += 1;
    if (iterGuard > 30000) {
      setF64at(125 /* OFF_BAILP */, 0, liveLen);
      setF64at(125, 1, i);
      setU32at(129 /* OFF_BATCHR */, 0, 5);
      return 5;
    }
    if (i >= liveLenOf() || from + processed >= lim) break;
    if (u8at(47 /* OFF_UPAR */, i) === parity && u8at(14, i) === 0) {
      processed += 1;
      const bail = updateUnit(i);
      if (bail !== 0) {
        setU32at(122 /* OFF_BAILK */, 0, bail >>> 0);
        setU32at(123 /* OFF_BAILS */, 0, i >>> 0);
        setU32at(124 /* OFF_BAILL */, 0, bail >>> 0);
        setI32at(121, 0, actCur);
        setU32at(129, 0, 2);
        return 2;
      }
    }
    i += 1;
  }
  setI32at(121, 0, actCur);
  if (overflow) { setU32at(129, 0, 3); return 3; }
  setU32at(129, 0, 1);
  return 1;
}

export { unitsBatch, fdSin, fdCos, fdExp, fdTanh, fdAtan2, fdHypot };
