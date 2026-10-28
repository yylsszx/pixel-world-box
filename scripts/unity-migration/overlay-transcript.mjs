// overlay-transcript.mjs — WbOverlay.cs（M-U7d overlay 政治版图层）的 JS 独立镜像（防循环论证双链）
// 语义源 = WbOverlay.cs 翻译稿（非 engine.ts redrawOverlay！）——黄金 = gen-overlay.mjs 直录真实现（10 场景五模式）。
// dump 解码：RLE（[start, value, runLen]…）→ owner(-1)/terrain(GRASS=3)/temp(128)/moist(128) 全阵列；
//         units 坐标 f64hex 小端回读；op 流协议与 gen dumpOpRange 同构（fillRect s=[style]/clearRect s=null，坐标 f64hex 小端）。
// 跑法：node scripts/unity-migration/overlay-transcript.mjs（verify 段 21 由 verify-csharp-port.mjs 调用）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const W = 256, H = 160, N = W * H;
const BW = 64, BH = 40;
const T_GRASS = 3, T_DEEP = 0, T_WATER = 1;

function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function h2f(h) {
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(h.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, true);   // 小端（gen-overlay dump 契约 = gen-render5/7 家族 LE；render6 大端勿混）
}
function rleDecode(rle, len, dflt) {
  const a = new Array(len).fill(dflt);
  if (rle) for (const [s, v, n] of rle) for (let k = 0; k < n; k++) a[s + k] = v;
  return a;
}
// WbDrawList 镜像（op 协议同构）
class Lst {
  constructor() { this.ops = []; }
  Fill(style, x, y, w, h) { this.ops.push({ o: 'fillRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [style] }); }
  Clear(x, y, w, h) { this.ops.push({ o: 'clearRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: null }); }
}

// ================= 五模式（WbOverlay.cs 语义转写） =================
function redrawOverlay(st, units, h, L) {
  L.Clear(0, 0, W * 4, H * 4);
  const mode = h.mode;
  if (mode === 'political') {
    const owner = st.owner;
    for (let i = 0; i < N; i++) {
      const o = owner[i];
      if (o < 0) continue;
      const civ = st.civs[o];
      if (civ == null || !civ.alive) continue;
      const x = i % W, y = (i / W) | 0;
      const px = x * 4, py = y * 4;
      L.Fill(civ.colorHex, px, py, 4, 4);
      const x2 = x < W - 1 && owner[i + 1] !== o;
      const y2 = y < H - 1 && owner[i + W] !== o;
      if (x > 0 && owner[i - 1] !== o) L.Fill('#09090b', px, py, 2, 4);
      if (x2) L.Fill('#09090b', px + 2, py, 2, 4);
      if (y > 0 && owner[i - W] !== o) L.Fill('#09090b', px, py, 4, 2);
      if (y2) L.Fill('#09090b', px, py + 2, 4, 2);
    }
  } else if (mode === 'alliance') {
    const alColor = new Map();
    for (const al of h.alliances) alColor.set(al.id, al.colorHex);
    const owner = st.owner;
    const groupId = (o) => (h.allianceOf && h.allianceOf.has(o) ? h.allianceOf.get(o) : -(o + 1) * 1001);
    for (let i = 0; i < N; i++) {
      const o = owner[i];
      if (o < 0) continue;
      const civ = st.civs[o];
      if (civ == null || !civ.alive) continue;
      const x = i % W, y = (i / W) | 0;
      const px = x * 4, py = y * 4;
      const alId = h.allianceOf && h.allianceOf.has(o) ? h.allianceOf.get(o) : null;
      const fill = alId != null ? (alColor.get(alId) ?? '#71717a') : '#52525b';
      L.Fill(fill, px, py, 4, 4);
      const g = groupId(o);
      const gn = (j) => {
        const o2 = owner[j];
        if (o2 < 0 || st.civs[o2] == null || !st.civs[o2].alive) return g;
        return groupId(o2);
      };
      if (x > 0 && gn(i - 1) !== g) L.Fill('#09090b', px, py, 2, 4);
      if (x < W - 1 && gn(i + 1) !== g) L.Fill('#09090b', px + 2, py, 2, 4);
      if (y > 0 && gn(i - W) !== g) L.Fill('#09090b', px, py, 4, 2);
      if (y < H - 1 && gn(i + W) !== g) L.Fill('#09090b', px, py + 2, 4, 2);
    }
  } else if (mode === 'density') {
    const counts = new Array(BW * BH).fill(0);
    for (const u of units) {
      if (u.dead !== 0) continue;
      const bx = Math.min(BW - 1, Math.max(0, Math.trunc(u.x / 4)));
      const by = Math.min(BH - 1, Math.max(0, Math.trunc(u.y / 4)));
      counts[by * BW + bx]++;
    }
    const ramp = ['#1d4e89', '#2e86ab', '#7fb069', '#f2c14e', '#d64530'];
    for (let by = 0; by < BH; by++) {
      for (let bx = 0; bx < BW; bx++) {
        const n = counts[by * BW + bx];
        if (n === 0) continue;
        const band = n <= 1 ? 0 : n <= 3 ? 1 : n <= 7 ? 2 : n <= 14 ? 3 : 4;
        L.Fill(ramp[band], bx * 16, by * 16, 16, 16);
      }
    }
  } else if (mode === 'biome') {
    const terrain = st.terrain, temp = h.tempOverlay, moist = h.moistMap;
    for (let i = 0; i < N; i++) {
      const t = terrain[i];
      const px = (i % W) * 2, py = ((i / W) | 0) * 2;
      let col;
      if (t === T_DEEP) col = '#16324f';
      else if (t === T_WATER) col = '#2d6a8f';
      else if (t === 6) col = '#8a8f98';       // MOUNTAIN
      else if (t === 8) col = '#7a1f14';       // LAVA
      else if (t === 9) col = '#4a3b2f';       // BURNT
      else {
        const cold = temp[i] < 90, hot = temp[i] >= 165, wet = moist[i] >= 128;
        if (cold && !wet) col = '#dce8f2';
        else if (cold && wet) col = '#9db8c9';
        else if (hot && !wet) col = '#e3c17a';
        else if (hot && wet) col = '#3f9d4f';
        else if (wet) col = '#2f7d4a';
        else col = '#a8c56a';
      }
      L.Fill(col, px, py, 4, 4);
    }
  } else {
    const isTemp = mode === 'temperature';
    const ramp = isTemp
      ? ['#4a7fd6', '#7db8e0', '#e0c050', '#e07830', '#d04030']
      : ['#d6b878', '#b0a860', '#80a060', '#50a090', '#3878c0'];
    const src = isTemp ? h.tempOverlay : h.moistMap;
    L.Fill(isTemp ? 'rgba(20,40,70,0.35)' : 'rgba(60,50,30,0.35)', 0, 0, W * 4, H * 4);
    const terrain = st.terrain;
    for (let i = 0; i < N; i++) {
      const t = terrain[i];
      if (t === T_DEEP || t === T_WATER) continue;
      const band = Math.min(4, Math.trunc(src[i] / 52));
      L.Fill(ramp[band], (i % W) * 4, ((i / W) | 0) * 4, 4, 4);
    }
  }
}

// ================= 黄金回放 =================
export function runOverlayTranscript() {
  const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/overlay.json'), 'utf8'));
  let n = 0, fail = 0;
  const fails = [];
  for (const s of golden.scens) {
    const st = {
      owner: rleDecode(s.ownerRle, N, -1),
      terrain: rleDecode(s.terrainRle, N, T_GRASS),
      civs: [],
    };
    if (s.civs) for (const c of s.civs) { while (st.civs.length <= c.id) st.civs.push(null); st.civs[c.id] = c; }
    const h = {
      mode: s.mode,
      alliances: s.alliances ?? [],
      allianceOf: s.allianceOf ? new Map(s.allianceOf) : new Map(),
      tempOverlay: rleDecode(s.tempRle, N, 128),
      moistMap: rleDecode(s.moistRle, N, 128),
    };
    const units = (s.units ?? []).map((u) => ({ x: h2f(u.x), y: h2f(u.y), dead: u.dead }));
    const L = new Lst();
    redrawOverlay(st, units, h, L);
    n++;
    const g = s.ops, m = L.ops;
    if (g.length !== m.length) { fail++; fails.push(`${s.name}: op 数 ${g.length} vs 镜像 ${m.length}`); continue; }
    let bad = null;
    for (let i = 0; i < g.length; i++) {
      const go = g[i], mo = m[i];
      if (go.o !== mo.o) { bad = `${i} opcode ${go.o} vs ${mo.o}`; break; }
      for (let k = 0; k < go.a.length; k++) {
        if (go.a[k] !== mo.a[k]) { bad = `${i} arg${k} ${go.a[k]} vs ${mo.a[k]} (${go.o})`; break; }
      }
      if (bad) break;
      const gs = JSON.stringify(go.s), ms = JSON.stringify(mo.s);
      if (gs !== ms) { bad = `${i} style ${gs} vs ${ms} (${go.o})`; break; }
    }
    if (bad) { fail++; fails.push(`${s.name}: op ${bad}`); }
  }
  return { n, fail, fails };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const r = runOverlayTranscript();
  console.log(`[OVERLAY TRANSCRIPT] ${r.n - r.fail}/${r.n} 逐位 ${r.fail === 0 ? 'ALL PASS' : 'FAIL'}`);
  for (const f of r.fails.slice(0, 15)) console.error('  [FAIL]', f);
  if (r.fail > 0) process.exit(1);
}
