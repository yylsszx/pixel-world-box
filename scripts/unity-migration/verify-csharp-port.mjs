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
import { mulberry32 } from '../../src/lib/game/noise.ts';

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

const allPass = rngFail === 0 && hypotFail === 0 && layoutFail === 0;
console.log(allPass ? 'VERIFY: ALL PASS' : 'VERIFY: FAIL');
process.exit(allPass ? 0 : 1);
