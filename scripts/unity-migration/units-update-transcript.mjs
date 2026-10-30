// ============================================================================
// units-update-transcript.mjs —— M-U7l 切片「updateUnit 批次一」parity 镜像（零引擎导入，纪律④第二链）
// 蓝本：src/lib/game/engine.ts updateUnit L3455-3590（批次一）+ 扫描壳 L3592-3639（空桶契约）+
//       无敌壳 L3927-4112（civ=-1 / 无龙契约 → tail/post 影子调用点）。
// 消费：golden/units_update.json（gen-units-update.mjs 产物——env/units/muts 依黄金回放，
//       races 位字节即蓝本旗标源、ep 随 JSON 分发、traitRegen 随 fixture 回显——零独立打包）。
// 对账：perU 快照 bitHex 逐位 + evt/fx/terr 事件流 + 逐步 draws + fireSet + final + rngTail。
// 运行：node scripts/unity-migration/units-update-transcript.mjs
// ============================================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const GOLDEN = new URL('./golden/units_update.json', import.meta.url);
const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));

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

/** 种族旗标访问器（golden.races 位字节 = types.ts L157-204 打包面——镜像唯一旗标源） */
const raceF = (id) => {
  const r = g.races[String(id)];
  if (!r) throw new Error('race flags missing: ' + id);
  return {
    hostile: !!(r.flags & 1), isCiv: !!(r.flags & 2), undead: !!(r.flags & 4),
    predator: !!(r.flags & 8), lavaImmune: !!(r.flags & 16),
    flying: !!(r.tbf0 & 32), aquatic: !!(r.tbf0 & 64), beach: !!(r.tbf1 & 8),
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
  x: bitHex(u.x), y: bitHex(u.y), tx: bitHex(u.tx), ty: bitHex(u.ty),
});

const eq = (a, b, path) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${path} 漂移\n  镜像: ${JSON.stringify(a)}\n  黄金: ${JSON.stringify(b)}`);
};

let totalDraws = 0;

/** updateUnit 批次一镜像（L3455-3590 全域 + 扫描壳空桶 + 无敌壳；行号随注） */
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
  // —— 扫描域壳 L3592-3639： contagious 门（契约① panic≤0.55 恒零掷）+ 空桶零迭代 ——
  const contagious = (u.panic ?? 0) > 0.55 && rng() < 0.2;                                        // L3598
  void contagious;
  // JS 环（L3608-3638）：buckets 恒空（契约④）——零迭代即零语义
  // —— 无敌路径 L3927 else 壳 ——
  if (u.race === 9) throw new Error('SENTINEL: 龙息域（黄金无龙场景）');                            // L3931
  if (r.isCiv && u.civ >= 0) throw new Error('SENTINEL: peaceful 职业域（黄金 civ=-1 契约）');      // L3937
  ctx.evt.push(['tail', u.id]);                                                                  // L4110
  ctx.evt.push(['post', u.id]);                                                                  // L4112
}

// ---- 主回放：8 场景依黄金 fixtures/muts 重建 ----
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
  const ctx = {
    raw, lawsRise: c.env.lawsRise, ambience: c.env.ambience, gearRegen: c.env.gearRegen ?? 0,
    fire, radiate, terrain, fireSet,
    evt: [], fx: [],
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
      const e0 = ctx.evt.length, f0 = ctx.fx.length, t0 = terrLog.length;
      const d0 = totalDraws;
      updateUnitT(u, ctx);
      perU.push({
        ...snapU(u),
        evt: ctx.evt.slice(e0),
        fx: ctx.fx.slice(f0),
        terr: terrLog.slice(t0),
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
