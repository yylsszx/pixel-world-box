// ============================================================================
// gen-storms.mjs —— M-U1b 切片 3「风暴生命周期」黄金向量（Task 138）
// 直接 import 现役 src/lib/game/nature.ts（真实现，非复制），以最小 stub 引擎
// 驱动 stormTick 全确定性段（孕育 gate/6 次撒点/风场漂移/能量学/登陆播报/
// 肆虐 ravage/遇山龙卷/湿气倾泻/消散/气候型干旱沙暴掷骰）。
// 引擎侧效应（stormRavage/spawnTornado/sandstorm/drought/toast+addEvent）
// 以事件流捕获——C# 侧以 PendingStorms 结构对账；stub 钩子不耗 rng
// （真引擎 stormRavage 内耗 rng 属宿主回放层，Task 137 rainFireProbe 同例）。
// 激活度工程：moist per-case 注入 + pSystem 注入（nearL/助产分支）+ 强气旋/
// 强冰暴直接注入（登陆/肆虐/龙卷链）——注入参数入 JSON，C# 同注入。
// 运行：bun scripts/unity-migration/gen-storms.mjs
// 输出：scripts/unity-migration/golden-storms.json
// ============================================================================
import { NatureSystem, STORM_NAME_AT } from '../../src/lib/game/nature.ts';
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

// ---- geo 纪事码映射（蓝本 stormTick 内 6 组固定文案 → 稳定短码；按前缀序） ----
const GEO_TABLE = [
  ['极地冰暴', 'bornB'], ['热带气旋', 'bornC'], ['冰暴「', 'landB'],
  ['气旋「', 'landC'], ['风暴「', 'gone'],
];
const geoCode = (msg) => {
  for (const [p, c] of GEO_TABLE) if (String(msg).startsWith(p)) return c;
  if (String(msg).includes('撞上山岳')) return 'tornado'; // 「风暴名」撞上山岳——名号前缀不定长
  return 'unknown:' + String(msg).slice(0, 12);
};
const toastCode = (msg) => (String(msg).includes('成形') ? 'bornC' : String(msg).includes('登陆肆虐') ? 'landC' : 'unknown:' + String(msg).slice(0, 12));

// ---- stub 引擎：stormTick 路径所需最小面 ----
function makeStubEng(rngSeed, opts) {
  const events = [];
  const world = generateWorld(opts.seed);
  const terrain = opts.flatSand ? new Uint8Array(W * H).fill(2) : world.terrain; // flatSand：全沙地形（沙暴分支必中）
  const eng = {
    events,
    laws: { tectonics: false, atmosphere: true, seasons: true, naturalDisasters: true },
    yearF: opts.yearF,
    rng: mulberry32(rngSeed),
    terrain,
    stormRavage: (st) => events.push({ k: 'ravage', id: st.id, x: st.x, y: st.y, sb: bitHex(st.strength), kind: st.kind, name: st.name }),
    spawnTornado: (x, y, n) => events.push({ k: 'tornado', x, y, n }),
    sandstorm: (x, y, r, ttl) => events.push({ k: 'sand', x, y, rb: bitHex(r), ttl }),
    drought: (x, y, r, ttl) => events.push({ k: 'drought', x, y, rb: bitHex(r), ttl }),
    toast: (msg) => events.push({ k: 'toast', c: toastCode(msg) }),
    addEvent: (cat, msg, pos) => events.push({ k: 'geo', c: geoCode(msg), x: pos ? pos.x : null, y: pos ? pos.y : null }),
    dirty: new Set(), propsDirty: new Set(),
    units: [],
    cam: { x: 512.5, y: 300.25 },
  };
  return eng;
}

// ---- cellStats 镜像（探针用——注入坐标定位） ----
function cellStats(terrain, cx, cy) {
  let water = 0, elev = 0;
  const x0 = cx * CELL, y0 = cy * CELL;
  for (let y = y0; y < y0 + CELL && y < H; y++) {
    for (let x = x0; x < x0 + CELL && x < W; x++) {
      const t = terrain[y * W + x];
      if (t === 0 || t === 1) water++;
      else if (t === 6 || t === 8) elev += 3;
      else if (t === 5) elev += 2;
      else elev += 1;
    }
  }
  const n = CELL * CELL;
  return { waterFrac: water / n, elev: elev / n };
}
/** 首个满足条件的粗格（行序扫描）——注入坐标定位（C# 侧读 JSON 注入值，不重扫） */
function findCell(terrain, pred) {
  for (let cy = 0; cy < AH; cy++) for (let cx = 0; cx < AW; cx++) {
    const st = cellStats(terrain, cx, cy);
    if (pred(st, cy)) return { cx, cy, x: cx * CELL + 4, y: cy * CELL + 4 };
  }
  return null;
}

// ---- 四场景：core（夏·饱和湿·强低压助产+强气旋注入）/ winter（冬·极地冰暴窗+强冰暴注入）
//      / arid（秋·天然地形干旱掷骰窗）/ aridSand（秋·全沙地形沙暴分支必中） ----
const TICKS = 50;
const CASES = [
  { name: 'core', seed: 20261026, engRngSeed: 931, yearF: 1234.5, moistInit: 1.0 },
  { name: 'winter', seed: 42, engRngSeed: 932, yearF: 1238.0, moistInit: 0.9 },
  { name: 'arid', seed: 777, engRngSeed: 933, yearF: 1236.5, moistInit: 0.08 },
  { name: 'aridSand', seed: 777, engRngSeed: 934, yearF: 1236.5, moistInit: 0.08, flatSand: true },
];

const out = [];
for (const c of CASES) {
  let eng = makeStubEng(c.engRngSeed, c);
  let nat = new NatureSystem(eng, c.seed);
  nat.initPlates();
  nat.moist.fill(c.moistInit); // per-case 湿度注入：core 饱和=气旋窗；winter 极地窗；arid 干旱窗
  const terrainB64 = b64(nat.eng.terrain);
  const terrainDigest = fnv(nat.eng.terrain);

  // ---- 注入（激活度工程；坐标由地形扫描确定性定位，值入 JSON 供 C# 同注入） ----
  const inj = { ps: null, storm: null, stormSeqNext: 1 };
  if (c.name === 'core') {
    // 强低压：ITCZ 附近洋格（cy=11 → latA≈|11/19-0.5|*2=0.158，助产 +nearL 分支）
    inj.ps = { x: 16 * CELL + 4, y: 11 * CELL + 4, str: 0.7, kind: 0, ttl: 400 };
    // 强气旋：高山陆格注入（登陆+肆虐+遇山龙卷链）。风暴逐拍漂移会滑出山区——
    // 扫描全部高山陆格 × 候选 rng 种子，迷你仿真选「龙卷事件数」最优组合（结果冻结入 JSON，C# 只读注入值）。
    //（强度 1.6=上限：衰减 ~0.04/拍 → 尽量长的肆虐窗）
    let best = null;
    for (const trySeed of [931, 941, 951, 961, 971]) {
      for (let cy = 0; cy < AH; cy++) for (let cx = 0; cx < AW; cx++) {
        const st = cellStats(nat.eng.terrain, cx, cy);
        if (!(st.waterFrac < 0.4 && st.elev > 1.6)) continue;
        const e2 = makeStubEng(trySeed, c);
        const n2 = new NatureSystem(e2, c.seed);
        n2.initPlates();
        n2.moist.fill(c.moistInit);
        n2.pSystems.push({ ...inj.ps });
        n2.storms.push({ id: 1, x: cx * CELL + 4, y: cy * CELL + 4, strength: 1.6, ttl: 800, seed: 4242, kind: 'cyclone', name: STORM_NAME_AT(1), landed: false });
        n2.stormSeq = 2;
        let tornadoN = 0, ravageN = 0;
        for (let t = 0; t < 30; t++) {
          e2.events.length = 0;
          n2.stormTick();
          for (const ev of e2.events) { if (ev.k === 'tornado') tornadoN++; if (ev.k === 'ravage') ravageN++; }
        }
        if (!best || tornadoN > best.tornadoN) best = { trySeed, cx, cy, tornadoN, ravageN };
      }
      if (best && best.tornadoN >= 2) break; // 充分激活即可（种子序优先，少扫描）
    }
    console.log(`[core] tornado-opt: seed=${best.trySeed} cell=(${best.cx},${best.cy}) tornadoN=${best.tornadoN} ravageN=${best.ravageN}`);
    inj.psSeed = best.trySeed;
    inj.storm = { id: 1, x: best.cx * CELL + 4, y: best.cy * CELL + 4, strength: 1.6, ttl: 800, seed: 4242, kind: 'cyclone', name: STORM_NAME_AT(1) };
    inj.stormSeqNext = 2;
    // 优胜种子 ≠ 原种子时重建主运行引擎（rng 流自始一致；地形确定性相同）
    if (best.trySeed !== c.engRngSeed) {
      eng = makeStubEng(best.trySeed, c);
      nat = new NatureSystem(eng, c.seed);
      nat.initPlates();
      nat.moist.fill(c.moistInit);
    }
    nat.pSystems.push({ ...inj.ps });
    nat.storms.push({ ...inj.storm });
    nat.stormSeq = 2;
  } else if (c.name === 'winter') {
    // 强冰暴：首个极地陆格（cy≤3 或 cy≥16 且 waterFrac<0.4）→ 冰暴登陆链（肆虐 ravage 也触发）
    const cell = findCell(nat.eng.terrain, (st, cy) => st.waterFrac < 0.4 && (cy <= 3 || cy >= 16));
    inj.storm = { id: 1, x: cell.x, y: cell.y, strength: 0.8, ttl: 800, seed: 77, kind: 'blizzard', name: STORM_NAME_AT(1) };
    nat.storms.push({ ...inj.storm });
    inj.stormSeqNext = 2;
    nat.stormSeq = 2;
  }

  const init = {
    moistInit: c.moistInit,
    moistDigest: fnvF32(nat.moist),
    stormSeq: nat.stormSeq,
    pSystems: nat.pSystems.length,
  };

  const stormRow = (st) => [st.id, st.kind, st.name, st.landed ? 1 : 0, st.ttl, st.seed, bitHex(st.x), bitHex(st.y), bitHex(st.strength)];

  // ---- 50 风暴步演化 ----
  const ticks = [];
  const checks = {};
  const cap = (t) => {
    checks['t' + t] = {
      storms: nat.storms.map(stormRow),
      moist: fnvF32(nat.moist),
      rain: fnvU8(nat.rainCell),
      counters: { cyclones: nat.counters.cyclones, blizzards: nat.counters.blizzards, droughts: nat.counters.droughts },
      seq: nat.stormSeq,
    };
  };
  for (let t = 1; t <= TICKS; t++) {
    eng.events.length = 0;
    nat.stormTick();
    if (eng.events.length > 0) {
      ticks.push({
        t,
        events: eng.events.map((e) => {
          if (e.k === 'ravage') return ['ravage', e.id, e.x, e.y, e.sb, e.kind];
          if (e.k === 'tornado') return ['tornado', e.x, e.y, e.n];
          if (e.k === 'sand' || e.k === 'drought') return [e.k, e.x, e.y, e.rb, e.ttl];
          if (e.k === 'geo') return ['geo', e.c, e.x, e.y];
          return ['toast', e.c];
        }),
      });
    }
    if (t === 10 || t === 25 || t === 50) cap(t);
  }

  // ---- 终态（全量位级） ----
  const final = {
    storms: nat.storms.map(stormRow),
    moistDigest: fnvF32(nat.moist),
    rainDigest: fnvU8(nat.rainCell),
    counters: { cyclones: nat.counters.cyclones, blizzards: nat.counters.blizzards, droughts: nat.counters.droughts },
    seq: nat.stormSeq,
  };

  // ---- stub rng 消耗对账（计数包装重放全程 + 尾抽 4 步流指纹） ----
  const eng2 = makeStubEng(c.name === 'core' ? inj.psSeed : c.engRngSeed, c);
  const rngRaw = eng2.rng;
  let rngCount = 0;
  eng2.rng = () => { rngCount++; return rngRaw(); };
  const nat2 = new NatureSystem(eng2, c.seed);
  nat2.initPlates();
  nat2.moist.fill(c.moistInit);
  if (inj.ps) nat2.pSystems.push({ ...inj.ps });
  if (inj.storm) { nat2.storms.push({ ...inj.storm }); nat2.stormSeq = inj.stormSeqNext; }
  for (let t = 0; t < TICKS; t++) nat2.stormTick();
  const tail = [];
  for (let i = 0; i < 4; i++) tail.push(bitHex(eng2.rng()));

  out.push({
    name: c.name, seed: c.seed, engRngSeed: c.name === 'core' ? inj.psSeed : c.engRngSeed, yearF: c.yearF, moistInit: c.moistInit,
    terrainB64, terrainDigest, inj, init, ticks, checks, final, rngCount, rngTail: tail,
  });
}

const evStat = (o, kind) => o.ticks.reduce((n, t) => n + t.events.filter((e) => e[0] === kind).length, 0);
const summary = out.map((o) => {
  const f = o.final;
  return `${o.name}: storms=${f.storms.length} cyclones=${f.counters.cyclones} blizzards=${f.counters.blizzards} droughts=${f.counters.droughts} ravage=${evStat(o, 'ravage')} tornadoEv=${evStat(o, 'tornado')} geo=${evStat(o, 'geo')} sand=${evStat(o, 'sand')} droughtEv=${evStat(o, 'drought')} rngDraws=${o.rngCount}`;
});
writeFileSync(new URL('./golden-storms.json', import.meta.url), JSON.stringify(out));
console.log('golden-storms.json written,', out.length, 'cases');
console.log(summary.join('\n'));
