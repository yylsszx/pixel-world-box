// ============================================================================
// units-update-transcript.mjs —— M-U7m 切片「updateUnit 批次二·扫描域」parity 镜像（零引擎导入，纪律④第二链）
// 蓝本：src/lib/game/engine.ts updateUnit L3455-3590（批次一，M-U7l）+ 扫描域 L3592-3669（批次二·本切片：
//       isEnemyFast/isEnemy + 3×3 桶环 + 血仇加权 + 恐慌传染 + 三逃离门）+ L3671+ 战斗哨兵 +
//       无敌壳 L3927-4112（civ=-1 / 无龙契约 → tail/post 影子调用点）。
// 消费：golden/units_update.json（gen-units-update.mjs 产物——env/units/muts 依黄金回放，
//       races 位字节即蓝本旗标源、ep 随 JSON 分发、traitRegen 随 fixture 回显——零独立打包）。
// 对账：perU 快照 bitHex 逐位 + evt/fx/terr/scan 事件流（'mv'/'scan' M-U7m 新增）+ 逐步 draws + fireSet + final + rngTail。
// 运行：node scripts/unity-migration/units-update-transcript.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GOLDEN = new URL('./golden/units_update.json', import.meta.url);
const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
// M-U7n：neuro 权重数据（gen-neurodefs.mjs 产物——生成数据面，非引擎导入；f32 语义以 fround 镜像）
const NW = JSON.parse(readFileSync(new URL('./golden/neuro_weights.json', import.meta.url), 'utf8'));

const W = g.w, H = g.h;
const T = { DEEP: 0, WATER: 1, SAND: 2, GRASS: 3, FOREST: 4, LAVA: 8, SNOW: 7, ICE: 10, BURNT: 9 };
const isWater = (t) => t === T.DEEP || t === T.WATER;

/** canonical +NaN（0x7ff8000000000000——bun 侧 Math.max 产物；node JIT MAXSD 路径会产 -NaN，
 *  跨运行时符号位漂移归一——C# WbMath.JsNaN 同协议，gen/verify 基线运行时 = bun） */
const JS_NAN = (() => { const dv = new DataView(new ArrayBuffer(8)); dv.setUint32(4, 0x7ff80000, true); return dv.getFloat64(0, true); })();
const jsMax = (a, b) => { const na = a === undefined || a !== a, nb = b === undefined || b !== b; return (na || nb) ? JS_NAN : (a > b ? a : b); };

/** IEEE754 小端 16 hex（位模式对账用，禁 epsilon） */
const bitHex = (d) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};

/** mulberry32（noise.ts L3-13 同式——掷值链独立重建） */
const mulberry32 = (a) => {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 种族旗标访问器（golden.races 位字节 = types.ts L157-204 打包面——镜像唯一旗标源；ranged/reach M-U7n 扩展字段随 JSON） */
const raceF = (id) => {
  const r = g.races[String(id)];
  if (!r) throw new Error('race flags missing: ' + id);
  return {
    hostile: !!(r.flags & 1), isCiv: !!(r.flags & 2), undead: !!(r.flags & 4),
    predator: !!(r.flags & 8), lavaImmune: !!(r.flags & 16),
    flying: !!(r.tbf0 & 32), aquatic: !!(r.tbf0 & 64), beach: !!(r.tbf1 & 8),
    ranged: r.ranged ?? null, reach: r.reach ?? null,   // M-U7n（MAGE ranged / KRAKEN 2.4 / SANDWORM 1.6 / BASILISK 1.4 / SHARK 1.3——fixture 种族均 null→reach ?? 0.9）
  };
};

/** 单位构造（golden spec → JS unit；null ≡ undefined——mkTsUnit L106-130 镜像） */
const mkU = (s) => {
  const u = { id: s.id, race: s.race, x: s.x, y: s.y, tx: s.tx ?? s.x, ty: s.ty ?? s.y };
  if (s.age !== undefined) u.age = s.age;
  if (s.maxAge !== undefined) u.maxAge = s.maxAge;
  if (s.hp !== undefined) u.hp = s.hp;
  if (s.maxHp !== undefined) u.maxHp = s.maxHp;
  if (s.hurt !== null) u.hurt = s.hurt;
  if (s.cd) u.cd = s.cd;
  if (s.atk) u.atk = s.atk;
  if (s.chill !== null) u.chill = s.chill;
  if (s.fleeT) u.fleeT = s.fleeT;
  if (s.bless) u.bless = s.bless;
  if (s.curse) u.curse = s.curse;
  if (s.fert) u.fert = s.fert;
  if (s.detour) u.detour = s.detour;
  if (s.panic !== null) u.panic = s.panic;
  if (s.gids !== null) { u.gIds = [...s.gids]; u.gVal = [...s.gval]; }
  if (s.food !== null) u.food = s.food;
  if (s.stk !== null) u.stk = s.stk;
  if (s.sxk !== null) u.sxk = s.sxk;
  if (s.syk !== null) u.syk = s.syk;
  if (s.infected) u.infected = true;
  if (s.grab) u.grab = s.grab;
  if (s.boat) u.boat = s.boat;
  if (s.caravan) u.caravan = s.caravan;                     // M-U7m L3641 商队门（spec 回显）
  if (s.dmg !== null && s.dmg !== undefined) u.dmg = s.dmg;   // M-U7n 战斗域（undefined 保持）
  u.kills = s.kills;                          // M-U7n（spawn 初值 0 镜像）
  u.civ = s.civ; u.job = s.job; u.flip = s.flip;
  if (s.trait !== null && s.trait !== undefined) u.trait = s.trait;
  u._regen = s.traitRegen ?? 0;                                    // fixture 回显再生值（TRAITS 表镜像）
  return u;
};

const snapU = (u) => ({
  age: bitHex(u.age), hp: bitHex(u.hp), maxAge: bitHex(u.maxAge), maxHp: bitHex(u.maxHp),
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
  caravan: u.caravan ?? 0,   // M-U7m 商队镜像（字段只加）
  dmg: u.dmg === undefined ? null : bitHex(u.dmg),   // M-U7n（undefined→null 条件对账）
  kills: u.kills ?? 0,       // M-U7n
  x: bitHex(u.x), y: bitHex(u.y), tx: bitHex(u.tx), ty: bitHex(u.ty),
});

const eq = (a, b, path) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${path} 漂移\n  镜像: ${JSON.stringify(a)}\n  黄金: ${JSON.stringify(b)}`);
};

let totalDraws = 0;

const BW = W / 4, BH = H / 4;                                 // engine L717-718（bw/bh——桶网格）

/** isHerbivoreRace L2120-2128 镜像（静态八种 + dynRaces 递归；黄金 fixture 无动态种 → dynRaces 空） */
const HERB_STATIC = new Set([6, 10, 11, 12, 33, 34, 35, 37]);   // SHEEP/DEER/PENGUIN/CAMEL/CHICKEN/PIG/RABBIT/FISH（types.ts R 表）
const isHerbivoreRaceT = (race, dynRaces) => {
  if (HERB_STATIC.has(race)) return true;                                                       // L2121-2123
  const d = dynRaces.get(race);                                                                 // L2124
  if (!d) return false;                                                                         // L2125
  if (d.eco === 'herb') return true;                                                            // L2126
  if (d.eco) return false;                                                                      // L2127
  return isHerbivoreRaceT(d.parent, dynRaces);                                                  // L2128
};

/** isEnemy L2083-2116 镜像（敌我判定全链；atWar L2061-2064 rel 空 Map 恒 false——黄金无交战国 fixture） */
function isEnemyT(w, a, b) {
  if (a === b) return false;                                                                    // L2084
  const ra = raceF(a.race), rb = raceF(b.race);                                                 // L2085-2086
  if (ra.undead && rb.undead) return false;                                                     // L2088 亡者并肩
  // L2095-2102 八对称分支（ZOMBIE 5/SKELETON 16/WHITEWALKER 23/DRAGON 9/DEMON 17/KRAKEN 25/SANDWORM 26/BASILISK 27——types.ts R 表）
  if (a.race === 5 || b.race === 5) return a.race !== b.race;
  if (a.race === 16 || b.race === 16) return a.race !== b.race;
  if (a.race === 23 || b.race === 23) return a.race !== b.race;
  if (a.race === 9 || b.race === 9) return a.race !== b.race;
  if (a.race === 17 || b.race === 17) return a.race !== b.race;
  if (a.race === 25 || b.race === 25) return a.race !== b.race;
  if (a.race === 26 || b.race === 26) return a.race !== b.race;
  if (a.race === 27 || b.race === 27) return a.race !== b.race;
  if (ra.hostile && rb.isCiv) return true;                                                      // L2103
  if (rb.hostile && ra.isCiv) return true;                                                      // L2104
  if (ra.predator && isHerbivoreRaceT(b.race, w.dynRaces)) return true;                          // L2106
  if (ra.predator && a.race === 8 && rb.isCiv) return true;                                      // L2107（BEAR×isCiv）
  if (a.race === 13 && isHerbivoreRaceT(b.race, w.dynRaces)) return true;                        // L2109（SCORPION）
  if (a.race === 14 && (isHerbivoreRaceT(b.race, w.dynRaces) || b.race === 13)) return true;     // L2111（SNAKE×SCORPION）
  if (a.race === 40) {                                                                          // L2113（SHARK：猎鱼 + 落水陆行种）
    if (b.race === 37) return true;
    if (!rb.aquatic && !rb.flying) {
      const t = w.terrain[Math.floor(b.y) * W + Math.floor(b.x)];                                // idx(floor(b.x), floor(b.y))
      if (t === 0 || t === 1) return true;                                                       // isWater（DEEP/WATER）
    }
  }
  if (a.civ >= 0 && b.civ >= 0 && a.civ !== b.civ) {                                            // L2114
    const k = a.civ < b.civ ? a.civ * 100000 + b.civ : b.civ * 100000 + a.civ;                   // pairKey 序规格（rel 空恒 false——黄金无交战）
    const v = w.rel.get(k);
    return v !== undefined && v < -20;
  }
  return false;                                                                                 // L2115
}

/** isEnemyFast L2070-2081 镜像（野生对 LUT 缓存 + 'scan' 调用日志事件流——gen 包装同构） */
function isEnemyFastT(w, a, b, scanLog) {
  let v;
  if (a.civ < 0 && b.civ < 0) {                                                                 // L2072
    const key = a.race * 65536 + b.race;                                                        // L2073
    const hit = w.enemyLut.get(key);                                                            // L2074
    if (hit !== undefined) v = hit;                                                             // L2075
    else { v = isEnemyT(w, a, b); w.enemyLut.set(key, v); }                                      // L2076-2077
  } else v = isEnemyT(w, a, b);                                                                 // L2080
  scanLog.push([a.id, b.id, v ? 1 : 0]);
  return v;
}

// ================= NeuroCore 镜像（M-U7n 批次三甲：neuro.ts dequantize L25-43 + fwd L108-121 +
// neuroStance argmax + neuroFlight RL 头默认；权重源 golden/neuro_weights.json——gen-neurodefs.mjs 机械生成） =================
const fround = Math.fround;   // Float32Array 语义镜像（f32 舍入）
function dequantizeT(spec) {
  const dq = (q, s) => q.map((v) => fround(v * s));   // L27-30：f64 乘积 → f32 存储
  return { arch: spec.arch, w1: dq(spec.w1q, spec.sw1), b1: dq(spec.b1q, spec.sb1), w2: dq(spec.w2q, spec.sw2), b2: dq(spec.b2q, spec.sb2) };
}
const HEADS = { acc: dequantizeT(NW.acc), stance: dequantizeT(NW.stance), flightBc: dequantizeT(NW.flightBc), flightRl: dequantizeT(NW.flightRl) };
const hid = {};   // 模块级 scratch（按头复用——单线程）
function fwdT(h, f) {
  const nH = h.arch[1], nIn = h.arch[0], nOut = h.arch[2];
  hid[h] ??= new Array(nH).fill(0);
  const H = hid[h];
  const out = new Array(nOut);
  for (let t = 0; t < nH; t++) {
    let s = h.b1[t];
    for (let i = 0; i < nIn; i++) s += f[i] * h.w1[i * nH + t];   // f64 累积（w1 f32 值提升）
    H[t] = fround(Math.tanh(s));                                   // tanh f64 → f32 存储
  }
  for (let j = 0; j < nOut; j++) {
    let s = h.b2[j];
    for (let t = 0; t < nH; t++) s += H[t] * h.w2[t * nOut + j];
    out[j] = fround(s);
  }
  return out;
}
function neuroStanceT(f) { const o = fwdT(HEADS.stance, f); let best = 0; for (let j = 1; j < o.length; j++) if (o[j] > o[best]) best = j; return best; }   // L185-203
function neuroFlightT(f) { const o = fwdT(HEADS.flightRl, f); return o[1] > o[0] ? 1 : 0; }   // L209-233（'rl' 默认头；softmax logp 在线采集不译）
const MONSTER_LOOT_T = new Set([9, 25, 26, 27, 21, 22, 23, 24, 17]);   // engine L6918（DRAGON/KRAKEN/SANDWORM/BASILISK/TROLL/OGRE/WHITEWALKER/VAMPIRE/DEMON）
const F_FLIGHT = new Array(9);    // neuro.ts L126（模块级 scratch）
const F_STANCE = new Array(12);   // neuro.ts L125

/** updateUnit 镜像（L3455-3590 批次一 + 扫描域 L3592-3669 批次二 + L3671+ 战斗哨兵 + 无敌壳；行号随注） */
function updateUnitT(u, ctx) {
  const r = raceF(u.race);                                                                       // L3456
  const rng = () => { totalDraws++; return ctx.raw(); };
  if (u.hurt > 0) u.hurt--;                                                                      // L3457（undefined>0=false 天然）
  if ((u.grab ?? 0) > 0) { ctx.evt.push(['grab', u.id]); return; }                                // L3459
  if (u.boat) { ctx.evt.push(['boat', u.id]); return; }                                           // L3461-3464
  u.age += 2 / 40;                                                                               // L3465（YEAR_TICKS）
  if (u.age > u.maxAge) {                                                                        // L3466
    if (ctx.lawsRise && r.isCiv && rng() < 0.08) ctx.evt.push(['rise', bitHex(u.x), bitHex(u.y)]);// L3467
    u.dead = true; return;                                                                       // L3468
  }
  if (u.cd > 0) u.cd -= 2;                                                                       // L3471
  if (u.atk) u.atk -= 2;                                                                         // L3474
  if (u.chill) u.chill -= 1;                                                                     // L3475
  if (u.fleeT) { u.fleeT -= 2; /* collectFleeEnd L3478 在线采集域——黄金未捕获面 */ }                // L3476-3479
  if (u.bless) {                                                                                 // L3482
    u.bless -= 2;
    if (u.hp > 0 && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 0.06);                        // L3484
    if (ctx.ambience && rng() < 0.02) ctx.fx.push(['bless', bitHex(u.x), bitHex(u.y - 0.6), 16]); // L3485
  }
  if (u.curse) {                                                                                 // L3489
    u.curse -= 2;
    u.hp -= 0.05;                                                                                // L3491
    u.hurt = jsMax(u.hurt, 4);                                                                // L3492（Math.max(undefined,4)=NaN 怪癖天然保持）
    if (ctx.ambience && rng() < 0.02) ctx.fx.push(['curse', bitHex(u.x), bitHex(u.y - 0.6), 16]); // L3493
  }
  if (u.fert) u.fert -= 2;                                                                       // L3495
  if (u.detour) u.detour -= 2;                                                                   // L3497
  if (u.panic !== undefined) {                                                                   // L3500
    u.panic -= g.ep.panicDecay;                                                                  // L3501
    if (u.panic <= 0) u.panic = undefined;                                                       // L3502
  }
  if (u.gVal !== undefined) {                                                                    // L3505
    let alive = false;
    for (let gi = 0; gi < u.gVal.length; gi++) {                                                 // L3507
      u.gVal[gi] -= g.ep.grudgeDecay;                                                            // L3508
      if (u.gVal[gi] < 0.3) { u.gIds?.splice(gi, 1); u.gVal.splice(gi, 1); gi--; }                // L3509-3512
      else alive = true;
    }
    if (!alive) { u.gIds = undefined; u.gVal = undefined; }                                       // L3516
  }
  {                                                                                              // L3519-3541 卡死自愈
    const fdx = u.tx - u.x, fdy = u.ty - u.y;
    if (fdx * fdx + fdy * fdy > 6.25) {                                                          // L3523（2.5²）
      if (u.sxk === undefined || u.syk === undefined) { u.sxk = u.x; u.syk = u.y; }               // L3525
      const sdx = u.x - u.sxk, sdy = u.y - (u.syk ?? u.y);
      if (sdx * sdx + sdy * sdy > 0.64) { u.stk = 0; u.sxk = u.x; u.syk = u.y; }                  // L3529-3530
      else {
        u.stk = (u.stk ?? 0) + 1;                                                                // L3531
        if (u.stk > 36) {                                                                        // L3532
          u.stk = 0; u.sxk = u.x; u.syk = u.y; u.detour = 60;                                     // L3533-3534
          u.tx = Math.max(1, Math.min(W - 2, u.x + (rng() * 2 - 1) * 9));                         // L3535
          u.ty = Math.max(1, Math.min(H - 2, u.y + (rng() * 2 - 1) * 9));                         // L3536
        }
      }
    } else if (u.stk) { u.stk = 0; u.sxk = u.x; u.syk = u.y; }                                    // L3540
  }
  const ti = Math.floor(u.y) * W + Math.floor(u.x);                                              // L3542
  if (ctx.fire[ti] > 0 && !r.lavaImmune) { u.hp -= g.ep.fireDamage; u.hurt = 20; }                // L3543
  if (ctx.radiate[ti] > 0) { u.hp -= 0.5; u.hurt = 20; }                                          // L3544
  if (ctx.terrain[ti] === T.LAVA && !r.lavaImmune) { u.hp -= 15; u.hurt = 20; }                   // L3545
  if (!r.flying && !r.aquatic && u.race !== 23 && isWater(ctx.terrain[ti])) { u.hp -= 4; u.hurt = 20; }   // L3546
  if (r.aquatic && !r.beach && !isWater(ctx.terrain[ti])) { u.hp -= 0.02; u.hurt = jsMax(u.hurt, 2); } // L3549-3550
  if (u.infected) {                                                                              // L3552
    u.hp -= 0.15;                                                                                // L3553
    if (rng() < 0.02) ctx.evt.push(['plague', u.id]);                                             // L3554
  }
  if (u.hp > 0 && u.hp < u.maxHp) {                                                              // L3557
    const gb = r.isCiv ? { regen: ctx.gearRegen } : null;                                         // L3558-3559（gearBonus 影子面）
    const rg = (u.trait ? u._regen : 0) + (gb?.regen ?? 0) + (u.race === 21 ? 0.35 : 0);          // L3560
    if (rg > 0) u.hp = Math.min(u.maxHp, u.hp + rg);                                              // L3561
  }
  if (r.predator && !r.undead) {                                                                 // L3564
    u.food = (u.food ?? 70) - 1;                                                                 // L3565
    if (u.food <= 0) { u.hp -= 1.4; u.hurt = jsMax(u.hurt, 3); }                               // L3566
  }
  if (u.race === 23) {                                                                           // L3570 白行者寒霜灵气
    if (rng() < 0.08) {                                                                          // L3571
      const xi = Math.floor(u.x + rng() * 3 - 1.5);                                              // L3572（x 先掷）
      const yi = Math.floor(u.y + rng() * 3 - 1.5);                                              // L3573（y 后掷）
      const j = yi * W + xi;
      if (j >= 0 && j < W * H) {                                                                 // L3574
        const t = ctx.terrain[j];
        if (t === T.GRASS || t === T.BURNT || t === T.SAND) ctx.setT(j, T.SNOW);                  // L3577
        else if (t === T.FOREST && rng() < 0.4) ctx.setT(j, T.SNOW);                              // L3578
        else if (isWater(t) && rng() < 0.5) ctx.setT(j, T.ICE);                                   // L3579
        if (ctx.fire[j] > 0) { ctx.fire[j] = 0; ctx.fireSet.delete(j); }                          // L3581
      }
    }
    if (isWater(ctx.terrain[ti]) && rng() < 0.6) ctx.setT(ti, T.ICE);                             // L3588
  }
  if (u.hp <= 0) { u.dead = true; return; }                                                      // L3590 死亡门
  // ================= 扫描域 L3592-3669（M-U7m 批次二：WB.active() 分支不译=恒 false；JS 3×3 桶环） =================
  let enemy = null, bestD = 7, enemyD = 7, allies = 0, foes = 0;                                  // L3578-3582（WB L3592-3606 分支不触达）
  const contagious = (u.panic ?? 0) > 0.55 && rng() < 0.2;                                        // L3584 恐慌传染掷骰（&& 短路）
  const cx = Math.min(BW - 1, Math.max(0, (u.x / 4) | 0));                                       // L3585
  const cy = Math.min(BH - 1, Math.max(0, (u.y / 4) | 0));                                       // L3586
  const uxx = u.x, uyy = u.y;                                                                    // L3587-3588
  for (let by = cy - 1; by <= cy + 1; by++) {                                                    // L3608
    for (let bx = cx - 1; bx <= cx + 1; bx++) {                                                  // L3609
      if (bx < 0 || by < 0 || bx >= BW || by >= BH) continue;                                    // L3610
      const bucket = ctx.buckets[by * BW + bx];
      if (!bucket) continue;                                                                     // 引擎 L761 桶恒初始化——镜像未布桶 ≡ 空桶
      for (const o of bucket) {                                                                  // L3611
        if (o.dead || o === u) continue;                                                         // L3612
        const ddx = o.x - uxx, ddy = o.y - uyy;                                                  // L3613-3614
        if (isEnemyFastT(ctx, u, o, ctx.scan)) {                                                 // L3615
          foes++;                                                                                // L3616
          const d2 = ddx * ddx + ddy * ddy;                                                      // L3617
          if (u.gIds == null && d2 >= bestD * bestD) continue;                                   // L3620 视野粗筛（无血仇 cull）
          const d = Math.sqrt(d2);                                                               // L3621
          let wd = d;                                                                            // L3623
          if (u.gIds) {                                                                          // L3624 血仇加权：仇人心理距离更近
            const gi = u.gIds.indexOf(o.id);                                                     // L3625
            if (gi >= 0) wd = d * (1 - 0.42 * Math.min(1, (u.gVal?.[gi] ?? 1) / 2));              // L3626
          }
          if (wd < bestD) { bestD = wd; enemy = o; enemyD = d; }                                 // L3628
        } else if (u.civ >= 0 ? o.civ === u.civ : o.race === u.race) {                            // L3629
          allies++;                                                                              // L3630
          if (contagious && (o.panic ?? 0) < (u.panic ?? 0) - 0.15 && ddx * ddx + ddy * ddy < 16) {// L3632（4²）
            o.panic = Math.min(1, (o.panic ?? 0) + (u.panic ?? 0) * 0.4);                        // L3633
          }
        }
      }
    }
  }
  void enemyD; void allies; void foes;   // 战斗域批次三消费面（逃离三门不读——哨兵前置注记）
  // —— 三逃离门 L3641-3669（moveUnit 走 'mv' 事件流 stub——执行语义属 M-U3h 切片） ——
  if (enemy && (u.caravan ?? 0) > 0) {                                                           // L3641 商队不攻击——夺路而逃
    const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3643
    u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 4));                                // L3644
    u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 4));                                // L3645
    ctx.evt.push(['mv', u.id, 1.15]);                                                            // L3646（逃命加成）
    return;                                                                                      // L3647
  }
  if (enemy && (u.fleeT ?? 0) > 0) {                                                             // L3652 脱离冷却：持续拉开距离
    const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3653
    u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 5));                                // L3654
    u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 5));                                // L3655
    ctx.evt.push(['mv', u.id, (u.panic ?? 0) >= 0.5 ? 1.32 : 1.18]);                              // L3656（恐慌溃逃者狂奔加速）
    return;                                                                                      // L3657
  }
  if (enemy && (u.panic ?? 0) >= g.ep.panicRout && u.army == null && !r.undead) {                 // L3662 恐慌溃逃（ep 随 JSON 分发）
    u.fleeT = 60;                                                                                // L3663
    const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3664
    u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 5));                                // L3665
    u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 5));                                // L3666
    ctx.evt.push(['mv', u.id, 1.3]);                                                             // L3667（夺路狂奔）
    return;                                                                                      // L3668
  }
  // ================= 神经决策域 L3671-3702（M-U7n 批次三甲：战或逃——465 参微型网络 RL 头） =================
  if (enemy && (!r.isCiv || r.hostile) && !r.undead) {                                              // L3674（亡灵不知恐惧）
    let myPow = u.dmg + u.hp / 8;                                                                  // L3676
    if (u.gIds) {                                                                                  // L3677 血仇上头：对仇敌战力自信 +20%
      const gi = u.gIds.indexOf(enemy.id);                                                         // L3678
      if (gi >= 0) myPow *= 1 + 0.2 * Math.min(1, (u.gVal?.[gi] ?? 1) / 2);                        // L3679
    }
    const foePow = enemy.dmg + enemy.hp / 8;                                                       // L3681
    F_FLIGHT[0] = Math.max(0, u.hp) / u.maxHp;                                                     // L3682
    F_FLIGHT[1] = r.predator ? Math.max(0, Math.min(1, 1 - (u.food ?? 70) / 160)) : 0.5;           // L3683（饿兽拼命）
    F_FLIGHT[2] = myPow / (myPow + foePow);                                                        // L3684
    F_FLIGHT[3] = Math.max(0, enemy.hp) / enemy.maxHp;                                             // L3685
    F_FLIGHT[4] = Math.min(12, enemyD) / 12;                                                       // L3686
    F_FLIGHT[5] = isHerbivoreRaceT(enemy.race, ctx.dynRaces) ? 1 : 0;                              // L3687
    F_FLIGHT[6] = Math.min(3, Math.max(0, foes - 1)) / 3;                                          // L3688
    F_FLIGHT[7] = MONSTER_LOOT_T.has(u.race) ? 1 : 0;                                              // L3689
    F_FLIGHT[8] = Math.min(20, u.kills) / 20;                                                      // L3690
    const flAct = neuroFlightT(F_FLIGHT);                                                          // L3691
    void flAct; // collectDecision L3693——Task 38 在线采集域（引擎外会话 state；黄金未捕获面，no-op）
    if (flAct === 1) {                                                                             // L3694
      u.fleeT = 40;                                                                                // L3695（20 次更新内脱离接触）
      const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3696
      u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 5));                                // L3697
      u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 5));                                // L3698
      ctx.evt.push(['mv', u.id, 1.2]);                                                             // L3699
      return;                                                                                      // L3700
    }
  }
  if (enemy) {                                                                                     // L3704
    const rd = raceF(u.race).ranged ?? null;                                                       // L3705（ranged 随 races 位字节——fixture 种族均 null）
    // L3707：JOBS[3].ranged ?? 5 = 5（types.ts L300）+ gearBonus(u).ranged（gen stub ranged 0）+ techModsOf(u.civ).range（civ>=0 场景无——短路 0）
    const bowRange = ((u.job === 3 ? 5 : 0) || (r.isCiv ? 0 : 0)) + (r.isCiv && u.civ >= 0 ? 0 : 0);
    // —— 神经决策核心②：战斗姿态（L3708-3729）——
    let myPow2 = u.dmg + u.hp / 8;                                                                 // L3711
    if (u.gIds) {                                                                                  // L3712 血仇上头
      const gi = u.gIds.indexOf(enemy.id);                                                         // L3713
      if (gi >= 0) myPow2 *= 1 + 0.2 * Math.min(1, (u.gVal?.[gi] ?? 1) / 2);                       // L3714
    }
    const foePow2 = enemy.dmg + enemy.hp / 8;                                                      // L3716
    F_STANCE[0] = Math.min(12, enemyD) / 12;                                                       // L3717
    F_STANCE[1] = Math.max(0, u.hp) / u.maxHp;                                                     // L3718
    F_STANCE[2] = Math.max(0, enemy.hp) / enemy.maxHp;                                             // L3719
    F_STANCE[3] = rd || bowRange > 0 ? 1 : 0;                                                      // L3720
    F_STANCE[4] = Math.min(8, rd ? rd.range : bowRange) / 8;                                       // L3721
    F_STANCE[5] = Math.min(2, raceF(u.race).reach ?? 0.9) / 2;                                     // L3722
    F_STANCE[6] = rd ? 1 : 0;                                                                      // L3723
    F_STANCE[7] = myPow2 / (myPow2 + foePow2);                                                     // L3724
    F_STANCE[8] = Math.min(4, allies) / 4;                                                         // L3725
    F_STANCE[9] = u.army != null ? 1 : 0;                                                          // L3726
    F_STANCE[10] = r.isCiv ? 1 : 0;                                                                // L3727
    F_STANCE[11] = Math.min(20, u.kills) / 20;                                                     // L3728
    const stance = neuroStanceT(F_STANCE);                                                         // L3729
    if (stance === 3) {                                                                            // L3730 伤重脱离
      u.fleeT = 50;                                                                                // L3732
      const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3733
      u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 6));                                // L3734
      u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 6));                                // L3735
      ctx.evt.push(['mv', u.id, 1.15]);                                                            // L3736
      return;                                                                                      // L3737
    }
    // —— L3739-3963 攻击链体哨兵（门条件全求值——wild rd null / bowRange 0 短路不触达；黄金 S14-S17 契约）——
    if (rd && enemyD > 1.6 && enemyD <= rd.range) throw new Error('SENTINEL: 法师远程火球域（L3739-3752）');                        // L3739
    if (bowRange > 0 && enemyD > 1.4 && enemyD <= bowRange) throw new Error('SENTINEL: 弓手/火枪/能量枪域（L3753-3773）');            // L3753
    if (enemyD < (raceF(u.race).reach ?? 0.9)) throw new Error('SENTINEL: 近战执行域（L3774-3957）');                                // L3774
    if (stance === 2 && (rd || bowRange > 0)) throw new Error('SENTINEL: 射程死区风筝域（L3958-3963）');                              // L3958
    // —— L3964-3967 追击尾（攻击链 else）—— if/else 落出后入 L4112 postJS（无 tail——L4110 tailJS 在 else 块内）
    if (!u.detour) { u.tx = enemy.x; u.ty = enemy.y; }                                             // L3965（绕行期间不覆写——卡死自愈）
    ctx.evt.push(['mv', u.id, 1.25]);                                                              // L3966
  } else {
    // —— 无敌路径 else 壳（现行号 L3968 起；C# 侧旧注 L3927 系引擎行号漂移——行为同构） ——
    if (u.race === 9) throw new Error('SENTINEL: 龙息域（黄金无龙场景）');                            // L3972（现号；C# 旧注 L3931）
    if (r.isCiv && u.civ >= 0) throw new Error('SENTINEL: peaceful 职业域（黄金 civ=-1 契约）');      // L3974+（现号；C# 旧注 L3937）
    ctx.evt.push(['tail', u.id]);                                                                  // L4110（tailJS 仅 else 路径——gen stub 恒 false 不早退）
  }
  ctx.evt.push(['post', u.id]);                                                                    // L4112（if/else 之外恒调——S15 僵尸追击 post-only 实证）
}

// ---- 主回放：17 场景依黄金 fixtures/muts 重建 ----
let cases = 0;
for (const c of g.cases) {
  const tspec = g.terrainSpecs.find((t) => t.name === c.terrain);
  const terrain = new Uint8Array(W * H).fill(tspec.def);
  for (const [x1, y1, x2, y2, t] of tspec.patches)
    for (let y = y1; y < y2; y++) for (let x = x1; x < x2; x++) terrain[y * W + x] = t;
  const fire = new Uint8Array(W * H);
  const radiate = new Uint8Array(W * H);
  const fireSet = new Set();
  for (const [k, v] of Object.entries(c.env.fireInit ?? {})) {
    const [x, y] = k.split(',').map(Number); fire[y * W + x] = v; fireSet.add(y * W + x);
  }
  for (const [k, v] of Object.entries(c.env.radiateInit ?? {})) {
    const [x, y] = k.split(',').map(Number); radiate[y * W + x] = v;
  }
  const units = c.units.map(mkU);
  const raw = mulberry32(c.seed);
  const terrLog = [];
  const buckets = new Array(BW * BH).fill(null);                       // engine L761（未布桶 ≡ 空桶——批次一场景契约④）
  if (c.env.scanReal) {
    for (const u of units) {                                           // gen 布桶同构（units 序 push）
      const ci = ((u.y / 4) | 0) * BW + ((u.x / 4) | 0);
      (buckets[ci] ??= []).push(u);
    }
  }
  const ctx = {
    raw, lawsRise: c.env.lawsRise, ambience: c.env.ambience, gearRegen: c.env.gearRegen ?? 0,
    fire, radiate, terrain, fireSet,
    evt: [], fx: [], scan: [],
    buckets, enemyLut: new Map(), dynRaces: new Map(), rel: new Map(),   // isEnemyFast/isEnemy 依赖面（黄金无动态种/无交战国）
    setT: (i, t) => { if (terrain[i] === t) return; const old = terrain[i]; terrain[i] = t; terrLog.push([i, old, t]); },   // setTerrain 影子（同值早退 L950 语义）
  };

  const track = !!c.env.terrainTrack;
  let stepIdx = -1;
  for (const gStep of c.out) {
    stepIdx++;
    // muts 注入（平面回显 {slot, ...mut}——applyMut L326 镜像）
    for (const m of gStep.muts) {
      for (const [k, v] of Object.entries(m)) {
        if (k === 'slot') continue;
        const u = units[m.slot];
        if (k === 'panic' || k === 'sxk' || k === 'syk' || k === 'food' || k === 'chill' || k === 'stk') u[k] = v === null ? undefined : v;
        else if (k === 'hurt') u.hurt = v === null ? undefined : v;
        else if (k === 'gids') { if (v === null) { u.gIds = undefined; u.gVal = undefined; } else { u.gIds = [...v]; if (u.gVal === undefined) u.gVal = v.map(() => 1); } }
        else if (k === 'gval') { if (v === null) { u.gVal = undefined; u.gIds = undefined; } else { u.gVal = [...v]; if (u.gIds === undefined) u.gIds = v.map((_, i) => 1000 + i); } }
        else if (k === 'infected') u.infected = !!v;
        else if (k === 'dead') u.dead = !!v;
        else if (k === 'flip') u.flip = !!v;
        else u[k] = v;
      }
    }
    const fireBefore = track ? [...fire] : null;
    const terrBefore = track ? [...terrain] : null;
    const draw0 = totalDraws;
    const perU = [];
    let eu = 0;
    for (const u of units) {
      if (u.dead) { eq({ dead: true }, gStep.units[eu], `${c.name} S${stepIdx} u${perU.length} dead`); eu++; perU.push({}); continue; }
      const e0 = ctx.evt.length, f0 = ctx.fx.length, t0 = terrLog.length, sc0 = ctx.scan.length;
      const d0 = totalDraws;
      updateUnitT(u, ctx);
      perU.push({
        ...snapU(u),
        evt: ctx.evt.slice(e0),
        fx: ctx.fx.slice(f0),
        terr: terrLog.slice(t0),
        scan: ctx.scan.slice(sc0),
        draws: totalDraws - d0,
      });
      eu++;
    }
    // 逐步对账（黄金 perU = {...snapU, evt, fx, terr, draws} 摊平结构）
    for (let i = 0; i < perU.length; i++) {
      const gp = gStep.units[i];
      if (gp.dead === true) continue;                              // dead 占位步（dead 已对账）
      eq(perU[i], gp, `${c.name} S${stepIdx} u${i} 快照`);
    }
    eq(totalDraws - draw0, gStep.draws, `${c.name} S${stepIdx} draws`);
    eq([...fireSet].sort((a, b) => a - b), gStep.fireSet, `${c.name} S${stepIdx} fireSet`);
    if (track) {
      const fd = [], td = [];
      for (let i = 0; i < fire.length; i++) if (fire[i] !== fireBefore[i]) fd.push([i, fireBefore[i], fire[i]]);
      for (let i = 0; i < terrain.length; i++) if (terrain[i] !== terrBefore[i]) td.push([i, terrBefore[i], terrain[i]]);
      eq(fd, gStep.fireDiff, `${c.name} S${stepIdx} fireDiff`);
      eq(td, gStep.terrDiff, `${c.name} S${stepIdx} terrDiff`);
    }
  }
  // final + rngTail
  eq(units.map(snapU), c.final, `${c.name} final`);
  const tail = [raw(), raw(), raw(), raw()].map(bitHex);
  eq(tail, c.rngTail, `${c.name} rngTail`);
  cases++;
  console.log(`  ${c.name}: 逐位 PASS (steps=${c.out.length} draws=${totalDraws - 0 >= 0 ? '' : ''}${c.out.reduce((a, s) => a + s.draws, 0)})`);
}
console.log(`units-update-transcript: ${cases}/${g.cases.length} 场景 ALL PASS（零引擎导入镜像 · 掷值链闭合 · 事件流逐位）`);
