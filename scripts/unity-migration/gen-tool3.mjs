// ============================================================================
// gen-tool3.mjs —— M-U16 切片四「神力生成器域」黄金向量
//   蓝本 engine.ts：acidRain L10737-10745 / volcano L10746-10777 / tsunami
//   L10780-10785 / blizzard L10788-10795 / meteorShower L10798-10813 / locust
//   L10815-10822 / drought L10823-10830 / rainCloud L10834-10843 / blessArea
//   L10845-10859 / curseArea L10861-10872 / loveArea L10874-10886 /
//   teleportArea L10908-10924（randomLandSpot L11033-11043 依赖）/
//   wrathStorm L10926-10934 / holyStorm L10936-10945 / plasmaCannon
//   L10947-10957 / annihilationLight L10959-10969 / sandstorm L10972-10979 /
//   typhoon L10980-10987 / sinkhole L10988-10996 / iceAge L10999-11008 /
//   famineCloud L11030-11036 / blackhole L11017-11023 / meteor L12277-12282 +
//   applyTool case L13342-13455（meteor 内联抖动循环 + 22 委派）+ effectsTick
//   消费端补缺四支：volcano L9851-9876 / wrath L10023-10029 / holystorm
//   L10030-10075 / typhoon L10091-10119。
// M-U19 追加：mutateArea L10888-10906（特质域：civ 0.3 reroll / 0.25 jumpGene
//   0.12 + wild baseGene/jumpGene 0.2 + fx 每命中单位 2 掷）+ rerollTrait
//   L11037-11057（旧乘数卸除/新乘数上装）+ jumpGene L11085-11103（四维 0.6 门
//   重铸 + RACES×TRAITS×JOBS 属性重算）+ rollTrait L1467-1470 + baseGene
//   L11029-11031（speciesBase 空表分支零掷恒 {1,1,1,1}——种子标定探针
//   probe-mutate-seed.mjs：S13=0x00000144 / S14=0x00000027）。
// 直接 import 现役 src/lib/game/engine.ts（真实现，非复制），手术式夹具直写 +
// rngA 尾置清零起流 + calls 直调 / ticks 步进（tickCount++ + effectsTick——
// gen-power M-U10a 主循环 L2508 序同构）混合链（gen-tool2 + gen-power 双亲）。
//
// 协议要点：
//   ① 掷流：fx 恒 2 掷（seed=floor(rng*65536) + dir=rng*2π——L9793-9797）；
//     生成器 cap 门 filter 快照零掷；bless/curse 0.4 门 1 掷/单位；love 0.5 门
//     1 掷/单位；teleport randomLandSpot 2 掷/尝试（40 次上限）；volcano 锥体
//     hypot 整数域零掷 + 引燃圈 8 点 1 掷/点燃 + 消费端熔岩弹 age%14 双掷 + 岩浆
//     外溢 age%6 双掷；wrath/typhoon 消费端 lightning（M-U15 译件 7-11 掷/击）；
//     holystorm 恒真门 1.2 掷位保持 + 采样双掷 + 单位门掷。
//   ② Math.hypot 域：volcano 锥体 hypot(dx,dy)≤2.3（整数极距 fdlibm）/
//     area 神力单位环 hypot(u.x-x,u.y-y)>r / plasmaCannon-annihilationLight
//     dist=hypot(7,9)/hypot(8,11)——bun 原生 fdlibm；C# FdHypot 位精确件对账。
//   ③ Math.round 域：plasmaCannon ttl=max(45,min(110,round(dist*1.5)))——
//     JS .5 上取整；C# JsRound（floor(x+0.5)）禁银行家舍入。
//   ④ 宿主面：onSound 全系 no-op（黄金受控 undefined——零掷零写）；WBB.touchMeta
//     （rainCloud L10835 Stage 3 UI 收口）宿主域挂点不进模拟面。
//   ⑤ 成就计数：statMeteorShowers/statPlasmas/statAnnihilations/statBlackholes
//     四字段（engine L230-234——WbWorld statNukes 邻位只加）。
//
// 运行：bun scripts/unity-migration/gen-tool3.mjs（M-U7w 口径：黄金链一律 bun）
// 输出：scripts/unity-migration/golden/tool3.json
//       unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool3.json（双写）
// ============================================================================
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---- 无头垫片（同 gen-tool2.mjs） ----
const noop = () => {};
const stubCtx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'canvas') return null;
    if (k === 'createImageData' || k === 'getImageData')
      return (w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w | 0, height: h | 0 });
    if (k === 'measureText') return () => ({ width: 0 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'createPattern') return () => ({});
    return typeof k === 'string' ? noop : undefined;
  },
  set: () => true,
});
const stubCanvas = () => ({ width: 0, height: 0, getContext: () => stubCtx, style: {} });
globalThis.document = {
  createElement: (tag) => (tag === 'canvas' ? stubCanvas() : { style: {}, appendChild: noop }),
  addEventListener: noop,
  getElementById: () => null,
};
globalThis.localStorage = { getItem: () => null, set: noop, setItem: noop, removeItem: noop };
globalThis.requestAnimationFrame = noop;

const { createJiti } = await import('jiti');
const jiti = createJiti(import.meta.url, { alias: { '@': path.join(ROOT, 'src') } });
const engMod = await jiti.import(path.join(ROOT, 'src/lib/game/engine.ts'));
const GameEngine = engMod.GameEngine ?? engMod.default?.GameEngine;
if (typeof GameEngine !== 'function') throw new Error('GameEngine 未定位: ' + Object.keys(engMod).join(','));
const { T, R } = await jiti.import(path.join(ROOT, 'src/lib/game/types.ts'));
const { W, H } = await jiti.import(path.join(ROOT, 'src/lib/game/constants.ts'));
const N = W * H;

// ---- 工具 ----
const gzB64 = (u8) => zlib.gzipSync(Buffer.from(u8), { level: 9 }).toString('base64');
const md5hex = (u8) => createHash('md5').update(Buffer.from(u8)).digest('hex');
const F64 = new Float64Array(1);
const U8 = new Uint8Array(F64.buffer);
const f64hex = (v) => { F64[0] = v; return Buffer.from(U8).toString('hex'); };

function mulberryStep(a) {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { a, v: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}
function chainDraws(state0, finalState) {
  let a = state0 | 0;
  for (let k = 0; k < 5_000_000; k++) {
    a = mulberryStep(a).a;
    if ((a >>> 0) === (finalState >>> 0)) return k + 1;
  }
  throw new Error('rng 链未达终态——协议失效');
}
const idx = (x, y) => y * W + x;
const rect = (x0, y0, x1, y1, t) => [...(() => { const a = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a.push([x, y, t]); return a; })()];

// 瘦单位直写（gen-tool2 mkUnit 同构）
function mkUnit(eng, o) {
  const u = {
    id: o.id, race: o.race ?? 0, civ: o.civ ?? -1, x: o.x, y: o.y, tx: o.tx ?? o.x, ty: o.ty ?? o.y,
    hp: o.hp ?? 10, maxHp: o.maxHp ?? o.hp ?? 10, dmg: 1, speed: o.speed ?? 1, age: o.age ?? 0, maxAge: o.maxAge ?? 9999, kills: 0,
    cd: 0, trait: o.trait ?? 0, job: o.job ?? 0, king: o.king ? 1 : 0, infected: o.infected ?? false, flip: 0,
    name: `u${o.id}`, hurt: o.hurt ?? 0, breath: 0, parity: 0, dead: o.dead ?? 0,
    ...(o.grab !== undefined ? { grab: o.grab } : {}),   // M-U21：grab 直写面（999 常驻冻结——unitsTick 窗口内零 AI 触达，grabbedTick 零掷早退）
    ...(o.wep !== undefined ? { wep: o.wep } : {}),           // M-U22：武器槽直写（reap 掉落 0.35 门消费——undefined ≡ 蓝本缺键）
    ...(o.rebirths !== undefined ? { rebirths: o.rebirths } : {}),  // M-U22：凤凰涅槃计数（u.rebirths ?? 0 门——0 falsy 亦须直写）
    ...(o.gen !== undefined ? { gen: o.gen } : {}),           // M-U22：九头蛇世代（u.gen ?? 0 门）
    ...(o.caravan !== undefined ? { caravan: o.caravan } : {}),     // M-U22：商队直写（reap rel 降温面 (u.caravan ?? 0) > 0）
    ...(o.food !== undefined ? { food: o.food } : {}),        // M-U22：饥饿直写（scav 80-(p.food ?? 0) 面）
    fgn: null, gene: o.gene ? { s: o.gene.s, d: o.gene.d, h: o.gene.h, r: o.gene.r } : null, army: null,   // M-U19：gene 深拷贝（spec 对象复用 det 双跑——jumpGene 原地改写 u.gene，共享引用即 det 污染）
    ...(o.fam !== undefined ? { fam: o.fam } : {}),           // M-U22：家族直写（reap members-- 面——置于固定键后防覆盖）
    ...(o.fleeT !== undefined ? { fleeT: o.fleeT } : {}),     // M-U25：逃亡倒数（beachedAquaticTick L12661 让位门——内核 AI 域不触）
    ...(o.beachT !== undefined ? { beachT: o.beachT } : {}),  // M-U25：搁浅窒息计数直写（L12744 ++ / L12751 ≥15 终局）
    ...(o.beachTid !== undefined ? { beachTargetId: o.beachTid } : {}),  // M-U25：猎游粘性目标（L12675 预设支）
  };
  eng.units.push(u);
  eng.unitById.set(u.id, u);
  return u;
}

// units dump 协议（gen-tool2 dumpUnit 同构 + bless/curse/fert 三瞬态扩展）
function dumpUnit(u) {
  return {
    id: u.id, race: u.race, civ: u.civ,
    x: f64hex(u.x), y: f64hex(u.y), tx: f64hex(u.tx ?? u.x), ty: f64hex(u.ty ?? u.y),
    hp: f64hex(u.hp ?? 10), maxHp: f64hex(u.maxHp ?? 10), dmg: f64hex(u.dmg ?? 1), speed: f64hex(u.speed ?? 1),
    age: f64hex(u.age ?? 0), maxAge: f64hex(u.maxAge ?? 9999),
    hurtN: u.hurt === undefined || u.hurt === null ? null : f64hex(u.hurt),
    dead: u.dead ? 1 : 0, flip: u.flip ? 1 : 0, infected: u.infected ? 1 : 0,
    bless: u.bless ?? null, curse: u.curse ?? null, fert: u.fert ?? null,
    job: u.job === undefined ? null : u.job, name: u.name ?? null,
    trait: u.trait ? u.trait : null,                       // M-U19：u.trait string 语义（0 falsy → null；rerollTrait 写面）
    gene: u.gene ? { s: f64hex(u.gene.s), d: f64hex(u.gene.d), h: f64hex(u.gene.h), r: f64hex(u.gene.r) } : null,
    fam: u.fam ?? null, fgn: u.fgn ?? null,
    breath: u.breath ?? null, parity: u.parity ?? null, kills: u.kills ?? null,
    ...(u.rebirths !== undefined ? { rebirths: u.rebirths } : {}),  // M-U22：凤凰涅槃计数（条件键——旧场景字节零变化）
    ...(u.gen !== undefined ? { gen: u.gen } : {}),                 // M-U22：九头蛇世代
    ...(u.caravan !== undefined ? { caravan: u.caravan } : {}),     // M-U22：商队
    ...(u.food !== undefined ? { food: u.food } : {}),              // M-U22：饥饿（scav 写面对账）
    ...(u.wep !== undefined ? { wep: u.wep } : {}),                 // M-U22：武器槽（掉落后清账对账）
    ...(u.fleeT !== undefined ? { fleeT: u.fleeT } : {}),           // M-U25：逃亡倒数（beached 让位门）
    ...(u.beachT !== undefined ? { beachT: u.beachT } : {}),        // M-U25：搁浅窒息计数
    ...(u.beachTx !== undefined ? { beachTx: u.beachTx } : {}),     // M-U25：归海/猎游目标 x
    ...(u.beachTy !== undefined ? { beachTy: u.beachTy } : {}),     // M-U25：归海/猎游目标 y
    ...(u.beachTargetId !== undefined ? { beachTid: u.beachTargetId } : {}),  // M-U25：猎游粘性目标
  };
}

// fx 终态 dump（gen-tool2 fx 同构 + x0/y0/age/quiet/dmg 五面——熔岩弹/等离子 dmg 消费）
function dumpFx(e) {
  return {
    kind: e.kind, x: f64hex(e.x), y: f64hex(e.y),
    x0: e.x0 === undefined ? null : f64hex(e.x0), y0: e.y0 === undefined ? null : f64hex(e.y0),
    ttl: f64hex(e.ttl), seed: e.seed, dir: f64hex(e.dir), r: e.r ?? null, age: e.age,
    quiet: e.quiet ? 1 : 0, dmg: e.dmg === undefined || e.dmg === null ? null : f64hex(e.dmg),
  };
}

// events dump（gen-tool2 同构 + colorHex 面——annihilationLight '#ff4d4d' 消费）
function dumpEvent(e) {
  return { kind: e.kind, text: e.text, colorHex: e.colorHex ?? null, x: e.x ?? null, y: e.y ?? null };
}

// ---- 手术式夹具构建 + calls/ticks 混合链步进快照 ----
function buildScenario(spec) {
  const eng = new GameEngine(spec.baseSeed);

  // 手术一：瞬态层清零（gen-tool2 同款）
  eng.terrain.fill(spec.fill === 'deep' ? T.DEEP : T.GRASS);
  eng.tempMap.fill(0);
  eng.fire.fill(0);
  eng.fireSet.clear();
  eng.frozen.clear();
  eng.flood.clear();
  eng.wet.clear();
  eng.regrow.clear();
  eng.units.length = 0;
  eng.unitById.clear();
  eng.families.clear();                              // M-U22：家族谱系清零（worldgen newFamily 残留 27 项污染实证——reap members-- 面净化）
  eng.civs.length = 0;                               // M-U22：civ 清零（同上——civ 夹具瘦注入）
  eng.effects.length = 0;
  eng.worldEvents.length = 0;
  eng.eventSeq = 1;
  eng.buildings.length = 0;
  eng.bIdx.clear();
  eng.building.fill(0);
  eng.owner.fill(-1);
  eng.road.fill(0);
  eng.riverDir.fill(0);
  eng.riverTiles.clear();
  eng.waterTier.fill(0);
  eng.worldsim.glacier.fill(0);
  eng.radiate.fill(0);
  eng.radSet.clear();
  eng.dirty.clear();
  eng.laws.seasons = spec.seasons ?? true;
  eng.yearF = spec.yearF ?? 2.5;
  eng.tickCount = spec.tickCount;
  eng.shake = 0;
  eng.brush = spec.brush ?? 3;                     // L688 类字段默认 3
  eng.statNukes = 0;
  eng.statMeteorShowers = 0;                       // L230-234 成就计数五联清零
  eng.statPlasmas = 0;
  eng.statAnnihilations = 0;
  eng.statBlackholes = 0;

  // toast 宿主回调收集器（纪律③事件流）
  const toasts = [];
  eng.onToast = (t) => toasts.push({ id: t.id, text: t.text, tone: t.tone, op: t.op ?? null });

  // 手术二·直写相（保序）
  for (const [x, y, t] of spec.terrain ?? []) eng.terrain[idx(x, y)] = t;
  for (const [x, y, v] of spec.owner ?? []) eng.owner[idx(x, y)] = v;
  for (const [x, y, at] of spec.regrow ?? []) eng.regrow.set(idx(x, y), at);
  for (const [x, y, at] of spec.flood ?? []) eng.flood.set(idx(x, y), at);
  for (const [x, y, v] of spec.fire ?? []) { eng.fire[idx(x, y)] = v; eng.fireSet.add(idx(x, y)); }
  for (const [x, y, v] of spec.soil ?? []) eng.worldsim.soilF[idx(x, y)] = v;
  for (const [x, y, v] of spec.variant ?? []) eng.variant[idx(x, y)] = v;
  for (const [x, y, v] of spec.radiate ?? []) { eng.radiate[idx(x, y)] = v; eng.radSet.set(idx(x, y), spec.tickCount + 500); }
  for (const uo of spec.units ?? []) mkUnit(eng, uo);
  // M-U22：civ/family 瘦夹具直写（reap pop--/onKingDeath/members--/rel 降温面——零掷纯写；
  //   civ 瘦对象仅给本切片消费字段，effectsTick 无 civ 消费面零漂移）
  for (const c of spec.civs ?? []) eng.civs.push({ ...c });
  for (const [fid, f] of spec.families ?? []) eng.families.set(fid, { ...f });
  // M-U23：灰烬/wildCount 瘦夹具直写（零掷纯写——phoenixAshTick 重生倒计时窗口 + spawnUnit L1300 预算门 null 支）
  for (const a of spec.ashes0 ?? []) eng.phoenixAshes.push({ ...a });
  eng.wildCount.clear();                                          // M-U25：worldgen 残留清零（wildlifeRebound 灭绝名单/wildAlive 预算确定性面——旧场景阈值门两侧同过实证〔S26 900 注入 ≥ 门〕；C# 裸构造空表 + wild0 注入同构对齐）
  for (const [r, n] of spec.wild0 ?? []) eng.wildCount.set(r, n);       // wildAlive()=ΣwildCount.values（engine L1572-1576）——注入 900 ≥ MAX_WILDLIFE
  if (spec.repro !== undefined) eng.laws.reproduction = spec.repro;     // M-U25：繁衍法则门（wildlifeRebound L12841 / sharkBreed L12996——构造默认 true）
  for (const [r, t] of spec.rebound0 ?? []) eng.reboundLast.set(r, t);  // M-U25：迁徙权重 ago 夹具（L12871 reboundLast.get——类字段原生空表 L495）
  // M-U24：尸体/建筑 瘦夹具直写（零掷纯写——lichRaiseTick r=4 最陈旧选择 + entGrove L13068 建筑门）
  for (const c of spec.corpses0 ?? []) eng.corpses.push({ ...c });
  for (const [x, y, v] of spec.building ?? []) eng.building[idx(x, y)] = v;

  // 手术二·快照：直写后/调用前的镜像输入面
  const fixture = {
    terrain0: gzB64(eng.terrain),
    owner0: gzB64(new Uint8Array(eng.owner.buffer.slice(0))),
    regrow0: [...eng.regrow.entries()],
    flood0: [...eng.flood.entries()],
    fire0: gzB64(eng.fire),
    fireSet0: [...eng.fireSet],
    soil0: gzB64(eng.worldsim.soilF),
    radiate0: gzB64(eng.radiate),
    radSet0: [...eng.radSet.entries()],
    brush0: eng.brush,
    units0: (spec.units ?? []).map((uo) => ({
      id: uo.id, race: uo.race, x: uo.x, y: uo.y, hp: uo.hp ?? 10, maxHp: uo.maxHp ?? uo.hp ?? 10,
      gene: uo.gene ?? null, dead: uo.dead ?? 0, infected: uo.infected ?? false, hurt: uo.hurt ?? 0, trait: uo.trait ?? 0,
      job: uo.job ?? 0,                                     // M-U19：jumpGene JOBS[job] 消费面（civ jd 乘数支）
      ...(uo.grab !== undefined ? { grab: uo.grab } : {}),  // M-U21：grab 直写面（999 常驻冻结）
      ...(uo.wep !== undefined ? { wep: uo.wep } : {}),           // M-U22：武器槽（reap 掉落门——条件键旧场景零变化）
      ...(uo.fam !== undefined ? { fam: uo.fam } : {}),           // M-U22：家族
      ...(uo.king !== undefined ? { king: uo.king } : {}),        // M-U22：王位
      ...(uo.rebirths !== undefined ? { rebirths: uo.rebirths } : {}),  // M-U22：凤凰涅槃
      ...(uo.gen !== undefined ? { gen: uo.gen } : {}),           // M-U22：九头蛇世代
      ...(uo.caravan !== undefined ? { caravan: uo.caravan } : {}),     // M-U22：商队
      ...(uo.food !== undefined ? { food: uo.food } : {}),        // M-U22：饥饿
      ...(uo.civ !== undefined ? { civ: uo.civ } : {}),           // M-U22：civ（pop-- 面——civ 夹具直写消费）
      ...(uo.fleeT !== undefined ? { fleeT: uo.fleeT } : {}),    // M-U25：逃亡倒数（beachedAquaticTick L12661 让位门）
      ...(uo.beachTid !== undefined ? { beachTid: uo.beachTid } : {}),  // M-U25：猎游粘性目标预设（L12675 tid>=0 支）
    })),
    yearF0: eng.yearF,
    unitSeq0: eng.unitSeq,                             // M-U22：unitSeq 起点快照（worldgen 期野生动物 spawn 推进——reap-hydra 幼蛇 id 604/605 位级锚；C# ReplayScenario 裸构造 unitSeq=1 缺口）
    familySeq0: eng.familySeq,                         // M-U25：familySeq 起点快照（worldgen 播撒 0.06 fam 门命中推进——S37 尾 6 鱼 fam=27 位级锚；gen 行为零漂移纯记录，镜像消费面同 unitSeq0 先例）
    // M-U22：civ/family 瘦夹具快照（reapDump 场景条件键——pop--/onKingDeath/members--/rel 消费面 C# 重放注入）
    ...(spec.civs ? { civs0: spec.civs } : {}),
    ...(spec.families ? { families0: spec.families.map(([id, f]) => ({ id, ...f })) } : {}),
    // M-U23：灰烬/wildCount 起点快照（C# 重放注入——条件键旧场景字节零变化）
    ...(spec.ashes0 ? { ashes0: spec.ashes0 } : {}),
    ...(spec.wild0 ? { wild0: spec.wild0 } : {}),
    // M-U25：迁徙域起点快照（C# 重放注入——条件键旧场景字节零变化；wildAll0 = 清零+注入后全量表
    //   〔rebound 预算门/灭绝名单消费面〕；rebound0 = reboundLast 权重表；repro0 = 法则门）
    ...(spec.rebound0 ? { rebound0: spec.rebound0 } : {}),
    ...(spec.wildAll ? { wildAll0: [...eng.wildCount.entries()] } : {}),
    ...(spec.repro !== undefined ? { repro0: spec.repro } : {}),
    // M-U24：尸体/建筑/季节 起点快照（条件键旧场景字节零变化——season0 = eng.nature.season 派生值快照
    //   〔yearF/SEASON_YEARS %4 getter——nature.ts L161-163；镜像端硬编码 0 消费此键，C# 端 yearF0 派生同构〕）
    ...(spec.corpses0 ? { corpses0: spec.corpses0 } : {}),
    ...(spec.building ? { building0: spec.building } : {}),
    ...(spec.season0 !== undefined ? { season0: eng.nature.season } : {}),
  };

  // 步进快照（calls 与 ticks 统一面——applyTool 紧凑 / effectsTick 全列）
  const snapCommon = () => ({
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
    // M-U21：stepUnits 场景条件扩展面（旧 15 场景字节零变化——条件键不进旧 JSON）
    ...(spec.stepUnits ? { grabId: eng.grabId ?? null } : {}),
  });

  // 手术三（尾置）：rngA 清零起流 → calls 直调 + ticks 步进（tickCount++ 头 + effectsTick——主循环 L2508 序）
  eng.rngA = spec.seed >>> 0;
  const steps = [];
  for (const call of spec.calls ?? []) {
    eng[call.fn](...call.args);
    steps.push({ fn: call.fn, args: call.args, ...snapCommon() });
  }
  for (let k = 0; k < (spec.ticks ?? 0); k++) {
    eng.tickCount++;
    if (spec.stepUnits) {
      // M-U21 unitsTick 步进通道：主循环 L2523-2528 截断镜像（fireTick 夹具无火零效应保序 /
      //   rebuildBuckets 零掷纯函数 / unitsTick JS 路径——无头 WBB.active()=false 且
      //   retryDue()=false 双门实证〔wbspatial.ts L126/L560：failed=false → 恒 false〕——
      //   L3204-3216 for..of parity 门 + unitsReap 全活零效应）
      eng.fireTick();
      eng.rebuildBuckets();
      eng.unitsTick();
    }
    eng.effectsTick();
    // M-U27：主循环 L2604 引擎级通道镜像（天使光环——相位 (phase+id*13)%50 门；phase=(tickCount/3)|0。
    //   旧 40 场景夹具无 ANGEL 族——外层 for..of 纯读零写零掷字节零漂移〔M-U23 同款论证〕）
    if (eng.tickCount % 3 === 0) eng.angelAuraTick();                                            // L2604
    // M-U23：主循环 L2606 引擎级通道镜像（灰烬倒数到点重生——phoenixAshes.len>0 蓝本门原样；
    //   旧场景 ashes 空门假零效应字节零变化；L2534-2606 间门位〔panic/civs/rad/front/economy〕
    //   夹具窗口全空零效应——S25 三步零掷探针实证）
    if (eng.phoenixAshes.length > 0) eng.phoenixAshTick();
    // M-U24：主循环 L2608/L2611/L2612 引擎级通道镜像（树人播种/巫妖复生/九头蛇回血——蓝本门原样；
    //   旧场景窗口取值 %10/%12/%30 全不触（S16-S26 ticks 窗口 1001/1006-1009/1010 实证）字节零变化）
    const prOn = process.env.TOOL3_PROBE === spec.key;                                              // 探针钩子（真环境掷流录制——平行复刻派生面漂移弃用）
    if (prOn) { if (!eng.__prRec) { eng.__prRec = []; const orng = eng.rng.bind(eng); eng.rng = () => { const v = orng(); eng.__prRec.push(v); return v; }; } eng.__prRec.length = 0; }
    const prFire0 = prOn ? eng.__prRec.length : 0;
    if (eng.tickCount % 10 === 0) eng.entGroveTick();                                            // L2608
    const prGrove0 = prOn ? eng.__prRec.length : 0;
    if (eng.tickCount % (eng.nature.season === 3 ? 8 : 12) === 0) eng.lichRaiseTick();           // L2611（季节节律：寒冬死潮加速 12→8）
    const prLich0 = prOn ? eng.__prRec.length : 0;
    if (eng.tickCount % 30 === 0) eng.hydraRegenTick();                                          // L2612
    if (prOn) {
      // entGrove 落点离线重放（ang/rr 成对 + 地形门掷短路感知；grove 窗 = [prFire0, prGrove0)，
      //   尾部 spark/water fx 掷与声门掷不进重放——di 停在最后一采样即全采样重放完）
      const gd = eng.__prRec.slice(prFire0, prGrove0);
      const lands = []; let di = 0; const sn = eng.nature.season;
      const unitsSnap = eng.units.map((u) => ({ race: u.race, x: u.x, y: u.y }));
      for (const u of unitsSnap) {
        if (u.race !== 30) continue;                                   // R.ENT
        if (sn !== 3) for (let k = 0; k < 2; k++) {
          const ang = gd[di] * Math.PI * 2; di++;
          const rr = 1 + gd[di] * 2.5; di++;
          const lx = Math.floor(u.x + Math.cos(ang) * rr);
          const ly = Math.floor(u.y + Math.sin(ang) * rr);
          const j = ly * W + lx;
          const oob = j < 0 || j >= W * H;
          const bld = !oob && eng.building[j] > 0;
          const t = oob ? -1 : eng.terrain[j];
          if (!oob && !bld && (t === 3 || t === 9 || t === 2)) di++;   // 地形门掷消耗（T.GRASS/T.BURNT/T.SAND）
          lands.push({ u: u.id ?? -1, lx, ly, oob, bld, t });
        }
      }
      console.log(`PROBE ${spec.key} tick=${eng.tickCount} groveDraws=${gd.length} replayed=${di} lands=${JSON.stringify(lands)}`);
    }
    // M-U25：主循环 L2614/L2616/L2618/L2620 引擎级通道镜像（水生搁浅整治/百兽迁徙/猎手扑杀/鲨群繁衍——蓝本门原样；
    //   旧场景零效应实证：beached 逐 tick 无门但 S1-S31 单位面无 aquatic 族纯读零写；%600===61 与 %240===13
    //   旧窗口 1001-1050 全不触；%20===7 触于 1007/1027〔S1/S5/S9/S11/S12/S16/S17〕但普查/预算/出手门纯读
    //   零掷——唯一饿捕食者 S24 food:30 窗口 1001 不触）
    eng.beachedAquaticTick();                                                                     // L2614（每 tick 无门）
    if (eng.tickCount % 600 === 61) eng.wildlifeReboundTick();                                    // L2616
    if (eng.tickCount % 20 === 7) eng.predatorHuntTick();                                         // L2618
    if (eng.tickCount % 240 === 13) eng.sharkBreedTick();                                         // L2620
    steps.push({
      fn: spec.stepUnits ? 'unitsTick' : 'effectsTick', tick: k + 1,
      ...snapCommon(),
      fx: eng.effects.map((e) => ({ kind: e.kind, age: e.age, x: f64hex(e.x), y: f64hex(e.y), dir: f64hex(e.dir) })),
      units: eng.units.map((u) => ({
        id: u.id, hp: f64hex(u.hp), hurt: f64hex(u.hurt ?? 0), dead: u.dead ? 1 : 0, x: f64hex(u.x), y: f64hex(u.y),
        // M-U21：stepUnits 场景条件扩展面（grab/thrT 位级——旧场景字节零变化）
        ...(spec.stepUnits ? { grab: u.grab ?? 0, thrT: u.thrT ?? 0 } : {}),
        // M-U25：stepBeach 场景条件扩展面（搁浅域 tx/ty 断言 + beachT 计数 + 猎游目标位级——旧场景字节零变化）
        ...(spec.stepBeach ? { tx: f64hex(u.tx ?? u.x), ty: f64hex(u.ty ?? u.y), beachT: u.beachT ?? null, btx: u.beachTx ?? null, bty: u.beachTy ?? null, btid: u.beachTargetId ?? null } : {}),
        // M-U27：stepAura 场景条件扩展面（光环域 infected 旗步内位级——清瘟/三门拒面；旧 40 场景字节零变化）
        ...(spec.stepAura ? { infected: u.infected ? 1 : 0 } : {}),
      })),
      // M-U23：stepAsh 场景条件扩展面（灰烬倒数每步位级 t——旧场景字节零变化）
      ...(spec.stepAsh ? { ashes: eng.phoenixAshes.map((a) => ({ x: f64hex(a.x), y: f64hex(a.y), t: a.t, rebirths: a.rebirths })) } : {}),
      dirty: [...eng.dirty].sort((a, b) => a - b),
    });
  }

  // sanity（生成即验证）——TOOL3_DIAG=1 时不符仅告警继续
  const totalDraws = (eng.rngA >>> 0) === (spec.seed >>> 0) ? 0 : chainDraws(spec.seed >>> 0, eng.rngA >>> 0);
  if (spec.minDraws !== undefined && totalDraws !== spec.minDraws) {
    const msg = `${spec.key}: 掷数 ${totalDraws} ≠ 期望 ${spec.minDraws}`;
    if (process.env.TOOL3_DIAG === '1') console.log('DIAG-draws ' + msg);
    else throw new Error(msg);
  }
  if (spec.sanity && !spec.sanity(eng, toasts)) {
    console.error(`DIAG ${spec.key}: draws=${totalDraws} rngA=${(eng.rngA >>> 0).toString(16)} shake=${eng.shake} stats=${JSON.stringify([eng.statNukes, eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes])} fx=${JSON.stringify(eng.effects.map((e) => ({ k: e.kind, x: e.x, y: e.y, ttl: e.ttl, age: e.age, r: e.r, x0: e.x0, y0: e.y0, q: e.quiet })))} fireSet=${eng.fireSet.size} units=${JSON.stringify(eng.units.map((u) => ({ id: u.id, hp: u.hp, hurt: u.hurt, dead: u.dead, bless: u.bless, curse: u.curse, fert: u.fert, inf: u.infected, t: [u.tx, u.ty], bt: u.beachT ?? null, bx: u.beachTx ?? null, by: u.beachTy ?? null, tid: u.beachTargetId ?? null, fl: u.fleeT ?? null })))} ev=${JSON.stringify(eng.worldEvents.map((e) => ({ k: e.kind, t: e.text })))} t10060=${eng.terrain[idx(100, 60)]}`);
    throw new Error(`${spec.key}: sanity 未过`);
  }

  return {
    key: spec.key,
    baseSeed: spec.baseSeed,
    seed: spec.seed,
    tickCount: spec.tickCount,
    totalDraws,
    fixture,
    stepsSnap: steps,
    terrain: gzB64(eng.terrain),
    variantMd5: md5hex(eng.variant),
    radiate: gzB64(eng.radiate),
    radSet: [...eng.radSet.entries()],
    regrow: [...eng.regrow.entries()],
    shake: eng.shake,
    stats: [eng.statNukes, eng.statMeteorShowers, eng.statPlasmas, eng.statAnnihilations, eng.statBlackholes],
    fx: eng.effects.map(dumpFx),
    events: eng.worldEvents.map(dumpEvent),
    units: eng.units.map(dumpUnit),
    toasts,
    // M-U22：reapDump 条件扩展面（unitsReap 收尸域终态——items/ash/贴花/civ/family/rel 六域；
    //   条件键不进旧 18 场景 JSON——字节零变化）
    ...(spec.reapDump ? {
      itemSeq: eng.itemSeq,
      items: eng.items.map((it) => ({ id: it.id, kind: it.kind, x: f64hex(it.x), y: f64hex(it.y) })),
      ashes: eng.phoenixAshes.map((a) => ({ x: f64hex(a.x), y: f64hex(a.y), t: a.t, rebirths: a.rebirths })),
      corpses: eng.corpses.map((c) => ({ x: f64hex(c.x), y: f64hex(c.y), age: c.age, stone: c.stone ? 1 : 0, undead: c.undead ? 1 : 0 })),
      blood: eng.blood.map((b) => ({ x: f64hex(b.x), y: f64hex(b.y), age: b.age, seed: b.seed, big: b.big ? 1 : 0 })),
      civs: eng.civs.map((c) => ({ id: c.id, name: c.name, pop: c.pop, stability: f64hex(c.stability), kingId: c.kingId ?? null })),
      families: [...eng.families.entries()].map(([fid, f]) => ({ id: fid, members: f.members })),
      rel: [...eng.rel.entries()].map(([k, v]) => ({ k, v: f64hex(v) })),
    } : {}),
    // M-U25：迁徙/繁衍域终态条件扩展面（wildCount 全量 + reboundLast 权重表——C# 重放对账；条件键旧场景字节零变化）
    ...(spec.wildAll ? { wildAll: [...eng.wildCount.entries()] } : {}),
    ...(spec.wildAll ? { reboundLast: [...eng.reboundLast.entries()] } : {}),
  };
}

// ---- 场景集（12 场景） ----
// 靶区：中心 (100,60)；brush 直写面走 spec.brush（L688 默认 3）
const BASE = 20261201;
// M-U25：迁徙域十七族 wild0 夹具助手（灭绝位归零余各族 5——灭绝名单/预算门确定性面；surgery 清零后全账可控）
const SEED_RACES = [R.SHEEP, R.WOLF, R.BEAR, R.DEER, R.PENGUIN, R.CAMEL, R.SCORPION, R.SNAKE, R.SNOWWOLF, R.CHICKEN, R.PIG, R.RABBIT, R.FOX, R.FISH, R.CRAB, R.TURTLE, R.SHARK];
const wild17 = (extinct) => SEED_RACES.map((r) => [r, r === extinct ? 0 : 5]);

const specs = [
  // ---- S1：volcano 默认参 pw=1（锥体 21 格 MOUNTAIN + 山口 LAVA + 引燃圈 8 点
  //        ring=3.5 + fx volcano ttl 110 + shake 8；消费端 30 tick：熔岩弹 age14/28
  //        双掷×2 + 岩浆外溢 age%6 五次 + 单位灼烧 0.8/tick——u1 死亡 u2 环外幸存）----
  {
    key: 'volcano-default', baseSeed: BASE + 1, seed: 0x0C610001, tickCount: 1000, fill: 'grass',
    units: [{ id: 900, race: R.SHEEP, x: 101, y: 60, hp: 20, maxHp: 20 },
            { id: 901, race: R.SHEEP, x: 104, y: 60, hp: 200, maxHp: 200 }],   // d=4 灼烧环外
    calls: [{ fn: 'applyTool', args: ['volcano', 100, 60] }],
    ticks: 30,
    sanity: (eng) => eng.terrain[idx(100, 60)] === T.LAVA && eng.terrain[idx(97, 60)] === T.GRASS
      && eng.fireSet.size === 8
      && eng.unitById.get(900).dead && eng.unitById.get(901).hp === 200
      && eng.effects.filter((e) => e.kind === 'volcano').length === 1
      && eng.worldEvents.some((e) => e.text === '大地震颤，一座火山拔地而起，岩浆喷薄而出'),
  },
  // ---- S2：volcano pw=3（十字 + 3x3 熔岩湖 + ring=10.5 引燃 + shake 12 封顶面
  //        6+3*2=12；event pw>1 文本分叉 + 熔岩弹 age14 单发）----
  {
    key: 'volcano-power3', baseSeed: BASE + 2, seed: 0x0C610002, tickCount: 1000, fill: 'grass',
    units: [{ id: 910, race: R.SHEEP, x: 110, y: 70, hp: 200, maxHp: 200 }],   // d≈14.1 环外
    calls: [{ fn: 'applyTool', args: ['volcano', 100, 60, { power: 3 }] }],
    ticks: 5,   // age<6：消费端仅 shake 面——地形断言确定性（S1 已覆盖熔岩弹/外溢面）
    sanity: (eng) => eng.terrain[idx(101, 60)] === T.LAVA && eng.terrain[idx(100, 60)] === T.LAVA
      && eng.terrain[idx(100, 50)] === T.GRASS   // ring=10.5 引燃圈外 GRASS 不变
      && eng.fireSet.size === 8
      && eng.shake === 12 && eng.unitById.get(910).hp === 200
      && eng.worldEvents.some((e) => e.text === '大地震颤，一座火山拔地而起，熔岩以烈度 3 喷薄而出'),
  },
  // ---- S3：四生成器 spawn 面（tsunami r*2.5 钳 + blizzard max(5,r) + locust rP
  //        undefined→JS 默认参 5 + drought max(5,r)——全 tickless 零消费面）----
  {
    key: 'spawn-quartet', baseSeed: BASE + 3, seed: 0x0C610003, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['tsunami', 100, 60] },
      { fn: 'applyTool', args: ['blizzard', 100, 60] },
      { fn: 'applyTool', args: ['locust', 100, 60] },
      { fn: 'applyTool', args: ['drought', 100, 60] },
    ],
    sanity: (eng) => eng.effects.length === 4
      && eng.effects[0].kind === 'tsunami' && eng.effects[0].r === 7.5 && eng.effects[0].ttl === 42
      && eng.effects[1].kind === 'blizzard' && eng.effects[1].r === 5 && eng.effects[1].ttl === 190
      && eng.effects[2].kind === 'locust' && eng.effects[2].r === 5 && eng.effects[2].ttl === 240
      && eng.effects[3].kind === 'drought' && eng.effects[3].r === 5 && eng.effects[3].ttl === 200,
  },
  // ---- S4：meteor 单发 + meteorshower 六连（x0/y0 偏移面 + quiet 衍生弹抑纪事
  //        + statMeteorShowers 成就计数 + n=count 直取面）----
  {
    key: 'meteor-meteorshower', baseSeed: BASE + 4, seed: 0x0C610004, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['meteor', 100, 60] },
      { fn: 'applyTool', args: ['meteorshower', 100, 60, { count: 6 }] },
    ],
    sanity: (eng) => eng.effects.length === 7
      && eng.effects[0].x0 === 120 && eng.effects[0].y0 === 26 && !eng.effects[0].quiet
      && eng.effects.filter((e) => e.kind === 'meteor').length === 7
      && eng.effects.slice(1).every((e) => e.quiet && e.x0 === e.x + 18 && e.y0 === e.y - 30)
      && eng.statMeteorShowers === 1
      && eng.worldEvents.some((e) => e.text === '一场陨石雨呼啸而降（6 颗）'),
  },
  // ---- S5：wrath 天罚风暴（spawn cap 门 + 消费端 22 tick：age%10 雷击×2——
  //        lightning n=1 全掷流 + 中心点燃 + 四邻 0.5 门）----
  {
    key: 'wrath-ticks', baseSeed: BASE + 5, seed: 0x0C610005, tickCount: 1000, fill: 'grass',
    units: [{ id: 920, race: R.SHEEP, x: 100, y: 60, hp: 5000, maxHp: 5000 }],   // 雷击环 d<1.9 面承伤
    calls: [{ fn: 'applyTool', args: ['wrath', 100, 60] }],
    ticks: 22,
    sanity: (eng) => eng.effects.filter((e) => e.kind === 'wrath').length === 1
      && eng.effects.filter((e) => e.kind === 'bolt').length === 1   // age10 bolt ttl10 已 splice；age20 bolt 在列
      && eng.fireSet.size === 5 && eng.effects[0].r === 4,
  },
  // ---- S6：单位面四神力（bless 治疗+增益+驱瘟 / curse 诅咒 / love 繁衍增益 /
  //        teleport randomLandSpot 迁移——四瞬态字段 + fx 门掷 + spark 双发）----
  {
    key: 'area-powers', baseSeed: BASE + 6, seed: 0x0C610006, tickCount: 1000, fill: 'grass',
    units: [
      { id: 930, race: R.SHEEP, x: 99, y: 60, hp: 20, maxHp: 100, infected: true },   // bless: hp→70
      { id: 931, race: R.SHEEP, x: 101, y: 60, hp: 100, maxHp: 100 },                 // curse
      { id: 932, race: R.SHEEP, x: 100.5, y: 61, hp: 100, maxHp: 100 },               // love
      { id: 933, race: R.SHEEP, x: 100, y: 59, hp: 100, maxHp: 100 },                 // teleport
    ],
    calls: [
      { fn: 'applyTool', args: ['bless', 100, 60] },
      { fn: 'applyTool', args: ['curse', 100, 60] },
      { fn: 'applyTool', args: ['love', 100, 60] },
      { fn: 'applyTool', args: ['teleport', 100, 60] },
    ],
    sanity: (eng) => eng.unitById.get(930).hp === 70 && eng.unitById.get(930).bless === 600
      && eng.unitById.get(930).infected === false && eng.unitById.get(931).curse === 500
      && eng.unitById.get(932).fert === 500
      && (eng.unitById.get(933).x !== 100 || eng.unitById.get(933).y !== 59),
  },
  // ---- S7：静态四神力 spawn（sinkhole shake 7 + iceAge rP undefined→max(6,brush*2+4)
  //        =10 + famine JS 默认参 6 + blackhole statBlackholes 成就计数）----
  {
    key: 'static-quartet', baseSeed: BASE + 7, seed: 0x0C610007, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['sinkhole', 100, 60] },
      { fn: 'applyTool', args: ['iceage', 100, 60] },
      { fn: 'applyTool', args: ['famine', 100, 60] },
      { fn: 'applyTool', args: ['blackhole', 100, 60] },
    ],
    sanity: (eng) => eng.effects.length === 4
      && eng.effects[0].kind === 'sinkhole' && eng.effects[0].r === 3 && eng.effects[0].ttl === 80
      && eng.effects[1].kind === 'iceage' && eng.effects[1].r === 10 && eng.effects[1].ttl === 420
      && eng.effects[2].kind === 'famine' && eng.effects[2].r === 6 && eng.effects[2].ttl === 260
      && eng.effects[3].kind === 'blackhole' && eng.effects[3].r === 8 && eng.effects[3].ttl === 130
      && eng.shake === 7 && eng.statBlackholes === 1,
  },
  // ---- S8：十三神力 cap 门复合（每系 ×(cap+1) 次连发——filter 快照零掷拒面 +
  //        接纳面 2 掷/fx；拒后零写零掷实证）----
  {
    key: 'caps-composite', baseSeed: BASE + 8, seed: 0x0C610008, tickCount: 1000, fill: 'grass',
    calls: [
      ...[1, 2, 3, 4, 5, 6, 7].map((k) => ({ fn: 'applyTool', args: ['acidrain', 100, 60] })),
      ...[1, 2, 3, 4, 5, 6, 7].map((k) => ({ fn: 'applyTool', args: ['rain', 100, 60] })),
      ...[1, 2, 3, 4, 5].map((k) => ({ fn: 'applyTool', args: ['blizzard', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['locust', 100, 60] })),
      ...[1, 2, 3, 4, 5].map((k) => ({ fn: 'applyTool', args: ['drought', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['wrath', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['holystorm', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['sandstorm', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['typhoon', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['sinkhole', 100, 60] })),
      ...[1, 2, 3].map((k) => ({ fn: 'applyTool', args: ['iceage', 100, 60] })),
      ...[1, 2, 3, 4].map((k) => ({ fn: 'applyTool', args: ['famine', 100, 60] })),
      ...[1, 2, 3].map((k) => ({ fn: 'applyTool', args: ['blackhole', 100, 60] })),
    ],
    sanity: (eng) => {
      const cnt = (k) => eng.effects.filter((e) => e.kind === k).length;
      return cnt('acid') === 6 && cnt('rainstorm') === 6 && cnt('blizzard') === 4 && cnt('locust') === 3
        && cnt('drought') === 4 && cnt('wrath') === 3 && cnt('holystorm') === 3 && cnt('sandstorm') === 3
        && cnt('typhoon') === 3 && cnt('sinkhole') === 3 && cnt('iceage') === 2 && cnt('famine') === 3
        && cnt('blackhole') === 2 && eng.effects.length === 45;
    },
  },
  // ---- S9：typhoon 消费端 40 tick（游荡 dir 1 掷/tick + 狂风推拽 walkable 门 +
  //        环伤 0.18 + age%36 雷击 + 暴雨灭火 0.4 门——预置火格双格）----
  {
    key: 'typhoon-ticks', baseSeed: BASE + 9, seed: 0x0C610009, tickCount: 1000, fill: 'grass',
    fire: [[103, 60, 100], [104, 61, 100]],
    units: [{ id: 940, race: R.SHEEP, x: 101, y: 60, hp: 500, maxHp: 500 },
            { id: 941, race: R.SHEEP, x: 103, y: 60, hp: 500, maxHp: 500 }],
    calls: [{ fn: 'applyTool', args: ['typhoon', 100, 60] }],
    ticks: 40,
    sanity: (eng) => eng.effects.filter((e) => e.kind === 'typhoon').length === 1
      && eng.effects[0].r === 6 && eng.unitById.get(940).hp < 500
      && eng.unitById.get(941).hp < 500,
  },
  // ---- S10：超武双神力（plasmaCannon dmg 默认 90 + x0/y0 钳位 + ttl round 域 +
  //        statPlasmas；annihilationLight colorHex '#ff4d4d' + statAnnihilations）----
  {
    key: 'plasma-annihilate', baseSeed: BASE + 10, seed: 0x0C61000A, tickCount: 1000, fill: 'grass',
    calls: [
      { fn: 'applyTool', args: ['plasmacannon', 100, 60] },
      { fn: 'applyTool', args: ['annihilate', 100, 60] },
    ],
    sanity: (eng) => eng.effects.length === 2
      && eng.effects[0].kind === 'plasma' && eng.effects[0].x0 === 93 && eng.effects[0].y0 === 51
      && eng.effects[0].dmg === 90 && eng.effects[0].r === 3.2 && eng.effects[0].ttl === 45
      && eng.effects[1].kind === 'antimatter' && eng.effects[1].x0 === 92 && eng.effects[1].y0 === 49
      && eng.effects[1].ttl === 50
      && eng.statPlasmas === 1 && eng.statAnnihilations === 1
      && eng.worldEvents.some((e) => e.colorHex === '#ff4d4d'),
  },
  // ---- S11：volcano 边缘钳位（(1,1)→cx,cy=2,2 双钳 + 引燃圈 j>=0 显式卫门
  //        （负索引不入 fireSet——lightning OOB 语义对照面）+ 外溢 8 tick）----
  {
    key: 'volcano-edge', baseSeed: BASE + 11, seed: 0x0C61000B, tickCount: 1000, fill: 'grass',
    calls: [{ fn: 'applyTool', args: ['volcano', 1, 1] }],
    ticks: 8,
    sanity: (eng) => eng.terrain[idx(2, 2)] === T.LAVA && eng.terrain[idx(0, 4)] === T.GRASS
      && [...eng.fireSet].every((i) => i >= 0 && i < W * H)
      && eng.effects[0].x === 2.5 && eng.effects[0].y === 2.5,
  },
  // ---- S13：mutate civ 面（u960 giant 旧特质 reroll 0.3 HIT 旧乘数卸除/新乘数上装 +
  //        0.25 jumpGene(0.12) HIT job2 战士乘数重算；u961 reroll MISS + jump HIT
  //        且 ≥1 维门 MISS〔{1,1,1,1} 起步 miss 维恒等 1 钉面〕；u962 dead skip
  //        零掷；u963 界外 skip）——种子标定 0x00000144（probe-mutate-seed.mjs）----
  {
    key: 'mutate-civ-reroll', baseSeed: BASE + 13, seed: 0x00000144, tickCount: 1000, fill: 'grass',
    units: [
      { id: 960, race: R.HUMAN, x: 99.5, y: 60, hp: 200, maxHp: 200, trait: 'giant', job: 2 },
      { id: 961, race: R.HUMAN, x: 101, y: 60.5, hp: 60, maxHp: 60 },
      { id: 962, race: R.SHEEP, x: 100, y: 59, hp: 16, maxHp: 16, dead: 1 },
      { id: 963, race: R.HUMAN, x: 112, y: 60, hp: 60, maxHp: 60 },   // d=12 > r=3 界外
    ],
    calls: [{ fn: 'applyTool', args: ['mutate', 100, 60] }],
    sanity: (eng) => {
      const a = eng.unitById.get(960), b = eng.unitById.get(961), dd = eng.unitById.get(962), oor = eng.unitById.get(963);
      return typeof a.trait === 'string' && a.trait !== 'giant' && a.gene
        && (b.trait === 0 || b.trait === null) && b.gene
        && [b.gene.s, b.gene.d, b.gene.h, b.gene.r].some((v) => v === 1)
        && dd.gene === null && dd.hp === 16 && oor.gene === null && oor.hp === 60
        && eng.effects.filter((e) => e.kind === 'mutate').length === 2;
    },
  },
  // ---- S14：mutate wild 面 3 连发（u970 preset gene 直 jumpGene(0.2)；u971 空表
  //        baseGene 零掷〔speciesBase 演化域未译恒空——蓝本 L11029-11031〕；u972
  //        wolf 捕食者 RACES 重算；3 单位 × 3 连发后至少 1 维恰触铛位 0.5/2——
  //        Math.max/min 恰等面）——种子标定 0x00000027----
  {
    key: 'mutate-wild-clamp', baseSeed: BASE + 14, seed: 0x00000027, tickCount: 1000, fill: 'grass',
    units: [
      { id: 970, race: R.SHEEP, x: 100, y: 60, hp: 16, maxHp: 16, gene: { s: 1.3, d: 0.8, h: 1.1, r: 0.9 } },
      { id: 971, race: R.SHEEP, x: 101, y: 60, hp: 16, maxHp: 16 },
      { id: 972, race: R.WOLF, x: 99, y: 60.5, hp: 34, maxHp: 34 },
    ],
    calls: [
      { fn: 'applyTool', args: ['mutate', 100, 60] },
      { fn: 'applyTool', args: ['mutate', 100, 60] },
      { fn: 'applyTool', args: ['mutate', 100, 60] },
    ],
    sanity: (eng) => {
      let clamped = 0;
      for (const id of [970, 971, 972]) {
        const u = eng.unitById.get(id);
        if (!u.gene) return false;
        for (const v of [u.gene.s, u.gene.d, u.gene.h, u.gene.r]) if (v === 0.5 || v === 2) clamped++;
      }
      return clamped >= 1 && eng.effects.filter((e) => e.kind === 'mutate').length === 9;
    },
  },
  // ---- S12：holystorm 消费端 30 tick（游荡 dir + 恒真门 1.2 掷位 + 浇火/洗辐射/
  //        焦土复苏 + 黑暗审判 0.4/tick + 无辜缓愈 0.15 + 驱瘟 fx）----
  {
    key: 'holystorm-ticks', baseSeed: BASE + 12, seed: 0x0C61000C, tickCount: 1000, fill: 'grass',
    terrain: [[100, 63, T.BURNT]],
    fire: [[103, 60, 100]],
    radiate: [[98, 60, 1]],
    units: [
      { id: 950, race: R.DEMON, x: 100.5, y: 60.5, hp: 100, maxHp: 100 },   // 黑暗审判：hp 100→88
      { id: 951, race: R.SHEEP, x: 99, y: 60, hp: 90, maxHp: 100, infected: true },   // 缓愈 90→94.5 + 驱瘟
      { id: 952, race: R.SHEEP, x: 102, y: 61, hp: 100, maxHp: 100 },
    ],
    calls: [{ fn: 'applyTool', args: ['holystorm', 100, 60] }],
    ticks: 30,
    sanity: (eng) => {
      const d = eng.unitById.get(950), s1 = eng.unitById.get(951);
      return Math.abs(d.hp - 88) < 1e-9 && d.hurt === 10 && s1.infected === false
        && Math.abs(s1.hp - 94.5) < 1e-9
        && eng.effects.filter((e) => e.kind === 'holystorm').length === 1;
    },
  },
  // ---- S15（M-U20）：applyTool case "river" runtime 语义（carveRiver L12312-12420 全链：
  //        BFS 绕山 dist 场零掷 + 加权随机选路 1 掷/步 + 刻河 setTerrain 级联〔火墙 9 格
  //        全灭 L997 / regrow 删 L985 / owner 清 L1000-1003〕+ 灌溉 setTerrain〔SAND/BURNT
  //        →GRASS L12403 零掷 + GRASS→FOREST rng<0.05*soilMulAt L12404 1 掷/格〕+ flood
  //        删 L990 + carveLake 湖支不在判据〔hydroTick nature2 链已覆盖 runtime=true〕+
  //        fx spawn 2 掷 + toast id=1 + addEvent）——种子标定 0x00000CE0
  //        （probe-river-seed.mjs——引擎复用 + 走廊扫描 + baseSeed 同源 soilF 派生面；ICE prev===ICE frozen 面 fixture
  //        不可注入由 iceAge/blizzard 切片覆盖）----
  {
    key: 'river-runtime', baseSeed: BASE + 15, seed: 0x000000A0, tickCount: 1000, fill: 'grass',
    terrain: [
      ...rect(0, 52, 5, 68, T.WATER),                  // 西侧水池（入海终点）
      ...rect(12, 59, 14, 61, T.SAND),                 // 绿洲沙地（灌溉 → GRASS）
      [15, 59, T.BURNT], [15, 61, T.BURNT],            // 焦土绿洲支
      [24, 58, T.MOUNTAIN], [24, 62, T.MOUNTAIN],      // 绕山（刻蚀 skip + BFS dist 门）
    ],
    fire: [[18, 60, 100], [18, 59, 100], [18, 61, 100], [19, 60, 100], [19, 59, 100], [19, 61, 100], [17, 60, 100], [17, 59, 100], [17, 61, 100]],   // 3×3 火墙
    regrow: [[20, 60, 1500], [22, 60, 1500], [24, 60, 1500], [20, 62, 1500]],
    owner: [[26, 60, 3], [26, 59, 3]],
    flood: [[18, 58, 2000], [20, 58, 2000]],
    calls: [{ fn: 'applyTool', args: ['river', 30, 60] }],
    sanity: (eng, toasts) => toasts.some((t) => t.text === '一条大河蜿蜒入海')
      && eng.fireSet.size === 0
      && eng.regrow.size < 4
      && (eng.owner[idx(26, 60)] === -1 || eng.owner[idx(26, 59)] === -1)
      && eng.flood.size === 0
      && eng.effects.some((e) => e.kind === 'spawn'),
  },

  // ---- S16 grab-light（M-U21 神之手指：抓取/拖拽/钳位/轻放/未命中五面 + 眩晕衰减链） ----
  //   蓝本 beginGrab L5293-5311（半径 2.2² 最近单位 + dead/boat 跳过 + fx spawn 2 掷 +
  //   grab=6）/ moveGrab L5315-5327（grabId null 早退 + dead 早退 + thrT>0 飞行早退 +
  //   钳位 [0.5,W-0.5]/[0.5,H-0.5] + tx/ty/lx/ly/rx/ry 六字段同步 + grab=6 刷新——零掷）/
  //   endGrab L5330-5347（spd=hypot<0.35 轻放支：grab=10 + thrT=0 + fx dust 2 掷）/
  //   beginGrab 未命中支（grabId=null 返 false 零掷）+ grabbedTick L5349-5390 眩晕递减
  //   （grab-=2 真值门——parity=0 单位每 2 tick 一更：10→8→6→4→2→0 五更恰好清零；
  //   清账支 L5370-5373 else grab<=0 在 unitsTick 主循环不可达〔L3209 门 grab>0 先挡〕——
  //   蓝本防御面，C# 已译挂账）。旁观单位 u2/u3 grab=999 常驻冻结（grabbedTick 零掷早退零 AI
  //   —— SHEEP 游走链 units 域切片挂账）。
  {
    key: 'grab-light', baseSeed: BASE + 16, seed: 0x000000B0, tickCount: 1000, fill: 'grass',
    units: [
      { id: 900, race: R.SHEEP, x: 99.4, y: 59.4, hp: 20, maxHp: 20 },   // 最近（d2=0.02）——链主角（完整眩晕链 10→0）
      { id: 901, race: R.SHEEP, x: 100.2, y: 59.7, hp: 20, maxHp: 20, grab: 999 },  // 次近（d2=0.53——最近选择面）；grab=999 常驻冻结（零 AI 零掷——SHEEP 游走链 units 域切片挂账）
      { id: 902, race: R.SHEEP, x: 101.5, y: 61.5, hp: 20, maxHp: 20, grab: 999 },  // 界外（d2=8 > 4.84=2.2²——半径门）；冻结同上
    ],
    calls: [
      { fn: 'beginGrab', args: [99.5, 59.5] },    // 命中 u1（fx spawn 2 掷 + grabId=900 + grab=6）——u1 d2=0.02 < u2 d2=0.53 最近选择
      { fn: 'moveGrab', args: [101.5, 60.5] },    // 拖拽（六字段同步零掷）
      { fn: 'moveGrab', args: [0.2, 0.3] },       // 钳位支（→ (0.5,0.5) 角落）
      { fn: 'endGrab', args: [0.1, 0.1] },        // 轻放支（spd=0.141<0.35：grab=10 + fx dust 2 掷）
      { fn: 'beginGrab', args: [5, 5] },          // 未命中支（grabId=null 返 false 零掷）
    ],
    ticks: 10, stepUnits: true,                    // 10 tick：奇跳×5 + 偶更×5（眩晕 10→0；u2/u3 grab 999→989 冻结零 AI）
    sanity: (eng, toasts) => eng.grabId == null
      && eng.unitById.get(900).grab === 0
      && eng.unitById.get(900).thrT === 0
      && eng.effects.some((e) => e.kind === 'spawn')
      && eng.effects.some((e) => e.kind === 'dust'),
  },

  // ---- S17 grab-throw（M-U21 神之手指：抛掷全链——thrVx/thrVy 速度分解 + thrT 速度驱动 + 飞行撞山 + 落地伤害/眩晕/尘土/震屏） ----
  //   endGrab L5335-5347 抛掷支：thrVx=vx/spd×min(1.6,spd×0.22) + thrT=8+min(22,round(spd×5))
  //   + grab=thrT+26 + atk=0（零掷）；grabbedTick L5345-5368 飞行：thrT-=2 + 钳位步进×2 +
  //   撞山即坠（MOUNTAIN 门）+ ×0.94 空气阻力 + rng<0.3 dust 1 掷/tick + 落地：dist=hypot
  //   （fdlibm）+ dmg=round(dist×2.6) + hurt=24 + grab=max(grab,24) + dust×3 各 1 掷 +
  //   dmgNumbers fx + shake=max(shake,min(5,1+dist×0.3))。hp=30>dmg≈19 不致死
  //   （unitsReap 未译域零触达——全活 reap 零效应挂账）。
  {
    key: 'grab-throw', baseSeed: BASE + 17, seed: 0x000000C0, tickCount: 1000, fill: 'grass',
    terrain: [
      [105, 62, T.MOUNTAIN], [105, 63, T.MOUNTAIN],   // 撞山墙（预演位——DIAG 校正落点路径）
    ],
    units: [
      { id: 910, race: R.SHEEP, x: 100.5, y: 60.5, hp: 30, maxHp: 30 },
    ],
    calls: [
      { fn: 'beginGrab', args: [100.5, 60.5] },   // d2=0 命中（fx spawn 2 掷）
      { fn: 'moveGrab', args: [101, 60.2] },      // 拖一步（thrX0/Y0 基点同步）
      { fn: 'endGrab', args: [1.4, 1.0] },        // 抛掷支（spd=1.72047 → thrVx≈0.308/thrT=17/grab=43 零掷）
    ],
    ticks: 42, stepUnits: true,                    // 42 tick：飞行 17 更（34 tick）+ 落地眩晕至 grab=3（probe 实证 tick44 清零 tick46 AI 起动——42 截断在 AI 触达前，SHEEP 游走链 units 域切片挂账）
    sanity: (eng) => eng.unitById.get(910).thrT === 0
      && eng.unitById.get(910).hp < 30
      && eng.unitById.get(910).hp > 0
      && eng.shake > 0,   // fx 到期面：60 tick > dust ttl——fx 链由 stepsSnap 每步快照对账（终态 effects 空）
  },

  // ---- S18 finger-tool（M-U21 applyTool case 'finger' 分发接线——蓝本 L13373-13375） ----
  //   case 'finger' → beginGrab(wx,wy) 直调面（返回值丢弃——case 无消费）；命中 fx spawn 2 掷。
  {
    key: 'finger-tool', baseSeed: BASE + 18, seed: 0x000000D0, tickCount: 1000, fill: 'grass',
    units: [
      { id: 920, race: R.SHEEP, x: 100.5, y: 60.5, hp: 20, maxHp: 20 },
    ],
    calls: [{ fn: 'applyTool', args: ['finger', 100.5, 60.5] }],
    ticks: 4, stepUnits: true,                     // 4 tick：奇跳 + 偶更×2（grab 6→4→2）+ 奇跳
    sanity: (eng) => eng.effects.some((e) => e.kind === 'spawn')
      && eng.unitById.get(920).grab > 0,
  },

  // ---- S19 reap-basic（M-U22 unitsReap L3321-3472 常规收尸全链：skull fx + 血泊尸骸 +
  //        肉掉落 0.85 门 + 武器缴获 0.35 门 + civ pop--/family members-- + bumpWild +
  //        unitById.delete + pop-swap——三 dead 夹具逆序环）----
  //   蓝本支序（每单位）：zombie 门短路零掷（infected false）→ king false → PHOENIX/HYDRA
  //   skip → collectUnitDead 挂账 no-op → civ pop-- → family members-- → fx skull 46（2 掷）
  //   → 商队 0 → 尸骸残留（SANDWORM 才 skip——corpse 零掷 + blood seed 1 掷）→ 肉门 0.85
  //   （civ skip 零掷）→ 腐食门 isHerbivore（wolf/pig 均非 herbivore——SHEEP 才触发）→
  //   items<170 三连掉落门（wep 0.35 / boss 0.5 / wild 0.05）→ delete+bumpWild+pop-swap。
  {
    key: 'reap-basic', baseSeed: BASE + 19, seed: 0x000000E5, tickCount: 1000, fill: 'grass',   // 种子标定 229（probe：wep 0.35 HIT + meat HIT + 三 blood）
    units: [
      { id: 930, race: R.HUMAN, x: 100, y: 60, hp: 50, maxHp: 50, civ: 0, wep: 'sword1', fam: 1 },
      { id: 931, race: R.WOLF, x: 104, y: 60, hp: 34, maxHp: 34 },
      { id: 932, race: R.PIG, x: 108, y: 60, hp: 12, maxHp: 12 },
    ].map((u) => ({ ...u, dead: 1 })),
    civs: [{ id: 0, name: '国A', colorHex: '#d9a066', alive: true, stability: 70, kingId: null, kingName: null, pop: 10 }],
    families: [[1, { members: 3 }]],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => eng.units.length === 0 && eng.civs[0].pop === 9
      && eng.families.get(1).members === 2
      && eng.items.some((it) => it.kind === 'sword1')
      && eng.items.some((it) => it.kind === 'meat')
      && eng.corpses.length === 3 && eng.blood.length === 3,
  },

  // ---- S20 reap-zombie（M-U22 僵尸病毒尸变 L3325-3329：infected + zombieVirus 法则 +
  //        非 undead/aquatic/flying + rng<0.35 门 → zombify L4323 原地转种 continue——
  //        MISS 支走常规收尸对照；种子标定 u941（逆序先掷）MISS ≥0.35 / u940 HIT <0.35）----
  {
    key: 'reap-zombie', baseSeed: BASE + 20, seed: 0x000000CB, tickCount: 1000, fill: 'grass',   // 种子标定 203（u941 逆序先摊 MISS ≥0.35 → 常规收尸；u940 HIT <0.35 → zombify）
    units: [
      { id: 940, race: R.HUMAN, x: 100, y: 60, hp: 50, maxHp: 50, dead: 1, infected: true },
      { id: 941, race: R.SHEEP, x: 104, y: 60, hp: 16, maxHp: 16, dead: 1, infected: true },
    ],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => {
      const z = eng.unitById.get(940);
      return z && z.race === R.ZOMBIE && z.dead === false && z.maxHp === 46 && z.hp === 40
        && z.infected === false && z.speed === 0.05 && !eng.unitById.get(941)
        && eng.effects.some((e) => e.kind === 'spawn');
    },
  },

  // ---- S21 reap-king（M-U22 王权驾崩 L3331-3332 → onKingDeath L1675-1686：kingId -1 +
  //        stability 52 + 纪事 + toast danger——国王照常走常规收尸（pop-- 不 repeat））----
  {
    key: 'reap-king', baseSeed: BASE + 21, seed: 0x000000C8, tickCount: 1000, fill: 'grass',   // 种子标定 200（civ 三连掉落门全 skip——draws 3 = skull fx 2 + blood seed 1）
    units: [{ id: 950, race: R.HUMAN, x: 100, y: 60, hp: 50, maxHp: 50, civ: 0, king: 1, dead: 1 }],
    civs: [{ id: 0, name: '国A', colorHex: '#d9a066', alive: true, stability: 70, kingId: 950, kingName: '王甲', pop: 10 }],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng, toasts) => eng.civs[0].kingId === -1 && eng.civs[0].stability === 52
      && eng.civs[0].pop === 9 && eng.worldEvents.some((e) => e.kind === 'king')
      && toasts.some((t) => t.tone === 'danger'),
  },

  // ---- S22 reap-phoenix（M-U22 凤凰涅槃 L3334-3348：rebirths<3 → ash push（ashTtl 240
  //        非冬 / season 3 → round(240*1.5)=360）+ 纪事 + smoke fx + delete+bumpWild+pop-swap
  //        continue（无 skull 无血泊）；rebirths>=3 火种熄灭纪事 → 落常规收尸对照。
  //        PhoenixAshTick 消费面（L13018）挂账凤凰重生切片——push 面字段只加）----
  {
    key: 'reap-phoenix', baseSeed: BASE + 22, seed: 0x000000C8, tickCount: 1000, fill: 'grass',   // 种子标定 200（ash push 面 + 熙灭常规收尸对照——draws 14）
    units: [
      { id: 960, race: R.PHOENIX, x: 100, y: 60, hp: 200, maxHp: 200, dead: 1, rebirths: 0 },
      { id: 961, race: R.PHOENIX, x: 106, y: 60, hp: 200, maxHp: 200, dead: 1, rebirths: 3 },
    ],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => eng.phoenixAshes.length === 1
      && eng.phoenixAshes[0].t === 238 && eng.phoenixAshes[0].rebirths === 1   // M-U23：步进通道 L2606 门首 tick 即倒数 240→238（零掷——phoenixAshTick t>0 continue）
      && eng.phoenixAshes[0].x === 100 && eng.phoenixAshes[0].y === 60
      && !eng.unitById.get(960)
      && eng.worldEvents.filter((e) => e.kind === 'phoenix').length === 2,
  },

  // ---- S23 reap-hydra（M-U22 九头蛇斩首分裂 L3352-3391：gen<2 + seared 门（fire>0 ||
  //        terrain LAVA）→ 双幼蛇 spawnUnit silent（-1.3,0.5)/(1.3,-0.5) + gen+1 +
  //        maxHp round(46*0.6)=28 + 纪事 born.length 文案 + smoke/blood fx + shake 3 +
  //        delete+bumpWild+pop-swap continue；gen>=2 真终焉纪事；seared 烈焰烧灼纪事——
  //        u972 站 LAVA（fire 夹具会被 fireTick 蔓延——LAVA 静态位面））----
  {
    key: 'reap-hydra', baseSeed: BASE + 23, seed: 0x00000120, tickCount: 1000, fill: 'grass',
    terrain: [[112, 60, T.LAVA]],
    units: [
      { id: 970, race: R.HYDRA, x: 100, y: 60, hp: 46, maxHp: 46, dead: 1, gen: 0 },
      { id: 971, race: R.HYDRA, x: 106, y: 60, hp: 46, maxHp: 46, dead: 1, gen: 2 },
      { id: 972, race: R.HYDRA, x: 112, y: 60, hp: 46, maxHp: 46, dead: 1, gen: 0 },
    ],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => eng.worldEvents.some((e) => e.kind === 'hydra' && e.text.includes('萌发出 2 条'))
      && eng.worldEvents.some((e) => e.kind === 'hydra' && e.text.includes('最后一颗头颅'))
      && eng.worldEvents.some((e) => e.kind === 'hydra' && e.text.includes('烈焰烧灼'))
      && eng.shake >= 3
      && eng.unitById.get(970) === undefined && eng.unitById.get(971) === undefined && eng.unitById.get(972) === undefined
      && eng.units.length === 2
      && eng.units.every((u) => u.race === R.HYDRA && u.gen === 1 && u.maxHp === 300 && u.hp === 300),  // 幼蛇 maxHp=round(500*0.6)=300（RACES.HYDRA.hp=500 基数——L192）
  },

  // ---- S24 reap-loot（M-U22 掉落链 + 腐食回充 + 商队降温：TROLL boss 0.5 门 chest2
  //        rollChestItem→rollItem（ALL_ITEMS rarity 1-4 权重池 1 掷）+ loot 纪事；
  //        wolf wep 0.35 门 HIT → dropItem(wep)；SHEEP 0.05 门 MISS；scav L3427-3443
  //        isHerbivore 死者 r=6 内最饿捕食者 food += 55+round(maxHp*0.5)（u983 maxHp12 →
  //        u984 food 30+55+6=91）；caravan 支 L3400-3406 rel -6 + trade 纪事。
  //        逆序环序：u985 先（rel）→ u984 活跳过 → u983 scav → u982 → u981 → u980）----
  {
    key: 'reap-loot', baseSeed: BASE + 24, seed: 0x000000CF, tickCount: 1000, fill: 'grass',   // 种子标定 207（boss 0.5 HIT + wep 0.35 HIT + 0.05 双 MISS + scav 91）
    units: [
      { id: 980, race: R.TROLL, x: 100, y: 60, hp: 120, maxHp: 120, dead: 1 },
      { id: 981, race: R.WOLF, x: 106, y: 60, hp: 34, maxHp: 34, dead: 1, wep: 'axe1' },
      { id: 982, race: R.SHEEP, x: 110, y: 60, hp: 12, maxHp: 12, dead: 1 },
      { id: 983, race: R.SHEEP, x: 101.5, y: 60.5, hp: 12, maxHp: 12, dead: 1 },
      { id: 984, race: R.WOLF, x: 102, y: 60, hp: 40, maxHp: 40, food: 30 },
      { id: 985, race: R.HUMAN, x: 116, y: 60, hp: 50, maxHp: 50, civ: 0, dead: 1, caravan: 1 },
    ],
    civs: [
      { id: 0, name: '国A', colorHex: '#d9a066', alive: true, stability: 70, kingId: null, kingName: null, pop: 10 },
      { id: 1, name: '国B', colorHex: '#9ad06a', alive: true, stability: 70, kingId: null, kingName: null, pop: 8 },
    ],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => {
      const dropped = eng.items.map((it) => it.kind);
      return dropped.includes('axe1')
        && dropped.some((k) => k !== 'meat' && k !== 'axe1')   // chest2 rollChestItem 掉落
        && eng.worldEvents.some((e) => e.kind === 'loot')
        && eng.worldEvents.some((e) => e.kind === 'trade')
        && eng.rel.get('0-1') === -6
        && eng.unitById.get(984).food === 91                    // scav：30+55+round(12*0.5)
        && eng.civs[0].pop === 9
        && eng.civs[1].pop === 8;
    },
  },

  // ---- S25 phoenix-rebirth（M-U23 phoenixAshTick L13018-13032 消费面成功支：灰烬倒数
  //        a.t-=2 节拍〔1 tick=2 单位〕len>0 门每 tick → 到点 splice → spawnUnit(PHOENIX,
  //        silent) 重生体继承 rebirths + fx spawn 46 / fireball y-1 30 双 fx + toast info +
  //        addEvent phoenix 纪事；onSound 宿主 no-op）----
  //   窗口设计：tickCount 1005→4 tick（1006-1009）——L2534-2606 间门位全空零效应（decals/fp
  //   %2 空贴花、angelAura %3 单位空、checkTriggers/lich %8/%12 尸体空——探针三步零掷实证）；
  //   ash t=8 → tick1-3 倒数 6/4/2 零掷，tick4 恰到点重生；重生体 maxHp=round(200)=200
  //   （RDEF hp 200 / baseGene 空表零掷 {1,1,1,1}）/ parity=unitSeq%2 尾 dump 位级锚。）----
  {
    key: 'phoenix-rebirth', baseSeed: BASE + 25, seed: 0x00000130, tickCount: 1005, fill: 'grass',
    ashes0: [{ x: 100, y: 60, t: 8, rebirths: 1 }],
    ticks: 4, stepUnits: true, stepAsh: true, reapDump: true,
    sanity: (eng, toasts) => eng.phoenixAshes.length === 0 && eng.units.length === 1
      && eng.units[0].race === R.PHOENIX && eng.units[0].rebirths === 1
      && eng.units[0].maxHp === 200 && eng.units[0].hp === 200
      && eng.effects.some((e) => e.kind === 'spawn') && eng.effects.some((e) => e.kind === 'fireball')
      && eng.worldEvents.filter((e) => e.kind === 'phoenix').length === 1
      && toasts.some((t) => t.text === '凤凰在灰烬中重生了' && t.tone === 'info'),
  },

  // ---- S26 phoenix-rebirth-cap（null 支：wildCount 手术注入 900 ≥ MAX_WILDLIFE →
  //        spawnUnit L1298-1300 预算门 return null〔先于 trait 掷 L1322〕→ 无重生体；
  //        fx spawn/fireball + toast + addEvent 照常（L13026-13030 在 if(nu) 外）——
  //        种族上限防御分支：spawnUnit null = 凤凰这次涅槃折戟，但仪式烟火依旧）----
  {
    key: 'phoenix-rebirth-cap', baseSeed: BASE + 26, seed: 0x00000131, tickCount: 1005, fill: 'grass',
    ashes0: [{ x: 104, y: 58, t: 8, rebirths: 2 }],
    wild0: [[R.SHEEP, 900]],
    ticks: 4, stepUnits: true, stepAsh: true, reapDump: true,
    sanity: (eng, toasts) => eng.units.length === 0 && eng.phoenixAshes.length === 0
      && eng.effects.some((e) => e.kind === 'spawn') && eng.effects.some((e) => e.kind === 'fireball')
      && eng.worldEvents.filter((e) => e.kind === 'phoenix').length === 1
      && toasts.some((t) => t.text === '凤凰在灰烬中重生了'),
  },

  // ---- S27 ent-grove（M-U24 树人播种 L13055-13097 成功支全分支：①播种 2 采样/树人——
  //        ang/rr 2 掷 + 地形门掷〔GRASS 0.22pm/BURNT 0.45pm/SAND 0.06pm 短路 || 各一掷——
  //        pm=1.3 春播 yearF0.5 season0〕+ 界外 j 门 skip（u902 边缘 MOUNTAIN 盘）+ 建筑
  //        门 skip（u901 全建筑盘——任意落点必建筑格零掷 skip）+ setTerrain(FOREST) 级联 +
  //        planted++ + spark fx ≤6；②扑火 r=2.5（dx²+dy²≤6.25 环——fireSet 删 + water fx）；
  //        声门 planted>0 && rng<0.35 掷位保留（onSound 宿主 no-op——掷位不丢）。
  //        fire 夹具 3 格在 r=2.5 内——fireTick 先行 1 掷/格（蔓延门）确定链。）----
  {
    key: 'ent-grove', baseSeed: BASE + 27, seed: 0x00000142, tickCount: 1009, fill: 'grass',   // 种子标定 0x00000142（TOOL3_PROBE 真环境钩子：oob=1 界外支〔u902 落 (-2,0)〕/ bldSkip=1 建筑门〔u901 落 (108,65)〕/ spark=2 / forests=2 / 扑火 waterFx=4 / 声门掷位——全判据 HIT）
    yearF: 0.5, season0: 0,                                                                    // season 0 春播 pm=1.3（nature.season getter yearF/2 %4 派生）
    terrain: [
      [97, 59, T.BURNT], [98, 59, T.BURNT], [98, 60, T.BURNT],                                 // 焦土patch（0.45×1.3=0.585 高命中门）
      [103, 60, T.SAND], [103, 61, T.SAND],                                                    // 沙地patch（0.06×1.3=0.078 低命中门）
    ],
    building: [
      [108, 62, 1], [109, 62, 1], [110, 62, 1], [111, 62, 1], [112, 62, 1], [113, 62, 1],      // u901 (110,64) r=3.5 全建筑盘——任意采样落点必建筑格（skip 分支确定性覆盖）
      [108, 63, 1], [109, 63, 1], [110, 63, 1], [111, 63, 1], [112, 63, 1], [113, 63, 1],
      [108, 64, 1], [109, 64, 1], [111, 64, 1], [112, 64, 1], [113, 64, 1],
      [108, 65, 1], [109, 65, 1], [110, 65, 1], [111, 65, 1], [112, 65, 1], [113, 65, 1],
      [108, 66, 1], [109, 66, 1], [110, 66, 1], [111, 66, 1], [112, 66, 1], [113, 66, 1],
    ],
    fire: [[99, 59, 40], [100, 59, 40], [101, 59, 40]],                                        // 火墙 3 格（r=2.5 内——fireTick 1 掷/格先行 + 扑火 extinguish）
    units: [
      { id: 900, race: R.ENT, x: 100, y: 60, hp: 320, maxHp: 320, grab: 999 },                 // 主树人（播种+扑火）——grab 999 冻结零 AI
      { id: 901, race: R.ENT, x: 110, y: 64, hp: 320, maxHp: 320, grab: 999 },                 // 建筑盘树人（L13068 skip 支）
      { id: 902, race: R.ENT, x: 1, y: 1, hp: 320, maxHp: 320, grab: 999 },                    // 边缘树人（L13067 j<0 界外 skip 支——盘内 MOUNTAIN 走填充? 填充 grass——界外支 probe 标定）
    ],
    ticks: 1, stepUnits: true, reapDump: true,                                                 // tick 1010：%10===0 grove 门 / %12=2 lich 门不触 / %30=20 hydra 门不触
    sanity: (eng) => {
      const forests = [...eng.terrain.keys()].filter((i) => eng.terrain[i] === T.FOREST).length;
      return eng.unitById.get(900).hp === 320
        && eng.terrain[idx(100, 59)] === T.GRASS && eng.terrain[idx(101, 59)] === T.GRASS      // 火墙底格未成林（火格 skip——GRASS 门 0.286 可 HIT 但非判据……判据用 fx/fire 面）
        && [...eng.fireSet].every((i) => ![[99, 59], [100, 59], [101, 59]].some(([x, y]) => idx(x, y) === i))   // 火墙 3 格全灭（扑火 L13087-13089）
        && eng.effects.filter((e) => e.kind === 'water').length >= 3                           // 扑火 water fx ≥3（每灭格 1 fx）
        && eng.effects.some((e) => e.kind === 'spark')                                         // 播种 spark fx（planted ≥1）
        && forests >= 1                                                                        // 成林 ≥1（setTerrain FOREST 级联）
        && eng.terrain[idx(1, 1)] === T.GRASS;                                                 // u902 盘内未整盘异变（界外/采样落点确定链——非判据仅哨兵）
    },
  },

  // ---- S28 grove-winter（M-U24 冬蛰支 L13061 sn===3：播种整支 skip——采样 2 掷/树人零触
  //        （掷流仅 fireTick 蔓延门），planted=0 → 声门零掷（L13096 planted>0 门假短路）；
  //        ②扑火照常（四季在岗不辍）+ 九头蛇冬眠 L13039 season===3 return（hp 恒）。
  //        yearF 6.5 → season 3（派生 getter floor(6.5/2)%4=3）——lichRaise 门 %8 面同窗
  //        （tick 1010 %8=2 不触——%8 节律面 S29 同构挂账注记）。）----
  {
    key: 'grove-winter', baseSeed: BASE + 28, seed: 0x00000141, tickCount: 1009, fill: 'grass',
    yearF: 6.5, season0: 3,                                                                    // 冬季（寒潮：树人蛰伏 + 九头蛇冬眠）
    fire: [[99, 59, 40], [100, 59, 40], [101, 59, 40]],                                        // 火墙照常扑灭（扑火不识季节）
    units: [
      { id: 905, race: R.ENT, x: 100, y: 60, hp: 320, maxHp: 320, grab: 999 },
      { id: 906, race: R.HYDRA, x: 106, y: 60, hp: 100, maxHp: 300, hurt: 5, grab: 999 },      // 冬眠支：hp 恒 100（L13039 return 早退）
    ],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => {
      const forests = [...eng.terrain.keys()].filter((i) => eng.terrain[i] === T.FOREST).length;
      return eng.unitById.get(906).hp === 100                                                  // 冬眠：九头蛇回血零触
        && eng.unitById.get(906).hurt === 4                                                    // hurtN 递减照常（updateUnit 前奏——grab 冻结不挡 hurt--）
        && [...eng.fireSet].every((i) => ![[99, 59], [100, 59], [101, 59]].some(([x, y]) => idx(x, y) === i))   // 扑火照常
        && eng.effects.filter((e) => e.kind === 'water').length >= 3
        && forests === 0;                                                                      // 冬蛰：零成林
    },
  },

  // ---- S29 lich-raise（M-U24 巫妖复生 L13105-13131 成功支：骷髅计数 ≤40 门 + 尸体
  //        r=4 最陈旧选择——stone skip（c2 d²=1 age9 石像封魂）/ 界外 d²>16 skip（c3 age30
  //        最陈而不可达）/ best=c4（age12 eligible 最陈——d²=5）+ spawnUnit(SKELETON,silent)
  //        6 掷链（trait MISS/maxAge/flip/breath/名 FIRST[16]/family MISS）+ splice 尸体 +
  //        fx skull y-1 26 / smoke 16 + addEvent lich（events<3 门首掷）。yearF 2.5 season1
  //        → %12 节律（非冬）——tick 1032 %12===0 / %10=2 grove 不触 / %30=12 hydra 不触。）----
  {
    key: 'lich-raise', baseSeed: BASE + 29, seed: 0x00000142, tickCount: 1031, fill: 'grass',
    corpses0: [
      { x: 101, y: 60, age: 5, stone: false, undead: false },    // c1 eligible d²=1 age5
      { x: 99, y: 60, age: 9, stone: true, undead: false },      // c2 石像 skip（若无 stone 支将胜 c1——分支判据钉面）
      { x: 106, y: 60, age: 30, stone: false, undead: false },   // c3 d²=36>16 界外（最陈而不可达）
      { x: 98, y: 61, age: 12, stone: false, undead: true },     // c4 BEST（eligible 最陈——d²=4+1=5）
    ],
    units: [
      { id: 910, race: R.LICH, x: 100, y: 60, hp: 260, maxHp: 260, grab: 999 },                  // 巫妖（grab 999 冻结零 AI）
    ],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => {
      const sk = eng.units.find((u) => u.race === R.SKELETON);
      return sk && sk.x === 98 && sk.y === 61 && sk.maxHp === 55                                 // 骷髅生于 c4 位（maxHp=round(55×1)=55——baseGene 空表零掷）
        && eng.corpses.length === 3                                                              // c4 splice 摘除
        && !eng.corpses.some((c) => c.age === 12)                                                // 摘除面：age12 尸体不在账
        && eng.corpses.some((c) => c.stone) && eng.corpses.some((c) => c.age === 30)             // 石像/界外尸体保留
        && eng.effects.some((e) => e.kind === 'skull') && eng.effects.some((e) => e.kind === 'smoke')
        && eng.worldEvents.filter((e) => e.kind === 'lich').length === 1;
    },
  },

  // ---- S30 lich-cap（M-U24 骷髅上限门 L13106-13108：41 骷髅 >40 → 顶层 return——
  //        尸体保留零掷零效应（军团节制防刷穿）。零火零 fx——minDraws 0 纯零掷铁证。）----
  {
    key: 'lich-cap', baseSeed: BASE + 30, seed: 0x00000143, tickCount: 1031, fill: 'grass',
    corpses0: [{ x: 100, y: 61, age: 3, stone: false, undead: false }],
    units: [
      ...Array.from({ length: 41 }, (_, i) => ({ id: 920 + i, race: R.SKELETON, x: 90 + (i % 9) * 2, y: 50 + ((i / 9) | 0) * 2, hp: 55, maxHp: 55, grab: 999 })),
      { id: 970, race: R.LICH, x: 100, y: 60, hp: 260, maxHp: 260, grab: 999 },
    ],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => eng.corpses.length === 1                                                  // 尸体保留（L13108 return——下轮再试）
      && eng.units.length === 42 && eng.units[41].race === R.LICH
      && eng.effects.length === 0 && eng.worldEvents.length === 0,
  },

  // ---- S31 hydra-regen（M-U24 九头蛇回血 L13038-13047：季节门非冬通过 + hp<maxHp 支
  //        hp=min(maxHp, hp+maxHp×0.02)=106（300×0.02=6.0 f64 精确）+ hurt=0 双写面 +
  //        满血支 hp>=maxHp 跳过（hurt 递减照常）+ 非九头蛇 skip（SHEEP hp/hurt 不回）。
  //        tick 1050 %30===0 hydra 门 / %10=0 grove 门触（无树人零效应零掷）/ %12=6 lich
  //        门不触。u.dead 支通道不可达注记：unitsReap 先于门摘净死单位（同 tick 序）。）----
  {
    key: 'hydra-regen', baseSeed: BASE + 31, seed: 0x00000144, tickCount: 1049, fill: 'grass',
    units: [
      { id: 975, race: R.HYDRA, x: 100, y: 60, hp: 100, maxHp: 300, hurt: 5, grab: 999 },      // 伤蛇：回血 100→106 + hurt 5→4（前奏递减）→0（L13044）
      { id: 976, race: R.HYDRA, x: 106, y: 60, hp: 300, maxHp: 300, hurt: 0, grab: 999 },      // 满血：hp>=maxHp 门假——hurt 恒 0
      { id: 977, race: R.SHEEP, x: 110, y: 60, hp: 6, maxHp: 16, hurt: 3, grab: 999 },         // 非九头蛇：skip（hurt 3→2 前奏递减照常）
    ],
    ticks: 1, stepUnits: true, reapDump: true,
    sanity: (eng) => eng.unitById.get(975).hp === 106 && eng.unitById.get(975).hurt === 0      // 回血位级（+6.0 f64 精确）+ 再生不残留受创
      && eng.unitById.get(976).hp === 300                                                      // 满血不触
      && eng.unitById.get(977).hp === 6 && eng.unitById.get(977).hurt === 2                    // 非九头蛇不回血（hurt 前奏递减照常）
      && eng.effects.length === 0,
  },

  // ---- S32 beach-wander（M-U25 beachedAquaticTick L12652-12753 水中游走 + 搁浅窒息两支：
  //        u980 池内鱼——非捕食者 L12722 逐 tick 清空 beachTx → L12723 门恒真逐 tick 重采样
  //        （far 门 0.25 1 掷 + 8 试实体水 wn≥6/9 含自身——末 tick 全 miss 则终态 beachTx
  //        undefined 自然覆盖）+ tx/ty 断言（成功 tick 写入后保持）；u981 陆上鱼——beachT
  //        逐 tick +1 + hurt≥2 + findWaterNear(16) 归海导向（零掷纯扫描）+ 1015 tick 窒息
  //        终局 dead〔beachT 冻结 15〕；u982 蟹——aquatic+beach 双旗 skip 铁证；u983 死鱼
  //        skip；u984 池内逃亡鱼 fleeT>0——让位内核零掷；1007/1017 predatorHunt 门触但
  //        无捕食者纯读零效应（preyAlive=3≤25 禁猎线注记））----
  {
    key: 'beach-wander', baseSeed: BASE + 32, seed: 0x00000150, tickCount: 1000, fill: 'grass',
    terrain: [...rect(108, 54, 113, 59, T.DEEP)],
    units: [
      { id: 980, race: R.FISH, x: 109.5, y: 56.5 },                        // 池内鱼：游走采样主角
      { id: 981, race: R.FISH, x: 100, y: 60 },                            // 陆上鱼：搁浅窒息 + findWaterNear 归海
      { id: 982, race: R.CRAB, x: 100, y: 62 },                            // 蟹：beach 两栖 skip（零写面）
      { id: 983, race: R.FISH, x: 100, y: 64, dead: 1 },                   // 死鱼：dead skip
      { id: 984, race: R.FISH, x: 110.5, y: 57.5, fleeT: 5 },              // 逃亡鱼：fleeT>0 让位内核（tx 恒 = x）
    ],
    ticks: 22, stepBeach: true,
    sanity: (eng) => {
      const u980 = eng.unitById.get(980), u981 = eng.unitById.get(981), u982 = eng.unitById.get(982), u984 = eng.unitById.get(984);
      return (u980.tx !== u980.x || u980.ty !== u980.y)                             // 游走采样成功史（tx 保持末次成功值——末 tick 全 miss 亦保持）
        && u981.dead && u981.beachT === 15 && u981.hurt >= 2                              // 窒息终局（1015 tick——引擎置 true）+ 挣扎受伤
        && u981.beachTx !== undefined                                                    // 归海导向已指向水域（搁浅支不清——与游走支对照）
        && u982.beachT === undefined && u982.tx === 100 && u982.ty === 62                // 蟹零写面铁证
        && u984.tx === 110.5 && u984.ty === 57.5 && u984.beachTx === undefined           // 逃亡让位：tx/ty 不被引擎覆写
        && eng.units.length === 5;
    },
  },

  // ---- S33 shark-targets（M-U25 beachedAquaticTick 捕食者猎游支 L12662-12721：粘性目标 ≤40 格
  //        d²≤1600 + 散签初选（cands 排序 top6 抽签 1 掷）+ 逐 tick units.find 坐标刷新（零掷）+
  //        1020 retarget 粘性命中零掷 + 陆上鱼排除（isWater 实体水门）+ 搁浅鲨归海 +
  //        逃亡鲨让位；u990 池内鲨 1001 初选 1 掷 → beachTargetId=991 + tx/ty 逐 tick 断言；
  //        u993 陆上鲨搁浅（beachT 计数 + findWaterNear——普查仍计 hungryAqua 位置无关）；
  //        1007 predatorHunt 门触：hungryAqua=2 普查 + preyAlive≤25 禁猎零击杀铁证）----
  {
    key: 'shark-targets', baseSeed: BASE + 33, seed: 0x00000151, tickCount: 1000, fill: 'grass',
    terrain: [...rect(108, 54, 113, 59, T.DEEP)],
    units: [
      { id: 990, race: R.SHARK, x: 109.5, y: 56.5, food: 250 },           // 池内鲨：猎游主角（food 250≤300——S35 出手门前置面）
      { id: 991, race: R.FISH, x: 110.5, y: 57.5 },                       // 池内鱼：唯一合法猎物（实体水门通过）
      { id: 992, race: R.FISH, x: 100, y: 60 },                           // 陆上鱼：猎游候选排除 + 自身搁浅
      { id: 993, race: R.SHARK, x: 100, y: 63, food: 200 },               // 陆上鲨：搁浅支
      { id: 994, race: R.SHARK, x: 111.5, y: 58.5, food: 350, fleeT: 9 }, // 逃亡鲨：让位内核（food 350>300 非饿——出手门跳过面对照）
    ],
    ticks: 22, stepBeach: true,
    sanity: (eng) => {
      const u990 = eng.unitById.get(990), u991 = eng.unitById.get(991), u992 = eng.unitById.get(992), u993 = eng.unitById.get(993), u994 = eng.unitById.get(994);
      return u990.beachTargetId === 991 && u990.tx === u991.x && u990.ty === u991.y      // 粘性目标 + 坐标断言（1020 粘性命中零掷）
        && u991.dead === 0                                                               // 禁猎零击杀
        && u992.beachTargetId === undefined                                              // 陆上鱼非猎游对象（自身搁浅面）
        && u993.beachTx !== undefined                                                    // 搁浅鲨归海导向
        && u994.tx === 111.5 && u994.ty === 58.5                                         // 逃亡让位
        && eng.effects.length === 0;
    },
  },

  // ---- S34 predator-land（M-U25 predatorHuntTick L12764-12833 陆生支全链：preyAlive 普查
  //        （30 > 25 越禁猎线；≤150 减半 tier capLand=4 注记）+ 出手门 45（u970 food 30 出手 /
  //        u971 food 100 跳过）+ 最近猎物严格 <（u961 d≈1.22 命中）+ grab 猎物豁免（u960 最近
  //        d≈0.85 但神明手中之物不捕）+ isCiv 猎物豁免（u972 HUMAN）+ 扑杀即刻进食 +25
  //        （food 30→55）+ 血泊 fx 双掷 + WB.syncDead 镜像；1007 单轮一杀——
  //        killsLand=1 < capLand=4 预算余量注记）----
  {
    key: 'predator-land', baseSeed: BASE + 34, seed: 0x00000152, tickCount: 1000, fill: 'grass',
    units: [
      ...Array.from({ length: 28 }, (_, i) => ({ id: 500 + i, race: R.SHEEP, x: 90 + (i % 7) * 3, y: 70 + ((i / 7) | 0) * 3, hp: 16, maxHp: 16 })),  // 远羊群（d>10 界外）：抬 preyAlive=30 > 25 禁猎线
      { id: 960, race: R.SHEEP, x: 100.8, y: 60.8, grab: 999 },           // 最近羊（d≈0.85）——grab 豁免
      { id: 961, race: R.SHEEP, x: 101.2, y: 60.9, hp: 16, maxHp: 16 },  // 次近羊（d≈1.22 < 1.6）——扑杀目标
      { id: 970, race: R.WOLF, x: 100.2, y: 60.2, hp: 34, maxHp: 34, food: 30 },  // 饿狼：出手（30 ≤ 45）
      { id: 971, race: R.WOLF, x: 104, y: 61, hp: 34, maxHp: 34, food: 100 },     // 饱狼：跳过（100 > 45）
      { id: 972, race: R.HUMAN, x: 106, y: 60, hp: 60, maxHp: 60, civ: 0 },       // 文明单位：isCiv 普查/猎物双豁免
    ],
    ticks: 8,
    sanity: (eng) => {
      const u960 = eng.unitById.get(960), u961 = eng.unitById.get(961), u970 = eng.unitById.get(970), u971 = eng.unitById.get(971);
      return u961.dead && !u960.dead                                                 // 次近羊扑杀 / grab 羊豁免
        && u970.food === 55 && u971.food === 100                                    // 即刻进食 +25 / 饱狼不动
        && eng.effects.length === 1 && eng.effects[0].kind === 'blood'              // 血泊单特效（水花为水生支——S35）
        && eng.units.length === 33;
    },
  },

  // ---- S35 predator-aqua（M-U25 predatorHuntTick 水生支 L12808/L12822-12826：r=14 深海突袭窗
  //        （bd=196）+ hungryAqua 弹性预算（2 饿鲨 → capAqua=4 → ≤150 tier 减半 2 → fishAlive=1
  //        平滑耦合收缩至 1）+ 出手门 300（u982 food 400 跳过）+ 二鲨预算门 killsAqua≥capAqua
  //        skip（u983 零杀铁证）+ 水花双特效（blood + water）+ 扑杀进食 200→225；
  //        u981 鱼死后 u980/u983 粘性目标陈旧保持（1008 非采样窗 tx/ty 恒指旧坐标——
  //        L12716-12717 死亡支 tgt null 不清 beachTx 蓝本语义）；28 羊抬 preyAlive=29 > 25）----
  {
    key: 'predator-aqua', baseSeed: BASE + 35, seed: 0x00000153, tickCount: 1000, fill: 'grass',
    terrain: [...rect(108, 54, 113, 59, T.DEEP)],
    units: [
      ...Array.from({ length: 28 }, (_, i) => ({ id: 500 + i, race: R.SHEEP, x: 130 + (i % 7) * 3, y: 70 + ((i / 7) | 0) * 3, hp: 16, maxHp: 16 })),  // 远羊群（dx≥17 > 14 突袭窗外）：抬 preyAlive
      { id: 980, race: R.SHARK, x: 109.5, y: 56.5, food: 200 },           // 饿鲨：出手（200 ≤ 300）——突袭主角
      { id: 981, race: R.FISH, x: 110.5, y: 57.5 },                       // 池内鱼：唯一水生猎物（d²≈2 < 196）
      { id: 982, race: R.SHARK, x: 111.5, y: 58.5, food: 400 },           // 饱鲨：出手门跳过（400 > 300）
      { id: 983, race: R.SHARK, x: 112.5, y: 55.5, food: 150 },           // 二饿鲨：预算门 skip（killsAqua=1 ≥ capAqua=1）
    ],
    ticks: 8, stepBeach: true,
    sanity: (eng) => {
      const u980 = eng.unitById.get(980), u981 = eng.unitById.get(981), u982 = eng.unitById.get(982), u983 = eng.unitById.get(983);
      return u981.dead                                                              // 深海突袭命中
        && u980.food === 225 && u982.food === 400 && u983.food === 150           // 进食 +25 / 饱鲨不动 / 预算门零杀
        && u980.beachTx === 110.5 && u983.beachTx === 110.5 && u983.tx === 110.5  // 粘性目标陈旧保持（死亡支不清 beachTx）
        && eng.effects.filter((e) => e.kind === 'blood').length === 1
        && eng.effects.filter((e) => e.kind === 'water').length === 1            // 突袭水花（与诞崽水花同语言——S38）
        && eng.units.length === 32;
    },
  },

  // ---- S36 wildlife-rebound（M-U25 wildlifeReboundTick L12840-12989 通用迁徙支：
  //        laws.reproduction 门（默认 true）+ 灭绝名单（wild0 十七族显式——绵羊归零余 16 族
  //        ≥1 → extinct=[SHEEP]）+ 掷签门 ≤0.6 + 加权掷签（单 extinct 1 掷恒中——
  //        ago=MAX_SAFE_INTEGER 权重 5 注记）+ 陆生预算门（wildAlive=80 < 892）+ 140 试
  //        栖息地采样（首试 GRASS 即中 2 掷）+ 奠基者 n=3+⌊rng×3⌋ 只逐只 ±1.5 抖动落位 +
  //        spawnUnit silent 六掷链 + fx spawn + eco 纪事陆生文本「远方的兽群跋涉而来」；
  //        661 = %600===61 唯一触点（%20/%10/%12/%30 全不触零交叉——662 tick 撒羊
  //        beachedAquaticTick 纯读非水生 skip）----
  {
    key: 'wildlife-rebound', baseSeed: BASE + 36, seed: 0x00000154, tickCount: 660, fill: 'grass',
    wild0: wild17(R.SHEEP), wildAll: true,
    ticks: 2,
    sanity: (eng) => eng.units.length >= 3 && eng.units.length <= 5                  // 奠基群 3-5 只
      && eng.units.every((u) => u.race === R.SHEEP && !u.dead)                       // 全为迁徙绵羊
      && (eng.wildCount.get(R.SHEEP) ?? 0) === eng.units.length                     // bumpWild 入账
      && eng.reboundLast.get(R.SHEEP) === 661                                        // 权重表更新
      && eng.effects.length === 1 && eng.effects[0].kind === 'spawn'
      && eng.worldEvents.length === 1 && eng.worldEvents[0].kind === 'eco',
  },

  // ---- S37 rebound-fish（M-U25 wildlifeReboundTick 鱼群撒网支 L12917-12952：灭绝名单唯鱼 +
  //        水生预算门（wildAliveAquatic=15 < 512 分轨）+ 260 试三锚点互距 ≥18（d²≥324）+
  //        每锚 n=2+⌊rng×2⌋ 尾 ±1.25 抖动（j 钳 [0, W*H-1]）+ spawnUnit silent（aquatic 预算
  //        门内）+ fx spawn + eco 纪事水生文本「洋流送来了远方的族群」；全图 DEEP——栖息地门
  //        isW 首试即中；662 tick 撒网鱼群 beachedAquaticTick 首触（beachTx null → 游走采样
  //        3 掷/尾：far 门 + wx/wy 首试即中）----
  {
    key: 'rebound-fish', baseSeed: BASE + 37, seed: 0x00000155, tickCount: 660, fill: 'deep',
    wild0: wild17(R.FISH), wildAll: true,
    ticks: 2,
    sanity: (eng) => {
      const fishes = eng.units.filter((u) => u.race === R.FISH);
      return fishes.length >= 2 && fishes.length <= 9                               // 三锚 × 2-3 尾（锚点采样随机性宽界）
        && eng.units.every((u) => u.race === R.FISH && !u.dead)
        && (eng.wildCount.get(R.FISH) ?? 0) === fishes.length
        && eng.reboundLast.get(R.FISH) === 661
        && eng.effects.length === 1 && eng.effects[0].kind === 'spawn'
        && eng.worldEvents.length === 1;
    },
  },

  // ---- S38 shark-breed（M-U25 sharkBreedTick L12995-13014：种群地板 0<len<8 + 肥鲨
  //        food>220 诞崽 + 8 试落水门（±1.5 抖动钳 [0.5, W-0.5]——首试池内即中）+
  //        spawnUnit silent 六掷链 + 母体食物 -60 妊娠成本（300→240）+ spawn/water 双特效；
  //        973 = %240===13 唯一触点（%20=13 扑杀不触——beachedAquaticTick 先行：池内双鲨
  //        猎游无猎物零掷 + 幼鲨 food 50 不够格 mother find 首个 >220）----
  {
    key: 'shark-breed', baseSeed: BASE + 38, seed: 0x00000156, tickCount: 972, fill: 'grass',
    terrain: [...rect(108, 54, 113, 59, T.DEEP)],
    units: [
      { id: 990, race: R.SHARK, x: 109.5, y: 56.5, food: 300 },          // 肥鲨母体：food 300 > 220
      { id: 991, race: R.SHARK, x: 110.5, y: 57.5, food: 50 },           // 幼鲨：不够格（mother find 跳过）
    ],
    ticks: 1, wildAll: true,
    sanity: (eng) => {
      const mother = eng.unitById.get(990);
      const pups = eng.units.filter((u) => u.id !== 990 && u.id !== 991);
      return pups.length === 1 && pups[0].race === R.SHARK && !pups[0].dead         // 诞崽一只
        && mother.food === 240                                                     // 妊娠成本 -60
        && eng.effects.filter((e) => e.kind === 'spawn').length === 1
        && eng.effects.filter((e) => e.kind === 'water').length === 1              // 诞崽水花
        && (eng.wildCount.get(R.SHARK) ?? 0) === 1;                                // mkUnit 不入账 + pup spawnUnit bump 1
    },
  },

  // ---- S39 rebound-lawsoff（M-U25 wildlifeReboundTick laws 门 L12841：repro 夹具 false →
  //        顶层 return 零掷铁证（rngA = seed 原值）——灭绝名单非空（绵羊归零）但神明闭法
  //        世界静寂；sharkBreed 同门共用注记）----
  {
    key: 'rebound-lawsoff', baseSeed: BASE + 39, seed: 0x00000157, tickCount: 660, fill: 'grass',
    repro: false,
    wild0: wild17(R.SHEEP), wildAll: true,
    ticks: 1,
    sanity: (eng) => eng.units.length === 0 && eng.effects.length === 0
      && (eng.wildCount.get(R.SHEEP) ?? 0) === 0,
  },

  // ---- S40 rebound-miss（M-U25 wildlifeReboundTick 掷签门 L12867：rng>0.6 拒签——1 掷后
  //        return 无迁徙（灭绝名单非空；预算门后置不触）；对照 S36 同构夹具不同种子）----
  {
    key: 'rebound-miss', baseSeed: BASE + 40, seed: 0x00000158, tickCount: 660, fill: 'grass',
    wild0: wild17(R.SHEEP), wildAll: true,
    ticks: 1,
    sanity: (eng) => eng.units.length === 0 && eng.effects.length === 0,
  },

  // ================= M-U27：angelAuraTick L13138-13161 天使光环引擎级通道（槽 45） =================
  //   节律 L2604 %3===0 门；phase=(tickCount/3)|0；相位门 (phase + id*13)%50===0——
  //   窗口 tickCount=1002（spec.tickCount=1001 步1 ++ 触发）phase=334：id≡32 (mod 50) 命中
  //   （13⁻¹≡27 mod 50，id≡16·27≡432≡32）；id=82（82·13=1066，334+1066=1400%50=0）同帧双触发。
  //   治愈门序：dead/o===a → hostile/undead（只渡无辜者）→ hp满&&!infected → d²>12.25（r=3.5²）
  //   → hp<maxHp 支（min(maxHp, hp+max(10, maxHp*0.25)) + bless16）→ infected 支（清 + bless20）
  //   → healed 上限 10 break → 本体 bless34 + onSound('heal')（宿主 no-op 零掷）。
  //   fx 恒 2 掷（seed+dir）；门全确定性（相位/旗/距离）——种子任意无需标定（fx 不入门）。
  // ---- S41 angel-none（零天使：外层环空转——两步零掷零效应，外层纯读面字节零漂移对照）----
  {
    key: 'angel-none', baseSeed: BASE + 41, seed: 0x00000160, tickCount: 1001, fill: 'grass', stepAura: true,
    units: [
      { id: 900, race: R.SHEEP, x: 100.5, y: 60.5, hp: 5, maxHp: 16 },
    ],
    ticks: 2,   // 步1 tickCount=1002 %3=0 触发扫描——无天使零效应
    sanity: (eng) => eng.effects.length === 0 && (eng.rngA >>> 0) === 0x160,
  },
  // ---- S42 angel-phase-miss（相位门拒：id=33 → (334+429)%50=13≠0——受伤羊未愈圈内在场零效应）----
  {
    key: 'angel-phase-miss', baseSeed: BASE + 42, seed: 0x00000161, tickCount: 1001, fill: 'grass', stepAura: true,
    units: [
      { id: 33, race: R.ANGEL, x: 100.5, y: 60.5 },
      { id: 901, race: R.SHEEP, x: 101.5, y: 60.5, hp: 5, maxHp: 16 },
    ],
    ticks: 2,
    sanity: (eng) => eng.effects.length === 0 && eng.units[1].hp === 5 && (eng.rngA >>> 0) === 0x161,
  },
  // ---- S43 angel-heal（治愈支：受伤羊 hp 5→15〔min(16,5+max(10,4))〕bless16 + 满血羊 L13148
  //        skip 不计 healed——healed=1 本体 bless34。draws=4）----
  {
    key: 'angel-heal', baseSeed: BASE + 43, seed: 0x00000162, tickCount: 1001, fill: 'grass', stepAura: true,
    units: [
      { id: 32, race: R.ANGEL, x: 100.5, y: 60.5, hp: 240, maxHp: 240 },
      { id: 902, race: R.SHEEP, x: 101.5, y: 60.5, hp: 5, maxHp: 16 },    // d²=1≤12.25 受伤
      { id: 903, race: R.SHEEP, x: 99.5, y: 60.5, hp: 16, maxHp: 16 },    // 满血无感染 skip
    ],
    ticks: 2,
    sanity: (eng) => eng.units[1].hp === 15 && eng.units[2].hp === 16 && eng.effects.length === 2,
  },
  // ---- S44 angel-infected（清瘟支：满血感染羊 L13148 不 continue〔infected 门〕→ hp满不治血、
  //        infected 清 false + bless20——healed=1 本体 bless34。draws=4）----
  {
    key: 'angel-infected', baseSeed: BASE + 44, seed: 0x00000163, tickCount: 1001, fill: 'grass', stepAura: true,
    units: [
      { id: 32, race: R.ANGEL, x: 100.5, y: 60.5 },
      { id: 904, race: R.SHEEP, x: 100.5, y: 62.5, hp: 16, maxHp: 16, infected: true },   // d²=4
    ],
    ticks: 2,
    sanity: (eng) => eng.units[1].infected === false && eng.units[1].hp === 16 && eng.effects.length === 2,
  },
  // ---- S45 angel-both（双支同体：受伤+感染 → bless16〔hp 4→14〕+ bless20 连发——draws=6）----
  {
    key: 'angel-both', baseSeed: BASE + 45, seed: 0x00000164, tickCount: 1001, fill: 'grass', stepAura: true,
    units: [
      { id: 32, race: R.ANGEL, x: 100.5, y: 60.5 },
      { id: 905, race: R.SHEEP, x: 100.5, y: 61.5, hp: 4, maxHp: 16, infected: true },    // d²=1
    ],
    ticks: 2,
    sanity: (eng) => eng.units[1].hp === 14 && eng.units[1].infected === false && eng.effects.length === 3,
  },
  // ---- S46 angel-skip（三门拒：hostile〔DRAGON L13147〕/ undead〔ZOMBIE〕/ 圈外 d²=25>12.25
  //        〔感染羊不治不净——距离门在 infected 支前〕——healed=0 无本体 fx。draws=0）----
  {
    key: 'angel-skip', baseSeed: BASE + 46, seed: 0x00000165, tickCount: 1001, fill: 'grass', stepAura: true,
    units: [
      { id: 32, race: R.ANGEL, x: 100.5, y: 60.5 },
      { id: 906, race: R.DRAGON, x: 101.5, y: 60.5, hp: 10, maxHp: 300 },   // hostile skip
      { id: 907, race: R.ZOMBIE, x: 99.5, y: 60.5, hp: 10, maxHp: 60 },     // undead skip
      { id: 908, race: R.SHEEP, x: 105.5, y: 60.5, hp: 5, maxHp: 16, infected: true },   // d²=25 圈外
    ],
    ticks: 2,
    sanity: (eng) => eng.effects.length === 0 && eng.units[3].infected === true && (eng.rngA >>> 0) === 0x165,
  },
  // ---- S47 angel-duo（天使渡天使：id=32/id=82 同帧双触发〔1400%50=0〕——A 先触发治 B
  //        （hp 150→210 + 清瘟）本体 bless34；B 后触发治 A（hp 100→170）本体 bless34。
  //        fx 5 发 draws=10——o===a 自遇 skip 面随行）----
  {
    key: 'angel-duo', baseSeed: BASE + 47, seed: 0x00000166, tickCount: 1001, fill: 'grass', stepAura: true,
    units: [
      { id: 32, race: R.ANGEL, x: 100.5, y: 60.5, hp: 100, maxHp: 240 },
      { id: 82, race: R.ANGEL, x: 101.5, y: 60.5, hp: 150, maxHp: 240, infected: true },
    ],
    ticks: 2,
    sanity: (eng) => eng.units[0].hp === 160 && eng.units[1].hp === 210 && eng.units[1].infected === false && eng.effects.length === 5,
  },
  // ---- S48 angel-cap（healed 上限 L13157 break：11 受伤羊仅前 10 治愈〔hp 1→11〕，
  //        第 11 只 hp=1 未触——fx 11 发 draws=22）----
  {
    key: 'angel-cap', baseSeed: BASE + 48, seed: 0x00000167, tickCount: 1001, fill: 'grass', stepAura: true,
    units: [
      { id: 32, race: R.ANGEL, x: 100.5, y: 60.5 },
      { id: 909, race: R.SHEEP, x: 98.5, y: 60.5, hp: 1, maxHp: 16 },   // 排1 d²=4
      { id: 910, race: R.SHEEP, x: 99.5, y: 60.5, hp: 1, maxHp: 16 },   // d²=1
      { id: 911, race: R.SHEEP, x: 100.5, y: 59.5, hp: 1, maxHp: 16 },  // d²=1
      { id: 912, race: R.SHEEP, x: 100.5, y: 61.5, hp: 1, maxHp: 16 },  // d²=1
      { id: 913, race: R.SHEEP, x: 101.5, y: 60.5, hp: 1, maxHp: 16 },  // d²=1
      { id: 914, race: R.SHEEP, x: 102.5, y: 60.5, hp: 1, maxHp: 16 },  // d²=4
      { id: 915, race: R.SHEEP, x: 99.5, y: 59.5, hp: 1, maxHp: 16 },   // 排2 d²=2
      { id: 916, race: R.SHEEP, x: 100.5, y: 62.5, hp: 1, maxHp: 16 },  // d²=4
      { id: 917, race: R.SHEEP, x: 101.5, y: 61.5, hp: 1, maxHp: 16 },  // d²=2
      { id: 918, race: R.SHEEP, x: 102.5, y: 59.5, hp: 1, maxHp: 16 },  // d²=5
      { id: 919, race: R.SHEEP, x: 98.5, y: 59.5, hp: 1, maxHp: 16 },   // 第11只 d²=8——break 未触
    ],
    ticks: 2,
    sanity: (eng) => eng.units[10].hp === 11 && eng.units[11].hp === 1 && eng.effects.length === 11,
  },
];

// ---- det 双跑 + 双写（M-U22：TOOL3_ONLY/TOOL3_SEED 单场景种子扫描钩子——scan-nature2-seed 先例） ----
const ONLY = process.env.TOOL3_ONLY || '';
const SEED_OV = process.env.TOOL3_SEED || '';
const specsRun = ONLY ? specs.filter((s) => s.key === ONLY) : specs;
if (SEED_OV) { const sv = parseInt(SEED_OV, 16) >>> 0; for (const s of specsRun) s.seed = sv; }
function runAll() {
  return specsRun.map((sp) => buildScenario(sp));
}
const det1 = runAll();
const det2 = runAll();
for (let i = 0; i < det1.length; i++) {
  const a = det1[i], b = det2[i];
  if (a.stepsSnap.at(-1).rngA !== b.stepsSnap.at(-1).rngA
    || JSON.stringify(a.stepsSnap) !== JSON.stringify(b.stepsSnap)
    || JSON.stringify(a.units) !== JSON.stringify(b.units)
    || JSON.stringify(a.fx) !== JSON.stringify(b.fx)
    || JSON.stringify(a.events) !== JSON.stringify(b.events)
    || JSON.stringify(a.toasts) !== JSON.stringify(b.toasts))
    throw new Error(`det 失败 ${specsRun[i].key}`);
}
console.log('det 双跑字节级一致:', specsRun.map((s) => s.key).join(' '));
if (ONLY) {
  const s0 = det1[0];
  console.log('ONLY-DIAG', JSON.stringify({ key: s0.key, draws: s0.totalDraws, items: s0.items || null, corpsesN: s0.corpses ? s0.corpses.length : 'n/a', bloodN: s0.blood ? s0.blood.length : 'n/a', ev: s0.events.map((e) => e.kind), fx: s0.fx.map((f) => f.kind), units: s0.units.map((u) => ({ id: u.id, race: u.race, hp: u.hp, maxHp: u.maxHp, dead: u.dead, gen: u.gen ?? null, food: u.food ?? null })) }));
  process.exit(0);   // 扫描模式不落盘
}

const scenarios = specs.map((sp, i) => det1[i]);
const out = {
  meta: {
    gen: 'gen-tool3.mjs',
    protocol: 'GameEngine 构造 + 手术式夹具直写（fill 面 grass + terrain/fire/radiate/units 瘦直写 + brush/五成就计数直写）+ rngA 尾置清零起流 + calls 直调 / ticks 步进（tickCount++ 头 + effectsTick——主循环 L2508 序）混合链，每步统一快照（applyTool 紧凑 / effectsTick 全列 fx+units+dirty）',
    rng: 'eng.rngA 单流；fx 恒 2 掷（seed+dir）；cap 门 filter 快照零掷；volcano 引燃圈 1 掷/点燃 + 消费端熔岩弹 age%14 双掷 + 外溢 age%6 双掷；wrath/typhoon 消费端 lightning（n=1：fx 2+中心点燃 1+四邻 4+邻格点燃支）；holystorm 恒真门 1.2 掷位保持 + 采样双掷 + 单位门掷（审判 0.2/缓愈 0.08）；bless/curse 0.4 门 + love 0.5 门 1 掷/单位 + fx 2 掷；teleport randomLandSpot 2 掷/尝试；mutate：civ 0.3 门 1 掷 + rerollTrait rollTrait 1 掷 + 0.25 门 1 掷 + jumpGene 4 门掷/命中维值掷；wild 直 jumpGene 4 门掷/命中维值掷〔baseGene 空表零掷〕；命中单位 fx 2 掷（门 miss 亦掷——L10901 fx 在 if/else 外）；mulberry 纯数学反解 total；M-U25：beached 游走 far 门 1 掷 + 采样 wx/wy 2 掷/试 + 猎游 top6 抽签 1 掷（findWaterNear/普查/最近选择零掷）；predatorHunt blood/water fx 2 掷/特效；rebound 掷签门 1 + 加权 1 + 栖息地采样 2 掷/试 + spawnUnit silent 6 掷/只 + fx 2 掷；breed 抖动 2 + spawn 6 + spawn/water 双 fx 4 掷；M-U27：aura 门全确定性（相位/旗/距离）零掷——bless fx 2 掷/发（S43-S45+S48 4/4/6/22 掷 + S47 双天使 10 掷；S41/S42/S46 零掷）',
    math: 'Math.hypot（volcano 锥体整数极距 / area 神力单位环〔含 mutate L10891〕 / plasma dist=hypot(7,9) / annihilate dist=hypot(8,11)——bun 原生 fdlibm；C# FdHypot 位精确件对账）+ Math.round（plasma ttl=round(dist*1.5) + mutate rerollTrait/jumpGene maxHp round 域——JS .5 上取整；C# JsRound 禁银行家舍入）+ Math.max/min 铛位（mutate 基因 0.5/2 恰等面 + maxHp≥1）+ 纯算术域',
    domains: ['unitsReap L3321-3472（M-U22：僵尸尸变 0.35 门→zombify continue / 王权驾崩→onKingDeath / 凤凰涅槃 ash push ashTtl 240〔season3 round×1.5〕/ 九头蛇 gen<2 双幼蛇 spawnUnit silent maxHp round×0.6 + seared 门 fire>0||LAVA / scav r=6 最饿捕食者 food+=55+round(maxHp*0.5) / 商队 rel -6 + trade 纪事 / skull fx + 血泊尸骸〔SANDWORM skip〕/ 肉 0.85 + wep 0.35 / boss 0.5 / wild 0.05 三连掉落门 / delete+bumpWild+pop-swap 逆序环）', 'onKingDeath L1675-1686（kingId -1 + stability 52 + 纪事 + toast danger）', 'dropItem L5190-5213（MAX_ITEMS 门 + isWater→findLandNear(5) + itemSeq + fx spawn 2 掷 + onSound place）', 'dropMeat L5385-5402（cnt 钳 [1,3] + items cap-6 门 + 2 掷/肉 + isWater→findLandNear(3)）', 'rollChestItem constants.ts L797-800（CHEST_TIERS min/max → rollItem）', 'rollItem items.ts L226-240（ALL_ITEMS rarity 窗口过滤 + RARITY_META w 权重池 + r-=w 循环——1 掷）', 'carveRiver L12312-12420（M-U20：applyTool case river runtime 语义——BFS dist 场零掷 + 加权随机选路 1 掷/步 + 刻河/灌溉 setTerrain 级联 + carveLake 湖支 + fx spawn/toast/addEvent 尾面）', 'mutateArea L10888-10906（M-U19：civ 0.3 reroll/0.25 jumpGene 0.12 + wild baseGene/jumpGene 0.2 + fx 每命中单位 2 掷〔双门双 miss 亦掷——fx 在 if/else 外〕）', 'rerollTrait L11037-11057（旧乘数卸除/新乘数上装——maxHp round 域 + hp min/max 双钳不对称〔old 支 max(1,·) / nw 支无〕）', 'jumpGene L11085-11103（四维 0.6 门 + (rng-0.42)*2*amount 重铸 + 0.5/2 铛位 + RACES×TRAITS×JOBS 属性重算）', 'rollTrait L1467-1470（TRAITS keys 12 预设插入序随机抽）', 'baseGene L11029-11031（speciesBase 空表分支——零掷恒 {1,1,1,1}）', 'acidRain L10737-10745（cap 6 + fx acid）', 'volcano L10746-10777（锥体 hypot≤2.3 + 山口/十字/3x3 熔岩 + 引燃圈 3.5*pw + shake 6+2pw + event 双文本）', 'tsunami L10780-10785（r*2.5 钳 [6,30]）', 'blizzard L10788-10795（cap 4 + max(5,r) 钳 [5,15]）', 'meteorShower L10798-10813（clamp [1,24] + rng 散布 + x0/y0/quiet 衍生弹 + statMeteorShowers）', 'locust L10815-10822（cap 3 + r 钳 [3,10]）', 'drought L10823-10830（cap 4）', 'rainCloud L10834-10843（cap 6 + touchMeta 宿主挂点）', 'blessArea L10845-10859（hp+50%max + bless 600 + 驱瘟 + 0.4 fx 门）', 'curseArea L10861-10872（curse 500）', 'loveArea L10874-10886（repro 门 + fert 500）', 'teleportArea L10908-10924（randomLandSpot 40 试 + spark 双发）', 'wrathStorm L10926-10934（cap 3）', 'holyStorm L10936-10945（cap 3）', 'plasmaCannon L10947-10957（x0/y0 钳 + ttl round 域 + dmg + statPlasmas）', 'annihilationLight L10959-10969（colorHex #ff4d4d + statAnnihilations）', 'sandstorm L10972-10979（cap 3）', 'typhoon L10980-10987（cap 3）', 'sinkhole L10988-10996（shake 7）', 'iceAge L10999-11008（cap 2 + shake 4）', 'famineCloud L11030-11036（cap 3）', 'blackhole L11017-11023（cap 2 + statBlackholes）', 'meteor L12277-12282（x0=x+20/y0=y-34）', 'randomLandSpot L11033-11043（40 试六地形门）', 'applyTool case L13342-13455（meteor 内联抖动 + 22 委派）', 'effectsTick 消费端四支：volcano L9851-9876 / wrath L10023-10029 / holystorm L10030-10075 / typhoon L10091-10119', 'phoenixAshTick L13018-13032（M-U23：灰烬倒数 a.t-=2 节拍 len>0 门每 tick——到点 splice + spawnUnit(PHOENIX,silent) 重生体继承 rebirths + fx spawn 46/fireball y-1 30 双 fx + toast info + addEvent phoenix 纪事；S25 成功支 / S26 MAX_WILDLIFE 900 注入 null 支〔先于 trait 掷〕——L2606 主循环门镜像步进通道，L2534-2606 间门位窗口全空零效应）', 'entGroveTick L13055-13097（M-U24：树人播种引擎级通道 %10 门——①播种 2 采样/树人 ang/rr 2 掷 + building 门 skip + 界外 j 门 skip + 地形门 GRASS 0.22pm/BURNT 0.45pm/SAND 0.06pm 短路掷〔pm=春 1.3/余 1；sn===3 冬蛰整支 skip 零掷〕+ setTerrain(FOREST) 级联 + spark fx ≤6；②扑火 r=2.5 dx²+dy²≤6.25 fire=0+fireSet 删+water fx 零掷；声门 planted>0&&rng<0.35 掷位保留〔onSound 宿主 no-op——掷位不丢〕；S27 成功支全分支 / S28 冬蛰+扑火+九头蛇冬眠）', 'lichRaiseTick L13105-13131（M-U24：巫妖复生引擎级通道 %12〔冬 %8〕门——骷髅计数 >40 顶层 return + 尸体 r=4 dx²+dy²≤16 stone skip + 最陈旧 c.age>bestAge 选择 + spawnUnit(SKELETON,silent) 6 掷链 + corpses.splice + fx skull y-1 26/smoke 16 + addEvent lich events<3 门；!nu null 支〔种族上限——S26 同构语义挂账〕；S29 成功支 / S30 41 骷髅上限门）', 'hydraRegenTick L13038-13047（M-U24：九头蛇回血引擎级通道 %30 门——season===3 冬眠 return + hp<maxHp 支 hp=min(maxHp,hp+maxHp×0.02) + hurt=0 再生清创；u.dead 支通道不可达〔unitsReap 先于门摘净死单位〕；S31 回血/满血/非九头蛇三面 + S28 冬眠面）', 'beachedAquaticTick L12652-12753（M-U25：水生搁浅整治引擎级通道逐 tick 无门——纯水生（aquatic && !beach）单位：①水中非捕食者 retarget %20 采样（far 门 0.25 1 掷 + 8 试实体水 wn≥6/9 含自身 + tx/ty 逐 tick 断言）；②水中捕食者猎游（粘性目标 ≤40 格 d²≤1600 + 散签初选 cands 排序 top6 抽签 1 掷 + 逐 tick units.find 坐标刷新——死亡支不清 beachTx 陈旧保持 + 逃亡 fleeT>0 让位内核）；③搁浅支（beachT 逐 tick +1 + hurt≥2 + findWaterNear r=16 环扫零掷 + ≥15 窒息 dead 交常规收尸）；蟹 beach 两栖/死单位/非水生 skip；S32 游走+窒息 / S33 猎游+搁浅鲨）', 'predatorHuntTick L12764-12833（M-U25：猎手扑杀引擎级通道 %20===7 门——preyAlive/fishAlive O(n) 普查 + hungryAqua 计数（水生捕食者 food≤300）+ 分级预算（>150 满额陆 8/水 4-10 弹性 → ≤150 减半 → ≤60 收缩 → ≤25 禁猎）+ capAqua 平滑耦合 min(capAqua, max(1, round(fishAlive/28))) + 出手门（陆 45/水 300——?? 70 缺省）+ 最近猎物严格 <（陆 r=1.6 d²<2.56 / 水 r=14 d²<196 + grab 豁免 + isCiv/非食草 skip）+ 扑杀链（prey.dead + WB.syncDead + blood fx 2 掷 + 水生 water fx 2 掷 + food=min(400,+25) + ≥380 break〔前置 355>300 出手门不可达——防御死码注记〕）；S34 陆生支 / S35 水生支+预算门+陈旧目标）', 'wildlifeReboundTick L12840-12989（M-U25：百兽迁徙引擎级通道 %600===61 门——laws.reproduction 门 + 灭绝名单（SEED 十七族 wildCount===0）+ 掷签门 0.6 + 加权掷签（ago/2400 权重 1..5——未迁入 MAX_SAFE_INTEGER 封顶 5）+ 预算分轨（水生 wildAliveAquatic<512 / 陆生 wildAlive<892）+ SHARK 锚鱼特例 + FISH 撒网特例（260 试三锚互距 ≥18 + 每锚 2-3 尾）+ 通用 140 试栖息地采样（CRAB r=2 邻水门）+ 奠基者 spawnUnit silent + fx spawn + eco 纪事双文本；S36 通用支 / S37 鱼群支 / S39 laws 门 / S40 掷签拒）', 'sharkBreedTick L12995-13014（M-U25：鲨群繁衍辅助引擎级通道 %240===13 门——laws 门 + 种群地板 0<len<8 + 肥鲨母体 find food>220 + 8 试落水门（±1.5 抖动钳 [0.5,W-0.5]）+ spawnUnit silent + 母体 food-60 妊娠成本 + spawn/water 双 fx；S38 成功支）', 'angelAuraTick L13138-13161（M-U27：天使光环引擎级通道 %3 门 phase=(tickCount/3)|0 相位门 (phase+id*13)%50===0——窗口 tick1002 phase=334 id≡32 mod 50 命中/id=82 同帧双触发；治愈内环门序 dead/o===a→hostile/undead〔只渡无辜者〕→hp满&&!infected→d²>12.25〔r=3.5²〕→hp<maxHp 支 min(maxHp,hp+max(10,maxHp*0.25))+bless16→infected 支清+bless20→healed 上限 10 break→本体 bless34+onSound heal〔宿主 no-op 零掷〕；S41 零天使/S42 相位拒/S43 治愈+满血 skip/S44 清瘟/S45 双支/S46 三门拒/S47 天使渡天使/S48 cap10）'],
    deferred: ['collectUnitDead Task 38 在线采集（引擎 no-op 挂账）', 'chest/ITEM_TOOL/cre:/RACE_TOOL 等其余 applyTool case（各域切片挂账不变）', 'SHEEP AI 游走链 units 域切片（L4213 恒掷门——M-U21 挂账沿用）', 'lichRaiseTick !nu null 支（spawnUnit 种族上限——S26 MAX_WILDLIFE 同构语义；SKELETON 2400 注入不经济——防御分支挂账）', 'entGrove/lich/hydra u.dead 支 tick 通道不可达（unitsReap 同 tick 先于门摘净死单位——防御分支注记）', 'lichRaise 冬 %8 节律面（gate 三元式非冬 12 支 S29 已证；冬支 S28 窗口 %8=2 不触——节律算术面挂账）', 'beachedAquaticTick 8 试全 miss 游走支（far 散布 14 落草地——种子标定不经济，镜像算术面覆盖）', 'predatorHuntTick ≥380 break 支（前置 355>300 出手门不可达——防御死码注记）+ undead 捕食者门（RACES 无 undead+predator 复合族——ZOMBIE 非捕食者）', 'wildlifeReboundTick SHARK 锚鱼支（需灭绝鲨+活鱼同场——夹具不经济挂账）+ extinct 空名单支 + 预算门双轨拒签支（wildAll 注入 890+ 不经济）+ 多 extinct 加权竞争面（单 extinct 恒中——权重算术镜像覆盖）', 'sharkBreedTick ≥8 上限/0 鲨/无肥母三防御门（零掷 return——红证旋钮覆盖写面）', 'M-U25 C# 全译 + tool3-transcript 镜像 + Test48 扩面 + verify 扩签名（相二三——M-U25 收官轮交付）', 'M-U27 angelAuraTick C# 全译 + transcript 镜像 + Test48 扩面 + verify 扩签名（本轮黄金先行）'],
    scenarioCount: scenarios.length,
  },
  scenarios,
};
const json = JSON.stringify(out);
const GOLDEN1 = path.join(ROOT, 'scripts/unity-migration/golden/tool3.json');
const GOLDEN2 = path.join(ROOT, 'unity/pixel-world-box/Assets/StreamingAssets/WbGolden/tool3.json');
writeFileSync(GOLDEN1, json);
writeFileSync(GOLDEN2, json);
console.log('tool3.json', (json.length / 1024).toFixed(1) + 'KB', 'md5=' + createHash('md5').update(json).digest('hex'));
console.log('双写:', GOLDEN1, '+', GOLDEN2);
