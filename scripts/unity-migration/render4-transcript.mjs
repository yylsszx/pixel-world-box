// render4-transcript.mjs — WbSprites.cs（M-U5c 余域扩展）的 JS 独立镜像（防循环论证双链）
// 语义源 = WbSprites.cs 翻译稿（非 sprites.ts！）——黄金 = gen-render4.mjs 直录真实现（111 场景）。
// 覆盖：八新动物（chicken/pig/rabbit/fox/fish/crab/turtle/shark）+ drawBuilding + drawItem +
//       drawFire/drawTornado + drawEmergentCreature/drawEmergentMonster（涌现域含 save/scale 变换 op）。
// 跑法：node scripts/unity-migration/render4-transcript.mjs（verify 段 14 由 verify-csharp-port.mjs 调用）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
class MrrList {
  constructor() { this.ops = []; }
  Fill(style, x, y, w, h) { this.ops.push({ o: 'fillRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [style] }); }
  Tag(o, ...a) { this.ops.push({ o, a: a.map((v) => f64hex(v)), s: null }); }
}

// 坐标基元（WbSprites.cs 语义——与 M-U5b 镜像同源）
const Px2 = (u) => (u.dpx != null ? u.dpx : (u.rx != null ? u.rx : u.x) * 2);
const Py2 = (u) => (u.dpy != null ? u.dpy : (u.ry != null ? u.ry : u.y) * 2);
// C# halfUp = Math.Floor(v + 0.5)（全域 = JS Math.round）
const halfUp = (v) => Math.floor(v + 0.5);
const fl = (a, b) => Math.floor(a / b);

// —— isMoving（drawEmergent* 蓝本语义：ly null 时 lifted != 为 true）——
const isMov = (u) => u.lx != null && (u.lx !== u.x || u.ly !== u.y);

function mrrRgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }
// sprites.ts mix（半上）
function mrrMix(a, b, t) {
  return [
    halfUp(a[0] + (b[0] - a[0]) * t),
    halfUp(a[1] + (b[1] - a[1]) * t),
    halfUp(a[2] + (b[2] - a[2]) * t),
  ];
}
// WbSprites.Mix3：hex→rgb→mix→rgb()
function mrrMix3(hex, hex2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex), b = p(hex2);
  return mrrRgb([
    Math.floor(a[0] + (b[0] - a[0]) * t + 0.5),
    Math.floor(a[1] + (b[1] - a[1]) * t + 0.5),
    Math.floor(a[2] + (b[2] - a[2]) * t + 0.5),
  ]);
}

// ================= 八新动物 =================
export function mrrDrawChicken(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : (u.infected !== 0 ? '#b8e2b4' : '#f6f1e4');
  const moving = u.lx != null && (u.lx !== u.x || u.ly !== u.y);
  const step = ((frame >> 3) & 1) === 1;
  L.Fill('#d9a03c', px, py + 1, 1, 1);
  if (!(moving && step)) L.Fill('#d9a03c', px + 1, py + 1, 1, 1);
  L.Fill(body, px - 1, py - 1, 3, 2);
  L.Fill('#b07a3a', px - f, py, 1, 1);
  L.Fill('#b07a3a', px - 2 * f, py - 2, 1, 1);
  const peck = (((frame >> 4) + u.id) % 7) === 0;
  const hy = py - 2 + (peck ? 2 : 0);
  L.Fill(body, px + f, hy, 1, 1);
  L.Fill('#cf3f2e', px + f, hy - 1, 1, 1);
  L.Fill('#e8a33c', px + 2 * f, hy + (peck ? 1 : 0), 1, 1);
}
export function mrrDrawPig(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : (u.infected !== 0 ? '#b8e2b4' : '#e8a8a0');
  const step = ((frame >> 3) & 1) === 1;
  const moving = u.lx != null && (u.lx !== u.x || u.ly !== u.y);
  L.Fill('#a86058', px - 1, py + 1, 1, 1);
  if (!(moving && step)) L.Fill('#a86058', px + 1, py + 1, 1, 1);
  L.Fill(body, px - 2, py - 1, 4, 2);
  L.Fill(hurt ? '#ffc4b8' : '#f2c8c0', px - 1, py - 1, 2, 1);
  const hx = f > 0 ? px + 2 : px - 4;
  L.Fill(body, hx, py - 1, 2, 2);
  L.Fill('#a86058', hx + (f > 0 ? 0 : 1), py - 2, 1, 1);
  L.Fill('#d98a86', hx + (f > 0 ? 2 : -1), py, 1, 1);
  L.Fill('#14100c', hx + (f > 0 ? 1 : 0), py - 1, 1, 1);
  L.Fill('#d98a86', f > 0 ? px - 3 : px + 2, py - 1, 1, 1);
}
export function mrrDrawRabbit(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : (u.infected !== 0 ? '#b8e2b4' : '#b8b0a4');
  const moving = u.lx != null && (u.lx !== u.x || u.ly !== u.y);
  const hop = moving && ((frame >> 3) & 1) === 1;
  const y0 = py - (hop ? 1 : 0);
  if (hop) L.Fill('#6e685e', px, py + 1, 2, 1);
  else { L.Fill('#6e685e', px - 1, py + 1, 1, 1); L.Fill('#6e685e', px + 1, py + 1, 1, 1); }
  L.Fill(body, px - 1, y0 - 1, 2, 2);
  L.Fill('#f2ead8', f > 0 ? px - 2 : px + 1, y0, 1, 1);
  const hx = f > 0 ? px : px - 2;
  L.Fill(body, hx, y0 - 3, 2, 2);
  L.Fill(body, hx + (f > 0 ? 0 : 1), y0 - 5, 1, 2);
  L.Fill(body, hx + (f > 0 ? 1 : 0), y0 - 4, 1, 1);
  L.Fill('#e8a8a0', hx + (f > 0 ? 0 : 1), y0 - 4, 1, 1);
  L.Fill('#14100c', hx + (f > 0 ? 1 : 0), y0 - 2, 1, 1);
}
export function mrrDrawFox(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : (u.infected !== 0 ? '#b8e2b4' : '#d97b3c');
  const step = ((frame >> 3) & 1) === 1;
  const moving = u.lx != null && (u.lx !== u.x || u.ly !== u.y);
  L.Fill('#5a2f14', px - 1, py, 1, 1);
  if (!(moving && step)) L.Fill('#5a2f14', px + 1, py, 1, 1);
  L.Fill(body, px - 1, py - 1, 3, 1);
  const wag = ((frame >> 4) & 1) === 1 ? -1 : 0;
  const tx = f > 0 ? px - 4 : px + 2;
  L.Fill(body, tx, py - 2 + wag, 2, 2);
  L.Fill('#f2ead8', f > 0 ? tx : tx + 1, py - 2 + wag, 1, 1);
  const hx = f > 0 ? px + 1 : px - 3;
  L.Fill(body, hx, py - 2, 2, 2);
  L.Fill('#8a4a1c', hx + (f > 0 ? 0 : 1), py - 3, 1, 1);
  L.Fill('#8a4a1c', hx + (f > 0 ? 1 : 0), py - 3, 1, 1);
  L.Fill('#f2ead8', hx + (f > 0 ? 2 : -1), py - 1, 1, 1);
  L.Fill('#14100c', hx + (f > 0 ? 1 : 0), py - 2, 1, 1);
}
export function mrrDrawFish(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const hurt = u.hurt > 0;
  const jp = (frame + u.id * 13) % 260;
  if (jp < 10) {
    const jt = jp / 10.0;
    const jy = py - halfUp(Math.sin(jt * Math.PI) * 3);
    L.Fill(hurt ? '#ff6b5e' : '#dceef2', px, jy, 2, 1);
    L.Fill('#9fd4d8', px - f, jy + 1, 1, 1);
    L.Fill('#14100c', px + (f > 0 ? 1 : 0), jy, 1, 1);
    L.Fill('rgba(224,244,255,0.8)', px - 1, py, 1, 1);
    L.Fill('rgba(224,244,255,0.8)', px + 2, py, 1, 1);
    return;
  }
  const tailL = ((frame >> 3) & 1) === 1;
  L.Fill(hurt ? 'rgba(255,107,94,0.8)' : 'rgba(200,232,240,0.55)', px - 1, py, 2, 1);
  L.Fill(hurt ? 'rgba(207,63,46,0.7)' : 'rgba(150,205,220,0.7)', tailL ? px - 2 : px + 1, py, 1, 1);
}
export function mrrDrawCrab(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : (u.infected !== 0 ? '#b8e2b4' : '#d94a3a');
  const st = ((frame >> 3) & 1) === 1;
  L.Fill('#8a2418', px - 2, py + 1, 1, 1);
  L.Fill('#8a2418', px + 1, py + 1, 1, 1);
  if (st) L.Fill('#8a2418', px, py + 1, 1, 1);
  L.Fill(body, px - 1, py - 1, 2, 2);
  L.Fill('#f2ead8', px - 1, py - 2, 1, 1);
  L.Fill('#f2ead8', px, py - 2, 1, 1);
  L.Fill('#14100c', px - 1, py - 2, 1, 1);
  const pinch = ((frame >> 4) & 1) === 1;
  L.Fill('#e86a4a', px - 3, py - 1 - (pinch ? 1 : 0), 1, 1);
  L.Fill('#e86a4a', px + 2, py - 1 + (pinch ? 1 : 0), 1, 1);
}
export function mrrDrawTurtle(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const hurt = u.hurt > 0;
  const shell = hurt ? '#ff6b5e' : (u.infected !== 0 ? '#b8e2b4' : '#4a7a3a');
  const st = ((frame >> 4) & 1) === 1;
  L.Fill('#2e5424', px - 2, py + 1, 1, 1);
  if (!st) L.Fill('#2e5424', px, py + 1, 1, 1);
  L.Fill(shell, px - 2, py - 1, 3, 2);
  L.Fill('#2e5424', px - 1, py - 1, 1, 1);
  L.Fill('#2e5424', px, py, 1, 1);
  L.Fill('#6a9a54', px - 1, py - 1, 2, 1);
  const poke = ((frame >> 5) & 3) !== 3;
  const hx = f > 0 ? px + 1 : px - 3;
  if (poke) {
    L.Fill(hurt ? '#ff6b5e' : '#8aa860', hx, py - 1, 2, 1);
    L.Fill('#14100c', hx + (f > 0 ? 1 : 0), py - 1, 1, 1);
  }
}
export function mrrDrawShark(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const hurt = u.hurt > 0;
  const fin = hurt ? '#ff6b5e' : '#5a6a78';
  L.Fill(fin, px, py - 3, 1, 2);
  L.Fill(fin, px + 1, py - 2, 1, 1);
  const wv = ((frame >> 3) & 1) === 1;
  L.Fill('rgba(224,244,255,0.5)', px - 2, py - 1, 2, 1);
  if (wv) L.Fill('rgba(224,244,255,0.5)', px + 2, py - 1, 2, 1);
  const tailL = ((frame >> 3) & 1) === 1;
  L.Fill(hurt ? 'rgba(255,107,94,0.4)' : 'rgba(30,52,70,0.45)', px - 1, py, 4, 1);
  L.Fill(hurt ? 'rgba(255,107,94,0.4)' : 'rgba(30,52,70,0.45)', tailL ? px - 3 : px + 3, py, 1, 1);
}

// ================= drawBuilding =================
export function mrrDrawBuilding(L, bxx, byy, kind, color, tier, hpRatio) {
  const px = bxx * 4 - 4;
  const py = byy * 4 - 8;
  switch (kind) {
    case 3:
      L.Fill('#575757', px + 4, py + 4, 4, 12);
      L.Fill('#8d8d8d', px + 4, py + 4, 2, 12);
      L.Fill('#a5a5a9', px + 3, py + 2, 6, 2);
      L.Fill('#6e6e72', px + 3, py + 3, 6, 1);
      L.Fill(mrrRgb(color), px + 4, py, 2, 4);
      L.Fill('#14100c', px + 6, py + 10, 2, 4);
      L.Fill('#44444a', px + 3, py + 15, 6, 1);
      return;
    case 4:
      L.Fill('#d9b44a', px, py + 2, 12, 8);
      L.Fill('#b8912f', px, py + 4, 12, 2);
      L.Fill('#b8912f', px, py + 8, 12, 1);
      L.Fill('#7a5a2c', px - 2, py, 2, 12);
      L.Fill('#7a5a2c', px + 12, py, 2, 12);
      L.Fill('#7a5a2c', px - 2, py, 16, 2);
      L.Fill('#ffd93d', px + 2, py + 3, 1, 1);
      L.Fill('#ffd93d', px + 5, py + 3, 1, 1);
      L.Fill('#ffd93d', px + 8, py + 6, 1, 1);
      L.Fill('#ffd93d', px + 3, py + 6, 1, 1);
      L.Fill('#c9a84a', px + 10, py + 10, 3, 2);
      L.Fill('#a5843a', px + 10, py + 12, 3, 1);
      return;
    case 5:
      L.Fill('#8c2317', px, py, 14, 4);
      L.Fill('#5c150d', px, py + 2, 14, 2);
      L.Fill('#a08662', px, py + 4, 14, 6);
      L.Fill('#7a6a4c', px, py + 8, 14, 2);
      L.Fill('#14100c', px + 6, py + 4, 2, 6);
      L.Fill('rgba(0,0,0,0.15)', px + 1, py + 6, 4, 1);
      L.Fill('rgba(0,0,0,0.15)', px + 9, py + 6, 4, 1);
      L.Fill('#3a342c', px - 2, py - 4, 2, 6);
      L.Fill('#3a342c', px + 14, py - 4, 2, 6);
      L.Fill(mrrRgb(color), px - 2, py - 4, 4, 2);
      L.Fill(mrrRgb(color), px + 14, py - 4, 4, 2);
      return;
    case 6: {
      const cx = px - 2, cy = py - 4;
      L.Fill('#8d8d8d', cx + 4, cy + 6, 12, 12);
      L.Fill('#6e6e72', cx + 4, cy + 14, 12, 2);
      L.Fill('#6e6e72', cx + 8, cy + 8, 2, 10);
      L.Fill('#a5a5a9', cx, cy + 2, 4, 16);
      L.Fill('#a5a5a9', cx + 16, cy + 2, 4, 16);
      L.Fill('#575757', cx, cy + 14, 4, 2);
      L.Fill('#575757', cx + 16, cy + 14, 4, 2);
      L.Fill('#a5a5a9', cx, cy + 1, 1, 2);
      L.Fill('#a5a5a9', cx + 2, cy + 1, 1, 2);
      L.Fill('#a5a5a9', cx + 16, cy + 1, 1, 2);
      L.Fill('#a5a5a9', cx + 18, cy + 1, 1, 2);
      L.Fill('#a5a5a9', cx + 4, cy + 4, 2, 2);
      L.Fill('#a5a5a9', cx + 8, cy + 4, 2, 2);
      L.Fill('#a5a5a9', cx + 12, cy + 4, 2, 2);
      L.Fill('#3a342c', cx + 8, cy - 4, 2, 6);
      L.Fill(mrrRgb(color), cx + 10, cy - 4, 6, 4);
      L.Fill('#14100c', cx + 8, cy + 12, 4, 6);
      L.Fill('#5c3a1c', cx + 9, cy + 13, 2, 5);
      return;
    }
    case 11: {
      const dmg = hpRatio < 0.3 ? 2 : hpRatio < 0.6 ? 1 : 0;
      const cBody = dmg === 0 ? '#8d8d8d' : dmg === 1 ? '#76767a' : '#5e5e62';
      const cDark = dmg === 0 ? '#6e6e72' : dmg === 1 ? '#58585c' : '#46464a';
      const cLight = dmg === 0 ? '#a5a5a9' : dmg === 1 ? '#8e8e92' : '#76767a';
      L.Fill(cLight, px + 3, py + 3, 2, 2);
      L.Fill(cLight, px + 6, py + 3, 2, 2);
      L.Fill(cLight, px + 9, py + 3, 2, 2);
      L.Fill(cBody, px + 3, py + 5, 8, 11);
      L.Fill(cLight, px + 3, py + 5, 1, 11);
      L.Fill(cDark, px + 3, py + 8, 8, 1);
      L.Fill(cDark, px + 3, py + 12, 8, 1);
      L.Fill(cDark, px + 7, py + 5, 1, 3);
      L.Fill(cDark, px + 5, py + 9, 1, 3);
      L.Fill(cDark, px + 9, py + 13, 1, 3);
      L.Fill('#44444a', px + 3, py + 15, 8, 1);
      if (dmg > 0) {
        L.Fill('#14100c', px + 6, py + 6, 1, 3);
        L.Fill('#14100c', px + 7, py + 9, 1, 2);
        if (dmg > 1) {
          L.Fill('#14100c', px + 4, py + 11, 1, 4);
          L.Fill('#14100c', px + 9, py + 7, 1, 2);
        }
      }
      return;
    }
    case 7:
      L.Fill('#9c6a3c', px, py + 4, 14, 4);
      L.Fill('#7a4f2a', px, py + 6, 14, 2);
      L.Fill('#5c3a1c', px, py + 8, 2, 4);
      L.Fill('#5c3a1c', px + 12, py + 8, 2, 4);
      L.Fill('#3a342c', px + 2, py - 2, 2, 6);
      L.Fill('#3a342c', px + 2, py - 2, 8, 2);
      L.Fill('#c98d5a', px + 6, py, 4, 4);
      L.Fill('#a06a3c', px + 6, py + 2, 4, 2);
      L.Fill(mrrRgb(color), px + 10, py - 4, 4, 4);
      L.Fill('#3a342c', px + 10, py - 4, 2, 4);
      return;
    case 8:
      L.Fill('#3a6ea5', px, py, 12, 4);
      L.Fill('#254d78', px, py + 2, 12, 2);
      L.Fill('#d8c9a3', px, py + 4, 12, 6);
      L.Fill('#b3a077', px, py + 8, 12, 2);
      L.Fill('#3a342c', px + 4, py + 4, 4, 6);
      L.Fill('#f2ead8', px + 2, py + 6, 2, 2);
      L.Fill('#f2ead8', px + 8, py + 6, 2, 2);
      L.Fill('#ffd93d', px + 4, py - 2, 4, 2);
      L.Fill('#ffd93d', px + 5, py - 3, 2, 1);
      return;
    case 9:
      L.Fill('#cf3f2e', px, py + 2, 14, 4);
      L.Fill('#f2ead8', px + 2, py + 2, 2, 4);
      L.Fill('#f2ead8', px + 6, py + 2, 2, 4);
      L.Fill('#f2ead8', px + 10, py + 2, 2, 4);
      L.Fill('#9c6a3c', px, py + 6, 14, 4);
      L.Fill('#7a4f2a', px, py + 8, 14, 2);
      L.Fill('#ffd93d', px + 2, py + 5, 2, 2);
      L.Fill('#ffd93d', px + 8, py + 5, 2, 2);
      L.Fill('#6fd66f', px + 4, py + 5, 2, 2);
      L.Fill('#6fd66f', px + 10, py + 5, 2, 2);
      return;
    case 10:
      L.Fill('#ffd93d', px + 2, py - 4, 10, 4);
      L.Fill('#c9a02a', px + 2, py - 2, 10, 2);
      L.Fill('#c9a02a', px + 6, py - 6, 2, 2);
      L.Fill('#f2ead8', px - 2, py, 18, 2);
      L.Fill('#e8e0cc', px, py + 2, 2, 8);
      L.Fill('#e8e0cc', px + 4, py + 2, 2, 8);
      L.Fill('#e8e0cc', px + 8, py + 2, 2, 8);
      L.Fill('#e8e0cc', px + 12, py + 2, 2, 8);
      L.Fill('rgba(255,240,190,0.85)', px + 2, py + 4, 10, 6);
      L.Fill('#c9bfa3', px - 2, py + 10, 18, 2);
      return;
  }
  const big = kind === 2;
  const w = big ? 16 : 12;
  const ox = px - (big ? 2 : 0);
  const wallTop = tier >= 3 ? '#e8e0cc' : tier >= 1 ? '#a5a5a9' : '#c98d5a';
  const wallLow = tier >= 3 ? '#c9bfa3' : tier >= 1 ? '#6e6e72' : '#9c6a3c';
  L.Fill(mrrRgb(color), ox, py, w, 4);
  L.Fill(mrrRgb(mrrMix(color, [0, 0, 0], 0.35)), ox, py + 2, w, 2);
  if (tier >= 3) {
    L.Fill('#ffd93d', ox + 2, py - 2, 2, 2);
    L.Fill('#ffd93d', ox + w - 4, py - 2, 2, 2);
    L.Fill('#ffd93d', ox + Math.floor(w / 2) - 1, py - 4, 2, 4);
  }
  L.Fill(wallTop, ox, py + 4, w, 4);
  L.Fill(wallLow, ox, py + 6, w, 2);
  if (tier === 1 || tier === 2) {
    L.Fill('rgba(0,0,0,0.18)', ox + 4, py + 4, 2, 2);
    L.Fill('rgba(0,0,0,0.18)', ox + w - 6, py + 6, 2, 2);
    L.Fill('rgba(0,0,0,0.18)', ox + 8, py + 4, 2, 2);
  }
  if (tier === 2) {
    L.Fill('#a5a5a9', ox, py - 2, 2, 2);
    L.Fill('#a5a5a9', ox + Math.floor(w / 2) - 1, py - 2, 2, 2);
    L.Fill('#a5a5a9', ox + w - 2, py - 2, 2, 2);
    L.Fill('#575757', ox + 2, py - 2, 2, 2);
    L.Fill('#575757', ox + w - 4, py - 2, 2, 2);
  }
  L.Fill('#3a2a18', ox + Math.floor(w / 2) - 2, py + 4, 3, 4);
  L.Fill(tier >= 3 ? '#ffd93d' : '#ffdba0', ox + 2, py + 4, 2, 2);
  L.Fill(tier >= 3 ? '#ffd93d' : '#ffdba0', ox + w - 4, py + 4, 2, 2);
  L.Fill('rgba(0,0,0,0.3)', ox, py + 8, w, 2);
  if (big) {
    L.Fill('#3a342c', ox + w, py - 4, 2, 6);
    L.Fill(mrrRgb(color), ox + w + 2, py - 4, 4, 2);
  }
}

// ================= drawItem（查表上提：defSlot/defRarity/defArt/main 入参） =================
export function mrrDrawItem(L, ix, iy, kind, id, frame, defSlot, defRarity, defArt, main) {
  const px = halfUp(ix * 2);
  const py = halfUp(iy * 2);
  const bob = Math.floor(frame / 12.0) % 2;
  const y = py - bob;
  if (kind === 'meat') {
    L.Fill('rgba(0,0,0,0.22)', px - 1, py + 2, 3, 1);
    L.Fill('#9a5a2c', px - 1, y - 1, 2, 2);
    L.Fill('#b56f3a', px - 1, y - 1, 1, 1);
    L.Fill('#f2ead8', px + 1, y, 1, 1);
    L.Fill('#f2ead8', px + 1, y - 1, 1, 1);
    return;
  }
  if (defSlot == null) return;
  const accent = defRarity >= 3 ? '#ffd93d' : defRarity === 2 ? '#e8f0ff' : '#8a9098';
  switch (defSlot) {
    case 'wep': {
      if (defArt === 'bow') {
        L.Fill(main, px - 1, y - 2, 1, 4);
        L.Fill(main, px, y - 3, 1, 1);
        L.Fill(main, px, y + 2, 1, 1);
        L.Fill(accent, px + 1, y - 2, 1, 4);
      } else if (defArt === 'staff') {
        L.Fill('#6e4a2b', px, y - 3, 1, 5);
        L.Fill(main, px, y - 4, 1, 1);
        L.Fill(main, px - 1, y - 3, 1, 1);
        L.Fill(main, px + 1, y - 3, 1, 1);
      } else {
        L.Fill(main, px, y - 3, 1, 3);
        L.Fill(main, px + 1, y - 2, 1, 1);
        L.Fill(accent, px - 1, y, 3, 1);
        L.Fill('#6e4a2b', px, y + 1, 1, 1);
      }
      break;
    }
    case 'arm':
      L.Fill(main, px - 1, y - 2, 3, 2);
      L.Fill(main, px, y, 2, 1);
      L.Fill(accent, px - 1, y, 1, 1);
      break;
    case 'hlm':
      L.Fill(main, px - 1, y - 2, 3, 2);
      L.Fill(accent, px, y - 3, 1, 1);
      break;
    case 'shd':
      L.Fill(main, px - 1, y - 2, 3, 3);
      L.Fill(accent, px, y - 1, 1, 1);
      break;
    case 'bts':
      L.Fill(main, px - 1, y - 1, 1, 2);
      L.Fill(main, px + 1, y - 1, 1, 2);
      L.Fill(accent, px - 1, y + 1, 2, 1);
      break;
    case 'rng':
      L.Fill(main, px, y - 1, 1, 1);
      L.Fill(main, px - 1, y, 1, 1);
      L.Fill(main, px + 1, y, 1, 1);
      L.Fill(main, px, y + 1, 1, 1);
      L.Fill(accent, px, y - 2, 1, 1);
      break;
    case 'amu':
      L.Fill(main, px, y - 2, 1, 1);
      L.Fill(main, px - 1, y - 1, 3, 1);
      L.Fill(main, px, y, 1, 1);
      L.Fill(accent, px, y - 1, 1, 1);
      break;
  }
  const sparkleEvery = defRarity >= 3 ? 10 : defRarity === 2 ? 18 : 28;
  if ((frame + id * 3) % sparkleEvery < 4) {
    const sparkle = defRarity >= 3 ? 'rgba(255,220,120,0.95)' : 'rgba(255,240,200,0.85)';
    L.Fill(sparkle, px + 2, y - 4, 1, 1);
    if (defRarity >= 4) L.Fill(sparkle, px - 2, y - 2, 1, 1);
  }
  L.Fill('rgba(0,0,0,0.22)', px - 1, py + 2, 3, 1);
}

// ================= drawFire / drawTornado =================
const FIRE_COLORS = ['#ff9b2d', '#ffd93d', '#cf3f2e', '#ffce6a'];
export function mrrDrawFire(L, x, y, i, frame) {
  const px = x * 2;
  const py = y * 2;
  const h = (i * 2654435761) >>> 0;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const f = (h + ((frame * 7) << 8) + dx * 3 + dy * 11) % 11;
      if (f < 7) L.Fill(FIRE_COLORS[f % FIRE_COLORS.length], px + dx, py + dy - ((f > 3 && dy === 0) ? 1 : 0), 1, 1);
    }
  }
}
export function mrrDrawTornado(L, ex, ey, frame) {
  const px = ex * 2;
  const py = ey * 2;
  for (let s = 0; s < 9; s++) {
    const yy = py - s * 2;
    const w = 1 + Math.floor(s / 2);
    const spin = Math.floor(frame / 3.0 + s) % 3;
    L.Fill(s < 3 ? 'rgba(120,115,105,0.95)' : 'rgba(160,155,145,0.8)', px - w + spin, yy, w * 2 - 1, 1);
  }
  const df = frame % 5;
  L.Fill('#3a342c', px - 3 + df, py - 2, 1, 1);
  L.Fill('#3a342c', px + 3 - df, py - 5, 1, 1);
}

// ================= 涌现域（WbVisCache：bool 语义 int 0/1） =================
export function mrrDrawEmergentCreature(L, u, vc, t) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = isMov(u);
  const step = isMoving ? ((t >> 2) & 1) : 0;
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : (u.infected !== 0 ? '#9fd68f' : vc.body);
  const dark = hurt ? '#cf3f2e' : vc.dark;
  const light = hurt ? '#ffc4b8' : vc.light;
  const accent = hurt ? '#ffd93d' : vc.accent;
  const scale = Math.max(0.8, Math.min(1.45, vc.size));
  const scaled = Math.abs(scale - 1) > 0.06;
  if (scaled) {
    L.Tag('save');
    L.Tag('translate', px, py + 2);
    L.Tag('scale', scale, scale);
    L.Tag('translate', -px, -(py + 2));
  }
  const bw = 3 + (vc.bulk >= 0.55 ? 1 : 0) + (vc.size >= 1.25 ? 1 : 0);
  const bh = 1 + (vc.bulk >= 0.82 ? 1 : 0);
  const bx = px - Math.trunc(bw / 2) - (f > 0 ? 0 : 1);
  const by = py - 1;
  L.Fill(body, bx, by, bw, bh);
  if (bh >= 2) L.Fill(light, bx + 1, by + bh - 1, bw - 2, 1);
  L.Fill(dark, bx + 1, by, bw - 2 > 1 ? bw - 3 : 1, 1);
  if (vc.pattern === 1) {
    L.Fill(dark, bx + 1, by, 1, bh);
    if (bw >= 4) L.Fill(dark, bx + 3, by, 1, bh);
  } else if (vc.pattern === 2) {
    L.Fill(accent, bx + (bw >> 1), by, 1, 1);
    if (bw >= 4 && bh >= 2) L.Fill(accent, bx + 1, by + bh - 1, 1, 1);
  }
  if (vc.spikes !== 0) {
    const sn = bw >= 4 ? 3 : 2;
    for (let i = 0; i < sn; i++) L.Fill(dark, bx + 1 + i, by - 1, 1, 1);
  }
  if (vc.mane !== 0) L.Fill(light, bx + (f > 0 ? bw - 2 : 1) - f, by - 1, 2, 1);
  const hx = f > 0 ? bx + bw : bx - 1;
  L.Fill(body, hx, by, 1, bh >= 2 ? 2 : 1);
  L.Fill(body, hx + f, by + (bh >= 2 ? 1 : 0), 1, 1);
  L.Fill(vc.glow !== 0 ? '#7df9ff' : dark, hx, by, 1, 1);
  if (vc.ears === 1) L.Fill(body, hx - f, by - 1, 1, 1);
  else if (vc.ears === 2) L.Fill(dark, hx - 2 * f, by - 1, 2, 1);
  if (vc.horns >= 1) {
    L.Fill(light, hx - f, by - 1, 1, 1);
    if (vc.horns >= 2) L.Fill(light, hx, by - 2, 1, 1);
  }
  if (vc.crest !== 0) L.Fill(accent, hx - f, by - (vc.horns >= 2 ? 3 : 2), 2, 1);
  if (vc.tail >= 1) {
    const tx = f > 0 ? bx - 1 : bx + bw;
    const wag = ((t >> 3) & 1) === 1 ? -1 : 0;
    L.Fill(body, tx, by, 1, 1);
    if (vc.tail >= 2) L.Fill(body, tx - f, by + wag, 1, 1);
  }
  if (isMoving) {
    if (step === 1) {
      L.Fill(dark, bx + 1, by + bh, 1, 1);
      L.Fill(dark, bx + bw - 2, by + bh, 1, 2);
    } else {
      L.Fill(dark, bx + 1, by + bh, 1, 2);
      L.Fill(dark, bx + bw - 2, by + bh, 1, 1);
    }
  } else {
    L.Fill(dark, bx + 1, by + bh, 1, 1);
    L.Fill(dark, bx + bw - 2, by + bh, 1, 1);
  }
  if (scaled) L.Tag('restore');
}
export function mrrDrawEmergentMonster(L, u, vc, shape, t) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const hurt = u.hurt > 0;
  const body = hurt ? '#ff6b5e' : (u.infected !== 0 ? '#9fd68f' : vc.body);
  const dark = hurt ? '#cf3f2e' : vc.dark;
  const light = hurt ? '#ffc4b8' : vc.light;
  const accent = hurt ? '#ffd93d' : vc.accent;
  const scale = Math.max(0.9, Math.min(1.5, vc.size));
  const scaled = Math.abs(scale - 1) > 0.06;
  if (scaled) {
    L.Tag('save');
    L.Tag('translate', px, py + 2);
    L.Tag('scale', scale, scale);
    L.Tag('translate', -px, -(py + 2));
  }
  if (shape === 'aquatic') {
    L.Fill('rgba(0,0,20,0.25)', px - 3, py + 2, 7, 1);
    L.Fill(body, px - 2, py - 4, 5, 2);
    L.Fill(body, px - 1, py - 5, 3, 1);
    L.Fill(light, px - 1, py - 5, 2, 1);
    if (vc.horns >= 1) {
      L.Fill(light, px - 2, py - 6, 1, 1);
      L.Fill(light, px + 2, py - 6, 1, 1);
    }
    if (vc.spikes !== 0) L.Fill(dark, px - 1, py - 6, 1, 1);
    L.Fill(vc.glow !== 0 ? '#7df9ff' : dark, px - 1, py - 3, 1, 1);
    L.Fill(vc.glow !== 0 ? '#7df9ff' : dark, px + 1, py - 3, 1, 1);
    if (vc.pattern === 1) {
      L.Fill(dark, px - 2, py - 4, 1, 1);
      L.Fill(dark, px + 2, py - 4, 1, 1);
    } else if (vc.pattern === 2) {
      L.Fill(accent, px, py - 4, 1, 1);
    }
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const k = i % 4;
      const curl = (((t >> 3) + i) % 4) < 2 ? 1 : 0;
      const bxp = px + side * (2 + (k >> 1));
      L.Fill(dark, bxp, py - 2, 1, 2 + (k & 1));
      if (curl !== 0) L.Fill(dark, bxp + side, py + (k & 1), 1, 1);
    }
  } else if (shape === 'worm') {
    L.Fill('rgba(80,60,30,0.3)', px - 4, py + 2, 9, 1);
    const segs = 4 + (vc.bulk >= 0.6 ? 1 : 0);
    const maw = ((t >> 3) & 1) === 1;
    for (let i = 0; i < segs; i++) {
      const w = i === 0 ? 4 : 3 - Math.min(1, i >> 1);
      const sx = f > 0 ? px - i * 2 : px - w + 2 + i * 2 - 2;
      const sy = py - 2 - (i === 0 ? 1 : 0) + (i % 2 === 1 ? 1 : 0);
      L.Fill(i === 0 ? body : mrrMix3(body, dark, 0.12 * i), sx, sy, w, 3 - (i >> 1));
      if (i > 0) L.Fill(dark, sx, sy, 1, 3 - (i >> 1));
    }
    const hxx = f > 0 ? px : px - 4;
    L.Fill(vc.glow !== 0 ? '#7df9ff' : dark, hxx + 1, py - 3, 1, 1);
    L.Fill('#1c0f08', hxx + (f > 0 ? 2 : -1), py - 2, 2, maw ? 2 : 1);
    if (maw) {
      L.Fill('#f2ead8', hxx + (f > 0 ? 2 : -1), py - 2, 1, 1);
      L.Fill('#f2ead8', hxx + (f > 0 ? 3 : 0), py - 1, 1, 1);
    }
    if (vc.spikes !== 0) {
      L.Fill(dark, px - 1, py - 4, 1, 1);
      L.Fill(dark, px - 3, py - 3, 1, 1);
    }
    if (vc.crest !== 0) L.Fill(accent, px, py - 4, 2, 1);
  } else {
    L.Fill('rgba(0,0,0,0.22)', px - 4, py + 2, 8, 1);
    L.Fill(body, px - 4, py + 1, 4, 1);
    L.Fill(body, px - 2, py, 3, 1);
    L.Fill(body, px - 1, py - 1, 3, 1);
    L.Fill(body, px, py - 2, 3, 2);
    L.Fill(body, px + 1, py - 4, 2, 2);
    L.Fill(light, px + 1, py - 4, 2, 1);
    if (vc.crest !== 0 || vc.horns >= 1) L.Fill(mrrMix3(body, dark, 0.35), px - 1, py - 4, 2, 2);
    L.Fill(vc.glow !== 0 ? '#7df9ff' : '#ffd93d', px + 2, py - 4, 1, 1);
    if (((t >> 4) & 1) === 1) L.Fill('#e05a5a', px + 3, py - 3, 1, 1);
    if (vc.pattern === 1) {
      L.Fill(dark, px - 3, py + 1, 1, 1);
      L.Fill(dark, px - 1, py, 1, 1);
      L.Fill(dark, px + 1, py - 1, 1, 1);
    } else if (vc.pattern === 2) {
      L.Fill(accent, px - 2, py + 1, 1, 1);
      L.Fill(accent, px, py - 1, 1, 1);
    }
    if (vc.spikes !== 0) {
      L.Fill(dark, px - 3, py, 1, 1);
      L.Fill(dark, px - 1, py - 1, 1, 1);
      L.Fill(dark, px + 1, py - 2, 1, 1);
    }
    L.Fill(mrrMix3(body, dark, 0.2), px - 5, py + 1, 1, 1);
  }
  if (scaled) L.Tag('restore');
}

// ---------------- 主对账：黄金 111 场景逐 op 逐位 ----------------
export function runRender4Transcript() {
  const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/render4.json'), 'utf8'));
  let n = 0, fail = 0;
  const fails = [];
  const FN = {
    drawChicken: mrrDrawChicken, drawPig: mrrDrawPig, drawRabbit: mrrDrawRabbit, drawFox: mrrDrawFox,
    drawFish: mrrDrawFish, drawCrab: mrrDrawCrab, drawTurtle: mrrDrawTurtle, drawShark: mrrDrawShark,
    drawBuilding: mrrDrawBuilding, drawItem: mrrDrawItem, drawFire: mrrDrawFire, drawTornado: mrrDrawTornado,
    drawEmergentCreature: mrrDrawEmergentCreature, drawEmergentMonster: mrrDrawEmergentMonster,
  };
  const h2f = (hex) => {
    const b = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
    return b.getFloat64(0, true);
  };
  const rebuildU = (d) => ({
    id: d.id, race: d.race, civ: d.civ,
    x: h2f(d.x), y: h2f(d.y),
    rx: d.rx == null ? null : h2f(d.rx), ry: d.ry == null ? null : h2f(d.ry),
    dpx: d.dpx == null ? null : h2f(d.dpx), dpy: d.dpy == null ? null : h2f(d.dpy),
    flip: d.flip, lx: d.lx == null ? null : h2f(d.lx), ly: d.ly == null ? null : h2f(d.ly),
    wep: d.wep ?? null, armS: d.arm ?? null, hlmS: d.hlm ?? null,
    atk: h2f(d.atk), cd: d.cd, traitName: d.trait ?? null,
    age: d.age, maxAge: d.maxAge, gen: d.gen,
    hurt: d.hurt, hp: h2f(d.hp), maxHp: h2f(d.maxHp),
    job: d.job, infected: d.infected, king: d.king,
  });
  const rebuildVc = (d) => ({
    body: d.body, dark: d.dark, light: d.light, accent: d.accent,
    size: h2f(d.size), bulk: h2f(d.bulk),
    horns: d.horns, spikes: d.spikes, mane: d.mane, tail: d.tail,
    ears: d.ears, glow: d.glow, pattern: d.pattern, crest: d.crest,
  });
  for (const s of golden.scens) {
    const L = new MrrList();
    const fn = FN[s.fn];
    if (!fn) throw new Error('unknown fn ' + s.fn);
    const inp = s.in;
    if (s.fn === 'drawBuilding') {
      fn(L, h2f(inp.b.x), h2f(inp.b.y), inp.b.kind, inp.color, inp.tier, h2f(inp.hpRatio));
    } else if (s.fn === 'drawItem') {
      fn(L, h2f(inp.x), h2f(inp.y), inp.kind, inp.id, inp.frame, inp.def ? inp.def.slot : null,
        inp.def ? inp.def.rarity : 0, inp.def && inp.def.art ? inp.def.art : null, inp.main ?? null);
    } else if (s.fn === 'drawFire') {
      fn(L, h2f(inp.x), h2f(inp.y), inp.i, inp.frame);
    } else if (s.fn === 'drawTornado') {
      fn(L, h2f(inp.x), h2f(inp.y), inp.frame);
    } else if (s.fn === 'drawEmergentCreature') {
      fn(L, rebuildU(inp.u), rebuildVc(inp.vc), inp.t);
    } else if (s.fn === 'drawEmergentMonster') {
      fn(L, rebuildU(inp.u), rebuildVc(inp.vc), inp.shape, inp.t);
    } else {
      fn(L, rebuildU(inp.u), inp.frame);
    }
    n++;
    const g = s.ops, m = L.ops;
    if (g.length !== m.length) { fail++; fails.push(`${s.name}: op count ${g.length} vs mirror ${m.length}`); continue; }
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
  const r = runRender4Transcript();
  console.log(`[RENDER4 TRANSCRIPT] ${r.n - r.fail}/${r.n} 逐位 ${r.fail === 0 ? 'ALL PASS' : 'FAIL'}`);
  for (const f of r.fails.slice(0, 15)) console.error('  [FAIL]', f);
  if (r.fail > 0) process.exit(1);
}
