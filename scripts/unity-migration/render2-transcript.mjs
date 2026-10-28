// render2-transcript.mjs — WbSprites.cs 的 JS 独立镜像（M-U5a 验证链防循环论证双链）
// 语义源 = WbSprites.cs 翻译稿（非 sprites.ts！）——按 C# 语义重新转写 JS，与黄金逐位对账：
//   黄金 = gen-render2.mjs 直录 src 真实现（128 场景）｜镜像 = C# 语义独立转写｜断言 = 逐 op 逐位。
// 覆盖：drawTree/drawMountainProp/drawPerson/drawPersonFine/drawQuadFine/drawBoat/drawCaravan
//       + drawSheep/drawWolf/drawSnowWolf/drawBear/drawDeer（12 函数 = M-U4 bail 契约展开 + 中档五族）。
// 跑法：node scripts/unity-migration/render2-transcript.mjs（verify 段 12 由 verify-csharp-port.mjs 调用）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ---------------- f64 bits hex 工具 ----------------
function f64hex(v) {
  const b = new DataView(new ArrayBuffer(8));
  b.setFloat64(0, v ?? 0, true);
  let s = '';
  for (let i = 0; i < 8; i++) s += b.getUint8(i).toString(16).padStart(2, '0');
  return s;
}
function h2f(hex) {
  const b = new DataView(new ArrayBuffer(8));
  for (let i = 0; i < 8; i++) b.setUint8(i, parseInt(hex.slice(i * 2, i * 2 + 2), 16));
  return b.getFloat64(0, true);
}

// ---------------- 镜像助手（WbSprites.cs 语义转写） ----------------
const Rgb = (a, b, c) => `rgb(${a},${b},${c})`;
const RgbA = (c) => Rgb(c[0], c[1], c[2]);
// C# Mix = Floor(v+0.5)（JS Math.round 半上语义在 C# 的等价式）
const Mix = (a, b, t) => [
  Math.floor(a[0] + (b[0] - a[0]) * t + 0.5),
  Math.floor(a[1] + (b[1] - a[1]) * t + 0.5),
  Math.floor(a[2] + (b[2] - a[2]) * t + 0.5),
];
const SKIN = { 0: [217, 160, 102], 1: [232, 230, 200], 2: [222, 175, 120], 3: [127, 169, 60], 4: [217, 160, 102], 5: [127, 169, 60], 9: [180, 40, 40], 19: [79, 158, 58], 20: [127, 169, 60] };
const SkinOf = (k) => SKIN[k] ?? SKIN[0];

function HexToHsl(hex) {
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
function HslToHex(h, s, l) {
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
  const to = (v) => Math.max(0, Math.min(255, Math.floor(v * 255 + 0.5))).toString(16).padStart(2, '0');
  return `#${to(r + m)}${to(g + m)}${to(b + m)}`;
}
// C# ShiftColor：l2 = clamp(l*lum+lumBias, 0.06, 0.94)；hslToHex 的 Math.round → Floor(v*255+0.5)（C# To2 语义）
const ShiftColor = (base, v, lumBias = 0) => {
  const [h, s, l] = HexToHsl(base);
  const l2 = Math.max(0.06, Math.min(0.94, l * v.lum + lumBias));
  return HslToHex(h + v.hue, Math.min(1, s * 1.05), l2);
};
const ShiftRgb = (c, v) => {
  const hex = `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  const out = ShiftColor(hex, v);
  return [parseInt(out.slice(1, 3), 16), parseInt(out.slice(3, 5), 16), parseInt(out.slice(5, 7), 16)];
};

const WepFamily = (w) => {
  if (!w) return 'none';
  if (w === 'musket') return 'musket';
  if (w === 'rifle') return 'rifle';
  if (w === 'laser_rifle') return 'laser';
  if (w.includes('sword') || w.includes('blade') || w.includes('dagger') || w.includes('katana')) return 'sword';
  if (w.includes('axe') || w.includes('hammer') || w.includes('mace') || w.includes('club')) return 'axe';
  if (w.includes('spear') || w.includes('lance') || w.includes('pike') || w.includes('staff')) return 'spear';
  if (w.includes('bow') || w.includes('crossbow')) return 'bow';
  return 'sword';
};
const BladeColor = (w) => {
  if (!w) return '#9a8f7a';
  if (w === 'excalibur' || w === 'sword3' || w === 'holy_sword') return '#ffd93d';
  if (w === 'flame_sword') return '#ff8c42';
  if (w === 'ice_sword') return '#8be9ff';
  if (w === 'katana' || w === 'elf_blade' || w === 'sword2') return '#e8e8e8';
  return '#b0a48c';
};

// C# 坐标基元：Px2 = dpx ?? (rx ?? x)*2；Fx4 = Floor((rx ?? x)+0.5)（C# Math.Floor 半上等价式）
const Px2 = (u) => (u.dpx != null ? u.dpx : (u.rx != null ? u.rx : u.x) * 2);
const Py2 = (u) => (u.dpy != null ? u.dpy : (u.ry != null ? u.ry : u.y) * 2);
const Fx4 = (u) => Math.floor((u.rx != null ? u.rx : u.x) + 0.5);
const Fy4 = (u) => Math.floor((u.ry != null ? u.ry : u.y) + 0.5) + 1;
const IsMoving = (u) => u.lx != null && (u.lx !== u.x || u.ly == null || u.ly !== u.y);

// ---------------- 镜像绘制目标（WbDrawList 等价） ----------------
class MrrList {
  constructor() { this.ops = []; }
  Fill(style, x, y, w, h) { this.ops.push({ o: 'fillRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [style] }); }
  Stroke(style, lw, x, y, w, h) { this.ops.push({ o: 'strokeRect', a: [f64hex(x), f64hex(y), f64hex(w), f64hex(h)], s: [style, f64hex(lw)] }); }
}

// ---------------- 镜像十二函数（WbSprites.cs 语义转写；注释只标 C# 行为锚点） ----------------
export function mrrDrawTree(L, x, y, variant, season = 1) {
  const px = x * 4, py = y * 4;
  const dark = ((variant % 3) + 3) % 3 === 0; // C# int % 与 JS 同号（variant 恒正，直译）
  L.Fill('rgba(0,0,0,0.22)', px, py + 3, 4, 1);
  if (season === 3) {
    L.Fill('#4a3826', px + 1, py - 1, 2, 5);
    L.Fill('#4a3826', px, py - 2, 1, 2);
    L.Fill('#4a3826', px + 3, py - 1, 1, 2);
    L.Fill('#4a3826', px + 1, py - 3, 1, 1);
    if (variant % 3 === 0) {
      L.Fill('rgba(238,244,248,0.95)', px + 1, py - 3, 2, 1);
      L.Fill('rgba(238,244,248,0.95)', px, py - 2, 1, 1);
    }
    return;
  }
  if (season === 2) {
    const gold = (variant & 1) === 0;
    const c1 = gold ? (dark ? '#b8862f' : '#c9a13b') : (dark ? '#a04426' : '#c96a2d');
    const c2 = gold ? (dark ? '#a5761f' : '#b8904a') : (dark ? '#8c3818' : '#b5502a');
    const hi = gold ? '#e0b84f' : '#e08a4a';
    L.Fill(c1, px - 1, py - 1, 6, 4);
    L.Fill(c2, px, py - 2, 4, 2);
    L.Fill(c2, px + 3, py + 1, 2, 2);
    L.Fill(hi, px, py - 2, 2, 1);
    if (variant % 7 !== 1) {
      L.Fill(gold ? 'rgba(201,161,59,0.85)' : 'rgba(201,106,45,0.85)', px - 1 + ((variant & 2) !== 0 ? 2 : 0), py + 3, 1, 1);
      L.Fill(gold ? 'rgba(201,161,59,0.85)' : 'rgba(201,106,45,0.85)', px + 4 - ((variant & 1) !== 0 ? 1 : 0), py + 4, 1, 1);
    }
    L.Fill('#5d3f22', px + 1, py + 2, 2, 2);
    return;
  }
  if (season === 0) {
    if (variant % 9 === 0) {
      L.Fill('#e8a8c8', px - 1, py - 1, 6, 4);
      L.Fill('#f4c8dc', px, py - 2, 4, 2);
      L.Fill('#fce4f0', px + 1, py - 2, 2, 1);
      L.Fill('#fff0f6', px - 1, py + 1, 1, 1);
      L.Fill('#fff0f6', px + 5, py, 1, 1);
    } else {
      L.Fill(dark ? '#4a8f34' : '#63a844', px - 1, py - 1, 6, 4);
      L.Fill(dark ? '#57a03e' : '#7cc254', px, py - 2, 4, 2);
      L.Fill('#8fd66a', px, py - 2, 2, 1);
    }
    L.Fill('#6e4a2b', px + 1, py + 2, 2, 2);
    return;
  }
  L.Fill(dark ? '#2c5e24' : '#3f7a2e', px - 1, py - 1, 6, 4);
  L.Fill(dark ? '#376e2b' : '#4c8c38', px, py - 2, 4, 2);
  L.Fill(variant % 5 === 0 ? '#6fc04a' : '#55a03c', px, py - 2, 2, 1);
  L.Fill('#24501c', px + 3, py + 1, 2, 2);
  L.Fill('#6e4a2b', px + 1, py + 2, 2, 2);
}

export function mrrDrawMountainProp(L, x, y, variant, elev = null, cold = null) {
  const px = x * 4, py = y * 4;
  L.Fill('#575757', px - 1, py + 1, 6, 3);
  L.Fill('#7d7d82', px, py - 1, 4, 4);
  L.Fill('#8d8d8d', px + 1, py - 2, 2, 2);
  L.Fill('#a5a5a9', px + 2, py, 2, 4);
  L.Fill('#a5a5a9', px + 3, py - 1, 1, 1);
  L.Fill('#44444a', px, py + 1, 1, 3);
  L.Fill('#44444a', px + 1, py + 2, 1, 2);
  if (variant % 5 === 0) {
    L.Fill('rgba(30,30,34,0.6)', px + 2, py + 3, 1, 1);
    L.Fill('rgba(30,30,34,0.6)', px - 1, py + 2, 1, 1);
  }
  const snowy = elev != null ? elev > 170 || (cold != null && cold > 0.6 && elev > 150) : variant > 150;
  if (snowy) {
    L.Fill('#f7f9fb', px + 1, py - 2, 2, 1);
    L.Fill('#f7f9fb', px, py - 1, 1, 1);
    L.Fill('#dce8f0', px + 1, py - 1, 2, 1);
  }
}

// in.u 重建（gen dumpU 逆变换；f64 全 hex）
export function rebuildU(d) {
  return {
    race: d.race, civ: d.civ,
    x: h2f(d.x), y: h2f(d.y),
    rx: d.rx == null ? null : h2f(d.rx), ry: d.ry == null ? null : h2f(d.ry),
    dpx: d.dpx == null ? null : h2f(d.dpx), dpy: d.dpy == null ? null : h2f(d.dpy),
    flip: d.flip, lx: d.lx == null ? null : h2f(d.lx), ly: d.ly == null ? null : h2f(d.ly),
    wep: d.wep ?? null, armS: d.arm ?? null, hlmS: d.hlm ?? null,
    atk: h2f(d.atk), traitName: d.trait ?? null,
    age: d.age, maxAge: d.maxAge,
    hurt: d.hurt, hp: h2f(d.hp), maxHp: h2f(d.maxHp),
    job: d.job, infected: d.infected, king: d.king,
  };
}

export function mrrDrawPerson(L, u, raceVis, civColor, t = 0) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const race = u.race;
  const vis = raceVis;
  const skin = vis ? ShiftRgb(SkinOf(vis.root), vis) : SkinOf(race);
  const goblin = race === 20, zombie = race === 5;
  const isMoving = IsMoving(u);
  const step = isMoving ? ((t >> 2) & 1) : 0;
  const bob = isMoving && step === 1 ? 1 : 0;
  const breath = !isMoving && ((t >> 4) & 1) === 1 ? 1 : 0;
  const y = py - bob - breath;
  let cloth;
  if (race === 20) cloth = [90, 122, 44];
  else if (race === 19) cloth = [58, 52, 44];
  else if (civColor) cloth = Mix(civColor, [30, 30, 30], 0.25);
  else cloth = [120, 90, 70];
  const pants = Mix(cloth, [20, 18, 14], 0.55);
  const hairBase = race === 1 ? '#e8d5a0' : race === 2 ? '#b5651d' : (race === 3 || race === 4) ? '#14100c'
    : race === 5 ? '#3a342c' : race === 19 ? '#2c5e24' : race === 20 ? '#2c5e24' : '#5b3a1e';
  const hairCol = race !== 5 && u.age > u.maxAge * 0.78
    ? (vis ? ShiftColor('#c9c5bd', vis) : '#c9c5bd')
    : (vis ? ShiftColor(hairBase, vis) : hairBase);

  if (u.traitName === 'giant') {
    const gy = py - bob;
    L.Fill('rgba(0,0,0,0.3)', px - 2, gy + 3, 5, 1);
    L.Fill(hairCol, px - 1, gy - 4, 3, 1);
    L.Fill(RgbA(skin), px - 1, gy - 3, 3, 2);
    L.Fill('#14100c', px + (u.flip !== 0 ? -2 : 1), gy - 3, 1, 1);
    L.Fill(u.hurt > 0 ? '#ff3b30' : RgbA(cloth), px - 1, gy - 1, 3, 2);
    L.Fill(RgbA(skin), px - 3, gy - 1, 1, 2);
    L.Fill(RgbA(skin), px + 2, gy - 1, 1, 2);
    if (step === 1) { L.Fill(RgbA(pants), px - 1, gy + 1, 1, 2); L.Fill(RgbA(pants), px + 1, gy + 1, 1, 1); }
    else { L.Fill(RgbA(pants), px - 1, gy + 1, 1, 1); L.Fill(RgbA(pants), px + 1, gy + 1, 1, 2); }
    const wep = u.wep;
    if (wep === 'musket' || wep === 'rifle' || wep === 'laser_rifle') {
      const fut = wep === 'laser_rifle';
      L.Fill(fut ? '#1d2b36' : wep === 'rifle' ? '#3a3f4a' : '#4a4038', px + 2 * f, gy - 2, 3, 1);
      L.Fill(fut ? '#2e4456' : '#6e4a2b', px + f, gy - 2, 1, 1);
      if (fut) L.Fill(((t >> 3) & 1) === 1 ? '#7df9ff' : '#3ec6d8', px + 3 * f, gy - 2, 1, 1);
      if (u.atk > 0) {
        L.Fill(fut ? '#a5f3fc' : '#fff3c4', px + 5 * f, gy - 2, 1, 1);
        if (fut) L.Fill('#22d3ee', px + 6 * f, gy - 2, 1, 1);
      }
    } else if (wep != null) {
      L.Fill(wep === 'sword3' ? '#ffd93d' : wep === 'sword2' ? '#e8e8e8' : '#9a8f7a', px + 2 * f, u.atk > 0 ? gy - 4 : gy - 2, 1, 3);
    }
  } else {
    const hY = goblin ? y + 1 : y;
    L.Fill('rgba(0,0,0,0.28)', px - 1, y + 3, 3, 1);
    const legH = goblin ? 1 : 2;
    if (isMoving) {
      if (step === 1) { L.Fill(RgbA(pants), px - 1, y + 1 + (goblin ? 1 : 0), 1, legH); L.Fill(RgbA(pants), px, y + 2 + (goblin ? 1 : 0), 1, 1); }
      else { L.Fill(RgbA(pants), px - 1, y + 2 + (goblin ? 1 : 0), 1, 1); L.Fill(RgbA(pants), px, y + 1 + (goblin ? 1 : 0), 1, legH); }
    } else {
      L.Fill(RgbA(pants), px - 1, y + 1 + (goblin ? 1 : 0), 1, legH);
      L.Fill(RgbA(pants), px, y + 1 + (goblin ? 1 : 0), 1, legH);
    }
    const torsoW = race === 2 || (vis != null && vis.bulk >= 0.62) ? 3 : 2;
    L.Fill(u.hurt > 0 ? '#ff3b30' : RgbA(cloth), px - 1, hY - 1, torsoW, 2);
    const arm = u.armS;
    if (arm != null) {
      L.Fill(arm === 'armor2' ? '#cfd4da' : '#b58a5a', px - 1, hY - 1, 1, 1);
      L.Fill(arm === 'armor2' ? '#cfd4da' : '#b58a5a', px, hY - 1, 1, 1);
    }
    if (zombie) L.Fill(RgbA(skin), px + (f > 0 ? 1 : -2), hY - 2, 2, 1);
    else if (u.atk > 0) {
      L.Fill(RgbA(skin), px + 2 * f, hY - 3, 1, 2);
      L.Fill(RgbA(skin), px - 2 * f + (f > 0 ? 1 : 0), hY - 1, 1, 2);
    } else if (isMoving) {
      if (step === 1) { L.Fill(RgbA(skin), px - 2, hY - 1, 1, 1); L.Fill(RgbA(skin), px + 1, hY, 1, 2); }
      else { L.Fill(RgbA(skin), px - 2, hY, 1, 2); L.Fill(RgbA(skin), px + 1, hY - 1, 1, 1); }
    } else {
      L.Fill(RgbA(skin), px - 2, hY - 1, 1, 2);
      L.Fill(RgbA(skin), px + 1, hY - 1, 1, 2);
    }
    L.Fill(hairCol, px - 1, hY - 3, 2, 1);
    L.Fill(RgbA(skin), px - 1, hY - 2, 2, 2);
    L.Fill(race === 3 || race === 20 ? '#cf3f2e' : race === 19 ? '#ffd93d' : '#14100c', px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
    if (race === 1) { L.Fill(RgbA(skin), px - 2, hY - 2, 1, 1); L.Fill(RgbA(skin), px + 1, hY - 2, 1, 1); }
    else if (race === 2) {
      L.Fill('#c0c6cc', px - 1, hY - 3, 2, 1);
      L.Fill(u.hurt > 0 ? '#ff6b5e' : '#c96a15', px - 1, hY - 1, 2, 1);
    } else if (race === 3) { L.Fill('#f2ead8', px - 1, hY, 1, 1); L.Fill('#f2ead8', px + 1, hY, 1, 1); }
    else if (race === 4) {
      L.Fill('#3a342c', px - 1, hY - 3, 2, 3);
      L.Fill('#cf3f2e', px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
    } else if (race === 19) {
      L.Fill('#2c5e24', px - 1, hY - 3, 2, 1);
      L.Fill(RgbA(skin), px + 2 * f, hY - 2, 1, 1);
      const tailUp = ((t >> 3) & 1) === 1;
      L.Fill('#2c5e24', px - 2 * f, hY + 1, 1, 1);
      L.Fill('#2c5e24', px - 3 * f, tailUp ? hY : hY + 1, 1, 1);
    } else if (goblin) { L.Fill(RgbA(skin), px - 2, hY - 2, 1, 1); L.Fill(RgbA(skin), px + 1, hY - 2, 1, 1); }
    else if (vis != null) {
      if (vis.ears === 2) { L.Fill(RgbA(skin), px - 2, hY - 3, 1, 2); L.Fill(RgbA(skin), px + 1, hY - 3, 1, 2); }
      else if (vis.ears === 1) { L.Fill(RgbA(skin), px - 2, hY - 2, 1, 1); L.Fill(RgbA(skin), px + 1, hY - 2, 1, 1); }
      if (vis.horns >= 1) {
        const hc = ShiftColor('#e8dcc8', vis, -0.08);
        L.Fill(hc, px - 1, hY - 4, 1, 1);
        if (vis.horns >= 2) L.Fill(hc, px, hY - 4, 1, 1);
      }
      if (vis.crest !== 0) L.Fill(ShiftColor('#cf3f2e', vis, 0.1), px - 1, hY - 4, 2, 1);
      if (vis.glow !== 0) L.Fill('#7df9ff', px + (f > 0 ? 0 : -1), hY - 2, 1, 1);
      if (vis.pattern === 1) L.Fill(ShiftColor('#3a342c', vis, 0.02), px, hY - 1, 1, 2);
      else if (vis.pattern === 2) L.Fill(ShiftColor('#cf3f2e', vis, 0.05), px, hY, 1, 1);
    }
    const wep2 = u.wep;
    if (wep2 === 'musket' || wep2 === 'rifle' || wep2 === 'laser_rifle') {
      const fut = wep2 === 'laser_rifle';
      L.Fill(fut ? '#1d2b36' : wep2 === 'rifle' ? '#3a3f4a' : '#4a4038', px + 2 * f, hY - 2, 3, 1);
      L.Fill(fut ? '#2e4456' : '#6e4a2b', px + f, hY - 2, 1, 1);
      if (fut) {
        L.Fill(((t >> 3) & 1) === 1 ? '#7df9ff' : '#3ec6d8', px + 3 * f, hY - 2, 1, 1);
        if (arm === 'energy_shield') L.Fill(((t >> 2) & 1) === 1 ? 'rgba(125,249,255,0.75)' : 'rgba(62,198,216,0.4)', px - 2 * f, hY - 2, 1, 3);
      }
      if (u.atk > 0) {
        if (fut) {
          L.Fill('#22d3ee', px + 5 * f, hY - 2, 1, 1);
          L.Fill('#a5f3fc', px + 4 * f, hY - 2, 1, 1);
          L.Fill('#ffffff', px + 3 * f, hY - 2, 1, 1);
        } else {
          L.Fill('#ffd93d', px + 5 * f, hY - 2, 1, 1);
          L.Fill('#fff3c4', px + 4 * f, hY - 2, 1, 1);
        }
      }
    } else if (wep2 != null) {
      const wc = wep2 === 'sword3' ? '#ffd93d' : wep2 === 'sword2' ? '#e8e8e8' : '#9a8f7a';
      if (u.atk > 0) {
        L.Fill(wc, px + 2 * f, hY - 3, 1, 2);
        L.Fill('#ffffff', px + 3 * f, hY - 2, 1, 1);
      } else L.Fill(wc, px + 2 * f, hY - 2, 1, 2);
    }
  }
  const job = u.job;
  if (u.traitName !== 'giant') {
    const jY = goblin ? y + 1 : y;
    if (job === 1) L.Fill('#ffd93d', px - 1, jY - 4, 2, 1);
    else if (job === 2) {
      L.Fill(u.hurt > 0 ? '#ff6b5e' : '#c0c6cc', px - 1, jY - 4, 2, 1);
      L.Fill('#cf3f2e', px - 1, jY - 5, 1, 1);
    } else if (job === 3) {
      L.Fill('#8a5a2c', px + (u.flip !== 0 ? -3 : 2), jY - 2, 1, 1);
      L.Fill('#8a5a2c', px + (u.flip !== 0 ? -3 : 2), jY, 1, 1);
    } else if (job === 4) L.Fill('#ff9b2d', px - 1, jY - 4, 2, 1);
    else if (job === 5) L.Fill('#ffd93d', px + (u.flip !== 0 ? -2 : 1), jY - 1, 1, 1);
    else if (job === 6) L.Fill('#b56cf0', px - 1, jY - 1, 2, 1);
  }
  if (u.infected !== 0) L.Fill('#64c95d', px, y - 4, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 1, y - 5, 3, 1);
}

export function mrrDrawPersonFine(L, u, raceVis, civColor, t = 0, crown = false) {
  const fx = Fx4(u), fy = Fy4(u);
  const f = u.flip !== 0 ? -1 : 1;
  const race = u.race;
  const vis = raceVis;
  const skin = vis ? ShiftRgb(SkinOf(vis.root), vis) : SkinOf(race);
  const skinDark = Mix(skin, [24, 20, 16], 0.3);
  const goblin = race === 20, zombie = race === 5, dwarf = race === 2;
  const bandit = race === 4 && civColor == null;
  const isMoving = IsMoving(u);
  const ph = isMoving ? ((t >> 2) & 3) : -1;
  const bob = isMoving && (ph === 1 || ph === 3) ? 1 : 0;
  const breath = !isMoving && ((t >> 4) & 1) === 1 ? 1 : 0;
  const dy = fy - bob - breath;
  const arm = u.armS, hlm = u.hlmS;
  const hurt = u.hurt > 0;
  const atk = u.atk > 0 ? 1 : 0;
  let cloth;
  if (race === 20) cloth = [90, 122, 44];
  else if (race === 19) cloth = [58, 52, 44];
  else if (civColor) cloth = Mix(civColor, [30, 30, 30], 0.25);
  else cloth = [120, 90, 70];
  const clothDark = Mix(cloth, [18, 16, 12], 0.4);
  const pants = Mix(cloth, [20, 18, 14], 0.55);
  const hairBase = race === 1 ? '#e8d5a0' : race === 2 ? '#b5651d' : (race === 3 || race === 4) ? '#14100c'
    : race === 5 ? '#3a342c' : race === 19 ? '#2c5e24' : race === 20 ? '#2c5e24' : '#5b3a1e';
  const hairCol = race !== 5 && u.age > u.maxAge * 0.78
    ? (vis ? ShiftColor('#c9c5bd', vis) : '#c9c5bd')
    : (vis ? ShiftColor(hairBase, vis) : hairBase);
  // 0. 阴影
  L.Fill('rgba(0,0,0,0.3)', fx - 2, fy + 1, 5, 1);
  L.Fill('rgba(0,0,0,0.3)', fx - 3, fy + 1, 1, 1);
  L.Fill('rgba(0,0,0,0.3)', fx + 3, fy + 1, 1, 1);
  // 1. 双腿（四相步态）
  const l1 = ph === 1 || ph === 2 ? 3 : 2;
  const l2 = ph === 3 || ph === 0 ? 3 : 2;
  L.Fill(RgbA(pants), fx - 2, dy + 1 - l1, 2, l1);
  L.Fill(RgbA(pants), fx + 1 + (ph === 1 ? 1 : 0), dy + 1 - l2, 2, l2);
  L.Fill('#3a2c1c', fx - 2, dy, 2, 1);
  L.Fill('#3a2c1c', fx + 1 + (ph === 1 ? 1 : 0), dy, 2, 1);
  // 2. 腰带
  L.Fill('#4a3421', fx - 2, dy - 4, 5, 1);
  L.Fill('#d9a941', fx + (f > 0 ? 1 : -2), dy - 4, 1, 1);
  // 3. 躯干
  const torsoW = dwarf ? 6 : 5;
  const tx = fx - (torsoW >> 1);
  L.Fill(hurt ? '#ff3b30' : RgbA(cloth), tx, dy - 7, torsoW, 3);
  L.Fill(hurt ? '#c73028' : RgbA(clothDark), f > 0 ? tx : tx + torsoW - 1, dy - 7, 1, 3);
  L.Fill(hurt ? '#ff6b5e' : RgbA(Mix(cloth, [235, 230, 220], 0.18)), f > 0 ? tx + torsoW - 1 : tx, dy - 7, 1, 2);
  // 4. 护甲
  if (arm != null) {
    const steel = arm === 'armor2' || arm === 'armor3';
    L.Fill(steel ? '#cfd4da' : '#b58a5a', tx + 1, dy - 7, torsoW - 2, 2);
    L.Fill(steel ? '#eef2f6' : '#d8b078', tx + 1, dy - 7, 1, 1);
    L.Fill(steel ? '#9aa2ac' : '#8a6238', tx - 1, dy - 7, 1, 2);
    L.Fill(steel ? '#9aa2ac' : '#8a6238', tx + torsoW, dy - 7, 1, 2);
  }
  // 5. 双臂
  if (zombie) {
    L.Fill(hurt ? '#ff6b5e' : RgbA(skin), fx + (f > 0 ? 2 : -4), dy - 7, 2, 1);
    L.Fill(hurt ? '#ff6b5e' : RgbA(skin), fx + (f > 0 ? 3 : -4), dy - 6, 2, 1);
  } else if (atk !== 0) {
    L.Fill(hurt ? '#ff6b5e' : RgbA(skin), fx + 2 * f, dy - 9, 1, 3);
    L.Fill(hurt ? '#ff6b5e' : RgbA(skin), fx - 3 * f + 1, dy - 6, 1, 2); // C#: -3f+(f>0?1:1)
  } else {
    const swing = ph === 1 || ph === 2 ? 1 : 0;
    L.Fill(hurt ? '#ff6b5e' : RgbA(skin), fx - 3, dy - 7 + (isMoving && swing !== 0 ? 0 : 1), 1, 2);
    L.Fill(hurt ? '#ff6b5e' : RgbA(skin), fx + 2 + (isMoving && swing !== 0 ? 1 : 0), dy - 7 + (isMoving && swing !== 0 ? 1 : 0), 1, 2);
  }
  // 6. 颈
  L.Fill(RgbA(skinDark), fx - 1, dy - 8, 2, 1);
  // 7. 头部
  const hy = dy - 11;
  L.Fill(hurt ? '#ff6b5e' : u.infected !== 0 ? '#9fd68f' : RgbA(skin), fx - 2, hy, 4, 3);
  const eyeCol = vis != null && vis.glow !== 0 ? '#7df9ff' : zombie ? '#d9f2c0' : '#1c1710';
  const ex = fx - 1 + (f > 0 ? 1 : 0);
  L.Fill(eyeCol, ex, hy + 1, 1, 1);
  L.Fill(eyeCol, ex + 1, hy + 1, 1, 1);
  if (race === 19) L.Fill(RgbA(skinDark), fx - 1 + (f > 0 ? 2 : -2), hy + 2, 1, 1);
  if (race === 3) { L.Fill('#f2ead8', fx - 1, hy + 2, 1, 1); L.Fill('#f2ead8', fx + 1, hy + 2, 1, 1); }
  if (race === 1) { L.Fill(RgbA(skin), fx - 3, hy + 1, 1, 1); L.Fill(RgbA(skin), fx + 2, hy + 1, 1, 1); }
  if (goblin) { L.Fill(RgbA(skinDark), fx - 3, hy + 1, 1, 1); L.Fill(RgbA(skinDark), fx + 2, hy + 1, 1, 1); }
  if (dwarf) { L.Fill(hairCol, fx - 2, hy + 3, 4, 2); L.Fill(hairCol, fx - 1, hy + 5, 2, 1); }
  if (bandit) {
    L.Fill('#2a2620', fx - 2, hy - 1, 4, 3);
    L.Fill('#2a2620', fx - 2, hy + 2, 4, 1);
    L.Fill('#14100c', fx - 1, hy + 1, 3, 1);
  }
  // 8. 发型
  if (!bandit) {
    L.Fill(hairCol, fx - 2, hy - 2, 4, 2);
    L.Fill(hairCol, fx + (f > 0 ? -3 : 2), hy - 1, 1, 2);
    const backX = f > 0 ? fx - 3 : fx + 2;
    L.Fill(hairCol, backX, hy - 1, 1, race === 1 ? 5 : 3);
    L.Fill('rgba(255,255,240,0.25)', fx - 1, hy - 2, 2, 1);
    if (race === 19) L.Fill('#2c5e24', fx - 1, hy - 3, 2, 1);
  }
  // 9. 涌现标记
  if (vis != null) {
    if (vis.horns >= 1) {
      L.Fill('#e8dcc0', fx - 2, hy - 3, 1, 1);
      L.Fill('#e8dcc0', fx + 1, hy - 3, 1, 1);
      if (vis.horns >= 2) { L.Fill('#e8dcc0', fx - 3, hy - 4, 1, 1); L.Fill('#e8dcc0', fx + 2, hy - 4, 1, 1); }
    }
    if (vis.crest !== 0) L.Fill(vis.glow !== 0 ? '#7df9ff' : '#ff8c42', fx - 1, hy - 3 - (vis.horns >= 1 ? 1 : 0), 2, 1);
    if (vis.pattern === 1) { L.Fill('rgba(0,0,0,0.25)', fx - 1, dy - 7, 1, 3); L.Fill('rgba(0,0,0,0.25)', fx + 1, dy - 7, 1, 3); }
  }
  // 10. 头盔
  if (hlm != null) {
    const steel = hlm === 'hlm2' || hlm === 'hlm3';
    L.Fill(steel ? '#cfd4da' : '#b58a5a', fx - 2, hy - 2, 4, 2);
    L.Fill(steel ? '#cfd4da' : '#b58a5a', fx - 2, hy, 1, 1);
    L.Fill(steel ? '#cfd4da' : '#b58a5a', fx + 1, hy, 1, 1);
    L.Fill(steel ? '#eef2f6' : '#d8b078', fx - 1, hy - 2, 2, 1);
    L.Fill(steel ? '#9aa2ac' : '#8a6238', fx + (f > 0 ? 1 : -2), hy, 1, 2);
  }
  // 11. 持械
  const fam = WepFamily(u.wep);
  if (fam !== 'none') {
    const wx = fx + 2 * f;
    const wy = atk !== 0 ? dy - 10 : dy - 7;
    if (fam === 'sword') {
      const bc = BladeColor(u.wep);
      L.Fill('#5a4028', wx, wy + 4, 1, 2);
      L.Fill('#8a6238', wx - 1, wy + 3, 3, 1);
      L.Fill(bc, wx, wy - 1, 1, 4);
      L.Fill('rgba(255,255,255,0.5)', wx, wy, 1, 1);
      if (u.wep === 'flame_sword' && ((t >> 2) & 1) === 1) L.Fill('#ff8c42', wx, wy - 2, 1, 1);
    } else if (fam === 'axe') {
      L.Fill('#5a4028', wx, wy, 1, 6);
      L.Fill(u.wep === 'berserker_axe' ? '#c9463d' : '#b0a48c', wx + (f > 0 ? 0 : -2), wy, 3, 2);
      L.Fill('rgba(255,255,255,0.4)', wx + (f > 0 ? 2 : -2), wy, 1, 1);
    } else if (fam === 'spear') {
      L.Fill('#6e4a2b', wx, wy - 2, 1, 8);
      L.Fill('#d8d8d8', wx, wy - 4, 1, 2);
    } else if (fam === 'bow') {
      L.Stroke('#6e4a2b', 1, wx, wy - 1, 2, 5);
      L.Fill('rgba(240,240,230,0.7)', wx + 1, wy, 1, 3);
    } else {
      const fut = fam === 'laser';
      L.Fill(fut ? '#1d2b36' : fam === 'rifle' ? '#3a3f4a' : '#4a4038', wx - (f > 0 ? 0 : 4), wy, 5, 1);
      L.Fill(fut ? '#2e4456' : '#6e4a2b', wx - (f > 0 ? 1 : 3), wy, 1, 1);
      if (fam === 'rifle') L.Fill('#565e6a', wx + (f > 0 ? 1 : -3), wy - 1, 2, 1);
      if (fut) L.Fill(((t >> 3) & 1) === 1 ? '#7df9ff' : '#3ec6d8', wx + (f > 0 ? 2 : -3), wy, 1, 1);
      if (atk !== 0) {
        L.Fill(fut ? '#a5f3fc' : '#fff3c4', wx + (f > 0 ? 5 : -6), wy, 1, 1);
        if (!fut) L.Fill('#ffb347', wx + (f > 0 ? 6 : -7), wy, 1, 1);
      }
    }
  }
  // 12. 王冠
  if (crown) {
    L.Fill('#e6ba6c', fx - 1, hy - 3, 3, 1);
    L.Fill('#e6ba6c', fx - 1, hy - 4, 1, 1);
    L.Fill('#e6ba6c', fx + 1, hy - 4, 1, 1);
    L.Fill('#ffe9a8', fx, hy - 4, 1, 1);
  }
}

export function mrrDrawQuadFine(L, u, kind, t = 0, crown = false) {
  const fx = Fx4(u), fy = Fy4(u);
  const f = u.flip !== 0 ? -1 : 1;
  const isMoving = IsMoving(u);
  const ph = isMoving ? ((t >> 2) & 3) : -1;
  const hurt = u.hurt > 0, infected = u.infected !== 0;
  let body, dark, light;
  if (kind === 'sheep') { body = [242, 234, 216]; dark = [70, 66, 60]; light = [255, 250, 240]; }
  else if (kind === 'bear') { body = [110, 74, 43]; dark = [58, 38, 20]; light = [154, 111, 69]; }
  else if (kind === 'deer') { body = [165, 121, 79]; dark = [91, 61, 36]; light = [209, 168, 120]; }
  else if (kind === 'snowwolf') { body = [238, 242, 245]; dark = [176, 188, 196]; light = [255, 255, 255]; }
  else { body = [141, 141, 141]; dark = [58, 52, 44]; light = [200, 200, 200]; }
  if (hurt) { body = [255, 107, 94]; dark = [207, 63, 46]; light = [255, 196, 184]; }
  if (infected) { body = [159, 214, 143]; dark = [96, 140, 84]; light = [200, 235, 180]; }
  const bulk = kind === 'bear', slender = kind === 'deer';
  const bw = bulk ? 10 : slender ? 7 : 8;
  const bh = bulk ? 4 : slender ? 2 : 3;
  const bx = fx - (bw >> 1);
  const by = fy - 1 - bh;
  L.Fill('rgba(0,0,0,0.28)', bx + 1, fy + 1, bw - 2, 1);
  L.Fill('rgba(0,0,0,0.28)', bx, fy + 1, 1, 1);
  L.Fill('rgba(0,0,0,0.28)', bx + bw - 1, fy + 1, 1, 1);
  const legCol = Mix(dark, [0, 0, 0], 0.15);
  const legH = slender ? 3 : 2;
  const legXs = [bx + 1, Math.floor(bx + bw * 0.4 + 0.5), Math.floor(bx + bw * 0.6 + 0.5), bx + bw - 2];
  for (let li = 0; li < 4; li++) {
    const pair = li === 0 || li === 3 ? 0 : 1;
    const lift = isMoving && ((ph >> (pair === 0 ? 0 : 1)) & 1) === 1;
    const h = lift ? legH - 1 : legH;
    L.Fill(RgbA(legCol), legXs[li], fy + 1 - h, 1, h);
  }
  if (bulk) for (const lx of legXs) L.Fill('#e8e0d0', lx, fy, 1, 1);
  L.Fill(RgbA(body), bx, by, bw, bh);
  L.Fill(RgbA(light), bx + 1, by, bw - 2, 1);
  L.Fill(RgbA(dark), bx + 1, by + bh - 1, bw - 2, 1);
  if (kind === 'wolf' || kind === 'snowwolf') { L.Fill(RgbA(dark), bx + 2, by, 1, 1); L.Fill(RgbA(dark), bx + 5, by, 1, 1); }
  if (kind === 'sheep') for (let i = 0; i < bw; i += 2) L.Fill(RgbA(dark), bx + i, by + 1 + ((i >> 1) & 1), 1, 1);
  if (bulk) L.Fill(RgbA(dark), bx + bw - 4, by - 1, 3, 1);
  const hx = f > 0 ? bx + bw : bx - 3;
  L.Fill(RgbA(body), hx, by - 1, 3, 3);
  L.Fill(RgbA(body), hx + (f > 0 ? 3 : -1), by, 1, 1);
  L.Fill('#14100c', hx + (f > 0 ? 3 : -1), by, 1, 1);
  L.Fill(hurt ? '#ffd93d' : '#14100c', hx + 1, by - 1, 1, 1); // C#: (f>0?1:1)
  if (kind === 'bear') { L.Fill(RgbA(dark), hx + 1, by - 2, 1, 1); L.Fill(RgbA(dark), hx + (f > 0 ? 2 : 0), by - 2, 1, 1); }
  else if (kind === 'deer') {
    L.Fill('#8a6a42', hx + 1, by - 3, 1, 2);
    L.Fill('#8a6a42', hx + (f > 0 ? 2 : 0), by - 4, 1, 3);
    L.Fill('#8a6a42', hx + (f > 0 ? 3 : -1), by - 3, 1, 1);
  } else { L.Fill(RgbA(dark), hx + 1, by - 2, 1, 1); L.Fill(RgbA(dark), hx + (f > 0 ? 2 : 0), by - 2, 1, 1); }
  if (kind === 'deer') L.Fill('#f2ead8', f > 0 ? bx : bx + bw - 2, by + 1, 2, 1);
  if (kind !== 'bear' && kind !== 'deer') {
    const tx = f > 0 ? bx - 1 : bx + bw;
    const wag = ((t >> 3) & 1) === 1 ? -1 : 0;
    const tc = kind === 'sheep' ? RgbA(dark) : RgbA(Mix(body, dark, 0.35));
    L.Fill(tc, tx, by + wag, 1, 1);
    if (kind === 'wolf' || kind === 'snowwolf') L.Fill(tc, tx - f, by + 1 + wag, 1, 1);
  } else if (kind === 'deer') L.Fill('#f2ead8', f > 0 ? bx - 1 : bx + bw, by, 1, 1);
  if (crown) {
    L.Fill('#e6ba6c', hx, by - 3, 3, 1);
    L.Fill('#e6ba6c', hx, by - 4, 1, 1);
    L.Fill('#e6ba6c', hx + 2, by - 4, 1, 1);
    L.Fill('#ffe9a8', hx + 1, by - 4, 1, 1);
  }
}

export function mrrDrawBoat(L, u, civColor, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const bob = Math.floor(frame / 9.0) % 2;
  const oy = py - bob;
  const wk = Math.floor(frame / 5.0) % 2;
  L.Fill('rgba(240,248,255,0.65)', px - 5 * f, py + 1, 3, 1);
  L.Fill('rgba(240,248,255,0.40)', px - (wk !== 0 ? 9 : 8) * f, py + 1, 3, 1);
  L.Fill(u.hurt > 0 ? '#ff6b5e' : '#6e4a2b', px - 2, oy + 1, 5, 1);
  L.Fill(u.hurt > 0 ? '#ff6b5e' : '#9c6a3c', px - 2, oy, 5, 1);
  L.Fill('#9c6a3c', px + 2 * f, oy - 1, 1, 1);
  L.Fill('#3a342c', px, oy - 3, 1, 3);
  L.Fill(civColor ? RgbA(civColor) : '#f2ead8', px + f, oy - 3, 2, 2);
  L.Fill('#f7f9fb', px + f, oy - 3, 1, 2);
  L.Fill(civColor ? RgbA(civColor) : '#ffd93d', px, oy - 4, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 2, oy - 5, 5, 1);
}

export function mrrDrawCaravan(L, u, civColor, frame) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  const bob = Math.floor(frame / 6.0) % 2;
  L.Fill('rgba(0,0,0,0.25)', px - 3, py + 2, 7, 1);
  const hx = px - 4 * f;
  L.Fill('#7a4a26', hx - 1, py - 2 + bob, 3, 2);
  L.Fill('#5b3620', hx - f, py - 3 + bob, 1, 1);
  L.Fill('#5b3620', hx - 1, py - 3 + bob, 1, 1);
  const step = Math.floor(frame / 4.0) % 2;
  L.Fill('#4a2c18', hx - 1 + step * f, py + bob, 1, 2);
  L.Fill('#4a2c18', hx + 1 - step * f, py + bob, 1, 2);
  L.Fill('#3a342c', hx + 2 * f, py - 1 + bob, 2 * f, 1);
  const cx = px + 1 * f;
  const hurt = u.hurt > 0;
  L.Fill('#3a2a1a', cx - 2, py + 1, 2, 2);
  L.Fill('#3a2a1a', cx + 1, py + 1, 2, 2);
  if (bob === 0) { L.Fill('#8a6a42', cx - 1, py + 1, 1, 1); L.Fill('#8a6a42', cx + 2, py + 2, 1, 1); }
  else { L.Fill('#8a6a42', cx - 2, py + 2, 1, 1); L.Fill('#8a6a42', cx + 1, py + 1, 1, 1); }
  L.Fill(hurt ? '#ff6b5e' : '#9c6a3c', cx - 2, py - 2, 5, 3);
  L.Fill(hurt ? '#e05a50' : '#7a4f2e', cx - 2, py, 5, 1);
  L.Fill(hurt ? '#e05a50' : '#7a4f2e', cx, py - 2, 1, 3);
  L.Fill('#d9a94e', cx - 1, py - 3, 2, 1);
  L.Fill('#e8d9b0', cx + 1, py - 3, 1, 1);
  L.Fill('#3a342c', cx - 2 * f, py - 5, 1, 3);
  L.Fill(civColor ? RgbA(civColor) : '#ffd93d', cx - 1 * f + (f < 0 ? -1 : 0), py - 5, 2, 1);
  L.Fill(civColor ? RgbA(civColor) : '#ffd93d', cx - 1 * f + (f < 0 ? -1 : 0), py - 4, 1, 1);
  if (u.hp < u.maxHp * 0.4) L.Fill('#cf3f2e', px - 3, py - 6, 6, 1);
}

export function mrrDrawSheep(L, u) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  L.Fill(u.infected !== 0 ? '#b8e2b4' : '#f2ead8', px - 1, py, 2, 1);
  L.Fill('#575757', px + f, py, 1, 1);
}
export function mrrDrawWolf(L, u) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  L.Fill(u.hurt > 0 ? '#ff6b5e' : '#8d8d8d', px - 1, py, 3, 1);
  L.Fill('#3a342c', px + f, py - 1, 1, 1);
}
export function mrrDrawSnowWolf(L, u) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  L.Fill(u.hurt > 0 ? '#ff6b5e' : '#eef2f5', px - 1, py, 3, 1);
  L.Fill('#d4dde4', px + f, py - 1, 1, 1);
  L.Fill('#d4dde4', px + f, py - 2, 1, 1);
  L.Fill('#38bdf8', px + 2 * f, py - 1, 1, 1);
}
export function mrrDrawBear(L, u) {
  const px = Px2(u), py = Py2(u);
  L.Fill(u.hurt > 0 ? '#ff6b5e' : '#6e4a2b', px - 1, py - 1, 3, 2);
  L.Fill('#3a342c', px - 1, py - 2, 1, 1);
  L.Fill('#3a342c', px + 1, py - 2, 1, 1);
}
export function mrrDrawDeer(L, u) {
  const px = Px2(u), py = Py2(u);
  const f = u.flip !== 0 ? -1 : 1;
  L.Fill('#ffd93d', px + f, py - 2, 1, 1);
  L.Fill('#ffd93d', px + 2 * f, py - 2, 1, 1);
  L.Fill(u.hurt > 0 ? '#ff6b5e' : '#c98d5a', px - 1, py, 3, 1);
  L.Fill('#6e4a2b', px + f, py - 1, 1, 1);
  L.Fill('#6e4a2b', px - 1, py + 1, 1, 1);
  L.Fill('#6e4a2b', px + 1, py + 1, 1, 1);
}

// ---------------- 主对账：黄金 128 场景逐 op 逐位 ----------------
export function runRender2Transcript() {
  const golden = JSON.parse(readFileSync(path.join(ROOT, 'scripts/unity-migration/golden/render2.json'), 'utf8'));
  let n = 0, fail = 0;
  const fails = [];
  for (const s of golden.scens) {
    const L = new MrrList();
    const inD = s.in;
    if (s.fn === 'drawTree') mrrDrawTree(L, inD.x, inD.y, inD.variant, inD.season);
    else if (s.fn === 'drawMountainProp') mrrDrawMountainProp(L, inD.x, inD.y, inD.variant, inD.elev, inD.cold);
    else if (s.fn === 'drawPerson') mrrDrawPerson(L, rebuildU(inD.u), inD.raceVis ? JSON.parse(inD.raceVis) : null, inD.civColor, inD.t);
    else if (s.fn === 'drawPersonFine') mrrDrawPersonFine(L, rebuildU(inD.u), inD.raceVis ? JSON.parse(inD.raceVis) : null, inD.civColor, inD.t, inD.crown !== 0);
    else if (s.fn === 'drawQuadFine') mrrDrawQuadFine(L, rebuildU(inD.u), inD.kind, inD.t, inD.crown !== 0);
    else if (s.fn === 'drawBoat') mrrDrawBoat(L, rebuildU(inD.u), inD.civColor, inD.frame);
    else if (s.fn === 'drawCaravan') mrrDrawCaravan(L, rebuildU(inD.u), inD.civColor, inD.frame);
    else if (s.fn === 'drawSheep') mrrDrawSheep(L, rebuildU(inD.u));
    else if (s.fn === 'drawWolf') mrrDrawWolf(L, rebuildU(inD.u));
    else if (s.fn === 'drawSnowWolf') mrrDrawSnowWolf(L, rebuildU(inD.u));
    else if (s.fn === 'drawBear') mrrDrawBear(L, rebuildU(inD.u));
    else if (s.fn === 'drawDeer') mrrDrawDeer(L, rebuildU(inD.u));
    else throw new Error('unknown fn ' + s.fn);
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

// 直接运行：node render2-transcript.mjs
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === import.meta.url.replace(/^file:\/\//, '')) {
  const r = runRender2Transcript();
  console.log(`[RENDER2 TRANSCRIPT] ${r.n - r.fail}/${r.n} 逐位 ${r.fail === 0 ? 'ALL PASS' : 'FAIL'}`);
  for (const f of r.fails.slice(0, 12)) console.error('  [FAIL]', f);
  if (r.fail > 0) process.exit(1);
}
