// ============================================================================
// units-update-transcript.mjs —— M-U7q 切片「updateUnit 批次三乙三·击杀链+龙息域」parity 镜像（零引擎导入，纪律④第二链）
// 蓝本：src/lib/game/engine.ts updateUnit L3455-3590（批次一，M-U7l）+ 扫描域 L3592-3669（批次二·M-U7m）+ 神经域 L3671-3738（M-U7n）+
//       远程域 L3739-3773（M-U7o）+ 近战域 L3774-3899（M-U7p）+ 击杀链 L3903-3957 + 龙息 L3972-3978（本切片：zombify/witnessDeath/addGrudge/
//       onKingDeath/onWarKill/dragonBreath/ignite 七助手独立转写）+ 无敌壳 L3968-4112。
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
    nightsight: !!(r.tbf1 & 16),   // M-U7p（ORC/GOBLIN——L3848 昼战减益豁免；字段只加）
    ranged: r.ranged ?? null, reach: r.reach ?? null, speed: r.speed,   // M-U7n + M-U7p L3824 敏捷差
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
  if (s.cd !== undefined && s.cd !== null) u.cd = s.cd;   // M-U7o：与 gen mkTsUnit 同修——cd=0 显式落位（远程域 u.cd<=0 门）
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
  if (s.king) u.king = s.king;                                       // M-U7q 弑君域
  if (s.breath !== null && s.breath !== undefined) u.breath = s.breath;   // M-U7q 龙息域
  if (s.fam !== null && s.fam !== undefined) u.fam = s.fam;          // M-U7q 家族战功
  if (s.wep !== null && s.wep !== undefined) u.wep = s.wep;          // M-U7s 枪械/能量枪域（L3755/L3756 wep 字符串键）
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
  race: u.race, civ: u.civ,                              // M-U7q 击杀链（zombify 原地转种——与 gen snapU 同位同序）
  speed: u.speed === undefined ? null : bitHex(u.speed),   // M-U7q zombify speed=0.05
  breath: u.breath === undefined ? null : bitHex(u.breath),   // M-U7q 龙息域
  king: !!u.king,                                         // M-U7q 弑君域
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
    const k = a.civ < b.civ ? `${a.civ}-${b.civ}` : `${b.civ}-${a.civ}`;                   // pairKey 序规格（engine L34 sorted 'a-b' 字符串键——M-U7q 起与 witnessDeath/onWarKill/relInit 同键制；S33 交战 fixture 首消费）
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
/** leadAim L4351-4357 镜像（目标提前量 + 落点抖动 2 掷——rng 计数闭包透传） */
function leadAimT(rng, enemy, ttl) {
  const vx = enemy.x - (enemy.lx ?? enemy.x);                                                    // L4352（lx/ly undefined → 自身——桩面均不触）
  const vy = enemy.y - (enemy.ly ?? enemy.y);                                                    // L4353
  return {
    x: Math.max(0.5, Math.min(W - 0.5, enemy.x + vx * ttl + rng() * 0.4 - 0.2)),                 // L4355（钳 0.5..W-0.5；抖动 1 掷）
    y: Math.max(0.5, Math.min(H - 0.5, enemy.y + vy * ttl + rng() * 0.4 - 0.2)),                 // L4356（抖动 1 掷）
  };
}
/** neuroAcc L166-179 镜像（sigmoid；neuroStats 面板统计零行为面不译；teacherAcc enabled=false 分支不译） */
function neuroAccT(f) { return 1 / (1 + Math.exp(-fwdT(HEADS.acc, f)[0])); }                     // L175
const MONSTER_LOOT_T = new Set([9, 25, 26, 27, 21, 22, 23, 24, 17]);   // engine L6918（DRAGON/KRAKEN/SANDWORM/BASILISK/TROLL/OGRE/WHITEWALKER/VAMPIRE/DEMON）
const F_FLIGHT = new Array(9);    // neuro.ts L126（模块级 scratch）
const F_STANCE = new Array(12);   // neuro.ts L125
const F_ACC = new Array(10);      // neuro.ts L124（M-U7p 近战命中头 scratch）

// ================= M-U7q 击杀链·龙息域七助手镜像（engine.ts 机械翻译——与 C# WbBail.cs 同源同构） =================
/** addGrudge L1150-1169 —— 血仇记账（旧仇加深 min 3 / 上限 4 条逐弱驱逐） */
function addGrudgeT(w2, killer, victim, mul = 1) {
  let v = 1.0;                                                                                     // L1151
  if (victim.civ >= 0 && w2.civ === victim.civ) v = 1.6;                                            // L1152 同族之仇
  if (w2.fam != null && w2.fam === victim.fam) v = 2.6;                                             // L1153 血亲之仇
  v *= mul;                                                                                          // L1154
  const ids = (w2.gIds ?? (w2.gIds = []));                                                           // L1155
  const vals = (w2.gVal ?? (w2.gVal = []));                                                           // L1156
  const i = ids.indexOf(killer.id);                                                                   // L1157
  if (i >= 0) vals[i] = Math.min(3, vals[i] + v * 0.6);                                               // L1158 旧仇加深
  else {
    if (ids.length >= 4) {                                                                            // L1160
      let mi = 0;                                                                                     // L1161
      for (let k = 1; k < vals.length; k++) if (vals[k] < vals[mi]) mi = k;                            // L1162 逐最弱
      ids.splice(mi, 1); vals.splice(mi, 1);                                                           // L1163-1164
    }
    ids.push(killer.id); vals.push(v);                                                                 // L1166-1167
  }
}
/** witnessDeath L1174-1216 —— 目睹死亡广播（弑君之仇国账 + 半径 6 同族恐慌/血仇一次遍历双产出） */
function witnessDeathT(killer, victim, ctx) {
  if (victim.king && victim.civ >= 0) {                                                                // L1177 弑君之仇
    for (const w2 of ctx.units) {                                                                       // L1178
      if (w2.dead || w2.civ !== victim.civ) continue;                                                    // L1179
      if (Math.hypot(w2.x - victim.x, w2.y - victim.y) > 14) continue;                                   // L1180 疆内闻讯
      w2.panic = Math.min(1, (w2.panic ?? 0) + 0.5);                                                     // L1181
    }
    const kc = killer.civ >= 0 ? ctx.civs[killer.civ] : null;                                            // L1183
    if (kc && kc.alive && killer.civ !== victim.civ) {                                                   // L1184
      const key = victim.civ < killer.civ ? `${victim.civ}-${killer.civ}` : `${killer.civ}-${victim.civ}`;   // L1185 pairKey
      ctx.rel.set(key, Math.max(-100, (ctx.rel.get(key) ?? 0) - 24));                                    // L1186
      ctx.tension.set(key, Math.min(100, (ctx.tension.get(key) ?? 0) + 30));                              // L1187
      ctx.warShame.set(key, victim.civ);                                                                 // L1188 耻辱簿
    }
  }
  const cx = Math.min(ctx.bw - 1, Math.max(0, (victim.x / 4) | 0));                                     // L1191
  const cy = Math.min(ctx.bh - 1, Math.max(0, (victim.y / 4) | 0));                                     // L1192
  const fierce = Math.min(3, killer.kills / 6);                                                         // L1193 凶手连杀威慑
  for (let by = cy - 2; by <= cy + 2; by++) {
    for (let bx = cx - 2; bx <= cx + 2; bx++) {
      if (bx < 0 || by < 0 || bx >= ctx.bw || by >= ctx.bh) continue;                                   // L1196
      for (const w2 of ctx.buckets[by * ctx.bw + bx] ?? []) {                                            // L1197
        if (w2.dead || w2 === killer || w2 === victim) continue;                                          // L1198
        const kin = victim.civ >= 0 ? w2.civ === victim.civ : w2.race === victim.race;                    // L1199 同族
        if (!kin) continue;                                                                                // L1200
        if (Math.hypot(w2.x - victim.x, w2.y - victim.y) > 6) continue;                                   // L1201
        const wd2 = raceF(w2.race);                                                                        // L1202
        if (wd2.undead) continue;                                                                          // L1203 亡灵不知恐惧
        let inc = 0.32 + 0.08 * fierce + (killer.kills >= 10 ? 0.12 : 0);                                  // L1205
        if (w2.fam != null && w2.fam === victim.fam) inc += 0.15;                                          // L1206 血亲之殇
        if (w2.trait === 'berserk' || MONSTER_LOOT_T.has(w2.race)) inc *= 0.35;                            // L1207 狂暴/巨怪减震
        if (w2.army != null) inc *= 0.4;                                                                   // L1208 军纪
        w2.panic = Math.min(1, (w2.panic ?? 0) + inc);                                                     // L1209
        addGrudgeT(w2, killer, victim, victim.king ? 1.8 : 1);                                             // L1212 弑君 ×1.8
      }
    }
  }
}
/** onKingDeath L1669-1677 —— 国王驾崩（stability -18 + 纪事；toast 宿主域静默零掷） */
function onKingDeathT(u2, ctx) {
  const civ = ctx.civs[u2.civ];                                                                           // L1670
  u2.king = false;                                                                                        // L1671
  if (!civ || !civ.alive) return;                                                                          // L1672
  if (civ.kingId === u2.id) civ.kingId = -1;                                                               // L1673
  civ.stability = Math.max(0, (civ.stability ?? 70) - 18);                                                 // L1674
  ctx.evt.push(['ev', 'king', bitHex(u2.x), bitHex(u2.y)]);                                                // L1675（pos {x,y}——colorHex 渲染面不 dump）
}
/** bumpWild L1082-1086 —— 野生动物分种族计数（zombify 随件；无 dump 面——镜像保真） */
function bumpWildT(ctx, race, d) {
  const n = (ctx.wildCount.get(race) ?? 0) + d;
  if (n > 0) ctx.wildCount.set(race, n); else ctx.wildCount.delete(race);
}
/** zombify L4317-4340 —— 僵尸病毒尸变（原地转种五维重置 + spawn fx） */
function zombifyT(u2, ctx) {
  if (u2.king && u2.civ >= 0) onKingDeathT(u2, ctx);                                                      // L4320
  if (u2.civ >= 0 && ctx.civs[u2.civ]) ctx.civs[u2.civ].pop--;                                             // L4321
  if (!raceF(u2.race).isCiv) bumpWildT(ctx, u2.race, -1);                                                  // L4322
  u2.race = 5; u2.civ = -1; u2.hp = 40; u2.maxHp = 46; u2.dmg = 6; u2.speed = 0.05;                        // L4323-4328
  u2.age = 0; u2.maxAge = 9999; u2.infected = false; u2.dead = false; u2.boat = 0; u2.boatTTL = 0;          // L4329-4334
  u2.king = false; u2.grab = 0; u2.thrT = 0;                                                                // L4335-4336
  bumpWildT(ctx, 5, 1);                                                                                     // L4338
  ctx.fx.push(['spawn', bitHex(u2.x), bitHex(u2.y), 30]);                                                   // L4339
}
/** onWarKill L7247-7263 —— 战争体系击杀结算（addWarScore kill +2 / 军团战功 / 总动员；wwCountKill idle 直退） */
function onWarKillT(killer, victim, ctx) {
  if (killer.civ < 0 || victim.civ < 0 || killer.civ === victim.civ) return;                               // L7248
  const key = killer.civ < victim.civ ? `${killer.civ}-${victim.civ}` : `${victim.civ}-${killer.civ}`;
  const rv = ctx.rel.get(key);
  if (!(rv !== undefined && rv < -20)) return;                                                             // L7249 atWar
  const wd = ctx.warData.get(key);                                                                          // L7250 addWarScore
  if (wd) {
    const isA = wd.a === killer.civ;
    if (isA) wd.scoreA += 2; else wd.scoreB += 2;
    if (isA) { wd.casB += 1; wd.exB += 1; } else { wd.casA += 1; wd.exA += 1; }
  }
  if (killer.army != null) {                                                                                // L7253
    const ka = ctx.armies.find((x) => x.id === killer.army);
    if (ka) { ka.kills++; ka.morale = Math.min(100, ka.morale + 1.5); }                                     // L7255
  }
  for (const d of ctx.directives) {                                                                         // L7258
    if (d.status === 'active' && d.kind === 'mobilize' && d.civ === killer.civ) d.killCount = (d.killCount ?? 0) + 1;   // L7260
  }
}
/** dragonBreath L12537-12547 —— 龙息（落点 ±8 抖动 2 掷 + 4× 落点 xy 各 1 掷 + ignite 可燃 1 掷/枚 + explosion fx） */
function dragonBreathT(u2, ctx, rng) {
  const tx = Math.max(1, Math.min(W - 2, u2.x + (rng() * 2 - 1) * 8));                                     // L12538
  const ty = Math.max(1, Math.min(H - 2, u2.y + (rng() * 2 - 1) * 8));                                     // L12539
  for (let k = 0; k < 4; k++) {
    const xx = Math.floor(tx + rng() * 3 - 1.5);                                                            // L12541
    const yy = Math.floor(ty + rng() * 3 - 1.5);                                                            // L12542
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;                                                   // L12543
    igniteT(ctx, yy * W + xx, rng);                                                                          // L12544
  }
  ctx.fx.push(['explosion', bitHex(tx), bitHex(ty), 16, [null, null, null, bitHex(1.6), null]]);                                                   // L12546（opts {r:1.6}）
}
/** ignite L1072-1078 —— 点燃（FLAMMABLE=[GRASS,FOREST] constants.ts L65 / 建筑格；fire=150+floor(rng×90)） */
function igniteT(ctx, i, rng) {
  const t = ctx.terrain[i];                                                                                 // L1073
  if (ctx.fire[i] > 0) return;                                                                              // L1074
  if (!(t === T.GRASS || t === T.FOREST) && ctx.building[i] === 0) return;                                   // L1075
  ctx.fire[i] = 150 + Math.floor(rng() * 90);                                                               // L1076
  ctx.fireSet.add(i);                                                                                        // L1077
}

// ================= M-U7r 批次三丙·peaceful 职业域七助手独立转写（engine.ts 蓝本行号随注；零引擎导入） =================
const pairKeyT = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);                                            // L34 pairKey
const BLD_HP_T = [0, 70, 240, 120, 40, 150, 340, 90, 110, 100, 140, 200];                                  // types.ts L325-337 BUILDING_DEFS hp 独立值表（镜像禁 import）
const BK_T = { HOUSE: 1, CAPITAL: 2, FARM: 4, MARKET: 9 };                                                  // types.ts L339-341 BUILD_KINDS 消费子集
const atWarT = (ctx, a, b) => {                                                                             // L2061-2063
  const v = ctx.rel.get(pairKeyT(a, b));
  return v !== undefined && v < -20;
};
const civAtWarT = (ctx, civId) => {                                                                         // L2017-2022
  for (const o of Object.values(ctx.civs)) {
    if (o.alive && o.id !== civId && atWarT(ctx, civId, o.id)) return true;
  }
  return false;
};
const fireNearT = (ctx, u, r2) => {                                                                          // L4562-4585
  if (ctx.fireSet.size === 0) return -1;
  const cx = Math.floor(u.x); const cy = Math.floor(u.y); const rr = Math.ceil(r2);
  let best = -1; let bestD = r2 + 0.5;
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const xx = cx + dx; const yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (ctx.fire[i] <= 0) continue;
      const d = Math.hypot(xx + 0.5 - u.x, yy + 0.5 - u.y);
      if (d >= bestD) continue;
      const own = u.civ >= 0 && (ctx.owner[i] === u.civ || (ctx.building[i] > 0 && ctx.buildings[ctx.bIdx.get(i) ?? -1]?.civ === u.civ));   // L4578
      if (own || d < 2.2) { bestD = d; best = i; }                                                            // L4579
    }
  }
  return best;
};
const extinguishFireT = (ctx, i, by) => {                                                                    // L4587-4601
  ctx.fire[i] = 0; ctx.fireSet.delete(i); ctx.firesOut++;                                                    // L4588-4590
  ctx.fx.push(['water', bitHex((i % W) + 0.5), bitHex(((i / W) | 0) + 0.5), 16]);                            // L4591
  if (ctx.firesOut >= 3 && ctx.tickCount - ctx.lastFireOutEventTick > 480) {                                 // L4593 节流播报
    ctx.lastFireOutEventTick = ctx.tickCount;                                                                // L4594
    const civ = ctx.civs[by.civ];
    if (civ?.alive) ctx.evt.push(['ev', 'fireOut', bitHex((i % W) + 0.5), bitHex(((i / W) | 0) + 0.5)]);     // L4596-4597（addEvent 命名域——文本面不对账）
  }
};
const damagedNearT = (ctx, u, r2) => {                                                                       // L4603-4615
  if (ctx.damagedSet.size === 0) return -1;
  let best = -1; let bestD = r2;
  for (const i of ctx.damagedSet) {
    const b = ctx.buildings[ctx.bIdx.get(i) ?? -1];
    if (!b || b.civ !== u.civ) continue;
    const d = Math.hypot(b.x + 0.5 - u.x, b.y + 0.5 - u.y);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
};
const repairBuildingT = (ctx, i, amount) => {                                                                // L4617-4645
  const b = ctx.buildings[ctx.bIdx.get(i) ?? -1];
  if (!b) return false;
  const max = Math.round((BLD_HP_T[b.kind] ?? 70) * 1);   // × techModsOf(b.civ).bhp——黄金 env civs 无 techs → NEUTRAL_MODS.bhp=1（L4859 契约；techs 非空路径黄金外）
  let hp = ctx.bHp.get(i) ?? max;
  hp = Math.min(max, hp + amount);
  ctx.bHp.set(i, hp);
  ctx.repairsDone++;
  ctx.fx.push(['hammer', bitHex(b.x + 0.5), bitHex(b.y + 0.2), 14]);                                         // L4627
  const done = hp >= max;
  if (done) {
    ctx.damagedSet.delete(i);
    ctx.fx.push(['spawn', bitHex(b.x + 0.5), bitHex(b.y + 0.5), 22]);
    if (ctx.repairsDone >= 6 && ctx.tickCount - ctx.lastRepairEventTick > 720) {                             // L4637 节流播报
      ctx.lastRepairEventTick = ctx.tickCount;
      const civ = ctx.civs[b.civ];
      if (civ?.alive) ctx.evt.push(['ev', 'repair', bitHex(b.x), bitHex(b.y)]);
    }
  }
  return done;
};
const nearestBuildingOfT = (ctx, u, kind) => {                                                               // L4434-4444
  let best = null; let bestD = Infinity;
  for (const b of ctx.buildings) {
    if (b.civ !== u.civ || b.kind !== kind) continue;
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
};
const enemyBuildingNearT = (ctx, u, r2) => {                                                                 // L4396-4417
  const cx = Math.floor(u.x); const cy = Math.floor(u.y); const rr = Math.ceil(r2);
  let best = -1; let bestD = r2 + 0.5;
  for (let dy = -rr; dy <= rr; dy++) {
    for (let dx = -rr; dx <= rr; dx++) {
      const xx = cx + dx; const yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (ctx.building[i] === 0) continue;
      const b = ctx.buildings[ctx.bIdx.get(i) ?? -1];
      if (!b || b.civ === u.civ) continue;
      if (u.civ >= 0 && !atWarT(ctx, u.civ, b.civ)) continue;
      const d = Math.hypot(xx - u.x, yy - u.y);                                                              // L4413（tile 角距离——非中心）
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
};
const nearestEnemyBuildingT = (ctx, u) => {                                                                  // L4421-4431
  let best = null; let bestD = Infinity;
  for (const b of ctx.buildings) {
    if (b.civ === u.civ) continue;
    if (u.civ < 0 || !atWarT(ctx, u.civ, b.civ)) continue;
    const d = Math.hypot(b.x - u.x, b.y - u.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
};
const attackBuildingT = (ctx, i, dmg, byCiv) => {                                                            // L4446-4463
  const kind = ctx.building[i];
  if (kind === 0) return;
  let hp = ctx.bHp.get(i) ?? BLD_HP_T[kind];                                                                  // L4449（BUILDING_DEFS[kind].hp）
  hp -= dmg;
  const x = i % W; const y = (i / W) | 0;
  if (hp <= 0) throw new Error('SENTINEL: onBuildingDestroyed 摧毁级联属 case3 bail 域黄金（D01-D08 契约）——update 切片 hp>0');   // L4455
  ctx.bHp.set(i, hp);
  ctx.damagedSet.add(i);                                                                                      // L4458 受损登记
  ctx.fx.push(['hit', bitHex(x + 0.5), bitHex(y + 0.5), 6]);                                                  // L4459
};
const maybeBoardForWarT = (ctx, u) => {                                                                      // L5740-5753 前置早退面
  if (u.boat || !raceF(u.race).isCiv) return false;
  const job = u.job ?? 0;
  if (job !== 2 && job !== 3) return false;
  if (u.civ < 0 || !civAtWarT(ctx, u.civ)) return false;
  const d = Math.hypot(u.tx - u.x, u.ty - u.y);
  if (d < 8) return false;                                                                                    // L5749 近距正常行军
  throw new Error('SENTINEL: 跨海登船域属 bail 黄金 D09-D12 契约——update 切片 d<8 早退外不可达');
};
const warTargetT = (ctx, civId, rng) => {                                                                    // L5728-5734
  const enemies = [];
  for (const b of ctx.buildings) if (b.civ !== civId && atWarT(ctx, civId, b.civ)) enemies.push(b);
  if (enemies.length === 0) return null;
  return enemies[Math.floor(rng() * enemies.length)];
};

// ================= M-U7s 批次三丙二·弹道域四 cast 独立转写（engine.ts L4344-4396；fx opts 面承载对账契约——onSound 宿主回调黄金受控 undefined → no-op） =================
const clampFxT = (v, hi) => Math.max(0.5, Math.min(hi - 0.5, v));                                            // L4345/L4369/L4375/L4383 clamp 面
const castFireballT = (ctx, u2, tx, ty, dmg) => {                                                            // L4344-4346
  ctx.fx.push(['fireball', bitHex(clampFxT(tx, W)), bitHex(clampFxT(ty, H)), 16,
    [bitHex(u2.x), bitHex(u2.y), null, bitHex(dmg), null]]);                                                 // L4345（opts {r:dmg,x0,y0}）
};
const castArrowT = (ctx, u2, tx, ty, dmg) => {                                                               // L4368-4371
  ctx.fx.push(['arrow', bitHex(clampFxT(tx, W)), bitHex(clampFxT(ty, H)), 12,
    [bitHex(u2.x), bitHex(u2.y), u2.civ, bitHex(0), bitHex(dmg)]]);                                           // L4369（opts {x0,y0,src,r:0,dmg}）
};
const castBulletT = (ctx, u2, tx, ty, dmg, rng) => {                                                         // L4374-4378
  ctx.fx.push(['bullet', bitHex(clampFxT(tx, W)), bitHex(clampFxT(ty, H)), 5,
    [bitHex(u2.x), bitHex(u2.y), u2.civ, bitHex(0), bitHex(dmg)]]);                                           // L4375
  if (rng() < 0.12) { /* onSound?.('place') 稀疏枪声——宿主回调黄金受控 undefined no-op（掷骰流消费） */ }        // L4377
};
const castBeamT = (ctx, u2, tx, ty, dmg, rng) => {                                                           // L4381-4396
  const ex = clampFxT(tx, W); const ey = clampFxT(ty, H);                                                    // L4382-4383
  const dx = ex - u2.x; const dy = ey - u2.y;                                                                // L4384-4385
  const dl = Math.hypot(dx, dy) || 1;                                                                         // L4386（除零护栏）
  const ox = Math.max(0.5, Math.min(W - 0.5, ex + (dx / dl) * 1.2));                                          // L4387（1.2 格过冲贯穿面）
  const oy = Math.max(0.5, Math.min(H - 0.5, ey + (dy / dl) * 1.2));                                          // L4388
  ctx.fx.push(['laser', bitHex(ox), bitHex(oy), 8,
    [bitHex(u2.x), bitHex(u2.y), u2.civ, null, bitHex(dmg)]]);                                                // L4389（opts {x0,y0,src,dmg}——r 无 → null）
  if (rng() < 0.08) { /* onSound?.('place') 稀疏嗡鸣——同上 */ }                                               // L4391
};

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
    // —— L3739-3966 攻击链体 if/else 链（M-U7o 批次三乙一：远程域镜像；近战域 L3774-3957 哨兵保留）——
    if (rd && enemyD > 1.6 && enemyD <= rd.range) {                                                // L3739 法师远程火球：拉开距离释放（风筝走位）
      if (u.cd <= 0) {                                                                             // L3741
        u.cd = rd.cd;                                                                              // L3742
        u.atk = 10;                                                                                // L3743 施法动画
        castFireballT(ctx, u, enemy.x + rng() * 0.6 - 0.3, enemy.y + rng() * 0.6 - 0.3, rd.dmg);   // L3744（真实现——敌人落点抖动 2 掷 ±0.3）
      }
      if (stance === 2) {                                                                          // L3746 风筝带内且战且退；带外站桩吟唱
        const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);                                      // L3748
        u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 3));                              // L3749
        u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 3));                              // L3750
        ctx.evt.push(['mv', u.id, 0.6]);                                                           // L3751
      }
    } else if (bowRange > 0 && enemyD > 1.4 && enemyD <= bowRange) {                               // L3753 弓手/火枪兵/能量枪兵
      const gun = u.wep === 'musket' || u.wep === 'rifle';                                         // L3755
      const beam = u.wep === 'laser_rifle';                                                        // L3756
      if (u.cd <= 0) {                                                                             // L3757
        u.cd = beam ? 12 : gun ? 15 : 18;                                                          // L3758 能量武器射速最快
        u.atk = 10;                                                                                // L3759 拉弓/瞄准动画
        let mul = 1;                                                                               // L3760
        if (r.isCiv && u.civ >= 0) throw new Error('SENTINEL: techModsOf archer 消费未镜像（civ>=0 黄金契约外）');
        const aim = leadAimT(rng, enemy, beam ? 8 : gun ? 5 : 12);                                 // L3762 弹道预测（内含 2 掷——计数闭包透传）
        if (beam) castBeamT(ctx, u, aim.x, aim.y, u.dmg * 0.75 * mul, rng);                        // L3763（真实现）
        else if (gun) castBulletT(ctx, u, aim.x, aim.y, u.dmg * mul, rng);                          // L3764（真实现）
        else castArrowT(ctx, u, aim.x, aim.y, u.dmg * mul);                                         // L3765（真实现）
      }
      if (stance === 2) {                                                                          // L3767 近距风筝带
        const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);                                      // L3769
        u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 3));                              // L3770
        u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 3));                              // L3771
        ctx.evt.push(['mv', u.id, 0.7]);                                                           // L3772
      }
    } else if (enemyD < (raceF(u.race).reach ?? 0.9)) {                                            // L3774 近战执行主链（M-U7p 批次三乙二-a；击杀链 L3901+ 哨兵保留）
      if (u.cd <= 0) {                                                                             // L3775
        const wspeed = 1;                                                                          // L3777（gearBonus stub speed=1 同构——装备域切片随件）
        u.cd = Math.round(14 / wspeed);                                                            // L3778
        u.atk = 12;                                                                                // L3779
        if (u.race === 25 && enemy.boat) {                                                         // L3781 克拉肯触手拖拽
          enemy.hp -= u.dmg * 2;                                                                   // L3782
          enemy.hurt = 20;                                                                         // L3783
          if (rng() < 0.3) {                                                                       // L3784
            enemy.dead = true; enemy.boat = 0;                                                     // L3785/L3787（syncDead no-op）
            ctx.fx.push(['explosion', bitHex(enemy.x), bitHex(enemy.y), 16, [null, null, null, bitHex(1.6), null]]);                      // L3788（opts {r:1.6}）
            ctx.evt.push(['ev', 'shipwreck', bitHex(enemy.x), bitHex(enemy.y)]);                   // L3789（文本命名域不译——gen 只对账 kind/pos）
          } else {
            ctx.fx.push(['tsunami', bitHex(enemy.x), bitHex(enemy.y), 12, [null, null, null, bitHex(2.5), null]]);                        // L3791（opts {r:2.5,quiet}——quiet 渲染面）
          }
          return;                                                                                  // L3793
        }
        if (u.race === 26 && enemy.hp <= enemy.maxHp * 0.4) {                                      // L3796 沙虫吞噬
          enemy.hp = 0; enemy.dead = true; u.kills++;                                              // L3797-3800
          u.food = Math.min(160, (u.food ?? 0) + 50 + Math.round(enemy.maxHp * 0.6));              // L3801
          ctx.fx.push(['blood', bitHex(enemy.x), bitHex(enemy.y), 16]);                            // L3802
          if (ctx.dmgNumbers) ctx.fx.push(['dmg', bitHex(enemy.x), bitHex(enemy.y), 26]);          // L3803
          return;                                                                                  // L3804
        }
        if (u.race === 27 && rng() < 0.08) {                                                       // L3807 蛇怪石化凝视
          enemy.hp = 0; enemy.dead = true; u.kills++;                                              // L3808-3811
          ctx.evt.push(['corpse', bitHex(enemy.x), bitHex(enemy.y), 1, 0]);                        // L3812（stone=true）
          ctx.evt.push(['ev', 'petrify', bitHex(enemy.x), bitHex(enemy.y)]);                       // L3813
          if (ctx.dmgNumbers) ctx.fx.push(['dmg', bitHex(enemy.x), bitHex(enemy.y), 30]);          // L3814
          return;                                                                                  // L3815
        }
        {                                                                                          // L3820 neuroAcc 命中头
          const rd2 = raceF(enemy.race);                                                           // L3821
          const eix = Math.floor(Math.max(0, Math.min(W - 1, enemy.x))) + Math.floor(Math.max(0, Math.min(H - 1, enemy.y))) * W;   // L3822
          F_ACC[0] = Math.min(20, u.kills) / 20;                                                   // L3823
          F_ACC[1] = Math.min(0.5, Math.max(0, (rd2.speed - r.speed) * 7)) * 2;                    // L3824 目标敏捷差
          F_ACC[2] = enemy.trait === 'tiny' ? 1 : 0;                                               // L3825
          F_ACC[3] = enemy.trait === 'swift' ? 1 : 0;                                              // L3826
          F_ACC[4] = enemy.trait === 'giant' ? 1 : 0;                                              // L3827
          F_ACC[5] = u.trait === 'tiny' ? 1 : 0;                                                   // L3828
          F_ACC[6] = u.bless ? 1 : 0;                                                              // L3829
          F_ACC[7] = u.curse ? 1 : 0;                                                              // L3830
          F_ACC[8] = ctx.terrain[eix] === T.FOREST ? 1 : 0;                                        // L3831 林间掩护
          F_ACC[9] = ctx.terrain[eix] === T.MOUNTAIN ? 1 : 0;                                      // L3832 山地高下差
          if (rng() > Math.max(0.35, Math.min(0.97, neuroAccT(F_ACC)))) {                          // L3833
            if (ctx.dmgNumbers && rng() < 0.55) ctx.fx.push(['dmg', bitHex(enemy.x), bitHex(enemy.y - 0.4), 20]);   // L3835
            return;                                                                                // L3836
          }
        }
        const gA = r.isCiv ? { crit: 0, armor: 0, lifesteal: 0, thorns: 0, regen: ctx.gearRegen, speed: 1, ranged: 0 } : null;   // L3840（gearBonus stub 同构）
        const gD = raceF(enemy.race).isCiv ? { crit: 0, armor: 0, lifesteal: 0, thorns: 0, regen: ctx.gearRegen, speed: 1, ranged: 0 } : null;   // L3841
        let dmg = u.dmg * (0.8 + rng() * 0.4) * (u.bless ? 1.3 : 1) * (u.curse ? 0.75 : 1);        // L3843 神力 ×1.3 / 诅咒 ×0.75
        dmg *= 1;                                                                                  // L3845（wallDefenseOf 中性 1——无建筑契约；建筑结算随装备域）
        const dPhase = ctx.dayPhase;                                                               // L3847
        if (dPhase > 0.5 && dPhase < 0.9 && !r.nightsight) dmg *= 0.92;                            // L3848 夜战混乱减益（黑暗视觉豁免）
        let crit = false;
        if (gA && gA.crit > 0 && rng() * 100 < gA.crit) { dmg *= 2.2; crit = true; }               // L3850-3852
        if (gD && gD.armor > 0) dmg *= 1 - gD.armor / 100;                                         // L3854
        enemy.hp -= dmg;                                                                           // L3855
        enemy.hurt = 20;                                                                           // L3856
        ctx.fx.push(['hit', bitHex((u.x + enemy.x) / 2), bitHex((u.y + enemy.y) / 2), 6]);         // L3857 命中特效（中点）
        if (ctx.blood && dmg >= 5 && rng() < 0.5) ctx.evt.push(['blood', bitHex(enemy.x), bitHex(enemy.y)]);   // L3859 血溅（贴花域接缝——桩面 evt 捕获）
        const traitImmune = false;                                                                 // L3861 门右段（TRAITS immune 查表——fixtures trait 恒 null 同构；免疫特质域随件）
        if (u.race === 27 && rng() < 0.45 && !enemy.infected && !traitImmune) {                    // L3861 蛇怪毒牙
          enemy.infected = true;                                                                   // L3862
          if (ctx.dmgNumbers) ctx.fx.push(['dmg', bitHex(enemy.x), bitHex(enemy.y - 0.8), 26]);    // L3863
        }
        if (ctx.dmgNumbers && (crit || dmg >= 12 || rng() < 0.4)) {                                // L3866 伤害数字
          ctx.fx.push(['dmg', bitHex(enemy.x), bitHex(enemy.y), 26]);                              // L3867
        }
        if (u.race === 24 && u.hp > 0) {                                                           // L3870 吸血鬼吮血
          u.hp = Math.min(u.maxHp, u.hp + dmg * 0.6);                                              // L3871
          if (ctx.dmgNumbers && rng() < 0.4) ctx.fx.push(['heart', bitHex(u.x), bitHex(u.y - 0.5), 18]);   // L3872
        }
        if (gA && gA.lifesteal > 0 && u.hp > 0) u.hp = Math.min(u.maxHp, u.hp + (dmg * gA.lifesteal) / 100);   // L3875-3876 装备吸血
        if (gD && gD.thorns > 0) { u.hp -= gD.thorns; u.hurt = 14; if (u.hp <= 0) u.dead = true; } // L3879-3882 反伤（u=攻击者）
        if (u.race === 13 && rng() < 0.3 && !enemy.infected && !traitImmune) { enemy.infected = true; if (ctx.dmgNumbers) ctx.fx.push(['dmg', bitHex(enemy.x), bitHex(enemy.y - 0.8), 26]); }   // L3885-3887 蝎子毒刺
        if (u.race === 14 && rng() < 0.3 && !enemy.infected && !traitImmune) { enemy.infected = true; if (ctx.dmgNumbers) ctx.fx.push(['dmg', bitHex(enemy.x), bitHex(enemy.y - 0.8), 26]); }   // L3890-3892 蛇毒牙
        const bi = Math.floor(enemy.y) * W + Math.floor(enemy.x);                                  // L3895 idx(y,x)=y*W+x
        ctx.evt.push(['ab', bi, ctx.tickCount + 30]);                                              // L3896（activeBattles 桩面捕获；修剪循环 size<64 不触）
        if (enemy.hp <= 0) {                                                                        // L3903 击杀链（M-U7q 批次三乙三镜像）
          const zomb = u.race === 5 && raceF(enemy.race).isCiv && ctx.zombieInfect;                  // L3905
          if (zomb) {
            zombifyT(enemy, ctx);                                                                     // L3907（尸变——kills/witnessDeath else 链不触达）
          } else {
            enemy.dead = true;                                                                        // L3909（syncDead no-op）
            u.kills++;                                                                                // L3911
            witnessDeathT(u, enemy, ctx);                                                              // L3913 目睹死亡广播
            if (u.gIds) {                                                                              // L3915 复仇结算
              const rgi = u.gIds.indexOf(enemy.id);                                                    // L3916
              if (rgi >= 0) {
                u.gIds.splice(rgi, 1);                                                                  // L3918
                u.gVal?.splice(rgi, 1);                                                                 // L3919
                if (!u.gIds.length) { u.gIds = undefined; u.gVal = undefined; }                          // L3920
                if (rng() < 0.12) ctx.evt.push(['ev', 'revenge', bitHex(u.x), bitHex(u.y)]);             // L3921（文本命名域不 dump）
              }
            }
            if (u.fam != null) {                                                                       // L3925 家族战功
              const rf = ctx.families.get(u.fam);                                                      // L3926
              if (rf) {
                rf.kills++;                                                                             // L3928
                if (u.kills === 10) {                                                                   // L3929
                  rf.heroes++;                                                                          // L3930
                  ctx.evt.push(['ev', 'lineage', bitHex(u.x), bitHex(u.y)]);                             // L3931
                }
              }
            }
            /* collectKill L3936 在线采集模块域——引擎外会话 state，黄金未捕获面 */
            if (r.predator && !r.undead) u.food = Math.min(160, (u.food ?? 0) + 55 + Math.round(enemy.maxHp * 0.5));   // L3938 捕食进食
            if (enemy.race === 9) ctx.statDragonsSlain++;                                              // L3940 屠龙计数
            onWarKillT(u, enemy, ctx);                                                                  // L3942 战争结算
            if (u.kills === 10) {                                                                       // L3943 传奇武士
              /* toast L3944 宿主域——gen 桩面 onToast 未挂静默 no-op 零掷 */
              ctx.evt.push(['ev', 'legend', bitHex(u.x), bitHex(u.y)]);                                 // L3945
            }
            if (u.race === 23 && raceF(enemy.race).isCiv) ctx.evt.push(['rise', bitHex(enemy.x), bitHex(enemy.y)]);   // L3948-3949 白行者起尸（0.12 播报掷在 riseSkeleton 体内未译）
            if (ctx.lawsRise && raceF(enemy.race).isCiv && rng() < 0.06) ctx.evt.push(['rise', bitHex(enemy.x), bitHex(enemy.y)]);   // L3952-3953 亡者复生
          }
        }
      }
    } else if (stance === 2 && (rd || bowRange > 0)) {                                               // L3958 射程死区（近到无法开火、远于触及）
      const ang = Math.atan2(u.y - enemy.y, u.x - enemy.x);                                        // L3960
      u.tx = Math.max(1, Math.min(W - 2, u.x + Math.cos(ang) * 3));                                // L3961
      u.ty = Math.max(1, Math.min(H - 2, u.y + Math.sin(ang) * 3));                                // L3962
      ctx.evt.push(['mv', u.id, 0.8]);                                                            // L3963
    } else {
      if (!u.detour) { u.tx = enemy.x; u.ty = enemy.y; }                                           // L3965（绕行期间不覆写——卡死自愈）
      ctx.evt.push(['mv', u.id, 1.25]);                                                            // L3966
    }
  } else {
    // —— 无敌路径 else 壳（现行号 L3968 起；C# 侧旧注 L3927 系引擎行号漂移——行为同构） ——
    // collectEnemyGone L3970 在线采集模块域——引擎外会话 state，黄金未捕获面
    if (u.race === 9 && u.breath !== undefined) {                                                    // L3972-3973 龙息（M-U7q；undefined→NaN 门永不触达——非龙/未注 breath 天然）
      u.breath -= 2;
      if (u.breath <= 0) {                                                                            // L3974
        u.breath = 150 + Math.floor(rng() * 150);                                                     // L3975
        dragonBreathT(u, ctx, rng);                                                                    // L3976
      }
    }
    if (r.isCiv && u.civ >= 0) {                                                                     // L3981 peaceful 职业域（M-U7r 批次三丙全译——updateUnit 最后一域）
      const job = u.job ?? 0;                                                                          // L3982
      const warring = civAtWarT(ctx, u.civ);                                                           // L3983
      // —— 国民防灾（最高优先级：火不等人；军团成员除外——军令如山）——
      const bigFire = ctx.fireSet.size > 8;                                                            // L3986（灾情动员）
      if (u.army == null && ctx.fireSet.size > 0 && rng() < (bigFire ? 0.5 : 0.3)) {                   // L3987
        const radius = job === 4 ? (bigFire ? 7 : 4.5) : bigFire ? 5 : 3;                              // L3988
        const fi = fireNearT(ctx, u, radius);                                                          // L3989
        if (fi >= 0) {
          const fxp = (fi % W) + 0.5;                                                                    // L3991
          const fyp = ((fi / W) | 0) + 0.5;                                                              // L3992
          const cdx = fxp - u.x; const cdy = fyp - u.y;                                                  // L3993-3994
          if (cdx * cdx + cdy * cdy < 2.89) {                                                            // L3995（1.7² 平方距离）
            extinguishFireT(ctx, fi, u);                                                                 // L3996
            u.cd = Math.max(u.cd, 10);                                                                   // L3997 泼水动作
          } else {
            u.tx = fxp; u.ty = fyp;                                                                      // L3999-4000
            ctx.evt.push(['mv', u.id, 1.2]);                                                             // L4001（moveUnit 接缝——赶赴火场）
            return;                                                                                       // L4002（本 tick 优先救灾）
          }
        }
      }
      // —— 建筑师：主动奔赴受损建筑修缮（战争不纵火，但拆毁与天灾依旧留下疮痍）——
      if (u.army == null && job === 4 && u.cd <= 0 && rng() < 0.2) {                                     // L4007
        const di = damagedNearT(ctx, u, 14);                                                             // L4008
        const b = di >= 0 ? ctx.buildings[ctx.bIdx.get(di) ?? -1] : null;                                // L4009
        if (b) {
          const bdx = b.x + 0.5 - u.x; const bdy = b.y + 0.5 - u.y;                                      // L4011-4012
          if (bdx * bdx + bdy * bdy < 3.24) {                                                            // L4013（1.8²）
            u.cd = 16; u.atk = 10;                                                                       // L4014-4015 敲击动画
            repairBuildingT(ctx, di, 12 * 1, u);                                                         // L4016（× techModsOf.repair——NEUTRAL 1 契约）
          } else {
            u.tx = b.x + 0.5; u.ty = b.y + 0.5;                                                          // L4018-4019
            ctx.evt.push(['mv', u.id, 1.15]);                                                            // L4020（赶赴工地）
            return;                                                                                       // L4021
          }
        }
      }
      // —— 路过国民顺手修缮身边受损建筑（平民皆可搭把手）——
      if (u.army == null && job !== 2 && job !== 3 && u.cd <= 0 && ctx.damagedSet.size > 0 && rng() < 0.12) {   // L4026
        const di = damagedNearT(ctx, u, 1.9);                                                            // L4027
        if (di >= 0) { u.cd = 22; repairBuildingT(ctx, di, 3, u); }                                      // L4028-4030
      }
      // —— 战争 AI：战士/弓手围攻敌国建筑（战争毁灭房屋的核心链路）——
      if (warring && (job === 2 || job === 3)) {                                                         // L4034
        const inArmy = u.army != null;                                                                   // L4035
        if (u.cd <= 0) {                                                                                   // L4037
          const bi = enemyBuildingNearT(ctx, u, 1.6);                                                      // L4038
          if (bi >= 0) { u.cd = 14; u.atk = 12; attackBuildingT(ctx, bi, u.dmg * 1.6, u.civ); }            // L4040-4042（拆城挥击）
        }
        if (job === 3 && u.cd <= 0 && rng() < 0.1) {                                                       // L4048
          const bi = enemyBuildingNearT(ctx, u, 5);                                                        // L4049（JOBS[3].ranged ?? 5——types.ts L300）
          if (bi >= 0) { u.cd = 18; castArrowT(ctx, u, (bi % W) + 0.5, ((bi / W) | 0) + 0.5, u.dmg); }   // L4050-4053（castArrow 真实现——M-U7s）
        }
        if (!inArmy) {                                                                                     // L4056
          if (rng() < 0.05 && maybeBoardForWarT(ctx, u)) return;                                           // L4057（跨海远征——d<8 早退）
          {                                                                                                  // L4059
            const tdx = u.tx - u.x; const tdy = u.ty - u.y;                                                  // L4060-4061
            if (tdx * tdx + tdy * tdy < 1.44 || rng() < 0.03) {                                              // L4062（1.2²）
              const tgt = nearestEnemyBuildingT(ctx, u);                                                     // L4063
              if (tgt) { u.tx = tgt.x + rng() * 2 - 1; u.ty = tgt.y + rng() * 2 - 1; }                       // L4064
            }
          }
        }
      } else if (job === 1 && rng() < 0.06) {                                                            // L4069
        const f = nearestBuildingOfT(ctx, u, BK_T.FARM);                                                 // L4070
        if (f) {
          u.tx = Math.max(1, Math.min(W - 2, f.x + rng() * 5 - 2.5));                                    // L4072
          u.ty = Math.max(1, Math.min(H - 2, f.y + rng() * 5 - 2.5));                                    // L4073
        }
      } else if (job === 5) {                                                                            // L4076
        const civ = ctx.civs[u.civ];                                                                     // L4077
        {
          const tdx = u.tx - u.x; const tdy = u.ty - u.y;                                                  // L4080-4081
          if (civ && (tdx * tdx + tdy * tdy < 1.44 || rng() < 0.03)) {                                     // L4082（1.2²）
            const m = nearestBuildingOfT(ctx, u, rng() < 0.6 ? BK_T.MARKET : BK_T.CAPITAL);                // L4083
            if (m) {
              u.tx = m.x + rng() * 2 - 1; u.ty = m.y + rng() * 2 - 1;                                        // L4084-4085
              const mdx = u.x - m.x; const mdy = u.y - m.y;                                                  // L4086-4087
              if (mdx * mdx + mdy * mdy < 2.25) {                                                            // L4088（1.5²）
                civ.gold = (civ.gold ?? 0) + 2;                                                              // L4089 国库入账
                ctx.fx.push(['coin', bitHex(u.x), bitHex(u.y - 1), 24]);                                     // L4090
              }
            }
          }
        }
      } else if (job === 6 && rng() < 0.06) {                                                            // L4093
        const civ = ctx.civs[u.civ];                                                                     // L4094
        if (civ && civ.capital >= 0) {                                                                     // L4095
          const cx2 = civ.capital % W; const cy2 = (civ.capital / W) | 0;                                  // L4096-4097（tileX/tileY L1548-1549）
          u.tx = Math.max(1, Math.min(W - 2, cx2 + rng() * 6 - 3));                                        // L4098
          u.ty = Math.max(1, Math.min(H - 2, cy2 + rng() * 6 - 3));                                        // L4099
        }
      } else if (rng() < 0.02) {                                                                         // L4101（march to war）
        const target = warTargetT(ctx, u.civ, rng);                                                        // L4102
        if (target) { u.tx = target.x + rng() * 4 - 2; u.ty = target.y + rng() * 4 - 2; }                  // L4103
      }
    }
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
    caseName: c.name,
    raw, lawsRise: c.env.lawsRise, zombieInfect: c.env.zombInf ?? true, ambience: c.env.ambience, gearRegen: c.env.gearRegen ?? 0,
    dmgNumbers: false, blood: false, dayPhase: c.env.dayPhase ?? 0, tickCount: 0,   // M-U7p 近战域（gen 桩面 fxPrefs undefined-falsy + tickCount=0 同构）
    fire, radiate, terrain, fireSet, building: new Uint8Array(W * H),               // M-U7q ignite 建筑门（M-U7r bldInit 注入面）
    // —— M-U7r peaceful 职业域依赖面（gen applyPeaceFixtures 同构；独立转写）——
    owner: (() => { const a = new Int16Array(W * H).fill(-1); for (const [k, v] of Object.entries(c.env.ownerInit ?? {})) a[Number(k)] = v; return a; })(),
    buildings: [], bIdx: new Map(), bHp: new Map(), damagedSet: new Set(),
    firesOut: c.env.firesOutInit ?? 0, repairsDone: c.env.repairsInit ?? 0,
    lastFireOutEventTick: -2400, lastRepairEventTick: -2400,                        // engine ctor L641/L643 初值
    evt: [], fx: [], scan: [],
    buckets, enemyLut: new Map(), dynRaces: new Map(), rel: new Map(),   // isEnemyFast/isEnemy 依赖面（黄金无动态种）
    tension: new Map(), warShame: new Map(), warData: new Map(Object.entries(c.env.warData ?? {})),   // M-U7q 弑君之仇三账本 + 战争档案
    civs: c.env.civs ?? {}, families: new Map(Object.entries(c.env.families ?? {}).map(([k, v]) => [Number(k), { ...v }])),   // M-U7q 文明/家族谱系
    armies: c.env.armies ?? [], directives: c.env.directives ?? [], wildCount: new Map(), statDragonsSlain: 0,   // M-U7q onWarKill/bumpWild/屠龙
    units,   // M-U7q witnessDeath 弑君分支遍历（eng.units 桩面同构）
    bw: BW, bh: BH,   // witnessDeath 桶环网格
    setT: (i, t) => { if (terrain[i] === t) return; const old = terrain[i]; terrain[i] = t; terrLog.push([i, old, t]); },   // setTerrain 影子（同值早退 L950 语义）
  };
  for (const [k, v] of Object.entries(c.env.relInit ?? {})) ctx.rel.set(k, v);   // M-U7q rel 初值（S33 弑君宣战种子）
  // —— M-U7r peaceful 域 bld/dmg 夹具施用（gen applyPeaceFixtures 同构——bldInit 建 buildings/bIdx/building/bHp；dmgInit 登记受损）——
  for (const [tile, kind, civB] of c.env.bldInit ?? []) {
    ctx.building[tile] = kind;
    ctx.bIdx.set(tile, ctx.buildings.length);
    ctx.buildings.push({ i: tile, x: tile % W, y: (tile / W) | 0, kind, civ: civB });
    ctx.bHp.set(tile, Math.round((BLD_HP_T[kind] ?? 70) * 1));
  }
  for (const [tile, hp] of Object.entries(c.env.dmgInit ?? {})) { ctx.damagedSet.add(Number(tile)); ctx.bHp.set(Number(tile), hp); }

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
