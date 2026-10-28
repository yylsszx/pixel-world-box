// ============================================================================
// gen-geohydro.mjs —— M-U1b 切片 4「地质 + 水文」黄金向量（Task 139）
// 直接 import 现役 src/lib/game/nature.ts（真实现，非复制），以最小 stub 引擎
// 驱动 geologyTick 五段全确定性（造山链行走/岛弧/侵蚀沉积/火山热点喷发+灰烬平流/
// 热点链漂移/裂谷拉张）与 hydroTick 河流 genesis（密度门/稀疏门/湿润门/nearRiver/
// carveRiver 委托）。
// 引擎侧效应（setTerrain 数组写/volcano/toast+addEvent/carveRiver 委托）按
// Task 136-138 事件流+宿主委托先例处理：stub setTerrain 仅写地形数组（真引擎
// 派生态副作用属宿主回放层）；stub carveRiver 确定性规则 + 调用计数（真引擎
// BFS 开凿不耗 eng.rng，M-U2+ 独立移植切片）。
// 激活度工程：stress 注入（造山 cand>9 / 岛弧 ≥6 / pw>14 三档阈值）+ 热点 heat
// 调度注入（每拍/稀疏/单波）+ drift 覆写（conv<-0.2 裂谷激活）+ moist/rainCell
// per-case（湿润门两路径）+ riverDir 带（nearRiver 跳过）+ riverTiles 密度门。
// 运行：bun scripts/unity-migration/gen-geohydro.mjs
// 输出：scripts/unity-migration/golden-geohydro.json
// ============================================================================
import { NatureSystem } from '../../src/lib/game/nature.ts';
import { W, H } from '../../src/lib/game/constants.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { generateWorld } from '../../src/lib/game/worldgen.ts';
import { writeFileSync } from 'node:fs';

const AW = Math.floor(W / 8), AH = Math.floor(H / 8), CELL = 8;

// ---- FNV-1a 32bit（与 C# 对账台同式） ----
const fnv = (u8) => {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < u8.length; i++) {
    h = (h ^ u8[i]) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
const fnvF32 = (f32arr) => {
  const u8 = new Uint8Array(f32arr.length * 4);
  const dv = new DataView(u8.buffer);
  for (let i = 0; i < f32arr.length; i++) dv.setFloat32(i * 4, f32arr[i], true);
  return fnv(u8);
};
const fnvU8 = (u8arr) => fnv(u8arr);
/** IEEE754 小端 16 hex（位模式对账用，禁 epsilon） */
const bitHex = (d) => {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, d, true);
  return [...new Uint8Array(dv.buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
const b64 = (u8) => Buffer.from(u8).toString('base64');

// ---- geo 纪事码映射（蓝本 geologyTick/hydroTick 内 6 组固定文案 → 稳定短码；按前缀序） ----
const GEO_TABLE = [
  ['沿着会聚边界的缝合线', 'range'], ['深海之下', 'island'], ['「无夏之年」', 'vwinter'],
  ['剧烈的普林尼式喷发', 'plinian'], ['裂谷的拉张', 'rift'], ['丰沛的降雨在群山间汇流', 'river'],
];
const geoCode = (msg) => {
  for (const [p, c] of GEO_TABLE) if (String(msg).startsWith(p)) return c;
  return 'unknown:' + String(msg).slice(0, 12);
};
const toastCode = (msg) => (String(msg).includes('火山冬') ? 'vwinterT' : 'unknown:' + String(msg).slice(0, 12));

// ---- stub 引擎：geologyTick/hydroTick 路径所需最小面 ----
function makeStubEng(rngSeed, opts) {
  const events = [];
  const world = generateWorld(opts.seed, opts.genParams);
  const terrain = world.terrain;
  const riverDir = new Uint8Array(W * H);
  // nearRiver 跳过路径激活：矩形带预铺河道标记（harness 级注入规则，C# 侧同规则复制）
  if (opts.riverBand) {
    for (let y = opts.riverBand[1]; y <= opts.riverBand[3]; y++)
      for (let x = opts.riverBand[0]; x <= opts.riverBand[2]; x++) riverDir[y * W + x] = 1;
  }
  const riverTiles = new Set();
  if (opts.riverDensity) for (let i = 0; i < 901; i++) riverTiles.add(i); // 密度门（>900）激活
  let carveCalls = 0;
  const eng = {
    events,
    laws: { tectonics: true, atmosphere: true, seasons: true, naturalDisasters: true },
    yearF: 1234.5,
    rng: mulberry32(rngSeed),
    terrain,
    riverDir,
    riverTiles,
    // 模拟核心最小契约：地形数组写入（真引擎 ambTouch/markDirty/decals 等派生态属宿主回放层）
    setTerrain: (i, t) => { eng.terrain[i] = t; },
    volcano: (x, y, pw) => events.push({ k: 'volcano', x, y, pw }),
    // carveRiver 确定性 stub（真引擎 BFS 开凿 M-U2+ 移植）——规则双侧一致
    carveRiver: (wx, wy, wo) => {
      carveCalls++;
      if (opts.carveMode === 'always') return true;
      return Math.floor(wx) % 3 !== 0; // 'mixed'：约 2/3 成功 → 失败重试路径激活
    },
    getCarveCalls: () => carveCalls,
    toast: (msg) => events.push({ k: 'toast', c: toastCode(msg) }),
    addEvent: (cat, msg, pos) => events.push({ k: cat, c: geoCode(msg), x: pos ? pos.x : null, y: pos ? pos.y : null }),
    dirty: new Set(), propsDirty: new Set(),
    units: [],
    cam: { x: 512.5, y: 300.25 },
  };
  return eng;
}

// ---- 三场景：core（全激活：造山链 range/岛弧/pw3 plinian/火山冬 vwinter/河 genesis·混合 carve）
//      / marine（稀疏热·雨路湿润门·carve 恒真·无 stress 注入——造山 break 路径）
//      / drowned（密度门早退+单波热+梯度漂移裂谷激活+边界造山——carve 零调用） ----
const ITER_DEFAULT = 80;          // 默认迭代数（1 geology + 10 hydro / 迭代）；per-case cfg.iter 覆写
const HYDRO_PER_ITER = 10;        // hydroTick 稀疏门 0.05 → 80×10=800 拍 ≈ 40 次入体，足够成河
const CASES = [
  { name: 'core', seed: 20261026, engRngSeed: 931, moistInit: 1.0, stressStep: 7, stressHiStep: 3,
    heat: 'every', rainMode: 'alt', riverBand: [80, 60, 140, 100], carveMode: 'mixed',
    hillInject: true, ashPreheatAt: 40, iter: 80 },
  { name: 'marine', seed: 42, engRngSeed: 932, moistInit: 0.5, stressStep: 0, stressHiStep: 0,
    heat: 'sparse', rainMode: 'band', riverBand: null, carveMode: 'always', iter: 80 },
  { name: 'drowned', seed: 777, engRngSeed: 933, moistInit: 0.08, stressStep: 11, stressHiStep: 0,
    heat: 'once', rainMode: 'none', riverBand: null, carveMode: 'mixed', riverDensity: true, iter: 80 },
  { name: 'rift', seed: 42, engRngSeed: 934, moistInit: 0.35, stressStep: 0, stressHiStep: 0,
    heat: 'none', rainMode: 'none', riverBand: null, carveMode: 'mixed',
    driftOverride: true, coastify: true, iter: 300,
    genParams: { seaBias: 0.14, warp: 2.0, falloff: 1.3 } },
];

// ---- 注入规则（双侧一致；C# 对账台同规则复制） ----
/** 边界陆格 → HILL（造山链 range 激活：链行走 HILL→MOUNTAIN p=0.5 → mount≥4 窗）。
 *  只改陆地（2 沙/3 草/4 林→5 丘），水域/山体保持——岛弧候选不破坏。 */
const hillInjectFn = (nat) => {
  for (const i of nat.boundary) {
    const t = nat.eng.terrain[i];
    if (t === 2 || t === 3 || t === 4) nat.eng.terrain[i] = 5;
  }
};
/** 梯度漂移覆写：drift[p].dx = 0.3 - 0.25·p → 边界格首异邻居板块序号 > p 时 conv=-0.25(np-p) < -0.2（裂谷激活，P≈50%） */
const driftOverrideFn = (nat) => {
  for (let p = 0; p < nat.plateN; p++) nat.drift[p] = { dx: 0.3 - 0.25 * p, dy: 0 };
};

/** 边界全面岸化（coastify）：每个边界陆格（2沙/3草/4林/5丘）确保有水邻居（无则把首个
 *  非边界陆邻居 → WATER 制造海岸线），然后自身 → GRASS——裂谷 GRASS→WATER 事件分支
 *  （p=0.1 × waterAdj）从地理稀缺变全额激活。MOUNTAIN/SNOW/水域保持。 */
const coastifyFn = (nat) => {
  const T = nat.eng.terrain;
  for (const i of nat.boundary) {
    const t = T[i];
    if (!(t === 2 || t === 3 || t === 4 || t === 5)) continue;
    const x = i % W, y = (i / W) | 0;
    let coastal = false;
    for (let k = 0; k < 4 && !coastal; k++) {
      const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const nt = T[yy * W + xx];
      if (nt === 0 || nt === 1) coastal = true;
    }
    if (!coastal) {
      for (let k = 0; k < 4; k++) {
        const xx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
        const yy = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const nt = T[j];
        if (!nat.boundary.has(j) && !(nt === 0 || nt === 1)) { T[j] = 1; break; } // 制造海岸
      }
    }
    T[i] = 3; // GRASS
  }
};

const out = [];
for (const c of CASES) {
  const ITER = c.iter ?? ITER_DEFAULT;
  const eng = makeStubEng(c.engRngSeed, c);
  const nat = new NatureSystem(eng, c.seed);
  nat.initPlates();

  // ---- 注入（激活度工程；规则双侧一致 + digest 入 JSON 验注入对齐） ----
  if (c.stressStep > 0) {
    let k = 0;
    for (const i of nat.boundary) { if (k % c.stressStep === 0) nat.stress[i] = 12.5; k++; }
  }
  if (c.stressHiStep > 0) {
    let k = 0;
    for (const i of nat.boundary) { if (k % c.stressHiStep === 0) nat.stress[i] = 15.0; k++; } // pw=3 档（>14）
  }
  if (c.hillInject) hillInjectFn(nat);
  if (c.driftOverride) driftOverrideFn(nat);
  if (c.coastify) coastifyFn(nat);
  nat.moist.fill(c.moistInit);
  if (c.rainMode === 'alt') for (let cc = 0; cc < AW * AH; cc += 2) nat.rainCell[cc] = 200;
  else if (c.rainMode === 'band') for (let cx = 0; cx < AW; cx++) nat.rainCell[10 * AW + cx] = 120; // 雨路（moist<0.72 且 rain≥90）

  const terrainB64 = b64(nat.eng.terrain);
  const init = {
    moistDigest: fnvF32(nat.moist),
    stressDigest: fnvF32(nat.stress),
    rainDigest: fnvU8(nat.rainCell),
    riverDirDigest: fnvU8(nat.eng.riverDir),
    boundaryCount: nat.boundary.size,
    hotspots: nat.hotspots.map((h) => [bitHex(h.x), bitHex(h.y), bitHex(h.heat)]),
  };

  const heatInject = (iter) => {
    if (c.heat === 'every') { for (const h of nat.hotspots) h.heat = 2.8; }
    else if (c.heat === 'sparse' && (iter === 5 || iter === 15 || iter === 25)) { for (const h of nat.hotspots) h.heat = 2.7; }
    else if (c.heat === 'once' && iter === 1) { for (const h of nat.hotspots) h.heat = 3.0; }
  };

  // ---- 30 迭代 × (1 地质 + 10 水文) 演化 ----
  const ticks = [];
  const checks = {};
  const cap = (it) => {
    checks['t' + it] = {
      terrainDigest: fnv(nat.eng.terrain),
      uplifts: nat.counters.uplifts, erosions: nat.counters.erosions, eruptions: nat.counters.eruptions,
      ash: bitHex(nat.ash), ashF: fnvF32(nat.ashF),
      hotspots: nat.hotspots.map((h) => [bitHex(h.x), bitHex(h.y), bitHex(h.heat)]),
      carveCalls: nat.eng.getCarveCalls(),
      moistDigest: fnvF32(nat.moist), rainDigest: fnvU8(nat.rainCell),
    };
  };
  for (let it = 1; it <= ITER; it++) {
    eng.events.length = 0;
    if (c.ashPreheatAt === it) nat.ashF.fill(0.2999); // 火山冬激活：全局灰烬预匯 0.2999 → 下一喷发跨过 0.3 阈（f32 舍入双侧同）
    if (c.hillInject && it % 10 === 0) hillInjectFn(nat); // HILL 池续匯：链行走 HILL→MOUNTAIN 耗竭后每 10 迭代补充（range 持续激活）
    heatInject(it);
    nat.geologyTick();
    for (let hh = 0; hh < HYDRO_PER_ITER; hh++) nat.hydroTick();
    if (eng.events.length > 0) {
      ticks.push({
        it,
        events: eng.events.map((e) => {
          if (e.k === 'volcano') return ['volcano', bitHex(e.x), bitHex(e.y), e.pw];
          if (e.k === 'geo' || e.k === 'river') return [e.k, e.c, e.x, e.y];
          return ['toast', e.c];
        }),
      });
    }
    if (it === 10 || it === 20 || it === 30) cap(it);
  }

  // ---- 终态（全量位级） ----
  const final = {
    terrainDigest: fnv(nat.eng.terrain),
    terrainB64: b64(nat.eng.terrain),
    uplifts: nat.counters.uplifts, erosions: nat.counters.erosions, eruptions: nat.counters.eruptions,
    ash: bitHex(nat.ash), ashF: fnvF32(nat.ashF),
    stressDigest: fnvF32(nat.stress), // 只读性回归守卫：geology/hydro 不得改应力场
    moistDigest: fnvF32(nat.moist), rainDigest: fnvU8(nat.rainCell),
    hotspots: nat.hotspots.map((h) => [bitHex(h.x), bitHex(h.y), bitHex(h.heat)]),
    carveCalls: nat.eng.getCarveCalls(),
  };

  // ---- stub rng 消耗对账（计数包装重放全程 + 尾抽 4 步流指纹） ----
  const eng2 = makeStubEng(c.engRngSeed, c);
  const nat2 = new NatureSystem(eng2, c.seed);
  nat2.initPlates();
  const rngRaw = eng2.rng;
  let rngCount = 0;
  eng2.rng = () => { rngCount++; return rngRaw(); };
  if (c.stressStep > 0) { let k = 0; for (const i of nat2.boundary) { if (k % c.stressStep === 0) nat2.stress[i] = 12.5; k++; } }
  if (c.stressHiStep > 0) { let k = 0; for (const i of nat2.boundary) { if (k % c.stressHiStep === 0) nat2.stress[i] = 15.0; k++; } }
  if (c.hillInject) hillInjectFn(nat2);
  if (c.driftOverride) driftOverrideFn(nat2);
  if (c.coastify) coastifyFn(nat2);
  nat2.moist.fill(c.moistInit);
  if (c.rainMode === 'alt') for (let cc = 0; cc < AW * AH; cc += 2) nat2.rainCell[cc] = 200;
  else if (c.rainMode === 'band') for (let cx = 0; cx < AW; cx++) nat2.rainCell[10 * AW + cx] = 120;
  const heatInject2 = (iter) => {
    if (c.heat === 'every') { for (const h of nat2.hotspots) h.heat = 2.8; }
    else if (c.heat === 'sparse' && (iter === 5 || iter === 15 || iter === 25)) { for (const h of nat2.hotspots) h.heat = 2.7; }
    else if (c.heat === 'once' && iter === 1) { for (const h of nat2.hotspots) h.heat = 3.0; }
  };
  for (let it = 1; it <= ITER; it++) {
    if (c.ashPreheatAt === it) nat2.ashF.fill(0.2999);
    if (c.hillInject && it % 10 === 0) hillInjectFn(nat2);
    heatInject2(it);
    nat2.geologyTick();
    for (let hh = 0; hh < HYDRO_PER_ITER; hh++) nat2.hydroTick();
  }
  const tail = [];
  for (let i = 0; i < 4; i++) tail.push(bitHex(eng2.rng()));

  out.push({
    name: c.name, seed: c.seed, engRngSeed: c.engRngSeed, moistInit: c.moistInit,
    // cfg 回显：注入/调度规则随 JSON 分发，C# 对账台按同规则复现（Task 138 inj 冻结先例）
    cfg: { stressStep: c.stressStep, stressHiStep: c.stressHiStep, hillInject: !!c.hillInject,
      hillRenew: c.hillInject ? 10 : 0, driftOverride: !!c.driftOverride, heat: c.heat,
      rainMode: c.rainMode, riverBand: c.riverBand ?? null, carveMode: c.carveMode,
      riverDensity: !!c.riverDensity, ashPreheatAt: c.ashPreheatAt ?? 0,
      coastalGrass: !!c.coastify, iter: ITER, hydroPerIter: HYDRO_PER_ITER },
    terrainB64, init, ticks, checks, final, rngCount, rngTail: tail,
  });
}

const evStat = (o, kind) => o.ticks.reduce((n, t) => n + t.events.filter((e) => e[0] === kind).length, 0);
const codeStat = (o, code) => o.ticks.reduce((n, t) => n + t.events.filter((e) => (e[0] === 'geo' || e[0] === 'river' || e[0] === 'toast') && e[1] === code).length, 0);
const summary = out.map((o) => {
  const f = o.final;
  return `${o.name}: uplifts=${f.uplifts} erosions=${f.erosions} eruptions=${f.eruptions} volcano=${evStat(o, 'volcano')} range=${codeStat(o, 'range')} island=${codeStat(o, 'island')} vwinter=${codeStat(o, 'vwinter')} plinian=${codeStat(o, 'plinian')} rift=${codeStat(o, 'rift')} river=${codeStat(o, 'river')} carve=${f.carveCalls} rngDraws=${o.rngCount}`;
});
writeFileSync(new URL('./golden-geohydro.json', import.meta.url), JSON.stringify(out));
console.log('golden-geohydro.json written,', out.length, 'cases');
console.log(summary.join('\n'));
