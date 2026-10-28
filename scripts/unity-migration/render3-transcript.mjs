// render3-transcript.mjs — WbSprites.cs（M-U5b 20 族扩展）的 JS 独立镜像（防循环论证双链）
// 语义源 = WbSprites.cs 翻译稿（非 sprites.ts！）——黄金 = gen-render3.mjs 直录真实现（113 场景）。
// 覆盖：drawDragon/drawPenguin/drawCamel/drawScorpion/drawSnake/drawSkeleton/demon/angel/phoenix/
//       ent/lich/troll/ogre/whitewalker/vampire/kraken/sandworm/basilisk/hydra/mage（frame 驱动全 20 族）。
// 跑法：node scripts/unity-migration/render3-transcript.mjs（verify 段 13 由 verify-csharp-port.mjs 调用）
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
}

// 坐标基元（WbSprites.cs 语义）
const Px2 = (u) => (u.dpx != null ? u.dpx : (u.rx != null ? u.rx : u.x) * 2);
const Py2 = (u) => (u.dpy != null ? u.dpy : (u.ry != null ? u.ry : u.y) * 2);
const IsMoving = (u) => u.lx != null && (u.lx !== u.x || u.ly == null || u.ly !== u.y);
// C# (int)Math.Floor(frame / (double)N) % 2 等
const fl = (a, b) => Math.floor(a / b);
const halfUp = (v) => Math.floor(v + 0.5); // C# Math.Floor(v+0.5)（含负数 = JS Math.round）

export function mrrDrawDragon(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  L.Fill('rgba(0,0,0,0.28)', px - 2, py + 2, 5, 1);
  const up = fl(frame, 6) % 2 === 0 ? 1 : 0;
  L.Fill('#1f1d24', px - 2, py - (up !== 0 ? 2 : 1), 2, 1);
  L.Fill('#1f1d24', px + 1, py - (up !== 0 ? 2 : 1), 2, 1);
  L.Fill(u.hurt > 0 ? '#ff6b5e' : '#8c2317', px - 1, py, 3, 1);
  L.Fill('#cf3f2e', px + 2 * f, py - 1, 1, 1);
  L.Fill('#ffd93d', px + 2 * f, py - 1, 1, 1);
  L.Fill('#8c2317', px - 2 * f, py, 1, 1);
}
export function mrrDrawPenguin(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const bob = fl(frame, 6) % 2 === 0 ? 0 : 1;
  const y = py - bob;
  L.Fill(u.hurt > 0 ? '#ff6b5e' : '#1f1d24', px - 1, y - 1, 2, 2);
  L.Fill('#f2ead8', px - 1, y, 2, 1);
  L.Fill('#ff9b2d', px + (u.flip !== 0 ? -1 : 1), y - 1, 1, 1);
  L.Fill('#ff9b2d', px - 1, y + 1, 1, 1);
  L.Fill('#ff9b2d', px, y + 1, 1, 1);
}
export function mrrDrawCamel(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const bob = fl(frame, 8) % 2 === 0 ? 0 : 1;
  const y = py - bob;
  const body = u.hurt > 0 ? '#ff6b5e' : '#e3cf96';
  const shade = u.hurt > 0 ? '#ff6b5e' : '#c4ad74';
  L.Fill(shade, px - 1, y - 1, 1, 1);
  L.Fill(shade, px + 1, y - 1, 1, 1);
  L.Fill(body, px - 1, y, 3, 1);
  L.Fill(body, px + 2 * f, y - 1, 1, 1);
  L.Fill(shade, px + 2 * f, y - 2, 1, 1);
  L.Fill(shade, px - 1, y + 1, 1, 1);
  L.Fill(shade, px + 1, y + 1, 1, 1);
}
export function mrrDrawScorpion(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const bob = fl(frame, 4) % 2 === 0 ? 0 : 1;
  const y = py - bob;
  const dark = u.hurt > 0 ? '#ff6b5e' : '#1f1d24';
  const mid = u.hurt > 0 ? '#ff6b5e' : '#3a342c';
  L.Fill(mid, px - 2 * f, y - 2, 1, 1);
  L.Fill(mid, px - 1 * f, y - 1, 1, 1);
  L.Fill('#cf3f2e', px - 3 * f, y - 3, 1, 1);
  L.Fill(dark, px + 1 * f, y, 1, 1);
  L.Fill(mid, px + 2 * f, y - 1, 1, 1);
  L.Fill(mid, px + 2 * f, y + 1, 1, 1);
  L.Fill(dark, px - 1, y, 2, 1);
  L.Fill(mid, px - 1, y + 1, 1, 1);
  L.Fill(mid, px, y + 1, 1, 1);
}
export function mrrDrawSnake(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const ph = fl(frame, 5) % 4;
  const body = u.hurt > 0 ? '#ff6b5e' : '#4a8f3c';
  const dark = u.hurt > 0 ? '#ff6b5e' : '#2f5e26';
  const wave = [0, 1, 0, -1];
  for (let seg = 0; seg < 4; seg++) {
    const sx = px + (seg - 3) * f;
    const wy = (ph + seg) % 4;
    L.Fill(seg % 2 === 0 ? body : dark, sx, py + wave[wy], 1, 1);
  }
  L.Fill(dark, px + 1 * f, py, 1, 1);
  if (frame % 9 < 3) L.Fill('#cf3f2e', px + 2 * f, py, 1, 1);
  L.Fill('#f2ead8', px + 1 * f, py - 1, 1, 1);
}
export function mrrDrawSkeleton(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const y = py - bob;
  const bone = u.hurt > 0 ? '#ff6b5e' : '#e8e4da';
  const dark = '#3a342c';
  L.Fill('rgba(0,0,0,0.28)', px - 1, y + 3, 3, 1);
  if (isMoving && step === 1) { L.Fill(bone, px - 1, y + 1, 1, 2); L.Fill(bone, px, y + 2, 1, 1); }
  else if (isMoving) { L.Fill(bone, px - 1, y + 2, 1, 1); L.Fill(bone, px, y + 1, 1, 2); }
  else { L.Fill(bone, px - 1, y + 1, 1, 2); L.Fill(bone, px, y + 1, 1, 2); }
  L.Fill(bone, px - 1, y - 1, 2, 1);
  L.Fill(dark, px - 1, y, 1, 1);
  L.Fill(bone, px, y, 1, 1);
  if (u.atk > 0) {
    L.Fill(bone, px + 2 * f, y - 3, 1, 2);
    L.Fill(bone, px - 2 * f + (f > 0 ? 1 : 0), y - 1, 1, 2);
  } else if (isMoving && step === 1) { L.Fill(bone, px - 2, y - 1, 1, 1); L.Fill(bone, px + 1, y, 1, 2); }
  else if (isMoving) { L.Fill(bone, px - 2, y, 1, 2); L.Fill(bone, px + 1, y - 1, 1, 1); }
  else { L.Fill(bone, px - 2, y - 1, 1, 2); L.Fill(bone, px + 1, y - 1, 1, 2); }
  L.Fill(bone, px - 1, y - 3, 2, 2);
  L.Fill(dark, px - 1, y - 2, 2, 1);
  L.Fill(frame % 14 < 7 ? '#cf3f2e' : '#8c2317', px + (f > 0 ? 0 : -1), y - 2, 1, 1);
  const wep = u.wep;
  if (wep != null) {
    const wc = wep === 'sword3' ? '#ffd93d' : wep === 'sword2' ? '#e8e8e8' : bone;
    if (u.atk > 0) { L.Fill(wc, px + 3 * f, y - 3, 1, 2); L.Fill('#ffffff', px + 4 * f, y - 2, 1, 1); }
    else L.Fill(wc, px + 2 * f, y - 2, 1, 2);
  }
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 1, y - 5, 4, 1);
}
export function mrrDrawDemon(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const swell = fl(frame, 10) % 2;
  const flap = fl(frame, 6) % 2;
  const body = u.hurt > 0 ? '#ff6b5e' : '#a82a1e';
  const dark = '#5c120c';
  L.Fill('rgba(0,0,0,0.3)', px - 3, py + 2, 7, 1);
  L.Fill('#1f1d24', px - 4, py - 1 - flap, 1, 3);
  L.Fill('#1f1d24', px - 3, py - 2 - flap, 1, 2);
  L.Fill('#1f1d24', px + 3, py - 1 - flap, 1, 3);
  L.Fill('#1f1d24', px + 2, py - 2 - flap, 1, 2);
  L.Fill('#1f1d24', px - 1, py - 3 - swell, 1, 1);
  L.Fill('#1f1d24', px + 2, py - 3 - swell, 1, 1);
  L.Fill(body, px, py - 2 - swell, 3, 2);
  L.Fill(frame % 8 < 4 ? '#ffd93d' : '#ffb347', px + (u.flip !== 0 ? 0 : 2), py - 2 - swell, 1, 1);
  L.Fill(body, px - 1, py - swell, 4, 2);
  L.Fill(dark, px - 1, py + 1 - swell, 4, 1);
  const tailUp = ((frame >> 3) & 1) === 1;
  L.Fill(dark, px - 2 * f, py - 1 - swell, 1, 1);
  L.Fill(dark, px - 3 * f, tailUp ? py - 2 - swell : py - swell, 1, 1);
  L.Fill('#1f1d24', px, py + 2 - swell, 1, 1);
  L.Fill('#1f1d24', px + 2, py + 2 - swell, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 2, py - 5, 6, 1);
}
export function mrrDrawAngel(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const bob = fl(frame, 8) % 2;
  const py2 = py - 2 - bob;
  const flap = fl(frame, 7) % 2;
  const robe = u.hurt > 0 ? '#ffb9ad' : '#f7f9fb';
  const shade = '#cfd4e0';
  L.Fill(frame % 12 < 6 ? '#ffd93d' : '#ffe98a', px - 1, py2 - 4, 3, 1);
  L.Fill(flap !== 0 ? '#ffffff' : '#e8ecf5', px - 3, py2 - 1 - flap, 1, 2);
  L.Fill(flap !== 0 ? '#ffffff' : '#e8ecf5', px - 4, py2 - flap, 1, 1);
  L.Fill(flap !== 0 ? '#ffffff' : '#e8ecf5', px + 2, py2 - 1 - flap, 1, 2);
  L.Fill(flap !== 0 ? '#ffffff' : '#e8ecf5', px + 3, py2 - flap, 1, 1);
  L.Fill('#f2ead8', px, py2 - 2, 2, 2);
  L.Fill('#c98d5a', px + (u.flip !== 0 ? 0 : 1), py2 - 1, 1, 1);
  L.Fill(robe, px - 1, py2, 3, 2);
  L.Fill(shade, px - 1 + (bob !== 0 ? 0 : 1), py2 + 2, 2, 1);
  L.Fill('#cdd6e0', px + 2 * f, py2 + 1, 1, 2);
  if (frame % 20 < 3) L.Fill('#fff7c2', px + 2 * f, py2, 1, 1);
  L.Fill('#ffd93d', px - 1, py2 + 1, 3, 1);
  L.Fill('#ffe98a', px, py2 + 3, 1, 1);
  L.Fill('#ffe98a', px + 1, py2 + 3, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#ffd93d', px - 2, py2 - 5, 5, 1);
}
export function mrrDrawPhoenix(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const bob = fl(frame, 8) % 2;
  const py2 = py - 2 - bob;
  const flap = fl(frame, 5) % 2;
  const dim = u.hp < u.maxHp * 0.4;
  const hot = u.hurt > 0 ? '#ff6b5e' : '#ff9b2d';
  const core = u.hurt > 0 ? '#ffd0b0' : '#ffd93d';
  const wing = dim ? '#c96a15' : (flap !== 0 ? '#ff9b2d' : '#cf3f2e');
  L.Fill(wing, px - 3, py2 - 1 - flap, 1, 2);
  L.Fill(wing, px - 4, py2 - flap, 1, 2);
  L.Fill(wing, px + 2, py2 - 1 - flap, 1, 2);
  L.Fill(wing, px + 3, py2 - flap, 1, 2);
  L.Fill(dim ? '#8c2317' : '#ffd93d', px - 3, py2 - flap, 1, 1);
  L.Fill(dim ? '#8c2317' : '#ffd93d', px + 2, py2 - flap, 1, 1);
  L.Fill(hot, px, py2 - 4, 1, 1);
  L.Fill(hot, px + 1, py2 - 3, 1, 1);
  if (frame % 10 < 6) L.Fill(core, px, py2 - 5, 1, 1);
  L.Fill(core, px, py2 - 2, 2, 2);
  L.Fill('#8c2317', px + (u.flip !== 0 ? 0 : 1), py2 - 1, 1, 1);
  L.Fill(hot, px - 1, py2, 3, 2);
  L.Fill('#cf3f2e', px - 1 + (bob !== 0 ? 0 : 1), py2 + 2, 2, 1);
  L.Fill(frame % 14 < 7 ? '#fff3c4' : '#ffd93d', px, py2 + 1, 1, 1);
  const dimTail = dim ? '#c96a15' : '#ff9b2d';
  for (let k = 0; k < 3; k++) {
    const ty = py2 - 1 + k;
    const sway = ((frame + k * 4) % 12) < 6 ? 0 : 1;
    L.Fill(dimTail, px - 2 * f - sway, ty, 1, 1);
    if (isMoving) L.Fill(dimTail, px - 3 * f - sway, ty, 1, 1);
  }
  for (let k = 0; k < 3; k++) {
    const ph = (frame * 0.6 + k * 2.1) % 6.283;
    const ex = px + halfUp(Math.cos(ph) * (3 + (k & 1)));
    const ey = py2 + halfUp(Math.sin(ph) * 2) - 1;
    if ((frame + k * 7) % 3 !== 0) L.Fill('#ffd93d', ex, ey, 1, 1);
  }
  if (dim && frame % 16 < 4) L.Fill('#575757', px + 1, py2 - 6, 1, 1);
}
export function mrrDrawEnt(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const step = isMoving ? ((frame >> 4) & 1) : 0;
  const dim = u.hp < u.maxHp * 0.4;
  const hurtFlash = u.hurt > 0;
  const bark = hurtFlash ? '#ff9b8a' : '#6e4a2b';
  const barkD = hurtFlash ? '#d97a66' : '#4a3018';
  const leaf = dim ? '#3d6b2c' : '#4f9e3a';
  const leafD = dim ? '#2c5e24' : '#2c7a2a';
  const sway = fl(frame, 12) % 2;
  L.Fill(leafD, px - 2 + sway, py - 5, 5, 1);
  L.Fill(leafD, px + 1 + sway, py - 5, 1, 1);
  L.Fill(leaf, px - 3 + sway, py - 4, 7, 2);
  L.Fill(leaf, px - 1 - sway, py - 6, 3, 1);
  L.Fill(leafD, px - 2 + sway, py - 2, 5, 1);
  if (dim && frame % 24 < 6) L.Fill('#c9a02a', px - 3 + ((frame >> 2) & 3), py - 1, 1, 1);
  L.Fill('#2a1c0e', px - 1, py - 1, 3, 2);
  const blink = frame % 40 < 5;
  L.Fill(blink ? '#6e4a2b' : '#ffb938', px - 1 + (u.flip !== 0 ? 0 : 1), py - 1, 1, 1);
  L.Fill(blink ? '#6e4a2b' : '#ffb938', px + (u.flip !== 0 ? 1 : 0), py, 1, 1);
  L.Fill(bark, px - 2, py + 1, 5, 5);
  L.Fill(barkD, px - 1, py + 2, 1, 3);
  L.Fill(barkD, px + 1, py + 3, 1, 2);
  L.Fill('#5a7a2c', px - 2, py + 1, 2, 1);
  L.Fill('#5a7a2c', px + 2, py + 2, 1, 1);
  const armSw = isMoving ? (step !== 0 ? 1 : -1) : 0;
  L.Fill(bark, px - 4, py + 1 + armSw, 2, 1);
  L.Fill(bark, px - 5, py + 2 + armSw, 1, 1);
  L.Fill(bark, px + 3, py + 2 - armSw, 2, 1);
  L.Fill(bark, px + 5, py + 1 - armSw, 1, 1);
  if (step === 1) { L.Fill(barkD, px - 2, py + 6, 2, 1); L.Fill(barkD, px + 1, py + 6, 1, 1); }
  else { L.Fill(barkD, px - 2, py + 6, 1, 1); L.Fill(barkD, px, py + 6, 2, 1); }
  L.Fill(barkD, px - 2 + step, py + 7, 1, 1);
  L.Fill(barkD, px + 1 - step, py + 7, 1, 1);
  L.Fill('rgba(201,160,42,0.55)', px - 3, py + 8, 1, 1);
  L.Fill('rgba(201,160,42,0.55)', px + 2, py + 8, 1, 1);
  L.Fill('rgba(201,160,42,0.55)', px, py + 8, 1, 1);
}
export function mrrDrawLich(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const dim = u.hp < u.maxHp * 0.4;
  const hurtFlash = u.hurt > 0;
  const bob = (frame % 14) < 7 ? 0 : 1;
  const fade = dim && (frame % 22) < 4 ? 1 : 0;
  const y = py - 1 - bob + fade;
  const robe = hurtFlash ? '#c98a9e' : (dim ? '#2c2834' : '#37333b');
  const robeD = hurtFlash ? '#8d5570' : '#1f1d24';
  const bone = '#f2ead8';
  L.Fill(robe, px - 2, y, 5, 1);
  L.Fill(robe, px - 3, y + 1, 7, 2);
  L.Fill(robe, px - 2, y + 3, 5, 3);
  L.Fill(robeD, px - 3, y + 2, 1, 4);
  L.Fill(robeD, px + 2, y + 2, 1, 4);
  L.Fill(robeD, px - 2, y + 6, 1, 1);
  L.Fill(robeD, px, y + 6, 1, 1);
  L.Fill(robeD, px + 2, y + 6, 1, 1);
  if (isMoving && frame % 8 < 3) L.Fill('rgba(55,51,59,0.6)', px - f * 3, y + 6, 1, 1);
  L.Fill('#3a342c', px - 2, y - 1, 1, 1);
  L.Fill('#3a342c', px, y - 1, 1, 1);
  L.Fill('#3a342c', px + 2, y - 1, 1, 1);
  L.Fill('#3a342c', px - 2, y - 2, 5, 1);
  L.Fill('#b56cf0', px, y - 2, 1, 1);
  L.Fill(bone, px - 1, y + 1, 3, 2);
  L.Fill('#14100c', px - 1, y + 2, 3, 1);
  const glow = dim ? (frame % 16 < 10) : (frame % 8 < 6);
  L.Fill(glow ? '#64c95d' : '#2c5e24', px - 1, y + 1, 1, 1);
  L.Fill(glow ? '#64c95d' : '#2c5e24', px + 1, y + 1, 1, 1);
  L.Fill(frame % 12 < 6 ? '#b56cf0' : '#8a4bd0', px, y + 4, 1, 1);
  const armSw = isMoving ? (((frame >> 3) & 1) !== 0 ? 1 : -1) : 0;
  L.Fill(bone, px - 4, y + 3 + armSw, 1, 1);
  L.Fill(bone, px + 4, y + 3 - armSw, 1, 1);
  const orbT = frame * 0.11;
  for (let k = 0; k < 2; k++) {
    const ox = halfUp(Math.cos(orbT + k * Math.PI) * 4);
    const oy = halfUp(Math.sin(orbT + k * Math.PI) * 2);
    L.Fill(k === 0 ? '#64c95d' : '#3f8f4a', px + ox, y + 2 + oy, 1, 1);
  }
  L.Fill('rgba(138,75,208,0.35)', px - 3, py + 8, 1, 1);
  L.Fill('rgba(138,75,208,0.35)', px + 3, py + 8, 1, 1);
  L.Fill('rgba(138,75,208,0.35)', px, py + 8, 1, 1);
  if (dim && frame % 20 < 5) L.Fill('rgba(100,201,93,0.5)', px - 1 - ((frame >> 2) & 3), py + 8, 1, 1);
}
export function mrrDrawTroll(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const breath = !isMoving && ((frame >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  const body = u.hurt > 0 ? '#ff6b5e' : '#4a7c3a';
  const dark = '#2c5e24';
  const moss = '#6b8f4e';
  L.Fill('rgba(0,0,0,0.32)', px - 3, y + 3, 7, 1);
  if (isMoving && step === 1) { L.Fill(dark, px - 2, y + 2, 1, 2); L.Fill(dark, px + 1, y + 2, 1, 1); }
  else if (isMoving) { L.Fill(dark, px - 2, y + 2, 1, 1); L.Fill(dark, px + 1, y + 2, 1, 2); }
  else { L.Fill(dark, px - 2, y + 2, 1, 2); L.Fill(dark, px + 1, y + 2, 1, 2); }
  if (u.atk > 0) {
    L.Fill(body, px - 4, y - 5, 1, 4);
    L.Fill(body, px + 3, y - 5, 1, 4);
    L.Fill('#ffffff', px + 4 * f, y - 4, 1, 1);
  } else if (isMoving && step === 1) { L.Fill(body, px - 4, y - 1, 1, 4); L.Fill(body, px + 3, y, 1, 3); }
  else if (isMoving) { L.Fill(body, px - 4, y, 1, 3); L.Fill(body, px + 3, y - 1, 1, 4); }
  else { L.Fill(body, px - 4, y - 1, 1, 4); L.Fill(body, px + 3, y - 1, 1, 4); }
  L.Fill(body, px - 2, y - 3, 5, 4);
  L.Fill(dark, px - 2, y, 5, 1);
  const mc = frame % 20 < 10 ? moss : '#7fa93c';
  L.Fill(mc, px - 2, y - 3, 1, 1);
  L.Fill(mc, px + 2, y - 3, 1, 1);
  L.Fill(mc, px + 1, y - 2, 1, 1);
  L.Fill(body, px + (f > 0 ? 0 : -2), y - 5, 3, 2);
  L.Fill('#ffd93d', px + (f > 0 ? 1 : -2), y - 4, 1, 1);
  L.Fill('#f2ead8', px + (f > 0 ? 0 : -1), y - 3, 1, 1);
  L.Fill('#f2ead8', px + (f > 0 ? 2 : -3), y - 3, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 2, y - 7, 6, 1);
}
export function mrrDrawOgre(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const breath = !isMoving && ((frame >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  const skin = u.hurt > 0 ? '#ff6b5e' : '#c98d5a';
  const dark = '#6e4a2b';
  const belly = '#e3b98a';
  L.Fill('rgba(0,0,0,0.32)', px - 3, y + 3, 7, 1);
  if (isMoving && step === 1) { L.Fill(dark, px - 2, y + 2, 1, 2); L.Fill(dark, px + 1, y + 2, 1, 1); }
  else if (isMoving) { L.Fill(dark, px - 2, y + 2, 1, 1); L.Fill(dark, px + 1, y + 2, 1, 2); }
  else { L.Fill(dark, px - 2, y + 2, 1, 2); L.Fill(dark, px + 1, y + 2, 1, 2); }
  L.Fill(skin, px - 2, y - 3, 5, 4);
  L.Fill(belly, px - 1, y - 1, 3, 2);
  L.Fill('#3a342c', px - 2, y + 1, 5, 1);
  L.Fill(skin, px - 3, y - 2, 1, 3);
  L.Fill(skin, px + 2, y - 2, 1, 3);
  if (u.atk > 0) {
    L.Fill('#8a6a4a', px + 3 * f, y - 6, 1, 4);
    L.Fill('#8a6a4a', px + 2 * f, y - 6, 1, 1);
    L.Fill('#f2ead8', px + 3 * f, y - 6, 1, 1);
  } else L.Fill('#8a6a4a', px + 3 * f, y - 3, 1, 4);
  L.Fill(skin, px - 1, y - 5, 3, 2);
  L.Fill(dark, px - 1, y - 4, 1, 1);
  L.Fill(dark, px + 1, y - 4, 1, 1);
  L.Fill('#ffd93d', px, y - 3, 1, 1);
  L.Fill('#f2ead8', px - 2, y - 4, 1, 1);
  L.Fill('#f2ead8', px + 2, y - 4, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 2, y - 7, 6, 1);
}
export function mrrDrawWhiteWalker(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const y = py - bob;
  const ice = u.hurt > 0 ? '#ff6b5e' : '#bfe3f2';
  const robe = '#2b6fae';
  const dark = '#1d4e89';
  L.Fill('rgba(0,0,0,0.25)', px - 2, y + 3, 5, 1);
  if (isMoving && step === 1) { L.Fill(robe, px - 1, y + 1, 1, 2); L.Fill(robe, px, y + 1, 1, 1); }
  else if (isMoving) { L.Fill(robe, px - 1, y + 1, 1, 1); L.Fill(robe, px, y + 1, 1, 2); }
  else { L.Fill(robe, px - 1, y + 1, 1, 2); L.Fill(robe, px, y + 1, 1, 2); }
  L.Fill(robe, px - 1, y - 2, 3, 3);
  L.Fill(dark, px - 1, y, 1, 1);
  L.Fill(dark, px + 1, y, 1, 1);
  if (u.atk > 0) {
    L.Fill(robe, px + 2 * f, y - 3, 2, 1);
    L.Fill('#f7f9fb', px + 3 * f, y - 4, 1, 1);
    L.Fill('#f7f9fb', px + 4 * f, y - 3, 1, 1);
  } else if (isMoving && step === 1) { L.Fill(robe, px - 2, y - 2, 1, 1); L.Fill(robe, px + 2, y - 1, 1, 2); }
  else if (isMoving) { L.Fill(robe, px - 2, y - 1, 1, 2); L.Fill(robe, px + 2, y - 2, 1, 1); }
  else { L.Fill(robe, px - 2, y - 2, 1, 2); L.Fill(robe, px + 2, y - 2, 1, 2); }
  L.Fill(ice, px - 1, y - 4, 3, 2);
  const ec = frame % 10 < 5 ? '#4d9fd6' : '#9ad4e8';
  L.Fill(ec, px + (f > 0 ? 0 : -2), y - 3, 1, 1);
  L.Fill(ec, px + (f > 0 ? 1 : -1), y - 3, 1, 1);
  L.Fill('#f7f9fb', px - 1, y - 6, 1, 2);
  L.Fill('#f7f9fb', px, y - 7, 1, 3);
  L.Fill('#f7f9fb', px + 1, y - 6, 1, 2);
  for (let k = 0; k < 3; k++) {
    const h = (u.id * 97 + k * 131 + frame * 7) % 16; // JS (expr>>>0)%16 域内恒正
    L.Fill('rgba(247,249,251,0.7)', px - 3 + (h % 7), y - 7 + ((h >> 2) % 9), 1, 1);
  }
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 2, y - 8, 6, 1);
}
export function mrrDrawVampire(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const hover = ((frame >> 3) & 1) === 1 ? 1 : 0;
  const y = py - 1 - hover;
  const cape = u.hurt > 0 ? '#ff6b5e' : '#37333b';
  const face = '#e8e0d8';
  const inner = '#8c2317';
  L.Fill('rgba(0,0,0,0.22)', px - 1, py + 3, 3, 1);
  L.Fill(cape, px - 2, y - 1, 5, 3);
  const flutter = ((frame >> 2) & 1) === 1;
  L.Fill(cape, px - 3, flutter ? y : y + 1, 1, 2);
  L.Fill(cape, px + 2, flutter ? y + 1 : y, 1, 2);
  L.Fill(inner, px - 1, y - 1, 1, 1);
  L.Fill(cape, px - 2, y - 4, 1, 2);
  L.Fill(cape, px + 2, y - 4, 1, 2);
  L.Fill(face, px - 1, y - 4, 3, 2);
  L.Fill(frame % 12 < 6 ? '#cf3f2e' : '#8c2317', px + (f > 0 ? 0 : -2), y - 4, 1, 1);
  if (u.atk > 0) {
    L.Fill('#ffffff', px + (f > 0 ? 0 : -1), y - 3, 1, 1);
    L.Fill('#ffffff', px + (f > 0 ? 1 : -2), y - 3, 1, 1);
    L.Fill('rgba(207,63,46,0.6)', px + 3 * f, y - 3, 1, 2);
  }
  L.Fill('#14100c', px - 1, y - 5, 3, 1);
  L.Fill('#14100c', px, y - 4, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 2, y - 7, 6, 1);
}
export function mrrDrawKraken(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const bob = isMoving ? ((frame >> 2) & 1) : 0;
  const breath = !isMoving && ((frame >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  const body = u.hurt > 0 ? '#ff6b5e' : '#7a2f9e';
  const dark = '#4a1a63';
  const light = '#a86cc9';
  const ripple = ((frame >> 3) % 3);
  if (ripple === 0) L.Fill('rgba(220,240,255,0.4)', px - 3, y + 3, 7, 1);
  else if (ripple === 1) { L.Fill('rgba(220,240,255,0.4)', px - 4, y + 3, 3, 1); L.Fill('rgba(220,240,255,0.4)', px + 2, y + 3, 3, 1); }
  else { L.Fill('rgba(220,240,255,0.4)', px - 5, y + 3, 2, 1); L.Fill('rgba(220,240,255,0.4)', px + 4, y + 3, 2, 1); }
  const atk = u.atk > 0;
  for (let k = 0; k < 6; k++) {
    const phase = ((frame >> 2) + k) & 3;
    const bx = px - 5 + k * 2;
    const tc = k % 2 === 0 ? body : dark;
    if (atk && (k === 1 || k === 4)) {
      L.Fill(tc, bx + (f > 0 ? 1 : -1), y + 2, 1, 2);
      L.Fill(tc, bx + (f > 0 ? 3 : -3), y, 1, 2);
      L.Fill('#ffffff', bx + (f > 0 ? 4 : -4), y - 1, 1, 1);
    } else {
      L.Fill(tc, bx, y + 2, 1, 2);
      const lift = phase === 0 ? 0 : phase === 1 ? 1 : phase === 2 ? 2 : 1;
      L.Fill(tc, bx, y + 3 - lift, 1, 1);
    }
  }
  L.Fill(body, px - 3, y - 3, 6, 5);
  L.Fill(light, px - 3, y - 3, 6, 1);
  L.Fill(dark, px - 2, y + 1, 2, 1);
  L.Fill(dark, px + 1, y, 1, 1);
  const blink = frame % 47 < 2;
  L.Fill('#f2ead8', px - 2, y - 2, 3, 2);
  if (!blink) {
    L.Fill('#14100c', px - 1 + (f > 0 ? 1 : 0), y - 2, 1, 1);
    L.Fill('#ffd93d', px - 1 + (f > 0 ? 1 : 0), y - 2, 1, 1);
  }
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 3, y - 5, 7, 1);
}
export function mrrDrawSandworm(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const seg = (frame >> 2) & 3;
  const hide = ((frame >> 3) & 1) === 1 ? 1 : 0;
  const y = py - 2 - hide;
  const body = u.hurt > 0 ? '#ff6b5e' : '#c4ad74';
  const dark = '#8c7345';
  const ridge = '#a88a55';
  L.Fill('rgba(196,173,116,0.45)', px - 5, y + 4, 11, 1);
  if (isMoving && (frame & 7) < 4) {
    L.Fill('rgba(222,203,141,0.55)', px - 6 * f, y + 3, 2, 1);
    L.Fill('rgba(222,203,141,0.55)', px - 8 * f, y + 2, 1, 1);
  }
  for (let k = 0; k < 5; k++) {
    const wave = ((seg + k) & 3) < 2 ? 0 : 1;
    const bx = px - f * (k + 1) * 2 - (f > 0 ? -1 : 1);
    const bc = k === 4 ? dark : body;
    const h = 4 - (k > 2 ? 1 : 0);
    L.Fill(bc, bx, y + 1 + wave, 2, h);
    if (k < 4) L.Fill(ridge, bx, y + 1 + wave, 1, 1);
  }
  const atk = u.atk > 0;
  L.Fill(body, px - 1 + f, y, 3, 5);
  L.Fill('#dcc28a', px - 1 + f, y, 3, 1);
  if (atk) {
    L.Fill('#14100c', px + (f > 0 ? 1 : -1), y + 1, 2, 3);
    L.Fill('#f2ead8', px + (f > 0 ? 1 : -1), y + 1, 1, 1);
    L.Fill('#f2ead8', px + (f > 0 ? 2 : -1), y + 2, 1, 1);
    L.Fill('#f2ead8', px + (f > 0 ? 1 : -1), y + 3, 1, 1);
  } else {
    L.Fill(dark, px + (f > 0 ? 1 : 0), y + 2, 2, 1);
    L.Fill(ridge, px + (f > 0 ? 2 : -1), y - 1, 1, 1);
  }
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 3, y - 2, 7, 1);
}
export function mrrDrawBasilisk(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const und = (frame >> 2) & 3;
  const atk = u.atk > 0;
  const rise = atk ? 2 : isMoving ? ((frame >> 3) & 1) : 0;
  const y = py - 1 - rise;
  const body = u.hurt > 0 ? '#ff6b5e' : '#5a7a2c';
  const dark = '#3a5218';
  const belly = '#9ad06a';
  L.Fill('rgba(0,0,0,0.28)', px - 4, py + 3, 8, 1);
  for (let k = 0; k < 4; k++) {
    const wave = ((und + k) & 1) === 0 ? 0 : 1;
    const bx = px - f * (k + 1) * 2 - (f > 0 ? -1 : 1);
    L.Fill(k % 2 === 0 ? body : dark, bx, y + 2 + wave, 2, 2);
    if (k === 1) L.Fill(belly, bx, y + 3 + wave, 2, 1);
  }
  const tw = ((und >> 1) & 1) === 0 ? 0 : 1;
  L.Fill(dark, px - f * 9, y + 2 + tw, 1, 1);
  L.Fill(dark, px - f * 10, y + 3 - tw, 1, 1);
  L.Fill(body, px + (atk ? f : 0), y + 1, 2, 3);
  L.Fill(dark, px + (atk ? f : 0), y + 2, 1, 2);
  const hx = px + (atk ? f * 2 : f);
  L.Fill(body, hx, y - 2, 3, 2);
  L.Fill(belly, hx + (f > 0 ? 1 : 0), y - 1, 2, 1);
  L.Fill(frame % 24 < 12 ? '#ffd93d' : '#ffb020', hx + (f > 0 ? 1 : 0), y - 2, 1, 1);
  L.Fill('#14100c', hx + (f > 0 ? 1 : 0), y - 2, 1, 1);
  const cc = atk ? '#ff6b5e' : '#cf3f2e';
  L.Fill(cc, hx - f, y - 3, 1, 1);
  L.Fill(cc, hx - f * 2, y - 4, 1, 1);
  L.Fill(cc, hx - f * 3, y - 3, 1, 1);
  if (frame % 18 < 6 || atk) {
    L.Fill('#d556c0', hx + (f > 0 ? 3 : -2), y - 1, 1, 1);
    if (atk) { L.Fill('#d556c0', hx + (f > 0 ? 4 : -3), y - 1, 1, 1); L.Fill('#d556c0', hx + (f > 0 ? 4 : -3), y - 2, 1, 1); }
  }
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', hx - 1, y - 5, 5, 1);
}
export function mrrDrawHydra(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const gen = u.gen ?? 0;   // M-U7a：蓝本 u.gen ?? 0（C# WbU.gen int 默认 0 同构——render5 场景 dump 无 gen 字段时走缺省）
  const GEN_TABLE = [3, 2, 1];
  const heads = gen >= 0 && gen < 3 ? GEN_TABLE[gen] : 1;
  const bodyH = heads;
  const low = u.hp < u.maxHp * 0.35;
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const y = py - (isMoving ? step : 0);
  const body = u.hurt > 0 ? '#ff6b5e' : low ? '#2c5223' : '#3f7a2e';
  const dark = low ? '#1c3a17' : '#25501d';
  const scale = low ? '#3a6e2c' : '#4f9e3a';
  const belly = low ? '#6b8544' : '#8fae55';
  const ripple = (frame >> 3) % 3;
  if (ripple === 0) L.Fill('rgba(90,110,60,0.4)', px - 4, y + bodyH + 1, 9, 1);
  else if (ripple === 1) { L.Fill('rgba(90,110,60,0.4)', px - 5, y + bodyH + 1, 3, 1); L.Fill('rgba(90,110,60,0.4)', px + 3, y + bodyH + 1, 3, 1); }
  else { L.Fill('rgba(90,110,60,0.4)', px - 6, y + bodyH + 1, 2, 1); L.Fill('rgba(90,110,60,0.4)', px + 5, y + bodyH + 1, 2, 1); }
  if (frame % 40 < 3) L.Fill('#9fd42e', px - 2 + ((frame >> 2) % 5), y + bodyH + 1 - (frame % 40), 1, 1);
  L.Fill(body, px - 4, y - bodyH, 9, bodyH * 2 + 1);
  L.Fill(belly, px - 4, y + bodyH, 9, 1);
  for (let k = 0; k < 4; k++) {
    if ((k + gen) % 2 === 0) L.Fill(scale, px - 3 + k * 2, y - bodyH + 1, 1, 1);
  }
  L.Fill(dark, px - 4, y - bodyH, 9, 1);
  for (let k = 0; k < 4; k++) {
    const wx = px - 3 + k * 2;
    if (isMoving ? (k + step) % 2 === 0 : k % 2 === 0) L.Fill(dark, wx, y - bodyH - 1, 1, 1);
  }
  const droop = low ? 1 : 0;
  const necks = heads >= 3 ? [[-3, 0], [0, 2], [3, 4]] : heads === 2 ? [[-2, 1], [2, 3]] : [[0, 2]];
  for (const [nx, swayBase] of necks) {
    const sway = ((frame >> 2) + swayBase) & 3;
    const lift = sway === 0 ? 0 : sway === 1 ? 1 : sway === 2 ? 2 : 1;
    const cx = px + nx;
    L.Fill(dark, cx - 1, y - bodyH - 1, 2, 1);
    L.Fill(body, cx - 1 + (lift > 1 ? f : 0), y - bodyH - 2, 2, 1);
    L.Fill(body, cx - 1 + (lift > 1 ? f * 2 : lift > 0 ? f : 0), y - bodyH - 3 + droop, 2, 1);
    const hx = cx + (lift > 1 ? f * 2 : lift > 0 ? f : 0);
    const hy = y - bodyH - 4 + droop;
    L.Fill(body, hx - 1, hy, 3, 2);
    L.Fill(scale, hx - 1, hy, 1, 1);
    const blink = frame % 23 < 2;
    if (!blink) L.Fill(low ? '#8c2317' : '#ff4030', hx + (f > 0 ? 1 : 0), hy, 1, 1);
    if (!low && frame % 16 < 5) L.Fill('#d556c0', hx + (f > 0 ? 2 : -1), hy + 1, 1, 1);
  }
  if (low) {
    L.Fill('#cf3f2e', px - 3, y - bodyH - 6, 7, 1);
    L.Fill('rgba(120,140,80,0.25)', px - 5, y + bodyH, 11, 1);
  }
}
export function mrrDrawMage(L, u, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const step = isMoving ? ((frame >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const breath = !isMoving && ((frame >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  const robe = u.hurt > 0 ? '#ff6b5e' : u.cd > 18 ? '#c98af5' : '#8a4fd0';
  const dark = '#4c2a78';
  L.Fill('rgba(0,0,0,0.28)', px - 1, y + 3, 4, 1);
  L.Fill(robe, px + (isMoving && step === 1 ? f : 0), y - 4, 1, 1);
  L.Fill(robe, px, y - 3, 2, 1);
  L.Fill(robe, px - 1, y - 2, 4, 1);
  L.Fill('#e8d5c0', px, y - 1, 2, 1);
  L.Fill('#9b59d0', px + (f > 0 ? 1 : 0), y - 1, 1, 1);
  L.Fill(robe, px - 1, y, 4, 2);
  if (isMoving && step === 1) { L.Fill(dark, px - 1, y + 2, 2, 1); L.Fill(dark, px + 1, y + 2, 2, 1); }
  else { L.Fill(dark, px - 1, y + 2, 3, 1); L.Fill(dark, px, y + 2, 2, 1); }
  if (u.atk > 0) L.Fill(robe, px + 2 * f, y - 2, 2, 1);
  else L.Fill(robe, px + 2, y - 1, 1, 2);
  L.Fill('#c98d5a', px + 2 * f, y - 1, 1, 3);
  L.Fill(frame % 6 < 3 ? '#ffd93d' : '#ffb347', px + 2 * f, y - 2, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 1, y - 5, 5, 1);
}

// ---------------- 主对账：黄金 113 场景逐 op 逐位 ----------------
export function runRender3Transcript() {
  const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/render3.json'), 'utf8'));
  let n = 0, fail = 0;
  const fails = [];
  const FN = {
    drawDragon: mrrDrawDragon, drawPenguin: mrrDrawPenguin, drawCamel: mrrDrawCamel,
    drawScorpion: mrrDrawScorpion, drawSnake: mrrDrawSnake, drawSkeleton: mrrDrawSkeleton,
    drawDemon: mrrDrawDemon, drawAngel: mrrDrawAngel, drawPhoenix: mrrDrawPhoenix,
    drawEnt: mrrDrawEnt, drawLich: mrrDrawLich, drawTroll: mrrDrawTroll, drawOgre: mrrDrawOgre,
    drawWhiteWalker: mrrDrawWhiteWalker, drawVampire: mrrDrawVampire, drawKraken: mrrDrawKraken,
    drawSandworm: mrrDrawSandworm, drawBasilisk: mrrDrawBasilisk, drawHydra: mrrDrawHydra, drawMage: mrrDrawMage,
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
  function h2f(hex) {
    const b = new DataView(new ArrayBuffer(8));
    for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
    return b.getFloat64(0, true);
  }
  for (const s of golden.scens) {
    const L = new MrrList();
    const fn = FN[s.fn];
    if (!fn) throw new Error('unknown fn ' + s.fn);
    fn(L, rebuildU(s.in.u), s.in.frame);
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
  const r = runRender3Transcript();
  console.log(`[RENDER3 TRANSCRIPT] ${r.n - r.fail}/${r.n} 逐位 ${r.fail === 0 ? 'ALL PASS' : 'FAIL'}`);
  for (const f of r.fails.slice(0, 15)) console.error('  [FAIL]', f);
  if (r.fail > 0) process.exit(1);
}
