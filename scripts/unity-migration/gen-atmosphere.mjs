// ============================================================================
// gen-atmosphere.mjs —— M-U1b 切片 2「大气环流」黄金向量（Task 137）
// 直接 import 现役 src/lib/game/nature.ts（真实现，非复制），
// 以最小 stub 引擎驱动 atmTick 全确定性段（pressureTick/灰烬平流/湿度/降雨/
// 雨效钩子/天象家族），地形取 worldgen.ts 真实生成（零同源复制）。
// 引擎侧效应（rainRegrow/natureFlood/natureLightning/纪事 toast+addEvent 对）
// 以事件流捕获——C# 侧以 PendingAtm 结构对账；rainFireProbe 恒 -1（无火世界）。
// 运行：bun scripts/unity-migration/gen-atmosphere.mjs
// 输出：scripts/unity-migration/golden-atmosphere.json
// ============================================================================
import { NatureSystem } from '../../src/lib/game/nature.ts';
import { W, H } from '../../src/lib/game/constants.ts';
import { mulberry32 } from '../../src/lib/game/noise.ts';
import { generateWorld } from '../../src/lib/game/worldgen.ts';
import { writeFileSync } from 'node:fs';

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

// ---- 纪事码映射（toast+addEvent 对 → 稳定短码；蓝本 atmTick 内 9 组固定文案） ----
const CHRON_TABLE = [
  ['雷打雪', 'tSnow'], ['雷暴降临', 'bolt'], ['月虹', 'moon'], ['雨过天青', 'rainbow'],
  ['星陨', 'meteor'], ['日食', 'eclipse'], ['血月', 'bloodMoon'], ['太阳雨', 'sunShower'], ['满月', 'fullMoon'],
];
const chronCode = (msg) => {
  for (const [p, c] of CHRON_TABLE) if (String(msg).startsWith(p)) return c;
  return 'unknown:' + String(msg).slice(0, 12);
};

// ---- stub 引擎：atmTick 路径所需最小面 ----
function makeStubEng(rngSeed, opts) {
  const events = [];
  const world = generateWorld(opts.seed);
  const sst = opts.sstPos
    ? (() => {
        const a = new Float64Array(32 * 20);
        for (let i = 0; i < a.length; i++) a[i] = i % 11 === 0 ? 0.5 : -0.25; // 仅 >0 判定生效
        return a;
      })()
    : null;
  let lastChron = null;
  let probeCalls = 0;
  const eng = {
    events,
    probeRef: { get calls() { return probeCalls; } },
    laws: { tectonics: false, atmosphere: true, seasons: true, naturalDisasters: true },
    yearF: opts.yearF,
    rng: mulberry32(rngSeed),
    terrain: world.terrain,
    worldsim: sst ? { sstAnom: sst } : null,
    natureQuake: (x, y, m) => events.push({ k: 'q', x, y, mb: bitHex(m) }),
    tsunami: (x, y, r) => events.push({ k: 't', x, y, rb: bitHex(r) }),
    rainFireProbe: (x, y) => { probeCalls++; return -1; },
    rainRegrow: (x, y) => events.push({ k: 'regrow', x, y }),
    natureFlood: (x, y) => events.push({ k: 'flood', x, y }),
    natureLightning: (x, y) => events.push({ k: 'lightning', x, y }),
    toast: (msg) => { lastChron = chronCode(msg); },
    addEvent: (cat, msg, pos) => {
      events.push({ k: 'chron', c: lastChron ?? chronCode(msg), x: pos ? pos.x : null, y: pos ? pos.y : null });
      lastChron = null;
    },
    dirty: new Set(), propsDirty: new Set(),
    units: [],
    moonIllum: () => opts.moonIllum, dayPhase: () => opts.dayPhase,
    cam: { x: opts.camX, y: opts.camY },
  };
  return eng;
}

// ---- 三场景：核心（无天象窗）/ 冬夜（月虹·流星·血月·雷打雪窗）/ 夏日（昼虹·日食·太阳雨窗） ----
const CASES = [
  { name: 'core', seed: 20261026, engRngSeed: 921, yearF: 1234.5, dayPhase: 0.5, moonIllum: 0.2, camX: 512.5, camY: 300.25, sstPos: false, moistInit: 1.0 },
  { name: 'winterNight', seed: 42, engRngSeed: 922, yearF: 1238.0, dayPhase: 0.7, moonIllum: 0.9, camX: 512.5, camY: 300.25, sstPos: true, moistInit: 0.35 },
  { name: 'summerDay', seed: 777, engRngSeed: 923, yearF: 1234.5, dayPhase: 0.2, moonIllum: 0.1, camX: 512.5, camY: 300.25, sstPos: false, moistInit: 1.0 },
];

const ATMT = 120; // 120 大气步：饱和注入下覆盖灭火钩子/复苏事件/洪水累计/闪电/骤停彩虹全分支
// per-case 饱和注入（C# 对账台同注入——公平 setup）：饱和=雨效全分支；默认 0.35=放晴夜窗（天象 rng 门）

const out = [];
for (const c of CASES) {
  const eng = makeStubEng(c.engRngSeed, c);
  const nat = new NatureSystem(eng, c.seed);
  nat.initPlates();
  nat.moist.fill(c.moistInit); // per-case 饱和/默认注入：加速雨效分支或放晴天象窗（骤停动态自然出现）

  // terrain 摘要 + base64（C# 注入同一地形）
  const terrainB64 = b64(nat.eng.terrain);
  const terrainDigest = fnv(nat.eng.terrain);

  const init = {
    moistInit: c.moistInit,
    moistDigest: fnvF32(nat.moist),
    windPhase: bitHex(nat.windPhase),
    pSystems: nat.pSystems.length,
  };

  // ---- 40 大气步演化 ----
  const ticks = [];
  const checks = {};
  const cap = (t) => {
    checks['t' + t] = {
      moist: fnvF32(nat.moist),
      ashF: fnvF32(nat.ashF),
      rain: fnvU8(nat.rainCell),
      flood: fnvF32(nat.floodAcc),
      prev: fnvU8(nat.prevRain),
      ash: bitHex(nat.ash),
      windPhase: bitHex(nat.windPhase),
      ps: nat.pSystems.map((p) => [p.kind, bitHex(p.x), bitHex(p.y), p.kind === 0 ? 'L' : 'H', bitHex(p.str), p.ttl]),
      counters: { lightning: nat.lightningN, meteors: nat.meteorsN, eclipses: nat.eclipsesN, bloodMoons: nat.bloodMoonsN, sunShowers: nat.sunShowersN },
      coolers: { bolt: nat.boltCool, rainbow: nat.rainbowCool, meteor: nat.meteorCool, eclipse: nat.eclipseCool, bloodMoon: nat.bloodMoonCool, sunShower: nat.sunShowerCool },
      ttls: { rainbow: nat.rainbowTTL, meteor: nat.meteorTTL, eclipse: nat.eclipseTTL, bloodMoon: nat.bloodMoonTTL, sunShower: nat.sunShowerTTL },
      flags: {
        bolt: nat.boltChronDone, tSnow: nat.tSnowChronDone, rainbow: nat.rainbowChronDone, moon: nat.moonChronDone,
        meteor: nat.meteorChronDone, eclipse: nat.eclipseChronDone, bloodMoon: nat.bloodMoonChronDone,
        sunShower: nat.sunShowerChronDone, fullMoon: nat.fullMoonChronDone,
        boost: nat.rainbowBoost, double: nat.rainbowDouble, moonArc: nat.rainbowMoon, wished: nat.meteorWished,
      },
      probes: nat.eng.probeRef.calls,
    };
  };
  for (let t = 1; t <= ATMT; t++) {
    eng.events.length = 0;
    nat.atmTick();
    if (eng.events.length > 0) {
      ticks.push({
        t,
        events: eng.events.map((e) => {
          if (e.k === 'chron') return ['chron', e.c, e.x, e.y];
          return [e.k, e.x, e.y];
        }),
      });
    }
    if (t === 30 || t === 60 || t === 90 || t === 120) cap(t);
  }

  // ---- 终态（全量位级） ----
  const final = {
    moistDigest: fnvF32(nat.moist),
    ashFDigest: fnvF32(nat.ashF),
    rainDigest: fnvU8(nat.rainCell),
    floodDigest: fnvF32(nat.floodAcc),
    prevDigest: fnvU8(nat.prevRain),
    ash: bitHex(nat.ash),
    windPhase: bitHex(nat.windPhase),
    ps: nat.pSystems.map((p) => [p.kind, bitHex(p.x), bitHex(p.y), bitHex(p.str), p.ttl]),
    counters: { lightning: nat.lightningN, meteors: nat.meteorsN, eclipses: nat.eclipsesN, bloodMoons: nat.bloodMoonsN, sunShowers: nat.sunShowersN },
    probes: nat.eng.probeRef.calls,
    rainbowX: bitHex(nat.rainbowX), rainbowY: bitHex(nat.rainbowY),
    meteorDx: bitHex(nat.meteorDx), meteorDy: bitHex(nat.meteorDy),
    meteorX: bitHex(nat.meteorX), meteorY: bitHex(nat.meteorY),
    eclipseX: bitHex(nat.eclipseX), eclipseY: bitHex(nat.eclipseY),
    bloodMoonX: bitHex(nat.bloodMoonX), bloodMoonY: bitHex(nat.bloodMoonY),
    coolers: { bolt: nat.boltCool, rainbow: nat.rainbowCool, meteor: nat.meteorCool, eclipse: nat.eclipseCool, bloodMoon: nat.bloodMoonCool, sunShower: nat.sunShowerCool },
    ttls: { rainbow: nat.rainbowTTL, meteor: nat.meteorTTL, eclipse: nat.eclipseTTL, bloodMoon: nat.bloodMoonTTL, sunShower: nat.sunShowerTTL, sunShowerMax: nat.sunShowerMax },
    flags: {
      bolt: nat.boltChronDone, tSnow: nat.tSnowChronDone, rainbow: nat.rainbowChronDone, moon: nat.moonChronDone,
      meteor: nat.meteorChronDone, eclipse: nat.eclipseChronDone, bloodMoon: nat.bloodMoonChronDone,
      sunShower: nat.sunShowerChronDone, fullMoon: nat.fullMoonChronDone,
      boost: nat.rainbowBoost, double: nat.rainbowDouble, moonArc: nat.rainbowMoon, wished: nat.meteorWished,
    },
  };

  // ---- stub rng 消耗对账（计数包装重放全程 + 尾抽 4 步流指纹） ----
  const eng2 = makeStubEng(c.engRngSeed, c);
  const rngRaw = eng2.rng;
  let rngCount = 0;
  eng2.rng = () => { rngCount++; return rngRaw(); };
  const nat2 = new NatureSystem(eng2, c.seed);
  nat2.initPlates();
  nat2.moist.fill(c.moistInit);
  for (let t = 0; t < ATMT; t++) nat2.atmTick();
  const tail = [];
  for (let i = 0; i < 4; i++) tail.push(bitHex(eng2.rng()));

  out.push({
    name: c.name, seed: c.seed, engRngSeed: c.engRngSeed,
    yearF: c.yearF, dayPhase: c.dayPhase, moonIllum: c.moonIllum, camX: c.camX, camY: c.camY,
    terrainB64, terrainDigest, sstPos: c.sstPos, init, ticks, checks, final, rngCount, rngTail: tail,
  });
}

const summary = out.map((o) => {
  const f = o.final;
  return `${o.name}: lightning=${f.counters.lightning} meteors=${f.counters.meteors} eclipses=${f.counters.eclipses} bloodMoons=${f.counters.bloodMoons} sunShowers=${f.counters.sunShowers} pSys=${f.ps.length} rngDraws=${o.rngCount} probes=${f.probes}`;
});
writeFileSync(new URL('./golden-atmosphere.json', import.meta.url), JSON.stringify(out));
console.log('golden-atmosphere.json written,', out.length, 'cases');
console.log(summary.join('\n'));
