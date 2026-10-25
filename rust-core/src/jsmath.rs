// ============ jsmath.rs — fdlibm 位精确移植（Rust 生产版） ============
// 与 bench-45a/fdlibm.ts（已对 netlib 原始 C 编译版 200000 样本 0 位差验证）同算法。
// 目的：WASM 路径的超越函数与开发工装（TS fdlibm 垫片）逐位一致；
// 生产浏览器不再依赖平台 libm → 同种子跨平台世界线一致（确定性升级）。

#![allow(clippy::excessive_precision)]
#![allow(clippy::eq_op)]
#![allow(dead_code)]

#[inline(always)]
pub fn hi(x: f64) -> i32 {
    ((x.to_bits() >> 32) & 0xFFFF_FFFF) as u32 as i32
}
#[inline(always)]
pub fn lo(x: f64) -> u32 {
    x.to_bits() as u32
}
#[inline(always)]
pub fn set_hi(x: f64, h: i32) -> f64 {
    f64::from_bits((x.to_bits() & 0xFFFF_FFFF) | (((h as u32) as u64) << 32))
}
#[inline(always)]
pub fn xor_hi(x: f64, h: i32) -> f64 {
    let cur = ((x.to_bits() >> 32) & 0xFFFF_FFFF) as u32 as i32;
    set_hi(x, cur ^ h)
}

// ---------------- __ieee754_exp ----------------
const E_ONE: f64 = 1.0;
const E_HALF: [f64; 2] = [0.5, -0.5];
const E_HUGE: f64 = 1.0e+300;
const E_TWOM1000: f64 = 9.33263618503218878990e-302;
const E_O_THRESHOLD: f64 = 7.09782712893383973096e+02;
const E_U_THRESHOLD: f64 = -7.45133219101941108420e+02;
const E_LN2_HI: [f64; 2] = [6.93147180369123816490e-01, -6.93147180369123816490e-01];
const E_LN2_LO: [f64; 2] = [1.90821492927058770002e-10, -1.90821492927058770002e-10];
const E_INVLN2: f64 = 1.44269504088896338700e+00;
const E_P1: f64 = 1.66666666666666019037e-01;
const E_P2: f64 = -2.77777777770155933842e-03;
const E_P3: f64 = 6.61375632143793436117e-05;
const E_P4: f64 = -1.65339022054652515390e-06;
const E_P5: f64 = 4.13813679705723846039e-08;

pub fn fd_exp(x: f64) -> f64 {
    let mut x = x;
    let y: f64;
    let mut hi_: f64 = 0.0;
    let mut lo_: f64 = 0.0;
    let c: f64;
    let t: f64;
    let mut k: i32;
    let xsb: i32;

    let mut hx = hi(x);
    xsb = ((hx as u32) >> 31) as i32 & 1;
    hx &= 0x7fffffff;

    if hx >= 0x40862E42 {
        if hx >= 0x7ff00000 {
            if ((hx & 0xfffff) as u32 | lo(x)) != 0 {
                return x + x;
            } else {
                return if xsb == 0 { x } else { 0.0 };
            }
        }
        if x > E_O_THRESHOLD {
            return E_HUGE * E_HUGE;
        }
        if x < E_U_THRESHOLD {
            return E_TWOM1000 * E_TWOM1000;
        }
    }

    if hx > 0x3fd62e42 {
        if hx < 0x3ff0a2b2 {
            hi_ = x - E_LN2_HI[xsb as usize];
            lo_ = E_LN2_LO[xsb as usize];
            k = 1 - xsb - xsb;
        } else {
            k = (E_INVLN2 * x + E_HALF[xsb as usize]) as i32;
            t = k as f64;
            hi_ = x - t * E_LN2_HI[0];
            lo_ = t * E_LN2_LO[0];
        }
        x = hi_ - lo_;
    } else if hx < 0x3e300000 {
        if E_HUGE + x > E_ONE {
            return E_ONE + x;
        }
        k = 0;
    } else {
        k = 0;
    }

    let t = x * x;
    let c = x - t * (E_P1 + t * (E_P2 + t * (E_P3 + t * (E_P4 + t * E_P5))));
    if k == 0 {
        return E_ONE - ((x * c) / (c - 2.0) - x);
    } else {
        y = E_ONE - ((lo_ - (x * c) / (2.0 - c)) - hi_);
    }
    if k >= -1021 {
        return set_hi(y, hi(y).wrapping_add(k << 20));
    } else {
        let y2 = set_hi(y, hi(y).wrapping_add((k + 1000) << 20));
        y2 * E_TWOM1000
    }
}

// ---------------- expm1 ----------------
const X_ONE: f64 = 1.0;
const X_HUGE: f64 = 1.0e+300;
const X_TINY: f64 = 1.0e-300;
const X_O_THRESHOLD: f64 = 7.09782712893383973096e+02;
const X_LN2_HI: f64 = 6.93147180369123816490e-01;
const X_LN2_LO: f64 = 1.90821492927058770002e-10;
const X_INVLN2: f64 = 1.44269504088896338700e+00;
const X_Q1: f64 = -3.33333333333331316428e-02;
const X_Q2: f64 = 1.58730158725481460165e-03;
const X_Q3: f64 = -7.93650757867487942473e-05;
const X_Q4: f64 = 4.00821782732936239552e-06;
const X_Q5: f64 = -2.01099218183624371326e-07;

pub fn fd_expm1(x: f64) -> f64 {
    let mut x = x;
    let mut y: f64;
    let hi_: f64;
    let lo_: f64;
    let mut c: f64 = 0.0;
    let mut t: f64;
    let e: f64;
    let hxs: f64;
    let hfx: f64;
    let r1: f64;
    let mut k: i32;

    let mut hx = hi(x);
    let xsb = hx & (0x80000000u32 as i32);
    y = if xsb == 0 { x } else { -x };
    hx &= 0x7fffffff;

    if hx >= 0x4043687A {
        if hx >= 0x40862E42 {
            if hx >= 0x7ff00000 {
                if ((hx & 0xfffff) as u32 | lo(x)) != 0 {
                    return x + x;
                } else {
                    return if xsb == 0 { x } else { -1.0 };
                }
            }
            if x > X_O_THRESHOLD {
                return X_HUGE * X_HUGE;
            }
        }
        if xsb != 0 {
            if x + X_TINY < 0.0 {
                return X_TINY - X_ONE;
            }
        }
    }

    if hx > 0x3fd62e42 {
        if hx < 0x3ff0a2b2 {
            if xsb == 0 {
                hi_ = x - X_LN2_HI;
                lo_ = X_LN2_LO;
                k = 1;
            } else {
                hi_ = x + X_LN2_HI;
                lo_ = -X_LN2_LO;
                k = -1;
            }
        } else {
            k = (X_INVLN2 * x + if xsb == 0 { 0.5 } else { -0.5 }) as i32;
            t = k as f64;
            hi_ = x - t * X_LN2_HI;
            lo_ = t * X_LN2_LO;
        }
        x = hi_ - lo_;
        c = (hi_ - x) - lo_;
    } else if hx < 0x3c900000 {
        t = X_HUGE + x;
        return x - (t - (X_HUGE + x));
    } else {
        k = 0;
    }

    hfx = 0.5 * x;
    hxs = x * hfx;
    r1 = X_ONE + hxs * (X_Q1 + hxs * (X_Q2 + hxs * (X_Q3 + hxs * (X_Q4 + hxs * X_Q5))));
    t = 3.0 - r1 * hfx;
    let mut e = hxs * ((r1 - t) / (6.0 - x * t));
    if k == 0 {
        return x - (x * e - hxs);
    } else {
        e = x * (e - c) - c;
        e -= hxs;
        if k == -1 {
            return 0.5 * (x - e) - 0.5;
        }
        if k == 1 {
            if x < -0.25 {
                return -2.0 * (e - (x + 0.5));
            } else {
                return X_ONE + 2.0 * (x - e);
            }
        }
        if k <= -2 || k > 56 {
            y = X_ONE - (e - x);
            y = set_hi(y, hi(y).wrapping_add(k << 20));
            return y - X_ONE;
        }
        t = X_ONE;
        if k < 20 {
            t = set_hi(t, (0x3ff00000i32).wrapping_sub(0x200000 >> k));
            y = t - (e - x);
            y = set_hi(y, hi(y).wrapping_add(k << 20));
        } else {
            t = set_hi(t, (0x3ff - k) << 20);
            y = x - (e + t);
            y += X_ONE;
            y = set_hi(y, hi(y).wrapping_add(k << 20));
        }
    }
    y
}

// ---------------- tanh ----------------
const T_ONE: f64 = 1.0;
const T_TWO: f64 = 2.0;
const T_TINY: f64 = 1.0e-300;

pub fn fd_tanh(x: f64) -> f64 {
    let t: f64;
    let z: f64;

    let jx = hi(x);
    let ix = (jx as u32) & 0x7fffffff;

    if ix >= 0x7ff00000 {
        if jx >= 0 {
            return T_ONE / x + T_ONE;
        } else {
            return T_ONE / x - T_ONE;
        }
    }

    if ix < 0x40360000 {
        if ix < 0x3c800000 {
            return x * (T_ONE + x);
        }
        if ix >= 0x3ff00000 {
            t = fd_expm1(T_TWO * x.abs());
            z = T_ONE - T_TWO / (t + T_TWO);
        } else {
            t = fd_expm1(-T_TWO * x.abs());
            z = -t / (t + T_TWO);
        }
    } else {
        z = T_ONE - T_TINY;
    }
    if jx >= 0 {
        z
    } else {
        -z
    }
}

// ---------------- hypot ----------------
pub fn fd_hypot(x: f64, y: f64) -> f64 {
    let mut a = x;
    let mut b = y;
    let t1: f64;
    let t2: f64;
    let y1: f64;
    let y2: f64;
    let w: f64;

    let mut ha = hi(x) & 0x7fffffff;
    let mut hb = hi(y) & 0x7fffffff;
    if hb > ha {
        core::mem::swap(&mut a, &mut b);
        core::mem::swap(&mut ha, &mut hb);
    }
    a = set_hi(a, ha);
    b = set_hi(b, hb);
    if ha - hb > 0x3c00000 {
        return a + b;
    }
    let mut k = 0i32;
    if ha > 0x5f300000 {
        if ha >= 0x7ff00000 {
            let mut w = a + b;
            if ((ha & 0xfffff) as u32 | lo(a)) == 0 {
                w = a;
            }
            if ((hb as u32) ^ 0x7ff00000) | lo(b) == 0 {
                w = b;
            }
            return w;
        }
        ha -= 0x25800000;
        hb -= 0x25800000;
        k += 600;
        a = set_hi(a, ha);
        b = set_hi(b, hb);
    }
    if hb < 0x20b00000 {
        if hb <= 0x000fffff {
            if (hb as u32 | lo(b)) == 0 {
                return a;
            }
            let mut t1 = 0.0;
            t1 = set_hi(t1, 0x7fd00000);
            b *= t1;
            a *= t1;
            k -= 1022;
        } else {
            ha += 0x25800000;
            hb += 0x25800000;
            k -= 600;
            a = set_hi(a, ha);
            b = set_hi(b, hb);
        }
    }
    let mut w = a - b;
    if w > b {
        let mut t1 = 0.0;
        t1 = set_hi(t1, ha);
        t2 = a - t1;
        w = (t1 * t1 - (b * (-b) - t2 * (a + t1))).sqrt();
    } else {
        a = a + a;
        let mut y1 = 0.0;
        y1 = set_hi(y1, hb);
        y2 = b - y1;
        let mut t1 = 0.0;
        t1 = set_hi(t1, ha + 0x00100000);
        t2 = a - t1;
        w = (t1 * y1 - (w * (-w) - (t1 * y2 + t2 * b))).sqrt();
    }
    if k != 0 {
        let mut t1 = 1.0;
        t1 = set_hi(t1, hi(t1).wrapping_add(k << 20));
        t1 * w
    } else {
        w
    }
}

// ---------------- atan ----------------
const A_ATANHI: [f64; 4] = [
    4.63647609000806093515e-01,
    7.85398163397448278999e-01,
    9.82793723247329054082e-01,
    1.57079632679489655800e+00,
];
const A_ATANLO: [f64; 4] = [
    2.26987774529616870924e-17,
    3.06161699786838301793e-17,
    1.39033110312309984516e-17,
    6.12323399573676603587e-17,
];
const A_AT: [f64; 11] = [
    3.33333333333329318027e-01,
    -1.99999999998764832476e-01,
    1.42857142725034663711e-01,
    -1.11111104054623557880e-01,
    9.09088713343650656196e-02,
    -7.69187620504482999495e-02,
    6.66107313738753120669e-02,
    -5.83357013379057348645e-02,
    4.97687799461593236017e-02,
    -3.65315727442169155270e-02,
    1.62858201153657823623e-02,
];
const A_ONE: f64 = 1.0;
const A_HUGE: f64 = 1.0e+300;

pub fn fd_atan(x: f64) -> f64 {
    let mut x = x;
    let w: f64;
    let s1: f64;
    let s2: f64;
    let mut z: f64;
    let id: i32;

    let hx = hi(x);
    let ix = (hx as u32) & 0x7fffffff;
    if ix >= 0x44100000 {
        if ix > 0x7ff00000 || (ix == 0x7ff00000 && lo(x) != 0) {
            return x + x;
        }
        if hx > 0 {
            return A_ATANHI[3] + A_ATANLO[3];
        } else {
            return -A_ATANHI[3] - A_ATANLO[3];
        }
    }
    if ix < 0x3fdc0000 {
        if ix < 0x3e200000 {
            if A_HUGE + x > A_ONE {
                return x;
            }
        }
        id = -1;
    } else {
        x = x.abs();
        if ix < 0x3ff30000 {
            if ix < 0x3fe60000 {
                id = 0;
                x = (2.0 * x - A_ONE) / (2.0 + x);
            } else {
                id = 1;
                x = (x - A_ONE) / (x + A_ONE);
            }
        } else if ix < 0x40038000 {
            id = 2;
            x = (x - 1.5) / (A_ONE + 1.5 * x);
        } else {
            id = 3;
            x = -1.0 / x;
        }
    }
    z = x * x;
    w = z * z;
    s1 = z * (A_AT[0] + w * (A_AT[2] + w * (A_AT[4] + w * (A_AT[6] + w * (A_AT[8] + w * A_AT[10])))));
    s2 = w * (A_AT[1] + w * (A_AT[3] + w * (A_AT[5] + w * (A_AT[7] + w * A_AT[9]))));
    if id < 0 {
        x - x * (s1 + s2)
    } else {
        z = A_ATANHI[id as usize] - ((x * (s1 + s2) - A_ATANLO[id as usize]) - x);
        if hx < 0 {
            -z
        } else {
            z
        }
    }
}

// ---------------- atan2 ----------------
const AT2_ZERO: f64 = 0.0;
const AT2_TINY: f64 = 1.0e-300;
const AT2_PI_O_4: f64 = 7.8539816339744827900e-01;
const AT2_PI_O_2: f64 = 1.5707963267948965580e+00;
const AT2_PI: f64 = 3.1415926535897931160e+00;
const AT2_PI_LO: f64 = 1.2246467991473531772e-16;

pub fn fd_atan2(y: f64, x: f64) -> f64 {
    let mut z: f64;

    let hx = hi(x);
    let ix = (hx as u32) & 0x7fffffff;
    let lx = lo(x);
    let hy = hi(y);
    let iy = (hy as u32) & 0x7fffffff;
    let ly = lo(y);
    if (ix | ((lx | lx.wrapping_neg()) >> 31)) > 0x7ff00000
        || (iy | ((ly | ly.wrapping_neg()) >> 31)) > 0x7ff00000
    {
        return x + y;
    }
    if ((hx.wrapping_sub(0x3ff00000)) as u32 | lx) == 0 {
        return fd_atan(y);
    }
    let m = (((hy as u32) >> 31) as i32 & 1) | ((((hx as u32) >> 30) as i32) & 2);

    if (iy | ly) == 0 {
        return match m {
            0 | 1 => y,
            2 => AT2_PI + AT2_TINY,
            _ => -AT2_PI - AT2_TINY,
        };
    }
    if (ix | lx) == 0 {
        return if hy < 0 {
            -AT2_PI_O_2 - AT2_TINY
        } else {
            AT2_PI_O_2 + AT2_TINY
        };
    }

    if ix == 0x7ff00000 {
        if iy == 0x7ff00000 {
            return match m {
                0 => AT2_PI_O_4 + AT2_TINY,
                1 => -AT2_PI_O_4 - AT2_TINY,
                2 => 3.0 * AT2_PI_O_4 + AT2_TINY,
                _ => -3.0 * AT2_PI_O_4 - AT2_TINY,
            };
        } else {
            return match m {
                0 => AT2_ZERO,
                1 => -AT2_ZERO,
                2 => AT2_PI + AT2_TINY,
                _ => -AT2_PI - AT2_TINY,
            };
        }
    }
    if iy == 0x7ff00000 {
        return if hy < 0 {
            -AT2_PI_O_2 - AT2_TINY
        } else {
            AT2_PI_O_2 + AT2_TINY
        };
    }

    let k = (iy as i32).wrapping_sub(ix as i32) >> 20;
    if k > 60 {
        z = AT2_PI_O_2 + 0.5 * AT2_PI_LO;
    } else if hx < 0 && k < -60 {
        z = 0.0;
    } else {
        z = fd_atan((y / x).abs());
    }
    match m {
        0 => z,
        1 => xor_hi(z, 0x80000000u32 as i32),
        2 => AT2_PI - (z - AT2_PI_LO),
        _ => (z - AT2_PI_LO) - AT2_PI,
    }
}

// ---------------- sin / cos ----------------
const S_HALF: f64 = 5.00000000000000000000e-01;
const S_S1: f64 = -1.66666666666666324348e-01;
const S_S2: f64 = 8.33333333332248946124e-03;
const S_S3: f64 = -1.98412698298579493134e-04;
const S_S4: f64 = 2.75573137070700676789e-06;
const S_S5: f64 = -2.50507602534068634195e-08;
const S_S6: f64 = 1.58969099521155010221e-10;

fn k_sin(x: f64, y: f64, iy: i32) -> f64 {
    let ix = (hi(x) as u32) & 0x7fffffff;
    if ix < 0x3e400000 {
        if x.trunc() == 0.0 {
            return x;
        }
    }
    let z = x * x;
    let v = z * x;
    let r = S_S2 + z * (S_S3 + z * (S_S4 + z * (S_S5 + z * S_S6)));
    if iy == 0 {
        x + v * (S_S1 + z * r)
    } else {
        x - ((z * (S_HALF * y - v * r) - y) - v * S_S1)
    }
}

const C_ONE: f64 = 1.00000000000000000000e+00;
const C_C1: f64 = 4.16666666666666019037e-02;
const C_C2: f64 = -1.38888888888741095749e-03;
const C_C3: f64 = 2.48015872894767294178e-05;
const C_C4: f64 = -2.75573143513906633035e-07;
const C_C5: f64 = 2.08757232129817482790e-09;
const C_C6: f64 = -1.13596475577881948265e-11;

fn k_cos(x: f64, y: f64) -> f64 {
    let ix = (hi(x) as u32) & 0x7fffffff;
    if ix < 0x3e400000 {
        if x.trunc() == 0.0 {
            return C_ONE;
        }
    }
    let z = x * x;
    let r = z * (C_C1 + z * (C_C2 + z * (C_C3 + z * (C_C4 + z * (C_C5 + z * C_C6)))));
    if ix < 0x3FD33333 {
        C_ONE - (0.5 * z - (z * r - x * y))
    } else {
        let qx = if ix > 0x3fe90000 {
            0.28125
        } else {
            let q = 0.0;
            set_hi(q, (ix as i32) - 0x00200000)
        };
        let hz = 0.5 * z - qx;
        let a = C_ONE - qx;
        a - (hz - (z * r - x * y))
    }
}

const RP_HALF: f64 = 5.00000000000000000000e-01;
const RP_INVLN2: f64 = 6.36619772367581382433e-01; // 此为 rem_pio2 不用；防误删
const RP_PIO2_1: f64 = 1.57079632673412561417e+00;
const RP_PIO2_1T: f64 = 6.07710050650619224932e-11;
const RP_PIO2_2: f64 = 6.07710050630396597660e-11;
const RP_PIO2_2T: f64 = 2.02226624879595063154e-21;
const RP_PIO2_3: f64 = 2.02226624871116645580e-21;
const RP_PIO2_3T: f64 = 8.47842766036889956997e-32;
const RP_INVPIO2: f64 = 6.36619772367581382433e-01;
const RP_NPIO2_HW: [u32; 32] = [
    0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C,
    0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C,
    0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A,
    0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
    0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
    0x404858EB, 0x404921FB,
];

// 中幅 rem_pio2（游戏值域 |x| ≤ 8；大幅分支不可达 —— 到达则原样返回由上层兜底）
fn rem_pio2_med(x: f64, y: &mut [f64; 2]) -> i32 {
    let hx = hi(x);
    let ix = (hx as u32) & 0x7fffffff;
    if ix <= 0x3fe921fb {
        y[0] = x;
        y[1] = 0.0;
        return 0;
    }
    if ix < 0x4002d97c {
        let mut z;
        if hx > 0 {
            z = x - RP_PIO2_1;
            if ix != 0x3ff921fb {
                y[0] = z - RP_PIO2_1T;
                y[1] = (z - y[0]) - RP_PIO2_1T;
            } else {
                z -= RP_PIO2_2;
                y[0] = z - RP_PIO2_2T;
                y[1] = (z - y[0]) - RP_PIO2_2T;
            }
            return 1;
        } else {
            z = x + RP_PIO2_1;
            if ix != 0x3ff921fb {
                y[0] = z + RP_PIO2_1T;
                y[1] = (z - y[0]) + RP_PIO2_1T;
            } else {
                z += RP_PIO2_2;
                y[0] = z + RP_PIO2_2T;
                y[1] = (z - y[0]) + RP_PIO2_2T;
            }
            return -1;
        }
    }
    if ix <= 0x413921fb {
        let mut t = x.abs();
        let mut n = (t * RP_INVPIO2 + RP_HALF) as i32;
        let fn_ = n as f64;
        let mut r = t - fn_ * RP_PIO2_1;
        let mut w = fn_ * RP_PIO2_1T;
        if n < 32 && ix != RP_NPIO2_HW[(n - 1) as usize] {
            y[0] = r - w;
        } else {
            let j = ix >> 20;
            y[0] = r - w;
            let mut i = (j as i32) - (((hi(y[0]) as u32) >> 20) as i32 & 0x7ff);
            if i > 16 {
                t = r;
                w = fn_ * RP_PIO2_2;
                r = t - w;
                w = fn_ * RP_PIO2_2T - ((t - r) - w);
                y[0] = r - w;
                i = (j as i32) - (((hi(y[0]) as u32) >> 20) as i32 & 0x7ff);
                if i > 49 {
                    let t2 = r;
                    let w2 = fn_ * RP_PIO2_3;
                    let r2 = t2 - w2;
                    let w3 = fn_ * RP_PIO2_3T - ((t2 - r2) - w2);
                    y[0] = r2 - w3;
                }
            }
        }
        y[1] = (r - y[0]) - w;
        if hx < 0 {
            y[0] = -y[0];
            y[1] = -y[1];
            -n
        } else {
            n
        }
    } else {
        y[0] = x;
        y[1] = 0.0;
        0
    }
}

pub fn fd_sin(x: f64) -> f64 {
    let mut y = [0.0f64; 2];
    let n = rem_pio2_med(x, &mut y);
    match n & 3 {
        0 => k_sin(y[0], y[1], 1),
        1 => k_cos(y[0], y[1]),
        2 => -k_sin(y[0], y[1], 1),
        _ => -k_cos(y[0], y[1]),
    }
}

pub fn fd_cos(x: f64) -> f64 {
    let mut y = [0.0f64; 2];
    let n = rem_pio2_med(x, &mut y);
    match n & 3 {
        0 => k_cos(y[0], y[1]),
        1 => -k_sin(y[0], y[1], 1),
        2 => -k_cos(y[0], y[1]),
        _ => k_sin(y[0], y[1], 1),
    }
}

// ---------------- JS 语义工具 ----------------
/// JS Math.round：向 +∞ 取半（floor(x+0.5) 语义；|x| < 2^52 域内等价）
#[inline(always)]
pub fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}
/// JS Math.min（NaN 传染）
#[inline(always)]
pub fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a < b {
        a
    } else {
        b
    }
}
/// JS Math.max（NaN 传染）
#[inline(always)]
pub fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else if a > b {
        a
    } else {
        b
    }
}
/// mulberry32（与 noise.ts 逐位一致）
#[inline(always)]
pub fn mulberry32_next(a: &mut u32) -> f64 {
    *a = a.wrapping_add(0x6d2b79f5);
    let mut t = (*a) ^ ((*a) >> 15);
    t = t.wrapping_mul(1 | *a);
    let t2 = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
    ((t2 ^ (t2 >> 14)) as u32) as f64 / 4294967296.0
}

// ---------------- 数学自测 ABI（开发工装：TS fdlibm vs Rust fdlibm 位级对账） ----------------
/// op: 0=sin 1=cos 2=exp 3=tanh 4=atan2(y,x) 5=hypot(y,x) 6=expm1
#[no_mangle]
pub extern "C" fn wb_math_test(ybits: u64, xbits: u64, op: u32) -> u64 {
    let y = f64::from_bits(ybits);
    let x = f64::from_bits(xbits);
    let r = match op {
        0 => fd_sin(y),
        1 => fd_cos(y),
        2 => fd_exp(y),
        3 => fd_tanh(y),
        4 => fd_atan2(y, x),
        5 => fd_hypot(y, x),
        _ => fd_expm1(y),
    };
    r.to_bits()
}
