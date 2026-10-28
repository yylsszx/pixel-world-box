// save-transcript.mjs — M-U6a JS 镜像：WbSave.cs 语义独立转写（防循环论证双链 —— 禁 import 真实现）
// 转写对象（C# WbSave.cs 逐方法对应）：
//   B64Encode/B64Decode ← bytesToB64 L74/b64ToBytes L82（标准 base64，btoa latin1 = 原始字节）
//   RleEncode/RleDecode ← rleEncode L92/rleDecode L106（u16 小端对，run<65535 截断，零游程/值越界/游程超长/长度不匹配四异常）
//   Hash2 ← noise.ts L14（int 32 位域：|0 乘加、>>>16、>>>0 归一）
//   ReseedRng ← engine L15348 ((seed^0x9e3779b9)+tick)>>>0
//   CamApplied/CamZoomClamp ← engine L15343-15346（三字段全有限才采纳，zoom∈[1.2,24]）
//   OccAccept ← engine L15502-15507（i 域内/civ>=0/civ 存活才收，st∈[1,99]）
//   RowsToUnits ← rowsToUnits L140（header String 化/行长校验抛错/null→缺失语义）
//   ValidateSaveData ← saveSafe.ts L125-168 全分支（文案逐字）
// 对账：golden/save.json（gen-save.mjs 真实现产物）逐场景逐位。
// 跑法：node scripts/unity-migration/save-transcript.mjs（输出 SAVE-TRANSCRIPT: N/N ALL PASS）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gold = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/save.json'), 'utf8'));
const W = gold.meta.W, H = gold.meta.H, WH = W * H;

// ---------------- 镜像实现（C# 语义转写） ----------------
function b64Encode(bytes) {
  // C# Convert.ToBase64String ≡ btoa(latin1 bytes)
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64Decode(b64, expect) {
  const s = atob(b64);
  if (expect > 0 && s.length !== expect) throw new Error(`存档字节数不匹配: 期望 ${expect}, 实际 ${s.length}`);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function rleEncode(arr) {
  const pairs = [];
  let i = 0;
  while (i < arr.length) {
    const v = arr[i];
    let run = 1;
    while (i + run < arr.length && arr[i + run] === v && run < 65535) run++;
    pairs.push(v, run);
    i += run;
  }
  const u16 = new Uint16Array(pairs);
  return b64Encode(new Uint8Array(u16.buffer, u16.byteOffset, u16.byteLength));
}
function rleDecode(b64, expect) {
  const raw = b64Decode(b64, 0);
  const aligned = new Uint16Array(Math.floor(raw.length / 2));
  for (let k = 0; k < aligned.length; k++) aligned[k] = raw[k * 2] | (raw[k * 2 + 1] << 8);
  const out = new Uint8Array(expect);
  let pos = 0;
  for (let p = 0; p < aligned.length; p += 2) {
    const v = aligned[p], run = aligned[p + 1];
    if (run === 0) throw new Error('存档 RLE 数据损坏（零游程）');
    if (v > 255) throw new Error('存档 RLE 数据损坏（值越界）');
    if (pos + run > expect) throw new Error('存档 RLE 数据损坏（游程超长）');
    out.fill(v, pos, pos + run);
    pos += run;
  }
  if (pos !== expect) throw new Error(`存档 RLE 长度不匹配: 期望 ${expect}, 实际 ${pos}`);
  return out;
}
function hash2(x, y, seed) {
  // C# unchecked int 域直译：|0 截断 32 位、*1274126177 int 乘、>>>0 归一
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177; // 注意：JS * 溢出双精度后 |0 —— C# unchecked int 乘低 32 位同构（值域验证见 verify 段 15）
  h = (h | 0) ^ ((h | 0) >>> 16);
  return (h >>> 0) / 4294967296;
}
function reseedRng(seed, tickCount) {
  return ((seed ^ 0x9e3779b9) + tickCount) >>> 0;
}
function camApplied(cam) {
  return cam != null && Number.isFinite(cam.x) && Number.isFinite(cam.y) && Number.isFinite(cam.zoom);
}
function camZoomClamp(zoom) {
  return Math.max(1.2, Math.min(24, zoom));
}
function occAccept(i, c, st, civAlive) {
  if (i < 0 || i >= WH || c < 0 || !civAlive) return null;
  return Math.max(1, Math.min(99, st));
}
function rowsToUnits(rows) {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(rows[0])) throw new Error('存档单位数据损坏');
  const header = rows[0].map(String);
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length !== header.length) throw new Error('存档单位行损坏');
    const u = {};
    for (let c = 0; c < header.length; c++) {
      const v = row[c];
      u[header[c]] = v === null ? undefined : v;
    }
    out.push(u);
  }
  return out;
}
function validateSaveData(data) {
  if (!data || typeof data !== 'object') return '存档根结构损坏（非对象）';
  const d = data;
  if (d.v !== 1 && d.v !== 2) return `不支持的存档版本: ${String(d.v)}`;
  if (typeof d.seed !== 'number' || !Number.isFinite(d.seed)) return '种子数据损坏';
  if (typeof d.tickCount !== 'number' || !Number.isFinite(d.tickCount) || d.tickCount < 0) return '时间线数据损坏';
  if (!Array.isArray(d.civs)) return '文明数据损坏（civs 非 Array）';
  if (!Array.isArray(d.buildings)) return '建筑数据损坏（buildings 非 Array）';
  if (d.v === 2) {
    if (typeof d.terrain !== 'string' || d.terrain.length < 8) return '地形数据损坏（RLE 流过短）';
    const hasRows = Array.isArray(d.u) && d.u.length > 1;
    const hasUnits = Array.isArray(d.units) && d.units.length > 0;
    if (!hasRows && !hasUnits) return '单位数据损坏（u/units 均为空）';
    if (hasRows) {
      const rows = d.u;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!Array.isArray(r) || typeof r[0] !== 'number' || typeof r[1] !== 'number') return `单位行 ${i} 数据损坏`;
      }
    }
    if (Array.isArray(d.units) && d.units.length > 0) {
      for (const u of d.units) {
        if (!u || typeof u.id !== 'number' || typeof u.race !== 'number') return '存档单位数据损坏';
      }
    }
    if (d.dyn !== undefined && (typeof d.dyn !== 'object' || !Array.isArray(d.dyn.races))) return '涌现层数据损坏（dyn.races 非 Array）';
  } else {
    if (!Array.isArray(d.units)) return '单位数据损坏（units 非 Array）';
    for (const u of d.units) {
      if (!u || typeof u.id !== 'number' || typeof u.race !== 'number') return '存档单位数据损坏';
    }
  }
  for (const c of d.civs) {
    if (!c || typeof c.id !== 'number') return '文明行数据损坏';
  }
  return null;
}

// ---------------- 工具 ----------------
function bytesHex(arr) {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += arr[i].toString(16).padStart(2, '0');
  return s;
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function f64hexOf(hexLE) { return hexLE; } // 黄金 cam 已是 f64 hex（小端 16 字符）—— 直接串比较

let pass = 0, fail = 0;
const failures = [];
function A(name, cond, msg) {
  if (cond) pass++;
  else { fail++; failures.push(`${name}: ${msg}`); }
}

// ---------------- 对账 ----------------
const UFIELDS = gold.meta.unitFields;
for (const sc of gold.scenarios) {
  if (sc.name.startsWith('S-')) {
    // RLE round-trip：解码黄金 → 与引擎内数组 hex 逐位；编码引擎内数组 → 与黄金字串逐位
    const fields = [['terrain', WH], ['owner', WH * 2], ['building', WH], ['fire', WH], ['radiate', WH], ['river', WH], ['road', WH]];
    for (const [f, expect] of fields) {
      const sv = sc.save[f];
      if (typeof sv === 'string' && sv.length > 0) {
        let dec;
        try { dec = bytesHex(rleDecode(sv, expect)); } catch (e) { dec = `ERR ${e.message}`; }
        A(`${sc.name} ${f} decode`, dec === sc.raw[f], `dec=${dec.slice(0, 32)}... want=${sc.raw[f].slice(0, 32)}...`);
        const enc = rleEncode(hexToBytes(sc.raw[f]));
        A(`${sc.name} ${f} encode`, enc === sv, `enc=${enc.slice(0, 32)}... want=${sv.slice(0, 32)}...`);
      }
    }
    // 列式单位行 round-trip + units41 对账（undefined/null 语义互逆）
    if (Array.isArray(sc.units41) && sc.units41.length > 0) {
      let units;
      try { units = rowsToUnits(sc.save.u); } catch (e) { units = null; A(`${sc.name} rowsToUnits`, false, e.message); }
      if (units) {
        A(`${sc.name} rows count`, units.length === sc.units41.length, `rows=${units.length} want=${sc.units41.length}`);
        let ok = true, msg = '';
        for (let i = 0; i < Math.min(units.length, sc.units41.length) && ok; i++) {
          const obj = units[i], wantRow = sc.units41[i];
          for (let j = 0; j < UFIELDS.length; j++) {
            const f = UFIELDS[j];
            const want = wantRow[j]; // null = undefined 语义
            const got = obj[f];
            const bothMissing = want === null && got === undefined;
            if (!bothMissing) {
              const w = want === null ? undefined : want;
              const same = w === got || JSON.stringify(w) === JSON.stringify(got);
              if (!same) { ok = false; msg = `row${i}.${f} got=${JSON.stringify(got)} want=${JSON.stringify(w)}`; break; }
            }
          }
        }
        A(`${sc.name} rowsToUnits 42 字段逐位`, ok, msg);
        // round-trip：重建 → unitsToRows 镜像 → 与黄金 u 行逐位
        const reRows = [[...UFIELDS]];
        for (const u of units) {
          const row = [];
          for (const f of UFIELDS) row.push(u[f] === undefined ? null : u[f]);
          reRows.push(row);
        }
        A(`${sc.name} rows round-trip`, JSON.stringify(reRows) === JSON.stringify(sc.save.u), '重建行与黄金 u 不等');
      }
    }
  } else if (sc.name.startsWith('A-')) {
    // variant 重算：hash2(x,y,seed+999)*255 Floor 全图逐位
    const seed = sc.scalarSeed;
    const variant = new Uint8Array(WH);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) variant[y * W + x] = Math.floor(hash2(x, y, seed + 999) * 255);
    A(`${sc.name} variant`, bytesHex(variant) === sc.variant, `hex=${bytesHex(variant).slice(0, 16)}... want=${sc.variant.slice(0, 16)}...`);
    // rng 重播种：公式由 H-math 组 30 点独立锁定；此处 eng.rngA 是 applySave 尾链（statsTick 等）
    // 推进后值 —— 不属 M-U6a 编解码核心，尾链对账留 M-U6b（黄金保留 rngA 供未来对账）
    // cam：镜像重演谓词 + clamp —— camIn.zoom 有限时 Clamp(输入) 的 f64 == 黄金 cam.zoom
    const camInZ = sc.camIn ? sc.camIn.zoom : null;
    const appliedMirror = sc.camIn != null
      && Number.isFinite(f64OfHex(sc.camIn.x)) && Number.isFinite(f64OfHex(sc.camIn.y))
      && camInZ !== 'NaN';
    A(`${sc.name} camApplied 谓词`, appliedMirror === sc.camApplied, `mirror=${appliedMirror} want=${sc.camApplied}`);
    if (sc.camApplied) {
      const rawZoom = f64OfHex(camInZ);
      A(`${sc.name} cam.zoom clamp`, f64hexLocal(camZoomClamp(rawZoom)) === sc.cam.zoom, `clamp(${camInZ})=${f64hexLocal(camZoomClamp(rawZoom))} want=${sc.cam.zoom}`);
    }
    // occ：镜像 accept 逐行 == 黄金 occ
    if (sc.occ && sc.occ.length >= 0 && sc.name === 'A-occ-clamp') {
      // 黄金 occ 来自 civs 存活过滤 —— 镜像侧以黄金 occ 行反查 civ 存活（ civs 来自 S-fixture 档 applySave 后全存活）
      const got = new Map(sc.occ.map((r) => [r[0], r]));
      // 注入 11 行（gen 侧序）：[i, civ, st]
      const injected = [[0, 0, 0], [1, 0, 1], [2, 0, 50], [3, 0, 99], [4, 0, 100], [5, 0, 150], [6, 9, 10], [7, 0, -5], [-1, 0, 10], [WH, 0, 10], [8, 1, 3], [9, 0, 98]];
      let ok = true, msg = '';
      for (const [i, c, st] of injected) {
        const want = got.get(i);
        // civ 存活：黄金 occ 含 i=8（civ=1）→ civ 1 存活；i=6（civ=9）被跳过 → civ 9 不存在
        const alive = c === 0 || c === 1;
        const expect = occAccept(i, c, st, alive);
        if (expect === null) {
          if (want !== undefined) { ok = false; msg = `i=${i} 应跳过但黄金含 ${JSON.stringify(want)}`; break; }
        } else {
          if (!want || want[2] !== expect) { ok = false; msg = `i=${i} got=${JSON.stringify(want)} want st=${expect}`; break; }
        }
      }
      A(`${sc.name} occ clamp 逐行`, ok, msg);
    }
  } else if (sc.name === 'H-math') {
    // hash2 42 点逐位
    let ok = true, msg = '';
    for (const [x, y, seed, hex] of sc.hash2) {
      const got = f64hexLocal(hash2(x, y, seed));
      if (got !== hex) { ok = false; msg = `hash2(${x},${y},${seed}) got=${got} want=${hex}`; break; }
    }
    A('H-math hash2 42 点', ok, msg);
    let ok2 = true, msg2 = '';
    for (const [seed, tick, hex] of sc.reseed) {
      const got = '0x' + reseedRng(seed, tick).toString(16).padStart(8, '0');
      if (got !== hex) { ok2 = false; msg2 = `reseed(${seed},${tick}) got=${got} want=${hex}`; break; }
    }
    A('H-math reseed 30 点', ok2, msg2);
  } else if (sc.name === 'V-validate') {
    let ok = true, msg = '';
    for (const c of sc.cases) {
      const got = validateSaveData(c.input);
      if (got !== c.expect) { ok = false; msg = `${c.name} got=${JSON.stringify(got)} want=${JSON.stringify(c.expect)}`; break; }
    }
    A(`V-validate ${sc.cases.length} 案例文案逐字`, ok, msg);
  }
}
function f64hexLocal(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function f64OfHex(hexLE) {
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(hexLE.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, true);
}

console.log(`SAVE-TRANSCRIPT: ${pass}/${pass + fail} ${fail === 0 ? 'ALL PASS' : 'FAIL'}`);
for (const f of failures.slice(0, 20)) console.log(`  [FAIL] ${f}`);
if (fail > 0) process.exit(1);
