// render6-transcript.mjs — WbEmergence.cs（M-U7b 涌现视觉域宿主生产）的 JS 独立镜像（防循环论证双链）
// 语义源 = WbEmergence.cs + WbSprites.cs HSL 色移链翻译稿（非 emergence.ts！）——黄金 = gen-render6.mjs 直录真实现（27 场景）。
// 覆盖：visCacheFor 全域（SPRITE_BASE 10 族/未知 sprite 回退 wolf/glow accent #7df9ff/pattern2 light 基色/
//       命中怪癖（同 race 二次调用参数被忽略）/invalidate 定向+全清/mutateVis 链输入面/钳制边界 l2 0.06..0.94）。
// 黄金 dump 协议（gen-render6）：
//   in.ops: {t:'c', race, vis: dumpVis|null, sprite} | {t:'i'} | {t:'i', race}（失效 op 不产出 out 行）
//   out（仅 c op）: null（vis null 域）| {hit:0|1, vc: dumpVc}
//   dumpVis/dumpVc：hue/lum/size/bulk → f64hex 大端；spikes/mane/glow/crest → 0/1；其余 int 直传
//   hit = 引用相等协议（race → 上次返回缓存对象；失效后重建归零）
//   场景首行全清缓存（gen vcScene 隔离语义）。
// 跑法：node scripts/unity-migration/render6-transcript.mjs（verify 段 19 由 verify-csharp-port.mjs 调用）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// f64hex 大端（gen-render6 dump 契约：DataView.setFloat64 默认大端）
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function h2f(h) {
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(h.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, false);
}

// ================= HSL 色移链（WbSprites.cs HexToHsl/HslToHex/To2/ShiftColor 语义转写） =================
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}
// C# To2：Floor(clamp0..255(v) * 255 + 0.5) —— JS Math.round 半上语义
function to2(v) {
  const n = Math.floor(Math.max(0, Math.min(255, v)) * 255 + 0.5);
  return n.toString(16).padStart(2, '0');
}
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return '#' + to2(r + m) + to2(g + m) + to2(b + m);
}
// WbSprites.ShiftColor：hue 漂移 + 明度乘数 + 钳制 0.06..0.94
function shiftColor(baseHex, v, lumBias = 0) {
  const hsl = hexToHsl(baseHex);
  const l2 = Math.max(0.06, Math.min(0.94, hsl[2] * v.lum + lumBias));
  return hslToHex(hsl[0] + v.hue, Math.min(1, hsl[1] * 1.05), l2);
}

// ================= SPRITE_BASE（WbEmergence.cs 表转写） =================
const SPRITE_BASE = {
  sheep: ['#f2ead8', '#575757', '#fffaf0'],
  wolf: ['#8d8d8d', '#3a342c', '#c8c8c8'],
  snowwolf: ['#eef2f5', '#d4dde4', '#ffffff'],
  bear: ['#6e4a2b', '#3a342c', '#9a6f45'],
  deer: ['#a5794f', '#5b3d24', '#d1a878'],
  penguin: ['#2b3a4a', '#14100c', '#f2f6fa'],
  camel: ['#c49a5c', '#8a6432', '#e8c890'],
  scorpion: ['#7a4a20', '#3a2410', '#b0763a'],
  snake: ['#4a7a3a', '#2a4a20', '#7aa85c'],
  person: ['#d9a066', '#3a342c', '#f2d0a0'],
};
function spriteBaseOf(sprite) {
  return Object.prototype.hasOwnProperty.call(SPRITE_BASE, sprite) && sprite != null ? SPRITE_BASE[sprite] : SPRITE_BASE.wolf;
}

// ================= visCacheMap + VisCacheFor（WbEmergence.cs 语义转写） =================
const visCacheMap = new Map(); // race → vc（模块级缓存；场景首行全清）

export function visCacheFor(race, vis, sprite) {   // export（M-U7c：render-transcript unitScene 涌现分支复用本镜像语义）
  if (vis == null) return null;
  const hit = visCacheMap.get(race);
  if (hit) return hit;
  const b = spriteBaseOf(sprite);
  const vc = {
    body: shiftColor(b[0], vis),
    dark: shiftColor(b[1], vis, -0.04),
    light: shiftColor(b[2], vis, 0.05),
    accent: shiftColor(vis.pattern === 2 ? b[2] : b[1], vis, vis.glow !== 0 ? 0.3 : 0.02),
    size: vis.size,
    bulk: vis.bulk,
    horns: vis.horns,
    spikes: vis.spikes !== 0 ? 1 : 0,
    mane: vis.mane !== 0 ? 1 : 0,
    tail: vis.tail,
    ears: vis.ears,
    glow: vis.glow !== 0 ? 1 : 0,
    pattern: vis.pattern,
    crest: vis.crest !== 0 ? 1 : 0,
  };
  if (vis.glow !== 0) vc.accent = '#7df9ff';
  visCacheMap.set(race, vc);
  return vc;
}
function invalidateVisCache(race) {
  if (race === undefined) visCacheMap.clear();
  else visCacheMap.delete(race);
}

// ================= 黄金回放 =================
export function runRender6Transcript() {
  const goldenPath = path.join(ROOT, 'scripts/unity-migration/golden/render6.json');
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
  let n = 0, fail = 0;
  const fails = [];

  // SPRITE_BASE 表对照锚（meta.spriteBase 10 族 × body/dark/light 逐字）
  const meta = golden.meta && golden.meta.spriteBase ? golden.meta.spriteBase : null;
  if (!meta) { fails.push('meta.spriteBase 缺失'); fail++; }
  else {
    const mk = Object.keys(meta);
    if (mk.length !== 10) { fails.push(`meta.spriteBase ${mk.length} 族 ≠ 10`); fail++; }
    for (const k of mk) {
      const g = meta[k], m = SPRITE_BASE[k];
      if (!m || m[0] !== g[0] || m[1] !== g[1] || m[2] !== g[2]) { fails.push(`SPRITE_BASE ${k} 表不一致`); fail++; }
    }
  }

  // 黄金 vis 输入面重建（dumpVis → WbVis 形态：bool 域保持 0/1 int，浮点域 h2f 位精确回读）
  const rebuildVis = (d) => (d == null ? null : {
    root: d.root, hue: h2f(d.hue), lum: h2f(d.lum), size: h2f(d.size), bulk: h2f(d.bulk),
    horns: d.horns, spikes: d.spikes, mane: d.mane, tail: d.tail,
    ears: d.ears, glow: d.glow, pattern: d.pattern, crest: d.crest,
  });
  // 镜像 vc 输出面 dump（dumpVc 契约：size/bulk f64hex 大端）
  const dumpVc = (vc) => ({
    body: vc.body, dark: vc.dark, light: vc.light, accent: vc.accent,
    size: f64hex(vc.size), bulk: f64hex(vc.bulk),
    horns: vc.horns, spikes: vc.spikes, mane: vc.mane, tail: vc.tail,
    ears: vc.ears, glow: vc.glow, pattern: vc.pattern, crest: vc.crest,
  });

  for (const s of golden.scens) {
    visCacheMap.clear(); // 场景隔离（gen vcScene 首行 invalidateVisCache()）
    const refs = new Map(); // race → 上次返回缓存对象（hit 引用相等协议）
    const out = [];
    for (const op of s.in.ops) {
      if (op.t === 'i') {
        if (op.race === undefined) invalidateVisCache();
        else invalidateVisCache(op.race);
        continue; // 失效 op 不产出 out 行（gen 协议）
      }
      const vis = rebuildVis(op.vis);
      const prev = refs.get(op.race);
      const vc = visCacheFor(op.race, vis, op.sprite);
      if (vc == null) { out.push(null); continue; }
      const hit = prev ? (vc === prev ? 1 : 0) : 0;
      refs.set(op.race, vc);
      out.push({ hit, vc: dumpVc(vc) });
    }
    n++;
    const g = s.out, m = out;
    if (g.length !== m.length) { fail++; fails.push(`${s.name}: out 行数 ${g.length} vs 镜像 ${m.length}`); continue; }
    let bad = null;
    for (let i = 0; i < g.length; i++) {
      const go = g[i], mo = m[i];
      if (go === null || mo === null) {
        if ((go === null) !== (mo === null)) bad = `${i} null 域分歧 ${go} vs ${mo}`;
        continue;
      }
      if (go.hit !== mo.hit) { bad = `${i} hit ${go.hit} vs ${mo.hit}`; break; }
      const gv = go.vc, mv = mo.vc;
      for (const k of ['body', 'dark', 'light', 'accent']) {
        if (gv[k] !== mv[k]) { bad = `${i} vc.${k} ${gv[k]} vs ${mv[k]}`; break; }
      }
      if (bad) break;
      for (const k of ['size', 'bulk']) {
        if (gv[k] !== mv[k]) { bad = `${i} vc.${k} ${gv[k]} vs ${mv[k]}（f64hex 位级）`; break; }
      }
      if (bad) break;
      for (const k of ['horns', 'spikes', 'mane', 'tail', 'ears', 'glow', 'pattern', 'crest']) {
        if (gv[k] !== mv[k]) { bad = `${i} vc.${k} ${gv[k]} vs ${mv[k]}`; break; }
      }
      if (bad) break;
    }
    if (bad) { fail++; fails.push(`${s.name}: op ${bad}`); }
  }
  return { n, fail, fails };
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const r = runRender6Transcript();
  console.log(`[RENDER6 TRANSCRIPT] ${r.n - r.fail}/${r.n} 逐位 ${r.fail === 0 ? 'ALL PASS' : 'FAIL'}`);
  for (const f of r.fails.slice(0, 15)) console.error('  [FAIL]', f);
  if (r.fail > 0) process.exit(1);
}
