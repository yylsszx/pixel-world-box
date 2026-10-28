// minimap-transcript.mjs — WbMinimap.cs（M-U7e minimap 小地图战略层）的 JS 独立镜像（防循环论证双链）
// 语义源 = WbMinimap.cs 翻译稿（非 render.ts renderMinimap！）——黄金 = gen-minimap.mjs 直录真实现（15 场景）。
// dump 解码：units/cam/view 坐标 f64hex 小端回读；fireSet/battles 插入序数组；rdefs 动态种 isCiv 注入；
//         op 流协议：fillRect s=[style]/strokeRect s=[style,lw 数值]/drawImage（符号 blit）s=[src, alpha 数值]。
// 跑法：node scripts/unity-migration/minimap-transcript.mjs（verify 段 22 由 verify-csharp-port.mjs 调用）
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const W = 256, H = 160;
const DEEP_BG = '#0d1b2e';
const R_ZOMBIE = 5, R_DRAGON = 9;

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
  return b.getFloat64(0, true);   // 小端（gen-minimap dump 契约 = gen-render5/7/overlay 家族 LE）
}
// 静态 41 族 isCiv（types.ts RACES 全表：civ 族 0/1/2/3/19/20——WbCivSim.RacesIsCiv 转写）
const RACES_IS_CIV = [
  true, true, true, true,                                // human/elf/dwarf/orc
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, // bandit..mage(4-18)
  true, true,                                            // lizard(19)/goblin(20)
  false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, false, // troll..shark(21-40)
];

// WbDrawList 镜像（op 协议与 gen dumpMinimapOps 同构；坐标 f64hex 小端，样式数值原值）
class Lst {
  constructor() { this.ops = []; }
  Fill(style, x, y, w, h) { this.ops.push({ o: 'fillRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [style] }); }
  Blit(src, alpha, x, y, w, h) { this.ops.push({ o: 'drawImage', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [src, alpha] }); }
  Stroke(style, lw, x, y, w, h) { this.ops.push({ o: 'strokeRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [style, lw] }); }
}

// def.isCiv 解析（WbMinimap.IsCivOf 转写：静态 41 表优先落基表，动态种落 rdefs 宿主——RACES[race].isCiv 分体等价）
function isCivOf(st, race) {
  if (race >= 0 && race < 41) return RACES_IS_CIV[race];
  const d = st.rdefs ? st.rdefs.get(race) : null;
  return d ? d.isCiv : false;
}

// ================= renderMinimap（WbMinimap.cs 语义转写） =================
function renderMinimap(st, units, h, L) {
  const mw = h.mw, mh = h.mh;
  L.Fill(DEEP_BG, 0, 0, mw, mh);
  L.Blit('terrain', 1, 0, 0, mw, mh);
  if (h.overlayMode != null && h.overlayMode !== 'none') {
    L.Blit('overlay', 0.62, 0, 0, mw, mh);
  }
  // units as dots（色决策；蓝本无 dead 过滤）
  for (const u of units) {
    let col;
    const civ = u.civ >= 0 && u.civ < st.civs.length ? st.civs[u.civ] : null;
    if (isCivOf(st, u.race) && u.civ >= 0 && civ != null && civ.alive) col = civ.colorHex;
    else col = u.race === R_ZOMBIE ? '#64c95d' : u.race === R_DRAGON ? '#cf3f2e' : '#f2ead8';
    if (u.boat) L.Fill(col, (u.x / 256) * mw - 1, (u.y / 160) * mh - 1, 2, 2);
    else L.Fill(col, (u.x / 256) * mw, (u.y / 160) * mh, 1, 1);
  }
  // 战略层：建筑金点 / 燃烧格橙点 / 活跃战线红点（插入序）
  if (h.buildings) for (const b of h.buildings) L.Fill('#ffd93d', (b[0] / 256) * mw, (b[1] / 160) * mh, 1, 1);
  if (h.fireSet) for (const fi of h.fireSet) L.Fill('#ff9b2d', ((fi % 256) / 256) * mw, (((fi / 256) | 0) / 160) * mh, 1, 1);
  if (h.battles) for (const bi of h.battles) L.Fill('#ff4030', ((bi % 256) / 256) * mw, (((bi / 256) | 0) / 160) * mh, 1, 1);
  // viewport rect
  const zx = (st.camX / 256) * mw;
  const zy = (st.camY / 160) * mh;
  const zw = (h.viewW / st.camZoom / 256) * mw;
  const zh = (h.viewH / st.camZoom / 160) * mh;
  L.Stroke('rgba(255,255,255,0.8)', 1, zx - zw / 2, zy - zh / 2, zw, zh);
}

// ================= 黄金重放 =================
export function runMinimapTranscript() {
  const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/minimap.json'), 'utf8'));
  let n = 0, fail = 0;
  const fails = [];
  for (const s of golden.scens) {
    const st = { civs: [], rdefs: new Map(), camX: h2f(s.cam.x), camY: h2f(s.cam.y), camZoom: h2f(s.cam.zoom) };
    if (s.civs) for (let i = 0; i < s.civs.length; i++) { st.civs[i] = s.civs[i]; }
    if (s.rdefs) for (const r of s.rdefs) st.rdefs.set(r.id, { isCiv: r.isCiv === 1 });
    const h = {
      mw: s.mw, mh: s.mh,
      viewW: h2f(s.view.w), viewH: h2f(s.view.h),
      overlayMode: s.overlayMode,
      fireSet: s.fireSet ?? null,
      battles: s.battles ?? null,
      buildings: s.buildings ? s.buildings.map((b) => [h2f(b.x), h2f(b.y)]) : null,
    };
    const units = (s.units ?? []).map((u) => ({ race: u.race, civ: u.civ, x: h2f(u.x), y: h2f(u.y), boat: u.boat === 1, dead: u.dead }));
    // 蓝本 redraw 触发语义：if (overlayDirty) redrawOverlay() —— redrawCalled ≡ overlayDirty（重绘本体属 overlay 层域）
    if (s.redrawCalled !== (s.overlayDirty ? 1 : 0)) { fail++; fails.push(`${s.name}: redrawCalled ${s.redrawCalled} vs overlayDirty ${s.overlayDirty}`); continue; }
    const L = new Lst();
    renderMinimap(st, units, h, L);
    n++;
    const g = s.ops, m = L.ops;
    if (g.length !== m.length) { fail++; fails.push(`${s.name}: op 数 ${g.length} vs 镜像 ${m.length}`); continue; }
    let bad = null;
    for (let i = 0; i < g.length; i++) {
      const go = g[i], mo = m[i];
      if (go.o !== mo.o) { bad = `${i} opcode ${go.o} vs ${mo.o}`; break; }
      if (go.o === 'drawImage' && go.src !== mo.s[0]) { bad = `${i} blit src ${go.src} vs ${mo.s[0]}`; break; }
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
  const r = runMinimapTranscript();
  console.log(`[MINIMAP TRANSCRIPT] ${r.n - r.fail}/${r.n} 逐位 ${r.fail === 0 ? 'ALL PASS' : 'FAIL'}`);
  for (const f of r.fails.slice(0, 15)) console.error('  [FAIL]', f);
  if (r.fail > 0) process.exit(1);
}
