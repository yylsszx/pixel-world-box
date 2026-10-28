#!/usr/bin/env node
// ============================================================
// verify-csharp-port.mjs — C# 翻译的沙箱侧近似验证（M-U2a）
// 沙箱无 dotnet/Unity → C# 逻辑无法直接执行。本脚本把 C# 三段核心逻辑
// （WbRng.mulberry32 / WbMath.FdHypot / WbArena 布局序列）逐行转写为 JS，
// 与 wasm 真实现位级对账——转写自 C# 源（非蓝本），对账基准是 wasm：
//   1. mulberry32: vs src/lib/game/noise.ts 真实现（100 万样本）
//   2. fd_hypot:   vs wasm wb_math_test(op=5)（20 万随机样本，含极端值）
//   3. 布局 offs:  vs 黄金 JSON meta.offs（wasm wb_off 全 154 项）
// 权威验证仍是用户侧 Unity Test Runner（WbGoldenTests.cs）。
// ============================================================
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
// Node 24 原生 strip-types 对 types.ts 无后缀 bare import 解析失败（noise→types→items 链）——统一走 jiti
const { createJiti: _cj } = await import('jiti');
const _jiti0 = _cj(import.meta.url, { alias: { '@': path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src') } });
const { mulberry32 } = await _jiti0.import(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/lib/game/noise.ts'));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// —— 1) mulberry32：WbRng.cs unchecked uint 语义的 JS 转写 ——
function mulberry32Csharp(a) {
  // 返回 () => f64；逐行对应 WbRng.Mulberry32Next
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;                       // a = a + 0x6d2b79f5u
    let t = (a ^ (a >>> 15)) >>> 0;                   // t = a ^ (a >> 15)
    t = Math.imul(t, (1 | a) >>> 0) >>> 0;            // t = t * (1 | a)
    const inner = Math.imul((t ^ (t >>> 7)) >>> 0, (61 | t) >>> 0) >>> 0;
    const t2 = ((t + inner) >>> 0) ^ t;               // t2 = (t + ...) ^ t
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296.0; // (uint)(t2 ^ (t2 >> 14)) / 2^32
  };
}
let rngFail = 0;
const refNext = mulberry32(0x12345678);
const csharpNext = mulberry32Csharp(0x12345678);
for (let i = 0; i < 1_000_000; i++) {
  if (refNext() !== csharpNext()) { rngFail++; if (rngFail < 5) console.error(`  mulberry32 mismatch @${i}`); }
}
console.log(`mulberry32: ${rngFail === 0 ? 'PASS' : `FAIL(${rngFail})`} (1e6 samples vs noise.ts)`);

// —— 2) fd_hypot：WbMath.FdHypot 的 JS 转写（位操作用 DataView） ——
const _b8 = new ArrayBuffer(8);
const _f64v = new Float64Array(_b8);
const _u32v = new Uint32Array(_b8);
const bitsOf = (x) => { _f64v[0] = x; return [_u32v[0], _u32v[1]]; };   // [lo, hi]
const fromBits = (lo, hi) => { _u32v[0] = lo >>> 0; _u32v[1] = hi >>> 0; return _f64v[0]; };
const hiOf = (x) => bitsOf(x)[1] | 0;
const loOf = (x) => bitsOf(x)[0] >>> 0;
const setHi = (x, h) => { const [lo] = bitsOf(x); return fromBits(lo, h >>> 0); };

function fdHypotCsharp(x, y) {
  let a = x, b = y;
  let ha = hiOf(x) & 0x7fffffff;
  let hb = hiOf(y) & 0x7fffffff;
  if (hb > ha) { [a, b] = [b, a]; [ha, hb] = [hb, ha]; }
  a = setHi(a, ha); b = setHi(b, hb);
  if (ha - hb > 0x3c00000) return a + b;
  let k = 0;
  if (ha > 0x5f300000) {
    if (ha >= 0x7ff00000) {
      let w = a + b;
      if (((ha & 0xfffff) >>> 0 | loOf(a)) === 0) w = a;
      if ((((hb >>> 0) ^ 0x7ff00000) | loOf(b)) === 0) w = b;
      return w;
    }
    ha -= 0x25800000; hb -= 0x25800000; k += 600;
    a = setHi(a, ha); b = setHi(b, hb);
  }
  if (hb < 0x20b00000) {
    if (hb <= 0x000fffff) {
      if (((hb >>> 0) | loOf(b)) === 0) return a;
      const t1 = setHi(0.0, 0x7fd00000);
      b *= t1; a *= t1; k -= 1022;
    } else {
      ha += 0x25800000; hb += 0x25800000; k -= 600;
      a = setHi(a, ha); b = setHi(b, hb);
    }
  }
  let w = a - b;
  let t1, t2;
  if (w > b) {
    t1 = setHi(0.0, ha);
    t2 = a - t1;
    w = Math.sqrt(t1 * t1 - (b * (-b) - t2 * (a + t1)));
  } else {
    a = a + a;
    const y1 = setHi(0.0, hb);
    const y2 = b - y1;
    t1 = setHi(0.0, (ha + 0x00100000) | 0);
    t2 = a - t1;
    w = Math.sqrt(t1 * y1 - (w * (-w) - (t1 * y2 + t2 * b)));
  }
  if (k !== 0) {
    let t1c = 1.0;
    t1c = setHi(t1c, (hiOf(t1c) + (k << 20)) | 0);
    return t1c * w;
  }
  return w;
}

// wasm 真实现对账（wb_math_test op=5 = hypot）
const mod = await WebAssembly.instantiate(readFileSync(path.join(ROOT, 'public/wasm/wbcore.wasm')), {});
const ex = mod.instance.exports;
// 布置一个合法 wb_init 状态（wb_math_test 不依赖 arena，但保险起见）
ex.wb_init(256, 160, 4096);
const wasmHypot = (y, x) => {
  const [_ylo, _yhi] = bitsOf(y); const [_xlo, _xhi] = bitsOf(x);
  const r = ex.wb_math_test(BigInt(_yhi) << 32n | BigInt(_ylo >>> 0), BigInt(_xhi) << 32n | BigInt(_xlo >>> 0), 5);
  return fromBits(Number(r & 0xffffffffn), Number(r >> 32n));
};
function* sampleGen(n) {
  // 随机位模式 + 结构化值（含 subnormal/极端/整数）
  const structured = [0, 1, -1, 0.5, 3, 10, 4, 1e-300, 1e300, 3e38, -3e38, 0.08, 0.16, 10.77, 123.456, 1e-7];
  for (const v of structured) { yield [v, v]; yield [v, -v]; yield [v, 0]; yield [0, v]; yield [v, 1]; }
  let s = 0x9e3779b9;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    const f = () => {
      const bits = (BigInt(rnd() * 4294967296) << 32n) | BigInt(rnd() * 4294967296);
      _u32v[0] = Number(bits & 0xffffffffn); _u32v[1] = Number(bits >> 32n);
      return _f64v[0];
    };
    yield [f(), f()];
  }
}
let hypotFail = 0, hypotN = 0;
for (const [y, x] of sampleGen(200000)) {
  hypotN++;
  const expected = wasmHypot(y, x);
  const actual = fdHypotCsharp(y, x);
  const [elo, ehi] = bitsOf(expected); const [alo, ahi] = bitsOf(actual);
  if (elo !== alo || ehi !== ahi) {
    hypotFail++;
    if (hypotFail < 5) console.error(`  hypot mismatch: y=${y} x=${x} wasm=${expected} csharp=${actual}`);
  }
}
console.log(`fd_hypot: ${hypotFail === 0 ? 'PASS' : `FAIL(${hypotFail})`} (${hypotN} samples vs wasm wb_math_test)`);

// —— 3) 布局 offs：WbArena.Init 的 Place/Align8 序列转写 vs 黄金 meta.offs ——
const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/units_move.json'), 'utf8'));
const MAX_RACES = 512, MAX_CIVS = 64, PANIC_CAP = 32, GRUDGE_CAP = 32, MAX_UNITS = 4096, TILES = 40960;
const MAX_FAM = 256, MAX_BLD = 1024, MAX_ITEMS = 256, MAX_TRAITS = 32, MAX_ITEMDEFS = 128;
const ACT_CAP = 262144, FXMIN_CAP = 1600, UG_CAP = 8, N_REGIONS = 154;
const RESULT_BYTES = 424;
// OFF id 全表（lib.rs L99-259 权威值，WbConstants.cs 同源）
const id = {
  UX:0,UY:1,UPANIC:2,GVALS:3,UCIV:4,URACE:5,UID:6,UCELL:7,GIDS:8,CELL_START:9,CELL_ITEMS:10,
  RACE_FLAGS:11,DYN_PARENT:12,ATWAR:13,UDEAD:14,UHASPANIC:15,RESULT:16,CELL_CURSOR:17,
  UTX:18,UTY:19,UHP:20,UMAXHP:21,UDMG:22,USPEED:23,UAGE:24,UMAXAGE:25,UKILLS:26,UCD:27,UFD:28,
  UBREATH:29,ULX:30,ULY:31,USXK:32,USYK:33,USTK:34,UATK:35,UCHILL:36,UFLEET:37,UBLESS:38,
  UCURSE:39,UFERT:40,UDETOUR:41,UHURT:42,UJOB:43,UTRAIT:44,UINF:45,UFLIP:46,UPAR:47,UBOAT:48,
  UBTL:49,UCVN:50,UARMY:51,UGEAR:52,UGENE:53,UFAM:54,UFGN:55,UNAME:56,UGLN:57,UGIDS:58,UGVAL:59,
  TERR:60,FIREG:61,RAD:62,ROAD:63,BLDK:64,OWN:65,BIDX:66,
  CIVN:67,CVPOP:68,CVHOU:69,CVGLD:70,CVCAP:71,CVAL:72,CVGOV:73,CVTECH:74,CVDIR:75,CVPC:76,CVMKT:77,
  FAMN:78,FMID:79,FMRACE:80,FMNUM:81,FMSEQ:82,FMNAME:83,
  BLDN:84,BLDI:85,BLDXY:86,BLDC:87,BLDHP:88,BLDDMG:89,
  ITMN:90,ITMK:91,ITMXY:92,NEUW:93,NCTL:94,RNGS:95,TICK:96,FRAME:97,PAR:98,USEQ:99,EPS:100,
  LAWS:101,FXP:102,FXLEN:103,FXMIN:104,FXMINN:105,WILD:106,GRASS:107,DAYPH:108,REPRM:109,PREY:110,
  SPB:111,SPBH:112,TRN:113,TRDMG:114,TRHP:115,TRSPD:116,TRREG:117,TRFL:118,CNT:119,
  ACT:120,ACTN:121,BAILK:122,BAILS:123,BAILL:124,BAILP:125,DIRTY:126,DLIST:127,DLISTN:128,BATCHR:129,
  TBR:130,TBF:131,TBJ:132,TBI:133,TBIN:134,FRSTOFF:135,FRSTN:136,FRSTP:137,FAMP:138,TBT:139,
  MLOOT:140,NEUCALL:141,COLEN:142,DMGL:143,DMGN:144,FIREN:145,WILDCAP:146,MONCAP:147,MISC:148,
  GUNBM:150,BEAMBM:151,TBHP:149,
};
let off = 0;
const offs = new Array(N_REGIONS).fill(0);
const place = (rid, bytes) => { offs[rid] = off; off += bytes; };
const align8 = () => { off = (off + 7) & ~7; };
const bw = 256, bh = 160, cells = bw * bh, nu = MAX_UNITS;
align8();
place(id.UX, nu * 8); place(id.UY, nu * 8); place(id.UPANIC, nu * 8); place(id.GVALS, GRUDGE_CAP * 8);
place(id.UCIV, nu * 4); place(id.URACE, nu * 4); place(id.UID, nu * 4); place(id.UCELL, nu * 4);
place(id.GIDS, GRUDGE_CAP * 4); place(id.CELL_START, (cells + 1) * 4); place(id.CELL_ITEMS, nu * 4);
place(id.RACE_FLAGS, MAX_RACES);
const lutOff = (off + 7) & ~7;
off = lutOff + MAX_RACES * MAX_RACES;
place(id.DYN_PARENT, MAX_RACES * 4); place(id.ATWAR, MAX_CIVS * MAX_CIVS);
place(id.UDEAD, nu); place(id.UHASPANIC, nu);
align8();
offs[id.RESULT] = off; off += RESULT_BYTES;
place(id.CELL_CURSOR, (cells + 1) * 4);
align8(); align8();
place(id.UTX, nu * 8); align8(); place(id.UTY, nu * 8); align8(); place(id.UHP, nu * 8);
align8(); place(id.UMAXHP, nu * 8); align8(); place(id.UDMG, nu * 8); align8(); place(id.USPEED, nu * 8);
align8(); place(id.UAGE, nu * 8); align8(); place(id.UMAXAGE, nu * 8); align8(); place(id.UKILLS, nu * 8);
align8(); place(id.UCD, nu * 8); align8(); place(id.UFD, nu * 8); align8(); place(id.UBREATH, nu * 8);
align8(); place(id.ULX, nu * 8); align8(); place(id.ULY, nu * 8); align8(); place(id.USXK, nu * 8);
align8(); place(id.USYK, nu * 8); align8(); place(id.USTK, nu * 4); align8(); place(id.UATK, nu * 8);
align8(); place(id.UCHILL, nu * 8); align8(); place(id.UFLEET, nu * 8); align8(); place(id.UBLESS, nu * 8);
align8(); place(id.UCURSE, nu * 8); align8(); place(id.UFERT, nu * 8); align8(); place(id.UDETOUR, nu * 8);
align8(); place(id.UHURT, nu * 8); align8(); place(id.UJOB, nu * 4); align8(); place(id.UTRAIT, nu * 4);
align8(); place(id.UINF, nu); align8(); place(id.UFLIP, nu); align8(); place(id.UPAR, nu);
align8(); place(id.UBOAT, nu); align8(); place(id.UBTL, nu * 4); align8(); place(id.UCVN, nu * 4);
align8(); place(id.UARMY, nu * 4); align8(); place(id.UGEAR, nu * 7 * 4); align8(); place(id.UGENE, nu * 4 * 8);
align8(); place(id.UFAM, nu * 4); align8(); place(id.UFGN, nu * 4); align8(); place(id.UNAME, nu * 32);
align8(); place(id.UGLN, nu * 4); align8(); place(id.UGIDS, nu * UG_CAP * 4); align8(); place(id.UGVAL, nu * UG_CAP * 8);
align8(); place(id.TERR, TILES); align8(); place(id.FIREG, TILES); align8(); place(id.RAD, TILES);
align8(); place(id.ROAD, TILES); align8(); place(id.BLDK, TILES); align8(); align8();
place(id.OWN, TILES * 2); align8(); place(id.BIDX, TILES * 4);
align8(); place(id.CIVN, 4); align8(); place(id.CVPOP, MAX_CIVS * 8); align8(); place(id.CVHOU, MAX_CIVS * 8);
align8(); place(id.CVGLD, MAX_CIVS * 8); align8(); place(id.CVCAP, MAX_CIVS * 4); align8(); place(id.CVAL, MAX_CIVS);
align8(); place(id.CVGOV, MAX_CIVS * 4); align8(); place(id.CVTECH, MAX_CIVS * 24 * 8); align8(); place(id.CVDIR, MAX_CIVS);
align8(); place(id.CVPC, MAX_CIVS * 8); align8(); place(id.CVMKT, MAX_CIVS * 4);
align8(); place(id.FAMN, 4); align8(); place(id.FMID, MAX_FAM * 4); align8(); place(id.FMRACE, MAX_FAM * 4);
align8(); place(id.FMNUM, MAX_FAM * 6 * 8); align8(); place(id.FMSEQ, 4); align8(); place(id.FMNAME, MAX_FAM * 2 * 2);
align8(); place(id.BLDN, 4); align8(); place(id.BLDI, MAX_BLD * 4); align8(); place(id.BLDXY, MAX_BLD * 2 * 4);
align8(); place(id.BLDC, MAX_BLD * 4); align8(); place(id.BLDHP, MAX_BLD * 8); align8(); place(id.BLDDMG, MAX_BLD);
align8(); place(id.ITMN, 4); align8(); place(id.ITMK, MAX_ITEMS * 4); align8(); place(id.ITMXY, MAX_ITEMS * 2 * 8);
align8(); place(id.NEUW, 2048 * 8); align8(); place(id.NCTL, 1);
align8(); place(id.RNGS, 4); align8(); place(id.TICK, 4); align8(); place(id.FRAME, 4); align8(); place(id.PAR, 1);
align8(); place(id.USEQ, 4); align8(); place(id.EPS, 16 * 8); align8(); place(id.LAWS, 1); align8(); place(id.FXP, 1);
align8(); place(id.FXLEN, 4); align8(); place(id.FXMIN, FXMIN_CAP * 4); align8(); place(id.FXMINN, 4);
align8(); place(id.WILD, MAX_RACES * 4); align8(); place(id.GRASS, 8); align8(); place(id.DAYPH, 8);
align8(); place(id.REPRM, 8); align8(); place(id.PREY, 640 * 2); align8(); place(id.SPB, MAX_RACES * 4 * 8);
align8(); place(id.SPBH, MAX_RACES); align8(); place(id.TRN, 4); align8(); place(id.TRDMG, MAX_TRAITS * 8);
align8(); place(id.TRHP, MAX_TRAITS * 8); align8(); place(id.TRSPD, MAX_TRAITS * 8); align8(); place(id.TRREG, MAX_TRAITS * 8);
align8(); place(id.TRFL, MAX_TRAITS); align8(); place(id.CNT, 16 * 8);
align8(); place(id.ACT, ACT_CAP); align8(); place(id.ACTN, 4); align8(); place(id.BAILK, 4);
align8(); place(id.BAILS, 4); align8(); place(id.BAILL, 4); align8(); place(id.BAILP, 8 * 8);
align8(); place(id.DIRTY, (MAX_UNITS + 7) / 8); align8(); place(id.DLIST, MAX_UNITS * 4);
align8(); place(id.DLISTN, 4); align8(); place(id.BATCHR, 8 * 4);
align8(); place(id.TBR, MAX_RACES * 12 * 8); align8(); place(id.TBF, MAX_RACES * 2); align8(); place(id.TBJ, 7 * 5 * 8);
align8(); place(id.TBI, MAX_ITEMDEFS * 12 * 8); align8(); place(id.TBIN, 4); align8(); place(id.FRSTOFF, MAX_RACES * 4);
align8(); place(id.FRSTN, MAX_RACES * 4); align8(); place(id.FRSTP, 16384); align8(); place(id.FAMP, 1024);
align8(); place(id.TBT, 16); align8(); place(id.MLOOT, MAX_RACES); align8(); place(id.NEUCALL, 3 * 4);
align8(); place(id.COLEN, 1); align8(); place(id.DMGL, MAX_BLD * 4); align8(); place(id.DMGN, 4);
align8(); place(id.FIREN, 4); align8(); place(id.WILDCAP, MAX_RACES * 4); align8(); place(id.MONCAP, MAX_RACES * 4);
align8(); place(id.MISC, 32 * 4); align8(); place(id.GUNBM, 4 * 4); align8(); place(id.BEAMBM, 4 * 4);
align8(); place(id.TBHP, 16 * 8);

let layoutFail = 0;
for (let i = 0; i < N_REGIONS; i++) {
  if (offs[i] !== golden.meta.offs[i]) {
    layoutFail++;
    if (layoutFail < 6) console.error(`  offs[${i}] wasm=${golden.meta.offs[i]} sim=${offs[i]}`);
  }
}
console.log(`layout offs: ${layoutFail === 0 ? 'PASS' : `FAIL(${layoutFail})`} (${N_REGIONS} regions vs wasm wb_off)`);

// —— 4) M-U2b：WbUnits.ScanSingle（wb_scan C# 版）JS 转写 vs wasm 随机场景对账 ——
// 转写自 C# 源（WbUnits.cs ScanSingle/IsEnemySlot/IsEnemyFull/IsHerbivore/UPanic0 +
// WriteI32Raw/WriteU32Raw/WriteF64Raw）——不从蓝本重推。LUT 用独立数组演化，
// 终态与 wasm LUT 区域字节对账（防「用 wasm 验 wasm」循环论证的同时覆盖 LUT 行为）。
{
  const wasmBytes2 = readFileSync(path.join(ROOT, 'public/wasm/wbcore.wasm'));
  const mod2 = await WebAssembly.instantiate(wasmBytes2, {});
  const ex = mod2.instance.exports;
  const mem = ex.memory;
  const W = 256, H = 160, MAX_UNITS = 4096;
  const ID = { GVALS: 3, UCIV: 4, URACE: 5, UID: 6, UCELL: 7, GIDS: 8, UDEAD: 14, UHASPANIC: 15, RESULT: 16, UX: 0, UY: 1, UPANIC: 2, CELL_START: 9, CELL_ITEMS: 10, RACE_FLAGS: 11, DYN_PARENT: 12, ATWAR: 13, OFF: 0 };
  const MAX_RACES = 512, MAX_CIVS = 64, PANIC_CAP = 32, GRUDGE_CAP = 32;
  const F_UNDEAD = 4, F_HOSTILE = 1, F_CIV = 2, F_PREDATOR = 8, F_HERBIVORE = 16;
  const R_ZOMBIE = 5, R_BEAR = 8, R_DRAGON = 9, R_SCORPION = 13, R_SNAKE = 14, R_SKELETON = 16, R_DEMON = 17, R_WHITEWALKER = 23, R_KRAKEN = 25, R_SANDWORM = 26, R_BASILISK = 27;

  const dv = () => new DataView(mem.buffer);
  const u8 = (id, i) => new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(id))[i];
  const setU8 = (id, i, v) => { new Uint8Array(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(id))[i] = v & 0xff; };
  const setU32 = (id, i, v) => dv().setUint32(ex.wb_arena_ptr() + ex.wb_off(id) + i * 4, v >>> 0, true);
  const setI32 = (id, i, v) => dv().setInt32(ex.wb_arena_ptr() + ex.wb_off(id) + i * 4, v | 0, true);
  const setF64 = (id, i, v) => dv().setFloat64(ex.wb_arena_ptr() + ex.wb_off(id) + i * 8, v, true);
  const getF64 = (id, i) => dv().getFloat64(ex.wb_arena_ptr() + ex.wb_off(id) + i * 8, true);
  const getU32 = (id, i) => dv().getUint32(ex.wb_arena_ptr() + ex.wb_off(id) + i * 4, true);
  const getI32 = (id, i) => dv().getInt32(ex.wb_arena_ptr() + ex.wb_off(id) + i * 4, true);

  // —— C# 转写：IsHerbivore（WbUnits.cs，lib.rs L355-368 链上溯） ——
  const isHerbivoreCS = (r0) => {
    let r = r0 >>> 0;
    for (let i = 0; i < 32; i++) {
      if ((u8(ID.RACE_FLAGS, r) & F_HERBIVORE) !== 0) return true;
      const p = getI32(ID.DYN_PARENT, r);
      if (p < 0) return false;
      r = p >>> 0;
    }
    return false;
  };
  // —— C# 转写：IsEnemyFull（WbUnits.cs，机械序） ——
  const isEnemyFullCS = (a, b) => {
    const ra = getU32(ID.URACE, a) | 0, rb = getU32(ID.URACE, b) | 0;
    const fa = u8(ID.RACE_FLAGS, ra), fb = u8(ID.RACE_FLAGS, rb);
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
    if ((fa & F_PREDATOR) !== 0 && isHerbivoreCS(rb >>> 0)) return true;
    if ((fa & F_PREDATOR) !== 0 && ra === R_BEAR && (fb & F_CIV) !== 0) return true;
    if (ra === R_SCORPION && isHerbivoreCS(rb >>> 0)) return true;
    if (ra === R_SNAKE && (isHerbivoreCS(rb >>> 0) || rb === R_SCORPION)) return true;
    const ca = getI32(ID.UCIV, a), cb = getI32(ID.UCIV, b);
    if (ca >= 0 && cb >= 0 && ca !== cb) return u8(ID.ATWAR, ca * MAX_CIVS + cb) !== 0;
    return false;
  };
  // —— C# 转写：IsEnemySlot + 独立 LUT（WbUnits.cs LutGet/LutSet 用独立 Uint8Array） ——
  const lutCS = new Uint8Array(MAX_RACES * MAX_RACES);
  const isEnemySlotCS = (a, b) => {
    if (getI32(ID.UCIV, a) < 0 && getI32(ID.UCIV, b) < 0) {
      const ra = getU32(ID.URACE, a) | 0, rb = getU32(ID.URACE, b) | 0;
      const key = ra * MAX_RACES + rb;
      const hit = lutCS[key];
      if (hit === 1) return false;
      if (hit === 2) return true;
      const r = isEnemyFullCS(a, b);
      lutCS[key] = r ? 2 : 1;
      return r;
    }
    return isEnemyFullCS(a, b);
  };
  // —— C# 转写：UPanic0 ——
  const uPanic0CS = (s) => u8(ID.UHASPANIC, s) !== 0 ? getF64(ID.UPANIC, s) : 0.0;
  // —— C# 转写：ScanSingle 全量（WbUnits.cs；RESULT 写到独立 buffer，panic 直写 wasm 镜像前先快照）
  const jsMin = (x, y) => (Math.min(x, y)); // C# WbMath.JsMin 语义见下（NaN 传染版）；场景值均有限，等价
  function scanSingleCS(slot, cx, cy, contagious, gLen) {
    const s = slot | 0;
    // N 守卫：转写侧由调用者传 n（与 wasm 侧 st.n = pack_end(n) 同步）
    const n = scanSingleCS._n;
    if ((s >>> 0) >= n) return { rc: 0 };
    const bw = W, bh = H;
    const uxx = getF64(ID.UX, s), uyy = getF64(ID.UY, s);
    const uCiv = getI32(ID.UCIV, s), uRace = getU32(ID.URACE, s);
    const upanic0 = uPanic0CS(s);
    const hasG = gLen >= 0;
    const gn = gLen > 0 ? gLen : 0;
    let enemy = -1, bestD = 7.0, enemyD = 7.0, allies = 0, foes = 0, panicN = 0, overflow = 0;
    const panicSlots = new Uint32Array(PANIC_CAP), panicVals = new Float64Array(PANIC_CAP);
    const panicMirror = []; // C# 直写镜像（等 wasm 侧写完对比）
    let by = cy - 1;
    while (by <= cy + 1) {
      if (by < 0 || by >= bh) { by += 1; continue; }
      let bx = cx - 1;
      while (bx <= cx + 1) {
        if (bx < 0 || bx >= bw) { bx += 1; continue; }
        const cell = by * bw + bx;
        const start = getU32(ID.CELL_START, cell) >>> 0, end = getU32(ID.CELL_START, cell + 1) >>> 0;
        let k = start;
        while (k < end) {
          const other = getU32(ID.CELL_ITEMS, k) | 0;
          k += 1;
          if (u8(ID.UDEAD, other) !== 0 || other === s) continue;
          const ddx = getF64(ID.UX, other) - uxx, ddy = getF64(ID.UY, other) - uyy;
          if (isEnemySlotCS(s, other)) {
            foes += 1;
            const d2 = ddx * ddx + ddy * ddy;
            if (!hasG && d2 >= bestD * bestD) continue;
            const d = Math.sqrt(d2);
            let wd = d;
            if (hasG) {
              const oid = getU32(ID.UID, other);
              let gi = -1;
              for (let t = 0; t < gn; t++) { if ((getI32(ID.GIDS, t) >>> 0) === oid) { gi = t; break; } }
              if (gi >= 0) {
                const gv = getF64(ID.GVALS, gi);
                wd = d * (1.0 - 0.42 * jsMin(1.0, gv / 2.0));
              }
            }
            if (wd < bestD) { bestD = wd; enemy = other; enemyD = d; }
          } else if (uCiv >= 0 ? getI32(ID.UCIV, other) === uCiv : getU32(ID.URACE, other) === uRace) {
            allies += 1;
            if (contagious) {
              const oPanic = uPanic0CS(other);
              if (oPanic < upanic0 - 0.15 && ddx * ddx + ddy * ddy < 16.0) {
                const np = jsMin(1.0, oPanic + upanic0 * 0.4);
                panicMirror.push([other, np]); // C# 直写（不 dirty）
                if (panicN < PANIC_CAP) { panicSlots[panicN] = other >>> 0; panicVals[panicN] = np; panicN += 1; }
                else overflow = 1;
              }
            }
          }
        }
        bx += 1;
      }
      by += 1;
    }
    // RESULT 424B（独立 buffer LE 序——WriteI32/U32/F64Raw 转写）
    const buf = new ArrayBuffer(424), w = new DataView(buf);
    w.setInt32(0, enemy, true); w.setInt32(4, overflow, true);
    w.setFloat64(8, bestD, true); w.setFloat64(16, enemyD, true);
    w.setUint32(24, allies, true); w.setUint32(28, foes, true);
    w.setUint32(32, panicN, true); w.setUint32(36, 0, true);
    for (let i = 0; i < PANIC_CAP; i++) w.setUint32(40 + i * 4, panicSlots[i], true);
    for (let i = 0; i < PANIC_CAP; i++) w.setFloat64(168 + i * 8, panicVals[i], true);
    return { rc: overflow !== 0 ? 2 : 1, buf, panicMirror };
  }
  scanSingleCS._n = 0;

  // —— 随机场景双跑 ——
  const RACE_POOL = [6, 8, 5, 4, 9, 25, 26, 16, 100, 101];
  const FLAG_POOL = { 6: F_HERBIVORE, 8: F_PREDATOR, 5: F_HOSTILE | F_UNDEAD, 4: F_HOSTILE, 9: F_HOSTILE | F_PREDATOR, 25: F_HOSTILE, 26: F_HOSTILE, 16: F_HOSTILE | F_UNDEAD, 100: F_CIV, 101: F_CIV };
  let scanFail = 0, lutFail = 0, panicFail = 0, lutOff;
  // mulberry32 场景随机源（确定性）
  let rs = 0x12345678;
  const rnd = () => { rs = (rs + 0x6d2b79f5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  for (let round = 0; round < 120; round++) {
    ex.wb_init(W, H, MAX_UNITS);
    // lutOff 推导（C# WbArena 布局同款：RACE_FLAGS 后对齐）
    lutOff = (ex.wb_off(ID.RACE_FLAGS) + MAX_RACES + 7) & ~7;
    lutCS.fill(0);
    // 种族表
    for (const r of RACE_POOL) { setU8(ID.RACE_FLAGS, r, FLAG_POOL[r]); setU8(11, r, FLAG_POOL[r]); }
    // 随机单位 2-9 只，聚在 (60..76, 60..76)（9 桶邻域）
    const n = 2 + Math.floor(rnd() * 8);
    for (let i = 0; i < n; i++) {
      const race = RACE_POOL[Math.floor(rnd() * RACE_POOL.length)];
      const x = 60 + rnd() * 16, y = 60 + rnd() * 16;
      setU32(ID.UID, i, i + 10); setU32(ID.URACE, i, race);
      setU32(ID.UCELL, i, Math.floor(y / 4) * W + Math.floor(x / 4));
      setF64(ID.UX, i, x); setF64(ID.UY, i, y);
      setF64(ID.UTX, i, x); setF64(ID.UTY, i, y);
      setF64(ID.USPEED, i, 0.08); setF64(ID.UHP, i, 100); setF64(ID.UMAXHP, i, 100);
      setF64(ID.UMAXAGE, i, 9999); setF64(ID.UFD, i, NaN);
      setI32(ID.UCIV, i, rnd() < 0.5 ? -1 : Math.floor(rnd() * 3));
      setI32(ID.UJOB, i, -1); setI32(ID.UARMY, i, -1); setI32(ID.UGLN, i, -1);
      setI32(ID.UFAM, i, -1); setI32(ID.UFGN, i, -1); setI32(ID.USTK, i, 0);
      setU8(ID.UDEAD, i, rnd() < 0.12 ? 1 : 0);
      const hasP = rnd() < 0.6;
      setU8(ID.UHASPANIC, i, hasP ? 1 : 0); setF64(ID.UPANIC, i, hasP ? +(rnd() * 0.95).toFixed(3) : 0);
      setU8(ID.UINF, i, 0); setU8(ID.UBOAT, i, 0); setU8(ID.UFLIP, i, 0);
      for (let g = 0; g < 4; g++) setF64(53, i * 4 + g, 1);
    }
    // civ 战争矩阵随机
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) setU8(ID.ATWAR, a * MAX_CIVS + b, rnd() < 0.3 ? 1 : 0);
    // grudge 平面表
    const gLen = rnd() < 0.4 ? 1 + Math.floor(rnd() * 2) : -1;
    if (gLen > 0) for (let t = 0; t < gLen; t++) { setI32(ID.GIDS, t, 10 + Math.floor(rnd() * n)); setF64(ID.GVALS, t, +(rnd() * 3).toFixed(2)); }
    ex.wb_pack_end(n);
    scanSingleCS._n = n;
    // 快照 panic 基线（对比直写镜像）
    const panicBefore = Array.from({ length: n }, (_, i) => [u8(ID.UHASPANIC, i), getF64(ID.UPANIC, i)]);
    const slot = Math.floor(rnd() * n);
    const cx = 15, cy = 15;
    const contagious = rnd() < 0.5;
    // wasm 先跑
    const rcW = ex.wb_scan(slot, cx, cy, contagious ? 1 : 0, gLen);
    const roW = Buffer.from(mem.buffer, ex.wb_arena_ptr() + ex.wb_off(ID.RESULT), 424);
    const panicAfterW = Array.from({ length: n }, (_, i) => [u8(ID.UHASPANIC, i), getF64(ID.UPANIC, i)]);
    // C# 转写后跑（注意：panic 直写会改 wasm 内存——先快照 wasm 写完的状态再跑转写）
    const rCS = scanSingleCS(slot, cx, cy, contagious, gLen);
    const bufHex = Buffer.from(rCS.buf).toString('hex');
    const roHexW = roW.toString('hex');
    if (rcW !== rCS.rc || bufHex !== roHexW) {
      scanFail++;
      if (scanFail < 4) {
        console.error(`  scan mismatch @round${round}: rc ${rcW} vs ${rCS.rc}`);
        for (let i = 0; i < 424; i++) if (bufHex[i * 2] !== roHexW[i * 2] || bufHex[i * 2 + 1] !== roHexW[i * 2 + 1]) { console.error(`    首 diff @byte${i}`); break; }
      }
    }
    // panic 镜像对比（转写记录 vs wasm 实写差分）
    const wWrites = [];
    for (let i = 0; i < n; i++) {
      const [h0, p0] = panicBefore[i], [h1, p1] = panicAfterW[i];
      if (h1 === 1 && !(h0 === 1 && p0 === p1)) wWrites.push([i, p1]);
    }
    const mWrites = rCS.panicMirror.map(([o, np]) => [o, np]);
    if (JSON.stringify(wWrites) !== JSON.stringify(mWrites)) {
      panicFail++;
      if (panicFail < 4) console.error(`  panic mirror mismatch @round${round}: wasm=${JSON.stringify(wWrites)} cs=${JSON.stringify(mWrites)}`);
    }
    // LUT 终态对比（转写独立 LUT vs wasm LUT 区域）
    const lutW = new Uint8Array(mem.buffer, ex.wb_arena_ptr() + lutOff, 512 * 512);
    for (let i = 0; i < 512 * 512; i++) {
      if (lutW[i] !== lutCS[i]) { lutFail++; if (lutFail < 4) console.error(`  LUT mismatch @round${round} key=${i} wasm=${lutW[i]} cs=${lutCS[i]}`); break; }
    }
  }
  console.log(`scan (C# JS 转写 vs wasm wb_scan): ${scanFail === 0 && panicFail === 0 && lutFail === 0 ? 'PASS' : `FAIL(scan=${scanFail} panic=${panicFail} lut=${lutFail})`} (120 随机场景 × 424B 逐位 + panic 镜像 + LUT 终态)`);
  var scanVerifyFail = scanFail + panicFail + lutFail;
}

// ============================================================
// 5) M-U2c：fdlibm 六件套（WbMath.FdExp/FdExpm1/FdTanh/FdAtan/FdAtan2/FdSin/FdCos
//    的 JS 转写 = combat-transcript 导出）vs wasm wb_math_test(op=0..4) + 战斗树转写对账
// ============================================================
// Node 24 下 gen-units-* 的原生 import 链（types→items 无后缀）解析失败 → 全部走 jiti 动态加载
const mScan = await _jiti0.import(new URL('./gen-units-scan.mjs', import.meta.url).pathname);
const mCombat = await _jiti0.import(new URL('./combat-transcript.mjs', import.meta.url).pathname);
const mCombatGen = await _jiti0.import(new URL('./gen-units-combat.mjs', import.meta.url).pathname);
const gex = mScan.ex;
const transcriptBatch = mCombat.unitsBatch, tsSin = mCombat.fdSin, tsCos = mCombat.fdCos, tsExp = mCombat.fdExp, tsTanh = mCombat.fdTanh, tsAtan2 = mCombat.fdAtan2;
const gInitWorld = mScan.initWorld, gSetU8 = mScan.setU8, gSetI32 = mScan.setI32, gSetF64 = mScan.setF64, gGetF64 = mScan.getF64, gGetU32 = mScan.getU32, gU8 = mScan.u8, gBits = mScan.bits;
const cbBoot = mCombatGen.bootTables, cbPutUnit = mCombatGen.putUnitC, cbFill = mCombatGen.fillTerrainEx;
const { R: gR } = await _jiti0.import(new URL('./../../src/lib/game/types.ts', import.meta.url).pathname);

{
  // —— 5a. fdlibm 六件套位级对账（sin/cos/exp/tanh/atan2，hypot 段 2 已覆盖）——
  const wbits = (op, y, x) => {
    const b = new BigUint64Array(new Float64Array([y]).buffer)[0];
    const xb = new BigUint64Array(new Float64Array([x]).buffer)[0];
    return gex.wb_math_test(b, xb, op);
  };
  const wasmFn = {
    0: (y, x) => fromBits2(0n, wbits(0, y, x)),
    1: (y, x) => fromBits2(0n, wbits(1, y, x)),
    2: (y) => fromBits2(0n, wbits(2, y, 0)),
    3: (y) => fromBits2(0n, wbits(3, y, 0)),
    4: (y, x) => fromBits2(0n, wbits(4, y, x)),
  };
  function fromBits2(_lo, b) { void _lo; return new Float64Array(new BigUint64Array([b]).buffer)[0]; }
  const csharpFn = { 0: tsSin, 1: tsCos, 2: tsExp, 3: tsTanh, 4: tsAtan2 };
  // mulberry32 场内确定性源（避免与段 1 的 refNext 互相干扰）
  let fz = 0x5eed1234 >>> 0;
  const frand = () => { fz = (fz + 0x6d2b79f5) >>> 0; let t = fz ^ (fz >>> 15); t = Math.imul(t, 1 | fz) >>> 0; const t2 = ((t + (Math.imul(t ^ (t >>> 7), 61 | t) >>> 0)) ^ t) >>> 0; return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296; };
  const randFinite = () => {
    // 随机有限双精度（指数分布偏游戏域；避免 NaN/Inf 噪声主导）
    const cls = frand();
    if (cls < 0.5) return (frand() * 2 - 1) * 12;                        // 游戏值域
    if (cls < 0.75) return (frand() * 2 - 1) * 710;                      // exp 溢出边界域
    const b = Math.floor(frand() * 0x7fe) + 1;                            // 全指数域有限值
    return new Float64Array(new BigUint64Array([BigInt(frand() < 0.5 ? 0 : 1) << 63n | BigInt(b) << 52n | BigInt(Math.floor(frand() * 0xfffffffffffff))]).buffer)[0];
  };
  let mFail = 0, mN = 0;
  const cases = [];
  for (let i = 0; i < 20000; i++) {
    cases.push([0, randFinite(), randFinite()]);
    cases.push([1, randFinite(), randFinite()]);
    cases.push([2, randFinite(), 0]);
    cases.push([3, randFinite(), 0]);
    cases.push([4, randFinite(), randFinite()]);
  }
  // 边界特例（atan2 分支覆盖）
  for (const sp of [0, -0.0, 1, -1, Infinity, -Infinity]) {
    for (const sp2 of [0, -0.0, 1, -1, Infinity, -Infinity]) {
      cases.push([4, sp, sp2]);
    }
  }
  for (const [op, y, x] of cases) {
    mN++;
    const wv = wasmFn[op](y, x);
    const cv = csharpFn[op](y, x);
    const wb = new BigUint64Array(new Float64Array([wv]).buffer)[0];
    const cb = new BigUint64Array(new Float64Array([cv]).buffer)[0];
    if (wb !== cb) { mFail++; if (mFail < 6) console.error(`  fdlibm mismatch op=${op} y=${y} x=${x}: wasm=${wv} cs=${cv}`); }
  }
  console.log(`fdlibm 六件套: ${mFail === 0 ? 'PASS' : `FAIL(${mFail})`} (${mN} samples vs wasm wb_math_test op0-4)`);
  var fdlibmFail = mFail;

  // —— 5b. 战斗树黄金回放（combat-transcript unitsBatch 重放 units_combat.json 29 场景逐位）——
  const combatGolden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/units_combat.json'), 'utf8'));
  const R_ID = { CIVN: 67, CVTECH: 74, CVMKT: 77, CVAL: 72, DAYPH: 108, ATWAR: 13, UPAR: 47 };
  const F64F = [['x', 0], ['y', 1], ['tx', 18], ['ty', 19], ['hp', 20], ['panic', 2], ['fleet', 37], ['cd', 27], ['atk', 35], ['hurt', 42], ['food', 28], ['kills', 26], ['breath', 29], ['age', 24]];
  function sampleTickV(slots, sc) {
    const memV = gex.memory;
    const dv = new DataView(memV.buffer);
    const at = (rid) => gex.wb_arena_ptr() + gex.wb_off(rid);
    const units = slots.map((s) => {
      const o = {
        slot: s, race: gGetU32(5, s), dead: gU8(14, s), hasPanic: gU8(15, s),
        inf: gU8(45, s), boat: gU8(48, s), flip: gU8(46, s),
        glen: dv.getInt32(at(57) + s * 4, true),
      };
      for (const [k, rid] of F64F) o[k] = gBits(dv.getFloat64(at(rid) + s * 8, true));
      o.gids = []; o.gvals = [];
      for (let g = 0; g < 8; g++) {
        o.gids.push(dv.getInt32(at(58) + (s * 8 + g) * 4, true));
        o.gvals.push(gBits(dv.getFloat64(at(59) + (s * 8 + g) * 8, true)));
      }
      return o;
    });
    const actN = gGetU32(121, 0);
    const actBase = gex.wb_arena_ptr() + gex.wb_off(120);
    const out = {
      rng: gGetU32(95, 0), tick: gGetU32(96, 0), actN,
      dlistN: gGetU32(128, 0), batchR: gGetU32(129, 0), bailK: gGetU32(122, 0),
      cnt4: gBits(dv.getFloat64(at(119) + 4 * 8, true)),
      wildZombie: dv.getInt32(at(106) + 5 * 4, true),
      wildSheep: dv.getInt32(at(106) + 6 * 4, true),
      cvpop0: gBits(dv.getFloat64(at(68) + 0 * 8, true)),
      fireN: dv.getInt32(at(145), true),
      neuCall: [dv.getUint32(at(141), true), dv.getUint32(at(141) + 4, true), dv.getUint32(at(141) + 8, true)],
      units, actHex: Buffer.from(memV.buffer, actBase, Math.min(actN, 512)).toString('hex'),
    };
    if (sc?.terrProbe) {
      const terr = new Uint8Array(memV.buffer, gex.wb_arena_ptr() + gex.wb_off(60), 40960);
      out.terr = sc.terrProbe.map(([x, y]) => terr[y * 256 + x]);
    }
    return out;
  }
  function setupWorldV(sc) {
    gInitWorld(sc.seed, sc.fxp ?? 0);
    gSetU8(101, 0, sc.laws ?? 0);
    if (sc.dayph !== undefined) gSetF64(R_ID.DAYPH, 0, sc.dayph);
    if (sc.nctl !== undefined) gSetU8(94, 0, sc.nctl);
    if (sc.neuw) for (const [i, v] of sc.neuw) gSetF64(93, i, v);
    cbFill(sc.terrain ?? {});
    cbBoot();
    if (sc.civs) {
      gSetI32(R_ID.CIVN, 0, sc.civs.length);
      sc.civs.forEach((c, i) => {
        gSetU8(R_ID.CVAL, i, 1);
        if (c.mkt !== undefined) gSetI32(R_ID.CVMKT, i, c.mkt);
        if (c.plague !== undefined) gSetF64(R_ID.CVTECH, i * 24 + 14, c.plague);
        if (c.archer !== undefined) gSetF64(R_ID.CVTECH, i * 24 + 13, c.archer);
        if (c.range !== undefined) gSetF64(R_ID.CVTECH, i * 24 + 15, c.range);
      });
    }
    if (sc.atwar) for (const [a, b] of sc.atwar) { gSetU8(R_ID.ATWAR, a * 64 + b, 1); gSetU8(R_ID.ATWAR, b * 64 + a, 1); }
    for (const u of sc.units) cbPutUnit(u.slot, u);
    gex.wb_pack_end(sc.units.length);
  }
  function hostStepV(sc) {
    gSetU8(98, 0, gU8(98, 0) ^ 1);
    for (const u of sc.units) {
      if (gU8(14, u.slot)) continue;
      const x = gGetF64(0, u.slot), y = gGetF64(1, u.slot);
      gSetI32(7, u.slot, Math.floor(y / 4) * 256 + Math.floor(x / 4));
      gSetU8(R_ID.UPAR, u.slot, gU8(98, 0));
    }
    gex.wb_pack_end(sc.units.length);
  }
  let cgFail = 0;
  for (const gs of combatGolden.scenarios) {
    const sc = gs.input;
    const slots = sc.units.map((u) => u.slot);
    setupWorldV(sc);
    for (let t = 0; t < sc.ticks; t++) {
      const rcT = transcriptBatch(0, 0, sc.units.length);
      const got = { rc: rcT, ...sampleTickV(slots, sc) };
      const want = gs.output[t];
      const jw = JSON.stringify(want);
      const jg = JSON.stringify(got);
      if (jw !== jg) { cgFail++; if (cgFail < 4) { console.error(`  golden replay mismatch ${sc.name} tick${t}`); for (const k of Object.keys(want)) { if (JSON.stringify(want[k]) !== JSON.stringify(got[k])) console.error(`    field ${k}: want=${JSON.stringify(want[k]).slice(0, 120)} got=${JSON.stringify(got[k]).slice(0, 120)}`); } } }
      hostStepV(sc);
    }
  }
  console.log(`combat 黄金回放 (转写 unitsBatch vs units_combat.json): ${cgFail === 0 ? 'PASS' : `FAIL(${cgFail})`} (${combatGolden.scenarios.length} 场景 × 全字段逐位)`);

  // —— 5c. 随机混战 fuzz（转写 vs wasm 同布置双跑）——
  const POOL = [
    [gR.WOLF, gR.SHEEP], [gR.BANDIT, gR.HUMAN], [gR.MAGE, gR.HUMAN], [gR.ZOMBIE, gR.HUMAN],
    [gR.DRAGON, gR.HUMAN], [gR.KRAKEN, gR.HUMAN], [gR.BASILISK, gR.SHEEP], [gR.SANDWORM, gR.SHEEP],
    [gR.VAMPIRE, gR.HUMAN], [gR.WHITEWALKER, gR.HUMAN], [gR.SNAKE, gR.SHEEP], [gR.BEAR, gR.SHEEP],
  ];
  function fuzzSetup(seed) {
    fz = seed >>> 0;
    const fr = frand;
    const [ra, rb] = POOL[Math.floor(fr() * POOL.length)];
    const x0 = 20 + fr() * 200, y0 = 20 + fr() * 120;
    const dx = (fr() * 7 - 3.5), dy = fr() * 2 - 1;
    const civA = ra === gR.HUMAN ? 0 : -1;
    const civB = rb === gR.HUMAN ? 1 : -1;
    const sc = {
      seed, ticks: 2, fxp: Math.floor(fr() * 16),
      civs: [{}, {}], atwar: fr() < 0.5 ? [[0, 1]] : undefined,
      units: [
        {
          slot: 0, race: ra, civ: civA, x: x0, y: y0,
          hp: 5 + fr() * 90, maxhp: 100, dmg: 3 + fr() * 10,
          food: fr() < 0.5 ? undefined : fr() * 120,
          panic: fr() < 0.25 ? fr() : undefined,
          fleet: fr() < 0.2 ? fr() * 40 : 0,
          cvn: fr() < 0.1 ? 0.5 : 0,
          inf: fr() < 0.08, job: fr() < 0.3 ? 3 : undefined,
          gear: fr() < 0.25 ? [29] : undefined,
          grudges: fr() < 0.3 ? [{ oid: 1, gv: fr() * 3 }] : undefined,
        },
        {
          slot: 1, race: rb, civ: civB, id: 1, x: x0 + dx, y: y0 + dy,
          hp: 3 + fr() * 90, maxhp: 100, dmg: 3 + fr() * 10,
          food: fr() < 0.5 ? undefined : fr() * 120,
          panic: fr() < 0.25 ? fr() : undefined,
          boat: ra === gR.KRAKEN && fr() < 0.6,
          gear: fr() < 0.2 ? [-1, 8] : undefined,
        },
      ],
    };
    return sc;
  }
  let fzFail = 0;
  for (let round = 0; round < 60; round++) {
    const sc = fuzzSetup(0x9000000 + round * 7919);
    // wasm 跑
    setupWorldV(sc);
    const slots = sc.units.map((u) => u.slot);
    const gotW = [];
    for (let t = 0; t < sc.ticks; t++) {
      const rc = gex.wb_units_batch(0, 0);
      const smp = { rc, ...sampleTickV(slots, sc) };
      gotW.push(JSON.stringify(smp));
      hostStepV(sc);
    }
    // 转写跑（同布置）
    setupWorldV(sc);
    const gotC = [];
    for (let t = 0; t < sc.ticks; t++) {
      const rc = transcriptBatch(0, 0, sc.units.length);
      const smp = { rc, ...sampleTickV(slots, sc) };
      gotC.push(JSON.stringify(smp));
      hostStepV(sc);
    }
    for (let t = 0; t < sc.ticks; t++) {
      if (gotW[t] !== gotC[t]) {
        fzFail++;
        if (fzFail < 4) {
          const w = JSON.parse(gotW[t]), c = JSON.parse(gotC[t]);
          console.error(`  fuzz mismatch round${round} tick${t} (seed 0x${sc.seed.toString(16)})`);
          for (const k of Object.keys(w)) if (JSON.stringify(w[k]) !== JSON.stringify(c[k])) console.error(`    ${k}: wasm=${JSON.stringify(w[k]).slice(0, 100)} cs=${JSON.stringify(c[k]).slice(0, 100)}`);
        }
        break;
      }
    }
  }
  console.log(`combat fuzz (转写 vs wasm 同布置双跑): ${fzFail === 0 ? 'PASS' : `FAIL(${fzFail})`} (60 随机场景 × 2 tick 全字段逐位)`);
  var combatVerifyFail = cgFail + fzFail;
}

// ============================================================
// 6) M-U2d：spawn/繁衍/拾取/家族黄金回放（combat-transcript 升级版 unitsBatch
//    含 SpawnUnit/繁衍段/TryPickup/RiseSkeleton 转写）vs units_spawn.json 26 场景逐位
//    驱动协议：USEQ 差值追踪 live + 宿主重排含新 slot + pack_end(liveN)
// ============================================================
const mSpawn = await _jiti0.import(new URL('./gen-units-spawn.mjs', import.meta.url).pathname);
const spSampleTick = mSpawn.sampleTick, spTraits = mSpawn.traitsPool, spFirst = mSpawn.firstPool, spPutUnit = mSpawn.putUnitSp, spItemIdx = mSpawn.itemIdx;
const { NEUTRAL_MODS: spNeutral } = await _jiti0.import(new URL('./../../src/lib/game/tech.ts', import.meta.url).pathname);
const { FIRST: spFirstTable } = await _jiti0.import(new URL('./../../src/lib/game/names.ts', import.meta.url).pathname);

{
  const spawnGolden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/units_spawn.json'), 'utf8'));
  const spR = {
    MISC: 148, WILDCAP: 146, MONCAP: 147, WILD: 106, REPRM: 109, SPB: 111, SPBH: 112,
    TRN: 113, TRDMG: 114, TRHP: 115, TRSPD: 116, CNT: 119, BAILP: 125, USEQ: 99,
    CIVN: 67, CVPOP: 68, CVAL: 72, CVGOV: 73, CVTECH: 74, CVDIR: 75, CVPC: 76, CVMKT: 77,
    FAMN: 78, FMID: 79, FMRACE: 80, FMNUM: 81, FMSEQ: 82, FMNAME: 83,
    ITMK: 91, ITMXY: 92, ITMN: 90, TBI: 133, TBIN: 134,
    FRSTOFF: 135, FRSTN: 136, FRSTP: 137, ATWAR: 13, UPAR: 47, UNAME: 56, UGEAR: 52, UTRAIT: 44,
    DAYPH: 108, LAWS: 101,
  };
  const TC_DMG = 0, TC_HP = 1, TC_REPRO = 5, TC_IDEA_REPRO = 18;

  function setupWorldSp(sc) {
    gInitWorld(sc.seed, sc.fxp ?? 0);
    gSetI32(spR.MISC, 1, 4096); // wild 预算（gen initWorldSp 同款）
    new Int32Array(gex.memory.buffer, gex.wb_arena_ptr() + gex.wb_off(spR.WILDCAP), 512).fill(4096);
    gSetU8(spR.LAWS, 0, sc.laws ?? 0);
    if (sc.dayph !== undefined) gSetF64(spR.DAYPH, 0, sc.dayph);
    if (sc.reprm !== undefined) gSetF64(spR.REPRM, 0, sc.reprm);
    cbFill(sc.terrain ?? {});
    cbBoot();
    spTraits({}); // TRAITS 真表键序灌入（gen 同源）
    spFirst({}); // FIRST 名池 24B 条目灌入（gen 同源）
    if (sc.civs) {
      gSetI32(spR.CIVN, 0, sc.civs.length);
      sc.civs.forEach((c, i) => {
        gSetU8(spR.CVAL, i, 1);
        // CVTECH = NEUTRAL_MODS 中性基线（gen 同款；TC_REPRO=0 乘零链防线）
        gSetF64(spR.CVTECH, i * 24 + TC_DMG, c.techDmg ?? spNeutral.dmg);
        gSetF64(spR.CVTECH, i * 24 + TC_HP, c.techHp ?? spNeutral.hp);
        gSetF64(spR.CVTECH, i * 24 + 2, spNeutral.bhp);
        gSetF64(spR.CVTECH, i * 24 + TC_REPRO, c.techRepro ?? spNeutral.repro);
        gSetF64(spR.CVTECH, i * 24 + 9, spNeutral.repair);
        gSetF64(spR.CVTECH, i * 24 + 13, spNeutral.archer);
        gSetF64(spR.CVTECH, i * 24 + 14, spNeutral.plague);
        gSetF64(spR.CVTECH, i * 24 + 15, spNeutral.range);
        gSetF64(spR.CVTECH, i * 24 + TC_IDEA_REPRO, c.techIdea ?? 0);
        if (c.pop !== undefined) gSetF64(spR.CVPOP, i, c.pop);
        if (c.pc !== undefined) gSetF64(spR.CVPC, i, c.pc);
        if (c.gov !== undefined) gSetI32(spR.CVGOV, i, c.gov);
        if (c.dir !== undefined) gSetU8(spR.CVDIR, i, c.dir);
        if (c.mkt !== undefined) gSetI32(spR.CVMKT, i, c.mkt);
      });
    }
    if (sc.atwar) for (const [a, b] of sc.atwar) { gSetU8(spR.ATWAR, a * 64 + b, 1); gSetU8(spR.ATWAR, b * 64 + a, 1); }
    if (sc.fams) {
      sc.fams.forEach((f, i) => {
        gSetI32(spR.FMID, i, f.id);
        gSetI32(spR.FMRACE, i, f.race ?? 0);
        for (let k = 0; k < 6; k++) gSetF64(spR.FMNUM, i * 6 + k, f.num?.[k] ?? 0);
        if (f.pre !== undefined) gSetI32(spR.FMNAME, i * 2, f.pre);
        if (f.post !== undefined) gSetI32(spR.FMNAME, i * 2 + 1, f.post);
      });
      gSetI32(spR.FAMN, 0, sc.fams.length);
    }
    if (sc.wilds) for (const [r, n] of sc.wilds) gSetI32(spR.WILD, r, n);
    if (sc.wildcaps) for (const [r, n] of sc.wildcaps) gSetI32(spR.WILDCAP, r, n);
    if (sc.moncaps) for (const [r, n] of sc.moncaps) gSetI32(spR.MONCAP, r, n);
    if (sc.spb) for (const [r, gene] of sc.spb) { for (let k = 0; k < 4; k++) gSetF64(spR.SPB, r * 4 + k, gene[k]); gSetU8(spR.SPBH, r, 1); }
    if (sc.cnt5 !== undefined) gSetF64(spR.CNT, 5, sc.cnt5);
    if (sc.items) {
      sc.items.forEach((it, i) => {
        gSetI32(spR.ITMK, i, typeof it.k === 'string' ? spItemIdx(it.k) : it.k);
        gSetF64(spR.ITMXY, i * 2, it.x);
        gSetF64(spR.ITMXY, i * 2 + 1, it.y);
      });
      gSetI32(spR.ITMN, 0, sc.items.length);
    }
    for (const u of sc.units) spPutUnit(u.slot, u);
  }
  function hostStepSp(sc, liveN) {
    gSetU8(98, 0, gU8(98, 0) ^ 1);
    for (let s = 0; s < liveN; s++) {
      if (gU8(14, s)) continue;
      const x = gGetF64(0, s), y = gGetF64(1, s);
      gSetI32(7, s, Math.floor(y / 4) * 256 + Math.floor(x / 4));
      gSetU8(spR.UPAR, s, gU8(98, 0));
    }
    gex.wb_pack_end(liveN);
  }
  let spFail = 0;
  for (const gs of spawnGolden.scenarios) {
    const sc = gs.input;
    setupWorldSp(sc);
    const useq0 = gGetU32(spR.USEQ, 0);
    let liveN = sc.units.length;
    gex.wb_pack_end(liveN);
    for (let t = 0; t < sc.ticks; t++) {
      const rcT = transcriptBatch(0, 0, liveN);
      const spawned = gGetU32(spR.USEQ, 0) - useq0;
      liveN = sc.units.length + spawned;
      const slots = [...sc.units.map((u) => u.slot), ...Array.from({ length: spawned }, (_, k) => sc.units.length + k)];
      const got = { rc: rcT, spawned, ...spSampleTick(slots, sc) };
      const want = gs.output[t];
      const jw = JSON.stringify(want);
      const jg = JSON.stringify(got);
      if (jw !== jg) {
        spFail++;
        if (spFail < 4) {
          console.error(`  spawn golden mismatch ${sc.name} tick${t}`);
          for (const k of Object.keys(want)) {
            if (JSON.stringify(want[k]) !== JSON.stringify(got[k])) console.error(`    field ${k}: want=${JSON.stringify(want[k]).slice(0, 140)} got=${JSON.stringify(got[k]).slice(0, 140)}`);
          }
        }
      }
      hostStepSp(sc, liveN);
    }
  }
  console.log(`spawn 黄金回放 (转写 unitsBatch+SpawnUnit vs units_spawn.json): ${spFail === 0 ? 'PASS' : `FAIL(${spFail})`} (${spawnGolden.scenarios.length} 场景 × 全字段逐位)`);
  var spawnVerifyFail = spFail;
  void spFirstTable; // FIRST 表经 spFirst 内部 import 消费（此引用防 lint 未用）
}

// ============================================================
// 7) M-U3a：civ/建筑辅助族黄金回放（combat-transcript 升级版 unitsBatch
//    含 fireNear/extinguishFire/damagedNear/enemyBuildingNear/nearestEnemyBuilding/
//    nearestBuildingOf/repairBuilding/attackBuilding/dmgSet 族转写）
//    vs units_civ.json 30 场景全字段逐位（布置协议与 gen-units-civ 同源 import，纪律②）
//    ⚠ 2026-10-27 10:46 本段曾被并行 cron agent 覆写丢失，本处为重落盘（内容同源）
// ============================================================
const mCiv = await _jiti0.import(new URL('./gen-units-civ.mjs', import.meta.url).pathname);
const cvPutTbhp = mCiv.putTbhp, cvFillOwn = mCiv.fillOwnNeg1, cvPutCivs = mCiv.putCivs, cvPutBuildings = mCiv.putBuildings, cvPutFires = mCiv.putFires, cvPutDamaged = mCiv.putDamaged, cvPutCnt = mCiv.putCnt, cvSampleTick = mCiv.civSampleTick;

{
  const civGolden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/units_civ.json'), 'utf8'));
  const CV_UPAR = 47;
  function cvSetupWorld(sc) {
    gInitWorld(sc.seed, sc.fxp ?? 0);
    cbFill(sc.terrain ?? {});
    cbBoot();
    cvPutTbhp();
    cvFillOwn();
    cvPutCivs(sc.civs ?? [{}]);
    if (sc.atwar) for (const [a, b] of sc.atwar) { gSetU8(13, a * 64 + b, 1); gSetU8(13, b * 64 + a, 1); }
    const techBhp = (sc.civs && sc.civs[0] && sc.civs[0].bhp) || 1;
    if (sc.blds) cvPutBuildings(sc.blds, techBhp);
    if (sc.fires) cvPutFires(sc.fires);
    if (sc.damaged) cvPutDamaged(sc.damaged);
    cvPutCnt(sc.cnt);
    for (const u of sc.units) cbPutUnit(u.slot, u);
    gex.wb_pack_end(sc.units.length);
  }
  function cvHostStep(sc) {
    gSetU8(98, 0, gU8(98, 0) ^ 1);
    for (const u of sc.units) {
      if (gU8(14, u.slot)) continue;
      const x = gGetF64(0, u.slot), y = gGetF64(1, u.slot);
      gSetI32(7, u.slot, Math.floor(y / 4) * 256 + Math.floor(x / 4));
      gSetU8(CV_UPAR, u.slot, gU8(98, 0));
    }
    gex.wb_pack_end(sc.units.length);
  }
  let cvFail = 0;
  for (const gs of civGolden.scenarios) {
    const sc = gs.input;
    cvSetupWorld(sc);
    const slots = sc.units.map((u) => u.slot);
    for (let t = 0; t < (sc.ticks ?? 2); t++) {
      const rcT = transcriptBatch(0, 0, sc.units.length);
      const got = { rc: rcT, ...cvSampleTick(slots, sc) };
      const want = gs.output[t];
      const jw = JSON.stringify(want);
      const jg = JSON.stringify(got);
      if (jw !== jg) {
        cvFail++;
        if (cvFail < 4) {
          console.error(`  civ golden mismatch ${sc.name} tick${t}`);
          for (const k of Object.keys(want)) {
            if (JSON.stringify(want[k]) !== JSON.stringify(got[k])) console.error(`    field ${k}: want=${JSON.stringify(want[k]).slice(0, 140)} got=${JSON.stringify(got[k]).slice(0, 140)}`);
          }
        }
        break;
      }
      cvHostStep(sc);
    }
  }
  console.log(`civ 黄金回放 (转写 unitsBatch vs units_civ.json): ${cvFail === 0 ? 'PASS' : `FAIL(${cvFail})`} (${civGolden.scenarios.length} 场景 × 全字段逐位)`);
  var civVerifyFail = cvFail;
}

// ============================================================
// 段 10：M-U3g 军团域双链（gen sanity 复跑 + army-transcript 镜像逐位）
//   army-transcript.mjs = WbCivSim.cs 军团域的 JS 独立转写（16 场景全字段逐位）
//   gen-units-army.mjs = 黄金生成器自带 sanity 63 断言 + det 双跑（子进程复跑防陈旧）
// ============================================================
{
  const { execFileSync } = await import('node:child_process');
  var armyVerifyFail = 0;
  try {
    execFileSync('node', [new URL('./army-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('army 黄金回放 (army-transcript 镜像 vs units_army.json): PASS (16 场景 × 全字段逐位)');
  } catch (e) {
    armyVerifyFail++;
    console.error('army 黄金回放 (army-transcript 镜像 vs units_army.json): FAIL');
    console.error(String(e.stdout ?? '').split('\n').slice(0, 8).join('\n'));
  }
  try {
    const out = execFileSync('node', [new URL('./gen-units-army.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    if (!out.includes('[GEN PASS]') || !out.includes('63/63 PASS')) throw new Error(out.split('\n').slice(-4).join(' | '));
    console.log('army gen sanity+det 复跑 (gen-units-army): PASS (63 断言 × det 双跑)');
  } catch (e) {
    armyVerifyFail++;
    console.error('army gen sanity+det 复跑: FAIL —', String(e.message ?? e).slice(0, 200));
  }
}

// ============================================================
// 段 11：M-U4 渲染 I 双链（render-transcript 镜像逐位 + gen sanity 复跑 + det 双跑字节对比）
//   render-transcript.mjs = WbRender.cs 的 JS 独立转写（地形烘焙/道具烘焙/单位决策 + sprites bail 契约）
//   gen-render.mjs = 黄金生成器自带 sanity 35 断言 + [GEN PASS]；det 双跑以 md5 字节级对比
// ============================================================
{
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  var renderVerifyFail = 0;
  try {
    execFileSync('node', [new URL('./render-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('render 黄金回放 (render-transcript 镜像 vs render.json): PASS (186 断言 × 三段逐位)');
  } catch (e) {
    renderVerifyFail++;
    console.error('render 黄金回放 (render-transcript 镜像 vs render.json): FAIL');
    console.error(String(e.stdout ?? '').split('\n').slice(0, 10).join('\n'));
  }
  try {
    const goldenPath = new URL('./golden/render.json', import.meta.url).pathname;
    const h0 = createHash('md5').update(await (await import('node:fs')).promises.readFile(goldenPath)).digest('hex');
    execFileSync('node', [new URL('./gen-render.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
    const h1 = createHash('md5').update(await (await import('node:fs')).promises.readFile(goldenPath)).digest('hex');
    if (h0 !== h1) throw new Error(`golden漂移 ${h0} -> ${h1}`);
    console.log('render gen sanity+det 复跑 (gen-render): PASS (35 断言 × det 字节级双跑)');
  } catch (e) {
    renderVerifyFail++;
    console.error('render gen sanity+det 复跑: FAIL —', String(e.message ?? e).slice(0, 200));
  }
}

// ============================================================
// 段 12：M-U5a 渲染 II 双链（render2-transcript 镜像逐位 + gen-render2 sanity/det 复跑）
//   render2-transcript.mjs = WbSprites.cs 的 JS 独立转写（sprites 12 函数像素画：树/山/人形×2/四足/船/商队/五族）
//   gen-render2.mjs = 黄金生成器自带 sanity 49 断言 + det 双跑；黄金 128 场景（bail 契约展开为完整 op 序列）
// ============================================================
{
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  var render2VerifyFail = 0;
  try {
    execFileSync('node', [new URL('./render2-transcript.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('render2 黄金回放 (render2-transcript 镜像 vs render2.json): PASS (128 场景 × 逐 op 逐位)');
  } catch (e) {
    render2VerifyFail++;
    console.error('render2 黄金回放 (render2-transcript 镜像 vs render2.json): FAIL');
    console.error(String(e.stdout ?? '').split('\n').slice(0, 10).join('\n'));
  }
  try {
    const goldenPath = new URL('./golden/render2.json', import.meta.url).pathname;
    const h0 = createHash('md5').update(await (await import('node:fs')).promises.readFile(goldenPath)).digest('hex');
    execFileSync('node', [new URL('./gen-render2.mjs', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
    const h1 = createHash('md5').update(await (await import('node:fs')).promises.readFile(goldenPath)).digest('hex');
    if (h0 !== h1) throw new Error(`golden漂移 ${h0} -> ${h1}`);
    console.log('render2 gen sanity+det 复跑 (gen-render2): PASS (49 断言 × det 字节级双跑)');
  } catch (e) {
    render2VerifyFail++;
    console.error('render2 gen sanity+det 复跑: FAIL —', String(e.message ?? e).slice(0, 200));
  }
}

const allPass = rngFail === 0 && hypotFail === 0 && layoutFail === 0 && scanVerifyFail === 0 && fdlibmFail === 0 && combatVerifyFail === 0 && spawnVerifyFail === 0 && civVerifyFail === 0 && armyVerifyFail === 0 && renderVerifyFail === 0 && render2VerifyFail === 0;
console.log(allPass ? 'VERIFY: ALL PASS' : 'VERIFY: FAIL');
process.exit(allPass ? 0 : 1);
